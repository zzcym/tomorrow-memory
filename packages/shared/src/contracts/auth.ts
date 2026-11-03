/**
 * 凭据契约（§3.3.1 附注 + R-01①③⑤⑥ / R-39①②③⑩ / R-40①②③④）。
 *
 * 三条硬口径：
 *  1. **注册与激活同一个入参形状**（R-39①：`auth-service.registerOrActivate()` 单点裁决，
 *     REST 与 tRPC 同调），故这里只有一个 `RegisterInputSchema`，不存在 `ActivateInput` 第二形状；
 *  2. 出参新增键一律**可选 + 只加不改名**（`activated` / `upgrade_required` / `upgradeToken`）；
 *  3. 错误响应体是 `{error, code}`（§4.6），人话由 `constants/errors.ts` 单点提供，本文件不放**响应码文案**
 *     （A-36-4①：唯一的例外是下面两个入参校验的展示串具名常量 —— 它们是 zod 的展示参数，
 *     不是 §4.6 文案面，`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面一字不动）。
 */

import { z } from 'zod';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, PHONE_PATTERN } from '../constants/limits.js';
import { TmErrorResponseBodySchema } from '../constants/errors.js';

/**
 * 手机号校验失败的展示串（A-36-4①：两条**逐字还原**基线"改动前"指纹，不合并成一句）。
 * 出处 = `packages/server/test/trpc-shape.baseline.json` 的 `auth.login`（`:6011`，入参 phone message `:6042`）与
 * `auth.sendCode`（`:7663`，入参 phone message `:7678`）两段；两串语境不同（登录报格式、发码催输入），合并仍会打穿指纹。
 * ⚠ 码串 `INVALID_PHONE` 不再充当这里的 message（A-36-4②）；作为**码**它照旧走
 *    `constants/errors.ts:80` 的 `copy`（服务端 `tmAuthError('INVALID_PHONE')` 那一条路）。
 */
const PHONE_LOGIN_COPY = '手机号格式不正确';
/** 见 `PHONE_LOGIN_COPY` 的注释（发码面的那一条，基线 `auth.sendCode` 段逐字；A-58 #160：以符号名代易漂移的行号锚）。 */
const PHONE_SEND_CODE_COPY = '请输入正确的手机号';

/**
 * 手机号 schema 工厂（A-36-4③：判定只有一份）。
 * 正则只有 `limits.ts` 的 `PHONE_PATTERN`，message 只是**展示参数** ——
 * 任何面都不得再复制正则或复制第二份判定逻辑。
 */
const phoneSchema = (message: string): z.ZodString => z.string().regex(PHONE_PATTERN, message);

/** 手机号：11 位、`1[3-9]` 开头，不放宽（R-39②）。登录/注册/激活/改密面共用。 */
export const PhoneSchema = phoneSchema(PHONE_LOGIN_COPY);
/** 发码面的手机号 schema：同一个 `PHONE_PATTERN`，只有展示串不同（A-36-4①"两条不合并"）。 */
const SendCodePhoneSchema = phoneSchema(PHONE_SEND_CODE_COPY);

/** 密码：≥8 位、去首尾空格后 ≤72 字节（R-39② / R-40①）。字节数上限由服务端 `assertPasswordStrength` 复核。 */
export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX_BYTES);

/* ───────── 入参 ───────── */

/**
 * 登录（本期只有手机号 + 密码；`code` 分支保留形状但通道未接，R-01⑥）。
 *
 * ⚠ **登录面的 `password` 只有 `optional()`，不挂强度策略**（A-36-3 修 DEFECT-3）：
 * Q9' 定的是"弱密码**下次登录强制改密**"，这句话逻辑上要求存量短密码账号**能登进来**；
 * 在这里挂 `PasswordSchema` 的 `min(8)` 等于在 tRPC 面上把那批账号永久锁死，
 * `upgrade_required` 门禁根本轮不到它们。强度策略继续由服务端 `assertPasswordStrength`
 * 与 `password-policy.requiresPasswordUpgrade()` 承担；**建密码**的三面
 * （`RegisterInputSchema`/`ChangePasswordInputSchema`/`ForceUpgradeInputSchema`）
 * 仍引用同一个 `PasswordSchema`（R-39② 的 ≥8 管建密码，不管验密码）。
 *
 * ⚠ 键的**声明顺序**是 `phone → code → password`：zod 出参 `data` 的键序跟着 shape 走，
 * 基线 `auth.login` 的 `phoneEmptyStrings` 探针记的就是 `{phone, code, password}`
 * （`trpc-shape.baseline.json:6352-6360`）。写成 `phone → password → code` 会在
 * 快照面上多出 2 行纯键序差异（A-36 四-2 要求修完 `auth.login` = 0 行）。
 */
export const LoginInputSchema = z.object({
  phone: PhoneSchema,
  code: z.string().optional(),
  password: z.string().optional(),
});
export type LoginInputDto = z.infer<typeof LoginInputSchema>;

/** 注册 = 激活：同一个手机号有密码则拒绝、空密码则激活原账号（R-39③④ / Q8' 定案）。 */
export const RegisterInputSchema = z.object({
  phone: PhoneSchema,
  password: PasswordSchema,
  confirmPassword: PasswordSchema.optional(),
  /** 协议勾选（未勾 → `AGREEMENT_REQUIRED`，R-39③）。 */
  agreed: z.boolean().default(false),
});
export type RegisterInputDto = z.infer<typeof RegisterInputSchema>;

/** 发验证码（本期通道未接：成功形状仍为 `{ok:true}`，但实际恒回 `SMS_NOT_CONFIGURED`，R-01⑥）。 */
export const SendCodeInputSchema = z.object({ phone: SendCodePhoneSchema });

/** 改密（R-40②：必须验旧；空密码账号走 `NO_PASSWORD_ACCOUNT`，不得成为第二后门）。 */
export const ChangePasswordInputSchema = z.object({
  oldPassword: PasswordSchema,
  newPassword: PasswordSchema,
  confirmPassword: PasswordSchema.optional(),
});
export type ChangePasswordInputDto = z.infer<typeof ChangePasswordInputSchema>;

/** 强制改密（R-40④：只接受 `aud='pw-upgrade'` 的 upgradeToken 签发的会话）。 */
export const ForceUpgradeInputSchema = z.object({
  newPassword: PasswordSchema,
  confirmPassword: PasswordSchema.optional(),
  upgradeToken: z.string().optional(),
});
export type ForceUpgradeInputDto = z.infer<typeof ForceUpgradeInputSchema>;

/* ───────── 出参 ───────── */

/**
 * 统一登录/注册出参（草案字段口径）。
 * `upgrade_required=true` 时 `token` 恒为空串，凭 `upgradeToken` 只能打改密接口（R-40④）。
 */
export const AuthResultSchema = z
  .object({
    token: z.string(),
    phone: z.string().regex(PHONE_PATTERN),
    hasPassword: z.boolean(),
    nickname: z.string(),
    avatar: z.string(),
    /** true = 本次是"设密码即激活"路径（R-39⑤b）。 */
    activated: z.boolean().optional(),
    /** true = 命中强制改密门禁（R-40④）。 */
    upgrade_required: z.boolean().optional(),
    upgradeToken: z.string().optional(),
  })
  .passthrough();
export type AuthResultDto = z.infer<typeof AuthResultSchema>;

/** `GET /api/me` / `auth.me`：未登录时 401，登录后可读（R-01⑧ 的公告位用 `notice.ts`）。 */
export const MeResultSchema = z
  .object({
    user_id: z.number().int(),
    phone: z.string().regex(PHONE_PATTERN),
    nickname: z.string(),
    avatar: z.string(),
    daily_goal: z.number().int(),
    hasPassword: z.boolean(),
    pwPolicyVersion: z.number().int(),
    upgradeRequired: z.boolean().default(false),
  })
  .passthrough();
export type MeResultDto = z.infer<typeof MeResultSchema>;

/** 登出与"已发送"之外的布尔回执统一形状（禁止回 `ok` 与 `success` 两份）。 */
export const OkResultSchema = z.object({ ok: z.literal(true) });

/** 错误响应体（§4.6 约定：`error` 旧客户端可读、`code` 新增可选键）。 */
export const AuthErrorSchema = TmErrorResponseBodySchema;

/** 从任意错误 JSON 里取码（客户端"401 即清凭据"的单点判定用，T-14/T-16）。 */
export function errorCodeOf(value: unknown): string | undefined {
  const parsed = TmErrorResponseBodySchema.safeParse(value);
  return parsed.success ? parsed.data.code : undefined;
}
