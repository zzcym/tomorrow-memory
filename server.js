const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 数据库初始化
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wordbooks (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ===== 验证码存储（内存，重启清空） =====
const codeStore = new Map(); // phone -> { code, expires, attempts }

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeCode(phone, code) {
  codeStore.set(phone, { code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
}

function verifyCode(phone, code) {
  const record = codeStore.get(phone);
  if (!record) return false;
  if (Date.now() > record.expires) {
    codeStore.delete(phone);
    return false;
  }
  record.attempts++;
  if (record.attempts > 5) {
    codeStore.delete(phone);
    return false;
  }
  return record.code === code;
}

function consumeCode(phone) {
  codeStore.delete(phone);
}

// ===== 短信发送接口（预留） =====
// 把这里的实现替换为你的短信服务商即可
async function sendSMS(phone, code) {
  // 开发阶段：验证码打印到控制台
  console.log(`[DEV] 验证码发送至 ${phone}: ${code}`);
  // --- 示例：阿里云短信 ---
  // const Core = require('@alicloud/pop-core');
  // const client = new Core({ ... });
  // await client.request('SendSms', { PhoneNumbers: phone, SignName: '你的签名', TemplateCode: 'SMS_xxx', TemplateParam: JSON.stringify({ code }) });
  // --- 示例：腾讯云短信 ---
  // const tencentcloud = require('tencentcloud-sdk-nodejs');
  // const client = new tencentcloud.sms.v20210111.Client({ ... });
  // await client.SendSms({ PhoneNumberSet: ['+86' + phone], SmsSdkAppId: 'xxx', SignName: '你的签名', TemplateId: 'xxx', TemplateParamSet: [code] });
  // --- 示例：云片 ---
  // const res = await fetch('https://sms.yunpian.com/v2/sms/single_send.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ apikey: 'xxx', mobile: phone, text: `【你的签名】你的验证码是${code}` }) });
  return true;
}

// ===== 认证中间件 =====
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

// 发送验证码
app.post('/api/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }

  // 防止 60 秒内重复发送
  const existing = codeStore.get(phone);
  if (existing && Date.now() - (existing.expires - 5 * 60 * 1000) < 60000) {
    return res.status(429).json({ error: '请 60 秒后再试' });
  }

  const code = generateCode();
  storeCode(phone, code);

  try {
    await sendSMS(phone, code);
    res.json({ ok: true });
  } catch {
    codeStore.delete(phone);
    res.status(500).json({ error: '验证码发送失败' });
  }
});

// 登录 / 注册（统一接口）
app.post('/api/login', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: '手机号和验证码不能为空' });
  if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ error: '手机号格式不正确' });

  // 调测阶段：万能验证码 12345
  if (code !== '12345') {
    if (!verifyCode(phone, code)) {
      return res.status(401).json({ error: '验证码错误或已过期' });
    }
    consumeCode(phone);
  }

  // 查找或创建用户
  let user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const result = db.prepare('INSERT INTO users (phone, created_at) VALUES (?, ?)').run(phone, Date.now());
    db.prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, '[]', Date.now());
    user = { id: result.lastInsertRowid };
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, phone });
});

// ===== 离线词典（ECDICT SQLite） =====
const dictDb = new Database(path.join(__dirname, 'stardict.db'), { readonly: true });

function parseTranslation(trans) {
  // 解析 "n. 冲突, 矛盾\nvi. 争执, 抵触\n[计] 冲突" 格式
  if (!trans) return [];
  const groups = [];
  const lines = trans.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const m = line.match(/^(\[?\w+\]?\.?)\s*(.+)/);
    if (m) {
      groups.push({ pos: m[1].trim(), meanings: m[2].split(/[,;，；]/).map(s => s.trim()).filter(Boolean) });
    } else {
      // 无法解析的，整体作为一个释义
      if (groups.length === 0) groups.push({ pos: '', meanings: [line.trim()] });
    }
  }
  return groups;
}

function parseExchange(ex) {
  // 解析 "s:conflicts/p:conflicted/i:conflicting/3:conflicts/d:conflicted"
  if (!ex) return {};
  const result = {};
  const parts = ex.split('/');
  const map = { s: 'plural', p: 'past', i: 'present', '3': 'third', d: 'pastParticiple', r: 'comparative', t: 'superlative', '0': 'base', '1': 'base' };
  for (const p of parts) {
    const [k, v] = p.split(':');
    if (k && v) result[map[k] || k] = v;
  }
  return result;
}

app.get('/api/lookup', (req, res) => {
  const word = (req.query.word || '').trim();
  if (!word) return res.status(400).json({ error: '请输入单词' });

  try {
    // 精确匹配 + 小写匹配
    let row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word);
    if (!row) {
      row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word.toLowerCase());
    }
    // 尝试 sw（简化词形）
    if (!row) {
      row = dictDb.prepare('SELECT * FROM stardict WHERE sw = ?').get(word.toLowerCase());
    }

    if (!row) {
      return res.json({
        word,
        phonetic: '',
        translation: '',
        groups: [],
        exchange: {},
        notFound: true,
      });
    }

    const groups = parseTranslation(row.translation);
    const exchange = parseExchange(row.exchange);
    const freq = row.collins || 0; // 柯林斯星级 1-5

    res.json({
      word: row.word,
      phonetic: (row.phonetic || '').replace(/^'|'$/g, ''),
      translation: row.translation,
      definition: row.definition || '',
      groups,
      exchange,
      freq,
      tag: row.tag || '',
      detail: row.detail || '',
      audio: row.audio || '',
    });
  } catch (err) {
    console.error('lookup error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});
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

// 获取当前用户
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT phone FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ phone: user.phone });
});

// ===== 后台管理 =====
const ADMIN_PASSWORD = 'admin888'; // 部署后请修改

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    if (!payload.admin) throw new Error();
    next();
  } catch {
    res.status(401).json({ error: '无权限' });
  }
}

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const usersToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE datetime(created_at/1000, 'unixepoch') >= date('now')").get().count;
  const totalWords = db.prepare('SELECT COUNT(*) as count FROM wordbooks').get().count;
  const avgWords = totalUsers > 0
    ? Math.round(db.prepare('SELECT AVG(json_array_length(data)) as avg FROM wordbooks').get().avg || 0)
    : 0;
  res.json({ totalUsers, usersToday, totalWords, avgWords });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const offset = (page - 1) * pageSize;
  const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const users = db.prepare(`
    SELECT u.id, u.phone, u.created_at,
      COALESCE(json_array_length(w.data), 0) as word_count,
      w.updated_at as last_active
    FROM users u
    LEFT JOIN wordbooks w ON w.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);
  // 手机号脱敏
  users.forEach(u => {
    if (u.phone && u.phone.length >= 7) {
      u.phone = u.phone.slice(0, 3) + '****' + u.phone.slice(-4);
    }
  });
  res.json({ total, page, pageSize, users });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
