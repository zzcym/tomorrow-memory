/**
 * JWT 认证中间件（与 server.js 行为完全一致）
 *
 * T-07 追加两件事（R-40③④），且**全库只在这一处**做 token 校验：
 *  - `verifyToken()` 是唯一出口，REST 中间件、`trpc/init.ts` 的 createContext、
 *    WS 首帧鉴权（T-11）与 upgrade 判定全部复用它；
 *  - 吊销判定 `payload.iat < password_changed_at` → 401 `CREDENTIAL_EXPIRED`，
 *    配 60 秒进程内缓存（`REVOCATION_CACHE_TTL_SECONDS`），避免每请求查库。
 *
 * ⚠ 单位陷阱（这是"上线即大面积掉线"的直接成因，动这一行前务必读完）：
 * `password_changed_at` 落的是 **毫秒** epoch（与 `users.created_at`/`now` 同口径，见 T-06 的 setPassword），
 * 而 JWT 的 `iat` 是 **秒**。直接比较会让任何真实时间戳都命中 `iat < changed_at` → 全站掉线。
 * 因此比较前把毫秒换算成秒（向下取整）：同一秒内改密的旧 token 判为仍有效，
 * 由 60 秒缓存 TTL 兜住 R-40③ 的"≤60 秒内不可再用于任何写接口"。
 * `password_changed_at = 0`（全部存量行）换算后仍是 0，任何 `iat` 都不小于它 ⇒ **上线时刻零掉线**（R-40⑤ / §8.3-D-14）。
 */

import type { Context, Next } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import jwt from 'jsonwebtoken';
import { REVOCATION_CACHE_TTL_SECONDS, errorMessage } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { loadConfig } from '../config.js';
import { TmAuthError, isTmAuthError } from '../services/password-policy.js';
import { PASSWORD_GATE_ERROR, isTargetAllowedUnderGate, REST_UPGRADE_ALLOWLIST } from './password-gate.js';

export type AuthEnv = {
  Variables: {
    userId: number;
    isAdmin: boolean;
    /** 装配应用时注入的 AppDB；独立测试装配的路由拿不到它时回退到 `registerAuthDeps()` 注册的那一份 */
    db: AppDB | undefined;
    /** 本次请求携带的 token 是否为"只能改密"的 upgrade token（R-40④） */
    passwordUpgradeOnly: boolean;
  };
};

export interface JwtClaims {
  id: number;
  /** `pw-upgrade` = 强制改密专用短 TTL token；正常 token 不带该字段（claims 只加不删不改名，§6.3） */
  aud?: string;
  iat?: number;
}

export const UPGRADE_AUDIENCE = 'pw-upgrade';

export interface VerifiedToken {
  userId: number;
  /** true = 只能用于改密接口（R-40④） */
  upgradeOnly: boolean;
  iat: number;
}

/* ───────────────────── 吊销判定的依赖注入与 60 秒缓存 ───────────────────── */

let registeredDb: AppDB | null = null;
let warnedUnregistered = false;

/** 由 `createApp()` / `createAuthRouter()` 注册（同一份 AppDB 实例）。 */
export function registerAuthDeps(db: AppDB): void {
  registeredDb = db;
  warnedUnregistered = false;
}

/** 测试钩子：清掉"未注册"的一次性告警位。 */
export function __resetAuthDepsForTest(): void {
  registeredDb = null;
  warnedUnregistered = false;
  revokedCache.clear();
}

const revokedCache = new Map<number, { changedAtMs: number; at: number }>();

/** 改密 / 强制改密成功后立刻失效本用户缓存，让本进程"下一次请求"就看到新值。 */
export function invalidateRevocationCache(userId?: number): void {
  if (userId === undefined) revokedCache.clear();
  else revokedCache.delete(userId);
}

async function readPasswordChangedAt(userId: number, db?: AppDB): Promise<number> {
  const handle = db ?? registeredDb ?? undefined;
  if (!handle) {
    if (!warnedUnregistered) {
      warnedUnregistered = true;
      console.error('[auth] 未注册 AppDB，本次进程内跳过 token 吊销判定（只可能出现在单路由独立测试里）');
    }
    return 0;
  }
  const now = Date.now();
  const hit = revokedCache.get(userId);
  if (hit && now - hit.at < REVOCATION_CACHE_TTL_SECONDS * 1000) return hit.changedAtMs;
  const row = await handle.users.findCredentialsById(userId);
  const changedAtMs = row?.password_changed_at ?? 0;
  revokedCache.set(userId, { changedAtMs, at: now });
  return changedAtMs;
}

/**
 * 唯一的 token 校验出口（`middleware/auth.ts` 的 `auth()`、`trpc/init.ts`、WS 首帧都走它）。
 * @throws TmAuthError `CREDENTIAL_EXPIRED` —— 密码已改，旧 token 作废（R-40③）
 * @returns null 表示 token 缺失 / 签名不合法 / 已过期
 */
export async function verifyToken(
  token: string | null | undefined,
  opts: { secret: string; db?: AppDB },
): Promise<VerifiedToken | null> {
  if (!token) return null;
  let payload: JwtClaims;
  try {
    payload = jwt.verify(token, opts.secret) as JwtClaims;
  } catch {
    return null;
  }
  if (typeof payload.id !== 'number') return null;
  const upgradeOnly = payload.aud === UPGRADE_AUDIENCE;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const changedAtMs = await readPasswordChangedAt(payload.id, opts.db);
  if (changedAtMs > 0 && iat < Math.floor(changedAtMs / 1000)) {
    throw new TmAuthError('CREDENTIAL_EXPIRED');
  }
  return { userId: payload.id, upgradeOnly, iat };
}

/** 从 `Authorization: Bearer …` 取 token（SSE/WS 与 HTTP 头同一取法，R-05③）。 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** 用户认证：Authorization: Bearer <token> → c.set('userId', id)；命中门禁时 403。 */
export async function auth(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  let verified: VerifiedToken | null;
  try {
    verified = await verifyToken(header.slice(7), { secret: loadConfig().jwtSecret, db: c.get('db') });
  } catch (err) {
    if (isTmAuthError(err)) {
      return c.json(
        { error: errorMessage(err.tmCode), code: err.tmCode },
        err.status as ContentfulStatusCode,
      );
    }
    throw err;
  }
  if (!verified) {
    return c.json({ error: '登录已过期' }, 401);
  }
  c.set('userId', verified.userId);
  c.set('passwordUpgradeOnly', verified.upgradeOnly);
  // 硬门禁：upgrade token 只允许"改密 + 退出 + 读自己"，其余任何接口 403（R-40④）
  if (verified.upgradeOnly && !isTargetAllowedUnderGate(`${c.req.method} ${c.req.path}`, REST_UPGRADE_ALLOWLIST)) {
    return c.json(
      { error: PASSWORD_GATE_ERROR.message, code: PASSWORD_GATE_ERROR.code },
      PASSWORD_GATE_ERROR.status as ContentfulStatusCode,
    );
  }
  return next();
}

/** 管理认证：payload.admin 必须为 true */
export async function adminAuth(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  try {
    const payload = jwt.verify(header.slice(7), loadConfig().jwtSecret) as jwt.JwtPayload;
    if (!payload.admin) throw new Error('not admin');
    c.set('isAdmin', true);
    return next();
  } catch {
    return c.json({ error: '无权限' }, 401);
  }
}
