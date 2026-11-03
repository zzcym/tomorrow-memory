#!/usr/bin/env node
/**
 * 评测集校验器 —— 零依赖，纯 Node ESM。
 *
 * 用法：
 *   node eval/validate.mjs                 # 校验 seed.jsonl + gold.jsonl（存在哪个查哪个）
 *   node eval/validate.mjs eval/seed.jsonl # 只查指定文件
 *   node eval/validate.mjs --all           # 连 examples.jsonl 一起查
 *
 * 退出码：有 ERROR 时为 1（可直接挂 CI）；只有 WARN 时为 0。
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS_FILE = join(HERE, 'tools.json');

const INTENTS = ['lookup', 'learn', 'review', 'assess', 'report'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const KINDS = ['route', 'content'];
const RATING_VALUES = [1, 2, 3, 4];

// ---------- 载入工具定义 ----------

const toolsDoc = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'));
const TOOLS = toolsDoc.tools ?? [];
const TOOL_NAME_SET = new Set(TOOLS.map((t) => t.name));
const TOOL_PARAM_MAP = new Map(TOOLS.map((t) => [t.name, new Set(Object.keys(t.params ?? {}))]));
const TOOL_PARAMS_UNION = new Set(TOOLS.flatMap((t) => Object.keys(t.params ?? {})));

// ---------- 小工具 ----------

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** 一条记录的校验结果 */
function makeReport() {
  return { errors: [], warnings: [] };
}

// ---------- 单条校验 ----------

function validateRecord(rec, lineNo) {
  const rep = makeReport();
  const where = `第 ${lineNo} 行`;
  const addErr = (msg) => rep.errors.push(`${where}: ${msg}`);
  const addWarn = (msg) => rep.warnings.push(`${where}: ${msg}`);

  if (!isPlainObject(rec)) {
    addErr('不是一个 JSON 对象');
    return rep;
  }

  // --- 通用字段 ---
  if (!isNonEmptyString(rec.id)) addErr('缺少 id');
  if (!KINDS.includes(rec.kind)) addErr(`kind 必须是 ${KINDS.join(' / ')}，收到 ${JSON.stringify(rec.kind)}`);

  const prefix = rec.kind === 'content' ? 'c' : 'r';
  if (isNonEmptyString(rec.id) && !new RegExp(`^${prefix}\\d{3}$`).test(rec.id)) {
    addErr(`id 格式应为 ${prefix}001 这种（${prefix} + 三位数字），收到 ${rec.id}`);
  }
  if (rec.tags !== undefined) {
    if (!Array.isArray(rec.tags)) addErr('tags 必须是字符串数组');
    else rec.tags.filter((t) => !isNonEmptyString(t)).forEach(() => addErr('tags 里有空字符串'));
  }
  if (rec.notes !== undefined && typeof rec.notes !== 'string') addErr('notes 必须是字符串');

  // --- 分支 ---
  if (rec.kind === 'route') validateRoute(rec, addErr, addWarn);
  if (rec.kind === 'content') validateContent(rec, addErr, addWarn);

  return rep;
}

function validateRoute(rec, addErr, addWarn) {
  if (!isNonEmptyString(rec.text)) {
    addErr('route 记录缺少 text（用户原话）');
  } else if (rec.text.length > 60) {
    addWarn(`text 有 ${rec.text.length} 字，真实用户很少打这么长 —— 确认不是自己在写说明书`);
  }

  const exp = rec.expect;
  if (!isPlainObject(exp)) {
    addErr('route 记录缺少 expect 对象');
    return;
  }

  const hasIntent = exp.intent !== undefined;
  const hasTools = exp.tools !== undefined;
  const isClarify = exp.clarify === true;

  if (!hasIntent && !hasTools && !isClarify) {
    addErr('expect 里至少要有一个：intent / tools / clarify');
  }

  if (exp.clarify !== undefined && typeof exp.clarify !== 'boolean') addErr('expect.clarify 必须是布尔值');

  if (isClarify) {
    if (hasTools && Array.isArray(exp.tools) && exp.tools.length > 0) {
      addErr('clarify:true 时不能再写 tools（一轮只做一件事：要么问，要么做）');
    }
  }

  if (hasIntent && !INTENTS.includes(exp.intent)) {
    addErr(`expect.intent 不在 ${INTENTS.join('/')} 里：${JSON.stringify(exp.intent)}`);
  }

  let firstTool = null;
  if (hasTools) {
    if (!Array.isArray(exp.tools)) {
      addErr('expect.tools 必须是数组');
    } else {
      const tools = exp.tools;
      for (const name of tools) {
        if (!TOOL_NAME_SET.has(name)) {
          addErr(`未知工具 ${JSON.stringify(name)}（可选：${[...TOOL_NAME_SET].join(', ')}）`);
        }
      }
      if (new Set(tools).size !== tools.length) addErr('expect.tools 里有重复工具');
      if (tools.length > 0) {
        firstTool = tools[0];
        const last = tools[tools.length - 1];
        if (!isClarify && last !== 'finish') addWarn(`轨迹以 ${JSON.stringify(last)} 结尾，没有 finish —— 轨迹不完整`);
      }
      if (tools.length === 0 && !isClarify && rec.tags?.includes('no_tool') !== true) {
        addWarn('tools 为空且不是 clarify：确认这是「直接回答」用例，建议加 tags:["no_tool"]');
      }
      if (tools.length > 6) addWarn(`一次会话 ${tools.length} 步，可能过长（建议 ≤ 4 步）`);
    }
  }

  if (exp.args !== undefined) {
    if (!isPlainObject(exp.args)) {
      addErr('expect.args 必须是对象');
    } else {
      const scope = firstTool && TOOL_PARAM_MAP.has(firstTool) ? TOOL_PARAM_MAP.get(firstTool) : TOOL_PARAMS_UNION;
      for (const key of Object.keys(exp.args)) {
        if (!scope.has(key)) {
          addErr(`expect.args.${key} 不是 ${firstTool ?? '任何工具'} 的参数（可选：${[...scope].join(', ')}）`);
        }
      }
      if (exp.args.rating !== undefined) {
        const r = exp.args.rating;
        if (!RATING_VALUES.includes(r)) addErr(`rating 只能是 1/2/3/4，收到 ${JSON.stringify(r)}`);
      }
      if (exp.args.word !== undefined && typeof exp.args.word === 'string') {
        if (exp.args.word !== exp.args.word.toLowerCase()) addWarn('args.word 建议小写');
      }
    }
  }
}

function validateContent(rec, addErr, addWarn) {
  if (!isNonEmptyString(rec.word)) {
    addErr('content 记录缺少 word');
  } else if (!/^[a-z][a-z'-]*$/.test(rec.word)) {
    addErr(`word 应为小写英文短语，收到 ${JSON.stringify(rec.word)}`);
  } else if (rec.word.length < 2) {
    addErr('word 至少 2 个字符');
  }

  if (!LEVELS.includes(rec.level)) {
    addErr(`level 必须是 ${LEVELS.join('/')}，收到 ${JSON.stringify(rec.level)}`);
  }

  const exp = rec.expect;
  if (!isPlainObject(exp)) {
    addErr('content 记录缺少 expect 对象');
    return;
  }
  if (!Array.isArray(exp.constraints) || exp.constraints.length === 0) {
    addErr('content 记录必须有非空的 expect.constraints');
  } else {
    exp.constraints.forEach((c, i) => {
      if (!isNonEmptyString(c)) addErr(`constraints[${i}] 是空的`);
      else if (/生动|自然|地道|优美|有趣|好记/.test(c)) {
        addWarn(`constraints[${i}]「${c}」不可机器判定 —— 换成可判定的条件，或交给 judge`);
      }
    });
  }
}

// ---------- 文件级 ----------

function parseJsonl(path) {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const records = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '') continue;
    try {
      records.push({ rec: JSON.parse(line), lineNo: i + 1 });
    } catch (e) {
      records.push({ parseError: e.message, lineNo: i + 1 });
    }
  }
  return records;
}

function collectCoverage(records) {
  const cov = {
    total: 0,
    byKind: {},
    byIntent: {},
    clarify: 0,
    noClarifyTag: 0,
    multiStep: 0,
    noTool: 0,
    ratings: new Set(),
    levels: new Set(),
    tagCount: {},
  };
  for (const r of records) {
    if (!isPlainObject(r)) continue;
    cov.total += 1;
    cov.byKind[r.kind] = (cov.byKind[r.kind] ?? 0) + 1;
    if (r.kind === 'route' && isPlainObject(r.expect)) {
      const it = r.expect.intent;
      if (it) cov.byIntent[it] = (cov.byIntent[it] ?? 0) + 1;
      if (r.expect.clarify === true) cov.clarify += 1;
      if (Array.isArray(r.expect.tools) && r.expect.tools.length === 0) cov.noTool += 1;
      if (isPlainObject(r.expect.args) && r.expect.args.rating !== undefined) cov.ratings.add(r.expect.args.rating);
    }
    if (r.kind === 'content' && r.level) cov.levels.add(r.level);
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) {
        cov.tagCount[t] = (cov.tagCount[t] ?? 0) + 1;
        if (t === 'no_clarify') cov.noClarifyTag += 1;
        if (t === 'multi_step') cov.multiStep += 1;
      }
    }
  }
  return cov;
}

function printCoverage(cov, label) {
  console.log(`\n-- 覆盖率（${label}，共 ${cov.total} 条）--`);
  const kinds = Object.entries(cov.byKind)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
  console.log(`  类型      ${kinds || '（空）'}`);

  const intentLine = INTENTS.map((i) => `${i}=${cov.byIntent[i] ?? 0}`).join('  ');
  console.log(`  意图      ${intentLine}`);
  console.log(`  澄清      clarify=${cov.clarify}  no_clarify 标签=${cov.noClarifyTag}  multi_step=${cov.multiStep}  空工具=${cov.noTool}`);
  console.log(`  rating    ${[...cov.ratings].sort().join(',') || '（未覆盖）'}`);
  console.log(`  level     ${[...cov.levels].sort().join(',') || '（未覆盖）'}`);

  const gaps = [];
  if (cov.total === 0) gaps.push('一条都还没有');
  for (const i of INTENTS) {
    if ((cov.byIntent[i] ?? 0) === 0) gaps.push(`意图 ${i} 没有样本`);
    else if ((cov.byIntent[i] ?? 0) < 3) gaps.push(`意图 ${i} 只有 ${cov.byIntent[i]} 条（建议 ≥ 3）`);
  }
  if (cov.clarify === 0) gaps.push('没有「该反问」的样本');
  if (cov.noClarifyTag === 0) gaps.push('没有 no_clarify 负例 —— 测不了 over-clarify');
  if (cov.multiStep === 0) gaps.push('没有 multi_step 样本 —— 测不了多步规划');
  for (const r of RATING_VALUES) {
    if (!cov.ratings.has(r)) gaps.push(`rating=${r} 没覆盖（边界值最容易错）`);
  }
  if (gaps.length === 0) console.log('  结论      覆盖看起来完整');
  else {
    console.log('  缺口');
    for (const g of gaps) console.log(`    - ${g}`);
  }
}

function suggestNextId(records, kind) {
  const prefix = kind === 'content' ? 'c' : 'r';
  let max = 0;
  for (const r of records) {
    if (!isPlainObject(r) || typeof r.id !== 'string') continue;
    if (!r.id.startsWith(prefix)) continue;
    const n = Number.parseInt(r.id.slice(1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ---------- main ----------

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');

  let files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    const candidates = all ? ['seed.jsonl', 'gold.jsonl', 'examples.jsonl'] : ['seed.jsonl', 'gold.jsonl'];
    files = candidates.map((f) => join(HERE, f)).filter((p) => existsSync(p));
  }

  console.log(`工具定义：${TOOLS.length} 个（${[...TOOL_NAME_SET].join(', ')}）`);

  if (files.length === 0) {
    console.log('\n没找到要校验的文件。先创建 eval/seed.jsonl 并写第一条。');
    console.log(`建议第一条：{"id":"${suggestNextId([], 'route')}","kind":"route","text":"...","expect":{"intent":"learn","tools":["etymology","finish"]}}`);
    return 0;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const allRecords = [];
  const seenIds = new Map();
  const seenTexts = new Map();

  for (const path of files) {
    const name = basename(path);
    const rows = parseJsonl(path);
    console.log(`\n== ${name}（${rows.length} 行）==`);

    if (rows.length === 0) {
      console.log('  （空文件）');
      continue;
    }

    for (const row of rows) {
      if (row.parseError) {
        console.log(`  ERROR 第 ${row.lineNo} 行: JSON 解析失败 —— ${row.parseError}`);
        totalErrors += 1;
        continue;
      }
      const { rec, lineNo } = row;
      const rep = validateRecord(rec, lineNo);

      if (isPlainObject(rec) && typeof rec.id === 'string') {
        if (seenIds.has(rec.id)) {
          rep.errors.push(`第 ${lineNo} 行: id ${rec.id} 重复（首次出现在 ${seenIds.get(rec.id)}）`);
        } else {
          seenIds.set(rec.id, `${name}:${lineNo}`);
        }
      }
      if (isPlainObject(rec) && typeof rec.text === 'string') {
        if (seenTexts.has(rec.text)) {
          rep.warnings.push(`第 ${lineNo} 行: text 与 ${seenTexts.get(rec.text)} 重复`);
        } else {
          seenTexts.set(rec.text, `${name}:${lineNo}`);
        }
      }

      for (const e of rep.errors) console.log(`  ERROR ${e}`);
      for (const w of rep.warnings) console.log(`  WARN  ${w}`);
      totalErrors += rep.errors.length;
      totalWarnings += rep.warnings.length;
      allRecords.push(rec);
    }
  }

  printCoverage(collectCoverage(allRecords), files.map((f) => basename(f)).join(' + '));

  console.log(`\n下一个可用 id：route ${suggestNextId(allRecords, 'route')}   content ${suggestNextId(allRecords, 'content')}`);
  console.log(`\n结果：${totalErrors} 个 ERROR，${totalWarnings} 个 WARN`);
  if (totalErrors > 0) console.log('状态：FAIL');
  else console.log('状态：PASS（WARN 不阻塞）');

  return totalErrors > 0 ? 1 : 0;
}

process.exitCode = main();
