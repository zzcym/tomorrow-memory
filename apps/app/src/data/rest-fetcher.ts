/**
 * REST 数据层的唯一出口（架构 §5.2、S9）。
 *
 * 三条不可让的规矩（E5c 起加第 4 条）：
 *  1. **只有这个文件 `fetch`**（`data/queries/*` 一律经它， screens 不许直接调）；
 *  2. **单点错误处理**（判据④）：`401 CREDENTIAL_EXPIRED` → 清凭据 + 广播登出 + 去登录页；
 *     `403 PASSWORD_UPGRADE_REQUIRED` → 跳强制改密页。动作查的是
 *     `@tm/shared` 的 `TM_ERRORS[code].clientAction`（T-03 就是为这一处留的字段），
 *     本文件里**不写任何文案字面量**；
 *  3. `file://` 的 origin 是 `null` → 不带 cookie（`credentials:'omit'`），token 走 Header，
 *     GET 不发 `Content-Type`（少一次 CORS 预检，R-17⑤ 的前提是服务端白名单含 `null`）；
 *  4. **上游原文永不上屏**（E5c）：响应体不是合法 JSON（裸文本 `404 Not Found`、HTML 错误页）时
 *     ⛔ 把它塞进 `error` 键冒充服务端的错误信封，判定只看「`JSON.parse` 成不成」（`parseBody`），
 *     ⛔ 按 `content-type` 字符串名匹配；用户看到的那一句一律取 `PLAIN_TERMS.unknownEndpoint`
 *     （判定单点 `isMissingEndpoint()`，屏侧只调它，不自写状态码分支）。
 */

import {
  PLAIN_TERMS,
  SYNC_COPY,
  TM_ERRORS,
  TmErrorResponseBodySchema,
  errorMessage,
  isTmErrorCode,
  type TmErrorCode,
} from '@tm/shared';
import { clearCredential, readToken } from '../native/bridge.js';

export const API_BASE: string =
  (typeof globalThis !== 'undefined' && (globalThis as { __API_BASE__?: string }).__API_BASE__) ||
  'https://tmword.xyz';

/** 旧手写 App 的 12s 口径（`assets/api.js:49`），保持不变：中端机弱网下的实测值。 */
export const REQUEST_TIMEOUT_MS = 12000;

/** 客户端本地判定的码（服务端契约之外的失败面）。 */
export type ClientErrorCode = 'NETWORK' | 'TIMEOUT' | 'NO_AUTH' | 'BAD_RESPONSE' | 'HTTP_ERROR';

export class ApiError extends Error {
  readonly code: TmErrorCode | ClientErrorCode;
  readonly status: number;
  readonly body: unknown;

  constructor(
    code: TmErrorCode | ClientErrorCode,
    message: string,
    status = 0,
    body: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return !!value && typeof value === 'object' && (value as ApiError).name === 'ApiError';
}

/** 给用户看的那一句：服务端给了就用人家的，没给才回落到 @tm/shared 的定稿人话。 */
export function apiErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (isTmErrorCode(error.code)) return TM_ERRORS[error.code].copy;
    // E5c：上游没给人话（端点不存在 / 响应体不是合法 JSON）时取 `PLAIN_TERMS.unknownEndpoint`，
    // ⛔ 把裸文本 `404 Not Found` 原样当人话。判定单点在 `isMissingEndpoint()`，本函数只取串。
    if (isMissingEndpoint(error)) return PLAIN_TERMS.unknownEndpoint;
    return error.message;
  }
  return SYNC_COPY.serverBusy;
}

/**
 * 响应体**不是合法 JSON** 时的占位形状（E5c 件①）。
 *
 * 旧写法把 `res.text()` 的原文塞进 `{ error: <原文> }`，那正好长得像服务端的错误信封
 * （`TmErrorResponseBodySchema` 吃得住），于是 `404 Not Found` / 网关的 HTML 错误页
 * 一路畅通糊到用户屏幕上。现在原文只锁在 `text` 里（诊断面 `ApiError.body` 读得到），
 * ⛔ 不再冒充 `error` 键。
 */
export interface RawResponseBody {
  readonly __raw: true;
  readonly text: string;
}

const isRawBody = (value: unknown): value is RawResponseBody =>
  typeof value === 'object' && value !== null && (value as { __raw?: unknown }).__raw === true;

/**
 * 「上游把这颗端点当不存在」的可判别面（E5c 件③ 的判定单点：屏侧只调它，⛔ 自写状态码分支）。
 * 两种形态：
 *  - 404 / 405（老服务端没部署这条路由，就是这个形状）；
 *  - 响应体根本不是合法 JSON（裸文本 `404 Not Found`、HTML 错误页、`application/octet-stream` 的什么都有）。
 * 服务端回了契约码的不算 —— 那是它自己的人话，不许盖。
 */
export function isMissingEndpoint(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (isTmErrorCode(error.code)) return false;
  const status = error.status;
  return isRawBody(error.body) || status === 404 || status === 405;
}

/* ───────────────── 单点：认证态事件 ───────────────── */

export type AuthSignal = 'sign-out' | 'password-upgrade-required';

type Listener = (signal: AuthSignal) => void;
const listeners = new Set<Listener>();

export function onAuthSignal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const emit = (signal: AuthSignal): void => {
  for (const listener of Array.from(listeners)) {
    try {
      listener(signal);
    } catch {
      /* 广播不得反噬请求本身 */
    }
  }
};

/** 由 `main.tsx` / `host.tsx` 注入 hash 路由的 navigate，数据层因此不 import 路由。 */
let navigateRef: ((to: string) => void) | null = null;
export function bindNavigation(navigate: (to: string) => void): void {
  navigateRef = navigate;
}

const goto = (hash: string): void => {
  if (navigateRef) navigateRef(hash);
  else if (typeof window !== 'undefined') window.location.hash = hash;
};

/** 一串并发请求同时撞上 401/403 时只处理一次（"单点"的另一半含义）。 */
const HANDLING_WINDOW_MS = 1500;
let lastHandledAt = 0;

export function resetAuthHandling(): void {
  lastHandledAt = 0;
}

function claimHandling(now: number): boolean {
  if (now - lastHandledAt < HANDLING_WINDOW_MS) return false;
  lastHandledAt = now;
  return true;
}

/**
 * 判据④ 的被测函数：输入 (status, code)，输出"是否已被本层消化"。
 * 动作查的是 `@tm/shared` 的 `TM_ERRORS[code].clientAction` —— 本文件不判断"该跳哪儿"，
 * 更不写文案；将来 T-03 加一个 clientAction，这里加分支即可。
 */
export function handleAuthError(
  status: number,
  code: unknown,
  now: number = Date.now(),
): boolean {
  if (!isTmErrorCode(code)) return false;
  const action = TM_ERRORS[code].clientAction;
  if (status === 401 && code === 'CREDENTIAL_EXPIRED') {
    if (action !== 'clear-credential-and-login') return false;
    if (claimHandling(now)) {
      clearCredential();
      emit('sign-out');
      goto('/login');
    }
    return true;
  }
  if (status === 403 && code === 'PASSWORD_UPGRADE_REQUIRED') {
    if (action !== 'goto-upgrade-password') return false;
    if (claimHandling(now)) {
      emit('password-upgrade-required');
      goto('/upgrade-password');
    }
    return true;
  }
  return false;
}

/* ───────────────── 请求 ───────────────── */

export interface RequestOptions {
  /** true = 带 `Authorization: Bearer`；无 token 直接本地失败（不发请求、不占重试额度）。 */
  auth?: boolean;
  /**
   * 显式 Bearer，给出即优先于 `readToken()`。**唯一正当用途 = R-40④ 强制改密会话**：
   * 那时正常 token 按设计恒为空（`auth-store` 的两把钥匙不同时存在），只有一次性 upgrade token
   * 能打 `POST /api/password/force`（服务端 `middleware/auth.ts` 只认 Authorization 头）。
   * ⚠ 本字段**只是传输通道**：值由调用方从 `lib/token-bridge.ts` 现取，这里不读存储、不写存储，
   * 因此不是第二份凭据落地（落地单点仍在 `native/bridge.ts` + `auth-store`）。
   */
  bearer?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 401 时是否走单点登出（登录接口自己传 false，否则输错密码会被当成凭据过期）。 */
  handleAuthError?: boolean;
}

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const base = API_BASE.replace(/\/+$/, '');
  if (!query) return base + path;
  const params = new URLSearchParams();
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}${path}?${qs}` : base + path;
};

/** `parseBody` 的产物：`isJson` = 「这一坨内容是不是合法 JSON」这个**事实**本身。 */
interface ParsedBody {
  value: unknown;
  isJson: boolean;
}

/**
 * 判定只认 `JSON.parse` 成不成功，⛔ 读 `content-type` 头按字符串名比较 ——
 * MIME 带不带 `; charset`、大小写、上游报 `application/octet-stream` 都能把那种写法打穿。
 */
async function parseBody(res: Response): Promise<ParsedBody> {
  const text = await res.text();
  if (!text) return { value: null, isJson: true };
  try {
    return { value: JSON.parse(text) as unknown, isJson: true };
  } catch {
    const raw: RawResponseBody = { __raw: true, text };
    return { value: raw, isJson: false };
  }
}

export interface RequestSpec<T> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  options?: RequestOptions;
  /** 用 `@tm/shared` 的 zod 契约收形状：服务端漂移会在 App 测试里立刻红（§5.2"代价明示"）。 */
  parse?: (value: unknown) => T;
}

export async function apiRequest<T = unknown>(spec: RequestSpec<T>): Promise<T> {
  const { method, path, options = {}, parse } = spec;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.auth) {
    // `bearer` 给出即用它（R-40④ 的 upgrade 会话），传空串**不回落**正常 token（那等于放行错凭据）。
    const token = options.bearer === undefined ? readToken() : options.bearer;
    if (!token) throw new ApiError('NO_AUTH', PLAIN_TERMS.continueAfterLogin, 401);
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    throw new ApiError(
      timedOut ? 'TIMEOUT' : 'NETWORK',
      PLAIN_TERMS.connectionDown,
      0,
      cause,
    );
  }
  clearTimeout(timer);

  const { value: payload, isJson } = await parseBody(res);

  if (!res.ok) {
    let code: unknown;
    let serverMessage = '';
    /** 响应体不是合法 JSON ⇒ 它不是服务端的错误信封，⛔ 拿 `{error:原文}` 去过契约（E5c 件①）。 */
    if (isJson) {
      const parsed = TmErrorResponseBodySchema.safeParse(payload);
      if (parsed.success) {
        if (parsed.data.code) code = parsed.data.code;
        serverMessage = parsed.data.error;
      }
    }
    const known = isTmErrorCode(code) ? code : undefined;
    if (options.handleAuthError !== false) handleAuthError(res.status, known ?? code);
    /** 上游没端点 / 没信封这两种形态没有一句值得上屏 ⇒ 一律取 shared 的定稿那颗（件②）。 */
    const missingEndpoint = !isJson || res.status === 404 || res.status === 405;
    throw new ApiError(
      known ?? (res.status >= 500 ? 'BAD_RESPONSE' : 'HTTP_ERROR'),
      missingEndpoint
        ? (known ? errorMessage(known) : PLAIN_TERMS.unknownEndpoint)
        : serverMessage || (known ? errorMessage(known) : SYNC_COPY.serverBusy),
      res.status,
      payload,
    );
  }

  if (parse) {
    try {
      return parse(payload);
    } catch (cause) {
      throw new ApiError('BAD_RESPONSE', SYNC_COPY.serverBusy, res.status, cause);
    }
  }
  return payload as T;
}

export const apiGet = <T>(path: string, options?: RequestOptions, parse?: (v: unknown) => T) =>
  apiRequest<T>({ method: 'GET', path, options, parse });
export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions, parse?: (v: unknown) => T) =>
  apiRequest<T>({ method: 'POST', path, options: { ...options, body }, parse });

export const apiPut = <T>(path: string, body?: unknown, options?: RequestOptions, parse?: (v: unknown) => T) =>
  apiRequest<T>({ method: 'PUT', path, options: { ...options, body }, parse });

/** 当前是否有可用凭据（词本红点/离线队列在未登录时全部静默跳过）。 */
export const hasCredential = (): boolean => !!readToken();

/**
 * zod `safeParse` 结果的统一拆包：契约不匹配 → 抛 `ApiError('BAD_RESPONSE')`，
 * 由 `apiRequest` 转成人话（§5.2"服务端形状漂移会在 App 测试里立刻暴露"）。
 * 参数写成结构类型而不是 `z.ZodType`，`data/**` 因此不直接依赖 zod 运行时。
 */
export function unwrapParse<R>(result: {
  success: boolean;
  data?: R;
  error?: unknown;
}): R {
  if (!result.success) throw new ApiError('BAD_RESPONSE', SYNC_COPY.serverBusy, 200, result.error);
  return result.data as R;
}

/** 只用到 `safeParse` 这一面 → 不必把 zod 提升为 @tm/app 的直接依赖。 */
type SchemaLike<T> = {
  safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown };
};

/** `parse: parseWith(XxxSchema)` 的简写（各 `queries/*` 统一用它收响应形状）。 */
export const parseWith =
  <T>(schema: SchemaLike<T>) =>
  (value: unknown): T =>
    unwrapParse(schema.safeParse(value));
