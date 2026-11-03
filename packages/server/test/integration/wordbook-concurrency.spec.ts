/**
 * T-09 · 词本并发/双模集成用例（判据①②③④⑤⑥⑦ + §6.4-6 级红线的反证）。
 *
 * 口径（与 `test/integration/review-parity.spec.ts` 同一套）：
 * - 独立临时库：只在自己 `os.tmpdir()` 里建 sqlite，**绝不碰仓库根 `data.db` / `packages/server/data.db`**；
 * - 独立 Hono 实例：`new Hono().route('/', createWordbookRouter(db, {flags, cache, now}))`（§10.3 standalone），
 *   **不挂 `app.ts`**（那是 T-07 的独占装配面）；
 * - 开关只经注入的 `services/feature-flags.ts` 实例改：`flags.set(...)` 写库 + `flags.invalidate()`
 *   强制回读 → 证明"库里那一行是真相"，本文件不复制任何判定逻辑；
 * - 时钟注入 `now()`（REST 侧），幂等重放那一条要求同一时刻，所以用可手动推进的假时钟而不是 fake timers。
 *   ⚠ `TrpcContext` 没有 `now` 注入口（加它要改 T-07 独占的 `trpc/init.ts`），所以 **tRPC 门面那条路
 *   用的是真实 `Date.now()`**（比注入时钟旧）。凡"墓碑时刻 vs 条目时刻"的比较（防复活/重放）一律走
 *   REST + 注入时钟，tRPC 只用于"三门面同源"与形状断言。
 *
 * ⚠ 每个用例用**独立用户**，避免共享 `wordbooks` 行造成串扰。同一条 `feature_flags` 行会被前面的用例
 *   改掉，所以"进程默认值"这一类断言走 `FEATURE_FLAG_DEFAULTS` + 一个不查库的 flags 实例，不靠测试顺序。
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
  FEATURE_FLAG_DEFAULTS,
  FLAG_EFFECTIVE_MAX_SECONDS,
  FLAG_TTL_SECONDS,
  TM_ERROR_CODES,
  TM_ERRORS,
  WORD_MAX_LENGTH,
  WordbookPullResultSchema,
  WordbookPushResultSchema,
  errorMessage,
  supplementErrorStatus,
  type WordbookEntry,
} from '@tm/shared';
import { WORDBOOK_ENTRY_OPTIONAL_KEYS } from '@tm/shared/schema';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import type { AppDB } from '../../src/db/types.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createWordbookRouter } from '../../src/routes/wordbook.js';
import { wordbook } from '../../src/trpc/routers/wordbook.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/services/feature-flags.js';
import {
  createWordbookService,
  LEGACY_WORD_MAX_LENGTH,
  wordbookInvalidEntryBody,
  wordbookPushIssueCause,
  wordbookRejectionBody,
  type WordbookModeLog,
} from '../../src/services/wordbook-service.js';
import { parseTombstones } from '../../src/services/wordbook-merge.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-t09-wordbook-concurrency-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-t09-concurrency-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);

/** 基准时刻：真实 `Date.now()` + 10 分钟（见文件头"两条时钟"的说明）。用例只在此基础上推进。 */
const T0 = Date.now() + 600_000;
let clock = T0;
const now = (): number => clock;
const advance = (ms: number): number => {
  clock += ms;
  return clock;
};
/** 绝对设钟：判据② 要证明"合并结果与到达顺序无关"，两趟必须落在同一时刻。 */
const setClock = (t: number): number => {
  clock = t;
  return clock;
};

/** 条目上除未知键之外的已知集合（红线：`data` 形状一字不动，只多出 `WORDBOOK_ENTRY_OPTIONAL_KEYS`）。 */
const KNOWN_KEYS = ['word', 'addedAt', 'lastReview', 'reviewCount'] as const;
const ALLOWED_KEYS = new Set<string>([...KNOWN_KEYS, ...WORDBOOK_ENTRY_OPTIONAL_KEYS]);

let db: SqliteAppDB;
let flags: FeatureFlags;
let saveDataCalls = 0;
const events: Array<{ user_id: number; event_type: string; word_id: string }> = [];

/** 内存版缓存（与 `CacheService.getOrSet` 同语义），让"写完立刻读到新值"这条可证。 */
function makeCache(): {
  getOrSet<T>(key: string, ttlSeconds: number, fallback: () => Promise<T>): Promise<T>;
  invalidate(key: string): Promise<void>;
} {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async getOrSet<T>(key: string, ttlSeconds: number, fallback: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;
      const value = await fallback();
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return value;
    },
    async invalidate(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

const cache = makeCache();

/** "库里没有这一行"的假 db：只为走 `feature-flags` 的种子回退分支（判据④ 的默认档取证），不碰任何业务表。 */
const noRowDb = { flags: { get: async (): Promise<null> => null, set: async (): Promise<void> => undefined } };

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

const wordbookRouterApp = (): Hono<AuthEnv> =>
  new Hono<AuthEnv>().route('/', createWordbookRouter(db, { flags, cache, now }));
const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

interface RestResult {
  status: number;
  body: Record<string, unknown>;
}

async function rest(userId: number, method: string, pathname: string, body?: unknown): Promise<RestResult> {
  const res = await wordbookRouterApp().request(pathname, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const getBook = async (userId: number): Promise<WordbookEntry[]> =>
  ((await rest(userId, 'GET', '/api/wordbook')).body.data ?? []) as WordbookEntry[];
const putBook = (userId: number, data: unknown[]): Promise<RestResult> => rest(userId, 'PUT', '/api/wordbook', { data });
const pushTo = (userId: number, input: Record<string, unknown>): Promise<RestResult> =>
  rest(userId, 'POST', '/api/wordbook/push', input);
const pullFrom = (userId: number): Promise<RestResult> => rest(userId, 'GET', '/api/wordbook/pull');

/** tRPC 门面的调用面（键集合就是 `trpc/routers/wordbook.ts` 的返回，写死以便类型可判）。 */
interface WordbookCaller {
  list(): Promise<WordbookEntry[]>;
  add(input: { word: string }): Promise<{ ok: boolean; added: boolean; data: WordbookEntry[] }>;
  remove(input: { word: string }): Promise<{ ok: boolean; data: WordbookEntry[] }>;
  clear(): Promise<{ ok: boolean; data: WordbookEntry[] }>;
}

function wbCaller(userId: number): WordbookCaller {
  const ctx = {
    userId,
    clientIp: '127.0.0.1',
    db,
    flags,
    cache,
    events: { record: (e: (typeof events)[number]): void => void events.push(e) },
  } as unknown as TrpcContext;
  return createCallerFactory(wordbook)(ctx) as unknown as WordbookCaller;
}

/* ── 开关：只经 `feature-flags` 实例改，改完 invalidate 证明"库是真相" ── */
async function setIncremental(value: string): Promise<void> {
  await flags.set('wordbookIncremental', value, { now: now() });
  flags.invalidate();
}
async function setExplicitFavorite(value: string): Promise<void> {
  await flags.set('explicitFavorite', value, { now: now() });
  flags.invalidate();
}

const svcOf = (): ReturnType<typeof createWordbookService> => createWordbookService({ db, flags, cache, now });

const syncStateOf = (userId: number) => db.wordbooks.getSyncState(userId);
const versionOf = async (userId: number): Promise<number> => (await syncStateOf(userId))?.sync_version ?? 0;
const dataJsonOf = async (userId: number): Promise<string> => JSON.stringify(await db.wordbooks.getData(userId));
const wordsOf = (entries: WordbookEntry[]): string[] => entries.map((e) => e.word).sort();
const entryOf = (entries: WordbookEntry[], word: string): WordbookEntry | undefined =>
  entries.find((e) => e.word === word);
const tombstoneKeysOf = async (userId: number): Promise<string[]> =>
  Object.keys(parseTombstones((await syncStateOf(userId))?.tombstones ?? '[]')).sort();

let phoneSeq = 0;
const newUser = (): Promise<number> => db.createUser(`138${String(10_000_000 + (phoneSeq += 1))}`, T0);

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('wordbook-concurrency.db');
  flags = createFeatureFlags(db);
  // §4.4.3 红线"落库只有一条路径"的反证探针：谁调 `saveData`（无 CAS 的整表覆写）都会被计数
  const original = db.wordbooks.saveData.bind(db.wordbooks);
  db.wordbooks.saveData = (userId: number, data: WordbookEntry[], at: number): Promise<void> => {
    saveDataCalls += 1;
    return original(userId, data, at);
  };
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ═══════════════════════════ 判据① R-03② 并发不丢词 ═══════════════════════════ */

describe('判据① R-03②：两 client 各加不同词 → 双方都在', () => {
  it('两个 REST 客户端同一 baseVersion 各 push 一个不同词 → 后到的拿 409，重放后两个词都在', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(1);
    const base = await versionOf(u);

    const [a, b] = await Promise.all([
      pushTo(u, { baseVersion: base, entries: [{ word: 'alpha', addedAt: T0 + 10 }] }),
      pushTo(u, { baseVersion: base, entries: [{ word: 'beta', addedAt: T0 + 20 }] }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    const loserEntry = a.status === 200 ? { word: 'beta', addedAt: T0 + 20 } : { word: 'alpha', addedAt: T0 + 10 };
    expect(loser.body).toMatchObject({ code: TM_ERROR_CODES.WORDBOOK_STALE });
    // 赢的那次恰好把版本推 1，输的那次拿到同一个新 version → 重放只需一次
    expect(Number(winner.body.version)).toBe(base + 1);
    expect(Number(loser.body.version)).toBe(base + 1);

    const replayed = await pushTo(u, { baseVersion: Number(loser.body.version), entries: [loserEntry] });
    expect(replayed.status).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual(['alpha', 'beta']);
    expect(await versionOf(u)).toBe(base + 2);
  });

  it('同一用户 8 路真并发 `wordbook.add`（tRPC 门面）→ 8 个词全在，一个字没丢', async () => {
    const u = await newUser();
    await setIncremental('100%');
    const before = await versionOf(u);
    const words = ['con-a', 'con-b', 'con-c', 'con-d', 'con-e', 'con-f', 'con-g', 'con-h'];

    const results = await Promise.all(words.map((w) => wbCaller(u).add({ word: w })));
    expect(wordsOf(await getBook(u))).toEqual([...words].sort());
    // 每次 add 都是一次真改动 → 版本恰好 +8（"覆盖掉别人"会表现为少推）
    expect(await versionOf(u)).toBe(before + words.length);
    expect(results.every((r) => r.added)).toBe(true);
    // 每个响应里的 `data` 是"它自己提交那一刻"的整数组：必须含自己的词、只可能是这 8 个词的子集，
    // 且 8 个子集并起来正好等于最终数组（谁也没被别人的快照洗掉）。
    const union = new Set<string>();
    results.forEach((res, i) => {
      const seen = wordsOf(res.data);
      expect(seen).toContain(words[i]);
      for (const w of seen) {
        expect(words).toContain(w);
        union.add(w);
      }
    });
    expect([...union].sort()).toEqual([...words].sort());
    // 判据①的另一半：新词的 FSRS 卡仍落库（卡片初始化从门面挪进了事务内的 `ensureNewCards`）
    for (const w of words) expect(await db.fsrs.getCard(u, w)).not.toBeNull();
    expect(events.filter((e) => e.user_id === u && e.event_type === 'word_added')).toHaveLength(words.length);
  });

  it('tRPC `add` 与 on 态 `PUT /api/wordbook` 并发：on 态的整数组上交不再是覆盖，两边词都在', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(5);
    expect((await putBook(u, [{ word: 'seed-one', addedAt: T0 + 1 }])).status).toBe(200);
    const [viaTrpc, viaPut] = await Promise.all([
      wbCaller(u).add({ word: 'mixed-trpc' }),
      putBook(u, [{ word: 'mixed-put', addedAt: T0 + 6 }]),
    ]);
    expect(viaPut.status).toBe(200);
    expect(viaTrpc.added).toBe(true);
    expect(wordsOf(await getBook(u))).toEqual(['mixed-put', 'mixed-trpc', 'seed-one']);
  });

  /**
   * 红线"CAS 重试不得复用陈旧投影"的**确定性**取证（上一轮修的 lost-update 就死在这一条上）。
   * 判据① 第二条的 8 路真并发只是"碰巧交错"，这里直接把交错**造出来**：
   * 第一次 `applySync` 落库前插进一条与调用方投影无关的并发写，并让本次 CAS 判未命中。
   * 若重试沿用了第一次的投影（不含对手的词），第二次写就会把它覆盖掉 → 下面第二条断言当场红。
   */
  it('CAS 重试重新读状态、重新投影（强制造一次 stale）→ 并发对手刚写进去的词没被陈旧投影洗掉', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(75);
    const original = db.wordbooks.applySync.bind(db.wordbooks);
    let injected = 0;
    const competitor = { word: 'midflight-race', addedAt: T0 + 76 };
    db.wordbooks.applySync = async (userId, data, tombstonesJson, baseVersion, at) => {
      if (injected === 0) {
        injected += 1;
        // 对手按"它自己读到的状态"落库（与调用方的 `data` 无关），模拟真交错
        const raced = await original(userId, [...(await db.wordbooks.getData(userId)), competitor], tombstonesJson, baseVersion, at);
        expect(raced.ok).toBe(true);
        return { ok: false, version: raced.version, reason: 'stale' as const };
      }
      return original(userId, data, tombstonesJson, baseVersion, at);
    };
    try {
      const added = await wbCaller(u).add({ word: 'own-write' });
      expect(injected).toBe(1); // 确实走过一次重试分支
      expect(added.ok).toBe(true);
      expect(wordsOf(await getBook(u))).toEqual(['midflight-race', 'own-write']);
      // 重试后的**响应**也是新投影（不是第一次那份陈旧快照）
      expect(wordsOf(added.data)).toEqual(['midflight-race', 'own-write']);
      expect(await tombstoneKeysOf(u)).toEqual([]);
    } finally {
      db.wordbooks.applySync = original;
      await setIncremental('0%');
    }
  });
});

/* ═════════════════ 判据② R-03③：同词并发 = 字段各取各的方向 ═════════════════ */

describe('判据② R-03③：同一词并发写入 → reviewCount=max、lastReview 取晚、addedAt 取早', () => {
  const clientA = { word: 'echo', addedAt: T0 + 100, lastReview: T0 + 5_000, reviewCount: 3 };
  const clientB = { word: 'echo', addedAt: T0 - 100, lastReview: T0 + 9_000, reviewCount: 7 };
  /** 两个到达顺序各跑一次，最后比"合并结果必须相同"（可交换 = 谁是后写不再决定谁丢数据）。 */
  let mergedInOrderA: string | undefined;

  for (const [label, first, second, record] of [
    ['A 先到', clientA, clientB, true],
    ['B 先到', clientB, clientA, false],
  ] as const) {
    it(`${label}：两路各写各的字段，合并后 addedAt 取早 / lastReview 取晚 / reviewCount 取 max`, async () => {
      const u = await newUser();
      await setIncremental('100%');
      setClock(T0 + 20); // 两趟同一时刻 → 只有"到达顺序"不同，结果必须逐字节相同
      const base = await versionOf(u);

      const [r1, r2] = await Promise.all([
        pushTo(u, { baseVersion: base, entries: [first] }),
        pushTo(u, { baseVersion: base, entries: [second] }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      const loserEntry = r1.status === 409 ? first : second;
      const replay = await pushTo(u, { baseVersion: Number(loser.body.version), entries: [loserEntry] });
      expect(replay.status).toBe(200);

      const merged = entryOf(await getBook(u), 'echo');
      expect(merged).toBeDefined();
      expect(Number(merged?.addedAt)).toBe(Math.min(clientA.addedAt, clientB.addedAt));
      expect(Number(merged?.lastReview)).toBe(Math.max(clientA.lastReview, clientB.lastReview));
      expect(Number(merged?.reviewCount)).toBe(Math.max(clientA.reviewCount, clientB.reviewCount));
      expect(Object.keys(merged ?? {}).sort()).toEqual([...ALLOWED_KEYS].sort());

      if (record) mergedInOrderA = JSON.stringify(merged);
      else expect(JSON.stringify(merged)).toBe(mergedInOrderA);
    });
  }

  it('来方缺字段（旧客户端只发 {word,addedAt}）不得把服务端已有的 lastReview/reviewCount 抹掉', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(30);
    expect((await putBook(u, [{ word: 'echo', addedAt: T0 + 1, lastReview: T0 + 8_000, reviewCount: 12 }])).status).toBe(200);
    const res = await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'echo', addedAt: T0 + 2 }] });
    expect(res.status).toBe(200);
    const entry = entryOf(await getBook(u), 'echo');
    expect(Number(entry?.reviewCount)).toBe(12);
    expect(Number(entry?.lastReview)).toBe(T0 + 8_000);
  });
});

/* ═════════════════ 判据③ 409 载荷 + 重放路径 + 幂等 ═════════════════ */

describe('判据③ 409 WORDBOOK_STALE：携带服务端 version + 全量，重放路径可跑且幂等', () => {
  it('陈旧 baseVersion → 409 带最新 version 与全量 entries；重放后 version 不变', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(40);
    const first = await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'stale-seed', addedAt: T0 + 41 }] });
    expect(first.status).toBe(200);
    const v1 = Number(first.body.version);
    expect(Number.isInteger(v1)).toBe(true);

    const stale = await pushTo(u, { baseVersion: 0, entries: [{ word: 'late-client', addedAt: T0 + 42 }] });
    expect(stale.status).toBe(TM_ERRORS.WORDBOOK_STALE.http);
    expect(stale.body.code).toBe(TM_ERROR_CODES.WORDBOOK_STALE);
    expect(stale.body.error).toBe(TM_ERRORS.WORDBOOK_STALE.copy);
    // 409 必须自带"服务端真相"，客户端才能静默重放（shared 里 visible:false / replay-wordbook）
    expect(TM_ERRORS.WORDBOOK_STALE.visible).toBe(false);
    expect(TM_ERRORS.WORDBOOK_STALE.clientAction).toBe('replay-wordbook');
    expect(Number(stale.body.version)).toBe(v1);
    const server = stale.body.server as { updatedAt: number; entries: WordbookEntry[] };
    expect(typeof server.updatedAt).toBe('number');
    expect(wordsOf(server.entries)).toContain('stale-seed');
    expect(server.entries).toEqual(await getBook(u));
    expect(stale.body.pruned).toBe(false);

    // 重放路径：拿 409 里的 version 当 baseVersion 再交一次
    const replay = await pushTo(u, { baseVersion: v1, entries: [{ word: 'late-client', addedAt: T0 + 42 }] });
    expect(replay.status).toBe(200);
    const v2 = Number(replay.body.version);
    expect(v2).toBe(v1 + 1);
    expect(wordsOf(await getBook(u))).toEqual(['late-client', 'stale-seed']);

    // 幂等：同一份 body 再交一次 → version 不变、`data` 串逐字节不变（判据点名的就是这一条）
    const before = await dataJsonOf(u);
    const again = await pushTo(u, { baseVersion: v2, entries: [{ word: 'late-client', addedAt: T0 + 42 }] });
    expect(again.status).toBe(200);
    expect(Number(again.body.version)).toBe(v2);
    expect(await dataJsonOf(u)).toBe(before);
    expect(await versionOf(u)).toBe(v2);

    // 空 ops 重放同样不推版本
    const noop = await pushTo(u, { baseVersion: v2, entries: [], removedWords: [] });
    expect(noop.status).toBe(200);
    expect(Number(noop.body.version)).toBe(v2);
  });

  it('push 的成功响应恰是 shared 契约的五个键（service→门面的判别字段 `kind` 不外泄）', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(50);
    const res = await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'shape-keys', addedAt: T0 + 51 }] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['added', 'merged', 'ok', 'removed', 'version']);
    expect(WordbookPushResultSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).not.toHaveProperty('kind');

    const pull = await pullFrom(u);
    expect(WordbookPullResultSchema.safeParse(pull.body).success).toBe(true);
    expect(Object.keys(pull.body).sort()).toEqual(['entries', 'updatedAt', 'version']);
  });

  it('墓碑已存在且客户端基点早于它 → 409 带 `pruned:true`（只能全量重放，§4.4.2 压缩窗口）', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(60);
    const v0 = await versionOf(u);
    expect((await pushTo(u, { baseVersion: v0, entries: [{ word: 'prune-me', addedAt: T0 + 61 }] })).status).toBe(200);
    const v1 = await versionOf(u);
    expect((await pushTo(u, { baseVersion: v1, removedWords: ['prune-me'] })).status).toBe(200);
    expect(await tombstoneKeysOf(u)).toEqual(['prune-me']);

    const stale = await pushTo(u, { baseVersion: v1, entries: [{ word: 'prune-client', addedAt: T0 + 62 }] });
    expect(stale.status).toBe(409);
    expect(stale.body.pruned).toBe(true);
  });
});

/* ═════════════════ 判据④ off 态：整数组语义 / 不报错 / 不丢词 ═════════════════ */

describe('判据④ wordbookIncremental off：同一用户全部读写回到整数组语义，不报错、不丢词', () => {
  it('默认种子就是 0%：没有 `feature_flags` 行的新装库也落在 off 侧', async () => {
    const u = await newUser();
    expect(FEATURE_FLAG_DEFAULTS.wordbookIncremental).toBe('0%');
    // 前面用例已经把本库那一行改成过 100%/0% 了 → "进程默认"只能走"库里没这一行"的分支来证
    const coldFlags = createFeatureFlags(noRowDb as unknown as AppDB);
    expect(await coldFlags.get('wordbookIncremental')).toBe(FEATURE_FLAG_DEFAULTS.wordbookIncremental);
    expect(await coldFlags.isFlagOnForUser('wordbookIncremental', u)).toBe(false);
    expect(await createWordbookService({ db, flags: coldFlags, cache, now }).isIncrementalOn(u)).toBe(false);
    // 尾号放量档（§4.4.4）在 off 档恒 false；桶内/桶外的分档由 `--flags` 门禁与 unit 用例覆盖
  });

  it('off 态：PUT 交回的数组就是成员真相（没写=已删），GET 不过滤墓碑，全程无 4xx', async () => {
    const u = await newUser();
    await setIncremental('0%');
    advance(70);
    expect(await svcOf().isIncrementalOn(u)).toBe(false);

    expect(
      (await putBook(u, [{ word: 'off-apple', addedAt: T0 + 71 }, { word: 'off-pear', addedAt: T0 + 72 }])).status,
    ).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual(['off-apple', 'off-pear']);

    // 整数组语义：数组里没写的词就是删除（旧 APK 的删词能力不回退，PRD §6.4-5-3）
    expect((await putBook(u, [{ word: 'off-apple', addedAt: T0 + 71 }])).status).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual(['off-apple']);

    // off 态一个字都不写墓碑（关掉开关的一方不该有写墓碑的机会）
    expect(await tombstoneKeysOf(u)).toEqual([]);

    // off 态 tRPC 三门面照常工作：add / remove / clear
    expect((await wbCaller(u).add({ word: 'off-third' })).added).toBe(true);
    expect(wordsOf(await getBook(u))).toEqual(['off-apple', 'off-third']);
    const removed = await wbCaller(u).remove({ word: 'off-third' });
    expect(removed.ok).toBe(true);
    expect(wordsOf(removed.data)).toEqual(['off-apple']);
    expect(await tombstoneKeysOf(u)).toEqual([]);
    expect(await wbCaller(u).clear()).toEqual({ ok: true, data: [] });
    expect(await getBook(u)).toEqual([]);
  });

  it('off 态仍接受 push（新旧 App 混用不给 4xx），退化成整数组语义且不写墓碑', async () => {
    const u = await newUser();
    await setIncremental('0%');
    advance(80);
    const tombsBefore = (await syncStateOf(u))?.tombstones ?? '[]';
    // baseVersion 故意是 0：off 态不做 CAS，也不许回 409
    const add = await pushTo(u, { baseVersion: 0, entries: [{ word: 'degraded-add', addedAt: T0 + 81 }] });
    expect(add.status).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual(['degraded-add']);
    const del = await pushTo(u, { baseVersion: 0, removedWords: ['degraded-add'] });
    expect(del.status).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual([]);
    expect((await syncStateOf(u))?.tombstones).toBe(tombsBefore);
  });

  it('不丢词：on 态写过的词（带 updatedAt）在关掉开关后被整数组覆盖仍保留', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(90);
    expect((await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'written-on', addedAt: T0 + 91 }] })).status).toBe(200);
    expect(entryOf(await getBook(u), 'written-on')).toHaveProperty('updatedAt');

    await setIncremental('0%');
    expect((await putBook(u, [{ word: 'legacy-list', addedAt: T0 + 1 }])).status).toBe(200);
    expect(wordsOf(await getBook(u))).toEqual(['legacy-list', 'written-on']);
  });

  it('on/off 来回切四次：每侧都能读到前一侧写的词，长度单调 +1（关开关只少掉增量能力，不少词）', async () => {
    const u = await newUser();
    advance(95);
    let round = 0;
    for (const pct of ['100%', '0%', '100%', '0%']) {
      round += 1;
      await setIncremental(pct);
      const word = `flip-${pct.replace('%', '')}-${round}`;
      advance(1);
      expect((await wbCaller(u).add({ word })).added).toBe(true);
      const book = await getBook(u);
      expect(book).toHaveLength(round);
      expect(wordsOf(book)).toContain(word);
    }
    expect(round).toBe(4);
  });
});

/* ═════════════ 判据⑤ 开关切换 ≤60 秒生效（R-03⑤ / §6.4-5-3） ═════════════ */

describe('判据⑤ R-03⑤：改库里那一行就生效，最坏路径 ≤60 秒、不重新发版', () => {
  it('最坏路径 = 另一个进程改的库：TTL 内照旧读旧值，快进 TTL 后下一次读就是新值', async () => {
    const u = await newUser();
    // 独立实例 = "改开关的是另一个进程"（`POST /api/admin/flags` 只失效自己那一份缓存）。
    // 因此这里只写库里那一行：既不调 `flags.set`，也不 invalidate —— 走的是 TTL 自然到期这条路。
    const other = createFeatureFlags(db);
    const svc = createWordbookService({ db, flags: other, cache, now });
    try {
      await db.flags.set('wordbookIncremental', '0%', now());
      other.invalidate();
      expect(await svc.isIncrementalOn(u)).toBe(false);

      await db.flags.set('wordbookIncremental', '100%', now());     // 库里已经是新值了
      expect(await svc.isIncrementalOn(u)).toBe(false);             // 缓存未过期 → 仍按旧值判
      expect(await svc.isIncrementalOn(u)).toBe(false);             // 反复读也不会提前翻面
      other.__advanceCacheAge(FLAG_TTL_SECONDS * 1000 + 1);         // 把缓存写入时刻推出 TTL
      expect(await svc.isIncrementalOn(u)).toBe(true);              // 到期后第一次读即新值
    } finally {
      await db.flags.set('wordbookIncremental', '0%', now());
      other.invalidate();
    }
    // 生效上界：一个 TTL + 一次读，必须落在 PRD 承诺的 60 秒内
    expect(FLAG_TTL_SECONDS + 1).toBeLessThanOrEqual(FLAG_EFFECTIVE_MAX_SECONDS);
  });

  /**
   * 「我能证的那一半」：注入同一个 flags 实例时（`routes/wordbook.ts` 的 `deps.flags` 通道，
   * 也是 `trpc/routers/wordbook.ts` 走 `ctx.flags` 的现状），`flags.set` 写库 + 回填本实例缓存
   * （`feature-flags.ts:98-105`）→ 本进程**零延迟**翻面。
   *
   * ⚠ 翻面的**可观测行为**改判"同一个请求形状的结果不同"，不再判"出现墓碑"：
   *   on 态的整数组上交按 §4.4.1 是**字段级 merge**，数组里没写的词**不视为删除**
   *   （`wordbook-merge.ts:407 projectArrayMerge` → 只 upsert，`removedWords` 为空所以不产墓碑）。
   *   判据① 第三条用例（"on 态的整数组上交不再是覆盖，两边词都在"）正是靠这条语义成立的；
   *   上一轮这里断言 `tombstoneKeysOf(u) === ['drop-me']` 是**用例写错了**，不是 `flags.set` 没回填。
   */
  it('同一 flags 实例那一路（`flags.set` 写库 + 回填本实例缓存，不 invalidate）零延迟生效，且行为真的翻了面', async () => {
    const u = await newUser();
    try {
      await setIncremental('0%');
      advance(130);
      expect(
        (
          await putBook(u, [
            { word: 'keep', addedAt: T0 + 131 },
            { word: 'drop-me', addedAt: T0 + 132 },
          ])
        ).status
      ).toBe(200);
      advance(2);
      // off 态：整数组就是成员真相 —— 少交一个词等于删掉它（旧 APK 的删除能力，§6.4-5-3）
      expect((await putBook(u, [{ word: 'keep', addedAt: T0 + 131 }])).status).toBe(200);
      expect(wordsOf(await getBook(u))).toEqual(['keep']);
      expect(await tombstoneKeysOf(u)).toEqual([]); // off 态一律不写墓碑

      // 管理后台那一行：`routes/admin-flags.ts:78` 调的就是 `flags.set`（其内部自行回填，无需 invalidate）
      await flags.set('wordbookIncremental', '100%', { now: now() });
      expect((await db.flags.get('wordbookIncremental'))?.value).toBe('100%'); // 库 = 真相
      expect(await flags.get('wordbookIncremental')).toBe('100%'); // 本实例缓存 = 新值，且**没有** invalidate
      expect(await svcOf().isIncrementalOn(u)).toBe(true);

      // 同一个请求形状，翻面后结果必须不同：on 态上交不再覆盖 → 缺席的词不丢（红线 = 不丢用户词）
      advance(3);
      expect(
        (
          await putBook(u, [
            { word: 'keep', addedAt: T0 + 131 },
            { word: 'late', addedAt: T0 + 134 },
          ])
        ).status
      ).toBe(200);
      advance(3);
      expect((await putBook(u, [{ word: 'keep', addedAt: T0 + 131 }])).status).toBe(200);
      expect(wordsOf(await getBook(u))).toEqual(['keep', 'late']); // 上面那一步在 off 态会删掉 `late`
      expect(entryOf(await getBook(u), 'keep')).toBeDefined();
      // 删除的唯一出口仍是 `push.removedWords` / `wordbook.remove` → on 态 PUT 也不产墓碑
      expect(await tombstoneKeysOf(u)).toEqual([]);
    } finally {
      await setIncremental('0%');
    }
  });

  /**
   * 「跨实例那一半」= **生产装配现状的真实延迟**（缺陷 D-1，移交 T-07，见报告）。
   * `app.ts:195` 把 `flags` 给了 `createAdminFlagsRouter(flags)`，`app.ts:196` 却是
   * `createWordbookRouter(db)` —— **没传第二个参数 `deps`**，于是词本 REST 门面经
   * `wordbook-service.ts:127-136` 的 WeakMap 自建成**另一份** `FeatureFlags`。
   * 结果：管理后台改这一行只回填自己那一份缓存，词本侧要等自己那 30 秒 TTL。
   * 本用例把"最坏 = 一个 TTL、仍在 60 秒承诺内"钉住；一旦 T-07 补上注入，
   * 中间那条 `toBe(false)` 会**变红**，届时把它换成 `toBe(true)` 即为"零延迟已达成"。
   * `routes/wordbook.ts` 的 `deps` 通道本任务早已留好，改的只有 `app.ts` 那一行。
   */
  it('生产装配那一路（`app.ts` 未给 `createWordbookRouter` 注入 flags）：本进程最坏一个 TTL，仍在 ≤60 秒承诺内【D-1 移交 T-07】', async () => {
    const u = await newUser();
    const adminFlags = flags; // 挂在 `/api/admin/flags` 上的那一份
    const domainFlags = createFeatureFlags(db); // `createWordbookRouter(db)` 不传 deps → service 自建
    const svc = createWordbookService({ db, flags: domainFlags, cache, now });
    try {
      await adminFlags.set('wordbookIncremental', '0%');
      await domainFlags.set('wordbookIncremental', '0%');
      expect(await svc.isIncrementalOn(u)).toBe(false);

      await adminFlags.set('wordbookIncremental', '100%'); // 写库 + 只回填 adminFlags 自己的缓存
      expect(await domainFlags.get('wordbookIncremental')).toBe('0%'); // ← 另一份实例还旧着
      expect(await svc.isIncrementalOn(u)).toBe(false);

      domainFlags.__advanceCacheAge(FLAG_TTL_SECONDS * 1000 + 1); // TTL 自然到期
      expect(await svc.isIncrementalOn(u)).toBe(true);
      expect(FLAG_TTL_SECONDS + 1).toBeLessThanOrEqual(FLAG_EFFECTIVE_MAX_SECONDS);
      expect(await db.flags.get('wordbookIncremental')).not.toBeNull(); // 库里那一行才是真相
    } finally {
      await db.flags.set('wordbookIncremental', '0%', now());
      adminFlags.invalidate();
      domainFlags.invalidate();
    }
  });
});

/* ═════════════════ 判据⑥ 旧 PUT 的响应形状（legacy-apk 快照面） ═════════════════ */

describe('判据⑥ `PUT /api/wordbook` 响应仍 `{ok:true}`', () => {
  for (const pct of ['0%', '100%']) {
    it(`${pct}：两态都是 200 + 只有 ok 一个键（含"空数组 = 清空"那条分支）`, async () => {
      const u = await newUser();
      await setIncremental(pct);
      advance(110);
      const first = await putBook(u, [{ word: 'put-shape', addedAt: T0 + 111 }]);
      expect(first.status).toBe(200);
      expect(Object.keys(first.body)).toEqual(['ok']);
      expect(first.body.ok).toBe(true);

      expect(Object.keys((await putBook(u, [{ word: 'put-shape', addedAt: T0 + 111 }])).body)).toEqual(['ok']);

      const cleared = await putBook(u, []);
      expect(cleared.status).toBe(200);
      expect(cleared.body).toEqual({ ok: true });
      expect(await getBook(u)).toEqual([]);
    });
  }

  it('GET 的响应键集合仍只有 `data`（旧客户端读的就是这一层）', async () => {
    const u = await newUser();
    await setIncremental('0%');
    expect((await putBook(u, [{ word: 'get-shape', addedAt: T0 + 120 }])).status).toBe(200);
    const res = await rest(u, 'GET', '/api/wordbook');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['data']);
  });

  it('tRPC 三门面的出参键集合与改动前一致（`{ok,added,data}` / `{ok,data}` / `{ok,data:[]}`）', async () => {
    const u = await newUser();
    await setIncremental('0%');
    advance(130);
    const added = await wbCaller(u).add({ word: 'trpc-shape' });
    expect(Object.keys(added).sort()).toEqual(['added', 'data', 'ok']);
    expect(added.ok).toBe(true);
    const removed = await wbCaller(u).remove({ word: 'trpc-shape' });
    expect(removed.ok).toBe(true);
    expect(Object.keys(removed).sort()).toEqual(['data', 'ok']);
    const cleared = await wbCaller(u).clear();
    expect(Object.keys(cleared).sort()).toEqual(['data', 'ok']);
    expect(Array.isArray(await wbCaller(u).list())).toBe(true);
  });
});

/* ═════════════════ 判据⑦ explicitFavorite off 的自动灌入面 ═════════════════ */

describe('判据⑦ `explicitFavorite` off：旧的"查询即入库"自动灌入路径保留', () => {
  it('off：自动灌入（整数组上交）在两种增量模式下都落库、都读得见；服务端读写不因该开关改变', async () => {
    const u = await newUser();
    await setExplicitFavorite('off');
    expect(await svcOf().isExplicitFavoriteOn(u)).toBe(false);

    let round = 0;
    for (const pct of ['0%', '100%']) {
      round += 1;
      await setIncremental(pct);
      advance(140 + round);
      const word = `auto-${pct.replace('%', '')}`;
      // 旧路径：查词页把词直接灌进整数组上交（`PUT /api/wordbook`），不需要显式收藏动作
      expect((await putBook(u, [{ word, addedAt: T0 + 140 + round }])).status).toBe(200);
      expect(wordsOf(await getBook(u))).toContain(word);
      // 自动灌入的词照样进 FSRS 队列（事务内的 `ensureNewCards`），这是"立即能背"的前提
      expect(await db.fsrs.getCard(u, word)).not.toBeNull();
    }

    await setExplicitFavorite('on');
    expect(await svcOf().isExplicitFavoriteOn(u)).toBe(true);
    // 翻到 on 只影响"客户端要不要自动写"，服务端读到的东西一字不变
    expect(wordsOf(await getBook(u))).toContain('auto-100');
  });

  it('off 态删除后旧条目再交一次照旧可见（旧行为）；on 态才由墓碑防复活', async () => {
    const u = await newUser();
    await setExplicitFavorite('off');
    const injected = setClock(T0 + 151);

    await setIncremental('0%');
    expect((await putBook(u, [{ word: 'recycle', addedAt: injected }])).status).toBe(200);
    expect((await wbCaller(u).remove({ word: 'recycle' })).ok).toBe(true);
    expect(await getBook(u)).toEqual([]);
    // off 态没有墓碑可参与 → 旧自动灌入的同一条旧 addedAt 记录照收（explicitFavorite=off 的全部意义）
    expect((await putBook(u, [{ word: 'recycle', addedAt: injected }])).status).toBe(200);
    expect(wordsOf(await getBook(u))).toContain('recycle');
    expect(await tombstoneKeysOf(u)).toEqual([]);

    // 换 on 态：删除写下墓碑（时刻 = 注入时钟，晚于条目本身）→ 读侧不再复活它
    await setIncremental('100%');
    const deletedAt = setClock(injected + 1_000);
    expect((await pushTo(u, { baseVersion: await versionOf(u), removedWords: ['recycle'] })).status).toBe(200);
    expect(await tombstoneKeysOf(u)).toEqual(['recycle']);
    expect(wordsOf(await getBook(u))).not.toContain('recycle');
    // 旧自动灌入路径直接落库（`queue-service` 的 bootstrap 就是这一条），条目时刻早于墓碑 → 仍不可见
    await db.wordbooks.saveData(u, [{ word: 'recycle', addedAt: injected }], injected);
    expect(wordsOf(await getBook(u))).not.toContain('recycle');
    expect(Number(entryOf(await db.wordbooks.getData(u), 'recycle')?.addedAt)).toBe(injected);
    // 关掉开关 = 回到旧行为：库里那一行本来就有它，于是又看得见（且 deletedAt 之后重收藏才真的复活）
    await setIncremental('0%');
    expect(wordsOf(await getBook(u))).toContain('recycle');
    await setIncremental('100%');
    expect(wordsOf(await getBook(u))).not.toContain('recycle');
    expect((await putBook(u, [{ word: 'recycle', addedAt: injected, updatedAt: deletedAt + 1 }])).status).toBe(200);
    expect(wordsOf(await getBook(u))).toContain('recycle');
    expect(await tombstoneKeysOf(u)).toEqual([]);
  });

  it('显式重新收藏（时刻晚于删除）→ 词回来且墓碑清掉（R-16①）', async () => {
    const u = await newUser();
    await setExplicitFavorite('on');
    await setIncremental('100%');
    advance(160);
    expect((await wbCaller(u).add({ word: 'revive-me' })).added).toBe(true);
    expect((await wbCaller(u).remove({ word: 'revive-me' })).ok).toBe(true);
    expect(await tombstoneKeysOf(u)).toEqual(['revive-me']);
    expect(wordsOf(await getBook(u))).not.toContain('revive-me');

    advance(1);
    const res = await putBook(u, [{ word: 'revive-me', addedAt: T0 + 161, updatedAt: clock }]);
    expect(res.status).toBe(200);
    expect(wordsOf(await getBook(u))).toContain('revive-me');
    expect(await tombstoneKeysOf(u)).toEqual([]);
  });
});

/* ═════════ 判据⑧ 抽样比对的数据形状（脚本本体 `scripts/release/reconcile.mjs` 归 T-21 批次4） ═════════ */

/**
 * 本任务只交付 T-21 要用的**只读取数口**：`wordbook-service.reconcileFor(userId, incoming?)`。
 * 形状与不变量由下面的用例钉住 —— 脚本侧只需"喂同一份 incoming、比两个投影"，不复制任何判定逻辑。
 */
describe('判据⑧ 抽样比对读接口：`reconcileFor` 一次给出两种投影、只读、差异面可枚举', () => {
  it('只读：调用前后 `data` 那一串、version、墓碑串、`saveData` 计数全部一字不变（可对线上库反复抽样）', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(230);
    expect((await putBook(u, [{ word: 'sample-a', addedAt: T0 + 231 }])).status).toBe(200);
    const beforeJson = await dataJsonOf(u);
    const beforeVersion = await versionOf(u);
    const beforeTombstones = await tombstoneKeysOf(u);
    const beforeSaveCalls = saveDataCalls;

    const sample = await svcOf().reconcileFor(u);
    expect(sample.version).toBe(beforeVersion);
    expect(Object.keys(sample.projections).sort()).toEqual(['array', 'incremental']);
    expect(Array.isArray(sample.projections.array)).toBe(true);
    expect(Array.isArray(sample.projections.incremental)).toBe(true);
    // 不传 incoming 时用库里现有整数组 → 两种投影此时应当全等（抽样基线自证的最低要求）
    expect(sample.projections.array).toEqual(sample.projections.incremental);

    expect(await dataJsonOf(u)).toBe(beforeJson);
    expect(await versionOf(u)).toBe(beforeVersion);
    expect(await tombstoneKeysOf(u)).toEqual(beforeTombstones);
    expect(saveDataCalls).toBe(beforeSaveCalls);
  });

  it('喂"当前全量少一个词"的样本 → 差异面恰好是那一个缺席词，共有条目逐字段相同（--mode diff-sample 的 diff 口径）', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(240);
    expect(
      (
        await putBook(u, [
          { word: 'diff-a', addedAt: T0 + 241 },
          { word: 'diff-b', addedAt: T0 + 242 },
        ])
      ).status
    ).toBe(200);
    const full = await getBook(u);
    expect(wordsOf(full)).toEqual(['diff-a', 'diff-b']);

    const sample = await svcOf().reconcileFor(u, full.filter((e) => e.word !== 'diff-b'));
    expect(wordsOf(sample.projections.array)).toEqual(['diff-a']); // 整数组语义：缺席 = 已删
    expect(wordsOf(sample.projections.incremental)).toEqual(['diff-a', 'diff-b']); // 增量语义：缺席 ≠ 删除
    // 共有条目必须逐字段相等 —— 两种模型只在"缺席词"这一维上可能不等（unit 已证差异面封闭可枚举）
    const sharedA = sample.projections.array.find((e) => e.word === 'diff-a');
    const sharedB = sample.projections.incremental.find((e) => e.word === 'diff-a');
    expect(JSON.stringify(sharedA)).toBe(JSON.stringify(sharedB));
    // 取数口不写库：抽样本身不改 version
    expect(sample.version).toBe(await versionOf(u));
  });

  it('pull 面（同一份 service 的另一个只读口）形状就是 shared 契约，T-21/T-15 可直接复算', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(250);
    expect((await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'pull-shape', addedAt: T0 + 251 }] })).status).toBe(200);
    const pull = await pullFrom(u);
    expect(WordbookPullResultSchema.safeParse(pull.body).success).toBe(true);
    const viaService = await svcOf().snapshot(u);
    expect(WordbookPullResultSchema.safeParse(viaService).success).toBe(true);
    expect(viaService).toEqual(pull.body);
  });
});

/* ═══════════════════════════ §6.4-6 级红线 ═══════════════════════════ */

describe('红线：`wordbooks.data` 形状 / 未知键原样保留 / addedAt 稳定排序 / 落库单路径', () => {
  it('未知键（未来版本才加的字段）在 PUT→push→GET 全程逐字节保留，不被洗掉也不被改名', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(170);
    const payload = {
      word: 'unknown-key',
      addedAt: T0 + 171,
      futureField: { nested: [1, 2, 3], when: 'later' },
      anotherOne: 'keep me',
    };
    expect((await putBook(u, [payload])).status).toBe(200);
    // 库里那一串（不是响应）就得带着未知键
    expect(await dataJsonOf(u)).toContain('futureField');
    const read = entryOf(await getBook(u), 'unknown-key');
    expect(read).toMatchObject({ futureField: { nested: [1, 2, 3], when: 'later' }, anotherOne: 'keep me' });

    // 只有来方 updatedAt 更新才允许动未知键（前向兼容不是倒退通道）
    const older = await pushTo(u, {
      baseVersion: await versionOf(u),
      entries: [{ word: 'unknown-key', addedAt: T0 + 172, updatedAt: T0, anotherOne: 'overwrite attempt' }],
    });
    expect(older.status).toBe(200);
    expect(entryOf(await getBook(u), 'unknown-key')).toMatchObject({ anotherOne: 'keep me' });
  });

  it('只喂已知键时，库里出现的键只可能是已知键 + `updatedAt`（形状一字不动）', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(180);
    expect((await putBook(u, [{ word: 'plain-a', addedAt: T0 + 181 }, { word: 'plain-b', addedAt: T0 + 182, reviewCount: 2 }])).status).toBe(200);
    await wbCaller(u).add({ word: 'plain-c' });
    const stored = JSON.parse(await dataJsonOf(u)) as Array<Record<string, unknown>>;
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(3);
    for (const entry of stored) {
      for (const key of Object.keys(entry)) expect(ALLOWED_KEYS.has(key), `意外键 ${key}`).toBe(true);
      expect(typeof entry.word).toBe('string');
    }
  });

  it('GET /api/wordbook 按 `addedAt` 升序稳定排序（§6.2 漂移表第 1 行），乱序入库也一样', async () => {
    const u = await newUser();
    await setIncremental('0%');
    advance(190);
    const shuffled = [
      { word: 'same-order-a', addedAt: T0 + 5 },
      { word: 'same-order-b', addedAt: T0 + 5 },
      { word: 'newest', addedAt: T0 + 99 },
      { word: 'oldest', addedAt: T0 + 1 },
    ];
    // 故意按 addedAt 降序上交，并放两条同值条目，检查"稳定"= 同值保持入库相对次序
    expect((await putBook(u, shuffled)).status).toBe(200);
    expect((await getBook(u)).map((e) => [e.word, e.addedAt])).toEqual([
      ['oldest', T0 + 1],
      ['same-order-a', T0 + 5],
      ['same-order-b', T0 + 5],
      ['newest', T0 + 99],
    ]);
    // 读侧排序不改写侧存量：同一份数组重放，落库串逐字节不变
    const before = await dataJsonOf(u);
    expect((await putBook(u, shuffled)).status).toBe(200);
    expect(await dataJsonOf(u)).toBe(before);
  });

  it('本域所有写路径都不碰 `db.wordbooks.saveData`（§4.4.3 落库只有一条事务路径）', async () => {
    const u = await newUser();
    const before = saveDataCalls;
    for (const pct of ['0%', '100%']) {
      await setIncremental(pct);
      advance(200);
      await putBook(u, [{ word: `single-path-${pct.replace('%', '')}`, addedAt: T0 + 201 }]);
      await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: 'pushed', addedAt: T0 + 202 }] });
      await wbCaller(u).add({ word: 'trpc-add' });
      await wbCaller(u).remove({ word: 'trpc-add' });
      await wbCaller(u).clear();
    }
    expect(saveDataCalls).toBe(before);
    expect(await versionOf(u)).toBeGreaterThan(0);
  });

  it('非法载荷不半写：越界词名 / 坏 JSON 一律拒绝且库里那一串不变', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(210);
    expect((await putBook(u, [{ word: 'guard-keep', addedAt: T0 + 211 }])).status).toBe(200);
    const before = await dataJsonOf(u);
    const version = await versionOf(u);

    expect((await putBook(u, [{ word: '   ' }])).status).toBe(400);
    const longWord = await pushTo(u, { baseVersion: version, entries: [{ word: 'x'.repeat(65), addedAt: T0 + 212 }] });
    expect(longWord.status).toBe(400);
    const badJson = await wordbookRouterApp().request('/api/wordbook/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token(u)}` },
      body: '{not json',
    });
    expect(badJson.status).toBe(400);

    expect(await dataJsonOf(u)).toBe(before);
    expect(await versionOf(u)).toBe(version);
  });

  it('未登录一律 401（`auth` 中间件不属本任务，但门面不许绕开它）', async () => {
    const res = await wordbookRouterApp().request('/api/wordbook');
    expect(res.status).toBe(401);
    const put = await wordbookRouterApp().request('/api/wordbook', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [] }),
    });
    expect(put.status).toBe(401);
  });
});

/* ═════════ T-09r1 · PRD §5.4-2 / §5.4-4 · A-37 §八-32：词本 400 出口接上已登记的码 ═════════ */

describe('T-09r1 §5.4-2：坏 JSON 与词名非法共用同一条 INVALID_WORDBOOK_ENTRY，成因只进日志', () => {
  /**
   * 定稿句在本用例里**重拼一份**当验收值（值仍由 `WORD_MAX_LENGTH` 组装，§5.4-4 判据② 要的就是
   * "不许在服务端/测试里写第二份裸文案" —— 这里拼的是**判据**，不是出口）。
   * 生产侧唯一的取文案路径是 `errorMessage('INVALID_WORDBOOK_ENTRY')`；本常量是它的外部哨：
   * 谁把出口改回 `'数据格式错误'`（A-37 §八-31 那条缺陷）或改掉定稿句，这一组用例必红。
   */
  const WORDBOOK_400_COPY = `这个词没法存进单词本（词名不能为空，最长 ${WORD_MAX_LENGTH} 个字符）`;
  const INVALID_CODE = 'INVALID_WORDBOOK_ENTRY';

  interface Logged {
    level: 'info' | 'warn';
    event: string;
    meta: Record<string, unknown>;
  }

  /**
   * `body` 收 `unknown` 或**已经 stringify 过的字符串**：后者用来发真正的坏 JSON
   * （`rest()` 恒 stringify 入参，发不出 `'{not json'`）。
   */
  async function req(
    app: Hono<AuthEnv>,
    userId: number,
    method: string,
    pathname: string,
    body?: unknown,
  ): Promise<RestResult> {
    const res = await app.request(pathname, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}` },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  /** 注入日志通道的那一份门面（§4.2：`log` 是 `WordbookRouterDeps` 的既有注入口，不另开门）。 */
  function appWithLog(sink: Logged[]): Hono<AuthEnv> {
    const log: WordbookModeLog = (level, event, meta): void => void sink.push({ level, event, meta });
    return new Hono<AuthEnv>().route('/', createWordbookRouter(db, { flags, cache, now, log }));
  }

  /** 线上 tRPC 门面（A-33-6 立的口径：`createCallerFactory` 直调会剥掉 `data`，取不到 `data.code`）。 */
  function trpcOnlineApp(userId: number): Hono {
    const app = new Hono();
    app.use(
      '/trpc/*',
      trpcServer({
        endpoint: '/trpc',
        router: wordbook,
        // 字面量而不是 `as TrpcContext`：`trpcServer` 的 createContext 声明要 Record<string, unknown>。
        createContext: async () => ({
          userId,
          clientIp: '127.0.0.1',
          db,
          flags,
          cache,
          events: { record: (): void => {} },
        }),
      }),
    );
    return app;
  }

  async function trpcOnlineCall(
    proc: string,
    userId: number,
    input: unknown,
  ): Promise<{ status: number; code: unknown; httpStatus: unknown; message: unknown; raw: Record<string, unknown> }> {
    const res = await trpcOnlineApp(userId).request(`/trpc/${proc}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = (raw.error ?? {}) as Record<string, unknown>;
    const json = (err.json ?? err) as Record<string, unknown>;
    const data = (json.data ?? {}) as Record<string, unknown>;
    return { status: res.status, code: data.code, httpStatus: data.httpStatus, message: json.message, raw };
  }

  it('判据 §5.4-4①/③：四个 400 出口（PUT/push × 坏 JSON/词名非法）逐字节同一个体，且都不是 500', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(600);
    const version = await versionOf(u);
    const tooLongForContract = 'c'.repeat(WORD_MAX_LENGTH + 1); // 65：越过 `contracts/wordbook.ts` 的关
    const app = wordbookRouterApp();

    const exits = [
      await req(app, u, 'PUT', '/api/wordbook', '{not json'),
      await req(app, u, 'PUT', '/api/wordbook', { data: [{ word: '   ', addedAt: T0 + 601 }] }),
      await req(app, u, 'POST', '/api/wordbook/push', '{not json'),
      await req(app, u, 'POST', '/api/wordbook/push', {
        baseVersion: version,
        entries: [{ word: tooLongForContract, addedAt: T0 + 601 }],
      }),
    ];

    for (const [i, e] of exits.entries()) {
      expect(e.status, `出口 ${i}：${JSON.stringify(e.body)}`).toBe(400);
      expect(Object.keys(e.body).sort(), `出口 ${i}`).toEqual(['code', 'error']);
      expect(e.body.error, `出口 ${i}`).toBe(WORDBOOK_400_COPY);
      expect(e.body.code, `出口 ${i}`).toBe(INVALID_CODE);
    }
    // "共用一条码"= 对外**看不出**是哪一种成因：四个体逐字节相同
    const first = JSON.stringify(exits[0]!.body);
    expect(exits.slice(1).map((e) => JSON.stringify(e.body))).toEqual([first, first, first]);
    // 与 service 那一侧同一出口（两个门面 + service 只有这一个 builder）
    expect(first).toBe(JSON.stringify(wordbookInvalidEntryBody().body));
  });

  it('判据 §5.4-4②：不新增第二条码 —— 冻结面 18 码里没有它，状态与文案都只从补表 import', async () => {
    // §4.6 冻结面一字未动（A-8）：这条码住在 `TM_ERRORS_SUPPLEMENT`，靠两个既有助手取值
    expect(Object.prototype.hasOwnProperty.call(TM_ERROR_CODES, INVALID_CODE)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(TM_ERRORS, INVALID_CODE)).toBe(false);
    const { status, body } = wordbookInvalidEntryBody();
    expect(status).toBe(400);
    expect(status).toBe(supplementErrorStatus(INVALID_CODE));
    expect(body).toEqual({ error: errorMessage(INVALID_CODE), code: INVALID_CODE });
    // 两条成因经 service 的同一出口：状态与体都与成因无关
    const expected = JSON.stringify([status, body]);
    const byName = wordbookRejectionBody({ kind: 'invalid-entry', words: ['   '], cause: 'invalid_word_name' });
    const byJson = wordbookRejectionBody({ kind: 'invalid-entry', words: [], cause: 'malformed_json' });
    expect(JSON.stringify([byName.status, byName.body])).toBe(expected);
    expect(JSON.stringify([byJson.status, byJson.body])).toBe(expected);
  });

  it('判据 §5.4-4④：成因区分只进日志 —— 事件 `wordbook_invalid_entry` 带 `cause`，响应体不带', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(610);
    const version = await versionOf(u);
    const sink: Logged[] = [];
    const app = appWithLog(sink);

    await req(app, u, 'PUT', '/api/wordbook', '{not json');
    await req(app, u, 'PUT', '/api/wordbook', { data: [{ word: '', addedAt: T0 + 611 }] });
    await req(app, u, 'POST', '/api/wordbook/push', '{not json');
    // `WordKeySchema` 不 trim，所以这里用**空串**（`min(1)` 拦得住）来走 `removedWords` 那一路的成因
    await req(app, u, 'POST', '/api/wordbook/push', { baseVersion: version, entries: [], removedWords: [''] });
    await req(app, u, 'POST', '/api/wordbook/push', { entries: [{ word: 'no-base-version' }] });

    const hits = sink.filter((e) => e.event === 'wordbook_invalid_entry');
    expect(hits.map((h) => h.meta.cause)).toEqual([
      'malformed_json',
      'invalid_word_name',
      'malformed_json',
      'invalid_word_name',
      'malformed_json',
    ]);
    expect(hits.every((h) => h.level === 'warn')).toBe(true);
    expect(hits.map((h) => h.meta.facade)).toEqual([
      'PUT /api/wordbook',
      'PUT /api/wordbook',
      'POST /api/wordbook/push',
      'POST /api/wordbook/push',
      'POST /api/wordbook/push',
    ]);
    // 脱敏口径沿用本域既有日志（`tailOf`），不外泄原始 userId
    expect(hits.map((h) => h.meta.userId)).toEqual(hits.map(() => Math.abs(u) % 100));
    // 响应体只有两键：`cause` 绝不出现在对外那一侧
    const body = (await req(app, u, 'PUT', '/api/wordbook', { data: [{ word: '   ' }] })).body;
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
    expect(body).not.toHaveProperty('cause');
  });

  it('入参关的成因判据：路径含 `word`/`removedWords` = 词名非法，其余 = 坏载荷（只影响日志）', () => {
    const causeOf = (path: Array<string | number>): string => wordbookPushIssueCause([{ path }]);
    expect(causeOf(['entries', 0, 'word'])).toBe('invalid_word_name');
    expect(causeOf(['removedWords', 0])).toBe('invalid_word_name');
    expect(causeOf(['baseVersion'])).toBe('malformed_json');
    expect(causeOf(['entries'])).toBe('malformed_json'); // 单批超量：整批路径，不是词名
    expect(wordbookPushIssueCause([])).toBe('malformed_json');
    // 混合时以"词名非法"为准（一次请求里既有条目超量也有坏词名 → 日志记的那条要能指向用户可见的原因）
    expect(wordbookPushIssueCause([{ path: ['baseVersion'] }, { path: ['entries', 2, 'word'] }])).toBe('invalid_word_name');
  });

  it('service 直调（不经 REST）也走同一出口：非法词名 → 同码同句，并记一条 `invalid_word_name`', async () => {
    const u = await newUser();
    await setIncremental('100%');
    const at = advance(620);
    const sink: Logged[] = [];
    const log: WordbookModeLog = (level, event, meta): void => void sink.push({ level, event, meta });
    const svc = createWordbookService({ db, flags, cache, now, log });
    const outcome = await svc.push(u, {
      baseVersion: await versionOf(u),
      entries: [{ word: '  ', addedAt: at } as unknown as WordbookEntry],
      removedWords: [],
    });
    expect(outcome.kind).toBe('invalid-entry');
    if (outcome.kind !== 'invalid-entry') throw new Error('前置不成立：service 直调应回 invalid-entry');
    const { status, body } = wordbookRejectionBody(outcome);
    expect([status, JSON.stringify(body)]).toEqual([400, JSON.stringify(wordbookInvalidEntryBody().body)]);
    const hit = sink.find((e) => e.event === 'wordbook_invalid_entry');
    expect(hit?.meta.cause).toBe('invalid_word_name');
    expect(hit?.meta.facade).toBe('push');
  });

  it('R-17⑧ 键名红线：400 体仍带 `error`（旧 APK 读的就是这个键），`{ok:true}`/`{data:[]}` 两快照一字未动', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(630);

    const bad = await req(wordbookRouterApp(), u, 'PUT', '/api/wordbook', '{not json');
    expect(bad.status).toBe(400);
    expect(bad.body).toHaveProperty('error');
    expect(typeof bad.body.error).toBe('string');
    // `code` 是 §4.6 给的**可选新增键**（旧 APK 忽略未知键），不是把 `error` 换名
    expect(bad.body).toHaveProperty('code');

    const ok = await putBook(u, [{ word: 'r17-keep', addedAt: T0 + 631 }]);
    expect([ok.status, Object.keys(ok.body)]).toEqual([200, ['ok']]);
    const get = await rest(u, 'GET', '/api/wordbook');
    expect([get.status, Object.keys(get.body)]).toEqual([200, ['data']]);
    // 条目形状由本文件"未知键/`ALLOWED_KEYS`"那条红线用例管，这里只确认这个 400 出口没往里塞新键
    for (const entry of get.body.data as Array<Record<string, unknown>>) {
      expect(entry.word).toBe('r17-keep');
      for (const key of Object.keys(entry)) expect(ALLOWED_KEYS.has(key), `意外键 ${key}`).toBe(true);
    }
    // 非本 400 出口的既有码不受影响（409 仍带自己的三键）
    const stale = await pushTo(u, { baseVersion: 999_999, entries: [] });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('WORDBOOK_STALE');
  });

  it('A-37 §八-32 约束②（A-35-9 写法）：tRPC 门只回协议码 —— 两侧各钉自己的码、钉 `httpStatus` 等值', async () => {
    const u = await newUser();
    await setIncremental('0%');
    advance(640);
    const tooLongForBoth = 'z'.repeat(LEGACY_WORD_MAX_LENGTH + 1); // 101：REST 旧关（100）与 tRPC 入参关（`WORD_MAX_LENGTH`=64）都拦

    const viaRest = await req(wordbookRouterApp(), u, 'PUT', '/api/wordbook', {
      data: [{ word: tooLongForBoth, addedAt: T0 + 641 }],
    });
    const viaTrpc = await trpcOnlineCall('add', u, { word: tooLongForBoth });

    expect(viaRest.status).toBe(400);
    expect(viaRest.body.code).toBe(INVALID_CODE);
    expect(viaRest.body.error).toBe(WORDBOOK_400_COPY);
    // 入参在 zod 关就被拦、到不了 service ⇒ 线上载体是协议码（不无中生有，A-30-1 同一条）
    expect(viaTrpc.code).toBe('BAD_REQUEST');
    expect(viaTrpc.code).not.toBe(INVALID_CODE);
    // 等值的只有 httpStatus：这是本期钉住的全部，不据此改 tRPC 门面形状
    expect(viaTrpc.httpStatus).toBe(viaRest.status);
    expect(viaTrpc.status).toBe(viaRest.status);
  });

  it('A-37 §八-32 约束②（E4b/A-82 件1 收紧 tRPC 入参后已收敛）：65 字符在 tRPC `add` 上是 400、REST `push` 上也是 400，两侧都不入库', async () => {
    const u = await newUser();
    await setIncremental('100%');
    advance(650);
    const sixtyFive = 'o'.repeat(WORD_MAX_LENGTH + 1);

    const viaRest = await pushTo(u, { baseVersion: await versionOf(u), entries: [{ word: sixtyFive, addedAt: T0 + 651 }] });
    expect([viaRest.status, viaRest.body.code]).toEqual([400, INVALID_CODE]);

    const viaTrpc = await trpcOnlineCall('add', u, { word: sixtyFive });
    // 收敛点：`trpc/routers/wordbook.ts:41` 的入参关已从**文件内联**的 `.max(100)` 收紧成
    // `max(WORD_MAX_LENGTH)`（值 64，来自 `@tm/shared`）⇒ 65 字符现在在 **zod 入参关**就被拦，
    // 进不了 procedure 体（也就不经 `contracts/wordbook.ts` 的 `WordKeySchema`/`WordbookEntrySchema`）。
    // ⚠ 两个面都是 400，但**载体不同**，本用例因此不写"与 REST 同码同 body"：
    //   - REST `push` = 契约关 / service 出口 → 业务码 `INVALID_WORDBOOK_ENTRY`（`INVALID_CODE`）+ §4.6 定稿文案；
    //   - tRPC `add` = zod 入参关 → 协议码 `BAD_REQUEST`、message 是 zod 原文（`too_big`/maximum 64），
    //     没有 `cause.tmCode` ⇒ `init.ts` 的 errorFormatter 不提升业务码、也不经 `wordbookRejectionBody`。
    //   两侧同码同体只对**纯空格词**那一支成立（它过了 zod 关、在 trim 后走 `wordbookRejectionBody`），
    //   那是 `wordbook-trpc-add.spec.ts`（E4b 名下）已经钉过的判据，本用例不重复造。
    expect(viaTrpc.status).toBe(400);
    expect(viaTrpc.httpStatus).toBe(400);
    expect(viaTrpc.code).toBe('BAD_REQUEST');
    expect(viaTrpc.code).not.toBe(INVALID_CODE);
    expect(viaTrpc.raw.result, JSON.stringify(viaTrpc.raw)).toBeUndefined();
    expect((await getBook(u)).some((e) => e.word === sixtyFive)).toBe(false);
  });
});
