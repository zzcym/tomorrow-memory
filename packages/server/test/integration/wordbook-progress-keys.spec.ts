/**
 * E4b3（A-85/A-86 · R-15⑤ 后端半件）· 词本读侧**进度三键**的取证用例。
 *
 * 被测行为：`wordbook-service.readWithProgress()` 在 `sortForRead(filterReadable(…))` 之后 join
 * FSRS 进度三键（键名 `state` / `lapses` / `nextDue`，单点声明在 `@tm/shared` 的 `WordbookProgress`），
 * 并由 **tRPC `wordbook.list`** 门面消费（`routers/wordbook.ts:37`）。
 *
 * ⚠ 本轮的一个盘面硬约束（写进报告，行号为证）：`read()` 本身**不能**带这三颗键 ——
 *  `test/contract/legacy-apk.spec.ts:487-503`（§6.2-1 兼容快照，钉 `GET /api/wordbook` 条目
 *  键集合恰好 `{word,addedAt}`）与 `test/integration/wordbook-concurrency.spec.ts:351/:891/:1189`
 *  的 `ALLOWED_KEYS` 红线哨都在**禁改面**里，先把这条外溢钉死 ⇒ REST 面维持旧形状。
 *  于是判据 4 从"探针 pull 带不带键"改成"探针 REST GET / pull 两面的**当前**形状"。
 *
 * 五条判据：
 *  1. 有卡词三键齐且**取自卡**（逐值相等，`state` 是数值不是枚举名）；
 *  2. 无卡词三键**整键缺席**（不是 0 / 不是 null，序列化里也不出现这三个键）；
 *  3. 客户端回推的**脏存量键**被服务端真值覆盖（先证明 `normalizeEntry` 真把它存进了整数组）；
 *  4. **REST 面形状探针（只记不改）**：`read()` / `GET /api/wordbook` / `GET /api/wordbook/pull` 三处
 *     当前都不带三键，且 `snapshot()` 与 `read()` 同源（钉的是当前行为，不许顺手改）；
 *  5. **tRPC `list` 面**经线上 HTTP 门门面取数，与 `readWithProgress()` 一字不差，
 *     且与 REST `GET` 的差集**恰好**是那三颗键 ⇒ 证明点亮只发生在 list 这一面。
 *
 * 装配口径（照抄同目录 `wordbook-trpc-add.spec.ts`）：
 *  - 独立临时 sqlite（`os.tmpdir()`），**绝不碰仓库根 `data.db` / `data.db-shm` / `data.db-wal` 与 `packages/server/data.db`**；
 *  - 不挂 `app.ts`（T-07 独占装配面）：REST 走 `createWordbookRouter`、tRPC 走 `trpcServer({ router: wordbook })`；
 *  - 建卡只走 `db.fsrs.upsertCard(...)` + 既有 `cardToJson(...)`，不手写 `fsrs_data` JSON；
 *  - 判据 5 走**线上 HTTP 门面**（caller 直调会剥壳 —— `review-parity.spec.ts` 已立此口径），
 *    并给 tRPC 门面**单独装配一份 cache** 绕开 `routers/wordbook.ts` 的 30 秒缓存（⛔ 不用 `waitForTimeout` 赌过期）。
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
  WORDBOOK_PROGRESS_KEYS,
  WORDBOOK_PROGRESS_QUERY,
  WORDBOOK_PROGRESS_QUERY_ON,
  WordbookPullResultSchema,
  type WordbookEntry,
  type WordbookEntryWithProgress,
} from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createWordbookRouter } from '../../src/routes/wordbook.js';
import { createWordbookService, type WordbookService } from '../../src/services/wordbook-service.js';
import { CardState, cardToJson, createDefaultCard } from '../../src/services/fsrs.js';
import { wordbook } from '../../src/trpc/routers/wordbook.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/services/feature-flags.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-e4b3-wordbook-progress-keys-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-e4b3-wb-progress-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
/** 冻结时刻：`nextDue` 是绝对 ms，用常量才不会因跨秒比出假红。 */
const T0 = 1_770_000_000_000;
const DUE_MS = T0 + 30 * 24 * 60 * 60 * 1000; // 未来 30 天：长间隔档的取材点
/** 三键键名取自 shared 单点常量，测试不抄第二份字面量。 */
const [STATE_KEY, LAPSES_KEY, NEXT_DUE_KEY] = WORDBOOK_PROGRESS_KEYS;

let db: SqliteAppDB;
let flags: FeatureFlags;
let svc: WordbookService;

function makeCache(): {
  getOrSet<T>(key: string, ttlSeconds: number, fallback: () => Promise<T>): Promise<T>;
  invalidate(key: string): Promise<void>;
} {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async getOrSet<T>(key: string, ttl: number, fallback: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value as T;
      const value = await fallback();
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return value;
    },
    async invalidate(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

/** REST 门面一份 cache；tRPC 门面**另起一份**（判据 5 不许吃到对方的缓存值）。 */
const restCache = makeCache();
const trpcCache = makeCache();

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

const wordbookRestApp = (): Hono<AuthEnv> =>
  new Hono<AuthEnv>().route('/', createWordbookRouter(db, { flags, cache: restCache, now: () => T0 }));

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

/** 线上 tRPC `wordbook.list`（query 无入参 ⇒ GET `/trpc/list`）。 */
async function trpcListOnline(userId: number): Promise<WordbookEntryWithProgress[]> {
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
        cache: trpcCache,
        events: { record: () => {} },
      }),
    }),
  );
  const res = await app.request('/trpc/list', { headers: { authorization: `Bearer ${token(userId)}` } });
  expect(res.status, 'wordbook.list 线上 HTTP 应为 200').toBe(200);
  const raw = (await res.json()) as { result?: { data?: WordbookEntryWithProgress[] } };
  return raw.result?.data ?? [];
}

/** 建卡：只经 `cardToJson` + `db.fsrs.upsertCard`（不手写 `fsrs_data`）。 */
async function seedCard(
  userId: number,
  word: string,
  over: { state?: number; lapses?: number; dueMs?: number } = {},
): Promise<{ state: number; lapses: number; nextDue: number }> {
  const card = createDefaultCard(new Date(T0));
  if (over.state !== undefined) card.state = over.state as typeof card.state;
  if (over.lapses !== undefined) card.lapses = over.lapses;
  const dueMs = over.dueMs ?? DUE_MS;
  card.due = new Date(dueMs);
  await db.fsrs.upsertCard(userId, word, cardToJson(card), T0, T0);
  return { state: card.state as number, lapses: card.lapses, nextDue: dueMs };
}

/** 加词：走 push 面（off 态退化成整数组语义，但 `normalizeEntry` 会原样收下未知键 —— 判据 3 要用这条）。 */
async function pushWords(userId: number, entries: Array<Record<string, unknown>>): Promise<void> {
  const res = await rest(userId, 'POST', '/api/wordbook/push', { baseVersion: 0, entries });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

const entryOf = <T extends WordbookEntry>(list: readonly T[], word: string): T => {
  const found = list.find((e) => e.word === word);
  expect(found, `词本里没有 ${word}`).toBeDefined();
  return found as T;
};

/** 三键在不在，只看"是不是显式键"。 */
function progressKeysOf(entry: Record<string, unknown>): string[] {
  return WORDBOOK_PROGRESS_KEYS.filter((key) => key in entry);
}

let userId = 0;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('wordbook-progress-keys.db');
  flags = createFeatureFlags(db);
  svc = createWordbookService({ db, flags, cache: restCache, now: () => T0 });
  userId = await db.createUser('13920000403', T0);
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('E4b3 件3 判据①：有卡词三键齐且取自卡', () => {
  it('E4b3 判据① upsertCard 一张 state=2/lapses=1/未来 due 的卡 → readWithProgress() 的三键逐值相等', async () => {
    await pushWords(userId, [{ word: 'banana', addedAt: T0 }, { word: 'citrus', addedAt: T0 + 1 }]);
    const truth = await seedCard(userId, 'banana', { state: CardState.Review, lapses: 1, dueMs: DUE_MS });

    const read = await svc.readWithProgress(userId);
    const banana = entryOf(read, 'banana') as Record<string, unknown>;
    expect(progressKeysOf(banana)).toEqual([...WORDBOOK_PROGRESS_KEYS]); // 三键齐（不半截）
    expect(banana[STATE_KEY]).toBe(truth.state);
    expect(banana[STATE_KEY]).toBe(2); // ts-fsrs CardState.Review 的**数值**，不是枚举名/字符串
    expect(banana[LAPSES_KEY]).toBe(truth.lapses);
    expect(banana[NEXT_DUE_KEY]).toBe(truth.nextDue);
    expect(typeof banana[NEXT_DUE_KEY]).toBe('number'); // 单位 = ms 数值
    // 既有键一字未动，排序口径也没变（`addedAt` 升序：banana 早于 citrus）
    expect(banana.addedAt).toBe(T0);
    expect(read.map((e) => e.word)).toEqual(['banana', 'citrus']);
    // 三键确实来自库里那一行（同一颗 `cardFromJson` 的读法，不造第二份）
    const row = await db.fsrs.getCard(userId, 'banana');
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.fsrs_data).due).toBe(new Date(DUE_MS).toISOString());
  });
});

describe('E4b3 件3 判据②：无卡词三键整键缺席（不填 0 / 不填 null）', () => {
  it('E4b3 判据② 删掉卡片的词：`state` in entry === false，三键皆然且序列化里不出现', async () => {
    const u = await db.createUser('13920000404', T0);
    await pushWords(u, [{ word: 'apple', addedAt: T0 }]);
    await seedCard(u, 'apple', { state: CardState.Learning, lapses: 0 });
    await pushWords(u, [{ word: 'durian', addedAt: T0 + 5 }]);

    // 盘面事实（写进报告）：词本写入路径 `db.wordbooks.applyEntries/applySync` 事务内的 `ensureNewCards`
    // 给每个新词自动灌一张 `state:0` 的卡 ⇒ 该词此刻**有**真卡，三键出现（0）不是造数：
    // 消费方 `stageOf` 据 0 判 `new`，与它自己"没复习过 ⇒ new"的兜底同档。
    expect(entryOf(await svc.readWithProgress(u), 'durian')[STATE_KEY]).toBe(CardState.New);

    await db.fsrs.deleteCard(u, 'durian'); // 此刻库里确实没有这一张卡行
    expect(await db.fsrs.getCard(u, 'durian')).toBeNull();

    const durian = entryOf(await svc.readWithProgress(u), 'durian') as Record<string, unknown>;
    expect(progressKeysOf(durian)).toEqual([]);
    for (const key of WORDBOOK_PROGRESS_KEYS) {
      expect(key in durian, `无卡词不得带 ${key}（填 0 会被 stageOf 当成有档）`).toBe(false);
      expect(durian[key], `无卡词的 ${key} 也不该是显式 undefined 键`).toBeUndefined();
    }
    // 序列化面上整键缺席：既没有 `"state":0` 也没有 `"state":null`（同库有卡的 apple 带键，故只比这颗）
    expect(JSON.stringify(durian)).not.toMatch(/"(state|lapses|nextDue)"/);
    // 有卡的那颗照旧带真值 ⇒ 缺席不是"整面都没点亮"
    expect(entryOf(await svc.readWithProgress(u), 'apple')[STATE_KEY]).toBe(CardState.Learning);
  });
});

describe('E4b3 件3 判据③：脏存量键被服务端真值覆盖', () => {
  it('E4b3 判据③ push 把 state=999/lapses=999/nextDue=1 存进整数组，readWithProgress() 回的是卡里的真值', async () => {
    const u = await db.createUser('13920000405', T0);
    await pushWords(u, [{ word: 'cherry', addedAt: T0, [STATE_KEY]: 999, [LAPSES_KEY]: 999, [NEXT_DUE_KEY]: 1 }]);

    // 前置证明（否则下面的覆盖判据会变成永真）：`normalizeEntry` 是 `{...asRecord(incoming)}`，
    // 客户端回推的未知键确实被**原样存进整数组**，脏值此刻就躺在 `wordbooks.data` 里。
    const rawStored = JSON.stringify(await db.wordbooks.getData(u));
    expect(rawStored).toContain('"state":999');
    expect(rawStored).toContain('"nextDue":1');

    // 服务端真值赢：库里这张卡是自动灌入的 New 卡（state=0），读侧回 0 而不是存量的 999。
    const beforeSeed = entryOf(await svc.readWithProgress(u), 'cherry') as Record<string, unknown>;
    expect(beforeSeed[STATE_KEY]).toBe(CardState.New);
    expect(beforeSeed[STATE_KEY]).not.toBe(999);

    // 换一张真卡（复习过、有 lapses、未来 due）⇒ 三键逐值取自卡，脏键彻底失效。
    const truth = await seedCard(u, 'cherry', { state: CardState.Review, lapses: 2, dueMs: DUE_MS });
    const fixed = entryOf(await svc.readWithProgress(u), 'cherry') as Record<string, unknown>;
    expect(fixed[STATE_KEY]).toBe(truth.state);
    expect(fixed[LAPSES_KEY]).toBe(2);
    expect(fixed[NEXT_DUE_KEY]).toBe(DUE_MS);
    // 写路径本期一律不动：库里那一串仍然是脏的（读侧覆盖 ≠ 洗数据）
    expect(JSON.stringify(await db.wordbooks.getData(u))).toContain('"state":999');
  });
});

describe('E4b3 件3 判据④：REST 面形状探针（只记不改，钉的是当前行为）', () => {
  it('E4b3 判据④ read() / GET /api/wordbook / GET /pull 三面当前**都不带**三键（§6.2-1 快照仍成立）', async () => {
    const u = await db.createUser('13920000406', T0);
    await pushWords(u, [{ word: 'fig', addedAt: T0 }, { word: 'grape', addedAt: T0 + 1 }]);
    await seedCard(u, 'fig', { state: CardState.Review, lapses: 3 });

    // 探针 1：`read()` 逐字旧形状（成员与顺序都没被 join 影响）
    const plain = await svc.read(u);
    expect(plain.map((e) => e.word)).toEqual(['fig', 'grape']);
    for (const entry of plain) expect(progressKeysOf(entry as Record<string, unknown>)).toEqual([]);

    // 探针 2：REST GET 面 = `read()` 的直返，同样不带键
    const get = await rest(u, 'GET', '/api/wordbook');
    expect(get.status).toBe(200);
    expect(get.body.data).toEqual(plain);

    // 探针 3：pull 面 = `snapshot()`，它经由 `service.read()` ⇒ 本期同样不带键（`snapshot` 实现未动）
    const pull = await rest(u, 'GET', '/api/wordbook/pull');
    expect(pull.status).toBe(200);
    expect(Object.keys(pull.body).sort()).toEqual(['entries', 'updatedAt', 'version']);
    expect(pull.body.entries).toEqual(plain);
    const viaService = await svc.snapshot(u);
    expect(viaService.entries).toEqual(plain); // 与 REST 同源（同一颗 read()，没有第二处加工）
    expect(WordbookPullResultSchema.safeParse(pull.body).success).toBe(true);

    // 对照：同一份数据走 `readWithProgress()` 就带键 ⇒ 缺席是"没接这颗"，不是"取不到卡"
    const progressed = await svc.readWithProgress(u);
    expect(progressKeysOf(entryOf(progressed, 'fig') as Record<string, unknown>)).toHaveLength(3);
  });
});

describe('E4b3 件3 判据⑤：tRPC list 面点亮', () => {
  it('E4b3 判据⑤ 线上 wordbook.list === readWithProgress()，与 REST GET 的差集恰好是三键', async () => {
    const u = await db.createUser('13920000407', T0);
    await pushWords(u, [{ word: 'kiwi', addedAt: T0 }, { word: 'lemon', addedAt: T0 + 1 }]);
    await seedCard(u, 'kiwi', { state: CardState.Relearning, lapses: 4, dueMs: DUE_MS });
    await db.fsrs.deleteCard(u, 'lemon'); // 一颗有真卡、一颗整键缺席 ⇒ 两面必须同时呈现这两种状态

    const viaService = await svc.readWithProgress(u);
    const viaTrpc = await trpcListOnline(u);
    expect(viaTrpc).toEqual(viaService);
    expect(JSON.stringify(viaTrpc)).toBe(JSON.stringify(viaService));
    expect(entryOf(viaTrpc, 'kiwi')[STATE_KEY]).toBe(CardState.Relearning);
    expect(entryOf(viaTrpc, 'kiwi')[NEXT_DUE_KEY]).toBe(DUE_MS);
    expect(progressKeysOf(entryOf(viaTrpc, 'lemon') as Record<string, unknown>)).toEqual([]);

    // 与 REST 面的差集**恰好**那三颗键（词集合、顺序、既有键值全部相同）
    const viaRest = (await rest(u, 'GET', '/api/wordbook')).body.data as WordbookEntry[];
    expect(viaRest.map((e) => e.word)).toEqual(viaTrpc.map((e) => e.word));
    for (let i = 0; i < viaRest.length; i += 1) {
      const legacy = viaRest[i] as Record<string, unknown>;
      const listed = viaTrpc[i] as Record<string, unknown>;
      const extra = Object.keys(listed).filter((k) => !(k in legacy));
      expect(extra.sort()).toEqual([...progressKeysOf(listed)].sort());
      for (const key of Object.keys(legacy)) expect(listed[key]).toBe(legacy[key]);
    }
    // 缓存面自证：tRPC 那份 cache 是**独立实例**，上面那次读才是真打库（没有 REST 侧的值可复用）
    expect(trpcCache).not.toBe(restCache);
  });
});

describe('E4b3b 件A 判据⑥：REST 缺省 vs 带参的键集合差恰为三键', () => {
  it('E4b3b 判据⑥ `?with_progress=1` 与缺省 GET 同数据同用户：带参侧 = `readWithProgress()` 逐值相等，缺省侧三键整键缺席；`0`/`true`/乱值均按缺省处理', async () => {
    const u = await db.createUser('13920000408', T0);
    await pushWords(u, [{ word: 'mango', addedAt: T0 }, { word: 'pear', addedAt: T0 + 1 }]);
    const truth = await seedCard(u, 'mango', { state: CardState.Review, lapses: 1, dueMs: DUE_MS });
    await db.fsrs.deleteCard(u, 'pear'); // 一颗有真卡、一颗整键缺席（与判据⑤同款两用）

    const plain = await rest(u, 'GET', '/api/wordbook');
    expect(plain.status).toBe(200);
    expect(Object.keys(plain.body)).toEqual(['data']); // 外层壳也没多键
    const legacy = plain.body.data as Array<Record<string, unknown>>;
    expect(legacy.map((e) => e.word)).toEqual(['mango', 'pear']);

    const opted = await rest(u, 'GET', `/api/wordbook?${WORDBOOK_PROGRESS_QUERY}=${WORDBOOK_PROGRESS_QUERY_ON}`);
    expect(opted.status).toBe(200);
    expect(Object.keys(opted.body)).toEqual(['data']);
    const withKeys = opted.body.data as Array<Record<string, unknown>>;
    const viaService = await svc.readWithProgress(u);
    // 带参侧三键值与 `readWithProgress()` 逐值相等（整份序列化一字不差）
    expect(withKeys).toEqual(viaService);
    expect(JSON.stringify(withKeys)).toBe(JSON.stringify(viaService));
    expect(truth.state).toBe(CardState.Review);

    // 双向：缺省侧无这三键；带参侧对缺省侧的键集合差**恰好**是该词在 `readWithProgress()` 里出现的那几键
    for (let i = 0; i < legacy.length; i += 1) {
      const oldEntry = legacy[i] as Record<string, unknown>;
      const newEntry = withKeys[i] as Record<string, unknown>;
      for (const key of WORDBOOK_PROGRESS_KEYS) expect(key in oldEntry, `缺省侧混入 ${key}`).toBe(false);
      const extra = Object.keys(newEntry).filter((k) => !(k in oldEntry)).sort();
      expect(extra).toEqual([...progressKeysOf(newEntry)].sort());
      for (const key of Object.keys(oldEntry)) expect(newEntry[key], `带参侧改动了既有键 ${key}`).toBe(oldEntry[key]);
    }
    const mango = withKeys[0] as Record<string, unknown>;
    const pear = withKeys[1] as Record<string, unknown>;
    expect(progressKeysOf(mango)).toEqual([...WORDBOOK_PROGRESS_KEYS]); // mango 有卡：三键齐
    expect(mango[STATE_KEY]).toBe(truth.state);
    expect(mango[NEXT_DUE_KEY]).toBe(truth.nextDue);
    expect(progressKeysOf(pear)).toEqual([]); // pear 无卡：带参侧也整键缺席

    // 钉口径（无暗分支）：**只有恰为 `1` 才算开** —— 缺省 / `0` / `true` / 乱值响应的序列化与缺省 GET 逐字节相等
    for (const q of ['', `?${WORDBOOK_PROGRESS_QUERY}=0`, `?${WORDBOOK_PROGRESS_QUERY}=true`, `?${WORDBOOK_PROGRESS_QUERY}=maybe`, `?${WORDBOOK_PROGRESS_QUERY}=`]) {
      const res = await rest(u, 'GET', `/api/wordbook${q}`);
      expect(res.status, q).toBe(200);
      expect(JSON.stringify(res.body), q).toBe(JSON.stringify(plain.body));
    }
  });
});
