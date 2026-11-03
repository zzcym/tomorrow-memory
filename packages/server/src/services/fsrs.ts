/**
 * T-10 · `ts-fsrs` 在 @tm/server 内的**唯一入口**（§10.2 T-10 行 / S13）。
 *
 * 全库 `import ... from 'ts-fsrs'` 只允许出现在本文件：机检 = depcruise 规则
 * `fsrs-version-lock`（`.dependency-cruiser.cjs` S13 段，from.pathNot 只放行本文件）。
 *
 * 为什么在 server 内重写一份而不是转引 `@tm/agent/tools/fsrs`：
 * R-02①（§4.3）要求复习域**可达闭包**内不得出现 `packages/agent`，穿透再导出也算，
 * 所以"复用 agent 的 fsrs 工具"与"评分路径不 import agent"互斥。本文件是后者的代价，
 * 也是 A-2 的落点：**版本钉死 4.7.1**（`pnpm-workspace.yaml: overrides`），
 * `fsrs_cards.data` 的序列化格式由本文件的 `cardToJson` 独占决定，一字不改（判据⑥）。
 *
 * `cardFromJson` / `cardToJson` / `createDefaultCard` / `retrievability` / `buildTodayQueue`
 * 与 `packages/agent/src/tools/fsrs.ts` 逐字段等价（只读比对，不 import），
 * 目的是让**存量线上卡片**在新路径下解出同一张卡。agent 那份的退役属 agent 域（本期不动）。
 */

import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';

/** 今日复习阈值：R 低于该值的卡片进队列（与存量实现同值）。 */
export const REVIEW_THRESHOLD = 0.9;

/** 新卡默认参数（S=1 / D=5），与 `src/scripts/init-fsrs.ts` 建卡口径一致。 */
export const DEFAULT_STABILITY = 1;
export const DEFAULT_DIFFICULTY = 5;

/** ts-fsrs 的声明版本（判据⑥ 的断言对象：它变了就说明序列化格式要重新对账）。 */
export const TS_FSRS_VERSION = '4.7.1';

/** 卡片状态枚举值（ts-fsrs State: 0=New 1=Learning 2=Review 3=Relearning）。 */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;

/**
 * 从 `fsrs_cards.data` 恢复卡片。
 * 逐字段读法与存量实现相同：缺字段即取 `createEmptyCard` 的默认值，不猜、不补算。
 */
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

/**
 * 序列化为 `fsrs_cards.data`。
 * ⚠ 键集合与键序是**线上存量数据的形状**，改动即污染排期（PRD §6.1-4 / A-2）——
 * `review-parity.spec.ts` 判据⑥ 用快照锁死这份输出。
 */
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

/** 新卡（S=1、D=5、state=New）。 */
export function createDefaultCard(now: Date = new Date()): Card {
  const card = createEmptyCard(now);
  card.stability = DEFAULT_STABILITY;
  card.difficulty = DEFAULT_DIFFICULTY;
  return card;
}

/**
 * 回忆概率 R(t) = exp(-t / S)（任务约定的指数式；ts-fsrs 内部是幂律，见下面幂律版）。
 * t = 距上次复习的天数。
 */
export function retrievability(card: Card, now: Date = new Date()): number {
  const last = card.last_review ?? card.due;
  const t = Math.max(0, (now.getTime() - new Date(last).getTime()) / 86_400_000);
  const s = Math.max(card.stability, 0.001);
  return Math.exp(-t / s);
}

/** 幂律版本（ts-fsrs 原生公式），供需要与 fsrs 输出对齐的场景使用。 */
export function retrievabilityPowerLaw(card: Card, now: Date = new Date()): number {
  const last = card.last_review ?? card.due;
  const t = Math.max(0, (now.getTime() - new Date(last).getTime()) / 86_400_000);
  const s = Math.max(card.stability, 0.001);
  return (1 + (t * 19) / 81 / s) ** -0.5;
}

export interface QueueEntry {
  word: string;
  retrievability: number;
  elapsedDays: number;
  cardJson: string;
}

/** 今日复习队列：state=New 恒进（首学），其余按 R < 阈值，按 R 升序（最该复习的在前）。 */
export function buildTodayQueue(
  cards: Array<{ word: string; cardJson: string }>,
  now: Date = new Date(),
): QueueEntry[] {
  return cards
    .map((c) => {
      const card = cardFromJson(c.cardJson);
      const last = card.last_review ?? card.due;
      const elapsedDays = Math.max(0, (now.getTime() - new Date(last).getTime()) / 86_400_000);
      return {
        word: c.word,
        retrievability: retrievability(card, now),
        elapsedDays,
        cardJson: c.cardJson,
        state: card.state,
      };
    })
    .filter((i) => i.state === CardState.New || i.retrievability < REVIEW_THRESHOLD)
    .sort((a, b) => a.retrievability - b.retrievability)
    .map(({ state: _state, ...rest }) => rest);
}

/**
 * 应用一次评分（1=忘记 2=困难 3=良好 4=轻松）→ 新卡片。
 * `rating` 的取值域由调用方（`review-service`）按 `RATING_VALUES` 校验；这里越界即抛，
 * 不做 `Math.min/max` 截断（R-02③ 的红线）。
 */
export function applyRating(card: Card, rating: number, now: Date = new Date()): Card {
  const scheduler = fsrs();
  const result = scheduler.repeat(card, now);
  const next = (result as unknown as Record<number, { card?: Card } | undefined>)[rating];
  if (!next || !next.card) {
    throw new Error(`FSRS_REPEAT_FAILED: rating=${rating}`);
  }
  return next.card;
}

export type { Card };
export { Rating };
