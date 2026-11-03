'use client';

/**
 * `WordDetailCard`（UI §3.4 全节；R-09 ③④⑤⑥ / R-16 ② / R-14 ③⑤）。
 *
 * 卡内只有 §3.4 的 1–7 区 + 操作区；**顶栏与吸底操作条的外壳归宿主**（T-12 / T-17）。
 * 区块顺序锁死，**无内容的区块整块不渲染**（不出现空 `<h2>` 与空容器）。
 * 文案全部 props 驱动：`（英文释义 / 记忆法 / 立即背）`这类串在 `@tm/shared` 里，
 * shared 目前缺的常量以 **宿主注入** 标注（见 `README.md` 与 `04-dev-report-T-05.md`）。
 */
import * as React from 'react';
import {
  ARIA,
  INFLECTION_HIDDEN,
  INFLECTION_LABELS,
  LOOKUP_COPY,
  STUDY_COPY,
  VERBS,
  formatInflections,
  type ExamplePair,
  type TranslationGroup,
} from '@tm/shared';
import { cn, useHost } from '../host.js';
import { useSpeak } from '../hooks/use-speak.js';
import { Badge } from '../primitives/badge.js';
import { SkeletonBlock } from './SkeletonBlock.js';

export type MnemonicState = 'absent' | 'collapsed' | 'loading' | 'content' | 'failed';

export interface WordDetailSection {
  title: string;
  content: React.ReactNode;
}

export interface WordDetailCardProps {
  word: string;
  phonetic?: string;
  groups?: TranslationGroup[];
  freqLabel?: string;
  /** 区块标题：`@tm/shared` 缺这几个常量 → 宿主注入（见报告"提给 shared 的需求"）。 */
  meaningLabel?: string;
  inflectionLabel?: string;
  exampleLabel?: string;
  mnemonicLabel?: string;
  inflections?: ReadonlyArray<{ tag: string; form: string }>;
  examples?: ExamplePair[];
  examplesCollapseLabel?: (n: number) => string;
  enDefinition?: string;
  enDefinitionSlot?: React.ReactNode;
  enDefinitionLabel?: string;
  mnemonicState?: MnemonicState;
  mnemonic?: React.ReactNode;
  onMnemonicToggle?: () => void;
  onMnemonicRetry?: () => void;
  mnemonicCollapsedLabel?: string;
  mnemonicFailLabel?: string;
  onSpeak?: (word: string) => void;
  speakLabel?: (word: string) => string;
  ttsUnavailable?: boolean;
  ttsUnavailableHint?: string;
  onSpeakUnavailable?: () => void;
  inWordbook?: boolean;
  onToggleFavorite?: () => void;
  onStudy?: () => void;
  studyLabel?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  cachedHint?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
  testid?: string;
}

const HEAD = 'text-h3 font-bold text-ink max-md:text-h3-xs';
const SECTION_TITLE = 'mb-1 text-xs font-semibold text-ink-muted';
const LINK =
  'inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-sm text-brand ' +
  'underline decoration-transparent underline-offset-4 hover:decoration-current ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';
const BUTTON_PRIMARY =
  'inline-flex min-h-tap flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand ' +
  'transition-[transform,background-color] duration-tap ease-standard hover:bg-brand-strong active:scale-[.97] ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';
const BUTTON_SECONDARY =
  'inline-flex min-h-tap flex-1 items-center justify-center gap-2 rounded-lg border border-hair bg-surface px-4 text-sm text-ink ' +
  'transition-[transform,background-color] duration-tap ease-standard hover:bg-brand-soft hover:text-brand-strong active:scale-[.97] ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

/** §6.3：未知缩写与 `INFLECTION_HIDDEN` 整条不渲染（绝不上屏原始缩写）。 */
const visibleInflections = (
  entries: ReadonlyArray<{ tag: string; form: string }>,
): ReadonlyArray<{ tag: string; form: string }> =>
  entries.filter(
    (e) =>
      INFLECTION_LABELS[e.tag] !== undefined &&
      !(INFLECTION_HIDDEN as readonly string[]).includes(e.tag),
  );

function WordDetailCard(
  {
    word,
    phonetic = '',
    groups = [],
    freqLabel,
    meaningLabel,
    inflectionLabel,
    exampleLabel,
    mnemonicLabel,
    inflections = [],
    examples = [],
    examplesCollapseLabel,
    enDefinition,
    enDefinitionSlot,
    enDefinitionLabel,
    mnemonicState = 'absent',
    mnemonic,
    onMnemonicToggle,
    onMnemonicRetry,
    mnemonicCollapsedLabel,
    mnemonicFailLabel = STUDY_COPY.aiMnemonicFail,
    onSpeak,
    speakLabel = ARIA.speak,
    ttsUnavailable = false,
    ttsUnavailableHint = STUDY_COPY.ttsUnavailable,
    onSpeakUnavailable,
    inWordbook,
    onToggleFavorite,
    onStudy,
    studyLabel,
    backHref,
    onBack,
    backLabel = ARIA.back,
    cachedHint,
    loading = false,
    emptyTitle = LOOKUP_COPY.notFound.title,
    emptyHint = LOOKUP_COPY.notFound.subtitle,
    onRetry,
    retryLabel = VERBS.retry,
    secondaryAction,
    className,
    testid,
  }: WordDetailCardProps,
  ref: React.ForwardedRef<HTMLElement>,
): React.JSX.Element {
  const host = useHost();
  const native = useSpeak();
  const [examplesOpen, setExamplesOpen] = React.useState(false);
  const [definitionOpen, setDefinitionOpen] = React.useState(false);

  if (loading) {
    return (
      <article
        ref={ref}
        data-testid={testid}
        className={cn('rounded-xl border border-hair bg-surface p-4', className)}
      >
        {/* §3.11.3 / `LOOKUP_COPY.searching = null`：查词骨架**无文字**。 */}
        <SkeletonBlock variant="result-bar" />
      </article>
    );
  }

  const cleanInflections = visibleInflections(inflections);
  const hasMeaning = groups.some((g) => g.meanings.length > 0);
  const isEmpty =
    !hasMeaning && !enDefinition && !enDefinitionSlot && examples.length === 0 && !freqLabel;

  const speak = (): void => {
    if (ttsUnavailable) {
      host.toast(ttsUnavailableHint, 'info');
      if (onSpeakUnavailable) onSpeakUnavailable();
      return;
    }
    if (onSpeak) onSpeak(word);
    else native.speak(word);
  };

  return (
    <article
      ref={ref}
      data-testid={testid}
      className={cn('flex w-full flex-col gap-4 rounded-xl border border-hair bg-surface p-4', className)}
    >
      {backHref || onBack ? (
        <a
          href={backHref ?? '#'}
          onClick={(event) => {
            if (!onBack) return;
            event.preventDefault();
            onBack();
          }}
          className={cn(LINK, 'w-fit text-ink-muted')}
        >
          <span aria-hidden="true">‹</span>
          {backLabel}
        </a>
      ) : null}

      {cachedHint ? (
        <p className="text-xs text-ink-muted">{cachedHint}</p>
      ) : null}

      {isEmpty ? (
        <section aria-labelledby="word-detail-empty" className="flex flex-col items-start gap-2">
          <h2 id="word-detail-empty" className={HEAD}>
            {emptyTitle}
          </h2>
          <p className="text-sm text-ink-muted">{emptyHint}</p>
          <div className="flex w-full flex-wrap gap-2">
            {onRetry ? (
              <button type="button" onClick={onRetry} className={BUTTON_PRIMARY}>
                {retryLabel}
              </button>
            ) : null}
            {secondaryAction ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className={BUTTON_SECONDARY}
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          {/* 区 2：词头 + 音标 + 频率 Badge + 喇叭 */}
          <section aria-labelledby="word-detail-head" className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="word-detail-head" lang="en" className={cn(HEAD, 'font-latin')}>
                  {word}
                </h2>
                {freqLabel ? <Badge variant="neutral">{freqLabel}</Badge> : null}
              </div>
              {phonetic ? (
                <p lang="en" className="mt-1 font-latin text-sm text-ink-muted">
                  {phonetic}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={speakLabel(word)}
              onClick={speak}
              className={cn(
                'inline-flex h-tap w-tap shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand',
                'transition-[transform,background-color] duration-tap ease-standard hover:bg-brand hover:text-on-brand active:scale-[.94]',
                'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                native.speaking && 'animate-breath',
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
          </section>

          {/* 区 3：释义（词性分组，≥2 义项才编号） */}
          {hasMeaning ? (
            <section aria-label={meaningLabel} className="flex flex-col gap-3">
              {meaningLabel ? (
                <h3 className={cn(SECTION_TITLE, 'mb-0')}>{meaningLabel}</h3>
              ) : null}
              {groups
                .filter((g) => g.meanings.length > 0)
                .map((group, gi) => (
                  <div key={`${group.pos}-${String(gi)}`}>
                    {group.pos ? (
                      <p className="mb-1 text-sm font-semibold text-brand">{group.pos}</p>
                    ) : null}
                    <ol className="flex flex-col gap-1.5">
                      {group.meanings.map((meaning, mi) => (
                        <li key={`${group.pos}-${String(mi)}`} className="flex gap-1.5">
                          {group.meanings.length > 1 ? (
                            <span className="text-sm leading-relaxed text-ink-muted tnum">
                              {`${String(mi + 1)}.`}
                            </span>
                          ) : null}
                          <span className="text-sm leading-relaxed text-ink">{meaning}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
            </section>
          ) : null}

          {/* 区 4：词形变化 */}
          {cleanInflections.length > 0 ? (
            <section aria-label={inflectionLabel}>
              {inflectionLabel ? <h3 className={SECTION_TITLE}>{inflectionLabel}</h3> : null}
              <p className="text-sm leading-relaxed text-ink">
                {formatInflections(cleanInflections)}
              </p>
            </section>
          ) : null}

          {/* 区 5：例句（≤3 全展开，>3 折叠） */}
          {examples.length > 0 ? (
            <section aria-label={exampleLabel} className="border-t border-hair pt-3">
              {exampleLabel ? <h3 className={SECTION_TITLE}>{exampleLabel}</h3> : null}
              <ul className="flex flex-col gap-2">
                {(examplesOpen ? examples : examples.slice(0, 3)).map((pair, i) => (
                  <li key={`example-${String(i)}`}>
                    <p lang="en" className="font-latin text-sm leading-relaxed text-ink">
                      {pair.en}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-muted">{pair.zh}</p>
                  </li>
                ))}
              </ul>
              {examples.length > 3 && examplesCollapseLabel ? (
                <button
                  type="button"
                  aria-expanded={examplesOpen}
                  onClick={() => setExamplesOpen((open) => !open)}
                  className={cn(LINK, 'px-1 text-xs text-ink-muted')}
                >
                  {examplesCollapseLabel(examples.length - 3)}
                </button>
              ) : null}
            </section>
          ) : null}

          {/* 区 6：英文释义（默认收起） */}
          {enDefinition || enDefinitionSlot ? (
            <section aria-labelledby="word-detail-en-def" className="border-t border-hair pt-3">
              <button
                type="button"
                id="word-detail-en-def"
                aria-expanded={definitionOpen}
                onClick={() => setDefinitionOpen((open) => !open)}
                className={cn(
                  'flex min-h-tap w-full items-center justify-between gap-2 text-left',
                  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                )}
              >
                <span className={SECTION_TITLE}>{enDefinitionLabel}</span>
                <span aria-hidden="true" className="text-ink-muted">
                  {definitionOpen ? '⌃' : '⌄'}
                </span>
              </button>
              {definitionOpen ? (
                enDefinitionSlot ?? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                    {enDefinition}
                  </p>
                )
              ) : null}
            </section>
          ) : null}

          {/* 区 7：AI 记法五态 */}
          {mnemonicState !== 'absent' ? (
            <section aria-label={mnemonicLabel} className="border-t border-hair pt-3">
              {mnemonicState === 'collapsed' ? (
                <button
                  type="button"
                  id="word-detail-mnemonic"
                  aria-expanded={false}
                  onClick={onMnemonicToggle}
                  className={cn(
                    'flex min-h-tap w-full items-center justify-between gap-2 rounded-lg text-left text-sm text-brand',
                    'transition-colors duration-micro ease-standard hover:bg-brand-soft',
                    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
                  )}
                >
                  {mnemonicCollapsedLabel}
                  <span aria-hidden="true">›</span>
                </button>
              ) : mnemonicState === 'loading' ? (
                <>
                  {mnemonicLabel ? (
                    <h3 className={SECTION_TITLE}>{mnemonicLabel}</h3>
                  ) : null}
                  <SkeletonBlock variant="text" />
                </>
              ) : mnemonicState === 'failed' ? (
                <>
                  {mnemonicLabel ? (
                    <h3 className={SECTION_TITLE}>{mnemonicLabel}</h3>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-warning">{mnemonicFailLabel}</p>
                    {onMnemonicRetry ? (
                      <button
                        type="button"
                        onClick={onMnemonicRetry}
                        className={cn(LINK, 'px-1 text-xs')}
                      >
                        {VERBS.retryInline}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  {mnemonicLabel ? (
                    <h3 className={SECTION_TITLE}>{mnemonicLabel}</h3>
                  ) : null}
                  <div className="rounded-lg bg-sunken p-3 text-sm leading-relaxed text-ink">
                    {mnemonic}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {/* 区 8：操作区（按钮是否出现由 props 决定） */}
          {onToggleFavorite || onStudy ? (
            <div className="flex flex-wrap gap-2 border-t border-hair pt-3">
              {onToggleFavorite ? (
                <button
                  type="button"
                  aria-pressed={Boolean(inWordbook)}
                  aria-label={inWordbook ? ARIA.unfavorite(word) : ARIA.favorite(word)}
                  onClick={onToggleFavorite}
                  className={cn(
                    BUTTON_SECONDARY,
                    inWordbook && 'border-brand bg-brand-soft text-brand',
                  )}
                >
                  {inWordbook ? VERBS.favorited : VERBS.favorite}
                </button>
              ) : null}
              {onStudy && studyLabel ? (
                <button type="button" onClick={onStudy} className={BUTTON_PRIMARY}>
                  {studyLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

const WordDetailCardWithRef = React.forwardRef(WordDetailCard);
WordDetailCardWithRef.displayName = 'WordDetailCard';

export { WordDetailCardWithRef as WordDetailCard };
