/**
 * 队列契约（R-12 三模式 + R-18 待背数）。
 *
 * 模式取值 `QUEUE_MODES` 与标签 `MODE_LABELS` 分别在 `constants/limits.ts` / `constants/rating.ts`，
 * 本文件只做形状。§3.3.1 草案把 `ReviewQueueMode` / `QueueItemSchema` 写在 `contracts/rating.ts`，
 * 本任务的文件清单要求单独的 `contracts/review-queue.ts` → 落点改到这里，**名称与形状一字不动**
 * （`ReviewQueueModeSchema` 即草案的 `ReviewQueueMode`，草案名以别名保留）。见报告「契约偏差」D-4。
 */

import { z } from 'zod';
import { NEW_WORD_BATCH_DEFAULT, QUEUE_MODES, RECENT_GLOSS_MAX_LENGTH } from '../constants/limits.js';

/** 三模式：今日复习 / 学新词 / 随机自测（R-12①）。 */
export const ReviewQueueModeSchema = z.enum(QUEUE_MODES);
/** §3.3.1 草案里的名字，保持可 import。 */
export const ReviewQueueMode = ReviewQueueModeSchema;

/** 队列条目：`hasCard` 决定是新卡首学还是复习（R-12③）。 */
export const QueueItemSchema = z.object({
  word: z.string(),
  hasCard: z.boolean(),
  /** 面板/卡面首义，缺失即空串（不显示占位符）。 */
  gloss: z.string().max(RECENT_GLOSS_MAX_LENGTH).default(''),
});
export type QueueItemDto = z.infer<typeof QueueItemSchema>;

/** 取队列入参（`GET /api/review/queue` / `review.queue`）。 */
export const ReviewQueueInputSchema = z.object({
  mode: ReviewQueueModeSchema.default('review'),
  /** 学新词单次取数上限：默认 = 每日目标默认值（R-12②，服务端再按 daily_goal 夹）。 */
  limit: z.number().int().positive().max(NEW_WORD_BATCH_DEFAULT * 10).optional(),
});
export type ReviewQueueInputDto = z.infer<typeof ReviewQueueInputSchema>;

/** 队列出参。`total` = 词本总量，`dueToday` = 今日待背（R-18① 红点数）。 */
export const ReviewQueueResultSchema = z.object({
  mode: ReviewQueueModeSchema,
  total: z.number().int().nonnegative(),
  dueToday: z.number().int().nonnegative(),
  /**
   * 还没学过（无 FSRS 卡）的词数（2026-11 追加，首页胶囊据此优先显示"还有 N 个词没学"）。
   * 可选：老服务端不返回时客户端按"没有新词"处理，不编造。
   */
  newAvailable: z.number().int().nonnegative().optional(),
  queue: z.array(QueueItemSchema),
});
export type ReviewQueueResultDto = z.infer<typeof ReviewQueueResultSchema>;

/** 底部 tab 红点与首页胶囊共用的待背数（R-07① / R-18①）。 */
export const DueCountSchema = z.object({
  dueToday: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  dailyGoal: z.number().int().positive(),
  doneToday: z.number().int().nonnegative(),
});
export type DueCountDto = z.infer<typeof DueCountSchema>;
