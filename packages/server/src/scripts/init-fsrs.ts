/**
 * FSRS 卡片初始化：为现有单词本中每个单词创建 FSRS 复习卡片（幂等）。
 *
 * 默认参数（任务约定）：stability=1, difficulty=5, state=New(0)
 * fsrs_data 的 JSON 结构与 ts-fsrs v4 的 Card 序列化格式兼容（packages/agent 使用）。
 *
 * 用法：pnpm --filter @tm/server init-fsrs
 */

import { loadConfig } from '../config.js';
import { createAppDB } from '../db/index.js';

/** ts-fsrs v4 Card 序列化结构（默认新卡，S=1, D=5） */
export interface FsrsCardData {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export function createDefaultFsrsCard(now: number): FsrsCardData {
  return {
    due: new Date(now).toISOString(),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  };
}

export async function initFsrsCards(): Promise<{ initialized: number; skipped: number }> {
  const db = createAppDB();
  await db.init();

  const wordbooks = await db.wordbooks.getAllWordbooks();
  let initialized = 0;
  let skipped = 0;

  for (const wb of wordbooks) {
    const seen = new Set<string>();
    for (const entry of wb.data) {
      const word = typeof entry.word === 'string' ? entry.word.trim() : '';
      if (!word || seen.has(word.toLowerCase())) continue;
      seen.add(word.toLowerCase());

      const existing = await db.fsrs.getCard(wb.userId, word);
      if (existing) {
        skipped++;
        continue;
      }

      const now = Date.now();
      await db.fsrs.upsertCard(
        wb.userId,
        word,
        JSON.stringify(createDefaultFsrsCard(now)),
        null,
        now,
      );
      initialized++;
    }
  }

  console.log(`[FSRS] 初始化完成：新建 ${initialized} 张卡片，跳过 ${skipped} 张（已存在）`);
  await db.close();
  return { initialized, skipped };
}

async function main(): Promise<void> {
  console.log('=== FSRS 卡片初始化 ===');
  const config = loadConfig();
  console.log(`[DB] driver=${config.dbDriver}`);
  const result = await initFsrsCards();
  console.log('=== 完成 ===');
  void result;
}

main().catch((err) => {
  console.error('初始化失败:', err);
  process.exit(1);
});
