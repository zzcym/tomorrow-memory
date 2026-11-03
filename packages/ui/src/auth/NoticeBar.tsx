'use client';

/**
 * `NoticeBar`（UI §3.9.1 公告条 / §3.9.3 提示卡 / §3.9.5 错误码落点 / §3.9.4 成功后的常驻信息条）。
 *
 * 两种形态、同一件组件（不为"公告"与"提示卡"分叉出第二份实现）：
 *  - `layout='bar'`  = R-01⑧ 固定公告一句（`LOGIN_METHOD_NOTICE`），12px、无动作；
 *  - `layout='card'` = §3.9.5 的"提示卡"落点（`PHONE_ALREADY_REGISTERED` / `NO_PASSWORD_ACCOUNT` /
 *    `REGISTER_CLOSED`）：`--brand-soft` 底、`p-3`、`rounded-lg`、可选一颗文字按钮动作。
 *
 * 边界：本件**不读码、不读时钟、不发请求**（§3.5 `ui-no-io`）——码→文案的映射由调用方按
 * `@tm/shared/constants/errors.ts` 给出，"常驻 6 秒"这类计时由宿主（T-16/T-19）负责，
 * 时长常量同样 import 自 `@tm/shared` 的 `TOAST_LONG_MS`，本文件不出现第二个值。
 */
import * as React from 'react';
import { cn } from '../host.js';

export type NoticeBarTone = 'info' | 'brand' | 'success' | 'warning' | 'danger';
export type NoticeBarLayout = 'bar' | 'card';

export interface NoticeBarAction {
  /** 动作文案（唯一源 `@tm/shared`，如 `AUTH_COPY.noPasswordAccount.action`）。 */
  label: string;
  onClick: () => void;
}

export interface NoticeBarProps {
  /** 正文（必填）：一律 import 自 `@tm/shared`（`notice.ts` / `errors.ts` / `copy.ts`）。 */
  children: React.ReactNode;
  /** 提示卡标题（§3.9.3 `cardTitle`）。`bar` 形态忽略。 */
  title?: string;
  tone?: NoticeBarTone;
  layout?: NoticeBarLayout;
  action?: NoticeBarAction;
  /** 传 `false` 关掉图标；不传则按 tone 给默认线性图标（§3.9.6 错误三重编码）。 */
  icon?: React.ReactNode | false;
  /** 公告 = `status`；错误提示 = `alert`（UI §3.9.6 / §7.6）。 */
  role?: 'status' | 'alert';
  id?: string;
  className?: string;
  testid?: string;
}

const TONE_CLASS: Record<NoticeBarTone, Record<NoticeBarLayout, string>> = {
  info: { bar: 'bg-sunken text-ink-muted border-hair', card: 'bg-sunken text-ink border-hair' },
  brand: { bar: 'bg-brand-soft text-brand-strong border-brand-soft', card: 'bg-brand-soft text-ink border-brand-soft' },
  success: { bar: 'bg-success-soft text-ink border-success-soft', card: 'bg-success-soft text-ink border-success-soft' },
  warning: { bar: 'bg-warning-soft text-ink border-warning-soft', card: 'bg-warning-soft text-ink border-warning-soft' },
  danger: { bar: 'bg-danger-soft text-ink border-danger-soft', card: 'bg-danger-soft text-ink border-danger-soft' },
};

/** 18px 线性钥匙（§3.9.3 第 2 步点名的 `KeyRound`，本包不引图标库，与 patterns 同做法）。 */
function KeyGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-[18px] w-[18px] shrink-0', className)}
    >
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.2-8.2" />
      <path d="m17 6 2 2" />
      <path d="m14.5 8.5 2 2" />
    </svg>
  );
}

function AlertGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-[18px] w-[18px] shrink-0', className)}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function defaultIcon(tone: NoticeBarTone): React.JSX.Element | null {
  if (tone === 'brand') return <KeyGlyph />;
  if (tone === 'danger' || tone === 'warning') return <AlertGlyph />;
  return null;
}

export function NoticeBar({
  children,
  title,
  tone = 'info',
  layout = 'bar',
  action,
  icon,
  role = layout === 'card' ? 'alert' : 'status',
  id,
  className,
  testid,
}: NoticeBarProps): React.JSX.Element {
  const glyph = icon === false ? null : (icon ?? defaultIcon(tone));
  return (
    <div
      id={id}
      role={role}
      data-testid={testid ?? (layout === 'card' ? 'notice-card' : 'notice-bar')}
      data-tone={tone}
      data-layout={layout}
      className={cn(
        'flex items-start gap-2 rounded-lg border',
        layout === 'card' ? 'p-3' : 'px-3 py-2',
        TONE_CLASS[tone][layout],
        className,
      )}
    >
      {glyph ? <span className="mt-0.5 shrink-0">{glyph}</span> : null}
      <span className="min-w-0 flex-1">
        {title && layout === 'card' ? (
          <span data-slot="notice-title" className="block text-sm font-medium text-ink">
            {title}
          </span>
        ) : null}
        <span
          data-slot="notice-body"
          className={cn('block', layout === 'card' ? 'text-xs leading-relaxed' : 'text-xs leading-relaxed')}
        >
          {children}
        </span>
        {action ? (
          <button
            type="button"
            data-slot="notice-action"
            data-auth-affordance="notice-action"
            onClick={action.onClick}
            className={cn(
              'mt-1 inline-flex min-h-tap items-center py-3 text-sm text-brand underline-offset-2',
              'hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {action.label}
          </button>
        ) : null}
      </span>
    </div>
  );
}

export default NoticeBar;
