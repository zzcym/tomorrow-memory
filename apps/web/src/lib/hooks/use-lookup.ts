'use client';

/**
 * 首页查词状态（T-12）。
 *
 * - 传输：`trpc.dictionary.lookupStatic`（零 `fetch(`，判据⑤）。
 * - `staleTime: Infinity`：结果按"词 + 方向"缓存在 React Query，点最近查询条目命中缓存**不再发请求**（R-10③）。
 * - 最近查询在本 hook 单点写入（`useRecentSearches` 每实例各持一份 state，同标签页内两处调用不会互相同步）。
 * - `busy` 经 300ms 延迟：UI §3.1.5「查询中（首帧 <300ms）不显示任何东西」防闪。
 */

import * as React from 'react';
import type { LookupDirectionValue } from '@tm/shared';
import { WORD_MAX_LENGTH, flipLookupDirection } from '@tm/shared';
import { useRecentSearches } from '@tm/ui';
import { useAuthed } from '../use-auth';
import { trpc } from '../trpc';
import { resolveDirection, toHomeLookupView, toRecentItem, type HomeLookupView } from '../api/lookup-stream';

const IDLE_VIEW: HomeLookupView = { kind: 'idle', word: '', phonetic: '', gloss: '', rows: [], partial: false, applied: 'auto' };

/** 300ms 后才为 true（骨架/进度条用，避免瞬时结果的闪烁）。 */
function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}

/** 今日待背数（首页胶囊与移动 tab 红点共用；`review.today` 是 protectedProcedure，未登录不请求）。 */
export function useDueCount(): { due: number; loading: boolean; signedIn: boolean } {
  const signedIn = useAuthed();
  const query = trpc.review.today.useQuery(undefined, { enabled: signedIn, staleTime: 60_000, retry: false });
  return { due: query.data?.dueToday ?? 0, loading: signedIn && query.isPending, signedIn };
}

export interface UseLookup {
  text: string;
  setText: (value: string) => void;
  /** 已提交的原始输入（"没找到「X」"用它，不用服务端回显）。 */
  queried: string;
  view: HomeLookupView;
  busy: boolean;
  failed: boolean;
  run: (raw: string) => void;
  retry: () => void;
  switchDirection: () => void;
  recent: ReturnType<typeof useRecentSearches>;
}

export function useLookup(): UseLookup {
  const [text, setText] = React.useState('');
  const [queried, setQueried] = React.useState('');
  const [override, setOverride] = React.useState<LookupDirectionValue>('auto');

  const direction = React.useMemo<LookupDirectionValue>(
    () => (queried ? resolveDirection(queried, override) : 'auto'),
    [override, queried],
  );

  const query = trpc.dictionary.lookupStatic.useQuery(
    { word: queried, direction },
    { enabled: queried.length > 0, staleTime: Infinity, retry: false },
  );

  const view = React.useMemo<HomeLookupView>(
    () => (queried ? toHomeLookupView(query.data, direction) : IDLE_VIEW),
    [direction, queried, query.data],
  );

  const busy = useDelayedFlag(query.isPending && queried.length > 0);

  const recent = useRecentSearches();
  const recentRef = React.useRef(recent);
  recentRef.current = recent;
  const pushedRef = React.useRef('');

  React.useEffect(() => {
    const item = toRecentItem(query.data, view.applied);
    if (!item) return;
    const key = `${item.word}|${item.direction}`;
    if (pushedRef.current === key) return;
    pushedRef.current = key;
    recentRef.current.push(item);
  }, [query.data, view.applied]);

  const run = React.useCallback((raw: string): void => {
    const trimmed = raw.trim().slice(0, WORD_MAX_LENGTH);
    if (!trimmed) return;
    setText(trimmed);
    setOverride('auto');
    setQueried(trimmed);
  }, []);

  const retry = React.useCallback((): void => {
    void query.refetch();
  }, [query]);

  const switchDirection = React.useCallback((): void => {
    setOverride(flipLookupDirection(view.applied));
  }, [view.applied]);

  return { text, setText, queried, view, busy, failed: query.isError, run, retry, switchDirection, recent };
}
