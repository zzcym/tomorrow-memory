/**
 * M2 `002-review-snapshots` —— R-11 撤销快照表（S13：用新表实现撤销，**不动 fsrs_cards 的任何列与序列化格式**）
 *
 * `review_snapshots(id, user_id, word, prev_data, prev_due, reps_before, created_at)`
 *   + `INDEX(user_id, word, created_at)`
 * `prev_data` 为 NULL 表示"复习前该词没有卡" ⇒ 撤销 = 删卡（而不是回写一份编造的初始态）。
 * 表结构来自 DDL 单一源，本文件只声明"用哪张表 + 怎么回滚"。
 */

import { createIndexesDdl, createTableDdl } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

export const migration: Migration = {
  name: '002-review-snapshots',
  title: '新建 review_snapshots（R-11 撤销前置快照）',
  newTables: ['review_snapshots'],
  statements: (driver) => [
    createTableDdl(driver, schemaTable('review_snapshots')),
    ...createIndexesDdl(driver, schemaTable('review_snapshots')),
  ],
  down: async (ctx) => {
    await ctx.exec('DROP TABLE IF EXISTS review_snapshots');
  },
};

export default migration;
