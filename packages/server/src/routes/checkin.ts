/**
 * 打卡路由
 */

import { Hono } from 'hono';
import { getDateStr } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';

export function createCheckinRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/checkin/status', auth, async (c) => {
    const userId = c.get('userId');
    const profile = await db.profiles.ensure(userId);
    const dailyGoal = profile.daily_goal || 10;
    const todayStr = getDateStr();
    const checkedIn = await db.checkins.isCheckedIn(userId, todayStr);
    return c.json({ dailyGoal, checkedIn });
  });

  r.post('/api/checkin', auth, async (c) => {
    const userId = c.get('userId');
    const todayStr = getDateStr();
    await db.checkins.checkin(userId, todayStr, Date.now());
    const streak = await db.checkins.getStreak(userId);
    return c.json({ ok: true, streak });
  });

  return r;
}
