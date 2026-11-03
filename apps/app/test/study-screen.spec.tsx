/**
 * T-18a 判据自证（App 背词屏）—— `apps/app/test/study-screen.spec.tsx`。
 *
 * 覆盖 PRD `R-11 ①②③④⑤⑥` / `R-12 ①②③④⑤⑥` / `R-13 ①②⑥`（页面侧）
 * + UI §3.5.1~§3.5.6 状态表 + §3.5.7 无障碍 + §6.6 禁词清单 + §5.1 Chrome84 红线。
 * 用例编号 `S-01…S-30` 与 `.delivery/04-dev-report-T-18-a.md` 的映射表一一对应。
 *
 * 三条"判据 → 可机检量"的换算（jsdom 无排版引擎、也没有数据库，按架构 §10.2 的替代量口径）：
 *  - **R-12④「随机自测不改任何 FSRS 卡的 `due`」** 在客户端这一侧拆成两半：
 *    ① 整轮 `POST /api/review` / `POST /api/review/undo` 计数恒为 0（写卡只有这两个端点）；
 *    ② **查询层出参断言**：轮前塞进缓存的 `queue/review` 出参在轮后仍是**同一个对象引用**
 *      （既没被改写、也没因失效而重取）⇒ 复习档的 `due` 序列不可能被这一轮动过。
 *      真库快照那一半（`SELECT due …` 前后比对）在 `@tm/server` 名下 ⇒ 报告里标跨任务（T-09/T-11）。
 *  - **R-11②「拖拽 60px 提交改阈值 + 松手前可滑回取消」** 用 UI §3.5.4 定稿的 64px（A 级裁决取代
 *    PRD 行内的 60px）与 24px 胶囊阈值造真实 pointer 事件序列：达阈值松手计分；24~63px 只出胶囊
 *    不计分；同一次手势滑回 <24px 取消；纵向位移判为滚动 ⇒ 三种路径都验"横滑查看长例句不加分"。
 *  - **§3.5.7 / §7.1 的 44×44 命中区**在 jsdom 量不出来 ⇒ 只做可判真假的等价量：元素是真
 *    `<button>`、`className` 含 `min-h-tap`（= `var(--tap)` 44px 的 preset，§1.12.2）、无正 `tabindex`
 *    （= Tab 序即 DOM 序）。像素实测归 T-23 真机走查（报告"未跑清单"）。
 *
 * 异步断言一律走本文件的 `settle()`：它等**真宏任务**（`setTimeout`），因为
 * `@tanstack/react-query` 的 `NotifyManager` 批处理不排在微任务队列里 —— 只 `await Promise.resolve()`
 * 会出现"请求已发出、结果还没上屏"（`detail-screen.spec.tsx` 为此吃过 20 条假红，本轮不再重犯）。
 *
 * 网络：只 stub `globalThis.fetch`（`data/rest-fetcher.ts` 的唯一出口），不断言实现细节。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UiHost } from '@tm/ui';
import {
  ARIA,
  AUTH_COPY,
  MODE_LABELS,
  NEW_WORD_BATCH_DEFAULT,
  PLAIN_TERMS,
  RATING_LABELS,
  RATING_VALUES,
  STUDY_COPY,
  UNDO_MAX_PER_SESSION,
  VERBS,
  type QueueMode,
  type QueueItemDto,
  type RatingValue,
  type ReviewQueueResultDto,
} from '@tm/shared';
import StudyScreen, {
  COMPLETION_PATH,
  NOTICE_KEY,
  SKIPPED_KEY,
  completionHref,
  hasSeenNotice,
  isNetworkFailure,
  markNoticeSeen,
  minutesUntil,
  newBatchSize,
  pushSkipped,
  readSkipped,
  studyHref,
  studyModeOf,
  toStudyDeck,
  undoAvailable,
} from '../src/screens/StudyScreen.js';
import { parseSummaryQuery } from '../src/screens/CompletionScreen.js';
import { reviewKeys } from '../src/data/queries/review.js';
import { getSyncStatus } from '../src/data/startup.js';
import { navigate, resetRouterForTest, startRouter } from '../src/router.js';
import { shouldAskGoal } from '../src/components/goal-ask-sheet.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 像素口径（UI §3.5.4 定稿；这里只做区间判定，不复制常量到断言里当唯一真相） ═════════════════ */

/** §3.5.4：≥64px 且松手才提交（A 级裁决用它取代 PRD 行内的 60px）。 */
const SUBMIT_PX = 64;
/** §3.5.4：位移 ≥24px 起在卡角浮出目标档胶囊。 */
const PILL_PX = 24;
const UNDO_LABEL = ARIA.undoRating;

/* ═════════════════ 夹具 ═════════════════ */

const CARD = (word: string, gloss = '某释义', hasCard = true): QueueItemDto => ({ word, gloss, hasCard });

const QUEUE = (
  mode: QueueMode,
  words: QueueItemDto[],
  dueToday = 7,
): ReviewQueueResultDto => ({ mode, total: words.length, dueToday, queue: words });

const RATE_RESULT = (word: string, rating: RatingValue) => ({
  word,
  /** +4 天 ⇒ `formatReviewInterval` 走"天"那一档（`良好，下次 4 天后`，§6.8 定稿）。 */
  due: new Date(Date.parse('2026-01-05T00:00:00.000Z')).toISOString(),
  state: 3,
  reps: 1,
  lapses: 0,
  rating,
  reviewedAt: Date.parse('2026-01-01T00:00:00.000Z'),
});

/** `/api/lookup` 的合法出参（形状与 `lookup-screen.spec.tsx` 的 `EN2ZH_HIT` 同一份）。 */
const LOOKUP_RESULT = {
  word: 'happy',
  phonetic: 'ˈhæpi',
  translation: 'adj. 快乐的\nn. 幸福',
  definition: 'feeling pleasure and enjoyment',
  groups: [{ pos: 'adj.', meanings: ['快乐的', '幸福的'] }],
  exchange: {},
  examples: [],
  freq: 4,
  tag: '',
  detail: '',
  audio: '',
};

interface FetchCall {
  url: string;
  path: string;
  method: string;
  body: Record<string, unknown> | null;
}

let fetchCalls: FetchCall[] = [];
let speakSpy: ReturnType<typeof vi.fn>;
let toastSpy: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let signedIn = true;
let pointerCoarse = true;
/** `navigate()` 只写 `location.hash`，快照靠 `startRouter()` 装的 `hashchange` 监听（`router.tsx:241`）。 */
let stopRouter: (() => void) | null = null;
let mounted = false;

/** 每例可改的假服务端。 */
const api = {
  queues: {} as Partial<Record<QueueMode, ReviewQueueResultDto>>,
  wordbook: [{ word: 'happy' }, { word: 'apple' }, { word: 'glad' }] as unknown[],
  checkinStatus: {} as Record<string, unknown>,
  rate: 'ok' as 'ok' | 'fail' | 'throw',
  undo: 'ok' as 'ok' | 'fail',
  undoRemaining: 2,
  queue: 'ok' as 'ok' | 'fail' | 'throw',
  hangQueue: false,
  /** I-05 夹具：这些词的 `/api/lookup` 回"合法但空释义"（模拟上游真查不到）。 */
  lookupMiss: new Set<string>(),
  /** I-05 修复回环夹具：瞬时空手——该词**首条** `/api/lookup` 回空释义，之后的回真释义（模拟上游超时被吞）。 */
  lookupMissOnce: new Set<string>(),
  /** `/api/lookup` 按词的已发次数（`lookupMissOnce` 用它区分首条/后续）。 */
  lookupCalls: new Map<string, number>(),
  /** I-05 夹具：`/api/lookup` 的受控延迟（毫秒），验证预取在翻面之前跑完。 */
  lookupDelayMs: 0,
  /** `due` 快照的客户端替身：只有真发过评分才会往这里写（R-12④ 的反证面）。 */
  written: [] as Array<{ word: string; rating: RatingValue }>,
};

function resetApi(): void {
  api.queues = {
    review: QUEUE('review', [CARD('happy'), CARD('apple'), CARD('glad')]),
    new: QUEUE('new', [CARD('zebra', '斑马', false), CARD('quartz', '石英', false)]),
    selfTest: QUEUE('selfTest', [CARD('happy'), CARD('apple'), CARD('glad')]),
  };
  api.wordbook = [{ word: 'happy' }, { word: 'apple' }, { word: 'glad' }];
  api.checkinStatus = { checkedIn: false, streak: 36, dailyGoal: 20, doneToday: 3 };
  api.rate = 'ok';
  api.undo = 'ok';
  api.undoRemaining = 2;
  api.queue = 'ok';
  api.hangQueue = false;
  api.lookupMiss = new Set<string>();
  api.lookupMissOnce = new Set<string>();
  api.lookupCalls = new Map<string, number>();
  api.lookupDelayMs = 0;
  api.written = [];
}

/** 按词回释义（I-05）：`miss` 里的词回"合法但空释义"出参，模拟上游真查不到。 */
const glossOf = (word: string): string => (word === 'happy' ? '快乐的' : `${word} 的释义`);

/** 按 pathname 分派；`POST /api/review` 与 `/api/review/queue`、`/api/review/undo` 必须分清。 */
function route(url: string, call: FetchCall | undefined): [number, unknown] {
  const path = new URL(url).pathname;
  const query = new URL(url).searchParams;
  if (path === '/api/review/queue') {
    if (api.queue === 'throw') throw new TypeError('offline');
    if (api.queue === 'fail') return [500, { error: 'boom' }];
    const mode = (query.get('mode') ?? 'review') as QueueMode;
    return [200, api.queues[mode] ?? QUEUE(mode, [])];
  }
  if (path === '/api/wordbook') return [200, { data: api.wordbook }];
  if (path === '/api/checkin/status') return [200, api.checkinStatus];
  if (path === '/api/checkin') return [200, { ok: true }];
  if (path === '/api/review/undo') {
    if (api.undo === 'fail') return [500, { error: 'boom' }];
    return [
      200,
      { ok: true, word: String(call?.body?.word ?? ''), index: 0, remaining: api.undoRemaining },
    ];
  }
  if (path === '/api/review') {
    if (api.rate === 'throw') throw new TypeError('offline');
    if (api.rate === 'fail') return [500, { error: 'boom' }];
    const word = String(call?.body?.word ?? '');
    const rating = Number(call?.body?.rating ?? 3) as RatingValue;
    api.written.push({ word, rating });
    return [200, RATE_RESULT(word, rating)];
  }
  if (path === '/api/lookup') {
    const word = (query.get('word') ?? '').trim();
    const key = word.toLowerCase();
    /* I-05 修复回环：瞬时空手 = 该词首条回空、后续回真释义。 */
    if (api.lookupMissOnce.has(key)) {
      const seen = (api.lookupCalls.get(key) ?? 0) + 1;
      api.lookupCalls.set(key, seen);
      if (seen === 1) return [200, { ...LOOKUP_RESULT, word, groups: [], translation: '', definition: '' }];
    }
    if (api.lookupMiss.has(key)) {
      /* 上游真空手：形状仍过 `parseLookupResponse`，但首义为空串。 */
      return [200, { ...LOOKUP_RESULT, word, groups: [], translation: '', definition: '' }];
    }
    const text = glossOf(word);
    return [
      200,
      {
        ...LOOKUP_RESULT,
        word,
        translation: text,
        groups: [{ pos: 'adj.', meanings: [text] }],
      },
    ];
  }
  return [200, {}];
}

function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const raw = typeof init?.body === 'string' ? init.body : '';
    const call: FetchCall = {
      url,
      path: new URL(url).pathname,
      method: String(init?.method ?? 'GET'),
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
    };
    fetchCalls.push(call);
    /* 取队挂住（测 ≥300ms 骨架那一行）：永不 resolve。 */
    if (api.hangQueue && call.path === '/api/review/queue') return new Promise<Response>(() => undefined);
    const [status, body] = route(url, call);
    if (call.path === '/api/lookup' && api.lookupDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, api.lookupDelayMs));
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
}

function testHost(): UiHost {
  return {
    kv: {
      get: (key: string) => localStorage.getItem(key),
      set: (key: string, value: string) => localStorage.setItem(key, value),
    },
    speak: (text: string, accent?: 'uk' | 'us') => speakSpy(text, accent),
    navigate: (to: string) => navigate(to),
    toast: (message: string, options?: never) => toastSpy(message, options),
  };
}

/** 排空微任务 **+ 宏任务**：每轮 12ms > `NotifyManager` 批处理窗口，6 轮走完连锁渲染（~72ms < 300ms 骨架门槛）。 */
async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

function render(path = '/study'): void {
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  if (signedIn) localStorage.setItem('tm.token', 't-18a-r2');
  container = document.createElement('div');
  document.body.appendChild(container);
  window.location.hash = `#${path}`;
  resetRouterForTest(path);
  stopRouter = startRouter();
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <StudyScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container?.remove();
  stopRouter?.();
  stopRouter = null;
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector) ?? document.body.querySelector<T>(selector);
}

function text(scope: string): string {
  return q<HTMLElement>(scope)?.textContent ?? '';
}

function state(): string | undefined {
  return q<HTMLElement>('[data-testid=study-screen]')?.dataset.state;
}

function buttons(scope: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`${scope} button`));
}

function byText(scope: string, label: string): HTMLElement | null {
  return buttons(scope).find((el) => (el.textContent ?? '').trim() === label) ?? null;
}

/** 四档按钮按 `aria-label` 前缀认（评分成功后 label 会补"下次 …"，档位名互不为前缀）。 */
function rateButton(rating: RatingValue): HTMLElement | null {
  const label = RATING_LABELS[rating];
  return (
    buttons('[data-testid=study-rating]').find(
      (el) => (el.getAttribute('aria-label') ?? '').startsWith(label),
    ) ?? null
  );
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function rate(rating: RatingValue): Promise<void> {
  click(rateButton(rating));
  await settle();
}

function hash(): string {
  return window.location.hash;
}

function queryOf(hashValue: string): Record<string, string | undefined> {
  const params = new URLSearchParams(hashValue.split('?')[1] ?? '');
  const out: Record<string, string | undefined> = {};
  for (const key of Array.from(params.keys())) out[key] = params.get(key) ?? undefined;
  return out;
}

/** 评分/撤销 toast 的第二个入参（`host.toast` 的类型面把它写成 `never`，这里按结构读）。 */
function lastToastOptions(): { tone?: string; action?: { label: string; onClick: () => void } } {
  const calls = toastSpy.mock.calls;
  return (calls[calls.length - 1]?.[1] ?? {}) as {
    tone?: string;
    action?: { label: string; onClick: () => void };
  };
}

function postCount(path: string): number {
  return fetchCalls.filter((c) => c.method === 'POST' && c.path === path).length;
}

function callsTo(path: string): FetchCall[] {
  return fetchCalls.filter((c) => c.path === path);
}

/** 卡正面那颗"整卡即按钮"的翻面出口（可访问名 = `STUDY_COPY.cardFaceHint`，§3.5.7）。 */
function flip(): void {
  click(q<HTMLElement>(`[data-testid=study-card] [aria-label="${STUDY_COPY.cardFaceHint}"]`));
}

/** 横滑手势的承载层：卡片根节点的**直接子** div（`Flashcard.tsx:221-235` 唯一挂 pointer 处理器 + `translateX` 内联样式的那一层；进度条指示器是孙节点，故用 `:scope >`）。 */
function dragLayer(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    '[data-testid=study-card] > div[style*="translateX"]',
  );
  if (!el) throw new Error('找不到滑动层');
  return el;
}

function pointer(target: Element, type: string, x: number, y: number): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    );
  });
}

/** 一次完整横滑（jsdom 无 `PointerEvent` 构造器 ⇒ 派发同名 `MouseEvent`，`packages/ui/test/patterns.spec.tsx` 同法）。 */
function swipe(dx: number, dy = 0): void {
  const layer = dragLayer();
  pointer(layer, 'pointerdown', 300, 200);
  pointer(layer, 'pointermove', 300 + Math.round(dx / 2), 200 + Math.round(dy / 2));
  pointer(layer, 'pointermove', 300 + dx, 200 + dy);
  pointer(layer, 'pointerup', 300 + dx, 200 + dy);
}

/** 源码级哨兵：剥注释后只取"用户可见串"（字符串字面量 + JSX 文本），否则 `typeof x !== 'undefined'` 这类代码会自指误红。 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/** `navigator.onLine` 的还原钩子（S-23 会改它；不改回来会串到后面的用例）。 */
let restoreOnLine: (() => void) | null = null;

function forceOnLine(value: boolean): void {
  const own = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  restoreOnLine = () => {
    if (own) Object.defineProperty(window.navigator, 'onLine', own);
    else delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  };
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, writable: true, value });
}

function visibleCopy(code: string): string {
  const literals = code.match(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g) ?? [];
  /* JSX 文本子节点：`>` 与 `<` 之间那段**不含任何代码标点**的才是文案。
     箭头函数会让 `=>` 的 `>` 一路吃到下一个 `<`（`onAgain={…}` 这类），故显式排除；
     上屏文字全量覆盖由 S-28 的运行时那一半（`container.textContent`）负责。 */
  const jsxText = (code.match(/>[^<>{}]+</g) ?? [])
    .map((chunk) => chunk.slice(1, -1))
    .filter((chunk) => !/[=&|;,:!?(){}\[\]]/.test(chunk));
  return [...literals, ...jsxText].join('\n');
}

const SOURCES = [
  '../src/screens/StudyScreen.tsx',
  '../src/screens/CompletionScreen.tsx',
  '../src/components/goal-ask-sheet.tsx',
  '../src/components/due-badge-data.tsx',
].map((p) => {
  const src = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const code = codeOnly(src);
  return { path: p, code, copy: visibleCopy(code) };
});

/** §6.6 禁词清单（`03-ui-spec.md:1594`）。`undefined`/`NaN` 属渲染期判据 ⇒ 见 S-28 的运行时那一半。 */
const BANNED = [
  '未接入', '暂未支持该功能', '24h 缓存', 'ClickHouse', '稳定度', '掌握度变化', '已连接', '未连接',
  '云端', '本地', 'FSRS', '以后再说', '稍后再改', '下次提醒', '宽限期', '截止日期',
  'passwordUpgradeDeadline', '忘记密码', '找回密码', '本期无法找回', '请用其他手机号注册',
  '用验证码登录', '旧进度无法迁移', '联系管理员', '请再按一次', '请求失败', '加载失败',
  '暂无数据', 'No data', '空空如也', 'Again', 'Hard', 'Good', 'Easy',
];

/* ═════════════════ 装配 ═════════════════ */

beforeEach(() => {
  localStorage.clear();
  resetApi();
  fetchCalls = [];
  speakSpy = vi.fn();
  toastSpy = vi.fn();
  signedIn = true;
  pointerCoarse = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('coarse') ? pointerCoarse : !pointerCoarse,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })),
  );
});

afterEach(() => {
  unmount();
  restoreOnLine?.();
  restoreOnLine = null;
  vi.unstubAllGlobals();
});

/* ═════════════════ R-12① 三模式入口（§3.5.1） ═════════════════ */

describe('S-01 R-12① 三入口命名固定 + §3.5.7 tablist', () => {
  it('三档逐字 = 今日复习 / 学新词 / 随机自测，顺序即 `QUEUE_MODES`，role 与选中态齐备', async () => {
    stubFetch();
    render('/study');
    await settle();
    const tabs = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid=study-modes] [role=tab]'),
    );
    expect(q('[data-testid=study-modes]')?.getAttribute('role')).toBe('tablist');
    expect(tabs.map((t) => (t.textContent ?? '').trim())).toEqual([
      MODE_LABELS.review,
      MODE_LABELS.new,
      MODE_LABELS.selfTest,
    ]);
    expect(tabs.map((t) => (t.textContent ?? '').trim())).toEqual(['今日复习', '学新词', '随机自测']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    /* §3.5.1:691 选中态必须同时有底色 + 字重（不仅靠颜色） */
    expect(tabs[0]?.className).toContain('bg-surface');
    expect(tabs[0]?.className).toContain('font-semibold');
    expect(tabs[1]?.className).not.toContain('bg-surface');
    /* §7.1 命中区的可机检等价量：真 `<button>` + `min-h-tap` + 不写正 tabindex */
    for (const tab of tabs) {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab.className).toContain('min-h-tap');
      expect(tab.getAttribute('tabindex')).toBeNull();
      expect(tab.getAttribute('aria-controls')).toBe('study-body');
    }
  });
});

describe('S-02 R-12① `?mode=` 是唯一真源', () => {
  it('非法值回落 review、点档即换地址、换档本轮重来（指针回第 1 张）', async () => {
    stubFetch();
    render('/study?mode=bogus');
    await settle();
    expect(state()).toBe('study-card');
    expect(studyModeOf('bogus')).toBe('review');
    expect(studyModeOf(undefined)).toBe('review');
    expect(studyModeOf('selfTest')).toBe('selfTest');
    expect(studyHref('new')).toBe('/study?mode=new');
    expect(container.textContent).toContain('第 1 张，共 3 张');

    await rate(3);
    expect(container.textContent).toContain('第 2 张，共 3 张');

    click(q<HTMLElement>('[data-mode-item=selfTest]'));
    await settle();
    expect(hash()).toBe('#/study?mode=selfTest');
    expect(container.textContent).toContain('第 1 张，共 3 张');
    /* 换档不污染上一档：自测档不发评分（评掉的那一条是复习档的） */
    expect(postCount('/api/review')).toBe(1);
  });
});

/* ═════════════════ R-12⑤ 词本为空 ═════════════════ */

describe('S-03~S-04 R-12⑤ 词本为空时「学新词」可见不可点', () => {
  it('词本空：`学新词` aria-disabled + 下方一行定稿串（队列空态下也在，F-1 最小修复）+ 点它不改地址', async () => {
    api.wordbook = [];
    api.queues.review = QUEUE('review', [], 0);
    stubFetch();
    render('/study');
    await settle();

    expect(state()).toBe('study-empty');
    const hint = q<HTMLElement>('[data-testid=study-new-disabled]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe('先去查几个词，再回来学新词');
    expect(hint?.className).toContain('text-warning');
    /* §3.5.1:693 那一行属 segmented ⇒ 必须在队列空态里也浮出（本轮的最小修复点） */
    const modes = q<HTMLElement>('[data-testid=study-modes]')!;
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('*')).indexOf(hint!) >
        Array.from(container.querySelectorAll<HTMLElement>('*')).indexOf(modes),
    ).toBe(true);

    const newTab = q<HTMLElement>('[data-mode-item=new]')!;
    expect(newTab.getAttribute('aria-disabled')).toBe('true');
    expect(newTab.className).toContain('text-ink-muted');
    click(newTab);
    await settle();
    expect(hash()).toBe('#/study');

    expect(q<HTMLElement>('[data-mode-item=review]')?.getAttribute('aria-disabled')).toBeNull();
    expect(q<HTMLElement>('[data-mode-item=selfTest]')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('S-04 词本非空：无禁用行、`学新词` 可点且首学卡（`hasCard=false`）照样能背', async () => {
    stubFetch();
    render('/study');
    await settle();
    expect(q('[data-testid=study-new-disabled]')).toBeNull();
    click(q<HTMLElement>('[data-mode-item=new]'));
    await settle();
    expect(hash()).toBe('#/study?mode=new');
    expect(state()).toBe('study-card');
    expect(container.textContent).toContain('第 1 张，共 2 张');
    expect(toStudyDeck(api.queues.new?.queue).every((c) => c.hasCard === false)).toBe(true);
  });
});

/* ═════════════════ R-12②③④⑥ ═════════════════ */

describe('S-05 R-12② 学新词单批量 ≤ 每日目标', () => {
  it('newBatchSize：目标小于默认值时取目标，默认值封顶，异常目标回默认', () => {
    expect(newBatchSize(20)).toBe(NEW_WORD_BATCH_DEFAULT);
    expect(newBatchSize(5)).toBe(5);
    expect(newBatchSize(NEW_WORD_BATCH_DEFAULT)).toBe(NEW_WORD_BATCH_DEFAULT);
    for (const goal of [0, -3, Number.NaN, 0.4]) {
      expect(newBatchSize(goal)).toBeGreaterThan(0);
      expect(newBatchSize(goal)).toBeLessThanOrEqual(NEW_WORD_BATCH_DEFAULT);
    }
    for (const goal of [1, 3, 5, 10, 20, 50, 1000]) {
      expect(newBatchSize(goal)).toBeLessThanOrEqual(goal);
    }
    /* 完成页按钮上的数字就是这个批量（R-12③ 的 `学 10 个新词`） */
    expect(STUDY_COPY.emptyQueue.review.primary(newBatchSize(20))).toBe('学 10 个新词');
  });
});

describe('S-06 R-12② 学新词不写卡', () => {
  it('new 档走完两张：`POST /api/review` = 0、撤销入口不出现、仍落完成页', async () => {
    stubFetch();
    render('/study?mode=new');
    await settle();
    await rate(3);
    await rate(4);
    expect(postCount('/api/review')).toBe(0);
    expect(api.written).toEqual([]);
    expect(q(`[aria-label="${UNDO_LABEL}"]`)).toBeNull();
    expect(hash().startsWith(`#${COMPLETION_PATH}?mode=new&cards=2&r1=0&r2=0&r3=1&r4=1&sec=`)).toBe(true);
  });
});

describe('S-09 R-12④ 随机自测不改任何卡的 due', () => {
  it('整轮 0 条评分/撤销请求，且复习档队列出参在缓存里原封不动（引用相等）', async () => {
    const reviewSnapshot = QUEUE('review', [CARD('happy'), CARD('apple')], 2);
    stubFetch();
    render('/study?mode=selfTest');
    client.setQueryData(reviewKeys.queue('review'), reviewSnapshot);
    const before = client.getQueryData(reviewKeys.queue('review'));
    await settle();

    expect(state()).toBe('study-card');
    for (const rating of [1, 2, 3] as RatingValue[]) await rate(rating);
    await settle(8);

    expect(postCount('/api/review')).toBe(0);
    expect(postCount('/api/review/undo')).toBe(0);
    expect(api.written).toEqual([]);
    /* 查询层出参断言：复习档那一份既没被改写也没被重取 ⇒ 它的 `due` 序列不可能被这一轮动过 */
    expect(client.getQueryData(reviewKeys.queue('review'))).toBe(before);
    expect(client.getQueryData(reviewKeys.queue('review'))).toEqual(reviewSnapshot);
    expect(hash().startsWith(`#${COMPLETION_PATH}?mode=selfTest&cards=3`)).toBe(true);
    expect(q(`[aria-label="${UNDO_LABEL}"]`)).toBeNull();
  });
});

describe('S-10 R-12①/§3.5.1 自测说明只在该模式第一次进入时出现', () => {
  it('第一次一行、第二次不出现（台账在 kv）；另两档永不出现', async () => {
    stubFetch();
    render('/study?mode=selfTest');
    await settle();
    expect(q('[data-testid=study-mode-notice]')?.textContent).toBe('随机自测不会改动你的复习计划');
    expect(JSON.parse(localStorage.getItem(NOTICE_KEY) ?? '[]')).toContain('selfTest');

    unmount();
    render('/study?mode=selfTest');
    await settle();
    expect(q('[data-testid=study-mode-notice]')).toBeNull();

    const kv: UiHost['kv'] = {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
    };
    expect(hasSeenNotice(kv, 'review')).toBe(false);
    markNoticeSeen(kv, 'review');
    markNoticeSeen(kv, 'review');
    expect(hasSeenNotice(kv, 'review')).toBe(true);
    expect(JSON.parse(localStorage.getItem(NOTICE_KEY) ?? '[]')).toEqual(['selfTest', 'review']);
  });
});

describe('S-07~S-08 R-12③⑥ 队列空不是死路', () => {
  it('复习档空：定稿标题/副行 + `学 10 个新词`(主) + `去查词`(次)，一次点击即开始学新词', async () => {
    api.queues.review = QUEUE('review', [], 0);
    stubFetch();
    render('/study');
    await settle();

    expect(text('[data-testid=study-empty-review]')).toContain('今天的复习清空了');
    expect(text('[data-testid=study-empty-review]')).toContain('明天会再来一批，或者现在多学几个新词');
    expect(container.textContent).not.toMatch(/空空如也/);
    const primary = byText('[data-testid=study-empty-review]', '学 10 个新词');
    const secondary = byText('[data-testid=study-empty-review]', '去查词');
    expect(primary?.tagName).toBe('BUTTON');
    expect(secondary?.tagName).toBe('BUTTON');
    /* §3.5.6:756 那颗是"成功"语气（40px ✔），不是警告 */
    expect(q('[data-testid=study-empty-review] svg')?.getAttribute('class')).toContain('text-success');

    /* R-12⑥：从这个页面到"开始背第一个新词"= 1 次点击（判据要求 ≤3 次） */
    click(primary);
    await settle();
    expect(hash()).toBe('#/study?mode=new');
    expect(state()).toBe('study-card');
    expect(container.textContent).toContain('第 1 张，共 2 张');
  });

  it('S-08 另两种无可学：new / selfTest 的定稿文案与 `去查词` 出口', async () => {
    api.queues.new = QUEUE('new', []);
    api.queues.selfTest = QUEUE('selfTest', []);
    stubFetch();
    render('/study?mode=new');
    await settle();
    expect(text('[data-testid=study-empty-new]')).toContain('词本里的词都在背了');
    expect(text('[data-testid=study-empty-new]')).toContain('去查几个新词加进来，就能开新一轮');
    click(byText('[data-testid=study-empty-new]', '去查词'));
    expect(hash()).toBe('#/');

    unmount();
    render('/study?mode=selfTest');
    await settle();
    expect(text('[data-testid=study-empty-selfTest]')).toContain('词还不够，先攒几个');
    expect(text('[data-testid=study-empty-selfTest]')).toContain('自测要从你的单词本里抽词，至少要有 5 个');
    expect(byText('[data-testid=study-empty-selfTest]', '去查词')?.tagName).toBe('BUTTON');
  });
});

/* ═════════════════ R-11①② 卡面 / 四档 / 滑动 ═════════════════ */

describe('S-11~S-12 R-11① 四档同源 + 触屏提示语', () => {
  it('四档顺序与标签 = 同一份常量、同权重无主推实心档；触屏只出现触屏串，键盘串留给 fine 指针', async () => {
    stubFetch();
    render('/study');
    await settle();
    expect(container.textContent).toContain('点一下看释义');
    flip();

    const group = q<HTMLElement>('[data-testid=study-rating]')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe(PLAIN_TERMS.retention);
    expect(group.getAttribute('aria-label')).toBe('记住程度');
    for (const rating of RATING_VALUES) {
      const label = RATING_LABELS[rating];
      const btn = rateButton(rating)!;
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-label')).toBe(label);
      expect(btn.className).toContain('min-h-tap');
      expect(btn.className).toContain('-soft');
      /* §3.5.4 必删项：App 端不得有 `.primary-rate` 式实心主推（一端高亮即违两端一致） */
      expect(btn.className).not.toMatch(/primary-rate|!important/);
    }
    const tones = RATING_VALUES.map((r) => rateButton(r)!.className);
    expect(new Set(tones).size).toBe(4);

    /* R-11① 触屏显示滑动串、不显示键盘串 */
    expect(container.textContent).toContain('点卡片翻面 · 左滑忘记 右滑轻松');
    expect(container.textContent).not.toContain('空格 翻面 · ← 忘记 · → 轻松');

    unmount();
    pointerCoarse = false;
    render('/study');
    await settle();
    expect(container.textContent).toContain('空格 翻面 · ← 忘记 · → 轻松');
    expect(container.textContent).not.toContain('点卡片翻面 · 左滑忘记 右滑轻松');
    /* §3.5.2:703 正面那行小字只属触屏 ⇒ fine 指针下不出现 */
    expect(text('[data-testid=study-card]')).not.toContain('点一下看释义');
  });

  it('S-12 评分成功后可访问名补"下次 …"，间隔换算自回参 `due`（解析不出来就当没有，绝不编数）', async () => {
    stubFetch();
    render('/study');
    await settle();
    expect(rateButton(3)?.getAttribute('aria-label')).toBe('良好');
    await rate(3);
    expect(rateButton(3)?.getAttribute('aria-label')).toBe('良好，下次 4 天后');
    expect(minutesUntil('2026-01-05T00:00:00.000Z', Date.parse('2026-01-01T00:00:00.000Z'))).toBe(5760);
    expect(minutesUntil('not-a-date', 0)).toBeNull();
  });
});

describe('S-13~S-14 R-11② 滑动提交', () => {
  it('达阈值松手 = 一条评分：左滑 1 忘记、右滑 4 轻松', async () => {
    stubFetch();
    render('/study');
    await settle();
    flip();
    swipe(-(SUBMIT_PX + 20));
    await settle();
    expect(postCount('/api/review')).toBe(1);
    expect(callsTo('/api/review')[0]?.body).toEqual({ word: 'happy', rating: 1 });

    flip();
    swipe(SUBMIT_PX + 20);
    await settle();
    expect(postCount('/api/review')).toBe(2);
    expect(callsTo('/api/review')[1]?.body).toEqual({ word: 'apple', rating: 4 });
  });

  it('胶囊 24px 起出现但不计分；滑回 <24px 取消；纵向位移判为滚动（误提交用例：评分计数不变）', async () => {
    stubFetch();
    render('/study');
    await settle();
    flip();
    const card = q<HTMLElement>('[data-testid=study-card]')!;

    const first = dragLayer();
    pointer(first, 'pointerdown', 300, 200);
    pointer(first, 'pointermove', 300 - (PILL_PX + 12), 200);
    expect(card.textContent).toContain('忘记');
    pointer(first, 'pointerup', 300 - (PILL_PX + 12), 200);
    await settle();
    expect(postCount('/api/review')).toBe(0);
    expect(container.textContent).toContain('第 1 张，共 3 张');

    const second = dragLayer();
    pointer(second, 'pointerdown', 300, 200);
    pointer(second, 'pointermove', 300 - (SUBMIT_PX + 10), 200);
    pointer(second, 'pointermove', 300 - 8, 200);
    pointer(second, 'pointerup', 300 - 8, 200);
    await settle();
    expect(postCount('/api/review')).toBe(0);

    /* 纵向位移判为滚动 = 手势作废（`Flashcard.tsx:140-141`：|dy|>12 **且** |dy|>|dx| 才判 y 轴）。
       这里横向 40px 已越过 24px 胶囊线，但只要伴随 120px 纵向就**不许**计分（背长例句时上下滑动的误提交）。 */
    const third = dragLayer();
    pointer(third, 'pointerdown', 300, 200);
    pointer(third, 'pointermove', 300 + 40, 200 + 120);
    expect(dragLayer().getAttribute('style')).toContain('translateX(0px)');
    pointer(third, 'pointerup', 300 + 40, 200 + 120);
    await settle();
    expect(postCount('/api/review')).toBe(0);
    expect(container.textContent).toContain('第 1 张，共 3 张');
    /* 正面不许有横滑提交（`swipeOn` 只在背面成立） */
    unmount();
    render('/study');
    await settle();
    expect(dragLayer().className).not.toContain('touch-pan-y');
  });
});

/* ═════════════════ R-11③④⑤ 撤销与失败 ═════════════════ */

describe('S-15~S-18 R-11③④⑤⑥ 撤销窗口与失败面', () => {
  it('评分后可撤销：toast 给撤销入口 + 卡顶 `撤销上一条评分`；撤销后指针回退 1、本轮计数回退', async () => {
    stubFetch();
    render('/study');
    await settle();
    await rate(3);

    expect(toastSpy).toHaveBeenCalledWith('已记下：良好', expect.objectContaining({ tone: 'info' }));
    expect(lastToastOptions().action?.label).toBe(VERBS.undo);
    const undoBtn = q<HTMLElement>(`[data-testid=study-card] [aria-label="${UNDO_LABEL}"]`);
    expect(undoBtn?.tagName).toBe('BUTTON');
    expect(container.textContent).toContain('第 2 张，共 3 张');

    click(undoBtn);
    await settle();
    expect(postCount('/api/review/undo')).toBe(1);
    expect(callsTo('/api/review/undo')[0]?.body).toEqual({ word: 'happy' });
    expect(container.textContent).toContain('第 1 张，共 3 张');
    expect(toastSpy).toHaveBeenLastCalledWith('已撤销，回到第 1 张', expect.objectContaining({ tone: 'info' }));

    /* 计数回退 ⇒ 三张评完后完成页仍是 3 张（撤销不留下双计的痕迹） */
    await rate(3);
    await rate(3);
    await rate(3);
    expect(postCount('/api/review')).toBe(4);
    expect(parseSummaryQuery(queryOf(hash())).cards).toBe(3);
  });

  it('S-16 生命周期明确：剩余次数归 0 即消失；`undoAvailable` 是唯一判定点（含"再评满 3 张后消失"）', async () => {
    api.undoRemaining = 0;
    stubFetch();
    render('/study');
    await settle();
    await rate(3);
    expect(q(`[aria-label="${UNDO_LABEL}"]`)).not.toBeNull();
    click(q<HTMLElement>(`[data-testid=study-card] [aria-label="${UNDO_LABEL}"]`));
    await settle();
    expect(q(`[aria-label="${UNDO_LABEL}"]`)).toBeNull();
    expect(container.textContent).toContain('第 1 张，共 3 张');

    const anchor = { word: 'happy', anchor: 0 };
    expect(undoAvailable('review', null, 1, 2)).toBe(false);
    expect(undoAvailable('review', anchor, 0, 2)).toBe(false);
    expect(undoAvailable('review', anchor, 1, 2)).toBe(true);
    expect(undoAvailable('review', anchor, UNDO_MAX_PER_SESSION, 1)).toBe(true);
    expect(undoAvailable('review', anchor, UNDO_MAX_PER_SESSION + 1, 3)).toBe(false);
    expect(undoAvailable('review', anchor, 1, 0)).toBe(false);
    for (const mode of ['new', 'selfTest'] as QueueMode[]) {
      expect(undoAvailable(mode, anchor, 1, UNDO_MAX_PER_SESSION)).toBe(false);
    }
    /* 同一轮内连续撤销 ≤3 次的上限唯一真相就是这份常量 */
    expect(UNDO_MAX_PER_SESSION).toBe(3);
  });

  it('S-17 撤销失败：人话提示 + 可点重试，指针不动、卡面不停留成"已评分"', async () => {
    api.undo = 'fail';
    stubFetch();
    render('/study');
    await settle();
    await rate(3);
    click(q<HTMLElement>(`[data-testid=study-card] [aria-label="${UNDO_LABEL}"]`));
    await settle();
    expect(toastSpy).toHaveBeenLastCalledWith(
      '撤销没成功，进度还是刚才那条 · 再试一次',
      expect.objectContaining({ tone: 'error' }),
    );
    expect(lastToastOptions().action?.label).toBe(VERBS.retry);
    expect(container.textContent).toContain('第 2 张，共 3 张');
    expect(rateButton(1)?.getAttribute('aria-disabled')).not.toBe('true');
    expect(rateButton(4)?.getAttribute('aria-disabled')).not.toBe('true');

    api.undo = 'ok';
    act(() => lastToastOptions().action?.onClick());
    await settle();
    expect(container.textContent).toContain('第 1 张，共 3 张');
    expect(toastSpy).toHaveBeenLastCalledWith('已撤销，回到第 1 张', expect.objectContaining({ tone: 'info' }));
  });

  it('S-18 评分失败：指针/计数/撤销窗口一起退回提交前，重试补发不双计（R-11⑤）', async () => {
    api.rate = 'fail';
    stubFetch();
    render('/study');
    await settle();
    await rate(3);
    expect(postCount('/api/review')).toBe(1);
    expect(toastSpy).toHaveBeenLastCalledWith(
      '评分没保存 · 再试一次',
      expect.objectContaining({ tone: 'error' }),
    );
    expect(lastToastOptions().action?.label).toBe(VERBS.retry);
    expect(container.textContent).toContain('第 1 张，共 3 张');
    expect(q(`[aria-label="${UNDO_LABEL}"]`)).toBeNull();

    api.rate = 'ok';
    act(() => lastToastOptions().action?.onClick());
    await settle();
    expect(postCount('/api/review')).toBe(2);
    await rate(3);
    await rate(3);
    const summary = parseSummaryQuery(queryOf(hash()));
    expect(summary.cards).toBe(3);
    expect(summary.counts[3]).toBe(3);
  });
});

/* ═════════════════ R-13①②（页面侧） ═════════════════ */

describe('S-19~S-20 R-13①② 走完最后一张 = 落完成页', () => {
  it('三张评完 → 地址带走本轮数字；此后不再产生任何评分记录，也不归 0 回第一张', async () => {
    stubFetch();
    render('/study');
    await settle();
    await rate(3);
    await rate(3);
    await rate(3);
    expect(postCount('/api/review')).toBe(3);
    expect(hash().startsWith(`#${COMPLETION_PATH}?mode=review&cards=3&r1=0&r2=0&r3=3&r4=0&sec=`)).toBe(true);
    expect(container.textContent).not.toContain('第 1 张，共 3 张');
    expect(parseSummaryQuery(queryOf(hash()))).toMatchObject({ mode: 'review', cards: 3, counts: { 3: 3 } });
    await settle(8);
    expect(postCount('/api/review')).toBe(3);
    expect(postCount('/api/review/undo')).toBe(0);
  });

  it('S-20 completionHref ↔ parseSummaryQuery 往返一致；异常数字收敛为 0 且地址里不出现 NaN/Infinity', () => {
    const href = completionHref({ mode: 'selfTest', cards: 12, counts: { 1: 2, 2: 1, 3: 6, 4: 3 }, seconds: 252 });
    expect(href.split('?')[0]).toBe(COMPLETION_PATH);
    expect(parseSummaryQuery(queryOf(`#${href}`))).toEqual({
      mode: 'selfTest',
      cards: 12,
      counts: { 1: 2, 2: 1, 3: 6, 4: 3 },
      seconds: 252,
    });
    const messy = completionHref({
      mode: 'new',
      cards: -5.7,
      counts: { 2: Number.NaN, 4: 1.9 },
      seconds: Number.POSITIVE_INFINITY,
    });
    expect(messy).not.toMatch(/NaN|Infinity|undefined/);
    /* `clamped()`（`StudyScreen.tsx:193-194`）向下取整 + 负数归 0 ⇒ 1.9 只能记成 1，绝不四舍五入成 2。 */
    expect(messy).toContain('r4=1');
    expect(messy).toContain('cards=0');
    expect(parseSummaryQuery(queryOf(`#${messy}`))).toEqual({
      mode: 'new',
      cards: 0,
      counts: { 4: 1 },
      seconds: 0,
    });
    expect(parseSummaryQuery(queryOf(`#${COMPLETION_PATH}?mode=nope`))).toEqual({
      mode: 'review',
      cards: 0,
      counts: {},
      seconds: 0,
    });
  });
});

/* ═════════════════ §3.5.6 状态表 ═════════════════ */

describe('S-21~S-24 §3.5.6 加载 / 失败 / 离线 / 未登录', () => {
  it('队列 ≥300ms 才出骨架，骨架不带文字（§3.5.6 加载行）', async () => {
    api.hangQueue = true;
    stubFetch();
    render('/study');
    await settle();
    expect(state()).toBe('study-loading');
    expect(q('[data-testid=study-skeleton]')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 340));
    });
    expect(q('[data-testid=study-skeleton]')).not.toBeNull();
    expect(q('[data-testid=study-card-skeleton]')).not.toBeNull();
    expect(q('[data-testid=study-rating-skeleton]')).not.toBeNull();
    expect(text('[data-testid=study-skeleton]')).toBe('');
  });

  it('取队失败 = 定稿文案 + `重试`(主) + `去查词`(次)；HTTP 500 不挂离线条', async () => {
    api.queue = 'fail';
    stubFetch();
    render('/study');
    await settle();
    expect(state()).toBe('study-fetch-fail');
    expect(text('[data-testid=study-fetch-fail]')).toContain('今天没能取到词单');
    expect(text('[data-testid=study-fetch-fail]')).toContain('可能是网络的事，再试一次');
    expect(byText('[data-testid=study-fetch-fail]', '重试')?.tagName).toBe('BUTTON');
    expect(byText('[data-testid=study-fetch-fail]', '去查词')?.tagName).toBe('BUTTON');
    expect(q('[data-testid=study-offline-banner]')).toBeNull();
    expect(isNetworkFailure(null)).toBe(false);

    api.queue = 'ok';
    const before = fetchCalls.length;
    click(byText('[data-testid=study-fetch-fail]', '重试'));
    await settle();
    expect(fetchCalls.length).toBeGreaterThan(before);
    expect(state()).toBe('study-card');
  });

  it('S-23 网络类失败：顶部一条离线串（人话，不是"加载失败"）；`navigator.onLine=false` 时页面继续可背', async () => {
    api.queue = 'throw';
    stubFetch();
    render('/study');
    await settle();
    expect(q('[data-testid=study-offline-banner]')?.textContent).toBe(
      '现在没有网络，背词进度会先记在手机上，联网后自动同步',
    );
    expect(state()).toBe('study-fetch-fail');

    unmount();
    api.queue = 'ok';
    forceOnLine(false);
    render('/study');
    await settle();
    expect(q('[data-testid=study-offline-banner]')).not.toBeNull();
    expect(state()).toBe('study-card');
    expect(container.textContent).toContain('第 1 张，共 3 张');
  });

  it('S-24 未登录：0 条业务请求 + 登录墙两颗出口（不是死路文案）', async () => {
    signedIn = false;
    stubFetch();
    render('/study');
    await settle();
    expect(state()).toBe('study-signed-out');
    expect(fetchCalls).toEqual([]);
    expect(text('[data-testid=study-signed-out]')).toContain(AUTH_COPY.wall.title);
    expect(byText('[data-testid=study-signed-out]', AUTH_COPY.wall.primary)?.tagName).toBe('BUTTON');
    expect(byText('[data-testid=study-signed-out]', AUTH_COPY.wall.link)?.tagName).toBe('BUTTON');
    click(byText('[data-testid=study-signed-out]', AUTH_COPY.wall.primary));
    expect(hash()).toBe('#/login?from=study');
    click(byText('[data-testid=study-signed-out]', AUTH_COPY.wall.link));
    expect(hash()).toBe('#/register?from=study'); // E5：「注册」落第 12 条 gate，`?mode=` 死参已清
  });
});

/* ═════════════════ R-13⑥（可机检的那半）+ §3.5.7 进度条 ═════════════════ */

describe('S-25 R-13⑥ 待背数三处同源（本页这一处）', () => {
  it('队列出参 `dueToday` 写进 startup store（tab 红点读的那一份），进度条与计数器同一时刻相等', async () => {
    api.queues.review = QUEUE('review', [CARD('happy'), CARD('apple'), CARD('glad')], 42);
    stubFetch();
    render('/study');
    await settle();
    expect(getSyncStatus().dueCount).toBe(42);
    const bar = q<HTMLElement>('[data-testid=study-card] [role=progressbar]');
    expect(bar).not.toBeNull();
    /* 「今天 3/20」这一处只走 `aria-valuetext`（`StudyScreen.tsx:705` 把 `todayCounter` 交给进度条），
       可见文本是 `第 1 张，共 3 张` ⇒ 同一份 `badge.doneToday/dailyGoal` 在 valuetext 与填充长度上核相等，
       而不是核 `textContent`（那是上一轮我自己写错的期望面）。 */
    expect(bar?.getAttribute('aria-valuetext')).toBe(STUDY_COPY.todayCounter(3, 20));
    /* 同一个 `badge.doneToday/dailyGoal` 驱动的两处必须同一时刻相等：可见的填充长度 = 15% ⇒ `translateX(-85%)`。
       （`aria-valuenow` 这一项当前**不存在** ⇒ 见报告 F-4 越界申请：`packages/ui/src/primitives/progress.tsx`
       把 `value` 解构出来只喂指示器、没转发给 `ProgressPrimitive.Root`，Radix 便不发 `aria-valuenow`。） */
    const indicator = bar?.querySelector<HTMLElement>('div[style*="translateX"]');
    expect(indicator?.getAttribute('style')).toContain('translateX(-85%)');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar?.getAttribute('aria-label')).toContain('第 1 张，共 3 张');
    /* §3.5.7：切卡要播报 */
    expect(q('[data-testid=study-body]')?.getAttribute('aria-live')).toBe('polite');
  });
});

/* ═════════════════ §3.5.5 无释义跳过态 + 每日目标询问 ═════════════════ */

describe('S-26 R-14④ + I-05 无释义：预取让首次翻面即出释义 / 查不到的重试不再静默 / 跳过不计分', () => {
  it('装配即预取（每词 1 条 lookup）⇒ 前两张首次翻面直出释义；第三张上游查不到走 noGloss+重试（有反馈、重试必发 1 条真请求）+跳过台账', async () => {
    api.queues.review = QUEUE('review', [
      CARD('happy', ''),
      CARD('apple', ''),
      CARD('glad', ''),
    ]);
    api.lookupMiss = new Set(['glad']);
    stubFetch();
    render('/study');
    await settle();
    /* 装配后预取第 0、1 张：恰 2 条 GET，一词一条。 */
    expect(
      callsTo('/api/lookup').map((c) => new URL(c.url).searchParams.get('word')),
    ).toEqual(['happy', 'apple']);

    flip();
    expect(text('[data-testid=study-card]')).toContain('快乐的');
    expect(text('[data-testid=study-card]')).not.toContain('这个词暂无释义');
    expect(byText('[data-testid=study-card]', '重试')).toBeNull();
    expect(byText('[data-testid=study-card]', '今天先跳过')).toBeNull();

    await rate(3);
    /* index=1 的窗口 = apple（缓存命中 0 重发）+ glad（1 条新请求，回空释义）。 */
    await settle();
    expect(callsTo('/api/lookup')).toHaveLength(3);

    flip();
    expect(text('[data-testid=study-card]')).toContain('apple 的释义');

    await rate(3);
    await settle();
    /* index=2 的窗口 = glad（已缓存空结果）⇒ 不再发第 4 条。 */
    expect(callsTo('/api/lookup')).toHaveLength(3);

    flip();
    expect(text('[data-testid=study-card]')).toContain('这个词暂无释义');
    expect(byText('[data-testid=study-card]', '重试')?.tagName).toBe('BUTTON');
    expect(byText('[data-testid=study-card]', '今天先跳过')?.tagName).toBe('BUTTON');

    /* I-05 修复回环：`重试` 是用户显式动作 ⇒ 必发 1 条真请求（不再被空译文的 staleTime 缓存短路），
     * 而真空手仍回空 ⇒ 卡面保持既有 noGloss 态 + 可辨识反馈。 */
    const beforeRetry = callsTo('/api/lookup');
    click(byText('[data-testid=study-card]', '重试'));
    await settle();
    expect(text('[data-testid=study-card]')).toContain('这个词暂无释义');
    expect(toastSpy).toHaveBeenLastCalledWith(
      '这个词暂无释义',
      expect.objectContaining({ tone: 'error' }),
    );
    expect(lastToastOptions().action?.label).toBe(VERBS.retry);
    const afterRetry = callsTo('/api/lookup');
    expect(afterRetry).toHaveLength(beforeRetry.length + 1);
    const retryCall = afterRetry[afterRetry.length - 1];
    expect(retryCall?.method).toBe('GET');
    expect(new URL(String(retryCall?.url)).searchParams.get('word')).toBe('glad');

    click(byText('[data-testid=study-card]', '今天先跳过'));
    await settle();
    expect(postCount('/api/review')).toBe(2);
    expect(toastSpy).toHaveBeenLastCalledWith('这个词今天跳过了', expect.objectContaining({ tone: 'info' }));
    const kv: UiHost['kv'] = {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
    };
    expect(readSkipped(kv)).toEqual(['glad']);
    /* 跳过不写卡、不计入张数 ⇒ 完成页只算评过的 2 张 */
    expect(hash().startsWith(`#${COMPLETION_PATH}?mode=review&cards=2&r1=0&r2=0&r3=2&r4=0`)).toBe(true);
  });

  it('跳过台账：同词不重复、空词忽略、坏 JSON 当空（R-14④ 只记台账不炸页）', () => {
    const kv: UiHost['kv'] = {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
    };
    localStorage.setItem(SKIPPED_KEY, '{ 坏值');
    expect(readSkipped(kv)).toEqual([]);
    pushSkipped(kv, '  HaPpY ');
    pushSkipped(kv, 'happy');
    pushSkipped(kv, '   ');
    expect(readSkipped(kv)).toEqual(['happy']);
    expect(SKIPPED_KEY).toBe('tm.study.skipped');
  });
});

/* ═════════════════ I-05 判据 1/2：首次翻面即出释义 5/5 + 请求计数 ═════════════════ */

describe('I-05 预取：连续 5 张首次翻面即出释义、零「重试」；同词不重复请求', () => {
  const FIVE = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  it('5 张空 gloss 卡（假 lookup 带 20ms 延迟）⇒ 逐张翻面首刷即见释义，命中 5/5、重试按钮 0 次、lookup 恰 5 条', async () => {
    api.queues.review = QUEUE('review', FIVE.map((w) => CARD(w, '')));
    api.lookupDelayMs = 20;
    stubFetch();
    render('/study');
    await settle();

    let firstFlipHits = 0;
    for (let i = 0; i < FIVE.length; i += 1) {
      flip();
      const face = text('[data-testid=study-card]');
      if (face.includes(`${FIVE[i] ?? ''} 的释义`) && !face.includes('这个词暂无释义')) firstFlipHits += 1;
      /* 零「重试」：卡面不存在无释义态的两块出口。 */
      expect(byText('[data-testid=study-card]', '重试')).toBeNull();
      expect(byText('[data-testid=study-card]', '今天先跳过')).toBeNull();
      if (i < FIVE.length - 1) {
        await rate(3);
        await settle();
      }
    }
    expect(firstFlipHits).toBe(5);
    /* 判据 2：每词恰 1 条 GET（窗口重叠靠缓存去重），5 < 30/分钟限流。 */
    const lookups = callsTo('/api/lookup');
    expect(lookups).toHaveLength(5);
    expect(lookups.map((c) => new URL(c.url).searchParams.get('word'))).toEqual(FIVE);
    expect(lookups.every((c) => c.method === 'GET')).toBe(true);
  });

  it('同词在队列里两现也只发一次：牌组去重 + React Query 缓存双保险', async () => {
    api.queues.review = QUEUE('review', [CARD('alpha', ''), CARD('alpha', ''), CARD('bravo', '')]);
    stubFetch();
    render('/study');
    await settle();
    flip();
    expect(text('[data-testid=study-card]')).toContain('alpha 的释义');
    await rate(3);
    await settle();
    flip();
    expect(text('[data-testid=study-card]')).toContain('bravo 的释义');
    expect(callsTo('/api/lookup')).toHaveLength(2);
  });
});

/* ═════════ I-05 修复回环（第二轮）：显式「重试」必发 1 条真请求 ═════════ */

describe('I-05 修复回环：空译文被 staleTime 缓存住时，`重试` 仍必发真请求', () => {
  it('判据 1：瞬时空手（首条回空、重试那条回真释义）⇒ 点「重试」网络 +1 条，卡面立即出释义', async () => {
    api.queues.review = QUEUE('review', [CARD('happy', ''), CARD('glad', '')]);
    api.lookupMissOnce = new Set(['glad']);
    stubFetch();
    render('/study');
    await settle();
    /* 装配预取窗口 = happy + glad：2 条，glad 首条回空（空结果进缓存）。 */
    expect(callsTo('/api/lookup').map((c) => new URL(c.url).searchParams.get('word'))).toEqual([
      'happy',
      'glad',
    ]);
    flip();
    expect(text('[data-testid=study-card]')).toContain('快乐的');
    await rate(3);
    await settle();
    /* index=1 的窗口仍是缓存里的 glad ⇒ 预取侧 0 重发（去重语义不变）。 */
    expect(callsTo('/api/lookup')).toHaveLength(2);
    flip();
    expect(text('[data-testid=study-card]')).toContain('这个词暂无释义');

    click(byText('[data-testid=study-card]', '重试'));
    await settle();
    /* 这一条就是本轮的修：缓存里那条空译文虽然还"新鲜"，重试必须真发第 3 条。 */
    const lookups = callsTo('/api/lookup');
    expect(lookups).toHaveLength(3);
    expect(lookups[2]?.method).toBe('GET');
    expect(new URL(String(lookups[2]?.url)).searchParams.get('word')).toBe('glad');
    expect(api.lookupCalls.get('glad')).toBe(2);
    /* 第二次给真释义 ⇒ 卡面立即出释义，noGloss 态整块退场。 */
    const face = text('[data-testid=study-card]');
    expect(face).toContain('glad 的释义');
    expect(face).not.toContain('这个词暂无释义');
    expect(byText('[data-testid=study-card]', '重试')).toBeNull();
  });

  it('判据 2：预取去重不回归——3 词预取恰 3 条（同词两进窗口 0 重发）+ 2 次重试 = 5 条', async () => {
    api.queues.review = QUEUE('review', [CARD('alpha', ''), CARD('bravo', ''), CARD('charlie', '')]);
    api.lookupMissOnce = new Set(['bravo', 'charlie']);
    stubFetch();
    render('/study');
    await settle();
    expect(callsTo('/api/lookup').map((c) => new URL(c.url).searchParams.get('word'))).toEqual([
      'alpha',
      'bravo',
    ]);
    flip();
    expect(text('[data-testid=study-card]')).toContain('alpha 的释义');

    await rate(3);
    await settle();
    /* bravo 已在缓存（空译文也算新鲜）⇒ 只有 charlie 发第 3 条。 */
    expect(callsTo('/api/lookup').map((c) => new URL(c.url).searchParams.get('word'))).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
    flip();
    expect(text('[data-testid=study-card]')).toContain('这个词暂无释义');
    click(byText('[data-testid=study-card]', '重试'));
    await settle();
    expect(text('[data-testid=study-card]')).toContain('bravo 的释义');

    await rate(3);
    await settle();
    /* charlie 二次进窗口（index=1 时已取过）⇒ 预取侧 0 重发，总数仍是 4（重试那条除外）。 */
    expect(callsTo('/api/lookup')).toHaveLength(4);
    flip();
    click(byText('[data-testid=study-card]', '重试'));
    await settle();
    const words = callsTo('/api/lookup').map((c) => new URL(c.url).searchParams.get('word'));
    expect(words).toEqual(['alpha', 'bravo', 'charlie', 'bravo', 'charlie']);
    expect(text('[data-testid=study-card]')).toContain('charlie 的释义');
    /* 全程只 GET，无写请求。 */
    expect(callsTo('/api/lookup').every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('S-29 §3.5.5 末段 达到每日目标 = 二选一，无第三种出口', () => {
  it('达标弹询问卡：标题/正文两颗按钮逐字，卡内只有这两颗可点（无遮罩关闭、无"稍后"）', async () => {
    api.checkinStatus = { checkedIn: false, streak: 37, dailyGoal: 2, doneToday: 2 };
    stubFetch();
    render('/study');
    await settle();
    await rate(3);

    const sheet = document.body.querySelector<HTMLElement>('[data-testid=goal-ask-sheet]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain('今天 2 个词的目标完成了');
    expect(sheet?.textContent).toContain('再多背一点，或者明天继续 —— 你已经连续 37 天了');
    expect(buttons('[data-testid=goal-ask-sheet]')).toHaveLength(2);
    expect(byText('[data-testid=goal-ask-sheet]', '再背一批')?.tagName).toBe('BUTTON');
    expect(byText('[data-testid=goal-ask-sheet]', '今天就到这')?.tagName).toBe('BUTTON');

    click(byText('[data-testid=goal-ask-sheet]', '再背一批'));
    await settle();
    /* `再背一批` = 换一批继续，不跳页、不把本轮数字塞给完成页 */
    expect(hash()).toBe('#/study');
    expect(container.textContent).toContain('第 1 张，共 3 张');
    expect(shouldAskGoal(2, 0)).toBe(false);
    expect(shouldAskGoal(0, 20)).toBe(false);
    expect(shouldAskGoal(20, 20)).toBe(true);
    expect(shouldAskGoal(21, 20, true)).toBe(false);
  });

  it('`今天就到这` = 直接落完成页，带走本轮已评数字（不打卡、不断签）', async () => {
    api.checkinStatus = { checkedIn: false, streak: 37, dailyGoal: 1, doneToday: 1 };
    stubFetch();
    render('/study');
    await settle();
    await rate(2);
    expect(document.body.querySelector('[data-testid=goal-ask-sheet]')).not.toBeNull();
    click(byText('[data-testid=goal-ask-sheet]', '今天就到这'));
    await settle();
    expect(hash().startsWith(`#${COMPLETION_PATH}?mode=review&cards=1&r1=0&r2=1&r3=0&r4=0`)).toBe(true);
    expect(postCount('/api/checkin')).toBe(0);
  });
});

/* ═════════════════ §3.5.7 键盘顺序 + 源码级哨兵 ═════════════════ */

describe('S-27~S-30 §3.5.7 / §6.6 / §5.1 源码级与运行时哨兵', () => {
  it('S-27 四个交付文件不用 Chrome84 之后的 API', () => {
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/structuredClone\s*\(/);
      expect(source.code, source.path).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
      expect(source.code, source.path).not.toMatch(/requestIdleCallback/);
      expect(source.code, source.path).not.toMatch(/\.at\s*\(/);
    }
  });

  it('S-28 §6.6 禁词在"用户可见串"里 0 命中', () => {
    for (const source of SOURCES) {
      for (const banned of BANNED) {
        expect(source.copy, `${source.path} 含禁词 ${banned}`).not.toContain(banned);
      }
    }
  });

  it('S-28b 四种状态各渲一次：渲染文本里不出现 undefined / NaN / 死路文案', async () => {
    stubFetch();
    const seen: string[] = [];
    for (const path of ['/study', '/study?mode=new', '/study?mode=selfTest']) {
      render(path);
      await settle();
      seen.push(container.textContent ?? '');
      flip();
      seen.push(container.textContent ?? '');
      await rate(3);
      seen.push(container.textContent ?? '');
      unmount();
    }
    api.queues.review = QUEUE('review', [], 0);
    api.wordbook = [];
    render('/study');
    await settle();
    seen.push(container.textContent ?? '');
    unmount();
    render('/study?mode=bogus');
    await settle();
    seen.push(container.textContent ?? '');

    const all = seen.join('\n');
    expect(all).not.toMatch(/undefined|NaN|null|空空如也|FSRS|云端|本地|加载失败|请求失败|暂无数据/);
  });

  it('S-30 §3.5.7 Tab 序 = DOM 序（无正 tabindex）：模式切换 → 卡（翻面）→ 四档', async () => {
    stubFetch();
    render('/study');
    await settle();
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>('button, a[href], [tabindex]'),
    );
    for (const el of focusables) {
      const raw = el.getAttribute('tabindex');
      expect(raw === null || Number(raw) <= 0, el.dataset.testid ?? el.tagName).toBe(true);
    }
    /* 四档必须可键盘到达（现状只能鼠标点的那条），所以它们是真正的 `<button>` */
    for (const rating of RATING_VALUES) {
      expect(rateButton(rating)?.tagName).toBe('BUTTON');
    }
    const after = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ===
      Node.DOCUMENT_POSITION_FOLLOWING;
    const tablist = q<HTMLElement>('[data-testid=study-modes]')!;
    const flipButton = q<HTMLElement>(`[aria-label="${STUDY_COPY.cardFaceHint}"]`)!;
    const group = q<HTMLElement>('[data-testid=study-rating]')!;
    expect(after(tablist, flipButton)).toBe(true);
    expect(after(flipButton, group)).toBe(true);
  });
});
