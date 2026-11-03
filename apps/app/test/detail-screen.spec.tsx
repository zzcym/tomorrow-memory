/**
 * T-17 判据自证（App 词详情页）—— `apps/app/test/detail-screen.spec.tsx`。
 *
 * 覆盖：判据④（AI 记法默认收起 / 展开才请求 / 失败降级 + 重试且静态释义不受影响）、
 * 判据②另一半（§3.4.1 词形变化中文标签、原始缩写 0 上屏）、R-09③（按来源返回）、
 * R-10③（与查词页同缓存键 ⇒ 0 次多余请求）、判据⑥（未登录本页可读、星标/背词走登录）、
 * R-09④（空态/错误态，界面不出 `undefined`），外加本屏两个新文件的 Chrome84 源码级哨兵。
 *
 * **为什么直接挂 `WordDetailScreen` 而不挂 `AppRoutes`**：`apps/app/src/router.tsx` 在
 * `tools/ownership.json` 里对 T-17 是 `zeroDiffFor`（禁改），路由注册需求写在
 * 交付记录 T-17「路由注册需求」一节（原件已移出仓库）。本文件用 `resetRouterForTest('/word/happy?from=…')`
 * 造出真实 Location（`params.word` + `query.from` 走的是 `router.tsx` 自己的 `parseHash`），
 * 再挂本屏 ⇒ 页面读参的方式与注册后完全一致。
 *
 * jsdom 没有排版引擎 ⇒ 判据⑤ 用可判真假的替代量（内联固定宽度 / 任意值宽度类 / nowrap），
 * 真机 375×667、412×915 量测在报告「未跑清单」里交给 T-23。
 *
 * 网络：只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），不断言实现细节。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORD_DETAIL_COPY } from '@tm/shared';
import { UiHostProvider } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WordDetailScreen, {
  EXCHANGE_TO_LABEL_TAG,
  SOURCE_BACK_TARGET,
  detailWordOf,
  sourceBackTarget,
  toDetailParts,
} from '../src/screens/WordDetailScreen.js';
import { lookupKeys } from '../src/data/queries/lookup.js';
import { detailSourceOf } from '../src/components/result-row.js';
import { navigate, resetRouterForTest, commitLocation } from '../src/router.js';
import type { UiHost } from '@tm/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

/** 服务端 `exchange` 已被 `parseExchange`（`packages/shared/src/utils.ts:134`）改成语义名 ⇒ 夹具同形。 */
const DETAIL = {
  word: 'happy',
  phonetic: 'ˈhæpi',
  translation: 'adj. 快乐的\nn. 幸福',
  definition: 'feeling pleasure and enjoyment',
  groups: [
    { pos: 'adj.', meanings: ['快乐的', '幸福的'] },
    { pos: 'n.', meanings: ['幸福'] },
  ],
  exchange: {
    past: 'happied',
    pastParticiple: 'happied',
    present: 'happying',
    third: 'happies',
    plural: 'happies',
    comparative: 'happier',
    superlative: 'happiest',
    base: 'happy',
  },
  examples: [{ en: 'I am happy.', zh: '我很快乐。' }],
  freq: 4,
  tag: '',
  detail: '',
  audio: '',
};

const MANY_EXAMPLES = {
  ...DETAIL,
  examples: [1, 2, 3, 4, 5].map((n) => ({ en: `Sentence number ${n}.`, zh: `第 ${n} 句。` })),
};

/** 漂移夹具：服务端若直发原始缩写（`p:`/`d:`），本页也要出中文标签。 */
const RAW_TAGGED = {
  ...DETAIL,
  exchange: { 'p:': 'walked', 's:': 'walks', '0:': 'walk', '9r:': 'strange' },
};

const NOT_FOUND = {
  word: 'zzzz',
  phonetic: '',
  translation: '',
  definition: '',
  groups: [],
  exchange: {},
  examples: [],
  notFound: true,
};

/** 中译英回带（候选列表，没有词头明细）⇒ 详情页必须走空态而不是空白卡。 */
const ZH2EN = {
  query: '快乐',
  sourceLang: 'zh',
  results: [{ word: 'happy', pos: 'adj.', definition: '快乐的', examples: [], synonyms: [], phonetic: '' }],
  error: null,
};

const TUTOR_CONTENT = {
  mnemonic: 'haps = 快乐：开心就 happy',
  wordRoot: 'hap（运气、机遇）',
  sceneExamples: [{ en: 'She looks happy.', zh: '她看起来很开心。', scene: '日常寒暄' }],
  confusable: 'happy 与 luck（运气）同根，别和 hippo 混。',
};

/** `/api/tutor` 的实际回带是信封（契约偏差 D-1，见报告）⇒ 两种形状都要吃。 */
const TUTOR_ENVELOPE = { word: 'happy', level: 'cet4', cached: false, content: TUTOR_CONTENT };

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
let route = '/word/happy?from=home';

/** `handler(url)` 返回 `[status, body]`；返回 `null` = 该请求**挂住不返回**（测 loading 态用）。 */
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
 * `setTimeout` 批处理（默认 >0ms），只排空微任务队列会稳定出现"请求已发出、结果还没上屏"
 * ⇒ 本屏整张卡停在 `WordDetailCard` 的 loading 骨架（`data-testid=detail-card` 里只有 SkeletonBlock），
 * 于是 `#word-detail-head` / `#word-detail-empty` / `#word-detail-mnemonic` 全部查不到。
 * 口径与 `test/lookup-screen.spec.tsx:139` 的同名 helper 一致（单轮 12ms > 批处理窗口，12 轮把
 * `enabled`/`staleTime` 的连锁渲染走完）。
 */
async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
}

function render(options: { seed?: (qc: QueryClient) => void; reuse?: QueryClient } = {}): void {
  client =
    options.reuse ??
    new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  if (options.seed) options.seed(client);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={testHost()}>
          <WordDetailScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

function unmount(): void {
  act(() => root.unmount());
  container.remove();
}

function q<T extends Element>(selector: string): T | null {
  return container === undefined ? null : container.querySelector<T>(selector);
}

function textOf(selector: string): string {
  return (q(selector)?.textContent ?? '').trim();
}

/**
 * 只取**可读文案**节点：§3.4.2 收起行右侧的 `›`、区 6 的 `⌄` 都是 `aria-hidden` 装饰图标
 * （`03-ui-spec.md:663`「左 ✦ 图标…右 `›`；整行是一个 `<button aria-expanded=false>`」），
 * 图标不是文案串的一部分 ⇒ 逐字断言时先把它们剥掉，仍要求与 `@tm/shared` 常量逐字相等。
 */
function readableText(el: Element | null | undefined): string {
  if (!el) return '';
  let out = '';
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i += 1) {
    const node = kids[i]!;
    if (node.nodeType === 1 && (node as Element).getAttribute('aria-hidden') === 'true') continue;
    out += node.textContent ?? '';
  }
  return out.trim();
}

function click(el: Element | null): void {
  if (!el) throw new Error('找不到要点的元素');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function buttonByText(label: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('button')).find(
      (el) => (el.textContent ?? '').trim() === label,
    ) ?? null
  );
}

const tutorCalls = (): FetchCall[] => fetchCalls.filter((c) => c.url.includes('/api/tutor'));
const lookupCalls = (): FetchCall[] => fetchCalls.filter((c) => c.url.includes('/api/lookup'));

/** 源码级哨兵只看代码：文件头的红线说明会自指这些 API 名，先剥掉注释再匹配。 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

const SOURCES = [
  '../src/screens/WordDetailScreen.tsx',
  '../src/components/ai-mnemonic-bar.tsx',
].map((p) => {
  const text = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  return { path: p, text, code: codeOnly(text) };
});

/** 原始缩写上屏的判据：中文标签后面必须跟词形，不能出现 `p:`/`s:` 这类裸缩写。 */
const RAW_ABBREVIATION = /(?:^|[\s·])(?:p|d|s|z|0|1|2e|3|1e|2e|3e|R|T|ing):/;

/* ═════════════════ 用例 ═════════════════ */

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  route = '/word/happy?from=home';
  resetRouterForTest(route);
  fetchCalls = [];
  speakSpy = vi.fn();
  toastSpy = vi.fn();
  document.title = '';
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.title = '';
});

describe('判据④ AI 记法（§3.4.2 / R-09①⑥ / R-14③）', () => {
  it('进页面只有一行「点击查看」，收起态 0 次 /api/tutor 请求', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) =>
      url.includes('/api/tutor') ? [200, TUTOR_CONTENT] : url.includes('/api/wordbook') ? [200, { words: [] }] : [200, DETAIL],
    );
    render();
    await settle();

    const row = q('#word-detail-mnemonic');
    // 定稿串只在 `@tm/shared`（§6.4 词详情页区块 7），用例不抄第二份：先钉 shared 的值，
    // 再钉屏上渲染的可读文案与它逐字相等（`›` 是 `aria-hidden` 图标，见 `readableText`）。
    expect(WORD_DETAIL_COPY.mnemonicCollapsed).toBe('AI 记法 · 词根 / 口诀 · 点击查看');
    expect(readableText(row)).toBe(WORD_DETAIL_COPY.mnemonicCollapsed);
    expect(q('#word-detail-mnemonic')?.getAttribute('aria-expanded')).toBe('false');
    expect(tutorCalls()).toHaveLength(0);
    expect(q('[data-testid=ai-mnemonic-content]')).toBeNull();
    // 区块 3 的静态释义同屏可见（记法收起 ≠ 整页不可读）
    expect(textOf('[aria-label="释义"]')).toContain('快乐的');
  });

  it('展开才发 1 次请求；内容四类齐全；再点不重复发（缓存复用）', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) =>
      url.includes('/api/tutor') ? [200, TUTOR_ENVELOPE] : url.includes('/api/wordbook') ? [200, { words: [] }] : [200, DETAIL],
    );
    render();
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();

    expect(tutorCalls()).toHaveLength(1);
    expect(tutorCalls()[0]!.url).toContain('word=happy');
    expect(tutorCalls()[0]!.headers.Authorization).toBe('Bearer t-17-test');
    const box = q('[data-testid=ai-mnemonic-content]');
    expect(box).not.toBeNull();
    expect(box?.textContent).toContain(TUTOR_CONTENT.mnemonic);
    expect(box?.textContent).toContain(TUTOR_CONTENT.wordRoot);
    expect(box?.textContent).toContain(TUTOR_CONTENT.confusable);
    expect(q('[data-testid=ai-mnemonic-line]')).not.toBeNull();
    expect(q('[data-testid=ai-mnemonic-root]')).not.toBeNull();
    // 场景例句的英文行带 lang="en"（§8.1-22：`file://` 下 TalkBack 靠它切英文引擎）
    expect(box?.querySelector('p[lang="en"]')?.textContent).toContain('She looks happy.');

    // R-14③「复用缓存内容」：离开页面再进来、再展开 ⇒ 仍然 0 次新请求（`staleTime` 30 分钟）
    const cache = client;
    unmount();
    render({ reuse: cache });
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();
    expect(tutorCalls()).toHaveLength(1);
    expect(q('[data-testid=ai-mnemonic-content]')).not.toBeNull();
  });

  it('请求挂住 = 记法区骨架，其余区块照常（不整页 spinner）', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) => (url.includes('/api/tutor') ? null : url.includes('/api/wordbook') ? [200, { words: [] }] : [200, DETAIL]));
    render();
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();

    expect(tutorCalls()).toHaveLength(1);
    expect(q('#word-detail-mnemonic')).toBeNull();
    expect(q('[aria-label="AI 记法"]')?.textContent).not.toContain(TUTOR_CONTENT.mnemonic);
    expect(textOf('[aria-label="释义"]')).toContain('快乐的');
  });

  it('失败 = 降级文案 + 「再试一次」，静态释义区不受影响；重试确实再发请求', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    let fail = true;
    stubFetch((url) => {
      if (url.includes('/api/wordbook')) return [200, { words: [] }];
      if (url.includes('/api/tutor')) return fail ? [500, { error: 'boom' }] : [200, TUTOR_CONTENT];
      return [200, DETAIL];
    });
    render();
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();

    const section = q('[aria-label="AI 记法"]');
    expect(section?.textContent).toContain('AI 记法生成失败 · 重试');
    expect(buttonByText('再试一次')).not.toBeNull();
    // R-09①「失败不影响静态区」
    expect(textOf('[aria-label="释义"]')).toContain('快乐的');
    expect(textOf('[aria-label="词形变化"]')).toContain('过去式 happied');
    expect(q('[data-testid=detail-card]')?.textContent).not.toContain('undefined');

    fail = false;
    click(buttonByText('再试一次'));
    await settle();
    expect(tutorCalls()).toHaveLength(2);
    expect(q('[data-testid=ai-mnemonic-content]')).not.toBeNull();
  });

  it('服务端回空内容 = 整块不显示（不出现「AI 记法」空标题）', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) =>
      url.includes('/api/tutor')
        ? [200, { mnemonic: '', wordRoot: '', sceneExamples: [], confusable: '' }]
        : url.includes('/api/wordbook')
          ? [200, { words: [] }]
          : [200, DETAIL],
    );
    render();
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();
    expect(q('[aria-label="AI 记法"]')).toBeNull();
  });
});

describe('R-10③ 与查词页共用缓存键：详情挂载 0 次多余请求', () => {
  it('命中查词页写下的 [lookup, happy, en2zh] 缓存 ⇒ 不再发 /api/lookup', async () => {
    stubFetch(() => [200, DETAIL]);
    render({ seed: (qc) => qc.setQueryData(lookupKeys.one('happy', 'en2zh'), DETAIL) });
    await settle();
    expect(lookupCalls()).toHaveLength(0);
    expect(textOf('#word-detail-head')).toBe('happy');
    expect(textOf('[aria-label="释义"]')).toContain('快乐的');
  });

  it('未命中才发 1 次，方向钉成 en2zh（键与查词页/最近条目同源）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    expect(lookupCalls()).toHaveLength(1);
    expect(lookupCalls()[0]!.url).toContain('word=happy');
    expect(lookupCalls()[0]!.url).toContain('direction=en2zh');
  });
});

describe('R-09③ 按来源返回（§3.4 路由行）', () => {
  it('四来源 → 目标路径的唯一映射，未知来源回查词 tab', () => {
    expect(SOURCE_BACK_TARGET).toEqual({ home: '/', study: '/study', wordbook: '/wordbook', chat: '/' });
    expect(sourceBackTarget('wordbook')).toBe('/wordbook');
    expect(sourceBackTarget('study')).toBe('/study');
    expect(sourceBackTarget('chat')).toBe('/');
    expect(sourceBackTarget('home')).toBe('/');
    // 分享链/小组件直达（`?from=` 缺失或未知）按 home 兜底 ⇒ 回查词 tab
    expect(sourceBackTarget(detailSourceOf({}))).toBe('/');
    expect(sourceBackTarget(detailSourceOf({ from: 'push-banner' }))).toBe('/');
    expect(sourceBackTarget(detailSourceOf({ from: 'wordbook' }))).toBe('/wordbook');
  });

  it('无应用内历史（原生直接深链进来）点返回 = 落到来源页', async () => {
    stubFetch(() => [200, DETAIL]);
    resetRouterForTest('/word/happy?from=wordbook');
    render();
    await settle();
    click(q('[data-testid=detail-back]'));
    expect(window.location.hash).toBe('#/wordbook');
  });

  it('有应用内历史时返回 = 退一层，不吃 ?from=（返回箭头与卡片内「‹ 返回」同一实现）', async () => {
    stubFetch(() => [200, DETAIL]);
    resetRouterForTest('/');
    /**
     * 真实链路是「`navigate()` 写 hash → `router.tsx:237` 的 `hashchange` 监听（`startRouter()` 装的）
     * → `commitLocation()` 追加栈」；本文件挂单屏、没挂 `AppRoutes`，监听器不在 ⇒ 两步都手工走一遍，
     * 用的仍是路由自己的导出。栈长到 2 层才算"有应用内历史"。
     */
    navigate('/word/happy?from=study');
    commitLocation('/word/happy?from=study', false);
    await settle();
    render();
    await settle();

    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    click(q('[data-testid=detail-back]'));
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/word/happy?from=study');
  });

  it('study 来源的「去背单词」次按钮（空态兜底动作）不写第二份路由', async () => {
    stubFetch(() => [200, NOT_FOUND]);
    render();
    await settle();
    click(buttonByText('去背单词'));
    expect(window.location.hash).toBe('#/study');
  });
});

describe('判据②另一半 / §3.4.1 词形变化：只有中文标签上屏', () => {
  it('七档语义名全部映射成中文，`base`（原形）与未知档整条不渲染', () => {
    expect(EXCHANGE_TO_LABEL_TAG).toEqual({
      past: 'p:',
      pastParticiple: 'd:',
      present: 'ing:',
      third: 's:',
      plural: '1e:',
      comparative: 'R:',
      superlative: 'T:',
    });
    const parts = toDetailParts({ ...DETAIL, exchange: { ...DETAIL.exchange, unknownKey: 'x' } });
    expect(parts?.inflections.map((i) => i.form)).toEqual([
      'happied',
      'happied',
      'happying',
      'happies',
      'happies',
      'happier',
      'happiest',
    ]);
  });

  it('渲染串里没有原始缩写（`p:` / `s:` / `R:` 一律不上屏）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    const line = textOf('[aria-label="词形变化"]');
    expect(line).toContain('过去式 happied');
    expect(line).toContain('过去分词 happied');
    expect(line).toContain('现在分词 happying');
    expect(line).toContain('第三人称单数 happies');
    expect(line).toContain('复数形式 happies');
    expect(line).toContain('比较级 happier');
    expect(line).toContain('最高级 happiest');
    expect(line).not.toMatch(RAW_ABBREVIATION);
    // 区块标题用 shared 常量，不写第二份
    expect(textOf('[aria-label="词形变化"] h3')).toBe('词形变化');
  });

  it('服务端漂移直发原始缩写时，仍然出中文（`9r:` 这类未知档整条丢掉）', async () => {
    stubFetch(() => [200, RAW_TAGGED]);
    render();
    await settle();
    const line = textOf('[aria-label="词形变化"]');
    expect(line).toContain('过去式 walked');
    expect(line).toContain('第三人称单数 walks');
    expect(line).not.toContain('strange');
    expect(line).not.toMatch(RAW_ABBREVIATION);
  });

  it('无词形数据 = 整块不渲染（不出现空 <h3>）', async () => {
    stubFetch(() => [200, { ...DETAIL, exchange: {} }]);
    render();
    await settle();
    expect(q('[aria-label="词形变化"]')).toBeNull();
  });
});

describe('§3.4 区块顺序与折叠态（判据②「完整内容只在详情页」的另一半）', () => {
  it('区块顺序 2→7：词头 → 释义 → 词形 → 例句 → 英文释义 → AI 记法 → 操作区', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) => (url.includes('/api/wordbook') ? [200, { words: [] }] : [200, DETAIL]));
    render();
    await settle();

    const card = q('[data-testid=detail-card]')!;
    const nodes = Array.from(card.querySelectorAll<HTMLElement>('*'));
    const at = (label: string, selector: string): number => {
      const el = Array.from(card.querySelectorAll<HTMLElement>(selector)).find((candidate) => {
        const labelled = candidate.getAttribute('aria-labelledby');
        const text = labelled
          ? (card.ownerDocument.getElementById(labelled)?.textContent ?? '')
          : (candidate.getAttribute('aria-label') ?? '');
        return text.includes(label);
      });
      expect(el, `缺少区块「${label}」`).not.toBeUndefined();
      return nodes.indexOf(el!);
    };
    const positions = [
      at('释义', 'section'),
      at('词形变化', 'section'),
      at('例句', 'section'),
      at('英文释义', 'section'),
      at('AI 记法', 'section'),
    ];
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // 操作区（收藏 + 立即背这个词）在最后
    const actions = card.querySelector<HTMLElement>('button[aria-pressed]')!;
    expect(nodes.indexOf(actions)).toBeGreaterThan(positions[positions.length - 1]!);
  });

  it('英文释义默认收起，点一次才出正文（区块 6）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    const toggle = q('#word-detail-en-def');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('feeling pleasure and enjoyment');
    click(toggle);
    await settle();
    expect(q('#word-detail-en-def')?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('feeling pleasure and enjoyment');
  });

  it('例句 >3 折叠：按钮文案带剩余条数，点开展开全部（区块 5）', async () => {
    stubFetch(() => [200, MANY_EXAMPLES]);
    render();
    await settle();
    expect(q('[aria-label="例句"] ul')?.children).toHaveLength(3);
    const more = q('[aria-label="例句"] button');
    expect(textOf('[aria-label="例句"] button')).toBe('还有 2 句');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    click(more);
    await settle();
    expect(q('[aria-label="例句"] ul')?.children).toHaveLength(5);
  });

  it('喇叭走 host.speak（本页唯一的发音出口）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    click(q('[aria-label="朗读 happy"]'));
    expect(speakSpy).toHaveBeenCalledWith('happy', 'us');
  });
});

describe('判据⑥ 未登录本页可读（R-23①）+ 星标/背词走登录（R-16①②）', () => {
  it('未登录：详情可读、请求不带 Authorization、不发词本列表请求', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    expect(textOf('#word-detail-head')).toBe('happy');
    expect(textOf('[aria-label="释义"]')).toContain('快乐的');
    expect(lookupCalls()[0]!.headers.Authorization).toBeUndefined();
    expect(fetchCalls.some((c) => c.url.includes('/api/wordbook'))).toBe(false);
    expect(q('[aria-label="收藏 happy"]')).not.toBeNull();
  });

  it('未登录点星标 → #/login?intent=favorite&word=… 并留下待收藏词', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    click(q('[data-testid=detail-card] button[aria-pressed]'));
    expect(window.location.hash).toBe('#/login?intent=favorite&word=happy');
    expect(localStorage.getItem('tm:pending-favorite')).toBe('happy');
  });

  it('未登录点「立即背这个词」→ 先登录并带上词；已登录 → #/study?focus=…（交棒 T-18）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    click(buttonByText('立即背这个词'));
    expect(window.location.hash).toBe('#/login?intent=study&word=happy');
  });

  it('已登录点「立即背这个词」= 打开背词 tab 并把词放进 ?focus=', async () => {
    localStorage.setItem('tm.token', 't-17-test');
    stubFetch((url) => (url.includes('/api/wordbook') ? [200, { words: [] }] : [200, DETAIL]));
    render();
    await settle();
    click(buttonByText('立即背这个词'));
    expect(window.location.hash).toBe('#/study?focus=happy');
  });

  it('未登录展开记法 = 0 请求 + 「登录后可以继续」，再试一次去登录页（不发明 401）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    click(q('#word-detail-mnemonic'));
    await settle();
    expect(tutorCalls()).toHaveLength(0);
    expect(q('[aria-label="AI 记法"]')?.textContent).toContain('登录后可以继续');
    click(buttonByText('再试一次'));
    expect(window.location.hash).toBe('#/login');
  });

  it('页面标题 = `{word} · 明日记忆`（§3.4.3 末条），卸载后交回原值', async () => {
    stubFetch(() => [200, DETAIL]);
    document.title = '原页面';
    render();
    await settle();
    expect(document.title).toBe('happy · 明日记忆');
    expect(textOf('[data-testid=detail-screen] h1')).toBe('happy · 明日记忆');
  });
});

describe('R-09④ 空态 / 错误态（界面不出现 undefined、不出现死路）', () => {
  it('查不到 = 空态卡 + 重试 + 次按钮「去背单词」', async () => {
    stubFetch(() => [200, NOT_FOUND]);
    render();
    await settle();
    expect(textOf('#word-detail-empty')).toBe('没找到这个词');
    expect(q('[data-testid=detail-card]')?.textContent).not.toContain('undefined');
    expect(q('[aria-label="词形变化"]')).toBeNull();
    expect(buttonByText('重试')).not.toBeNull();
    click(buttonByText('重试'));
    await settle();
    expect(lookupCalls()).toHaveLength(2);
  });

  it('网络失败 = 标题换成失败文案，重试确实再发请求', async () => {
    stubFetch(() => [500, { error: 'boom' }]);
    render();
    await settle();
    expect(textOf('#word-detail-empty')).toBe('查询失败了 · 再试一次');
    click(buttonByText('重试'));
    await settle();
    expect(lookupCalls()).toHaveLength(2);
  });

  it('中译英/混合回带没有词头明细 ⇒ 空态而不是空白卡', () => {
    expect(toDetailParts(ZH2EN as never)).toBeNull();
    expect(toDetailParts(null)).toBeNull();
    expect(toDetailParts(NOT_FOUND as never)).toBeNull();
    expect(toDetailParts({ ...DETAIL, groups: [], translation: '', definition: '' } as never)).toBeNull();
    expect(detailWordOf({})).toBe('');
    expect(detailWordOf({ word: '  happy  ' })).toBe('happy');
  });

  it('词头为空 ⇒ 不发请求（不出现 `word=` 空查），标题回落品牌名', async () => {
    stubFetch(() => [200, DETAIL]);
    resetRouterForTest('/word');
    render();
    await settle();
    expect(lookupCalls()).toHaveLength(0);
    expect(document.title).toBe('');
    expect(textOf('[data-testid=detail-screen] h1')).toBe('明日记忆');
  });
});

describe('判据⑤ + Chrome84 红线（本屏两个新文件，源码级）', () => {
  it('不含 Chrome84 之后的 API', () => {
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/structuredClone\s*\(/);
      expect(source.code, source.path).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
      expect(source.code, source.path).not.toMatch(/requestIdleCallback/);
      expect(source.code, source.path).not.toMatch(/\.at\s*\(/);
    }
  });

  it('无横向滚动的可机检替代量：无固定像素宽、无任意值宽度类、无 nowrap、返回热区 ≥44px', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      const width = el.style.width;
      if (width.endsWith('px')) expect(Number.parseInt(width, 10)).toBeLessThanOrEqual(375);
      const classes = typeof el.className === 'string' ? el.className : '';
      expect(classes, el.dataset.testid ?? el.tagName).not.toMatch(/\b(?:min-)?w-\d*\[/);
      expect(classes).not.toMatch(/whitespace-nowrap/);
    }
    for (const source of SOURCES) {
      expect(source.code, source.path).not.toMatch(/\bw-\[\d+px\]/);
      expect(source.code, source.path).not.toMatch(/whitespace-nowrap/);
    }
    const back = q('[data-testid=detail-back]');
    expect(back?.getAttribute('class')).toContain('min-h-tap');
    expect(back?.getAttribute('class')).toContain('min-w-tap');
  });

  it('`#/word/…` 的裸链接不离开 App（file:// 下 href 一律拦截）', async () => {
    stubFetch(() => [200, DETAIL]);
    render();
    await settle();
    const a = document.createElement('a');
    a.href = '/word/happy?from=home';
    a.textContent = 'x';
    container.querySelector('[data-testid=detail-screen]')!.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
