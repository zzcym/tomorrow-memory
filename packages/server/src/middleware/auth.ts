/**
 * JWT 认证中间件（与 server.js 行为完全一致）
 */

import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config.js';

export type AuthEnv = {
  Variables: {
    userId: number;
    isAdmin: boolean;
  };
};

/** 用户认证：Authorization: Bearer <token> → c.set('userId', id) */
export async function auth(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  try {
    const config = loadConfig();
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    c.set('userId', payload.id as number);
    return next();
  } catch {
    return c.json({ error: '登录已过期' }, 401);
  }
}

/** 管理认证：payload.admin 必须为 true */
export async function adminAuth(c: Context<AuthEnv>, next: Next): Promise<Response | void> {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  try {
    const config = loadConfig();
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    if (!payload.admin) throw new Error('not admin');
    c.set('isAdmin', true);
    return next();
  } catch {
    return c.json({ error: '无权限' }, 401);
  }
}
