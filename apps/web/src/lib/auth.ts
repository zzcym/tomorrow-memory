/**
 * 凭据与登录态的**唯一本地落点**（T-16 / R-23 / R-39⑧ / R-40③④⑥）。
 *
 * 四条口径：
 *  1. **键名与语义向后兼容**：`tm_token` / `tm_user` 与既有的 `getToken/setToken/clearToken/
 *     getUser/setUser/clearUser/isLoggedIn` 一字不改（`header.tsx`、`word-lookup.tsx`、
 *     `lib/hooks/use-lookup.ts` 等 T-12/T-15 名下文件仍按原签名读它，属 §10.3 的 readers 关系）；
 *  2. **强制改密的钥匙与正常钥匙分放**（R-40④）：`upgradeToken` 只写 `tm_upgrade_token`，
 *     **永不覆盖 `tm_token`** —— 否则"带着待升级会话在应用里做事"这条被 PRD 明令禁止的路径
 *     就被前端自己开出来了；`tm_upgrade_required` 是 `upgrade-gate` **唯一读取的标志位**
 *     （该组件按设计不做任何网络请求）；
 *  3. 所有读写都过一次 `emitAuthChanged()`，订阅面只有 `AUTH_CHANGED_EVENT` + 原生 `storage`
 *     两条，`use-auth.ts` 的 `useSyncExternalStore` 是唯一消费者（不再有第二处 `addEventListener`）；
 *  4. 回跳原页（R-23①）与"待收藏"续作（R-23④ / R-16② / R-39⑧）的**状态**存在这里，
 *     **执行**在 `components/login-dialog.tsx` 一处 —— 页面只负责在把用户挡在门外时登记。
 *
 * `--web` 门禁（A-30-4）扫的是 `(user)/page.tsx` + `components/home/**` + `lib/api/**`，
 * 本文件不在其列 ⇒ 这里是全站唯一允许直接摸 `localStorage` 的凭据面。
 */

import type { AuthResultDto } from '@tm/shared';

const TOKEN_KEY = 'tm_token';
const USER_KEY = 'tm_user';
/** R-40④ 的 upgrade token（TTL ≤30 分钟、只能打改密接口）。 */
const UPGRADE_TOKEN_KEY = 'tm_upgrade_token';
/** `upgrade-gate` 唯一读取的**标志位**：`'1'` = 会话被拦在门外、只能去改密页。 */
const UPGRADE_FLAG_KEY = 'tm_upgrade_required';
/**
 * 止血阀（PRD §6.4-5-5：`passwordUpgradeEnforce=off`）下的**软告知位**：
 * 服务端此时既给了正常 token 又标了 `upgrade_required:true` ⇒ 人已经进门，门禁不拦，
 * 只在业务入口显示"请先修改密码"（R-23⑦ 末句）。与硬门禁位是两把不同的键。
 */
const UPGRADE_ADVISORY_KEY = 'tm_upgrade_advisory';
/** 登录/改密成功后要回跳的原页（判据④⑦ 末句"回到原页面"）。 */
const RETURN_TO_KEY = 'tm_return_to';
/** 未登录时被打断的动作（判据④ 的"待收藏那个词"），成功登录后由弹窗单点续作。 */
const PENDING_ACTION_KEY = 'tm_pending_action';

/** 同源跨标签页 + 同页组件间的唯二通知源。 */
export const AUTH_CHANGED_EVENT = 'tm-auth-changed';
/**
 * 请求打开登录弹窗的事件名（全站唯一实例挂在 `components/header.tsx`）。
 * ⚠ 字面量与 T-12 的 `components/home/result-section.tsx:30` 同值两处 —— `AUTH_EVENTS`
 * 那一份单一源在 shared 尚不存在，已作为"待 shared 补常量"登记进 T-16 报告（不改 T-12 文件）。
 */
export const LOGIN_OPEN_EVENT = 'tm-open-login';

export interface StoredUser {
  phone: string;
  nickname: string;
  avatar: string;
  hasPassword: boolean;
}

/** 登录后要续作的动作（判据④ 目前只有收藏一种，形状留开给打卡）。 */
export type PendingAction =
  | { kind: 'favorite'; word: string }
  | { kind: 'checkin' };

const isBrowser = (): boolean => typeof window !== 'undefined';

const read = (key: string): string | null => {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // 隐私模式 / WebView 禁用 DOMStorage（UI §5.6）：读不到就当没有，绝不抛
    return null;
  }
};

const write = (key: string, value: string): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 同上：写不进去不影响页面可用性 */
  }
};

const remove = (key: string): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
};

/** 通知订阅方（`use-auth.ts` 的 store）。 */
export function emitAuthChanged(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/* ───────────────────── 正常凭据（形状与改动前一字相同） ───────────────────── */

export function getToken(): string | null {
  return read(TOKEN_KEY);
}

export function setToken(token: string): void {
  write(TOKEN_KEY, token);
  emitAuthChanged();
}

export function clearToken(): void {
  remove(TOKEN_KEY);
  emitAuthChanged();
}

export function getUser(): StoredUser | null {
  const raw = read(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setUser(user: StoredUser): void {
  write(USER_KEY, JSON.stringify(user));
  emitAuthChanged();
}

export function clearUser(): void {
  remove(USER_KEY);
  emitAuthChanged();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/** 登录态快照（`useSyncExternalStore` 的 `getSnapshot` 用；服务端恒 `guest`，由 hook 侧给 `idle`）。 */
export function authSnapshot(): 'authed' | 'guest' {
  return getToken() ? 'authed' : 'guest';
}

/**
 * R-40③ 的**单点**动作：`CREDENTIAL_EXPIRED` → 清本地凭据。
 * 一次清完、一次通知（三个键各自 emit 会让订阅方在同一次 401 里重渲染三轮）。
 */
export function clearCredential(): void {
  remove(TOKEN_KEY);
  remove(USER_KEY);
  remove(UPGRADE_TOKEN_KEY);
  remove(UPGRADE_FLAG_KEY);
  remove(UPGRADE_ADVISORY_KEY);
  emitAuthChanged();
}

/* ───────────────────── 强制改密会话（R-40④） ───────────────────── */

export function getUpgradeToken(): string | null {
  return read(UPGRADE_TOKEN_KEY);
}

/** `upgrade-gate` 与 `providers.tsx` 共用的标志位读点（**只读、不发请求**）。 */
export function isUpgradePending(): boolean {
  return read(UPGRADE_FLAG_KEY) === '1';
}

/** 软告知位：止血阀 off 时"人已进门、待改密"，入口显示"请先修改密码"用这一位（R-23⑦ 末句）。 */
export function isUpgradeAdvisory(): boolean {
  return read(UPGRADE_ADVISORY_KEY) === '1';
}

const clearKeysSilently = (keys: string[]): void => {
  keys.forEach(remove);
};

/**
 * 收下 `upgrade_required` 的登录响应。
 * 两种情形分开处理（`passwordUpgradeEnforce=off` 是 PRD §6.4-5-5 的止血阀）：
 *  - **无正常 token**（开关 on）= 硬门禁 → 只写 upgrade 键，`tm_token` 保持为空；
 *  - **带正常 token**（止血阀 off）= 服务端已放人进门 → 写正常凭据、**不置门禁标志**，
 *    改密待办由业务入口的 `UpgradeEntryNotice` 承担（R-23⑦ 末句），不拦路由。
 */
export function enterUpgradeSession(upgradeToken?: string): void {
  if (upgradeToken) write(UPGRADE_TOKEN_KEY, upgradeToken);
  write(UPGRADE_FLAG_KEY, '1');
  remove(UPGRADE_ADVISORY_KEY);
  emitAuthChanged();
}

export function enterUpgradeAdvisory(): void {
  write(UPGRADE_ADVISORY_KEY, '1');
  emitAuthChanged();
}

export function clearUpgradeSession(): void {
  remove(UPGRADE_TOKEN_KEY);
  remove(UPGRADE_FLAG_KEY);
  remove(UPGRADE_ADVISORY_KEY);
  emitAuthChanged();
}

/** 登录/注册/激活/改密四条出参的**唯一落库出口**（判据⑥⑦ 共用同一次判断）。 */
export function applyAuthResult(data: AuthResultDto): 'authed' | 'upgrade' {
  const token = typeof data.token === 'string' ? data.token : '';
  const user: StoredUser = {
    phone: data.phone,
    nickname: data.nickname ?? '',
    avatar: data.avatar ?? '',
    hasPassword: data.hasPassword ?? true,
  };
  if (data.upgrade_required === true && token === '') {
    // 硬门禁：正常 token 在改密成功前一律不签发（R-40④），前端也不许替它补一把
    clearKeysSilently([TOKEN_KEY, USER_KEY, UPGRADE_ADVISORY_KEY]);
    if (data.upgradeToken) write(UPGRADE_TOKEN_KEY, data.upgradeToken);
    write(UPGRADE_FLAG_KEY, '1');
    emitAuthChanged();
    return 'upgrade';
  }
  if (token === '') return isUpgradePending() ? 'upgrade' : 'authed';
  clearKeysSilently([UPGRADE_TOKEN_KEY, UPGRADE_FLAG_KEY]);
  write(TOKEN_KEY, token);
  write(USER_KEY, JSON.stringify(user));
  if (data.upgrade_required === true) write(UPGRADE_ADVISORY_KEY, '1');
  else remove(UPGRADE_ADVISORY_KEY);
  emitAuthChanged();
  return 'authed';
}

/* ───────────────────── 回跳原页 / 待续作动作（判据④） ───────────────────── */

/** 只接受站内相对路径，防开放重定向。 */
export function rememberReturnTo(path: string | null | undefined): void {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return;
  if (path.startsWith('/upgrade-password')) return;
  write(RETURN_TO_KEY, path);
}

export function peekReturnTo(): string | null {
  return read(RETURN_TO_KEY);
}

export function takeReturnTo(): string | null {
  const value = peekReturnTo();
  remove(RETURN_TO_KEY);
  return value;
}

export function rememberPendingAction(action: PendingAction): void {
  write(PENDING_ACTION_KEY, JSON.stringify(action));
}

export function peekPendingAction(): PendingAction | null {
  const raw = read(PENDING_ACTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAction;
  } catch {
    remove(PENDING_ACTION_KEY);
    return null;
  }
}

export function takePendingAction(): PendingAction | null {
  const action = peekPendingAction();
  remove(PENDING_ACTION_KEY);
  return action;
}

/* ───────────────────── 订阅面（use-auth.ts 的唯一输入） ───────────────────── */

export function subscribeAuth(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  // 其他标签页直接改 localStorage 的场景（原生 storage 事件不带自定义事件）
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * `requestLogin()` 的 detail 形状 —— 唯一声明点在这里（不在消费方用 `Parameters<typeof …>` 反推，
 * 那样 `requestLogin` 会被 eslint 判成"只当类型用的值导入"，也等于把形状的第二份真相放进组件）。
 */
export interface LoginOpenDetail {
  mode?: 'sign-in' | 'register';
  phone?: string;
  returnTo?: string;
  pendingAction?: PendingAction;
}

/**
 * 请求打开登录弹窗（全站唯一实例在 `header.tsx`，它只监听事件名，不看 detail）。
 * detail 由本任务的 `login-dialog.tsx` 自己读：`mode` 决定落地态（判据③⑤），
 * `pendingAction` / `returnTo` 在开门**之前**先落库，登录成功后续作（判据④）。
 */
export function requestLogin(detail?: LoginOpenDetail): void {
  if (!isBrowser()) return;
  if (detail?.returnTo) rememberReturnTo(detail.returnTo);
  if (detail?.pendingAction) rememberPendingAction(detail.pendingAction);
  window.dispatchEvent(new CustomEvent(LOGIN_OPEN_EVENT, { detail: detail ?? null }));
}
