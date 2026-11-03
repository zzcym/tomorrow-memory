/**
 * T-21c-ii · `packages/server/src/services/backup.ts` 的双分支覆盖（U-2 补口）
 *
 * 钉的是 T-21 判据② 的**服务端侧**两条硬约束（技术设计 §6.4-2 步 5 / 步 5b、R-24 ②⑩）：
 *   · 判据② ：SQLite 快照走 `VACUUM INTO` 产出 `pre-release-<tag>.db`，**size>0 + sha256** 可复核；
 *   · 步 5b ③：**成功备份不发通知**（防噪音）—— 断言 `notified === false`，
 *              且**即便告警通道已配置**，成功分支的真实出站请求数也是 0（局部 HTTP 收件箱自证）；
 *   · R-24 ②：失败必须可感知 —— 返回结构化 `{ok:false, reason, action}`（绝不 undefined）、
 *              打 `[BACKUP][RED]` 日志、经告警通道出站（`notified === true`）；
 *   · R-24 ⑩：`ALERT_WEBHOOK_URL` **未配置 = 降级为日志，不抛错、不阻塞**（本仓既有裁决）。
 *
 * ⚠ 命名对账：任务书/U-2 里写的 `createBackup()` 在 `backup.ts` 中**不存在**。
 *   该文件的两类真实出口是 `preReleaseSnapshot()`（步 5 快照产物，本轮主覆盖对象）与
 *   `scheduleBackup()`（每日 PG 例行备份，靠 `setTimeout` 起轮、真打 `pg_dump`，不在本轮断言面内）。
 *   本文件按**真实导出**写用例，不改实现（见报告 §5 上报项 N-1）。
 *
 * 数据红线：全程只在 `os.tmpdir()` 下建临时库与临时产物目录；仓库内 `data.db`（根 + `packages/server/`）
 * 一字未开、未读未写；`backup.ts` 侧的"产物目录闸门拒绝写入"用例只断言目录**未被创建**，
 * 不向 `backups/` 以外的任何仓库内路径落盘。不建任何迁移。
 *
 * 夹具风格照抄 `test/integration/assessment-isolation.spec.ts`（T-25）：tmpdir + pid 隔离 +
 * `better-sqlite3` 直连 + `afterAll` 清理；pg/真 `pg_dump` 面本轮不接（`runPgDump` 需 postgresql-client）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  assertSnapshotOutDir,
  describeAlertChannel,
  notifyViaChannel,
  preReleaseSnapshot,
  runDailyBackupOnce,
  sha256File,
  snapshotFileName,
  type AlertChannel,
  type SnapshotResult,
} from '../../src/services/backup.js';
import type { AppConfig } from '../../src/config.js';

/* ════════════════════════ 临时库 / 临时产物目录夹具 ════════════════════════ */

const tmpDir = path.join(os.tmpdir(), `tm-t21c-ii-backup-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const outDir = (): string => path.join(tmpDir, 'out');

/** 源库（快照的被读方）：自建一张小表，夹具即可，不跑任何迁移。 */
const SOURCE_DB = 'source.db';
const WORDS = ['apple', 'banana', 'cherry', 'durian', 'echo'];

function makeSourceDb(name = SOURCE_DB): string {
  const file = tmpFile(name);
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec('CREATE TABLE widget (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const ins = db.prepare('INSERT INTO widget (name) VALUES (?)');
  for (const w of WORDS) ins.run(w);
  db.close();
  return file;
}

/** 造一个"普通文件当目录父路径"的死路：跨平台稳定地让 `mkdirSync` / 写产物失败（比 chmod 可靠）。 */
function blockerPath(): string {
  const blocker = tmpFile('blocker-is-a-file');
  fs.writeFileSync(blocker, 'not a directory');
  return blocker;
}

interface FingerPrint {
  size: number;
  mtimeMs: number;
  sha256: string;
}

function fingerprint(file: string): FingerPrint {
  const st = fs.statSync(file);
  return { size: st.size, mtimeMs: st.mtimeMs, sha256: sha256File(file) };
}

/* ════════════════════════ 告警通道：本地 HTTP 收件箱 ════════════════════════ */
/**
 * `notified === true` 的**唯一**成立条件是"通道已配置且 HTTP 真的 2xx"（`backup.ts:208-221`），
 * 所以失败分支要钉住 `notified===true`，就必须真起一个收件端；成功分支要用同一个端点反证"零出站"。
 */
let inbox: http.Server | null = null;
let webhookUrl = '';
const received: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  fs.mkdirSync(outDir(), { recursive: true });
  inbox = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += String(c);
    });
    req.on('end', () => {
      try {
        received.push(JSON.parse(body) as Record<string, unknown>);
      } catch {
        received.push({ unparsed: body });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => inbox?.listen(0, '127.0.0.1', resolve));
  webhookUrl = `http://127.0.0.1:${(inbox.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  if (inbox) await new Promise<void>((resolve) => inbox?.close(() => resolve()));
  inbox = null;
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const originalWebhook = process.env.ALERT_WEBHOOK_URL;
afterEach(() => {
  if (originalWebhook === undefined) delete process.env.ALERT_WEBHOOK_URL;
  else process.env.ALERT_WEBHOOK_URL = originalWebhook;
  received.length = 0;
});

const configured = (): void => {
  process.env.ALERT_WEBHOOK_URL = webhookUrl;
};
const unconfigured = (): void => {
  delete process.env.ALERT_WEBHOOK_URL;
};

/** 等一拍：`finalizeFailure` 里告警是 await 的，但 HTTP 收包回调可能晚一个 tick。 */
const settle = async (ms = 60): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ════════════════════════ 成功分支 ════════════════════════ */

describe('backup.ts · 成功分支（判据② VACUUM INTO 产物）', () => {
  let result: SnapshotResult;
  const source = tmpFile(SOURCE_DB);

  beforeAll(async () => {
    makeSourceDb();
    unconfigured();
    result = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'v2.0.0-t21c-ii',
      outDir: outDir(),
      sqlitePath: source,
    });
  });

  it('产物存在、size > 0，且 size 与磁盘实测一致', () => {
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.action).toBeNull();
    expect(result.file).toBeTruthy();
    expect(fs.existsSync(result.file!)).toBe(true);
    expect(result.size_bytes).toBeGreaterThan(0);
    expect(result.size_bytes).toBe(fs.statSync(result.file!).size);
    expect(path.basename(result.file!)).toBe('pre-release-v2.0.0-t21c-ii.db');
    expect(result.kind).toBe('sqlite');
  });

  it('sha256 可复核：实现回显值 == 独立重算值 == 64 位小写十六进制', () => {
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    const independent = crypto
      .createHash('sha256')
      .update(fs.readFileSync(result.file!))
      .digest('hex');
    expect(result.sha256).toBe(independent);
    expect(result.sha256).toBe(sha256File(result.file!));
  });

  it('sha256 稳定：同一源库连跑两次（不同 tag）产物哈希逐字节一致', async () => {
    const a = await preReleaseSnapshot({ kind: 'sqlite', tag: 'twice-a', outDir: outDir(), sqlitePath: source });
    const b = await preReleaseSnapshot({ kind: 'sqlite', tag: 'twice-b', outDir: outDir(), sqlitePath: source });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toBe(result.sha256);
  });

  it('产物是合法 SQLite 库：只读打开可查回源表 5 行（快照可用性自证）', () => {
    const snap = new Database(result.file!, { readonly: true, fileMustExist: true });
    try {
      const rows = snap.prepare('SELECT name FROM widget ORDER BY id').all() as Array<{ name: string }>;
      expect(rows.map((r) => r.name)).toEqual(WORDS);
    } finally {
      snap.close();
    }
  });

  it('R-24⑩ / 步 5b③：成功分支 notified === false 且 alert === null（通道已配置也零出站）', async () => {
    expect(result.notified).toBe(false);
    expect(result.alert).toBeNull();
    // 反证：把通道真配上再跑一次成功快照，出站请求必须仍是 0。
    configured();
    const again = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'v2.0.0-t21c-ii',
      outDir: outDir(),
      sqlitePath: source,
    });
    await settle();
    expect(again.ok).toBe(true);
    expect(again.notified).toBe(false);
    expect(again.alert).toBeNull();
    expect(received).toHaveLength(0);
  });

  it('源库全程只读未动：size / mtimeMs / sha256 三指纹跑前后一致', () => {
    const before = fingerprint(source);
    configured();
    return preReleaseSnapshot({ kind: 'sqlite', tag: 'readonly-evidence', outDir: outDir(), sqlitePath: source }).then(
      (r) => {
        expect(r.ok).toBe(true);
        expect(fingerprint(source)).toEqual(before);
      },
    );
  });
});

/* ════════════════════════ 失败分支 ════════════════════════ */

describe('backup.ts · 失败分支（R-24② 可感知 + R-24⑩ 未配置降级）', () => {
  const source = tmpFile(SOURCE_DB);

  beforeAll(() => {
    makeSourceDb();
  });

  it('写不进去（产物目录父路径是普通文件）→ ok:false 且 notified === true，告警四要素齐', async () => {
    const blocker = blockerPath();
    configured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'unwritable',
      outDir: path.join(blocker, 'nested'),
      sqlitePath: source,
    });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.file).toBeNull();
    expect(r.size_bytes).toBe(0);
    expect(r.sha256).toBeNull();
    expect(r.reason).toBeTruthy();
    expect(r.action).toBeTruthy();
    expect(r.notified).toBe(true);
    expect(r.alert?.sent).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
    const payload: Record<string, unknown> = received[0] ?? {};
    for (const key of ['database', 'at', 'reason', 'action']) {
      expect(typeof payload[key]).toBe('string');
      expect((payload[key] as string).length).toBeGreaterThan(0);
    }
    expect(red.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('断链目标路径（源库文件不存在）→ ok:false、reason 点名源库不存在、notified === true', async () => {
    configured();
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'broken-link',
      outDir: outDir(),
      sqlitePath: path.join(tmpDir, 'nope', 'definitely-missing.db'),
    });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('源库文件不存在');
    expect(r.notified).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
  });

  it('产物目录闸门：非 backups/ 且非 tmpdir → 拒绝写入并失败，且目录未被创建', async () => {
    configured();
    const forbidden = path.resolve(process.cwd(), 'tm-t21c-ii-forbidden-out');
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'gate',
      outDir: forbidden,
      sqlitePath: source,
    });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('拒绝写入');
    expect(fs.existsSync(forbidden)).toBe(false);
    expect(r.notified).toBe(true);
  });

  it('R-24⑩：ALERT_WEBHOOK_URL 未配置 → 降级为日志、不抛错、不阻塞、notified === false', async () => {
    unconfigured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'no-webhook',
      outDir: path.join(blockerPath(), 'nested'),
      sqlitePath: source,
    });
    // 上面这行能 await 回来本身就是"不抛错、不阻塞"的取证；再钉结构化返回。
    expect(r.ok).toBe(false);
    expect(r.notified).toBe(false);
    expect(r.alert?.sent).toBe(false);
    expect(r.alert?.reason).toContain('降级');
    expect(received).toHaveLength(0);
    const logs = red.mock.calls.flat().join('\n');
    expect(logs).toContain('[BACKUP][RED]');
    expect(logs).toContain('不报错、不阻塞');
    vi.restoreAllMocks();
  });

  it('失败必返结构化结果（绝不 undefined / 绝不抛）：五字段齐全', async () => {
    unconfigured();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 直接 await：若 `preReleaseSnapshot` 抛出，本用例立刻红 —— 这就是"不抛错"的取证。
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'shape',
      outDir: outDir(),
      sqlitePath: path.join(tmpDir, 'shape-missing-dir', 'nope.db'),
    });
    expect(r).toBeDefined();
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(typeof r.action).toBe('string');
    expect(typeof r.notified).toBe('boolean');
    expect(r.alert).not.toBeNull();
    expect(r.started_at).toBeTruthy();
    expect(r.finished_at).toBeTruthy();
    expect(spy.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('通道配置了但地址是死端口 → 吞错降级（sent:false / notified:false），不抛挂备份任务', async () => {
    process.env.ALERT_WEBHOOK_URL = 'http://127.0.0.1:1/hook';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await preReleaseSnapshot({
      kind: 'sqlite',
      tag: 'dead-endpoint',
      outDir: path.join(blockerPath(), 'nested'),
      sqlitePath: source,
    });
    expect(r.ok).toBe(false);
    expect(r.notified).toBe(false);
    expect(r.alert?.sent).toBe(false);
    expect(r.alert?.reason).toContain('已吞错');
    expect(spy.mock.calls.flat().join('\n')).toContain('告警未出站');
    vi.restoreAllMocks();
  });
});

/* ════════════════════════ 纯函数护栏（通道自述 + 目录闸门 + 文件名净化） ════════════════════════ */

describe('backup.ts · 通道与目录护栏', () => {
  it('describeAlertChannel 未配置：configured:false / blocking:false / 永不抛', () => {
    const ch = describeAlertChannel({});
    expect(ch.configured).toBe(false);
    expect(ch.blocking).toBe(false);
    expect(ch.verdict).toContain('降级');
    expect(ch.red_flag).toBeTruthy();
    expect(ch.host).toBeUndefined();
  });

  it('describeAlertChannel 配置了不可解析的 URL：只影响展示，不抛，host 给占位', () => {
    let ch: AlertChannel | undefined;
    expect(() => {
      ch = describeAlertChannel({ ALERT_WEBHOOK_URL: 'not a url at all' });
    }).not.toThrow();
    expect(ch!.configured).toBe(true);
    expect(ch!.host).toBe('(不可解析)');
    expect(ch!.blocking).toBe(false);
  });

  it('notifyViaChannel：未配置直接 sent:false；host 只出 host 不出完整 URL（防泄密钥）', async () => {
    const off = await notifyViaChannel(describeAlertChannel({}), { a: 1 });
    expect(off.sent).toBe(false);
    expect(off.reason).toContain('降级');
    const ch = describeAlertChannel({ ALERT_WEBHOOK_URL: 'https://hooks.example.test/secret-path?key=REDACT-ME' });
    expect(ch.host).toBe('hooks.example.test');
    expect(JSON.stringify(ch)).not.toContain('REDACT-ME');
  });

  it('assertSnapshotOutDir：backups/ 与 tmpdir 放行，其余拒绝', () => {
    expect(assertSnapshotOutDir(outDir()).ok).toBe(true);
    expect(assertSnapshotOutDir(path.join(tmpDir, 'deep', 'backups')).ok).toBe(true);
    const denied = assertSnapshotOutDir(path.resolve(process.cwd(), 'some-random-dir'));
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain('拒绝写入');
  });

  it('snapshotFileName：tag 里的路径分隔符/空格被压掉（防目录穿越）', () => {
    expect(snapshotFileName('sqlite', '../../evil')).toBe('pre-release-..-..-evil.db');
    expect(snapshotFileName('sqlite', '')).toBe('pre-release-untagged.db');
    expect(snapshotFileName('pg', 'v1 2 3')).toBe('pre-release-v1-2-3.dump');
    for (const tag of ['../../evil', 'a/b\\c', '  ']) {
      const name = snapshotFileName('sqlite', tag);
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name.startsWith('pre-release-')).toBe(true);
    }
  });
});

/* ════════════════════════ T-21c-vi：每日例行备份（N-2 注入面） ════════════════════════ */

/**
 * 批次 4C / T-21c-vi（A-47 #105 的 N-2）。上面文件头第 12-15 行写着"`scheduleBackup()` 不在本轮断言面内"
 * —— 该句自本轮起过时：正文被提成导出可注入函数 `runDailyBackupOnce(config, databaseUrl, now, deps?)`，
 * `deps` 给 `runDump`（换掉整个外部进程面）与 `alert`（换掉通道自述）两个注入口，于是 R-24⑩ 的
 * "例行备份失败必须可见"第一次拿到真断言。本段**只追加**，上面 17 条一字未改。
 *
 * 数据红线：`dataDir` 全部指到 `os.tmpdir()` 下的夹具目录，产物只可能落在夹具的 backups 子目录；
 * 真 `pg_dump` 不碰（`runDump` 一律注入），仓库 `backups/` 零新增，两份 `data.db` 不开不读不写。
 * 定时器面（`scheduleBackup` 的 5min/24h）不在本段断言：它无 deps 出口，动签名会破对外兼容 ⇒
 * 等价性靠源码逐行对照 + 报告论证，pg 真跑归 T-22 CI（N-3）。
 */

/** `runDailyBackupOnce` 只读 `config.dataDir`（`findPgDump` 亦只读它 + `PGDUMP_BIN`），夹具够用。 */
const fakeConfig = (dataDir: string): AppConfig => ({ dataDir } as AppConfig);
const dailyDir = (name: string): string => path.join(tmpDir, `daily-${name}`);
const DAILY_URL = 'postgres://user:SECRETPASS@db.example.test:5432/tomorrow';
/** 本地时区构造 ⇒ `stamp` 走 getFullYear/getMonth/getDate，跨时区恒为 2026-09-21。 */
const NOW = new Date(2026, 8, 21, 3, 30, 0);

/** 注入用 runDump：记下面数，并按 `--file=` 真写一个小产物（模拟 pg_dump 落盘，不建进程）。 */
function fakeDump(payload = 'PGDMP-fake-daily') {
  return vi.fn(async (bin: string, args: string[]): Promise<void> => {
    expect(typeof bin).toBe('string');
    const target = args.find((a) => a.startsWith('--file='))?.slice('--file='.length);
    if (!target) throw new Error('注入的 runDump 未收到 --file 参数');
    fs.writeFileSync(target, payload);
  });
}
const dumpArgv = (calls: unknown[][]): string[] => (calls[0]?.[1] ?? []) as string[];

describe('backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素）', () => {
  it('成功：ok:true、产物落 <dataDir>/backups/pg-<stamp>.dump，且通道已配置时零出站（步 5b③）', async () => {
    const dataDir = dailyDir('ok');
    const runDump = fakeDump();
    configured();
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await runDailyBackupOnce(fakeConfig(dataDir), DAILY_URL, NOW, { runDump });
    await settle();
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.action).toBeNull();
    // 成功不发通知：结构上 notifyViaChannel 只在失败分支 ⇒ notified/alert 双钉 + 收件箱反证
    expect(r.notified).toBe(false);
    expect(r.alert).toBeNull();
    expect(received).toHaveLength(0);
    // 产物路径与内容（日期零填充 + 目录纪律 = dataDir/backups）
    expect(r.file).toBe(path.join(dataDir, 'backups', 'pg-2026-09-21.dump'));
    expect(fs.existsSync(r.file!)).toBe(true);
    expect(fs.statSync(r.file!).size).toBeGreaterThan(0);
    expect(out.mock.calls.flat().join('\n')).toContain('PostgreSQL 已备份到');
    vi.restoreAllMocks();
  });

  it('成功：execFile argv 逐条等价（--dbname / --format=custom / --no-password / --file）', async () => {
    const runDump = fakeDump();
    unconfigured();
    const r = await runDailyBackupOnce(fakeConfig(dailyDir('argv')), DAILY_URL, NOW, { runDump });
    expect(r.ok).toBe(true);
    expect(runDump).toHaveBeenCalledTimes(1);
    const args = dumpArgv(runDump.mock.calls);
    expect(args).toHaveLength(4);
    expect(args[0]).toBe(`--dbname=${DAILY_URL}`);
    expect(args[1]).toBe('--format=custom');
    expect(args[2]).toBe('--no-password');
    expect(args[3]).toBe(`--file=${r.file}`);
  });

  it('成功：只保留 30 份，裁最旧，且只裁 `pg-YYYY-MM-DD.dump` 形状（其余文件不误删）', async () => {
    const dataDir = dailyDir('retention');
    const backupDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 1; i <= 31; i++) {
      fs.writeFileSync(path.join(backupDir, `pg-2019-01-${String(i).padStart(2, '0')}.dump`), 'old');
    }
    fs.writeFileSync(path.join(backupDir, 'keep-me.txt'), 'not a dump');
    fs.writeFileSync(path.join(backupDir, 'pg-2019-01.dump'), 'malformed name');
    const r = await runDailyBackupOnce(fakeConfig(dataDir), DAILY_URL, NOW, { runDump: fakeDump() });
    expect(r.ok).toBe(true);
    const kept = fs
      .readdirSync(backupDir)
      .filter((f) => /^pg-\d{4}-\d{2}-\d{2}\.dump$/.test(f))
      .sort();
    expect(kept).toHaveLength(30); // 31 旧 + 1 新 = 32 → 裁 2
    expect(kept).not.toContain('pg-2019-01-01.dump');
    expect(kept).not.toContain('pg-2019-01-02.dump');
    expect(kept).toContain('pg-2019-01-03.dump');
    expect(kept).toContain('pg-2026-09-21.dump');
    expect(fs.existsSync(path.join(backupDir, 'keep-me.txt'))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, 'pg-2019-01.dump'))).toBe(true);
  });

  it('R-24②：dump 一般失败 → ok:false、file:null、notified === true、告警四要素齐 + [BACKUP][RED]', async () => {
    configured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runDump = vi.fn(async (): Promise<void> => {
      throw new Error('pg_dump: connection to server failed');
    });
    const r = await runDailyBackupOnce(fakeConfig(dailyDir('dump-fail')), DAILY_URL, NOW, { runDump });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.file).toBeNull();
    expect(r.reason).toContain('备份失败：');
    expect(r.reason).toContain('connection to server failed');
    expect(r.action).toContain('人工介入');
    expect(r.notified).toBe(true);
    expect(r.alert?.sent).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
    const payload: Record<string, unknown> = received[0] ?? {};
    for (const key of ['database', 'at', 'reason', 'action']) {
      expect(typeof payload[key]).toBe('string');
      expect((payload[key] as string).length).toBeGreaterThan(0);
    }
    expect(payload.at).toBe(NOW.toISOString());
    expect(payload.kind).toBe('daily-pg-dump');
    expect(payload.database).toBe('pg://db.example.test:5432/tomorrow');
    expect(JSON.stringify(payload)).not.toContain('SECRETPASS'); // 脱敏：连接串口令绝不出站
    expect(red.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('R-24②：pg_dump 缺失（ENOENT）→ 文案点名 PGDUMP_BIN，且 notified === true、四要素齐', async () => {
    configured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runDump = vi.fn(async (): Promise<void> => {
      throw Object.assign(new Error('spawn pg_dump ENOENT'), { code: 'ENOENT' });
    });
    const r = await runDailyBackupOnce(fakeConfig(dailyDir('enoent')), DAILY_URL, NOW, { runDump });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('找不到 pg_dump');
    expect(r.action).toContain('PGDUMP_BIN');
    expect(r.notified).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
    const payload: Record<string, unknown> = received[0] ?? {};
    for (const key of ['database', 'at', 'reason', 'action']) {
      expect(typeof payload[key]).toBe('string');
      expect((payload[key] as string).length).toBeGreaterThan(0);
    }
    expect(red.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('R-24②：备份目录不可写 → ok:false、runDump 根本不被调用、告警照发四要素（原行为是未捕获异常）', async () => {
    configured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runDump = vi.fn(async (): Promise<void> => undefined);
    const r = await runDailyBackupOnce(fakeConfig(path.join(blockerPath(), 'nested')), DAILY_URL, NOW, {
      runDump,
    });
    await settle();
    expect(r.ok).toBe(false);
    expect(r.file).toBeNull();
    expect(runDump).not.toHaveBeenCalled();
    expect(r.reason).toContain('备份目录不可写');
    expect(r.reason).toContain(path.join('nested', 'backups'));
    expect(r.action).toBeTruthy();
    expect(r.notified).toBe(true);
    expect(r.alert?.sent).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
    const payload: Record<string, unknown> = received[0] ?? {};
    for (const key of ['database', 'at', 'reason', 'action']) {
      expect(typeof payload[key]).toBe('string');
      expect((payload[key] as string).length).toBeGreaterThan(0);
    }
    expect(red.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('deps.alert 注入生效：通道自述取自 deps.alert 而非 env（未配置降级 vs 已配置真出站的对照）', async () => {
    unconfigured();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const injected: AlertChannel = { configured: true, blocking: false, verdict: '注入通道', host: '127.0.0.1' };
    const r = await runDailyBackupOnce(fakeConfig(dailyDir('injected-channel')), DAILY_URL, NOW, {
      runDump: vi.fn(async (): Promise<void> => {
        throw new Error('boom');
      }),
      alert: injected,
    });
    // env 里 ALERT_WEBHOOK_URL 是空的：若通道仍取自 describeAlertChannel() 会走"未配置 → 降级"文案；
    // 实际走的是注入通道（configured:true）⇒ 真去 fetch ⇒ 空 URL 被吞错。这就自证了注入点生效。
    expect(r.ok).toBe(false);
    expect(r.alert).not.toBeNull();
    expect(r.notified).toBe(false);
    expect(r.alert?.reason).toContain('已吞错');
    expect(r.alert?.reason).not.toContain('降级');
    // 对照组：同一个注入通道 + env 配好 ⇒ 真出站，notified === true
    configured();
    const again = await runDailyBackupOnce(fakeConfig(dailyDir('injected-channel-2')), DAILY_URL, NOW, {
      runDump: vi.fn(async (): Promise<void> => {
        throw new Error('boom');
      }),
      alert: injected,
    });
    await settle();
    expect(again.notified).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(1);
    vi.restoreAllMocks();
  });

  it('R-24⑩：通道未配置且未注入 → 降级为日志，不抛错、notified === false、收件箱零请求', async () => {
    unconfigured();
    const red = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await runDailyBackupOnce(
      fakeConfig(dailyDir('no-webhook')),
      DAILY_URL,
      NOW,
      {
        runDump: vi.fn(async (): Promise<void> => {
          throw new Error('pg_dump died');
        }),
      },
      // 不传 deps.alert ⇒ 走 describeAlertChannel()（真读 env）
    );
    expect(r.ok).toBe(false);
    expect(r.notified).toBe(false);
    expect(r.alert?.sent).toBe(false);
    expect(r.alert?.reason).toContain('降级');
    expect(received).toHaveLength(0);
    expect(red.mock.calls.flat().join('\n')).toContain('[BACKUP][RED]');
    vi.restoreAllMocks();
  });

  it('默认参数：now 省略时取当前时间、deps 省略时走真 execFile 面（签名向后兼容自证）', async () => {
    unconfigured();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 把 pg_dump 指到必然不存在的绝对路径：不依赖本机装没装 postgresql-client，也不会真起进程
    process.env.PGDUMP_BIN = path.join(tmpDir, 'no-such-pg_dump');
    const r = await runDailyBackupOnce(fakeConfig(dailyDir('defaults')), 'postgres://x@y:1/z');
    delete process.env.PGDUMP_BIN;
    // 默认执行体 = 真 execFile ⇒ ENOENT ⇒ 失败分支：不抛、结构化、通道未配置 ⇒ 降级
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(r.reason!.length).toBeGreaterThan(0);
    expect(typeof r.action).toBe('string');
    expect(r.notified).toBe(false);
    expect(received).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
