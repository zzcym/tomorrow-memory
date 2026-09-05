/**
 * 单词本路由
 */

import { Hono } from 'hono';
import type { WordbookEntry } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createWordbookRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/wordbook', auth, async (c) => {
    const data = await db.wordbooks.getData(c.get('userId'));
    return c.json({ data });
  });

  r.put('/api/wordbook', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { data?: unknown };
    if (!Array.isArray(body.data)) return c.json({ error: '数据格式错误' }, 400);
    // 条目结构/数量校验：防止任意形状/超大 JSON 入库（存储滥用）
    if (body.data.length > 20000) return c.json({ error: '单词数量超出上限（20000）' }, 400);
    const entries: WordbookEntry[] = [];
    for (const item of body.data) {
      const entry = item as { word?: unknown; addedAt?: unknown } | null;
      if (
        !entry ||
        typeof entry.word !== 'string' ||
        entry.word.trim().length === 0 ||
        entry.word.length > 100
      ) {
        return c.json({ error: '数据格式错误' }, 400);
      }
      entries.push({
        word: entry.word.trim().toLowerCase(),
        addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now(),
      });
    }
    await db.wordbooks.saveData(c.get('userId'), entries, Date.now());
    return c.json({ ok: true });
  });

  return r;
}
