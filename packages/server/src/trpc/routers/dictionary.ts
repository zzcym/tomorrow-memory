/**
 * tRPC 域：dictionary（查词 / SSE 流式）
 * 自 `trpc/router.ts` 逐字搬迁（T-08，零行为变更）。
 */

import { z } from 'zod';
import { cacheKeys } from '../../services/cache.js';
import { llmRateLimit, publicProcedure, router } from '../init.js';

export const dictionary = router({
  lookup: publicProcedure
    .input(
      z.object({
        word: z.string().min(1).max(100),
        direction: z.enum(['auto', 'en2zh', 'zh2en']).optional().default('auto'),
        // 前端查询序号：同一单词重复查询时递增，强制触发新订阅（服务端忽略该字段）
        seq: z.number().int().optional(),
      }),
    )
    .subscription(async function* ({ input, ctx }) {
      // 限流：匿名按 IP（10/分钟、100/日），登录按用户（30/分钟）——AI 讲解消耗 strong 模型 token
      llmRateLimit(ctx, 'lookup', { userPerMin: 30, anonPerMin: 10, anonPerDay: 100 });
      const word = input.word.trim();
      void input.seq;
      // 1. 静态查词（毫秒级）
      const staticResult = await ctx.lookup.lookup(word, input.direction);
      yield { type: 'static', word, result: staticResult };

      // 2. AI 内容（教学/补充，流式）
      if (ctx.llmRouter.hasLlm) {
        try {
          const prompt =
            `单词: ${word}\n释义: ${JSON.stringify(staticResult ?? '').slice(0, 400)}\n` +
            `请提供：1) 记忆口诀 2) 词根拆解 3) 词源 4) 易混淆词辨析。用简体中文，简洁分点。`;
          yield { type: 'ai-start', word };
          for await (const chunk of ctx.llmRouter.invokeStream(
            [
              {
                role: 'system',
                content: '你是资深英语教师与词源学家，输出简洁的单词学习内容。',
              },
              { role: 'user', content: prompt },
            ],
            'strong',
          )) {
            yield { type: 'ai-chunk', text: chunk };
          }
          yield { type: 'ai-done' };
        } catch (err) {
          console.warn('[TRPC] AI 流式生成失败:', (err as Error).message);
          yield { type: 'ai-error', error: 'AI 内容生成失败' };
        }
      }
      yield { type: 'done' };
    }),

  /** 静态查词（一次性，非流式；供 Flashcard 等场景使用） */
  lookupStatic: publicProcedure
    .input(
      z.object({
        word: z.string().min(1).max(100),
        direction: z.enum(['auto', 'en2zh', 'zh2en']).optional().default('auto'),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Phase 6：查词结果缓存 5 分钟（Redis 可用时）
      return ctx.cache.getOrSet(
        cacheKeys.lookup(input.word.trim(), input.direction),
        300,
        () => ctx.lookup.lookup(input.word.trim(), input.direction),
      );
    }),
});
