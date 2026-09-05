/**
 * 数据迁移脚本：
 *  1. 若存在旧版 SQLite data.db 且当前驱动为 pg —— 将用户数据迁移到 PostgreSQL（幂等 UPSERT）
 *  2. 初始化 fsrs_cards / tutor_cache 表（db.init 已含）
 *  3. 为所有单词本中的单词初始化 FSRS 默认卡片
 *
 * 用法：pnpm --filter @tm/server migrate
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type pg from 'pg';
import type { WordbookEntry } from '@tm/shared';
import { loadConfig } from '../config.js';
import { createAppDB } from '../db/index.js';
import { initFsrsCards } from './init-fsrs.js';

interface OldUserRow {
  id: number;
  phone: string;
  password: string | null;
  created_at: number;
}

interface OldWordbookRow {
  user_id: number;
  data: string;
  updated_at: number;
}

interface OldProfileRow {
  user_id: number;
  nickname: string;
  avatar: string;
  daily_goal: number | null;
  updated_at: number;
}

interface OldCheckinRow {
  user_id: number;
  date: string;
  created_at: number;
}

/** 从旧 data.db 读取全部用户数据 */
function readLegacySqlite(dbPath: string): {
  users: OldUserRow[];
  wordbooks: OldWordbookRow[];
  profiles: OldProfileRow[];
  checkins: OldCheckinRow[];
} | null {
  if (!fs.existsSync(dbPath)) return null;
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('wal_checkpoint(TRUNCATE)');

    const hasTables = (name: string): boolean => {
      const row = sqlite
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
        .get(name) as { ok: number } | undefined;
      return !!row;
    };

    return {
      users: hasTables('users') ? (sqlite.prepare('SELECT * FROM users').all() as OldUserRow[]) : [],
      wordbooks: hasTables('wordbooks')
        ? (sqlite.prepare('SELECT * FROM wordbooks').all() as OldWordbookRow[])
        : [],
      profiles: hasTables('profiles')
        ? (sqlite.prepare('SELECT * FROM profiles').all() as OldProfileRow[])
        : [],
      checkins: hasTables('checkin_logs')
        ? (sqlite.prepare('SELECT * FROM checkin_logs').all() as OldCheckinRow[])
        : [],
    };
  } finally {
    sqlite.close();
  }
}

async function migrateLegacyToPg(dbPath: string): Promise<void> {
  const legacy = readLegacySqlite(dbPath);
  if (!legacy) {
    console.log('[Migrate] 未找到旧版 data.db，跳过用户数据迁移');
    return;
  }

  const db = createAppDB();

  console.log(`[Migrate] users: ${legacy.users.length}`);
  for (const u of legacy.users) {
    try {
      const existing = await db.users.findById(u.id);
      if (existing) {
        if (u.password && existing.password !== u.password) {
          await db.users.updatePassword(u.id, u.password);
        }
        continue;
      }
      // 通过直接 SQL 保留原 id（AppDB 未暴露按 id 插入，走底层 pool）
      await insertUserWithId(db, u);
    } catch (err) {
      console.error(`  [ERROR] user ${u.id} (${u.phone}): ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] wordbooks: ${legacy.wordbooks.length}`);
  for (const w of legacy.wordbooks) {
    try {
      await db.wordbooks.saveData(w.user_id, safeParse(w.data), w.updated_at);
    } catch (err) {
      console.error(`  [ERROR] wordbook ${w.user_id}: ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] profiles: ${legacy.profiles.length}`);
  for (const p of legacy.profiles) {
    try {
      await db.profiles.update(
        p.user_id,
        { nickname: p.nickname || undefined, avatar: p.avatar || undefined, daily_goal: p.daily_goal ?? undefined },
        p.updated_at,
      );
      await db.profiles.ensure(p.user_id);
    } catch (err) {
      console.error(`  [ERROR] profile ${p.user_id}: ${(err as Error).message}`);
    }
  }

  console.log(`[Migrate] checkin_logs: ${legacy.checkins.length}`);
  for (const c of legacy.checkins) {
    try {
      await db.checkins.checkin(c.user_id, c.date, c.created_at);
    } catch (err) {
      console.error(`  [ERROR] checkin ${c.user_id} ${c.date}: ${(err as Error).message}`);
    }
  }

  await resetUserSequence(db);
  await db.close();
  console.log('[Migrate] 用户数据迁移完成');
}

/** 兼容旧 migrate-pg.js：保留原 id 插入用户（通过 pg 底层 pool 直接执行） */
async function insertUserWithId(
  db: Awaited<ReturnType<typeof createAppDB>>,
  u: OldUserRow,
): Promise<void> {
  // AppDB 不暴露按 id 创建用户（createUser 自增），此处直接执行底层 SQL
  const pool = (db as unknown as { pool?: pg.Pool }).pool;
  if (pool) {
    await pool.query(
      `INSERT INTO users (id, phone, password, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, password = EXCLUDED.password`,
      [u.id, u.phone, u.password ?? null, u.created_at],
    );
  } else {
    // SQLite 目标：直接使用 db.users.findByPhone 检查，通过 createUser 创建
    const existing = await db.users.findByPhone(u.phone);
    if (!existing) {
      await db.createUser(u.phone, u.created_at);
    }
  }
}

/** 显式 id 插入后必须重置序列，否则迁移后第一个新用户注册撞主键（注册功能瘫痪） */
async function resetUserSequence(db: Awaited<ReturnType<typeof createAppDB>>): Promise<void> {
  const pool = (db as unknown as { pool?: pg.Pool }).pool;
  if (!pool) return;
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1)
    )
  `);
  console.log('[Migrate] users_id_seq 序列已重置');
}

function safeParse(text: string): WordbookEntry[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? (v as WordbookEntry[]) : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  console.log('=== 数据迁移 ===');
  const config = loadConfig();
  const db = createAppDB();
  await db.init();
  console.log(`[DB] driver=${config.dbDriver}`);

  if (config.dbDriver === 'pg') {
    const legacyPath = path.join(config.dataDir, 'data.db');
    await migrateLegacyToPg(legacyPath);
  } else {
    console.log('[Migrate] SQLite 驱动：用户数据即当前库，无需迁移');
  }

  // FSRS 卡片初始化
  await initFsrsCards();
  await db.close();
  console.log('=== 迁移完成 ===');
}

main().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
