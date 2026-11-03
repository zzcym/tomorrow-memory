'use client';

/**
 * 「我的」D 区 = 打卡常驻行（§10.2 T-15 行 🆕`components/profile/checkin-card.tsx` / UI §3.8.1 D）。
 *
 * 判据② 的那一句「今天已打卡 · 连续 N 天」在**这一页是常驻行**、在完成页是 `SessionSummary` 里
 * 同一串（`CHECKIN_COPY.done(streak)` 单一源），两处读的是**同一个** `checkin.status` 查询
 * （R-13⑥：同一时刻相等）。原 `study/page.tsx` 的打卡 `Dialog` 已删 —— 打卡不是弹窗。
 *
 * 本组件不读时钟、不发请求：数字与回调全部由页面给（同 `@tm/ui/patterns` 的纪律）。
 */

import * as React from 'react';
import { CHECKIN_COPY, NOTICE_CHANNEL_COPY, VERBS } from '@tm/shared';

const BTN =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
  'transition-[transform,background-color] duration-tap ease-standard active:scale-95 ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export interface CheckinCardProps {
  checkedIn: boolean;
  streak: number;
  doneToday: number;
  dailyGoal: number;
  pending: boolean;
  failed: boolean;
  onCheckIn: () => void;
  onGoStudy: () => void;
}

export function CheckinCard({
  checkedIn,
  streak,
  doneToday,
  dailyGoal,
  pending,
  failed,
  onCheckIn,
  onGoStudy,
}: CheckinCardProps): React.JSX.Element {
  return (
    <section
      aria-label={CHECKIN_COPY.notDone.cta}
      data-testid="profile-checkin"
      className="mt-3 flex min-h-[56px] flex-wrap items-center gap-3 rounded-lg bg-brand-soft p-3"
    >
      <span className="flex-1 text-sm text-ink" data-testid="profile-checkin-line">
        {checkedIn ? CHECKIN_COPY.done(streak) : CHECKIN_COPY.notDone.streak(streak)}
        {dailyGoal > 0 ? (
          <span className="ml-2 tnum text-xs text-ink-muted">
            {NOTICE_CHANNEL_COPY.widget.progress(doneToday, dailyGoal)}
          </span>
        ) : null}
      </span>
      {checkedIn ? (
        <button type="button" onClick={onGoStudy} className={`${BTN} bg-brand text-on-brand hover:bg-brand-strong`}>
          {VERBS.goStudy}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onCheckIn}
            disabled={pending}
            aria-disabled={pending}
            aria-busy={pending}
            className={`${BTN} bg-brand text-on-brand hover:bg-brand-strong`}
          >
            {pending ? CHECKIN_COPY.pendingText : CHECKIN_COPY.notDone.cta}
          </button>
          <button type="button" onClick={onGoStudy} className={`${BTN} text-ink-muted`}>
            {VERBS.goStudy}
          </button>
        </>
      )}
      {failed ? (
        <p role="alert" className="w-full text-xs text-danger">
          {CHECKIN_COPY.fail}
        </p>
      ) : null}
    </section>
  );
}
