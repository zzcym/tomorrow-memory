'use client';

/**
 * 背词卡面（§10.2 T-15 行 🆕`components/study/card-view.tsx`；🗑️ 现网 `components/flashcard.tsx`
 * 的自绘卡与 3D 翻面壳一并删除，卡体迁 `@tm/ui/patterns/Flashcard`）。
 *
 * 本组件**不写卡面 DOM**：卡体、翻面、滑动、无释义降级、发音、收藏、跳过的像素与可访问名
 * 全在 `@tm/ui/patterns/Flashcard`（两端同一份）。这里只做三件宿主侧的事：
 * 1. 键盘：`CARD_FLIP_KEYS` 翻面 + `RATING_KEY_MAP`（`←`=1、`→`=4）+ 数字 1-4（R-11① / §3.5.7）。
 *    `RatingBar` 的 `keyboard` 关掉，避免"组内方向键"与"窗口级快捷键"对同一次按键各提交一遍。
 * 2. 释义来源：只有 `review.queue` 的 `QueueItem.gloss`（`contracts/review-queue.ts:24`）。
 *    空串即 `noGloss` 态 —— **不逐词补拉**（R-14①④ / R-15⑧）。
 * 3. 判据① 的守门：评分与撤销一律交给 `useReviewSession()`，`mode=new|selfTest` 时那边
 *    直接返回，不发任何请求。
 */

import * as React from 'react';
import {
  ARIA,
  CARD_FLIP_KEYS,
  RATING_KEY_MAP,
  RATING_LABELS,
  RATING_VALUES,
  STUDY_COPY,
  type RatingValue,
} from '@tm/shared';
import { Flashcard, RatingBar, useHost } from '@tm/ui';
import type { StudyCardView } from '@/lib/api/review';
import { HOST_STUDY_COPY } from '@/lib/api/review';

export interface CardViewProps {
  card: StudyCardView;
  index: number;
  total: number;
  /** 今天已背数（`todayCounter` 与进度条同源）。 */
  done: number;
  goal: number;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: RatingValue) => void;
  onSkip: () => void;
  onRetryGloss: () => void;
  /** `null` = 撤销窗口已过（R-11④：离开该卡或翻到第三张后消失）。 */
  undo: { remaining: number; onUndo: () => void } | null;
  intervals: Partial<Record<RatingValue, string>>;
  submitting: RatingValue | null;
  inBook: boolean;
  onToggleFavorite: () => void;
  onOpenDetail: () => void;
  loading?: boolean;
}

/** 键盘只在页面级生效；焦点已经在控件里时不抢按键（否则四档按钮的 Enter 会同时翻面）。 */
function isFormOrControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest('button, a, [role="radio"], [role="menuitem"]') !== null
  );
}

export function CardView(props: CardViewProps): React.JSX.Element {
  const {
    card,
    index,
    total,
    done,
    goal,
    flipped,
    onFlip,
    onRate,
    onSkip,
    onRetryGloss,
    undo,
    intervals,
    submitting,
    inBook,
    onToggleFavorite,
    onOpenDetail,
    loading = false,
  } = props;
  const host = useHost();

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFormOrControl(event.target)) return;
      if ((CARD_FLIP_KEYS as readonly string[]).includes(event.key)) {
        event.preventDefault();
        onFlip();
        return;
      }
      const mapped = RATING_KEY_MAP[event.key];
      if (mapped !== undefined) {
        event.preventDefault();
        onRate(mapped);
        return;
      }
      const byDigit = RATING_VALUES[Number(event.key) - 1];
      if (byDigit !== undefined && Number(event.key) >= 1 && Number(event.key) <= 4) {
        event.preventDefault();
        onRate(byDigit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFlip, onRate]);

  const noGloss = card.gloss === '';
  const groups = noGloss ? [] : [{ pos: '', meanings: [card.gloss] }];
  const todayCounter = STUDY_COPY.todayCounter(done, goal);

  return (
    <div className="flex w-full flex-col gap-3">
      <Flashcard
        word={card.word}
        side={flipped ? 'back' : 'front'}
        onFlip={onFlip}
        groups={groups}
        index={index + 1}
        total={total}
        progressValueText={todayCounter}
        progressDone={done}
        progressTotal={goal}
        noGloss={noGloss}
        noGlossHint={STUDY_COPY.noGloss.title}
        onRetryGloss={onRetryGloss}
        onSkip={onSkip}
        onOpenDetail={onOpenDetail}
        detailLabel={HOST_STUDY_COPY.detailLink(card.word)}
        inWordbook={inBook}
        onToggleFavorite={onToggleFavorite}
        onSpeak={(word) => host.speak(word, 'us')}
        ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
        swipeSubmit
        onSwipeRating={onRate}
        loading={loading}
        testid="study-card"
      />

      <RatingBar
        onSelect={onRate}
        intervals={intervals}
        disabled={submitting !== null}
        pending={submitting}
        keyboard={false}
        sticky
        undo={undo ? { onUndo: undo.onUndo, remaining: undo.remaining } : undefined}
        ariaItemLabel={(rating, interval) =>
          interval ? ARIA.rating(rating, interval) : RATING_LABELS[rating]
        }
        hintKeyboard={HOST_STUDY_COPY.keyboardHint}
        testid="study-rating"
      />
    </div>
  );
}
