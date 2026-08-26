/**
 * Agent 共享状态类型与 LangGraph Annotation
 */

import { Annotation } from '@langchain/langgraph';
import type { AgentIntent, CefrLevel, TutorContent } from '@tm/shared';
import type {
  LookupEn2ZhFallback,
  LookupEn2ZhSuccess,
  LookupMixedResponse,
  LookupZh2EnResponse,
} from './types.js';

/** 今日复习队列条目 */
export interface ReviewItem {
  word: string;
  /** 回忆概率 R ∈ (0, 1] */
  retrievability: number;
  /** 距上次复习天数 */
  elapsedDays: number;
  /** 卡片 JSON（ts-fsrs Card 序列化） */
  cardJson: string;
}

/** 测评反馈（assess 意图输入） */
export interface ReviewFeedback {
  word: string;
  /** 用户评分：1=Again 2=Hard 3=Good 4=Easy */
  rating: 1 | 2 | 3 | 4;
}

/** 查词结果（lexicon 节点输出） */
export type LookupOutcome =
  | LookupEn2ZhSuccess
  | LookupEn2ZhFallback
  | LookupZh2EnResponse
  | LookupMixedResponse;

export const AgentStateAnnotation = Annotation.Root({
  /** 用户 id（可选，匿名查词时为空） */
  userId: Annotation<number | undefined>,
  /** 用户原始输入 */
  input: Annotation<string>,
  /** orchestrator 识别出的意图 */
  intent: Annotation<AgentIntent | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** 当前词 */
  word: Annotation<string | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** 用户 CEFR 水平 */
  cefrLevel: Annotation<CefrLevel | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** 最近学习的 10 个词 */
  recentWords: Annotation<string[]>({
    reducer: (cur, next) => (next.length > 0 ? next : cur),
  }),
  /** lexicon 查词结果 */
  lookupResult: Annotation<LookupOutcome | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** tutor 教学结果 */
  tutorContent: Annotation<TutorContent | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** scheduler 复习队列 */
  reviewQueue: Annotation<ReviewItem[]>({
    reducer: (cur, next) => (next.length > 0 ? next : cur),
  }),
  /** 测评反馈 */
  reviewFeedback: Annotation<ReviewFeedback | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** LLM 补充内容（词源/记忆提示等） */
  llmSupplement: Annotation<string | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** 最终回复文本 */
  response: Annotation<string | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /** 错误信息 */
  error: Annotation<string | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
  /**
   * LangGraph interrupt 信号（HITL）。
   * 显式声明该 channel，否则 invoke 返回的 state 会被 Annotation 过滤掉中断信息。
   */
  __interrupt__: Annotation<Array<{ value?: unknown; when?: string; resumable?: boolean }> | undefined>({
    reducer: (cur, next) => next ?? cur,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
export type AgentStateUpdate = Partial<typeof AgentStateAnnotation.State>;
