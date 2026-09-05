/**
 * 查词路由（无认证，与旧版一致）
 */

import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth.js';
import { checkRateLimit, clientIpFromHeaders } from '../middleware/rate-limit.js';
import type { LookupService } from '../services/lookup.js';
import type { EventCollector } from '../services/events.js';

export function createLookupRouter(lookup: LookupService, events?: EventCollector): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/lookup', async (c) => {
    // 匿名端点转发第三方 API：每 IP 30 次/分钟，防配额放大滥用
    const rl = checkRateLimit(`lookup:${clientIpFromHeaders(c.req.raw.headers)}`, 30, 60_000);
    if (!rl.ok) return c.json({ error: '查询过于频繁，请稍后再试' }, 429);
    const word = (c.req.query('word') ?? '').trim();
    if (!word) return c.json({ error: '请输入单词' }, 400);
    if (word.length > 100) return c.json({ error: '单词过长' }, 400);

    const directionParam = c.req.query('direction') || 'auto';
    if (!['auto', 'en2zh', 'zh2en'].includes(directionParam)) {
      return c.json({ error: 'direction 参数无效，可选值: auto, en2zh, zh2en' }, 400);
    }

    try {
      const result = await lookup.lookup(word, directionParam as 'auto' | 'en2zh' | 'zh2en');
      if (result === null) {
        return c.json({ error: 'direction 参数无效，可选值: auto, en2zh, zh2en' }, 400);
      }
      // zh2en 未找到时返回 404（与旧版一致）
      if ('sourceLang' in result && result.sourceLang === 'zh' && result.error) {
        return c.json(result, 404);
      }
      // Phase 5：学情事件（异步，不阻塞；匿名用户 user_id=0）
      const userId = c.get('userId');
      events?.record({
        user_id: userId ?? 0,
        event_type: 'lookup',
        word_id: word,
        metadata: { direction: directionParam, hit: !('notFound' in result) || !result.notFound },
      });
      return c.json(result);
    } catch (err) {
      console.error('lookup error:', err);
      return c.json({ error: '查询服务暂时不可用，请稍后重试' }, 500);
    }
  });

  return r;
}
