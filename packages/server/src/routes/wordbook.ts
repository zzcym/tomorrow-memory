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
    await db.wordbooks.saveData(c.get('userId'), body.data as WordbookEntry[], Date.now());
    return c.json({ ok: true });
  });

  return r;
}
