'use client';

/**
 * 最近查询（R-10 ②：本机存储、≤20 条、可清空；UI §3.3 聚焦面板）。
 * 存储走 `host.kv`（架构 §3.1）—— 包内零宿主假设；条目形状与服务端同步（R-26）预对齐，
 * 校验与上限一律来自 `@tm/shared`，不在这里重复定义（R-06 ②）。
 */
import * as React from 'react';
import { RECENT_MAX, parseRecentSearchList, type RecentSearchItemDto } from '@tm/shared';
import { useHost } from '../host.js';

/** 两端同一键（与主题偏好键同一命名空间约定，UI §5.3-4）。 */
export const RECENT_SEARCHES_KEY = 'tm:recent-searches';

const dedupe = (items: readonly RecentSearchItemDto[]): RecentSearchItemDto[] => {
  const seen = new Set<string>();
  const out: RecentSearchItemDto[] = [];
  for (const it of items) {
    const k = `${it.word.toLowerCase()}|${it.direction}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
};

const parse = (raw: string | null): RecentSearchItemDto[] => {
  if (!raw) return [];
  try {
    const r = parseRecentSearchList(JSON.parse(raw) as unknown);
    return r.success ? dedupe(r.data) : [];
  } catch {
    return [];
  }
};

export interface UseRecentSearches {
  items: RecentSearchItemDto[];
  /** 记一条（同词同方向上移到最前，超 20 条自动截断）。 */
  push: (item: Omit<RecentSearchItemDto, 'at'> & { at?: number }) => void;
  remove: (word: string, direction?: RecentSearchItemDto['direction']) => void;
  /** UI §3.3：清空需二次确认，确认动作由调用方（面板组件）负责。 */
  clear: () => void;
  max: number;
}

export function useRecentSearches(): UseRecentSearches {
  const host = useHost();
  const [items, setItems] = React.useState<RecentSearchItemDto[]>(() => parse(host.kv.get(RECENT_SEARCHES_KEY)));

  /** 同一标签页内多实例（首页 + 侧栏）保持同步。 */
  React.useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === RECENT_SEARCHES_KEY) setItems(parse(e.newValue));
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }, []);

  const commit = React.useCallback(
    (next: readonly RecentSearchItemDto[]) => {
      const list = dedupe(next);
      setItems(list);
      host.kv.set(RECENT_SEARCHES_KEY, JSON.stringify(list));
    },
    [host],
  );

  const push = React.useCallback<UseRecentSearches['push']>(
    (item) => {
      const at = item.at ?? Date.now();
      commit([{ word: item.word, direction: item.direction, gloss: item.gloss, at }, ...items]);
    },
    [commit, items],
  );

  const remove = React.useCallback<UseRecentSearches['remove']>(
    (word, direction) => {
      commit(items.filter((i) => i.word.toLowerCase() !== word.toLowerCase() || (direction && i.direction !== direction)));
    },
    [commit, items],
  );

  const clear = React.useCallback(() => commit([]), [commit]);

  return { items, push, remove, clear, max: RECENT_MAX };
}
