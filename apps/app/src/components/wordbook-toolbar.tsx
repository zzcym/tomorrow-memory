/**
 * 词本工具条的两件控件（T-18b；UI §3.6.3 区 C/D + §3.6.7）。
 *
 * **为什么在 App 侧新写而不是复用**：`@tm/ui/patterns` 的出口里没有 `FilterChips` / `SortMenu`
 * （§3.6 组件行把它们写作「同源新增」，T-05 未交付该两件），而 `packages/**` 对本任务是禁区
 * （§10.3）。落点因此只有两条：改 `packages/ui`（越界）或在 `apps/app/src/components/` 下自建
 * （§10.2 T-18 行明许可写清单）。本文件走后者，并已把「上收 `@tm/ui/patterns`」登记为遗留项。
 *
 * **与 Web 的唯一真源冲突**：`WORDBOOK_COPY.sortMenu` 只有 3 档（`最近加入/按字母/复习到期在前`），
 * 且没有任何筛选四档 —— UI §3.6「口径冲突以 PRD 为准（本规范锁定）」把四档排序锁成
 * `字母 / 最新加入 / 最久没碰 / 最常忘`。T-15 已按同一判定在 `apps/web/src/lib/api/wordbook.ts`
 * 的 `HOST_WORDBOOK_COPY` 里给出这批串（A-8 的宿主注入老办法）。
 * ✅ **本文件曾与该表逐字手抄一份**（键序同 `WORDBOOK_SORTS`）—— 这正是 A-43 #80（F-5）判的
 * 「两份手抄迟早漂移」缺陷。**T-03r 已把这四档筛选/排序串连同取值域一起上收 `@tm/shared`**
 * （`WORDBOOK_SORT_LABELS` / `WORDBOOK_FILTER_LABELS` / `WORDBOOK_SORTS` / `WORDBOOK_FILTERS`），
 * 两端改为 import，本文件不再自带任何四档字面量（原遗留项 L-2 就此闭合；`sortMenu` 3 档的**改串**
 * 仍按 `01-prd-fix4.md` §2 表 B 归 #80 之外的轮次，本轮不动）。
 *
 * 交互判据（§3.6.3 / §3.6.7）：
 *  - 筛选：4 个 `--r-full` 胶囊、单选、带计数（tnum）、横向可滑 + 右侧 24px 渐隐提示可滑，写进 `?filter=`；
 *  - 排序：**不做 4 个常驻按钮**（省窄屏空间），一颗 `排序：最新加入 ▾` → `role=menu` +
 *    `menuitemradio`，当前项右侧 ✔，Esc 关闭且焦点回弹到触发按钮；写进 `?sort=`；
 *  - 44px 热区（`min-h-tap`）与 `aria-pressed` / `aria-haspopup` / `aria-expanded` 同时成立。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`；`for…of` + 索引遍历。
 */

import * as React from 'react';
import {
  WORDBOOK_COPY,
  WORDBOOK_FILTER_LABELS,
  WORDBOOK_FILTERS,
  WORDBOOK_SORT_LABELS,
  WORDBOOK_SORTS,
  formatCount,
} from '@tm/shared';

/* ═════════════════ 取值域（判据 R-15 ④⑤）═════════════════
 * A-43 #80（F-5）：数组与四档串**已上收 `@tm/shared` 的 `constants/copy.ts`**，
 * 本文件只转发（`WordbookScreen` 与 `test/wordbook-screen.spec.tsx` 的 import 路径不动）。
 */

export { WORDBOOK_FILTERS, WORDBOOK_SORTS };
export type WordbookSort = (typeof WORDBOOK_SORTS)[number];
export type WordbookFilter = (typeof WORDBOOK_FILTERS)[number];

/** §3.6 锁定口径 + §3.6.1/§3.6.2/§3.6.5 的页头、行 3、空态、可访问名串。 */
export const WORDBOOK_APP_COPY = {
  sort: WORDBOOK_SORT_LABELS,
  filter: WORDBOOK_FILTER_LABELS,
  metaJoined: '加入',
  metaReviewed: (n: number): string => `复习 ${n} 次`,
  resultCount: (n: number): string => `找到 ${formatCount(n)} 词`,
  /** §3.6.2 筛后空态的出口：清完回到「全部 + 最新加入」。 */
  clearAll: '清空筛选和搜索',

  filterGroup: '筛选',
  sortHint: (label: string): string => `排序：${label}`,
  sortMenuLabel: '排序方式',
  pageTotal: (n: number): string => `共 ${formatCount(n)} 词`,
  /** §3.6.1 区 B 的 placeholder（首页那串 `查一个单词` 不通用）。 */
  searchPlaceholder: '搜单词或释义',
  /** §3.6.2 行状态色：`已掌握` 只在行 1 词头后加文字徽章（新词/在背无标记）。 */
  masteredBadge: '已掌握',
  /** §3.6.4「撤销成功 → 行回到原位 + `已恢复`」。 */
  restored: '已恢复',
  /** §3.6.5 行 6「列表拉取失败」：shared 只有 toast 串 `pullFail`，标题/副行由宿主补（同 T-15）。 */
  loadFailTitle: '没能取到你的单词本',
  loadFailBody: '再试一次，或者先回首页查词',
  /** §3.6.5 末行的可读反馈（App 侧唯一真实的"删除没落账"分支 = 本地队列写不进）。T-03r2b：串本身已上收 shared，本行只转发。 */
  deleteNotQueued: WORDBOOK_COPY.deleteNotQueued,
} as const;

export const sortLabel = (sort: WordbookSort): string => WORDBOOK_APP_COPY.sort[sort];
export const filterLabel = (filter: WordbookFilter): string => WORDBOOK_APP_COPY.filter[filter];

const isFilter = (value: string | undefined): value is WordbookFilter =>
  !!value && (WORDBOOK_FILTERS as readonly string[]).indexOf(value) >= 0;
const isSort = (value: string | undefined): value is WordbookSort =>
  !!value && (WORDBOOK_SORTS as readonly string[]).indexOf(value) >= 0;

export { isFilter, isSort };

/* ═════════════════ 区 C：筛选 chips ═════════════════ */

const CHIP =
  'inline-flex h-8 shrink-0 snap-start items-center gap-1 rounded-full px-3 text-sm ' +
  'min-h-tap touch-manipulation transition-colors duration-micro ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export interface FilterChipsProps {
  value: WordbookFilter;
  counts: Record<WordbookFilter, number>;
  onChange: (next: WordbookFilter) => void;
  testid?: string;
}

/** `全部 128 · 新词 34 · 在背 79 · 已掌握 15`（§3.6.1 区 C；单选写进 `?filter=`）。 */
export function FilterChips({
  value,
  counts,
  onChange,
  testid = 'wordbook-filters',
}: FilterChipsProps): React.JSX.Element {
  return (
    <div className="relative">
      <div
        role="group"
        aria-label={WORDBOOK_APP_COPY.filterGroup}
        data-testid={testid}
        className="flex snap-x gap-2 overflow-x-auto pb-1"
      >
        {WORDBOOK_FILTERS.map((key) => {
          const on = key === value;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              data-filter={key}
              onClick={() => onChange(key)}
              className={`${CHIP} ${on ? 'bg-brand text-on-brand' : 'bg-sunken text-ink hover:text-ink'}`}
            >
              {filterLabel(key)}
              <span className="tnum opacity-70">{counts[key]}</span>
            </button>
          );
        })}
      </div>
      {/* §3.6.3 行 2：右侧 24px 渐隐 = "还能往右滑"的唯一视觉提示（不占热区、不可点）。 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-bg to-transparent"
      />
    </div>
  );
}

/* ═════════════════ 区 D：排序菜单 ═════════════════ */

export interface SortMenuProps {
  value: WordbookSort;
  onChange: (next: WordbookSort) => void;
  testid?: string;
}

/** `排序：最新加入 ▾` → 4 项 `role=menu`，当前项 ✔，Esc 关闭 + 焦点回弹（§3.6.3 行 3 / §3.6.7）。 */
export function SortMenu({
  value,
  onChange,
  testid = 'wordbook-sort',
}: SortMenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement | null>(null);
  const first = React.useRef<HTMLButtonElement | null>(null);
  /* Web 那页（T-15）的这份菜单在**首次挂载**（open=false）就 `focus()` 触发钮——
     本页是 App 首屏 tab，挂载即抢焦点会让键盘/读屏用户一进来就落在排序钮上。
     用 opened 哨兵把「挂载」与「刚关过」分开：只有真正展开过再收起才回收焦点。
     （T-15 那页的同名缺陷不在我的边界内，登记在报告 §5。） */
  const opened = React.useRef(false);

  React.useEffect(() => {
    if (open) {
      opened.current = true;
      first.current?.focus();
    } else if (opened.current) {
      button.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const pick = (next: WordbookSort): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative" data-testid={testid}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={WORDBOOK_APP_COPY.sortHint(sortLabel(value))}
        data-testid="wordbook-sort-button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        {WORDBOOK_APP_COPY.sortHint(sortLabel(value))}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={WORDBOOK_APP_COPY.sortMenuLabel}
          data-testid="wordbook-sort-menu"
          className="absolute right-0 z-pop mt-1 w-44 rounded-lg border border-hair bg-surface p-1 shadow-elev-2"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          {WORDBOOK_SORTS.map((key) => (
            <button
              key={key}
              ref={key === WORDBOOK_SORTS[0] ? first : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={key === value}
              data-sort={key}
              onClick={() => pick(key)}
              className="flex min-h-tap w-full items-center justify-between gap-2 rounded-md px-3 text-sm text-ink hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              {sortLabel(key)}
              {key === value ? <span aria-hidden="true">✔</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
