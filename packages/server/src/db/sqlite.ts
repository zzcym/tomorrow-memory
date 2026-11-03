/**
 * SQLite 实现（DB_DRIVER=sqlite）
 * 用 better-sqlite3（同步内核），对外暴露 async 接口以与 PG 实现对齐。
 */

import type Database from 'better-sqlite3';
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
import { computeStreak, safeJsonParse } from '@tm/shared';
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
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  // user_id 必须与迁移 007 的 `ADD COLUMN user_id INTEGER DEFAULT NULL` 同形（§10.2 T-25 判据⑥）：
  // 只 init() 不 migrate() 的库上 getOwned/setOwned 也要能跑，且两条建库路径反读到的形状一致。
  `CREATE TABLE IF NOT EXISTS assessment_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    qtype TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    user_id INTEGER DEFAULT NULL,
    UNIQUE (word, qtype)
  )`,
  `CREATE TABLE IF NOT EXISTS analyst_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, period)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fsrs_cards_user ON fsrs_cards (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tutor_cache_word ON tutor_cache (word)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id, created_at)`,
];

/** 把更好用的行类型从 better-sqlite3 返回中归一化 */
type SqliteRow = Record<string, unknown>;

/** T-06：凭据视图的列集合（M1 两列在迁移未执行时会抛"no such column"—— 部署顺序见 migrate 脚本） */
const CREDENTIAL_SELECT =
  'SELECT id, phone, password, created_at, password_changed_at, pw_policy_version FROM users';

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

  /* ══════════ T-06 新增（R-40③④ / R-39③④⑤b）——以上既有方法体一字未改 ══════════ */

  async findCredentialsByPhone(phone: string): Promise<UserCredentialRow | null> {
    assertPhone(phone);
    const row = this.db.prepare(`${CREDENTIAL_SELECT} WHERE phone = ?`).get(phone) as
      | SqliteRow
      | undefined;
    return Promise.resolve(row ? normalizeUserCredential(row) : null);
  }

  async findCredentialsById(id: number): Promise<UserCredentialRow | null> {
    // async 是刻意的：better-sqlite3 的准备语句是同步的，缺列（未跑迁移）/ 坏 SQL 在同步方法里
    // 会**当场 throw**，而 pg 侧同一方法只会 reject —— 两驱动错误通道分叉。上一轮已按同一口径把
    // findCredentialsByPhone 等 5 个新方法改成 async，这一处是同一家族的漏项（A-32-1(b) 的用例抓到的）。
    const row = this.db.prepare(`${CREDENTIAL_SELECT} WHERE id = ?`).get(id) as SqliteRow | undefined;
    return Promise.resolve(row ? normalizeUserCredential(row) : null);
  }

  async setPassword(uid: number, hash: string, policy: number, now: number): Promise<void> {
    assertPasswordHash(hash);
    this.db
      .prepare('UPDATE users SET password = ?, password_changed_at = ?, pw_policy_version = ? WHERE id = ?')
      .run(hash, now, policy, uid);
    return Promise.resolve();
  }

  async activateIfEmpty(uid: number, hash: string, policy: number, now: number): Promise<boolean> {
    assertPasswordHash(hash);
    // 判空口径与 EMPTY_PASSWORD_SQL 同一真相：password IS NULL OR trim(password) = ''
    // 单条条件写 = R-39⑤b 的"认领"，changes===1 者胜，无读后写竞态
    const result = this.db
      .prepare(
        `UPDATE users SET password = ?, password_changed_at = ?, pw_policy_version = ?
         WHERE id = ? AND ${EMPTY_PASSWORD_SQL}`,
      )
      .run(hash, now, policy, uid);
    return Promise.resolve(Number(result.changes) === 1);
  }

  touchPasswordChanged(userId: number, now: number): Promise<void> {
    this.db.prepare('UPDATE users SET password_changed_at = ? WHERE id = ?').run(now, userId);
    return Promise.resolve();
  }

  async createWithPassword(phone: string, hash: string, policy: number, now: number): Promise<number> {
    assertPhone(phone);
    assertPasswordHash(hash);
    const tx = this.db.transaction((ph: string, hs: string, po: number, ts: number) => {
      const result = this.db
        .prepare('INSERT INTO users (phone, password, created_at, password_changed_at, pw_policy_version) VALUES (?, ?, ?, ?, ?)')
        .run(ph, hs, ts, ts, po);
      const userId = Number(result.lastInsertRowid);
      this.db
        .prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)')
        .run(userId, '[]', ts);
      this.db
        .prepare('INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES (?, ?, ?, ?)')
        .run(userId, '', '', ts);
      return userId;
    });
    return Promise.resolve(tx(phone, hash, policy, now));
  }
}

export class SqliteWordbookDB implements WordbookDB {
  constructor(private readonly db: Database.Database) {}

  getData(userId: number): Promise<WordbookEntry[]> {
    const row = this.db.prepare('SELECT data FROM wordbooks WHERE user_id = ?').get(userId) as SqliteRow | undefined;
    return Promise.resolve(row ? safeJsonParse<WordbookEntry[]>(String(row.data), []) : []);
  }

  async saveData(userId: number, data: WordbookEntry[], now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(data), now);
    // 新词自动建 FSRS 卡(New 状态,due=now):加入单词本即可立即学习,无需手动初始化
    const insertCard = this.db.prepare(
      `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)
       ON CONFLICT (user_id, word) DO NOTHING`,
    );
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
      insertCard.run(userId, entry.word, JSON.stringify(card), now, now);
    }
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

  /* ══════════ T-06 新增（§4.4.3 单一落库路径 / R-03①④）——以上既有方法体一字未改 ══════════ */

  getSyncState(userId: number): Promise<WordbookSyncStateRow | null> {
    const row = this.db
      .prepare('SELECT user_id, sync_version, updated_at, tombstones FROM wordbooks WHERE user_id = ?')
      .get(userId) as SqliteRow | undefined;
    return Promise.resolve(
      row
        ? {
            user_id: Number(row.user_id),
            sync_version: Number(row.sync_version ?? 0),
            updated_at: Number(row.updated_at),
            tombstones: row.tombstones === null || row.tombstones === undefined ? '[]' : String(row.tombstones),
          }
        : null,
    );
  }

  applyEntries(userId: number, data: WordbookEntry[], now: number): Promise<number> {
    const run = this.db.transaction((uid: number, entries: WordbookEntry[], ts: number) => {
      const json = JSON.stringify(entries);
      const cur = this.db
        .prepare('SELECT data, sync_version FROM wordbooks WHERE user_id = ?')
        .get(uid) as SqliteRow | undefined;
      if (!cur) {
        this.db
          .prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)')
          .run(uid, json, ts);
      }
      const prevVersion = Number(cur?.sync_version ?? 0);
      const prevJson = cur ? String(cur.data) : '[]';
      if (prevJson === json) {
        // §4.4.2 幂等：集合未变 → 不 ++（同一请求重放两次版本不动）
        this.ensureNewCards(uid, entries, ts);
        return prevVersion;
      }
      this.db
        .prepare('UPDATE wordbooks SET data = ?, updated_at = ?, sync_version = sync_version + 1 WHERE user_id = ?')
        .run(json, ts, uid);
      this.ensureNewCards(uid, entries, ts);
      return prevVersion + 1;
    });
    return Promise.resolve(run.immediate(userId, data, now));
  }

  applySync(
    userId: number,
    data: WordbookEntry[],
    tombstonesJson: string,
    baseVersion: number,
    now: number,
  ): Promise<ApplySyncResult> {
    const run = this.db.transaction(
      (uid: number, entries: WordbookEntry[], tombs: string, base: number, ts: number): ApplySyncResult => {
        const cur = this.db
          .prepare('SELECT data, sync_version, tombstones FROM wordbooks WHERE user_id = ?')
          .get(uid) as SqliteRow | undefined;
        if (!cur) return { ok: false, version: 0, reason: 'missing' };
        const version = Number(cur.sync_version ?? 0);
        if (version !== base) {
          // CAS 未命中：service 翻成 409 WORDBOOK_STALE + 服务端最新 version（R-03①）
          return { ok: false, version, reason: 'stale' };
        }
        const json = JSON.stringify(entries);
        const changed = String(cur.data) !== json || String(cur.tombstones ?? '[]') !== tombs;
        if (!changed) {
          this.ensureNewCards(uid, entries, ts);
          return { ok: true, version };
        }
        this.db
          .prepare(
            `UPDATE wordbooks
             SET data = ?, tombstones = ?, updated_at = ?, sync_version = sync_version + 1
             WHERE user_id = ? AND sync_version = ?`,
          )
          .run(json, tombs, ts, uid, version);
        this.ensureNewCards(uid, entries, ts);
        return { ok: true, version: version + 1 };
      },
    );
    return Promise.resolve(run.immediate(userId, data, tombstonesJson, baseVersion, now));
  }

  /**
   * A-32-6：事务内 read-modify-write。
   * `BEGIN IMMEDIATE`（`run.immediate`）先拿到整库写锁 ⇒ 回调读到的那一行到写回之间不会有别人插进来，
   * 这正是 service 层不再需要 CAS 循环的理由（pg 侧对应用 `SELECT … FOR UPDATE` 拿行锁，见 `db/pg.ts`）。
   * 决策（写什么 / 是否真的变了 / 新版本号）走 `planWordbookMutate()`，与 pg 同一份代码。
   */
  applyMutate<T>(
    userId: number,
    mutate: (current: WordbookCurrent) => WordbookPatch<T>,
    now: number,
  ): Promise<WordbookMutateResult<T>> {
    const run = this.db.transaction(
      (
        uid: number,
        fn: (current: WordbookCurrent) => WordbookPatch<T>,
        ts: number,
      ): WordbookMutateResult<T> => {
        const cur = this.db
          .prepare('SELECT data, sync_version, updated_at, tombstones FROM wordbooks WHERE user_id = ?')
          .get(uid) as SqliteRow | undefined;
        const current = wordbookCurrentOf(cur);
        const plan = planWordbookMutate(current, fn(current));
        if (!cur) {
          // 与 `applyEntries` 同形：先建最小行（不写 M4 两列，未迁移库上也能建），再按需 UPDATE 推进版本
          this.db
            .prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)')
            .run(uid, plan.dataJson, ts);
        }
        if (plan.changed) {
          this.db
            .prepare(
              `UPDATE wordbooks
               SET data = ?, tombstones = ?, updated_at = ?, sync_version = sync_version + 1
               WHERE user_id = ?`,
            )
            .run(plan.dataJson, plan.tombstones, ts, uid);
        }
        this.ensureNewCards(uid, plan.entries, ts);
        return { value: plan.value, version: plan.version, wrote: plan.changed };
      },
    );
    try {
      return Promise.resolve(run.immediate(userId, mutate, now));
    } catch (err) {
      // 回调是调用方给的，可能同步抛错（事务已由 better-sqlite3 回滚）。
      // 本方法签名是 Promise ⇒ 同步抛错一律转成 rejection，和 pg 驱动同一口径，
      // 免得调用方写 `applyMutate(...).catch(...)` 时漏接（await 写法两者行为一致）。
      return Promise.reject(err);
    }
  }

  /**
   * 为尚未建卡的新词补 FSRS 卡（New 状态）。
   * 与既有 `saveData` 内联的那段**逐字同形**（同一个 JSON 对象、同样 `DO NOTHING`）——
   * 之所以复制而不是把 `saveData` 改成调用本方法：§10.2 T-06 行要求既有方法体一字不改。
   * 两者的一致性由 `test/db/methods.spec.ts` 断言（同一输入产出同一卡片 JSON）。
   */
  private ensureNewCards(userId: number, entries: WordbookEntry[], now: number): void {
    const insertCard = this.db.prepare(
      `INSERT INTO fsrs_cards (user_id, word, fsrs_data, last_review, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)
       ON CONFLICT (user_id, word) DO NOTHING`,
    );
    for (const entry of entries) {
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
      insertCard.run(userId, entry.word, JSON.stringify(card), now, now);
    }
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

export class SqliteChatDB implements ChatDB {
  constructor(private readonly db: Database.Database) {}

  addMessage(
    userId: number,
    threadId: string,
    role: string,
    content: string,
    now: number,
  ): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO chat_messages (user_id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, threadId, role, content, now);
    return Promise.resolve();
  }

  getRecentMessages(userId: number, threadId: string, limit: number): Promise<ChatMessageRow[]> {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, thread_id, role, content, created_at FROM chat_messages
         WHERE user_id = ? AND thread_id = ?
         ORDER BY id DESC LIMIT ?`,
      )
      .all(userId, threadId, limit) as SqliteRow[];
    return Promise.resolve(
      rows.reverse().map((r) => ({
        id: Number(r.id),
        user_id: Number(r.user_id),
        thread_id: String(r.thread_id),
        role: String(r.role),
        content: String(r.content),
        created_at: Number(r.created_at),
      })),
    );
  }
}

export class SqliteAssessmentDB implements AssessmentDB {
  constructor(private readonly db: Database.Database) {}

  get(word: string, qtype: string): Promise<AssessmentCacheRow | null> {
    const row = this.db
      .prepare('SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = ? AND qtype = ?')
      .get(word, qtype) as SqliteRow | undefined;
    return Promise.resolve(
      row
        ? {
            id: Number(row.id),
            word: String(row.word),
            qtype: String(row.qtype),
            question: String(row.question),
            created_at: Number(row.created_at),
          }
        : null,
    );
  }

  set(word: string, qtype: string, questionJson: string, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO assessment_cache (word, qtype, question, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (word, qtype) DO UPDATE SET question = excluded.question, created_at = excluded.created_at`,
      )
      .run(word, qtype, questionJson, now);
    return Promise.resolve();
  }

  /** M7 / R-41（T-25）：属主过滤读 —— `user_id IS NULL`（改造前的无主题面）与他人属主的行**都读不到**；
   *  属主判定与取题面在**同一条语句**里完成，不给"两次读之间被他人 setOwned 挤占"留窗口。 */
  getOwned(word: string, qtype: string, userId: number): Promise<AssessmentCacheRow | null> {
    // better-sqlite3 原生把 INTEGER 列回成 JS number、TEXT 列回成 string，故不再逐字段 Number()/String() 包装。
    const row = this.db
      .prepare('SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = ? AND qtype = ? AND user_id = ?')
      .get(word, qtype, userId) as AssessmentCacheRow | undefined;
    return Promise.resolve(row ?? null);
  }

  /** M7 / R-41（T-25）：带属主的写入 —— `DO UPDATE` 把 `user_id` 改写成当前写入者（缓存挤占语义，代价登记 RK-14）。 */
  setOwned(word: string, qtype: string, userId: number, questionJson: string, now: number): Promise<void> {
    this.db
      .prepare(`INSERT INTO assessment_cache (word, qtype, question, created_at, user_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (word, qtype) DO UPDATE SET question = excluded.question, created_at = excluded.created_at, user_id = excluded.user_id`)
      .run(word, qtype, questionJson, now, userId);
    return Promise.resolve();
  }
}

export class SqliteAnalystCacheDB implements AnalystCacheDB {
  constructor(private readonly db: Database.Database) {}

  get(userId: number, period: string): Promise<AnalystCacheRow | null> {
    const row = this.db
      .prepare('SELECT id, user_id, period, content, created_at FROM analyst_cache WHERE user_id = ? AND period = ?')
      .get(userId, period) as SqliteRow | undefined;
    return Promise.resolve(
      row
        ? {
            id: Number(row.id),
            user_id: Number(row.user_id),
            period: String(row.period),
            content: String(row.content),
            created_at: Number(row.created_at),
          }
        : null,
    );
  }

  set(userId: number, period: string, contentJson: string, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO analyst_cache (user_id, period, content, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, period) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
      )
      .run(userId, period, contentJson, now);
    return Promise.resolve();
  }
}

/** M2（R-11）：复习撤销快照 */
export class SqliteReviewSnapshotDB implements ReviewSnapshotDB {
  constructor(private readonly db: Database.Database) {}

  save(
    userId: number,
    word: string,
    prevData: string,
    prevDue: number | null,
    repsBefore: number,
    now: number,
  ): Promise<number> {
    const r = this.db
      .prepare(
        'INSERT INTO review_snapshots (user_id, word, prev_data, prev_due, reps_before, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(userId, word, prevData, prevDue, repsBefore, now);
    return Promise.resolve(Number(r.lastInsertRowid));
  }

  take(userId: number, word: string): Promise<ReviewSnapshotRow | null> {
    const run = this.db.transaction((uid: number, w: string) => {
      const row = this.db
        .prepare(
          `SELECT id, user_id, word, prev_data, prev_due, reps_before, created_at
           FROM review_snapshots WHERE user_id = ? AND word = ?
           ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get(uid, w) as SqliteRow | undefined;
      if (!row) return null;
      this.db.prepare('DELETE FROM review_snapshots WHERE id = ?').run(Number(row.id));
      return normalizeReviewSnapshot(row);
    });
    return Promise.resolve(run.immediate(userId, word));
  }

  remove(id: number): Promise<void> {
    this.db.prepare('DELETE FROM review_snapshots WHERE id = ?').run(id);
    return Promise.resolve();
  }
}

/** M3（R-39⑤b）：账号事件审计，§4.5 红线 = 不落明文密码或其 hash */
export class SqliteAccountAuditDB implements AccountAuditDB {
  constructor(private readonly db: Database.Database) {}

  async append(entry: AccountAuditInput, plaintext?: string): Promise<number> {
    assertNoCredentialLeak(entry, plaintext);
    const r = this.db
      .prepare(
        'INSERT INTO account_audit_log (user_id, phone_masked, action, result, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(entry.userId, entry.phoneMasked ?? null, entry.action, entry.result, entry.ip ?? null, entry.ua ?? null, entry.now);
    return Promise.resolve(Number(r.lastInsertRowid));
  }

  listByUser(userId: number, limit = 50): Promise<AccountAuditRow[]> {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, phone_masked, action, result, ip, ua, created_at
         FROM account_audit_log WHERE user_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(userId, limit) as SqliteRow[];
    return Promise.resolve(rows.map(normalizeAccountAudit));
  }
}

/** M5（§4.4.4）：运行时开关。语义解释不在 DB 层（`@tm/shared/constants/flags` 才是真相） */
export class SqliteFeatureFlagDB implements FeatureFlagDB {
  constructor(private readonly db: Database.Database) {}

  get(key: string): Promise<FeatureFlagRow | null> {
    const row = this.db.prepare('SELECT key, value, updated_at FROM feature_flags WHERE key = ?').get(key) as
      | SqliteRow
      | undefined;
    return Promise.resolve(
      row ? { key: String(row.key), value: String(row.value), updated_at: Number(row.updated_at) } : null,
    );
  }

  set(key: string, value: string, now: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO feature_flags (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now);
    return Promise.resolve();
  }

  list(): Promise<FeatureFlagRow[]> {
    const rows = this.db.prepare('SELECT key, value, updated_at FROM feature_flags ORDER BY key ASC').all() as SqliteRow[];
    return Promise.resolve(
      rows.map((r) => ({ key: String(r.key), value: String(r.value), updated_at: Number(r.updated_at) })),
    );
  }
}

export class SqliteAppDB implements AppDB {
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

  constructor(readonly db: Database.Database) {
    this.users = new SqliteUserDB(db);
    this.wordbooks = new SqliteWordbookDB(db);
    this.profiles = new SqliteProfileDB(db);
    this.checkins = new SqliteCheckinDB(db);
    this.fsrs = new SqliteFsrsDB(db);
    this.tutorCache = new SqliteTutorCacheDB(db);
    this.chat = new SqliteChatDB(db);
    this.assessment = new SqliteAssessmentDB(db);
    this.analystCache = new SqliteAnalystCacheDB(db);
    this.snapshots = new SqliteReviewSnapshotDB(db);
    this.audit = new SqliteAccountAuditDB(db);
    this.flags = new SqliteFeatureFlagDB(db);
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
    // SQLite 默认不启用外键约束：不开启则 DDL 里的 FOREIGN KEY 全部不生效（与 PG 行为分叉）
    this.db.exec('PRAGMA foreign_keys = ON');
    for (const ddl of DDL) {
      this.db.exec(ddl);
    }
    // 轻量迁移：旧版 data.db 缺列时补列（幂等；列已存在则 ALTER 失败被忽略）
    const colExists = (table: string, col: string): boolean => {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      return cols.some((c) => c.name === col);
    };
    if (colExists('users', 'password') === false) {
      this.db.exec('ALTER TABLE users ADD COLUMN password TEXT DEFAULT NULL');
      console.log('[DB] 迁移：users 增加 password 列');
    }
    if (colExists('profiles', 'daily_goal') === false) {
      this.db.exec('ALTER TABLE profiles ADD COLUMN daily_goal INTEGER DEFAULT 10');
      console.log('[DB] 迁移：profiles 增加 daily_goal 列');
    }
    // A-32-1(b) 启动自检：上面那段只补"上古"两列，M1 的凭据两列**只能由 `001-credentials-columns` 加**，
    // 而 `dev`/生产镜像都不跑迁移 ⇒ 缺列必须在启动这一步就失败（并打印 `pnpm db:migrate`），
    // 绝不能退化成一堆 per-request 500。判据与消息两驱动共用 `assertCredentialColumnsForBoot`。
    assertCredentialColumnsForBoot(CREDENTIAL_COLUMNS.filter((col) => !colExists('users', col)));
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

/** T-06：凭据视图（含 M1 两列）。缺失列一律落到 0，与 M1 的 DEFAULT 0 同义。 */
function normalizeUserCredential(row: SqliteRow): UserCredentialRow {
  return {
    id: Number(row.id),
    phone: String(row.phone ?? ''),
    password: row.password === null || row.password === undefined ? null : String(row.password),
    created_at: Number(row.created_at),
    password_changed_at: Number(row.password_changed_at ?? 0),
    pw_policy_version: Number(row.pw_policy_version ?? 0),
  };
}

/** T-06/M2 */
function normalizeReviewSnapshot(row: SqliteRow): ReviewSnapshotRow {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    word: String(row.word),
    prev_data: String(row.prev_data),
    prev_due: row.prev_due === null || row.prev_due === undefined ? null : Number(row.prev_due),
    reps_before: Number(row.reps_before ?? 0),
    created_at: Number(row.created_at),
  };
}

/** T-06/M3 */
function normalizeAccountAudit(row: SqliteRow): AccountAuditRow {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    phone_masked: row.phone_masked === null || row.phone_masked === undefined ? null : String(row.phone_masked),
    action: String(row.action),
    result: String(row.result),
    ip: row.ip === null || row.ip === undefined ? null : String(row.ip),
    ua: row.ua === null || row.ua === undefined ? null : String(row.ua),
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
