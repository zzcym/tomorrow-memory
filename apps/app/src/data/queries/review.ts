/**
 * 复习队列与评分（R-02 / R-12 / R-13 的数据面）。
 *  - `GET /api/review/queue?mode=` 与 `POST /api/review`、`POST /api/review/undo`（§5.3）；
 *  - `GET /api/review/today` 是旧 APK 兼容矩阵成员，保留给"今日待背数"的兜底口径；
 *  - **R-12②：`mode=new|selfTest` 一律不发评分请求**（服务端也不写卡，T-10 判据⑤），
 *    本文件用 `canRate(mode)` 把这条规则收在数据层，T-18 只消费它。
 */

import { queryOptions } from '@tanstack/react-query';
import {
  DueCountSchema,
  ReviewQueueResultSchema,
  ReviewUndoResultSchema,
  parseReviewResult,
  type QueueMode,
  type RatingValue,
  type ReviewQueueResultDto,
  type ReviewResultDto,
} from '@tm/shared';
import { apiGet, apiPost, unwrapParse } from '../rest-fetcher.js';

export const reviewKeys = {
  all: ['review'] as const,
  queue: (mode: QueueMode) => [...reviewKeys.all, 'queue', mode] as const,
  dueCount: () => [...reviewKeys.all, 'due-count'] as const,
};

/** 只有真实复习会写卡（R-12② / §4.3 末段）。 */
export const canRate = (mode: QueueMode): boolean => mode === 'review';

export function reviewQueueQueryOptions(mode: QueueMode = 'review') {
  return queryOptions<ReviewQueueResultDto>({
    queryKey: reviewKeys.queue(mode),
    staleTime: 20 * 1000,
    queryFn: () =>
      apiGet<ReviewQueueResultDto>(
        '/api/review/queue',
        { auth: true, query: { mode } },
        (raw) => unwrapParse(ReviewQueueResultSchema.safeParse(raw)),
      ),
  });
}

/**
 * 红点数取数的**唯一实现**：`dueCountQueryOptions` 与 §5.5 第 3 步 `refreshDueCount()` 共用，
 * 不写第二份。
 */
export async function fetchDueCount(): Promise<number> {
  const raw = await apiGet<unknown>('/api/review/queue', {
    auth: true,
    query: { mode: 'review', limit: 1 },
  });
  const queue = ReviewQueueResultSchema.safeParse(raw);
  if (queue.success) return queue.data.dueToday;
  const dedicated = DueCountSchema.safeParse(raw);
  if (dedicated.success) return dedicated.data.dueToday;
  return unwrapParse<number>({ success: false, error: raw });
}

/**
 * 底部 tab 红点 + 首页胶囊 + 通知本地镜像共用的**今日待背数**（§5.4③、§5.5 第 3 步）。
 * 只取一个数：`dailyGoal` / `streak` 由 `profile` 那份查询提供，不在这里造第二份真相。
 */
export function dueCountQueryOptions() {
  return queryOptions<number>({
    queryKey: reviewKeys.dueCount(),
    staleTime: 15 * 1000,
    queryFn: fetchDueCount,
  });
}

export function rateWord(word: string, rating: RatingValue, mode: QueueMode = 'review') {
  if (!canRate(mode)) {
    throw new Error('review-queue: mode=new|selfTest 不评分（R-12②）');
  }
  return apiPost<ReviewResultDto>(
    '/api/review',
    { word, rating },
    { auth: true },
    (raw) => unwrapParse(parseReviewResult(raw)),
  );
}

export function undoRating(word: string) {
  return apiPost(
    '/api/review/undo',
    { word },
    { auth: true },
    (raw) => unwrapParse(ReviewUndoResultSchema.safeParse(raw)),
  );
}

/** 旧接口，形状不变（兼容矩阵）。新页面优先用 `reviewQueueQueryOptions`。 */
export function reviewTodayQueryOptions() {
  return queryOptions({
    queryKey: [...reviewKeys.all, 'today'] as const,
    staleTime: 15 * 1000,
    queryFn: () => apiGet('/api/review/today', { auth: true }),
  });
}
