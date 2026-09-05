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
