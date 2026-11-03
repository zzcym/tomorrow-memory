/**
 * tRPC 域：review（复习调度）—— 与 REST 门面共用 `services/review-service.ts`（判据③）。
 *
 * 本文件只做：过程声明 + zod 入参校验（改从 `@tm/shared` 契约 import）+ 一行 service 调用
 * + 响应组装。没有 SQL、没有 `db.` 直调、没有 `@tm/agent`（A-19/A-25 那 15 条红的清零点），
 * 也**没有任何中文字面量**（A-23-7：错误文案一律来自 service 抛出的 `ReviewError`，
 * 其文案由 `@tm/shared` 的 `RATING_VALUES` / `RATING_LABELS` 组装）。
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { RatingLiteralSchema, ReviewQueueInputSchema, ReviewUndoInputSchema } from '@tm/shared';
import { protectedProcedure, router } from '../init.js';
import { buildQueue, todayQueue } from '../../services/queue-service.js';
import { ReviewError, rateCard, reviewErrorTrpcCode, undoRating } from '../../services/review-service.js';

/** 词形与档位由 service 再校验一次；这里的 zod 形状与拆分前逐字节相同（T-08 基线）。 */
const ReviewCardInput = z.object({
  word: z.string().min(1),
  rating: RatingLiteralSchema,
});

/**
 * A-33-6（N-2）：`cause` 必须是 errorFormatter 认得的那对键。
 *
 * `ReviewError` 的字段叫 `code` / `http`（`review-service.ts:41-51`），而 `trpc/init.ts`
 * 的唯一 errorFormatter 读的是 `cause.tmCode` / `cause.httpStatus`（A-30-1）。传实例
 * （`cause: err`）等于没传 ⇒ REST 侧 `reviewErrorBody` 正确、tRPC 侧 `data.code` 永远只剩
 * 协议码，判据③ 的错误码那一半根本没收敛（A-28-6 说的"两端只收敛了一半"）。
 * `httpStatus` 一并带上 = 本域自己就把状态说全（`err.http` 即 `supplementErrorStatus(code)` 的结果），
 * 不依赖 errorFormatter 的回查兜底；那条兜底由 A-33-5（T-07 第六轮）补成两级查表后才真正可用。
 */
function asTrpcError(err: unknown): never {
  if (err instanceof ReviewError) {
    throw new TRPCError({
      code: reviewErrorTrpcCode(err),
      message: err.message,
      cause: { tmCode: err.code, httpStatus: err.http },
    });
  }
  throw err;
}

export const review = router({
  /** 今日复习队列（与 `GET /api/review/today` 同一函数、同一形状）。 */
  today: protectedProcedure.query(async ({ ctx }) => {
    const today = await todayQueue(ctx.db, ctx.userId);
    return {
      total: today.total,
      dueToday: today.dueToday,
      queue: today.queue.map((q) => ({
        word: q.word,
        retrievability: q.retrievability,
        elapsedDays: q.elapsedDays,
      })),
    };
  }),

  /** 三模式取队（R-12）：`mode=new/selfTest` 不写 FSRS 卡。 */
  queue: protectedProcedure
    .input(ReviewQueueInputSchema)
    .query(async ({ ctx, input }) => buildQueue(ctx.db, ctx.userId, input)),

  /** 评分：1=忘记 2=困难 3=良好 4=轻松（唯一实现 = `rateCard`）。 */
  reviewCard: protectedProcedure
    .input(ReviewCardInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rateCard(ctx.db, { userId: ctx.userId, word: input.word, rating: input.rating }, {
          events: ctx.events,
        });
      } catch (err) {
        return asTrpcError(err);
      }
    }),

  /** 撤销上一张（R-11③）：用 `review_snapshots` 的前置快照整体回写一次。 */
  undo: protectedProcedure
    .input(ReviewUndoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await undoRating(ctx.db, ctx.userId, input.word);
      } catch (err) {
        return asTrpcError(err);
      }
    }),
});
