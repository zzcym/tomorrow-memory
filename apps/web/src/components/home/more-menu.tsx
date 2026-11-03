'use client';

/**
 * 右上「更多」抽屉（UI §3.10.3；PRD §4.1 第 1 行的补偿件）。
 *
 * 顶栏（`md+`）放 5 项主导航 + 这颗「更多」；窄屏顶栏只有 Logo + ☰，
 * 但**底部 5 tab 与顶栏同时存在**（§3.1.3 末行），所以移动端的主出口在底 tab，
 * 「更多」只承担次出口（和 AI 聊聊 / 测一测词汇量）+ 外观三档 + 退出/登录。
 *
 * 底座 = `primitives/dialog`（Radix）：焦点圈闭 / Esc / 遮罩点击都内建，
 * 宽屏 = 右上下拉卡片，窄屏 = 右侧满高抽屉（同一份 DOM，只靠 `max-md:` 类切换 ——
 * 断点跟 §3.10:1104 的 `md:hidden` / `hidden md:flex` 对齐，不用 JS 判断）。
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Gauge, LogOut, MessageSquare, Moon, Sun, MonitorSmartphone, type LucideIcon } from 'lucide-react';
import { ARIA, THEME_MODE_LABELS, VERBS, type ThemeMode } from '@tm/shared';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  useHost,
  useThemeToggle,
} from '@tm/ui';
import { clearToken, clearUser, getUser } from '@/lib/auth';
import { useAuthed } from '@/lib/use-auth';
import { MORE_NAV, type NavIcon } from '@/lib/nav';
import { OPEN_LOGIN_EVENT } from '@/components/home/result-section';

const ICONS: Partial<Record<NavIcon, LucideIcon>> = {
  MessageSquare,
  Gauge,
};

export interface MoreMenuProps {
  /** 触发行（宽屏=「更多 ▾」文字按钮；窄屏= ☰ 44×44）。 */
  trigger: React.ReactNode;
  testid?: string;
}

export function MoreMenu({ trigger, testid = 'more-menu' }: MoreMenuProps): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const host = useHost();
  const signedIn = useAuthed();
  const { theme, setTheme } = useThemeToggle();
  const [open, setOpen] = React.useState(false);
  const nickname = React.useMemo(() => (signedIn ? getUser()?.nickname || getUser()?.phone || null : null), [signedIn]);

  const signOut = (): void => {
    clearToken();
    clearUser();
    // 换号后不能让上一账号的缓存闪现（单词本/今日队列/报告）
    queryClient.clear();
    setOpen(false);
    host.toast(TM_SIGNED_OUT, 'success');
    router.push('/');
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showClose={false}
        className={
          // 覆盖 primitive 的"居中对话框"定位：宽屏从顶栏右侧下拉，窄屏右侧满高抽屉（§3.10.3）
          'left-auto top-14 right-3 grid w-[min(92vw,280px)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden p-0 ' +
          'max-md:top-0 max-md:right-0 max-md:h-dvh max-md:w-[min(86vw,320px)] max-md:rounded-none max-md:p-0'
        }
        data-testid={testid}
      >
        <DialogTitle className="sr-only">{ARIA.moreDrawer}</DialogTitle>

        {nickname ? (
          <div className="border-b border-hair px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{nickname}</p>
          </div>
        ) : null}

        <nav aria-label={ARIA.moreDrawer} className="py-1">
          <ul>
            {MORE_NAV.map((item) => {
              const Icon = ICONS[item.icon] ?? MessageSquare;
              return (
                <li key={item.href}>
                  <DialogClose asChild>
                    <Link
                      href={item.href}
                      className="flex min-h-tap items-center gap-3 px-4 text-sm text-ink transition-colors duration-micro hover:bg-sunken"
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                      {item.label}
                    </Link>
                  </DialogClose>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-hair py-1">
          <p className="px-4 pb-1 pt-2 text-xs text-ink-muted">{TM_APPEARANCE_GROUP}</p>
          <div className="flex items-center gap-1 px-3 pb-1">
            {THEME_MODE_ORDER.map((mode) => {
              const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : MonitorSmartphone;
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(mode)}
                  className={
                    'flex h-9 flex-1 items-center justify-center gap-1 rounded-full text-xs transition-colors duration-micro ' +
                    (active ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-sunken')
                  }
                >
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  {THEME_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-hair p-3">
          {signedIn ? (
            <button
              type="button"
              onClick={signOut}
              className="flex min-h-tap w-full items-center gap-3 rounded-lg px-1 text-sm text-danger transition-colors duration-micro hover:bg-sunken"
            >
              <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
              {VERBS.signOut}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_LOGIN_EVENT));
              }}
              className="flex min-h-tap w-full items-center gap-3 rounded-lg px-1 text-sm text-ink transition-colors duration-micro hover:bg-sunken"
            >
              {VERBS.login}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** `@tm/shared` 未导出「更多」抽屉的小标题与登出提示（宿主注入，已登记给 TPM 补 §6.4-设置）。 */
const TM_APPEARANCE_GROUP = '外观';
const TM_SIGNED_OUT = '已退出登录';
const THEME_MODE_ORDER = ['light', 'dark', 'system'] as const satisfies readonly ThemeMode[];
