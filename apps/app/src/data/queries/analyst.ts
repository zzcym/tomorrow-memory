/**
 * 学习情况（R-19① 的"轻学情"页数据面，tab4）。
 *
 * 服务端实现（T-26a 落地，判据来源 A-47 #106 / #107）：`packages/server/src/routes/analyst.ts`
 *  - `GET /api/analyst?period=7d|30d|90d|all` → `{ dataset, insights, cached }`，
 *    与 tRPC `analyst.report` 同形状（同一份 `services/analyst.ts` 的 `analyze()`、同一张
 *    `analyst_cache`、同一把限流尺子）；
 *  - `GET /api/analyst/dataset?period=…` → **只回** `AnalyticsDataset`（零 LLM、零缓存读写）。
 *
 * 入参口径：`period` 是**唯一**口径（缺省 `30d`，空串按"没给"处理，非法值 400）。
 * 服务端**从不**接受 `days:number` —— 本文件此前那套 `days` 入参照 #106 判为"对着不存在的契约写"，
 * 本轮（T-26b）改为 `period`。热力图要的"一整年"不改枚举、不加端点，由 App 侧对 `'all'`
 * 的返回做客户端裁剪（见 `components/progress-data.ts` 的 `ANALYST_WINDOW_DAYS`）。
 *
 * `analyst` 域在 `@tm/shared` 里只有 **interface**（`AnalysisReport` / `AnalyticsDataset`），
 * 没有 zod 契约 → 本期无法 `safeParse`。这里做最小形状守卫（必须是对象），并把缺口写进报告
 * 的"给 TPM/T-03 的需求"。**不要在 screens 里补第二份读取逻辑**，也不要在这一层加"取不到当空"
 * 的静默兜底（§6.6 人话原则；判例 A-43 #77 / A-46 #96）。
 */

import { queryOptions } from '@tanstack/react-query';
import {
  SYNC_COPY,
  type AnalysisPeriod,
  type AnalyticsDataset,
  type AnalysisReport,
} from '@tm/shared';
import { ApiError, apiGet } from '../rest-fetcher.js';

/**
 * 分析周期。**真源 = 唯一声明点**是 `@tm/shared` 的 `types.ts:204`
 * （REST 面用 `routes/analyst.ts` 的 `PeriodQuerySchema = z.enum([...])` 逐字校验同一值域，
 * 服务端 `services/analyst.ts` 也 import 它）。T-26b 留下的本模块镜像声明已由 T-03r2b 删除，
 * 这里只转发，调用点（本文件的键 + `ProgressScreen` + 测试夹具）零改动。
 */
export type { AnalysisPeriod };

/** 缺省与 tRPC 的 `.optional().default('30d')`、REST 的 `DEFAULT_PERIOD` 同口径。 */
export const DEFAULT_ANALYST_PERIOD: AnalysisPeriod = '30d';

export const analystKeys = {
  all: ['analyst'] as const,
  report: (period: AnalysisPeriod) => [...analystKeys.all, 'report', period] as const,
  dataset: (period: AnalysisPeriod) => [...analystKeys.all, 'dataset', period] as const,
};

const requireObject = <T>(raw: unknown): T => {
  if (raw === null || typeof raw !== 'object') {
    throw new ApiError('BAD_RESPONSE', SYNC_COPY.serverBusy, 200, raw);
  }
  return raw as T;
};

/** 报告面（`{dataset,insights,cached}`）：会走 24h 洞察缓存，页面上"进页即拉/下拉刷新"用的就是这条。 */
export function analysisReportQueryOptions(period: AnalysisPeriod = DEFAULT_ANALYST_PERIOD) {
  return queryOptions<AnalysisReport>({
    queryKey: analystKeys.report(period),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      apiGet<AnalysisReport>('/api/analyst', { auth: true, query: { period } }, (raw) =>
        requireObject<AnalysisReport>(raw),
      ),
  });
}

/** 只有图形数据：`GET /api/analyst/dataset`（`routes/analyst.ts:134`），零 LLM、零 `analyst_cache` 读写。 */
export function analyticsDatasetQueryOptions(period: AnalysisPeriod = DEFAULT_ANALYST_PERIOD) {
  return queryOptions<AnalyticsDataset>({
    queryKey: analystKeys.dataset(period),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      apiGet<AnalyticsDataset>('/api/analyst/dataset', { auth: true, query: { period } }, (raw) =>
        requireObject<AnalyticsDataset>(raw),
      ),
  });
}
