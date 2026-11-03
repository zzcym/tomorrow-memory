export const up = 'ALTER TABLE users DROP COLUMN grace_until;',
export function down() { return 'SELECT 1;'; }

