// 在 stardict.db 上直接构建 FTS5 全文索引，用于中译英查询
// 用法: node build-fts.js
// 效果: 给 stardict.db 增加 FTS5 虚拟表，避免额外的 2GB zh2en.db

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'stardict.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('找不到 stardict.db');
  process.exit(1);
}

console.log('打开 stardict.db...');
const db = new Database(DB_PATH);

// 检查是否已有 FTS5 表
const existing = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='stardict_fts'"
).get();
if (existing) {
  console.log('FTS5 索引已存在，删除重建...');
  db.exec('DROP TABLE IF EXISTS stardict_fts');
}

console.log('创建 FTS5 虚拟表（索引 word + translation）...');
db.exec(`
  CREATE VIRTUAL TABLE stardict_fts USING fts5(
    word, translation,
    content='stardict', content_rowid='id',
    tokenize='unicode61'
  );
`);

const total = db.prepare('SELECT COUNT(*) as c FROM stardict').get().c;
console.log(`总词条: ${total.toLocaleString()}`);

// 分批构建 FTS5 索引
const PAGE = 50000;
let offset = 0;
let count = 0;

const insert = db.prepare(
  'INSERT INTO stardict_fts(rowid, word, translation) VALUES (?, ?, ?)'
);

const batchInsert = db.transaction((rows) => {
  for (const r of rows) {
    insert.run(r.id, r.word, r.translation || '');
    count++;
  }
});

console.log('构建 FTS5 索引...');
while (offset < total) {
  const rows = db.prepare('SELECT id, word, translation FROM stardict WHERE id > ? AND id <= ?')
    .all(offset, offset + PAGE);
  if (rows.length === 0) break;
  batchInsert(rows);
  offset += PAGE;
  if (count % 200000 === 0 || offset >= total) {
    console.log(`  进度: ${count.toLocaleString()}/${total.toLocaleString()} (${Math.round(count/total*100)}%)`);
  }
}

// 验证
const testWords = ['冲突', '美丽', '计算机', '战争', '学习'];
for (const w of testWords) {
  const r = db.prepare(
    "SELECT count(*) as c FROM stardict_fts WHERE stardict_fts MATCH ?"
  ).get(w);
  console.log(`  "${w}" → ${r.c} 条`);
}

// 检查文件大小
if (process.platform !== 'win32') {
  const stat = fs.statSync(DB_PATH);
  console.log(`\nstardict.db 大小: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

db.close();
console.log('完成!');
