/**
 * Analyst Agent 工具：学情洞察生成
 *
 * 将 SQL 聚合结果 + 用户画像传入 LLM，生成自然语言洞察：
 *  - positive（正面反馈）
 *  - warning（问题诊断）
 *  - suggestion（改进建议）
 *  - prediction（预测）
 */

import { z } from 'zod';
import type { AnalyticsDataset, AnalystInsight } from '@tm/shared';
import type { LlmRouter } from './llm-router.js';

export const InsightsSchema = z.object({
  insights: z.array(
    z.object({
      type: z.enum(['positive', 'warning', 'suggestion', 'prediction']),
      text: z.string(),
    }),
  ),
});

export interface UserProfileLite {
  nickname?: string;
  totalWords?: number;
  reviewDays?: number;
  dailyGoal?: number;
}

/** 规则降级洞察（无 LLM 时基于统计数据生成） */
export function fallbackInsights(dataset: AnalyticsDataset): AnalystInsight[] {
  const insights: AnalystInsight[] = [];
  const last = dataset.growthCurve[dataset.growthCurve.length - 1];
  if (last && last.total > 0) {
    insights.push({ type: 'positive', text: `你目前累计学习 ${last.total} 个单词，词汇量正在稳步增长。` });
  } else {
    insights.push({ type: 'warning', text: '还没有词汇增长数据，去查词页添加第一个单词吧。' });
  }
  const reviews = dataset.reviewEfficiency.reduce((s, r) => s + r.reviewCount, 0);
  if (reviews > 0) {
    insights.push({ type: 'positive', text: `期间累计复习 ${reviews} 次，坚持就是胜利！` });
  } else {
    insights.push({ type: 'suggestion', text: '暂时没有复习记录，建议每天抽 10 分钟完成今日复习队列。' });
  }
  const weakest = dataset.forgettingCurve.filter((b) => b.range === '0-1' || b.range === '1-2');
  if (weakest.length > 0 && weakest[0]!.count > 0) {
    insights.push({
      type: 'warning',
      text: `有 ${weakest[0]!.count} 个单词稳定性很低（S<2），建议优先复习这些单词。`,
    });
  }
  insights.push({
    type: 'prediction',
    text: '按当前节奏持续学习，你的词汇量将在 3 个月内显著提升（配置 LLM Key 后可获得精确预测）。',
  });
  return insights;
}

/** 生成洞察（LLM structured output，无 LLM 时规则降级） */
export async function generateInsights(
  router: LlmRouter,
  dataset: AnalyticsDataset,
  profile: UserProfileLite = {},
): Promise<AnalystInsight[]> {
  const runnable = router.createStructured('strong', InsightsSchema);
  if (!runnable) return fallbackInsights(dataset);

  try {
    const result = await runnable.invoke([
      {
        role: 'system',
        content:
          '你是资深学习数据分析师。根据用户的英语学习统计生成 3-5 条洞察，类型为：' +
          'positive（正面反馈，如"词汇增长加快"）/ warning（问题诊断，如"某时段遗忘率偏高"）/ ' +
          'suggestion（改进建议，如"调整复习时间"）/ prediction（预测，如"3 个月后词汇量"）。' +
          '每条 1-2 句，简体中文，数据驱动。',
      },
      {
        role: 'user',
        content:
          `用户画像：${JSON.stringify(profile)}\n` +
          `学情统计：${JSON.stringify(dataset).slice(0, 4000)}`,
      },
    ]);
    const parsed = InsightsSchema.safeParse(result);
    if (parsed.success) return parsed.data.insights;
    throw new Error('Insights structured output 解析失败');
  } catch (err) {
    console.warn('[ANALYST] LLM 洞察生成失败，降级规则:', (err as Error).message);
    return fallbackInsights(dataset);
  }
}
