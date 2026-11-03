/**
 * `native/bridge.ts` 的**薄封装**（T-19a / 架构 §5.6 第 2 行、§3.1「App：localStorage + Bridge 双写」）。
 *
 * 存在理由只有一条：让 `lib/auth-store.ts` 与批次4D 的五张屏**永远不直接 import `native/bridge.js`**，
 * 于是"token 与身份落在哪儿"这个问题在 App 侧只有一个问法。本文件因此刻意**不做**任何判断：
 *  - 不判 `kvSet` 的返回值（裁决 A-47 / #99：本期只有离线队列判写盘成败，token/flags 面沿用现状），
 *  - 不判 HTTP 状态码与错误码（判据⑧ 的 401 单点在 `data/rest-fetcher.ts`），
 *  - 不持久化任何"待办标志位"（见 `auth-store.ts` 的 `upgradeRequired`：只从响应/广播推导，理由写在那里）。
 *
 * 降级路径（§5.6①②，原生桥在 T-20 交付前可能整个不存在、也可能存在但缺方法）：
 *  `native/bridge.ts` 的 `writeToken`/`writeTempToken` 内部对每个桥方法都套了 `try/catch`，
 *  并且**总是**先写 localStorage（`kvSet` 在 DOMStorage 被关时再落内存 Map）。
 *  ⇒ 这里拿到的永远是"最坏也不抛"的语义，`tokenChannel()` 只作诊断（真机 remote inspect / 用例），
 *  **任何业务分支都不得读它来决定要不要重试或要不要提示**（那会把"成败判定"从队列面漏进登录面）。
 */

import {
  NICKNAME_KEY,
  PHONE_KEY,
  TOKEN_KEY,
  bridge,
  clearCredential,
  readIdentity,
  readTempToken,
  readToken,
  writeIdentity,
  writeTempToken,
  writeToken,
} from '../native/bridge.js';

/** 三个存储键的原样转发（测试与诊断读点用它，别处不再复制键名字面量）。 */
export const SESSION_KEYS = {
  token: TOKEN_KEY,
  phone: PHONE_KEY,
  nickname: NICKNAME_KEY,
} as const;

/**
 * `native` = 桥在且 `saveToken` 方法已落地（T-20 之后的真机形态）；
 * `storage` = 只有 localStorage / 内存兜底（浏览器 dev、缺方法的旧 APK）。
 * **只用于诊断**，见文件头的"不判成败"。
 */
export type TokenChannel = 'native' | 'storage';

/** 特性探测：桥对象 + `saveToken` 两样齐了才算原生通道可用（§5.6 的"缺了就退回 localStorage"）。 */
export function tokenChannel(): TokenChannel {
  const b = bridge();
  return b && typeof b.saveToken === 'function' ? 'native' : 'storage';
}

/** 当前正常凭据（`readToken` 已含"桥 → localStorage → 内存"三级回落与反向回灌）。 */
export function currentToken(): string {
  return readToken();
}

export function hasStoredToken(): boolean {
  return currentToken() !== '';
}

/** 写正常凭据（双写 + 传空串即清除）；返回本次实际走的通道，仅供诊断。 */
export function saveSessionToken(token: string): TokenChannel {
  writeToken(token);
  return tokenChannel();
}

export interface StoredIdentity {
  phone: string;
  nickname: string;
}

/** 身份回显位（手机号 / 昵称）：与 token 同生共死的是 `clearCredential()`，见 `clearStoredSession`。
 *  bug_list #1：读侧走 `bridge.readIdentity()`（原生侧也存了一份），localStorage 被清后仍能回显。 */
export function readStoredIdentity(): StoredIdentity {
  return readIdentity();
}

export function saveIdentity(phone: string, nickname: string): void {
  writeIdentity(phone, nickname);
}

/**
 * 清凭据的**唯一**落点（判据⑧ 的"单点"在 App 侧只有一处）。
 *
 * ⚠ 这里刻意只做转发：真正的清理是 `native/bridge.ts:clearCredential()`
 * （token + phone + nickname + tempToken 一次清干净，`rest-fetcher` 的 401 分支调的就是它）。
 * ⇒ `auth-store` 的 `signOut()` 与本函数是**同一个函数的两个调用点**，不是两套清法；
 * 任何屏都不得自己 `saveSessionToken('')` 了事（那会留下 phone/nickname 回显与临时 token）。
 */
export function clearStoredSession(): void {
  clearCredential();
}

/* ───────────────── R-40④ 强制改密的临时凭据（与正常 token 分放，永不互覆） ───────────────── */

/** upgrade token 只进 `writeTempToken`（R-40④：它只能打改密接口）。 */
export function saveUpgradeToken(token: string): TokenChannel {
  writeTempToken(token);
  return tokenChannel();
}

export function currentUpgradeToken(): string {
  return readTempToken();
}

export function hasUpgradeToken(): boolean {
  return currentUpgradeToken() !== '';
}

/** 改密成功 / 放弃该会话：只作废临时 token，**不碰**正常凭据（正常凭据的另一半由 `clearStoredSession` 管）。 */
export function clearUpgradeToken(): void {
  writeTempToken(null);
}
