/**
 * T-10 · 判据③④⑤⑥⑦⑧ 的 parity 集成用例（审计 S2 的反证）。
 *
 * 比对方法（判据③）：
 *  1) 两个用户（`uRest` / `uTrpc`）在**同一张临时 sqlite**上，各自拿到**逐字节相同**的
 *     起点卡片（`FIXTURE_DATA` 是手写死的线上形状 JSON，不经我的序列化函数生成 →
 *     顺带证明 `cardFromJson` 读的是存量格式）与**同一个词**；
 *  2) 时钟冻结（`vi.useFakeTimers({ toFake: ['Date'] })`），否则 `due/reviewedAt`
 *     会因两次调用跨秒而漂；
 *  3) REST 走 `new Hono().route('/', createReviewRouter(db, { events }))`（§10.3 的 standalone 口径，
 *     不依赖 T-07 的 `app.ts`），tRPC 走 `createCallerFactory(review)(ctx)`；
 *     A-33-6 的错误码等值另走**线上**门面（`trpcServer` + Hono），因为 caller 直调会剥掉 `data`；
 *  4) 断言三层同时相等：**整个响应体 JSON**（除 `reviewedAt` 外逐键）相等 →
 *     **`fsrs_cards.data` 串**相等 → 由该串解出的 `due / state / reps` 逐字段相等；
 *     四档 1/2/3/4 各一例（R-02② 的"各一例"）。
 *
 * ⚠ `fsrs_cards` 行**没有 `due` 列**（列 = fsrs_data / last_review / created_at / updated_at），
 * 所以判据点名的 `due` 一律从 `fsrs_data` 里解出来比 —— 那才是排期真正落库的地方。
 *
 * 只在 `os.tmpdir()` 的临时库上跑，**绝不碰仓库根 `data.db` / `packages/server/data.db`**。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RATING_VALUES, ReviewResultSchema, ReviewUndoResultSchema, UNDO_MAX_PER_SESSION } from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createReviewRouter } from '../../src/routes/review.js';
import { review } from '../../src/trpc/routers/review.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import type { AuthEnv } from '../../src/middleware/auth.js';
import { cardFromJson, cardToJson, createDefaultCard } from '../../src/services/fsrs.js';
import { RATING_DOMAIN_HINT, REVIEW_ERROR_CODES, ReviewError } from '../../src/services/review-service.js';

const TEST_SECRET = 'tm-t10-review-parity-secret';
/** `middleware/auth.ts` 走 `loadConfig().jwtSecret`；根 .env 有值就用它，没值才注入测试密钥。 */
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-t10-parity-${process.pid}`);
const T0 = 1_770_000_000_000;
/** 冻结时刻：判据③ 要求 due/reviewedAt 可比，跨秒就会漂，所以时间必须是常量。 */
const FIXED = new Date('2026-03-05T09:00:00.000Z');
const LAST_REVIEW = Date.parse('2026-03-02T09:00:00.000Z');

/** 线上 `fsrs_cards.data` 的手写样本（Review 态、有 lapses），不来自被测代码。 */
const FIXTURE_DATA =
  '{"due":"2026-03-05T09:00:00.000Z","stability":5.5,"difficulty":6,' +
  '"elapsed_days":3,"scheduled_days":4,"reps":3,"lapses":1,"state":2,' +
  '"last_review":"2026-03-02T09:00:00.000Z"}';

/** 判据⑥：`fsrs_cards.data` 的序列化格式快照（键集合 + 键序），改一个字节即红。 */
const SERIALIZATION_SNAPSHOT =
  '{"due":"1970-01-01T00:00:00.000Z","stability":1,"difficulty":5,"elapsed_days":0,' +
  '"scheduled_days":0,"reps":0,"lapses":0,"state":0,"last_review":null}';

/** ts-fsrs 的**实际安装版本**（不是 package.json 里的范围）：ESM 下不用 require.resolve。 */
function installedTsFsrsVersion(): string {
  const candidates = [
    '../../node_modules/ts-fsrs/package.json',
    '../../../node_modules/ts-fsrs/package.json',
  ].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
  for (const file of candidates) {
    try {
      return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string }).version;
    } catch {
      /* 试下一个候选 */
    }
  }
  throw new Error(`ts-fsrs 不可解析（判据⑥ 的版本钉无从取证）。候选：${candidates.join(', ')}`);
}

let db: SqliteAppDB;
let uRest = 0;
let uTrpc = 0;
let uShape = 0;
let uUndo = 0;
let uUndoLimit = 0;
/* A-33-6 双门面错误码等值：三支各占一个独立用户，互不污染轮次台账。 */
let uN2Undo = 0;
let uN2Rating = 0;
let uN2Limit = 0;
const tmpFile = (name: string): string => path.join(tmpDir, name);

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

/** CL-3（A-33-7）之后 REST 门面收 `deps:{events}`；本文件不测事件，给一个空实现即可。 */
const restApp = (): Hono<AuthEnv> =>
  new Hono<AuthEnv>().route('/', createReviewRouter(db, { events: { record: (): void => {} } }));

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

/** REST 门面：只带 Bearer 头，其余交给 Hono 路由本身。 */
async function rest(
  userId: number,
  pathname: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await restApp().request(pathname, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token(userId)}`,
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function trpcCaller(userId: number) {
  const ctx = {
    userId,
    clientIp: '127.0.0.1',
    db,
    /** 事件采集器与评分排期无关（判据③ 只比 due/state/reps）；REST 侧自 CL-3 起同样有它。 */
    events: { record: (): void => {} },
  } as unknown as TrpcContext;
  return createCallerFactory(review)(ctx);
}

/**
 * **线上**tRPC 门面（A-33-6 专用）。`createCallerFactory` 直调会把 `TRPCError.data` 剥掉，
 * 所以"`asTrpcError()` 经 `cause.{tmCode,httpStatus}` 传的码有没有被 `trpc/init.ts` 的唯一
 * errorFormatter 提升成客户端可读的 `data.code`"只能真的走一次 HTTP 才能取证
 * （与 T-11 在 `profile-dto.spec.ts`、T-07 在 `auth-register.spec.ts` 立的口径一致）。
 * 门面本文件自己拼：`trpcServer({ router: review })` + 手搭 ctx，**不依赖 T-07 的 `app.ts`**。
 */
function trpcOnline(userId: number): Hono {
  const app = new Hono();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: review,
      // 写成字面量而不是 `as TrpcContext`：`trpcServer` 的 createContext 声明要 Record<string, unknown>。
      createContext: async () => ({ userId, clientIp: '127.0.0.1', db, events: { record: () => {} } }),
    }),
  );
  return app;
}

/** 线上 tRPC 错误体的可读面：`data.code` / `data.httpStatus` / `message`（errorFormatter 之后的形状）。 */
async function trpcOnlineError(
  proc: 'reviewCard' | 'undo' | 'queue',
  userId: number,
  input: unknown,
): Promise<{ status: number; code: unknown; httpStatus: unknown; message: unknown; raw: unknown }> {
  const res = await trpcOnline(userId).request(`/trpc/${proc}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = (raw.error ?? {}) as Record<string, unknown>;
  const json = (err.json ?? err) as Record<string, unknown>;
  const data = (json.data ?? {}) as Record<string, unknown>;
  return {
    status: res.status,
    code: data.code,
    httpStatus: data.httpStatus,
    message: json.message,
    raw,
  };
}

/** 给某个用户写一份**逐字节相同**的起点卡。 */
async function seedCard(userId: number, word: string, data = FIXTURE_DATA): Promise<void> {
  await db.fsrs.upsertCard(userId, word, data, LAST_REVIEW, FIXED.getTime());
}

const row = (userId: number, word: string) => db.fsrs.getCard(userId, word);
/** `fsrs_cards` 没有 `due` 列 → 判据点名的 due 从 data 串里解。 */
const dueOf = (fsrsData: string | null | undefined): string | undefined =>
  fsrsData ? cardFromJson(fsrsData).due.toISOString() : undefined;

async function cardStateOf(userId: number): Promise<string> {
  const rows = await db.fsrs.getCardsByUser(userId);
  return JSON.stringify(
    rows.map((r) => [r.word, r.fsrs_data, r.last_review]).sort((a, b) => String(a).localeCompare(String(b))),
  );
}

async function rowCount(userId: number): Promise<number> {
  return (await db.fsrs.getCardsByUser(userId)).length;
}

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('parity.db');
  uRest = await db.createUser('13800000001', T0);
  uTrpc = await db.createUser('13800000002', T0);
  uShape = await db.createUser('13800000003', T0);
  uUndo = await db.createUser('13800000004', T0);
  uUndoLimit = await db.createUser('13800000005', T0);
  uN2Undo = await db.createUser('13800000006', T0);
  uN2Rating = await db.createUser('13800000007', T0);
  uN2Limit = await db.createUser('13800000008', T0);
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const frozen = (): void => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED);
};

describe('判据③ R-02②：同一 (user, word, rating) 双门面逐字段相等', () => {
  for (const rating of RATING_VALUES) {
    it(`rating=${rating}：REST 与 tRPC 的响应体 / data / due / state / reps 全等`, async () => {
      frozen();
      const word = `parity-r${rating}`;
      await seedCard(uRest, word);
      await seedCard(uTrpc, word);

      const res = await rest(uRest, '/api/review', {
        method: 'POST',
        body: JSON.stringify({ word, rating }),
      });
      expect(res.status).toBe(200);
      const restBody = res.body;
      const trpcBody = (await trpcCaller(uTrpc).reviewCard({ word, rating })) as unknown as Record<string, unknown>;

      // 1) 整个响应体：键集合与取值全部相等（连 `response` 空串位都同形）。
      //    `reviewedAt` 单独比（它是两侧唯一可能含时钟的值），其余键必须全等。
      expect(Object.keys(trpcBody).sort()).toEqual(Object.keys(restBody).sort());
      const restSans: Record<string, unknown> = { ...restBody };
      const trpcSans: Record<string, unknown> = { ...trpcBody };
      delete restSans.reviewedAt;
      delete trpcSans.reviewedAt;
      expect(trpcSans).toEqual(restSans);
      // reviewedAt 也必须同值（两侧都用落库的 last_review 推，不用 Date.now()）。
      expect(trpcBody.reviewedAt).toBe(restBody.reviewedAt);

      // 2) 判据点名的三字段（响应面）。
      expect(trpcBody.due).toBe(restBody.due);
      expect(trpcBody.state).toBe(restBody.state);
      expect(trpcBody.reps).toBe(restBody.reps);
      expect(trpcBody.rating).toBe(rating);
      expect(typeof restBody.due).toBe('string');

      // 3) 落库面：两个用户同一时刻评同一个词，data 串必须逐字节相同。
      const a = await row(uRest, word);
      const b = await row(uTrpc, word);
      expect(a).not.toBeNull();
      expect(b?.fsrs_data).toBe(a?.fsrs_data);
      expect(b?.last_review).toBe(a?.last_review);
      expect(dueOf(b?.fsrs_data)).toBe(dueOf(a?.fsrs_data));
      expect(dueOf(b?.fsrs_data)).toBe(restBody.due);
      expect(cardFromJson(String(b?.fsrs_data)).state).toBe(restBody.state);
      expect(cardFromJson(String(b?.fsrs_data)).reps).toBe(restBody.reps);

      // 4) 两侧都必须是 `@tm/shared` 契约的合法实例（不是"自定义形状恰好相同"）。
      expect(ReviewResultSchema.safeParse(restBody).success, 'REST 侧 ReviewResult 契约').toBe(true);
      expect(ReviewResultSchema.safeParse(trpcBody).success, 'tRPC 侧 ReviewResult 契约').toBe(true);
    });
  }

  it('错误面同样收敛：越界 rating 两侧都是 400 语义（tRPC 侧由 shared 的 zod 契约先拦，不截断）', async () => {
    await seedCard(uTrpc, 'parity-err');
    // tRPC 的门禁是 `RatingLiteralSchema`（@tm/shared 契约），REST 的门禁是 service 的
    // `normalizeRating` —— 两侧都"拒"，谁都没有 Math.min/max 夹回（判据④）。
    await expect(
      trpcCaller(uTrpc).reviewCard({ word: 'parity-err', rating: 9 } as unknown as { word: string; rating: 1 }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    const res = await rest(uRest, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: 'parity-err', rating: 9 }),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(RATING_DOMAIN_HINT);
    expect(res.body.code).toBe(REVIEW_ERROR_CODES.INVALID_RATING);
    // 过了 zod 但被 service 拦下的那一类（词形非法）：两门面surfacing 的是同一份 service 文案
    const wordCopy = new ReviewError('INVALID_WORD').message;
    const viaRest = await rest(uRest, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: '   ', rating: 3 }),
    });
    expect(viaRest.status).toBe(400);
    expect(viaRest.body.error).toBe(wordCopy);
    await expect(trpcCaller(uTrpc).reviewCard({ word: '   ', rating: 3 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: wordCopy,
    });
  });
});

describe('判据⑧ 旧 APK 契约：POST /api/review 与 GET /api/review/today 响应形状不变', () => {
  it('today 的键集合与 queue 条目键集合与旧版一致', async () => {
    frozen();
    await seedCard(uShape, 'shape-apple');
    const res = await rest(uShape, '/api/review/today');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['dueToday', 'queue', 'total']);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.dueToday).toBe('number');
    const queue = res.body.queue as Array<Record<string, unknown>>;
    expect(Array.isArray(queue)).toBe(true);
    expect(queue).toHaveLength(1);
    expect(Object.keys(queue[0] as Record<string, unknown>).sort()).toEqual([
      'elapsedDays',
      'retrievability',
      'word',
    ]);
    expect(queue[0]?.word).toBe('shape-apple');

    // tRPC review.today 与 REST 同一函数、同一形状、同一内容（同一用户同一冻结时刻）
    const viaTrpc = (await trpcCaller(uShape).today()) as unknown as Record<string, unknown>;
    expect(Object.keys(viaTrpc).sort()).toEqual(['dueToday', 'queue', 'total']);
    expect(viaTrpc).toEqual(res.body);
  });

  it('POST /api/review 保留 ok / response 两键，新增键只增不改名', async () => {
    frozen();
    await seedCard(uShape, 'shape-pear');
    const res = await rest(uShape, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: 'shape-pear', rating: 3 }),
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.response).toBe('');
    expect(typeof res.body.stabilityAfter).toBe('number');
    expect(typeof res.body.nextReview).toBe('string');
    expect(res.body.nextReview).toBe(res.body.due);
  });
});

describe('判据④ rating 越界 → 400 INVALID_RATING（不截断）', () => {
  for (const bad of [0, 5, -1, 2.5, 'x', null, undefined]) {
    it(`rating=${String(bad)} 被拒且卡片零写入`, async () => {
      await seedCard(uShape, 'guard-apple');
      const before = await row(uShape, 'guard-apple');
      const res = await rest(uShape, '/api/review', {
        method: 'POST',
        body: JSON.stringify({ word: 'guard-apple', rating: bad }),
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(REVIEW_ERROR_CODES.INVALID_RATING);
      // 文案与 `@tm/shared` 的 RATING_VALUES / RATING_LABELS 同源的组装串，不是裸字面量。
      expect(res.body.error).toBe(RATING_DOMAIN_HINT);
      expect((await row(uShape, 'guard-apple'))?.fsrs_data).toBe(before?.fsrs_data);
    });
  }

  it('字符串 "3" 与数字 3 同义（旧 REST 口径保持）', async () => {
    frozen();
    await seedCard(uShape, 'str-rating');
    await seedCard(uTrpc, 'str-rating');
    const viaRest = (await rest(uShape, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: 'str-rating', rating: '3' }),
    })).body;
    const viaTrpc = (await trpcCaller(uTrpc).reviewCard({ word: 'str-rating', rating: 3 })) as unknown as
      Record<string, unknown>;
    expect(viaTrpc.due).toBe(viaRest.due);
    expect((await row(uTrpc, 'str-rating'))?.fsrs_data).toBe((await row(uShape, 'str-rating'))?.fsrs_data);
  });
});

describe('判据⑤ mode=new / selfTest 不写 FSRS 卡（fsrs_cards 行数与内容一字不变）', () => {
  it('取队列表面：三种模式都不增加/改动 fsrs_cards', async () => {
    await db.wordbooks.saveData(
      uShape,
      [
        { word: 'brand-new-word', addedAt: T0 },
        { word: 'apple', addedAt: T0 },
        { word: 'banana', addedAt: T0 },
        { word: 'cherry', addedAt: T0 },
        { word: 'durian', addedAt: T0 },
      ],
      T0,
    );
    const beforeCount = await rowCount(uShape);
    const beforeState = await cardStateOf(uShape);

    for (const mode of ['new', 'selfTest']) {
      const res = await rest(uShape, `/api/review/queue?mode=${mode}`);
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe(mode);
      expect(Array.isArray(res.body.queue)).toBe(true);
      expect(typeof res.body.dailyGoal).toBe('number');
      for (const item of res.body.queue as Array<Record<string, unknown>>) {
        expect(Object.keys(item).sort()).toEqual(['gloss', 'hasCard', 'word']);
      }
      // 取队本身也不许动卡片（R-12④）
      expect(await rowCount(uShape)).toBe(beforeCount);
      expect(await cardStateOf(uShape)).toBe(beforeState);
    }
  });

  it('自测里评分：scheduled=false 且 fsrs_cards 一字不变', async () => {
    frozen();
    await seedCard(uShape, 'selftest-apple');
    const before = await row(uShape, 'selftest-apple');
    const beforeCount = await rowCount(uShape);
    const res = await rest(uShape, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: 'selftest-apple', rating: 4, mode: 'selfTest' }),
    });
    expect(res.status).toBe(200);
    expect(res.body.scheduled).toBe(false);
    // 算得出排期（同一函数），但一行都不写（判据⑤ / R-02④）
    expect(typeof res.body.due).toBe('string');
    expect((await row(uShape, 'selftest-apple'))?.fsrs_data).toBe(before?.fsrs_data);
    expect(await rowCount(uShape)).toBe(beforeCount);

    const viaTrpc = (await trpcCaller(uTrpc).queue({ mode: 'selfTest' })) as unknown as Record<string, unknown>;
    expect(viaTrpc.mode).toBe('selfTest');
  });

  it('mode 越界 → 400 INVALID_MODE', async () => {
    const res = await rest(uShape, '/api/review/queue?mode=nope');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(REVIEW_ERROR_CODES.INVALID_MODE);
  });
});

describe('判据⑥ 撤销回快照 + 序列化格式/ts-fsrs 版本未变', () => {
  it('undo 一次后 data / due / reps 回到快照值', async () => {
    frozen();
    await seedCard(uUndo, 'undo-apple');
    const before = await row(uUndo, 'undo-apple');
    expect(before?.fsrs_data).toBe(FIXTURE_DATA);
    expect(cardFromJson(FIXTURE_DATA).reps).toBe(3);

    const rated = await rest(uUndo, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: 'undo-apple', rating: 1 }),
    });
    expect(rated.body.reps).toBe(4);
    const dirty = await row(uUndo, 'undo-apple');
    expect(dirty?.fsrs_data).not.toBe(FIXTURE_DATA);

    const undone = await rest(uUndo, '/api/review/undo', {
      method: 'POST',
      body: JSON.stringify({ word: 'undo-apple' }),
    });
    expect(undone.status).toBe(200);
    expect(undone.body.ok).toBe(true);
    expect(undone.body.remaining).toBe(UNDO_MAX_PER_SESSION - 1);
    expect(undone.body.index).toBe(0);
    expect(undone.body.data).toBe(FIXTURE_DATA);
    // 撤销回参同样是 shared `ReviewUndoResultSchema` 的合法实例（多余键只加不改名）
    expect(ReviewUndoResultSchema.safeParse(undone.body).success).toBe(true);

    const after = await row(uUndo, 'undo-apple');
    // 回写的是快照里的**序列化原文**，所以是逐字节相等，而不是"重新序列化后相似"。
    expect(after?.fsrs_data).toBe(FIXTURE_DATA);
    expect(dueOf(after?.fsrs_data)).toBe(dueOf(before?.fsrs_data));
    expect(after?.last_review).toBe(before?.last_review);
    expect(cardFromJson(String(after?.fsrs_data)).reps).toBe(3);
  });

  it('tRPC review.undo 与 REST 同一实现：同串回写、同一键集合', async () => {
    frozen();
    await seedCard(uTrpc, 'undo-trpc');
    await trpcCaller(uTrpc).reviewCard({ word: 'undo-trpc', rating: 1 });
    const undone = (await trpcCaller(uTrpc).undo({ word: 'undo-trpc' })) as unknown as Record<string, unknown>;
    expect(undone.data).toBe(FIXTURE_DATA);
    expect(ReviewUndoResultSchema.safeParse(undone).success).toBe(true);
    expect((await row(uTrpc, 'undo-trpc'))?.fsrs_data).toBe(FIXTURE_DATA);

    const restUndo = await rest(uShape, '/api/review/undo', {
      method: 'POST',
      body: JSON.stringify({ word: 'no-such-snapshot' }),
    });
    expect(restUndo.status).toBe(409);
    expect(restUndo.body.code).toBe(REVIEW_ERROR_CODES.NOTHING_TO_UNDO);
    await expect(trpcCaller(uTrpc).undo({ word: 'no-such-snapshot' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('同一张卡撤第二次 = 409 NOTHING_TO_UNDO（快照取一条删一条）', async () => {
    const res = await rest(uUndo, '/api/review/undo', {
      method: 'POST',
      body: JSON.stringify({ word: 'undo-apple' }),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(REVIEW_ERROR_CODES.NOTHING_TO_UNDO);
  });

  it('R-11④ 一轮最多撤销 3 次：第 4 次 429 UNDO_LIMIT_REACHED', async () => {
    frozen();
    const words = ['lim-a', 'lim-b', 'lim-c', 'lim-d'];
    for (const w of words) await seedCard(uUndoLimit, w);
    for (const w of words) {
      expect((await rest(uUndoLimit, '/api/review', { method: 'POST', body: JSON.stringify({ word: w, rating: 2 }) })).status).toBe(200);
    }
    for (let i = 0; i < UNDO_MAX_PER_SESSION; i += 1) {
      const r = await rest(uUndoLimit, '/api/review/undo', { method: 'POST', body: JSON.stringify({ word: words[i] }) });
      expect(r.status).toBe(200);
      expect(r.body.remaining).toBe(UNDO_MAX_PER_SESSION - i - 1);
    }
    const over = await rest(uUndoLimit, '/api/review/undo', {
      method: 'POST',
      body: JSON.stringify({ word: words[UNDO_MAX_PER_SESSION] as string }),
    });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe(REVIEW_ERROR_CODES.UNDO_LIMIT_REACHED);
  });

  it('ts-fsrs 钉在 4.7.1（A-2），且 cardToJson 的键序一字未改', () => {
    expect(installedTsFsrsVersion()).toBe('4.7.1');
    expect(cardToJson(createDefaultCard(new Date(0)))).toBe(SERIALIZATION_SNAPSHOT);
    // 起点 fixture 本身也必须是同一序列化形状（读得进、写得回同一串）
    expect(cardToJson(cardFromJson(FIXTURE_DATA))).toBe(FIXTURE_DATA);
  });
});

describe('判据⑦ 单次评分 P95 < 300ms（本机 sqlite，100 次采样，进程内断言）', () => {
  it('POST /api/review ×100 的 P95 在阈值内', async () => {
    await seedCard(uShape, 'perf-apple');
    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const started = process.hrtime.bigint();
      const res = await rest(uShape, '/api/review', {
        method: 'POST',
        body: JSON.stringify({ word: 'perf-apple', rating: 3 }),
      });
      expect(res.status).toBe(200);
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (n: number): number => sorted[Math.min(sorted.length - 1, n)] as number;
    const p50 = at(49);
    const p95 = at(Math.ceil(sorted.length * 0.95) - 1);
    const max = at(sorted.length - 1);
    console.log(`[T-10 判据⑦] POST /api/review n=100 p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`);
    expect(p95).toBeLessThan(300);
  });
});

/**
 * A-33-6（N-2）· 判据③「错误码那一半」的缺口。
 *
 * 修前病灶：`asTrpcError()` 传的是 `cause: err`（`ReviewError` 实例，字段 `code`/`http`），
 * 而 `trpc/init.ts` 的 errorFormatter 读 `cause.tmCode`/`cause.httpStatus` ⇒ 复习域
 * REST 侧 `reviewErrorBody` 正确、tRPC 侧 `data.code` 永远只剩协议码
 * （`BAD_REQUEST`/`CONFLICT`/`TOO_MANY_REQUESTS`），两端只收敛了一半。
 *
 * 等值口径：REST 的 `{ status, body.code, body.error }` ↔ tRPC **线上**错误体的
 * `{ status, data.code, data.message }`（caller 直调看不到 `data`，所以必须真打一次 HTTP）。
 */
describe('A-33-6（N-2）双门面错误码等值：同一输入经 REST 与经 tRPC 的 code / httpStatus 逐字相同', () => {
  it('同一张重复撤销的卡：NOTHING_TO_UNDO + 409 两侧逐字相同（修前 tRPC 侧是 CONFLICT）', async () => {
    frozen();
    const word = 'n2-undo-twice';
    await seedCard(uN2Undo, word);
    expect(
      (await rest(uN2Undo, '/api/review', { method: 'POST', body: JSON.stringify({ word, rating: 1 }) })).status,
    ).toBe(200);
    // 第一次撤销成功（快照取一条删一条）
    expect(
      (await rest(uN2Undo, '/api/review/undo', { method: 'POST', body: JSON.stringify({ word }) })).status,
    ).toBe(200);

    const viaRest = await rest(uN2Undo, '/api/review/undo', {
      method: 'POST',
      body: JSON.stringify({ word }),
    });
    const viaTrpc = await trpcOnlineError('undo', uN2Undo, { word });
    console.info(
      `[T-10 A-33-6] NOTHING_TO_UNDO REST=${JSON.stringify(viaRest)} tRPC 线上体=${JSON.stringify(viaTrpc.raw)}`,
    );

    expect(viaRest.status).toBe(409);
    expect(viaRest.body.code).toBe(REVIEW_ERROR_CODES.NOTHING_TO_UNDO);
    // 判据本体：两个键都必须与 REST 逐字相同
    expect([viaTrpc.code, viaTrpc.httpStatus], JSON.stringify(viaTrpc.raw)).toEqual([
      viaRest.body.code,
      viaRest.status,
    ]);
    expect(viaTrpc.message).toBe(viaRest.body.error);
    // 病灶确实被拔掉：不再是协议码顶上
    expect(viaTrpc.code).not.toBe('CONFLICT');
    // 撤销失败不许再改卡片状态（快照已被第一次撤销消费掉，串保持回写后的 FIXTURE_DATA）
    expect((await row(uN2Undo, word))?.fsrs_data).toBe(FIXTURE_DATA);
  });

  it('同一个非法词形（纯空格：两侧都穿过各自门禁、真的到达 service）：INVALID_WORD + 400 逐字相同', async () => {
    const viaRest = await rest(uN2Rating, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word: '   ', rating: 3 }),
    });
    const viaTrpc = await trpcOnlineError('reviewCard', uN2Rating, { word: '   ', rating: 3 });
    console.info(
      `[T-10 A-33-6] INVALID_WORD REST=${JSON.stringify(viaRest)} tRPC 线上体=${JSON.stringify(viaTrpc.raw)}`,
    );
    expect(viaRest.status).toBe(400);
    expect(viaRest.body.code).toBe(REVIEW_ERROR_CODES.INVALID_WORD);
    expect([viaTrpc.code, viaTrpc.httpStatus], JSON.stringify(viaTrpc.raw)).toEqual([
      viaRest.body.code,
      viaRest.status,
    ]);
    expect(viaTrpc.message).toBe(viaRest.body.error);
    expect(viaTrpc.code).not.toBe('BAD_REQUEST');
  });

  it('同一轮第 4 次撤销：UNDO_LIMIT_REACHED + 429 逐字相同（修前 tRPC 侧是 TOO_MANY_REQUESTS）', async () => {
    frozen();
    const words = ['n2-lim-a', 'n2-lim-b', 'n2-lim-c', 'n2-lim-d'];
    for (const w of words) await seedCard(uN2Limit, w);
    for (const w of words) {
      expect(
        (await rest(uN2Limit, '/api/review', { method: 'POST', body: JSON.stringify({ word: w, rating: 2 }) })).status,
      ).toBe(200);
    }
    for (let i = 0; i < UNDO_MAX_PER_SESSION; i += 1) {
      expect(
        (await rest(uN2Limit, '/api/review/undo', { method: 'POST', body: JSON.stringify({ word: words[i] }) })).status,
      ).toBe(200);
    }
    const over = words[UNDO_MAX_PER_SESSION] as string;
    const viaRest = await rest(uN2Limit, '/api/review/undo', { method: 'POST', body: JSON.stringify({ word: over }) });
    const viaTrpc = await trpcOnlineError('undo', uN2Limit, { word: over });
    console.info(
      `[T-10 A-33-6] UNDO_LIMIT_REACHED REST=${JSON.stringify(viaRest)} tRPC 线上体=${JSON.stringify(viaTrpc.raw)}`,
    );
    expect(viaRest.status).toBe(429);
    expect(viaRest.body.code).toBe(REVIEW_ERROR_CODES.UNDO_LIMIT_REACHED);
    expect([viaTrpc.code, viaTrpc.httpStatus], JSON.stringify(viaTrpc.raw)).toEqual([
      viaRest.body.code,
      viaRest.status,
    ]);
    expect(viaTrpc.message).toBe(viaRest.body.error);
    expect(viaTrpc.code).not.toBe('TOO_MANY_REQUESTS');
    // 超阈值那两次都没碰快照：第 4 张卡仍是评过分的状态（额度检查在 take 之前）
    expect((await row(uN2Limit, over))?.fsrs_data).not.toBe(FIXTURE_DATA);
  });

  it('同一个非法 rating（rating=9）：httpStatus 逐字相同；code 的**载体**不对称是 A-28-5 显式契约', async () => {
    const word = 'n2-bad-rating';
    await seedCard(uN2Rating, word);
    const before = await row(uN2Rating, word);
    const viaRest = await rest(uN2Rating, '/api/review', {
      method: 'POST',
      body: JSON.stringify({ word, rating: 9 }),
    });
    const viaTrpc = await trpcOnlineError('reviewCard', uN2Rating, { word, rating: 9 });
    console.info(
      `[T-10 A-33-6] INVALID_RATING REST=${JSON.stringify(viaRest)} tRPC 线上体=${JSON.stringify(viaTrpc.raw)}`,
    );
    expect(viaRest.status).toBe(400);
    expect(viaRest.body.code).toBe(REVIEW_ERROR_CODES.INVALID_RATING);
    // 等值的那一半：状态必须逐字相同（N-2 修前 tRPC 侧靠协议码反推恰好也是 400，这支证不了码）
    expect(viaTrpc.httpStatus).toBe(viaRest.status);
    // 有意**不等值**的那一半（A-28-5 裁决"保留现状并写成显式契约"）：
    // tRPC 的入参门禁是 @tm/shared 的 `RatingLiteralSchema`（字面量联合），zod 先拦 ⇒
    // 请求根本到不了 service 的 `normalizeRating`，所以线上载体是协议码 BAD_REQUEST；
    // REST 的门禁在 service 内 ⇒ INVALID_RATING。两侧都"拒、无默认回退、无截断"，语义一致。
    expect(viaTrpc.code).toBe('BAD_REQUEST');
    // 判据④：两个门面都必须零写入
    expect((await row(uN2Rating, word))?.fsrs_data).toBe(before?.fsrs_data);
  });
});
