// 在生产服务器上创建/更新用户(13870095295,密码 tm5295)——由本地推送执行
const Database = require('better-sqlite3');
const db = new Database('/opt/tomorrow-memory/data.db');
const hash = '$2a$10$02/tLgw6FPOEKOrOLXMxluSoFVJ9ZkZG3LwYj.WjDzYbV4mDlSOXm';
const now = Date.now();
const exist = db.prepare('SELECT id FROM users WHERE phone = ?').get('13870095295');
let id;
if (exist) {
  id = exist.id;
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, id);
  console.log('existing user updated, id=' + id);
} else {
  const r = db.prepare('INSERT INTO users (phone, password, created_at) VALUES (?, ?, ?)').run('13870095295', hash, now);
  id = Number(r.lastInsertRowid);
  console.log('user created, id=' + id);
}
db.prepare(
  `INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES (?, '', NULL, 10, ?)
   ON CONFLICT (user_id) DO NOTHING`,
).run(id, now);
console.log('profile ensured');
console.log('done');
