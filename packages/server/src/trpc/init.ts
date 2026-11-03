/**
 * tRPC 上下文与初始化
 */

import { initTRPC, TRPCError } from '@trpc/server';
import {
  TM_ERROR_CODES,
  TM_ERRORS,
  TM_ERRORS_SUPPLEMENT,
  errorHttpStatus,
  isTmErrorCode,
  supplementErrorStatus,
  type TmErrorSupplementCode,
} from '@tm/shared';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import { tmErrorCause, type TmErrorCause } from '../services/password-policy.js';
import type { AuthService } from '../services/auth-service.js';
import type { FeatureFlags } from '../services/feature-flags.js';
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

  /* ── T-07 追加（R-40④）：两个新键都是**可选**，以免改到并行任务手搭的 ctx（T-09/T-10 的 createCaller 用例）。 ── */

  /**
   * true = 本次请求带的是 `aud='pw-upgrade'` 的 upgrade token。
   * 由 `app.ts` 的 createContext 经 `verifyToken()` 得出，生产路径必设；
   * 未设（`= undefined`）按"正常会话"处理（门禁只认显式的 upgrade 标记）。
   */
  passwordUpgradeOnly?: boolean;
  /** 凭据域 service（`auth.*` 的六个过程唯一依赖它；装配层注入）。 */
  auth?: AuthService;
  /** 运行时开关读取面（`auth.sendCode`/注册开关等按 §4.4.4 读它）。 */
  flags?: FeatureFlags;
}

/**
 * §4.6 码上线的**唯一**通道（A-30-1）。
 *
 * `TRPCError` 不保存 `data`（见 `services/password-policy.ts` 的 `TmErrorCause` 注释），
 * 所以本文件是全站唯一把 `cause.{tmCode,httpStatus}` 提升为 `data.{code,httpStatus}` 的地方：
 *  - `data.code`：有 §4.6 码时是那个码，没有时保持 tRPC 自带协议码（不无中生有）；
 *  - `data.httpStatus`：有码时取**两级查表**的结果（见下面 `tmCodeHttpStatus()`，A-33-5），
 *    两类码表都没有时保持 `shape.data.httpStatus`；不再由协议码反推。
 * procedure 清单不含 errorFormatter ⇒ 不影响 `trpc-shape` 基线再生（A-30-1 已核对）。
 * 钉住这条形状的测试用例在 `test/integration/auth-register.spec.ts` 的"判据⑥/A-30-1"一节
 * （A-33-5 的三条疫苗就在它们旁边）。
 */
function readTmCause(cause: unknown): Partial<TmErrorCause> {
  return typeof cause === 'object' && cause !== null ? (cause as Partial<TmErrorCause>) : {};
}

/**
 * **两级查表**（A-33-5 / N-1，批次3 出口必修）：一个 `cause.tmCode` 字符串 → §4.6 契约里的 HTTP 状态。
 *
 * 为什么必须两级：`TM_ERRORS` 只是 §4.6 的 **18 码冻结面**（`@tm/shared` 的 `errors.ts:79`），
 * `FORBIDDEN`（R-05② / R-41①）与复习域那几码（R-02 / A-28-4）、`INVALID_WORDBOOK_ENTRY`（A-32-8 P-2）
 * 住在 `TM_ERRORS_SUPPLEMENT`（`errors.ts:215`）。改前只查第一级 ⇒ `TM_ERRORS[code]` 是 `undefined`
 * ⇒ `.http` **在 errorFormatter 内部**抛 TypeError ⇒ 本该 403 的门在线上变 500。
 *
 * 三条边界（都是裁决写死的，不是这里自己加的）：
 *  - **只 import 现成助手**：`isTmErrorCode` / `errorHttpStatus` / `supplementErrorStatus`。
 *    本文件不新增 shared 导出、不碰 `errors.ts`（T-03/E1b 名下），也不改 `errorHttpStatus` 的签名
 *    （它钉在 §4.6 快照面上，A-8 不许改形状）；本文件自己也不写第二个状态数字。
 *  - 第二级查 `TM_ERRORS_SUPPLEMENT` 用 `Object.hasOwn` 而不是 `code in 表`：
 *    `in` 会顺原型链命中 `constructor` / `toString` 这类键，又变成 `undefined.http` 的第二次 TypeError。
 *  - **两类码都查不到 ⇒ 返回 `undefined`**，由调用方保持 `shape.data.httpStatus`（协议自带的状态），
 *    不无中生有、也不在这里把未知码降级成 500。
 */
function tmCodeHttpStatus(code: string): number | undefined {
  if (isTmErrorCode(code)) return errorHttpStatus(code);
  if (Object.hasOwn(TM_ERRORS_SUPPLEMENT, code)) return supplementErrorStatus(code as TmErrorSupplementCode);
  return undefined;
}

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    const cause = readTmCause(error.cause);
    const tmCode = typeof cause.tmCode === 'string' ? cause.tmCode : undefined;
    const httpStatus = typeof cause.httpStatus === 'number' ? cause.httpStatus : tmCode ? tmCodeHttpStatus(tmCode) : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        code: tmCode ?? shape.data.code,
        httpStatus: httpStatus ?? shape.data.httpStatus,
      },
    };
  },
});

/** 凭据域 401 的旧形状（`{error:'未登录'}` 语义，T-08 搬迁前后一字未改）。 */
function requireUser(ctx: TrpcContext): number {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  }
  return ctx.userId;
}

/**
 * 登录保护 + **强制改密硬门禁**（R-40④）：upgrade token 打任何业务过程一律 403
 * `PASSWORD_UPGRADE_REQUIRED`（`{error, code}` 由 `data.code` 承载，两端同文案）。
 *
 * 默认**所有**受保护过程都过这道门 = fail-closed；§4.7 白名单里的那三个
 * （`auth.forceChangePassword` / `auth.logout` / `auth.me`）改用下面显式的
 * `upgradeProtectedProcedure`。这样新增业务过程时忘接门禁不会漏，忘接白名单也只会
 * 多拦一次（可诊断），而不是放行。
 *
 * ⚠ 不在这里读任何运行时开关：拦不拦在签发侧（`auth-service.issueTokens`）已经定了，
 * 手里只有 upgrade token 就是不能打业务接口（PRD §6.4-5-5 的开关边界）。
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const userId = requireUser(ctx);
  if (ctx.passwordUpgradeOnly === true) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy,
      cause: tmErrorCause(TM_ERROR_CODES.PASSWORD_UPGRADE_REQUIRED),
    });
  }
  return next({ ctx: { ...ctx, userId } });
});

/**
 * 门禁白名单侧的受保护过程（§4.7 ④ 写死的那三个）：仍然要求登录，
 * 但不因 upgrade token 而 403。**只允许 `trpc/routers/auth.ts` 的三个过程使用。**
 */
export const upgradeProtectedProcedure = t.procedure.use(({ ctx, next }) => {
  const userId = requireUser(ctx);
  return next({ ctx: { ...ctx, userId } });
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
