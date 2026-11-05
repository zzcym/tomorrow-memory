/**
 * T-10 · 复习队列**唯一实现**（R-12 三模式 / R-18 待背数 / R-02④）。
 *
 * - `review`   今日复习：R < 0.9（New 卡恒进），按 R 升序 —— 与旧 `GET /api/review/today` 一字不差
 * - `new`      学新词：词本内**无 FSRS 卡或 state=New** 的词，单次 ≤ 每日目标（R-12②）
 * - `selfTest` 随机自测：从词本随机抽（R-12④：走完不改任何卡的 `data/due`）
 *
 * 判据⑤ 的口径 = `todayQueue()` 的 `bootstrap:false` 分支：该分支内**没有一处**
 * `db.fsrs.upsertCard` / `db.wordbooks.saveData` / `db.snapshots.save` 调用，
 * 新词以"内存里的虚拟 New 卡"参与计数，所以 `fsrs_cards` 行数与内容一字不变
 * （断言见 `test/integration/review-parity.spec.ts`）。
 *
 * `gloss` 恒为空串：`AppDB`（T-06 冻结）没有 dictionary 域，批量释义属 T-11 的
 * `lookup` 契约 → 见报告 D-2，复习域不自带 IO。
 */

import {
  DAILY_GOAL_DEFAULT,
  NEW_WORD_BATCH_DEFAULT,
  type QueueItemDto,
  type QueueMode,
  type ReviewQueueResultDto,
} from '@tm/shared';
import type { AppDB, FsrsCardRow } from '../db/types.js';
import { CardState, buildTodayQueue, cardFromJson, cardToJson, createDefaultCard, type QueueEntry } from './fsrs.js';

/** 随机自测的最小词本规模（与 `STUDY_COPY.emptyQueue.selfTest` 的口径一致，见报告 D-2）。 */
export const SELF_TEST_MIN_WORDS = 5;

export interface TodayResult {
  total: number;
  dueToday: number;
  queue: QueueEntry[];
}

/**
 * 今日复习队列。
 *
 * `bootstrap:true`（默认）保留旧 `GET /api/review/today` 的两处存量副作用：词本内的新词补建
 * New 卡、队列里的历史词回补进词本 —— §10.2 第 130 行写的是「GET /api/review/today 不变」，
 * 响应形状与行为一起保持。它与 R-02④「只要登录就 mutate」的张力已记为遗留项 L-2。
 *
 * `bootstrap:false` 是纯读面：新词换成内存里的虚拟 New 卡，队列内容/数量与 `true` 分支一致，
 * 但一行库都不写。`mode=new/selfTest` 用它（判据⑤）。
 */
export async function todayQueue(
  db: AppDB,
  userId: number,
  now = new Date(),
  opts: { bootstrap?: boolean } = {},
): Promise<TodayResult> {
  const bootstrap = opts.bootstrap ?? true;
  const nowMs = now.getTime();
  const wordbook = await db.wordbooks.getData(userId);
  const cards = await db.fsrs.getCardsByUser(userId);

  const haveCard = new Set(cards.map((x) => x.word));
  const entries: Array<{ word: string; cardJson: string }> = cards.map((x) => ({
    word: x.word,
    cardJson: x.fsrs_data,
  }));
  for (const w of wordbook) {
    if (haveCard.has(w.word)) continue;
    const json = cardToJson(createDefaultCard(now));
    if (bootstrap) await db.fsrs.upsertCard(userId, w.word, json, null, nowMs);
    entries.push({ word: w.word, cardJson: json });
  }

  const queue = buildTodayQueue(entries, now);

  if (bootstrap) {
    const inBook = new Set(wordbook.map((w) => w.word));
    const missing = queue.filter((q) => !inBook.has(q.word));
    if (missing.length) {
      for (const m of missing) wordbook.push({ word: m.word, addedAt: nowMs });
      await db.wordbooks.saveData(userId, wordbook, nowMs);
    }
  }

  return {
    total: cards.length,
    dueToday: queue.length,
    queue,
  };
}

async function loadCards(db: AppDB, userId: number): Promise<Map<string, FsrsCardRow>> {
  const cards = await db.fsrs.getCardsByUser(userId);
  return new Map(cards.map((c) => [c.word.toLowerCase(), c]));
}

/** 卡存在且已离开 New —— 队列条目用来区分"首学"与"复习"（R-12③）。 */
function isSchooled(cards: Map<string, FsrsCardRow>, word: string): boolean {
  const row = cards.get(word);
  if (!row) return false;
  return cardFromJson(row.fsrs_data).state !== CardState.New;
}

function item(word: string, cards: Map<string, FsrsCardRow>): QueueItemDto {
  return { word, hasCard: isSchooled(cards, word), gloss: '' };
}

function take<T>(list: T[], limit: number): T[] {
  return list.slice(0, Math.max(0, limit));
}

/** Fisher-Yates，只动内存数组。 */
function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export interface BuildQueueInput {
  mode?: QueueMode;
  limit?: number;
}

export interface QueueResult extends ReviewQueueResultDto {
  /** 每日目标：`今天 done/goal` 的分母，与 `checkin-service` 同读 `profiles.daily_goal`。 */
  dailyGoal: number;
  /** 今日待背数（R-18① 红点）—— 与 `dueToday` 同值，单列给 App 侧红点直接取用。 */
  wordbookSize: number;
}

/**
 * 三模式取队（`GET /api/review/queue` / `tRPC review.queue`）。
 * `total` / `dueToday` 在三种模式下同口径，R-13⑥ 的"三处数字同一时刻一致"才有解。
 */
export async function buildQueue(
  db: AppDB,
  userId: number,
  input: BuildQueueInput = {},
  now = new Date(),
): Promise<QueueResult> {
  const mode: QueueMode = input.mode ?? 'review';
  const profile = await db.profiles.ensure(userId);
  const dailyGoal = profile.daily_goal || DAILY_GOAL_DEFAULT;
  const cap = Math.min(input.limit ?? NEW_WORD_BATCH_DEFAULT, dailyGoal);

  const today = await todayQueue(db, userId, now, { bootstrap: mode === 'review' });
  const wordbook = await db.wordbooks.getData(userId);
  const cards = await loadCards(db, userId);
  const words = [...new Set([...wordbook.map((w) => w.word.toLowerCase()), ...cards.keys()])];

  // 新词数在三种模式下算一次：首页胶囊要"优先显示还有几个词没学"（bug #1）。
  const fresh = words.filter((w) => !isSchooled(cards, w));
  const base = {
    mode,
    total: today.total,
    dueToday: today.dueToday,
    dailyGoal,
    wordbookSize: words.length,
    newAvailable: fresh.length,
  };

  if (mode === 'review') {
    return { ...base, queue: today.queue.map((q) => item(q.word, cards)) };
  }
  if (mode === 'new') {
    return { ...base, queue: take(fresh, cap).map((w) => item(w, cards)) };
  }
  if (words.length < SELF_TEST_MIN_WORDS) {
    return { ...base, queue: [] };
  }
  return { ...base, queue: take(shuffled(words), cap).map((w) => item(w, cards)) };
}
