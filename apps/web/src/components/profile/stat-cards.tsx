'use client';

/**
 * 「我的」C 区 = 三张统计卡（§10.2 T-15 行 🆕`components/profile/stat-cards.tsx` / UI §3.8.1 C）。
 *
 * 卡体走 `@tm/ui/patterns/StatCard`（与 §3.7 学习情况同一份，禁第二套大数字卡）。
 * 三张卡的落点写死在 §3.8.1 那条bullet 上：`词本`→`/wordbook`、`累计复习`→`/report`、
 * `连续`→`/report` 的热力图；**没有**"数字明细弹层"这一页，不造。
 *
 * 数字为 0 时仍显示 `0`（§3.7.4 禁把 0 画成空白），`≥100` 由 `StatCard` 内部的
 * `formatCount` 收成 `99+`，本文件不再算第二遍。
 */

import * as React from 'react';
import { StatCard } from '@tm/ui';
import { PROFILE_COPY } from '@/lib/api/profile';

export interface ProfileStatCardsProps {
  words: number;
  reviewDays: number;
  streak: number;
  onWords: () => void;
  onReviewDays: () => void;
  onStreak: () => void;
  loading?: boolean;
}

export function ProfileStatCards({
  words,
  reviewDays,
  streak,
  onWords,
  onReviewDays,
  onStreak,
  loading = false,
}: ProfileStatCardsProps): React.JSX.Element {
  return (
    <div data-testid="profile-stats" className="grid grid-cols-3 gap-3">
      <StatCard
        label={PROFILE_COPY.statWords}
        value={words}
        unit={PROFILE_COPY.unitWords}
        onClick={onWords}
        loading={loading}
        className="min-h-[84px]"
        testid="profile-stat-words"
      />
      <StatCard
        label={PROFILE_COPY.statReviewDays}
        value={reviewDays}
        unit={PROFILE_COPY.unitDays}
        onClick={onReviewDays}
        loading={loading}
        className="min-h-[84px]"
        testid="profile-stat-days"
      />
      <StatCard
        label={PROFILE_COPY.statStreak}
        value={streak}
        unit={PROFILE_COPY.unitDays}
        tone="brand"
        onClick={onStreak}
        loading={loading}
        className="min-h-[84px]"
        testid="profile-stat-streak"
      />
    </div>
  );
}
