/**
 * 待背数与连续天数的**唯一取数面**（R-13⑥ / R-18① / UI §3.5.1 红点）。
 *
 * 为什么要单独一件：R-13⑥ 判的是"完成页 / 我的页 / 菜单红点三处的数字在**同一时刻**相等"。
 * 三处各自发一次请求就必然不等（弱网下更是各拿到各的），所以这里只留一条通路：
 *  - 上游 = `data/queries/review.ts` 的 `dueCountQueryOptions()` 与 `data/queries/checkin.ts`
 *    的 `checkinStatusQueryOptions()`（本文件零 fetch，§5.2「`data/` 是唯一发请求处」）；
 *  - 下游 = `data/startup.ts` 的那份 store：tab 红点（`shell/TabBarShell` 的
 *    `useSyncStatus().dueCount`）读的就是它。本文件是**唯一的写入方**（`syncDueCount()`），
 *    于是"三处相等"由构造保证，而不是靠运气对齐刷新时机。
 *  - 调用方手里已有更热的数（背词页刚拉过队列出参的 `dueToday`）就传 `freshDueToday`，它赢，
 *    并且不再多发热请求。
 *
 * `checkedInOf()` 是对 `data/queries/checkin.ts` 的一处**只读兜底**（不改它）：服务端
 * `GET /api/checkin/status` 的实际键是 `checkedIn`（`packages/server/src/routes/checkin.ts:4`），
 * 而 `normalizeCheckinStatus()` 只认 `checkedToday` / `checked_in_today` ⇒ `checkedToday` 恒 false。
 * 真缺陷在 T-14b 名下，已登记进报告的"越界申请"；本文件只从 DTO 自带的 `raw` 里补读一次。
 *
 * Chrome84 红线（§5.1）：本文件不用 `structuredClone` / `Object.hasOwn` / `Array.prototype.at`
 * / `requestIdleCallback`。
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCount } from '@tm/shared';
import { checkinStatusQueryOptions, type CheckinStatusDto } from '../data/queries/checkin.js';
import { dueCountQueryOptions } from '../data/queries/review.js';
import { hasCredential } from '../data/rest-fetcher.js';
import { getSyncStatus, setDueCount } from '../data/startup.js';
import { useSyncStatus } from '../shell/TabBarShell.js';

export interface DueBadgeData {
  /** 今日待背数：tab 红点与完成页共用同一个数（R-13⑥）。 */
  dueToday: number;
  /** 连续天数：`GET /api/checkin/status` 的 `streak`，三处入口同源（R-13③⑥）。 */
  streak: number;
  dailyGoal: number;
  doneToday: number;
  /** 今天是否已打卡（含 `raw.checkedIn` 兜底，见文件头）。 */
  checkedIn: boolean;
  /** 取数面自身是否在飞（红点不许因为"还没取到"而闪一下 0）。 */
  loading: boolean;
}

const finiteOr = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const rawNumber = (raw: Record<string, unknown> | undefined, key: string): number | undefined =>
  finiteOr(raw === undefined ? undefined : raw[key]);

/** 已打卡判定的唯一实现：认 `checkedToday`，再认服务端实际给的 `checkedIn`。 */
export function checkedInOf(status: CheckinStatusDto | undefined): boolean {
  if (!status) return false;
  if (status.checkedToday) return true;
  return status.raw.checkedIn === true;
}

/**
 * 待背数的优先序（越靠前越热）：调用方手上的队列出参 → 本件拉的那次 `dueCount` 查询
 * → startup store（tab 红点那一份）→ `checkin/status` 的 `dueToday`。
 * 导出成纯函数，是为了让用例能钉住"查询与 store 不一致时取哪一个"这一条（R-13⑥ 的仲裁规则）：
 * store 里可能是启动时（甚至离线队列）写的旧值，而 `dueCount` 查询是一次**服务端读**，
 * 所以热查询压 store；两者都还没到手时才退回 `checkin/status` 的那个，最后才是 0。
 */
export function pickDueToday(
  fresh: number | undefined,
  store: number | null,
  queried: number | undefined,
  statusRaw: number | undefined,
): number {
  return (
    finiteOr(fresh) ??
    finiteOr(queried) ??
    finiteOr(store) ??
    finiteOr(statusRaw) ??
    0
  );
}

/**
 * 唯一写入方：把当前认定的待背数推给 startup store，tab 红点与本页数字从此同一个值。
 * 与 store 已相等时不写（写即 `notify` → 全量重渲染），故不会自激。
 */
export function syncDueCount(due: number): void {
  if (getSyncStatus().dueCount === due) return;
  setDueCount(due);
}

/**
 * 红点/完成页/我的页共用的那一份数字。
 * `freshDueToday` = 调用方刚拉到的队列出参 `dueToday`（背词页给）；给了就不再发第二次待背数请求。
 */
export function useDueBadge(freshDueToday?: number): DueBadgeData {
  const signedIn = hasCredential();
  const store = useSyncStatus();
  const status = useQuery({
    ...checkinStatusQueryOptions(),
    enabled: signedIn,
    retry: 0,
  });
  const needOwnFetch = freshDueToday === undefined;
  const due = useQuery({
    ...dueCountQueryOptions(),
    enabled: signedIn && needOwnFetch,
    retry: 0,
  });

  const dueToday = pickDueToday(
    freshDueToday,
    store.dueCount,
    due.data,
    rawNumber(status.data?.raw, 'dueToday'),
  );

  React.useEffect(() => {
    if (!signedIn) return;
    syncDueCount(dueToday);
  }, [dueToday, signedIn]);

  return {
    dueToday,
    streak: status.data?.streak ?? 0,
    dailyGoal: rawNumber(status.data?.raw, 'dailyGoal') ?? 0,
    doneToday: rawNumber(status.data?.raw, 'doneToday') ?? 0,
    checkedIn: checkedInOf(status.data),
    loading: signedIn && (status.isPending || (needOwnFetch && due.isPending)),
  };
}

export interface DueBadgeProps {
  count: number;
  className?: string;
  testid?: string;
}

/**
 * 红点本体：`0` 时**节点不存在**（R-18① 同口径），≥100 走 `formatCount` 的 `99+`（§6.7 溢出）。
 * T-19 的菜单红点与本件共用同一个数字源（`useDueBadge().dueToday`）。
 */
export function DueBadge({
  count,
  className = '',
  testid = 'due-badge',
}: DueBadgeProps): React.JSX.Element | null {
  if (!(count > 0)) return null;
  return (
    <span
      data-testid={testid}
      aria-hidden="true"
      className={`absolute right-1 top-1 rounded-full bg-danger px-1 text-2xs text-on-brand tnum ${className}`}
    >
      {formatCount(count)}
    </span>
  );
}
