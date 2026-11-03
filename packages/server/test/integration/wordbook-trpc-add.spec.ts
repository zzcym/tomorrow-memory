/**
 * E4b（A-82）· tRPC 词本 `add` 面的两处收口判据：
 *  - 件1：`add` 入参上限由 `max(100)` 收紧为 `max(WORD_MAX_LENGTH)`（值 64，来自 `@tm/shared`，不写字面量）；
 *    65 字符走 tRPC add 被拒（BAD_REQUEST），64 字符仍放行。
 *  - 件2：纯空格词（`'   '`，`min(1)` 放行、trim 后为空）在 mutation 体内、调 service 之前用
 *    `wordbookRejectionBody()` 拒成 400，且**与 REST push 面同码同 body**（`INVALID_WORDBOOK_ENTRY`）。
 *
 * 口径（与 `review-parity.spec.ts` / `wordbook-concurrency.spec.ts` 同一套）：
 *  - 独立临时 sqlite（`os.tmpdir()`），**绝不碰仓库根 `data.db` / `packages/server/data.db`**；
 *  - 不挂 `app.ts`（T-07 独占装配面）：REST 走 `createWordbookRouter`、tRPC 走 `trpcServer({ router: wordbook })`；
 *  - "同码同 body" 只在**线上 HTTP 门面**取证 —— caller 直调会剥掉 `data`（`review-parity.spec.ts` 已立此口径），
 *    errorFormatter（`trpc/init.ts` 唯一）把 `cause.{tmCode,httpStatus}` 提升成 `data.{code,httpStatus}`。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORD_MAX_LENGTH, type WordbookEntry } from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createWordbookRouter } from '../../src/routes/wordbook.js';
import { wordbook } from '../../src/trpc/routers/wordbook.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/services/feature-flags.js';
import { wordbookInvalidEntryBody } from '../../src/services/wordbook-service.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-e4b-wordbook-trpc-add-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-e4b-wb-add-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const T0 = Date.now();

let db: SqliteAppDB;
let flags: FeatureFlags;

function makeCache(): {
  getOrSet<T>(key: string, ttlSeconds: number, fallback: () => Promise<T>): Promise<T>;
  invalidate(key: string): Promise<void>;
} {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async getOrSet<T>(key: string, _ttl: number, fallback: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;
      const value = await fallback();
      store.set(key, { value, expiresAt: Date.now() + _ttl * 1000 });
      return value;
    },
    async invalidate(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
const cache = makeCache();

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

/** REST 词本门面（push 面 = 件2「同码同 body」的对照基准）。 */
const wordbookRestApp = (): Hono<AuthEnv> =>
  new Hono<AuthEnv>().route('/', createWordbookRouter(db, { flags, cache, now: () => Date.now() }));

async function rest(
  userId: number,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await wordbookRestApp().request(pathname, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** 线上 tRPC 门面（不依赖 app.ts）：件2「同码同 body」的取证通道。 */
function trpcOnline(userId: number): Hono {
  const app = new Hono();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: wordbook,
      createContext: async () => ({
        userId,
        clientIp: '127.0.0.1',
        db,
        flags,
        cache,
        events: { record: () => {} },
      }),
    }),
  );
  return app;
}

/** 线上 tRPC `wordbook.add` mutation：返回 HTTP 状态 + 错误体的可读面（`data.code`/`data.httpStatus`/`message`）。 */
async function trpcAddOnline(
  userId: number,
  word: string,
): Promise<{ status: number; ok: boolean; code: unknown; httpStatus: unknown; message: unknown; data: unknown }> {
  const res = await trpcOnline(userId).request('/trpc/add', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ word }),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const result = raw.result as { data?: Record<string, unknown> } | undefined;
  if (result?.data) {
    return { status: res.status, ok: true, code: undefined, httpStatus: undefined, message: undefined, data: result.data };
  }
  const err = (raw.error ?? {}) as Record<string, unknown>;
  const json = (err.json ?? err) as Record<string, unknown>;
  const data = (json.data ?? {}) as Record<string, unknown>;
  return {
    status: res.status,
    ok: false,
    code: data.code,
    httpStatus: data.httpStatus,
    message: json.message,
    data: json,
  };
}

/** caller 直调（跑 input zod 关 + mutation 体，但 errorFormatter 不参与 ⇒ 只判 accept/reject 与错误码）。 */
interface AddResult {
  ok: boolean;
  added: boolean;
  data: WordbookEntry[];
}
function wbCaller(userId: number) {
  const ctx = {
    userId,
    clientIp: '127.0.0.1',
    db,
    flags,
    cache,
    events: { record: () => {} },
  } as unknown as TrpcContext;
  return createCallerFactory(wordbook)(ctx) as unknown as {
    add: (input: { word: string }) => Promise<AddResult>;
  };
}

async function callerRejectionCode(userId: number, word: string): Promise<string | undefined> {
  try {
    await wbCaller(userId).add({ word });
    return undefined; // 未拒 → 用例自会红
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

let phoneSeq = 0;
const newUser = (): Promise<number> => db.createUser(`139${String(20_000_000 + (phoneSeq += 1))}`, T0);

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('wordbook-trpc-add.db');
  flags = createFeatureFlags(db);
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('E4b 件1：tRPC add 上限收紧为 WORD_MAX_LENGTH（64），非字面量 100', () => {
  it('WORD_MAX_LENGTH 值为 64（钉住"不写字面量"的口径来源）', () => {
    expect(WORD_MAX_LENGTH).toBe(64);
  });

  it('64 字符词走 tRPC add → 放行（added:true）', async () => {
    const u = await newUser();
    const word64 = 'a'.repeat(WORD_MAX_LENGTH);
    expect(word64.length).toBe(64);
    const res = await wbCaller(u).add({ word: word64 });
    expect(res.added).toBe(true);
    expect(res.data.some((e) => e.word === word64)).toBe(true);
  });

  it('65 字符词走 tRPC add → 拒成 BAD_REQUEST（收紧前这里是 200 放行）', async () => {
    const u = await newUser();
    const word65 = 'a'.repeat(WORD_MAX_LENGTH + 1);
    expect(word65.length).toBe(65);
    const code = await callerRejectionCode(u, word65);
    expect(code).toBe('BAD_REQUEST');
  });

  it('65 字符词走线上 tRPC → HTTP 400（zod 关），64 字符 → 200', async () => {
    const u = await newUser();
    const over = await trpcAddOnline(u, 'a'.repeat(65));
    expect(over.status).toBe(400);
    expect(over.ok).toBe(false);
    const within = await trpcAddOnline(u, 'a'.repeat(64));
    expect(within.status).toBe(200);
    expect(within.ok).toBe(true);
  });
});

describe('E4b 件2：纯空格词在 tRPC add 面拒成 400，与 REST push 同码同 body', () => {
  // 与 REST/生产同一条 400 出口（`wordbookInvalidEntryBody`），测试里不写第二份裸文案/裸码。
  const WB400 = wordbookInvalidEntryBody(); // { status, body: { error, code } }

  it("'   '（trim 后为空）走线上 tRPC add → 400 + INVALID_WORDBOOK_ENTRY", async () => {
    const u = await newUser();
    const tr = await trpcAddOnline(u, '   ');
    expect(tr.status).toBe(400);
    expect(tr.ok).toBe(false);
    expect(tr.code).toBe(WB400.body.code);
    expect(tr.httpStatus).toBe(WB400.status);
  });

  it("tRPC 面错误码与人话文案 === REST push 面对纯空格的返回（同码同 body）", async () => {
    const uRest = await newUser();
    const uTrpc = await newUser();
    const restRes = await rest(uRest, 'POST', '/api/wordbook/push', {
      baseVersion: 0,
      entries: [{ word: '   ', addedAt: T0 }],
    });
    expect(restRes.status).toBe(WB400.status);
    expect(restRes.body.code).toBe(WB400.body.code);
    expect(restRes.body.error).toBe(WB400.body.error);

    const tr = await trpcAddOnline(uTrpc, '   ');
    expect(tr.status).toBe(restRes.status);
    expect(tr.code).toBe(restRes.body.code);
    expect(tr.message).toBe(restRes.body.error);
    expect(tr.httpStatus).toBe(restRes.status);
  });

  it('纯空格经 caller 直调同样被拒（BAD_REQUEST），不落库', async () => {
    const u = await newUser();
    const code = await callerRejectionCode(u, '   ');
    expect(code).toBe('BAD_REQUEST');
    // 未写入：读回应为空数组
    const book = (await rest(u, 'GET', '/api/wordbook')).body.data ?? [];
    expect((book as WordbookEntry[]).length).toBe(0);
  });
});
