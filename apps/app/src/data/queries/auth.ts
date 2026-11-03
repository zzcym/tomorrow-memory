/**
 * 登录域数据层（T-19b / A-50 #129 授权面）：登录 / 注册 / 发码 / **强制改密**的 QueryOptions 工厂
 * 的唯一落点。后续 T-19d（普通改密 / SecurityScreen）一律 import 这一份；
 * 本文件头原句"改密面的 mutation 由需要它的那一轮再加"即指此：**T-19c 补的只有
 * `forceUpgradeMutationOptions()` 这一件**（`ForceUpgradeInputSchema`）；T-19d 已补上普通改密
 * `changePasswordMutationOptions()`（`ChangePasswordInputSchema`）——两条各只此一份、端点唯一。
 * 服务端出口：`packages/server/src/routes/auth.ts` 的 `POST /api/send-code`(:61) /
 * `POST /api/login`(:70) / `POST /api/register`(:82) / `PUT /api/password`(:104，普通改密，T-19d) /
 * `POST /api/password/force`(:125，强制改密，T-19c)。
 *
 * 三条规矩：
 *  1. **请求只经 `data/rest-fetcher.ts` 出门**（`apiPost` + `parseWith`，架构 §5.2）；
 *     本文件不碰 `fetch`、不碰任何存储、不写任何文案字面量（错误人话唯一在
 *     `@tm/shared` 的 `errors.ts`，取串走 `errorMessage()` / `apiErrorMessage()`）。
 *  2. **前三个接口全部 `handleAuthError: false`**（`rest-fetcher` 的 `RequestOptions` 预留位）：
 *     登录前界面没有"当前凭据"可言，401 若走单点登出就是把密码错当成凭据过期
 *     （`rest-fetcher.ts:157` 注释点名的就是这一支）。R-40④ 的"去改密页"**不是单点动作**，
 *     而是**登录屏的入口判定**（A-44 #84），由 `LoginScreen` 执行——本文件因此
 *     没有任何状态码 / 错误码分支，成不了第二份 401/403 处理。
 *     ⚠ 例外恰好两个，且都是"手握真凭据"的改密面：`forceUpgradeMutationOptions()`（T-19c，
 *     一次性 upgrade token）与 `changePasswordMutationOptions()`（T-19d，正常会话 token）
 *     **都沿用默认的 `handleAuthError`**——它们 401 就是"这次会话已失效"，
 *     必须让 `rest-fetcher` 的**单点**清凭据并跳登录（屏侧不写第二份处理）。
 *  3. **入参出参都收在 `@tm/shared` 契约上**：入参过 `LoginInputSchema` / `RegisterInputSchema` /
 *     `SendCodeInputSchema`（判定唯一份：手机号正则只有 `limits.ts` 的 `PHONE_PATTERN`，
 *     展示串只有契约里那两条 A-36-4① 不合并的 message）；`login` / `register` 的响应过
 *     `AuthResultSchema`（`.passthrough` ⇒ 服务端加可选键不打死 App；必填键漂了当场
 *     `BAD_RESPONSE`，§5.2"代价明示"）。登录面的 `password` 只有 `optional()`、
 *     不挂强度策略（A-36-3：存量弱密码必须能登进来才轮得到强制改密）。
 *
 * `send-code` **不 parse 响应**：本期通道未接（Q1），服务端按 `TM_ERRORS.SMS_NOT_CONFIGURED`
 * 的登记走 **200 附码**（旧 APK 收到不崩、不进倒计时，R-01⑥），响应体是 `{error, code}`
 * 错误形状——套 `OkResultSchema` 会把"通道未开通的既定结果"错报成"请求失败"。
 * UI 侧的就地反馈已由 `@tm/ui/auth/SmsCodeEntry` 单点承担（`AUTH_COPY.smsResult`）。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`。
 */

import type { UseMutationOptions } from '@tanstack/react-query';
import {
  AuthResultSchema,
  ChangePasswordInputSchema,
  ForceUpgradeInputSchema,
  LoginInputSchema,
  OkResultSchema,
  RegisterInputSchema,
  SendCodeInputSchema,
  type AuthResultDto,
  type ChangePasswordInputDto,
  type LoginInputDto,
  type RegisterInputDto,
} from '@tm/shared';
import { apiPost, apiPut, parseWith } from '../rest-fetcher.js';

/** queryKey 前缀（与 `wordbookKeys` / `lookupKeys` 同族命名；mutation 挂 key 便于测试与调试）。 */
export const authKeys = {
  all: ['auth'] as const,
  login: ['auth', 'login'] as const,
  register: ['auth', 'register'] as const,
  sendCode: ['auth', 'send-code'] as const,
  forceUpgrade: ['auth', 'force-upgrade'] as const,
  changePassword: ['auth', 'change-password'] as const,
};

/**
 * 发码入参（契约只导出了 schema `SendCodeInputSchema:79`、没有 DTO 类型别名；
 * 这里是**结构类型**逐字段对齐那条 schema——判定不复制，请求时仍过
 * `parseWith(SendCodeInputSchema)`，手机号合法性只有契约里那一份）。
 */
export interface SendCodeInputDto {
  phone: string;
}

/**
 * 登录（`POST /api/login`）。成功 / 失败都原样回到屏侧：
 * 成功 → `auth-store.signIn()`（判据② 的唯一落 token 路径）；
 * 失败 → `apiErrorMessage()` / 契约码由屏侧单点消化（屏不写状态码判定）。
 */
export function loginMutationOptions(): UseMutationOptions<AuthResultDto, Error, LoginInputDto> {
  return {
    mutationKey: authKeys.login,
    mutationFn: (input) =>
      apiPost<AuthResultDto>(
        '/api/login',
        parseWith(LoginInputSchema)(input),
        { handleAuthError: false },
        parseWith(AuthResultSchema),
      ),
  };
}

/**
 * 注册 = 激活（`POST /api/register`，R-39① 服务端单点裁决在客户端的镜像：屏侧不分两条路）。
 * `agreed` 只如实转发表单勾选（未勾的主按钮禁用由 `AuthFormShell` 判，判据⑨）。
 */
export function registerMutationOptions(): UseMutationOptions<AuthResultDto, Error, RegisterInputDto> {
  return {
    mutationKey: authKeys.register,
    mutationFn: (input) =>
      apiPost<AuthResultDto>(
        '/api/register',
        parseWith(RegisterInputSchema)(input),
        { handleAuthError: false },
        parseWith(AuthResultSchema),
      ),
  };
}

/**
 * 发验证码（`POST /api/send-code`，本期恒"通道未接"，见文件头第三条规矩下的说明）。
 * 响应不 parse（`unknown` 原样回给屏侧）；非 2xx（如 429 `TOO_MANY_REQUESTS`）照旧抛
 * `ApiError`，人话由屏侧走 `apiErrorMessage()` 单点。
 */
export function sendCodeMutationOptions(): UseMutationOptions<unknown, Error, SendCodeInputDto> {
  return {
    mutationKey: authKeys.sendCode,
    mutationFn: (input) =>
      apiPost<unknown>('/api/send-code', parseWith(SendCodeInputSchema)(input), {
        handleAuthError: false,
      }),
  };
}

/**
 * 强制改密入参（T-19c）。结构类型，**不是**契约的第四份形状：`upgradeToken` 只走 Header
 * （服务端 `middleware/auth.ts` 的 `auth()` 只认 `Authorization: Bearer`），三格密码才是表单值。
 * 与 Web 侧 `apps/web/src/app/upgrade-password/page.tsx:133` 的 D-1 注记同口径：
 * 冻结契约 `ForceUpgradeInputSchema` 不含 `oldPassword`，而服务端边界要求它 ⇒ 入参形状在这里补齐。
 */
export interface ForceUpgradeInput {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  /** 一次性 upgrade token（`aud='pw-upgrade'`）：由屏侧从 `lib/token-bridge.ts` 现取传入，本文件不读存储。 */
  upgradeToken: string;
}

/**
 * 强制改密（`POST /api/password/force`，R-40④ 的唯一出口）：
 * 用一次性 upgrade token 换**正常 30 天 token**。成功响应就是 `AuthResultSchema` 的形状，
 * 落地一律交回 `auth-store.afterPasswordChanged()`（本文件不写 token、不判状态码）。
 * 请求体过 `ForceUpgradeInputSchema`（强度判定只有契约那一份）后补 `oldPassword`，
 * 与 Web 侧 `forceUpgradeInput()` 逐字同形状。
 */
export function forceUpgradeMutationOptions(): UseMutationOptions<
  AuthResultDto,
  Error,
  ForceUpgradeInput
> {
  return {
    mutationKey: authKeys.forceUpgrade,
    mutationFn: ({ oldPassword, newPassword, confirmPassword, upgradeToken }) =>
      apiPost<AuthResultDto>(
        '/api/password/force',
        {
          ...parseWith(ForceUpgradeInputSchema)({ newPassword, confirmPassword, upgradeToken }),
          oldPassword,
        },
        { auth: true, bearer: upgradeToken },
        parseWith(AuthResultSchema),
      ),
  };
}

/**
 * 普通改密（`PUT /api/password`，R-40①②；止血阀 off 的软告知面也走这一条，`SecurityScreen` 的唯一提交）：
 * 已进门、手握正常 token 的自助改密。入参过 `ChangePasswordInputSchema`（`oldPassword` 必填 +
 * 新密码 ≥8 的强度判定都只有契约那一份），响应过 `OkResultSchema`（`{ok:true}`）——
 * **不回新 token**：服务端按 R-40③ 让旧 token 随即失效，屏侧据"成功即清凭据 + 落到重新登录话术链"处理，
 * 本文件不写 token、不判状态码（401 走 `rest-fetcher` 单点，见文件头第二条规矩）。
 * 与强制改密是**两个端点、两个工厂**，本屏不预写第三面。
 */
export function changePasswordMutationOptions(): UseMutationOptions<
  { ok: true },
  Error,
  ChangePasswordInputDto
> {
  return {
    mutationKey: authKeys.changePassword,
    mutationFn: (input) =>
      apiPut<{ ok: true }>(
        '/api/password',
        parseWith(ChangePasswordInputSchema)(input),
        { auth: true },
        parseWith(OkResultSchema),
      ),
  };
}
