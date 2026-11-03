/**
 * T-07 判据④⑤ —— R-40 的加固面集成用例（§8.3-D 第 10-17 项的后端侧）
 *
 * 判据④：`pw_policy_version=0` 登录 → 响应**无正常 token**、upgrade token 打业务接口 403；
 *        `passwordUpgradeEnforce=off` → 发正常 token，且强度/验旧/吊销三条规则**一字不变**
 *        （第 15、16 两项各测一次。开关引用点 = 1 那条评论门禁由
 *         `node tools/boundaries.mjs --password` 的 `enforce-flag-single-read` 断言把守
 *         —— **不是 `--flags`**：`--flags` 只有 `flag-defaults-match-prd` 一条，
 *         §10.2 判据④ 括注里的 `--flags` 是幽灵入口（见 `04-dev-report-T-07.md` §8-2）。
 *         那是开发冒烟件，不在本文件里重复实现。）
 * 判据⑤：上线零掉线 —— `password_changed_at=0` 的旧 token 仍可用（§8.3-D 第 14 项）。
 *
 * 逐条对应（编号 = PRD §8.3-D）：
 *  10 两处改密入口不带 `oldPassword` → `OLD_PASSWORD_REQUIRED`
 *  11 旧密码错误 → `OLD_PASSWORD_INCORRECT` 且**计入 5 次/10 分钟失败锁**（与登录同一桶）
 *  12 新密码与旧密码相同 → `PASSWORD_SAME_AS_OLD`；新密码 7 位 → `WEAK_PASSWORD`
 *  13 改密成功 → 改密前签发的 token 打写接口 401 `CREDENTIAL_EXPIRED`（≤60 秒，两门面同证）
 *     ⚠ **登出不在这一条里**（A-32-4：登出是会话语义、不推进 `password_changed_at`）→ 单列 `D-13b` 组
 *  14 上线时刻零掉线：`password_changed_at=0` + 早于发布时刻的 `iat` → 读写接口全部仍可用
 *  15 硬门禁：`pw_policy_version=0` 且密码非空 → 200 + `upgrade_required:true` + upgrade token
 *     且**响应里不存在正常 30 天 token**；upgrade token 只能打改密/退出/读自己，业务接口 403；
 *     强制改密成功 → 写 `pw_policy_version=1` + 正常 token + 旧 upgrade token 随即 401
 *  16 `passwordUpgradeEnforce=off` → `upgrade_required` 与 upgrade token 照旧给出，**同时**签发正常
 *     token；且 10-13 的三条规则（强度 / 验旧 / 吊销）行为逐字不变
 *  17 `password` 为空的账号直接调改密 → `NO_PASSWORD_ACCOUNT`（改密口不得成为第二后门）
 *
 * ★ 用例里的等待（`REVOCATION_SETTLE_MS`）不是"给被测代码留余地"，而是避开 `middleware/auth.ts`
 *   头注写死的**同秒容忍**（`iat` 秒 vs `password_changed_at` 毫秒，同秒内改密的旧 token 判为仍有效，
 *   由 60 秒缓存 TTL 兜住 R-40③）。不等这一秒，13/15 的吊销断言会在同一秒内跑完而**假绿**。
 *
 * 判据①：本文件与 `auth-register.spec.ts` 一样在 **sqlite 与 pg 各跑一遍**；本机无 PG 实例时
 * pg 侧**显式 SKIP 并打印原因**（A-18-3 先例）—— CI（T-22）必须真跑 pg，报告里已登记这一条。
 *
 * 并行安全：每个用例自己开临时库（sqlite 走 `data.db` 的只读副本）、自己建 app 实例、用完关句柄；
 * 绝不在仓库根 `data.db` / `packages/server/data.db` 上写任何东西。用例之间互不依赖。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  LOGIN_FAIL_LIMIT,
  PASSWORD_MIN,
  TM_ERRORS,
  UPGRADE_TOKEN_TTL_MINUTES,
} from '@tm/shared';
import { PROJECT_ROOT } from '../../src/config.js';
import type { AppDB } from '../../src/db/types.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { createMigrationContext, sqliteMigrationContext } from '../../src/db/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { createApp, type AppRuntime } from '../../src/app.js';
import { LlmRouter } from '@tm/agent';
import { UPGRADE_AUDIENCE, __resetAuthDepsForTest } from '../../src/middleware/auth.js';
import { PW_POLICY_VERSION, hashPassword } from '../../src/services/password-policy.js';
import { __resetAuthPolicyStateForTest } from '../../src/services/auth-policy.js';

/* ══════════════════════════ 夹具：双驱动 + 独立装配 ══════════════════════════ */

const TEST_SECRET = 'tm-t07-auth-hardening-secret-32ch';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

/** 跨过 `iat` 的秒边界（见文件头的 ★ 说明）。 */
const REVOCATION_SETTLE_MS = 1_100;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, REVOCATION_SETTLE_MS));

const PG_URL = process.env.DATABASE_URL_TEST ?? '';
const DAILY_GOAL = 10;

type Driver = 'sqlite' | 'pg';
const DRIVERS: Driver[] = PG_URL ? ['sqlite', 'pg'] : ['sqlite'];

const TMP_DIR = path.join(os.tmpdir(), `tm-t07-hardening-${process.pid}`);
const SOURCE_DB = path.join(PROJECT_ROOT, 'data.db');

interface Credentials {
  password: string | null;
  pw_policy_version: number;
  password_changed_at: number;
}

interface Harness {
  driver: Driver;
  db: AppDB;
  runtime: AppRuntime;
  /**
   * 造账号：`password` 一律写**真实 bcrypt 串**（`comparePassword` 要能验得过），
   * `pwPolicyVersion=0` 即"策略生效前签发的哈希"= R-40④ 的待升级人群。
   */
  seedAccount(input: {
    password: string | null;
    pwPolicyVersion?: number;
    passwordChangedAt?: number;
  }): Promise<{ userId: number; phone: string }>;
  credentialsOf(userId: number): Promise<Credentials>;
  request: (
    pathname: string,
    init?: { method?: string; body?: unknown; token?: string; ip?: string },
  ) => Promise<HttpRes>;
  trpc: (proc: string, input?: unknown, init?: { token?: string; method?: 'POST' | 'GET' }) => Promise<TrpcRes>;
  close: () => Promise<void>;
}

interface HttpRes {
  status: number;
  body: Record<string, unknown>;
  raw: string;
}

interface TrpcRes extends HttpRes {
  error: { message: string; code: unknown; data: Record<string, unknown> } | null;
  data: Record<string, unknown> | null;
}

let seq = 0;
const uniquePhone = (): string => `13${String(process.pid % 1000).padStart(3, '0')}8${String(++seq).padStart(5, '0')}`;
const uniqueIp = (): string => `10.8.${Math.floor(seq / 250) % 250}.${seq % 250}`;
const sqlStr = (v: string): string => `'${v.replace(/'/g, "''")}'`;

type Adapter = {
  get: (sql: string) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  exec: (sql: string) => Promise<void> | void;
  close: () => Promise<void> | void;
};

async function buildHarness(driver: Driver, db: AppDB, ad: Adapter): Promise<Harness> {
  const stub = {} as never;
  const lookup = { lookup: async () => ({ word: 'stub', notFound: true }) } as never;
  const runtime = createApp({
    config: {
      port: 0,
      jwtSecret: AUTH_SECRET,
      dbDriver: driver,
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
      // 2026-11 新增：/api/version 的 APK 版本来源与下载目录（这两条用例不碰版本提示）
      apkVersionFile: '',
      apkDownloadBaseUrl: '',
      downloadsDir: '',
    },
    db,
    sms: {
      verifyCode: () => false,
      consumeCode: () => undefined,
      sendCode: async () => ({ ok: false, reason: 'not-configured' }),
    } as never,
    lookup,
    dictSources: stub,
    agentDeps: {
      tutorCache: db.tutorCache,
      fsrsCards: db.fsrs,
      wordbook: db.wordbooks,
      lookup: stub,
      analystPort: stub,
      getCefrLevel: async () => 'B1',
    } as never,
    llmRouter: new LlmRouter({ deepseekApiKey: '', deepseekBaseUrl: '' }),
    events: { record: () => undefined } as never,
    analyst: stub,
    cache: stub,
  });

  const parse = async (res: Response): Promise<HttpRes> => {
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    } catch {
      body = { __raw: text };
    }
    return { status: res.status, body, raw: text };
  };

  const harness: Harness = {
    driver,
    db,
    runtime,
    async seedAccount({ password, pwPolicyVersion = 1, passwordChangedAt = 0 }) {
      const phone = uniquePhone();
      const now = Date.now();
      const passwordSql = password === null ? 'NULL' : sqlStr(hashPassword(password));
      await ad.exec(
        `INSERT INTO users (phone, password, created_at, password_changed_at, pw_policy_version)
         VALUES (${sqlStr(phone)}, ${passwordSql}, ${now}, ${passwordChangedAt}, ${pwPolicyVersion})`,
      );
      const row = await ad.get(`SELECT id FROM users WHERE phone = ${sqlStr(phone)}`);
      const userId = Number(row?.id ?? 0);
      if (!userId) throw new Error('seedAccount: users 行未落库');
      await ad.exec(`INSERT INTO wordbooks (user_id, data, updated_at) VALUES (${userId}, '[]', ${now})`);
      await ad.exec(
        `INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at)
         VALUES (${userId}, '', '', ${DAILY_GOAL}, ${now})`,
      );
      return { userId, phone };
    },
    async credentialsOf(userId) {
      const row = await ad.get(
        `SELECT password, pw_policy_version, password_changed_at FROM users WHERE id = ${userId}`,
      );
      return {
        password: (row?.password as string | null | undefined) ?? null,
        pw_policy_version: Number(row?.pw_policy_version ?? -1),
        password_changed_at: Number(row?.password_changed_at ?? -1),
      };
    },
    request: async (pathname, init = {}) => {
      const res = await runtime.app.request(pathname, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': init.ip ?? uniqueIp(),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      return parse(res);
    },
    trpc: async (proc, input, init = {}) => {
      const method = init.method ?? 'POST';
      const url =
        method === 'GET'
          ? `/trpc/${input === undefined ? proc : `${proc}?input=${encodeURIComponent(JSON.stringify(input))}`}`
          : `/trpc/${proc}`;
      const res = await runtime.app.request(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': uniqueIp(),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        ...(method === 'POST' ? { body: JSON.stringify(input ?? {}) } : {}),
      });
      const r = await parse(res);
      const err = (r.body.error ?? null) as Record<string, unknown> | null;
      const json = ((err?.json ?? err) ?? null) as Record<string, unknown> | null;
      const result = (r.body.result ?? null) as Record<string, unknown> | null;
      return {
        ...r,
        error: json
          ? {
              message: String(json.message ?? ''),
              code: json.code,
              data: (json.data ?? {}) as Record<string, unknown>,
            }
          : null,
        data: result ? ((result.data ?? {}) as Record<string, unknown>) : null,
      };
    },
    close: async () => {
      await ad.close();
    },
  };
  return harness;
}

async function openSqlite(label: string): Promise<Harness> {
  const file = path.join(TMP_DIR, `h-${label}.db`);
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
    get: (sql) => raw.prepare(sql).get() as Record<string, unknown> | undefined,
    exec: (sql) => {
      raw.exec(sql);
    },
    close: () => {
      raw.close();
    },
  });
}

async function openPg(label: string): Promise<Harness> {
  const pool = new pg.Pool({ connectionString: PG_URL, application_name: `tm-t07-hardening-${label}` });
  const db = new PostgresAppDB(pool);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, createMigrationContext(db)).apply({});
  return buildHarness('pg', db, {
    get: async (sql) => ((await pool.query(sql)).rows[0] ?? undefined) as Record<string, unknown> | undefined,
    exec: (sql) => pool.query(sql).then(() => undefined),
    close: () => pool.end(),
  });
}

/**
 * 本条用例内开过的**全部** harness。D-13c / D-14c 这类"两个账号 = 两个独立装配"的用例
 * 以前只记最后一个，前一个 sqlite 句柄没关 → `afterAll` 的 `rmSync` 在 Windows 上 EBUSY，
 * 整份文件按 Failed Suite 计。
 */
const opened: Harness[] = [];

async function fresh(label: string, driver: Driver): Promise<Harness> {
  const h = driver === 'sqlite' ? await openSqlite(label) : await openPg(label);
  opened.push(h);
  return h;
}

interface Account {
  h: Harness;
  userId: number;
  phone: string;
  password: string;
}

/**
 * 三类账号：
 *  - `ordinary`：`pw_policy_version=1`（本期之后注册/已升级的人）→ 登录拿正常 token
 *  - `pending` ：`pw_policy_version=0` + 密码非空（R-40④ 的待升级人群）
 *  - `noPassword`：`password IS NULL`（R-39⑤b 的存量形态）
 */
async function ordinary(label: string, driver: Driver, password: string): Promise<Account> {
  const h = await fresh(label, driver);
  const { userId, phone } = await h.seedAccount({ password, pwPolicyVersion: 1 });
  return { h, userId, phone, password };
}

async function pending(label: string, driver: Driver, password: string): Promise<Account> {
  const h = await fresh(label, driver);
  const { userId, phone } = await h.seedAccount({ password, pwPolicyVersion: 0 });
  return { h, userId, phone, password };
}

/** 真实登录拿正常 token（`ordinary` 账号在 enforce=on 下就是一条正常的 30 天会话）。 */
async function loginNormal(a: Account): Promise<string> {
  const r = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
  expect(r.status, r.raw).toBe(200);
  expect(r.body.token, `正常账号不该命中门禁：${r.raw}`).toBeTruthy();
  return String(r.body.token);
}

/** 真实登录拿 upgrade token（`pending` 账号在 enforce=on 下的唯一出口）。 */
async function loginUpgrade(a: Account): Promise<string> {
  const r = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
  expect(r.status, r.raw).toBe(200);
  expect(r.body.upgrade_required, r.raw).toBe(true);
  return String(r.body.upgradeToken);
}

beforeAll(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'public'), { recursive: true });
});

afterEach(async () => {
  const harnesses = opened.splice(0, opened.length);
  __resetAuthPolicyStateForTest();
  // ★ `middleware/auth.ts` 的吊销缓存是**进程内 `Map<userId, password_changed_at>`**（设计 §4.7 ③
  //   的 60 秒缓存，生产只有一个库所以没问题），但本文件的每个用例都新开一个 harness，
  //   而从 `data.db` 副本自增出来的 `user_id` **会在用例之间重复**。不清这一步，
  //   上一条用例里"改过密码的 24 号"的毫秒戳会串到下一条用例的 24 号上，
  //   把 D-14（零掉线）判成 401 —— 那是用例之间的串味，不是实现的吊销判错。
  __resetAuthDepsForTest();
  for (const h of harnesses) await h.close().catch(() => undefined);
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

/* ══════════════════════ 判据①：双驱动环境自证（A-18-3 口径） ══════════════════════ */

describe('判据①-环境：pg 侧可用性自证（缺实例时显式 SKIP 并打印原因）', () => {
  it('未设 DATABASE_URL_TEST 时 pg 侧不跑，但原因必须留在输出里（CI 必须真跑 pg）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] auth-hardening 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例：sqlite 侧全绿 + pg 侧显式 SKIP；R-40⑨ 要求双驱动一致，CI（T-22）必须真跑 pg。',
    );
    expect(PG_URL).toBe('');
  });
});

/* ══════════════════════ 以下逐条跑在两个驱动上 ══════════════════════ */

for (const driver of DRIVERS) {
  const NEW_PW = 'hardened-new-pw-12';
  /**
   * R-40① 的下界探针：**恰好 7 位**（`PASSWORD_MIN - 1`）。
   * 字面量旁必须留一道自证 —— 上一个版本这里写的是 `'sevenday'`，看着像 7 位其实是 8 位，
   * 于是"7 位必拒"这条硬判据被一条 8 位的合法密码测了，红的是用例而不是实现。
   */
  const SEVEN_CHAR_PW = 'sevenpw';
  const assertSevenCharProbe = (): void => {
    expect(SEVEN_CHAR_PW.length).toBe(PASSWORD_MIN - 1);
  };

  /* ─────────── §8.3-D 10：两处改密入口都必须验旧 ─────────── */

  describe(`D-10 两处改密入口不带 oldPassword → OLD_PASSWORD_REQUIRED · ${driver}`, () => {
    it('普通改密与强制改密（R-40④ 页）都拒绝，形状恰好 `{error, code}` 两键、不是 500', async () => {
      const a = await ordinary(`d10-${driver}`, driver, 'd10-ordinary-pw-1');
      const token = await loginNormal(a);

      const plain = await a.h.request('/api/password', {
        method: 'PUT',
        token,
        body: { password: NEW_PW },
        ip: uniqueIp(),
      });
      expect([plain.status, plain.body.code, plain.body.error], plain.raw).toEqual([
        TM_ERRORS.OLD_PASSWORD_REQUIRED.http,
        'OLD_PASSWORD_REQUIRED',
        TM_ERRORS.OLD_PASSWORD_REQUIRED.copy,
      ]);
      expect(Object.keys(plain.body).sort()).toEqual(['code', 'error']);

      const forced = await a.h.request('/api/password/force', {
        method: 'POST',
        token,
        body: { newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      expect([forced.status, forced.body.code], forced.raw).toEqual([
        TM_ERRORS.OLD_PASSWORD_REQUIRED.http,
        'OLD_PASSWORD_REQUIRED',
      ]);
      // 两条都必须在写库之前拒绝
      expect((await a.h.credentialsOf(a.userId)).pw_policy_version).toBe(1);
    });

    it('tRPC 侧的同一件事：`oldPassword` 是 schema 必填 ⇒ 缺它连不进 service（只会更严，不会更松）', async () => {
      const a = await ordinary(`d10-trpc-${driver}`, driver, 'd10-trpc-pw-123');
      const token = await loginNormal(a);
      const wire = await a.h.trpc(
        'auth.changePassword',
        { newPassword: NEW_PW, confirmPassword: NEW_PW },
        { token },
      );
      expect(wire.status, wire.raw).toBe(400);
      expect(wire.error?.data.code).toBe('BAD_REQUEST');
      expect((await a.h.credentialsOf(a.userId)).pw_policy_version).toBe(1);
    });

    it('upgrade token 打普通改密口 → 403（§4.7 白名单里没有它），不得因为"是改密口"就放行', async () => {
      const a = await pending(`d10-gate-${driver}`, driver, 'd10-gate-pw-1234');
      const upgrade = await loginUpgrade(a);
      const r = await a.h.request('/api/password', {
        method: 'PUT',
        token: upgrade,
        body: { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      expect([r.status, r.body.code], r.raw).toEqual([
        TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http,
        'PASSWORD_UPGRADE_REQUIRED',
      ]);
    });
  });

  /* ─────────── §8.3-D 11 / 12：验旧、失败锁、新旧相同、强度 ─────────── */

  describe(`D-11/D-12 验旧与强度三条 · ${driver}`, () => {
    it('旧密码填错 LOGIN_FAIL_LIMIT 次 → 每次都 OLD_PASSWORD_INCORRECT，且正确密码也登不进去（同一失败锁桶）', async () => {
      const a = await ordinary(`d11-${driver}`, driver, 'd11-ordinary-pw-1');
      const token = await loginNormal(a);

      for (let i = 0; i < LOGIN_FAIL_LIMIT; i++) {
        const r = await a.h.request('/api/password', {
          method: 'PUT',
          token,
          body: { oldPassword: `wrong-${i}-${a.password}`, newPassword: NEW_PW, confirmPassword: NEW_PW },
          ip: uniqueIp(),
        });
        expect([r.status, r.body.code], `第 ${i + 1} 次`).toEqual([
          TM_ERRORS.OLD_PASSWORD_INCORRECT.http,
          'OLD_PASSWORD_INCORRECT',
        ]);
      }

      // 锁的判据用"正确密码也登不进去"来证：计数与登录共用 `auth-policy` 里唯一的那个 map
      const locked = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
      expect([locked.status, locked.body.code, locked.body.error], locked.raw).toEqual([
        TM_ERRORS.TEMP_LOCKED.http,
        'TEMP_LOCKED',
        TM_ERRORS.TEMP_LOCKED.copy,
      ]);
      expect(locked.body.token ?? '').toBe('');
    });

    it('新密码与旧密码相同 → PASSWORD_SAME_AS_OLD（在验旧**之后**，且不得留下任何写入）', async () => {
      const a = await ordinary(`d12-${driver}`, driver, 'd12-ordinary-pw-12');
      const before = await a.h.credentialsOf(a.userId);
      const token = await loginNormal(a);
      const r = await a.h.request('/api/password', {
        method: 'PUT',
        token,
        body: { oldPassword: a.password, newPassword: a.password, confirmPassword: a.password },
        ip: uniqueIp(),
      });
      expect([r.status, r.body.code], r.raw).toEqual([TM_ERRORS.PASSWORD_SAME_AS_OLD.http, 'PASSWORD_SAME_AS_OLD']);
      expect(await a.h.credentialsOf(a.userId)).toEqual(before);
    });

    it('新密码 7 位 → WEAK_PASSWORD（min(4)→min(8) 的收紧不许被改密口绕过）', async () => {
      const a = await ordinary(`d12b-${driver}`, driver, 'd12b-ordinary-pw-1');
      const token = await loginNormal(a);
      assertSevenCharProbe();
      const r = await a.h.request('/api/password', {
        method: 'PUT',
        token,
        body: { oldPassword: a.password, newPassword: SEVEN_CHAR_PW, confirmPassword: SEVEN_CHAR_PW },
        ip: uniqueIp(),
      });
      expect([r.status, r.body.code], r.raw).toEqual([TM_ERRORS.WEAK_PASSWORD.http, 'WEAK_PASSWORD']);
      expect((await a.h.credentialsOf(a.userId)).pw_policy_version).toBe(1);
    });

    it('tRPC 门面同码：`auth.changePassword` 的新旧相同 → 同一码同一条文案（判据⑥ 的"两协议"面）', async () => {
      const a = await ordinary(`d12-trpc-${driver}`, driver, 'd12trpc-ordinary-pw');
      const token = await loginNormal(a);
      const wire = await a.h.trpc(
        'auth.changePassword',
        { oldPassword: a.password, newPassword: a.password, confirmPassword: a.password },
        { token },
      );
      expect(wire.status, wire.raw).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.http);
      expect(wire.error?.message).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.copy);
      expect(wire.error?.data.code).toBe('PASSWORD_SAME_AS_OLD');
    });
  });

  /* ─────────── §8.3-D 17：改密口不得成为空密码账号的第二后门 ─────────── */

  describe(`D-17 空密码账号走改密口 → NO_PASSWORD_ACCOUNT · ${driver}`, () => {
    it('两个改密入口都拒绝，且 `password` 列仍是 NULL（出路只有 R-39⑤b 激活）', async () => {
      const h = await fresh(`d17-${driver}`, driver);
      const { userId } = await h.seedAccount({ password: null });
      // 空密码账号历史上任何凭据都进不去，所以这里只能是"手里有 token 也改不了"这一面：
      // 会话取 `pw_policy_version=0` 之外的正常态（该账号没有密码可校验）
      const token = jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '30d' });
      for (const [label, init] of [
        ['PUT /api/password', { method: 'PUT', body: { oldPassword: 'whatever-123', newPassword: NEW_PW, confirmPassword: NEW_PW } }],
        ['POST /api/password/force', { method: 'POST', body: { oldPassword: 'whatever-123', newPassword: NEW_PW, confirmPassword: NEW_PW } }],
      ] as const) {
        const r = await h.request('/api/password' + (label.includes('force') ? '/force' : ''), {
          ...init,
          token,
          ip: uniqueIp(),
        });
        expect([r.status, r.body.code], `${label} → ${r.raw}`).toEqual([
          TM_ERRORS.NO_PASSWORD_ACCOUNT.http,
          'NO_PASSWORD_ACCOUNT',
        ]);
        expect((await h.credentialsOf(userId)).password).toBeNull();
      }
    });

    it('空密码账号走**密码登录**分支 → 仍 NO_PASSWORD_ACCOUNT 且不签发 token（R-39⑤(c) 不回退）', async () => {
      const h = await fresh(`d17b-${driver}`, driver);
      const { phone } = await h.seedAccount({ password: null });
      const r = await h.request('/api/login', { body: { phone, password: 'anything-12345' }, ip: uniqueIp() });
      expect([r.status, r.body.code], r.raw).toEqual([TM_ERRORS.NO_PASSWORD_ACCOUNT.http, 'NO_PASSWORD_ACCOUNT']);
      expect(r.body.token ?? '').toBe('');
    });
  });

  /* ─────────── 判据④ / D-15：硬门禁（enforce 默认 on） ─────────── */

  describe(`判据④ / D-15 硬门禁 · ${driver}`, () => {
    it('待升级账号登录：200 + `upgrade_required:true` + upgrade token，且响应里**没有**可用的正常 token', async () => {
      const a = await pending(`d15-${driver}`, driver, 'd15-pending-pw-123');
      const r = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
      expect(r.status, r.raw).toBe(200);
      expect(r.body.upgrade_required).toBe(true);
      // 判据原文"响应中不存在正常 30 天 token"：实现取 `token:''`，另给 upgradeToken
      expect(r.body.token).toBe('');
      const upgrade = String(r.body.upgradeToken ?? '');
      expect(upgrade.length).toBeGreaterThan(0);
      expect(r.body.message).toBeTruthy();

      const claims = jwt.decode(upgrade) as jwt.JwtPayload;
      expect(claims.aud).toBe(UPGRADE_AUDIENCE);
      const ttlSeconds = Number(claims.exp) - Number(claims.iat);
      expect(ttlSeconds).toBeGreaterThan(0);
      expect(ttlSeconds).toBeLessThanOrEqual(UPGRADE_TOKEN_TTL_MINUTES * 60);
    });

    it('upgrade token：业务读写接口与 tRPC 全部 403；§4.7 白名单内的读自己仍放行', async () => {
      const a = await pending(`d15-gate-${driver}`, driver, 'd15-gate-pw-1234');
      const upgrade = await loginUpgrade(a);

      const read = await a.h.request('/api/profile', { token: upgrade });
      expect([read.status, read.body.code, read.body.error], read.raw).toEqual([
        TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http,
        'PASSWORD_UPGRADE_REQUIRED',
        TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy,
      ]);
      const write = await a.h.request('/api/review', { token: upgrade, body: { word: 'apple', rating: 3 } });
      expect([write.status, write.body.code], write.raw).toEqual([
        TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http,
        'PASSWORD_UPGRADE_REQUIRED',
      ]);
      const wire = await a.h.trpc('review.reviewCard', { word: 'apple', rating: 3 }, { token: upgrade });
      expect(wire.status, wire.raw).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http);
      expect(wire.error?.data.code).toBe('PASSWORD_UPGRADE_REQUIRED');

      // 白名单三件必须放行，否则强制改密页本身就打不开
      const me = await a.h.request('/api/me', { token: upgrade });
      expect([me.status, me.body.user_id, me.body.upgradeRequired], me.raw).toEqual([200, a.userId, true]);
    });

    it('强制改密成功 → 写 `pw_policy_version=1` + 正常 token；旧 upgrade token 随即 401，退出后不再命中门禁', async () => {
      const a = await pending(`d15-force-${driver}`, driver, 'd15-force-pw-1234');
      const upgrade = await loginUpgrade(a);
      await settle();

      const forced = await a.h.request('/api/password/force', {
        method: 'POST',
        token: upgrade,
        body: { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      expect(forced.status, forced.raw).toBe(200);
      const normal = String(forced.body.token ?? '');
      expect(normal.length, forced.raw).toBeGreaterThan(0);
      expect(forced.body.upgrade_required ?? false).toBe(false);

      const after = await a.h.credentialsOf(a.userId);
      expect(after.pw_policy_version).toBe(PW_POLICY_VERSION);
      expect(after.password_changed_at).toBeGreaterThan(0);

      // 正常 token 打得通业务接口：门禁真的解开了
      const profile = await a.h.request('/api/profile', { token: normal });
      expect(profile.status, profile.raw).toBe(200);

      // 旧 upgrade token 已被 ③ 的吊销判定作废（R-40④ 末句"作废旧 token"）
      const replay = await a.h.request('/api/me', { token: upgrade });
      expect([replay.status, replay.body.code], replay.raw).toEqual([
        TM_ERRORS.CREDENTIAL_EXPIRED.http,
        'CREDENTIAL_EXPIRED',
      ]);

      // 用新密码再登录：不再命中门禁（该账号已离开"待升级"人群）
      const again = await a.h.request('/api/login', { body: { phone: a.phone, password: NEW_PW }, ip: uniqueIp() });
      expect(again.status, again.raw).toBe(200);
      expect(again.body.upgrade_required ?? false).toBe(false);
      expect(String(again.body.token ?? '').length).toBeGreaterThan(0);
    });

    it('不退出、反复登录也始终是门禁态（§8.3-D 15"退出后再登录仍回到该页"的服务端面）', async () => {
      const a = await pending(`d15-relogin-${driver}`, driver, 'd15-relogin-pw-12');
      for (let i = 0; i < 2; i++) {
        const r = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
        expect([r.status, r.body.token, r.body.upgrade_required], `第 ${i + 1} 次登录`).toEqual([200, '', true]);
      }
    });

    it('`auth.forceChangePassword`（tRPC 同一出口）也能把 upgrade token 换成正常 token', async () => {
      const a = await pending(`d15-trpc-${driver}`, driver, 'd15-trpc-pw-12345');
      const upgrade = await loginUpgrade(a);
      const wire = await a.h.trpc(
        'auth.forceChangePassword',
        { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        { token: upgrade },
      );
      expect(wire.status, wire.raw).toBe(200);
      expect(String(wire.data?.token ?? '').length, wire.raw).toBeGreaterThan(0);
      expect((await a.h.credentialsOf(a.userId)).pw_policy_version).toBe(PW_POLICY_VERSION);
    });
  });

  /* ─────────── 判据④ / D-16：止血阀 off —— 只关"拦不拦"，关不到三条核心 ─────────── */

  describe(`判据④ / D-16 passwordUpgradeEnforce=off · ${driver}`, () => {
    it('off → 同一待升级账号仍收到 `upgrade_required` + upgrade token，同时拿到可用的正常 token', async () => {
      const a = await pending(`d16-${driver}`, driver, 'd16-pending-pw-1234');
      await a.h.runtime.flags.set('passwordUpgradeEnforce', 'off');
      try {
        const r = await a.h.request('/api/login', { body: { phone: a.phone, password: a.password }, ip: uniqueIp() });
        expect(r.status, r.raw).toBe(200);
        expect(r.body.upgrade_required).toBe(true);
        expect(r.body.upgradeToken).toBeTruthy();
        const token = String(r.body.token ?? '');
        expect(token.length, r.raw).toBeGreaterThan(0);

        // 正常 token 真能用（不是"发一枚废串做样子"）：业务接口不再 403
        const me = await a.h.request('/api/me', { token });
        expect([me.status, me.body.user_id, me.body.upgradeRequired], me.raw).toEqual([200, a.userId, true]);
        const profile = await a.h.request('/api/profile', { token });
        expect(profile.status, profile.raw).toBe(200);
      } finally {
        await a.h.runtime.flags.set('passwordUpgradeEnforce', 'on');
      }
    });

    it('off 态下强度 / 验旧 / 吊销三条规则逐字不变（止血阀不得顺手关掉安全面）', async () => {
      const a = await pending(`d16-rules-${driver}`, driver, 'd16-rules-pw-12345');
      await a.h.runtime.flags.set('passwordUpgradeEnforce', 'off');
      try {
        const token = await loginNormal(a);

        // ① 强度：7 位仍被拒
        assertSevenCharProbe();
        const weak = await a.h.request('/api/password', {
          method: 'PUT',
          token,
          body: { oldPassword: a.password, newPassword: SEVEN_CHAR_PW, confirmPassword: SEVEN_CHAR_PW },
          ip: uniqueIp(),
        });
        expect([weak.status, weak.body.code], weak.raw).toEqual([TM_ERRORS.WEAK_PASSWORD.http, 'WEAK_PASSWORD']);

        // ② 验旧：不带 oldPassword 仍 OLD_PASSWORD_REQUIRED，填错仍 OLD_PASSWORD_INCORRECT
        const missing = await a.h.request('/api/password', {
          method: 'PUT',
          token,
          body: { password: NEW_PW },
          ip: uniqueIp(),
        });
        expect([missing.status, missing.body.code], missing.raw).toEqual([
          TM_ERRORS.OLD_PASSWORD_REQUIRED.http,
          'OLD_PASSWORD_REQUIRED',
        ]);
        const wrong = await a.h.request('/api/password', {
          method: 'PUT',
          token,
          body: { oldPassword: `nope-${a.password}`, newPassword: NEW_PW, confirmPassword: NEW_PW },
          ip: uniqueIp(),
        });
        expect([wrong.status, wrong.body.code], wrong.raw).toEqual([
          TM_ERRORS.OLD_PASSWORD_INCORRECT.http,
          'OLD_PASSWORD_INCORRECT',
        ]);

        // ③ 吊销：改密成功后，改密前签发的 token 打写接口仍 401 CREDENTIAL_EXPIRED
        await settle();
        const changed = await a.h.request('/api/password', {
          method: 'PUT',
          token,
          body: { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
          ip: uniqueIp(),
        });
        expect(changed.status, changed.raw).toBe(200);
        expect((await a.h.credentialsOf(a.userId)).pw_policy_version).toBe(PW_POLICY_VERSION);

        const revoked = await a.h.request('/api/wordbook', {
          method: 'PUT',
          token,
          body: { data: [{ word: 'apple', addedAt: 1_770_000_000_000 }] },
          ip: uniqueIp(),
        });
        expect([revoked.status, revoked.body.code], revoked.raw).toEqual([
          TM_ERRORS.CREDENTIAL_EXPIRED.http,
          'CREDENTIAL_EXPIRED',
        ]);

        // 门禁同时解除（改了密码 ⇒ `pw_policy_version=1`）
        const again = await a.h.request('/api/login', { body: { phone: a.phone, password: NEW_PW }, ip: uniqueIp() });
        expect(again.status, again.raw).toBe(200);
        expect(again.body.upgrade_required ?? false).toBe(false);
      } finally {
        await a.h.runtime.flags.set('passwordUpgradeEnforce', 'on');
      }
    });

    it('off 只作用于"待升级"人群：本期注册出来的账号完全不受该开关影响', async () => {
      const h = await fresh(`d16-clean-${driver}`, driver);
      await h.runtime.flags.set('passwordUpgradeEnforce', 'off');
      try {
        const phone = uniquePhone();
        const reg = await h.request('/api/register', {
          body: { phone, password: NEW_PW, confirmPassword: NEW_PW, agreed: true },
          ip: uniqueIp(),
        });
        expect(reg.status, reg.raw).toBe(200);
        expect(reg.body.upgrade_required ?? false).toBe(false);
        expect(String(reg.body.token ?? '').length).toBeGreaterThan(0);
        const me = await h.request('/api/me', { token: String(reg.body.token) });
        expect([me.body.pwPolicyVersion, me.body.upgradeRequired], me.raw).toEqual([PW_POLICY_VERSION, false]);
      } finally {
        await h.runtime.flags.set('passwordUpgradeEnforce', 'on');
      }
    });
  });

  /* ─────────── 判据⑤ / D-13：改密 / 登出后旧 token 作废（两门面） ─────────── */

  describe(`判据⑤ / D-13 改密后旧 token 401 CREDENTIAL_EXPIRED · ${driver}`, () => {
    it('REST 写接口与 tRPC 受保护过程都拒绝改密前签发的 token，两端同一个码', async () => {
      const a = await ordinary(`d13-${driver}`, driver, 'd13-ordinary-pw-12');
      const old = await loginNormal(a);
      await settle();

      const changed = await a.h.request('/api/password', {
        method: 'PUT',
        token: old,
        body: { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      expect(changed.status, changed.raw).toBe(200);
      expect((await a.h.credentialsOf(a.userId)).password_changed_at).toBeGreaterThan(0);

      const rest = await a.h.request('/api/wordbook', {
        method: 'PUT',
        token: old,
        body: { data: [{ word: 'apple', addedAt: 1_770_000_000_000 }] },
        ip: uniqueIp(),
      });
      expect([rest.status, rest.body.code, rest.body.error], rest.raw).toEqual([
        TM_ERRORS.CREDENTIAL_EXPIRED.http,
        'CREDENTIAL_EXPIRED',
        TM_ERRORS.CREDENTIAL_EXPIRED.copy,
      ]);

      const wire = await a.h.trpc('auth.me', undefined, { method: 'GET', token: old });
      expect(wire.status, wire.raw).toBe(TM_ERRORS.CREDENTIAL_EXPIRED.http);
      // A-30-1：§4.6 码必须到得了线上形状，否则客户端执行不了"清凭据 + 跳登录"
      expect(wire.error?.data.code).toBe('CREDENTIAL_EXPIRED');
      expect(wire.error?.data.httpStatus).toBe(TM_ERRORS.CREDENTIAL_EXPIRED.http);
      expect(wire.error?.message).toBe(TM_ERRORS.CREDENTIAL_EXPIRED.copy);
    });

    it('同一枚 token 在**别的账号**改密后不受影响（吊销是 per-user，不是全站）', async () => {
      const a = await ordinary(`d13c-${driver}`, driver, 'd13c-ordinary-pw-1');
      const b = await ordinary(`d13c-b-${driver}`, driver, 'd13c-other-pw-123');
      const tokenA = await loginNormal(a);
      const tokenB = await loginNormal(b);
      await settle();

      const changedB = await b.h.request('/api/password', {
        method: 'PUT',
        token: tokenB,
        body: { oldPassword: b.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      expect(changedB.status, changedB.raw).toBe(200);

      const stillA = await a.h.request('/api/me', { token: tokenA });
      expect([stillA.status, stillA.body.user_id], stillA.raw).toEqual([200, a.userId]);
    });
  });

  /* ─────────── 判据⑤ / D-13b：登出 = 会话语义，**不**作废全量 token（A-32-4） ─────────── */

  /**
   * ★★ 本组用例是**第四轮改写**的（裁决 A-32-4，报告 §10-3）。原文与改判理由：
   *
   *  - 原 D-13b 断言：「登出型操作（R-40③）同样推进 `password_changed_at` ⇒ 此前 token 作废，
   *    但不碰 `password` 列」。断言与实现**同时**按那个口径写死，于是"手机退出、网页端也被踢"
   *    被固化成了契约。
   *  - PRD 依据：R-40③ 的失效要求只挂在"**改密**"上（原文：修改密码后…此前签发的 token 全部失效，
   *    ≤60 秒内不可再用于任何写接口）；R-40 通篇是**安全语义**（吊销 = 凭据已变更）。
   *    登出是**会话语义**：R-39⑧ 把登出的动作面写在客户端（`AndroidBridge.saveToken('')`），
   *    §4.7 ④ 把 `auth.logout` 放进强制改密门禁白名单，也只是要给不可关闭的改密页留一条"退出"出口。
   *    **两处都没有**要求登出作废该账号其它设备/其它端的 token。
   *  - 后果对比：保留原语义 = 多端用户"在手机上点退出，网页端也掉线"，会被误读成账号被盗，
   *    且与 R-40⑤"上线零掉线"的取向相反。故按裁决改为：服务端不推进 `password_changed_at`，
   *    只记一条 `account_logout` 审计。
   *  - 判别力守恒（不是"把断言删掉"）：`password_changed_at` 从"必须 > before" 改为
   *    "**必须逐位 === before**"，另加三条"同一枚 token 仍然可用"（REST 读 / REST 写 / tRPC 读）
   *    与一条审计计数。若实现回退成推进 changed_at，本组三条会同时红。
   *    `await settle()`（跨 `iat` 秒边界）这一步保留，正是为了让"仍可用"有判别力（见用例内注释）。
   */
  describe(`判据⑤ / D-13b 登出不吊销（会话语义 · A-32-4） · ${driver}`, () => {
    it('REST 登出后同一枚 token 读写照旧、凭据三列一字不动，`account_audit_log` 恰 +1 条 `account_logout`', async () => {
      const a = await ordinary(`d13b-${driver}`, driver, 'd13b-ordinary-pw-1');
      const token = await loginNormal(a);
      const before = await a.h.credentialsOf(a.userId);
      expect(before.password_changed_at, `本用例的账号必须从 0 起步：${JSON.stringify(before)}`).toBe(0);

      // 先跨过 `iat` 的秒边界再登出：`password_changed_at` 落**毫秒**、`iat` 落**秒**，
      // 同一秒内的推进会被 `middleware/auth.ts:118` 的秒级换算吞掉。
      // 这条等待在这里的方向与原来**相反**：原来靠它证明"吊销看得见"，现在靠它证明
      // "若实现偷偷推进了 changed_at，下面的 `仍可用` 三条一定会红" —— 不跨秒就是随机绿。
      await settle();

      const out = await a.h.request('/api/logout', { token, body: {}, ip: uniqueIp() });
      expect([out.status, Object.keys(out.body)], out.raw).toEqual([200, ['ok']]); // §6.2 形状不动

      const creds = await a.h.credentialsOf(a.userId);
      expect(creds.password_changed_at, '登出**不得**推进 password_changed_at（那是改密的动作）').toBe(
        before.password_changed_at,
      );
      expect(creds.password).toBe(before.password);
      expect(creds.pw_policy_version).toBe(before.pw_policy_version);

      // "手机上退出、网页端也被踢" 就是本条要杀死的症状：同一枚 token 仍要能读能写
      const me = await a.h.request('/api/me', { token });
      expect([me.status, me.body.user_id], me.raw).toEqual([200, a.userId]);
      const write = await a.h.request('/api/wordbook', {
        method: 'PUT',
        token,
        body: { data: [{ word: 'apple', addedAt: 1_770_000_000_000 }] },
        ip: uniqueIp(),
      });
      expect([write.status, Object.keys(write.body)], write.raw).toEqual([200, ['ok']]);
      const wire = await a.h.trpc('auth.me', undefined, { method: 'GET', token });
      expect(wire.status, wire.raw).toBe(200);
      expect(wire.data?.user_id).toBe(a.userId);

      // 服务端仍然留痕（§4.5 对账口径：登出可回溯，只是不产生吊销副作用）
      const rows = await a.h.db.audit.listByUser(a.userId, 20);
      const logouts = rows.filter((r) => r.action === 'account_logout');
      expect(logouts.length, `审计动作序列 = ${JSON.stringify(rows.map((r) => r.action))}`).toBe(1);
      expect(logouts[0]?.result).toBe('ok');
    });

    it('tRPC `auth.logout` 与 REST 同一语义（两门面都不吊销、都留痕）', async () => {
      const a = await ordinary(`d13b-trpc-${driver}`, driver, 'd13b-trpc-pw-123');
      const token = await loginNormal(a);
      await settle();

      const wire = await a.h.trpc('auth.logout', {}, { token });
      expect(wire.status, wire.raw).toBe(200);
      expect(wire.data, wire.raw).toEqual({ ok: true });

      expect((await a.h.credentialsOf(a.userId)).password_changed_at).toBe(0);
      const rest = await a.h.request('/api/me', { token });
      expect([rest.status, rest.body.user_id], rest.raw).toEqual([200, a.userId]);
      const rows = await a.h.db.audit.listByUser(a.userId, 20);
      expect(rows.filter((r) => r.action === 'account_logout').length).toBe(1);
    });

    it('强制改密页的"退出"出口仍在：upgrade token 打登出 200（§4.7 ④ 白名单），且不动凭据三列', async () => {
      const a = await pending(`d13b-gate-${driver}`, driver, 'd13b-gate-pw-1234');
      const upgrade = await loginUpgrade(a);
      const before = await a.h.credentialsOf(a.userId);

      const out = await a.h.request('/api/logout', { token: upgrade, body: {}, ip: uniqueIp() });
      expect([out.status, Object.keys(out.body)], out.raw).toEqual([200, ['ok']]);

      const creds = await a.h.credentialsOf(a.userId);
      expect(creds.password_changed_at).toBe(before.password_changed_at);
      expect(creds.password).toBe(before.password);
      expect(creds.pw_policy_version).toBe(0); // 没改密就仍然停留在"待升级"人群（门禁不因此解除）
      const again = await a.h.request('/api/me', { token: upgrade });
      expect([again.status, again.body.upgradeRequired], again.raw).toEqual([200, true]);
    });
  });

  /* ─────────── 判据⑤ / D-14：上线时刻零掉线 ─────────── */

  describe(`判据⑤ / D-14 上线零掉线（password_changed_at=0） · ${driver}`, () => {
    /** 5 天前签发的 token = "发布前就在用户手里"的那一枚。 */
    const tokenFromDaysAgo = (userId: number, days = 5): string =>
      jwt.sign({ id: userId, iat: Math.floor(Date.now() / 1000) - days * 86_400 }, AUTH_SECRET, {
        expiresIn: '30d',
        noTimestamp: true,
      });

    it('存量账号（`password_changed_at=0`）的 5 天前旧 token：读写接口与 tRPC 全部可用', async () => {
      const a = await ordinary(`d14-${driver}`, driver, 'd14-ordinary-pw-12');
      const old = tokenFromDaysAgo(a.userId);
      expect((await a.h.credentialsOf(a.userId)).password_changed_at).toBe(0);

      const me = await a.h.request('/api/me', { token: old });
      expect([me.status, me.body.user_id, me.body.phone], me.raw).toEqual([200, a.userId, a.phone]);

      const write = await a.h.request('/api/wordbook', {
        method: 'PUT',
        token: old,
        body: { data: [{ word: 'apple', addedAt: 1_770_000_000_000 }] },
        ip: uniqueIp(),
      });
      expect([write.status, Object.keys(write.body)], write.raw).toEqual([200, ['ok']]);
      const read = await a.h.request('/api/wordbook', { token: old });
      expect((read.body.data as Array<Record<string, unknown>>).length).toBe(1);

      const wire = await a.h.trpc('auth.me', undefined, { method: 'GET', token: old });
      expect(wire.status, wire.raw).toBe(200);
      expect(wire.data?.user_id).toBe(a.userId);
    });

    it('同一枚旧 token：一旦该账号真的改过密码（`password_changed_at` 落**毫秒**），立刻 401', async () => {
      const a = await ordinary(`d14b-${driver}`, driver, 'd14b-ordinary-pw-1');
      const old = tokenFromDaysAgo(a.userId);
      expect((await a.h.request('/api/me', { token: old })).status).toBe(200);

      // 单位陷阱的实证面：落库毫秒、比较前换算成秒；写一次 `password_changed_at` 即作废全部旧 token
      await a.h.request('/api/password', {
        method: 'PUT',
        token: old,
        body: { oldPassword: a.password, newPassword: NEW_PW, confirmPassword: NEW_PW },
        ip: uniqueIp(),
      });
      const creds = await a.h.credentialsOf(a.userId);
      expect(creds.password_changed_at).toBeGreaterThan(1_600_000_000_000);

      const after = await a.h.request('/api/me', { token: old });
      expect([after.status, after.body.code], after.raw).toEqual([
        TM_ERRORS.CREDENTIAL_EXPIRED.http,
        'CREDENTIAL_EXPIRED',
      ]);
    });

    it('`password_changed_at=0` 的判定不依赖 `pw_policy_version`（已升级/待升级两账号同权）', async () => {
      const upgraded = await ordinary(`d14c-${driver}`, driver, 'd14c-ordinary-pw-1');
      const legacy = await pending(`d14c-legacy-${driver}`, driver, 'd14c-legacy-pw-12');
      const tokenUpgraded = tokenFromDaysAgo(upgraded.userId);
      // 待升级账号也签一枚同形状的**正常** token（不带 `aud`）：钉的是"吊销判定这一关"，
      // 门禁那一关由 D-15 单独钉，两件事不混在一起。
      const tokenLegacy = tokenFromDaysAgo(legacy.userId);

      expect((await upgraded.h.request('/api/me', { token: tokenUpgraded })).status).toBe(200);
      const r = await legacy.h.request('/api/me', { token: tokenLegacy });
      expect([r.status, r.body.user_id], r.raw).toEqual([200, legacy.userId]);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * A-36（批次3 出口第二轮）#3 / #4 的两条回环修用例 —— owner T-07 微轮
 *
 * 落点选在本文件（而不是新开 `auth-*.spec.ts`）的理由：`tools/ownership.json:740` 只登记了
 * `{auth-register,auth-hardening}.spec.ts` 两条 T-07 路径，新开文件要请 E 轮往 `tools/**`
 * 加登记行（本轮禁区）；本文件的夹具（`pending()` 造 `pw_policy_version=0` 的真实 bcrypt 账号、
 * `h.trpc()` 打 `/trpc/*` **线上形状**）正是这两条用例要的那两件，复用即零重复装配。
 *
 *  ① DEFECT-3：`password` 长度 4 的存量账号必须**进得到 service**、被判 `upgrade_required`，
 *     而不是在 `LoginInputSchema` 的 zod 层被 `min(8)` 拒掉（Q9' 的逻辑前提是"登得进来才谈强制改密"）。
 *     疫苗 = 把 `min(PASSWORD_MIN)/max` 加回登录面 → 本条必红。
 *  ② DEFECT-4：非法手机号的错误 message 必须是**逐字还原的人话**、且**不含任何全大写码串**。
 *     取证走 tRPC 客户端（`/trpc/auth.login`、`/trpc/auth.sendCode` 的 HTTP 响应体），
 *     不是只 `safeParse` schema —— 因为 A-36-4② 的判据是"用户界面上看到的串"，
 *     只有 errorFormatter 之后那一格才算数（`apps/web/src/components/login-dialog.tsx:50/:67`
 *     逐字是 `toast.error(err.message)`）。
 *     疫苗 = 把 message 换回 `'INVALID_PHONE'` → 本条必红。
 * ══════════════════════════════════════════════════════════════════════════ */

for (const driver of DRIVERS) {
  describe(`A-36-3（DEFECT-3）：登录面不验密码强度 · ${driver}`, () => {
    /** 4 位密码 = R-40① 之前的存量形态，**低于** `PASSWORD_MIN`（本文件已 import 该常量）。 */
    const LEGACY_SHORT_PASSWORD = 'abcd';

    it('`password` 长度 4 的存量账号经 tRPC `auth.login` 进得到 service、被判 `upgrade_required`', async () => {
      const a = await pending(`a36-3-login4-${driver}`, driver, LEGACY_SHORT_PASSWORD);
      expect(a.password.length).toBe(4);
      expect(a.password.length).toBeLessThan(PASSWORD_MIN);

      const wire = await a.h.trpc('auth.login', { phone: a.phone, password: a.password });

      // 1) 没在 zod 层被拒：`too_small` / `min(8)` 一旦回到登录面，这里就是 400 而不是 200
      expect(wire.status, wire.raw).toBe(200);
      expect(wire.error, wire.raw).toBeNull();
      expect(wire.raw).not.toContain('too_small');
      // 2) 真进了 service，并被**升级判定**接住（R-40④ / Q9'）：`upgrade_required` + upgrade token、无正常 token
      expect(wire.data?.upgrade_required, wire.raw).toBe(true);
      expect(wire.data?.token, wire.raw).toBe('');
      expect(String(wire.data?.upgradeToken ?? '')).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      expect(wire.data?.phone).toBe(a.phone);
      // 3) REST 门面同判（DEFECT-3 的锁死面只在 tRPC，修完两端必须一致；R-17⑧ 旧 APK 可用性不变）
      const rest = await a.h.request('/api/login', {
        body: { phone: a.phone, password: a.password },
        ip: uniqueIp(),
      });
      expect([rest.status, rest.body.upgrade_required], rest.raw).toEqual([200, true]);
      // 4) 摘掉登录面的强度策略**不等于**放开建密码面：同一个短密码走注册仍被 service 拒
      const weak = uniquePhone();
      const reg = await a.h.request('/api/register', {
        body: { phone: weak, password: LEGACY_SHORT_PASSWORD, confirmPassword: LEGACY_SHORT_PASSWORD, agreed: true },
        ip: uniqueIp(),
      });
      expect([reg.status, reg.body.code], reg.raw).toEqual([TM_ERRORS.WEAK_PASSWORD.http, 'WEAK_PASSWORD']);
    });
  });

  describe(`A-36-4（DEFECT-4）：非法手机号的 tRPC 错误面是人话、不是码串 · ${driver}`, () => {
    /** 三条不同坏法的手机号：空串 / 10 位 / 非数字，判定必须同源（只有一份 `PHONE_PATTERN`）。 */
    const BAD_PHONES = ['', '1380013800', 'abcdefghijk'];
    /** 全大写（可含数字/下划线）的码串形状：`INVALID_PHONE` / `BAD_REQUEST` / `SMS_NOT_CONFIGURED` 都算。 */
    const UPPERCASE_CODE = /[A-Z][A-Z0-9_]{2,}/;
    /** 基线"改动前"的逐字原文：`trpc-shape.baseline.json:3199`（login）/ `auth.sendCode` 段（sendCode，原行号锚已按符号名替换）。 */
    const LOGIN_COPY = '手机号格式不正确';
    const SEND_CODE_COPY = '请输入正确的手机号';

    /** zod 失败今天仍是"issues 序列化串当 message"（F-10 下一期收敛）→ 取客户端渲染那一格。 */
    const issuesOf = (message: string): Array<Record<string, unknown>> => {
      try {
        const parsed: unknown = JSON.parse(message);
        return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
      } catch {
        return [];
      }
    };

    it('`auth.login` 的 message 逐字 = 「手机号格式不正确」，且不含任何全大写码串', async () => {
      const h = await fresh(`a36-4-login-${driver}`, driver);
      for (const phone of BAD_PHONES) {
        const wire = await h.trpc('auth.login', { phone, password: 'abcdefghij' });
        expect(wire.status, `phone=${phone}`).toBe(400);
        const message = String(wire.error?.message ?? '');
        expect(message, `phone=${phone} 空 message`).not.toBe('');
        expect(message, `phone=${phone} 不得含码串`).not.toMatch(UPPERCASE_CODE);
        const issues = issuesOf(message);
        expect(issues.length, `phone=${phone} issues`).toBeGreaterThan(0);
        // 逐字等于还原后的人话串（不是"含"、不是"以…开头"）
        expect(issues[0]?.message, `phone=${phone}`).toBe(LOGIN_COPY);
        expect(issues[0]?.path).toEqual(['phone']);
      }
    });

    it('`auth.sendCode` 的 message 逐字 = 「请输入正确的手机号」：两条不合并、判定只有一份', async () => {
      const h = await fresh(`a36-4-send-${driver}`, driver);
      for (const phone of BAD_PHONES) {
        const wire = await h.trpc('auth.sendCode', { phone });
        expect(wire.status, `phone=${phone}`).toBe(400);
        const message = String(wire.error?.message ?? '');
        expect(message, `phone=${phone} 不得含码串`).not.toMatch(UPPERCASE_CODE);
        const issues = issuesOf(message);
        expect(issues[0]?.message, `phone=${phone}`).toBe(SEND_CODE_COPY);
        expect(issues[0]?.path).toEqual(['phone']);
      }
      // 两条串各自独立（A-36-4①：语境不同，合并仍会打穿基线指纹）
      expect(SEND_CODE_COPY).not.toBe(LOGIN_COPY);
      const login = await h.trpc('auth.login', { phone: '1380013800', password: 'abcdefghij' });
      const send = await h.trpc('auth.sendCode', { phone: '1380013800' });
      expect(issuesOf(String(login.error?.message))[0]?.message).toBe(LOGIN_COPY);
      expect(issuesOf(String(send.error?.message))[0]?.message).toBe(SEND_CODE_COPY);
      // 合法手机号在 zod 这一关**不**报格式错（证明没有把判定抄成第二份、也没放宽正则）
      const okWire = await h.trpc('auth.sendCode', { phone: uniquePhone() });
      expect(issuesOf(String(okWire.error?.message ?? '')).map((i) => i.message)).not.toContain(SEND_CODE_COPY);
    });
  });
}
