/**
 * App 单词本一级页（`#/wordbook`，tab3）—— T-18b。技术设计 §10.2 表第 3 行 / §5.4 ①②；
 * UI §3.6 全节（3.6.1 布局 / 3.6.2 行形态 / 3.6.3 搜索筛选排序 / 3.6.4 删除 / 3.6.5 七态 / 3.6.7 无障碍）；
 * PRD R-15 ①–⑨、R-16 ①③⑤（App 侧）。
 *
 * 本页只做四件事，其余全部交回组件与数据层（§5.2「`data/` 是唯一发请求处」、§10.2 禁覆写 patterns）：
 *  1. **列表本体 = `@tm/ui/patterns/WordbookList`**（与 Web `/wordbook` 同一份行/左滑/删除实现，
 *     §3.6 组件行「两端同一列表本体」）；本页只给 props 与回调，不复制任何行 DOM。
 *  2. **搜索 / 4 筛选 / 4 排序 = 本地纯计算，0 请求**（R-15 ③「100 词内输入后 ≤300ms 出结果」+
 *     §3.6.3「本地过滤，**不发请求**」）。取数只有 `wordbook.list` 那**一次** `GET /api/wordbook`
 *     （R-15 ⑧「取消每词 2.1 秒逐个补拉」→ 本页 0 处逐词请求；首义只认 ①条目 passthrough 键
 *     ②查词页已写进 React Query 缓存的结果，两者都无 = `（暂无释义）`）。
 *     `?q=&filter=&sort=` 由 **hash 路由承载**（App 无 History API，§4.7 `file://` 行），
 *     于是"可分享、可回退"在 App 侧 = 同一条 hash：控件的唯一真源是 URL，键入先落本地 state、
 *     带去抖地写回 hash（与 T-15 的 `router.replace` 同一节奏）。
 *  3. **删除 = 显式 + 左滑 + 撤销，且真走同步协议**（R-15 ⑥⑦、§3.6.4、§5.4 ①）：
 *     写路径 = `data/queries/wordbook.ts` 的 `removeWord` → `offline-queue.enqueueRemove` →
 *     `POST /api/wordbook/push` 的 `removedWords`；**不是**把行从 state 里抹掉的本地假删。
 *     撤销 = `addWord(word, {addedAt,lastReview,reviewCount})` 把**原进度补丁**回灌队列
 *     （R-15 ⑥「完整恢复该词（含复习进度）」：5 秒窗口内删除多半还没补传，`enqueueUpsert`
 *     会同词翻转掉那条 `pendingRemovals` ⇒ 服务端压根没删过；已补传则 entries 带着原
 *     `lastReview/reviewCount` 回灌，字段级 merge 由服务端保证 —— 见报告 §5 跨任务项）。
 *     行的即时消失/回来靠**本机队列投影**（`loadState()`）叠加在服务端列表上，
 *     所以补传前 refetch 也不会让删掉的词"复活"（R-20 ①⑤ 的离线优先语义）。
 *  4. **七态**逐条对上 §3.6.5（空 / 筛选空 / 未登录 / 首屏 8 条骨架 / 释义补齐 / 拉取失败 / 删除写失败）。
 *
 * 两条写进报告的判断（不是私自改判据）：
 *  - §3.6.5 的定稿串与 `@tm/shared` 的 `WORDBOOK_COPY.{emptySignedOut,emptyLoggedIn,filteredEmpty}`
 *    是**同一场景的两套措辞**。本页与 T-15 的 Web 页一样取 **shared 那一套**（文案唯一源 +
 *    两端并排走查逐字一致，§8.2-2），差异登记为遗留项 L-1 待 PM 收敛；
 *    但「主按钮 `手机号登录` + 文字链 `没有账号？注册`」两件都照 §3.6.5 落（后者取
 *    `WORDBOOK_COPY.emptySignedOut.link`，与 `AUTH_COPY.wall.link` 同一声明点；T-27 起本卡只有这两颗）。
 *  - §3.6.5 末行「删除写失败（离线）→ 行不消失」在 App 的**离线优先写队列**语义下没有对应的
 *    失败态（写 = 落本机持久队列，成功即成立；真正联网的活儿归 `data/startup.ts` 第 1 步）。
 *    本页把这一行实现成它唯一真实的失败分支：**入队本身抛错**（WebView 把 DOMStorage 关了）→
 *    行不消失 + 定稿 toast，并另给 `SyncBadge` 的 `待同步 N` 作离线期间的可见反馈。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`。
 */

import * as React from 'react';
import {
  ARIA,
  NAV_ITEMS,
  TOAST_UNDO_MS,
  VERBS,
  WORDBOOK_COPY,
  type LookupResponse,
  type WordbookEntryDto,
} from '@tm/shared';
import {
  EmptyState,
  SearchBar,
  SkeletonBlock,
  WordbookList,
  useHost,
  type WordbookRow,
} from '@tm/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lookupKeys } from '../data/queries/lookup.js';
import {
  addWord,
  removeWord,
  wordbookKeys,
  wordbookQueryOptions,
} from '../data/queries/wordbook.js';
import { hasCredential } from '../data/rest-fetcher.js';
import { loadState, type UpsertPatch, type WbSyncState } from '../data/offline-queue.js';
import { publishPending } from '../data/startup.js';
import { detailHref, recentTimeLabel, resultGloss } from '../components/result-row.js';
import {
  FilterChips,
  SortMenu,
  WORDBOOK_APP_COPY as COPY,
  WORDBOOK_FILTERS,
  WORDBOOK_SORTS,
  filterLabel,
  isFilter,
  isSort,
  sortLabel,
  type WordbookFilter,
  type WordbookSort,
} from '../components/wordbook-toolbar.js';
import { LOGIN_ROUTE, REGISTER_ROUTE } from '../lib/auth-store.js';
import { navigate, useLocation } from '../router.js';
import { SyncBadge } from '../shell/TabBarShell.js';

/* ═════════════════ 常量（§3.6.3：URL 三键；页标题取全站唯一导航表） ═════════════════ */

export const WORDBOOK_PATH = '/wordbook';

/** §3.6.3 末行：键入即时过滤（本地、0 请求），hash 只是可分享/可回退的影子 ⇒ 去抖写回。 */
export const URL_SYNC_MS = 250;

/** 页标题不写第二遍：`NAV_ITEMS` 是 5 个 tab 的唯一源（`router.tsx:75` 同源）。 */
export function wordbookPageTitle(): string {
  const item = NAV_ITEMS.find((nav) => nav.hash === `#${WORDBOOK_PATH}`);
  return item?.title ?? item?.tab ?? '单词本';
}

/* ═════════════════ URL ⇄ 参数（纯函数，判据 R-15 ③④⑤ / §3.6.3） ═════════════════ */

export interface WordbookListParams {
  q: string;
  filter: WordbookFilter;
  sort: WordbookSort;
}

export const DEFAULT_PARAMS: WordbookListParams = { q: '', filter: 'all', sort: 'recent' };

/** 非法/缺失的键一律回落默认档（分享链 `?filter=xxx` 不许白屏）。 */
export function parseListParams(query: Record<string, string> | undefined): WordbookListParams {
  const raw = query ?? {};
  const q = typeof raw.q === 'string' ? raw.q : '';
  return {
    q,
    filter: isFilter(raw.filter) ? raw.filter : DEFAULT_PARAMS.filter,
    sort: isSort(raw.sort) ? raw.sort : DEFAULT_PARAMS.sort,
  };
}

/** 默认值不落进 URL，保证 `#/wordbook` 是"什么都没筛"的规范形态。 */
export function serializeListParams(params: WordbookListParams): string {
  const parts: string[] = [];
  if (params.q !== '') parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.filter !== DEFAULT_PARAMS.filter) parts.push(`filter=${params.filter}`);
  if (params.sort !== DEFAULT_PARAMS.sort) parts.push(`sort=${params.sort}`);
  return parts.length === 0 ? WORDBOOK_PATH : `${WORDBOOK_PATH}?${parts.join('&')}`;
}

/* ═════════════════ 条目 → 行（纯函数） ═════════════════ */

/** FSRS 进度档；`wordbook.list` 目前没有这个键（同 T-15 报告的 U-1，服务端补上即自动亮起）。 */
export type WordbookStage = 'new' | 'learning' | 'mastered';

export interface WordbookRowView extends WordbookRow {
  stage: WordbookStage;
  /** `最常忘` 的排序键：服务端 passthrough 里有就用，没有走 `lastReview` 兜底（同 T-15 的 U-3 口径）。 */
  lapses?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_INTERVAL_DAYS = 7;
const MASTERED_LAPSE_CEILING = 3;

const extraOf = (entry: WordbookEntryDto): { state?: number; lapses?: number; nextDue?: string | number } =>
  entry as { state?: number; lapses?: number; nextDue?: string | number };

/**
 * 进度档推导（与 Web `lib/api/wordbook.ts` 的 `stageOf` **同一套规则**，两端并排走查才可能对得上）：
 *  - 服务端给了 `state` 就直读（0 = 无卡 = 新词，R-15 ⑤ 的"无 FSRS 卡词数"在后端断言）；
 *    键到位时只有 `CardState.Review`(2) 算掌握候选（长间隔 due = FSRS 认为已稳定记住），
 *    `Relearning`(3) 是刚失手重学 ⇒ 归在背（A-87 #325；`lapses` 不再参与该分支判档）；
 *  - 没给：`reviewCount` 缺失或 0 ⇒ 从没评过分 ⇒ `new`；`lapses ≥ 3` ⇒ 反复忘过 ⇒ 不算掌握；
 *    `nextDue` 距今 ≥ 7 天 ⇒ 长间隔 ⇒ `mastered`；其余 `learning`。
 */
export function stageOf(entry: WordbookEntryDto, now: number): WordbookStage {
  const extra = extraOf(entry);
  if (typeof extra.state === 'number') {
    if (extra.state <= 0) return 'new';
    if (extra.state === 2 && typeof extra.nextDue === 'number' && extra.nextDue - now >= LONG_INTERVAL_DAYS * DAY_MS) return 'mastered';
    return 'learning';
  }
  if (!entry.reviewCount) return 'new';
  if ((extra.lapses ?? 0) >= MASTERED_LAPSE_CEILING) return 'learning';
  const raw = extra.nextDue;
  if (raw === undefined || raw === null || raw === '') return 'learning';
  const asNumber = Number(raw);
  const due = Number.isNaN(asNumber) ? Date.parse(String(raw)) : asNumber;
  if (Number.isFinite(due) && due - now >= LONG_INTERVAL_DAYS * DAY_MS) return 'mastered';
  return 'learning';
}

/** 首义：条目 passthrough 的 `gloss`（服务端批量过程一落地就自动亮起）优先，其次查词缓存。 */
export function glossOf(entry: WordbookEntryDto, cached: (word: string) => string): string {
  const own = (entry as { gloss?: string }).gloss;
  if (typeof own === 'string' && own !== '') return own;
  return cached(entry.word);
}

/** §3.6.2 行 3：`加入 昨天 · 复习 4 次`（320px 下由组件自己只留行 1+行 2）。 */
export function metaOf(entry: WordbookEntryDto, now: number): string {
  const parts: string[] = [];
  const joined = entry.addedAt ? recentTimeLabel(entry.addedAt, now) : '';
  if (joined) parts.push(`${COPY.metaJoined} ${joined}`);
  if (entry.reviewCount) parts.push(COPY.metaReviewed(entry.reviewCount));
  return parts.join(' · ');
}

const MASTERED_BADGE = { label: COPY.masteredBadge, tone: 'success' } as const;

export function toRows(
  entries: readonly WordbookEntryDto[],
  cached: (word: string) => string,
  now: number = Date.now(),
): WordbookRowView[] {
  const rows: WordbookRowView[] = [];
  for (const entry of entries) {
    const stage = stageOf(entry, now);
    rows.push({
      word: entry.word,
      gloss: glossOf(entry, cached),
      meta: metaOf(entry, now),
      addedAt: entry.addedAt,
      lastReview: entry.lastReview,
      reviewCount: entry.reviewCount,
      lapses: extraOf(entry).lapses,
      stage,
      // §3.6.2：只有 `已掌握` 加标记（新词/在背不加点子彩色，避免视觉噪音），且靠文字不靠颜色。
      badge: stage === 'mastered' ? MASTERED_BADGE : undefined,
    });
  }
  return rows;
}

/* ═════════════════ 本机队列叠加（R-20 ①⑤：乐观态的真相在持久队列里，不在组件 state 里） ═════════════════ */

const keyOf = (word: string): string => (word ?? '').trim().toLowerCase();

/**
 * 服务端列表 ⊖ 待删 + 待藏。
 * 不叠这一段会出现一个真 bug：删除只是**入队**，`invalidate` 后的 refetch 仍会带回那个词
 * ⇒ 行"复活"。叠加后行立刻消失、撤销后立刻回来，且离开本页再回来仍然一致（队列是落盘的）。
 */
export function applyQueue(
  entries: readonly WordbookEntryDto[],
  state: WbSyncState,
): WordbookEntryDto[] {
  const removing = new Set<string>(state.pendingRemovals.map((w) => keyOf(w)));
  const kept: WordbookEntryDto[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = keyOf(entry.word);
    if (removing.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  for (const pending of state.pendingUpserts) {
    const key = keyOf(pending.word);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({
      word: pending.word,
      addedAt: pending.addedAt,
      lastReview: pending.lastReview,
      reviewCount: pending.reviewCount,
    });
  }
  return kept;
}

/* ═════════════════ 筛选 + 排序（判据 R-15 ③④⑤） ═════════════════ */

const byLetter = (a: WordbookRowView, b: WordbookRowView): number => a.word.localeCompare(b.word);

/** `最久没碰` = lastReview 升序，空值排最后（§3.6.3 行 3 括号里的口径）。 */
const byIdle = (a: WordbookRowView, b: WordbookRowView): number =>
  (a.lastReview ?? Number.POSITIVE_INFINITY) - (b.lastReview ?? Number.POSITIVE_INFINITY);

/** `最常忘` = lapse 降序；没有 lapse 数据时退到"最久没碰"（与 T-15 同一兜底，两端同序）。 */
const forgottenScore = (row: WordbookRowView, now: number): number => {
  if (typeof row.lapses === 'number') return -row.lapses;
  if (!row.lastReview) return -1000;
  return row.lastReview - now;
};

export function selectRows(
  rows: readonly WordbookRowView[],
  params: WordbookListParams,
  now: number = Date.now(),
): WordbookRowView[] {
  const needle = params.q.trim().toLowerCase();
  const kept: WordbookRowView[] = [];
  for (const row of rows) {
    if (params.filter !== 'all' && row.stage !== params.filter) continue;
    if (needle === '') {
      kept.push(row);
      continue;
    }
    // R-15 ③：按**词与释义**子串筛选。
    if (row.word.toLowerCase().includes(needle) || (row.gloss ?? '').toLowerCase().includes(needle)) {
      kept.push(row);
    }
  }
  const sorted = kept.slice();
  if (params.sort === 'alphabetical') sorted.sort(byLetter);
  else if (params.sort === 'longestIdle') sorted.sort(byIdle);
  else if (params.sort === 'mostForgotten')
    sorted.sort((a, b) => forgottenScore(a, now) - forgottenScore(b, now) || byIdle(a, b));
  else sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return sorted;
}

/** 筛选 chips 的计数（`全部 128 · 新词 34 · 在背 79 · 已掌握 15`；计数恒按**整本**，与搜索无关）。 */
export function countStages(rows: readonly WordbookRowView[]): Record<WordbookFilter, number> {
  const counts: Record<WordbookFilter, number> = { all: rows.length, new: 0, learning: 0, mastered: 0 };
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

/** 是否处于"筛过"的状态（结果计数 `找到 N 词` 只在这时出现，§3.6.1 区 D）。 */
export function isFiltering(params: WordbookListParams): boolean {
  return params.q.trim() !== '' || params.filter !== DEFAULT_PARAMS.filter;
}

/* ═════════════════ 内联图标（§3.6.5 空态「40px 图标，不引图片、不做插画」；不引 lucide） ═════════════════ */

function BookGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-10 w-10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4V5ZM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6V5Z" />
    </svg>
  );
}

/* ═════════════════ 页面 ═════════════════ */

export function WordbookScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const loc = useLocation();
  const signedIn = hasCredential();

  /** 控件真源 = hash 上的 `?q=&filter=&sort=`（§3.6.3 末行「可分享、可回退；恢复时控件与列表同步」）。 */
  const synced = parseListParams(loc.query);
  /** 键入先落本地 state：本地过滤立即生效，URL 由去抖补写（见 `onChange` 下方注释）。 */
  const [q, setQ] = React.useState(synced.q);
  React.useEffect(() => setQ(synced.q), [synced.q]);

  const params: WordbookListParams = { q, filter: synced.filter, sort: synced.sort };

  const list = useQuery({ ...wordbookQueryOptions(), enabled: signedIn, retry: 0 });
  /** 队列版本号：每次入队 / 列表新数据到达都重算叠加态（`loadState()` 是同步读盘，不发请求）。 */
  const [revision, setRevision] = React.useState(0);
  const bump = React.useCallback((): void => setRevision((v) => v + 1), []);

  const queue = React.useMemo<WbSyncState>(
    () => loadState(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision/list.data 才是重算时机，读盘本身无依赖
    [revision, list.data],
  );

  /** 首义第二条来源：查词页已经拿到的结果直接复用缓存 = 0 请求（R-15 ⑧ 的请求数预算）。 */
  const cachedGloss = React.useCallback(
    (word: string): string => {
      const hit = queryClient.getQueryData<LookupResponse>(lookupKeys.one(word, 'en2zh'));
      return hit === undefined ? '' : resultGloss(hit);
    },
    [queryClient],
  );

  const views = React.useMemo(
    () => toRows(applyQueue(list.data ?? [], queue), cachedGloss),
    [cachedGloss, list.data, queue],
  );
  const rows = React.useMemo(() => selectRows(views, params), [params, views]);
  const counts = React.useMemo(() => countStages(views), [views]);

  const entryByWord = React.useMemo(() => {
    const map = new Map<string, WordbookEntryDto>();
    for (const entry of list.data ?? []) map.set(keyOf(entry.word), entry);
    for (const pending of queue.pendingUpserts) {
      const key = keyOf(pending.word);
      if (!map.has(key)) map.set(key, pending);
    }
    return map;
  }, [list.data, queue]);

  /* 未登录时业务接口一个都不该发（`enabled` 已挡住），进页面只做一件事：把徽章和本机队列对齐。 */
  React.useEffect(() => {
    publishPending();
    bump();
  }, [bump]);

  /* ───────── URL 写入 ───────── */

  const latest = React.useRef(params);
  React.useEffect(() => {
    latest.current = params;
  }, [params]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  React.useEffect(() => clearTimer, []);

  const writeUrl = React.useCallback((next: WordbookListParams): void => {
    navigate(serializeListParams(next));
  }, []);

  const setFilter = (next: WordbookFilter): void => {
    clearTimer();
    writeUrl({ ...latest.current, filter: next });
  };
  const setSort = (next: WordbookSort): void => {
    clearTimer();
    writeUrl({ ...latest.current, sort: next });
  };
  /** `清空筛选和搜索` = 三键一起回默认（与 Web 同一动作）。 */
  const clearAll = (): void => {
    clearTimer();
    setQ('');
    writeUrl(DEFAULT_PARAMS);
  };

  const onSearchChange = (value: string): void => {
    setQ(value);
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      writeUrl({ ...latest.current, q: value });
    }, URL_SYNC_MS);
  };
  const onSearchSubmit = (value: string): void => {
    clearTimer();
    writeUrl({ ...latest.current, q: value });
  };
  const onSearchClear = (): void => {
    clearTimer();
    setQ('');
    writeUrl({ ...latest.current, q: '' });
  };

  /* ───────── 删除 / 撤销（R-15 ⑥⑦、§3.6.4、§5.4 ①） ───────── */

  const patchOf = React.useCallback(
    (word: string, row: WordbookRow): UpsertPatch => {
      const entry = entryByWord.get(keyOf(word));
      return {
        addedAt: entry?.addedAt ?? row.addedAt,
        lastReview: entry?.lastReview ?? row.lastReview,
        reviewCount: entry?.reviewCount ?? row.reviewCount,
      };
    },
    [entryByWord],
  );

  const undoRemove = React.useCallback(
    (word: string, patch: UpsertPatch): void => {
      // 撤销 = 同一个词的一次 upsert 把「待删」翻掉（`enqueueUpsert` 会清 `pendingRemovals` 里同词条），
      // 并带上原 `addedAt/lastReview/reviewCount` ⇒ 行回到原位、复习进度不丢（R-15 ⑥）。
      try {
        addWord(word, patch);
      } catch {
        // A-46 #98：这条 upsert 没落账 ⇒ 待删那条还在队列里、词最终还是会被删。
        // 于是**不**翻回乐观态（不 `bump()` / 不 `publishPending()`）、不发 `已恢复`，
        // 反馈复用 §3.6.5 末行那一条定稿串（形态照下面的 `removeRow`，禁"云端/本地"字样）。
        host.toast(COPY.deleteNotQueued, { tone: 'error', durationMs: 6000 });
        return;
      }
      publishPending();
      bump();
      void queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
      host.toast(COPY.restored, { tone: 'success' });
    },
    [bump, host, queryClient],
  );

  const removeRow = React.useCallback(
    (row: WordbookRow): void => {
      const patch = patchOf(row.word, row);
      try {
        removeWord(row.word);
      } catch {
        // §3.6.5 末行：这条**不**消失，并给可读反馈（禁"云端/本地"字样）。
        host.toast(COPY.deleteNotQueued, { tone: 'error', durationMs: 6000 });
        return;
      }
      publishPending();
      bump();
      void queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
      // 反馈 = 撤销 toast（§3.6.4「不是确认弹窗」），窗口 5 秒（`TOAST_UNDO_MS`）。
      host.toast(WORDBOOK_COPY.swipeDelete.undoToast(row.word), {
        tone: 'info',
        durationMs: TOAST_UNDO_MS,
        action: { label: VERBS.undo, onClick: (): void => undoRemove(row.word, patch) },
      });
    },
    [bump, host, patchOf, queryClient, undoRemove],
  );

  const openDetail = React.useCallback(
    (row: WordbookRow): void => host.navigate(detailHref(row.word, 'wordbook')),
    [host],
  );
  const speak = React.useCallback(
    (word: string): void => host.speak(word, 'us'),
    [host],
  );

  /* ───────── 渲染 ───────── */

  const firstLoad = signedIn && list.isPending;

  if (!signedIn) {
    return (
      <div className="w-full px-4" data-testid="wordbook-screen">
        <PageHeader total={null} />
        {/* §3.6.5 行 3「未登录访问」：列表区骨架 + 引导卡并存。
            引导卡**恰两颗**动作（T-27 / A-48 #113：规范只给主按钮 + 文字链，第三颗「回首页」不在表内）。 */}
        <SkeletonBlock variant="list-rows" rows={8} testid="wordbook-signed-out-skeleton" />
        <EmptyState
          size="lg"
          icon={<BookGlyph />}
          title={WORDBOOK_COPY.emptySignedOut.title}
          hint={WORDBOOK_COPY.emptySignedOut.subtitle}
          primary={{ label: WORDBOOK_COPY.emptySignedOut.cta, onClick: () => goLogin('sign-in') }}
          link={{
            label: WORDBOOK_COPY.emptySignedOut.link,
            onClick: () => goLogin('register'),
          }}
          testid="wordbook-signed-out"
        />
      </div>
    );
  }

  if (list.isError) {
    return (
      <div className="w-full px-4" data-testid="wordbook-screen">
        <PageHeader total={null} />
        <EmptyState
          size="lg"
          title={COPY.loadFailTitle}
          hint={COPY.loadFailBody}
          primary={{ label: VERBS.retry, onClick: () => void list.refetch() }}
          secondary={{ label: VERBS.goLookup, onClick: () => host.navigate('/') }}
          testid="wordbook-load-fail"
        />
      </div>
    );
  }

  const filtering = isFiltering(params);

  return (
    <div className="w-full px-4" data-testid="wordbook-screen">
      <PageHeader total={views.length} />

      {/* §3.6.1：B/C/D 合并为吸顶工具条，滚动时页头 A 消失、这三行保持可见。 */}
      <div
        className="sticky top-0 z-sticky flex flex-col gap-3 bg-bg/92 py-2 backdrop-blur"
        data-testid="wordbook-toolbar"
      >
        {firstLoad ? (
          <SkeletonBlock variant="result-bar" testid="wordbook-toolbar-skeleton" />
        ) : (
          <>
            <SearchBar
              size="list"
              label={ARIA.searchField}
              placeholder={q === '' ? COPY.searchPlaceholder : ''}
              value={q}
              onChange={onSearchChange}
              onSubmit={onSearchSubmit}
              onClear={onSearchClear}
              testid="wordbook-search"
            />
            <div className="flex flex-col gap-2">
              <FilterChips value={params.filter} counts={counts} onChange={setFilter} />
              <div className="flex items-center justify-between gap-2">
                <p
                  role="status"
                  aria-live="polite"
                  data-testid="wordbook-result-count"
                  className="text-sm text-ink-muted"
                >
                  {filtering ? COPY.resultCount(rows.length) : ''}
                </p>
                <SortMenu value={params.sort} onChange={setSort} />
              </div>
            </div>
          </>
        )}
      </div>

      <WordbookList
        variant="page"
        // §3.6.1：≥1024px 双列（`grid-cols-2 gap-3`）。列表本体仍是一个 `<ul>`，只是容器换布局。
        className="lg:grid lg:grid-cols-2 lg:gap-3"
        items={rows}
        loading={firstLoad}
        hrefFor={(word: string) => detailHref(word, 'wordbook')}
        onOpen={openDetail}
        rowAriaLabel={ARIA.wordbookRow}
        onSpeak={speak}
        speakLabel={ARIA.speak}
        // §3.6.2「星标（已收藏）→ 喇叭 → 删除」三 affordance 首屏可见；词本里的星标点下去就是移出，
        // 与删除同一条路（显式、可撤销），所以不给 `ConfirmSheet`（§3.6.4「反馈是撤销 toast」）。
        onToggleFavorite={removeRow}
        favoritedLabel={VERBS.favorited}
        onDelete={removeRow}
        deleteAriaLabel={ARIA.removeFromWordbook}
        swipeDelete
        glossFallback={WORDBOOK_COPY.noGloss}
        empty={
          views.length === 0 ? (
            <EmptyState
              size="lg"
              icon={<BookGlyph />}
              title={WORDBOOK_COPY.emptyLoggedIn.title}
              hint={WORDBOOK_COPY.emptyLoggedIn.subtitle}
              primary={{ label: WORDBOOK_COPY.emptyLoggedIn.cta, onClick: () => host.navigate('/') }}
              testid="wordbook-empty"
            />
          ) : (
            <EmptyState
              size="lg"
              title={WORDBOOK_COPY.filteredEmpty.title}
              hint={WORDBOOK_COPY.filteredEmpty.subtitle}
              link={{ label: COPY.clearAll, onClick: clearAll }}
              testid="wordbook-filtered-empty"
            />
          )
        }
        testid="wordbook-list"
      />
    </div>
  );
}

/* ═════════════════ 页头（区 A） ═════════════════ */

function PageHeader({ total }: { total: number | null }): React.JSX.Element {
  return (
    <header className="flex min-h-tap items-baseline gap-2 px-1" data-testid="wordbook-header">
      <h1 className="text-h1 max-md:text-h1-xs font-bold text-ink">{wordbookPageTitle()}</h1>
      {total === null ? null : (
        <span className="tnum text-sm text-ink-muted" data-testid="wordbook-total">
          {COPY.pageTotal(total)}
        </span>
      )}
      {/* R-20 ⑤ 的同步状态唯一出口（`待同步 N` / `还没同步 · 联网后会自动补上`）；
          §5.5 末段明写本组件由批次4 在词本页放一处。 */}
      <SyncBadge className="ml-auto shrink-0" />
    </header>
  );
}

/** 未登录的两条出路：`手机号登录` → `#/login`、`没有账号？注册` → `#/register`（§3.6.5 行 3；两颗 gate 共指登录屏，两态由路由分流，`from=` 保留）。 */
function goLogin(mode: 'sign-in' | 'register'): void {
  const route = mode === 'register' ? REGISTER_ROUTE : LOGIN_ROUTE;
  navigate(`${route}?from=${encodeURIComponent(WORDBOOK_PATH.slice(1))}`);
}

/** `filterLabel` / `sortLabel` 从本文件再导一次，用例按"逐字比对"只需 import 页面一处。 */
export { filterLabel, sortLabel, WORDBOOK_FILTERS, WORDBOOK_SORTS };

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default WordbookScreen;
