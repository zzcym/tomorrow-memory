/**
 * 凭据域的**纯**投影层（T-16 / 🆕`lib/api/auth.ts`）。
 *
 * 为什么是纯函数文件而不是"请求层"：A-30-4 的 `--web` 门禁把 `lib/api/**` 划进首页传输面，
 * 与 `(user)/page.tsx` + `components/home/**` 共用同一张禁列（`fetch(` / `XMLHttpRequest` / `axios`
 * **另加 `localStorage`**）。所以本文件既不发请求也不读存储：
 *  - 传输唯一走 `@/lib/trpc`（`login-dialog.tsx` / `upgrade-password` 页里用 `useMutation`）；
 *  - 存储唯一走 `@/lib/auth`（键名与门禁标志位都只在那里）。
 * 本文件只做四件纯计算：**取码 → 查表 → 决定客户端动作 → 组装请求体**。
 *
 * 取码口径（R-40③④ / §4.6 / A-30-1）：服务端 `trpc/init.ts` 的唯一 `errorFormatter` 已把
 * §4.6 的码提升为 `error.data.code`（未知码保持协议自带的 tRPC 码），REST 面是 `{error, code}`，
 * 两条面都收敛到 `TM_ERRORS` / `TM_ERRORS_SUPPLEMENT` 两张表 ⇒ **不猜字符串、不看 message**。
 * "该不该清凭据、该去哪一页"由 `errors.ts` 的 `clientAction` 字段决定（单一源），
 * 本文件不写第二张码→动作的表。
 */

import {
  TM_ERRORS,
  errorCodeOf,
  errorMessage,
  isTmErrorCode,
  type ForceUpgradeInputDto,
  type LoginInputDto,
  type RegisterInputDto,
} from '@tm/shared';
import type { PasswordChangeValues } from '@tm/ui';

/**
 * 强制改密页的路径（判据⑦：`app/upgrade-password/page.tsx`）。
 * 单点声明，`providers.tsx`（403 单点跳转）、`upgrade-gate.tsx`（标志位命中后的落地）、
 * `upgrade-password/page.tsx`（改密成功回原页时的自我判定）三处引同一串，不留第二份字面量。
 */
export const UPGRADE_PATH = '/upgrade-password';

/**
 * 普通改密页的路径（`app/(user)/profile/security/page.tsx`）。I-09② 的登录告知把「改密入口」
 * 指向这里，按本文件既有口径（`UPGRADE_PATH`/`ABOUT_PATH`）单点声明，宿主不另打一份字面量。
 */
export const SECURITY_PATH = '/profile/security';

/**
 * 「关于」页路径（判据⑧：`app/(user)/about/page.tsx`，本任务 owner）。
 * 协议勾选行的两个书名（`AgreementCheckbox` 的 `onOpenTerms/onOpenPrivacy`）目前只有这一处落点：
 * shared 里**没有**《用户协议》《隐私政策》的正文常量（已登记为缺口，见 T-16 报告 §5），
 * 故弹窗里的两个书名先指到本任务名下、未登录也可读的「关于」页（那里逐字呈现 §6.6-4 五条告知 + 两条承诺），
 * 待 shared 补正文常量后再由本任务改成独立静态页。
 */
export const ABOUT_PATH = '/about';

/** tRPC/REST 两条面共用的错误形状（只声明本文件真正读到的那两处，不复制 `TRPCClientError` 全形状）。 */
interface ErrorLike {
  message?: unknown;
  data?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/**
 * 单点取码：`error.data.code`（tRPC，A-30-1 提升后的 §4.6 码）优先，
 * 再退到 `errorCodeOf()`（REST 的 `{error, code}` 响应体），取不到就是"无码错误"。
 */
export function tmCodeOf(error: unknown): string | undefined {
  const data = asRecord((error as ErrorLike | null)?.data);
  const fromData = typeof data?.code === 'string' ? data.code : undefined;
  if (fromData) return fromData;
  return errorCodeOf(error) ?? errorCodeOf(data ?? undefined);
}

/** 有码且码在两张表里 ⇒ 用人话；无码 ⇒ 服务端给的 `message`（旧客户端可读面）；都没有 ⇒ `undefined`。 */
export function humanMessageOf(error: unknown): string | undefined {
  const code = tmCodeOf(error);
  if (code && isTmErrorCode(code)) return errorMessage(code);
  const message = (error as ErrorLike | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message : undefined;
}

const httpStatusOf = (error: unknown): number | undefined => {
  const data = asRecord((error as ErrorLike | null)?.data);
  return typeof data?.httpStatus === 'number' ? data.httpStatus : undefined;
};

/** 码 → 客户端动作（`errors.ts` 的 `clientAction` 是唯一表源，本文件只搬运不新增）。 */
export type CredentialAction = NonNullable<(typeof TM_ERRORS)[keyof typeof TM_ERRORS]['clientAction']>;

export function credentialActionOf(error: unknown): CredentialAction | undefined {
  const code = tmCodeOf(error);
  if (!code || !isTmErrorCode(code)) return undefined;
  return TM_ERRORS[code].clientAction;
}

/**
 * 401 单点的判定（判据⑥）：`CREDENTIAL_EXPIRED` ⇒ 清本地凭据 + 进登录。
 * 只认码，不认 "401" —— `NO_PASSWORD_ACCOUNT` 与密码错误也是 401，
 * 那两条属于弹窗内的分支（判据⑤），**清了凭据就是把用户踢出登录流程**。
 */
export function isCredentialExpired(error: unknown): boolean {
  return credentialActionOf(error) === 'clear-credential-and-login';
}

/** 403 `PASSWORD_UPGRADE_REQUIRED`（判据⑦：命中门禁时入口显示"请先修改密码"）。 */
export function isUpgradeRequiredError(error: unknown): boolean {
  return credentialActionOf(error) === 'goto-upgrade-password';
}

/** `NO_PASSWORD_ACCOUNT`（只在密码登录分支出现，R-01③④）。 */
export function isNoPasswordAccount(error: unknown): boolean {
  return tmCodeOf(error) === 'NO_PASSWORD_ACCOUNT';
}

/**
 * 未注册 / 密码错：服务端**故意**不给可辨码（`auth-service.ts:133` 的 `wrongCredentialError()`
 * 只回 `AUTH_COPY.wrongCredential` + 401，防账号枚举），所以这一支只能按
 * "401 且没有任何 §4.6 码"判定；命中后弹窗给 R-23④ 的"这个手机号还没注册，点这里注册"提示。
 */
export function isWrongCredential(error: unknown): boolean {
  return httpStatusOf(error) === 401 && tmCodeOf(error) === undefined;
}

/** 未勾协议（判据⑨）：主按钮由 `AuthFormShell` 自己禁用，这里只认服务端回码。 */
export function isAgreementRequired(error: unknown): boolean {
  return tmCodeOf(error) === 'AGREEMENT_REQUIRED';
}

/**
 * 该次调用该挂哪把钥匙：**纯函数**，两把 token 由调用方（`providers.tsx`）从 `lib/auth.ts` 读进来。
 * 正常凭据优先；只有在**门禁标志位置起且没有正常凭据**（= R-40④ 的待升级会话）时才挂 upgrade token ——
 * 业务接口收到它必然回 403 `PASSWORD_UPGRADE_REQUIRED`，那是服务端设计好的路径，
 * 客户端不拿"白名单预筛"去替它做主（`upgradeProtectedProcedure` 的白名单在服务端只有一份）。
 */
export function bearerFor(tokens: { normal: string | null; upgrade: string | null; gated: boolean }): string | null {
  if (tokens.normal) return tokens.normal;
  return tokens.gated ? tokens.upgrade : null;
}

/* ───────── 请求体组装：三条入参都只有一个出口，避免"第二套字段名"（C-09 同因） ───────── */

/** 登录入参：本期只有手机号 + 密码，**永不带 `code`**（R-01⑤⑥：验证码入口不进这条路径）。 */
export function loginInput(phone: string, password: string): LoginInputDto {
  return { phone, password };
}

/** 注册 = 激活：同一个入参形状（R-39①），`agreed` 由表单勾选决定（R-39②）。 */
export function registerInput(
  phone: string,
  password: string,
  confirmPassword: string,
  agreed: boolean,
): RegisterInputDto {
  return { phone, password, confirmPassword, agreed };
}

/**
 * 强制改密入参（R-40④）：`ForceUpgradeInputSchema` 冻结面里没有 `oldPassword`，
 * 服务端在边界上 `.extend({ oldPassword })`（偏差 **D-1**，已登记 TPM），
 * 客户端按同一形状送，`upgradeToken` 一并带上（R-40④ 只认 `aud='pw-upgrade'` 的会话）。
 */
export function forceUpgradeInput(values: PasswordChangeValues, upgradeToken: string | null): ForceUpgradeInputDto {
  return {
    newPassword: values.newPassword,
    confirmPassword: values.confirmPassword,
    ...(upgradeToken ? { upgradeToken } : {}),
  };
}
