/**
 * tRPC 域：agent（编排入口；Phase 4 对话/HITL 的基础入口）
 * 自 `trpc/router.ts` 逐字搬迁（T-08，零行为变更）。
 */

import { z } from 'zod';
import { runAgent } from '@tm/agent';
import { protectedProcedure, rateLimit, router } from '../init.js';

export const agent = router({
  chat: protectedProcedure
    .input(z.object({ input: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      // 编排调用成本高：每用户 10 次/分钟
      rateLimit(`user:${ctx.userId}:agent-chat`, 10, 60_000);
      const state = await runAgent(ctx.agentDeps, ctx.llmRouter, {
        userId: ctx.userId,
        input: input.input,
      });
      return {
        intent: state.intent,
        word: state.word,
        response: state.response ?? '',
        tutorContent: state.tutorContent,
        lookupResult: state.lookupResult,
        reviewQueue: state.reviewQueue,
        error: state.error,
      };
    }),
});
