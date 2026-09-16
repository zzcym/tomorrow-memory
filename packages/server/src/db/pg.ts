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
import type {
  AnalystCacheDB,
  AppDB,
  AssessmentDB,
  ChatDB,
  CheckinDB,
  FsrsDB,
  ProfileDB,
  TutorCacheDB,
  UserDB,
  WordbookDB,
} from './types.js';

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
  `CREATE TABLE IF NOT EXISTS assessment_cache (
    id SERIAL PRIMARY KEY,
    word TEXT NOT NULL,
    qtype TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at BIGINT NOT NULL,
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
