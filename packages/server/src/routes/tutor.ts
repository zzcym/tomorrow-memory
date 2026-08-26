/**
 * Tutor API：教学内容生成（带缓存）
 *
 * - GET /api/tutor?word=serendipity&level=B1 → { word, level, content, cached }
 */

import { Hono } from 'hono';
import type { CefrLevel } from '@tm/shared';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import { runAgent } from '@tm/agent';
import { auth, type AuthEnv } from '../middleware/auth.js';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function createTutorRouter(deps: AgentDeps, router: LlmRouter): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/tutor', auth, async (c) => {
    const word = (c.req.query('word') ?? '').trim().toLowerCase();
    if (!word) return c.json({ error: '请输入单词' }, 400);
    const levelParam = (c.req.query('level') ?? 'B1').toUpperCase();
    const level = LEVELS.includes(levelParam as CefrLevel) ? (levelParam as CefrLevel) : 'B1';

    const state = await runAgent(deps, router, {
      userId: c.get('userId'),
      input: `讲解一下 ${word}`,
      word,
      cefrLevel: level,
    });

    if (!state.tutorContent) {
      return c.json({ error: state.error ?? '生成失败' }, 500);
    }
    return c.json({ word, level, content: state.tutorContent, cached: false });
  });

  return r;
}
