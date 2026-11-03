/**
 * M3 `003-account-audit-log` —— R-39 ⑤b / R-40 ④ 的账号审计落点（S17）
 *
 * `account_audit_log(id, user_id, phone_masked, action, result, ip, ua, created_at)`
 *   + `INDEX(user_id, action, created_at)`
 * 判据：激活一次 → 记录 +1 且字段齐全；激活失败 → 记录 +1 且 result 为失败；
 * **只写 console.log 或进程内不落盘的实现判为不通过**（PRD §6.4-4）。
 * `phone_masked` 只留后 4 位，**不得含明文密码或其 hash**（db 层 `audit.append()` 有硬校验）。
 */

import { createIndexesDdl, createTableDdl } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

export const migration: Migration = {
  name: '003-account-audit-log',
  title: '新建 account_audit_log（R-39⑤b 激活动作可事后按 user_id 检索）',
  newTables: ['account_audit_log'],
  statements: (driver) => [
    createTableDdl(driver, schemaTable('account_audit_log')),
    ...createIndexesDdl(driver, schemaTable('account_audit_log')),
  ],
  down: async (ctx) => {
    await ctx.exec('DROP TABLE IF EXISTS account_audit_log');
  },
};

export default migration;
