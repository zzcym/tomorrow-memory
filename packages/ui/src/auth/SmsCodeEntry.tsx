'use client';

/**
 * `SmsCodeEntry`（UI §3.9.1 底部小字 / §3.9.5 验证码入口硬规则 / R-01⑤⑥）。
 *
 * 本期短信是桩（Q1 定案），所以本件的可测口径只有三条：
 *  1. **入口是 12px 文字、不是按钮形态**：不用 `primitives/button`，无底色/无边框/无高度盒，
 *     字号取 `text-xs`（preset 里 = 12px），并落在 `data-auth-secondary` 槽位（§3.9.1 计数口径）；
 *  2. 入口旁**常驻** 12px 说明 = `AUTH_COPY.smsHint`（= `notice.ts` 的 `SMS_UNAVAILABLE_HINT`，R-01⑥）；
 *  3. 点击 → **不发"已发送"、不启动倒计时**，就地显示 `AUTH_COPY.smsResult`
 *     （= `TM_ERRORS.SMS_NOT_CONFIGURED.copy`，R-01⑥：200 附码、旧 APK 不崩）。
 *
 * 60 秒倒计时的**逻辑位保留、本期永不触发**（R-23⑥）：剩余秒数由宿主算完再传进来
 * （本件不读时钟，§3.5），且只有 `channelReady` 为真时才生效。
 * TODO(待 shared 补常量)：倒计时标签句式（§3.9.5"等 60 秒后按钮自动解禁"对应的可见文字）在
 * `AUTH_COPY` 里还没有键，因此本件在 `remaining > 0` 时只置 `aria-disabled`、不渲染任何自造文字。
 */
import * as React from 'react';
import { AUTH_COPY, SMS_RESEND_COOLDOWN_SECONDS } from '@tm/shared';
import { cn } from '../host.js';

export interface SmsCodeEntryProps {
  /** 已输入的手机号（未注册/未登录时入口点击后仍保留，R-01⑤）。 */
  phone: string;
  /** 宿主去打 `POST /api/send-code` / `auth.sendCode` 的出口（本件不发请求）。 */
  onRequestCode?: (phone: string) => void;
  /**
   * 通道是否已接（本期恒 `false`，Q1）。
   * `false` 时点击只显示 `SMS_NOT_CONFIGURED` 人话，绝不显示"已发送"、绝不进入倒计时。
   */
  channelReady?: boolean;
  /** 倒计时剩余秒数（真实通道接入后由宿主驱动；≤0 = 未在倒计时）。 */
  cooldownSecondsRemaining?: number;
  /** 倒计时总时长，默认 `SMS_RESEND_COOLDOWN_SECONDS`（shared 唯一值）。 */
  cooldownSecondsTotal?: number;
  /** 常驻说明覆写（默认 `AUTH_COPY.smsHint`）。 */
  hint?: string;
  /** 点击后的就地反馈覆写（默认 `AUTH_COPY.smsResult`）。 */
  result?: string;
  className?: string;
  testid?: string;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export function SmsCodeEntry({
  phone,
  onRequestCode,
  channelReady = false,
  cooldownSecondsRemaining = 0,
  cooldownSecondsTotal = SMS_RESEND_COOLDOWN_SECONDS,
  hint = AUTH_COPY.smsHint,
  result = AUTH_COPY.smsResult,
  className,
  testid,
}: SmsCodeEntryProps): React.JSX.Element {
  const [requested, setRequested] = React.useState(false);
  const cooling = channelReady && cooldownSecondsRemaining > 0 && cooldownSecondsTotal > 0;

  const handleClick = (): void => {
    if (cooling) return;
    setRequested(true);
    onRequestCode?.(phone);
  };

  return (
    <span
      data-testid={testid ?? 'sms-entry-row'}
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}
      data-channel-ready={channelReady ? 'true' : 'false'}
      data-cooldown={cooling ? 'running' : 'off'}
    >
      <button
        type="button"
        data-auth-secondary="sms-entry"
        data-testid="sms-entry"
        aria-disabled={cooling || undefined}
        disabled={cooling}
        onClick={handleClick}
        className={cn(
          'inline bg-transparent p-0 text-xs font-normal leading-none text-brand underline-offset-2 hover:underline',
          FOCUS,
        )}
      >
        {AUTH_COPY.smsEntryLabel}
      </button>
      <span data-testid="sms-hint" className="text-xs leading-none text-ink-muted">
        {hint}
      </span>
      {requested && !channelReady ? (
        <span data-testid="sms-result" role="status" aria-live="polite" className="w-full text-xs leading-snug text-danger">
          {result}
        </span>
      ) : null}
    </span>
  );
}

export default SmsCodeEntry;
