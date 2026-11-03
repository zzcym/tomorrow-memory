/**
 * 学情分析 API（REST 门面，A-47 #106 / #107 · T-26a · R-19 轻学情页 P0）
 *
 * App 是**纯 REST 客户端**（`apps/app/src/data/queries/*.ts` 里 tRPC 用法 0 处），而 `analyst` 域
 * 此前只有 tRPC 面（`app.ts` 只把 `analyst` 注进 ctx），于是轻学情页的**热力图与增长曲线**
 * 真机永远拿不到数 —— 本文件补的就是那两条不存在的路由：
 *
 * - `GET /api/analyst?period=7d|30d|90d|all` → `{ dataset, insights, cached }`
 *   与 tRPC `trpc/routers/analyst.ts` 的 `report` **同形状同语义**：同一份 `services/analyst.ts`
 *   的 `analyze()`、同一张 `analyst_cache` 表、同一个 24h TTL、同一把限流尺子（见下）。
 *   判定口径由 `test/integration/analyst-rest.spec.ts` 判据① 钉住（两侧 key 集合全等）。
 * - `GET /api/analyst/dataset?period=…` → **只回 `AnalyticsDataset`**：直读 `analyst.analyze()`，
 *   **不打 LLM、不读写 `analyst_cache`**。
 *   为什么必须单开一条而不复用上面那条：热力图是**高频读**（进页即拉、下拉刷新再拉），
 *   走带缓存写的 `report` 路径会为"只要图形数据"的请求白刷一次 LLM 洞察 ——
 *   缓存的语义是"洞察 24h 不变"，把图形读混进去等于用 LLM 配额换像素，
 *   且每次刷新都可能触发 `analyst_cache` 回写。所以这条端点刻意**零 LLM、零写**。
 *
 * 鉴权：照抄 `routes/checkin.ts` —— `auth` 中间件（`middleware/auth.ts` 全库唯一 token 出口），
 * 无 token 401，`aud='pw-upgrade'` 的强制改密 token 命中 `REST_UPGRADE_ALLOWLIST` 之外的路径 →
 * 403 `PASSWORD_UPGRADE_REQUIRED`（R-40④ 语义一字不变，本文件不自己判 token）。
 *
 * 限流（#107 硬口径）：**与 tRPC 同一把尺子** —— 同一个 key 串
 * `user:${userId}:analyst-report`、同一个 10 次 / 60 000 ms 窗口，且直接调
 * `trpc/init.ts` 的 `rateLimit()` 所包装的**底层那一个** `checkRateLimit()`
 * （`middleware/rate-limit.ts`，进程内同一张 `buckets` 表），于是两个门面共享同一个桶。
 * `trpc/routers/analyst.ts:27` 是 T-08 名下"本期不再改"的文件，那两个阈值是写在那一行的**字面量**、
 * 没有可 import 的导出 ⇒ 下面 `REPORT_RATE` 是它的镜像，两侧一致性由
 * `analyst-rest.spec.ts` 的"REST 5 次 + tRPC 5 次 ⇒ 第 11 次两侧同时 429"用例钉住（不是靠注释）。
 *
 * 入参口径：`period` 是**唯一**口径（`AnalysisPeriod` 定义在 `@tm/shared` 的 `types.ts:204`，
 * T-03r2b 起 `services/analyst.ts` 也只是 import 它；
 * 值域 `7d | 30d | 90d | all`，缺省 `30d`，与 tRPC input 的 `z.enum(...).optional().default('30d')` 同形）。
 * App 侧那套 `days:number` 入参的对齐属下一轮 T-26b，本文件不认 `days`。
 * **枚举不扩值**（#106 末段：扩 `AnalysisPeriod` 要牵 `@tm/shared` 与 `services/analyst.ts`，
 * "热力图要一整年"由 App 侧对 `'all'` 的返回做客户端裁剪解决）。
 *
 * ⚠ 非法 `period` 的 400 用码（**已定码，不再是缺口**）：§4.6 的 18 码冻结面（`@tm/shared` 的
 * `TM_ERRORS`）里**没有**"通用入参非法"这一码 —— 400 档只有 `INVALID_PHONE / WEAK_PASSWORD /
 * PASSWORD_MISMATCH / AGREEMENT_REQUIRED / OLD_PASSWORD_REQUIRED / PASSWORD_SAME_AS_OLD /
 * WORDBOOK_TOO_LARGE / AVATAR_TOO_LARGE` 八条，逐条都是具体域的文案。T-26a 当时按 A-32-8 P-2 的
 * "复用现成码 + 把成因写进日志"口径**临时借**了 `WORDBOOK_TOO_LARGE`。
 * ✅ 该缺码已由 **PM-fix6 登记**为 `TM_ERRORS_SUPPLEMENT.INVALID_PARAMETER`（A-52 #135 / PRD §5.4-5），
 * 本文件的两处 400 出口即换成它：文案与状态仍**全部由表取**（`errorMessage()` +
 * `supplementErrorStatus()`，A-28-4 口径），本文件不写第二个状态数字、不写一句自己的话。
 * ⚠ 上面那次借用属**一次性过渡豁免、现已作废**；不得把它引用为"再借别的码"的先例。
 */

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { AnalystInsight } from '@tm/shared';
import { TM_ERROR_CODES, errorMessage, supplementErrorStatus, tmErrorBody } from '@tm/shared';
import { generateInsights, type LlmRouter } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';
import type { AnalystService } from '../services/analyst.js';

export interface AnalystRouterDeps {
  /** 与 tRPC ctx 同一份实例（`app.ts` 的 `deps.analyst`）—— 两门面共用一个查询服务。 */
  analyst: AnalystService;
  /** 与 tRPC ctx 同一份实例（`app.ts` 的 `deps.llmRouter`）—— 只有 `report` 面会用到。 */
  llmRouter: LlmRouter;
}

/** `analyst.report` 的限流面：key 串与阈值都是 `trpc/routers/analyst.ts:27` 的镜像（见文件头）。 */
const REPORT_RATE = {
  key: (userId: number): string => `user:${userId}:analyst-report`,
  limit: 10,
  windowMs: 60_000,
} as const;

/** 洞察缓存 TTL：`trpc/routers/analyst.ts:26` 的 `CACHE_TTL` 镜像（24 小时）。 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/** `period` 值域 = `AnalysisPeriod`（`@tm/shared` 的 `types.ts`），缺省 `30d`；与 tRPC input 同形。 */
const PeriodQuerySchema = z.enum(['7d', '30d', '90d', 'all']);
const DEFAULT_PERIOD = '30d';

/**
 * 非法入参的 400 码名：`INVALID_PARAMETER` 住 `TM_ERRORS_SUPPLEMENT`（不在 §4.6 冻结的
 * `TM_ERROR_CODES` 里），所以取串一律经 `errorMessage()` / `supplementErrorStatus()`
 * 这两个既有的 supplement 助手，本文件不写第二份取串逻辑。
 */
const INVALID_PARAMETER = 'INVALID_PARAMETER' as const;

/**
 * 取 `period` 并按值域校验。
 * 返回 `null` = 取值非法（调用方出 400）；缺省与空串都落 `'30d'`，与 tRPC 的
 * `.optional().default('30d')` 同一口径（`?period=` 这种"给了键但没值"按没给处理）。
 */
function periodOf(raw: string | undefined): z.infer<typeof PeriodQuerySchema> | null {
  const value = raw === undefined || raw === '' ? DEFAULT_PERIOD : raw;
  const parsed = PeriodQuerySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createAnalystRouter(db: AppDB, deps: AnalystRouterDeps): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  /**
   * 分析报告：`{ dataset, insights, cached }`，逐步对齐 tRPC `analyst.report`
   * （顺序也是那一段的顺序：限流 → 实时算 dataset → 查缓存 → 命中即回 / 未命中生成并回写）。
   */
  r.get('/api/analyst', auth, async (c) => {
    const userId = c.get('userId');
    const period = periodOf(c.req.query('period'));
    if (period === null) {
      return c.json(
        { error: errorMessage(INVALID_PARAMETER), code: INVALID_PARAMETER },
        supplementErrorStatus(INVALID_PARAMETER) as ContentfulStatusCode,
      );
    }

    // 与 tRPC 同一个桶（同 key 串、同 10 次/60s）；超限的 429 文案/状态也取自 §4.6 表。
    const rl = checkRateLimit(REPORT_RATE.key(userId), REPORT_RATE.limit, REPORT_RATE.windowMs);
    if (!rl.ok) {
      const tooMany = tmErrorBody(TM_ERROR_CODES.TOO_MANY_REQUESTS);
      c.header('Retry-After', String(rl.retryAfterSeconds));
      return c.json(tooMany.body, tooMany.status as ContentfulStatusCode);
    }

    // 数据集实时计算（不缓存 —— 与 tRPC 同一句注释所写的理由）
    const dataset = await deps.analyst.analyze(userId, period);

    const cached = await db.analystCache.get(userId, period);
    if (cached && Date.now() - cached.created_at < CACHE_TTL) {
      const insights = JSON.parse(cached.content) as AnalystInsight[];
      return c.json({ dataset, insights, cached: true });
    }

    const insights = await generateInsights(deps.llmRouter, dataset, {
      totalWords: dataset.growthCurve.at(-1)?.total,
    });
    await db.analystCache.set(userId, period, JSON.stringify(insights), Date.now());
    return c.json({ dataset, insights, cached: false });
  });

  /**
   * 只有数据集：热力图 / 增长曲线的原始数据（`AnalyticsDataset`）。
   * **零 LLM、零 `analyst_cache` 读写、零限流桶占用**（理由见文件头）；
   * 与上面那条共用同一个 `analyze()`，所以同一用户同一 period 的 dataset 内容同源。
   */
  r.get('/api/analyst/dataset', auth, async (c) => {
    const userId = c.get('userId');
    const period = periodOf(c.req.query('period'));
    if (period === null) {
      return c.json(
        { error: errorMessage(INVALID_PARAMETER), code: INVALID_PARAMETER },
        supplementErrorStatus(INVALID_PARAMETER) as ContentfulStatusCode,
      );
    }
    return c.json(await deps.analyst.analyze(userId, period));
  });

  return r;
}
