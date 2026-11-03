'use client';

/**
 * `RatingBar`（UI §3.5.4 / §7.4；判据②；R-11 ①④ / R-12 ①）。
 *
 * 四档**同权重**：同一 `grid-cols-4` 轨道、同一尺寸、同一字重，没有主推实心档，
 * 也没有任何 `.primary-rate` 之类的第 5 档（§3.5.4 明写必删项）。
 * 数值域 `RATING_VALUES`、标签序 `RATING_LABELS_ORDERED`、可访问名 `ARIA.rating`、
 * 撤销上限 `UNDO_MAX_PER_SESSION` **一律 import 自 `@tm/shared`**：
 * 本文件内 `[1,2,3,4]` 一个字面量都不出现（`test/patterns.spec.tsx` 做源码级断言）。
 */
import * as React from 'react';
import {
  ARIA,
  PLAIN_TERMS,
  RATING_KEY_MAP,
  RATING_LABELS_ORDERED,
  RATING_VALUES,
  UNDO_MAX_PER_SESSION,
  ratingLabel,
  type RatingValue,
} from '@tm/shared';
import { cn } from '../host.js';

/** 四档色按 `RATING_VALUES` 的**数组序**映射（不是按数值），所以顺序换了两端一起换。 */
const TONE_CLASSES = [
  'bg-danger-soft text-danger hover:bg-danger hover:text-on-brand',
  'bg-warning-soft text-warning hover:bg-warning hover:text-on-brand',
  'bg-brand-soft text-brand hover:bg-brand hover:text-on-brand',
  'bg-success-soft text-success hover:bg-success hover:text-on-brand',
] as const;

export interface RatingBarProps {
  onSelect: (rating: RatingValue) => void;
  intervals?: Partial<Record<RatingValue, string>>;
  showIntervals?: boolean;
  labels?: readonly string[];
  disabled?: boolean;
  pending?: RatingValue | null;
  undo?: {
    onUndo: () => void;
    remaining: number;
    label?: string;
    ariaLabel?: string;
  };
  maxUndo?: number;
  keyboard?: boolean;
  groupLabel?: string;
  ariaItemLabel?: (rating: RatingValue, interval: string) => string;
  hint?: string;
  hintKeyboard?: string;
  sticky?: boolean;
  className?: string;
  testid?: string;
}

function RatingBar(
  {
    onSelect,
    intervals,
    showIntervals = true,
    labels = RATING_LABELS_ORDERED,
    disabled = false,
    pending = null,
    undo,
    maxUndo = UNDO_MAX_PER_SESSION,
    keyboard = true,
    groupLabel = PLAIN_TERMS.retention,
    ariaItemLabel = (rating, interval) =>
      interval ? ARIA.rating(rating, interval) : ratingLabel(rating),
    hint,
    hintKeyboard,
    sticky = false,
    className,
    testid,
  }: RatingBarProps,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.JSX.Element {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!keyboard || disabled) return;
    const mapped = RATING_KEY_MAP[event.key];
    if (mapped !== undefined) {
      event.preventDefault();
      onSelect(mapped);
      return;
    }
    /* 方向键的"较差/较好"半档：只按 `RATING_VALUES` 的下标取，不写死数值。 */
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const weaker = RATING_VALUES[1];
      if (weaker !== undefined) onSelect(weaker);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const stronger = RATING_VALUES[2];
      if (stronger !== undefined) onSelect(stronger);
      return;
    }
    const asIndex = RATING_VALUES.map(String).indexOf(event.key);
    if (asIndex >= 0) {
      const picked = RATING_VALUES[asIndex];
      if (picked !== undefined) {
        event.preventDefault();
        onSelect(picked);
      }
    }
  };

  return (
    <div
      ref={ref}
      data-testid={testid}
      role="group"
      aria-label={groupLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'w-full border-t border-hair bg-surface px-4 pb-safe-bottom pt-3',
        sticky && 'sticky bottom-0 z-dock shadow-elev-2',
        className,
      )}
    >
      <div className="grid grid-cols-4 gap-2">
        {RATING_VALUES.map((rating, position) => {
          const label = labels[position] ?? ratingLabel(rating);
          const interval = intervals?.[rating] ?? '';
          const isPending = pending === rating;
          return (
            <button
              key={String(rating)}
              type="button"
              aria-disabled={disabled || undefined}
              aria-busy={isPending || undefined}
              aria-pressed={isPending || undefined}
              aria-label={ariaItemLabel(rating, interval)}
              onClick={() => {
                if (!disabled) onSelect(rating);
              }}
              className={cn(
                'flex min-h-tap flex-col items-center justify-center gap-0.5 rounded-lg',
                'font-medium transition-[transform,background-color,opacity] duration-tap ease-standard',
                'active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                TONE_CLASSES[position % TONE_CLASSES.length],
                isPending && 'opacity-60',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span className="text-sm leading-none">{label}</span>
              {showIntervals && interval ? (
                <span className="hidden text-2xs leading-none opacity-80 tnum md:block">
                  {interval}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {(undo && undo.remaining > 0) || hint || hintKeyboard ? (
        <div className="mt-2 flex min-h-6 items-center justify-between gap-3">
          {undo && undo.remaining > 0 ? (
            <button
              type="button"
              aria-label={undo.ariaLabel ?? ARIA.undoRating}
              disabled={disabled}
              onClick={() => undo.onUndo()}
              className={cn(
                'inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-xs text-ink-muted',
                'transition-colors duration-micro ease-standard hover:text-brand',
                'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
              )}
            >
              <span aria-hidden="true">↺</span>
              {undo.label ?? ARIA.undoRating}
              <span className="tnum opacity-70">{`${String(undo.remaining)}/${String(maxUndo)}`}</span>
            </button>
          ) : (
            <span />
          )}
          {hintKeyboard ? (
            <span className="hidden text-2xs text-ink-muted md:inline">{hintKeyboard}</span>
          ) : hint ? (
            <span className="text-2xs text-ink-muted md:hidden">{hint}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const RatingBarWithRef = React.forwardRef(RatingBar);
RatingBarWithRef.displayName = 'RatingBar';

export { RatingBarWithRef as RatingBar };
