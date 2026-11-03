/**
 * `AndroidBridge` 探测层（架构 §5.6 第 2 行的对岸）。
 *
 * 名字冻结的理由：`mobile-memory/src/com/tomorrow/memory/MainActivity.java` 里
 * `web.addJavascriptInterface(new Bridge(), "AndroidBridge")`，并且 `onPageFinished` 会在
 * `localStorage['tm.token']` 为空时把 SharedPreferences 里的 token 回灌进**同一个键**。
 * → 键名 `tm.token` 与三个方法名（saveToken / readToken / consumeLaunchFocus）一个字都不许改。
 *
 * §5.6 计划的 5 个新方法（saveTempToken / readTempToken / clearToken / setLaunchFocus /
 * getAppVersion）在 T-20 交付前可能不存在 → 一律特性探测，缺了就退回 localStorage / 内存，
 * 浏览器里跑 dev 也不报错。
 */

export const TOKEN_KEY = 'tm.token';
export const PHONE_KEY = 'tm.phone';
export const NICKNAME_KEY = 'tm.nickname';

export interface AndroidBridgeLike {
  saveToken?: (token: string) => void;
  readToken?: () => string | null;
  consumeLaunchFocus?: () => string | null;
  setLaunchFocus?: (focus: string) => void;
  saveTempToken?: (token: string) => void;
  readTempToken?: () => string | null;
  clearTempToken?: () => void;
  clearToken?: () => void;
  getAppVersion?: () => string | null;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeLike;
    /** 旧手写 App 的同名调试钩子（`api.js:5`），保留：内网自测时用它指向别的环境。 */
    __API_BASE__?: string;
  }
}

const memory = new Map<string, string>();

export function bridge(): AndroidBridgeLike | null {
  if (typeof window === 'undefined') return null;
  return window.AndroidBridge ?? null;
}

const hasWindow = (): boolean => typeof window !== 'undefined';

/** localStorage 在 WebView 未开 DOMStorage 时会抛（§5.6①）→ 内存兜底，永不抛。 */
export function kvGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {
    /* 隐私模式 / 容量 0 */
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

/**
 * 写盘。**返回 boolean 而不是抛错**（A-43 #77）：
 * 旧实现把 `setItem` 的异常吞成静默内存兜底（返回 `void`），于是"写失败"在整条链上**不可感知** ——
 * 词本删除写不进存储也回 `已移出 · 撤销` 的成功承诺，§3.6.5 末行「删除写失败：行不消失 + 定稿 toast」
 * 这一分支真机不可达（`offline-queue.saveState` 永不抛 → `WordbookScreen` 的 catch 是死代码）。
 *
 * 为什么不改成抛错：本函数是 token / flags / startup / 队列共用的底座，全仓 12 处调用点里
 * 只有队列需要知道成败；抛错会把语义无关的登录面一起炸掉。返回 boolean 对**忽略返回值**的
 * 调用方零影响（`void` 返回类型允许被赋成 `(k,v)=>void`），需要成败的那一处自行判定后抛。
 *
 * @returns `true` = 真的写进了 localStorage（进程外可见）；`false` = 落到内存兜底（读侧仍可用，进程结束即丢）。
 */
export function kvSet(key: string, value: string | null): boolean {
  try {
    if (typeof localStorage === 'undefined') throw new Error('no-storage');
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    memory.set(key, value ?? '');
    return false;
  }
}

export function readToken(): string {
  const b = bridge();
  let token = '';
  try {
    token = b && b.readToken ? String(b.readToken() ?? '') : '';
  } catch {
    token = '';
  }
  if (!token) token = kvGet(TOKEN_KEY) ?? '';
  // Java 侧回灌是单向的（SharedPreferences → localStorage）；这里补上反向，冷启动两处一致。
  if (token && !kvGet(TOKEN_KEY)) kvSet(TOKEN_KEY, token);
  return token;
}

/** 双写（§3.1 的 `app: localStorage + Bridge 双写`）。传空串即清除。 */
export function writeToken(token: string | null): void {
  const value = token ?? '';
  kvSet(TOKEN_KEY, value || null);
  const b = bridge();
  try {
    if (b?.saveToken) b.saveToken(value);
    if (!value && b?.clearToken) b.clearToken();
  } catch {
    /* 非 WebView 环境 */
  }
}

export function writeIdentity(phone: string | null, nickname: string | null): void {
  kvSet(PHONE_KEY, phone);
  kvSet(NICKNAME_KEY, nickname);
}

/** 401 单点登出用（rest-fetcher 是本函数在 App 内的唯一调用点）。 */
export function clearCredential(): void {
  writeToken(null);
  kvSet(PHONE_KEY, null);
  kvSet(NICKNAME_KEY, null);
  writeTempToken(null);
}

/* ── upgrade token（R-40④）：只存 SharedPreferences，改密成功即清（§5.6 第 2 行） ── */

export function readTempToken(): string {
  const b = bridge();
  try {
    if (b?.readTempToken) return String(b.readTempToken() ?? '');
  } catch {
    /* 方法尚未落地 */
  }
  return kvGet('tm.tempToken') ?? '';
}

export function writeTempToken(token: string | null): void {
  const value = token ?? '';
  kvSet('tm.tempToken', value || null);
  const b = bridge();
  try {
    if (!value && b?.clearTempToken) b.clearTempToken();
    else if (value && b?.saveTempToken) b.saveTempToken(value);
  } catch {
    /* 同上 */
  }
}

/** 版本清单比对用的当前版本（R-17⑨）。缺 `getAppVersion()` 时回落构建期常量。 */
export function currentAppVersion(): string {
  const b = bridge();
  try {
    const v = b?.getAppVersion ? String(b.getAppVersion() ?? '') : '';
    if (v) return v;
  } catch {
    /* 方法尚未落地 */
  }
  const injected = kvGet('tm.appVersion');
  return injected || '0.0.0';
}

export function openExternal(url: string): void {
  if (!hasWindow()) return;
  try {
    window.open(url, '_system');
  } catch {
    try {
      window.location.assign(url);
    } catch {
      /* 交给 T-20：Captcha/Intent 兜底属原生侧 */
    }
  }
}
