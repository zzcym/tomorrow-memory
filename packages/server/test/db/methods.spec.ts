/**
 * T-06 新 DB 方法测试（`pnpm --filter @tm/server test -- db`）—— §10.2 判据④。
 *
 * 覆盖：
 *  `users`     findCredentialsByPhone / findCredentialsById / createWithPassword /
 *              setPassword / activateIfEmpty(条件写) / touchPasswordChanged
 *  `wordbooks` getData(存量) / applyEntries / getSyncState / applySync
 *  `snapshots` save / take / remove        `audit` append / listByUser        `flags` get / set / list
 *
 * 另外两类"回归护栏"：
 *  1) **既有方法行为不变**：`findByPhone/findById/updatePassword/saveData/createUser` 的语义逐条重测，
 *     特别是 `updatePassword` 仍然**不碰** `password_changed_at`（§10.2 风险口径：既有方法体一字未改）；
 *  2) **双驱动方法集合一致**：sqlite 与 pg 的 12 个域 + AppDB 聚合面上的方法名必须完全相同
 *     （本机无 PG，运行面覆盖不到，就把"接口面分叉"这条路堵死）。
 *
 * 只在临时文件上跑（`os.tmpdir()`），迁移用真实的 000…006 跑出来列与表。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import pg from 'pg';
import { FEATURE_FLAG_DEFAULTS, type WordbookEntry } from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { sqliteMigrationContext } from '../../src/db/index.js';
import { assertNoCredentialLeak, assertPasswordHash, assertPhone } from '../../src/db/types.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';

const tmpDir = path.join(os.tmpdir(), `tm-t06-methods-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);

async function openMigratedDb(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

let db: SqliteAppDB;
const T0 = 1_700_000_000_000;
const hashOf = (seed: string): string => `$2b$10$${seed.padEnd(53, 'x')}`;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedDb('methods.db');
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ══════════════════════════ users：凭据面 ══════════════════════════ */

describe('users：R-40③④ / R-39③④⑤b 的凭据方法', () => {
  it('createWithPassword：三表一次建齐，凭据列落到传入值', async () => {
    const id = await db.users.createWithPassword('13800000001', hashOf('a'), 1, T0);
    const row = await db.users.findCredentialsById(id);
    expect(row).not.toBeNull();
    expect(row!.password).toBe(hashOf('a'));
    expect(row!.password_changed_at).toBe(T0);
    expect(row!.pw_policy_version).toBe(1);
    expect(await db.wordbooks.getData(id)).toEqual([]);
    expect((await db.profiles.get(id))?.user_id).toBe(id);
  });

  it('findCredentialsByPhone：按手机号取同一行；非法手机号在进 SQL 前就被拦（§6.2 漂移 1 收口）', async () => {
    const row = await db.users.findCredentialsByPhone('13800000001');
    expect(row!.phone).toBe('13800000001');
    await expect(db.users.findCredentialsByPhone('138000000')).rejects.toThrow(/INVALID_PHONE/);
    await expect(db.users.findCredentialsByPhone('1380000000a')).rejects.toThrow(/INVALID_PHONE/);
    // §6.2 漂移 1：pg 的 VARCHAR(11) 会静默截断、sqlite 不限长 → 超长必须**在进 SQL 前**被拦
    expect(() => assertPhone('123456789012')).toThrow(/INVALID_PHONE/);
  });

  it('setPassword：写新 hash + 推进 changed_at + 落策略版本（改密三件事一起做）', async () => {
    const id = await db.users.createWithPassword('13800000002', hashOf('b'), 0, T0);
    await db.users.setPassword(id, hashOf('c'), 1, T0 + 60_000);
    const row = await db.users.findCredentialsById(id);
    expect(row!.password).toBe(hashOf('c'));
    expect(row!.password_changed_at).toBe(T0 + 60_000);
    expect(row!.pw_policy_version).toBe(1);
  });

  it('setPassword 拒绝空哈希（空串不得被当成"已设密码"）', async () => {
    await expect(db.users.setPassword(1, '   ', 1, T0)).rejects.toThrow(/INVALID_PASSWORD_HASH/);
    expect(() => assertPasswordHash('')).toThrow(/INVALID_PASSWORD_HASH/);
  });

  it('activateIfEmpty：条件写只赢一次（R-39⑤b 的认领语义，无读后写竞态）', async () => {
    const id = await db.createUser('13800000003', T0);
    const before = await db.users.findCredentialsById(id);
    expect(before!.password).toBeNull();
    expect(await db.users.activateIfEmpty(id, hashOf('d'), 1, T0 + 1)).toBe(true);
    expect(await db.users.activateIfEmpty(id, hashOf('e'), 1, T0 + 2)).toBe(false);
    const after = await db.users.findCredentialsById(id);
    expect(after!.password).toBe(hashOf('d'));
    expect(after!.pw_policy_version).toBe(1);
  });

  it('判空口径 = password IS NULL OR trim(password)=\'\')：空白串仍算"没设过密码"', async () => {
    const id = await db.createUser('13800000004', T0);
    await db.users.updatePassword(id, '   '); // 既有方法（一字未改）能写进空白串
    expect(await db.users.activateIfEmpty(id, hashOf('f'), 1, T0 + 3)).toBe(true);
    expect((await db.users.findCredentialsById(id))!.password).toBe(hashOf('f'));
  });

  it('touchPasswordChanged：只推进 changed_at，不碰 password（R-40③ 的登出型操作）', async () => {
    const id = await db.users.createWithPassword('13800000005', hashOf('g'), 1, T0);
    await db.users.touchPasswordChanged(id, T0 + 999);
    const row = await db.users.findCredentialsById(id);
    expect(row!.password_changed_at).toBe(T0 + 999);
    expect(row!.password).toBe(hashOf('g'));
    expect(row!.pw_policy_version).toBe(1);
  });

  it('既有方法行为不变：updatePassword 不碰两个新列，findByPhone 不带出凭据列（§10.2 风险口径）', async () => {
    const id = await db.users.createWithPassword('13800000006', hashOf('h'), 1, T0);
    await db.users.updatePassword(id, hashOf('i'));
    const cred = await db.users.findCredentialsById(id);
    expect(cred!.password).toBe(hashOf('i'));
    expect(cred!.password_changed_at).toBe(T0);
    expect(cred!.pw_policy_version).toBe(1);
    const legacy = await db.users.findByPhone('13800000006');
    expect(Object.keys(legacy!).sort()).toEqual(['created_at', 'id', 'password', 'phone']);
  });

  it('存量行的 M1 默认值 = 0/0（零回填的读侧证据）', async () => {
    const id = await db.createUser('13800000007', T0);
    const row = await db.users.findCredentialsById(id);
    expect(row!.password_changed_at).toBe(0);
    expect(row!.pw_policy_version).toBe(0);
  });
});

/* ══════════════════════════ wordbooks：单一落库路径 ══════════════════════════ */

describe('wordbooks：applyEntries / getSyncState / applySync（§4.4.2 版本语义）', () => {
  const entries = (...words: string[]): WordbookEntry[] =>
    words.map((word, i) => ({ word, addedAt: T0 + i, reviewCount: 0 }));

  it('首次写入非空集合 → version 1；同集合重放 → version 不变（幂等）', async () => {
    const id = await db.createUser('13800000010', T0);
    expect(await db.wordbooks.applyEntries(id, entries('apple', 'boy'), T0 + 10)).toBe(1);
    expect(await db.wordbooks.applyEntries(id, entries('apple', 'boy'), T0 + 20)).toBe(1);
    expect(await db.wordbooks.applyEntries(id, entries('apple', 'boy', 'cat'), T0 + 30)).toBe(2);
    const state = await db.wordbooks.getSyncState(id);
    expect(state).toMatchObject({ user_id: id, sync_version: 2, updated_at: T0 + 30, tombstones: '[]' });
    expect(await db.wordbooks.getData(id)).toEqual(entries('apple', 'boy', 'cat'));
  });

  it('空数组且不存在的行 → version 0（集合没变就不 ++）', async () => {
    const id = await db.createUser('13800000011', T0);
    expect(await db.wordbooks.applyEntries(id, [], T0 + 5)).toBe(0);
    expect((await db.wordbooks.getSyncState(id))!.sync_version).toBe(0);
  });

  it('applySync：baseVersion 命中则写并 ++；不命中返回 stale + 服务端当前版本（409 载荷）', async () => {
    const id = await db.createUser('13800000012', T0);
    await db.wordbooks.applyEntries(id, entries('dog'), T0 + 1);
    const ok = await db.wordbooks.applySync(id, entries('dog', 'egg'), JSON.stringify({ ant: T0 + 2 }), 1, T0 + 2);
    expect(ok).toEqual({ ok: true, version: 2 });
    const stale = await db.wordbooks.applySync(id, entries('dog', 'egg', 'fig'), '[]', 1, T0 + 3);
    expect(stale).toEqual({ ok: false, version: 2, reason: 'stale' });
    const state = await db.wordbooks.getSyncState(id);
    expect(state!.tombstones).toBe(JSON.stringify({ ant: T0 + 2 }));
    expect(await db.wordbooks.getData(id)).toEqual(entries('dog', 'egg'));
    // stale 那一枪没留下任何写入
    expect((await db.wordbooks.getSyncState(id))!.updated_at).toBe(T0 + 2);
  });

  it('applySync：集合与墓碑都没变 → version 不变（重放不报错）', async () => {
    const id = await db.createUser('13800000013', T0);
    await db.wordbooks.applyEntries(id, entries('hen'), T0 + 1);
    const first = await db.wordbooks.applySync(id, entries('hen'), '[]', 1, T0 + 9);
    expect(first).toEqual({ ok: true, version: 1 });
  });

  it('applySync：行不存在 → missing（不抛、不静默建半行）', async () => {
    const r = await db.wordbooks.applySync(999999, entries('owl'), '[]', 0, T0);
    expect(r).toEqual({ ok: false, version: 0, reason: 'missing' });
  });

  it('新词自动建 FSRS 卡：applyEntries 与既有 saveData 产出逐字相同的卡片 JSON', async () => {
    const a = await db.createUser('13800000014', T0);
    const b = await db.createUser('13800000015', T0);
    await db.wordbooks.saveData(a, entries('fig'), T0 + 40);
    await db.wordbooks.applyEntries(b, entries('fig'), T0 + 40);
    const cardA = await db.fsrs.getCard(a, 'fig');
    const cardB = await db.fsrs.getCard(b, 'fig');
    expect(cardB!.fsrs_data).toBe(cardA!.fsrs_data);
    expect(JSON.parse(cardB!.fsrs_data)).toMatchObject({ state: 0, reps: 0, lapses: 0, stability: 1, difficulty: 5 });
    expect(JSON.parse(cardB!.fsrs_data).due).toBe(new Date(T0 + 40).toISOString());
    // applySync 走的也是同一条补卡路径
    await db.wordbooks.applySync(b, entries('fig', 'gum'), '[]', 1, T0 + 41);
    const gum = await db.fsrs.getCard(b, 'gum');
    expect(gum).not.toBeNull();
    expect(JSON.parse(gum!.fsrs_data)).toMatchObject({ state: 0, reps: 0 });
    expect(JSON.parse(gum!.fsrs_data).due).toBe(new Date(T0 + 41).toISOString());
  });

  it('data 的整数组形状一字未动（R-03⑦ 红线：读回来与写进去逐字相等）', async () => {
    const id = await db.createUser('13800000016', T0);
    const withExtras: WordbookEntry[] = [{ word: 'quay', addedAt: T0, custom: { nested: [1, 2] } } as WordbookEntry];
    await db.wordbooks.applyEntries(id, withExtras, T0 + 50);
    expect(JSON.stringify(await db.wordbooks.getData(id))).toBe(JSON.stringify(withExtras));
  });
});

/* ══════════════════════════ snapshots / audit / flags ══════════════════════════ */

describe('snapshots：R-11 撤销（save / take / remove）', () => {
  it('take 取最近一条并消费；remove 按 id 删', async () => {
    const id = await db.createUser('13800000020', T0);
    const old = await db.snapshots.save(id, 'apple', '{"reps":1}', T0 + 1, 1, T0 + 1);
    const last = await db.snapshots.save(id, 'apple', '{"reps":2}', null, 2, T0 + 2);
    expect(old).not.toBe(last);
    const taken = await db.snapshots.take(id, 'apple');
    expect(taken).toMatchObject({ id: last, user_id: id, word: 'apple', prev_data: '{"reps":2}', prev_due: null, reps_before: 2 });
    expect(await db.snapshots.take(id, 'apple')).toMatchObject({ id: old, prev_data: '{"reps":1}' });
    expect(await db.snapshots.take(id, 'apple')).toBeNull();
    const oneMore = await db.snapshots.save(id, 'pear', '{"reps":0}', 123, 0, T0 + 3);
    await db.snapshots.remove(oneMore);
    expect(await db.snapshots.take(id, 'pear')).toBeNull();
  });

  it('prev_data 原文入库：4.7.1 的序列化串不被解析、不被改写（A-2 钉版本红线）', async () => {
    const id = await db.createUser('13800000021', T0);
    const serialized =
      '{"due":"2026-09-01T00:00:00.000Z","stability":3.7,"difficulty":6.1,"elapsed_days":2,"scheduled_days":5,"reps":4,"lapses":1,"state":2,"learning_steps":0,"playing_wasted_requests":null,"last_review":"2026-08-30T00:00:00.000Z"}';
    await db.snapshots.save(id, 'zephyr', serialized, T0, 4, T0);
    const row = await db.snapshots.take(id, 'zephyr');
    expect(row!.prev_data).toBe(serialized);
  });
});

describe('audit：R-39⑤b 落库审计（append / listByUser）', () => {
  it('append 写入 + listByUser 倒序读回；只存后 4 位', async () => {
    const id = await db.createUser('13800000030', T0);
    await db.audit.append({ userId: id, phoneMasked: '0030', action: 'account_activated', result: 'ok', ip: '10.0.0.1', ua: 'App/1.0', now: T0 + 1 });
    await db.audit.append({ userId: id, action: 'password_upgraded', result: 'fail', now: T0 + 2 });
    const rows = await db.audit.listByUser(id);
    expect(rows.map((r) => r.action)).toEqual(['password_upgraded', 'account_activated']);
    expect(rows[1]).toMatchObject({ phone_masked: '0030', ip: '10.0.0.1', ua: 'App/1.0' });
    expect(rows[0]).toMatchObject({ phone_masked: null, ip: null, ua: null, result: 'fail' });
    expect(rows[0]!.created_at).toBe(T0 + 2);
  });

  it('不落凭据：bcrypt 指纹 / 明文密码出现在任何字段都拒写（§4.5 红线）', async () => {
    const id = await db.createUser('13800000031', T0);
    await expect(
      db.audit.append({ userId: id, action: hashOf('leak'), result: 'ok', now: T0 }),
    ).rejects.toThrow(/AUDIT_CREDENTIAL_LEAK/);
    await expect(
      db.audit.append(
        { userId: id, action: 'password_upgraded', ua: 'ua 里混了 Pa55word!x', result: 'ok', now: T0 },
        'Pa55word!x',
      ),
    ).rejects.toThrow(/明文密码/);
    expect(await db.audit.listByUser(id)).toEqual([]);
    expect(() =>
      assertNoCredentialLeak({ userId: id, action: 'password_upgraded', result: 'ok', now: T0 }),
    ).not.toThrow();
  });
});

describe('flags：§4.4.4 运行时开关（get / set / list）', () => {
  it('M5 种子 = FEATURE_FLAG_DEFAULTS 全量键，值与 shared 一致', async () => {
    const rows = await db.flags.list();
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(FEATURE_FLAG_DEFAULTS).sort());
    for (const row of rows) {
      expect(row.value).toBe(FEATURE_FLAG_DEFAULTS[row.key as keyof typeof FEATURE_FLAG_DEFAULTS]);
      expect(typeof row.updated_at).toBe('number');
    }
  });

  it('set 是 upsert：改值后 get 读回新值与新 updated_at；未知键返回 null', async () => {
    expect(await db.flags.get('wordbookIncremental')).toMatchObject({ value: '0%' });
    await db.flags.set('wordbookIncremental', '10', T0 + 77);
    expect(await db.flags.get('wordbookIncremental')).toEqual({ key: 'wordbookIncremental', value: '10', updated_at: T0 + 77 });
    await db.flags.set('brandNewFlag', 'on', T0 + 78);
    expect(await db.flags.get('brandNewFlag')).toMatchObject({ value: 'on' });
    expect(await db.flags.get('nope-not-a-flag')).toBeNull();
    await db.flags.set('wordbookIncremental', '0%', T0 + 79);
  });
});

/* ══════════════════════════ 双驱动接口面一致 ══════════════════════════ */

/** 只读原型链上的方法名（不含构造参数上的数据字段），用于比较两驱动的实现面。 */
function methodsOf(obj: object): string[] {
  const names = new Set<string>();
  let proto: object | null = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) if (key !== 'constructor') names.add(key);
    proto = Object.getPrototypeOf(proto);
  }
  return [...names].sort();
}

describe('双驱动方法集合一致（判据④ 的 pg 侧等价证据：不连库也能挡住接口分叉）', () => {
  let sqliteDb: SqliteAppDB;
  let pgDb: PostgresAppDB;

  beforeAll(async () => {
    sqliteDb = await openMigratedDb('parity.db');
    // Pool 构造不连接：只用来取实现面，不发任何 SQL
    pgDb = new PostgresAppDB(new pg.Pool({ connectionString: 'postgresql://nobody:none@127.0.0.1:1/none', max: 1 }));
  });

  afterAll(async () => {
    await sqliteDb?.close();
    await pgDb?.close();
  });

  /**
   * 两驱动各自实现时允许的**私有 helper**（§10.2 T-06 的风险缓解就是"新逻辑只加新私有 helper"，
   * 所以 helper 名字本来就不要求一致）。登记在此：出现未登记的私有方法时，它会以"公开方法集合
   * 不一致"的形式把本用例打红，不会被静默放过。
   */
  const PRIVATE_HELPERS: Record<'sqlite' | 'pg', string[]> = {
    sqlite: ['ensureNewCards'],
    pg: ['insertNewCards', 'writeWordbook'],
  };

  it('12 个域的方法名逐域全等（helper 之外的公开面，含"helper 名单本身不许漂"）', () => {
    const domains = [
      'users',
      'wordbooks',
      'profiles',
      'checkins',
      'fsrs',
      'tutorCache',
      'chat',
      'assessment',
      'analystCache',
      'snapshots',
      'audit',
      'flags',
    ] as const;
    const publicOf = (side: 'sqlite' | 'pg', d: (typeof domains)[number]): string[] =>
      methodsOf((side === 'sqlite' ? sqliteDb : pgDb)[d]).filter(
        (n) => !PRIVATE_HELPERS[side].includes(n),
      );
    for (const d of domains) {
      expect(publicOf('pg', d), `${d} 域公开方法集合与 sqlite 不同`).toEqual(publicOf('sqlite', d));
    }
    // helper 名单必须"用满"：登记了却两侧都不存在 → 说明有人在改名后没同步这张表
    for (const side of ['sqlite', 'pg'] as const) {
      const present = domains.flatMap((d) => methodsOf((side === 'sqlite' ? sqliteDb : pgDb)[d]));
      for (const h of PRIVATE_HELPERS[side]) {
        expect(present, `${side} 登记的私有 helper ${h} 已不存在（名单需与实现同步）`).toContain(h);
      }
    }
  });

  it('AppDB 聚合面上 createUser/init/close + 三个新域都在', () => {
    for (const key of ['createUser', 'init', 'close'] as const) {
      expect(typeof pgDb[key]).toBe('function');
      expect(typeof sqliteDb[key]).toBe('function');
    }
    // 各自的底层句柄字段（T-06 之前就存在、且被 `migrate.ts --copy-legacy` 依赖）不算接口面
    const sansHandle = (o: object, drop: string[]) => Object.keys(o).filter((k) => !drop.includes(k)).sort();
    expect(sansHandle(pgDb, ['pool'])).toEqual(sansHandle(sqliteDb, ['db']));
    expect((sqliteDb as unknown as { db: unknown }).db).toBeTruthy();
    expect((pgDb as unknown as { pool: unknown }).pool).toBeTruthy();
    for (const key of ['snapshots', 'audit', 'flags']) {
      expect(sansHandle(pgDb, ['pool'])).toContain(key);
    }
  });

  it('判据④点名的 20 个新方法在两驱动上都存在', () => {
    const wanted: Array<[string, string]> = [
      ['users', 'findByPhone'],
      ['users', 'setPassword'],
      ['users', 'activateIfEmpty'],
      ['users', 'touchPasswordChanged'],
      ['users', 'findCredentialsByPhone'],
      ['users', 'findCredentialsById'],
      ['users', 'createWithPassword'],
      ['wordbooks', 'getData'],
      ['wordbooks', 'applyEntries'],
      ['wordbooks', 'getSyncState'],
      ['wordbooks', 'applySync'],
      ['snapshots', 'save'],
      ['snapshots', 'take'],
      ['snapshots', 'remove'],
      ['audit', 'append'],
      ['audit', 'listByUser'],
      ['flags', 'get'],
      ['flags', 'set'],
      ['flags', 'list'],
    ];
    const sqlite = sqliteDb as unknown as Record<string, Record<string, unknown>>;
    const postgres = pgDb as unknown as Record<string, Record<string, unknown>>;
    for (const [domain, method] of wanted) {
      expect(typeof sqlite[domain]?.[method], `sqlite.${domain}.${method}`).toBe('function');
      expect(typeof postgres[domain]?.[method], `pg.${domain}.${method}`).toBe('function');
    }
  });
});
