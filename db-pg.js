// PostgreSQL 适配器 —— 替换 data.db（用户数据），保留 SQLite 给词典
const { Pool } = require('pg');

// 连接优先级：环境变量 > 默认本地连接
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://tm_user:tm_pass_2024@localhost:5432/tomorrow_memory';

const pool = new Pool({
  connectionString: DATABASE_URL,
  // 连接池大小
  max: 10,
  // 闲置连接 30s 后关闭
  idleTimeoutMillis: 30000,
});

// 初始化表结构
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(11) UNIQUE NOT NULL,
      password TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wordbooks (
      user_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '[]',
      updated_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      daily_goal INTEGER DEFAULT 10,
      updated_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkin_logs (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, date)
    )
  `);
  console.log('[PG] Tables initialized');
}

// 简易查询包装
async function get(sql, ...params) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

async function all(sql, ...params) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function run(sql, ...params) {
  const result = await pool.query(sql, params);
  return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id ?? null };
}

// 插入用户 + 默认 wordbook + profile（事务）
async function createUser(phone, now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(
      'INSERT INTO users (phone, created_at) VALUES ($1, $2) RETURNING id',
      [phone, now]
    );
    const userId = user.rows[0].id;
    await client.query(
      'INSERT INTO wordbooks (user_id, data, updated_at) VALUES ($1, $2, $3)',
      [userId, '[]', now]
    );
    await client.query(
      'INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES ($1, $2, $3, $4)',
      [userId, '', '', now]
    );
    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 连续打卡天数
async function getStreak(userId) {
  const rows = await all(
    'SELECT date FROM checkin_logs WHERE user_id = $1 ORDER BY date DESC',
    userId
  );
  let streak = 0;
  for (let i = 0; i < rows.length; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const expected = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (rows[i].date === expected) streak++;
    else break;
  }
  return streak;
}

// 关闭连接池
async function close() {
  await pool.end();
}

module.exports = { initTables, get, all, run, createUser, getStreak, close, pool };
