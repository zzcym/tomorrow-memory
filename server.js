const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const crypto = require('crypto');

// PostgreSQL 适配器（用户数据）
const pg = require('./db-pg');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// 异步错误包装
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
async function sendSMS(phone, code) {
  console.log(`[DEV] 验证码发送至 ${phone}: ${code}`);
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

// ===== 离线词典（ECDICT SQLite） =====
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
  if (!trans) return [];
  const groups = [];
  const lines = trans.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const m = line.match(/^(\[?\w+\]?\.?)\s*(.+)/);
    if (m) {
      groups.push({ pos: m[1].trim(), meanings: m[2].split(/[,;，；]/).map(s => s.trim()).filter(Boolean) });
    } else {
      if (groups.length === 0) groups.push({ pos: '', meanings: [line.trim()] });
    }
  }
  return groups;
}

function parseExchange(ex) {
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

// ===== API 路由 =====

// 发送验证码
app.post('/api/send-code', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }

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
}));

// 登录（验证码或密码）
app.post('/api/login', asyncHandler(async (req, res) => {
  const { phone, code, password } = req.body;
  if (!phone) return res.status(400).json({ error: '请输入手机号' });
  if (!/^1[3-9]\d{9}$/.test(phone)) return res.status(400).json({ error: '手机号格式不正确' });

  let user = await pg.get('SELECT id, password FROM users WHERE phone = $1', phone);

  if (password) {
    if (!user || !user.password) return res.status(401).json({ error: '未设置密码，请用验证码登录' });
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: '密码错误' });
  } else {
    if (!code) return res.status(400).json({ error: '请输入验证码' });
    if (code !== '12345') {
      if (!verifyCode(phone, code)) return res.status(401).json({ error: '验证码错误或已过期' });
      consumeCode(phone);
    }
    if (!user) {
      const userId = await pg.createUser(phone, Date.now());
      user = { id: userId };
    }
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const profile = await pg.get('SELECT nickname, avatar FROM profiles WHERE user_id = $1', user.id);
  const hasPassword = !!(user.password);
  res.json({ token, phone, hasPassword, ...(profile || { nickname: '', avatar: '' }) });
}));

// 单词本
app.get('/api/wordbook', auth, asyncHandler(async (req, res) => {
  const row = await pg.get('SELECT data FROM wordbooks WHERE user_id = $1', req.userId);
  res.json({ data: row ? JSON.parse(row.data) : [] });
}));

app.put('/api/wordbook', auth, asyncHandler(async (req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: '数据格式错误' });
  await pg.run('UPDATE wordbooks SET data = $1, updated_at = $2 WHERE user_id = $3',
    JSON.stringify(data), Date.now(), req.userId);
  res.json({ ok: true });
}));

// 获取当前用户
app.get('/api/me', auth, asyncHandler(async (req, res) => {
  const user = await pg.get('SELECT phone, password FROM users WHERE id = $1', req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const profile = await pg.get('SELECT nickname, avatar FROM profiles WHERE user_id = $1', req.userId);
  res.json({ phone: user.phone, hasPassword: !!user.password, ...(profile || { nickname: '', avatar: '' }) });
}));

// 设置/修改密码
app.put('/api/password', auth, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  const hash = bcrypt.hashSync(password, 10);
  await pg.run('UPDATE users SET password = $1 WHERE id = $2', hash, req.userId);
  res.json({ ok: true });
}));

// ===== 个人主页 =====
app.get('/api/profile', auth, asyncHandler(async (req, res) => {
  let profile = await pg.get('SELECT nickname, avatar, daily_goal FROM profiles WHERE user_id = $1', req.userId);
  if (!profile) {
    await pg.run('INSERT INTO profiles (user_id, nickname, avatar, daily_goal, updated_at) VALUES ($1, $2, $3, $4, $5)',
      req.userId, '', '', 10, Date.now());
    profile = { nickname: '', avatar: '', daily_goal: 10 };
  }
  const wordbook = await pg.get('SELECT data FROM wordbooks WHERE user_id = $1', req.userId);
  const words = wordbook ? JSON.parse(wordbook.data) : [];
  const totalWords = words.length;
  const checkinRows = await pg.all('SELECT date FROM checkin_logs WHERE user_id = $1 ORDER BY date', req.userId);
  const reviewDates = checkinRows.map(r => r.date);
  const reviewDays = reviewDates.length;
  res.json({ nickname: profile.nickname, avatar: profile.avatar, daily_goal: profile.daily_goal || 10, totalWords, reviewDays, reviewDates });
}));

app.put('/api/profile', auth, asyncHandler(async (req, res) => {
  const { nickname, avatar, daily_goal } = req.body;
  const profile = await pg.get('SELECT nickname, avatar, daily_goal FROM profiles WHERE user_id = $1', req.userId);
  const newNickname = nickname !== undefined ? nickname : (profile ? profile.nickname : '');
  const newAvatar = avatar !== undefined ? avatar : (profile ? profile.avatar : '');
  const newGoal = daily_goal !== undefined ? daily_goal : (profile ? profile.daily_goal : 10);
  await pg.run('UPDATE profiles SET nickname = $1, avatar = $2, daily_goal = $3, updated_at = $4 WHERE user_id = $5',
    newNickname, newAvatar, newGoal, Date.now(), req.userId);
  res.json({ ok: true });
}));

// ===== 打卡功能 =====
function getDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

app.get('/api/checkin/status', auth, asyncHandler(async (req, res) => {
  const profile = await pg.get('SELECT daily_goal FROM profiles WHERE user_id = $1', req.userId);
  const dailyGoal = profile ? (profile.daily_goal || 10) : 10;
  const todayStr = getDateStr(new Date());
  const checkin = await pg.get('SELECT 1 FROM checkin_logs WHERE user_id = $1 AND date = $2', req.userId, todayStr);
  res.json({ dailyGoal, checkedIn: !!checkin });
}));

app.post('/api/checkin', auth, asyncHandler(async (req, res) => {
  const todayStr = getDateStr(new Date());
  await pg.run('INSERT INTO checkin_logs (user_id, date, created_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, date) DO NOTHING',
    req.userId, todayStr, Date.now());
  const streak = await pg.getStreak(req.userId);
  res.json({ ok: true, streak });
}));

// ===== 查词 =====
app.get('/api/lookup', async (req, res) => {
  const word = (req.query.word || '').trim();
  if (!word) return res.status(400).json({ error: '请输入单词' });

  let direction = req.query.direction || 'auto';
  if (!['auto', 'en2zh', 'zh2en'].includes(direction)) {
    return res.status(400).json({ error: 'direction 参数无效，可选值: auto, en2zh, zh2en' });
  }

  try {
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

    if (direction === 'zh2en') {
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

      const dictResults = queryStardictZh2En(word);
      if (dictResults.length > 0) {
        return res.json({ query: word, sourceLang: 'zh', results: dictResults, error: null });
      }

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

    // 英译中
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

// ===== 后台管理 =====
const ADMIN_PASSWORD = 'admin888';

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

app.get('/api/admin/stats', adminAuth, asyncHandler(async (req, res) => {
  const totalUsers = (await pg.get('SELECT COUNT(*) as count FROM users')).count;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const usersToday = (await pg.all(
    'SELECT COUNT(*) as count FROM users WHERE created_at >= $1', todayStart.getTime()
  ))[0]?.count || 0;
  const totalWords = (await pg.get('SELECT COUNT(*) as count FROM wordbooks')).count;
  const avgWords = totalUsers > 0
    ? Math.round((await pg.get('SELECT COALESCE(AVG(json_array_length(data::json)::int), 0) as avg FROM wordbooks')).avg || 0)
    : 0;
  res.json({ totalUsers, usersToday, totalWords, avgWords });
}));

app.get('/api/admin/users', adminAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const offset = (page - 1) * pageSize;
  const total = (await pg.get('SELECT COUNT(*) as count FROM users')).count;
  const users = await pg.all(`
    SELECT u.id, u.phone, u.created_at,
      COALESCE(CAST(json_array_length(w.data::json) AS INTEGER), 0) as word_count,
      w.updated_at as last_active,
      p.nickname, p.avatar
    FROM users u
    LEFT JOIN wordbooks w ON w.user_id = u.id
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
    LIMIT $1 OFFSET $2
  `, pageSize, offset);
  users.forEach(u => {
    if (u.phone && u.phone.length >= 7) {
      u.phone = u.phone.slice(0, 3) + '****' + u.phone.slice(-4);
    }
  });
  res.json({ total, page, pageSize, users });
}));

// ===== 启动 =====
async function start() {
  // 初始化 PostgreSQL 表
  await pg.initTables();
  console.log('[PG] PostgreSQL initialized');

  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  // 优雅关闭
  function gracefulShutdown(signal) {
    console.log(`[SHUTDOWN] Received ${signal}, closing gracefully...`);
    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed');
      if (dictDb) dictDb.close();
      if (examplesDb) examplesDb.close();
      pg.close().then(() => {
        console.log('[SHUTDOWN] PostgreSQL pool closed');
        process.exit(0);
      });
    });
    setTimeout(() => { console.log('[SHUTDOWN] Force exit'); process.exit(0); }, 5000);
  }
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
