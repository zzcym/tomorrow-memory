declare function run(sql: string, params: Array<string | number>): void;

export function adminDumpPassword(id: string, hashStr: string): void {
  run('UPDATE users SET password = ? WHERE id = ?', [hashStr, id]);
}

