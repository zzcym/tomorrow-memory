'use client';

/**
 * 「我的」`/profile`（§10.2 T-15 行 ✏️`app/(user)/profile/page.tsx`，313 → 本文件 ≤100 行）。
 *
 * 只留分区接线，按 §3.8.1 自上而下锁死的 B→C→D→E→F→G：账号头 / 三张统计卡 / 打卡常驻行 /
 * 每日目标滑杆 / 设置列表 / 退出登录。页面不写一行 DOM、不发请求（数据在 `lib/api/profile.ts`，
 * DOM 在 `components/profile/*`，文案全部 import 自 `@tm/shared`，零中文字面量）。
 *
 * 删掉的三处现网缺陷：头像区的「图片 URL」输入框 +「保存头像」（§3.8.4 点名的 R-04 下游症状）；
 * 本页的改密表单与"至少 4 位"旧口（A-30-3 ⇒ 独立成页 `/profile/security`，与强制改密共用
 * `@tm/ui/auth` 那一张表单）；自绘的 53 周热力图（「我的」不承担学情，两张卡点进 `/report`）。
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_COPY, SETTINGS_COPY, VERBS } from '@tm/shared';
import { EmptyState, SkeletonBlock, useHost } from '@tm/ui';
import { AuthGate } from '@/components/auth-gate';
import { AvatarSetting } from '@/components/profile/avatar-setting';
import { CheckinCard } from '@/components/profile/checkin-card';
import { ProfileStatCards } from '@/components/profile/stat-cards';
import { GoalSetting } from '@/components/profile/goal-setting';
import { SettingsList } from '@/components/profile/settings-list';
import { requestLogin } from '@/lib/auth';
import { PROFILE_COPY, useCheckin, useDailyGoal, useProfileOverview, useSignOut } from '@/lib/api/profile';

const SHELL = 'mx-auto flex w-full max-w-read flex-col pb-8';

/**
 * T-28 / R-23②：主体套 `<AuthGate>`（游客 = 默认 `<LoginWall>`，idle = 骨架）。
 * 原 `!me.signedIn` 的 `profile-signed-out` 分支保留 —— 它是 token 在但数据层判未登录时的
 * 同措辞兜底（四要素读的就是 `AUTH_COPY.wall.*`，与 `LoginWall` 同一真源），不是中间态文案。
 */
export default function ProfilePage(): React.JSX.Element {
  return <AuthGate><ProfileInner /></AuthGate>;
}

function ProfileInner(): React.JSX.Element {
  const host = useHost();
  const router = useRouter();
  const me = useProfileOverview();
  const checkin = useCheckin();
  const goal = useDailyGoal(me.dailyGoal, (message, tone) => host.toast(message, tone ?? 'info'));
  const signOut = useSignOut(router);

  if (!me.signedIn) {
    // §3.8.5 未登录（Web）：整页 EmptyState，一个统计数字都不渲染（App 那侧才保留本地值）。
    return (
      <EmptyState
        size="lg"
        title={AUTH_COPY.wall.title}
        hint={AUTH_COPY.wall.subtitle}
        primary={{ label: AUTH_COPY.wall.primary, onClick: () => requestLogin({ mode: 'sign-in', returnTo: '/profile' }) }}
        link={{ label: AUTH_COPY.wall.link, onClick: () => requestLogin({ mode: 'register', returnTo: '/profile' }) }}
        testid="profile-signed-out"
      />
    );
  }
  if (me.failed) {
    return (
      <EmptyState
        size="lg"
        title={PROFILE_COPY.loadFailTitle}
        hint={PROFILE_COPY.loadFailBody}
        primary={{ label: VERBS.retryInline, onClick: me.retry }}
        secondary={{ label: SETTINGS_COPY.signOut.confirm, onClick: signOut }}
        testid="profile-load-fail"
      />
    );
  }
  if (me.pending) {
    // 骨架与真实行同形同位（§3.8.5：56px 圆 + 3 张 84px 卡 + 5 条 56px 行），不写任何文字。
    return (
      <div className={SHELL} aria-busy="true" data-testid="profile-loading">
        <SkeletonBlock variant="text" width={56} height={56} className="rounded-full" />
        <SkeletonBlock variant="stat-card" />
        <SkeletonBlock variant="list-rows" rows={5} />
      </div>
    );
  }

  return (
    <div className={SHELL} data-testid="profile-page">
      <AvatarSetting avatar={me.avatar} nickname={me.nickname} phone={me.phone} />
      <ProfileStatCards
        words={me.totalWords} reviewDays={me.reviewDays} streak={me.streak}
        onWords={() => router.push('/wordbook')} onReviewDays={() => router.push('/report')} onStreak={() => router.push('/report')}
      />
      <CheckinCard
        checkedIn={checkin.checkedIn} streak={checkin.streak} doneToday={checkin.doneToday}
        dailyGoal={checkin.dailyGoal} pending={checkin.pending} failed={checkin.failed}
        onCheckIn={checkin.checkIn} onGoStudy={() => router.push('/study')}
      />
      {/* dirty 未保存就离页的闸门要拦 tab / 返回，那两处动作在 T-12 的 layout 里 ⇒ 本轮不越界；
          `ConfirmSheet` 已画在 `goal-setting.tsx`，开合权留在页面。已进 T-15 报告的跨任务清单。 */}
      <GoalSetting goal={goal} leaveConfirmOpen={false} onStay={() => undefined} onDiscardAndLeave={() => undefined} />
      <SettingsList
        nickname={me.nickname} needsPasswordUpgrade={me.needsPasswordUpgrade}
        onSecurity={() => router.push('/profile/security')} onAbout={() => router.push('/about')} onSignOut={signOut}
      />
    </div>
  );
}
