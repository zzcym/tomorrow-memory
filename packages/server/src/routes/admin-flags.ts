/**
 * `GET /api/admin/flags` / `POST /api/admin/flags`（§4.4.4 / PRD §6.4-2 步 8、§6.4-5-5）
 *
 * 这是"止血动作不依赖重新发版"的那条通道：发布前预演与线上止血都靠它改运行时开关，
 * 生效上界 `FLAG_EFFECTIVE_MAX_SECONDS`（60 秒）= 本进程 30 秒 TTL 立即失效 + 其它进程最多一个 TTL。
 *
 * 鉴权沿用 `routes/admin.ts` 的同一套：`POST /api/admin/login` 换 `payload.admin=true` 的 JWT，
 * 本路由的两条路径挂在 `adminAuth` 之后 —— **不对普通用户开放**，也不进强制改密白名单。
 * 守卫的作用域**只有 `/api/admin/flags`**（不接管整个 `/api/admin/*`，否则 login 自己就被拦住，A-32-3）。
 *
 * ⚠ 本文件不解释任何开关的业务语义，也不点名 `passwordUpgradeEnforce`：
 * 键名与默认值来自 `@tm/shared/constants/flags`，业务侧唯一读取点在 `auth-service.issueTokens`
 * （PRD §6.4-5-5 的边界；`boundaries.mjs --flags` 按引用点计数）。
 */

import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  FEATURE_FLAGS,
  FLAG_EFFECTIVE_MAX_SECONDS,
  type FeatureFlagKey,
} from '@tm/shared';
import { adminAuth, type AuthEnv } from '../middleware/auth.js';
import type { FeatureFlags } from '../services/feature-flags.js';

/** 合法取值形态：`on` / `off` / `0%~100%` / `on(HH:MM)`（与 `parseFlagValue` 的解析面一致）。 */
const FLAG_VALUE_RE = /^(on|off|\d{1,3}%|on\([^()\s]{1,16}\))$/i;

function isFlagKey(v: unknown): v is FeatureFlagKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, v);
}

function assertFlagValue(v: unknown): string {
  if (typeof v !== 'string' || !FLAG_VALUE_RE.test(v.trim())) {
    throw new Error('取值只能是 on / off / 0%~100% / on(HH:MM)');
  }
  const value = v.trim();
  const percent = /^(\d{1,3})%$/.exec(value);
  if (percent && Number(percent[1]) > 100) {
    throw new Error('放量百分比不得大于 100');
  }
  return value;
}

export function createAdminFlagsRouter(flags: FeatureFlags): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();
  const guarded = new Hono<AuthEnv>();

  // ⚠ 守卫路径**只能覆盖本文件自己的两条路径**，不能写整段 `/api/admin/*`（A-32-3）：
  // 本路由以 `'/'` 挂进 app，`app.ts` 里 `createAdminRouter`（`POST /api/admin/login`）在它**之后**才挂，
  // 而 Hono 的 `use` 是按路径匹配的中间件、会先于后挂路由的 handler 执行 ⇒
  // 写成 `/api/admin/*` 会让"用 `.env` 里的 ADMIN_PASSWORD 登进后台"这条自助通道整体不可达，
  // 拿到的却是 `middleware/auth.ts` 的 `401 未登录`（不是 `routes/admin.ts` 的"密码错误"）。
  // 另一个坑是同一条 `use('*')` 会命中全站、把 `/api/wordbook` 等既有接口整体变成 401
  // （由 test/integration/auth-register.spec.ts 的"激活后词本可见"暴露，已登记进 T-07 报告）。
  // 鉴权语义不变：**未登录 / 非管理员拿不到任何 admin 能力**（`adminAuth` 要求 `payload.admin===true`，
  // 普通用户 token 也是 401 无权限），只是守卫的作用域从"整个后台前缀"收窄到"开关这一条路径"。
  guarded.use('/api/admin/flags', adminAuth);
  guarded.use('/api/admin/flags/*', adminAuth);

  /** 步 8 的"读回初值"：全量列出，`source` 标明这一行来自 DB 还是种子/PRD 默认值。 */
  guarded.get('/api/admin/flags', async (c) => {
    const list = await flags.list();
    return c.json(
      {
        flags: list,
        /** 改值后的生效上界（本进程立即，跨进程 ≤ 该值），发布前预演据此判断"要不要等"。 */
        effectiveWithinSeconds: FLAG_EFFECTIVE_MAX_SECONDS,
      },
      200 as ContentfulStatusCode,
    );
  });

  /** 改值：写库 + 立刻回填本进程缓存（`FeatureFlags.set` 的既有语义），返回写后的那一行。 */
  guarded.post('/api/admin/flags', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
    if (!isFlagKey(body.key)) {
      return c.json({ error: '未知开关名，可先 GET /api/admin/flags 取全量键' }, 400);
    }
    let value: string;
    try {
      value = assertFlagValue(body.value);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    const written = await flags.set(body.key, value);
    return c.json({ ...written, effectiveWithinSeconds: FLAG_EFFECTIVE_MAX_SECONDS }, 200 as ContentfulStatusCode);
  });

  return r.route('/', guarded);
}
