/**
 * Hono 应用组装：中间件 + 全部路由 + tRPC + WebSocket + 静态文件
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { trpcServer } from '@hono/trpc-server';
import { createNodeWebSocket } from '@hono/node-ws';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AgentDeps, LlmRouter } from '@tm/agent';
import type { AppConfig } from './config.js';
import type { AppDB } from './db/types.js';
import { bearerToken, registerAuthDeps, verifyToken, type AuthEnv } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createVersionRouter } from './routes/version.js';
import { createAdminFlagsRouter } from './routes/admin-flags.js';
import { createWordbookRouter } from './routes/wordbook.js';
import { createProfileRouter } from './routes/profile.js';
import { createAvatarRouter } from './routes/avatar.js';
import { createCheckinRouter } from './routes/checkin.js';
import { createAnalystRouter } from './routes/analyst.js';
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
import { appRouter } from './trpc/routers/index.js';
import type { TrpcContext } from './trpc/init.js';
import { TRPCError } from '@trpc/server';
import { createAuthService, type AuthService } from './services/auth-service.js';
import { createFeatureFlags, parseFlagsSeed, type FeatureFlags } from './services/feature-flags.js';
import { createAccountAudit } from './services/account-audit.js';
import { credentialErrorBody, isTmAuthError, tmErrorCause } from './services/password-policy.js';
// P-1a：两个请求体上限的**唯一真相在 `@tm/shared/constants/limits`**（`HTTP_BODY_LIMIT_BYTES` 512KB、
// `WORDBOOK_BODY_LIMIT_BYTES` 8MB，§4.5 原话）。`services/avatar-service.ts:229` 与
// `trpc/routers/profile.ts:88` 都已按"`app.ts` 用这两个常量兜住"写了假设，装配点曾是唯一没兑现的一方。
import {
  errorMessage,
  HTTP_BODY_LIMIT_BYTES,
  TM_ERROR_CODES,
  tmErrorBody,
  WORDBOOK_BODY_LIMIT_BYTES,
} from '@tm/shared';

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
  /**
   * T-07 追加（只加键，既有两个消费方一字未改）：装配出来的运行时开关面。
   * 集成用例翻转 `feature_flags` 后需要 `invalidate()` 让本进程立刻看到新值；
   * 发布步 8 的读回也用它，不另起第二份开关实例（那会让 30 秒 TTL 变成两份真相）。
   */
  flags: FeatureFlags;
  /** 凭据域服务实例（REST 与 tRPC 共用同一份，R-39①）。 */
  authService: AuthService;
}

/** HTTP 请求指标（Prometheus） */
const httpRequests = metrics.counter('http_requests_total', 'HTTP 请求总数');
const httpDuration = metrics.histogram('http_request_duration_seconds', 'HTTP 请求耗时');

export function createApp(deps: AppDeps): AppRuntime {
  const { config, db, sms, lookup, agentDeps, llmRouter, events, analyst, cache } = deps;
  const app = new Hono<AuthEnv>();

  // ═════ T-07 全局装配（§10.2 T-07 判据⑦）：凭据域三件套 + db 注入 + 门禁接线 ═════
  // 三级取值：`feature_flags` 表 → `FEATURE_FLAGS_JSON` 种子 → `FEATURE_FLAG_DEFAULTS`（PRD §6.4-7）。
  const flags: FeatureFlags = createFeatureFlags(db, { seed: parseFlagsSeed(config.featureFlagsSeedJson) });
  const audit = createAccountAudit(db);
  const authService: AuthService = createAuthService({ db, flags, audit, sms, jwtSecret: config.jwtSecret });
  // `middleware/auth.ts` 的吊销判定要查 `password_changed_at`；这里注册的就是全应用唯一那份 AppDB。
  registerAuthDeps(db);
  // 把 AppDB 放进上下文变量，`auth()` 中间件优先读 `c.get('db')`（多实例测试不再依赖模块级状态）。
  app.use('*', async (c, next) => {
    c.set('db', db);
    await next();
  });

  // CORS：默认 *（开发便利），生产通过 CORS_ORIGIN 配置真实域名（逗号分隔多个）
  const corsOrigins = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  app.use('*', cors(corsOrigins[0] === '*' ? {} : { origin: corsOrigins }));
  // 请求体上限（§4.5 / RK-07，P-1a）：全局 `HTTP_BODY_LIMIT_BYTES` = **512KB**，
  // 词本整本覆写单独放宽到 `WORDBOOK_BODY_LIMIT_BYTES` = 8MB（`wordbooks` 数组可达 20000 条）。
  //
  // 为什么原来是 200KB 就是缺陷：合法头像 300KB 解码后是 base64 正文 409_600 字符
  // （`avatar-service.ts:257 AVATAR_MAX_DATA_URL_CHARS = ceil(300*1024*4/3)+512` = 410_112），
  // 整个 JSON 请求体 ≈ 410KB **> 204_800** ⇒ `bodyLimit` 抢在 R-04 的判定之前返回 413，
  // 判据③ 那条 150KB~300KB 的合规 JPEG 在真机上**永远走不到**统一上限判定，
  // `AVATAR_TOO_LARGE` 那条 shared 人话也就永远不会被用户看到（C-18 换了个形态复现）。
  //
  // 为什么分桶写在装配点而不是 `routes/wordbook.ts` 自己挂：§4.5 把两档上限都记在 `app.ts` 名下，
  // 且那个文件在 T-07 的禁触面上；上限与开关同理"一处读"（PRD §6.4-5-5）。
  const globalBodyLimit = bodyLimit({
    maxSize: HTTP_BODY_LIMIT_BYTES,
    // ⚠ 本档 §4.6 冻结表里**没有对应码**（`TM_ERRORS` / `TM_ERRORS_SUPPLEMENT` 全库 grep `413`
    // 与 `REQUEST_TOO_LARGE` 均 0 命中）。批次3 期间 `packages/shared/**` 冻结（A-28-4 / A-30-7），
    // 所以本轮**不新增任何字面文案**：沿用装配表原有的 `{error}` 单键形状，缺码已登记为待裁决
    // （报告 §4，走 T-03 的 supplement 纯追加通道，同 T-11 P-4）。
    // 关键在于：**用户真正会撞的两条超限路径都不再从这一档出去** ——
    //  头像 >300KB → 现在能进到判定层，拿 `AVATAR_TOO_LARGE`「图片太大，请换一张 300KB 以内的」；
    //  词本 >8MB → 走下面那一档，拿 `WORDBOOK_TOO_LARGE`（与 `wordbook-service.ts:603` 同一条）；
    //  词本 200KB~8MB 这一段则从"被 413 挡死"变成**能处理**。剩下真正命中本档的只有异常大 payload，
    //  那是防超大 JSON 存储滥用的闸，不是 P0 人话路径（§4.6 末段禁的是 500 与"请求失败"）。
    //
    // TODO(T-03 / 报告 H-1)：shared 的 `TM_ERRORS_SUPPLEMENT` 追加 `REQUEST_TOO_LARGE`
    //   （http 413 + §4.6 人话）后，把下面这一行换成
    //   `const { status, body } = tmErrorBody(TM_ERROR_CODES.REQUEST_TOO_LARGE); return c.json(body, status)`，
    //   形态照抄 `wordbookBodyLimit` 那一档即可，装配点无需再判一次语义。
    //   在此之前**不要**在这里新写中文文案（B-3：文案一律 import `@tm/shared`）。
    onError: (c) => c.json({ error: '请求体过大' }, 413),
  });
  const wordbookBodyLimit = bodyLimit({
    maxSize: WORDBOOK_BODY_LIMIT_BYTES,
    // 这一档**直接用 §4.6 冻结表里的那一行**（`tmErrorBody()` = 服务端唯一出口）：
    // `wordbook-service.ts:603-609` 与 `wordbook-merge.ts:459` 本来就是"超限 → `WORDBOOK_TOO_LARGE`
    // （§4.6，400）"，所以"整本覆写大过 8MB"与"域内自己判出的超限"给出**同一条人话、同一个码、
    // 同一个 http**，不存在第二份真相，也不再是 `{error:'请求体过大'}` 那种机器话。
    onError: (c) => {
      const { status, body } = tmErrorBody(TM_ERROR_CODES.WORDBOOK_TOO_LARGE);
      return c.json(body, status as ContentfulStatusCode);
    },
  });
  app.use(
    '*',
    async (c, next) => {
      if (c.req.method === 'PUT' && c.req.path === '/api/wordbook') return wordbookBodyLimit(c, next);
      return globalBodyLimit(c, next);
    },
  );
  app.onError((err, c) => {
    // 凭据域错误兜底：路由内 `run()` 已翻过一次，这里兜住"从中间件/未包裹处抛出"的那几条，
    // 保证 P0 凭据路径不出现裸 500（§4.6 末段：任何 P0 路径都不得返回 500 或"请求失败"）。
    const mapped = credentialErrorBody(err);
    if (mapped) return c.json(mapped.body, mapped.status as ContentfulStatusCode);
    if (isTmAuthError(err)) {
      return c.json({ error: errorMessage(err.tmCode), code: err.tmCode }, err.status as ContentfulStatusCode);
    }
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
      createContext: async (opts) => {
        // 全应用唯一的 token 校验出口：吊销判定（R-40③）与 upgrade 标记（R-40④）都在这里，
        // 不再各入口各写一份 `jwt.verify`（原实现只 verify 签名，改密后旧 token 仍可用）。
        const token = bearerToken(opts.req.headers.get('authorization'));
        let userId: number | null = null;
        let passwordUpgradeOnly = false;
        try {
          const verified = await verifyToken(token, { secret: config.jwtSecret, db });
          if (verified) {
            userId = verified.userId;
            passwordUpgradeOnly = verified.upgradeOnly;
          }
        } catch (err) {
          const mapped = credentialErrorBody(err);
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: mapped?.body.error ?? '登录已过期',
            // A-30-1：经 `cause` 传 §4.6 码（`data` 直传在 tRPC v11 里被丢弃），
            // 由 `trpc/init.ts` 的 errorFormatter 提升为 `data.code` —— 客户端收到
            // `CREDENTIAL_EXPIRED` 才能执行"清凭据 + 跳登录"（R-40③）。
            cause: mapped?.body.code ? tmErrorCause(mapped.body.code) : null,
          });
        }
        const xff = opts.req.headers.get('x-forwarded-for');
        const clientIp = xff?.split(',')[0]?.trim() || opts.req.headers.get('x-real-ip') || 'unknown';
        return {
          userId,
          clientIp,
          passwordUpgradeOnly,
          auth: authService,
          flags,
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
  app.route('/', createAuthRouter(authService));
  // R-17⑨ 的版本清单（未登录可读，App 启动第 4 步）
  app.route('/', createVersionRouter(config));
  // §6.4-2 步 8：运行时开关的读回与改值（守卫只覆盖它自己的 `/api/admin/flags` 两条路径，
  // 不接管整个 `/api/admin/*` —— 那会让后挂的 `POST /api/admin/login` 不可达，见 A-32-3）
  app.route('/', createAdminFlagsRouter(flags));
  // A-32-2：必须注入装配层这**唯一一份** `flags`/`cache`。`routes/wordbook.ts` 的 `deps` 是可选的，
  // 不传就经 `wordbook-service.ts` 的 `flagsOf()` WeakMap 自建第二份 FeatureFlags ⇒ 管理后台改值
  // 只回填本实例的缓存，词本 REST 门面要再等一个 30 秒 TTL，且与 tRPC 门面（`ctx.flags`）
  // 在同一次放量里看到不同模式 —— 违反 PRD §6.4-5-5"开关一处读"。
  app.route('/', createWordbookRouter(db, { flags, cache }));
  // P-1b/P-1c（T-11 §6-U-2/U-3，与 A-32-2 同一形态的装配缺口，一次补完）：
  //  · `createProfileRouter` 第二入参是 `flags` 本身（`routes/profile.ts:29`），不是 `{flags}` 包装；
  //  · `createAvatarRouter` 此前**在装配表上根本不存在**（全库 grep 只有定义 + 测试引用），
  //    于是 §4.5 规划的 R-04 第三入口 `POST /api/avatar` 生产不可达。
  // 两处不注入的后果相同且不可观测：`routes/{profile,avatar}.ts` 里都是
  // `flags ? await flags.isOn('avatarUnifiedLimit') : true` ⇒ 缺省恒走 unified，
  // `avatarUnifiedLimit=off` 这条 §6.4-5-6 承诺的**一键回退**在生产装配上是纸面能力
  // （`off` 分支只有测试注入的 flags 走到过）。tRPC 门面不受影响（`ctx.flags` 早已注入）。
  app.route('/', createProfileRouter(db, flags));
  app.route('/', createAvatarRouter(db, flags));
  app.route('/', createCheckinRouter(db));
  app.route('/', createLookupRouter(lookup, events));
  app.route('/', createAdminRouter(db));
  // Phase 2：Multi-Agent API（新增，不影响旧 API）
  app.route('/', createAgentRouter(agentDeps, llmRouter, lookup, config));
  app.route('/', createTutorRouter(agentDeps, llmRouter));
  app.route('/', createReviewRouter(db, { events }));
  app.route('/', createAnalystRouter(db, { analyst, llmRouter }));

  // ===== 静态文件：只服务专用 public 目录（绝不指向仓库根，避免 .env/数据库/备份外泄） =====
  app.get('/admin', (c) => {
    const adminHtml = path.join(config.publicDir, 'admin.html');
    if (fs.existsSync(adminHtml)) {
      return c.html(fs.readFileSync(adminHtml, 'utf-8'));
    }
    return c.notFound();
  });
  app.use(
    '*',
    serveStatic({
      root: config.publicDir,
      index: 'index.html',
    }),
  );

  return { app, injectWebSocket, flags, authService };
}
