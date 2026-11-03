#!/usr/bin/env node
/**
 * 查一个词的「写评测集需要知道的一切」—— 写 gold.jsonl 时的顺手工具。
 *
 * 用法：
 *   node eval/lookup.mjs abandon          # 人读：词典 + 词形 + 例句 + tier/split
 *   node eval/lookup.mjs abandon --json   # 直接吐一条 content 记录骨架（粘进 gold.jsonl）
 *
 * 数据来源与 app 一致：stardict.db（词典）+ examples.db 的 pairs_fts（例句）。
 * 关键点：split=test 的词才能进评测集；split=train 的词留给训练。
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cefrGuess, parseExchange, splitOf, tierOf } from './lib/word-meta.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const rawArgs = process.argv.slice(2);
const wantJson = rawArgs.includes('--json');
const word = rawArgs.find((a) => !a.startsWith('--'));

if (!word) {
  console.error('用法: node eval/lookup.mjs <word> [--json]');
  process.exit(1);
}

const clean = word.toLowerCase().replace(/[^a-z'-]/g, '');
if (clean.length < 2) {
  console.error(`"${word}" 不像一个英文词`);
  process.exit(1);
}

// ---------- 词典 ----------

const dictPath = join(ROOT, 'stardict.db');
const examplesPath = join(ROOT, 'examples.db');

if (!existsSync(dictPath)) {
  console.error(`找不到 ${dictPath}`);
  process.exit(1);
}

const dict = new Database(dictPath, { readonly: true });
const entry = dict
  .prepare(
    `SELECT word, phonetic, translation, pos, tag, collins, oxford, bnc, frq, exchange
       FROM stardict
      WHERE sw = ? OR word = ?
      ORDER BY CASE WHEN word = ? THEN 0 ELSE 1 END, collins DESC
      LIMIT 1`,
  )
  .get(clean, clean, clean);
dict.close();

if (!entry) {
  console.error(`词典里没有 "${clean}"（stardict 3.4M 条都没命中，检查拼写）`);
  process.exit(1);
}

const tier = tierOf(entry.tag);
const split = splitOf(clean);
const forms = parseExchange(entry.exchange);
const level = cefrGuess(tier);

// ---------- 例句 ----------

let examples = [];
if (existsSync(examplesPath)) {
  try {
    const ex = new Database(examplesPath, { readonly: true });
    examples = ex
      .prepare(
        `SELECT DISTINCT p.en, p.zh FROM pairs_fts f
           JOIN pairs p ON p.id = f.rowid
          WHERE pairs_fts MATCH ?
          LIMIT 5`,
      )
      .all(`"${clean}"`);
    ex.close();
  } catch (e) {
    console.error(`（例句查询失败：${e.message}）`);
  }
}

// ---------- 输出 ----------

const translation = (entry.translation ?? '').trim();
const firstLines = translation.split(/\r?\n/).slice(0, 3);

if (wantJson) {
  // 生成 content 记录骨架：约束全部来自可机器判定的字段
  const constraints = [
    'wordRoot 非空，且用中文解释构词',
    'sceneExamples 恰好 3 条',
    forms.length > 0
      ? `每条例句含 ${clean} 或其词形（${forms.slice(0, 4).join('/')}）`
      : `每条例句含 ${clean}`,
    '口诀是中文，且不含整句英文',
  ];
  const rec = {
    id: nextContentId(),
    kind: 'content',
    word: clean,
    level,
    expect: { constraints },
    notes: `自动生成草稿（tier=${tier ?? '?'}, frq=${entry.frq ?? '?'}, split=${split}）—— 请按需改约束后再收录`,
  };
  console.log(JSON.stringify(rec));
  process.exit(0);
}

const line = (label, value) => console.log(`  ${label.padEnd(12)} ${value}`);
console.log(`\n=== ${entry.word} ===`);
line('音标', entry.phonetic || '（无）');
line('词性', entry.pos || '（无）');
line('考试标签', entry.tag || '（无）');
line('tier', tier ?? '（不属于任何考试词表）');
line('CEFR 建议', level);
line('分片', split === 'test' ? 'test ✅ 可以进评测集' : 'train ❌ 只能进训练集');
line('词频', `frq=${entry.frq ?? '?'}  bnc=${entry.bnc ?? '?'}`);
line('collins', `${entry.collins ?? '?'}   oxford=${entry.oxford ?? '?'}`);
line('词形', forms.length > 0 ? forms.join(', ') : '（无变化）');

console.log('\n  释义');
for (const l of firstLines) console.log(`    ${l}`);
if (!translation) console.log('    （空）');

console.log(`\n  例句（${examples.length} 条，来自 examples.db）`);
if (examples.length === 0) {
  console.log('    （这个词在语料库里没有例句）');
}
for (const e of examples) {
  console.log(`    EN  ${e.en}`);
  console.log(`    ZH  ${e.zh}`);
}

// 繁简提示：语料库是 Tatoeba 风格，译文可能带繁体
const trad = examples.filter((e) => /[們個這來說時會為與對開關門後裡]/.test(e.zh ?? '')).length;
if (trad > 0) {
  console.log(`\n  ⚠ ${trad}/${examples.length} 条例句译文含繁体字 —— 这个语料是繁体来源，`);
  console.log('    若在 content 约束里要求「简体中文」，需要先做繁→简转换，否则会被判失败。');
}

console.log(`\n  下一步：node eval/lookup.mjs ${clean} --json  → 生成 content 记录骨架\n`);

/** 扫 seed/gold 求下一个 content id */
function nextContentId() {
  let max = 0;
  for (const f of ['seed.jsonl', 'gold.jsonl']) {
    const p = join(HERE, f);
    if (!existsSync(p)) continue;
    for (const l of readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const t = l.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t);
        if (typeof o.id === 'string' && o.id.startsWith('c')) {
          const n = Number.parseInt(o.id.slice(1), 10);
          if (Number.isFinite(n) && n > max) max = n;
        }
      } catch {
        /* 坏行交给 validate 报 */
      }
    }
  }
  return `c${String(max + 1).padStart(3, '0')}`;
}
