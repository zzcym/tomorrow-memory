/**
 * App 的 **hash 路由**（架构 §5.1、R-17①、R-18 全条）。
 *
 * 为什么不用 History API：产物是 `file:///android_asset/index.html`，没有服务器可重写路径，
 * `pushState` 在 `file://` 下也不可靠 → 只用 `location.hash`（§4.7 `file://` 行）。
 *
 * 为什么**没有** react-router：`react-router-dom` 不在 workspace 依赖里（`pnpm-lock.yaml` 归 T-01，
 * A-4 也不给本任务改根装配的权限），而 R-18 需要的是"5 个 tab + 少量二级页 + 返回语义"。
 * 这里自带一份实现，偏差已登记进报告的"给 TPM 的需求"。
 *
 * 两个**冻结** JS 入口（T-20 的 Java 依赖，名字不许改，§5.6 ③⑤）：
 *  - `window.__router.canGoBack()` → boolean（本文件 `installRouterGlobals()`）
 *  - `window.__app.onForeground()` → void（在 `main.tsx` 注册）
 * 另保留旧手写版同名钩子 `window.onAndroidBack()`（现网 `MainActivity.onBackPressed` 正在调它）。
 * 返回值约定：**含 `exit` 字样 = 交给原生退出**，否则原生不做动作。
 */

import * as React from 'react';
import { NAV_ITEMS } from '@tm/shared';
import { REGISTER_ROUTE } from './lib/auth-store.js';

/* ═════════════════ 路由表 ═════════════════ */

export type RouteKind = 'tab' | 'secondary' | 'gate';

export interface RouteDef {
  /** hash 路径，可带 `:param` 段。 */
  path: string;
  kind: RouteKind;
  /** 懒加载（R-17⑥"产物按路由分包"，不允许整站一次性加载）。 */
  load: RouteLoader;
}

/** 懒加载器的统一签名（`React.lazy` 要求 `default` 导出）。 */
export type RouteLoader = () => Promise<{ default: React.ComponentType }>;

/* 批次4 的接线口径（§10.4 第 5 行 + A-22）：screen 任务对本文件只允许改 `load` 那一行的取值，
   路由名与查询键不许动。12 行现已全部指向真实屏（两颗 gate 共指 `LoginScreen`），起步用的 `SCREEN_PLACEHOLDER` 随之删除（A-73）。 */

/**
 * 路由 → 页面文件的映射。**页面本体归批次4**（`tools/ownership.json` 的 `apps/app/src/screens/**`
 * per_file 把 10 个文件分别记给 T-17/T-18/T-19），本任务只交**懒加载占位**（同一 reason 写明归属）。
 */
export const ROUTES: readonly RouteDef[] = [
  { path: '/', kind: 'tab', load: () => import('./screens/LookupScreen.js') }, /* T-17 → screens/LookupScreen.js */
  { path: '/word/:word', kind: 'secondary', load: () => import('./screens/WordDetailScreen.js') }, /* T-17 → screens/WordDetailScreen.js */
  { path: '/study', kind: 'tab', load: () => import('./screens/StudyScreen.js') }, /* T-18 → screens/StudyScreen.js */
  { path: '/study/done', kind: 'secondary', load: () => import('./screens/CompletionScreen.js') }, /* T-18 → screens/CompletionScreen.js */
  { path: '/wordbook', kind: 'tab', load: () => import('./screens/WordbookScreen.js') }, /* T-18 → screens/WordbookScreen.js */
  { path: '/progress', kind: 'tab', load: () => import('./screens/ProgressScreen.js') }, /* T-18 → screens/ProgressScreen.js */
  { path: '/me', kind: 'tab', load: () => import('./screens/MeScreen.js') }, /* T-19 → screens/MeScreen.js */
  { path: '/security', kind: 'secondary', load: () => import('./screens/SecurityScreen.js') }, /* T-19 → screens/SecurityScreen.js（§5.3 第 5 行） */
  { path: '/me/about', kind: 'secondary', load: () => import('./screens/AboutScreen.js') }, /* T-19 → screens/AboutScreen.js */
  { path: '/login', kind: 'gate', load: () => import('./screens/LoginScreen.js') }, /* T-19 → screens/LoginScreen.js */
  { path: '/upgrade-password', kind: 'gate', load: () => import('./screens/UpgradePasswordScreen.js') }, /* T-19 → screens/UpgradePasswordScreen.js */
  { path: REGISTER_ROUTE, kind: 'gate', load: () => import('./screens/LoginScreen.js') }, /* 注册与登录是同一张认证屏的两态：字段校验/协议勾选/错误话术全在 `AuthFormShell` 一份里，造第二张注册屏就是第二份实现 ⇒ 两条 gate 共指 `LoginScreen`，两态由屏侧从路由 path 派生。 */
];

/** 旧口径 / 外部入口（通知 `open=#/study`、小组件 `lookup`、Web 分享链）→ 规范路径。 */
export const ROUTE_ALIASES: Readonly<Record<string, string>> = {
  '/home': '/',
  '/lookup': '/',
  '/report': '/progress',
  '/about': '/me/about',
  '/password': '/upgrade-password',
  // `/security` 不在这张表里：§5.3 第 5 行的 `SecurityScreen`（T-19 交付）是**独立路由**，
  // 已作为 secondary 登记在 `ROUTES`，这样 T-19 对 `router.tsx` 才是零 diff（§10.4 第 5 行）。
};

/** 5 个 tab 的规范路径，直接取自 `NAV_ITEMS`（不复制第二份导航表）。 */
export const TAB_PATHS: readonly string[] = NAV_ITEMS.map((item) => item.hash.replace(/^#/, ''));

export const isTabPath = (path: string): boolean => TAB_PATHS.indexOf(normalizePath(path)) >= 0;

/** 强制改密页（R-40④：不可关闭、物理返回不退出）。 */
export const GATE_UPGRADE_PATH = '/upgrade-password';

/* ═════════════════ hash 解析 ═════════════════ */

export interface Location {
  path: string;
  query: Record<string, string>;
  route: RouteDef | null;
  params: Record<string, string>;
}

/** 未识别的路径一律回落查词 tab：WebView 里给 404 页没有出路。 */
export const FALLBACK_PATH = '/';

export function parseHash(hash: string | null | undefined): Location {
  const raw = (hash ?? '').replace(/^#/, '') || '/';
  const [beforeQuery, queryString] = splitOnce(raw, '?');
  const path = normalizePath(beforeQuery);
  const query: Record<string, string> = {};
  for (const pair of queryString.split('&')) {
    if (!pair) continue;
    const [k, v] = splitOnce(pair, '=');
    query[safeDecode(k)] = safeDecode(v);
  }
  const matched = matchRoute(path);
  return {
    path: matched ? matched.def.path : path,
    query,
    route: matched ? matched.def : null,
    params: matched ? matched.params : {},
  };
}

function splitOnce(value: string, sep: string): [string, string] {
  const i = value.indexOf(sep);
  return i < 0 ? [value, ''] : [value.slice(0, i), value.slice(i + 1)];
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    return v;
  }
}

function normalizePath(input: string): string {
  const withSlash = input.startsWith('/') ? input : `/${input}`;
  const trimmed =
    withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
  return ROUTE_ALIASES[trimmed] ?? trimmed;
}

interface Matched {
  def: RouteDef;
  params: Record<string, string>;
}

function matchRoute(path: string): Matched | null {
  const want = path.split('/').filter((s) => s.length > 0);
  for (const def of ROUTES) {
    const have = def.path.split('/').filter((s) => s.length > 0);
    if (want.length !== have.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < have.length; i += 1) {
      const seg = have[i] ?? '';
      const w = want[i] ?? '';
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = safeDecode(w);
      } else if (seg !== w) {
        ok = false;
        break;
      }
    }
    if (ok) return { def, params };
  }
  return null;
}

export function routeFor(path: string): RouteDef {
  return matchRoute(normalizePath(path))?.def ?? (ROUTES[0] as RouteDef);
}

/* ═════════════════ store（订阅 + 快照，供 useSyncExternalStore） ═════════════════ */

type Listener = () => void;
const listeners = new Set<Listener>();

let snapshot: Location = parseHash(FALLBACK_PATH);
let stack: string[] = [];
let popping = false;

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* 一个订阅方抛错不得影响其他订阅方 */
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocation(): Location {
  return snapshot;
}

export function getPath(): string {
  return snapshot.path;
}

/** 写 hash（唯一的导航出口）。`replace` 用 `location.replace` 保证不入栈。 */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const target = toHash(to);
  if (options.replace) {
    window.location.replace(target);
    return;
  }
  if (window.location.hash === target) {
    commitLocation(parseHash(target).path, false);
    return;
  }
  window.location.hash = target;
}

/** `#/study`、`/study`、`study` 三种写法都收（Bridge 给 `#/study`，小组件给 `lookup`）。 */
export function toHash(to: string): string {
  const withoutHash = (to ?? '').replace(/^#/, '');
  const path = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
  return `#${path}`;
}

/**
 * 每次 `hashchange` / 首帧调用：刷新快照 + 维护应用内历史栈。
 * 参数可以是 `#/study` 也可以是 `/study`（两种写法都来自真实调用方：Java 与 `NAV_ITEMS.hash`）。
 * 浏览器 `history.length` 在 `file://` 首次加载时不可信，故自维护 `stack`。
 */
export function commitLocation(hashOrPath: string, popped: boolean): void {
  const next = parseHash(toHash(hashOrPath));
  snapshot = next.route || next.path === FALLBACK_PATH ? next : parseHash(FALLBACK_PATH);
  if (popped) {
    if (stack.length > 1) stack = stack.slice(0, -1);
  } else if (stack.length === 0 || stack[stack.length - 1] !== snapshot.path) {
    stack = [...stack, snapshot.path];
  }
  notify();
}

/** 挂载首帧 / 订阅 `hashchange`（返回卸载函数）。 */
export function startRouter(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onChange = (): void => {
    commitLocation(window.location.hash || FALLBACK_PATH, popping);
    popping = false;
  };
  window.addEventListener('hashchange', onChange);
  const initial = window.location.hash || FALLBACK_PATH;
  commitLocation(initial, false);
  if (parseHash(initial).route === null && initial !== FALLBACK_PATH) {
    navigate(FALLBACK_PATH, { replace: true });
  }
  return () => window.removeEventListener('hashchange', onChange);
}

/** 测试隔离用：重置快照与历史栈。 */
export function resetRouterForTest(initial = '/'): void {
  stack = [];
  popping = false;
  commitLocation(initial, false);
}

/** 冻结入口①：是否有应用内历史可退（§5.6 ⑤，Java 侧 `evaluateJavascript("__router.canGoBack()")`）。 */
export function canGoBack(): boolean {
  return stack.length > 1;
}

export function back(): boolean {
  if (!canGoBack() || typeof window === 'undefined') return false;
  popping = true;
  window.history.back();
  return true;
}

/**
 * R-18④ 的返回语义（唯一实现处，原生只按返回值决定动不动）：
 *  - 有应用内历史 → `go-back`（二级页 → 上一级）
 *  - 在某 tab 顶层但不是查词 → `goto-lookup`（切到查词 tab）
 *  - 已在查词 tab → `confirm-exit`（含 `exit` 字样，交给原生弹二次确认，不静默杀进程）
 *  - 强制改密页 → `stay`（R-40④ 不可关闭；退出出口在该页内）
 */
export type SystemBackAction = 'go-back' | 'goto-lookup' | 'confirm-exit' | 'stay';

export function handleSystemBack(path: string = getPath()): SystemBackAction {
  const norm = normalizePath(path);
  if (norm === GATE_UPGRADE_PATH) return 'stay';
  if (canGoBack()) {
    back();
    return 'go-back';
  }
  if (norm !== FALLBACK_PATH) {
    navigate(FALLBACK_PATH);
    return 'goto-lookup';
  }
  return 'confirm-exit';
}

/**
 * 旧手写版钩子（现网 `MainActivity.onBackPressed` 仍在调：`String(window.onAndroidBack())`，
 * 返回值含 `exit` 即 `finish()`）。T-20 改为先问 `__router.canGoBack()`；本函数保证过渡期退化可用。
 */
export function onAndroidBackString(): string {
  return handleSystemBack();
}

/* ═════════════════ 冻结的全局入口 ═════════════════ */

export interface RouterGlobal {
  canGoBack(): boolean;
  handleSystemBack(): SystemBackAction;
  navigate(to: string): void;
  back(): boolean;
  currentPath(): string;
}

declare global {
  interface Window {
    __router?: RouterGlobal;
    onAndroidBack?: () => string;
  }
}

/** 幂等：把 `window.__router` / `window.onAndroidBack` 装上。 */
export function installRouterGlobals(): RouterGlobal {
  const api: RouterGlobal = {
    canGoBack,
    handleSystemBack,
    navigate: (to: string) => navigate(to),
    back,
    currentPath: getPath,
  };
  if (typeof window !== 'undefined') {
    window.__router = api;
    window.onAndroidBack = onAndroidBackString;
  }
  return api;
}

/* ═════════════════ 渲染 ═════════════════ */

const lazyCache = new Map<string, React.LazyExoticComponent<React.ComponentType>>();

function lazyFor(def: RouteDef): React.LazyExoticComponent<React.ComponentType> {
  const hit = lazyCache.get(def.path);
  if (hit) return hit;
  const created = React.lazy(def.load);
  lazyCache.set(def.path, created);
  return created;
}

/** 分包加载中的占位：不写任何用户可见文案（文案唯一源在 `@tm/shared`）。 */
function RouteFallback(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      className="min-h-dvh w-full animate-pulse rounded-lg bg-surface p-4"
      data-testid="route-fallback"
    />
  );
}

export function useLocation(): Location {
  return React.useSyncExternalStore(subscribe, getLocation, getLocation);
}

/** 当前路由 → 懒加载页面（tab 栏由 `shell/TabBarShell` 负责包裹）。 */
export function AppRoutes(): React.JSX.Element {
  const loc = useLocation();
  const def = loc.route ?? (ROUTES[0] as RouteDef);
  const View = lazyFor(def);
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <View key={def.path} />
    </React.Suspense>
  );
}
