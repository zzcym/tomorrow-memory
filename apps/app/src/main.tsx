/**
 * App 入口（架构 §5.1 / §5.2、R-17 ①⑦、R-20 ①②③）。
 *
 * 挂载顺序（每一步都不假设上一步成功）：
 *  1. `installRouterGlobals()` → 冻结入口 `window.__router.canGoBack()` 立即可用；
 *  2. `startRouter()` → 首帧 hash 归一（未识别路径 replace 回 `#/`）；
 *  3. 消费小组件直达目标（`AndroidBridge.consumeLaunchFocus()`）→ 导航 + 聚焦标记（R-20 ③）；
 *  4. 冷启动跑 §5.5 四步；回前台再跑一遍；
 *  5. `window.__app.onForeground()` = 冻结入口②。Java 的 `onResume` 既会 `evaluateJavascript`
 *     调它、也会派发 `visibilitychange`（现网 `MainActivity:120`）→ 两条路径在此收敛到同一个函数，
 *     并用 2s 去抖保证**不会因此多打一轮请求**（R-20 ② 的 ≤2s 口径）。
 */

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProviders, ToastLayer } from './host.js';
import {
  AppRoutes,
  getPath,
  installRouterGlobals,
  navigate,
  routeFor,
  startRouter,
} from './router.js';
import { GateLayout } from './shell/GateLayout.js';
import { TabBarShell } from './shell/TabBarShell.js';
import { BackKeyBridge } from './shell/BackKeyBridge.js';
import {
  getSyncStatus,
  runStartup,
  shouldRunSyncChain,
  type StartupStepName,
} from './data/startup.js';
import { bindNavigation, onAuthSignal } from './data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  attachAuthSignals,
} from './lib/auth-store.js';
import { consumeLaunchFocus, requestSearchFocus, targetToPath } from './native/launch-focus.js';
import './styles/app.css';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** 弱网下不做指数重试：补传与"已同步"口径由 §5.5 启动链统一负责。 */
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60 * 1000,
    },
    mutations: { retry: 0 },
  },
});

/* ═════════════════ 壳：tab 页 vs 门禁页 ═════════════════ */

function Shell(): React.JSX.Element {
  const kind = routeFor(getPath()).kind;
  const content = (
    <>
      <AppRoutes />
      <BackKeyBridge />
    </>
  );
  if (kind === 'gate') return <GateLayout>{content}</GateLayout>;
  return <TabBarShell>{content}</TabBarShell>;
}

export function Root(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        <Shell />
        <ToastLayer />
      </AppProviders>
    </QueryClientProvider>
  );
}

/* ═════════════════ 启动链驱动（R-20 ①②④） ═════════════════ */

export const FOREGROUND_DEBOUNCE_MS = 2000;
let lastForegroundRunAt = 0;
let running = false;

export async function runStartupChain(reason: 'cold' | 'foreground'): Promise<void> {
  if (running) return;
  running = true;
  try {
    const skip: readonly StartupStepName[] = shouldRunSyncChain()
      ? []
      : ['flush', 'pull', 'dueCount'];
    const results = await runStartup({ skip });
    const synced = results.some((r) => r.ok && (r.step === 'flush' || r.step === 'pull'));
    if (synced) {
      void queryClient.invalidateQueries({ queryKey: ['wordbook'] });
      void queryClient.invalidateQueries({ queryKey: ['review'] });
    }
    if (reason === 'foreground') lastForegroundRunAt = Date.now();
  } catch {
    /* 启动链本身永不抛错（每步已隔离）；这里只是最后一道兜底，防止调用方未 await */
  } finally {
    running = false;
  }
}

/** 冻结入口②：`window.__app.onForeground()`（§5.6 ③，T-20 的 Java `onResume` 会调）。 */
export function onForeground(now: number = Date.now()): void {
  if (now - lastForegroundRunAt < FOREGROUND_DEBOUNCE_MS) return;
  void runStartupChain('foreground');
}

export interface AppGlobal {
  onForeground(): void;
  /** 诊断位：同步状态与当前路径，供真机 remote inspect 与 T-23 用例读取。 */
  status(): { sync: ReturnType<typeof getSyncStatus>; path: string };
}

declare global {
  interface Window {
    __app?: AppGlobal;
    __TM_TEST__?: boolean;
  }
}

/** 幂等地挂 `window.__app`。 */
export function installAppGlobals(): AppGlobal {
  const api: AppGlobal = {
    onForeground: () => onForeground(),
    status: () => ({ sync: getSyncStatus(), path: getPath() }),
  };
  if (typeof window !== 'undefined') window.__app = api;
  return api;
}

function bindDataLayerNavigation(): void {
  bindNavigation((to: string) => navigate(to));
  onAuthSignal((signal) => {
    if (signal === 'password-upgrade-required') navigate(UPGRADE_PASSWORD_ROUTE, { replace: true });
    else navigate(LOGIN_ROUTE, { replace: true });
  });
  /* 同一颗信号的第二个订阅方（`onAuthSignal` 是 Set 多订阅，两者不互斥）：让 `auth-store` 的派生位
     随 401 / 退出登录自动对齐存储，屏侧不必各自 `refreshFromStorage()`。解绑函数在应用入口故意丢弃。 */
  attachAuthSignals();
}

/** 小组件 / 通知直达（R-20 ③、R-21 ④⑥）：目标由 Java 写入，取一次即清。 */
export function applyLaunchFocus(): void {
  const target = consumeLaunchFocus();
  const path = targetToPath(target);
  if (!path) return;
  if (getPath() !== path) navigate(path);
  if (target === 'lookup') requestSearchFocus();
}

/** 挂载点（`__TM_TEST__` 时不自动跑，交给单测显式调用）。 */
export function bootstrap(rootEl?: Element | null): void {
  if (typeof window !== 'undefined') {
    installRouterGlobals();
    installAppGlobals();
    bindDataLayerNavigation();
    startRouter();
    applyLaunchFocus();
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') onForeground();
    });
    void runStartupChain('cold');
  }
  const node =
    rootEl ?? (typeof document === 'undefined' ? null : document.getElementById('app'));
  if (!node) return;
  createRoot(node).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

if (typeof window !== 'undefined' && !window.__TM_TEST__) {
  bootstrap();
}
