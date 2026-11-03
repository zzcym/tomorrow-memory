#!/usr/bin/env node
/**
 * scripts/release/lib.mjs — T-21 发布护栏脚本共用层（T-21 第 1 轮 a 交付）
 *
 * 定位：本文件是 `account-audit.mjs`（a 轮）/ `preflight.mjs` + `restore-drill.mjs`（b 轮）/
 * `reconcile.mjs`（c 轮）的**唯一共用底座**。它本身不产出任何判据结论，只提供六件事：
 *   1. CLI 解析 + "缺省即 dry-run"（默认安全）
 *   2. 数据红线安全阀 assertSafeTarget（照抄 `packages/server/src/scripts/migrate.ts` 的思路，只读版）
 *   3. 只读打开数据库（sqlite: better-sqlite3 readOnly；pg: DATABASE_URL_TEST + 事务级只读）
 *   4. 统一计数输出 printMetric / requireMetrics / emitSummary
 *   5. 告警通道降级（ALERT_WEBHOOK_URL 未配置 = 标红 + 日志，绝不报错、绝不阻塞）
 *   6. 只读运行时守卫 ro() + 执行面登记 SQL_SURFACE（T-21c-iii 自 reconcile.mjs 原样上收，语义零放宽）
 *
 * 依赖口径：沿用 @tm/server 已有的 better-sqlite3 / pg（sqlite.ts 用的就是 better-sqlite3），
 * 本文件不引入任何新依赖。
 *
 * ⚠ 本地库 ≠ 线上库：本文件里的 seed 只造 os.tmpdir() 下的临时库，用于证明脚本有判定力。
 *   它的任何数字都禁止当作线上规模使用（PRD §6.4-2 步 4 的"本地数字禁入义务"）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根（本文件在 scripts/release/ 下，上溯两级）。 */
export const REPO_ROOT = path.resolve(HERE, '..', '..');

/** 本任务产物的唯一允许落盘面（除 stdout）。 */
export const TMP_ROOT = path.join(os.tmpdir(), `tm-t21-${process.pid}`);

/** PRD §9-3 点名"不许直接动"的两个真库位置 —— 与 migrate.ts:124 的 protectedSqlitePaths() 同口径。 */
export const protectedSqlitePaths = () => [
  path.resolve(REPO_ROOT, 'data.db'),
  path.resolve(REPO_ROOT, 'packages', 'server', 'data.db'),
];

/** 技术设计 §10.2 T-21 行的出口命令约定的默认 fixture。 */
export const DEFAULT_FIXTURE = 'tools/fixtures/schema-fixtures.json';

/* ════════════════════ 0.5 只读运行时守卫（T-21c-iii 由 reconcile.mjs 现版实现原样上收） ════════════════════ */

/**
 * 运行时 SQL 执行面登记表（判据"只读"的可核对证据；语义与上收前的 `reconcile.mjs`/`restore-drill.mjs`
 * 本地版**逐字一致**：同一条语句、同一个 SELECT/PRAGMA 前置断言、同 160 字截断，一条都不许更松）。
 * 模块级共享数组：同进程内所有脚本的 ro() 都登记到这里。
 */
export const SQL_SURFACE = [];

/** 只读语句的唯一入口：非 SELECT/PRAGMA 直接抛，且整条语句进执行面清单。 */
export function ro(sql) {
  const s = String(sql).split(/\s+/).filter(Boolean).join(' ').trim();
  if (!/^(SELECT|PRAGMA)\b/i.test(s)) {
    throw new Error(`本脚本的只读纪律拒绝这条语句：${s.slice(0, 80)}`);
  }
  SQL_SURFACE.push(s.slice(0, 160));
  return s;
}

/* ════════════════════════════ 1. CLI 解析 ════════════════════════════ */

export const HELP_FLAGS = ['--help', '-h'];

/**
 * 统一 CLI 解析。**缺省即 dry-run**（默认安全）。
 * @param {string[]} argv
 * @param {Record<string, {key: string, value?: boolean, help?: string}>} extra 脚本专属开关
 */
export function parseReleaseArgs(argv, extra = {}) {
  const args = {
    dryRun: true,
    execute: false,
    driver: 'both',
    fixture: null,
    db: null,
    json: false,
    iKnowThisIsProd: false,
    allowSingleDriver: false,
    selfTest: false,
    help: false,
    outDir: null,
  };
  const known = {
    '--dry-run': { key: 'dryRun', value: false },
    '--execute': { key: 'execute', value: false },
    '--driver': { key: 'driver', value: true },
    '--fixture': { key: 'fixture', value: true },
    '--db': { key: 'db', value: true },
    '--json': { key: 'json', value: false },
    '--i-know-this-is-prod': { key: 'iKnowThisIsProd', value: false },
    '--allow-single-driver': { key: 'allowSingleDriver', value: false },
    '--self-test': { key: 'selfTest', value: false },
    '--out-dir': { key: 'outDir', value: true },
    ...extra,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (HELP_FLAGS.includes(flag)) {
      args.help = true;
      continue;
    }
    const spec = known[flag];
    if (!spec) {
      throw new Error(
        `未知参数 ${String(flag)}（可用：${Object.keys(known).join(' ')} ${Object.keys(extra).join(' ') || ''}`.trim() +
          '）',
      );
    }
    if (spec.value) {
      const v = argv[(i += 1)];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} 缺少取值`);
      args[spec.key] = v;
    } else {
      args[spec.key] = true;
    }
  }
  if (args.execute) args.dryRun = false;
  // 指向真库必须显式带 --i-know-this-is-prod；带上它即视为放弃"缺省 dry-run"（否则该项无意义）
  if (args.iKnowThisIsProd) args.dryRun = false;
  if (!['both', 'sqlite', 'pg'].includes(args.driver)) {
    throw new Error(`--driver 只接受 sqlite | pg | both，收到：${args.driver}`);
  }
  return args;
}

/* ════════════════════════ 2. 数据红线安全阀 ════════════════════════ */

const isInsideTmp = (p) => {
  const real = path.resolve(p);
  const roots = [TMP_ROOT, os.tmpdir(), path.join(os.tmpdir(), 'tm-t21-' + process.pid)];
  return roots.some((r) => {
    const base = path.resolve(r);
    return real === base || real.startsWith(base + path.sep);
  });
};

/**
 * 只读脚本侧的数据红线守卫。与 migrate.ts 的 assertSafeTarget 同一份受保护名单，但**退出码语义不同**：
 * 本函数只判定，不写库；调用方拿到 `{ok:false}` 必须 `exit 2`。
 *
 * 规则（PRD §6.4-2 步 5c / §10.2 T-21 行的"默认安全"条款）：
 *   R1 目标命中仓库根 data.db / packages/server/data.db 且未带 --i-know-this-is-prod → 拒绝（exit 2）
 *   R2 dry-run（缺省态）下目标不在 os.tmpdir() 内 → 拒绝（exit 2）
 *      —— 想读真库就必须显式 `--i-know-this-is-prod`，没有第三条路
 */
export function assertSafeTarget(args, sqlitePath) {
  const target = path.resolve(sqlitePath);
  const protectedOnes = protectedSqlitePaths();
  if (protectedOnes.includes(target) && !args.iKnowThisIsProd) {
    return {
      ok: false,
      code: 2,
      rule: 'R1',
      target,
      reason:
        `拒绝执行：目标库 ${target} 是仓库内的真库文件。\n` +
        '  本脚本全程只读，但 PRD §6.4-2 步 4 要求"线上生产库实测"必须是一次**显式**动作：\n' +
        '  自检/冒烟请指向 os.tmpdir() 下的临时库；确实要读这个文件，才加 --i-know-this-is-prod。',
    };
  }
  if (args.dryRun && !protectedOnes.includes(target) && !isInsideTmp(target)) {
    return {
      ok: false,
      code: 2,
      rule: 'R2',
      target,
      reason:
        `拒绝执行：--dry-run（缺省态）只允许打开 os.tmpdir() 下的临时库，收到 ${target}。\n` +
        '  真实读取 = 加 --i-know-this-is-prod（它同时会把 dryRun 置 false）。',
    };
  }
  return {
    ok: true,
    target,
    prod: protectedOnes.includes(target),
    label: protectedOnes.includes(target)
      ? `sqlite:${target}（--i-know-this-is-prod 放行 · 只读打开）`
      : `sqlite:${target}`,
  };
}

/* ════════════════════════ 3. 只读打开数据库 ════════════════════════ */

/**
 * sqlite：better-sqlite3 `readonly`（= SQLITE_OPEN_READONLY，与 `file:…?mode=ro` 同一语义；
 * better-sqlite3 默认不开 SQLITE_OPEN_URI，所以传 URI 字符串会被当普通文件名 —— 这里走等价的安全写法）。
 * 驱动与 packages/server/src/db/sqlite.ts 保持同一套，不引新依赖。
 */
export async function openSqliteReadOnly(file) {
  const mod = await import('better-sqlite3');
  const Database = mod.default ?? mod;
  const db = new Database(file, { readonly: true, fileMustExist: true, verbose: null });
  return {
    driver: 'sqlite',
    uri: `file:${path.resolve(file).replace(/\\/g, '/')}?mode=ro`,
    label: `sqlite:${path.resolve(file)}`,
    /** @param {string} sql @param {unknown[]} [params] */
    all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    one(sql, params = []) {
      const rows = db.prepare(sql).all(...params);
      return rows[0];
    },
    async identity() {
      const st = fs.statSync(file);
      const pages = db.prepare('PRAGMA page_count').get();
      return {
        instance: path.resolve(file),
        kind: 'sqlite',
        size_bytes: st.size,
        mtime: st.mtime.toISOString(),
        page_count: pages?.page_count ?? null,
        collected_at: nowStamp(),
      };
    },
    close() {
      db.close();
    },
  };
}

/** pg：只认 DATABASE_URL_TEST；未设置时**不伪装成 PASS**，由调用方打 SKIP（A-18-3 口径：CI 必须真跑）。 */
export function pgUrl() {
  return String(process.env.DATABASE_URL_TEST ?? '').trim();
}

export function pgSkipReason() {
  return (
    '[SKIP] pg 驱动未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。\n' +
    '       这不是 PASS。判据① 要求"SQLite / PG 双驱动同口径各跑一遍"（PRD §6.4-2 步 4），\n' +
    '       CI（T-22）必须带 DATABASE_URL_TEST 真跑这一条。'
  );
}

export async function openPgReadOnly(url) {
  const mod = await import('pg');
  const pg = mod.default ?? mod;
  const client = new pg.Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  // 会话级只读：任何误写都会被服务端拒绝（本模块的 SQL 本来就全是 SELECT，这是一道额外兜底）
  await client.query('SET default_transaction_read_only = on');
  return {
    driver: 'pg',
    uri: 'pg://(URL 已脱敏)',
    label: `pg:${url.replace(/:[^:@/]*@/, ':***@')}`,
    all(sql, params = []) {
      return client.query(sql, params).then((r) => r.rows);
    },
    async one(sql, params = []) {
      const r = await client.query(sql, params);
      return r.rows[0];
    },
    async identity() {
      const r = await client.query(
        "SELECT current_database() AS db, COALESCE(inet_server_addr()::text,'local') AS srv, current_setting('server_version') AS ver",
      );
      return {
        instance: `${r.rows[0]?.srv}/${r.rows[0]?.db}`,
        kind: 'pg',
        server_version: r.rows[0]?.ver,
        collected_at: nowStamp(),
      };
    },
    async close() {
      await client.end();
    },
  };
}

/* ════════════════════════ 临时库装配（a 轮自检 / b、c 轮共用） ════════════════════════ */

/**
 * 在 os.tmpdir() 下用**真实迁移路径**造一份临时 sqlite 库（PRD §6.4-2 步 5c：先迁移）。
 * 等价于 `pnpm --filter @tm/server migrate`，但直接跑 tsx，避免 shell 引号（中文用户目录实测会炸）。
 * 只写 tmpdir，绝不写仓库。
 */
export function runSqliteMigrations(sqliteFile, { log = console.log } = {}) {
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
  const require2 = createRequire(path.join(REPO_ROOT, 'noop.js'));
  let tsxCli;
  try {
    tsxCli = require2.resolve('tsx/cli');
  } catch {
    tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
  if (!fs.existsSync(tsxCli))
    return { ok: false, reason: `找不到 tsx CLI（${tsxCli}）→ 无法加载 @tm/server 的迁移` };
  const migrateTs = path.join(REPO_ROOT, 'packages', 'server', 'src', 'scripts', 'migrate.ts');
  const r = spawnSync(process.execPath, [tsxCli, migrateTs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DB_DRIVER: 'sqlite', SQLITE_PATH: sqliteFile },
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) return { ok: false, reason: `迁移退出码 ${r.status}\n${out.slice(-2000)}` };
  log(`[TMP] 临时库迁移完成（真实迁移路径，非手写 DDL）：${sqliteFile}`);
  return { ok: true, stdout: out };
}

/**
 * tsx CLI 定位（A-49 #111：原 T-21c-iv 留在 `preflight.mjs` 内的本地辅助件，由 T-21c-v 上收为 lib 共用件）。
 * 函数体**逐字照搬**自 `preflight.mjs` 的本地版，未做任何"顺手改进"：
 * 依赖的 `createRequire` / `path` / `REPO_ROOT` 在 lib 与 preflight 两侧同源（preflight 的 REPO_ROOT 本就是 `import { REPO_ROOT } from './lib.mjs'`），
 * 故上收前后**无可观察差异**（解析成功返回 `require.resolve('tsx/cli')`，抛错则回落 `node_modules/tsx/dist/cli.mjs`）。
 */
export function tsxCliPath() {
  const require2 = createRequire(path.join(REPO_ROOT, 'noop.js'));
  try {
    return require2.resolve('tsx/cli');
  } catch {
    return path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
}

/**
 * 读 fixture。**a 轮约定（写给 b/c）**：
 *   `--fixture <path>` = 造数与口径声明文件；脚本优先读其顶层 `release_seed` 块
 *   （`{ users:[{password,pw_policy_version}], wordbooks:[{user_id,data:[…]}], fsrs_cards:[], checkin_logs:[], profiles:[], assessment_cache:[{user_id}] }`）。
 *   tools/fixtures/schema-fixtures.json（T-02 产出，本任务只读）**当前没有 release_seed** →
 *   自动回落到 builtinSeed()，并在输出里明确标注"本地造数样例，非线上口径"。
 *   b/c 轮要接真造数：在**各自归属**的 fixture 里补 release_seed，不要去改 T-02 的文件。
 */
export function loadFixture(p) {
  const abs = path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
  if (!fs.existsSync(abs)) throw new Error(`fixture 不存在：${abs}`);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return { abs, seed: raw?.release_seed ?? null, hasReleaseSeed: Boolean(raw?.release_seed), raw };
}

/** 内置样例造数（只为证明脚本有判定力；数字禁入任何验收材料）。 */
export function builtinSeed() {
  return {
    // 3 个空密码账号：NULL / '' / '   '（步 4 的判空口径是 password IS NULL OR TRIM(password)=''）
    users: [
      { id: 1, phone: '13800000001', password: null, pw_policy_version: 0 },
      { id: 2, phone: '13800000002', password: '', pw_policy_version: 0 },
      { id: 3, phone: '13800000003', password: '   ', pw_policy_version: 0 },
      // Q：已设密码但 pw_policy_version=0 → 上线后第一次登录就被拦进强制改密页
      {
        id: 4,
        phone: '13800000004',
        password: '$2a$10$samplehashaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pw_policy_version: 0,
      },
      {
        id: 5,
        phone: '13800000005',
        password: '$2a$10$samplehashbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        pw_policy_version: 0,
      },
      // 已合规账号
      {
        id: 6,
        phone: '13800000006',
        password: '$2a$10$samplehashccccccccccccccccccccccccccccc',
        pw_policy_version: 1,
      },
    ],
    profiles: [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }],
    wordbooks: [
      { user_id: 1, data: ['apple', 'banana', 'cherry'] },
      { user_id: 2, data: ['dog'] },
      { user_id: 3, data: [] },
      { user_id: 6, data: ['x', 'y'] },
    ],
    fsrs_cards: [
      { user_id: 1, word: 'apple' },
      { user_id: 1, word: 'banana' },
      { user_id: 2, word: 'dog' },
      { user_id: 3, word: 'elk' },
      { user_id: 4, word: 'fox' },
    ],
    checkin_logs: [
      { user_id: 1, date: '2026-09-01' },
      { user_id: 2, date: '2026-09-02' },
      { user_id: 3, date: '2026-09-03' },
    ],
    // 判据⑧：R-41 之前的无主旧行（user_id 为 NULL）
    assessment_cache: [
      { word: 'w1', user_id: null },
      { word: 'w2', user_id: null },
      { word: 'w3', user_id: 6 },
    ],
  };
}

/** 把 seed 写进**临时库**（只 INSERT，全函数零 UPDATE / 零 DELETE / 零 DROP；目标文件必须在 tmpdir 内）。 */
export function seedTempSqlite(sqliteFile, seed) {
  if (!isInsideTmp(sqliteFile))
    throw new Error(`seedTempSqlite 只允许写 tmpdir，收到 ${sqliteFile}`);
  const require2 = createRequire(path.join(REPO_ROOT, 'noop.js'));
  const Database = require2('better-sqlite3');
  const db = new Database(sqliteFile);
  const now = Date.now();
  try {
    // pw_policy_version / password_changed_at 由 001 迁移加列（DEFAULT 0），这里在 INSERT 里直接给值，
    // 不做任何 UPDATE 回填 —— 回填是 R-40 ④ / R-41 ③④ 的红线，发布脚本一律不得示范。
    for (const u of seed.users) {
      db.prepare(
        'INSERT INTO users (id, phone, password, created_at, pw_policy_version, password_changed_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(u.id, u.phone, u.password, now, u.pw_policy_version ?? 0, u.password_changed_at ?? 0);
    }
    for (const p of seed.profiles) {
      db.prepare(
        "INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES (?, '', '', 10, ?)",
      ).run(p.user_id, now);
    }
    for (const w of seed.wordbooks) {
      db.prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)').run(
        w.user_id,
        JSON.stringify(w.data),
        now,
      );
    }
    for (const c of seed.fsrs_cards) {
      db.prepare(
        'INSERT INTO fsrs_cards (user_id, word, fsrs_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(c.user_id, c.word, '{}', now, now);
    }
    for (const k of seed.checkin_logs) {
      db.prepare('INSERT INTO checkin_logs (user_id, date, created_at) VALUES (?, ?, ?)').run(
        k.user_id,
        k.date,
        now,
      );
    }
    for (const a of seed.assessment_cache) {
      db.prepare(
        'INSERT INTO assessment_cache (word, qtype, question, created_at' +
          (a.user_id === undefined ? '' : ', user_id') +
          ') VALUES (?, ?, ?, ?' +
          (a.user_id === undefined ? '' : ', ?') +
          ')',
      ).run(
        ...(a.user_id === undefined
          ? [a.word, 'meaning', 'q', now]
          : [a.word, 'meaning', 'q', now, a.user_id]),
      );
    }
  } finally {
    db.close();
  }
  return seed;
}

/* ════════════════════════ 4. 计数输出与出口门禁 ════════════════════════ */

/** 本轮运行内收集到的全部指标（printMetric 是唯一写入口）。 */
const REGISTRY = { metrics: [], drivers: [], gates: [], notes: [] };

/**
 * 门禁分档（T-21d：**报红必须能拦人** —— 一条 `[GATE] xxx → FAIL` 打出来而脚本 exit 0，等于没有检查）。
 *   · `hard`     —— 红线门：失败即不得发布 → 贡献 exit 2。升 hard 的取证口径只有三条：写数据 / 触碰真库 / 契约破坏面。
 *   · `soft`     —— **默认档**：失败即拦人 → 贡献 exit 1。未登记分级的门一律落这里（从严，不留整片放行）。
 *   · `advisory` —— 咨询性门：只标红提示，**不进退出码**。必须是调用方分级表里逐条写了理由的白名单条目。
 */
export const GATE_LEVELS = ['hard', 'soft', 'advisory'];

export function resetRegistry() {
  REGISTRY.metrics = [];
  REGISTRY.drivers = [];
  REGISTRY.gates = [];
  REGISTRY.notes = [];
}

export function printMetric(name, value, driver) {
  REGISTRY.metrics.push({ name, value, driver: driver ?? 'n/a' });
  console.log(`[METRIC] driver=${driver ?? 'n/a'} ${name}=${value}`);
}

/**
 * 人话结论行（判据是否成立），机器可读部分进 emitSummary。
 * `level` 缺省 `soft` —— 即**任何一条门失败都会改退出码**；想"只提示不拦人"必须由调用方显式登记为 advisory。
 * 行首 `[GATE] ${id} → ${PASS|FAIL}` 前缀逐字保持不变（`manifest.spec.ts:157` 按前缀断言），档位只追加在行尾。
 */
export function printGate(id, pass, detail, level = 'soft', reason = null) {
  const lv = GATE_LEVELS.includes(level) ? level : 'soft';
  if (lv !== level)
    console.log(`[GATE-TIER] ${id} 要求了未知档位 ${JSON.stringify(level)} → 按最严的 soft 处理`);
  REGISTRY.gates.push({ id, pass, detail, level: lv, reason });
  console.log(
    `[GATE] ${id} → ${pass ? 'PASS' : 'FAIL'}${detail ? ` :: ${detail}` : ''} · 档位=${lv}`,
  );
  return pass;
}

/** 注册表里全部门禁的浅拷贝（供退出码归因与自证打印）。 */
export function registryGates() {
  return REGISTRY.gates.map((g) => ({ ...g }));
}

/**
 * 门 → 退出码贡献的**唯一算式**：hard 红 = 2，soft 红 = 1，advisory 红 = 0；未登记档位的按 soft。
 * 真跑（喂 `registryGates()`）与 `--self-test` 的疫苗（喂影子数组）**共用这一份**，
 * 这样疫苗能证明"这条门确实会翻退出码"，又不碰真的注册表与真退出码。
 */
export function gateExitContrib(gates) {
  const list = Array.isArray(gates) ? gates : [];
  const tierOf = (g) => (GATE_LEVELS.includes(g.level) ? g.level : 'soft');
  const failed = list.filter((g) => g.pass === false);
  const hard = failed.filter((g) => tierOf(g) === 'hard');
  const soft = failed.filter((g) => tierOf(g) === 'soft');
  const advisory = failed.filter((g) => tierOf(g) === 'advisory');
  return {
    code: hard.length ? 2 : soft.length ? 1 : 0,
    hard,
    soft,
    advisory,
    failed,
    total: list.length,
  };
}

export function note(text) {
  REGISTRY.notes.push(text);
  console.log(`[NOTE] ${text}`);
}

/** 缺任一项 → {missing:[…]}，调用方据此 exit 1。 */
export function requireMetrics(list, driver = null) {
  const have = new Set(
    REGISTRY.metrics.filter((m) => !driver || m.driver === driver).map((m) => m.name),
  );
  const missing = list.filter((n) => !have.has(n));
  if (missing.length) {
    console.log(`[FAIL] ${driver ? `driver=${driver} ` : ''}缺失计数项：${missing.join(', ')}`);
    return { ok: false, missing };
  }
  return { ok: true, missing: [] };
}

export function nowStamp() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` +
    `:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** 末尾机器可读小结（PRD §6.4-2b 第 1 行"库标识 + 执行时间"的自证义务）。 */
export function emitSummary({ task, verdict, exitCode, targets, extra = {} }) {
  const summary = {
    task,
    verdict,
    exit_code: exitCode,
    collected_at: nowStamp(),
    drivers: REGISTRY.drivers,
    targets,
    metrics: REGISTRY.metrics,
    gates: REGISTRY.gates,
    notes: REGISTRY.notes,
    ...extra,
  };
  console.log('\n===== 机器可读小结 =====');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

/* ════════════════════════ 5. 告警通道降级（R-24 ⑩ / §6.4-2 步 5b） ════════════════════════ */

/**
 * 只读地描述告警通道状态。**硬判据：未配置绝不报错、绝不阻塞发布** —— 本函数只返回事实，
 * 阻塞与否由调用方按"降级 = 明确判定为通过"处理。真实 URL 永不打印（可能携带密钥）。
 */
export function getAlertChannel(env = process.env) {
  const raw = String(env.ALERT_WEBHOOK_URL ?? '').trim();
  if (!raw) {
    return {
      configured: false,
      blocking: false,
      verdict: 'PASS（降级）',
      red_flag: '告警通道未配置，本期依赖发布前强制读回',
      note:
        'ALERT_WEBHOOK_URL 未配置 → 按 PRD §6.4-2 步 5b (A)② 降级为"只做 (B) 的强制读回 + 检查日志里没有未捕获异常"，' +
        '并明确判定为通过；在 preflight 结果里标红 + 写日志即可，**不得报错、不得阻塞**（R-24 ⑩ / §6.4-7）。',
    };
  }
  let host = '(不可解析)';
  try {
    host = new URL(raw).host;
  } catch {
    /* 故意不抛：解析不了也只影响展示 */
  }
  return {
    configured: true,
    blocking: false,
    verdict: '已配置（待 (A)① 演练取证）',
    host,
    note: '已配置：需在临时实例上人为让一次备份失败，确认 ≤60 秒收到 1 条四要素消息，且正常备份收到 0 条（步 5b (A)①）。',
  };
}

/**
 * 只出站通知；成功路径不发（防噪音，步 5b ③ 的阻断条件就是"正常备份也发通知"）。
 * 任何异常都被吞成 {sent:false, reason} —— 这条通道**永不拖挂任务**（步 5b ②）。
 */
export async function sendFailureAlert(channel, payload) {
  if (!channel?.configured) {
    return {
      sent: false,
      reason: 'ALERT_WEBHOOK_URL 未配置 → 降级为写日志（不报错、不阻塞）',
      logged: logLine(`ALERT(degraded) ${JSON.stringify(payload)}`),
    };
  }
  const url = String(process.env.ALERT_WEBHOOK_URL ?? '').trim();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      sent: res.ok,
      http_status: res.status,
      reason: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { sent: false, reason: `发送失败已吞错：${e instanceof Error ? e.message : String(e)}` };
  }
}

let LOG_FILE = null;
export function setLogFile(p) {
  LOG_FILE = p;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
export function logLine(line) {
  const stamped = `${nowStamp()} ${line}\n`;
  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, stamped);
    } catch {
      /* 日志写不进去不影响判定 */
    }
  }
  return stamped;
}

/* ════════════════════════ 6. 只读 SQL 自证（R-41 ④ / §6.1"只加不改不删"） ════════════════════════ */

export const WRITE_STATEMENT_KEYWORDS = [
  'UPDATE',
  'DELETE',
  'DROP',
  'INSERT',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'VACUUM',
  'ATTACH',
];

/** 扫描前先去注释：判据要管的是**可执行语句**，散文里提到这些词不该算违规。 */
function stripJsComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * 扫描一段源码/SQL，找出任何写语句。判据⑧ 与步 6 的硬约束是"脚本内不得出现 UPDATE assessment_cache / DELETE"，
 * 这里把它做成**可执行的自检**而不是纸面承诺。返回违规命中数组（空 = 干净）。
 * 注意：只去注释、不去字符串 —— 字符串里的写关键字同样算命中（逼着脚本把说明性文字写在注释里）。
 */
export function scanForWriteStatements(text, label) {
  const hits = [];
  const body = stripJsComments(text);
  const re = new RegExp(`\\b(${WRITE_STATEMENT_KEYWORDS.join('|')})\\b`, 'gi');
  for (const m of body.matchAll(re)) {
    const line = body.slice(0, m.index ?? 0).split('\n').length;
    hits.push({ label, word: String(m[1]).toUpperCase(), line });
  }
  return hits;
}

/** 供 account-audit.mjs 自扫：脚本文件本体必须零写语句。 */
export function assertScriptIsReadOnlySelf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const hits = scanForWriteStatements(text, path.basename(file));
  return { ok: hits.length === 0, hits };
}

/* ════════════════════════ 7. 安全阀自检 ════════════════════════ */

/** `--self-test`：打印安全阀到底拒了什么（任务要求"哪怕只是脚本 --self-test 打印它拒了什么"）。 */
export function runSafetySelfTest() {
  const cases = [
    {
      name: '仓库根 data.db + 未带 --i-know-this-is-prod',
      args: { dryRun: true, iKnowThisIsProd: false },
      file: protectedSqlitePaths()[0],
      expectReject: true,
    },
    {
      name: 'packages/server/data.db + 未带 --i-know-this-is-prod',
      args: { dryRun: true, iKnowThisIsProd: false },
      file: protectedSqlitePaths()[1],
      expectReject: true,
    },
    {
      name: '仓库根 data.db + dry-run（R2 也应拒）',
      args: { dryRun: true, iKnowThisIsProd: false },
      file: protectedSqlitePaths()[0],
      expectReject: true,
    },
    {
      name: '仓库根 data.db + --i-know-this-is-prod（只读放行，但日志标注）',
      args: { dryRun: false, iKnowThisIsProd: true },
      file: protectedSqlitePaths()[0],
      expectReject: false,
    },
    {
      name: 'tmpdir 下的临时库 + dry-run（放行）',
      args: { dryRun: true, iKnowThisIsProd: false },
      file: path.join(TMP_ROOT, 'copy.db'),
      expectReject: false,
    },
    {
      name: '非 tmpdir 的一般外部库 + dry-run（R2 拒）',
      args: { dryRun: true, iKnowThisIsProd: false },
      file: path.join(REPO_ROOT, 'examples.db'),
      expectReject: true,
    },
  ];
  let pass = 0;
  console.log('--- 数据红线安全阀自检（拒 / 放行 逐项取证） ---');
  for (const c of cases) {
    const r = assertSafeTarget(c.args, c.file);
    const rejected = !r.ok;
    const ok = rejected === c.expectReject;
    pass += ok ? 1 : 0;
    console.log(
      `  ${ok ? 'OK  ' : 'BAD '} [${rejected ? 'REJECT ' + r.rule : 'ALLOW  '}] ${c.name}`,
    );
    if (rejected) console.log(`        → 拒绝原因首行：${r.reason.split('\n')[0]}`);
  }
  const argsReject = (() => {
    try {
      parseReleaseArgs(['--nope']);
      return false;
    } catch (e) {
      console.log(
        `  OK   [REJECT ] 未知 CLI 参数 → ${e instanceof Error ? e.message.split('（')[0] : ''}`,
      );
      return true;
    }
  })();
  const missingValue = (() => {
    try {
      parseReleaseArgs(['--driver']);
      return false;
    } catch {
      console.log('  OK   [REJECT ] --driver 缺取值');
      return true;
    }
  })();
  console.log(
    `  ${pass}/${cases.length} 路径判定符合预期；参数解析拒判 ${argsReject && missingValue ? 'OK' : 'BAD'}`,
  );
  return { pass, total: cases.length, allOk: pass === cases.length && argsReject && missingValue };
}

/* ════════════════════════ 8. 杂项 ════════════════════════ */

/** 短哈希指纹：用于"user_id 集合快照（脱敏或哈希化）"（§6.6-2 产物义务）。 */
export function fingerprintInts(ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  return {
    count: sorted.length,
    sha256_12: crypto.createHash('sha256').update(sorted.join(',')).digest('hex').slice(0, 12),
  };
}

export function resolveRepoPath(p) {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

export async function importFromRepo(relPath) {
  return import(pathToFileURL(path.join(REPO_ROOT, relPath)).href);
}

export function cleanupTmpRoot() {
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响判定 */
  }
}
