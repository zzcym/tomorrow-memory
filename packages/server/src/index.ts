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
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createAppDB } from './db/index.js';
import { createSmsService } from './services/sms.js';
import { createDictSources } from './services/dict-sources.js';
import { createYoudaoClient } from './services/youdao.js';
import { createDictionaryApiClient } from './services/dictionaryapi.js';
import { DefaultLookupService } from './services/lookup.js';
import { scheduleBackup } from './services/backup.js';
import type { AgentDeps } from '@tm/agent';
import { LlmRouter } from '@tm/agent';

async function main(): Promise<void> {
  const config = loadConfig();

  // JWT_SECRET 必填校验：无配置时拒绝启动（避免每次重启 token 失效 + 安全隐患）
  if (!config.jwtSecret) {
    console.error('[FATAL] JWT_SECRET 未配置，请在 .env 中设置 JWT_SECRET');
    process.exit(1);
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
    getCefrLevel: async () => {
      // TODO: 用户 CEFR 水平暂未持久化，默认 B1；Phase 3+ 可在 profiles 表增加 cefr_level 字段
      return 'B1';
    },
  };
  console.log(`[AGENT] LLM ${llmRouter.hasLlm ? '已配置（DeepSeek）' : '未配置（降级启发式/规则模式）'}`);

  const app = createApp({ config, db, sms, lookup, dictSources, agentDeps, llmRouter });

  // 备份调度（仅 PG 驱动有意义；SQLite 模式跳过，避免无谓报错）
  if (config.dbDriver === 'pg') {
    scheduleBackup(config, config.databaseUrl);
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
  });

  // 优雅关闭
  function gracefulShutdown(signal: string): void {
    console.log(`[SHUTDOWN] Received ${signal}, closing gracefully...`);
    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed');
      dictSources.close();
      db.close()
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
