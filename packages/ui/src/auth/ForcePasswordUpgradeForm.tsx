'use client';

/**
 * `ForcePasswordUpgradeForm`（UI §3.9.4 / R-40④：不可关闭、不可跳过；判据⑤）。
 *
 * 硬门禁（R-40④ / §8.3-D-11）：本页**只有两个出口** —— 主按钮 `更新密码并继续`
 * 与其下居中文字按钮 `退出登录`（两条文案都是 `AUTH_COPY.forceUpgrade` 里唯二的串）。
 * 本件不渲染任何 dismiss / 后退 / 第三方"待会儿再来"类出口，也没有把它们开关掉的 prop；
 * 页面级 `Esc` 被拦下并触发一次 shake（§7.4 弹层行：强制改密页 Esc 无效）。
 *
 * 字段与强度条 = 普通改密**同一套**（`ChangePasswordForm` → 同一批常量、同一批错误串，§3.9 铁律）。
 * `TEMP_LOCKED` 只禁用提交、本页不显示倒计时（§3.9.4 末段），逻辑在 `ChangePasswordForm` 内。
 *
 * 零 IO：请求与 `pw_policy_version` 写入在宿主（Web `upgrade-gate.tsx` / App 返回键桥）；
 * 宿主拦下越级访问时把 `blockedBackSignal` 自增，本件据此 shake 一次并把焦点送回首个字段。
 */
import * as React from 'react';
import { AUTH_COPY, type TmErrorCode } from '@tm/shared';
import { cn } from '../host.js';
import { Button } from '../primitives/button.js';
import { ChangePasswordForm, type PasswordChangeValues } from './ChangePasswordForm.js';
import { NoticeBar } from './NoticeBar.js';

export interface ForcePasswordUpgradeFormProps {
  /** 主出口：宿主在此打 `auth.password-upgrade`（成功后签发正常 30 天 token 并回跳原始目标页）。 */
  onSubmit: (values: PasswordChangeValues) => void | Promise<void>;
  /** 唯一副出口：退出登录（回到登录壳，账号与进度不丢）。 */
  onSignOut: () => void | Promise<void>;
  /** 宿主拦下物理返回 / 直接访问业务路由时自增本值（§3.9.4 末段：不退出、不后退，shake 一次）。 */
  blockedBackSignal?: number;
  pending?: boolean;
  errorCode?: TmErrorCode | string | null;
  serverMessage?: string;
  /** 标题（默认 `AUTH_COPY.forceUpgrade.title`，§3.9.4 逐字）。 */
  title?: string;
  /**
   * TODO(待 shared 补常量)：§3.9.4 那句逐字副标题在 `copy.ts` / `notice.ts` 里都不存在
   * （见 T-13 报告清单），故只开覆写位；不传即不渲染，本件绝不内联该串。
   */
  subtitle?: string;
  /** 页面级告知（默认 `AUTH_COPY.forceUpgrade.notice` = `NOTICE_FORCE_UPGRADE`）。 */
  notice?: string;
  /** 改密成功后的常驻 6 秒信息条（R-40③）由宿主挂上来；shared 同样缺这条文案。 */
  result?: React.ReactNode;
  signOutLabel?: string;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  /** §3.9.4：进入本页焦点即落在"当前密码"。 */
  autoFocus?: boolean;
  id?: string;
  className?: string;
  testid?: string;
}

/**
 * shake 复位时长：对齐 `--dur-fast`（= `--dur-micro` = 120ms，UI §1.11）。
 * TODO(待 shared 补常量)：`limits.ts` 只有业务时限、没有动效时长常量，CSS 变量在 JS 侧读不到；
 * 本件唯一的时间字面量就是它，待 T-03 补 `MOTION_FAST_MS` 后一次性替换。
 */
const NUDGE_RESET_MS = 120;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export function ForcePasswordUpgradeForm({
  onSubmit,
  onSignOut,
  blockedBackSignal,
  pending = false,
  errorCode,
  serverMessage,
  title = AUTH_COPY.forceUpgrade.title,
  subtitle,
  notice = AUTH_COPY.forceUpgrade.notice,
  result,
  signOutLabel = AUTH_COPY.forceUpgrade.secondary,
  showPasswordLabel,
  hidePasswordLabel,
  autoFocus = true,
  id,
  className,
  testid,
}: ForcePasswordUpgradeFormProps): React.JSX.Element {
  const rootId = id ?? 'force-password-upgrade';
  const oldPasswordRef = React.useRef<HTMLInputElement | null>(null);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nudging, setNudging] = React.useState(false);

  /** 被拦下的返回动作：位移 ≤4px 抖一次（reduced-motion 改 1px 描边闪烁）+ 焦点回首个字段。 */
  const nudge = React.useCallback((): void => {
    oldPasswordRef.current?.focus();
    setNudging(true);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setNudging(false);
    }, NUDGE_RESET_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    },
    [],
  );

  const lastSignalRef = React.useRef<number | undefined>(blockedBackSignal);
  React.useEffect(() => {
    if (blockedBackSignal === undefined || blockedBackSignal === lastSignalRef.current) return;
    lastSignalRef.current = blockedBackSignal;
    nudge();
  }, [blockedBackSignal, nudge]);

  /** Web 侧 `←` / `Esc`：不后退、不关闭，只 shake（§7.4「强制改密页除外」）。 */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      nudge();
      return;
    }
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      nudge();
    }
  };

  return (
    <div
      id={id}
      data-testid={testid ?? 'force-password-upgrade'}
      data-auth-hard-gate="true"
      data-nudge={nudging ? 'true' : 'false'}
      onKeyDown={handleKeyDown}
      className={cn(
        'mx-auto w-[min(92vw,380px)] max-w-auth py-6 transition-transform duration-fast ease-standard',
        'motion-reduce:translate-x-0 motion-reduce:ring-1 motion-reduce:ring-focus',
        nudging && 'translate-x-[3px]',
        className,
      )}
    >
      <div className="space-y-4">
        <NoticeBar layout="bar" tone="warning" testid="force-notice" role="status">
          {notice}
        </NoticeBar>

        <ChangePasswordForm
          id={`${rootId}-form`}
          testid="force-change-password"
          title={title}
          subtitle={subtitle}
          submitLabel={AUTH_COPY.forceUpgrade.submit}
          pending={pending}
          errorCode={errorCode}
          serverMessage={serverMessage}
          autoFocus={autoFocus}
          showPasswordLabel={showPasswordLabel}
          hidePasswordLabel={hidePasswordLabel}
          oldPasswordRef={oldPasswordRef}
          result={result}
          onSubmit={onSubmit}
          belowSubmit={
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="link"
                size="sm"
                data-auth-secondary="sign-out"
                data-testid="force-sign-out"
                disabled={pending}
                onClick={() => void onSignOut()}
                className={cn('min-h-tap px-4 py-3 text-sm', FOCUS)}
              >
                {signOutLabel}
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}

export default ForcePasswordUpgradeForm;
