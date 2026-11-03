/**
 * 实时对话门面（Phase 4 / R-05①②③ T-11 收口）
 *
 *  - `GET /ws?token=&threadId=`   WebSocket 升级（LangGraph 编排 + HITL interrupt）
 *  - `GET /api/chat/history`      会话历史（最多 20 轮）
 *
 * 消息协议（JSON）：
 *  客户端 → 服务端: **首帧** `{ type:'auth', token }`（`WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS` 秒内必须到）
 *                  然后 `{ type:'message', text } | { type:'resume', text }`
 *  服务端 → 客户端: `{ type:'auth_ok', userId }`（首帧鉴权成功）
 *                  `{ type:'chunk', text }`（打字机增量）
 *                  `{ type:'done', intent, word, response, error, checkpointKey, legacy }`
 *                  `{ type:'interrupt', question }`
 *
 * ── R-05① checkpoint 按用户隔离（审计 S8·C-06）─────────────────────────────
 * 改造前 checkpoint 的 key 就是客户端传来的裸 `threadId`，默认值还是 `'default'` ⇒
 * 两个用户的 HITL 现场共用一份、能互相续聊。现在 checkpoint key 一律 `{userId}:{threadId}`
 * （规则在本文件写死一份，`packages/agent/src/threaded.ts` 用的是同一条）。
 * **不做数据迁移**（PRD §6.1-5）：新 key 未命中时回退读裸 key，且要有归属裁决（谁在这条裸
 * thread 下有历史消息，才认谁）；判不了归属一律 403（`FORBIDDEN`），不 500、不猜属主。
 *
 * ── R-05②③ 会话鉴权 ────────────────────────────────────────────────────────
 * WS 拿不到 header ⇒ 旧实现只认 `?token=`（token 会进访问日志）。首帧鉴权是新的正路；
 * 旧 `?token=` 在 72h 窗口内仍然可用（`legacyQueryAuthWindowOpen()` 一个函数判定位），
 * 窗口关闭或完全没带 token ⇒ 4401 关闭，**不回退**成匿名会话。
 * 跨用户会话归属 ⇒ 先 `{type:'error', code:'FORBIDDEN'}` 帧、再 **4403** 关闭
 * （关闭码 = `4000 + HTTP 状态`，见 `wsCloseCodeOf()`：WS 承载不了三位数的 403）。
 *
 * 门面签名保持 `(upgradeWebSocket, deps, llmRouter, db)` 四个位置参数不变（`app.ts` 归 T-07），
 * 新增能力一律走第五个可选参数。tRPC 门面 `trpc/routers/chat.ts` 复用本文件导出的
 * `resolveThreadAccess()`：一条安全规则只写一遍（两者同属 §4.2 的门面层，不构成反向依赖）。
 */

import { Hono } from 'hono';
import type { UpgradeWebSocket, WSContext } from 'hono/ws';
import { MemorySaver, createThreadedAgent, type AgentDeps, type LlmRouter, type ThreadedAgent } from '@tm/agent';
import {
  TM_ERRORS_SUPPLEMENT,
  WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS,
  WS_LEGACY_QUERY_AUTH_GRACE_HOURS,
  errorMessage,
} from '@tm/shared';
import { loadConfig } from '../config.js';
import type { AppDB } from '../db/types.js';
import { auth, verifyToken, type AuthEnv } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';
import type { FeatureFlags } from '../services/feature-flags.js';

/** 会话保留轮数（20 轮 = 40 条消息） */
const MAX_ROUNDS = 20;

/** 单条消息长度上限（防止超长输入烧 token / 污染存储） */
const MAX_TEXT_LENGTH = 2000;
/** 裸 threadId 白名单格式（客户端可见的会话名，不含命名空间） */
const THREAD_ID_RE = /^[\w-]{1,64}$/;
/** 命名空间形态的键：`{userId}:{threadId}`，与 `@tm/agent` 的 checkpoint key 同规则 */
const NAMESPACED_RE = /^(\d{1,15}):([\w-]{1,64})$/;
/** 每用户消息限流：10 条/分钟 */
const WS_MSG_PER_MIN = 10;

/** 403 的响应体：文案与码都取自 `@tm/shared`（`FORBIDDEN` 在 `TM_ERRORS_SUPPLEMENT`，A-28-4 不许自建码表）。 */
export const THREAD_FORBIDDEN_BODY: { error: string; code: string } = {
  error: errorMessage('FORBIDDEN'),
  code: 'FORBIDDEN',
};
/** 403：`TM_ERRORS_SUPPLEMENT` 是 `as const`，保持字面量类型以适配 Hono 的 `c.json` 状态位。 */
const THREAD_FORBIDDEN_HTTP = TM_ERRORS_SUPPLEMENT.FORBIDDEN.http;

/**
 * HTTP 状态位 → **合法**的 WS 关闭码（R-05② 判据⑤ 的 WS 面）。
 *
 * ⚠ WS 的关闭码不是 HTTP 状态码：RFC 6455 §7.4.1 只允许 1000-1014（去掉 1004/1005/1006）与
 * 3000-4999（应用段），三位数的 403/401 一律非法；`ws@8.21.3` 在**收发两端都校验**
 * （`Sender#close` 直接 `throw TypeError('First argument must be a valid error code number')`，
 * `Receiver#controlMessage` 回 `invalid status code 403` 并让对端以 1006 收尾）。
 * 旧写法 `ws.close(403)` 因此从未关成过连接：403 错误帧发出去了、`close` 抛进本文件的兜底
 * catch ⇒ 连接按"新会话"继续挂着（判据⑤ 的 WS 面就是这么漏的）。
 * ⇒ 约定 `4000 + httpStatus`：401 ⇒ 4401（本文件既有写法）、403 ⇒ **4403**。
 * 语义仍是"这次连接被 403 掉了"，两端读关闭码即可分支，不新增任何码表（HTTP 真值取自 shared）。
 */
export function wsCloseCodeOf(httpStatus: number): number {
  return 4000 + httpStatus;
}

/** 未登录/凭据失效的关闭码（与历史行为逐字相同：4401）。 */
const WS_UNAUTHORIZED_CLOSE = wsCloseCodeOf(401);
/** 跨用户会话归属的关闭码：403 ⇒ 4403。 */
const WS_FORBIDDEN_CLOSE = wsCloseCodeOf(THREAD_FORBIDDEN_HTTP);

/** 一次请求解析出的会话归属。`legacy=true` ⇒ 这条会话走的是改造前的裸 key（兼容读）。 */
export interface ThreadAccess {
  /** `chat_messages.thread_id` 用的 id：保持裸 id（存量行读得到，不做迁移） */
  threadId: string;
  /** checkpoint key：`{userId}:{threadId}`，兼容读命中时是裸 id */
  checkpointKey: string;
  legacy: boolean;
}

/** 归属判不了 / 属于他人 ⇒ 门面翻成 403（绝不冒成 500）。 */
export class ThreadForbidden extends Error {
  readonly code = 'FORBIDDEN' as const;
  readonly reason: 'foreign-owner' | 'claimed-by-other' | 'unparsable';
  constructor(reason: ThreadForbidden['reason']) {
    super(THREAD_FORBIDDEN_BODY.error);
    this.name = 'ThreadForbidden';
    this.reason = reason;
  }
}

/** checkpoint key 规则（与 `packages/agent/src/threaded.ts` 的 `checkpointKeyOf` 逐字一致）。 */
export function checkpointKeyOf(userId: number | undefined, threadId: string): string {
  return userId === undefined ? threadId : `${userId}:${threadId}`;
}

/** 反解 checkpoint key：`{数字}:{其余}` = 已隔离的新 key，否则是改造前的裸 key。 */
export function splitCheckpointKey(key: string): { owner: number | null; threadId: string } {
  const m = NAMESPACED_RE.exec(key);
  return m ? { owner: Number(m[1]), threadId: m[2] as string } : { owner: null, threadId: key };
}

/**
 * 单次请求的归属判定（REST / tRPC / WS 三个入口都走这里，规则只写一遍）：
 *  1. 带命名空间的键 ⇒ 键里的 owner 就是权威属主，不是当前用户一律 403（判据⑤）；
 *  2. 形状不合法 ⇒ 403（fail-closed，不猜）；
 *  3. 裸 id + 认领表里属主是别人 ⇒ 403；
 *  4. 裸 id + 认领表里属主是自己 ⇒ 兼容读裸 key（判据④"旧行仍可被属主读"）；
 *  5. 裸 id + 没人认领过 ⇒ 用 `{userId}:{id}`（新写入一律命名空间化）。
 *
 * `claimed` 是**进程内**认领表（见 `createChatRouter`）：它的权威范围与 `MemorySaver` 一样大 ——
 * 而需要它裁决的正是 `MemorySaver` 里那些裸 key，所以不多也不少。
 */
export function resolveThreadAccess(
  rawThreadId: string,
  userId: number,
  claimed: ReadonlyMap<string, number> = new Map(),
): ThreadAccess {
  const namespaced = NAMESPACED_RE.exec(rawThreadId);
  if (namespaced) {
    if (Number(namespaced[1]) !== userId) throw new ThreadForbidden('foreign-owner');
    return { threadId: namespaced[2] as string, checkpointKey: rawThreadId, legacy: false };
  }
  if (!THREAD_ID_RE.test(rawThreadId)) throw new ThreadForbidden('unparsable');
  const owner = claimed.get(rawThreadId);
  if (owner !== undefined && owner !== userId) throw new ThreadForbidden('claimed-by-other');
  if (owner === userId) return { threadId: rawThreadId, checkpointKey: rawThreadId, legacy: true };
  return { threadId: rawThreadId, checkpointKey: checkpointKeyOf(userId, rawThreadId), legacy: false };
}

/**
 * 旧 `?token=` 通道是否仍在窗口内（判据⑥的"config 位"）。
 * `WS_LEGACY_AUTH_UNTIL`（ms 时间戳，运维可设硬截止）优先；缺省 = 本进程启动 + 72h。
 * ⚠ `config.ts` 归 T-07，本期只在本文件读这两个环境变量位 —— 已作为待裁决点提给 T-07 收编。
 */
export function legacyQueryAuthWindowOpen(now: number = Date.now(), startedAt: number = Date.now()): boolean {
  const until = Number(process.env.WS_LEGACY_AUTH_UNTIL ?? '');
  if (Number.isFinite(until) && until > 0) return now < until;
  return now < startedAt + WS_LEGACY_QUERY_AUTH_GRACE_HOURS * 3_600_000;
}

/** `@tm/agent/index.ts` 只 re-export 了 `createThreadedAgent` 三件（该文件不在我的改动面上），
 *  所以它的 `ThreadAccessError` 只能按名字/码识别，不能 `instanceof`。 */
function isThreadAccessError(err: unknown): boolean {
  const e = err as { name?: string; code?: string };
  return e?.name === 'ThreadAccessError' || e?.code === 'FORBIDDEN';
}

interface WsClientMessage {
  type?: string;
  text?: unknown;
  token?: unknown;
}

function send(ws: { send: (data: string) => void }, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

function rejectUnauthed(ws: { send: (data: string) => void; close: (code?: number, reason?: string) => void }): void {
  send(ws, { type: 'error', ...THREAD_FORBIDDEN_BODY, error: '未登录或登录已过期' });
  ws.close(WS_UNAUTHORIZED_CLOSE, 'unauthorized');
}

/**
 * 会话归属裁决的**唯一 WS 出口**（判据⑤）：403 错误帧 + 合法关闭码 4403，两者都发完才返回 null。
 * 返回 `null` ⇒ 连接已关闭，调用方必须立即 `return`，不得再落任何消息行、不得再跑 agent。
 * 鉴权成功的那一刻与每条消息之前各走一次（前者让"连上别人认领过的裸 threadId"不必发消息就被拒）。
 */
function enforceThreadAccess(
  ws: { send: (data: string) => void; close: (code?: number, reason?: string) => void },
  rawThreadId: string,
  userId: number,
  claims: ReadonlyMap<string, number>,
): ThreadAccess | null {
  try {
    return resolveThreadAccess(rawThreadId, userId, claims);
  } catch (err) {
    if (err instanceof ThreadForbidden) {
      send(ws, { type: 'error', ...THREAD_FORBIDDEN_BODY });
      ws.close(WS_FORBIDDEN_CLOSE, 'forbidden');
      return null;
    }
    throw err;
  }
}

/**
 * 进程内认领台账：`裸 threadId → 认领到的人`。只在"checkpoint 存储里确实有这条裸 key"
 * 时才写（见下面的 `claimLegacyThread`），所以它裁决的范围严格等于 `MemorySaver` 的生命周期 ——
 * 进程重启后裸 key 本来就不存在，不需要也不应该跨进程持久化（持久化反而会把"新会话默认名 default"
 * 永久锁给第一个用户，那是更严重的可用性缺陷）。
 *
 * 模块级 = 一个进程一份，与默认 `MemorySaver` 同生命周期，也让 REST 与 tRPC 两个门面共用同一份
 * 裁决（`TrpcContext` 归 T-07，不能加字段，所以只能放在这里）。测试要隔离就用 `options.claims`。
 */
const LEGACY_CLAIMS = new Map<string, number>();

/** 测试钩子：清掉进程内认领台账（只清台账，不碰 checkpoint 存储）。 */
export function __resetThreadClaimsForTest(): void {
  LEGACY_CLAIMS.clear();
}

export interface ThreadHistory extends ThreadAccess {
  messages: Awaited<ReturnType<AppDB['chat']['getRecentMessages']>>;
}

/**
 * 读历史的两门面共用出口（REST `GET /api/chat/history` 与 tRPC `chat.history` 逐字同源）。
 * @throws ThreadForbidden 归属属于他人 / 判不了 ⇒ 门面翻成 403
 */
export async function readThreadHistory(
  db: AppDB,
  userId: number,
  rawThreadId: string,
  claims: ReadonlyMap<string, number> = LEGACY_CLAIMS,
): Promise<ThreadHistory> {
  const access = resolveThreadAccess(rawThreadId, userId, claims);
  const messages = await db.chat.getRecentMessages(userId, access.threadId, MAX_ROUNDS * 2);
  return { ...access, messages };
}

/** `createChatRouter` 的第五个可选参数（四个位置参数一字未动，`app.ts` 无需跟改）。 */
export interface ChatRouterOptions {
  /** 运行时开关面（本期不读新键；预留注入位，免得后面再动签名）。 */
  flags?: FeatureFlags;
  /** JWT 密钥；缺省取 `loadConfig().jwtSecret`。 */
  jwtSecret?: string;
  /** checkpoint 存储面：与测试/调用方共用同一份，才能直接对账 key（缺省 `new MemorySaver()`）。 */
  checkpointer?: MemorySaver;
  /** 认领台账注入位（缺省 = 模块级那份，与 tRPC 门面共用）。 */
  claims?: Map<string, number>;
  /** 覆盖"旧 ?token= 窗口"判定位（测试用；生产走 `legacyQueryAuthWindowOpen`）。 */
  legacyQueryAuthOpen?: (now: number) => boolean;
  /** 时钟注入位。 */
  now?: () => number;
}

export function createChatRouter(
  upgradeWebSocket: UpgradeWebSocket,
  deps: AgentDeps,
  llmRouter: LlmRouter,
  db: AppDB,
  options: ChatRouterOptions = {},
): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const config = loadConfig();
  const jwtSecret = options.jwtSecret ?? config.jwtSecret;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const windowOpen = options.legacyQueryAuthOpen ?? ((t: number) => legacyQueryAuthWindowOpen(t, startedAt));
  const claims = options.claims ?? LEGACY_CLAIMS;

  /**
   * 兼容读裁决（判据④⑤的核心）：裸 key 存在时，只有"在这条裸 thread 下确实有自己的历史消息"
   * 的人才拿到它；别人一律 false ⇒ agent 抛 `ThreadAccessError` ⇒ 门面 403。
   * 证据来自既有的**按用户限定**的读法（`chat_messages` 未加新列、未加新 DB 方法）。
   */
  async function claimLegacyThread(userId: number, legacyThreadId: string): Promise<boolean> {
    const owner = claims.get(legacyThreadId);
    if (owner !== undefined) return owner === userId;
    const mine = await db.chat.getRecentMessages(userId, legacyThreadId, 1);
    if (mine.length === 0) return false;
    claims.set(legacyThreadId, userId);
    return true;
  }

  const threaded: ThreadedAgent = createThreadedAgent(deps, llmRouter, options.checkpointer ?? new MemorySaver(), {
    claimLegacyThread,
  });

  // ===== 会话历史 =====
  r.get('/api/chat/history', auth, async (c) => {
    try {
      return c.json(await readThreadHistory(db, c.get('userId'), c.req.query('threadId') ?? 'default', claims));
    } catch (err) {
      if (err instanceof ThreadForbidden) return c.json(THREAD_FORBIDDEN_BODY, THREAD_FORBIDDEN_HTTP);
      throw err;
    }
  });

  // ===== WebSocket 对话 =====
  r.get(
    '/ws',
    upgradeWebSocket((c) => {
      // 升级请求上的 query：token 只作为"旧通道"的回退位，threadId 决定会话键
      const queryToken = c.req.query('token') ?? '';
      const queryThread = c.req.query('threadId') ?? 'default';
      let userId: number | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const stopTimer = (): void => {
        if (timer) clearTimeout(timer);
        timer = undefined;
      };

      return {
        async onOpen(_event, ws) {
          // 判据⑥：3 秒内等不到有效首帧就关闭（不回退成匿名会话，判据⑦）
          timer = setTimeout(() => {
            if (userId === null) rejectUnauthed(ws);
          }, WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS * 1000);
          timer.unref?.();
        },

        onClose() {
          stopTimer();
        },

        async onMessage(event, ws) {
          try {
            const raw = String(event.data ?? '');
            let msg: WsClientMessage;
            try {
              msg = JSON.parse(raw) as WsClientMessage;
            } catch {
              send(ws, { type: 'error', error: '消息格式错误' });
              return;
            }

            // ── 新通道：首帧 `{type:'auth', token}`
            if (msg.type === 'auth') {
              const token = typeof msg.token === 'string' ? msg.token : '';
              const verified = await verifyToken(token, { secret: jwtSecret, db });
              if (!verified || verified.upgradeOnly) {
                rejectUnauthed(ws);
                return;
              }
              userId = verified.userId;
              stopTimer();
              send(ws, { type: 'auth_ok', userId: verified.userId });
              // 判据⑤：归属在鉴权成功的这一刻就裁决 ⇒ B 连上 A 认领过的会话不必等到发消息才被关
              enforceThreadAccess(ws, queryThread, verified.userId, claims);
              return;
            }

            // ── 旧通道：`?token=`（72h 窗口内仍连；窗口关闭 ⇒ 与无 token 同样拒绝）
            if (userId === null) {
              if (!queryToken || !windowOpen(now())) {
                rejectUnauthed(ws);
                return;
              }
              const verified = await verifyToken(queryToken, { secret: jwtSecret, db });
              if (!verified || verified.upgradeOnly) {
                rejectUnauthed(ws);
                return;
              }
              userId = verified.userId;
              stopTimer();
              send(ws, { type: 'auth_deprecated', warning: '请改用首帧 {type:"auth"} 鉴权' });
              // 同上：这条通道的"鉴权成功"就发生在首条消息里，裁决完再往下走
              if (enforceThreadAccess(ws, queryThread, verified.userId, claims) === null) return;
            }
            const me = userId as number;

            const body = typeof msg.text === 'string' ? msg.text.trim() : '';
            if (!body) return;
            if (body.length > MAX_TEXT_LENGTH) {
              send(ws, { type: 'error', error: `消息过长（最多 ${MAX_TEXT_LENGTH} 字）` });
              return;
            }

            // 会话归属：裸 key 属于别人 ⇒ 403（不是空返回、不是 500、不是"当成新会话悄悄写进去"）
            // 认领表可能在上一条消息里被 agent 更新过（兼容读是异步认领的），所以每条消息都要重判一次。
            const access = enforceThreadAccess(ws, queryThread, me, claims);
            if (access === null) return;

            const rl = checkRateLimit(`ws:${me}`, WS_MSG_PER_MIN, 60_000);
            if (!rl.ok) {
              send(ws, { type: 'error', error: `发送过于频繁，请 ${rl.retryAfterSeconds} 秒后再试` });
              return;
            }

            await db.chat.addMessage(me, access.threadId, 'user', body, now());

            const step =
              msg.type === 'resume'
                ? await threaded.resume(access.threadId, body, me)
                : await threaded.invoke(access.threadId, body, me);
            await sendStep(ws, step, db, me, access);
          } catch (err) {
            if (isThreadAccessError(err)) {
              send(ws, { type: 'error', ...THREAD_FORBIDDEN_BODY });
              ws.close(WS_FORBIDDEN_CLOSE, 'forbidden');
              return;
            }
            console.error('[WS] 消息处理失败:', err);
            send(ws, { type: 'error', error: 'AI 服务暂时不可用' });
          }
        },
      };
    }),
  );

  return r;
}

/** 发送一步结果（含打字机增量 + 最终 done / interrupt） */
async function sendStep(
  ws: WSContext,
  step: Awaited<ReturnType<ThreadedAgent['invoke']>>,
  db: AppDB,
  userId: number,
  access: ThreadAccess,
): Promise<void> {
  const at = Date.now();

  // interrupt：暂停反问用户
  if (step.interrupt !== null) {
    await db.chat.addMessage(userId, access.threadId, 'interrupt', step.interrupt, at);
    send(ws, { type: 'interrupt', question: step.interrupt, checkpointKey: step.checkpointKey, legacy: step.legacy });
    return;
  }

  const state = step.result;
  const text = state?.response ?? state?.error ?? '';
  if (!text) {
    send(ws, { type: 'done', intent: state?.intent ?? null, response: '', error: '无响应' });
    return;
  }

  await db.chat.addMessage(userId, access.threadId, 'assistant', text, at);

  // 分片发送（模拟流式，前端打字机渲染）；连接已断开时立即停止空转
  const CHUNK = 24;
  const readyState = (): number | undefined => (ws as { raw?: { readyState?: number } }).raw?.readyState;
  for (let i = 0; i < text.length; i += CHUNK) {
    const rs = readyState();
    // WebSocket CLOSE_DONE/CLOSED = 3（READY_STATE_CLOSING/CLOSED）
    if (rs !== undefined && rs > 1) return;
    send(ws, { type: 'chunk', text: text.slice(i, i + CHUNK) });
    // 让浏览器有时间逐字渲染
    await new Promise((resolve) => setTimeout(resolve, 24));
  }

  send(ws, {
    type: 'done',
    intent: state?.intent ?? null,
    word: state?.word ?? null,
    response: text,
    error: state?.error ?? null,
    tutorContent: state?.tutorContent ?? null,
    reviewQueue: state?.reviewQueue ?? null,
    checkpointKey: step.checkpointKey,
    legacy: step.legacy,
  });
}
