'use client';

/**
 * `ReviewCta`（UI §3.1.2 C/D、§3.1.5 胶囊行、§3.1.6 无障碍）。
 *
 * 必须是 `<a>` 而不是 `<button>`（§3.1.6）；外锚点命中 ≥44px、内芯视觉高 36px。
 * 数字一律由宿主注入（`DueCountDto.dueToday`），文案唯一真源 `HOME_CAPSULE`（§6.4）。
 */
import * as React from 'react';
import { formatStreak, HOME_CAPSULE } from '@tm/shared';
import { cn, useHost } from '../host.js';

export interface ReviewCtaProps {
  due: number;
  href: string;
  onNavigate?: (href: string) => void;
  signedIn?: boolean;
  loading?: boolean;
  streak?: number;
  ariaLabel?: string;
  className?: string;
  testid?: string;
}

function ReviewCta({
  due,
  href,
  onNavigate,
  signedIn = true,
  loading = false,
  streak,
  ariaLabel,
  className,
  testid,
}: ReviewCtaProps): React.JSX.Element {
  const host = useHost();

  const text = !signedIn
    ? HOME_CAPSULE.signedOut(due)
    : due > 0
      ? HOME_CAPSULE.due(due)
      : HOME_CAPSULE.cleared;

  const label = ariaLabel ?? (streak != null ? `${text} · ${formatStreak(streak)}` : text);

  return (
    <a
      href={href}
      data-testid={testid}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        if (onNavigate) onNavigate(href);
        else host.navigate(href);
      }}
      className={cn(
        'grid min-h-tap place-items-center',
        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full bg-brand-soft px-4',
          'text-sm font-semibold text-brand',
          'transition-[transform,background-color,box-shadow] duration-micro ease-standard',
          'hover:shadow-elev-1 active:scale-[.97] active:bg-brand-soft',
        )}
      >
        {loading ? (
          <span aria-hidden="true" className="inline-block h-3 w-7 rounded-xs bg-sunken" />
        ) : (
          <span aria-hidden="true">{text}</span>
        )}
      </span>
    </a>
  );
}

export { ReviewCta };
