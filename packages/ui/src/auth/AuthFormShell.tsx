'use client';

/**
 * `AuthFormShell`（UI §3.9.1 / §3.9.2 / §3.9.5；R-01⑤⑥、R-39②⑥⑨、R-23①④⑤）。
 *
 * 两态一壳：`sign-in`（登录）/ `register`（注册），**激活认领不新增第三态**（R-39⑨）——
 * `activate` 只换标题与主按钮文案，DOM 结构 / 元素个数 / tab 序与注册态逐元素相同。
 *
 * 计数口径（判据① = PRD §8.3-D-8 的可测数字）：
 *  - 五个主控件带 `data-auth-control`：手机号 / 密码 /（注册态）确认密码 /（注册态）协议勾选 / 主按钮；
 *  - 底部小字区 `[data-slot=auth-footer]` 内**只有 1 个**可交互元素 = 12px 验证码入口（判据③）；
 *  - 次级文字链在标题行右侧（`data-auth-switch`，§3.9.1 计数规则把它移出表单主体）、
 *    字段装饰件（显示/隐藏密码、提示卡动作、错误态文字链）标 `data-auth-affordance`、
 *    协议书名号链接标 `data-auth-link` —— 三者都不占 5 个额度。
 *
 * 零 IO / 零请求 / 零文案字面量：阈值全部来自 `limits.ts`（`PASSWORD_MIN` / `PASSWORD_MAX_BYTES` /
 * `PHONE_PATTERN`），错误串全部来自 `TM_ERRORS`，静态字串全部来自 `AUTH_COPY` / `notice.ts`；
 * 真正的写库与签发 token 由宿主（T-16 Web 薄壳 / T-19 App 页）经 `onSubmit` 接手。
 *
 * 密码门槛分两面（A-36-3 修 DEFECT-3 / T-29）：**建密码**两面（注册与激活认领）用 `PASSWORD_MIN` 拦提交，
 * **验密码**面（登录）只用"空 / 纯空格"这一条门槛，让存量弱密码账号能把密码提交上去并命中
 * `PASSWORD_UPGRADE_REQUIRED`（R-40④）；`PASSWORD_MAX_BYTES` 是与强度无关的传输上限，两面同拦。
 */
import * as React from 'react';
import {
  ACTIVATE_SUBTITLE,
  AUTH_COPY,
  LOGIN_METHOD_NOTICE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  PHONE_PATTERN,
  TM_ERRORS,
  type TmErrorCode,
} from '@tm/shared';
import { cn } from '../host.js';
import { Button } from '../primitives/button.js';
import { AgreementCheckbox } from './AgreementCheckbox.js';
import { NoticeBar, type NoticeBarAction, type NoticeBarTone } from './NoticeBar.js';
import { PasswordStrength } from './PasswordStrength.js';
import { SmsCodeEntry } from './SmsCodeEntry.js';

export type AuthFormMode = 'sign-in' | 'register';

export interface AuthFormValues {
  /** 提交值：已去掉展示用空格，直接对 `PHONE_PATTERN` 判定（§3.9.1）。 */
  phone: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
}

export interface AuthFormShellProps {
  /** 提交出口（宿主在此打 `auth.login` / `auth.register`；组件不发请求）。 */
  onSubmit: (values: AuthFormValues) => void | Promise<void>;
  /** 受控模式；不传则组件自管（默认登录态，R-01⑤）。 */
  mode?: AuthFormMode;
  defaultMode?: AuthFormMode;
  onModeChange?: (mode: AuthFormMode) => void;
  /** 受控"激活认领"文案态；不传则由组件在 `NO_PASSWORD_ACCOUNT` 卡片动作里自管。 */
  activate?: boolean;
  onActivateChange?: (activate: boolean) => void;
  /** 每次字段变化回报当前值（宿主做"待收藏词"续作与埋点用，可省）。 */
  onValuesChange?: (values: AuthFormValues) => void;
  /** 服务端回传码（§3.9.5 逐码落点）；未知码一律显示在主按钮下方，不吞错。 */
  errorCode?: TmErrorCode | string | null;
  /** 非码形式的人话（宿主只有服务端 `error` 字段时用；`errorCode` 优先）。 */
  serverMessage?: string;
  /** R-23④「这个手机号还没注册，点这里注册」：宿主判定后打开，整句可点。 */
  showUnregisteredHint?: boolean;
  onUnregisteredHintClick?: () => void;
  /** 提交中（§3.9.6：主按钮文案不变、整表单 `aria-busy` + 字段区 `pointer-events-none`）。 */
  pending?: boolean;
  /** 底部公告条（R-01⑧「当前登录方式…」），默认显示。 */
  showNotice?: boolean;
  /** 公告覆写文本（默认 `LOGIN_METHOD_NOTICE`，`notice.ts` 单一源）。 */
  notice?: string;
  onSmsEntryClick?: (phone: string) => void;
  smsChannelReady?: boolean;
  smsCooldownSecondsRemaining?: number;
  /** 进入弹窗时的初始手机号（登录墙回跳场景）。 */
  defaultPhone?: string;
  /** R-01⑤：默认焦点在密码框（DOM 可断言）。 */
  autoFocus?: 'password' | 'phone' | 'none';
  /** 切换登录↔注册时是否清空两个密码框：§3.9.1 / R-39⑨ 写死为清，此位只给测试与例外复核用。 */
  clearPasswordsOnModeSwitch?: boolean;
  /**
   * R-23⑤ 与 UI §3.9.1 表互斥处（登录态要不要协议勾选），**待 TPM 裁决**；
   * 默认按 §3.9.1 = 不出现；裁决给"要"时宿主置真即可，不必改本件。
   */
  requireAgreementOnSignIn?: boolean;
  /** 以下为 shared 缺失常量的覆写位（见 T-13 报告「待 shared 补常量」清单），缺失即不渲染。 */
  signInSubtitle?: string;
  switchToRegisterLabel?: string;
  switchToSignInLabel?: string;
  alreadyRegisteredActionLabel?: string;
  phonePlaceholder?: string;
  passwordLabel?: string;
  confirmPasswordLabel?: string;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  /** 协议两个书名的落点（静态页路由由宿主给，R-23⑤）。 */
  termsHref?: string;
  privacyHref?: string;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  id?: string;
  className?: string;
  testid?: string;
}

type FieldKey = 'phone' | 'password' | 'confirm' | 'agreement';

/** §3.9.5 的字段级落点（`WEAK_PASSWORD` 的主落点是强度条，见下）。 */
const CODE_FIELD: Partial<Record<TmErrorCode, FieldKey>> = {
  INVALID_PHONE: 'phone',
  WEAK_PASSWORD: 'password',
  PASSWORD_MISMATCH: 'confirm',
};

/** §3.9.5 的"提示卡"落点。 */
const CARD_TONE: Partial<Record<TmErrorCode, NoticeBarTone>> = {
  PHONE_ALREADY_REGISTERED: 'brand',
  NO_PASSWORD_ACCOUNT: 'brand',
  REGISTER_CLOSED: 'warning',
};

/**
 * TODO(待 shared 补常量)：`limits.ts` 只有 `PHONE_PATTERN`（校验），没有手机号位数与展示分组
 * （UI §3.9.1 的 `138 0000 0000`）、也没有 `PHONE_PLACEHOLDER`。这里只做**数字分组**
 * （非文案、不参与判定，是否合法只看 `PHONE_PATTERN`），待 T-03 补 `PHONE_DISPLAY_GROUPS` 后接上。
 */
const PHONE_DISPLAY_GROUPS = [3, 4, 4] as const;
const PHONE_MAX_DIGITS = PHONE_DISPLAY_GROUPS.reduce((sum, size) => sum + size, 0);
const PHONE_MAX_LENGTH = PHONE_MAX_DIGITS + PHONE_DISPLAY_GROUPS.length - 1;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';
const FIELD_BOX =
  'h-field w-full rounded-md border border-hair bg-surface px-3 text-body text-ink transition-colors duration-micro ease-standard placeholder:text-ink-muted';
const FIELD_INVALID = 'border-danger';

const BYTE_ENCODER: TextEncoder | null = typeof TextEncoder === 'undefined' ? null : new TextEncoder();

/** 手机号 → 只留数字并截到校验位数。 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
}

/** 数字串 → `138 0000 0000`（展示用；提交前再 `digitsOnly`）。 */
export function formatPhoneForDisplay(value: string): string {
  const digits = digitsOnly(value);
  const parts: string[] = [];
  let offset = 0;
  for (const size of PHONE_DISPLAY_GROUPS) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  return parts.join(' ');
}

/** UTF-8 字节数（`PASSWORD_MAX_BYTES` 按字节判定，非码点数）。 */
export function utf8Bytes(value: string): number {
  return BYTE_ENCODER ? BYTE_ENCODER.encode(value).length : value.length;
}

function joinIds(...ids: Array<string | undefined | false>): string | undefined {
  const kept = ids.filter((one): one is string => Boolean(one));
  return kept.length > 0 ? kept.join(' ') : undefined;
}

const EyeGlyph = ({ off }: { off: boolean }): React.JSX.Element => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.6" />
    {off ? <path d="m3 3 18 18" /> : null}
  </svg>
);

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** 无错误时不写 `aria-describedby`，避免指向不存在的节点。 */
  errorId?: string;
  hintId?: string;
  autoComplete: 'current-password' | 'new-password';
  visible: boolean;
  onToggleVisible: () => void;
  showLabel?: string;
  hideLabel?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  name?: string;
  control?: string;
  testid?: string;
}

/** 密码字段（§3.9.1：label 在框上方 12px、右侧 Eye/EyeOff；切换按钮标 `data-auth-affordance` 不占 5 额度）。 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  errorId,
  hintId,
  autoComplete,
  visible,
  onToggleVisible,
  showLabel,
  hideLabel,
  inputRef,
  name,
  control = 'password',
  testid,
}: PasswordFieldProps): React.JSX.Element {
  const ariaLabel = visible ? hideLabel : showLabel;
  return (
    <div className="min-w-0" data-testid={testid}>
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={joinIds(error ? (errorId ?? `${id}-err`) : undefined, hintId)}
          data-auth-control={control}
          className={cn(FIELD_BOX, 'pr-12', FOCUS, error && FIELD_INVALID)}
        />
        {showLabel || hideLabel ? (
          <button
            type="button"
            data-auth-affordance="password-visibility"
            onClick={onToggleVisible}
            aria-label={ariaLabel}
            aria-pressed={visible}
            className={cn('absolute right-0 top-0 flex h-field w-tap items-center justify-center text-ink-muted hover:text-ink', FOCUS)}
          >
            <EyeGlyph off={visible} />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId ?? `${id}-err`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthFormShell({
  onSubmit,
  mode: modeProp,
  defaultMode = 'sign-in',
  onModeChange,
  activate: activateProp,
  onActivateChange,
  onValuesChange,
  errorCode,
  serverMessage,
  showUnregisteredHint,
  onUnregisteredHintClick,
  pending = false,
  showNotice = true,
  notice = LOGIN_METHOD_NOTICE,
  onSmsEntryClick,
  smsChannelReady = false,
  smsCooldownSecondsRemaining = 0,
  defaultPhone = '',
  autoFocus = 'password',
  clearPasswordsOnModeSwitch = true,
  requireAgreementOnSignIn = false,
  signInSubtitle,
  switchToRegisterLabel,
  switchToSignInLabel,
  alreadyRegisteredActionLabel,
  phonePlaceholder,
  passwordLabel,
  confirmPasswordLabel,
  showPasswordLabel,
  hidePasswordLabel,
  termsHref,
  privacyHref,
  onOpenTerms,
  onOpenPrivacy,
  id,
  className,
  testid,
}: AuthFormShellProps): React.JSX.Element {
  const rootId = id ?? 'auth-form';
  const [innerMode, setInnerMode] = React.useState<AuthFormMode>(modeProp ?? defaultMode);
  const [innerActivate, setInnerActivate] = React.useState(Boolean(activateProp));
  const mode = modeProp ?? innerMode;
  const activate = activateProp ?? innerActivate;
  const isRegister = mode === 'register';
  const showAgreement = isRegister || requireAgreementOnSignIn;

  const [phone, setPhone] = React.useState(() => digitsOnly(defaultPhone));
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [agreed, setAgreed] = React.useState(false);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  /** §3.9.2：`onBlur` 首次之后才实时，避免"边打边红"。 */
  const [touched, setTouched] = React.useState<Record<FieldKey, boolean>>({
    phone: false,
    password: false,
    confirm: false,
    agreement: false,
  });
  /** 未勾协议时点主按钮给的那条 `AGREEMENT_REQUIRED`（§3.9.2 末段 + R-39⑨）。 */
  const [agreementBlocked, setAgreementBlocked] = React.useState(false);
  /**
   * §3.9.7（**PM-fix7**）：登录态两条**本地拦截**的话术开关。只在用户点过一次主按钮、且被这两条拦下时置真 ——
   * 与 `touched.password`（`onBlur` 也会置真）不共用，因为「未提交就报红 = 骂用户」（§3.9.7 显示时机判据）。
   * 开的是"要不要给串"，判据本身（`passwordEmpty` / `passwordTooLong`）与 focus + 不发请求两个行为一字未动。
   */
  const [signInLocalBlocked, setSignInLocalBlocked] = React.useState(false);
  /**
   * 建密码面（注册态/激活态）的同一条"已点过主按钮"开关（T-03r5 / PM-fix8 件 3，A-61 第 168 条登记的
   * 同型静默缺口由这颗补上）—— 与 `signInLocalBlocked` 分立、同判据：**不挂 `touched.password`**
   * （它由 `onBlur` 置真，挂上 = "未提交就报红"，违 §3.9.7 显示时机，且会判红 `auth.spec.tsx:974` 族那条时机钉）。
   */
  const [setPasswordLocalBlocked, setSetPasswordLocalBlocked] = React.useState(false);

  const phoneRef = React.useRef<HTMLInputElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const confirmRef = React.useRef<HTMLInputElement | null>(null);
  const agreementRef = React.useRef<HTMLButtonElement | null>(null);

  const code: TmErrorCode | undefined =
    typeof errorCode === 'string' && errorCode in TM_ERRORS ? (errorCode as TmErrorCode) : undefined;
  const codeField = code ? CODE_FIELD[code] : undefined;
  const cardCode = code && code in CARD_TONE ? code : undefined;

  const emit = React.useCallback(
    (next: Partial<AuthFormValues>) => onValuesChange?.({ phone, password, confirmPassword, agreed, ...next }),
    [agreed, confirmPassword, onValuesChange, password, phone],
  );

  const phoneError =
    codeField === 'phone' || (touched.phone && !PHONE_PATTERN.test(phone)) ? TM_ERRORS.INVALID_PHONE.copy : undefined;
  /** R-39② / R-40①：判据只用 `PASSWORD_MIN` 与 `PASSWORD_MAX_BYTES`，本文件不出现第二套阈值。 */
  const passwordEmpty = password.trim().length === 0;
  const passwordTooWeak = password.trim().length < PASSWORD_MIN;
  const passwordTooLong = utf8Bytes(password.trim()) > PASSWORD_MAX_BYTES;
  /**
   * A-36-3 / R-40④：登录面是**验密码**，不是建密码 —— 这里不向存量短密码用户讲 `PASSWORD_MIN` 的话
   * （那句话属建密码三面：注册 / 改密 / 强制改密；注册态的话术由 `PasswordStrength` 承担，字段下不重复）。
   * 短密码的强度裁决归服务端 `assertPasswordStrength` + `requiresPasswordUpgrade()`，
   * 壳只保留与强度无关的**字节上限**（传输口径，登录/建号同拦）。
   * T-29r D-1：字段下的 `WEAK_PASSWORD.copy` 只剩服务端回码那一条落点（`codeField === 'password'`）。
   * 客户端的字节超长**不再**借用那句话 —— 它的字面是「至少 N 位」，登录态用它解释"过长"既语义反向，
   * 又把 R-40④ 明令禁止的建密码话术带回登录面；超长改走 `handleSubmit` 内的 focus 拦截（D-2 同范式）。
   * T-03r4 / §3.9.7（**PM-fix7 定稿**）：登录态这两条本地拦截（空 / 纯空格、超字节上限）各接一条人话串
   * （`AUTH_COPY.signInPasswordMissing` / `AUTH_COPY.signInPasswordTooLong`，唯一声明点在 shared），
   * 走**同一个**字段错误槽（`PasswordField` 的 `<p role="alert">`，§3.9.5 同位同 150ms 展开动效，不新开槽位）。
   * 三条判据与阈值一字未动；服务端回码那条落点仍优先；注册 / 改密 / 强制改密三面不吃这两条串。
   * T-03r5 / PM-fix8 件 3（A-61 第 168 条登记的同型静默）：**建密码面（注册/激活）超字节上限**补一条
   * `AUTH_COPY.setPasswordTooLong`（尾巴不绑 CTA，故可同覆盖三副建密码按钮），走**同一个**字段错误槽、
   * 同一个"已点过主按钮"时机范式（独立开关，不挂 `touched`）；串 A/串 B 仍不外溢（`!isRegister` 条件一字未动）。
   */
  const passwordError =
    codeField === 'password'
      ? TM_ERRORS.WEAK_PASSWORD.copy
      : signInLocalBlocked && !isRegister && passwordEmpty
        ? AUTH_COPY.signInPasswordMissing
        : signInLocalBlocked && !isRegister && passwordTooLong
          ? AUTH_COPY.signInPasswordTooLong
          : setPasswordLocalBlocked && isRegister && passwordTooLong
            ? AUTH_COPY.setPasswordTooLong
            : undefined;
  const confirmError =
    codeField === 'confirm' || (isRegister && touched.confirm && confirmPassword !== password)
      ? TM_ERRORS.PASSWORD_MISMATCH.copy
      : undefined;
  const agreementError =
    code === 'AGREEMENT_REQUIRED' || (showAgreement && (agreementBlocked || touched.agreement) && !agreed)
      ? TM_ERRORS.AGREEMENT_REQUIRED.copy
      : undefined;
  /** §3.9.5：`TOO_MANY_REQUESTS` / `TEMP_LOCKED` 落主按钮下；未映射码与宿主文本兜底同位，绝不静默。 */
  const underButtonError =
    code && !codeField && !cardCode ? TM_ERRORS[code].copy : code ? undefined : serverMessage;

  const primaryBlockedByAgreement = showAgreement && !agreed;

  const switchTo = React.useCallback(
    (next: AuthFormMode, nextActivate: boolean) => {
      if (modeProp === undefined) setInnerMode(next);
      else onModeChange?.(next);
      if (activateProp === undefined) setInnerActivate(nextActivate);
      else onActivateChange?.(nextActivate);
    },
    [activateProp, modeProp, onActivateChange, onModeChange],
  );

  /* 切换态：手机号与勾选**保留**，两个密码框**清空**，焦点进第一个空的密码框（判据② / §3.9.1）。 */
  const modeKey = `${mode}:${activate ? 'activate' : 'plain'}`;
  const previousModeKey = React.useRef(modeKey);
  React.useEffect(() => {
    if (previousModeKey.current === modeKey) return;
    previousModeKey.current = modeKey;
    if (clearPasswordsOnModeSwitch) {
      setPassword('');
      setConfirmPassword('');
    }
    setTouched({ phone: false, password: false, confirm: false, agreement: false });
    setAgreementBlocked(false);
    setSignInLocalBlocked(false);
    setSetPasswordLocalBlocked(false);
    setPasswordVisible(false);
    setConfirmVisible(false);
    const first = passwordRef.current;
    if (first && first.value === '') first.focus();
    else confirmRef.current?.focus();
  }, [clearPasswordsOnModeSwitch, modeKey]);

  /* R-01⑤：默认焦点在密码框（DOM 断言 `document.activeElement`）。 */
  React.useEffect(() => {
    if (autoFocus === 'phone') phoneRef.current?.focus();
    else if (autoFocus === 'password') passwordRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending) return;
    if (primaryBlockedByAgreement) {
      setAgreementBlocked(true);
      agreementRef.current?.focus();
      return;
    }
    setTouched({ phone: true, password: true, confirm: true, agreement: true });
    if (!PHONE_PATTERN.test(phone)) return;
    /* A-36-3 修 DEFECT-3 / T-29：`PASSWORD_MIN` 只拦**建密码态**（注册与激活认领）；
       登录态唯一的强度侧门槛是"空 / 纯空格不可提交"，短密码必须能提交上去，
       否则 `PASSWORD_UPGRADE_REQUIRED` 那条强制改密链（R-40④）在两端永不可达。
       T-29r D-2：两条拦截仍然"不发请求 + 焦点进密码框"，与未勾协议时
       `setAgreementBlocked` + `agreementRef.focus()` 同一范式，也不加 `required`（原生提示会绕开文案单一源）。
       T-03r4 / §3.9.7：这两条各自的**定稿串**（PM-fix7）经 `passwordError` 显示在同一字段错误槽下，
       判据、阈值、focus、不发请求四项行为一字未改；置真的只有本机的"已点过主按钮"开关。
       T-03r5 / PM-fix8 件 3：注册态/激活态的超长走**同一条**早退分支，补置真建密码面自己的开关
       （`setPasswordLocalBlocked`）——"不发请求 + 焦点进密码框"两个既有行为不变，只是不再同型静默。 */
    if (isRegister) {
      if (passwordTooWeak) return;
    } else if (passwordEmpty) {
      setSignInLocalBlocked(true);
      passwordRef.current?.focus();
      return;
    }
    if (passwordTooLong) {
      if (isRegister) setSetPasswordLocalBlocked(true);
      else setSignInLocalBlocked(true);
      passwordRef.current?.focus();
      return;
    }
    if (isRegister && confirmPassword !== password) return;
    setAgreementBlocked(false);
    setSignInLocalBlocked(false);
    setSetPasswordLocalBlocked(false);
    void onSubmit({ phone, password, confirmPassword: isRegister ? confirmPassword : '', agreed: true });
  };

  const title = isRegister ? (activate ? AUTH_COPY.dialog.activate : AUTH_COPY.dialog.register) : AUTH_COPY.dialog.login;
  const subtitle = isRegister ? ACTIVATE_SUBTITLE : signInSubtitle;
  const primaryLabel = isRegister ? (activate ? AUTH_COPY.submit.activate : AUTH_COPY.submit.register) : AUTH_COPY.submit.login;
  const switchLabel = isRegister ? switchToSignInLabel : switchToRegisterLabel;

  const cardAction = (): NoticeBarAction | undefined => {
    if (cardCode === 'NO_PASSWORD_ACCOUNT') {
      return { label: AUTH_COPY.noPasswordAccount.action, onClick: () => switchTo('register', true) };
    }
    if (cardCode === 'PHONE_ALREADY_REGISTERED' && alreadyRegisteredActionLabel) {
      return { label: alreadyRegisteredActionLabel, onClick: () => switchTo('sign-in', false) };
    }
    return undefined;
  };

  const ids = {
    title: `${rootId}-title`,
    phone: `${rootId}-phone`,
    phoneErr: `${rootId}-phone-err`,
    password: `${rootId}-password`,
    passwordErr: `${rootId}-password-err`,
    strength: `${rootId}-strength`,
    confirm: `${rootId}-confirm`,
    confirmErr: `${rootId}-confirm-err`,
    agreement: `${rootId}-agreement`,
    agreementErr: `${rootId}-agreement-err`,
  };

  return (
    <form
      id={id}
      noValidate
      data-testid={testid ?? 'auth-form'}
      data-mode={mode}
      data-activate={activate ? 'true' : 'false'}
      aria-busy={pending || undefined}
      aria-labelledby={ids.title}
      onSubmit={handleSubmit}
      className={cn('w-full space-y-4 text-ink', className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={ids.title} data-slot="auth-title" data-testid="auth-title" className="text-h2 font-semibold leading-tight text-ink">
          {title}
        </h2>
        {switchLabel ? (
          <button
            type="button"
            data-auth-switch="mode"
            data-testid="auth-switch"
            onClick={() => switchTo(isRegister ? 'sign-in' : 'register', false)}
            className={cn('inline bg-transparent p-0 text-sm text-brand underline-offset-2 hover:underline', FOCUS)}
          >
            {switchLabel}
          </button>
        ) : null}
      </div>

      {subtitle ? (
        <p data-slot="auth-subtitle" className="-mt-4 text-sm leading-relaxed text-ink-muted">
          {subtitle}
        </p>
      ) : null}

      <div
        key={modeKey}
        data-testid="auth-fields"
        className={cn('min-w-0 animate-fade-in-up space-y-4', pending && 'pointer-events-none')}
      >
        <div className="min-w-0" data-testid="field-phone">
          <label htmlFor={ids.phone} className="mb-1 block text-xs text-ink-muted">
            {AUTH_COPY.fieldLabels.phone}
          </label>
          <input
            id={ids.phone}
            data-auth-control="phone"
            ref={phoneRef}
            name="phone"
            type="text"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={PHONE_MAX_LENGTH}
            placeholder={phonePlaceholder}
            value={formatPhoneForDisplay(phone)}
            aria-invalid={phoneError ? 'true' : undefined}
            aria-describedby={phoneError ? ids.phoneErr : undefined}
            onChange={(event) => {
              const next = digitsOnly(event.target.value);
              setPhone(next);
              emit({ phone: next });
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
            className={cn(FIELD_BOX, FOCUS, phoneError && FIELD_INVALID)}
          />
          {phoneError ? (
            <p id={ids.phoneErr} role="alert" className="mt-1 text-xs text-danger">
              {phoneError}
            </p>
          ) : null}
        </div>

        {cardCode ? (
          <NoticeBar
            layout="card"
            tone={CARD_TONE[cardCode] ?? 'brand'}
            title={cardCode === 'NO_PASSWORD_ACCOUNT' ? AUTH_COPY.noPasswordAccount.cardTitle : undefined}
            action={cardAction()}
            testid="auth-notice-card"
          >
            {TM_ERRORS[cardCode].copy}
          </NoticeBar>
        ) : null}

        {isRegister ? (
          <div className="min-w-0">
            <PasswordField
              id={ids.password}
              name="password"
              control="password"
              testid="field-password"
              label={passwordLabel ?? AUTH_COPY.fieldLabels.password}
              value={password}
              autoComplete="new-password"
              visible={passwordVisible}
              onToggleVisible={() => setPasswordVisible((prev) => !prev)}
              showLabel={showPasswordLabel}
              hideLabel={hidePasswordLabel}
              inputRef={passwordRef}
              error={passwordError}
              errorId={ids.passwordErr}
              hintId={ids.strength}
              onChange={(next) => {
                setPassword(next);
                emit({ password: next });
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
            />
            <PasswordStrength value={password} id={ids.strength} className="-mt-4" />
          </div>
        ) : (
          <PasswordField
            id={ids.password}
            name="password"
            control="password"
            testid="field-password"
            label={passwordLabel ?? AUTH_COPY.fieldLabels.password}
            value={password}
            autoComplete="current-password"
            visible={passwordVisible}
            onToggleVisible={() => setPasswordVisible((prev) => !prev)}
            showLabel={showPasswordLabel}
            hideLabel={hidePasswordLabel}
            inputRef={passwordRef}
            error={passwordError}
            errorId={ids.passwordErr}
            onChange={(next) => {
              setPassword(next);
              emit({ password: next });
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          />
        )}

        {isRegister ? (
          <PasswordField
            id={ids.confirm}
            name="confirmPassword"
            control="confirm"
            testid="field-confirm"
            label={confirmPasswordLabel ?? AUTH_COPY.fieldLabels.confirmPassword}
            value={confirmPassword}
            autoComplete="new-password"
            visible={confirmVisible}
            onToggleVisible={() => setConfirmVisible((prev) => !prev)}
            showLabel={showPasswordLabel}
            hideLabel={hidePasswordLabel}
            inputRef={confirmRef}
            error={confirmError}
            errorId={ids.confirmErr}
            onChange={(next) => {
              setConfirmPassword(next);
              emit({ confirmPassword: next });
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, confirm: true }))}
          />
        ) : null}

        {showUnregisteredHint ? (
          <button
            type="button"
            data-auth-affordance="unregistered-hint"
            data-testid="auth-unregistered-hint"
            onClick={() => {
              onUnregisteredHintClick?.();
              switchTo('register', false);
            }}
            className={cn('block text-sm text-brand underline-offset-2 hover:underline', FOCUS)}
          >
            {AUTH_COPY.unregistered}
          </button>
        ) : null}

        {showAgreement ? (
          <AgreementCheckbox
            id={ids.agreement}
            checked={agreed}
            error={agreementError}
            describedby={ids.agreementErr}
            buttonRef={agreementRef}
            termsHref={termsHref}
            privacyHref={privacyHref}
            onOpenTerms={onOpenTerms}
            onOpenPrivacy={onOpenPrivacy}
            onChange={(next) => {
              setAgreed(next);
              setAgreementBlocked(false);
              emit({ agreed: next });
            }}
          />
        ) : null}

        <div className="mt-4 space-y-2">
          <Button
            type="submit"
            variant="default"
            data-auth-control="submit"
            data-testid="auth-submit"
            aria-disabled={primaryBlockedByAgreement || undefined}
            disabled={pending}
            className={cn('h-field w-full', primaryBlockedByAgreement && 'bg-hair text-ink-muted shadow-none')}
          >
            {pending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spinner rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            {primaryLabel}
          </Button>
          {underButtonError ? (
            <p data-testid="auth-form-error" role="alert" className="text-center text-xs text-danger">
              {underButtonError}
            </p>
          ) : null}
        </div>
      </div>

      {showNotice ? (
        <NoticeBar layout="bar" tone="info" testid="auth-notice" className="mt-1">
          {notice}
        </NoticeBar>
      ) : null}

      <div data-slot="auth-footer" data-testid="auth-footer" className="pt-1">
        <SmsCodeEntry
          phone={phone}
          channelReady={smsChannelReady}
          cooldownSecondsRemaining={smsCooldownSecondsRemaining}
          onRequestCode={onSmsEntryClick}
        />
      </div>
    </form>
  );
}

export default AuthFormShell;
