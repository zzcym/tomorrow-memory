/**
 * Analyst Agent 节点：学情分析（report 意图）
 *
 * 通过注入的 AnalystPort 获取聚合数据（ClickHouse 优先 / DB 降级），
 * 再调用 LLM 生成自然语言洞察（无 LLM 时规则降级）。
 * 洞察缓存（24h）由 server 层处理（analystCache 表）。
 */

import type { AnalyticsDataset, AnalystInsight } from '@tm/shared';
import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import { generateInsights } from '../tools/analyst.js';
import type { LlmRouter } from '../tools/llm-router.js';

export interface AnalystNodeResult {
  dataset: AnalyticsDataset | null;
  insights: AnalystInsight[];
}

export function makeAnalystNode(deps: AgentDeps, router: LlmRouter) {
  return async function analystNode(state: AgentState): Promise<AgentStateUpdate> {
    const userId = state.userId;
    if (userId === undefined) {
      return { error: '需要登录后查看学情分析', response: '学情分析需要登录后使用' };
    }
    if (!deps.analystPort) {
      return { error: '分析服务未注入', response: '学情分析服务不可用（未注入 AnalystPort）' };
    }

    try {
      const dataset = await deps.analystPort.analyze(userId, '30d');
      const insights = await generateInsights(router, dataset, {
        totalWords: dataset.growthCurve.at(-1)?.total,
      });
      const lines = insights.map((i) => `  · ${i.text}`);
      return {
        response: [`📊 学情分析（${dataset.period}，来源 ${dataset.source}）`, ...lines].join('\n'),
        analysis: { dataset, insights } satisfies AnalystNodeResult,
      };
    } catch (err) {
      console.error('[ANALYST] 分析失败:', err);
      return { error: '分析失败', response: '学情分析暂时不可用，请稍后重试' };
    }
  };
}
