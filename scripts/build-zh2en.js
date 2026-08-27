// 从 stardict.db 提取中文词，构建中英索引库 zh2en.db
// 用法: node build-zh2en.js

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const STARDICT_PATH = path.join(__dirname, 'stardict.db');
const ZH2EN_PATH = path.join(__dirname, 'zh2en.db');

if (!fs.existsSync(STARDICT_PATH)) {
  console.error('找不到 stardict.db');
  process.exit(1);
}

console.log('读取 stardict.db...');
const src = new Database(STARDICT_PATH, { readonly: true });
const total = src.prepare('SELECT COUNT(*) as c FROM stardict').get().c;
console.log('总词条:', total.toLocaleString());

// 中文正则：匹配连续中文字符
const chineseRx = /[一-鿿㐀-䶿豈-﫿]+/g;

console.log('构建 zh2en.db...');
if (fs.existsSync(ZH2EN_PATH)) fs.unlinkSync(ZH2EN_PATH);
const dest = new Database(ZH2EN_PATH);
dest.pragma('journal_mode = WAL');

dest.exec(`
  CREATE TABLE zh2en (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chinese TEXT NOT NULL,
    word TEXT NOT NULL,
    translation TEXT,
    phonetic TEXT DEFAULT '',
    exchange TEXT DEFAULT '',
    collins INTEGER DEFAULT 0,
    bnc INTEGER DEFAULT 0,
    frq INTEGER DEFAULT 0,
    tag TEXT DEFAULT ''
  );
  CREATE INDEX idx_zh2en_chinese ON zh2en(chinese);
`);

const insert = dest.prepare(
  `INSERT INTO zh2en (chinese, word, translation, phonetic, exchange, collins, bnc, frq, tag)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const batchInsert = dest.transaction((entries) => {
  for (const e of entries) insert.run(...e);
});

const BATCH_SIZE = 2000;
let batch = [];
let processed = 0;
let inserted = 0;

// 流式处理，避免一次性加载 340 万行到内存
// 用 rowid 分批读取
const PAGE_SIZE = 50000;
let offset = 0;

while (offset < total) {
  const rows = src.prepare(`
    SELECT word, translation, phonetic, exchange, collins, bnc, frq, tag
    FROM stardict
    WHERE rowid > ? AND rowid <= ?
  `).all(offset, offset + PAGE_SIZE);

  if (rows.length === 0) break;

  for (const row of rows) {
    if (!row.translation) continue;

    const matches = row.translation.match(chineseRx);
    if (!matches) continue;

    const seen = new Set();
    for (const chinese of matches) {
      if (seen.has(chinese)) continue;
      seen.add(chinese);

      batch.push([
        chinese, row.word, row.translation,
        row.phonetic || '', row.exchange || '',
        row.collins || 0, row.bnc || 0, row.frq || 0,
        row.tag || ''
      ]);
      inserted++;

      if (batch.length >= BATCH_SIZE) {
        batchInsert(batch);
        batch = [];
      }
    }
  }

  offset += PAGE_SIZE;
  processed += rows.length;
  if (processed % 200000 === 0) {
    console.log(`  进度: ${processed.toLocaleString()}/${total.toLocaleString()} (${Math.round(processed/total*100)}%)`);
  }
}

// 处理剩余批次
if (batch.length > 0) batchInsert(batch);

console.log('zh2en 条目:', inserted.toLocaleString());

// 创建 FTS5 全文索引
console.log('创建 FTS5 索引...');
dest.exec(`
  CREATE VIRTUAL TABLE zh2en_fts USING fts5(
    chinese, word, translation,
    content='zh2en', content_rowid='id',
    tokenize='unicode61'
  );
  INSERT INTO zh2en_fts(rowid, chinese, word, translation)
  SELECT id, chinese, word, coalesce(translation, '') FROM zh2en;
`);

// 验证结果
const sample = dest.prepare("SELECT chinese, word FROM zh2en WHERE chinese = '冲突' ORDER BY collins DESC LIMIT 10").all();
console.log('\n精确查询 "冲突":', sample.length, '条');
sample.forEach(s => console.log('  -', s.word));

const fts = dest.prepare("SELECT count(*) as c FROM zh2en_fts WHERE zh2en_fts MATCH '\"冲 突\"'").get();
console.log('FTS5 短语查询 "冲突":', fts.c, '条');

// 文件大小
const stat = fs.statSync(ZH2EN_PATH);
console.log('\nzh2en.db 大小:', (stat.size / 1024 / 1024).toFixed(1), 'MB');

src.close();
dest.close();
console.log('完成!');
