/**
 * 复习 API：FSRS 复习队列与评分更新
 *
 * - GET  /api/review/today       今日复习队列（R < 0.9 按 R 升序）
 * - POST /api/review             提交测评评分 → FSRS 更新
 *   body: { word, rating: 1|2|3|4 }
 */

import { Hono } from 'hono';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import { buildTodayQueue, cardToJson, createDefaultCard, runAgent } from '@tm/agent';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createReviewRouter(db: AppDB, deps: AgentDeps, router: LlmRouter): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/review/today', auth, async (c) => {
    const userId = c.get('userId');
    const wordbook = await db.wordbooks.getData(userId);
    const cards = await db.fsrs.getCardsByUser(userId);
    // 与单词本双向对齐:
    // 1) 单词本里的新词(尚无 FSRS 卡)→ 建默认 New 卡,立即进入队列,背单词范围与单词本一致
    const haveCard = new Set(cards.map((x) => x.word));
    const now = Date.now();
    const fresh: Array<{ word: string; cardJson: string }> = [];
    for (const w of wordbook) {
      if (haveCard.has(w.word)) continue;
      const json = cardToJson(createDefaultCard(new Date(now)));
      await db.fsrs.upsertCard(userId, w.word, json, null, now);
      fresh.push({ word: w.word, cardJson: json });
    }
    const queue = buildTodayQueue([
      ...cards.map((x) => ({ word: x.word, cardJson: x.fsrs_data })),
      ...fresh,
    ]);
    // 2) 队列中的历史词若不在单词本(跨端来源),自动补入
    const have = new Set(wordbook.map((w) => w.word));
    const missing = queue.filter((q) => !have.has(q.word));
    if (missing.length) {
      for (const m of missing) wordbook.push({ word: m.word, addedAt: Date.now() });
      await db.wordbooks.saveData(userId, wordbook, Date.now());
    }
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
