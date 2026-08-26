/**
 * 复习 API：FSRS 复习队列与评分更新
 *
 * - GET  /api/review/today       今日复习队列（R < 0.9 按 R 升序）
 * - POST /api/review             提交测评评分 → FSRS 更新
 *   body: { word, rating: 1|2|3|4 }
 */

import { Hono } from 'hono';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import { buildTodayQueue, runAgent } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createReviewRouter(db: AppDB, deps: AgentDeps, router: LlmRouter): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/review/today', auth, async (c) => {
    const userId = c.get('userId');
    const cards = await db.fsrs.getCardsByUser(userId);
    const queue = buildTodayQueue(cards.map((x) => ({ word: x.word, cardJson: x.fsrs_data })));
    return c.json({
      total: cards.length,
      dueToday: queue.length,
      queue: queue.map((q) => ({ word: q.word, retrievability: q.retrievability, elapsedDays: q.elapsedDays })),
    });
  });

  r.post('/api/review', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { word?: unknown; rating?: unknown };
    const word = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
    const rating = typeof body.rating === 'number' ? body.rating : Number(body.rating);
    if (!word) return c.json({ error: '请输入单词' }, 400);
    if (![1, 2, 3, 4].includes(rating)) {
      return c.json({ error: '评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松）' }, 400);
    }

    const state = await runAgent(deps, router, {
      userId: c.get('userId'),
      input: `测评 ${word} ${rating} 分`,
      word,
      rating: rating as 1 | 2 | 3 | 4,
    });

    return c.json({ ok: !state.error, response: state.response ?? '', error: state.error });
  });

  return r;
}
