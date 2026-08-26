/**
 * WebSocket 实时对话（Phase 4）
 *
 *  - GET /ws?token=&threadId=    WebSocket 升级（LangGraph 编排 + HITL interrupt）
 *  - GET /api/chat/history       会话历史（最多 20 轮）
 *
 * 消息协议（JSON）：
 *  客户端 → 服务端: { type: 'message', text } | { type: 'resume', text }
 *  服务端 → 客户端: { type: 'chunk', text }（打字机增量）
 *                  { type: 'done', intent, word, response, error }
 *                  { type: 'interrupt', question }
 */

import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import jwt from 'jsonwebtoken';
import type { AgentDeps, LlmRouter, ThreadedAgent } from '@tm/agent';
import { createThreadedAgent } from '@tm/agent';
import { loadConfig } from '../config.js';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

/** 会话保留轮数（20 轮 = 40 条消息） */
const MAX_ROUNDS = 20;

interface WsClientMessage {
  type?: string;
  text?: unknown;
}

export function createChatRouter(
  upgradeWebSocket: UpgradeWebSocket,
  deps: AgentDeps,
  llmRouter: LlmRouter,
  db: AppDB,
): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const threaded: ThreadedAgent = createThreadedAgent(deps, llmRouter);
  const config = loadConfig();

  // ===== 会话历史 =====
  r.get('/api/chat/history', auth, async (c) => {
    const threadId = c.req.query('threadId') ?? 'default';
    const messages = await db.chat.getRecentMessages(c.get('userId'), threadId, MAX_ROUNDS * 2);
    return c.json({ threadId, messages });
  });

  // ===== WebSocket 对话 =====
  r.get(
    '/ws',
    upgradeWebSocket(() => {
      return {
        async onMessage(event, ws) {
          try {
            const raw = String(event.data ?? '');
            const msg = JSON.parse(raw) as WsClientMessage;
            const text = typeof msg.text === 'string' ? msg.text.trim() : '';
            if (!text) return;

            const rawWs = ws.raw as { url?: string } | undefined;
            const url = rawWs?.url ? new URL(rawWs.url) : null;
            const token = url?.searchParams.get('token') ?? '';
            const threadId = url?.searchParams.get('threadId') ?? 'default';

            // 认证（WebSocket 无法带 header，走 query token）
            let userId: number | null = null;
            if (token) {
              try {
                const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
                if (typeof payload.id === 'number') userId = payload.id;
              } catch {
                ws.send(JSON.stringify({ type: 'error', error: '登录已过期，请重新登录' }));
                return;
              }
            }

            // 记录用户消息
            if (userId !== null) {
              await db.chat.addMessage(userId, threadId, 'user', text, Date.now());
            }

            if (msg.type === 'resume') {
              // 恢复被 interrupt 暂停的执行
              const step = await threaded.resume(threadId, text);
              await sendStep(ws, step, db, userId, threadId);
              return;
            }

            // 正常消息 → 编排执行
            const step = await threaded.invoke(threadId, text, userId ?? undefined);
            await sendStep(ws, step, db, userId, threadId);
          } catch (err) {
            console.error('[WS] 消息处理失败:', err);
            ws.send(JSON.stringify({ type: 'error', error: 'AI 服务暂时不可用' }));
          }
        },
      };
    }),
  );

  return r;
}

/** 发送一步结果（含打字机增量 + 最终 done / interrupt） */
async function sendStep(
  ws: { send: (data: string) => void },
  step: Awaited<ReturnType<ThreadedAgent['invoke']>>,
  db: AppDB,
  userId: number | null,
  threadId: string,
): Promise<void> {
  // interrupt：暂停反问用户
  if (step.interrupt !== null) {
    if (userId !== null) {
      await db.chat.addMessage(userId, threadId, 'interrupt', step.interrupt, Date.now());
    }
    ws.send(JSON.stringify({ type: 'interrupt', question: step.interrupt }));
    return;
  }

  const state = step.result;
  const text = state?.response ?? state?.error ?? '';
  if (!text) {
    ws.send(JSON.stringify({ type: 'done', intent: state?.intent ?? null, response: '', error: '无响应' }));
    return;
  }

  if (userId !== null) {
    await db.chat.addMessage(userId, threadId, 'assistant', text, Date.now());
  }

  // 分片发送（模拟流式，前端打字机渲染）
  const CHUNK = 24;
  for (let i = 0; i < text.length; i += CHUNK) {
    ws.send(JSON.stringify({ type: 'chunk', text: text.slice(i, i + CHUNK) }));
    // 让浏览器有时间逐字渲染
    await new Promise((resolve) => setTimeout(resolve, 24));
  }

  ws.send(
    JSON.stringify({
      type: 'done',
      intent: state?.intent ?? null,
      word: state?.word ?? null,
      response: text,
      error: state?.error ?? null,
      tutorContent: state?.tutorContent ?? null,
      reviewQueue: state?.reviewQueue ?? null,
    }),
  );
}
