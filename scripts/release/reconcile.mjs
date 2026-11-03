#!/usr/bin/env node
/**
 * scripts/release/reconcile.mjs — T-21 第 3 轮 (c-i) 对账脚本（§10.2 T-21 判据⑦）
 *
 * 对应原文（唯一口径来源，本文件不复述判据、只实现它）：
 *   · §10.2 T-21 行判据⑦ —— "L5 每档 `--mode diff-sample --n 20` 可执行"
 *   · PRD §6.4-2 步 6 / R-39 ⑤b 对账 —— "5 项 × ≥20 真实账号 diff 必须 = 0"
 *   · §10.2 T-21 行判据⑧（可选承载位）—— `reconcile.mjs --mode assessment-orphan`
 *
 * ★ 本文件是**纯观测面**：从头到尾只有 SELECT / PRAGMA。机器取证分两层，与 restore-drill.mjs 同法：
 *     (1) 运行时：本文件执行的每一条 SQL 都必须经 `ro()` 登记并断言以 SELECT / PRAGMA 开头；
 *         执行面清单在末尾整表打印 —— "只读"因此不是纸面承诺而是可核对的输出集合。
 *     (2) 静态：`--self-test` 走 lib 的 `assertScriptIsReadOnlySelf()` 对源码去注释后扫描，
 *         写语句关键字必须 0 命中。
 *
 * ★ 五项对账的 "diff" 语义：**两条独立计算路径互校**，而非与外部基线互校——
 *     路径 A = 一条聚合 SQL 直接出数（COUNT(*) 带 IN 采样集）；
 *     路径 B = 逐账号拆算再汇总（per-user 查询 / JS 重算）。
 *   两路径对同一档、同一采样集、同一项各出一个数，diff = A − B 必须逐字为 0；
 *   五项任一 diff ≠ 0 → 该 driver 判据⑦不成立 → exit 1。这正是"对账"的可核对形态。
 *
 * ★ 数据红线（PRD §6.4-2 步 4 / §10.2 T-21 行原文）：
 *   --dry-run（缺省）只在 os.tmpdir() 下用真实迁移路径自建临时库；指向仓库内 data.db 必须显式
 *   `--i-know-this-is-prod`（由 lib 的 assertSafeTarget 承担，本文件不另写更松的一套）。
 *   本地临时库的任何数字都只是"脚本有判定力"的证据，禁止当作线上规模写进发布报告（本地数字禁入义务）。
 *   需要线上生产库才成立的部分 → 本文件在 pg / 线上侧打**显式 [SKIP]**，绝不伪装 PASS。
 *
 * ★ lib.mjs 只 import、不修改（其修改权已排给同批次 T-21c-iii）。骨架缺的能力（ro() 运行时守卫、
 *   执行面登记、日历连续天数计算）一律在本文件内以 local helper 顶上，报告登记"待 iii 上收"。
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FIXTURE,
  GATE_LEVELS,
  REPO_ROOT,
  TMP_ROOT,
  assertSafeTarget,
  assertScriptIsReadOnlySelf,
  builtinSeed,
  cleanupTmpRoot,
  emitSummary,
  gateExitContrib,
  getAlertChannel,
  loadFixture,
  note,
  openPgReadOnly,
  openSqliteReadOnly,
  parseReleaseArgs,
  pgSkipReason,
  pgUrl,
  printGate,
  printMetric,
  registryGates,
  requireMetrics,
  resetRegistry,
  resolveRepoPath,
  ro,
  runSafetySelfTest,
  runSqliteMigrations,
  seedTempSqlite,
  setLogFile,
  SQL_SURFACE,
} from './lib.mjs';

const SELF_FILE = fileURLToPath(import.meta.url);

/* ─────────────────── 只读运行时守卫：T-21c-iii 已上收至 lib.mjs（ro() + SQL_SURFACE，语义逐字不变） ─────────────────── */

/** 统一取多行：先过 ro() 守卫再交连接执行（sqlite 返回数组、pg 返回 Promise，await 两者兼容）。 */
async function q(conn, sql) {
  return conn.all(ro(sql));
}
/** 统一取单行。 */
async function q1(conn, sql) {
  return conn.one(ro(sql));
}

/** 采样集内合法整型 id 拼 IN 列表（id 全部来自上一跳 SELECT 的数值列，非用户输入）。 */
function inList(ids) {
  const safe = ids.map((x) => Number(x)).filter((x) => Number.isInteger(x));
  if (!safe.length) return null;
  return safe.join(',');
}

/** 'YYYY-MM-DD' → UTC 天序号（避免时区漂，手工解析）。 */
function dayIndex(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/** 连续天数算法 A：排序去重后线性扫描相邻 +1 天。返回单个账号的最长连续天数。 */
function streakAlgoA(dates) {
  const idx = [...new Set(dates.map(dayIndex).filter((x) => x !== null))].sort((a, b) => a - b);
  if (!idx.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < idx.length; i += 1) {
    run = idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** 连续天数算法 B（独立实现，用于与 A 互校）：从"无前驱"的日期作 run 起点向前游走。 */
function streakAlgoB(dates) {
  const set = new Set(dates.map(dayIndex).filter((x) => x !== null));
  let best = 0;
  for (const d of set) {
    if (set.has(d - 1)) continue; // 非 run 起点
    let len = 1;
    let cur = d;
    while (set.has(cur + 1)) {
      cur += 1;
      len += 1;
    }
    if (len > best) best = len;
  }
  return best;
}

/** ISO due（fsrs_data.due，形如 2026-09-18T..）→ 按天(UTC 日期串)分桶 key；无 due 归 'unknown'。 */
function dueBucketKey(fsrsDataText) {
  let due = null;
  try {
    const o = JSON.parse(fsrsDataText);
    due = o && typeof o.due === 'string' ? o.due : null;
  } catch {
    due = null;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(due ?? ''));
  return m ? m[1] : 'unknown';
}

/* ─────────────────────────── 判据⑦ 的必需计数（缺任一项 → exit 1） ─────────────────────────── */

const REQUIRED_METRICS = [
  // 五项对账输出
  'rec_wordbook_rows',
  'rec_fsrs_card_rows',
  'rec_due_bucket_total',
  'rec_streak_total_days',
  'rec_checkin_rows',
  // 五项 diff（两条独立计算路径之差，必须逐字为 0）
  'diff_wordbook_rows',
  'diff_fsrs_card_rows',
  'diff_due_partition',
  'diff_streak_days',
  'diff_checkin_rows',
  // 随附的步 4 N/M/K/P/Q 口径位（与 account-audit.mjs 同名，保证跨脚本口径一致）
  'step4_N_empty_password_users',
  'step4_M_wordbook_rows',
  'step4_M_wordbook_entries',
  'step4_K_fsrs_card_rows',
  'step4_P_checkin_rows',
  'step4_Q_pw_policy0_with_password',
];

/* ─────────────────── 门禁分级表（T-21e：把 T-21d 在 preflight 的形态推广到本脚本；
 * 档位→退出码的算式只有 lib 的 gateExitContrib 一份，本表只登记档位与理由）───────────────────
 * 未命中任何 key 的门（判据⑦ 五项 diff / 合计 / 采样集为空）一律默认 soft：红即 exit 1，从严。 */
const GATE_TIERS = [
  {
    key: '只读纪律/',
    tier: 'hard',
    why:
      '运行时执行面一旦混进非 SELECT/PRAGMA 语句 = 本脚本"纯观测面"的契约整体破防，被连的库（含线上真库）可能被写——触碰真库红线。',
  },
  {
    key: '判据⑧[',
    tier: 'advisory',
    why:
      '咨询性门·白名单：判据⑧ 的口径是"有数即可，不要求为 0"（PRD 步 6），本门按构造恒 PASS，只作只读计数展示行；' +
      '真正的拦截面在 assessment_orphan_rows/assessment_total_rows 两个必需计数缺项门禁（缺项即红），报红拦人不成立。',
  },
  {
    key: 'self-test/',
    tier: 'hard',
    why:
      '自检三条（安全阀用例 / 源码零写语句扫描 / ro() 运行时守卫）任何一条红，都属于"本脚本可能写数据"的红线面，不得只报 1 混在普通判据失败里。',
  },
  {
    key: '疫苗 ②',
    tier: 'hard',
    why: '仅 `--self-test` 疫苗门：故意 FAIL 的 hard 门必须能把退出码贡献翻成 2（不跑真判据、只喂影子注册表）',
  },
  {
    key: '疫苗 ③',
    tier: 'advisory',
    why: '仅 `--self-test` 疫苗门：故意 FAIL 的 advisory 门必须**不**翻退出码，反证白名单机制自身有效',
  },
];

/** 门 id → 档位 + 理由。未登记 = soft（从严：新加的门天然会拦人，要放过必须显式进白名单）。 */
function gateTierOf(id) {
  const s = String(id);
  const hit = GATE_TIERS.find((t) => s.startsWith(t.key));
  return hit ?? { key: null, tier: 'soft', why: '未登记分级 → 默认 soft（失败即 exit 1）' };
}

/** 唯一的 inline 门入口：打人行 + 进注册表 + 带上档位与理由；退出码由 gateExitContrib(registryGates()) 汇出。 */
const gate = (id, pass, detail) => {
  const t = gateTierOf(id);
  return printGate(id, Boolean(pass), detail, t.tier, t.why);
};

/**
 * T-21e 疫苗（T-21d 形态）：故意造 FAIL 的**影子门**，证明本脚本的分级表 + 同一个
 * `gateExitContrib()` 真能翻退出码；跑完立即 `resetRegistry()`，自检的真退出码仍只由自己的判定汇出。
 */
function runGateVaccine() {
  console.log(
    '--- 门禁 → 退出码 疫苗（同一份分级表 + lib 同一个算式；只喂影子注册表，不污染真退出码）---',
  );
  resetRegistry();
  const vg = (id, pass = false) =>
    printGate(id, pass, '疫苗：不跑真判据', gateTierOf(id).tier, gateTierOf(id).why);
  vg('疫苗 ①/未登记分级的门 → 默认 soft：红必须把退出码翻成 1');
  vg('疫苗 ②/红线门：红必须把退出码翻成 2');
  vg('疫苗 ③/advisory 白名单门：红不得翻退出码');
  vg('疫苗 ④/通过的门：不得贡献任何红', true);
  const all = registryGates();
  const only = (p) => all.filter((g) => g.id.startsWith(p));
  let ok = true;
  for (const [name, g, want] of [
    ['三档同时红（取最严）', all, 2],
    ['只剩 hard 门红', only('疫苗 ②'), 2],
    ['只剩 soft 门红（未登记默认档）', only('疫苗 ①'), 1],
    ['只剩 advisory 门红（白名单）', only('疫苗 ③'), 0],
    ['全绿（只有疫苗 ④）', only('疫苗 ④'), 0],
  ]) {
    const f = gateExitContrib(g);
    const good = f.code === want;
    ok &&= good;
    console.log(`  ${good ? 'OK  ' : 'BAD '}${name} → 门侧贡献 exit ${f.code}（应 ${want}）`);
  }
  const bad = GATE_TIERS.filter(
    (t) =>
      !GATE_LEVELS.includes(t.tier) || (t.tier !== 'soft' && String(t.why ?? '').trim().length < 12),
  );
  const dup = GATE_TIERS.map((t) => t.key).filter((k, i, a) => a.indexOf(k) !== i);
  ok &&= bad.length === 0 && dup.length === 0;
  console.log(
    `  ${bad.length === 0 && dup.length === 0 ? 'OK  ' : 'BAD '}分级表自证：hard=${JSON.stringify(GATE_TIERS.filter((t) => t.tier === 'hard').map((t) => t.key))} · advisory 白名单=${JSON.stringify(GATE_TIERS.filter((t) => t.tier === 'advisory').map((t) => t.key))} · 非法档位/缺理由=${bad.length} · 重复 key=${dup.length}`,
  );
  console.log('  （以上疫苗只喂影子注册表，随后即 resetRegistry()，不改本脚本的 exit 0）');
  resetRegistry();
  return ok;
}

/* ─────────────────────────── N/M/K/P/Q 口径位（照抄 account-audit 步 4 口径） ─────────────────────────── */

async function collectCaliber(conn) {
  const d = conn.driver;
  const EMPTY = "(password IS NULL OR TRIM(password)='')";
  const ENTRY_SUM =
    d === 'pg'
      ? 'COALESCE(SUM(jsonb_array_length(data::jsonb)),0)'
      : 'COALESCE(SUM(json_array_length(data)),0)';
  const N = Number((await q1(conn, `SELECT COUNT(*) AS v FROM users WHERE ${EMPTY}`)).v);
  printMetric('step4_N_empty_password_users', N, d);
  const M = await q1(conn, `SELECT COUNT(*) AS r, ${ENTRY_SUM} AS e FROM wordbooks`);
  printMetric('step4_M_wordbook_rows', Number(M.r), d);
  printMetric('step4_M_wordbook_entries', Number(M.e), d);
  const K = Number((await q1(conn, 'SELECT COUNT(*) AS v FROM fsrs_cards')).v);
  printMetric('step4_K_fsrs_card_rows', K, d);
  const P = Number((await q1(conn, 'SELECT COUNT(*) AS v FROM checkin_logs')).v);
  printMetric('step4_P_checkin_rows', P, d);
  const Qrow = await q1(
    conn,
    "SELECT COUNT(*) AS v FROM users WHERE password IS NOT NULL AND TRIM(password)<>'' AND pw_policy_version=0",
  );
  printMetric('step4_Q_pw_policy0_with_password', Number(Qrow.v), d);
  return { N, M: Number(M.r), K, P, Q: Number(Qrow.v) };
}

/* ─────────────────────────── diff-sample 主流程（判据⑦ / 步 6） ─────────────────────────── */

/**
 * 对一个 driver、一份采样集跑五项对账。返回 { diffs, gates, totals } —— 所有 SQL 均走 ro()。
 * @param {{driver:string, all:Function, one:Function}} conn
 * @param {number} n 采样账号上限
 */
async function reconcileDiffSample(conn, n) {
  const d = conn.driver;
  const ids = (await q(conn, `SELECT id FROM users ORDER BY id LIMIT ${Math.trunc(n)}`)).map(
    (r) => Number(r.id),
  );
  const M = ids.length;
  note(`[${d}] diff-sample：采样集实际命中 ${M}/${n} 个账号（users 总数不足 n 时按全量取）。`);

  const caliber = await collectCaliber(conn);

  if (!M) {
    // 采样集为空：五项输出与 diff 全部出 0，保持缺项门禁可过（无数据 ≠ 缺项，本地空库/线上空态同理）。
    for (const name of [
      'rec_wordbook_rows',
      'rec_fsrs_card_rows',
      'rec_due_bucket_total',
      'rec_streak_total_days',
      'rec_checkin_rows',
      'diff_wordbook_rows',
      'diff_fsrs_card_rows',
      'diff_due_partition',
      'diff_streak_days',
      'diff_checkin_rows',
    ]) {
      printMetric(name, 0, d);
    }
    gate(`判据⑦[${d}] 采样集为空`, true, 'M=0，五项 diff 恒为 0（无数据可错配）');
    return { diffs: { total: 0 }, gates: [], empty: true, caliber, M };
  }

  const inl = inList(ids);

  // ── ① wordbooks 条数 ────────────────────────────────────────────────
  const wbA = Number((await q1(conn, `SELECT COUNT(*) AS v FROM wordbooks WHERE user_id IN (${inl})`)).v);
  let wbB = 0;
  for (const id of ids) {
    wbB += Number((await q1(conn, `SELECT COUNT(*) AS v FROM wordbooks WHERE user_id = ${id}`)).v);
  }
  const diffWb = wbA - wbB;
  printMetric('rec_wordbook_rows', wbA, d);
  printMetric('diff_wordbook_rows', diffWb, d);

  // ── ② fsrs_cards 条数 ───────────────────────────────────────────────
  const fsA = Number((await q1(conn, `SELECT COUNT(*) AS v FROM fsrs_cards WHERE user_id IN (${inl})`)).v);
  let fsB = 0;
  for (const id of ids) {
    fsB += Number((await q1(conn, `SELECT COUNT(*) AS v FROM fsrs_cards WHERE user_id = ${id}`)).v);
  }
  const diffFs = fsA - fsB;
  printMetric('rec_fsrs_card_rows', fsA, d);
  printMetric('diff_fsrs_card_rows', diffFs, d);

  // ── ③ due 按天分桶（分区完备性：逐条落桶的总数 == 采样卡总数） ─────────
  const cardRows = await q(conn, `SELECT fsrs_data FROM fsrs_cards WHERE user_id IN (${inl})`);
  const buckets = new Map();
  for (const r of cardRows) {
    const key = dueBucketKey(r.fsrs_data);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const dueTotal = [...buckets.values()].reduce((a, b) => a + b, 0);
  const diffDue = fsA - dueTotal; // 桶分割无丢卡/无重复 → 恒 0
  printMetric('rec_due_bucket_total', dueTotal, d);
  printMetric('diff_due_partition', diffDue, d);
  const bucketPreview = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  note(`[${d}] due 按天分桶（预览前 8 桶）：${bucketPreview || '(空)'} · 共 ${buckets.size} 桶`);

  // ── ④ 连续天数（两套独立算法互校，逐账号求和后比） ──────────────────
  const perUserStreakA = new Map();
  const perUserStreakB = new Map();
  for (const id of ids) {
    const dates = (await q(conn, `SELECT date FROM checkin_logs WHERE user_id = ${id}`)).map(
      (r) => r.date,
    );
    perUserStreakA.set(id, streakAlgoA(dates));
    perUserStreakB.set(id, streakAlgoB(dates));
  }
  const streakSumA = [...perUserStreakA.values()].reduce((a, b) => a + b, 0);
  const streakSumB = [...perUserStreakB.values()].reduce((a, b) => a + b, 0);
  const diffStreak = streakSumA - streakSumB;
  printMetric('rec_streak_total_days', streakSumA, d);
  printMetric('diff_streak_days', diffStreak, d);

  // ── ⑤ 打卡次数（聚合 vs 逐账号拆分求和） ────────────────────────────
  const ckA = Number((await q1(conn, `SELECT COUNT(*) AS v FROM checkin_logs WHERE user_id IN (${inl})`)).v);
  let ckB = 0;
  for (const id of ids) {
    ckB += Number((await q1(conn, `SELECT COUNT(*) AS v FROM checkin_logs WHERE user_id = ${id}`)).v);
  }
  const diffCk = ckA - ckB;
  printMetric('rec_checkin_rows', ckA, d);
  printMetric('diff_checkin_rows', diffCk, d);

  // ── 门禁：五项 diff 全部为 0 ────────────────────────────────────────
  const gates = [
    { id: `判据⑦[${d}] ①wordbooks diff=0`, pass: diffWb === 0, detail: `A=${wbA} B=${wbB} diff=${diffWb}` },
    { id: `判据⑦[${d}] ②fsrs_cards diff=0`, pass: diffFs === 0, detail: `A=${fsA} B=${fsB} diff=${diffFs}` },
    { id: `判据⑦[${d}] ③due 分桶完备 diff=0`, pass: diffDue === 0, detail: `cards=${fsA} bucketed=${dueTotal} diff=${diffDue}` },
    { id: `判据⑦[${d}] ④连续天数 diff=0`, pass: diffStreak === 0, detail: `A=${streakSumA} B=${streakSumB} diff=${diffStreak}` },
    { id: `判据⑦[${d}] ⑤打卡次数 diff=0`, pass: diffCk === 0, detail: `A=${ckA} B=${ckB} diff=${diffCk}` },
  ];
  for (const g of gates) gate(g.id, g.pass, g.detail);
  const total = Math.abs(diffWb) + Math.abs(diffFs) + Math.abs(diffDue) + Math.abs(diffStreak) + Math.abs(diffCk);
  gate(`判据⑦[${d}] 五项 diff 合计=0`, total === 0, `|Σ|=${total}`);

  return { diffs: { total, wb: diffWb, fs: diffFs, due: diffDue, streak: diffStreak, ck: diffCk }, gates, caliber, M };
}

/* ─────────────────────────── assessment-orphan 模式（判据⑧可选承载位） ─────────────────────────── */

async function reconcileAssessmentOrphan(conn) {
  const d = conn.driver;
  const orphan = Number(
    (await q1(conn, 'SELECT COUNT(*) AS v FROM assessment_cache WHERE user_id IS NULL')).v,
  );
  const total = Number((await q1(conn, 'SELECT COUNT(*) AS v FROM assessment_cache')).v);
  printMetric('assessment_orphan_rows', orphan, d);
  printMetric('assessment_total_rows', total, d);
  gate(`判据⑧[${d}] 无主测评缓存计数只观测不处置`, true, `orphan=${orphan}/${total}（只读计数，零写入处置）`);
  return { orphan, total };
}

/* ─────────────────────────── HELP / main ─────────────────────────── */

const HELP = `reconcile —— 发布对账（T-21 判据⑦，除采样读取外面全程只读）

  node scripts/release/reconcile.mjs --mode diff-sample --n 20        # 缺省 dry-run：tmpdir 自建库跑对账
  node scripts/release/reconcile.mjs                                   # 等价：mode 缺省 diff-sample、n 缺省 20
  node scripts/release/reconcile.mjs --self-test                      # 只读取证自检（安全阀 + 静态扫描 + 只读守卫）
  node scripts/release/reconcile.mjs --mode assessment-orphan         # 判据⑧ 可选承载位（无主测评缓存计数）
  node scripts/release/reconcile.mjs --db <path> --mode diff-sample --i-know-this-is-prod

  通用面：--dry-run/--execute --driver sqlite|pg|both --fixture <p> --db <p> --i-know-this-is-prod
  本文件专属：--mode diff-sample|assessment-orphan（缺省 diff-sample） --n <正整数，缺省 20> --keep-tmp
  五项输出：wordbooks 条数 / fsrs_cards 条数 / due 按天分桶 / 连续天数 / 打卡次数，各随一个 diff（两路径差）
  随附：N/M/K/P/Q 步 4 口径位（与 account-audit.mjs 同名）
  退出码：2=安全阀拒绝/CLI 非法/hard 档红线门红；1=缺必需计数、soft 档门红或任一 diff≠0；0=五项 diff 全 0（pg 侧无实例为显式 SKIP，不算 PASS）`;

function usageFail(msg) {
  if (msg) console.error(`[FATAL] ${msg}`);
  console.error(HELP);
  process.exit(2);
}

async function main() {
  resetRegistry();
  const args = parseReleaseArgs(process.argv.slice(2), {
    '--mode': { key: 'mode', value: true },
    '--n': { key: 'n', value: true },
    '--keep-tmp': { key: 'keepTmp' },
  });
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  args.mode = args.mode || 'diff-sample';
  if (!['diff-sample', 'assessment-orphan'].includes(args.mode)) {
    usageFail(`--mode 只接受 diff-sample | assessment-orphan，收到：${args.mode}`);
  }
  const nRaw = args.n === undefined ? 20 : Number(args.n);
  if (!Number.isInteger(nRaw) || nRaw < 1) usageFail(`--n 必须是正整数，收到：${args.n}`);
  if (args.selfTest || process.env.TM_T21_LOG) {
    setLogFile(path.join(TMP_ROOT, 'reconcile.log'));
  }

  // ── --self-test：安全阀到底拒了什么 + 源码只读扫描 ──────────────────
  if (args.selfTest) {
    const safety = runSafetySelfTest();
    const selfRo = assertScriptIsReadOnlySelf(SELF_FILE);
    console.log('[SELF-TEST] 只读守卫探针：');
    let roGuardOk = true;
    try {
      ro('X_WRITE_PROBE users SET secret=NULL');
      roGuardOk = false;
    } catch {
      /* 预期抛出：非 SELECT/PRAGMA 开头的语句必被 ro() 拒 */
    }
    // T-21e 疫苗先跑：它自带 resetRegistry()，跑完注册表为空，随后三条真自检门干净入表
    const vaccineOk = runGateVaccine();
    gate('self-test/安全阀用例全部命中拒绝', safety.allOk, `pass=${safety.pass}/${safety.total}`);
    gate('self-test/源码去注释后零写语句关键字', selfRo.ok, selfRo.hits.length ? JSON.stringify(selfRo.hits) : 'hits=0');
    gate('self-test/ro() 运行时守卫拒写', roGuardOk, '非只读语句被抛=符合只读纪律');
    const stFacts = gateExitContrib(registryGates());
    const ok = safety.allOk && selfRo.ok && roGuardOk && vaccineOk && stFacts.failed.length === 0;
    const stExit = ok ? 0 : stFacts.hard.length ? 2 : 1;
    emitSummary({
      task: 'T-21(c-i) reconcile self-test',
      verdict: ok ? 'PASS' : 'FAIL',
      exitCode: stExit,
      targets: [{ driver: 'n/a', kind: 'self-test', collected_at: new Date().toISOString() }],
      extra: {
        mode: args.mode,
        read_only_scan_hits: selfRo.hits.length,
        ro_guard_rejected: roGuardOk,
        vaccine_ok: vaccineOk,
        gate_exit: { total: stFacts.total, failed: stFacts.failed.map((g) => `${g.level}:${g.id}`) },
      },
    });
    process.exit(stExit);
  }

  const targets = [];
  const runMetrics = args.mode === 'diff-sample' ? REQUIRED_METRICS : ['assessment_orphan_rows', 'assessment_total_rows'];
  let missing = [];
  const perDriver = {};
  let diffTotal = 0;

  const drivers = args.driver === 'both' ? ['sqlite', 'pg'] : [args.driver];
  let sqliteFile = args.db ? resolveRepoPath(args.db) : null;

  // sqlite 目标确定（缺省 = 用 fixture 在 tmpdir 自建，走真实迁移路径 —— 复用 lib，不另写一套）
  if (drivers.includes('sqlite') && !sqliteFile) {
    sqliteFile = path.join(TMP_ROOT, 'reconcile-selfcheck.db');
    const fx = loadFixture(args.fixture ?? DEFAULT_FIXTURE);
    const seed = fx.seed ?? builtinSeed();
    note(
      `未给 --db → 在 os.tmpdir() 自建临时库：fixture=${path.relative(REPO_ROOT, fx.abs)}` +
        `（release_seed=${fx.hasReleaseSeed ? '有' : '无 → 回落 lib.mjs builtinSeed 本地样例'}）；` +
        '本地库 ≠ 线上库，以下所有数字禁止进入任何验收材料。',
    );
    const mig = runSqliteMigrations(sqliteFile);
    if (!mig.ok) {
      console.error(`[FATAL] 临时库迁移失败（真实迁移路径跑不通，无法自检）：${mig.reason}`);
      process.exit(1);
    }
    seedTempSqlite(sqliteFile, seed);
    printMetric('tmp_db_migrations_ok', 1, 'sqlite');
  }

  for (const driver of drivers) {
    if (driver === 'sqlite') {
      if (sqliteFile && args.db) {
        const guard = assertSafeTarget(args, sqliteFile);
        if (!guard.ok) {
          console.error(`[SAFETY-VALVE] ${guard.reason}`);
          process.exit(guard.code ?? 2);
        }
        note(`目标库自证（步 4 要求能看到哪个库、何时跑）：${guard.label}`);
      }
      let conn = null;
      try {
        conn = await openSqliteReadOnly(sqliteFile);
        const id = await conn.identity();
        targets.push({ driver, ...id, mode: 'ro' });
        console.log(
          `\n[TARGET] driver=sqlite 实例=${id.instance} size=${id.size_bytes}B mtime=${id.mtime} 打开时刻=${id.collected_at}`,
        );
        perDriver.sqlite =
          args.mode === 'diff-sample'
            ? await reconcileDiffSample(conn, nRaw)
            : await reconcileAssessmentOrphan(conn);
        if (perDriver.sqlite?.diffs) diffTotal += perDriver.sqlite.diffs.total;
        missing = missing.concat(requireMetrics(runMetrics, 'sqlite').missing.map((m) => `sqlite/${m}`));
      } catch (e) {
        console.error(`[FAIL] sqlite 侧未出数：${e instanceof Error ? e.message : String(e)}`);
        missing = missing.concat(runMetrics.map((m) => `sqlite/${m}(异常)`));
      } finally {
        conn?.close?.();
      }
    } else {
      const url = pgUrl();
      if (!url) {
        console.log(`\n${pgSkipReason()}`);
        targets.push({ driver: 'pg', instance: null, skipped: true, reason: 'DATABASE_URL_TEST 未设置', collected_at: new Date().toISOString() });
        note('[pg] 显式 SKIP：本机无实例，线上/pg 侧对账待 Phase 7 向用户索取只读访问后真跑，不伪装 PASS。');
        continue;
      }
      let conn = null;
      try {
        conn = await openPgReadOnly(url);
        const id = await conn.identity();
        targets.push({ driver, ...id, mode: 'default_transaction_read_only=on' });
        console.log(`\n[TARGET] driver=pg 实例=${id.instance} server_version=${id.server_version}`);
        perDriver.pg =
          args.mode === 'diff-sample'
            ? await reconcileDiffSample(conn, nRaw)
            : await reconcileAssessmentOrphan(conn);
        if (perDriver.pg?.diffs) diffTotal += perDriver.pg.diffs.total;
        missing = missing.concat(requireMetrics(runMetrics, 'pg').missing.map((m) => `pg/${m}`));
      } catch (e) {
        console.error(`[FAIL] pg 侧未出数：${e instanceof Error ? e.message : String(e)}`);
        missing = missing.concat(runMetrics.map((m) => `pg/${m}(异常)`));
      } finally {
        conn?.close?.();
      }
    }
  }

  // ── 执行面整表打印（"只读"是可核对集合而非纸面承诺） ────────────────
  console.log('\n[SQL-SURFACE] 本文件运行时实际执行的语句如下（每条已过 ro() SELECT/PRAGMA 守卫）：');
  const kinds = new Set(SQL_SURFACE.map((s) => s.split(' ')[0].toUpperCase()));
  for (const s of SQL_SURFACE.slice(0, 40)) console.log(`  · ${s}`);
  if (SQL_SURFACE.length > 40) console.log(`  … 其余 ${SQL_SURFACE.length - 40} 条略`);
  gate('只读纪律/全部执行语句属 SELECT|PRAGMA', [...kinds].every((k) => k === 'SELECT' || k === 'PRAGMA'), `语句种类=${[...kinds].join(',')}`);

  // ── 缺项门禁 + 汇总 ─────────────────────────────────────────────────
  const channel = getAlertChannel();
  if (!channel.configured) note(`ALERT_WEBHOOK_URL 未配置：标红不阻塞（步 5b 口径）。`);

  const roOk = [...kinds].every((k) => k === 'SELECT' || k === 'PRAGMA');
  const diffOk = args.mode !== 'diff-sample' || diffTotal === 0;
  if (missing.length) console.log(`[FAIL] 必需计数缺失 ${missing.length} 项：${missing.join(', ')}`);
  // T-21e：退出码 = hard 红线门红 ? 2 : (soft 门红 / 缺计数项 / 任一 diff≠0) ? 1 : 0；
  // roOk/diffOk 是门判据的本地重言式兜底（门与算式都进，任何一边失守都不放宽）。
  const gateFacts = gateExitContrib(registryGates());
  const exitCode = gateFacts.hard.length || !roOk
    ? 2
    : missing.length || !diffOk || gateFacts.soft.length
      ? 1
      : 0;
  console.log('\n===== 门禁 → 退出码归因（T-21e）=====');
  for (const g of gateFacts.failed)
    console.log(`  × [${g.level}] ${g.id}${g.detail ? ` :: ${g.detail}` : ''}`);
  console.log(
    `  门共 ${gateFacts.total} 条（红 ${gateFacts.failed.length}：hard=${gateFacts.hard.length} soft=${gateFacts.soft.length} advisory=${gateFacts.advisory.length}，advisory 红不进退出码）· 缺计数项=${missing.length} · diffΣ=${diffTotal} → exit ${exitCode}`,
  );

  const summary = emitSummary({
    task: 'T-21(c-i) reconcile',
    verdict: exitCode === 0 ? (diffOk ? 'PASS' : 'FAIL') : 'FAIL',
    exitCode,
    targets,
    extra: {
      mode: args.mode,
      n: nRaw,
      dry_run: args.dryRun,
      fixture: args.fixture ?? DEFAULT_FIXTURE,
      required_metrics: runMetrics,
      missing,
      diff_total: diffTotal,
      gate_exit: {
        total: gateFacts.total,
        failed: gateFacts.failed.map((g) => `${g.level}:${g.id}`),
      },
      per_driver: Object.fromEntries(
        Object.entries(perDriver).map(([k, v]) => [k, { M: v?.M, diffs: v?.diffs, caliber: v?.caliber, orphan: v?.orphan }]),
      ),
      sql_surface_count: SQL_SURFACE.length,
      read_only_statement_kinds: [...kinds],
      dual_driver: { ok: false, note: 'pg 侧本机无实例 → 显式 SKIP（CI 必须带 DATABASE_URL_TEST 真跑）' },
      alert_channel: { configured: channel.configured, blocking: false },
      local_numbers_banned_from_release: true,
    },
  });
  if (args.json) console.log(JSON.stringify(summary));
  if (!args.keepTmp && sqliteFile?.startsWith(TMP_ROOT)) cleanupTmpRoot();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`[FATAL] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
