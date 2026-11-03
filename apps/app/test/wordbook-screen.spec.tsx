/**
 * T-18b 判据自证（App 单词本一级页 `#/wordbook`）—— `apps/app/test/wordbook-screen.spec.tsx`。
 *
 * 覆盖 PRD R-15 ①②③④⑤⑥⑦⑧⑨（App 侧）+ R-16 ①③⑤（App 侧「显式收藏、不再自动灌入」）
 * + UI §3.6.1/3.6.2/3.6.3/3.6.4/3.6.5（七态）/3.6.7（无障碍）+ §6.6 禁词。
 * 编号 `C-01…C-34` 与报告 §2 的映射表一一对应。
 *
 * 三条与 `lookup-screen.spec.tsx` 的**刻意差异**（都是踩过的坑）：
 *  1. `settle()` 每轮 `await act(async () => setTimeout(12))` 等**真宏任务**：`@tanstack/react-query`
 *     的观察者通知走 `NotifyManager` 的 `setTimeout`，只排空微任务会得到「请求已发出、行还没上屏」
 *     （`detail-screen.spec.tsx` 为此吃过 20 条假红）；越过 `URL_SYNC_MS`（250ms）去抖门槛用 `advance(320)`。
 *  2. 本文件**启动路由器**（`startRouter()`）：`navigate()` 只写 `location.hash`，快照靠 `hashchange`
 *     回来。不启动路由器的话「点 chip → URL 变了但列表没跟」会被读成缺陷（T-17 的 spec 只断 hash 值，
 *     从不看导航后的重渲染，所以没暴露这一点）。
 *  3. 七态文案一律断 `@tm/shared` 的 `WORDBOOK_COPY.*`（页面与 Web 共用同一文案源，§8.2-2）。
 *     §3.6.5 表格里的定稿串与 shared 那一套**措辞不同**，这是实现方在文件头声明并登记的既有偏差
 *     （遗留项 L-1，待 PM 收敛），本文件不假装两者相等。
 *
 * jsdom 没有排版引擎 ⇒ 判据⑥「删除按钮在触屏上直接可见」用**可判真假的替代量**：删除按钮在行内
 * **常驻渲染**（节点存在 + 不在 `sr-only`/`opacity-0`/`hidden` 里 + `tabIndex` 可达 + 未被
 * `aria-hidden` 罩住），真机 hover 走查在报告「未跑清单」里交给 T-23。
 *
 * 网络：只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口）。`data/**` 是本任务禁区，
 * 故 C-23 的「入队失败」分支在**导入接缝**上打桩（`vi.mock` 包一层可开关的 `removeWord`），不改数据层。
 * ⚠ 那一条测不到 `addWord/removeWord → offline-queue.saveState → kvSet → localStorage` 真链路
 * （A-46 #97 的判据），所以 T-14d 的 C-35 改用 `vi.spyOn(Storage.prototype, 'setItem')` 注真故障。
 * 夹具词长全部 ≤ 64 字符（读侧超长词容错由 T-14b 负责）。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ARIA, TOAST_UNDO_MS, VERBS, WORDBOOK_COPY, type WordbookEntryDto } from '@tm/shared';
import WordbookScreen, {
  DEFAULT_PARAMS,
  WORDBOOK_PATH,
  applyQueue,
  countStages,
  filterLabel,
  isFiltering,
  parseListParams,
  selectRows,
  serializeListParams,
  sortLabel,
  stageOf,
  toRows,
  wordbookPageTitle,
} from '../src/screens/WordbookScreen.js';
import {
  WORDBOOK_APP_COPY as COPY,
  WORDBOOK_FILTERS,
  WORDBOOK_SORTS,
  isFilter,
  isSort,
} from '../src/components/wordbook-toolbar.js';
import { lookupKeys } from '../src/data/queries/lookup.js';
import { readWordbookList, wordbookKeys } from '../src/data/queries/wordbook.js';
import { SYNC_STATE_KEY } from '../src/data/offline-queue.js';
import { navigate, resetRouterForTest, startRouter } from '../src/router.js';
import type { UiHost } from '@tm/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** C-23：在**接缝**上让 `removeWord` 抛错（模拟 WebView 关了 DOMStorage ⇒ 队列写不进）。 */
const fault = vi.hoisted(() => ({ removeThrows: false }));
vi.mock('../src/data/queries/wordbook.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/data/queries/wordbook.js')>();
  return {
    ...mod,
    removeWord: (word: string): void => {
      if (fault.removeThrows) throw new Error('storage disabled');
      mod.removeWord(word);
    },
  };
});

/* ═════════════════ 夹具（词长合法；三档进度 + 4 档排序可区分） ═════════════════ */

const NOW = Date.now();
const DAY = 86400000;

/**
 * | 词 | 档（`stageOf`） | addedAt | lastReview | reviewCount | lapses | nextDue |
 * |---|---|---|---|---|---|---|
 * | apple  | new      | -5d | —      | — | 0 | —    |
 * | bridge | learning | -1d | -2d    | 4 | 1 | —    |
 * | cloud  | mastered | -3d | -30d   | 9 | 2 | +10d |
 * | dream  | learning | -4d | -9d    | 3 | 7 | +2d  |
 * | eagle  | learning | -2d | -4d    | 1 | 4 | —    |
 * | flute  | learning | -6d | -1d    | 2 | 5 | —    |
 *
 * 计数 `全部 6 · 新词 1 · 在背 4 · 已掌握 1`；四档排序各给出一个**无并列**的全序。
 * `apple` 的首义走条目 passthrough 键 `gloss`（R-15 ⑧「一次批量请求服务端补齐」的落地形态），
 * `bridge` 的首义走查词页已写进 React Query 缓存那一条来源，其余四词故意为空 ⇒ 行 2 落 `（暂无释义）`。
 */
const ENTRIES: WordbookEntryDto[] = [
  { word: 'apple', addedAt: NOW - 5 * DAY, gloss: '苹果', lapses: 0 },
  { word: 'bridge', addedAt: NOW - 1 * DAY, lastReview: NOW - 2 * DAY, reviewCount: 4, lapses: 1 },
  { word: 'cloud', addedAt: NOW - 3 * DAY, lastReview: NOW - 30 * DAY, reviewCount: 9, lapses: 2, nextDue: NOW + 10 * DAY },
  { word: 'dream', addedAt: NOW - 4 * DAY, lastReview: NOW - 9 * DAY, reviewCount: 3, lapses: 7, nextDue: NOW + 2 * DAY },
  { word: 'eagle', addedAt: NOW - 2 * DAY, lastReview: NOW - 4 * DAY, reviewCount: 1, lapses: 4 },
  { word: 'flute', addedAt: NOW - 6 * DAY, lastReview: NOW - 1 * DAY, reviewCount: 2, lapses: 5 },
];

/** `bridge` 的查词缓存（首义第二来源，0 请求）。 */
const BRIDGE_LOOKUP = {
  word: 'bridge',
  phonetic: 'brɪdʒ',
  translation: 'n. 桥梁\nvt. 架桥',
  groups: [{ pos: 'n.', meanings: ['桥梁', '桥'] }],
  exchange: {},
  examples: [],
};

const ORDER = {
  recent: ['bridge', 'eagle', 'cloud', 'dream', 'apple', 'flute'],
  alphabetical: ['apple', 'bridge', 'cloud', 'dream', 'eagle', 'flute'],
  longestIdle: ['cloud', 'dream', 'eagle', 'bridge', 'flute', 'apple'],
  mostForgotten: ['dream', 'flute', 'eagle', 'cloud', 'bridge', 'apple'],
  learning: ['bridge', 'eagle', 'dream', 'flute'],
} as const;

/* ═════════════════ 测试台 ═════════════════ */

interface FetchCall {
  url: string;
  method: string;
}

interface ToastOptions {
  tone?: string;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

let fetchCalls: FetchCall[] = [];
let toastCalls: Array<{ message: string; options: ToastOptions | undefined }> = [];
let speakSpy: ReturnType<typeof vi.fn>;
let wordbookPayload: unknown = { data: ENTRIES };
let failList = false;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let stopRouter: (() => void) | null = null;
let mounted = false;

/** 词本 GET 可切失败；其余请求一律 200 空对象。 */
function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, method: String(init?.method ?? 'GET') });
    if (url.includes('/api/wordbook') && String(init?.method ?? 'GET') === 'GET') {
      if (failList) {
        return {
          ok: false,
          status: 500,
          text: async () => '{"error":"boom"}',
          json: async () => ({ error: 'boom' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(wordbookPayload),
        json: async () => wordbookPayload,
      } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
}

/** 词本 GET 挂住不返回（首屏骨架用）。 */
function stubFetchHanging(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, method: String(init?.method ?? 'GET') });
    if (url.includes('/api/wordbook')) return new Promise<Response>(() => undefined);
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) } as unknown as Response;
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
    toast: (message: string, options?: never) => {
      toastCalls.push({ message, options: options as unknown as ToastOptions | undefined });
    },
  };
}

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

/** 等过一段**真实**时间（去抖 / 5 秒窗口一类门槛）。 */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
}

function renderAt(path = WORDBOOK_PATH): void {
  window.location.hash = `#${path}`;
  resetRouterForTest(path);
  stopRouter = startRouter();
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <WordbookScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

function render(): void {
  renderAt();
}

function login(): void {
  localStorage.setItem('tm.token', 't-18b-test');
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container.remove();
  stopRouter?.();
  stopRouter = null;
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

function rows(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid=wordbook-row]'));
}

function rowWords(): string[] {
  return rows().map((li) => li.querySelector('span[lang=en]')?.textContent ?? '');
}

function rowOf(word: string): HTMLElement | null {
  return rows().find((li) => (li.querySelector('span[lang=en]')?.textContent ?? '') === word) ?? null;
}

function buttonByAriaLabel(scope: ParentNode, label: string): HTMLElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLElement>('button')).find(
      (el) => el.getAttribute('aria-label') === label,
    ) ?? null
  );
}

function clickableByText(label: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('button, a')).find(
      (el) => (el.textContent ?? '').trim() === label,
    ) ?? null
  );
}

function buttonsByText(label: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button')).filter(
    (el) => (el.textContent ?? '').trim() === label,
  );
}

/** chip 的「文字 + 计数」两个子节点（`gap-1` 的空隙由 flex 给，不在 textContent 里）。 */
function chipParts(el: HTMLElement): { label: string; count: string; pressed: string | null } {
  return {
    label: (el.childNodes[0]?.textContent ?? '').trim(),
    count: el.querySelector('span')?.textContent ?? '',
    pressed: el.getAttribute('aria-pressed'),
  };
}

function chips(): HTMLElement[] {
  return Array.from(q<HTMLElement>('[data-testid=wordbook-filters]')!.querySelectorAll<HTMLElement>('button'));
}

/** 排序钮：`排序：最新加入` + 一个装饰位 `▾`。 */
function sortTriggerText(): string {
  return (q<HTMLElement>('[data-testid=wordbook-sort-button]')?.textContent ?? '').replace('▾', '');
}

function searchInput(): HTMLInputElement {
  const el =
    q<HTMLInputElement>('[data-testid=wordbook-search] input') ??
    q<HTMLInputElement>('input[data-testid=wordbook-search]');
  if (!el) throw new Error('未找到词本搜索框');
  return el;
}

function type(value: string): void {
  const input = searchInput();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: Element | null): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function press(el: Element | null, key: string): void {
  if (!el) throw new Error('找不到目标元素');
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

/** 行的可拖拽面（`<a>` 与三个行内控件的父容器）。 */
function surfaceOf(li: HTMLElement): HTMLElement {
  return li.querySelector('a')!.parentElement as HTMLElement;
}

/**
 * 左滑：pointerdown → pointermove（位移 `dx`，负值向左）→ pointerup。
 * `@tm/ui` 用原生 pointer 事件名，jsdom 无 `PointerEvent` ⇒ 以同名 type 的 `MouseEvent` 派发。
 */
function swipe(li: HTMLElement, dx: number): void {
  const surface = surfaceOf(li);
  const fire = (type: string, x: number): void => {
    act(() => {
      surface.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 20, button: 0 }),
      );
    });
  };
  fire('pointerdown', 300);
  fire('pointermove', 300 + dx);
  fire('pointerup', 300 + dx);
}

function lastToast(): { message: string; options: ToastOptions | undefined } {
  return toastCalls[toastCalls.length - 1]!;
}

function undoLastDelete(): void {
  const action = lastToast().options?.action;
  if (!action) throw new Error('删除反馈里没有「撤销」按钮');
  act(() => action.onClick());
}

interface QueueShape {
  pendingUpserts: Array<{ word: string; addedAt?: number; lastReview?: number; reviewCount?: number }>;
  pendingRemovals: string[];
}

function queueState(): QueueShape {
  const raw = localStorage.getItem(SYNC_STATE_KEY);
  if (!raw) return { pendingUpserts: [], pendingRemovals: [] };
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    pendingUpserts: (parsed.pendingUpserts ?? []) as QueueShape['pendingUpserts'],
    pendingRemovals: (parsed.pendingRemovals ?? []) as string[],
  };
}

const listRequests = (): FetchCall[] => fetchCalls.filter((c) => c.url.includes('/api/wordbook') && c.method === 'GET');
const writeRequests = (): FetchCall[] => fetchCalls.filter((c) => c.method !== 'GET');

/** 源码级哨兵只看代码：文件头把红线 API 名写在注释里会自指，先剥掉注释。 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

const SOURCES = ['../src/screens/WordbookScreen.tsx', '../src/components/wordbook-toolbar.tsx'].map((p) => {
  const text = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  return { path: p, text, code: codeOnly(text) };
});

/** §6.6 禁止词（+ §6.5 禁用措辞）：只扫**渲染出的可见文字与 toast 串**。 */
const FORBIDDEN = [
  '未接入',
  '暂未支持该功能',
  '24h 缓存',
  'ClickHouse',
  '稳定度',
  '掌握度变化',
  '已连接',
  '未连接',
  '云端',
  '本地',
  'FSRS',
  '以后再说',
  '稍后再改',
  '下次提醒',
  '宽限期',
  '截止日期',
  'passwordUpgradeDeadline',
  '忘记密码',
  '找回密码',
  '联系管理员',
  '请再按一次',
  '请求失败',
  '加载失败',
  '暂无数据',
  'No data',
];

/* ═════════════════ 生命周期 ═════════════════ */

beforeEach(() => {
  fault.removeThrows = false;
  localStorage.clear();
  window.location.hash = '';
  resetRouterForTest('/');
  fetchCalls = [];
  toastCalls = [];
  speakSpy = vi.fn();
  wordbookPayload = { data: ENTRIES };
  failList = false;
  stubFetch();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

/* ═════════════════ R-15 ①② 一级页 + 行形态 ═════════════════ */

describe('R-15 ①② 一级页与行形态（§3.6.1 / §3.6.2）', () => {
  it('C-01 一级页在 `#/wordbook`：页头 `单词本 · 共 N 词`，列表是 `<ul>/<li>`，每行三行内容齐', async () => {
    login();
    render();
    await settle();

    expect(q('[data-testid=wordbook-screen]')).not.toBeNull();
    expect(wordbookPageTitle()).toBe('单词本');
    expect(q('[data-testid=wordbook-header]')?.tagName).toBe('HEADER');
    expect(q('[data-testid=wordbook-total]')?.textContent).toBe('共 6 词');
    expect(q('ul[data-testid=wordbook-list]')).not.toBeNull();
    expect(rows()).toHaveLength(6);

    const apple = rowOf('apple');
    expect(apple).not.toBeNull();
    /* 行 1 词 + 行 2 首义 + 行 3 元信息（§3.6.2 三行，行高 ≥60px 由 `min-h-[60px]` 承载） */
    expect(apple!.querySelector('a')?.className).toContain('min-h-[60px]');
    expect(apple!.textContent).toContain('苹果');
    expect(apple!.textContent).toContain(COPY.metaJoined);
    expect(rowOf('bridge')!.textContent).toContain('复习 4 次');
    /* 首义缺失时行 2 不空行（§3.6.2） */
    expect(rowOf('cloud')!.textContent).toContain(WORDBOOK_COPY.noGloss);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('C-02 点行 = 进详情（`from=wordbook`）；行内喇叭只发音、不跳转（原「点条目只发音」已改掉）', async () => {
    login();
    render();
    await settle();

    const link = rowOf('apple')!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/word/apple?from=wordbook');
    expect(link.getAttribute('aria-label')).toBe(ARIA.wordbookRow('apple'));
    click(link);
    expect(window.location.hash).toBe('#/word/apple?from=wordbook');

    speakSpy.mockClear();
    click(buttonByAriaLabel(rowOf('dream')!, ARIA.speak('dream')));
    expect(speakSpy).toHaveBeenCalledWith('dream', 'us');
    expect(window.location.hash).toBe('#/word/apple?from=wordbook');
  });

  it('C-03 行状态：只有 `已掌握` 加文字徽章，新词/在背无标记（仅靠文字不靠颜色）', async () => {
    login();
    render();
    await settle();
    expect(rowOf('cloud')!.textContent).toContain(COPY.masteredBadge);
    expect(rowOf('apple')!.textContent).not.toContain(COPY.masteredBadge);
    expect(rowOf('dream')!.textContent).not.toContain(COPY.masteredBadge);
    expect(container.querySelectorAll('[data-testid=wordbook-row] span.rounded-full')).toHaveLength(1);
    expect(container.textContent).toContain(COPY.sortHint(COPY.sort.recent));
  });
});

/* ═════════════════ R-15 ⑧ 一次批量、0 逐词请求 ═════════════════ */

describe('R-15 ⑧ 首屏一次批量（取消 2.1s 逐词补拉）', () => {
  it('C-04 首屏对 `/api/wordbook` 请求数 = 1；0 次逐词补拉；0 次写请求', async () => {
    login();
    render();
    await settle();
    expect(listRequests()).toHaveLength(1);
    expect(fetchCalls.filter((c) => c.url.includes('/api/lookup'))).toHaveLength(0);
    expect(fetchCalls.filter((c) => c.url.includes('dictionaries'))).toHaveLength(0);
    expect(writeRequests()).toHaveLength(0);
    expect(rowOf('apple')!.textContent).toContain('苹果');
  });

  it('C-05 首义第二来源 = 查词页已写进缓存的结果（0 请求）；两者都无才落 `（暂无释义）`', async () => {
    login();
    render();
    act(() => {
      client.setQueryData(lookupKeys.one('bridge', 'en2zh'), BRIDGE_LOOKUP);
    });
    await settle();
    expect(listRequests()).toHaveLength(1);
    expect(fetchCalls.filter((c) => c.url.includes('/api/lookup'))).toHaveLength(0);
    expect(rowOf('bridge')!.textContent).toContain('桥梁');
    expect(container.textContent).toContain(WORDBOOK_COPY.noGloss);
  });
});

/* ═════════════════ R-15 ③ 搜索（本地、≤300ms、0 请求） ═════════════════ */

describe('R-15 ③ 顶部搜索框（按词与释义子串，本地过滤不发请求）', () => {
  it('C-06 键入即在**同一帧**筛完（0 请求、远小于 300ms），随后 hash 去抖写入 `?q=`', async () => {
    login();
    render();
    await settle();
    const before = fetchCalls.length;
    const t0 = Date.now();

    type('dre');
    expect(Date.now() - t0).toBeLessThan(300);
    expect(rowWords()).toEqual(['dream']);
    expect(q('[data-testid=wordbook-result-count]')!.getAttribute('role')).toBe('status');
    expect(q('[data-testid=wordbook-result-count]')!.textContent).toBe('找到 1 词');
    expect(fetchCalls.length).toBe(before);

    await advance(320);
    expect(window.location.hash).toBe(`#${WORDBOOK_PATH}?q=dre`);
  });

  it('C-07 释义子串也命中（`苹果` → apple），词的匹配大小写不敏感', async () => {
    login();
    render();
    await settle();
    type('苹果');
    expect(rowWords()).toEqual(['apple']);
    type('CLOU');
    expect(rowWords()).toEqual(['cloud']);
  });

  it('C-08 无匹配 = 筛后空态 + `清空筛选和搜索`，点了三键一起回默认', async () => {
    login();
    render();
    await settle();
    type('zzzz');
    expect(q('[data-testid=wordbook-filtered-empty]')).not.toBeNull();
    expect(container.textContent).toContain(WORDBOOK_COPY.filteredEmpty.title);
    expect(container.textContent).toContain(WORDBOOK_COPY.filteredEmpty.subtitle);
    expect(container.textContent).toContain('找到 0 词');
    click(clickableByText(COPY.clearAll));
    await settle();
    expect(window.location.hash).toBe(`#${WORDBOOK_PATH}`);
    expect(searchInput().value).toBe('');
    expect(rows()).toHaveLength(6);
    expect(q('[data-testid=wordbook-result-count]')!.textContent).toBe('');
  });

  it('C-09 搜索框右侧 ✕ 清空（44 热区）即时回全量，不触发请求', async () => {
    login();
    render();
    await settle();
    const before = fetchCalls.length;
    type('app');
    expect(rowWords()).toEqual(['apple']);
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-testid=wordbook-search] button'));
    expect(buttons.length).toBeGreaterThan(0);
    const clear =
      buttons.find((el) => /清空|清除/.test(`${el.getAttribute('aria-label') ?? ''}${el.textContent ?? ''}`)) ??
      buttons[buttons.length - 1]!;
    click(clear);
    await settle();
    expect(rows()).toHaveLength(6);
    expect(fetchCalls.length).toBe(before);
    await advance(320);
    expect(window.location.hash).toBe(`#${WORDBOOK_PATH}`);
  });
});

/* ═════════════════ R-15 ⑤ 预置筛选 4 项 ═════════════════ */

describe('R-15 ⑤ 预置筛选 4 项（命名与 §3.6 表格逐字一致）', () => {
  it('C-10 chips 文字与顺序 = `全部 / 新词 / 在背 / 已掌握`，带整本计数，`aria-pressed` 单选', async () => {
    login();
    render();
    await settle();
    const group = q<HTMLElement>('[data-testid=wordbook-filters]')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe(COPY.filterGroup);
    const parts = chips().map(chipParts);
    expect(parts.map((p) => p.label)).toEqual(['全部', '新词', '在背', '已掌握']);
    expect(parts.map((p) => p.count)).toEqual(['6', '1', '4', '1']);
    expect(parts.map((p) => p.pressed)).toEqual(['true', 'false', 'false', 'false']);
    expect(WORDBOOK_FILTERS.map(filterLabel)).toEqual(['全部', '新词', '在背', '已掌握']);
  });

  it('C-11 点 `已掌握` → hash `?filter=mastered` 只剩 cloud；计数恒按整本（与搜索无关）', async () => {
    login();
    render();
    await settle();
    click(chips()[3]!);
    await settle();
    expect(window.location.hash).toBe(`#${WORDBOOK_PATH}?filter=mastered`);
    expect(rowWords()).toEqual(['cloud']);
    expect(chips().map(chipParts)[3]!.pressed).toBe('true');

    click(chips()[2]!);
    await settle();
    expect(rowWords()).toEqual([...ORDER.learning]);

    type('eag');
    await settle();
    expect(rowWords()).toEqual(['eagle']);
    expect(chips().map((el) => el.textContent)).toEqual(['全部6', '新词1', '在背4', '已掌握1']);
    expect(q('[data-testid=wordbook-result-count]')!.textContent).toBe('找到 1 词');
  });

  it('C-12 chips 横向可滑（`snap-x` + 右侧 24px 渐隐提示，提示本身不可点）', async () => {
    login();
    render();
    await settle();
    const scroller = q<HTMLElement>('[data-testid=wordbook-filters]')!;
    expect(scroller.className).toContain('snap-x');
    expect(scroller.className).toContain('overflow-x-auto');
    const fade = scroller.parentElement!.querySelector('span[aria-hidden="true"]');
    expect(fade!.className).toContain('pointer-events-none');
    expect(fade!.className).toContain('w-6');
  });
});

/* ═════════════════ R-15 ④ 排序 4 档 ═════════════════ */

describe('R-15 ④ 排序 4 档（命名与 §3.6 表格逐字一致；菜单而非 4 个常驻按钮）', () => {
  it('C-13 触发钮 `排序：最新加入` → 4 项 `role=menu`/`menuitemradio`，当前项 ✔，Esc 关闭且焦点回弹', async () => {
    login();
    render();
    await settle();
    const trigger = q<HTMLElement>('[data-testid=wordbook-sort-button]')!;
    expect(sortTriggerText()).toBe(COPY.sortHint(COPY.sort.recent));
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    /* 「不做成 4 个常驻按钮」：菜单未开时页面上不出现另外两档文字 */
    expect(container.textContent).not.toContain(COPY.sort.longestIdle);
    expect(container.textContent).not.toContain(COPY.sort.mostForgotten);

    click(trigger);
    const menu = q<HTMLElement>('[data-testid=wordbook-sort-menu]')!;
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('aria-label')).toBe(COPY.sortMenuLabel);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role=menuitemradio]'));
    expect(items.map((el) => (el.textContent ?? '').replace('✔', ''))).toEqual([
      '最新加入',
      '字母',
      '最久没碰',
      '最常忘',
    ]);
    expect(WORDBOOK_SORTS.map(sortLabel)).toEqual(['最新加入', '字母', '最久没碰', '最常忘']);
    expect(items.map((el) => el.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(document.activeElement).toBe(items[0]);

    press(menu, 'Escape');
    expect(q('[data-testid=wordbook-sort-menu]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('C-14 选 `字母` → hash `?sort=alphabetical`、钮上文字改判、当前项 ✔ 跟着走', async () => {
    login();
    render();
    await settle();
    click(q('[data-testid=wordbook-sort-button]'));
    click(q<HTMLElement>('[data-testid=wordbook-sort-menu] [data-sort=alphabetical]'));
    await settle();
    expect(window.location.hash).toBe(`#${WORDBOOK_PATH}?sort=alphabetical`);
    expect(rowWords()).toEqual([...ORDER.alphabetical]);
    expect(sortTriggerText()).toBe(COPY.sortHint(COPY.sort.alphabetical));

    click(q('[data-testid=wordbook-sort-button]'));
    expect(
      Array.from(q('[data-testid=wordbook-sort-menu]')!.querySelectorAll<HTMLElement>('[role=menuitemradio]')).map(
        (el) => el.getAttribute('aria-checked'),
      ),
    ).toEqual(['false', 'true', 'false', 'false']);
  });

  it('C-15 四档语义逐条成立（`最久没碰` 空值排最后、`最常忘` = lapse 降序），并有一次真实上屏', async () => {
    const views = toRows(ENTRIES, () => '', NOW);
    const at = (sort: (typeof WORDBOOK_SORTS)[number]) =>
      selectRows(views, { q: '', filter: 'all', sort }, NOW).map((v) => v.word);
    expect(at('recent')).toEqual([...ORDER.recent]);
    expect(at('alphabetical')).toEqual([...ORDER.alphabetical]);
    const idle = at('longestIdle');
    expect(idle).toEqual([...ORDER.longestIdle]);
    expect(idle[idle.length - 1]).toBe('apple'); /* 无 lastReview ⇒ 排最后（§3.6.3 行 3 括号口径） */
    expect(at('mostForgotten')).toEqual([...ORDER.mostForgotten]);

    login();
    renderAt(`${WORDBOOK_PATH}?sort=longestIdle`);
    await settle();
    expect(rowWords()).toEqual([...ORDER.longestIdle]);
    expect(sortTriggerText()).toBe(COPY.sortHint(COPY.sort.longestIdle));
  });
});

/* ═════════════════ §3.6.3 URL 可分享 / 可回退 ═════════════════ */

describe('§3.6.3 URL 三键：分享链恢复时控件与列表同步', () => {
  it('C-16 `?q=&filter=&sort=` 直达：控件初值与列表同时一致', async () => {
    login();
    renderAt(`${WORDBOOK_PATH}?filter=mastered&sort=alphabetical&q=ou`);
    await settle();
    expect(searchInput().value).toBe('ou');
    expect(sortTriggerText()).toBe(COPY.sortHint(COPY.sort.alphabetical));
    expect(chips().map(chipParts).map((p) => p.pressed)).toEqual(['false', 'false', 'false', 'true']);
    expect(rowWords()).toEqual(['cloud']);
    expect(q('[data-testid=wordbook-result-count]')!.textContent).toBe('找到 1 词');
  });

  it('C-17 非法/缺键回落默认档（分享链不许白屏）；默认值不落进 URL', () => {
    expect(parseListParams({ filter: 'xxx', sort: 'nope' })).toEqual(DEFAULT_PARAMS);
    expect(parseListParams(undefined)).toEqual(DEFAULT_PARAMS);
    expect(parseListParams({ q: 'happy', filter: 'new', sort: 'longestIdle' })).toEqual({
      q: 'happy',
      filter: 'new',
      sort: 'longestIdle',
    });
    expect(serializeListParams(DEFAULT_PARAMS)).toBe(WORDBOOK_PATH);
    expect(serializeListParams({ q: 'a b', filter: 'learning', sort: 'recent' })).toBe(
      `${WORDBOOK_PATH}?q=a%20b&filter=learning`,
    );
    expect(serializeListParams({ q: '', filter: 'all', sort: 'mostForgotten' })).toBe(
      `${WORDBOOK_PATH}?sort=mostForgotten`,
    );
    expect(isFilter('new')).toBe(true);
    expect(isFilter('nope')).toBe(false);
    expect(isSort('recent')).toBe(true);
    expect(isSort('nope')).toBe(false);
    expect(isFiltering(DEFAULT_PARAMS)).toBe(false);
    expect(isFiltering({ ...DEFAULT_PARAMS, filter: 'new' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_PARAMS, q: '  x  ' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_PARAMS, q: '   ' })).toBe(false);
  });
});

/* ═════════════════ R-15 ⑥⑦ 删除（显式 + 左滑 + 撤销） ═════════════════ */

describe('R-15 ⑥⑦ / §3.6.4 删除：显式按钮 + 左滑 + 5 秒撤销', () => {
  it('C-18 每行**常驻**删除按钮（触屏直接可见、键盘可达），点击即删并给撤销 toast', async () => {
    login();
    render();
    await settle();
    const del = buttonByAriaLabel(rowOf('apple')!, ARIA.removeFromWordbook('apple'));
    expect(del).not.toBeNull();
    /* 替代测量：不是 hover 才出现、不是用 `opacity:0` 移出焦点序 */
    expect(del!.tabIndex).toBe(0);
    expect((del as unknown as HTMLButtonElement).disabled).toBe(false);
    expect(del!.getAttribute('aria-hidden')).not.toBe('true');
    expect(del!.className).not.toMatch(/sr-only|opacity-0|hidden|invisible/);
    expect(del!.closest('[aria-hidden="true"]')).toBeNull();

    click(del);
    await settle();
    expect(rowOf('apple')).toBeNull();
    expect(lastToast().message).toBe(WORDBOOK_COPY.swipeDelete.undoToast('apple'));
    expect(lastToast().options?.durationMs).toBe(TOAST_UNDO_MS);
    expect(TOAST_UNDO_MS).toBe(5000);
    expect(lastToast().options?.action?.label).toBe(VERBS.undo);
    expect(q('[data-testid=sync-badge]')!.textContent).toContain('待同步 1');
    /* 反馈 = 撤销 toast，**不是**确认弹窗 */
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('C-19 删除不是本地假删：服务端列表仍在缓存里，行的消失只由**落盘队列**投影（撤销/补传都走 push）', async () => {
    login();
    render();
    await settle();
    click(buttonByAriaLabel(rowOf('apple')!, ARIA.removeFromWordbook('apple')));
    await settle();

    /* ① 读侧缓存没被就地裁剪 ⇒ 行消失不靠组件 state 抹除 */
    const cached = client.getQueryData<WordbookEntryDto[]>(wordbookKeys.list()) ?? [];
    expect(cached.map((e) => e.word)).toContain('apple');
    /* ② 待删写进持久队列 = `POST /api/wordbook/push` 载荷 `removedWords` 的唯一来源 */
    expect(queueState().pendingRemovals).toContain('apple');
    expect(localStorage.getItem(SYNC_STATE_KEY)).toContain('apple');
    /* ③ 离开本页再回来仍一致：refetch 之后行不复活（队列是真相） */
    const before = listRequests().length;
    unmount();
    render();
    await settle();
    expect(listRequests().length).toBe(before + 1);
    expect(rowOf('apple')).toBeNull();
  });

  it('C-20 撤销：toast 内 1 次点击行回到原位，且**复习进度**随 `push` 的 entries 回灌', async () => {
    login();
    render();
    await settle();
    const before = rowWords();
    const dream = ENTRIES.find((e) => e.word === 'dream')!;
    click(buttonByAriaLabel(rowOf('dream')!, ARIA.removeFromWordbook('dream')));
    await settle();
    expect(rowOf('dream')).toBeNull();
    expect(queueState().pendingRemovals).toContain('dream');

    undoLastDelete();
    await settle();

    expect(queueState().pendingRemovals).not.toContain('dream');
    const patch = queueState().pendingUpserts.find((p) => p.word === 'dream');
    expect(patch).toBeDefined();
    expect(patch!.addedAt).toBe(dream.addedAt);
    expect(patch!.lastReview).toBe(dream.lastReview);
    expect(patch!.reviewCount).toBe(dream.reviewCount);
    expect(rowWords()).toEqual(before);
    expect(lastToast().message).toBe(COPY.restored);
    expect(lastToast().options?.tone).toBe('success');
    expect(rowOf('dream')!.textContent).toContain('复习 3 次');
  });

  it('C-21 左滑删除保留：≥64px 松手即删；过 24px 未到 64px 只露出块、不删；未达阈值回弹', async () => {
    login();
    render();
    await settle();
    /* 位移 10px：未达露出阈值 ⇒ 不删、不开口 */
    swipe(rowOf('eagle')!, -10);
    await settle();
    expect(rowOf('eagle')).not.toBeNull();
    expect(rowOf('eagle')!.getAttribute('data-swipe-open')).toBeNull();
    expect(queueState().pendingRemovals).toEqual([]);
    /* 位移 30px：露出删除块但未提交 ⇒ 仍不删 */
    swipe(rowOf('eagle')!, -30);
    await settle();
    expect(rowOf('eagle')!.getAttribute('data-swipe-open')).toBe('true');
    expect(queueState().pendingRemovals).toEqual([]);
    expect(toastCalls).toHaveLength(0);
    /* 位移 76px：提交删除，与显式按钮同一条路 */
    swipe(rowOf('eagle')!, -76);
    await settle();
    expect(rowOf('eagle')).toBeNull();
    expect(queueState().pendingRemovals).toContain('eagle');
    expect(lastToast().message).toBe(WORDBOOK_COPY.swipeDelete.undoToast('eagle'));
    /* 左滑与显式按钮**同时**存在：同页另一行的删除按钮仍在焦点序内 */
    expect(buttonByAriaLabel(rowOf('flute')!, ARIA.removeFromWordbook('flute'))!.tabIndex).toBe(0);
  });

  it('C-22 星标（已收藏态）点下去 = 同一条显式移出路（R-16 ①，不走确认弹窗）', async () => {
    login();
    render();
    await settle();
    const star = buttonByAriaLabel(rowOf('apple')!, ARIA.unfavorite('apple'));
    expect(star!.getAttribute('aria-pressed')).toBe('true');
    expect(star!.getAttribute('title')).toBe(VERBS.favorited);
    click(star);
    await settle();
    expect(rowOf('apple')).toBeNull();
    expect(queueState().pendingRemovals).toContain('apple');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('C-23 入队失败 ⇒ 行不消失 + 定稿 toast（禁「云端/本地」字样），且不留半截队列记录', async () => {
    login();
    render();
    await settle();
    fault.removeThrows = true;
    click(buttonByAriaLabel(rowOf('apple')!, ARIA.removeFromWordbook('apple')));
    await settle();
    expect(rowOf('apple')).not.toBeNull();
    expect(lastToast().message).toBe(COPY.deleteNotQueued);
    expect(lastToast().options?.tone).toBe('error');
    expect(lastToast().options?.action).toBeUndefined();
    expect(lastToast().message).not.toMatch(/云端|本地/);
    expect(queueState().pendingRemovals).toEqual([]);
    fault.removeThrows = false;
  });

  /**
   * A-46 #98（T-14d）：撤销那一条写点（`undoRemove` 里的 `addWord`）此前没接失败反馈 ——
   * `saveState` 真抛以后它会是一个**未捕获异常**。本用例走真链路（`Storage.prototype.setItem`
   * 注入，见 `offline-queue.spec.ts:293` 的钉法），不碰导入接缝桩，所以 `addWord → enqueueUpsert
   * → saveState → kvSet` 整条都在被测范围内（C-23 的 `vi.mock` 接缝桩测不到这一段，A-46 #97）。
   */
  it('C-35 撤销时写盘失败（真链路 `Storage.setItem` 抛）⇒ 不给 `已恢复`、行保持已删、盘上不留半截队列', async () => {
    login();
    render();
    await settle();
    /* 先把删除正常落盘（此时撤销才有东西可翻） */
    click(buttonByAriaLabel(rowOf('dream')!, ARIA.removeFromWordbook('dream')));
    await settle();
    expect(rowOf('dream')).toBeNull();
    expect(queueState().pendingRemovals).toContain('dream');
    const onDisk = localStorage.getItem(SYNC_STATE_KEY);
    expect(onDisk).toBeTruthy();
    /* 失败反馈自己没有「撤销」按钮 ⇒ 先把删除 toast 上那颗钮存下来，点两次（一次红、一次绿）。 */
    const undoAction = lastToast().options?.action;
    expect(undoAction?.label).toBe(VERBS.undo);

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      /* 点撤销：`act()` 会把未捕获异常顶成用例失败 ⇒ 这一行本身就是「不抛」的断言。 */
      act(() => undoAction!.onClick());
      await settle();
      expect(lastToast().message).toBe(COPY.deleteNotQueued);
      expect(lastToast().options?.tone).toBe('error');
      expect(lastToast().message).not.toBe(COPY.restored);
      expect(lastToast().message).not.toMatch(/云端|本地|缓存|未接入|token|数据源/);
      /* 撤销没落账 ⇒ 盘上仍是「待删」那一份：没有翻出来的 upsert，行也不许自己回来 */
      expect(localStorage.getItem(SYNC_STATE_KEY)).toBe(onDisk);
      expect(queueState().pendingRemovals).toContain('dream');
      expect(queueState().pendingUpserts).toEqual([]);
      expect(rowOf('dream')).toBeNull();
    } finally {
      spy.mockRestore();
    }

    /* 恢复写盘后再点同一颗撤销：走真成功路径，证明上面的红是写失败本身、不是页面状态被点坏了。 */
    act(() => undoAction!.onClick());
    await settle();
    expect(rowOf('dream')).not.toBeNull();
    expect(lastToast().message).toBe(COPY.restored);
  });
});

/* ═════════════════ R-16 显式收藏、不再自动灌入（App 侧） ═════════════════ */

describe('R-16 ①③⑤ 收藏改显式：浏览词本不自动灌词', () => {
  it('C-24 浏览/搜索/筛选/排序全程 0 写请求、0 队列写入；全站 0 处「清空单词本」', async () => {
    login();
    render();
    await settle();
    const snapshot = localStorage.getItem(SYNC_STATE_KEY);
    type('a');
    click(chips()[2]!);
    await settle();
    click(q('[data-testid=wordbook-sort-button]'));
    click(q<HTMLElement>('[data-testid=wordbook-sort-menu] [data-sort=mostForgotten]'));
    await settle();

    expect(writeRequests()).toHaveLength(0);
    expect(queueState().pendingUpserts).toEqual([]);
    expect(queueState().pendingRemovals).toEqual([]);
    expect(localStorage.getItem(SYNC_STATE_KEY)).toBe(snapshot);
    expect(buttonsByText('清空单词本')).toHaveLength(0);
    expect(container.textContent).not.toContain('清空单词本');
    expect(container.textContent).not.toContain('加入单词本');
  });
});

/* ═════════════════ §3.6.5 七态 ═════════════════ */

describe('§3.6.5 空 / 加载 / 错误', () => {
  it('C-25 未登录：0 词本请求，骨架 + 引导卡并存；卡上**恰两颗**动作 = 主按钮 `手机号登录` + 第二颗 `没有账号？注册` → 注册', async () => {
    render();
    await settle();
    expect(listRequests()).toHaveLength(0);
    expect(q('[data-testid=wordbook-signed-out-skeleton]')).not.toBeNull();
    const card = q<HTMLElement>('[data-testid=wordbook-signed-out]');
    expect(card).not.toBeNull();
    expect(container.textContent).toContain(WORDBOOK_COPY.emptySignedOut.title);
    expect(container.textContent).toContain(WORDBOOK_COPY.emptySignedOut.subtitle);
    expect(clickableByText(WORDBOOK_COPY.emptySignedOut.cta)?.tagName).toBe('BUTTON');

    /* A-48 #113：这颗卡曾经长出**第三颗**动作（`secondary`），它的 label 与 `link` 取自同一串
       `SWITCH_TO_REGISTER_LABEL`、行为却是 `host.navigate('/')` ⇒ 用户看到两颗「没有账号？注册」，
       DOM 序在前的那颗点了跳首页。§3.6.5 行 3 只给四要素 ⇒ 卡上恰两颗，第二颗必须是注册。 */
    const actions = Array.from(card!.querySelectorAll<HTMLElement>('button, a'));
    expect(actions).toHaveLength(2);
    expect(actions.map((el) => (el.textContent ?? '').trim())).toEqual([
      WORDBOOK_COPY.emptySignedOut.cta,
      WORDBOOK_COPY.emptySignedOut.link,
    ]);
    /* 全容器只有一颗这串文字（`EmptyState` 无 href ⇒ 文字链也是 `<button>`，不是 `<a>`）。 */
    expect(buttonsByText('没有账号？注册')).toHaveLength(1);

    const signIn = clickableByText('手机号登录');
    expect(signIn?.tagName).toBe('BUTTON');
    click(signIn);
    expect(window.location.hash).toBe('#/login?from=wordbook');

    const register = clickableByText('没有账号？注册');
    expect(register).toBe(actions[1] ?? null);
    expect(register?.tagName).toBe('BUTTON');
    click(register);
    expect(window.location.hash).toBe('#/register?from=wordbook'); // E5：「注册」落第 12 条 gate，不再是 /login 的降级落点
    /* 第二颗**不是**回首页那颗伪装的：文字链不渲染成 `<a href="#/">` */
    expect(container.querySelector('a[href="#/"]')).toBeNull();
    for (const banned of ['请登录', '立即登录', '登录/注册']) {
      expect(container.textContent).not.toContain(banned);
    }
  });

  it('C-26 首屏 = 8 条行骨架 + 工具条骨架；禁整页转圈、骨架区无文字、页面不加输入锁', async () => {
    stubFetchHanging();
    login();
    render();
    await settle(3);
    const list = q<HTMLElement>('[data-testid=wordbook-list]')!;
    expect(list.querySelector('li')).toBeNull();
    /* 8 行 × (120×16 + 100%×12 + 80×10) = 24 个块 */
    expect(list.querySelectorAll('*').length).toBeGreaterThanOrEqual(24);
    expect(list.textContent).toBe('');
    expect(q('[data-testid=wordbook-toolbar-skeleton]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/加载中|正在加载|Loading|请稍候/);
    expect(q('[role="progressbar"]')).toBeNull();
    expect(q('[data-testid=wordbook-screen]')!.className).not.toMatch(/pointer-events-none/);
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(container.querySelector('fieldset[disabled]')).toBeNull();
  });

  it('C-27 列表拉取失败 = 错误卡；主按钮 `重试` 真重发、次按钮 `去查词`', async () => {
    login();
    failList = true;
    render();
    await settle();
    expect(q('[data-testid=wordbook-load-fail]')).not.toBeNull();
    expect(container.textContent).toContain(COPY.loadFailTitle);
    expect(container.textContent).toContain(COPY.loadFailBody);
    expect(container.textContent).toContain('没能取到你的单词本');
    expect(container.textContent).toContain('再试一次，或者先回首页查词');
    expect(clickableByText(VERBS.goLookup)?.tagName).toBe('BUTTON');
    const retry = clickableByText(VERBS.retry);
    expect(retry?.tagName).toBe('BUTTON');
    failList = false;
    const before = listRequests().length;
    click(retry);
    await settle();
    expect(listRequests().length).toBeGreaterThan(before);
    expect(rows()).toHaveLength(6);
  });

  it('C-28 词本完全为空 = 40px 内联图标（不引图片、不做插画）+ 定稿文案 + 主按钮 `去查词`', async () => {
    login();
    wordbookPayload = { data: [] };
    render();
    await settle();
    expect(q('[data-testid=wordbook-empty]')).not.toBeNull();
    expect(container.textContent).toContain(WORDBOOK_COPY.emptyLoggedIn.title);
    expect(container.textContent).toContain(WORDBOOK_COPY.emptyLoggedIn.subtitle);
    expect(container.querySelector('img')).toBeNull();
    const glyph = q('[data-testid=wordbook-empty] svg');
    expect(glyph).not.toBeNull();
    expect(glyph!.getAttribute('class')).toContain('h-10');
    expect(glyph!.getAttribute('aria-hidden')).toBe('true');
    click(clickableByText(VERBS.goLookup));
    expect(window.location.hash).toBe('#/');
  });
});

/* ═════════════════ §3.6.7 无障碍 + R-15 ⑨（大屏侧栏属 Web） ═════════════════ */

describe('§3.6.7 无障碍 + R-15 ⑨（App 侧不挂 Web 侧栏，也不按视口反套小屏逻辑）', () => {
  it('C-29 行内 `<a>` 与三个控件平铺不嵌套；左滑块里的第二颗删除钮收起时**不在焦点序**', async () => {
    login();
    render();
    await settle();
    for (const li of rows()) {
      const anchor = li.querySelector('a')!;
      expect(anchor.querySelector('button')).toBeNull();
      expect(li.querySelectorAll('a')).toHaveLength(1);
      /* 行 1 右侧三 affordance：星标 → 喇叭 → 删除，全部常驻且带 `aria-label` */
      const controls = Array.from(surfaceOf(li).querySelectorAll<HTMLElement>('button'));
      expect(controls).toHaveLength(3);
      expect(controls.every((el) => el.hasAttribute('aria-label'))).toBe(true);
      expect(controls.every((el) => el.tabIndex === 0)).toBe(true);
      /* 手势块的删除钮只在开口后进入焦点序（不是唯一出口，也不是隐形陷阱） */
      expect(li.querySelectorAll('button')).toHaveLength(4);
      const hidden = li.querySelector('[aria-hidden="true"] button');
      expect(hidden?.getAttribute('tabindex')).toBe('-1');
    }
    const flute = rowOf('flute')!;
    expect(buttonByAriaLabel(flute, ARIA.speak('flute'))).not.toBeNull();
    expect(buttonByAriaLabel(flute, ARIA.unfavorite('flute'))).not.toBeNull();
    expect(buttonByAriaLabel(flute, ARIA.removeFromWordbook('flute'))).not.toBeNull();
  });

  it('C-30 App 本页不挂 Web 侧栏，也不按视口宽分叉逻辑（§6 第 11 条；≥1024 双列靠 `lg:` 类）', async () => {
    login();
    render();
    await settle();
    expect(document.body.querySelector('[data-testid=wordbook-sidebar]')).toBeNull();
    const list = q<HTMLElement>('[data-testid=wordbook-list]')!;
    expect(list.tagName).toBe('UL');
    expect(list.className).toContain('lg:grid');
    expect(list.className).toContain('lg:grid-cols-2');
    expect(list.className).not.toMatch(/max-lg:hidden|max-md:hidden/);
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/window\.innerWidth|matchMedia/);
      expect(source.code, source.path).not.toMatch(/min-w-\[1280px\]/);
    }
  });

  it('C-31 渲染出的可见文字与 toast 串里 §6.6 禁词 0 命中', async () => {
    login();
    render();
    await settle();
    type('app');
    click(buttonByAriaLabel(rowOf('apple')!, ARIA.removeFromWordbook('apple')));
    await settle();
    undoLastDelete();
    await settle();
    expect(rowOf('apple')).not.toBeNull();
    const haystack = [container.textContent ?? '', toastCalls.map((t) => t.message).join(' · ')].join('\n');
    for (const word of FORBIDDEN) expect(haystack, word).not.toContain(word);
    expect(haystack).not.toMatch(/undefined|NaN/);
    expect(haystack).not.toMatch(/\bp:|\b3:|\b1e:/);
  });

  it('C-32 Chrome84 红线（本任务两个文件源码级哨兵）', () => {
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/structuredClone\s*\(/);
      expect(source.code, source.path).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
      expect(source.code, source.path).not.toMatch(/requestIdleCallback/);
      expect(source.code, source.path).not.toMatch(/\.at\s*\(/);
    }
  });
});

/* ═════════════════ 纯函数口径 ═════════════════ */

describe('纯函数口径（进度档 / 计数 / 队列叠加）', () => {
  it('C-33 stageOf 三档 + countStages 整本计数', () => {
    const views = toRows(ENTRIES, () => '', NOW);
    expect(Object.fromEntries(views.map((v) => [v.word, v.stage]))).toEqual({
      apple: 'new',
      bridge: 'learning',
      cloud: 'mastered',
      dream: 'learning',
      eagle: 'learning',
      flute: 'learning',
    });
    const extra = (o: Record<string, unknown>): WordbookEntryDto => o as unknown as WordbookEntryDto;
    expect(stageOf(extra({ word: 'x', state: 0 }), NOW)).toBe('new');
    expect(stageOf(extra({ word: 'x', state: 3, lapses: 1 }), NOW)).toBe('learning'); // A-87 #325 改判：Relearning(3) 归在背（旧 `state>=3 && lapses<3 ⇒ mastered` 作废）
    expect(stageOf(extra({ word: 'x', reviewCount: 2, nextDue: String(NOW + 9 * DAY) }), NOW)).toBe('mastered');
    expect(stageOf(extra({ word: 'x', reviewCount: 2, nextDue: NOW + DAY }), NOW)).toBe('learning');
    expect(countStages(views)).toEqual({ all: 6, new: 1, learning: 4, mastered: 1 });
    expect(views.find((v) => v.word === 'cloud')!.badge!.label).toBe('已掌握');
    expect(views.find((v) => v.word === 'apple')!.badge).toBeUndefined();
  });

  it('C-34 applyQueue：待删剔除 + 待藏补回 + 同词去重（不叠这段就会「复活」）', () => {
    type QueueArg = Parameters<typeof applyQueue>[1];
    const state = {
      baseVersion: 0,
      pendingUpserts: [{ word: 'zulu', addedAt: NOW - 7 * DAY, reviewCount: 2 }],
      pendingRemovals: ['APPLE'],
    } as unknown as QueueArg;
    const merged = applyQueue([...ENTRIES, { word: 'apple', addedAt: 1 }], state);
    expect(merged.map((e) => e.word)).toEqual(['bridge', 'cloud', 'dream', 'eagle', 'flute', 'zulu']);
    expect(
      applyQueue(ENTRIES, { pendingUpserts: [], pendingRemovals: [] } as unknown as QueueArg).map((e) => e.word),
    ).toEqual(ENTRIES.map((e) => e.word));
  });
});

/* ════════════════ E4b3b 件B/件C：取数带参 + 解析透传 + 键到位三档映射 ════════════════ */

describe('E4b3b 件B/件C：REST 带参、解析层透传、键到位映射（A-87 #325）', () => {
  it('件B：首屏 `GET /api/wordbook` 带 `with_progress=1`；`pull` 0 请求（不在本表面）', async () => {
    login();
    render();
    await settle();
    expect(listRequests()).toHaveLength(1);
    expect(listRequests()[0]!.url).toContain('/api/wordbook?with_progress=1');
    expect(fetchCalls.filter((c) => c.url.includes('/api/wordbook/pull'))).toHaveLength(0);
  });

  it('件B 透传实测：`readWordbookList` 两条分流路径都原样保留三键，`stageOf` 键到位分支据此点亮', () => {
    const clean = readWordbookList({ data: [{ word: 'x', addedAt: 1, state: 2, lapses: 1, nextDue: NOW + 10 * DAY }] });
    expect(clean.report.salvaged).toBe(0); // 整批干净路径（WordbookArraySchema .passthrough()）
    expect(clean.entries[0]).toMatchObject({ state: 2, lapses: 1, nextDue: NOW + 10 * DAY });
    expect(stageOf(clean.entries[0]!, NOW)).toBe('mastered');
    const mixed = readWordbookList({ data: [{ word: 'y', addedAt: 2, reviewCount: -1, state: 3, lapses: 4, nextDue: NOW + DAY }] });
    expect(mixed.report.salvaged).toBe(1); // 逐条分流路径（salvageEntry 的 {...raw} 不剥未知键）
    expect(mixed.entries[0]).toMatchObject({ state: 3, lapses: 4, nextDue: NOW + DAY });
    expect(stageOf(mixed.entries[0]!, NOW)).toBe('learning'); // Relearning(3) ⇒ 在背
  });

  it('件C：键到位三档映射逐档 + 同组夹具去掉 `state` 后降级分支逐条同档（降级分支没动的反证）', () => {
    const cast = (o: Record<string, unknown>): WordbookEntryDto => o as unknown as WordbookEntryDto;
    expect(stageOf(cast({ word: 'k', state: 2, nextDue: NOW + 10 * DAY }), NOW)).toBe('mastered'); // Review(2)+长间隔
    expect(stageOf(cast({ word: 'k', state: 2, nextDue: NOW + DAY }), NOW)).toBe('learning'); // Review(2)+短间隔
    expect(stageOf(cast({ word: 'k', state: 1, nextDue: NOW + 10 * DAY }), NOW)).toBe('learning'); // Learning(1)
    expect(stageOf(cast({ word: 'k', state: 3, lapses: 0, nextDue: NOW + 10 * DAY }), NOW)).toBe('learning'); // Relearning(3)
    expect(stageOf(cast({ word: 'k', state: 0 }), NOW)).toBe('new');
    expect(stageOf(cast({ word: 'k', state: 2 }), NOW)).toBe('learning'); // 拿不到 ms 数值 ⇒ 不判 mastered
    expect(stageOf(cast({ word: 'k', state: 2, nextDue: String(NOW + 10 * DAY) }), NOW)).toBe('learning'); // 只按数值
    // 反证：去掉 `state` 后同一批夹具全走降级分支，落档与上面逐条一致（该支一字未动）
    expect(stageOf(cast({ word: 'k', reviewCount: 2, lapses: 0, nextDue: NOW + 10 * DAY }), NOW)).toBe('mastered');
    expect(stageOf(cast({ word: 'k', reviewCount: 2, nextDue: NOW + DAY }), NOW)).toBe('learning');
    expect(stageOf(cast({ word: 'k', reviewCount: 2, lapses: 7, nextDue: NOW + 10 * DAY }), NOW)).toBe('learning');
    expect(stageOf(cast({ word: 'k' }), NOW)).toBe('new');
  });
});
