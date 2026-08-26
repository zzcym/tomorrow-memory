/**
 * 带 checkpoint 的对话 Agent（Human-in-the-loop）
 *
 * - MemorySaver + thread_id：每个会话独立的状态与中断现场
 * - orchestrator 意图不明确时 interrupt 暂停，反问用户
 * - resume(threadId, value) 恢复执行
 *
 * 中断信息获取：LangGraph 0.2.x 的 invoke 返回 state 不含 __interrupt__，
 * 需通过 graph.getState(config).tasks[].interrupts 读取。
 */

import { Command, MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { buildAgentGraph } from './graph.js';
import type { AgentDeps } from './deps.js';
import type { AgentState, AgentStateUpdate } from './state.js';
import type { LlmRouter } from './tools/llm-router.js';

export interface ThreadedAgentStep {
  /** 完成时的最终状态；中断时为 null */
  result: AgentState | null;
  /** 中断问题（等待用户回答） */
  interrupt: string | null;
}

export interface ThreadedAgent {
  invoke(threadId: string, input: string, userId?: number): Promise<ThreadedAgentStep>;
  resume(threadId: string, resumeValue: string): Promise<ThreadedAgentStep>;
}

export function createThreadedAgent(
  deps: AgentDeps,
  router: LlmRouter,
  checkpointer: BaseCheckpointSaver = new MemorySaver(),
): ThreadedAgent {
  const graph = buildAgentGraph(deps, router, { checkpointer });

  const baseState = (userId?: number): AgentStateUpdate => ({
    userId,
    input: '',
    recentWords: [],
    reviewQueue: [],
  });

  /** 从线程状态读取 pending interrupt 问题 */
  async function readInterrupt(config: { configurable: { thread_id: string } }): Promise<string | null> {
    try {
      const snapshot = await graph.getState(config);
      const tasks = snapshot.tasks ?? [];
      for (const task of tasks) {
        const interrupts = (task as { interrupts?: Array<{ value?: unknown }> }).interrupts ?? [];
        if (interrupts.length > 0) {
          const value = interrupts[0]?.value;
          return typeof value === 'string' ? value : JSON.stringify(value ?? '');
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  return {
    async invoke(threadId: string, input: string, userId?: number): Promise<ThreadedAgentStep> {
      const config = { configurable: { thread_id: threadId } };
      const state = await graph.invoke({ ...baseState(userId), input }, config);
      const interrupt = await readInterrupt(config);
      if (interrupt !== null) return { result: null, interrupt };
      return { result: state as AgentState, interrupt: null };
    },

    async resume(threadId: string, resumeValue: string): Promise<ThreadedAgentStep> {
      const config = { configurable: { thread_id: threadId } };
      const state = await graph.invoke(new Command({ resume: resumeValue }), config);
      const interrupt = await readInterrupt(config);
      if (interrupt !== null) return { result: null, interrupt };
      return { result: state as AgentState, interrupt: null };
    },
  };
}
