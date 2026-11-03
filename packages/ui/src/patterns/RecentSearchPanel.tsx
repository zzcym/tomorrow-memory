'use client';

/**
 * `RecentSearchPanel`（UI §3.3；R-10 ①②③⑤⑦）。
 *
 * 只在搜索框聚焦时出现：`open === false` → **整棵子树不渲染**（不是 `visibility:hidden`），
 * 于是未聚焦时 DOM 高度 0、不占首页布局（R-07 ④）。
 * 数据由宿主从 `useRecentSearches()`（`host.kv`）注入；点条目 = 复用缓存结果，组件不发请求（R-10 ③）。
 * 键盘：↑↓ 移焦、Enter 选中、Esc 关闭（§7.4）。
 */
import * as React from 'react';
import { LOOKUP_COPY, RECENT_MAX, type RecentSearchItemDto } from '@tm/shared';
import { cn } from '../host.js';

export interface RecentSearchPanelProps {
  open: boolean;
  items: RecentSearchItemDto[];
  onSelect: (item: RecentSearchItemDto) => void;
  onRequestClear?: () => void;
  clearLabel?: string;
  title?: string;
  timeLabel?: (at: number) => string;
  noGlossLabel?: string;
  emptyHint?: string;
  storageErrorHint?: string;
  onDismiss?: () => void;
  onActiveIndexChange?: (index: number | null) => void;
  id?: string;
  className?: string;
  listClassName?: string;
  maxHeightPx?: number;
  testid?: string;
}

function RecentSearchPanel({
  open,
  items,
  onSelect,
  onRequestClear,
  clearLabel = LOOKUP_COPY.recent.clear,
  title = LOOKUP_COPY.recent.title,
  timeLabel,
  noGlossLabel,
  emptyHint,
  storageErrorHint,
  onDismiss,
  onActiveIndexChange,
  id,
  className,
  listClassName,
  maxHeightPx = 320,
  testid,
}: RecentSearchPanelProps): React.JSX.Element | null {
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss?.();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const nodes = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-recent-item]') ?? [],
      );
      if (nodes.length === 0) return;
      event.preventDefault();
      const active = nodes.findIndex((n) => n === document.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = active === -1 ? 0 : Math.min(nodes.length - 1, Math.max(0, active + step));
      nodes[next]?.focus();
      onActiveIndexChange?.(next);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onActiveIndexChange, onDismiss, open]);

  if (!open) return null;

  const hasItems = items.length > 0;

  return (
    <div
      id={id}
      data-testid={testid}
      role="presentation"
      className={cn(
        'w-full overflow-hidden rounded-xl border border-hair bg-surface shadow-elev-2',
        className,
      )}
    >
      {storageErrorHint ? (
        <p className="px-4 py-3 text-sm text-ink-muted">{storageErrorHint}</p>
      ) : hasItems ? (
        <>
          <div className="flex min-h-9 items-center justify-between px-4 py-1">
            <span className="text-xs font-medium text-ink-muted">
              {title} · {items.length}
            </span>
            {onRequestClear ? (
              <button
                type="button"
                onClick={onRequestClear}
                className={cn(
                  'inline-flex min-h-tap items-center rounded-md px-2 text-xs text-brand',
                  'underline decoration-transparent underline-offset-2 hover:decoration-current',
                  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                )}
              >
                {clearLabel /* §6.5：同一动作全站同名 */}
              </button>
            ) : null}
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label={title}
            className={cn('max-h-none overflow-y-auto overscroll-contain py-1.5', listClassName)}
            style={{ maxHeight: `${maxHeightPx}px` }}
          >
            {items.slice(0, RECENT_MAX).map((item, index) => (
              <li key={`${item.word}-${String(item.direction)}-${String(index)}`} role="none">
                <button
                  type="button"
                  role="option"
                  data-recent-item=""
                  aria-selected={false}
                  id={id ? `${id}-${String(index)}` : undefined}
                  onClick={() => onSelect(item)}
                  className={cn(
                    'flex min-h-[48px] w-full items-center gap-3 px-4 text-left',
                    'transition-colors duration-micro ease-standard',
                    'hover:bg-brand-soft focus-visible:bg-brand-soft',
                    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                  )}
                >
                  <span lang="en" className="font-latin text-h3-xs font-bold text-ink">
                    {item.word}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                    {item.gloss || noGlossLabel || ''}
                  </span>
                  {timeLabel ? (
                    <span className="shrink-0 text-xs text-ink-muted tnum">
                      {timeLabel(item.at)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : emptyHint ? (
        <div className="flex min-h-[108px] items-center px-4 py-3">
          <p className="text-sm text-ink-muted">{emptyHint}</p>
        </div>
      ) : null}
    </div>
  );
}

export { RecentSearchPanel };
