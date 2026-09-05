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
import { checkRateLimit } from '../middleware/rate-limit.js';

/** 会话保留轮数（20 轮 = 40 条消息） */
const MAX_ROUNDS = 20;

/** 单条消息长度上限（防止超长输入烧 token / 污染存储） */
const MAX_TEXT_LENGTH = 2000;
/** threadId 白名单格式 */
const THREAD_ID_RE = /^[\w-]{1,64}$/;
/** 每用户消息限流：10 条/分钟 */
const WS_MSG_PER_MIN = 10;

interface WsClientMessage {
  type?: string;
  text?: unknown;
}

function rejectUnauthed(ws: { send: (data: string) => void; close: (code?: number, reason?: string) => void }): void {
  ws.send(JSON.stringify({ type: 'error', error: '未登录或登录已过期' }));
  ws.close(4401, 'unauthorized');
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
            let msg: WsClientMessage;
            try {
              msg = JSON.parse(raw) as WsClientMessage;
            } catch {
              ws.send(JSON.stringify({ type: 'error', error: '消息格式错误' }));
              return;
            }
            const text = typeof msg.text === 'string' ? msg.text.trim() : '';
            if (!text) return;
            if (text.length > MAX_TEXT_LENGTH) {
              ws.send(JSON.stringify({ type: 'error', error: `消息过长（最多 ${MAX_TEXT_LENGTH} 字）` }));
              return;
            }

            // 认证（WebSocket 无法带 header，走 query token）
            // 注意：URL 必须取 WSContext.url（hono 注入），ws.raw 是 'ws' 库的原生
            // WebSocket，其上没有 url 属性——旧代码取 ws.raw.url 恒为 undefined，
            // 导致所有连接（含已登录用户）都被当成匿名，消息从未落库。
            const url = ws.url;
            const token = url?.searchParams.get('token') ?? '';
            const threadIdRaw = url?.searchParams.get('threadId') ?? 'default';
            // threadId 白名单：防止任意长/特殊字符进 prompt 与数据库
            const threadId = THREAD_ID_RE.test(threadIdRaw) ? threadIdRaw : 'default';

            // 认证（WebSocket 无法带 header，走 query token）：无 token 一律拒绝，防止匿名烧 token
            let userId: number | null = null;
            if (token) {
              try {
                const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
                if (typeof payload.id === 'number') userId = payload.id;
              } catch {
                rejectUnauthed(ws);
                return;
              }
            } else {
              rejectUnauthed(ws);
              return;
            }

            // per-user 消息限流（LLM 编排成本高）
            const rl = checkRateLimit(`ws:${userId}`, WS_MSG_PER_MIN, 60_000);
            if (!rl.ok) {
              ws.send(JSON.stringify({ type: 'error', error: `发送过于频繁，请 ${rl.retryAfterSeconds} 秒后再试` }));
              return;
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

  // 分片发送（模拟流式，前端打字机渲染）；连接已断开时立即停止空转
  const CHUNK = 24;
  const readyState = (): number | undefined => (ws as { raw?: { readyState?: number } }).raw?.readyState;
  for (let i = 0; i < text.length; i += CHUNK) {
    const rs = readyState();
    // WebSocket CLOSE_DONE/CLOSED = 3（READY_STATE_CLOSING/CLOSED）
    if (rs !== undefined && rs > 1) return;
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
