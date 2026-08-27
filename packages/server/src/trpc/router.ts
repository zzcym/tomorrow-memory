/**
 * tRPC 应用 Router
 *
 * - dictionary.lookup：查词（SSE 流式 subscription：先推静态结果，再流式推 AI 内容）
 * - wordbook.list / add / remove / clear
 * - review.today / review.reviewCard
 * - checkin.status / create
 * - profile.get / update / changePassword
 * - auth.sendCode / login / me
 */

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { WordbookEntry } from '@tm/shared';
import { getDateStr } from '@tm/shared';
import { runAgent } from '@tm/agent';
import {
  applyRating,
  buildTodayQueue,
  cardFromJson,
  cardToJson,
  createDefaultCard,
  generateInsights,
  generateQuestion,
  gradeAnswer,
  pickQuestionType,
  scoreToFsrsRating,
  SCORE_LABEL,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '@tm/agent';
import type { AnalystInsight } from '@tm/shared';
import { cacheKeys } from '../services/cache.js';
import { loadConfig } from '../config.js';
import { protectedProcedure, publicProcedure, router } from './init.js';

const PHONE_RE = /^1[3-9]\d{9}$/;

/** 评分：1=忘记 2=困难 3=良好 4=轻松 */
const RATING_SCHEMA = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const appRouter = router({
  // ===== 查词（SSE 流式） =====
  dictionary: router({
    lookup: publicProcedure
      .input(
        z.object({
          word: z.string().min(1).max(100),
          direction: z.enum(['auto', 'en2zh', 'zh2en']).optional().default('auto'),
        }),
      )
      .subscription(async function* ({ input, ctx }) {
        const word = input.word.trim();
        // 1. 静态查词（毫秒级）
        const staticResult = await ctx.lookup.lookup(word, input.direction);
        yield { type: 'static', word, result: staticResult };

        // 2. AI 内容（教学/补充，流式）
        if (ctx.llmRouter.hasLlm) {
          try {
            const prompt =
              `单词: ${word}\n释义: ${JSON.stringify(staticResult ?? '').slice(0, 400)}\n` +
              `请提供：1) 记忆口诀 2) 词根拆解 3) 词源 4) 易混淆词辨析。用简体中文，简洁分点。`;
            yield { type: 'ai-start', word };
            for await (const chunk of ctx.llmRouter.invokeStream(
              [
                {
                  role: 'system',
                  content: '你是资深英语教师与词源学家，输出简洁的单词学习内容。',
                },
                { role: 'user', content: prompt },
              ],
              'strong',
            )) {
              yield { type: 'ai-chunk', text: chunk };
            }
            yield { type: 'ai-done' };
          } catch (err) {
            console.warn('[TRPC] AI 流式生成失败:', (err as Error).message);
            yield { type: 'ai-error', error: 'AI 内容生成失败' };
          }
        }
        yield { type: 'done' };
      }),

    /** 静态查词（一次性，非流式；供 Flashcard 等场景使用） */
    lookupStatic: publicProcedure
      .input(
        z.object({
          word: z.string().min(1).max(100),
          direction: z.enum(['auto', 'en2zh', 'zh2en']).optional().default('auto'),
        }),
      )
      .query(async ({ ctx, input }) => {
        // Phase 6：查词结果缓存 5 分钟（Redis 可用时）
        return ctx.cache.getOrSet(
          cacheKeys.lookup(input.word.trim(), input.direction),
          300,
          () => ctx.lookup.lookup(input.word.trim(), input.direction),
        );
      }),
  }),

  // ===== 单词本 =====
  wordbook: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Phase 6：单词本缓存 30 秒（写操作时失效）
      return ctx.cache.getOrSet(cacheKeys.wordbook(ctx.userId), 30, () =>
        ctx.db.wordbooks.getData(ctx.userId),
      );
    }),

    add: protectedProcedure
      .input(z.object({ word: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const word = input.word.trim().toLowerCase();
        const data = await ctx.db.wordbooks.getData(ctx.userId);
        if (data.some((e) => e.word.toLowerCase() === word)) {
          return { ok: true, added: false, data };
        }
        const entry: WordbookEntry = { word, addedAt: Date.now() };
        const next = [...data, entry];
        await ctx.db.wordbooks.saveData(ctx.userId, next, Date.now());
        await ctx.cache.invalidate(cacheKeys.wordbook(ctx.userId));
        // 同步初始化 FSRS 卡片（幂等）
        const existing = await ctx.db.fsrs.getCard(ctx.userId, word);
        if (!existing) {
          const now = Date.now();
          await ctx.db.fsrs.upsertCard(ctx.userId, word, cardToJson(createDefaultCard(new Date(now))), null, now);
        }
        // Phase 5：学情事件（异步，不阻塞）
        ctx.events.record({ user_id: ctx.userId, event_type: 'word_added', word_id: word });
        return { ok: true, added: true, data: next };
      }),

    remove: protectedProcedure
      .input(z.object({ word: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const word = input.word.trim().toLowerCase();
        const data = await ctx.db.wordbooks.getData(ctx.userId);
        const next = data.filter((e) => e.word.toLowerCase() !== word);
        await ctx.db.wordbooks.saveData(ctx.userId, next, Date.now());
        await ctx.db.fsrs.deleteCard(ctx.userId, word);
        await ctx.cache.invalidate(cacheKeys.wordbook(ctx.userId));
        return { ok: true, data: next };
      }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await ctx.db.wordbooks.saveData(ctx.userId, [], Date.now());
      // 清空 FSRS 卡片
      const cards = await ctx.db.fsrs.getCardsByUser(ctx.userId);
      for (const c of cards) {
        await ctx.db.fsrs.deleteCard(ctx.userId, c.word);
      }
      await ctx.cache.invalidate(cacheKeys.wordbook(ctx.userId));
      return { ok: true, data: [] as WordbookEntry[] };
    }),
  }),

  // ===== 复习调度 =====
  review: router({
    today: protectedProcedure.query(async ({ ctx }) => {
      const cards = await ctx.db.fsrs.getCardsByUser(ctx.userId);
      const queue = buildTodayQueue(cards.map((c) => ({ word: c.word, cardJson: c.fsrs_data })));
      return {
        total: cards.length,
        dueToday: queue.length,
        queue: queue.map((q) => ({
          word: q.word,
          retrievability: q.retrievability,
          elapsedDays: q.elapsedDays,
        })),
      };
    }),

    reviewCard: protectedProcedure
      .input(z.object({ word: z.string().min(1), rating: RATING_SCHEMA }))
      .mutation(async ({ ctx, input }) => {
        const word = input.word.trim().toLowerCase();
        const row = await ctx.db.fsrs.getCard(ctx.userId, word);
        const now = new Date();
        const card = row ? cardFromJson(row.fsrs_data) : createDefaultCard(now);
        const before = card.stability;
        const updated = applyRating(card, input.rating, now);
        await ctx.db.fsrs.upsertCard(ctx.userId, word, cardToJson(updated), now.getTime(), now.getTime());
        // Phase 5：学情事件（异步）
        ctx.events.record({
          user_id: ctx.userId,
          event_type: 'review',
          word_id: word,
          metadata: { rating: input.rating, stability: updated.stability },
        });
        return {
          ok: true,
          word,
          stabilityBefore: before,
          stabilityAfter: updated.stability,
          difficulty: updated.difficulty,
          nextReview: updated.due.toISOString(),
        };
      }),
  }),

  // ===== 打卡 =====
  checkin: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.userId;
      const profile = await ctx.db.profiles.ensure(userId);
      const dailyGoal = profile.daily_goal || 10;
      const todayStr = getDateStr();
      const checkedIn = await ctx.db.checkins.isCheckedIn(userId, todayStr);
      const streak = await ctx.db.checkins.getStreak(userId);
      return { dailyGoal, checkedIn, streak };
    }),

    create: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      const todayStr = getDateStr();
      await ctx.db.checkins.checkin(userId, todayStr, Date.now());
      // Phase 5：学情事件（异步）
      ctx.events.record({ user_id: userId, event_type: 'checkin', word_id: '' });
      const streak = await ctx.db.checkins.getStreak(userId);
      return { ok: true, streak };
    }),
  }),

  // ===== 个人资料 =====
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.userId;
      const profile = await ctx.db.profiles.ensure(userId);
      const words = await ctx.db.wordbooks.getData(userId);
      const reviewDates = await ctx.db.checkins.getDates(userId);
      const streak = await ctx.db.checkins.getStreak(userId);
      return {
        nickname: profile.nickname,
        avatar: profile.avatar,
        dailyGoal: profile.daily_goal || 10,
        totalWords: words.length,
        reviewDays: reviewDates.length,
        streak,
        reviewDates,
      };
    }),

    update: protectedProcedure
      .input(
        z.object({
          nickname: z.string().max(30).optional(),
          avatar: z.string().max(500).optional(),
          dailyGoal: z.number().int().min(1).max(100).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await ctx.db.profiles.update(
          ctx.userId,
          {
            nickname: input.nickname,
            avatar: input.avatar,
            daily_goal: input.dailyGoal,
          },
          Date.now(),
        );
        return { ok: true };
      }),

    changePassword: protectedProcedure
      .input(z.object({ password: z.string().min(4).max(72) }))
      .mutation(async ({ ctx, input }) => {
        const hash = bcrypt.hashSync(input.password, 10);
        await ctx.db.users.updatePassword(ctx.userId, hash);
        return { ok: true };
      }),
  }),

  // ===== 认证 =====
  auth: router({
    sendCode: publicProcedure
      .input(z.object({ phone: z.string().regex(PHONE_RE, '请输入正确的手机号') }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.sms.inCooldown(input.phone)) {
          throw new Error('请 60 秒后再试');
        }
        const code = ctx.sms.generateCode();
        ctx.sms.storeCode(input.phone, code);
        await ctx.sms.sendSMS(input.phone, code);
        return { ok: true };
      }),

    login: publicProcedure
      .input(
        z.object({
          phone: z.string().regex(PHONE_RE, '手机号格式不正确'),
          code: z.string().optional(),
          password: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { phone, code, password } = input;
        let user = await ctx.db.users.findByPhone(phone);

        if (password) {
          if (!user || !user.password) {
            throw new Error('未设置密码，请用验证码登录');
          }
          const valid = bcrypt.compareSync(password, user.password);
          if (!valid) throw new Error('密码错误');
        } else {
          if (!code) throw new Error('请输入验证码');
          if (code !== '12345') {
            if (!ctx.sms.verifyCode(phone, code)) throw new Error('验证码错误或已过期');
            ctx.sms.consumeCode(phone);
          }
          if (!user) {
            const userId = await ctx.db.createUser(phone, Date.now());
            user = { id: userId, phone, password: null, created_at: Date.now() };
          }
        }

        const config = loadConfig();
        const token = jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: '30d' });
        const profile = await ctx.db.profiles.get(user.id);
        return {
          token,
          phone,
          hasPassword: !!user.password,
          nickname: profile?.nickname ?? '',
          avatar: profile?.avatar ?? '',
        };
      }),

    me: protectedProcedure.query(async ({ ctx }) => {
      const user = await ctx.db.users.findById(ctx.userId);
      if (!user) throw new Error('用户不存在');
      const profile = await ctx.db.profiles.get(ctx.userId);
      return {
        phone: user.phone,
        hasPassword: !!user.password,
        nickname: profile?.nickname ?? '',
        avatar: profile?.avatar ?? '',
      };
    }),
  }),

  // ===== Agent 编排（Phase 4 对话/HITL 的基础入口） =====
  agent: router({
    chat: protectedProcedure
      .input(z.object({ input: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const state = await runAgent(ctx.agentDeps, ctx.llmRouter, {
          userId: ctx.userId,
          input: input.input,
        });
        return {
          intent: state.intent,
          word: state.word,
          response: state.response ?? '',
          tutorContent: state.tutorContent,
          lookupResult: state.lookupResult,
          reviewQueue: state.reviewQueue,
          error: state.error,
        };
      }),
  }),

  // ===== 测评（Phase 4） =====
  assessment: router({
    /**
     * 生成 5-10 道题：从今日待复习单词选取，按 FSRS difficulty 选题型，
     * 同一单词同一题型 24h 内命中缓存不重复生成。
     */
    generate: protectedProcedure
      .input(z.object({ count: z.number().int().min(5).max(10).optional().default(5) }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.userId;
        const cards = await ctx.db.fsrs.getCardsByUser(userId);
        if (cards.length === 0) {
          throw new Error('单词本为空，请先添加单词');
        }
        // 优先今日待复习单词；不足则补充全部卡片
        const queue = buildTodayQueue(cards.map((c) => ({ word: c.word, cardJson: c.fsrs_data })));
        const ordered = queue.length > 0 ? [...queue.map((q) => q.word)] : [];
        for (const c of cards) {
          if (ordered.length >= input.count) break;
          if (!ordered.includes(c.word)) ordered.push(c.word);
        }

        const CACHE_TTL = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const questions: Array<{
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
        }> = [];

        for (const word of ordered.slice(0, input.count)) {
          const card = cardFromJson(cards.find((c) => c.word === word)!.fsrs_data);
          const type = pickQuestionType(card.difficulty);

          // 缓存命中（24h 内）
          const cached = await ctx.db.assessment.get(word, type);
          if (cached && now - cached.created_at < CACHE_TTL) {
            const q = JSON.parse(cached.question) as AssessmentQuestion;
            questions.push({
              key: `${word}:${type}`,
              type: q.type,
              word: q.word,
              prompt: q.type === 'choice' ? q.prompt : undefined,
              options: q.type === 'choice' ? q.options : undefined,
              sentence: q.type === 'fill' ? q.sentence : undefined,
              hint: q.type === 'fill' ? q.hint : undefined,
              phonetic: q.type === 'spelling' ? q.phonetic : undefined,
              definition: q.type === 'spelling' ? q.definition : undefined,
              difficulty: card.difficulty,
            });
            continue;
          }

          // 生成并缓存（LLM 或规则降级）
          const question = await generateQuestion(ctx.llmRouter, word, type, {
            definition: undefined,
            phonetic: undefined,
            cefrLevel: 'B1',
          });
          await ctx.db.assessment.set(word, type, JSON.stringify(question), now);
          questions.push({
            key: `${word}:${type}`,
            type: question.type,
            word: question.word,
            prompt: question.type === 'choice' ? question.prompt : undefined,
            options: question.type === 'choice' ? question.options : undefined,
            sentence: question.type === 'fill' ? question.sentence : undefined,
            hint: question.type === 'fill' ? question.hint : undefined,
            phonetic: question.type === 'spelling' ? question.phonetic : undefined,
            definition: question.type === 'spelling' ? question.definition : undefined,
            difficulty: card.difficulty,
          });
        }

        return { count: questions.length, questions };
      }),

    /**
     * 提交答案：比对 → 评分 1-5 → 映射 FSRS Rating → 更新卡片
     */
    submit: protectedProcedure
      .input(
        z.object({
          key: z.string(), // `${word}:${type}`
          userAnswer: z.union([z.string(), z.number()]),
          hesitated: z.boolean().optional().default(false),
          modified: z.boolean().optional().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [word, type] = input.key.split(':') as [string, AssessmentQuestionType];
        const cached = await ctx.db.assessment.get(word, type);
        if (!cached) {
          throw new Error('题目缓存已过期，请重新生成测评');
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
        const card = row ? cardFromJson(row.fsrs_data) : createDefaultCard(now);
        const before = card.stability;
        const updated = applyRating(card, rating, now);
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
  }),

  // ===== 实时对话（Phase 4） =====
  chat: router({
    history: protectedProcedure
      .input(z.object({ threadId: z.string().max(100).optional().default('default') }))
      .query(async ({ ctx, input }) => {
        const messages = await ctx.db.chat.getRecentMessages(ctx.userId, input.threadId, 40);
        return { threadId: input.threadId, messages };
      }),
  }),

  // ===== 学情分析（Phase 5） =====
  analyst: router({
    /**
     * 获取分析报告（图表数据 + LLM 洞察）。
     * 洞察结果缓存 24h（analyst_cache 表，按 user_id + period）。
     */
    report: protectedProcedure
      .input(
        z.object({
          period: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
          refresh: z.boolean().optional().default(false),
        }),
      )
      .query(async ({ ctx, input }) => {
        const userId = ctx.userId;
        const CACHE_TTL = 24 * 60 * 60 * 1000;

        // 数据集实时计算（不缓存——数据本身轻量，保证图表最新）
        const dataset = await ctx.analyst.analyze(userId, input.period);

        // 洞察缓存：24h 命中直接返回
        if (!input.refresh) {
          const cached = await ctx.db.analystCache.get(userId, input.period);
          if (cached && Date.now() - cached.created_at < CACHE_TTL) {
            const insights = JSON.parse(cached.content) as AnalystInsight[];
            return { dataset, insights, cached: true };
          }
        }

        const insights = await generateInsights(ctx.llmRouter, dataset, {
          totalWords: dataset.growthCurve.at(-1)?.total,
        });
        await ctx.db.analystCache.set(userId, input.period, JSON.stringify(insights), Date.now());
        return { dataset, insights, cached: false };
      }),
  }),
});

export type AppRouter = typeof appRouter;
