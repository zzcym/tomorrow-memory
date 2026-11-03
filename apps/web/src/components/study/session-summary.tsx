'use client';

/**
 * 完成页（§10.2 T-15 行 🆕`components/study/session-summary.tsx` / UI §3.5.6 / R-13①②）。
 *
 * 替换的是现网 `study/page.tsx` 的两处缺陷：
 * - 走完最后一张 `setIndex(0)` 自动回首张 + 一句 toast（R-13② 明禁，判据② 要"完成页停留"）；
 * - 达目标弹一个打卡 `Dialog`（判据② 明确要**常驻可点**的一行，不是弹窗）。
 *
 * 数字全部来自调用方，本组件不读时钟、不发请求（同一件纪律也是 `@tm/ui/patterns` 的判据①）。
 */

import * as React from 'react';
import {
  CHECKIN_COPY,
  HOME_CAPSULE,
  STUDY_COPY,
  VERBS,
  formatDuration,
  formatRatingBreakdown,
  type RatingValue,
} from '@tm/shared';
import { EmptyState } from '@tm/ui';
import { HOST_STUDY_COPY } from '@/lib/api/review';

export interface SessionSummaryProps {
  /** 本轮实际评过分/跳过的张数（跳过不计数，R-14④）。 */
  cards: number;
  counts: Partial<Record<RatingValue, number>>;
  /** 本轮秒数。 */
  seconds: number;
  goal: number;
  doneToday: number;
  checkedIn: boolean;
  streak: number;
  checkinPending: boolean;
  checkinFailed: boolean;
  onAgain: () => void;
  onCheckIn: () => void;
  onHome: () => void;
}

const BTN =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
  'transition-[transform,background-color] duration-tap ease-standard active:scale-95 ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';
const BTN_PRIMARY = `${BTN} bg-brand text-on-brand hover:bg-brand-strong`;
const BTN_SECONDARY = `${BTN} border border-hair bg-surface text-ink hover:bg-brand-soft`;

export function SessionSummary(props: SessionSummaryProps): React.JSX.Element {
  const {
    cards,
    counts,
    seconds,
    goal,
    doneToday,
    checkedIn,
    streak,
    checkinPending,
    checkinFailed,
    onAgain,
    onCheckIn,
    onHome,
  } = props;

  const goalReached = goal > 0 && doneToday >= goal;

  return (
    <section
      aria-labelledby="study-summary-title"
      data-testid="study-summary"
      className="mx-auto flex w-full max-w-read flex-col gap-4 py-2"
    >
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs text-ink-muted">{STUDY_COPY.summary.round}</p>
        <h1 id="study-summary-title" className="text-h1 max-md:text-h1-xs font-bold text-ink">
          {goalReached ? STUDY_COPY.dailyGoalReached.title(goal) : STUDY_COPY.summary.cards(cards)}
        </h1>
        {goalReached ? (
          <p className="text-sm text-ink-muted">{STUDY_COPY.dailyGoalReached.body(streak)}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-hair bg-surface p-4">
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-ink-muted">{STUDY_COPY.summary.round}</dt>
          <dd className="text-sm text-ink tabular-nums">
            {STUDY_COPY.summary.cards(cards)} · {formatRatingBreakdown(counts)}
          </dd>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-ink-muted">{STUDY_COPY.summary.durationPrefix}</dt>
          <dd className="text-sm text-ink tabular-nums">{formatDuration(seconds)}</dd>
        </div>
      </dl>

      {/* 判据②：打卡这一行**常驻**且可点，未打卡时是主按钮，已打卡时是状态文字。 */}
      <div className="flex min-h-tap items-center gap-3 rounded-lg bg-brand-soft p-3">
        <span className="flex-1 text-sm text-ink">
          {checkedIn ? CHECKIN_COPY.done(streak) : CHECKIN_COPY.notDone.streak(streak)}
        </span>
        <button
          type="button"
          onClick={onCheckIn}
          disabled={checkedIn || checkinPending}
          aria-disabled={checkedIn || checkinPending}
          data-testid="summary-checkin"
          className={checkedIn ? `${BTN} text-ink-muted` : `${BTN_PRIMARY}`}
        >
          {checkedIn ? HOME_CAPSULE.cleared : CHECKIN_COPY.notDone.cta}
        </button>
      </div>
      {checkinFailed ? (
        <p className="text-sm text-danger" role="alert">
          {CHECKIN_COPY.fail}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAgain} className={BTN_PRIMARY} data-testid="summary-again">
          {STUDY_COPY.summary.again}
        </button>
        <button type="button" onClick={onHome} className={BTN_SECONDARY}>
          {STUDY_COPY.summary.home}
        </button>
      </div>

      <EmptyState
        size="sm"
        title={HOST_STUDY_COPY.cardProgress(doneToday, goal)}
        secondary={{ label: VERBS.goStudy, onClick: onAgain }}
        testid="summary-progress-line"
      />
    </section>
  );
}
