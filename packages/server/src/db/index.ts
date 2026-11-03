/**
 * 数据库工厂：根据 DB_DRIVER 返回 AppDB 实现
 *
 * T-06 追加：`createMigrationContext(app)` —— 把 AppDB 适配成迁移上下文（§6.1 ①），
 * 只暴露 DDL 需要的五件事（exec / all / hasTable / hasColumn / withTransaction）+ `now()`。
 * 本文件不 import 迁移目录的运行器（依赖方向：scripts → migrations → db，单向不成环）。
 */

import pg from 'pg';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
import type { MigrationContext } from './migrations/index.js';
import { PostgresAppDB } from './pg.js';
import { SqliteAppDB } from './sqlite.js';
import type { AppDB } from './types.js';

let cached: AppDB | null = null;

/**
 * 获取 AppDB 单例。
 * @param reuse 为 true 时复用已有连接（服务进程内推荐）
 */
export function createAppDB(reuse = true): AppDB {
  if (reuse && cached) return cached;

  const config = loadConfig();
  let db: AppDB;

  if (config.dbDriver === 'pg') {
    // pg 驱动默认把 int8(BIGINT) 返回为字符串：时间戳列（created_at 等）经 new Date(字符串)
    // 会得到 Invalid Date 并在 toISOString() 处抛 "Invalid time value"。
    // 本应用时间戳均为毫秒（远小于 2^53），全局按 Number 解析。
    pg.types.setTypeParser(20, (v: string) => Number(v));
    // Phase 6：连接池调优（max=20 可配置，idle 30s 回收）
    const poolMax = Number(process.env.PG_POOL_MAX) || 20;
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    // 空闲连接出错（PG 重启/网络抖动）若无人监听会以未捕获异常击穿进程
    pool.on('error', (err) => {
      console.warn('[DB] PostgreSQL 连接池错误（空闲客户端）:', err.message);
    });
    db = new PostgresAppDB(pool);
  } else {
    const sqlite = new Database(config.sqlitePath);
    db = new SqliteAppDB(sqlite);
  }

  if (reuse) cached = db;
  return db;
}

/** 测试/脚本场景：显式关闭缓存并重建（切换驱动后使用） */
export function resetAppDB(): void {
  cached = null;
}

/* ══════════════════════ T-06：迁移上下文（§6.1 ①） ══════════════════════ */

/**
 * 把 AppDB 适配成 `MigrationContext`。
 * 时间戳唯一来源是 `Date.now()`（§6.2 漂移 3：两驱动不得各用库内时间函数）。
 * @throws 未知实现（既非 SqliteAppDB 也非 PostgresAppDB）
 */
export function createMigrationContext(app: AppDB): MigrationContext {
  if (app instanceof SqliteAppDB) return sqliteMigrationContext(app.db);
  if (app instanceof PostgresAppDB) return pgMigrationContext(app.pool);
  throw new Error('createMigrationContext: 未知 AppDB 实现（既非 SqliteAppDB 也非 PostgresAppDB）');
}

/** better-sqlite3 版（同步内核，对外仍包成 Promise 以对齐接口） */
export function sqliteMigrationContext(db: Database.Database): MigrationContext {
  return {
    driver: 'sqlite',
    exec: (sql: string) => {
      db.exec(sql);
      return Promise.resolve();
    },
    all: <T,>(sql: string, params: unknown[] = []) =>
      Promise.resolve(db.prepare(sql).all(...(params as never[])) as T[]),
    hasTable: (name: string) =>
      Promise.resolve(
        !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name),
      ),
    hasColumn: (table: string, column: string) =>
      Promise.resolve(
        (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
          (c) => c.name === column,
        ),
      ),
    withTransaction: (statements: string[], ledgerName: string, appliedAt: number) => {
      const tx = db.transaction((stmts: string[], lname: string, at: number) => {
        for (const sql of stmts) db.exec(sql);
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?) ON CONFLICT (name) DO NOTHING').run(
          lname,
          at,
        );
      });
      // BEGIN IMMEDIATE：两个进程同时 migrate 时后启动者拿到 SQLITE_BUSY 而不是"加了一半列"
      return Promise.resolve(tx.immediate(statements, ledgerName, appliedAt));
    },
    now: () => Date.now(),
  };
}

/** pg 版：一条迁移 = 一个 BEGIN/COMMIT，失败整体回滚 */
export function pgMigrationContext(pool: pg.Pool): MigrationContext {
  return {
    driver: 'pg',
    exec: async (sql: string) => {
      await pool.query(sql);
    },
    // 不加泛型实参：pg 的 QueryResultRow 约束与迁移用的行类型不兼容，交给 all<T> 的 T 断言
    all: async <T,>(sql: string, params: unknown[] = []) =>
      ((await pool.query(sql, params)).rows) as T[],
    hasTable: async (name: string) => {
      const r = await pool.query(
        'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1',
        [name],
      );
      return r.rows.length > 0;
    },
    hasColumn: async (table: string, column: string) => {
      const r = await pool.query(
        'SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2',
        [table, column],
      );
      return r.rows.length > 0;
    },
    withTransaction: async (statements: string[], ledgerName: string, appliedAt: number) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const sql of statements) await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name, applied_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [ledgerName, appliedAt],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    now: () => Date.now(),
  };
}
