/**
 * T-11 · 判据④⑤⑥⑦（R-05 全条）：会话隔离 + WS 首帧鉴权。
 *
 * 自测口径照 §10.2：**不挂 T-07 的 `app.ts`**，独立门面
 * `new Hono().route('/', createChatRouter(upgradeWebSocket, deps, router, db, options))`
 * + `createNodeWebSocket` + `serve({fetch: app.fetch, port: 0})` ⇒ WS 走真握手、真 close code。
 *
 * 覆盖：
 *  ④ checkpoint key = `{userId}:{threadId}`，且改造前的**裸 threadId** 行仍可被属主读
 *    —— 分三条取证：读历史（REST）、续聊（WS message）、中断恢复（WS resume）。
 *  ⑤ 用户 B 的 token 请求 A 的 threadId ⇒ **403**（不是 500、不是空返回）。
 *  ⑥ WS 首帧 `{type:'auth',token}` 鉴权；旧 `?token=` 在窗口内仍连，窗口关 ⇒ 拒。
 *  ⑦ 完全没 token 的 WS ⇒ 拒绝，且**不回退**成匿名会话（消息不落库）。
 *  ⑤ 外延：`search-history-service`（R-09/R-10 数据面，本期"留形状"、不建表）的属主隔离
 *     —— 与判据⑤ 同一条规则：属主只从已认证 userId 派生，判不了归属一律 403，不静默写别人分区。
 *  环境自证：pg 侧（A-18-3，本机无实例时显式 SKIP 并把原因打在输出里）。
 *
 * ⚠ LLM 面是 stub（`hasLlm:false`）⇒ 走 orchestrator 的启发式分支：
 *   模糊输入 "你好" 必然 `interrupt` 反问，正好用来验 HITL 现场落在哪个 key 上。
 *   真网关（DeepSeek）的端到端冒烟不在本文件里，见 `04-dev-report-T-11.md`。
 * 只在 `os.tmpdir()` 的临时库上跑，绝不碰仓库根 `data.db`。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { trpcServer } from '@hono/trpc-server';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import Database from 'better-sqlite3';
import { MemorySaver, createThreadedAgent, type AgentDeps, type LlmRouter } from '@tm/agent';
import {
  RECENT_MAX,
  RecentSearchListSchema,
  TM_ERRORS_SUPPLEMENT,
  WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS,
  errorMessage,
} from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import {
  __resetThreadClaimsForTest,
  checkpointKeyOf,
  createChatRouter,
  legacyQueryAuthWindowOpen,
  resolveThreadAccess,
  splitCheckpointKey,
  THREAD_FORBIDDEN_BODY,
  ThreadForbidden,
} from '../../src/routes/chat.js';
import {
  SearchHistoryForbidden,
  createMemorySearchHistoryStore,
  listRecentSearches,
  pushRecentSearches,
  recordRecentSearch,
  searchHistoryErrorBody,
  searchHistoryOwner,
  splitSearchHistoryKey,
} from '../../src/services/search-history-service.js';
import { chat as chatTrpc } from '../../src/trpc/routers/chat.js';
import { createCallerFactory, type TrpcContext } from '../../src/trpc/init.js';
import { registerAuthDeps } from '../../src/middleware/auth.js';

const TEST_SECRET = 'tm-t11-chat-isolation-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;
/** pg 侧可用性（A-18-3：缺实例时下面的环境自证用例会显式 SKIP 并打印原因）。 */
const PG_URL = process.env.DATABASE_URL_TEST ?? '';

const tmpDir = path.join(os.tmpdir(), `tm-t11-chat-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const TOKEN = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

/** 会话 id：故意用改造前的"裸名"，用来演兼容读。 */
const LEGACY_THREAD = 'legacy-t';

let db: SqliteAppDB;
/** `serve()` 的实际返回是 `Server | Http2Server | Http2SecureServer`（= `injectWebSocket` 收的那个非）。
 *  旧写法把变量注解成 `node:http` 的 `Server`（写窄了）⇒ 赋值处 TS2322。改注解，不用 `as` 强转。 */
let server: ServerType;
let port = 0;
let userA = 0;
let userB = 0;
/** 与门面共用的 checkpoint 面：判据④ 直接问它"key 存不存在"，不靠猜。 */
let saver: MemorySaver;
/** 与门面共用的认领台账（生产是模块级那一份，测试注入独立一份以免串味）。 */
let claims: Map<string, number>;

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

/** LLM 面 stub：`hasLlm=false` ⇒ 编排节点走启发式，模糊输入必 `interrupt`。 */
const stubRouter = {
  hasLlm: false,
  createStructured: undefined,
  chat: async () => ({ content: '', model: 'stub' }),
} as unknown as LlmRouter;

const deps = (): AgentDeps => ({
  tutorCache: db.tutorCache,
  fsrsCards: db.fsrs,
  wordbook: db.wordbooks,
  getCefrLevel: async () => 'B1',
});

/* ───────────────────── WS 客户端小工具（真握手） ───────────────────── */

interface Frame {
  type?: string;
  [k: string]: unknown;
}

class Client {
  private readonly frames: Frame[] = [];
  private readonly waiters: Array<() => void> = [];
  closeCode: number | null = null;
  private closedResolve: (() => void) | null = null;

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      try {
        this.frames.push(JSON.parse(String(raw)) as Frame);
      } catch {
        this.frames.push({ type: 'unparsable' });
      }
      this.wake();
    });
    ws.on('close', (code) => {
      this.closeCode = code;
      this.wake();
      this.closedResolve?.();
    });
  }

  private wake(): void {
    const pending = this.waiters.splice(0);
    for (const w of pending) w();
  }

  send(payload: unknown): void {
    this.ws.send(JSON.stringify(payload));
  }

  /** 等到出现某一类帧（或连接关闭）；超时返回 null。 */
  async waitFor(type: string, ms = 4000): Promise<Frame | null> {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = this.frames.find((f) => f.type === type);
      if (hit) return hit;
      if (this.closeCode !== null) return null;
      if (Date.now() > deadline) return null;
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          this.wake();
          resolve();
        }, 25);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  closed(ms = 4000): Promise<number | null> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(this.closeCode), ms);
      this.closedResolve = () => {
        clearTimeout(t);
        resolve(this.closeCode);
      };
    });
  }

  get all(): readonly Frame[] {
    return this.frames;
  }

  terminate(): void {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.terminate();
  }
}

async function connect(query = ''): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return new Client(ws);
}

function chatApp(overrides: { legacyQueryAuthOpen?: (now: number) => boolean } = {}): Hono {
  const app = new Hono();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
  app.route(
    '/',
    createChatRouter(upgradeWebSocket, deps(), stubRouter, db, {
      jwtSecret: AUTH_SECRET,
      checkpointer: saver,
      claims,
      legacyQueryAuthOpen: overrides.legacyQueryAuthOpen,
    }),
  );
  pendingInject = injectWebSocket;
  return app;
}

let pendingInject: ((s: ServerType) => void) | null = null;

/** 直接读 checkpointer 的某个 key 有没有现场（判据④ 的取证点）。 */
async function checkpointExists(key: string): Promise<boolean> {
  const tuple = await saver.getTuple({ configurable: { thread_id: key } });
  return tuple != null;
}

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('chat.db');
  registerAuthDeps(db);
  userA = await db.createUser('13900000021', Date.now());
  userB = await db.createUser('13900000022', Date.now());
  // 改造前的存量现场：A 在裸 threadId 下已有历史行（Q"不迁移"就是这些行要还能读）
  await db.chat.addMessage(userA, LEGACY_THREAD, 'user', 'apple', Date.now() - 60_000);
  await db.chat.addMessage(userA, LEGACY_THREAD, 'assistant', 'apple 是"苹果"。', Date.now() - 59_000);

  saver = new MemorySaver();
  claims = new Map();

  const app = chatApp();
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      port = info.port;
      pendingInject?.(server as never);
      resolve();
    });
  });
});

afterAll(async () => {
  __resetThreadClaimsForTest();
  // WS 升级后的连接不受 `server.close()` 管，得显式清掉，否则 vitest 收尾要多等一轮超时
  (server as unknown as { closeAllConnections?: () => void })?.closeAllConnections?.();
  server?.close();
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ───────────────────────────── 纯函数面（键规则） ───────────────────────────── */

describe('R-05① checkpoint key 规则（与 @tm/agent 的 threaded.ts 同一条）', () => {
  it('checkpointKeyOf：鉴权后是 {userId}:{threadId}，未鉴权保持裸 key（不新增崩溃面）', () => {
    expect(checkpointKeyOf(userA, 'default')).toBe(`${userA}:default`);
    expect(checkpointKeyOf(undefined, 'default')).toBe('default');
  });

  it('splitCheckpointKey 能把两种形态都认回来', () => {
    expect(splitCheckpointKey(`${userA}:default`)).toEqual({ owner: userA, threadId: 'default' });
    expect(splitCheckpointKey('default')).toEqual({ owner: null, threadId: 'default' });
  });

  it('resolveThreadAccess：别人的命名空间键 ⇒ 403；判不了的形状 ⇒ 403（不猜属主）', () => {
    expect(() => resolveThreadAccess(`${userB}:default`, userA, claims)).toThrow(ThreadForbidden);
    expect(() => resolveThreadAccess('bad thread!!', userA, claims)).toThrow(ThreadForbidden);
    expect(() => resolveThreadAccess(`${userA}:default`, userA, claims)).not.toThrow();
  });

  it('legacyQueryAuthWindowOpen：窗口内 true、过点 false（72h 由 shared 常量决定，不抄数字）', () => {
    const started = 1_770_000_000_000;
    expect(legacyQueryAuthWindowOpen(started + 60_000, started)).toBe(true);
    expect(legacyQueryAuthWindowOpen(started + 100 * 3_600_000, started)).toBe(false);
  });
});

/* ───────────────────────────── 判据④：三条路径 ───────────────────────────── */

describe('判据④ 裸 threadId 的旧现场仍可被属主读（读历史 / 续聊 / 中断恢复）', () => {
  it('读历史：A 用裸 threadId 读到自己的存量行，返回体带上命名空间后的 checkpointKey', async () => {
    const app = chatApp();
    const res = await app.request(`/api/chat/history?threadId=${LEGACY_THREAD}`, {
      headers: { authorization: `Bearer ${TOKEN(userA)}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { threadId: string; checkpointKey: string; legacy: boolean; messages: Array<{ role: string; content: string }> };
    expect(body.threadId).toBe(LEGACY_THREAD);
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(body.messages[1]?.content).toContain('苹果');
  });

  it('续聊 + 中断恢复：A 的 WS 命中**裸 key**（兼容读 legacy=true），resume 续上同一份现场', async () => {
    // 造出"改造前"的现场：未鉴权的旧调用面 ⇒ checkpoint key 就是裸 threadId（threaded.ts 改造前的行为）
    const legacy = createThreadedAgent(deps(), stubRouter, saver);
    expect(await checkpointExists(checkpointKeyOf(userA, LEGACY_THREAD))).toBe(false);
    const seeded = await legacy.invoke(LEGACY_THREAD, '你好', undefined);
    expect(seeded.interrupt).not.toBeNull();
    expect(seeded.checkpointKey).toBe(LEGACY_THREAD);
    expect(await checkpointExists(LEGACY_THREAD)).toBe(true);
    // 认领台账还没被门面动过（兼容读必须经由门面的裁决，不是"谁都能读"）
    expect(claims.get(LEGACY_THREAD)).toBeUndefined();

    // ── 路径 1：续聊（在旧裸会话上再发一条）
    const c = await connect(`?threadId=${LEGACY_THREAD}&token=${TOKEN(userA)}`);
    c.send({ type: 'message', text: '你好' });
    const intr = await c.waitFor('interrupt');
    expect(intr, `未拿到 interrupt 帧：${JSON.stringify(c.all)}`).not.toBeNull();
    expect(intr?.legacy).toBe(true);
    expect(intr?.checkpointKey).toBe(LEGACY_THREAD);
    expect(claims.get(LEGACY_THREAD), '兼容读必须由属主认领，而不是静默可读').toBe(userA);

    // ── 路径 2：中断恢复（resume 续在同一份裸 key 现场上）
    c.send({ type: 'resume', text: 'apple' });
    const done = await c.waitFor('done', 8000);
    expect(done, `未拿到 done 帧：${JSON.stringify(c.all)}`).not.toBeNull();
    expect(done?.checkpointKey).toBe(LEGACY_THREAD);
    expect(done?.legacy).toBe(true);
    c.terminate();
    // 兼容读不迁移：裸 key 仍在，命名空间化的 key 一个都没被写出来
    expect(await checkpointExists(LEGACY_THREAD)).toBe(true);
    expect(await checkpointExists(checkpointKeyOf(userA, LEGACY_THREAD))).toBe(false);
  });

  it('新会话一律落在 {userId}:{threadId} 下，同名会话两人各一份（S8 回归点）', async () => {
    const a = await connect(`?threadId=shared-name&token=${TOKEN(userA)}`);
    a.send({ type: 'message', text: '你好' });
    const aIntr = await a.waitFor('interrupt');
    expect(aIntr?.checkpointKey).toBe(checkpointKeyOf(userA, 'shared-name'));
    expect(aIntr?.legacy).toBe(false);
    a.terminate();

    const b = await connect(`?threadId=shared-name&token=${TOKEN(userB)}`);
    b.send({ type: 'message', text: '你好' });
    const bIntr = await b.waitFor('interrupt');
    expect(bIntr?.checkpointKey).toBe(checkpointKeyOf(userB, 'shared-name'));
    b.terminate();

    expect(await checkpointExists(checkpointKeyOf(userA, 'shared-name'))).toBe(true);
    expect(await checkpointExists(checkpointKeyOf(userB, 'shared-name'))).toBe(true);
    expect(checkpointKeyOf(userA, 'shared-name')).not.toBe(checkpointKeyOf(userB, 'shared-name'));
    // 新写入绝不落在裸 key 上
    expect(await checkpointExists('shared-name')).toBe(false);
    // 历史行仍按裸 id 存（没被顺手改名，存量读法不受影响）
    expect((await db.chat.getRecentMessages(userB, 'shared-name', 10)).length).toBeGreaterThan(0);
  });
});

/* ───────────────────────────── 判据⑤：跨用户 403 ───────────────────────────── */

describe('判据⑤ B 的 token 请求 A 的 threadId ⇒ 403（不是 500、不是空返回）', () => {
  it('REST：B 用 A 的命名空间键 ⇒ 403 + 同一条人话 + FORBIDDEN', async () => {
    const app = chatApp();
    const res = await app.request(`/api/chat/history?threadId=${encodeURIComponent(`${userA}:${LEGACY_THREAD}`)}`, {
      headers: { authorization: `Bearer ${TOKEN(userB)}` },
    });
    expect(res.status).toBe(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
    expect(await res.json()).toEqual({ error: errorMessage('FORBIDDEN'), code: 'FORBIDDEN' });
    expect(res.status, '绝不冒成 500').not.toBe(500);
  });

  it('tRPC 门面：同一个判定 ⇒ FORBIDDEN 码 + 同一条人话（两门面全等）', async () => {
    const ctx = { userId: userB, clientIp: '127.0.0.1', db } as unknown as TrpcContext;
    const caller = createCallerFactory(chatTrpc)(ctx);
    let code = '';
    let message = '';
    try {
      await caller.history({ threadId: `${userA}:${LEGACY_THREAD}` });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      code = e.code ?? '';
      message = e.message ?? '';
    }
    expect(code).toBe('FORBIDDEN');
    expect(message).toBe(THREAD_FORBIDDEN_BODY.error);
  });

  /**
   * A-30-1 的连带清理（本条钉**线上传输形状**，不是 caller 直调）：
   * `createCallerFactory` 直调会把 `TRPCError.data` 剥掉，所以 `cause.{tmCode}` 有没有被
   * `trpc/init.ts` 的唯一 `errorFormatter` 提升成 `data.code`，只能打 `/trpc/*` 本体取证
   * （与 T-07 在 `auth-register.spec.ts` 里立的口径一致）。
   * 门面是测试自己拼的：`trpcServer({router: chat})` + 手搭 ctx，**不依赖 T-07 的 `app.ts`**。
   *
   * ⚠ 三条断言都是硬的，尤其 `status`：`FORBIDDEN` 属 `TM_ERRORS_SUPPLEMENT` 而不是 §4.6 的
   * `TM_ERRORS`，errorFormatter 的 http 兜底若按 `TM_ERRORS[tmCode].http` 取值就会在这里炸成 500
   * ——那正是本条要看住的形状（红则记红，不放宽）。
   *
   * 历史（P-2 的闭环）：本条从 T-11 第一轮起 skip，原因是 `trpc/routers/chat.ts` 抛 `ThreadForbidden`
   * 时 `cause` 只有 `tmCode`、没有 `httpStatus` ⇒ `init.ts:69` 兜底去查 §4.6 冻结表，对 supplement 的
   * `FORBIDDEN` 取到 `undefined.http` ⇒ TypeError ⇒ errorFormatter 自己把 403 变成 500，实测原文：
   *   AssertionError: 线上状态应为 403，实际 500：
   *   {"error":{"message":"Cannot read properties of undefined (reading 'http')",
   *    "data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":500},
   *    "stack":"TypeError: ... at Object.errorFormatter (packages/server/src/trpc/init.ts:69:92)"}}
   * T-11 第五轮按简报给的两条修法里选了 **②（chat 门面 `cause` 带上 `httpStatus`，与
   * `routers/profile.ts` 的 `toTrpcError()` 同形，状态取 `supplementErrorStatus()`）**：①（改 `init.ts`
   * 的兜底走 `errorHttpStatus()`/认 supplement）在 T-07 名下、本任务禁触，且①单独做也救不了
   * "调用方没带 httpStatus"这一类。⇒ 本条已解 skip、真跑、绿，断言一字未动。
   * ⚠ `init.ts:69` 的那个兜底**仍然是洞**（supplement 码 + `cause` 缺 `httpStatus` ⇒ 500 而不是 §4.6 兜底），
   * 已在报告里给 T-07 留最小复现与建议修法（本文件不新增用例去钉别人的面）。
   */
  it('A-30-1 待 T-07 落地，出口轮解 skip 复验：tRPC 错误体 data.code === shared 的 tm_code（跨用户 403 走 cause→data，且线上不是 500）', async () => {
    const app = new Hono();
    app.use(
      '/trpc/*',
      trpcServer({
        endpoint: '/trpc',
        router: chatTrpc,
        createContext: async () => ({ userId: userB, clientIp: '127.0.0.1', db }),
      }),
    );
    const input = encodeURIComponent(JSON.stringify({ threadId: `${userA}:${LEGACY_THREAD}` }));
    const res = await app.request(`/trpc/history?input=${input}`);
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = (raw.error ?? {}) as Record<string, unknown>;
    const json = (err.json ?? err) as Record<string, unknown>;
    expect(res.status, `线上状态应为 403，实际 ${res.status}：${JSON.stringify(raw)}`).toBe(
      TM_ERRORS_SUPPLEMENT.FORBIDDEN.http,
    );
    expect(json.message).toBe(errorMessage('FORBIDDEN'));
    expect((json.data as Record<string, unknown>).code).toBe('FORBIDDEN');
  });

  it('WS：A 认领过裸 threadId 之后，B 拿同一个名字连 ⇒ 403 关闭（不是 200 空会话）', async () => {
    // 认领发生在判据④ 的兼容读里；万一没跑过，这里用"A 自己发一条"补上，避免用例间顺序耦合
    if (claims.get(LEGACY_THREAD) === undefined) {
      const a = await connect(`?threadId=${LEGACY_THREAD}&token=${TOKEN(userA)}`);
      a.send({ type: 'message', text: '你好' });
      await a.waitFor('interrupt');
      a.terminate();
    }
    expect(claims.get(LEGACY_THREAD)).toBe(userA);

    const c = await connect(`?threadId=${LEGACY_THREAD}&token=${TOKEN(userB)}`);
    c.send({ type: 'message', text: 'apple' });
    const err = await c.waitFor('error');
    expect(err, `未拿到 403 错误帧：${JSON.stringify(c.all)}`).not.toBeNull();
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.error).toBe(errorMessage('FORBIDDEN'));
    // 关闭码 = `4000 + HTTP 状态`（本文件对 401 用的就是 4401 这套写法）：
    // RFC 6455 §7.4.1 的关闭码只允许 1000-1014 / 3000-4999，三位数的 403 在 ws@8 收发两端都非法
    // （`Sender#close` 直接 throw ⇒ 旧实现"403 关闭"从来没关成过，连接按新会话悄悄挂着 = 本批次唯一真鉴权缺陷）。
    // 语义不变：仍然断言"被这条 403 关掉"，HTTP 真值仍取自 shared。见报告待裁决点 P-1。
    expect(await c.closed()).toBe(4000 + TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
    // B 的这次尝试没有留下任何消息行（没被当成新会话悄悄写进去）
    expect(await db.chat.getRecentMessages(userB, LEGACY_THREAD, 10)).toEqual([]);
  });

  it('WS 首帧通道同样拦：B 只完成鉴权、一个字没发，也要被 403 关掉（判据⑤ 的更早出口）', async () => {
    if (claims.get(LEGACY_THREAD) === undefined) {
      const a = await connect(`?threadId=${LEGACY_THREAD}&token=${TOKEN(userA)}`);
      a.send({ type: 'message', text: '你好' });
      await a.waitFor('interrupt');
      a.terminate();
    }
    expect(claims.get(LEGACY_THREAD)).toBe(userA);

    const c = await connect(`?threadId=${LEGACY_THREAD}`);
    c.send({ type: 'auth', token: TOKEN(userB) });
    expect((await c.waitFor('auth_ok'))?.userId).toBe(userB);
    const err = await c.waitFor('error');
    expect(err?.code).toBe('FORBIDDEN');
    expect(err?.error).toBe(errorMessage('FORBIDDEN'));
    expect(await c.closed()).toBe(4000 + TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
    expect(await db.chat.getRecentMessages(userB, LEGACY_THREAD, 10)).toEqual([]);
  });
});

/* ───────────────────────────── 判据⑥⑦：WS 鉴权 ───────────────────────────── */

describe('判据⑥ WS 首帧鉴权 + 旧 ?token= 窗口', () => {
  it('首帧 {type:"auth",token} ⇒ auth_ok，随后正常对话（不带任何 query token）', async () => {
    const c = await connect('?threadId=first-frame');
    c.send({ type: 'auth', token: TOKEN(userA) });
    const ok = await c.waitFor('auth_ok');
    expect(ok?.userId).toBe(userA);
    c.send({ type: 'message', text: 'apple' });
    const done = await c.waitFor('done', 8000);
    expect(done, `未拿到 done 帧：${JSON.stringify(c.all)}`).not.toBeNull();
    c.terminate();
  });

  it('旧 ?token= 在窗口内仍然可连，并收到迁移提示（auth_deprecated）', async () => {
    const c = await connect(`?threadId=legacy-query&token=${TOKEN(userA)}`);
    c.send({ type: 'message', text: 'banana' });
    const warn = await c.waitFor('auth_deprecated');
    expect(warn?.warning).toBeTruthy();
    expect(await c.waitFor('done', 8000)).not.toBeNull();
    c.terminate();
  });

  it('窗口关掉 ⇒ 旧 ?token= 一律拒（4401），首帧通道不受影响', async () => {
    const app = new Hono();
    const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
    app.route(
      '/',
      createChatRouter(upgradeWebSocket, deps(), stubRouter, db, {
        jwtSecret: AUTH_SECRET,
        checkpointer: saver,
        claims,
        legacyQueryAuthOpen: () => false,
      }),
    );
    const closed = await new Promise<number | null>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, async (info) => {
        injectWebSocket(s as never);
        const c = new WebSocket(`ws://127.0.0.1:${info.port}/ws?threadId=off&token=${TOKEN(userA)}`);
        c.on('close', (code) => resolve(code));
        c.on('open', () => c.send(JSON.stringify({ type: 'message', text: 'apple' })));
        setTimeout(() => resolve(null), 5000);
      });
    });
    expect(closed).toBe(4401);
  });

  it('首帧超时位存在（WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS 由 shared 决定，不在门面里抄数字）', () => {
    expect(WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS).toBeGreaterThan(0);
    expect(WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS).toBeLessThanOrEqual(10);
  });

  it(`首帧窗口（${WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS}s）内什么都不发 ⇒ 服务端主动关闭 4401`, async () => {
    // 只连不鉴权：旧实现会一直挂着（匿名也能聊），现在到点就关
    const c = await connect('?threadId=never-auths');
    expect(await c.closed(WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS * 1000 + 2500)).toBe(4401);
    expect(await db.chat.getRecentMessages(userA, 'never-auths', 10)).toEqual([]);
  });
});

describe('判据⑦ 完全没 token 的 WS ⇒ 拒绝，不回退成匿名会话', () => {
  it('无 token 直接发消息 ⇒ 4401 关闭，且这一条消息没有落库', async () => {
    const before = await db.chat.getRecentMessages(userA, 'no-token', 50);
    const c = await connect('?threadId=no-token');
    c.send({ type: 'message', text: 'apple' });
    const err = await c.waitFor('error');
    expect(err?.error).toBeTruthy();
    expect(await c.closed()).toBe(4401);
    const after = await db.chat.getRecentMessages(userA, 'no-token', 50);
    expect(after.length).toBe(before.length);
    // 也不会出现"匿名也能聊"的会话：无 user 的 checkpoint key 就是裸名
    expect(await checkpointExists('no-token')).toBe(false);
  });

  it('假 token 同样拒（不因鉴权失败而降级）', async () => {
    const c = await connect('?threadId=bad-token');
    c.send({ type: 'auth', token: 'not-a-jwt' });
    expect(await c.closed()).toBe(4401);
  });
});

/* ═══════════ 判据⑤ 的同一条口径外延：最近查询历史分区（R-09 / R-10 数据面） ═══════════ */

/**
 * `search-history-service.ts` 是本期"留形状"的面（不建表、无路由挂它，P1 R-26 才落库）。
 * 它身上唯一**现在就成立**的安全不变量，就是判据⑤ 那一条：属主只能从已认证的 userId 来，
 * 判不了归属一律 403（`FORBIDDEN`）、绝不静默写进别人的分区、绝不冒 500。
 * 本节的价值 = 让 R-26 真正接上落库时这条红线已经有看守，而不是等 Phase 5 现学。
 */
describe('判据⑤ 同口径外延：最近查询历史的属主隔离（R-09/R-10 数据面，本期留形状）', () => {
  const item = (word: string, at: number, direction: 'auto' | 'en2zh' | 'zh2en' = 'auto') => ({
    word,
    direction,
    gloss: '',
    at,
  });

  it('属主只能由已认证 userId 派生；未登录/非法 id ⇒ null（不 403、不共享别人的分区）', () => {
    expect(searchHistoryOwner(userA)).toEqual({ userId: userA, key: `user:${userA}` });
    expect(searchHistoryOwner(null)).toBeNull();
    expect(searchHistoryOwner(undefined)).toBeNull();
    expect(searchHistoryOwner(0)).toBeNull();
    expect(searchHistoryOwner(-3)).toBeNull();
    expect(searchHistoryOwner(1.5)).toBeNull();
    // 分区键不可反推成别人的：只有这一条前缀形态
    expect(splitSearchHistoryKey(`user:${userA}`)).toBe(userA);
    expect(splitSearchHistoryKey(`${userA}`)).toBeNull();
    expect(splitSearchHistoryKey('user:0')).toBeNull();
  });

  it('未登录读写都不落库、也不抛（R-10⑦），且读回的是空列表而不是别人的那份', async () => {
    const store = createMemorySearchHistoryStore();
    await recordRecentSearch(store, searchHistoryOwner(userA), item('apple', 10));
    expect(await listRecentSearches(store, null)).toEqual([]);
    expect(await recordRecentSearch(store, null, item('banana', 20))).toEqual([]);
    // A 的分区没有被匿名写入污染
    expect((await listRecentSearches(store, searchHistoryOwner(userA))).map((i) => i.word)).toEqual(['apple']);
  });

  it('跨属主的批量上行 ⇒ 403 + shared 的同一条人话 + 同一个 http（与判据⑤ 逐字同口径）', async () => {
    const store = createMemorySearchHistoryStore();
    const owner = searchHistoryOwner(userA);
    const foreign = await pushRecentSearches(store, owner, {
      ownerId: userB,
      items: [item('serendipity', 30)],
    }).catch((err: unknown) => err);
    expect(foreign).toBeInstanceOf(SearchHistoryForbidden);
    const e = foreign as SearchHistoryForbidden;
    expect(e.code).toBe('FORBIDDEN');
    expect(e.status).toBe(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http);
    expect(e.message).toBe(errorMessage('FORBIDDEN'));
    expect(searchHistoryErrorBody(e).body).toEqual(THREAD_FORBIDDEN_BODY);
    // 拒绝发生在写之前：A 的分区仍然是空的，B 的分区没被凭空建出来
    expect(await listRecentSearches(store, owner)).toEqual([]);
    expect(await listRecentSearches(store, searchHistoryOwner(userB))).toEqual([]);
  });

  it('缺 ownerId 的批量上行同样 403（判不了归属就不动，宁可拒也不猜）', async () => {
    const store = createMemorySearchHistoryStore();
    const err = await pushRecentSearches(store, searchHistoryOwner(userA), {
      items: [item('apple', 40)],
    }).catch((e: unknown) => e);
    expect((err as SearchHistoryForbidden).reason).toBe('unowned-payload');
    expect((err as SearchHistoryForbidden).code).toBe('FORBIDDEN');
    expect(await listRecentSearches(store, searchHistoryOwner(userA))).toEqual([]);
  });

  it('合并语义两端口径一致：同词同方向上移不产生第二条、跨方向各留一条、硬截到 RECENT_MAX', async () => {
    const store = createMemorySearchHistoryStore();
    const owner = searchHistoryOwner(userA);
    await recordRecentSearch(store, owner, item('apple', 100));
    await recordRecentSearch(store, owner, item('banana', 110));
    await recordRecentSearch(store, owner, item('apple', 120));
    let list = await listRecentSearches(store, owner);
    expect(list.map((i) => i.word)).toEqual(['apple', 'banana']);
    expect(list[0]?.at).toBe(120);
    await recordRecentSearch(store, owner, item('apple', 130, 'zh2en'));
    list = await listRecentSearches(store, owner);
    expect(list.map((i) => `${i.word}|${i.direction}`)).toEqual(['apple|zh2en', 'apple|auto', 'banana|auto']);
    // 上限由 shared 的 RECENT_MAX 决定（不抄数字），并且是由契约复核保证的
    const many = Array.from({ length: RECENT_MAX + 9 }, (_, i) => item(`w${i}`, 1_000 + i));
    const pushed = await pushRecentSearches(store, owner, { ownerId: userA, items: many });
    expect(pushed.length).toBe(RECENT_MAX);
    expect(RecentSearchListSchema.safeParse(pushed).success).toBe(true);
    expect(pushed[0]?.word).toBe(`w${RECENT_MAX + 8}`);
  });
});

/* ══════════════════ 环境自证：pg 侧（A-18-3 口径，与 T-07 同一形态） ══════════════════ */

describe('环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里）', () => {
  it('未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg，报告已登记）', () => {
    if (PG_URL) {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      return;
    }
    console.warn(
      '[SKIP] T-11 chat-isolation 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。' +
        ' 本域对 pg 的依赖面 = `chat_messages.thread_id` 的裸 key 兼容读与 `{userId}:{threadId}` 命名空间键' +
        '（PRD §6.1-5 要求双驱动行为一致），checkpoint 面是进程内 `MemorySaver`、与驱动无关。',
    );
    expect(PG_URL).toBe('');
  });
});
