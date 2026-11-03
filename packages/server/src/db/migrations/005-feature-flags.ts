/**
 * M5 `005-feature-flags` —— 运行时开关表 + 种子行（§4.4.4 / PRD §6.4-7）
 *
 * `feature_flags(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`
 * 种子值**只取自 `packages/shared/src/constants/flags.ts` 的 `FEATURE_FLAG_DEFAULTS`**
 * （那是 PRD §6.4-7 初值的唯一真相，`tools/boundaries.mjs --flags` 直接 grep 它），
 * 本文件不再抄第二份字面量。
 *
 * 注：§6.1 M5 行写的是"种子 6 行"，而 §10.2 T-03 判据⑤ + PRD §6.4-7 的开关实际是 8 个键
 * （`explicitFavorite` / `avatarUnifiedLimit` 等）—— 按单一源种 8 行，差异见报告「契约偏差」。
 *
 * `ON CONFLICT … DO NOTHING` 保证：① 迁移可重复执行；② **运维已改过的值不会被重新 migrate 冲回默认值**
 * （种子只补空，不覆盖）。这是"开关初值"与"止血阀现值"不互相打穿的关键。
 */

import { FEATURE_FLAG_DEFAULTS, type FeatureFlagKey } from '@tm/shared';
import { createIndexesDdl, createTableDdl } from '@tm/shared/schema';
import { schemaTable, stringLiteral, type Migration, type MigrationContext, type MigrationDriver } from './index.js';

const seedRows = (at: number): string[] =>
  (Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[]).map(
    (key) =>
      `INSERT INTO feature_flags (key, value, updated_at) VALUES (${stringLiteral(key)}, ${stringLiteral(
        FEATURE_FLAG_DEFAULTS[key],
      )}, ${at}) ON CONFLICT (key) DO NOTHING`,
  );

export const migration: Migration = {
  name: '005-feature-flags',
  title: `新建 feature_flags 并种入 PRD §6.4-7 初值（${Object.keys(FEATURE_FLAG_DEFAULTS).length} 个开关）`,
  newTables: ['feature_flags'],
  statements: (driver: MigrationDriver, ctx?: MigrationContext) => {
    const table = schemaTable('feature_flags');
    // 静态自检不带 ctx（只看语句形态）；真执行必然带 ctx，`updated_at` 由脚本传 Date.now()。
    return [
      createTableDdl(driver, table),
      ...createIndexesDdl(driver, table),
      ...seedRows(ctx ? ctx.now() : 0),
    ];
  },
  down: async (ctx) => {
    await ctx.exec('DROP TABLE IF EXISTS feature_flags');
  },
};

export default migration;
