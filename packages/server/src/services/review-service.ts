/**
 * T-10 · 复习域**唯一实现**（§4.2 收敛规则 / 审计 S2 的终结点）。
 *
 * REST `POST /api/review` 与 tRPC `review.reviewCard` 两个门面都只转调本文件的
 * `rateCard()` / `undoRating()`；判据③ 要求同一 `(user, word, rating)` 从同一卡状态起点
 * 出发，两个门面产出的 `due / state / reps` 逐字段相等 —— 见
 * `test/integration/review-parity.spec.ts`（同一 fixture 打两门面，比对整串 JSON）。
 *
 * 本文件与 `packages/agent/**` 零依赖（depcruise `review-no-agent` + 运行时
 * `test/review-no-llm.spec.ts` 双保险），所以评分路径不再有 LLM 编排、不再有 `fetch`。
 *
 * 模式口径（§4.3 / R-02④）：只有 `mode='review'` 才写 FSRS 卡；
 * `new` / `selfTest` 返回同一形状的结果但 `scheduled:false`，一行库都不写（判据⑤）。
 */

import {
  MODE_VALUES,
  RATING_DOMAIN_HINT,
  REVIEW_ERROR_CODES,
  RATING_VALUES,
  UNDO_MAX_PER_SESSION,
  WORD_MAX_LENGTH,
  errorMessage,
  supplementErrorStatus,
  type QueueMode,
  type RatingValue,
  type ReviewErrorCode,
  type ReviewResultDto,
} from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { applyRating, cardFromJson, cardToJson, createDefaultCard } from './fsrs.js';

/* ─────────── 错误码（A-28-4：码表与文案已收编进 @tm/shared 的 TM_ERRORS_SUPPLEMENT） ───────────
 * 本域只 re-export 键名与评分域提示，供 `routes/review.ts` / `trpc/routers/review.ts` /
 * `test/integration/review-parity.spec.ts` 按原路径引用；文案的真相在 `@tm/shared`，
 * 这里不再持有任何 copy 表（A-23-7）。
 */
export { RATING_DOMAIN_HINT, REVIEW_ERROR_CODES };
export type { ReviewErrorCode };

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly http: number;

  constructor(code: ReviewErrorCode) {
    super(errorMessage(code));
    this.name = 'ReviewError';
    this.code = code;
    this.http = supplementErrorStatus(code);
  }
}

export function reviewErrorBody(err: ReviewError): { status: number; body: { error: string; code: string } } {
  return { status: err.http, body: { error: err.message, code: err.code } };
}

/**
 * tRPC 侧的同一映射（判据③ 的另一半：错误也必须同码，否则两端只收敛了一半）。
 * 只返回 `@trpc/server` 的 code 字面量，服务层不 import tRPC。
 */
export function reviewErrorTrpcCode(err: ReviewError): 'BAD_REQUEST' | 'CONFLICT' | 'TOO_MANY_REQUESTS' {
  if (err.code === 'NOTHING_TO_UNDO') return 'CONFLICT';
  if (err.code === 'UNDO_LIMIT_REACHED') return 'TOO_MANY_REQUESTS';
  return 'BAD_REQUEST';
}

/* ───────────────────────────── 入参归一（不分端） ───────────────────────────── */

export function normalizeWord(raw: unknown): string {
  const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!word || word.length > WORD_MAX_LENGTH) throw new ReviewError('INVALID_WORD');
  return word;
}

/** R-02③：越界即抛，**绝不 `Math.min/max` 夹回合法区间**。`'3'` 与 `3` 同义（旧 REST 口径）。 */
export function normalizeRating(raw: unknown): RatingValue {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (!RATING_VALUES.includes(n as RatingValue)) throw new ReviewError('INVALID_RATING');
  return n as RatingValue;
}

/** 三模式取值域同样只认 `MODE_VALUES`（`?mode=` 与 `review.queue` 的 mode 同一口径）。 */
export function normalizeMode(raw: unknown): QueueMode {
  if (raw === undefined || raw === null || raw === '') return 'review';
  if (!MODE_VALUES.includes(raw as QueueMode)) throw new ReviewError('INVALID_MODE');
  return raw as QueueMode;
}

/* ───────────────────────────── 回参形状（判据③ 的载体） ───────────────────────────── */

export interface ReviewOutcome extends ReviewResultDto {
  ok: true;
  /** 旧 `POST /api/review` 的响应键：LLM 文案位，本期恒空串（形状不变，判据⑧）。 */
  response: '';
  /** false = `new` / `selfTest` 模式，未写库（R-02④）。 */
  scheduled: boolean;
  stabilityBefore: number;
  stabilityAfter: number;
  difficulty: number;
  nextReview: string;
}

export interface RateInput {
  userId: number;
  word: unknown;
  rating: unknown;
  /** 缺省 = `review`（旧 APK 的 POST /api/review 不带 mode，行为保持"写卡"）。 */
  mode?: QueueMode;
}

export interface RateContext {
  now?: Date;
  /**
   * 学情事件采集器。CL-3（A-28-6 → A-33-7）之前只有 tRPC 门面注入，REST 门面不落事件
   * （遗留项 L-5）；现在两个门面都从各自的装配层拿它（`ctx.events` / `createReviewRouter(db, { events })`）。
   * 缺席不影响排期计算 ⇒ 判据③ 比对的 due/state/reps 与它无关，双门面等值不受影响。
   */
  events?: { record(event: { user_id: number; event_type: string; word_id: string; metadata?: Record<string, unknown> }): void };
}

/**
 * 一次评分 = 读卡 → 存前置快照 → ts-fsrs 推进 → 写回。
 * 两个门面共用本函数，禁止任何一侧再算一遍（S2 的分叉就是这么产生的）。
 */
export async function rateCard(db: AppDB, input: RateInput, ctx: RateContext = {}): Promise<ReviewOutcome> {
  const word = normalizeWord(input.word);
  const rating = normalizeRating(input.rating);
  const mode: QueueMode = input.mode ?? 'review';
  const now = ctx.now ?? new Date();
  const nowMs = now.getTime();

  const row = await db.fsrs.getCard(input.userId, word);
  const before = row ? cardFromJson(row.fsrs_data) : createDefaultCard(now);
  const stabilityBefore = before.stability;
  const updated = applyRating(before, rating, now);

  if (mode !== 'review') {
    // 顺序/随机模式：算得出"下次什么时候"，但一行都不写（判据⑤）。
    return outcome(word, rating, before, updated, stabilityBefore, false, now);
  }

  await db.snapshots.save(
    input.userId,
    word,
    row ? row.fsrs_data : cardToJson(createDefaultCard(now)),
    row?.last_review ?? null,
    before.reps,
    nowMs,
  );
  await db.fsrs.upsertCard(input.userId, word, cardToJson(updated), nowMs, nowMs);
  noteRated(input.userId, word, nowMs);
  ctx.events?.record({
    user_id: input.userId,
    event_type: 'review',
    word_id: word,
    metadata: { rating, stability: updated.stability },
  });
  return outcome(word, rating, before, updated, stabilityBefore, true, now);
}

function outcome(
  word: string,
  rating: RatingValue,
  before: ReturnType<typeof cardFromJson>,
  updated: ReturnType<typeof cardFromJson>,
  stabilityBefore: number,
  scheduled: boolean,
  now: Date,
): ReviewOutcome {
  const lastReview = updated.last_review ?? now;
  return {
    ok: true,
    response: '',
    scheduled,
    word,
    rating,
    due: updated.due.toISOString(),
    state: updated.state,
    reps: updated.reps,
    lapses: updated.lapses,
    reviewedAt: lastReview.getTime(),
    stabilityBefore,
    stabilityAfter: updated.stability,
    difficulty: updated.difficulty,
    nextReview: updated.due.toISOString(),
  };
}

/* ─────────────────────────── 撤销（R-11③④ / 判据⑥） ─────────────────────────── */

/**
 * 本轮台账（内存态）：`rated` = 本轮已评分的词序，`undos` = 已撤销次数。
 * ⚠ 遗留项 L-3：`AppDB` 由 T-06 冻结且没有"轮次/撤销计数"表，
 * 所以 R-11④ 的"同轮 ≤3 次"在服务端只能按进程内窗口计；
 * 跨进程重启会重新计数。防重复回滚本身由 `snapshots.take()` 的"取一条删一条"保证，
 * 与台账无关（同一张卡撤第二次必然 `NOTHING_TO_UNDO`）。
 */
const ROUND_WINDOW_MS = 6 * 3_600_000;
interface RoundLedger {
  windowStart: number;
  rated: string[];
  undos: number;
}
const rounds = new Map<number, RoundLedger>();

function ledgerFor(userId: number, nowMs: number): RoundLedger {
  const hit = rounds.get(userId);
  if (!hit || nowMs - hit.windowStart > ROUND_WINDOW_MS) {
    const fresh: RoundLedger = { windowStart: nowMs, rated: [], undos: 0 };
    rounds.set(userId, fresh);
    return fresh;
  }
  return hit;
}

function noteRated(userId: number, word: string, nowMs: number): void {
  ledgerFor(userId, nowMs).rated.push(word);
}

/**
 * 撤销回参 = `@tm/shared` 的 `ReviewUndoResultSchema` 形状（shared 侧只导出了 schema、
 * 没导出 `z.infer` 别名，故在此对齐声明；见报告 D-2）+ 两个判据⑥ 的取证字段。
 */
export interface UndoResult {
  ok: true;
  word: string;
  /** 队列指针回退后落到的那张（0 基）。 */
  index: number;
  /** 本轮还能撤销几次（`UNDO_MAX_PER_SESSION`）。 */
  remaining: number;
  /** 回写后的 `fsrs_cards.data` 原文 —— 逐字节等于快照的 `prev_data`。 */
  data: string;
  prevData: string;
}

/**
 * 撤销一次评分：`snapshots.take()` 取出并消费该词最近一条前置快照 → 整体回写。
 * `fsrs_cards.data` 回写的是**快照里的序列化原文**（不是重新生成的 JSON），
 * 所以判据⑥ 要求"序列化格式与 ts-fsrs 版本未变"在这里是可证的：串逐字节相等。
 */
export async function undoRating(db: AppDB, userId: number, rawWord: unknown, now = new Date()): Promise<UndoResult> {
  const word = normalizeWord(rawWord);
  const nowMs = now.getTime();
  const ledger = ledgerFor(userId, nowMs);
  if (ledger.undos >= UNDO_MAX_PER_SESSION) throw new ReviewError('UNDO_LIMIT_REACHED');

  const snap = await db.snapshots.take(userId, word);
  if (!snap) throw new ReviewError('NOTHING_TO_UNDO');

  await db.fsrs.upsertCard(userId, word, snap.prev_data, snap.prev_due, nowMs);
  ledger.undos += 1;
  const at = ledger.rated.lastIndexOf(word);
  if (at >= 0) ledger.rated.splice(at, 1);
  return {
    ok: true,
    word,
    index: Math.max(0, at),
    remaining: Math.max(0, UNDO_MAX_PER_SESSION - ledger.undos),
    data: snap.prev_data,
    prevData: snap.prev_data,
  };
}
