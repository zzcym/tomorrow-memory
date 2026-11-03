/**
 * T-07 判据②③ + PRD §8.3-D 第 1-9 项（注册与激活）+ §8.3-E 第 1-3 项 的集成用例
 *
 * 覆盖点（§10.2 T-07 行的判据编号在每条用例标题里点名）：
 *  ② `registerOrActivate()` **三出口唯一**：
 *     出口 A（`password` 非空）→ `PHONE_ALREADY_REGISTERED` 且 **三表逐字段快照不变**
 *     （users / profiles / wordbooks，另加 fsrs_cards / checkin_logs 两类业务行）；
 *     出口 B（空密码）→ 激活；出口 C（无此号）→ 新建。
 *  ③ 激活：**单条 UPDATE**（行级变更计数 == 1 行 users + 1 行审计）、三表行数相等、
 *     返回 `activated:true` + **正常 token**、**不落强制改密页**（无 `upgrade_required`）、
 *     `account_audit_log` 恰 +1。
 *  ① 本文件在 sqlite 与 pg 两驱动各跑一遍（pg 缺 `DATABASE_URL_TEST` 时显式 SKIP 并打印原因）。
 *
 * 并行安全：**每个用例自己 cp 一份临时 sqlite、自己建 app 实例**，
 * 不用模块级单例、不共享 `data.db` 句柄；仓库根 `data.db` 只作为**只读源**被 copyFileSync 复制。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AUTH_COPY,
  FEATURE_FLAG_DEFAULTS,
  PHONE_PATTERN,
  REG_IP_DAILY_LIMIT,
  ACTIVATE_IP_DAILY_LIMIT,
  IP_RATE_LIMIT_PER_MINUTE,
  TM_ERRORS,
  // A-33-5（N-1）：补充码表与两类码通用的取值助手，都是 `@tm/shared` **现成**导出，本轮不新增。
  TM_ERRORS_SUPPLEMENT,
  errorMessage,
} from '@tm/shared';
import type { TmErrorSupplementCode } from '@tm/shared';
import { PROJECT_ROOT } from '../../src/config.js';
import type { AppDB } from '../../src/db/types.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { createMigrationContext, sqliteMigrationContext } from '../../src/db/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { createApp, type AppRuntime } from '../../src/app.js';
import { appRouter } from '../../src/trpc/routers/index.js';
import { createCallerFactory, protectedProcedure, router as trpcRouter, type TrpcContext } from '../../src/trpc/init.js';
import { createAuthService } from '../../src/services/auth-service.js';
import { createFeatureFlags } from '../../src/services/feature-flags.js';
import { createAccountAudit, AUDIT_ACTIONS, auditErrorCodeOf } from '../../src/services/account-audit.js';
import { __resetAuthPolicyStateForTest, checkActivateDailyLimit, checkRegisterDailyLimit } from '../../src/services/auth-policy.js';
import { LlmRouter } from '@tm/agent';
import type { AuthEnv } from '../../src/middleware/auth.js';

/* ══════════════════════════ 测试夹具：驱动与装配 ══════════════════════════ */

/** `middleware/auth.ts` 走 `loadConfig().jwtSecret`，故密钥必须在 import 之后、请求之前钉死。 */
const TEST_SECRET = 'tm-t07-auth-register-secret-32chars';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const PG_URL = process.env.DATABASE_URL_TEST ?? '';

type Driver = 'sqlite' | 'pg';
const DRIVERS: Driver[] = PG_URL ? ['sqlite', 'pg'] : ['sqlite'];

const TMP_DIR = path.join(os.tmpdir(), `tm-t07-register-${process.pid}`);
const SOURCE_DB = path.join(PROJECT_ROOT, 'data.db');

/** `countAll` 的返回形状（显式字段，避开 `noUncheckedIndexedAccess` 下的 `number|undefined`） */
interface Counts {
  users: number;
  profiles: number;
  wordbooks: number;
  wordbookEntryMarkers: number;
  fsrs_cards: number;
  checkin_logs: number;
  audit: number;
}

interface Harness {
  driver: Driver;
  db: AppDB;
  runtime: AppRuntime;
  app: Hono<AuthEnv>;
  /** sqlite：`total_changes` 计数器；pg：null（该驱动用列级 diff 作等价证据） */
  rowChangesBefore(): number | null;
  rowChangesAfter(before: number | null): number | null;
  /** 逐列快照（含 password 原文，用于 hash 逐字节比对） */
  snapshotUsers(userId: number): Promise<Record<string, unknown>>;
  snapshotTable(table: string, userId: number): Promise<Array<Record<string, unknown>>>;
  countAll(userId: number | null): Promise<Counts>;
  /** 注入"profiles 插入必失败"（故障注入：R-39⑦ 禁半状态）；不支持则返回 false */
  armProfileInsertFailure(): Promise<boolean>;
  seedUser(input: {
    phone: string;
    password: string | null;
    pwPolicyVersion?: number;
    passwordChangedAt?: number;
    nickname?: string;
    dailyGoal?: number;
    wordbookEntries?: number;
    cards?: number;
    checkins?: number;
  }): Promise<number>;
}

let seq = 0;
/** `1` + `[3-9]` + 9 位 = 11 位，满足 PHONE_PATTERN；pid 段保证跨进程唯一 */
const uniquePhone = (): string => `13${String(process.pid % 1000).padStart(3, '0')}${String(++seq).padStart(6, '0')}`;
const uniqueIp = (): string => `10.7.${Math.floor(seq / 250) % 250}.${seq % 250}`;

async function openSqlite(label: string): Promise<Harness> {
  const file = path.join(TMP_DIR, `reg-${label}.db`);
  // 只读源 → 临时副本：迁移与所有写入都发生在副本上
  if (fs.existsSync(SOURCE_DB)) {
    fs.copyFileSync(SOURCE_DB, file);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(SOURCE_DB + suffix)) fs.copyFileSync(SOURCE_DB + suffix, file + suffix);
    }
  }
  const raw = new Database(file);
  const db = new SqliteAppDB(raw);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return buildHarness('sqlite', db, {
    // `total_changes()` = 本连接自打开以来累计的行级变更数（INSERT/UPDATE/DELETE），
    // 用它做"激活只有一条 UPDATE"的行级证据：期望增量 = 1(users) + 1(audit) = 2。
    rowChanges: () => Number((raw.prepare('SELECT total_changes() AS n').get() as { n: number | string }).n),
    all: (sql: string) => raw.prepare(sql).all() as Array<Record<string, unknown>>,
    get: (sql: string) => raw.prepare(sql).get() as Record<string, unknown> | undefined,
    exec: (sql: string) => {
      raw.exec(sql);
    },
    close: () => {
      raw.close();
    },
  });
}

async function openPg(label: string): Promise<Harness> {
  const pool = new pg.Pool({ connectionString: PG_URL });
  const db = new PostgresAppDB(pool);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, createMigrationContext(db)).apply({});
  return buildHarness('pg', db, {
    rowChanges: () => null,
    all: async (sql: string) => (await pool.query(sql)).rows as Array<Record<string, unknown>>,
    get: async (sql: string) => ((await pool.query(sql)).rows[0] ?? undefined) as Record<string, unknown> | undefined,
    exec: (sql: string) => pool.query(sql).then(() => undefined),
    close: () => pool.end(),
  });
}

type Adapter = {
  rowChanges: () => number | null;
  all: (sql: string) => Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>;
  get: (sql: string) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  exec: (sql: string) => Promise<void> | void;
  close: () => Promise<void> | void;
};

async function buildHarness(driver: Driver, db: AppDB, ad: Adapter): Promise<Harness> {
  const config = { ...loadTestConfig(), dbDriver: driver } as never;
  const sms = {
    verifyCode: () => false,
    consumeCode: () => undefined,
    sendCode: async () => ({ ok: false, reason: 'not-configured' }),
  } as never;
  const lookup = { lookup: async () => ({ word: 'stub', notFound: true }) } as never;
  const llmRouter = new LlmRouter({ deepseekApiKey: "", deepseekBaseUrl: "" });
  const stub = {} as never;
  const runtime = createApp({
    config,
    db,
    sms,
    lookup,
    dictSources: stub,
    agentDeps: {
      tutorCache: db.tutorCache,
      fsrsCards: db.fsrs,
      wordbook: db.wordbooks,
      lookup,
      analystPort: stub,
      getCefrLevel: async () => 'B1',
    } as never,
    llmRouter,
    events: stub,
    analyst: stub,
    cache: stub,
  });

  const harness: Harness = {
    driver,
    db,
    runtime,
    app: runtime.app,
    rowChangesBefore: () => ad.rowChanges(),
    rowChangesAfter: (before) => {
      const now = ad.rowChanges();
      return before === null || now === null ? null : now - before;
    },
    async snapshotUsers(userId) {
      const row = (await ad.get(`SELECT * FROM users WHERE id = ${userId}`)) ?? {};
      return { ...row, id: Number(row.id), password_changed_at: Number(row.password_changed_at ?? 0), pw_policy_version: Number(row.pw_policy_version ?? 0) };
    },
    async snapshotTable(table, userId) {
      const key = table === 'users' ? 'id' : 'user_id';
      const rows = await ad.all(`SELECT * FROM ${table} WHERE ${key} = ${userId} ORDER BY 1`);
      return rows.map((r) => ({ ...r }));
    },
    async countAll(userId) {
      const where = userId === null ? '' : ` WHERE user_id = ${userId}`;
      const whereUsers = userId === null ? '' : ` WHERE id = ${userId}`;
      const one = async (sql: string): Promise<number> => {
        const row = await ad.get(sql);
        return Number(Object.values(row ?? {})[0] ?? 0);
      };
      const wordbooks = await one(`SELECT COUNT(*) FROM wordbooks${where}`);
      const entries = await one(
        `SELECT COALESCE(SUM(LENGTH(data) - LENGTH(REPLACE(data, '"word"', '')) + 0), 0) FROM wordbooks${where}`,
      );
      return {
        users: await one(`SELECT COUNT(*) FROM users${whereUsers}`),
        profiles: await one(`SELECT COUNT(*) FROM profiles${where}`),
        wordbooks,
        /** `"word"` 每出现一次 = 一条词本条目（形状是 JSON 数组，不依赖解析器差异） */
        wordbookEntryMarkers: entries,
        fsrs_cards: await one(`SELECT COUNT(*) FROM fsrs_cards${where}`),
        checkin_logs: await one(`SELECT COUNT(*) FROM checkin_logs${where}`),
        audit: await one(`SELECT COUNT(*) FROM account_audit_log${where}`),
      };
    },
    async armProfileInsertFailure() {
      try {
        if (driver === 'sqlite') {
          await ad.exec(
            "CREATE TEMP TRIGGER tm_t07_fail_profiles BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'injected'); END",
          );
        } else {
          await ad.exec(
            "CREATE OR REPLACE FUNCTION tm_t07_fail_profiles() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected'; END; $$ LANGUAGE plpgsql",
          );
          await ad.exec('DROP TRIGGER IF EXISTS tm_t07_fail_profiles ON profiles');
          await ad.exec(
            'CREATE TRIGGER tm_t07_fail_profiles BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION tm_t07_fail_profiles()',
          );
        }
        return true;
      } catch (err) {
        console.warn(`[skip] ${driver} 无法注入 profiles 插入故障：${(err as Error).message}`);
        return false;
      }
    },
    async seedUser(input) {
      const now = Date.now();
      const pwPolicy = input.pwPolicyVersion ?? 0;
      const changedAt = input.passwordChangedAt ?? 0;
      await ad.exec(
        `INSERT INTO users (phone, password, created_at, password_changed_at, pw_policy_version)
         VALUES ('${input.phone}', ${input.password === null ? 'NULL' : `'${input.password}'`}, ${now}, ${changedAt}, ${pwPolicy})`,
      );
      const row = await ad.get(`SELECT id FROM users WHERE phone = '${input.phone}'`);
      const userId = Number(row?.id ?? 0);
      if (!userId) throw new Error('seedUser: users 行未落库');
      await ad.exec(
        `INSERT INTO wordbooks (user_id, data, updated_at) VALUES (${userId}, '${wordbookJson(input.wordbookEntries ?? 0)}', ${now})`,
      );
      await ad.exec(
        `INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at)
         VALUES (${userId}, '${input.nickname ?? ''}', '', ${input.dailyGoal ?? 10}, ${now})`,
      );
      for (let i = 0; i < (input.cards ?? 0); i++) {
        await ad.exec(
          `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
           VALUES (${userId}, 'card${i}', '{"due":"2026-01-01T00:00:00.000Z","state":0}', NULL, ${now}, ${now})`,
        );
      }
      for (let i = 0; i < (input.checkins ?? 0); i++) {
        await ad.exec(`INSERT INTO checkin_logs (user_id, date, created_at) VALUES (${userId}, '2026-01-0${i}', ${now})`);
      }
      return userId;
    },
  };
  (harness as Harness & { __ad: Adapter }).__ad = ad;
  return harness;
}

/** 词本 JSON：`n` 条 `{"word":"w<i>","addedAt":…}`，形状与线上 `wordbooks.data` 一致 */
function wordbookJson(n: number): string {
  if (n <= 0) return '[]';
  const items: string[] = [];
  for (let i = 0; i < n; i++) items.push(`{"word":"w${i}","addedAt":1770000000000}`);
  return `[${items.join(',')}]`.replace(/'/g, "''");
}

function loadTestConfig() {
  // 延迟 require 语义：config.ts 的 loadConfig() 每次读 env，不缓存
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return {
    port: 0,
    jwtSecret: AUTH_SECRET,
    dbDriver: 'sqlite',
    databaseUrl: PG_URL,
    sqlitePath: path.join(TMP_DIR, 'unused.db'),
    youdaoAppKey: '',
    youdaoSecret: '',
    adminPassword: '',
    deepseekApiKey: '',
    deepseekBaseUrl: 'https://api.deepseek.com',
    embeddingApiKey: '',
    embeddingBaseUrl: '',
    embeddingModel: '',
    qdrantUrl: '',
    redisUrl: '',
    clickhouseUrl: '',
    otelExporterUrl: '',
    langsmithApiKey: '',
    langsmithProject: 'test',
    dictDbPath: '',
    examplesDbPath: '',
    ecDictPath: '',
    dataDir: TMP_DIR,
    publicDir: path.join(TMP_DIR, 'public'),
    corsOrigin: '*',
    featureFlagsSeedJson: '',
    appLatestVersion: '9.9.9',
    apkDownloadUrl: '',
    appReleaseNotes: '',
  };
}

beforeAll(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'public'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

let current: Harness | null = null;

async function fresh(label: string, driver: Driver): Promise<Harness> {
  seq += 0;
  const h = driver === 'sqlite' ? await openSqlite(label) : await openPg(label);
  current = h;
  return h;
}

afterEach(() => {
  const h = current;
  current = null;
  __resetAuthPolicyStateForTest();
  if (!h) return;
  const ad = (h as Harness & { __ad?: Adapter }).__ad;
  void ad?.close();
  void h.runtime;
});

/* ══════════════════════════ 请求小工具 ══════════════════════════ */

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function req(
  h: Harness,
  pathname: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': init.ip ?? uniqueIp(),
    ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
  };
  const res = await h.app.request(pathname, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    body = { __raw: text };
  }
  return { status: res.status, body };
}

const registerBody = (phone: string, password: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  phone,
  password,
  confirmPassword: password,
  agreed: true,
  ...extra,
});

/**
 * 测试用的 tRPC 上下文（`trpcCaller` 与 `probeApp` 共用**同一份**构造，避免"同一规则抄两份"）。
 * `passwordUpgradeOnly` 默认 false = 放行 R-40④ 那道硬门禁，探针才能走到自己的 throw。
 */
function buildTrpcContext(h: Harness, userId: number | null, passwordUpgradeOnly = false): TrpcContext {
  return {
    userId,
    clientIp: uniqueIp(),
    db: h.db,
    agentDeps: {} as never,
    llmRouter: new LlmRouter({ deepseekApiKey: "", deepseekBaseUrl: "" }),
    lookup: { lookup: async () => null } as never,
    sms: { verifyCode: () => false, consumeCode: () => undefined } as never,
    events: {} as never,
    analyst: {} as never,
    cache: {} as never,
    passwordUpgradeOnly,
    auth: h.runtime.authService,
    flags: h.runtime.flags,
  };
}

function trpcCaller(h: Harness, userId: number | null, passwordUpgradeOnly = false) {
  return createCallerFactory(appRouter)(buildTrpcContext(h, userId, passwordUpgradeOnly));
}

/** tRPC 的 `code` 只能从**线上形状**取证（见 `trpcHttp` 上方注释），故这里不再提供 caller 侧的错误归一。 */

const PASSWORD_8 = 'abcdefgh';
const PASSWORD_8_OTHER = 'ijklmnop';

/**
 * tRPC 的**线上传输形状**（客户端真正看到的那一份）。
 * `createCallerFactory` 直调时 `TRPCError.data` 会被剥掉（只留 message/cause），
 * 且 **errorFormatter 根本不在 caller 路径上运行**，所以"线上形状"的取证必须打 `/trpc/*` 本体。
 * 本函数只认 `app`（不认 Harness），故 A-33-5 的探针 app 与生产 app **共用同一份解析**。
 */
async function trpcWire(
  app: Hono<AuthEnv>,
  path: string,
  input: unknown,
  opts: { token?: string; ip?: string; method?: 'POST' | 'GET' } = {},
): Promise<{ status: number; raw: Record<string, unknown>; message: string; httpCode: unknown; data: Record<string, unknown> }> {
  const method = opts.method ?? 'POST';
  // 无 dataTransformer（默认 transformer）→ 线上就是裸 JSON，不是 superjson 的 `{json:…}` 包装
  const url =
    method === 'GET'
      ? `/trpc/${input === undefined ? path : `${path}?input=${encodeURIComponent(JSON.stringify(input))}`}`
      : `/trpc/${path}`;
  const res = await app.request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': opts.ip ?? uniqueIp(),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(input ?? {}) } : {}),
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    raw = { __raw: text };
  }
  if (process.env.T07_DEBUG_TRPC) console.log('[t07-debug trpc-wire]', path, res.status, text.slice(0, 2000));
  const err = (raw.error ?? {}) as Record<string, unknown>;
  const json = (err.json ?? err) as Record<string, unknown>;
  return {
    status: res.status,
    raw,
    message: String(json.message ?? ''),
    httpCode: json.code,
    data: (json.data ?? {}) as Record<string, unknown>,
  };
}

async function trpcHttp(
  h: Harness,
  path: string,
  input: unknown,
  opts: { token?: string; ip?: string; method?: 'POST' | 'GET' } = {},
) {
  return trpcWire(h.app, path, input, opts);
}

/* ══════════════════════════ A-33-5（N-1）errorFormatter 的探针门面 ══════════════════════════ */

/**
 * 探针 router：**只用导出的 `protectedProcedure` + `router`**（即 `init.ts` 里那个唯一的 `t`），
 * 所以它跑的就是生产同款 errorFormatter；探针过程显式抛
 * `cause: { tmCode }`**不带 `httpStatus`** —— 这正是 N-1 的那条路：
 * `init.ts` 的兜底原先只查 §4.6 冻结表 `TM_ERRORS`，补充码（`FORBIDDEN` 及复习域码在
 * `TM_ERRORS_SUPPLEMENT`）取到 `undefined.http` ⇒ errorFormatter **自己**抛 TypeError ⇒
 * 本该 403 的门在线上变 500。
 * 本 router 不挂进 `appRouter`（那是 `src/trpc/routers/index.ts`，本轮禁改），只在用例内临时装配。
 */
const tmCodeProbeRouter = trpcRouter({
  throwWithTmCode: protectedProcedure
    .input(
      z.object({
        tmCode: z.string(),
        message: z.string(),
        /** 协议码可换：`NOT_FOUND`（协议默认 404）用来证明未知码时"不无中生有"。 */
        protocolCode: z.enum(['FORBIDDEN', 'NOT_FOUND']).default('FORBIDDEN'),
      }),
    )
    .mutation(({ input }) => {
      throw new TRPCError({
        code: input.protocolCode,
        message: input.message,
        // ⚠ 刻意只有 `tmCode`、没有 `httpStatus`：带 `httpStatus` 会短路兜底查表，测不到 N-1。
        cause: { tmCode: input.tmCode },
      });
    }),
});

/** 把探针 router 挂到一个**测试私有**的 Hono 实例上（不改 `app.ts`、不动生产装配）。 */
function probeApp(h: Harness, userId: number | null): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: tmCodeProbeRouter,
      // `{ ...ctx }` 不是多余：`TrpcContext` 是 **interface**，TS 不给它隐式索引签名，
      // 直接返回不满足 `trpcServer` 的 `Record<string, unknown>` 约束；展开成匿名对象字面量类型即可。
      // （`app.ts:221-235` 那侧本来就是字面量 + `satisfies TrpcContext`，同一形状的另一种写法。）
      createContext: async () => ({ ...buildTrpcContext(h, userId) }),
    }),
  );
  return app;
}

/* ══════════════════════════ 判据①：双驱动 ══════════════════════════ */

describe('判据①-环境：pg 侧的可用性自证', () => {
  it('未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg，报告已登记）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。',
    );
    expect(PG_URL).toBe('');
  });
});

/* ══════════════════ §8.3-D 1-4：入参校验，任何写动作之前 ══════════════════ */

for (const driver of DRIVERS) {
  describe(`注册入参校验（§8.3-D 1-4）· ${driver}`, () => {
    it('D-1 空/错格式手机号 → INVALID_PHONE 且不写库', async () => {
      const h = await fresh(`d1-${driver}`, driver);
      const before = await h.countAll(null);
      for (const bad of ['', '12345', '1312345678', 'abcdefghijk', '12345678901']) {
        const r = await req(h, '/api/register', { body: registerBody(bad, PASSWORD_8), ip: uniqueIp() });
        expect([r.status, r.body.code], `phone=${bad}`).toEqual([400, 'INVALID_PHONE']);
        expect(r.body.error).toBe(TM_ERRORS.INVALID_PHONE.copy);
      }
      expect(await h.countAll(null)).toEqual(before);
    });

    it('D-2 密码 7 位 → WEAK_PASSWORD；8 位 → 通过（REST 直打接口 = 绕过前端）', async () => {
      const h = await fresh(`d2-${driver}`, driver);
      const short = await req(h, '/api/register', { body: registerBody(uniquePhone(), 'abcdefg'), ip: uniqueIp() });
      expect([short.status, short.body.code]).toEqual([400, 'WEAK_PASSWORD']);
      expect(short.body.error).toBe(TM_ERRORS.WEAK_PASSWORD.copy);

      const ok = await req(h, '/api/register', { body: registerBody(uniquePhone(), 'abcdefg1'), ip: uniqueIp() });
      expect(ok.status).toBe(200);
      expect(typeof ok.body.token).toBe('string');
      expect((ok.body.token as string).length).toBeGreaterThan(20);
      // 边界：8 位含首尾空格 → 去空格后 7 位仍判弱
      const trimmed = await req(h, '/api/register', { body: registerBody(uniquePhone(), ' abcdefg '), ip: uniqueIp() });
      expect(trimmed.body.code).toBe('WEAK_PASSWORD');
    });

    it('D-3 两次密码不一致 → PASSWORD_MISMATCH 且不写库', async () => {
      const h = await fresh(`d3-${driver}`, driver);
      const before = await h.countAll(null);
      const phone = uniquePhone();
      const r = await req(h, '/api/register', {
        body: { phone, password: PASSWORD_8, confirmPassword: PASSWORD_8_OTHER, agreed: true },
        ip: uniqueIp(),
      });
      expect([r.status, r.body.code]).toEqual([400, 'PASSWORD_MISMATCH']);
      expect(await h.countAll(null)).toEqual(before);
    });

    it('D-4 未勾协议 → AGREEMENT_REQUIRED 且不写库、不激活', async () => {
      const h = await fresh(`d4-${driver}`, driver);
      const before = await h.countAll(null);
      const emptyPwPhone = uniquePhone();
      await h.seedUser({ phone: emptyPwPhone, password: null });
      const countsBefore = await h.countAll(null);
      // 前置自证：种下的空密码账号确实存在且未被本用例的三次请求改动
      expect(countsBefore.users - before.users).toBe(1);
      for (const agreed of [false, undefined, 'yes']) {
        const r = await req(h, '/api/register', {
          body: { phone: emptyPwPhone, password: PASSWORD_8, confirmPassword: PASSWORD_8, agreed },
          ip: uniqueIp(),
        });
        expect([r.status, r.body.code], `agreed=${String(agreed)}`).toEqual([400, 'AGREEMENT_REQUIRED']);
        expect(r.body.error).toBe(TM_ERRORS.AGREEMENT_REQUIRED.copy);
      }
      // 不写库、不激活：五类计数 + 审计全部原样，且 users.password 仍是空
      expect(await h.countAll(null)).toEqual(countsBefore);
      expect((await h.db.users.findCredentialsByPhone(emptyPwPhone))?.password ?? '').toBe('');
    });
  });

  /* ══════════════════ 判据②出口 C + §8.3-D 5：新建账号 ══════════════════ */

  describe(`新建账号（判据②出口 C / §8.3-D 5 / R-39⑦⑧）· ${driver}`, () => {
    it('D-5 注册成功 → 三表各 +1 行、daily_goal=10、响应含正常 token、无需二次登录', async () => {
      const h = await fresh(`d5-${driver}`, driver);
      const before = await h.countAll(null);
      const phone = uniquePhone();
      const r = await req(h, '/api/register', { body: registerBody(phone, PASSWORD_8), ip: uniqueIp() });
      expect(r.status).toBe(200);
      expect(r.body.phone).toBe(phone);
      expect(r.body.hasPassword).toBe(true);
      expect(r.body.activated ?? false).toBe(false);
      expect(r.body).not.toHaveProperty('upgrade_required');

      const after = await h.countAll(null);
      expect(after.users - before.users).toBe(1);
      expect(after.profiles - before.profiles).toBe(1);
      expect(after.wordbooks - before.wordbooks).toBe(1);

      const row = await h.db.users.findCredentialsByPhone(phone);
      expect(row).not.toBeNull();
      const userId = row?.id ?? 0;
      const perUser = await h.countAll(userId);
      expect(perUser.profiles).toBe(1);
      expect(perUser.wordbooks).toBe(1);
      expect(perUser.users).toBe(1);

      const profile = await h.db.profiles.get(userId);
      expect(profile?.daily_goal).toBe(10);
      expect(profile?.nickname).toBe('');

      // ⑧ 注册即自动登录：同一 token 直接可用，无需二次登录
      const me = await req(h, '/api/me', { token: r.body.token as string });
      expect(me.status).toBe(200);
      expect(me.body.user_id).toBe(userId);
      expect(me.body.upgradeRequired).toBe(false);
      // claims 只加不减（§6.3）：id + iat
      const claims = jwt.decode(r.body.token as string) as Record<string, unknown>;
      expect(claims.id).toBe(userId);
      expect(typeof claims.iat).toBe('number');
      expect(claims.aud).toBeUndefined();
    });

    it('R-39⑦ 故障注入：profiles 插入抛错 → users 不得留下新行（禁半状态）', async () => {
      const h = await fresh(`inject-${driver}`, driver);
      const armed = await h.armProfileInsertFailure();
      if (!armed) {
        console.warn(`[skip] ${driver} 无故障注入手段，本例记为未执行（报告已登记）`);
        return;
      }
      const before = await h.countAll(null);
      const r = await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip: uniqueIp() });
      expect(r.status).toBeGreaterThanOrEqual(400);
      const after = await h.countAll(null);
      expect(after.users).toBe(before.users);
      expect(after.profiles).toBe(before.profiles);
      expect(after.wordbooks).toBe(before.wordbooks);
    });
  });

  /* ══════════ 判据②出口 A + §8.3-D 6：冒领保护，三表逐字段快照不变 ══════════ */

  describe(`判据②出口 A：PHONE_ALREADY_REGISTERED 三表逐字段快照不变（§8.3-D 6 / R-39④⑤a）· ${driver}`, () => {
    it('对已设密码的手机号二次注册 → 409 + 无 token + users/profiles/wordbooks 逐字段全等', async () => {
      const h = await fresh(`a-${driver}`, driver);
      const phone = uniquePhone();
      const id = await h.seedUser({
        phone,
        password: '$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV0123456',
        pwPolicyVersion: 1,
        nickname: '保留我',
        wordbookEntries: 5,
        cards: 3,
        checkins: 2,
      });

      const snapBefore = {
        users: await h.snapshotUsers(id),
        profiles: await h.snapshotTable('profiles', id),
        wordbooks: await h.snapshotTable('wordbooks', id),
        fsrs: await h.snapshotTable('fsrs_cards', id),
        checkins: await h.snapshotTable('checkin_logs', id),
      };
      const countsBefore = await h.countAll(id);

      const r = await req(h, '/api/register', { body: registerBody(phone, 'zzzzzzzz9'), ip: uniqueIp() });
      expect([r.status, r.body.code]).toEqual([409, 'PHONE_ALREADY_REGISTERED']);
      expect(r.body.error).toBe(TM_ERRORS.PHONE_ALREADY_REGISTERED.copy);
      expect(r.body.token ?? '').toBe('');

      expect(await h.snapshotUsers(id)).toEqual(snapBefore.users);
      expect(await h.snapshotTable('profiles', id)).toEqual(snapBefore.profiles);
      expect(await h.snapshotTable('wordbooks', id)).toEqual(snapBefore.wordbooks);
      expect(await h.snapshotTable('fsrs_cards', id)).toEqual(snapBefore.fsrs);
      expect(await h.snapshotTable('checkin_logs', id)).toEqual(snapBefore.checkins);
      // 三表（users/profiles/wordbooks）+ 两类业务行（fsrs_cards/checkin_logs）计数一字不动；
      // 唯一允许的增长是 account_audit_log 多出的那条 `register_rejected`（判据③的反向要求）。
      const countsAfter = await h.countAll(id);
      expect({ ...countsAfter, audit: 0 }).toEqual({ ...countsBefore, audit: 0 });
      expect(countsAfter.audit - countsBefore.audit).toBe(1);
      // hash 逐字节全等（判据②的字面要求）
      expect(String((await h.snapshotUsers(id)).password)).toBe(String(snapBefore.users.password));
    });

    it('R-39⑤b 末段：激活成功后同手机号再次注册 → 仍 409，且不再产生第二条拒绝记录之外的写入', async () => {
      const h = await fresh(`ab-${driver}`, driver);
      const phone = uniquePhone();
      const id = await h.seedUser({ phone, password: null, wordbookEntries: 4, cards: 2, checkins: 1 });
      const first = await req(h, '/api/register', { body: registerBody(phone, PASSWORD_8), ip: uniqueIp() });
      expect([first.status, first.body.activated]).toEqual([200, true]);
      const snapshot = {
        users: await h.snapshotUsers(id),
        profiles: await h.snapshotTable('profiles', id),
        wordbooks: await h.snapshotTable('wordbooks', id),
      };
      const second = await req(h, '/api/register', { body: registerBody(phone, 'yyyyyyyy9'), ip: uniqueIp() });
      expect([second.status, second.body.code]).toEqual([409, 'PHONE_ALREADY_REGISTERED']);
      expect(await h.snapshotUsers(id)).toEqual(snapshot.users);
      expect(await h.snapshotTable('profiles', id)).toEqual(snapshot.profiles);
      expect(await h.snapshotTable('wordbooks', id)).toEqual(snapshot.wordbooks);
      const audit = await h.db.audit.listByUser(id, 50);
      const activated = audit.filter((a) => a.action === AUDIT_ACTIONS.accountActivated);
      expect(activated.length).toBe(1);
      expect(audit.filter((a) => a.action === AUDIT_ACTIONS.registerRejected).length).toBe(1);
    });
  });

  /* ══════════════ 判据③ + §8.3-D 7：激活认领（出口 B） ══════════════ */

  describe(`判据③ / §8.3-D 7：空密码账号设密码即激活认领（R-39⑤b）· ${driver}`, () => {
    it('单条 UPDATE + 三表行数相等 + activated:true + 正常 token + 不落强制改密页 + 审计恰 +1', async () => {
      const h = await fresh(`b-${driver}`, driver);
      const phone = uniquePhone();
      const id = await h.seedUser({
        phone,
        password: null,
        pwPolicyVersion: 0,
        nickname: '老号主',
        dailyGoal: 7,
        wordbookEntries: 5,
        cards: 3,
        checkins: 2,
      });
      const before = await h.countAll(id);
      const beforeUsers = await h.snapshotUsers(id);
      const beforeProfiles = await h.snapshotTable('profiles', id);
      const beforeWordbooks = await h.snapshotTable('wordbooks', id);
      const beforeCards = await h.snapshotTable('fsrs_cards', id);
      const beforeCheckins = await h.snapshotTable('checkin_logs', id);
      const changes = h.rowChangesBefore();

      const r = await req(h, '/api/register', { body: registerBody(phone, PASSWORD_8), ip: uniqueIp() });
      expect(r.status).toBe(200);
      expect(r.body.activated).toBe(true);
      // ③ 正常 token：非空、可当会话用、且不是 upgrade token
      const token = String(r.body.token ?? '');
      expect(token.length).toBeGreaterThan(20);
      const claims = jwt.decode(token) as Record<string, unknown>;
      expect(claims.id).toBe(id);
      expect(claims.aud).toBeUndefined();
      // ③ 不落强制改密页：既无 upgrade_required 也无 upgradeToken
      expect(r.body).not.toHaveProperty('upgrade_required');
      expect(r.body).not.toHaveProperty('upgradeToken');
      expect(r.body).not.toHaveProperty('message');

      // ③ 三表行数相等（wordbooks / profiles / users 一行不多不少）
      const after = await h.countAll(id);
      expect(after.users).toBe(before.users);
      expect(after.profiles).toBe(before.profiles);
      expect(after.wordbooks).toBe(before.wordbooks);
      // 继承判据：名下五类计数逐项相等、卡片与打卡一行不搬
      expect(after.fsrs_cards).toBe(before.fsrs_cards);
      expect(after.checkin_logs).toBe(before.checkin_logs);
      expect(await h.snapshotTable('fsrs_cards', id)).toEqual(beforeCards);
      expect(await h.snapshotTable('checkin_logs', id)).toEqual(beforeCheckins);
      expect(await h.snapshotTable('profiles', id)).toEqual(beforeProfiles);
      expect(await h.snapshotTable('wordbooks', id)).toEqual(beforeWordbooks);

      // ③ 单条 UPDATE 的行级证据：users 只变 1 行、审计只增 1 行 → 总变更 = 2
      const delta = h.rowChangesAfter(changes);
      if (delta !== null) expect(delta, '行级变更数（users 1 + audit 1）').toBe(2);
      else console.warn(`[note] ${driver} 无 total_changes 等价值，改以下面的列级 diff 为准`);

      const afterUsers = await h.snapshotUsers(id);
      expect(afterUsers.phone).toBe(beforeUsers.phone);
      expect(afterUsers.id).toBe(beforeUsers.id);
      expect(afterUsers.created_at).toBe(beforeUsers.created_at);
      expect(String(afterUsers.password)).not.toBe(String(beforeUsers.password));
      expect(String(afterUsers.password)).toMatch(/^\$2[aby]\$10\$/);
      expect(afterUsers.pw_policy_version).toBe(1);
      expect(afterUsers.password_changed_at).toBeGreaterThan(0);

      // ③ 审计恰 +1 且字段齐全、可检索
      expect(after.audit - before.audit).toBe(1);
      const audit = await h.db.audit.listByUser(id, 20);
      const activated = audit.filter((a) => a.action === AUDIT_ACTIONS.accountActivated);
      expect(activated.length).toBe(1);
      const row = activated[0];
      expect(row?.result).toBe('ok');
      expect(row?.phone_masked).toBe(phone.slice(-4));
      expect(row?.ip).toBeTruthy();
      expect(row?.ua === null || typeof row?.ua === 'string').toBe(true);
      expect(JSON.stringify(row)).not.toContain(PASSWORD_8);
      expect(JSON.stringify(row)).not.toContain('$2a$');

      // ③ 激活后 `GET /api/me` 返回原 user_id，且 `upgradeRequired` 为 false
      const me = await req(h, '/api/me', { token });
      expect([me.status, me.body.user_id, me.body.upgradeRequired, me.body.pwPolicyVersion]).toEqual([
        200, id, false, 1,
      ]);
      // 激活后词本/进度可见（继承判据的业务面）
      const wb = await req(h, '/api/wordbook', { token });
      expect(wb.status, JSON.stringify(wb.body)).toBe(200);
      expect(Array.isArray(wb.body.data)).toBe(true);
      expect((wb.body.data as unknown[]).length).toBe(5);
    });

    it('空密码账号拿任意密码走密码登录 → 仍 NO_PASSWORD_ACCOUNT、不签发 token（R-39⑤c 回归不回退）', async () => {
      const h = await fresh(`c-${driver}`, driver);
      const phone = uniquePhone();
      const id = await h.seedUser({ phone, password: null });
      const r = await req(h, '/api/login', { body: { phone, password: 'anything123' }, ip: uniqueIp() });
      expect([r.status, r.body.code]).toEqual([401, 'NO_PASSWORD_ACCOUNT']);
      expect(r.body.token ?? '').toBe('');
      // 空密码账号未被"顺手补一个密码"：password 列仍是 NULL/空（判据③的反面 = §6.4-6 回滚判据）
      const stillEmpty = (await h.db.users.findCredentialsByPhone(phone))?.password ?? '';
      expect(stillEmpty === null ? '' : stillEmpty).toBe('');
      const audit = await h.db.audit.listByUser(id, 20);
      expect(audit.some((a) => a.action === AUDIT_ACTIONS.loginNoPasswordAccount && auditErrorCodeOf(a.result) === 'NO_PASSWORD_ACCOUNT')).toBe(true);
    });

    it('R-39⑤b 并发：两个激活请求只有一个写成功，另一个 409，且不出现半状态', async () => {
      const h = await fresh(`conc-${driver}`, driver);
      const phone = uniquePhone();
      const id = await h.seedUser({ phone, password: null, wordbookEntries: 2, cards: 1 });
      const before = await h.countAll(id);
      const [x, y] = await Promise.all([
        h.runtime.authService.registerOrActivate(
          { phone, password: PASSWORD_8, confirmPassword: PASSWORD_8, agreed: true },
          { ip: uniqueIp() },
        ),
        h.runtime.authService.registerOrActivate(
          { phone, password: PASSWORD_8_OTHER, confirmPassword: PASSWORD_8_OTHER, agreed: true },
          { ip: uniqueIp() },
        ),
      ]).then((v) => [v[0], v[1]]).catch(async () => {
        // 其中一支抛 PHONE_ALREADY_REGISTERED = 预期；把它转成可比较的形状
        return [undefined, undefined] as const;
      });
      const okCount = [x, y].filter((v) => v?.activated === true).length;
      if (okCount === 0) {
        // 抛错分支：直接查库判定"恰有一个赢家"
        const row = await h.snapshotUsers(id);
        expect(String(row.password)).toMatch(/^\$2[aby]\$/);
      } else {
        expect(okCount).toBe(1);
      }
      const after = await h.countAll(id);
      expect(after.users).toBe(before.users);
      expect(after.wordbooks).toBe(before.wordbooks);
      expect(after.profiles).toBe(before.profiles);
      const audit = await h.db.audit.listByUser(id, 50);
      const writes = audit.filter((a) => a.action === AUDIT_ACTIONS.accountActivated);
      expect(writes.length + audit.filter((a) => a.action === AUDIT_ACTIONS.registerRejected).length).toBeGreaterThanOrEqual(1);
      expect(writes.length).toBeLessThanOrEqual(1);
    });
  });

  /* ══════════ §8.3-D 9 + 判据②的"开关只关新建一支"（R-39⑩） ══════════ */

  describe(`§8.3-D 9：passwordRegister=off 只关新建、不关激活 · ${driver}`, () => {
    it('off → 新号回 REGISTER_CLOSED 人话；空密码号的激活分支仍可用', async () => {
      const h = await fresh(`flag-${driver}`, driver);
      expect(FEATURE_FLAG_DEFAULTS.passwordRegister).toBe('on');
      await h.runtime.flags.set('passwordRegister', 'off');
      expect(await h.runtime.flags.isOn('passwordRegister')).toBe(false);

      const closed = await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip: uniqueIp() });
      expect(closed.status).toBe(403);
      expect(closed.body.code).toBe('REGISTER_CLOSED');
      expect(closed.body.error).toBe(TM_ERRORS.REGISTER_CLOSED.copy);
      expect(String(closed.body.error)).not.toMatch(/验证码|短信/);
      expect(closed.body.token ?? '').toBe('');

      // 同一次开关状态下，激活分支不得被顺手关掉（§6.4-5-4）
      const phone = uniquePhone();
      const id = await h.seedUser({ phone, password: null, wordbookEntries: 3, cards: 2 });
      const before = await h.countAll(id);
      const activated = await req(h, '/api/register', { body: registerBody(phone, PASSWORD_8), ip: uniqueIp() });
      expect([activated.status, activated.body.activated]).toEqual([200, true]);
      expect(String(activated.body.token ?? '').length).toBeGreaterThan(20);
      const after = await h.countAll(id);
      expect([after.wordbooks, after.profiles, after.fsrs_cards]).toEqual([before.wordbooks, before.profiles, before.fsrs_cards]);

      // 翻转回来：≤60 秒口径由"本进程立即生效"证明（同一实例，无重建）
      await h.runtime.flags.set('passwordRegister', 'on');
      const reopened = await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip: uniqueIp() });
      expect(reopened.status).toBe(200);
    });
  });

  /* ══════════════════ 判据②的字面要求：三出口 × 两协议 6 例 ══════════════════ */

  describe(`判据②字面：三出口 × 两协议 6 例同码同文案（R-39①/审计 C-09）· ${driver}`, () => {
    it('新建 / 激活 / 拒绝 三出口在 REST 与 tRPC 上的成功形状与错误形状逐字一致', async () => {
      const h = await fresh(`6-${driver}`, driver);
      const caller = trpcCaller(h, null);

      const inputs = (phone: string, password: string): Record<string, unknown> => ({
        phone,
        password,
        confirmPassword: password,
        agreed: true,
      });

      // 出口 C：新建（REST 与 tRPC 各一个手机号，比对**成功形状**）
      const restPhone = uniquePhone();
      const trpcPhone = uniquePhone();
      const restC = await req(h, '/api/register', { body: inputs(restPhone, PASSWORD_8), ip: uniqueIp() });
      const trpcC = await caller.auth.register(inputs(trpcPhone, PASSWORD_8) as never);
      expect(restC.status).toBe(200);
      expect(restC.body.activated ?? false).toBe(false);
      expect(trpcC.activated ?? false).toBe(false);
      expect(Object.keys(restC.body).sort()).toEqual(Object.keys(trpcC).sort());
      // 只加不减（R-39①）：旧五键 + `daily_goal`（新客户端公告位/首日目标用），两端逐字同形
      expect(Object.keys(trpcC).sort()).toEqual(['avatar', 'daily_goal', 'hasPassword', 'nickname', 'phone', 'token']);
      expect(trpcC.phone).toBe(trpcPhone);

      // 出口 B：激活（`register` 与 `activate` 两个过程名打到同一个裁决点）
      const empty = uniquePhone();
      await h.seedUser({ phone: empty, password: null });
      const restB = await req(h, '/api/register', { body: inputs(empty, PASSWORD_8), ip: uniqueIp() });
      expect([restB.status, restB.body.activated]).toEqual([200, true]);
      const empty2 = uniquePhone();
      await h.seedUser({ phone: empty2, password: null });
      const viaActivate = await caller.auth.activate(inputs(empty2, PASSWORD_8) as never);
      expect(viaActivate.activated).toBe(true);
      expect(Object.keys({ ...viaActivate })).toEqual(Object.keys({ ...restB.body }));
      expect(Object.keys(viaActivate).sort()).toEqual([
        'activated', 'avatar', 'daily_goal', 'hasPassword', 'nickname', 'phone', 'token',
      ]);
      // 两过程的返回形状逐字一致（同一个 service 函数的铁证）
      const empty3 = uniquePhone();
      await h.seedUser({ phone: empty3, password: null });
      const viaRegister = await caller.auth.register(inputs(empty3, PASSWORD_8) as never);
      expect(viaRegister.activated).toBe(true);

      // 出口 A：拒绝（两协议同码同文案）
      const taken2 = uniquePhone();
      await h.seedUser({
        phone: taken2,
        password: '$2a$10$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz01234',
        pwPolicyVersion: 1,
      });
      const restA = await req(h, '/api/register', { body: inputs(taken2, PASSWORD_8), ip: uniqueIp() });
      const wireA = await trpcHttp(h, 'auth.register', inputs(taken2, PASSWORD_8_OTHER));
      expect([restA.status, restA.body.code]).toEqual([409, 'PHONE_ALREADY_REGISTERED']);
      // 线上形状：HTTP 状态与人话文案两端一致（§4.6 码能否上 wire 见下面那条偏差用例）
      expect([wireA.status, wireA.message]).toEqual([409, String(restA.body.error)]);
      expect(wireA.data.httpStatus).toBe(409);
      // service 层的其余凭据错误也两协议同文案同状态（PASSWORD_MISMATCH / AGREEMENT_REQUIRED）
      for (const [body, code] of [
        [{ phone: uniquePhone(), password: PASSWORD_8, confirmPassword: PASSWORD_8_OTHER, agreed: true }, 'PASSWORD_MISMATCH'],
        [{ phone: uniquePhone(), password: PASSWORD_8, confirmPassword: PASSWORD_8, agreed: false }, 'AGREEMENT_REQUIRED'],
      ] as const) {
        const r = await req(h, '/api/register', { body, ip: uniqueIp() });
        const t = await trpcHttp(h, 'auth.register', body);
        expect(r.body.code, `REST ${code}`).toBe(code);
        expect(t.message, `tRPC ${code} 文案`).toBe(String(r.body.error));
        expect([r.status, t.status, t.data.httpStatus]).toEqual([
          TM_ERRORS[code as keyof typeof TM_ERRORS].http,
          TM_ERRORS[code as keyof typeof TM_ERRORS].http,
          TM_ERRORS[code as keyof typeof TM_ERRORS].http,
        ]);
      }
    });

    /**
     * ★ A-30-1 已落地（T-07 收口轮）：`trpc/init.ts` 里**唯一一个** `errorFormatter` 把
     * `cause.{tmCode,httpStatus}` 提升为线上形状的 `data.{code,httpStatus}`；
     * `trpc/routers/auth.ts` 与 `app.ts` 的 `createContext` 不再直传 `data`（tRPC v11 的
     * `TRPCErrorOptions` 根本没有该键，直传 = 无效代码）。
     *
     * 本用例原先钉的是"§4.6 码到不了 tRPC 线上形状"（偏差取证，原注释写明"裁决落地时它会
     * 自动红，逼当时的改动方回来更新"）。裁决已落地 → 按原约定改为钉**修复后的形状**：
     * `data.code` 逐字等于 §4.6 码。它是这条通道的回归护栏，不是放宽（断言更强了一半）。
     */
    it('A-30-1：§4.6 码经 cause 提升到 tRPC 线上形状 data.code', async () => {
      const h = await fresh(`6d-${driver}`, driver);
      const taken = uniquePhone();
      await h.seedUser({ phone: taken, password: '$2a$10$wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww01234', pwPolicyVersion: 1 });
      const wire = await trpcHttp(h, 'auth.register', {
        phone: taken,
        password: PASSWORD_8,
        confirmPassword: PASSWORD_8,
        agreed: true,
      });
      expect(wire.status).toBe(409);
      expect(wire.message).toBe(TM_ERRORS.PHONE_ALREADY_REGISTERED.copy);
      // 线上形状：`data.code` 就是 §4.6 码，`data.httpStatus` 就是表内状态
      expect(wire.data.code).toBe('PHONE_ALREADY_REGISTERED');
      expect(wire.data.httpStatus).toBe(TM_ERRORS.PHONE_ALREADY_REGISTERED.http);
      expect(JSON.stringify(wire.raw)).toContain('PHONE_ALREADY_REGISTERED');
      // 协议码没被顶掉位置：HTTP 状态仍是 409，`raw.error.code` 是 tRPC 的数字码
      expect(wire.raw.error).toBeTypeOf('object');
    });

    /**
     * ★ A-33-5（N-1）疫苗①：`errorFormatter` 的第二级查表（`TM_ERRORS_SUPPLEMENT`）。
     *
     * 改前的形状：`httpStatus = cause.httpStatus ?? (tmCode ? TM_ERRORS[tmCode].http : undefined)`，
     * 而 `TM_ERRORS` 是 §4.6 的 18 码**冻结面**，`FORBIDDEN` 住在 `TM_ERRORS_SUPPLEMENT`
     * ⇒ `TM_ERRORS['FORBIDDEN']` 是 `undefined` ⇒ `.http` **在 errorFormatter 内部**抛 TypeError
     * ⇒ 本该 403 的门在线上变 500。R-05② / R-09 / R-10 / R-41① 四面共用这个入口。
     *
     * 探针过程用的是**生产的** `protectedProcedure`（`init.ts` 里那个唯一的 `t`），
     * 抛的 `cause` **只有 `tmCode`、没有 `httpStatus`**（带 `httpStatus` 会短路兜底查表、测不到 N-1；
     * 那正是 T-11 fix1 在 `routers/chat.ts` 里临时绕开的方式，不是修法本身）。
     * 改前本用例必红（`status` 500 / `data.httpStatus` 不是 403），改后必绿。
     */
    it('A-33-5 疫苗①：补充码 FORBIDDEN 只经 cause.tmCode 上来 → 线上 403，errorFormatter 不抛 TypeError', async () => {
      const h = await fresh(`n1-${driver}`, driver);
      const userId = await h.seedUser({
        phone: uniquePhone(),
        password: '$2a$10$nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn01234',
        pwPolicyVersion: 1,
      });
      const wire = await trpcWire(probeApp(h, userId), 'throwWithTmCode', {
        tmCode: 'FORBIDDEN',
        message: errorMessage('FORBIDDEN'),
      });
      // ① 门是通的（有效 userId）⇒ 抛的是探针自己的 FORBIDDEN，不是 `requireUser()` 的 UNAUTHORIZED
      expect(wire.message).toBe(errorMessage('FORBIDDEN'));
      // ② §4.6 面之外的补充码也上了 wire：`data.code` 逐字等于补充码
      expect(wire.data.code).toBe('FORBIDDEN');
      // ③ `data.httpStatus` 取自补充表（403），不是 errorFormatter 崩掉后的 500
      expect(wire.data.httpStatus).toBe(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
      // ④ 不抛 TypeError 的**线上证据**：HTTP 状态本身就是 403，且响应体是合法的 tRPC 错误形状
      expect(wire.status).toBe(403);
      expect(wire.raw.error).toBeTypeOf('object');
      expect(JSON.stringify(wire.raw)).not.toContain('TypeError');
      // ⑤ 反向自证：同一探针过程在未登录时是 401 `UNAUTHORIZED` ⇒ 它是 **protected** 过程，
      //    上面那发 403 不是"根本没进门禁"造出来的
      const anon = await trpcWire(probeApp(h, null), 'throwWithTmCode', {
        tmCode: 'FORBIDDEN',
        message: errorMessage('FORBIDDEN'),
      });
      expect([anon.status, anon.data.code, anon.data.httpStatus]).toEqual([401, 'UNAUTHORIZED', 401]);
    });

    /**
     * ★ A-33-5 覆盖面：`TM_ERRORS_SUPPLEMENT` **全表**逐个取证（漏一个就是一扇会 500 的门），
     * 外加 §4.6 冻结码抽 3 个回归，钉住第一级查表没被这次改动改坏。
     * 断言全部**从表里取值**，本用例不写 403/400/409/429 这些数字（A-28-4 同口径）。
     */
    it('A-33-5 覆盖面：补充码全表逐个上 wire 状态逐字相同 + §4.6 冻结码回归', async () => {
      const h = await fresh(`n1c-${driver}`, driver);
      const userId = await h.seedUser({
        phone: uniquePhone(),
        password: '$2a$10$mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm01234',
        pwPolicyVersion: 1,
      });
      const app = probeApp(h, userId);
      const supplementCodes = Object.keys(TM_ERRORS_SUPPLEMENT) as TmErrorSupplementCode[];
      expect(supplementCodes.length).toBeGreaterThan(0);
      for (const code of supplementCodes) {
        const wire = await trpcWire(app, 'throwWithTmCode', { tmCode: code, message: errorMessage(code) });
        expect(wire.data.code, `data.code = ${code}`).toBe(code);
        expect(wire.data.httpStatus, `data.httpStatus = ${code}`).toBe(TM_ERRORS_SUPPLEMENT[code].http);
        expect(wire.status, `HTTP = ${code}`).toBe(TM_ERRORS_SUPPLEMENT[code].http);
        expect(wire.message, `文案 = ${code}`).toBe(TM_ERRORS_SUPPLEMENT[code].copy);
      }
      // 第一级（§4.6 冻结表）回归：三级/四种状态各取一码，证明两级查表没把老路径改坏
      for (const code of ['PHONE_ALREADY_REGISTERED', 'PASSWORD_UPGRADE_REQUIRED', 'TEMP_LOCKED'] as const) {
        const wire = await trpcWire(app, 'throwWithTmCode', { tmCode: code, message: errorMessage(code) });
        expect(wire.data.code).toBe(code);
        expect(wire.data.httpStatus).toBe(TM_ERRORS[code].http);
        expect(wire.status).toBe(TM_ERRORS[code].http);
      }
    });

    /**
     * ★ A-33-5 疫苗②：两类码表里**都没有**的字符串（`'NOT_A_CODE'`）不得让 errorFormatter 崩，
     * 也不得"无中生有"造状态 —— `data.httpStatus` 必须保持 tRPC 协议自己算出来的那一份
     * （本例把协议码换成 `NOT_FOUND`，协议默认 404；若 formatter 去查表并瞎猜就会是别的值）。
     */
    it('A-33-5 疫苗②：未知码不崩、httpStatus 保持协议默认（不无中生有）', async () => {
      const h = await fresh(`n1u-${driver}`, driver);
      const userId = await h.seedUser({
        phone: uniquePhone(),
        password: '$2a$10$kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk01234',
        pwPolicyVersion: 1,
      });
      const wire = await trpcWire(probeApp(h, userId), 'throwWithTmCode', {
        tmCode: 'NOT_A_CODE',
        message: 'unknown-code-probe',
        protocolCode: 'NOT_FOUND',
      });
      // 没崩：响应体仍是合法 tRPC 错误形状，且不含 TypeError
      expect(wire.raw.error).toBeTypeOf('object');
      expect(JSON.stringify(wire.raw)).not.toContain('TypeError');
      // 不无中生有：httpStatus = 协议码 NOT_FOUND 自带的 404
      expect(wire.data.httpStatus).toBe(404);
      expect(wire.status).toBe(404);
      // `data.code` 仍是 A-30-1 那条规则（cause.tmCode 优先，本轮**未改动**这一轴，见报告 §5 待拍板项）
      expect(wire.data.code).toBe('NOT_A_CODE');
    });

    /**
     * 已知偏差（登记进报告"契约偏差"）：`RegisterInputSchema`（`@tm/shared`，T-03/T-06 名下、
     * 本任务禁改）在 tRPC 边界上就把 `phone`/`password` 拒了，走的是 tRPC 自带的
     * `BAD_REQUEST` + zod issue 列表，**不经过** `trpc/routers/auth.ts` 的 `call()`，
     * 因此 tRPC 侧的 `message` 是 JSON 而非 §4.6 人话；
     * REST 侧不用 zod、由 service 的 `assertPhone/assertPasswordStrength` 出码出文案。
     * 本用例把这一不对称**钉成断言**而不是放宽，以免将来有人误以为两端一致。
     */
    it('已知偏差：schema 级拒绝（INVALID_PHONE / 短密码）两端形状不对称，本用例钉死现状', async () => {
      const h = await fresh(`6x-${driver}`, driver);
      const rest = await req(h, '/api/register', {
        body: { phone: '1', password: PASSWORD_8, confirmPassword: PASSWORD_8, agreed: true },
        ip: uniqueIp(),
      });
      expect([rest.status, rest.body.code, rest.body.error]).toEqual([400, 'INVALID_PHONE', TM_ERRORS.INVALID_PHONE.copy]);
      const trpc = await trpcHttp(h, 'auth.register', {
        phone: '1',
        password: PASSWORD_8,
        confirmPassword: PASSWORD_8,
        agreed: true,
      });
      // tRPC 侧：状态同为 400，但 message 是 zod issue 的序列化结果，不是 §4.6 人话
      expect(trpc.status).toBe(400);
      expect(trpc.data.httpStatus).toBe(400);
      // A-36-4②（DEFECT-4 的回环修）：zod 的 message 里**不得**出现全大写码串，必须是入参展示串。
      // 这里改的是"钉住码串泄漏"那一半（原断言 `toContain('INVALID_PHONE')` 把 bug 钉成了现状），
      // **不对称**这一半原样保留：message 仍是 issues 序列化串、仍不等于 §4.6 人话（F-10 下一期收敛）。
      expect(trpc.message).not.toMatch(/\b[A-Z][A-Z0-9_]{2,}\b/);
      expect(trpc.message).toContain('手机号格式不正确');
      expect(trpc.message).not.toBe(TM_ERRORS.INVALID_PHONE.copy);
      // 短密码同理（`PasswordSchema = min(8)` 先于 service 的 `WEAK_PASSWORD`）
      const weakPhone = uniquePhone();
      const restWeak = await req(h, '/api/register', {
        body: { phone: weakPhone, password: 'short', confirmPassword: 'short', agreed: true },
        ip: uniqueIp(),
      });
      expect(restWeak.body.code).toBe('WEAK_PASSWORD');
      const trpcWeak = await trpcHttp(h, 'auth.register', {
        phone: weakPhone,
        password: 'short',
        confirmPassword: 'short',
        agreed: true,
      });
      expect(trpcWeak.message).toContain('too_small');
      expect(trpcWeak.message).not.toBe(TM_ERRORS.WEAK_PASSWORD.copy);
      // 两端都没有把"短密码"这个号注册进去（zod 拒绝同样不写库）
      expect(await h.db.users.findCredentialsByPhone(weakPhone)).toBeNull();
    });
  });

  /* ══════════════ §8.3-E 第 2 项：K-1 的 IP 侧配额 ══════════════ */

  describe(`§8.3-D 9 / §8.3-E 2：K-1 配额（新建 ≤5、激活 ≤20、两桶互不占用、端点总闸 10/分）· ${driver}`, () => {
    it('同 IP 第 6 个新建账号被拒 → 429；打满后同 IP 仍可激活；激活桶 20/新建桶 5 各自成桶', async () => {
      const h = await fresh(`quota-${driver}`, driver);
      const ip = `10.31.${seq}.7`;
      seq += 1;
      for (let i = 0; i < REG_IP_DAILY_LIMIT; i++) {
        const r = await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip });
        expect(r.status, `第 ${i + 1} 个新建`).toBe(200);
      }
      const sixth = await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip });
      expect([sixth.status, sixth.body.code]).toEqual([429, 'TOO_MANY_REQUESTS']);
      expect(sixth.body.error).toBe(TM_ERRORS.TOO_MANY_REQUESTS.copy);
      expect(String(sixth.body.error)).not.toMatch(/验证码/);

      // 激活桶独立：新建配额打满后，同一 IP 仍可激活
      const empty = uniquePhone();
      await h.seedUser({ phone: empty, password: null });
      const act = await req(h, '/api/register', { body: registerBody(empty, PASSWORD_8), ip });
      expect([act.status, act.body.activated]).toEqual([200, true]);

      // 激活日配额（≤20）与新建日配额（≤5）**各自成桶**：直接打 `auth-policy` 的桶函数取证。
      // 为什么不在 HTTP 层跑 21 次激活：`checkCredentialEndpointLimit` 是同 IP 每分钟 10 次的总闸
      // （`auth-service.ts:228/242` 顺序即如此），一分钟内第 11 次必先撞总闸、
      // 观测不到日配额；跨分钟等待又超出单测预算。故此处的 20/21 边界以桶函数取证，
      // HTTP 层只取证"两桶互不占用 + 第 6 个新建被拒 + 打满后仍可激活"（上面两段）。
      const ipA = `10.31.${seq}.8`;
      const ipB = `10.31.${seq}.9`;
      seq += 2;
      const activatePasses: boolean[] = [];
      for (let i = 0; i < ACTIVATE_IP_DAILY_LIMIT + 1; i++) activatePasses.push(checkActivateDailyLimit(ipA));
      expect(activatePasses.filter((v) => v).length).toBe(ACTIVATE_IP_DAILY_LIMIT);
      expect(activatePasses[activatePasses.length - 1]).toBe(false);
      // 新建桶（5）与激活桶（20）互不占用：A 桶打满后 B… 同一 IP 的新建桶仍是满 5 次、
      // 且与激活桶无关（换 IP 立刻可用 = 键里带 IP；同 IP 的 reg 桶仍是 5）
      const registerPasses: boolean[] = [];
      for (let i = 0; i < REG_IP_DAILY_LIMIT + 1; i++) registerPasses.push(checkRegisterDailyLimit(ipA));
      expect(registerPasses.filter((v) => v).length).toBe(REG_IP_DAILY_LIMIT);
      const registerOnOtherIp: boolean[] = [];
      for (let i = 0; i < REG_IP_DAILY_LIMIT + 1; i++) registerOnOtherIp.push(checkRegisterDailyLimit(ipB));
      expect(registerOnOtherIp.filter((v) => v).length).toBe(REG_IP_DAILY_LIMIT);
      // 上面 ipA 已被激活桶打满，但**激活桶满不影响新建桶**（反向也成立）
      expect(checkActivateDailyLimit(ipB)).toBe(true);
    });

    it(`同 IP 一分钟内第 ${IP_RATE_LIMIT_PER_MINUTE + 1} 次凭据请求 → 429（人话，不是 500）`, async () => {
      const h = await fresh(`gate-${driver}`, driver);
      const ip = `10.32.${seq}.9`;
      seq += 1;
      // 10 次里混两种端点：5 次新建（正好等于日配额，不撞日配额）+ 5 次登录（不占新建桶），
      // 这样第 11 次被拒只能归因于 `credential:${ip}` 总闸，而不是某个日配额桶。
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await req(h, '/api/register', { body: registerBody(uniquePhone(), PASSWORD_8), ip })).status);
      }
      for (let i = 0; i < 5; i++) {
        statuses.push((await req(h, '/api/login', { body: { phone: uniquePhone(), password: PASSWORD_8 }, ip })).status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses.slice(5)).toEqual([401, 401, 401, 401, 401]);
      const blocked = await req(h, '/api/login', { body: { phone: uniquePhone(), password: PASSWORD_8 }, ip });
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.body.error).toBe(TM_ERRORS.TOO_MANY_REQUESTS.copy);
      // 限流命中期间业务接口正常（不受牵连）
      const version = await req(h, '/api/version', { ip });
      expect(version.status).toBe(200);
      const me = await req(h, '/api/me', { ip });
      expect(me.status).toBe(401);
    });

    it('限流命中时登录口的 5 次失败锁语义不回退（R-39③ / R-40②）', async () => {
      const h = await fresh(`lock-${driver}`, driver);
      const phone = uniquePhone();
      await h.seedUser({ phone, password: '$2a$10$kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk01234', pwPolicyVersion: 1 });
      let last = 0;
      for (let i = 0; i < 5; i++) {
        last = (await req(h, '/api/login', { body: { phone, password: 'wrongpass1' }, ip: uniqueIp() })).status;
      }
      expect(last).toBe(401);
      const locked = await req(h, '/api/login', { body: { phone, password: 'wrongpass1' }, ip: uniqueIp() });
      expect([locked.status, locked.body.code]).toEqual([429, 'TEMP_LOCKED']);
      expect(locked.body.error).toBe(TM_ERRORS.TEMP_LOCKED.copy);
    });
  });

  /* ══════════════ §8.3-E 第 3 项：审计可回溯（三类事件齐备） ══════════════ */

  describe(`§8.3-E 3：审计三类事件各至少一条、字段齐全、无凭据泄漏 · ${driver}`, () => {
    it('新建 / 激活 / 冒领被拒 三类都能在 account_audit_log 里按 user_id 检索', async () => {
      const h = await fresh(`audit-${driver}`, driver);
      const newPhone = uniquePhone();
      const newRes = await req(h, '/api/register', { body: registerBody(newPhone, PASSWORD_8), ip: uniqueIp() });
      expect(newRes.status).toBe(200);
      const newId = (await h.db.users.findCredentialsByPhone(newPhone))?.id ?? 0;

      const emptyPhone = uniquePhone();
      const emptyId = await h.seedUser({ phone: emptyPhone, password: null });
      await req(h, '/api/register', { body: registerBody(emptyPhone, PASSWORD_8), ip: uniqueIp() });

      await req(h, '/api/register', { body: registerBody(emptyPhone, 'another123'), ip: uniqueIp() });

      const [rowsNew, rowsAct] = [await h.db.audit.listByUser(newId, 50), await h.db.audit.listByUser(emptyId, 50)];
      expect(rowsNew.some((r) => r.action === AUDIT_ACTIONS.accountRegistered && r.result === 'ok')).toBe(true);
      expect(rowsAct.some((r) => r.action === AUDIT_ACTIONS.accountActivated && r.result === 'ok')).toBe(true);
      const rejected = rowsAct.filter((r) => r.action === AUDIT_ACTIONS.registerRejected);
      expect(rejected.length).toBeGreaterThanOrEqual(1);
      expect(auditErrorCodeOf(rejected[0]?.result ?? '')).toBe('PHONE_ALREADY_REGISTERED');

      for (const row of [...rowsNew, ...rowsAct]) {
        expect(row.user_id > 0).toBe(true);
        expect(row.created_at).toBeGreaterThan(0);
        expect(typeof row.ip).toBe('string');
        expect(String(row.phone_masked).length).toBeLessThanOrEqual(4);
        const raw = JSON.stringify(row);
        expect(raw).not.toContain(PASSWORD_8);
        expect(raw).not.toContain(newPhone);
        expect(raw).not.toContain('$2a$');
      }
    });
  });
}

/* ══════════════════ service 层的三出口唯一性（判据②本体） ══════════════════ */

describe('判据②：registerOrActivate 是三出口的唯一裁决点（REST 与 tRPC 共用同一实例）', () => {
  it('同一函数被两门面调用；除这三条出口外没有第四个结果', async () => {
    const h = await fresh('single', 'sqlite');
    const svc = createAuthService({
      db: h.db,
      flags: createFeatureFlags(h.db),
      audit: createAccountAudit(h.db),
      sms: { verifyCode: () => false, consumeCode: () => undefined } as never,
      jwtSecret: AUTH_SECRET,
    });
    expect(typeof svc.registerOrActivate).toBe('function');

    const taken = uniquePhone();
    await h.seedUser({ phone: taken, password: '$2a$10$qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq01234', pwPolicyVersion: 1 });
    const empty = uniquePhone();
    await h.seedUser({ phone: empty, password: null });

    const outcomes: string[] = [];
    for (const phone of [uniquePhone(), empty, taken]) {
      try {
        const r = await svc.registerOrActivate(
          { phone, password: PASSWORD_8, confirmPassword: PASSWORD_8, agreed: true },
          { ip: uniqueIp() },
        );
        outcomes.push(r.activated ? 'activate' : 'create');
      } catch (err) {
        outcomes.push((err as { tmCode?: string }).tmCode ?? 'other');
      }
    }
    expect(outcomes).toEqual(['create', 'activate', 'PHONE_ALREADY_REGISTERED']);
    expect(AUTH_COPY.wrongCredential.length).toBeGreaterThan(0);
  });
});
