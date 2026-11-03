'use client';

/**
 * `AuthGate`（T-16 / R-23②；§10.2 T-16 判据①的**唯一**消除"请先登录后…"中间态的机制）。
 *
 * 三态渲染（读 `lib/use-auth.ts` 的 `useAuthStatus()`）：
 *  - `idle`  → **骨架屏**（`SkeletonBlock`，容器 `aria-busy`，零文案）：SSR/SSG 产物与水合帧都走这里，
 *              所以业务页的静态 HTML 里根本不存在"请先登录后…"那行字，判据① 才是可断言的"DOM 不出现"，
 *              而不是"闪过一下"；
 *  - `guest` → `<LoginWall>`（可读引导 + 手机号登录主按钮 + 没有账号？注册 文字链，判据③）；
 *  - `authed`→ 真正的业务内容。
 *
 * 用法（页面侧一行，由页面 owner 采用；`study`/`wordbook`/`report` 归 T-15、`chat`/`assess` 归 T-12，
 * 本任务不改他们的文件，见 `04-dev-report-T-16.md` 的"越界申请"一节）：
 * ```tsx
 * // 改前：if (!authed) return <p>请先登录后开始背单词。</p>;
 * <AuthGate>{authedContent}</AuthGate>
 * ```
 * 或者只想换掉那一行文案：`const status = useAuthStatus(); if (status !== 'authed') return <LoginWall/>;`
 * —— 但 `idle` 期请给骨架，别给文案。
 *
 * 零请求、零存储读写：状态全部来自 `use-auth.ts` 那一个 store。
 */

import * as React from 'react';
import { SkeletonBlock } from '@tm/ui';
import { useAuthStatus, type AuthStatus } from '@/lib/use-auth';
import { LoginWall } from '@/components/login-wall';

export interface AuthGateProps {
  /** 已登录时渲染的内容。 */
  children: React.ReactNode;
  /** 登录态未确定时的骨架（默认一块 `card` + 两行 `text`，不给任何文案）。 */
  skeleton?: React.ReactNode;
  /** 游客态渲染的内容（默认 `<LoginWall>`；页面想用自己的定稿措辞就传 `WORDBOOK_COPY.emptySignedOut` 那一套）。 */
  wall?: React.ReactNode;
  /** 骨架与墙的占位高度类名（长页面想避免跳动时用）。 */
  className?: string;
  testid?: string;
  /** 只渲染某一种态的逃生门（测试用：强制看骨架）。 */
  forceStatus?: AuthStatus;
}

/** 默认骨架：与真实元素同形同位的通用款（形状表在 `@tm/ui/patterns/SkeletonBlock`）。 */
export function AuthSkeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={className} data-testid="auth-gate-skeleton">
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="text" rows={2} className="mt-3" />
    </div>
  );
}

export function AuthGate({
  children,
  skeleton,
  wall,
  className,
  testid = 'auth-gate',
  forceStatus,
}: AuthGateProps): React.JSX.Element {
  const status = useAuthStatus();
  const shown = forceStatus ?? status;

  if (shown === 'idle') {
    return (
      <div data-testid={testid} data-auth-status="idle" className={className}>
        {skeleton ?? <AuthSkeleton />}
      </div>
    );
  }

  if (shown === 'guest') {
    return (
      <div data-testid={testid} data-auth-status="guest">
        {wall ?? <LoginWall />}
      </div>
    );
  }

  /* 已登录：**不包壳**，直接交出 children —— 采用方的页面布局（flex/grid 子项、`max-w-*` 容器）
     不会因为本组件多出一层 div 而位移；"内容已出现"在 e2e 里由 `auth-gate-skeleton` 与
     `login-wall` 双双归零 + 页面自身 testid 出现来判定，不依赖这里的标记。 */
  return <>{children}</>;
}

export default AuthGate;
