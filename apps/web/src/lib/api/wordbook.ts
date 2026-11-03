/**
 * 单词本域的**传输与视图投影**层（§10.2 T-15 行 🆕`lib/api/wordbook.ts`）。
 *
 * 传输唯一走 `@/lib/trpc`（`web-home-transport` 与 `--ui-io` 同表禁 `fetch(`）。
 * 本文件里除 hook 之外全是纯函数：排序/筛选/URL 参数三件事必须能脱开浏览器单测，
 * 因为 R-15③④⑤ 的判据是"100 词内输入后 ≤300ms 出结果""至少 4 项排序""4 项预置筛选"，
 * 三条都是**纯计算**判据，不该等到 e2e 才发现错。
 *
 * ⚠ 首义（gloss）：R-15⑧ 要求"一次批量请求补齐"，PRD 把落点写成「（新）`dictionaries` 批量」，
 * 那是 T-09/T-11 的服务端过程；`wordbook.list` 出参里没有 `gloss`。本文件因此**不发任何补拉请求**
 * （逐词拉取正是 R-15⑧ 点名要取消的行为），行内首义只认两个来源：
 * ① `WordbookEntry` 的 passthrough 键（服务端批量过程一落地就自动亮起来，改这里 0 行）；
 * ② 首页查词已经写进 React Query 缓存的 `dictionary.lookupStatic` 结果（复用缓存 = 0 请求，
 *    R-10③ 同源）。两者都没有时由 `WordbookList` 的 `glossFallback` 显示 `（暂无释义）`（§3.6.2 行 2）。
 */

import * as React from 'react';
import {
  RELATIVE_TIME_COPY,
  TOAST_UNDO_MS,
  VERBS,
  WORDBOOK_COPY,
  WORDBOOK_FILTER_LABELS,
  WORDBOOK_FILTERS,
  WORDBOOK_SORT_LABELS,
  WORDBOOK_SORTS,
  formatCount,
  type WordbookEntry,
} from '@tm/shared';
import type { ToastOptions, WordbookRow } from '@tm/ui';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';

/* ───────── 宿主注入串 ─────────
 * `@tm/shared` 现状（A-30-7 之后）：`WORDBOOK_COPY.sortMenu` 只有 3 档，筛选四档与行 3 元信息
 * 前缀完全没有，所以这几串按 A-8 的老办法由宿主给。
 * ✅ 四档排序/筛选串已由 **T-03r（A-43 #80 · F-5）上收 `@tm/shared`**，本块改为 import，
 *   与 App 侧 `components/wordbook-toolbar.tsx` 共用同一份真源（此前两处各手抄一份）。
 *   其余行内串（行 3 元信息、侧栏可访问名、§3.6.5-7 两处宿主补的标题/副行）仍是「shared 缺常量」
 *   清单，登记在 `01-prd-fix4.md` §2 表 C，按该表口径另轮处理，本轮不并。
 *   ✅ §3.6.5 行 5 的释义两串（`fillingGlosses` / `glossStalled`）已由 **T-03r2b** 改引
 *   `@tm/shared` 的 `WORDBOOK_COPY.glossPending` / `glossStalled`，本块只转发、不再自带字面量。
 * ⚠ 命名以 UI §3.6 的锁定口径为准，不用架构 §7.1 的早期措辞。
 */
const HOST_COPY = {
  sort: WORDBOOK_SORT_LABELS,
  filter: WORDBOOK_FILTER_LABELS,
  metaJoined: '加入',
  metaReviewed: (n: number): string => `复习 ${n} 次`,
  resultCount: (n: number): string => `找到 ${formatCount(n)} 词`,
  filterGroup: '筛选',
  sortButton: '排序',
  sortHint: (label: string): string => `排序：${label}`,
  clearAll: '清空筛选和搜索',
  pageHeading: '单词本',
  pageTotal: (n: number): string => `共 ${formatCount(n)} 词`,
  openPage: '打开单词本页',
  collapseSidebar: '收起侧栏',
  expandSidebar: '展开侧栏',
  /** T-03r2b：两处释义态串已上收 shared（`glossPending` / `glossStalled`），本行只转发。 */
  fillingGlosses: WORDBOOK_COPY.glossPending,
  glossStalled: WORDBOOK_COPY.glossStalled,
  masteredBadge: '已掌握',
  /** §3.6.3 B 行：词本搜索框的 placeholder（首页那串 `查一个单词` 不通用）。 */
  searchPlaceholder: '搜单词或释义',
  /** §3.6.5「列表拉取失败」错误卡：shared 只有 toast 串 `pullFail`，标题/副行缺，宿主补。 */
  loadFailTitle: '没能取到你的单词本',
  loadFailBody: '再试一次，或者先回首页查词',
  /** §3.6.7：筛选组与排序按钮的可访问名之外的两处 —— chip 的 `aria-pressed` 由 `filterLabel` 承担。 */
  sortMenuLabel: '排序方式',
  sortMenuItem: (label: string, current: boolean): string => (current ? `${label}（当前）` : label),
} as const;

/** UI §3.6.2 行 3 的「已掌握」标记：只有文字，不靠颜色（§7 第 4 条）。 */
const MASTERED_BADGE = { label: HOST_COPY.masteredBadge, tone: 'success' } as const;

/* ───────── 排序 / 筛选取值域（纯函数，判据④） ─────────
 * A-43 #80（F-5）：取值域数组已上收 `@tm/shared/constants/copy.ts`，本文件只转发（消费方 import 路径不动）。 */

export { WORDBOOK_FILTERS, WORDBOOK_SORTS };
export type WordbookSort = (typeof WORDBOOK_SORTS)[number];
export type WordbookFilter = (typeof WORDBOOK_FILTERS)[number];

export interface WordbookListParams {
  q: string;
  filter: WordbookFilter;
  sort: WordbookSort;
}

const DEFAULT_PARAMS: WordbookListParams = { q: '', filter: 'all', sort: 'recent' };

export function parseListParams(raw: URLSearchParams): WordbookListParams {
  const q = raw.get('q') ?? '';
  const filter = raw.get('filter');
  const sort = raw.get('sort');
  return {
    q: q.trim() ? q : '',
    filter: (WORDBOOK_FILTERS as readonly string[]).includes(filter ?? '')
      ? (filter as WordbookFilter)
      : DEFAULT_PARAMS.filter,
    sort: (WORDBOOK_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as WordbookSort)
      : DEFAULT_PARAMS.sort,
  };
}

/** `?q=&filter=&sort=` 全部可分享、可回退（UI §3.6.3 末行）。 */
export function serializeListParams(params: WordbookListParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.filter !== 'all') sp.set('filter', params.filter);
  if (params.sort !== 'recent') sp.set('sort', params.sort);
  const query = sp.toString();
  return query ? `/wordbook?${query}` : '/wordbook';
}

export function sortLabel(sort: WordbookSort): string {
  return HOST_COPY.sort[sort];
}

export function filterLabel(filter: WordbookFilter): string {
  return HOST_COPY.filter[filter];
}

/* ───────── 行模型 ───────── */

/** FSRS 进度档：`wordbook.list` 目前**没有**这个键（见报告「上游缺口」U-1）。 */
export type WordbookStage = 'new' | 'learning' | 'mastered';

export interface WordbookEntryView extends WordbookEntry {
  stage: WordbookStage;
  gloss: string;
}

/**
 * 条目 → 行视图。
 *
 * `stage` 的推导规则（拿不到 FSRS `state` 之前的最保守口径，逐条有据）：
 * - `reviewCount` 缺失或 0 ⇒ 这张卡从没被评过分 ⇒ `new`（R-15⑤ 的"无 FSRS 卡词数"在
 *   服务端补 `state` 之前只能这样近似，条数断言归后端）；
 * - 有 `lapses` 且 ≥ `MASTERED_LAPSE_CEILING` ⇒ 反复忘过的词不算掌握；
 * - 有 `nextDue` 且距今 ≥ 7 天 ⇒ 已进入长间隔 ⇒ `mastered`；
 * - 其余 ⇒ `learning`。
 * 服务端把 `state` 发下来后，第一行改读 `entry.state` 即可，其余逻辑不动。
 * 键到位分支（A-87 #325）：只有 `CardState.Review`(2) 算掌握候选（长间隔 due = FSRS 认为已稳定记住），
 * `Relearning`(3) 是刚失手重学 ⇒ 归在背；`lapses` 不再参与该分支判档（降级分支口径不变）。
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_INTERVAL_DAYS = 7;
const MASTERED_LAPSE_CEILING = 3;

function stageOf(entry: WordbookEntry, now: number): WordbookStage {
  const extra = entry as WordbookEntry & { state?: number; lapses?: number; nextDue?: string | number };
  if (typeof extra.state === 'number') {
    if (extra.state <= 0) return 'new';
    if (extra.state === 2 && typeof extra.nextDue === 'number' && extra.nextDue - now >= LONG_INTERVAL_DAYS * DAY_MS) return 'mastered';
    return 'learning';
  }
  if (!entry.reviewCount) return 'new';
  if ((extra.lapses ?? 0) >= MASTERED_LAPSE_CEILING) return 'learning';
  const due = extra.nextDue == null ? Number.NaN : Number.isNaN(Number(extra.nextDue)) ? Date.parse(String(extra.nextDue)) : Number(extra.nextDue);
  if (Number.isFinite(due) && due - now >= LONG_INTERVAL_DAYS * DAY_MS) return 'mastered';
  return 'learning';
}

const glossOf = (entry: WordbookEntry): string =>
  (entry as WordbookEntry & { gloss?: string }).gloss ?? '';

/** 首页查词缓存里的首义（0 请求；`getCachedGloss` 由页面注入，保持本文件可脱网测试）。 */
export function toEntryViews(
  entries: readonly WordbookEntry[] | undefined,
  lookup: (word: string) => string,
  now = Date.now(),
): WordbookEntryView[] {
  return (entries ?? []).map((entry) => ({
    ...entry,
    stage: stageOf(entry, now),
    gloss: glossOf(entry) || lookup(entry.word),
  }));
}

/** §3.6.2 行 3：`加入 3 天前 · 复习 4 次`（320px 下由 `WordbookList` 的 sidebar 变体省掉）。 */
function metaOf(entry: WordbookEntryView, now: number): string {
  const parts: string[] = [];
  const joined = entry.addedAt ? relativeDay(entry.addedAt, now) : '';
  if (joined) parts.push(`${HOST_COPY.metaJoined} ${joined}`);
  if (entry.reviewCount) parts.push(HOST_COPY.metaReviewed(entry.reviewCount));
  return parts.join(' · ');
}

/** §6.7 五档相对时间（`RELATIVE_TIME_COPY` 是唯一模板源）。 */
export function relativeDay(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return RELATIVE_TIME_COPY.justNow;
  if (diff < 60 * 60_000) return RELATIVE_TIME_COPY.minutesAgo(Math.floor(diff / 60_000));
  if (diff < DAY_MS) return RELATIVE_TIME_COPY.hoursAgo(Math.floor(diff / 3_600_000));
  if (diff < 2 * DAY_MS) return RELATIVE_TIME_COPY.yesterday;
  const d = new Date(at);
  return RELATIVE_TIME_COPY.monthDay(d.getMonth() + 1, d.getDate());
}

export function toWordbookRows(entries: readonly WordbookEntryView[], now = Date.now()): WordbookRow[] {
  return entries.map((entry) => ({
    word: entry.word,
    gloss: entry.gloss,
    meta: metaOf(entry, now),
    addedAt: entry.addedAt,
    lastReview: entry.lastReview,
    reviewCount: entry.reviewCount,
    badge: entry.stage === 'mastered' ? MASTERED_BADGE : undefined,
  }));
}

/* ───────── 过滤 + 排序（判据③④⑤） ───────── */

const byWord = (a: WordbookRow, b: WordbookRow): number => a.word.localeCompare(b.word);

/** `最常忘`：有 `lapses` 就按它降序；没有就退到"到期最早"（近似口径已在报告登记为 U-3）。 */
const forgottenScore = (row: WordbookRow, now: number): number => {
  const lapses = (row as WordbookRow & { lapses?: number }).lapses;
  if (typeof lapses === 'number') return -lapses;
  if (!row.lastReview) return -1_000;
  return row.lastReview - now;
};

export function selectRows(
  rows: readonly WordbookRow[],
  entries: ReadonlyMap<string, WordbookEntryView>,
  params: WordbookListParams,
  now = Date.now(),
): WordbookRow[] {
  const needle = params.q.trim().toLowerCase();
  const kept = rows.filter((row) => {
    const entry = entries.get(row.word.toLowerCase());
    if (params.filter !== 'all' && entry && entry.stage !== params.filter) return false;
    if (!needle) return true;
    return (
      row.word.toLowerCase().includes(needle) || (row.gloss ?? '').toLowerCase().includes(needle)
    );
  });
  const sorted = [...kept];
  if (params.sort === 'alphabetical') sorted.sort(byWord);
  else if (params.sort === 'longestIdle')
    sorted.sort((a, b) => (a.lastReview ?? Infinity) - (b.lastReview ?? Infinity));
  else if (params.sort === 'mostForgotten') sorted.sort((a, b) => forgottenScore(a, now) - forgottenScore(b, now));
  else sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return sorted;
}

/** 筛选 chips 的计数（`全部 128 · 新词 34 · 在背 79 · 已掌握 15`）。 */
export function countStages(entries: readonly WordbookEntryView[]): Record<WordbookFilter, number> {
  const counts: Record<WordbookFilter, number> = { all: entries.length, new: 0, learning: 0, mastered: 0 };
  for (const entry of entries) counts[entry.stage] += 1;
  return counts;
}

/* ───────── 取数与写操作 ───────── */

export interface WordbookData {
  signedIn: boolean;
  rows: WordbookRow[];
  entries: ReadonlyMap<string, WordbookEntryView>;
  counts: Record<WordbookFilter, number>;
  total: number;
  pending: boolean;
  failed: boolean;
  glossPending: boolean;
  retry: () => void;
}

/**
 * 整页词本数据。`glossPending` 恒 `false`：批量释义过程没落地之前不存在"补齐中"这个状态，
 * 也就不许出现任何逐词转圈（R-15⑧）。过程到位后这里改成 `query.state === 'fetching'`。
 */
export function useWordbookData(params: WordbookListParams): WordbookData {
  const signedIn = useAuthed();
  const query = trpc.wordbook.list.useQuery(undefined, {
    enabled: signedIn,
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  const getCachedGloss = React.useCallback(
    (word: string): string => {
      const hit = utils.dictionary.lookupStatic.getData({ word, direction: 'en2zh' });
      if (!hit || !('word' in hit)) return '';
      const groups = (hit as { groups?: Array<{ pos: string; meanings: string[] }> }).groups ?? [];
      const first = groups[0]?.meanings?.[0] ?? '';
      return first || (hit as { translation?: string }).translation?.split('\n')[0] || '';
    },
    [utils],
  );

  const views = React.useMemo(
    () => toEntryViews(query.data, getCachedGloss),
    [query.data, getCachedGloss],
  );
  const byWordKey = React.useMemo(
    () => new Map(views.map((entry) => [entry.word.toLowerCase(), entry])),
    [views],
  );
  const allRows = React.useMemo(() => toWordbookRows(views), [views]);

  return {
    signedIn,
    rows: selectRows(allRows, byWordKey, params),
    entries: byWordKey,
    counts: countStages(views),
    total: views.length,
    pending: signedIn && query.fetchStatus === 'fetching' && views.length === 0,
    failed: signedIn && query.isError,
    glossPending: false,
    retry: () => void query.refetch(),
  };
}

/** 星标收藏的成员判定：词本行、卡面、详情页三处共用同一份（判据⑤）。 */
export function useWordbookMembership(): {
  signedIn: boolean;
  inBook: (word: string) => boolean;
  setWanted: (word: string, wanted: boolean) => void;
} {
  const signedIn = useAuthed();
  const utils = trpc.useUtils();
  const list = trpc.wordbook.list.useQuery(undefined, { enabled: signedIn });
  const add = trpc.wordbook.add.useMutation();
  const remove = trpc.wordbook.remove.useMutation();

  const words = React.useMemo(
    () => new Set((list.data ?? []).map((entry) => entry.word.toLowerCase())),
    [list.data],
  );
  const invalidate = React.useCallback(() => {
    void utils.wordbook.list.invalidate();
    void utils.review.queue.invalidate();
    void utils.review.today.invalidate();
    void utils.checkin.status.invalidate();
  }, [utils]);

  return React.useMemo(
    () => ({
      signedIn,
      inBook: (word: string) => words.has(word.toLowerCase()),
      setWanted: (word: string, wanted: boolean) => {
        if (wanted) add.mutate({ word }, { onSuccess: invalidate });
        else remove.mutate({ word }, { onSuccess: invalidate });
      },
    }),
    [signedIn, words, add, remove, invalidate],
  );
}

/**
 * 删除 + 撤销（判据⑥）：反馈是 5 秒窗口的**撤销 toast**，不是确认弹窗（§3.6.4）。
 * 撤销 = 用同一条 `wordbook.add` 把词放回（`addedAt` 由服务端保留原值时行自动回到原序）。
 *
 * `toast` 由调用方（客户端组件）从 `useHost()` 递进来：本文件要能在脱开 React 树的情况下
 * 被纯函数用例覆盖，不在这里读宿主上下文。
 */
export type ToastFn = (message: string, options?: ToastOptions) => void;

export function useWordbookDeletion(toast: ToastFn): {
  removeRow: (word: string) => void;
  pendingWord: string | null;
} {
  const utils = trpc.useUtils();
  const add = trpc.wordbook.add.useMutation();
  const remove = trpc.wordbook.remove.useMutation();
  const [pendingWord, setPendingWord] = React.useState<string | null>(null);

  const removeRow = React.useCallback(
    (word: string) => {
      setPendingWord(word);
      remove.mutate(
        { word },
        {
          onSuccess: () => {
            setPendingWord(null);
            void utils.wordbook.list.invalidate();
            void utils.review.queue.invalidate();
            toast(WORDBOOK_COPY.swipeDelete.undoToast(word), {
              durationMs: TOAST_UNDO_MS,
              action: {
                label: VERBS.undo,
                onClick: () =>
                  add.mutate(
                    { word },
                    { onSuccess: () => void utils.wordbook.list.invalidate() },
                  ),
              },
            });
          },
          onError: () => setPendingWord(null),
        },
      );
    },
    [add, remove, toast, utils],
  );

  return { removeRow, pendingWord };
}

export const HOST_WORDBOOK_COPY = HOST_COPY;
