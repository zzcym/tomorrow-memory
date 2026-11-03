/**
 * App 学习情况页（`/progress`，tab4）—— T-18c（UI §3.7.1–§3.7.6；PRD R-19①③④⑤、R-13⑥、R-18⑤）。
 *
 * 这是旧 App 里**不存在**的新页（架构 §5.3 表末行：`page-me` 的统计 + 内嵌热力图 → 拆成本页，
 * 组件复用 `@tm/ui/patterns/{StatCard,GrowthLine,Heatmap}`）。本页存在的四件事：
 *  1. **B 三张大数字卡**，顺序锁死 `本周新增 / 今日待复习 / 连续天数`（R-19① 原文顺序，
 *     §3.7.1 明令"不得按好看重排"），三列等宽 `grid-cols-3 gap-3`，整卡一个 `<button>`；
 *  2. **C 增长曲线** `GrowthLine`（近 30 天累计掌握词数，高 160px = App 档）；
 *  3. **D 热力图** `Heatmap`：**三模式（每日/每周/累计）切换 + 点选信息条**是 R-19① 与
 *     PRD §8.3-B-9/10 的硬判据，两样都真在跑（`mode`/`picked` 是本页状态，`onModeChange`/
 *     `onSelect` 接线；禁静态图）；空态 / 数据不足态 / 加载态 / 错误态在 D 区各一条分支；
 *  4. **A 顶栏**：标题 `学习情况`（`NAV_ITEMS` 的 title，与 tab 栏同一份串）+ 右侧唯一非卡片
 *     交互「刷新」（图标 20px + `sr-only`「刷新学习情况」，`aria-busy` 期间图标转圈）。
 *
 * 判据③「三处数字同源」的红线（R-13⑥）在本页落成三条查询键：
 *  - `今日待复习` = `['review','due-count']`（与 tab 红点 / 首页胶囊同一个 `dueCountQueryOptions`）；
 *  - `连续天数` = `['checkin','status']` 的 `streak`（与完成页 / 「我的」同一份查询），
 *    `profile.get` 的 `streak` 只在打卡查询失败时兜底；
 *  - **前端不自算连续天数**：全页不 import、也不调用 `@tm/shared` 的 `computeStreak` /
 *    `computeStreakFromDates` / `currentStreak`；`test/progress-screen.spec.tsx` 有源码级哨兵盯这条。
 *    页面里唯一的"算"是把接口给的逐日数字按日期区间相加（`progress-data.sumFrom`），与连胜无关。
 *
 * 判据⑤「**不重置任何存量 `daily_goal`**」：本页**零 mutation** —— 没有 `profile.update`、
 * 没有 `useMutation`、没有对 `daily_goal`/`dailyGoal` 的任何读写（哨兵用例盯这三处 0 命中）。
 * 目标值只在「我的」页改（R-19② 归 T-19）。
 *
 * 分层：零 fetch（架构 §5.2），数据只经 `data/queries/{analyst,profile,checkin,review}.js`；
 * 投影口径只在 `components/progress-data.js` 一份（B/C/D 三区共用同一结果 = 判据③）；
 * §3.7.2 表末行"页内不得出现 `fetch(`"由哨兵用例机检。
 *
 * Chrome84 红线（架构 §5.1 / `vite.config.ts` 的 `tm-app:dist-guard`）：不用
 * `structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`；
 * 曲线与格阵的 SVG 全在 `@tm/ui` 组件内部（纯 `path`/`line` + CSS 变量着色），本页只添一个
 * 手绘 `RefreshCw` 折线图标。颜色一律 token（`bg-bg` / `text-ink` / `border-hair` /
 * `bg-warning-soft`），**0 处字面色值** —— 深色由 `tokens.css` 的 `.dark` 块整体换值（§1.2.1）。
 */

import * as React from 'react';
import { ARIA, HEATMAP_LEGEND, NAV_ITEMS, PROGRESS_COPY, VERBS } from '@tm/shared';
import {
  EmptyState,
  GrowthLine,
  Heatmap,
  StatCard,
  useHost,
  type HeatmapMode,
} from '@tm/ui';
import { useQuery } from '@tanstack/react-query';
import { analysisReportQueryOptions } from '../data/queries/analyst.js';
import { checkinStatusQueryOptions } from '../data/queries/checkin.js';
import { dueCountQueryOptions } from '../data/queries/review.js';
import { profileQueryOptions } from '../data/queries/profile.js';
import {
  ANALYST_PERIOD,
  HEATMAP_WEEKS,
  SPARSE_DAYS,
  cellsFromGrowth,
  cellsFromReviewDates,
  curvePointsOf,
  curveSummaryOf,
  growthPointsOf,
  heatAriaLabelOf,
  isEmptyBoard,
  isFirstLoad,
  legendRangesOf,
  positiveDays,
  preferCells,
  profileProgressOf,
  todayKeyOf,
  weekAdded,
} from '../components/progress-data.js';

/* ═════════════════ 串与常量（都指回真源，不新写中文） ═════════════════ */

/** 顶栏标题 = tab 栏同一份 `NAV_ITEMS[].title`（R-18⑤ 逐 tab 截图口径），不另写字面量。 */
const PAGE_TITLE = NAV_ITEMS.find((item) => item.hash === '#/progress')?.title ?? '';

/** 三张卡的跳转（§3.7.1 末段）：单词本「新词」筛选、背词队列、热力图滚到今天那一列。 */
const WORDBOOK_NEW_HREF = '/wordbook?filter=new';
const STUDY_HREF = '/study';

/** C/D 两区的 `aria-labelledby` 锚点（§3.7.6「各自 `<section aria-labelledby>`」）。 */
const CURVE_TITLE_ID = 'tm-progress-curve-title';
const HEAT_TITLE_ID = 'tm-progress-heat-title';

/** `Heatmap` 的横向滚动容器类名（组件默认值；本页只找它一下、把视图滚到今天那一列）。 */
const HEAT_SCROLL_SELECTOR = '.heatmap-scroll';

/**
 * §3.7.1 轻学情列宽：列外用 §2.2 的 `--max-w-read`，**列内再限 560px**。
 * 560 在 preset 里没有 token（`maxWidth` 只有 `auth`/`read`/`list`）⇒ 这里用**上限**型任意值，
 * 它只会缩窄、不可能造成横向溢出（判据④）；缺口已写进报告的 token 清单。
 */
const LIGHT_COLUMN = 'mx-auto w-full max-w-[560px]';

interface PickedCell {
  key: string;
  count: number;
  label: string;
}

/* ═════════════════ 离线横幅（§3.7.4 末行，App 独有） ═════════════════ */

/**
 * 只读 `navigator.onLine` + 两个事件，不发探活请求（`file://` 下探活会假阴）。
 * 文案是 `PROGRESS_COPY.offline` 逐字串，**不含**"未接入/云端/本地"（R-25① 禁词清单）。
 */
function useOffline(): boolean {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return !online;
}

/* ═════════════════ 页面 ═════════════════ */

export function ProgressScreen(): React.JSX.Element {
  const host = useHost();
  const offline = useOffline();

  /** 今天只取一次：跨零点不重画格阵（重画会让滚动位置跳走），下次进页自然更新。 */
  const today = React.useMemo(() => todayKeyOf(), []);

  const [mode, setMode] = React.useState<HeatmapMode>('daily');
  const [picked, setPicked] = React.useState<PickedCell | null>(null);
  /** 只有**手动刷新**之后那一次播报（§3.7.6「轮询静默」）。 */
  const [announce, setAnnounce] = React.useState(false);

  /* §3.7.4「自动 1 次静默重试后仍失败才显示」（R-24⑥）⇒ 四条查询统一 `retry: 1`。 */
  const report = useQuery({ ...analysisReportQueryOptions(ANALYST_PERIOD), retry: 1 });
  const profile = useQuery({ ...profileQueryOptions(), retry: 1 });
  const checkin = useQuery({ ...checkinStatusQueryOptions(), retry: 1 });
  const due = useQuery({ ...dueCountQueryOptions(), retry: 1 });

  /* ── 投影：一次 `GET /api/analyst` 喂三处（B/C/D 共用同一份 cells，判据③） ── */
  const profileView = React.useMemo(() => profileProgressOf(profile.data), [profile.data]);
  const growth = React.useMemo(() => growthPointsOf(report.data), [report.data]);
  const cells = React.useMemo(
    () => preferCells(cellsFromGrowth(growth), cellsFromReviewDates(profileView.reviewDates)),
    [growth, profileView.reviewDates],
  );
  const curve = React.useMemo(() => curvePointsOf(growth), [growth]);

  const week = React.useMemo(() => weekAdded(cells, today), [cells, today]);
  const activeDays = positiveDays(cells);
  const empty = isEmptyBoard(cells, profileView.totalWords);
  const sparse = !empty && activeDays < SPARSE_DAYS;

  /* 连续天数：`checkin.status` 优先（与红点/胶囊/「我的」同源），失败才退 `profile.get.streak`。 */
  const streak = checkin.data ? checkin.data.streak : profileView.streak;

  const firstLoad = isFirstLoad([
    report.isPending,
    profile.isPending,
    checkin.isPending,
    due.isPending,
  ]);
  /** 热力图的两个数据源**都**没到过才算 D 区失败（主源挂了还有兜底源 ⇒ 不降级）。 */
  const heatFailed = report.isError && profile.isError;
  const refreshing =
    report.isFetching || profile.isFetching || checkin.isFetching || due.isFetching;

  React.useEffect(() => {
    if (announce && !refreshing) setAnnounce(false);
  }, [announce, refreshing]);

  const heatRootRef = React.useRef<HTMLDivElement>(null);

  const open = React.useCallback(
    (href: string): void => {
      host.navigate(href);
    },
    [host],
  );

  const changeMode = React.useCallback((next: HeatmapMode): void => {
    setMode(next);
    /* 换档后上一次点选的数值口径变了（单日 → 整周 → 累计），信息条不能留着念旧值。 */
    setPicked(null);
  }, []);

  /** `连续天数` 卡：滚到热力图、并把格阵滚到今天那一列（§3.7.1 末段第三条）。 */
  const revealToday = React.useCallback((): void => {
    const root = heatRootRef.current;
    if (!root) return;
    root.scrollIntoView({ block: 'start' });
    const scroller = root.querySelector<HTMLElement>(HEAT_SCROLL_SELECTOR);
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, []);

  const refresh = React.useCallback((): void => {
    setAnnounce(true);
    void report.refetch();
    void profile.refetch();
    void checkin.refetch();
    void due.refetch();
  }, [checkin, due, profile, report]);

  const reloadHeat = React.useCallback((): void => {
    setAnnounce(true);
    void report.refetch();
    void profile.refetch();
  }, [profile, report]);

  const ariaLive = announce ? 'polite' : 'off';
  const legend = {
    left: HEATMAP_LEGEND.left,
    right: HEATMAP_LEGEND.right,
    ranges: legendRangesOf(mode, cells),
  };

  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg text-ink" data-testid="progress-screen">
      {/* §3.7.4 末行：离线只压一条细横幅，不改页面结构；下拉/点刷新即重试。 */}
      {offline ? (
        <p
          role="status"
          className="animate-fade-in bg-warning-soft px-4 py-2 text-xs text-ink"
          data-testid="progress-offline-banner"
        >
          {PROGRESS_COPY.offline}
        </p>
      ) : null}

      {/* ══ A 顶栏（§3.7.1 行 A）：标题 + 唯一非卡片交互「刷新」══ */}
      <header
        className="sticky top-0 z-sticky flex h-topbar shrink-0 items-center justify-between border-b border-hair bg-bg/95 px-4 backdrop-blur"
        data-testid="progress-topbar"
      >
        <h1 className="text-h2 font-bold text-ink max-md:text-h2-xs" data-testid="progress-title">
          {PAGE_TITLE}
        </h1>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-busy={refreshing}
          className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-lg p-2 text-ink-muted transition-colors duration-micro ease-standard hover:bg-sunken active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:opacity-60"
          data-testid="progress-refresh"
        >
          <RefreshIcon spinning={refreshing} />
          <span className="sr-only">{PROGRESS_COPY.refreshLabel}</span>
        </button>
      </header>

      {/* 底部留白（§3.7.1 行 E）由 `shell/TabBarShell` 的 `<main>` 上的 §2.4 `pb-safe-bottom` 承担，
          本页不重复占位（T-17 判据①同口径：页内不许出现死高度占位）。 */}
      <div className={`w-full ${LIGHT_COLUMN} px-4`}>
        {/* ══ B 三张大数字卡（§3.7.1 行 B + §3.7.6 语义：list / listitem / 卡内真 button）══ */}
        <div className="grid grid-cols-3 gap-3" role="list" data-testid="progress-cards">
          <StatCardListItem
            label={PROGRESS_COPY.cards.weekAdded}
            value={week}
            loading={firstLoad}
            tone="brand"
            ariaLive={ariaLive}
            onClick={() => open(WORDBOOK_NEW_HREF)}
            testid="progress-card-week"
          />
          <StatCardListItem
            label={PROGRESS_COPY.cards.todayDue}
            value={due.data ?? 0}
            loading={firstLoad || due.isPending}
            tone="warning"
            ariaLive={ariaLive}
            onClick={() => open(STUDY_HREF)}
            testid="progress-card-due"
          />
          <StatCardListItem
            label={PROGRESS_COPY.cards.streak}
            value={streak ?? 0}
            loading={firstLoad || (checkin.isPending && profileView.streak === null)}
            ariaLive={ariaLive}
            onClick={revealToday}
            testid="progress-card-streak"
          />
        </div>

        {/* ══ C 增长曲线（§3.7.1 行 C）：空态 → 曲线；"不足 3 天"由组件自己的文本分支接住 ══ */}
        <section aria-labelledby={CURVE_TITLE_ID} className="mt-4" data-testid="progress-curve-region">
          <h2 id={CURVE_TITLE_ID} className="text-h3 font-bold text-ink">
            {PROGRESS_COPY.curve.title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">{PROGRESS_COPY.curve.subtitle}</p>
          {empty && !firstLoad ? (
            <div className="mt-2" data-testid="progress-curve-empty">
              <EmptyState
                size="sm"
                title={PROGRESS_COPY.emptyTitle}
                hint={PROGRESS_COPY.emptyBody}
                primary={{ label: VERBS.goStudy, onClick: () => open(STUDY_HREF) }}
                testid="progress-curve-empty"
              />
            </div>
          ) : (
            <div className="mt-2" data-testid="progress-curve">
              <GrowthLine
                data={curve}
                loading={firstLoad || report.isPending}
                error={report.isError}
                onRetry={refresh}
                retryLabel={PROGRESS_COPY.fail.retry}
                accessibleSummary={curveSummaryOf(growth)}
                heightPx={160}
                animate={false}
                testid="progress-curve-chart"
              />
            </div>
          )}
        </section>

        {/* ══ D 热力图卡（§3.7.1 行 D）：四态一态一条分支，正常态与数据不足态才画格阵 ══ */}
        <section
          aria-labelledby={HEAT_TITLE_ID}
          className="mt-4"
          data-testid="progress-heat-region"
        >
          <h2 id={HEAT_TITLE_ID} className="sr-only">
            {PROGRESS_COPY.heatSectionTitle}
          </h2>
          {heatFailed ? (
            /* §3.7.4「局部：热力图失败但卡片成功」⇒ 只 D 区降级，B/C 不动；重试用**文字按钮**。 */
            <div
              className="rounded-xl border border-hair bg-surface p-4"
              data-testid="progress-heat-error"
            >
              <EmptyState
                size="sm"
                title={PROGRESS_COPY.heatmapUnavailable}
                hint={PROGRESS_COPY.heatDegradedBody}
                link={{ label: PROGRESS_COPY.heatReloadLabel, onClick: reloadHeat }}
                testid="progress-heat-error"
              />
            </div>
          ) : empty && !firstLoad ? (
            <div
              className="rounded-xl border border-hair bg-surface p-4"
              data-testid="progress-heat-empty"
            >
              <EmptyState
                size="sm"
                title={PROGRESS_COPY.emptyTitle}
                hint={PROGRESS_COPY.emptyBody}
                primary={{ label: VERBS.goStudy, onClick: () => open(STUDY_HREF) }}
                testid="progress-heat-empty"
              />
            </div>
          ) : (
            /* 命中区补丁：组件内部把 tab 给到 `min-h-8`(32px)，§3.7.6 要 `min-h-[44px]` ⇒
               宿主侧只补**热区高度**，不改组件的样式语义（覆写禁令见 §10.2 T-18 行）。 */
            <div className="[&_button]:min-h-tap" data-testid="progress-heat-card">
              <Heatmap
                ref={heatRootRef}
                days={cells}
                today={today}
                mode={mode}
                onModeChange={firstLoad ? undefined : changeMode}
                weeks={HEATMAP_WEEKS}
                selectedKey={picked ? picked.key : null}
                onSelect={setPicked}
                tip={picked ? picked.label : null}
                legend={legend}
                ariaLabel={heatAriaLabelOf(profileView.reviewDays)}
                onBrowseToggle={() => undefined} /* T-18c-r3：§3.7.6 键盘锚点钮要求此 prop 在场（缺则「浏览热力图」不渲染），表格开合由组件内部状态驱动 */
                browseLabel={ARIA.browseHeatmap}
                loading={firstLoad || report.isPending}
                testid="progress-heatmap"
              />
              {/* 数据不足态：格阵照画（形状 = 真实形状），只在卡下补一句（§3.7.4 同行口径）。 */}
              {sparse ? (
                <p className="mt-1 text-xs text-ink-muted" data-testid="progress-heat-sparse">
                  {PROGRESS_COPY.heatSparse(activeDays)}
                </p>
              ) : null}
              {firstLoad ? (
                <p className="mt-1 text-xs text-ink-muted" data-testid="progress-skeleton-note">
                  {PROGRESS_COPY.loading}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ═════════════════ 局部件 ═════════════════ */

/**
 * B 区一格：`role="listitem"` 包 `StatCard`（组件在有 `onClick` 时整卡渲染成一个真 `<button>`）。
 * 该语义必须挂在直接子层，而 `StatCard` 不接受 `role`（`packages/ui` 对本任务是只读区），
 * 故由宿主补这一层外壳 —— 只加分隔语义与最小高（§3.7.1 `84px`），不覆写组件的样式与行为。
 */
function StatCardListItem({
  label,
  value,
  loading,
  tone,
  ariaLive,
  onClick,
  testid,
}: {
  label: string;
  value: number;
  loading: boolean;
  tone?: 'default' | 'brand' | 'warning';
  ariaLive: 'polite' | 'off';
  onClick: () => void;
  testid: string;
}): React.JSX.Element {
  return (
    <div role="listitem" className="min-h-[84px]" data-testid={`${testid}-item`}>
      <StatCard
        label={label}
        value={value}
        loading={loading}
        tone={tone}
        ariaLive={ariaLive}
        onClick={onClick}
        testid={testid}
      />
    </div>
  );
}

/** `RefreshCw`（lucide 同形，视觉 20px）：两条 `path`，不用 SVG2 特性（Chrome84 红线）。 */
function RefreshIcon({ spinning }: { spinning: boolean }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        spinning
          ? 'animate-spin motion-reduce:animate-none'
          : 'transition-transform duration-micro ease-standard'
      }
      style={{ height: 20, width: 20 }}
    >
      <path d="M21 12a9 9 0 1 1-3.2-6.9" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default ProgressScreen;
