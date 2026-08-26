/**
 * 管理后台路由
 */

import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { maskPhone } from '@tm/shared';
import { loadConfig } from '../config.js';
import type { AppDB } from '../db/types.js';
import { adminAuth, type AuthEnv } from '../middleware/auth.js';

export function createAdminRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.post('/api/admin/login', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const config = loadConfig();
    if (body.password !== config.adminPassword) {
      return c.json({ error: '密码错误' }, 401);
    }
    const token = jwt.sign({ admin: true }, config.jwtSecret, { expiresIn: '12h' });
    return c.json({ token });
  });

  r.get('/api/admin/stats', adminAuth, async (c) => {
    const totalUsers = await db.users.countAll();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const usersToday = await db.users.countCreatedSince(todayStart.getTime());
    const totalWords = await db.wordbooks.countAll();
    const wordbooks = await db.wordbooks.getAllWordbooks();
    const avgWords =
      totalUsers > 0 ? Math.round(wordbooks.reduce((sum, wb) => sum + wb.data.length, 0) / totalUsers) : 0;
    return c.json({ totalUsers, usersToday, totalWords, avgWords });
  });

  r.get('/api/admin/users', adminAuth, async (c) => {
    const page = parseInt(c.req.query('page') ?? '1', 10) || 1;
    const pageSize = parseInt(c.req.query('pageSize') ?? '20', 10) || 20;
    const total = await db.users.countAll();
    const users = await db.users.listAdminUsers(page, pageSize);
    for (const u of users) {
      u.phone = maskPhone(u.phone);
    }
    return c.json({ total, page, pageSize, users });
  });

  return r;
}
