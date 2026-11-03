#!/usr/bin/env node
/**
 * scripts/release/preflight.mjs — T-21 发布前一键入口（把 a 轮的账号体检与 b 轮的演练面串成一条命令）
 *
 * 清单顺序按 PRD §6.4-2（v1.5 起 15 项）里 **T-21 能机器化的那几步**排列：
 *   步 4  线上账号体检 N/M/K/P/Q + 五类保留 + 判据⑧ 无主计数 …… a 轮 `account-audit.mjs`
 *   步 5c **部署/起服前先 `pnpm db:migrate`**（v1.5 新增的独立前置步）→ 本脚本自己跑真实迁移 + `--status` 只读核对
 *   步 5  快照 + 校验和 + manifest                          …… b 轮 `restore-drill.mjs` ②
 *   步 5b 失败可见性（未配置即降级，绝不阻塞）+ 发布前强制读回 …… `restore-drill.mjs` 的 5b 门 + 本脚本的通道状态行
 *   步 6  恢复演练                                          …… `restore-drill.mjs` ③
 *   步 6b 三条 ADD COLUMN + 零回填断言                       …… `restore-drill.mjs` ④
 *   步 7  旧镜像连新 schema 的回滚冒烟                       …… `restore-drill.mjs` ⑤
 *   步 8  开关初值读回 + 改值 ≤60 秒生效实测                   …… **本文件 T-21c-iv（判据⑥）**
 *   步 6  对账基线（5 项 × 采样 n=20，两路径互校 diff=0）      …… **T-21c-v 装配：真调 `reconcile.mjs --mode diff-sample --n 20`（判据⑦）**
 *   步 5  台账 `restore_drill` 核对（只读零写入）              …… **T-21c-v 装配：真调 `restore-drill.mjs --manifest-check`（防"有备份无演练"）**
 *   （原"步 6 对账基线本脚本显式标未实现"一行自 T-21c-v 起作废：脚本面已真调、退出码已进门禁；
 *     仍**未实测**的是**线上 ≥20 真实账号**那一层口径，见 `summary.skipped`，不冒充绿。）
 *
 * 退出码（沿用 a 轮 §3.2 约定）：2=安全阀拒绝/CLI 非法；1=任一子步判据不成立或缺必需计数；
 *   0=成立 —— 其中 pg 侧与真机回滚演练在本机为**显式 SKIP**（`summary.dual_driver.ok=false`），不算 PASS。
 *
 * 本文件同样受"只读 + 只写 backups/"纪律约束：`--self-test` 会静态扫描自家三个 .mjs。
 *
 * 步 8（T-21c-iv 新增）的两条硬约束：
 *   · 开关真值源 = `packages/server/src/services/feature-flags.ts`（A-32-7 授权 import 面内的第三个文件）。
 *     **不 import** `routes/admin-flags.ts`（那是写口，读回不该经它）、不 import `config.ts`、
 *     不 import 其余任何 `packages/server/src/**`；`--self-test` 有 `step8ImportFaceCheck()` 钉这条线。
 *   · 翻转开关只发生在 `os.tmpdir()` 的临时库上（临时库由真实迁移路径 005-feature-flags 种入初值）。
 *     仓库内两个 `data.db` 全程只读 —— 生成式 harness 里的 `assertTmpOnly()` 是第二道闸。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FIXTURE,
  GATE_LEVELS,
  REPO_ROOT,
  TMP_ROOT,
  cleanupTmpRoot,
  emitSummary,
  gateExitContrib,
  getAlertChannel,
  nowStamp,
  note,
  parseReleaseArgs,
  printGate,
  printMetric,
  protectedSqlitePaths,
  registryGates,
  requireMetrics,
  resetRegistry,
  runSafetySelfTest,
  setLogFile,
  tsxCliPath,
} from './lib.mjs';
import { assertScriptsReadOnlySelf, migrateStatus, runMigrate } from './restore-drill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 只转发子脚本一定认识的公共面，避免 `--tag`/`--out` 之类把 account-audit 顶成 exit 2。 */
const COMMON_FLAGS = {
  '--dry-run': false,
  '--execute': false,
  '--driver': true,
  '--fixture': true,
  '--db': true,
  '--json': false,
  '--i-know-this-is-prod': false,
  '--allow-single-driver': false,
  '--self-test': false,
  '--out-dir': true,
};

/** 自家三个 .mjs；只有 restore-drill 允许那 1 处快照产物写点。 */
const OWN_FILES = [
  { file: path.join(HERE, 'preflight.mjs') },
  { file: path.join(HERE, 'account-audit.mjs') },
  { file: path.join(HERE, 'restore-drill.mjs'), snapshotWriter: true },
];

/* ─────────────────── 门禁分级表（T-21d）───────────────────
 * 缺陷原委：`[GATE] xxx → FAIL` 只进 `REGISTRY.gates` 再打印，**没有一条 inline 门进退出码**
 * （旧算式只看 `children[]` 与 `step8Bad`）⇒ 报红不拦人 = 没有检查。本表把档位绑到门 id 前缀上。
 * 规则（从严）：
 *   · 门 id 以某条 `key` **开头**即命中该档；一条都没命中 → 默认 `soft`（失败 → exit 1，照样拦人）。
 *   · `hard` 只收"失败即不得发布"的红线：写数据 / 触碰真库 / 契约破坏面，且必须逐条写 `why`。
 *   · `advisory` 是**白名单**：只在这里登记过的门才允许"报红不拦人"，`why` 必填 —— 不许整片默认放行。
 * `--self-test` 的疫苗门（`疫苗 ①/②/③/④`）也走同一张表与同一个 `gateExitContrib()`，故分级表本身可证。 */
const GATE_TIERS = [
  {
    key: '步 5c ①',
    tier: 'hard',
    why: '真实迁移路径跑不通 = 上线后新列根本不存在，服务端读侧整片 500（契约破坏面）',
  },
  {
    key: '步 5c ②',
    tier: 'hard',
    why: '`--status` 还有 pending = 带着旧 schema 起服，代码与新库形状不一致（契约破坏面）',
  },
  {
    key: '步 5c ③',
    tier: 'hard',
    why: '清单条目未逐条落到迁移账本 = schema 与"已应用"记录不符，重放/回滚无据可依（契约破坏面）',
  },
  {
    key: '步 8 ⑧',
    tier: 'hard',
    why: '仓库两个 data.db 前后指纹不一致 = 真库被写过（触碰真库，R-41 ④ / §6.1 只读红线）',
  },
  {
    key: '步 5b(A)',
    tier: 'advisory',
    why: '咨询性门·白名单：告警通道未配置是**降级项**（`getAlertChannel()` 两态都返回 `blocking:false`，判据文案自身即"绝不阻塞"）；' +
      '拿它拦人只会逼发布方跳过预检，而失败可见性已由步 5b(B) 的强制读回兜住。仍打印 [RED-FLAG] 与档位=advisory 留痕。',
  },
  {
    key: '疫苗 ②',
    tier: 'hard',
    why: '仅 `--self-test` 疫苗门：故意 FAIL 的 hard 门必须能把退出码贡献翻成 2（不跑真判据、不碰真注册表）',
  },
  {
    key: '疫苗 ③',
    tier: 'advisory',
    why: '仅 `--self-test` 疫苗门：故意 FAIL 的 advisory 门必须**不**翻退出码，用来反证白名单机制自身有效',
  },
];

/** 门 id → 档位 + 理由。未登记 = soft（从严：新加的门天然会拦人，要放过必须显式进白名单）。 */
function gateTierOf(id) {
  const s = String(id);
  const hit = GATE_TIERS.find((t) => s.startsWith(t.key));
  return hit ?? { key: null, tier: 'soft', why: '未登记分级 → 默认 soft（失败即 exit 1）' };
}

/** 唯一的 inline 门入口：打人行 + 进注册表 + 带上档位与理由，末尾与子进程最坏值合并成退出码。 */
const gate = (id, pass, detail) => {
  const t = gateTierOf(id);
  return printGate(id, Boolean(pass), detail, t.tier, t.why);
};

/** 分级表自证：档位合法 + hard/advisory 必须带理由（防"空壳白名单整片放行"）。 */
function gateTierTableCheck() {
  const bad = GATE_TIERS.filter(
    (t) =>
      !GATE_LEVELS.includes(t.tier) ||
      (t.tier !== 'soft' && String(t.why ?? '').trim().length < 12),
  );
  const dup = GATE_TIERS.map((t) => t.key).filter((k, i, a) => a.indexOf(k) !== i);
  return {
    ok: bad.length === 0 && dup.length === 0,
    hard: GATE_TIERS.filter((t) => t.tier === 'hard').map((t) => t.key),
    advisory: GATE_TIERS.filter((t) => t.tier === 'advisory').map((t) => t.key),
    bad: bad.map((t) => t.key),
    dup,
  };
}

/**
 * 步 6 对账基线的采样档位 = PRD/§10.2 T-21 判据⑦ 的字面口径（`--mode diff-sample --n 20`）。
 * 缺省走 tmpdir 自建库；**本地样例库的账号数与条数一律不构成"≥20 真实账号 diff=0"的证据**（Phase 7 线上口径）。
 */
const RECONCILE_SAMPLE_N = 20;

/** 与 `restore-drill.mjs:950` 的 `String(args.tag ?? 'v2.0.0')` 同值：未显式 --tag 时台账条目的 tag。 */
const DEFAULT_DRILL_TAG = 'v2.0.0';

/* ══════════════ 步 8（判据⑥）：开关初值读回 + 改值 ≤60 秒生效实测 ══════════════ */

/**
 * 开关真值源。A-32-7 只授权 import `backup.ts` / `feature-flags.ts` / `wordbook-service.ts` 的
 * `reconcileFor`；本步只用 `feature-flags.ts` 导出的 `createFeatureFlags`（读回 + 走它自己的 set 路径），
 * **不 import** `routes/admin-flags.ts`（写口）、`config.ts`、以及其余任何 `packages/server/src/**`。
 */
const FEATURE_FLAGS_TS = path.join(
  REPO_ROOT,
  'packages',
  'server',
  'src',
  'services',
  'feature-flags.ts',
);

/** harness 只落在 TMP_ROOT（os.tmpdir() 下），仓库里不留文件。 */
const STEP8_HARNESS_FILE = path.join(TMP_ROOT, 'step8-flags-harness.mjs');

/** PRD §6.4-7 进入窗口时的开关初值 —— 逐字抄自 `.delivery/01-prd.md:688`，不许自己发挥。 */
const PRD_STEP8_INITIAL = {
  wordbookIncremental: '0%',
  explicitFavorite: 'on',
  autoFavoriteDefault: 'off',
  studyModes: 'on',
  dailyReminder: 'on(20:30)',
  passwordRegister: 'on',
  avatarUnifiedLimit: 'on',
  passwordUpgradeEnforce: 'on',
};

/** 本轮断言的主键 + v1.3 已作废、盘上不得复活的键（01-prd.md:688 末句）。 */
const FLAG_KEY = 'passwordUpgradeEnforce';
const DEADLINE_KEY_RE = /deadline/i;

/** 生效上限 = `@tm/shared` 的 `FLAG_EFFECTIVE_MAX_SECONDS`（60 秒）；TTL 用生产默认 30 秒，不缩短。 */
const FLAG_LATENCY_MAX_MS = 60_000;
const FLAG_WATCH_TIMEOUT_MS = 90_000;
const FLAG_POLL_MS = 2_000;

/** 步 8 的必需计数项：缺任一项 → exit 1（沿用 account-audit 的 REQUIRED_METRICS 模式）。 */
const REQUIRED_STEP8_METRICS = [
  'step8_flag_rows_read_back',
  'step8_passwordUpgradeEnforce_initial_value',
  'step8_passwordUpgradeEnforce_source',
  'step8_flag_key_count',
  'step8_deadline_key_present',
  'step8_same_process_effective_ms',
  'step8_cross_process_effective_ms',
  'step8_protected_db_untouched',
];

/**
 * 生成式 harness（写到 TMP_ROOT，只在 tmpdir 里跑）。它只做三件事：
 *   list  = 用 `createFeatureFlags(db).list()` 全量读回（发布步 8 的初值断言入口）
 *   flip  = 用同一个 service 的 `set()` 翻转 `passwordUpgradeEnforce` 并立即 `get()` 读回
 *   watch = 冷读一次（值进 30 秒 TTL 缓存）后按 `FLAG_POLL_MS` 轮询，直到看见新值
 * 只用 better-sqlite3 手写 `AppDB['flags']` 那三个方法（get/set/list），不 import `db/**` 的实现。
 */
const STEP8_HARNESS = [
  '// 由 scripts/release/preflight.mjs 步 8 生成；只允许在 os.tmpdir() 下的临时库上运行。',
  "import { createRequire } from 'node:module';",
  "import fs from 'node:fs';",
  "import os from 'node:os';",
  "import path from 'node:path';",
  "import process from 'node:process';",
  "import { pathToFileURL } from 'node:url';",
  '',
  'const mode = process.argv[2];',
  'const dbFile = process.argv[3];',
  'const repoRoot = process.argv[4];',
  'const flagsTs = process.argv[5];',
  'const extra = process.argv[6];',
  "const FLAG_KEY = 'passwordUpgradeEnforce';",
  'const POLL_MS = Number(process.argv[7]) > 0 ? Number(process.argv[7]) : 2000;',
  '',
  '/** 第二道数据红线闸：步 8 的翻转只准落在 os.tmpdir() 内，仓库 data.db 到不了这里。 */',
  'function assertTmpOnly(p) {',
  '  const real = path.resolve(p);',
  '  const base = path.resolve(os.tmpdir());',
  '  if (real === base || real.startsWith(base + path.sep)) return real;',
  "  throw new Error('step-8 refuses non-tmpdir sqlite target: ' + real);",
  '}',
  'const target = assertTmpOnly(dbFile);',
  "const require2 = createRequire(path.join(repoRoot, 'noop.js'));",
  "const Database = require2('better-sqlite3');",
  "const readOnly = mode !== 'flip';",
  'const db = new Database(target, { readonly: readOnly, fileMustExist: true });',
  '',
  '/** 最小 AppDB["flags"] 适配器：feature-flags.ts 只用到 get / set / list 三个方法。 */',
  'const appDbStub = {',
  '  flags: {',
  '    async get(k) {',
  "return db.prepare('SELECT key, value, updated_at FROM feature_flags WHERE key = ?').get(k);", // SCAN-EXEMPT 读语句（SELECT）
  '    },',
  '    async set(k, v, now) {',
  '      if (readOnly) throw new Error("read-only adapter refuses set");',
  '      db.prepare(',
  "        'INSERT INTO feature_flags (key, value, updated_at) VALUES (?, ?, ?) ' +", // SCAN-EXEMPT(T-21c-iv) 唯一写点①：目标已被 assertTmpOnly 钉死在 os.tmpdir() 的临时库；仓库内两个 data.db 一律不可达
  "        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'", // SCAN-EXEMPT(T-21c-iv) 唯一写点②：同一 upsert 的续行，仅 tmpdir 临时库，绝不碰真库 feature_flags 行
  '      )',
  '        .run(k, v, now);',
  '      return { key: k, value: v, updated_at: now };',
  '    },',
  '    async list() {',
  "return db.prepare('SELECT key, value, updated_at FROM feature_flags ORDER BY key').all();", // SCAN-EXEMPT 读语句（SELECT）
  '    },',
  '  },',
  '};',
  '',
  'const mod = await import(pathToFileURL(flagsTs).href);',
  '// 不传 ttlMs：生效延迟实测必须吃生产的 30 秒 TTL，缩短它就是在凑数。',
  'const flags = mod.createFeatureFlags(appDbStub);',
  '// 同步写 fd 1：跨进程握手（READY）不能卡在管道缓冲里，否则父进程永远等不到就绪信号。',
  'const emit = (marker, obj) => fs.writeSync(1, marker + JSON.stringify(obj) + "\\n");',
  'const out = (obj) => emit("RESULT ", obj);',
  '',
  "if (mode === 'list') {",
  '  const rows = await flags.list();',
  '  out({ ok: true, rows, seed_is_db: rows.length > 0 && rows.every((r) => r.source === "db") });',
  "} else if (mode === 'flip') {",
  '  const from = await flags.get(FLAG_KEY);',
  '  const t0 = Date.now();',
  '  await flags.set(FLAG_KEY, extra);',
  '  const written_at = Date.now();',
  '  const to = await flags.get(FLAG_KEY);',
  '  out({ ok: to === extra, from, to, same_process_ms: Date.now() - t0, written_at });',
  "} else if (mode === 'watch') {",
  '  const first = await flags.get(FLAG_KEY);',
  '  const t0 = Date.now();',
  '  emit("READY ", { first, at: t0, poll_ms: POLL_MS, ttl_default_seconds: 30 });',
  '  const deadline = t0 + Number(extra || 90000);',
  '  let final = first;',
  '  let changed_at = null;',
  '  let polls = 0;',
  '  while (Date.now() < deadline) {',
  '    await new Promise((r) => setTimeout(r, POLL_MS));',
  '    polls += 1;',
  '    const v = await flags.get(FLAG_KEY);',
  '    if (v !== first) {',
  '      final = v;',
  '      changed_at = Date.now();',
  '      break;',
  '    }',
  '  }',
  '  out({',
  '    ok: changed_at !== null,',
  '    first,',
  '    final,',
  '    changed_at,',
  '    polls,',
  '    waited_ms: changed_at ? changed_at - t0 : Date.now() - t0,',
  '  });',
  '} else {',
  "  throw new Error('step-8 harness unknown mode: ' + String(mode));",
  '}',
  'db.close();',
  '',
].join('\n');

/** tsx CLI 定位：T-21c-v 按 A-49 #111 上收至 `lib.mjs` 的 `tsxCliPath()`（函数体逐字照搬，本文件改为 import）。 */

function step8Target() {
  return path.join(TMP_ROOT, 'step8-flags.db');
}

function parseResultLine(text, marker) {
  const line = String(text)
    .split('\n')
    .find((l) => l.startsWith(marker));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(marker.length).trim());
  } catch {
    return null;
  }
}

/** 同步跑一次 harness（list / flip）。 */
function runFlagChild(mode, dbFile, extra) {
  const tsxCli = tsxCliPath();
  if (!fs.existsSync(tsxCli))
    return { ok: false, reason: `找不到 tsx CLI（${tsxCli}）→ 步 8 无法加载 feature-flags.ts` };
  const r = spawnSync(
    process.execPath,
    [
      tsxCli,
      STEP8_HARNESS_FILE,
      mode,
      dbFile,
      REPO_ROOT,
      FEATURE_FLAGS_TS,
      ...(extra ? [extra] : []),
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) return { ok: false, reason: `子进程启动失败：${r.error.message}`, raw: out };
  const res = parseResultLine(out, 'RESULT ');
  if (r.status !== 0 || !res)
    return { ok: false, reason: `harness ${mode} 退出码 ${r.status}`, raw: out.slice(-2000) };
  return { ok: true, mode, result: res, raw: out };
}

/** 异步跑 watch（跨进程 TTL 生效路径）：READY 后父进程才去翻转。 */
function startFlagWatch(dbFile) {
  const tsxCli = tsxCliPath();
  if (!fs.existsSync(tsxCli)) {
    return {
      readyAtMs: () => null,
      waitReady: () => Promise.resolve(false),
      result: () => Promise.resolve({ ok: false, reason: `找不到 tsx CLI（${tsxCli}）` }),
    };
  }
  const child = spawn(
    process.execPath,
    [
      tsxCli,
      STEP8_HARNESS_FILE,
      'watch',
      dbFile,
      REPO_ROOT,
      FEATURE_FLAGS_TS,
      String(FLAG_WATCH_TIMEOUT_MS),
      String(FLAG_POLL_MS),
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  let buf = '';
  let errBuf = '';
  let readyAt = null;
  let closed = null;
  const waiters = [];
  const wake = (v) => {
    while (waiters.length) waiters.shift()(v);
  };
  const onData = (chunk) => (buf += String(chunk));
  child.stdout.on('data', (chunk) => {
    onData(chunk);
    if (readyAt === null && closed === null && buf.includes('READY ')) {
      readyAt = Date.now();
      wake(true);
    }
  });
  child.stderr.on('data', (chunk) => {
    errBuf += String(chunk);
  });
  const tail = () =>
    [...buf.split('\n'), ...errBuf.split('\n')].filter(Boolean).slice(-6).join(' | ');
  const done = new Promise((resolve) => {
    child.on('error', (e) => {
      closed = 'error';
      wake(false);
      resolve({
        ok: false,
        reason: `watch 子进程启动失败：${e.message}`,
        stderr: errBuf.slice(-1500),
      });
    });
    child.on('close', (code) => {
      closed = `exit-${code}`;
      wake(false);
      const res = parseResultLine(buf, 'RESULT ');
      if (!res)
        resolve({
          ok: false,
          reason: `watch 未出结果（EXIT=${code}）· 输出尾部：${tail()}`,
          stderr: errBuf.slice(-1500),
        });
      else resolve({ ok: Boolean(res.ok), result: res, raw: buf, stderr: errBuf.slice(-1500) });
    });
  });
  return {
    readyAtMs: () => readyAt,
    waitReady: () =>
      new Promise((resolve) => {
        if (readyAt !== null) resolve(true);
        else if (closed !== null) resolve(false);
        else waiters.push(resolve);
        // 兜底：子进程卡住时也不要把整条 preflight 拖死
        setTimeout(() => resolve(readyAt !== null), FLAG_WATCH_TIMEOUT_MS + 15_000).unref?.();
      }),
    result: () => done,
  };
}

/**
 * 步 8 判定核（纯函数：`--self-test` 拿 fixture 打它，证明错值/缺键/超时都会红）。
 * @param {{rows: Array<{key:string,value:string,source:string}>|null,
 *          latency: {same_process_ms:number|null, cross_process_ms:number|null}|null}} obs
 */
function evaluateStep8(obs) {
  const checks = [];
  const rows = Array.isArray(obs.rows) ? obs.rows : null;
  const latency = obs.latency || null;
  const get = (k) => (rows ? rows.find((r) => r.key === k) : undefined);

  checks.push({
    id: '步 8 ①/真值源 `feature-flags.ts` 的 `list()` 出数且全部 source=db（迁移 005 已种入）',
    pass: rows !== null && rows.length > 0 && rows.every((r) => r.source === 'db'),
    detail:
      rows === null
        ? 'list() 未出数（harness 子进程失败）'
        : `读回 ${rows.length} 行 · 非 db 来源 ${rows.filter((r) => r.source !== 'db').length} 行`,
  });
  const main = get(FLAG_KEY);
  checks.push({
    id: `步 8 ②/${FLAG_KEY} 初值 = PRD §6.4-7 定稿 "${PRD_STEP8_INITIAL[FLAG_KEY]}"`,
    pass: Boolean(main) && main.value === PRD_STEP8_INITIAL[FLAG_KEY],
    detail: main ? `实测 ${main.value}（source=${main.source}）` : `未读到 ${FLAG_KEY} 行`,
  });
  const mismatch = rows
    ? Object.entries(PRD_STEP8_INITIAL).filter(([k, v]) => {
        const r = get(k);
        return !r || r.value !== v;
      })
    : null;
  checks.push({
    id: `步 8 ③/8 个开关初值逐字对齐 PRD §6.4-7（01-prd.md:688，含 ${Object.keys(PRD_STEP8_INITIAL).length} 键全表）`,
    pass: mismatch !== null && mismatch.length === 0,
    detail:
      mismatch === null
        ? '无读回数据'
        : mismatch.length === 0
          ? '8/8 一致'
          : mismatch
              .map(([k, v]) => `${k} 期望 "${v}" 实测 ${get(k)?.value ?? '(缺行)'}`)
              .join(' · '),
  });
  const deadlineKeys = rows
    ? rows.filter((r) => DEADLINE_KEY_RE.test(r.key)).map((r) => r.key)
    : null;
  checks.push({
    id: '步 8 ④/`passwordUpgradeDeadline` 不存在（v1.3 连同 14 天宽限期一并作废，代码与配置都不该有它）',
    pass: deadlineKeys !== null && deadlineKeys.length === 0,
    detail:
      deadlineKeys === null
        ? '无读回数据'
        : deadlineKeys.length === 0
          ? '读回键集中无 deadline 族键'
          : `复现于 ${JSON.stringify(deadlineKeys)}`,
  });
  const same = latency ? latency.same_process_ms : null;
  checks.push({
    id: `步 8 ⑤/同进程改值生效实测 ≤${FLAG_LATENCY_MAX_MS / 1000} 秒（service.set → 缓存回填 → get 读回）`,
    pass: same !== null && Number.isFinite(same) && same >= 0 && same <= FLAG_LATENCY_MAX_MS,
    detail:
      same === null
        ? '未测出（flip harness 失败）'
        : `实测 ${same} ms（预算 ${FLAG_LATENCY_MAX_MS} ms）`,
  });
  const cross = latency ? latency.cross_process_ms : null;
  checks.push({
    id: `步 8 ⑥/跨进程改值生效实测 ≤${FLAG_LATENCY_MAX_MS / 1000} 秒（读侧持 30 秒 TTL 缓存，靠到期重读看见新值）`,
    pass: cross !== null && Number.isFinite(cross) && cross >= 0 && cross <= FLAG_LATENCY_MAX_MS,
    detail:
      cross === null
        ? '未测出（watch 子进程未见新值）'
        : `实测 ${cross} ms（预算 ${FLAG_LATENCY_MAX_MS} ms · TTL 30s + 轮询 ${FLAG_POLL_MS}ms）`,
  });
  return checks;
}

/** 授权 import 面的静态自证：本文件与 harness 都不得伸手进 packages/server/src 的别处。 */
function step8ImportFaceCheck() {
  const text = fs.readFileSync(path.join(HERE, 'preflight.mjs'), 'utf8');
  // 本文件里所有 import 说明符（静态 + 动态）
  const specifiers = [
    ...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  const serverSpecifiers = specifiers.filter((s) => /packages[\\/]server|@tm\//.test(s));
  const banned = specifiers.filter((s) => /routes|trpc|admin-flags|config\.ts/.test(s));
  // harness 本体的 import 说明符：唯一指向 server 的应是运行期传入的 flagsTs（feature-flags.ts）
  const harnessSpecifiers = [
    ...STEP8_HARNESS.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...STEP8_HARNESS.matchAll(/\bimport\s*\(\s*([^)]+)\)/g),
  ].map((m) => m[1]);
  const harnessServerRefs = harnessSpecifiers.filter((s) => /packages[\\/]server|@tm\//.test(s));
  return {
    ok:
      serverSpecifiers.length === 0 &&
      banned.length === 0 &&
      harnessServerRefs.length === 0 &&
      STEP8_HARNESS.includes('assertTmpOnly') &&
      STEP8_HARNESS.includes('pathToFileURL(flagsTs)'),
    own_import_specifiers_into_server: serverSpecifiers,
    banned_specifiers: banned,
    harness_literal_refs_into_server: harnessServerRefs,
    harness_server_entry:
      'flagsTs（= services/feature-flags.ts 绝对路径，由 preflight 以 CLI 参数传入）',
    harness_tmp_guard: true,
  };
}

/**
 * 仓库内两个真库的指纹（size + mtime + sha256 前 16 位）。并发 agent 可能持有文件锁导致 sha 读不出来，
 * 那种情况下退化为 size+mtime 并在 detail 里标注，绝不把"读不动"当成"没动过"的假证据。
 */
function protectedDbFingerprints() {
  return protectedSqlitePaths().map((f) => {
    const rec = { file: f };
    try {
      const st = fs.statSync(f);
      rec.size = st.size;
      rec.mtime = st.mtime.toISOString();
    } catch (e) {
      rec.size = null;
      rec.mtime = null;
      rec.error = `stat 失败：${e instanceof Error ? e.code : String(e)}`;
      return rec;
    }
    try {
      rec.sha256_16 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(f))
        .digest('hex')
        .slice(0, 16);
    } catch (e) {
      rec.sha256_16 = null;
      rec.sha_error = `sha 读不出（多半被并发进程持锁）：${e instanceof Error ? e.code : String(e)}`;
    }
    return rec;
  });
}

function fingerprintEqual(a, b) {
  if (!a || !b) return false;
  if (a.size !== b.size || a.mtime !== b.mtime) return false;
  if (a.sha256_16 && b.sha256_16) return a.sha256_16 === b.sha256_16;
  return true; // sha 双侧任一不可读 → 只有 size+mtime 可比（detail 里已标注降级）
}

/** 实际执行步 8（只在 tmpdir 临时库上跑；真库全程不可达）。 */
async function runStep8() {
  const metricsOut = { rows: null, latency: null };
  const fpBefore = protectedDbFingerprints();
  const f8 = step8Target();
  const harnessFile = STEP8_HARNESS_FILE;
  fs.writeFileSync(harnessFile, STEP8_HARNESS, 'utf8');
  const mig = runMigrate(f8, [], { log: () => {} });
  const fpAfterEarly = protectedDbFingerprints();
  const earlyProtected = {
    before: fpBefore,
    after: fpAfterEarly,
    untouched: fpBefore.every((b, i) => fingerprintEqual(b, fpAfterEarly[i])),
  };
  if (!mig.ok) {
    note(`步 8 前置迁移失败（判据⑤ 依赖 005-feature-flags 的种入行）：${mig.reason}`);
    printMetric('step8_protected_db_untouched', earlyProtected.untouched ? 'yes' : 'no', 'sqlite');
    return {
      code: 1,
      checks: evaluateStep8(metricsOut),
      metricsMissing: [],
      targets: [f8],
      mig,
      detail: { protected: earlyProtected, error: mig.reason },
    };
  }
  const listed = runFlagChild('list', f8);
  if (listed.ok) metricsOut.rows = listed.result.rows;
  else note(`步 8 list() 失败：${listed.reason}\n${String(listed.raw).slice(-600)}`);

  const rowOf = (k) => (metricsOut.rows ? metricsOut.rows.find((r) => r.key === k) : undefined);
  const watch = startFlagWatch(f8);
  const isOnFor = metricsOut.rows ? String(rowOf(FLAG_KEY)?.value) : '';
  const toValue = isOnFor === 'off' ? 'on' : 'off';
  let flip = { ok: false, reason: 'watch 未就绪，未翻转' };
  let crossMs = null;
  let changedAt = null;
  let watchInfo = { ready: false, result: null };
  const ready = await watch.waitReady();
  watchInfo.ready = ready;
  if (ready) {
    flip = runFlagChild('flip', f8, toValue);
    const w = await watch.result();
    watchInfo.result = w;
    if (flip.ok && w.ok) {
      const writtenAt = flip.result.written_at;
      changedAt = w.result.changed_at;
      crossMs =
        Number.isFinite(writtenAt) && Number.isFinite(changedAt) ? changedAt - writtenAt : null;
    }
  } else {
    watchInfo.result = await watch.result();
    note(
      `步 8 跨进程实测未取得 watch 就绪信号：${watchInfo.result?.reason ?? 'READY 行未出现'}（同进程侧仍未测，判据⑥ 后半不成立而非_SKIP）`,
    );
  }
  metricsOut.latency = {
    same_process_ms: flip.ok ? flip.result.same_process_ms : null,
    cross_process_ms: crossMs,
  };
  const checks = evaluateStep8(metricsOut);
  const rows = metricsOut.rows || [];
  printMetric('step8_flag_rows_read_back', rows.length, 'sqlite');
  printMetric(
    'step8_passwordUpgradeEnforce_initial_value',
    rowOf(FLAG_KEY)?.value ?? '(missing)',
    'sqlite',
  );
  printMetric(
    'step8_passwordUpgradeEnforce_source',
    rowOf(FLAG_KEY)?.source ?? '(missing)',
    'sqlite',
  );
  printMetric('step8_flag_key_count', rows.length, 'sqlite');
  printMetric(
    'step8_deadline_key_present',
    rows.some((r) => DEADLINE_KEY_RE.test(r.key)) ? 'yes' : 'no',
    'sqlite',
  );
  printMetric(
    'step8_same_process_effective_ms',
    metricsOut.latency.same_process_ms ?? 'unmeasured',
    'sqlite',
  );
  printMetric(
    'step8_cross_process_effective_ms',
    metricsOut.latency.cross_process_ms ?? 'unmeasured',
    'sqlite',
  );
  const fpAfter = protectedDbFingerprints();
  const protectedProof = {
    before: fpBefore,
    after: fpAfter,
    untouched: fpBefore.every((b, i) => fingerprintEqual(b, fpAfter[i])),
    degraded_to_size_mtime_only:
      [...fpBefore, ...fpAfter].some((r) => r.sha256_16 === null) ||
      earlyProtected.untouched === false,
  };
  printMetric('step8_protected_db_untouched', protectedProof.untouched ? 'yes' : 'no', 'sqlite');
  const missing = requireMetrics(REQUIRED_STEP8_METRICS, 'sqlite');
  return {
    code: 0,
    checks,
    metricsMissing: missing.missing,
    targets: [f8],
    detail: {
      harness: harnessFile,
      flip_from: flip.ok ? flip.result.from : null,
      flip_to: toValue,
      flip_ok: flip.ok,
      flip_reason: flip.ok ? null : flip.reason,
      flip_raw_tail: flip.ok ? null : String(flip.raw ?? '').slice(-800),
      watch_saw_new_value: changedAt !== null,
      same_process_ms: metricsOut.latency.same_process_ms,
      cross_process_ms: metricsOut.latency.cross_process_ms,
      ttl_seconds_used: 30,
      poll_ms: FLAG_POLL_MS,
      budget_ms: FLAG_LATENCY_MAX_MS,
      watch_debug: {
        ready: watchInfo.ready,
        result: watchInfo.result?.result ?? null,
        reason: watchInfo.result?.reason ?? null,
        stderr_tail: watchInfo.result?.stderr ?? null,
      },
      read_back: rows.map((r) => `${r.key}=${r.value}(${r.source})`),
      protected: protectedProof,
    },
  };
}

const HELP = `preflight —— 发布前一键护栏（T-21；串起账号体检 + 步 5c 迁移核对 + 快照·恢复·回填·回滚演练 + 台账核对 + 步 6 对账基线 + 步 8 开关初值读回）

  node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json
  node scripts/release/preflight.mjs --self-test
  node scripts/release/preflight.mjs --only step5c            # 只跑某一段（step4|step5c|drill|step6|step8）
  node scripts/release/preflight.mjs --only step6             # 只跑步 6 对账基线：reconcile.mjs --mode diff-sample --n 20
  node scripts/release/preflight.mjs --only step8             # 只跑步 8：开关初值读回 + 改值 ≤60 秒生效实测
  node scripts/release/preflight.mjs --execute --i-know-this-is-prod --db <部署机副本> --tag v2.0.0 --out backups

  其余参数原样转发给 scripts/release/{account-audit,restore-drill,reconcile}.mjs（--tag/--out/--snapshot/--rollback/
  --old-image-tag/--skip-ddl-parity/--skip-pg 只给 drill）。
  T-21c-v 新装配的两处检查（判定只变严不变松，二者退出码都进门禁）：
    · 步 6 对账基线 = 真调 reconcile.mjs --mode diff-sample --n ${RECONCILE_SAMPLE_N}（判据⑦；五项 diff 任一非 0 或缺必需计数即 exit 1）
    · 步 5 台账核对 = 真调 restore-drill.mjs --manifest-check（只读零写入，台账 restore_drill 缺项 → exit 1）
  步 8 的翻转只在 os.tmpdir() 的临时库上发生（含一次 ≈30 秒的跨进程 TTL 生效实测，会占用真实时间）。
  退出码：2=安全阀/CLI 非法；1=任一子步判据不成立；0=成立（显式 SKIP 不算 PASS，见 summary.skipped）`;

/** 迁移清单真相 = `packages/server/src/db/migrations/*.ts`（除 index.ts），不硬编码、防漂移。 */
function migrationLedgerFiles() {
  const dir = path.join(REPO_ROOT, 'packages', 'server', 'src', 'db', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ts$/.test(f) && f !== 'index.ts')
    .map((f) => f.split('.ts')[0])
    .sort();
}

function pickCommon(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--only') {
      i += 1;
      continue;
    }
    if (!Object.keys(COMMON_FLAGS).includes(f)) continue;
    out.push(f);
    if (COMMON_FLAGS[f]) out.push(argv[(i += 1)]);
  }
  return out;
}

function forwardToDrill(argv) {
  return argv.filter((a, i) => a !== '--only' && argv[i - 1] !== '--only');
}

function runChild(script, argv) {
  const file = path.join(HERE, script);
  const r = spawnSync(process.execPath, [file, ...argv], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  console.log(`\n──────────── ${script}（参数：${argv.join(' ') || '(缺省)'}） ────────────`);
  process.stdout.write(`${out.trimEnd()}\n`);
  console.log(`──────────── ${script} EXIT=${r.status} ────────────`);
  if (r.error) console.log(`[FATAL] 子进程启动失败：${r.error.message}`);
  return { script, code: r.status ?? 1, out };
}

function printSelfTest() {
  console.log('preflight --self-test');
  const safety = runSafetySelfTest();
  const own = assertScriptsReadOnlySelf(OWN_FILES);
  console.log('--- 自家文件静态扫描（preflight + account-audit + restore-drill） ---');
  for (const p of own.perFile) {
    console.log(
      `  ${p.ok ? 'OK  ' : 'BAD '}${p.file}：严格命中=${p.strict_hits.length} · 带标记豁免=${p.exempt_hits.length} · 快照写点=${p.vacuum_exec_sites}/${p.expect_exec_sites}`,
    );
    for (const h of p.strict_hits.slice(0, 6)) console.log(`      × ${h.word} @L${h.line}`);
  }
  console.log('--- 迁移清单真相（步 5c 的核对基准） ---');
  console.log(`  ${migrationLedgerFiles().join(', ')}`);
  const ch = getAlertChannel();
  console.log(
    `--- 告警通道：${ch.configured ? `已配置（host=${ch.host}）` : '未配置'} → ${ch.verdict} · blocking=${ch.blocking} ---`,
  );
  console.log('--- 步 8（判据⑥）判定核 fixture：疫苗 = 能证明这道门禁真的会红 ---');
  const goodRows = Object.entries(PRD_STEP8_INITIAL).map(([k, v]) => ({
    key: k,
    value: v,
    source: 'db',
  }));
  const goodLatency = { same_process_ms: 7, cross_process_ms: 32_000 };
  const fixtures = [
    {
      name: '正例：8 键初值全对 + 同进程 7ms / 跨进程 32s',
      obs: { rows: goodRows, latency: goodLatency },
      expectRed: false,
    },
    {
      name: `反例：${FLAG_KEY} 初值被改成 "off"（PRD §6.4-7 要求 on）`,
      obs: {
        rows: goodRows.map((r) => (r.key === FLAG_KEY ? { ...r, value: 'off' } : r)),
        latency: goodLatency,
      },
      expectRed: true,
    },
    {
      name: '反例：dailyReminder 丢了 (20:30) 参数（逐字对齐口径）',
      obs: {
        rows: goodRows.map((r) => (r.key === 'dailyReminder' ? { ...r, value: 'on' } : r)),
        latency: goodLatency,
      },
      expectRed: true,
    },
    {
      name: '反例：库里复活了 passwordUpgradeDeadline 键（v1.3 作废）',
      obs: {
        rows: [...goodRows, { key: 'passwordUpgradeDeadline', value: '2026-10-01', source: 'db' }],
        latency: goodLatency,
      },
      expectRed: true,
    },
    {
      name: `反例：跨进程生效 ${FLAG_LATENCY_MAX_MS + 1000}ms（超 FLAG_EFFECTIVE_MAX_SECONDS）`,
      obs: {
        rows: goodRows,
        latency: { same_process_ms: 7, cross_process_ms: FLAG_LATENCY_MAX_MS + 1000 },
      },
      expectRed: true,
    },
    {
      name: '反例：005 迁移没跑 → list() 未出数（读回缺失）',
      obs: { rows: null, latency: { same_process_ms: null, cross_process_ms: null } },
      expectRed: true,
    },
  ];
  let fixtureOk = true;
  for (const fx of fixtures) {
    const checks = evaluateStep8(fx.obs);
    const red = checks.some((c) => !c.pass);
    const ok = red === fx.expectRed;
    fixtureOk &&= ok;
    console.log(
      `  ${ok ? 'OK  ' : 'BAD '}${fx.expectRed ? '应红' : '应绿'} · 实判 ${red ? '红' : '绿'} —— ${fx.name}`,
    );
    if (fx.expectRed) {
      console.log(
        `        → 红的门禁：${checks
          .filter((c) => !c.pass)
          .map((c) => c.id.split('/').pop())
          .join(' | ')}`,
      );
    }
  }
  // 缺项即 exit 1：空注册表喂给 requireMetrics，必须报出全部 7 项缺失
  resetRegistry();
  const emptyMissing = requireMetrics(REQUIRED_STEP8_METRICS, 'sqlite');
  const emptyExitCode = emptyMissing.ok ? 0 : 1;
  const missingOk =
    emptyExitCode === 1 && emptyMissing.missing.length === REQUIRED_STEP8_METRICS.length;
  console.log(
    `  ${missingOk ? 'OK  ' : 'BAD '}缺项门禁：空计数 → requireMetrics 报 ${emptyMissing.missing.length}/${REQUIRED_STEP8_METRICS.length} 项缺失 → exit ${emptyExitCode}`,
  );
  const face = step8ImportFaceCheck();
  console.log(
    `  ${face.ok ? 'OK  ' : 'BAD '}授权 import 面自证：本文件对 packages/server 的字面 import=${JSON.stringify(face.own_import_specifiers_into_server)} · 禁用面=${JSON.stringify(face.banned_specifiers)} · harness 服务器入口=${face.harness_server_entry}`,
  );
  /* ── 疫苗（T-21d #3）：故意造会 FAIL 的门，证明**它能把退出码翻成非 0**，而 advisory 门不翻。
     用的是同一份 `gate()` 分级表 + 同一个 `gateExitContrib()` 算式，但只喂**影子注册表**：
     `printSelfTest()` 的返回值仍只由自己的 verdict 汇出 ⇒ `--self-test` 交回依旧 exit 0（A-51 #132 跨轮硬门禁）。 */
  console.log(
    '--- 门禁 → 退出码 疫苗（同一份分级表 + 同一份算式；只喂影子注册表，不污染真退出码）---',
  );
  resetRegistry();
  const vax = {
    soft: gate(
      '疫苗 ①/未登记分级的门 → 默认 soft：失败必须把退出码翻成 1',
      false,
      '疫苗：无真实判据',
    ),
    hard: gate('疫苗 ②/红线门：失败必须把退出码翻成 2', false, '疫苗：无真实判据'),
    advisory: gate('疫苗 ③/advisory 白名单门：失败不得翻退出码', false, '疫苗：无真实判据'),
    pass: gate('疫苗 ④/通过的门：不得贡献任何红', true, '疫苗：无真实判据'),
  };
  const vaxAll = registryGates();
  const vaxOnly = (p) => vaxAll.filter((g) => g.id.startsWith(p));
  const vaxWithout = (p) => vaxAll.filter((g) => !g.id.startsWith(p));
  let vaccineOk =
    vax.soft === false && vax.hard === false && vax.advisory === false && vax.pass === true;
  for (const c of [
    { name: 'hard+soft+advisory 三条同时红', g: vaxAll, want: 2 },
    { name: '去掉 hard 门（soft+advisory 红）', g: vaxWithout('疫苗 ②'), want: 1 },
    { name: '只剩 advisory 门红（白名单）', g: vaxOnly('疫苗 ③'), want: 0 },
    { name: '只剩未登记分级的门红（默认 soft）', g: vaxOnly('疫苗 ①'), want: 1 },
    { name: '全绿（只有疫苗 ④）', g: vaxOnly('疫苗 ④'), want: 0 },
  ]) {
    const f = gateExitContrib(c.g);
    const ok = f.code === c.want;
    vaccineOk &&= ok;
    console.log(
      `  ${ok ? 'OK  ' : 'BAD '}${c.name} → 门侧贡献 exit ${f.code}（应 ${c.want}）· hard=${f.hard.length} soft=${f.soft.length} advisory=${f.advisory.length}`,
    );
  }
  const tiers = gateTierTableCheck();
  vaccineOk &&= tiers.ok;
  console.log(
    `  ${tiers.ok ? 'OK  ' : 'BAD '}分级表自证：hard=${JSON.stringify(tiers.hard)} · advisory 白名单=${JSON.stringify(tiers.advisory)} · 缺理由/非法档位=${JSON.stringify(tiers.bad)} · 重复 key=${JSON.stringify(tiers.dup)}`,
  );
  console.log('  （以上疫苗只喂影子注册表，随后即 resetRegistry()，不改本脚本的 exit 0）');
  resetRegistry();
  const verdict =
    safety.allOk && own.ok && !ch.blocking && fixtureOk && missingOk && face.ok && vaccineOk;
  console.log(`  → self-test ${verdict ? 'PASS' : 'FAIL'}`);
  return verdict ? 0 : 1;
}

async function main() {
  let args;
  try {
    args = parseReleaseArgs(process.argv.slice(2), {
      '--only': { key: 'only', value: true },
      '--tag': { key: 'tag', value: true },
      '--out': { key: 'out', value: true },
      '--snapshot': { key: 'snapshot', value: true },
      '--rollback': { key: 'rollback', value: false },
      '--old-image-tag': { key: 'oldImageTag', value: true },
      '--skip-ddl-parity': { key: 'skipDdlParity', value: false },
      '--skip-pg': { key: 'skipPg', value: false },
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
  if (args.only && !['step4', 'step5c', 'drill', 'step6', 'step8'].includes(args.only)) {
    console.error(
      `[FATAL] --only 只接受 step4 | step5c | drill | step6 | step8，收到 ${args.only}`,
    );
    process.exit(2);
  }
  const want = (seg) => !args.only || args.only === seg;

  resetRegistry();
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  setLogFile(path.join(TMP_ROOT, 'preflight.log'));
  const argv = process.argv.slice(2);
  const targets = [];
  const skipped = [];
  const children = [];
  /* inline 门一律走模块级 `gate()`（分级表 → 档位 → 退出码），此处不再另造局部助手。 */

  /* ── 步 4：a 轮账号体检 ── */
  if (want('step4')) {
    const r = runChild('account-audit.mjs', pickCommon(argv));
    children.push(r);
    gate(
      '步 4 / account-audit 退出码 0（六项计数 + 判据⑧ 无主计数出数）',
      r.code === 0,
      `EXIT=${r.code}`,
    );
  } else {
    skipped.push({ item: '步 4 账号体检', reason: `--only ${args.only}` });
  }

  /* ── 步 5c：先迁移，再起服（v1.5 新增的独立前置步） ── */
  if (want('step5c')) {
    const ledger = migrationLedgerFiles();
    const f = path.join(TMP_ROOT, 'step5c-check.db');
    const mig = runMigrate(f, []);
    const st = migrateStatus(f);
    const applied = st.ok ? st.applied : [];
    const missingFromLedger = ledger.filter((n) => !applied.includes(n));
    printMetric('step5c_migrations_in_ledger', ledger.length, 'sqlite');
    printMetric('step5c_applied', st.applied.join('|') || '(none)', 'sqlite');
    printMetric('step5c_pending', st.pending.join('|') || '(none)', 'sqlite');
    gate('步 5c ①/真实迁移路径退出码 0（`pnpm db:migrate` 的等价入口）', mig.ok, mig.reason ?? f);
    gate(
      '步 5c ②/`migrate --status` 待执行列表为空',
      st.ok && st.pending.length === 0,
      `pending=${JSON.stringify(st.pending)}`,
    );
    gate(
      `步 5c ③/清单内 ${ledger.length} 条（000~00${Math.max(ledger.length - 1, 0)}）逐条显示已应用`,
      missingFromLedger.length === 0 && st.applied.length === ledger.length,
      `已应用 ${st.applied.length}/${ledger.length}${missingFromLedger.length ? ` · 缺 ${JSON.stringify(missingFromLedger)}` : ''}`,
    );
    note(
      '步 5c ④/归档义务：本轮在 os.tmpdir() 的临时副本上取证；发布窗口须对**要上线的那份库**执行 `pnpm db:migrate` 再 `pnpm --filter @tm/server migrate -- --status`，并把三份输出（migrate / --status / _migrations 表）连同库标识与时刻归档',
    );
    note(
      '步 5c 的"起服前只读探测新列可读"由 restore-drill 的 PRAGMA table_info 三条断言承担；顺序硬约束 = 迁移完成 → 才允许启服务',
    );
    targets.push({ role: 'step5c 临时副本', instance: f, opened_at: nowStamp() });
  } else {
    skipped.push({ item: '步 5c 迁移前后核对', reason: `--only ${args.only}` });
  }

  /* ── 步 5 / 5b / 6 / 6b / 7：b 轮演练面 ── */
  let manifestChild = null;
  if (want('drill')) {
    const r = runChild('restore-drill.mjs', forwardToDrill(argv));
    children.push(r);
    gate('步 5·6·6b·7 / restore-drill 退出码 0（判据②③④⑤）', r.code === 0, `EXIT=${r.code}`);
    const m = /"dual_driver"[\s\S]*?"ok":\s*(true|false)/.exec(r.out);
    if (m && m[1] === 'false')
      skipped.push({
        item: '判据②③④⑤ 的 pg 同口径重跑',
        reason: 'restore-drill 记 dual_driver.ok=false（本机无 PG 实例）',
      });

    /* ── 步 5/7 台账核对（T-21c-v 装配，T-21c-iii 上报②）：`--manifest-check` 是**只读零写入**模式 ──
       接在演练之后跑 = "有备份无演练 → 预检即红"：核对的就是上一步刚写进产物目录台账的那条 `restore_drill` 结论。
       参数与演练子进程逐字同源（forwardToDrill 去掉 --only，其余 --out/--out-dir/--tag/--dry-run/--execute 全透传），
       未给 --tag 时补 DEFAULT_DRILL_TAG，与 restore-drill 自身的缺省 tag 同值 —— 刻意**不**留"不给 tag 就核对 0 条目 = 放过"的口子。 */
    const mcArgv = ['--manifest-check', ...forwardToDrill(argv)];
    if (!args.tag) mcArgv.push('--tag', DEFAULT_DRILL_TAG);
    manifestChild = runChild('restore-drill.mjs', mcArgv);
    children.push(manifestChild);
    gate(
      `步 5 台账核对 / restore-drill --manifest-check 退出码 0（台账 restore_drill 非 null 且结论字段齐全，缺项即 exit 1）`,
      manifestChild.code === 0,
      `EXIT=${manifestChild.code} · tag=${args.tag ?? DEFAULT_DRILL_TAG}`,
    );
    note(
      '步 5 台账核对是**只读**模式（不开源库、不产快照、零写入），故本轮不新增任何产物；pg 侧台账条目同口径要求 restore_drill，其演练本身归 T-22 CI。',
    );
  } else {
    skipped.push({ item: '步 5/5b/6/6b/7 演练面', reason: `--only ${args.only}` });
    skipped.push({
      item: '步 5 台账核对（--manifest-check，只读零写入）',
      reason: `--only ${args.only} → 与演练面同进退（无本轮台账写入可核对）`,
    });
  }

  /* ── 步 6 对账基线（T-21c-v 装配：原判据⑦ 从 SKIP 改为真调 reconcile.mjs，T-21c-i 的 U-5/L-1） ── */
  let reconcileChild = null;
  if (want('step6')) {
    reconcileChild = runChild('reconcile.mjs', [
      ...pickCommon(argv),
      '--mode',
      'diff-sample',
      '--n',
      String(RECONCILE_SAMPLE_N),
    ]);
    children.push(reconcileChild);
    gate(
      `步 6 对账基线 / reconcile --mode diff-sample --n ${RECONCILE_SAMPLE_N} 退出码 0（判据⑦：五项 diff 全 0 + N/M/K/P/Q 口径位齐，缺项即 exit 1）`,
      reconcileChild.code === 0,
      `EXIT=${reconcileChild.code}`,
    );
    note(
      `步 6 对账的本地口径：未给 --db 时 reconcile 在 os.tmpdir() 自建临时库（真实迁移路径 + 本地样例造数）出数，` +
        '它只证明**脚本有判定力**；判据⑦ 的"≥20 真实账号 diff=0"是**线上口径，未实测，待 Phase 7 向用户索取只读访问**。' +
        '本地样例条数禁入公告 / 清单报告 / 验收材料。',
    );
  } else {
    skipped.push({
      item: `步 6 对账基线（5 项 × ${RECONCILE_SAMPLE_N} 采样，两路径互校 diff=0）`,
      reason: `--only ${args.only}`,
    });
  }

  /* ── 步 8：开关初值读回 + 改值 ≤60 秒生效实测（T-21c-iv，判据⑥） ── */
  let step8 = null;
  if (want('step8')) {
    console.log(
      '\n──────────── 步 8 · 开关初值读回（真值源 services/feature-flags.ts） ────────────',
    );
    step8 = await runStep8();
    targets.push({
      role: '步 8 开关临时库（唯一可翻转对象）',
      instance: step8.targets[0],
      opened_at: nowStamp(),
    });
    for (const c of step8.checks) gate(c.id, c.pass, c.detail);
    gate(
      '步 8 ⑦/必需计数项齐备（缺任一项即 exit 1，沿用 REQUIRED_METRICS 模式）',
      (step8.metricsMissing?.length ?? 0) === 0,
      (step8.metricsMissing?.length ?? 0) === 0
        ? `${REQUIRED_STEP8_METRICS.length} 项全出`
        : `缺 ${JSON.stringify(step8.metricsMissing)}`,
    );
    gate(
      '步 8 ⑧/仓库两个 data.db 步 8 前后指纹一致（真库零写入，翻转只发生在 tmpdir 临时库）',
      Boolean(step8.detail?.protected?.untouched),
      step8.detail?.protected
        ? `untouched=${step8.detail.protected.untouched} · 降级为 size+mtime=${step8.detail.protected.degraded_to_size_mtime_only} · ${JSON.stringify(step8.detail.protected.after)}`
        : '未取到指纹',
    );
    note(
      '步 8 判据⑥ 的"≤60 秒生效"取的是**脚本面达成**：翻转与读回都发生在 os.tmpdir() 的临时库上，跨进程一侧是真的 30 秒 TTL 到期路径。生产实例（经 `POST /api/admin/flags` 写口改值 → 服务端进程内缓存失效）未实测，待 Phase 7 向用户索取只读访问后补真机数据。',
    );
    note(
      '本步不 import `routes/admin-flags.ts`（写口）也不改 `config.ts`：读回与写入都走 `services/feature-flags.ts` 自己的 `list()/set()`；`--self-test` 的"授权 import 面自证"钉这条线。',
    );
    console.log(`[STEP8] ${JSON.stringify(step8.detail)}`);
  } else {
    skipped.push({ item: '步 8 开关初值读回 + 生效延迟实测', reason: `--only ${args.only}` });
  }

  /* ── 明确不实现的项（真机 / 人工签字 / 线上口径） ── */
  for (const s of [
    {
      item: '步 6 对账基线的**线上 ≥20 真实账号**口径（判据⑦ 的取证对象是线上库，不是本地样例库）',
      owner: 'Phase 7 向用户索取线上生产库只读访问后真跑（脚本面已挂载并出数）',
    },
    {
      item: '步 8 判据⑥ 的**真机侧**：线上实例改值 → 服务端进程 ≤60 秒生效（本机无可写生产开关面）',
      owner: 'Phase 7 向用户索取只读访问后补测（脚本面达成部分已在步 8 出数）',
    },
    { item: '步 1 / 2 / 3 / 9~15', owner: '不在 T-21 面（CI、真机、人工签字项见 §6.4-2b）' },
  ])
    skipped.push(s);

  const ch = getAlertChannel();
  gate(
    '步 5b(A)/告警通道状态行（未配置 = 降级 + 标红，绝不阻塞）',
    !ch.blocking,
    ch.configured ? `已配置（host=${ch.host}）` : ch.red_flag,
  );
  if (!ch.configured) console.log(`[RED-FLAG] ${ch.red_flag}`);

  /* ── 退出码 = 子进程最坏值 ⊕ inline 门禁最坏值（T-21d：报红即拦人）──
     hard：任一子脚本 exit 2，或任一 **hard 档红线门** 失败 → exit 2；
     soft：任一子脚本非 0，或步 8 判定核任一条不成立，或任一 **soft 档门** 失败 → exit 1；
     advisory：只有登记过理由的白名单门可以"报红不拦人"，其失败只打印不改退出码。 */
  const gateFacts = gateExitContrib(registryGates());
  const childHardBad = children.some((c) => c.code === 2);
  const hardBad = childHardBad || gateFacts.hard.length > 0;
  const step8Ran = step8 !== null;
  const step8Bad =
    step8Ran &&
    (step8.checks.some((c) => !c.pass) ||
      (step8.metricsMissing?.length ?? 0) > 0 ||
      step8.code !== 0 ||
      !step8.detail?.protected?.untouched);
  const childSoftBad = children.some((c) => c.code !== 0);
  const softBad = childSoftBad || step8Bad || gateFacts.soft.length > 0;
  const exitCode = hardBad ? 2 : softBad ? 1 : 0;
  console.log('\n===== 门禁 → 退出码归因（T-21d）=====');
  const showFailing = (label, list, effect) => {
    console.log(`  ${label}：${list.length} 条${list.length ? ` → ${effect}` : '（无）'}`);
    for (const g of list)
      console.log(`      × [${g.level}] ${g.id}${g.detail ? ` :: ${g.detail}` : ''}`);
  };
  showFailing('hard 档红线门失败', gateFacts.hard, '贡献 exit 2');
  showFailing('soft 档门失败', gateFacts.soft, '贡献 exit 1');
  showFailing('advisory 白名单门失败', gateFacts.advisory, '只标红，不进退出码');
  console.log(
    `  门禁侧共 ${gateFacts.total} 条（红 ${gateFacts.failed.length}）→ 贡献 ${gateFacts.code} · ` +
      `子进程侧 hard=${childHardBad} soft=${childSoftBad} · 步 8 判定核 bad=${Boolean(step8Bad)} · 最终 exit ${exitCode}`,
  );
  console.log('\n===== §6.4-2 清单（T-21 可机器化步）· 状态汇总 =====');
  const checklist = [
    [
      '步 4',
      '线上账号体检 + 判据⑧ 只读计数',
      children.find((c) => c.script === 'account-audit.mjs'),
    ],
    ['步 5c', '先迁移再起服（清单读回）', undefined],
    [
      '步 5',
      '快照 + size>0 + sha256 + manifest',
      children.find((c) => c.script === 'restore-drill.mjs'),
    ],
    [
      '步 5b',
      '失败可见性降级 + 发布前强制读回',
      children.find((c) => c.script === 'restore-drill.mjs'),
    ],
    ['步 5', '台账 restore_drill 核对（--manifest-check）', manifestChild ?? undefined],
    ['步 6', '恢复到临时实例 + 指纹一致', children.find((c) => c.script === 'restore-drill.mjs')],
    ['步 6', `对账基线 5 项 × ${RECONCILE_SAMPLE_N} 采样 diff=0`, reconcileChild ?? undefined],
    [
      '步 6b',
      '三条 ADD COLUMN + 零回填断言',
      children.find((c) => c.script === 'restore-drill.mjs'),
    ],
    [
      '步 7',
      '旧镜像连新 schema + (a)(b)(c)(d)',
      children.find((c) => c.script === 'restore-drill.mjs'),
    ],
    ['步 8', '开关初值读回 + 改值 ≤60 秒生效实测', undefined],
  ];
  /* 逐档归因：步 5c / 步 8 的展示码也改成"由自己那几条门的档位汇出"，不再借全局 exitCode 猜。 */
  const step5cFacts = gateExitContrib(
    registryGates().filter((g) => g.id.startsWith('步 5c')),
  );
  const step8Facts = gateExitContrib(registryGates().filter((g) => g.id.startsWith('步 8')));
  for (const [step, what, child] of checklist) {
    let code;
    if (step === '步 5c') code = !want('step5c') ? undefined : step5cFacts.code;
    else if (step === '步 8')
      code = !step8Ran ? undefined : step8Bad ? step8Facts.code || 1 : 0;
    else code = child?.code;
    console.log(
      `  ${step.padEnd(5)} ${what.padEnd(34, ' ')} ${code === undefined ? 'SKIP' : code === 0 ? 'PASS' : `EXIT=${code}`}`,
    );
  }
  console.log(
    '  未做  步 6 对账基线的线上口径（≥20 真实账号）    未实测，待 Phase 7 向用户索取只读访问（脚本面已真调，见上）',
  );
  console.log(
    '  未做  步 5/6/7 的 pg 侧台账与演练                本机无实例 → 显式 SKIP，归 T-22 CI（不算 PASS）',
  );
  console.log(
    `  待补  步 8 判据⑥ 的真机侧（线上实例改值生效）      未实测，待 Phase 7 向用户索取只读访问`,
  );

  emitSummary({
    task: 'T-21/T-21b/T-21c-iv·v preflight（含步 6 对账基线 + 步 5 台账核对）',
    verdict: exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode,
    targets,
    extra: {
      children: children.map((c) => ({ script: c.script, exit_code: c.code })),
      gate_exit: {
        contributed_code: gateFacts.code,
        total_gates: gateFacts.total,
        hard_failing: gateFacts.hard.map((g) => g.id),
        soft_failing: gateFacts.soft.map((g) => g.id),
        advisory_failing_not_blocking: gateFacts.advisory.map((g) => g.id),
        rule: 'hard 红 或 子脚本 exit 2 → 2；soft 红 或 子脚本非 0 或 步 8 判定核红 → 1；advisory 红只标红',
      },
      reconcile: {
        script: 'reconcile.mjs',
        mode: 'diff-sample',
        n: RECONCILE_SAMPLE_N,
        ran: reconcileChild !== null,
        exit_code: reconcileChild?.code ?? null,
        local_sample_only: true,
        online_n20_real_accounts_diff_zero: '未实测，待 Phase 7 向用户索取线上生产库只读访问',
      },
      manifest_check: {
        script: 'restore-drill.mjs',
        mode: '--manifest-check（只读，零写入）',
        ran: manifestChild !== null,
        exit_code: manifestChild?.code ?? null,
        tag: args.tag ?? DEFAULT_DRILL_TAG,
      },
      dual_driver: {
        ok: false,
        note: 'pg 侧本机无实例 → 显式 SKIP（CI 必须带 DATABASE_URL_TEST 真跑）',
      },
      alerts: { configured: ch.configured, blocking: false, degraded: !ch.configured },
      step8: step8Ran
        ? {
            ran: true,
            checks: step8.checks,
            metrics_missing: step8.metricsMissing,
            bad: step8Bad,
            detail: step8.detail,
            verdict_6_init_assert: step8.checks.slice(0, 4).every((c) => c.pass)
              ? '达成（临时库真读回，逐字对齐 PRD §6.4-7）'
              : '不成立',
            verdict_6_effective_within_60s:
              step8.detail?.same_process_ms !== null && step8.detail?.cross_process_ms !== null
                ? step8Bad
                  ? '不成立（实测超预算或子进程失败）'
                  : '脚本面达成（同进程 + 跨进程 30 秒 TTL 双路径实测）· 真机待 Phase 7'
                : '未实测（子进程未出数）',
          }
        : { ran: false, reason: `--only ${args.only}` },
      skipped,
      dry_run: args.dryRun,
      fixture: args.fixture ?? DEFAULT_FIXTURE,
      not_implemented_here: [
        'packages/server/test/release/backup.spec.ts（已于 c-ii/c-vi 交付，属测试面，不由本脚本承载）',
      ],
      implemented_by_this_round: [
        '判据⑦（步 6 对账基线）：由 SKIP 改为真调 reconcile.mjs --mode diff-sample --n 20',
        '步 5/7 台账核对：真调 restore-drill.mjs --manifest-check（只读零写入）',
        'tsxCliPath() 上收进 lib.mjs（A-49 #111），本文件改为 import',
      ],
    },
  });
  cleanupTmpRoot();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`[FATAL] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
