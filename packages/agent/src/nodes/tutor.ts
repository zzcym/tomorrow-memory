/**
 * Tutor Agent 节点：LLM structured output 生成四类教学内容
 *
 * - 记忆口诀 mnemonic
 * - 词根词缀拆解 wordRoot
 * - 场景例句 sceneExamples（3 个）
 * - 易混淆词辨析 confusable
 *
 * prompt 注入：单词、用户 CEFR 水平、最近学习的 10 个词。
 * PostgreSQL/SQLite 缓存：tutor_cache(word, level)，相同单词+水平直接命中（预期 85%+）。
 */

import { z } from 'zod';
import type { CefrLevel, SceneExample, TutorContent } from '@tm/shared';
import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import type { LlmRouter } from '../tools/llm-router.js';

export const SceneExampleSchema = z.object({
  en: z.string().describe('英文例句'),
  zh: z.string().describe('中文翻译'),
  scene: z.string().describe('使用场景（如：日常对话/学术写作）'),
});

export const TutorContentSchema = z.object({
  mnemonic: z.string().describe('帮助记忆该单词的口诀或联想'),
  wordRoot: z.string().describe('词根/词缀拆解'),
  sceneExamples: z.array(SceneExampleSchema).length(3).describe('3 个场景例句'),
  confusable: z.string().describe('易混淆词的辨析（对比 1-2 个相近词）'),
});

/** 无 LLM 时的规则降级内容（保证流程可跑，生产应配 Key） */
function fallbackTutorContent(word: string): TutorContent {
  const lower = word.toLowerCase();
  return {
    mnemonic: `联想记忆：${word} 与它的发音/拼写特征关联（TODO: 配置 LLM Key 后由 Tutor Agent 生成个性化口诀）。`,
    wordRoot: `${word}（暂未配置词根库，可接入 Etymonline 数据或 LLM 拆解）`,
    sceneExamples: [
      { en: `I need to ${lower} this word in context.`, zh: `我需要结合语境学习 ${word}。`, scene: '学习记录' },
      { en: `The teacher explained "${lower}" clearly.`, zh: `老师清晰地解释了 ${word}。`, scene: '课堂' },
      { en: `"${lower}" appears in today's reading.`, zh: `${word} 出现在今天的阅读里。`, scene: '阅读' },
    ],
    confusable: `${word}（暂无对比词数据，配置 LLM 后自动生成辨析）`,
  };
}

export function makeTutorNode(deps: AgentDeps, router: LlmRouter) {
  return async function tutorNode(state: AgentState): Promise<AgentStateUpdate> {
    const word = (state.word ?? '').trim().toLowerCase();
    if (!word) {
      return { error: '缺少要学习的单词', response: '请告诉我要学习哪个单词，例如"讲解一下 serendipity"（教学节点）' };
    }

    const level: CefrLevel = state.cefrLevel ?? 'B1';

    // 1. 命中缓存（相同单词 + 相同水平）
    try {
      const cached = await deps.tutorCache.get(word, level);
      if (cached) {
        const content = JSON.parse(cached.content) as TutorContent;
        return {
          tutorContent: content,
          response: formatTutorResponse(word, level, content, true),
        };
      }
    } catch (err) {
      console.warn('[TUTOR] 缓存读取失败:', (err as Error).message);
    }

    // 2. 生成（LLM structured output，无 LLM 时降级规则）
    let content: TutorContent;
    let fromLlm = false;
    if (router.hasLlm) {
      try {
        const recent = state.recentWords.slice(-10).join(', ') || '（无历史）';
        const runnable = router.createStructured('strong', TutorContentSchema);
        if (!runnable) throw new Error('无法创建结构化输出模型');
        const result = await runnable.invoke([
          {
            role: 'system',
            content:
              '你是资深英语教师，为单词生成个性化教学内容。' +
              `用户 CEFR 水平：${level}。` +
              `用户最近学习的单词：${recent}。` +
              '输出必须为 JSON：{mnemonic, wordRoot, sceneExamples:[{en,zh,scene}], confusable}。',
          },
          { role: 'user', content: `请为单词 "${word}" 生成教学内容。` },
        ]);
        const parsed = TutorContentSchema.safeParse(result);
        if (!parsed.success) throw new Error('Tutor structured output 解析失败: ' + JSON.stringify(parsed.error.issues));
        content = parsed.data;
        fromLlm = true;
      } catch (err) {
        console.warn('[TUTOR] LLM 生成失败，降级规则内容:', (err as Error).message);
        content = fallbackTutorContent(word);
      }
    } else {
      content = fallbackTutorContent(word);
    }

    // 3. 写缓存（LLM 生成的内容才值得缓存；规则降级内容不缓存）
    if (fromLlm) {
      try {
        await deps.tutorCache.set(word, level, JSON.stringify(content), Date.now());
      } catch (err) {
        console.warn('[TUTOR] 缓存写入失败:', (err as Error).message);
      }
    }

    return {
      tutorContent: content,
      response: formatTutorResponse(word, level, content, false),
    };
  };
}

function formatTutorResponse(word: string, level: CefrLevel, content: TutorContent, cached: boolean): string {
  const scenes = content.sceneExamples
    .map((s: SceneExample) => `  · [${s.scene}] ${s.en} → ${s.zh}`)
    .join('\n');
  return [
    `📚 ${word}（CEFR ${level}）${cached ? '（缓存命中）' : ''}`,
    ``,
    `🧠 记忆口诀：${content.mnemonic}`,
    `🔠 词根拆解：${content.wordRoot}`,
    `💬 场景例句：\n${scenes}`,
    `⚠️ 易混淆词：${content.confusable}`,
  ].join('\n');
}
