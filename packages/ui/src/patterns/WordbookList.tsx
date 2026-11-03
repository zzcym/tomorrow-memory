'use client';

/**
 * `WordbookList`（UI §3.6.2 / §3.6.4 / §3.6.7；判据③；R-15 ①②⑥⑦）。
 *
 * 左滑删除 = **pointer events 手写**，零新依赖（App 侧 `assets/app.js` 的 `bindSwipe` 只作交互参考）。
 * 几何：露出阈值 24px、提交阈值 64px、删除块 76px（§3.6.4）；`touch-action: pan-y` 让纵向滚动
 * 仍归页面，横向位移 >12px 才接管手势。删除后 5 秒撤销窗口归宿主 Toast（§3.11.1）。
 *
 * 结构：`<ul>/<li>`；行内 `<a>`（整行文字区）与 `<button>`（喇叭 / 星标 / 删除）**平铺不嵌套**（§3.6.7）。
 * 组件不发任何请求、不读 kv：数据与回调全部 props 驱动（§3.5 `ui-no-io`）。
 */
import * as React from 'react';
import { ARIA, STUDY_COPY, VERBS, WORDBOOK_COPY } from '@tm/shared';
import { cn, useHost } from '../host.js';
import { useSpeak } from '../hooks/use-speak.js';
import { SkeletonBlock } from './SkeletonBlock.js';

/** §3.6.4 的三个几何值，集中在此便于 §8 走查比对。 */
const SWIPE_REVEAL_PX = 24;
const SWIPE_COMMIT_PX = 64;
const DELETE_BLOCK_PX = 76;
const VERTICAL_ABORT_PX = 12;

export interface WordbookRow {
  word: string;
  phonetic?: string;
  gloss?: string;
  meta?: string;
  badge?: { label: string; tone?: 'success' | 'brand' | 'neutral' };
  addedAt?: number;
  lastReview?: number;
  reviewCount?: number;
}

export interface WordbookListProps {
  items: WordbookRow[];
  hrefFor: (word: string) => string;
  onOpen?: (row: WordbookRow) => void;
  onDelete?: (row: WordbookRow, index: number) => void | Promise<void>;
  onToggleFavorite?: (row: WordbookRow) => void;
  onSpeak?: (word: string) => void;
  swipeDelete?: boolean;
  rowHrefOpensNewView?: boolean;
  variant?: 'page' | 'sidebar';
  rowAriaLabel?: (word: string) => string;
  speakLabel?: (word: string) => string;
  favoriteLabel?: string;
  favoritedLabel?: string;
  deleteLabel?: string;
  deleteAriaLabel?: (word: string) => string;
  undoLabel?: string;
  onUndoDelete?: (row: WordbookRow, index: number) => void;
  glossFallback?: string;
  metaPending?: boolean;
  loading?: boolean;
  empty?: React.ReactNode;
  className?: string;
  testid?: string;
}

const BADGE_TONE: Record<'success' | 'brand' | 'neutral', string> = {
  success: 'bg-success-soft text-success',
  brand: 'bg-brand-soft text-brand',
  neutral: 'bg-sunken text-ink-muted',
};

function SpeakerGlyph(): React.JSX.Element {
  return (
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
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

function StarGlyph({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.8l5.8-.9L12 3.6Z" />
    </svg>
  );
}

/** §3.6.4：行内删除是一颗 🗑（`text-ink-muted`、44 热区、默认不常驻红色以免整列血腥）。 */
function TrashGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

const CONTROL =
  'inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full text-ink-muted ' +
  'transition-colors duration-micro ease-standard hover:text-brand ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

/** 单行：自带手势状态，列表滚动时不会互相干扰（`key` 用 word，重复词由宿主去重）。 */
function WordbookListItem({
  row,
  index,
  href,
  onOpen,
  onDelete,
  onToggleFavorite,
  onSpeak,
  swipeDelete,
  rowHrefOpensNewView,
  variant,
  rowAriaLabel,
  speakLabel,
  favoriteLabel,
  favoritedLabel,
  deleteLabel,
  deleteAriaLabel,
  undoLabel,
  onUndoDelete,
  glossFallback,
  metaPending,
}: {
  row: WordbookRow;
  index: number;
  href: string;
  onOpen?: (row: WordbookRow) => void;
  onDelete?: (row: WordbookRow, index: number) => void | Promise<void>;
  onToggleFavorite?: (row: WordbookRow) => void;
  onSpeak?: (word: string) => void;
  swipeDelete: boolean;
  rowHrefOpensNewView: boolean;
  variant: 'page' | 'sidebar';
  rowAriaLabel?: (word: string) => string;
  speakLabel: (word: string) => string;
  favoriteLabel: string;
  favoritedLabel: string;
  deleteLabel: string;
  deleteAriaLabel?: (word: string) => string;
  undoLabel: string;
  onUndoDelete?: (row: WordbookRow, index: number) => void;
  glossFallback?: string;
  metaPending?: boolean;
}): React.JSX.Element {
  const host = useHost();
  const native = useSpeak();
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const origin = React.useRef({ x: 0, y: 0, offset: 0 });
  const moved = React.useRef(false);
  const axisLocked = React.useRef<'x' | 'y' | null>(null);

  const swipeEnabled = swipeDelete && onDelete !== undefined;

  const remove = (): void => {
    setOffset(0);
    if (!onDelete) return;
    void onDelete(row, index);
    if (onUndoDelete) {
      host.toast(WORDBOOK_COPY.swipeDelete.undoToast(row.word), {
        tone: 'info',
        action: { label: undoLabel, onClick: (): void => onUndoDelete(row, index) },
      });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!swipeEnabled || event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY, offset };
    moved.current = false;
    axisLocked.current = null;
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!swipeEnabled || !dragging) return;
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    if (axisLocked.current === null && (Math.abs(dx) > 3 || Math.abs(dy) > VERTICAL_ABORT_PX)) {
      axisLocked.current = Math.abs(dy) > VERTICAL_ABORT_PX && Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    if (axisLocked.current !== 'x') return;
    moved.current = true;
    const next = Math.min(0, Math.max(-DELETE_BLOCK_PX, origin.current.offset + dx));
    setOffset(next);
  };

  const endDrag = (): void => {
    if (!swipeEnabled || !dragging) return;
    setDragging(false);
    if (!moved.current) return;
    const travel = -offset;
    if (travel >= SWIPE_COMMIT_PX) {
      remove();
      return;
    }
    setOffset(travel >= SWIPE_REVEAL_PX ? -SWIPE_REVEAL_PX : 0);
  };

  const revealed = -offset >= SWIPE_REVEAL_PX;
  /* §3.6.7：星标必须带 `aria-pressed`。出现在单词本列表里的行即"已收藏"，
   * 未收藏态属于结果条 / 详情页（`LookupResultBar` / `WordDetailCard`），那里才有真正的翻转。 */
  const starPressed = onToggleFavorite !== undefined;

  return (
    <li
      data-testid="wordbook-row"
      data-swipe-open={revealed || undefined}
      className="relative isolate overflow-hidden border-b border-hair last:border-b-0"
    >
      {swipeEnabled ? (
        <div
          aria-hidden={!revealed}
          className={cn(
            'absolute inset-y-0 right-0 flex items-stretch justify-end bg-danger text-on-brand',
            !revealed && 'pointer-events-none',
          )}
          style={{ width: `${String(DELETE_BLOCK_PX)}px` }}
        >
          <button
            type="button"
            tabIndex={revealed ? 0 : -1}
            onClick={remove}
            className={cn(
              'flex h-full w-full items-center justify-center px-2 text-sm font-bold',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            {deleteLabel}
          </button>
        </div>
      ) : null}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          setDragging(false);
          setOffset(0);
        }}
        style={{ transform: `translateX(${String(offset)}px)` }}
        className={cn(
          'relative flex items-center gap-1 bg-surface',
          swipeEnabled && 'touch-pan-y',
          !dragging && 'transition-transform duration-micro ease-standard',
        )}
      >
        <a
          href={href}
          aria-label={rowAriaLabel ? rowAriaLabel(row.word) : undefined}
          onClick={(event) => {
            if (moved.current) {
              event.preventDefault();
              moved.current = false;
              return;
            }
            if (offset !== 0) {
              event.preventDefault();
              setOffset(0);
              return;
            }
            /* 侧栏形态：不劫持 href，列表因此不会被路由卸载（§3.6.6）。 */
            if (rowHrefOpensNewView) return;
            event.preventDefault();
            if (onOpen) onOpen(row);
            else host.navigate(href);
          }}
          className={cn(
            'min-w-0 flex-1 py-3 pl-4 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            variant === 'sidebar' ? 'min-h-[52px]' : 'min-h-[60px]',
          )}
        >
          <span className="flex items-baseline gap-2">
            <span lang="en" className="font-latin text-h3 font-bold text-ink max-md:text-h3-xs">
              {row.word}
            </span>
            {row.phonetic ? (
              <span lang="en" className="truncate font-latin text-2xs text-ink-muted">
                {row.phonetic}
              </span>
            ) : null}
            {row.badge ? (
              <span
                className={cn(
                  'ml-auto shrink-0 rounded-full px-2 py-0.5 text-2xs leading-none',
                  BADGE_TONE[row.badge.tone ?? 'neutral'],
                )}
              >
                {row.badge.label}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-sm leading-snug text-ink-muted">
            {metaPending && !row.gloss ? (
              <span aria-hidden className="block h-3 w-2/5 rounded-xs bg-sunken" />
            ) : (
              row.gloss || glossFallback || ''
            )}
          </span>
          {variant === 'page' && row.meta ? (
            <span className="mt-1 block truncate text-2xs leading-snug text-ink-muted tnum">
              {row.meta}
            </span>
          ) : null}
        </a>

        {/* §3.6.2 行1 右侧控件顺序：星标（已收藏）→ 喇叭 → 删除。三者都是 `<a>` 的兄弟节点。 */}
        {onToggleFavorite ? (
          <button
            type="button"
            aria-pressed={starPressed}
            aria-label={starPressed ? ARIA.unfavorite(row.word) : ARIA.favorite(row.word)}
            title={starPressed ? favoritedLabel : favoriteLabel}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(row);
            }}
            className={cn(CONTROL, starPressed && 'text-brand')}
          >
            <StarGlyph filled={starPressed} />
          </button>
        ) : null}

        {onSpeak ? (
          <button
            type="button"
            aria-label={speakLabel(row.word)}
            onClick={(event) => {
              event.stopPropagation();
              onSpeak(row.word);
            }}
            className={cn(CONTROL, native.speaking && 'text-brand')}
          >
            <SpeakerGlyph />
          </button>
        ) : null}

        {onDelete ? (
          <button
            type="button"
            aria-label={
              deleteAriaLabel ? deleteAriaLabel(row.word) : `${deleteLabel} ${row.word}`
            }
            title={deleteLabel}
            onClick={(event) => {
              event.stopPropagation();
              remove();
            }}
            className={cn(CONTROL, 'pr-4 hover:text-danger')}
          >
            <TrashGlyph />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function WordbookList(
  {
    items,
    hrefFor,
    onOpen,
    onDelete,
    onToggleFavorite,
    onSpeak,
    swipeDelete = true,
    rowHrefOpensNewView = false,
    variant = 'page',
    rowAriaLabel,
    speakLabel = ARIA.speak,
    favoriteLabel = VERBS.favorite,
    favoritedLabel = VERBS.favorited,
    deleteLabel = WORDBOOK_COPY.swipeDelete.confirm,
    deleteAriaLabel,
    undoLabel = STUDY_COPY.undo.button,
    onUndoDelete,
    glossFallback,
    metaPending = false,
    loading = false,
    empty,
    className,
    testid,
  }: WordbookListProps,
  ref: React.ForwardedRef<HTMLUListElement>,
): React.JSX.Element {
  if (loading) {
    return (
      <div className={cn('w-full', className)} data-testid={testid}>
        <SkeletonBlock variant="list-rows" rows={8} />
      </div>
    );
  }
  if (items.length === 0) {
    /* 空态不渲染 `<ul>`（没有 listitem 的列表对读屏是噪音），`ref` 此分支不挂载。 */
    return (
      <div className={className} data-testid={testid}>
        {empty ?? null}
      </div>
    );
  }
  return (
    <ul
      ref={ref}
      data-testid={testid}
      className={cn('w-full border-y border-hair', className)}
    >
      {items.map((row, index) => (
        <WordbookListItem
          key={`${row.word}-${String(index)}`}
          row={row}
          index={index}
          href={hrefFor(row.word)}
          onOpen={onOpen}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          onSpeak={onSpeak}
          swipeDelete={swipeDelete}
          rowHrefOpensNewView={rowHrefOpensNewView}
          variant={variant}
          rowAriaLabel={rowAriaLabel}
          speakLabel={speakLabel}
          favoriteLabel={favoriteLabel}
          favoritedLabel={favoritedLabel}
          deleteLabel={deleteLabel}
          deleteAriaLabel={deleteAriaLabel}
          undoLabel={undoLabel}
          onUndoDelete={onUndoDelete}
          glossFallback={glossFallback}
          metaPending={metaPending}
        />
      ))}
    </ul>
  );
}

const WordbookListWithRef = React.forwardRef(WordbookList);
WordbookListWithRef.displayName = 'WordbookList';

export { WordbookListWithRef as WordbookList };
