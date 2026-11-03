/**
 * 评分与模式的标签常量（R-02②③ / R-11① / R-12①，UI §6.1 命名口径）。
 * 数值域 `RATING_VALUES` 的唯一真相在 `constants/limits.ts`（完成判据⑤），本文件只做标签映射，
 * 两端（`packages/ui` 的 RatingBar / Web study 页 / App 背词页）一律 import，不得各写一套。
 */

import { QUEUE_MODES, RATING_VALUES } from './limits.js';
import type { QueueMode, RatingValue } from './limits.js';

/** UI §6.1：`RATING_LABELS` = `[1,2,3,4]` 对应"忘记 / 困难 / 良好 / 轻松"；禁止 Again/Hard/Good/Easy。 */
export const RATING_LABELS: Record<RatingValue, string> = {
  1: '忘记',
  2: '困难',
  3: '良好',
  4: '轻松',
};

/** 按数组序（与 `RATING_VALUES` 同序）取标签，供按钮渲染循环用。 */
export const RATING_LABELS_ORDERED = RATING_VALUES.map((v) => RATING_LABELS[v]);

/**
 * R-11①：桌面键盘映射 `←`=1、`→`=4、空格翻面。触屏提示语在 `copy.ts` 的
 * `REVIEW.touchHint`（触屏不显示键盘提示）。
 */
export const RATING_KEY_MAP: Record<string, RatingValue> = {
  ArrowLeft: 1,
  ArrowRight: 4,
};
/** 空格翻面（与 `copy.ts` 的翻面提示同源）。 */
export const CARD_FLIP_KEYS = [' ', 'Spacebar', 'Enter'] as const;

/** R-12①：三模式标签（命名固定，缩写与英文一律不出现）。 */
export const MODE_LABELS: Record<QueueMode, string> = {
  review: '今日复习',
  new: '学新词',
  selfTest: '随机自测',
};

/** 模式与数组序的映射（`?mode=` 的合法值即 `QUEUE_MODES`）。 */
export const MODE_VALUES = QUEUE_MODES;

/** UI §6.1 `formatStreak(n)`：`连续 N 天`（数字与"天"之间不空格）。 */
export function ratingLabel(rating: RatingValue | number | string): string {
  const n = Number(rating) as RatingValue;
  return RATING_LABELS[n] ?? '';
}

/** 评分按钮的可读标签：`{良好}，下次 4 天后`（UI §6.8）。间隔与单位由调用方传入的 `next` 提供。 */
export function ratingAriaLabel(rating: RatingValue | number | string, next: string): string {
  return `${ratingLabel(rating)}，下次 ${next}`;
}

/** 越界判定（R-02③：越界返回 4xx 而非静默截断）。 */
export function isRatingValue(v: unknown): v is RatingValue {
  return typeof v === 'number' && (RATING_VALUES as readonly number[]).includes(v);
}
