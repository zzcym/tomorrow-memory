/**
 * 凭据策略（R-39② / R-40①②④⑧ 的唯一校验实现）
 *
 * 本文件承担三件事，且**只做这三件事**：
 *  1. `assertPasswordStrength()` —— 全库唯一的密码强度校验函数（注册 / 激活 / 两处改密 / 强制改密共用，C-09）；
 *  2. §4.7 要求的**两处极窄判定条件**（`isEmptyPassword` / `requiresPasswordUpgrade`）；
 *  3. `TmAuthError` —— 凭据域的错误载体，`code` 取自 `@tm/shared/constants/errors`，文案不在这里写。
 *
 * ⚠ 开关边界（PRD §6.4-5-5）：本文件**不得读取任何运行时开关**。
 * ≥8 位强度、改密验旧、`password_changed_at` 吊销、"仅空密码可写"四条核心
 * 没有任何开关可以把它们关掉；`passwordUpgradeEnforce` 只管"拦不拦"，其唯一读取点在
 * `auth-service.issueTokens()`。
 */

import bcrypt from 'bcryptjs';
import {
  BCRYPT_ROUNDS,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  PHONE_PATTERN,
  TM_ERRORS,
  type TmErrorCode,
} from '@tm/shared';
import type { UserCredentialRow } from '../db/types.js';

/* ─────────────────────────── 错误载体 ─────────────────────────── */

/**
 * 凭据域统一错误。REST 侧由 `tmErrorResponse()` 翻成 `{error,code}` + 表内 HTTP 状态，
 * tRPC 侧翻成 `TRPCError({ code:'BAD_REQUEST'|…, message: <人话>, cause: <code> })`，
 * 两端同码同文案（R-39①"三出口 × 两协议共 6 例"的前提）。
 */
export class TmAuthError extends Error {
  readonly tmCode: TmErrorCode;
  readonly status: number;

  constructor(code: TmErrorCode, cause?: unknown) {
    super(TM_ERRORS[code].copy, cause === undefined ? undefined : { cause });
    this.name = 'TmAuthError';
    this.tmCode = code;
    this.status = TM_ERRORS[code].http;
  }
}

export function isTmAuthError(err: unknown): err is TmAuthError {
  return err instanceof TmAuthError || (typeof err === 'object' && err !== null && 'tmCode' in err
    && typeof (err as TmAuthError).status === 'number');
}

/**
 * **无 §4.6 码**的凭据错误载体（§4.6 表只有那 16 行 / 18 个码，A-8 与 T-03 修复轮 3
 * 已明确驳回"补一个新码"的做法）。响应体退回到只带 `error` 人话的形状
 * —— 这与旧版 `POST /api/login` 的失败形状逐字同构（旧 APK 读 `error` 即可，不崩）。
 *
 * 唯一使用场景：登录时"手机号不存在 / 密码不匹配"合并成的那一条不区分提示（R-23④ 防账号枚举）。
 */
export class TmPlainError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'TmPlainError';
    this.status = status;
  }
}

export function isTmPlainError(err: unknown): err is TmPlainError {
  return err instanceof TmPlainError
    || (typeof err === 'object' && err !== null && err.constructor?.name === 'TmPlainError'
      && typeof (err as TmPlainError).status === 'number' && !('tmCode' in err));
}

/**
 * tRPC 侧 `cause` 的约定载荷（A-30-1）。
 *
 * `@trpc/server@11.18` 的 `TRPCErrorOptions` 只有 `message`/`code`/`cause` 三个键，
 * `new TRPCError({ data })` 里的 `data` 在构造时被**静默丢弃**（`error/TRPCError.ts` 只
 * `super(message, {cause})` + `this.code=`）—— 直传 `data` 是无效代码（假绿的一种）。
 * 因此各门面一律经 `cause` 把 §4.6 码与 HTTP 状态带上，由 `trpc/init.ts` 里**唯一一个**
 * `errorFormatter` 提升为线上形状的 `data.{code,httpStatus}`。取码只走本函数这一处，
 * `httpStatus` 因此恒等于 §4.6 表里的那个数，不再依赖 tRPC 的"协议码 → HTTP"映射。
 */
export interface TmErrorCause {
  tmCode: TmErrorCode;
  httpStatus: number;
}

/** 由 §4.6 码构造 `TRPCError` 的 `cause` 载荷（REST 与 tRPC 共用同一条真相）。 */
export function tmErrorCause(code: TmErrorCode): TmErrorCause {
  return { tmCode: code, httpStatus: TM_ERRORS[code].http };
}

/**
 * 凭据错误 → HTTP 响应体（REST 与 tRPC 共用同一取法，保证两端逐字一致）。
 * 返回 `null` = 这不是凭据域的错误，调用方**必须原样抛出**（不得降级成 500，也不得吞成"请求失败"）。
 */
export function credentialErrorBody(
  err: unknown,
): { status: number; body: { error: string; code?: TmErrorCode } } | null {
  if (isTmAuthError(err)) {
    return { status: err.status, body: { error: err.message, code: err.tmCode } };
  }
  if (isTmPlainError(err)) {
    return { status: err.status, body: { error: err.message } };
  }
  return null;
}

/** 抛出凭据错误（写成函数以便调用处 `throw tmAuthError(...)` 保持单行、便于 typecheck 收窄）。 */
export function tmAuthError(code: TmErrorCode): TmAuthError {
  return new TmAuthError(code);
}

/* ───────────────────────── 强度校验（唯一入口） ───────────────────────── */

const encoder = new TextEncoder();

/** R-39②：手机号 11 位、`1[3-9]` 开头，不放宽。 */
export function assertPhone(phone: unknown): string {
  if (typeof phone !== 'string' || !PHONE_PATTERN.test(phone.trim())) {
    throw tmAuthError('INVALID_PHONE');
  }
  return phone.trim();
}

/**
 * R-39② / R-40①：去首尾空格后 ≥8 位、≤72 字节（bcrypt 边界按 UTF-8 字节数计，
 * 与 `PASSWORD_MAX`（字符数，UI 侧）各表其义 —— A-23-6）。
 * 7 位 → `WEAK_PASSWORD`；含全角字符凑够 8 位但超 72 字节同样 `WEAK_PASSWORD`。
 */
export function assertPasswordStrength(raw: unknown): string {
  if (typeof raw !== 'string') throw tmAuthError('WEAK_PASSWORD');
  const password = raw.trim();
  if (password.length < PASSWORD_MIN) throw tmAuthError('WEAK_PASSWORD');
  if (encoder.encode(password).length > PASSWORD_MAX_BYTES) throw tmAuthError('WEAK_PASSWORD');
  return password;
}

/** R-39②：`confirmPassword` 提供时必须逐字符相等（未提供时由服务端自身校验兜底，不视为不一致）。 */
export function assertConfirmMatches(password: string, confirm: unknown): void {
  if (confirm === undefined || confirm === null) return;
  if (typeof confirm !== 'string' || confirm !== password) throw tmAuthError('PASSWORD_MISMATCH');
}

/** R-39② / §8.3-D-4：协议勾选必须为 true。 */
export function assertAgreed(agreed: unknown): void {
  if (agreed !== true) throw tmAuthError('AGREEMENT_REQUIRED');
}

/* ───────────────────────── bcrypt（cost 固定 10） ───────────────────────── */

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function comparePassword(password: string, hash: string): boolean {
  if (typeof hash !== 'string' || hash.trim() === '') return false;
  return bcrypt.compareSync(password, hash);
}

/* ══════════════ §4.7 的两处极窄判定条件（本期唯一破坏性变更的命门） ══════════════ */

/**
 * **判定条件 ②（写 `password` 的唯一前提）**：
 * 口径固定为 `password IS NULL OR trim(password) = ''`，与 DB 层 `EMPTY_PASSWORD_SQL` 逐字同义。
 * 除此之外的任何手机号都不得进入写 `password` 的分支（R-39④ / §6.6-3）。
 */
export function isEmptyPassword(password: string | null | undefined): boolean {
  return password === null || password === undefined || password.trim() === '';
}

/**
 * **判定条件 ①（不发正常 token 的唯一前提）**：
 * `password` 非空 **且** `pw_policy_version` 恰为 `0`。
 *
 * 两个条件缺一不可，且都是**精确**比较：
 *  - 空密码账号**永不**命中本判定（它的出路是 R-39⑤b 激活，激活即写 1，不会落强制改密页）；
 *  - `pw_policy_version >= 1` 的账号永不命中（含本期新建 / 刚激活 / 已改密的号），
 *    误伤它们即触发 PRD §6.4-6 回滚判据。
 */
export function requiresPasswordUpgrade(row: Pick<UserCredentialRow, 'password' | 'pw_policy_version'>): boolean {
  return !isEmptyPassword(row.password) && row.pw_policy_version === 0;
}

/** R-40①：新密码与旧密码相同 → `PASSWORD_SAME_AS_OLD`（先验旧密码通过后才调用）。 */
export function assertNotSameAsOld(newPassword: string, oldHash: string): void {
  if (comparePassword(newPassword, oldHash)) throw tmAuthError('PASSWORD_SAME_AS_OLD');
}

/** 策略版本常量：本期设过的密码一律记 1（DB 层不自行定义，见 `createWithPassword` 注释）。 */
export const PW_POLICY_VERSION = 1;

/* ───────────────────────── 审计辅助（不落任何凭据） ───────────────────────── */

/** §6.6-2 / R-39⑤b：审计只留手机号后 4 位。 */
export function maskPhoneTail(phone: string): string {
  return typeof phone === 'string' && phone.length >= 4 ? phone.slice(-4) : '';
}
