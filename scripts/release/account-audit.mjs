#!/usr/bin/env node
/**
 * scripts/release/account-audit.mjs — T-21 第 1 轮 (a) 只读账号体检（判据① + 判据⑧）
 *
 * 对应原文（唯一口径来源，本文件不复述判据、只实现它）：
 *   · PRD §6.4-2 步 4  —— 六项计数 N / M / K / P / Q + 四张表行数快照
 *   · PRD §6.4-4 Q8' 保留对账 —— 空密码账号 user_id 集合名下的**五类**保留计数
 *   · PRD §6.4-2 步 6 / R-41 ⑦（判据⑧）—— `SELECT COUNT(*) FROM assessment_cache WHERE user_id IS NULL`
 *   · §10.2 T-21 行判据① —— "步 4 输出 N/M/K/P/Q + 五类保留计数 六项，双驱动各一遍，缺任一项 exit 1"
 *   · §6.4-2 步 5b / R-24 ⑩ —— 告警通道未配置 = 标红 + 日志，**不报错、不阻塞**
 *
 * ★ 本文件是**纯观测面**：从头到尾只有 SELECT。判据⑧ 的硬约束"只观测、不处置"由
 *   `--self-test` 里的 `assertScriptIsReadOnlySelf()` 对本文件源码做静态扫描来机器取证，
 *   不是纸面承诺。无主 `assessment_cache` 旧行的处置是**下一期**的输入（§10.2 T-21 行原文）。
 *
 * ★ 本地库 ≠ 线上库：本脚本 --dry-run（缺省）跑的是 os.tmpdir() 下自建临时库，
 *   它输出的任何数字都只是"脚本有判定力"的证据，禁止当作线上规模写进发布报告 / 公告 / 验收材料
 *   （PRD §6.4-2 步 4 的"本地数字禁入义务"）。线上实测口径 = --i-know-this-is-prod + 步 5 的只读副本。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_FIXTURE,
  GATE_LEVELS,
  REPO_ROOT,
  TMP_ROOT,
  WRITE_STATEMENT_KEYWORDS,
  assertSafeTarget,
  assertScriptIsReadOnlySelf,
  builtinSeed,
  cleanupTmpRoot,
  emitSummary,
  fingerprintInts,
  gateExitContrib,
  getAlertChannel,
  loadFixture,
  nowStamp,
  note,
  openPgReadOnly,
  openSqliteReadOnly,
  pgSkipReason,
  pgUrl,
  printGate,
  printMetric,
  parseReleaseArgs,
  registryGates,
  requireMetrics,
  resetRegistry,
  resolveRepoPath,
  runSafetySelfTest,
  runSqliteMigrations,
  seedTempSqlite,
  setLogFile,
} from './lib.mjs';

/** 步 4 + §6.4-4 五类保留 + 判据⑧：缺任一项 exit 1（按 driver 分别校验）。 */
const REQUIRED_METRICS = [
  'step4_N_empty_password_users',
  'step4_M_wordbook_rows',
  'step4_M_wordbook_entries',
  'step4_K_fsrs_card_rows',
  'step4_P_checkin_rows',
  'step4_Q_pw_policy0_with_password',
  'step6_snapshot_users_rows',
  'step6_snapshot_wordbooks_rows',
  'step6_snapshot_fsrs_cards_rows',
  'step6_snapshot_checkin_logs_rows',
  'retain_wordbook_rows',
  'retain_wordbook_entry_total',
  'retain_fsrs_card_rows',
  'retain_checkin_rows',
  'retain_profile_rows',
  'r41_assessment_cache_user_id_is_null',
];

const HELP = `account-audit —— 线上账号体检（T-21 判据① + 判据⑧，全程只读）

用法：
  node scripts/release/account-audit.mjs [options]

默认安全：不写 --execute / --i-know-this-is-prod 时 **一律按 --dry-run 处理**，
  此时只允许打开 os.tmpdir() 下的临时库；命中仓库根 data.db 或 packages/server/data.db
  且未带 --i-know-this-is-prod → 拒绝执行并 exit 2（数据红线安全阀）。

开关：
  --dry-run                缺省态；只跑临时库，不碰任何真库
  --execute                声明真实读取（对已存在的库文件出数，仍不写任何东西）
  --i-know-this-is-prod    显式承认目标是线上/部署机正式库（PRD 步 4 要求的"是一次显式动作"）
  --driver sqlite|pg|both  缺省 both；单驱动运行会把"双驱动各跑一遍"判为未成立
  --db <path>              sqlite 目标库（缺省时用 --fixture 在 tmpdir 自建临时库）
  --fixture <path>         自建临时库的造数声明（优先读其 release_seed 块），缺省 ${DEFAULT_FIXTURE}
  --out-dir <path>         额外把机器可读小结写成 JSON 归档（默认不落盘）
  --keep-tmp               保留临时库（默认为本次运行新建、跑完删除）
  --allow-single-driver    接受"只跑了一个驱动"的口径（自检专用；真实发布窗口禁止使用）
  --json                   末尾小结同时以单行 JSON 再打一次
  --self-test              只跑安全阀/只读自检，不出数
  --help                   本帮助

退出码：0 = 判据成立（或 dry-run 自检口径下 pg 显式 SKIP）；1 = 缺计数项 / soft 档门红（判据不成立）；2 = 安全阀拒绝 / hard 档红线门红。`;

/* ─────────────────── 门禁分级表（T-21e：T-21d 之于 preflight 的同一形态，复用 lib 的
 * gateExitContrib + registryGates，本文件不写第二份档位→退出码算式）───────────────────
 * 规则（从严，与 preflight 的 T-21d 表同口径）：
 *   · 门 id 以某条 key 开头即命中该档；一条没命中 → 默认 soft（红即 exit 1，照样拦人）。
 *   · hard 只收"写数据 / 触碰真库 / 静默丢数据 / 契约破坏面"且逐条写 why；advisory 是白名单，why 必填。 */
const GATE_TIERS = [
  {
    key: '步5b/',
    tier: 'advisory',
    why:
      '咨询性门·白名单：告警通道未配置是**降级项**（getAlertChannel() 两态都返回 blocking:false，判据文案自身即"绝不报错、绝不阻塞"，R-24 ⑩），' +
      '拿它拦人只会逼发布方跳过体检；仍打印 [RED] 行 + 档位=advisory 留痕。与 preflight 步 5b(A) 同口径（A-54 #146 / A-56 #154 已裁）。',
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

/**
 * 步 4 的六项 + §6.4-4 的五类保留 + 判据⑧，全部为纯 SELECT。
 * @param {{driver:'sqlite'|'pg', all:Function, one:Function}} conn
 */
async function collectSixItems(conn) {
  const d = conn.driver;
  // PRD 步 4 的判空口径逐字照抄：password IS NULL OR TRIM(password)=''
  const EMPTY = "(u.password IS NULL OR TRIM(u.password)='')";
  const ENTRY_SUM =
    d === 'pg'
      ? 'COALESCE(SUM(jsonb_array_length(w.data::jsonb)),0)'
      : 'COALESCE(SUM(json_array_length(w.data)),0)';

  // ── 步 4 ①：N 可激活账号数 ────────────────────────────────────────────
  const N = Number(
    (await conn.one("SELECT COUNT(*) AS v FROM users WHERE password IS NULL OR TRIM(password)=''"))
      .v,
  );
  printMetric('step4_N_empty_password_users', N, d);

  // ── 步 4 ②：M 词本行数 / 词条总数 ─────────────────────────────────────
  const M = await conn.one(
    `SELECT COUNT(*) AS rows_count, ${ENTRY_SUM} AS entries FROM wordbooks w JOIN users u ON u.id=w.user_id WHERE ${EMPTY}`,
  );
  printMetric('step4_M_wordbook_rows', M.rows_count, d);
  printMetric('step4_M_wordbook_entries', M.entries, d);

  // ── 步 4 ③：K FSRS 卡数 ───────────────────────────────────────────────
  const K = await conn.one(
    `SELECT COUNT(*) AS v FROM fsrs_cards c JOIN users u ON u.id=c.user_id WHERE ${EMPTY}`,
  );
  printMetric('step4_K_fsrs_card_rows', Number(K.v), d);

  // ── 步 4 ④：P 打卡记录数 ──────────────────────────────────────────────
  const P = await conn.one(
    `SELECT COUNT(*) AS v FROM checkin_logs k JOIN users u ON u.id=k.user_id WHERE ${EMPTY}`,
  );
  printMetric('step4_P_checkin_rows', Number(P.v), d);

  // ── 步 4 ⑤：Q 上线后第一次登录就被拦进强制改密页的账号数 ──────────────
  const Q = await conn.one(
    `SELECT COUNT(*) AS v FROM users WHERE password IS NOT NULL AND TRIM(password)<>'' AND pw_policy_version=0`,
  );
  printMetric('step4_Q_pw_policy0_with_password', Number(Q.v), d);
  note(
    `driver=${d} Q 是 §8.1 门禁预期与 §6.6-4 第 3 条文案的依据；它随用户完成改密应单调下降（§6.4-4）`,
  );

  // ── 步 4 ⑥：四张表行数快照（本次为"测试前"基线；测试后快照归 b/c 轮对账） ──
  for (const t of ['users', 'wordbooks', 'fsrs_cards', 'checkin_logs']) {
    const v = await conn.one(`SELECT COUNT(*) AS v FROM ${t}`);
    printMetric(`step6_snapshot_${t}_rows`, Number(v.v), d);
  }

  // ── §6.4-4 Q8' 五类保留计数（空密码账号 user_id 集合名下） ────────────
  const ids = (
    await conn.all(`SELECT id FROM users WHERE password IS NULL OR TRIM(password)='' ORDER BY id`)
  ).map((r) => Number(r.id));
  const retainWb = await conn.one(
    `SELECT COUNT(*) AS rows_count, ${ENTRY_SUM} AS entries FROM wordbooks w JOIN users u ON u.id=w.user_id WHERE ${EMPTY}`,
  );
  printMetric('retain_wordbook_rows', Number(retainWb.rows_count), d);
  printMetric('retain_wordbook_entry_total', Number(retainWb.entries), d);
  const retainFsrs = await conn.one(
    `SELECT COUNT(*) AS v FROM fsrs_cards c JOIN users u ON u.id=c.user_id WHERE ${EMPTY}`,
  );
  printMetric('retain_fsrs_card_rows', Number(retainFsrs.v), d);
  const retainCheckin = await conn.one(
    `SELECT COUNT(*) AS v FROM checkin_logs k JOIN users u ON u.id=k.user_id WHERE ${EMPTY}`,
  );
  printMetric('retain_checkin_rows', Number(retainCheckin.v), d);
  const retainProfile = await conn.one(
    `SELECT COUNT(*) AS v FROM profiles p JOIN users u ON u.id=p.user_id WHERE ${EMPTY}`,
  );
  printMetric('retain_profile_rows', Number(retainProfile.v), d);
  // §6.4-4 的交叉校验：profiles 行数应恒等于 N（不等 = 有账号无 profile 的半状态）
  gate(
    `${d}/profiles==N`,
    Number(retainProfile.v) === N,
    `retain_profile_rows=${retainProfile.v} vs N=${N}`,
  );
  const fp = fingerprintInts(ids);
  printMetric('empty_password_userid_set_count', fp.count, d);
  printMetric('empty_password_userid_set_sha256_12', fp.sha256_12, d);
  note(
    `driver=${d} 空密码 user_id 集合基线指纹（已哈希脱敏，§6.6-2 产物义务）：count=${fp.count} sha256[:12]=${fp.sha256_12}`,
  );

  // ── 判据⑧：R-41 无主旧行残留只读计数（只观测、不处置） ────────────────
  const orphan = await conn.one(`SELECT COUNT(*) AS v FROM assessment_cache WHERE user_id IS NULL`);
  printMetric('r41_assessment_cache_user_id_is_null', Number(orphan.v), d);
  note(
    `driver=${d} 判据⑧ 是改造前基线归档，"有数即可，不要求为 0"（PRD 步 6）；` +
      `本脚本对它只有 SELECT，处置归下一期。上线前后该计数必须相等或只因新增行而不减（§6.4-4）。`,
  );

  return {
    N,
    M_rows: Number(retainWb.rows_count),
    K: Number(retainFsrs.v),
    P: Number(retainCheckin.v),
    Q: Number(Q.v),
    orphan: Number(orphan.v),
    setFingerprint: fp,
  };
}

async function main() {
  let args;
  try {
    args = parseReleaseArgs(process.argv.slice(2), {
      '--keep-tmp': { key: 'keepTmp', value: false },
    });
  } catch (e) {
    console.error(`[FATAL] 参数错误：${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.selfTest) {
    console.log('account-audit --self-test');
    const safety = runSafetySelfTest();
    const self = assertScriptIsReadOnlySelf(
      path.join(REPO_ROOT, 'scripts', 'release', 'account-audit.mjs'),
    );
    console.log('--- 本文件源码静态扫描（判据⑧「只观测、不处置」的机器取证） ---');
    console.log(
      `  ${self.ok ? 'OK  ' : 'BAD '}account-audit.mjs 的写语句关键字命中数 = ${self.hits.length}` +
        `（关键字表 = lib.mjs 的 ${WRITE_STATEMENT_KEYWORDS.join('/')}，扫描前先去注释）` +
        (self.ok
          ? ' → 零命中：本文件对 assessment_cache 只有 SELECT，处置逻辑一行都不存在'
          : ` → ${JSON.stringify(self.hits)}`),
    );
    console.log('--- 告警通道（R-24 ⑩ / 步 5b 降级口径） ---');
    const ch = getAlertChannel();
    console.log(
      `  ${ch.configured ? `已配置（host=${ch.host}）` : '未配置'} → ${ch.verdict} · blocking=${ch.blocking}`,
    );
    const vaccineOk = runGateVaccine();
    process.exit(safety.allOk && self.ok && !ch.blocking && vaccineOk ? 0 : 1);
  }

  resetRegistry();
  setLogFile(path.join(TMP_ROOT, 'account-audit.log'));
  const targets = [];
  let sqliteFile = args.db ? resolveRepoPath(args.db) : null;

  // ── sqlite 目标确定（缺省 = 用 fixture 在 tmpdir 自建，走真实迁移路径） ──
  if (args.driver !== 'pg') {
    if (!sqliteFile) {
      sqliteFile = path.join(TMP_ROOT, 'audit-selfcheck.db');
      const fixtureArg = args.fixture ?? DEFAULT_FIXTURE;
      const fx = loadFixture(fixtureArg);
      const seed = fx.seed ?? builtinSeed();
      note(
        `未给 --db → 在 os.tmpdir() 自建临时库：fixture=${path.relative(REPO_ROOT, fx.abs)}` +
          `（release_seed=${fx.hasReleaseSeed ? '有' : '无 → 回落 lib.mjs builtinSeed 的本地样例造数'}）` +
          '；本地库 ≠ 线上库，本行以下的所有数字禁止进入任何验收材料。',
      );
      const mig = runSqliteMigrations(sqliteFile);
      if (!mig.ok) {
        console.error(
          `[FATAL] 临时库迁移失败（步 5c 的真实迁移路径跑不通，无法自检）：${mig.reason}`,
        );
        process.exit(1);
      }
      seedTempSqlite(sqliteFile, seed);
      printMetric('tmp_db_migrations_ok', 1, 'sqlite');
    } else {
      const guard = assertSafeTarget(args, sqliteFile);
      if (!guard.ok) {
        console.error(`[SAFETY-VALVE] ${guard.reason}`);
        process.exit(guard.code ?? 2);
      }
      note(`目标库自证（PRD 步 4"报告里要能看到哪个库、什么时候跑的"）：${guard.label}`);
    }
  }

  // ── 逐驱动跑六项 ────────────────────────────────────────────────────
  const results = {};
  let missing = [];
  for (const driver of args.driver === 'both' ? ['sqlite', 'pg'] : [args.driver]) {
    if (driver === 'sqlite') {
      let conn = null;
      try {
        conn = await openSqliteReadOnly(sqliteFile);
        const id = await conn.identity();
        targets.push({ driver, ...id, mode: 'ro' });
        console.log(
          `\n[TARGET] driver=sqlite 实例=${id.instance} size=${id.size_bytes}B mtime=${id.mtime} 打开时刻=${id.collected_at}`,
        );
        results.sqlite = await collectSixItems(conn);
        missing = missing.concat(
          requireMetrics(REQUIRED_METRICS, 'sqlite').missing.map((m) => `sqlite/${m}`),
        );
      } catch (e) {
        console.error(`[FAIL] sqlite 侧未出数：${e instanceof Error ? e.message : String(e)}`);
        missing = missing.concat(REQUIRED_METRICS.map((m) => `sqlite/${m}(异常)`));
      } finally {
        conn?.close();
      }
    } else {
      const url = pgUrl();
      if (!url) {
        console.log(`\n${pgSkipReason()}`);
        targets.push({
          driver: 'pg',
          instance: null,
          skipped: true,
          reason: 'DATABASE_URL_TEST 未设置',
          collected_at: nowStamp(),
        });
        continue;
      }
      let conn = null;
      try {
        conn = await openPgReadOnly(url);
        const id = await conn.identity();
        targets.push({ driver: 'pg', ...id, mode: 'default_transaction_read_only=on' });
        console.log(
          `\n[TARGET] driver=pg 实例=${id.instance} server_version=${id.server_version} 打开时刻=${id.collected_at}`,
        );
        results.pg = await collectSixItems(conn);
        missing = missing.concat(
          requireMetrics(REQUIRED_METRICS, 'pg').missing.map((m) => `pg/${m}`),
        );
      } catch (e) {
        console.error(`[FAIL] pg 侧未出数：${e instanceof Error ? e.message : String(e)}`);
        missing = missing.concat(REQUIRED_METRICS.map((m) => `pg/${m}(异常)`));
      } finally {
        await conn?.close();
      }
    }
  }

  // ── 双驱动覆盖门禁（判据①：SQLite / PG 同口径各跑一遍） ───────────────
  const ran = Object.keys(results);
  const pgSkipped = args.driver !== 'sqlite' && !results.pg;
  const dualOk = ran.length === 2;
  // dry-run = 自检口径，允许单驱动出数；真实读取（--execute / --i-know-this-is-prod）必须双驱动齐，否则判未成立。
  const singleDriverTolerated = (args.dryRun || args.allowSingleDriver) && ran.length === 1;
  const gateOk = dualOk || singleDriverTolerated;
  gate(
    '判据①/双驱动各跑一遍',
    gateOk,
    dualOk
      ? 'sqlite + pg 均出数'
      : `实跑驱动 = ${ran.join('+') || '无'}；${args.dryRun ? 'dry-run 自检口径放行单驱动' : '真实读取需双驱动'}${
          pgSkipped ? '，pg 侧为显式 SKIP（不是 PASS）' : ''
        }`,
  );
  if (!dualOk) {
    note(
      '本轮运行**未**达成判据① 的"双驱动各跑一遍"（A-18-3 口径：本机无 PG 实例）—— ' +
        'CI（T-22）必须带 DATABASE_URL_TEST 重跑本命令，才算该项成立。',
    );
  }

  // ── 告警通道（步 5b：未配置绝不阻塞） ────────────────────────────────
  const channel = getAlertChannel();
  printMetric('alert_webhook_configured', channel.configured ? 1 : 0, 'n/a');
  if (!channel.configured) {
    console.log(`[RED] 告警通道未配置 → 标红 + 写日志，判定为通过（降级）：${channel.red_flag}`);
    note(`ALERT_WEBHOOK_URL：${channel.note}`);
  } else {
    note(
      `ALERT_WEBHOOK_URL：已配置（host=${channel.host}，地址本身不打印）· ${channel.note}；成功路径不发通知。`,
    );
  }
  gate(
    '步5b/告警通道未配置不得阻塞',
    !channel.blocking,
    `configured=${channel.configured} blocking=${channel.blocking}`,
  );

  // ── 缺项门禁 + 小结（T-21e：退出码 = hard 红线门 ? 2 : soft 门红/缺计数项 ? 1 : 0，算式只此一份）──
  if (missing.length) {
    console.log(`[FAIL] 六项计数缺失 ${missing.length} 项：${missing.join(', ')}`);
  }
  const gateFacts = gateExitContrib(registryGates());
  const exitCode = gateFacts.hard.length
    ? 2
    : missing.length || gateFacts.soft.length
      ? 1
      : 0;
  console.log('\n===== 门禁 → 退出码归因（T-21e）=====');
  for (const g of gateFacts.failed)
    console.log(`  × [${g.level}] ${g.id}${g.detail ? ` :: ${g.detail}` : ''}`);
  console.log(
    `  门共 ${gateFacts.total} 条（红 ${gateFacts.failed.length}：hard=${gateFacts.hard.length} soft=${gateFacts.soft.length} advisory=${gateFacts.advisory.length}，advisory 红不进退出码）· 缺计数项=${missing.length} → exit ${exitCode}`,
  );
  if (exitCode === 1 && !missing.length && !gateOk) {
    console.log(
      '[FAIL] 判据① 要求双驱动各跑一遍，本次只跑通一个驱动的真实读取 → 判未成立（自检请加 --dry-run，或显式 --allow-single-driver）',
    );
  }
  const summary = emitSummary({
    task: 'T-21(a) account-audit',
    verdict:
      exitCode === 0
        ? dualOk
          ? 'PASS（双驱动）'
          : `PASS（单驱动容忍口径：${args.dryRun ? 'dry-run 自检' : '--allow-single-driver 显式豁免'}）· 判据① 的"双驱动各跑一遍"本轮未达成（pg ${pgSkipped ? '显式 SKIP，非 PASS' : '未调度：--driver 限定'}）`
        : 'FAIL',
    exitCode,
    targets,
    extra: {
      mode: args.dryRun ? 'dry-run（本地临时库，数字非线上口径）' : 'execute',
      required_metrics: REQUIRED_METRICS,
      missing,
      gate_exit: {
        total: gateFacts.total,
        failed: gateFacts.failed.map((g) => `${g.level}:${g.id}`),
      },
      dual_driver: {
        ran,
        pg_skipped: pgSkipped,
        ok: dualOk,
        tolerated_single_driver: singleDriverTolerated,
      },
      alert_channel: { configured: channel.configured, blocking: channel.blocking },
      read_only_self_check: { statement_kinds: 'SELECT only' },
    },
  });
  if (args.json) console.log(JSON.stringify(summary));
  if (args.outDir) {
    const out = path.join(resolveRepoPath(args.outDir), `account-audit-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[ARCHIVE] 机器可读小结已写入 ${out}`);
  }
  if (!args.keepTmp && sqliteFile?.startsWith(TMP_ROOT)) cleanupTmpRoot();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`[FATAL] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
