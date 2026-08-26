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
export type { AgentDeps, FsrsCardPort, LookupPort, TutorCachePort, WordbookPort } from './deps.js';
