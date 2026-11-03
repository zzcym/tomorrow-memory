/**
 * M4 `004-wordbook-sync-columns` —— R-03 ①③ 的增量协议落库面
 *
 * sqlite：
 *   ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0
 *   ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'
 *
 * 红线：`wordbooks.data` 的形状一字未动（仍是 `WordbookEntry[]` 整数组，R-03 ⑦）。
 * `DEFAULT 0` 使存量行的 `sync_version=0` 天然表示"从未参与增量"，
 * service 读到 0 按"全量首同步"处理 → **无需回填、无需 UPDATE**。
 * `tombstones` 默认 `'[]'`（JSON 词名→删除时间戳），开关 off 时不参与读（§4.4.3）。
 */

import { columnDdl, WORDBOOK_SYNC_COLUMNS } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

export const migration: Migration = {
  name: '004-wordbook-sync-columns',
  title: `wordbooks 追加增量协议列 ${WORDBOOK_SYNC_COLUMNS.join(' / ')}（data 列一字未动）`,
  statements: (driver) => {
    const wordbooks = schemaTable('wordbooks');
    return WORDBOOK_SYNC_COLUMNS.map((column) => columnDdl(driver, wordbooks, column));
  },
  noDownReason:
    'R-03⑦ / PRD §6.1-1「只加不删」：删这两列会连带丢掉已放量的增量真相（sync_version 与墓碑），' +
    '而旧镜像不读它们即可回到整数组语义（data 一字未动）→ 回滚 = 回镜像 + wordbookIncremental 置 0%。',
};

export default migration;
