/**
 * M1 `001-credentials-columns` —— R-40 ③④ 的两条凭据列（**本期唯一破坏性变更的落库面**）
 *
 * sqlite：
 *   ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0
 *   ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0
 * pg：同上，但 `password_changed_at` 是 BIGINT（现状 created_at 即 BIGINT，毫秒数存不进 int4）。
 *
 * 判据②硬约束：**本迁移只有 ADD COLUMN，没有任何 UPDATE**。
 * `pw_policy_version DEFAULT 0` 字面就是"策略生效前签发的哈希、需强制改密"，
 * 所以**存量行天然落到待升级态，零回填**（PRD §6.4-2 步 6b①）。
 * `password_changed_at DEFAULT 0` ⇒ 上线时刻零掉线（`iat < 0` 永不成立，R-40 ⑤ 方案 A）。
 *
 * 列清单不写在这里 —— 全部来自 `packages/shared/src/schema/tables.ts`（DDL 单一源）。
 */

import { columnDdl, CREDENTIAL_COLUMNS } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

export const migration: Migration = {
  name: '001-credentials-columns',
  title: `users 追加凭据策略列 ${CREDENTIAL_COLUMNS.join(' / ')}（只加不回填）`,
  statements: (driver) => {
    const users = schemaTable('users');
    return CREDENTIAL_COLUMNS.map((column) => columnDdl(driver, users, column));
  },
  noDownReason:
    'R-40 / PRD §6.1-1「只加不删」：这两列不允许删，因此没有可逆形态。' +
    '旧镜像不 SELECT 它们即可正常工作 → 回滚只需回镜像，不回滚库（PRD §6.4-2 步 7）。',
};

export default migration;
