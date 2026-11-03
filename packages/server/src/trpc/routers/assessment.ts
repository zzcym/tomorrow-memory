/**
 * tRPC 域：assessment（测评；Phase 4）
 * 自 `trpc/router.ts` 逐字搬迁（T-08，零行为变更）。A-21 域内二拆：纯 helper 与共享 input
 * schema 挪到同目录 `assessment-parts.ts`，本文件只剩 router 组装 + procedure。
 * procedure 的 path / input / output 形状零变化（快照基线：`test/trpc-shape.baseline.json`）。
 * `assessment_cache` 缺 `user_id` 属 C-07（P1 R-28），本期不动 → 见 §11 F-5。
 *
 * **T-25 / R-41（M7，批次 4A）就地更正**：上面那句"本期不动"已被 PRD v1.4 的 R-41 作废
 * （§4.1 / §6.1 的同源旧口径由 §10.2 T-25 行按"只加不删"打戳）。本文件现在：
 *  - 缓存读写走 `getOwned/setOwned`，属主**只**取 `ctx.userId`（`protectedProcedure` 的会话凭据），
 *    `input` 里出现的任何 `userId`/`ownerId` 都被 zod 的 strip 语义丢掉，不参与命中判定（判据④）；
 *  - `submit` 未命中缓存 ⇒ **403 `FORBIDDEN`**（判据⑦，不是 500）：题面可能被他人挤占，
 *    也可能是 `user_id IS NULL` 的改造前旧行被拒读（判据③：不猜属主、不当公共池）。
 *  - input / output 的 zod 形状一字未改（判据⑨）；错误经 `trpc/init.ts` 唯一的 `errorFormatter`
 *    （A-30-1）把 `cause.{tmCode,httpStatus}` 提升为 `data.code`，前端按 code 回环到"重新出题"。
 */

import {
  cardFromJson,
  cardToJson,
  generateQuestion,
  gradeAnswer,
  pickQuestionType,
  scoreToFsrsRating,
  SCORE_LABEL,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '@tm/agent';
import { errorMessage, supplementErrorStatus } from '@tm/shared';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimit, router } from '../init.js';
import {
  applyRatingToRow,
  CACHE_TTL,
  generateInput,
  GEN_OPTIONS,
  pickWords,
  submitInput,
  toRow,
} from './assessment-parts.js';

export const assessment = router({
  /**
   * 生成 5-10 道题：从今日待复习单词选取，按 FSRS difficulty 选题型，
   * 同一单词同一题型 24h 内命中缓存不重复生成。
   */
  generate: protectedProcedure
    .input(generateInput)
    .mutation(async ({ ctx, input }) => {
      // 生成题目逐词调 LLM：每用户 10 次/分钟
      rateLimit(`user:${ctx.userId}:assess-gen`, 10, 60_000);
      const cards = await ctx.db.fsrs.getCardsByUser(ctx.userId);
      if (cards.length === 0) {
        throw new Error('单词本为空，请先添加单词');
      }
      const now = Date.now();
      const questions: Array<ReturnType<typeof toRow>> = [];

      for (const word of pickWords(cards, input.count)) {
        const card = cardFromJson(cards.find((c) => c.word === word)!.fsrs_data);
        const type = pickQuestionType(card.difficulty);

        // 缓存命中（24h 内）—— 只认当前登录用户自己写的行；`user_id IS NULL` 的旧行与他人行都读不到
        const cached = await ctx.db.assessment.getOwned(word, type, ctx.userId);
        if (cached && now - cached.created_at < CACHE_TTL) {
          const q = JSON.parse(cached.question) as AssessmentQuestion;
          questions.push(toRow(`${word}:${type}`, q, card.difficulty));
          continue;
        }

        // 生成并缓存（LLM 或规则降级）；行的属主记成当前用户（判据④：挤占语义，代价登记 RK-14）
        const question = await generateQuestion(ctx.llmRouter, word, type, GEN_OPTIONS);
        await ctx.db.assessment.setOwned(word, type, ctx.userId, JSON.stringify(question), now);
        questions.push(toRow(`${word}:${type}`, question, card.difficulty));
      }

      return { count: questions.length, questions };
    }),

  /**
   * 提交答案：比对 → 评分 1-5 → 映射 FSRS Rating → 更新卡片
   */
  submit: protectedProcedure
    .input(submitInput)
    .mutation(async ({ ctx, input }) => {
      const [word, type] = input.key.split(':') as [string, AssessmentQuestionType];
      const cached = await ctx.db.assessment.getOwned(word, type, ctx.userId);
      if (!cached) {
        /**
         * 判据⑦：读不到 = 不是你的行（被他人挤占 / 改造前 `user_id IS NULL` 的旧行被拒读）
         * ⇒ **403 `FORBIDDEN`，不是 500**，与 §10.2 T-11 行"属主不确定即拒读"同一条口径
         * （`routers/chat.ts` 的 `ThreadForbidden` 同形）。文案与状态都只从 `@tm/shared` 取：
         * `FORBIDDEN` 住 `TM_ERRORS_SUPPLEMENT`，`httpStatus` 必须一并带上，否则
         * `trpc/init.ts` 的 errorFormatter 会去查 `TM_ERRORS[tmCode].http` = `undefined.http`
         * = TypeError ⇒ 403 在线上翻成 500（A-33-5）。本文件不写 403 这个数字、不自建文案。
         */
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: errorMessage('FORBIDDEN'),
          cause: { tmCode: 'FORBIDDEN', httpStatus: supplementErrorStatus('FORBIDDEN'), facade: 'trpc' },
        });
      }
      const question = JSON.parse(cached.question) as AssessmentQuestion;
      const { score, correct, correctAnswer } = gradeAnswer(question, input.userAnswer, {
        hesitated: input.hesitated,
        modified: input.modified,
      });

      // FSRS 更新
      const rating = scoreToFsrsRating(score);
      const row = await ctx.db.fsrs.getCard(ctx.userId, word);
      const now = new Date();
      const { before, updated } = applyRatingToRow(row, rating, now);
      await ctx.db.fsrs.upsertCard(ctx.userId, word, cardToJson(updated), now.getTime(), now.getTime());
      // Phase 5：学情事件（异步，metadata.score 供正确率聚合）
      ctx.events.record({
        user_id: ctx.userId,
        event_type: 'assess',
        word_id: word,
        metadata: { score, correct, qtype: question.type },
      });

      return {
        ok: true,
        word,
        correct,
        score,
        scoreLabel: SCORE_LABEL[score],
        correctAnswer,
        explanation: 'explanation' in question ? question.explanation : '',
        stabilityBefore: before,
        stabilityAfter: updated.stability,
        difficulty: updated.difficulty,
        nextReview: updated.due.toISOString(),
      };
    }),
});
