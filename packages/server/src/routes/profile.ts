/**
 * 个人主页路由
 */

import { Hono } from 'hono';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createProfileRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/profile', auth, async (c) => {
    const userId = c.get('userId');
    const profile = await db.profiles.ensure(userId);
    const words = await db.wordbooks.getData(userId);
    const totalWords = words.length;
    const reviewDates = await db.checkins.getDates(userId);
    const reviewDays = reviewDates.length;
    return c.json({
      nickname: profile.nickname,
      avatar: profile.avatar,
      daily_goal: profile.daily_goal || 10,
      totalWords,
      reviewDays,
      reviewDates,
    });
  });

  r.put('/api/profile', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      nickname?: unknown;
      avatar?: unknown;
      daily_goal?: unknown;
    };
    const userId = c.get('userId');
    // 长度校验（与 tRPC 侧对齐）
    if (body.nickname !== undefined && (typeof body.nickname !== 'string' || body.nickname.length > 30)) {
      return c.json({ error: '昵称过长' }, 400);
    }
    if (body.avatar !== undefined && (typeof body.avatar !== 'string' || body.avatar.length > 200_000)) {
      // 200K 字符 ≈ 150KB 图片(base64);客户端压缩到 512px JPEG,网页版 1.5MB 校验远超此值属异常
      return c.json({ error: '头像数据过长' }, 400);
    }
    const current = await db.profiles.ensure(userId);
    await db.profiles.update(
      userId,
      {
        nickname: typeof body.nickname === 'string' ? body.nickname : undefined,
        avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        daily_goal:
          typeof body.daily_goal === 'number'
            ? body.daily_goal
            : typeof body.daily_goal === 'string'
              ? Number(body.daily_goal)
              : undefined,
      },
      Date.now(),
    );
    void current;
    return c.json({ ok: true });
  });

  return r;
}
