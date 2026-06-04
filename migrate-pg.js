// 将 SQLite data.db 的用户数据迁移到 PostgreSQL
// 使用方式: node migrate-pg.js

const Database = require('better-sqlite3');
const path = require('path');
const pg = require('./db-pg');

const SQLITE_PATH = path.join(__dirname, 'data.db');

async function main() {
  console.log('=== SQLite → PostgreSQL Migration ===\n');

  // 1. 连接 SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  sqlite.pragma('journal_mode = WAL');
  // 合并 WAL，确保读到最新数据
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  console.log('[SQLite] Connected');

  // 2. 初始化 PostgreSQL 表
  await pg.initTables();
  console.log('[PG] Tables ready');

  // 3. 迁移 users
  const users = sqlite.prepare('SELECT * FROM users').all();
  console.log(`[Migrate] users: ${users.length} rows`);
  for (const u of users) {
    try {
      // 使用 UPSERT 防止重复迁移
      await pg.run(
        `INSERT INTO users (id, phone, password, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           phone = EXCLUDED.phone,
           password = EXCLUDED.password`,
        u.id, u.phone, u.password || null, u.created_at
      );
    } catch (err) {
      console.error(`  [ERROR] user ${u.id} (${u.phone}): ${err.message}`);
    }
  }

  // 4. 迁移 wordbooks
  const wordbooks = sqlite.prepare('SELECT * FROM wordbooks').all();
  console.log(`[Migrate] wordbooks: ${wordbooks.length} rows`);
  for (const w of wordbooks) {
    try {
      await pg.run(
        `INSERT INTO wordbooks (user_id, data, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        w.user_id, w.data, w.updated_at
      );
    } catch (err) {
      console.error(`  [ERROR] wordbook ${w.user_id}: ${err.message}`);
    }
  }

  // 5. 迁移 profiles
  const profiles = sqlite.prepare('SELECT * FROM profiles').all();
  console.log(`[Migrate] profiles: ${profiles.length} rows`);
  for (const p of profiles) {
    try {
      await pg.run(
        `INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           avatar = EXCLUDED.avatar,
           daily_goal = EXCLUDED.daily_goal,
           updated_at = EXCLUDED.updated_at`,
        p.user_id, p.nickname || '', p.avatar || '', p.daily_goal ?? 10, p.updated_at
      );
    } catch (err) {
      console.error(`  [ERROR] profile ${p.user_id}: ${err.message}`);
    }
  }

  // 6. 迁移 checkin_logs
  const checkins = sqlite.prepare('SELECT * FROM checkin_logs').all();
  console.log(`[Migrate] checkin_logs: ${checkins.length} rows`);
  for (const c of checkins) {
    try {
      await pg.run(
        `INSERT INTO checkin_logs (user_id, date, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, date) DO NOTHING`,
        c.user_id, c.date, c.created_at
      );
    } catch (err) {
      console.error(`  [ERROR] checkin ${c.user_id} ${c.date}: ${err.message}`);
    }
  }

  // 7. 验证
  console.log('\n=== Verification ===');
  const pgUsers = await pg.all('SELECT COUNT(*) as c FROM users');
  const pgWb = await pg.all('SELECT COUNT(*) as c FROM wordbooks');
  const pgPf = await pg.all('SELECT COUNT(*) as c FROM profiles');
  const pgCl = await pg.all('SELECT COUNT(*) as c FROM checkin_logs');
  console.log(`  users:         ${pgUsers[0].c}`);
  console.log(`  wordbooks:     ${pgWb[0].c}`);
  console.log(`  profiles:      ${pgPf[0].c}`);
  console.log(`  checkin_logs:  ${pgCl[0].c}`);

  // 8. 同步序列（让 id 自增从最大值继续）
  await pg.run("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 0))");

  sqlite.close();
  await pg.close();
  console.log('\n=== Migration complete! ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
