'use client';

/**
 * 首页搜索区（UI §3.1.2 C / §3.1.3）：slogan（`<h1>`，唯一）+ `SearchBar` + 聚焦才出现的
 * 「最近查询」面板 + 清空的二次确认。
 *
 * 极简红线（`00-user-review.md` §3.1 / PRD R-07 ②）在本文件落地的三件事：
 * ① 方向三颗按钮**不渲染** —— 默认自动判定，判错了由结果条的「换个查询方向」兜底；
 * ② 历史 chips **不常驻** —— `RecentSearchPanel` 在 `open=false` 时整棵子树不渲染（R-07 ④ / R-10 ①）；
 * ③ 空状态大灰卡**删除** —— slogan 承担视觉重心，搜索框下方不放任何占位块。
 */

import * as React from 'react';
import { ARIA, BRAND, LOOKUP_COPY, SEARCH_PLACEHOLDER, VERBS, parseRecentSearchList } from '@tm/shared';
import {
  ConfirmSheet,
  RecentSearchPanel,
  RECENT_SEARCHES_KEY,
  SearchBar,
  useHost,
  type SearchBarHandle,
  type UseRecentSearches,
} from '@tm/ui';

const PANEL_ID = 'tm-recent-panel';
/** 焦点从输入框移到面板条目时的间隙：太短会"点不到"，太长会看到面板闪一下。 */
const BLUR_GRACE_MS = 180;

export interface SearchSectionProps {
  text: string;
  onText: (value: string) => void;
  onRun: (query: string) => void;
  busy: boolean;
  recent: UseRecentSearches;
  /** I-01：已提交过查询 = 常驻上滑态（与 App `LookupScreen` 的 `queried !== ''` 同判据，⛔ 新状态机）。 */
  hasQuery: boolean;
}

export function SearchSection({ text, onText, onRun, busy, recent, hasQuery }: SearchSectionProps): React.JSX.Element {
  const barRef = React.useRef<SearchBarHandle>(null);
  const graceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const open = (): void => {
    if (graceRef.current != null) clearTimeout(graceRef.current);
    setFocused(true);
  };
  const close = (): void => {
    if (graceRef.current != null) clearTimeout(graceRef.current);
    graceRef.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
  };
  React.useEffect(() => () => {
    if (graceRef.current != null) clearTimeout(graceRef.current);
  }, []);

  const pick = (query: string): void => {
    onText(query);
    onRun(query);
    setFocused(false);
    barRef.current?.getInput()?.blur();
  };

  /**
   * §3.3「kv 读取异常 → 面板显示一行，不空白」。
   *
   * 为什么要在这里自己探一次：`RecentSearchPanel` 的实现是
   * `storageErrorHint ? <p> : hasItems ? <列表> : emptyHint`（`packages/ui/src/patterns/RecentSearchPanel.tsx:96`），
   * **只要传了这串就把整个列表吞掉**；而 `UseRecentSearches` 没有"读失败"标志位。
   * `packages/**` 不许改（§10.2 T-12 行），故宿主侧只在"列表为空且本机原始值确实读不出合法列表"时才传，
   * 两个语义都保住。已把组件缺陷登记进报告（给 T-05/T-22）。
   */
  const host = useHost();
  const storageBroken = React.useMemo(() => {
    if (recent.items.length > 0) return false;
    const raw = host.kv.get(RECENT_SEARCHES_KEY);
    if (raw == null || raw === '') return false;
    try {
      return !parseRecentSearchList(JSON.parse(raw) as unknown).success;
    } catch {
      return true;
    }
  }, [host, recent.items.length]);

  return (
    <section className="relative">
      <h1 className="text-center font-bold tracking-tight text-ink text-h1 max-md:text-h1-xs">{BRAND.slogan}</h1>
      {/* I-01（迭代工单）：与 App `LookupScreen` 同一手法 —— slogan 与搜索框之间的可折叠 spacer，
          未聚焦且无输入时撑出静态位，聚焦/已查询时高度收 0 平滑上滑。
          I-03（迭代工单）：静态位降到视口上三分之一（中心 Y ≈ 33%），单一 vh 撑不住两档视口
          （固定基线 ≈160px 与视口无关），故按 Tailwind 断点分 `md` / `max-md` 两颗高度档。
          位移只走 CSS `transition-[height]`，时长 = 既有档 `duration-move`（--dur-move），⛔ 魔法毫秒数；
          配套：`(user)/page.tsx` 列容器去掉 `justify-center`（否则居中会把位移吸收一半）。 */}
      <div
        aria-hidden="true"
        className={`w-full shrink-0 transition-[height] duration-move ease-standard ${
          focused || hasQuery ? 'h-0' : 'md:h-[23.5vh] max-md:h-[14.2vh]'
        }`}
      />
      <div className="relative mt-3 w-full scroll-mb-[calc(var(--tab-h)+24px)]">
        <SearchBar
          ref={barRef}
          id="tm-search"
          testid="home-search"
          label={ARIA.searchField}
          size="hero"
          value={text}
          onChange={onText}
          onSubmit={onRun}
          onClear={() => onText('')}
          placeholder={text === '' ? SEARCH_PLACEHOLDER : ''}
          busy={busy}
          panelOpen={focused}
          panelId={PANEL_ID}
          onFocus={open}
          onBlur={close}
          containerClassName="z-pop"
          onKeyDown={(event) => {
            if (event.key === 'Enter') setFocused(false);
          }}
        >
          <RecentSearchPanel
            id={PANEL_ID}
            testid="home-recent-panel"
            open={focused}
            items={recent.items}
            onSelect={(item) => pick(item.word)}
            onRequestClear={() => setConfirmOpen(true)}
            noGlossLabel={LOOKUP_COPY.noGloss}
            emptyHint={LOOKUP_COPY.recent.emptyOnFocus(recent.max)}
            storageErrorHint={storageBroken ? LOOKUP_COPY.readFail : undefined}
          />
        </SearchBar>
      </div>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={LOOKUP_COPY.recent.clearConfirmTitle}
        description={LOOKUP_COPY.recent.clearConfirmBody}
        confirmText={LOOKUP_COPY.recent.clear}
        cancelText={VERBS.cancel}
        tone="danger"
        onConfirm={() => {
          recent.clear();
          setConfirmOpen(false);
        }}
      />
    </section>
  );
}
