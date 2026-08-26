/**
 * Orchestrator 节点：意图识别（LLM function calling / structured output，无 LLM 时启发式降级）
 *
 * 意图分类：lookup（查词）| learn（教学）| review（复习）| assess（测评）| report（分析）
 */

import { z } from 'zod';
import { interrupt } from '@langchain/langgraph';
import type { AgentIntent } from '@tm/shared';
import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import type { LlmRouter } from '../tools/llm-router.js';

const INTENTS = ['lookup', 'learn', 'review', 'assess', 'report'] as const;

const IntentOutputSchema = z.object({
  intent: z.enum(INTENTS),
  /** 目标单词（如适用） */
  word: z.string().optional(),
  /** assess 时的评分 1-4 */
  rating: z.number().int().min(1).max(4).optional(),
});

/** 从输入中提取第一个英文单词（含连字符） */
function extractWord(input: string): string | undefined {
  const m = input.match(/[a-zA-Z][a-zA-Z'-]{1,63}/);
  return m ? m[0].toLowerCase() : undefined;
}

/** 启发式意图识别（无 LLM Key 时的降级实现） */
export function heuristicIntent(input: string): { intent: AgentIntent; word?: string; rating?: 1 | 2 | 3 | 4 } {
  const text = input.toLowerCase();
  const word = extractWord(input);

  if (/(测评|测试|考我|测验|评分|复习结果|打分)/.test(text) && word) {
    // 尝试提取评分：如 "考我 hello，我答 3 分"
    const ratingMatch = text.match(/(\d)\s*分/);
    return {
      intent: 'assess',
      word,
      rating: ratingMatch ? (Number(ratingMatch[1]) as 1 | 2 | 3 | 4) : undefined,
    };
  }
  if (/(复习|回顾|打卡复习|今天复习|待复习)/.test(text)) return { intent: 'review', word };
  if (/(分析|报告|统计|进度|总结|我的学习情况)/.test(text)) return { intent: 'report', word };
  if (/(怎么记|记忆|口诀|词根|词缀|辨析|区别|教教|教我|讲解|学习)/.test(text)) {
    return { intent: 'learn', word };
  }
  if (/(查|翻译|意思|释义|是什么意思|怎么读)/.test(text)) return { intent: 'lookup', word };
  if (word && text.trim() === word) return { intent: 'learn', word };
  // 默认：若有单词 → 教学；否则查词
  return { intent: word ? 'learn' : 'lookup', word };
}

/** 输入是否意图明确（含动作关键词或具体单词） */
export function hasClearIntent(input: string): boolean {
  const text = input.toLowerCase();
  return /(测评|测试|考我|测验|评分|打分|复习|回顾|分析|报告|统计|进度|总结|怎么记|记忆|口诀|词根|词缀|辨析|区别|教|讲解|学习|查|翻译|意思|释义)/.test(
    text,
  );
}

export function makeOrchestratorNode(deps: AgentDeps, router: LlmRouter) {
  return async function orchestratorNode(state: AgentState): Promise<AgentStateUpdate> {
    const input = state.input;
    const update: AgentStateUpdate = {};

    // 加载用户上下文：CEFR 水平 + 最近学习的 10 个词（供 Tutor/Report 使用）
    if (state.userId !== undefined) {
      try {
        const level = deps.getCefrLevel ? await deps.getCefrLevel(state.userId) : undefined;
        if (level) update.cefrLevel = level;
        const entries = await deps.wordbook.getData(state.userId);
        update.recentWords = entries
          .slice()
          .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
          .slice(0, 10)
          .map((e) => e.word)
          .filter((w): w is string => typeof w === 'string');
      } catch (err) {
        console.warn('[ORCHESTRATOR] 加载用户上下文失败:', (err as Error).message);
      }
    }

    if (router.hasLlm) {
      try {
        const structured = router.createStructured?.('classify', IntentOutputSchema);
        if (structured) {
          const result = await structured.invoke([
            {
              role: 'system',
              content:
                '你是英语学习应用"明日记忆"的意图识别器。' +
                '把用户输入分类为：lookup(查词释义) / learn(教学讲解) / review(复习调度) / assess(测评评分) / report(学习分析)。' +
                '输出 JSON：{intent, word?, rating?}。',
            },
            { role: 'user', content: input },
          ]);
          const parsed = IntentOutputSchema.safeParse(result);
          if (parsed.success) {
            const { intent, word, rating } = parsed.data;
            return {
              ...update,
              intent,
              word: word ?? extractWord(input),
              reviewFeedback: rating ? { word: word ?? extractWord(input) ?? '', rating: rating as 1 | 2 | 3 | 4 } : undefined,
            };
          }
        }
      } catch (err) {
        console.warn('[ORCHESTRATOR] LLM 意图识别失败，降级启发式:', (err as Error).message);
      }
    }

    // Human-in-the-loop：意图完全不明确时暂停反问（需要 checkpointer，失败则降级默认意图）
    if (!hasClearIntent(input) && !extractWord(input)) {
      try {
        const answer = interrupt(
          '抱歉，我不太确定你想做什么。可以告诉我吗？（回复：查词 / 学习 / 复习 / 测评 / 分析，或直接输入一个单词）',
        );
        const resolved = heuristicIntent(typeof answer === 'string' ? answer : String(answer ?? ''));
        return {
          ...update,
          intent: resolved.intent,
          word: resolved.word,
          reviewFeedback: resolved.rating ? { word: resolved.word ?? '', rating: resolved.rating } : undefined,
        };
      } catch (err) {
        // LangGraph 的 interrupt 通过抛出中断信号暂停执行（0.2.x 序列化后为
        // [{value, when, resumable, ns}] 结构）。必须原样重新抛出让图处理，
        // 不能当作普通错误降级；用 JSON 序列化鲁棒检测中断信号。
        let signalText = '';
        try {
          signalText = JSON.stringify(err) ?? '';
        } catch {
          signalText = String(err);
        }
        const isInterruptSignal =
          signalText.includes('"resumable"') && signalText.includes('"ns"') && signalText.includes('"value"');
        if (isInterruptSignal) {
          throw err;
        }
        console.warn('[ORCHESTRATOR] interrupt 不可用（无 checkpointer），使用默认意图:', (err as Error).message);
      }
    }

    const h = heuristicIntent(input);
    return {
      ...update,
      intent: h.intent,
      word: h.word,
      reviewFeedback: h.rating ? { word: h.word ?? '', rating: h.rating } : undefined,
    };
  };
}
