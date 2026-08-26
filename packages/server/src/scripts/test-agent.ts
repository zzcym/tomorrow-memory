/**
 * Agent 编排集成测试：验证 5 种意图的图路由（无 LLM Key → 启发式 + 规则降级模式）
 *
 * 用法：DB_DRIVER=sqlite pnpm --filter @tm/server exec tsx src/scripts/test-agent.ts
 */

import { createAppDB } from '../db/index.js';
import { createDictSources } from '../services/dict-sources.js';
import { createYoudaoClient } from '../services/youdao.js';
import { createDictionaryApiClient } from '../services/dictionaryapi.js';
import { DefaultLookupService } from '../services/lookup.js';
import { loadConfig } from '../config.js';
import type { AgentDeps } from '@tm/agent';
import { LlmRouter, runAgent } from '@tm/agent';

const config = loadConfig();

async function main(): Promise<void> {
  const db = createAppDB();
  await db.init();

  const dictSources = createDictSources(config);
  const lookup = new DefaultLookupService(dictSources, createYoudaoClient(config), createDictionaryApiClient());
  const router = new LlmRouter({
    deepseekApiKey: config.deepseekApiKey,
    deepseekBaseUrl: config.deepseekBaseUrl,
  });

  const deps: AgentDeps = {
    tutorCache: db.tutorCache,
    fsrsCards: db.fsrs,
    wordbook: db.wordbooks,
    lookup,
  };

  console.log(`LLM 模式: ${router.hasLlm ? '真实 LLM' : '降级（启发式/规则）'}`);

  // 找一个有单词的用户
  const wordbooks = await db.wordbooks.getAllWordbooks();
  const wb = wordbooks.find((w) => w.data.length > 0) ?? wordbooks[0];
  const userId = wb ? wb.userId : undefined;
  const firstWord = wb && wb.data.length > 0 ? String(wb.data[0]?.word ?? 'serendipity') : 'serendipity';
  console.log(`测试用户: ${userId ?? '无'}，首词: ${firstWord}\n`);

  const cases: Array<{ name: string; input: string; rating?: 1 | 2 | 3 | 4 }> = [
    { name: 'lookup（查词）', input: `查一下 ${firstWord} 的意思` },
    { name: 'learn（教学）', input: `讲解一下 ${firstWord}` },
    { name: 'review（复习）', input: '今天复习什么' },
    { name: 'assess（测评）', input: `测评 ${firstWord} 3 分`, rating: 3 },
    { name: 'report（分析）', input: '我的学习报告' },
  ];

  let pass = 0;
  for (const tc of cases) {
    try {
      const state = await runAgent(deps, router, {
        userId,
        input: tc.input,
        rating: tc.rating,
      });
      const ok = state.intent !== undefined && !!state.response;
      if (ok) pass++;
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${tc.name} → intent=${state.intent}`);
      console.log(`  ${String(state.response ?? state.error ?? '').split('\n')[0]}`);
    } catch (err) {
      console.log(`[FAIL] ${tc.name} → ${(err as Error).message}`);
    }
  }

  console.log(`\n===== ${pass}/${cases.length} 通过 =====`);
  console.log('LLM 统计:', JSON.stringify(router.stats()));
  await db.close();
  process.exit(pass === cases.length ? 0 : 1);
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
