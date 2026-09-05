/**
 * tRPC 上下文与初始化
 */

import { initTRPC, TRPCError } from '@trpc/server';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import type { EventCollector } from '../services/events.js';
import type { AnalystService } from '../services/analyst.js';
import type { CacheService } from '../services/cache.js';
import type { LookupService } from '../services/lookup.js';
import type { SmsService } from '../services/sms.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export interface TrpcContext {
  /** 已认证用户 id，未登录为 null */
  userId: number | null;
  /** 客户端 IP（X-Forwarded-For 首段，反代后取真实来源；限流用） */
  clientIp: string;
  db: AppDB;
  agentDeps: AgentDeps;
  llmRouter: LlmRouter;
  lookup: LookupService;
  sms: SmsService;
  /** 学情事件采集器（Phase 5） */
  events: EventCollector;
  /** 学情分析服务（Phase 5） */
  analyst: AnalystService;
  /** 缓存层（Phase 6） */
  cache: CacheService;
}

const t = initTRPC.context<TrpcContext>().create();

/** 登录保护：无 userId 直接抛 401 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

/** LLM/敏感端点限流：key 维度（user 或 ip）内 windowMs 窗口最多 limit 次 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.ok) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `操作过于频繁，请 ${result.retryAfterSeconds} 秒后再试`,
    });
  }
}

/** LLM 端点统一限流入口：登录用户按 user 维度，匿名按 IP 维度 */
export function llmRateLimit(
  ctx: TrpcContext,
  scope: string,
  opts: { userPerMin: number; anonPerMin: number; anonPerDay?: number },
): void {
  if (ctx.userId !== null) {
    rateLimit(`user:${ctx.userId}:${scope}`, opts.userPerMin, 60_000);
  } else {
    rateLimit(`ip:${ctx.clientIp}:${scope}`, opts.anonPerMin, 60_000);
    if (opts.anonPerDay !== undefined && !checkRateLimit(`ip:${ctx.clientIp}:${scope}:daily`, opts.anonPerDay, 86_400_000).ok) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: '今日使用次数已达上限，请明天再来' });
    }
  }
}

export const publicProcedure = t.procedure;
export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
