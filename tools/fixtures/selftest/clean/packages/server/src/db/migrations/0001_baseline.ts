import type { Migration } from '../types';

/** 基线：只建表，不碰既有列（§6.1 ①）。 */
export const up = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    password TEXT,
    pw_policy_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
`;

export function migration0001(): Migration {
  return {
    id: '0001_baseline',
    up,
    down() {
      return 'SELECT 1;';
    },
  };
}
