/**
 * tRPC 域：auth（凭据域，T-07 落地）
 *
 * 与 REST `routes/auth.ts` **调同一批 service 函数**（R-39①"注册与激活同一个入参形状、
 * 同一个裁决点"），因此这里不写任何业务判断，只做：
 *  1. 入参用 `@tm/shared/contracts/auth.ts` 的冻结 schema（与 REST 逐字同一份）；
 *  2. 出参形状只加不改名（旧 Web/APK 读到的 `token/phone/hasPassword/nickname/avatar` 一字未动）；
 *  3. 把 service 抛出的凭据错误翻成 `TRPCError{ message: <人话>, data.code: <§4.6 码> }`，
 *     与 REST 的 `{error, code}` 同一文案、同一语义状态（判据⑥的"两协议 6 例"）。
 *
 * 门禁（R-40④）在 `trpc/init.ts`：默认所有受保护过程都过 `passwordUpgradeOnly` 这道门，
 * 本文件里只有 §4.7 白名单写死的三个（`me` / `logout` / `forceChangePassword`）
 * 用 `upgradeProtectedProcedure` 显式放行。
 */

import { TRPCError } from '@trpc/server';
import {
  ChangePasswordInputSchema,
  ForceUpgradeInputSchema,
  LoginInputSchema,
  PasswordSchema,
  RegisterInputSchema,
  SendCodeInputSchema,
  TM_ERROR_CODES,
  TM_ERRORS,
} from '@tm/shared';
import { credentialErrorBody, tmErrorCause } from '../../services/password-policy.js';
import {
  protectedProcedure,
  publicProcedure,
  router,
  upgradeProtectedProcedure,
  type TrpcContext,
} from '../init.js';

/** HTTP 状态 → tRPC 码（`data.code` 才是两端共用的那一个，tRPC 码只负责传输层语义）。 */
function trpcCodeOf(status: number): 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'METHOD_NOT_SUPPORTED' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'INTERNAL_SERVER_ERROR' {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_SUPPORTED';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

/** 凭据错误 → TRPCError；非凭据错误原样抛出（不得被兜底成 500 或"请求失败"）。 */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = credentialErrorBody(err);
    if (!mapped) throw err;
    throw new TRPCError({
      code: trpcCodeOf(mapped.status),
      message: mapped.body.error,
      // A-30-1：§4.6 码经 `cause` 传，由 `trpc/init.ts` 的唯一 errorFormatter 提升为 `data.code`
      // （`TRPCError` 不保存 `data`，直传是无效代码）。无 §4.6 码的凭据错误（登录不区分提示）
      // 保持 `cause: null` → 线上 `data.code` 仍是协议码，两端靠 `message` 人话分支。
      cause: mapped.body.code ? tmErrorCause(mapped.body.code) : null,
    });
  }
}

/** `ctx.auth` 由 `app.ts` 注入；未注入即装配错误，明确报出而不是静默放行。 */
function svc(ctx: TrpcContext) {
  if (!ctx.auth) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '凭据服务未装配（app.ts 未注入 auth-service）' });
  }
  return ctx.auth;
}

function meta(ctx: TrpcContext, headers?: Headers) {
  return { ip: ctx.clientIp, ua: headers?.get('user-agent') ?? undefined };
}

export const auth = router({
  /** R-01⑥：通道未接，返回体保留 `{ok:true}` 并附加 `SMS_NOT_CONFIGURED`；不落验证码、不启倒计时。 */
  sendCode: publicProcedure.input(SendCodeInputSchema).mutation(async ({ ctx, input }) =>
    call(() => svc(ctx).sendCode(input.phone, meta(ctx))),
  ),

  /**
   * R-01①③：手机号 + 密码登录（本期主路径）。
   * `LoginInputSchema.password` **只验"有没有给"、不验强度**（A-36-3 / DEFECT-3）：
   * 强度与"下次登录强制改密"的判定在 service 侧（`assertPasswordStrength` +
   * `requiresPasswordUpgrade`），这里挂 `min(8)` 会把存量短密码账号锁死在 zod 层。
   */
  login: publicProcedure.input(LoginInputSchema).mutation(async ({ ctx, input }) =>
    call(() =>
      svc(ctx).login({ phone: input.phone, password: input.password, code: input.code }, meta(ctx)),
    ),
  ),

  /** ★ R-39①：注册。与 `activate` 调同一个 service 函数，不是两条口子。 */
  register: publicProcedure.input(RegisterInputSchema).mutation(async ({ ctx, input }) =>
    call(() => svc(ctx).registerOrActivate(input, meta(ctx))),
  ),

  /**
   * ★ R-39⑤b：存量空密码账号"设密码即激活认领"（Q8' 定案）。
   * 与 `register` **同一个入参形状、同一个裁决点**（`registerOrActivate`），
   * 前端两个按钮打到同一个 service 出口，杜绝"注册/激活两套校验"的裂缝。
   */
  activate: publicProcedure.input(RegisterInputSchema).mutation(async ({ ctx, input }) =>
    call(() => svc(ctx).registerOrActivate(input, meta(ctx))),
  ),

  /**
   * R-40②：登录态改密（必验旧 + ≥8 位）。返回 `{ok:true}`，旧 token 随即失效（R-40③）。
   * ⚠ 用 `protectedProcedure`（受门禁）：§4.7 白名单里**没有** `auth.changePassword`，
   * 待升级会话只能走 `forceChangePassword`，不得从普通改密口绕过"写 `pw_policy_version=1`"之外的语义。
   */
  changePassword: protectedProcedure
    .input(ChangePasswordInputSchema)
    .mutation(async ({ ctx, input }) => call(() => svc(ctx).changePassword(ctx.userId, input, meta(ctx)))),

  /**
   * ★ R-40④：强制改密页唯一出口 —— upgrade token 换成正常 token 的**唯一**路径。
   * `ForceUpgradeInputSchema`（冻结）里没有 `oldPassword`，而 R-40④ 写死"旧密码（必填，走②）"，
   * 故在边界上 `extend` 补一个必填键（偏差 D-1，已登记给 TPM；上游 schema 一字未改）。
   */
  forceChangePassword: upgradeProtectedProcedure
    .input(ForceUpgradeInputSchema.extend({ oldPassword: PasswordSchema }))
    .mutation(async ({ ctx, input }) =>
      call(() =>
        svc(ctx).forceChangePassword(
          ctx.userId,
          {
            newPassword: input.newPassword,
            confirmPassword: input.confirmPassword,
            oldPassword: input.oldPassword,
          },
          meta(ctx),
        ),
      ),
    ),

  /** §4.7 ④ 白名单内：upgrade token 也能读自己（两端落地强制改密页前要拿到 `upgradeRequired`）。 */
  me: upgradeProtectedProcedure.query(async ({ ctx }) => call(() => svc(ctx).me(ctx.userId))),

  /**
   * ★ 登出（A-32-4）：**会话语义** —— 服务端不推进 `password_changed_at`，
   * 因此该账号别处（网页端 / 另一台设备）的 token 继续可用；App 侧清凭据是 R-39⑧ 的
   * `AndroidBridge.saveToken('')`，改密（R-40③）才是全量失效的那一个动作。
   * 在 §4.7 ④ 白名单内，供强制改密页的"退出登录"使用。响应恒 `{ok:true}`（`OkResultSchema`）。
   */
  logout: upgradeProtectedProcedure.mutation(async ({ ctx }) =>
    call(() => svc(ctx).logout(ctx.userId, meta(ctx))),
  ),
});

/** §4.6 码在两端错误提示上的唯一来源（给宿主组件传 `serverMessage` 用，T-16/T-19）。 */
export const AUTH_ERROR_CODES = TM_ERROR_CODES;
export const AUTH_ERROR_COPY = TM_ERRORS;
