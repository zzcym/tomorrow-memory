import type { Migration } from '../types';

/** §6.5-3：新增可空列 + 索引，禁止改写既有列类型（无回填、无 DROP/RENAME）。 */
export const up = `
  ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_users_pw_policy_version ON users (pw_policy_version);
`;

export function migration0002(): Migration {
  return {
    id: '0002_password_policy',
    up,
    noDownReason: '新增带默认值的列与索引，回滚会让既有会话读到缺列，故只前进不回滚（§6.1 ②）',
  };
}
