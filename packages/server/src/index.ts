/**
 * 明日记忆后端服务入口（Hono + @hono/node-server）
 *
 * 启动流程：
 *  1. 加载环境变量配置
 *  2. 初始化数据库（按 DB_DRIVER 选择 pg / sqlite）
 *  3. 打开只读词典数据源
 *  4. 组装 Hono 应用并监听端口
 *  5. 调度每日备份 + 优雅关闭
 */

import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createAppDB } from './db/index.js';
import { createSmsService } from './services/sms.js';
import { createDictSources } from './services/dict-sources.js';
import { createYoudaoClient } from './services/youdao.js';
import { createDictionaryApiClient } from './services/dictionaryapi.js';
import { DefaultLookupService } from './services/lookup.js';
import { scheduleBackup } from './services/backup.js';
import { ClickHouseClient } from './services/clickhouse.js';
import { RedisService } from './services/redis.js';
import { EventCollector } from './services/events.js';
import { AnalystService } from './services/analyst.js';
import { initTracing, shutdownTracing } from './telemetry/tracing.js';
import type { AgentDeps } from '@tm/agent';
import { LlmRouter } from '@tm/agent';

// ===== 类型导出（供 apps/web 的 tRPC Client 使用；type-only import 无运行时副作用） =====
export type { AppRouter } from './trpc/router.js';
export type { TrpcContext } from './trpc/init.js';

async function main(): Promise<void> {
  const config = loadConfig();

  // JWT_SECRET 必填校验：无配置时拒绝启动（避免每次重启 token 失效 + 安全隐患）
  if (!config.jwtSecret) {
    console.error('[FATAL] JWT_SECRET 未配置，请在 .env 中设置 JWT_SECRET');
    process.exit(1);
  }

  // ===== OpenTelemetry（Phase 5）：先于一切启动，自动 instrument HTTP/PG/Redis =====
  initTracing({
    enabled: process.env.OTEL_ENABLED === 'true',
    endpoint: config.otelExporterUrl,
  });
  // LangSmith（LangGraph 追踪）：设置 LANGSMITH_TRACING=true + LANGSMITH_API_KEY 后自动生效
  if (process.env.LANGSMITH_TRACING === 'true' && config.langsmithApiKey) {
    console.log(`[LANGCHAIN] LangSmith 追踪已启用（project=${config.langsmithProject}）`);
  }

  // 数据库
  const db = createAppDB();
  await db.init();
  console.log(`[DB] ${config.dbDriver === 'pg' ? 'PostgreSQL' : 'SQLite'} initialized (driver=${config.dbDriver})`);

  // 词典数据源（只读）
  const dictSources = createDictSources(config);
  const youdao = createYoudaoClient(config);
  const dictApi = createDictionaryApiClient();
  const lookup = new DefaultLookupService(dictSources, youdao, dictApi);
  const sms = createSmsService();

  // ===== Phase 5：ClickHouse + Redis + 事件流 =====
  const clickhouse = new ClickHouseClient({ url: config.clickhouseUrl, tolerant: true });
  await clickhouse.init();
  const redis = new RedisService(config.redisUrl);
  await redis.connect();
  const events = new EventCollector(clickhouse, redis);
  await events.start();
  const analyst = new AnalystService(db, clickhouse, dictSources);

  // ===== Multi-Agent 编排依赖注入 =====
  const llmRouter = new LlmRouter({
    deepseekApiKey: config.deepseekApiKey,
    deepseekBaseUrl: config.deepseekBaseUrl,
    fallbackApiKey: process.env.OPENAI_API_KEY,
    fallbackBaseUrl: process.env.OPENAI_BASE_URL,
    fallbackModel: process.env.OPENAI_MODEL,
  });
  const agentDeps: AgentDeps = {
    tutorCache: db.tutorCache,
    fsrsCards: db.fsrs,
    wordbook: db.wordbooks,
    lookup,
    analystPort: analyst,
    getCefrLevel: async () => {
      // TODO: 用户 CEFR 水平暂未持久化，默认 B1；Phase 3+ 可在 profiles 表增加 cefr_level 字段
      return 'B1';
    },
  };
  console.log(`[AGENT] LLM ${llmRouter.hasLlm ? '已配置（DeepSeek）' : '未配置（降级启发式/规则模式）'}`);

  const runtime = createApp({ config, db, sms, lookup, dictSources, agentDeps, llmRouter, events, analyst });

  // 备份调度（仅 PG 驱动有意义；SQLite 模式跳过，避免无谓报错）
  if (config.dbDriver === 'pg') {
    scheduleBackup(config, config.databaseUrl);
  }

  const server = serve({ fetch: runtime.app.fetch, port: config.port }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  });
  // WebSocket 升级（Phase 4 实时对话）
  // @hono/node-server 可能返回 http2 server；node-ws 的注入按 http1 处理
  runtime.injectWebSocket(server as unknown as Server);
  console.log('[WS] WebSocket 已启用（/ws）');

  // 优雅关闭
  function gracefulShutdown(signal: string): void {
    console.log(`[SHUTDOWN] Received ${signal}, closing gracefully...`);
    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed');
      void events.stop();
      void redis.close();
      dictSources.close();
      db.close()
        .then(() => shutdownTracing())
        .then(() => {
          console.log('[SHUTDOWN] Database closed');
          process.exit(0);
        })
        .catch((err) => {
          console.error('[SHUTDOWN] DB close error:', err);
          process.exit(0);
        });
    });
    setTimeout(() => {
      console.log('[SHUTDOWN] Force exit');
      process.exit(0);
    }, 5000);
  }
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
