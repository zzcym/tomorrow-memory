/**
 * 凭据域唯一业务出口（§4.4.1 / §4.7 / R-01 / R-39 / R-40）
 *
 * REST（`routes/auth.ts`）与 tRPC（`trpc/routers/auth.ts`）**必须**调本文件的同一函数，
 * 不得各写一份校验 —— R-39① 的"注册与激活同一个入参形状、同一个裁决点"就落在这里。
 *
 * ## 本文件承担的两条"极窄判定"（数据红线，PRD §6.4-6 的回滚判据指向这里）
 *
 *  1. **谁可以被写 `password` 列** —— 只有 `isEmptyPassword()` 为真（`password IS NULL OR trim=''`）
 *     的行才允许 `activateIfEmpty()` 的条件写；其余一切"手机号已存在"的情形只能回
 *     `PHONE_ALREADY_REGISTERED`，本函数在**任何写动作之前**就返回，`users/wordbooks/profiles`
 *     三表逐字段不变（§10.2 判据③ 用逐字段快照断言这件事）。
 *  2. **谁拿不到正常 token** —— 只有 `requiresPasswordUpgrade()`（`password` 非空
 *     且 `pw_policy_version = 0`）为真时不发正常 token。判定函数本体在
 *     `services/password-policy.ts`，全库只有那两处，本文件只做调用。
 *
 * ## 开关边界（PRD §6.4-5-5，防越权接线）
 * 待升级开关的键名**在本文件里只出现在 `issueTokens()` 里的那一行**（"是否发正常 token"
 * 那一个判断点）；出现第二行即 `boundaries.mjs --flags` 的 `enforce-flag-single-read` 变红。
 * 强度校验、验旧、吊销判定、激活分支的"仅空密码可写"四处**代码内不得读该开关**。
 */

import jwt from 'jsonwebtoken';
import {
  AUTH_COPY,
  NOTICE_LEGACY_APP_PASSWORD,
  TM_ERROR_CODES,
  TM_ERRORS,
  TOKEN_TTL_DAYS,
  UPGRADE_TOKEN_TTL_MINUTES,
  type AuthResultDto,
  type ChangePasswordInputDto,
  type MeResultDto,
  type RegisterInputDto,
  type TmErrorCode,
} from '@tm/shared';
import type { AppDB, UserCredentialRow } from '../db/types.js';
import { UPGRADE_AUDIENCE, invalidateRevocationCache } from '../middleware/auth.js';
import {
  checkActivateDailyLimit,
  checkCredentialEndpointLimit,
  checkRegisterDailyLimit,
  clearLoginFailures,
  isLoginLocked,
  isMasterCode,
  recordFailure,
} from './auth-policy.js';
import { AUDIT_ACTIONS, type AccountAuditService, type AuditMeta } from './account-audit.js';
import type { FeatureFlags } from './feature-flags.js';
import {
  PW_POLICY_VERSION,
  TmAuthError,
  TmPlainError,
  assertAgreed,
  assertConfirmMatches,
  assertNotSameAsOld,
  assertPasswordStrength,
  assertPhone,
  comparePassword,
  hashPassword,
  isEmptyPassword,
  requiresPasswordUpgrade,
} from './password-policy.js';
import type { SmsService } from './sms.js';

/** 调用方（REST / tRPC）一并传来的请求侧上下文。 */
export interface RequestMeta {
  ip: string;
  ua?: string;
}

/** `OkResultSchema` 的推导类型（shared 只导出了 schema，未导出同名 dto → 本层别名，形状逐字相同）。 */
export type OkResult = { ok: true };

export interface AuthServiceDeps {
  db: AppDB;
  flags: FeatureFlags;
  audit: AccountAuditService;
  sms: SmsService;
  jwtSecret: string;
  /** 时间注入点：集成用例用它验证 `password_changed_at` 的毫秒口径与吊销比较；生产不传。 */
  now?: () => number;
}

export type RegisterInput = RegisterInputDto;

export interface LoginInput {
  phone: string;
  password?: unknown;
  code?: unknown;
}

/**
 * 强制改密入参（R-40④ 明确"旧密码（必填，走②）"）。
 * `@tm/shared/contracts/auth.ts` 的 `ForceUpgradeInputSchema` 是**冻结**的上游契约、
 * 里面没有 `oldPassword` 键（偏差 D-1，需求已登记给 TPM）；本层在边界上把它补成必填，
 * 属"只增键"，不改上游 schema 一个字符。旧客户端不送 → `OLD_PASSWORD_REQUIRED`
 * （§6.2 / R-40⑩ 已裁：该场景旧 APK 转网页端，契约用例锁响应形状）。
 */
export interface ForceChangeInput {
  newPassword?: unknown;
  confirmPassword?: unknown;
  oldPassword?: unknown;
}

/** R-01⑥：`sendCode` 的返回形状 —— 原 `{ok:true}` 保留 + 附加可辨码（旧 APK 忽略新键即可）。 */
export interface SendCodeResult {
  ok: true;
  code: 'SMS_NOT_CONFIGURED';
  error: string;
}

export interface AuthService {
  /** R-39：注册 / 激活单点裁决（唯一三出口：新建、激活、拒绝）。 */
  registerOrActivate(input: RegisterInput, meta: RequestMeta): Promise<AuthResultDto>;
  /** R-01①③：手机号 + 密码登录（本期主路径）。 */
  login(input: LoginInput, meta: RequestMeta): Promise<AuthResultDto>;
  /** R-40①②：登录态改密，必验旧。 */
  changePassword(userId: number, input: ChangePasswordInputDto, meta: RequestMeta): Promise<OkResult>;
  /** R-40④：强制改密页唯一出口，成功才签发正常 token。 */
  forceChangePassword(userId: number, input: ForceChangeInput, meta: RequestMeta): Promise<AuthResultDto>;
  /** `GET /api/me` / `auth.me`：附加 `pwPolicyVersion` / `upgradeRequired` 供两端拦截。 */
  me(userId: number): Promise<MeResultDto>;
  /** R-01⑥：通道未接，恒回 `SMS_NOT_CONFIGURED`（200 附码，不落验证码、不启倒计时）。 */
  sendCode(phone: unknown, meta: RequestMeta): Promise<SendCodeResult>;
  /** 登出：只清该客户端凭据（会话语义），**不推进 `password_changed_at`**；审计记一条 `account_logout`（A-32-4）。 */
  logout(userId: number, meta: RequestMeta): Promise<OkResult>;
  /** 只读视图：该账号是否属于"待升级"人群（不读开关，只读凭据事实）。 */
  needsUpgrade(userId: number): Promise<boolean>;
}

/** §4.6 表内没有"登录凭据失败"这一行（A-8 锁死码集合）→ 只回人话，形状与旧版同构。 */
function wrongCredentialError(): TmPlainError {
  return new TmPlainError(AUTH_COPY.wrongCredential, 401);
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { db, flags, audit, sms, jwtSecret } = deps;
  const now = deps.now ?? (() => Date.now());

  /* ───────────────── token 签发（全库唯一出口） ───────────────── */

  /** 正常 30 天 token：claims 仍是 `{id}` + jsonwebtoken 自带的 `iat`，**不加不减不改名**（§6.3）。 */
  function signNormalToken(userId: number): string {
    return jwt.sign({ id: userId }, jwtSecret, { expiresIn: `${TOKEN_TTL_DAYS}d` });
  }

  /** upgrade token：`aud='pw-upgrade'`、TTL ≤30 分钟，只能打改密 / 退出 / 读自己（R-40④）。 */
  function signUpgradeToken(userId: number): string {
    return jwt.sign({ id: userId, aud: UPGRADE_AUDIENCE }, jwtSecret, {
      expiresIn: `${UPGRADE_TOKEN_TTL_MINUTES}m`,
    });
  }

  async function profilePart(userId: number): Promise<{ nickname: string; avatar: string; daily_goal: number }> {
    const profile = await db.profiles.get(userId);
    return {
      nickname: profile?.nickname ?? '',
      avatar: profile?.avatar ?? '',
      daily_goal: profile?.daily_goal ?? 0,
    };
  }

  /**
   * 唯一的 token 签发点（§4.7 ④）。返回体遵守"只加可选键"：
   *  - 待升级 + 开关 on  → `{token:'', upgrade_required:true, upgradeToken, message}`（**无正常 token**）
   *  - 待升级 + 开关 off → `{token:<正常>, upgrade_required:true, upgradeToken, message}`（顶部提示、不拦截）
   *  - 其余             → `{token:<正常>}`
   * `message` 供 R-40⑩ 的旧客户端直接显示（`NOTICE_LEGACY_APP_PASSWORD` 是唯一真相）。
   */
  async function issueTokens(
    row: UserCredentialRow,
    extra?: { activated?: boolean },
  ): Promise<AuthResultDto> {
    const profile = await profilePart(row.id);
    const hasPassword = !isEmptyPassword(row.password);
    const base = {
      phone: row.phone,
      hasPassword,
      ...profile,
      ...(extra?.activated ? { activated: true } : {}),
    };
    if (!requiresPasswordUpgrade(row)) {
      return { token: signNormalToken(row.id), ...base };
    }
    // ⚠ 全库唯一读取点（§4.7 开关边界 / PRD §6.4-5-5）。再加一处即 `boundaries.mjs --flags` 变红。
    const enforce = await flags.isOn('passwordUpgradeEnforce');
    const upgradePart = {
      upgrade_required: true as const,
      upgradeToken: signUpgradeToken(row.id),
      message: NOTICE_LEGACY_APP_PASSWORD,
    };
    if (enforce) {
      return { token: '', ...base, ...upgradePart };
    }
    return { token: signNormalToken(row.id), ...base, ...upgradePart };
  }

  /* ───────────────────────── 共用小工具 ───────────────────────── */

  function metaOf(m: RequestMeta): AuditMeta {
    return { ip: m.ip, ua: m.ua ?? null };
  }

  /** 审计写入：`account_audit_log` 失败不得掩盖业务结果，但必须留下可见痕迹（§4.7 审计行）。 */
  async function safeAudit(call: Parameters<AccountAuditService['record']>[0]): Promise<void> {
    try {
      await audit.record(call);
    } catch (err) {
      console.error('[account-audit] 写入失败（不改变业务结果，已登记）：', (err as Error).message);
    }
  }

  /* ───────────────────────── R-39 注册 / 激活 ───────────────────────── */

  /**
   * 三出口唯一（§10.2 判据③）：
   *  A. `password` 非空 → `PHONE_ALREADY_REGISTERED`（409），**本函数在此之前没有任何写**；
   *  B. `password` 为空 → `activateIfEmpty()` 单条条件写 → 赢家激活，输家退回 A 的响应；
   *  C. 无此手机号 → `createWithPassword()` 三表事务新建。
   * 校验（手机号 / 强度 / 二次确认 / 协议勾选）全部排在任何写动作之前（R-39②③）。
   */
  async function registerOrActivate(input: RegisterInput, meta: RequestMeta): Promise<AuthResultDto> {
    const phone = assertPhone(input.phone);
    const password = assertPasswordStrength(input.password);
    assertConfirmMatches(password, input.confirmPassword);
    assertAgreed(input.agreed);
    if (!checkCredentialEndpointLimit(meta.ip)) {
      throw new TmAuthError('TOO_MANY_REQUESTS');
    }

    const existing = await db.users.findCredentialsByPhone(phone);

    /* 出口 A：已设有密码 —— 冒领保护（R-01③ / R-39④），零写入 */
    if (existing && !isEmptyPassword(existing.password)) {
      await rejectedActivation(existing.id, phone, meta);
      throw new TmAuthError('PHONE_ALREADY_REGISTERED');
    }

    /* 出口 B：空密码历史账号 —— 设密码即激活认领（Q8' 定案，R-39⑤b） */
    if (existing) {
      if (!checkActivateDailyLimit(meta.ip)) {
        throw new TmAuthError('TOO_MANY_REQUESTS');
      }
      const written = await db.users.activateIfEmpty(existing.id, hashPassword(password), PW_POLICY_VERSION, now());
      if (!written) {
        // 并发下只有一个 changes===1 的赢家；输家与出口 A 同一响应，仍然零写入
        await rejectedActivation(existing.id, phone, meta);
        throw new TmAuthError('PHONE_ALREADY_REGISTERED');
      }
      await safeAudit({
        userId: existing.id,
        phone,
        action: AUDIT_ACTIONS.accountActivated,
        ok: true,
        meta: metaOf(meta),
        now: now(),
      });
      const after = await db.users.findCredentialsById(existing.id);
      if (!after) throw new TmAuthError('CREDENTIAL_EXPIRED');
      return issueTokens(after, { activated: true });
    }

    /* 出口 C：全新手机号 —— 手机号 + 密码注册（Q7 定案，R-39③） */
    if (!(await flags.isOn('passwordRegister'))) {
      throw new TmAuthError('REGISTER_CLOSED');
    }
    if (!checkRegisterDailyLimit(meta.ip)) {
      throw new TmAuthError('TOO_MANY_REQUESTS');
    }
    const userId = await db.users.createWithPassword(phone, hashPassword(password), PW_POLICY_VERSION, now());
    await safeAudit({
      userId,
      phone,
      action: AUDIT_ACTIONS.accountRegistered,
      ok: true,
      meta: metaOf(meta),
      now: now(),
    });
    const created = await db.users.findCredentialsById(userId);
    if (!created) throw new TmAuthError('CREDENTIAL_EXPIRED');
    return issueTokens(created);
  }

  async function rejectedActivation(userId: number, phone: string, meta: RequestMeta): Promise<void> {
    await safeAudit({
      userId,
      phone,
      action: AUDIT_ACTIONS.registerRejected,
      ok: false,
      code: 'PHONE_ALREADY_REGISTERED' as TmErrorCode,
      meta: metaOf(meta),
      now: now(),
    });
  }

  /* ───────────────────────── R-01 登录 ───────────────────────── */

  async function login(input: LoginInput, meta: RequestMeta): Promise<AuthResultDto> {
    const phone = assertPhone(input.phone);
    if (!checkCredentialEndpointLimit(meta.ip)) {
      throw new TmAuthError('TOO_MANY_REQUESTS');
    }
    if (isLoginLocked(phone)) {
      throw new TmAuthError('TEMP_LOCKED');
    }
    const row = await db.users.findCredentialsByPhone(phone);

    const password = typeof input.password === 'string' ? input.password : '';
    if (password) {
      /* R-01③：空密码账号拿任意密码走密码登录 → 专属码，**不签发 token、不写 password** */
      if (row && isEmptyPassword(row.password)) {
        await safeAudit({
          userId: row.id,
          phone,
          action: AUDIT_ACTIONS.loginNoPasswordAccount,
          ok: false,
          code: 'NO_PASSWORD_ACCOUNT' as TmErrorCode,
          meta: metaOf(meta),
          now: now(),
        });
        throw new TmAuthError('NO_PASSWORD_ACCOUNT');
      }
      if (!row || !comparePassword(password, row.password ?? '')) {
        // 不区分"账号不存在"与"密码错"（R-23④ 防账号枚举）；计入现有失败锁
        recordFailure(phone);
        throw wrongCredentialError();
      }
      clearLoginFailures(phone);
      return issueTokens(row);
    }

    /* 验证码分支：形状保留、通道未接（R-01⑥）。生产环境里没有真实送达，
       只有非生产显式配置 AUTH_DEV_MASTER_CODE 才进得来（R-01⑨）；本分支**不写 `password` 列**。
       两条人话沿用旧版 `routes/auth.ts` 的字面，属旧客户端契约面（收紧需求已登记给 TPM）。 */
    const code = typeof input.code === 'string' ? input.code : '';
    if (!code) throw new TmPlainError('请输入验证码', 400);
    if (!isMasterCode(code)) {
      if (!sms.verifyCode(phone, code)) {
        recordFailure(phone);
        throw new TmPlainError('验证码错误或已过期', 401);
      }
      sms.consumeCode(phone);
    }
    clearLoginFailures(phone);
    if (row) return issueTokens(row);
    const createdId = await db.createUser(phone, now());
    const created = await db.users.findCredentialsById(createdId);
    if (!created) throw new TmAuthError('CREDENTIAL_EXPIRED');
    return issueTokens(created);
  }

  /* ───────────────────────── R-40①② 改密 ───────────────────────── */

  /** 验旧；不匹配计入现有失败锁（5 次/10 分钟语义不回退，R-40②）。 */
  async function assertOldPasswordMatches(row: UserCredentialRow, oldPassword: unknown, meta: RequestMeta): Promise<void> {
    const old = typeof oldPassword === 'string' ? oldPassword : '';
    if (!old.trim()) throw new TmAuthError('OLD_PASSWORD_REQUIRED');
    if (!comparePassword(old, row.password ?? '')) {
      recordFailure(row.phone);
      await safeAudit({
        userId: row.id,
        phone: row.phone,
        action: AUDIT_ACTIONS.passwordChanged,
        ok: false,
        code: 'OLD_PASSWORD_INCORRECT' as TmErrorCode,
        meta: metaOf(meta),
        now: now(),
      });
      throw new TmAuthError('OLD_PASSWORD_INCORRECT');
    }
  }

  /** 改密 / 强制改密共用的前置裁决（两处必须是同一份判定，R-40①② 的"同一校验函数"口径）。 */
  async function preparePasswordChange(
    userId: number,
    input: { newPassword?: unknown; confirmPassword?: unknown; oldPassword?: unknown },
    meta: RequestMeta,
  ): Promise<{ row: UserCredentialRow; newPassword: string }> {
    const row = await db.users.findCredentialsById(userId);
    if (!row) throw new TmAuthError('CREDENTIAL_EXPIRED');
    if (isEmptyPassword(row.password)) {
      // 改密口不得成为空密码账号的第二后门（R-40②）；它的唯一出口是 R-39⑤b 激活
      throw new TmAuthError('NO_PASSWORD_ACCOUNT');
    }
    const newPassword = assertPasswordStrength(input.newPassword);
    assertConfirmMatches(newPassword, input.confirmPassword);
    await assertOldPasswordMatches(row, input.oldPassword, meta);
    assertNotSameAsOld(newPassword, row.password ?? '');
    return { row, newPassword };
  }

  async function changePassword(
    userId: number,
    input: ChangePasswordInputDto,
    meta: RequestMeta,
  ): Promise<OkResult> {
    const { row, newPassword } = await preparePasswordChange(userId, input, meta);
    await db.users.setPassword(row.id, hashPassword(newPassword), PW_POLICY_VERSION, now());
    invalidateRevocationCache(row.id);
    clearLoginFailures(row.phone);
    await safeAudit({
      userId: row.id,
      phone: row.phone,
      action: AUDIT_ACTIONS.passwordChanged,
      ok: true,
      meta: metaOf(meta),
      now: now(),
    });
    return { ok: true };
  }

  /* ───────────────────────── R-40④ 强制改密 ───────────────────────── */

  /**
   * 只有这条路径能把 upgrade token 换成正常 token（§4.7 ④ 末句）。
   * 判定不读开关：拦不拦发生在 `issueTokens`，这里只负责"改密成功 → 写 1 → 发正常 token"。
   */
  async function forceChangePassword(
    userId: number,
    input: ForceChangeInput,
    meta: RequestMeta,
  ): Promise<AuthResultDto> {
    const { row, newPassword } = await preparePasswordChange(userId, input, meta);
    await db.users.setPassword(row.id, hashPassword(newPassword), PW_POLICY_VERSION, now());
    invalidateRevocationCache(row.id);
    clearLoginFailures(row.phone);
    await safeAudit({
      userId: row.id,
      phone: row.phone,
      action: AUDIT_ACTIONS.passwordUpgraded,
      ok: true,
      meta: metaOf(meta),
      now: now(),
    });
    const after = await db.users.findCredentialsById(row.id);
    if (!after) throw new TmAuthError('CREDENTIAL_EXPIRED');
    return issueTokens(after);
  }

  /* ───────────────────────── 其余端点 ───────────────────────── */

  async function me(userId: number): Promise<MeResultDto> {
    const row = await db.users.findCredentialsById(userId);
    if (!row) throw new TmAuthError('CREDENTIAL_EXPIRED');
    const profile = await profilePart(userId);
    return {
      user_id: row.id,
      phone: row.phone,
      nickname: profile.nickname,
      avatar: profile.avatar,
      daily_goal: profile.daily_goal,
      hasPassword: !isEmptyPassword(row.password),
      pwPolicyVersion: row.pw_policy_version,
      /** 事实位（不读开关）：两端在 `token` 为空时落地强制改密页，开关 off 时只做顶部提示。 */
      upgradeRequired: requiresPasswordUpgrade(row),
    };
  }

  /**
   * R-01⑥：通道未接。**不落验证码、不启动 60 秒倒计时**，响应 200 + 固定码，
   * 旧 APK 收到该码按现有错误提示路径显示、不进倒计时（契约用例 `legacy-apk.spec.ts` 锁形状）。
   * `services/sms.ts` 的 `sendSMS` 桩不在本任务可写清单内（R-01⑦ 的需求已登记给 TPM），
   * 本层因此**完全不调用它** —— 也就无从产生"已发送"的假成功。
   */
  async function sendCode(phone: unknown, meta: RequestMeta): Promise<SendCodeResult> {
    assertPhone(phone);
    await Promise.resolve(meta);
    return {
      ok: true,
      code: TM_ERROR_CODES.SMS_NOT_CONFIGURED,
      error: TM_ERRORS.SMS_NOT_CONFIGURED.copy,
    };
  }

  /**
   * 登出 = **会话语义**，不是安全语义（A-32-4）。
   *
   * PRD 只在 R-40③ 对"**改密**"要求"此前签发的全部 token 作废"；R-40 的吊销是安全动作，
   * 登出只是"这台设备不再持有凭据"（R-39⑧：App 侧 `AndroidBridge.saveToken('')`）。
   * 因此本函数**不推进 `password_changed_at`**（也不碰 `password` 列）：
   * 手机上退出登录，网页端那枚 30 天 token 必须继续可用 —— 否则多端用户会误判"账号被盗"。
   * §4.7 ④ 把 `auth.logout` / `POST /api/logout` 放进强制改密白名单，只是为了让
   * upgrade token 也有一条"退出"出口（R-40④ 的不可关闭页需要它），不改变这里的语义。
   *
   * 服务端仍然留痕：`account_audit_log` 记一条 `account_logout`（§4.5 / §8.3-D 对账口径），
   * 该账号是否"需要立刻全网失效"由改密口决定，与登出无关。
   */
  async function logout(userId: number, meta: RequestMeta): Promise<OkResult> {
    const row = await db.users.findCredentialsById(userId);
    if (row) {
      await safeAudit({
        userId: row.id,
        phone: row.phone,
        action: AUDIT_ACTIONS.accountLogout,
        ok: true,
        meta: metaOf(meta),
        now: now(),
      });
      return { ok: true };
    }
    await Promise.resolve(meta);
    return { ok: true };
  }

  async function needsUpgrade(userId: number): Promise<boolean> {
    const row = await db.users.findCredentialsById(userId);
    return row ? requiresPasswordUpgrade(row) : false;
  }

  return {
    registerOrActivate,
    login,
    changePassword,
    forceChangePassword,
    me,
    sendCode,
    logout,
    needsUpgrade,
  };
}
