/// <reference types="node" />
/**
 * T-14 判据③：hash 路由 5 tab 可达 + 两个冻结 JS 入口存在。
 *
 * 覆盖：
 *  - 路由表 12 条全部登记，`load` 是**懒加载器**且逐条解析出 `src/screens/*` 的**真屏**组件
 *    （FU24①：11 张真屏对 12 条路由，唯一共指 = 两颗 gate 的 LoginScreen；占位分叉已随批次4 删除）；
 *  - 5 个 tab 的路径与 `NAV_ITEMS` 同源，在 `TabBar` 上**真实点击**能改 `location.hash` 并渲染出该路由；
 *  - `window.__router.canGoBack()`（本文件）与 `window.__app.onForeground()`（`main.tsx`）两个入口存在、可调；
 *  - 旧 `window.onAndroidBack()` 的"含 `exit` = 交给原生"约定；
 *  - R-18④/R-40④ 的四种返回语义。
 *
 * 本文件不写任何用户可见字面串（tab 标签取 `NAV_ITEMS.tab`）。
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { NAV_ITEMS } from '@tm/shared';
import { LOGIN_ROUTE, REGISTER_ROUTE } from '../src/lib/auth-store.js';
import {
  AppRoutes,
  FALLBACK_PATH,
  GATE_UPGRADE_PATH,
  ROUTES,
  TAB_PATHS,
  back,
  canGoBack,
  commitLocation,
  getLocation,
  getPath,
  handleSystemBack,
  installRouterGlobals,
  isTabPath,
  navigate,
  onAndroidBackString,
  parseHash,
  resetRouterForTest,
  routeFor,
  startRouter,
  toHash,
} from '../src/router.js';
import { TabBarShell } from '../src/shell/TabBarShell.js';
import { AppProviders } from '../src/host.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 让 React.lazy 的 import 与 `queueMicrotask` 全部落地。 */
async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

/** jsdom 的 `hashchange` 是异步的，测试里显式派发一次以保证确定性。 */
function fireHashChange(): void {
  act(() => {
    window.dispatchEvent(new Event('hashchange'));
  });
}

function clickTab(container: HTMLElement, path: string): void {
  const btn = container.querySelector<HTMLButtonElement>(`[data-tab="${path}"]`);
  if (!btn) throw new Error(`找不到 tab 按钮：${path}`);
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** 不属于路由页自身、由壳提供的 `data-testid`（判据③-3 要把它排除掉）。 */
const SHELL_TESTIDS = ['route-fallback'];

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * 全仓 11 张真屏的 `default` 导出全集（`src/screens/*.tsx`，eager glob 只在本文件的测试进程里，
 * 不进产物）。取"全集"而不是逐条静态 import，是为了让判据不随接线进度失效：
 * 谁把某条路由的 `load` 挪回壳里的占位、或新登记一条没屏的路由，都会在这里立刻对不上。
 */
const REAL_SCREEN_DEFAULTS = new Set<unknown>(
  Object.values(
    import.meta.glob('../src/screens/*.tsx', { eager: true }) as Record<string, { default?: unknown }>,
  )
    .map((mod) => mod.default)
    .filter((value): value is unknown => typeof value === 'function'),
);

/**
 * 判据③-3 的渲染断言（FU24① 收口后的硬判据）：**这条路由的 `load` 登记成什么，屏上就该是什么**，
 * 而 11 条路由登记的都是 `src/screens/*` 的**真屏** —— 接线前占位 `shell/ScreenFallback` 已删除，
 * 于是"内容区渲染骨架屏"那一支永不可能为真，判据因此不再给占位留分叉：
 *  - 内容区既不许出现 Suspense 占位（`route-fallback`），也不许出现骨架屏（`screen-fallback`）；
 *  - `load()` 的 `default` 必须命中 `REAL_SCREEN_DEFAULTS`；
 *  - 命中后内容区必须有该页自己的带标识区块。
 * 全程不写任何用户可见字面串。
 */
async function expectRenderedScreen(container: HTMLElement, path: string): Promise<void> {
  const main = container.querySelector('#main');
  expect(main, `内容区 #main 未渲染：${path}`).not.toBeNull();
  const region = main as HTMLElement;
  expect(region.querySelector('[data-testid="route-fallback"]')).toBeNull();
  expect(region.querySelector('[data-testid="screen-fallback"]')).toBeNull();
  const mod = await routeFor(path).load();
  expect(
    REAL_SCREEN_DEFAULTS.has(mod.default),
    `路由 ${path} 的 load 没有解析到 src/screens/* 的真屏`,
  ).toBe(true);
  const marks = Array.from(region.querySelectorAll('[data-testid]'))
    .map((el) => el.getAttribute('data-testid'))
    .filter((id): id is string => !!id && SHELL_TESTIDS.indexOf(id) < 0);
  expect(marks.length).toBeGreaterThan(0);
}

describe('判据③-1 路由表与懒加载登记（A-22）', () => {
  it('12 条路由（= §5.3 的 11 个页面落点 + 注册 gate 复用登录屏）、5 个 tab 与 NAV_ITEMS 同源，每条都有懒加载器', async () => {
    expect(ROUTES).toHaveLength(12);
    // §5.3 逐行 → 路由：批次4 的三个任务因此对 `router.tsx` 只需改 `load` 一处（§10.4 第 5 行）
    expect(ROUTES.map((r) => r.path)).toEqual([
      '/', // T-17 LookupScreen
      '/word/:word', // T-17 WordDetailScreen
      '/study', // T-18 StudyScreen
      '/study/done', // T-18 CompletionScreen
      '/wordbook', // T-18 WordbookScreen
      '/progress', // T-18 ProgressScreen
      '/me', // T-19 MeScreen
      '/security', // T-19 SecurityScreen
      '/me/about', // T-19 AboutScreen
      '/login', // T-19 LoginScreen
      GATE_UPGRADE_PATH, // T-19 UpgradePasswordScreen
      REGISTER_ROUTE, // E5 注册 gate：与 /login 共指 LoginScreen（常量单点在 auth-store）
    ]);
    expect(TAB_PATHS).toEqual(NAV_ITEMS.map((item) => item.hash.replace(/^#/, '')));
    expect(TAB_PATHS).toHaveLength(5);
    for (const path of TAB_PATHS) {
      expect(isTabPath(path)).toBe(true);
      expect(routeFor(path).kind).toBe('tab');
    }
    expect(ROUTES.filter((r) => r.kind === 'tab').map((r) => r.path)).toEqual([...TAB_PATHS]);
    for (const def of ROUTES) {
      expect(typeof def.load).toBe('function');
      const mod = await def.load();
      expect(typeof mod.default).toBe('function');
    }
    // 门禁页（不受 tab 影响）也在表里
    expect(routeFor('/login').kind).toBe('gate');
    expect(routeFor(GATE_UPGRADE_PATH).kind).toBe('gate');
    expect(routeFor(REGISTER_ROUTE).kind).toBe('gate');
  });

  it('FU24①：12 条路由的 load 全部指向 `src/screens/*` 真屏；两两不同，唯一共指 = 两颗 gate 的 LoginScreen', async () => {
    // 在册真屏仍 = 11 张：/register 不许造第 12 张屏，只许与 /login 共指（少了就是有人删屏留路由）
    expect(REAL_SCREEN_DEFAULTS.size).toBe(11);
    expect(ROUTES).toHaveLength(12);
    const seen = new Set<unknown>();
    const defaults = new Map<string, unknown>();
    for (const def of ROUTES) {
      const mod = await def.load();
      expect(
        REAL_SCREEN_DEFAULTS.has(mod.default),
        `${def.path} 的 load 没有解析到 src/screens/* 的真屏（占位不许回魂）`,
      ).toBe(true);
      seen.add(mod.default);
      defaults.set(def.path, mod.default);
    }
    // 12 条折叠成 11 张不同的屏 ⇒ 有且仅有一对共指，且这一对被下一行钉死 = /login + /register；其余 10 条一条一屏、两两不同。
    expect(seen.size).toBe(REAL_SCREEN_DEFAULTS.size);
    expect(defaults.get(REGISTER_ROUTE)).toBe(defaults.get(LOGIN_ROUTE));
    // 正向钉：共指 ⇒ 注册态只能由路由 path 派生（读源码形状断言，不造 DOM 钩子）。
    // 路径先入变量：`new URL('字面量', import.meta.url)` 会被 Vite 改写成 dev-server 资产 URL（实测 http://localhost:3000/...），故走 login-screen.spec `readSrc` 同一形状。
    const loginSrcRel = '../src/screens/LoginScreen.tsx';
    const loginSrc = stripComments(readFileSync(new URL(loginSrcRel, import.meta.url), 'utf8'));
    expect(loginSrc).toMatch(/useLocation\(\)/);
    expect(loginSrc).toMatch(/REGISTER_ROUTE/);
  });
});

describe('判据③-2 hash 解析 / 别名 / 参数', () => {
  it('#/study 与 /study、study 三种写法都收；旧口径按别名归一', () => {
    expect(parseHash('#/study').route?.path).toBe('/study');
    expect(parseHash('/study').route?.path).toBe('/study');
    expect(parseHash('study').route?.path).toBe('/study');
    expect(parseHash('#/report').route?.path).toBe('/progress');
    expect(parseHash('#/about').route?.path).toBe('/me/about');
    expect(parseHash('#/password').route?.path).toBe(GATE_UPGRADE_PATH);
    expect(parseHash('#/security').route?.path).toBe('/security');
    expect(parseHash('#/lookup').route?.path).toBe(FALLBACK_PATH);
    expect(parseHash('').path).toBe(FALLBACK_PATH);
    expect(toHash('study')).toBe('#/study');
    expect(toHash('#/word/apple')).toBe('#/word/apple');
  });

  it('二级页取 params，查询串解码；认不出来的路径不报错只回落查词', () => {
    const loc = parseHash('#/word/apple%20pie?from=tab');
    expect(loc.route?.path).toBe('/word/:word');
    expect(loc.params).toEqual({ word: 'apple pie' });
    expect(loc.query).toEqual({ from: 'tab' });
    expect(parseHash('#/definitely-not-a-route').route).toBeNull();
    expect(routeFor('/definitely-not-a-route').path).toBe(FALLBACK_PATH);
    expect(isTabPath('/me/about')).toBe(false);
  });
});

describe('判据③-3 五个 tab 在 TabBar 上真实可点可达', () => {
  let container: HTMLDivElement;
  let root: Root;
  let stop: () => void;
  /**
   * A-40 #56②：`router.tsx:50/:51` 接上真页面（`LookupScreen`）之后，本 describe 的挂载点
   * 必须与 `main.tsx` 的 `Root` 同构 —— 生产装配面**本来就有** `QueryClientProvider`
   * （`main.tsx` 的 `Root`），红是这份夹具缺 Provider，不是装配面缺。补夹具，不动 `screens/**`。
   */
  let client: QueryClient;

  beforeEach(async () => {
    window.location.hash = '';
    localStorage.clear();
    resetRouterForTest(FALLBACK_PATH);
    stop = startRouter();
    client = new QueryClient({
      defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AppProviders>
            <TabBarShell>
              <AppRoutes />
            </TabBarShell>
          </AppProviders>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  });

  afterEach(() => {
    stop();
    act(() => root.unmount());
    client.clear();
    container.remove();
    vi.restoreAllMocks();
  });

  it('点击每个 tab → location.hash 变化 → 快照换路由 → 渲染该路由的懒加载页', async () => {
    expect(container.querySelectorAll('[data-tab]')).toHaveLength(5);
    for (let i = 0; i < TAB_PATHS.length; i += 1) {
      const path = TAB_PATHS[i] as string;
      clickTab(container, path);
      expect(window.location.hash).toBe(`#${path}`);
      fireHashChange();
      expect(getPath()).toBe(path);
      expect(getLocation().route?.path).toBe(path);
      await settle();
      await expectRenderedScreen(container, path);
      expect(container.querySelector(`[data-tab="${path}"]`)?.getAttribute('data-active')).toBe('1');
      expect(container.querySelector('[data-testid="tab-bar"]')).not.toBeNull();
    }
    // 5 个 tab 全部可达 = 每条都渲染过一次且当前项唯一激活
    expect(container.querySelectorAll('[data-active="1"]')).toHaveLength(1);
  });

  it('二级页 /me/about 也走同一条 hash 链路（tab 壳仍在）', async () => {
    act(() => navigate('/me/about'));
    fireHashChange();
    expect(getPath()).toBe('/me/about');
    await settle();
    await expectRenderedScreen(container, '/me/about');
    expect(routeFor(getPath()).kind).toBe('secondary');
  });
});

describe('判据③-4 冻结入口 window.__router.canGoBack()', () => {
  let stop: () => void;

  beforeEach(() => {
    installRouterGlobals();
    stop = startRouter();
    resetRouterForTest(FALLBACK_PATH);
  });

  afterEach(() => stop());

  it('入口存在，且返回值与内部栈一致', () => {
    expect(typeof window.__router?.canGoBack).toBe('function');
    expect(window.__router!.canGoBack()).toBe(false);
    commitLocation('/word/apple', false);
    expect(window.__router!.canGoBack()).toBe(true);
    expect(window.__router!.currentPath()).toBe('/word/:word');
    expect(canGoBack()).toBe(window.__router!.canGoBack());
  });

  it('navigate 入口在原生侧可调（`__router.navigate`）', async () => {
    window.__router!.navigate('/study');
    expect(window.location.hash).toBe('#/study');
    fireHashChange();
    expect(getPath()).toBe('/study');
    await settle();
  });

  it('R-18④ 四种返回语义：go-back / goto-lookup / confirm-exit / stay', () => {
    // ① 有应用内历史 → go-back
    commitLocation('/me/about', false);
    expect(handleSystemBack()).toBe('go-back');
    expect(back()).toBe(true);
    commitLocation(FALLBACK_PATH, true); // 浏览器回来的那一次
    expect(canGoBack()).toBe(false);

    // ② 在非查词 tab 顶层 → 先回查词 tab
    resetRouterForTest('/wordbook');
    expect(handleSystemBack()).toBe('goto-lookup');
    expect(window.location.hash).toBe('#/');

    // ③ 已在查词 tab → 交给原生（含 exit 字样）
    resetRouterForTest(FALLBACK_PATH);
    expect(handleSystemBack()).toBe('confirm-exit');
    expect(onAndroidBackString()).toContain('exit');
    expect(typeof window.onAndroidBack).toBe('function');
    expect(String(window.onAndroidBack?.())).toContain('exit');

    // ④ 强制改密页：既不后退也不退出（R-40④）
    resetRouterForTest(FALLBACK_PATH);
    commitLocation(GATE_UPGRADE_PATH, false);
    expect(canGoBack()).toBe(true);
    expect(handleSystemBack(GATE_UPGRADE_PATH)).toBe('stay');
    expect(canGoBack()).toBe(true);
    expect(String(window.onAndroidBack?.())).not.toContain('exit');
  });

  it('startRouter：未识别 hash 首帧归一回 #/，之后靠 hashchange 驱动', () => {
    window.location.hash = '#/no-such-route';
    const stop = startRouter();
    expect(getPath()).toBe(FALLBACK_PATH);
    window.location.hash = '#/progress';
    fireHashChange();
    expect(getPath()).toBe('/progress');
    expect(window.__router!.canGoBack()).toBe(true);
    stop();
    window.location.hash = '';
  });
});

describe('判据③-5 冻结入口 window.__app.onForeground()（main.tsx）', () => {
  it('存在、可调；回前台只补第 4 步（未登录时 1-3 步不发业务请求），且 2s 去抖不重复打', async () => {
    window.__TM_TEST__ = true; // 不让 import 时自动 bootstrap
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response('{"error":"NOPE"}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const main = await import('../src/main.js');
    main.installAppGlobals();

    expect(typeof main.onForeground).toBe('function');
    expect(typeof window.__app?.onForeground).toBe('function');
    const status = window.__app?.status();
    expect(status?.path).toBe(getPath());
    expect(status?.sync).toHaveProperty('dueCount');

    window.__app!.onForeground();
    window.__app!.onForeground(); // 同一轮里再叫一次：去抖 / 单飞
    await settle(30);

    expect(urls.filter((u) => u.includes('/api/version'))).toHaveLength(1);
    expect(urls.filter((u) => !u.includes('/api/version'))).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
