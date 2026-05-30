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

// ===== 查单词（有道翻译 + 词典） =====
const crypto = require('crypto');
const YOUDAO_APP_KEY = '115fb00277c7315b';
const YOUDAO_SECRET = 'EI7VnZNuHkft9z9ihlVXnInCV09Kjc7D';

app.get('/api/lookup', async (req, res) => {
  const word = (req.query.word || '').trim();
  if (!word) return res.status(400).json({ error: '请输入单词' });

  // 并行请求有道翻译和词典 API
  const youdaoPromise = (async () => {
    const salt = String(Date.now());
    const curtime = String(Math.floor(Date.now() / 1000));
    const input = word.length <= 20 ? word : word.slice(0, 10) + word.length + word.slice(-10);
    const sign = crypto.createHash('sha256')
      .update(YOUDAO_APP_KEY + input + salt + curtime + YOUDAO_SECRET)
      .digest('hex');
    const params = new URLSearchParams({ q: word, from: 'en', to: 'zh-CHS', appKey: YOUDAO_APP_KEY, salt, sign, signType: 'v3', curtime });
    const resp = await fetch('https://openapi.youdao.com/api?' + params.toString());
    return resp.json();
  })();

  const dictPromise = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

  try {
    const [youdao, dict] = await Promise.all([youdaoPromise, dictPromise]);

    if (youdao.errorCode && youdao.errorCode !== '0') {
      return res.status(500).json({ error: '查询失败' });
    }

    let phonetic = '';
    let speaksUrl = youdao.speakUrl || '';
    let definitions = [];

    if (dict && dict[0]) {
      const entry = dict[0];
      phonetic = entry.phonetic || (entry.phonetics?.find(p => p.text)?.text) || '';
      speaksUrl = speaksUrl || entry.phonetics?.find(p => p.audio)?.audio || '';
      definitions = (entry.meanings || []).flatMap(m =>
        m.definitions.slice(0, 2).map(d => ({
          pos: m.partOfSpeech,
          def: d.definition,
          example: d.example || '',
        }))
      );
    }

    res.json({
      word,
      phonetic,
      translation: youdao.translation?.[0] || '',
      definitions,
      speaksUrl,
    });
  } catch {
    res.status(500).json({ error: '网络错误' });
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
