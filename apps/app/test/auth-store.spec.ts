/**
 * T-19a 的地基用例（§10.2 T-19 行的判据②与判据⑧的可测面）。
 *
 *  ② 注册/激活成功即 `AndroidBridge.saveToken`（R-39⑧），**无二次登录**；
 *  ⑧ 401 单点清凭据并跳登录（走 T-14 的 `rest-fetcher`）。
 *
 * 三条写法约定：
 *  - **不复制第二份 401 断言**：401 的"该不该处理"归 `test/rest-fetcher.spec.ts`（T-14 判据④已覆盖），
 *    这里只测"store 跟着变了没有、清点有没有多一次"；
 *  - 假桥只作**调用次数**的证据（`saveToken` / `clearToken` 各 1 次 = 单点），不参与任何判定；
 *  - 末尾一组源码级红线（不引路由、无第二份 401 分支、Chrome84 禁用 API）与 `screens/*` 各 spec
 *    的 `codeOnly()` 哨兵同一套路。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  afterPasswordChanged,
  attachAuthSignals,
  businessRequestGate,
  getAuthSnapshot,
  notePasswordUpgradeRequired,
  peekPendingAction,
  refreshFromStorage,
  rememberPendingAction,
  runWhenSignedIn,
  signOut,
  signIn,
  subscribeAuth,
  takePendingAction,
  type AuthSnapshot,
} from '../src/lib/auth-store.js';
import {
  currentUpgradeToken,
  hasStoredToken,
  hasUpgradeToken,
  readStoredIdentity,
  tokenChannel,
} from '../src/lib/token-bridge.js';
import {
  apiGet,
  bindNavigation,
  handleAuthError,
  hasCredential,
  onAuthSignal,
  resetAuthHandling,
} from '../src/data/rest-fetcher.js';
import {
  NICKNAME_KEY,
  PHONE_KEY,
  TOKEN_KEY,
  type AndroidBridgeLike,
} from '../src/native/bridge.js';

/* ═════════════════ 假原生桥（R-39⑧ 的 `saveToken` 与判据⑧ 的清点都在这里计数） ═════════════════ */

interface BridgeSpy {
  saveToken: ReturnType<typeof vi.fn>;
  readToken: ReturnType<typeof vi.fn>;
  clearToken: ReturnType<typeof vi.fn>;
  saveTempToken: ReturnType<typeof vi.fn>;
  readTempToken: ReturnType<typeof vi.fn>;
  clearTempToken: ReturnType<typeof vi.fn>;
}

function installBridge(): BridgeSpy {
  const spy: BridgeSpy = {
    saveToken: vi.fn(),
    readToken: vi.fn(() => ''),
    clearToken: vi.fn(),
    saveTempToken: vi.fn(),
    // 真桥的 `readTempToken` 命中方法时**不走** localStorage 回落（`bridge.ts:123-131` 只有一层 try），
    // 所以假实现必须自己吐出 `saveTempToken` 写进去的那一份，否则临时凭据"写进去读不出来"。
    readTempToken: vi.fn(() => localStorage.getItem('tm.tempToken') ?? ''),
    clearTempToken: vi.fn(),
  };
  window.AndroidBridge = spy as unknown as AndroidBridgeLike;
  return spy;
}

function removeBridge(): void {
  delete (window as unknown as { AndroidBridge?: AndroidBridgeLike }).AndroidBridge;
}

/** 抑制窗口 1500ms 是真实时钟量级，时间戳照 `rest-fetcher.spec.ts` 的口径给。 */
const T0 = 1_700_000_000_000;

let bridge: BridgeSpy;
let routes: string[];
let snapshots: AuthSnapshot[];
let unsubscribes: Array<() => void>;
let detachSignals: () => void;

beforeEach(() => {
  localStorage.clear();
  routes = [];
  snapshots = [];
  unsubscribes = [];
  bindNavigation((to) => routes.push(to));
  resetAuthHandling();
  // 复位顺序有讲究：`signOut()` 要跑在**装假桥之前** —— 它自己会触发一次 `saveToken('')`/`clearToken()`，
  // 混进用例的计数里就把判据②"只调一次"的证据弄脏了。
  signOut();
  bridge = installBridge();
  detachSignals = attachAuthSignals();
});

afterEach(() => {
  detachSignals();
  for (const off of unsubscribes) off();
  removeBridge();
  vi.unstubAllGlobals();
});

/** 订阅一次快照变化流（`useSyncExternalStore` 的裸形态：只记快照引用）。 */
function watchSnapshot(): void {
  const listener = () => snapshots.push(getAuthSnapshot());
  unsubscribes.push(subscribeAuth(listener));
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function stubFetch(...responses: Array<() => Response>): { calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return next ? next() : json(200, { ok: true });
    }),
  );
  return { calls };
}

/* ═════════════════ 判据② ═════════════════ */

describe('判据② signIn：成功即 AndroidBridge.saveToken，无二次登录', () => {
  it('登录成功：token 一次落到桥 + localStorage 双写，返回的那一帧快照已是 signed-in', () => {
    watchSnapshot();
    snapshots.length = 0;

    const outcome = signIn({ token: 'tok-1', phone: '13800000002', nickname: '小文' });

    expect(bridge.saveToken).toHaveBeenCalledTimes(1);
    expect(bridge.saveToken).toHaveBeenCalledWith('tok-1');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-1');
    expect(localStorage.getItem(PHONE_KEY)).toBe('13800000002');
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('小文');
    expect(outcome).toBe('signed-in');
    // "无二次登录"的机器形状：一次动作 = 一次通知 = 一帧 signed-in，不需要再调一次登录
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.status).toBe('signed-in');
    expect(getAuthSnapshot()).toMatchObject({ hasToken: true, phone: '13800000002', nickname: '小文' });
  });

  it('注册与激活（activated:true）共用同一个落点：仍然只调一次 saveToken', () => {
    signIn({ token: 'tok-new', phone: '13800000003', nickname: '', activated: false });
    expect(bridge.saveToken).toHaveBeenCalledTimes(1);
    removeBridge();
    bridge = installBridge(); // 重新计数，测激活那一支
    signIn({ token: 'tok-act', phone: '13800000004', nickname: '老用户', activated: true });
    expect(bridge.saveToken).toHaveBeenCalledTimes(1);
    expect(bridge.saveToken).toHaveBeenCalledWith('tok-act');
    expect(getAuthSnapshot().status).toBe('signed-in');
  });

  it('原生桥缺失时降级：不抛、localStorage 仍写得到，快照照常 signed-in（§5.6①）', () => {
    removeBridge();
    expect(tokenChannel()).toBe('storage');

    expect(signIn({ token: 'tok-no-bridge', phone: '13800000005', nickname: '' })).toBe('signed-in');

    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok-no-bridge');
    expect(getAuthSnapshot().status).toBe('signed-in');
    expect(tokenChannel()).toBe('storage');
  });

  it('upgrade_required + 空 token：绝不签发正常凭据，只落临时 token（R-40④）', () => {
    watchSnapshot();
    snapshots.length = 0;

    const outcome = signIn({
      token: '',
      phone: '13800000006',
      upgrade_required: true,
      upgradeToken: 'tmp-1',
    });

    expect(outcome).toBe('upgrade-required');
    expect(bridge.saveToken).not.toHaveBeenCalled();
    expect(bridge.saveTempToken).toHaveBeenCalledWith('tmp-1');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getAuthSnapshot()).toMatchObject({
      status: 'signed-out',
      hasToken: false,
      upgradeRequired: true,
      upgradeSessionOnly: true,
      phone: '13800000006', // 门禁页的手机号回显（GateLayout 的 header 位）
    });
  });

  it('登录后临时 token 必须作废：两把钥匙不同时存在', () => {
    signIn({ token: '', phone: '13800000007', upgradeToken: 'tmp-2' });
    expect(hasUpgradeToken()).toBe(true);
    bridge.clearTempToken.mockClear();

    signIn({ token: 'tok-2', phone: '13800000007', nickname: '小文' });

    expect(hasUpgradeToken()).toBe(false);
    expect(bridge.clearTempToken).toHaveBeenCalledTimes(1);
    expect(currentUpgradeToken()).toBe('');
  });

  it('改密成功（afterPasswordChanged）：临时凭据清掉，带新 token 就直接进门', () => {
    signIn({ token: '', phone: '13800000008', upgradeToken: 'tmp-3' });
    expect(getAuthSnapshot().upgradeSessionOnly).toBe(true);

    expect(afterPasswordChanged({ token: 'tok-3', phone: '13800000008', nickname: '' })).toBe(
      'signed-in',
    );

    expect(getAuthSnapshot()).toMatchObject({
      status: 'signed-in',
      upgradeRequired: false,
      upgradeSessionOnly: false,
    });
    expect(localStorage.getItem('tm.tempToken')).toBeNull();
  });

  it('单一真值源对账：store 与 rest-fetcher 的 hasCredential() 永远同一结论', () => {
    expect(hasCredential()).toBe(false);
    expect(getAuthSnapshot().hasToken).toBe(false);

    signIn({ token: 'tok-4', phone: '13800000009', nickname: '' });
    expect(hasCredential()).toBe(true);
    expect(getAuthSnapshot().hasToken).toBe(true);

    signOut();
    expect(hasCredential()).toBe(false);
    expect(getAuthSnapshot().hasToken).toBe(false);
  });
});

/* ═════════════════ 判据⑧ ═════════════════ */

describe('判据⑧ 401：单点清凭据并跳登录（动作在 rest-fetcher，store 只跟着对齐）', () => {
  it('handleAuthError 命中 401 → 快照转 signed-out、身份回显清空，且清点只发生一次', () => {
    signIn({ token: 'tok-5', phone: '13800000010', nickname: '小文' });
    watchSnapshot();
    snapshots.length = 0;
    bridge.clearToken.mockClear();

    expect(handleAuthError(401, 'CREDENTIAL_EXPIRED', T0)).toBe(true);

    expect(getAuthSnapshot()).toMatchObject({
      status: 'signed-out',
      hasToken: false,
      phone: '',
      nickname: '',
    });
    // "单点"的计数证据：清 token 只有 rest-fetcher→bridge 那一次，store 没有再清第二次
    expect(bridge.clearToken).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(NICKNAME_KEY)).toBeNull();
    // 跟着变只通知一次（订阅方不多刷一轮）
    expect(snapshots).toHaveLength(1);
  });

  it('跳登录由 rest-fetcher 执行到 /login；store 只提供常量，本身不 import router', () => {
    signIn({ token: 'tok-6', phone: '13800000011', nickname: '' });
    routes.length = 0;

    handleAuthError(401, 'CREDENTIAL_EXPIRED', T0);

    expect(routes).toEqual([LOGIN_ROUTE]);
    expect(LOGIN_ROUTE).toBe('/login');
    expect(UPGRADE_PASSWORD_ROUTE).toBe('/upgrade-password');
  });

  it('走完整请求链路的 401（真走 T-14 的 rest-fetcher）：抛 ApiError + 一次登出 + 一次跳登录', async () => {
    signIn({ token: 'tok-7', phone: '13800000012', nickname: '小文' });
    stubFetch(() => json(401, { error: 'x', code: 'CREDENTIAL_EXPIRED' }));
    watchSnapshot();
    snapshots.length = 0;
    bridge.clearToken.mockClear();

    const error = await apiGet('/api/wordbook', { auth: true }).catch((e: unknown) => e);

    expect((error as { status?: number }).status).toBe(401);
    expect(getAuthSnapshot().status).toBe('signed-out');
    expect(bridge.clearToken).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveLength(1);
    expect(routes).toEqual(['/login']);
  });

  it('三条并发 401 → 只清一次、只通知一次（"单点"的并发面落到 store 上）', async () => {
    signIn({ token: 'tok-8', phone: '13800000013', nickname: '' });
    stubFetch(() => json(401, { error: 'x', code: 'CREDENTIAL_EXPIRED' }));
    watchSnapshot();
    snapshots.length = 0;
    bridge.clearToken.mockClear();

    await Promise.allSettled([
      apiGet('/api/wordbook', { auth: true }),
      apiGet('/api/review/queue', { auth: true }),
      apiGet('/api/profile', { auth: true }),
    ]);

    expect(bridge.clearToken).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveLength(1);
    expect(routes).toEqual(['/login']);
  });

  it('403 PASSWORD_UPGRADE_REQUIRED → 凭据保留、upgradeRequired 置位、目标是改密页', () => {
    signIn({ token: 'tok-9', phone: '13800000014', nickname: '小文' });
    bridge.clearToken.mockClear();

    expect(handleAuthError(403, 'PASSWORD_UPGRADE_REQUIRED', T0)).toBe(true);

    expect(bridge.clearToken).not.toHaveBeenCalled();
    expect(getAuthSnapshot()).toMatchObject({
      status: 'signed-in',
      hasToken: true,
      upgradeRequired: true,
      upgradeSessionOnly: false, // 已进门、待改密（软告知位），不是"只有临时凭据"
    });
    expect(routes).toEqual(['/upgrade-password']);
  });

  it('主动退出登录：token/手机号/昵称/临时 token 一次清干净，并回跳转目标常量', () => {
    signIn({ token: 'tok-10', phone: '13800000015', nickname: '小文' });
    signIn({ token: '', phone: '13800000015', upgradeToken: 'tmp-4' });
    rememberPendingAction({ kind: 'favorite', word: 'apple' });
    bridge.clearToken.mockClear();

    const target = signOut();

    expect(target).toBe(LOGIN_ROUTE);
    expect(bridge.clearToken).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(PHONE_KEY)).toBeNull();
    expect(localStorage.getItem(NICKNAME_KEY)).toBeNull();
    expect(localStorage.getItem('tm.tempToken')).toBeNull();
    expect(getAuthSnapshot()).toMatchObject({
      status: 'signed-out',
      phone: '',
      nickname: '',
      upgradeRequired: false,
      pendingAction: null,
    });
  });

  it('未接线时也不会失同步：refreshFromStorage() 手动对齐即可（同源读点）', () => {
    detachSignals(); // 模拟"入口还没接线"的窗口
    localStorage.setItem(TOKEN_KEY, 'tok-cold');
    localStorage.setItem(PHONE_KEY, '13800000016');

    expect(refreshFromStorage()).toMatchObject({ status: 'signed-in', phone: '13800000016' });
    expect(hasCredential()).toBe(true);
    detachSignals = attachAuthSignals();
  });

  it('对齐 Java 的 SharedPreferences → localStorage 回灌（§5.6 第 2 行的时序）', () => {
    // 首帧时桥里已有 token（Java 在 onPageFinished 里才回灌进 tm.token）
    localStorage.setItem(TOKEN_KEY, 'tok-reflow');
    localStorage.setItem(NICKNAME_KEY, '小文');
    expect(getAuthSnapshot().status).toBe('signed-out');

    expect(refreshFromStorage()).toMatchObject({
      status: 'signed-in',
      nickname: '小文',
      hasToken: true,
    });
  });
});

/* ═════════════════ 无 token 不发业务请求 ═════════════════ */

describe('无 token 时不得发任何业务请求', () => {
  it('未登录：gate 判否 + 目标是 /login，runWhenSignedIn 一次都不执行任务体', () => {
    expect(businessRequestGate()).toEqual({ allowed: false, target: LOGIN_ROUTE });
    const task = vi.fn(() => 'should-not-run');

    expect(runWhenSignedIn(task)).toEqual({ ok: false, target: LOGIN_ROUTE });
    expect(task).not.toHaveBeenCalled();
  });

  it('只有临时凭据（强制改密门禁）：目标是 /upgrade-password，不是 /login', () => {
    signIn({ token: '', phone: '13800000017', upgradeToken: 'tmp-5' });

    expect(businessRequestGate()).toEqual({ allowed: false, target: UPGRADE_PASSWORD_ROUTE });
    expect(runWhenSignedIn(() => 1)).toEqual({ ok: false, target: UPGRADE_PASSWORD_ROUTE });
  });

  it('登录后放行、退出后再判否（同一把尺子，不是两套判定）', () => {
    signIn({ token: 'tok-11', phone: '13800000018', nickname: '' });
    expect(businessRequestGate()).toEqual({ allowed: true, target: null });
    expect(runWhenSignedIn(() => 'ok')).toEqual({ ok: true, value: 'ok' });

    signOut();
    expect(businessRequestGate()).toEqual({ allowed: false, target: LOGIN_ROUTE });
  });
});

/* ═════════════════ 订阅面（与 host.tsx / startup.ts 的 store 同形） ═════════════════ */

describe('快照与订阅形状', () => {
  it('getAuthSnapshot 稳定引用：不变时两次全等，变时是新引用（useSyncExternalStore 的前提）', () => {
    const before = getAuthSnapshot();
    expect(getAuthSnapshot()).toBe(before);

    signIn({ token: 'tok-12', phone: '13800000019', nickname: '小文' });
    expect(getAuthSnapshot()).not.toBe(before);
  });

  it('解绑后不再收到通知；某个订阅方抛错不反噬其他订阅方', () => {
    const good = vi.fn();
    const offGood = subscribeAuth(good);
    const offThrower = subscribeAuth(() => {
      throw new Error('订阅方自己炸');
    });

    signIn({ token: 'tok-13', phone: '13800000020', nickname: '' });
    expect(good).toHaveBeenCalledTimes(1);

    offThrower();
    offGood();
    signIn({ token: 'tok-14', phone: '13800000021', nickname: '' });
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('待续作动作：签到不冲掉它，取出即清，退出登录一并作废（R-16② / R-39⑧）', () => {
    rememberPendingAction({ kind: 'favorite', word: 'apple' });
    expect(peekPendingAction()).toEqual({ kind: 'favorite', word: 'apple' });

    signIn({ token: 'tok-15', phone: '13800000022', nickname: '' });
    expect(peekPendingAction()).toEqual({ kind: 'favorite', word: 'apple' });

    expect(takePendingAction()).toEqual({ kind: 'favorite', word: 'apple' });
    expect(peekPendingAction()).toBeNull();

    rememberPendingAction({ kind: 'open', path: '/word/apple' });
    signOut();
    expect(peekPendingAction()).toBeNull();
  });

  it('notePasswordUpgradeRequired 只动告知位，不碰任何凭据', () => {
    signIn({ token: 'tok-16', phone: '13800000023', nickname: '小文' });
    bridge.clearToken.mockClear();

    notePasswordUpgradeRequired();

    expect(getAuthSnapshot()).toMatchObject({ status: 'signed-in', upgradeRequired: true });
    expect(hasStoredToken()).toBe(true);
    expect(bridge.clearToken).not.toHaveBeenCalled();
    expect(readStoredIdentity().phone).toBe('13800000023');
  });
});

/* ═════════════════ 源码级红线（与 screens/* 各 spec 的 codeOnly 哨兵同套路） ═════════════════ */

function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

const SOURCES = ['../src/lib/auth-store.ts', '../src/lib/token-bridge.ts'].map((p) => {
  const raw = readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  return { path: p, raw, code: codeOnly(raw) };
});

describe('红线机检：地基件不得长成第二份 401 处理、不得引路由、不得越 Chrome84 底线', () => {
  it('两个新文件都不 import router / 不发 fetch / 不判 HTTP 状态码与认证错误码', () => {
    for (const src of SOURCES) {
      expect(src.code, `${src.path} 不得 import 路由`).not.toMatch(/from\s*'\.\.\/router\.js'/);
      expect(src.code, `${src.path} 不得自己发请求`).not.toMatch(/\bfetch\s*\(/);
      expect(src.code, `${src.path} 不得复制 401/403 判定`).not.toMatch(/===\s*40[13]\b/);
      expect(src.code, `${src.path} 不得复制错误码分支`).not.toMatch(
        /CREDENTIAL_EXPIRED|PASSWORD_UPGRADE_REQUIRED|handleAuthError\s*\(/,
      );
    }
  });

  it('auth-store 只从 rest-fetcher 引 onAuthSignal 一个符号（接线面收窄到订阅）', () => {
    const raw = SOURCES[0]?.raw ?? '';
    const spec = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/data\/rest-fetcher\.js'/.exec(raw);
    expect(spec, 'auth-store 必须经 onAuthSignal 接 rest-fetcher 的广播').not.toBeNull();
    const names = (spec?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(names).toEqual(['onAuthSignal']);
  });

  it('两个新文件都不用禁不掉就白屏的四个 API（structuredClone / Object.hasOwn / .at / requestIdleCallback）', () => {
    for (const src of SOURCES) {
      expect(src.code, `${src.path} 命中 structuredClone`).not.toMatch(/structuredClone\s*\(/);
      expect(src.code, `${src.path} 命中 Object.hasOwn`).not.toMatch(/Object\s*\.\s*hasOwn\s*\(/);
      expect(src.code, `${src.path} 命中 requestIdleCallback`).not.toMatch(/requestIdleCallback/);
      expect(src.code, `${src.path} 命中 .at(`).not.toMatch(/\.at\s*\(/);
    }
  });

  it('判据⑧ 的"走 T-14 的 rest-fetcher"是订阅不是改写：本 spec 只调它已导出的面', () => {
    // 若有人把 401 处理搬进 lib，这三条导出会失去调用点，用例会红
    expect(typeof handleAuthError).toBe('function');
    expect(typeof resetAuthHandling).toBe('function');
    expect(typeof onAuthSignal).toBe('function');
  });
});
