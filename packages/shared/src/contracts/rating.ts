/**
 * 评分契约（§3.3.1 草案 + R-02②③ / R-11）。
 *
 * R-02③ 的红线：**入参域只有 1-4，越界必须 4xx，不得静默截断或夹紧**。
 * R-02② 的判据载体：REST 与 tRPC 两条路对同一 fixture 必须产出**逐字段相等**的 `ReviewResult`。
 *
 * 取值集合 `RATING_VALUES` 定义在 `constants/limits.ts`（唯一声明点），本文件只派生 schema。
 */

import { z } from 'zod';
import { RATING_VALUES, WORD_MAX_LENGTH } from '../constants/limits.js';
import type { RatingValue } from '../constants/limits.js';

/** 四档字面量联合：1 忘记 / 2 困难 / 3 良好 / 4 轻松。 */
export const RatingLiteralSchema = z.union([
  z.literal(RATING_VALUES[0]),
  z.literal(RATING_VALUES[1]),
  z.literal(RATING_VALUES[2]),
  z.literal(RATING_VALUES[3]),
]);

/**
 * 入参归一：数字 `1..4` 与字符串 `'1'..'4'` 都接受（现网 `POST /api/review` 就走
 * `Number(body.rating)`，Web 端表单提交的是字符串），越界与非数字字符串一律 fail。
 *
 * 偏差：§3.3.1 草案只写了字符串枚举（`z.enum(['1','2','3','4'])`），
 * 那样会拒掉现网已在发的数字形状 → 本契约同时接受两种形状，
 * 再用 `pipe` 收敛到字面量联合，域外值仍然是 4xx。见报告「契约偏差」D-3。
 */
export const RatingSchema = z.preprocess(
  (v) => (typeof v === 'string' && /^\s*[1-4]\s*$/.test(v) ? Number(v.trim()) : v),
  RatingLiteralSchema,
);

export type RatingInput = z.infer<typeof RatingSchema>;

/** 提交评分（`POST /api/review` / `review.reviewCard`）。 */
export const ReviewInputSchema = z.object({
  word: z.string().min(1).max(WORD_MAX_LENGTH),
  rating: RatingSchema,
});
export type ReviewInputDto = z.infer<typeof ReviewInputSchema>;

/**
 * 评分回参（R-02② 双端逐字段相等的判据载体）。
 * `due` 是 ISO 字符串或时间戳字符串，由 ts-fsrs 序列化决定（A-2：钉在 4.7.1）。
 */
export const ReviewResultSchema = z.object({
  word: z.string(),
  due: z.string(),
  state: z.number().int(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  rating: RatingSchema,
  reviewedAt: z.number().int(),
});
export type ReviewResultDto = z.infer<typeof ReviewResultSchema>;

/** 撤销入参（R-11④：同一轮内 ≤3 次，次数上限读 `UNDO_MAX_PER_SESSION`）。 */
export const ReviewUndoInputSchema = z.object({
  word: z.string().min(1).max(WORD_MAX_LENGTH),
});

/** 撤销回参：回到哪一张 + 剩余可撤销次数。 */
export const ReviewUndoResultSchema = z.object({
  ok: z.literal(true),
  word: z.string(),
  index: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

/** 本轮统计（完成页 `本轮结束 / 12 张 / 忘记 2 · 困难 1 …` 的数据侧）。 */
export const RoundSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  counts: z.object({
    1: z.number().int().nonnegative(),
    2: z.number().int().nonnegative(),
    3: z.number().int().nonnegative(),
    4: z.number().int().nonnegative(),
  }),
  elapsedSeconds: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
});

/** 判断任意值是否合法评分（表单与单测共用，不各自写 `[1,2,3,4].includes`）。 */
export function isRating(v: unknown): v is RatingValue {
  return RatingLiteralSchema.safeParse(v).success;
}

export function parseReviewInput(value: unknown) {
  return ReviewInputSchema.safeParse(value);
}
export function parseReviewResult(value: unknown) {
  return ReviewResultSchema.safeParse(value);
}
