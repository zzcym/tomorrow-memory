'use client';

/**
 * 移动端底部 5 tab（UI §3.10.1 / PRD §4.1 第 1 行的**唯一硬红线**）。
 *
 * `<768px 导航整体消失 = 产品对主力用户等于下线`，所以：
 * ① 底 tab 与顶栏**同时存在**（§3.1.3 末行），顶栏只承担 Logo + 「更多」，导航主责在这里；
 * ② 断点用 `md:hidden`，与顶栏 `hidden md:flex` 严格二选一（§3.10:1104 原文点名这两个类，
 *    §3.10.1:1127「仅 Web ≥768px 不会渲染本组件」→ 768px 就是 Tailwind `md`，**不得**用 JS 断点判断）；
 * ③ 五项数据全部来自 `@/lib/nav.ts` 的 `PRIMARY_NAV`（真源 = `@tm/shared` 的 `NAV_ITEMS`，已预置 `/wordbook`）；
 * ④ 高度 `h-tab`(56px) + `pb-safe-bottom`，配合布局根的 `--tab-h` 供 `100dvh` 让位（§3.10.4 / 判据②）。
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Gauge, Layers, MessageSquare, Search, TrendingUp, User, type LucideIcon } from 'lucide-react';
import { ARIA, formatCount } from '@tm/shared';
import { cn } from '@tm/ui';
import { isCurrent, PRIMARY_NAV, type NavIcon } from '@/lib/nav';
import { useDueCount } from '@/lib/hooks/use-lookup';

const ICONS: Record<NavIcon, LucideIcon> = {
  Search,
  Layers,
  BookOpen,
  TrendingUp,
  User,
  MessageSquare,
  Gauge,
};

export interface MobileNavProps {
  className?: string;
}

/* ───────── §2.4-② 键盘弹起时收起底 tab（判据② / PRD §8.3-A「100dvh 不遮输入框」） ───────── */

/** `visualViewport.height` 相对 `innerHeight` 缩这么多就算键盘（Android/iOS 经验下限，避开工具栏收起的误判）。 */
const KEYBOARD_MIN_PX = 120;
/** 失焦后复位底 tab 的延迟（§2.4-② 原文 140ms，太快会在切换输入框时抖）。 */
const UNTUCK_DELAY_MS = 140;

const isEditable = (el: Element | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);

/**
 * 只做一件事：可编辑元素持焦且键盘占了高度 → 底 tab `translateY(100%)` 收起，失焦后复位。
 * `packages/ui` 的 patterns 不许读宿主 API（§3.5），所以这条收在 Web 宿主的导航壳里；
 * 只用 `visualViewport` 事件，**不做 JS 断点判断**（断点仍由 `md:hidden` 这一条 CSS 决定）。
 */
function useKeyboardTuck(): boolean {
  const [tucked, setTucked] = React.useState(false);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = (): void => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      const keyboardUp = window.innerHeight - vv.height > KEYBOARD_MIN_PX;
      setTucked(keyboardUp && isEditable(document.activeElement));
    };
    const onBlur = (): void => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => setTucked(false), UNTUCK_DELAY_MS);
    };

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    document.addEventListener('focusout', onBlur);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.removeEventListener('focusout', onBlur);
      if (timer != null) clearTimeout(timer);
    };
  }, []);

  return tucked;
}

export function MobileNav({ className }: MobileNavProps): React.JSX.Element {
  const pathname = usePathname();
  const { due } = useDueCount();
  const tucked = useKeyboardTuck();

  return (
    <nav
      aria-label={TM_MAIN_NAV_LABEL}
      data-testid="mobile-nav"
      className={cn(
        'fixed inset-x-0 bottom-0 z-dock flex h-tab items-stretch border-t border-hair bg-surface/95 backdrop-blur transition-transform duration-micro ease-standard md:hidden',
        tucked && 'translate-y-full',
        className,
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex w-full items-stretch">
        {PRIMARY_NAV.map((item) => {
          const active = isCurrent(pathname, item.href);
          const Icon = ICONS[item.icon];
          const isStudyTab = item.href === '/study';
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={isStudyTab ? ARIA.studyTab(due) : undefined}
                data-active={active || undefined}
                className={cn(
                  'relative mx-auto flex h-full min-h-tap w-full flex-col items-center justify-center gap-0.5 text-2xs transition-colors duration-micro ease-standard',
                  active ? 'text-brand-strong' : 'text-ink-muted hover:text-ink',
                )}
              >
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                <span>{item.label}</span>
                {isStudyTab && due > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-[22%] top-2 rounded-full bg-danger px-1 text-2xs leading-tight text-on-brand"
                  >
                    {formatCount(due)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** `@tm/shared` 的 `ARIA` 未含底 tab 容器名（宿主注入，已登记给 TPM 补 §6.4）。 */
const TM_MAIN_NAV_LABEL = '主导航';
