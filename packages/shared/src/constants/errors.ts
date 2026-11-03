/**
 * 错误码 ↔ 人话文案的**唯一真相**（§4.6，两端 + App 共用；T-13 判据④ 要求表单错误全部 import 自本文件）。
 *
 * 统一约定（§4.6 末段）：错误响应体恒为 `{ error: <人话>, code: <本表键> }`
 * —— `error` 保留旧客户端可读性，`code` 是新增可选键（旧 APK 忽略即可）。
 * **任何 P0 路径都不得返回 500 或机器话兜底串**（`tools/boundaries.mjs --copy` + 契约测试断言）。
 *
 * 覆盖 §4.6 表格全部 16 行（含两行合并写法，实际 18 个码），每条带中文文案 = 完成判据②。
 */

import { z } from 'zod';

/* A-28-4：补充码的文案一律由取值域常量组装（数字域/档位名/模式名/上限都不写死第二份），
 * 所以本文件依赖 limits.ts 与 rating.ts。二者都不 import 本文件 ⇒ 无环。 */
import { UNDO_MAX_PER_SESSION, WORD_MAX_LENGTH, RATING_VALUES } from './limits.js';
import { MODE_LABELS, MODE_VALUES, RATING_LABELS } from './rating.js';

/* ───────── 16 个码的键 ───────── */

export const TM_ERROR_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
  AGREEMENT_REQUIRED: 'AGREEMENT_REQUIRED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  NO_PASSWORD_ACCOUNT: 'NO_PASSWORD_ACCOUNT',
  OLD_PASSWORD_REQUIRED: 'OLD_PASSWORD_REQUIRED',
  OLD_PASSWORD_INCORRECT: 'OLD_PASSWORD_INCORRECT',
  PASSWORD_SAME_AS_OLD: 'PASSWORD_SAME_AS_OLD',
  CREDENTIAL_EXPIRED: 'CREDENTIAL_EXPIRED',
  PASSWORD_UPGRADE_REQUIRED: 'PASSWORD_UPGRADE_REQUIRED',
  SMS_NOT_CONFIGURED: 'SMS_NOT_CONFIGURED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  TEMP_LOCKED: 'TEMP_LOCKED',
  WORDBOOK_STALE: 'WORDBOOK_STALE',
  WORDBOOK_TOO_LARGE: 'WORDBOOK_TOO_LARGE',
  AVATAR_TOO_LARGE: 'AVATAR_TOO_LARGE',
  REGISTER_CLOSED: 'REGISTER_CLOSED',
} as const;

export type TmErrorCode = keyof typeof TM_ERROR_CODES;

/**
 * §4.6 表格的**逐行**镜像：16 行，其中两行各写两个码（`OLD_PASSWORD_*`、`WORDBOOK_TOO_LARGE / AVATAR_TOO_LARGE`），
 * 故码数 = 18。快照测试用它锁定行集合（判据②）。
 */
export const TM_ERROR_ROWS = [
  ['INVALID_PHONE'],
  ['WEAK_PASSWORD'],
  ['PASSWORD_MISMATCH'],
  ['AGREEMENT_REQUIRED'],
  ['PHONE_ALREADY_REGISTERED'],
  ['NO_PASSWORD_ACCOUNT'],
  ['OLD_PASSWORD_REQUIRED', 'OLD_PASSWORD_INCORRECT'],
  ['PASSWORD_SAME_AS_OLD'],
  ['CREDENTIAL_EXPIRED'],
  ['PASSWORD_UPGRADE_REQUIRED'],
  ['SMS_NOT_CONFIGURED'],
  ['TOO_MANY_REQUESTS'],
  ['TEMP_LOCKED'],
  ['WORDBOOK_STALE'],
  ['WORDBOOK_TOO_LARGE', 'AVATAR_TOO_LARGE'],
  ['REGISTER_CLOSED'],
] as const;

export interface TmErrorSpec {
  /** HTTP 状态码；`SMS_NOT_CONFIGURED` 是 200 附码（R-01⑥：旧 APK 收到不崩、不进倒计时）。 */
  http: number;
  /** 界面人话（唯一真相，两端逐字一致）。 */
  copy: string;
  /** 出处（PRD 条款），便于测试与 QA 回查。 */
  from: string;
  /** `false` = 静默处理，不显示给用户（仅 `WORDBOOK_STALE`）。 */
  visible?: boolean;
  /** 客户端收到该码该做什么（供 T-14/T-16 的单点处理消费）。 */
  clientAction?: 'clear-credential-and-login' | 'goto-upgrade-password' | 'switch-to-register' | 'replay-wordbook' | 'keep-sms-countdown-off';
}

export const TM_ERRORS: Record<TmErrorCode, TmErrorSpec> = {
  INVALID_PHONE: {
    http: 400,
    copy: '请输入正确的 11 位手机号',
    from: 'R-39③',
  },
  WEAK_PASSWORD: {
    http: 400,
    copy: '密码至少 8 位',
    from: 'R-39③ / R-40①',
  },
  PASSWORD_MISMATCH: {
    http: 400,
    copy: '两次输入的密码不一致',
    from: 'R-39③',
  },
  AGREEMENT_REQUIRED: {
    http: 400,
    copy: '请先阅读并同意《用户协议》《隐私政策》',
    from: 'R-39③',
  },
  PHONE_ALREADY_REGISTERED: {
    http: 409,
    copy: '这个手机号已经注册过，请直接登录',
    from: 'R-39③④ / §8.3-D-6',
    clientAction: 'switch-to-register',
  },
  NO_PASSWORD_ACCOUNT: {
    http: 401,
    copy:
      '该手机号此前用验证码注册、还没设置过密码 —— 点『设置密码激活』用同一个手机号设一个至少 8 位的密码，即可拿回原来的词本与进度',
    from: 'R-01③④（错误码自 v1.3 起仅用于登录分支）',
    clientAction: 'switch-to-register',
  },
  OLD_PASSWORD_REQUIRED: {
    http: 400,
    copy: '请输入当前密码',
    from: 'R-40②',
  },
  OLD_PASSWORD_INCORRECT: {
    http: 401,
    copy: '当前密码不正确',
    from: 'R-40②（计入失败锁）',
  },
  PASSWORD_SAME_AS_OLD: {
    http: 400,
    copy: '新密码不能和当前密码相同',
    from: 'R-40①',
  },
  CREDENTIAL_EXPIRED: {
    http: 401,
    copy: '密码已修改，请重新登录',
    from: 'R-40③',
    clientAction: 'clear-credential-and-login',
  },
  PASSWORD_UPGRADE_REQUIRED: {
    http: 403,
    copy: '为了账号安全，请先设置新密码',
    from: 'R-40④',
    clientAction: 'goto-upgrade-password',
  },
  SMS_NOT_CONFIGURED: {
    http: 200,
    copy: '短信通道暂未开通，请使用密码登录',
    from: 'R-01⑥（旧 APK 收到不崩、不进倒计时）',
    clientAction: 'keep-sms-countdown-off',
  },
  TOO_MANY_REQUESTS: {
    http: 429,
    copy: '操作过于频繁，请稍后再试',
    from: 'R-01① / R-39③ / K-1 配额',
  },
  TEMP_LOCKED: {
    http: 429,
    copy: '失败次数过多，请 10 分钟后再试',
    from: 'services/auth-policy.ts（5 次/10 分钟语义不回退）',
  },
  WORDBOOK_STALE: {
    http: 409,
    copy: '词本状态已过期，服务端会按最新版本自动重放（不打扰用户）',
    from: 'R-03④ / §4.4.1',
    visible: false,
    clientAction: 'replay-wordbook',
  },
  WORDBOOK_TOO_LARGE: {
    http: 400,
    copy: '单词数量超出上限',
    from: 'R-03 / §4.4.2 大小上限',
  },
  AVATAR_TOO_LARGE: {
    http: 400,
    copy: '图片太大，请换一张 300KB 以内的',
    from: 'R-04② / §4.5',
  },
  REGISTER_CLOSED: {
    http: 403,
    copy: '暂时无法注册，请稍后再试',
    from: 'R-39⑩（passwordRegister=off，不指向验证码）',
  },
};

/**
 * 评分档位的可读域（A-28-4 收编自 `services/review-service.ts` 的同名导出）。
 * 数字域与档位名一律由 `RATING_VALUES` / `RATING_LABELS` 组装，**不写死 "1-4" 与档位名**，
 * 渲染值 `评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松）` 与旧 REST 串逐字同形。
 */
export const RATING_DOMAIN_HINT = `评分必须为 ${RATING_VALUES[0]}-${RATING_VALUES[RATING_VALUES.length - 1]}（${RATING_VALUES.map((v) => `${v}=${RATING_LABELS[v]}`).join(' ')}）`;

/** 三模式取值的可读域（同上口径：值与标签都来自 `MODE_VALUES` / `MODE_LABELS`）。 */
export const MODE_DOMAIN_HINT = `复习模式必须为 ${MODE_VALUES.join(' / ')}（${MODE_VALUES.map((m) => MODE_LABELS[m]).join(' / ')}）`;

/**
 * 复习域 5 码的键（A-28-4：登记在 `TM_ERRORS_SUPPLEMENT`，域内不得再造第二份码表）。
 * 键集合与 `TM_ERRORS_SUPPLEMENT` 里那 5 条一一对应，由 `contracts.spec.ts` 钉住。
 */
export const REVIEW_ERROR_CODES = {
  INVALID_RATING: 'INVALID_RATING',
  INVALID_MODE: 'INVALID_MODE',
  INVALID_WORD: 'INVALID_WORD',
  NOTHING_TO_UNDO: 'NOTHING_TO_UNDO',
  UNDO_LIMIT_REACHED: 'UNDO_LIMIT_REACHED',
} as const;

export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[keyof typeof REVIEW_ERROR_CODES];

/**
 * §4.6 之外的既有码（`FORBIDDEN` 的文案已定稿：PRD §5.4-1 / A-33 第四节定稿①）：
 * §4.5 R-05② 与 R-09·R-10 与 R-41① 三面的 403 跨用户隔离共用这一条码。写入本表以免各端自己造人话。
 *
 * A-28-4（原 T-10 D-1）：复习域 5 码收进本表 —— 域内不得再建第二份码表。
 * 下面 5 条的 `copy` 用模板字面量从 `RATING_VALUES / RATING_LABELS / MODE_VALUES /
 * MODE_LABELS / WORD_MAX_LENGTH / UNDO_MAX_PER_SESSION` 组装，**渲染值与收编前
 * `review-service.ts` 的现值逐字相同**（旧 APK 读到的 `error` 键不变，R-17⑧）。
 * ⚠ 本表不属于 §4.6 快照面：`TM_ERROR_CODES` / `TM_ERROR_ROWS` / `TM_ERRORS` 三个冻结
 * 集合一字未动（A-8）。
 */
export const TM_ERRORS_SUPPLEMENT = {
  FORBIDDEN: { http: 403, copy: '这份内容不属于当前账号', from: '§4.5 R-05② / R-09·R-10 / R-41①（PRD §5.4-1 定稿）' },
  INVALID_RATING: { http: 400, copy: RATING_DOMAIN_HINT, from: 'R-02③④⑥ / T-10 D-1' },
  INVALID_MODE: { http: 400, copy: MODE_DOMAIN_HINT, from: 'R-02③④⑥ / T-10 D-1' },
  INVALID_WORD: { http: 400, copy: `请输入要复习的词（最长 ${WORD_MAX_LENGTH} 个字符）`, from: 'R-02③④⑥ / T-10 D-1' },
  NOTHING_TO_UNDO: { http: 409, copy: '这张已经撤过了，没有可撤销的评分', from: 'R-02③④⑥ / T-10 D-1' },
  UNDO_LIMIT_REACHED: { http: 429, copy: `一轮最多撤销 ${UNDO_MAX_PER_SESSION} 次，先继续背吧`, from: 'R-02③④⑥ / T-10 D-1' },
  /**
   * A-32-8 的 P-2（T-09 报告 §7 P-2 / `wordbook-merge.ts:479` 自注）：词本条目的**词名非法**
   * （空串 / 纯空格 / 非字符串 / 超 `WORD_MAX_LENGTH`）在 §4.6 的 18 码里**没有对应码**，
   * 服务端此前只能回 400 `数据格式错误`（机器话、无 `code`）。本条即那条缺码的登记落点。
   * 做法与 A-28-4 同一口径：① 纯追加进本表，`TM_ERROR_CODES` / `TM_ERROR_ROWS` / `TM_ERRORS`
   * 三个冻结集合一字未动（A-8 快照面）；② `copy` 用模板字面量从 `WORD_MAX_LENGTH` 组装，
   * 数字域不写第二份；③ 域内**不得**再建第二份码表 —— 服务端把 400 的出口换成 `errorMessage()` /
   * `supplementErrorStatus()` 属 T-09（`wordbook-merge.ts` / `routes/wordbook.ts` 名下）的后续动作，
   * 本轮只登记契约，不改 `packages/server/**`。
   * ⚠ 坏 JSON 与词名非法在服务端是同一个 400 出口（T-09 P-2 原文），是否再拆一条码由 PM 定稿；
   *   在拆码之前，本条覆盖该 400 出口的两种成因。
   */
  INVALID_WORDBOOK_ENTRY: {
    http: 400,
    copy: `这个词没法存进单词本（词名不能为空，最长 ${WORD_MAX_LENGTH} 个字符）`,
    from: 'A-32-8 P-2 / R-03⑦（原 400 机器话缺码）',
  },
  /**
   * A-48 #125 的缺码回环（PM-fix6 定码名与文案 · A-52 #135）：非法 `period` 等**通用入参非法**
   * 在 §4.6 的 18 码里没有对应码，服务端此前借用别的域的文案回 400（语义错位）。本条即该缺码的
   * 登记落点，做法与 A-28-4 / A-32-8 同一口径：纯追加进本表，`TM_ERROR_CODES` / `TM_ERROR_ROWS` /
   * `TM_ERRORS` 三个冻结集合一字未动（A-8）。服务端把该 400 出口换成 `errorMessage()` 属后续动作，
   * 本轮只登记契约，不改 `packages/server/**`。
   */
  INVALID_PARAMETER: {
    http: 400,
    copy: '这个页面有点问题，刷新后再试一次',
    from: 'PM-fix6 / T-26a 缺码回环（A-52 #135 / PRD §5.4-5）',
  },
} as const;

export type TmErrorSupplementCode = keyof typeof TM_ERRORS_SUPPLEMENT;

/* ───────── 取值助手（服务端与客户端共用，禁止在别处重复文案） ───────── */

export function errorMessage(code: TmErrorCode | TmErrorSupplementCode): string {
  if (code in TM_ERRORS) return TM_ERRORS[code as TmErrorCode].copy;
  return TM_ERRORS_SUPPLEMENT[code as TmErrorSupplementCode].copy;
}

export function errorHttpStatus(code: TmErrorCode): number {
  return TM_ERRORS[code].http;
}

/**
 * `TM_ERRORS_SUPPLEMENT` 的 http 取值（A-28-4）。
 * 刻意与 `errorHttpStatus()` 分家：后者的签名钉在 §4.6 的 18 码上（快照面，A-8），形状不得改动，
 * 所以补充码走本函数取状态，`errorMessage()` 则两类码通用。
 */
export function supplementErrorStatus(code: TmErrorSupplementCode): number {
  return TM_ERRORS_SUPPLEMENT[code].http;
}

export function isTmErrorCode(v: unknown): v is TmErrorCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TM_ERROR_CODES, v);
}

/** 该码是否面向用户显示（`WORDBOOK_STALE` 静默重放，不弹任何提示）。 */
export function isErrorVisible(code: TmErrorCode): boolean {
  return TM_ERRORS[code].visible !== false;
}

/** 统一错误响应体（§4.6 约定：`error` 旧客户端可读、`code` 新增可选键）。 */
export const TmErrorResponseBodySchema = z
  .object({
    error: z.string().min(1),
    code: z.string().optional(),
  })
  .passthrough();

export type TmErrorResponseBody = z.infer<typeof TmErrorResponseBodySchema>;

/**
 * 由码构造响应体（服务端唯一出口）。`SMS_NOT_CONFIGURED` 走 200 附码，
 * 其余按表内 http。此函数不读任何开关，保证"同一个码同一份文案"。
 */
export function tmErrorBody(code: TmErrorCode): { status: number; body: { error: string; code: TmErrorCode } } {
  return { status: TM_ERRORS[code].http, body: { error: TM_ERRORS[code].copy, code } };
}
