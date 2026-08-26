/**
 * Lexicon Agent 节点：查词 pipeline
 *
 * 编排流程（完整 pipeline 见 server 的 lookup 服务）：
 *   embedding → Qdrant hybrid search → Stardict 精确查询（fallback）→ 结果合并 → LLM 补充
 * 本节点负责：调用注入的查词服务 + LLM 补充（词源解析 / 记忆提示 / 同义词辨析）
 */

import type { LookupEn2ZhFallback, LookupEn2ZhSuccess, LookupResponse } from '../types.js';
import type { AgentDeps } from '../deps.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import type { LlmRouter } from '../tools/llm-router.js';

export function makeLexiconNode(deps: AgentDeps, router: LlmRouter) {
  return async function lexiconNode(state: AgentState): Promise<AgentStateUpdate> {
    const word = (state.word ?? '').trim();
    if (!word) {
      return { error: '缺少要查询的词', response: '请告诉我要查哪个单词，例如"查一下 ephemeral 的意思"' };
    }
    if (!deps.lookup) {
      return { error: '查词服务未注入', response: '查词服务不可用（未注入 LookupPort）' };
    }

    const result = await deps.lookup.lookup(word, 'auto');
    if (result === null) {
      return { response: `无法解析查询：${word}` };
    }

    // LLM 补充（可选）：词源 / 记忆提示 / 同义词辨析
    let supplement: string | undefined;
    if (router.hasLlm && 'word' in result && !('results' in result)) {
      try {
        const hit = result as LookupEn2ZhSuccess | LookupEn2ZhFallback;
        const call = await router.invoke(
          [
            {
              role: 'system',
              content:
                '你是词源学专家。为英文单词补充三部分内容，每部分一行：' +
                '1) 词源解析（词根词缀来源与演变）；2) 记忆提示（联想/口诀）；3) 同义词辨析（1-2 个近义词对比）。' +
                '使用简体中文，输出纯文本。',
            },
            { role: 'user', content: `单词: ${word}\n释义: ${JSON.stringify(hit.groups ?? hit.translation ?? '').slice(0, 300)}` },
          ],
          'fast',
          `lexicon_supplement_${word}`,
        );
        supplement = call.text.trim();
      } catch (err) {
        console.warn('[LEXICON] LLM 补充失败（不影响主结果）:', (err as Error).message);
      }
    }

    return {
      lookupResult: result,
      llmSupplement: supplement,
      response: formatLookupResponse(result, supplement),
    };
  };
}

function formatLookupResponse(result: LookupResponse, supplement?: string): string {
  if ('sourceLang' in result && result.sourceLang === 'zh') {
    const entries = result.results.map((r) => `  · ${r.word} [${r.pos}] ${r.definition}`).join('\n');
    const err = result.error ? `（${result.error}）` : '';
    return `🔍 ${result.query} 的中文释义${err}：\n${entries || '  （未找到结果）'}`;
  }
  if ('sourceLang' in result && result.sourceLang === 'mixed') {
    return `🔍 ${result.query}：${result.error}`;
  }
  const hit = result as LookupEn2ZhSuccess | LookupEn2ZhFallback;
  if ('notFound' in hit && hit.notFound) {
    return `🔍 未找到 "${hit.word}" 的释义，试试其它拼写。`;
  }
  const groups = hit.groups.map((g) => `  · ${g.pos} ${g.meanings.join('；')}`).join('\n');
  const examples = hit.examples.slice(0, 3).map((e) => `  · ${e.en} → ${e.zh}`).join('\n');
  const lines = [`🔍 ${hit.word}  ${hit.phonetic ? `/ ${hit.phonetic} /` : ''}`, groups];
  if (examples) lines.push(`💬 例句：\n${examples}`);
  if (supplement) lines.push(`✨ AI 补充：\n${supplement}`);
  return lines.join('\n');
}
