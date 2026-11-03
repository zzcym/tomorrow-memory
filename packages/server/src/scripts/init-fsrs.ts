/**
 * FSRS 卡片初始化：为现有单词本中每个单词创建 FSRS 复习卡片（幂等）。
 *
 * 默认参数（任务约定）：stability=1, difficulty=5, state=New(0)
 * fsrs_data 的 JSON 结构与 ts-fsrs v4 的 Card 序列化格式兼容（packages/agent 使用）。
 *
 * 用法（A-18-1：这是**写库**脚本，必须显式指定目标，默认拒绝仓库根真 `data.db`）：
 *   pnpm --filter @tm/server init-fsrs                      → 未设 SQLITE_PATH 时拒绝执行并 exit 非 0
 *   SQLITE_PATH=./tmp/drill.db pnpm --filter @tm/server init-fsrs   → 对临时副本执行（演练推荐口径）
 *   pnpm --filter @tm/server init-fsrs -- --force-db        → 明知是对真库文件仍要执行时才加
 */

import { createAppDB } from '../db/index.js';
import { assertExplicitWriteTarget, hasForceDbArg, runWhenDirect } from './entry-guard.js';

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

/** 入口：先过 A-18-1 的写库目标闸门，再执行幂等初始化。 */
export async function main(): Promise<void> {
  console.log('=== FSRS 卡片初始化 ===');
  const target = await assertExplicitWriteTarget('init-fsrs', hasForceDbArg());
  console.log(`[DB] 写入目标=${target}`);
  const result = await initFsrsCards();
  console.log(`=== 完成：新建 ${result.initialized}，跳过 ${result.skipped} ===`);
}

/**
 * A-18-1：只有作为入口被直接执行时才跑。
 * 原先这里是**无条件** `main().catch(...)` —— 任何 import（含测试装配过程）都会往
 * 默认库（仓库根真 `data.db`）写卡片，属真实数据隐患。
 */
runWhenDirect(main, 'FSRS 卡片初始化', import.meta.url);
