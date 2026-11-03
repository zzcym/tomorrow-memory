/**
 * M0 `000-migrations-table` —— 迁移清单表（§6.1 迁移框架第 ① 条）
 *
 * `_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`：
 * 只记"哪个迁移在什么时刻执行过"，不含任何业务数据。
 * `applied_at` 由脚本传 `Date.now()`（毫秒），不用库内时间函数（§6.2 漂移 3）。
 */

import { tableDdlFor } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

export const migration: Migration = {
  name: '000-migrations-table',
  title: '迁移清单表 _migrations(name, applied_at)',
  newTables: ['_migrations'],
  statements: (driver) => tableDdlFor(driver, schemaTable('_migrations')),
  noDownReason:
    '账本表自身不可回滚：删掉它会让下一次 migrate 把全部迁移当未执行重跑，' +
    '且违反 PRD §6.1-1「只加不删」。旧镜像不读这张表 → 回滚镜像无需动库。',
};

export default migration;
