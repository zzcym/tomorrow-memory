#!/usr/bin/env node
/**
 * 从 stardict.db 分层抽样词表 —— 产出 eval/words.jsonl
 *
 * 用法：
 *   node eval/sample-words.mjs                 # 每个 tier 抽 40 个
 *   node eval/sample-words.mjs --per 20        # 每个 tier 20 个
 *   node eval/sample-words.mjs --seed 7 --out eval/words.jsonl
 *
 * 为什么按 word 划分 train/test：
 *   同一个词如果既在训练集又在评测集，那评测数字是假的。
 *   这里用 word 的 hash 做确定性划分（同一词每次结果一致），80% train / 20% test。
 *
 * tier 归属规则：取该词命中的**最高**考试等级（gre > toefl/ielts > ky > cet6 > cet4 > gk/zk），
 *   所以 "abandon"（gk cet4 cet6 ky toefl gre）会归到 gre，代表它是最难的那档要求。
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS, splitOf, tierOf } from './lib/word-meta.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ---------- 参数 ----------

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const PER_TIER = Number.parseInt(getArg('per', '40'), 10);
const SEED = Number.parseInt(getArg('seed', '20261030'), 10);
const OUT = resolve(ROOT, getArg('out', 'eval/words.jsonl'));
const DB_PATH = process.env.DICT_DB_PATH ? resolve(ROOT, process.env.DICT_DB_PATH) : join(ROOT, 'stardict.db');

if (!Number.isFinite(PER_TIER) || PER_TIER <= 0) {
  console.error('--per 必须是正整数');
  process.exit(1);
}

// ---------- 确定性随机 ----------

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

// ---------- 主流程 ----------

console.log(`读取 ${DB_PATH}`);
const db = new Database(DB_PATH, { readonly: true });

// 只要原形：exchange 里带 "0:" 的是屈折形式（abandoned / abandoning 之类）
const rows = db
  .prepare(
    `SELECT word, tag, collins, oxford, frq
       FROM stardict
      WHERE tag IS NOT NULL AND tag <> ''
        AND frq IS NOT NULL AND frq > 0
        AND length(word) >= 3
        AND word GLOB '[a-z][a-z]*'
        AND (exchange IS NULL OR exchange NOT LIKE '0:%')
      ORDER BY frq ASC`,
  )
  .all();

db.close();
console.log(`候选原形：${rows.length}`);

const buckets = new Map();
for (const r of rows) {
  const tier = tierOf(r.tag);
  if (!tier) continue;
  if (!buckets.has(tier)) buckets.set(tier, []);
  buckets.get(tier).push(r);
}

const rng = makeRng(SEED);
const out = [];
console.log(`\n每个 tier 抽 ${PER_TIER} 个（seed=${SEED}）`);

for (const tier of TIERS) {
  const pool = buckets.get(tier.name) ?? [];
  if (pool.length === 0) {
    console.log(`  ${tier.name.padEnd(12)} 池子为空，跳过`);
    continue;
  }
  // Fisher-Yates（用确定性 rng）
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const picked = arr.slice(0, Math.min(PER_TIER, arr.length));

  let train = 0;
  for (const r of picked) {
    const split = splitOf(r.word);
    if (split === 'train') train += 1;
    out.push({
      word: r.word,
      tier: tier.name,
      tags: r.tag.split(/\s+/).filter(Boolean),
      collins: r.collins ?? null,
      frq: r.frq,
      split,
    });
  }
  console.log(`  ${tier.name.padEnd(12)} 池 ${String(pool.length).padStart(6)}  抽 ${String(picked.length).padStart(4)}  train ${train} / test ${picked.length - train}`);
}

// 去重（同一个词可能因为 tier 规则只进一个桶，理论上不会重复，保险起见）
const seen = new Set();
const deduped = [];
for (const w of out) {
  if (seen.has(w.word)) continue;
  seen.add(w.word);
  deduped.push(w);
}

writeFileSync(OUT, deduped.map((w) => JSON.stringify(w)).join('\n') + '\n', 'utf8');

const trainN = deduped.filter((w) => w.split === 'train').length;
console.log(`\n写出 ${deduped.length} 词 → ${OUT}`);
console.log(`  train ${trainN} / test ${deduped.length - trainN}`);
console.log('\n下一步：用 --split test 那批词的 word 字段去写 gold.jsonl 的 content 记录，');
console.log('        train 那批词留给训练集 —— 两边不许交叉。');
