// 流式处理 Tatoeba CSV，提取英中例句对
const Database = require('better-sqlite3');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const SENTENCES = path.join(__dirname, 'sentences.csv');
const LINKS = path.join(__dirname, 'links.csv');
const OUT_DB = path.join(__dirname, 'examples.db');

async function main() {
  // Step 1: 流式读 sentences，只保留 eng 和 cmn/zho
  console.log('Step 1: Indexing English and Chinese sentence IDs...');
  const langMap = new Map(); // id → 'eng' or 'cmn'

  const sentRl = readline.createInterface({
    input: fs.createReadStream(SENTENCES),
    crlfDelay: Infinity,
  });
  let count = 0;
  for await (const line of sentRl) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab + 1);
    if (tab < 0 || tab2 < 0) continue;
    const id = line.slice(0, tab);
    const lang = line.slice(tab + 1, tab2);
    if (lang === 'eng' || lang === 'cmn' || lang === 'zho') {
      langMap.set(id, lang);
    }
    if (++count % 2000000 === 0) console.log(`  ${(count / 1000000).toFixed(0)}M sentences...`);
  }
  console.log(`  Done. ${langMap.size} English/Chinese sentence IDs`);

  // Step 2: 流式读 links，找出英↔中 pairs
  console.log('Step 2: Finding English-Chinese pairs...');
  const pairs = []; // [{enId, zhId}]
  count = 0;
  const linkRl = readline.createInterface({
    input: fs.createReadStream(LINKS),
    crlfDelay: Infinity,
  });
  for await (const line of linkRl) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const a = line.slice(0, tab);
    const b = line.slice(tab + 1);
    const la = langMap.get(a);
    const lb = langMap.get(b);
    if ((la === 'eng' && lb === 'cmn') || (la === 'eng' && lb === 'zho')) {
      pairs.push({ enId: a, zhId: b });
    } else if ((la === 'cmn' && lb === 'eng') || (la === 'zho' && lb === 'eng')) {
      pairs.push({ enId: b, zhId: a });
    }
    if (++count % 5000000 === 0) console.log(`  ${(count / 1000000).toFixed(0)}M links, ${(pairs.length / 1000).toFixed(0)}K pairs...`);
  }
  console.log(`  Done. ${pairs.length.toLocaleString()} English-Chinese pairs`);

  // Step 3: 释放 langMap，重建 id→text（只保留 pair 中的）
  langMap.clear();

  console.log('Step 3: Reading sentence texts for pairs...');
  const textMap = new Map(); // id → text
  const neededIds = new Set();
  for (const p of pairs) {
    neededIds.add(p.enId);
    neededIds.add(p.zhId);
  }
  console.log(`  Need ${neededIds.size} unique sentence texts`);

  const textRl = readline.createInterface({
    input: fs.createReadStream(SENTENCES),
    crlfDelay: Infinity,
  });
  for await (const line of textRl) {
    if (!line || textMap.size >= neededIds.size) break;
    const tab = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab + 1);
    if (tab < 0 || tab2 < 0) continue;
    const id = line.slice(0, tab);
    if (neededIds.has(id)) {
      textMap.set(id, line.slice(tab2 + 1));
      if (textMap.size % 50000 === 0) console.log(`  loaded ${textMap.size} texts...`);
    }
  }
  console.log(`  Loaded ${textMap.size} texts`);

  // Step 4: 构建 SQLite
  console.log('Step 4: Building SQLite database...');
  if (fs.existsSync(OUT_DB)) fs.unlinkSync(OUT_DB);
  const db = new Database(OUT_DB);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.pragma('cache_size = 100000');

  db.exec('CREATE TABLE pairs (id INTEGER PRIMARY KEY AUTOINCREMENT, en TEXT NOT NULL, zh TEXT NOT NULL)');

  const insert = db.prepare('INSERT INTO pairs (en, zh) VALUES (?, ?)');

  const total = pairs.length;
  let inserted = 0;
  const batch = db.transaction(() => {
    for (const p of pairs) {
      const en = textMap.get(p.enId);
      const zh = textMap.get(p.zhId);
      if (en && zh && en.length > 3 && zh.length > 1) {
        insert.run(en, zh);
        inserted++;
      }
    }
  });
  batch();
  console.log(`  Inserted ${inserted.toLocaleString()} valid pairs`);

  console.log('Step 5: Building FTS5 full-text search index...');
  db.exec(`
    CREATE VIRTUAL TABLE pairs_fts USING fts5(en, content='pairs', content_rowid='id');
    INSERT INTO pairs_fts(pairs_fts) VALUES('rebuild');
  `);

  const rowCount = db.prepare('SELECT COUNT(*) as c FROM pairs').get().c;
  console.log(`Done! ${rowCount.toLocaleString()} pairs in examples.db`);
  db.close();

  // 清理
  fs.unlinkSync(SENTENCES);
  fs.unlinkSync(LINKS);
  fs.unlinkSync(path.join(__dirname, 'sentences.tar.bz2'));
  fs.unlinkSync(path.join(__dirname, 'links.tar.bz2'));
  console.log('Cleaned up raw CSV and tar files');
}

main().catch(err => { console.error(err); process.exit(1); });
