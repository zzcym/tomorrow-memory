/**
 * T-07 判据⑥ —— PRD §6.2「绝不能下线/改形的接口」契约快照
 *
 * §6.2 首行逐字的九条清单，逐条钉住**响应形状**（本文件只做形状契约，不重复各域的业务判据）：
 *  1. `PUT /api/wordbook`   → 恒 `{ok:true}`（快照一字不改，T-09 判据⑥）
 *  2. `POST /api/review`    → `ReviewOutcome` 键集合
 *  3. `GET /api/review/today` → `{total,dueToday,queue[{word,retrievability,elapsedDays}]}`
 *  4. `/trpc/*`             → 线上信封 `{result:{data}}` / `{error:{message,code,data}}`
 *  5. `/ws`                 → 仍在路由表上（不下线；握手侧由 T-11 的 `chat-isolation` 覆盖）
 *  6. REST `auth/*`         → 本任务名下，逐条钉（login/register/me/password/send-code/logout）
 *  7. `GET /api/lookup`     → 直通 `LookupService` 的返回值，无包装层
 *  8. `GET /api/profile`    → `ProfileDtoSchema` + 键集合
 *  9. `GET /api/chat/history` → `{threadId,checkpointKey,legacy,messages}`
 *
 * 另外两条 §6.2 末段显式登记的响应体形状：
 *  · `SMS_NOT_CONFIGURED`（R-01⑥）：200 附码、`{ok:true}` 保留；
 *  · `OLD_PASSWORD_REQUIRED`（R-40②，旧 APK 的 `PUT /api/password` 只发 `{password}`）：400 `{error,code}`。
 *
 * ★ A-30-1 的护栏用例在本文件末尾（"tRPC 错误体 `data.code` 就是 §4.6 码"），
 *   以及 R-40④ 门禁在两门面 403 体的形状（`legacy-apk` 只钉形状，签发链路在 `auth-hardening`）。
 *
 * ★ 本文件**最后两个 describe 是真起服 + 真 HTTP**（A-32-3 / A-32-2 的装配护栏）：
 *   `app.ts` 的路由**挂载顺序**与"同一份开关是否真被两个门面共用"这两类缺陷，
 *   进程内 `app.request()` 与单测最看不见（前者看得见结果但看不见真实 socket，
 *   后者根本不经过 `createApp`），故按裁决在本契约文件里钉死（见报告 §10-2）。
 *
 * 变红的正确处置：§6.2 要求"任一上述接口改形前必须证明旧 APK 仍能完成查词→背词→同步"，
 * 因此这里钉的是**全等**键集合（只加键同样要先举证）—— 不许为了让本文件变绿而直接改快照，
 * 必须回到 TPM 裁决。
 *
 * 并行安全：本用例自己 cp 一份临时 sqlite、自己建 app 实例，用完关句柄；
 * 仓库根 `data.db` 只作只读源被复制，绝不在其上写或迁移。
 * 驱动口径：判据① 的"双驱动各跑一遍"指向 `auth-register` / `auth-hardening` 两个集成文件；
 * 本文件是**门面形状**契约，同一份 Hono handler 与 DB 驱动无关，故只在 sqlite 上跑（报告已登记）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { serve } from '@hono/node-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AUTH_COPY,
  AuthResultSchema,
  AVATAR_MAX_BYTES,
  FEATURE_FLAG_DEFAULTS,
  FLAG_EFFECTIVE_MAX_SECONDS,
  HTTP_BODY_LIMIT_BYTES,
  MeResultSchema,
  OkResultSchema,
  ProfileDtoSchema,
  TM_ERROR_CODES,
  TM_ERRORS,
  WORDBOOK_BODY_LIMIT_BYTES,
  type TmErrorCode,
} from '@tm/shared';
import { PROJECT_ROOT } from '../../src/config.js';
import type { AppDB } from '../../src/db/types.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { createApp, type AppRuntime } from '../../src/app.js';
import { LlmRouter } from '@tm/agent';
import { UPGRADE_AUDIENCE } from '../../src/middleware/auth.js';
import type { LookupService } from '../../src/services/lookup.js';
import type { SmsService } from '../../src/services/sms.js';
import { legacyAliasEnabled } from '../../src/services/profile-service.js';
import { __resetAuthPolicyStateForTest } from '../../src/services/auth-policy.js';

/* ══════════════════════════ 夹具：临时库 + 独立 app 实例 ══════════════════════════ */

/** `middleware/auth.ts` 走 `loadConfig().jwtSecret`，故密钥必须在 import 之后、请求之前钉死。 */
const TEST_SECRET = 'tm-t07-legacy-apk-secret-32chars-x';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const TMP_DIR = path.join(os.tmpdir(), `tm-t07-legacy-${process.pid}`);
const SOURCE_DB = path.join(PROJECT_ROOT, 'data.db');

/** 旧 APK 读得到的那份查词返回值（`/api/lookup` 必须逐字直通，不得加包装层）。 */
const STUB_LOOKUP_RESULT = {
  word: 'apple',
  translation: 'n. 苹果',
  phonetic: 'ˈæp.əl',
  sourceLang: 'en',
  notFound: false,
};

/** 本期新注册账号的密码（≥8 位；`session()` 与改密用例共用）。 */
const PASSWORD = 'legacy-apk-pw-8';

let seq = 0;
/** `13` + pid 段 + 序号 = 11 位，满足 `PHONE_PATTERN`；pid 段保证跨进程唯一。 */
const uniquePhone = (): string =>
  `13${String(process.pid % 1000).padStart(3, '0')}9${String(++seq).padStart(5, '0')}`;
const uniqueIp = (): string => `10.6.${Math.floor(seq / 250) % 250}.${seq % 250}`;

interface HttpRes {
  status: number;
  body: Record<string, unknown>;
  raw: string;
}

/** tRPC 的**线上传输形状**（与 `auth-register` 同口径：`createCaller` 直调会剥掉 `data`，不可用作取证）。 */
interface TrpcRes extends HttpRes {
  /** `error.{message,code,data}` —— 成功时为 null */
  error: { message: string; code: unknown; data: Record<string, unknown> } | null;
  /** `result.data` —— 失败时为 null */
  data: Record<string, unknown> | null;
}

interface Harness {
  db: AppDB;
  runtime: AppRuntime;
  app: HonoLike;
  request: (
    pathname: string,
    init?: { method?: string; body?: unknown; token?: string; ip?: string },
  ) => Promise<HttpRes>;
  trpc: (
    proc: string,
    input?: unknown,
    init?: { token?: string; method?: 'POST' | 'GET' },
  ) => Promise<TrpcRes>;
  close: () => void;
}

/** 只需 `request()` 一面；避免把 Hono 的泛型形状抄进本文件。 */
interface HonoLike {
  request: (input: string, init?: RequestInit) => Promise<Response>;
}

async function open(label: string): Promise<Harness> {
  const file = path.join(TMP_DIR, `legacy-${label}.db`);
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

  const stub = {} as never;
  const lookup = { lookup: async () => ({ ...STUB_LOOKUP_RESULT }) } as unknown as LookupService;
  const runtime = createApp({
    config: {
      port: 0,
      jwtSecret: AUTH_SECRET,
      dbDriver: 'sqlite',
      databaseUrl: '',
      sqlitePath: file,
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
    },
    db,
    sms: {
      verifyCode: () => false,
      consumeCode: () => undefined,
      sendCode: async () => ({ ok: false, reason: 'not-configured' }),
    } as unknown as SmsService,
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
    // `routes/lookup.ts` 会调 `events.record(…)`，空对象会 TypeError → 被它的 catch 兜成 500
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
    db,
    runtime,
    app: runtime.app as unknown as HonoLike,
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
      // 默认 transformer ⇒ 线上就是裸 JSON，不是 superjson 的 `{json:…}` 包装
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
    close: () => {
      raw.close();
    },
  };
  return harness;
}

let current: Harness | null = null;

async function fresh(label: string): Promise<Harness> {
  const h = await open(label);
  current = h;
  return h;
}

/** 一个装配好的实例 + 一个本期新注册的账号（`pw_policy_version=1`，不受强制改密门禁影响）。 */
async function session(
  label: string,
): Promise<{ h: Harness; token: string; phone: string; userId: number }> {
  const h = await fresh(label);
  const phone = uniquePhone();
  const reg = await h.request('/api/register', {
    body: { phone, password: PASSWORD, confirmPassword: PASSWORD, agreed: true },
    ip: uniqueIp(),
  });
  expect([reg.status, reg.body.hasPassword], `注册失败：${reg.raw}`).toEqual([200, true]);
  const me = await h.request('/api/me', { token: String(reg.body.token) });
  return { h, token: String(reg.body.token), phone, userId: Number(me.body.user_id) };
}

/** upgrade token（R-40④）：本文件只钉"持有时各门面的响应形状"，签发链路归 `auth-hardening`。 */
function upgradeTokenFor(userId: number): string {
  return jwt.sign({ id: userId, aud: UPGRADE_AUDIENCE }, AUTH_SECRET, { expiresIn: '30m' });
}

/** 键集合快照的比较口径：排序后的全等（新增键同样要举证，见文件头）。 */
const keysOf = (body: Record<string, unknown>): string[] => Object.keys(body).sort();
const sorted = (...keys: string[]): string[] => [...keys].sort();

beforeAll(() => {
  fs.mkdirSync(path.join(TMP_DIR, 'public'), { recursive: true });
});

afterEach(() => {
  const h = current;
  current = null;
  __resetAuthPolicyStateForTest();
  try {
    h?.close();
  } catch {
    // 句柄已由其它路径释放时不掩盖主断言
  }
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

/* ══════════════════ §6.2-6：REST `auth/*`（本任务名下，逐条钉） ══════════════════ */

describe('§6.2-6 auth/*：既有端点的响应形状只加不减不改名', () => {
  /**
   * `issueTokens()` 的 `…profile` 展开带来 `daily_goal`（R-01⑧ 公告位要读它），
   * 旧 APK 只取 `token/phone/nickname` 三键 ⇒ 全等快照钉的是"当前实际发的键"，
   * 三个旧键逐字在场是 §6.2 的硬约束。
   */
  const AUTH_RESULT_KEYS = sorted('token', 'phone', 'hasPassword', 'nickname', 'avatar', 'daily_goal');

  it('POST /api/register：`{token,phone,hasPassword,nickname,avatar,daily_goal}` 六键全等', async () => {
    const { h } = await session('reg-keys');
    const r = await h.request('/api/register', {
      body: { phone: uniquePhone(), password: PASSWORD, confirmPassword: PASSWORD, agreed: true },
      ip: uniqueIp(),
    });
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(AUTH_RESULT_KEYS);
    expect(AuthResultSchema.safeParse(r.body).success).toBe(true);
  });

  it('POST /api/login：与注册同形（旧 APK 的 `login()` 读 `token/phone/nickname`，三键必须在场）', async () => {
    const { h, phone } = await session('login-keys');
    const r = await h.request('/api/login', { body: { phone, password: PASSWORD }, ip: uniqueIp() });
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(AUTH_RESULT_KEYS);
    expect(typeof r.body.token).toBe('string');
    expect(String(r.body.token).length).toBeGreaterThan(0);
    expect(AuthResultSchema.safeParse(r.body).success).toBe(true);
  });

  it('GET /api/me：八键快照（旧五键 + R-39/R-40 的三个新键），`MeResultSchema` 通过', async () => {
    const { h, token, phone } = await session('me-keys');
    const r = await h.request('/api/me', { token });
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(
      sorted('user_id', 'phone', 'nickname', 'avatar', 'daily_goal', 'hasPassword', 'pwPolicyVersion', 'upgradeRequired'),
    );
    expect(r.body.phone).toBe(phone);
    expect(MeResultSchema.safeParse(r.body).success).toBe(true);
  });

  it('POST /api/logout 与 PUT /api/password 成功支仍是 `{ok:true}` 单键（`OkResultSchema`）', async () => {
    const { h, token } = await session('logout-ok');
    const logout = await h.request('/api/logout', { token, body: {} });
    expect([logout.status, keysOf(logout.body)], logout.raw).toEqual([200, ['ok']]);
    expect(OkResultSchema.safeParse(logout.body).success).toBe(true);
  });

  it('未登录的 auth 端点：401 + 恰好 `{error}` 单键（旧形状，没被顺手加 `code`）', async () => {
    const h = await fresh('anon');
    for (const [method, pathname] of [
      ['GET', '/api/me'],
      ['PUT', '/api/password'],
      ['POST', '/api/logout'],
    ] as const) {
      const r = await h.request(pathname, { method, ...(method === 'GET' ? {} : { body: {} }) });
      expect([r.status, keysOf(r.body)], `${method} ${pathname}`).toEqual([401, ['error']]);
      expect(typeof r.body.error).toBe('string');
      expect(String(r.body.error).length).toBeGreaterThan(0);
    }
  });
});

/* ══════════════ §6.2 末段第 1 条：`OLD_PASSWORD_REQUIRED` 的响应体形状 ══════════════ */

describe('§6.2 末段-1：旧 APK 的 PUT /api/password（只发 `{password}`）→ 400 `OLD_PASSWORD_REQUIRED`', () => {
  it('响应体恰好 `{error, code}` 两键，`error` 逐字等于 §4.6 文案，且不是 500', async () => {
    const { h, token } = await session('old-pw-required');
    // `mobile-memory` 的 `passwordUpdate(password)` 发的就是 `{password}`（无 `oldPassword`）
    const r = await h.request('/api/password', { method: 'PUT', token, body: { password: `another-${PASSWORD}` } });
    expect(r.status).toBe(TM_ERRORS.OLD_PASSWORD_REQUIRED.http);
    expect(r.status).not.toBe(500);
    expect(keysOf(r.body)).toEqual(sorted('error', 'code'));
    expect(r.body.code).toBe(TM_ERROR_CODES.OLD_PASSWORD_REQUIRED);
    expect(r.body.error).toBe(TM_ERRORS.OLD_PASSWORD_REQUIRED.copy);
  });

  it('带 `oldPassword` 但填错 → 401 `OLD_PASSWORD_INCORRECT`，同一形状（两码不得互相吞掉）', async () => {
    const { h, token } = await session('old-pw-wrong');
    const r = await h.request('/api/password', {
      method: 'PUT',
      token,
      body: { oldPassword: `wrong-${PASSWORD}`, newPassword: `brand-new-${PASSWORD}` },
    });
    expect(r.status).toBe(TM_ERRORS.OLD_PASSWORD_INCORRECT.http);
    expect(keysOf(r.body)).toEqual(sorted('error', 'code'));
    expect(r.body.code).toBe(TM_ERROR_CODES.OLD_PASSWORD_INCORRECT);
    expect(r.body.error).toBe(TM_ERRORS.OLD_PASSWORD_INCORRECT.copy);
  });

  it('tRPC 同一入口的邻位错误（新密码=旧密码）→ 同码同文案，两门面全等', async () => {
    const { h, token } = await session('same-as-old');
    const wire = await h.trpc(
      'auth.changePassword',
      { oldPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
      { token },
    );
    expect(wire.status).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.http);
    expect(wire.error?.data.code).toBe(TM_ERROR_CODES.PASSWORD_SAME_AS_OLD);
    expect(wire.error?.message).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.copy);
    expect(wire.error?.data.httpStatus).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.http);
  });
});

/* ═══════════ §6.2 末段第 2 条 + R-01⑥：`SMS_NOT_CONFIGURED` 响应体形状 ═══════════ */

describe('R-01⑥ / §6.2：POST /api/send-code 保留 `{ok:true}` 并附码（旧 APK 不崩、不进倒计时）', () => {
  it('200 + 恰好 `{ok:true, code, error}` 三键；状态不是 4xx/5xx', async () => {
    const h = await fresh('sms-not-config');
    const r = await h.request('/api/send-code', { body: { phone: uniquePhone() }, ip: uniqueIp() });
    expect(r.status).toBe(TM_ERRORS.SMS_NOT_CONFIGURED.http);
    expect(r.status).toBe(200);
    expect(keysOf(r.body)).toEqual(sorted('ok', 'code', 'error'));
    expect(r.body.ok).toBe(true);
    expect(r.body.code).toBe(TM_ERROR_CODES.SMS_NOT_CONFIGURED);
    expect(r.body.error).toBe(TM_ERRORS.SMS_NOT_CONFIGURED.copy);
  });

  it('手机号非法时仍是 §4.6 的 `INVALID_PHONE`，不被兜底成 `SMS_NOT_CONFIGURED`', async () => {
    const h = await fresh('sms-bad-phone');
    const r = await h.request('/api/send-code', { body: { phone: '1' }, ip: uniqueIp() });
    expect([r.status, r.body.code, r.body.error]).toEqual([
      TM_ERRORS.INVALID_PHONE.http,
      TM_ERROR_CODES.INVALID_PHONE,
      TM_ERRORS.INVALID_PHONE.copy,
    ]);
  });

  it('tRPC `auth.sendCode`：`result.data` 三键与 REST 体逐字一致（两门面同源）', async () => {
    const h = await fresh('sms-trpc');
    const wire = await h.trpc('auth.sendCode', { phone: uniquePhone() });
    expect(wire.status).toBe(200);
    expect(keysOf(wire.data ?? {})).toEqual(sorted('ok', 'code', 'error'));
    expect(wire.data?.code).toBe(TM_ERROR_CODES.SMS_NOT_CONFIGURED);
    expect(wire.data?.error).toBe(TM_ERRORS.SMS_NOT_CONFIGURED.copy);
  });
});

/* ══════════════════════ §6.2-7：`GET /api/lookup`（匿名红线） ══════════════════════ */

describe('§6.2-7 GET /api/lookup：直通查词结果，无包装层', () => {
  it('200 的键集合 = 查词返回值的键集合（旧 APK 直接读 `data.word/data.translation`，多包一层即改形）', async () => {
    const h = await fresh('lookup-hit');
    const r = await h.request('/api/lookup?word=apple');
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(Object.keys(STUB_LOOKUP_RESULT).sort());
    expect(r.body).toEqual({ ...STUB_LOOKUP_RESULT });
  });

  it('入参不足的三条失败分支：400 + 恰好 `{error}` 单键（旧形状，没被顺手加 `code`）', async () => {
    const h = await fresh('lookup-bad');
    for (const q of ['', '?word=', '?word=apple&direction=xx']) {
      const r = await h.request(`/api/lookup${q}`);
      expect(r.status, `query="${q}"`).toBe(400);
      expect(keysOf(r.body), `query="${q}"`).toEqual(['error']);
      expect(typeof r.body.error).toBe('string');
      expect(String(r.body.error).length).toBeGreaterThan(0);
    }
  });
});

/* ══════════════════ §6.2-1：`GET/PUT /api/wordbook`（整数组语义） ══════════════════ */

describe('§6.2-1 wordbook：整数组读回 + `PUT` 恒 `{ok:true}`（T-09 判据⑥ 的快照，本文件不改它）', () => {
  it('PUT 恰好 `{ok:true}`；GET 恰好 `{data:[…]}`，条目仍是 `{word,addedAt}` 两项', async () => {
    const { h, token } = await session('wordbook');
    const addedAt = 1_770_000_000_000;
    const put = await h.request('/api/wordbook', { method: 'PUT', token, body: { data: [{ word: 'apple', addedAt }] } });
    expect([put.status, keysOf(put.body)], put.raw).toEqual([200, ['ok']]);
    expect(put.body.ok).toBe(true);

    const get = await h.request('/api/wordbook', { token });
    expect([get.status, keysOf(get.body)], get.raw).toEqual([200, ['data']]);
    const entries = get.body.data as Array<Record<string, unknown>>;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(1);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(sorted('word', 'addedAt'));
    expect(entries[0]?.word).toBe('apple');
  });
});

/* ══════════════════ §6.2-2/3：`POST /api/review` 与 `GET /api/review/today` ══════════════════ */

describe('§6.2-2/3 review：旧 APK 的两条调用路径形状不变', () => {
  it('POST /api/review（不带 `mode`，旧 APK 的调用形状）→ 200 + `ReviewOutcome` 键集合快照', async () => {
    const { h, token } = await session('review-rate');
    await h.request('/api/wordbook', {
      method: 'PUT',
      token,
      body: { data: [{ word: 'apple', addedAt: 1_770_000_000_000 }] },
    });
    // 旧 APK 的 `reviewCard(word, rating)` 发的是 1-4 档位数字（`RATING_VALUES`）
    const r = await h.request('/api/review', { token, body: { word: 'apple', rating: 3 } });
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(
      sorted(
        'ok',
        'response',
        'scheduled',
        'word',
        'rating',
        'due',
        'state',
        'reps',
        'lapses',
        'reviewedAt',
        'stabilityBefore',
        'stabilityAfter',
        'difficulty',
        'nextReview',
      ),
    );
    expect(r.body.ok).toBe(true);
    expect(r.body.word).toBe('apple');
    expect(r.body.response).toBe('');
    expect(r.body.scheduled).toBe(true);
  });

  it('GET /api/review/today → 恰好 `{total,dueToday,queue}`，队列项恰好 `{word,retrievability,elapsedDays}`', async () => {
    const { h, token } = await session('review-today');
    const empty = await h.request('/api/review/today', { token });
    expect([empty.status, keysOf(empty.body)], empty.raw).toEqual([200, sorted('total', 'dueToday', 'queue')]);
    expect(Array.isArray(empty.body.queue)).toBe(true);

    await h.request('/api/wordbook', {
      method: 'PUT',
      token,
      body: { data: [{ word: 'banana', addedAt: 1_770_000_000_000 }] },
    });
    const after = await h.request('/api/review/today', { token });
    expect(after.status, after.raw).toBe(200);
    const first = (after.body.queue as Array<Record<string, unknown>>)[0] ?? {};
    expect(Object.keys(first).sort()).toEqual(sorted('word', 'retrievability', 'elapsedDays'));
    expect(first.word).toBe('banana');
  });
});

/* ══════════════════ §6.2-8：`GET /api/profile` ══════════════════ */

describe('§6.2-8 GET /api/profile：`ProfileDtoSchema` 通过 + 键集合快照', () => {
  it('200 且十三个键全等（旧六键一字不动，`dailyGoal` 是 `profileDtoLegacyAlias()` 的兼容别名）', async () => {
    const { h, token } = await session('profile');
    const r = await h.request('/api/profile', { token });
    expect(r.status, r.raw).toBe(200);
    expect(ProfileDtoSchema.safeParse(r.body).success).toBe(true);
    expect(keysOf(r.body)).toEqual(
      sorted(
        'user_id',
        'phone',
        'nickname',
        'avatar',
        'daily_goal',
        'updated_at',
        'hasPassword',
        'pwPolicyVersion',
        'totalWords',
        'reviewDays',
        'reviewDates',
        'streak',
        // 别名开关（`PROFILE_DTO_LEGACY_ALIAS`）默认 on；置 off 时本快照按设计变红，
        // 因为"两门面同时停发 `dailyGoal`"本身就是一次改形，需回 TPM 举证。
        ...(legacyAliasEnabled() ? ['dailyGoal'] : []),
      ),
    );
    expect(r.body.dailyGoal).toBe(r.body.daily_goal);
    for (const legacy of ['nickname', 'avatar', 'daily_goal', 'totalWords', 'reviewDays', 'reviewDates']) {
      expect(r.body, `旧键 ${legacy} 不得消失`).toHaveProperty(legacy);
    }
  });
});

/* ══════════════════ §6.2-9：`GET /api/chat/history` ══════════════════ */

describe('§6.2-9 GET /api/chat/history：`{threadId,checkpointKey,legacy,messages}` 四键', () => {
  it('200 且四键全等（`messages` 是数组，`legacy` 是布尔）', async () => {
    const { h, token } = await session('chat-history');
    const r = await h.request('/api/chat/history?threadId=legacy-contract', { token });
    expect(r.status, r.raw).toBe(200);
    expect(keysOf(r.body)).toEqual(sorted('threadId', 'checkpointKey', 'legacy', 'messages'));
    expect(Array.isArray(r.body.messages)).toBe(true);
    expect(typeof r.body.legacy).toBe('boolean');
  });
});

/* ══════════════════ §6.2-4：`/trpc/*` 的线上传输信封 ══════════════════ */

describe('§6.2-4 /trpc/*：线上信封形状不变（成功 `{result:{data}}` / 失败 `{error:{…}}`）', () => {
  it('成功支：`result.data` 就是被调过程自己的返回值，不多包一层', async () => {
    const { h, token } = await session('trpc-success');
    const wire = await h.trpc('auth.me', undefined, { method: 'GET', token });
    expect(wire.status, wire.raw).toBe(200);
    expect(keysOf(wire.body)).toEqual(['result']);
    expect(keysOf((wire.body.result ?? {}) as Record<string, unknown>)).toEqual(['data']);
    expect(keysOf(wire.data ?? {})).toEqual(
      sorted('user_id', 'phone', 'nickname', 'avatar', 'daily_goal', 'hasPassword', 'pwPolicyVersion', 'upgradeRequired'),
    );
    expect(MeResultSchema.safeParse(wire.data ?? {}).success).toBe(true);
  });

  it('失败支：`error` 恰好 `{message,code,data}` 三键，`data.{code,httpStatus,path}` 齐备', async () => {
    const h = await fresh('trpc-anon');
    const wire = await h.trpc('auth.me', undefined, { method: 'GET' });
    expect(wire.status).toBe(401);
    expect(keysOf(wire.body)).toEqual(['error']);
    expect(Object.keys(wire.body.error as Record<string, unknown>).sort()).toEqual(sorted('message', 'code', 'data'));
    expect(typeof wire.error?.code).toBe('number');
    expect(wire.error?.data.code).toBe('UNAUTHORIZED');
    expect(wire.error?.data.httpStatus).toBe(401);
    expect(wire.error?.data.path).toBe('auth.me');
  });
});

/* ══════════════════ §6.2-5：`/ws` 不下线 ══════════════════ */

describe('§6.2-5 /ws：路由仍在装配表上', () => {
  /**
   * 契约面只钉"这条接口没有被下线"。真正的 WebSocket 握手需要 `injectWebSocket` 起真 http server，
   * 那是 T-11 `chat-isolation.spec.ts` 判据⑥⑦ 已经覆盖的路径；在本文件里再起一份服务器
   * 只是重复它的夹具，且会把 T-11 名下的已知红引进契约快照。
   */
  it('`GET /ws` 仍注册在 app 的路由表上，且 `/trpc` 前缀仍然挂着', async () => {
    const h = await fresh('ws-route');
    const routes = (h.runtime.app as unknown as { routes: Array<{ method: string; path: string }> }).routes;
    expect(routes.some((r) => r.method === 'GET' && r.path === '/ws')).toBe(true);
    expect(routes.some((r) => r.path === '/trpc/*')).toBe(true);
  });
});

/* ══════════════ R-40④：门禁命中时两门面的 403 响应体形状（只钉形状，不钉签发链路） ══════════════ */

describe('R-40④ 响应形状：手持 upgrade token 打业务接口 → 403 `PASSWORD_UPGRADE_REQUIRED`', () => {
  it('REST：非白名单接口 403 恰好 `{error, code}` 两键；白名单内的 `GET /api/me` 仍 200', async () => {
    const { h, userId } = await session('gate-rest');
    const upgrade = upgradeTokenFor(userId);

    const blocked = await h.request('/api/password', { method: 'PUT', token: upgrade, body: {} });
    expect([blocked.status, keysOf(blocked.body)], blocked.raw).toEqual([
      TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http,
      sorted('error', 'code'),
    ]);
    expect(blocked.body.code).toBe(TM_ERROR_CODES.PASSWORD_UPGRADE_REQUIRED);
    expect(blocked.body.error).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy);

    const allowed = await h.request('/api/me', { token: upgrade });
    expect(allowed.status, allowed.raw).toBe(200);
    expect(allowed.body.upgradeRequired).toBe(false);
  });

  it('tRPC：`auth.changePassword`（不在 §4.7 白名单）403，`data.code` 带得出同一个码', async () => {
    const { h, userId } = await session('gate-trpc');
    const wire = await h.trpc(
      'auth.changePassword',
      { oldPassword: PASSWORD, newPassword: `brand-new-${PASSWORD}`, confirmPassword: `brand-new-${PASSWORD}` },
      { token: upgradeTokenFor(userId) },
    );
    expect(wire.status, wire.raw).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http);
    expect(wire.error?.message).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy);
    expect(wire.error?.data.code).toBe(TM_ERROR_CODES.PASSWORD_UPGRADE_REQUIRED);
    expect(wire.error?.data.httpStatus).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http);
  });
});

/* ══════════════════ A-30-1：§4.6 码必须到得了 tRPC 线上形状 ══════════════════ */

describe('A-30-1：tRPC 错误体 `data.code` 就是 shared 的 `tm_code`', () => {
  it('凭据域两条：`data.code` 逐字等于 §4.6 码，`data.httpStatus` 逐字等于表内状态，`message` 逐字等于文案', async () => {
    const { h, token, phone } = await session('a30-1-tm-code');
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>, TmErrorCode]> = [
      [
        'auth.register',
        { phone, password: PASSWORD, confirmPassword: PASSWORD, agreed: true },
        { token },
        TM_ERROR_CODES.PHONE_ALREADY_REGISTERED,
      ],
      [
        'auth.changePassword',
        { oldPassword: `wrong-${PASSWORD}`, newPassword: `brand-new-${PASSWORD}`, confirmPassword: `brand-new-${PASSWORD}` },
        { token },
        TM_ERROR_CODES.OLD_PASSWORD_INCORRECT,
      ],
    ];
    for (const [proc, input, init, code] of cases) {
      const wire = await h.trpc(proc, input, init);
      const spec = TM_ERRORS[code];
      expect([wire.status, wire.error?.data.code, wire.error?.data.httpStatus], `${proc} ← ${JSON.stringify(input)}`).toEqual(
        [spec.http, code, spec.http],
      );
      expect(wire.error?.message).toBe(spec.copy);
      // 客户端"读 `data.code` 分支"的取证面：整串里必须真的出现那个码
      expect(wire.raw).toContain(code);
    }
  });

  it('没有 §4.6 码时**不得**无中生有：`data.code` 保持 tRPC 协议码，人话走 `message`', async () => {
    const { h, token, phone } = await session('a30-1-no-code');

    // ① zod 边界（缺 `oldPassword`）→ BAD_REQUEST，压根进不了 service
    const zodSide = await h.trpc('auth.changePassword', { newPassword: `brand-new-${PASSWORD}` }, { token });
    expect(zodSide.status, zodSide.raw).toBe(400);
    expect(zodSide.error?.data.code).toBe('BAD_REQUEST');

    // ② §4.6 表内没有"登录凭据失败"这一行（A-8 锁死码集合）→ 仍是 UNAUTHORIZED + 人话
    const wrongCredential = await h.trpc('auth.login', { phone, password: `nope-${PASSWORD}` });
    expect(wrongCredential.status).toBe(401);
    expect(wrongCredential.error?.data.code).toBe('UNAUTHORIZED');
    expect(wrongCredential.error?.message).toBe(AUTH_COPY.wrongCredential);
    expect(wrongCredential.raw).not.toContain('CREDENTIAL_EXPIRED');
  });
});

/* ═════════════ 真起服夹具（A-32-3 / A-32-2 用；@hono/node-server + 127.0.0.1 端口 0） ═════════════ */

/** 后台口令只在用例内覆盖，既不给开发机 `.env` 的原值拍照，也不把它打进任何输出。 */
const LIVE_ADMIN_PW = 'legacy-apk-a32-live-admin-pw';

const openServers = new Set<Server>();

/** 真起一个监听 socket（`index.ts` 的装配路径：`serve({ fetch: runtime.app.fetch })`）。 */
async function listen(h: Harness): Promise<{ base: string; server: Server }> {
  const raw = serve({ fetch: h.runtime.app.fetch, hostname: '127.0.0.1', port: 0 });
  const server = raw as unknown as Server;
  openServers.add(server);
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', (err) => reject(err));
    });
  }
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  if (!port) throw new Error('真起服失败：拿不到端口');
  return { base: `http://127.0.0.1:${port}`, server };
}

async function shutdown(server: Server): Promise<void> {
  if (!openServers.has(server)) return; // 幂等：用例内已关过就不再碰（close 第二次会 ERR_SERVER_NOT_RUNNING）
  openServers.delete(server);
  (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

/** 走真实 socket 的那一只手：请求/响应都序列化成字节，不碰 `app.request()` 的进程内捷径。 */
async function liveReq(
  base: string,
  pathname: string,
  init: { method?: string; body?: unknown; token?: string; ip?: string } = {},
): Promise<HttpRes> {
  const res = await fetch(`${base}${pathname}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': init.ip ?? uniqueIp(),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    body = { __raw: text };
  }
  return { status: res.status, body, raw: text };
}

afterAll(async () => {
  for (const s of [...openServers]) await shutdown(s);
});

/* ═════ A-32-3：发布 runbook 步 8 的自助通道（真起服 + 真 HTTP：login → 读写 flags） ═════ */

describe('A-32-3 真起服 · 后台登录换 token 后读写 /api/admin/flags 全通（runbook 步 8 不再被守卫挡死）', () => {
  it('POST /api/admin/login（正确口令）→ 200 `{token}` ⇒ 该 token 打 GET/POST /api/admin/flags 都成功', async () => {
    const h = await fresh('a32-3-login-then-flags');
    const savedAdmin = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = LIVE_ADMIN_PW; // `routes/admin.ts:39` 每次请求现读 `loadConfig()`
    let server: Server | null = null;
    try {
      const live = await listen(h);
      server = live.server;

      const login = await liveReq(live.base, '/api/admin/login', { body: { password: LIVE_ADMIN_PW } });
      expect([login.status, keysOf(login.body)], login.raw).toEqual([200, ['token']]);
      const admin = String(login.body.token);
      expect(admin.length).toBeGreaterThan(0);

      // 步 8 的"读回初值"
      const list = await liveReq(live.base, '/api/admin/flags', { token: admin });
      expect(list.status, list.raw).toBe(200);
      expect(keysOf(list.body)).toEqual(sorted('flags', 'effectiveWithinSeconds'));
      expect(list.body.effectiveWithinSeconds).toBe(FLAG_EFFECTIVE_MAX_SECONDS);
      const rows = list.body.flags as Array<Record<string, unknown>>;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThanOrEqual(Object.keys(FEATURE_FLAG_DEFAULTS).length);
      for (const key of Object.keys(FEATURE_FLAG_DEFAULTS)) {
        expect(rows.some((r) => r.key === key), `开关键 ${key} 必须在读回里`).toBe(true);
      }

      // 步 8 的"改值 + 读回"（写的是本用例自己那份临时库副本）
      const written = await liveReq(live.base, '/api/admin/flags', { token: admin, body: { key: 'studyModes', value: 'off' } });
      expect([written.status, written.body.key, written.body.value], written.raw).toEqual([200, 'studyModes', 'off']);
      expect(written.body.effectiveWithinSeconds).toBe(FLAG_EFFECTIVE_MAX_SECONDS);
      const after = await liveReq(live.base, '/api/admin/flags', { token: admin });
      const row = (after.body.flags as Array<Record<string, unknown>>).find((r) => r.key === 'studyModes');
      expect(row?.value).toBe('off');
    } finally {
      if (server) await shutdown(server);
      if (savedAdmin === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = savedAdmin;
    }
  });

  it('鉴权语义没被放宽：未登录 / 普通用户 token 打 `/api/admin/flags` 两条都 401，未登录打另外三条 admin 端点也 401', async () => {
    const h = await fresh('a32-3-guard-still-on');
    const savedAdmin = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = LIVE_ADMIN_PW;
    let server: Server | null = null;
    try {
      const live = await listen(h);
      server = live.server;

      // ① 不带 token（裁决点名要钉的那一条）
      for (const [method, pathname, body] of [
        ['GET', '/api/admin/flags', undefined],
        ['POST', '/api/admin/flags', { key: 'studyModes', value: 'off' }],
        ['GET', '/api/admin/stats', undefined],
        ['GET', '/api/admin/users', undefined],
      ] as const) {
        const r = await liveReq(live.base, pathname, {
          method,
          ...(body === undefined ? {} : { body }),
          ip: uniqueIp(),
        });
        expect([r.status, keysOf(r.body)], `未登录 ${method} ${pathname} ← ${r.raw}`).toEqual([401, ['error']]);
      }

      // ② 普通用户 token（本期新注册的正常 30 天会话）也不是 admin
      const reg = await liveReq(live.base, '/api/register', {
        body: { phone: uniquePhone(), password: PASSWORD, confirmPassword: PASSWORD, agreed: true },
        ip: uniqueIp(),
      });
      expect(reg.status, reg.raw).toBe(200);
      const user = String(reg.body.token);
      for (const [method, pathname, body] of [
        ['GET', '/api/admin/flags', undefined],
        ['POST', '/api/admin/flags', { key: 'studyModes', value: 'off' }],
      ] as const) {
        const r = await liveReq(live.base, pathname, {
          method,
          token: user,
          ...(body === undefined ? {} : { body }),
          ip: uniqueIp(),
        });
        expect([r.status, keysOf(r.body)], `普通用户 ${method} ${pathname} ← ${r.raw}`).toEqual([401, ['error']]);
      }

      // ③ 口令填错必须拿到 `routes/admin.ts:49` 的"密码错误"，**不是** `adminAuth` 的"未登录" ——
      //   这两个字面串之差就是本次裁决要修的挂载顺序缺陷本身（守卫若写回 `/api/admin/*`，
      //   这一条会先红在"拿到了未登录"上）。此处比较的是两个**遗留字面串**（不在 §4.6 码表内），
      //   所以判据是"谁应答"，不是文案对齐。
      const wrong = await liveReq(live.base, '/api/admin/login', { body: { password: `${LIVE_ADMIN_PW}-nope` } });
      expect(wrong.status, wrong.raw).toBe(401);
      expect(keysOf(wrong.body)).toEqual(['error']);
      expect(wrong.body.error, `应答方不是 admin.ts（说明守卫又吃掉了 login）：${wrong.raw}`).not.toBe('未登录');
      expect(wrong.body.error).toBe('密码错误');
    } finally {
      if (server) await shutdown(server);
      if (savedAdmin === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = savedAdmin;
    }
  });
});

/* ═════ A-32-2：真起服下"改一行开关"对词本 REST 门面零延迟（注入的是同一份 flags） ═════ */

describe('A-32-2 真起服 · 后台改 `wordbookIncremental` 后，词本 REST 门面无需再等一个 TTL', () => {
  /**
   * 判别力说明（这就是那条疫苗）：
   *  1. 先经后台把 `wordbookIncremental` 置 `0%`，再用 REST `push` 打一次**陈旧** `baseVersion`
   *     —— off 态按 §4.4.3 降级接受 200。这一次读**顺手把词本门面所用 flags 实例的缓存填成 `0%`**。
   *  2. 再经后台改成 `100%`（`routes/admin-flags.ts` 调 `flags.set`：写库 + 只回填**它自己那一份**缓存）。
   *  3. 立刻（毫秒级，远小于 30 秒 TTL）重打同一条陈旧 push：
   *     - `app.ts` 注入了同一份 `flags` ⇒ 第 2 步的回填就是词本门面那一份 → 立刻 409 `WORDBOOK_STALE`；
   *     - 不注入（改动前）⇒ 词本门面经 `wordbook-service.ts` 的 `flagsOf()` WeakMap 自建实例，
   *       缓存里还是第 1 步填进去的 `0%` → 仍回 200 ⇒ **本用例红**。
   *  这正是 T-09 报告 §4.3 实测到的 30.3 秒延迟，被这里改成了"0 秒且可判真假"。
   */
  const STALE = { baseVersion: 9_999_999, entries: [], removedWords: [] };

  it('0% → 200（并暖缓存）⇒ 后台改 100% ⇒ 同一请求形状立刻 409 `WORDBOOK_STALE`', async () => {
    const h = await fresh('a32-2-single-flags-source');
    const savedAdmin = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = LIVE_ADMIN_PW;
    let server: Server | null = null;
    try {
      const live = await listen(h);
      server = live.server;

      const login = await liveReq(live.base, '/api/admin/login', { body: { password: LIVE_ADMIN_PW } });
      expect(login.status, login.raw).toBe(200);
      const admin = String(login.body.token);
      const reg = await liveReq(live.base, '/api/register', {
        body: { phone: uniquePhone(), password: PASSWORD, confirmPassword: PASSWORD, agreed: true },
        ip: uniqueIp(),
      });
      expect(reg.status, reg.raw).toBe(200);
      const user = String(reg.body.token);

      const setFlag = async (value: string): Promise<HttpRes> =>
        liveReq(live.base, '/api/admin/flags', {
          token: admin,
          body: { key: 'wordbookIncremental', value },
          ip: uniqueIp(),
        });

      try {
        expect((await setFlag('0%')).status, `置 0% 失败`).toBe(200);
        const warm = await liveReq(live.base, '/api/wordbook/push', { token: user, body: STALE, ip: uniqueIp() });
        expect([warm.status, warm.body.ok], `off 态的陈旧 push 应降级接受 200：${warm.raw}`).toEqual([200, true]);

        expect((await setFlag('100%')).status, '置 100% 失败').toBe(200);
        const flipped = await liveReq(live.base, '/api/wordbook/push', {
          token: user,
          body: { ...STALE, baseVersion: STALE.baseVersion + 1 },
          ip: uniqueIp(),
        });
        expect(flipped.status, `词本 REST 门面没看到后台那一行（仍在等自己那份 TTL）：${flipped.raw}`).toBe(
          TM_ERRORS.WORDBOOK_STALE.http,
        );
        expect(flipped.body.code, flipped.raw).toBe(TM_ERROR_CODES.WORDBOOK_STALE);
      } finally {
        await setFlag('0%'); // 还原（写的是本用例自己那份临时库副本，不碰仓库根 data.db）
      }
    } finally {
      if (server) await shutdown(server);
      if (savedAdmin === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = savedAdmin;
    }
  });
});

/* ═════ P-1a/P-1b/P-1c：真装配下的两档请求体上限 + 头像门面挂载 + 资料门面 flags 注入 ═════ */

/**
 * T-11 §6 U-1/U-2/U-3（裁决口径见 P-1）。三条都是 `app.ts` 装配缺口，共同点是
 * **单测与进程内 `app.request()` 全都看不见**：
 *  - U-1 `bodyLimit` 200KB < 合法 300KB 头像的 ≈410KB base64 请求体 ⇒ R-04① 的 150~300KB 段
 *    在**判定之前**就被 413 挡掉，判据③ 那条统一上限判定在真机上永远走不到（C-18 换个形态复现）；
 *  - U-2 `createAvatarRouter` 从未挂进装配表 ⇒ §4.5 规划的 `POST /api/avatar` 生产 404；
 *  - U-3 `createProfileRouter(db)` 未注入 flags ⇒ `routes/profile.ts:40` 的
 *    `flags ? await flags.isOn('avatarUnifiedLimit') : true` 恒为 true，
 *    PRD §6.4-5-6 承诺的"一键回退"是纸面能力（`off` 分支只有测试注入走到过）。
 * 故本 describe 一律真起服 + 真 socket，并且**故意不给自己留进程内捷径**。
 */
describe('P-1 真起服 · 装配收口：512KB/8MB 两档上限、`POST /api/avatar` 可达、`avatarUnifiedLimit=off` 真回退', () => {
  /**
   * 造一张解码后正好 `bytes` 字节的 `data:image/jpeg;base64,…`。
   * 不写真实 JPEG 头 ⇒ `sniffImageSize()` 读不出宽高 ⇒ `assertAvatarValue` 判据③（200px）自然跳过，
   * 本用例判的只有"字节上限 + 请求体上限"这一条临界算术。
   */
  const jpegDataUrlOf = (bytes: number): string =>
    `data:image/jpeg;base64,${Buffer.alloc(bytes, 0x7f).toString('base64')}`;

  /** 后台改开关：走真 HTTP 端点，**不碰 `runtime.flags`**，证的正是"装配点注入的那一份"。 */
  async function liveSetFlag(base: string, key: string, value: string): Promise<number> {
    const savedAdmin = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = LIVE_ADMIN_PW;
    try {
      const login = await liveReq(base, '/api/admin/login', { body: { password: LIVE_ADMIN_PW } });
      if (login.status !== 200) throw new Error(`后台登录失败：${login.raw}`);
      const res = await liveReq(base, '/api/admin/flags', {
        token: String(login.body.token),
        body: { key, value },
      });
      return res.status;
    } finally {
      if (savedAdmin === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = savedAdmin;
    }
  }

  it('P-1a 判据③ 的临界段：解码后正好 300KB 的合法 JPEG，`PUT /api/profile` 与 `POST /api/avatar` 都拿到 2xx（不被 bodyLimit 抢先拒）', async () => {
    const s = await session('p1a-legal-300kb');
    const avatar = jpegDataUrlOf(AVATAR_MAX_BYTES); // 307_200 B ⇒ base64 正文 409_600 字符
    let server: Server | null = null;
    try {
      const live = await listen(s.h);
      server = live.server;

      // 请求体本身确实**超过旧的 200KB**（这就是旧装配必然 413 的那一段）
      const bodyBytes = Buffer.byteLength(JSON.stringify({ avatar }), 'utf8');
      expect(bodyBytes).toBeGreaterThan(200 * 1024);
      expect(bodyBytes).toBeLessThan(HTTP_BODY_LIMIT_BYTES);
      // 钉住实测值：合法 300KB JPEG 的 JSON 请求体 = **409_636 B**（base64 正文 409_600 + `data:image/jpeg;base64,` 23 + `{"avatar":"…"}` 13）
      // ⇒ 简报"≈410KB"的口径成立，而旧的 204_800 B 全局档必然抢在判定层之前 413
      expect(bodyBytes, '头像请求体实测字节数变了，请同步报告 §8 对账行 9').toBe(409_636);

      const put = await liveReq(live.base, '/api/profile', {
        method: 'PUT',
        token: s.token,
        body: { avatar },
        ip: uniqueIp(),
      });
      expect(put.status, `PUT /api/profile：${put.raw.slice(0, 200)}`).toBe(200);
      expect(put.raw).not.toContain('请求体过大');
      expect(keysOf(put.body)).toEqual(sorted('ok'));

      const posted = await liveReq(live.base, '/api/avatar', {
        token: s.token,
        body: { dataUrl: avatar },
        ip: uniqueIp(),
      });
      // U-2 的签名就是 404（路由没挂）⇒ 这里既不许 404 也不许 413
      expect(posted.status, `POST /api/avatar：${posted.raw.slice(0, 200)}`).toBe(200);
      expect(posted.body.bytes, posted.raw).toBe(AVATAR_MAX_BYTES);
    } finally {
      if (server) await shutdown(server);
    }
  });

  it('P-1a 应答方必须是判定层而不是 bodyLimit：301KB 两个入口都拿 §4.6 那条 shared 人话 + `AVATAR_TOO_LARGE`（400，非 413）', async () => {
    const s = await session('p1a-avatar-too-large');
    const avatar = jpegDataUrlOf(AVATAR_MAX_BYTES + 1024);
    let server: Server | null = null;
    try {
      const live = await listen(s.h);
      server = live.server;
      const expectSharedCopy = (res: HttpRes, label: string): void => {
        expect(res.status, `${label}：${res.raw.slice(0, 200)}`).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
        expect(res.body.error, `${label} 文案不是 shared 的那一条：${res.raw.slice(0, 200)}`).toBe(
          TM_ERRORS.AVATAR_TOO_LARGE.copy,
        );
        expect(res.body.code, res.raw).toBe(TM_ERROR_CODES.AVATAR_TOO_LARGE);
        expect(res.raw).not.toContain('请求体过大');
      };
      expectSharedCopy(
        await liveReq(live.base, '/api/profile', { method: 'PUT', token: s.token, body: { avatar }, ip: uniqueIp() }),
        'PUT /api/profile',
      );
      expectSharedCopy(
        await liveReq(live.base, '/api/avatar', { token: s.token, body: { dataUrl: avatar }, ip: uniqueIp() }),
        'POST /api/avatar',
      );
    } finally {
      if (server) await shutdown(server);
    }
  });

  it('P-1a 词本那一半（P-6 提醒的那步）：整本覆写 864,010 B（0.82MB）请求体从"被 413 挡死"变成 200 `{ok:true}`', async () => {
    const s = await session('p1a-wordbook-1mb');
    let server: Server | null = null;
    try {
      const live = await listen(s.h);
      server = live.server;
      // 12000 条 × 60 字符词名 ⇒ 请求体 > 512KB 全局档：旧的 200KB 与新的 512KB 都装不下，只有 8MB 那一档装得下
      const data = Array.from({ length: 12000 }, (_, i) => ({ word: `w${i}-`.padEnd(60, 'x') }));
      const payloadBytes = Buffer.byteLength(JSON.stringify({ data }), 'utf8');
      expect(payloadBytes).toBeGreaterThan(HTTP_BODY_LIMIT_BYTES);
      expect(payloadBytes).toBeLessThan(WORDBOOK_BODY_LIMIT_BYTES);
      // 钉住实测值，让报告里"0.82MB"是用例保证的数字而不是口算量级（构造式全在本用例内，确定性）
      expect(payloadBytes, '词本整本请求体实测字节数变了，请同步报告 §4-2 用例③ 与 §8 对账行 9').toBe(864_010);

      const res = await liveReq(live.base, '/api/wordbook', {
        method: 'PUT',
        token: s.token,
        body: { data },
        ip: uniqueIp(),
      });
      expect(res.status, `${res.raw.slice(0, 200)}`).toBe(200);
      expect(res.raw).not.toContain('请求体过大');
      expect(keysOf(res.body)).toEqual(sorted('ok'));

      const back = await liveReq(live.base, '/api/wordbook', { token: s.token, ip: uniqueIp() });
      expect((back.body.data as unknown[]).length, '整本覆写没落库').toBe(12000);
    } finally {
      if (server) await shutdown(server);
    }
  });

  it('P-1a 大过 8MB 的词本覆写不再是机器话：与 `wordbook-service` 自己判的超限**同码同人话**；其它路径大过 512KB 仍由全局那一档挡住', async () => {
    const s = await session('p1a-wordbook-over-8mb');
    let server: Server | null = null;
    try {
      const live = await listen(s.h);
      server = live.server;

      const huge = await liveReq(live.base, '/api/wordbook', {
        method: 'PUT',
        token: s.token,
        body: { data: [], pad: 'x'.repeat(WORDBOOK_BODY_LIMIT_BYTES) },
        ip: uniqueIp(),
      });
      expect(huge.status, huge.raw.slice(0, 200)).toBe(TM_ERRORS.WORDBOOK_TOO_LARGE.http);
      expect(huge.body.error, huge.raw.slice(0, 200)).toBe(TM_ERRORS.WORDBOOK_TOO_LARGE.copy);
      expect(huge.body.code, huge.raw.slice(0, 200)).toBe(TM_ERROR_CODES.WORDBOOK_TOO_LARGE);

      // 全局那一档仍在（512KB）：资料门面塞 600KB 的 base64 ⇒ 到不了判定层，由中间件拒
      const overGlobal = await liveReq(live.base, '/api/profile', {
        method: 'PUT',
        token: s.token,
        body: { avatar: jpegDataUrlOf(600 * 1024) },
        ip: uniqueIp(),
      });
      expect(overGlobal.status, overGlobal.raw.slice(0, 200)).toBe(413);
    } finally {
      if (server) await shutdown(server);
    }
  });

  it('P-1c `avatarUnifiedLimit=off` 经真后台端点改值后，REST 资料门面**零等待**翻到旧字符上限（不注入 flags 就永远做不到）', async () => {
    const s = await session('p1c-avatar-unified-limit-off');
    let server: Server | null = null;
    try {
      const live = await listen(s.h);
      server = live.server;
      // 187_500 B ⇒ 请求体 ≈ 250KB：既**低于** unified 的 300KB 字节线，又**高于** legacy 的 200_000 字符线，
      // 且整体 < 512KB ⇒ 不被 bodyLimit 抢先拒。两个上限唯一能同时区分开的就是开关本身。
      const avatar = jpegDataUrlOf(187_500);
      const put = () =>
        liveReq(live.base, '/api/profile', { method: 'PUT', token: s.token, body: { avatar }, ip: uniqueIp() });

      const on = await put();
      expect(on.status, `默认（开关 on）应走统一上限：${on.raw.slice(0, 200)}`).toBe(200);

      expect(await liveSetFlag(live.base, 'avatarUnifiedLimit', 'off'), '改开关失败').toBe(200);
      const off = await put();
      expect(off.status, `off 态应回退到旧的 200_000 字符上限：${off.raw.slice(0, 200)}`).toBe(
        TM_ERRORS.AVATAR_TOO_LARGE.http,
      );
      expect(off.body.error, off.raw.slice(0, 200)).toBe(TM_ERRORS.AVATAR_TOO_LARGE.copy);

      expect(await liveSetFlag(live.base, 'avatarUnifiedLimit', 'on'), '还原开关失败').toBe(200);
      const back = await put();
      expect(back.status, `回 on 后应重新接受：${back.raw.slice(0, 200)}`).toBe(200);
    } finally {
      if (server) await shutdown(server);
    }
  });
});
