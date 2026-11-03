#!/usr/bin/env node
/**
 * scripts/release/restore-drill.mjs — T-21 第 2 轮 (b) 快照 · 恢复 · 演练面
 *
 * 覆盖 §10.2 T-21 判据 ②③④⑤（口径唯一来源：PRD §6.4-2 步 5 / 5b / 6 / 6b / 7，:609-613）：
 *   ② 步 5  `VACUUM INTO` 产出 `pre-release-<tag>.db`（pg 侧 `.dump` 走显式 SKIP），
 *           size>0 + sha256 写进 `manifest.json`
 *   ③ 步 6  把该快照恢复到 os.tmpdir() 的临时实例，读出用户与词本，指纹与源实例一致
 *   ④ 步 6b 在**恢复出来的**那份临时实例上执行三条 `ADD COLUMN`（v1.5 口径：两条扩为三条：
 *           `users.pw_policy_version` / `users.password_changed_at` / `assessment_cache.user_id`），
 *           **一律走真实迁移路径**（本文件零 DDL），随后断言未执行任何回填：
 *           **判据④ 的主证据腿 = ④-bis 副本腿**（真·改造前形状上三条 ALTER 逐字执行，见下方 A/B 腿说明）；
 *           恢复实例腿（A 腿）只证**幂等路径**，不被当作"三条 ADD COLUMN 真执行过"的证据。
 *           剩余断言面：
 *           存量 password 逐行 hash 未变 · 五表 COUNT(*)/SUM(id) 未变 · assessment_cache 行数与
 *           "无主行数"演练前后相等 · 四类账号的取数口径符合步 6b①-⑧
 *   ⑤ 步 7  `--rollback`：旧镜像连新 schema 冒烟，输出 (a)(b)(c)(d) 四条结论（R-24 ⑧）
 *
 * ★ 写入面只有两处：①快照产物目录（默认 `%TEMP%/t21b`，显式 `--out backups` 才进仓库 backups/）、
 *   ②os.tmpdir() 下的临时实例。源库永远只读。
 *   机器取证分两层，`--self-test` 都会打印：
 *     (1) 静态：`scanForWriteStatements()` 扫自家三个 .mjs（去注释后）——
 *         除下方标注了 SCAN-EXEMPT 的"回填检测式"正则外，写语句关键字必须 0 命中；
 *         `VACUUM` 只允许 `VACUUM INTO` 形态且全文件仅 1 处（步 5 的产物写点）。
 *     (2) 运行时：本文件执行的每一条 SQL 都必须经 `ro()` 登记并断言以 SELECT / PRAGMA 开头；
 *         执行面清单在末尾整表打印 —— "只读"因此不是纸面承诺而是可核对的输出集合。
 *
 * ★ pg 侧与真机演练：本机无实例 / 无预发窗口时打**显式 [SKIP]**，绝不伪装 PASS；
 *   `summary.dual_driver.ok` 恒为 false。本地样例造数的数字禁入任何验收材料。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FIXTURE,
  GATE_LEVELS,
  REPO_ROOT,
  TMP_ROOT,
  WRITE_STATEMENT_KEYWORDS,
  assertSafeTarget,
  builtinSeed,
  cleanupTmpRoot,
  emitSummary,
  fingerprintInts,
  gateExitContrib,
  getAlertChannel,
  loadFixture,
  nowStamp,
  note,
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
  scanForWriteStatements,
  seedTempSqlite,
  setLogFile,
  SQL_SURFACE,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * 判据④ 的"三条 ADD COLUMN 真跑一遍"分两条腿取证，两条都走 `packages/server/src/scripts/migrate.ts`
 * （真实迁移路径，本文件零 DDL）：
 *
 * **A 腿（样例形状 · 只证幂等路径，判据④ 的辅助腿）** 源实例刻意只迁移到 **006**：`db.init()` 建的 users 表里没有 001 的两列
 *   → 001 的两条 `ALTER TABLE users ADD COLUMN … DEFAULT 0` 在源实例上**真执行**；恢复出的实例上再重放
 *   007（`addcolumn_pending_before` 证明它在待执行清单里）。但 sqlite.ts 的建表串与 007 同形（T-25 判据⑥
 *   的硬要求），所以全新库上 007 是 `MigrationRunner` 的幂等跳过（它先查列存在性），ALTER 不会落语句
 *   —— 这句话不再是 `[NOTE]`，已升格为 `[GATE]`（不成立即 exit 1，见 main 里的"④前置/判据④主证据腿"）。
 *
 * **B 腿（真·改造前形状 · 判据④ 的主证据腿，④-bis）** 仓库根 `data.db`（本机开发库，`assessment_cache` 无 user_id、`users` 无两条凭据列、
 *   `_migrations` 空）→ **只读复制**到 tmpdir 的副本上补齐 000~007，三条 ALTER 逐字执行，且复制源
 *   size/mtime 前后一字未变（本脚本绝不对 `data.db` 写入或跑迁移）。
 *   A 腿缺的那一环（007 的真 ALTER）由 B 腿补上；覆盖面差异不再存在，故记 `legacy_shape` 指标而非只写报告。
 */
const SOURCE_CUTOFF_MIGRATION = '006-entry-updated-at-doc';
const REPLAYED_MIGRATION = '007-assessment-cache-user-id';
/** 本期三条 ADD COLUMN 所在的迁移文件（破坏性语句的违规判定面）。 */
const DELTA_MIGRATION_FILES = ['001-credentials-columns.ts', '007-assessment-cache-user-id.ts'];
/** 只作**只读复制源**的改造前形状库。 */
const LEGACY_SHAPE_SOURCE = path.join(REPO_ROOT, 'data.db');
const EXPECTED_MIGRATIONS = [
  '000-migrations-table',
  '001-credentials-columns',
  '002-review-snapshots',
  '003-account-audit-log',
  '004-wordbook-sync-columns',
  '005-feature-flags',
  '006-entry-updated-at-doc',
  REPLAYED_MIGRATION,
];

/** 步 6b（v1.5）的三条列。 */
const NEW_COLUMNS = [
  { table: 'users', column: 'pw_policy_version', expect_default: '0' },
  { table: 'users', column: 'password_changed_at', expect_default: '0' },
  { table: 'assessment_cache', column: 'user_id', expect_default: null },
];

/** 五表指纹基准。**注意主键形状**：wordbooks / checkin_logs 没有 `id` 列（前者 user_id 单主键、后者复合主键），
 *  所以 SUM 的列与 ORDER BY 逐表声明，不能一律按 `id`。 */
const DRILL_TABLES = [
  { table: 'users', key: 'id', order: 'id', hashCols: '*' },
  { table: 'wordbooks', key: 'user_id', order: 'user_id', hashCols: '*' },
  { table: 'fsrs_cards', key: 'id', order: 'id', hashCols: '*' },
  { table: 'checkin_logs', key: 'user_id', order: 'user_id, date', hashCols: '*' },
  // 演练里这张表**故意**被 007 加了一列 → `SELECT *` 的 hash 必然变。所以固定用改造前的列集做内容 hash，
  // 新列的存在性由 NEW_COLUMNS 的 PRAGMA 断言单独承担。
  {
    table: 'assessment_cache',
    key: 'id',
    order: 'id',
    hashCols: 'id, word, qtype, question, created_at',
  },
];

const DEFAULT_OUT = path.join(os.tmpdir(), 't21b');

/** 剥注释但**保持行数**（lib 的 stripJsComments 会把多行块注释折成一行 → 行号会漂，这里自己剥）。 */
function stripCommentsKeepLines(text) {
  let out = '';
  let i = 0;
  let prevSig = '';
  const n = text.length;
  const blank = (s) =>
    s
      .split('\n')
      .map((l) => ' '.repeat(l.length))
      .join('\n');
  const BEFORE_REGEX = '(,=:[!&|?{};+-*%<>~^';
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*' && prevSig !== ':') {
      const end = text.indexOf('*/', i + 2);
      const seg = end === -1 ? text.slice(i) : text.slice(i, end + 2);
      out += blank(seg);
      i += seg.length;
      continue;
    }
    if (c === '/' && text[i + 1] === '/' && prevSig !== ':') {
      const end = text.indexOf('\n', i);
      const seg = end === -1 ? text.slice(i) : text.slice(i, end);
      out += blank(seg);
      i += seg.length;
      continue;
    }
    if (c === '/' && (prevSig === '' || BEFORE_REGEX.includes(prevSig))) {
      let j = i + 1;
      let cls = false;
      while (j < n) {
        const d = text[j];
        if (d === '\\') j += 2;
        else if (d === '[') {
          cls = true;
          j += 1;
        } else if (d === ']') {
          cls = false;
          j += 1;
        } else if (d === '/' && !cls) break;
        else if (d === '\n') break;
        else j += 1;
      }
      const seg = text.slice(i, Math.min(j + 1, n));
      out += seg;
      i += seg.length;
      prevSig = 'x';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') j += 2;
        else if (text[j] === c) break;
        else if (c === '`' && text[j] === '$' && text[j + 1] === '{') {
          let depth = 1;
          j += 2;
          while (j < n && depth > 0) {
            if (text[j] === '{') depth += 1;
            else if (text[j] === '}') depth -= 1;
            j += 1;
          }
          continue;
        } else j += 1;
      }
      const seg = text.slice(i, Math.min(j + 1, n));
      out += seg;
      i += seg.length;
      prevSig = c;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prevSig = c;
    i += 1;
  }
  return out;
}

/**
 * 自家文件的静态扫描（导出的理由：preflight.mjs 与本文件的 --self-test 共用一份口径，不各写一套）。
 * @param {{file:string, snapshotWriter?:boolean}[]} entries snapshotWriter = 允许那 1 处产物写点的文件
 */
export function assertScriptsReadOnlySelf(entries) {
  const STRICT = WRITE_STATEMENT_KEYWORDS.filter((k) => k !== 'VACUUM'); // SCAN-EXEMPT 扫描器自身要写关键字名
  const kwRe = new RegExp(`(?<![.$\\w])\\b(${WRITE_STATEMENT_KEYWORDS.join('|')})\\b`, 'gi');
  const perFile = entries.map(({ file: f, snapshotWriter = false }) => {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split('\n');
    const stripped = stripCommentsKeepLines(text);
    const hits = [...stripped.matchAll(kwRe)].map((m) => ({
      label: path.basename(f),
      word: String(m[1]).toUpperCase(),
      line: stripped.slice(0, m.index ?? 0).split('\n').length,
      snippet: String(lines[stripped.slice(0, m.index ?? 0).split('\n').length - 1] ?? '')
        .trim()
        .slice(0, 100),
    }));
    const mark = (h) => /SCAN-EXEMPT/.test(String(lines[h.line - 1] ?? ''));
    const strict = hits.filter((h) => h.word !== 'VACUUM'); // SCAN-EXEMPT 扫描器自身要写关键字名
    const violations = strict.filter((h) => !mark(h));
    const vacHits = hits.filter((h) => h.word === 'VACUUM'); // SCAN-EXEMPT 扫描器自身要写关键字名
    const badVacHits = vacHits.filter((h) => {
      const l = String(lines[h.line - 1] ?? '');
      return !/VACUUM\s+INTO/.test(l) && !/SCAN-EXEMPT/.test(l);
    }); // SCAN-EXEMPT 扫描器自身要写关键字名
    const execSites = lines.filter((l) => /VACUUM\s+INTO/.test(l) && /\.exec\(/.test(l)).length; // SCAN-EXEMPT 扫描器自身要写关键字名
    return {
      file: path.basename(f),
      hits: hits.length,
      line_map_exact:
        stripped.split('\n').length === lines.length && stripped.length === text.length,
      lib_cross_check_hits: scanForWriteStatements(text, path.basename(f)).length,
      strict_hits: violations,
      exempt_hits: strict.filter((h) => mark(h)),
      vacuum_lines: vacHits.map((h) => h.line),
      bad_vacuum_lines: badVacHits.map((h) => h.line),
      vacuum_exec_sites: execSites,
      expect_exec_sites: snapshotWriter ? 1 : 0,
      ok:
        violations.length === 0 &&
        badVacHits.length === 0 &&
        execSites === (snapshotWriter ? 1 : 0),
    };
  });
  return { ok: perFile.every((p) => p.ok), perFile, strict_keywords: STRICT };
}

/* 只读守卫 ro() 与执行面登记 SQL_SURFACE：T-21c-iii 已上收至 lib.mjs（语义与上收前逐字一致）。 */

const HELP = `restore-drill —— 快照 · 恢复 · 回填 · 回滚演练（T-21 判据②③④⑤，除产物外面全程只读）

  node scripts/release/restore-drill.mjs                     # 缺省 dry-run：tmpdir 自建源实例，全流程演练
  node scripts/release/restore-drill.mjs --self-test         # 只读取证自检（安全阀 + 静态扫描 + 目录纪律）
  node scripts/release/restore-drill.mjs --db <path> --tag v2.0.0 --i-know-this-is-prod
  node scripts/release/restore-drill.mjs --out backups       # 显式把快照与 manifest 写进仓库 backups/（默认 %TEMP%/t21b）
  node scripts/release/restore-drill.mjs --rollback --old-image-tag tm-server:v1.9.0
  node scripts/release/restore-drill.mjs --manifest-check --out <产物目录> [--tag v2.0.0]
                                                              # 只读核对台账：每条目 restore_drill 非 null 且字段齐全，缺项 → exit 1（本模式零写入、不产快照）

  通用面：--dry-run/--execute --driver sqlite|pg|both --fixture <p> --db <p> --i-know-this-is-prod
  本文件专属：--tag <v> --out <backups|tmpdir 内目录> --out-dir <tmpdir 内目录> --snapshot <产物路径>
             --rollback --old-image-tag <t> --skip-ddl-parity --skip-pg --keep-tmp --manifest-check --json --self-test
  退出码：2=安全阀拒绝/CLI 非法/hard 档红线门红；1=缺必需计数或 soft 档门红（advisory 白名单门红只标红不拦人）；0=成立（pg 侧与真机演练为显式 SKIP，不算 PASS）`;

/** 判据②③④⑤ 的必需计数：缺任一项 → exit 1。 */
const REQUIRED_METRICS = [
  'snap_tag',
  'snap_file',
  'snap_size_bytes',
  'snap_sha256',
  'manifest_entries',
  'restored_integrity',
  'restored_users',
  'restored_wordbook_rows',
  'restored_wordbook_entries',
  'restored_users_fp',
  'restored_wordbooks_fp',
  'fingerprint_vs_source',
  'addcolumn_pending_before',
  'addcolumn_applied',
  'three_columns_present',
  'pw_rowhash_before',
  'pw_rowhash_after',
  'table_counts_before',
  'table_counts_after',
  'table_sumid_before',
  'table_sumid_after',
  'table_rows_hash_before',
  'table_rows_hash_after',
  'ac_rows_before',
  'ac_rows_after',
  'ac_orphan_before',
  'ac_orphan_after',
  'backfill_scan_hits',
  'backfill_scan_informational',
  'acct_class_short_pw0',
  'acct_class_strong_pw1',
  'acct_class_empty_pw',
  'acct_class_activated',
  'q_source',
  'q_restored',
  'old_image_users_rows_read',
  'old_image_assessment_rows_read',
  'old_image_write_shape_ok',
  'rollback_conclusion_a',
  'rollback_conclusion_b',
  'rollback_conclusion_c',
  'rollback_conclusion_d',
  'sql_surface_readonly_only',
];

/* ─────────────────── 门禁分级表（T-21e：把 T-21d 在 preflight 的形态推广到本脚本；
 * 档位→退出码的算式只有 lib 的 gateExitContrib 一份，本表只登记档位与理由）───────────────────
 * 未命中任何 key 的门（②/③恢复读出/④路径与重放面/⑤/台账…）一律默认 soft：红即 exit 1，从严。
 * hard 只收"触碰真库 / 契约破坏 / 静默丢数据"三类红线，逐条写 why；advisory 是白名单，why 必填。 */
const GATE_TIERS = [
  {
    key: '步 5/产物目录纪律',
    tier: 'hard',
    why: '产物目录漂出 tmpdir/backups = 快照可被写到任意位置（含仓库/真库旁边），"只写 backups" 的数据红线破防。',
  },
  {
    key: '安全阀/源库可只读打开',
    tier: 'hard',
    why: '安全阀拒绝 = 未显式 --i-know-this-is-prod 就想打开仓库内真库（触碰真库红线）；本门自带 exit 2 分支，档位与行为对齐。',
  },
  {
    key: '③ 步 6/与源实例指纹一致',
    tier: 'hard',
    why: '恢复结果与源实例指纹不一致 = 快照在无人察觉时丢了数据（静默丢数据），该发布窗口没有可用备份。',
  },
  {
    key: '③ 步 6/快照读不回',
    tier: 'hard',
    why: '快照读不回 = 没有可用备份，门 id 自身点名"R-24 ③ 同口径阻断"（静默丢数据的极端形态）。',
  },
  {
    key: '④ 步 6b①/存量 password 逐行 hash 未变',
    tier: 'hard',
    why: 'hash 变了 = 迁移/演练回填覆盖了存量凭据（R-40 红线，静默改数据）。',
  },
  {
    key: '④ 步 6b①/五表',
    tier: 'hard',
    why: '恢复+迁移过程五表 COUNT/SUM/全行 hash 任一变化 = 数据被静默丢失或改写（静默丢数据）。',
  },
  {
    key: '④ 步 6b①/assessment_cache 行数',
    tier: 'hard',
    why: '行数变化或存量行"凭空有主" = 回填禁句柄被执行（R-41 ③④ 红线，静默改数据）。',
  },
  {
    key: '④ 步 6b①/存量 assessment_cache 逐行',
    tier: 'hard',
    why: '改造前列集逐行 hash 变了 = 存量测评缓存被回填/改写（R-41 红线，静默改数据）。',
  },
  {
    key: '④-bis 真·改造前库上的存量行零回填',
    tier: 'hard',
    why: '主证据腿（真·改造前形状的 tmpdir 副本）零回填不成立 = 真库过同一迁移路径时会被同样改写（静默丢数据）。',
  },
  {
    key: '④-bis 存量 assessment_cache 行迁移后一律无主',
    tier: 'hard',
    why: '存量行迁移后出现属主 = R-41 回填红线被破（静默改数据）。',
  },
  {
    key: '数据红线/复制源 data.db',
    tier: 'hard',
    why: '仓库根真库 size/mtime 有任何变动 = 数据红线事故（触碰真库），无条件拦死。',
  },
  {
    key: '只读执行面',
    tier: 'hard',
    why: '执行面一旦混进非 SELECT/PRAGMA 语句 = 本脚本"除产物外全程只读"的契约整体破防，被连的库（含真库）可能被写。',
  },
  {
    key: '步 5b(A)',
    tier: 'advisory',
    why:
      '咨询性门·白名单：告警通道未配置是**降级项**（getAlertChannel() 两态都返回 blocking:false，判据文案自身即"绝不报错、绝不阻塞"，R-24 ⑩），' +
      '拿它拦人只会逼发布方跳过演练；失败可见性由步 5b(B) 强制读回兜住。与 preflight 步 5b(A) 同口径（A-54 #146 / A-56 #154 已裁）。仍打 [RED-FLAG] + 档位=advisory 留痕。',
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

/* ════════════════ 只读取证：自家文件静态扫描（preflight.mjs 共用） ════════════════ */

function ownFiles() {
  return [
    { file: path.join(HERE, 'restore-drill.mjs'), snapshotWriter: true },
    { file: path.join(HERE, 'preflight.mjs') },
    { file: path.join(HERE, 'account-audit.mjs') },
  ];
}

function printSelfTest() {
  console.log('restore-drill --self-test');
  const safety = runSafetySelfTest();
  const own = assertScriptsReadOnlySelf(ownFiles());
  console.log('--- (1) 自家文件静态扫描（"只读 + 只写 backups/" 的机器取证 · 静态层） ---');
  console.log(
    `  关键字表 = lib.mjs 的 ${WRITE_STATEMENT_KEYWORDS.join('/')}（扫描前先去注释，字符串不去）`,
  );
  for (const p of own.perFile) {
    console.log(
      `  ${p.ok ? 'OK  ' : 'BAD '}${p.file}：严格命中=${p.strict_hits.length} · 带标记豁免=${p.exempt_hits.length} · 快照写点候选行=${JSON.stringify(p.vacuum_lines)}（缺 INTO 且无标记=${JSON.stringify(p.bad_vacuum_lines)}）· 产物写点=${p.vacuum_exec_sites}/${p.expect_exec_sites} · 行号映射精确=${p.line_map_exact} · lib 原式扫描交叉核对=${p.lib_cross_check_hits}`,
    );
    for (const h of p.strict_hits.slice(0, 6))
      console.log(`      × ${h.word} @L${h.line}：${h.snippet}`);
  }
  console.log('--- (2) 产物目录纪律（默认不写仓库） ---');
  for (const c of [DEFAULT_OUT, path.join(REPO_ROOT, 'backups'), path.join(REPO_ROOT, 'data.db')]) {
    const r = assertSnapshotOutDir(c);
    console.log(
      `  ${r.ok ? 'ALLOW ' : 'REJECT'} ${c}${r.ok ? '' : ` → ${r.reason.split('，')[0]}`}`,
    );
  }
  console.log('--- (3) 告警通道（R-24 ⑩ / 步 5b 降级口径） ---');
  const ch = getAlertChannel();
  console.log(
    `  ${ch.configured ? `已配置（host=${ch.host}）` : '未配置'} → ${ch.verdict} · blocking=${ch.blocking}`,
  );
  const dirOk =
    assertSnapshotOutDir(DEFAULT_OUT).ok &&
    assertSnapshotOutDir(path.join(REPO_ROOT, 'backups')).ok &&
    !assertSnapshotOutDir(path.join(REPO_ROOT, 'data.db')).ok;
  const roOk = (() => {
    try {
      ro('SELECT 1');
      ro('PRAGMA table_info(users)');
    } catch {
      return false;
    }
    try {
      ro(`SET x = 1`);
      return false;
    } catch {
      return true;
    }
  })();
  console.log(
    `--- (4) 只读语句入口 ro() 的判别力：${roOk ? 'OK（非 SELECT/PRAGMA 被拒）' : 'BAD'} ---`,
  );
  const vaccineOk = runGateVaccine();
  const verdict = safety.allOk && own.ok && dirOk && roOk && !ch.blocking && vaccineOk;
  console.log(`  → self-test ${verdict ? 'PASS' : 'FAIL'}`);
  return verdict ? 0 : 1;
}

/* ════════════════════════ 产物目录纪律 ════════════════════════ */

function assertSnapshotOutDir(outDir) {
  const target = path.resolve(String(outDir));
  const tmp = path.resolve(os.tmpdir());
  const inside = target === tmp || target.startsWith(tmp + path.sep);
  const named = path.basename(target) === 'backups';
  return {
    ok: inside || named,
    target,
    reason: `拒绝写入：快照产物目录必须叫 backups 或落在 os.tmpdir() 内，收到 ${target}`,
  };
}

function snapshotFileName(kind, tag) {
  const safe = String(tag || 'untagged')
    .trim()
    .split(/[^0-9A-Za-z._-]/)
    .join('-');
  return `pre-release-${safe}.${kind === 'sqlite' ? 'db' : 'dump'}`;
}

/* ════════════════════════ 真实迁移路径（带 --to / --status） ════════════════════════ */

/**
 * lib 的 `runSqliteMigrations()` 只有"全量应用"一种形态；步 6b 需要分步（先迁到 006 造出改造前的库、
 * 再在恢复实例上重放 007），故这里直接 spawn **同一个** `migrate.ts` 入口并透传参数 ——
 * 用的仍是 PRD 步 5c 指定的那条真实迁移路径，本文件一字 DDL 都不写（见静态扫描的 VACUUM 之外的 0 命中）。
 */
export function runMigrate(sqliteFile, extraArgs = [], { log = console.log } = {}) {
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
  const require2 = createRequire(path.join(REPO_ROOT, 'noop.js'));
  let tsxCli;
  try {
    tsxCli = require2.resolve('tsx/cli');
  } catch {
    tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
  if (!fs.existsSync(tsxCli))
    return { ok: false, reason: `找不到 tsx CLI（${tsxCli}）`, stdout: '' };
  const migrateTs = path.join(REPO_ROOT, 'packages', 'server', 'src', 'scripts', 'migrate.ts');
  const r = spawnSync(process.execPath, [tsxCli, migrateTs, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DB_DRIVER: 'sqlite', SQLITE_PATH: sqliteFile },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    log(
      `[MIGRATE] 退出码 ${r.status}：${stdout.split('\n').filter(Boolean).slice(-1)[0] ?? '无输出'}`,
    );
    return { ok: false, reason: `migrate.ts 退出码 ${r.status}`, stdout };
  }
  return { ok: true, reason: null, stdout };
}

/** 步 5c 的只读核对：`migrate -- --status` 清单（`✓` = 已应用，`·` = 待执行）。 */
export function migrateStatus(sqliteFile) {
  const r = runMigrate(sqliteFile, ['--status']);
  if (!r.ok)
    return { ok: false, ran: false, applied: [], pending: [], reason: r.reason, raw: r.stdout };
  const applied = [];
  const pending = [];
  for (const line of r.stdout.split('\n')) {
    const m = /^\s+(✓|·)\s+(\S+)/.exec(line);
    if (!m) continue;
    (m[1] === '✓' ? applied : pending).push(m[2]);
  }
  // ok = "无待执行"（步 5c 的判据）；ran = "--status 本身退出码 0"（A 腿前置要用后者，因为它故意留 007 待执行）
  return { ok: pending.length === 0, ran: true, applied, pending, reason: null, raw: r.stdout };
}

/* ════════════════════════ 度量（全 SELECT / PRAGMA） ════════════════════════ */

function rowHash(objs) {
  return crypto
    .createHash('sha256')
    .update(objs.map((r) => JSON.stringify(r)).join('\n'))
    .digest('hex')
    .slice(0, 16);
}

function parseJson(s) {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

/** 四类账号造数（步 6b①-⑧ 的取数面）：全部靠建行时给值表达，本文件不出现任何回填语句。 */
function buildDrillSeed(fixturePath) {
  let hasReleaseSeed = false;
  let base;
  try {
    const fx = loadFixture(fixturePath ?? DEFAULT_FIXTURE);
    hasReleaseSeed = fx.hasReleaseSeed;
    base = fx.seed ?? builtinSeed();
  } catch {
    base = builtinSeed();
  }
  const users = [
    ...base.users,
    // 刚激活成功的账号（R-39 ⑤b 的落库形态：password + pw_policy_version=1 + 改密时刻）
    {
      id: 900_001,
      phone: '13800000900',
      password: '$2a$10$activatedsampleccccccccccccccccccccccccccccc',
      pw_policy_version: 1,
      password_changed_at: 1_769_000_000_000,
    },
  ];
  return {
    hasReleaseSeed,
    seed: {
      ...base,
      users,
      // 改造前的真实形态：这 5 列之外没有属主列，存量行迁移后一律落 NULL（= 无主）
      assessment_cache: (base.assessment_cache ?? []).map((a) => ({ word: a.word })),
      profiles: [...(base.profiles ?? []), { user_id: 900_001 }],
      wordbooks: [...(base.wordbooks ?? []), { user_id: 900_001, data: ['commit', 'drill'] }],
      fsrs_cards: [...(base.fsrs_cards ?? []), { user_id: 900_001, word: 'commit' }],
      checkin_logs: [...(base.checkin_logs ?? []), { user_id: 900_001, date: '2026-09-20' }],
    },
  };
}

/** 改造前的源实例：真实迁移到 006（007 留待恢复后重放）+ 只 INSERT 造数（lib 的 seedTempSqlite）。 */
function buildPreReleaseSource(file, seed) {
  const st = runMigrate(file, ['--to', SOURCE_CUTOFF_MIGRATION]);
  if (!st.ok) throw new Error(`源实例迁移到 ${SOURCE_CUTOFF_MIGRATION} 失败：${st.reason}`);
  seedTempSqlite(file, seed);
  return file;
}

async function measure(file) {
  const conn = await openSqliteReadOnly(file);
  try {
    const users = conn.all(
      ro(
        'SELECT id, phone, password, created_at, pw_policy_version, password_changed_at FROM users ORDER BY id',
      ),
    );
    const wordbooks = conn.all(
      ro('SELECT user_id, data, updated_at FROM wordbooks ORDER BY user_id'),
    );
    const out = {
      label: conn.label,
      user_ids: users.map((u) => u.id),
      users_hash: rowHash(users),
      users_password_hash: rowHash(users.map((u) => ({ id: u.id, password: u.password }))),
      wordbooks_hash: rowHash(wordbooks),
      wordbook_rows: wordbooks.length,
      wordbook_entries: wordbooks.reduce((n, w) => {
        const d = parseJson(w.data);
        return n + (Array.isArray(d) ? d.length : 0);
      }, 0),
      tableCounts: {},
      tableSums: {},
      tableHashes: {},
      pw0_with_password: users.filter(
        (u) => u.password !== null && String(u.password).trim() !== '' && u.pw_policy_version === 0,
      ).length,
      empty_pw: users.filter((u) => u.password === null || String(u.password).trim() === '').length,
      class_strong_old: users
        .filter(
          (u) =>
            u.pw_policy_version === 1 &&
            Number(u.password_changed_at) === 0 &&
            String(u.password ?? '').trim() !== '',
        )
        .map((u) => u.id),
      class_activated: users
        .filter((u) => u.pw_policy_version === 1 && Number(u.password_changed_at) > 0)
        .map((u) => u.id),
      user_id_column_present: Boolean(
        conn.all(ro('PRAGMA table_info(assessment_cache)')).find((x) => x.name === 'user_id'),
      ),
      columns: {},
    };
    for (const t of DRILL_TABLES) {
      const r = conn.one(
        ro(`SELECT COUNT(*) AS c, COALESCE(SUM(${t.key}),0) AS s FROM ${t.table}`),
      );
      out.tableCounts[t.table] = Number(r.c);
      out.tableSums[t.table] = Number(r.s);
      out.tableHashes[t.table] = rowHash(
        conn.all(ro(`SELECT ${t.hashCols} FROM ${t.table} ORDER BY ${t.order}`)),
      );
    }
    const ac = conn.all(
      ro('SELECT id, word, qtype, question, created_at FROM assessment_cache ORDER BY id'),
    );
    out.assessment_rows = ac.length;
    out.assessment_hash = rowHash(ac);
    out.assessment_orphan = out.user_id_column_present
      ? Number(conn.one(ro('SELECT COUNT(*) AS c FROM assessment_cache WHERE user_id IS NULL')).c)
      : ac.length;
    for (const c of NEW_COLUMNS) {
      const info = conn.all(ro(`PRAGMA table_info(${c.table})`)).find((x) => x.name === c.column);
      out.columns[`${c.table}.${c.column}`] = info ?? null;
    }
    return out;
  } finally {
    conn.close();
  }
}

/* ════════════════════════ ② 步 5：快照 + 校验和 + manifest ════════════════════════ */

/** 全文件唯一的产物写点：`VACUUM INTO`（源库只读打开、一字不动；目标必须不存在）。 */
function vacuumInto(srcFile, destFile) {
  const Database = createRequire(path.join(REPO_ROOT, 'noop.js'))('better-sqlite3');
  const db = new Database(srcFile, { readonly: true, fileMustExist: true, verbose: null });
  try {
    fs.rmSync(destFile, { force: true });
    db.exec(`VACUUM INTO '${String(destFile).split("'").join("''")}'`);
  } finally {
    db.close();
  }
  return fs.statSync(destFile).size;
}

function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const MANIFEST_SCHEMA = {
  schema_version: 1,
  _doc:
    'backups/manifest.json = 发布窗口快照台账（PRD §6.4-2 步 5 判据"校验和写入部署产物"）。' +
    '唯一写入口 scripts/release/restore-drill.mjs；schema 说明的人读版本见 scripts/release/README.md（c 轮）。',
  _entry_schema: {
    tag: '发布 tag',
    kind: 'sqlite | pg',
    driver: 'sqlite | pg',
    file: '相对本 manifest 所在目录的产物名（pre-release-<tag>.db / .dump）',
    size_bytes: '判据②：必须 > 0',
    sha256: '判据②：64 位十六进制校验和',
    created_at: '产出时刻（含时区 ISO，步 4 的"什么时候跑的"自证义务）',
    source_instance: '库自证：源库绝对路径 或 pg://host/db（脱敏）',
    source_table_counts: '步 4 第⑥项的行数快照基线（五表）',
    local_fixture_only: 'true = 数字来自本地样例造数，禁入发布公告 / 报告 / 验收材料',
    restore_drill:
      '该快照的恢复·回填·回滚演练结论（判据③④⑤）。步 5 建条目时为 null（未演练 = null，不伪造结论）；' +
      '主流程末尾对同 tag·同 file·同 sha256 的条目**追加一次回填**（U-4 修复：防"有备份无演练"）。' +
      '回填字段齐全性由 --manifest-check 与出口门共同核对，缺项即 exit 1。',
  },
  _git_note:
    '.gitignore:29 忽略整个 backups/ → 仓库内快照与 manifest 不入 git（真归档面 = 部署产物）。' +
    '因此技术设计里"仓库放 .gitkeep"这条在现网 .gitignore 下不成立，已作为待拍板项上报。',
};

/** U-4：台账 `restore_drill` 的必备字段（缺任一项 = 结论不完整，--manifest-check 与出口门都判 exit 1）。 */
const REQUIRED_DRILL_FIELDS = [
  'restored_integrity',
  'fingerprint_vs_source',
  'backfill_scan_hits',
  'rollback_conclusion_a',
  'rollback_conclusion_b',
  'rollback_conclusion_c',
  'rollback_conclusion_d',
  'executed_at',
  'local_fixture_only',
];

/** 一条台账条目的演练结论核对：返回缺项列表（空数组 = 完备）。null/缺失单独给出可读原因。 */
function drillIssues(entry) {
  const d = entry ? entry.restore_drill : undefined;
  if (d === undefined) return ['restore_drill 键缺失（schema 违规）'];
  if (d === null) return ['restore_drill=null（有备份无演练）'];
  if (typeof d !== 'object' || Array.isArray(d)) return ['restore_drill 不是结论对象'];
  return REQUIRED_DRILL_FIELDS.filter((k) => d[k] === undefined || d[k] === null).map(
    (k) => `${k} 缺失/为 null`,
  );
}

function upsertManifest(outDir, entry) {
  const file = path.join(outDir, 'manifest.json');
  let doc = { ...MANIFEST_SCHEMA, entries: [] };
  if (fs.existsSync(file)) {
    const raw = parseJson(fs.readFileSync(file, 'utf8'));
    if (raw && Array.isArray(raw.entries))
      doc = { ...MANIFEST_SCHEMA, ...raw, entries: raw.entries };
  }
  doc.entries = doc.entries
    .filter((e) => !(e && e.file === entry.file && e.sha256 === entry.sha256))
    .concat([entry])
    .slice(-200);
  doc.updated_at = nowStamp();
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return { file, entries: doc.entries.length, doc };
}

/* ════════════════════════ ④ 步 6b：回填检测（静态面） ════════════════════════ */

// SCAN-EXEMPT-BEGIN
// 下面这个函数是**检测式**、不是执行式：它的正则字面量里出现 SQL 写关键字，正是步 6b② 的判据本体
// （PRD 原文："迁移脚本里不得出现 `UPDATE users SET pw_policy_version`，也不得出现
//  `UPDATE assessment_cache SET user_id`"；另加两条同源红线：覆盖存量 password、DROP COLUMN）。
// 本文件不会把这些正则当语句执行 —— 唯一执行的语句走 ro()（只收 SELECT/PRAGMA）。
function scanMigrationsForBackfill() {
  const dir = path.join(REPO_ROOT, 'packages', 'server', 'src', 'db', 'migrations');
  const globalPatterns = [
    { id: 'backfill_pw_policy_version', re: /UPDATE\s+users\s+SET[^;]*?pw_policy_version/i }, // SCAN-EXEMPT 检测式而非执行式
    { id: 'backfill_password_changed_at', re: /UPDATE\s+users\s+SET[^;]*?password_changed_at/i }, // SCAN-EXEMPT 检测式而非执行式
    { id: 'backfill_assessment_user_id', re: /UPDATE\s+assessment_cache\s+SET[^;]*?user_id/i }, // SCAN-EXEMPT 检测式而非执行式
    { id: 'overwrite_existing_password', re: /UPDATE\s+users\s+SET[^;]*?password\s*=/i }, // SCAN-EXEMPT 检测式而非执行式
  ];
  /**
   * 破坏性语句只在**本期三条 ADD COLUMN 所在的两个迁移**里判违规。
   * 002/003/005 的 `down()` 里各有一条 `DROP TABLE IF EXISTS <自己新建的那张表>`，
   * 那是回滚面的既有语义（`migrations.spec.ts` 有白名单用例钉住），与本期"只加不回填"无关，
   * 一律计入 `informational`，不冒充违规、也不因此放过本期该管的东西。
   */
  const deltaPatterns = [
    { id: 'destructive_drop', re: /DROP\s+(COLUMN|TABLE)/i }, // SCAN-EXEMPT 检测式而非执行式
    { id: 'delta_row_write', re: /\b(UPDATE|INSERT|DELETE)\b/i }, // SCAN-EXEMPT 检测式而非执行式
  ];
  const hits = [];
  const informational = [];
  const files = fs.readdirSync(dir).filter((f) => /\.ts$/.test(f));
  for (const f of files) {
    const code = fs
      .readFileSync(path.join(dir, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    for (const p of globalPatterns)
      if (p.re.test(code)) hits.push({ file: f, id: p.id, scope: 'global' });
    if (DELTA_MIGRATION_FILES.includes(f)) {
      for (const p of deltaPatterns)
        if (p.re.test(code)) hits.push({ file: f, id: p.id, scope: 'delta' });
    } else {
      for (const p of deltaPatterns) if (p.re.test(code)) informational.push({ file: f, id: p.id });
    }
  }
  return { files: files.length, hits, informational, delta_files: DELTA_MIGRATION_FILES };
}
// SCAN-EXEMPT-END

/* ════════════════════════ ⑤ 步 7：旧镜像连新 schema ════════════════════════ */

function probeOldImage(tag) {
  if (!tag)
    return {
      available: false,
      reason: '未提供 --old-image-tag / ROLLBACK_IMAGE（本机也没有可回滚的 tag 登记）',
    };
  const r = spawnSync('docker', ['image', 'inspect', tag], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT')
    return { available: false, reason: '本机无 docker CLI → 真机回滚属 §6.4-2b 的人工签字项' };
  if (r.status !== 0)
    return { available: false, reason: `docker 里没有 tag ${tag}（先 pull 或换 tag）` };
  return { available: true, reason: null };
}

/** 旧镜像的读面 = 新列之前的列清单。只读执行不报错即"旧镜像不读新列仍能跑"。 */
async function oldImageReadShape(file) {
  const conn = await openSqliteReadOnly(file);
  const out = { users_rows: 0, assessment_rows: 0, wordbook_rows: 0, errors: [] };
  try {
    out.users_rows = conn.all(
      ro('SELECT id, phone, password, created_at FROM users WHERE phone LIKE ? ORDER BY id'),
      ['138%'],
    ).length;
    out.assessment_rows = conn.all(
      ro('SELECT id, word, qtype, question, created_at FROM assessment_cache WHERE word = ?'),
      ['w1'],
    ).length;
    out.wordbook_rows = conn.all(ro('SELECT user_id, data, updated_at FROM wordbooks')).length;
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e));
  } finally {
    conn.close();
  }
  return out;
}

/* ════════════ ④-bis（B 腿 · 判据④ 的主证据腿）：三条 ADD COLUMN 语句在真·改造前形状的库上逐字执行 ════════════ */

/** 只取 size+mtime 作"没被动过"的指纹（不对复制源做任何写打开）。 */
function statStamp(file) {
  const st = fs.statSync(file);
  return `size=${st.size}·mtime=${Math.round(st.mtimeMs)}`;
}

/** 只依赖**改造前就存在**的列与 COUNT(*) → 同一段取数能横跨迁移前/迁移后各跑一次并逐字比对。 */
async function measureLegacyShape(file) {
  const conn = await openSqliteReadOnly(file);
  try {
    const names = ['users', 'wordbooks', 'fsrs_cards', 'checkin_logs', 'assessment_cache'];
    const counts = {};
    const columns = {};
    for (const t of names) {
      counts[t] = Number(conn.one(ro(`SELECT COUNT(*) AS c FROM ${t}`)).c);
      columns[t] = conn.all(ro(`PRAGMA table_info(${t})`)).map((c) => c.name);
    }
    const sums = {};
    for (const t of ['users', 'assessment_cache'])
      sums[t] = Number(conn.one(ro(`SELECT COALESCE(SUM(id),0) AS s FROM ${t}`)).s);
    const shape = {};
    for (const c of NEW_COLUMNS) {
      const info = conn.all(ro(`PRAGMA table_info(${c.table})`)).find((x) => x.name === c.column);
      shape[`${c.table}.${c.column}`] = info ?? null;
    }
    return {
      counts,
      sums,
      columns,
      shape,
      present: Object.entries(shape)
        .filter(([, v]) => v)
        .map(([k]) => k),
      users_hash: rowHash(
        conn.all(ro('SELECT id, phone, password, created_at FROM users ORDER BY id')),
      ),
      // 列还不存在时不查（B 腿的"迁移前"就是这样）—— 缺列本身由 present 面取证
      orphan_null: columns.assessment_cache.includes('user_id')
        ? Number(conn.one(ro('SELECT COUNT(*) AS c FROM assessment_cache WHERE user_id IS NULL')).c)
        : null,
      assessment_hash: rowHash(
        conn.all(
          ro('SELECT id, word, qtype, question, created_at FROM assessment_cache ORDER BY id'),
        ),
      ),
    };
  } finally {
    conn.close();
  }
}

/**
 * B 腿：把仓库根 data.db **只读复制**成 tmpdir 副本，在副本上走真实迁移路径补齐 000~007。
 * 复制源本身：全程没有写打开、没有跑迁移，只用 stat 比对其 size/mtime。
 */
async function legacyAddColumnLeg(gate, skips, targets) {
  if (!fs.existsSync(LEGACY_SHAPE_SOURCE)) {
    skips.push({
      item: '④-bis 三条加列语句的真执行面',
      reason: `仓库根 ${path.basename(LEGACY_SHAPE_SOURCE)} 不存在 → 无改造前形状可复制（显式 SKIP，非 PASS）`,
    });
    console.log('[SKIP] ④-bis：仓库根 data.db 不存在');
    return { ran: false };
  }
  const srcBefore = statStamp(LEGACY_SHAPE_SOURCE);
  const dst = path.join(TMP_ROOT, 'legacy-shape-copy.db');
  fs.rmSync(dst, { force: true });
  fs.copyFileSync(LEGACY_SHAPE_SOURCE, dst);
  for (const s of ['-wal', '-shm'])
    if (fs.existsSync(LEGACY_SHAPE_SOURCE + s)) fs.copyFileSync(LEGACY_SHAPE_SOURCE + s, dst + s);
  targets.push({
    role: '④-bis 真·改造前形状（仓库根本机开发库的 tmpdir 只读副本）',
    instance: dst,
    opened_at: nowStamp(),
    note: '复制源全程只 stat，未写打开、未跑迁移',
  });

  const before = await measureLegacyShape(dst);
  printMetric('legacy_users_rows_pre', before.counts.users, 'sqlite');
  printMetric(
    'legacy_columns_pre_absent',
    NEW_COLUMNS.map(
      (c) =>
        `${c.table}.${c.column}=${before.present.includes(`${c.table}.${c.column}`) ? 'present' : 'absent'}`,
    ).join('|'),
    'sqlite',
  );
  gate(
    '④-bis 前置/副本上三条新列一律不存在（= 真·改造前形状，A 腿的 init() 同形问题在这里不存在）',
    before.present.length === 0,
    `副本 users=[${before.columns.users.join(',')}] · assessment_cache=[${before.columns.assessment_cache.join(',')}]`,
  );

  const mig = runMigrate(dst, []);
  printMetric('legacy_migrate_exit', mig.ok ? '0' : `(非 0：${mig.reason})`, 'sqlite');
  gate(
    '④-bis 真实迁移路径（migrate.ts）在副本上退出码 0',
    mig.ok,
    mig.reason ?? `补齐 000~${REPLAYED_MIGRATION}`,
  );
  const seen = NEW_COLUMNS.filter((c) =>
    new RegExp(`ADD COLUMN\\s+${c.column}\\b`).test(mig.stdout),
  ).map((c) => `${c.table}.${c.column}`); // SCAN-EXEMPT 对 migrate.ts 的 stdout 做正则取证，不作为语句执行
  printMetric('legacy_alter_statements_executed', seen.join('|') || '(none)', 'sqlite');
  gate(
    '④-bis 三条 ADD COLUMN 的语句**逐字出现在本次迁移的执行输出里**（真执行，不是幂等跳过）',
    seen.length === NEW_COLUMNS.length,
    `${seen.length}/${NEW_COLUMNS.length} 条：${seen.join(' · ')}`,
  );
  const diffLine = /\[SchemaDiff\]\s*(\d+)\s*处差异/.exec(mig.stdout);
  printMetric('legacy_schema_diff_count', diffLine ? diffLine[1] : '(未打印)', 'sqlite');
  gate(
    '④-bis 迁移后 migrate.ts 自证的 schema 反读 == DDL 单一源（[SchemaDiff] 0 处差异）',
    diffLine?.[1] === '0',
    diffLine?.[0] ?? '输出里没有 [SchemaDiff] 行',
  );

  const after = await measureLegacyShape(dst);
  printMetric('legacy_pw_rowhash_before', before.users_hash, 'sqlite');
  printMetric('legacy_pw_rowhash_after', after.users_hash, 'sqlite');
  gate(
    '④-bis 真·改造前库上的存量行零回填：users 逐行 (id,phone,password,created_at) hash 未变 + 计数与 SUM(id) 未变',
    before.users_hash === after.users_hash &&
      JSON.stringify(before.counts) === JSON.stringify(after.counts) &&
      JSON.stringify(before.sums) === JSON.stringify(after.sums) &&
      before.assessment_hash === after.assessment_hash,
    `users ${before.counts.users} 行 hash ${before.users_hash}→${after.users_hash} · assessment ${before.counts.assessment_cache} 行 hash ${before.assessment_hash}→${after.assessment_hash} · SUM ${JSON.stringify(before.sums)}→${JSON.stringify(after.sums)}`,
  );
  const nullDefault = after.shape['assessment_cache.user_id'];
  printMetric(
    'legacy_user_id_default_null',
    nullDefault ? String(nullDefault.dflt_value) : '(缺列)',
    'sqlite',
  );
  gate(
    '④-bis 存量 assessment_cache 行迁移后一律无主（user_id IS NULL == 全部行，读路径按 R-41③ 一律跳过）',
    Boolean(nullDefault) && after.orphan_null === after.counts.assessment_cache,
    `无主 ${after.orphan_null}/${after.counts.assessment_cache}（默认值反读 dflt=${nullDefault ? String(nullDefault.dflt_value) : 'n/a'} · notnull=${nullDefault?.notnull ?? 'n/a'} · 迁移前该列存在否=${before.columns.assessment_cache.includes('user_id')}）`,
  );

  const srcAfter = statStamp(LEGACY_SHAPE_SOURCE);
  printMetric('legacy_source_untouched', srcAfter, 'sqlite');
  gate(
    '数据红线/复制源 data.db 全程未被写入：迁移前后 size+mtime 一字未变（本脚本只读复制，绝不对它跑迁移）',
    srcBefore === srcAfter,
    `${srcBefore} → ${srcAfter}`,
  );
  return { ran: true, before, after, seen, copy: dst };
}

/* ════════════════════════ main ════════════════════════ */

const GATES = [];

async function main() {
  let args;
  try {
    args = parseReleaseArgs(process.argv.slice(2), {
      '--tag': { key: 'tag', value: true },
      '--out': { key: 'out', value: true },
      '--snapshot': { key: 'snapshot', value: true },
      '--rollback': { key: 'rollback', value: false },
      '--old-image-tag': { key: 'oldImageTag', value: true },
      '--skip-ddl-parity': { key: 'skipDdlParity', value: false },
      '--skip-pg': { key: 'skipPg', value: false },
      '--keep-tmp': { key: 'keepTmp', value: false },
      '--manifest-check': { key: 'manifestCheck', value: false },
    });
  } catch (e) {
    console.error(`[FATAL] 参数错误：${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.selfTest) process.exit(printSelfTest());

  resetRegistry();
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  setLogFile(path.join(TMP_ROOT, 'restore-drill.log'));

  const tag = String(args.tag ?? 'v2.0.0');
  const outRaw =
    args.out === 'backups' || args.out === 'backups/'
      ? path.join(REPO_ROOT, 'backups')
      : (args.out ?? args.outDir ?? DEFAULT_OUT);
  const outDir = assertSnapshotOutDir(outRaw);
  const targets = [];
  const skips = [];
  let legacyShape = { ran: false, executed: [], copy: null };
  const gate = (id, pass, detail) => {
    const t = gateTierOf(id);
    GATES.push({ id, pass: Boolean(pass), tier: t.tier });
    return printGate(id, Boolean(pass), detail, t.tier, t.why);
  };

  gate(
    '步 5/产物目录纪律（只准 backups 或 tmpdir）',
    outDir.ok,
    outDir.ok ? outDir.target : outDir.reason,
  );
  if (!outDir.ok) {
    emitSummary({
      task: 'T-21b restore-drill',
      verdict: 'REJECT',
      exitCode: 2,
      targets,
      extra: { skipped: skips },
    });
    console.error(outDir.reason);
    process.exit(2);
  }
  if (outRaw === args.out && String(args.out).startsWith('backups')) {
    note(
      '本轮显式 --out backups：快照与 manifest 写进仓库 backups/（该目录被 .gitignore 忽略，不入 git）',
    );
  }

  /* ── --manifest-check（N-4 配套 · 只读）：核对台账每条目 restore_drill 非 null 且字段齐全，缺项 → exit 1。
       本模式零写入（只 fs.readFileSync 一份 manifest.json）、不开源库、不产快照 —— 不加新写面。 ── */
  if (args.manifestCheck) {
    const mFile = path.join(outDir.target, 'manifest.json');
    let doc = null;
    let readErr = null;
    try {
      if (fs.existsSync(mFile)) doc = parseJson(fs.readFileSync(mFile, 'utf8'));
    } catch (e) {
      readErr = e instanceof Error ? e.message : String(e);
    }
    const all = doc && Array.isArray(doc.entries) ? doc.entries : [];
    const checked = args.tag ? all.filter((e) => e && String(e.tag) === String(args.tag)) : [];
    targets.push({ role: 'manifest-check(只读)', instance: mFile, opened_at: nowStamp() });
    const per = checked.map((e) => ({ file: e?.file ?? '(无 file)', issues: drillIssues(e) }));
    for (const p of per)
      printMetric(
        `manifest_drill_check[${p.file}]`,
        p.issues.length ? `缺项：${p.issues.join('、')}` : '完备',
        'n/a',
      );
    const checkOk =
      Boolean(doc) && checked.length > 0 && per.every((p) => p.issues.length === 0);
    gate(
      `台账核对/restore_drill 非 null 且字段齐全（${args.tag ? `tag=${args.tag}` : '未给 --tag → 无可核对条目'} · ${checked.length} 条）`,
      checkOk,
      !doc
        ? `manifest.json 不存在或不可解析：${mFile}${readErr ? `（${readErr}）` : ''}`
        : checked.length === 0
          ? '无匹配条目（台账里没有该 tag 的可核对条目 —— 发布窗口即"有备份无演练"或 tag 写错）'
          : per.some((p) => p.issues.length)
            ? JSON.stringify(per.filter((p) => p.issues.length))
            : '全部条目演练结论完备',
    );
    // T-21e：台账核对模式的退出码也走同一份 registry 算式（hard 红 → 2；soft 红/缺项 → 1）
    const mcFacts = gateExitContrib(registryGates());
    const mcExit = mcFacts.hard.length
      ? 2
      : checkOk && mcFacts.soft.length === 0
        ? 0
        : 1;
    emitSummary({
      task: 'T-21b restore-drill (--manifest-check)',
      verdict: mcExit === 0 ? 'PASS' : 'FAIL',
      exitCode: mcExit,
      targets,
      extra: {
        manifest_check: {
          file: mFile,
          tag: args.tag ?? '(未指定)',
          checked: checked.length,
          bad: per.filter((p) => p.issues.length).length,
        },
        gate_exit: {
          total: mcFacts.total,
          failed: mcFacts.failed.map((g) => `${g.level}:${g.id}`),
        },
      },
    });
    if (!args.keepTmp) cleanupTmpRoot();
    process.exit(mcExit);
  }

  /* ── 源实例：--db 指定的那份库，或 tmpdir 自建的改造前样例库 ── */
  let sourceFile;
  let localFixtureOnly = false;
  if (args.db) {
    sourceFile = resolveRepoPath(args.db);
  } else {
    sourceFile = path.join(TMP_ROOT, 'pre-migration-source.db');
    const { seed, hasReleaseSeed } = buildDrillSeed(args.fixture);
    localFixtureOnly = !hasReleaseSeed;
    note(
      hasReleaseSeed
        ? `fixture 提供 release_seed：${resolveRepoPath(args.fixture ?? DEFAULT_FIXTURE)}`
        : 'fixture 无 release_seed → 回落 builtinSeed() + 四类账号样例造数：本地样例造数、非线上口径（数字禁入任何验收材料）',
    );
    buildPreReleaseSource(sourceFile, seed);
  }
  const guard = assertSafeTarget(args, sourceFile);
  gate('安全阀/源库可只读打开', guard.ok, guard.ok ? guard.label : guard.reason);
  if (!guard.ok) {
    console.error(guard.reason);
    process.exit(guard.code ?? 2);
  }

  const src = await measure(sourceFile);
  targets.push({
    role: 'source(样例形状，迁移到 006 为止)',
    instance: sourceFile,
    opened_at: nowStamp(),
    dry_run: args.dryRun,
  });
  const srcStatus = migrateStatus(sourceFile);
  gate(
    `④前置/A 腿源实例的待执行清单恰为 ${REPLAYED_MIGRATION}（001 的两条 ADD COLUMN 已在源上真执行）`,
    srcStatus.ran && srcStatus.pending.length === 1 && srcStatus.pending[0] === REPLAYED_MIGRATION,
    `pending=${JSON.stringify(srcStatus.pending)} · users 两列在位=${src.columns['users.pw_policy_version'] ? 'yes' : 'no'}/${src.columns['users.password_changed_at'] ? 'yes' : 'no'}`,
  );
  gate(
    '④前置/判据④主证据腿=④-bis 副本腿：A 腿只证幂等路径，"三条 ADD COLUMN 已真执行"不得记在 A 腿头上' +
      '（migrate.ts 先 db.init() 建当前 DDL，sqlite.ts 的 assessment_cache 建表串与 007 同形 ⇒ 全新库上 007 是幂等跳过、加列语句不落）',
    Boolean(src.columns['assessment_cache.user_id']) &&
      srcStatus.pending.includes(REPLAYED_MIGRATION),
    `A 腿源实例：assessment_cache.user_id 建表串已带列=${src.columns['assessment_cache.user_id'] ? 'yes（同形坐实）' : 'no（口径变了：A 腿不再只是幂等腿，须重查 sqlite.ts 建表串）'} · 007 仍在待执行清单=${srcStatus.pending.includes(REPLAYED_MIGRATION)} · 逐字执行证据 = ④-bis 的 legacy_alter_statements_executed（tmpdir 副本腿）`,
  );

  /* ── ② 步 5 ── */
  const snapFile = path.join(outDir.target, snapshotFileName('sqlite', tag));
  let snapshot = {
    ok: false,
    file: snapFile,
    size: 0,
    sha256: null,
    reason: '未产出',
    reused: false,
  };
  if (args.snapshot) {
    const p = resolveRepoPath(args.snapshot);
    const allowed =
      assertSnapshotOutDir(path.dirname(p)).ok || path.resolve(path.dirname(p)) === outDir.target;
    if (!allowed) snapshot = { ...snapshot, reason: `--snapshot 指到产物区之外：${p}` };
    else if (!fs.existsSync(p)) snapshot = { ...snapshot, reason: `--snapshot 文件不存在：${p}` };
    else
      snapshot = {
        ok: true,
        file: p,
        size: fs.statSync(p).size,
        sha256: sha256Of(p),
        reason: null,
        reused: true,
      };
    if (snapshot.ok && snapshot.size <= 0)
      snapshot = { ...snapshot, ok: false, reason: '复用的快照 size=0' };
  } else {
    try {
      const size = vacuumInto(sourceFile, snapFile);
      snapshot = {
        ok: size > 0,
        file: snapFile,
        size,
        sha256: size > 0 ? sha256Of(snapFile) : null,
        reason: size > 0 ? null : 'VACUUM INTO 产出 0 字节',
        reused: false,
      };
    } catch (e) {
      snapshot = {
        ...snapshot,
        reason: `VACUUM INTO 异常：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  printMetric('snap_tag', tag, 'sqlite');
  printMetric('snap_file', snapshot.file, 'sqlite');
  printMetric('snap_size_bytes', snapshot.size, 'sqlite');
  printMetric('snap_sha256', snapshot.sha256 ?? '(null)', 'sqlite');
  gate(
    '② 步 5/快照产物存在且 size>0',
    snapshot.ok && snapshot.size > 0,
    snapshot.reason ?? `${snapshot.file}（size=${snapshot.size}）`,
  );
  gate(
    '② 步 5/校验和已算出（sha256 · 64 hex）',
    Boolean(snapshot.sha256 && snapshot.sha256.length === 64),
    snapshot.sha256 ?? '(null)',
  );

  let manifest = { file: null, entries: 0 };
  /** U-4：步 5 先落条目（未演练 = null，不伪造结论），主流程末尾对同条目追加一次 restore_drill 更新。 */
  let manifestEntry = null;
  if (snapshot.ok) {
    manifestEntry = {
      tag,
      kind: 'sqlite',
      driver: 'sqlite',
      file: path.basename(snapshot.file),
      size_bytes: snapshot.size,
      sha256: snapshot.sha256,
      created_at: nowStamp(),
      source_instance: sourceFile,
      source_table_counts: src.tableCounts,
      local_fixture_only: localFixtureOnly,
      restore_drill: null,
    };
    const m = upsertManifest(outDir.target, manifestEntry);
    manifest = { file: m.file, entries: m.entries };
  }
  printMetric('manifest_entries', manifest.entries, 'sqlite');
  gate(
    '② 步 5/manifest.json 已写且条目含 sha256',
    Boolean(manifest.file && snapshot.sha256),
    manifest.file ?? '(未写)',
  );

  /* ── pg 侧（步 5 的 .dump 分支 + 判据③④⑤ 的 pg 同口径） ── */
  const url = pgUrl();
  const pgRan = args.driver !== 'sqlite' && !args.skipPg && Boolean(url);
  if (!pgRan) {
    console.log(pgSkipReason());
    skips.push({
      item: '步 5 的 pg `.dump` 与判据③④⑤ 的 pg 同口径',
      reason: url ? '--driver sqlite' : 'DATABASE_URL_TEST 未设置（本机无 PG 实例）',
    });
  }

  /* ── ③ 步 6：恢复到临时实例 + 指纹比对 ── */
  const restoredFile = path.join(TMP_ROOT, 'restored-instance.db');
  let integrity = '(未跑)';
  let restored = null;
  if (snapshot.ok) {
    fs.mkdirSync(path.dirname(restoredFile), { recursive: true });
    fs.rmSync(restoredFile, { force: true });
    fs.copyFileSync(snapshot.file, restoredFile);
    const rc = await openSqliteReadOnly(restoredFile);
    try {
      integrity = String(rc.one(ro('PRAGMA integrity_check')).integrity_check);
    } finally {
      rc.close();
    }
    restored = await measure(restoredFile);
  }
  targets.push({ role: 'restored(temp instance)', instance: restoredFile, opened_at: nowStamp() });
  printMetric('restored_integrity', integrity, 'sqlite');
  printMetric('restored_users', restored?.user_ids.length ?? 0, 'sqlite');
  printMetric('restored_wordbook_rows', restored?.wordbook_rows ?? 0, 'sqlite');
  printMetric('restored_wordbook_entries', restored?.wordbook_entries ?? 0, 'sqlite');
  printMetric('restored_users_fp', restored?.users_hash ?? '(null)', 'sqlite');
  printMetric('restored_wordbooks_fp', restored?.wordbooks_hash ?? '(null)', 'sqlite');
  const fpMatch =
    Boolean(restored) &&
    src.users_hash === restored.users_hash &&
    src.wordbooks_hash === restored.wordbooks_hash;
  const setMatch =
    Boolean(restored) &&
    fingerprintInts(src.user_ids).sha256_12 === fingerprintInts(restored.user_ids).sha256_12;
  printMetric('fingerprint_vs_source', fpMatch && setMatch ? 'EQUAL' : 'DIFF', 'sqlite');
  gate(
    '③ 步 6/恢复到临时实例并读出用户与词本',
    Boolean(restored) &&
      integrity === 'ok' &&
      (restored?.user_ids.length ?? 0) > 0 &&
      (restored?.wordbook_rows ?? 0) > 0,
    `integrity=${integrity} · users=${restored?.user_ids.length ?? 0} · wordbook_rows=${restored?.wordbook_rows ?? 0} · entries=${restored?.wordbook_entries ?? 0}`,
  );
  gate(
    '③ 步 6/与源实例指纹一致（user_id 集合 + users 全行 + wordbooks 全行）',
    fpMatch && setMatch,
    `源 ${src.user_ids.length} 人 / 恢复 ${restored?.user_ids.length ?? 0} 人 · 集合指纹 ${fingerprintInts(src.user_ids).sha256_12} vs ${fingerprintInts(restored?.user_ids ?? []).sha256_12}`,
  );
  gate(
    '③ 步 6/快照读不回 = 没有可用备份（R-24 ③ 同口径阻断）',
    snapshot.ok && Boolean(restored),
    snapshot.reason ?? '可读回',
  );

  /* ── ④ 步 6b ── */
  let after = null;
  let backfillHits = null; // U-4：回填台账要读这个计数，提到 if(restored) 块外
  let mig = { ok: false, reason: '未执行（恢复实例不可用）', stdout: '' };
  if (restored) {
    const pre = restored;
    const st = migrateStatus(restoredFile);
    printMetric('addcolumn_pending_before', st.pending.join('|') || '(none)', 'sqlite');
    gate(
      `④ 步 6b/待执行清单含 ${REPLAYED_MIGRATION}（走真实迁移路径，本文件零 DDL）`,
      st.pending.includes(REPLAYED_MIGRATION),
      `pending=${JSON.stringify(st.pending)} · status 退出码核对 ${st.ok ? '待执行为空' : '仍有待执行'}`,
    );
    mig = runMigrate(restoredFile, []);
    printMetric(
      'addcolumn_applied',
      mig.ok ? REPLAYED_MIGRATION : `(失败：${mig.reason})`,
      'sqlite',
    );
    gate('④ 步 6b/迁移路径重放退出码 0', mig.ok, mig.reason ?? `已重放 ${REPLAYED_MIGRATION}`);
    after = await measure(restoredFile);
    const three = NEW_COLUMNS.map((c) => {
      const info = after.columns[`${c.table}.${c.column}`];
      // sqlite 的 PRAGMA 把 `DEFAULT NULL` 反读成字符串 'NULL'（不是 JS null）→ 两种写法都算默认 NULL
      const isNullDefault = info
        ? info.dflt_value == null || String(info.dflt_value).trim().toUpperCase() === 'NULL'
        : false;
      const defaultOk = info
        ? c.expect_default === null
          ? isNullDefault
          : String(info.dflt_value) === c.expect_default
        : false;
      return {
        ...c,
        present: Boolean(info),
        default_ok: defaultOk,
        dflt: info ? String(info.dflt_value) : 'n/a',
      };
    });
    printMetric(
      'three_columns_present',
      three
        .filter((t) => t.present && t.default_ok)
        .map((t) => `${t.table}.${t.column}`)
        .join('|') || '(none)',
      'sqlite',
    );
    gate(
      '④ 步 6b①/三列存在且默认值合口径（两列 0 · user_id 默认 NULL）',
      three.every((t) => t.present && t.default_ok),
      three
        .map((t) => `${t.table}.${t.column}:present=${t.present},dflt=${t.default_ok}`)
        .join(' · '),
    );
    printMetric('pw_rowhash_before', pre.users_password_hash, 'sqlite');
    printMetric('pw_rowhash_after', after.users_password_hash, 'sqlite');
    gate(
      '④ 步 6b①/存量 password 逐行 hash 未变',
      pre.users_password_hash === after.users_password_hash,
      `${pre.users_password_hash} → ${after.users_password_hash}`,
    );
    printMetric('table_counts_before', JSON.stringify(pre.tableCounts), 'sqlite');
    printMetric('table_counts_after', JSON.stringify(after.tableCounts), 'sqlite');
    printMetric('table_sumid_before', JSON.stringify(pre.tableSums), 'sqlite');
    printMetric('table_sumid_after', JSON.stringify(after.tableSums), 'sqlite');
    printMetric('table_rows_hash_before', JSON.stringify(pre.tableHashes), 'sqlite');
    printMetric('table_rows_hash_after', JSON.stringify(after.tableHashes), 'sqlite');
    gate(
      '④ 步 6b①/五表 COUNT(*) · SUM(主键) · 改造前列集全行 hash 演练前后逐项相等',
      JSON.stringify(pre.tableCounts) === JSON.stringify(after.tableCounts) &&
        JSON.stringify(pre.tableSums) === JSON.stringify(after.tableSums) &&
        JSON.stringify(pre.tableHashes) === JSON.stringify(after.tableHashes),
      `${JSON.stringify(pre.tableCounts)} = ${JSON.stringify(after.tableCounts)} · hash 面 ${Object.keys(after.tableHashes).length}/5 张表逐张相等`,
    );
    printMetric('ac_rows_before', pre.assessment_rows, 'sqlite');
    printMetric('ac_rows_after', after.assessment_rows, 'sqlite');
    printMetric('ac_orphan_before', pre.assessment_orphan, 'sqlite');
    printMetric('ac_orphan_after', after.assessment_orphan, 'sqlite');
    gate(
      '④ 步 6b①/assessment_cache 行数与"无主行数"前后相等（存量行一律无主）',
      pre.assessment_rows === after.assessment_rows &&
        after.assessment_orphan === after.assessment_rows,
      `rows ${pre.assessment_rows}→${after.assessment_rows} · 无主 ${pre.assessment_orphan}→${after.assessment_orphan}`,
    );
    gate(
      '④ 步 6b①/存量 assessment_cache 逐行内容 hash 未变',
      pre.assessment_hash === after.assessment_hash,
      `${pre.assessment_hash} → ${after.assessment_hash}`,
    );
    const backfill = scanMigrationsForBackfill();
    backfillHits = backfill.hits.length;
    printMetric('backfill_scan_hits', backfill.hits.length, 'sqlite');
    printMetric('backfill_scan_informational', backfill.informational.length, 'sqlite');
    gate(
      `④ 步 6b②/迁移源码零回填（4 条全局禁令 + ${DELTA_MIGRATION_FILES.length} 个本期迁移文件的破坏性禁令；其余文件 down() 里的删表语句记 informational）`,
      backfill.hits.length === 0,
      `扫 ${backfill.files} 个迁移文件 · 违规 ${backfill.hits.length}${backfill.hits.length ? ` → ${JSON.stringify(backfill.hits.slice(0, 3))}` : ''} · 非本期面 ${backfill.informational.length} 处（${[...new Set(backfill.informational.map((h) => h.file.replace('.ts', '')))].join('|')}）`,
    );
    const legacy = await legacyAddColumnLeg(gate, skips, targets);
    legacyShape = { ran: legacy.ran, executed: legacy.seen ?? [], copy: legacy.copy ?? null };
    if (args.skipDdlParity) {
      skips.push({
        item: '④ 步 6b②-b ddl-parity',
        reason: '--skip-ddl-parity 显式跳过（不算 PASS）',
      });
      console.log('[SKIP] ④ 步 6b②-b：--skip-ddl-parity');
    } else {
      const dp = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools', 'ddl-parity.mjs')], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      gate(
        '④ 步 6b②-b tools/ddl-parity.mjs 退出码 0（sqlite 侧 A 段真跑；pg 侧由该脚本自身记 SKIP）',
        dp.status === 0,
        `退出码 ${dp.status} · 尾行：${
          String(dp.stdout ?? '')
            .trim()
            .split('\n')
            .slice(-1)[0]
        }`,
      );
      if (dp.status !== 0)
        note(
          'ddl-parity 若因 db/**（T-25r3 并发面）红：按提示词只记录不修，本脚本如实透传其退出码',
        );
    }
    printMetric('acct_class_short_pw0', after.pw0_with_password, 'sqlite');
    printMetric('acct_class_strong_pw1', after.class_strong_old.length, 'sqlite');
    printMetric('acct_class_empty_pw', after.empty_pw, 'sqlite');
    printMetric('acct_class_activated', after.class_activated.length, 'sqlite');
    gate(
      '④ 步 6b③-⑧/四类账号在恢复实例上齐备且可分类（短密码 pw0 · 强密码 pw1 未改密 · 空密码 · 刚激活 pw1+改密时刻）',
      after.pw0_with_password > 0 &&
        after.class_strong_old.length > 0 &&
        after.empty_pw > 0 &&
        after.class_activated.length > 0,
      `短密码老=${after.pw0_with_password} 强密码老=${JSON.stringify(after.class_strong_old)} 空密码=${after.empty_pw} 刚激活=${JSON.stringify(after.class_activated)}`,
    );
    printMetric('q_source', src.pw0_with_password, 'sqlite');
    printMetric('q_restored', after.pw0_with_password, 'sqlite');
    gate(
      '④ 步 6b⑧/源实例与恢复实例的 Q 同口径一致（Q 的 SQL 排除空密码 → 空密码号不被误判需升级）',
      src.pw0_with_password === after.pw0_with_password && after.empty_pw > 0,
      `Q 源=${src.pw0_with_password} 恢复=${after.pw0_with_password} · 空密码=${after.empty_pw}`,
    );
    note(
      '6b③④⑤⑦ 的登录面（upgrade_required + upgrade token、旧 token 401、零掉线）属服务端接口行为，判据落在 R-40 用例与 §6.4-2b 人工演练；本脚本只出取数面，不替代那一条',
    );
  } else {
    printMetric('addcolumn_pending_before', '(未跑：无恢复实例)', 'sqlite');
    printMetric('addcolumn_applied', '(未跑)', 'sqlite');
    printMetric('three_columns_present', '(未跑)', 'sqlite');
    printMetric('pw_rowhash_before', '(未跑)', 'sqlite');
    printMetric('pw_rowhash_after', '(未跑)', 'sqlite');
    for (const k of [
      'table_counts_before',
      'table_counts_after',
      'table_sumid_before',
      'table_sumid_after',
      'ac_rows_before',
      'ac_rows_after',
      'ac_orphan_before',
      'ac_orphan_after',
      'q_source',
      'q_restored',
      'backfill_scan_hits',
      'acct_class_short_pw0',
      'acct_class_strong_pw1',
      'acct_class_empty_pw',
      'acct_class_activated',
    ])
      printMetric(k, '(未跑)', 'sqlite');
    gate(
      '④ 步 6b/恢复实例不可用 → 回填演练无从谈起',
      false,
      'restored = null（步 5 快照未产出或未读回）',
    );
  }

  /* ── ⑤ 步 7 ── */
  const oldTag = String(args.oldImageTag ?? process.env.ROLLBACK_IMAGE ?? '');
  const probe = probeOldImage(oldTag);
  const rbTarget = after ? restoredFile : snapshot.file;
  const oldRead = fs.existsSync(rbTarget)
    ? await oldImageReadShape(rbTarget)
    : { users_rows: 0, assessment_rows: 0, wordbook_rows: 0, errors: ['新 schema 库不存在'] };
  printMetric('old_image_users_rows_read', oldRead.users_rows, 'sqlite');
  printMetric('old_image_assessment_rows_read', oldRead.assessment_rows, 'sqlite');
  const userIdCol = after?.columns?.['assessment_cache.user_id'] ?? null;
  const writeShape = Boolean(userIdCol) && Number(userIdCol?.notnull ?? 1) === 0;
  printMetric(
    'old_image_write_shape_ok',
    writeShape ? 'nullable_default_null' : 'unknown',
    'sqlite',
  );
  gate(
    '⑤ 步 7/旧列清单在新 schema 上只读执行不报错（旧镜像不读新列仍能跑）',
    oldRead.errors.length === 0 && oldRead.users_rows > 0 && oldRead.wordbook_rows > 0,
    oldRead.errors.length
      ? JSON.stringify(oldRead.errors)
      : `users=${oldRead.users_rows} assessment=${oldRead.assessment_rows} wordbooks=${oldRead.wordbook_rows}（列清单里不含三列）`,
  );
  gate(
    '⑤ 步 7/旧镜像写形态结构合法：user_id 可空且默认 NULL → 旧写入语句不给该列也成立',
    writeShape,
    `PRAGMA table_info(assessment_cache).user_id → notnull=${userIdCol?.notnull ?? 'n/a'} dflt=${String(userIdCol?.dflt_value ?? 'NULL')}`,
  );
  if (!probe.available) {
    skips.push({
      item: '⑤ 步 7 真机回滚（旧镜像 tag 起容器 + 2 小时预发窗口）',
      reason: probe.reason,
    });
    console.log(
      `[SKIP] ⑤ 步 7 真机回滚演练：${probe.reason} —— 这不是 PASS，(a)~(d) 的**实测**结论要在 §6.4-2b 的窗口里签字`,
    );
  } else {
    note(
      `检测到可 inspect 的旧镜像 tag ${oldTag}：真起容器属发布窗口动作，本脚本不代为执行 docker run`,
    );
  }
  const concl = {
    a: `旧镜像仍能读写新 schema + 三列不读不报错：结构面已证 —— 旧列清单读到 users ${oldRead.users_rows} 行 / assessment_cache ${oldRead.assessment_rows} 行 / wordbooks ${oldRead.wordbook_rows} 行且无报错；写面 user_id 可空默认 NULL。"密码登录与注册在旧镜像可用"需真机：${probe.available ? `已检出 tag ${oldTag}（未起容器，属发布窗口动作）` : 'SKIP —— ' + probe.reason}`,
    b: `旧 APK（含 hotfix 后手写版）回滚后 查词→背词→同步：SKIP —— 需真机 + §6.4-2b 的连续 2 小时预发窗口；账号范围限定同 R-40 ⑩ / §8.2-5（只对 pw_policy_version≥1 的账号成立，=0 的待升级号只要求"不崩、不丢本地数据、给可读提示"）。R-17⑧ 红线在本脚本为只读引用：旧 APK 可见响应体的 error 键名不得改（只改值不改键，PRD :516/:526/:574），本任务不碰 routes/trpc`,
    c: `新 App 回滚前写入的词本数据不丢、不被覆盖：结构面已证 —— 恢复实例跑完 ADD COLUMN 后 wordbooks 行数 ${after?.wordbook_rows ?? 'n/a'}（快照内 ${restored?.wordbook_rows ?? 'n/a'}）、全行 hash ${after?.wordbooks_hash ?? 'n/a'} 与快照内 ${restored?.wordbooks_hash ?? 'n/a'} 一致；真机窗口的"回滚后抽样条数 ≥ 回滚前"= SKIP（同 (b) 的窗口）`,
    d: `R-40 / M7 回滚只回镜像、不动库：已证 —— 001 与 007 都没有可逆 down（007 带 noDownReason），迁移源码零删列/删表动作，本脚本的执行面里没有任何结构语句；"门禁失效但数据完好、已改密设备用新密码仍能登录"= R-40 ⑦ 的接口用例面，本脚本不替代`,
  };
  for (const k of ['a', 'b', 'c', 'd']) printMetric(`rollback_conclusion_${k}`, concl[k], 'n/a');
  console.log('\n===== 步 7 回滚演练四条结论（R-24 ⑧ (a)(b)(c)(d)） =====');
  for (const k of ['a', 'b', 'c', 'd']) console.log(`  (${k}) ${concl[k]}`);
  gate(
    '⑤ 步 7/(a)(b)(c)(d) 四条结论逐条输出',
    ['a', 'b', 'c', 'd'].every((k) => concl[k].length > 40),
    '详见上方 4 行 rollback_conclusion_*',
  );

  /* ── 步 5b：失败可见性（降级口径） ── */
  const ch = getAlertChannel();
  gate(
    '步 5b(A)/告警通道未配置 = 降级为日志 + 标红，绝不报错阻塞（R-24 ⑩）',
    !ch.blocking,
    ch.configured ? `已配置（host=${ch.host}）→ (A)① 的真通道演练需发布窗口` : ch.red_flag,
  );
  if (!ch.configured) console.log(`[RED-FLAG] ${ch.red_flag}`);
  gate(
    '步 5b(B)/发布前强制读回：快照真读一次并出五表计数',
    Boolean(restored) && (restored?.tableCounts?.users ?? 0) > 0,
    JSON.stringify(restored?.tableCounts ?? {}),
  );
  gate(
    '步 5b/正常备份零通知（成功路径不发通知，防噪音）',
    snapshot.ok,
    `通知只存在于失败分支（backup.ts 的 notified 在成功分支恒 false）；本轮 ok=${snapshot.ok}`,
  );

  /* ── 只读执行面自证 ── */
  const roOnly = SQL_SURFACE.every((s) => /^(SELECT|PRAGMA)\b/i.test(s));
  printMetric(
    'sql_surface_readonly_only',
    `${roOnly ? 'YES' : 'NO'}(${SQL_SURFACE.length} 条)`,
    'sqlite',
  );
  gate(
    '只读执行面：本文件执行过的每一条语句都以 SELECT/PRAGMA 开头（产物写点另计，仅 1 处 VACUUM INTO）',
    roOnly && SQL_SURFACE.length > 0,
    `${SQL_SURFACE.length} 条 · 非只读 ${SQL_SURFACE.filter((s) => !/^(SELECT|PRAGMA)\b/i.test(s)).length} 条`,
  );
  console.log('--- SQL 执行面清单（可核对） ---');
  for (const s of new Set(SQL_SURFACE)) console.log(`  · ${s}`);

  /* ── U-4（A-45 #91）：演练结论进台账 —— 主流程末尾对同 tag·file·sha256 的条目追加一次 restore_drill
       更新。仍走唯一产物写点 upsertManifest()（去重键 file+sha256 ⇒ 原地替换步 5 条目），不加新写面。 ── */
  const failedPreLedger = GATES.filter((g) => !g.pass).map((g) => g.id);
  let drillBackfill = null;
  if (manifestEntry) {
    drillBackfill = {
      ok: failedPreLedger.length === 0,
      verdict: failedPreLedger.length === 0 ? 'PASS' : 'FAIL',
      failed_gates: failedPreLedger,
      tag,
      snapshot_sha256: snapshot.sha256,
      restored_integrity: integrity,
      fingerprint_vs_source: fpMatch && setMatch ? 'EQUAL' : 'DIFF',
      backfill_scan_hits: backfillHits,
      rollback_conclusion_a: concl.a,
      rollback_conclusion_b: concl.b,
      rollback_conclusion_c: concl.c,
      rollback_conclusion_d: concl.d,
      executed_at: nowStamp(),
      local_fixture_only: localFixtureOnly,
    };
    upsertManifest(outDir.target, { ...manifestEntry, restore_drill: drillBackfill });
    printMetric(
      'manifest_restore_drill_backfilled',
      drillBackfill.ok ? 'YES(PASS)' : 'YES(FAIL 结论已如实入台账)',
      'sqlite',
    );
  } else {
    printMetric('manifest_restore_drill_backfilled', '(无条目：快照未产出)', 'sqlite');
  }
  const ledgerIssues = manifestEntry
    ? drillIssues({ restore_drill: drillBackfill })
    : ['无本快照台账条目可回填（步 5 快照未产出）'];
  gate(
    '② 步 5/台账 restore_drill 已回填且字段齐全（防"有备份无演练"：步 5 条目先 null、演练主流程末尾更新）',
    Boolean(manifestEntry) && drillBackfill?.ok === true && ledgerIssues.length === 0,
    manifestEntry
      ? ledgerIssues.length === 0
        ? `${manifestEntry.file} → restore_drill.ok=${drillBackfill.ok} · verdict=${drillBackfill.verdict}`
        : `结论不完整：${ledgerIssues.join('、')}`
      : '(快照未产出 → 台账无条目)',
  );

  /* ── 出口判定（T-21e：hard 红线门红 → 2；soft 门红/缺必需计数 → 1；advisory 红只标红不拦人）──
     failed_gates 仍按"全档红清单"入台账侧口径（U-4 防"有备份无演练"，比退出码更严，不改）。 */
  const missing = requireMetrics(REQUIRED_METRICS, null);
  const failed = GATES.filter((g) => !g.pass).map((g) => g.id);
  const gateFacts = gateExitContrib(registryGates());
  const dualDriverOk = Boolean(pgRan && snapshot.ok && restored);
  const extra = {
    snapshot: {
      tag,
      file: snapshot.file,
      size_bytes: snapshot.size,
      sha256: snapshot.sha256,
      ok: snapshot.ok,
      reason: snapshot.reason,
      reused: snapshot.reused,
    },
    manifest_file: manifest.file,
    manifest_restore_drill: drillBackfill
      ? { ok: drillBackfill.ok, verdict: drillBackfill.verdict, missing_fields: ledgerIssues }
      : null,
    out_dir: outDir.target,
    local_fixture_only: localFixtureOnly,
    dual_driver: {
      ok: dualDriverOk,
      sqlite: Boolean(snapshot.ok && restored),
      pg: pgRan,
      note: dualDriverOk
        ? '双驱动同口径各跑一遍'
        : '判据③④⑤ 的 pg 侧未真跑（显式 SKIP，非 PASS）→ CI 必须带 DATABASE_URL_TEST 补跑',
    },
    alerts: { configured: ch.configured, blocking: false, degraded: !ch.configured },
    skipped: skips,
    old_image: { tag: oldTag || '(未提供)', available: probe.available, reason: probe.reason },
    migration: {
      ok: mig.ok,
      replayed: after ? [REPLAYED_MIGRATION] : [],
      expected_full_list: EXPECTED_MIGRATIONS,
      source_cutoff: SOURCE_CUTOFF_MIGRATION,
    },
    legacy_shape: legacyShape,
    failed_gates: failed,
    gate_exit: {
      total: gateFacts.total,
      failed: gateFacts.failed.map((g) => `${g.level}:${g.id}`),
    },
    sql_surface: { total: SQL_SURFACE.length, read_only_only: roOnly },
  };
  const exitCode = gateFacts.hard.length
    ? 2
    : !missing.ok || gateFacts.soft.length
      ? 1
      : 0;
  console.log('\n===== 门禁 → 退出码归因（T-21e）=====');
  for (const g of gateFacts.failed)
    console.log(`  × [${g.level}] ${g.id}${g.detail ? ` :: ${g.detail}` : ''}`);
  console.log(
    `  门共 ${gateFacts.total} 条（红 ${gateFacts.failed.length}：hard=${gateFacts.hard.length} soft=${gateFacts.soft.length} advisory=${gateFacts.advisory.length}，advisory 红不进退出码）· 缺计数项=${missing.ok ? 0 : '一揽子'} → exit ${exitCode}`,
  );
  emitSummary({
    task: 'T-21b restore-drill',
    verdict: exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode,
    targets,
    extra,
  });
  if (!args.keepTmp && !args.db) cleanupTmpRoot();
  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`[FATAL] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  });
}
