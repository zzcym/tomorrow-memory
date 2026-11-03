/**
 * PostgreSQL 实现（DB_DRIVER=pg）
 * 用户数据存 PG；词典类只读 SQLite 数据不在此层。
 */

import type pg from 'pg';
import type {
  AdminUserRow,
  AnalystCacheRow,
  AssessmentCacheRow,
  CefrLevel,
  ChatMessageRow,
  FsrsCardRow,
  ProfileRow,
  TutorCacheRow,
  UserRow,
  WordbookEntry,
} from '@tm/shared';
import { safeJsonParse } from '@tm/shared';
import {
  assertNoCredentialLeak,
  assertPasswordHash,
  assertPhone,
  assertCredentialColumnsForBoot,
  CREDENTIAL_COLUMNS,
  planWordbookMutate,
  wordbookCurrentOf,
  EMPTY_PASSWORD_SQL,
} from './types.js';
import type {
  AccountAuditDB,
  AccountAuditInput,
  AccountAuditRow,
  AnalystCacheDB,
  AppDB,
  ApplySyncResult,
  AssessmentDB,
  ChatDB,
  CheckinDB,
  FeatureFlagDB,
  FeatureFlagRow,
  FsrsDB,
  ProfileDB,
  ReviewSnapshotDB,
  ReviewSnapshotRow,
  TutorCacheDB,
  UserCredentialRow,
  UserDB,
  WordbookCurrent,
  WordbookDB,
  WordbookMutateResult,
  WordbookPatch,
  WordbookSyncStateRow,
} from './types.js';

/** T-06：凭据视图列集合（BIGINT 在 pg 驱动里以字符串返回，统一用 normalizeUserCredential 收口成 number） */
const CREDENTIAL_SELECT =
  'SELECT id, phone, password, created_at, password_changed_at, pw_policy_version FROM users';

const normalizeUserCredential = (row: Record<string, unknown>): UserCredentialRow => ({
  id: Number(row.id),
  phone: String(row.phone ?? ''),
  password: row.password === null || row.password === undefined ? null : String(row.password),
  created_at: Number(row.created_at),
  password_changed_at: Number(row.password_changed_at ?? 0),
  pw_policy_version: Number(row.pw_policy_version ?? 0),
});

const normalizeReviewSnapshot = (row: Record<string, unknown>): ReviewSnapshotRow => ({
  id: Number(row.id),
  user_id: Number(row.user_id),
  word: String(row.word),
  prev_data: String(row.prev_data),
  prev_due: row.prev_due === null || row.prev_due === undefined ? null : Number(row.prev_due),
  reps_before: Number(row.reps_before ?? 0),
  created_at: Number(row.created_at),
});

const normalizeAccountAudit = (row: Record<string, unknown>): AccountAuditRow => ({
  id: Number(row.id),
  user_id: Number(row.user_id),
  phone_masked: row.phone_masked === null || row.phone_masked === undefined ? null : String(row.phone_masked),
  action: String(row.action),
  result: String(row.result),
  ip: row.ip === null || row.ip === undefined ? null : String(row.ip),
  ua: row.ua === null || row.ua === undefined ? null : String(row.ua),
  created_at: Number(row.created_at),
});

/** 建表 DDL（幂等） */
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(11) UNIQUE NOT NULL,
    password TEXT DEFAULT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS wordbooks (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '[]',
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    daily_goal INTEGER DEFAULT 10,
    updated_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS checkin_logs (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS fsrs_cards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    fsrs_data TEXT NOT NULL,
    last_review BIGINT DEFAULT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE (user_id, word),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tutor_cache (
    id SERIAL PRIMARY KEY,
    word TEXT NOT NULL,
    level TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE (word, level)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  // user_id 必须与迁移 007 的 `ADD COLUMN user_id INTEGER DEFAULT NULL` 同形（§10.2 T-25 判据⑥）：
  // 类型词取 INTEGER 而非本表 created_at 的 BIGINT —— schema 源该列无 pgType，007 生成的也是 INTEGER。
  `CREATE TABLE IF NOT EXISTS assessment_cache (
    id SERIAL PRIMARY KEY,
    word TEXT NOT NULL,
    qtype TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    user_id INTEGER DEFAULT NULL,
    UNIQUE (word, qtype)
  )`,
  `CREATE TABLE IF NOT EXISTS analyst_cache (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE (user_id, period)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fsrs_cards_user ON fsrs_cards (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tutor_cache_word ON tutor_cache (word)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id, created_at)`,
];

export class PostgresUserDB implements UserDB {
  constructor(private readonly pool: pg.Pool) {}

  async findByPhone(phone: string): Promise<UserRow | null> {
    const r = await this.pool.query('SELECT id, phone, password, created_at FROM users WHERE phone = $1', [phone]);
    return r.rows[0] ?? null;
  }

  async findById(id: number): Promise<UserRow | null> {
    const r = await this.pool.query('SELECT id, phone, password, created_at FROM users WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  }

  async updatePassword(userId: number, hash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]);
  }

  async countAll(): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int AS count FROM users');
    return Number(r.rows[0]?.count ?? 0);
  }

  async countCreatedSince(ts: number): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int AS count FROM users WHERE created_at >= $1', [ts]);
    return Number(r.rows[0]?.count ?? 0);
  }

  async listAdminUsers(page: number, pageSize: number): Promise<AdminUserRow[]> {
    const offset = (page - 1) * pageSize;
    const r = await this.pool.query(
      `SELECT u.id, u.phone, u.created_at,
              COALESCE(w.word_count, 0)::int AS word_count,
              w.updated_at AS last_active,
              p.nickname, p.avatar
       FROM users u
       LEFT JOIN (SELECT user_id, json_array_length(data::json) AS word_count, updated_at FROM wordbooks) w
         ON w.user_id = u.id
       LEFT JOIN profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    return r.rows as AdminUserRow[];
  }

  /* ══════════ T-06 新增（R-40③④ / R-39③④⑤b）——以上既有方法体一字未改 ══════════ */

  async findCredentialsByPhone(phone: string): Promise<UserCredentialRow | null> {
    assertPhone(phone);
    const r = await this.pool.query(`${CREDENTIAL_SELECT} WHERE phone = $1`, [phone]);
    const row = r.rows[0];
    return row ? normalizeUserCredential(row) : null;
  }

  async findCredentialsById(id: number): Promise<UserCredentialRow | null> {
    const r = await this.pool.query(`${CREDENTIAL_SELECT} WHERE id = $1`, [id]);
    const row = r.rows[0];
    return row ? normalizeUserCredential(row) : null;
  }

  async setPassword(uid: number, hash: string, policy: number, now: number): Promise<void> {
    assertPasswordHash(hash);
    await this.pool.query(
      'UPDATE users SET password = $1, password_changed_at = $2, pw_policy_version = $3 WHERE id = $4',
      [hash, now, policy, uid],
    );
  }

  async activateIfEmpty(uid: number, hash: string, policy: number, now: number): Promise<boolean> {
    assertPasswordHash(hash);
    // 判空口径与 EMPTY_PASSWORD_SQL 同一真相：password IS NULL OR trim(password) = ''
    // 单条件写 + rowCount===1 者胜 = R-39⑤b 的认领语义（pg 的 UPDATE 自带行锁，无读后写竞态）
    const r = await this.pool.query(
      `UPDATE users SET password = $1, password_changed_at = $2, pw_policy_version = $3
       WHERE id = $4 AND ${EMPTY_PASSWORD_SQL}`,
      [hash, now, policy, uid],
    );
    return Number(r.rowCount ?? 0) === 1;
  }

  async touchPasswordChanged(userId: number, now: number): Promise<void> {
    await this.pool.query('UPDATE users SET password_changed_at = $1 WHERE id = $2', [now, userId]);
  }

  /** 手机号 + 密码注册（R-39③）：与 `createUser` 同形状的事务，只是 users 一行多带三列。 */
  async createWithPassword(
    phone: string,
    passwordHash: string,
    policyVersion: number,
    now: number,
  ): Promise<number> {
    assertPhone(phone);
    assertPasswordHash(passwordHash);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: number }>(
        `INSERT INTO users (phone, password, created_at, password_changed_at, pw_policy_version)
         VALUES ($1, $2, $3, $3, $4) RETURNING id`,
        [phone, passwordHash, now, policyVersion],
      );
      const userId = user.rows[0]!.id;
      await client.query('INSERT INTO wordbooks (user_id, data, updated_at) VALUES ($1, $2, $3)', [
        userId,
        '[]',
        now,
      ]);
      await client.query('INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES ($1, $2, $3, $4)', [
        userId,
        '',
        '',
        now,
      ]);
      await client.query('COMMIT');
      return userId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export class PostgresWordbookDB implements WordbookDB {
  constructor(private readonly pool: pg.Pool) {}

  async getData(userId: number): Promise<WordbookEntry[]> {
    const r = await this.pool.query('SELECT data FROM wordbooks WHERE user_id = $1', [userId]);
    const row = r.rows[0];
    return row ? safeJsonParse<WordbookEntry[]>(row.data, []) : [];
  }

  async saveData(userId: number, data: WordbookEntry[], now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO wordbooks (user_id, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [userId, JSON.stringify(data), now],
    );
    // 新词自动建 FSRS 卡(New 状态):与 sqlite 实现保持一致
    for (const entry of data) {
      const card = {
        due: new Date(now).toISOString(),
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: null,
      };
      await this.pool.query(
        `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $4)
         ON CONFLICT (user_id, word) DO NOTHING`,
        [userId, entry.word, JSON.stringify(card), now],
      );
    }
  }

  async countAll(): Promise<number> {
    const r = await this.pool.query('SELECT COUNT(*)::int AS count FROM wordbooks');
    return Number(r.rows[0]?.count ?? 0);
  }

  async getAllWordbooks(): Promise<Array<{ userId: number; data: WordbookEntry[] }>> {
    const r = await this.pool.query('SELECT user_id, data FROM wordbooks');
    return r.rows.map((row) => ({
      userId: Number(row.user_id),
      data: safeJsonParse<WordbookEntry[]>(row.data, []),
    }));
  }

  /* ══════════ T-06 新增（§4.4.3 单一落库路径 / R-03①④）——以上既有方法体一字未改 ══════════ */

  async getSyncState(userId: number): Promise<WordbookSyncStateRow | null> {
    const r = await this.pool.query(
      'SELECT user_id, sync_version, updated_at, tombstones FROM wordbooks WHERE user_id = $1',
      [userId],
    );
    const row = r.rows[0];
    return row
      ? {
          user_id: Number(row.user_id),
          sync_version: Number(row.sync_version ?? 0),
          updated_at: Number(row.updated_at),
          tombstones: row.tombstones === null || row.tombstones === undefined ? '[]' : String(row.tombstones),
        }
      : null;
  }

  async applyEntries(userId: number, data: WordbookEntry[], now: number): Promise<number> {
    const r = await this.writeWordbook(userId, data, null, null, now);
    return r.version;
  }

  async applySync(
    userId: number,
    data: WordbookEntry[],
    tombstonesJson: string,
    baseVersion: number,
    now: number,
  ): Promise<ApplySyncResult> {
    return this.writeWordbook(userId, data, tombstonesJson, baseVersion, now);
  }

  /**
   * A-32-6：事务内 read-modify-write —— `SELECT … FOR UPDATE` 拿到**这一行**的锁之后，
   * 由回调投影新值、同一事务写回，因此 service 层不再需要 CAS 重试（T-09 报告 A-b 的根治点）。
   * 与 sqlite 侧共用 `wordbookCurrentOf()` + `planWordbookMutate()`：只有锁粒度（行锁 vs 整库写锁）
   * 与占位符方言不同，"写什么 / 是否真的变了 / 新版本号"三条规则是同一份代码。
   */
  async applyMutate<T>(
    userId: number,
    mutate: (current: WordbookCurrent) => WordbookPatch<T>,
    now: number,
  ): Promise<WordbookMutateResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        'SELECT data, sync_version, updated_at, tombstones FROM wordbooks WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const row: Record<string, unknown> | undefined = cur.rows[0];
      const current = wordbookCurrentOf(row);
      const plan = planWordbookMutate(current, mutate(current));
      if (!row) {
        // 与 sqlite 侧同形：先建最小行（不写 M4 两列），再按需 UPDATE 推进版本
        await client.query('INSERT INTO wordbooks (user_id, data, updated_at) VALUES ($1, $2, $3)', [
          userId,
          plan.dataJson,
          now,
        ]);
      }
      if (plan.changed) {
        await client.query(
          `UPDATE wordbooks
             SET data = $1, tombstones = $2, updated_at = $3, sync_version = sync_version + 1
           WHERE user_id = $4`,
          [plan.dataJson, plan.tombstones, now, userId],
        );
      }
      await this.insertNewCards(client, userId, plan.entries, now);
      await client.query('COMMIT');
      return { value: plan.value, version: plan.version, wrote: plan.changed };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * `applyEntries` / `applySync` 的共用事务体（RK-01：行锁 `FOR UPDATE`，等价 sqlite 的 BEGIN IMMEDIATE）。
   * `tombstones === null` = 整数组覆盖语义（不碰墓碑列）；`base === null` = 不做 CAS（旧 PUT 路径）。
   * 未命中 CAS / 行不存在时 `ok:false` 且 `version` 仍是服务端当前版本（409 载荷要带它）。
   */
  private async writeWordbook(
    userId: number,
    data: WordbookEntry[],
    tombstones: string | null,
    base: number | null,
    now: number,
  ): Promise<ApplySyncResult> {
    const json = JSON.stringify(data);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        'SELECT data, sync_version, tombstones FROM wordbooks WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const row = cur.rows[0];
      if (!row) {
        if (base !== null) {
          await client.query('ROLLBACK');
          return { ok: false, version: 0, reason: 'missing' };
        }
        await client.query(
          'INSERT INTO wordbooks (user_id, data, updated_at, sync_version) VALUES ($1, $2, $3, $4)',
          [userId, json, now, json === '[]' ? 0 : 1],
        );
        await this.insertNewCards(client, userId, data, now);
        await client.query('COMMIT');
        return { ok: true, version: json === '[]' ? 0 : 1 };
      }
      const version = Number(row.sync_version ?? 0);
      if (base !== null && version !== base) {
        await client.query('ROLLBACK');
        return { ok: false, version, reason: 'stale' };
      }
      const changed =
        String(row.data) !== json || (tombstones !== null && String(row.tombstones ?? '[]') !== tombstones);
      let next = version;
      if (changed) {
        next = version + 1;
        await client.query(
          tombstones === null
            ? 'UPDATE wordbooks SET data = $1, updated_at = $2, sync_version = $3 WHERE user_id = $4'
            : 'UPDATE wordbooks SET data = $1, tombstones = $5, updated_at = $2, sync_version = $3 WHERE user_id = $4',
          tombstones === null ? [json, now, next, userId] : [json, now, next, userId, tombstones],
        );
      }
      await this.insertNewCards(client, userId, data, now);
      await client.query('COMMIT');
      return { ok: true, version: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** 与既有 `saveData` 内联段逐字同形；不改 saveData 是为了让既有方法体一字未改（§10.2 T-06 行）。 */
  private async insertNewCards(client: pg.PoolClient, userId: number, data: WordbookEntry[], now: number) {
    for (const entry of data) {
      const card = {
        due: new Date(now).toISOString(),
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: null,
      };
      await client.query(
        `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $4)
         ON CONFLICT (user_id, word) DO NOTHING`,
        [userId, entry.word, JSON.stringify(card), now],
      );
    }
  }
}

export class PostgresProfileDB implements ProfileDB {
  constructor(private readonly pool: pg.Pool) {}

  async get(userId: number): Promise<ProfileRow | null> {
    const r = await this.pool.query(
      'SELECT user_id, nickname, avatar, daily_goal, updated_at FROM profiles WHERE user_id = $1',
      [userId],
    );
    return r.rows[0] ?? null;
  }

  async ensure(userId: number): Promise<ProfileRow> {
    const existing = await this.get(userId);
    if (existing) return existing;
    const now = Date.now();
    await this.pool.query(
      'INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING',
      [userId, '', '', 10, now],
    );
    const created = await this.get(userId);
    return (
      created ?? { user_id: userId, nickname: '', avatar: '', daily_goal: 10, updated_at: now }
    );
  }

  async update(
    userId: number,
    patch: { nickname?: string; avatar?: string; daily_goal?: number },
    now: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE profiles SET
         nickname = COALESCE($1, nickname),
         avatar = COALESCE($2, avatar),
         daily_goal = COALESCE($3, daily_goal),
         updated_at = $4
       WHERE user_id = $5`,
      [
        patch.nickname ?? null,
        patch.avatar ?? null,
        patch.daily_goal ?? null,
        now,
        userId,
      ],
    );
  }
}

export class PostgresCheckinDB implements CheckinDB {
  constructor(private readonly pool: pg.Pool) {}

  async isCheckedIn(userId: number, date: string): Promise<boolean> {
    const r = await this.pool.query(
      'SELECT 1 AS ok FROM checkin_logs WHERE user_id = $1 AND date = $2',
      [userId, date],
    );
    return r.rows.length > 0;
  }

  async checkin(userId: number, date: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO checkin_logs (user_id, date, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, date) DO NOTHING`,
      [userId, date, now],
    );
  }

  async getDates(userId: number): Promise<string[]> {
    const r = await this.pool.query(
      'SELECT date FROM checkin_logs WHERE user_id = $1 ORDER BY date ASC',
      [userId],
    );
    return r.rows.map((row) => row.date as string);
  }

  async getStreak(userId: number): Promise<number> {
    const r = await this.pool.query(
      'SELECT date FROM checkin_logs WHERE user_id = $1 ORDER BY date DESC',
      [userId],
    );
    return computeStreakFromRows(r.rows.map((row) => row.date as string));
  }
}

export class PostgresFsrsDB implements FsrsDB {
  constructor(private readonly pool: pg.Pool) {}

  async getCard(userId: number, word: string): Promise<FsrsCardRow | null> {
    const r = await this.pool.query(
      'SELECT id, user_id, word, fsrs_data, last_review, created_at, updated_at FROM fsrs_cards WHERE user_id = $1 AND word = $2',
      [userId, word],
    );
    return r.rows[0] ?? null;
  }

  async getCardsByUser(userId: number): Promise<FsrsCardRow[]> {
    const r = await this.pool.query(
      'SELECT id, user_id, word, fsrs_data, last_review, created_at, updated_at FROM fsrs_cards WHERE user_id = $1 ORDER BY id ASC',
      [userId],
    );
    return r.rows as FsrsCardRow[];
  }

  async upsertCard(
    userId: number,
    word: string,
    fsrsDataJson: string,
    lastReview: number | null,
    now: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (user_id, word) DO UPDATE SET
         fsrs_data = EXCLUDED.fsrs_data,
         last_review = EXCLUDED.last_review,
         updated_at = EXCLUDED.updated_at`,
      [userId, word, fsrsDataJson, lastReview, now],
    );
  }

  async deleteCard(userId: number, word: string): Promise<void> {
    await this.pool.query('DELETE FROM fsrs_cards WHERE user_id = $1 AND word = $2', [userId, word]);
  }
}

export class PostgresTutorCacheDB implements TutorCacheDB {
  constructor(private readonly pool: pg.Pool) {}

  async get(word: string, level: CefrLevel): Promise<TutorCacheRow | null> {
    const r = await this.pool.query(
      'SELECT id, word, level, content, created_at FROM tutor_cache WHERE word = $1 AND level = $2',
      [word, level],
    );
    return r.rows[0] ?? null;
  }

  async set(word: string, level: CefrLevel, contentJson: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO tutor_cache (word, level, content, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (word, level) DO UPDATE SET content = EXCLUDED.content, created_at = EXCLUDED.created_at`,
      [word, level, contentJson, now],
    );
  }
}

export class PostgresChatDB implements ChatDB {
  constructor(private readonly pool: pg.Pool) {}

  async addMessage(
    userId: number,
    threadId: string,
    role: string,
    content: string,
    now: number,
  ): Promise<void> {
    await this.pool.query(
      'INSERT INTO chat_messages (user_id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
      [userId, threadId, role, content, now],
    );
  }

  async getRecentMessages(userId: number, threadId: string, limit: number): Promise<ChatMessageRow[]> {
    const r = await this.pool.query(
      `SELECT id, user_id, thread_id, role, content, created_at FROM chat_messages
       WHERE user_id = $1 AND thread_id = $2
       ORDER BY id DESC LIMIT $3`,
      [userId, threadId, limit],
    );
    return (r.rows.reverse() as ChatMessageRow[]).map((row) => ({
      ...row,
      id: Number(row.id),
      user_id: Number(row.user_id),
      created_at: Number(row.created_at),
    }));
  }
}

export class PostgresAssessmentDB implements AssessmentDB {
  constructor(private readonly pool: pg.Pool) {}

  async get(word: string, qtype: string): Promise<AssessmentCacheRow | null> {
    const r = await this.pool.query(
      'SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = $1 AND qtype = $2',
      [word, qtype],
    );
    const row = r.rows[0];
    return row
      ? {
          id: Number(row.id),
          word: String(row.word),
          qtype: String(row.qtype),
          question: String(row.question),
          created_at: Number(row.created_at),
        }
      : null;
  }

  async set(word: string, qtype: string, questionJson: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO assessment_cache (word, qtype, question, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (word, qtype) DO UPDATE SET question = EXCLUDED.question, created_at = EXCLUDED.created_at`,
      [word, qtype, questionJson, now],
    );
  }

  /** M7 / R-41（T-25）：属主过滤读 —— `user_id IS NULL`（改造前的无主题面）与他人属主的行**都读不到**；
   *  属主判定与取题面在同一条语句里完成，不给"两次读之间被他人 setOwned 挤占"留窗口。 */
  async getOwned(word: string, qtype: string, userId: number): Promise<AssessmentCacheRow | null> {
    const r = await this.pool.query(
      'SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = $1 AND qtype = $2 AND user_id = $3',
      [word, qtype, userId],
    );
    const row = r.rows[0] as AssessmentCacheRow | undefined;
    if (!row) return null;
    // created_at 是 BIGINT：`createAppDB` 挂了全局 int8 parser，但直接用 pool 的调用方未必 → 显式收敛两列。
    return { ...row, id: Number(row.id), created_at: Number(row.created_at) };
  }

  /** M7 / R-41（T-25）：带属主的写入 —— `DO UPDATE` 把 `user_id` 改写成当前写入者（缓存挤占语义，代价登记 RK-14）。 */
  async setOwned(word: string, qtype: string, userId: number, questionJson: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO assessment_cache (word, qtype, question, created_at, user_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (word, qtype) DO UPDATE SET question = EXCLUDED.question, created_at = EXCLUDED.created_at, user_id = EXCLUDED.user_id`,
      [word, qtype, questionJson, now, userId],
    );
  }
}

export class PostgresAnalystCacheDB implements AnalystCacheDB {
  constructor(private readonly pool: pg.Pool) {}

  async get(userId: number, period: string): Promise<AnalystCacheRow | null> {
    const r = await this.pool.query(
      'SELECT id, user_id, period, content, created_at FROM analyst_cache WHERE user_id = $1 AND period = $2',
      [userId, period],
    );
    const row = r.rows[0];
    return row
      ? {
          id: Number(row.id),
          user_id: Number(row.user_id),
          period: String(row.period),
          content: String(row.content),
          created_at: Number(row.created_at),
        }
      : null;
  }

  async set(userId: number, period: string, contentJson: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO analyst_cache (user_id, period, content, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, period) DO UPDATE SET content = EXCLUDED.content, created_at = EXCLUDED.created_at`,
      [userId, period, contentJson, now],
    );
  }
}

/** M2（R-11）：复习撤销快照 */
export class PostgresReviewSnapshotDB implements ReviewSnapshotDB {
  constructor(private readonly pool: pg.Pool) {}

  async save(
    userId: number,
    word: string,
    prevData: string,
    prevDue: number | null,
    repsBefore: number,
    now: number,
  ): Promise<number> {
    const r = await this.pool.query<{ id: number }>(
      `INSERT INTO review_snapshots (user_id, word, prev_data, prev_due, reps_before, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, word, prevData, prevDue, repsBefore, now],
    );
    return Number(r.rows[0]!.id);
  }

  async take(userId: number, word: string): Promise<ReviewSnapshotRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `SELECT id, user_id, word, prev_data, prev_due, reps_before, created_at
         FROM review_snapshots WHERE user_id = $1 AND word = $2
         ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
        [userId, word],
      );
      const row = r.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('DELETE FROM review_snapshots WHERE id = $1', [Number(row.id)]);
      await client.query('COMMIT');
      return normalizeReviewSnapshot(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async remove(id: number): Promise<void> {
    await this.pool.query('DELETE FROM review_snapshots WHERE id = $1', [id]);
  }
}

/** M3（R-39⑤b）：账号事件审计，§4.5 红线 = 不落明文密码或其 hash */
export class PostgresAccountAuditDB implements AccountAuditDB {
  constructor(private readonly pool: pg.Pool) {}

  async append(entry: AccountAuditInput, plaintext?: string): Promise<number> {
    assertNoCredentialLeak(entry, plaintext);
    const r = await this.pool.query<{ id: number }>(
      `INSERT INTO account_audit_log (user_id, phone_masked, action, result, ip, ua, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        entry.userId,
        entry.phoneMasked ?? null,
        entry.action,
        entry.result,
        entry.ip ?? null,
        entry.ua ?? null,
        entry.now,
      ],
    );
    return Number(r.rows[0]!.id);
  }

  async listByUser(userId: number, limit = 50): Promise<AccountAuditRow[]> {
    const r = await this.pool.query(
      `SELECT id, user_id, phone_masked, action, result, ip, ua, created_at
       FROM account_audit_log WHERE user_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [userId, limit],
    );
    return r.rows.map((row) => normalizeAccountAudit(row));
  }
}

/** M5（§4.4.4）：运行时开关。语义解释不在 DB 层（`@tm/shared/constants/flags` 才是真相） */
export class PostgresFeatureFlagDB implements FeatureFlagDB {
  constructor(private readonly pool: pg.Pool) {}

  async get(key: string): Promise<FeatureFlagRow | null> {
    const r = await this.pool.query('SELECT key, value, updated_at FROM feature_flags WHERE key = $1', [key]);
    const row = r.rows[0];
    return row ? { key: String(row.key), value: String(row.value), updated_at: Number(row.updated_at) } : null;
  }

  async set(key: string, value: string, now: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO feature_flags (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key, value, now],
    );
  }

  async list(): Promise<FeatureFlagRow[]> {
    const r = await this.pool.query('SELECT key, value, updated_at FROM feature_flags ORDER BY key ASC');
    return r.rows.map((row) => ({
      key: String(row.key),
      value: String(row.value),
      updated_at: Number(row.updated_at),
    }));
  }
}

export class PostgresAppDB implements AppDB {
  users: UserDB;
  wordbooks: WordbookDB;
  profiles: ProfileDB;
  checkins: CheckinDB;
  fsrs: FsrsDB;
  tutorCache: TutorCacheDB;
  chat: ChatDB;
  assessment: AssessmentDB;
  analystCache: AnalystCacheDB;
  snapshots: ReviewSnapshotDB;
  audit: AccountAuditDB;
  flags: FeatureFlagDB;

  constructor(readonly pool: pg.Pool) {
    this.users = new PostgresUserDB(pool);
    this.wordbooks = new PostgresWordbookDB(pool);
    this.profiles = new PostgresProfileDB(pool);
    this.checkins = new PostgresCheckinDB(pool);
    this.fsrs = new PostgresFsrsDB(pool);
    this.tutorCache = new PostgresTutorCacheDB(pool);
    this.chat = new PostgresChatDB(pool);
    this.assessment = new PostgresAssessmentDB(pool);
    this.analystCache = new PostgresAnalystCacheDB(pool);
    this.snapshots = new PostgresReviewSnapshotDB(pool);
    this.audit = new PostgresAccountAuditDB(pool);
    this.flags = new PostgresFeatureFlagDB(pool);
  }

  async createUser(phone: string, now: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: number }>(
        'INSERT INTO users (phone, created_at) VALUES ($1, $2) RETURNING id',
        [phone, now],
      );
      const userId = user.rows[0]!.id;
      await client.query(
        'INSERT INTO wordbooks (user_id, data, updated_at) VALUES ($1, $2, $3)',
        [userId, '[]', now],
      );
      await client.query(
        'INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES ($1, $2, $3, $4)',
        [userId, '', '', now],
      );
      await client.query('COMMIT');
      return userId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async init(): Promise<void> {
    for (const ddl of DDL) {
      await this.pool.query(ddl);
    }
    // A-32-1(b) 启动自检：与 sqlite 侧**同一判据、同一条消息**（收敛在 `db/types.ts:assertCredentialColumnsForBoot`，
    // 两侧只是 introspection 方言不同：sqlite 用 `PRAGMA table_info`，pg 用 `information_schema.columns`）。
    // 缺 M1 凭据两列时在这里就失败并打印 `pnpm db:migrate`，绝不留成登录/注册的一堆 per-request 500。
    const cols = await this.pool.query(
      `SELECT column_name AS name
         FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users'`,
    );
    const have = new Set<string>(cols.rows.map((r: { name: string }) => String(r.name)));
    assertCredentialColumnsForBoot(CREDENTIAL_COLUMNS.filter((col) => !have.has(col)));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** 从降序日期数组计算连续天数（与 shared.computeStreak 相同，避免跨包依赖循环） */
function computeStreakFromRows(datesDesc: string[]): number {
  let streak = 0;
  for (let i = 0; i < datesDesc.length; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const expected =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    if (datesDesc[i] === expected) streak++;
    else break;
  }
  return streak;
}
