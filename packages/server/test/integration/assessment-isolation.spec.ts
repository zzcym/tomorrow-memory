/**
 * T-25 · R-41 / M7：`assessment_cache` 的**属主隔离**（读路径属主过滤）
 *
 * 命名与 `chat-isolation.spec.ts` 对齐（§10.2 T-25 行明写），复用同一条口径：
 * **「属主不确定即拒读、403 而非 500」**（§10.2 T-11 行 / PRD R-05② / R-41③ 定案 (b)）。
 *
 * 本文件覆盖的判据（①②⑤⑥ 的静态/迁移面判据在 `test/db/migrations.spec.ts` 的 T-25 追加段）：
 *  ③ `user_id IS NULL`（改造前的无主题面）对**所有**用户都读不到 —— 没有任何"NULL = 公共池 /
 *    NULL = 首个访问者"的捷径；
 *  ④ 跨用户读不到（双驱动 × 双用户）+ 客户端在 `input` 里塞 `userId`/`ownerId` **不改变命中结果**
 *    （属主只来自 `ctx`）+ `setOwned` 的 `DO UPDATE` 把行属主改写成当前写入者（挤占语义，RK-14）；
 *  ⑦ `generate` 未命中 ⇒ 正常出题并写缓存（对用户无感）；`submit` 未命中 ⇒ **403 `FORBIDDEN`**，
 *    caller 面与**线上面**各钉一条（A-30-1 的 `cause → data.code` 提升），且明确"不是 500"；
 *  ⑨ `assessment` 两个过程的**真实返回值**过一份键集合钉 —— 基线对 output 是 `(no-parser)` 无覆盖
 *    （§11 F-7 的盲区），故在此自证"形状一字未改"；
 *  ⑩ 回滚前提：旧镜像那句**不含 `user_id` 的手工 SELECT** 在新 schema 上仍可执行；
 *  ⑧ 本任务不新增任何 HTTP 路由 ⇒ 静态取证 `app.ts` 与 `routes/**` 里 `assess` 0 命中；
 *    同时钉住"遗留的无属主 `get`/`set` 在 `src/**` 里 0 调用点"（它们只被本文件的判据③ 用作造数据）。
 *
 * 环境：sqlite 必跑；pg 缺 `DATABASE_URL_TEST` 时显式 SKIP 并把原因打在输出里
 * （A-18-3 先例，CI / T-22 必须真跑 pg）。
 * ⚠ 全程只在 `os.tmpdir()` 的临时库上建表与写数据，绝不打开仓库根 `data.db` 或 `packages/server/data.db`。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import Database from 'better-sqlite3';
import pg from 'pg';
import { cardToJson, createDefaultCard, pickQuestionType, type LlmRouter } from '@tm/agent';
import { TM_ERRORS_SUPPLEMENT, errorMessage } from '@tm/shared';
import { PROJECT_ROOT } from '../../src/config.js';
import type { AppDB } from '../../src/db/types.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { createMigrationContext, sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { assessment as assessmentTrpc } from '../../src/trpc/routers/assessment.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';

const PG_URL = process.env.DATABASE_URL_TEST ?? '';
type Driver = 'sqlite' | 'pg';
const DRIVERS: Driver[] = PG_URL ? ['sqlite', 'pg'] : ['sqlite'];

const tmpDir = path.join(os.tmpdir(), `tm-t25-assess-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);

/** 出题词表（6 个词 ≥ `generateInput.count` 的下界 5）。 */
const WORDS = ['apple', 'banana', 'cherry', 'durian', 'echo', 'fig'];
/**
 * 只在本轮跑里存在的"表外词"：判据③/⑩ 要造**干净的无主题行**，必须用别的用例没碰过的键。
 * 带 pid 是因为 pg 侧的库可以跨轮次复用（`DATABASE_URL_TEST` 指向的是同一个 schema）。
 */
const spare = (tag: string): string => `m7-${tag}-${process.pid}`;
const ORPHAN_WORD = spare('orphan');
const POOL_WORD = spare('pool');
const LEGACY_WORD = spare('legacy');

/**
 * 本域的用例都用**新默认卡**，`createDefaultCard()` 的 difficulty 固定 ⇒ `pickQuestionType()`
 * 对每个词给出同一个题型。把它算出来当常量用，判据③ 才能精确点名"哪一行是无主题行"。
 */
const DEFAULT_CARD = createDefaultCard(new Date());
const QTYPE = pickQuestionType(DEFAULT_CARD.difficulty);

/**
 * 无 LLM 的 router：`createStructured()` 返回 null ⇒ `generateQuestion()` 走
 * `fallbackQuestion()`（纯规则、零网络）。本文件只关心"谁的行、读不读得到"，与题面质量无关。
 */
const stubLlmRouter = {
  hasLlm: false,
  createStructured: () => null,
  chat: async () => ({ content: '', model: 'stub' }),
} as unknown as LlmRouter;

interface Harness {
  driver: Driver;
  db: AppDB;
  /** 直连驱动的原始读面（只用于取证 `user_id` 这种接口上不回显的列）。 */
  all(sql: string): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

async function openSqlite(name: string): Promise<Harness> {
  const raw = new Database(tmpFile(name));
  const db = new SqliteAppDB(raw);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return {
    driver: 'sqlite',
    db,
    all: async (sql) => raw.prepare(sql).all() as Array<Record<string, unknown>>,
    close: async () => {
      raw.close();
    },
  };
}

async function openPg(name: string): Promise<Harness> {
  const pool = new pg.Pool({ connectionString: PG_URL });
  const db = new PostgresAppDB(pool);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, createMigrationContext(db)).apply({});
  return {
    driver: 'pg',
    db,
    all: async (sql) => (await pool.query(sql)).rows as Array<Record<string, unknown>>,
    close: () => pool.end(),
  };
}

let seq = 0;
/** `13` + 3 位时间戳尾 + 6 位自增 = 11 位，满足 `PHONE_PATTERN`；跨进程/跨轮次都不撞号。 */
const uniquePhone = (): string =>
  `13${String(Date.now() % 1000).padStart(3, '0')}${String(++seq).padStart(6, '0')}`;

/** 建一个用户 + 给定词的默认卡（卡数正好 = count 时 `pickWords` 必然全选，判据③ 据此点名）。 */
async function seedUser(h: Harness, words: string[] = WORDS): Promise<number> {
  const id = await h.db.createUser(uniquePhone(), Date.now());
  const now = new Date();
  for (const word of words) {
    await h.db.fsrs.upsertCard(id, word, cardToJson(createDefaultCard(now)), now.getTime(), now.getTime());
  }
  return id;
}

/**
 * 点名查某几个 `(word,qtype)` 的属主 —— `assessment_cache` 是全文件共享的一张表（且很小），
 * 所以断言一律按"本次写出的那几个键"来核，不对全表下结论；`user_id` 是接口面上不回显的列，
 * 只能经驱动的原始读面取证（两侧同一条 SQL，行值语义两侧一致）。
 */
async function ownersOf(
  h: Harness,
  keys: Array<{ word: string; qtype: string }>,
): Promise<Array<number | null>> {
  const rows = await h.all('SELECT word, qtype, user_id FROM assessment_cache');
  const byKey = new Map<string, number | null>(
    rows.map((r) => [`${String(r.word)}|${String(r.qtype)}`, r.user_id === null ? null : Number(r.user_id)]),
  );
  return keys.map((k) => byKey.get(`${k.word}|${k.qtype}`) ?? null);
}

const qKeys = (questions: ReadonlyArray<{ word: string; type: string }>): Array<{ word: string; qtype: string }> =>
  questions.map((q) => ({ word: q.word, qtype: q.type }));

function callerOf(h: Harness, userId: number) {
  const ctx = {
    userId,
    clientIp: '127.0.0.1',
    db: h.db,
    llmRouter: stubLlmRouter,
    events: { record: (): void => {} },
  } as unknown as TrpcContext;
  return createCallerFactory(assessmentTrpc)(ctx);
}

/**
 * **线上**门面（与 `review-parity.spec.ts` 同一写法）：`createCallerFactory` 直调会把
 * `TRPCError.data` 剥掉，所以 `cause → data.code` 有没有被 `trpc/init.ts` 的唯一 errorFormatter
 * 提升成客户端可读的 `data.code`，只能真打一次 HTTP 取证。门面本文件自己拼，不依赖 `app.ts`。
 */
function online(h: Harness, userId: number): Hono {
  const app = new Hono();
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: assessmentTrpc,
      createContext: async () => ({
        userId,
        clientIp: '127.0.0.1',
        db: h.db,
        llmRouter: stubLlmRouter,
        events: { record: () => {} },
      }),
    }),
  );
  return app;
}

async function onlineCall(h: Harness, userId: number, proc: 'generate' | 'submit', input: unknown) {
  const res = await online(h, userId).request(`/trpc/${proc}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, raw };
}

/**
 * 线上门面的成功体取数：本域**没挂**闭合 `.output()`（批次4 通用约束① 只要求"已有 DTO"的过程挂），
 * 所以 tRPC v11 的响应是 `{result:{data:<raw result>}}`，没有 `output` 这一层包装。
 * 两种形状都兜一下，免得将来谁给本域补了 `.output()` 就把这里判红。
 */
function wireData(raw: Record<string, unknown>): Record<string, unknown> {
  const result = (raw.result ?? {}) as Record<string, unknown>;
  const data = (result.data ?? {}) as Record<string, unknown>;
  return ((data.output as Record<string, unknown> | undefined) ?? data) as Record<string, unknown>;
}

/** errorFormatter 之后的线上错误体三件套。 */
function wireError(raw: Record<string, unknown>): { message: unknown; code: unknown } {
  const err = (raw.error ?? {}) as Record<string, unknown>;
  const json = (err.json ?? err) as Record<string, unknown>;
  const data = (json.data ?? {}) as Record<string, unknown>;
  return { message: json.message, code: data.code };
}

const harnesses = new Map<Driver, Harness>();

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  harnesses.set('sqlite', await openSqlite('m7.db'));
  if (PG_URL) harnesses.set('pg', await openPg('m7-pg.db'));
});

afterAll(async () => {
  for (const h of harnesses.values()) await h.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ═══════════════════ 环境自证：pg 侧（A-18-3 口径，与 chat-isolation 同形） ═══════════════════ */

describe('环境自证：pg 侧可用性（判据⑥ 的双驱动要求）', () => {
  it('未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] T-25 assessment-isolation 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；R-41⑤ 要求双驱动一致，CI（T-22）必须真跑 pg。' +
        ' 本域对 pg 的依赖面 = `assessment_cache.user_id` 的 `ADD COLUMN … DEFAULT NULL` 与两条属主过滤语句' +
        '（读：`WHERE word = $1 AND qtype = $2 AND user_id = $3`；写：`ON CONFLICT (word,qtype) DO UPDATE SET … , user_id = excluded.user_id`）。',
    );
    expect(PG_URL).toBe('');
  });
});

/* ══════════════════════════ 以下逐条跑在两个驱动上 ══════════════════════════ */

for (const driver of DRIVERS) {
  const h = (): Harness => {
    const x = harnesses.get(driver);
    if (!x) throw new Error(`harness(${driver}) 未建立`);
    return x;
  };

  describe(`[${driver}] 判据④：属主只来自 ctx（双用户 × 双驱动）`, () => {
    it('A 出题 ⇒ 本次写出的每一行 `user_id` 都是 A，且 A 读得到、B 读不到', async () => {
      const a = await seedUser(h());
      const b = await seedUser(h());
      const out = await callerOf(h(), a).generate({ count: 5 });
      expect(out.count).toBe(5);
      const keys = qKeys(out.questions);
      expect(keys.length).toBe(5);
      for (const k of keys) {
        const row = await h().db.assessment.getOwned(k.word, k.qtype, a);
        expect(row, `A 自己写的行读不到：${JSON.stringify(k)}`).not.toBeNull();
        expect(await h().db.assessment.getOwned(k.word, k.qtype, b)).toBeNull();
      }
      expect((await ownersOf(h(), keys)).every((o) => o === a)).toBe(true);
    });

    it('B 出题 ⇒ 同一 `(word,qtype)` 唯一行被改写成 B（挤占语义），A 从此刻起读不到', async () => {
      const a = await seedUser(h());
      const b = await seedUser(h());
      const first = await callerOf(h(), a).generate({ count: 5 });
      const keys = qKeys(first.questions);
      await callerOf(h(), b).generate({ count: 5 });
      for (const k of keys) {
        const row = await h().db.assessment.getOwned(k.word, k.qtype, b);
        expect(row, `B 出题后自己没拿到行：${JSON.stringify(k)}`).not.toBeNull();
        expect(await h().db.assessment.getOwned(k.word, k.qtype, a)).toBeNull();
      }
      // UNIQUE (word,qtype) 一字未动：一个键仍只有一行 ⇒ 本期是"读路径过滤"，不是每用户一行
      const dup = await h().all(
        'SELECT word, qtype, COUNT(*) AS c FROM assessment_cache GROUP BY word, qtype HAVING COUNT(*) > 1',
      );
      expect(dup, 'UNIQUE (word,qtype) 被破坏 ⇒ 出现了每用户一行').toEqual([]);
    });

    it('客户端在 `input` 里塞 `userId`/`ownerId` ⇒ 线上传输层就把它丢掉，命中结果不变（判据④ / R-24①）', async () => {
      const a = await seedUser(h());
      const b = await seedUser(h());
      const res = await onlineCall(h(), a, 'generate', { count: 5, userId: b, ownerId: b });
      expect(res.res.status, JSON.stringify(res.raw)).toBe(200);
      const questions = wireData(res.raw).questions;
      expect(Array.isArray(questions), JSON.stringify(res.raw)).toBe(true);
      const keys = qKeys((questions as Array<{ word: string; type: string }>).map((q) => ({ word: q.word, type: q.type })));
      expect((await ownersOf(h(), keys)).every((o) => o === a), `伪造入参换到了别人的属主：${JSON.stringify(keys)}`).toBe(
        true,
      );
      for (const k of keys) {
        expect(await h().db.assessment.getOwned(k.word, k.qtype, b)).toBeNull();
      }
    });
  });

  describe(`[${driver}] 判据③：user_id 为 NULL 的无主题面对所有人都不存在`, () => {
    it('遗留 `set()` 写出的行（无主题面）谁都读不到；`generate` 视其为未命中并接管该行', async () => {
      // 卡集合里放一个"本轮独有词" ⇒ `set()` 走的是 INSERT，而不是对别人那行的 DO UPDATE
      const a = await seedUser(h(), [ORPHAN_WORD, 'apple', 'banana', 'cherry', 'durian']);
      const b = await seedUser(h(), [ORPHAN_WORD]);
      // 改造前的形态：走**不带属主**的遗留写入面（`src/**` 已 0 调用点，见本文件的静态守卫）
      await h()
        .db.assessment.set(ORPHAN_WORD, QTYPE, JSON.stringify({ type: 'choice', word: ORPHAN_WORD }), Date.now());
      const readOrphan = async (): Promise<Array<Record<string, unknown>>> =>
        h().all(`SELECT user_id FROM assessment_cache WHERE word = '${ORPHAN_WORD}' AND qtype = '${QTYPE}'`);
      const orphan = await readOrphan();
      expect(orphan.length).toBe(1);
      expect(orphan[0]?.user_id, '遗留写入必须留 NULL（否则判据③ 无对象）').toBeNull();
      expect(await h().db.assessment.getOwned(ORPHAN_WORD, QTYPE, a)).toBeNull();
      expect(await h().db.assessment.getOwned(ORPHAN_WORD, QTYPE, b)).toBeNull();
      // 无主题 ⇒ 对 A 也是"未命中"：正常出题并接管这一行（判据⑦ 的"对用户无感"）
      const out = await callerOf(h(), a).generate({ count: 5 });
      expect(out.count).toBe(5);
      expect(await h().db.assessment.getOwned(ORPHAN_WORD, QTYPE, a)).not.toBeNull();
      expect(Number((await readOrphan())[0]?.user_id)).toBe(a);
    });

    it('反面对手（"公共池"捷径）：无主题行的题面绝不会被端给任何用户', async () => {
      const a = await seedUser(h(), [POOL_WORD, 'apple', 'banana', 'cherry', 'durian']);
      const poison = JSON.stringify({
        type: 'choice',
        word: POOL_WORD,
        prompt: '公共池捷径泄漏',
        options: ['a', 'b', 'c', 'd'],
      });
      await h().db.assessment.set(POOL_WORD, QTYPE, poison, Date.now() - 1_000);
      const out = await callerOf(h(), a).generate({ count: 5 });
      const leaked = out.questions.find((q) => q.word === POOL_WORD);
      expect(leaked, `${POOL_WORD} 应在 A 的出题集合里`).toBeDefined();
      expect(JSON.stringify(leaked)).not.toContain('公共池捷径泄漏');
      const owner = await h().all(
        `SELECT user_id FROM assessment_cache WHERE word = '${POOL_WORD}' AND qtype = '${QTYPE}'`,
      );
      expect(Number(owner[0]?.user_id)).toBe(a);
    });
  });

  describe(`[${driver}] 判据⑦：submit 未命中 ⇒ 403 FORBIDDEN（不是 500）`, () => {
    it('caller 面：B 挤占之后 A 提交原 key ⇒ TRPCError code=FORBIDDEN + shared 同一条人话', async () => {
      const a = await seedUser(h());
      const b = await seedUser(h());
      const out = await callerOf(h(), a).generate({ count: 5 });
      const key = out.questions[0]!.key;
      expect((await callerOf(h(), a).submit({ key, userAnswer: 'x' })).ok).toBe(true);
      await callerOf(h(), b).generate({ count: 5 });
      const err = (await callerOf(h(), a).submit({ key, userAnswer: 'x' }).catch((e: unknown) => e)) as {
        code?: string;
        message?: string;
      };
      expect(err.code).toBe('FORBIDDEN');
      expect(err.message).toBe(errorMessage('FORBIDDEN'));
    });

    it('线上面：同一判定经 errorFormatter 带得出 `data.code`=FORBIDDEN，HTTP 403，绝不冒 500', async () => {
      const a = await seedUser(h());
      const b = await seedUser(h());
      const out = await callerOf(h(), a).generate({ count: 5 });
      const key = out.questions[0]!.key;
      await callerOf(h(), b).generate({ count: 5 });
      const { res, raw } = await onlineCall(h(), a, 'submit', { key, userAnswer: 'x' });
      const { message, code } = wireError(raw);
      expect(res.status, `线上状态应为 403，实际 ${res.status}：${JSON.stringify(raw)}`).toBe(
        TM_ERRORS_SUPPLEMENT.FORBIDDEN.http,
      );
      expect(res.status, '绝不冒成 500').not.toBe(500);
      expect(message).toBe(errorMessage('FORBIDDEN'));
      expect(code).toBe('FORBIDDEN');
    });

    it('无主题行（判据③ 那种）提交 ⇒ 同一个 403，不是 500、也不是"空返回"', async () => {
      const a = await seedUser(h(), ['apple']);
      const key = `${ORPHAN_WORD}:${QTYPE}`;
      await h().db.assessment.set(ORPHAN_WORD, QTYPE, JSON.stringify({ type: 'choice', word: ORPHAN_WORD }), Date.now());
      const { res, raw } = await onlineCall(h(), a, 'submit', { key, userAnswer: 'echo' });
      expect(res.status, JSON.stringify(raw)).toBe(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
      expect(res.status).not.toBe(500);
      expect(wireError(raw).code).toBe('FORBIDDEN');
    });

    it('generate 未命中（含无主题行）⇒ 200 正常出题，不冒任何错误（判据⑦ 的前半句）', async () => {
      const a = await seedUser(h());
      const { res, raw } = await onlineCall(h(), a, 'generate', { count: 5 });
      expect(res.status, JSON.stringify(raw)).toBe(200);
      expect(raw.error).toBeUndefined();
    });
  });

  describe(`[${driver}] 判据⑩：旧镜像（不读该列）连新 schema 仍可执行`, () => {
    it('手工构造不含 `user_id` 的 SELECT 照常跑；旧写入语句也不因新列而失败', async () => {
      const a = await seedUser(h());
      await callerOf(h(), a).generate({ count: 5 });
      const legacyShape = await h().all(
        'SELECT id, word, qtype, question, created_at FROM assessment_cache ORDER BY id ASC',
      );
      expect(legacyShape.length).toBeGreaterThan(0);
      // 注意：这是 `Object.keys(...).sort()` 的字典序（'qtype' 排在 'question' 前，因为 't' < 'u'），
      // 不是建表列序 ⇒ 断言只依赖"这一行只有这 5 个键"这一事实。
      expect(Object.keys(legacyShape[0]!).sort()).toEqual(['created_at', 'id', 'qtype', 'question', 'word']);
      // 旧镜像的写入语句（列清单里没有 user_id）仍然合法 ⇒ 回滚 = 回镜像，不回滚库
      await h().db.assessment.set(LEGACY_WORD, QTYPE, '{}', Date.now());
      const orphanRow = await h().all(`SELECT user_id FROM assessment_cache WHERE word = '${LEGACY_WORD}'`);
      expect(orphanRow.length).toBe(1);
      expect(orphanRow[0]?.user_id).toBeNull();
    });
  });
}

/* ══════════════════ 判据⑨：output 形状自证（基线对 output 无覆盖 = F-7 盲区） ══════════════════ */

/**
 * `trpc-shape.baseline.json` 的 output 侧本域是 `(no-parser)`（没挂闭合 `.output()`，
 * 批次4 通用约束① 只对"`@tm/shared` 已有 DTO"的过程要求挂），所以基线钉不住返回结构 ——
 * 这里用 `profile-dto.spec.ts` 同形的**真实返回 + 键集合钉**用例自证，断言的是服务端实际返回值。
 */
describe('判据⑨：assessment 两个过程的真实返回形状一字未改', () => {
  const generateKeys = ['count', 'questions'];
  const questionKeys = ['definition', 'difficulty', 'hint', 'key', 'options', 'phonetic', 'prompt', 'sentence', 'type', 'word'];
  const submitKeys = [
    'correct',
    'correctAnswer',
    'difficulty',
    'explanation',
    'nextReview',
    'ok',
    'score',
    'scoreLabel',
    'stabilityAfter',
    'stabilityBefore',
    'word',
  ];

  it('generate：顶层键 = {count, questions}，每道题的键 = toRow() 的十个键', async () => {
    const a = await seedUser(harnesses.get('sqlite')!);
    const out = (await callerOf(harnesses.get('sqlite')!, a).generate({ count: 5 })) as unknown as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual([...generateKeys].sort());
    const questions = out.questions as Array<Record<string, unknown>>;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBe(5);
    for (const q of questions) {
      expect(Object.keys(q).sort()).toEqual(questionKeys);
      expect(typeof q.key).toBe('string');
      expect(['choice', 'fill', 'spelling']).toContain(String(q.type));
    }
  });

  it('submit：返回键集合 = 旧实现那 11 个键（新增的 403 分支不改变成功路径的形状）', async () => {
    const sqlite = harnesses.get('sqlite')!;
    const a = await seedUser(sqlite);
    const out = await callerOf(sqlite, a).generate({ count: 5 });
    const body = (await callerOf(sqlite, a).submit({ key: out.questions[0]!.key, userAnswer: 'x' })) as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual(submitKeys);
    expect(typeof body.ok).toBe('boolean');
    expect(typeof body.score).toBe('number');
    expect(typeof body.nextReview).toBe('string');
  });
});

/* ══════════════════ 判据⑧ + 遗留面的静态守卫（不连库） ══════════════════ */

const sourceTs = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? sourceTs(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

const grepSource = (files: string[], re: RegExp): string[] =>
  files
    .filter((f) => fs.existsSync(f))
    .flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .map((text, i) => ({ line: i + 1, text }))
        .filter((l) => re.test(l.text) && !/^\s*(\*|\/\/|\/\*)/.test(l.text))
        .map((l) => `${path.relative(PROJECT_ROOT, f)}:${l.line} ${l.text.trim().slice(0, 90)}`),
    );

describe('判据⑧ / 遗留面：不新增 REST 入口，且无属主的 get/set 在生产代码里 0 调用点', () => {
  const srcRoot = path.join(PROJECT_ROOT, 'packages/server/src');

  it('`app.ts` 与 `routes/**` 里 `assess` 0 命中（R-41② 本期退化为 tRPC 单入口，见 §10.2 T-25 判据⑧）', () => {
    const files = [path.join(srcRoot, 'app.ts'), ...sourceTs(path.join(srcRoot, 'routes'))];
    const hits = grepSource(files, /assess/i);
    expect(hits, `测评的 REST 入口出现了第二份：${hits.join(' | ')}`).toEqual([]);
  });

  it('`src/**` 里没有 `db.assessment.get(` / `db.assessment.set(` 调用点（遗留无属主面只剩测试在用）', () => {
    const hits = grepSource(sourceTs(srcRoot), /assessment\s*\.\s*(get|set)\s*\(/);
    // `getOwned(`/`setOwned(` 不在此列：正则要求 `get`/`set` 之后紧跟左括号
    expect(hits, `遗留的无属主读写面又被用起来了：${hits.join(' | ')}`).toEqual([]);
  });

  it('测评域只挂在 tRPC（`trpc/routers/assessment*.ts`），`routes/**` 下没有第二份读路径', () => {
    expect(fs.existsSync(path.join(srcRoot, 'trpc/routers/assessment.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcRoot, 'trpc/routers/assessment-parts.ts'))).toBe(true);
    expect(sourceTs(path.join(srcRoot, 'routes')).some((f) => /assess/i.test(path.basename(f)))).toBe(false);
  });
});
