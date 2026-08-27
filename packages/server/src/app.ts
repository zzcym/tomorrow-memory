/**
 * Hono 应用组装：中间件 + 全部路由 + tRPC + WebSocket + 静态文件
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { trpcServer } from '@hono/trpc-server';
import { createNodeWebSocket } from '@hono/node-ws';
import jwt from 'jsonwebtoken';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import type { AppConfig } from './config.js';
import type { AppDB } from './db/types.js';
import type { AuthEnv } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createWordbookRouter } from './routes/wordbook.js';
import { createProfileRouter } from './routes/profile.js';
import { createCheckinRouter } from './routes/checkin.js';
import { createLookupRouter } from './routes/lookup.js';
import { createAdminRouter } from './routes/admin.js';
import { createAgentRouter } from './routes/agent.js';
import { createTutorRouter } from './routes/tutor.js';
import { createReviewRouter } from './routes/review.js';
import { createChatRouter } from './routes/chat.js';
import type { DictSources } from './services/dict-sources.js';
import type { LookupService } from './services/lookup.js';
import type { SmsService } from './services/sms.js';
import type { EventCollector } from './services/events.js';
import type { AnalystService } from './services/analyst.js';
import type { CacheService } from './services/cache.js';
import { metrics } from './telemetry/metrics.js';
import { appRouter } from './trpc/router.js';
import type { TrpcContext } from './trpc/init.js';

export interface AppDeps {
  config: AppConfig;
  db: AppDB;
  sms: SmsService;
  lookup: LookupService;
  dictSources: DictSources;
  agentDeps: AgentDeps;
  llmRouter: LlmRouter;
  /** 学情事件采集器（Phase 5） */
  events: EventCollector;
  /** 学情分析服务（Phase 5） */
  analyst: AnalystService;
  /** 缓存层（Phase 6） */
  cache: CacheService;
}

export interface AppRuntime {
  app: Hono<AuthEnv>;
  /** 注入 HTTP server 支持 WebSocket 升级（传给 @hono/node-server serve） */
  injectWebSocket: (server: Server) => void;
}

/** HTTP 请求指标（Prometheus） */
const httpRequests = metrics.counter('http_requests_total', 'HTTP 请求总数');
const httpDuration = metrics.histogram('http_request_duration_seconds', 'HTTP 请求耗时');

export function createApp(deps: AppDeps): AppRuntime {
  const { config, db, sms, lookup, agentDeps, llmRouter, events, analyst, cache } = deps;
  const app = new Hono<AuthEnv>();

  app.use('*', cors());
  app.onError((err, c) => {
    console.error('[ERROR]', err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  // HTTP 指标中间件
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    const status = c.res.status;
    httpRequests.inc({ method: c.req.method, path: c.req.path, status: String(status) });
    httpDuration.observe((performance.now() - started) / 1000, { method: c.req.method, path: c.req.path });
  });

  // ===== /metrics（Prometheus，Phase 5） =====
  app.get('/metrics', (c) => {
    c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.body(metrics.render());
  });

  // ===== WebSocket 对话（Phase 4） =====
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  app.route('/', createChatRouter(upgradeWebSocket, agentDeps, llmRouter, db));

  // ===== tRPC（Phase 3） =====
  app.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/trpc',
      router: appRouter,
      createContext: (opts) => {
        const header = opts.req.headers.get('authorization') ?? '';
        let userId: number | null = null;
        if (header.startsWith('Bearer ')) {
          try {
            const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
            if (typeof payload.id === 'number') userId = payload.id;
          } catch {
            userId = null;
          }
        }
        return {
          userId,
          db,
          agentDeps,
          llmRouter,
          lookup,
          sms,
          events,
          analyst,
          cache,
        } satisfies TrpcContext;
      },
    }),
  );

  // ===== API 路由（先注册，避免被静态文件吞掉） =====
  app.route('/', createAuthRouter(db, sms));
  app.route('/', createWordbookRouter(db));
  app.route('/', createProfileRouter(db));
  app.route('/', createCheckinRouter(db));
  app.route('/', createLookupRouter(lookup, events));
  app.route('/', createAdminRouter(db));
  // Phase 2：Multi-Agent API（新增，不影响旧 API）
  app.route('/', createAgentRouter(agentDeps, llmRouter, lookup, config));
  app.route('/', createTutorRouter(agentDeps, llmRouter));
  app.route('/', createReviewRouter(db, agentDeps, llmRouter));

  // ===== 静态文件（等价于 express.static(__dirname)） =====
  app.get('/admin', (c) => {
    const adminHtml = path.join(config.dataDir, 'admin.html');
    if (fs.existsSync(adminHtml)) {
      return c.html(fs.readFileSync(adminHtml, 'utf-8'));
    }
    return c.notFound();
  });
  app.use(
    '*',
    serveStatic({
      root: config.dataDir,
      index: 'index.html',
    }),
  );

  return { app, injectWebSocket };
}
