/**
 * 数据库迁移与搬迁脚本（T-06 重写：DDL 迁移为主，历史数据搬迁改为显式开关）
 *
 * 默认动作（不带任何 flag）：
 *   ① 静态自检 `assertMigrationDiscipline()`（判据②③）—— 不连库就能 exit 1；
 *   ② 按 `_migrations` 清单执行未应用的迁移（000…006，一条迁移 = 一个事务）；
 *   ③ 用真库反读并与 `packages/shared/src/schema/tables.ts` 比对（缺表/缺列即 exit 1）。
 * **默认路径不读写任何业务数据**。
 *
 * 用法：
 *   pnpm --filter @tm/server migrate                      # 按 config 的驱动跑 DDL 迁移
 *   DB_DRIVER=sqlite SQLITE_PATH=./tmp/copy.db pnpm --filter @tm/server migrate -- --dry-run
 *   pnpm --filter @tm/server migrate -- --status          # 只看清单与待执行项
 *   pnpm --filter @tm/server migrate -- --to 003-account-audit-log
 *   pnpm --filter @tm/server migrate -- --rollback 005-feature-flags --allow-rollback
 *   pnpm --filter @tm/server migrate -- --verify-data     # M6：整数组 dry-parse（只读，不写）
 *   pnpm --filter @tm/server migrate -- --copy-legacy     # 旧 data.db → 当前库（历史能力，保留）
 *   pnpm --filter @tm/server migrate -- --init-fsrs       # FSRS 卡片初始化（历史能力，保留）
 *
 * 安全阀（PRD §6.4-2 步 6b / §6.1 红线）：
 *   - `SQLITE_PATH` 落在**仓库根 `data.db`** 或 **`packages/server/data.db`** 时直接拒绝执行，
 *     除非同时给 `--i-know-this-is-prod`。演练一律 `cp` 到临时副本后再跑。
 *   - `--rollback` 需要 `--allow-rollback`（生产窗口内禁执行，见 M2/M3/M5 的 down 注记）。
 *   - `--copy-legacy` / `--init-fsrs` / `--verify-data` 会读写业务数据，因此**不在默认路径上**。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import type pg from 'pg';
import type { WordbookEntry } from '@tm/shared';
import { loadConfig, PROJECT_ROOT } from '../config.js';
import { createAppDB, createMigrationContext } from '../db/index.js';
import {
  assertMigrationDiscipline,
  diffSchemaAgainstDescriptor,
  formatSchemaDiffs,
  MigrationRunner,
  type Migration,
} from '../db/migrations/index.js';
import { migration as m000 } from '../db/migrations/000-migrations-table.js';
import { migration as m001 } from '../db/migrations/001-credentials-columns.js';
import { migration as m002 } from '../db/migrations/002-review-snapshots.js';
import { migration as m003 } from '../db/migrations/003-account-audit-log.js';
import { migration as m004 } from '../db/migrations/004-wordbook-sync-columns.js';
import { migration as m005 } from '../db/migrations/005-feature-flags.js';
import { migration as m006, verifyWordbookEntryDoc } from '../db/migrations/006-entry-updated-at-doc.js';
import { migration as m007 } from '../db/migrations/007-assessment-cache-user-id.js';
import { defaultSchemaSource } from '@tm/shared/schema';
// 注意：**不许**在这里静态 `import { initFsrsCards } from './init-fsrs.js'`。
// `init-fsrs.ts` 的 `main()` 是顶层无护栏执行（越界申请 X-T06-1），静态 import 会让
// "只跑 DDL 迁移"这条默认路径连带触发一次 FSRS 卡片**写入**，目标 = 当时的默认 config
// （未设 SQLITE_PATH 时即仓库根 `data.db`）。改成 --init-fsrs 分支内的动态 import，
// 默认路径与 `--status`/`--dry-run` 都碰不到它。

/** 执行顺序 = 数组顺序（name 字典序一致性由静态自检断言）。 */
export const ALL_MIGRATIONS: Migration[] = [m000, m001, m002, m003, m004, m005, m006, m007];

/** 允许被幂等种子 INSERT 的表（= 本期新建表 + 清单表）。 */
const SEED_INSERT_TABLES = ['_migrations', 'feature_flags'];

export interface MigrateArgs {
  status: boolean;
  dryRun: boolean;
  to?: string;
  rollback?: string;
  allowRollback: boolean;
  verifyData: boolean;
  copyLegacy: boolean;
  initFsrs: boolean;
  iKnowThisIsProd: boolean;
}

export function parseArgs(argv: string[]): MigrateArgs {
  const out: MigrateArgs = {
    status: false,
    dryRun: false,
    allowRollback: false,
    verifyData: false,
    copyLegacy: false,
    initFsrs: false,
    iKnowThisIsProd: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = (): string | undefined => argv[(i += 1)];
    switch (a) {
      case '--status':
        out.status = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--to':
        out.to = next();
        break;
      case '--rollback':
        out.rollback = next();
        break;
      case '--allow-rollback':
        out.allowRollback = true;
        break;
      case '--verify-data':
        out.verifyData = true;
        break;
      case '--copy-legacy':
        out.copyLegacy = true;
        break;
      case '--init-fsrs':
        out.initFsrs = true;
        break;
      case '--i-know-this-is-prod':
        out.iKnowThisIsProd = true;
        break;
      default:
        throw new Error(`未知参数 ${String(a)}（可用：--status --dry-run --to --rollback --allow-rollback --verify-data --copy-legacy --init-fsrs --i-know-this-is-prod）`);
    }
  }
  return out;
}

/** 真库路径（PRD §9-3 里被点名"不许直接动"的两个位置）。 */
export const protectedSqlitePaths = (): string[] => [
  path.resolve(PROJECT_ROOT, 'data.db'),
  path.resolve(PROJECT_ROOT, 'packages', 'server', 'data.db'),
];

/**
 * 数据红线守卫：拒绝把迁移直接打在仓库里的真库文件上。
 * @throws Error 命中受保护路径且未显式 `--i-know-this-is-prod`
 */
export function assertSafeTarget(args: { dbDriver: string; sqlitePath: string; iKnowThisIsProd: boolean }): string {
  if (args.dbDriver !== 'sqlite') {
    return `pg（DATABASE_URL 决定目标库，日志里已脱敏打印）`;
  }
  const target = path.resolve(args.sqlitePath);
  if (!protectedSqlitePaths().includes(target)) return `sqlite:${target}`;
  if (!args.iKnowThisIsProd) {
    throw new Error(
      `拒绝执行：SQLITE_PATH 指向仓库内的真库文件 ${target}。\n` +
        '  演练/验收一律先 cp 到临时副本再跑（PRD §6.4-2 步 6b①）；\n' +
        '  确实要对这个文件动手，才加 --i-know-this-is-prod。',
    );
  }
  return `sqlite:${target}（已被 --i-know-this-is-prod 放行）`;
}

/* ───────────────────── 历史能力：旧 data.db → 当前库（显式开关） ───────────────────── */

interface OldUserRow {
  id: number;
  phone: string;
  password: string | null;
  created_at: number;
}

interface OldWordbookRow {
  user_id: number;
  data: string;
  updated_at: number;
}

interface OldProfileRow {
  user_id: number;
  nickname: string;
  avatar: string;
  daily_goal: number | null;
  updated_at: number;
}

interface OldCheckinRow {
  user_id: number;
  date: string;
  created_at: number;
}

/** 从旧 data.db 读取全部用户数据 */
function readLegacySqlite(dbPath: string): {
  users: OldUserRow[];
  wordbooks: OldWordbookRow[];
  profiles: OldProfileRow[];
  checkins: OldCheckinRow[];
} | null {
  if (!fs.existsSync(dbPath)) return null;
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('wal_checkpoint(TRUNCATE)');

    const hasTables = (name: string): boolean => {
      const row = sqlite
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
        .get(name) as { ok: number } | undefined;
      return !!row;
    };

    return {
      users: hasTables('users') ? (sqlite.prepare('SELECT * FROM users').all() as OldUserRow[]) : [],
      wordbooks: hasTables('wordbooks')
        ? (sqlite.prepare('SELECT * FROM wordbooks').all() as OldWordbookRow[])
        : [],
      profiles: hasTables('profiles')
        ? (sqlite.prepare('SELECT * FROM profiles').all() as OldProfileRow[])
        : [],
      checkins: hasTables('checkin_logs')
        ? (sqlite.prepare('SELECT * FROM checkin_logs').all() as OldCheckinRow[])
        : [],
    };
  } finally {
    sqlite.close();
  }
}

async function migrateLegacyToPg(dbPath: string): Promise<void> {
  const legacy = readLegacySqlite(dbPath);
  if (!legacy) {
    console.log('[Migrate] 未找到旧版 data.db，跳过用户数据迁移');
    return;
  }

  const db = createAppDB();

  console.log(`[Migrate] users: ${legacy.users.length}`);
  for (const u of legacy.users) {
    try {
      const existing = await db.users.findById(u.id);
      if (existing) {
        if (u.password && existing.password !== u.password) {
          await db.users.updatePassword(u.id, u.password);
        }
        continue;
      }
      // 通过直接 SQL 保留原 id（AppDB 未暴露按 id 插入，走底层 pool）
      await insertUserWithId(db, u);
    } catch (err) {
      console.error(`  [ERROR] user ${u.id} (${u.phone}): ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] wordbooks: ${legacy.wordbooks.length}`);
  for (const w of legacy.wordbooks) {
    try {
      await db.wordbooks.saveData(w.user_id, safeParse(w.data), w.updated_at);
    } catch (err) {
      console.error(`  [ERROR] wordbook ${w.user_id}: ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] profiles: ${legacy.profiles.length}`);
  for (const p of legacy.profiles) {
    try {
      await db.profiles.update(
        p.user_id,
        { nickname: p.nickname || undefined, avatar: p.avatar || undefined, daily_goal: p.daily_goal ?? undefined },
        p.updated_at,
      );
      await db.profiles.ensure(p.user_id);
    } catch (err) {
      console.error(`  [ERROR] profile ${p.user_id}: ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] checkin_logs: ${legacy.checkins.length}`);
  for (const c of legacy.checkins) {
    try {
      await db.checkins.checkin(c.user_id, c.date, c.created_at);
    } catch (err) {
      console.error(`  [ERROR] checkin ${c.user_id} ${c.date}: ${(err as Error).message}`);
    }
  }

  await resetUserSequence(db);
  console.log('[Migrate] 用户数据迁移完成');
}

/** 兼容旧 migrate-pg.js：保留原 id 插入用户（通过 pg 底层 pool 直接执行） */
async function insertUserWithId(
  db: Awaited<ReturnType<typeof createAppDB>>,
  u: OldUserRow,
): Promise<void> {
  // AppDB 不暴露按 id 创建用户（createUser 自增），此处直接执行底层 SQL
  const pool = (db as unknown as { pool?: pg.Pool }).pool;
  if (pool) {
    await pool.query(
      `INSERT INTO users (id, phone, password, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, password = EXCLUDED.password`,
      [u.id, u.phone, u.password ?? null, u.created_at],
    );
  } else {
    // SQLite 目标：直接使用 db.users.findByPhone 检查，通过 createUser 创建
    const existing = await db.users.findByPhone(u.phone);
    if (!existing) {
      await db.createUser(u.phone, u.created_at);
    }
  }
}

/** 显式 id 插入后必须重置序列，否则迁移后第一个新用户注册撞主键（注册功能瘫痪） */
async function resetUserSequence(db: Awaited<ReturnType<typeof createAppDB>>): Promise<void> {
  const pool = (db as unknown as { pool?: pg.Pool }).pool;
  if (!pool) return;
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1)
    )
  `);
  console.log('[Migrate] users_id_seq 序列已重置');
}

function safeParse(text: string): WordbookEntry[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? (v as WordbookEntry[]) : [];
  } catch {
    return [];
  }
}

/* ───────────────────────────── M6 的数据面 dry-parse ───────────────────────────── */

/**
 * `--verify-data`：把 `wordbooks.data` 与 `fsrs_cards.fsrs_data` 干跑一遍解析，只报告不落库。
 * 这是 M6 的"条目可选键 `updatedAt` 已定义"在存量数据上的可行性核对（PRD §6.1-3 红线：读，不动）。
 */
async function verifyData(): Promise<void> {
  const db = createAppDB();
  const books = await db.wordbooks.getAllWordbooks();
  let entries = 0;
  const bad: string[] = [];
  for (const book of books) {
    const check = verifyWordbookEntryDoc(book.data);
    entries += check.checked;
    for (const f of check.failures) bad.push(`user=${book.userId} index=${f.index}: ${f.reason}`);
  }
  console.log(`[Migrate] --verify-data：单词本 ${books.length} 行 / 条目 ${entries} 条，不合文档形状 ${bad.length} 条`);
  for (const line of bad.slice(0, 20)) console.log(`  ! ${line}`);
  await db.close();
  if (bad.length > 0) process.exitCode = 1;
}

/* ───────────────────────────────────── 主流程 ───────────────────────────────────── */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  console.log('=== 数据库迁移（T-06）===');

  // ① 静态自检：连库之前
  const violations = assertMigrationDiscipline(ALL_MIGRATIONS, { seedInsertTables: SEED_INSERT_TABLES });
  if (violations.length > 0) {
    console.error(`[Discipline] 迁移纪律违规 ${violations.length} 条：`);
    for (const v of violations) {
      console.error(`  × ${v.migration}[${v.driver}] ${v.reason}${v.sql ? ` → ${v.sql}` : ''}`);
    }
    process.exit(1);
  }
  console.log(`[Discipline] 0 违规（${ALL_MIGRATIONS.length} 个迁移 × 2 驱动：白名单形态 + down/noDownReason + 无业务表读写）`);

  const target = assertSafeTarget({
    dbDriver: config.dbDriver,
    sqlitePath: config.sqlitePath,
    iKnowThisIsProd: args.iKnowThisIsProd,
  });
  console.log(`[DB] driver=${config.dbDriver} 目标=${target}`);
  if (config.dbDriver === 'pg') {
    console.log(`[DB] DATABASE_URL=${config.databaseUrl.replace(/:[^:@/]*@/, ':***@')}`);
  }

  const db = createAppDB();
  await db.init();
  const ctx = createMigrationContext(db);
  const runner = new MigrationRunner(ALL_MIGRATIONS, ctx);

  if (args.status) {
    const plan = await runner.plan();
    const ledger = await runner.ledger();
    console.log(`[Ledger] _migrations ${ledger ? `已有 ${ledger.length} 条记录` : '表还不存在（首次执行）'}`);
    for (const item of plan) {
      console.log(`  ${item.status === 'applied' ? '✓' : '·'} ${item.migration.name}  ${item.migration.title}`);
    }
    await db.close();
    return;
  }

  if (args.rollback) {
    await runner.rollback(args.rollback, { allowRollback: args.allowRollback, log: (l) => console.log(l) });
    await db.close();
    return;
  }

  // ② 执行迁移
  const done = await runner.apply({ to: args.to, dryRun: args.dryRun, log: (l) => console.log(l) });
  console.log(
    args.dryRun
      ? `[Apply] dry-run：${done.length} 个待执行迁移（未连库写入）`
      : `[Apply] 本次应用 ${done.length} 个迁移${done.length ? `：${done.join(', ')}` : '（全部已是最新）'}`,
  );

  // ③ schema 反读比对
  if (!args.dryRun) {
    const diffs = await diffSchemaAgainstDescriptor(ctx, defaultSchemaSource);
    if (diffs.length > 0) {
      console.error(`[SchemaDiff] 与 DDL 单一源不一致 ${diffs.length} 处：${formatSchemaDiffs(diffs)}`);
      await db.close();
      process.exit(1);
    }
    console.log('[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）');
  }

  await db.close();

  // ④ 显式开关的历史能力与只读核对
  if (args.copyLegacy) {
    await migrateLegacyToPg(path.join(config.dataDir, 'data.db'));
  }
  if (args.initFsrs) {
    // 动态 import：只有显式 --init-fsrs 才加载 init-fsrs.js（见文件头的越界申请 X-T06-1）
    const { initFsrsCards } = await import('./init-fsrs.js');
    const r = await initFsrsCards();
    console.log(`[Migrate] FSRS 卡片：新建 ${r.initialized}，跳过 ${r.skipped}`);
  }
  if (args.verifyData) {
    await verifyData();
  }

  console.log('=== 迁移完成 ===');
}

/**
 * 直接执行时才跑主流程（spec 会 import 本模块的 `ALL_MIGRATIONS` / `assertSafeTarget`，
 * 若在 import 时触发 main()，测试就会去连库并改文件）。
 */
const invokedDirectly = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  const strip = (s: string): string =>
    decodeURIComponent(s).replace(/^file:\/\/?/, '').replace(/\\/g, '/').toLowerCase();
  return strip(import.meta.url) === strip(pathToFileURL(entry).href);
};

if (invokedDirectly()) {
  main().catch((err) => {
    console.error('迁移失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
