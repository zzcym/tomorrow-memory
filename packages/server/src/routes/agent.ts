/**
 * Agent 路由：编排调用入口（JSON + SSE 流式）
 *
 * - POST /api/agent           运行完整 Agent 编排，返回最终状态（JSON）
 * - POST /api/agent/stream    SSE 流式：先返回静态查词结果，再流式追加 LLM 内容
 * - POST /api/agent/review    复习队列/测评评分（便捷入口）
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AgentDeps, AgentRunInput, LlmRouter } from '@tm/agent';
import { runAgent } from '@tm/agent';
import type { AppConfig } from '../config.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import type { LookupService } from '../services/lookup.js';

export function createAgentRouter(
  deps: AgentDeps,
  router: LlmRouter,
  lookup: LookupService,
  config: AppConfig,
): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  // 完整编排（JSON）
  r.post('/api/agent', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      input?: unknown;
      word?: unknown;
      rating?: unknown;
    };
    const input = body.input;
    if (typeof input !== 'string' || !input.trim()) {
      return c.json({ error: '请输入内容' }, 400);
    }
    const runInput: AgentRunInput = {
      userId: c.get('userId'),
      input: input.trim(),
      word: typeof body.word === 'string' ? body.word : undefined,
      rating: typeof body.rating === 'number' ? (body.rating as 1 | 2 | 3 | 4) : undefined,
    };
    try {
      const state = await runAgent(deps, router, runInput);
      return c.json({
        intent: state.intent,
        word: state.word,
        response: state.response ?? '',
        tutorContent: state.tutorContent,
        lookupResult: state.lookupResult,
        reviewQueue: state.reviewQueue,
        error: state.error,
        stats: router.stats(),
      });
    } catch (err) {
      console.error('[AGENT] 编排失败:', err);
      return c.json({ error: 'AI 服务暂时不可用' }, 500);
    }
  });

  // SSE 流式：先返回静态查词（毫秒级），再流式追加 LLM 教学内容
  r.post('/api/agent/stream', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown };
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    if (!input) return c.json({ error: '请输入内容' }, 400);

    return streamSSE(c, async (stream) => {
      const userId = c.get('userId');

      // 1. 先做静态查词（毫秒级，来自本地词典）
      const wordMatch = input.match(/[a-zA-Z][a-zA-Z'-]{1,63}/);
      const word = wordMatch ? wordMatch[0].toLowerCase() : input;
      const staticResult = await lookup.lookup(word, 'auto');
      await stream.writeSSE({
        event: 'static',
        data: JSON.stringify({ word, result: staticResult }),
      });

      // 2. 运行 Agent 编排（LLM 补充逐步到达）
      try {
        const state = await runAgent(deps, router, { userId, input, word });
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({
            intent: state.intent,
            response: state.response ?? '',
            tutorContent: state.tutorContent,
            llmSupplement: state.llmSupplement,
          }),
        });
      } catch (err) {
        console.error('[AGENT] SSE 编排失败:', err);
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'AI 服务暂时不可用' }) });
      }
      await stream.close();
    });
  });

  void config;
  return r;
}
