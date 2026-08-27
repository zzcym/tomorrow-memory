/**
 * LLM 路由层：统一调用接口
 *
 * - 主模型：DeepSeek（OpenAI 兼容 API）
 * - fallback 链：DeepSeek → 可配置的 OpenAI 兼容备用 → 抛错
 * - 场景路由：教学类（strong）用推理强模型；分类/简单任务（fast/classify）用快模型
 * - token 计数（字符近似法，不引入 tiktoken 重依赖）与成本统计
 * - 结果缓存：相同输入（含模型/温度）不重复调用
 *
 * 无 API Key 时 hasLlm() 返回 false，调用方应降级到规则/启发式实现。
 */

import { ChatOpenAI, type ChatOpenAICallOptions } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Runnable } from '@langchain/core/runnables';
import { trace } from '@opentelemetry/api';
import type { z } from 'zod';

/** OTel tracer：每个 LLM 调用一个 span（agent_name / tokens / latency / cost） */
const tracer = trace.getTracer('llm-router');

export type LlmRole = 'strong' | 'fast' | 'classify';

export interface LlmRouterOptions {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  /** 备用 OpenAI 兼容端点（可选 fallback） */
  fallbackApiKey?: string;
  fallbackBaseUrl?: string;
  fallbackModel?: string;
  /** 是否启用结果缓存（默认 true） */
  enableCache?: boolean;
}

export interface LlmCallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
}

interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ts: number;
}

/** DeepSeek 参考价（美元 / 百万 token，2025 定价，仅供成本估算） */
const PRICE_PER_MT_INPUT: Record<string, number> = {
  'deepseek-chat': 0.27,
  'deepseek-reasoner': 0.55,
};
const PRICE_PER_MT_OUTPUT: Record<string, number> = {
  'deepseek-chat': 1.1,
  'deepseek-reasoner': 2.19,
};

/** 字符数近似 token 数（中文约 1 字符/token，英文约 4 字符/token） */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}

export class LlmRouter {
  private readonly cache = new Map<string, Promise<LlmCallResult>>();
  private usage: UsageRecord[] = [];
  private readonly enableCache: boolean;

  constructor(private readonly options: LlmRouterOptions) {
    this.enableCache = options.enableCache ?? true;
  }

  get hasLlm(): boolean {
    return this.options.deepseekApiKey.length > 0;
  }

  /** 创建指定场景的 chat 模型 */
  private createModel(role: LlmRole): BaseChatModel<ChatOpenAICallOptions> {
    if (this.options.deepseekApiKey) {
      // DeepSeek 主模型
      return new ChatOpenAI({
        apiKey: this.options.deepseekApiKey,
        model: role === 'strong' ? 'deepseek-reasoner' : 'deepseek-chat',
        temperature: role === 'classify' ? 0 : 0.7,
        maxTokens: role === 'strong' ? 4096 : 2048,
        configuration: {
          baseURL: this.options.deepseekBaseUrl,
        },
      });
    }
    if (this.options.fallbackApiKey) {
      return new ChatOpenAI({
        apiKey: this.options.fallbackApiKey,
        model: this.options.fallbackModel ?? 'gpt-4o-mini',
        temperature: role === 'classify' ? 0 : 0.7,
        maxTokens: role === 'strong' ? 4096 : 2048,
        configuration: {
          baseURL: this.options.fallbackBaseUrl ?? 'https://api.openai.com/v1',
        },
      });
    }
    throw new Error('未配置任何 LLM API Key（DEEPSEEK_API_KEY 或 fallback）');
  }

  /** 模型名（用于统计） */
  private modelName(role: LlmRole): string {
    if (this.options.deepseekApiKey) {
      return role === 'strong' ? 'deepseek-reasoner' : 'deepseek-chat';
    }
    return this.options.fallbackModel ?? 'gpt-4o-mini';
  }

  /**
   * 创建结构化输出 runnable（JSON schema 约束，用于意图识别/教学内容的 structured output）
   * 无 LLM Key 时返回 null，调用方降级。
   */
  createStructured<T>(role: LlmRole, schema: z.ZodType<T>): Runnable | null {
    if (!this.hasLlm && !this.options.fallbackApiKey) return null;
    const model = this.createModel(role);
    if (model instanceof ChatOpenAI) {
      return model.withStructuredOutput(schema);
    }
    return null;
  }

  /**
   * 调用 LLM，返回文本。
   * @param messages 消息列表
   * @param role 场景
   * @param cacheKey 缓存键（相同键命中缓存；默认由 messages+role 派生）
   */
  async invoke(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    role: LlmRole = 'classify',
    cacheKey?: string,
  ): Promise<LlmCallResult> {
    const key = cacheKey ?? `${role}|${JSON.stringify(messages)}`;
    if (this.enableCache) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }

    const run = (async (): Promise<LlmCallResult> => {
      const model = this.createModel(role);
      const modelName = this.modelName(role);
      const langMessages: BaseMessage[] = messages.map((m) => {
        if (m.role === 'system') return new SystemMessage(m.content);
        if (m.role === 'user') return new HumanMessage(m.content);
        return new AIMessage(m.content);
      });
      try {
        // OTel 手动 span：记录 agent_name / input_tokens / output_tokens / latency_ms / cost_usd
        const started = Date.now();
        const res = await tracer.startActiveSpan(`llm.${modelName}`, async (span) => {
          span.setAttribute('agent_name', modelName);
          span.setAttribute('llm.role', role);
          try {
            const out = await model.invoke(langMessages);
            const text = typeof out.content === 'string' ? out.content : JSON.stringify(out.content);
            const inputTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
            const outputTokens = estimateTokens(text);
            const costUsd = this.estimateCostUsd(modelName, inputTokens, outputTokens);
            span.setAttributes({
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              latency_ms: Date.now() - started,
              cost_usd: costUsd,
            });
            this.record({ model: modelName, inputTokens, outputTokens, ts: Date.now() });
            return { text, model: modelName, inputTokens, outputTokens, cached: false };
          } catch (err) {
            span.recordException(err as Error);
            throw err;
          } finally {
            span.end();
          }
        });
        return res;
      } catch (err) {
        // fallback 链：仅当主模型为 DeepSeek 且配置了备用端点时重试一次
        if (this.options.deepseekApiKey && this.options.fallbackApiKey) {
          const fb = this.createModel(role);
          const fbName = this.options.fallbackModel ?? 'gpt-4o-mini';
          const res = await fb.invoke(langMessages);
          const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
          this.record({ model: fbName, inputTokens: 0, outputTokens: estimateTokens(text), ts: Date.now() });
          return { text, model: fbName, inputTokens: 0, outputTokens: estimateTokens(text), cached: false };
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    })();

    if (this.enableCache) this.cache.set(key, run);
    return run;
  }

  /** 估算成本（USD），供 span 标签使用 */
  private estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
    const pi = PRICE_PER_MT_INPUT[model] ?? 0.3;
    const po = PRICE_PER_MT_OUTPUT[model] ?? 1.2;
    return (inputTokens / 1_000_000) * pi + (outputTokens / 1_000_000) * po;
  }

  private record(u: UsageRecord): void {
    this.usage.push(u);
  }

  /**
   * 流式调用 LLM：逐 chunk 产出文本增量（用于 SSE / WebSocket 打字机效果）
   * 无 Key 时抛错，调用方应降级。
   */
  async *invokeStream(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    role: LlmRole = 'fast',
  ): AsyncGenerator<string, void, unknown> {
    const model = this.createModel(role);
    const modelName = this.modelName(role);
    const langMessages: BaseMessage[] = messages.map((m) => {
      if (m.role === 'system') return new SystemMessage(m.content);
      if (m.role === 'user') return new HumanMessage(m.content);
      return new AIMessage(m.content);
    });
    const started = Date.now();
    // 流式调用同样打 span（在 generator 完成时写入统计）
    const span = tracer.startSpan(`llm.stream.${modelName}`, {
      attributes: { agent_name: modelName, 'llm.role': role },
    });
    let full = '';
    try {
      const stream = await model.stream(langMessages);
      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : '';
        if (text) {
          full += text;
          yield text;
        }
      }
      const outputTokens = estimateTokens(full);
      span.setAttributes({
        input_tokens: 0,
        output_tokens: outputTokens,
        latency_ms: Date.now() - started,
        cost_usd: this.estimateCostUsd(modelName, 0, outputTokens),
      });
      this.record({ model: modelName, inputTokens: 0, outputTokens, ts: Date.now() });
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  }

  /** 累计 token 与估算成本（USD） */
  stats(): { calls: number; inputTokens: number; outputTokens: number; costUsd: number } {
    let input = 0;
    let output = 0;
    let cost = 0;
    for (const u of this.usage) {
      input += u.inputTokens;
      output += u.outputTokens;
      const pi = PRICE_PER_MT_INPUT[u.model] ?? 0.3;
      const po = PRICE_PER_MT_OUTPUT[u.model] ?? 1.2;
      cost += (u.inputTokens / 1_000_000) * pi + (u.outputTokens / 1_000_000) * po;
    }
    return { calls: this.usage.length, inputTokens: input, outputTokens: output, costUsd: cost };
  }

  /** 清空调用缓存（不影响累计统计） */
  clearCache(): void {
    this.cache.clear();
  }
}

export type { BaseChatModel };
