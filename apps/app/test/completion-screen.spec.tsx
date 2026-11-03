/**
 * T-18a 判据自证（App 背词完成页）—— `apps/app/test/completion-screen.spec.tsx`。
 *
 * 覆盖 PRD `R-13 ①②③⑤⑥`（完成页侧）+ UI §3.5.6 完成页版式 + §3.5.7 完成页无障碍
 * + §6.6 禁词清单 + §5.1 Chrome84 红线。用例编号 `C-01…C-11` 见交付报告映射表。
 *
 * 三条判据怎么落成可机检量：
 *  - **R-13②「走完最后一张不产生新评分记录、不许 index 归 0 回第一张」**：本页任何交互
 *    （含点遍两颗按钮与打卡）之后 `POST /api/review` / `POST /api/review/undo` 计数恒为 0，
 *    且地址仍停在 `#/study/done?…`。与 `study-screen.spec.tsx` 的 S-19 构成同一份契约的两半
 *    （`completionHref` ↔ `parseSummaryQuery` 往返一致）。
 *  - **R-13⑥「完成页 / 我的页 / tab 红点三处数字同一时刻相等」**：可机检的那两半在这里做 ——
 *    ① 完成页与取数面**只发一次** `GET /api/checkin/status`（连续天数没有第二份真相）；
 *    ② 待背数经 `useDueBadge()` 写进 `data/startup.ts` 的 store，也就是 tab 红点读的那一份，
 *      于是"相等"由构造保证。`我的`页（`MeScreen`，T-19 名下）那一处只能在 T-19 断言 ⇒ 跨任务项。
 *  - **§3.5.6 的 34px 大数字、44px 命中区**：jsdom 无排版引擎 ⇒ 断 `tnum` + `text-[34px]` 类名
 *    与 `min-h-tap`（§1.12.2 的 44px preset），像素实测归 T-23 真机清单。
 *
 * 异步断言用 `settle()` 等**真宏任务**（`@tanstack/react-query` 的 `NotifyManager` 走 `setTimeout`，
 * 只排空微任务会假红 —— 见 T-17 在 `detail-screen.spec.tsx` 的实测教训）。
 *
 * 网络：只 stub `globalThis.fetch`（`data/rest-fetcher.ts` 的唯一出口）。
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
  AUTH_COPY,
  CHECKIN_COPY,
  RATING_LABELS,
  RATING_VALUES,
  STUDY_COPY,
  VERBS,
  formatDuration,
  type RatingValue,
} from '@tm/shared';
import CompletionScreen, {
  parseSummaryQuery,
  summaryRows,
  type SummaryView,
} from '../src/screens/CompletionScreen.js';
import { COMPLETION_PATH } from '../src/screens/StudyScreen.js';
import { getSyncStatus } from '../src/data/startup.js';
import { navigate, resetRouterForTest } from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

/** §3.5.6 版式示例的那一轮：`12 张 / 忘记 2 · 困难 1 · 良好 6 · 轻松 3 / 用时 4 分 12 秒`。 */
const DONE_URL = `${COMPLETION_PATH}?mode=review&cards=12&r1=2&r2=1&r3=6&r4=3&sec=252`;

interface FetchCall {
  path: string;
  method: string;
  url: string;
}

let fetchCalls: FetchCall[] = [];
let toastSpy: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let signedIn = true;
let mounted = false;

const api = {
  /** 打卡状态（服务端实际给的是 `checkedIn` 这个键，`due-badge-data.tsx` 的 `checkedInOf` 认它）。 */
  status: { checkedIn: false, streak: 36, dailyGoal: 20, doneToday: 12 },
  dueToday: 7,
  checkin: 'ok' as 'ok' | 'fail',
};

function resetApi(): void {
  api.status = { checkedIn: false, streak: 36, dailyGoal: 20, doneToday: 12 };
  api.dueToday = 7;
  api.checkin = 'ok';
}

function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    fetchCalls.push({ url, path, method: String(init?.method ?? 'GET') });
    let body: unknown = {};
    if (path === '/api/checkin/status') body = api.status;
    else if (path === '/api/checkin') {
      if (api.checkin === 'fail') {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: 'boom' }),
          json: async () => ({ error: 'boom' }),
        } as unknown as Response;
      }
      api.status = { ...api.status, checkedIn: true, streak: 37 };
      body = { ok: true };
    } else if (path === '/api/review/queue') {
      body = {
        mode: 'review',
        total: 30,
        dueToday: api.dueToday,
        queue: [{ word: 'happy', gloss: '快乐的', hasCard: true }],
      };
    } else if (path === '/api/wordbook') body = { data: [{ word: 'happy' }] };
    return {
      ok: true,
      status: 200,
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
    speak: () => undefined,
    navigate: (to: string) => navigate(to),
    toast: (message: string, options?: never) => toastSpy(message, options),
  };
}

/** 等**真宏任务**（每轮 12ms 盖过 `NotifyManager` 的批处理窗口，6 轮走完连锁渲染）。 */
async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

function render(path = DONE_URL): void {
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  if (signedIn) localStorage.setItem('tm.token', 't-18a-r2');
  container = document.createElement('div');
  document.body.appendChild(container);
  window.location.hash = `#${path}`;
  resetRouterForTest(path);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <CompletionScreen />
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
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector) ?? document.body.querySelector<T>(selector);
}

function text(scope: string): string {
  return q<HTMLElement>(scope)?.textContent ?? '';
}

function buttons(scope: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`${scope} button`));
}

function byText(label: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('button')).find(
      (el) => (el.textContent ?? '').trim() === label,
    ) ?? null
  );
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function hash(): string {
  return window.location.hash;
}

function countCalls(path: string, method = 'GET'): number {
  return fetchCalls.filter((c) => c.path === path && c.method === method).length;
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

function visibleCopy(code: string): string {
  const literals = code.match(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g) ?? [];
  /* JSX 文本子节点：`>` 与 `<` 之间那段**不含任何代码标点**的才是文案。箭头函数会让 `=>` 的 `>`
     一路吃到下一个 `<`（`onAgain={…}` 这类），故显式排除；上屏文字全量覆盖见 C-10 的运行时那一半。 */
  const jsxText = (code.match(/>[^<>{}]+</g) ?? [])
    .map((chunk) => chunk.slice(1, -1))
    .filter((chunk) => !/[=&|;,:!?(){}\[\]]/.test(chunk));
  return [...literals, ...jsxText].join('\n');
}

/**
 * 打卡完成态那颗按钮的**可读**文案：`CompletionScreen.tsx:260-261` 在文案后面挂了一个
 * `aria-hidden="true"` 的 `✓` 装饰符（读屏不念），故摘掉装饰节点再比逐字。
 */
function checkinDoneLabel(): string {
  const el = q<HTMLElement>('[data-testid=completion-checkin-done]');
  if (!el) return '';
  const decorative = Array.from(el.querySelectorAll('[aria-hidden="true"]'))
    .map((node) => node.textContent ?? '')
    .join('');
  return (el.textContent ?? '').replace(decorative, '').trim();
}

const SOURCE = (() => {
  const p = '../src/screens/CompletionScreen.tsx';
  const src = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const code = codeOnly(src);
  return { path: p, code, copy: visibleCopy(code) };
})();

const BANNED = [
  '未接入', '暂未支持该功能', '24h 缓存', 'ClickHouse', '稳定度', '掌握度变化', '已连接', '未连接',
  '云端', '本地', 'FSRS', '以后再说', '稍后再改', '下次提醒', '宽限期', '截止日期',
  '忘记密码', '找回密码', '联系管理员', '请再按一次', '请求失败', '加载失败', '暂无数据',
  'No data', '空空如也',
];

/* ═════════════════ 装配 ═════════════════ */

beforeEach(() => {
  localStorage.clear();
  resetApi();
  fetchCalls = [];
  toastSpy = vi.fn();
  signedIn = true;
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

/* ═════════════════ R-13① 版式与数字 ═════════════════ */

describe('C-01 parseSummaryQuery：数字只从地址读，读不出来当 0', () => {
  it('缺键 / 非数字 / 负数 / 小数 / 空串一律收敛，永不出现 NaN', () => {
    expect(parseSummaryQuery({ mode: 'review', cards: '12', r1: '2', sec: '252' })).toEqual({
      mode: 'review',
      cards: 12,
      counts: { 1: 2 },
      seconds: 252,
    });
    expect(parseSummaryQuery({})).toEqual({ mode: 'review', cards: 0, counts: {}, seconds: 0 });
    for (const junk of ['-5', 'abc', '', '   ', '0', 'Infinity', '1e5x']) {
      expect(parseSummaryQuery({ cards: junk, sec: junk, r2: junk }).cards).toBe(0);
      expect(parseSummaryQuery({ cards: junk, sec: junk, r2: junk }).seconds).toBe(0);
      expect(parseSummaryQuery({ cards: junk, sec: junk, r2: junk }).counts[2]).toBeUndefined();
    }
    expect(parseSummaryQuery({ cards: '7.9' }).cards).toBe(7);
    expect(parseSummaryQuery({ mode: 'nope' }).mode).toBe('review');
    const rendered = parseSummaryQuery({ cards: 'x', sec: 'x' });
    expect(`${String(rendered.cards)}|${String(rendered.seconds)}`).toBe('0|0');
  });

  it('C-11 summaryRows：四档按 `RATING_VALUES` 序、0 的档也列出、语义色按数组序', () => {
    const rows = summaryRows({ 1: 2, 3: 6 });
    expect(rows.map((r) => r.label)).toEqual(['忘记', '困难', '良好', '轻松']);
    expect(rows.map((r) => r.rating)).toEqual([...RATING_VALUES]);
    expect(rows.map((r) => r.amount)).toEqual([2, 0, 6, 0]);
    expect(rows.map((r) => r.tone)).toEqual([
      'text-danger',
      'text-warning',
      'text-brand',
      'text-success',
    ]);
    for (const [position, rating] of RATING_VALUES.entries()) {
      expect(rows[position]?.label).toBe(RATING_LABELS[rating as RatingValue]);
    }
    expect(summaryRows({})).toHaveLength(4);
  });
});

describe('C-02 R-13① 完成页版式（§3.5.6 两端同构）', () => {
  it('本轮结束 / 12 张 / 四档明细 / 用时 4 分 12 秒 全部上屏，数字用 `tnum`', async () => {
    stubFetch();
    render();
    await settle();
    expect(q('[data-testid=completion-screen]')).not.toBeNull();
    expect(container.textContent).toContain(STUDY_COPY.summary.round);
    expect(container.textContent).toContain('本轮结束');
    const big = q<HTMLElement>('[data-testid=completion-cards]')!;
    expect(big.textContent).toBe('12 张');
    /* §3.5.6:767 唯一允许 34px 的地方 + §6.7 数字对齐 */
    expect(big.className).toContain('text-[34px]');
    expect(big.className).toContain('tnum');
    expect(text('[data-testid=completion-duration]')).toBe(`用时 ${formatDuration(252)}`);
    expect(text('[data-testid=completion-duration]')).toBe('用时 4 分 12 秒');
    expect(container.textContent).not.toMatch(/undefined|NaN|—/);
  });

  it('明细行是 `<dl>`（§3.5.7 读屏逐项念）：4 个 `dt` 标签 + 4 个 `dd` 数字，间隔号是装饰', async () => {
    stubFetch();
    render();
    await settle();
    const dl = q<HTMLElement>('[data-testid=completion-breakdown]')!;
    expect(dl.tagName).toBe('DL');
    const dts = Array.from(dl.querySelectorAll('dt')).map((el) => el.textContent);
    const dds = Array.from(dl.querySelectorAll('dd')).map((el) => el.textContent);
    expect(dts).toEqual(['忘记', '困难', '良好', '轻松']);
    expect(dds).toEqual(['2', '1', '6', '3']);
    /* 四档数字各用自己的语义色（§3.5.6:768） */
    for (const tone of ['text-danger', 'text-warning', 'text-brand', 'text-success']) {
      expect(dl.querySelector(`dd.${tone}`.replace('text-', 'text-'))).not.toBeNull();
    }
    const dots = Array.from(dl.querySelectorAll('[aria-hidden="true"]'));
    expect(dots).toHaveLength(3);
    for (const dot of dots) expect(dot.textContent).toBe('·');
  });

  it('C-03 张数为 0 的一轮也照实显示 `0 张`（空值不显示 `—`，§6.7）', async () => {
    stubFetch();
    render(`${COMPLETION_PATH}?mode=new&cards=0&sec=48`);
    await settle();
    expect(text('[data-testid=completion-cards]')).toBe('0 张');
    expect(Array.from(container.querySelectorAll('[data-testid=completion-breakdown] dd')).map((el) => el.textContent)).toEqual([
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(text('[data-testid=completion-duration]')).toBe('用时 48 秒');
  });
});

/* ═════════════════ R-13①②③⑤ 打卡入口与三按钮 ═════════════════ */

describe('C-04 R-13①③ 打卡入口常驻可点（非弹窗）', () => {
  it('未打卡：主按钮 `今天打卡` + 连续天数在同一行；点击发出一次 `POST /api/checkin` 后转为已打卡', async () => {
    stubFetch();
    render();
    await settle();
    const area = q<HTMLElement>('[data-testid=completion-checkin-area]')!;
    expect(area).not.toBeNull();
    /* 常驻 = 在页面流里，不是 portal 弹层 */
    expect(container.contains(area)).toBe(true);
    expect(byText('今天打卡')?.tagName).toBe('BUTTON');
    expect(byText('今天打卡')?.className).toContain('min-h-tap');
    expect(text('[data-testid=completion-streak]')).toBe('连续 36 天');
    expect(byText('今天打卡')?.getAttribute('aria-pressed')).toBe('false');

    click(byText('今天打卡'));
    await settle();
    expect(countCalls('/api/checkin', 'POST')).toBe(1);
    expect(checkinDoneLabel()).toBe(CHECKIN_COPY.done(37));
    expect(q('[data-testid=completion-checkin-done]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toMatch(/稍后|以后再说/);
  });

  it('已打卡：整块仍可点但**不再发请求**（幂等由服务端保证，客户端不多打）', async () => {
    api.status = { checkedIn: true, streak: 37, dailyGoal: 20, doneToday: 12 };
    stubFetch();
    render();
    await settle();
    expect(checkinDoneLabel()).toBe(CHECKIN_COPY.done(37));
    click(q('[data-testid=completion-checkin-done]'));
    await settle();
    expect(countCalls('/api/checkin', 'POST')).toBe(0);
  });

  it('C-06 R-13⑤ 打卡失败：行内人话提示 + 可点 `重试`，失败期间不显示虚假成功', async () => {
    api.checkin = 'fail';
    stubFetch();
    render();
    await settle();
    click(byText('今天打卡'));
    await settle();
    expect(q('[data-testid=completion-checkin-fail]')).not.toBeNull();
    expect(text('[data-testid=completion-checkin-fail]')).toContain('打卡没成功 · 再试一次');
    expect(byText('重试')?.tagName).toBe('BUTTON');
    expect(q('[data-testid=completion-checkin-done]')).toBeNull();
    expect(container.textContent).not.toContain('今天已打卡');

    api.checkin = 'ok';
    click(byText('重试'));
    await settle();
    expect(countCalls('/api/checkin', 'POST')).toBe(2);
    expect(q('[data-testid=completion-checkin-fail]')).toBeNull();
    expect(checkinDoneLabel()).toBe(CHECKIN_COPY.done(37));
  });

  it('C-08 未登录：打卡区给登录墙 + 一颗可点按钮带走 `from=study`，不发任何业务请求', async () => {
    signedIn = false;
    stubFetch();
    render();
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(q('[data-testid=completion-checkin-signed-out]')).not.toBeNull();
    expect(text('[data-testid=completion-checkin-signed-out]')).toContain(AUTH_COPY.wall.subtitle);
    click(byText(AUTH_COPY.wall.primary));
    expect(hash()).toBe('#/login?from=study');
    /* 本轮数字与登录态无关，照常显示（不许因为没登录就空成死页） */
    expect(text('[data-testid=completion-cards]')).toBe('12 张');
  });
});

describe('C-04b R-13② 完成页 0 条评分记录 + 不自动回第一张', () => {
  it('点遍打卡区与两颗按钮：`POST /api/review` 恒为 0，地址仍停在 `#/study/done`', async () => {
    stubFetch();
    render();
    await settle();
    expect(countCalls('/api/review', 'POST')).toBe(0);

    click(byText('今天打卡'));
    await settle();
    click(q('[data-testid=completion-checkin-done]'));
    await settle();
    expect(countCalls('/api/review', 'POST')).toBe(0);
    expect(countCalls('/api/review/undo', 'POST')).toBe(0);
    expect(hash().startsWith(`#${COMPLETION_PATH}?`)).toBe(true);
  });
});

describe('C-05 三按钮（再背一批 / 回首页）与模式对齐', () => {
  it('`再背一批` 回到**本轮那一档**（自测档带回 `?mode=selfTest`）、`回首页` 回查词 tab', async () => {
    stubFetch();
    render(`${COMPLETION_PATH}?mode=selfTest&cards=3&r1=1&r2=0&r3=1&r4=1&sec=60`);
    await settle();
    const again = q<HTMLElement>('[data-testid=completion-again]')!;
    const home = q<HTMLElement>('[data-testid=completion-home]')!;
    expect(again.textContent).toBe('再背一批');
    expect(home.textContent).toBe('回首页');
    expect(again.className).toContain('min-h-tap');
    expect(home.className).toContain('min-h-tap');
    click(again);
    expect(hash()).toBe('#/study?mode=selfTest');
  });

  it('复习档 → `再背一批` 回 `#/study`（默认档不写 query）；`回首页` → `#/`', async () => {
    stubFetch();
    render();
    await settle();
    click(q('[data-testid=completion-home]'));
    expect(hash()).toBe('#/');
    unmount();
    render();
    await settle();
    click(q('[data-testid=completion-again]'));
    expect(hash()).toBe('#/study');
  });
});

/* ═════════════════ R-13⑥（可机检的两半） ═════════════════ */

describe('C-07 R-13⑥ 三处数字同源（完成页这一处）', () => {
  it('连续天数只有一个来源：`/api/checkin/status` 全站只发一次', async () => {
    stubFetch();
    render();
    await settle();
    expect(countCalls('/api/checkin/status')).toBe(1);
    expect(text('[data-testid=completion-streak]')).toBe(CHECKIN_COPY.notDone.streak(36));
    await settle(4);
    expect(countCalls('/api/checkin/status')).toBe(1);
  });

  it('待背数写进 tab 红点读的那份 store（相等由构造保证，不是各拉一次）', async () => {
    api.dueToday = 19;
    stubFetch();
    render();
    await settle();
    expect(countCalls('/api/review/queue')).toBe(1);
    expect(getSyncStatus().dueCount).toBe(19);
    /* `我的`页那一处在 T-19 名下 ⇒ 报告里登记为跨任务项（本任务只保证同一份 store） */
  });
});

/* ═════════════════ 源码级与运行时哨兵 ═════════════════ */

describe('C-09~C-10 Chrome84 红线 / §6.6 禁词 / §3.5.7 无障碍', () => {
  it('C-09 交付文件不用 Chrome84 之后的 API', () => {
    expect(SOURCE.code).not.toMatch(/structuredClone\s*\(/);
    expect(SOURCE.code).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
    expect(SOURCE.code).not.toMatch(/requestIdleCallback/);
    expect(SOURCE.code).not.toMatch(/\.at\s*\(/);
  });

  it('C-10 §6.6 禁词清单：可见串 0 命中 + 四种状态下渲染文本 0 命中', async () => {
    for (const banned of BANNED) expect(SOURCE.copy, banned).not.toContain(banned);
    stubFetch();
    const seen: string[] = [];
    for (const path of [
      DONE_URL,
      `${COMPLETION_PATH}?mode=new&cards=0&sec=0`,
      `${COMPLETION_PATH}?mode=selfTest&cards=99&sec=3725&r1=99`,
    ]) {
      render(path);
      await settle();
      seen.push(container.textContent ?? '');
      unmount();
    }
    api.status = { checkedIn: true, streak: 37, dailyGoal: 20, doneToday: 12 };
    render(DONE_URL);
    await settle();
    seen.push(container.textContent ?? '');
    const all = seen.join('\n');
    for (const banned of BANNED) expect(all, banned).not.toContain(banned);
    expect(all).not.toMatch(/undefined|NaN|No data|空空如也/);
  });

  it('C-12 无障碍：可点元素都是真 `<button>`、无正 tabindex（Tab 序 = DOM 序）', async () => {
    stubFetch();
    render();
    await settle();
    const focusables = Array.from(container.querySelectorAll<HTMLElement>('button, a[href], [tabindex]'));
    expect(focusables.length).toBeGreaterThan(0);
    for (const el of focusables) {
      expect(el.tagName).toBe('BUTTON');
      const raw = el.getAttribute('tabindex');
      expect(raw === null || Number(raw) <= 0).toBe(true);
      expect(el.className).toContain('min-h-tap');
    }
    /* 打卡区整块可点（§3.5.6:770） */
    expect(q('[data-testid=completion-checkin]')?.tagName).toBe('BUTTON');
  });
});

describe('C-13 视图类型的边界（`SummaryView` 的形状不许漂）', () => {
  it('地址里的四档键与 `RATING_VALUES` 一一对应，多余键忽略', () => {
    const view: SummaryView = parseSummaryQuery({
      mode: 'review',
      cards: '4',
      r1: '1',
      r2: '1',
      r3: '1',
      r4: '1',
      sec: '90',
      nope: 'x',
    });
    expect(Object.keys(view.counts).sort()).toEqual(RATING_VALUES.map(String).sort());
    expect(view.seconds).toBe(90);
    expect(formatDuration(90)).toBe('1 分 30 秒');
    expect(VERBS.retry).toBe('重试');
  });
});
