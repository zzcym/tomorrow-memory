/**
 * T-14 判据④（架构 §5.2 第 2 条规矩）：`rest-fetcher` 对
 *  - `401 CREDENTIAL_EXPIRED` → 清凭据 + 广播登出 + 去登录页
 *  - `403 PASSWORD_UPGRADE_REQUIRED` → 广播 + 跳强制改密页
 * 的**单点**处理：动作只在这一处发生，且并发一串请求同时命中时只发生一次。
 *
 * 断言里不写字面文案：期望值一律取自 `@tm/shared`（`TM_ERRORS[code].clientAction`）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAIN_TERMS, SYNC_COPY, TM_ERRORS } from '@tm/shared';
import {
  API_BASE,
  type ApiError,
  apiErrorMessage,
  apiGet,
  apiPost,
  bindNavigation,
  handleAuthError,
  hasCredential,
  isApiError,
  isMissingEndpoint,
  onAuthSignal,
  resetAuthHandling,
  type AuthSignal,
} from '../src/data/rest-fetcher.js';
import { TOKEN_KEY, clearCredential, readToken, writeToken } from '../src/native/bridge.js';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** 上游"没这颗路由"的真实形状：状态码 + 裸文本（`content-type: text/plain`，body 就是 `404 Not Found`）。 */
const rawText = (status: number, body: string, contentType = 'text/plain'): Response =>
  new Response(body, { status, headers: { 'Content-Type': contentType } });

const jsonBody = (body: unknown): string => JSON.stringify(body);

/** 每次装一个假的 `fetch`，把响应交给用例决定，并记录收到的请求。 */
function stubFetch(...responses: Array<() => Response>): {
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return next ? next() : json(200, { ok: true });
    }),
  );
  return { calls };
}

let signals: AuthSignal[];
let routes: string[];
let unbindSignal: () => void;

/** 抑制窗口是 1500ms（真实时钟 = 纪元毫秒），用例里的时间戳也照真实量级给。 */
const T0 = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
  signals = [];
  routes = [];
  unbindSignal?.();
  unbindSignal = onAuthSignal((s) => signals.push(s));
  bindNavigation((to) => routes.push(to));
  resetAuthHandling();
});

afterEach(() => {
  vi.unstubAllGlobals();
  unbindSignal();
});

describe('判据④-1 handleAuthError：401 CREDENTIAL_EXPIRED', () => {
  it('契约前提：该码的 clientAction 就是"清凭据 + 去登录页"（改了就会红）', () => {
    expect(TM_ERRORS.CREDENTIAL_EXPIRED.clientAction).toBe('clear-credential-and-login');
    expect(TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.clientAction).toBe('goto-upgrade-password');
  });

  it('清凭据 + 广播 sign-out + 去登录页，并返回"已消化"', () => {
    writeToken('tok-1');
    expect(readToken()).toBe('tok-1');

    const handled = handleAuthError(401, 'CREDENTIAL_EXPIRED', T0);

    expect(handled).toBe(true);
    expect(readToken()).toBe('');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(signals).toEqual(['sign-out']);
    expect(routes).toEqual(['/login']);
  });

  it('并发命中只处理一次（第 2、3 个请求仍算"已被本层消化"，但不再清/不再跳）', () => {
    writeToken('tok-1');
    expect(handleAuthError(401, 'CREDENTIAL_EXPIRED', T0)).toBe(true);
    expect(handleAuthError(401, 'CREDENTIAL_EXPIRED', T0 + 400)).toBe(true);
    expect(handleAuthError(401, 'CREDENTIAL_EXPIRED', T0 + 900)).toBe(true);
    expect(signals).toEqual(['sign-out']);
    expect(routes).toEqual(['/login']);
  });

  it('超出抑制窗口后可以再处理一次（下一次会话的 401 不能被上一次吞掉）', () => {
    writeToken('tok-1');
    handleAuthError(401, 'CREDENTIAL_EXPIRED', T0 + 5_000);
    writeToken('tok-2');
    handleAuthError(401, 'CREDENTIAL_EXPIRED', T0 + 7_000);
    expect(signals).toEqual(['sign-out', 'sign-out']);
    expect(routes).toEqual(['/login', '/login']);
  });
});

describe('判据④-2 handleAuthError：403 PASSWORD_UPGRADE_REQUIRED', () => {
  it('广播 + 跳强制改密页，且**不清**凭据（改密页要用临时 token 提交）', () => {
    writeToken('tok-1');

    expect(handleAuthError(403, 'PASSWORD_UPGRADE_REQUIRED', T0)).toBe(true);

    expect(signals).toEqual(['password-upgrade-required']);
    expect(routes).toEqual(['/upgrade-password']);
    expect(readToken()).toBe('tok-1');
  });

  it('状态码与码不配对时不消化：401 只认 CREDENTIAL_EXPIRED，403 只认 PASSWORD_UPGRADE_REQUIRED', () => {
    expect(handleAuthError(401, 'PASSWORD_UPGRADE_REQUIRED', T0)).toBe(false);
    expect(handleAuthError(403, 'CREDENTIAL_EXPIRED', T0)).toBe(false);
    expect(handleAuthError(401, 'WORD_NOT_FOUND', T0)).toBe(false);
    expect(handleAuthError(401, undefined, T0)).toBe(false);
    expect(signals).toEqual([]);
    expect(routes).toEqual([]);
  });

  it('其它认证类码（如 PHONE_ALREADY_REGISTERED）留给页面自己处理，不触发登出', () => {
    writeToken('tok-1');
    expect(handleAuthError(400, 'PHONE_ALREADY_REGISTERED', T0)).toBe(false);
    expect(signals).toEqual([]);
    expect(readToken()).toBe('tok-1');
  });
});

describe('判据④-3 走完整请求链路时的单点处理', () => {
  it('GET 带 Bearer、不带 cookie、GET 不发 Content-Type（file:// 的 CORS 前提）', async () => {
    writeToken('tok-1');
    const { calls } = stubFetch(() => json(200, { ok: true }));

    await apiGet('/api/profile', { auth: true });

    const init = calls[0]?.init as RequestInit;
    expect(calls[0]?.url).toBe(`${API_BASE}/api/profile`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('POST 带 JSON Content-Type，响应体仍原样发给服务端', async () => {
    const { calls } = stubFetch(() => json(200, { ok: true }));
    await apiPost('/api/lookup', { word: 'apple' });
    const init = calls[0]?.init as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(jsonBody({ word: 'apple' }));
  });

  it('401 CREDENTIAL_EXPIRED：请求侧抛带码的 ApiError，同时单点动作只发生一次', async () => {
    writeToken('tok-1');
    stubFetch(() => json(401, { error: 'x', code: 'CREDENTIAL_EXPIRED' }));

    const error = await apiGet('/api/wordbook').catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect((error as ApiError).code).toBe('CREDENTIAL_EXPIRED');
    expect((error as ApiError).status).toBe(401);
    // 服务端原文只进诊断面；给用户看的那一句一律回落到 `@tm/shared` 的定稿人话（判据④ 的"单点"）
    expect(apiErrorMessage(error)).toBe(TM_ERRORS.CREDENTIAL_EXPIRED.copy);
    expect(signals).toEqual(['sign-out']);
    expect(routes).toEqual(['/login']);
  });

  it('三条并发请求同时 401 → 只有一次登出广播（"单点"的并发面）', async () => {
    writeToken('tok-1');
    stubFetch(() => json(401, { error: 'x', code: 'CREDENTIAL_EXPIRED' }));

    const settled = await Promise.allSettled([
      apiGet('/api/wordbook'),
      apiGet('/api/review/queue'),
      apiGet('/api/profile'),
    ]);

    expect(settled.every((r) => r.status === 'rejected')).toBe(true);
    expect(signals).toEqual(['sign-out']);
    expect(routes).toEqual(['/login']);
  });

  it('403 PASSWORD_UPGRADE_REQUIRED → 跳强制改密页，不登出', async () => {
    writeToken('tok-1');
    stubFetch(() => json(403, { error: 'x', code: 'PASSWORD_UPGRADE_REQUIRED' }));

    const error = await apiGet('/api/profile').catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('PASSWORD_UPGRADE_REQUIRED');
    expect(signals).toEqual(['password-upgrade-required']);
    expect(routes).toEqual(['/upgrade-password']);
    expect(hasCredential()).toBe(true);
  });

  it('登录接口自己的 401 不当作凭据过期（handleAuthError:false），不广播不清凭据', async () => {
    writeToken('keep-me');
    stubFetch(() => json(401, { error: 'x', code: 'CREDENTIAL_EXPIRED' }));

    const error = await apiPost(
      '/api/login',
      { phone: '1', password: '2' },
      { auth: false, handleAuthError: false },
    ).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(signals).toEqual([]);
    expect(routes).toEqual([]);
    expect(readToken()).toBe('keep-me');
  });

  it('服务端没给 code 的 401 → 也按凭据过期处理不了，只抛 HTTP 侧错误（不误清凭据）', async () => {
    writeToken('tok-1');
    stubFetch(() => json(401, { error: 'nope' }));

    const error = await apiGet('/api/profile').catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('HTTP_ERROR');
    expect(signals).toEqual([]);
    expect(readToken()).toBe('tok-1');
  });

  it('网络层失败 → NETWORK + 人话文案，不碰认证态', async () => {
    writeToken('tok-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed fetch');
      }),
    );

    const error = await apiGet('/api/profile').catch((e: unknown) => e);

    expect((error as ApiError).code).toBe('NETWORK');
    expect(signals).toEqual([]);
    expect(routes).toEqual([]);
    expect(readToken()).toBe('tok-1');
  });

  it('契约形状不符 → BAD_RESPONSE（服务端漂移在 App 测试里就红，§5.2"代价明示"）', async () => {
    stubFetch(() => json(200, { unexpected: 1 }));
    const error = await apiGet('/api/wordbook', undefined, (raw) => {
      if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('bad shape');
      return raw;
    }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('BAD_RESPONSE');
  });

  it('无 token 时 auth:true 本地即失败，一次请求都不发（弱网下不占重试额度）', async () => {
    const { calls } = stubFetch(() => json(200, { ok: true }));
    const error = await apiGet('/api/wordbook', { auth: true }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('NO_AUTH');
    expect(calls).toHaveLength(0);
  });
});

describe('判据④-4 清凭据的另一半：clearCredential', () => {
  it('token / 手机号 / 昵称 / 临时 token 一次清干净', () => {
    writeToken('tok-1');
    localStorage.setItem('tm.phone', '138');
    localStorage.setItem('tm.tempToken', 'tmp');
    expect(hasCredential()).toBe(true);

    clearCredential();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('tm.phone')).toBeNull();
    expect(localStorage.getItem('tm.tempToken')).toBeNull();
    expect(hasCredential()).toBe(false);
  });
});

/* ═════════════════ E5c：上游响应体不是合法 JSON 时，原文永不上屏 ═════════════════ */

describe('E5c 判据：裸文本 / HTML 错误页的可判别形状与人话取串', () => {
  it('E-01 线上缺陷本体（POST /api/register 回 404 + `404 Not Found` 裸文本）：形状可判别、人话取定稿那颗', async () => {
    stubFetch(() => rawText(404, '404 Not Found'));

    const error = await apiPost(
      '/api/register',
      { phone: '13800000001', password: 'Passw0rd!' },
      { handleAuthError: false },
    ).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    const api = error as ApiError;
    // 码与状态都不新造：仍是既有的 HTTP_ERROR + 上游状态码（屏侧 code 取值的份数不变）。
    expect(api.code).toBe('HTTP_ERROR');
    expect(api.status).toBe(404);
    // 件①：原文锁在带标记的 `__raw.text` 里（⛔ 旧的 `{error:'404 Not Found'}` 冒充服务端信封）。
    expect(api.body).toEqual({ __raw: true, text: '404 Not Found' });
    expect(isMissingEndpoint(api)).toBe(true);
    // 件②：message 与取串助手同一颗定稿串 ⇒ 屏上不可能再出现上游原文。
    expect(api.message).toBe(PLAIN_TERMS.unknownEndpoint);
    expect(apiErrorMessage(api)).toBe(PLAIN_TERMS.unknownEndpoint);
  });

  it('E-02 反证（必红反证）：上游回的是合法 JSON 的人话 ⇒ 原样显示，⛔ 被定稿串一刀切盖掉', async () => {
    stubFetch(() => json(400, { error: '请输入手机号' }));

    const error = await apiPost('/api/login', {}, { handleAuthError: false }).catch((e: unknown) => e);

    const api = error as ApiError;
    expect(api.code).toBe('HTTP_ERROR');
    expect(isMissingEndpoint(api)).toBe(false);
    expect(apiErrorMessage(api)).toBe('请输入手机号');
  });

  it('E-03 反证：判定只认"内容是不是合法 JSON"，⛔ 按 content-type 字符串名匹配（同一坨 JSON 挂 text/plain 仍是服务端人话）', async () => {
    stubFetch(() =>
      rawText(400, JSON.stringify({ error: '请输入手机号' }), 'text/plain; charset=UTF-8'),
    );

    const error = await apiPost('/api/login', {}, { handleAuthError: false }).catch((e: unknown) => e);

    const api = error as ApiError;
    expect(api.body).toEqual({ error: '请输入手机号' });
    expect(isMissingEndpoint(api)).toBe(false);
    expect(apiErrorMessage(api)).toBe('请输入手机号');
  });

  it('E-04 405 同样按"端点不存在"分流（件③ 的另一支）：定稿串，不显示上游那句英文', async () => {
    stubFetch(() => json(405, { error: 'Method Not Allowed' }));

    const error = await apiPost('/api/register', {}, { handleAuthError: false }).catch((e: unknown) => e);

    expect(isMissingEndpoint(error)).toBe(true);
    expect(apiErrorMessage(error)).toBe(PLAIN_TERMS.unknownEndpoint);
  });

  it('E-05 反向哨：上游回了契约码 ⇒ 那颗码的人话优先，定稿串不得盖它（404 + PHONE_ALREADY_REGISTERED）', async () => {
    stubFetch(() => json(404, { error: 'x', code: 'PHONE_ALREADY_REGISTERED' }));

    const error = await apiPost(
      '/api/register',
      { phone: '13800000001' },
      { handleAuthError: false },
    ).catch((e: unknown) => e);

    const api = error as ApiError;
    expect(api.code).toBe('PHONE_ALREADY_REGISTERED');
    expect(isMissingEndpoint(api)).toBe(false);
    expect(apiErrorMessage(api)).toBe(TM_ERRORS.PHONE_ALREADY_REGISTERED.copy);
  });

  it('E-06 500 + HTML 错误页：非 2xx 且不是 JSON ⇒ 同一颗定稿串（码仍是既有 BAD_RESPONSE）', async () => {
    stubFetch(() => rawText(500, '<html><body>500 Server Error</body></html>', 'text/html'));

    const error = await apiGet('/api/profile').catch((e: unknown) => e);

    const api = error as ApiError;
    expect(api.code).toBe('BAD_RESPONSE');
    expect(isMissingEndpoint(api)).toBe(true);
    expect(apiErrorMessage(api)).toBe(PLAIN_TERMS.unknownEndpoint);
  });

  it('E-07 件① 的正面：2xx 但响应体不是 JSON ⇒ 交回调用方的也是带标记形状，不冒充 `{error:...}`', async () => {
    stubFetch(() => rawText(200, 'OK'));
    expect(await apiGet('/api/ping')).toEqual({ __raw: true, text: 'OK' });
  });

  it('E-08 既有回落面未漂：合法 JSON 但不是错误信封（无 `error` 键）⇒ 仍是 serverBusy，⛔ 定稿串', async () => {
    stubFetch(() => json(400, { message: 'unexpected shape' }));

    const error = await apiPost('/api/login', {}, { handleAuthError: false }).catch((e: unknown) => e);

    const api = error as ApiError;
    expect(api.status).toBe(400);
    expect(isMissingEndpoint(api)).toBe(false);
    expect(apiErrorMessage(api)).toBe(SYNC_COPY.serverBusy);
  });
});
