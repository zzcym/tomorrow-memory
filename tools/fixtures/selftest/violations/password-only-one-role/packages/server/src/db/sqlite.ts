declare function run(sql: string, params: Array<string | number>): void;

export function createUser(id: string, hashStr: string): void {
  run('INSERT INTO users (id, password) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET password = excluded.password', [id, hashStr]);
}

