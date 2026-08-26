/**
 * Report 节点：学习分析（统计 + LLM 总结）
 */

import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import { buildTodayQueue, cardFromJson, retrievability } from '../tools/fsrs.js';
import type { LlmRouter } from '../tools/llm-router.js';

interface ReportStats {
  totalWords: number;
  totalCards: number;
  dueToday: number;
  avgStability: number;
  avgDifficulty: number;
  weakest: Array<{ word: string; r: number }>;
  reviewDates: number;
}

export function makeReportNode(deps: AgentDeps, router: LlmRouter) {
  return async function reportNode(state: AgentState): Promise<AgentStateUpdate> {
    const userId = state.userId;
    if (userId === undefined) {
      return { error: '需要登录后查看学习分析', response: '学习分析需要登录后使用' };
    }

    const stats = await collectStats(deps, userId);
    const statsText = formatStats(stats);

    let analysis = '';
    if (router.hasLlm) {
      try {
        const call = await router.invoke(
          [
            {
              role: 'system',
              content:
                '你是学习数据分析师。根据用户的英语学习统计，用简体中文输出 3-4 句个性化学习建议（复习节奏、薄弱点、下一步计划）。',
            },
            { role: 'user', content: `学习统计：\n${statsText}` },
          ],
          'strong',
          `report_analysis_${userId}`,
        );
        analysis = call.text.trim();
      } catch (err) {
        console.warn('[REPORT] LLM 分析失败（使用规则分析）:', (err as Error).message);
      }
    }

    const response = [statsText, analysis ? `🤖 建议：${analysis}` : ''].filter(Boolean).join('\n');
    return { response };
  };
}

async function collectStats(deps: AgentDeps, userId: number): Promise<ReportStats> {
  const wordbook = await deps.wordbook.getData(userId);
  const cards = await deps.fsrsCards.getCardsByUser(userId);
  const now = new Date();

  const parsed = cards.map((c) => ({ word: c.word, card: cardFromJson(c.fsrs_data) }));
  const avg = (nums: number[]): number =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

  const weakest = parsed
    .map((p) => ({ word: p.word, r: retrievability(p.card, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 5);

  return {
    totalWords: wordbook.length,
    totalCards: cards.length,
    dueToday: buildTodayQueue(cards.map((c) => ({ word: c.word, cardJson: c.fsrs_data })), now).length,
    avgStability: avg(parsed.map((p) => p.card.stability)),
    avgDifficulty: avg(parsed.map((p) => p.card.difficulty)),
    weakest,
    reviewDates: (await deps.fsrsCards.getCardsByUser(userId)).filter((c) => c.last_review !== null).length,
  };
}

function formatStats(s: ReportStats): string {
  const weak =
    s.weakest.length > 0
      ? s.weakest.map((w) => `    · ${w.word}（R=${(w.r * 100).toFixed(1)}%）`).join('\n')
      : '    （暂无）';
  return [
    `📊 学习报告`,
    `  单词本单词数：${s.totalWords}`,
    `  FSRS 卡片数：${s.totalCards}`,
    `  今日待复习：${s.dueToday}`,
    `  平均稳定性 S：${s.avgStability.toFixed(2)}`,
    `  平均难度 D：${s.avgDifficulty.toFixed(2)}`,
    `  已复习次数≥1 的卡片：${s.reviewDates}`,
    `  回忆概率最低的 5 个词：\n${weak}`,
  ].join('\n');
}
