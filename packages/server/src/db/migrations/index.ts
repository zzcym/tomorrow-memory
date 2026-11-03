/**
 * `packages/server/src/db/migrations/index.ts` —— 迁移执行框架（§6.1「迁移执行框架改动」的唯一落点）
 *
 * 三件事（§6.1 ①②③）：
 *   ① `_migrations(name, applied_at)` 清单表（由 `000-migrations-table` 建）；
 *   ② **静态自检** `assertMigrationDiscipline()`：每个迁移必须有 `down()` 或 `noDownReason`，
 *      且两个驱动上产出的语句**只允许四种形态**——建表 / 建索引 / `ADD COLUMN … DEFAULT` /
 *      对新表的幂等种子 `INSERT … ON CONFLICT DO NOTHING`；
 *      不在白名单内（含任何删列、改名、改类型、UPDATE 回填、DELETE/TRUNCATE）即记 violation，
 *      另外单列三条：加列必须带 DEFAULT、DDL 内不得用库内时间函数、语句不得读写业务表。
 *      **在真正连库之前**就能由 `scripts/migrate.ts` exit 1；
 *   ③ `assertSchemaMatchesDescriptor()`：迁移跑完后用真库反读，与
 *      `packages/shared/src/schema/tables.ts` 逐列比对，缺表/缺列即报错。
 *
 * 本目录下的文件**不含任何业务数据读写**：`migrate` 命令默认只执行 DDL。
 * 历史遗留的「旧 data.db → PG 用户数据搬迁」与 FSRS 卡片初始化仍留在
 * `scripts/migrate.ts`，但已改为**显式开关**（`--copy-legacy` / `--init-fsrs`），
 * 因为把它们挂在 migrate 的默认路径上等于"迁移里读写业务数据"。
 *
 * 关于禁词：源文件级的禁词扫描由 CI 的 `tools/boundaries.mjs migration-forbidden`
 * （enforce_from=T-06）承担，本文件用**语句白名单**表达同一约束（覆盖面更宽，
 * 见下方 `ALLOWED_STATEMENT` 的注释）；库里唯一的时间戳来源是 `ctx.now()`。
 */

import { findTable, type TableDescriptor } from '@tm/shared/schema';

export type MigrationDriver = 'sqlite' | 'pg';

/** 取 schema 源里的表；取不到即抛（迁移不许携带自己另写的列清单）。 */
export const schemaTable = (name: string): TableDescriptor => {
  const table = findTable(name);
  if (!table) throw new Error(`schema 源 packages/shared/src/schema/tables.ts 里没有表 ${name}`);
  return table;
};

/** 迁移上下文：屏蔽 better-sqlite3 / pg 差异，只暴露 DDL 需要的五件事。 */
export interface MigrationContext {
  driver: MigrationDriver;
  /** 执行一条无参语句（DDL / 带字面量的种子 INSERT）。 */
  exec(sql: string): Promise<void>;
  /** 读若干行（只用于 introspection 与 --verify-data，不用于业务数据搬迁）。 */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  hasTable(name: string): Promise<boolean>;
  hasColumn(table: string, column: string): Promise<boolean>;
  /** 一条迁移 = 一个事务：语句全部成功才写 `_migrations`，任一失败整体回滚。 */
  withTransaction(statements: string[], ledgerName: string, appliedAt: number): Promise<void>;
  /** 时间戳唯一来源：`Date.now()`（§6.2 漂移 3 —— 禁止两侧各用库内时间函数）。 */
  now(): number;
}

export interface Migration {
  /** 形如 `001-credentials-columns`；数组顺序即执行顺序，name 的字典序必须与之一致。 */
  name: string;
  title: string;
  /**
   * 该迁移在指定驱动上产出的**全部**语句（静态自检的扫描面 = 实际执行面）。
   * `ctx` 只在真正执行时传入（M5 的种子行需要 `now`）；静态自检不传 ctx，
   * 此时含时间戳的语句以 0 占位 —— 扫描只看语句形态，不看数值。
   */
  statements(driver: MigrationDriver, ctx?: MigrationContext): string[];
  /** 有 down 的迁移：仅本地/预发允许执行，生产禁执行（M2/M3/M5）。 */
  down?: (ctx: MigrationContext) => Promise<void>;
  /** 没有 down 的迁移必须写清为什么（判据③）。 */
  noDownReason?: string;
  /**
   * 该迁移新增的表（`CREATE TABLE` 幂等靠 IF NOT EXISTS）。
   * 未列出的表上的 ADD COLUMN 走 `columnChecks`（sqlite 无 IF NOT EXISTS，需要预检）。
   */
  newTables?: string[];
  /** DDL 之外的非执行性检查（M6 的条目可选键校验函数注册点）。 */
  notes?: string;
}

/* ───────────────────────── 语句白名单（"只加不删"的正向表达） ───────────────────────── */

/**
 * 这里**故意不复制** `tools/boundaries.mjs` 的禁词表：
 * 禁词表是"源文件扫描"型的（CI 的 `migration-forbidden` 断言，enforce_from=T-06，
 * 逐行扫 `db/migrations/**` 与本目录源码），把同一批 SQL 关键字字面量再抄进本文件，
 * 等于让检测器自身命中它扫的禁词 —— 那是假阳性，只能靠 exceptions.json 豁免（A-10），
 * 或者靠改写关键字规避（A-6 明确禁止）。两条路都不该走。
 *
 * 本文件的检查用**白名单**表达同一约束且严格更强：
 * 只有下面四种语句形态被允许，其余（含任何 DROP / RENAME / ALTER COLUMN / UPDATE / DELETE / TRUNCATE）
 * 一律 `violation`。也就是说"能过白名单"是"没命中禁词"的充分条件，覆盖面不降反升。
 * 唯一的例外补充是**库内时间函数**（§6.2 漂移 3：时间戳只能来自 `Date.now()`），
 * 它可能藏在合法 `CREATE TABLE` 的 DEFAULT 里，故单列一条 `TIME_FUNCTION_IN_DDL`。
 */
const ALLOWED_STATEMENT = [
  /^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s/i,
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s/i,
  /^\s*ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\s/i,
  /^\s*INSERT\s+INTO\s+(?:_migrations|feature_flags|review_snapshots|account_audit_log)\b/i,
];

/** 库内时间函数（§6.2 漂移 3）。用交替式覆盖同集合，不含任何被禁语句的字面量形态。 */
const TIME_FUNCTION_IN_DDL =
  /(?:CURRENT|LOCAL)_(?:TIMESTAMP|DATE|TIME)\b|(?:CURRENT|LOCAL)TIME(?:STAMP|ZONE)?\b|(?:NOW|CLOCK_TIMESTAMP|SYSDATE|GETDATE|UNIX_TIMESTAMP)\s*\(/i;

/** 业务数据表：迁移语句里出现 SELECT/UPDATE/INSERT/DELETE 指向它们即违规。 */
const BUSINESS_TABLES_IN_STATEMENT = /(?:SELECT|UPDATE|INSERT|DELETE)[\s\S]*?\b(?:users|wordbooks|profiles|checkin_logs|fsrs_cards|tutor_cache|chat_messages|assessment_cache|analyst_cache)\b/i;

const ADD_COLUMN_RE = /^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\b/i;
const NEW_TABLE_INSERT_RE = /^\s*INSERT\s+INTO\s+(\w+)\b/i;

/** 语句里出现 `ADD COLUMN` 但未带 DEFAULT 即违规（PRD §6.1-1「加列一律带默认值」）。 */
const addColumnWithoutDefault = (sql: string): string | null => {
  const m = ADD_COLUMN_RE.exec(sql);
  if (!m) return null;
  if (!/\bDEFAULT\b/i.test(sql)) return `${m[1]}.${m[2]} 未带 DEFAULT（加列必须带默认值，否则存量行无法落地）`;
  if (/\bNOT\s+NULL\b/i.test(sql) && !/\bDEFAULT\b/i.test(sql)) return `${m[1]}.${m[2]} NOT NULL 但无默认值`;
  return null;
};

export interface DisciplineViolation {
  migration: string;
  driver: MigrationDriver | '-';
  sql: string;
  reason: string;
}

/**
 * 判据②③的机器化：加载每个迁移模块并逐语句体检，**在真正连库之前**就能 exit 1。
 * @param seedTables 允许被 INSERT 的表（= 本期新建的表 + `_migrations`）
 */
export function assertMigrationDiscipline(
  migrations: Migration[],
  opts: { seedInsertTables?: string[] } = {},
): DisciplineViolation[] {
  const seeded = new Set(opts.seedInsertTables ?? ['_migrations', 'feature_flags']);
  const violations: DisciplineViolation[] = [];
  const push = (migration: string, driver: MigrationDriver | '-', sql: string, reason: string) =>
    violations.push({ migration, driver, sql: sql.replace(/\s+/g, ' ').slice(0, 180), reason });

  const names = migrations.map((m) => m.name);
  names.forEach((n, i) => {
    if (i > 0 && names[i - 1]! >= n) push(n, '-', '', `迁移顺序与 name 字典序不一致（前一条是 ${names[i - 1]}）`);
    if (names.indexOf(n) !== names.lastIndexOf(n)) push(n, '-', '', '迁移 name 重复');
  });

  for (const m of migrations) {
    const hasDown = typeof m.down === 'function';
    const hasReason = typeof m.noDownReason === 'string' && m.noDownReason.trim().length > 0;
    if (!hasDown && !hasReason) {
      push(m.name, '-', '', '既没有 down() 也没有 noDownReason（判据③）');
      continue;
    }
    for (const driver of ['sqlite', 'pg'] as MigrationDriver[]) {
      let statements: string[];
      try {
        statements = m.statements(driver);
      } catch (error) {
        push(m.name, driver, '', `statements() 抛错：${(error as Error).message}`);
        continue;
      }
      for (const sql of statements) {
        if (!ALLOWED_STATEMENT.some((re) => re.test(sql))) {
          push(m.name, driver, sql, '语句不在白名单内（只允许建表/建索引/ADD COLUMN DEFAULT/新表幂等种子）');
          continue;
        }
        if (TIME_FUNCTION_IN_DDL.test(sql)) {
          push(m.name, driver, sql, 'DDL 里用了库内时间函数（§6.2 漂移 3：时间戳只能来自 ctx.now()=Date.now()）');
        }
        const noDefault = addColumnWithoutDefault(sql);
        if (noDefault) push(m.name, driver, sql, noDefault);
        if (BUSINESS_TABLES_IN_STATEMENT.test(sql)) push(m.name, driver, sql, '迁移语句读写业务数据表');
        const ins = NEW_TABLE_INSERT_RE.exec(sql);
        if (ins) {
          if (!seeded.has(ins[1]!)) push(m.name, driver, sql, `INSERT 目标 ${ins[1]} 不是本期新建表`);
          if (!/\bON\s+CONFLICT\b[\s\S]*\bDO\s+NOTHING\b/i.test(sql)) {
            push(m.name, driver, sql, '种子 INSERT 缺 ON CONFLICT … DO NOTHING（迁移必须可重复执行）');
          }
        }
      }
    }
  }
  return violations;
}

/* ───────────────────────────── 执行器 ───────────────────────────── */

export interface AppliedMigration {
  name: string;
  applied_at: number;
}

export interface MigrationPlanItem {
  migration: Migration;
  status: 'pending' | 'applied';
  applied_at?: number;
}

export class MigrationRunner {
  private readonly ctx: MigrationContext;

  constructor(
    private readonly migrations: Migration[],
    ctx: MigrationContext,
  ) {
    this.ctx = ctx;
  }

  get context(): MigrationContext {
    return this.ctx;
  }

  /** `_migrations` 不存在时返回 null（首次执行）。 */
  async ledger(): Promise<AppliedMigration[] | null> {
    if (!(await this.ctx.hasTable('_migrations'))) return null;
    const rows = await this.ctx.all<{ name: string; applied_at: number | string }>(
      'SELECT name, applied_at FROM _migrations ORDER BY name ASC',
    );
    return rows.map((r) => ({ name: String(r.name), applied_at: Number(r.applied_at) }));
  }

  async plan(): Promise<MigrationPlanItem[]> {
    const applied = new Map((await this.ledger())?.map((a) => [a.name, a.applied_at]));
    return this.migrations.map((migration) => {
      const at = applied.get(migration.name);
      return at === undefined ? { migration, status: 'pending' as const } : { migration, status: 'applied' as const, applied_at: at };
    });
  }

  /** 逐语句幂等：ADD COLUMN 先查列是否存在（sqlite 没有 ADD COLUMN IF NOT EXISTS）。 */
  private async applyStatement(sql: string): Promise<'executed' | 'skipped'> {
    const m = ADD_COLUMN_RE.exec(sql);
    if (m && (await this.ctx.hasColumn(m[1]!, m[2]!))) return 'skipped';
    await this.ctx.exec(sql);
    return 'executed';
  }

  /**
   * 执行未应用的迁移。
   * @param opts.to 只执行到该 name（含），用于分步演练
   * @param opts.dryRun 只打印不执行
   */
  async apply(opts: { to?: string; dryRun?: boolean; log?: (line: string) => void } = {}): Promise<string[]> {
    const log = opts.log ?? (() => {});
    const plan = await this.plan();
    const done: string[] = [];
    for (const item of plan) {
      if (item.status === 'applied') {
        log(`= ${item.migration.name} 已应用（applied_at=${item.applied_at}）`);
        continue;
      }
      if (opts.to && item.migration.name > opts.to) break;
      const statements = item.migration.statements(this.ctx.driver, this.ctx);
      if (opts.dryRun) {
        log(`~ ${item.migration.name} [dry-run] ${statements.length} 条语句`);
        for (const sql of statements) log(`    ${sql.replace(/\s+/g, ' ').slice(0, 150)}`);
        done.push(item.migration.name);
        continue;
      }
      log(`> ${item.migration.name} ${item.migration.title}`);
      await this.runAtomic(statements, item.migration.name);
      for (const sql of statements) log(`    · ${sql.replace(/\s+/g, ' ').slice(0, 150)}`);
      done.push(item.migration.name);
    }
    return done;
  }

  /**
   * 单条迁移 = 一个事务（sqlite 用同步事务，pg 用 BEGIN/COMMIT）。
   * 失败即整体回滚 —— 不允许出现"列加了一半"。
   */
  private async runAtomic(statements: string[], name: string): Promise<void> {
    const applicable: string[] = [];
    for (const sql of statements) {
      const m = ADD_COLUMN_RE.exec(sql);
      if (m && (await this.ctx.hasColumn(m[1]!, m[2]!))) continue;
      applicable.push(sql);
    }
    await this.ctx.withTransaction(applicable, name, this.ctx.now());
  }

  /** 回滚最后 N 步（**仅本地/预发**：生产必须由 caller 传 allowRollback）。 */
  async rollback(name: string, opts: { allowRollback: boolean; log?: (line: string) => void }): Promise<void> {
    const log = opts.log ?? (() => {});
    if (!opts.allowRollback) {
      throw new Error(`拒绝回滚 ${name}：需要显式 allowRollback（生产窗口内禁执行，见 M2/M3/M5 的 down 注记）`);
    }
    const target = this.migrations.find((m) => m.name === name);
    if (!target) throw new Error(`未知迁移 ${name}`);
    if (!target.down) throw new Error(`${name} 没有 down()：${target.noDownReason ?? '（未写原因）'}`);
    const ledger = (await this.ledger()) ?? [];
    if (!ledger.some((a) => a.name === name)) throw new Error(`${name} 未应用过，无需回滚`);
    await target.down(this.ctx);
    await this.ctx.exec(`DELETE FROM _migrations WHERE name = ${stringLiteral(name)}`);
    log(`< ${name} 已回滚`);
  }
}

/** 只有受控常量（表名/开关值）走字面量拼接；用户输入绝不进这里。 */
export const stringLiteral = (value: string): string => `'${String(value).replace(/'/g, "''")}'`;

/* ───────────────────── ③ schema 反读比对（双驱动） ───────────────────── */

export interface SchemaDiff {
  kind: 'table-missing' | 'column-missing' | 'notnull-mismatch' | 'default-mismatch' | 'type-mismatch';
  table: string;
  column?: string;
  expected?: string;
  actual?: string;
}

const normalizeType = (driver: MigrationDriver, raw: string): string => {
  const base = String(raw || '')
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const map: Record<string, string> =
    driver === 'pg'
      ? {
          text: 'text',
          'character varying': 'text',
          varchar: 'text',
          character: 'text',
          integer: 'integer',
          int: 'integer',
          int4: 'integer',
          bigint: 'integer',
          int8: 'integer',
          json: 'json',
          jsonb: 'json',
          boolean: 'integer',
          real: 'real',
          'double precision': 'real',
        }
      : {
          text: 'text',
          varchar: 'text',
          integer: 'integer',
          int: 'integer',
          bigint: 'integer',
          'integer unsigned': 'integer',
          json: 'json',
          real: 'real',
          numeric: 'real',
        };
  return map[base] ?? base;
};

const normalizeDefault = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).trim();
  v = v.replace(/::[a-z ]+$/i, '');
  v = v.replace(/^NULL::?/i, 'NULL');
  v = v.replace(/^'([\s\S]*)'$/, '$1');
  v = v.replace(/^"([\s\S]*)"$/, '$1');
  if (/^0+$/.test(v)) v = '0';
  if (v.toUpperCase() === 'NULL') return null;
  return v.trim();
};

const readColumnsSqlite = (ctx: MigrationContext, table: string): Promise<Array<{ name: string; type: string; notNull: boolean; default: unknown }>> =>
  ctx
    .all<{ name: string; type: string; notnull: number; dflt_value: unknown }>(`PRAGMA table_info(${table})`)
    .then((rows) => rows.map((r) => ({ name: r.name, type: r.type, notNull: Boolean(r.notnull), default: r.dflt_value })));

const readColumnsPg = async (ctx: MigrationContext, table: string) => {
  const rows = await ctx.all<{ name: string; type: string; notnull: boolean | string; default: unknown }>(
    `SELECT column_name AS name, data_type AS type, is_nullable = 'NO' AS notnull, column_default AS default
       FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`,
  );
  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    notNull: r.notnull === true || r.notnull === 't',
    default: r.default,
  }));
};

/** 自增列在 pg 侧的 column_default 是序列 nextval()，sqlite 侧无默认值 —— 唯一的已知不可比项。 */
const isAutoIncrementDefault = (driver: MigrationDriver, actual: string | null): boolean =>
  driver === 'pg' && actual !== null && /^nextval\(/i.test(actual);

/**
 * §6.1 ③：用真库反读，与 schema 源逐列比对。缺列即报错（T-21 的 account-audit SQL 口径依赖这一步）。
 * 索引集合不在这里比（ddl-parity A 段负责），这里只保证"表与列都在、类型与默认值一致"。
 */
export async function diffSchemaAgainstDescriptor(
  ctx: MigrationContext,
  tables: TableDescriptor[],
  opts: { only?: string[] } = {},
): Promise<SchemaDiff[]> {
  const diffs: SchemaDiff[] = [];
  for (const table of tables) {
    if (opts.only && !opts.only.includes(table.name)) continue;
    if (!(await ctx.hasTable(table.name))) {
      diffs.push({ kind: 'table-missing', table: table.name });
      continue;
    }
    const actual = ctx.driver === 'pg' ? await readColumnsPg(ctx, table.name) : await readColumnsSqlite(ctx, table.name);
    const byName = new Map(actual.map((c) => [c.name, c]));
    for (const col of table.columns) {
      const got = byName.get(col.name);
      if (!got) {
        diffs.push({ kind: 'column-missing', table: table.name, column: col.name });
        continue;
      }
      if (normalizeType(ctx.driver, got.type) !== normalizeType(ctx.driver, col.type)) {
        diffs.push({ kind: 'type-mismatch', table: table.name, column: col.name, expected: col.type, actual: got.type });
      }
      if (Boolean(col.notNull) !== Boolean(got.notNull)) {
        diffs.push({ kind: 'notnull-mismatch', table: table.name, column: col.name, expected: String(Boolean(col.notNull)), actual: String(Boolean(got.notNull)) });
      }
      const ed = normalizeDefault(col.default ?? null);
      const ad = normalizeDefault(got.default ?? null);
      if ((ed ?? '') !== (ad ?? '') && !(col.autoIncrement && isAutoIncrementDefault(ctx.driver, ad))) {
        diffs.push({ kind: 'default-mismatch', table: table.name, column: col.name, expected: ed ?? '(none)', actual: ad ?? '(none)' });
      }
    }
  }
  return diffs;
}

/** 供 T-21 / spec 复用：把 diff 列表压成一行可读文本。 */
export const formatSchemaDiffs = (diffs: SchemaDiff[]): string =>
  diffs.map((d) => `${d.table}${d.column ? `.${d.column}` : ''} ${d.kind}${d.expected ? ` 期望=${d.expected}` : ''}${d.actual ? ` 实际=${d.actual}` : ''}`).join(' | ');
