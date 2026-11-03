/**
 * 词表元信息的唯一实现 —— sample-words.mjs 与 lookup.mjs 共用，禁止各自再写一份。
 *
 * 改规则只改这里：tier 归属、train/test 划分、CEFR 猜测。
 */

/** 考试等级，从高到低排（命中多个时取最高档） */
export const TIERS = [
  { name: 'gre', match: ['gre'] },
  { name: 'toefl_ielts', match: ['toefl', 'ielts'] },
  { name: 'ky', match: ['ky'] },
  { name: 'cet6', match: ['cet6'] },
  { name: 'cet4', match: ['cet4'] },
  { name: 'gk_zk', match: ['gk', 'zk'] },
];

export const TIER_NAMES = TIERS.map((t) => t.name);

/**
 * 判断一个词的 tier。tag 形如 "gk cet4 cet6 ky toefl gre"（空格分隔）。
 * 取命中的最高档：abandon（gk cet4 cet6 ky toefl gre）→ 'gre'。
 */
export function tierOf(tag) {
  if (!tag) return null;
  const padded = ` ${String(tag).trim()} `;
  for (const tier of TIERS) {
    if (tier.match.some((m) => padded.includes(` ${m} `))) return tier.name;
  }
  return null;
}

/** FNV-1a 32bit → [0,1)，用于确定性划分 */
export function hashWord(word) {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i += 1) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

/** 确定性 train/test 划分：同一个词永远落在同一侧 */
export function splitOf(word, trainRatio = 0.8) {
  return hashWord(word) < trainRatio ? 'train' : 'test';
}

/**
 * 从考试等级猜一个 CEFR 起点（只是建议值，写 gold 时按需改）。
 * gk/zk(中考高考) → B1，cet4 → B1，cet6 → B2，ky(考研) → B2，托福/雅思 → C1，GRE → C1
 */
export function cefrGuess(tier) {
  switch (tier) {
    case 'gk_zk':
      return 'B1';
    case 'cet4':
      return 'B1';
    case 'cet6':
      return 'B2';
    case 'ky':
      return 'B2';
    case 'toefl_ielts':
      return 'C1';
    case 'gre':
      return 'C1';
    default:
      return 'B1';
  }
}

/**
 * 解析 stardict 的 exchange 字段 → 词形变化列表（不含原形）。
 * 格式：d:abandoned/p:abandoned/i:abandoning/3:abandons/s:abandons
 * 其中 0:xxx 表示「这是 xxx 的屈折形式」，1:p 之类是词性标记，都要跳过。
 */
export function parseExchange(exchange) {
  if (!exchange) return [];
  const forms = new Set();
  for (const seg of String(exchange).split('/')) {
    const idx = seg.indexOf(':');
    if (idx < 0) continue;
    const key = seg.slice(0, idx);
    const val = seg.slice(idx + 1).trim();
    if (!val) continue;
    if (key === '0') continue; // 原形指针
    if (key === '1') continue; // 词性标记（如 1:dp）
    forms.add(val.toLowerCase());
  }
  return [...forms];
}
