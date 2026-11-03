/**
 * T-17 判据自证（App 查词页）—— `apps/app/test/lookup-screen.spec.tsx`。
 *
 * 覆盖：判据①（搜索框固定位置 / 无 130px 死占位）、判据②（结果收为精简条 + 查看详情）、
 * 判据③（最近查询面板恢复）、判据⑤（无横向滚动的可机检替代量）、判据⑥（未登录可查可读、
 * 点收藏走登录），外加 Chrome84 红线在本任务四个新文件上的源码级哨兵。
 *
 * jsdom 没有排版引擎 ⇒ 判据①/⑤ 用**可判真假的替代测量**（架构 §10.2 T-23 判据④ 同口径）：
 *  - ①「连查 3 次 `getBoundingClientRect().top` 差值 = 0」→ 三条等价不变量：搜索框与其容器
 *    在三次查询前后是**同一个 DOM 节点实例**（未被卸载重挂 ⇒ 不存在跳位的重排）、四段顺序
 *    `hero → search-dock → cta-row → result-region` 恒定（结果只往最后一段里加）、
 *    `lookup-search-dock` 的 className 含 `sticky top-0`；
 *  - ⑤「375×667 / 412×915 无横向滚动」→ 渲染树里不存在内联固定宽度 > 375px、不存在
 *    `w-[…]`/`min-w-[…]` 任意值、不存在 `whitespace-nowrap`；真机量测在「未跑清单」里交给 T-23。
 *
 * 网络：只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），不断言实现细节。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LOOKUP_COPY, WORDBOOK_COPY } from '@tm/shared';
import LookupScreen, { planSubmit } from '../src/screens/LookupScreen.js';
import { WORDBOOK_APP_COPY } from '../src/components/wordbook-toolbar.js';
import { SYNC_STATE_KEY } from '../src/data/offline-queue.js';
import { navigate, resetRouterForTest } from '../src/router.js';
import type { UiHost } from '@tm/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

const EN2ZH_HIT = {
  word: 'happy',
  phonetic: 'ˈhæpi',
  translation: 'adj. 快乐的\nn. 幸福',
  definition: 'feeling pleasure and enjoyment',
  groups: [
    { pos: 'adj.', meanings: ['快乐的', '幸福的'] },
    { pos: 'n.', meanings: ['幸福'] },
  ],
  exchange: { past: 'happied', plural: 'happies' },
  examples: [{ en: 'I am happy.', zh: '我很快乐。' }],
  freq: 4,
  tag: '',
  detail: '',
  audio: '',
};

const EN2ZH_MISS = {
  word: 'zzzz',
  phonetic: '',
  translation: '',
  groups: [],
  exchange: {},
  examples: [],
  notFound: true,
};

const ZH2EN_HIT = {
  query: '快乐',
  sourceLang: 'zh' as const,
  results: [
    {
      word: 'happy',
      pos: 'adj.',
      definition: '快乐的',
      examples: [],
      synonyms: ['glad'],
      phonetic: 'ˈhæpi',
    },
    {
      word: 'cheerful',
      pos: 'adj.',
      definition: '愉快的',
      examples: [],
      synonyms: [],
      phonetic: 'ˈtʃɪəfʊl',
    },
  ],
  error: null,
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let fetchCalls: FetchCall[] = [];
let speakSpy: ReturnType<typeof vi.fn>;
let toastSpy: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

/** `handler(url)` 返回 `[status, body]`；返回 `null` = 该请求**挂住不返回**（测骨架屏用）。 */
function stubFetch(handler: (url: string) => [number, unknown] | null): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({
      url,
      method: String(init?.method ?? 'GET'),
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
    });
    const outcome = handler(url);
    if (outcome === null) return new Promise<Response>(() => undefined);
    const [status, body] = outcome;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
}

/** 本任务自己的 host：`kv` 走 localStorage，`speak`/`toast` 换成 spy（不碰 `<audio>` 与 banner）。 */
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

/**
 * 让微任务与**宏任务**都落地：`@tanstack/react-query` 的观察者通知走 `NotifyManager` 的
 * `setTimeout` 批处理（默认 >0ms），只排空微任务队列会出现"请求已发出、结果还没上屏"。
 * 单轮 12ms 超过该批处理窗口，6 轮把 `enabled`/`staleTime` 的连锁渲染也走完；
 * 总耗时 ~72ms，仍在 §3.1.5 的 300ms 骨架门槛之内（骨架那一条用例自己再等到 340ms）。
 */
async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

function render(): void {
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <LookupScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

function unmount(): void {
  act(() => root.unmount());
  container.remove();
}

function querySelector<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

/**
 * `ConfirmSheet` = Radix `Dialog`，默认渲染进 `document.body` 的 portal ⇒ 弹层断言必须跳出容器。
 */
function bodyText(): string {
  return document.body.textContent ?? '';
}

function bodyButton(label: string): HTMLElement | null {
  return (
    Array.from(document.body.querySelectorAll<HTMLElement>('button')).find(
      (el) => (el.textContent ?? '').trim() === label,
    ) ?? null
  );
}

function type(value: string): void {
  const input = querySelector<HTMLInputElement>('[data-testid=lookup-search] input')!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit(value: string): void {
  type(value);
  const form = querySelector<HTMLElement>('[data-testid=lookup-search]');
  const input = querySelector<HTMLInputElement>('[data-testid=lookup-search] input')!;
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    void form;
  });
}

function click(el: Element | null): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function focusInput(): void {
  const input = querySelector<HTMLInputElement>('[data-testid=lookup-search] input')!;
  act(() => {
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.focus();
  });
}

function blurInput(): void {
  const input = querySelector<HTMLInputElement>('[data-testid=lookup-search] input')!;
  act(() => {
    input.blur();
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });
}

/** 源码级哨兵只看代码：文件头把红线 API 名写在注释里会自指，先剥掉注释再匹配。 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

const SOURCES = [
  '../src/screens/LookupScreen.tsx',
  '../src/screens/WordDetailScreen.tsx',
  '../src/components/result-row.tsx',
  '../src/components/ai-mnemonic-bar.tsx',
].map((p) => {
  const text = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  return { path: p, text, code: codeOnly(text) };
});

/* ═════════════════ 用例 ═════════════════ */

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  resetRouterForTest('/');
  fetchCalls = [];
  speakSpy = vi.fn();
  toastSpy = vi.fn();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe('判据① 搜索框固定位置（修① / R-19④）', () => {
  it('连查 3 次：搜索框节点实例不变、四段顺序不变、无 130px 占位', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();

    const input = querySelector<HTMLDivElement>('[data-testid=lookup-search] input');
    const dock = querySelector<HTMLElement>('[data-testid=lookup-search-dock]');
    const hero = querySelector<HTMLElement>('[data-testid=lookup-hero]');
    expect(input).not.toBeNull();
    expect(dock).not.toBeNull();
    expect(dock!.className).toContain('sticky');
    expect(dock!.className).toContain('top-0');
    const orderBefore = Array.from(container.children).map((child) =>
      (child as HTMLElement).dataset.testid,
    );

    for (const word of ['happy', 'cheerful', 'glad']) {
      submit(word);
      await settle();
      /* 每次结果都渲染完，再检查"框还是那个框" */
      expect(querySelector('[data-testid=lookup-result]')).not.toBeNull();
      expect(container.querySelector('[data-testid=lookup-search] input')).toBe(input);
      expect(container.querySelector('[data-testid=lookup-search-dock]')).toBe(dock);
      expect(container.querySelector('[data-testid=lookup-hero]')).toBe(hero);
    }

    const orderAfter = Array.from(container.children).map((child) =>
      (child as HTMLElement).dataset.testid,
    );
    expect(orderAfter).toEqual(orderBefore);

    /* 无 130px 死占位：渲染树上没有任何内联 padding-bottom，源码里也不许出现这两个写法 */
    const withInlinePadding = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el.style.paddingBottom !== '' || el.getAttribute('style')?.includes('130px'),
    );
    expect(withInlinePadding).toHaveLength(0);
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/padding-bottom\s*:\s*130px/);
      expect(source.code, source.path).not.toMatch(/paddingBottom/);
    }
  });

  it('未查询时结果区不放任何占位卡（§3.1.5 默认态）', () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    expect(querySelector('[data-testid=lookup-result]')).toBeNull();
    expect(querySelector('[data-testid=lookup-result-region]')?.childElementCount).toBe(1);
    expect(querySelector('[data-testid=lookup-result-region]')?.firstElementChild?.childElementCount).toBe(0);
  });

  it('查询中 <300ms 不闪骨架；≥300ms 才出条状骨架（不是整页转圈、不是文字）', async () => {
    stubFetch(() => null); // 挂住不返回
    render();
    submit('happy');
    await settle();
    expect(querySelector('[data-testid=lookup-result-skeleton]')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 340));
    });
    expect(querySelector('[data-testid=lookup-result-skeleton]')).not.toBeNull();
    expect(querySelector('[data-testid=lookup-result-region]')?.textContent).toBe('');
  });
});

describe('判据② 结果收为精简条 + 查看详情（修② / R-07③）', () => {
  it('英译中 = 一颗结果条：词 + 音标 + 首义 + 查看详情；完整区块一个都不许出现', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();

    const bar = querySelector<HTMLElement>('[data-testid=lookup-result-bar]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('happy');
    expect(bar?.textContent).toContain('快乐的');
    const detail = querySelector<HTMLAnchorElement>('[data-testid=lookup-result-bar] a[href]');
    expect(detail?.getAttribute('href')).toBe('/word/happy?from=home');
    expect(detail?.getAttribute('aria-label')).toBe('查看 happy 的完整释义');
    expect(detail?.textContent).toContain('查看详情');

    /* 精简 = 减法：例句 / 英文释义 / AI 记法 / 词形变化都不许回流到本页 */
    const region = querySelector<HTMLElement>('[data-testid=lookup-result-region]')!;
    expect(region.textContent).not.toContain('AI 记法');
    expect(region.textContent).not.toContain('英文释义');
    expect(region.textContent).not.toContain('词形变化');
    expect(region.textContent).not.toContain('feeling pleasure and enjoyment');
    expect(region.textContent).not.toContain('I am happy.');
    /* 收藏只有星标图标（§3.2「禁止在结果条出现"加入单词本"大按钮」） */
    expect(region.querySelector('button[aria-pressed]')).not.toBeNull();
    expect(region.textContent).not.toContain('加入单词本');
  });

  it('中译英 = 条目列表（每条 词 + 首义 + 喇叭），点行进详情', async () => {
    stubFetch((url) =>
      url.includes('direction=zh2en') ? [200, ZH2EN_HIT] : [200, EN2ZH_MISS],
    );
    render();
    submit('快乐');
    await settle();

    const rows = container.querySelectorAll('[data-testid=lookup-result-row]');
    expect(rows.length).toBe(2);
    expect(querySelector('[data-testid=lookup-result-rows]')?.textContent).toContain('cheerful');
    /* R-14④：每条行内有喇叭（第 1 轮 `ZhResultList` 漏了 `onSpeak` ⇒ 本轮补，见报告 §1） */
    const speakers = container.querySelectorAll('[data-testid=lookup-result-row] button[aria-label]');
    expect(speakers.length).toBeGreaterThan(0);
    click(speakers[0]!);
    expect(speakSpy).toHaveBeenCalledWith('happy', 'us');
    expect(querySelector('[data-testid=lookup-direction-link]')).not.toBeNull();
  });

  it('「查看详情」在 `file://` 下不整页跳走：捕获层 preventDefault + 走 hash 路由', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();
    click(querySelector('[data-testid=lookup-result-bar] a[href]'));
    expect(window.location.hash).toBe('#/word/happy?from=home');
  });

  it('有词头无释义（R-09④）：首义位给出定稿提示，不出现 undefined / 空白卡', async () => {
    stubFetch(() => [200, { ...EN2ZH_HIT, groups: [], translation: '', definition: '' }]);
    render();
    submit('happy');
    await settle();
    const bar = querySelector<HTMLElement>('[data-testid=lookup-result-bar]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('暂时没查到中文解释');
    expect(container.textContent).not.toMatch(/undefined/);
  });
});

describe('判据③ 最近查询面板恢复（修③ / R-10）', () => {
  it('未聚焦时整棵子树不渲染；聚焦即出现；查到后写一条并显示相对时间', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    expect(querySelector('[data-testid=lookup-recent-panel]')).toBeNull();

    focusInput();
    expect(querySelector('[data-testid=lookup-recent-panel]')).not.toBeNull();
    /* 聚焦且无历史：面板仍浮出，给 108px 空态那一行（§3.1.5:564）。
     * §3.3:625「头部行……**无历史时整行不渲染**，不是置灰」⇒ 标题 `最近查询` 此刻必须**缺席**
     * （它属于头部行，与 `清空` 同一条），所以下面两行一个正向、一个反向。 */
    expect(container.textContent).toContain('查过的词会出现在这里，最多记 20 个');
    expect(container.textContent).not.toContain('最近查询');
    blurInput();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(querySelector('[data-testid=lookup-recent-panel]')).toBeNull();

    submit('happy');
    await settle();
    focusInput();
    const panel = querySelector<HTMLElement>('[data-testid=lookup-recent-panel]');
    /* 有历史才浮出头部行（§3.3:625），文案取 `LOOKUP_COPY.recent.title`（§6:1467）。 */
    expect(panel?.textContent).toContain('最近查询');
    expect(panel?.textContent).toContain('happy');
    expect(panel?.textContent).toContain('快乐的');
    expect(panel?.textContent).toContain('刚刚');
    expect(localStorage.getItem('tm:recent-searches')).toContain('"word":"happy"');
  });

  it('点条目 = 复用缓存结果，0 次多余请求（R-10③）；同词重复查前移不重复堆叠（R-10⑤）', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();
    expect(fetchCalls.filter((c) => c.url.includes('/api/lookup'))).toHaveLength(1);

    focusInput();
    const item = querySelector<HTMLElement>(
      '[data-testid=lookup-recent-panel] button, [data-testid=lookup-recent-panel] li > *',
    );
    expect(item).not.toBeNull();
    click(item);
    await settle();
    expect(fetchCalls.filter((c) => c.url.includes('/api/lookup'))).toHaveLength(1);
    expect(querySelector<HTMLInputElement>('[data-testid=lookup-search] input')?.value).toBe('happy');
    expect(querySelector('[data-testid=lookup-result-bar]')).not.toBeNull();

    const stored = JSON.parse(localStorage.getItem('tm:recent-searches') ?? '[]') as unknown[];
    expect(stored).toHaveLength(1);
  });

  it('清空走 `ConfirmSheet` 二次确认，确认后本机记录清空（§3.3 / R-10④）', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();
    focusInput();
    const clear = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid=lookup-recent-panel] button'),
    ).find((el) => el.textContent === '清空');
    click(clear ?? null);
    /* `ConfirmSheet` = Radix `Dialog`，portal 挂进 `document.body` ⇒ 断言必须跳出容器（见 `bodyText`）。
     * 文案取 `LOOKUP_COPY.recent.clearConfirmTitle/Body`，与 §6:1467 定稿串一字不差。 */
    const dialog = document.body.querySelector<HTMLElement>('[data-testid=lookup-clear-confirm]');
    expect(dialog).not.toBeNull();
    expect(bodyText()).toContain('清空最近查询？');
    expect(bodyText()).toContain('只清这一台设备上的记录。');
    /* 二次确认 = 确认前不许清空（R-10④ 防误触） */
    expect(localStorage.getItem('tm:recent-searches')).toContain('"word":"happy"');
    const confirm = Array.from(dialog!.querySelectorAll<HTMLElement>('button')).find(
      (el) => el.textContent === '清空',
    );
    click(confirm ?? null);
    await settle();
    expect(JSON.parse(localStorage.getItem('tm:recent-searches') ?? '[]')).toEqual([]);
  });

  it('小组件直达（R-20③）：挂载时有一次聚焦令牌 ⇒ 聚焦并展开面板', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    const focus = await import('../src/native/launch-focus.js');
    focus.requestSearchFocus();
    render();
    await settle();
    expect(querySelector('[data-testid=lookup-recent-panel]')).not.toBeNull();
    expect(focus.takeSearchFocusRequest()).toBe(false);
  });
});

describe('判据⑥ 未登录可查可读 + 点收藏走登录（R-16①② / R-23①）', () => {
  it('查词请求不带 Authorization；星标点击把词带进登录页（不报错、不静默入库）', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();

    const lookup = fetchCalls.find((c) => c.url.includes('/api/lookup'));
    expect(lookup).toBeDefined();
    expect(lookup!.headers.Authorization).toBeUndefined();
    expect(querySelector('[data-testid=lookup-result]')).not.toBeNull();

    click(querySelector<HTMLElement>('[data-testid=lookup-result-bar] button[aria-pressed]'));
    expect(window.location.hash).toBe('#/login?intent=favorite&word=happy');
    expect(localStorage.getItem('tm:pending-favorite')).toBe('happy');
  });

  it('已登录才发词本列表请求；星标写入走本地队列（离线优先 R-20①⑤）并给可撤销 toast', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    /* 词本列表的合法形状 = `WordbookGetResultSchema` 的 `{ data: […] }`（旧 APK 兼容矩阵成员，
     * 见 `data/queries/wordbook.ts` 的 parse 顺序：先试 `{data}`，再试裸数组；`{words}` 两种都不是）。 */
    stubFetch((url) => (url.includes('/api/wordbook') ? [200, { data: [] }] : [200, EN2ZH_HIT]));
    render();
    submit('happy');
    await settle();

    const star = querySelector<HTMLElement>('[data-testid=lookup-result-bar] button[aria-pressed]');
    click(star);
    await settle();
    expect(star?.getAttribute('aria-pressed')).toBe('true');
    expect(toastSpy).toHaveBeenCalledWith('已放进单词本', expect.objectContaining({ tone: 'success' }));
    expect(fetchCalls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('取消收藏要二次确认（§3.4.3 / R-16①），确认后走删除', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    /* `{ data: […] }` 才是 `GET /api/wordbook` 的合法形状（见上一条用例的注释）：
     * 传 `{ words: […] }` 会被 parse 拒掉 → 列表读不出来 → 星标停在"未收藏"，二次确认压根不出现。 */
    stubFetch((url) =>
      url.includes('/api/wordbook') ? [200, { data: [{ word: 'happy' }] }] : [200, EN2ZH_HIT],
    );
    render();
    submit('happy');
    await settle();
    const star = querySelector<HTMLElement>('[data-testid=lookup-result-bar] button[aria-pressed]')!;
    expect(star.getAttribute('aria-pressed')).toBe('true');
    click(star);
    await settle();
    /* 弹层在 `document.body` 的 portal 里（Radix `Dialog`），容器内查不到。 */
    expect(bodyText()).toContain('从单词本移除？');
    expect(bodyText()).toContain('happy 会从单词本移除，复习记录一并删除。');
    /* 确认前不许真删（R-16①） */
    expect(star.getAttribute('aria-pressed')).toBe('true');
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const remove = Array.from(dialog?.querySelectorAll<HTMLElement>('button') ?? []).find(
      (el) => el.textContent?.trim() === '移除',
    );
    click(remove ?? null);
    await settle();
    expect(star.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * A-46 #98（T-14d）：两颗星的两条写点（收藏 = `addWord`、取消收藏 = `removeWord`）此前
   * 直接吃 `offline-queue.saveState` 的抛错 ⇒ 未捕获异常 + 无反馈。故障注入走**真链路**
   * （`vi.spyOn(Storage.prototype, 'setItem')`，钉法照 `offline-queue.spec.ts:293`），
   * 不在 `data/queries/wordbook.js` 的导入接缝上 `vi.mock`（那样测不到 `kvSet → localStorage`，
   * 见 A-46 #97）。`act()` 会把未捕获异常顶成用例失败，所以「点了没红」本身就是不抛的断言。
   */
  it('收藏写盘失败（真链路 `Storage.setItem` 抛）⇒ 星标不落、不发 `已放进单词本`、给可读反馈', async () => {
    localStorage.setItem('tm.token', 't-14d-test');
    stubFetch((url) => (url.includes('/api/wordbook') ? [200, { data: [] }] : [200, EN2ZH_HIT]));
    render();
    submit('happy');
    await settle();

    const star = querySelector<HTMLElement>('[data-testid=lookup-result-bar] button[aria-pressed]')!;
    expect(star.getAttribute('aria-pressed')).toBe('false');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      click(star);
      await settle();
      /* 不谎报成功：星标停在未收藏，成功承诺 0 次出现 */
      expect(star.getAttribute('aria-pressed')).toBe('false');
      const messages = toastSpy.mock.calls.map((call) => call[0]);
      expect(messages).not.toContain(LOOKUP_COPY.favoriteToast.body);
      const failure = toastSpy.mock.calls[toastSpy.mock.calls.length - 1];
      expect(failure?.[0]).toBe(WORDBOOK_COPY.favoriteNotSaved);
      expect((failure?.[1] as { tone?: string } | undefined)?.tone).toBe('error');
      /* §6.6：反馈串里不许出现内部名词 */
      expect(String(failure?.[0])).not.toMatch(/云端|本地|缓存|未接入|token|数据源/);
      /* 内存兜底没被当成写成了：盘上压根没有这条队列 */
      expect(localStorage.getItem(SYNC_STATE_KEY)).toBeNull();
    } finally {
      spy.mockRestore();
    }

    /* 写盘恢复后再点：走真成功路径（证明上面的红是写失败、不是星标坏了）。 */
    click(star);
    await settle();
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(toastSpy.mock.calls[toastSpy.mock.calls.length - 1]?.[0]).toBe(
      LOOKUP_COPY.favoriteToast.body,
    );
  });

  it('取消收藏写盘失败 ⇒ 星标留在已收藏 + 同一条反馈；成功后撤销也只在落账后才落星标', async () => {
    localStorage.setItem('tm.token', 't-14d-test');
    stubFetch((url) =>
      url.includes('/api/wordbook') ? [200, { data: [{ word: 'happy' }] }] : [200, EN2ZH_HIT],
    );
    render();
    submit('happy');
    await settle();
    const star = querySelector<HTMLElement>('[data-testid=lookup-result-bar] button[aria-pressed]')!;
    expect(star.getAttribute('aria-pressed')).toBe('true');
    /* 二次确认（§3.4.3）先正常开出来 */
    click(star);
    await settle();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const remove = Array.from(dialog?.querySelectorAll<HTMLElement>('button') ?? []).find(
      (el) => el.textContent?.trim() === LOOKUP_COPY.unfavoriteConfirm.confirm,
    );

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      click(remove ?? null);
      await settle();
      expect(star.getAttribute('aria-pressed')).toBe('true');
      const last = toastSpy.mock.calls[toastSpy.mock.calls.length - 1];
      expect(last?.[0]).toBe(WORDBOOK_APP_COPY.deleteNotQueued);
      expect((last?.[1] as { tone?: string } | undefined)?.tone).toBe('error');
      expect(localStorage.getItem(SYNC_STATE_KEY)).toBeNull();
    } finally {
      spy.mockRestore();
    }
    /* 恢复写盘 → 同一条路真删成功：星标落回未收藏，且这次盘上确实有那条待删 */
    click(star);
    await settle();
    const dialog2 = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const remove2 = Array.from(dialog2?.querySelectorAll<HTMLElement>('button') ?? []).find(
      (el) => el.textContent?.trim() === LOOKUP_COPY.unfavoriteConfirm.confirm,
    );
    click(remove2 ?? null);
    await settle();
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem(SYNC_STATE_KEY) ?? '{}').pendingRemovals).toEqual([
      'happy',
    ]);
  });
});

describe('状态表补充（§3.1.5 空/错误/方向链）', () => {
  it('无结果 = 空态 + 换个方向查；方向链点一次即改判（R-07② 无方向按钮）', async () => {
    stubFetch(() => [200, EN2ZH_MISS]);
    render();
    submit('zzzz');
    await settle();
    expect(querySelector('[data-testid=lookup-result-empty]')).not.toBeNull();
    expect(container.textContent).toContain('没找到这个词');
    expect(querySelector('[data-testid=home-direction-buttons]')).toBeNull();

    click(querySelector('[data-testid=lookup-direction-link]'));
    await settle();
    const last = fetchCalls[fetchCalls.length - 1]!;
    /* 点了必须**真的再发一次**（查询键随方向变），否则 `last` 就是第一次那条。 */
    expect(fetchCalls.filter((c) => c.url.includes('/api/lookup')).length).toBe(2);
    expect(last.url).toContain('direction=zh2en');
  });

  it('请求失败 = 主按钮「重试」（禁只有文字的死路），点了确实重发请求', async () => {
    let fail = true;
    stubFetch(() => (fail ? [500, { error: 'boom' }] : [200, EN2ZH_HIT]));
    render();
    submit('happy');
    await settle();
    expect(querySelector('[data-testid=lookup-result-error]')).not.toBeNull();
    const retry = Array.from(container.querySelectorAll<HTMLElement>('button')).find(
      (el) => el.textContent === '重试',
    );
    expect(retry).toBeDefined();
    expect(retry!.tagName).toBe('BUTTON');

    fail = false;
    click(retry!);
    await settle();
    expect(querySelector('[data-testid=lookup-result-bar]')).not.toBeNull();
  });
});

describe('判据⑤ + Chrome84 红线（源码级）', () => {
  it('本任务四个新文件不含 Chrome84 之后的 API', () => {
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/structuredClone\s*\(/);
      expect(source.code, source.path).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
      expect(source.code, source.path).not.toMatch(/requestIdleCallback/);
      expect(source.code, source.path).not.toMatch(/\.at\s*\(/);
    }
  });

  it('375 / 412 无横向滚动的可机检替代量：无固定像素宽、无任意值宽度、无 nowrap', async () => {
    stubFetch(() => [200, EN2ZH_HIT]);
    render();
    submit('happy');
    await settle();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      const width = el.style.width;
      if (width.endsWith('px')) expect(Number.parseInt(width, 10)).toBeLessThanOrEqual(375);
      expect(el.className.toString(), el.dataset.testid ?? el.tagName).not.toMatch(/\b(?:min-)?w-\[/);
      expect(el.className.toString()).not.toMatch(/whitespace-nowrap/);
    }
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/\bw-\[\d+px\]/);
    }
  });
});

describe('planSubmit（方向钉死，判据②/③ 的键对齐点）', () => {
  it('纯英文 → en2zh、纯中文 → zh2en、换文本回自动判定、点过方向链后钉住', () => {
    expect(planSubmit('Happy', null).applied).toBe('en2zh');
    expect(planSubmit('快乐', null).applied).toBe('zh2en');
    const pinned = planSubmit('happy', planSubmit('happy', null), 'zh2en');
    expect(pinned.applied).toBe('zh2en');
    expect(pinned.override).toBe('zh2en');
    expect(planSubmit('glad', pinned).applied).toBe('en2zh');
    expect(planSubmit('   ', pinned)).toEqual({ text: '', applied: 'auto', override: 'auto' });
    expect(planSubmit(`x${'y'.repeat(200)}`, null).text).toHaveLength(64);
  });
});

describe('E4b4 件D：「翻面」两端 0 第二份实现反向哨（A-89 #342 单点上收 `@tm/shared`）', () => {
  it('App 四源 + Web 两源的 code 面 `flippedDirection` 命中 0（旧名连转发壳都不许留）', () => {
    /* ⚠ 不放进 `SOURCES`（那颗被上面的用例遍历用着）：哨内部自列 Web 两颗，同源 `codeOnly()` 剥注释。 */
    const WEB_SOURCES = [
      '../../web/src/lib/api/lookup-stream.ts',
      '../../web/src/lib/hooks/use-lookup.ts',
    ].map((p) => {
      const text = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
      return { path: p, code: codeOnly(text) };
    });
    for (const source of [...SOURCES, ...WEB_SOURCES]) {
      expect(source.code, source.path).not.toMatch(/flippedDirection/);
    }
  });
});
