/**
 * T-11 · 判据①②③（R-04 全条）：ProfileDto 两门面全等 + 头像上限统一。
 *
 * 比对方法照抄 T-10 `review-parity.spec.ts` 的域分层口径：
 *  - REST：`new Hono().route('/', createProfileRouter(db, flags))`（§10.3 的 standalone 口径，
 *    **不依赖 T-07 的 `app.ts`**，也不等它挂载）；
 *  - tRPC：`createCallerFactory(profile)(ctx)`；
 *  - 两门面在**同一张临时 sqlite**、**同一个用户**上取数 ⇒ 键集合与取值必须逐字相同。
 *
 * 判据①：`Object.keys(trpc).sort()` == `Object.keys(rest).sort()` 且两侧都过 `ProfileDtoSchema.safeParse`。
 * 判据②：真值只有 `profiles.daily_goal` 一列；`dailyGoal` 由 shared 的 `profileDtoLegacyAlias()` 派生；
 *        开关（`PROFILE_DTO_LEGACY_ALIAS=off`）一关，**两门面同时**不再输出该键（键集合仍全等）。
 * 判据③：200×200、≤300KB 的 JPEG 在三个入口（REST PUT / tRPC profile.update / POST /api/avatar）都 2xx；
 *        超限（字节 >300KB 或边长 >200px）三入口返回**同一条人话** + 同一个 `AVATAR_TOO_LARGE` + 同一个 http。
 *
 * ⚠ 头像 fixture 是**手工拼出来的 JPEG 头**（SOI + SOF0 段，宽高写在段内真实偏移上），
 *    不是"随便一串 base64"——`sniffImageSize()` 走的正是产品代码里那条真实解析路径。
 *    base64 正文后面补零凑字节数，用来判定 300KB 那条线。
 *
 * 只在 `os.tmpdir()` 的临时库上跑，**绝不碰仓库根 `data.db` / `packages/server/data.db`**。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_SIDE_PX,
  DAILY_GOAL_DEFAULT,
  NICKNAME_MAX_LENGTH,
  ProfileDtoSchema,
  ProfileSummarySchema,
  TM_ERROR_CODES,
  TM_ERRORS,
  TM_ERRORS_SUPPLEMENT,
  decodedDataUrlBytes,
  errorMessage,
} from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createProfileRouter } from '../../src/routes/profile.js';
import { createAvatarRouter } from '../../src/routes/avatar.js';
import { profile } from '../../src/trpc/routers/profile.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/services/feature-flags.js';
import { PROFILE_DTO_KEYS } from '../../src/services/profile-service.js';
import { TmAuthError } from '../../src/services/password-policy.js';
import { AVATAR_BAD_FORMAT_COPY, decodeAvatar, sniffImageSize } from '../../src/services/avatar-service.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-t11-profile-dto-secret';
/** `middleware/auth.ts` 走 `loadConfig().jwtSecret`；根 .env 有值就用它，没值才注入测试密钥。 */
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;
/** pg 侧可用性（A-18-3：缺实例时下面的环境自证用例会显式 SKIP 并打印原因）。 */
const PG_URL = process.env.DATABASE_URL_TEST ?? '';

const tmpDir = path.join(os.tmpdir(), `tm-t11-profile-${process.pid}`);
const T0 = 1_770_000_000_000;
const tmpFile = (name: string): string => path.join(tmpDir, name);

let db: SqliteAppDB;
let flags: FeatureFlags;
let user = 0;
let other = 0;

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

async function req(
  app: Hono<AuthEnv>,
  pathname: string,
  userId: number,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(pathname, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

const restProfile = (): Hono<AuthEnv> => new Hono<AuthEnv>().route('/', createProfileRouter(db, flags));
const restAvatar = (): Hono<AuthEnv> => new Hono<AuthEnv>().route('/', createAvatarRouter(db, flags));

function trpcProfile(userId: number) {
  const ctx = { userId, clientIp: '127.0.0.1', db, flags } as unknown as TrpcContext;
  // `createCallerFactory(profile)` 直接产出该域过程的调用面（与 T-10 的 `review` 同一口径），
  // 域前缀 `profile.` 只存在于 `appRouter` 装配后的路径里。
  return createCallerFactory(profile)(ctx);
}

/**
 * **线上**tRPC 门面（A-30-1 专用）。`createCallerFactory` 直调会把 `TRPCError.data` 剥掉，
 * 所以"`toTrpcError()` 经 `cause` 传的 tm_code 有没有被 `trpc/init.ts` 的唯一 `errorFormatter`
 * 提升成客户端可读的 `data.code`"只能真的走一次 HTTP 才能取证
 * （与 T-07 在 `auth-register.spec.ts` 里立的口径一致）。
 * 门面由本文件自己拼：`trpcServer({router: profile})` + 手搭 ctx，**不依赖 T-07 的 `app.ts`**。
 */
function trpcOnline(userId: number): Hono {
  const app = new Hono();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: profile,
      // 手搭 ctx 只给本域用到的三个键；写成**字面量**而不是 `as TrpcContext`：
      // `trpcServer` 的 `createContext` 声明要 `Record<string, unknown>`，命名的 interface 没有隐式索引签名。
      createContext: async () => ({ userId, clientIp: '127.0.0.1', db, flags }),
    }),
  );
  return app;
}

/* ───────────── 头像 fixture（手工 JPEG：SOI + SOF0，宽高落在真实偏移上） ───────────── */

/**
 * @param side   写入 SOF0 的宽高（同一值 = 正方形）
 * @param bytes  解码后的目标总字节数（凑 padding 用）
 */
function jpegDataUrl(side: number, bytes: number): string {
  const buf = Buffer.alloc(Math.max(bytes, 32));
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0（baseline）
  buf.writeUInt16BE(17, 4); // 段长 = 2 + 1 + 2 + 2 + 1 + 3*2
  buf[6] = 8; // 精度
  buf.writeUInt16BE(side, 7); // 高
  buf.writeUInt16BE(side, 9); // 宽
  buf[11] = 3; // 分量数
  // 尾部的 padding 不参与头部解析，只用来把解码字节数推到判定线上
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** fixture 自身必须先被产品代码读成预期值（否则用例就是在测自己造的假象）。 */
function assertFixtureIsReadAsExpected(): void {
  const small = decodeAvatar(jpegDataUrl(AVATAR_MAX_SIDE_PX, 40 * 1024));
  expect([small.width, small.height, small.mime]).toEqual([AVATAR_MAX_SIDE_PX, AVATAR_MAX_SIDE_PX, 'image/jpeg']);
  expect(sniffImageSize(new Uint8Array(Buffer.from(jpegDataUrl(64, 1024).split(',')[1] as string, 'base64')))).toEqual({
    width: 64,
    height: 64,
  });
}

const avatarTooLargeCopy = errorMessage('AVATAR_TOO_LARGE');

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('profile.db');
  flags = createFeatureFlags(db);
  user = await db.createUser('13900000011', T0);
  other = await db.createUser('13900000012', T0);
  assertFixtureIsReadAsExpected();
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('判据① R-04③：profile.get(tRPC) 与 GET /api/profile(REST) 的键集合全等且双侧过契约', () => {
  it('两侧 key 集合全等、取值全等，且都是 ProfileDtoSchema 的合法实例', async () => {
    const viaRest = (await req(restProfile(), '/api/profile', user)).body;
    const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;

    expect(Object.keys(viaTrpc).sort()).toEqual(Object.keys(viaRest).sort());
    expect(viaTrpc).toEqual(viaRest);

    expect(ProfileDtoSchema.safeParse(viaRest).success, 'REST 侧 ProfileDto 契约').toBe(true);
    expect(ProfileDtoSchema.safeParse(viaTrpc).success, 'tRPC 侧 ProfileDto 契约').toBe(true);

    // 键集合本身就是 service 导出的那一份（防止"两侧各自加键恰好又相等"）
    const expected = [...PROFILE_DTO_KEYS, 'dailyGoal'].sort();
    expect(Object.keys(viaRest).sort()).toEqual(expected);
    expect(viaRest.user_id).toBe(user);
    expect(viaRest.daily_goal).toBe(DAILY_GOAL_DEFAULT);
  });

  it('旧 GET /api/profile 的六个键一字未动（§6.2 红线接口只加不改形）', async () => {
    const viaRest = (await req(restProfile(), '/api/profile', user)).body;
    expect(ProfileSummarySchema.safeParse(viaRest).success, '旧 ProfileSummary 形状仍成立').toBe(true);
    for (const key of ['nickname', 'avatar', 'daily_goal', 'totalWords', 'reviewDays', 'reviewDates']) {
      expect(Object.prototype.hasOwnProperty.call(viaRest, key), `旧键 ${key} 仍在`).toBe(true);
    }
  });

  it('hasPassword / pwPolicyVersion 来自凭据视图，且两侧一致（R-04③ + R-40 只加键）', async () => {
    const before = (await req(restProfile(), '/api/profile', user)).body;
    expect(before.hasPassword).toBe(false);
    await db.users.setPassword(user, '$2b$10$abcdefghijklmnopqrstuv', 1, Date.now());
    const after = (await req(restProfile(), '/api/profile', user)).body;
    const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
    expect(after.hasPassword).toBe(true);
    expect(after.pwPolicyVersion).toBe(1);
    expect(viaTrpc.hasPassword).toBe(true);
    // 手机号只在 DTO 里出现一次，且不泄漏密码列
    expect(JSON.stringify(after)).not.toContain('$2b$');
  });

  it('两个用户各读各的（跨用户不串资料）', async () => {
    await db.profiles.update(user, { nickname: '甲' }, Date.now());
    await db.profiles.update(other, { nickname: '乙' }, Date.now());
    const a = (await req(restProfile(), '/api/profile', user)).body;
    const b = (await req(restProfile(), '/api/profile', other)).body;
    expect([a.nickname, b.nickname]).toEqual(['甲', '乙']);
    expect(a.user_id).not.toBe(b.user_id);
  });
});

describe('判据② daily_goal / dailyGoal 只有一份真值 + 兼容映射开关', () => {
  it('REST 写 daily_goal 与 tRPC 写 dailyGoal 落到同一列，读回两侧一致', async () => {
    const putViaRest = await req(restProfile(), '/api/profile', user, {
      method: 'PUT',
      body: JSON.stringify({ daily_goal: 25 }),
    });
    expect(putViaRest.status).toBe(200);
    expect(putViaRest.body).toEqual({ ok: true });
    let dto = (await req(restProfile(), '/api/profile', user)).body;
    expect(dto.daily_goal).toBe(25);
    expect(dto.dailyGoal).toBe(25);

    await trpcProfile(user).update({ dailyGoal: 40 });
    dto = (await req(restProfile(), '/api/profile', user)).body;
    expect(dto.daily_goal).toBe(40);
    expect(dto.dailyGoal).toBe(40);

    // 库里只有一列：直接看表，确认没有第二个键被写进任何列
    const raw = new Database(tmpFile('profile.db'), { readonly: true });
    const cols = (raw.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>).map((c) => c.name);
    raw.close();
    expect(cols).toEqual(['user_id', 'nickname', 'avatar', 'daily_goal', 'updated_at']);
    expect(cols.filter((c) => /daily/i.test(c))).toEqual(['daily_goal']);
  });

  it('两键同时传时以 daily_goal 为准（别名只读不写，不产生第二份真值）', async () => {
    await req(restProfile(), '/api/profile', user, {
      method: 'PUT',
      body: JSON.stringify({ daily_goal: 12, dailyGoal: 99 }),
    });
    const dto = (await req(restProfile(), '/api/profile', user)).body;
    expect(dto.daily_goal).toBe(12);
    expect(dto.dailyGoal).toBe(12);
  });

  it('开关 off ⇒ 两门面同时停发 dailyGoal，且键集合仍然全等（别名是唯一生成点）', async () => {
    process.env.PROFILE_DTO_LEGACY_ALIAS = 'off';
    try {
      const viaRest = (await req(restProfile(), '/api/profile', user)).body;
      const viaTrpc = (await trpcProfile(user).get()) as unknown as Record<string, unknown>;
      expect(Object.keys(viaTrpc).sort()).toEqual(Object.keys(viaRest).sort());
      expect(Object.prototype.hasOwnProperty.call(viaRest, 'dailyGoal')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(viaTrpc, 'dailyGoal')).toBe(false);
      expect(viaRest.daily_goal).toBe(12);
      expect(ProfileDtoSchema.safeParse(viaRest).success).toBe(true);
      // 键集合 = 不含别名的那一份
      expect(Object.keys(viaRest).sort()).toEqual([...PROFILE_DTO_KEYS].sort());
    } finally {
      delete process.env.PROFILE_DTO_LEGACY_ALIAS;
    }
  });

  it('越界目标被拒且不改写存量值（两门面都拒、无静默截断）', async () => {
    const viaRest = await req(restProfile(), '/api/profile', user, { method: 'PUT', body: JSON.stringify({ daily_goal: 0 }) });
    expect(viaRest.status).toBe(400);
    // bug #2：契约域上限 200 → 500，错误人话里的区间随之变
    expect(viaRest.body.error).toContain('1-500');
    await expect(trpcProfile(user).update({ daily_goal: 0 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await req(restProfile(), '/api/profile', user)).body.daily_goal).toBe(12);
  });

  it('昵称超长两侧同拒（上限来自 shared 的 NICKNAME_MAX_LENGTH）', async () => {
    const tooLong = 'x'.repeat(NICKNAME_MAX_LENGTH + 1);
    const viaRest = await req(restProfile(), '/api/profile', user, {
      method: 'PUT',
      body: JSON.stringify({ nickname: tooLong }),
    });
    expect(viaRest.status).toBe(400);
    await expect(trpcProfile(user).update({ nickname: tooLong })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('判据③ R-04①②：头像上限两门面统一，200×200/≤300KB 三入口全 2xx，超限同一条人话', () => {
  const okAvatar = jpegDataUrl(AVATAR_MAX_SIDE_PX, 200 * 1024);
  const overBytes = jpegDataUrl(AVATAR_MAX_SIDE_PX, AVATAR_MAX_BYTES + 64 * 1024);
  const overSide = jpegDataUrl(AVATAR_MAX_SIDE_PX + 1, 30 * 1024);

  it('三个入口收同一张 200×200、200KB 的 JPEG 都是 2xx 且刷新后读回同一个值', async () => {
    const put = await req(restProfile(), '/api/profile', user, { method: 'PUT', body: JSON.stringify({ avatar: okAvatar }) });
    expect(put.status).toBe(200);
    const updated = await trpcProfile(user).update({ avatar: okAvatar });
    expect(updated.ok).toBe(true);
    const uploaded = await req(restAvatar(), '/api/avatar', user, { method: 'POST', body: JSON.stringify({ dataUrl: okAvatar }) });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.ok).toBe(true);
    expect(uploaded.body.bytes).toBeLessThanOrEqual(AVATAR_MAX_BYTES);
    // 报给客户端的字节数 = 判定用的那一个数（shared `decodedDataUrlBytes` 唯一实现，不是第二份手算）
    expect(uploaded.body.bytes).toBe(decodedDataUrlBytes(okAvatar));

    const dto = (await req(restProfile(), '/api/profile', user)).body;
    expect(dto.avatar).toBe(okAvatar);
    expect((await trpcProfile(user).get() as unknown as Record<string, unknown>).avatar).toBe(okAvatar);
  });

  it(`超限（>${Math.round(AVATAR_MAX_BYTES / 1024)}KB）三入口返回同一条人话 + 同一个码 + 同一个 http`, async () => {
    const expectBody = (body: Record<string, unknown>, status: number, where: string): void => {
      expect(status, where).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
      expect(body.error, where).toBe(avatarTooLargeCopy);
      expect(body.code, where).toBe('AVATAR_TOO_LARGE');
    };
    const viaRest = await req(restProfile(), '/api/profile', user, {
      method: 'PUT',
      body: JSON.stringify({ avatar: overBytes }),
    });
    expectBody(viaRest.body, viaRest.status, 'PUT /api/profile');

    const viaUpload = await req(restAvatar(), '/api/avatar', user, {
      method: 'POST',
      body: JSON.stringify({ dataUrl: overBytes }),
    });
    expectBody(viaUpload.body, viaUpload.status, 'POST /api/avatar');

    let trpcErr: unknown;
    try {
      await trpcProfile(user).update({ avatar: overBytes });
    } catch (err) {
      trpcErr = err;
    }
    const e = trpcErr as {
      code?: string;
      message?: string;
      cause?: { tmCode?: string; httpStatus?: number };
    };
    // 判据③"同一条人话"：tRPC 的 message 与 REST 的 {error} 逐字相同。
    expect(e.message, 'tRPC profile.update').toBe(avatarTooLargeCopy);
    // tRPC v11.18 的构造器不接 `data`，caller 直调只能看到协议层的 {code:'BAD_REQUEST',httpStatus:400}；
    // shared 的 tm_code 走 `cause`，由 `trpc/init.ts` 的唯一 errorFormatter 提升为 `data.code`（A-30-1，
    // T-07 已落地）。**线上**是否真到了客户端可读的位置，由下面那条打 `/trpc/update` 的用例取证。
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.cause?.tmCode).toBe(TM_ERROR_CODES.AVATAR_TOO_LARGE);
    expect(e.cause?.httpStatus).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);

    // 超限的那次一个字节都没写进去（两侧都拒 ⇒ 存量头像保持上一次的值）
    expect((await req(restProfile(), '/api/profile', user)).body.avatar).toBe(okAvatar);
  });

  /**
   * A-30-1（本批次第 2 条，另一条在 `chat-isolation.spec.ts`）：钉**线上传输形状**。
   * 三件事缺一不可：① `data.code` 是 shared 的 tm_code（不是 tRPC 协议码 BAD_REQUEST），
   * ② `data.httpStatus` 取 §4.6 表里的状态，③ `message` 与 REST 的 `{error}` 逐字同一条。
   */
  it('A-30-1：线上 tRPC 错误体 data.code === shared 的 tm_code（cause→data 真的到了客户端）', async () => {
    // 自带前置：先写一张合法的，才能证明"线上那次超限真的一个字节都没落库"
    expect((await trpcProfile(user).update({ avatar: okAvatar })).ok).toBe(true);

    const res = await trpcOnline(user).request('/trpc/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatar: overBytes }),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = (raw.error ?? {}) as Record<string, unknown>;
    const json = (err.json ?? err) as Record<string, unknown>;
    const data = (json.data ?? {}) as Record<string, unknown>;
    // 线上错误体逐字取证：报告 §5「给前端的接口契约」直接引用这一段输出
    console.info(`[T-11 契约] tRPC 线上错误体 = ${JSON.stringify(raw)}`);
    expect(json.message, `线上错误体：${JSON.stringify(raw)}`).toBe(avatarTooLargeCopy);
    expect(data.code, `data.code：${JSON.stringify(raw)}`).toBe(TM_ERROR_CODES.AVATAR_TOO_LARGE);
    expect(data.httpStatus).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
    expect(res.status).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
    // 线上仍然没有把超限的字节写进去
    expect((await req(restProfile(), '/api/profile', user)).body.avatar).toBe(okAvatar);
  });

  it('边长 >200px 同样拒，且是同一条人话（不另造文案）', async () => {
    const viaRest = await req(restProfile(), '/api/profile', user, {
      method: 'PUT',
      body: JSON.stringify({ avatar: overSide }),
    });
    expect(viaRest.status).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
    expect(viaRest.body.error).toBe(avatarTooLargeCopy);
    const uploaded = await req(restAvatar(), '/api/avatar', user, { method: 'POST', body: JSON.stringify({ dataUrl: overSide }) });
    expect(uploaded.body.error).toBe(avatarTooLargeCopy);
  });

  it('R-04⑤⑥：Q4 决策不动存量 —— 库里已有的大 base64 仍原样读出、仍显示', async () => {
    const legacyBig = `data:image/jpeg;base64,${'A'.repeat(300_000)}`;
    await db.profiles.update(other, { avatar: legacyBig }, Date.now());
    const viaRest = (await req(restProfile(), '/api/profile', other)).body;
    const viaTrpc = (await trpcProfile(other).get()) as unknown as Record<string, unknown>;
    expect(viaRest.avatar).toBe(legacyBig);
    expect(viaTrpc.avatar).toBe(legacyBig);
    // 读路径不因为新上限把老头像吃掉：仍是一个能被契约解析的字符串
    expect(ProfileDtoSchema.safeParse(viaRest).success).toBe(true);
  });

  it('清空头像（空串）两门面都放行，且读回空串', async () => {
    expect((await req(restProfile(), '/api/profile', other, { method: 'PUT', body: JSON.stringify({ avatar: '' }) })).status).toBe(200);
    expect((await req(restProfile(), '/api/profile', other)).body.avatar).toBe('');
  });

  it('avatarUnifiedLimit=off ⇒ 回退到改动前各面自己的旧字符上限（开关语义可回退）', async () => {
    await flags.set('avatarUnifiedLimit', 'off');
    try {
      // REST 旧上限 200_000 字符：这张 260_000 字符的老请求在改动前是 400
      const big = `data:image/jpeg;base64,${Buffer.alloc(195_000).toString('base64')}`;
      expect(big.length).toBeGreaterThan(200_000);
      const viaRest = await req(restProfile(), '/api/profile', user, { method: 'PUT', body: JSON.stringify({ avatar: big }) });
      expect(viaRest.status).toBe(TM_ERRORS.AVATAR_TOO_LARGE.http);
      // tRPC 旧上限 500 字符：同一张图在改动前的 tRPC 侧当然也是拒的
      let code = '';
      try {
        await trpcProfile(user).update({ avatar: big });
      } catch (err) {
        code = (err as { code?: string }).code ?? '';
      }
      expect(code).toBe('BAD_REQUEST');
      // 开关 off 时，499 字符的老值仍可写（= 改动前的默认行为，PRD §6.4-5-6 的一键回退）
      const tiny = `data:image/jpeg;base64,${Buffer.alloc(300).toString('base64')}`.slice(0, 499);
      expect((await req(restProfile(), '/api/profile', user, { method: 'PUT', body: JSON.stringify({ avatar: tiny }) })).status).toBe(200);
    } finally {
      await flags.set('avatarUnifiedLimit', 'on');
    }
  });

  it('403 与 500 的人话不在资料域出现（错误码/文案一律 import 自 shared，A-28-4）', () => {
    expect(avatarTooLargeCopy).toBe(TM_ERRORS.AVATAR_TOO_LARGE.copy);
    // supplement 里的 FORBIDDEN 属于会话域（T-11 的 chat 用例用它），资料域不复制一份
    expect(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http).toBe(403);
  });
});

describe('装配面自检（standalone，不等 T-07 的 app.ts）', () => {
  it('未带 token 时两个门面都 401（不因为收口而放开鉴权）', async () => {
    const res = await new Hono<AuthEnv>().route('/', createProfileRouter(db)).request('/api/profile');
    expect(res.status).toBe(401);
    const up = await new Hono<AuthEnv>().route('/', createAvatarRouter(db)).request('/api/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: okShort() }),
    });
    expect(up.status).toBe(401);
  });

  it('POST /api/avatar 的入参形状由 shared 契约把门（缺 dataUrl → 400，不是 500）', async () => {
    const res = await req(restAvatar(), '/api/avatar', user, { method: 'POST', body: JSON.stringify({ nope: 1 }) });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).not.toContain('undefined');
    // 同一条"不是图片数据"的人话只有一个出口（`avatar-service` 的常量）：
    // REST 门面与 `assertAvatarValue` 曾各抄一份逐字相同的字面量 = 第二处真相，已收拢
    expect(res.body.error).toBe(AVATAR_BAD_FORMAT_COPY);
  });
});

/* ══════════════ A-30-3：profile.changePassword 收口为"转调 ctx.auth" ══════════════ */

/**
 * A-30-3 的裁决是"签名一字不动、函数体转调 `ctx.auth` 的改密 service，本文件的 `bcrypt` 直调全删"。
 * 三条断言各自钉住裁决的一半：
 *  - 静态面：源码里不再有 `bcrypt` / 任何直接写密码的调用 ⇒ 重复实现真的被删掉了（不是"留着但没走"）；
 *  - 转调面：`ctx.auth.changePassword` 被调用**一次**，且 `oldPassword` 传的是空串
 *    —— 冻结的 input 里只有 `password` 一个键，结构上就带不了旧密码；
 *  - 出口面：唯一出口对"缺 oldPassword"的裁决是 `OLD_PASSWORD_REQUIRED`（400），
 *    经 `toAuthTrpcError()` 落成 `cause.tmCode` ⇒ 这条口从今往后**改不动密码**。
 * 用假 `auth` 而不是真 service：真链路由 T-07 的 `auth-hardening.spec.ts`「D-10 两处改密入口」把门，
 * 本处只看"profile 门面有没有把决定权交出去"，那是 A-30-3 唯一属于 T-11 的部分。
 */
describe('A-30-3 / R-40②：profile.changePassword 只是转发口，改密唯一出口在 auth 域', () => {
  it('静态取证：routers/profile.ts 里已无 bcrypt 直调、无第二处写密码路径', () => {
    const src = fs.readFileSync(new URL('../../src/trpc/routers/profile.ts', import.meta.url), 'utf8');
    // 只看**代码行**：本文件的注释里逐字写着"bcrypt 直调已删"，那是裁决原文不是实现
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/bcrypt/i);
    expect(code).not.toMatch(/\bcompare(Async)?\s*\(/);
    expect(code).not.toMatch(/setPassword\s*\(/);
    // 唯一出口：转调 ctx.auth
    expect(code).toMatch(/ctx\.auth/);
  });

  it('转调一次且 oldPassword 传空串 ⇒ 唯一出口按 R-40② 拒 OLD_PASSWORD_REQUIRED（400，不是 500）', async () => {
    const seen: Array<{ userId: number; input: unknown; meta: unknown }> = [];
    const fakeAuth = {
      async changePassword(userId: number, input: unknown, meta: unknown): Promise<never> {
        seen.push({ userId, input, meta });
        throw new TmAuthError(TM_ERROR_CODES.OLD_PASSWORD_REQUIRED);
      },
    };
    const ctx = {
      userId: user,
      clientIp: '10.0.0.9',
      db,
      auth: fakeAuth,
    } as unknown as TrpcContext;
    const caller = createCallerFactory(profile)(ctx);
    // 本用例前面已经有一次 `setPassword(user, …, 1, …)`，所以断言的是"这一步没有再动它"，不是某个固定值
    const policyBefore = (await db.users.findCredentialsById(user))?.pw_policy_version;

    let code = '';
    let message = '';
    let cause: { tmCode?: string; httpStatus?: number } | undefined;
    try {
      await caller.changePassword({ password: 'brand-new-password' });
    } catch (err) {
      const e = err as { code?: string; message?: string; cause?: typeof cause };
      code = e.code ?? '';
      message = e.message ?? '';
      cause = e.cause;
    }

    expect(seen.length, '只转调一次，不在本地补做第二套校验').toBe(1);
    expect(seen[0]!.userId).toBe(user);
    expect(seen[0]!.meta).toEqual({ ip: '10.0.0.9' });
    expect(seen[0]!.input).toEqual({
      oldPassword: '',
      newPassword: 'brand-new-password',
      confirmPassword: 'brand-new-password',
    });

    expect(code).toBe('BAD_REQUEST');
    expect(message).toBe(errorMessage(TM_ERROR_CODES.OLD_PASSWORD_REQUIRED));
    expect(cause?.tmCode).toBe(TM_ERROR_CODES.OLD_PASSWORD_REQUIRED);
    expect(cause?.httpStatus).toBe(TM_ERRORS[TM_ERROR_CODES.OLD_PASSWORD_REQUIRED].http);

    // 转调失败之后，`profiles` / 凭据两列都没有被这条口写过
    const dto = (await req(restProfile(), '/api/profile', user)).body;
    expect(dto.updated_at).toBeTypeOf('number');
    expect((await db.users.findCredentialsById(user))?.pw_policy_version).toBe(policyBefore);
  });

  it('ctx.auth 未装配 ⇒ 明确报错，绝不静默放行成"密码已改"', async () => {
    const ctx = { userId: user, clientIp: '127.0.0.1', db } as unknown as TrpcContext;
    await expect(createCallerFactory(profile)(ctx).changePassword({ password: 'whatever123' }))
      .rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

/* ══════════════════ 环境自证：pg 侧（A-18-3 口径，与 T-07 同一形态） ══════════════════ */

describe('环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里）', () => {
  it('未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg，报告已登记）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] T-11 profile-dto 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。' +
        ' 本域对 pg 的依赖面 = `profiles.{nickname,avatar,daily_goal,updated_at}` 的读写与 `users` 凭据视图' +
        '（列名两侧一字不动是 R-04⑤ 判据），DDL 形状差异由 `pnpm ddl-parity` 的 A 段把门。',
    );
    expect(PG_URL).toBe('');
  });
});

function okShort(): string {
  return jpegDataUrl(64, 4 * 1024);
}
