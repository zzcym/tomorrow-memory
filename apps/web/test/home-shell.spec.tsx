/**
 * T-12 首页外壳自门禁（vitest + jsdom）。
 *
 * ⚠ **本机无 Playwright 浏览器内核**（`%LOCALAPPDATA%/ms-playwright` 不存在）→
 *   `apps/web/e2e/home.spec.ts` **一次都没执行过**，真机 375×667 尺寸/键盘遮挡判定据②的
 *   "100dvh 不遮输入框"部分待 T-22/T-23 补跑（同 A-17 先例）。
 *   本文件覆盖的是 jsdom 能判定的部分：**DOM 结构与可交互元素计数**，不是布局像素。
 *   （jsdom 无布局引擎 → 不断言 offsetHeight，改为断言"未聚焦时面板整棵子树不存在"。）
 *
 * 计数口径与 `03-ui-spec.md` §3.1.1 逐条对齐，**未放宽**：
 * 作用域 = `[data-testid=home-root]` 子树；选择器 = `a[href],button,input,textarea,select,
 * [role=button],[tabindex]:not([tabindex="-1"])`；聚合 = SearchBar 输入框/提交各算 1（合计 2）、
 * 结果条「查看详情」+ 星标合算 1、喇叭算 1。
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider, fallbackHost, useRecentSearches, type UiHost } from '@tm/ui';
import { RECENT_MAX } from '@tm/shared';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ───────── 数据层与 Next 运行时打桩（本文件只验外壳结构，不验传输） ───────── */

const state = vi.hoisted(() => ({
  text: '',
  queried: '',
  busy: false,
  failed: false,
  view: {
    kind: 'idle' as 'idle' | 'en' | 'zh' | 'empty',
    word: '',
    phonetic: '',
    gloss: '',
    rows: [] as Array<{ word: string; phonetic: string; gloss: string }>,
    partial: false,
    applied: 'auto' as 'auto' | 'en2zh' | 'zh2en',
  },
  recent: [] as Array<{ word: string; direction: 'auto' | 'en2zh' | 'zh2en'; gloss: string; at: number }>,
  due: 12,
  signedIn: false,
  pathname: '/',
}));

vi.mock('@/lib/hooks/use-lookup', () => ({
  useDueCount: () => ({ due: state.due, loading: false, signedIn: state.signedIn }),
  useLookup: () => ({
    text: state.text,
    setText: (v: string) => {
      state.text = v;
    },
    queried: state.queried,
    view: state.view,
    busy: state.busy,
    failed: state.failed,
    run: (v: string) => {
      state.text = v;
      state.queried = v;
      state.view = {
        kind: 'en',
        word: v.toLowerCase(),
        phonetic: 'ˈhæpi',
        gloss: '[adj] 快乐的 · [n] 幸福',
        rows: [],
        partial: false,
        applied: 'en2zh',
      };
    },
    retry: () => {},
    switchDirection: () => {},
    recent: {
      items: state.recent,
      push: () => {},
      remove: () => {},
      clear: () => {
        state.recent.length = 0;
      },
      max: 20,
    },
  }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ wordbook: { list: { invalidate: () => {} } }, review: { today: { invalidate: () => {} } } }),
    wordbook: {
      list: { useQuery: () => ({ data: [] }) },
      add: { useMutation: () => ({ mutate: () => {} }) },
      remove: { useMutation: () => ({ mutate: () => {} }) },
    },
  },
}));

vi.mock('@/lib/use-auth', () => ({ useAuthed: () => state.signedIn }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import HomePage from '@/app/(user)/page';
import { MobileNav } from '@/components/mobile-nav';
import { MoreMenu } from '@/components/home/more-menu';
import { ResultSection } from '@/components/home/result-section';
import { toHomeLookupView } from '@/lib/api/lookup-stream';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/* ───────── 挂载工具 ───────── */

let container: HTMLDivElement;
let root: Root;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const INTERACTIVE = 'a[href],button,input,textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])';

/** §3.1.1 聚合规则：SearchBar 输入+提交=2（DOM 天然两个，不折）、结果条「查看详情」+星标=1（折 1）、喇叭=1。 */
function specCount(scope: Element): { raw: number; aggregated: number } {
  const nodes = Array.from(scope.querySelectorAll(INTERACTIVE));
  const bars = scope.querySelectorAll('[data-testid=home-result-bar]');
  let folded = 0;
  bars.forEach((bar) => {
    const detail = bar.querySelectorAll('a[href]').length;
    const star = bar.querySelectorAll('button[aria-pressed]').length;
    if (detail > 0 && star > 0) folded += 1;
  });
  return { raw: nodes.length, aggregated: nodes.length - folded };
}

function mount(node: React.ReactNode): void {
  const host: UiHost = { ...fallbackHost, navigate: () => {}, speak: () => {}, toast: () => {} };
  root.render(
    <QueryClientProvider client={queryClient}>
      <UiHostProvider host={host}>{node}</UiHostProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  state.text = '';
  state.queried = '';
  state.busy = false;
  state.failed = false;
  state.view = { kind: 'idle', word: '', phonetic: '', gloss: '', rows: [], partial: false, applied: 'auto' };
  state.recent.length = 0;
  state.due = 12;
  state.signedIn = false;
  state.pathname = '/';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/* ───────── 判据① 未查询态计数 + §8.3-C 归零 ───────── */

describe('判据① home-root 可交互元素', () => {
  it('未查询态 = 3（输入框 + 框内提交 + 胶囊），≤5', () => {
    act(() => mount(<HomePage />));
    const homeRoot = container.querySelector('[data-testid=home-root]');
    expect(homeRoot).not.toBeNull();
    const { raw, aggregated } = specCount(homeRoot as Element);
    expect({ raw, aggregated }).toEqual({ raw: 3, aggregated: 3 });
    expect(aggregated).toBeLessThanOrEqual(5);
  });

  it('已查询态 ≤8（结果条出现后）', () => {
    state.queried = 'happy';
    state.view = {
      kind: 'en',
      word: 'happy',
      phonetic: 'ˈhæpi',
      gloss: '[adj] 快乐的 · [n] 幸福',
      rows: [],
      partial: false,
      applied: 'en2zh',
    };
    act(() => mount(<HomePage />));
    const homeRoot = container.querySelector('[data-testid=home-root]');
    const { raw, aggregated } = specCount(homeRoot as Element);
    console.info('[T-12 已查询态计数] raw =', raw, ' 聚合 =', aggregated);
    expect(aggregated).toBeGreaterThan(3);
    expect(aggregated).toBeLessThanOrEqual(8);
    expect(raw).toBeLessThanOrEqual(9);
  });

  it('§8.3-C 五类选择器整页命中数 = 0（方向按钮/历史 chips/大灰卡/侧栏/AI 卡）', () => {
    state.queried = 'happy';
    state.view = { kind: 'en', word: 'happy', phonetic: '', gloss: '[adj] 快乐的', rows: [], partial: false, applied: 'en2zh' };
    act(() => mount(<HomePage />));
    for (const sel of [
      '[data-testid=home-direction-buttons]',
      '[data-testid=home-history-chips]',
      '[data-testid=home-empty-graycard]',
      '[data-testid=wordbook-sidebar]',
      '[data-testid=home-ai-card]',
    ]) {
      expect(document.querySelectorAll(sel).length, sel).toBe(0);
    }
  });

  it('装饰层不可交互（pointer-events:none + aria-hidden）', () => {
    act(() => mount(<HomePage />));
    const decor = container.querySelector('[aria-hidden="true"]');
    expect(decor).not.toBeNull();
    const el = decor as HTMLElement;
    expect(el.className).toContain('pointer-events-none');
    expect(el.querySelectorAll(INTERACTIVE).length).toBe(0);
  });
});

/* ───────── 判据③ 最近查询仅聚焦时出现 ───────── */

describe('判据③ 最近查询聚焦才出现', () => {
  it('未聚焦：面板整棵子树不存在（DOM 高度 0）', () => {
    state.recent = [{ word: 'apple', direction: 'en2zh', gloss: 'n. 苹果', at: Date.now() }];
    act(() => mount(<HomePage />));
    expect(container.querySelectorAll('[data-testid=home-recent-panel]').length).toBe(0);
    expect(container.textContent).not.toContain('最近查询');
  });

  it('聚焦后出现条目；失焦后再次归零', async () => {
    state.recent = [{ word: 'apple', direction: 'en2zh', gloss: 'n. 苹果', at: Date.now() }];
    act(() => mount(<HomePage />));
    const input = container.querySelector<HTMLInputElement>('[data-testid=home-search] input')!;
    act(() => {
      input.focus();
    });
    expect(container.querySelectorAll('[data-testid=home-search] [data-testid=home-recent-panel]').length).toBe(1);
    expect(container.textContent).toContain('apple');
    // 面板在失焦后 180ms（BLUR_GRACE_MS）才收起：等真实定时器跑完，不用假计时器
    act(() => {
      input.blur();
    });
    await new Promise((resolve) => setTimeout(resolve, 260));
    await act(async () => {});
    expect(container.querySelectorAll('[data-testid=home-recent-panel]').length).toBe(0);
  });

  it('容量 = RECENT_MAX(20)：本机存 20 条全出，存 24 条（越界）时读不出来', () => {
    // 上限真源 = `@tm/shared` 的 `RecentSearchListSchema.max(RECENT_MAX)`（20）。
    // 越界的原始值 `parseRecentSearchList` 直接判失败 → `useRecentSearches` 返回空列表，
    // 宿主按 §3.3 显示"暂时读不到查词记录"一行（见 search-section 的 storageBroken 注释）。
    const seed = (n: number): void => {
      window.localStorage.setItem(
        'tm:recent-searches',
        JSON.stringify(Array.from({ length: n }, (_, i) => ({ word: `w${i}`, direction: 'en2zh', gloss: 'g', at: Date.now() - i }))),
      );
    };
    function Probe(): React.JSX.Element {
      const recent = useRecentSearches();
      return (
        <ul data-testid="probe">
          {recent.items.map((item) => (
            <li key={item.word}>{item.word}</li>
          ))}
        </ul>
      );
    }
    seed(20);
    act(() => mount(<Probe />));
    expect(container.querySelectorAll('[data-testid=probe] li').length).toBe(RECENT_MAX);
    expect(container.querySelector('[data-testid=probe] li')!.textContent).toBe('w0');

    seed(24);
    act(() => root.unmount());
    root = createRoot(container);
    act(() => mount(<Probe />));
    expect(container.querySelectorAll('[data-testid=probe] li').length).toBe(0);
    window.localStorage.removeItem('tm:recent-searches');
  });

  it('清空要先过二次确认（ConfirmSheet 浮出，确认前不删）', async () => {
    state.recent = [{ word: 'apple', direction: 'en2zh', gloss: 'n. 苹果', at: Date.now() }];
    act(() => mount(<HomePage />));
    const input = container.querySelector<HTMLInputElement>('[data-testid=home-search] input')!;
    act(() => {
      input.focus();
    });
    const clearButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid=home-recent-panel] button'),
    ).find((b) => b.textContent?.trim() === '清空');
    expect(clearButton, '面板里的「清空」').toBeDefined();
    act(() => {
      clearButton!.click();
    });
    expect(document.body.textContent).toContain('清空最近查询？');
    expect(state.recent.length).toBe(1); // 未确认 → 不删
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).find(
      (b) => b.textContent?.trim() === '清空',
    );
    expect(confirm, '确认抽屉里的「清空」').toBeDefined();
    act(() => {
      confirm!.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await act(async () => {});
    expect(state.recent.length).toBe(0);
  });
});

/* ───────── 判据④ 结果条精简 ───────── */

describe('判据④ 结果条组成', () => {
  it('词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情；无例句/词形变化/AI 文本', () => {
    state.queried = 'happy';
    state.view = {
      kind: 'en',
      word: 'happy',
      phonetic: 'ˈhæpi',
      gloss: '[adj] 快乐的',
      rows: [],
      partial: false,
      applied: 'en2zh',
    };
    act(() => mount(<ResultSection queried="happy" view={state.view} busy={false} failed={false} onRetry={() => {}} onSwitchDirection={() => {}} />));
    const bar = container.querySelector('[data-testid=home-result-bar]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('happy');
    expect(bar!.querySelectorAll('a[href="/word/happy?from=home"]').length).toBe(1);
    expect(bar!.querySelector('[aria-label="朗读 happy"]')).not.toBeNull();
    expect(bar!.querySelector('[aria-pressed]')).not.toBeNull();
    expect(bar!.textContent).toContain('[adj] 快乐的');
    // 义项行只有一行文字链容器：line-clamp 由 CSS 负责，这里断言"没有第二块内容"
    expect(bar!.querySelectorAll('a[href]')).toHaveLength(1);
    // 首页不渲染 AI 记法 / 例句（搬去 T-15 词详情页）
    expect(container.textContent).not.toContain('AI 记法');
    expect(container.textContent).not.toContain('例句');
  });

  it('中译英：投影层把候选裁到 3 行，组件按投影渲染', () => {
    const view = toHomeLookupView(
      {
        query: '苹果',
        sourceLang: 'zh',
        error: null,
        results: Array.from({ length: 6 }, (_, i) => ({
          word: `apple${i}`,
          pos: 'n.',
          definition: '苹果',
          examples: [],
          synonyms: [],
          phonetic: '',
        })),
      },
      'zh2en',
    );
    expect(view.kind).toBe('zh');
    expect(view.rows).toHaveLength(3);
    expect(view.applied).toBe('zh2en');

    state.queried = '苹果';
    state.view = view;
    act(() => mount(<ResultSection queried="苹果" view={view} busy={false} failed={false} onRetry={() => {}} onSwitchDirection={() => {}} />));
    expect(container.querySelectorAll('[data-testid=home-result-row]').length).toBe(3);
    // 每行一颗详情链（§3.1.1 聚合规则②），3 行 + 方向链 = 4，卡在已查询态 ≤8 内
    expect(container.querySelectorAll('[data-testid=home-result-row] a[href^="/word/"]').length).toBe(3);
  });
});

/* ───────── 判据② 底部 5 tab（结构层） ───────── */

describe('判据② 移动导航结构', () => {
  it('5 个 tab 全部可点，含 /wordbook；当前项 aria-current=page', () => {
    act(() => mount(<MobileNav />));
    const nav = container.querySelector('[data-testid=mobile-nav]');
    expect(nav).not.toBeNull();
    const links = Array.from(nav!.querySelectorAll('a[href]'));
    expect(links).toHaveLength(5);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/study', '/wordbook', '/report', '/profile']);
    expect(container.querySelector('a[href="/"]')!.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('a[href="/study"]')!.hasAttribute('aria-current')).toBe(false);
  });

  it('背单词 tab 的可访问名带待背数（ARIA.studyTab）', () => {
    state.due = 7;
    act(() => mount(<MobileNav />));
    expect(container.querySelector('a[href="/study"]')!.getAttribute('aria-label')).toBe('背单词，今天还有 7 个要背');
  });

  /**
   * 断点口径 = PRD R-08 ①「断点 <768px 时提供底部固定标签栏」+ ⑥「≥768px 仍为顶栏横排，桌面形态不回退」
   * + UI §3.10:1104 点名的 `md:hidden` / `hidden md:flex` 二选一。
   * 768px 就是 Tailwind `md`。此前实现用的是 `lg`（1024px）→ 768–1023px 这一段既没有顶栏横排
   * 又挂着底 tab，同时违反 ① 与 ⑥；T-12 收口轮已把两处一起改回 `md`，本断言随之对齐规范
   * （改的是**断言与规范不一致的期望值**，不是放宽判据）。
   */
  it('底 tab = `md:hidden`、顶栏主导航 = `hidden md:flex`，两处严格互补且不用 JS 断点', async () => {
    act(() => mount(<MobileNav />));
    const navClass = container.querySelector('[data-testid=mobile-nav]')!.className;
    expect(navClass).toContain('md:hidden');
    expect(navClass).not.toContain('lg:hidden');

    const fs = await import('node:fs');
    const path = await import('node:path');
    let repoRoot = process.cwd();
    for (let i = 0; i < 12 && !fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')); i += 1) {
      repoRoot = path.dirname(repoRoot);
    }
    const read = (f: string): string =>
      fs
        .readFileSync(path.join(repoRoot, 'apps/web', f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const header = read('src/components/header.tsx');
    const mobileNav = read('src/components/mobile-nav.tsx');
    // 顶栏主导航在 768px 起出现
    expect(/className="hidden[^"]*md:flex/.test(header), 'header 主导航 = hidden … md:flex').toBe(true);
    // §3.10:1104 明文「不得用 JS 断点判断」
    expect(/matchMedia|window\.innerWidth/.test(header + mobileNav), '无 JS 断点').toBe(false);
  });
});

/* ───────── 判据②「更多」抽屉 ───────── */

describe('判据② 更多抽屉', () => {
  it('抽屉含 chat / assess 两项', async () => {
    await act(async () => {
      mount(
        <MoreMenu trigger={<button type="button" aria-label="更多">open</button>} />,
      );
    });
    const trigger = container.querySelector('button[aria-label="更多"]')!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const drawer = document.querySelector('[data-testid=more-menu]');
    expect(drawer).not.toBeNull();
    expect(drawer!.querySelector('a[href="/chat"]')).not.toBeNull();
    expect(drawer!.querySelector('a[href="/assess"]')).not.toBeNull();
    expect(drawer!.textContent).toContain('测一测词汇量');
    expect(drawer!.querySelectorAll('button[aria-pressed]').length).toBe(3); // 外观三档
  });
});

/* ───────── 判据⑤ 首页无裸 fetch（源码级） ───────── */

describe('判据⑤ 传输口径', () => {
  it('首页五个文件均无裸 fetch( / axios / XMLHttpRequest', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    // 从 cwd 向上找仓库根（同 `packages/ui/test/patterns.spec.tsx` 的定位法，vitest 的 root 是 apps/web）
    let repoRoot = process.cwd();
    for (let i = 0; i < 12 && !fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')); i += 1) {
      repoRoot = path.dirname(repoRoot);
    }
    const files = [
      'src/app/(user)/page.tsx',
      'src/components/home/search-section.tsx',
      'src/components/home/result-section.tsx',
      'src/lib/hooks/use-lookup.ts',
      'src/lib/api/lookup-stream.ts',
    ];
    for (const f of files) {
      const text = fs
        .readFileSync(path.join(repoRoot, 'apps/web', f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(/\bfetch\s*\(/.test(text), f).toBe(false);
      expect(/XMLHttpRequest|axios/.test(text), f).toBe(false);
    }
  });
});

/* ───────── 键盘遮挡（可判定的结构部分） ───────── */

describe('判据② 键盘/底 tab 让位', () => {
  it('首页根容器用 100dvh，搜索区带 scroll-margin 让位底 tab', () => {
    act(() => mount(<HomePage />));
    expect(container.querySelector('[data-testid=home-root]')!.className).toContain('min-h-[100dvh]');
    const searchWrap = container.querySelector('.scroll-mb-\\[calc\\(var\\(--tab-h\\)\\+24px\\)\\]');
    expect(searchWrap).not.toBeNull();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
