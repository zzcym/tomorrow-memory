#!/usr/bin/env node
/**
 * 开工前自检 —— 30 秒告诉你「现在能做什么、还缺什么」。
 *
 * 用法：node eval/preflight.mjs
 * 退出码：有 BLOCK（阻塞训练/评测的项）时为 1。
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const results = [];
const add = (level, name, detail, hint) => results.push({ level, name, detail, hint });

const human = (bytes) => {
  const mb = bytes / 1024 / 1024;
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

// ---------- Node ----------

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor >= 20) add('OK', 'Node', `v${process.versions.node}`);
else add('BLOCK', 'Node', `v${process.versions.node} 太旧`, '需要 >= 20');

// ---------- .env ----------

const envPath = join(ROOT, '.env');
if (!existsSync(envPath)) {
  add('BLOCK', '.env', '不存在', 'copy .env.example .env');
} else {
  const env = readFileSync(envPath, 'utf8');
  const get = (key) => {
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const llmKey = get('DEEPSEEK_API_KEY');
  if (llmKey.length > 0) {
    add('OK', 'DEEPSEEK_API_KEY', `已配置（${llmKey.length} 字符）`);
  } else {
    add(
      'WARN',
      'DEEPSEEK_API_KEY',
      '空 —— 所有 AI 功能会静默降级成规则实现',
      '去 platform.deepseek.com 申请，填进 .env 第 31 行',
    );
  }

  const driver = get('DB_DRIVER');
  add('OK', 'DB_DRIVER', driver || '（空，默认 sqlite）');

  const jwt = get('JWT_SECRET');
  add(jwt ? 'OK' : 'WARN', 'JWT_SECRET', jwt ? '已配置' : '空 —— 登录会失败', jwt ? '' : '填一个 dev 值');
}

// ---------- 数据文件 ----------

const dataFiles = [
  { name: 'stardict.db', min: 500 * 1024 * 1024, use: '词典（分层抽样 + 词形校验）' },
  { name: 'examples.db', min: 10 * 1024 * 1024, use: '例句语料' },
  { name: 'data.db', min: 0, use: 'SQLite 业务库（用户/卡片）' },
];

for (const f of dataFiles) {
  const p = join(ROOT, f.name);
  if (!existsSync(p)) {
    add('BLOCK', f.name, '不存在', `需要 ${f.use}`);
    continue;
  }
  const size = statSync(p).size;
  if (size < f.min) {
    add('WARN', f.name, `${human(size)}，偏小`, `可能没解压完整（用途：${f.use}）`);
  } else {
    add('OK', f.name, human(size));
  }
}

// ---------- Python 训练环境 ----------

const venvPy = join(ROOT, '.venv-train', 'Scripts', 'python.exe');
if (!existsSync(venvPy)) {
  add(
    'BLOCK',
    '训练 venv',
    '.venv-train 不存在',
    'powershell -ExecutionPolicy Bypass -File training/setup-env.ps1',
  );
} else {
  add('OK', '训练 venv', '.venv-train/Scripts/python.exe');
  try {
    const out = execFileSync(
      venvPy,
      [
        '-c',
        'import torch,sys;print(sys.version.split()[0]);print(torch.__version__);print(torch.cuda.is_available());print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")',
      ],
      { encoding: 'utf8', timeout: 60_000 },
    )
      .trim()
      .split(/\r?\n/);
    const [pyVer, torchVer, cudaOk, device] = out;
    add('OK', 'Python', pyVer ?? '?');
    add('OK', 'PyTorch', `${torchVer} → ${device}`);
    if (cudaOk !== 'True') add('BLOCK', 'CUDA', 'torch.cuda.is_available() = False', '检查显卡驱动 / 是否装成 CPU 版 torch');
  } catch (e) {
    add('BLOCK', 'PyTorch', '导入失败', String(e.message).split('\n')[0]);
  }
  try {
    const vs = execFileSync(
      venvPy,
      ['-c', 'import transformers,peft,trl,bitsandbytes;print(transformers.__version__,peft.__version__,trl.__version__)'],
      { encoding: 'utf8', timeout: 60_000 },
    ).trim();
    add('OK', '训练栈', `transformers/peft/trl = ${vs}`);
  } catch {
    add('WARN', '训练栈', 'transformers/peft/trl/bitsandbytes 有缺失', '重跑 training/setup-env.ps1');
  }
}

// ---------- 评测集 ----------

const jsonlCount = (file) => {
  const p = join(HERE, file);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  return raw.split(/\r?\n/).filter((l) => l.trim() !== '').length;
};

const seedN = jsonlCount('seed.jsonl');
const goldN = jsonlCount('gold.jsonl');
const wordsN = jsonlCount('words.jsonl');

if (seedN === null) add('WARN', 'eval/seed.jsonl', '不存在', '创建它，写 30 条真实语料');
else if (seedN < 30) add('WARN', 'eval/seed.jsonl', `${seedN} 条`, `还差 ${30 - seedN} 条（目标 30）`);
else add('OK', 'eval/seed.jsonl', `${seedN} 条`);

if (goldN === null) add('WARN', 'eval/gold.jsonl', '不存在（正常，seed 写完再扩）', '');
else add(goldN >= 200 ? 'OK' : 'WARN', 'eval/gold.jsonl', `${goldN} 条`, goldN >= 200 ? '' : '目标 200 条');

add('OK', 'eval/words.jsonl', wordsN === null ? '未生成（跑 npm run eval:words）' : `${wordsN} 词`);

// ---------- git ----------

try {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (dirty.length > 0) {
    add('WARN', 'git', `${dirty.length} 个文件未提交`, '动手前先提交或 stash，否则分不清哪些是你改的');
  } else {
    add('OK', 'git', '工作区干净');
  }
} catch {
  add('WARN', 'git', '不可用', '');
}

// ---------- 输出 ----------

const icon = { OK: '[ OK ]', WARN: '[WARN]', BLOCK: '[FAIL]' };
console.log('\n===== 明日记忆 · 开工自检 =====\n');
for (const r of results) {
  console.log(`${icon[r.level]} ${r.name.padEnd(18)} ${r.detail}`);
  if (r.hint) console.log(`       └─ ${r.hint}`);
}

const blocks = results.filter((r) => r.level === 'BLOCK');
const warns = results.filter((r) => r.level === 'WARN');
console.log(`\n${blocks.length} 个阻塞项，${warns.length} 个警告项`);

if (blocks.length === 0) {
  console.log('\n可以开工。');
} else {
  console.log('\n阻塞项先解决，其余可以并行推进。');
}

process.exitCode = blocks.length > 0 ? 1 : 0;
