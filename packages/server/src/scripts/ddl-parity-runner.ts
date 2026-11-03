/**
 * A-18-4：`@tm/server` 的 **test-only 装配** —— `tools/ddl-parity.mjs` B/C 段的被测面。
 *
 * 干什么：把 `tools/fixtures/schema-fixtures.json` 的同一份 fixtures，在
 *  - sqlite：临时文件库（`os.tmpdir()`，跑真迁移 000…006）
 *  - pg：`DATABASE_URL_TEST` 指向的测试库（跑同一套迁移）
 * 上各跑一遍 §6.2 第 4/5 步点名的方法（createUser / createWithPassword / activateIfEmpty /
 * setPassword / touchPasswordChanged / wordbooks.getData·applyEntries·applySync /
 * snapshots.save·take（撤销）/ fsrs.upsertCard·getCard + C 段的 phone·password·data 长度语义），
 * 把**每个用例的返回值或错误归类**原样吐成一行 JSON。
 *
 * 归一化与字符串级 diff **不在这里**：全部留在 `tools/ddl-parity.mjs`（比对口径的唯一落点，
 * 免得两处各有一份会漂）。本文件只负责"两驱动各跑一遍"。
 *
 * 数据红线（A-18-1 同一口径）：本脚本**不 import `../config.js`、不调 `createAppDB()`**，
 * 因此不可能落到仓库根 `data.db`；sqlite 侧只开 `os.tmpdir()` 下的临时文件，pg 侧只认
 * `DATABASE_URL_TEST`（未设置 = 显式 SKIP，由调用方打印原因）。
 * 顶层零副作用：只有被 `tsx` 直接执行时才跑（`entry-guard.invokedDirectly()`）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import Database from 'better-sqlite3';
import type { WordbookEntry } from '@tm/shared';
import { WORDBOOK_MAX_ENTRIES } from '@tm/shared/constants';
import { PostgresAppDB } from '../db/pg.js';
import { SqliteAppDB } from '../db/sqlite.js';
import { pgMigrationContext, sqliteMigrationContext } from '../db/index.js';
import type { AppDB } from '../db/types.js';
import { assertPhone } from '../db/types.js';
import { MigrationRunner } from '../db/migrations/index.js';
import { ALL_MIGRATIONS } from './migrate.js';
import { invokedDirectly } from './entry-guard.js';

/** 单个用例的结果：成功带 value，失败带 `error`（错误归类见 `errorKind`，两侧同口径才可比）。 */
export interface CaseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface DriverOutcome {
  driver: 'sqlite' | 'pg';
  ran: boolean;
  /** ran=false 时的人话原因（未设 DATABASE_URL_TEST / 连不上 / 迁移失败） */
  reason?: string;
  cases: Record<string, CaseResult>;
}

export interface RunnerReport {
  fixture_file: string;
  section: 'B' | 'C' | 'ALL';
  outcomes: DriverOutcome[];
}

/** `tools/fixtures/schema-fixtures.json` 的 C 段形状（§6.2 第 5 步的三组边界值）。 */
type CCases = {
  phone: Record<string, string>;
  password: Record<string, string>;
  data_array: Record<string, { count: number; item: { word: string; addedAt: number } }>;
};

type FixtureBag = {
  now: number;
  b_cases: Record<string, unknown>;
  c_cases: CCases;
};

const asRecord = (v: unknown): Record<string, unknown> => (v as Record<string, unknown>) ?? {};
const asEntries = (v: unknown): WordbookEntry[] => v as WordbookEntry[];

/**
 * 错误归类：只取错误信息里的**大写错误码**（`INVALID_PHONE` / `INVALID_PASSWORD_HASH` / …），
 * 否则归到 `'error'`。目的：两侧措辞不同不算漂移，"接受 vs 拒绝 / 错误码不同"才算。
 * （§6.2 第 5 步的判据原文就是"两库行为一致（都接受 / 都拒绝）"。）
 */
export function errorKind(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  const code = /\b([A-Z][A-Z0-9_]{3,})\b/.exec(msg);
  return code?.[1] ?? 'error';
}

/** 跑一条用例并吞掉异常（异常本身就是被测结论的一部分，绝不能让它击穿整个 runner）。 */
async function claim(fn: () => unknown | Promise<unknown>): Promise<CaseResult> {
  try {
    const value = await fn();
    return { ok: true, value: value ?? null };
  } catch (err) {
    return { ok: false, error: errorKind(err) };
  }
}

/** 去掉 pg 侧 int8 以字符串返回的漂移（与 `db/index.ts:createAppDB` 同一行设置）。 */
const normalizePgInt8 = (): void => {
  pg.types.setTypeParser(20, (v: string) => Number(v));
};

const openSqlite = async (file: string): Promise<AppDB> => {
  const raw = new Database(file);
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
};

/* ══════════════════════════ B 段：行为对账 ══════════════════════════ */

export async function runBCases(app: AppDB, fx: FixtureBag): Promise<Record<string, CaseResult>> {
  const now = fx.now;
  const b = fx.b_cases;
  const out: Record<string, CaseResult> = {};
  const accounts = ['empty_password_account', 'legacy_policy_version_account', 'new_policy_account', 'empty_string_password_account'];
  const ids: Record<string, number> = {};

  for (const key of accounts) {
    const acc = asRecord(b[key]);
    const phone = String(acc.phone);
    const hash = acc.password === null || acc.password === '' ? null : String(acc.password);
    const policy = Number(acc.pw_policy_version ?? 0);
    out[`B.${key}.create`] = await claim(async () => {
      const id = hash === null
        ? await app.createUser(phone, now)
        : await app.users.createWithPassword(phone, hash, policy, now);
      ids[key] = id;
      const row = await app.users.findCredentialsById(id);
      return { phone, password_is_null: row?.password === null, password_changed_at: row?.password_changed_at, pw_policy_version: row?.pw_policy_version };
    });
  }

  const emptyId = ids['empty_password_account'];
  if (emptyId !== undefined) {
    out['B.activate_if_empty.first'] = await claim(() =>
      app.users.activateIfEmpty(emptyId, '$2b$10$activationwins0000000000000000000000000000000000000000000', 1, now + 1),
    );
    out['B.activate_if_empty.second'] = await claim(() =>
      app.users.activateIfEmpty(emptyId, '$2b$10$activationloses000000000000000000000000000000000000000000000', 1, now + 2),
    );
    out['B.activate_if_empty.readback'] = await claim(async () => {
      const row = await app.users.findCredentialsById(emptyId);
      return { pw_policy_version: row?.pw_policy_version, changed_after_activation: row?.password_changed_at === now + 1 };
    });
  }

  const legacyId = ids['legacy_policy_version_account'];
  if (legacyId !== undefined) {
    out['B.change_password.set'] = await claim(() =>
      app.users.setPassword(legacyId, '$2b$10$afterchangepw00000000000000000000000000000000000000000000', 1, now + 60_000),
    );
    out['B.change_password.readback'] = await claim(async () => {
      const row = await app.users.findCredentialsById(legacyId);
      return { pw_policy_version: row?.pw_policy_version, password_changed_at: row?.password_changed_at, changed: row?.password !== '$2a$10$0123456789012345678901234567890a' };
    });
    out['B.change_password.touch'] = await claim(async () => {
      await app.users.touchPasswordChanged(legacyId, now + 999);
      const row = await app.users.findCredentialsById(legacyId);
      return { password_untouched: row?.password === '$2b$10$afterchangepw00000000000000000000000000000000000000000000', password_changed_at: row?.password_changed_at };
    });
  }

  const newId = ids['new_policy_account'];
  if (newId !== undefined) {
    out['B.wordbook.getData.empty'] = await claim(() => app.wordbooks.getData(newId));
    out['B.wordbook.chinese_word'] = await claim(() =>
      app.wordbooks.applyEntries(newId, asEntries([asRecord(b.chinese_word)]), now),
    );
    out['B.wordbook.long_word'] = await claim(() =>
      app.wordbooks.applyEntries(newId, asEntries([asRecord(b.chinese_word), asRecord(b.long_word)]), now + 1),
    );
    out['B.wordbook.readback'] = await claim(async () => {
      const data = await app.wordbooks.getData(newId);
      return { count: data.length, words: data.map((e) => e.word), added_ats: data.map((e) => e.addedAt) };
    });
    out['B.wordbook.whole_array'] = await claim(() => app.wordbooks.applyEntries(newId, asEntries(b.wordbook_whole_array), now + 2));
    out['B.wordbook.sync_state'] = await claim(() => app.wordbooks.getSyncState(newId));
    out['B.wordbook.apply_sync_stale'] = await claim(() =>
      app.wordbooks.applySync(newId, asEntries(b.wordbook_whole_array), '{}', 999_999, now + 3),
    );
    out['B.wordbook.apply_sync_current'] = await claim(async () => {
      const st = await app.wordbooks.getSyncState(newId);
      return app.wordbooks.applySync(newId, asEntries(b.wordbook_whole_array), '{}', st?.sync_version ?? 0, now + 4);
    });
    out['B.wordbook.count_all'] = await claim(() => app.wordbooks.countAll());

    /* review.apply 的 DB 面：卡片写入 + 撤销快照存/取（R-11） */
    const word = String(asRecord(b.review_apply_rating_4).word ?? 'apple');
    out['B.review.upsert_card'] = await claim(async () => {
      await app.fsrs.upsertCard(newId, word, JSON.stringify({ stability: 1, difficulty: 5, reps: 1, state: 2 }), now + 5, now + 5);
      const card = await app.fsrs.getCard(newId, word);
      return { word: card?.word ?? null, last_review: card?.last_review ?? null };
    });
    out['B.review.snapshot_save'] = await claim(() =>
      app.snapshots.save(newId, word, JSON.stringify({ stability: 1, difficulty: 5, reps: 0, state: 1 }), now + 5, 0, now + 5),
    );
    out['B.review.snapshot_take'] = await claim(async () => {
      const snap = await app.snapshots.take(newId, word);
      return { word: snap?.word ?? null, prev_data: snap?.prev_data ?? null, reps_before: snap?.reps_before ?? null, prev_due: snap?.prev_due ?? null };
    });
    out['B.review.snapshot_take_again'] = await claim(() => app.snapshots.take(newId, word));
    out['B.audit.append'] = await claim(() =>
      app.audit.append({
        userId: newId,
        phoneMasked: '0003',
        action: 'password_upgraded',
        result: 'ok',
        ip: '127.0.0.1',
        ua: 'ddl-parity',
        now: now + 6,
      }),
    );
    out['B.audit.list'] = await claim(async () => {
      const rows = await app.audit.listByUser(newId, 5);
      return rows.map((r) => ({ action: r.action, result: r.result, phone_masked: r.phone_masked }));
    });
    out['B.flags.get'] = await claim(() => app.flags.get('passwordUpgradeEnforce'));
  }

  return out;
}

/* ══════════════════════════ C 段：长度语义对账 ══════════════════════════ */

export async function runCCases(app: AppDB, fx: FixtureBag): Promise<Record<string, CaseResult>> {
  const c = fx.c_cases;
  const now = fx.now;
  const out: Record<string, CaseResult> = {};

  for (const [label, phone] of Object.entries(c.phone)) {
    out[`C.phone.${label}`] = await claim(() => app.users.findCredentialsByPhone(phone));
    out[`C.phone.assert.${label}`] = await claim(() => assertPhone(phone));
  }

  let seq = 0;
  for (const [label, hash] of Object.entries(c.password)) {
    seq += 1;
    out[`C.password.${label}`] = await claim(async () => {
      const id = await app.users.createWithPassword(`139${String(10000000 + seq)}`, hash, 1, now);
      const row = await app.users.findCredentialsById(id);
      return { stored_len: typeof row?.password === 'string' ? row.password.length : null, accepted: row?.password === hash };
    });
  }

  for (const [label, spec] of Object.entries(c.data_array)) {
    const entries = Array.from({ length: spec.count }, (_, i) => ({ ...spec.item, addedAt: spec.item.addedAt + i }));
    out[`C.data.${label}`] = await claim(async () => {
      const id = await app.createUser(`137${String(10000000 + entries.length)}`.slice(0, 11), now);
      await app.wordbooks.applyEntries(id, entries as WordbookEntry[], now);
      const back = await app.wordbooks.getData(id);
      return { wanted: spec.count, stored: back.length, cap: WORDBOOK_MAX_ENTRIES };
    });
  }
  return out;
}

/* ══════════════════════════════════ 主流程 ══════════════════════════════════ */

const readFixtures = (file: string): FixtureBag => {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as FixtureBag & { b_cases: { now: number } };
  const now = raw.b_cases.now;
  return { now, b_cases: raw.b_cases, c_cases: raw.c_cases };
};

const runDriver = async (
  driver: DriverOutcome['driver'],
  fx: FixtureBag,
  section: RunnerReport['section'],
  tmpDir: string,
): Promise<DriverOutcome> => {
  const outcome: DriverOutcome = { driver, ran: false, cases: {} };
  let app: AppDB | null = null;
  let pool: pg.Pool | null = null;
  try {
    if (driver === 'sqlite') {
      app = await openSqlite(path.join(tmpDir, 'parity-sqlite.db'));
    } else {
      const url = String(process.env.DATABASE_URL_TEST ?? '').trim();
      if (!url) {
        outcome.reason = '未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP';
        return outcome;
      }
      normalizePgInt8();
      pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000, max: 2 });
      await pool.query('select 1');
      app = new PostgresAppDB(pool);
      await app.init();
      await new MigrationRunner(ALL_MIGRATIONS, pgMigrationContext(pool)).apply({});
    }
    if (section === 'ALL' || section === 'B') Object.assign(outcome.cases, await runBCases(app, fx));
    if (section === 'ALL' || section === 'C') Object.assign(outcome.cases, await runCCases(app, fx));
    outcome.ran = true;
  } catch (err) {
    outcome.reason = String((err as Error)?.message ?? err).split('\n')[0];
    if (pool) await pool.end().catch(() => undefined);
    return outcome;
  }
  try {
    await app?.close();
  } catch {
    /* 关闭失败不影响已采集的结论 */
  }
  if (pool) await pool.end().catch(() => undefined);
  return outcome;
};

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fixtureFile = argv.includes('--fixtures') ? argv[argv.indexOf('--fixtures') + 1] : '';
  if (!fixtureFile || !fs.existsSync(fixtureFile)) {
    process.stderr.write(`ddl-parity-runner：--fixtures 必填且必须存在（收到 "${fixtureFile || '(空)'}"）\n`);
    process.exit(2);
  }
  const sectionArg = argv.includes('--section')
    ? String(argv[argv.indexOf('--section') + 1] ?? '').toUpperCase()
    : 'ALL';
  if (sectionArg !== 'B' && sectionArg !== 'C' && sectionArg !== 'ALL') {
    process.stderr.write(`ddl-parity-runner：--section 只能是 B / C / ALL（收到 "${sectionArg}"）\n`);
    process.exit(2);
  }
  const section: RunnerReport['section'] = sectionArg;
  const fx = readFixtures(fixtureFile);
  const tmpDir = path.join(os.tmpdir(), `tm-ddl-parity-${process.pid}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const outcomes: DriverOutcome[] = [];
    for (const driver of ['sqlite', 'pg'] as const) {
      outcomes.push(await runDriver(driver, fx, section, tmpDir));
    }
    const report: RunnerReport = { fixture_file: path.basename(fixtureFile), section, outcomes };
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** 只有被 tsx 直接执行时才跑（被 import = 零副作用，A-18-1 同一口径；护栏要显式收到本模块 URL）。 */
if (invokedDirectly(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`ddl-parity-runner 失败: ${String((err as Error)?.stack ?? err)}\n`);
    process.exit(1);
  });
}
