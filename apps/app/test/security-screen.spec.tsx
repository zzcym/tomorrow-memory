/**
 * T-19d 判据自证（App 账号安全屏 `#/security`，普通改密面）—— `apps/app/test/security-screen.spec.tsx`。
 *
 * 宿主形态照 `upgrade-screen.spec.tsx`（同一批、同表单、同一套夹具）：`QueryClientProvider` +
 * `UiHostProvider` 直接渲染**本屏**，不启动 `startRouter()`（A-44 #86：挂载由 TPM 串行收口），
 * 只 `installRouterGlobals()` + 喂路由 store（`resetRouterForTest` / `commitLocation`），
 * `host.navigate` 用数组采集。网络只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口），
 * 正常会话一律经 `auth-store.signIn()` 播种（唯一写点，本文件不抄第二份落法、不直接写存储）。
 *
 * 为什么这一屏不套 `GateLayout`：`/security` 在 `router.tsx:57` 登记的是 **`kind: 'secondary'`**
 * （§5.3 第 5 行），真实壳是 `TabBarShell`（`main.tsx:61`），门禁壳只属 `kind === 'gate'` 的两页。
 * 于是"返回语义"是本屏的判据面（H 组），而"无 tab / 物理返回被拦"那一套**不许**被抄进来 ——
 * `stay` 与 `window.onAndroidBack` 的装饰在本文件里是**反向哨**（A-08 / H-04）。
 *
 * 全文件 fake timers：`settle()` 推微任务 + 宏任务，D 组"常驻 6 秒（`TOAST_LONG_MS`）后才清凭据回登录"
 * 必须能确定性推进（不许 `waitForTimeout`）。
 *
 * 分组（与交付报告 §③ 的用例账一一对应）：
 *  - A 组：源码哨兵（复用 `ChangePasswordForm` 且**只传 props**、0 自画表单控件、话术零自造、
 *    凭据写面 0 扩面、屏内 0 状态码分支、Chrome84 红线、端点唯一份、禁词静态面、0 硬门禁借用、
 *    本 spec 自身 0 `test.skip`/`test.fail`/`waitForTimeout`）；
 *  - B 组：渲染面（三格字段 + 两颗出口 + 串全部等于 `AUTH_COPY.changePassword.*` + 0 原生 `required`）；
 *  - C 组：**R-40② 出口一 = 客户端这一关**（`oldPassword` 必填、新密码 < `PASSWORD_MIN` ⇒ 0 请求，
 *    钉法与 `apps/web/e2e/profile.spec.ts:74-89` 同形）；
 *  - D 组：**成功链 = R-40③**（`PUT /api/password` 恰一次 → 旧 token 失效语义下清凭据 →
 *    6 秒"重新登录"话术链 → 只回 `/login`；新密码不落任何存储、服务端响应混进 token 也不采纳）；
 *  - E 组：**R-40② 出口二 = 服务端这一关**（客户端长度已合规仍被 `WEAK_PASSWORD` 拒 ⇒ 恰 1 请求 +
 *    字段级可见原因，钉法同 `profile.spec.ts:130-142`；两条出口分开钉、同一句串来自 shared 一份）；
 *  - F 组：失败面不得静默（`OLD_PASSWORD_INCORRECT` 落当前密码格 / `PASSWORD_SAME_AS_OLD` 落新密码格 /
 *    `TEMP_LOCKED` 只禁提交不给倒计时 / 契约外网络断给人话 / 401·403 都只走 `rest-fetcher` 单点）；
 *  - G 组：不该在这一页的人（游客 → `/login`；只握一次性凭据 → `/upgrade-password`；换出后不重复跳、空帧不自造文案）；
 *  - H 组：二级页返回语义（路由判 `go-back` 而不是 `stay`；有历史退一层、无历史回父页 `/me`；不占有 T-20 的冻结钩子）；
 *  - I 组：`changePasswordMutationOptions()` 工厂直调 + 反向哨（五厂计数、端点集合不外溢，A-61 #169 三件套的"不外溢"这一件）。
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
  PASSWORD_MIN,
  PLAIN_TERMS,
  TM_ERRORS,
  TOAST_LONG_MS,
} from '@tm/shared';
import SecurityScreen from '../src/screens/SecurityScreen.js';
import { changePasswordMutationOptions } from '../src/data/queries/auth.js';
import { resetAuthHandling } from '../src/data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  getAuthSnapshot,
  refreshFromStorage,
  signIn,
} from '../src/lib/auth-store.js';
import { SESSION_KEYS, hasUpgradeToken } from '../src/lib/token-bridge.js';
import {
  GATE_UPGRADE_PATH,
  commitLocation,
  canGoBack,
  handleSystemBack,
  installRouterGlobals,
  onAndroidBackString,
  resetRouterForTest,
  routeFor,
} from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

const SECURITY_PATH = '/security';
const PARENT_PATH = '/me';
const PHONE = '13800000001';
const NORMAL_TOKEN = 'tk-normal-19d';
/** 当前密码：≥8 位（契约 `PasswordSchema` 对三格都要求 ≥8，客户端与服务端同一份）。 */
const OLD_PWD = 'OldPass123';
/** 客户端这一关**合规**的新密码（8 位）：所以它在屏侧只可能因服务端策略被拒 = 出口二专用。 */
const NEW_PWD = 'NewPass123';
/** 短一位（`PASSWORD_MIN - 1`）：客户端这一关专用，绝不该变成一次请求。 */
const TOO_SHORT_PWD = 'a'.repeat(PASSWORD_MIN - 1);

interface EndpointResponse {
  status: number;
  body: unknown;
  down?: boolean;
}

const OK: EndpointResponse = { status: 200, body: { ok: true } };
let responses: Record<'change', EndpointResponse> = { change: OK };
let holdChange = false;
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
    // 本屏只有一个端点；打到这里的就是它。别的端点（含强制改密那条）出现在这里 = 本屏越界。
    if (!url.includes('/api/password')) return jsonResponse(404, { error: 'not found' });
    if (url.includes('/api/password/force')) return jsonResponse(404, { error: 'wrong endpoint' });
    if (holdChange) {
      return new Promise<Response>((resolve) => {
        holders.push(resolve);
      });
    }
    const response = responses.change;
    if (response.down) throw new TypeError('network down');
    return jsonResponse(response.status, response.body);
  });
  vi.stubGlobal('fetch', fn);
}

function releaseHolders(): void {
  const pending = holders;
  holders = [];
  for (const resolve of pending) resolve(jsonResponse(200, { ok: true }));
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

function mountScreen(): void {
  resetRouterForTest(SECURITY_PATH);
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={host}>
          <SecurityScreen />
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

function screenRoot(): HTMLElement | null {
  return byTestId<HTMLElement>('security-screen');
}

function form(): HTMLFormElement | null {
  return q<HTMLFormElement>('form[data-testid=security-change-password]');
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

/** §3.9.5 的"落点"证据：直接读那一个字段的错误槽，不看整页文本、不给"总有一条算数"的余地。 */
function fieldError(field: 'old' | 'new' | 'confirm'): string | null {
  const el = q<HTMLElement>(`#password-change-${field}-err`);
  return el ? String(el.textContent ?? '').trim() : null;
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
  const formEl = form();
  expect(formEl).not.toBeNull();
  await act(async () => {
    formEl!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await settle();
}

async function fillAllThree(newPassword = NEW_PWD): Promise<void> {
  await fill(oldInput(), OLD_PWD);
  await fill(newInput(), newPassword);
  await fill(confirmInput(), newPassword);
}

function alerts(): string[] {
  return all('[role=alert]').map((el) => String(el.textContent ?? '').trim());
}

/** 可交互"动作"（排除字段上的显示/隐藏眼睛，§3.1.1 计数口径，同 `upgrade-screen.spec.tsx`）。 */
function actionButtons(): HTMLButtonElement[] {
  return all('button:not([data-auth-affordance])');
}

function actionLabels(): string[] {
  return actionButtons().map((el) => {
    const label = String(el.getAttribute('aria-label') ?? '').trim();
    return label === '' ? String(el.textContent ?? '').trim() : label;
  });
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

/** 存储面快照：新密码/旧密码有没有被写进**任何**一个键（不止 token 键）。 */
function storedValues(): string[] {
  return Object.keys(localStorage).map((key) => `${key}=${String(localStorage.getItem(key))}`);
}

/* 源码哨兵：先剥注释再扫（源文件头大量"不写 xxx / 不许 xxx"的注释提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screenCode = (): string => stripComments(readSrc('../src/screens/SecurityScreen.tsx'));
const queriesCode = (): string => stripComments(readSrc('../src/data/queries/auth.ts'));

/** 播种：唯一写点 `signIn()`（本文件不直接写存储）。 */
function seedNormalSession(token = NORMAL_TOKEN): void {
  signIn({ token, phone: PHONE, nickname: 'tm' });
}

function seedUpgradeOnlySession(): void {
  signIn({ token: '', phone: PHONE, upgradeToken: 'up-token-visitor' });
}

function serverError(code: keyof typeof TM_ERRORS, status = 400): void {
  responses = { change: { status, body: { error: TM_ERRORS[code].copy, code } } };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchCalls = [];
  navigateCalls = [];
  toastCalls = [];
  holders = [];
  holdChange = false;
  responses = { change: OK };
  localStorage.clear();
  refreshFromStorage();
  resetAuthHandling();
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

describe('A 组 · 源码哨兵（复用共用件 / 零自造 / 凭据面不扩 / Chrome84 / 端点唯一）', () => {
  it('A-01 判据①：0 自画表单控件；全树唯一那颗 <button 是 headerAction 的返回钮（页面 chrome，文案取 ARIA.back）', () => {
    const code = screenCode();
    for (const tag of ['<input', '<form', '<label', '<textarea', '<select']) {
      expect(code, `屏内出现自写控件 ${tag}`).not.toContain(tag);
    }
    // 与强制改密页不同：本屏是二级页，`headerAction` 那颗返回钮是**允许且需要**的导航件。
    // 故这里钉的是"恰一颗、且只能是它"，而不是"零颗"（少钉或多钉都不算自证）。
    expect(code.match(/<button/g) ?? []).toHaveLength(1);
    expect(code).toContain('headerAction');
    expect(code).toContain('ARIA.back');
    // 表单本体必须是共用件、且只挂一次（0 重写）
    expect(code).toContain('ChangePasswordForm');
    expect(code.match(/<ChangePasswordForm/g) ?? []).toHaveLength(1);
    // 只传 props：没有对共用件的任何包装式自造（本屏不引 ui 私有路径）
    const screenRaw = readSrc('../src/screens/SecurityScreen.tsx');
    expect(screenRaw).not.toMatch(/from '@tm\/ui\/[a-z]/);
  });

  it('A-02 文案单一源：屏与查询层剥注释后 CJK 字面量 0 命中（本屏一个字都不自造）', () => {
    for (const [name, code] of [
      ['SecurityScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
    ] as const) {
      expect(code, `${name} 含中文字面量`).not.toMatch(/[一-龥]/);
    }
  });

  it('A-03 凭据面未被本屏扩面：0 存储 API / 0 写 token / 0 读桥；清凭据只调 auth-store 那一个函数恰一次', () => {
    const code = screenCode();
    for (const banned of [
      'localStorage',
      'sessionStorage',
      'setItem',
      'getItem',
      'AndroidBridge',
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
      'afterPasswordChanged(',
      'currentToken(',
      'currentUpgradeToken(',
      'token-bridge',
    ]) {
      expect(code, `屏内命中凭据写面 ${banned}`).not.toContain(banned);
    }
    expect(code.match(/signOut\(\)/g) ?? []).toHaveLength(1);
    // auth-store 的单点计数没被本屏改动：清法仍只有一处
    const store = stripComments(readSrc('../src/lib/auth-store.ts'));
    expect(store.match(/clearStoredSession\(\)/g) ?? []).toHaveLength(1);
  });

  it('A-04 屏内不成第二份状态码处理：0 状态码 / 0 `.status` / 0 handleAuthError / 0 直接出门请求，提交只经那一份工厂', () => {
    const code = screenCode();
    for (const banned of [
      '=== 401',
      '=== 403',
      '== 401',
      '401',
      '403',
      'status ===',
      '.status',
      'handleAuthError(',
      'fetch(',
      'apiPut',
      'apiPost',
      'apiGet',
      '/api/password',
      'PASSWORD_UPGRADE_REQUIRED',
    ]) {
      expect(code, `屏内命中 ${banned}`).not.toContain(banned);
    }
    expect(code).toContain('changePasswordMutationOptions');
    expect(code.match(/changePasswordMutationOptions\(\)/g) ?? []).toHaveLength(1);
  });

  it('A-05 Chrome84 / §5.1 红线：屏与查询层 0 命中四禁与新特性，0 顶层 await', () => {
    for (const [name, code] of [
      ['SecurityScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
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

  it('A-06 端点唯一份：普通改密恰一份工厂 + `PUT /api/password` 恰一处；强制改密那一份未被吞并、两面对互不预写', () => {
    const queries = queriesCode();
    expect(queries.match(/export function changePasswordMutationOptions/g) ?? []).toHaveLength(1);
    expect(queries.match(/'\/api\/password'/g) ?? []).toHaveLength(1);
    expect(queries.match(/parseWith\(ChangePasswordInputSchema\)/g) ?? []).toHaveLength(1);
    // 另一面仍在、仍只一份：闭合引号让 `/api/password` 这条 pin 不会被 `/api/password/force` 顶掉
    expect(queries.match(/'\/api\/password\/force'/g) ?? []).toHaveLength(1);
    expect(queries.match(/export function forceUpgradeMutationOptions/g) ?? []).toHaveLength(1);
    // 登录前三件的"关单点"豁免没有被本屏扩面：仍恰三处
    expect(queries.match(/handleAuthError: false/g) ?? []).toHaveLength(3);
    // 屏侧不写端点
    expect(screenCode()).not.toContain('/api/password');
  });

  it('A-07 禁词的静态面：屏与查询层剥注释后 0 命中跳过型出口与 §6.6 / §8.3-D 词', () => {
    for (const [name, code] of [
      ['SecurityScreen.tsx', screenCode()],
      ['data/queries/auth.ts', queriesCode()],
    ] as const) {
      for (const banned of [
        '以后再说', '稍后再改', '下次提醒', '宽限期', '已为您延至', '倒计时', 'passwordUpgradeDeadline',
        '忘记密码', '找回密码', '本期无法找回', '请在网页端', 'tmword.xyz', '重新注册', '换手机号',
      ]) {
        expect(code, `${name} 命中 ${banned}`).not.toContain(banned);
      }
    }
  });

  it('A-08 0 硬门禁借用：屏内不出现 `stay` / 物理返回钩子 / 全局对象 / 门禁壳，也不带原生 `required` 与 `:has(`', () => {
    const code = screenCode();
    for (const banned of [
      'stay',
      'onAndroidBack',
      'window.',
      'document.',
      'GateLayout',
      'data-auth-hard-gate',
      'forceUpgrade',
      'ForcePasswordUpgradeForm',
      'required',
      ':has(',
    ]) {
      expect(code, `屏内命中 ${banned}`).not.toContain(banned);
    }
  });

  it('A-09 本 spec 自身的自禁项：0 跳过型断言 / 0 预期失败注解 / 0 only / 0 裸等宏任务（只扫可执行位，不扫标题文案）', () => {
    /**
     * 口径：这一条扫的是**调用位**（带括号的 API），不是词面 —— 本文件的用例标题里合法地写着
     * "不许 `test.skip` / 不许 `waitForTimeout`" 这类说明句，扫词面会自 hit（剥字符串字面量又会被
     * 中文标题里的引号配对错位带偏，实测过）。跳过型/预期失败型注解一旦以**调用**的形式出现就必然带 `(`，
     * 所以钉 `\.skip\s*\(` 这一族既打得死目标又不误伤注释与标题。
     */
    const code = stripComments(readSrc('./security-screen.spec.tsx'));
    const callSites: Array<[string, RegExp]> = [
      ['跳过型用例（skip）', /\b(?:test|it)\.(?:skip|fail|only)\s*\(/],
      ['跳过型用例组（describe.skip/only）', /\bdescribe\.(?:skip|only)\s*\(/],
      ['裸等宏任务（waitForTimeout）', /waitForTimeout\s*\(/],
    ];
    for (const [label, pattern] of callSites) {
      expect(pattern.test(code), `spec 出现${label}`).toBe(false);
    }
    // 唯一的等待手段是假定时器自己推进（`settle()` / `advance()` 两个夹具，全文件共用）
    expect(code.match(/vi\.advanceTimersByTimeAsync/g) ?? []).toHaveLength(2);
    expect(code.match(/vi\.useFakeTimers\(\)/g) ?? []).toHaveLength(1);
  });
});

/* ═════════════════ B 组 · 渲染面 ═════════════════ */

describe('B 组 · 渲染面：三格字段、两颗出口、串全部取自 AUTH_COPY.changePassword', () => {
  it('B-01 正常 token 会话：渲染本屏根 + 共用件，标题与主按钮串逐字等于 shared', () => {
    seedNormalSession();
    mountScreen();
    expect(screenRoot()).not.toBeNull();
    expect(form()).not.toBeNull();
    const texts = visibleTexts(form()!);
    expect(texts).toContain(AUTH_COPY.changePassword.title);
    expect(texts).toContain(AUTH_COPY.changePassword.submit);
    expect(byTestId<HTMLElement>('password-submit')?.textContent?.trim()).toBe(
      AUTH_COPY.changePassword.submit,
    );
  });

  it('B-02 同一套字段（§3.9 铁律）：三格 password 输入 + 强度条 + 眼睛 ×3，焦点落在「当前密码」', () => {
    seedNormalSession();
    mountScreen();
    expect(all('[data-auth-control=old-password]').length).toBe(1);
    expect(all('[data-auth-control=new-password]').length).toBe(1);
    expect(all('[data-auth-control=confirm-password]').length).toBe(1);
    expect(all('input[type=password]').length).toBe(3);
    expect(byTestId('password-strength')).not.toBeNull();
    expect(all('button[data-auth-affordance=password-visibility]').length).toBe(3);
    expect(document.activeElement).toBe(oldInput());
  });

  it('B-03 出口恰两颗：返回（aria-label=ARIA.back，导航件）+ 提交，顺序 = 返回 → 提交', () => {
    seedNormalSession();
    mountScreen();
    expect(actionLabels()).toEqual([ARIA.back, AUTH_COPY.changePassword.submit]);
    expect(q(`[aria-label="${ARIA.back}"]`)).not.toBeNull();
  });

  it('B-04 没有第三颗：0 链接、0 弹窗、0 副出口「退出登录」（那一颗只属硬门禁页）', () => {
    seedNormalSession();
    mountScreen();
    expect(all('a[href]').length).toBe(0);
    expect(all('[role=dialog]').length).toBe(0);
    expect(all('[data-dismiss]').length).toBe(0);
    expect(all('[data-auth-secondary]').length).toBe(0);
    expect(visibleTexts()).not.toContain(AUTH_COPY.forceUpgrade.secondary);
  });

  it('B-05 0 硬门禁装饰、0 强制改密告知条、0 原生 required（表单只靠共用件的 noValidate）', () => {
    seedNormalSession();
    mountScreen();
    expect(all('[data-auth-hard-gate]').length).toBe(0);
    expect(byTestId('force-notice')).toBeNull();
    expect(visibleTexts()).not.toContain(NOTICE_FORCE_UPGRADE);
    expect(all('[required]').length).toBe(0);
    expect(form()?.hasAttribute('novalidate')).toBe(true);
  });
});

/* ═════════════════ C 组 · R-40② 出口一（客户端这一关，0 请求） ═════════════════ */

describe('C 组 · 出口一 = 客户端拦下（`oldPassword` 必填 / 新密码 < PASSWORD_MIN）⇒ 一个请求都不发', () => {
  it('C-01 空「当前密码」：0 请求、0 跳转，当前密码格下给 OLD_PASSWORD_REQUIRED（R-40①必填）', async () => {
    seedNormalSession();
    mountScreen();
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(navigateCalls).toHaveLength(0);
    expect(fieldError('old')).toBe(TM_ERRORS.OLD_PASSWORD_REQUIRED.copy);
    expect(alerts()).toContain(TM_ERRORS.OLD_PASSWORD_REQUIRED.copy);
    expect(oldInput().getAttribute('aria-invalid')).toBe('true');
    expect(form()).not.toBeNull(); // §3.9.4 不白屏
  });

  it('C-02 新密码不足 8 位：0 请求 + 新密码格下给 WEAK_PASSWORD（口径同 web `profile.spec.ts:74-89`）', async () => {
    expect(TOO_SHORT_PWD.trim().length).toBeLessThan(PASSWORD_MIN);
    seedNormalSession();
    mountScreen();
    await fillAllThree(TOO_SHORT_PWD);
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(fieldError('new')).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
  });

  it('C-03 两次输入不一致：0 请求 + 确认格给 PASSWORD_MISMATCH，且已输入内容不丢', async () => {
    seedNormalSession();
    mountScreen();
    await fill(oldInput(), OLD_PWD);
    await fill(newInput(), NEW_PWD);
    await fill(confirmInput(), `${NEW_PWD}x`);
    await submitForm();
    expect(fetchCalls).toHaveLength(0);
    expect(fieldError('confirm')).toBe(TM_ERRORS.PASSWORD_MISMATCH.copy);
    expect(newInput().value).toBe(NEW_PWD);
    expect(confirmInput().value).toBe(`${NEW_PWD}x`);
  });

  it('C-04 pending 期间重复提交只发一次（防半途改两遍）', async () => {
    seedNormalSession();
    holdChange = true;
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    await submitForm();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(form()?.getAttribute('aria-busy')).toBe('true');
    releaseHolders();
    await settle();
    expect(fetchCalls).toHaveLength(1);
  });
});

/* ═════════════════ D 组 · 成功链（R-40③） ═════════════════ */

describe('D 组 · 成功链：恰一次 PUT /api/password → 6 秒重新登录话术 → 清凭据回 /login', () => {
  it('D-01 请求面：一次 PUT /api/password、带正常 token、体过契约（三格原样、不多不少）', async () => {
    seedNormalSession();
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toContain('/api/password');
    expect(fetchCalls[0]!.url).not.toContain('/api/password/force');
    expect(fetchCalls[0]!.method).toBe('PUT');
    expect(fetchCalls[0]!.authorization).toBe(`Bearer ${NORMAL_TOKEN}`);
    expect(fetchCalls[0]!.body).toEqual({
      oldPassword: OLD_PWD,
      newPassword: NEW_PWD,
      confirmPassword: NEW_PWD,
    });
  });

  it('D-02 成功当帧：只告知不跳转、旧 token 原样留着（本屏不签新 token），6 秒话术常驻、新密码不落任何存储', async () => {
    seedNormalSession();
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(toastCalls).toEqual([AUTH_COPY.changePassword.success.toast]);
    expect(navigateCalls).toHaveLength(0);
    // R-40③：服务端不回新 token（响应体只有 `{ok:true}`），屏侧也就没给自己换钥匙
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(getAuthSnapshot().status).toBe('signed-in');
    expect(byTestId('security-result-notice')?.textContent?.trim()).toBe(
      AUTH_COPY.changePassword.success.reloginNotice,
    );
    expect(byTestId('security-result-notice')?.getAttribute('role')).toBe('status');
    expect(form()).not.toBeNull();
    // 两把密码都不许进存储（含 kv 兜底面）
    for (const value of storedValues()) {
      expect(value).not.toContain(NEW_PWD);
      expect(value).not.toContain(OLD_PWD);
    }
  });

  it('D-03 到 TOAST_LONG_MS 才清凭据并只去 /login：两把钥匙一起没、不发第二次请求、不重复跳转', async () => {
    seedNormalSession();
    mountScreen();
    await fillAllThree();
    await submitForm();
    await advance(TOAST_LONG_MS - 100);
    expect(navigateCalls).toHaveLength(0);
    await advance(200);
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(localStorage.getItem(SESSION_KEYS.phone)).toBeNull();
    expect(getAuthSnapshot()).toMatchObject({ status: 'signed-out', hasToken: false, phone: '' });
    expect(fetchCalls).toHaveLength(1);
    await advance(TOAST_LONG_MS * 2);
    expect(navigateCalls).toEqual([LOGIN_ROUTE]); // 收尾后不再被"访客判定"跳第二次
  });

  it('D-04 服务端响应若混进 token 形状也不采纳（`.strip` 语义 + 本屏 0 写点）：话术链照旧、只清不签', async () => {
    seedNormalSession();
    responses = { change: { status: 200, body: { ok: true, token: 'tk-stray', phone: '13900000000' } } };
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(localStorage.getItem(SESSION_KEYS.phone)).toBe(PHONE);
    await advance(TOAST_LONG_MS + 100);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(storedValues().some((value) => value.includes('tk-stray'))).toBe(false);
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
  });

  it('D-05 成功之后重复点提交不再发请求（done 守卫；话术期不许改第二遍）', async () => {
    seedNormalSession();
    mountScreen();
    await fillAllThree();
    await submitForm();
    await submitForm();
    await advance(TOAST_LONG_MS - 500);
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(toastCalls).toEqual([AUTH_COPY.changePassword.success.toast]);
  });
});

/* ═════════════════ E 组 · R-40② 出口二（服务端这一关，1 请求） ═════════════════ */

describe('E 组 · 出口二 = 服务端 `WEAK_PASSWORD`：客户端长度已合规，仍必须可见原因', () => {
  it('E-01 服务端回 WEAK_PASSWORD：恰 1 请求 + 新密码格下定稿串（口径同 web `profile.spec.ts:130-142`）', async () => {
    seedNormalSession();
    serverError('WEAK_PASSWORD');
    expect(NEW_PWD.trim().length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(fieldError('new')).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    expect(navigateCalls).toHaveLength(0);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN); // 失败不清凭据
  });

  it('E-02 两条出口分开钉、同一份串：客户端那条 0 请求，服务端那条 1 请求，两句 alert 逐字相等', async () => {
    seedNormalSession();
    mountScreen();
    // 出口一（客户端）
    await fillAllThree(TOO_SHORT_PWD);
    await submitForm();
    const fromClient = fieldError('new');
    expect(fetchCalls).toHaveLength(0);
    // 出口二（服务端）：长度合规、只有服务端能拒
    serverError('WEAK_PASSWORD');
    await fill(newInput(), NEW_PWD);
    await fill(confirmInput(), NEW_PWD);
    await submitForm();
    const fromServer = fieldError('new');
    expect(fetchCalls).toHaveLength(1);
    expect(fromClient).not.toBeNull();
    expect(fromServer).toBe(fromClient);
    expect(fromServer).toBe(TM_ERRORS.WEAK_PASSWORD.copy);
    expect(fromServer).toContain(`${PASSWORD_MIN} 位`);
  });

  it('E-03 出口二仍不落成功态：没有话术条、没有 toast、没有跳转（不许把失败洗成成功）', async () => {
    seedNormalSession();
    serverError('WEAK_PASSWORD');
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(byTestId('security-result-notice')).toBeNull();
    expect(toastCalls).toHaveLength(0);
    expect(navigateCalls).toHaveLength(0);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
  });
});

/* ═════════════════ F 组 · 失败面不得静默 ═════════════════ */

describe('F 组 · 失败面：§3.9.5 逐码落点 + 契约外给人话 + 401/403 只走单点', () => {
  it('F-01 OLD_PASSWORD_INCORRECT（401）⇒ 落「当前密码」格，凭据不动、不跳页', async () => {
    seedNormalSession();
    serverError('OLD_PASSWORD_INCORRECT', 401);
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fieldError('old')).toBe(TM_ERRORS.OLD_PASSWORD_INCORRECT.copy);
    expect(navigateCalls).toHaveLength(0);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
  });

  it('F-02 PASSWORD_SAME_AS_OLD ⇒ 落「新密码」格，不落到当前密码格（落点不串味）', async () => {
    seedNormalSession();
    serverError('PASSWORD_SAME_AS_OLD');
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fieldError('new')).toBe(TM_ERRORS.PASSWORD_SAME_AS_OLD.copy);
    expect(fieldError('old')).toBeNull();
  });

  it('F-03 TEMP_LOCKED（429）⇒ 主按钮下给定稿句、只禁提交、本页 0 倒计时', async () => {
    seedNormalSession();
    serverError('TEMP_LOCKED', 429);
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(byTestId('password-form-error')?.textContent?.trim()).toBe(TM_ERRORS.TEMP_LOCKED.copy);
    expect(byTestId<HTMLButtonElement>('password-submit')?.disabled).toBe(true);
    expect(q('[data-testid*=countdown]')).toBeNull();
    expect(visibleTexts().some((text) => text.includes('倒计时'))).toBe(false);
  });

  it('F-04 契约外失败（网络断、无码）⇒ 既有单点 `apiErrorMessage()` 的人话上屏，仍没有第三出口', async () => {
    seedNormalSession();
    responses = { change: { status: 0, body: null, down: true } };
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(alerts()).toContain(PLAIN_TERMS.connectionDown);
    expect(toastCalls).toHaveLength(0);
    expect(actionButtons()).toHaveLength(2);
  });

  it('F-05 401 CREDENTIAL_EXPIRED ⇒ 清凭据与跳转都只由 `rest-fetcher` 单点做（屏内 0 参与、0 自造提示）', async () => {
    seedNormalSession();
    serverError('CREDENTIAL_EXPIRED', 401);
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(fetchCalls).toHaveLength(1);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    // 跳 /login 这一步是单点做的（`window.location.hash`），不是屏自己判的状态码
    expect(window.location.hash).toBe(`#${LOGIN_ROUTE}`);
    // 这一帧屏还没被通知 ⇒ 屏侧没有第二份 401 处理
    expect(navigateCalls).toHaveLength(0);
    // 同源派生位：store 一刷新就是 signed-out（屏不自算第二份判定）
    await act(async () => {
      refreshFromStorage();
      await Promise.resolve();
    });
    expect(getAuthSnapshot().status).toBe('signed-out');
    await settle();
    // 之后屏自身的"访客判定"顶多也只跟着去 /login，不会造出第三个去处
    expect(navigateCalls.filter((to) => to !== LOGIN_ROUTE)).toEqual([]);
  });

  it('F-06 403 PASSWORD_UPGRADE_REQUIRED ⇒ 去 `/upgrade-password` 也只由单点做：屏不清凭据、不去 `/login`', async () => {
    seedNormalSession();
    serverError('PASSWORD_UPGRADE_REQUIRED', 403);
    mountScreen();
    await fillAllThree();
    await submitForm();
    expect(window.location.hash).toBe(`#${UPGRADE_PASSWORD_ROUTE}`);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(navigateCalls.filter((to) => to === LOGIN_ROUTE)).toHaveLength(0);
    expect(alerts()).toContain(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy);
  });
});

/* ═════════════════ G 组 · 不该在这一页的人 ═════════════════ */

describe('G 组 · 门禁判定只认 auth-store 派生位：两类访客各回各的门，空帧不自造文案', () => {
  it('G-01 游客（两把钥匙都没有）：不渲染表单、只去 /login、一个请求都不发', async () => {
    mountScreen();
    await settle();
    expect(screenRoot()).toBeNull();
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
    expect(fetchCalls).toHaveLength(0);
  });

  it('G-02 只握一次性凭据（R-40④ 硬门禁会话误入二级页）：去 /upgrade-password，不动它的临时钥匙', async () => {
    seedUpgradeOnlySession();
    mountScreen();
    await settle();
    expect(screenRoot()).toBeNull();
    expect(navigateCalls).toEqual([UPGRADE_PASSWORD_ROUTE]);
    expect(fetchCalls).toHaveLength(0);
    expect(hasUpgradeToken()).toBe(true);
    expect(getAuthSnapshot().upgradeSessionOnly).toBe(true);
  });

  it('G-03 被换出的是空帧而非自造告知：整棵树 0 文本节点、推进 6 秒也不跳第二次', async () => {
    mountScreen();
    await settle();
    expect(visibleTexts()).toEqual([]);
    await advance(TOAST_LONG_MS * 2);
    expect(navigateCalls).toEqual([LOGIN_ROUTE]);
    expect(toastCalls).toHaveLength(0);
  });
});

/* ═════════════════ H 组 · 二级页返回语义 ═════════════════ */

describe('H 组 · 返回语义 = 正常回上一屏（判 `go-back`，不抄强制改密页的 `stay`）', () => {
  it('H-01 路由登记面：/security 是 secondary、不是 gate，也不是 GATE_UPGRADE_PATH', () => {
    expect(routeFor(SECURITY_PATH).kind).toBe('secondary');
    expect(GATE_UPGRADE_PATH).not.toBe(SECURITY_PATH);
    expect(routeFor(GATE_UPGRADE_PATH).kind).toBe('gate');
  });

  it('H-02 handleSystemBack 在本页判 go-back / goto-lookup，两种情况下都不判 stay', () => {
    resetRouterForTest(PARENT_PATH);
    commitLocation(SECURITY_PATH, false);
    expect(canGoBack()).toBe(true);
    expect(handleSystemBack(SECURITY_PATH)).toBe('go-back');
    resetRouterForTest(SECURITY_PATH);
    expect(canGoBack()).toBe(false);
    expect(handleSystemBack(SECURITY_PATH)).toBe('goto-lookup');
  });

  it('H-03 有应用内历史：点返回 = 退一层（history.back 一次），不发请求、不清凭据、不跳登录', async () => {
    seedNormalSession();
    mountScreen();
    /** 栈是"挂载之后"再垒的（`mountScreen()` 自带 `resetRouterForTest`，先垒会被抹平）。 */
    resetRouterForTest(PARENT_PATH);
    commitLocation(SECURITY_PATH, false);
    expect(canGoBack()).toBe(true);
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    await click(q<HTMLElement>(`[aria-label="${ARIA.back}"]`)!);
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toHaveLength(0);
    expect(navigateCalls).toHaveLength(0);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe(NORMAL_TOKEN);
    expect(screenRoot()).not.toBeNull();
  });

  it('H-04 无历史（原生深链直达）：点返回 = 落父页 /me；且本屏不占有 T-20 的冻结钩子', async () => {
    seedNormalSession();
    const installedHook = window.onAndroidBack;
    expect(installedHook).toBe(onAndroidBackString);
    mountScreen();
    expect(window.onAndroidBack).toBe(installedHook); // 本屏没换钩子（换钩子只属硬门禁页）
    resetRouterForTest(SECURITY_PATH);
    await click(q<HTMLElement>(`[aria-label="${ARIA.back}"]`)!);
    expect(window.location.hash).toBe(`#${PARENT_PATH}`);
    unmount();
    expect(window.onAndroidBack).toBe(installedHook);
  });
});

/* ═════════════════ I 组 · 工厂直调 + 反向哨 ═════════════════ */

describe('I 组 · `changePasswordMutationOptions()` 与"不外溢"的反向哨', () => {
  it('I-01 工厂直调：key 唯一、PUT /api/password、带正常 token、响应过 OkResultSchema', async () => {
    seedNormalSession();
    const options = changePasswordMutationOptions();
    expect(options.mutationKey).toEqual(['auth', 'change-password']);
    const facts = await options.mutationFn!(
      { oldPassword: OLD_PWD, newPassword: NEW_PWD, confirmPassword: NEW_PWD },
      undefined as never,
    );
    expect(facts).toEqual({ ok: true });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.method).toBe('PUT');
    expect(fetchCalls[0]!.url).toContain('/api/password');
    expect(fetchCalls[0]!.authorization).toBe(`Bearer ${NORMAL_TOKEN}`);
  });

  it('I-02 无凭据时本地就失败（NO_AUTH，0 请求）：改密面必须 `auth: true`，不许成为匿名口', async () => {
    const options = changePasswordMutationOptions();
    await expect(
      options.mutationFn!(
        { oldPassword: OLD_PWD, newPassword: NEW_PWD, confirmPassword: NEW_PWD },
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: 'NO_AUTH' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('I-03 响应形状漂移当场红（`{ok:true}` 之外的形状 → BAD_RESPONSE，§5.2 代价明示）', async () => {
    seedNormalSession();
    responses = { change: { status: 200, body: { ok: false } } };
    const options = changePasswordMutationOptions();
    await expect(
      options.mutationFn!(
        { oldPassword: OLD_PWD, newPassword: NEW_PWD, confirmPassword: NEW_PWD },
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('I-04 反向哨（A-61 #169 第三件）：查询层仍恰五厂、端点集合不外溢，改密只有两面', () => {
    const queries = queriesCode();
    expect(queries.match(/export function \w+MutationOptions/g) ?? []).toHaveLength(5);
    expect(queries.match(/'\/api\/[a-z-]+(?:\/[a-z-]+)?'/g) ?? []).toEqual([
      "'/api/login'",
      "'/api/register'",
      "'/api/send-code'",
      "'/api/password/force'",
      "'/api/password'",
    ]);
    // 假想的第三面（找回 / 重置 / 免验旧密码）在本仓不存在，也不许被 T-19d 预写
    expect(queries).not.toMatch(/ResetPassword|ForgotPassword|recover|'\/api\/password\/(?:reset|forgot|recovery)'/);
    expect(queries).not.toMatch(/\/api\/logout/);
    expect(screenCode()).not.toMatch(/ResetPassword|ForgotPassword|recover/);
  });
});
