/**
 * tRPC 域：analyst（学情分析；Phase 5）
 * 自 `trpc/router.ts` 逐字搬迁（T-08，零行为变更）。
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { AnalystInsight } from '@tm/shared';
import { generateInsights } from '@tm/agent';
import { checkRateLimit } from '../../middleware/rate-limit.js';
import { protectedProcedure, rateLimit, router } from '../init.js';

export const analyst = router({
  /**
   * 获取分析报告（图表数据 + LLM 洞察）。
   * 洞察结果缓存 24h（analyst_cache 表，按 user_id + period）。
   */
  report: protectedProcedure
    .input(
      z.object({
        period: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const CACHE_TTL = 24 * 60 * 60 * 1000;
      rateLimit(`user:${userId}:analyst-report`, 10, 60_000);

      // 数据集实时计算（不缓存——数据本身轻量，保证图表最新）
      const dataset = await ctx.analyst.analyze(userId, input.period);

      // 洞察缓存：24h 命中直接返回
      const cached = await ctx.db.analystCache.get(userId, input.period);
      if (cached && Date.now() - cached.created_at < CACHE_TTL) {
        const insights = JSON.parse(cached.content) as AnalystInsight[];
        return { dataset, insights, cached: true };
      }

      const insights = await generateInsights(ctx.llmRouter, dataset, {
        totalWords: dataset.growthCurve.at(-1)?.total,
      });
      await ctx.db.analystCache.set(userId, input.period, JSON.stringify(insights), Date.now());
      return { dataset, insights, cached: false };
    }),

  /**
   * 强制重新生成洞察（绕过 24h 缓存）。独立 mutation 便于前端正确处理
   * pending/error 态；带 5 分钟冷却防刷 LLM。
   */
  refresh: protectedProcedure
    .input(z.object({ period: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d') }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const cooldown = checkRateLimit(`user:${userId}:analyst-refresh`, 1, 5 * 60_000);
      if (!cooldown.ok) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `洞察刷新过于频繁，请 ${cooldown.retryAfterSeconds} 秒后再试`,
        });
      }
      const dataset = await ctx.analyst.analyze(userId, input.period);
      const insights = await generateInsights(ctx.llmRouter, dataset, {
        totalWords: dataset.growthCurve.at(-1)?.total,
      });
      await ctx.db.analystCache.set(userId, input.period, JSON.stringify(insights), Date.now());
      return { insights };
    }),
});
