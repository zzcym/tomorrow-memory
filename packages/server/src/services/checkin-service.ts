/**
 * T-10 · 打卡域**唯一实现**（§4.2：现 `routes/checkin.ts` 抽服务，R-13③⑤⑥）。
 *
 * REST `/api/checkin*` 与 tRPC `checkin.*` 两个门面都只转调本文件，
 * 「连续天数」在两门面、两页面（完成页 / 我的页）与 App 红点上**必须是同一个数**（R-13⑥），
 * 所以这里只读 `db.checkins.getStreak` 一个来源，不在门面里各算一遍。
 */

import { getDateStr, DAILY_GOAL_DEFAULT } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { todayQueue } from './queue-service.js';

export interface CheckinStatus {
  dailyGoal: number;
  checkedIn: boolean;
  streak: number;
  /** 今日已背张数（`今天 done/goal` 的分子）：以卡的 `last_review` 落在今日为准。 */
  doneToday: number;
  /** 今日待背数（R-18① 红点），与 `queue-service` 的 `dueToday` 同口径。 */
  dueToday: number;
}

function startOfToday(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** 打卡状态（幂等读；未打卡时 `streak` 仍是"截至今日或昨日"的连击数，DB 层已定口径）。 */
export async function checkinStatus(db: AppDB, userId: number, now = new Date()): Promise<CheckinStatus> {
  const today = getDateStr(now);
  const [profile, checkedIn, streak, cards] = await Promise.all([
    db.profiles.ensure(userId),
    db.checkins.isCheckedIn(userId, today),
    db.checkins.getStreak(userId),
    db.fsrs.getCardsByUser(userId),
  ]);
  const from = startOfToday(now);
  const doneToday = cards.filter((c) => c.last_review !== null && c.last_review >= from).length;
  // 待背数走队列的同一份算法（纯读分支），R-13⑥ 的"三处同一时刻相等"才有解。
  const { dueToday } = await todayQueue(db, userId, now, { bootstrap: false });
  return {
    dailyGoal: profile.daily_goal || DAILY_GOAL_DEFAULT,
    checkedIn,
    streak,
    doneToday,
    dueToday,
  };
}

export interface CheckinResult {
  ok: true;
  date: string;
  streak: number;
}

/**
 * 今天打卡。`db.checkins.checkin` 本身幂等（已存在即忽略），所以连点两次不会多出一行，
 * `streak` 也仍是同一个数 —— R-13⑤ 的"不虚假成功"由这里返回真值保证。
 */
export async function checkinToday(db: AppDB, userId: number, now = new Date()): Promise<CheckinResult> {
  const date = getDateStr(now);
  await db.checkins.checkin(userId, date, now.getTime());
  const streak = await db.checkins.getStreak(userId);
  return { ok: true, date, streak };
}
