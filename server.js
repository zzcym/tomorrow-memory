const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'vocab-app-secret-' + Date.now();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 数据库初始化
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wordbooks (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 认证中间件
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名需 2-20 个字符' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)').run(username, hash, Date.now());
  db.prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, '[]', Date.now());

  const token = jwt.sign({ id: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

// 获取单词本
app.get('/api/wordbook', auth, (req, res) => {
  const row = db.prepare('SELECT data FROM wordbooks WHERE user_id = ?').get(req.userId);
  res.json({ data: row ? JSON.parse(row.data) : [] });
});

// 保存单词本
app.put('/api/wordbook', auth, (req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: '数据格式错误' });
  db.prepare('UPDATE wordbooks SET data = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(data), Date.now(), req.userId);
  res.json({ ok: true });
});

// 获取用户名
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ username: user.username });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
