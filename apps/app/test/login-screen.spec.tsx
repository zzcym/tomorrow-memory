/**
 * T-19b 判据自证（App 登录屏 `#/login`）—— `apps/app/test/login-screen.spec.tsx`。
 *
 * 宿主形态照 `wordbook-screen.spec.tsx`：`QueryClientProvider` + `UiHostProvider` 直接渲染组件
 * （屏未挂路由也不影响测：本文件**不启动路由器**，`host.navigate` 用 spy 采集——
 * A-44 #86：路由挂载由 TPM 串行收口）。网络只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口）。
 *
 * 分组：
 *  - A 组：`data/queries/auth.ts` 三个工厂（端点、请求体、响应收形状、发码 200 附码不 parse）；
 *  - B 组：源码哨兵机检（判据① 复用壳 + 屏内 0 自写 `<input`、话术零自造（剥注释后 CJK 0 命中）、
 *    0 命中 `=== 401`、0 命中 `handleAuthError(`、token 只走 auth-store（屏内 0 存储 API）、
 *    Chrome84 四禁、**T-19d 起两个改密面各恰一份工厂 + 端点唯一**（原"普通改密面不得预写"的反向钉
 *    已按 A-61 #169 三件套翻正，见 B-02 的 docblock）、五个端点各恰一处）；
 *  - C 组：判据⑨（未勾协议 = 禁用主按钮 + `role=alert` 可读原因）与校验话术 import 面
 *    （断言一律比对 `TM_ERRORS.*.copy` / `AUTH_COPY.*` 常量，不比对打出来的汉字）；
 *  - D 组：成功面走 `auth-store.signIn()` 既有落点 + `takePendingAction()` 续作（判据②）；
 *  - E 组：R-40④ 入口（本屏职责）——403 回码与 200 空 token 两种形态都跳 `/upgrade-password`
 *    且**不写正常 token**；
 *  - F 组：失败面人话全部来自既有取串助手 / §3.9.5 逐码落点，屏内零第二份判定；
 *  - G 组：验证码入口（发码 mutation + 通道未接的就地反馈 + 真失败才 toast）。
 *
 * 与 wordbook spec 同款坑位：`settle()` 每轮等**真宏任务**（react-query 的观察者通知走 setTimeout）。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider, type UiHost } from '@tm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AUTH_COPY,
  LOGIN_METHOD_NOTICE,
  PLAIN_TERMS,
  TM_ERRORS,
  type AuthResultDto,
} from '@tm/shared';
import LoginScreen from '../src/screens/LoginScreen.js';
import {
  loginMutationOptions,
  registerMutationOptions,
  sendCodeMutationOptions,
} from '../src/data/queries/auth.js';
import { isApiError, resetAuthHandling } from '../src/data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  getAuthSnapshot,
  peekPendingAction,
  refreshFromStorage,
  rememberPendingAction,
} from '../src/lib/auth-store.js';
import { SESSION_KEYS, hasUpgradeToken } from '../src/lib/token-bridge.js';
import { resetRouterForTest } from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 夹具 ═════════════════ */

const PHONE = '13800000001';
const PWD = 'Passw0rd!';
const WRONG_PWD = 'WrongPass1';

const AUTH_OK: AuthResultDto = {
  token: 'tk-19b',
  phone: PHONE,
  hasPassword: true,
  nickname: 'tm',
  avatar: '',
};

interface EndpointResponse {
  status: number;
  body: unknown;
  /** true = fetch 直接 reject（网络断 / 弱网超时面）。 */
  down?: boolean;
  /**
   * E5c：上游"没这颗路由"的形状 = 状态码 + **裸文本**响应体（`404 Not Found` / HTML 错误页），
   * 给出本字段即走这条支路（`body` 忽略）。夹具故意**不带任何 headers**（连 `content-type` 都没有），
   * 从这一层就钉死"判定只看内容是不是合法 JSON"。
   */
  raw?: string;
}

let responses: Record<'login' | 'register' | 'send-code', EndpointResponse> = {
  login: { status: 200, body: AUTH_OK },
  register: { status: 200, body: { ...AUTH_OK, token: 'tk-19b-reg', activated: true } },
  'send-code': { status: 200, body: { error: 'stub', code: 'SMS_NOT_CONFIGURED' } },
};

let holdLogin = false;
let holders: Array<(value: Response) => void> = [];

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let fetchCalls: FetchCall[] = [];
let navigateCalls: string[] = [];
let toastCalls: string[] = [];
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mounted = false;

function endpointOf(url: string): keyof typeof responses | null {
  if (url.includes('/api/send-code')) return 'send-code';
  if (url.includes('/api/register')) return 'register';
  if (url.includes('/api/login')) return 'login';
  return null;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** 裸文本响应体（E5c）：`res.text()` 给的是原文，`JSON.parse` 必炸；零 headers。 */
function textResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

function endpointResponse(response: EndpointResponse): Response {
  return response.raw === undefined
    ? jsonResponse(response.status, response.body)
    : textResponse(response.status, response.raw);
}

function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET');
    fetchCalls.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const endpoint = endpointOf(url);
    if (!endpoint) return jsonResponse(404, { error: 'not found' });
    if (endpoint === 'login' && holdLogin) {
      return new Promise<Response>((resolve) => {
        holders.push(resolve);
      });
    }
    const response = responses[endpoint];
    if (response.down) throw new TypeError('network down');
    return endpointResponse(response);
  });
  vi.stubGlobal('fetch', fn);
}

function releaseHolders(): void {
  const pending = holders;
  holders = [];
  for (const resolve of pending) resolve(jsonResponse(200, AUTH_OK));
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

function render(): void {
  client = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <UiHostProvider host={host}>
          <LoginScreen />
        </UiHostProvider>
      </QueryClientProvider>,
    );
  });
}

async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    });
  }
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

function byTestId<T extends HTMLElement>(testid: string): T | null {
  return q<T>(`[data-testid=${testid}]`);
}

function phoneInput(): HTMLInputElement {
  return q<HTMLInputElement>('[data-testid=field-phone] input')!;
}

function passwordInput(): HTMLInputElement {
  return q<HTMLInputElement>('[data-testid=field-password] input')!;
}

function confirmInput(): HTMLInputElement | null {
  return q<HTMLInputElement>('[data-testid=field-confirm] input');
}

async function fill(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function blur(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function submitForm(): Promise<void> {
  const form = q<HTMLFormElement>('form[data-testid=login-screen-form]');
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function toRegister(): Promise<void> {
  const link = byTestId<HTMLElement>('auth-switch')!;
  expect(link.textContent).toBe(AUTH_COPY.switchToRegister);
  await click(link);
}

async function fillSignIn(): Promise<void> {
  await fill(phoneInput(), PHONE);
  await fill(passwordInput(), PWD);
}

function alertOf(scope: string): string | null {
  return q(scope + ' [role=alert]')?.textContent ?? null;
}

function authFetches(): FetchCall[] {
  return fetchCalls.filter((call) => call.method === 'POST');
}

function formErrorText(): string | null {
  const el = byTestId<HTMLElement>('auth-form-error');
  return el ? String(el.textContent) : null;
}

/* 源码哨兵：先剥注释再扫（两个源文件头大量"不用 xxx / 不写 xxx"的注释提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

beforeEach(() => {
  fetchCalls = [];
  navigateCalls = [];
  toastCalls = [];
  holders = [];
  holdLogin = false;
  resetRouterForTest('/'); // 路由驱动 mode：默认快照回根路径 ⇒ 屏按「非 /register」派生出登录态
  responses = {
    login: { status: 200, body: AUTH_OK },
    register: { status: 200, body: { ...AUTH_OK, token: 'tk-19b-reg', activated: true } },
    'send-code': { status: 200, body: { error: 'stub', code: 'SMS_NOT_CONFIGURED' } },
  };
  localStorage.clear();
  refreshFromStorage();
  resetAuthHandling();
  stubFetch();
});

afterEach(() => {
  releaseHolders();
  unmount();
  vi.unstubAllGlobals();
});

/* ═════════════════ A 组 · queries/auth 三工厂（A-50 #129 唯一份） ═════════════════ */

describe('A 组 · 登录域 mutation 工厂', () => {
  it('A-01 login 工厂：POST /api/login，体只有契约字段，响应过 AuthResultSchema', async () => {
    const options = loginMutationOptions();
    const facts = await options.mutationFn!({ phone: PHONE, password: WRONG_PWD }, undefined as never);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toContain('/api/login');
    expect(fetchCalls[0]!.method).toBe('POST');
    expect(fetchCalls[0]!.body).toEqual({ phone: PHONE, password: WRONG_PWD });
    expect(facts.token).toBe('tk-19b');
  });

  it('A-02 register 工厂：POST /api/register，agreed 如实转发（判据⑨ 的服务端防御面）', async () => {
    const options = registerMutationOptions();
    const facts = await options.mutationFn!({
      phone: PHONE,
      password: PWD,
      confirmPassword: PWD,
      agreed: true,
    }, undefined as never);
    expect(fetchCalls[0]!.url).toContain('/api/register');
    expect(fetchCalls[0]!.body).toEqual({ phone: PHONE, password: PWD, confirmPassword: PWD, agreed: true });
    expect(facts.activated).toBe(true);
  });

  it('A-03 send-code 工厂：POST /api/send-code；通道未接的 200 附码原样回给屏侧、不当成失败', async () => {
    const options = sendCodeMutationOptions();
    const payload = await options.mutationFn!({ phone: PHONE }, undefined as never);
    expect(fetchCalls[0]!.url).toContain('/api/send-code');
    expect(fetchCalls[0]!.body).toEqual({ phone: PHONE });
    expect(payload).toMatchObject({ code: 'SMS_NOT_CONFIGURED' });
  });

  it('A-04 login 响应缺必填键 → BAD_RESPONSE（服务端形状漂移在 App 测试里立刻红，§5.2）', async () => {
    responses.login = { status: 200, body: { token: 'tk' } };
    const options = loginMutationOptions();
    await expect(options.mutationFn!({ phone: PHONE, password: PWD }, undefined as never)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });
});

/* ═════════════════ B 组 · 源码哨兵（判据① + 零自造 + Chrome84 四禁） ═════════════════ */

describe('B 组 · 源码哨兵机检', () => {
  it('B-01 屏与数据层：复用壳、0 自写控件/存储/状态码判定/四禁，话术零自造（CJK 0 命中）', () => {
    const screen = stripComments(readSrc('../src/screens/LoginScreen.tsx'));
    const queries = stripComments(readSrc('../src/data/queries/auth.ts'));

    // 判据①：必须 import 壳；屏内自写 <input = 0。
    expect(screen).toMatch(/AuthFormShell/);
    expect(screen).not.toMatch(/<input/);
    // 话术零自造：剥注释后屏与数据层都没有任何中文字面量；也不引 ui 私有路径。
    expect(screen).not.toMatch(/[\u4e00-\u9fff]/);
    expect(queries).not.toMatch(/[\u4e00-\u9fff]/);
    expect(screen).not.toMatch(/from '@tm\/ui\/auth/);
    // 失败面：0 命中 `=== 401`、0 命中 `handleAuthError(`；判定不在屏上重做。
    expect(screen).not.toMatch(/=== 40[0-9]/);
    expect(screen).not.toMatch(/handleAuthError\(/);
    // token 唯一走 auth-store：屏内 0 存储 API / 桥 / 直发请求。
    expect(screen).not.toMatch(/localStorage|sessionStorage|AndroidBridge|saveToken/);
    expect(screen).not.toMatch(/fetch\(|apiPost|apiGet|apiRequest/);
    // Chrome84 四禁（§5.1 / tm-app:dist-guard），两个文件一起钉。
    for (const code of [screen, queries]) {
      expect(code).not.toMatch(/structuredClone|Object\.hasOwn|requestIdleCallback|\.at\(/);
    }
  });

  it('B-02 数据层：五个端点各恰一处、三处都关单点登出、普通改密恰一份且端点唯一', () => {
    const queries = stripComments(readSrc('../src/data/queries/auth.ts'));
    expect(queries.match(/'\/api\/login'/g)).toHaveLength(1);
    expect(queries.match(/'\/api\/register'/g)).toHaveLength(1);
    expect(queries.match(/'\/api\/send-code'/g)).toHaveLength(1);
    expect(queries.match(/handleAuthError: false/g)).toHaveLength(3);
    expect(queries).toMatch(/LoginInputSchema/);
    expect(queries).toMatch(/RegisterInputSchema/);
    expect(queries).toMatch(/SendCodeInputSchema/);
    expect(queries).toMatch(/AuthResultSchema/);
    /**
     * T-19d 改判（A-61 #169 三件套，逐件在此明示）：
     *  ① **反向改判** —— 原判"普通改密面不得出现"（`not.toMatch(/ChangePasswordInputSchema|'\/api\/password'/)`）
     *    的前提出自 T-19b 文件头那句"改密面的 mutation 由需要它的那一轮再加"。**需要它的那一轮 = T-19d 已到**，
     *    旧命题就此失效并翻成正面钉：恰一份工厂 + 唯一端点（`'\/api\/password'` 的闭合引号让它不被
     *    `'/api/password/force'` 顶掉，两面互不吞并）。
     *  ② **拦截断言不得变少** —— 翻正之后本用例的 `not.toMatch` 从 2 条变 3 条（原 `fetch|localStorage`
     *    一条未动，另把被翻掉的那条换成"假想第三面不得预写"），正面计数从 7 条增到 11 条。
     *  ③ **明示声明** —— 本条改判由交付记录 T-19-d §② 的"peer 哨兵改判"一节逐句交底（原件已移出仓库）；
     *    同轮另在 `security-screen.spec.tsx` A-06 / I-04 独立钉一遍，两处不互相背书。
     */
    expect(queries.match(/export function changePasswordMutationOptions/g)).toHaveLength(1);
    expect(queries.match(/'\/api\/password'/g)).toHaveLength(1);
    expect(queries.match(/parseWith\(ChangePasswordInputSchema\)/g)).toHaveLength(1);
    expect(queries.match(/forceUpgradeMutationOptions/g)).toHaveLength(1);
    expect(queries.match(/'\/api\/password\/force'/g)).toHaveLength(1);
    // 仍禁预写的只剩"假想的第三面"：本期改密永远只有两面（普通 / 强制），没有找回、重置、免验旧。
    expect(queries).not.toMatch(/ResetPassword|ForgotPassword|recover|'\/api\/password\/(?:reset|forgot|recovery)'/);
    expect(queries).not.toMatch(/fetch\(|localStorage/);
  });

  it('B-03 E5c 判定面的源码哨兵：数据层 0 处按 content-type 字符串名判定（唯一事实 = 能不能 JSON.parse），屏内 0 处状态码分支', () => {
    const fetcher = stripComments(readSrc('../src/data/rest-fetcher.ts'));
    const screen = stripComments(readSrc('../src/screens/LoginScreen.tsx'));
    // 「响应体不是 JSON」可判别的三件标记都必须在位（件①）。
    expect(fetcher).toMatch(/isJson:\s*true/);
    expect(fetcher).toMatch(/isJson:\s*false/);
    expect(fetcher).toMatch(/__raw:\s*true/);
    // 而这一族写法一旦出现在判定面就等于按 MIME 名字猜：必红。
    expect(fetcher).not.toMatch(/headers[\s\S]*?\.get\s*\(\s*['"`]content-type/i);
    expect(fetcher).not.toMatch(/['"`]text\/plain['"`]/);
    // 屏侧只调判定单点、话术只从 shared 常量取（件③：0 处状态码字面量、0 处第二句）。
    expect(screen).toMatch(/isMissingEndpoint\(/);
    expect(screen).toMatch(/PLAIN_TERMS\.unknownEndpoint/);
    expect(screen).not.toMatch(/status\s*[=!]==?\s*40/);
    expect(screen).not.toMatch(/404|405/);
  });
});

/* ═════════════════ C 组 · 壳复用面 + 判据⑨ + 校验话术取源 ═════════════════ */

describe('C 组 · 渲染与校验', () => {
  it('C-01 渲染的是壳：标题/入口小字/公告/登录态告知全部等于 shared 常量，登录态无勾选框', async () => {
    render();
    expect(q('form[data-testid=login-screen-form]')).not.toBeNull();
    expect(byTestId<HTMLElement>('auth-title')!.textContent).toBe(AUTH_COPY.dialog.login);
    expect(byTestId<HTMLElement>('sms-entry')!.textContent).toBe(AUTH_COPY.smsEntryLabel);
    expect(byTestId<HTMLElement>('sms-hint')!.textContent).toBe(AUTH_COPY.smsHint);
    expect(container.textContent).toContain(LOGIN_METHOD_NOTICE);
    expect(byTestId<HTMLElement>('login-agreement-note')!.textContent).toBe(AUTH_COPY.agreementSignInNote);
    expect(q('[data-testid=field-phone] input')).not.toBeNull();
    expect(q('[role=checkbox]')).toBeNull(); // A-23-5：勾选框只属注册态
  });

  it('C-02 手机号判定与话术取 TM_ERRORS.INVALID_PHONE.copy，且 0 请求出门', async () => {
    render();
    const el = phoneInput();
    await fill(el, '1234567');
    await blur(el);
    expect(alertOf('[data-testid=field-phone]')).toBe(TM_ERRORS.INVALID_PHONE.copy);
    expect(fetchCalls).toHaveLength(0);
  });

  it('C-03 登录态短密码：验密码面不拦（R-40④ 强制改密链的入口），alert 空且请求发得出 /api/login', async () => {
    render();
    await fill(phoneInput(), PHONE);
    const pwd = passwordInput();
    await fill(pwd, '123');
    await blur(pwd);
    /* T-29r 改判（原钉"登录态弱密码话术取 `TM_ERRORS.WEAK_PASSWORD.copy`" = 旧行为，
       那句话字面是"至少 8 位"，在验密码面语义反向且再触 R-40④）：
       登录态唯一的强度侧门槛是"空 / 纯空格"，短密码必须原样发出去，
       否则服务端 `PASSWORD_UPGRADE_REQUIRED` 那条链在本端永不可达（E 组就是它的下游）。 */
    expect(alertOf('[data-testid=field-password]')).toBeNull();
    await submitForm();
    const login = fetchCalls.filter((call) => call.url.includes('/api/login'));
    expect(login).toHaveLength(1);
    expect(login[0]?.body).toEqual({ phone: PHONE, password: '123' });
  });

  it('C-04 判据⑨：未勾协议主按钮禁用 + role=alert 可读原因 + 0 请求；勾上后同一表单可提交', async () => {
    render();
    await toRegister();
    expect(q('[role=checkbox]')).not.toBeNull(); // 勾选件 = 壳内 AgreementCheckbox
    await fill(phoneInput(), PHONE);
    await fill(passwordInput(), PWD);
    await fill(confirmInput()!, PWD);
    const submit = byTestId<HTMLElement>('auth-submit')!;
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    await submitForm();
    const err = q('[data-slot=agreement-error]');
    expect(err).not.toBeNull();
    expect(err!.getAttribute('role')).toBe('alert');
    expect(err!.textContent).toBe(TM_ERRORS.AGREEMENT_REQUIRED.copy);
    expect(authFetches()).toHaveLength(0);
    await click(q('[role=checkbox]')!);
    await submitForm();
    expect(authFetches()).toHaveLength(1);
    expect(authFetches()[0]!.url).toContain('/api/register');
  });

  it('C-05 注册态两次密码不一致话术取 TM_ERRORS.PASSWORD_MISMATCH.copy 且提交不出网', async () => {
    render();
    await toRegister();
    await click(q('[role=checkbox]')!);
    await fill(phoneInput(), PHONE);
    await fill(passwordInput(), PWD);
    const confirm = confirmInput()!;
    await fill(confirm, WRONG_PWD);
    await blur(confirm);
    expect(alertOf('[data-testid=field-confirm]')).toBe(TM_ERRORS.PASSWORD_MISMATCH.copy);
    await submitForm();
    expect(authFetches()).toHaveLength(0);
  });
});

/* ═════════════════ D 组 · 成功面走 auth-store 既有落点（判据②） ═════════════════ */

describe('D 组 · 登录成功', () => {
  it('D-01 成功只走 signIn()：token/身份落既有键、快照当帧 signed-in、单跳首页', async () => {
    render();
    await fillSignIn();
    await submitForm();
    expect(fetchCalls.filter((call) => call.url.includes('/api/login'))).toHaveLength(1);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe('tk-19b');
    expect(localStorage.getItem(SESSION_KEYS.phone)).toBe(PHONE);
    expect(getAuthSnapshot().status).toBe('signed-in');
    expect(navigateCalls).toEqual(['/']);
  });

  it('D-02 待续作 open 动作：成功后续作到原目标并取出即清（R-16②）', async () => {
    rememberPendingAction({ kind: 'open', path: '/lookup?word=apple' });
    render();
    await fillSignIn();
    await submitForm();
    expect(navigateCalls).toEqual(['/lookup?word=apple']);
    expect(peekPendingAction()).toBeNull();
  });

  it('D-03 注册成功与登录同一个落点（R-39① 激活不分叉）', async () => {
    render();
    await toRegister();
    await click(q('[role=checkbox]')!);
    await fill(phoneInput(), PHONE);
    await fill(passwordInput(), PWD);
    await fill(confirmInput()!, PWD);
    await submitForm();
    expect(localStorage.getItem(SESSION_KEYS.token)).toBe('tk-19b-reg');
    expect(getAuthSnapshot().status).toBe('signed-in');
    expect(navigateCalls).toEqual(['/']);
  });
});

/* ═════════════════ E 组 · R-40④ 入口在本屏 ═════════════════ */

describe('E 组 · 强制改密入口', () => {
  it('E-01 服务端回 PASSWORD_UPGRADE_REQUIRED(403)：跳改密页、不写 token、不进应用', async () => {
    responses.login = {
      status: 403,
      body: { error: TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy, code: 'PASSWORD_UPGRADE_REQUIRED' },
    };
    render();
    await fillSignIn();
    await submitForm();
    expect(navigateCalls).toEqual([UPGRADE_PASSWORD_ROUTE]);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    expect(getAuthSnapshot().status).toBe('signed-out');
    // 单点登出没被触发（rest-fetcher 一次都没被允许消化这一码）。
    expect(fetchCalls).toHaveLength(1);
  });

  it('E-02 200 空 token + upgrade_required：临时凭据交 auth-store，正常 token 仍不写、不进应用', async () => {
    responses.login = {
      status: 200,
      body: {
        token: '',
        phone: PHONE,
        hasPassword: false,
        nickname: '',
        avatar: '',
        upgrade_required: true,
        upgradeToken: 'up-19b',
      },
    };
    render();
    await fillSignIn();
    await submitForm();
    expect(navigateCalls).toEqual([UPGRADE_PASSWORD_ROUTE]);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeFalsy();
    expect(hasUpgradeToken()).toBe(true);
    expect(getAuthSnapshot().status).toBe('signed-out');
    expect(getAuthSnapshot().upgradeSessionOnly).toBe(true);
  });
});

/* ═════════════════ F 组 · 失败面人话（话术唯一源） ═════════════════ */

describe('F 组 · 失败面', () => {
  it('F-01 无码 401（防枚举）：显示服务端 error 原文（shared 同源串），不清凭据不跳转', async () => {
    responses.login = { status: 401, body: { error: AUTH_COPY.wrongCredential } };
    render();
    await fillSignIn();
    await submitForm();
    expect(formErrorText()).toBe(AUTH_COPY.wrongCredential);
    expect(byTestId<HTMLElement>('auth-form-error')!.getAttribute('role')).toBe('alert');
    expect(navigateCalls).toEqual([]);
    expect(getAuthSnapshot().status).toBe('signed-out');
  });

  it('F-02 429 TOO_MANY_REQUESTS：人话取 TM_ERRORS 常量（屏内无第二份话术）', async () => {
    responses.login = {
      status: 429,
      body: { error: 'stub', code: 'TOO_MANY_REQUESTS' },
    };
    render();
    await fillSignIn();
    await submitForm();
    expect(formErrorText()).toBe(TM_ERRORS.TOO_MANY_REQUESTS.copy);
    expect(navigateCalls).toEqual([]);
  });

  it('F-03 NO_PASSWORD_ACCOUNT(401)：走壳的提示卡 + 动作可切到激活态（§3.9.5 逐码落点在壳内）', async () => {
    responses.login = {
      status: 401,
      body: { error: TM_ERRORS.NO_PASSWORD_ACCOUNT.copy, code: 'NO_PASSWORD_ACCOUNT' },
    };
    render();
    await fillSignIn();
    await submitForm();
    const card = byTestId<HTMLElement>('auth-notice-card');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(TM_ERRORS.NO_PASSWORD_ACCOUNT.copy);
    expect(navigateCalls).toEqual([]);
    await click(clickableByText(AUTH_COPY.noPasswordAccount.action));
    await settle(2);
    expect(byTestId<HTMLElement>('auth-title')!.textContent).toBe(AUTH_COPY.dialog.activate);
  });

  it('F-04 网络断：话术取 PLAIN_TERMS.connectionDown（rest-fetcher 既有单点），不跳转', async () => {
    responses.login = { status: 0, body: null, down: true };
    render();
    await fillSignIn();
    await submitForm();
    expect(formErrorText()).toBe(PLAIN_TERMS.connectionDown);
    expect(navigateCalls).toEqual([]);
  });

  it('F-05 提交期间防重复：挂住响应再提交一次，登录请求恒为 1，主按钮 disabled + 表单 aria-busy', async () => {
    holdLogin = true;
    render();
    await fillSignIn();
    await submitForm();
    await submitForm();
    const loginPosts = fetchCalls.filter((call) => call.url.includes('/api/login'));
    expect(loginPosts).toHaveLength(1);
    expect(byTestId<HTMLButtonElement>('auth-submit')!.disabled).toBe(true);
    expect(q('form[data-testid=login-screen-form]')!.getAttribute('aria-busy')).toBe('true');
    releaseHolders();
    await settle();
    expect(getAuthSnapshot().status).toBe('signed-in');
  });

  /* ── E5c：线上那台旧服务端没有 `/api/register` 这颗路由（实测 404 + `text/plain` + 裸文本
      `404 Not Found`）。屏上⛔ 出现上游原文，也⛔ 反过来把服务端自己给的人话盖掉。 ── */

  it('F-06 注册 404 + 裸文本：message 取 PLAIN_TERMS.unknownEndpoint，屏上 0 命中上游原文，落点仍是既有 serverMessage 槽（0 新增码）', async () => {
    resetRouterForTest(REGISTER_ROUTE);
    responses.register = { status: 404, body: null, raw: '404 Not Found' };
    render();
    await click(q('[role=checkbox]')!);
    await fill(phoneInput(), PHONE);
    await fill(passwordInput(), PWD);
    await fill(confirmInput()!, PWD);
    await submitForm();
    expect(fetchCalls.filter((call) => call.url.includes('/api/register'))).toHaveLength(1);
    expect(formErrorText()).toBe(PLAIN_TERMS.unknownEndpoint);
    expect(container.textContent).not.toContain('404 Not Found');
    // `ScreenFailure.code` 取的是既有值（HTTP_ERROR 不是 TM 码）⇒ 壳走 serverMessage 兜底槽，
    // §3.9.5 的逐码提示卡与字段落点一颗都不许多出现（"第 7 颗码"若被新增，这两条必红）。
    expect(byTestId<HTMLElement>('auth-notice-card')).toBeNull();
    expect(alertOf('[data-testid=field-phone]')).toBeNull();
    expect(navigateCalls).toEqual([]);
    expect(getAuthSnapshot().status).toBe('signed-out');
  });

  it('F-07 反证（必红反证）：400 + 合法 JSON 的服务端人话 ⇒ 显示服务端那句，定稿串不得一刀切盖掉', async () => {
    const SERVER_LINE = '请输入手机号';
    responses.login = { status: 400, body: { error: SERVER_LINE } };
    render();
    await fillSignIn();
    await submitForm();
    expect(formErrorText()).toBe(SERVER_LINE);
    expect(container.textContent).not.toContain(PLAIN_TERMS.unknownEndpoint);
  });

  it('F-08 注册 405（件③ 的另一支）：定稿串，上游那句英文原文 0 命中', async () => {
    resetRouterForTest(REGISTER_ROUTE);
    responses.register = { status: 405, body: { error: 'Method Not Allowed' } };
    render();
    await click(q('[role=checkbox]')!);
    await fill(phoneInput(), PHONE);
    await fill(passwordInput(), PWD);
    await fill(confirmInput()!, PWD);
    await submitForm();
    expect(formErrorText()).toBe(PLAIN_TERMS.unknownEndpoint);
    expect(container.textContent).not.toContain('Method Not Allowed');
  });
});

/* ═════════════════ G 组 · 验证码入口（发码 mutation） ═════════════════ */

describe('G 组 · 发码', () => {
  it('G-01 点入口：POST /api/send-code 带已输入手机号；200 附码不跳转、不 toast、不写 token', async () => {
    render();
    await fill(phoneInput(), PHONE);
    await click(byTestId<HTMLElement>('sms-entry')!);
    await settle();
    const posts = fetchCalls.filter((call) => call.url.includes('/api/send-code'));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.method).toBe('POST');
    expect(posts[0]!.body).toEqual({ phone: PHONE });
    expect(navigateCalls).toEqual([]);
    expect(toastCalls).toEqual([]);
    expect(localStorage.getItem(SESSION_KEYS.token)).toBeNull();
    // 通道未接的就地反馈由 SmsCodeEntry 单点承担（AUTH_COPY.smsResult）。
    expect(byTestId<HTMLElement>('sms-result')!.textContent).toBe(AUTH_COPY.smsResult);
  });

  it('G-02 发码真失败（429）才 toast，话术走 apiErrorMessage 既有一致源', async () => {
    responses['send-code'] = { status: 429, body: { error: 'stub', code: 'TOO_MANY_REQUESTS' } };
    render();
    await fill(phoneInput(), PHONE);
    await click(byTestId<HTMLElement>('sms-entry')!);
    await settle();
    expect(toastCalls).toEqual([TM_ERRORS.TOO_MANY_REQUESTS.copy]);
    expect(navigateCalls).toEqual([]);
  });
});

/* ═════════════════ H 组 · 路由驱动 mode 初值（E5-register：`#/register` 首帧即注册态） ═════════════════ */

describe('H 组 · 路由派生的 mode 初值', () => {
  it('H-01 `#/register`：首帧即注册态 —— 标题/提交钮串 = AUTH_COPY 注册常量、协议勾选件在、0 请求', async () => {
    resetRouterForTest(REGISTER_ROUTE);
    render();
    expect(byTestId<HTMLElement>('auth-title')!.textContent).toBe(AUTH_COPY.dialog.register);
    expect(byTestId<HTMLElement>('auth-submit')!.textContent).toBe(AUTH_COPY.submit.register);
    expect(q('[role=checkbox]')).not.toBeNull(); // 勾选件 = 壳内 AgreementCheckbox，首帧就在（判据⑨ 的面不因入口变化）
    expect(byTestId<HTMLElement>('login-agreement-note')).toBeNull(); // 登录态告知只属登录态
    expect(fetchCalls).toHaveLength(0);
  });

  it('H-02 `#/login`：首帧仍是登录态（既有默认行为不许翻面）', async () => {
    resetRouterForTest(LOGIN_ROUTE);
    render();
    expect(byTestId<HTMLElement>('auth-title')!.textContent).toBe(AUTH_COPY.dialog.login);
    expect(byTestId<HTMLElement>('auth-submit')!.textContent).toBe(AUTH_COPY.submit.login);
    expect(q('[role=checkbox]')).toBeNull(); // A-23-5：勾选框只属注册态
    expect(byTestId<HTMLElement>('login-agreement-note')!.textContent).toBe(AUTH_COPY.agreementSignInNote);
    // 驱动源只认 path：`?mode=register` 这颗本轮清掉的死参就算被手敲回来也不得翻面
    resetRouterForTest('/login?mode=register');
    unmount();
    render();
    expect(q('[role=checkbox]')).toBeNull();
  });
});

/** 按可见文字找可点元素（同 wordbook spec 的既有夹具形状，不引入新 DOM 约定）。 */
function clickableByText(label: string): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('button, a')).find(
    (one) => (one.textContent ?? '').trim() === label,
  );
  if (!el) throw new Error('clickable not found: ' + label);
  return el;
}

/** A-04 的补充锚：确认数据层抛的是 ApiError（屏侧 failureOf 依赖 isApiError 单点）。 */
it('A-05 BAD_RESPONSE 抛的是 ApiError 形状', async () => {
  responses.login = { status: 200, body: { token: 'tk' } };
  const options = loginMutationOptions();
  try {
    await options.mutationFn!({ phone: PHONE, password: PWD }, undefined as never);
    expect.unreachable('should reject');
  } catch (error) {
    expect(isApiError(error)).toBe(true);
  }
});
