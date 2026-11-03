/**
 * tRPC 域 assessment 的「纯部分」（A-21 域内二拆）：共享 input schema + 不碰上下文的 helper。
 * 本文件不许出现 db / LLM / ctx 调用，也不许挪进 `services/**`（那是 T-07/09/10/11 的 owner 面）；
 * procedure 的组装与副作用全部留在 `assessment.ts`，两侧都 ≤120 行（§10.2 判据②硬线）。
 */

import { z } from 'zod';
import {
  applyRating,
  buildTodayQueue,
  cardFromJson,
  createDefaultCard,
  type generateQuestion,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '@tm/agent';

/** `cardFromJson` 的返回形状（不直接 import ts-fsrs 的 Card —— S13 版本钉死只活在 services/fsrs.ts）。 */
export type FsrsCard = ReturnType<typeof cardFromJson>;
/** `scoreToFsrsRating` 的返回形状（同上，不 import ts-fsrs 的 Rating）。 */
export type FsrsRating = Parameters<typeof applyRating>[1];
/** `fsrs_cards` 行里本域用到的两列。 */
export interface FsrsCardSeed {
  word: string;
  fsrs_data: string;
}

/** 题目缓存有效期：同一单词同一题型 24h 内命中缓存就不再生成。 */
export const CACHE_TTL = 24 * 60 * 60 * 1000;

/** 逐词生成题目时喂给 `generateQuestion` 的固定入参。 */
export const GEN_OPTIONS: Parameters<typeof generateQuestion>[3] = {
  definition: undefined,
  phonetic: undefined,
  cefrLevel: 'B1',
};

/** assessment.generate 的 input（拆分前后同一份 zod 形状）。 */
export const generateInput = z.object({
  count: z.number().int().min(5).max(10).optional().default(5),
});

/** assessment.submit 的 input。 */
export const submitInput = z.object({
  key: z.string(), // `${word}:${type}`
  userAnswer: z.union([z.string(), z.number()]),
  hesitated: z.boolean().optional().default(false),
  modified: z.boolean().optional().default(false),
});

/** 对外的一道题：按题型只带该题型需要的字段，其余留 undefined。 */
export interface AssessmentRow {
  key: string;
  type: AssessmentQuestionType;
  word: string;
  prompt?: string;
  options?: string[];
  sentence?: string;
  hint?: string;
  phonetic?: string;
  definition?: string;
  difficulty: number;
}

/** 缓存命中与新生成共用同一份映射；`key` 由调用方给（原实现用选中的题型拼，不是题面里的题型）。 */
export const toRow = (key: string, q: AssessmentQuestion, difficulty: number): AssessmentRow => ({
  key,
  type: q.type,
  word: q.word,
  prompt: q.type === 'choice' ? q.prompt : undefined,
  options: q.type === 'choice' ? q.options : undefined,
  sentence: q.type === 'fill' ? q.sentence : undefined,
  hint: q.type === 'fill' ? q.hint : undefined,
  phonetic: q.type === 'spelling' ? q.phonetic : undefined,
  definition: q.type === 'spelling' ? q.definition : undefined,
  difficulty,
});

/** 出题词表：优先今日待复习单词，不足则按卡片顺序补齐到 count。 */
export const pickWords = (cards: FsrsCardSeed[], count: number): string[] => {
  const queue = buildTodayQueue(cards.map((c) => ({ word: c.word, cardJson: c.fsrs_data })));
  const ordered = queue.length > 0 ? [...queue.map((q) => q.word)] : [];
  for (const c of cards) {
    if (ordered.length >= count) break;
    if (!ordered.includes(c.word)) ordered.push(c.word);
  }
  return ordered.slice(0, count);
};

/** 无卡则建新卡 → 应用评分；只算不写，写库留在 procedure。 */
export const applyRatingToRow = (
  row: Pick<FsrsCardSeed, 'fsrs_data'> | null,
  rating: FsrsRating,
  now: Date,
): { before: number; updated: FsrsCard } => {
  const card = row ? cardFromJson(row.fsrs_data) : createDefaultCard(now);
  const before = card.stability;
  return { before, updated: applyRating(card, rating, now) };
};
