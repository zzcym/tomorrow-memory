'use client';

/**
 * 顶栏（UI §3.1.2 A / §3.1.3 A / §3.10.1）。
 *
 * 修掉 A-01 移动导航缺陷的**根因**：原实现在 `<768px` 把整个 `nav` 隐藏（`hidden … md:flex`），
 * 又没有任何替代出口 → 移动端导航整体消失。现在：
 * ① 桌面 5 项主导航 `hidden md:flex`，窄屏由 `components/mobile-nav.tsx` 的底部 5 tab 接管
 *    （§3.10:1104 点名的正是这两个类：`md:hidden` / `hidden md:flex` 二选一，禁 JS 断点）；
 * ② 右上「更多」抽屉两端常驻（宽屏「更多 ▾」文字、窄屏 ☰ 44×44 热区）；
 * ③ 只做 Logo + 导航 + 主题 + 更多 + 头像，**不放任何搜索/结果类控件**，保证首页可交互元素计数只算主体（§3.1.1）。
 *
 * 登录弹窗挂在这里：全站唯一实例，其它组件（首页星标、「更多」抽屉）用 `OPEN_LOGIN_EVENT`
 * 广播来请求打开 —— 这样 T-16 不必给 `login-dialog.tsx` 加全局 store。
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sparkles, Sun } from 'lucide-react';
import { ARIA, BRAND, VERBS } from '@tm/shared';
import { Avatar, AvatarFallback, AvatarImage, cn, useThemeToggle } from '@tm/ui';
import { LoginDialog } from '@/components/login-dialog';
import { MoreMenu } from '@/components/home/more-menu';
import { OPEN_LOGIN_EVENT } from '@/components/home/result-section';
import { getUser, type StoredUser } from '@/lib/auth';
import { useAuthed } from '@/lib/use-auth';
import { isCurrent, PRIMARY_NAV } from '@/lib/nav';

export function Header(): React.JSX.Element {
  const pathname = usePathname();
  const { isDark, toggle } = useThemeToggle();
  const signedIn = useAuthed();
  const [loginOpen, setLoginOpen] = React.useState(false);
  // 渲染期读 localStorage 必造成 hydration mismatch → 只在挂载后读（沿用原实现的时序）
  const [user, setUser] = React.useState<StoredUser | null>(null);
  React.useEffect(() => {
    setUser(signedIn ? getUser() : null);
  }, [signedIn, pathname]);

  React.useEffect(() => {
    const open = (): void => setLoginOpen(true);
    window.addEventListener(OPEN_LOGIN_EVENT, open);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, open);
  }, []);

  const initial = (user?.nickname || user?.phone || '?').slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-sticky h-topbar w-full border-b border-hair bg-bg/80 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-pop focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        {ARIA.skipLink}
      </a>

      <div className="mx-auto flex h-full w-full max-w-page items-center gap-2 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-brand-strong" aria-label={BRAND.name}>
          <Sparkles aria-hidden="true" className="h-5 w-5" />
          <span className="text-sm font-bold tracking-tight">{BRAND.name}</span>
        </Link>

        <nav aria-label={TM_PRIMARY_NAV_LABEL} className="hidden min-w-0 items-center gap-1 md:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm transition-colors duration-micro ease-standard',
                  active ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-sunken hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="flex h-tap w-tap items-center justify-center rounded-full text-ink-muted transition-colors duration-micro hover:bg-sunken hover:text-ink"
          >
            {isDark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
            <span className="sr-only">{TM_THEME_TOGGLE_LABEL}</span>
          </button>

          {signedIn ? (
            <Link href="/profile" className="flex h-tap items-center gap-1.5 rounded-full pl-1 pr-2 hover:bg-sunken" aria-label={TM_PROFILE_LABEL}>
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar || undefined} alt="" />
                <AvatarFallback className="bg-brand-soft text-xs text-brand-strong">{initial}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[7rem] truncate text-sm text-ink-muted lg:inline">
                {user?.nickname || user?.phone || BRAND.name}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="hidden h-9 items-center rounded-full bg-brand px-3 text-sm text-on-brand transition-colors duration-micro hover:bg-brand-strong lg:flex"
            >
              {VERBS.login}
            </button>
          )}

          <MoreMenu
            trigger={
              <button
                type="button"
                aria-label={ARIA.moreDrawer}
                className="flex h-tap items-center gap-1 rounded-full px-2 text-ink-muted transition-colors duration-micro hover:bg-sunken hover:text-ink"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
                <span className="hidden text-sm lg:inline">{TM_MORE_LABEL}</span>
              </button>
            }
          />
        </div>
      </div>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </header>
  );
}

/**
 * shared `ARIA`/`VERBS`/`NAV_ITEMS` 缺以下三条导航用串 → **宿主注入**（A-8/A-23 的口径：
 * 组件函数体内零中文字面量；模块级单点声明 + 已作为需求登记进 `04-dev-report-T-12.md` 的 shared 需求清单）。
 * `TM_MORE_LABEL` 不在此列（`ARIA.moreDrawer` 已有）。
 */
const TM_PRIMARY_NAV_LABEL = '主导航';
const TM_THEME_TOGGLE_LABEL = '切换深色/浅色';
const TM_PROFILE_LABEL = '我的';
const TM_MORE_LABEL = ARIA.moreDrawer;
