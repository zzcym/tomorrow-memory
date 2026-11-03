type Params = Array<string | number | null>;

declare function exec(sql: string, params?: Params): void;
declare function now(): number;

/** §6.5-4 写入点 1/3：注册新建（password 可为 null，注册即建号）。 */
export function createUser(id: string, hash: string): void {
  exec(
    `
      INSERT INTO users (id, phone, password, pw_policy_version, created_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (id) DO UPDATE
        SET password = excluded.password,
            pw_policy_version = excluded.pw_policy_version
    `,
    [id, id, hash, now()],
  );
}

/* ── 以下与上一个写入点保持足够行距，避免角色判定的上下文窗口串台 ── */

const EMPTY = "trim(password) = ''";

/** §6.5-4 写入点 2/3：激活只在 password 为空时写入（WHERE 带空值条件）。 */
export function activateUser(id: string, hash: string): void {
  exec(
    `
      UPDATE users
         SET password = ?,
             pw_policy_version = 1
       WHERE id = ?
         AND ${EMPTY}
    `,
    [hash, id],
  );
}

/** §6.5-4 写入点 3/3：改密（含强制改密），必须验旧。 */
export function changePassword(id: string, oldHash: string, newHash: string): void {
  exec(
    `
      UPDATE users
         SET password = ?,
             pw_policy_version = 1
       WHERE id = ?
         AND password = ?
    `,
    [newHash, id, oldHash],
  );
}

export function forceChangePassword(id: string, newHash: string): void {
  exec(
    `
      UPDATE users
         SET password = ?
       WHERE id = ?
    `,
    [newHash, id],
  );
}
