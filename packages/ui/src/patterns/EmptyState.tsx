'use client';

/**
 * `EmptyState`（UI §3.11.7 / §3.6.5 / §3.7.4；R-14 ④ / R-17 ③）。
 *
 * 三件套禁令：这里不是一块灰底配一句敷衍话。图标线性、`aria-hidden`、尺寸随 `size` 档走，
 * 标题一句人话、副标题解释**下一步做什么**、主按钮 1 颗（可选次按钮 / 纯文字链）。
 * 文案全部由 props 给（`WORDBOOK_COPY.*` / `STUDY_COPY.emptyQueue.*` / `PROGRESS_COPY.*` 是真源）。
 */
import * as React from 'react';
import { cn, useHost } from '../host.js';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  link?: EmptyStateAction;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'success';
  onNavigate?: (href: string) => void;
  className?: string;
  testid?: string;
}

const PAD: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'py-5',
  md: 'py-10',
  lg: 'py-16',
};

const ICON_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-16 w-16',
};

const BUTTON =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
  'transition-[transform,background-color] duration-tap ease-standard active:scale-[.97] ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

function ActionButton({
  action,
  variant,
  onNavigate,
}: {
  action: EmptyStateAction;
  variant: 'primary' | 'secondary';
  onNavigate: (href: string) => void;
}): React.JSX.Element {
  const classes =
    variant === 'primary'
      ? cn(BUTTON, 'bg-brand text-on-brand shadow-elev-1 hover:bg-brand-strong')
      : cn(BUTTON, 'border border-hair bg-surface text-ink hover:bg-brand-soft hover:text-brand-strong');
  if (action.href) {
    return (
      <a
        href={action.href}
        onClick={(event) => {
          event.preventDefault();
          if (action.onClick) action.onClick();
          else onNavigate(String(action.href));
        }}
        className={classes}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {action.label}
    </button>
  );
}

function EmptyState(
  {
    title,
    hint,
    icon,
    primary,
    secondary,
    link,
    size = 'md',
    tone = 'default',
    onNavigate,
    className,
    testid,
  }: EmptyStateProps,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.JSX.Element {
  const host = useHost();
  const go = onNavigate ?? ((href: string): void => host.navigate(href));

  return (
    <div
      ref={ref}
      data-testid={testid}
      className={cn(
        'mx-auto flex w-full max-w-read flex-col items-center justify-center gap-3 px-6 text-center',
        PAD[size],
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center',
            ICON_SIZE[size],
            tone === 'success' ? 'text-success' : 'text-ink-muted',
          )}
        >
          {icon}
        </span>
      ) : null}
      <p className="text-body font-medium leading-snug text-ink">{title}</p>
      {hint ? (
        <p className="line-clamp-2 max-w-list text-sm leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
      {primary || secondary ? (
        <div className="mt-1 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {primary ? <ActionButton action={primary} variant="primary" onNavigate={go} /> : null}
          {secondary ? (
            <ActionButton action={secondary} variant="secondary" onNavigate={go} />
          ) : null}
        </div>
      ) : null}
      {link ? (
        link.href ? (
          <a
            href={link.href}
            onClick={(event) => {
              event.preventDefault();
              if (link.onClick) link.onClick();
              else go(String(link.href));
            }}
            className={cn(
              'inline-flex min-h-tap items-center rounded-md px-2 text-sm text-brand underline-offset-4',
              'hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {link.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={link.onClick}
            className={cn(
              'inline-flex min-h-tap items-center rounded-md px-2 text-sm text-brand underline-offset-4',
              'hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {link.label}
          </button>
        )
      ) : null}
    </div>
  );
}

const EmptyStateWithRef = React.forwardRef(EmptyState);
EmptyStateWithRef.displayName = 'EmptyState';

export { EmptyStateWithRef as EmptyState };
