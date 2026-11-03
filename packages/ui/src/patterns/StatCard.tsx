'use client';

/**
 * `StatCard`（UI §3.7.2 / §3.7.3；R-18 ②③）。
 *
 * 数字 `text-2xl font-bold leading-none tnum` + 标签 `text-xs text-ink-muted`，**左对齐**；
 * `0` 必须显示 `0`（§3.7.4 禁"暂无"），≥100 走 `formatCount` 的唯一一份 `99+`。
 * 有 `onClick` 时整卡是**一个** `<button>`（右侧 `›` 纯装饰 `aria-hidden`），不再嵌控件。
 */
import * as React from 'react';
import { formatCount } from '@tm/shared';
import { cn } from '../host.js';
import { SkeletonBlock } from './SkeletonBlock.js';

export type StatCardTone = 'default' | 'brand' | 'warning';

export interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  delta?: string;
  tone?: StatCardTone;
  onClick?: () => void;
  loading?: boolean;
  ariaLive?: 'polite' | 'off';
  valueText?: string;
  testid?: string;
  className?: string;
}

const TONE_TEXT: Record<StatCardTone, string> = {
  default: 'text-ink',
  brand: 'text-brand-strong',
  warning: 'text-warning',
};

const BASE =
  'flex h-full w-full flex-col items-start justify-center gap-1 rounded-xl border border-hair ' +
  'bg-surface p-4 text-left transition-[box-shadow,transform,border-color] duration-micro ease-standard ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

function StatCard(
  {
    label,
    value,
    unit,
    delta,
    tone = 'default',
    onClick,
    loading = false,
    ariaLive = 'off',
    valueText,
    testid,
    className,
  }: StatCardProps,
  ref: React.ForwardedRef<HTMLElement>,
): React.JSX.Element {
  const numeric = typeof value === 'number';
  const shown = numeric ? formatCount(value) : value;
  const spoken = valueText ?? `${label} ${numeric ? String(value) : shown}`;

  const body = (
    <>
      <span className="text-xs leading-none text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className={cn('text-2xl font-bold leading-none tnum', TONE_TEXT[tone])}>
          {shown}
        </span>
        {unit ? <span className="text-xs leading-none text-ink-muted">{unit}</span> : null}
      </span>
      {delta ? <span className="text-2xs leading-none text-ink-muted">{delta}</span> : null}
    </>
  );

  if (loading) {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        data-testid={testid}
        aria-disabled
        className={cn(BASE, 'pointer-events-none', className)}
      >
        <SkeletonBlock variant="stat-card" />
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        data-testid={testid}
        aria-label={spoken}
        aria-live={ariaLive}
        onClick={onClick}
        className={cn(BASE, 'hover:bg-brand-soft/60 active:scale-[.99]', className)}
      >
        <span className="flex w-full items-center justify-between gap-2">
          {body}
          <span aria-hidden className="text-ink-muted">
            ›
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      data-testid={testid}
      aria-live={ariaLive}
      className={cn(BASE, className)}
    >
      {body}
    </div>
  );
}

const StatCardWithRef = React.forwardRef(StatCard);
StatCardWithRef.displayName = 'StatCard';

export { StatCardWithRef as StatCard };
