/**
 * Scheduler Agent 节点：FSRS-5.0 复习调度
 *
 * - review（复习）：计算今日复习队列（R < 0.9 按 R 升序）
 * - assess（测评）：用户评分 → FSRS Rating → 更新 stability/difficulty/due
 */

import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import {
  RATING_LABEL,
  applyRating,
  buildTodayQueue,
  cardFromJson,
  cardToJson,
  createDefaultCard,
  retrievability,
} from '../tools/fsrs.js';

export function makeSchedulerNode(deps: AgentDeps) {
  return async function schedulerNode(state: AgentState): Promise<AgentStateUpdate> {
    const userId = state.userId;
    if (userId === undefined) {
      return { error: '需要登录后才能使用复习功能', response: '复习功能需要登录后使用（获取 userId 失败）' };
    }

    // ===== assess：测评评分 → FSRS 更新 =====
    if (state.intent === 'assess') {
      return handleAssess(deps, state, userId);
    }

    // ===== review：生成今日复习队列 =====
    return handleReview(deps, state, userId);
  };
}

async function handleReview(
  deps: AgentDeps,
  state: AgentState,
  userId: number,
): Promise<AgentStateUpdate> {
  const cards = await deps.fsrsCards.getCardsByUser(userId);
  if (cards.length === 0) {
    return { reviewQueue: [], response: '你的单词本还没有单词，先去学习/添加一些单词吧！' };
  }
  const queue = buildTodayQueue(cards.map((c) => ({ word: c.word, cardJson: c.fsrs_data })));
  const summary = queue
    .map((item, i) => `  ${i + 1}. ${item.word}（回忆概率 ${(item.retrievability * 100).toFixed(1)}%）`)
    .join('\n');
  const dueToday = cards.filter((c) => {
    const card = cardFromJson(c.fsrs_data);
    return new Date(card.due).getTime() <= Date.now();
  }).length;
  return {
    reviewQueue: queue,
    response:
      queue.length === 0
        ? `今天没有需要复习的单词（共 ${cards.length} 张卡片，全部 R ≥ 0.9）。`
        : `📅 今日待复习 ${queue.length} 个单词（共 ${cards.length} 张卡片，其中 ${dueToday} 个到期）：\n${summary}\n\n回复"测评 单词 评分"开始复习，例如：测评 serendipity 3 分`,
  };
}

async function handleAssess(
  deps: AgentDeps,
  state: AgentState,
  userId: number,
): Promise<AgentStateUpdate> {
  const feedback = state.reviewFeedback;
  const word = feedback?.word ?? state.word ?? '';
  const rating = feedback?.rating;
  if (!word || !rating) {
    return {
      response:
        '测评需要提供单词和评分。格式：`测评 <单词> <评分>`，评分 1=忘记 2=困难 3=良好 4=轻松。例如：测评 serendipity 3',
    };
  }

  const row = await deps.fsrsCards.getCard(userId, word);
  const now = new Date();
  const card = row ? cardFromJson(row.fsrs_data) : createDefaultCard(now);
  const before = card.stability;
  const updated = applyRating(card, rating, now);
  await deps.fsrsCards.upsertCard(userId, word, cardToJson(updated), now.getTime(), now.getTime());

  const rBefore = retrievability(card, now);
  return {
    response: [
      `✅ 已记录「${word}」的测评结果：${RATING_LABEL[rating]}`,
      `  稳定性 S：${before.toFixed(2)} → ${updated.stability.toFixed(2)}`,
      `  难度 D：${updated.difficulty.toFixed(2)}`,
      `  复习前回忆概率：${(rBefore * 100).toFixed(1)}%`,
      `  下次复习：${updated.due.toISOString().slice(0, 10)}`,
    ].join('\n'),
  };
}
