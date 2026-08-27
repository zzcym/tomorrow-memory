/**
 * @tm/agent —— Multi-Agent 编排核心
 *
 * - LangGraph 图编排（graph.ts）：orchestrator → 条件路由 → lexicon/tutor/scheduler/report
 * - LLM 路由层（tools/llm-router.ts）：DeepSeek 主 + fallback、token 统计、结果缓存
 * - FSRS-5.0 调度（tools/fsrs.ts）：retrievability、今日队列、评分更新
 * - 向量检索（tools/embedding.ts / qdrant.ts）：embedding + Qdrant
 */

export { buildAgentGraph, runAgent, type AgentRunInput } from './graph.js';
export {
  AgentStateAnnotation,
  type AgentState,
  type AgentStateUpdate,
  type ReviewFeedback,
  type ReviewItem,
} from './state.js';
export { LlmRouter, estimateTokens, type LlmRole, type LlmRouterOptions } from './tools/llm-router.js';
export {
  createEmbeddingClient,
  LocalHashEmbedding,
  OpenAiEmbeddingClient,
  type EmbeddingClient,
} from './tools/embedding.js';
export { QdrantClient, type QdrantPoint, type QdrantSearchHit } from './tools/qdrant.js';
export {
  REVIEW_THRESHOLD,
  applyRating,
  buildTodayQueue,
  cardFromJson,
  cardToJson,
  createDefaultCard,
  retrievability,
  retrievabilityPowerLaw,
  RATING_LABEL,
} from './tools/fsrs.js';
export {
  generateQuestion,
  fallbackQuestion,
  gradeAnswer,
  pickQuestionType,
  scoreToFsrsRating,
  SCORE_LABEL,
  AssessmentQuestionSchema,
  type AssessmentQuestion,
  type AssessmentQuestionType,
  type AssessmentScore,
} from './tools/assessment.js';
export {
  generateInsights,
  fallbackInsights,
  InsightsSchema,
  type UserProfileLite,
} from './tools/analyst.js';
export {
  createThreadedAgent,
  type ThreadedAgent,
  type ThreadedAgentStep,
} from './threaded.js';
// HITL 原语转发（供 server 层使用）
export { Command, MemorySaver, interrupt } from '@langchain/langgraph';
export type {
  AgentDeps,
  AnalystPort,
  AnalysisPeriod,
  FsrsCardPort,
  LookupPort,
  TutorCachePort,
  WordbookPort,
} from './deps.js';
