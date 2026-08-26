/**
 * LangGraph 编排：orchestrator 节点 → 条件路由 → 各专业 Agent 节点
 *
 *   START → orchestrator
 *             ├─ lookup → lexicon → END
 *             ├─ learn  → tutor   → END
 *             ├─ review → scheduler → END
 *             ├─ assess → scheduler → END
 *             └─ report → report   → END
 */

import { END, START, StateGraph } from '@langchain/langgraph';
import type { AgentIntent, CefrLevel } from '@tm/shared';
import type { AgentDeps } from './deps.js';
import { makeOrchestratorNode } from './nodes/orchestrator.js';
import { makeLexiconNode } from './nodes/lexicon.js';
import { makeTutorNode } from './nodes/tutor.js';
import { makeSchedulerNode } from './nodes/scheduler.js';
import { makeReportNode } from './nodes/report.js';
import { AgentStateAnnotation, type AgentState, type AgentStateUpdate } from './state.js';
import type { LlmRouter } from './tools/llm-router.js';

const ROUTE_TABLE: Record<AgentIntent, string> = {
  lookup: 'lexicon',
  learn: 'tutor',
  review: 'scheduler',
  assess: 'scheduler',
  report: 'report',
};

function routeByIntent(state: AgentState): string {
  return ROUTE_TABLE[state.intent ?? 'lookup'];
}

export function buildAgentGraph(deps: AgentDeps, router: LlmRouter) {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('orchestrator', makeOrchestratorNode(deps, router))
    .addNode('lexicon', makeLexiconNode(deps, router))
    .addNode('tutor', makeTutorNode(deps, router))
    .addNode('scheduler', makeSchedulerNode(deps))
    .addNode('report', makeReportNode(deps, router))
    .addEdge(START, 'orchestrator')
    .addConditionalEdges('orchestrator', routeByIntent, {
      lexicon: 'lexicon',
      tutor: 'tutor',
      scheduler: 'scheduler',
      report: 'report',
    })
    .addEdge('lexicon', END)
    .addEdge('tutor', END)
    .addEdge('scheduler', END)
    .addEdge('report', END);

  return graph.compile();
}

export interface AgentRunInput {
  userId?: number;
  input: string;
  word?: string;
  cefrLevel?: CefrLevel;
  /** 测评反馈（assess 意图） */
  rating?: 1 | 2 | 3 | 4;
}

/** 运行一次 Agent 编排，返回最终状态（含 response） */
export async function runAgent(
  deps: AgentDeps,
  router: LlmRouter,
  input: AgentRunInput,
): Promise<AgentState> {
  const graph = buildAgentGraph(deps, router);
  const initialState: AgentStateUpdate = {
    userId: input.userId,
    input: input.input,
    word: input.word,
    cefrLevel: input.cefrLevel,
    reviewFeedback: input.rating ? { word: input.word ?? '', rating: input.rating } : undefined,
    recentWords: [],
    reviewQueue: [],
  };
  return graph.invoke(initialState);
}
