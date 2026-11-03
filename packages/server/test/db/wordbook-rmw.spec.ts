/**
 * T-06 微轮 / A-32-6：`AppDB.wordbooks.applyMutate()` —— 事务内 read-modify-write。
 *
 * 动机（T-09 报告 A-b）：词本增量写此前是"读投影 → merge → CAS 覆写"，靠 service 层 16 轮重试兜底，
 * 极端并发下有一轮不写墓碑的残余。本方法把"读当前行 → 回调投影 → 写回"收进同一个事务。
 *
 * 覆盖（sqlite 用 `os.tmpdir()` 下的临时库跑真事务，**绝不碰仓库里的 `data.db`**）：
 *  1) 基本语义：一次事务改数据、`sync_version` +1、回调 `value` 原样带回、新词补 FSRS 卡；
 *  2) `wordbooks.data` 的 JSON 形状一字不动、**未知键原样保留**（走字符串分支逐字落库）；
 *  3) 幂等重放：载荷逐字相同 ⇒ 不写、版本不动、`updated_at` 不动；
 *  4) 墓碑列：给 ⇒ 整列覆盖；省略 ⇒ 一个字节都不碰（与 `applyEntries` 的整数组语义一致）；
 *  5) 回滚：回调抛错 / 回调返回非对象 ⇒ 库里那一串保持改动前的字节；
 *  6) 缺行：写非空 ⇒ 建行并置 1；写 `'[]'` ⇒ 建行且版本 0（与 `applyEntries`/`writeWordbook` 同口径）；
 *  7) **两驱动语义一致**：同一组场景在 sqlite（真库）与 pg 上跑，返回值与落库内容逐字相等。
 *     pg 侧本机无实例 ⇒ 用"语句桩"给出事务边界与参数级证据，真库那一跑写成 `DATABASE_URL_TEST`
 *     门禁下的用例并显式 SKIP（A-18-3：**CI 必须真跑 pg**）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import pg from 'pg';
import type { WordbookEntry } from '@tm/shared';
import { SqliteAppDB } from '../../src/db/sqlite.js';
import { PostgresAppDB } from '../../src/db/pg.js';
import { sqliteMigrationContext, pgMigrationContext } from '../../src/db/index.js';
import { MigrationRunner } from '../../src/db/migrations/index.js';
import { ALL_MIGRATIONS } from '../../src/scripts/migrate.js';
import type { WordbookCurrent, WordbookDB, WordbookPatch } from '../../src/db/types.js';
import { planWordbookMutate, wordbookCurrentOf } from '../../src/db/types.js';

const tmpDir = path.join(os.tmpdir(), `tm-t06-fix2-rmw-${process.pid}`);
const tmpFile = (name: string): string => path.join(tmpDir, name);
const T0 = 1_700_000_000_000;
const hashOf = (seed: string): string => `$2b$10$${seed.padEnd(53, 'x')}`;
const PG_URL = String(process.env.DATABASE_URL_TEST ?? '').trim();

/** 只要 `applyMutate` 这一面，好让 sqlite 真库与 pg（桩/真库）跑同一个场景函数。 */
type MutateTarget = Pick<WordbookDB, 'applyMutate'>;

async function openMigratedSqlite(name: string): Promise<SqliteAppDB> {
  const raw = new Database(tmpFile(name));
  const app = new SqliteAppDB(raw);
  await app.init();
  await new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({});
  return app;
}

let db: SqliteAppDB;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  db = await openMigratedSqlite('rmw.db');
});

afterAll(async () => {
  await db?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 建一个用户（`createWithPassword` 会一并建 `'[]'` 的词本行）；`seed` = 直接写进 `data` 列的**原文**。 */
async function makeUser(tag: string, seed?: string): Promise<number> {
  const id = await db.users.createWithPassword(`139${tag.padStart(8, '0')}`, hashOf(`rmw${tag}`), 1, T0);
  if (seed !== undefined) {
    db.db.prepare('UPDATE wordbooks SET data = ?, tombstones = ?, sync_version = ? WHERE user_id = ?').run(seed, '{}', 3, id);
  }
  return id;
}

const rawData = (userId: number): string => {
  const r = db.db.prepare('SELECT data FROM wordbooks WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  return String(r?.data ?? '');
};

const rawVersion = (app: SqliteAppDB, userId: number): number =>
  Number(
    (
      app.db.prepare('SELECT sync_version FROM wordbooks WHERE user_id = ?').get(userId) as
        | Record<string, unknown>
        | undefined
    )?.['sync_version'],
  );

const rawRow = (userId: number): { data: string; sync_version: number; tombstones: string; updated_at: number } => {
  const r = db.db
    .prepare('SELECT data, sync_version, tombstones, updated_at FROM wordbooks WHERE user_id = ?')
    .get(userId) as Record<string, unknown>;
  return {
    data: String(r.data),
    sync_version: Number(r.sync_version),
    tombstones: String(r.tombstones ?? '[]'),
    updated_at: Number(r.updated_at),
  };
};

/* ══════════════════════════ 1/3/4/5/6：sqlite 真库语义 ══════════════════════════ */

describe('wordbooks.applyMutate：事务内 RMW（sqlite 真库）', () => {
  it('基本流：读当前行 → 回调投影 → 写回 → 版本 +1；回调 value 原样带回；新词补建 FSRS 卡', async () => {
    const uid = await makeUser('01');
    const result = await db.wordbooks.applyMutate<number>(
      uid,
      (cur) => {
        expect(cur).toMatchObject({ exists: true, dataJson: '[]', sync_version: 0, tombstones: '[]', updated_at: T0 });
        expect(cur.entries).toEqual([]);
        return { data: [{ word: 'apple', addedAt: T0 }], value: 7 };
      },
      T0 + 1,
    );
    expect(result).toEqual({ value: 7, version: 1, wrote: true });
    expect(rawData(uid)).toBe(JSON.stringify([{ word: 'apple', addedAt: T0 }]));
    expect((await db.wordbooks.getData(uid)).map((e) => e.word)).toEqual(['apple']);
    expect(await db.fsrs.getCard(uid, 'apple')).not.toBeNull();
  });

  it('回调读到墓碑列与 sync_version ⇒ 可在持锁的行上做增量（service 不再需要 CAS 的理由）', async () => {
    const uid = await makeUser('02', JSON.stringify([{ word: 'apple' }, { word: 'bear' }]));
    expect(rawRow(uid).sync_version).toBe(3);
    const r = await db.wordbooks.applyMutate<{ added: string[] }>(
      uid,
      (cur) => ({
        data: [...(cur.entries ?? []), { word: 'cat' }],
        tombstones: JSON.stringify({ dog: T0 }),
        value: { added: ['cat'] },
      }),
      T0 + 2,
    );
    expect(r).toEqual({ value: { added: ['cat'] }, version: 4, wrote: true });
    expect((await db.wordbooks.getData(uid)).map((e) => e.word)).toEqual(['apple', 'bear', 'cat']);
    expect(rawRow(uid).tombstones).toBe(JSON.stringify({ dog: T0 }));
  });

  it('幂等重放：载荷与当前行逐字相同 ⇒ 不写、版本不动、updated_at 不动', async () => {
    const uid = await makeUser('03', JSON.stringify([{ word: 'apple' }]));
    const before = rawRow(uid);
    const r = await db.wordbooks.applyMutate(uid, (cur) => ({ data: cur.dataJson ?? '[]' }), T0 + 9_999);
    expect(r).toEqual({ value: undefined, version: before.sync_version, wrote: false });
    expect(rawRow(uid)).toEqual(before);
  });

  it('墓碑列：省略 = 一个字节都不碰；给了 = 整列覆盖', async () => {
    const uid = await makeUser('04', JSON.stringify([{ word: 'apple' }]));
    const tombstonesBefore = rawRow(uid).tombstones;
    expect(tombstonesBefore).toBe('{}');
    await db.wordbooks.applyMutate(uid, () => ({ data: [{ word: 'apple' }, { word: 'bear' }] }), T0 + 3);
    expect(rawRow(uid).tombstones).toBe(tombstonesBefore);
    await db.wordbooks.applyMutate(uid, () => ({ data: [{ word: 'apple' }, { word: 'bear' }], tombstones: '{}' }), T0 + 4);
    expect(rawRow(uid).tombstones).toBe('{}');
    expect(rawRow(uid).sync_version).toBe(4);
  });

  it('回调抛错 ⇒ 整个事务回滚，库里那一串保持改动前的字节', async () => {
    const uid = await makeUser('05', JSON.stringify([{ word: 'apple' }]));
    const before = rawRow(uid);
    await expect(
      db.wordbooks.applyMutate(uid, () => {
        throw new Error('投影失败');
      }, T0 + 5),
    ).rejects.toThrow(/投影失败/);
    expect(rawRow(uid)).toEqual(before);
  });

  it('回调返回非对象 / data 为 null ⇒ 抛错且不写（静默当成"写空数组"等于删光用户的词）', async () => {
    const uid = await makeUser('06', JSON.stringify([{ word: 'apple' }]));
    const before = rawRow(uid);
    await expect(
      db.wordbooks.applyMutate(uid, () => undefined as unknown as WordbookPatch, T0 + 6),
    ).rejects.toThrow(/必须返回/);
    await expect(
      db.wordbooks.applyMutate(uid, () => ({ data: null }) as unknown as WordbookPatch, T0 + 6),
    ).rejects.toThrow(/不得为 null/);
    expect(rawRow(uid)).toEqual(before);
    expect((await db.wordbooks.getData(uid)).map((e) => e.word)).toEqual(['apple']);
  });

  it('缺行：写非空 ⇒ 建行且版本 1；写 `[]` ⇒ 建行且版本 0（与 applyEntries / pg writeWordbook 同口径）', async () => {
    const uid = await makeUser('07');
    db.db.prepare('DELETE FROM wordbooks WHERE user_id = ?').run(uid);
    const empty = await db.wordbooks.applyMutate(uid, () => ({ data: [] }), T0 + 7);
    expect(empty).toEqual({ value: undefined, version: 0, wrote: false });
    expect(rawRow(uid).data).toBe('[]');
    expect(rawRow(uid).sync_version).toBe(0);
    db.db.prepare('DELETE FROM wordbooks WHERE user_id = ?').run(uid);
    const wrote = await db.wordbooks.applyMutate(uid, () => ({ data: [{ word: 'dog' }] }), T0 + 8);
    expect(wrote).toMatchObject({ version: 1, wrote: true });
    expect(rawRow(uid).data).toBe(JSON.stringify([{ word: 'dog' }]));
  });

  it('两个独立写事务叠加不丢词、版本连续推进（取代 CAS 循环的可观察判据）', async () => {
    const uid = await makeUser('08');
    const second = new SqliteAppDB(new Database(tmpFile('rmw.db')));
    try {
      await second.wordbooks.applyMutate(
        uid,
        (cur) => ({ data: [...(cur.entries ?? []), { word: 'apple', addedAt: T0 }] }),
        T0 + 10,
      );
      await db.wordbooks.applyMutate(
        uid,
        (cur) => ({ data: [...(cur.entries ?? []), { word: 'bear', addedAt: T0 + 1 }] }),
        T0 + 11,
      );
      const row = rawRow(uid);
      expect(JSON.parse(row.data).map((e: WordbookEntry) => e.word)).toEqual(['apple', 'bear']);
      expect(row.sync_version).toBe(2);
    } finally {
      second.db.close();
    }
  });
});

/* ══════════════════════ 2：`wordbooks.data` 的 JSON 形状一字不动 ══════════════════════ */

const seeded = JSON.stringify([
  { word: 'apple', addedAt: 1_700_000_000_001, colins: 5, myNote: { 备注: '中文键', tags: ['a', 'b'] } },
  { word: 'bear', reviewCount: 2, zzz: null },
]);

describe('wordbooks.applyMutate：未知键原样保留（丢用户词 = 不可逆）', () => {
  it('字符串分支逐字落库：从 dataJson 起合并 ⇒ 未改动条目的序列化一字不差', async () => {
    const uid = await makeUser('10', seeded);
    const r = await db.wordbooks.applyMutate(
      uid,
      (cur) => {
        const list = JSON.parse(String(cur.dataJson)) as Array<Record<string, unknown>>;
        list.push({ word: 'cat', mine: [1, 2, 3] });
        return { data: JSON.stringify(list) };
      },
      T0 + 12,
    );
    expect(r.wrote).toBe(true);
    const after = rawData(uid);
    for (const piece of [
      '{"word":"apple","addedAt":1700000000001,"colins":5,"myNote":{"备注":"中文键","tags":["a","b"]}}',
      '{"word":"bear","reviewCount":2,"zzz":null}',
    ]) {
      expect(after).toContain(piece);
    }
    expect(after).toContain('"mine":[1,2,3]');
    expect(JSON.parse(after)).toHaveLength(3);
  });

  it('数组分支也只是 JSON.stringify：本方法不校验、不排序、不裁键', async () => {
    const uid = await makeUser('11', seeded);
    await db.wordbooks.applyMutate(uid, () => ({ data: JSON.parse(seeded) as WordbookEntry[] }), T0 + 13);
    expect(rawData(uid)).toBe(seeded);
  });

  it('planWordbookMutate / wordbookCurrentOf：两驱动共用的那一份决策', () => {
    const cur: WordbookCurrent = wordbookCurrentOf({ data: seeded, sync_version: 7, updated_at: T0, tombstones: '{"x":1}' });
    expect(cur.exists).toBe(true);
    expect(cur.sync_version).toBe(7);
    expect(cur.tombstones).toBe('{"x":1}');
    expect(cur.entries?.map((e) => e.word)).toEqual(['apple', 'bear']);
    expect(planWordbookMutate(cur, { data: seeded })).toMatchObject({ changed: false, version: 7, tombstones: '{"x":1}' });
    expect(planWordbookMutate(cur, { data: seeded, tombstones: '{}' })).toMatchObject({ changed: true, version: 8 });
    expect(planWordbookMutate(cur, { data: [], value: '清空' })).toMatchObject({ changed: true, version: 8, value: '清空' });
    expect(() => planWordbookMutate(cur, undefined as unknown as WordbookPatch)).toThrow(/必须返回/);
    expect(wordbookCurrentOf(undefined)).toEqual({
      exists: false,
      dataJson: null,
      entries: null,
      sync_version: 0,
      tombstones: '[]',
      updated_at: null,
    });
    expect(planWordbookMutate(wordbookCurrentOf(undefined), { data: '[]' }).changed).toBe(false);
    expect(planWordbookMutate(wordbookCurrentOf(undefined), { data: [{ word: 'a' }] }).version).toBe(1);
  });
});

/* ══════════════════════ 7：pg 侧语义一致（语句桩 + CI 真库）══════════════════════ */

interface PgRow {
  data: string;
  sync_version: number;
  updated_at: number;
  tombstones: string;
}

/**
 * 最小 pg 桩：只认 `PostgresWordbookDB.applyMutate()` 实际发出的那几条语句，**认不出来就抛** ——
 * 桩不许把"驱动其实没这么写"糊过去；事务边界（读必须在 BEGIN 之后、写在 COMMIT 之前）本身也是断言。
 * 它是**语句与参数级**证据，不是 pg 行为仿真：真库那一跑在下面 `DATABASE_URL_TEST` 那条用例里，
 * 本机没有实例 ⇒ 显式 SKIP（A-18-3：CI 必须真跑 pg）。
 */
function createPgStub(initial: PgRow | null): {
  pool: pg.Pool;
  log: { sql: string[]; committed: boolean; rolledBack: boolean };
  row: () => PgRow | null;
} {
  const log = { sql: [] as string[], committed: false, rolledBack: false };
  let row: PgRow | null = initial === null ? null : { ...initial };
  let inTx = false;
  const client = {
    query: async (text: string, params?: unknown[]) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      log.sql.push(sql);
      if (sql === 'BEGIN') {
        inTx = true;
        return { rows: [] };
      }
      if (sql === 'COMMIT') {
        inTx = false;
        log.committed = true;
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        inTx = false;
        log.rolledBack = true;
        row = initial === null ? null : { ...initial };
        return { rows: [] };
      }
      if (/^SELECT data, sync_version, updated_at, tombstones FROM wordbooks WHERE user_id = \$1 FOR UPDATE$/.test(sql)) {
        if (!inTx) throw new Error('桩：读当前行必须在事务内（FOR UPDATE 要行锁）');
        return { rows: row ? [{ ...row }] : [] };
      }
      if (/^INSERT INTO wordbooks \(user_id, data, updated_at\) VALUES \(\$1, \$2, \$3\)$/.test(sql)) {
        const [, data, updated_at] = params as [number, string, number];
        row = { data, sync_version: 0, updated_at, tombstones: '[]' };
        return { rows: [] };
      }
      if (
        /^UPDATE wordbooks SET data = \$1, tombstones = \$2, updated_at = \$3, sync_version = sync_version \+ 1 WHERE user_id = \$4$/.test(
          sql,
        )
      ) {
        if (!row) throw new Error('桩：UPDATE 一个不存在的行');
        const [data, tombstones, updated_at] = params as [string, string, number];
        row = { data, tombstones, updated_at, sync_version: row.sync_version + 1 };
        return { rows: [] };
      }
      if (/^INSERT INTO fsrs_cards/.test(sql)) return { rows: [] };
      throw new Error(`桩不认的 SQL：${sql}`);
    },
    release: (): void => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
    end: async () => undefined,
  } as unknown as pg.Pool;
  return { pool, log, row: () => (row === null ? null : { ...row }) };
}

/** 两驱动共用的一组场景：同一个 `user_id = 1` 的写序列，返回值序列与落库内容必须逐字相同。 */
const SCENARIOS: Array<{ name: string; run: (target: MutateTarget) => Promise<unknown[]> }> = [
  {
    name: '加词 → 再加词 → 重放第二次 → 删词并写墓碑',
    run: async (target) => [
      await target.applyMutate(1, () => ({ data: [{ word: 'apple', addedAt: T0 }] }), T0 + 41),
      await target.applyMutate(1, (c) => ({ data: [...(c.entries ?? []), { word: 'bear' }] }), T0 + 42),
      await target.applyMutate(1, (c) => ({ data: c.dataJson ?? '[]' }), T0 + 43),
      await target.applyMutate(
        1,
        (c) => ({
          data: (c.entries ?? []).filter((e) => e.word !== 'apple'),
          tombstones: JSON.stringify({ apple: T0 }),
        }),
        T0 + 44,
      ),
    ],
  },
  {
    name: '只动墓碑列（data 不变）→ 再写回同样的墓碑（幂等）',
    run: async (target) => [
      await target.applyMutate(1, (c) => ({ data: c.dataJson ?? '[]', tombstones: '{"cat":1}' }), T0 + 45),
      await target.applyMutate(1, (c) => ({ data: c.dataJson ?? '[]', tombstones: c.tombstones }), T0 + 46),
    ],
  },
];

describe('wordbooks.applyMutate：pg 侧语义一致', () => {
  it('事务边界：BEGIN → SELECT … FOR UPDATE（行锁）→ UPDATE → COMMIT', async () => {
    const stub = createPgStub({ data: '[]', sync_version: 0, updated_at: T0, tombstones: '[]' });
    const r = await new PostgresAppDB(stub.pool).wordbooks.applyMutate<number>(
      42,
      (cur) => {
        expect(cur).toMatchObject({ exists: true, dataJson: '[]', sync_version: 0, tombstones: '[]' });
        return { data: [{ word: 'apple' }], value: 7 };
      },
      T0 + 20,
    );
    expect(r).toEqual({ value: 7, version: 1, wrote: true });
    expect(stub.log.sql.map((s) => (s.split(' ')[0] ?? '').toUpperCase())).toEqual([
      'BEGIN',
      'SELECT',
      'UPDATE',
      'INSERT',
      'COMMIT',
    ]);
    expect(stub.log.sql[1]).toMatch(/FOR UPDATE$/);
    expect(stub.log.committed).toBe(true);
    expect(stub.log.rolledBack).toBe(false);
    expect(stub.row()).toEqual({ data: '[{"word":"apple"}]', sync_version: 1, updated_at: T0 + 20, tombstones: '[]' });
  });

  it('载荷逐字相同 ⇒ 不发 UPDATE、版本不动（与 sqlite 同一条幂等规则：共用 planWordbookMutate）', async () => {
    const stub = createPgStub({ data: '[{"word":"apple"}]', sync_version: 5, updated_at: T0, tombstones: '[]' });
    const r = await new PostgresAppDB(stub.pool).wordbooks.applyMutate(
      42,
      (cur) => ({ data: cur.dataJson ?? '[]' }),
      T0 + 21,
    );
    expect(r).toMatchObject({ version: 5, wrote: false });
    expect(stub.log.sql.some((s) => s.startsWith('UPDATE wordbooks'))).toBe(false);
    expect(stub.row()?.sync_version).toBe(5);
  });

  it('回调抛错 ⇒ ROLLBACK 且不发 COMMIT', async () => {
    const stub = createPgStub({ data: '[{"word":"apple"}]', sync_version: 5, updated_at: T0, tombstones: '[]' });
    await expect(
      new PostgresAppDB(stub.pool).wordbooks.applyMutate(42, () => {
        throw new Error('投影失败');
      }, T0 + 22),
    ).rejects.toThrow(/投影失败/);
    expect(stub.log.committed).toBe(false);
    expect(stub.log.rolledBack).toBe(true);
    expect(stub.row()?.data).toBe('[{"word":"apple"}]');
  });

  it('同一组场景在两驱动上：返回值序列与落库内容逐字相同', async () => {
    const sqlite = await openMigratedSqlite('parity.db');
    const pgStub = createPgStub({ data: '[]', sync_version: 0, updated_at: T0, tombstones: '[]' });
    const pgDb = new PostgresAppDB(pgStub.pool);
    try {
      sqlite.db
        .prepare('INSERT INTO users (id, phone, created_at) VALUES (1, ?, ?)')
        .run('13920000001', T0);
      sqlite.db.prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (1, ?, ?)').run('[]', T0);
      for (const scenario of SCENARIOS) {
        const sqliteSteps = await scenario.run(sqlite.wordbooks);
        const pgSteps = await scenario.run(pgDb.wordbooks);
        expect(pgSteps, scenario.name).toEqual(sqliteSteps);
        const sqliteData = sqlite.db.prepare('SELECT data, tombstones FROM wordbooks WHERE user_id = 1').get() as Record<
          string,
          unknown
        >;
        expect(pgStub.row()?.data).toBe(String(sqliteData.data));
        expect(pgStub.row()?.tombstones).toBe(String(sqliteData.tombstones));
        expect(pgStub.row()?.sync_version).toBe(rawVersion(sqlite, 1));
      }
    } finally {
      await sqlite.close();
    }
  });

  it('本机无 PG 实例时显式 SKIP 并打印原因（A-18-3：CI 必须真跑 pg）', async () => {
    if (PG_URL !== '') {
      expect(PG_URL).toMatch(/^postgres(ql)?:\/\//);
      const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: 5_000, max: 2 });
      const app = new PostgresAppDB(pool);
      try {
        await app.init();
        await new MigrationRunner(ALL_MIGRATIONS, pgMigrationContext(pool)).apply({});
        const uid = await app.users.createWithPassword('13910000001', hashOf('pg-rmw'), 1, T0);
        const first = await app.wordbooks.applyMutate(uid, () => ({ data: [{ word: 'apple' }] }), T0 + 30);
        expect(first).toEqual({ value: undefined, version: 1, wrote: true });
        const again = await app.wordbooks.applyMutate(uid, (cur) => ({ data: cur.dataJson ?? '[]' }), T0 + 31);
        expect(again).toMatchObject({ version: 1, wrote: false });
        expect(await app.wordbooks.getData(uid)).toEqual([{ word: 'apple' }]);
        const withTombstone = await app.wordbooks.applyMutate(
          uid,
          () => ({ data: [] as WordbookEntry[], tombstones: JSON.stringify({ apple: T0 }) }),
          T0 + 32,
        );
        expect(withTombstone).toMatchObject({ version: 2, wrote: true });
        expect((await app.wordbooks.getSyncState(uid))?.tombstones).toBe(JSON.stringify({ apple: T0 }));
      } finally {
        await app.close();
      }
      return;
    }
    console.warn(
      '[SKIP] pg 真库用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。' +
        ' 上面四条是语句桩给的等效证据（事务边界 + 参数 + 与 sqlite 的逐字对账），' +
        'CI（T-22）必须带 DATABASE_URL_TEST 真跑这一条。',
    );
    expect(PG_URL).toBe('');
  });
});
