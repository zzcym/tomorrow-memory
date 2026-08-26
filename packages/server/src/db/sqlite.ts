/**
 * SQLite 实现（DB_DRIVER=sqlite）
 * 用 better-sqlite3（同步内核），对外暴露 async 接口以与 PG 实现对齐。
 */

import type Database from 'better-sqlite3';
import type {
  AdminUserRow,
  CefrLevel,
  FsrsCardRow,
  ProfileRow,
  TutorCacheRow,
  UserRow,
  WordbookEntry,
} from '@tm/shared';
import { computeStreak, safeJsonParse } from '@tm/shared';
import type { AppDB, CheckinDB, FsrsDB, ProfileDB, TutorCacheDB, UserDB, WordbookDB } from './types.js';

/** 建表 DDL（幂等） */
const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS wordbooks (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    daily_goal INTEGER DEFAULT 10,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS checkin_logs (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS fsrs_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    fsrs_data TEXT NOT NULL,
    last_review INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, word),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS tutor_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    level TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (word, level)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fsrs_cards_user ON fsrs_cards (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tutor_cache_word ON tutor_cache (word)`,
];

/** 把更好用的行类型从 better-sqlite3 返回中归一化 */
type SqliteRow = Record<string, unknown>;

export class SqliteUserDB implements UserDB {
  constructor(private readonly db: Database.Database) {}

  findByPhone(phone: string): Promise<UserRow | null> {
    const row = this.db.prepare('SELECT id, phone, password, created_at FROM users WHERE phone = ?').get(phone) as
      | SqliteRow
      | undefined;
    return Promise.resolve(row ? (normalizeUser(row) as UserRow) : null);
  }

  findById(id: number): Promise<UserRow | null> {
    const row = this.db.prepare('SELECT id, phone, password, created_at FROM users WHERE id = ?').get(id) as
      | SqliteRow
      | undefined;
    return Promise.resolve(row ? (normalizeUser(row) as UserRow) : null);
  }

  updatePassword(userId: number, hash: string): Promise<void> {
    this.db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, userId);
    return Promise.resolve();
  }

  countAll(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as SqliteRow;
    return Promise.resolve(Number(row.count ?? 0));
  }

  countCreatedSince(ts: number): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users WHERE created_at >= ?').get(ts) as SqliteRow;
    return Promise.resolve(Number(row.count ?? 0));
  }

  listAdminUsers(page: number, pageSize: number): Promise<AdminUserRow[]> {
    const offset = (page - 1) * pageSize;
    const users = this.db
      .prepare(
        `SELECT u.id, u.phone, u.created_at,
                COALESCE((SELECT json_array_length(data) FROM wordbooks w WHERE w.user_id = u.id), 0) AS word_count,
                (SELECT updated_at FROM wordbooks w WHERE w.user_id = u.id) AS last_active,
                p.nickname, p.avatar
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(pageSize, offset) as SqliteRow[];
    return Promise.resolve(
      users.map((u) => ({
        id: Number(u.id),
        phone: String(u.phone ?? ''),
        created_at: Number(u.created_at),
        word_count: Number(u.word_count ?? 0),
        last_active: u.last_active === null || u.last_active === undefined ? null : Number(u.last_active),
        nickname: u.nickname === null || u.nickname === undefined ? null : String(u.nickname),
        avatar: u.avatar === null || u.avatar === undefined ? null : String(u.avatar),
      })),
    );
  }
}

export class SqliteWordbookDB implements WordbookDB {
  constructor(private readonly db: Database.Database) {}

  getData(userId: number): Promise<WordbookEntry[]> {
    const row = this.db.prepare('SELECT data FROM wordbooks WHERE user_id = ?').get(userId) as SqliteRow | undefined;
    return Promise.resolve(row ? safeJsonParse<WordbookEntry[]>(String(row.data), []) : []);
  }

  saveData(userId: number, data: WordbookEntry[], now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(data), now);
    return Promise.resolve();
  }

  countAll(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM wordbooks').get() as SqliteRow;
    return Promise.resolve(Number(row.count ?? 0));
  }

  getAllWordbooks(): Promise<Array<{ userId: number; data: WordbookEntry[] }>> {
    const rows = this.db.prepare('SELECT user_id, data FROM wordbooks').all() as SqliteRow[];
    return Promise.resolve(
      rows.map((r) => ({
        userId: Number(r.user_id),
        data: safeJsonParse<WordbookEntry[]>(String(r.data), []),
      })),
    );
  }
}

export class SqliteProfileDB implements ProfileDB {
  constructor(private readonly db: Database.Database) {}

  get(userId: number): Promise<ProfileRow | null> {
    const row = this.db
      .prepare('SELECT user_id, nickname, avatar, daily_goal, updated_at FROM profiles WHERE user_id = ?')
      .get(userId) as SqliteRow | undefined;
    return Promise.resolve(row ? normalizeProfile(row) : null);
  }

  async ensure(userId: number): Promise<ProfileRow> {
    const existing = await this.get(userId);
    if (existing) return existing;
    const now = Date.now();
    this.db
      .prepare(
        'INSERT OR IGNORE INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, '', '', 10, now);
    const created = await this.get(userId);
    return created ?? { user_id: userId, nickname: '', avatar: '', daily_goal: 10, updated_at: now };
  }

  update(
    userId: number,
    patch: { nickname?: string; avatar?: string; daily_goal?: number },
    now: number,
  ): Promise<void> {
    const existing = this.db
      .prepare('SELECT nickname, avatar, daily_goal FROM profiles WHERE user_id = ?')
      .get(userId) as SqliteRow | undefined;
    const nickname = patch.nickname !== undefined ? patch.nickname : existing ? String(existing.nickname ?? '') : '';
    const avatar = patch.avatar !== undefined ? patch.avatar : existing ? String(existing.avatar ?? '') : '';
    const goal = patch.daily_goal !== undefined ? patch.daily_goal : existing ? Number(existing.daily_goal ?? 10) : 10;
    this.db
      .prepare('UPDATE profiles SET nickname = ?, avatar = ?, daily_goal = ?, updated_at = ? WHERE user_id = ?')
      .run(nickname, avatar, goal, now, userId);
    return Promise.resolve();
  }
}

export class SqliteCheckinDB implements CheckinDB {
  constructor(private readonly db: Database.Database) {}

  isCheckedIn(userId: number, date: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 AS ok FROM checkin_logs WHERE user_id = ? AND date = ?')
      .get(userId, date) as SqliteRow | undefined;
    return Promise.resolve(!!row);
  }

  checkin(userId: number, date: string, now: number): Promise<void> {
    this.db
      .prepare('INSERT OR IGNORE INTO checkin_logs (user_id, date, created_at) VALUES (?, ?, ?)')
      .run(userId, date, now);
    return Promise.resolve();
  }

  getDates(userId: number): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT date FROM checkin_logs WHERE user_id = ? ORDER BY date ASC')
      .all(userId) as SqliteRow[];
    return Promise.resolve(rows.map((r) => String(r.date)));
  }

  getStreak(userId: number): Promise<number> {
    const rows = this.db
      .prepare('SELECT date FROM checkin_logs WHERE user_id = ? ORDER BY date DESC')
      .all(userId) as SqliteRow[];
    return Promise.resolve(computeStreak(rows.map((r) => String(r.date))));
  }
}

export class SqliteFsrsDB implements FsrsDB {
  constructor(private readonly db: Database.Database) {}

  getCard(userId: number, word: string): Promise<FsrsCardRow | null> {
    const row = this.db
      .prepare('SELECT id, user_id, word, fsrs_data, last_review, created_at, updated_at FROM fsrs_cards WHERE user_id = ? AND word = ?')
      .get(userId, word) as SqliteRow | undefined;
    return Promise.resolve(row ? normalizeFsrsCard(row) : null);
  }

  getCardsByUser(userId: number): Promise<FsrsCardRow[]> {
    const rows = this.db
      .prepare('SELECT id, user_id, word, fsrs_data, last_review, created_at, updated_at FROM fsrs_cards WHERE user_id = ? ORDER BY id ASC')
      .all(userId) as SqliteRow[];
    return Promise.resolve(rows.map(normalizeFsrsCard));
  }

  upsertCard(
    userId: number,
    word: string,
    fsrsDataJson: string,
    lastReview: number | null,
    now: number,
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, word) DO UPDATE SET
           fsrs_data = excluded.fsrs_data,
           last_review = excluded.last_review,
           updated_at = excluded.updated_at`,
      )
      .run(userId, word, fsrsDataJson, lastReview, now, now);
    return Promise.resolve();
  }

  deleteCard(userId: number, word: string): Promise<void> {
    this.db.prepare('DELETE FROM fsrs_cards WHERE user_id = ? AND word = ?').run(userId, word);
    return Promise.resolve();
  }
}

export class SqliteTutorCacheDB implements TutorCacheDB {
  constructor(private readonly db: Database.Database) {}

  get(word: string, level: CefrLevel): Promise<TutorCacheRow | null> {
    const row = this.db
      .prepare('SELECT id, word, level, content, created_at FROM tutor_cache WHERE word = ? AND level = ?')
      .get(word, level) as SqliteRow | undefined;
    return Promise.resolve(row ? normalizeTutorCache(row) : null);
  }

  set(word: string, level: CefrLevel, contentJson: string, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tutor_cache (word, level, content, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (word, level) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
      )
      .run(word, level, contentJson, now);
    return Promise.resolve();
  }
}

export class SqliteAppDB implements AppDB {
  users: UserDB;
  wordbooks: WordbookDB;
  profiles: ProfileDB;
  checkins: CheckinDB;
  fsrs: FsrsDB;
  tutorCache: TutorCacheDB;

  constructor(readonly db: Database.Database) {
    this.users = new SqliteUserDB(db);
    this.wordbooks = new SqliteWordbookDB(db);
    this.profiles = new SqliteProfileDB(db);
    this.checkins = new SqliteCheckinDB(db);
    this.fsrs = new SqliteFsrsDB(db);
    this.tutorCache = new SqliteTutorCacheDB(db);
  }

  async createUser(phone: string, now: number): Promise<number> {
    const tx = this.db.transaction((ph: string, ts: number) => {
      const result = this.db.prepare('INSERT INTO users (phone, created_at) VALUES (?, ?)').run(ph, ts);
      const userId = Number(result.lastInsertRowid);
      this.db
        .prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)')
        .run(userId, '[]', ts);
      this.db
        .prepare('INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES (?, ?, ?, ?)')
        .run(userId, '', '', ts);
      return userId;
    });
    return tx(phone, now);
  }

  async init(): Promise<void> {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA wal_autocheckpoint = 100');
    this.db.exec('PRAGMA synchronous = NORMAL');
    for (const ddl of DDL) {
      this.db.exec(ddl);
    }
  }

  async close(): Promise<void> {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
  }
}

function normalizeUser(row: SqliteRow): UserRow {
  return {
    id: Number(row.id),
    phone: String(row.phone ?? ''),
    password: row.password === null || row.password === undefined ? null : String(row.password),
    created_at: Number(row.created_at),
  };
}

function normalizeProfile(row: SqliteRow): ProfileRow {
  return {
    user_id: Number(row.user_id),
    nickname: String(row.nickname ?? ''),
    avatar: String(row.avatar ?? ''),
    daily_goal: Number(row.daily_goal ?? 10),
    updated_at: Number(row.updated_at),
  };
}

function normalizeFsrsCard(row: SqliteRow): FsrsCardRow {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    word: String(row.word),
    fsrs_data: String(row.fsrs_data),
    last_review: row.last_review === null || row.last_review === undefined ? null : Number(row.last_review),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

function normalizeTutorCache(row: SqliteRow): TutorCacheRow {
  return {
    id: Number(row.id),
    word: String(row.word),
    level: String(row.level) as CefrLevel,
    content: String(row.content),
    created_at: Number(row.created_at),
  };
}
