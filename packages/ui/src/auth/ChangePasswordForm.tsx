'use client';

/**
 * `ChangePasswordForm`（UI §3.9.4 末段"普通改密复用同一表单组件" / R-40①②；R-31① 提前到本期）。
 *
 * 字段与强度条和强制改密页**同一套**（§3.9 铁律"同一套字段、同一套校验常量、同一套文案"）：
 * 当前密码 + 新密码 + 确认新密码 + `PasswordStrength`。差异只有标题/按钮文案与出口数量，
 * 由调用方（`ForcePasswordUpgradeForm` 或 T-19 的 `SecurityScreen` / `(user)/profile/security`）给。
 *
 * 错误落点按 §3.9.5：`OLD_PASSWORD_*` → 当前密码框下；`PASSWORD_SAME_AS_OLD` / 服务端 `WEAK_PASSWORD`
 * → 新密码框下（强度条只是常驻说明；服务端按更强策略拒绝时**必须**在字段下给出可见原因，
 * 不得只靠强度条、更不得静默 —— A-41 #62 / T-06r）；`TEMP_LOCKED` → 主按钮下且**不显示倒计时、只禁提交**（§3.9.4）。
 * 阈值仍只取 `PASSWORD_MIN` / `PASSWORD_MAX_BYTES`；`oldPassword` 必填 = R-40②（前端同规则，服务端为唯一可信边界）。
 */
import * as React from 'react';
import { AUTH_COPY, PASSWORD_MAX_BYTES, PASSWORD_MIN, TM_ERRORS, type TmErrorCode } from '@tm/shared';
import { cn } from '../host.js';
import { Button } from '../primitives/button.js';
import { PasswordField, utf8Bytes } from './AuthFormShell.js';
import { PasswordStrength } from './PasswordStrength.js';

export interface PasswordChangeValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordChangeFieldLabels {
  current?: string;
  next?: string;
  confirm?: string;
}

export interface ChangePasswordFormProps {
  onSubmit: (values: PasswordChangeValues) => void | Promise<void>;
  /** 标题（强制态 `AUTH_COPY.forceUpgrade.title`；普通态 shared 缺"修改密码"这一格 → 宿主覆写，见 T-13 报告）。 */
  title?: string;
  subtitle?: string;
  /** 主按钮文案（强制态 `AUTH_COPY.forceUpgrade.submit`；普通态 shared 缺"保存新密码" → 宿主覆写）。 */
  submitLabel: string;
  fieldLabels?: PasswordChangeFieldLabels;
  pending?: boolean;
  errorCode?: TmErrorCode | string | null;
  /** 非码形式的人话兜底（宿主已有服务端 `error` 时用）。 */
  serverMessage?: string;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  /** 打开时是否聚焦第一个字段（§3.9.4：失败后"不白屏、不丢已输入内容"）。 */
  autoFocus?: boolean;
  /** 头部左侧动作（普通改密的返回；强制改密页**没有**这一项）。 */
  headerAction?: React.ReactNode;
  /** 主按钮之下的附加区（强制态在这里放"退出登录"）。 */
  belowSubmit?: React.ReactNode;
  /** 成功后宿主挂上来的常驻信息条（§3.9.4"其他设备需要重新登录"）。 */
  result?: React.ReactNode;
  oldPasswordRef?: React.Ref<HTMLInputElement>;
  id?: string;
  className?: string;
  testid?: string;
}

type PwFieldKey = 'old' | 'new' | 'confirm';

const CODE_FIELD: Partial<Record<TmErrorCode, PwFieldKey>> = {
  OLD_PASSWORD_REQUIRED: 'old',
  OLD_PASSWORD_INCORRECT: 'old',
  PASSWORD_SAME_AS_OLD: 'new',
  WEAK_PASSWORD: 'new',
  PASSWORD_MISMATCH: 'confirm',
};

export function ChangePasswordForm({
  onSubmit,
  title,
  subtitle,
  submitLabel,
  fieldLabels,
  pending = false,
  errorCode,
  serverMessage,
  showPasswordLabel,
  hidePasswordLabel,
  autoFocus = false,
  headerAction,
  belowSubmit,
  result,
  oldPasswordRef,
  id,
  className,
  testid,
}: ChangePasswordFormProps): React.JSX.Element {
  const rootId = id ?? 'password-change';
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [visible, setVisible] = React.useState<Record<PwFieldKey, boolean>>({ old: false, new: false, confirm: false });
  const [touched, setTouched] = React.useState<Record<PwFieldKey, boolean>>({ old: false, new: false, confirm: false });

  const formRef = React.useRef<HTMLFormElement | null>(null);
  const oldRefInternal = React.useRef<HTMLInputElement | null>(null);
  const newRef = React.useRef<HTMLInputElement | null>(null);
  const confirmRef = React.useRef<HTMLInputElement | null>(null);
  /** 首个字段既要内部聚焦，也要能把 ref 透给宿主 → 合并两个 ref。 */
  const setOldRef = (node: HTMLInputElement | null): void => {
    oldRefInternal.current = node;
    if (typeof oldPasswordRef === 'function') oldPasswordRef(node);
    else if (oldPasswordRef && typeof oldPasswordRef === 'object') oldPasswordRef.current = node;
  };
  /** §3.9.4：失败/重开时焦点回第一个字段，不丢已输入内容。 */
  const focusFirst = (): void => {
    oldRefInternal.current?.focus();
  };

  const code: TmErrorCode | undefined =
    typeof errorCode === 'string' && errorCode in TM_ERRORS ? (errorCode as TmErrorCode) : undefined;
  const codeField = code ? CODE_FIELD[code] : undefined;

  React.useEffect(() => {
    if (!autoFocus) return;
    focusFirst();
    // autoFocus 只作为"挂载时是否抢焦点"的开关，依赖数组刻意不含 ref。
  }, [autoFocus]);

  const trimmedNew = newPassword.trim();
  const newTooWeak = trimmedNew.length < PASSWORD_MIN;
  const newTooLong = utf8Bytes(trimmedNew) > PASSWORD_MAX_BYTES;
  const oldMissing = oldPassword.length === 0;

  const oldError =
    codeField === 'old'
      ? TM_ERRORS[(code ?? 'OLD_PASSWORD_REQUIRED') as TmErrorCode].copy
      : touched.old && oldMissing
        ? TM_ERRORS.OLD_PASSWORD_REQUIRED.copy
        : undefined;
  /**
   * §3.9.5 落点：`codeField` 命中的字段**必须**显示服务端原因，不得静默（A-41 #62 / T-06r）。
   * 客户端两条本地判据**各说各的**（F-23 / A-64 第 179 条，T-03r5 拆）：
   *  - `newTooWeak`（< `PASSWORD_MIN`）仍引 `TM_ERRORS.WEAK_PASSWORD.copy` —— 本面是**建密码面**，
   *    强度话术在此合法（R-40④ 只管验密码面，PM-fix8 §三 写明该面出现强度话术不违规）；
   *  - `newTooLong`（> `PASSWORD_MAX_BYTES`，传输口径）改引 `AUTH_COPY.setPasswordTooLong` ——
   *    原先与弱密码合并回同一句"至少 8 位"，把"过长"说成"太短"= 反号错话（§3.9.5"真实原因、不得静默"）。
   * 服务端优先、客户端 `touched` 才报错的时机不变；`:159` 的超长拦截（不发请求）一字未动。
   */
  const newError =
    codeField === 'new'
      ? TM_ERRORS[(code ?? 'PASSWORD_SAME_AS_OLD') as TmErrorCode].copy
      : touched.new && newTooWeak
        ? TM_ERRORS.WEAK_PASSWORD.copy
        : touched.new && newTooLong
          ? AUTH_COPY.setPasswordTooLong
          : undefined;
  const confirmError =
    codeField === 'confirm' || (touched.confirm && confirmPassword !== newPassword)
      ? TM_ERRORS.PASSWORD_MISMATCH.copy
      : undefined;
  /** §3.9.5：`TOO_MANY_REQUESTS` / `TEMP_LOCKED` 落主按钮下；TEMP_LOCKED 只禁提交、不显示倒计时。 */
  const underButton =
    code && !codeField ? TM_ERRORS[code].copy : code ? undefined : serverMessage;
  const locked = code === 'TEMP_LOCKED';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending || locked) return;
    setTouched({ old: true, new: true, confirm: true });
    if (oldMissing || newTooWeak || newTooLong || confirmPassword !== newPassword) return;
    void onSubmit({ oldPassword, newPassword, confirmPassword });
  };

  const labels = {
    current: fieldLabels?.current ?? AUTH_COPY.forceUpgrade.fieldLabels.current,
    next: fieldLabels?.next ?? AUTH_COPY.forceUpgrade.fieldLabels.next,
    confirm: fieldLabels?.confirm ?? AUTH_COPY.forceUpgrade.fieldLabels.confirm,
  };
  const strengthId = `${rootId}-strength`;

  return (
    <form
      ref={formRef}
      id={id}
      noValidate
      data-testid={testid ?? 'change-password-form'}
      aria-busy={pending || undefined}
      onSubmit={handleSubmit}
      className={cn('w-full space-y-4 text-ink', className)}
    >
      <div className="flex items-center gap-2">
        {headerAction}
        {title ? (
          <h2 data-slot="password-title" className="text-h2 font-semibold leading-tight text-ink">
            {title}
          </h2>
        ) : null}
      </div>
      {subtitle ? (
        <p data-slot="password-subtitle" className="text-sm leading-relaxed text-ink-muted">
          {subtitle}
        </p>
      ) : null}

      <div className={cn('min-w-0 space-y-4', pending && 'pointer-events-none')}>
        <PasswordField
          id={`${rootId}-old`}
          name="oldPassword"
          control="old-password"
          label={labels.current}
          value={oldPassword}
          autoComplete="current-password"
          visible={visible.old}
          onToggleVisible={() => setVisible((prev) => ({ ...prev, old: !prev.old }))}
          showLabel={showPasswordLabel}
          hideLabel={hidePasswordLabel}
          inputRef={setOldRef}
          error={oldError}
          onChange={(next) => setOldPassword(next)}
          onBlur={() => setTouched((prev) => ({ ...prev, old: true }))}
        />

        <div className="min-w-0">
          <PasswordField
            id={`${rootId}-new`}
            name="newPassword"
            control="new-password"
            label={labels.next}
            value={newPassword}
            autoComplete="new-password"
            visible={visible.new}
            onToggleVisible={() => setVisible((prev) => ({ ...prev, new: !prev.new }))}
            showLabel={showPasswordLabel}
            hideLabel={hidePasswordLabel}
            inputRef={newRef}
            error={newError}
            hintId={strengthId}
            onChange={(next) => setNewPassword(next)}
            onBlur={() => setTouched((prev) => ({ ...prev, new: true }))}
          />
          <PasswordStrength value={newPassword} id={strengthId} className="-mt-4" />
        </div>

        <PasswordField
          id={`${rootId}-confirm`}
          name="confirmPassword"
          control="confirm-password"
          label={labels.confirm}
          value={confirmPassword}
          autoComplete="new-password"
          visible={visible.confirm}
          onToggleVisible={() => setVisible((prev) => ({ ...prev, confirm: !prev.confirm }))}
          showLabel={showPasswordLabel}
          hideLabel={hidePasswordLabel}
          inputRef={confirmRef}
          error={confirmError}
          onChange={(next) => setConfirmPassword(next)}
          onBlur={() => setTouched((prev) => ({ ...prev, confirm: true }))}
        />

        <div className="mt-4 space-y-2">
          <Button
            type="submit"
            variant="default"
            data-auth-control="submit"
            data-testid="password-submit"
            aria-disabled={locked || undefined}
            disabled={pending || locked}
            className="h-field w-full"
          >
            {pending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spinner rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            {submitLabel}
          </Button>
          {underButton ? (
            <p data-testid="password-form-error" role="alert" className="text-center text-xs text-danger">
              {underButton}
            </p>
          ) : null}
          {belowSubmit}
        </div>

        {result}
      </div>
    </form>
  );
}

export default ChangePasswordForm;
