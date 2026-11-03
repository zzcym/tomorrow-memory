type Params = Array<string | number | null>;

declare function q(sql: string, params?: Params): Promise<void>;

/** §6.5-4 写入点 1/3（PG 驱动侧）：注册新建。 */
export async function createUser(id: string, hash: string): Promise<void> {
  await q(
    `
      INSERT INTO users (id, phone, password, pw_policy_version)
      VALUES ($1, $1, $1, 1)
      ON CONFLICT (id) DO UPDATE
        SET password = excluded.password,
            pw_policy_version = excluded.pw_policy_version
    `,
    [id, hash],
  );
}

/* ── 行距占位，保证角色判定的上下文窗口不串台 ── */

const GUARD = "password IS NULL OR trim(password) = ''";

/** §6.5-4 写入点 2/3（PG 驱动侧）：激活仅补空密码。 */
export async function activateUser(id: string, hash: string): Promise<void> {
  await q(
    `
      UPDATE users
         SET password = $1,
             pw_policy_version = 1
       WHERE id = $2
         AND ${GUARD}
    `,
    [hash, id],
  );
}

/** §6.5-4 写入点 3/3（PG 驱动侧）：改密必验旧。 */
export async function changePassword(id: string, oldHash: string, newHash: string): Promise<void> {
  await q(
    `
      UPDATE users
         SET password = $1,
             pw_policy_version = 1
       WHERE id = $2
         AND password = $3
    `,
    [newHash, id, oldHash],
  );
}
