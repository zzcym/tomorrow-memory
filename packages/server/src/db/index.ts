/**
 * 数据库工厂：根据 DB_DRIVER 返回 AppDB 实现
 */

import pg from 'pg';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
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
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
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
