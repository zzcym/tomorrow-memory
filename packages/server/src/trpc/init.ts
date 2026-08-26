/**
 * tRPC 上下文与初始化
 */

import { initTRPC, TRPCError } from '@trpc/server';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import type { LookupService } from '../services/lookup.js';
import type { SmsService } from '../services/sms.js';

export interface TrpcContext {
  /** 已认证用户 id，未登录为 null */
  userId: number | null;
  db: AppDB;
  agentDeps: AgentDeps;
  llmRouter: LlmRouter;
  lookup: LookupService;
  sms: SmsService;
}

const t = initTRPC.context<TrpcContext>().create();

/** 登录保护：无 userId 直接抛 401 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const publicProcedure = t.procedure;
export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
