'use client';

/**
 * `LoginWall`（T-16 / R-23①③④；UI §3.9 + §6.4-登录「登录墙」行；判据③）。
 *
 * 未登录用户在**业务页**看到的那一面墙，按定稿只有三样东西：
 *  - 标题 `AUTH_COPY.wall.title` = `登录后开始背单词`
 *  - 副标题 `AUTH_COPY.wall.subtitle`（解释"为什么要登录"，不是一句敷衍话）
 *  - 主按钮 `AUTH_COPY.wall.primary` = `手机号登录` + 文字链 `AUTH_COPY.wall.link` = `没有账号？注册`
 *
 * 三件硬约束：
 *  1. **零字面量**：四个串全部 import 自 `@tm/shared`（A-37 §五-24），页面要换措辞就传 props 覆写，
 *     覆写值同样只能来自 shared（`PROGRESS_COPY.signedOut` / `WORDBOOK_COPY.emptySignedOut` 等）；
 *  2. **不出现任何"请先登录后…"句子**（判据①② 归零的对象）：这句话在旧实现里是登录态未确定时
 *     由页面自己吐出来的中间态，本组件只在**确定是游客**时被 `<AuthGate>` 渲染出来；
 *  3. **可交互元素 = 2**：主按钮 + 文字链（§8.3-D 的计数口径下还有余量，弹窗打开后另有 5 个上限，
 *     那颗上限在 `login-dialog.tsx` 一侧数）。
 *
 * 主按钮/文字链都不自己持有弹窗状态：登录弹窗全站唯一实例挂在 `components/header.tsx`，
 * 这里只 `requestLogin()` 广播（R-23①"点击打开登录弹窗"）。顺带登记两件事：
 *  - `returnTo` = 当前路径 → 登录成功后回原页（判据④）；
 *  - `pendingAction` = 宿主在点击时告诉我要续作什么（如要收藏的那个词，R-16② / R-39⑧）。
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AUTH_COPY } from '@tm/shared';
import { EmptyState } from '@tm/ui';
import { rememberPendingAction, requestLogin, type PendingAction } from '@/lib/auth';

export interface LoginWallProps {
  /** 标题（默认 `AUTH_COPY.wall.title`）。 */
  title?: string;
  /** 副标题（默认 `AUTH_COPY.wall.subtitle`）。 */
  subtitle?: string;
  /** 主按钮文案（默认 `AUTH_COPY.wall.primary`，全站同一动作同一串，§6.5）。 */
  primaryLabel?: string;
  /** 文字链文案（默认 `AUTH_COPY.wall.link`）。给 `null` 即不渲染第二颗。 */
  linkLabel?: string | null;
  /**
   * 点登录后要续作的动作（判据④：R-16② 的"待收藏词"）。
   * 落库与执行分别在 `lib/auth.ts` / `login-dialog.tsx`，这里只登记。
   */
  pendingAction?: PendingAction;
  /** 点击后额外的本地回调（页面想清掉自己的临时状态时用）。 */
  onLoginClick?: () => void;
  id?: string;
  className?: string;
  testid?: string;
}

export function LoginWall({
  title = AUTH_COPY.wall.title,
  subtitle = AUTH_COPY.wall.subtitle,
  primaryLabel = AUTH_COPY.wall.primary,
  linkLabel = AUTH_COPY.wall.link,
  pendingAction,
  onLoginClick,
  id,
  className,
  testid = 'login-wall',
}: LoginWallProps): React.JSX.Element {
  const pathname = usePathname();

  const open = React.useCallback(
    (mode: 'sign-in' | 'register'): void => {
      if (pendingAction) rememberPendingAction(pendingAction);
      requestLogin({ mode, returnTo: pathname, pendingAction });
      onLoginClick?.();
    },
    [onLoginClick, pathname, pendingAction],
  );

  return (
    <div id={id} data-testid={testid} data-auth-wall="true" className={className}>
      <EmptyState
        size="md"
        title={title}
        hint={subtitle}
        primary={{ label: primaryLabel, onClick: () => open('sign-in') }}
        link={linkLabel ? { label: linkLabel, onClick: () => open('register') } : undefined}
        testid={`${testid}-state`}
      />
    </div>
  );
}

export default LoginWall;
