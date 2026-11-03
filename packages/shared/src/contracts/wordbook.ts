/**
 * 词本契约（§3.3.1 草案 + §4.4 同步协议）。
 *
 * 红线（R-03 ⑦）：**现有字段名与语义不变**，只允许 `.passthrough()`；
 * 旧客户端附加的未知键不得报错，也不得被静默丢弃后回写。
 *
 * 消费方：`packages/server/src/routes/wordbook.ts`（薄封装）、`trpc/routers/wordbook.ts`（T-09）、
 * `apps/web/src/components/wordbook-sidebar.tsx`、`apps/app` 的 rest/local fetcher（T-14/T-16）。
 */

import { z } from 'zod';
import {
  WORD_MAX_LENGTH,
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PUSH_BATCH_MAX,
} from '../constants/limits.js';

/** 单词本条目（`{data:[{word,addedAt,lastReview,reviewCount,…}]}` 的元素）。 */
export const WordbookEntrySchema = z
  .object({
    word: z.string().min(1).max(WORD_MAX_LENGTH),
    /** 加入时间戳（ms） */
    addedAt: z.number().int().nonnegative().optional(),
    /** 最近复习时间戳（ms） */
    lastReview: z.number().int().nonnegative().optional(),
    /** 复习次数 */
    reviewCount: z.number().int().nonnegative().optional(),
  })
  .passthrough(); // ← "前端可能附加其它信息"的既有行为，未知键不报错

export type WordbookEntryDto = z.infer<typeof WordbookEntrySchema>;

/**
 * 读侧投影（R-15⑤ · A-85 #312）：服务端从 `fsrs_cards` 真行回传的进度三键，键名/单位单点在此。
 * **无 FSRS 卡的词整键缺席**（不填 0/null）；`state` = ts-fsrs `CardState` 的 0..3 数值，`nextDue` = ms。
 * ⚠ 只做类型上收，不进上面那颗 schema：它同时是 push 输入面，声明成 number 会让老客户端回推字符串
 * `nextDue` 时新造一条 400；读侧新键仍由 `.passthrough()` 兜。
 */
export interface WordbookProgress {
  state?: number;
  lapses?: number;
  nextDue?: number;
}
/** 键名单点（服务端 join 与用例哨共用）；`read()` 元素形状 = 既有四键 + 可选三键。 */
export const WORDBOOK_PROGRESS_KEYS = ['state', 'lapses', 'nextDue'] as const;
export type WordbookEntryWithProgress = WordbookEntryDto & WordbookProgress;

/**
 * REST `GET /api/wordbook` 的进度键 opt-in 查询参数名（E4b3b · A-87 #325；单点：服务端分支与 App 取数共用）。
 * **只有取值恰为 `WORDBOOK_PROGRESS_QUERY_ON` 才算开**；缺省 / `0` / 其余一律走旧形状（§6.2-1 快照红线）。
 */
export const WORDBOOK_PROGRESS_QUERY = 'with_progress';
export const WORDBOOK_PROGRESS_QUERY_ON = '1';

/** 单词字符串本身（upsert / removedWords 共用）。 */
export const WordKeySchema = z.string().min(1).max(WORD_MAX_LENGTH);

/**
 * 整数组旧 PUT 载荷（`PUT /api/wordbook` 的 `{data: [...]}`，形状不变，旧 APK 兼容矩阵成员）。
 *
 * 偏差：§3.3.1 草案写 `.max(5000)`，而 §4.4.2 与判据⑤定 `WORDBOOK_MAX_ENTRIES = 20000`，
 * 现服务端口径也是 20000（`routes/wordbook.ts:22`）。取 **20000**（见报告「契约偏差」D-1）。
 */
export const WordbookArraySchema = z.array(WordbookEntrySchema).max(WORDBOOK_MAX_ENTRIES);

/** `PUT /api/wordbook` 请求体（外层包 `{data}`）。 */
export const WordbookReplaceInputSchema = z
  .object({ data: WordbookArraySchema })
  .passthrough();

/** 增量 upsert + 删除集合（§4.4.1）。 */
export const WordbookPushInputSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  entries: z.array(WordbookEntrySchema).max(WORDBOOK_PUSH_BATCH_MAX).default([]),
  removedWords: z.array(WordKeySchema).max(WORDBOOK_PUSH_BATCH_MAX).default([]),
});
export type WordbookPushInputDto = z.infer<typeof WordbookPushInputSchema>;

/** push 出参：`ok: true` 字面量 + 服务端权威版本与统计。 */
export const WordbookPushResultSchema = z.object({
  ok: z.literal(true),
  version: z.number().int(),
  merged: z.number().int(),
  added: z.number().int(),
  removed: z.number().int(),
});
export type WordbookPushResultDto = z.infer<typeof WordbookPushResultSchema>;

/** pull 出参（`GET /api/wordbook/pull?since=`；请求侧键名 = `since`、出参侧仍 `version`，A-35-3 两个键名都不改。本期同步只有 REST 两端点 `POST /api/wordbook/push` / `GET /api/wordbook/pull`，无 tRPC `wordbook.pull` 过程 —— A-36-8/#9）。 */
export const WordbookPullResultSchema = z.object({
  version: z.number().int(),
  updatedAt: z.number().int(),
  entries: z.array(WordbookEntrySchema),
});
export type WordbookPullResultDto = z.infer<typeof WordbookPullResultSchema>;

/** 旧 `GET /api/wordbook` 出参（`{data:[...]}`，形状不变）。 */
export const WordbookGetResultSchema = z
  .object({ data: z.array(WordbookEntrySchema) })
  .passthrough();

/** 单条加/删（`wordbook.add` / `wordbook.remove`，R-16）。 */
export const WordbookMutateInputSchema = z.object({ word: WordKeySchema });

/** 增量同步的客户端状态（本机持久化用，字段名与 `baseVersion` 对齐，T-14 单点写）。 */
export const WordbookSyncStateSchema = z.object({
  baseVersion: z.number().int().nonnegative().default(0),
  pendingUpserts: z.array(WordbookEntrySchema).default([]),
  pendingRemovals: z.array(WordKeySchema).default([]),
  lastSyncedAt: z.number().int().nonnegative().optional(),
});
export type WordbookSyncStateDto = z.infer<typeof WordbookSyncStateSchema>;

/* ───────── 校验入口（服务端与客户端共用同一函数，禁止各自 re-implement） ───────── */

export function parseWordbookEntries(value: unknown) {
  return WordbookArraySchema.safeParse(value);
}
export function parseWordbookEntry(value: unknown) {
  return WordbookEntrySchema.safeParse(value);
}
export function parseWordbookPush(value: unknown) {
  return WordbookPushInputSchema.safeParse(value);
}
