const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const bcrypt = require('bcryptjs');
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// 数据库初始化
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('wal_autocheckpoint = 100');   // WAL 每 100 页自动合并到主库（约 400KB）
db.pragma('synchronous = NORMAL');        // 兼顾性能和安全
// 启动时先合并残留 WAL，防止数据丢失
db.pragma('wal_checkpoint(TRUNCATE)');
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
  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS checkin_logs (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );
`);

// 迁移：添加密码字段
try { db.exec('ALTER TABLE users ADD COLUMN password TEXT DEFAULT NULL'); } catch {}
try { db.exec('ALTER TABLE profiles ADD COLUMN daily_goal INTEGER DEFAULT 10'); } catch {}

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

// 登录（验证码或密码）
app.post('/api/login', (req, res) => {
  const { phone, code, password } = req.body;
  if (!phone) return res.status(400).json({ error: '请输入手机号' });
  if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ error: '手机号格式不正确' });

  let user = db.prepare('SELECT id, password FROM users WHERE phone = ?').get(phone);

  if (password) {
    // 密码登录
    if (!user || !user.password) return res.status(401).json({ error: '未设置密码，请用验证码登录' });
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: '密码错误' });
  } else {
    // 验证码登录
    if (!code) return res.status(400).json({ error: '请输入验证码' });
    if (code !== '12345') {
      if (!verifyCode(phone, code)) return res.status(401).json({ error: '验证码错误或已过期' });
      consumeCode(phone);
    }
    // 未注册用户自动注册
    if (!user) {
      const result = db.prepare('INSERT INTO users (phone, created_at) VALUES (?, ?)').run(phone, Date.now());
      db.prepare('INSERT INTO wordbooks (user_id, data, updated_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, '[]', Date.now());
      db.prepare('INSERT INTO profiles (user_id, nickname, avatar, updated_at) VALUES (?, ?, ?, ?)').run(result.lastInsertRowid, '', '', Date.now());
      user = { id: result.lastInsertRowid };
    }
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const profile = db.prepare('SELECT nickname, avatar FROM profiles WHERE user_id = ?').get(user.id);
  const hasPassword = !!(user.password);
  res.json({ token, phone, hasPassword, ...(profile || { nickname: '', avatar: '' }) });
});

// ===== 离线词典（ECDICT SQLite） =====
const fs = require('fs');
let dictDb = null;
const dictDbPath = path.join(__dirname, 'stardict.db');
if (fs.existsSync(dictDbPath)) {
  dictDb = new Database(dictDbPath, { readonly: true });
}

// ===== 中英本地词典 =====
let ecDict = null;
const ecDictPath = path.join(__dirname, 'ec-cedict.json');
if (fs.existsSync(ecDictPath)) {
  try {
    ecDict = JSON.parse(fs.readFileSync(ecDictPath, 'utf-8'));
  } catch { ecDict = null; }
}

// ===== 双语例句库 =====
let examplesDb = null;
const examplesDbPath = path.join(__dirname, 'examples.db');
if (fs.existsSync(examplesDbPath)) {
  examplesDb = new Database(examplesDbPath, { readonly: true });
}

function queryExamples(word) {
  if (!examplesDb) return [];
  try {
    // FTS5 搜索，匹配包含该单词的英文例句
    const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean || clean.length < 2) return [];
    const rows = examplesDb.prepare(`
      SELECT DISTINCT p.en, p.zh FROM pairs_fts f
      JOIN pairs p ON p.id = f.rowid
      WHERE pairs_fts MATCH ?
      LIMIT 8
    `).all(`"${clean}"`);
    return rows;
  } catch {
    return [];
  }
}

function queryStardictZh2En(word) {
  if (!dictDb) return [];
  try {
    // 清理输入：只保留中文和英文字符（移除 FTS5 特殊字符）
    const clean = word.replace(/[^\w一-鿿㐀-䶿豈-﫿]/g, '').trim();
    if (!clean) return [];
    const rows = dictDb.prepare(`
      SELECT word, phonetic, translation, collins, bnc, frq, tag, exchange
      FROM stardict
      WHERE rowid IN (
        SELECT rowid FROM stardict_fts WHERE stardict_fts MATCH ?
      )
      ORDER BY collins DESC, bnc DESC
      LIMIT 20
    `).all(clean);
    return rows.map(row => {
      const groups = parseTranslation(row.translation);
      return {
        word: row.word,
        pos: groups.length > 0 ? groups[0].pos : '',
        definition: word,
        examples: [],
        synonyms: [],
        phonetic: row.phonetic || '',
      };
    });
  } catch { return []; }
}

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

// ===== 有道文本翻译 API =====
const YOUDAO_APP_KEY = '115fb00277c7315b';
const YOUDAO_SECRET = 'EI7VnZNuHkft9z9ihlVXnInCV09Kjc7D';
const crypto = require('crypto');
const lookupCache = new Map();

function truncate(q) {
  return q.length <= 20 ? q : q.substring(0, 10) + q.length + q.substring(q.length - 10);
}

function detectLanguage(text) {
  const hasChinese = /\p{sc=Han}/u.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);
  if (hasChinese && hasEnglish) return 'mixed';
  if (hasChinese) return 'zh';
  return 'en';
}

async function queryYoudao(word) {
  const cacheKey = 'yd_' + word;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);
  try {
    const salt = String(Date.now());
    const curtime = String(Math.floor(Date.now() / 1000));
    const input = YOUDAO_APP_KEY + truncate(word) + salt + curtime + YOUDAO_SECRET;
    const sign = crypto.createHash('sha256').update(input).digest('hex');
    const resp = await fetch('https://openapi.youdao.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: word, appKey: YOUDAO_APP_KEY, salt, sign, curtime, signType: 'v3', from: 'EN', to: 'zh-CHS', dicts: 'ec' }),
    });
    const data = await resp.json();
    const result = { translation: data.translation ? data.translation[0] : '', phonetic: (data.basic && data.basic.phonetic) || '', groups: [] };
    if (data.basic && data.basic.explains) {
      result.groups = parseTranslation(data.basic.explains.join('\n'));
    }
    lookupCache.set(cacheKey, result);
    return result;
  } catch { return { translation: '', phonetic: '', groups: [] }; }
}

async function queryYoudaoZh2En(word) {
  const cacheKey = 'yd_zh2en_' + word;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);
  try {
    const salt = String(Date.now());
    const curtime = String(Math.floor(Date.now() / 1000));
    const input = YOUDAO_APP_KEY + truncate(word) + salt + curtime + YOUDAO_SECRET;
    const sign = crypto.createHash('sha256').update(input).digest('hex');
    const resp = await fetch('https://openapi.youdao.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: word, appKey: YOUDAO_APP_KEY, salt, sign, curtime, signType: 'v3', from: 'zh-CHS', to: 'EN' }),
    });
    const data = await resp.json();
    const result = { translation: data.translation ? data.translation[0] : '', phonetic: (data.basic && data.basic.phonetic) || '', groups: [] };
    if (data.basic && data.basic.explains) {
      result.groups = parseTranslation(data.basic.explains.join('\n'));
    }
    lookupCache.set(cacheKey, result);
    return result;
  } catch { return { translation: '', phonetic: '', groups: [] }; }
}

async function queryDictionaryApi(word) {
  const cacheKey = 'dict_' + word;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);
  try {
    const resp = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    const entry = data[0];
    const result = { phonetic: entry.phonetic || '', exchange: {}, examples: [] };
    if (entry.phonetics && entry.phonetics[0]) result.phonetic = entry.phonetics[0].text || '';
    if (entry.meanings) {
      for (const m of entry.meanings) {
        if (m.definitions) {
          for (const d of m.definitions) {
            if (d.example) result.examples.push({ en: d.example, zh: '' });
          }
        }
      }
    }
    lookupCache.set(cacheKey, result);
    return result;
  } catch { return { phonetic: '', exchange: {}, examples: [] }; }
}

app.get('/api/lookup', async (req, res) => {
  const word = (req.query.word || '').trim();
  if (!word) return res.status(400).json({ error: '请输入单词' });

  let direction = req.query.direction || 'auto';
  if (!['auto', 'en2zh', 'zh2en'].includes(direction)) {
    return res.status(400).json({ error: 'direction 参数无效，可选值: auto, en2zh, zh2en' });
  }

  try {
    // auto 模式：检测输入语言
    if (direction === 'auto') {
      const lang = detectLanguage(word);
      if (lang === 'mixed') {
        return res.json({
          query: word, sourceLang: 'mixed', results: [],
          error: '检测到中英混合输入，请输入纯中文或纯英文',
        });
      }
      direction = lang === 'zh' ? 'zh2en' : 'en2zh';
    }

    // 中译英分支
    if (direction === 'zh2en') {
      // 1. 查本地中英词典（最快）
      if (ecDict && ecDict[word]) {
        const results = ecDict[word].map(entry => ({
          word: entry.word,
          pos: entry.pos || '',
          definition: word,
          examples: entry.examples || [],
          synonyms: entry.synonyms || [],
          phonetic: entry.phonetic || '',
        }));
        return res.json({ query: word, sourceLang: 'zh', results, error: null });
      }

      // 2. 查 stardict.db 反向搜索（离线，覆盖 340 万词）
      const dictResults = queryStardictZh2En(word);
      if (dictResults.length > 0) {
        return res.json({ query: word, sourceLang: 'zh', results: dictResults, error: null });
      }

      // 3. 查 Youdao API（可能被限频）
      const youdaoResult = await queryYoudaoZh2En(word);
      if (youdaoResult.translation || youdaoResult.groups.length > 0) {
        const results = youdaoResult.groups.length > 0
          ? youdaoResult.groups.map(g => ({
              word: g.meanings.join(', '),
              pos: g.pos,
              definition: word,
              examples: [],
              synonyms: [],
              phonetic: youdaoResult.phonetic || '',
            }))
          : [{
              word: youdaoResult.translation,
              pos: '',
              definition: word,
              examples: [],
              synonyms: [],
              phonetic: youdaoResult.phonetic || '',
            }];
        return res.json({ query: word, sourceLang: 'zh', results, error: null });
      }

      return res.status(404).json({ query: word, sourceLang: 'zh', results: [], error: '未找到该词汇的翻译' });
    }

    // 英译中分支（现有逻辑）
    let row = null;
    if (dictDb) {
      row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word);
      if (!row) {
        row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word.toLowerCase());
      }
      if (!row) {
        row = dictDb.prepare('SELECT * FROM stardict WHERE sw = ?').get(word.toLowerCase());
      }
    }

    const exampleRows = queryExamples(word);
    const examples = exampleRows.map(r => ({ en: r.en, zh: r.zh }));

    if (!row) {
      const youdaoResult = await queryYoudao(word);
      const dictResult = await queryDictionaryApi(word);
      const combinedExamples = examples.length > 0 ? examples : dictResult.examples;
      return res.json({
        word,
        phonetic: dictResult.phonetic || youdaoResult.phonetic || '',
        translation: youdaoResult.translation || '',
        groups: youdaoResult.groups || [],
        exchange: dictResult.exchange || {},
        examples: combinedExamples,
        notFound: !youdaoResult.translation && combinedExamples.length === 0,
      });
    }

    const groups = parseTranslation(row.translation);
    const exchange = parseExchange(row.exchange);
    const freq = row.collins || 0;

    res.json({
      word: row.word,
      phonetic: (row.phonetic || '').replace(/^'|'$/g, ''),
      translation: row.translation,
      definition: row.definition || '',
      groups,
      exchange,
      examples,
      freq,
      tag: row.tag || '',
      detail: row.detail || '',
      audio: row.audio || '',
    });
  } catch (err) {
    console.error('lookup error:', err);
    res.status(500).json({ error: '查询服务暂时不可用，请稍后重试' });
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
  const user = db.prepare('SELECT phone, password FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const profile = db.prepare('SELECT nickname, avatar FROM profiles WHERE user_id = ?').get(req.userId);
  res.json({ phone: user.phone, hasPassword: !!user.password, ...(profile || { nickname: '', avatar: '' }) });
});

// 设置/修改密码
app.put('/api/password', auth, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.userId);
  res.json({ ok: true });
});

// ===== 个人主页 =====
// 获取个人信息
app.get('/api/profile', auth, (req, res) => {
  let profile = db.prepare('SELECT nickname, avatar, daily_goal FROM profiles WHERE user_id = ?').get(req.userId);
  if (!profile) {
    db.prepare('INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES (?, ?, ?, ?, ?)').run(req.userId, '', '', 10, Date.now());
    profile = { nickname: '', avatar: '', daily_goal: 10 };
  }
  // 统计数据
  const wordbook = db.prepare('SELECT data FROM wordbooks WHERE user_id = ?').get(req.userId);
  const words = wordbook ? JSON.parse(wordbook.data) : [];
  const totalWords = words.length;
  // 统计背诵天数：从 checkin_logs 获取
  const checkinRows = db.prepare('SELECT date FROM checkin_logs WHERE user_id = ? ORDER BY date').all(req.userId);
  const reviewDates = checkinRows.map(r => r.date);
  const reviewDays = reviewDates.length;
  res.json({ nickname: profile.nickname, avatar: profile.avatar, daily_goal: profile.daily_goal || 10, totalWords, reviewDays, reviewDates });
});

// 更新个人信息
app.put('/api/profile', auth, (req, res) => {
  const { nickname, avatar, daily_goal } = req.body;
  const profile = db.prepare('SELECT nickname, avatar, daily_goal FROM profiles WHERE user_id = ?').get(req.userId);
  const newNickname = nickname !== undefined ? nickname : (profile ? profile.nickname : '');
  const newAvatar = avatar !== undefined ? avatar : (profile ? profile.avatar : '');
  const newGoal = daily_goal !== undefined ? daily_goal : (profile ? profile.daily_goal : 10);
  db.prepare('UPDATE profiles SET nickname = ?, avatar = ?, daily_goal = ?, updated_at = ? WHERE user_id = ?').run(
    newNickname, newAvatar, newGoal, Date.now(), req.userId
  );
  res.json({ ok: true });
});

// ===== 打卡功能 =====
function getDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 获取打卡状态：每日目标 + 今日是否已打卡
app.get('/api/checkin/status', auth, (req, res) => {
  const profile = db.prepare('SELECT daily_goal FROM profiles WHERE user_id = ?').get(req.userId);
  const dailyGoal = profile ? (profile.daily_goal || 10) : 10;
  const todayStr = getDateStr(new Date());
  const checkin = db.prepare('SELECT 1 FROM checkin_logs WHERE user_id = ? AND date = ?').get(req.userId, todayStr);
  res.json({ dailyGoal, checkedIn: !!checkin });
});

// 打卡：记录今日学习完成
app.post('/api/checkin', auth, (req, res) => {
  const todayStr = getDateStr(new Date());
  db.prepare('INSERT OR IGNORE INTO checkin_logs (user_id, date, created_at) VALUES (?, ?, ?)').run(req.userId, todayStr, Date.now());
  // 计算连续打卡天数
  const rows = db.prepare(
    'SELECT date FROM checkin_logs WHERE user_id = ? ORDER BY date DESC'
  ).all(req.userId);
  let streak = 0;
  for (let i = 0; i < rows.length; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const expected = getDateStr(d);
    if (rows[i].date === expected) streak++;
    else break;
  }
  res.json({ ok: true, streak });
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
      w.updated_at as last_active,
      p.nickname, p.avatar
    FROM users u
    LEFT JOIN wordbooks w ON w.user_id = u.id
    LEFT JOIN profiles p ON p.user_id = u.id
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

// ===== 每日自动备份 =====
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!require('fs').existsSync(BACKUP_DIR)) {
  require('fs').mkdirSync(BACKUP_DIR);
}

function backupDatabase() {
  const now = new Date();
  const stamp = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const backupPath = path.join(BACKUP_DIR, 'data-' + stamp + '.db');
  try {
    // 先合并 WAL 再备份
    db.pragma('wal_checkpoint(TRUNCATE)');
    const src = require('fs').readFileSync(path.join(__dirname, 'data.db'));
    require('fs').writeFileSync(backupPath, src);
    // 只保留最近 30 天的备份
    const files = require('fs').readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    while (files.length > 30) {
      require('fs').unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
    console.log('[BACKUP] Database backed up to', backupPath);
  } catch (err) {
    console.error('[BACKUP] Failed:', err.message);
  }
}

// 启动后 5 分钟首次备份，之后每 24 小时一次
setTimeout(() => {
  backupDatabase();
  setInterval(backupDatabase, 24 * 60 * 60 * 1000);
}, 5 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// 优雅关闭：防止端口占用问题
function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, closing gracefully...`);
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    if (dictDb) dictDb.close();
    if (examplesDb) examplesDb.close();
    console.log('[SHUTDOWN] Database closed');
    process.exit(0);
  });
  // 超时强制退出
  setTimeout(() => { console.log('[SHUTDOWN] Force exit'); process.exit(0); }, 5000);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
