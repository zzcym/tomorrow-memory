/**
 * 查词契约（§3.3.1 草案 + R-09/R-10）。
 *
 * 两条硬约束同时成立：
 *  1. **判别联合**：新契约 `LookupResultSchema` 用 `sourceLang` 作判别键（草案要求）；
 *  2. **旧形状不破**：`types.ts` 里已导出的 `LookupResponse` 四元联合中，**英译中两个分支没有 `sourceLang`**，
 *     而 `apps/web`（`page.tsx:106/169`、`word-lookup.tsx:38-39`）与 `packages/agent`（`nodes/lexicon.ts:63`）
 *     全部用 `!('sourceLang' in r)` 做窄化。若把 `sourceLang:'en'` 加到旧类型上，这些消费方会立刻 typecheck 红。
 *     故这里**同时提供两套**：`LookupResponseSchema`（= 旧联合，`types.ts` 由它派生）
 *     与 `LookupResultSchema`（= 草案的判别联合，新调用点用）。见报告「契约偏差」D-2。
 */

import { z } from 'zod';
import {
  LOOKUP_DIRECTIONS,
  RECENT_GLOSS_MAX_LENGTH,
  RECENT_MAX,
  WORD_MAX_LENGTH,
} from '../constants/limits.js';

/** 查词方向（取值集合来自 `constants/limits.ts`，单一源）。 */
export const LookupDirectionSchema = z.enum(LOOKUP_DIRECTIONS);

/* ───────── 公共子形状 ───────── */

/** 释义分组：`pos` = 词性，`meanings` = 释义列表。 */
export const TranslationGroupSchema = z.object({
  pos: z.string(),
  meanings: z.array(z.string()),
});

/** 双语例句对。 */
export const ExamplePairSchema = z.object({
  en: z.string(),
  zh: z.string(),
});

/** 中译英候选词条。 */
export const Zh2EnEntrySchema = z.object({
  word: z.string(),
  pos: z.string(),
  definition: z.string(),
  examples: z.array(ExamplePairSchema),
  synonyms: z.array(z.string()),
  phonetic: z.string(),
});

/* ───────── 英译中 ───────── */

/** stardict 完整命中（旧形状：无 `sourceLang`）。 */
export const LookupEn2ZhSuccessSchema = z.object({
  word: z.string(),
  phonetic: z.string(),
  translation: z.string(),
  definition: z.string(),
  groups: z.array(TranslationGroupSchema),
  exchange: z.record(z.string()),
  examples: z.array(ExamplePairSchema),
  freq: z.number(),
  tag: z.string(),
  detail: z.string(),
  audio: z.string(),
});

/** 在线 API 兜底结果（旧形状：无 `sourceLang`，带 `notFound`）。 */
export const LookupEn2ZhFallbackSchema = z.object({
  word: z.string(),
  phonetic: z.string(),
  translation: z.string(),
  groups: z.array(TranslationGroupSchema),
  exchange: z.record(z.string()),
  examples: z.array(ExamplePairSchema),
  notFound: z.boolean(),
});

/* ───────── 中译英 / 混合 ───────── */

export const LookupZh2EnResponseSchema = z.object({
  query: z.string(),
  sourceLang: z.literal('zh'),
  results: z.array(Zh2EnEntrySchema),
  error: z.string().nullable(),
});

export const LookupMixedResponseSchema = z.object({
  query: z.string(),
  sourceLang: z.literal('mixed'),
  results: z.array(z.never()),
  error: z.string(),
});

/* ───────── 两套联合 ───────── */

/** **旧**统一响应（`types.ts` 的 `LookupResponse` 由它派生；REST/tRPC 现网形状）。 */
export const LookupResponseSchema = z.union([
  LookupEn2ZhSuccessSchema,
  LookupEn2ZhFallbackSchema,
  LookupZh2EnResponseSchema,
  LookupMixedResponseSchema,
]);

/** 带 `sourceLang:'en'` 的英译中分支（仅用于判别联合，不改旧类型）。 */
export const LookupEn2ZhTaggedSchema = LookupEn2ZhSuccessSchema.extend({
  sourceLang: z.literal('en'),
});

/** **新**判别联合（§3.3.1 草案形状；新调用点优先用它）。 */
export const LookupResultSchema = z.discriminatedUnion('sourceLang', [
  LookupEn2ZhTaggedSchema,
  LookupZh2EnResponseSchema,
  LookupMixedResponseSchema,
]);

/* ───────── 最近查询（R-10，本期只存这一台设备；形状与 R-26 的后续同步预对齐） ───────── */

export const RecentSearchItemSchema = z.object({
  word: z.string().min(1).max(WORD_MAX_LENGTH),
  direction: LookupDirectionSchema.default('auto'),
  /** 首义，面板显示用。 */
  gloss: z.string().max(RECENT_GLOSS_MAX_LENGTH).default(''),
  at: z.number().int().nonnegative(),
});
export type RecentSearchItemDto = z.infer<typeof RecentSearchItemSchema>;

/** ≤20 条硬指标（判据⑤的 `RECENT_MAX`）。 */
export const RecentSearchListSchema = z.array(RecentSearchItemSchema).max(RECENT_MAX);

/** tutor 教学内容（LLM structured output 的四类内容，R-09 ⑥）。 */
export const SceneExampleSchema = z.object({
  en: z.string(),
  zh: z.string(),
  scene: z.string(),
});
export const TutorContentSchema = z.object({
  mnemonic: z.string(),
  wordRoot: z.string(),
  sceneExamples: z.array(SceneExampleSchema),
  confusable: z.string(),
});

/* ───────── 校验入口 ───────── */

export function parseLookupResponse(value: unknown) {
  return LookupResponseSchema.safeParse(value);
}
export function parseRecentSearchList(value: unknown) {
  return RecentSearchListSchema.safeParse(value);
}
