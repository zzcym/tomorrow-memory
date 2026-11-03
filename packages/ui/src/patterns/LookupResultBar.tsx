'use client';

/**
 * `LookupResultBar`（UI §3.2；R-09 ④ / R-14 ⑥ / R-16 ②）。
 *
 * 结构定案（§3.2 末：禁 `<a>` 嵌 `<button>`）：根 = `<div role="group">` + **显式 `<a>`「查看详情」**，
 * 喇叭 / 星标 / 方向链与 `<a>` 平铺；整卡可点靠根上的 `onClick`，行内控件 `stopPropagation`。
 * `layout='row'` = 中→英列表条目（词 + 首义 + 喇叭，行高 ≥52px）。
 */
import * as React from 'react';
import { ARIA, LOOKUP_COPY, STUDY_COPY, VERBS } from '@tm/shared';
import { cn, useHost } from '../host.js';
import { useSpeak } from '../hooks/use-speak.js';

export interface LookupResultBarProps {
  word: string;
  phonetic?: string;
  gloss?: string;
  layout?: 'card' | 'row';
  detailHref: string;
  onOpen?: (href: string) => void;
  detailLabel?: string;
  detailAriaLabel?: string;
  inWordbook?: boolean;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  favoritedLabel?: string;
  onSpeak?: (word: string) => void;
  speakLabel?: (word: string) => string;
  speakingLabel?: string;
  ttsUnavailable?: boolean;
  ttsUnavailableHint?: string;
  onSpeakUnavailable?: () => void;
  /** 行内提示右侧 ✕ 的可访问名（§3.4.3：保留 12s、用户可关；文案归宿主）。 */
  dismissHintLabel?: string;
  onDirectionChange?: () => void;
  directionLabel?: string;
  directionAriaLabel?: string;
  partial?: boolean;
  partialHint?: string;
  staleHint?: string;
  ariaLive?: 'polite' | 'off';
  className?: string;
  testid?: string;
}

function SpeakerGlyph({ filled }: { filled: boolean }): React.JSX.Element {
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
      {filled ? <path d="M19.1 5.6a9 9 0 0 1 0 12.8M15.5 8.5a5 5 0 0 1 0 7" /> : null}
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
      className="h-6 w-6"
    >
      <path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.8l5.8-.9L12 3.6Z" />
    </svg>
  );
}

const TAP =
  'inline-flex h-tap w-tap items-center justify-center rounded-full transition-transform duration-tap ease-standard ' +
  'active:scale-[.94] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

function LookupResultBar({
  word,
  phonetic = '',
  gloss = '',
  layout = 'card',
  detailHref,
  onOpen,
  detailLabel = LOOKUP_COPY.resultActions.detail,
  detailAriaLabel,
  inWordbook,
  onToggleFavorite,
  favoriteLabel = VERBS.favorite,
  favoritedLabel = VERBS.favorited,
  onSpeak,
  speakLabel = ARIA.speak,
  speakingLabel,
  ttsUnavailable = false,
  ttsUnavailableHint = STUDY_COPY.ttsUnavailable,
  onSpeakUnavailable,
  dismissHintLabel,
  onDirectionChange,
  directionLabel,
  directionAriaLabel,
  partial = false,
  partialHint,
  staleHint,
  ariaLive = 'polite',
  className,
  testid,
}: LookupResultBarProps): React.JSX.Element {
  const host = useHost();
  const native = useSpeak();
  const [hintVisible, setHintVisible] = React.useState(false);

  const open = (event: React.SyntheticEvent): void => {
    event.stopPropagation();
    if (onOpen) onOpen(detailHref);
    else host.navigate(detailHref);
  };

  const speak = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (ttsUnavailable) {
      setHintVisible(true);
      onSpeakUnavailable?.();
      return;
    }
    if (onSpeak) onSpeak(word);
    else native.speak(word);
  };

  const speaking = !onSpeak && native.speaking;
  const isRow = layout === 'row';
  const showGloss = gloss.trim().length > 0;

  return (
    <div
      role="group"
      aria-live={ariaLive}
      data-testid={testid}
      onClick={open}
      className={cn(
        'relative cursor-pointer border border-hair bg-surface text-ink',
        'transition-[box-shadow,transform,border-color] duration-micro ease-standard',
        'hover:border-brand/40 hover:shadow-elev-2 active:scale-[.99]',
        'focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-2',
        isRow ? 'flex min-h-[52px] items-center gap-2 px-4 py-2' : 'rounded-xl p-4',
        className,
      )}
    >
      <div className={cn('min-w-0 flex-1', isRow ? '' : 'flex flex-wrap items-baseline gap-2')}>
        <span lang="en" className="font-latin text-h3 font-extrabold text-ink max-md:text-h3-xs">
          {word}
        </span>
        {phonetic ? (
          <span lang="en" className="font-latin text-sm text-ink-muted">
            {phonetic}
          </span>
        ) : null}
        {onSpeak || !isRow ? (
          <button
            type="button"
            aria-label={speaking ? (speakingLabel ?? speakLabel(word)) : speakLabel(word)}
            onClick={speak}
            className={cn(TAP, 'ml-1 h-8 w-8 bg-brand-soft text-brand hover:bg-brand hover:text-on-brand')}
          >
            <SpeakerGlyph filled={!ttsUnavailable} />
          </button>
        ) : null}
        {ttsUnavailable && hintVisible ? (
          <span className="block w-full text-xs text-warning">
            <button type="button" onClick={(e) => { e.stopPropagation(); onSpeakUnavailable?.(); }} className="underline underline-offset-2">
              {ttsUnavailableHint}
            </button>
            {dismissHintLabel ? (
              <button
                type="button"
                aria-label={dismissHintLabel}
                onClick={(e) => { e.stopPropagation(); setHintVisible(false); }}
                className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-warning"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </span>
        ) : null}

        <span
          className={cn(
            'block min-w-0 text-sm leading-[1.6] text-ink-muted',
            isRow ? 'truncate' : 'line-clamp-2 max-md:line-clamp-1',
          )}
        >
          {showGloss ? gloss : partial && partialHint ? partialHint : null}
        </span>
        {staleHint ? <span className="block w-full text-xs text-ink-muted">{staleHint}</span> : null}
        {!isRow && directionLabel && onDirectionChange ? (
          <button
            type="button"
            aria-label={directionAriaLabel ?? directionLabel}
            onClick={(e) => { e.stopPropagation(); onDirectionChange(); }}
            className="mt-2 block w-fit text-xs text-ink-muted underline decoration-transparent underline-offset-2 transition-colors duration-micro ease-standard hover:text-ink hover:decoration-current focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            {directionLabel}
          </button>
        ) : null}
      </div>

      <div className={cn('flex shrink-0 items-center gap-1', isRow ? '' : 'self-start')}>
        <a
          href={detailHref}
          aria-label={detailAriaLabel ?? detailLabel}
          onClick={open}
          className={cn(
            'inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-sm text-brand',
            'underline decoration-transparent underline-offset-2 hover:decoration-current hover:text-brand-strong',
            'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
          )}
        >
          <span className="max-[360px]:hidden">{detailLabel}</span>
          <span aria-hidden="true">›</span>
        </a>
        {onToggleFavorite ? (
          <button
            type="button"
            aria-pressed={Boolean(inWordbook)}
            aria-label={inWordbook ? ARIA.unfavorite(word) : ARIA.favorite(word)}
            title={inWordbook ? favoritedLabel : favoriteLabel}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              TAP,
              inWordbook
                ? 'text-brand animate-fade-in hover:text-brand-strong'
                : 'text-ink-muted hover:text-brand',
            )}
          >
            <StarGlyph filled={Boolean(inWordbook)} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { LookupResultBar };
