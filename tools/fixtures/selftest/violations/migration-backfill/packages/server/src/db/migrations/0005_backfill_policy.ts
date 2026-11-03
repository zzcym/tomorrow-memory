export const up = 'UPDATE users SET pw_policy_version = 1 WHERE password IS NULL;',
export function down() { return 'SELECT 1;'; }

