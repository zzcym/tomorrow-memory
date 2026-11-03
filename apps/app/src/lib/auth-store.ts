/**
 * App 侧登录态的**单一真值源**（T-19a / 架构 §3.1、§5.2 第 2 条规矩、R-39⑧、R-40④、判据②⑧）。
 *
 * 形状与仓库里已有的三个 store 完全同形（`host.tsx` 的 toast、`data/startup.ts` 的同步状态、
 * `router.tsx` 的路由）：**模块级不可变快照 + `Set<() => void>` 订阅**，React 侧一律
 * `React.useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot)` 读它，
 * 与 `host.tsx:94` 的用法逐字对齐（本文件不改 `host.tsx` / `shell/**`，只对齐口径）。
 *
 * 五条硬规矩：
 *  1. **状态只有一个来源**：快照的 `status / phone / nickname / hasToken / upgradeSessionOnly`
 *     全部**从存储派生**（`token-bridge` → `native/bridge` → localStorage/内存），
 *     本文件不自带第二份 token 副本；只有两位是刻意的内存位（`pendingAction`、`advisoryUpgrade`，
 *     理由见各自注释）。
 *  2. **写凭据只有一个动作** `signIn()`（判据②）：登录 / 注册 / 激活三条成功路径共用它，
 *     一次做完"落 token（→ `AndroidBridge.saveToken`）+ 落身份 + 重读派生 + 广播一次"，
 *     返回的那一帧就已经是 `signed-in` ⇒ **无二次登录**。
 *  3. **清凭据只有一个函数** `signOut()`，它转发 `token-bridge.clearStoredSession()`
 *     = `native/bridge.ts:clearCredential()`（全仓唯一清点）。别处只调用、不再抄一份。
 *  4. **401 的判定不在这里**：`data/rest-fetcher.ts` 的 `handleAuthError()` 才是判据⑧ 的单点
 *     （它自己已完成"清凭据 + 广播 + 跳 `/login`"三件事，T-14 判据④ 有测试）。
 *     本文件只做**订阅方**：`attachAuthSignals()` 挂到它已导出的 `onAuthSignal` 上。
 *     ⇒ 本文件**没有任何 HTTP 状态码 / 错误码分支**，成不了第二份 401 处理（用例里有机检断言）。
 *  5. **不 import 路由**（`router.tsx` 会反向拉起页面，import 它成环；A-44 #86 也要求批次4D
 *     各轮与路由解耦）：跳登录只导出**目标路由常量** `LOGIN_ROUTE` / `UPGRADE_PASSWORD_ROUTE`，
 *     由调用方（或 `rest-fetcher` 已绑好的 navigate）去执行。
 *
 * 与 `data/rest-fetcher.ts` 的 `hasCredential()` 关系：两者读的是**同一个键**（`readToken()`），
 * 本 store 只给它加一层"会变就知道"的订阅面，**不改变判定**（用例有对账断言）。
 */

import * as React from 'react';
import { onAuthSignal } from '../data/rest-fetcher.js';
import {
  clearStoredSession,
  clearUpgradeToken,
  currentUpgradeToken,
  hasStoredToken,
  hasUpgradeToken,
  readStoredIdentity,
  saveIdentity,
  saveSessionToken,
  saveUpgradeToken,
} from './token-bridge.js';

/* ═════════════════ 路由常量（不 import router.tsx，见文件头第 5 条规矩） ═════════════════ */

/** 与 `router.tsx:59` 登记的 gate 路由同值；写常量而非引路由，是为了 #86 的"各轮对 router.tsx 零 diff"。 */
export const LOGIN_ROUTE = '/login';
/** 与 `LOGIN_ROUTE` 同形：`router.tsx` 路由表第 12 条登记的 gate 路由；`/register` 与 `/login` 共指 `LoginScreen`，那颗屏的 `mode` 由路由 path 派生，本常量就是唯一字面量源。 */
export const REGISTER_ROUTE = '/register';
/** 与 `router.tsx` 的 `GATE_UPGRADE_PATH` 同值（`shell/GateLayout.tsx` 按它判"不可关闭"）。 */
export const UPGRADE_PASSWORD_ROUTE = '/upgrade-password';

export type LoginRoute = typeof LOGIN_ROUTE;
export type RegisterRoute = typeof REGISTER_ROUTE;

/* ═════════════════ 快照 ═════════════════ */

export type AuthStatus = 'signed-in' | 'signed-out';

/**
 * 未登录时被打断的动作（R-16② / R-39⑧ 的"待收藏"）：**只存内存**。
 * 理由：登录页与应用在同一个 JS 上下文里（hash 路由，不重载页面），落盘反而多出一个
 * `clearCredential()` 管不到的键（那个清点归 `native/bridge.ts`，本任务不得改它）。
 */
export type PendingAction =
  | { kind: 'favorite'; word: string }
  | { kind: 'open'; path: string };

export interface AuthSnapshot {
  status: AuthStatus;
  /** 已登录时的手机号回显；未登录恒空串（清凭据后不得再回显上一个账号）。 */
  phone: string;
  nickname: string;
  /** 是否握有正常凭据（与 `rest-fetcher.hasCredential()` 同源的派生位）。 */
  hasToken: boolean;
  /** 需要强制改密（R-40④）：= 只握临时凭据 **或** 内存里的软告知位。 */
  upgradeRequired: boolean;
  /** 只握有临时凭据（正常 token 尚未签发）⇒ `UpgradePasswordScreen` 的提交前提（判据③）。 */
  upgradeSessionOnly: boolean;
  pendingAction: PendingAction | null;
}

/** 软告知位（止血阀 `passwordUpgradeEnforce=off` 时"人已进门但仍该改密"）：内存位，理由见 `upgradeRequired`。 */
let advisoryUpgrade = false;
let pendingAction: PendingAction | null = null;

/** 从存储派生整份快照（**唯一**的派生函数，`refreshFromStorage()` 与初始化共用它）。 */
function deriveFromStorage(): AuthSnapshot {
  const token = hasStoredToken();
  const upgradeOnly = !token && hasUpgradeToken();
  const identity = readStoredIdentity();
  return {
    status: token ? 'signed-in' : 'signed-out',
    // 手机号在两种"有会话"的场合都可见：正常登录，以及强制改密门禁（`GateLayout` 的 header 要回显它）；
    // 真正退出登录后（两个 token 都没了）必须回空，不得把上一个账号的手机号留在屏上。
    phone: token || upgradeOnly ? identity.phone : '',
    nickname: token ? identity.nickname : '',
    hasToken: token,
    upgradeRequired: upgradeOnly || advisoryUpgrade,
    upgradeSessionOnly: upgradeOnly,
    pendingAction,
  };
}

let snapshot: AuthSnapshot = deriveFromStorage();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* 订阅方抛错不得反噬动作本身（与 host.tsx / startup.ts 同口径） */
    }
  }
}

/** `getSnapshot`：无变化时返回**同一引用**（`useSyncExternalStore` 按 `Object.is` 比较，防渲染死循环）。 */
export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/** `subscribe`：返回解绑函数，形状与 `subscribeToasts` / `subscribeSyncStatus` 一致。 */
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * **重读存储 → 换引用 → 广播一次**（本文件唯一的快照替换点）。
 *
 * 两个正当调用场景：
 *  - 冷启动：Java 的 `onPageFinished` 会在 `localStorage['tm.token']` 为空时把 SharedPreferences
 *    里的 token **回灌**进同一个键（§5.6 第 2 行），时机可能晚于首帧 ⇒ 启动链之后调一次；
 *  - 401 之后：`rest-fetcher` **已经清过凭据**了，这里只是让内存跟着变，**不再清第二次**
 *    （`bridge.clearToken` 的调用次数就是判据⑧ 的"单点"证据，见用例）。
 */
export function refreshFromStorage(): AuthSnapshot {
  snapshot = deriveFromStorage();
  notify();
  return snapshot;
}

/* ═════════════════ 读侧（屏与组件的唯一问法） ═════════════════ */

export function isSignedIn(): boolean {
  return snapshot.status === 'signed-in';
}

/**
 * 「无 token 不得发任何业务请求」的可执行面（判据⑧ 前半句 + §5.2 的 `NO_AUTH` 口径）：
 * 打业务接口前问一次，`allowed === false` 就**一个请求都不发**，并按 `target` 去对应门禁页。
 */
export function businessRequestGate(): { allowed: boolean; target: string | null } {
  if (hasStoredToken()) return { allowed: true, target: null };
  return {
    allowed: false,
    target: currentUpgradeToken() ? UPGRADE_PASSWORD_ROUTE : LOGIN_ROUTE,
  };
}

/** 只在已登录时执行动作；未登录则回跳转目标（调用方负责 `navigate`，本文件不跳）。 */
export function runWhenSignedIn<T>(
  task: () => T,
): { ok: true; value: T } | { ok: false; target: string } {
  const gate = businessRequestGate();
  if (!gate.allowed) return { ok: false, target: gate.target as string };
  return { ok: true, value: task() };
}

/* ═════════════════ 写侧 ═════════════════ */

/**
 * `@tm/shared` 的 `AuthResultDto` 的**结构子集**（写成结构类型而不是 import 契约：
 * 让屏侧手造的响应与 `data/queries/auth`（批次4 尚缺）的真响应都能直接喂进来）。
 */
export interface SessionFacts {
  token: string;
  phone?: string;
  nickname?: string;
  hasPassword?: boolean;
  /** R-39⑤b：true = 本次是"设密码即激活"路径 —— 与新建账号**同一个落点**，不分叉。 */
  activated?: boolean;
  /** R-40④：true = 命中强制改密门禁（此时服务端**不发**正常 token）。 */
  upgrade_required?: boolean;
  upgradeToken?: string;
}

export type SignInOutcome = 'signed-in' | 'upgrade-required';

/**
 * 判据② 的落点：登录 / 注册 / 激活三条成功路径**共用**这一个函数
 * （服务端 `auth-service.registerOrActivate()` 单点裁决在客户端的镜像）。
 * 顺序固定：`saveSessionToken`（→ `writeToken` → `AndroidBridge.saveToken`）→ `saveIdentity`
 *  → 作废临时凭据 → 置软告知位 → `refreshFromStorage()`（广播一次）。
 *
 * @returns `'signed-in'` = 已进门（同一帧快照即为真，**无二次登录**）；
 *          `'upgrade-required'` = 服务端没发正常 token，只有临时凭据（R-40④ 硬门禁）。
 */
export function signIn(facts: SessionFacts): SignInOutcome {
  const token = typeof facts.token === 'string' ? facts.token : '';
  const stored = readStoredIdentity();
  const phone = typeof facts.phone === 'string' ? facts.phone : stored.phone;
  const nickname = typeof facts.nickname === 'string' ? facts.nickname : stored.nickname;

  if (token === '') {
    // R-40④：没有正常 token 就当"没进门"，只留临时凭据，绝不伪造 signed-in。
    const upgradeToken = typeof facts.upgradeToken === 'string' ? facts.upgradeToken : '';
    if (upgradeToken) saveUpgradeToken(upgradeToken);
    if (phone || nickname) saveIdentity(phone, nickname);
    advisoryUpgrade = false;
    return refreshFromStorage().status === 'signed-in' ? 'signed-in' : 'upgrade-required';
  }

  saveSessionToken(token);
  saveIdentity(phone, nickname);
  clearUpgradeToken(); // 两把钥匙不同时存在（正常凭据到手，临时凭据作废）
  advisoryUpgrade = facts.upgrade_required === true;
  return refreshFromStorage().status === 'signed-in' ? 'signed-in' : 'upgrade-required';
}

/**
 * 判据⑧ 的**主动侧**（「退出登录」动作，T-19d/T-19e 用）。
 * 401 那一半不在这里 —— `rest-fetcher` 自己会调 `clearCredential()` 并广播；
 * 这里若再判一次状态码就成了第二份 401 处理（明确禁止）。
 *
 * @returns 跳转目标常量；调用方负责 `navigate(signOut())`。
 */
export function signOut(): LoginRoute {
  clearStoredSession();
  advisoryUpgrade = false;
  pendingAction = null;
  refreshFromStorage();
  return LOGIN_ROUTE;
}

/** 改密成功（R-40④ 出口）：临时凭据一律作废；服务端若发了新 token 就按正常登录落。 */
export function afterPasswordChanged(facts?: SessionFacts): SignInOutcome {
  if (facts && typeof facts.token === 'string' && facts.token !== '') return signIn(facts);
  clearUpgradeToken();
  advisoryUpgrade = false;
  return refreshFromStorage().status === 'signed-in' ? 'signed-in' : 'upgrade-required';
}

/** `attachAuthSignals()` 的引用计数：多张屏各挂各的，最后一个解绑者才真断开。 */
let attached = 0;
let detachSource: (() => void) | null = null;

/**
 * 与 `data/rest-fetcher.ts` 的**接线契约**（本轮交付的注入点，`rest-fetcher.ts` 一字未改）：
 *  - 它早已导出 `onAuthSignal(listener)`（判据④ 的广播面）。401 时它自己做完
 *    "清凭据（`bridge.clearCredential`）+ 跳 `/login`"，然后广播 `sign-out`；
 *  - 本函数把那条广播接进 store：`sign-out` → `refreshFromStorage()`（**对齐**，不清第二次）；
 *    `password-upgrade-required` → 置软告知位（token 仍在，改密页要用它，判据④-2 的口径）；
 *  - 谁在什么时候调：**应用入口挂载时一次**（本轮禁改 `main.tsx` / `host.tsx`，
 *    接线与五屏挂载一起做，见报告"上报未修"）；未接线前 store 也不会与 `hasCredential()` 失同步，
 *    因为两者同源，只是"不会自动通知"，屏可自行调 `refreshFromStorage()`。
 *
 * @returns 解绑函数（引用计数）。
 */
export function attachAuthSignals(): () => void {
  attached += 1;
  if (!detachSource) {
    detachSource = onAuthSignal((signal) => {
      if (signal === 'sign-out') {
        refreshFromStorage();
        return;
      }
      notePasswordUpgradeRequired(true);
    });
  }
  return () => {
    attached -= 1;
    if (attached <= 0 && detachSource) {
      const release = detachSource;
      detachSource = null;
      attached = 0;
      release();
    }
  };
}

/** 已登录但需要改密（403 的软告知面）：只动内存位，不碰任何凭据。 */
export function notePasswordUpgradeRequired(value = true): void {
  if (advisoryUpgrade === value) return;
  advisoryUpgrade = value;
  refreshFromStorage();
}

/* ═════════════════ 待续作动作（R-16② / R-39⑧ 的"待收藏"） ═════════════════ */

export function rememberPendingAction(action: PendingAction): void {
  pendingAction = action;
  refreshFromStorage();
}

export function peekPendingAction(): PendingAction | null {
  return snapshot.pendingAction;
}

/** 取出即清（`LoginScreen` 在 `signIn()` 返回 `'signed-in'` 的同一轮里调用并续作）。 */
export function takePendingAction(): PendingAction | null {
  const action = pendingAction;
  if (action) {
    pendingAction = null;
    refreshFromStorage();
  }
  return action;
}

/* ═════════════════ React 侧（与 `host.tsx:94` 的 toast store 同形用法） ═════════════════ */

/** `file://` 无 SSR ⇒ server snapshot 与 client 同源（不引"先 idle 再 authed"的中间帧，R-23② 是 Web 面的事）。 */
export function useAuthSnapshot(): AuthSnapshot {
  return React.useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}

/** 只关心布尔面的调用点；读的仍是同一份快照，不引第二套状态。 */
export function useSignedIn(): boolean {
  return useAuthSnapshot().status === 'signed-in';
}
