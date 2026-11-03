/**
 * tRPC 域：chat（实时对话历史；Phase 4）
 * 自 `trpc/router.ts` 逐字搬迁（T-08，零行为变更）。
 *
 * T-11 / R-05①②（判据④⑤）：这里与 REST `GET /api/chat/history` 走**同一个**
 * `readThreadHistory()`（在 `routes/chat.ts`，两者同属 §4.2 门面层）：
 *  - checkpoint key 规则 `{userId}:{threadId}` 只在 `resolveThreadAccess()` 里写一遍；
 *  - 别人名下的会话 ⇒ 403 `FORBIDDEN`（不是 500、不是"空返回"）；
 *  - 改造前的裸 threadId 行仍可被属主读（不迁移数据）。
 *
 * ⚠ 输出形状刻意保持 `{ threadId, messages }` 一字不变（只加行为、不加键），
 * 以免给 A-28-1 的 trpc-shape 基线审计再添一条 diff；REST 侧多出的
 * `checkpointKey/legacy` 是诊断字段，tRPC 侧不需要第二份。
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { supplementErrorStatus } from '@tm/shared';
import { ThreadForbidden, readThreadHistory } from '../../routes/chat.js';
import { protectedProcedure, router } from '../init.js';

export const chat = router({
  history: protectedProcedure
    .input(z.object({ threadId: z.string().max(100).optional().default('default') }))
    .query(async ({ ctx, input }) => {
      try {
        const { threadId, messages } = await readThreadHistory(ctx.db, ctx.userId, input.threadId);
        return { threadId, messages };
      } catch (err) {
        if (err instanceof ThreadForbidden) {
          // 403 语义走 tRPC 的 FORBIDDEN 码；文案与 REST 的 `{error}` 同一份（都取自 @tm/shared）。
          //
          // ⚠ `httpStatus` **必须带上**（与 `routers/profile.ts` 的 `toTrpcError()` 同形：
          // `{tmCode, httpStatus, facade}`）。`FORBIDDEN` 属 `TM_ERRORS_SUPPLEMENT` 而不是 §4.6 冻结的
          // `TM_ERRORS`，而 `trpc/init.ts` 的 errorFormatter 在 `cause.httpStatus` 缺失时兜底走
          // `TM_ERRORS[tmCode].http` ⇒ supplement 码取到 `undefined.http` = TypeError ⇒
          // 线上 403 被翻成 500（判据⑤ 的 tRPC 面）。取状态只走 `supplementErrorStatus()` 一处，
          // 本文件不写 403 这个数字。
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: err.message,
            cause: {
              tmCode: err.code,
              httpStatus: supplementErrorStatus(err.code),
              facade: 'trpc',
              reason: err.reason,
            },
          });
        }
        throw err;
      }
    }),
});
