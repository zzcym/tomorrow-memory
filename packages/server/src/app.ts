/**
 * Hono 应用组装：中间件 + 全部路由 + 静态文件
 */

import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import type { AppConfig } from './config.js';
import type { AppDB } from './db/types.js';
import type { AuthEnv } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createWordbookRouter } from './routes/wordbook.js';
import { createProfileRouter } from './routes/profile.js';
import { createCheckinRouter } from './routes/checkin.js';
import { createLookupRouter } from './routes/lookup.js';
import { createAdminRouter } from './routes/admin.js';
import type { DictSources } from './services/dict-sources.js';
import type { LookupService } from './services/lookup.js';
import type { SmsService } from './services/sms.js';

export interface AppDeps {
  config: AppConfig;
  db: AppDB;
  sms: SmsService;
  lookup: LookupService;
  dictSources: DictSources;
}

export function createApp(deps: AppDeps): Hono<AuthEnv> {
  const { config, db, sms, lookup, dictSources } = deps;
  const app = new Hono<AuthEnv>();

  app.use('*', cors());
  app.onError((err, c) => {
    console.error('[ERROR]', err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  // ===== API 路由（先注册，避免被静态文件吞掉） =====
  app.route('/', createAuthRouter(db, sms));
  app.route('/', createWordbookRouter(db));
  app.route('/', createProfileRouter(db));
  app.route('/', createCheckinRouter(db));
  app.route('/', createLookupRouter(lookup));
  app.route('/', createAdminRouter(db));

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

  void dictSources;
  return app;
}
