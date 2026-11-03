/**
 * T-19c 判据自证（App 强制改密全屏 `#/upgrade-password`）—— `apps/app/test/upgrade-screen.spec.tsx`。
 *
 * 宿主形态照 `login-screen.spec.tsx`：`QueryClientProvider` + `UiHostProvider` 直接渲染，
 * 但**外面套真实的 `shell/GateLayout`**（判据③"无 tab"必须是壳的判定，不是本屏自称），
 * 屏未挂 `router.tsx` 也不影响测：A-44 #86 规定挂载由 TPM 串行收口，本文件只
 * `installRouterGlobals()` + 直接喂路由 store（`resetRouterForTest` / `commitLocation`），
 * **不启动 `startRouter()`**（不绑 hashchange，`host.navigate` 用 spy 采集）。
 * 网络只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），R-40④ 的一次性凭据一律经
 * `auth-store.signIn()` 播种（唯一写点，屏与用例都不抄第二份落法）。
 *
 * 全文件用 fake timers：`settle()` 靠 `advanceTimersByTimeAsync` 推微任务 + 宏任务，
 * 而 D 组的"常驻 6 秒（`TOAST_LONG_MS`）后才回原页"必须能确定性推进。
 *
 * 分组（与交付报告的映射表一一对应）：
 *  - A 组：源码哨兵（复用共用件、0 新串、token 落地单点未被本屏扩面、0 状态码分支、
 *    Chrome84 四禁 + §5.1 新特性禁用、端点唯一份、禁词静态面）；
 *  - B 组：判据③ 前半 —— 全屏 + 无 tab + 出口恰两颗 + 两颗串取自 `AUTH_COPY.forceUpgrade.*`；
 *  - C 组：表单不完整 ⇒ 一个请求都不发（§3.9.5 不静默）；
 *  - D 组：R-40④ 成功链 —— 一次性 upgrade token 换正常 30 天 token + 6 秒信息条 + 回原页；
 *  - E 组：失败面（服务端原因优先 / TEMP_LOCKED 只禁提交 / 无码不静默 / 401 走单点）；
 *  - F 组：唯一副出口 `退出登录`；
 *  - G 组：判据③ 后半 —— 物理返回被拦（`blockedBackSignal` 自增 + 不发生路由后退），与 T-20 的
 *    `__router.canGoBack()` / `window.onAndroidBack` 协同，且钩子装卸不踩别人；
 *  - H 组：R-40④ 反向哨（跳过出口 0 处 + §3.9.4/§8.3-D 禁词 0 命中 + 「至少 8 位」唯一豁免口径）；
 *  - I 组：谁都不该在这一页（游客 / 已进门）与 `data/queries/auth.ts` 的强制改密工厂。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider, type UiHost } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ARIA,
  AUTH_COPY,
  NOTICE_FORCE_UPGRADE,
  PLAIN_TERMS,
  TM_ERRORS,
  TOAST_LONG_MS,
  NAV_ITEMS,
  type AuthResultDto,
} from '@tm/shared';
import UpgradePasswordScreen from '../src/screens/UpgradePasswordScreen.js';
import { GateLayout } from '../src/shell/GateLayout.js';
import { forceUpgradeMutationOptions } from '../src/data/queries/auth.js';
import { resetAuthHandling } from '../src/data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  getAuthSnapshot,
  refreshFromStorage,
  rememberPendingAction,
  signIn,
} from '../src/lib/auth-store.js';
import {
  SESSION_KEYS,
  currentToken,
  currentUpgradeToken,
  hasUpgradeToken,
} from '../src/lib/token-bridge.js';
import { commitLocation, installRouterGlobals, getPath, resetRouterForTest, routeFor } from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

const PHONE = '13800000001';
const UPGRADE_TOKEN = 'up-token-19c';
const NEW_TOKEN = 'tk-normal-after-19c';
const OLD_PWD = 'old9chars';
const NEW_PWD = 'Passw0rd!';

const UPGRADED: AuthResultDto = {
  token: NEW_TOKEN,
  phone: PHONE,
  hasPassword: true,
  nickname: 'tm',
  avatar: '',
};

interface EndpointResponse {
  status: number;
  body: unknown;
  down?: boolean;
}

let responses: Record<'force', EndpointResponse> = { force: { status: 200, body: UPGRADED } };
let holdForce = false;
let holders: Array<(value: Response) => void> = [];

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

let fetchCalls: FetchCall[] = [];
let navigateCalls: string[] = [];
let toastCalls: string[] = [];
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mounted = false;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    fetchCalls.push({
      url,
      method: String(init?.method ?? 'GET'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: headers.Authorization ?? null,
    });
    if (!url.includes('/api/password/force')) return jsonResponse(404, { error: 'not found' });
    if (holdForce) {
      return new Promise<Response>((resolve) => {
        holders.push(resolve);
      });
    }
    const response = responses.force;
    if (response.down) throw new TypeError('network down');
    return jsonResponse(response.status, response.body);
  });
  vi.stubGlobal('fetch', fn);
}

function releaseHolders(): void {
  const pendingHolders = holders;
  holders = [];
  for (const resolve of pendingHolders) resolve(jsonResponse(200, UPGRADED));
}

const host: UiHost = {
  kv: {
    get: (key: string) => localStorage.getItem(key),
    set: (key: string, value: string) => localStorage.setItem(key, value),
  },
  speak: () => {},
  navigate: (to: string) => {
    navigateCalls.push(to);
  },
  toast: (message: string) => {
    toastCalls.push(message);
  },
};

/** 真实壳（`main.tsx:61` 对 `kind === 'gate'` 走的就是它）：判据③ 的"无 tab"发生在这一层。 */
function mountScreen(): void {
  resetRouterForTest(UPGRADE_PASSWORD_ROUTE);
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={host}>
          <GateLayout>
            <UpgradePasswordScreen />
          </GateLayout>
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
  }
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container.remove();
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

function all<T extends Element>(selector: string): T[] {
  return Array.from(container.querySelectorAll<T>(selector));
}

function byTestId<T extends HTMLElement>(testid: string): T | null {
  return q<T>(`[data-testid=${testid}]`);
}

function form(): HTMLElement {
  return byTestId<HTMLElement>('force-upgrade')!;
}

function oldInput(): HTMLInputElement {
  return q<HTMLInputElement>('[data-auth-control=old-password]')!;
}

function newInput(): HTMLInputElement {
  return q<HTMLInputElement>('[data-auth-control=new-password]')!;
}

function confirmInput(): HTMLInputElement {
  return q<HTMLInputElement>('[data-auth-control=confirm-password]')!;
}

async function fill(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function submitForm(): Promise<void> {
  const formEl = q<HTMLFormElement>('form[data-testid=force-change-password]');
  expect(formEl).not.toBeNull();
  await act(async () => {
    formEl!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await settle();
}

async function fillAllThree(): Promise<void> {
  await fill(oldInput(), OLD_PWD);
  await fill(newInput(), NEW_PWD);
  await fill(confirmInput(), NEW_PWD);
}

function alerts(): string[] {
  return all('[role=alert]').map((el) => String(el.textContent ?? '').trim());
}

/** 可交互"动作"（排除字段上的显示/隐藏密码小眼睛，§3.1.1 的计数口径）。 */
function actionButtons(): HTMLButtonElement[] {
  return all('button:not([data-auth-affordance])');
}

/** 渲染树上的可见文本（读屏面与禁词面都用它，不看 class）。 */
function visibleTexts(scope: Element = container): string[] {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.nodeValue ?? '').trim();
    if (text) texts.push(text);
    node = walker.nextNode();
  }
  return texts;
}

/* 源码哨兵：先剥注释再扫（源文件头大量"不写 xxx / 不许 xxx"的注释会提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screenCode = (): string => stripComments(readSrc('../src/screens/UpgradePasswordScreen.tsx'));
const queriesCode = (): string => stripComments(readSrc('../src/data/queries/auth.ts'));

/** 播种 R-40④ 会话：只有一把一次性钥匙（`auth-store` 的唯一写点，本文件不碰存储 API）。 */
function seedUpgradeSession(): void {
  signIn({ token: '', phone: PHONE, upgradeToken: UPGRADE_TOKEN });
}

function seedNormalSession(token = 'tk-already-normal'): void {
  signIn({ token, phone: PHONE });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchCalls = [];
  navigateCalls = [];
  toastCalls = [];
  holders = [];
  holdForce = false;
  responses = { force: { status: 200, body: UPGRADED } };
  localStorage.clear();
  refreshFromStorage();
  resetAuthHandling();
  // `main.tsx` 启动链的第 1 步：装冻结入口（本屏只**装饰**它装好的 `window.onAndroidBack`）
  installRouterGlobals();
  stubFetch();
});

afterEach(() => {
  releaseHolders();
  unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ═════════════════ A 组 · 源码哨兵 ═════════════════ */

describe('A 组 · 源码哨兵（复用共用件 / 0 新串 / 落地单点 / Chrome84）', () => {
  it('A-01 判据①：屏内不自己画表单——0 个 <input / <button / <form / <label', () => {
    const code = screenCode();
    for (const tag of ['<input', '<button', '<form', '<label', '<textarea']) {
      expect(code, `屏内出现自写控件 ${tag}`).not.toContain(tag);
    }
    expect(code).toContain('ForcePasswordUpgradeForm');
  });

  it('A-02 文案单一源：屏与查询层剥注释后 CJK 字面量 0 命中（0 新增用户可见中文）', () => {
    for (const [name, code] of [
      ['UpgradePasswordScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
    ] as const) {
      const withoutStrings = code.replace(/'(?:[^'\\]|\\.)*'/g, '').replace(/"(?:[^"\\]|\\.)*"/g, '');
      expect(withoutStrings.match(/[一-龥]/g) ?? [], `${name} 含中文字面量`).toEqual([]);
    }
  });

  it('A-03 token 落地单点未被本屏扩面：屏内 0 命中存储 API 与凭据写函数', () => {
    const code = screenCode();
    for (const banned of [
      'localStorage',
      'AndroidBridge',
      'native/bridge',
      'writeToken',
      'writeTempToken',
      'saveToken',
      'saveSessionToken',
      'saveUpgradeToken',
      'clearUpgradeToken',
      'clearStoredSession',
      'clearCredential',
      'kvSet',
      'signIn(',
    ]) {
      expect(code, `屏内命中凭据写面 ${banned}`).not.toContain(banned);
    }
    // 一次性凭据只**读**、且只问 token-bridge 那一个问法；换钥匙只经 auth-store 的唯一出口。
    expect(code).toContain('currentUpgradeToken()');
    expect(code.match(/afterPasswordChanged\(/g)?.length).toBe(1);
    expect(code.match(/signOut\(\)/g)?.length).toBe(1);
  });

  it('A-04 屏内不成第二份状态码处理：0 命中状态码判定 / handleAuthError / fetch / apiPost', () => {
    const code = screenCode();
    for (const banned of ['=== 401', '=== 403', '== 401', 'status ===', 'handleAuthError(', 'fetch(', 'apiPost(', 'PASSWORD_UPGRADE_REQUIRED']) {
      expect(code, `屏内命中 ${banned}`).not.toContain(banned);
    }
    expect(code).toContain('forceUpgradeMutationOptions');
  });

  it('A-05 Chrome84 / §5.1 红线：屏与查询层 0 命中新特性与四禁', () => {
    for (const [name, code] of [
      ['UpgradePasswordScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
      ['rest-fetcher.ts', stripComments(readSrc('../src/data/rest-fetcher.ts'))],
    ] as const) {
      for (const banned of [
        'structuredClone',
        'Object.hasOwn',
        '.at(',
        'requestIdleCallback',
        ':has(',
        '@container',
        'text-wrap',
        '||=',
        '&&=',
        '??=',
      ]) {
        expect(code, `${name} 命中 ${banned}`).not.toContain(banned);
      }
      expect(code, `${name} 有顶层 await`).not.toMatch(/^await\s/m);
    }
  });

  it('A-06 强制改密端点唯一份：App 侧 /api/password/force 只在 data/queries/auth.ts 出现一次', () => {
    expect(queriesCode().match(/\/api\/password\/force/g)?.length).toBe(1);
    expect(screenCode()).not.toContain('/api/password/force');
    // 退出登录 = 本机会话语义（A-32-4，与 Web 同形态）：本屏不发 /api/logout。
    expect(screenCode()).not.toContain('/api/logout');
  });

  it('A-07 禁词的静态面：屏与查询层剥注释后 0 命中跳过出口与 §6.6 词', () => {
    for (const [name, code] of [
      ['UpgradePasswordScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
    ] as const) {
      for (const banned of ['以后再说', '稍后再改', '下次提醒', '宽限期', '已为您延至', '倒计时', 'passwordUpgradeDeadline']) {
        expect(code, `${name} 命中 ${banned}`).not.toContain(banned);
      }
    }
  });

  it('A-08 单点计数：auth-store 的清凭据仍恰一处，屏未新增第二套清法', () => {
    const store = stripComments(readSrc('../src/lib/auth-store.ts'));
    expect(store.match(/clearStoredSession\(\)/g)?.length).toBe(1);
    const bridge = stripComments(readSrc('../src/native/bridge.ts'));
    expect(bridge.match(/function clearCredential/g)?.length).toBe(1);
    // 本屏既不清正常凭据、也不清临时凭据：两条出口都只调 auth-store 的那一个函数
    expect(screenCode().match(/signOut\(\)/g)?.length).toBe(1);
  });
});

/* ═════════════════ B 组 · 全屏 + 无 tab + 恰两颗出口 ═════════════════ */

describe('B 组 · 判据③ 前半：全屏、无底 tab、恰两个出口，两颗串取自 shared', () => {
  it('B-01 一次性 token 会话进入：路由判定为 gate ⇒ 壳是 GateLayout，tab 栏 0 命中', () => {
    seedUpgradeSession();
    expect(routeFor(UPGRADE_PASSWORD_ROUTE).kind).toBe('gate');
    mountScreen();
    expect(byTestId('tab-shell')).toBeNull();
    expect(byTestId('tab-bar')).toBeNull();
    expect(all('[data-tab]').length).toBe(0);
    expect(byTestId('gate-layout')?.getAttribute('data-locked')).toBe('1');
    // 全屏：壳自带 min-h-dvh 的整屏容器，页面本体在其中
    expect(byTestId('gate-layout')?.className).toContain('min-h-dvh');
    expect(form()).not.toBeNull();
    expect(form().getAttribute('data-auth-hard-gate')).toBe('true');
  });

  it('B-02 读屏与视觉都不出现五个 tab：整棵树 0 个 tab 标签、0 个导航按钮', () => {
    seedUpgradeSession();
    mountScreen();
    const texts = visibleTexts();
    const buttonLabels = actionButtons().map((el) => String(el.textContent ?? '').trim());
    for (const item of NAV_ITEMS) {
      expect(texts).not.toContain(item.tab);
      expect(buttonLabels).not.toContain(item.tab);
    }
    expect(all('nav').length).toBe(0);
  });

  it('B-03 出口恰两颗且顺序 = 主按钮 → 退出登录（§3.9.4 / §8.3-D 第 13 项）', () => {
    seedUpgradeSession();
    mountScreen();
    const buttons = actionButtons();
    expect(buttons.map((el) => String(el.textContent ?? '').trim())).toEqual([
      AUTH_COPY.forceUpgrade.submit,
      AUTH_COPY.forceUpgrade.secondary,
    ]);
    expect(all('[data-auth-secondary]').length).toBe(1);
    expect(q('[data-auth-secondary=sign-out]')).not.toBeNull();
    // 无返回箭头 / 无关闭 X / 无任何"离开本页"的第三颗
    expect(q(`[aria-label="${ARIA.back}"]`)).toBeNull();
    expect(all('[data-dismiss]').length).toBe(0);
    expect(all('a[href]').length).toBe(0);
  });

  it('B-04 四句串逐字等于 AUTH_COPY.forceUpgrade.*（本屏一个字都不自造）', () => {
    seedUpgradeSession();
    mountScreen();
    const texts = visibleTexts(form() ?? undefined);
    expect(texts).toContain(AUTH_COPY.forceUpgrade.title);
    expect(texts).toContain(AUTH_COPY.forceUpgrade.subtitle);
    expect(texts).toContain(AUTH_COPY.forceUpgrade.submit);
    expect(texts).toContain(AUTH_COPY.forceUpgrade.secondary);
    expect(byTestId('force-notice')?.textContent?.trim()).toBe(NOTICE_FORCE_UPGRADE);
    expect(byTestId('force-notice')?.textContent?.trim()).toBe(AUTH_COPY.forceUpgrade.notice);
  });

  it('B-05 §3.9.4：进入本页焦点即落在「当前密码」', () => {
    seedUpgradeSession();
    mountScreen();
    expect(document.activeElement).toBe(oldInput());
  });
});

/* ═════════════════ C 组 · 不完整不发请求 ═════════════════ */

describe('C 组 · 点主按钮但表单不完整 ⇒ 一个请求都不发，且不静默', () => {
  it('C-01 空表单：0 请求、0 跳转、当前密码格给可读原因、焦点回该格', async () => {
    seedUpgradeSession();
    mountScreen();
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(navigateCalls).toHaveLength(0);
    expect(alerts()).toContain(TM_ERRORS.OLD_PASSWORD_REQUIRED.copy);
    expect(document.activeElement).toBe(oldInput());
  });

  it('C-02 新密码不足 8 位：0 请求 + 新密码格下给 WEAK_PASSWORD（建密码面合法）', async () => {
    seedUpgradeSession();
    mountScreen();
    await fill(oldInput(), OLD_PWD);
    await fill(newInput(), 'abc1234');
    await fill(confirmInput(), 'abc1234');
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(alerts()).toContain(TM_ERRORS.WEAK_PASSWORD.copy);
  });

  it('C-03 两次输入不一致：0 请求 + 确认格下给 PASSWORD_MISMATCH', async () => {
    seedUpgradeSession();
    mountScreen();
    await fill(oldInput(), OLD_PWD);
    await fill(newInput(), NEW_PWD);
    await fill(confirmInput(), `${NEW_PWD}x`);
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(alerts()).toContain(TM_ERRORS.PASSWORD_MISMATCH.copy);
  });

  it('C-04 pending 期间重复提交只打一次请求（防半途换两把钥匙）', async () => {
    seedUpgradeSession();
    holdForce = true;
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    await submitForm();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(q<HTMLFormElement>('form[data-testid=force-change-password]')?.getAttribute('aria-busy')).toBe('true');
    releaseHolders();
    await settle();
    expect(fetchCalls).toHaveLength(1);
  });
});

/* ═════════════════ D 组 · R-40④ 成功链 ═════════════════ */

describe('D 组 · 成功链：一次性 upgrade token 换正常 30 天 token 并回原页', () => {
  it('D-01 请求带的是 upgrade token，且发出去之前正常 token 仍为空（R-40④ 两形态都不写正常 token）', async () => {
    seedUpgradeSession();
    mountScreen();
    // 进门前后：一次性会话里正常 token 一直是空（屏没有偷写正常 token）
    expect(currentToken()).toBe('');
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toContain('/api/password/force');
    expect(fetchCalls[0]!.method).toBe('POST');
    expect(fetchCalls[0]!.authorization).toBe(`Bearer ${UPGRADE_TOKEN}`);
  });

  it('D-02 成功后：临时凭据作废、正常 token 到手、6 秒信息条由宿主挂上且 6 秒内不跳', async () => {
    seedUpgradeSession();
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(getAuthSnapshot().status).toBe('signed-in');
    expect(hasUpgradeToken()).toBe(false);
    expect(currentUpgradeToken()).toBe('');
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NEW_TOKEN);
    expect(localStorage.getItem('tm.tempToken')).toBeNull();
    // 常驻 6 秒（TOAST_LONG_MS 唯一值在 shared）：信息条在 result 槽，串取自 shared；此刻还没走
    expect(byTestId('upgrade-result-notice')?.textContent?.trim()).toBe(
      AUTH_COPY.changePassword.success.reloginNotice,
    );
    expect(toastCalls).toEqual([AUTH_COPY.changePassword.success.toast]);
    expect(navigateCalls).toHaveLength(0);
    expect(form()).not.toBeNull();
  });

  it('D-03 到 TOAST_LONG_MS 才回"用户第 1 步想去的那页"（pendingAction 的 open 路径）', async () => {
    seedUpgradeSession();
    rememberPendingAction({ kind: 'open', path: '/word/apple' });
    mountScreen();
    await fillAllThree();
    await submitForm();
    await advance(TOAST_LONG_MS - 100);
    expect(navigateCalls).toHaveLength(0);
    await advance(200);
    expect(navigateCalls).toEqual(['/word/apple']);
  });

  it('D-04 无待续作动作时回首页；favorite 型 pendingAction 不被当作路径', async () => {
    seedUpgradeSession();
    rememberPendingAction({ kind: 'favorite', word: 'apple' });
    mountScreen();
    await fillAllThree();
    await submitForm();
    await advance(TOAST_LONG_MS + 100);
    expect(navigateCalls).toEqual(['/']);
  });

  it('D-05 成功前 result 槽不渲染（不给"你已经改好了"的假告知）', async () => {
    seedUpgradeSession();
    mountScreen();
    expect(byTestId('upgrade-result-notice')).toBeNull();
    await fillAllThree();
    await submitForm();
    expect(byTestId('upgrade-result-notice')).not.toBeNull();
  });
});

/* ═════════════════ E 组 · 失败面不得静默 ═════════════════ */

describe('E 组 · 失败面：服务端原因优先、不静默、屏内不写第二份状态码处理', () => {
  it('E-01 400 OLD_PASSWORD_INCORRECT ⇒ 当前密码格下显示服务端原因，凭据不动、不跳页', async () => {
    seedUpgradeSession();
    responses = { force: { status: 400, body: { error: TM_ERRORS.OLD_PASSWORD_INCORRECT.copy, code: 'OLD_PASSWORD_INCORRECT' } } };
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(alerts()).toContain(TM_ERRORS.OLD_PASSWORD_INCORRECT.copy);
    expect(navigateCalls).toHaveLength(0);
    expect(hasUpgradeToken()).toBe(true);
    expect(currentToken()).toBe('');
  });

  it('E-02 TEMP_LOCKED ⇒ 只禁提交、显示定稿句、本页不出现倒计时（§3.9.4 末段）', async () => {
    seedUpgradeSession();
    responses = { force: { status: 429, body: { error: TM_ERRORS.TEMP_LOCKED.copy, code: 'TEMP_LOCKED' } } };
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(byTestId('password-form-error')?.textContent?.trim()).toBe(TM_ERRORS.TEMP_LOCKED.copy);
    const submit = byTestId<HTMLButtonElement>('password-submit');
    expect(submit?.disabled).toBe(true);
    expect(q('[data-testid*=countdown]')).toBeNull();
    expect(visibleTexts().some((text) => text.includes('倒计时'))).toBe(false);
  });

  it('E-03 网络断（契约外、无码）⇒ 有可见人话且不静默，仍没有第三出口', async () => {
    seedUpgradeSession();
    responses = { force: { status: 0, body: null, down: true } };
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(alerts().length).toBeGreaterThan(0);
    expect(alerts()).toContain(PLAIN_TERMS.connectionDown);
    expect(actionButtons().length).toBe(2);
  });

  it('E-04 401 CREDENTIAL_EXPIRED ⇒ 走 rest-fetcher 的单点（清凭据 + 去登录），屏内没有第二份处理', async () => {
    seedUpgradeSession();
    responses = {
      force: {
        status: 401,
        body: { error: TM_ERRORS.CREDENTIAL_EXPIRED.copy, code: 'CREDENTIAL_EXPIRED' },
      },
    };
    const before = window.location.hash;
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(hasUpgradeToken()).toBe(false);
    expect(getAuthSnapshot().status).toBe('signed-out');
    expect(window.location.hash).not.toBe(before);
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
    expect(navigateCalls).toHaveLength(0);
  });
});

/* ═════════════════ F 组 · 唯一副出口 ═════════════════ */

describe('F 组 · 退出登录 = 唯一副出口', () => {
  it('F-01 恰一处；点击后两把钥匙一起清、只跳一次登录、不发任何请求', async () => {
    seedUpgradeSession();
    mountScreen();
    const signOutButton = q<HTMLElement>('[data-auth-secondary=sign-out]');
    expect(signOutButton?.textContent?.trim()).toBe(AUTH_COPY.forceUpgrade.secondary);
    await click(signOutButton!);
    expect(fetchCalls).toHaveLength(0);
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(localStorage.getItem(SESSION_KEYS.phone)).toBeNull();
    expect(hasUpgradeToken()).toBe(false);
    expect(getAuthSnapshot()).toMatchObject({ status: 'signed-out', upgradeRequired: false, phone: '' });
  });

  it('F-02 pending 期间两颗出口同时禁用（不许半途换钥匙或半途退出）', async () => {
    seedUpgradeSession();
    holdForce = true;
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(byTestId<HTMLButtonElement>('password-submit')?.disabled).toBe(true);
    expect(q<HTMLElement>('[data-auth-secondary=sign-out]')?.getAttribute('disabled')).not.toBeNull();
    expect(navigateCalls).toHaveLength(0);
    releaseHolders();
    await settle();
  });
});

/* ═════════════════ G 组 · 物理返回不退出（与 T-20 协同） ═════════════════ */

describe('G 组 · 判据③ 后半：物理返回被拦下（blockedBackSignal 自增 + 不后退）', () => {
  /**
   * 栈里确实"有历史可退"，才证明 `stay` 是门禁给的、而不是"没处可退"的假象。
   * `mountScreen()` 自带 `installRouterGlobals()` + 单层栈，故本函数**只在挂载之后**调。
   */
  function pushUpgradeOnStack(): void {
    resetRouterForTest('/word/apple');
    commitLocation(UPGRADE_PASSWORD_ROUTE, false);
  }

  it('G-01 canGoBack() 为 true 时返回键仍被判 stay：不后退、不卸载、shake 一次、焦点回首个字段', async () => {
    seedUpgradeSession();
    mountScreen();
    pushUpgradeOnStack();
    expect(window.__router?.canGoBack()).toBe(true);
    expect(form().getAttribute('data-nudge')).toBe('false');
    const hashBefore = window.location.hash;
    let action = '';
    act(() => {
      action = window.onAndroidBack!();
    });
    expect(action).toBe('stay');
    expect(action).not.toContain('exit');
    expect(window.__router?.canGoBack()).toBe(true);
    expect(getPath()).toBe(UPGRADE_PASSWORD_ROUTE);
    expect(window.location.hash).toBe(hashBefore);
    expect(navigateCalls).toHaveLength(0);
    expect(form()).not.toBeNull();
    expect(form().getAttribute('data-nudge')).toBe('true');
    expect(document.activeElement).toBe(oldInput());
  });

  it('G-02 连按两次仍不退出、页不卸载（R-40④ 不可关闭）', () => {
    seedUpgradeSession();
    mountScreen();
    pushUpgradeOnStack();
    let first = '';
    let second = '';
    act(() => {
      first = window.onAndroidBack!();
    });
    act(() => {
      second = window.onAndroidBack!();
    });
    expect([first, second]).toEqual(['stay', 'stay']);
    expect(form()).not.toBeNull();
    expect(byTestId('force-change-password')).not.toBeNull();
    expect(getPath()).toBe(UPGRADE_PASSWORD_ROUTE);
    expect(navigateCalls).toHaveLength(0);
  });

  it('G-03 卸载时把自己的那一层摘掉，还原挂载前的钩子（不永久占有 T-20 的冻结入口）', () => {
    seedUpgradeSession();
    installRouterGlobals();
    const before = window.onAndroidBack;
    expect(typeof before).toBe('function');
    resetRouterForTest(UPGRADE_PASSWORD_ROUTE);
    mountScreen();
    expect(window.onAndroidBack).not.toBe(before);
    unmount();
    expect(window.onAndroidBack).toBe(before);
  });

  it('G-04 期间若别人（BackKeyBridge）换过钩子，本屏卸载不把自己的还原盖上去', () => {
    seedUpgradeSession();
    installRouterGlobals();
    resetRouterForTest(UPGRADE_PASSWORD_ROUTE);
    mountScreen();
    const replaced = (): string => 'confirm-exit';
    window.onAndroidBack = replaced;
    unmount();
    expect(window.onAndroidBack).toBe(replaced);
  });

  it('G-05 对照：同一个钩子在非 gate 路径上判 go-back ⇒ stay 是本页专属，不是钩子坏了', () => {
    installRouterGlobals();
    resetRouterForTest('/word/apple');
    commitLocation('/study', false);
    expect(window.onAndroidBack!()).toBe('go-back');
    expect(getPath()).toBe('/study');
  });
});

/* ═════════════════ H 组 · R-40④ 反向哨 ═════════════════ */

describe('H 组 · 反向哨：没有"以后再说"，也没有任何 §8.3-D / §6.6 禁词', () => {
  /** §3.9.4 末段"全站 0 处" + PRD §8.3-D 第 20 项 + §6.6 词族 + R-40⑩ 的旧 APK 提示句。 */
  const BANNED = [
    '以后再说', '稍后再改', '下次提醒', '已为您延至', '宽限期', 'passwordUpgradeDeadline', '14 天',
    '重新注册', '换手机号', '联系管理员', '未设置密码，请用验证码登录', '忘记密码', '找回密码',
    '本期无法找回', '请用其他手机号注册', '旧进度无法迁移',
    '云端', '本地', '已连接', '未连接', '未接入', '暂未支持该功能', '24h 缓存',
    '请求失败', '加载失败', '暂无数据', 'No data', '空空如也', '倒计时',
    '请在网页端', 'tmword.xyz',
  ];

  it('H-01 可见文本 0 命中禁词族（初始态 / 失败态 / 成功态三帧都扫）', async () => {
    seedUpgradeSession();
    mountScreen();
    const scan = (): void => {
      for (const text of visibleTexts()) {
        for (const banned of BANNED) expect(text).not.toContain(banned);
      }
    };
    scan();
    responses = {
      force: { status: 400, body: { error: TM_ERRORS.OLD_PASSWORD_INCORRECT.copy, code: 'OLD_PASSWORD_INCORRECT' } },
    };
    await fillAllThree();
    await submitForm();
    scan();
    responses = { force: { status: 200, body: UPGRADED } };
    await submitForm();
    expect(byTestId('upgrade-result-notice')).not.toBeNull();
    scan();
  });

  it('H-02「至少 8 位」的唯一豁免：命中的可见串逐字等于 shared 的定稿句（屏内无一条自造）', () => {
    seedUpgradeSession();
    mountScreen();
    const allowed = [
      AUTH_COPY.forceUpgrade.title,
      AUTH_COPY.forceUpgrade.notice,
      TM_ERRORS.WEAK_PASSWORD.copy,
      AUTH_COPY.strengthLevels[0],
    ];
    const hits = visibleTexts().filter((text) => text.includes('至少 8 位'));
    expect(hits.length).toBeGreaterThan(0);
    for (const text of hits) expect(allowed).toContain(text);
  });

  it('H-03 跳过型出口的结构性判据：本页可交互动作集合 = 那两颗，别的一颗都没有', () => {
    seedUpgradeSession();
    mountScreen();
    const labels = actionButtons().map((el) => String(el.textContent ?? '').trim()).sort();
    expect(labels).toEqual([AUTH_COPY.forceUpgrade.secondary, AUTH_COPY.forceUpgrade.submit].sort());
    expect(all('a').length).toBe(0);
    expect(all('[role=dialog]').length).toBe(0);
    // 共用件本身也没有 dismiss prop：页面上没有第三颗"离开"类节点
    expect(all('[data-auth-hard-gate]').length).toBe(1);
  });

  it('H-04 副标题与告知都取常量：屏没有内联任何一句，缺串时才留空不渲染', () => {
    seedUpgradeSession();
    mountScreen();
    const subtitle = q('[data-slot=password-subtitle]');
    expect(subtitle?.textContent?.trim()).toBe(AUTH_COPY.forceUpgrade.subtitle);
    // 本屏没有"传空即消失"的自造替身：subtitle 槽只由 shared 常量填
    expect(screenCode()).toContain('AUTH_COPY.forceUpgrade.subtitle');
  });
});

/* ═════════════════ I 组 · 不该在这一页的人 + 工厂 ═════════════════ */

describe('I 组 · 门禁的两类访客与强制改密工厂', () => {
  it('I-01 游客（两把钥匙都没有）：不渲染表单、只去 /login、一个请求都不发', async () => {
    mountScreen();
    await settle();
    expect(byTestId('force-upgrade')).toBeNull();
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
    expect(fetchCalls).toHaveLength(0);
  });

  it('I-02 已握正常 token（止血阀 off 的软告知面）：放行走、不清凭据、不发请求', async () => {
    seedNormalSession();
    mountScreen();
    await settle();
    expect(byTestId('force-upgrade')).toBeNull();
    expect(navigateCalls).toEqual(['/']);
    expect(localStorage.getItem(SESSION_KEYS.token)).not.toBeNull();
    expect(fetchCalls).toHaveLength(0);
  });

  it('I-03 工厂直调：端点 / 入参形状（upgradeToken + oldPassword 补在契约之外）/ 响应过 AuthResultSchema', async () => {
    seedUpgradeSession();
    const options = forceUpgradeMutationOptions();
    expect(options.mutationKey).toEqual(['auth', 'force-upgrade']);
    const facts = await options.mutationFn!(
      { oldPassword: OLD_PWD, newPassword: NEW_PWD, confirmPassword: NEW_PWD, upgradeToken: UPGRADE_TOKEN },
      undefined as never,
    );
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toContain('/api/password/force');
    expect(fetchCalls[0]!.authorization).toBe(`Bearer ${UPGRADE_TOKEN}`);
    expect(fetchCalls[0]!.body).toEqual({
      newPassword: NEW_PWD,
      confirmPassword: NEW_PWD,
      upgradeToken: UPGRADE_TOKEN,
      oldPassword: OLD_PWD,
    });
    expect(facts.token).toBe(NEW_TOKEN);
  });

  it('I-04 工厂在正常 token 为空的 upgrade 会话里也能出门（bearer 优先于 readToken 的那一处）', async () => {
    seedUpgradeSession();
    expect(currentToken()).toBe('');
    const options = forceUpgradeMutationOptions();
    await expect(
      options.mutationFn!(
        { oldPassword: OLD_PWD, newPassword: NEW_PWD, confirmPassword: NEW_PWD, upgradeToken: '' },
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: 'NO_AUTH' });
    expect(fetchCalls).toHaveLength(0);
  });
});
