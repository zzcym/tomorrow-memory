/**
 * T-18c 判据自证（App 轻学情页 `#/progress`）—— `apps/app/test/progress-screen.spec.tsx`。
 *
 * 覆盖 §10.2 T-18 判据①（三张大数字卡 + 增长曲线 + 热力图三模式与点选信息条）与判据⑤
 * （学习情况页**不重置任何存量 `daily_goal`** —— 用「全交互后 0 写请求 + localStorage 快照不变」
 * + 源码哨兵三段证明），外加 UI §3.7.1/3.7.2/3.7.3/3.7.4（六态逐条）/3.7.6（无障碍）与 §6.6 禁词。
 * 编号 `P-01…P-26` 与交付记录 T-18-c §2 的判据对账表一一对应（原件已移出仓库）。
 *
 * 夹具三条既有坑（`wordbook-screen.spec.tsx` 文件头实测结论，原样继承）：
 *  1. **必须 `startRouter()`**：`navigate()` 只写 `location.hash`，快照靠 `hashchange` 回来；
 *  2. **等真宏任务**：react-query 的观察者通知走 `NotifyManager` 的 `setTimeout`，
 *     `settle()` 每轮 `await act(setTimeout 12ms)`；带 `retry: 1` 的失败分支再 `advance(RETRY_MS)`
 *     越过 react-query 的首次重试退避（~1s，给足 1500ms）；
 *  3. 只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），页内零 fetch 由 P-24 源码哨兵机检。
 *
 * jsdom 无排版引擎 ⇒ 「连续天数 → 热力图滚到今天」用两个可判真假的替代量：
 * `scrollIntoView` 多态桩（断被滚元素是热力图根）+ 在 `.heatmap-scroll` 实例上临时定义
 * `scrollLeft` setter（断实现确实写了 `scrollWidth`），用 `try/finally` 还原。
 *
 * 已知实现缺口（**不是本文件放松断言的理由**，逐条登记报告）：§3.7.6 的「浏览热力图」键盘锚点
 * 需要 `Heatmap.onBrowseToggle` 才渲染钮，屏内漏传 ⇒ P-13 按「补传该 1 行后」的形态断言存在。
 *
 * T-26b 追加两条（判据⑤ 的 P-24/P-25 四条正则与 P-25 的三段断言**一字未松**，只把 P-24 的
 * 文件清单扩到本轮改了取数的那个数据层模块）：P-27 钉"`period:'all'` → 客户端裁 365 天"的投影口径，
 * P-28 钉出网 URL 只带 `period=`、不再出现服务端不认的 `days=`。
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ARIA,
  HEATMAP_LEGEND,
  PROGRESS_COPY,
  VERBS,
  getDateStr,
} from '@tm/shared';
import ProgressScreen from '../src/screens/ProgressScreen.js';
import {
  todayKeyOf,
  weekStartKey,
} from '../src/components/progress-data.js';
import {
  ROUTES,
  navigate,
  resetRouterForTest,
  startRouter,
} from '../src/router.js';
import type { UiHost } from '@tm/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** react-query `retry: 1` 的首次退避（~1000ms）+ 余量。 */
const RETRY_MS = 1500;

/* ═════════════════ 日期夹具（全部相对"今天"，跨天跑不脆） ═════════════════ */

const TODAY = todayKeyOf();
const dminus = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getDateStr(d);
};

/** 近 30 天曲线 4 点（累计 70→96，最近一天新增 4）；`-8`/`-20` 必在本周之外。 */
const HAPPY_POINTS = [
  { date: dminus(20), newWords: 3, total: 70 },
  { date: dminus(8), newWords: 6, total: 80 },
  { date: dminus(1), newWords: 2, total: 92 },
  { date: TODAY, newWords: 4, total: 96 },
];
/** 恰好 3 个有记录日（≥3 画曲线、<7 触发热力图"数据不足"一句）。 */
const SPARSE_POINTS = [
  { date: dminus(2), newWords: 1, total: 6 },
  { date: dminus(1), newWords: 2, total: 8 },
  { date: TODAY, newWords: 3, total: 11 },
];
/** 2 点：曲线不画（§3.7.4「数据不足(<3 天)」走文本分支）。 */
const TWO_POINTS = [
  { date: dminus(1), newWords: 2, total: 5 },
  { date: TODAY, newWords: 3, total: 8 },
];

/** 「本周新增」独立重算（周一起，与屏同一锚但不走同一函数体）。 */
function weekSum(points: ReadonlyArray<{ date: string; newWords: number }>): number {
  const monday = weekStartKey(TODAY);
  let sum = 0;
  for (const p of points) if (p.date >= monday) sum += p.newWords;
  return sum;
}

/* ═════════════════ 测试台 ═════════════════ */

interface FetchCall {
  url: string;
  method: string;
}

let fetchCalls: FetchCall[] = [];
let failAnalyst = false;
let failProfile = false;
let holdAll = false;
let holdNext = false;
let pendingResolvers: Array<() => void> = [];
let analystPayload: unknown;
let profilePayload: unknown;
let checkinPayload: unknown;
let queuePayload: unknown;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let stopRouter: (() => void) | null = null;
let mounted = false;
let scrollSpy: ReturnType<typeof vi.fn>;

/** `ProfileDtoSchema` 是 `.passthrough()`：八个必填键给全，学情四键随带。 */
function makeProfile(over: Record<string, unknown> = {}): unknown {
  return {
    user_id: 1,
    phone: '13800000000',
    nickname: 't-18c',
    avatar: '',
    daily_goal: 20,
    updated_at: 1757000000000,
    hasPassword: true,
    pwPolicyVersion: 1,
    totalWords: 96,
    reviewDays: 63,
    reviewDates: [TODAY],
    streak: 9,
    ...over,
  };
}

/**
 * `GET /api/analyst` 的响应形状（T-26a 的 `packages/server/src/routes/analyst.ts:97` 逐键对齐）：
 * `{ dataset, insights, cached }`，`dataset` 里带服务端 echo 的 `period` 与 `generatedAt`。
 * 入参已由旧的 `?days=<number>` 改为 `?period=all`（T-26b），夹具随之对齐。
 */
const makeAnalyst = (points: unknown): unknown => ({
  dataset: { period: 'all', generatedAt: 1757000000000, growthCurve: points },
  insights: [],
  cached: false,
});

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}
const errResponse = (): Response =>
  ({
    ok: false,
    status: 500,
    text: async () => '{"error":"boom"}',
    json: async () => ({ error: 'boom' }),
  }) as unknown as Response;

function responseFor(url: string): Response {
  if (url.includes('/api/analyst')) return failAnalyst ? errResponse() : okResponse(analystPayload);
  if (url.includes('/api/profile')) return failProfile ? errResponse() : okResponse(profilePayload);
  if (url.includes('/api/checkin/status')) return okResponse(checkinPayload);
  if (url.includes('/api/review/queue')) return okResponse(queuePayload);
  return okResponse({});
}

/** 只 stub fetch：GET-only 的四个端点；`holdAll/holdNext` 让请求挂住（骨架/aria-busy 用例）。 */
function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    fetchCalls.push({ url, method: String(init?.method ?? 'GET') });
    if (holdAll || holdNext) {
      return new Promise<Response>((resolve) => {
        pendingResolvers.push(() => resolve(responseFor(url)));
      });
    }
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fn);
}

function releasePending(): void {
  holdAll = false;
  holdNext = false;
  const list = pendingResolvers;
  pendingResolvers = [];
  for (const release of list) release();
}

function testHost(): UiHost {
  return {
    kv: {
      get: (key: string) => localStorage.getItem(key),
      set: (key: string, value: string) => localStorage.setItem(key, value),
    },
    speak: () => undefined,
    navigate: (to: string) => navigate(to),
    toast: () => undefined,
  } as unknown as UiHost;
}

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

function render(): void {
  window.location.hash = '#/progress';
  resetRouterForTest('/progress');
  stopRouter = startRouter();
  client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <ProgressScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container.remove();
  stopRouter?.();
  stopRouter = null;
}

function q<T extends HTMLElement = HTMLElement>(selector: string): T | null {
  return container ? container.querySelector<T>(selector) : null;
}
function byTestId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return q<T>(`[data-testid=${id}]`);
}
function qAll(selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').trim();

function click(el: Element | null): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function buttonLikeByText(label: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('button, a')).find(
      (el) => (el.textContent ?? '').includes(label),
    ) ?? null
  );
}
function tabByName(name: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('[role=tab]')).find(
      (el) => text(el) === name,
    ) ?? null
  );
}

/**
 * 模式切换：Radix Tabs 的 automatic 档在 **mousedown** 里 `onValueChange`（`index.mjs:123`），
 * 只派发 `click` 不会换档（P-11/P-12 首跑实测：点了「每周」但 tip 还念着单日的旧值）。
 */
function switchMode(name: string): void {
  const el = tabByName(name);
  if (!el) throw new Error(`找不到模式 tab「${name}」`);
  act(() => {
    el.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: false }),
    );
  });
}
function cellByLabel(label: string): HTMLElement | null {
  return q<HTMLElement>(`[role="gridcell"][aria-label="${label}"]`);
}

const lsSnapshot = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key !== null) out[key] = localStorage.getItem(key) ?? '';
  }
  return out;
};

/** 源码哨兵：先剥注释再扫（文件头大量"我**不调** xxx"的注释提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8');

beforeEach(() => {
  fetchCalls = [];
  pendingResolvers = [];
  failAnalyst = false;
  failProfile = false;
  holdAll = false;
  holdNext = false;
  analystPayload = makeAnalyst(HAPPY_POINTS);
  profilePayload = makeProfile();
  checkinPayload = { checkedToday: true, streak: 12 };
  queuePayload = { mode: 'review', total: 5, dueToday: 5, queue: [] };
  localStorage.clear();
  localStorage.setItem('tm.token', 't-18c-test');
  scrollSpy = vi.fn();
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollSpy;
  stubFetch();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  resetRouterForTest('/');
});

/* ═════════════════ A 组：纯投影（判据①的取数口径） ═════════════════ */

describe('A 组 · progress-data 投影（判据①数字口径）', () => {
  it('P-01 判据①：「本周新增」= 周一起到今天的逐日 newWords 相加，窗口外的点不掺和', async () => {
    const { weekAdded } = await import('../src/components/progress-data.js');
    const { cellsFromGrowth } = await import('../src/components/progress-data.js');
    const cells = cellsFromGrowth(HAPPY_POINTS as never);
    expect(weekAdded(cells, TODAY)).toBe(weekSum(HAPPY_POINTS));
    // 上周的点单独存在时本周为 0（"相加"只发生在合法区间内）。
    expect(weekAdded(cellsFromGrowth([HAPPY_POINTS[1]!] as never), TODAY)).toBe(0);
  });

  it('P-02 判据①：曲线取累计 total 而非逐日 newWords；格阵主源空才退 reviewDates 兜底', async () => {
    const m = await import('../src/components/progress-data.js');
    const points = m.growthPointsOf(makeAnalyst(HAPPY_POINTS));
    expect(m.curvePointsOf(points).map((p) => p.value)).toEqual([70, 80, 92, 96]);
    const primary = m.cellsFromGrowth(points);
    const fallback = m.cellsFromReviewDates([TODAY, TODAY, dminus(40)]);
    expect(m.preferCells(primary, fallback)).toEqual(primary);
    expect(m.preferCells([], fallback).map((c) => c.count)).toEqual([1, 2]); // 按日升序，重复=次数
    expect(m.isFirstLoad([true, true, true, true])).toBe(true);
    expect(m.isFirstLoad([true, false, true, true])).toBe(false);
    expect(m.isEmptyBoard(primary, 96)).toBe(false);
    expect(m.isEmptyBoard([], 0)).toBe(true);
  });

  it('P-03 §3.7.6 模板逐字：热力图容器 aria-label 与曲线 accessibleSummary 拼串', async () => {
    const m = await import('../src/components/progress-data.js');
    expect(m.heatAriaLabelOf(63)).toBe('每日背词热力图，最近一年，共打卡 63 天');
    expect(m.curveSummaryOf(m.growthPointsOf(makeAnalyst(HAPPY_POINTS)))).toBe(
      `${ARIA.curveContainer}：从 70 词增长到 96 词，最近一天新增 4 词`,
    );
  });

  it('P-04 §1.2.1 文本通道：三档图例区间口径（日=单日最大 / 周=单周最大 / 累计=合计）', async () => {
    const m = await import('../src/components/progress-data.js');
    const cells = m.cellsFromGrowth(m.growthPointsOf(makeAnalyst(HAPPY_POINTS)) as never);
    expect(m.legendRangesOf('daily', cells)).toBe(HEATMAP_LEGEND.range(1, 6));
    expect(m.legendRangesOf('cumulative', cells)).toBe(HEATMAP_LEGEND.range(1, 15));
    expect(m.legendRangesOf('weekly', cells)).toBe(HEATMAP_LEGEND.range(1, 6)); // 单周最大 = 6（-1/-8 不同周）
    expect(m.legendRangesOf('weekly', [])).toBe(''); // 全空时不出区间（渲染端 `(空)` 也不该出现）
  });

  it('P-27 T-26b 取数形状：`period:"all"` 的全量返回在客户端裁到最近 365 天（两种包装同解）', async () => {
    const m = await import('../src/components/progress-data.js');
    expect(m.ANALYST_PERIOD).toBe('all');
    expect(m.ANALYST_WINDOW_DAYS).toBe(365);
    const stale = { date: dminus(m.ANALYST_WINDOW_DAYS), newWords: 999, total: 4000 }; // 窗口外一天
    const edge = { date: dminus(m.ANALYST_WINDOW_DAYS - 1), newWords: 1, total: 66 }; // 闭区间下界
    const points = m.growthPointsOf(makeAnalyst([stale, edge, ...HAPPY_POINTS]), TODAY);

    // 裁的是"喂给三处的那一份"：一年外的 999 不得进图例/格阵（文本通道与画得出的 53 周同口径）
    expect(points.some((p) => p.date === stale.date)).toBe(false);
    expect(points.map((p) => p.date)).toEqual([edge.date, ...HAPPY_POINTS.map((p) => p.date)]);
    expect(m.legendRangesOf('daily', m.cellsFromGrowth(points))).toBe(HEATMAP_LEGEND.range(1, 6));
    expect(m.curvePointsOf(points).map((p) => p.value)).toEqual([66, 70, 80, 92, 96]);
    // 只剩窗口外的点 ⇒ 裁完就是空数组（页面据此走"数据不足/空态"，不是凭空 0 词）
    expect(m.growthPointsOf(makeAnalyst([stale]), TODAY)).toEqual([]);
    // `/api/analyst`（`{dataset,…}`）与 `/api/analyst/dataset`（裸 dataset）两条真实读路径同解
    expect(m.growthPointsOf({ growthCurve: [stale, edge, ...HAPPY_POINTS] }, TODAY)).toEqual(points);
  });
});

/* ═════════════════ B 组：三张卡 + 落点 ═════════════════ */

describe('B 组 · B 区三张大数字卡（判据①顺序文案 + 落点）', () => {
  it('P-05 判据①/§3.7.1：三卡顺序锁死 本周新增/今日待复习/连续天数，文案逐字，grid-cols-3 gap-3', async () => {
    expect(PROGRESS_COPY.cards.weekAdded).toBe('本周新增');
    expect(PROGRESS_COPY.cards.todayDue).toBe('今日待复习');
    expect(PROGRESS_COPY.cards.streak).toBe('连续天数');
    render();
    await settle();
    const wrap = byTestId('progress-cards');
    expect(wrap).not.toBeNull();
    expect(wrap!.className).toContain('grid-cols-3');
    expect(wrap!.className).toContain('gap-3');
    expect(wrap!.getAttribute('role')).toBe('list');
    const items = Array.from(wrap!.querySelectorAll<HTMLElement>('[role=listitem]'));
    expect(items).toHaveLength(3);
    expect(text(byTestId('progress-card-week'))).toContain('本周新增');
    expect(text(byTestId('progress-card-due'))).toContain('今日待复习');
    expect(text(byTestId('progress-card-streak'))).toContain('连续天数');
  });

  it('P-06 判据①：三卡数字同源且真实存在（曲线喂卡1、queue 喂卡2、checkin 优先于 profile 喂卡3）', async () => {
    render();
    await settle();
    expect(byTestId('progress-card-week')!.getAttribute('aria-label')).toBe(
      `本周新增 ${weekSum(HAPPY_POINTS)}`,
    );
    expect(byTestId('progress-card-due')!.getAttribute('aria-label')).toBe('今日待复习 5');
    // checkin.status 的 12 优先于 profile.get 的 9（R-13⑥ 同一份查询，页面不自算连胜）
    expect(byTestId('progress-card-streak')!.getAttribute('aria-label')).toBe('连续天数 12');
    expect(fetchCalls.some((c) => c.url.includes('/api/checkin/status'))).toBe(true);
  });

  it('P-07 §3.7.1 末段：卡1 → 单词本 ?filter=new；卡2 → /study', async () => {
    render();
    await settle();
    click(byTestId('progress-card-week'));
    await advance(40);
    expect(window.location.hash).toBe('#/wordbook?filter=new');
    click(byTestId('progress-card-due'));
    await advance(40);
    expect(window.location.hash).toBe('#/study');
  });

  it('P-08 §3.7.1 末段：卡3（连续天数）→ 热力图滚进视野并把格阵滚到今天那一列', async () => {
    render();
    await settle();
    const scroller = q<HTMLElement>('.heatmap-scroll');
    const heatRoot = byTestId('progress-heatmap');
    if (!scroller || !heatRoot) throw new Error('夹具未渲染出热力图根节点/滚动容器');
    // spy 只挂在热力图根节点上 ⇒ "被滚进视野的就是 D 区" 这件事本身可判真假。
    const intoSpy = vi.fn();
    (heatRoot as unknown as { scrollIntoView: unknown }).scrollIntoView = intoSpy;
    let written: number | null = null;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft');
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: (value: number) => {
        written = value;
      },
    });
    try {
      click(byTestId('progress-card-streak'));
      await advance(40);
    } finally {
      if (original) Object.defineProperty(scroller, 'scrollLeft', original);
      else delete (scroller as unknown as { scrollLeft?: unknown }).scrollLeft;
    }
    expect(intoSpy).toHaveBeenCalledTimes(1);
    expect(written).not.toBeNull();
    expect(written).toBe(scroller.scrollWidth);
  });

  it('P-09 §3.7.4「0 词 0 复习」：三卡显示 0（数字必须存在，不是空），C/D 双空态，按钮去背单词 → /study', async () => {
    analystPayload = makeAnalyst([]);
    profilePayload = makeProfile({ totalWords: 0, reviewDays: 0, reviewDates: [], streak: 0 });
    checkinPayload = { checkedToday: false, streak: 0 };
    queuePayload = { mode: 'review', total: 0, dueToday: 0, queue: [] };
    render();
    await settle();
    expect(byTestId('progress-card-week')!.getAttribute('aria-label')).toBe('本周新增 0');
    expect(byTestId('progress-card-due')!.getAttribute('aria-label')).toBe('今日待复习 0');
    expect(byTestId('progress-card-streak')!.getAttribute('aria-label')).toBe('连续天数 0');
    expect(byTestId('progress-curve-empty')).not.toBeNull();
    expect(byTestId('progress-heat-empty')).not.toBeNull();
    expect(text(byTestId('progress-curve-empty')!)).toContain('还没有背过词');
    expect(text(byTestId('progress-heat-empty')!)).toContain('还没有背过词');
    expect(text(container)).toContain('背完第一轮，这里就有内容了。');
    click(buttonLikeByText('去背单词'));
    await advance(40);
    expect(window.location.hash).toBe('#/study');
  });
});

/* ═════════════════ C 组：曲线 + 热力图 ═════════════════ */

describe('C 组 · C 增长曲线 + D 热力图', () => {
  it('P-10 §3.7.6：曲线 role=img + 数字模板逐字 + sr-only 文本替身表', async () => {
    render();
    await settle();
    const img = q('[data-testid=progress-curve-chart] [role=img]');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('aria-label')).toBe(
      '最近 30 天新增单词曲线：从 70 词增长到 96 词，最近一天新增 4 词',
    );
    expect(q('[data-testid=progress-curve-chart] table')).not.toBeNull();
  });

  it('P-11 判据①：热力图三模式切换（每日/每周/累计），每周整周合并、累计到今天是总和', async () => {
    render();
    await settle();
    const tabs = qAll('[role=tab]');
    expect(tabs.map((el) => text(el))).toEqual(['每日', '每周', '累计']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelectorAll('[role=row]').length).toBe(7);
    switchMode('每周');
    await settle();
    // 每周列的可访问名以该列首日（周一）为 key：只含 `dminus(8)` 那个点，合计恒为 6。
    expect(q(`[aria-label="${weekStartKey(dminus(8))}，背了 6 个词"]`)).not.toBeNull();
    expect(container.querySelectorAll('[role=row]').length).toBe(1);
    switchMode('累计');
    await settle();
    expect(cellByLabel(`${TODAY}，背了 15 个词`)).not.toBeNull();
    expect(container.querySelectorAll('[role=row]').length).toBe(7);
    switchMode('每日');
    await settle();
    expect(cellByLabel(`${TODAY}，背了 4 个词`)).not.toBeNull();
  });

  it('P-12 判据①：点格出信息条（role=status + aria-live=polite、在滚动区外），换档清旧值', async () => {
    render();
    await settle();
    const tipEl = () => q('[data-testid=progress-heat-card] [role=status]');
    expect(tipEl()).not.toBeNull();
    expect(tipEl()!.getAttribute('aria-live')).toBe('polite');
    expect(text(tipEl())).toBe(''); // 未点选不播报
    click(cellByLabel(`${TODAY}，背了 4 个词`));
    await settle();
    expect(text(tipEl())).toBe(`${TODAY}，背了 4 个词`);
    expect(q('[data-testid=progress-heat-card] .heatmap-scroll [role=status]')).toBeNull();
    click(cellByLabel(`${dminus(1)}，背了 2 个词`));
    await settle();
    expect(text(tipEl())).toBe(`${dminus(1)}，背了 2 个词`);
    switchMode('每周');
    await settle();
    expect(text(tipEl())).toBe(''); // 单日 → 整周口径变了，信息条不能留着念旧值
  });

  it('P-13 §3.7.2/§1.2.1：图例 少→多 + 数值区间（文本通道）', async () => {
    render();
    await settle();
    const heatText = text(byTestId('progress-heat-card'));
    expect(heatText).toContain(HEATMAP_LEGEND.left);
    expect(heatText).toContain(HEATMAP_LEGEND.right);
    expect(heatText).toContain(HEATMAP_LEGEND.range(1, 6));
  });
});

/* ═════════════════ D 组：§3.7.4 六态 + 离线 ═════════════════ */

describe('D 组 · §3.7.4 六态 + 离线横幅', () => {
  it('P-14 §3.7.4 未登录：App 轻版整页未登录墙是 Web 独有 → 页内无登录墙；无 token 时四条 GET 一条都不发', async () => {
    localStorage.removeItem('tm.token');
    render();
    await settle();
    await advance(RETRY_MS);
    await settle();
    expect(fetchCalls).toHaveLength(0);
    expect(text(container)).not.toContain(PROGRESS_COPY.signedOut.title);
    // 无凭据 → 拉取失败口径（D 区降级 + C 区错误），数字仍不许凭空消失
    expect(text(byTestId('progress-heat-error'))).toContain(PROGRESS_COPY.heatmapUnavailable);
    expect(byTestId('progress-card-due')!.getAttribute('aria-label')).toBe('今日待复习 0');
  });

  it('P-15 §3.7.4 首屏：骨架 ≥300ms（挂住全部请求 320ms 后仍是骨架），落数后骨架文案消失', async () => {
    holdAll = true;
    render();
    await settle();
    const note = byTestId('progress-skeleton-note');
    expect(note).not.toBeNull();
    expect(text(note)).toBe('正在整理学习记录…');
    expect(container.querySelectorAll('#progress-cards [aria-disabled=true], [data-testid^=progress-card-][aria-disabled]').length)
      .toBeGreaterThanOrEqual(3);
    await advance(320);
    expect(byTestId('progress-skeleton-note')).not.toBeNull();
    expect(q('[role=grid]')).toBeNull(); // 骨架阶段不画格阵（形状由 7×N 骨架块表达）
    releasePending();
    await settle();
    expect(byTestId('progress-skeleton-note')).toBeNull();
    expect(q('[role=grid]')).not.toBeNull();
  });

  it('P-16 §3.7.4 曲线数据不足（<3 天）：不画图，改文本进度 + 逐日一行', async () => {
    analystPayload = makeAnalyst(TWO_POINTS);
    profilePayload = makeProfile({ totalWords: 8 });
    render();
    await settle();
    expect(q('[role=img]')).toBeNull();
    const chart = byTestId('progress-curve-chart');
    expect(text(chart)).toContain('背够 3 天就有曲线了');
    expect(text(chart)).toContain(`${TODAY} · 8`);
    expect(text(chart)).toContain(`${dminus(1)} · 5`);
  });

  it('P-17 §3.7.4 拉取失败：C 区给「学习情况没拿到」+ 自动静默重试 1 次，点「再试一次」恢复', async () => {
    failAnalyst = true;
    render();
    await settle();
    await advance(RETRY_MS);
    await settle();
    expect(fetchCalls.filter((c) => c.url.includes('/api/analyst'))).toHaveLength(2); // retry: 1 = 1+1
    const alert = q('[data-testid=progress-curve-chart][role=alert]');
    expect(alert).not.toBeNull();
    expect(text(alert)).toContain('学习情况没拿到');
    expect(text(alert)).toContain('网络或服务器刚好在忙，你的记录没有丢。');
    // D 区**不**降级：主源挂了还有 profile 兜底源
    expect(byTestId('progress-heat-error')).toBeNull();
    expect(byTestId('progress-heat-card')).not.toBeNull();
    failAnalyst = false;
    click(buttonLikeByText('再试一次'));
    await settle();
    expect(q('[data-testid=progress-curve-chart] [role=img]')).not.toBeNull();
  });

  it('P-18 §3.7.4 局部失败：两源全挂只 D 区降级（卡与数字照常存在），文字按钮重载热力图', async () => {
    failAnalyst = true;
    failProfile = true;
    render();
    await settle();
    await advance(RETRY_MS);
    await settle();
    const heatError = byTestId('progress-heat-error');
    expect(text(heatError)).toContain('热力图暂时打不开');
    expect(text(heatError)).toContain('其他数字不受影响。');
    expect(byTestId('progress-heat-card')).toBeNull();
    // B 区不受影响：今日待复习/连续天数仍来自独立查询并带数字
    expect(byTestId('progress-card-due')!.getAttribute('aria-label')).toBe('今日待复习 5');
    expect(byTestId('progress-card-streak')!.getAttribute('aria-label')).toBe('连续天数 12');
    expect(byTestId('progress-card-week')!.getAttribute('aria-label')).toBe('本周新增 0');
    failAnalyst = false;
    failProfile = false;
    click(buttonLikeByText('重新加载热力图'));
    await settle();
    expect(byTestId('progress-heat-card')).not.toBeNull();
    expect(byTestId('progress-heat-error')).toBeNull();
  });

  it('P-19 §3.7.4 数据不足（热力图）：格阵照画 + 一句人话；曲线有 3 点就画', async () => {
    analystPayload = makeAnalyst(SPARSE_POINTS);
    profilePayload = makeProfile({ totalWords: 11, reviewDays: 3 });
    render();
    await settle();
    expect(byTestId('progress-heat-sparse')).not.toBeNull();
    expect(PROGRESS_COPY.heatSparse(3)).toBe(
      '最近一年背了 3 天，再多背几天就能看出一周的习惯', // PM-fix8 件 2 定稿串（A-65 第 181 条；T-18c 旧自拟字面因"同屏两数分叉"被替换）
    );
    expect(text(byTestId('progress-heat-sparse'))).toBe(PROGRESS_COPY.heatSparse(3));
    expect(q('[data-testid=progress-curve-chart] [role=img]')).not.toBeNull();
  });

  it('P-20 §3.7.4 末行：离线只压一条 warning 细横幅，恢复即消失（文案无"未接入/云端/本地"）', async () => {
    render();
    await settle();
    expect(byTestId('progress-offline-banner')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    const banner = byTestId('progress-offline-banner');
    expect(banner).not.toBeNull();
    expect(text(banner)).toBe('离线中 · 显示的是上次到手机上的记录');
    expect(banner!.className).toContain('bg-warning-soft');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(byTestId('progress-offline-banner')).toBeNull();
  });
});

/* ═════════════════ E 组：§3.7.6 无障碍 + 禁词 + 判据⑤ + 路由 ═════════════════ */

describe('E 组 · 无障碍 / 禁词 / 判据⑤ / 路由挂载', () => {
  it('P-21 §3.7.6 键盘：格阵不进焦点序（tabindex=-1、非 button），「浏览热力图」锚点打开整周表格', async () => {
    render();
    await settle();
    const cells = qAll('[role=gridcell]');
    expect(cells.length).toBeGreaterThan(100); // 53 周×7 行，真格阵不是示意图
    expect(cells.every((el) => el.getAttribute('tabindex') === '-1')).toBe(true);
    expect(q('.heatmap-scroll button')).toBeNull();
    expect(q('[role=group][aria-label="每日背词热力图，最近一年，共打卡 63 天"]')).not.toBeNull();
    const browse = buttonLikeByText(ARIA.browseHeatmap); // '浏览热力图'
    expect(browse).not.toBeNull();
    click(browse);
    await settle();
    expect(container.querySelectorAll('[data-testid=progress-heat-region] table tbody tr').length)
      .toBeGreaterThan(10);
  });

  it('P-22 A 顶栏 + §3.7.6 播报：标题逐字、刷新是唯一非卡片交互、手动刷新期间 aria-busy + 数值卡 aria-live=polite', async () => {
    render();
    await settle();
    expect(text(byTestId('progress-title'))).toBe('学习情况');
    expect(text(container)).not.toContain('学情分析');
    expect(text(byTestId('progress-refresh'))).toBe('刷新学习情况');
    const dueUrlBefore = fetchCalls.filter((c) => c.url.includes('/api/review/queue')).length;
    expect(dueUrlBefore).toBe(1);
    holdNext = true;
    click(byTestId('progress-refresh'));
    expect(byTestId('progress-refresh')!.hasAttribute('disabled')).toBe(true); // 仓内未装 jest-dom，用原生属性断言
    expect(byTestId('progress-card-week')!.getAttribute('aria-live')).toBe('polite');
    expect(byTestId('progress-card-streak')!.getAttribute('aria-live')).toBe('polite');
    releasePending();
    await settle();
    expect(fetchCalls.filter((c) => c.url.includes('/api/review/queue')).length).toBe(
      dueUrlBefore + 1,
    );
    expect(byTestId('progress-card-week')!.getAttribute('aria-live')).toBe('off');
  });

  it('P-23 §6.6：全量渲染文本 0 禁词命中、无 undefined/NaN 上屏', async () => {
    render();
    await settle();
    switchMode('累计'); // 三模式各扫一遍渲染产物
    await settle();
    switchMode('每日');
    await settle();
    const rendered = text(container);
    for (const term of [
      '云端',
      '本地',
      '未接入',
      '缓存',
      'ClickHouse',
      '24h',
      '数据源',
      'userId',
      'token',
      'undefined',
      'NaN',
      '学情分析',
    ]) {
      expect(rendered).not.toContain(term);
    }
  });

  it('P-24 判据⑤/§3.7.2 哨兵：屏与投影模块与 analyst 数据层（剥注释后）零 fetch、零 daily_goal、零 mutation、零连胜自算', async () => {
    // T-26b：清单扩到数据层那一个文件（本轮唯一改了取数的模块），四条正则一字未松。
    const files = [
      '../src/screens/ProgressScreen.tsx',
      '../src/components/progress-data.ts',
      '../src/data/queries/analyst.ts',
    ];
    for (const rel of files) {
      const code = stripComments(readSrc(rel));
      expect(code, `${rel} 不得直调 fetch`).not.toMatch(/(^|[^A-Za-z0-9_])fetch\(/);
      expect(code, `${rel} 不得触碰 daily_goal`).not.toMatch(/daily_goal|dailyGoal/);
      expect(code, `${rel} 不得有 mutation`).not.toMatch(/useMutation|apiPut|apiPost|updateProfile/);
      expect(code, `${rel} 不得自算连胜（R-13⑥ 只读接口）`).not.toMatch(
        /computeStreak\(|computeStreakFromDates\(|currentStreak\(/,
      );
    }
  });

  it('P-25 判据⑤：全交互后 0 写请求、URL 只落四张读表、localStorage（含任何存量 daily_goal 键）一字不动', async () => {
    localStorage.setItem('tm.daily_goal', '10'); // 存量值（任何形态的本地残留）
    const before = lsSnapshot();
    render();
    await settle();
    click(byTestId('progress-card-week'));
    click(byTestId('progress-card-due'));
    click(cellByLabel(`${TODAY}，背了 4 个词`));
    switchMode('每周');
    switchMode('累计');
    switchMode('每日');
    holdNext = true;
    click(byTestId('progress-refresh'));
    releasePending();
    await settle();
    expect(fetchCalls.every((c) => c.method === 'GET')).toBe(true);
    expect(
      fetchCalls.every((c) =>
        ['/api/analyst', '/api/profile', '/api/checkin/status', '/api/review/queue'].some((path) =>
          c.url.includes(path),
        ),
      ),
    ).toBe(true);
    expect(lsSnapshot()).toEqual(before);
  });

  it('P-26 T-18c-r3 挂载：router `/progress` 的 load 不再指向占位，解出 ProgressScreen 本体', async () => {
    const def = ROUTES.find((route) => route.path === '/progress');
    expect(def).toBeDefined();
    const mod = await def!.load();
    expect(mod.default).toBe(ProgressScreen);
  });

  it('P-28 T-26b 契约对齐：analyst 只发 `?period=all`、全量 URL 0 处 `days=`，且真实响应形状能落数', async () => {
    render();
    await settle();
    const analyst = fetchCalls.filter((c) => c.url.includes('/api/analyst'));
    expect(analyst.length).toBeGreaterThanOrEqual(1);
    for (const call of analyst) {
      expect(call.url).toContain('period=all');
      expect(call.url).not.toContain('days='); // 服务端从来没有这个入参（A-47 #106）
    }
    // 页面确实从这份响应拿到了格值（缺源时走的是失败/空态分支，不是凭空 0 词）
    expect(cellByLabel(`${TODAY}，背了 4 个词`)).not.toBeNull();
  });
});
