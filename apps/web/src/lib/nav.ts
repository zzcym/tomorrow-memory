/**
 * 导航唯一真源（架构 §5.5 / UI §3.10.1 定案 D-4）。
 *
 * 五项主入口的 href / tab 标签 / 图标名一律取自 `@tm/shared` 的 `NAV_ITEMS`
 * （Web 与 App 共用同一份，禁止两端各自硬编码菜单）；本文件只补"更多"抽屉的两项。
 */

import { NAV_ITEMS } from '@tm/shared';

export type NavIcon = 'Search' | 'Layers' | 'BookOpen' | 'TrendingUp' | 'User' | 'MessageSquare' | 'Gauge';

export interface NavItem {
  href: string;
  /** tab / 顶栏标签（两字版，定案 D-4）。 */
  label: string;
  /** 顶栏标题（全称版；首页为 null 表示不写标题）。 */
  title: string | null;
  icon: NavIcon;
}

export const PRIMARY_NAV: readonly NavItem[] = NAV_ITEMS.map((item) => ({
  href: item.href,
  label: item.tab,
  title: item.title,
  icon: item.icon as NavIcon,
}));

/** 「更多」抽屉的两项（§3.10.3 顺序锁死：`和 AI 聊聊` → `测一测词汇量` → 外观 → 退出）。 */
export const MORE_NAV: readonly NavItem[] = [
  { href: '/chat', label: '和 AI 聊聊', title: null, icon: 'MessageSquare' },
  { href: '/assess', label: '测一测词汇量', title: null, icon: 'Gauge' },
];

/** 顶栏/底 tab 是否为该路径的当前项（`/` 只在精确匹配时高亮，避免全站点亮查词 tab）。 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
}
