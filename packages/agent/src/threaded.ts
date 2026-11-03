/**
 * 带 checkpoint 的对话 Agent（Human-in-the-loop）
 *
 * - MemorySaver + thread_id：每个会话独立的状态与中断现场
 * - orchestrator 意图不明确时 interrupt 暂停，反问用户
 * - resume(threadId, resumeValue, userId) 恢复执行
 *
 * 中断信息获取：LangGraph 0.2.x 的 invoke 返回 state 不含 __interrupt__，
 * 需通过 graph.getState(config).tasks[].interrupts 读取。
 *
 * ── T-11 / R-05①（审计 S8·C-06）：checkpoint 命名空间按用户隔离 ──────────────
 * 改造前 thread_id 就是客户端传来的裸 `threadId`，而默认值是 `'default'` ——
 * 任何两个用户同时用默认会话都会命中**同一份** checkpoint（HITL 现场互相可见、
 * 互相续聊）。现在落库/取回的 key 一律是 `{userId}:{threadId}`。
 *
 * 兼容读（**不做数据迁移**，PRD §6.1-5）：
 *   1) 新 key 命中 → 直接用；
 *   2) 新 key 未命中且存在**改造前写的裸 threadId checkpoint** → 只有在
 *      `claimLegacyThread(userId, threadId)` 明确判"这条归我"时才允许读它；
 *   3) 判不了、没给裁决函数、或已被别人先认领 → **抛 ThreadAccessError**（403 语义）。
 *      绝不"猜属主"，也绝不因为键对不上就抛未捕获异常（500）。
 *
 * ⚠ MemorySaver 是**进程内**存储：跨进程/重启后旧裸 key 本来就不存在，
 *   所以认领表也只需进程内即可（服务端别处也不再依赖裸 key 可读）。
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
  /** 本次实际使用的 checkpoint key（`{userId}:{threadId}` 或兼容读命中的裸 key） */
  checkpointKey: string;
  /** true = 走了"兼容读"（读到的是改造前的裸 threadId checkpoint） */
  legacy: boolean;
}

/** 跨用户 / 归属不明时抛出：调用方翻成 403 `FORBIDDEN`，不得冒成 500。 */
export class ThreadAccessError extends Error {
  readonly code = 'FORBIDDEN';
  readonly threadId: string;
  readonly reason: 'foreign-owner' | 'unclaimed-legacy' | 'no-claim-decision';

  constructor(threadId: string, reason: ThreadAccessError['reason'], message: string) {
    super(message);
    this.name = 'ThreadAccessError';
    this.threadId = threadId;
    this.reason = reason;
  }
}

export const THREAD_NS_SEPARATOR = ':';

/** 命名后的 checkpoint key（`userId` 缺省 = 未鉴权调用点，保持旧裸 key，不新增崩溃面）。 */
export function checkpointKeyOf(userId: number | undefined, threadId: string): string {
  return userId === undefined ? threadId : `${userId}${THREAD_NS_SEPARATOR}${threadId}`;
}

/** 反解 checkpoint key：`{数字}:{其余}` = 已隔离的新 key，否则视为改造前的裸 key。 */
export function splitCheckpointKey(key: string): { owner: number | null; threadId: string } {
  const m = /^(\d{1,15}):([\s\S]+)$/.exec(key);
  if (m) return { owner: Number(m[1]), threadId: m[2] as string };
  return { owner: null, threadId: key };
}

export interface ThreadedAgent {
  invoke(threadId: string, input: string, userId?: number): Promise<ThreadedAgentStep>;
  resume(threadId: string, resumeValue: string, userId?: number): Promise<ThreadedAgentStep>;
}

export interface ThreadedAgentOptions {
  /**
   * 兼容读裁决：改造前那条裸 `threadId` 的 checkpoint 能不能归给这个用户。
   * 缺省 = 不给裁决 ⇒ 一律不读旧 key（fail-closed），调用方拿到 403 而不是猜测。
   */
  claimLegacyThread?: (userId: number, legacyThreadId: string) => Promise<boolean> | boolean;
}

export function createThreadedAgent(
  deps: AgentDeps,
  router: LlmRouter,
  checkpointer: BaseCheckpointSaver = new MemorySaver(),
  options: ThreadedAgentOptions = {},
): ThreadedAgent {
  const graph = buildAgentGraph(deps, router, { checkpointer });

  const baseState = (userId?: number): AgentStateUpdate => ({
    userId,
    input: '',
    recentWords: [],
    reviewQueue: [],
  });

  /** checkpoint 是否存在的探针（直接问 checkpointer，不问 graph —— graph 不暴露它） */
  async function hasCheckpoint(threadKey: string): Promise<boolean> {
    const saver = checkpointer as { getTuple?: (c: unknown) => Promise<unknown> };
    if (typeof saver.getTuple !== 'function') return false;
    try {
      const tuple = await saver.getTuple({ configurable: { thread_id: threadKey } });
      return tuple !== null && tuple !== undefined;
    } catch (err) {
      // 探针失败不能变成"当作没有" → 那会让兼容读静默丢现场；抛出去由门面翻成 403
      throw new ThreadAccessError(threadKey, 'no-claim-decision', `无法确认会话状态：${(err as Error).message}`);
    }
  }

  /**
   * 选定本次用的 checkpoint key：新 key 优先，未命中才回退裸 key（且要有归属裁决）。
   * @throws ThreadAccessError 归属不明 / 属于他人 ⇒ 403 语义
   */
  async function resolveKey(threadId: string, userId?: number): Promise<{ key: string; legacy: boolean }> {
    const key = checkpointKeyOf(userId, threadId);
    if (await hasCheckpoint(key)) return { key, legacy: false };
    if (userId === undefined || key === threadId) return { key, legacy: false };
    if (!(await hasCheckpoint(threadId))) return { key, legacy: false };

    const claim = options.claimLegacyThread;
    if (!claim) {
      throw new ThreadAccessError(threadId, 'no-claim-decision', '这份会话记录的归属无法确认');
    }
    const allowed = await claim(userId, threadId);
    if (!allowed) {
      throw new ThreadAccessError(threadId, 'unclaimed-legacy', '这份会话记录不属于当前账号');
    }
    return { key: threadId, legacy: true };
  }

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
      const { key, legacy } = await resolveKey(threadId, userId);
      const config = { configurable: { thread_id: key } };
      const state = await graph.invoke({ ...baseState(userId), input }, config);
      const interrupt = await readInterrupt(config);
      if (interrupt !== null) return { result: null, interrupt, checkpointKey: key, legacy };
      return { result: state as AgentState, interrupt: null, checkpointKey: key, legacy };
    },

    async resume(threadId: string, resumeValue: string, userId?: number): Promise<ThreadedAgentStep> {
      const { key, legacy } = await resolveKey(threadId, userId);
      const config = { configurable: { thread_id: key } };
      const state = await graph.invoke(new Command({ resume: resumeValue }), config);
      const interrupt = await readInterrupt(config);
      if (interrupt !== null) return { result: null, interrupt, checkpointKey: key, legacy };
      return { result: state as AgentState, interrupt: null, checkpointKey: key, legacy };
    },
  };
}
