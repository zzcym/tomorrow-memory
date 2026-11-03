/**
 * 底部标签栏 + App 级横幅（R-18 ①③⑤、R-17 ⑨、R-20 ⑤）。
 *
 * **App 专属，不入 `@tm/ui`**：Web 侧是同批入口的顶栏语义，两端只有"导航项与文案"同源
 * （`NAV_ITEMS`），几何不同（§5.4③）。
 *
 * 本文件不写任何用户可见字面串：标签、红点 aria、横幅文案全部 import 自 `@tm/shared`。
 */

import * as React from 'react';
import { ARIA, formatCount, NAV_ITEMS, VERBS } from '@tm/shared';
import {
  dismissVersionPrompt,
  getPendingVersionPrompt,
  getSyncStatus,
  subscribeSyncStatus,
  subscribeVersionPrompt,
  syncLabel,
  type SyncStatus,
} from '../data/startup.js';
import { openExternal } from '../native/bridge.js';
import { navigate, useLocation } from '../router.js';

/* ═════════════════ 图标（内联 SVG，不引 lucide：它不在 workspace 依赖里） ═════════════════ */

const ICON_PATHS: Record<string, string> = {
  Search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
  Layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5',
  BookOpen: 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4V5ZM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6V5Z',
  TrendingUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  User: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0',
};

function NavIcon({ name }: { name: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

/* ═════════════════ 同步状态（R-20 ⑤，供 T-18 词本页 / T-19「我的」页放置） ═════════════════ */

export function useSyncStatus(): SyncStatus {
  return React.useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

/**
 * 一句话同步状态：`已同步 · HH:MM` / `待同步 N` / `还没同步 · 联网后会自动补上`；
 * 离线且无队列时**不显示任何东西**（`SYNC_COPY.offlineQuiet`）。
 * 归属判据：本组件由批次4 在 `WordbookScreen` / `MeScreen` 各放一处（§5.5 末段）。
 */
export function SyncBadge({ className = '' }: { className?: string }): React.JSX.Element | null {
  const status = useSyncStatus();
  const label = syncLabel(status);
  if (!label) return null;
  return (
    <span className={`text-xs text-ink-muted ${className}`} data-testid="sync-badge">
      {label}
    </span>
  );
}

/* ═════════════════ 版本更新横幅（R-17 ⑨，判据⑥） ═════════════════ */

/**
 * 一次性更新提示：`NOTICE_CHANNEL_COPY.updateAvailable`，点按 = 打开下载直链，
 * 关闭 = 24 小时内对同一版本不再提示（抑制逻辑在 `data/startup.ts`，判据⑥）。
 */
export function VersionBanner(): React.JSX.Element | null {
  const prompt = React.useSyncExternalStore(
    subscribeVersionPrompt,
    getPendingVersionPrompt,
    getPendingVersionPrompt,
  );
  if (!prompt) return null;
  return (
    <div
      className="flex items-center gap-2 bg-brand-soft px-4 py-2 text-sm text-ink"
      data-testid="version-banner"
    >
      <button
        type="button"
        className="min-h-tap flex-1 text-left font-medium"
        onClick={() => openExternal(prompt.url)}
      >
        {prompt.label}
      </button>
      <button
        type="button"
        aria-label={VERBS.cancel}
        className="min-h-tap px-2 text-ink-muted"
        onClick={() => dismissVersionPrompt(prompt.latest)}
        data-testid="version-banner-dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ═════════════════ 标签栏 ═════════════════ */

/**
 * App 底部 tab 的**显示顺序**（bug_list #5：查词挪到正中间）。
 *
 * 与 `NAV_ITEMS`（共享给 Web 顶栏）解耦：那条顺序是两端同源的导航定义，Web 侧仍是
 * 查词在第一个；App 只是按这张表重排渲染，不改 shared 的常量，也不动任何 href/hash。
 * 五格里查词落在第三格 = 屏幕正中间。
 */
const APP_TAB_ORDER = ['#/study', '#/wordbook', '#/', '#/progress', '#/me'] as const;

const APP_TABS = APP_TAB_ORDER.map((hash) => NAV_ITEMS.find((item) => item.hash === hash)).filter(
  (item): item is (typeof NAV_ITEMS)[number] => item !== undefined,
);

function ariaLabelFor(item: (typeof NAV_ITEMS)[number], due: number): string {
  // 背单词 tab（`#/study`）的读屏标签带待背数（§6.8 定稿），其余 tab 用标签本身。
  return item.hash === '#/study' ? ARIA.studyTab(due) : item.tab;
}

export function TabBar(): React.JSX.Element {
  const loc = useLocation();
  const { dueCount, pending } = useSyncStatus();
  const due = dueCount ?? 0;
  return (
    <nav
      aria-label={ARIA.moreDrawer}
      className="fixed inset-x-0 bottom-0 z-dock flex border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)]"
      data-testid="tab-bar"
    >
      {APP_TABS.map((item) => {
        const path = item.hash.replace(/^#/, '');
        const active = loc.path === path;
        const showDot = item.hash === '#/study' && due > 0;
        return (
          <button
            key={item.hash}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={ariaLabelFor(item, due)}
            data-tab={path}
            data-active={active ? '1' : '0'}
            className="relative flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-2xs text-ink-muted"
            onClick={() => navigate(path, { replace: false })}
          >
            <span className={active ? 'text-brand' : 'text-ink-muted'}>
              <NavIcon name={item.icon} />
            </span>
            <span className={active ? 'font-medium text-brand' : ''}>{item.tab}</span>
            {showDot ? (
              <span
                className="absolute right-3 top-1 rounded-full bg-danger px-1 text-2xs text-on-brand"
                data-testid="due-dot"
              >
                {formatCount(due)}
              </span>
            ) : null}
            {item.hash === '#/wordbook' && pending > 0 ? (
              <span
                className="absolute right-3 top-1 h-1.5 w-1.5 rounded-full bg-warning"
                data-testid="pending-dot"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/* ═════════════════ 壳 ═════════════════ */

/**
 * tab 页的布局壳：更新横幅（顶部一次性）+ 内容 + 底部标签栏。
 * 内容区自带 `pb-safe-bottom` / `pt-safe-top`（bug_list #4：顶部状态栏留白），避免被固定标签栏压住。
 */
export function TabBarShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink" data-testid="tab-shell">
      <VersionBanner />
      <main id="main" className="flex-1 pb-safe-bottom pt-safe-top">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
