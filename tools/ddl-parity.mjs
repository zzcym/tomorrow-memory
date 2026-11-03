#!/usr/bin/env node
/**
 * tools/ddl-parity.mjs — sqlite ↔ pg 双驱动对账（§6.2，借鉴 mobile-agenda/tests/ddl-parity.mjs）
 *
 * 三段结构（判据③要求 --help 能把它们列出来）：
 *   A 段 DDL 对账   —— 列集合 / 归一化类型 / NOT NULL / 默认值 / 索引集合，差异 > 0 → exit 1
 *   B 段 行为对账   —— 同一 fixtures 两驱动各跑一遍，规范化 JSON 后字符串级 diff
 *   C 段 长度语义对账 —— phone 11 位 / password 72 字节 / data 20000 上限在两库行为一致
 *
 * schema 源在 **约定路径** `packages/shared/src/schema/tables.ts`（§10.3 归属 T-06）。
 * 该文件由 T-06 产出；在它存在之前，本脚本必须给出**可读的**"待 T-06 提供 schema 源"并以非 0 退出，
 * 不许静默通过（A-5 的口径：能装能编能校验 ≠ 把校验关掉）。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/** §6.2 第 1 步：schema 单一描述源的约定落点（T-06 产出，本脚本只读）。 */
export const SCHEMA_SOURCE = 'packages/shared/src/schema/tables.ts';
export const FIXTURE_FILE = 'tools/fixtures/schema-fixtures.json';

export const SECTIONS = [
  {
    id: 'A',
    title: 'DDL 对账',
    asserts: '列集合、归一化类型（TEXT↔varchar 映射表）、NOT NULL、默认值、索引集合',
    needs: [SCHEMA_SOURCE, '临时 SQLite 库', 'DATABASE_URL_TEST 指向的 PG 库'],
  },
  {
    id: 'B',
    title: '行为对账',
    asserts:
      '同一 fixtures（含空密码账号、pw_policy_version=0 账号、中文与超长词、NULL/空串 password）跑 createUser/activateUser/changePassword/wordbooks.getData·apply/review.apply/snapshot-undo，时间戳与自增归一后字符串级 diff',
    needs: [SCHEMA_SOURCE, 'packages/server/src/scripts/ddl-parity-runner.ts（@tm/server test-only 装配）', FIXTURE_FILE, 'DATABASE_URL_TEST（缺 → pg 侧显式 SKIP）'],
  },
  {
    id: 'C',
    title: '长度语义对账',
    asserts: 'phone 11 位边界、password 72 字节边界、data 数组 20000 上限在两库行为一致（都接受 / 都拒绝）',
    needs: [SCHEMA_SOURCE, 'packages/server/src/scripts/ddl-parity-runner.ts（@tm/server test-only 装配）', FIXTURE_FILE, 'DATABASE_URL_TEST（缺 → pg 侧显式 SKIP）'],
  },
];

const HELP = `ddl-parity —— sqlite ↔ pg 双驱动对账（§6.2）

三段结构：
${SECTIONS.map((s) => `  ${s.id} 段 ${s.title}\n     断言：${s.asserts}\n     前置：${s.needs.join(' + ')}`).join('\n')}

schema 源：约定路径 ${SCHEMA_SOURCE}（§10.3 归属 T-06，本脚本只读）
     不存在时本脚本给出可读错误并 exit 2，不静默通过。

B/C 段的被测面：packages/server/src/scripts/ddl-parity-runner.ts（A-18-4 的 @tm/server test-only 装配）
     sqlite 侧只开 os.tmpdir() 下的临时库文件，pg 侧只认 DATABASE_URL_TEST —— 两者都碰不到仓库里的真 data.db；
     归一化与字符串级 diff 留在本文件（比对口径不在装配那一侧）。

用法：
  node tools/ddl-parity.mjs                 # 跑 A/B/C（缺前置时报可读错误）
  node tools/ddl-parity.mjs --section A     # 只跑某一段
  node tools/ddl-parity.mjs --self-test     # 用 tools/fixtures/schema-fixtures.json 的漂移样本证明判定力
  node tools/ddl-parity.mjs --help          # 本帮助
  node tools/ddl-parity.mjs --schema PATH   # 覆盖 schema 源路径（自测/调试用）
  node tools/ddl-parity.mjs --json          # 机器可读输出

环境变量：
  DATABASE_URL_TEST   PG 测试库连接串；缺失时 A 段的 PG 侧记 SKIP 并打 CI 警告（§6.2 第 2 步）
`;

/* ────────────────────────── 类型归一（§6.2 漂移表） ────────────────────────── */

export const TYPE_MAP = {
  sqlite: {
    text: 'text', varchar: 'text', character: 'text', 'character varying': 'text',
    integer: 'integer', int: 'integer', bigint: 'integer', int4: 'integer', int8: 'integer',
    'integer unsigned': 'integer',
    json: 'json', jsonb: 'json',
    timestamp: 'integer', 'timestamp without time zone': 'integer', 'bigint unsigned': 'integer',
    boolean: 'integer', bool: 'integer',
    real: 'real', double: 'real', 'double precision': 'real', numeric: 'real',
  },
  pg: {
    text: 'text', 'character varying': 'text', varchar: 'text', character: 'text',
    integer: 'integer', int: 'integer', int4: 'integer', bigint: 'integer', int8: 'integer',
    json: 'json', jsonb: 'json',
    timestamp: 'integer', 'timestamp without time zone': 'integer',
    boolean: 'integer', bool: 'integer',
    real: 'real', double: 'real', 'double precision': 'real', numeric: 'real',
  },
};

export const normalizeType = (driver, raw) => {
  const base = String(raw || '').toLowerCase().replace(/\(.*\)/, '').replace(/\s+/g, ' ').trim();
  const table = TYPE_MAP[driver] || {};
  return table[base] || base;
};

/** 默认值归一：pg 会写 `::type` 强转与 NULL::text，sqlite 直接给字面量。 */
export const normalizeDefault = (raw) => {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).trim();
  v = v.replace(/::[a-z ]+$/i, '');
  v = v.replace(/^NULL::?/i, 'NULL');
  v = v.replace(/^'([\s\S]*)'$/, '$1');
  v = v.replace(/^"([\s\S]*)"$/, '$1');
  if (/^0+$/.test(v)) v = '0';
  return v.trim();
};

/* ───────────────────────────── A 段：对账引擎 ───────────────────────────── */

/**
 * @param {object} expected  schema 源给出的表描述 { columns:[{name,type,notNull,default}], indexes:[{name,columns[],unique}] }
 * @param {object} actual    驱动 introspection 结果（同形状）
 * @param {string} driver    'sqlite' | 'pg'（用于类型归一）
 */
export const diffTable = (tableName, expected, actual) => {
  const diffs = [];
  const expCols = new Map((expected.columns || []).map((c) => [c.name, c]));
  const actCols = new Map((actual.columns || []).map((c) => [c.name, c]));
  for (const [name, col] of expCols) {
    const got = actCols.get(name);
    if (!got) {
      diffs.push({ kind: 'column-missing', table: tableName, column: name });
      continue;
    }
    if (normalizeType(actual.driver || 'sqlite', got.type) !== normalizeType(actual.driver || 'sqlite', col.type)) {
      diffs.push({ kind: 'type-mismatch', table: tableName, column: name, expected: normalizeType(actual.driver, col.type), actual: normalizeType(actual.driver, got.type) });
    }
    if (Boolean(col.notNull) !== Boolean(got.notNull)) {
      diffs.push({ kind: 'notnull-mismatch', table: tableName, column: name, expected: Boolean(col.notNull), actual: Boolean(got.notNull) });
    }
    const ed = normalizeDefault(col.default ?? null);
    const ad = normalizeDefault(got.default ?? null);
    if ((ed ?? '') !== (ad ?? '')) {
      diffs.push({ kind: 'default-mismatch', table: tableName, column: name, expected: ed, actual: ad });
    }
  }
  for (const name of actCols.keys()) {
    if (!expCols.has(name)) diffs.push({ kind: 'column-extra', table: tableName, column: name });
  }
  const key = (idx) => `${(idx.columns || []).join(',')}|${idx.unique ? 'u' : 'n'}`;
  const expIdx = new Map((expected.indexes || []).map((i) => [key(i), i]));
  const actIdx = new Map((actual.indexes || []).map((i) => [key(i), i]));
  for (const k of expIdx.keys()) if (!actIdx.has(k)) diffs.push({ kind: 'index-missing', table: tableName, index: `${(expIdx.get(k).columns || []).join(',')}` });
  for (const k of actIdx.keys()) if (!expIdx.has(k)) diffs.push({ kind: 'index-extra', table: tableName, index: `${(actIdx.get(k).columns || []).join(',')}` });
  return diffs;
};

/** 描述 → SQLite DDL（A 段自测用；T-06 若改用 shared 里的生成器，本函数随之外移）。 */
export const sqliteDdlFromDescriptor = (table) => {
  const cols = (table.columns || []).map((c) => {
    const type = normalizeType('sqlite', c.type);
    const bits = [`"${c.name}"`, type === 'integer' ? 'INTEGER' : type === 'json' ? 'TEXT' : 'TEXT'];
    if (c.primaryKey) bits.push('PRIMARY KEY');
    if (c.notNull) bits.push('NOT NULL');
    if (c.default !== undefined && c.default !== null) {
      bits.push(`DEFAULT ${typeof c.default === 'string' && !/^\d+$/.test(c.default) ? `'${c.default}'` : c.default}`);
    }
    return `  ${bits.join(' ')}`;
  });
  const stmts = [`CREATE TABLE IF NOT EXISTS "${table.name}" (\n${cols.join(',\n')}\n);`];
  for (const idx of table.indexes || []) {
    stmts.push(
      `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "idx_${table.name}_${(idx.columns || []).join('_')}" ON "${table.name}" (${(idx.columns || []).map((c) => `"${c}"`).join(', ')});`,
    );
  }
  return stmts;
};

/* ─────────────────────────── 驱动 introspection ─────────────────────────── */

const introspectSqlite = async (Database, table) => {
  const cols = Database.prepare(`PRAGMA table_info("${table}")`).all().map((r) => ({
    name: r.name,
    type: r.type,
    notNull: Boolean(r.notnull),
    default: r.dflt_value,
    primaryKey: Boolean(r.pk),
  }));
  const idx = Database.prepare(`PRAGMA index_list("${table}")`).all().filter((r) => !r.origin || r.origin !== 'pk');
  const indexes = [];
  for (const r of idx) {
    const info = Database.prepare(`PRAGMA index_info("${r.name}")`).all().map((c) => c.name);
    indexes.push({ name: r.name, columns: info, unique: Boolean(r.unique) });
  }
  return { driver: 'sqlite', table, columns: cols, indexes };
};

const introspectPg = async (url, table) => {
  const { default: Pg } = await import('pg');
  const pool = new Pg.Pool({ connectionString: url });
  try {
    const cols = (
      await pool.query(
        `select column_name as name, data_type as type, is_nullable='NO' as notnull, column_default as default
           from information_schema.columns where table_name = $1 order by ordinal_position`,
        [table],
      )
    ).rows.map((r) => ({ name: r.name, type: r.type, notNull: r.notnull === true || r.notnull === 't', default: r.default }));
    const idx = (
      await pool.query(
        `select i.relname as name, ix.indisunique as unique,
                array_agg(a.attname order by array_position(ix.indkey, a.attnum)) as columns
           from pg_class t
           join pg_index ix on t.oid = ix.indrelid
           join pg_class i on i.oid = ix.indexrelid
           join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
          where t.relname = $1 and ix.indisprimary = false
          group by i.relname, ix.indisunique, ix.indkey`,
        [table],
      )
    ).rows.map((r) => ({ name: r.name, columns: r.columns, unique: r.unique === true || r.unique === 't' }));
    return { driver: 'pg', table, columns: cols, indexes: idx };
  } finally {
    await pool.end();
  }
};

/* ───────────────────────────── schema 源装载 ───────────────────────────── */

const TABLE_KEYS_REQUIRED = ['name', 'columns'];

/** schema 源不存在时返回 null；调用方负责给出可读错误。 */
export const loadSchemaSource = async (repoRoot, relPath = SCHEMA_SOURCE) => {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) return null;
  // Windows 实测：`import('E:/…')` 会被 ESM loader 判成协议 `e:` 而抛
  // ERR_UNSUPPORTED_ESM_URL_SCHEME（--schema 覆盖路径时必炸）→ 必须走 file:// URL。
  const mod = await import(pathToFileURL(abs).href);
  const tables = mod.tables || mod.default || mod.SCHEMA || mod.TABLES;
  const list = Array.isArray(tables) ? tables : tables && Array.isArray(tables.tables) ? tables.tables : null;
  if (!list) {
    throw new Error(
      `schema 源 ${relPath} 已存在但没有导出 tables/TABLES/SCHEMA 数组 —— T-06 请按 §6.2 第 1 步的约定形状导出：export const tables = [{ name, columns:[{name,type,notNull,default}], indexes:[{name,columns,unique}] }]`,
    );
  }
  const bad = list.filter((t) => !t || !TABLE_KEYS_REQUIRED.every((k) => t[k]) || !Array.isArray(t.columns));
  if (bad.length) {
    throw new Error(`schema 源里 ${bad.length} 个表描述缺 name/columns（首条：${JSON.stringify(bad[0]).slice(0, 120)}）`);
  }
  return list;
};

const missingSchemaMessage = (relPath) =>
  [
    `✖ 缺 schema 源：${relPath}`,
    `  该文件由 **T-06**（批次1「数据库层与迁移框架」）产出，是 §6.2 第 1 步约定的"列名/类型/可空/默认值"单一描述源。`,
    `  在它落地之前 A/B/C 三段都无处比对 —— 本脚本刻意不猜、不建、不降级为绿。`,
    `  现在可跑：node tools/ddl-parity.mjs --self-test  （用 ${FIXTURE_FILE} 的漂移样本验证对账引擎本身有效）`,
  ].join('\n');

/* ───────────────────────────── 主流程 ───────────────────────────── */

export const runParity = async ({ repoRoot = REPO, section = 'all', schemaPath = SCHEMA_SOURCE, quiet = false } = {}) => {
  const say = (s) => {
    if (!quiet) process.stdout.write(`${s}\n`);
  };
  const report = { sections: {}, exit: 0 };
  const tables = await loadSchemaSource(repoRoot, schemaPath);
  if (!tables) {
    say(missingSchemaMessage(schemaPath));
    report.exit = 2;
    report.reason = 'missing-schema-source';
    return report;
  }
  say(`schema 源 ${schemaPath} 载入 ${tables.length} 张表：${tables.map((t) => t.name).join(', ')}`);
  const fixtures = readJsonSafe(path.join(repoRoot, FIXTURE_FILE));

  /* ── A 段 ── */
  if (section === 'all' || section === 'A') {
    const require_ = createRequire(path.join(repoRoot, 'noop.js'));
    let Database = null;
    try {
      Database = require_('better-sqlite3');
    } catch {
      try {
        Database = (await import('better-sqlite3')).default;
      } catch {
        say('A 段 SKIP：better-sqlite3 不可加载');
      }
    }
    if (Database) {
      const db = new Database(':memory:');
      const diffs = [];
      for (const table of tables) {
        for (const stmt of sqliteDdlFromDescriptor(table)) db.exec(stmt);
        const actual = await introspectSqlite(db, table.name);
        diffs.push(...diffTable(table.name, table, actual));
      }
      report.sections.A = { sqlite: { diffs, tables: tables.length } };
      say(`A 段/sqlite：${diffs.length} 处差异${diffs.length ? ` → ${JSON.stringify(diffs.slice(0, 5))}` : ''}`);
      if (diffs.length) report.exit = 1;
      db.close();
    }
    const url = process.env.DATABASE_URL_TEST;
    if (!url) {
      say('A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）');
      report.sections.A = report.sections.A || {};
      report.sections.A.pg = { skipped: true };
    } else {
      const diffs = [];
      for (const table of tables) {
        try {
          const actual = await introspectPg(url, table.name);
          diffs.push(...diffTable(table.name, table, actual));
        } catch (error) {
          diffs.push({ kind: 'pg-error', table: table.name, message: String(error.message || error) });
        }
      }
      report.sections.A = { ...(report.sections.A || {}), pg: { diffs } };
      say(`A 段/pg：${diffs.length} 处差异`);
      if (diffs.length) report.exit = 1;
    }
  }

  /* ── B/C 段：@tm/server 的 test-only 装配（A-18-4 接线，比对口径仍在本文件） ── */
  const wanted = ['B', 'C'].filter((id) => section === 'all' || section === id);
  if (wanted.length > 0) {
    const runnerRel = 'packages/server/src/scripts/ddl-parity-runner.ts';
    const runner = path.join(repoRoot, runnerRel);
    const dbMod = path.join(repoRoot, 'packages/server/src/db/index.ts');
    if (!fs.existsSync(dbMod)) {
      say(`B/C 段 BLOCKED：${'packages/server/src/db/index.ts'} 不存在 → 无 AppDB 可跑（待 T-06）`);
      for (const id of wanted) report.sections[id] = { blocked: 'awaiting T-06 db layer' };
      report.exit = report.exit || 2;
    } else if (!fs.existsSync(runner)) {
      say(`B/C 段 BLOCKED：缺 ${runnerRel}（@tm/server 的 test-only 装配，A-18-4）`);
      for (const id of wanted) report.sections[id] = { blocked: `missing ${runnerRel}` };
      report.exit = report.exit || 2;
    } else {
      say(`B/C 段：调 ${runnerRel}（sqlite=临时文件库 / pg=DATABASE_URL_TEST），同一份 ${FIXTURE_FILE}（b_cases ${Object.keys(fixtures?.b_cases || {}).length} 组 / c_cases ${Object.keys(fixtures?.c_cases || {}).length} 组）`);
      const run = await runServerAssembly(runner, repoRoot, wanted.length === 2 ? 'ALL' : wanted[0]);
      if (!run.ok) {
        say(`B/C 段 BLOCKED：装配进程没给出可用结论 —— ${run.reason}`);
        for (const id of wanted) report.sections[id] = { blocked: run.reason };
        report.exit = report.exit || 2;
      } else {
        const byDriver = run.outcomes;
        for (const id of wanted) {
          const sqlite = byDriver.find((o) => o.driver === 'sqlite');
          const pg = byDriver.find((o) => o.driver === 'pg');
          if (!sqlite?.ran) {
            say(`${id} 段/sqlite：FAIL —— 装配没跑起来（${sqlite?.reason ?? '无 sqlite 结论'}）`);
            report.sections[id] = { sqlite: { error: sqlite?.reason ?? 'no sqlite outcome' } };
            report.exit = report.exit || 1;
            continue;
          }
          if (!pg?.ran) {
            say(
              `${id} 段/pg：SKIP —— ${pg?.reason ?? '未设 DATABASE_URL_TEST'}\n` +
                '  ⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）。',
            );
            report.sections[id] = {
              sqlite: { cases: countCases(id, sqlite) },
              pg: { skipped: true, reason: pg?.reason ?? 'DATABASE_URL_TEST 未设置' },
            };
            continue;
          }
          const diffs = diffCases(id, sqlite.cases, pg.cases);
          say(
            `${id} 段：sqlite ${countCases(id, sqlite)} 例 / pg ${countCases(id, pg)} 例 → ${diffs.length} 处行为差异` +
              (diffs.length ? ` → ${JSON.stringify(diffs.slice(0, 3))}` : ''),
          );
          report.sections[id] = { sqlite: { cases: countCases(id, sqlite) }, pg: { cases: countCases(id, pg) }, diffs };
          if (diffs.length) report.exit = 1;
        }
      }
    }
  }
  return report;
};

/* ─────────────────── B/C 段：装配调用与比对（口径唯一落点） ─────────────────── */

/** §6.2 第 4 步要求归一的两类值：自增 id 与"落库时刻"类时间戳。语义时间戳（password_changed_at / addedAt / due）**不归一**。 */
export const CASE_ID_KEYS = new Set(['id', 'user_id', 'userId', 'uid', 'snapshot_id']);
export const CASE_TS_KEYS = new Set(['created_at', 'updated_at', 'last_review', 'applied_at', 'last_synced_at']);

export const normalizeCaseValue = (value) => {
  const strip = (key, val) => {
    if (CASE_ID_KEYS.has(key) && (typeof val === 'number' || typeof val === 'string')) return '<id>';
    if (CASE_TS_KEYS.has(key) && typeof val === 'number') return '<ts>';
    return val;
  };
  try {
    return JSON.parse(JSON.stringify(value, strip));
  } catch {
    return String(value);
  }
};

const caseShape = (c) => JSON.stringify(normalizeCaseValue(c?.value ?? null));

/** 两驱动同一例：一边接受一边拒绝 = 行为漂移；错误码不同 = 行为漂移；归一后 JSON 字符串不等 = 值漂移。 */
export const diffCases = (section, sqliteCases = {}, pgCases = {}) => {
  const diffs = [];
  const keys = [...new Set([...Object.keys(sqliteCases), ...Object.keys(pgCases)])].filter((k) => k.startsWith(`${section}.`)).sort();
  for (const key of keys) {
    const a = sqliteCases[key];
    const b = pgCases[key];
    if (!a || !b) {
      diffs.push({ kind: 'case-missing', section, case: key, missing_on: a ? 'pg' : 'sqlite' });
      continue;
    }
    if (Boolean(a.ok) !== Boolean(b.ok)) {
      diffs.push({ kind: 'behavior-mismatch', section, case: key, sqlite: a.ok ? 'accepted' : `rejected:${a.error}`, pg: b.ok ? 'accepted' : `rejected:${b.error}` });
      continue;
    }
    if (!a.ok && a.error !== b.error) {
      diffs.push({ kind: 'error-code-mismatch', section, case: key, sqlite: a.error, pg: b.error });
      continue;
    }
    if (a.ok && caseShape(a) !== caseShape(b)) {
      diffs.push({ kind: 'value-mismatch', section, case: key, sqlite: caseShape(a), pg: caseShape(b) });
    }
  }
  return diffs;
};

const countCases = (section, outcome) =>
  Object.keys(outcome?.cases || {}).filter((k) => k.startsWith(`${section}.`)).length;

/**
 * 起 `tsx` 跑 @tm/server 的 test-only 装配（一次调用覆盖 B 与 C，两驱动各跑一遍）。
 * 结论只认 stdout 的最后一行 JSON；任何异常都翻成"BLOCKED + 人话原因"，不许静默当绿。
 */
export const runServerAssembly = async (runnerPath, repoRoot, sectionArg) => {
  const { spawnSync } = await import('node:child_process');
  let tsxCli = null;
  try {
    tsxCli = createRequire(path.join(repoRoot, 'noop.js')).resolve('tsx/cli');
  } catch {
    tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
  if (!fs.existsSync(tsxCli)) return { ok: false, reason: `找不到 tsx CLI（${tsxCli}）→ 无法加载 @tm/server 的 TS 装配` };
  const child = spawnSync(
    process.execPath,
    [tsxCli, runnerPath, '--fixtures', path.join(repoRoot, FIXTURE_FILE), '--section', sectionArg || 'all'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 300_000, env: { ...process.env } },
  );
  if (child.error) return { ok: false, reason: `装配进程启动失败：${child.error.message}` };
  const lines = String(child.stdout || '').trim().split('\n').filter(Boolean);
  const payload = lines[lines.length - 1];
  if (!payload || !payload.startsWith('{')) {
    return {
      ok: false,
      reason: `装配进程 exit=${child.status} 且无 JSON 结论：${String(child.stderr || '').trim().split('\n').slice(-3).join(' / ')}`,
    };
  }
  try {
    const report = JSON.parse(payload);
    if (!Array.isArray(report.outcomes)) return { ok: false, reason: '装配结论里没有 outcomes 数组' };
    return { ok: true, outcomes: report.outcomes };
  } catch (error) {
    return { ok: false, reason: `装配结论不是合法 JSON：${error.message}` };
  }
};

const readJsonSafe = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/* ───────────────────────────── 自测 ───────────────────────────── */

export const selfTest = async () => {
  const failures = [];
  const lines = [];
  const push = (ok, label, detail) => {
    lines.push(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
  };
  const fixtures = readJsonSafe(path.join(REPO, FIXTURE_FILE));
  push(Boolean(fixtures), `fixture 存在：${FIXTURE_FILE}`);
  if (!fixtures) {
    for (const l of lines) process.stdout.write(`${l}\n`);
    return 1;
  }
  push(fixtures.selftest?.A_cases?.length >= 5, `A 段漂移样本 ≥5 类`, `实际 ${fixtures.selftest?.A_cases?.length}`);
  for (const c of fixtures.selftest.A_cases) {
    const diffs = diffTable(c.table || 't', c.expected, { driver: c.driver || 'sqlite', ...c.actual });
    const hit = diffs.some((d) => d.kind === c.expect_diff);
    push(hit, `A 段：${c.id} → 必须报 ${c.expect_diff}`, `实际 ${JSON.stringify(diffs.map((d) => d.kind))}`);
  }
  const clean = fixtures.selftest.clean_pair;
  push(diffTable('t', clean.expected, { driver: 'sqlite', ...clean.actual }).length === 0, 'A 段：无漂移样本必须 0 差异（否则是永真断言）');
  // 归一化表本身有效（§6.2 的三个已知漂移点）
  push(normalizeType('pg', 'character varying') === 'text' && normalizeType('pg', 'text') === 'text', '归一化：pg VARCHAR(11) 与 sqlite TEXT 视为同一类型');
  push(normalizeType('pg', 'jsonb') === normalizeType('sqlite', 'json'), '归一化：JSONB ↔ JSON 视为同一类型（§6.2 漂移 2）');
  push(normalizeDefault("'[]'::jsonb") === '[]' && normalizeDefault("''") === '' && normalizeDefault(0) === '0', '默认值归一：pg ::type 强转与引号剥除');
  push(normalizeType('pg', 'bigint') === 'integer' && normalizeType('sqlite', 'INTEGER') === 'integer', '时间戳归一：pg BIGINT 与 sqlite INTEGER 同型（§6.2 漂移 3）');
  // 端到端：真起一个内存 sqlite，按描述建表再 introspect，必须 0 差异。
  // 本机若 better-sqlite3 的 native ABI 与当前 node 不匹配则记 SKIP（不记绿），并打印原因给 T-06/CI 排障。
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(':memory:');
    for (const table of fixtures.sqlite_roundtrip) {
      for (const stmt of sqliteDdlFromDescriptor(table)) db.exec(stmt);
      const actual = await introspectSqlite(db, table.name);
      const diffs = diffTable(table.name, table, actual);
      push(diffs.length === 0, `SQLite 往返：${table.name} 描述→建表→introspect 必须 0 差异`, JSON.stringify(diffs).slice(0, 200));
    }
    db.close();
  } catch (error) {
    lines.push(`SKIP SQLite 往返自测（native 驱动不可加载：${String(error.message || error).split('\n')[0]}）`);
    process.stdout.write(
      `⚠ SKIP：better-sqlite3 在当前 node(${process.versions.node}) 下不可加载 —— A 段的"真库往返"这一层本机跑不到，只能在 CI 里跑。这不是通过，请在交付报告里如实登记。\n`,
    );
  }
  // 与驱动无关的一层：描述 → DDL 文本生成必须是"只加不删"的形态
  const ddl = sqliteDdlFromDescriptor(fixtures.sqlite_roundtrip[0]).join('\n');
  push(
    /"password_changed_at" INTEGER NOT NULL DEFAULT 0/.test(ddl) &&
      /"pw_policy_version" INTEGER NOT NULL DEFAULT 0/.test(ddl) &&
      !/\b(DROP|RENAME|ALTER)\b/i.test(ddl),
    'DDL 生成：M1 两列均为 ADD COLUMN 形态的 NOT NULL DEFAULT 0，且不含 DROP/RENAME/ALTER',
    ddl.replace(/\s+/g, ' ').slice(0, 160),
  );
  // fixtures 自身的边界值必须是"故意的"
  const b = fixtures.b_cases || {};
  push(typeof b.empty_password_account === 'object', 'B 段 fixture：空密码账号在册');
  push(b.legacy_policy_version_account?.pw_policy_version === 0, 'B 段 fixture：pw_policy_version=0 账号在册');
  push((b.long_word?.word || '').length > 64, 'B 段 fixture：超长词在册', `len=${(b.long_word?.word || '').length}`);
  const c = fixtures.c_cases || {};
  push(c.phone?.valid?.length === 11 && c.phone?.invalid_too_long?.length === 12 && c.phone?.invalid_too_short?.length === 10, 'C 段 fixture：phone 10/11/12 三档');
  push(c.password?.at_72_bytes?.length === 72 && c.password?.over_72_bytes?.length === 73, 'C 段 fixture：password 72/73 字节');
  push(c.data_array?.at_limit?.count === 20000 && c.data_array?.over_limit?.count === 20001 && c.data_array?.under_limit?.count === 19999, 'C 段 fixture：data 19999/20000/20001 三档');
  // 端到端阻断力：给一份真会漂移的 schema 源走 --schema 通路，A 段必须非 0 退出码，
  // 且同一趟里那张干净表必须 0 差异（证明上一条不是"怎么跑都红"的永真断言）。
  // 本层依赖真库往返，与上面的 SQLite 往返自测同一前置：驱动不可加载时记 SKIP 并如实打印，
  // **不记绿**（A 段在真仓库里跑不到只能在 CI 里验，见 04-dev-report-T-02.md「已知限制」）。
  try {
    const drift = await runParity({
      section: 'A',
      schemaPath: 'tools/fixtures/selftest/parity/schema-drift.mjs',
      quiet: true,
    });
    const driftDiffs = drift.sections?.A?.sqlite?.diffs || [];
    push(
      drift.exit === 1 && driftDiffs.some((d) => d.table === 'parity_drift_fixture' && d.kind === 'type-mismatch'),
      'A 段：漂移 fixture 经 --schema 通路 → exit 1 + type-mismatch',
      `exit=${drift.exit} diffs=${JSON.stringify(driftDiffs.map((d) => `${d.table}:${d.kind}`))}`.slice(0, 200),
    );
    push(
      driftDiffs.every((d) => d.table !== 'parity_clean_fixture'),
      'A 段：同一趟里的干净表 0 差异（上一条不是永真）',
      `clean diffs=${driftDiffs.filter((d) => d.table === 'parity_clean_fixture').length}`,
    );
  } catch (error) {
    lines.push(`SKIP A 段漂移 fixture 端到端（真库往返跑不到：${String(error.message || error).split('\n')[0]}）`);
    process.stdout.write(
      `⚠ SKIP：漂移 fixture 的 A 段端到端阻断在本机跑不到，退出码非 0 只由"缺 schema 源 → exit 2"这一条自证。这不是通过，请在交付报告里如实登记。\n`,
    );
  }
  // 缺 schema 源必须给可读错误而不是崩
  const ghost = path.join(REPO, 'tools', 'fixtures', 'selftest', 'no-such-schema.ts');
  const r = await runParity({ section: 'A', schemaPath: path.relative(REPO, ghost), quiet: true });
  push(r.exit === 2 && r.reason === 'missing-schema-source', '缺 schema 源 → exit 2 + missing-schema-source', JSON.stringify(r));
  for (const l of lines) process.stdout.write(`${l}\n`);
  // SKIP 不算通过也不计红 —— 分母里必须看得见它，否则"23/23"会把"真库往返本机没跑到"
  // 这件事洗成绿灯（本机 better-sqlite3 ABI=115 vs node 22 需要 127 就是这种情况）。
  const skipped = lines.filter((l) => l.startsWith('SKIP')).length;
  process.stdout.write(
    `\nddl-parity --self-test：${lines.length - failures.length - skipped}/${lines.length} 通过（SKIP ${skipped}）\n`,
  );
  if (failures.length) process.stdout.write(`失败：\n  - ${failures.join('\n  - ')}\n`);
  return failures.length ? 1 : 0;
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.includes('--self-test')) return selfTest();
  const sectionIdx = argv.indexOf('--section');
  const section = sectionIdx >= 0 ? String(argv[sectionIdx + 1] || 'all').toUpperCase() : 'all';
  const schemaIdx = argv.indexOf('--schema');
  const schemaPath = schemaIdx >= 0 ? argv[schemaIdx + 1] : SCHEMA_SOURCE;
  try {
    const report = await runParity({ section, schemaPath });
    if (argv.includes('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.exit;
  } catch (error) {
    process.stderr.write(`ddl-parity 执行失败：${error && error.stack ? error.stack : error}\n`);
    return 2;
  }
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code ?? 0;
  });
}
