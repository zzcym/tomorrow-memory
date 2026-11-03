/**
 * 凭据域 REST 路由（R-01 / R-39 / R-40）—— 全部业务判断在 `services/auth-service.ts`，
 * 本文件只做「HTTP 形状 ↔ service 调用」的翻译，与 `trpc/routers/auth.ts` 一一对应，
 * 两端同码同文案（R-39① 的"三出口 × 两协议共 6 例"）。
 *
 * 端点表（★ = 本期新增）：
 *   POST /api/send-code          通道未接：200 + `{ok:true, code:'SMS_NOT_CONFIGURED'}`（R-01⑥）
 *   POST /api/login              手机号 + 密码（本期主路径，R-01①）
 *   POST /api/register ★         注册 = 激活（同一 service 同一函数，R-39①）
 *   GET  /api/me                 附加 `user_id/daily_goal/pwPolicyVersion/upgradeRequired`（只加不改名）
 *   PUT  /api/password           改密：`oldPassword` 必填 + ≥8 位（R-40①②）
 *   POST /api/password/force ★   强制改密：upgrade token 换正常 token 的唯一出口（R-40④）
 *   POST /api/logout ★           登出（会话语义）：服务端只记审计，**不作废全量 token**（A-32-4）
 *
 * ⚠ 旧客户端红线（§6.2 / R-40⑩ / §10.2 判据⑥）：既有端点的**响应形状只加键不改键**，
 * 失败体仍是 `{error}`（新增可选 `code`），HTTP 状态按 §4.6 表。
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthResultDto, MeResultDto } from '@tm/shared';
import { auth, type AuthEnv } from '../middleware/auth.js';
import { clientIpFromHeaders } from '../middleware/rate-limit.js';
import type { AuthService, RequestMeta } from '../services/auth-service.js';
import { credentialErrorBody } from '../services/password-policy.js';

/**
 * 把 service 抛出的凭据错误翻成 §4.6 响应体；非凭据错误原样抛出（不得降级成 500 兜底）。
 *
 * `JsonArg` 必须是**浅**类型：`c.json` 的返回类型是 `Response & TypedResponse<JSONParsed<T>, …>`，
 * 而 `JSONParsed<>` 对 T 递归展开 —— 传 `Parameters<Context['json']>[0]`（= `JSONValue | {} | InvalidJSONValue`，
 * 其中 `JSONObject` 自引用）或 Hono 的 `JSONValue` 都会让它爆到递归上限（TS2589）。
 * 本路由实际回的就是"一层键值"的响应体，用浅记录即可，两个 `c.json` 调用点都过它。
 */
type JsonArg = Record<string, unknown>;

async function run<T>(c: Context<AuthEnv>, fn: () => Promise<T>): Promise<Response> {
  try {
    return c.json(await fn() as unknown as JsonArg, 200 as ContentfulStatusCode);
  } catch (err) {
    const mapped = credentialErrorBody(err);
    if (mapped) return c.json(mapped.body as unknown as JsonArg, mapped.status as ContentfulStatusCode);
    throw err;
  }
}

function metaOf(c: { req: { raw: Request; header(name: string): string | undefined } }): RequestMeta {
  return { ip: clientIpFromHeaders(c.req.raw.headers), ua: c.req.header('user-agent') ?? undefined };
}

async function bodyOf(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => ({}));
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export function createAuthRouter(authService: AuthService): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  // R-01⑥：通道未接。**不落验证码、不启动倒计时**，形状保留 + 附加可辨码。
  r.post('/api/send-code', (c) => {
    const meta = metaOf(c);
    return run(c, async () => {
      const body = await bodyOf(c);
      return authService.sendCode(body.phone, meta);
    });
  });

  // R-01①③：手机号 + 密码登录（验证码分支形状保留，见 auth-service.login 注释）
  r.post('/api/login', (c) => {
    const meta = metaOf(c);
    return run(c, async () => {
      const body = await bodyOf(c);
      return (await authService.login(
        { phone: String(body.phone ?? ''), password: body.password, code: body.code },
        meta,
      )) as AuthResultDto;
    });
  });

  // ★ R-39①：注册与激活同一个入口、同一个裁决点（`agreed` 未勾 → `AGREEMENT_REQUIRED`）
  r.post('/api/register', (c) => {
    const meta = metaOf(c);
    return run(c, async () => {
      const body = await bodyOf(c);
      return (await authService.registerOrActivate(
        {
          phone: String(body.phone ?? ''),
          password: String(body.password ?? ''),
          confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword : undefined,
          agreed: body.agreed === true,
        },
        meta,
      )) as AuthResultDto;
    });
  });

  // R-01⑧ 的公告位与两端拦截判据都读这里；upgrade token 也在白名单内（§4.7 ④）
  r.get('/api/me', auth, (c) =>
    run(c, async () => (await authService.me(c.get('userId'))) as MeResultDto),
  );

  // R-40①②：改密必验旧 + ≥8 位（旧版 `length < 4` 与"无 oldPassword"两处一并收紧）
  r.put('/api/password', auth, (c) => {
    const meta = metaOf(c);
    return run(c, async () => {
      const body = await bodyOf(c);
      return authService.changePassword(
        c.get('userId'),
        {
          oldPassword: typeof body.oldPassword === 'string' ? body.oldPassword : '',
          newPassword: String(body.newPassword ?? body.password ?? ''),
          confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword : undefined,
        },
        meta,
      );
    });
  });

  /**
   * ★ R-40④：强制改密页唯一出口。
   * 携带 upgrade token（`Authorization: Bearer`），成功后签发**正常** 30 天 token；
   * 除此之外没有任何路径能把 upgrade token 换成正常 token。
   */
  r.post('/api/password/force', auth, (c) => {
    const meta = metaOf(c);
    return run(c, async () => {
      const body = await bodyOf(c);
      return (await authService.forceChangePassword(
        c.get('userId'),
        {
          newPassword: body.newPassword,
          confirmPassword: body.confirmPassword,
          oldPassword: body.oldPassword,
        },
        meta,
      )) as AuthResultDto;
    });
  });

  // ★ 登出（A-32-4：会话语义，服务端不作废 token）；强制改密页的"退出登录"也走这里，故在门禁白名单内
  r.post('/api/logout', auth, (c) => {
    const meta = metaOf(c);
    return run(c, async () => authService.logout(c.get('userId'), meta));
  });

  return r;
}
