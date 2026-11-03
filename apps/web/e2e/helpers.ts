import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/**
 * T-15 第 2 轮 B 的共用打桩层（e2e）。
 *
 * **手法与 `apps/web/e2e/auth-wall.spec.ts` 的 `mockTrpc()` 完全一致**（A-30-6 定的全仓唯一装配点，
 * 本文件不另起一套）：服务端交互由 `page.route` 挂在 `/trpc/` 前缀上接管，返回
 * `@tm/server` 的 **tRPC v10 batch 线格式**（无 transformer ⇒ 成功 `[{result:{data}}]`、
 * 失败 `[{error:{message,data}}]`；客户端 `lib/api/auth.ts` 的 `tmCodeOf()` 读的是 `data.code`）。
 *
 * 三条与既有 spec 同源的约定：
 *  1. **不需要真后端**：不连 SQLite、不碰任何 `data.db`，写操作只改本文件的内存假数据。
 *  2. **未打桩的过程回 `NOT_FOUND`**（不在 §4.6 两张表内 ⇒ `credentialActionOf()` 必为
 *     `undefined` ⇒ 不会误触发 `providers.tsx` 的凭据单点；给 `null` 会让页面 owner 踩空）。
 *  3. **文案不硬编码**：错误提示一律从 `packages/shared/src/constants/errors.ts` 现读，
 *     这正是"改密提示口径来自 `@tm/shared`、页面不得自造文案"那条判据的机器证明。
 */

/** 已登录会话（键名逐字取自 `apps/web/src/lib/auth.ts` 的私有常量，与 auth-wall 同一份）。 */
const AUTHED_STORAGE: Record<string, string> = {
  tm_token: 'tk-e2e-t15',
  tm_user: JSON.stringify({ phone: '13800138000', nickname: 'e2e 用户', avatar: '', hasPassword: true }),
};

/** 在应用脚本之前铺 localStorage（每次导航都跑，覆盖 SSR → 水合那一帧）。 */
export async function seedSignedIn(page: Page, signedIn = true): Promise<void> {
  const entries = Object.entries(signedIn ? AUTHED_STORAGE : {});
  await page.addInitScript((pairs) => {
    for (const [key, value] of pairs) window.localStorage.setItem(key, value);
  }, entries);
}

/** 成功项。 */
export const ok = (data: unknown) => ({ result: { data } });

/**
 * 失败项：`data.code` = §4.6 码，`data.httpStatus` = A-30-1 提升的 HTTP 状态。
 *
 * v11 的批量线格式在"有没有 transformer"两种解包路径下分别读 `error.data` 与 `error.json.data`
 * （服务端 `errorFormatter` 出的是前者，`unpackResult` 走 transformer 时是后者）。这里把**两种**
 * 都填上同一份负载：客户端 `tmCodeOf()` 无论走哪条都拿得到 `code`，用例判的仍是页面的翻译。
 *
 * **`error.code` 必须是数字**（v11 协议码，与服务端 `raw.error.code` 同位，见
 * `packages/server/test/integration/auth-register.spec.ts:1021`）：`@trpc/client` 的
 * `isTRPCErrorResponse()`（`dist/TRPCClientError-*.mjs:10`）要 `typeof error.code === 'number'`
 * 才把 `error.data` 挂上 `TRPCClientError.data`。缺这一位时客户端只剩一句 `message`、
 * `data.code` 全丢 ⇒ 页面 `tmCodeOf()` 只得 `undefined` ⇒ "服务端码 → 页面翻译"那一面**根本判不到**
 * （原 T-15 报告 §5-D2 的"打桩复现不了 v11 错误线格式"就是这个缺件，不是页面缺提示）。
 */
export const trpcError = (message: string, code: string, httpStatus = 400) => {
  const body = { message, data: { code, httpStatus } };
  return { error: { ...body, code: httpStatus, json: { ...body } } };
};

export interface TrpcCall {
  proc: string;
  /** 解包后的**过程输入**（batch 线格式已剥掉外壳，断言时直接看业务字段）。 */
  payload: unknown;
  /** 原始 JSON（batch 数组 / `input` 查询参数），排查线格式时用。 */
  raw?: unknown;
}

/**
 * tRPC v10 batch 负载解包：mutation 的 POST body 是 `[{id,type,path,input}]`，
 * query 的 `?input=` 在无 transformer 时直接就是输入对象（superjson 形态也一并兜住）。
 */
function unwrapInput(raw: unknown): unknown {
  if (Array.isArray(raw)) return unwrapInput(raw[0]);
  if (raw && typeof raw === 'object') {
    const box = raw as Record<string, unknown>;
    if ('input' in box || 'json' in box) return box.input ?? box.json;
    const numeric = Object.keys(box).filter((k) => /^\d+$/.test(k));
    const only = numeric[0];
    if (only) return unwrapInput(box[only]);
  }
  return raw;
}

/**
 * 打桩表：过程名 → 处理器（入参已解包）。返回**同一引用**的实时调用账本，
 * 供"发没发、发几次、发了什么参数"断言（删除/改密的可观察结果都走这条）。
 *
 * 比 `e2e/auth-wall.spec.ts` 的 `mockTrpc()` 多做一件事：httpBatchLink 会把**同一帧内的多条
 * 查询合并成一个请求**（`/trpc/profile.get,checkin.status?batch=1&input={"0":…,"1":…}`）。
 * 登录墙那套只发一条过程所以没暴露；`/profile` 一次并发两条 ⇒ 必须按逗号拆过程名、按
 * `input` 的下标键取各自的负载，再回**同序**的数组，否则整页被判为加载失败。
 */
export async function mockTrpc(
  page: Page,
  handlers: Record<string, (payload: unknown) => unknown>,
  fallback?: (payload: unknown) => unknown,
): Promise<TrpcCall[]> {
  const calls: TrpcCall[] = [];
  await page.route('**/trpc/**', (route) => {
    const url = new URL(route.request().url());
    const procs = decodeURIComponent(url.pathname.replace(/^\/trpc\/?/, '')).split(',').filter(Boolean);
    const raw = route.request().method() === 'GET' ? url.searchParams.get('input') : route.request().postData();
    let parsed: unknown = null;
    try {
      parsed = raw == null ? undefined : JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    const unmocked = (proc: string) => trpcError(`e2e: unmocked procedure ${proc}`, 'NOT_FOUND', 404);
    const items = procs.map((proc, index) => {
      const slot =
        Array.isArray(parsed) ? parsed[index] : parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[String(index)] : undefined;
      const input = unwrapInput(slot ?? (procs.length === 1 ? parsed : undefined));
      calls.push({ proc, payload: input, raw: slot ?? parsed });
      const handler = handlers[proc] ?? fallback ?? (() => unmocked(proc));
      return handler(input);
    });
    // 一律 200 —— **与 `e2e/auth-wall.spec.ts:85` 同一口径**（本文件头注的承诺）。
    // 为什么不照抄 §4.6 的 4xx：tRPC v11 的 `httpBatchLink` 在 `!response.ok` 时把整个响应当
    // **非批量**负载去 `TRPCClientError.from(body)`，而我们的 body 是数组 ⇒ 拿不到
    // `error.data.code` ⇒ 页面 `tmCodeOf()` 只得 `undefined` ⇒ 服务端码永远翻译不出来了。
    // 原 T-15 报告 §5-D2 记的"打桩复现不了 v11 错误线格式"就是这一处装配错，不是页面缺提示。
    // 真错误项本来就长在数组元素里（`{error:{message,data:{code}}}`），状态码回 200 不放宽任何
    // 门禁：客户端仍然按元素里的 `error` 走 `onError`，用例判的仍是页面对码的翻译。
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
  });
  return calls;
}

/** 调用账本里某过程的第 N 次负载（默认第 1 次）；没发过则 `undefined`。 */
export function payloadOf(calls: TrpcCall[], proc: string, nth = 1): unknown {
  return calls.filter((c) => c.proc === proc)[nth - 1]?.payload;
}

export function countOf(calls: TrpcCall[], proc: string): number {
  return calls.filter((c) => c.proc === proc).length;
}

const SHARED_CONSTANTS_DIR = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'constants');
const SHARED_ERRORS_TS = path.join(SHARED_CONSTANTS_DIR, 'errors.ts');

/**
 * 现读 `@tm/shared` §4.6 错误码表的**定稿文案**（`TM_ERRORS`）。
 * 用例据此断言页面渲染的提示与真源逐字相等 ⇒ 页面若自造文案本用例必红。
 */
export function sharedErrorCopy(code: string): string {
  const src = readFileSync(SHARED_ERRORS_TS, 'utf8').replace(/\r\n/g, '\n');
  const matched = new RegExp(`${code}:\\s*\\{[\\s\\S]*?copy:\\s*'([^']+)'`).exec(src);
  if (!matched?.[1]) throw new Error(`e2e: @tm/shared errors.ts 里找不到 ${code}.copy`);
  return matched[1];
}

/** 词本条目的最小可用形状（`wordbook.list` 回整数组；`stage` 由前端 `stageOf()` 推导）。 */
export interface FakeWordbookEntry {
  word: string;
  gloss: string;
  addedAt: number;
  lastReview: number | null;
  reviewCount: number;
}

export function wordbookEntry(word: string, over: Partial<FakeWordbookEntry> = {}): FakeWordbookEntry {
  const now = Date.now();
  return { word, gloss: `${word} 的释义`, addedAt: now - 3 * 24 * 60 * 60 * 1000, lastReview: null, reviewCount: 0, ...over };
}

/* ───────── 文案真源的两种读法（T-15r2c 为 `e2e/study.spec.ts` 追加，既有导出未动） ───────── */

/**
 * 现读 `@tm/shared/src/constants/<file>` 里某个 `const <block> = { … }` 块内的**字符串字面量**，
 * 按出现顺序返回（`RATING_LABELS` 的四档名、`MODE_LABELS` 的三模式名都走这条）。
 * 找不到就抛 ⇒ 宁可用例红，也不给"断言其实什么都没判"的假绿。
 */
export function sharedStrings(fileName: string, blockName: string): string[] {
  const src = readFileSync(path.join(SHARED_CONSTANTS_DIR, fileName), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf(`const ${blockName}`);
  if (at < 0) throw new Error(`e2e: @tm/shared/constants/${fileName} 里找不到 ${blockName}`);
  const end = src.indexOf('\n}', at);
  const body = src.slice(at, end < 0 ? src.length : end);
  const found = [...body.matchAll(/'([^']+)'/g)].map((item) => item[1] as string);
  if (found.length === 0) throw new Error(`e2e: ${fileName} 的 ${blockName} 块里没解析到字符串字面量`);
  return found;
}

/**
 * 现读 `copy.ts` 里的一条**定稿串**并转成可断言渲染文本的 RegExp。
 *
 * `entryRe` 必须用第 1 个捕获组交出模板体，两种写法都吃：
 *  - 纯串：`/undoRating:\s*'([^']+)'/` → 直接当字面量（元字符已转义）；
 *  - 模板：`` /done:\s*\(n: number\):\s*string\s*=>\s*`([^`]+)`/ `` → 其中每个 `${…}` 插值位
 *    退化为懒惰通配 `(.+?)` ⇒ 判的是这句话的**用词与形状**，数字/词由服务端给。
 * 与 `sharedErrorCopy()` 同一立场：用例不硬编码文案，页面自造口径必红。
 */
export function sharedCopyPattern(entryRe: RegExp, what: string): RegExp {
  const src = readFileSync(path.join(SHARED_CONSTANTS_DIR, 'copy.ts'), 'utf8').replace(/\r\n/g, '\n');
  const template = entryRe.exec(src)?.[1];
  if (!template) throw new Error(`e2e: @tm/shared copy.ts 里找不到 ${what} 的定稿串`);
  const escaped = template
    .split(/\$\{[^}]*\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('(.+?)'));
}

