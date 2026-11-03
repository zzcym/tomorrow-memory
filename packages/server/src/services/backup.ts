/**
 * 备份 / 快照 / 失败可见性（PRD §6.4-2 步 5 + 步 5b、R-24 ③⑩；T-21 第 2 轮 b 交付）
 *
 * 本文件有两类出口，语义完全不同，混用会踩红线：
 *   · **每日例行备份** `scheduleBackup()` —— 沿用原行为（启动 5 分钟后一次、之后每 24 小时），PG 走 `pg_dump -Fc`；
 *       正文在 `runDailyBackupOnce()`（可注入 `runDump`/`alert`，N-2），`scheduleBackup()` 只装定时器；
 *   · **发布窗口快照** `preReleaseSnapshot()` —— 步 5 的强制产物：
 *       SQLite `VACUUM INTO 'backups/pre-release-<tag>.db'`（源库**一字不动**，只读连接即可跑）
 *       / PG `pg_dump -Fc` → `pre-release-<tag>.dump`；size>0 与 sha256 由调用方写进 `backups/manifest.json`
 *       （manifest 的写入归 `scripts/release/restore-drill.mjs`，本文件不碰 manifest）。
 *
 * ★ 失败必须可感知（R-24 ② "备份静默失败" 是 F-6 定案的原始缺陷）：
 *   每个失败分支都会 ① 返回 `{ok:false, reason, action}`（绝不返回 undefined 假装没事）、
 *   ② 打 `[BACKUP][RED]` 日志、③ 经告警通道出站。
 * ★ 成功**不发通知**（步 5b ③ 的阻断条件就是"正常备份也发通知"）：
 *   通知调用点在结构上只存在于失败分支，成功分支没有任何路径能到达 `sendFailureAlert`。
 * ★ 通道未配置 = 降级为日志 + 标红，**绝不报错、绝不阻塞**（R-24 ⑩ / §6.4-7 硬约束）：
 *   `describeAlertChannel()` 永不抛，`notifyBackupFailure()` 吞掉一切异常。
 *
 * ℂ 与 `scripts/release/lib.mjs` 的关系：`getAlertChannel()` / `sendFailureAlert()` 的 TS 等价实现
 *   在本文件里（逐条对齐语义）。不 import `.mjs` 的理由：`scripts/**` 不在 @tm/server 的 tsconfig
 *   include 与 depcruise 边界内，跨过去会弄红 typecheck / depcruise，而这里是**服务端运行时**代码。
 *
 * 写入面纪律（§10.2 T-21 行"全程只读 + 只写 `backups/`"）：
 *   产物目录必须显式叫 `backups` 或落在 `os.tmpdir()` 内，否则拒绝写。源库永远只读。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';

/* ════════════════════════ pg_dump 定位（原行为保留） ════════════════════════ */

export function findPgDump(config: AppConfig): string {
  if (process.env.PGDUMP_BIN) return process.env.PGDUMP_BIN;
  const localBin = path.join(
    config.dataDir,
    'pgsql',
    'bin',
    process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
  );
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
}

/* ════════════════════════ 告警通道（lib.mjs getAlertChannel 的等价实现） ════════════════════════ */

export interface AlertChannel {
  configured: boolean;
  /** 恒为 false：未配置**不得**报错或阻塞发布（R-24 ⑩）。 */
  blocking: false;
  verdict: string;
  /** 未配置时的标红文案（进日志与 preflight 报告）。 */
  red_flag?: string;
  /** 只出 host，绝不出完整 URL —— 地址可能携带密钥（步 5b ⑤）。 */
  host?: string;
}

export function describeAlertChannel(env: NodeJS.ProcessEnv = process.env): AlertChannel {
  const raw = String(env.ALERT_WEBHOOK_URL ?? '').trim();
  if (!raw) {
    return {
      configured: false,
      blocking: false,
      verdict: 'PASS（降级）',
      red_flag: '告警通道未配置，本期依赖发布前强制读回（步 5b (B)）',
    };
  }
  let host = '(不可解析)';
  try {
    host = new URL(raw).host;
  } catch {
    /* 解析不了只影响展示，不抛 */
  }
  return { configured: true, blocking: false, verdict: '已配置', host };
}

export interface AlertOutcome {
  sent: boolean;
  reason?: string;
  http_status?: number;
}

/** 只出站；任何异常都被吞成 `{sent:false}` —— 这条通道永不拖挂备份任务（步 5b ②）。 */
export async function notifyViaChannel(
  channel: AlertChannel,
  payload: Record<string, unknown>,
): Promise<AlertOutcome> {
  if (!channel.configured) {
    return {
      sent: false,
      reason: 'ALERT_WEBHOOK_URL 未配置 → 降级为写日志（不报错、不阻塞）',
    };
  }
  try {
    const res = await fetch(String(process.env.ALERT_WEBHOOK_URL ?? ''), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return { sent: res.ok, http_status: res.status, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { sent: false, reason: `发送失败已吞错：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 步 5b (A)① 要求的四要素：库名 / 时间（含时区）/ 失败原因（人话一条）/ 建议动作。 */
export interface BackupAlertPayload {
  database: string;
  at: string;
  reason: string;
  action: string;
}

/* ════════════════════════ 快照产物目录纪律 ════════════════════════ */

/**
 * 产物只准落在 ①名为 `backups` 的目录（含其子目录）或 ②`os.tmpdir()` 之下。
 * 其余一律拒绝 —— 这是"脚本只写 backups/"这条硬判据在服务端侧的等价闸门。
 */
export function assertSnapshotOutDir(outDir: string): { ok: boolean; target: string; reason?: string } {
  const target = path.resolve(outDir);
  const tmp = path.resolve(os.tmpdir());
  const inside = target === tmp || target.startsWith(tmp + path.sep);
  const named = path.basename(target) === 'backups';
  if (inside || named) return { ok: true, target };
  return {
    ok: false,
    target,
    reason: `拒绝写入：快照产物目录必须是 backups/ 或 os.tmpdir() 下的目录，收到 ${target}`,
  };
}

/** 产物名：`pre-release-<tag>.db` / `.dump`（tag 里的路径分隔符与空格一律压掉，防目录穿越）。 */
export function snapshotFileName(kind: 'sqlite' | 'pg', tag: string): string {
  const safe = String(tag || 'untagged').trim().replace(/[^0-9A-Za-z._-]/g, '-');
  return `pre-release-${kind === 'sqlite' ? `${safe}.db` : `${safe}.dump`}`;
}

export function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/* ════════════════════════ 步 5：发布窗口快照 ════════════════════════ */

export interface SnapshotRequest {
  kind: 'sqlite' | 'pg';
  tag: string;
  outDir: string;
  /** sqlite：源库文件（只读打开，绝不动它）。 */
  sqlitePath?: string;
  /** pg：连接串。 */
  databaseUrl?: string;
  pgDumpBin?: string;
  /** 注入点（测试用）：不传则真发 HTTP。 */
  alert?: AlertChannel;
}

export interface SnapshotResult {
  ok: boolean;
  kind: 'sqlite' | 'pg';
  file: string | null;
  size_bytes: number;
  sha256: string | null;
  /** 失败原因，一条人话（不是堆栈）。 */
  reason: string | null;
  /** 建议动作（告警四要素之一）。 */
  action: string | null;
  /** 库实例自证：绝对路径 或 `pg://host/db`（脱敏）。 */
  instance: string;
  started_at: string;
  finished_at: string;
  /** 只有失败分支可能为 true（成功不发通知）。 */
  notified: boolean;
  alert: AlertOutcome | null;
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function finalizeFailure(
  req: SnapshotRequest,
  startedAt: string,
  reason: string,
  action: string,
  instance: string,
): Promise<SnapshotResult> {
  const channel = req.alert ?? describeAlertChannel();
  const payload: Record<string, unknown> = {
    database: instance,
    at: startedAt,
    reason,
    action,
    kind: req.kind,
    tag: req.tag,
  };
  console.error(`[BACKUP][RED] ${instance} 快照失败：${reason}｜建议动作：${action}`);
  if (!channel.configured) {
    console.error(
      `[BACKUP][RED] ${channel.red_flag ?? ''}（告警通道未配置 = 降级为日志，不报错、不阻塞发布）`,
    );
  }
  const alert = await notifyViaChannel(channel, payload);
  if (!alert.sent) console.error(`[BACKUP][RED] 告警未出站（${alert.reason}）→ 已降级为上面的日志行`);
  return {
    ok: false,
    kind: req.kind,
    file: null,
    size_bytes: 0,
    sha256: null,
    reason,
    action,
    instance,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    notified: Boolean(alert.sent),
    alert,
  };
}

/**
 * 步 5 的快照产物。失败不抛（返回结构化 `{ok:false}` + 出站告警）——
 * 调用方（preflight / 发布脚本）**必须**读 `.ok`：判据"备份失败或产物缺失 → 阻断"由它落地。
 */
export async function preReleaseSnapshot(req: SnapshotRequest): Promise<SnapshotResult> {
  const startedAt = new Date().toISOString();
  const dir = assertSnapshotOutDir(req.outDir);
  const file = path.join(dir.target, snapshotFileName(req.kind, req.tag));
  const instance = req.kind === 'sqlite' ? path.resolve(req.sqlitePath ?? '') : redactUrl(req.databaseUrl);

  if (!dir.ok) {
    return finalizeFailure(req, startedAt, dir.reason ?? '产物目录不合规', '改用 backups/ 或临时目录后重跑步 5', instance);
  }
  try {
    fs.mkdirSync(dir.target, { recursive: true });
    if (req.kind === 'sqlite') {
      const src = path.resolve(req.sqlitePath ?? fail('sqlite 快照缺少 sqlitePath'));
      if (!fs.existsSync(src)) {
        return finalizeFailure(req, startedAt, `源库文件不存在：${src}`, '核对 SQLITE_PATH / 步 5 只读副本路径', instance);
      }
      // VACUUM INTO 要求目标不存在：上一轮同名产物先清掉（只清自己的产物文件，不碰源库）
      fs.rmSync(file, { force: true });
      const db = new Database(src, { readonly: true, fileMustExist: true });
      try {
        db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      } finally {
        db.close();
      }
    } else {
      const dump = await runPgDump(req, file);
      if (!dump.ok) {
        return finalizeFailure(req, startedAt, dump.reason, '检查 pg_dump 可用性与 DATABASE_URL（可设 PGDUMP_BIN）', instance);
      }
    }
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size <= 0) {
      return finalizeFailure(req, startedAt, `快照产物为空（0 字节）：${file}`, '重跑步 5；仍为 0 则改用备援导出方式', instance);
    }
    const sha256 = sha256File(file);
    console.log(`[BACKUP] ${req.kind} 快照已产出 ${file}（size=${size} sha256=${sha256.slice(0, 16)}…）`);
    return {
      ok: true,
      kind: req.kind,
      file,
      size_bytes: size,
      sha256,
      reason: null,
      action: null,
      instance,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      notified: false, // 成功不发通知（步 5b ③）：本行是唯一写点，结构上不可能变 true
      alert: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return finalizeFailure(req, startedAt, `快照异常：${msg}`, '看日志确认是权限/磁盘/锁，修好后重跑步 5', instance);
  }
}

function redactUrl(u?: string): string {
  const s = String(u ?? '');
  if (!s) return 'pg://(未设置 DATABASE_URL)';
  try {
    const x = new URL(s);
    return `pg://${x.host}${x.pathname}`;
  } catch {
    return 'pg://(不可解析)';
  }
}

function runPgDump(req: SnapshotRequest, file: string): Promise<{ ok: boolean; reason: string }> {
  const url = String(req.databaseUrl ?? '').trim();
  if (!url) return Promise.resolve({ ok: false, reason: 'pg 快照缺少 DATABASE_URL' });
  return new Promise((resolve) => {
    execFile(
      req.pgDumpBin ?? 'pg_dump',
      [`--dbname=${url}`, '--format=custom', '--no-password', `--file=${file}`],
      (err) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          return resolve({
            ok: false,
            reason: code === 'ENOENT' ? '找不到 pg_dump（装 postgresql-client 或设 PGDUMP_BIN）' : `pg_dump 失败：${err.message}`,
          });
        }
        resolve({ ok: true, reason: '' });
      },
    );
  });
}

/* ════════════════════════ 每日例行备份（原行为 + 失败可见性） ════════════════════════ */

export interface DailyBackupDeps {
  /** 注入点（测试用）：默认走真 `execFile(pg_dump, args)`；注入后不碰任何外部进程。 */
  runDump?: (bin: string, args: string[]) => Promise<void>;
  /** 注入点（测试用）：不传则 `describeAlertChannel()`（真读 `process.env`）。 */
  alert?: AlertChannel;
}

export interface DailyBackupResult {
  ok: boolean;
  /** 本次产物路径；失败为 null。 */
  file: string | null;
  reason: string | null;
  action: string | null;
  /** 只有失败分支可能为 true（成功不发通知，步 5b③）。 */
  notified: boolean;
  alert: AlertOutcome | null;
}

/** 默认 dump 执行体：错误原样带 `code` 抛出，由下面的失败分支分类（ENOENT ≠ 一般失败）。 */
function execPgDump(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * 一次例行 PG 备份 —— 原 `scheduleBackup()` 内联体逐行等价搬来（A-47 #105 / N-2 要求的可注入面）。
 * 失败不抛：返回结构化 `{ok:false, reason, action}` + 打 `[BACKUP][RED]` 日志 + 告警四要素出站（R-24②⑩）；
 * 成功**不发通知**（步 5b③）：`notifyViaChannel` 的调用点在结构上只存在于失败分支。
 * 产物固定 `<dataDir>/backups/pg-<YYYY-MM-DD>.dump`，超出 30 份裁最旧的（与搬出前同一正则、同一排序）。
 */
export async function runDailyBackupOnce(
  config: AppConfig,
  databaseUrl: string,
  now: Date = new Date(),
  deps: DailyBackupDeps = {},
): Promise<DailyBackupResult> {
  const backupDir = path.join(config.dataDir, 'backups');
  const channel = deps.alert ?? describeAlertChannel();
  const stamp =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0');
  const backupPath = path.join(backupDir, `pg-${stamp}.dump`);
  const args = [`--dbname=${databaseUrl}`, '--format=custom', '--no-password', `--file=${backupPath}`];
  // 失败分类用：目录建不出来 ≠ pg_dump 失败，文案必须分开（搬出前这条路径是未捕获异常 = 进程崩）。
  let stage: 'mkdir' | 'dump' = 'mkdir';
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    stage = 'dump';
    await (deps.runDump ?? execPgDump)(findPgDump(config), args);
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^pg-\d{4}-\d{2}-\d{2}\.dump$/.test(f))
      .sort();
    while (files.length > 30) {
      const doomed = files.shift();
      if (doomed) fs.unlinkSync(path.join(backupDir, doomed));
    }
    console.log('[BACKUP] PostgreSQL 已备份到', backupPath);
    return { ok: true, file: backupPath, reason: null, action: null, notified: false, alert: null };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const msg = e instanceof Error ? e.message : String(e);
    const reason =
      stage === 'mkdir'
        ? `备份目录不可写：${backupDir}（${msg}）`
        : code === 'ENOENT'
          ? '找不到 pg_dump，跳过备份。请安装 postgresql-client 或设置 PGDUMP_BIN'
          : `备份失败：${msg}`;
    const action =
      stage === 'mkdir'
        ? '核对 dataDir 权限/磁盘容量，修好后等下一个周期（无需重启服务）'
        : code === 'ENOENT'
          ? '安装 postgresql-client 或设置 PGDUMP_BIN 后等下一个周期'
          : '确认 PG 可用；连续失败需人工介入';
    console.error(`[BACKUP][RED] ${reason}`);
    const alert = await notifyViaChannel(channel, {
      database: redactUrl(databaseUrl),
      at: now.toISOString(),
      reason,
      action,
      kind: 'daily-pg-dump',
    });
    if (!alert.sent) console.error(`[BACKUP][RED] 告警未出站（${alert.reason}）→ 已降级为日志`);
    return { ok: false, file: null, reason, action, notified: Boolean(alert.sent), alert };
  }
}

export function scheduleBackup(config: AppConfig, databaseUrl: string): void {
  function backup(): void {
    void runDailyBackupOnce(config, databaseUrl, new Date());
  }

  setTimeout(() => {
    backup();
    setInterval(backup, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
}
