/**
 * T-26a · 学情分析 REST 门面（`GET /api/analyst` / `GET /api/analyst/dataset`）的集成用例
 * （A-47 #106 / #107，R-19 轻学情页 P0）
 *
 * 比对方法照抄 T-11 `profile-dto.spec.ts` 的 standalone 口径（§10.3）：
 *  - REST：`new Hono().route('/', createAnalystRouter(db, { analyst, llmRouter }))`；
 *  - tRPC：`createCallerFactory(appRouter)(ctx).analyst.report(...)` —— **走装配后的 `appRouter`**
 *    （先例 `test/trpc-shape.spec.ts`、`auth-register.spec.ts:427`），这样"同形状"是拿线上门面比的，
 *    不是拿我自己另拼的一个域路由比的；
 *  - 两侧在**同一张临时 sqlite**、**同一个用户**、**同一个 period** 上取数。
 *
 * 判据（编号 = 简报里那五条）：
 *  ① 同用户同 period 下 REST body 的 key 集合与 tRPC `analyst.report` 返回值的 key 集合**全等**
 *    （含 `dataset` 内层八键）—— 硬判据，禁两套尺子；`console.log` 把两侧键集合打进输出原文。
 *  ② 无 token → 401（受保护读接口）；upgrade token → 403 `PASSWORD_UPGRADE_REQUIRED`（门禁语义不变）。
 *  ③ 非法 `period` → 400，且 `code` 出得出 `@tm/shared` 的 `TM_ERRORS_SUPPLEMENT`（PM-fix6 定码名
 *    `INVALID_PARAMETER`；文案与状态都由表取）。
 *  ④ `GET /api/analyst/dataset` **不产生 `analyst_cache` 行**（跑前后 `COUNT(*)` 相等）；
 *    `report` 面的**缓存回写**与**缓存命中**两条分支各一条用例。
 *    外加"限流同一把尺子"的可执行证据：同一用户 REST 5 次 + tRPC 5 次共用同一个桶，
 *    第 11 次两侧**同时**超限，而 `/api/analyst/dataset` 不吃这份配额。
 *  ⑤ 用户 A 取不到用户 B 的数据（只有自己的 userId 参与查询）。
 *
 * LLM：`new LlmRouter({ deepseekApiKey: '', deepseekBaseUrl: '' })` ⇒ `createStructured()` 返回 null
 * ⇒ `generateInsights()` 走 `fallbackInsights()` 的纯规则分支（零网络、确定性），
 * 所以"打不打 LLM"这条判据是在真实产品代码路径上验的，不是 mock 出来的。
 *
 * 只在 `os.tmpdir()` 的临时库上跑，**绝不碰仓库根 `data.db` / `packages/server/data.db`**（连只读复制都不做）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TM_ERRORS, TM_ERRORS_SUPPLEMENT, type AnalysisReport, type AnalyticsDataset } from '@tm/shared';
import { cardToJson, createDefaultCard, LlmRouter } from '@tm/agent';
import type { AppDB } from '../../src/db/types.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import { createAnalystRouter } from '../../src/routes/analyst.js';
import { AnalystService } from '../../src/services/analyst.js';
import type { ClickHouseClient } from '../../src/services/clickhouse.js';
import type { DictSources } from '../../src/services/dict-sources.js';
import { appRouter } from '../../src/trpc/routers/index.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import type { AuthEnv } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-t26a-analyst-rest-secret';
/** `middleware/auth.ts` 走 `loadConfig().jwtSecret`；根 .env 有值就用它，没值才注入测试密钥。 */
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;
/** pg 侧可用性（A-18-3：本机无实例时下面的环境自证用例显式 SKIP 并打印原因）。 */
const PG_URL = process.env.DATABASE_URL_TEST ?? '';

const tmpDir = path.join(os.tmpdir(), `tm-t26a-analyst-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);

/** ClickHouse 判活为 false ⇒ `analyze()` 走 `fromDb()` 降级路径（真代码路径，不是桩判定）。 */
const offlineClickhouse = { isHealthy: false } as unknown as ClickHouseClient;
/** stardict 查不到词 ⇒ `collinsToCefr(null)` 落 C2 桶；本用例不关心等级分布的取值。 */
const emptyDictSources = { lookupStardict: () => undefined } as unknown as DictSources;

let raw: Database.Database;
let db: SqliteAppDB;
let analyst: AnalystService;
let llmRouter: LlmRouter;

let userParity = 0;
let userPeriods = 0;
let userMiss = 0;
let userHit = 0;
let userDataset = 0;
let userRate = 0;
let userA = 0;
let userB = 0;

let seq = 0;
/** `13` + pid 段(3) + 自增段(6) = 11 位，跨进程唯一（本文件不经业务校验，只为不撞 UNIQUE）。 */
const uniquePhone = (): string =>
  `13${String(process.pid % 1000).padStart(3, '0')}${String(900_000 + ++seq).padStart(6, '0')}`;

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });
/** R-40④ 的强制改密 token：`aud='pw-upgrade'`。 */
const upgradeToken = (userId: number): string =>
  jwt.sign({ id: userId, aud: 'pw-upgrade' }, AUTH_SECRET, { expiresIn: '1h' });

async function req(
  pathname: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const app = new Hono<AuthEnv>().route('/', createAnalystRouter(db, { analyst, llmRouter }));
  const res = await app.request(pathname, { headers: { 'content-type': 'application/json', ...headers } });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

const authed = (userId: number): Record<string, string> => ({ authorization: `Bearer ${token(userId)}` });

/** 线上 tRPC 门面：`createCallerFactory(appRouter)`，ctx 与 REST 共用同一份 `db`/`analyst`/`llmRouter`。 */
function trpcCaller(userId: number) {
  const ctx = {
    userId,
    clientIp: '127.0.0.1',
    db: db as unknown as AppDB,
    analyst,
    llmRouter,
  } as unknown as TrpcContext;
  return createCallerFactory(appRouter)(ctx);
}

const cacheCount = (): number =>
  Number((raw.prepare('SELECT COUNT(*) AS n FROM analyst_cache').get() as { n: number | string }).n);

const cacheRows = (): Array<{ user_id: number; period: string }> =>
  raw
    .prepare('SELECT user_id, period FROM analyst_cache ORDER BY user_id, period')
    .all()
    .map((row) => ({
      user_id: Number((row as { user_id: number }).user_id),
      period: String((row as { period: string }).period),
    }));

/** 建一个用户并铺 N 张卡（`created_at/last_review = now` ⇒ 四个 period 窗口里都有数）。 */
async function makeUser(words: string[]): Promise<number> {
  const userId = await db.createUser(uniquePhone(), Date.now());
  const fsrsJson = cardToJson(createDefaultCard());
  const now = Date.now();
  for (const word of words) {
    await db.fsrs.upsertCard(userId, word, fsrsJson, now, now);
  }
  return userId;
}

/** 去掉每次都变的 `generatedAt`（两侧各跑一次 `Date.now()`），其余取值必须逐字相同。 */
function stripVolatile(dataset: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...dataset };
  delete copy.generatedAt;
  return copy;
}

const growthTotalOf = (body: Record<string, unknown>): number => {
  const dataset = (body.dataset ?? body) as AnalyticsDataset;
  return dataset.growthCurve.at(-1)?.total ?? 0;
};

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  raw = new Database(tmpFile('analyst.db'));
  db = new SqliteAppDB(raw);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  analyst = new AnalystService(db, offlineClickhouse, emptyDictSources);
  llmRouter = new LlmRouter({ deepseekApiKey: '', deepseekBaseUrl: '' });

  userParity = await makeUser(['apple', 'banana', 'cherry']);
  userPeriods = await makeUser(['delta', 'epsilon']);
  userMiss = await makeUser(['forge']);
  userHit = await makeUser(['ghost']);
  userDataset = await makeUser(['iron']);
  userRate = await makeUser(['jungle']);
  userA = await makeUser(['knell']);
  userB = await makeUser(['lemon', 'melon', 'nut', 'ocean']);
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ══════════════════ 判据① REST ↔ tRPC 同形状（硬判据，禁两套尺子） ══════════════════ */

describe('判据①：同用户同 period 下 GET /api/analyst 与 tRPC analyst.report 的 key 集合全等', () => {
  it('两侧顶层键集合 == {dataset, insights, cached}，dataset 内层键集合全等，取值同源', async () => {
    // 先把 24h 缓存 warm 起来（第一次 = 未命中分支），随后两侧都读同一份缓存 ⇒ `cached` 也可比
    const warm = await req('/api/analyst?period=30d', authed(userParity));
    expect(warm.status, '预热请求应 200').toBe(200);
    expect(warm.body.cached).toBe(false);

    const viaRest = await req('/api/analyst?period=30d', authed(userParity));
    const viaTrpc = (await trpcCaller(userParity).analyst.report({
      period: '30d',
    })) as unknown as Record<string, unknown>;

    const restKeys = Object.keys(viaRest.body);
    const trpcKeys = Object.keys(viaTrpc);
    const restDatasetKeys = Object.keys(viaRest.body.dataset as Record<string, unknown>);
    const trpcDatasetKeys = Object.keys(viaTrpc.dataset as Record<string, unknown>);

    // ↓ 判据① 的原文证据（报告要贴这段 stdout）
    console.log('[T-26a 判据①] REST  /api/analyst   keys =', JSON.stringify(restKeys));
    console.log('[T-26a 判据①] tRPC  analyst.report keys =', JSON.stringify(trpcKeys));
    console.log('[T-26a 判据①] REST  dataset.keys =', JSON.stringify(restDatasetKeys));
    console.log('[T-26a 判据①] tRPC  dataset.keys =', JSON.stringify(trpcDatasetKeys));
    console.log(
      '[T-26a 判据①] cached(REST/tRPC) =',
      JSON.stringify([viaRest.body.cached, viaTrpc.cached]),
      '| insights(REST/tRPC) =',
      JSON.stringify([(viaRest.body.insights as unknown[]).length, (viaTrpc.insights as unknown[]).length]),
    );

    expect(restKeys.sort()).toEqual(trpcKeys.sort());
    expect(restKeys.sort()).toEqual(['cached', 'dataset', 'insights']);
    expect(restDatasetKeys.sort()).toEqual(trpcDatasetKeys.sort());

    // 不只是"键凑巧一样"：取值也同源（`generatedAt` 是各自的 Date.now()，剥掉后必须全等）
    const restReport = viaRest.body as unknown as AnalysisReport;
    expect(restReport.cached).toBe(true);
    expect(viaTrpc.cached).toBe(true);
    expect(restReport.insights).toEqual(viaTrpc.insights);
    expect(stripVolatile(viaRest.body.dataset as Record<string, unknown>)).toEqual(
      stripVolatile(viaTrpc.dataset as Record<string, unknown>),
    );
  });

  it('四个 period 取值 × 两门面：key 集合逐一全等（值域不扩，与 tRPC input 同集）', async () => {
    for (const period of ['7d', '30d', '90d', 'all'] as const) {
      const viaRest = await req(`/api/analyst?period=${period}`, authed(userPeriods));
      const viaTrpc = (await trpcCaller(userPeriods).analyst.report({
        period,
      })) as unknown as Record<string, unknown>;
      expect(viaRest.status, `${period} 的 REST 应 200`).toBe(200);
      expect(Object.keys(viaRest.body).sort(), `${period} 的顶层键`).toEqual(Object.keys(viaTrpc).sort());
      expect(
        Object.keys(viaRest.body.dataset as Record<string, unknown>).sort(),
        `${period} 的 dataset 内层键`,
      ).toEqual(Object.keys(viaTrpc.dataset as Record<string, unknown>).sort());
      // period 回显与入参一致（App 侧要靠它认窗口）
      expect((viaRest.body.dataset as AnalyticsDataset).period).toBe(period);
    }
  });
});

/* ══════════════════ 判据② 鉴权（照抄 checkin 的中间件面） ══════════════════ */

describe('判据②：无 token → 401；强制改密 token → 403 PASSWORD_UPGRADE_REQUIRED', () => {
  it('两条端点缺 Authorization 都是 401 `{ error: "未登录" }`（与 checkin 同一中间件出口）', async () => {
    for (const pathname of ['/api/analyst', '/api/analyst/dataset']) {
      const res = await req(pathname);
      expect(res.status, `${pathname} 未登录应 401`).toBe(401);
      expect(res.body).toEqual({ error: '未登录' });
    }
  });

  it('upgrade token（aud=pw-upgrade）在两条端点都撞 403 硬门禁，码与文案出自 TM_ERRORS', async () => {
    for (const pathname of ['/api/analyst', '/api/analyst/dataset']) {
      const res = await req(pathname, { authorization: `Bearer ${upgradeToken(userMiss)}` });
      expect(res.status, `${pathname} 应被改密门禁拦下`).toBe(403);
      expect(res.body.code).toBe('PASSWORD_UPGRADE_REQUIRED');
      expect(res.body.error).toBe(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy);
    }
  });
});

/* ══════════════════════════ 判据③ 非法 period ══════════════════════════ */

describe('判据③：非法 period → 400，且错误码出自 @tm/shared 的 TM_ERRORS_SUPPLEMENT（不自创码、不自创文案）', () => {
  it('两条端点上的 ?period=2d 都被拒为 400 + { error, code }，且 code/http/copy 三项都回查得到', async () => {
    for (const pathname of ['/api/analyst?period=2d', '/api/analyst/dataset?period=2d']) {
      const res = await req(pathname, authed(userMiss));
      expect(res.status, `${pathname} 应 400`).toBe(400);
      const code = String(res.body.code);
      // A-48 #125 / PM-fix6（A-52 #135 · PRD §5.4-5）：非法 `period` 的缺码已登记为
      // `INVALID_PARAMETER`，它住在 `TM_ERRORS_SUPPLEMENT`（§4.6 的 18 码冻结面 `TM_ERRORS` 里没有它）。
      expect(code, `${pathname} 的 code`).toBe('INVALID_PARAMETER');
      expect(
        Object.prototype.hasOwnProperty.call(TM_ERRORS_SUPPLEMENT, code),
        `code=${code} 应在 TM_ERRORS_SUPPLEMENT 里`,
      ).toBe(true);
      const spec = TM_ERRORS_SUPPLEMENT.INVALID_PARAMETER;
      // 文案与 http 状态都由表取 —— 本文件不写第二份
      expect(res.body.error).toBe(spec.copy);
      expect(res.status).toBe(spec.http);
      expect(res.status).toBe(400);
    }
  });

  it('缺省 period 落 30d；空串按"没给"处理（与 tRPC 的 .optional().default("30d") 同口径）', async () => {
    const noParam = await req('/api/analyst/dataset', authed(userDataset));
    const emptyParam = await req('/api/analyst/dataset?period=', authed(userDataset));
    expect(noParam.status).toBe(200);
    expect(emptyParam.status).toBe(200);
    expect((noParam.body as unknown as AnalyticsDataset).period).toBe('30d');
    expect((emptyParam.body as unknown as AnalyticsDataset).period).toBe('30d');
  });
});

/* ═══════════════ 判据④ dataset 零缓存写 + report 的缓存两条分支 + 限流同一把尺子 ═══════════════ */

describe('判据④：/api/analyst/dataset 不产生 analyst_cache 行；report 的命中/回写两条分支', () => {
  it('dataset 端点跑 3 次前后 COUNT(*) 相等，且响应只有 AnalyticsDataset 的键（无 insights/cached）', async () => {
    const before = cacheCount();
    for (const pathname of [
      '/api/analyst/dataset?period=7d',
      '/api/analyst/dataset?period=30d',
      '/api/analyst/dataset',
    ]) {
      const res = await req(pathname, authed(userDataset));
      expect(res.status, `${pathname} 应 200`).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'cefrDistribution',
        'forgettingCurve',
        'generatedAt',
        'growthCurve',
        'period',
        'reviewEfficiency',
        'source',
        'studyHeatmap',
      ]);
      expect(Object.prototype.hasOwnProperty.call(res.body, 'insights'), '不该出现 insights 键').toBe(false);
      expect(Object.prototype.hasOwnProperty.call(res.body, 'cached'), '不该出现 cached 键').toBe(false);
    }
    expect(cacheCount(), 'dataset 是纯读面，不得写 analyst_cache').toBe(before);
  });

  it('缓存未命中分支：首次 report → cached:false 且 analyst_cache +1（回写 user_id/period 正确）', async () => {
    const before = cacheCount();
    const first = await req('/api/analyst?period=90d', authed(userMiss));
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);
    expect(cacheCount()).toBe(before + 1);
    expect(cacheRows().filter((row) => row.user_id === userMiss)).toEqual([{ user_id: userMiss, period: '90d' }]);
  });

  it('缓存命中分支：24h 内第二次 report → cached:true 且 COUNT 不变，insights 与首次逐字相同', async () => {
    const first = await req('/api/analyst?period=7d', authed(userHit));
    expect(first.body.cached).toBe(false);
    const countAfterWrite = cacheCount();
    const second = await req('/api/analyst?period=7d', authed(userHit));
    expect(second.body.cached).toBe(true);
    expect(cacheCount(), '命中路径不得再写一行').toBe(countAfterWrite);
    expect(second.body.insights).toEqual(first.body.insights);
    // 命中时 dataset 仍是实时算的（与 tRPC 同一顺序：先 analyze 再查缓存）
    expect((second.body.dataset as AnalyticsDataset).source).toBe('db-fallback');
  });

  it('限流同一把尺子：同一用户 REST 5 次 + tRPC 5 次共用一个桶，第 11 次两侧同时超限；dataset 不吃配额', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await req('/api/analyst?period=30d', authed(userRate));
      expect(r.status, `REST 第 ${i + 1} 次应放行`).toBe(200);
      const t = (await trpcCaller(userRate).analyst.report({ period: '30d' })) as unknown as Record<string, unknown>;
      expect(t.dataset, `tRPC 第 ${i + 1} 次应放行`).toBeTruthy();
    }
    const eleventhRest = await req('/api/analyst?period=30d', authed(userRate));
    expect(eleventhRest.status, '第 11 次 REST 必须撞限（两个门面共用同一个桶）').toBe(429);
    expect(eleventhRest.body.code).toBe('TOO_MANY_REQUESTS');
    expect(eleventhRest.body.error).toBe(TM_ERRORS.TOO_MANY_REQUESTS.copy);

    let trpcCode = '';
    try {
      await trpcCaller(userRate).analyst.report({ period: '30d' });
    } catch (err) {
      trpcCode = String((err as { code?: string }).code ?? '');
    }
    expect(trpcCode, '同一个桶也要把 tRPC 侧的第 11 次拦下来').toBe('TOO_MANY_REQUESTS');

    // dataset 面是高频读：不占 analyst-report 的配额（也不打 LLM、不写缓存）
    const datasetStillOk = await req('/api/analyst/dataset?period=30d', authed(userRate));
    expect(datasetStillOk.status).toBe(200);
  });
});

/* ══════════════════════════ 判据⑤ 跨用户隔离 ══════════════════════════ */

describe('判据⑤：用户 A 取不到用户 B 的数据（只有自己的 userId 参与查询）', () => {
  it('A 的两个端点都只数得出 A 的 1 个词，B 的 4 个词一个字都不出现', async () => {
    const aReport = await req('/api/analyst?period=30d', authed(userA));
    const aDataset = await req('/api/analyst/dataset?period=30d', authed(userA));
    const bDataset = await req('/api/analyst/dataset?period=30d', authed(userB));
    expect(aReport.status).toBe(200);

    expect(growthTotalOf(aReport.body), 'A 的 report 只该看到自己的 1 个词').toBe(1);
    expect(growthTotalOf(aDataset.body), 'A 的 dataset 只该看到自己的 1 个词').toBe(1);
    expect(growthTotalOf(bDataset.body), 'B 看到的是自己的 4 个词').toBe(4);

    // A 的 report 回写的缓存行只挂在自己的 user_id 上
    expect(cacheRows().filter((row) => row.user_id === userA).map((row) => row.period)).toEqual(['30d']);
    expect(cacheRows().some((row) => row.user_id === userB), 'B 没有因为 A 的请求产生缓存行').toBe(false);
  });
});

/* ══════════════════════════ 环境自证（A-18-3 口径） ══════════════════════════ */

describe('环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里）', () => {
  it('未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] T-26a analyst-rest 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。' +
        ' 本域对 pg 的依赖面 = `analyst_cache.{user_id,period,content,created_at}` 的 get/set 与 `fsrs_cards` 的' +
        ' 按用户读（两侧列名一字不动），REST 门面自己不新增任何 SQL。',
    );
    expect(PG_URL).toBe('');
  });
});
