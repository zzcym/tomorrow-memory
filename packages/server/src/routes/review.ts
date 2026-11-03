/**
 * 复习 API（REST 门面，§4.2 收敛规则 1：本文件只做"路径声明 + 入参取数 + 转调 service + 响应组装"）。
 *
 * - GET  /api/review/today  今日复习队列 —— **响应形状与旧版逐键不变**（旧 APK 契约，判据⑧）
 * - POST /api/review        提交四档评分 → 唯一实现 `services/review-service.ts`
 *   body: `{ word, rating: 1|2|3|4, mode?: 'review'|'new'|'selfTest' }`
 * - POST /api/review/undo   撤销上一张（R-11）
 * - GET  /api/review/queue  三模式取队（R-12，`?mode=&limit=`）
 *
 * 旧版这里跑的是 `runAgent()` 的 LLM 编排（审计 S2 的另一半）→ 现在与 tRPC 同源同函数。
 * CL-3（A-28-6 → A-33-7）：第 2 个入参从"接而不用的 `_agentDeps` / `_llmRouter`"改成
 * `deps: { events }` —— 复习域对 agent 的形参依赖彻底断开（`review-no-agent` 的静态面与
 * `test/review-no-llm.spec.ts` 的运行时面都不再多一处"挂着不用的代理"），
 * 同时补上 L-5 的缺口：REST 门面的评分此前**不落学情事件**，Phase 5 学情统计会漏掉 REST 流量。
 */

import { Hono } from 'hono';
import type { ReviewQueueResultDto } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import { buildQueue, todayQueue } from '../services/queue-service.js';
import {
  ReviewError,
  normalizeMode,
  rateCard,
  reviewErrorBody,
  undoRating,
  type RateContext,
} from '../services/review-service.js';

function limitOf(raw: string | undefined): number | undefined {
  const n = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** 服务层错误 → `{ error, code }`（§4.6 统一响应体）；非领域错误照旧冒泡给 Hono。 */
function failureOf(err: unknown): { body: { error: string; code: string }; status: number } | null {
  return err instanceof ReviewError ? reviewErrorBody(err) : null;
}

export function createReviewRouter(
  db: AppDB,
  deps: { events?: RateContext['events'] },
): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/review/today', auth, async (c) => {
    const today = await todayQueue(db, c.get('userId'));
    return c.json({
      total: today.total,
      dueToday: today.dueToday,
      queue: today.queue.map((q) => ({
        word: q.word,
        retrievability: q.retrievability,
        elapsedDays: q.elapsedDays,
      })),
    });
  });

  r.post('/api/review', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { word?: unknown; rating?: unknown; mode?: unknown };
    try {
      const outcome = await rateCard(
        db,
        {
          userId: c.get('userId'),
          word: body.word,
          rating: body.rating,
          mode: normalizeMode(body.mode),
        },
        { events: deps.events },
      );
      return c.json(outcome);
    } catch (err) {
      const f = failureOf(err);
      if (f) return c.json(f.body, f.status as 400);
      throw err;
    }
  });

  r.post('/api/review/undo', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { word?: unknown };
    try {
      return c.json(await undoRating(db, c.get('userId'), body.word));
    } catch (err) {
      const f = failureOf(err);
      if (f) return c.json(f.body, f.status as 400);
      throw err;
    }
  });

  r.get('/api/review/queue', auth, async (c) => {
    try {
      const mode = normalizeMode(c.req.query('mode'));
      const queue: ReviewQueueResultDto = await buildQueue(db, c.get('userId'), {
        mode,
        limit: limitOf(c.req.query('limit')),
      });
      return c.json(queue);
    } catch (err) {
      const f = failureOf(err);
      if (f) return c.json(f.body, f.status as 400);
      throw err;
    }
  });

  return r;
}
