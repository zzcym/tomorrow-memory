/**
 * T-10 · 判据①②：复习/打卡域与 LLM **零依赖**的可执行证明。
 *
 * depcruise 的 `review-no-agent` 是静态可达闭包（`--self-test` 已证明它对故意违规 fixture 会红：
 * `depcruise review-no-agent 故意违规 → 红 exit=5`）。本文件是它的**运行时兜底**：
 *  1) 把 `globalThis.fetch` 换成"调用即抛"，再把 tRPC ctx 里的 `agentDeps` / `llmRouter` 换成
 *     "读任何属性即抛"的 Proxy（模拟审计 S2 时代跑的 `runAgent()` 编排）→
 *     四档评分（1/2/3/4）在 REST 与 tRPC 两个门面上**仍然全部 200**；
 *     CL-3（A-33-7）之后 REST 门面不再收 agent 形参（第 2 个入参 = `deps:{events}`），
 *     所以那条"挂着不用的代理"从签名上就没位置了，本文件的运行时面只剩 tRPC ctx 那一侧；
 *  2) 静态面：复习域 8 个文件（含门面与服务）的代码里不得出现 agent / LLM / `fetch(` 的引用；
 *  3) 唯一入口面：`packages/server/src/**` 里 `from 'ts-fsrs'` 只允许出现在
 *     `services/fsrs.ts`（判据① 的 S13 半边；depcruise 的 `fsrs-version-lock` 对已安装的
 *     pnpm 包有解析盲点，所以这条由本用例直接读文件强制）。
 *
 * 同样只在 `os.tmpdir()` 的临时库上跑。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RATING_VALUES } from '@tm/shared';
import { SqliteAppDB } from '../src/db/sqlite.js';
import { sqliteMigrationContext } from '../src/db/index.js';
import { MigrationRunner } from '../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../src/scripts/migrate.js';
import { createReviewRouter } from '../src/routes/review.js';
import { createCheckinRouter } from '../src/routes/checkin.js';
import { review } from '../src/trpc/routers/review.js';
import { checkin } from '../src/trpc/routers/checkin.js';
import { createCallerFactory, type TrpcContext } from '../src/trpc/init.js';
import type { AuthEnv } from '../src/middleware/auth.js';

const TEST_SECRET = 'tm-t10-review-no-llm-secret';
const AUTH_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.JWT_SECRET = AUTH_SECRET;

const tmpDir = path.join(os.tmpdir(), `tm-t10-nollm-${process.pid}`);
const T0 = 1_770_000_000_000;
const SERVER_SRC = fileURLToPath(new URL('../src/', import.meta.url));

let db: SqliteAppDB;
let uid = 0;

/** 触碰即抛：任何属性读取（`agentDeps.graph`、`llmRouter.chat`…）都立刻炸。 */
const explodingProxy = (label: string): unknown =>
  new Proxy(
    {},
    {
      get(_t, prop): never {
        throw new Error(`LLM_TOUCHED: ${label}.${String(prop)}`);
      },
      apply(): never {
        throw new Error(`LLM_TOUCHED: ${label}()`);
      },
    },
  );

/** 复习/打卡域的 8 个文件（判据①②的作用面）。 */
const DOMAIN_FILES = [
  'routes/review.ts',
  'routes/checkin.ts',
  'trpc/routers/review.ts',
  'trpc/routers/checkin.ts',
  'services/review-service.ts',
  'services/queue-service.ts',
  'services/checkin-service.ts',
  'services/fsrs.ts',
];

/** 禁词：命中即判"复习域又接上了 LLM/agent"。 */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['@tm/agent', /['"]@tm\/agent['"]/],
  ['packages/agent', /packages\/agent\//],
  ['runAgent', /\brunAgent\s*\(/],
  ['services/analyst', /services\/analyst/],
  ['LlmRouter 类型引用', /\bLlmRouter\b/],
  ['agentDeps 值引用', /\bagentDeps\s*[.([]/],
  ['全局 fetch 调用', /(?<![.\w$])fetch\s*\(/],
  ['LLM 客户端', /\b(deepseek|DeepSeek|openai|OpenAI)\b/],
];

/** 去注释后的源码（注释里出现这些词是解释性的，不构成依赖）。 */
function codeOnly(file: string): string {
  const raw = fs.readFileSync(path.join(SERVER_SRC, file), 'utf8');
  const out = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // 反"永真"自检：去注释后必须还剩真代码，否则上面的正则全都测了个空集
  expect(out.trim().length).toBeGreaterThan(120);
  expect(out).toMatch(/export/);
  return out;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const raw = new Database(path.join(tmpDir, 'no-llm.db'));
  db = new SqliteAppDB(raw);
  await db.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  uid = await db.createUser('13800000011', T0);
  await db.wordbooks.saveData(uid, [{ word: 'apple', addedAt: T0 }], T0);
  // 让 apple 有一张 Review 态卡，评分路径才有"读卡 → 推进"这条真分支可跑
  await db.fsrs.upsertCard(
    uid,
    'apple',
    '{"due":"2026-03-05T09:00:00.000Z","stability":5.5,"difficulty":6,"elapsed_days":3,' +
      '"scheduled_days":4,"reps":3,"lapses":1,"state":2,"last_review":"2026-03-02T09:00:00.000Z"}',
    T0,
    T0,
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
  return db
    ?.close()
    .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
});

const token = (userId: number): string => jwt.sign({ id: userId }, AUTH_SECRET, { expiresIn: '1h' });

describe('判据② 运行时兜底：LLM/fetch 换成 throw 后四档评分仍 200', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      ((..._args: unknown[]): never => {
        throw new Error('LLM_TOUCHED: globalThis.fetch');
      }) as unknown as typeof fetch,
    );
  });

  /**
   * CL-3（A-33-7）：REST 门面的第 2 个入参现在是 `deps: { events }`，不再是两个"接而不用"的
   * agent 代理 ⇒ 复习域**在签名上已经没有 agent/LLM 的位置**。事件采集器换成记账式探针，
   * 顺带补上 L-5 的取证：REST 侧评分现在也落一条 `event_type='review'` 的学情事件。
   */
  const eventsSeen: Array<{
    user_id: number;
    event_type: string;
    word_id: string;
    metadata?: Record<string, unknown>;
  }> = [];
  const eventsSink = {
    record: (e: (typeof eventsSeen)[number]): void => {
      eventsSeen.push(e);
    },
  };

  const app = () =>
    new Hono<AuthEnv>()
      .route('/', createReviewRouter(db, { events: eventsSink }))
      .route('/', createCheckinRouter(db));

  const call = async (userId: number, pathname: string, init: RequestInit = {}) => {
    const res = await app().request(pathname, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token(userId)}`, ...(init.headers ?? {}) },
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };

  for (const rating of RATING_VALUES) {
    it(`REST POST /api/review rating=${rating} → 200 且 response 位仍是空串（没有 LLM 文案）`, async () => {
      const res = await call(uid, '/api/review', {
        method: 'POST',
        body: JSON.stringify({ word: 'apple', rating }),
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.response).toBe('');
      expect(res.body.rating).toBe(rating);
      expect(typeof res.body.due).toBe('string');
    });
  }

  it('CL-3（A-33-7）：REST 侧评分现在也落学情事件，且事件面不引入任何 LLM 依赖', () => {
    // 上面四档各落一条；`events` 是这条路唯一被"真的调用到"的注入参数。
    expect(eventsSeen).toHaveLength(RATING_VALUES.length);
    for (const e of eventsSeen) {
      expect(e.user_id).toBe(uid);
      expect(e.event_type).toBe('review');
      expect(e.word_id).toBe('apple');
      expect(typeof e.metadata?.rating).toBe('number');
    }
    expect(eventsSeen.map((e) => e.metadata?.rating).sort()).toEqual([...RATING_VALUES].sort());
  });

  it('tRPC review.reviewCard 四档同样 200（ctx 里的 agentDeps/llmRouter 同样是触之即抛）', async () => {
    const ctx = {
      userId: uid,
      clientIp: '127.0.0.1',
      db,
      agentDeps: explodingProxy('agentDeps'),
      llmRouter: explodingProxy('llmRouter'),
      events: { record: (): void => {} },
    } as unknown as TrpcContext;
    const caller = createCallerFactory(review)(ctx);
    for (const rating of RATING_VALUES) {
      const out = (await caller.reviewCard({ word: 'apple', rating })) as unknown as Record<string, unknown>;
      expect(out.ok).toBe(true);
      expect(out.scheduled).toBe(true);
      expect(out.response).toBe('');
    }
    // 撤销与取队同样不碰 LLM
    const undone = (await caller.undo({ word: 'apple' })) as unknown as Record<string, unknown>;
    expect(undone.ok).toBe(true);
    const q = (await caller.queue({ mode: 'new' })) as unknown as Record<string, unknown>;
    expect(q.mode).toBe('new');
  });

  it('打卡两个门面也不依赖 LLM（判据：域后端唯一实现含打卡，R-13）', async () => {
    const status = await call(uid, '/api/checkin/status');
    expect(status.status).toBe(200);
    expect(Object.keys(status.body).sort()).toEqual(['checkedIn', 'dailyGoal', 'doneToday', 'dueToday', 'streak']);
    const wrote = await call(uid, '/api/checkin', { method: 'POST' });
    expect(wrote.status).toBe(200);
    expect(wrote.body.ok).toBe(true);

    const ctx = {
      userId: uid,
      clientIp: '127.0.0.1',
      db,
      agentDeps: explodingProxy('agentDeps'),
      llmRouter: explodingProxy('llmRouter'),
      events: { record: (): void => {} },
    } as unknown as TrpcContext;
    const caller = createCallerFactory(checkin)(ctx);
    expect(Object.keys((await caller.status()) as object).sort()).toEqual([
      'checkedIn',
      'dailyGoal',
      'doneToday',
      'dueToday',
      'streak',
    ]);
    expect((await caller.create()) as unknown as Record<string, unknown>).toMatchObject({ ok: true });
  });

  it('今日队列在 fetch 即抛的世界里照常返回（旧版这里是 runAgent 编排）', async () => {
    const res = await call(uid, '/api/review/today');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queue)).toBe(true);
  });
});

describe('判据①/② 静态面：复习域 8 文件不含 agent/LLM/fetch 引用', () => {
  for (const file of DOMAIN_FILES) {
    it(`${file} 干净`, () => {
      const code = codeOnly(file);
      for (const [label, re] of FORBIDDEN) {
        expect(re.test(code), `${file} 出现了 ${label}`).toBe(false);
      }
    });
  }
});

describe('判据① S13 半边：ts-fsrs 在 packages/server/src 只有 services/fsrs.ts 一个入口', () => {
  it('全量扫描 server 源码，import from ts-fsrs 的文件集合 = {services/fsrs.ts}', () => {
    const importers = walk(SERVER_SRC)
      .filter((f) => /from\s+['"]ts-fsrs['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SERVER_SRC, f).replaceAll('\\', '/'))
      .sort();
    console.log(`[T-10 判据①] packages/server/src 内 import 'ts-fsrs' 的文件 = ${JSON.stringify(importers)}`);
    expect(importers).toEqual(['services/fsrs.ts']);
  });
});
