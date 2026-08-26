/**
 * FSRS-5.0 调度工具（基于 ts-fsrs）
 *
 * - 卡片序列化/反序列化（与 server 端 fsrs_data JSON 格式兼容）
 * - retrievability：任务约定的核心公式 R(t) = exp(-t / S)
 *   （ts-fsrs 内部使用幂律 forgetting_curve，此处按任务要求用指数式；
 *    注释保留幂律实现，如需与 ts-fsrs 输出完全一致可切换）
 * - 今日复习队列：R < 0.9 按 R 升序
 * - 复习评分更新：Rating(1-4) → ts-fsrs repeat → 新卡片
 */

import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';

/** 复习阈值：R 低于该值的卡片进入今日队列 */
export const REVIEW_THRESHOLD = 0.9;

/** 任务约定默认新卡参数（与 server init-fsrs.ts 一致） */
export const DEFAULT_STABILITY = 1;
export const DEFAULT_DIFFICULTY = 5;

/** 从 JSON 恢复卡片（兼容 server 存入的 fsrs_data） */
export function cardFromJson(json: string): Card {
  const data = JSON.parse(json) as Record<string, unknown>;
  const card = createEmptyCard(new Date());
  if (typeof data.stability === 'number') card.stability = data.stability;
  if (typeof data.difficulty === 'number') card.difficulty = data.difficulty;
  if (typeof data.elapsed_days === 'number') card.elapsed_days = data.elapsed_days;
  if (typeof data.scheduled_days === 'number') card.scheduled_days = data.scheduled_days;
  if (typeof data.reps === 'number') card.reps = data.reps;
  if (typeof data.lapses === 'number') card.lapses = data.lapses;
  if (typeof data.state === 'number') card.state = data.state;
  if (data.due) card.due = new Date(String(data.due));
  if (data.last_review) card.last_review = new Date(String(data.last_review));
  return card;
}

/** 序列化卡片（与 server init-fsrs.ts 的 FsrsCardData 结构一致） */
export function cardToJson(card: Card): string {
  return JSON.stringify({
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  });
}

/** 新卡（S=1, D=5, New 状态） */
export function createDefaultCard(now: Date = new Date()): Card {
  const card = createEmptyCard(now);
  card.stability = DEFAULT_STABILITY;
  card.difficulty = DEFAULT_DIFFICULTY;
  return card;
}

/**
 * 回忆概率 R(t) = exp(-t / S)
 * t = 距上次复习的天数（elapsed days），S = stability
 * 说明：ts-fsrs 5.0 使用幂律 forgetting_curve(t, S) = (1 + t * 19/81 / S) ** -0.5；
 *       任务要求指数式 exp(-t/S)，两者在 S 较大时接近。
 */
export function retrievability(card: Card, now: Date = new Date()): number {
  const last = card.last_review ?? card.due;
  const elapsedMs = now.getTime() - new Date(last).getTime();
  const t = Math.max(0, elapsedMs / 86_400_000);
  const s = Math.max(card.stability, 0.001);
  return Math.exp(-t / s);
}

/** 幂律版本（ts-fsrs 原生公式），供需要与 fsrs 输出对齐的场景使用 */
export function retrievabilityPowerLaw(card: Card, now: Date = new Date()): number {
  const last = card.last_review ?? card.due;
  const elapsedMs = now.getTime() - new Date(last).getTime();
  const t = Math.max(0, elapsedMs / 86_400_000);
  const s = Math.max(card.stability, 0.001);
  return (1 + (t * 19) / 81 / s) ** -0.5;
}

/** 今日复习队列：R < 阈值，按 R 升序（最该复习的排最前） */
export function buildTodayQueue(
  cards: Array<{ word: string; cardJson: string }>,
  now: Date = new Date(),
): Array<{ word: string; retrievability: number; elapsedDays: number; cardJson: string }> {
  const items = cards
    .map((c) => {
      const card = cardFromJson(c.cardJson);
      const last = card.last_review ?? card.due;
      const elapsedDays = Math.max(0, (now.getTime() - new Date(last).getTime()) / 86_400_000);
      return { word: c.word, retrievability: retrievability(card, now), elapsedDays, cardJson: c.cardJson };
    })
    .filter((i) => i.retrievability < REVIEW_THRESHOLD)
    .sort((a, b) => a.retrievability - b.retrievability);
  return items;
}

export type { Card };
export { Rating };
export { fsrs };

/** 评分映射：1=Again 2=Hard 3=Good 4=Easy */
export const RATING_LABEL: Record<number, string> = {
  1: '忘记（Again）',
  2: '困难（Hard）',
  3: '良好（Good）',
  4: '轻松（Easy）',
};

/**
 * 应用一次复习评分，返回更新后的卡片（已按 ts-fsrs 5.0 更新 stability/difficulty/due）
 */
export function applyRating(card: Card, rating: 1 | 2 | 3 | 4, now: Date = new Date()): Card {
  const scheduler = fsrs();
  const result = scheduler.repeat(card, now);
  const next = (result as unknown as Record<number, { card?: Card } | undefined>)[rating];
  if (!next || !next.card) {
    throw new Error(`FSRS repeat 未返回评分 ${rating} 的结果`);
  }
  return next.card;
}
