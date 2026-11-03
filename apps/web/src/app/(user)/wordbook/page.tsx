'use client';

/**
 * 单词本一级页 `/wordbook`（§10.2 T-15 行 🆕`app/(user)/wordbook/page.tsx` / UI §3.6）。
 *
 * 判据④ 的五件事全在这页接线：搜索 + 4 档排序 + 4 档筛选 + 行内首义与喇叭 + 删除撤销。
 * 三条纪律：
 * 1. **本地过滤、不发请求**（R-15③）：取数只有 `useWordbookData` 的那一次 `wordbook.list`，
 *    搜索/筛选/排序全在 `lib/api/wordbook.ts` 的纯函数里算（那三个函数可脱开浏览器单测）。
 * 2. `?q=&filter=&sort=` 三个参数可分享、可回退（§3.6.3 末行）：URL 是唯一真源，
 *    输入框用本地 state 承接键入（≤300ms 出结果），落 URL 走 `router.replace` 去抖。
 * 3. 删除反馈 = **撤销 toast**，不是确认弹窗（§3.6.4 / R-15⑥），所以这里没有 `ConfirmSheet`；
 *    左滑与显式删除按钮都由 `@tm/ui/patterns/WordbookList` 同一份承担（手势不是唯一出口）。
 *
 * 页头/工具条/列表/空态的中文一律 import 自 `@tm/shared`（`WORDBOOK_COPY`、`ARIA`、`VERBS`）
 * 与 `HOST_WORDBOOK_COPY`（shared 缺常量清单里已登记的宿主注入串）。
 * 判据⑦：本页不出现任何"云端/本地/已同步"式内部术语徽章。
 */

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ARIA, VERBS, WORDBOOK_COPY } from '@tm/shared';
import type { WordbookRow } from '@tm/ui';
import { EmptyState, SearchBar, SkeletonBlock, WordbookList, useHost } from '@tm/ui';
import { AuthGate } from '@/components/auth-gate';
import { requestLogin } from '@/lib/auth';
import { wordHref } from '@/lib/api/review';
import {
  HOST_WORDBOOK_COPY as COPY,
  WORDBOOK_FILTERS,
  WORDBOOK_SORTS,
  filterLabel,
  parseListParams,
  serializeListParams,
  sortLabel,
  useWordbookData,
  useWordbookDeletion,
  useWordbookMembership,
  type WordbookFilter,
  type WordbookSort,
} from '@/lib/api/wordbook';

const CHIP =
  'inline-flex h-8 shrink-0 snap-start items-center gap-1 rounded-full px-3 text-sm ' +
  'min-h-tap touch-manipulation transition-colors duration-micro ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

/** C 区：4 个带计数的胶囊（`全部 128 · 新词 34 · 在背 79 · 已掌握 15`），单选写 `?filter=`。 */
function FilterChips({
  value,
  counts,
  onChange,
}: {
  value: WordbookFilter;
  counts: Record<WordbookFilter, number>;
  onChange: (next: WordbookFilter) => void;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={COPY.filterGroup}
      data-testid="wordbook-filters"
      className="flex snap-x gap-2 overflow-x-auto pb-1"
    >
      {WORDBOOK_FILTERS.map((key) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={`${CHIP} ${on ? 'bg-brand text-on-brand' : 'bg-sunken text-ink hover:text-ink'}`}
          >
            {filterLabel(key)}
            <span className="tnum opacity-70">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** D 区：`排序：最新加入 ▾` → `role=menu` 四项（44px 热区、当前项 ✔、Esc 关闭并焦点回弹）。 */
function SortMenu({ value, onChange }: { value: WordbookSort; onChange: (next: WordbookSort) => void }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  const first = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) first.current?.focus();
    else button.current?.focus({ preventScroll: true });
  }, [open]);

  const pick = (next: WordbookSort): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={COPY.sortHint(sortLabel(value))}
        data-testid="wordbook-sort-button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-tap items-center gap-1 rounded-md px-2 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        {COPY.sortHint(sortLabel(value))}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={COPY.sortMenuLabel}
          data-testid="wordbook-sort-menu"
          className="absolute right-0 z-pop mt-1 w-44 rounded-lg border border-hair bg-surface p-1 shadow-elev-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          {WORDBOOK_SORTS.map((key) => (
            <button
              key={key}
              ref={key === WORDBOOK_SORTS[0] ? first : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={key === value}
              onClick={() => pick(key)}
              className="flex min-h-tap w-full items-center justify-between gap-2 rounded-md px-3 text-sm text-ink hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-focus"
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

/**
 * §3.6.5 行 3「未登录访问」的页内引导卡（T-27 / A-48 #113 定稿：恰两颗动作 —— 主按钮 + 文字链，
 * 第三颗「回首页」不在表内）。**原样收编**：从 `WordbookInner` 的 `!data.signedIn` 分支抽出成组件，
 * 既作 `<AuthGate wall={…}>` 的游客态落点（T-28），也留作已登录但数据层判未登录的兜底 —— 一字未改。
 */
function WordbookSignedOutGuide(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-read flex-col gap-4 py-2">
      <EmptyState
        size="lg"
        title={WORDBOOK_COPY.emptySignedOut.title}
        hint={WORDBOOK_COPY.emptySignedOut.subtitle}
        primary={{
          label: WORDBOOK_COPY.emptySignedOut.cta,
          onClick: () => requestLogin({ mode: 'sign-in', returnTo: '/wordbook' }),
        }}
        link={{
          label: WORDBOOK_COPY.emptySignedOut.link,
          onClick: () => requestLogin({ mode: 'register', returnTo: '/wordbook' }),
        }}
        testid="wordbook-signed-out"
      />
    </div>
  );
}

function WordbookInner(): React.JSX.Element {
  const host = useHost();
  const router = useRouter();
  const url = useSearchParams();
  const synced = parseListParams(new URLSearchParams(url.toString()));
  /** 键入先落本地 state（本地过滤 0 请求），再带去抖地写回 URL。 */
  const [q, setQ] = React.useState(synced.q);
  React.useEffect(() => setQ(synced.q), [url.get('q')]);

  const params = { q, filter: synced.filter, sort: synced.sort };
  const data = useWordbookData(params);
  const { inBook, setWanted } = useWordbookMembership();
  const { removeRow } = useWordbookDeletion(host.toast);

  const writeUrl = React.useCallback(
    (next: typeof params) => router.replace(serializeListParams(next)),
    [router],
  );
  const setFilter = (next: WordbookFilter): void => writeUrl({ ...params, filter: next });
  const setSort = (next: WordbookSort): void => writeUrl({ ...params, sort: next });
  const clearAll = (): void => {
    setQ('');
    writeUrl({ q: '', filter: 'all', sort: 'recent' });
  };

  if (!data.signedIn) {
    // 兜底：token 在（`AuthGate` 已放行）但数据层判未登录 ⇒ 仍给同一张引导卡（§3.6.5 行 3 的定稿措辞）。
    return <WordbookSignedOutGuide />;
  }

  if (data.failed) {
    return (
      <div className="mx-auto flex w-full max-w-read flex-col gap-4 py-2">
        <EmptyState
          size="lg"
          title={COPY.loadFailTitle}
          hint={COPY.loadFailBody}
          primary={{ label: VERBS.retry, onClick: data.retry }}
          secondary={{ label: VERBS.goLookup, onClick: () => host.navigate('/') }}
          testid="wordbook-load-fail"
        />
      </div>
    );
  }

  const filtering = Boolean(q.trim()) || params.filter !== 'all';
  const empty = data.pending ? (
    <SkeletonBlock variant="list-rows" label={undefined} />
  ) : data.total === 0 ? (
    <EmptyState
      size="lg"
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
  );

  return (
    <div className="mx-auto flex w-full max-w-read flex-col gap-3 pb-24">
      <header className="flex min-h-tap items-baseline gap-2 px-1">
        <h1 className="text-h1 max-md:text-h1-xs font-bold text-ink">{COPY.pageHeading}</h1>
        <span className="tnum text-sm text-ink-muted">{COPY.pageTotal(data.total)}</span>
      </header>

      {/* B/C/D 合并为吸顶工具条（§3.6.1）：页头随滚动消失，这三行保持可见。 */}
      <div className="sticky top-0 z-sticky flex flex-col gap-3 bg-bg/92 py-2 backdrop-blur">
        <SearchBar
          size="list"
          label={ARIA.searchField}
          placeholder={q ? '' : COPY.searchPlaceholder}
          value={q}
          onChange={setQ}
          onSubmit={(value) => writeUrl({ ...params, q: value })}
          onClear={() => {
            setQ('');
            writeUrl({ ...params, q: '' });
          }}
          testid="wordbook-search"
        />
        <FilterChips value={params.filter} counts={data.counts} onChange={setFilter} />
        <div className="flex items-center justify-between gap-2">
          <p role="status" aria-live="polite" data-testid="wordbook-result-count" className="text-sm text-ink-muted">
            {filtering ? COPY.resultCount(data.rows.length) : ''}
          </p>
          <SortMenu value={params.sort} onChange={setSort} />
        </div>
        {data.glossPending ? <p className="text-xs text-ink-muted">{COPY.fillingGlosses}</p> : null}
      </div>

      <WordbookList
        variant="page"
        items={data.rows}
        loading={data.pending}
        hrefFor={(word) => wordHref(word, 'wordbook')}
        onSpeak={(word) => host.speak(word, 'us')}
        speakLabel={ARIA.speak}
        rowAriaLabel={ARIA.wordbookRow}
        onDelete={(row: WordbookRow) => removeRow(row.word)}
        deleteAriaLabel={ARIA.removeFromWordbook}
        onToggleFavorite={(row: WordbookRow) => {
          const next = !inBook(row.word);
          setWanted(row.word, next);
        }}
        favoritedLabel={VERBS.favorited}
        glossFallback={WORDBOOK_COPY.noGloss}
        metaPending={data.glossPending}
        empty={empty}
        testid="wordbook-list"
      />
    </div>
  );
}

export default function WordbookPage(): React.JSX.Element {
  // T-28 / R-23②：主体套 `<AuthGate>`。本页例外 —— §3.6.5 行 3 给它的是**页内引导卡**而非通用墙，
  // 故把 `WORDBOOK_COPY.emptySignedOut` 那套（T-27 收口的"恰两颗动作"）原样传进 `wall`，不换成 `LoginWall`。
  return (
    <AuthGate wall={<WordbookSignedOutGuide />}>
      {/* Next 15：`useSearchParams()` 要求页面自带 Suspense 边界（`(user)/layout.tsx` 归 T-12，不动它）。 */}
      <React.Suspense fallback={null}><WordbookInner /></React.Suspense>
    </AuthGate>
  );
}
