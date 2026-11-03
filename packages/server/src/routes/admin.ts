/**
 * 管理后台路由
 *
 * ⚠ T-07 注：运行时开关的两个端点（`GET|POST /api/admin/flags`，§6.4-2 步 8）**不在本文件**，
 * 在 `routes/admin-flags.ts`，由 `app.ts` 挂在同一个 `/api/admin` 前缀下、复用同一个 `adminAuth`。
 * 本文件的既有端点（登录 / 统计 / 备份 / 用户列表）一字未改。
 *
 * ⚠ 挂载顺序红线（A-32-3）：`POST /api/admin/login` 是**取 admin token 的唯一自助入口**，
 * 它自己必须在 `adminAuth` 之前可达。`admin-flags.ts` 的守卫因此只允许写 `/api/admin/flags`，
 * 不许写成 `/api/admin/*` —— 那会让本条 login 在任何凭据下都只能拿到"未登录"，
 * 发布 runbook 步 8（改开关）随之不可执行。取证用例：`test/contract/legacy-apk.spec.ts` 的
 * "真起服 + 真 HTTP" 一节（这类挂载顺序缺陷进程内单测看不见）。
 */

import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { maskPhone } from '@tm/shared';
import { loadConfig } from '../config.js';
import type { AppDB } from '../db/types.js';
import { adminAuth, type AuthEnv } from '../middleware/auth.js';
import { checkRateLimit, clientIpFromHeaders } from '../middleware/rate-limit.js';

/** 常量时间字符串比较（防时序侧信道） */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // 长度不同也要做一次比较，保持耗时稳定
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createAdminRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.post('/api/admin/login', async (c) => {
    // 防爆破：每 IP 5 次/分钟
    const rl = checkRateLimit(`adminlogin:${clientIpFromHeaders(c.req.raw.headers)}`, 5, 60_000);
    if (!rl.ok) return c.json({ error: '尝试过于频繁，请稍后再试' }, 429);

    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const config = loadConfig();
    // 未配置密码时：生产环境直接拒绝；非生产回落 admin888 并提示（与启动告警一致）
    const expected = config.adminPassword || (process.env.NODE_ENV !== 'production' ? 'admin888' : '');
    if (typeof body.password !== 'string' || expected === '' || !safeEqual(body.password, expected)) {
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
