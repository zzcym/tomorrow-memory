'use client';

/**
 * `Flashcard`（UI §3.5.2 / §3.5.3 / §3.5.5；R-11 ①②③ / R-14 ②③ / R-16 ①）。
 *
 * - **无 3D 翻转**：正/背切换 = 内容替换 + `animate-fade-in`（`--dur-micro`），
 *   §3.5.3 明写的必删项（透视、双层 `backface-visibility`、卡内 `overflow:auto`）一个都不留。
 * - 背面高度自适应，卡内不套滚动容器（长内容走详情页）。
 * - 横滑提交：`touch-action: pan-y`，≥24px 出胶囊、≥`FLASHCARD_SWIPE_THRESHOLD_PX` 松手提交、
 *   纵向 >12px 判为滚动并终止手势。左右两端一律走 `RATING_VALUES` 数组首末位，不写字面量。
 * - 无释义（§3.5.5）：不评分的盲路径**禁止**，只能"重试"或"今天先跳过"。
 */
import * as React from 'react';
import {
  ARIA,
  CARD_FLIP_KEYS,
  FLASHCARD_SWIPE_THRESHOLD_PX,
  RATING_VALUES,
  STUDY_COPY,
  VERBS,
  formatInflections,
  ratingLabel,
  type ExamplePair,
  type RatingValue,
  type TranslationGroup,
} from '@tm/shared';
import { cn, useHost } from '../host.js';
import { Progress } from '../primitives/progress.js';
import { SkeletonBlock } from './SkeletonBlock.js';

export type FlashcardSide = 'front' | 'back';

const PILL_PX = 24;
const VERTICAL_ABORT_PX = 12;

export interface FlashcardProps {
  word: string;
  phonetic?: string;
  side: FlashcardSide;
  onFlip?: () => void;
  groups?: TranslationGroup[];
  examples?: ExamplePair[];
  inflections?: ReadonlyArray<{ tag: string; form: string }>;
  mnemonic?: React.ReactNode;
  index: number;
  total: number;
  progressValueText?: string;
  progressDone?: number;
  progressTotal?: number;
  onSpeak?: (word: string) => void;
  speakLabel?: (word: string) => string;
  ttsUnavailable?: boolean;
  ttsUnavailableHint?: string;
  noGloss?: boolean;
  noGlossHint?: string;
  onRetryGloss?: () => void;
  onSkip?: () => void;
  onOpenDetail?: () => void;
  detailLabel?: string;
  inWordbook?: boolean;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  favoritedLabel?: string;
  undo?: { remaining: number; onUndo: () => void; label?: string; ariaLabel?: string };
  swipeSubmit?: boolean;
  onSwipeRating?: (rating: RatingValue) => void;
  hint?: string;
  loading?: boolean;
  className?: string;
  testid?: string;
}

function Flashcard(
  {
    word,
    phonetic = '',
    side,
    onFlip,
    groups = [],
    examples = [],
    inflections = [],
    mnemonic,
    index,
    total,
    progressValueText,
    progressDone,
    progressTotal,
    onSpeak,
    speakLabel = ARIA.speak,
    ttsUnavailable = false,
    ttsUnavailableHint,
    noGloss = false,
    noGlossHint,
    onRetryGloss,
    onSkip,
    onOpenDetail,
    detailLabel,
    inWordbook,
    onToggleFavorite,
    favoriteLabel = VERBS.favorite,
    favoritedLabel = VERBS.favorited,
    undo,
    swipeSubmit = false,
    onSwipeRating,
    hint,
    loading = false,
    className,
    testid,
  }: FlashcardProps,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.JSX.Element {
  const host = useHost();
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const origin = React.useRef({ x: 0, y: 0 });
  const axis = React.useRef<'x' | 'y' | null>(null);
  /**
   * bug_list #7：横滑**不再要求先翻面**（原先 `side === 'back'` 是唯一门槛）。
   * 放开之后正面多出一个副作用：正面整卡是一颗「显示释义」按钮（`.Flashcard.tsx` 下方的覆盖层），
   * 手指滑完松手时浏览器还会补一次 click，那一下会把卡翻过去 —— 于是用这枚 ref 把
   * 「刚滑过」的那次 click 在捕获阶段吞掉（`onClickCapture` 挂在卡片容器上）。
   */
  const swipedRef = React.useRef(false);

  const swipeOn = swipeSubmit && onSwipeRating !== undefined && !noGloss;

  const submitSwipe = (travel: number): void => {
    if (!onSwipeRating) return;
    const forget = RATING_FIRST;
    const easy = RATING_VALUES[RATING_VALUES.length - 1];
    if (travel <= -FLASHCARD_SWIPE_THRESHOLD_PX && forget !== undefined) onSwipeRating(forget);
    else if (travel >= FLASHCARD_SWIPE_THRESHOLD_PX && easy !== undefined) onSwipeRating(easy);
    setDx(0);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!swipeOn || event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY };
    axis.current = null;
    swipedRef.current = false;
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!swipeOn || !dragging) return;
    const mx = event.clientX - origin.current.x;
    const my = event.clientY - origin.current.y;
    if (axis.current === null && (Math.abs(mx) > 3 || Math.abs(my) > VERTICAL_ABORT_PX)) {
      axis.current = Math.abs(my) > VERTICAL_ABORT_PX && Math.abs(my) > Math.abs(mx) ? 'y' : 'x';
    }
    if (axis.current !== 'x') return;
    if (Math.abs(mx) >= PILL_PX) swipedRef.current = true;
    setDx(mx);
  };

  const onPointerEnd = (): void => {
    if (!swipeOn || !dragging) return;
    setDragging(false);
    if (Math.abs(dx) < PILL_PX) {
      setDx(0);
      return;
    }
    submitSwipe(dx);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!onFlip) return;
    if ((CARD_FLIP_KEYS as readonly string[]).includes(event.key)) {
      event.preventDefault();
      onFlip();
    }
  };

  if (loading) {
    return (
      <div ref={ref} data-testid={testid} className={cn('w-full', className)}>
        <SkeletonBlock variant="flashcard" />
      </div>
    );
  }

  const showPill = swipeOn && Math.abs(dx) >= PILL_PX;
  const pillRight = dx > 0;
  const easyLabel = RATING_VALUES[RATING_VALUES.length - 1];
  const pillText = pillRight
    ? easyLabel !== undefined
      ? ratingLabel(easyLabel)
      : ''
    : RATING_FIRST !== undefined
      ? ratingLabel(RATING_FIRST)
      : '';

  return (
    <div
      ref={ref}
      data-testid={testid}
      data-side={side}
      onKeyDown={onKeyDown}
      className={cn('relative w-full select-none', className)}
    >
      <div className="mb-2 flex items-center gap-3">
        <p aria-live="polite" className="text-xs text-ink-muted tnum">
          {STUDY_COPY.progress(index, total)}
        </p>
        {progressDone !== undefined && progressTotal !== undefined ? (
          <Progress
            className="h-1.5 flex-1"
            value={progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}
            valueText={progressValueText}
            aria-label={STUDY_COPY.progress(index, total)}
          />
        ) : null}
        {undo && undo.remaining > 0 ? (
          <button
            type="button"
            aria-label={undo.ariaLabel ?? ARIA.undoRating}
            onClick={() => undo.onUndo()}
            className={cn(
              'inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-xs text-ink-muted',
              'transition-colors duration-micro ease-standard hover:text-brand',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
            )}
          >
            <span aria-hidden="true">↺</span>
            {undo.label ?? STUDY_COPY.undo.button}
          </button>
        ) : null}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={() => {
          setDragging(false);
          setDx(0);
        }}
        /* bug_list #7：刚横滑过的那一次 click 在捕获阶段吞掉 —— 否则正面松手会顺带翻面。 */
        onClickCapture={(event) => {
          if (!swipedRef.current) return;
          swipedRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{ transform: `translateX(${String(dx)}px)` }}
        className={cn(
          'relative overflow-hidden rounded-xl border border-hair bg-surface shadow-elev-1',
          swipeOn && 'touch-pan-y',
          !dragging && 'transition-transform duration-micro ease-standard',
        )}
      >
        <div key={side} className={cn('p-5', animateClass())}>
          {side === 'front' ? (
            <>
              {/* §3.5.2：整卡正面是一颗「显示释义」按钮，喇叭是它的**兄弟节点**（禁嵌套交互元素）。
                  覆盖层在前、内容层 `pointer-events-none` → 点击落到翻面按钮；
                  喇叭自带 `pointer-events-auto` 且排在后 → 仍在最上层可点（音标右侧 8px，R-14 ②）。 */}
              <button
                type="button"
                aria-label={STUDY_COPY.cardFaceHint}
                onClick={() => onFlip?.()}
                className={cn(
                  'absolute inset-0 h-full w-full cursor-pointer rounded-xl',
                  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                )}
              />
              <div className="pointer-events-none relative flex min-h-[168px] flex-col items-center justify-center gap-2 text-center">
                <span lang="en" className="font-latin text-display font-extrabold text-ink max-md:text-display-xs">
                  {word}
                </span>
                <span className="flex items-center gap-2">
                  {phonetic ? (
                    <span lang="en" className="font-latin text-sm text-ink-muted">
                      {phonetic}
                    </span>
                  ) : null}
                  {onSpeak ? (
                    <button
                      type="button"
                      aria-label={speakLabel(word)}
                      onClick={() => {
                        if (ttsUnavailable) {
                          if (ttsUnavailableHint) host.toast(ttsUnavailableHint, 'info');
                          return;
                        }
                        onSpeak(word);
                      }}
                      className={cn(
                        'pointer-events-auto inline-flex h-tap w-tap items-center justify-center rounded-full bg-brand-soft text-brand',
                        'transition-transform duration-tap ease-standard hover:bg-brand hover:text-on-brand active:scale-[.94]',
                        'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                      )}
                    >
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
                    </button>
                  ) : null}
                </span>
                {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
              </div>
            </>
          ) : noGloss ? (
            <div className="flex min-h-[168px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-h3 font-bold text-ink">{STUDY_COPY.noGloss.title}</p>
              {noGlossHint ? <p className="text-sm text-ink-muted">{noGlossHint}</p> : null}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onRetryGloss ? (
                  <button
                    type="button"
                    onClick={onRetryGloss}
                    className={cn(
                      'inline-flex min-h-tap items-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand',
                      'hover:bg-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                    )}
                  >
                    {STUDY_COPY.noGloss.retry}
                  </button>
                ) : null}
                {onSkip ? (
                  <button
                    type="button"
                    onClick={onSkip}
                    className={cn(
                      'inline-flex min-h-tap items-center rounded-lg border border-hair bg-surface px-4 text-sm text-ink',
                      'hover:bg-brand-soft hover:text-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                    )}
                  >
                    {STUDY_COPY.noGloss.skip}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span lang="en" className="font-latin text-h3 font-bold text-ink max-md:text-h3-xs">
                    {word}
                  </span>
                  {phonetic ? (
                    <span lang="en" className="font-latin text-2xs text-ink-muted">
                      {phonetic}
                    </span>
                  ) : null}
                </span>
                {onToggleFavorite ? (
                  <button
                    type="button"
                    aria-pressed={Boolean(inWordbook)}
                    aria-label={ARIA.favorite(word)}
                    title={inWordbook ? favoritedLabel : favoriteLabel}
                    onClick={() => onToggleFavorite()}
                    className={cn(
                      'inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full',
                      'transition-transform duration-tap ease-standard active:scale-[.94]',
                      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                      inWordbook ? 'text-brand' : 'text-ink-muted hover:text-brand',
                    )}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill={inWordbook ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.8l5.8-.9L12 3.6Z" />
                    </svg>
                  </button>
                ) : null}
              </div>

              {groups.map((group, gi) => (
                <section key={`${group.pos}-${String(gi)}`}>
                  {group.pos ? (
                    <h3 className="mb-1 text-xs font-semibold text-brand">{group.pos}</h3>
                  ) : null}
                  <ol className="flex flex-col gap-1 text-sm leading-relaxed text-ink">
                    {group.meanings.map((meaning, mi) => (
                      <li key={`${group.pos}-${String(mi)}`} className="flex gap-1">
                        {group.meanings.length > 1 ? (
                          <span aria-hidden className="text-ink-muted tnum">
                            {`${String(mi + 1)}.`}
                          </span>
                        ) : null}
                        <span>{meaning}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              {inflections.length > 0 ? (
                <p className="text-xs text-ink-muted">{formatInflections(inflections)}</p>
              ) : null}

              {examples.length > 0 ? (
                <ul className="flex flex-col gap-1 border-t border-hair pt-3">
                  {examples.slice(0, 2).map((pair, i) => (
                    <li key={`ex-${String(i)}`} className="text-xs leading-relaxed">
                      <span lang="en" className="font-latin text-ink">
                        {pair.en}
                      </span>
                      <span className="mt-0.5 block text-ink-muted">{pair.zh}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {mnemonic ? (
                <div className="rounded-lg bg-sunken p-3 text-sm leading-relaxed text-ink">
                  {mnemonic}
                </div>
              ) : null}

              {onOpenDetail && detailLabel ? (
                <button
                  type="button"
                  onClick={onOpenDetail}
                  className={cn(
                    'mt-1 inline-flex min-h-tap w-fit items-center gap-1 rounded-md px-1 text-sm text-brand',
                    'underline decoration-transparent underline-offset-4 hover:decoration-current',
                    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                  )}
                >
                  {detailLabel}
                  <span aria-hidden="true">›</span>
                </button>
              ) : null}
            </div>
          )}
        </div>

        {showPill ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 flex h-9 -translate-y-1/2 items-center rounded-full px-3 text-xs font-semibold',
              pillRight ? 'left-3 bg-success-soft text-success' : 'right-3 bg-danger-soft text-danger',
            )}
          >
            {pillText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** §3.5.3：翻面 = 内容替换 + 淡入（不做 3D）。 */
function animateClass(): string {
  return 'animate-fade-in duration-micro ease-decelerate';
}

const RATING_FIRST = RATING_VALUES[0];

const FlashcardWithRef = React.forwardRef(Flashcard);
FlashcardWithRef.displayName = 'Flashcard';

export { FlashcardWithRef as Flashcard };
