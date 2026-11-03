/**
 * T-06 微轮 / A-32-1(b)：启动自检 —— 凭据两列存在性（发布安全级）。
 *
 * 缺陷现场（T-07 报告 §8-1，判据见 A-32-1）：两侧 `init()` 只 exec 旧 DDL + 补两条上古列，
 * **不经过 `_migrations` 注册表**；而 `users` 的 `password_changed_at` / `pw_policy_version`
 * 只由迁移 `001-credentials-columns` 添加 ⇒ 未跑过迁移的库（**含全新空库**）上，
 * 读凭据那句 SQL 一打就 `no such column`，`/api/login` 与 `/api/register` 整片 500
 * `{"error":"服务器内部错误"}`。修法 = 缺列时**启动即失败**并打印可执行动作 `pnpm db:migrate`。
 *
 * 本文件的判据：
 *  1) 缺陷现场复现（测试进程被豁免放行 ⇒ 紧接着读凭据就是那句 `no such column`）；
 *  2) **未迁移库 → 启动失败且消息含 `db:migrate`**：基线表已建但缺两列 / 全新空库，两种都要；
 *  3) **已迁移库 → 正常起**（子进程 exit 0 + `BOOT-OK`）；
 *  4) **两驱动对称**：同一判据（各自的 introspection + 共用的 `assertCredentialColumnsForBoot`）、
 *     **同一条消息**（两侧子进程打出来的那句逐字相等）；
 *  5) 豁免判据本身：只有"紧接着就要 migrate"的三类放行，`src/index.ts`（= `dev`/`start`/生产）不放行；
 *  6) 自检只读不写：失败那次不碰 schema、不建 `_migrations`。
 *
 * 为什么用子进程：豁免里有"测试进程放行"一条（并行期十几个用例文件都要先 `init()` 再显式 migrate），
 * 于是**服务进程**那一支只能在真实进程语义里验 —— 子进程的 env 是重新拼的，
 * `VITEST` / `JEST_WORKER_ID` / `TM_DB_ALLOW_UNMIGRATED` 一律不带进去。
 * pg 侧本机无实例（A-18-3）⇒ 用语句桩 + 同样的子进程给出**等价证据**，
 * 真库那一跑在 `wordbook-rmw.spec.ts` 里显式 SKIP；**CI 必须真跑 pg**。
 *
 * 库一律建在 `os.tmpdir()` 下，**绝不碰仓库里的 `data.db`**（`assertSafeTarget` 也拒绝仓库内路径）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import pg from 'pg';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import {
  ALLOW_UNMIGRATED_ENV,
  assertCredentialColumnsForBoot,
  CREDENTIAL_COLUMNS,
  credentialColumnsMissingMessage,
  MIGRATE_COMMAND,
  migrationBootstrapExemption,
} from '../../src/db/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tmpDir = path.join(os.tmpdir(), `tm-t06-fix2-boot-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const T0 = 1_700_000_000_000;
const hashOf = (seed: string): string => `$2b$10$${seed.padEnd(53, 'x')}`;
/** 旧 `DDL` 里 `users` 的全部列（M1 之前的形状）。 */
const PRE_M1_USER_COLUMNS = ['id', 'phone', 'created_at', 'password'];

interface Boot {
  status: number;
  out: string;
  err: string;
  /** 失败时打印的那句话（`BOOT-FAIL: ` 之后的原文），成功时为空串 */
  message: string;
}

/** 用 tsx 起一个"服务进程"跑夹具：env 重新拼，测试进程与显式豁免的痕迹一律不带进去。 */
function boot(fixture: string, env: Record<string, string>): Boot {
  const child = spawnSync(process.execPath, [TSX_CLI, path.join(HERE, 'fixtures', fixture)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', ...env },
  });
  const out = String(child.stdout ?? '');
  const err = String(child.stderr ?? '');
  const failedLine = err.split(/\r?\n/).find((line) => line.startsWith('BOOT-FAIL: '));
  return { status: Number(child.status), out, err, message: failedLine ? failedLine.slice('BOOT-FAIL: '.length) : '' };
}

/** 库里 `users` 实际的列名（自检判据的输入就是这一段 introspection）。 */
function userColumnsOf(file: string): string[] {
  const raw = new Database(file, { readonly: true });
  try {
    return (raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
  } finally {
    raw.close();
  }
}

function tableNames(file: string): string[] {
  const raw = new Database(file, { readonly: true });
  try {
    return (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
  } finally {
    raw.close();
  }
}

/** 测试进程里（豁免③生效）把一个库初始化到"基线表齐、M1 两列缺"的形状 —— 就是缺陷现场的那个库。 */
async function initBaselineOnly(file: string): Promise<SqliteAppDB> {
  const app = new SqliteAppDB(new Database(file));
  await app.init();
  return app;
}

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  expect(fs.existsSync(TSX_CLI), `找不到 tsx：${TSX_CLI}`).toBe(true);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ══════════════════════════ 1：缺陷现场复现 ══════════════════════════ */

describe('A-32-1(b)：缺陷现场（未迁移库上读凭据 = 登录/注册整片 500 的那一句）', () => {
  it('测试进程确实被豁免放行，且放行的正是"缺两列"这个事实', async () => {
    // 本用例集的全部"豁免③"断言都建立在"我们确实在测试进程里"之上，先把这个前提钉死。
    expect(process.env.VITEST || process.env.JEST_WORKER_ID).toBeTruthy();
    const app = await initBaselineOnly(tmpFile('defect.db'));
    try {
      expect(migrationBootstrapExemption()).toMatch(/测试进程/);
      const cols = (app.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
      for (const col of CREDENTIAL_COLUMNS) expect(cols).not.toContain(col);
      // init() 没拦住（豁免放行）⇒ 读凭据立刻炸：这正是原先那堆 per-request 500 的栈顶。
      await expect(app.users.findCredentialsByPhone('13800000001')).rejects.toThrow(/no such column/);
      await expect(app.users.findCredentialsById(1)).rejects.toThrow(/no such column/);
    } finally {
      await app.close();
    }
  });
});

/* ══════════════════ 2/3：服务进程在未迁移库上必须拒绝启动；已迁移库正常起 ══════════════════ */

describe('A-32-1(b)：服务进程启动自检（sqlite 真库，tsx 子进程）', () => {
  it('未迁移库（基线表已建、缺 M1 两列）→ 启动失败，消息含 `pnpm db:migrate`', async () => {
    const file = tmpFile('unmigrated.db');
    await (await initBaselineOnly(file)).close();
    const b = boot('boot-init.ts', { SQLITE_PATH: file });
    expect(b.status, b.out + b.err).toBe(1);
    expect(b.out).not.toContain('BOOT-OK');
    expect(b.message).toBe(credentialColumnsMissingMessage(CREDENTIAL_COLUMNS));
    expect(b.message).toContain(MIGRATE_COMMAND);
    expect(b.message).toContain('users');
    for (const col of CREDENTIAL_COLUMNS) expect(b.message).toContain(col);
    // 人话：说清"没迁移"与后果，不是 SQL 片段、不是状态码
    expect(b.message).toMatch(/数据库还没迁移/);
    expect(b.message).toMatch(/拒绝启动/);
  });

  it('全新空库（连基线表都没有）→ 同样失败：M1 两列只能由迁移添加，故新库也必须先 migrate', () => {
    const file = tmpFile('brand-new.db');
    expect(fs.existsSync(file)).toBe(false);
    const b = boot('boot-init.ts', { SQLITE_PATH: file });
    expect(b.status, b.out + b.err).toBe(1);
    expect(b.message).toContain(MIGRATE_COMMAND);
    expect(b.message).toBe(credentialColumnsMissingMessage(CREDENTIAL_COLUMNS));
  });

  it('已迁移库 → 正常起（exit 0 + BOOT-OK），登录那条读凭据的路也通了', async () => {
    const file = tmpFile('migrated.db');
    const app = await initBaselineOnly(file);
    const applied = await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(app.db)).apply({});
    expect(applied.length).toBeGreaterThan(0);
    expect(applied).toContain('001-credentials-columns');
    await app.users.createWithPassword('13800000001', hashOf('boot'), 1, T0);
    await app.close();

    expect(userColumnsOf(file)).toEqual(expect.arrayContaining([...CREDENTIAL_COLUMNS]));
    const b = boot('boot-init.ts', { SQLITE_PATH: file });
    expect(b.err, b.err).toBe('');
    expect(b.status).toBe(0);
    expect(b.out).toContain('BOOT-OK');

    // 自检判据 = 迁移 M1 提供的那两列：跑过迁移的库上，凭据读取得到行而不是抛 SQL 错
    const check = new SqliteAppDB(new Database(file, { readonly: true }));
    try {
      const cred = await check.users.findCredentialsByPhone('13800000001');
      expect(cred).toMatchObject({ phone: '13800000001', pw_policy_version: 1 });
    } finally {
      await check.close();
    }
    const names = tableNames(file);
    expect(names).toEqual(expect.arrayContaining(['users', 'wordbooks', '_migrations']));
  });

  it('自检只读不写：失败那一次不碰 schema、不建 `_migrations`（只加不删不改）', () => {
    const file = tmpFile('untouched.db');
    const b = boot('boot-init.ts', { SQLITE_PATH: file });
    expect(b.status).toBe(1);
    expect(userColumnsOf(file)).toEqual(expect.arrayContaining(PRE_M1_USER_COLUMNS));
    for (const col of CREDENTIAL_COLUMNS) expect(userColumnsOf(file)).not.toContain(col);
    expect(tableNames(file)).not.toContain('_migrations');
  });
});

/* ═════════════════════════ 4：两驱动对称 ═════════════════════════ */

describe('A-32-1(b)：两驱动对称（同一判据、同一条消息）', () => {
  it('pg 侧未迁移 → 同一子进程语义下失败，且那句消息与 sqlite 侧逐字相同', async () => {
    const sqliteFile = tmpFile('parity-sqlite.db');
    await (await initBaselineOnly(sqliteFile)).close();
    const sqliteBoot = boot('boot-init.ts', { SQLITE_PATH: sqliteFile });
    const pgBoot = boot('boot-init-pg.ts', { PG_USERS_COLUMNS: PRE_M1_USER_COLUMNS.join(',') });
    expect(pgBoot.status, pgBoot.out + pgBoot.err).toBe(1);
    expect(pgBoot.out).not.toContain('BOOT-OK');
    // 这一条就是"同一条消息"的硬判据：两侧唯一的差别是 introspection 方言，
    // 判据与文案都收在 `db/types.ts:assertCredentialColumnsForBoot`。
    expect(pgBoot.message).toBe(sqliteBoot.message);
    expect(pgBoot.message).toContain(MIGRATE_COMMAND);
  });

  it('pg 侧已迁移（introspection 回报齐两列）→ 正常起', () => {
    const b = boot('boot-init-pg.ts', {
      PG_USERS_COLUMNS: [...PRE_M1_USER_COLUMNS, ...CREDENTIAL_COLUMNS].join(','),
    });
    expect(b.err, b.err).toBe('');
    expect(b.status).toBe(0);
    expect(b.out).toContain('BOOT-OK');
  });

  it('pg 侧判据确实是 `information_schema.columns` 上的 `users`（不是 sqlite 那套 PRAGMA）', async () => {
    // 夹具里的桩"认不出来就抛"，故上面两条跑通只可能是这条 SQL 命中的结果。
    // 这里再用录下来的语句把方言本身钉死（在测试进程里 init() 被豁免 ⇒ 不抛，只看语句）。
    const sqls: string[] = [];
    const pool = {
      query: async (text: string) => {
        const sql = String(text).replace(/\s+/g, ' ').trim();
        sqls.push(sql);
        if (/information_schema\.columns/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
      end: async () => undefined,
    } as unknown as pg.Pool;
    await new PostgresAppDB(pool).init();
    const introspection = sqls.filter((s) => /information_schema\.columns/.test(s));
    expect(introspection).toHaveLength(1);
    expect(introspection[0]).toMatch(/column_name/);
    expect(introspection[0]).toMatch(/table_name = 'users'/);
    expect(sqls.some((s) => /^CREATE TABLE IF NOT EXISTS users\b/.test(s))).toBe(true);
    expect(sqls.some((s) => /password_changed_at|pw_policy_version/.test(s))).toBe(false); // 不靠 ALTER 兜
    expect(sqls.some((s) => /^(BEGIN|ALTER TABLE users ADD COLUMN password_changed_at)/.test(s))).toBe(false);
  });
});

/* ══════════════════════ 5：豁免判据本身（谁放行、谁必须不放行）══════════════════════ */

describe('A-32-1(b)：豁免判据 —— 只有"紧接着就要 migrate"的三类放行', () => {
  const entry = (rel: string): string => path.join(REPO_ROOT, 'packages', 'server', ...rel.split('/'));

  it('迁移引导入口自己必须放行，否则"要人执行的那条 `pnpm db:migrate`"都跑不动', () => {
    for (const rel of ['src/scripts/migrate.ts', 'src/scripts/ddl-parity-runner.ts']) {
      const reason = migrationBootstrapExemption({ entry: entry(rel), env: {} });
      expect(reason, rel).toContain('迁移引导入口');
    }
    // posix 分隔符同样认（生产容器里就是 posix 路径）
    expect(migrationBootstrapExemption({ entry: '/app/packages/server/src/scripts/migrate.ts', env: {} })).toContain(
      '迁移引导入口',
    );
  });

  it('服务入口 `src/index.ts`（= `dev` / `start` / 生产容器）与 `init-fsrs` 一律不放行', () => {
    for (const rel of ['src/index.ts', 'src/scripts/init-fsrs.ts', 'src/app.ts', 'scripts/migrate.ts', 'src/scripts/other.ts']) {
      expect(migrationBootstrapExemption({ entry: entry(rel), env: {} }), rel).toBeNull();
    }
  });

  it('显式开关只认 `=1`；测试进程（VITEST / JEST_WORKER_ID）放行', () => {
    const serverEntry = { entry: entry('src/index.ts') };
    expect(migrationBootstrapExemption({ ...serverEntry, env: { [ALLOW_UNMIGRATED_ENV]: '1' } })).toBe(
      `${ALLOW_UNMIGRATED_ENV}=1`,
    );
    for (const value of ['0', '', 'true']) {
      expect(migrationBootstrapExemption({ ...serverEntry, env: { [ALLOW_UNMIGRATED_ENV]: value } }), value).toBeNull();
    }
    expect(migrationBootstrapExemption({ ...serverEntry, env: { VITEST: 'true' } })).toContain('测试进程');
    expect(migrationBootstrapExemption({ ...serverEntry, env: { JEST_WORKER_ID: '2' } })).toContain('测试进程');
    expect(migrationBootstrapExemption({ ...serverEntry, env: {} })).toBeNull();
  });

  it('收敛点行为：不缺列静默、缺列且无豁免抛出那一句、有豁免静默', () => {
    expect(() => assertCredentialColumnsForBoot([], { exemption: null })).not.toThrow();
    expect(() => assertCredentialColumnsForBoot(CREDENTIAL_COLUMNS, { exemption: null })).toThrow(
      credentialColumnsMissingMessage(CREDENTIAL_COLUMNS),
    );
    expect(() => assertCredentialColumnsForBoot(['pw_policy_version'], { exemption: null })).toThrow(
      credentialColumnsMissingMessage(['pw_policy_version']),
    );
    expect(() => assertCredentialColumnsForBoot(CREDENTIAL_COLUMNS, { exemption: '迁移引导入口 x' })).not.toThrow();
    // 消息里必须带可执行动作，且只带这一条动作
    expect(credentialColumnsMissingMessage(['a', 'b'])).toContain(MIGRATE_COMMAND);
  });
});
