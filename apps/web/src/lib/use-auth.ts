'use client';

/**
 * 登录态 hook（T-16 / R-23②）：**三态 + 骨架屏**，不再用"初始值固定 false"那一套。
 *
 * 旧实现（`useState(false)` + `useEffect` 里同步）造成 R-23② 要点名的闪烁：
 * 已登录用户进 `study`/`wordbook`/`report`/`chat`/`assess` 时，第一帧拿到的是 `false`，
 * 于是页面渲染出"请先登录后…"那一行，第二帧才被替换成内容 —— 判据① 要归零的正是这帧。
 * 现在：
 *  - 状态机 `idle → authed | guest`，`idle` **只在服务端与水合帧存在**；
 *  - 读值走 `useSyncExternalStore`：水合完成后 React 会**同步**用 `getSnapshot()` 复核一次，
 *    订阅源 = `lib/auth.ts` 的 `subscribeAuth()`（`AUTH_CHANGED_EVENT` + 原生 `storage`）；
 *  - 页面侧由 `components/auth-gate.tsx` 消费三态：`idle` → 骨架屏（不是任何文案）、
 *    `guest` → `components/login-wall.tsx` 的可读引导。
 *
 * `useAuthed(): boolean` 的**签名与语义逐字保留**（`idle` 期仍返回 `false`）：
 * 它有 13 处调用点在 T-12/T-15 名下文件里（`header.tsx`、`more-menu.tsx`、`use-lookup.ts`、
 * `word-lookup.tsx`、四个页面……），本任务只把"什么时候变 true"变准，不改"true 是什么意思"。
 * 需要区分"还没确定"与"确定没登录"的页面请改用 `useAuthStatus()` + `<AuthGate>`。
 */

import * as React from 'react';
import { authSnapshot, getUser, isUpgradeAdvisory, isUpgradePending, subscribeAuth } from './auth';

export type AuthStatus = 'idle' | 'authed' | 'guest';

/** 服务端快照恒 `idle`：SSR/SSG 产物里不出现任何"已登录/未登录"的既成事实。 */
const SERVER_SNAPSHOT: AuthStatus = 'idle';

const getSnapshot = (): AuthStatus => authSnapshot();

/** 订阅 + 快照的同一份真相（登出/登录/跨标签页三条路径都汇到这一个 store）。 */
function useAuthStore(): AuthStatus {
  return React.useSyncExternalStore(subscribeAuth, getSnapshot, () => SERVER_SNAPSHOT);
}

/** 三态（判据① 的读点）。 */
export function useAuthStatus(): AuthStatus {
  return useAuthStore();
}

/** 登录态是否已确定（骨架屏 → 内容的分界，R-23② 括号里的口径）。 */
export function useAuthHydrated(): boolean {
  return useAuthStore() !== 'idle';
}

/** 兼容原签名：`idle` 与 `guest` 都是 `false`。 */
export function useAuthed(): boolean {
  return useAuthStore() === 'authed';
}

/** 一把 `localStorage` 标志位的订阅读法（服务端快照恒 false ⇒ SSG 产物零副作用）。 */
const useFlagSnapshot = (read: () => boolean): boolean =>
  React.useSyncExternalStore(subscribeAuth, read, () => false);

/**
 * 强制改密门禁标志位（R-40④ / 判据⑦）。
 * **只读 `localStorage` 的一位标志**，不请求 `auth.me`、不发任何网络调用 ——
 * `upgrade-gate` 包在根 layout，任何一次网络往返都可能变成全站白屏（§10.2 T-16 行的风险栏）。
 */
export function useUpgradeRequired(): boolean {
  return useFlagSnapshot(isUpgradePending);
}

/** 止血阀（§6.4-5-5）off 时的"已进门、待改密"软告知位（R-23⑦ 末句的入口提示用这一位）。 */
export function useUpgradeAdvisory(): boolean {
  return useFlagSnapshot(isUpgradeAdvisory);
}

/** 已登录用户的手机号（弹窗回显 / 「关于」页用；未登录 `null`，只在挂载后读）。 */
export function useAuthPhone(): string | null {
  const status = useAuthStore();
  const [phone, setPhone] = React.useState<string | null>(null);
  React.useEffect(() => {
    setPhone(status === 'authed' ? (getUser()?.phone ?? null) : null);
  }, [status]);
  return phone;
}
