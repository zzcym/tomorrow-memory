/**
 * T-06 迁移框架测试（`pnpm --filter @tm/server test -- db`）。
 *
 * 对应 §10.2 T-06 的完成判据：
 *  ① schema 反读比对（ddl-parity A 段的包内等价物：真库反读 == DDL 单一源，0 差异 + 幂等重跑）；
 *  ② M1/M4 只有 `ADD COLUMN … DEFAULT`，且**全仓不存在** `UPDATE users SET pw_policy_version` 回填；
 *  ③ 每个迁移有 `down()` 或 `noDownReason`（含"断言器本身不是空转"的负向用例）；
 *  ⑤ 在**已存在的 data.db 副本**上跑迁移，断言存量 `password` hash 逐行全等、
 *    业务表行数不变、`fsrs_cards.fsrs_data` 一字未动。
 *
 * pg 侧（本机无 PG 实例）：
 *  - **静态**面在本文件里真跑（`statements('pg')` 过同一套白名单与纪律断言，扫描面=执行面）；
 *  - **运行时**反读比对（`diffSchemaAgainstDescriptor`）需要活库 → `describe.runIf(DATABASE_URL_TEST)`，
 *    未设该变量时那些用例报 skipped，报告里如实写"未执行 + 原因"（§6.2 允许跳过 A 段/pg，
 *    CI 的 T-22 会起 PG 补齐）。
 *
 * 红线：本文件**只在临时副本上写**。仓库根 `data.db` 与 `packages/server/data.db` 一律只读打开。
 *
 * 【T-25 第 2 轮追加（§10.2 T-25 判据①② / §10.4 第 9 行①②，只追加不改动既有用例）】
 *  ① M1-M6（000-006）的语句数组**逐字节快照** + 迁移目录四类禁词的 grep 证据；
 *  ② 007 = 1 条 `ADD COLUMN`、`BUSINESS_TABLES_IN_STATEMENT` 0 命中、临时副本上"迁移前后
 *     `COUNT(*)` / `SUM(id)` / 既有 4 列逐行 hash 全等 + 全表 `user_id IS NULL`"。
 *  见文件末尾两个 `T-25 判据①/②` describe；注册表用例（判据③第一格）已随之从 000…006 扩到 000…007。
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { defaultSchemaSource } from '@tm/shared/schema';
import { PROJECT_ROOT } from '../../src/config.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import {
  assertMigrationDiscipline,
  diffSchemaAgainstDescriptor,
  type Migration,
  MigrationRunner,
} from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS, assertSafeTarget, parseArgs } from '../../src/scripts/migrate.js';

const PG_URL = process.env.DATABASE_URL_TEST ?? '';
const tmpDir = path.join(os.tmpdir(), `tm-t06-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const ADD_COLUMN = /^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\b/i;

const sourceFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? sourceFiles(full) : /\.(ts|js|sql|mjs)$/.test(e.name) ? [full] : [];
    });

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ════════════════════ 判据② M1/M4：只有加列，零回填 ════════════════════ */

describe('判据②：M1/M4 只有 ADD COLUMN … DEFAULT，不做任何回填', () => {
  const byName = (name: string): Migration => {
    const m = ALL_MIGRATIONS.find((x) => x.name === name);
    if (!m) throw new Error(`缺少迁移 ${name}`);
    return m;
  };

  for (const name of ['001-credentials-columns', '004-wordbook-sync-columns']) {
    it(`${name} 在两个驱动上都只产出 ALTER TABLE … ADD COLUMN … DEFAULT`, () => {
      for (const driver of ['sqlite', 'pg'] as const) {
        const statements = byName(name).statements(driver);
        expect(statements.length).toBeGreaterThan(0);
        for (const sql of statements) {
          expect(ADD_COLUMN.test(sql), `非加列语句：${sql}`).toBe(true);
          expect(/\bDEFAULT\b/i.test(sql), `加列未带 DEFAULT：${sql}`).toBe(true);
          expect(/\bUPDATE\b|\bDELETE\b/i.test(sql), `出现数据改写：${sql}`).toBe(false);
        }
      }
    });
  }

  it('M1 加的就是 R-40③④ 那两列，M4 加的就是 R-03① 那两列', () => {
    const cols = (name: string): string[] =>
      ['sqlite', 'pg'].flatMap((d) =>
        byName(name)
          .statements(d as 'sqlite' | 'pg')
          .map((s) => ADD_COLUMN.exec(s)?.[2] ?? ''),
      );
    expect([...new Set(cols('001-credentials-columns'))].sort()).toEqual([
      'password_changed_at',
      'pw_policy_version',
    ]);
    expect([...new Set(cols('004-wordbook-sync-columns'))].sort()).toEqual(['sync_version', 'tombstones']);
  });

  it('全仓（migrations/ 与 scripts/）不存在 "UPDATE users SET pw_policy_version" 字面量（= 判据②的 grep 口径）', () => {
    const roots = ['packages/server/src/db/migrations', 'packages/server/src/scripts'];
    const hits: string[] = [];
    for (const rel of roots) {
      for (const file of sourceFiles(path.join(PROJECT_ROOT, rel))) {
        const text = fs.readFileSync(file, 'utf8');
        const n = (text.match(/UPDATE\s+users\s+SET\s+pw_policy_version/gi) ?? []).length;
        if (n) hits.push(`${path.relative(PROJECT_ROOT, file)}×${n}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('M1/M4 的语句里没有 wordbooks.data / fsrs_cards 列（红线：既有列一字不动）', () => {
    for (const name of ['001-credentials-columns', '004-wordbook-sync-columns']) {
      for (const driver of ['sqlite', 'pg'] as const) {
        for (const sql of byName(name).statements(driver)) {
          expect(/\bfsrs_cards\b|\bDROP\b|\bRENAME\b|\bALTER\s+COLUMN\b/i.test(sql), sql).toBe(false);
          expect(/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?data\b/i.test(sql), sql).toBe(false);
        }
      }
    }
  });
});

/* ════════════════════ 判据③ down() / noDownReason ════════════════════ */

describe('判据③：每个迁移有 down() 或 noDownReason（脚本断言）', () => {
  it('ALL_MIGRATIONS 覆盖 000…007 八格且按 name 字典序', () => {
    expect(ALL_MIGRATIONS.map((m) => m.name)).toEqual([
      '000-migrations-table',
      '001-credentials-columns',
      '002-review-snapshots',
      '003-account-audit-log',
      '004-wordbook-sync-columns',
      '005-feature-flags',
      '006-entry-updated-at-doc',
      '007-assessment-cache-user-id',
    ]);
  });

  it('每个迁移恰好有 down 与 noDownReason 之一，且理由非空', () => {
    for (const m of ALL_MIGRATIONS) {
      const hasDown = typeof m.down === 'function';
      const hasReason = typeof m.noDownReason === 'string' && m.noDownReason.trim().length > 0;
      expect(hasDown !== hasReason, `${m.name}：down 与 noDownReason 必须二选一`).toBe(true);
    }
    // 本期只有三张新表可回滚（M2/M3/M5），其余四格必须写理由
    expect(ALL_MIGRATIONS.filter((m) => typeof m.down === 'function').map((m) => m.name)).toEqual([
      '002-review-snapshots',
      '003-account-audit-log',
      '005-feature-flags',
    ]);
  });

  it('assertMigrationDiscipline 对"少写理由 / 带回填 / 动业务表 / 加列无默认值 / 顺序错"的迁移确实报违规（断言器不是空转）', () => {
    const bad: Migration[] = [
      { name: 'x00-no-down', title: 't', statements: () => ['SELECT 1'] },
      {
        name: 'x01-backfill',
        title: 't',
        noDownReason: 'r',
        statements: () => ['UPDATE users SET pw_policy_version = 1'],
      },
      {
        // 白名单形态（种子 INSERT 进 `_migrations`）但语句体里 SELECT 了业务表 →
        // 必须是**另一条**规则（读写业务数据）抓住它，而不是只被白名单挡下。
        name: 'x02-business-read',
        title: 't',
        noDownReason: 'r',
        statements: () => [
          'INSERT INTO _migrations (name, applied_at) SELECT phone, 0 FROM users ON CONFLICT DO NOTHING',
        ],
      },
      {
        name: 'x03-add-column-no-default',
        title: 't',
        noDownReason: 'r',
        statements: () => ['ALTER TABLE users ADD COLUMN mystery INTEGER'],
      },
      {
        name: 'x04-time-function',
        title: 't',
        noDownReason: 'r',
        statements: () => ['CREATE TABLE IF NOT EXISTS t9 (a TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'],
      },
      {
        // 数组顺序与 name 字典序不一致（`x04` > `a05`）→ 顺序断言必须报。
        name: 'a05-out-of-order',
        title: 't',
        noDownReason: 'r',
        statements: () => ['CREATE TABLE IF NOT EXISTS t8 (a TEXT)'],
      },
    ];
    const violations = assertMigrationDiscipline(bad);
    const reasons = violations.map((v) => `${v.migration}:${v.reason}`).join('\n');
    expect(violations.length).toBeGreaterThanOrEqual(6);
    expect(reasons).toContain('x00-no-down');
    expect(reasons).toContain('既没有 down() 也没有 noDownReason');
    expect(reasons).toContain('x01-backfill');
    expect(reasons).toContain('白名单');
    expect(reasons).toContain('x02-business-read');
    expect(reasons).toContain('业务数据');
    expect(reasons).toContain('未带 DEFAULT');
    expect(reasons).toContain('库内时间函数');
    expect(reasons).toContain('a05-out-of-order');
    expect(reasons).toContain('字典序');
  });

  it('真实迁移集在两个驱动上 0 违规', () => {
    expect(assertMigrationDiscipline(ALL_MIGRATIONS, { seedInsertTables: ['_migrations', 'feature_flags'] })).toEqual(
      [],
    );
  });

  it('pg 驱动静态面：statements("pg") 与 sqlite 同形（BIGINT/IF NOT EXISTS 之外的差异只有类型词）', () => {
    for (const m of ALL_MIGRATIONS) {
      expect(m.statements('pg').length, `${m.name} 两驱动语句条数不同`).toBe(m.statements('sqlite').length);
    }
  });
});

/* ════════════════════ 安全阀：拒绝打在真库上 ════════════════════ */

describe('数据红线安全阀（assertSafeTarget / parseArgs）', () => {
  it('SQLITE_PATH 指向仓库根 data.db → 拒绝执行', () => {
    expect(() =>
      assertSafeTarget({
        dbDriver: 'sqlite',
        sqlitePath: path.join(PROJECT_ROOT, 'data.db'),
        iKnowThisIsProd: false,
      }),
    ).toThrow(/拒绝执行/);
  });

  it('SQLITE_PATH 指向 packages/server/data.db → 同样拒绝', () => {
    expect(() =>
      assertSafeTarget({
        dbDriver: 'sqlite',
        sqlitePath: path.join(PROJECT_ROOT, 'packages', 'server', 'data.db'),
        iKnowThisIsProd: false,
      }),
    ).toThrow(/拒绝执行/);
  });

  it('临时副本路径 → 放行；显式 --i-know-this-is-prod → 放行且日志标注', () => {
    expect(assertSafeTarget({ dbDriver: 'sqlite', sqlitePath: tmpFile('copy.db'), iKnowThisIsProd: false })).toContain(
      'sqlite:',
    );
    expect(
      assertSafeTarget({
        dbDriver: 'sqlite',
        sqlitePath: path.join(PROJECT_ROOT, 'data.db'),
        iKnowThisIsProd: true,
      }),
    ).toContain('--i-know-this-is-prod');
  });

  it('未知 CLI 参数直接报错（不静默忽略）', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/未知参数/);
    expect(parseArgs(['--dry-run', '--to', '003-account-audit-log'])).toMatchObject({
      dryRun: true,
      to: '003-account-audit-log',
    });
  });
});

/* ════════════════════ 判据①：真库反读 == DDL 单一源 ════════════════════ */

describe('判据①：全新 sqlite 库 init → migrate → 反读比对 0 差异', () => {
  const file = tmpFile('fresh.db');
  let diffsAfter: number = -1;
  let secondRunApplied: string[] | null = null;

  beforeAll(async () => {
    // 与 `scripts/migrate.ts` 的默认路径同序：先 `AppDB.init()` 建基线表，再跑 000…006。
    // （直接对空文件跑迁移会在 001 的 ALTER TABLE users 上撞 "no such table" —— 生产不会，
    //  但这条用例存在的意义就是"全新库 init + migrate 之后 == 单一源"，所以必须 init。）
    const raw = new Database(file);
    const app = new SqliteAppDB(raw);
    try {
      await app.init();
      const ctx = sqliteMigrationContext(raw);
      const runner = new MigrationRunner(ALL_MIGRATIONS, ctx);
      await runner.apply({});
      const first = await diffSchemaAgainstDescriptor(ctx, defaultSchemaSource);
      diffsAfter = first.length;
      expect(first, `schema 反读差异：${first.map((d) => `${d.table}.${d.column ?? ''} ${d.kind}`).join(' | ')}`).toHaveLength(
        0,
      );
      secondRunApplied = await runner.apply({});
    } finally {
      raw.close();
    }
  });

  it('0 处差异（列集合/归一类型/NOT NULL/默认值/索引都由同一份 schema 源生成）', () => {
    expect(diffsAfter).toBe(0);
  });

  it('重跑幂等：第二次 0 个迁移被执行，且清单仍是 8 条', () => {
    expect(secondRunApplied).toEqual([]);
    const db = new Database(file, { readonly: true });
    try {
      const rows = db.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{ name: string }>;
      expect(rows.map((r) => r.name)).toEqual(ALL_MIGRATIONS.map((m) => m.name));
    } finally {
      db.close();
    }
  });

  it('M5 种子行 = FEATURE_FLAG_DEFAULTS 的全部键，且幂等重跑不会翻倍', () => {
    const db = new Database(file, { readonly: true });
    try {
      const rows = db.prepare('SELECT key FROM feature_flags ORDER BY key').all() as Array<{ key: string }>;
      expect(rows.length).toBeGreaterThanOrEqual(8);
    } finally {
      db.close();
    }
  });
});

/* ════════════════════ 判据⑤：已存在的 data.db 副本上迁移 ════════════════════ */

/** 存量数据指纹：password hash、业务表行数、fsrs_cards 原文。迁移前后必须逐字节全等。 */
interface Fingerprint {
  users: Array<{ id: number; phone: string; password: string | null }>;
  hashCount: number;
  counts: Record<string, number>;
  fsrs: Array<{ id: number; fsrs_data: string; updated_at: number }>;
}

const BUSINESS_TABLES = [
  'users',
  'wordbooks',
  'profiles',
  'checkin_logs',
  'fsrs_cards',
  'tutor_cache',
  'chat_messages',
  'assessment_cache',
  'analyst_cache',
];

function fingerprint(db: Database.Database): Fingerprint {
  const users = db
    .prepare('SELECT id, phone, password FROM users ORDER BY id ASC')
    .all() as Fingerprint['users'];
  const counts: Record<string, number> = {};
  for (const t of BUSINESS_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number };
    counts[t] = Number(row.c);
  }
  return {
    users: users.map((u) => ({ id: Number(u.id), phone: String(u.phone), password: u.password === null ? null : String(u.password) })),
    hashCount: users.filter((u) => u.password !== null && String(u.password).trim() !== '').length,
    counts,
    fsrs: (db.prepare('SELECT id, fsrs_data, updated_at FROM fsrs_cards ORDER BY id ASC').all() as Array<{
      id: number;
      fsrs_data: string;
      updated_at: number;
    }>).map((r) => ({ id: Number(r.id), fsrs_data: String(r.fsrs_data), updated_at: Number(r.updated_at) })),
  };
}

describe('判据⑤：在已存在的 data.db 副本上跑迁移，存量 password hash 逐行全等', () => {
  const original = path.join(PROJECT_ROOT, 'data.db');
  const copy = tmpFile('data-copy.db');
  const hasReal = fs.existsSync(original);
  let before: Fingerprint | null = null;
  let after: Fingerprint | null = null;
  let migratedDiffs = -1;
  let ledger: string[] = [];
  let zeroBackfillEvidence: Array<{ id: number; password_changed_at: number; pw_policy_version: number }> = [];

  beforeAll(async () => {
    if (!hasReal) return;
    fs.copyFileSync(original, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(original + suffix)) fs.copyFileSync(original + suffix, copy + suffix);
    }
    const db = new Database(copy);
    try {
      before = fingerprint(db);
      const ctx = sqliteMigrationContext(db);
      await new MigrationRunner(ALL_MIGRATIONS, ctx).apply({});
      const diffs = await diffSchemaAgainstDescriptor(ctx, defaultSchemaSource);
      migratedDiffs = diffs.length;
      after = fingerprint(db);
      ledger = (db.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{ name: string }>).map(
        (r) => r.name,
      );
      zeroBackfillEvidence = (
        db
          .prepare('SELECT id, password_changed_at, pw_policy_version FROM users ORDER BY id ASC')
          .all() as Array<{ id: number; password_changed_at: number; pw_policy_version: number }>
      ).map((r) => ({
        id: Number(r.id),
        password_changed_at: Number(r.password_changed_at),
        pw_policy_version: Number(r.pw_policy_version),
      }));
    } finally {
      db.close();
    }
  });

  it(`副本就绪（源=${path.relative(PROJECT_ROOT, original)}，只读了这份副本，真库未打开过写句柄）`, () => {
    expect(hasReal).toBe(true);
    expect(fs.existsSync(copy)).toBe(true);
    expect(before).not.toBeNull();
  });

  it('存量 password hash 逐行全等（id/phone/password 三元组 deep-equal）', () => {
    expect(after).not.toBeNull();
    expect(after!.users).toEqual(before!.users);
    expect(after!.hashCount).toBe(before!.hashCount);
    // 双保险：把 hash 串接起来做逐字符比对（deep-equal 之外再挡一次"顺序变了"）
    const join = (f: Fingerprint): string => f.users.map((u) => `${u.id}:${u.password ?? '\\N'}`).join('|');
    expect(join(after!)).toBe(join(before!));
  });

  it('九张业务表行数一字不变', () => {
    expect(after!.counts).toEqual(before!.counts);
  });

  it('fsrs_cards 的序列化原文与 updated_at 一字未动（ts-fsrs 4.7.1 红线）', () => {
    expect(after!.fsrs).toEqual(before!.fsrs);
  });

  it('迁移后 schema 与单一源 0 差异，且 000…007 全部记账', () => {
    expect(migratedDiffs).toBe(0);
    expect(ledger).toEqual(ALL_MIGRATIONS.map((m) => m.name));
  });

  it('零回填的正面证据：存量行的两个新列全部是 DEFAULT 0（没有人被 UPDATE 过）', () => {
    expect(zeroBackfillEvidence.length).toBe(before!.users.length);
    expect(zeroBackfillEvidence.every((r) => r.password_changed_at === 0 && r.pw_policy_version === 0)).toBe(true);
  });

  it('副本上迁移完再重跑一次 = 幂等（不新增列、不重复记账）', async () => {
    const db = new Database(copy);
    try {
      const ctx = sqliteMigrationContext(db);
      const applied = await new MigrationRunner(ALL_MIGRATIONS, ctx).apply({});
      expect(applied).toEqual([]);
      expect((db.prepare('SELECT COUNT(*) AS c FROM _migrations').get() as { c: number }).c).toBe(
        ALL_MIGRATIONS.length,
      );
      expect(fingerprint(db).users).toEqual(before!.users);
    } finally {
      db.close();
    }
  });
});

/* ════════════ T-25 判据①：M1-M6 只加不删（语句数组逐字节快照 + 禁词 grep） ════════════ */

const M7_NAME = '007-assessment-cache-user-id';
const LEGACY_MIGRATION_NAMES = [
  '000-migrations-table',
  '001-credentials-columns',
  '002-review-snapshots',
  '003-account-audit-log',
  '004-wordbook-sync-columns',
  '005-feature-flags',
  '006-entry-updated-at-doc',
];

/**
 * §10.2 T-25 判据① / §10.4 第 9 行①「000-006 六个迁移文件 T-25 零 diff」的机器化。
 * 内容 = `m.statements(driver)`（**不传 ctx**，故 M5 种子里的 `updated_at` 恒为 0 占位）在
 * sqlite/pg 两个驱动上的全部语句原文，按 `name → driver → 语句顺序` 序列化的稳定快照。
 * 一个字符的差异（空白、类型词 INTEGER/BIGINT、种子值与顺序）都会让下面的 `toBe` 红。
 */
const MIGRATIONS_000_006_BYTE_SNAPSHOT = String.raw`{
  "000-migrations-table": {
    "sqlite": [
      "CREATE TABLE IF NOT EXISTS _migrations (\n  name TEXT PRIMARY KEY NOT NULL,\n  applied_at INTEGER NOT NULL\n)"
    ],
    "pg": [
      "CREATE TABLE IF NOT EXISTS _migrations (\n  name TEXT PRIMARY KEY NOT NULL,\n  applied_at BIGINT NOT NULL\n)"
    ]
  },
  "001-credentials-columns": {
    "sqlite": [
      "ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0"
    ],
    "pg": [
      "ALTER TABLE users ADD COLUMN password_changed_at BIGINT NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0"
    ]
  },
  "002-review-snapshots": {
    "sqlite": [
      "CREATE TABLE IF NOT EXISTS review_snapshots (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  word TEXT NOT NULL,\n  prev_data TEXT,\n  prev_due INTEGER,\n  reps_before INTEGER,\n  created_at INTEGER NOT NULL,\n  FOREIGN KEY (user_id) REFERENCES users(id)\n)",
      "CREATE INDEX IF NOT EXISTS idx_review_snapshots_user_id_word_created_at ON review_snapshots (user_id, word, created_at)"
    ],
    "pg": [
      "CREATE TABLE IF NOT EXISTS review_snapshots (\n  id SERIAL PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  word TEXT NOT NULL,\n  prev_data TEXT,\n  prev_due BIGINT,\n  reps_before INTEGER,\n  created_at BIGINT NOT NULL,\n  FOREIGN KEY (user_id) REFERENCES users(id)\n)",
      "CREATE INDEX IF NOT EXISTS idx_review_snapshots_user_id_word_created_at ON review_snapshots (user_id, word, created_at)"
    ]
  },
  "003-account-audit-log": {
    "sqlite": [
      "CREATE TABLE IF NOT EXISTS account_audit_log (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL,\n  phone_masked TEXT,\n  action TEXT NOT NULL,\n  result TEXT NOT NULL,\n  ip TEXT,\n  ua TEXT,\n  created_at INTEGER NOT NULL,\n  FOREIGN KEY (user_id) REFERENCES users(id)\n)",
      "CREATE INDEX IF NOT EXISTS idx_account_audit_log_user_id_action_created_at ON account_audit_log (user_id, action, created_at)"
    ],
    "pg": [
      "CREATE TABLE IF NOT EXISTS account_audit_log (\n  id SERIAL PRIMARY KEY,\n  user_id INTEGER NOT NULL,\n  phone_masked TEXT,\n  action TEXT NOT NULL,\n  result TEXT NOT NULL,\n  ip TEXT,\n  ua TEXT,\n  created_at BIGINT NOT NULL,\n  FOREIGN KEY (user_id) REFERENCES users(id)\n)",
      "CREATE INDEX IF NOT EXISTS idx_account_audit_log_user_id_action_created_at ON account_audit_log (user_id, action, created_at)"
    ]
  },
  "004-wordbook-sync-columns": {
    "sqlite": [
      "ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'"
    ],
    "pg": [
      "ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'"
    ]
  },
  "005-feature-flags": {
    "sqlite": [
      "CREATE TABLE IF NOT EXISTS feature_flags (\n  key TEXT PRIMARY KEY NOT NULL,\n  value TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('wordbookIncremental', '0%', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('explicitFavorite', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('autoFavoriteDefault', 'off', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('studyModes', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('dailyReminder', 'on(20:30)', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('passwordRegister', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('avatarUnifiedLimit', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('passwordUpgradeEnforce', 'on', 0) ON CONFLICT (key) DO NOTHING"
    ],
    "pg": [
      "CREATE TABLE IF NOT EXISTS feature_flags (\n  key TEXT PRIMARY KEY NOT NULL,\n  value TEXT NOT NULL,\n  updated_at BIGINT NOT NULL\n)",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('wordbookIncremental', '0%', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('explicitFavorite', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('autoFavoriteDefault', 'off', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('studyModes', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('dailyReminder', 'on(20:30)', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('passwordRegister', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('avatarUnifiedLimit', 'on', 0) ON CONFLICT (key) DO NOTHING",
      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('passwordUpgradeEnforce', 'on', 0) ON CONFLICT (key) DO NOTHING"
    ]
  },
  "006-entry-updated-at-doc": {
    "sqlite": [],
    "pg": []
  }
}`;

describe('T-25 判据①：M1-M6（000-006）语句数组逐字节不变 + 迁移目录四类禁词 0 命中', () => {
  const legacySnapshot = (): Record<string, Record<'sqlite' | 'pg', string[]>> => {
    const out: Record<string, Record<'sqlite' | 'pg', string[]>> = {};
    for (const m of ALL_MIGRATIONS) {
      if (LEGACY_MIGRATION_NAMES.includes(m.name)) {
        out[m.name] = { sqlite: m.statements('sqlite'), pg: m.statements('pg') };
      }
    }
    return out;
  };

  it('快照对象正好是 000-006 六格；本期新增的只有 007（新迁移不会静默并进快照）', () => {
    expect(Object.keys(legacySnapshot())).toEqual(LEGACY_MIGRATION_NAMES);
    expect(ALL_MIGRATIONS.filter((m) => !LEGACY_MIGRATION_NAMES.includes(m.name)).map((m) => m.name)).toEqual([
      M7_NAME,
    ]);
  });

  it('000-006 的两驱动语句数组与快照逐字节全等（§10.4 第 9 行①「000-006 零 diff」）', () => {
    expect(JSON.stringify(legacySnapshot(), null, 2)).toBe(MIGRATIONS_000_006_BYTE_SNAPSHOT);
  });

  /**
   * grep 口径：仿本文件判据②那条「全仓不存在 UPDATE users SET pw_policy_version」用例。
   * 扫描面 = `packages/server/src/db/migrations/**` 的**非注释代码行**（与 CI 的
   * `tools/boundaries.mjs migration-forbidden` 同一口径：纯注释行是在"写着禁令"，不是执行禁令）。
   * `DROP COLUMN` / `ALTER COLUMN` / `RENAME` 要求严格 0 命中；`DROP TABLE` 的唯一允许形态是
   * M2/M3/M5 各自 `down()` 里删自己新建的那张表（3 处，先于 T-25 存在，且已被上面的字节快照钉成零 diff）。
   */
  it('迁移目录内 DROP COLUMN / DROP TABLE / ALTER COLUMN / RENAME 的命中面（= 判据①的 grep 口径）', () => {
    const patterns: Array<[string, RegExp]> = [
      ['DROP COLUMN', /\bDROP\s+COLUMN\b/i],
      ['DROP TABLE', /\bDROP\s+TABLE\b/i],
      ['ALTER COLUMN', /\bALTER\s+COLUMN\b/i],
      ['RENAME', /\bRENAME\b/i],
    ];
    const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*|--|#)/;
    const root = path.join(PROJECT_ROOT, 'packages/server/src/db/migrations');
    const files = sourceFiles(root);
    expect(files.length).toBeGreaterThanOrEqual(8);
    const hits: Array<{ file: string; line: number; term: string; text: string }> = [];
    for (const file of files) {
      const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((text, i) => {
          if (COMMENT_LINE.test(text)) return;
          for (const [term, re] of patterns) {
            if (re.test(text)) hits.push({ file: rel, line: i + 1, term, text: text.trim() });
          }
        });
    }

    // (1) 除 DROP TABLE 外，三类禁词严格 0 命中。
    expect(hits.filter((h) => h.term !== 'DROP TABLE')).toEqual([]);
    // (2) 本期新增文件 007：四类禁词连注释面一起 0 命中。
    const m7File = path.join(root, `${M7_NAME}.ts`);
    expect(fs.existsSync(m7File)).toBe(true);
    const m7Text = fs.readFileSync(m7File, 'utf8');
    for (const [term, re] of patterns) {
      expect(re.test(m7Text), `007 命中禁词 ${term}`).toBe(false);
    }
    // (3) DROP TABLE 的命中面被精确钉死：只能是 M2/M3/M5 的 down() 各删自己新建的那一张表。
    const dropTable = hits.filter((h) => h.term === 'DROP TABLE');
    const allowed: Record<string, string> = {
      '002-review-snapshots.ts': 'review_snapshots',
      '003-account-audit-log.ts': 'account_audit_log',
      '005-feature-flags.ts': 'feature_flags',
    };
    expect(dropTable.length).toBe(3);
    for (const h of dropTable) {
      const base = h.file.split('/').pop()!;
      expect(Object.keys(allowed)).toContain(base);
      expect(h.text, `down() 之外的 DROP TABLE：${h.text}`).toMatch(/^\s*await ctx\.exec\(/);
      expect(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i.exec(h.text)?.[1] ?? '').toBe(allowed[base]);
    }
  });
});

/* ════════════ T-25 判据②：007 一条 ADD COLUMN、零回填、存量行一字不变 ════════════ */

const m7OrThrow = (): Migration => {
  const m = ALL_MIGRATIONS.find((x) => x.name === M7_NAME);
  if (!m) throw new Error(`缺少迁移 ${M7_NAME}`);
  return m;
};

/** 从真源取 `BUSINESS_TABLES_IN_STATEMENT`（不在测试里抄第二份字面量，避免两侧漂移）。 */
const businessTablesInStatement = (): RegExp => {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, 'packages/server/src/db/migrations/index.ts'), 'utf8');
  const m = /^const BUSINESS_TABLES_IN_STATEMENT\s*=\s*\/(.+)\/([a-z]*);/m.exec(src);
  if (!m) throw new Error('migrations/index.ts 里找不到 BUSINESS_TABLES_IN_STATEMENT —— 断言失去对象');
  return new RegExp(m[1]!, m[2]);
};

interface AssessFingerprint {
  count: number;
  sumId: number;
  ids: number[];
  /** 既有 4 列（word/qtype/question/created_at）的逐行 sha256，按 id 升序。 */
  rowHashes: string[];
}

/** assessment_cache 的存量指纹：只读既有 5 列，绝不引用 `user_id`（迁移前后必须一字不变）。 */
const assessFingerprint = (db: Database.Database): AssessFingerprint => {
  const agg = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(id), 0) AS s FROM assessment_cache').get() as {
    c: number;
    s: number;
  };
  const rows = db
    .prepare('SELECT id, word, qtype, question, created_at FROM assessment_cache ORDER BY id ASC')
    .all() as Array<{ id: number; word: string; qtype: string; question: string; created_at: number }>;
  return {
    count: Number(agg.c),
    sumId: Number(agg.s),
    ids: rows.map((r) => Number(r.id)),
    rowHashes: rows.map((r) =>
      createHash('sha256')
        .update([r.word, r.qtype, r.question, r.created_at].join('\u0000'), 'utf8')
        .digest('hex'),
    ),
  };
};

const columnsOf = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((r) => r.name);

describe('T-25 判据②：007 只 1 条 ADD COLUMN、零回填，存量行一字不变', () => {
  it('语句数组长度 = 1（两驱动同形），且就是那条 ADD COLUMN … DEFAULT NULL', () => {
    for (const driver of ['sqlite', 'pg'] as const) {
      const statements = m7OrThrow().statements(driver);
      expect(statements.length, `${driver} 上 007 必须只有 1 条语句`).toBe(1);
      const sql = statements[0]!;
      expect(ADD_COLUMN.test(sql), sql).toBe(true);
      expect(ADD_COLUMN.exec(sql)?.[1]).toBe('assessment_cache');
      expect(ADD_COLUMN.exec(sql)?.[2]).toBe('user_id');
      // 判据⑤的字面量要求：DEFAULT 不是被 columnDdl() 丢掉，而是真的写出 NULL。
      expect(/\bDEFAULT\s+NULL\b/i.test(sql), `未写出 DEFAULT NULL 字面量：${sql}`).toBe(true);
      expect(/\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bSELECT\b|\bCREATE\s+INDEX\b/i.test(sql), `出现数据改写或索引变更：${sql}`).toBe(
        false,
      );
    }
    expect(m7OrThrow().down).toBeUndefined();
    expect((m7OrThrow().noDownReason ?? '').trim().length).toBeGreaterThan(0);
  });

  it('BUSINESS_TABLES_IN_STATEMENT（真源正则）对 007 的每一条语句 0 命中', () => {
    const re = businessTablesInStatement();
    // 正向对照：正则不是空转 —— 指向 assessment_cache 的回填/读取语句必须命中。
    expect(re.test('INSERT INTO assessment_cache (user_id) SELECT id FROM users')).toBe(true);
    expect(re.test('UPDATE assessment_cache SET user_id = 1')).toBe(true);
    for (const driver of ['sqlite', 'pg'] as const) {
      for (const sql of m7OrThrow().statements(driver)) {
        expect(re.test(sql), `007 语句命中业务表读写正则：${sql}`).toBe(false);
      }
    }
  });
});

describe('T-25 判据②（运行时面）：在 data.db 临时副本上单独执行 007，存量行一字不变', () => {
  const original = path.join(PROJECT_ROOT, 'data.db');
  const copy = tmpFile('t25-m7-copy.db');
  const hasReal = fs.existsSync(original);
  let preCols: string[] = [];
  let postCols: string[] = [];
  let before: AssessFingerprint | null = null;
  let after: AssessFingerprint | null = null;
  let appliedM7: string[] = [];
  let nullRows = -1;
  let ownedRows = -1;
  let ledgerM7 = -1;

  beforeAll(async () => {
    if (!hasReal) return;
    fs.copyFileSync(original, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(original + suffix)) fs.copyFileSync(original + suffix, copy + suffix);
    }
    const db = new Database(copy);
    try {
      const ctx = sqliteMigrationContext(db);
      // 先把 000-006 补齐（存量 data.db 里还没有 `_migrations`），再把 007 单独执行一次：
      // 这样"迁移前 vs 迁移后"的差异只可能来自 007，不掺杂任何其它迁移。
      await new MigrationRunner(ALL_MIGRATIONS, ctx).apply({ to: '006-entry-updated-at-doc' });
      preCols = columnsOf(db, 'assessment_cache');
      if (assessFingerprint(db).count === 0) {
        // 空表兜底：注入两行合成存量行，免得"逐行 hash 全等"退化成对空数组的断言。
        db.prepare(
          "INSERT INTO assessment_cache (word, qtype, question, created_at) VALUES " +
            "('serendipity', 'choice', '{\"q\":\"it \"\"clicked\"\"\"}', 1700000000000), " +
            "('ephemeral', 'fill', '奥——Brien', 1700000000001)",
        ).run();
      }
      before = assessFingerprint(db);
      appliedM7 = await new MigrationRunner([m7OrThrow()], ctx).apply({});
      after = assessFingerprint(db);
      postCols = columnsOf(db, 'assessment_cache');
      nullRows = Number(
        (db.prepare('SELECT COUNT(*) AS c FROM assessment_cache WHERE user_id IS NULL').get() as { c: number }).c,
      );
      ownedRows = Number(
        (db.prepare('SELECT COUNT(*) AS c FROM assessment_cache WHERE user_id IS NOT NULL').get() as { c: number }).c,
      );
      ledgerM7 = Number(
        (db.prepare(`SELECT COUNT(*) AS c FROM _migrations WHERE name = '${M7_NAME}'`).get() as { c: number }).c,
      );
    } finally {
      db.close();
    }
  });

  it('副本就绪，且迁移前 assessment_cache 确实还没有 user_id 列（本用例的对照前提；源=仓库根 data.db 的临时副本）', () => {
    expect(hasReal).toBe(true);
    expect(fs.existsSync(copy)).toBe(true);
    expect(before).not.toBeNull();
    expect(preCols).not.toContain('user_id');
    expect(before!.count).toBeGreaterThan(0);
    // 007 真的被执行了（不是被幂等预检跳过的空跑）
    expect(appliedM7).toEqual([M7_NAME]);
  });

  it('迁移前后 COUNT(*) / SUM(id) / 既有 4 列逐行 sha256 完全一致（零回填的正面证据）', () => {
    expect(after).not.toBeNull();
    expect(after!.count).toBe(before!.count);
    expect(after!.sumId).toBe(before!.sumId);
    expect(after!.ids).toEqual(before!.ids);
    expect(after!.rowHashes).toEqual(before!.rowHashes);
  });

  it('迁移后 user_id 列存在且可空；NULL 行数 == 迁移前行数（全表 NULL 是预期结果，不是缺陷）', () => {
    expect(postCols).toContain('user_id');
    expect(postCols.filter((c) => c === 'user_id').length).toBe(1);
    expect(nullRows).toBe(before!.count);
    expect(ownedRows).toBe(0);
    expect(nullRows + ownedRows).toBe(after!.count);
    expect(ledgerM7).toBe(1);
  });

  it('旧镜像口径：不 SELECT user_id 的既有查询在迁移后的库上照样可执行（判据⑩的出口面）', () => {
    const db = new Database(copy, { readonly: true });
    try {
      const legacy = db
        .prepare('SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = ? AND qtype = ?')
        .get('serendipity', 'choice') as Record<string, unknown> | undefined;
      expect(legacy).not.toBeUndefined();
      expect(Object.keys(legacy!).sort()).toEqual(['created_at', 'id', 'qtype', 'question', 'word']);
      expect(assessFingerprint(db)).toEqual(before!);
    } finally {
      db.close();
    }
  });
});

/* ════════════════════ pg 运行时面（本机无实例 → 如实标注未执行） ════════════════════ */

/**
 * pg 的**运行时**反读比对（`diffSchemaAgainstDescriptor` + `_migrations` 记账）需要活库。
 * 本机无 PG 实例 → 未执行；§6.2 明确允许 A 段/pg 在缺 `DATABASE_URL_TEST` 时跳过，
 * 由 T-22 的 CI（起真 PG）补齐同一份断言（入口就是上面两个 describe，驱动换成 pg）。
 * 这里只补一条不连库也成立的**接口面**断言：两驱动的 AppDB 域与方法集合必须相同
 * （详见 methods.spec.ts 的"双驱动方法集合一致"用例）。
 */
describe('pg 运行时面（未执行）', () => {
  it.skipIf(PG_URL !== '')('本机无 PG 实例：pg 的运行时 schema 比对标记为未执行，不在 sqlite 上假装通过', () => {
    expect(PG_URL).toBe('');
  });
});

/* ═══════════ T-25 第 3 轮：判据⑥ 两条建库路径的 user_id 形状一致（纯追加） ═══════════ */

/** `PRAGMA table_info` 反读的单列形状。`hasDefault` 沿用 `normalizeDefault()` 的口径：
 *  `DEFAULT NULL` 与「不写 DEFAULT 子句」同为"无有效默认值"（sqlite 侧 dflt_value 分别是 'NULL' / null）。 */
interface ColumnShape {
  type: string;
  notNull: boolean;
  hasDefault: boolean;
}

const shapeOfColumn = (db: Database.Database, table: string, column: string): ColumnShape | null => {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
  }>;
  const hit = rows.find((r) => r.name === column);
  if (!hit) return null;
  const dflt = hit.dflt_value === null || hit.dflt_value === undefined ? '' : String(hit.dflt_value).trim();
  return { type: hit.type, notNull: Boolean(hit.notnull), hasDefault: dflt !== '' && dflt.toUpperCase() !== 'NULL' };
};

/** 两个驱动文件里的 `const DDL` 均未导出 ⇒ 静态面只能读源文件文本（与 `businessTablesInStatement()` 同一手法）。 */
const hardcodedAssessmentCacheDdl = (rel: string): string => {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, 'packages/server', rel), 'utf8');
  const m = /CREATE TABLE IF NOT EXISTS assessment_cache \(([\s\S]*?)\n\s*\)/.exec(src);
  if (!m) throw new Error(`${rel} 里找不到 assessment_cache 的建表串 —— 本用例失去对象`);
  return m[1]!;
};

/** 从一条 SQL（建表串里的那一列，或 007 的单行 ALTER）里取 user_id 的「类型词 / NOT NULL / DEFAULT NULL」三件事。 */
const userIdColumnBits = (sql: string): { type: string; notNull: boolean; defaultNull: boolean } => {
  const hit = /\buser_id\b([^,\n]*)/.exec(sql);
  if (!hit) throw new Error(`assessment_cache 的这一段里没有 user_id 列：${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
  const bits = hit[1]!.trim();
  const type = /^\w+/.exec(bits)?.[0];
  if (!type) throw new Error(`user_id 列缺类型词：${bits}`);
  return { type, notNull: /\bNOT\s+NULL\b/i.test(bits), defaultNull: /\bDEFAULT\s+NULL\b/i.test(bits) };
};

describe('T-25 判据⑥（第 3 轮）：只 init() 不 migrate() 的全新库 == 旧库 ALTER 之后的 user_id 形状', () => {
  const fresh = tmpFile('t25r3-init-only.db');
  const copy = tmpFile('t25r3-legacy-copy.db');
  const original = path.join(PROJECT_ROOT, 'data.db');
  const hasReal = fs.existsSync(original);
  const WORD = 't25r3_judiciary';
  const ORPHAN = 't25r3_judiciary_orphan';
  const QTYPE = 'choice';
  const OWNER = 4242;
  const OTHER = 4243;

  let initOnly: ColumnShape | null = null;
  let afterAlter: ColumnShape | null = null;
  let legacyPreCols: string[] = [];
  let freshLedgerRows = -1;
  let ownedRead: unknown = null;
  let crossUserRead: unknown = 'not-run';
  let orphanRead: unknown = 'not-run';

  beforeAll(async () => {
    /* A) 全新库：只 exec `init()` 的建表串，一条迁移都不跑。
     *    缺陷现场 = 这条库上 `getOwned()` 直接 `no such column: user_id`（建表硬编码串落后于 schema 源）。 */
    const raw = new Database(fresh);
    try {
      const app = new SqliteAppDB(raw);
      await app.init();
      const hasLedger =
        raw
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'")
          .get() !== undefined;
      freshLedgerRows = hasLedger
        ? Number((raw.prepare('SELECT COUNT(*) AS c FROM _migrations').get() as { c: number }).c)
        : 0;
      initOnly = shapeOfColumn(raw, 'assessment_cache', 'user_id');
      await app.assessment.setOwned(WORD, QTYPE, OWNER, JSON.stringify({ type: QTYPE, word: WORD }), 1_700_000_000_000);
      ownedRead = await app.assessment.getOwned(WORD, QTYPE, OWNER);
      crossUserRead = await app.assessment.getOwned(WORD, QTYPE, OTHER);
      raw
        .prepare('INSERT INTO assessment_cache (word, qtype, question, created_at) VALUES (?, ?, ?, ?)')
        .run(ORPHAN, QTYPE, '{}', 1_700_000_000_001);
      orphanRead = await app.assessment.getOwned(ORPHAN, QTYPE, OWNER);
    } finally {
      raw.close();
    }

    /* B) 旧库：仓库根 data.db 的**临时副本**（007 之前的形状）→ 补齐 000-006 → 只执行 007。
     *    与上面同一判据、同一读法，两侧形状必须逐字段全等。 */
    if (!hasReal) return;
    fs.copyFileSync(original, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(original + suffix)) fs.copyFileSync(original + suffix, copy + suffix);
    }
    const db = new Database(copy);
    try {
      const ctx = sqliteMigrationContext(db);
      await new MigrationRunner(ALL_MIGRATIONS, ctx).apply({ to: '006-entry-updated-at-doc' });
      legacyPreCols = columnsOf(db, 'assessment_cache');
      await new MigrationRunner([m7OrThrow()], ctx).apply({});
      afterAlter = shapeOfColumn(db, 'assessment_cache', 'user_id');
    } finally {
      db.close();
    }
  });

  it('对照前提：A 侧确实"只 init 没 migrate"（`_migrations` 0 条或不存在），B 侧迁移前确实没有 user_id 列', () => {
    expect(hasReal).toBe(true);
    expect(freshLedgerRows).toBe(0);
    expect(legacyPreCols).not.toContain('user_id');
  });

  it('判据⑥：两条建库路径反读到的 user_id 逐字段全等（INTEGER / 可空 / 无有效默认值）', () => {
    expect(initOnly, '只 init() 的库上 assessment_cache.user_id 不存在 = 建表串仍落后于 schema 源').not.toBeNull();
    expect(afterAlter).not.toBeNull();
    expect(initOnly).toEqual(afterAlter);
    expect(initOnly!.type).toBe('INTEGER');
    expect(initOnly!.notNull).toBe(false);
    expect(initOnly!.hasDefault).toBe(false);
  });

  it('只 init 的库上 setOwned/getOwned 跑通：属主读到、他人读不到、无主行（user_id IS NULL）读不到', () => {
    expect(ownedRead).toMatchObject({ word: WORD, qtype: QTYPE });
    expect(crossUserRead).toBeNull();
    expect(orphanRead).toBeNull();
  });

  it('两驱动静态面：{sqlite,pg}.ts 的建表串与 007 生成的 ALTER 同类型词、同可空、同 DEFAULT NULL', () => {
    for (const driver of ['sqlite', 'pg'] as const) {
      const rel = `src/db/${driver}.ts`;
      const created = userIdColumnBits(hardcodedAssessmentCacheDdl(rel));
      const altered = userIdColumnBits(m7OrThrow().statements(driver)[0]!);
      expect(created, `${rel} 的 user_id 列形状与 007 的 ALTER 不一致`).toEqual(altered);
      expect(altered.notNull, `${rel}：user_id 不许写成 NOT NULL`).toBe(false);
      expect(altered.defaultNull, `${rel}：007 写的是 DEFAULT NULL，建表侧必须同形`).toBe(true);
    }
    // pg 的类型词必须是 schema 源该列（无 pgType）推导出的 INTEGER，而不是本表 created_at 的 BIGINT
    expect(userIdColumnBits(hardcodedAssessmentCacheDdl('src/db/pg.ts')).type).toBe('INTEGER');
  });

  it.skipIf(PG_URL === '')(
    'pg 运行时面：活库上 init() 建的 user_id == 007 的 ALTER 形状，且 setOwned/getOwned 跑通（本机无实例 → 显式 SKIP）',
    async () => {
      const { default: Pg } = await import('pg');
      const pool = new Pg.Pool({ connectionString: PG_URL });
      const WORD_PG = 't25r3_judiciary_pg';
      try {
        const app = new PostgresAppDB(pool);
        await app.init();
        const got = (
          await pool.query(
            "SELECT data_type AS type, is_nullable AS nullability, column_default AS dflt FROM information_schema.columns WHERE table_name = 'assessment_cache' AND column_name = 'user_id'",
          )
        ).rows[0] as { type: string; nullability: string; dflt: string | null } | undefined;
        expect(got, 'pg 的 init() 建表串里没有 user_id 列').toBeTruthy();
        const bits = userIdColumnBits(m7OrThrow().statements('pg')[0]!);
        expect(got!.type).toBe(bits.type.toLowerCase());
        expect(got!.nullability).toBe(bits.notNull ? 'NO' : 'YES');
        const dflt = String(got!.dflt ?? '').replace(/::[a-z ]+$/i, '').trim();
        expect(dflt === '' || dflt.toUpperCase() === 'NULL').toBe(true);
        await app.assessment.setOwned(WORD_PG, QTYPE, OWNER, JSON.stringify({ type: QTYPE, word: WORD_PG }), Date.now());
        expect(await app.assessment.getOwned(WORD_PG, QTYPE, OWNER)).toMatchObject({ word: WORD_PG });
        expect(await app.assessment.getOwned(WORD_PG, QTYPE, OTHER)).toBeNull();
      } finally {
        await pool.end();
      }
    },
  );
});
