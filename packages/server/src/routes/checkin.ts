/**
 * 打卡路由（REST 门面，R-13③⑤）
 *
 * - GET  /api/checkin/status   `{ dailyGoal, checkedIn, streak, doneToday, dueToday }`
 *   旧版只有前两键 → **只加不改名**（PRD §6.1-3）；`streak` 让"完成页 / 我的页 / 红点"
 *   三处在同一时刻读到同一个连续天数（R-13⑥）。
 * - POST /api/checkin          今天打卡（幂等）→ `{ ok, streak }`，形状与旧版一致
 */

import { Hono } from 'hono';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import { checkinStatus, checkinToday } from '../services/checkin-service.js';

export function createCheckinRouter(db: AppDB): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/checkin/status', auth, async (c) => {
    return c.json(await checkinStatus(db, c.get('userId')));
  });

  r.post('/api/checkin', auth, async (c) => {
    return c.json(await checkinToday(db, c.get('userId')));
  });

  return r;
}
