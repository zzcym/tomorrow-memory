export const up = 'CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at);',

export function migration0006() {
  return { id: "0006_index_only", up };
}

