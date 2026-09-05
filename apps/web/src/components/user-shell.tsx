'use client';

/**
 * 用户界面外壳：管理单词本侧边栏的收起/展开与位置（左/右）
 * 偏好持久化到 localStorage。
 */

import * as React from 'react';
import { BookMarked } from 'lucide-react';
import { WordbookSidebar } from '@/components/wordbook-sidebar';
import { useAuthed } from '@/lib/use-auth';

type SidebarPosition = 'left' | 'right';

const POS_KEY = 'tm_sidebar_pos';
const COLLAPSED_KEY = 'tm_sidebar_collapsed';

function loadPrefs(): { position: SidebarPosition; collapsed: boolean } {
  try {
    return {
      position: (localStorage.getItem(POS_KEY) as SidebarPosition) || 'left',
      collapsed: localStorage.getItem(COLLAPSED_KEY) === '1',
    };
  } catch {
    return { position: 'left', collapsed: false };
  }
}

export function UserShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [prefs, setPrefs] = React.useState<{ position: SidebarPosition; collapsed: boolean }>({
    position: 'left',
    collapsed: false,
  });
  const authed = useAuthed();

  React.useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = (next: { position?: SidebarPosition; collapsed?: boolean }): void => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(POS_KEY, merged.position);
        localStorage.setItem(COLLAPSED_KEY, merged.collapsed ? '1' : '0');
      } catch {
        /* ignore */
      }
      return merged;
    });
  };

  const sidebar = authed && !prefs.collapsed ? (
    <WordbookSidebar
      onCollapse={() => update({ collapsed: true })}
      onMove={() => update({ position: prefs.position === 'left' ? 'right' : 'left' })}
    />
  ) : null;

  return (
    <div className={`flex flex-1 ${prefs.position === 'right' ? 'flex-row-reverse' : ''}`}>
      {sidebar}
      <main className="relative flex-1 overflow-x-hidden px-4 py-6 md:px-8">
        {/* 收起后 / 未登录时的浮动侧边栏开关 */}
        {authed && !sidebar && (
          <button
            onClick={() => update({ collapsed: false })}
            className="fixed left-3 top-20 z-30 flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-md transition-colors hover:text-foreground"
            style={prefs.position === 'right' ? { left: 'auto', right: 12 } : undefined}
            aria-label="展开单词本"
          >
            <BookMarked className="h-3.5 w-3.5" />
            单词本
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
