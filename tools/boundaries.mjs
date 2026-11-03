#!/usr/bin/env node
/**
 * tools/boundaries.mjs — T-02 静态断言门禁（grep 型 + 归属型）
 *
 * 真相源：
 *   §10.2 T-02 判据② ：旧口径文案 0 命中 / passwordUpgradeDeadline 0 命中 /
 *                      passwordUpgradeEnforce 引用点=1 / SET password 写入点=3 / 迁移禁词
 *   §3.5             ：ui-no-io 与 shared-pure 里"不是 import"的两条（fetch / process.env）
 *   §4.7 ⑥⑨⑩ + §6.4-2 步 8：禁语词表与开关默认值
 *   §6.5-4/5         ：users.password 写入点与 feature_flags 读取点
 *   §10.3 / §10.4    ：--check-ownership（落地件 tools/ownership.json）
 *   §10.2 T-14 ①② + A-24-1：--dist 产物门禁（无 / 开头资源路径 + 无 Chrome84 之后的 API，
 *                     与 apps/app/vite.config.ts 的 tm-app:dist-guard 取并集同口径）
 *   R-17 ⑥ + F-59 + A-106 判据③：首屏 JS 的 gzip 预算（256000 B，量 index.html 的初始 js）
 *   UI §8.2 1-7 / §9 ：零硬编码颜色、紫色退役、!important、outline-none、dark:、token 唯一定义源
 *   A-1 / A-3 / D-3  ：版本钉死只 grep pnpm-workspace.yaml 的 overrides（不 grep 根 package.json）
 *
 * 反"永真断言"设计：每条断言都在 --self-test 里同时要求
 *   (a) 故意违规 fixture → 必须红；(b) 干净 fixture → 必须绿；
 *   且 --self-test 断言"注册表里的每条断言都有 (a)(b) 两个用例"，缺用例本身就是红。
 *
 * 退出码：0 全绿 / 1 有红 / 2 用法或前置缺失（--self-test 不用 2）。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');
export const FIXTURES = path.join(REPO, 'tools', 'fixtures');
/** depcruise 的真 ESM 入口（.bin/depcruise 是 shell 包装，Windows 下不能直接 spawn）。 */
export const DEPCRUISE_BIN = path.join(REPO, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');

/**
 * 故意违规 fixture 的落点。它们的路径必须和真实包同名（否则 depcruise 的 `^packages/ui/`
 * 之类锚定规则抓不到），所以扫到仓库根时会自我污染 —— 默认整体摘掉。
 * 例外：从 fixture 目录内部起跑（--self-test 的用例）时不摘，否则自测就是空转。
 * `--scope all` 显式翻回"扫到 fixture"，用来自证这条摘除确实是有判定力的。
 */
export const FIXTURE_DIRS = [
  path.join(FIXTURES, 'selftest'),
  path.join(FIXTURES, 'depcruise'),
];
let allowFixtureScan = false;
const insideFixtures = (p) => FIXTURE_DIRS.some((d) => p === d || p.startsWith(d + path.sep));

/* ───────────────────────────── 小工具 ───────────────────────────── */

export const taskNum = (t) => {
  const m = /^T-(\d+)$/.exec(String(t || '').trim());
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const walk = (rootDir, { skip = DEFAULT_SKIP, exts = null } = {}) => {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  if (fs.statSync(rootDir).isFile()) return [rootDir];
  const rootedInsideFixtures = insideFixtures(path.resolve(rootDir));
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let dirents = [];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of dirents) {
      const full = path.join(dir, ent.name);
      const rel = toRel(rootDir, full);
      if (!allowFixtureScan && !rootedInsideFixtures && insideFixtures(path.resolve(full))) continue;
      if (ent.isDirectory()) {
        if (!skip.test(rel)) stack.push(full);
        continue;
      }
      if (skip.test(rel)) continue;
      if (exts && !exts.test(ent.name)) continue;
      out.push(full);
    }
  }
  return out.sort();
};

const toRel = (base, full) =>
  path.relative(base, full).replace(/\\/g, '/');

const DEFAULT_SKIP =
  /(^|\/)(node_modules|dist|build|coverage|\.next|\.turbo|_archive|pgdata|\.git)(\/|$)/;

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|html|htm|java|xml|json|sql|sh|py)$/i;
const STYLE_EXT = /\.(ts|tsx|js|jsx|css|html|xml)$/i;

const linesOf = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
};

/* ───────── A-101 (a)：命中类判据先剥注释（codeOnly 单点，A-32-5 的同族病根） ───────── */

/**
 * 注释方言按扩展名选。⚠ 不许把 `#` 当通用注释符：JS/CSS 里 `#22c55e` 正是被扫的色值本身，
 * 那样等于把「零硬编码颜色」整条判据搞瞎（A-27 的教训是反方向的 —— 那两处是注释里真写了色值，
 * 该改注释；这里是判定口径本身把"禁令的转述"当成了"违犯"）。
 */
const COMMENT_DIALECT = {
  clike: { line: ['//'], block: [['/*', '*/']] },
  css: { line: [], block: [['/*', '*/']] },
  markup: { line: [], block: [['<!--', '-->'], ['/*', '*/']] },
  hash: { line: ['#'], block: [] },
  sql: { line: ['--'], block: [['/*', '*/']] },
  none: { line: [], block: [] },
};

const dialectOf = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css' || ext === '.scss') return 'css';
  if (ext === '.html' || ext === '.htm' || ext === '.xml' || ext === '.vue') return 'markup';
  if (ext === '.sh' || ext === '.py' || ext === '.yml' || ext === '.yaml' || ext === '.toml') return 'hash';
  if (ext === '.sql') return 'sql';
  // JSON 没有注释：`//` 只可能出现在字符串里（例如 URL），不许当注释吃掉后半行。
  if (ext === '.json') return 'none';
  return 'clike';
};

/** 保留换行的"涂白"：注释区间变空格，行号与列位置一个都不动（A-24-1 命中可定位口径）。 */
const blankOut = (s) => s.replace(/[^\n]/g, ' ');

/**
 * 字符串/模板串感知的注释剥除器。整篇一次处理（块注释跨行，逐行独立处理会漏掉
 * `/*` 之后没有前导星号的那些续行 —— MeScreen 的注释体就是这种形状）。
 * 未闭合的单引号串按普通字符放过，避免把整行吞掉（宁可多报也不静默丢）。
 */
const stripComments = (text, dialect) => {
  const d = COMMENT_DIALECT[dialect] || COMMENT_DIALECT.clike;
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === ch) {
          j += 1;
          closed = true;
          break;
        }
        if (text[j] === '\n' && ch !== '`') break;
        j += 1;
      }
      out += closed ? text.slice(i, j) : ch;
      i = closed ? j : i + 1;
      continue;
    }
    let consumed = false;
    for (const [open, close] of d.block) {
      if (!text.startsWith(open, i)) continue;
      const end = text.indexOf(close, i + open.length);
      const stop = end === -1 ? n : end + close.length;
      out += blankOut(text.slice(i, stop));
      i = stop;
      consumed = true;
      break;
    }
    if (consumed) continue;
    for (const p of d.line) {
      if (!text.startsWith(p, i)) continue;
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += blankOut(text.slice(i, stop));
      i = stop;
      consumed = true;
      break;
    }
    if (consumed) continue;
    out += ch;
    i += 1;
  }
  return out;
};

const CODE_LINES_CACHE = new Map();

/** 与 `linesOf` 同长、同列的"剥注释后行数组"（同一文件一次读取，缓存给整轮扫描复用）。 */
const codeLinesOf = (file) => {
  const cached = CODE_LINES_CACHE.get(file);
  if (cached) return cached;
  let v;
  try {
    v = stripComments(fs.readFileSync(file, 'utf8'), dialectOf(file)).split(/\r?\n/);
  } catch {
    v = [];
  }
  CODE_LINES_CACHE.set(file, v);
  return v;
};

/**
 * 在若干扫描根里逐行 grep。
 * @returns {Array<{file:string,line:number,text:string,key:string}>}
 */
const grep = (spec) => {
  const { roots, exts = SOURCE_EXT, re, scopeRoot = REPO, skip = DEFAULT_SKIP } = spec;
  const hits = [];
  for (const root of roots) {
    const abs = path.isAbsolute(root) ? root : path.join(scopeRoot, root);
    for (const file of walk(abs, { exts, skip })) {
      const rel = toRel(scopeRoot, file);
      linesOf(file).forEach((text, i) => {
        if (re.test(text)) {
          hits.push({ file: rel, line: i + 1, text: text.trim(), key: `${rel}:${i + 1}` });
        }
      });
    }
  }
  return hits;
};

/**
 * A-101 (a) 的单点：同一次扫描同时给出「代码命中」与「只在注释里的命中」。
 * - `kept[i].text` 仍是**原文行**（例外台账的 `term` 匹配、`isRuntimeReadHit` 等既有语义不许被我改动）；
 * - `kept[i].codeText` 是剥注释后的同一行，供"形状"判据使用；
 * - 注释命中进 `commentOnly`，**必须被打印出来** —— 静默丢命中就等于把判据调瞎。
 */
const grepCode = (spec) => {
  const { roots, exts = SOURCE_EXT, re, scopeRoot = REPO, skip = DEFAULT_SKIP } = spec;
  const kept = [];
  const commentOnly = [];
  for (const root of roots) {
    const abs = path.isAbsolute(root) ? root : path.join(scopeRoot, root);
    for (const file of walk(abs, { exts, skip })) {
      const rel = toRel(scopeRoot, file);
      const raw = linesOf(file);
      const code = codeLinesOf(file);
      for (let i = 0; i < raw.length; i += 1) {
        if (!re.test(raw[i])) continue;
        const cl = i < code.length ? code[i] : raw[i];
        const base = { file: rel, line: i + 1, text: raw[i].trim(), key: `${rel}:${i + 1}` };
        if (re.test(cl)) kept.push({ ...base, codeText: cl.trim() });
        else commentOnly.push({ ...base, codeText: '' });
      }
    }
  }
  return { kept, commentOnly };
};

/** 「A-52 #135」这类台账引用里的 3~4 位纯十进制号不是色值（判据口径病，不是被扫内容的病）。 */
const LEDGER_HEX_TOKEN = /^#\d{1,4}\b/;
const LEDGER_HEX_PREFIX = /\bA-\d+\s+$/;

/**
 * 在一行的**代码部分**上逐 occurrence 判色值命中：只有"紧跟在 `A-<n> ` 之后的纯十进制 `#号`"
 * 被排除，其余一律保留。返回 null 表示这一行没有代码命中。
 */
const colorTokensOf = (codeText, re) => {
  const real = [];
  const ledger = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of codeText.matchAll(g)) {
    const tok = m[0];
    const before = codeText.slice(0, m.index ?? 0);
    if (LEDGER_HEX_TOKEN.test(tok) && LEDGER_HEX_PREFIX.test(before)) ledger.push(tok);
    else real.push(tok);
  }
  return { real, ledger };
};

const filterExceptionHits = (assertionId, hits, ctx) => {
  const kept = [];
  const exempted = [];
  for (const hit of hits) {
    const exc = ctx.exceptions.active.find(
      (e) =>
        e.engine === 'boundaries' &&
        e.assertion === assertionId &&
        new RegExp(e.file).test(hit.file) &&
        (!e.term || hit.text.includes(e.term)),
    );
    if (exc) {
      exempted.push({ ...hit, exc: exc.id });
      continue;
    }
    // 过期例外仍命中 → 单独标注，便于输出"过期例外仍存在即红"的人话。
    const dead = ctx.exceptions.expired.find(
      (e) =>
        e.engine === 'boundaries' &&
        e.assertion === assertionId &&
        new RegExp(e.file).test(hit.file) &&
        (!e.term || hit.text.includes(e.term)),
    );
    if (dead) hit.expiredException = dead.id;
    kept.push(hit);
  }
  return { kept, exempted };
};

/** depcruise JSON 里 violation.rule 是 {name, severity} 对象（18.3 实测），不是字符串。 */
const ruleName = (v) => String((v && (v.rule?.name ?? v.rule)) || '');
const preview = (hits, n = 6) =>
  hits
    .slice(0, n)
    .map(
      (h) =>
        `${h.file}:${h.line}${h.expiredException ? `(例外 ${h.expiredException} 已过期)` : ''}${h.token ? `[${h.token}]` : ''}`,
    )
    .join(' | ') + (hits.length > n ? ` …(+${hits.length - n})` : '');

/* ───────────────────────── 词表（§4.7⑥⑨ / UI §6.6） ───────────────────────── */

/** 硬零命中：界面与代码里出现即返工（UI §8.2-9/11/12 的 A 级子集）。 */
export const BANNED_TERMS = [
  // R-40 ⑨ / PRD §6.4-5-5：宽限期口径整体作废
  '以后再说', '稍后再改', '下次提醒', '宽限期', '截止日期',
  'passwordUpgradeDeadline',
  // R-39 ⑥ / PRD §8.3-D：凭据禁语（A-7：只禁"把验证码当出路"那两句句式，不定稿标签的子串）
  '忘记密码', '找回密码', '本期无法找回', '请用其他手机号注册',
  '请用验证码登录', '改用验证码登录',
  '旧进度无法迁移', '联系管理员', '重新注册', '换手机号',
  // R-25 ①：内部术语 → 人话（UI §6.2 右列）
  '未接入', '暂未支持', '24h 缓存', 'ClickHouse', '已连接', '未连接', '云端',
  '掌握度变化', '稳定度', '衰减曲线', 'retrievability',
  // 机器话兜底（UI §8.2-12）
  '暂无数据', '加载失败', '请求失败', 'No data', '[object Object]',
  // R-01 ⑥：验证码语境
  '请再按一次',
];

/** 需要人工复核的词（UI §8.2-9 明示"本地需人工复核"）→ 只报不红。 */
export const REVIEW_TERMS = ['本地', '已发送', 'FSRS', 'stability'];

/** §6.1 + §6.5-3 迁移禁词（红线，任何时候不豁免）。 */
export const MIGRATION_FORBIDDEN = [
  { id: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { id: 'DROP TABLE users', re: /\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?users\b/i },
  { id: 'RENAME', re: /\bRENAME\s+(COLUMN|TO|TABLE)?\b/i },
  { id: 'ALTER COLUMN 类型', re: /\bALTER\s+COLUMN\b|\bALTER\s+TABLE\s+\w+\s+(ALTER|TYPE)\b/i },
  { id: '回填 UPDATE users SET pw_policy_version', re: /\bUPDATE\s+users\s+SET\s+pw_policy_version\b/i },
  { id: '迁移内 UPDATE 回填', re: /^\s*UPDATE\s+\w+\s+SET\s+/i },
  { id: '迁移内 CURRENT_TIMESTAMP', re: /\bCURRENT_TIMESTAMP\b/i },
];

/** PRD §6.4-7 / §6.4-5 的开关初值（boundaries --flags 的期望表）。 */
export const FLAG_DEFAULTS = {
  wordbookIncremental: '0%',
  explicitFavorite: 'on',
  autoFavoriteDefault: 'off',
  studyModes: 'on',
  dailyReminder: 'on(20:30)',
  passwordRegister: 'on',
  avatarUnifiedLimit: 'on',
  passwordUpgradeEnforce: 'on',
};

/** §6.5-4：users.password 的 3 个合法写入点角色。 */
export const PASSWORD_WRITE_ROLES = {
  registration: { methods: ['createUser', 'insertUser', 'create'], re: /INSERT\s+INTO\s+users/i },
  activation: { methods: ['activateIfEmpty', 'activateUser', 'activate'], re: /password\s+IS\s+NULL|trim\s*\(\s*password\s*\)\s*=\s*''/i },
  'password-change': {
    methods: ['setPassword', 'changePassword', 'forceChangePassword', 'updatePassword', 'resetPassword'],
    re: null,
  },
};

/** 允许出现在 passwordUpgradeEnforce 引用点统计里的"定义/种子"位置（不是读取点）。 */
export const ENFORCE_DEFINITION_FILES = [
  /^packages\/shared\/src\/constants\/flags\.ts$/,
  /^packages\/server\/src\/db\/migrations\//,
  /^packages\/server\/src\/services\/feature-flags\.ts$/,
  /^packages\/server\/src\/config\.ts$/,
  /^tools\//,
];

/** 允许写颜色字面量的三个文件（UI §8.2-1 的字面白名单）。 */
export const COLOR_ALLOW_PATHS = [
  /(^|\/)tokens\.css$/,
  /(^|\/)tailwind-preset\.ts$/,
  /(^|\/)colors\.xml$/,
];

/* ───────── §3.5 第 1 行「不做 IO」的全局调用面（A-30-4：`--ui-io` 与 `--web` 共用一条） ───────── */

/**
 * 词项以**字符串**登记，两条断言各自拼成正则 —— 这样"谁比谁松"可机检
 * （`--self-test` 的 `webTransportParity()` 要求 `--web` 的词表 ⊇ 这张共用核心词表）。
 *
 * A-30-4 点名的三项就是 `fetch(` / `XMLHttpRequest` / `localStorage`；`axios` 是同族的全局
 * 请求出口，先放进共用核心（只加不减）。
 */
export const IO_GLOBALS_TERMS = [
  '(?<![\\w$.])fetch\\s*\\(',
  'XMLHttpRequest',
  'axios',
];
/**
 * §3.5 第 1 行「不做 IO」对 `packages/ui` 的要求比 web 更严：UI 连数据获取层都不许有，
 * 所以 React Query 的 `useQuery(` 也在 UI 的禁列。
 * 这一词**不能**并进共用核心：apps/web 的合法传输面就是 `@/lib/trpc` 的
 * `trpc.x.y.useQuery(...)`（§10.2 T-12 判据⑤ 只禁"裸 fetch"），并进核心会把
 * 被裁决判为合规的写法全部扫红。--self-test 的 `webTransportParity()` 盯住"核心 ⊆ 两侧"。
 */
export const UI_IO_EXTRA_TERMS = ['useQuery\\('];
/** A-30-4 点名 `--web` 额外禁的一词（首页与 lib/api 不得自己落本地存储）。只加不减。 */
export const WEB_IO_EXTRA_TERMS = ['(?<![\\w$.])localStorage'];
const ioTermsRe = (terms) => new RegExp(terms.join('|'));

/* ───────── A-32-5：什么才算"运行时读点" ───────── */

/** 纯注释行（在"写着禁令 / 反向声明"，不是执行读取）。与 `migration-forbidden` 同一判据。 */
const NON_CODE_LINE = /^\s*(?:\/\/|\/?\*|\/\*|--|<!--|#)/;
/** 测试面与取证脚本面：A-32-5 明令豁免。 */
const RUNTIME_READ_SKIP_PATH = [/(^|\/)tests?\//, /\.spec\.[cm]?[jt]sx?$/, /^packages\/server\/src\/scripts\//];

/**
 * A-101 (b)产品面 / (c)：「故意把禁键、禁串写进代码来证明哨兵还活着」的那几张面 ——
 * `test/**`、`*.spec.*`、`scripts/release/**`（发布护栏的反例夹具）。
 * 这些命中是**证据**不是违犯：不判红，但一律计入 detail / `noteHits` 报出来（⛔ 静默丢）。
 */
const NEGATIVE_EVIDENCE_PATH = [/(^|\/)tests?\//, /\.spec\.[cm]?[jt]sx?$/, /(^|\/)scripts\/release\//];
const isNegativeEvidence = (h) => NEGATIVE_EVIDENCE_PATH.some((re) => re.test(h.file));

/**
 * A-101 (b)：什么才算一个 Tailwind **变体**。`dark:` 冒号后必须紧贴工具名；
 * `dark: 'system'` / `dark:'x'` 是 TS 对象键或标签表（值前置空格或引号），不是变体。
 * 扫描仍用宽松的 `/\bdark:/`，这样"键位写法"能被单独报出来而不是悄悄看不见。
 */
const DARK_VARIANT = /\bdark:(?=[A-Za-z-])/;

/**
 * A-32-5（口径修正）：只数 `packages/server/src/**` 的**非注释运行时读点**。
 * 旧口径把「测试夹具里的 set('passwordUpgradeEnforce', …)」和「反向声明注释
 * （"本文件不解释任何开关的业务语义，也不点名 passwordUpgradeEnforce"）」一起计数，
 * 13 个命中里 11 个是噪音 → 门禁指向不存在的入口。
 * 这与 A-27 不矛盾：A-27 那两处是注释里真写了色值（被扫内容的问题，改注释），
 * 这里是"注释与测试夹具本来就不该算读点"（判定口径的问题）。
 */
const isRuntimeReadHit = (h) =>
  !NON_CODE_LINE.test(h.text) && !RUNTIME_READ_SKIP_PATH.some((re) => re.test(h.file));

/* ───────────────────────────── 断言注册表 ───────────────────────────── */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (terms) => new RegExp(terms.map(esc).join('|'));

/**
 * 0 命中型断言（旧口径文案 / 禁语 / 禁色…）。
 * A-101 (a)：判定看**剥注释后的代码行**，注释里的"禁令转述"不判红；但注释命中必须写进 detail
 * 并随 `--json` 一起出（`commentHits`）—— 静默丢命中就是第二条 A-32-5。
 */
const zeroHit = (spec) => (ctx) => {
  const { kept, commentOnly } = grepCode({
    ...spec,
    scopeRoot: ctx.scopeRoot,
    roots: spec.roots.map((r) => path.join(ctx.scopeRoot, r)),
  });
  const { kept: live, exempted } = filterExceptionHits(spec.id, kept, ctx);
  const note = `；注释内命中 ${commentOnly.length} 处按 A-101(a) 不判红${commentOnly.length ? `：${preview(commentOnly, 3)}` : ''}`;
  return live.length === 0
    ? {
        status: 'green',
        detail: `0 命中（扫描 ${spec.roots.join(', ')}）；例外豁免 ${exempted.length} 处${note}`,
        hits: exempted,
        commentHits: commentOnly,
      }
    : {
        status: 'red',
        detail: `${live.length} 处命中：${preview(live)}${note}`,
        hits: live,
        commentHits: commentOnly,
      };
};

/* ───── A-24-1：产物门禁 `--dist`（§10.2 T-14 判据①② + A-106 判据③ 首屏预算） ───── */

/**
 * **口径来源（A-24-1 铁律：两套不许有更松的一方）**
 * `apps/app/vite.config.ts` 的 `tm-app:dist-guard` 是 T-14 自建的构建期插件，它的清单就是
 * `--dist` 必须对齐的那套检查。下面每一条正则与该插件**逐字符同源**（`--self-test` 的
 * "口径对齐自检"会现读 vite.config.ts 机械核对 dist-guard ⊆ boundaries，改名/删条目即红）。
 * boundaries 侧允许**只朝更严的方向**有增量，增量在 detail 里报出来：
 *  - 覆盖面：dist-guard 的判据① 只扫 html/css、判据② 只扫 js/mjs；本脚本对**全部产物**
 *    （js/mjs/cjs/css/html/htm）同时跑两组检查；
 *  - 判据① 第 4 条 `DIST_ASSET_RULES[3]`：引号包住的根路径资源串（dist-guard 未覆盖）。
 *    资源扩展名白名单是刻意收窄的 —— SPA 路由串（`"/study"`）不是资源，不许误伤。
 */
const DIST_ASSET_RULES = [
  ['src="/…" 属性', /(?:src|href)\s*=\s*["']\//g],
  ['url(/…) ', /url\(\s*["']?\//g],
  ['import "/…" / from "/…"', /(?:import|from)\s*\(\s*["']\//g],
  ['"/…css" 根路径资源串', /["'`]\/[\w.@-][\w./@-]*\.(?:js|mjs|css|html|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map)\b/g],
];
/** 判据②：Chrome 84 之后才有的 API（esbuild 只降级语法、不补 API → 真机 TypeError）。 */
const DIST_BANNED_APIS = [
  ['structuredClone', /structuredClone\s*\(/g],
  ['Object.hasOwn', /Object\s*\.\s*hasOwn\s*\(/g],
  ['requestIdleCallback', /requestIdleCallback/g],
];
/* ── Array.prototype.at（Chrome 92）：与 dist-guard 同一套"归因"判据，含反报自检 ── */
const ANY_AT_CALL = /\.at\s*\(/g;
const ARRAY_PROTO_AT = /\bArray\s*\.\s*prototype\s*\.\s*at\b/g;
const AT_FEATURE_GUARD = /["']at["']\s*in\s+Array\s*\.\s*prototype/;
const OWN_AT_METHOD = /(?:^|[{};,])\s*at\s*\([^(){}]*\)\s*\{/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * 判据② 的 `.at` 部分（与 `vite.config.ts` 的 `atApiViolations` 同判据、默认判红）：
 *  1. `this.at(…)` 且**同一文件里存在自己的 `at(…)` 方法定义** → 命中的是那个方法，放行；
 *  2. `Array.prototype.at` 且同一文件里有 `"at" in Array.prototype` 特性探测 → 放行；
 * 其余一律红。返回 {index, term} 以便打印行/偏移。
 */
function distAtViolations(text) {
  const hasOwnAtMethod = new RegExp(OWN_AT_METHOD.source).test(text);
  const featureGuarded = new RegExp(AT_FEATURE_GUARD.source).test(text);
  const found = [];
  for (const match of text.matchAll(new RegExp(ANY_AT_CALL.source, 'g'))) {
    const dot = match.index ?? 0;
    let i = dot - 1;
    while (i >= 0 && IDENT_CHAR.test(text.charAt(i))) i -= 1;
    const receiver = text.slice(i + 1, dot);
    if (receiver === 'this' && hasOwnAtMethod) continue;
    found.push({ index: dot, term: `.at(（receiver=${receiver || '计算表达式/字面量'}，无自家 at 方法）` });
  }
  if (!featureGuarded) {
    for (const match of text.matchAll(new RegExp(ARRAY_PROTO_AT.source, 'g'))) {
      found.push({ index: match.index ?? 0, term: `Array.prototype.at（${match[0]}，无 "at" in Array.prototype 特性探测）` });
    }
  }
  return found;
}

/** dist-guard 那条 `.at` 规则的反"永真断言"自检（与 vite.config.ts 的 AT_RULE_SELF_TEST 同表）。 */
const AT_RULE_SELF_TEST = [
  ['const x=[1,2,3];return x.at(0)', true],
  ['return t.split(" ").at(-1)', true],
  ['return [1,2].at(0)', true],
  ['class C{m(){return this.at(0)}}', true],
  ['return Array.prototype.at.call(a,n)', true],
  ['class D{at(i){return i}m(){return this.at(1)}}', false],
  ['function cu(l,n){if("at"in Array.prototype)return Array.prototype.at.call(l,n);return l[n]}', false],
];

/** 产物扩展名与"不许跳过的目录"：本模式**故意不用** DEFAULT_SKIP（否则 dist/ 自己就被摘掉了）。 */
const DIST_EXT = /\.(js|mjs|cjs|css|html|htm)$/i;
const DIST_HTML_EXT = /\.(html|htm)$/i;
const DIST_JS_EXT = /\.(js|mjs|cjs)$/i;
const DIST_SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;

/* ── 判据③（A-106 / F-59）：首屏 JS 的 gzip 预算 ─────────────────────────
 * 出处 = `02-tech-design.md:571` R-17 的字面额「首屏 JS 预算 ≤ 250KB gzip」。
 * 封顶刻意取 **PRD/技术设计的字面值 256000 B**，⛔ 按某次实测值反推封顶
 * （那等于把阈值搬到产物脚下，产物再大也永远绿 —— 正是 A-101 判死的"永真断言"）。
 * 「在 CDP 用例里断言」那半句的落地口径见 A-105 #505：仓内无 CDP harness ⇒ 预算进本闸
 * （每次 `--dist`/`--all` 必跑），真机首帧由 #54b 装机清单覆盖，⛔ 当作已闭。
 * 目标集 = 浏览器为「画出首帧」必须拿到的 js：`<script type=module src>` +
 * `<link rel=modulepreload href>`。懒屏 chunk（各 Screen 的动态 import）不属首屏 ⇒ 不计。
 */
export const DIST_BUDGET_BYTES = 256000;

const htmlAttr = (tag, name) => {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"|\\b' + name + "\\s*=\\s*'([^']*)'"));
  return m ? m[1] !== undefined ? m[1] : m[2] : null;
};

/** index.html 里的首屏 JS 引用，按出现顺序去重。
 *  A-109：真机产物是**经典脚本**（判据④ 禁止 module），所以"首屏 JS"必须同时认
 *  `<script src>`；`modulepreload` 保留是为了在改判**前**的产物上也成立（⛔ 只认新形状＝旧形状漏判）。
 *  非 JS 的 `type`（`text/template` / `application/json` 之类）与内联无 src 的脚本都不计。 */
export const firstScreenJsRefs = (html) => {
  const out = [];
  const JS_TYPES = /^(?:text|application)\/(?:x-)?(?:javascript|ecmascript)$/i;
  for (const t of html.matchAll(/<(?:script|link)\b[^>]*/g)) {
    const tag = t[0];
    const ref = htmlAttr(tag, 'src') || htmlAttr(tag, 'href');
    if (!ref) continue;
    const typeAttr = htmlAttr(tag, 'type');
    const modScript = /^<script\b/.test(tag) && typeAttr === 'module';
    const classicScript = /^<script\b/.test(tag) && (typeAttr === null || JS_TYPES.test(typeAttr));
    const preload = /^<link\b/.test(tag) && /rel\s*=\s*["']modulepreload["']/.test(tag);
    if ((modScript || classicScript || preload) && !out.includes(ref)) out.push(ref);
  }
  return out;
};

const gzipBytes = (abs) => {
  try {
    return zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length;
  } catch {
    return null;
  }
};

/** dirs → 判据③ 结论。⛔「读不到就不算」：无 html / 0 颗引用 / 引用缺文件 一律红。 */
export const distBudget = (dirs) => {
  const rows = [];
  const missing = [];
  let htmlSeen = 0;
  let total = 0;
  for (const dir of dirs) {
    const html = path.join(dir, 'index.html');
    if (!fs.existsSync(html)) continue;
    htmlSeen += 1;
    const refs = firstScreenJsRefs(fs.readFileSync(html, 'utf8'));
    if (refs.length === 0) {
      return { ok: false, detail: `判据③ ${toRel(REPO, html) || html} 解析到 0 颗首屏 JS（经典 <script src> / <script type=module src> / <link rel=modulepreload href>）⇒ 预算断言失去对象，按未交付判红` };
    }
    for (const ref of refs) {
      const abs = path.resolve(dir, ref.replace(/^([./\\]+)/, ''));
      const n = gzipBytes(abs);
      if (n === null) { missing.push(`${ref}（${toRel(REPO, abs) || abs}）`); continue; }
      total += n;
      rows.push({ ref: ref.split('/').pop(), gzip: n });
    }
  }
  if (htmlSeen === 0) {
    return { ok: false, detail: `判据③ 扫到的目录里没有 index.html（${dirs.join(', ')}）⇒ 首屏无从量起，⛔ 读成"不适用即通过"` };
  }
  if (missing.length) {
    return { ok: false, detail: `判据③ 首屏引用的 js 不在盘上：${missing.join(' | ')} ⇒ 首帧必白屏，⛔ 按"读不到就不算"放行` };
  }
  const ok = total <= DIST_BUDGET_BYTES;
  const head = rows.slice(0, 4).map((r) => `${r.ref} ${r.gzip}`).join(' + ');
  return {
    ok,
    total,
    files: rows.length,
    detail: `判据③ 首屏 JS ${rows.length} 颗 gzip 合计 ${total} B ${ok ? '≤' : '>'} 封顶 ${DIST_BUDGET_BYTES} B（阈值出处 02-tech-design.md:571；${head}${rows.length > 4 ? ` +另 ${rows.length - 4} 颗` : ''}）`,
  };
};

const snippetOf = (text, from, len) =>
  text.slice(Math.max(0, from - 20), from + len + 40).replace(/\s+/g, ' ').trim().slice(0, 140);

/** 字符偏移 → 行 / 列（预换行索引表 + 二分，470KB 单行 bundle 也不退化）。 */
const positionOf = (offsets, text, index) => {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: index - offsets[lo] + 1 };
};
const lineOffsets = (text) => {
  const out = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
};

/** 产物里一条资源路径/API 用法的命中：`文件:行/偏移 + 命中串`。 */
const distHit = (file, rel, text, offsets, index, rule, term) => {
  const { line, column } = positionOf(offsets, text, index);
  const matched = text.slice(index, text.indexOf(' ', index) === -1 ? index + 60 : Math.min(index + 60, text.length));
  return {
    file: rel,
    line,
    column,
    offset: index,
    rule,
    term,
    text: snippetOf(text, index, matched.length),
    key: `${rel}:${line}:${index}:${term}`,
    absPath: file,
  };
};

/**
 * 「在」开头资源路径之外的第 4 组检查（判据④），A-109 / F-70：
 * 本目录会被 `mobile-memory/build-apk.sh` 原样塞进 `assets/`，由
 * `MainActivity.java:101` 的 `file:///android_asset/index.html` 加载 —— 而 stock Chromium
 * 在 file:// 下**根本不允许**跨源取源，实测错误原文（本机 Edge 153 headless + CDP，夹具
 * `E:\e5b\probe\p_mod.html`）：
 *   Access to script at 'file:///…' from origin 'null' has been blocked by CORS policy:
 *   Cross origin requests are only supported for protocol schemes: chrome-extension,
 *   chrome-untrusted, data, edge, http, https, isolated-app.
 * ⇒ `type="module"` / `crossorigin` / `rel="modulepreload"` 三种写法在真机上**必白屏**
 * （对照物：本仓唯一在用户手机上跑起来过的 `mobile-agenda/明日日程.apk`，其 index.html 全是
 * 经典 `<script src>`）。JS 侧同理：运行时 `import()` 与 `import.meta.url` 也是 CORS-mode 取源。
 * ⚠ `crossorigin` 只在 html 标签里判 —— react-dom 的产物里本就有这个词，判 JS 是误伤。
 */
const DIST_FILE_HTML_RULES = [
  ['type="module"', /<script\b[^>]*\btype\s*=\s*["']module["']/g],
  ['rel="modulepreload"', /<link\b[^>]*\brel\s*=\s*["']modulepreload["']/g],
  ['crossorigin 属性', /<(?:script|link)\b[^>]*\bcrossorigin\b/g],
];
const DIST_FILE_JS_RULES = [
  ['运行时 import()（CORS-mode 取源）', /\bimport\s*\(/g],
  ['import.meta（iife 产物不该有）', /\bimport\.meta\b/g],
];

/** 一个产物文件里的判据④ 命中（kind = 'html' | 'js'，两组词表互不通用）。 */
function distFileProtocolViolations(text, kind) {
  const found = [];
  for (const [term, re] of kind === 'html' ? DIST_FILE_HTML_RULES : DIST_FILE_JS_RULES) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      found.push({ index: m.index ?? 0, term, matched: m[0] });
    }
  }
  return found;
}

/** 判据④ 自身的反"永真"自检：任一条判错 → `--dist`/`--all` 直接红，规则不可能被改瞎。 */
const FILE_RULE_SELF_TEST = [
  ['<script type="module" src="./a.js">', true],
  ['<script src="./a.js" crossorigin>', true],
  ['<link rel="modulepreload" href="./a.js">', true],
  ['<link rel="stylesheet" href="./a.css">', false],
  ['<script src="./a.js"></script>', false],
];

/** 扫一个产物文件：判据①②④都跑（覆盖面严于 dist-guard）。 */
function scanDistFile(abs, rel) {
  const text = (() => {
    try {
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return '';
    }
  })();
  if (!text) return [];
  const offsets = lineOffsets(text);
  const hits = [];
  for (const [term, re] of DIST_ASSET_RULES) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      hits.push(distHit(abs, rel, text, offsets, m.index ?? 0, '判据①', term));
    }
  }
  for (const [term, re] of DIST_BANNED_APIS) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      hits.push(distHit(abs, rel, text, offsets, m.index ?? 0, '判据②', term));
    }
  }
  for (const { index, term } of distAtViolations(text)) {
    hits.push(distHit(abs, rel, text, offsets, index, '判据②', term));
  }
  const kind = DIST_HTML_EXT.test(abs) ? 'html' : DIST_JS_EXT.test(abs) ? 'js' : 'other';
  if (kind !== 'other') {
    for (const { index, term } of distFileProtocolViolations(text, kind)) {
      hits.push(distHit(abs, rel, text, offsets, index, '判据④', term));
    }
  }
  return hits;
}

/** dirs → {found:[绝对目录], missing:[绝对目录]}；解析顺序见下方注释。 */
const resolveDistDirs = (dirs, scopeRoot) => {
  const found = [];
  const missing = [];
  for (const raw of dirs) {
    for (const part of String(raw).split(',')) {
      const d = part.trim();
      if (!d) continue;
      /**
       * 解析顺序刻意是 scopeRoot → cwd：--self-test 用 scopeRoot 指向 fixture，
       * 若让 cwd 抢先就会去扫真仓库的 apps/app/dist（fixture 缺目录时静默假绿）。
       * 只有扫描根就是仓库根时，才允许回落到 cwd（支持在子目录里跑 `--dist dist`）。
       */
      const candidates = path.isAbsolute(d)
        ? [d]
        : [path.resolve(scopeRoot, d), ...(scopeRoot === REPO ? [path.resolve(process.cwd(), d)] : [])];
      const hit = candidates.find((c) => fs.existsSync(c));
      if (hit) found.push(hit);
      else missing.push(candidates[0]);
    }
  }
  return { found, missing };
};

/** `--dist` 与断言注册表共用的执行体。dirs 可以是相对 cwd/相对 scopeRoot/绝对路径。 */
export const runDistGuard = (dirs, ctx) => {
  const scopeRoot = (ctx && ctx.scopeRoot) || REPO;
  const { found, missing } = resolveDistDirs(dirs, scopeRoot);
  const files = found.flatMap((abs) => walk(abs, { exts: DIST_EXT, skip: DIST_SKIP }));
  const relOf = (f) => {
    const r = toRel(scopeRoot, f);
    return r && !r.startsWith('..') ? r : toRel(REPO, f);
  };
  const label = dirs.join(', ');
  /** 指定的目录只要有一个不存在，就必须让调用方（CLI）能给出"前置缺失"的退出码 2。 */
  const withMissing = (r) => (missing.length && !r.missingDirs ? { ...r, missingDirs: missing } : r);
  if (files.length === 0) {
    if (missing.length) {
      return taskNum((ctx && ctx.cursor) || 'T-14') < taskNum('T-14')
        ? { status: 'green', detail: `产物目录不存在：${missing.join(', ')}（待 T-14 build）`, hits: [], missingDirs: missing }
        : { status: 'red', detail: `找不到可扫描的产物：${missing.join(', ')} —— 先跑 pnpm --filter @tm/app build（断言失去对象即视为未交付）`, hits: [], missingDirs: missing };
    }
    return taskNum((ctx && ctx.cursor) || 'T-14') < taskNum('T-14')
      ? { status: 'green', detail: `${label} 内暂无产物（待 T-14 build）`, hits: [] }
      : { status: 'red', detail: `${label} 内没有 *.js/*.css/*.html 产物 —— 断言失去对象即视为未交付`, hits: [] };
  }
  const hits = files.flatMap((f) => scanDistFile(f, relOf(f)));
  const atSelfBad = AT_RULE_SELF_TEST.filter(([s, must]) => (distAtViolations(s).length > 0) !== must);
  if (atSelfBad.length) {
    return withMissing({
      status: 'red',
      detail: `.at 判据自身的反"永真"自检失败（${atSelfBad.length}/${AT_RULE_SELF_TEST.length} 条判错）：${atSelfBad.map(([s, w]) => `期望${w ? '红' : '绿'}:${s}`).join(' | ')}`,
      hits,
    });
  }
  const budget = distBudget(found);
  const fileSelfBad = FILE_RULE_SELF_TEST.filter(
    ([s, must]) => (distFileProtocolViolations(s, 'html').length > 0) !== must,
  );
  if (fileSelfBad.length) {
    return withMissing({
      status: 'red',
      detail: `判据④ 自身的反"永真"自检失败（${fileSelfBad.length}/${FILE_RULE_SELF_TEST.length} 条判错）：${fileSelfBad.map(([s, w]) => `期望${w ? '红' : '绿'}:${s}`).join(' | ')}`,
      hits,
    });
  }
  const at1 = hits.filter((h) => h.rule === '判据①').length;
  const at4 = hits.filter((h) => h.rule === '判据④').length;
  const at2 = hits.length - at1 - at4;
  const portability = `判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API（与 tm-app:dist-guard 同口径且覆盖面更全，A-24-1）、判据④ 0 处 file:// 取不到源的写法（A-109）`;
  if (hits.length === 0 && budget.ok) {
    return withMissing({
      status: 'green',
      detail: `${files.length} 个产物文件（js/css/html）：${portability}；${budget.detail}`,
      hits: [],
    });
  }
  const reasons = [];
  if (hits.length) {
    reasons.push(`${files.length} 个产物文件中 ${hits.length} 处命中（判据① ${at1} / 判据② ${at2} / 判据④ ${at4}）：${hits.slice(0, 3).map((h) => `${h.file}:${h.line}/${h.offset}[${h.term}]`).join(' | ')}`);
  }
  if (!budget.ok) reasons.push(budget.detail);
  return withMissing({ status: 'red', detail: reasons.join(' ⇒ '), hits });
};

/** 打印口径：`文件:行/偏移 + 命中串`（A-24-1 明确要求命中即可定位）。 */
export const fmtDistHit = (h) => `${h.file}:${h.line}/${h.offset}（第 ${h.line} 行第 ${h.column} 列）[${h.rule} ${h.term}] ${h.text}`;

export const ASSERTIONS = [
  /* ── 判据②-1 旧口径文案 0 命中 ───────────────────────────────────── */
  {
    id: 'copy-legacy-zero',
    title: '旧口径文案 0 命中（§4.7⑥⑨ / UI §6.6 / PRD §8.3-D）',
    enforce_from: 'T-02',
    roots: ['apps/web/src', 'apps/app/src', 'packages/ui/src', 'packages/shared/src', 'packages/server/src', 'packages/agent/src', 'mobile-memory'],
    run: (ctx) => {
      const z = zeroHit({
        id: 'copy-legacy-zero',
        roots: ctx.curRoots,
        exts: STYLE_EXT,
        re: termRe(BANNED_TERMS),
      })(ctx);
      const rv = zeroHit({
        id: 'copy-legacy-review',
        roots: ctx.curRoots,
        exts: STYLE_EXT,
        re: termRe(REVIEW_TERMS),
      })({ ...ctx, exceptions: { active: [], expired: [] } });
      return {
        status: z.status,
        detail:
          z.detail +
          `；需人工复核词命中 ${rv.hits.length} 处（不判红，UI §8.2-9 明示由走查确认）` +
          `；复核词的注释内命中 ${rv.commentHits.length} 处（同样只报不判）`,
        hits: z.hits,
        commentHits: z.commentHits,
        reviewCommentHits: rv.commentHits,
      };
    },
  },
  /* ── 判据②-2 passwordUpgradeDeadline 0 命中（零容忍，无例外通道） ── */
  {
    id: 'deadline-key-zero',
    title:
      '`passwordUpgradeDeadline` 在**运行面与配置面**0 命中（PRD §6.4-8 / §6.4-5-5，v1.2 宽限期作废）。' +
      'A-101 (c) 口径：判据语义 = `src/**` + 配置文件不许有这个键；`test/**`、`*.spec.*`、' +
      '`scripts/release/**` 是**故意写进来的反例夹具/哨兵清单**，计入 NOTE 不判红（这条裁定是 TPM 定的，非规范推导）',
    enforce_from: 'T-02',
    noExceptions: true,
    roots: ['apps', 'packages', 'mobile-memory', 'scripts', 'docker-compose.dev.yml', 'docker-compose.prod.yml', 'Caddyfile'],
    run: (ctx) => {
      const { kept, commentOnly } = grepCode({
        id: 'deadline-key-zero',
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: null,
        scopeRoot: ctx.scopeRoot,
        re: /passwordUpgradeDeadline/,
      });
      const live = [];
      const negative = [];
      for (const h of kept) {
        (NEGATIVE_EVIDENCE_PATH.some((re) => re.test(h.file)) ? negative : live).push(h);
      }
      const note =
        `；负例/测试面 ${negative.length} 处按 A-101(c) 计入不判红${negative.length ? `：${preview(negative, 3)}` : ''}` +
        `；注释内 ${commentOnly.length} 处不判红${commentOnly.length ? `：${preview(commentOnly, 3)}` : ''}`;
      return live.length === 0
        ? { status: 'green', detail: `运行面与配置面 0 命中${note}`, hits: [], noteHits: negative.concat(commentOnly) }
        : {
            status: 'red',
            detail: `${live.length} 处命中（运行面/配置面）：${preview(live)}${note}`,
            hits: live,
            noteHits: negative.concat(commentOnly),
          };
    },
  },
  /* ── 判据②-3 passwordUpgradeEnforce 运行时读点 = 1（A-32-5 口径修正） ── */
  {
    id: 'enforce-flag-single-read',
    title:
      '`passwordUpgradeEnforce` 的**运行时读点** = 1（§4.7 开关边界：只允许 auth-service.issueTokens 读）。' +
      'A-32-5 口径：**只数 `packages/server/src/**` 的非注释运行时读点**，豁免 `test/**` 与 `src/scripts/**`',
    enforce_from: 'T-07',
    roots: ['packages/server'],
    run: (ctx) => {
      const all = grep({
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: STYLE_EXT,
        scopeRoot: ctx.scopeRoot,
        re: /passwordUpgradeEnforce/,
      });
      const hits = all.filter((h) => !ENFORCE_DEFINITION_FILES.some((re) => re.test(h.file))).filter(isRuntimeReadHit);
      if (hits.length > 1) {
        return {
          status: 'red',
          detail:
            `运行时读点 ${hits.length} 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"；` +
            `口径 = 只数 packages/server/src/** 的非注释运行时读点，注释/测试/脚本 ${all.length - hits.length} 处噪音已按 A-32-5 剔除）：${preview(hits)}`,
          hits,
        };
      }
      if (hits.length === 1) {
        return {
          status: 'green',
          detail: `运行时读点 1 个：${hits[0].file}:${hits[0].line}（另有 ${all.length - hits.length} 处注释/测试/脚本命中，按 A-32-5 不计入读点）`,
          hits,
        };
      }
      if (taskNum(ctx.cursor) < taskNum('T-07')) {
        return { status: 'green', detail: '运行时读点 0 个 —— 待 T-07 接线（上限=1 已生效；口径 = 只数运行时读点）', hits: [] };
      }
      return { status: 'red', detail: '运行时读点 0 个 —— T-07 之后必须恰好 1 处（Q9\' 硬门禁未接线；口径 = 只数运行时读点）', hits: [] };
    },
  },
  /* ── 判据②-4 SET password 写入点 = 3 ───────────────────────────── */
  {
    id: 'password-write-points',
    title: '`SET password` 写入点 = 3（§6.5-4：注册新建 / 激活条件写 / 改密必验旧）',
    enforce_from: 'T-07',
    roots: ['apps', 'packages', 'scripts'],
    run: (ctx) => {
      const hits = grep({
        id: 'password-write-points',
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: STYLE_EXT,
        scopeRoot: ctx.scopeRoot,
        re: /SET\s+password\b/i,
      });
      const { kept, exempted } = filterExceptionHits('password-write-points', hits, ctx);
      const classified = kept.map((h) => ({ ...h, role: roleOfWritePoint(h, ctx) }));
      const rogue = classified.filter((h) => h.role === 'unknown');
      const roles = [...new Set(classified.filter((h) => h.role !== 'unknown').map((h) => h.role))].sort();
      if (rogue.length) {
        return {
          status: 'red',
          detail: `出现第 4 类写入点（角色无法归入 §6.5-4 的三种）：${preview(rogue)}`,
          hits: rogue,
        };
      }
      const msg = `角色 {${roles.join(',') || '—'}} = ${roles.length} 个；命中 ${classified.length} 处；例外豁免 ${exempted.length} 处`;
      if (roles.length === 3) return { status: 'green', detail: msg, hits: classified };
      if (taskNum(ctx.cursor) < taskNum(ctx.curAssertionEnforceFrom)) {
        return { status: 'green', detail: `${msg} —— 待 T-06/T-07 落库方法（越界写入已实时生效）`, hits: classified };
      }
      return { status: 'red', detail: `${msg} —— 要求恰好 3 类`, hits: classified };
    },
  },
  /* ── 判据②-5 迁移禁词 ───────────────────────────────────────────── */
  {
    id: 'migration-forbidden',
    title: '迁移禁词（§6.1 / §6.5-3：DROP / RENAME / ALTER COLUMN / 回填 UPDATE / CURRENT_TIMESTAMP）',
    enforce_from: 'T-06',
    roots: ['packages/server/src/db/migrations', 'packages/server/src/scripts'],
    run: (ctx) => {
      const roots = ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r));
      const files = roots.flatMap((r) => walk(r, { exts: /\.(ts|js|sql|mjs)$/i }));
      if (files.length === 0) {
        return taskNum(ctx.cursor) < taskNum('T-06')
          ? { status: 'green', detail: '迁移目录尚不存在（待 T-06 产出 000-006）', hits: [] }
          : { status: 'red', detail: 'T-06 之后仍找不到 packages/server/src/db/migrations/** —— 断言失去对象即视为未交付', hits: [] };
      }
      const hits = [];
      for (const file of files) {
        const rel = toRel(ctx.scopeRoot, file);
        linesOf(file).forEach((text, i) => {
          if (/^\s*(\/\/|\*|\/\*|--)/.test(text)) return; // 纯注释行是在"写着禁令"，不是执行禁令
          for (const { id, re } of MIGRATION_FORBIDDEN) {
            if (re.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim(), key: `${rel}:${i + 1}`, term: id });
          }
        });
      }
      const { kept, exempted } = filterExceptionHits('migration-forbidden', hits, ctx);
      const hard = kept.filter((h) => !/^迁移内 (UPDATE 回填|CURRENT_TIMESTAMP)$/.test(h.term));
      const red = hard.length ? hard : kept;
      return red.length === 0
        ? { status: 'green', detail: `0 命中（扫描 ${files.length} 个文件；例外豁免 ${exempted.length} 处）`, hits: exempted }
        : { status: 'red', detail: `${red.length} 处命中：${red.map((h) => `${h.file}:${h.line}[${h.term}]`).slice(0, 8).join(' | ')}`, hits: red };
    },
  },
  /* ── 迁移 down()/noDownReason 声明（§6.1 ②，只读断言，不改 T-06 的实现） ── */
  {
    id: 'migration-down-declared',
    title: '每个迁移有 `down()` 或 `noDownReason`（§6.1 静态自检 / T-06 判据③）',
    enforce_from: 'T-06',
    roots: ['packages/server/src/db/migrations'],
    run: (ctx) => {
      const dir = path.join(ctx.scopeRoot, 'packages/server/src/db/migrations');
      const files = walk(dir, { exts: /\.ts$/i });
      if (files.length === 0) {
        return taskNum(ctx.cursor) < taskNum('T-06')
          ? { status: 'green', detail: '待 T-06 产出迁移文件', hits: [] }
          : { status: 'red', detail: 'T-06 之后迁移目录为空 —— 未交付', hits: [] };
      }
      const bad = files.filter((f) => {
        const src = linesOf(f).join('\n');
        return !/\bdown\s*[(:=]/.test(src) && !/noDownReason\s*[:=]/.test(src);
      });
      return bad.length === 0
        ? { status: 'green', detail: `${files.length} 个迁移全部声明 down() 或 noDownReason`, hits: [] }
        : { status: 'red', detail: `${bad.length} 个迁移缺 down()/noDownReason：${bad.map((f) => toRel(ctx.scopeRoot, f)).join(', ')}`, hits: bad.map((f) => ({ file: toRel(ctx.scopeRoot, f), line: 1, text: '', key: f })) };
    },
  },
  /* ── T-04 冒烟命令 --tokens（UI §1.12 / §8.2-1） ─────────────────── */
  {
    id: 'tokens-single-source',
    title: '`tokens.css` 是 --brand/--surface/--ink/--hair 的唯一定义处（T-04 判据②）',
    enforce_from: 'T-04',
    roots: ['apps', 'packages'],
    run: (ctx) => {
      const hits = grep({
        id: 'tokens-single-source',
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: /\.(css|ts|tsx|js|html)$/i,
        scopeRoot: ctx.scopeRoot,
        re: /^\s*--(brand|surface|ink|hair)\s*:/,
      });
      const outside = hits.filter((h) => !/(^|\/)styles\/tokens\.css$|(^|\/)tokens\.css$/.test(h.file));
      if (outside.length) {
        return { status: 'red', detail: `${outside.length} 处变量定义在 tokens.css 之外：${preview(outside)}`, hits: outside };
      }
      if (hits.length === 0) {
        return taskNum(ctx.cursor) < taskNum('T-04')
          ? { status: 'green', detail: 'tokens.css 待 T-04 产出（重复定义已实时拦截）', hits: [] }
          : { status: 'red', detail: 'T-04 之后仍无 --brand/--surface/--ink/--hair 定义 —— token 单一源未落地', hits: [] };
      }
      return { status: 'green', detail: `${hits.length} 处定义全部在 tokens.css`, hits };
    },
  },
  {
    id: 'globals-css-no-brand-hex',
    title: 'globals.css 内不含任何十六进制品牌色（T-04 判据①）',
    enforce_from: 'T-04',
    roots: ['apps/web/src/app/globals.css'],
    run: (ctx) => zeroHit({
      id: 'globals-css-no-brand-hex',
      roots: ['apps/web/src'],
      exts: /\.css$/i,
      re: /#[0-9a-fA-F]{3,8}\b/,
    })(ctx),
  },
  /* ── UI §8.2 的 grep 断言（A 级） ───────────────────────────────── */
  {
    id: 'colors-no-hardcode',
    title: '零硬编码颜色：hex / rgb() / hsl() 字面量（UI §8.2-1）',
    enforce_from: 'T-04',
    roots: ['apps', 'packages', 'mobile-memory'],
    run: (ctx) => hardColorLike(ctx, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, 'colors-no-hardcode'),
  },
  {
    id: 'colors-purple-retired',
    title: '紫色退役：#8b5cf6 / #7c3aed / 262 83%（UI §8.2-2）',
    enforce_from: 'T-04',
    roots: ['apps', 'packages', 'mobile-memory'],
    run: (ctx) => hardColorLike(ctx, /8b5cf6|7c3aed|262\s+83%/, 'colors-purple-retired'),
  },
  {
    id: 'colors-tailwind-palette',
    title: '语义类唯一：禁 Tailwind 原生调色板类（UI §8.2-4）',
    enforce_from: 'T-04',
    roots: ['apps', 'packages'],
    run: (ctx) => zeroHit({
      id: 'colors-tailwind-palette',
      roots: ctx.curRoots,
      exts: STYLE_EXT,
      re: /\b(?:bg|text|border|from|to|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/,
    })(ctx),
  },
  {
    id: 'css-important-budget',
    title:
      '`!important` ≤1 且必须在 reduced-motion 块内带 a11y-exception 注释（UI §8.2-5）。' +
      'A-101 (b) 口径：只数**产品面**（`test/**`、`*.spec.*`、`scripts/release/**` 是反例面）且**形状必须是样式**' +
      '（CSS 声明 `prop: value !important` 或 class 串里写 `!important`）；' +
      '`expect(src).not.toMatch(/!important/)` 那类"拿禁字当探针"的写法不计红，但逐处报出',
    enforce_from: 'T-04',
    roots: ['apps', 'packages'],
    run: (ctx) => {
      const { kept, commentOnly } = grepCode({
        id: 'css-important-budget',
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: /\.(css|tsx?)$/i,
        scopeRoot: ctx.scopeRoot,
        re: /!important/,
      });
      const offFace = [];
      const wrongShape = [];
      const styled = [];
      for (const h of kept) {
        if (isNegativeEvidence(h)) {
          offFace.push(h);
          continue;
        }
        // 样式上下文的两条形状：声明位置上的 `!important`，或 class/className 串里写的 `!important`。
        const shape =
          /[-\w]\s*:\s*[-\w\s,./%#()]*!important/.test(h.codeText) || /class(?:Name)?[^;]*!important/.test(h.codeText);
        (shape ? styled : wrongShape).push(h);
      }
      const note =
        `；未计入 ${offFace.length} 处反例面${offFace.length ? `（${preview(offFace, 3)}）` : ''}` +
        `、${wrongShape.length} 处非样式形状${wrongShape.length ? `（${preview(wrongShape, 3)}）` : ''}` +
        `、${commentOnly.length} 处注释`;
      const uncounted = offFace.concat(wrongShape);
      /**
       * 合规判据读**原文**：`a11y-exception: R-22` 与 `prefers-reduced-motion` 本来就是注释与选择器，
       * 用剥注释后的文本查会把合规标记自己查没 —— 这条是刻意不对称的（A-101(b) 注记）。
       */
      const bad = styled.filter((h) => {
        const file = path.join(ctx.scopeRoot, h.file);
        const src = linesOf(file).join('\n');
        const near = src.split(/\r?\n/).slice(Math.max(0, h.line - 16), h.line + 2).join('\n');
        return !/prefers-reduced-motion/.test(near) || !/a11y-exception: R-22/.test(src);
      });
      if (styled.length > 1)
        return {
          status: 'red',
          detail: `!important 样式面出现 ${styled.length} 处 >1：${preview(styled)}${note}`,
          hits: styled,
          noteHits: uncounted,
          commentHits: commentOnly,
        };
      if (bad.length)
        return {
          status: 'red',
          detail: `唯一一条 !important 未挂在 reduced-motion 块或缺 a11y-exception 注释：${preview(bad)}${note}`,
          hits: bad,
          noteHits: uncounted,
          commentHits: commentOnly,
        };
      return {
        status: 'green',
        detail: `!important 样式面 ${styled.length} 处（预算 1，且合规）${note}`,
        hits: styled,
        noteHits: uncounted,
        commentHits: commentOnly,
      };
    },
  },
  {
    id: 'focus-ring-not-hidden',
    title: '焦点环不被抹掉：outline-none / outline: none（UI §8.2-6）',
    enforce_from: 'T-04',
    roots: ['apps', 'packages'],
    run: (ctx) => zeroHit({
      id: 'focus-ring-not-hidden',
      roots: ctx.curRoots,
      exts: STYLE_EXT,
      re: /outline-none|outline:\s*none|focus:outline-none/,
    })(ctx),
  },
  {
    id: 'dark-variant-budget',
    title:
      '深色只走变量：`dark:` ≤3，且 `dark:bg-[` / `dark:text-[#` = 0（UI §8.2-7）。' +
      'A-101 (b) 口径：数的是**类名变体**（冒号后紧贴工具名，如 `dark:bg-black/60`），' +
      '对象键与标签表里的 `dark: \'system\'` 是 TS 字面量不是变体 ⇒ 不计红、逐处报出',
    enforce_from: 'T-04',
    roots: ['packages/ui/src', 'apps'],
    run: (ctx) => {
      const { kept, commentOnly } = grepCode({
        id: 'dark-variant-budget',
        roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
        exts: /\.tsx$/i,
        scopeRoot: ctx.scopeRoot,
        re: /\bdark:/,
      });
      const keyLike = [];
      const variants = [];
      for (const h of kept) {
        // 计数按 occurrence：一行里 `dark:` 出现两次就是两个变体（预算是个数，不是行数）。
        const n = (h.codeText.match(new RegExp(DARK_VARIANT.source, 'g')) || []).length;
        (n ? variants : keyLike).push({ ...h, n });
      }
      const total = variants.reduce((s, h) => s + h.n, 0);
      const arbitrary = variants.filter((h) => /dark:(?:bg|text)-\[/.test(h.codeText));
      const note =
        `；键位写法 ${keyLike.length} 行按 A-101(b) 不计红${keyLike.length ? `（${preview(keyLike, 3)}）` : ''}` +
        `、注释内 ${commentOnly.length} 处`;
      if (arbitrary.length)
        return {
          status: 'red',
          detail: `dark: + 任意值（UI §5.5 禁止）：${preview(arbitrary)}${note}`,
          hits: arbitrary,
          noteHits: keyLike,
          commentHits: commentOnly,
        };
      if (total > 3)
        return {
          status: 'red',
          detail: `dark: 变体出现 ${total} 处 >3，须逐条对 UI §5.5 例外表：${preview(variants)}${note}`,
          hits: variants,
          noteHits: keyLike,
          commentHits: commentOnly,
        };
      return {
        status: 'green',
        detail: `dark: 变体 ${total} 处（预算 3，覆盖 ${variants.length} 行）${note}`,
        hits: variants,
        noteHits: keyLike,
        commentHits: commentOnly,
      };
    },
  },
  /* ── §3.5 里 depcruise 看不见的两条 ─────────────────────────────── */
  {
    id: 'ui-no-io-globals',
    title: 'ui-no-io（全局调用面）：packages/ui 内不得出现 fetch( / XMLHttpRequest / useQuery(（§3.5 第 1 行）',
    enforce_from: 'T-04',
    roots: ['packages/ui/src'],
    run: (ctx) => zeroHit({
      id: 'ui-no-io-globals',
      roots: ctx.curRoots,
      exts: STYLE_EXT,
      re: ioTermsRe([...IO_GLOBALS_TERMS, ...UI_IO_EXTRA_TERMS]),
    })(ctx),
  },
  /* ── A-30-4：`--web`（§10.2 T-12 判据⑤ 的机检落点，出口轮 E1 还账） ── */
  {
    id: 'web-home-transport',
    title:
      '首页传输面越界（§10.2 T-12 判据⑤ / A-30-4）：`(user)/page.tsx` + `components/home/**` + `lib/api/**` ' +
      '不得出现 fetch( / XMLHttpRequest / localStorage —— 与 `--ui-io` **同一条检查、同一张共用核心词表**' +
      '（`IO_GLOBALS_TERMS`），只加不减',
    enforce_from: 'T-12',
    roots: ['apps/web/src/app/(user)/page.tsx', 'apps/web/src/components/home', 'apps/web/src/lib/api'],
    run: (ctx) => zeroHit({
      id: 'web-home-transport',
      roots: ctx.curRoots,
      exts: STYLE_EXT,
      re: ioTermsRe([...IO_GLOBALS_TERMS, ...WEB_IO_EXTRA_TERMS]),
    })(ctx),
  },
  {
    id: 'shared-pure-env',
    title: 'shared-pure（运行时面）：packages/shared 内不得有 process.env / require(（§3.5 第 3 行）',
    enforce_from: 'T-03',
    roots: ['packages/shared/src'],
    run: (ctx) => zeroHit({
      id: 'shared-pure-env',
      roots: ctx.curRoots,
      exts: STYLE_EXT,
      re: /process\.env|\brequire\s*\(|from\s+['"]node:/,
    })(ctx),
  },
  /* ── §6.4-2 步 8 开关默认值 / RK-10 版本钉死（A-1：只 grep pnpm-workspace.yaml） ── */
  {
    id: 'flag-defaults-match-prd',
    title: '开关默认值 = PRD §6.4-7（passwordUpgradeEnforce 必须 on）',
    enforce_from: 'T-03',
    roots: ['packages/shared/src/constants/flags.ts'],
    run: (ctx) => {
      const file = path.join(ctx.scopeRoot, 'packages/shared/src/constants/flags.ts');
      if (!fs.existsSync(file)) {
        return taskNum(ctx.cursor) < taskNum('T-03')
          ? { status: 'green', detail: '待 T-03 产出 constants/flags.ts', hits: [] }
          : { status: 'red', detail: 'T-03 之后 constants/flags.ts 仍不存在 —— 开关默认值无单一源', hits: [] };
      }
      const src = linesOf(file).join('\n');
      const bad = [];
      for (const [key, want] of Object.entries(FLAG_DEFAULTS)) {
        const m = new RegExp(`${esc(key)}\\s*:\\s*(?:JSON\\.stringify\\()?s*['"\`]([^'"\`]*)['"\`]`).exec(src);
        if (!m) bad.push(`${key}=缺失（应为 ${want}）`);
        else if (m[1] !== want) bad.push(`${key}=${m[1]}（应为 ${want}）`);
      }
      return bad.length === 0
        ? { status: 'green', detail: `8 个开关初值与 PRD §6.4-7 全等`, hits: [] }
        : { status: 'red', detail: bad.join('；'), hits: [] };
    },
  },
  {
    id: 'version-pin-overrides',
    title: 'RK-10/A-1：react/react-dom/@types/*/ts-fsrs/zod 在 pnpm-workspace.yaml:overrides 钉成精确版本，且根 package.json 不再写 pnpm.overrides',
    enforce_from: 'T-01',
    roots: ['pnpm-workspace.yaml', 'package.json'],
    run: (ctx) => {
      const ws = path.join(ctx.scopeRoot, 'pnpm-workspace.yaml');
      const pkg = path.join(ctx.scopeRoot, 'package.json');
      const problems = [];
      if (!fs.existsSync(ws)) problems.push('pnpm-workspace.yaml 不存在');
      else {
        const src = linesOf(ws).join('\n');
        const block = /\boverrides:\s*\n((?:[ \t]+.*\n?)*)/.exec(src);
        if (!block) problems.push('pnpm-workspace.yaml 无 overrides: 段（A-1 钉版本落点）');
        else {
          for (const key of ['react', 'react-dom', '@types/react', '@types/react-dom', 'ts-fsrs', 'zod']) {
            const re = new RegExp(`^\\s*'?${esc(key)}'?\\s*:\\s*['"]?([^'"s#]+)`, 'm');
            const m = re.exec(block[1]);
            if (!m) problems.push(`overrides 缺 ${key}`);
            else if (/[\^~*x]/.test(m[1])) problems.push(`overrides ${key}=${m[1]} 是区间不是精确版本`);
          }
        }
      }
      if (fs.existsSync(pkg)) {
        try {
          const j = readJson(pkg);
          if (j && j.pnpm && j.pnpm.overrides) problems.push('根 package.json 又出现了 pnpm.overrides（A-1 明令禁止）');
        } catch {
          /* package.json 语法问题由 typecheck/install 负责报，不在此断言 */
        }
      }
      return problems.length === 0
        ? { status: 'green', detail: '6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮', hits: [] }
        : { status: 'red', detail: problems.join('；'), hits: [] };
    },
  },
  /* ── §6.5-5 feature_flags 读取点计数（与 enforce-flag-single-read 同族的上限断言） ── */
  {
    id: 'route-string-preserved',
    title: '旧接口路径字符串不得被删除/改名（§6.5-1：routes/*.ts 的既有路径清单比对）',
    enforce_from: 'T-08',
    roots: ['packages/server/src/routes'],
    run: (ctx) => {
      const dir = path.join(ctx.scopeRoot, 'packages/server/src/routes');
      const files = walk(dir, { exts: /\.ts$/i });
      if (files.length === 0) return { status: 'green', detail: 'routes/** 不存在（跳过）', hits: [] };
      const src = files.map((f) => linesOf(f).join('\n')).join('\n');
      const required = [
        '/api/auth/login', '/api/auth/register', '/api/review/today', '/api/wordbook',
        '/api/profile', '/api/checkin', '/api/lookup', '/api/chat',
      ];
      const missing = required.filter((p) => !src.includes(p));
      if (missing.length === 0) {
        return { status: 'green', detail: `旧路径清单 ${required.length} 条全部在册`, hits: [] };
      }
      /*
       * A-12：给本断言接上 exceptions.json 的同一套例外结构（规则 × 文件粒度，带 reason 与
       * expires_after，沿用"过期例外仍存在即红"）。为此每条消失的路径必须落成**真实存在**的
       * file:line 命中行 —— 锚点只在 packages/server/src/routes/** 里量（同资源模块优先，
       * 再取与本条路径共有分段最多的现存路径字面量所在行），不猜文件名、不造行号。
       * 清单本身一字未改（不删路径、不放宽 `src.includes`、不降 warn）：未登记的路径照旧红。
       */
      const hits = missing.map((p) => {
        const anchor = routeAnchorFor(p, files, ctx.scopeRoot);
        return {
          file: anchor.file,
          line: anchor.line,
          term: p,
          key: `${anchor.file}:${anchor.line}:${p}`,
          text: `${p} 已从 routes/** 消失（锚点 ${anchor.file}:${anchor.line}${anchor.near ? ` 现存最近实现 ${anchor.near}` : '，该模块内无同类路径字面量'}）`,
        };
      });
      const { kept, exempted } = filterExceptionHits('route-string-preserved', hits, ctx);
      if (kept.length === 0) {
        return {
          status: 'green',
          detail: `消失 ${missing.length} 条：${missing.join(', ')} —— 全部在已登记例外内（未过期，例外豁免 ${exempted.length} 处）`,
          hits: exempted,
        };
      }
      return {
        status: 'red',
        detail: `旧接口路径消失：${kept.map((h) => h.term).join(', ')}；锚点 ${preview(kept)}（例外豁免 ${exempted.length} 处）`,
        hits: kept,
      };
    },
  },
  /* ── A-24-1：产物门禁（`--dist <dir>` 的注册表落点，判据①②） ────── */
  {
    id: 'dist-artifact-portability',
    title: '产物可移植性 + 首屏预算 + file:// 取源形状：dist 内无 / 开头资源路径、无 Chrome84 之后的 API、无 module/crossorigin/运行时 import()、首屏 JS gzip ≤ 256000 B（§10.2 T-14 判据①② / A-24-1 + R-17 ⑥ / F-59 / A-106 判据③ + A-109/F-70 判据④）',
    enforce_from: 'T-14',
    noExceptions: true,
    roots: ['apps/app/dist'],
    run: (ctx) => runDistGuard(ctx.curRoots, ctx),
  },
];

/**
 * `route-string-preserved` 的命中锚点：只在真实存在的 routes 文件里取真实行号。
 * 1) 路径里除 `api` 外的任一分段与模块文件名相同 → 只在这些文件里找（`/api/auth/*` → `auth.ts`）；
 * 2) 行 = 该池内"与消失路径共有分段最多"的那条 `/api/...` 字面量所在行（并列取最先出现者）；
 * 3) 池内没有任何路径字面量 → 退回该池首个文件的第 1 行（仍是真实文件，可被逐文件例外登记）。
 */
function routeAnchorFor(missingPath, files, scopeRoot) {
  const segsOf = (p) => String(p).split('/').filter((s) => s && s !== 'api');
  const missingSegs = segsOf(missingPath);
  const missingTail = missingSegs[missingSegs.length - 1];
  const sameResource = files.filter((f) => missingSegs.includes(path.basename(f).replace(/\.ts$/i, '')));
  const pool = sameResource.length ? sameResource : files;
  let best = null;
  for (const f of pool) {
    const lines = linesOf(f);
    for (let i = 0; i < lines.length; i += 1) {
      const m = /['"`](\/api\/[^'"`\s]*)['"`]/.exec(lines[i]);
      if (!m) continue;
      const cs = segsOf(m[1]);
      const missingSet = new Set(missingSegs);
      const score = cs.filter((s) => missingSet.has(s)).length + (cs[cs.length - 1] === missingTail ? 3 : 0);
      if (!best || score > best.score) {
        best = { file: toRel(scopeRoot, f), line: i + 1, near: m[1], score };
      }
    }
  }
  if (best) return best;
  return { file: toRel(scopeRoot, pool[0]), line: 1, near: null };
}

/**
 * 类颜色字面量断言：允许 UI §8.2-1 点名的三个文件，其余全红。
 * A-101 (a)：判定面 = 剥注释后的代码行；`A-52 #135` 这类**台账引用**单独归类不判红。
 * 两类"没算进红"的命中都必须出现在 detail 与 `--json` 的 `commentHits` 里。
 */
function hardColorLike(ctx, re, assertionId) {
  const { kept: scanned, commentOnly } = grepCode({
    id: assertionId,
    roots: ctx.curRoots.map((r) => path.join(ctx.scopeRoot, r)),
    exts: STYLE_EXT,
    scopeRoot: ctx.scopeRoot,
    re,
  });
  const colorish = [];
  const ledgerRefs = [];
  for (const h of scanned) {
    const t = colorTokensOf(h.codeText, re);
    const bucket = t.real.length ? colorish : ledgerRefs;
    bucket.push({ ...h, token: (t.real.length ? t.real : t.ledger).join(' ') });
  }
  const { kept, exempted } = filterExceptionHits(assertionId, colorish, ctx);
  const bad = kept.filter((h) => !COLOR_ALLOW_PATHS.some((allow) => allow.test(h.file)));
  const notes = [];
  if (commentOnly.length) notes.push(`注释内命中 ${commentOnly.length} 处不判红：${preview(commentOnly, 3)}`);
  if (ledgerRefs.length) notes.push(`台账引用（A-<n> #号）${ledgerRefs.length} 处不判红：${preview(ledgerRefs, 3)}`);
  const note = notes.length ? `；${notes.join('；')}` : '';
  if (bad.length) {
    return {
      status: 'red',
      detail: `${bad.length} 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：${preview(bad)}${note}`,
      hits: bad,
      noteHits: ledgerRefs,
      commentHits: commentOnly,
    };
  }
  return {
    status: 'green',
    detail: `白名单内 ${kept.length} 处，其余 0 命中；例外豁免 ${exempted.length} 处${note}`,
    hits: kept,
    noteHits: ledgerRefs,
    commentHits: commentOnly,
  };
}

/** SET password 命中的写入点角色判定（§6.5-4 的三种角色，判不出即第 4 类 = 红）。 */
function roleOfWritePoint(hit, ctx) {
  const file = path.join(ctx.scopeRoot, hit.file);
  const lines = linesOf(file);
  let enclosing = '';
  for (let i = hit.line - 1; i >= 0 && i >= hit.line - 40; i -= 1) {
    const m = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*(?::[^({]+)?\{?\s*$/.exec(lines[i] || '');
    if (m && !/^(if|for|while|switch|catch|return|else|try)$/.test(m[1])) {
      enclosing = m[1];
      break;
    }
  }
  const window = lines.slice(Math.max(0, hit.line - 12), hit.line + 3).join('\n');
  for (const [role, spec] of Object.entries(PASSWORD_WRITE_ROLES)) {
    if (spec.methods.includes(enclosing)) return role;
    if (spec.re && spec.re.test(window)) return role;
  }
  return 'unknown';
}

/* ───────────────────────────── 归属校验（§10.3/§10.4） ───────────────────────────── */

const globToRe = (glob) => {
  let src = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '{') {
      const end = glob.indexOf('}', i);
      const alts = glob.slice(i + 1, end).split(',');
      src += `(?:${alts.map((a) => a.replace(/[.*+?^$|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
      continue;
    }
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        src += '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
        continue;
      }
      src += '[^/]*';
      continue;
    }
    src += ch.replace(/[.*+?^$|[\]\\()]/g, '\\$&');
  }
  return new RegExp(`^${src}$`);
};

/** 条目能否命中该路径：rootOnly 只管仓库根；per_file 字典里有精确键即算命中（E4a 实测语义，见 --self-test 用例）。 */
export const ownershipEntryHits = (rel, entry) => {
  if (entry.rootOnly && rel.includes('/')) return false;
  if (entry.per_file && entry.per_file[rel]) return true;
  return globToRe(entry.path).test(rel);
};

/**
 * E4a 件 3：条目排序缺陷的修复（对照实验与钉死用例在 `ownershipE4aCases()` / --self-test）。
 *
 * 旧实现的缺陷（本函数此前是 `.sort((a, b) => b.path.length - a.path.length)`，按**模式串字符数**降序）：
 *  ① 模式串长度 ≠ 具体度：花括号枚举条目 `pkg/deep/{a.ts,z.ts}`（19 字符）比精确条目
 *     `pkg/deep/a.ts`（12 字符）长 ⇒ 旧比较器让 glob 赢 = 更具体条目被兜底/枚举条目压住；
 *     同理任意 `X/**` 兜底与具体条目的胜负取决于文件名长度，与"谁更具体"无关。
 *  ② 同长度并列时 V8 sort 是稳定排序 ⇒ 胜负由条目在 JSON 里的**书写顺序**决定 —— 同一张表
 *     换个书写顺序，owner 判定就翻转（--self-test 用例①b 用 `aa/b.ts` vs `aa/*.ts` 这对 7 字符等长条目钉住这一条）。
 *
 * 新比较器四档，全部与书写顺序解耦：
 *  a) 无通配的精确条目恒赢含通配条目；
 *  b) 首个通配符（`*` 或 `{`）之前的字面量前缀更长者赢（最长前缀 = 最具体）；
 *  c) 通配符个数更少者赢（`**` 兜底天然沉底）；
 *  d) 终极平手按 path 字符串字典序 —— 同一张表的任意排列判定结果恒等。
 */
const ownershipSpecificity = (entry) => {
  const p = String(entry.path || '');
  const firstWild = p.search(/[*{]/);
  return {
    exact: firstWild === -1 ? 1 : 0,
    literalLen: firstWild === -1 ? p.length : firstWild,
    wildcards: (p.match(/[*{]/g) || []).length,
  };
};

/** 找出命中该路径的全部归属条目（最具体的那条排在最前）。 */
export const matchOwnership = (rel, table) =>
  table.ownership
    .filter((entry) => ownershipEntryHits(rel, entry))
    .sort((a, b) => {
      const sa = ownershipSpecificity(a);
      const sb = ownershipSpecificity(b);
      if (sa.exact !== sb.exact) return sb.exact - sa.exact;
      if (sa.literalLen !== sb.literalLen) return sb.literalLen - sa.literalLen;
      if (sa.wildcards !== sb.wildcards) return sa.wildcards - sb.wildcards;
      return String(a.path).localeCompare(String(b.path));
    });

const ownersOf = (entry, rel) => {
  if (entry.per_file && entry.per_file[rel]) return [entry.per_file[rel]];
  return String(entry.owner)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * F-41（A-81 #287，E4c-i 修）：旧写法 `const entry = entries[0]` = **胜者通吃**，
 * 同一条具体度档位上并列的多条目里，后写者携带的授权永远读不到（实测：同一颗
 * `apps/app/test/login-screen.spec.tsx`，改前 `--task T-19c` 判 RED、把帽子并进先写条目才 GREEN，
 * A-81 #284）。当时的过渡口径是"授权一律并入既有条目、不许同路径再建一条"，那是账面绕法，
 * 语义洞还在。
 *
 * 新语义 = **同档并列取并集，冲突即拒判（exit 2）**：
 *   并：`owner` / `readers` / `actions` / `zeroDiffFor` 取并集，`maxDiffLinesFor` /
 *       `baselineRegenerateFor` / `blockAppendFor` / `per_file` 按键取并；
 *   拒：同一颗任务键在并列的两条里声明了**不同**的值（或并列两条各带一份不同的
 *       `predecessorAllowedDiff`）⇒ 这是账面矛盾，**绝不静默取大**（取了大就等于"再建一条来扩额度"
 *       这条缝被程序买通），判 exit 2 让 TPM 并条。
 * 只在"并列条数 > 1"时生效：单条命中路径上的判定与改前逐字节等价（`--all` 与真表 349 文件的
 * 非回归对照由 E4c-i 的实测出证，见 A-93）。
 */
const sameTier = (a, b) => {
  const sa = ownershipSpecificity(a);
  const sb = ownershipSpecificity(b);
  return sa.exact === sb.exact && sa.literalLen === sb.literalLen && sa.wildcards === sb.wildcards;
};

const dictFields = {
  maxDiffLinesFor: '幅度上限',
  baselineRegenerateFor: '基线再生清单',
  blockAppendFor: '块内追加封顶',
};

const unionDict = (conflicts, tag, rel, keyName, label, merged, list) => {
  for (const src of list) {
    const dict = src[keyName];
    if (!dict || typeof dict !== 'object') continue;
    for (const [k, v] of Object.entries(dict)) {
      if (!(k in merged)) merged[k] = v;
      else if (JSON.stringify(merged[k]) !== JSON.stringify(v)) {
        conflicts.push(`${rel}：${tag} 并列条目对 ${keyName}["${k}"]（${label}）声明了不同的值 = 账面矛盾，拒判 —— 请把两条并成一条，⛔ 不许靠"再加一条"扩额度（F-41）`);
      }
    }
  }
  return merged;
};

export const pickOwnership = (rel, table) => {
  const entries = matchOwnership(rel, table);
  if (entries.length === 0) return { entry: null, tied: [], conflicts: [] };
  const tied = entries.filter((e) => sameTier(e, entries[0]));
  if (tied.length === 1) return { entry: entries[0], tied, conflicts: [] };
  const conflicts = [];
  const merged = { ...entries[0] };
  const uniq = (lists) => [...new Set([].concat(...lists))];
  merged.owner = uniq(tied.map((e) => ownersOf(e, rel))).join(',');
  merged.readers = uniq(tied.map((e) => e.readers || []));
  merged.actions = uniq(tied.map((e) => e.actions || []));
  merged.zeroDiffFor = uniq(tied.map((e) => e.zeroDiffFor || []));
  merged.per_file = unionDict(conflicts, `[${tied.map((e) => e.path).join(' | ')}]`, rel, 'per_file', '逐文件 owner', {}, tied);
  for (const [keyName, label] of Object.entries(dictFields)) {
    merged[keyName] = unionDict(conflicts, `[${tied.map((e) => e.path).join(' | ')}]`, rel, keyName, label, {}, tied);
  }
  /* 并列条目都没声明过的键不要留成 `{}`（`{}` 是真值，会让"未声明"读起来像"声明了 0"）。 */
  for (const keyName of Object.keys(dictFields).concat(['per_file'])) {
    if (Object.keys(merged[keyName]).length === 0) delete merged[keyName];
  }
  const preds = tied.filter((e) => e.predecessorAllowedDiff).map((e) => JSON.stringify(e.predecessorAllowedDiff));
  if (preds.some((p) => p !== preds[0])) {
    conflicts.push(`${rel}：并列条目各带一份不同的 predecessorAllowedDiff = 账面矛盾，拒判（F-41）`);
  }
  merged.handoff = tied.some((e) => e.handoff === true);
  merged.__tied = tied.map((e) => e.path);
  return { entry: merged, tied, conflicts };
};

const IMPORT_STMT = /^\s*(import|export)\b.*\bfrom\b|^\s*(import|export)\b[^'"]*['"][^'"]+['"]/;

/** 逐行标出"属于 import 语句的行"（含多行 `import {\n a,\n} from 'x'`）。 */
const importLineSet = (lines) => {
  const set = new Set();
  let depthOpen = false;
  lines.forEach((text, i) => {
    if (IMPORT_STMT.test(text)) {
      set.add(i);
      depthOpen = !/from\s+['"][^'"]+['"]\s*;?\s*$/.test(text) && !/['"]\s*;?\s*$/.test(text);
      return;
    }
    if (depthOpen) {
      set.add(i);
      if (/from\s+['"][^'"]+['"]\s*;?\s*$|^\s*}\s*;?\s*$/.test(text)) depthOpen = false;
    }
  });
  return set;
};

/** package.json 里 dependencies / devDependencies 两个块的行号集合。 */
const depRangeSet = (lines) => {
  const set = new Set();
  let inBlock = false;
  lines.forEach((text, i) => {
    if (/^\s*"(dev)?[Dd]ependencies"\s*:\s*\{/.test(text)) inBlock = true;
    if (inBlock) set.add(i);
    if (inBlock && /^\s*\},?\s*$/.test(text)) inBlock = false;
  });
  return set;
};

/**
 * package.json 里 `"scripts"` 块的行号集合（A-34-3 的判据面）。
 * 与 depRangeSet 同一条"进到块里/出块"的写法，但**不开嵌套**：scripts 的值全是字符串，
 * 谁在里面塞了子对象就不是 package.json 的 scripts 块了，宁可判红。
 * 块外的行（含 dependencies/devDependencies/版本行/"name"）天然不在集合里 = 越界。
 */
const scriptBlockSet = (lines) => {
  const set = new Set();
  let inBlock = false;
  lines.forEach((text, i) => {
    if (!inBlock && /^\s*"scripts"\s*:\s*\{/.test(text)) inBlock = true;
    if (inBlock) set.add(i);
    if (inBlock && /^\s*\},?\s*$/.test(text)) inBlock = false;
  });
  return set;
};

/**
 * 解析 unified diff，按文件给出 {added:[{line,text}], removed:[{line,text}]}。
 *
 * 两处归属修正（E1c 收口轮，实测复现于 `--check-ownership` 的多文件 patch）：
 * ① `diff --git a/x b/x` 是**文件段起点**：必须把 `cur` 复位，否则下一个文件段的
 *    `--- a/...` 头会被当成**上一个文件**的删除行 —— 纯追加 patch 一合并就凭空多
 *    N-1 行"改写"，block-append / extend-supplement 直接误红（T-04 报告 E-10/X-2 记过同一条）。
 * ② 同一路径出现第二个 `+++` 头时**累加**而不是覆盖：否则"把一个文件的大改拆成两个
 *    文件头"只会被数到最后一段 = 假绿（`ownershipActionChannels()` 的注释早就警告过这个坑，
 *    但警告不是机检 —— 现在它是）。
 * 两条都是**收紧**方向：只会让原先漏放的更严，不会把合规改动判红。
 */
export const parsePatch = (patchText) => {
  const files = new Map();
  let cur = null;
  let oldNo = 0;
  let newNo = 0;
  const lines = patchText.split(/\r?\n/);
  for (let li = 0; li < lines.length; li += 1) {
    const raw = lines[li];
    if (/^diff --git /.test(raw)) { cur = null; continue; }
    /**
     * F-45（A-84 #306 / A-90 #347，E4c-i 修）：`--- a/path` 是**文件头**，不是删行。
     * git 形状下有上面那行复位游标挡着它；纯 `diff -u` 多文件拼接时它落在**上一颗文件**的
     * `cur` 上 ⇒ 每段幅度虚高 1 行（末段除外），E4b2 实测把 42 行顶成 43 行触发拒判。
     * 判据不依赖 `diff --git` 是否存在：unified diff 里 `--- ` 头恒与下一行的 `+++ ` 头**相邻成对**
     * （内容里的删行不可能同时造出这对邻居），所以只看邻居关系即可复位游标。
     * ⛔ 反"永真"配套用例在 `patchHeaderIsNotADeletion` 组（A-92 #360 要求能区分
     *   "闸门虚高"与"agent 自己漏计裸 `+` 新增空行"两类，故同组里空行那颗也各钉一侧）。
     */
    if (/^---\s/.test(raw) && /^\+\+\+\s/.test(lines[li + 1] === undefined ? '' : lines[li + 1])) { cur = null; continue; }
    const fileM = /^\+\+\+\s+(?:[ab]\/)?(.+?)(?:\t|$)/.exec(raw);

    if (fileM) {
      const name = fileM[1].trim();
      if (name !== '/dev/null') {
        const rel = name.replace(/\\/g, '/');
        cur = files.get(rel) || { file: rel, added: [], removed: [] };
        files.set(rel, cur);
      } else {
        cur = null;
      }
      continue;
    }
    const hunkM = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunkM) {
      oldNo = Number(hunkM[1]);
      newNo = Number(hunkM[2]);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('+')) {
      cur.added.push({ line: newNo, text: raw.slice(1) });
      newNo += 1;
    } else if (raw.startsWith('-')) {
      cur.removed.push({ line: oldNo, text: raw.slice(1) });
      oldNo += 1;
    } else if (raw.startsWith('\\')) {
      /* \ No newline at end of file */
    } else {
      oldNo += 1;
      newNo += 1;
    }
  }
  return files;
};

/** §10.4 登记的"改动幅度"判定。返回 null=无约束。 */
const diffAllowed = (constraint, rel, change, ctx) => {
  if (!constraint) return null;
  const kind = constraint.kind;
  if (kind === 'any') return null;
  const total = change.added.length + change.removed.length;
  if (Number.isFinite(constraint.maxDiffLines) && total > constraint.maxDiffLines) {
    return `diff ${total} 行 > 允许的 ${constraint.maxDiffLines} 行`;
  }
  if (kind === 'zero-diff' || constraint.zeroDiff) {
    return total > 0 ? `要求零 diff，实际 ${total} 行变更` : null;
  }
  const abs = path.join(ctx.scopeRoot, rel);
  const lines = linesOf(abs);
  if (kind === 'import-lines-only' || kind === 'single-import-line') {
    const allowed = importLineSet(lines);
    const stray = [...change.added, ...change.removed].filter((c) => !allowed.has(c.line - 1));
    if (stray.length) return `只允许改 import 行，实际有 ${stray.length} 行非 import 变更（如 ${rel}:${stray[0].line} "${stray[0].text.trim().slice(0, 40)}"）`;
    return null;
  }
  if (kind === 'add-dependency-lines-only') {
    const range = depRangeSet(lines);
    if (change.removed.length) return `只允许新增依赖行，实际删除/改写了 ${change.removed.length} 行`;
    const stray = change.added.filter((c) => !range.has(c.line - 1) && !/^\s*"[^"]+"\s*:\s*["'][^"']+["'],?\s*$/.test(c.text));
    if (stray.length) return `新增行不在 dependencies/devDependencies 段内：${rel}:${stray[0].line}`;
    return null;
  }
  return `未知改动幅度类型 ${kind}`;
};

/* ───────── §10.4 四条"有限授权动作通道"（A-28-3 / A-30-8 / A-30-10 + A-34-3 预留，出口轮 E1a 落地） ─────────
 *
 * 共同硬约束（A-33-4 第 4 条最后一句：绝不允许交一个不咬人的空壳）：
 *   1) 四条通道**全部按实际 diff 判定**，清单里点个文件名不构成授权；
 *   2) 没有 diff 证据（没配 --diff-file，或 patch 里没有这个文件）= 判红并写明"要证据"，
 *      绝不"无 patch 就放行"（A-30-10 报的就是这个病：有限授权只要列进 --files 就必红，
 *      反过来的写法是"只要不列就必绿"，同样是空壳）；
 *   3) 每条通道都有 --self-test 的红/绿用例对（`ownershipActionChannels()`，用例自己在临时目录
 *      里造归属表 + 目标文件 + patch，红绿两侧都跑真 checkOwnership），以及报告里的活体疫苗
 *      （真跑一次 CLI：越界 patch → 红 → 换成合规 patch → 绿 → 删沙盒）。
 */

/** 纯追加 = diff 里 0 行删除（改写会同时产生 - 和 +，所以改写也会被这条挡掉）。 */
const isPureInsertion = (change) => change.removed.length === 0;

/**
 * §4.6 冻结面：`TM_ERROR_CODES` / `TM_ERROR_ROWS` / `TM_ERRORS` 三个符号的**行区间**。
 * 从声明行起按括号深度配平到 0 为止（`as const`、`Object.freeze(...)`、模板字面量都吃得下）。
 * 符号改名/找不到 = 该符号不在区间表里，由 --self-test 的 frozenRegionsSane() 用例盯住。
 */
export const FROZEN_SHARED_ERROR_SYMBOLS = ['TM_ERROR_CODES', 'TM_ERROR_ROWS', 'TM_ERRORS'];

const braceDepthDelta = (text) => {
  let d = 0;
  let inStr = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') break;
    if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 1; continue; }
    if ('{(['.includes(ch)) d += 1;
    if ('})]'.includes(ch)) d -= 1;
  }
  return d;
};

const frozenSymbolRanges = (lines, symbols = FROZEN_SHARED_ERROR_SYMBOLS) => {
  const ranges = [];
  symbols.forEach((sym) => {
    const start = lines.findIndex((l) => new RegExp(`^\\s*(export\\s+)?(const|let|var)\\s+${esc(sym)}\\b`).test(l));
    if (start === -1) return;
    let depth = 0;
    let end = lines.length - 1;
    for (let i = start; i < lines.length; i += 1) {
      depth += braceDepthDelta(lines[i]);
      if (depth <= 0) { end = i; break; }
    }
    ranges.push({ sym, from: start, to: end });
  });
  return ranges;
};

/**
 * 具名符号的行区间（A-35-11：block-append 用）。
 * 支持 const/let/var/function/class/interface 声明；从声明行起按括号深度配平到 0 为止。
 * 与 `frozenSymbolRanges` 同口径，但不限定是 §4.6 错误码符号，可查任意命名的顶层块。
 * 找不到符号 = 不在区间表里（由调用方判"找不到块"，不放行）。
 */
const namedBlockRanges = (lines, names) => {
  const ranges = [];
  names.forEach((sym) => {
    const re = new RegExp(`^\\s*(export\\s+(default\\s+)?)?(const|let|var|function|class|interface)\\s+${esc(sym)}\\b`);
    const start = lines.findIndex((l) => re.test(l));
    if (start === -1) return;
    let depth = 0;
    let end = lines.length - 1;
    for (let i = start; i < lines.length; i += 1) {
      depth += braceDepthDelta(lines[i]);
      if (depth <= 0) { end = i; break; }
    }
    ranges.push({ sym, from: start, to: end });
  });
  return ranges;
};

/** 通道①：`delete-expired-entry`（A-28-3，落点 = tools/exceptions.json）。 */
const judgeDeleteExpiredEntry = (rel, change, task) => {
  if (!change) return `动作通道 delete-expired-entry 要证据：本文件没有出现在 --diff-file 的 patch 里（只在 --files 清单里点名不算授权）`;
  if (change.added.length) {
    return `delete-expired-entry 只许"删"：patch 里有 ${change.added.length} 行新增/改写（如 ${rel}:${change.added[0].line} "${change.added[0].text.trim().slice(0, 40)}")`;
  }
  if (!change.removed.length) return 'delete-expired-entry 没有任何删除行 = 空授权';
  /* 被删的行必须能拼回**完整的条目对象**，且每条的 expires_after 正好是当前任务号。
   * 半条目的删除（改了字段、删了括号的一半）JSON.parse 直接失败 = 红。 */
  const body = change.removed.map((r) => r.text).join('\n').trim();
  const tries = [`[${body.replace(/,\s*$/, '')}]`, `{"exceptions":[${body.replace(/,\s*$/, '')}]}`];
  let parsed = null;
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      parsed = Array.isArray(v) ? v : v.exceptions;
      break;
    } catch { /* 换下一种拼法 */ }
  }
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return `delete-expired-entry：删掉的 ${change.removed.length} 行拼不回完整条目（只许整条删除，不许改字段/删半截）`;
  }
  const bad = parsed.filter((e) => !e || e.expires_after !== task);
  if (bad.length) {
    return `delete-expired-entry：删了未到期条目 ${bad.map((e) => `${(e && e.id) || '(非条目)'}(expires_after=${e && e.expires_after})`).join(', ')}，当前任务 ${task} 只许删 expires_after=${task} 的条目`;
  }
  return null;
};

/** 通道②：`extend-supplement`（A-30-8 + A-28-4，落点 = packages/shared/src/constants/errors.ts）。 */
const judgeExtendSupplement = (rel, change, ctx) => {
  if (!change) return '动作通道 extend-supplement 要证据：本文件没有出现在 --diff-file 的 patch 里';
  if (!isPureInsertion(change)) {
    return `extend-supplement 的硬条件是"0 既有行变更"（A-30-8），实际有 ${change.removed.length} 行删除/改写`;
  }
  const ranges = frozenSymbolRanges(linesOf(path.join(ctx.scopeRoot, rel)));
  const inside = change.added.filter((a) => ranges.some((r) => a.line - 1 >= r.from && a.line - 1 <= r.to));
  if (inside.length) {
    const r = ranges.find((x) => inside[0].line - 1 >= x.from && inside[0].line - 1 <= x.to);
    return `extend-supplement：追加落进 §4.6 冻结符号 ${r.sym}（${r.from + 1}-${r.to + 1} 行）的第 ${inside.length} 行 —— 三个冻结集合一字不能动，只能进 TM_ERRORS_SUPPLEMENT`;
  }
  return null;
};

/**
 * 通道③：`bounded-edit:<裁决号>`（A-30-10：按实际 diff 行判定，不按清单）。
 *
 * 证据基线口径（A-35-1③ / T-11-fix3 §4.3 实测坑）：
 *   bounded-edit 要求 agent 自证 diff（改前快照 → 改后，仅含本轮增量），不收 HEAD 相对 diff。
 *   HEAD 相对 diff 会把他人未提交改动（如 T-04 在 page.tsx 里的 6 行 import 改动）混入，
 *   导致 total 虚高、误红合法授权。
 *
 * 返回语义（三态）：
 *   null → 放行
 *   string → 违规（exit 1）
 *   { reject: true, msg: string } → 证据形状不符（exit 2，A-35-11），不是"你超幅了"而是"证据不可信"
 */
const judgeBoundedEdit = (rel, entry, task, change, adjudication, patchProvided) => {
  const cap = entry.maxDiffLinesFor && entry.maxDiffLinesFor[task];
  if (!Number.isFinite(cap)) {
    return `bounded-edit:${adjudication} 未给 ${task} 声明 maxDiffLinesFor.${task} = 无上限授权，拒绝判定（宁可红也不放行未登记的幅度）`;
  }
  /**
   * F-52（A-88 #332，E4c-i 处置）：把两件事分开 ——
   *   ① **给了 patch** 而这颗文件不在里面 = 清单诚实申报"本轮 0 行消费" ⇒ 放行 + NOTE。
   *      这不放松任何判据：真改了盘就一定在 patch 里（patch 由改前快照 vs 改后生成），
   *      而 `--files` 之外被 patch 带出来的文件会进 touched 参与判定（`checkOwnership` 里那行 push）。
   *   ② **压根没有 --diff-file** ⇒ 仍是"要证据"（A-30-10 口径一寸不动：bounded-edit 无 patch 直接红）。
   * 旧写法把 ① 也判 exit 1，而它自己的文案写着"点个名不构成授权，也不构成违规" = 文案与判定矛盾。
   */
  if (!change) {
    if (patchProvided) return null;
    return `bounded-edit:${adjudication} 要证据：本次没传 --diff-file，无从核对幅度（清单里点个名不构成授权；bounded-edit 要自证 scoped diff，不收 HEAD diff）`;
  }
  // HEAD diff contamination detection (A-35-1③ / T-11-fix3 §4.3):
  // If the removals alone exceed the entire budget, the evidence is almost certainly a HEAD-relative
  // diff with other agents' uncommitted changes mixed in — refuse judgment, not a violation.
  if (change.removed.length > cap) {
    return { reject: true, msg: `bounded-edit:${adjudication} 拒判：patch 含 ${change.removed.length} 行删除/改写，远超授权上限 ${cap} 行 —— 证据疑似 HEAD 相对 diff（混入他人未提交改动），请传入 agent 自证 scoped patch（改前快照 → 改后，仅含本轮增量），不收 HEAD diff` };
  }
  const total = change.added.length + change.removed.length;
  if (total === 0) return null;
  if (total > cap) return `bounded-edit:${adjudication} 允许 ≤${cap} 行实际变更，patch 里是 ${total} 行（若混入他人改动请改用自证 scoped patch；不收 HEAD diff）`;
  return null;
};

/**
 * 纯插入 patch 的"插入缝"位置换算（E1c 收口轮补的洞，A-35-11 / A-34-3 共用）。
 * patch 给的是 **post-image** 行号，而块区间是在**改动前**的文件上算的，直接比会整体
 * 下移一行 —— 实测两个后果：
 *   ① 紧贴具名块上方插一行被算成 `block-append` 块内追加（`--check-ownership --task T-25` 判"无越界"）；
 *   ② 紧贴 `"scripts"` 块上方插一行被算成 `add-script-lines-only` 块内新增（`--task T-13` 判"无越界"）。
 * 第 i 条新增行（按 post 行号升序、i 从 0 起）两侧在 pre 坐标里是
 * `above = line-2-i` / `below = line-1-i`，**两者都在块内**才叫块内追加。
 * 方向上是收紧：只会把原先漏放的改严，不会把合规改动判红。
 */
const insertionGaps = (added) => {
  const order = added.slice().sort((x, y) => x.line - y.line);
  const m = new Map();
  order.forEach((a, i) => m.set(a, { above: a.line - 2 - i, below: a.line - 1 - i }));
  return m;
};
/** 返回"插入缝不在块内"的新增行（块上方/块下方插行都算块外）。 */
const gapsOutside = (added, isInside) => {
  const gaps = insertionGaps(added);
  return added.filter((a) => {
    const g = gaps.get(a);
    return !g || !isInside(g.above) || !isInside(g.below);
  });
};

/**
 * 通道④：`add-script-lines-only:<裁决号>`（A-34-3 预留；E1b 在 tools/ownership.json 里
 * 给 `apps/web/package.json` 追加这条动作，使 A-30-5 那次"加 test 脚本行"在门禁侧合法）。
 * 判据 = diff **只增** `scripts` 块内的行：
 *   - 有任何删除/改写行 → 红（改版本号、改依赖行、删脚本行都会在这里被挡掉）
 *   - 新增行落在 scripts 块外（dependencies / devDependencies / "version" / "name"…）→ 红
 *   - 0 行变更 → 红（空授权：A-33-4 明令禁止不咬人的空壳）
 * 也就是说：这条通道**只**为"加脚本行"开门，A-4 的 `add-dependency-lines-only` 面一寸未让。
 */
const judgeAddScriptLinesOnly = (rel, change, ctx, adjudication) => {
  if (!change) return `add-script-lines-only:${adjudication} 要证据：本文件没有出现在 --diff-file 的 patch 里（清单里点个名不构成授权）`;
  if (change.removed.length) {
    return `add-script-lines-only:${adjudication} 只许纯新增脚本行：patch 里有 ${change.removed.length} 行删除/改写（如 ${rel}:${change.removed[0].line} "${change.removed[0].text.trim().slice(0, 40)}"）—— 改依赖行/版本号一律算越界`;
  }
  if (!change.added.length) return `add-script-lines-only:${adjudication} 的 patch 里 0 行变更 = 空授权`;
  const abs = path.join(ctx.scopeRoot, rel);
  const block = scriptBlockSet(linesOf(abs));
  if (block.size === 0) return `add-script-lines-only:${adjudication}：${rel} 里找不到 "scripts" 块（判据不成立，不放行）`;
  const stray = gapsOutside(change.added, (i) => block.has(i));
  if (stray.length) {
    return `add-script-lines-only:${adjudication}：${stray.length} 行新增不在 scripts 块内（dependencies/devDependencies/版本号/块上方插行都算越界）：${rel}:${stray[0].line} "${stray[0].text.trim().slice(0, 40)}"`;
  }
  return null;
};

/**
 * 通道⑤：`block-append:<裁决号>`（A-35-11，T-25 批次4 开工硬前置）。
 * 判据 = diff 只在 `blockAppendFor.<任务>.blocks` 声明的具名符号块内**追加**行：
 *   - 有删除/改写 → 红（0 既有行变更是硬条件）
 *   - 无 blockAppendFor 或未给该任务声明 → 拒判（缺自报封顶，宁可红）
 *   - maxAppendLines 未声明或非数字 → 拒判
 *   - 追加行数 > maxAppendLines → 红
 *   - 追加行落在声明块外 → 红
 *   - 0 行追加 → 红（空授权：A-33-4 禁止不咬人的空壳）
 * 不许用"现场约定行数字"当判据（maxDiffLinesFor 是人肉数字，会随实现漂移，A-35-11 明令禁止）。
 * 追加行封顶由条目在 blockAppendFor 自报（与 maxDiffLinesFor 不同：自报=声明上限，非授权幅度）。
 */
const judgeBlockAppend = (rel, entry, task, change, ctx, adjudication) => {
  if (!change) return `block-append:${adjudication} 要证据：本文件没有出现在 --diff-file 的 patch 里（清单里点个名不构成授权，也不构成违规）`;
  if (change.removed.length) {
    return `block-append:${adjudication} 只许纯追加（0 既有行变更）：patch 里有 ${change.removed.length} 行删除/改写（如 ${rel}:${change.removed[0].line} "${change.removed[0].text.trim().slice(0, 40)}"）`;
  }
  if (!change.added.length) return `block-append:${adjudication} 的 patch 里 0 行变更 = 空授权`;
  const config = entry.blockAppendFor && entry.blockAppendFor[task];
  if (!config) return { reject: true, msg: `block-append:${adjudication} 未给 ${task} 声明 blockAppendFor.${task} = 缺自报封顶，拒绝判定（A-35-11：宁可红，不发明人肉行数）` };
  if (!Number.isFinite(config.maxAppendLines)) {
    return { reject: true, msg: `block-append:${adjudication}：blockAppendFor.${task}.maxAppendLines 未声明或非数字 = 缺自报封顶，拒绝判定（A-35-11）` };
  }
  if (change.added.length > config.maxAppendLines) {
    return `block-append:${adjudication} 允许 ≤${config.maxAppendLines} 行块内追加，实际 ${change.added.length} 行`;
  }
  const { blocks } = config;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { reject: true, msg: `block-append:${adjudication}：blockAppendFor.${task}.blocks 未声明或为空 = 无合法块范围，拒绝判定（A-35-11）` };
  }
  const abs = path.join(ctx.scopeRoot, rel);
  const lines = linesOf(abs);
  const ranges = namedBlockRanges(lines, blocks);
  if (ranges.length === 0) {
    return `block-append:${adjudication}：${rel} 里找不到声明的块（${blocks.join(' / ')}）—— 判据不成立，不放行`;
  }
  /**
   * 追加行的"块内"判定必须换算回**改动前**的行坐标（见 `gapsOutside` 的注释）。
   * 块只占一行时（如单行数组 `ALL_MIGRATIONS`）该条件恒不成立 = 纯追加在物理上不可能，
   * 只能改既有行 → 由上面的"0 既有行变更"判红。
   */
  const outside = gapsOutside(change.added, (i) => ranges.some((r) => i >= r.from && i <= r.to));
  if (outside.length) {
    return `block-append:${adjudication}：${outside.length} 行追加不在声明块内（${blocks.join(' / ')}，块区间按改动前行坐标算，块上方/块下方插行都算块外）：${rel}:${outside[0].line} "${outside[0].text.trim().slice(0, 40)}"`;
  }
  return null;
};

/**
 * 通道 `baseline-regenerate:<裁决号>`（A-36 四-1：E3′ 那次"唯一一次性基线再生"的窄授权，F2 登记）。
 *
 * 为什么不用既有的 `bounded-edit` 复用：生成物（`trpc-shape.baseline.json`）的再生**必然**大面积改写
 * 既有行（A-36 四-2 的对照表：+7 path 与 profile 三轴都是行级重写），而 bounded-edit 的两条硬判据是
 * "删除行 > cap ⇒ 拒判 / 总行数 > cap ⇒ 红"——cap 小到容不下合法再生就必然误红，cap 放大到容得下
 * 就等于**无上限授权**（A-19/A-28-2/A-35-10 的假绿教训）。所以这条通道的窄性**不靠行数，靠产物清单**。
 *
 * 判据六条（全是收紧方向，没有"无证据也放行"的分支）：
 *   ① 未给该任务声明 baselineRegenerateFor → 红（别的任务号走同一文件必红）
 *   ② 本文件不在 --diff-file 的 patch 里（含"根本没配 --diff-file"）→ 红（要证据，与 bounded-edit 同口径；
 *      基线文件在 git 里是**未跟踪**状态 ⇒ HEAD 相对 diff 根本产不出它的账，证据只能是 agent 自证 scoped patch）
 *   ③ outputs 未声明或为空 → 拒判 exit 2（缺自报产物清单 = 判据不成立，宁可红不放行）
 *   ④ 被判文件不在 outputs 内 → 红（`trpc-shape.spec.ts` 本体不在授权面里：改测试不是"再生基线"）
 *   ⑤ patch 里出现 outputs 之外的任何文件 → 红（这一条就是"不收 HEAD diff"：他人未提交改动一混进来就咬）
 *   ⑥ 该文件在 patch 里 0 行变更 → 红（空授权：A-33-4 禁止不咬人的空壳）
 */
const judgeBaselineRegenerate = (rel, entry, task, change, adjudication, patchFiles) => {
  const config = entry.baselineRegenerateFor && entry.baselineRegenerateFor[task];
  if (!config) return `baseline-regenerate:${adjudication} 未给 ${task} 声明 baselineRegenerateFor.${task} = 未登记的再生授权，拒绝判定（宁可红，也不放别的任务号碰基线）`;
  const outputs = Array.isArray(config.outputs) ? config.outputs : null;
  if (!outputs || outputs.length === 0) return { reject: true, msg: `baseline-regenerate:${adjudication}：baselineRegenerateFor.${task}.outputs 未声明或为空 = 缺自报产物清单，拒绝判定（A-36 四-1：窄授权必须点名到文件）` };
  if (!change) return `baseline-regenerate:${adjudication} 要证据：本文件没有出现在 --diff-file 的 patch 里（清单里点个名不构成授权，也不构成违规；再生须交 agent 自证 scoped patch：改前快照 cp → TRPC_SHAPE_UPDATE=1 → 与现文件 diff -u，不收 HEAD diff）`;
  if (!outputs.includes(rel)) return `baseline-regenerate:${adjudication}：${rel} 不在登记的产物清单内（${outputs.join(' / ')}）—— 再生只许写这些生成物，spec 本体/契约/别的一律算越界`;
  if (change.added.length + change.removed.length === 0) return `baseline-regenerate:${adjudication} 的 patch 里 ${rel} 0 行变更 = 空授权`;
  const stray = patchFiles ? [...patchFiles.keys()].filter((f) => !outputs.includes(f)) : [];
  if (stray.length) return `baseline-regenerate:${adjudication}：patch 里有 ${stray.length} 个产物清单之外的文件（如 ${stray[0]}）—— 证据不是 scoped 再生 patch（疑似 HEAD 相对 diff 混入他人未提交改动），只许含 ${outputs.join(' / ')}`;
  return null;
};

/** 通道名 → 该通道"按本轮任务号取授权"的键名（F-43：让 NOTE 的标签与数字同源）。 */
const channelKind = (id) => id.split(':')[0];
const SOURCE_OF = {
  'bounded-edit': { key: (e, t) => e.maxDiffLinesFor && e.maxDiffLinesFor[t], label: (t) => `maxDiffLinesFor["${t}"]（不是通道名里那个旧裁决号）` },
  'baseline-regenerate': { key: (e, t) => e.baselineRegenerateFor && e.baselineRegenerateFor[t], label: (t) => `baselineRegenerateFor["${t}"].outputs` },
  'block-append': { key: (e, t) => e.blockAppendFor && e.blockAppendFor[t], label: (t) => `blockAppendFor["${t}"]` },
};

/** 动作通道的总入口：任一通道判通即放行（带 NOTE 说明走了哪条），否则返回首条红因。 */
const judgeActionChannels = (actions, rel, entry, task, ctx, change, patchFiles) => {
  const reasons = [];
  const notes = [];
  const rejects = [];
  for (const action of actions) {
    const id = String(action);
    let bad = null;
    if (id === 'delete-expired-entry') bad = judgeDeleteExpiredEntry(rel, change, task);
    else if (id === 'extend-supplement') bad = judgeExtendSupplement(rel, change, ctx);
    else if (/^bounded-edit:.+$/.test(id)) bad = judgeBoundedEdit(rel, entry, task, change, id.slice('bounded-edit:'.length), patchFiles !== null && patchFiles !== undefined);
    else if (/^add-script-lines-only:.+$/.test(id)) bad = judgeAddScriptLinesOnly(rel, change, ctx, id.slice('add-script-lines-only:'.length));
    else if (/^block-append:.+$/.test(id)) bad = judgeBlockAppend(rel, entry, task, change, ctx, id.slice('block-append:'.length));
    else if (/^baseline-regenerate:.+$/.test(id)) bad = judgeBaselineRegenerate(rel, entry, task, change, id.slice('baseline-regenerate:'.length), patchFiles);
    else { reasons.push(`${rel}：ownership.json 声明了未知动作通道 "${id}"（通道名写错=没有授权，不放行）`); continue; }
    if (bad === null) {
      /**
       * F-43（A-83 #299 + A-89 两度再证的"第二形态"，E4c-i 修）：NOTE 过去只回显
       * `actions[]` 里那条通道名（= 上一批登记的裁决号），而额度/产物清单取的是
       * `entry.maxDiffLinesFor[task]` / `baselineRegenerateFor[task]` 这类**按本轮任务号**取的键
       * ⇒ 标签与实际授权来源不绑定，账面读起来像"复用了上一批的额度"。
       * 正解 = 标签里把**真被消费的那颗键**逐字写出来（不改判定，只让名字与数字同源）。
       */
      const src = SOURCE_OF[channelKind(id)];
      notes.push(`${rel}：走动作通道 ${id}${src ? `，实际授权来源 = ${src.label(task)}` : ''}（按实际 diff 判定：${change ? `+${change.added.length}/-${change.removed.length} 行` : '0 行（该文件不在 patch 里 = 本轮零消费）'}）`);
      return { ok: true, notes, reasons, rejects };
    }
    // Reject = evidence shape wrong (not a violation); → exit 2 (A-35-1③ / A-35-11)
    if (typeof bad === 'object' && bad && bad.reject) {
      rejects.push(`${rel}（通道 ${id} 拒判）：${bad.msg}`);
      return { ok: false, notes, reasons, rejects };
    }
    reasons.push(`${rel}（通道 ${id} 不通过）：${bad}`);
  }
  return { ok: false, notes, reasons, rejects };
};

/** 仓库默认的归属表；`--ownership-file` 只覆盖它，判据一字不变。 */
export const OWNERSHIP_TABLE = path.join(REPO, 'tools', 'ownership.json');

/**
 * 归属表路径解析（A-33-4「每条通道各带一个疫苗」的前置：疫苗要跑真 checkOwnership，
 * 而 E1 里 ownership.json 归并行的 E1b，我无权为造一次越界去改他的文件）。
 * 默认 = 仓库那份；给了 `--ownership-file P` 才换 —— 这是**用例输入的注入点**，
 * 与 .dependency-cruiser.cjs 的 TM_EXCEPTIONS_FILE 同口径（正式冒烟命令不传，读的就是仓库那份）。
 * 两条不松口：① 读不到/JSON 非法 = 抛错（非零退出），绝不回落成"无表 = 全是无主文件 = 放行"；
 * ② 用了非默认表，输出里必须打 `TABLE=` 前缀与"注入表"字样，冒烟输出骗不了人。
 */
const resolveOwnershipTable = (opts) => {
  if (!opts || !opts.ownershipFile) return OWNERSHIP_TABLE;
  const p = path.resolve(opts.ownershipFile);
  if (!fs.existsSync(p)) throw new Error(`归属表不存在：${p}（注入表读不到 = 判定无法进行，绝不回落成"无表 = 全放行"）`);
  return p;
};

export const checkOwnership = (opts, ctx) => {
  const tableFile = resolveOwnershipTable(opts);
  const table = readJson(tableFile);
  /**
   * E4a 件 3④：owner 名册校验 —— 条目的 owner 逗号串与 per_file 值必须是 `tasks` 名册里登记过的
   * 任务号；`'*'` 这种懒 owner 一律拒判（门禁纪律：不许把 owner 写成通配蒙混）。
   * 注入的临时表（--self-test / 疫苗沙盒自持的最小表）若根本没有 `tasks` 字段则跳过 —— 那些表
   * 不是账面本体；但**仓库默认表缺 tasks 本身就是拒判**，堵住"删名册逃校验"这条缝。
   * 校验结果进 `rejections`（出口码 2 = 账面坏了没法判，不是放行）。
   */
  const tableErrors = [];
  {
    const known = table.tasks && typeof table.tasks === 'object' ? new Set(Object.keys(table.tasks)) : null;
    if (!known && !opts.ownershipFile) tableErrors.push(`${tableFile}：归属表缺 tasks 名册 = owner 校验无法进行，拒判（E4a）`);
    if (known) {
      for (const entry of table.ownership || []) {
        const refs = [
          ...String(entry.owner === undefined ? '' : entry.owner).split(','),
          ...Object.values(entry.per_file || {}).map((v) => String(v)),
        ].map((s) => s.trim()).filter(Boolean);
        for (const r of refs) {
          if (!known.has(r)) {
            tableErrors.push(`${entry.path}：owner/per_file 引用了未登记进 tasks 名册的任务号 "${r}" = 未登记 owner，拒判（先在名册补任务行，不许用 '*' 或编造任务号蒙混，E4a）`);
          }
        }
      }
    }
  }
  const touched = opts.files.slice();
  let patchFiles = null;
  if (opts.patchFile) {
    patchFiles = parsePatch(fs.readFileSync(opts.patchFile, 'utf8'));
    for (const f of patchFiles.keys()) if (!touched.includes(f)) touched.push(f);
  }
  const violations = [];
  const notes = [];
  const matched = [];
  const rejections = [];
  if (touched.length === 0) notes.push('未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定');
  for (const rel of touched) {
    const { entry, tied, conflicts } = pickOwnership(rel, table);
    if (!entry) {
      notes.push(`${rel}：归属表无条目（no-entry，不阻断）`);
      continue;
    }
    if (conflicts.length) {
      rejections.push(...conflicts.map((c) => `归属表账面缺陷（F-41 同档并列取并集时的冲突）：${c}`));
      continue;
    }
    matched.push(rel);
    if (tied.length > 1) {
      notes.push(`${rel}：同档并列 ${tied.length} 条（${tied.map((e) => e.path).join(' | ')}）⇒ 授权取并集判定（F-41，旧写法只读先写者那条）`);
    }
    const owners = ownersOf(entry, rel);
    const withConstraint = entry.predecessorAllowedDiff && entry.predecessorAllowedDiff.applies_to
      ? entry.predecessorAllowedDiff.applies_to
      : [];
    const predecessors = entry.predecessorOwner ? [entry.predecessorOwner] : [];
    if (owners.includes(opts.task)) continue;
    /**
     * A-28-3 / A-30-8 / A-30-10 的三条动作通道：非 owner 任务**只有**在条目登记了通道、
     * 且本次 patch 的实际 diff 满足该通道的判据时才放行。优先级排在其余分支之前
     * （裁决登记的就是"这件事被授权了"，比泛化的幅度约束更具体）。
     */
    if (Array.isArray(entry.actions) && entry.actions.length) {
      const change = patchFiles ? patchFiles.get(rel) : null;
      const verdict = judgeActionChannels(entry.actions, rel, entry, opts.task, ctx, change, patchFiles);
      for (const n of verdict.notes) notes.push(n);
      if (verdict.ok) continue;
      // Reject = evidence shape wrong → exit 2, not exit 1 (A-35-1③ / A-35-11)
      if (verdict.rejects && verdict.rejects.length) {
        rejections.push(...verdict.rejects);
        continue;
      }
      /**
       * 通道没过 ≠ 条目上别的授权也没过。A-34-3 的登记形态就是"在原 `add-dependency-lines-only`
       * 约束旁边**追加**一条脚本行通道"，两条授权是并集关系：走通任一条即放行。
       * 但只允许回落到同为"窄授权"的 predecessorAllowedDiff 分支 —— 不回落到 `maxDiffLinesFor`
       * 那种纯预算分支（否则 extend-supplement 的"0 既有行变更"会被同条目上一个数字买通）。
       */
      const channelReasons = verdict.reasons;
      const first = channelReasons[0] || `${rel}：登记的 ${entry.actions.join('/')} 全部未通过`;
      if (withConstraint.includes(opts.task)) {
        const constraint = entry.predecessorAllowedDiff;
        const change2 = patchFiles ? patchFiles.get(rel) : null;
        if (!change2) {
          notes.push(`${rel}：${opts.task} 声明只许 ${constraint.kind}，但本次无 patch 可比 → 判红（窄授权不接受"只点名就算过"）`);
          violations.push(`${rel}（owner=${owners.join('/')}）：${first}`);
          continue;
        }
        const bad = diffAllowed(constraint, rel, change2, ctx);
        if (bad) violations.push(`${rel}（owner=${owners.join('/')}）：${bad}；动作通道也未通过：${first}`);
        else notes.push(`${rel}：动作通道未通过，回落条目上的窄授权 predecessorAllowedDiff=${constraint.kind} 判通过（绿也要说清走了哪条，A-35-10②）`);
        continue;
      }
      violations.push(first);
      continue;
    }
    if (withConstraint.includes(opts.task)) {
      const constraint = entry.predecessorAllowedDiff;
      const change = patchFiles ? patchFiles.get(rel) : null;
      if (!change) {
        notes.push(`${rel}：${opts.task} 是交接前动方，改动幅度=${constraint.kind}（本次无 patch 可比，只登记不阻断）`);
        continue;
      }
      const bad = diffAllowed(constraint, rel, change, ctx);
      if (bad) violations.push(`${rel}（owner=${owners.join('/')}）：${bad}`);
      continue;
    }
    if (predecessors.includes(opts.task)) {
      const change = patchFiles ? patchFiles.get(rel) : null;
      const bad = change ? diffAllowed({ kind: 'any' }, rel, change, ctx) : null;
      if (!bad && taskNum(opts.task) <= taskNum(owners[0])) continue;
      violations.push(`${rel}：${opts.task} 只是建基线的前置 owner（现归属 ${owners.join('/')}）`);
      continue;
    }
    if (Array.isArray(entry.zeroDiffFor) && entry.zeroDiffFor.includes(opts.task)) {
      const change = patchFiles ? patchFiles.get(rel) : null;
      violations.push(
        `${rel}：§10.4 明示 ${opts.task} 对该文件零 diff${change ? `，实际 ${change.added.length + change.removed.length} 行` : ''}`,
      );
      continue;
    }
    const extra = entry.maxDiffLinesFor && entry.maxDiffLinesFor[opts.task];
    if (extra !== undefined) {
      const change = patchFiles ? patchFiles.get(rel) : null;
      if (!change) {
        /**
         * A-30-10 的口径：幅度类授权**必须**按实际 diff 判。这里保持既有行为（无 patch 不阻断，
         * 免得把 T-16/T-04 已有的冒烟命令一次改红），但把缺口显式记进 notes —— 新登记的授权
         * 一律走 bounded-edit:<裁决号>（那条没 patch 直接红）。
         */
        notes.push(`${rel}：${opts.task} 声明 ≤${extra} 行，但本次没有 patch 可比 → 按清单放行（正式冒烟请配 --diff-file；新授权请用 bounded-edit:<裁决号>）`);
        continue;
      }
      if (change && change.added.length + change.removed.length > extra) {
        violations.push(`${rel}：${opts.task} 允许 ≤${extra} 行，实际 ${change.added.length + change.removed.length} 行`);
        continue;
      }
      continue;
    }
    violations.push(
      `${rel} 由 ${owners.join('/')} 独占（当前任务 ${opts.task}）— ${entry.reason || '见 §10.3'}`,
    );
  }
  rejections.unshift(...tableErrors.map((t) => `归属表账面缺陷（E4a owner 名册校验）：${t}`));
  return { violations, notes, matched, tableFile, injected: path.resolve(tableFile) !== OWNERSHIP_TABLE, patchFilesParsed: patchFiles ? patchFiles.size : 0, rejections, tableErrors, noEvidence: touched.length === 0 };
};

/* ───────────────────────────── 例外白名单装载与体检 ───────────────────────────── */

export const loadExceptions = (cursor, file = path.join(REPO, 'tools', 'exceptions.json')) => {
  const raw = readJson(file);
  /* 游标缺省时回落白名单里的 gate_cursor —— 绝不能当成"无穷大"，
   * 否则所有例外都会被误判为已过期，门禁在没人设 TM_TASK 时无条件变红。 */
  const effectiveCursor = cursor || raw.gate_cursor || 'T-01';
  const active = [];
  const expired = [];
  const malformed = [];
  for (const entry of raw.exceptions || []) {
    if (!entry.id || !entry.engine || !entry.expires_after || !/^T-\d+$/.test(entry.expires_after)) {
      malformed.push(`${entry.id || '(无 id)'}：缺 engine/expires_after 或格式不是 T-NN`);
      continue;
    }
    if (!entry.owner) malformed.push(`${entry.id}：缺 owner（谁负责消掉它）`);
    if (entry.engine === 'depcruise' && (!entry.rule || !entry.from || !entry.to)) {
      malformed.push(`${entry.id}：depcruise 例外必须给 rule + from + to`);
      continue;
    }
    if (entry.engine === 'boundaries' && (!entry.assertion || !entry.file)) {
      malformed.push(`${entry.id}：boundaries 例外必须给 assertion + file`);
      continue;
    }
    if (entry.engine === 'boundaries' && !ASSERTIONS.some((a) => a.id === entry.assertion)) {
      malformed.push(`${entry.id}：assertion "${entry.assertion}" 不在断言注册表里`);
      continue;
    }
    (taskNum(effectiveCursor) >= taskNum(entry.expires_after) ? expired : active).push(entry);
  }
  return { active, expired, malformed, gate_cursor: raw.gate_cursor, cursor: effectiveCursor, all: raw.exceptions || [] };
};

/* ───────────────────────────── 运行 ───────────────────────────── */

const MODES = {
  '--copy': ['copy-legacy-zero'],
  '--password': ['deadline-key-zero', 'enforce-flag-single-read', 'password-write-points'],
  '--migrations': ['migration-forbidden', 'migration-down-declared'],
  '--tokens': ['tokens-single-source', 'globals-css-no-brand-hex'],
  '--colors': ['colors-no-hardcode', 'colors-purple-retired', 'colors-tailwind-palette', 'css-important-budget', 'focus-ring-not-hidden', 'dark-variant-budget'],
  '--ui-io': ['ui-no-io-globals'],
  /* A-30-4：`--web` 与 `--ui-io` 共用同一张核心词表（IO_GLOBALS_TERMS），只加不减。 */
  '--web': ['web-home-transport'],
  /* A-24-1：裸 `--dist` = 扫注册表在册目录（带 DIR 的 `--dist DIR` 走 runDistGuard 的显式分支）。 */
  '--dist': ['dist-artifact-portability'],
  '--shared-pure': ['shared-pure-env'],
  '--flags': ['flag-defaults-match-prd'],
  '--versions': ['version-pin-overrides'],
  '--routes': ['route-string-preserved'],
};
MODES['--all'] = ASSERTIONS.map((a) => a.id);

/** 非"扫描模式"的开关/子命令，用于参数校验（漏加就会被当成未知模式）。 */
const ACCEPTED_FLAGS = [
  '--verbose', '--json', '--help', '-h', '--list', '--self-test', '--exceptions',
  '--check-ownership', '--task', '--root', '--files', '--diff-file', '--dist', '--ownership-file',
];

const HELP = `用法：node tools/boundaries.mjs [模式] [选项]

模式（可组合；不给模式 = --all）
  --copy            判据②-1 旧口径文案 0 命中（§4.7⑥⑨ / UI §6.6）
  --password        判据②-2/3/4 passwordUpgradeDeadline=0、passwordUpgradeEnforce 运行时读点=1
                    （只数 packages/server/src/** 的非注释运行时读点，豁免 test/** 与 src/scripts/**，A-32-5）、
                    SET password 写入点=3
  --migrations      判据②-5 迁移禁词（DROP/RENAME/ALTER COLUMN/回填 UPDATE）+ down() 声明
  --tokens          T-04 判据①②：token 唯一定义源 + globals.css 无 hex
  --colors          UI §8.2-1..7 的 grep 断言
  --ui-io           §3.5 ui-no-io 的全局调用面（共用核心 fetch(/XMLHttpRequest/axios + UI 专属 useQuery(）
  --web             A-30-4 / §10.2 T-12 判据⑤：首页传输面（(user)/page.tsx + components/home/** + lib/api/**）
                    与 --ui-io 同一条检查、同一张共用核心词表 IO_GLOBALS_TERMS（fetch(/XMLHttpRequest/axios），
                    只加不减：另禁 localStorage；UI 侧另有 useQuery(（§3.5 对 UI 更严，不下放给 web）
  --shared-pure     §3.5 shared-pure 的运行时面（process.env/require）
  --flags           §6.4-2 步 8：开关默认值 = PRD §6.4-7
  --versions        RK-10/A-1：pnpm-workspace.yaml:overrides 精确钉版本
  --routes          §6.5-1：旧接口路径清单不消失
  --dist [DIR]      产物门禁（§10.2 T-14 判据①② / A-24-1 + R-17 ⑥ / F-59 判据③ + A-109/F-70 判据④）：
                    扫 DIR 下全部 *.js/*.css/*.html，
                    ①不含以 / 开头的资源路径（file:// 前提）②不含 Chrome84 之后的 API
                    （structuredClone/Object.hasOwn/Array.prototype.at/requestIdleCallback），
                    与 apps/app 的 tm-app:dist-guard 取并集同口径；
                    ④html 里不含 type="module" / crossorigin / rel="modulepreload"，
                      js 里不含运行时 import( 与 import.meta —— 这五种写法在 file:// 下会被
                      Chromium 以 CORS 拒绝取源（实测原文见 distFileProtocolViolations 注释），
                      真机表现 = 打开就是白屏；
                    ③DIR 根的 index.html 里首屏 JS（经典 <script src> + <script type=module src> +
                      <link rel=modulepreload href>）逐个 gzip -9 后合计 ≤ DIST_BUDGET_BYTES
                      （= 256000 B，取 02-tech-design.md:571 的字面额，⛔ 按实测反推）。
                      无 index.html / 解析到 0 颗 / 引用的 js 不在盘上 ⇒ 一律判红（⛔ 不适用即通过）。
                    DIR 可重复给或逗号分隔；
                    不给 DIR = 扫注册表在册目录（dist-artifact-portability.roots = apps/app/dist），
                    这样 --web --dist 这类出口冒烟命令不必先知道产物摆在哪
  --all             以上全部（含 --dist 的注册表条目 dist-artifact-portability）
  --check-ownership §10.3/§10.4 归属校验（配 --task T-XX 或 env TM_TASK，配 --files 或 --diff-file）
                    §10.4 的六条"有限授权动作通道"（A-28-3/A-30-8/A-30-10/A-34-3/A-35-11/A-36 四-1）
                    由条目里的 actions:[] 声明，**全部按 --diff-file 里的实际 diff 行判定**：
                      delete-expired-entry        只许整条删除 expires_after == 当前任务的例外条目
                      extend-supplement           纯追加（0 既有行变更）且不得落进 §4.6 三个冻结符号
                      bounded-edit:<裁决号>       幅度 = maxDiffLinesFor.<任务> 行，超出即红；
                                                  证据必须是 agent 自证 scoped diff（改前快照→改后），
                                                  不收 HEAD 相对 diff；混入他人改动→拒判 exit 2
                      add-script-lines-only:<号>  只增 package.json 的 scripts 块内行；碰依赖/版本行仍红
                      block-append:<裁决号>       只在 blockAppendFor.<任务>.blocks 声明的具名符号块内
                                                  纯追加（0 既有行变更），封顶由 maxAppendLines 自报；
                                                  缺自报 = 拒判 exit 2（A-35-11，宁可红不放行）
                      baseline-regenerate:<裁决号> 生成物一次性再生（A-36 四-1 的 E3′）。窄性不靠行数而靠
                                                  baselineRegenerateFor.<任务>.outputs 产物清单：只许写
                                                  清单内的生成物，patch 里出现清单外文件（＝收了 HEAD 相对
                                                  diff / 改了 spec 本体）判红；缺 outputs = 拒判 exit 2
                    六条都没有 patch 证据 = 判红（"要证据"），通道名写错 = 判红，不放行未知通道
                    既无 --files 也无 --diff-file = 无证据 → 退出码 2（A-35-10②：无判定不得声称通过）
                    账面自检（E4a 件3④）：条目 owner/per_file 引用了 tasks 名册里没有的任务号或写成 '*'
                    = 账面缺陷，整轮拒判退出码 2（注入的最小沙盒表无 tasks 字段时跳过该校验，仓库默认表缺
                    tasks 同样拒判）；条目匹配按"精确路径 > 最长字面量前缀 > 通配更少 > 字典序"定序，
                    具体条目恒赢「**」兜底，判定结果与条目在 JSON 里的书写顺序无关（E4a 件3①）
                    同一具体度档位上并列多条目 ⇒ 授权取并集判定；同一任务号在并列条目里声明了不同的值
                    = 账面矛盾，整轮拒判退出码 2（F-41：旧写法只读先写者那条，后写者的授权永远读不到，
                    也⛔不许靠"再加一条"把额度买大）；NOTE 里的通道名是登记它的那颗旧裁决号，
                    真正被消费的授权按本轮任务号反查，并把键逐字写进 NOTE（F-43）
  --self-test       故意违规 fixture 必须红 + 干净 fixture 必须绿（反"永真断言"）
                    含 E4a 组：改前/改后比较器对照（花括号长度翻转 + 等长并列顺序翻转两枚疫苗）、
                    per_file 精确字典语义、no-entry 不阻断、owner 名册疫苗、真表倒序判定恒等
  --list            列出断言注册表
  --exceptions      打印白名单当前生效/过期状态
  --help            本帮助

选项
  --task T-XX       门禁游标（默认 env TM_TASK → tools/exceptions.json 的 gate_cursor）
  --root DIR        扫描根替换（fixture 用）
  --files a,b,c     触碰文件清单（相对仓库根，/ 分隔）
  --diff-file P     unified diff 文本文件（用于"改动幅度"/动作通道判定；不给 = 只能按清单判）
                    bounded-edit 通道要求 P 为 agent 自证 scoped patch（改前快照 → 改后，仅含本轮增量），
                    不收 HEAD 相对 diff —— 后者混入他人未提交改动会导致幅度虚高（A-35-1③）
                    给了 P 而清单里点名的那颗在 P 里没有自己那段 = 本轮对该颗零消费 → NOTE 明说并放行
                    （F-52：这与"根本没交证据"是两回事，旧写法把前者判红、和自家文案矛盾）
                    没给 P 时幅度类通道一律判红"要证据"，清单里点个名不构成授权
                    同一颗 P 带 / 不带 "diff --git" 头两种形状，逐颗计数必须相同（F-45 钉的就是这条）
  --ownership-file P 归属表注入（默认 tools/ownership.json）。仅用于 --self-test 与出口轮疫苗在
                    临时沙盒里跑真判定；正式冒烟命令不传。表读不到即报错退出，不回落成"全放行"，
                    用了注入表时输出必带 TABLE= 前缀
  --verbose         打印每条命中的文件:行
  --json            机器可读输出
`;

const runAssertion = (assertion, ctx) => {
  const c = { ...ctx, curRoots: assertion.roots, curAssertionEnforceFrom: assertion.enforce_from };
  const res = assertion.run(c);
  return { id: assertion.id, title: assertion.title, enforce_from: assertion.enforce_from, ...res };
};

const printResults = (results, opts) => {
  let red = 0;
  for (const r of results) {
    if (r.status === 'red') red += 1;
    const mark = r.status === 'red' ? 'RED  ' : 'OK   ';
    process.stdout.write(`${mark}${r.id.padEnd(26)} ${r.detail}\n`);
    if (opts.verbose && r.hits && r.hits.length) {
      for (const h of r.hits.slice(0, 40)) process.stdout.write(`      ${h.file}:${h.line || 1}  ${(h.text || '').slice(0, 90)}\n`);
    }
  }
  return red;
};

const main = async () => {
  const argv = process.argv.slice(2);
  const opts = {
    modes: [], files: [], task: null, root: REPO, patchFile: null, distDirs: [], list: false,
    ownershipFile: null,
    verbose: argv.includes('--verbose'), json: argv.includes('--json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      return 0;
    }
    if (a === '--list') {
      /**
       * 过去 `--list` 在解析阶段就 `return 0`，于是 `--check-ownership --task T-02 --list`
       * 只会打印断言注册表、永远跑不到归属校验（A-28-3 / A-30-8 / A-30-10 三条动作通道
       * 因此没有可冒烟的入口）。现在改成：只有不与任何判定同批时才短路。
       */
      opts.list = true;
      continue;
    }
    /**
     * A-24-1：`--dist` 既能带 DIR（`--dist apps/app/dist`，T-14/T-17/T-18 冒烟命令的原样写法），
     * 也能裸给（`--web --dist`）——裸给走注册表在册目录，不另写一套更松的检查。
     * 这个分支必须在 `if (MODES[a])` 之前，否则 `--dist DIR` 的 DIR 会被当成未知参数。
     */
    if (a === '--dist') {
      const d = argv[i + 1];
      if (d && !d.startsWith('--')) {
        i += 1;
        opts.distDirs.push(d);
      } else {
        opts.modes.push(...MODES['--dist']);
      }
      continue;
    }
    if (MODES[a]) {
      opts.modes.push(...MODES[a]);
      continue;
    }
    if (a === '--task') {
      opts.task = argv[(i += 1)];
      continue;
    }
    if (a === '--root') {
      opts.root = path.resolve(argv[(i += 1)]);
      continue;
    }
    if (a === '--files') {
      opts.files.push(...String(argv[(i += 1)] || '').split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (a === '--diff-file') {
      opts.patchFile = path.resolve(argv[(i += 1)]);
      continue;
    }
    if (a === '--ownership-file') {
      opts.ownershipFile = argv[(i += 1)];
      continue;
    }
    if (!['--verbose', '--json'].includes(a) && !a.startsWith('--')) {
      process.stderr.write(`未知参数：${a}\n\n${HELP}`);
      return 2;
    }
    if (!ACCEPTED_FLAGS.includes(a) && !Object.keys(MODES).includes(a) && !opts.modes.length) {
      process.stderr.write(`未知模式：${a}\n\n${HELP}`);
      return 2;
    }
  }
  const cursor = opts.task || process.env.TM_TASK || null;
  if (opts.list) {
    for (const x of ASSERTIONS) process.stdout.write(`${x.id.padEnd(28)} enforce_from=${x.enforce_from.padEnd(6)} ${x.title}\n`);
    process.stdout.write(`\n共 ${ASSERTIONS.length} 条断言（§3.5 的 7 条 depcruise 规则由 .dependency-cruiser.cjs 落地）\n`);
    const alsoRuns = argv.includes('--check-ownership') || argv.includes('--self-test')
      || argv.includes('--exceptions') || opts.distDirs.length > 0 || opts.modes.length > 0;
    if (!alsoRuns) return 0;
    process.stdout.write('\n');
  }
  const exceptions = loadExceptions(cursor || undefined);
  const ctx = {
    cursor: cursor || exceptions.gate_cursor,
    scopeRoot: opts.root,
    exceptions,
  };

  if (argv.includes('--exceptions')) {
    process.stdout.write(`游标 cursor=${ctx.cursor}（TM_TASK > --task > exceptions.json:gate_cursor）\n`);
    for (const e of exceptions.active) process.stdout.write(`生效中  ${e.id.padEnd(34)} engine=${e.engine.padEnd(10)} expires_after=${e.expires_after}\n`);
    for (const e of exceptions.expired) process.stdout.write(`已过期  ${e.id.padEnd(34)} engine=${e.engine.padEnd(10)} expires_after=${e.expires_after} ← 违规仍在即红\n`);
    for (const m of exceptions.malformed) process.stdout.write(`格式非法 ${m}\n`);
    return exceptions.malformed.length ? 1 : 0;
  }

  if (argv.includes('--self-test')) return selfTest(opts);

  if (opts.distDirs.length) {
    const assertion = ASSERTIONS.find((a) => a.id === 'dist-artifact-portability');
    const resolved = resolveDistDirs(opts.distDirs, ctx.scopeRoot);
    const res = { id: assertion.id, title: assertion.title, enforce_from: assertion.enforce_from, ...runDistGuard(opts.distDirs, ctx) };
    /**
     * `--dist DIR` 与别的模式同时给时（例：`--web --dist apps/app/dist`），DIR 分支不许把其余模式
     * 吞掉（吞了就是"同一次冒烟少查了几条"）。这里先跑其余模式，再跑产物门禁，退出码合并。
     */
    const extraIds = opts.modes.filter((id) => id !== assertion.id);
    const extra = extraIds.length ? ASSERTIONS.filter((a) => extraIds.includes(a.id)).map((a) => runAssertion(a, ctx)) : [];
    const extraRed = extra.filter((r) => r.status === 'red').length;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ cursor: ctx.cursor, results: [...extra, res] }, null, 2) + '\n');
      if (res.missingDirs) return 2;
      return res.status === 'red' || extraRed ? 1 : 0;
    }
    if (extra.length) {
      process.stdout.write(`静态断言门禁 boundaries.mjs（与 --dist 同批的其它模式）—— cursor=${ctx.cursor}\n\n`);
      printResults(extra, opts);
      process.stdout.write(`\n其它模式 ${extra.length - extraRed}/${extra.length} 条通过${extraRed ? `，${extraRed} 条红` : ''}\n\n`);
    }
    process.stdout.write(`产物门禁 boundaries.mjs --dist —— ${opts.distDirs.join(', ')}（${resolved.found.length} 个目录在册，cursor=${ctx.cursor}）\n`);
    process.stdout.write(`${res.status === 'red' || res.missingDirs ? 'RED  ' : 'OK   '}${res.id.padEnd(26)} ${res.detail}\n`);
    if (res.missingDirs) {
      process.stdout.write(`\nRED：--dist 指定的产物目录不存在（前置缺失，退出码 2）：${res.missingDirs.join(', ')}\n     先跑 pnpm --filter @tm/app build 再来跑这条冒烟命令。\n`);
      return 2;
    }
    if (res.status === 'red') {
      process.stdout.write('\n命中清单（文件:行/偏移 + 命中串）：\n');
      for (const h of res.hits.slice(0, 40)) process.stdout.write(`      ${fmtDistHit(h)}\n`);
      if (res.hits.length > 40) process.stdout.write(`      …(+${res.hits.length - 40} 处，--json 拿全量)\n`);
    }
    process.stdout.write(`\n${res.status === 'red' || extraRed ? `产物门禁：${res.hits.length} 处命中${extraRed ? ` + 其它模式 ${extraRed} 条红` : ''} → 退出码 1` : '产物门禁：全绿'}\n`);
    return res.status === 'red' || extraRed ? 1 : 0;
  }

  if (argv.includes('--check-ownership')) {
    /**
     * --task 缺省时只回落到 env TM_TASK（不回落 exceptions.json 的 gate_cursor —— 那是"门禁游标"
     * 不是"当前任务"，拿它当任务号会把没设任务号的调用误判成 T-02）。
     * 与 HELP 对 --task 的口径一致：§10.2 把冒烟命令写成 `TM_TASK=T-14 node … --check-ownership`，
     * 回落前那条字面命令只会拿到退出码 2（不是判定，是用法断裂）。不改判定，只补参数接线。
     */
    if (!opts.task && process.env.TM_TASK) opts.task = process.env.TM_TASK.trim();
    if (!opts.task) {
      process.stderr.write('--check-ownership 需要 --task T-XX（当前任务号），或给 env TM_TASK\n');
      return 2;
    }
    let own;
    try {
      own = checkOwnership(opts, ctx);
    } catch (e) {
      process.stderr.write(`RED --check-ownership 无法判定（前置缺失，不是放行）：${e.message}\n`);
      return 2;
    }
    const { violations, notes, matched, tableFile, injected, patchFilesParsed, rejections, noEvidence } = own;
    process.stdout.write(`TABLE ${tableFile}${injected ? '  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）' : ''}\n`);
    if (patchFilesParsed) process.stdout.write(`PATCH ${patchFilesParsed} 个文件的 diff 参与判定\n`);
    for (const n of notes) process.stdout.write(`NOTE ${n}\n`);
    for (const v of violations) process.stdout.write(`RED  ${v}\n`);
    for (const r of (rejections || [])) process.stdout.write(`REJECT  ${r}\n`);
    if (noEvidence) {
      process.stdout.write(`\n--check-ownership task=${opts.task} 无证据（既无 --files 也无 --diff-file）= 无判定，不得声称通过（A-35-10②）\n`);
      return 2;
    }
    if (rejections && rejections.length) {
      process.stdout.write(`\n--check-ownership task=${opts.task} ${rejections.length} 处拒判（证据形状不符，非越界判定，需重新提供正确证据）→ 退出码 2（A-35-1③ / A-35-11）\n`);
      return 2;
    }
    process.stdout.write(`\n--check-ownership task=${opts.task} 触碰 ${matched.length ? `${matched.length} 个在册文件（清单 ${opts.files.length} 项 + patch ${patchFilesParsed} 项）` : `${opts.files.length} 个文件`} → ${violations.length ? `${violations.length} 处越界` : '无越界'}\n`);
    return violations.length ? 1 : 0;
  }

  const ids = opts.modes.length ? opts.modes : MODES['--all'];
  const results = ASSERTIONS.filter((a) => ids.includes(a.id)).map((a) => runAssertion(a, ctx));
  if (exceptions.malformed.length) {
    results.push({
      id: 'exceptions-schema', title: '白名单条目必须带 owner + expires_after=T-NN',
      status: 'red', detail: exceptions.malformed.join('；'), hits: [],
    });
  }
  const expiredPresent = results.some((r) => (r.hits || []).some((h) => h.expiredException));
  if (expiredPresent) {
    results.push({
      id: 'exceptions-expired', title: '过期例外仍存在即红（F-4 / T-08 判据④）',
      status: 'red', detail: '有命中落在 expires_after 已过期的例外范围内：' + results.flatMap((r) => r.hits || []).filter((h) => h.expiredException).map((h) => `${h.file}:${h.line}[${h.expiredException}]`).slice(0, 8).join(' '), hits: [],
    });
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify({ cursor: ctx.cursor, results }, null, 2) + '\n');
  } else {
    process.stdout.write(`静态断言门禁 boundaries.mjs —— cursor=${ctx.cursor}，扫描根=${ctx.scopeRoot === REPO ? '仓库根' : ctx.scopeRoot}\n\n`);
  }
  const red = opts.json ? results.filter((r) => r.status === 'red').length : printResults(results, opts);
  if (!opts.json) {
    process.stdout.write(`\n${results.length - red}/${results.length} 条通过`);
    process.stdout.write(red ? `，${red} 条红\n` : '，全绿\n');
  }
  return red ? 1 : 0;
};

/* ───────────────────────────── self-test ───────────────────────────── */

const ST = path.join(FIXTURES, 'selftest');

/** {assertion, dir, task, expect} —— expect: 'red' | 'green' */
export const SELFTEST_CASES = [
  // 判据②的 5 项，每项都给"红"与"绿"两个方向
  { assertion: 'copy-legacy-zero', dir: 'violations/copy', task: 'T-02', expect: 'red' },
  { assertion: 'copy-legacy-zero', dir: 'clean', task: 'T-02', expect: 'green' },
  { assertion: 'deadline-key-zero', dir: 'violations/deadline', task: 'T-02', expect: 'red' },
  { assertion: 'deadline-key-zero', dir: 'clean', task: 'T-02', expect: 'green' },
  { assertion: 'enforce-flag-single-read', dir: 'violations/enforce-two-reads', task: 'T-02', expect: 'red' },
  /* A-32-5 口径的一对：噪音（注释 / test/** / src/scripts/**）必须被剔除，但真实第二读点不得被一起豁免 */
  { assertion: 'enforce-flag-single-read', dir: 'flag-noise', task: 'T-07', expect: 'green' },
  { assertion: 'enforce-flag-single-read', dir: 'violations/enforce-two-reads-noise', task: 'T-07', expect: 'red' },
  { assertion: 'enforce-flag-single-read', dir: 'violations/enforce-none-late', task: 'T-07', expect: 'red' },
  { assertion: 'enforce-flag-single-read', dir: 'clean', task: 'T-07', expect: 'green' },
  { assertion: 'password-write-points', dir: 'violations/password-rogue-write', task: 'T-02', expect: 'red' },
  { assertion: 'password-write-points', dir: 'violations/password-only-one-role', task: 'T-07', expect: 'red' },
  { assertion: 'password-write-points', dir: 'clean', task: 'T-07', expect: 'green' },
  { assertion: 'migration-forbidden', dir: 'violations/migration-drop', task: 'T-06', expect: 'red' },
  { assertion: 'migration-forbidden', dir: 'violations/migration-backfill', task: 'T-06', expect: 'red' },
  { assertion: 'migration-forbidden', dir: 'clean', task: 'T-06', expect: 'green' },
  { assertion: 'migration-down-declared', dir: 'violations/migration-no-down', task: 'T-06', expect: 'red' },
  { assertion: 'migration-down-declared', dir: 'clean', task: 'T-06', expect: 'green' },
  // UI §8.2 / §9 / T-04 判据
  { assertion: 'tokens-single-source', dir: 'violations/tokens-dup', task: 'T-04', expect: 'red' },
  { assertion: 'tokens-single-source', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'globals-css-no-brand-hex', dir: 'violations/globals-hex', task: 'T-04', expect: 'red' },
  { assertion: 'globals-css-no-brand-hex', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'colors-no-hardcode', dir: 'violations/hex-color', task: 'T-04', expect: 'red' },
  { assertion: 'colors-no-hardcode', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'colors-purple-retired', dir: 'violations/purple', task: 'T-04', expect: 'red' },
  { assertion: 'colors-purple-retired', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'colors-tailwind-palette', dir: 'violations/tw-palette', task: 'T-04', expect: 'red' },
  { assertion: 'colors-tailwind-palette', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'css-important-budget', dir: 'violations/important', task: 'T-04', expect: 'red' },
  { assertion: 'css-important-budget', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'focus-ring-not-hidden', dir: 'violations/outline-none', task: 'T-04', expect: 'red' },
  { assertion: 'focus-ring-not-hidden', dir: 'clean', task: 'T-04', expect: 'green' },
  { assertion: 'dark-variant-budget', dir: 'violations/dark-arbitrary', task: 'T-04', expect: 'red' },
  { assertion: 'dark-variant-budget', dir: 'clean', task: 'T-04', expect: 'green' },
  // §3.5 里 depcruise 覆盖不到的两条
  { assertion: 'ui-no-io-globals', dir: 'violations/ui-fetch', task: 'T-04', expect: 'red' },
  /* UI 专属词（§3.5 对 packages/ui 更严：连数据获取层都不许有），见 webTransportParity() 第 3 段 */
  { assertion: 'ui-no-io-globals', dir: 'violations/ui-usequery', task: 'T-04', expect: 'red' },
  { assertion: 'ui-no-io-globals', dir: 'clean', task: 'T-04', expect: 'green' },
  /* A-30-4 / §10.2 T-12 判据⑤：`--web` 的落点。红向两例分别覆盖共用核心词与 web 专属词 */
  { assertion: 'web-home-transport', dir: 'violations/web-fetch', task: 'T-12', expect: 'red' },
  { assertion: 'web-home-transport', dir: 'violations/web-localstorage', task: 'T-12', expect: 'red' },
  { assertion: 'web-home-transport', dir: 'web-clean', task: 'T-12', expect: 'green' },
  { assertion: 'shared-pure-env', dir: 'violations/shared-env', task: 'T-03', expect: 'red' },
  { assertion: 'shared-pure-env', dir: 'clean', task: 'T-03', expect: 'green' },
  // 开关默认值 / 版本钉死 / 旧路径清单
  { assertion: 'flag-defaults-match-prd', dir: 'violations/flag-default', task: 'T-03', expect: 'red' },
  { assertion: 'flag-defaults-match-prd', dir: 'clean', task: 'T-03', expect: 'green' },
  { assertion: 'version-pin-overrides', dir: 'violations/version-pin', task: 'T-01', expect: 'red' },
  { assertion: 'version-pin-overrides', dir: 'clean', task: 'T-01', expect: 'green' },
  { assertion: 'route-string-preserved', dir: 'violations/route-deleted', task: 'T-08', expect: 'red' },
  { assertion: 'route-string-preserved', dir: 'clean', task: 'T-08', expect: 'green' },
  // A-24-1：产物门禁（脏产物必须红 / 干净产物必须绿；fixture 路径与真产物同名 apps/app/dist）
  { assertion: 'dist-artifact-portability', dir: 'violations/dist-artifacts', task: 'T-14', expect: 'red' },
  { assertion: 'dist-artifact-portability', dir: 'clean', task: 'T-14', expect: 'green' },
  /*
   * A-101 判据口径三件（(a) 剥注释 / (b) 样式形状 / (c) 负例面）：
   * 每一颗都配一对 —— `comment-noise` 放"禁令自述 + 键位写法 + 反例夹具"必须绿，
   * `violations/gate-truth-real` 放"同形但长在代码里"必须红。缺任何一侧都算这条判据没有判定力。
   */
  { assertion: 'copy-legacy-zero', dir: 'comment-noise', task: 'T-02', expect: 'green' },
  { assertion: 'copy-legacy-zero', dir: 'violations/gate-truth-real', task: 'T-02', expect: 'red' },
  { assertion: 'deadline-key-zero', dir: 'comment-noise', task: 'T-02', expect: 'green' },
  { assertion: 'deadline-key-zero', dir: 'violations/gate-truth-real', task: 'T-02', expect: 'red' },
  { assertion: 'colors-no-hardcode', dir: 'comment-noise', task: 'T-04', expect: 'green' },
  { assertion: 'colors-no-hardcode', dir: 'violations/gate-truth-real', task: 'T-04', expect: 'red' },
  { assertion: 'css-important-budget', dir: 'comment-noise', task: 'T-04', expect: 'green' },
  { assertion: 'css-important-budget', dir: 'violations/gate-truth-real', task: 'T-04', expect: 'red' },
  { assertion: 'dark-variant-budget', dir: 'comment-noise', task: 'T-04', expect: 'green' },
  { assertion: 'dark-variant-budget', dir: 'violations/gate-truth-real', task: 'T-04', expect: 'red' },
  { assertion: 'web-home-transport', dir: 'comment-noise', task: 'T-12', expect: 'green' },
  { assertion: 'web-home-transport', dir: 'violations/gate-truth-real', task: 'T-12', expect: 'red' },
];

/** §3.5 七条规则各自的"故意违规 fixture 必须红"（判据①）。 */
export const DEPCRUISE_CASES = [
  { rule: 'ui-no-io', case: 'ui-no-io' },
  { rule: 'review-no-agent', case: 'review-no-agent' },
  { rule: 'shared-pure', case: 'shared-pure' },
  { rule: 'app-web-isolated', case: 'app-web-isolated' },
  { rule: 'fsrs-version-lock', case: 'fsrs-version-lock' },
  { rule: 'thin-facade', case: 'thin-facade' },
  { rule: 'no-legacy-app-js', case: 'no-legacy-app-js' },
];

/**
 * 跑一份 depcruise fixture。`task` = 例外游标；默认 T-99（所有例外都已过期 ⇒ 量的是规则的裸强度），
 * A-19 的用例①②要显式传"例外在用"的游标，否则又是在测一条没有例外的规则 = 抓不到 A-19 那个病。
 */
const runDepcruiseCase = (name, task = 'T-99') => {
  const src = path.join(ST, 'depcruise', name);
  if (!fs.existsSync(src)) return { ok: false, why: `缺 fixture：${toRel(REPO, src)}` };
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-gate-')), 'w');
  try {
    copyTree(src, tmp);
    if (!fs.existsSync(path.join(tmp, 'tsconfig.base.json'))) {
      fs.writeFileSync(path.join(tmp, 'tsconfig.base.json'), '{"compilerOptions":{"baseUrl":".","paths":{},"moduleResolution":"Bundler"}}');
    }
    const bin = DEPCRUISE_BIN;
    /**
     * A-28-2：fixture 目录里放一份 `_exceptions.json` = 这条用例自持的例外台账。
     * 有就把 .dependency-cruiser.cjs 的读取口指过去（TM_EXCEPTIONS_FILE），没有才用仓库那份。
     * 于是"例外机制的探针"与"真仓库此刻有没有活例外"彻底解耦。
     */
    const ownLedger = path.join(tmp, '_exceptions.json');
    const hasOwnLedger = fs.existsSync(ownLedger);
    const cruise = (extra) =>
      spawnSync(process.execPath, [bin, '.', '--config', path.join(REPO, '.dependency-cruiser.cjs'), ...extra], {
        cwd: tmp,
        encoding: 'utf8',
        env: { ...process.env, TM_TASK: task, ...(hasOwnLedger ? { TM_EXCEPTIONS_FILE: ownLedger } : {}) },
      });
    /*
     * 实测（depcruise 18.3.1）：`--output-type json|text` 时 CLI 恒返回 0，只有默认输出
     * 才把违规数写进退出码。所以"退出码能阻断"必须按默认输出量，"命中哪条规则"按 json 量，
     * 两次都要跑，缺一不可 —— 只看 json 会把门禁的阻断力误判成通过。
     */
    const plain = cruise([]);
    const machine = cruise(['--output-type', 'json']);
    const json = (() => {
      try {
        return JSON.parse(machine.stdout || '{}');
      } catch {
        return null;
      }
    })();
    const violations = json && json.summary ? json.summary.violations || [] : [];
    return {
      ok: Boolean(json),
      exit: plain.status,
      ownLedger: hasOwnLedger ? toRel(REPO, path.join(src, '_exceptions.json')) : null,
      plainTail: (plain.stdout || '').trim().split(/\r?\n/).slice(-1)[0] || '',
      violations,
      stderr: (machine.stderr || plain.stderr || '').trim().slice(0, 300),
    };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
};

/** 自己写的递归拷贝：fs.cpSync 在本机临时目录上会 EIO/Access denied（AV 句柄）。 */
function copyTree(src, dest) {
  const st = fs.statSync(src);
  if (st.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    copyTree(path.join(src, ent.name), path.join(dest, ent.name));
  }
}

/**
 * A-19 疫苗（.dependency-cruiser.cjs 的 materialize 假绿缺陷）—— 三条用例共用一份故意违规
 * fixture：tools/fixtures/selftest/depcruise/review-no-agent-exception/
 *   E1 routes/review.ts          → packages/agent/src/graph.ts            该 (from,to) 登记在案 ⇒ 在用判绿 / 过期判红
 *   E2 services/review-service.ts → packages/agent/src/graph.ts           没有以它为 from 的例外 ⇒ 无论如何都判红
 *   E3 trpc/routers/review.ts     → packages/server/src/services/analyst.ts  from 有例外、to 未登记 ⇒ 仍判红
 * 期望红绿不写死：每次从**该 fixture 自持的例外台账** `_exceptions.json` 现算（"该 from 名下有没有
 * 一条 to 正则命中该 to 的在用例外"）。A-28-2：探针不许依赖真仓库里活着一条 review-no-agent 例外 ——
 * 那种写法在 T-10 把例外删掉之后恒红，等于把"门禁自己缺前置"当成"你的代码违规"，谁也不会去修。
 * 台账与 fixture 同目录，由 runDepcruiseCase 经 TM_EXCEPTIONS_FILE 注入
 * （正式跑门禁不设该 env，读的仍是 tools/exceptions.json —— 注入的是用例输入，不是后门）。
 * 红、绿两侧都要求非空，空转即红。
 */
export const A19_RULE = 'review-no-agent';
export const A19_FIXTURE = 'review-no-agent-exception';
/** A-28-2：用例自持的例外台账（与 fixture 同目录，随 copyTree 一起进临时目录）。 */
export const A19_LEDGER = path.join(ST, 'depcruise', 'review-no-agent-exception', '_exceptions.json');
export const A19_EDGES = [
  { id: 'E1', from: 'packages/server/src/routes/review.ts', to: 'packages/agent/src/graph.ts' },
  { id: 'E2', from: 'packages/server/src/services/review-service.ts', to: 'packages/agent/src/graph.ts' },
  { id: 'E3', from: 'packages/server/src/trpc/routers/review.ts', to: 'packages/server/src/services/analyst.ts' },
];

const a19Pair = (x) => `${x.from}\u0000${x.to}`;

/** 台账里属于 A19_RULE 的 depcruise 条目（游标无关，用来挑用例游标）。台账缺失返回 null。 */
const a19RuleEntries = () => {
  if (!fs.existsSync(A19_LEDGER)) return null;
  return (loadExceptions('T-01', A19_LEDGER).all || []).filter(
    (e) => e.engine === 'depcruise' && e.rule === A19_RULE && /^T-\d+$/.test(String(e.expires_after || '')),
  );
};

/** 某条 (from,to) 是否被给定游标下的在用例外豁免 —— 与 .dependency-cruiser.cjs 的展开口径一致。 */
const a19Exempted = (edge, activeEntries) =>
  activeEntries.some(
    (e) => e.from === edge.from && new RegExp(e.to, '').test(edge.to),
  );

const a19ViolatedPairs = (run) =>
  new Set(
    (run.violations || [])
      .filter((v) => ruleName(v).startsWith(A19_RULE))
      .map((v) => a19Pair({ from: String(v.from).replace(/^\.\//, ''), to: String(v.to).replace(/^\.\//, '') })),
  );

/**
 * 三条用例（A-19 第 2 点，缺一条即视为未修）：
 *   ① 规则带在用例外时，对未豁免的 to 仍判红；② 对已豁免的那一条 to 判绿；③ 例外过期后仍违规判红。
 * 用例游标由例外条目自己的 expires_after 推出（最早到期日的前一档 = 全部在用；最晚到期日 = 全部过期），
 * 不写死 T-NN。返回 { ok, lenientCursor, strictCursor, cases[] }，cases 由 selfTest 逐条 push。
 */
const a19Vaccine = () => {
  const entries = a19RuleEntries();
  if (entries === null) {
    return {
      ok: false,
      cases: [{ id: 'setup', label: 'A-19 前置：fixture 自持例外台账存在', ok: false, detail: `缺 ${toRel(REPO, A19_LEDGER)} —— 台账是这条疫苗自己的输入（A-28-2），缺它不是"别人没留例外"而是"疫苗没配疫苗"` }],
    };
  }
  if (entries.length === 0) {
    return {
      ok: false,
      cases: [{ id: 'setup', label: 'A-19 前置：fixture 台账里至少有一条 review-no-agent 例外', ok: false, detail: `${toRel(REPO, A19_LEDGER)} 里没有 depcruise/review-no-agent 条目 = 用例退化成普通规则用例（正是 A-19 漏检的原因）` }],
    };
  }
  const nums = entries.map((e) => taskNum(e.expires_after));
  const tm = (n) => `T-${String(n).padStart(2, '0')}`;
  const lenientCursor = tm(Math.min(...nums) - 1);
  const strictCursor = tm(Math.max(...nums));
  const lenientActive = loadExceptions(lenientCursor, A19_LEDGER).active.filter((e) => e.engine === 'depcruise' && e.rule === A19_RULE);
  const strictActive = loadExceptions(strictCursor, A19_LEDGER).active.filter((e) => e.engine === 'depcruise' && e.rule === A19_RULE);
  const expectRed = A19_EDGES.filter((e) => !a19Exempted(e, lenientActive));
  const expectGreen = A19_EDGES.filter((e) => a19Exempted(e, lenientActive));
  const expectRedStrict = A19_EDGES.filter((e) => !a19Exempted(e, strictActive));

  const lenientRun = runDepcruiseCase(A19_FIXTURE, lenientCursor);
  const strictRun = runDepcruiseCase(A19_FIXTURE, strictCursor);
  const lenientRed = a19ViolatedPairs(lenientRun);
  const strictRed = a19ViolatedPairs(strictRun);
  const tablePairs = new Set(A19_EDGES.map(a19Pair));
  const extras = [...lenientRed].filter((p) => !tablePairs.has(p));
  const miss = (edges, set) => edges.filter((e) => !set.has(a19Pair(e))).map((e) => e.id);
  const leak = (edges, set) => edges.filter((e) => set.has(a19Pair(e))).map((e) => e.id);

  const cases = [
    {
      id: '①',
      label: `A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=${lenientCursor}）`,
      ok:
        lenientRun.ok &&
        expectRed.length >= 1 &&
        miss(expectRed, lenientRed).length === 0 &&
        extras.length === 0,
      detail: `在用例外 ${lenientActive.length} 条 / 期望红 ${expectRed.map((e) => e.id).join(',') || '(无 ⇒ 用例空转)'} / 实际红 ${lenientRed.size}${miss(expectRed, lenientRed).length ? ` / 漏报 ${miss(expectRed, lenientRed).join(',')}` : ''}${extras.length ? ` / 未登记的红边 ${extras.length} 条（fixture 与用例表不同步）` : ''} ${lenientRun.why || lenientRun.stderr || ''}`,
    },
    {
      id: '②',
      label: `A-19② 已豁免的那一条 (from,to) 判绿（cursor=${lenientCursor}）`,
      ok: expectGreen.length >= 1 && leak(expectGreen, lenientRed).length === 0,
      detail: `期望绿 ${expectGreen.map((e) => e.id).join(',') || '(无 ⇒ 用例空转)'} / 被误判红的绿边 ${leak(expectGreen, lenientRed).join(',') || '无'}`,
    },
    {
      id: '③',
      label: `A-19③ 例外过期后仍违规 → 判红（cursor=${strictCursor}，同一 fixture 的同一批边）`,
      ok:
        strictRun.ok &&
        expectGreen.length >= 1 &&
        miss(expectGreen, strictRed).length === 0 &&
        miss(expectRedStrict, strictRed).length === 0,
      detail: `在用游标下绿、过期游标必须转红的边 ${expectGreen.map((e) => e.id).join(',') || '(无 ⇒ 用例空转)'} / 过期游标期望红 ${expectRedStrict.map((e) => e.id).join(',') || '(无)'} / 实际红 ${strictRed.size} / 仍漏 ${miss(expectRedStrict, strictRed).concat(miss(expectGreen, strictRed).map((x) => `${x}(该转红而未转)`)).join(',') || '无'}`,
    },
  ];
  return { ok: cases.every((c) => c.ok), lenientCursor, strictCursor, cases };
};

/**
 * A-30-4：`--web` 必须是「同一套检查的另一个入口」，不是「另写的一套更松的」。
 * 光比词表不够（表在、正则拼错或转义被吞，表照样"相等"），所以三段一起核：
 *   1) 结构：两侧词表都由同一份 `IO_GLOBALS_TERMS` 展开，且每个词都得有行为样本 —— 新增词不给
 *      样本 = 本例红，逼后来的人把新词也真跑一遍；
 *   2) 行为：逐词生成一段**真会命中**的代码，同时摆进 `packages/ui/src/**` 与
 *      `apps/web/src/components/home/**`，两侧断言各跑一次，该红的红、该绿的绿；
 *   3) 不对称：`useQuery(` 只许 UI 红、web 绿（apps/web 的唯一合法传输面就是 trpc 的 useQuery，
 *      并进核心会把被裁决判为合规的写法全扫红）；`localStorage` 只许 web 红（packages/ui 的
 *      host.tsx / use-theme-toggle.ts 本来就在用它，塞进核心就是误伤）。并要求绿向 fixture 里
 *      真的有 `useQuery(` —— 否则第 3 段测的是个没被覆盖的分支。
 */
export const IO_TERM_SAMPLES = {
  '(?<![\\w$.])fetch\\s*\\(': "export const p = () => fetch('/api/x');",
  XMLHttpRequest: 'export const x = () => new XMLHttpRequest();',
  axios: "export const g = () => axios.get('/api/x');",
  'useQuery\\(': 'export const q = () => useQuery({ queryKey: ["x"], queryFn: () => [] });',
  '(?<![\\w$.])localStorage': "export const s = () => localStorage.setItem('k', 'v');",
};

const webTransportParity = () => {
  const ui = ASSERTIONS.find((a) => a.id === 'ui-no-io-globals');
  const web = ASSERTIONS.find((a) => a.id === 'web-home-transport');
  if (!ui || !web) return { ok: false, detail: '注册表里缺 ui-no-io-globals 或 web-home-transport 之一' };
  const problems = [];
  const uiTerms = [...IO_GLOBALS_TERMS, ...UI_IO_EXTRA_TERMS];
  const webTerms = [...IO_GLOBALS_TERMS, ...WEB_IO_EXTRA_TERMS];
  if (IO_GLOBALS_TERMS.length === 0) problems.push('共用核心词表 IO_GLOBALS_TERMS 为空（两侧同时失去判定力）');
  for (const t of IO_GLOBALS_TERMS) {
    if (!uiTerms.includes(t)) problems.push(`--ui-io 的词表不含核心词 ${t}`);
    if (!webTerms.includes(t)) problems.push(`--web 的词表不含核心词 ${t}（就是"另写了一套更松的"）`);
  }
  const all = [...new Set([...uiTerms, ...webTerms])];
  for (const t of all) if (!IO_TERM_SAMPLES[t]) problems.push(`词 ${t} 没有行为样本（新增词必须同时给一段真会命中的代码）`);

  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-gate-')), 'w');
  try {
    fs.mkdirSync(path.join(tmp, 'packages/ui/src/hooks'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'apps/web/src/components/home'), { recursive: true });
    const uiFile = (i) => `packages/ui/src/hooks/parity-${i}.ts`;
    const webFile = (i) => `apps/web/src/components/home/parity-${i}.tsx`;
    all.forEach((t, i) => {
      const body = IO_TERM_SAMPLES[t] || '// 缺样本';
      fs.writeFileSync(path.join(tmp, uiFile(i)), `${body}\n`);
      fs.writeFileSync(path.join(tmp, webFile(i)), `${body}\n`);
    });
    const ctx = { cursor: 'T-12', scopeRoot: tmp, exceptions: { active: [], expired: [], malformed: [] }, fixtures: true };
    const uiRes = runAssertion(ui, ctx);
    const webRes = runAssertion(web, ctx);
    const filesOf = (r) => new Set((r.hits || []).map((h) => String(h.file)));
    const uiHits = filesOf(uiRes);
    const webHits = filesOf(webRes);
    all.forEach((t, i) => {
      const uiFired = uiHits.has(uiFile(i));
      const webFired = webHits.has(webFile(i));
      if (uiFired !== uiTerms.includes(t)) problems.push(`${t} 在 --ui-io 侧${uiTerms.includes(t) ? '该红' : '该绿'}，实际${uiFired ? '红' : '绿'}`);
      if (webFired !== webTerms.includes(t)) problems.push(`${t} 在 --web 侧${webTerms.includes(t) ? '该红' : '该绿'}，实际${webFired ? '红' : '绿'}`);
    });
    const greenFile = path.join(ST, 'web-clean', 'apps/web/src/components/home/result-section.tsx');
    const greenText = fs.existsSync(greenFile) ? fs.readFileSync(greenFile, 'utf8') : '';
    if (!/useQuery\s*\(/.test(greenText)) problems.push('web-clean 绿向 fixture 里没有 useQuery( ⇒ 第 3 段在测一个没被覆盖的分支');
    const verdicts = all.map((t, i) => `${t}〔ui=${uiHits.has(uiFile(i)) ? '红' : '绿'} web=${webHits.has(webFile(i)) ? '红' : '绿'}〕`).join(' ');
    return {
      ok: problems.length === 0,
      detail: (problems.length ? problems.join(' / ') : `${all.length} 个词逐词跑真代码，两侧判定与词表一致（--web ⊇ 共用核心 ${IO_GLOBALS_TERMS.length} 词，另加 ${WEB_IO_EXTRA_TERMS.length} 词；只加不减）`) + ` —— ${verdicts}`,
    };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
};

/**
 * A-24-1 的"两套同口径"机械核对：现读 `apps/app/vite.config.ts`，把 `tm-app:dist-guard` 用到的
 * 每一条正则（BANNED_APIS / ROOT_RELATIVE_ASSET_REFS / 四条 .at 判据）抠出来，逐条要求它
 * **原文出现在 boundaries 的清单里**。方向是 dist-guard ⊆ boundaries：插件侧新增一条而脚本没跟上
 * → 红；脚本侧的增量只许更严，条数在 detail 里报出来供 TPM 追认。
 * 对照文件读不到就判红 —— "没有对照物"不等于"口径一致"。
 */
const VITE_GUARD_ARRAYS = ['BANNED_APIS', 'ROOT_RELATIVE_ASSET_REFS'];
const VITE_GUARD_CONSTS = ['ANY_AT_CALL', 'ARRAY_PROTO_AT', 'AT_FEATURE_GUARD', 'OWN_AT_METHOD'];
/** 逐行抠：`  ['标签', /正则/flags],`（prettier 保证一条一行；不按全局正则扫，避免标签里的引号/斜杠串台）。 */
const VITE_ENTRY_LINE = /^\s*\['(.*?)',\s*(\/.*\/[a-z]*)\s*\],?\s*$/;
const VITE_CONST_LINE = (names) => new RegExp(`^\\s*const (?:${names.join('|')})\\s*=\\s*(\\/.*\\/[a-z]*);`);

const distGuardParity = () => {
  const cfg = path.join(REPO, 'apps', 'app', 'vite.config.ts');
  if (!fs.existsSync(cfg)) {
    return { ok: false, detail: `读不到 ${toRel(REPO, cfg)} —— 对照物缺失（dist-guard 被删/改名即为此红），不许当成"口径一致"` };
  }
  const cfgLines = linesOf(cfg);
  const mine = new Map(
    [...DIST_ASSET_RULES, ...DIST_BANNED_APIS]
      .map(([label, re]) => [re.source, label])
      .concat([['ANY_AT_CALL', ANY_AT_CALL], ['ARRAY_PROTO_AT', ARRAY_PROTO_AT], ['AT_FEATURE_GUARD', AT_FEATURE_GUARD], ['OWN_AT_METHOD', OWN_AT_METHOD]].map(([, re]) => [re.source, '']))
  );
  const theirs = new Set();
  const missing = [];
  /** 取 `const NAME … = [ … ];` 数组体（找不到返回 null，交由"没抠到"分支报红）。 */
  const arrayOf = (name) => {
    const start = cfgLines.findIndex((x) => new RegExp(`^const ${name}\\b`).test(x));
    if (start < 0) return null;
    let end = cfgLines.length;
    for (let i = start; i < cfgLines.length; i += 1) {
      if (/^\];/.test(cfgLines[i])) {
        end = i;
        break;
      }
    }
    return cfgLines.slice(start + 1, end);
  };
  for (const name of VITE_GUARD_ARRAYS) {
    const block = arrayOf(name) || [];
    const found = block.map((l) => VITE_ENTRY_LINE.exec(l)).filter(Boolean);
    if (found.length === 0) missing.push(`${name}（数组条目一条都没抠到）`);
    for (const m of found) theirs.add(m[2].slice(1, m[2].lastIndexOf('/')));
  }
  const constLines = cfgLines.filter((l) => VITE_CONST_LINE(VITE_GUARD_CONSTS).test(l));
  if (constLines.length < VITE_GUARD_CONSTS.length) {
    missing.push(`.at 判据常量（只抠到 ${constLines.length}/${VITE_GUARD_CONSTS.length} 条）`);
  }
  for (const l of constLines) {
    const lit = VITE_CONST_LINE(VITE_GUARD_CONSTS).exec(l)[1];
    theirs.add(lit.slice(1, lit.lastIndexOf('/')));
  }
  const notInMine = [...theirs].filter((s) => !mine.has(s));
  if (missing.length) {
    return { ok: false, detail: `vite.config.ts 里这些 dist-guard 判据没抠到：${missing.join('；')}（改名/删除 = 口径失控，不许当"已对齐"）` };
  }
  if (notInMine.length) {
    return { ok: false, detail: `dist-guard 有 ${notInMine.length} 条正则不在 --dist 清单里（谁也不许更松）：${notInMine.join(' | ')}` };
  }
  const extras = [...mine.keys()].filter((s) => !theirs.has(s));
  return {
    ok: true,
    detail: `dist-guard 的 ${theirs.size} 条正则全部在册（⊆ --dist 清单）；--dist 另有 ${extras.length} 条增量（只严不松）：${extras.map((s) => `${s}〔${mine.get(s) || '.at 判据'}〕`).join(' | ') || '无'}`,
  };
};

/**
 * A-106 判据③ 的反"永真"用例：预算这条断言自己有没有判定力。
 * 沙盒自造（⛔ 吃仓库真产物 ⇒ 用例不许随构建漂移，A-33-4 同口径），四问：
 *   ① 首屏 js 超预算 → 必须红（这条最核心的判定力：把阈值搬到产物脚下就永远绿）
 *   ② 同形但在预算内 → 必须绿（证明红来自超预算而不是"fixture 摆得像红的"）
 *   ③ index.html 里 0 颗首屏引用 → 必须红（断言失去对象不许绿）
 *   ④ 引用的首屏 js 不在盘上 → 必须红（⛔ 读不到就不算）
 * 另加 ⑤：无 index.html 的目录 → 必须红。
 * 造"超预算"的内容 = 大写字母+数字的伪随机串（LCG，可复现）：无小写 ⇒ 不可能撞判据② 的
 * API 名；无斜杠/引号连写 ⇒ 不可能撞判据① ⇒ 红只能来自判据③，用例才是干净的。
 */
const distBudgetTruthCases = () => {
  const out = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-f59-budget-'));
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const noise = (n, seed) => {
    let s = seed >>> 0;
    let t = '';
    while (t.length < n) {
      let chunk = '';
      for (let i = 0; i < 4096; i += 1) {
        s = (s * 1664525 + 1013904223) >>> 0;
        chunk += ALPHABET[s % ALPHABET.length];
      }
      t += chunk;
    }
    return t.slice(0, n);
  };
  const mk = (name, html, files) => {
    const dir = path.join(root, name, 'apps', 'app', 'dist');
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    for (const [f, body] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, 'assets', f), body);
    return dir;
  };
  const run = (name) => runDistGuard([path.join(root, name, 'apps', 'app', 'dist')], { cursor: 'T-14' });
  const onlyBudget = (res) => !res.hits.length && /判据③/.test(res.detail || '');

  /* 判据③ 的四颗夹具刻意用**经典脚本**形状：A-109 之后真机产物就是经典脚本，
   * 用 module 形状当"预算内判绿"的夹具等于让判据④ 顺手把它们判红（红的来源会互相污染）。
   * module/crossorigin 的形状在下面判据④ 的反证组里单独钉。 */
  const over = mk('over', '<!doctype html><html><head><script src="./assets/big.js"><\/script><script src="./assets/big2.js"><\/script><\/head><body></body></html>\n', {
    'big.js': `var A="${noise(900000, 7)}";\n`,
    'big2.js': `var B="${noise(900000, 11)}";\n`,
  });
  const ro = run('over');
  out.push({ ok: ro.status === 'red' && onlyBudget(ro), label: 'A-106③① 首屏 js 超预算 → 判红，且红只来自判据③（①② 0 命中）', detail: `dir=${path.basename(over)} status=${ro.status} hits=${ro.hits.length} ${(ro.detail || '').slice(0, 170)}` });

  const thin = mk('thin', '<!doctype html><html><head><script src="./assets/small.js"><\/script><script src="./assets/small2.js"><\/script><\/head><body></body></html>\n', {
    'small.js': `var A="${noise(2000, 7)}";\n`,
    'small2.js': `var B="${noise(2000, 11)}";\n`,
  });
  const rg = run('thin');
  out.push({ ok: rg.status === 'green' && /判据③/.test(rg.detail) && /≤/.test(rg.detail), label: 'A-106③② 同形产物在预算内 → 判绿（证明①的红来自额度而不是 fixture 摆相）', detail: `status=${rg.status} ${thin ? '' : ''}${(rg.detail || '').slice(0, 170)}` });

  const noref = mk('noref', '<!doctype html><html><head><script>var x=1;<\/script><\/head><body></body></html>\n', {});
  const rn = run('noref');
  out.push({ ok: rn.status === 'red' && /0 颗首屏/.test(rn.detail || ''), label: 'A-106③③ index.html 解析到 0 颗首屏 JS → 判红（断言失去对象不许绿）', detail: `status=${rn.status} ${(rn.detail || '').slice(0, 170)}` });

  const miss = mk('miss', '<!doctype html><html><head><script src="./assets/gone.js"><\/script><\/head><body></body></html>\n', {});
  const rm = run('miss');
  out.push({ ok: rm.status === 'red' && /不在盘上/.test(rm.detail || ''), label: 'A-106③④ 首屏引用的 js 不在盘上 → 判红（⛔ 读不到就不算）', detail: `status=${rm.status} ${(rm.detail || '').slice(0, 170)}` });

  /* ── A-109 / F-70 判据④：真机白屏那一族的五种写法，逐颗钉（每颗都要亲见红，不许靠"整组红"充数）── */
  const f4 = (name, html, files) => {
    const dir = mk(name, html, files || {});
    return runDistGuard([dir], { cursor: 'T-14' });
  };
  const SMALL = { 'a.js': `var A="${noise(2000, 5)}";\n` };
  const modRed = f4('f4-mod', '<!doctype html><html><head><script type="module" src="./assets/a.js"><\/script><\/head><body></body></html>\n', SMALL);
  out.push({ ok: modRed.status === 'red' && modRed.hits.some((h) => h.rule === '判据④' && /type="module"/.test(h.term)), label: 'A-109④① html 里 type="module" → 判据④ 判红（真机 CORS 拒取源＝白屏）', detail: `status=${modRed.status} hits=${modRed.hits.length} ${(modRed.hits[0] || {}).term || modRed.detail}` });

  const coRed = f4('f4-crossorigin', '<!doctype html><html><head><script src="./assets/a.js" crossorigin><\/script><\/head><body></body></html>\n', SMALL);
  out.push({ ok: coRed.status === 'red' && coRed.hits.some((h) => h.rule === '判据④' && /crossorigin/.test(h.term)), label: 'A-109④② 经典脚本但带 crossorigin 属性 → 判据④ 判红（属性本身就切到 CORS-mode）', detail: `status=${coRed.status} hits=${coRed.hits.length} ${(coRed.hits[0] || {}).term || coRed.detail}` });

  const mpRed = f4('f4-modulepreload', '<!doctype html><html><head><link rel="modulepreload" href="./assets/a.js" /><\/head><body></body></html>\n', SMALL);
  out.push({ ok: mpRed.status === 'red' && mpRed.hits.some((h) => h.rule === '判据④' && /modulepreload/.test(h.term)), label: 'A-109④③ rel="modulepreload" → 判据④ 判红', detail: `status=${mpRed.status} hits=${mpRed.hits.length} ${(mpRed.hits[0] || {}).term || mpRed.detail}` });

  const dynRed = f4('f4-dynimport', '<!doctype html><html><head><script src="./assets/a.js"><\/script><\/head><body></body></html>\n', {
    'a.js': `var A="${noise(2000, 5)}";\nconst m=()=>import("./assets/a.js");\n`,
  });
  out.push({ ok: dynRed.status === 'red' && dynRed.hits.some((h) => h.rule === '判据④' && /import\(\)/.test(h.term)), label: 'A-109④④ JS 产物里有运行时 import( → 判据④ 判红（懒加载在 file:// 下同样取不到源）', detail: `status=${dynRed.status} hits=${dynRed.hits.length} ${(dynRed.hits.find((h) => h.rule === '判据④') || {}).term || dynRed.detail}` });

  const imRed = f4('f4-importmeta', '<!doctype html><html><head><script src="./assets/a.js"><\/script><\/head><body></body></html>\n', {
    'a.js': `var A="${noise(2000, 5)}";\nvar u=import.meta.url;\n`,
  });
  out.push({ ok: imRed.status === 'red' && imRed.hits.some((h) => h.rule === '判据④' && /import\.meta/.test(h.term)), label: 'A-109④⑤ JS 产物里有 import.meta → 判据④ 判红（iife 形状不该出现，出现=没降级干净）', detail: `status=${imRed.status} hits=${imRed.hits.length} ${(imRed.hits.find((h) => h.rule === '判据④') || {}).term || imRed.detail}` });

  const cssGreen = f4('f4-cssimport', '<!doctype html><html><head><script src="./assets/a.js"><\/script><\/head><body></body></html>\n', {
    ...SMALL,
    'index.css': '@import url("./a.css");\nbody{color:red}\n',
  });
  out.push({ ok: cssGreen.status === 'green', label: 'A-109④⑥ 反证：css 里的 @import( 不许被判据④ 误伤（词表只作用在 html/js 上）', detail: `status=${cssGreen.status} hits=${cssGreen.hits.length} ${cssGreen.detail}` });

  const modCountHtml = '<!doctype html><html><head><script type="module" src="./assets/a.js"><\/script><link rel="modulepreload" href="./assets/b.js" /><\/head><body></body></html>\n';
  const modCount = firstScreenJsRefs(modCountHtml);
  out.push({ ok: modCount.length === 2 && modCount[0] === './assets/a.js' && modCount[1] === './assets/b.js', label: 'A-109④⑦ module 形状的两颗引用仍被判据③ 数进首屏（改判后 ③ 不许只认新形状而漏判旧的）', detail: `refs=${modCount.join(' + ') || '无'}` });

  const clsGreen = f4('f4-classic-green', '<!doctype html><html><head><script src="./assets/a.js"><\/script><link rel="stylesheet" href="./assets/a.css" /><\/head><body></body></html>\n', {
    ...SMALL,
    'a.css': 'body{color:red}\n',
  });
  out.push({ ok: clsGreen.status === 'green' && /判据④ 0 处/.test(clsGreen.detail || ''), label: 'A-109④⑧ 出口形状（经典 script + 普通 stylesheet）→ 判绿，且 detail 里判据④ 有独立计数（不是被摘掉的判据）', detail: `status=${clsGreen.status} ${(clsGreen.detail || '').slice(0, 200)}` });

  const nohtml = path.join(root, 'nohtml', 'apps', 'app', 'dist');
  fs.mkdirSync(path.join(nohtml, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(nohtml, 'assets', 'only.js'), 'var A=1;\n');
  const rh = runDistGuard([nohtml], { cursor: 'T-14' });
  out.push({ ok: rh.status === 'red' && /没有 index\.html/.test(rh.detail || ''), label: 'A-106③⑤ 有产物但无 index.html → 判红（不适用即通过 = 假绿）', detail: `status=${rh.status} ${(rh.detail || '').slice(0, 170)}` });

  return out;
};

/** 命中打印格式必须能定位：`文件:行/偏移 + 命中串` 四要素缺一即红。 */
const distHitShapeCheck = () => {
  const dir = path.join(ST, 'violations', 'dist-artifacts');
  const res = runDistGuard(['apps/app/dist'], { cursor: 'T-14', scopeRoot: dir });
  if (res.status !== 'red' || res.hits.length === 0) {
    return { ok: false, detail: `脏产物 fixture 未判红（status=${res.status} hits=${res.hits.length}）→ 无法证明打印格式` };
  }
  const bad = res.hits.filter((h) => !h.file || !(h.line > 0) || !Number.isFinite(h.offset) || !h.text);
  const terms = new Set(res.hits.map((h) => h.term));
  const shaped = fmtDistHit(res.hits[0]);
  return {
    ok: bad.length === 0 && terms.has('structuredClone'),
    detail: bad.length
      ? `${bad.length} 处命中缺 file/行/偏移/命中串 之一，例：${JSON.stringify(bad[0])}`
      : `${res.hits.length} 处命中四要素齐备，样例：${shaped.slice(0, 150)}`,
  };
};

/**
 * A-33-4：四条"有限授权动作通道"的 --self-test 用例（A-28-3 / A-30-8 / A-30-10 / A-34-3）。
 *
 * 为什么用例自己造沙盒而不吃仓库的 tools/ownership.json：
 *   - 归属表登记 `actions:[]` 是并行的 **E1b** 名下，本轮开工时表里一条通道都没有；
 *     把用例挂在别人的文件上 = 探针"活在别人进度上"，正是 A-28-2 判死的病。
 *   - 沙盒里的表/文件/patch 全是**用例的输入**，判定走的是仓库里同一份 checkOwnership
 *     （不是复制的第二套），所以红绿两侧都能证明"这条通道带电"。
 * 每条通道固定四问：①合规 diff → 放行且**注明走了哪条通道**（证明放行来自通道而非别的分支）
 *   ②③两种越界形态 → 红 ④只在 --files 清单里点名、没有 patch → 红（要证据）。
 * 另加一条：通道名写错 → 红（未知通道绝不默认放行）。
 */
const ownershipActionChannels = () => {
  const out = [];
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-e1a-ch-')), 'r');
  const w = (rel, text) => {
    const abs = path.join(root, rel.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
    return rel;
  };
  /** 某行在 post-image 里的 1-based 行号：patch 行号由内容算出来，不手抄，免得 fixture 自伤。 */
  const lineNo = (text, needle) => {
    const idx = text.split('\n').findIndex((l) => l.includes(needle));
    if (idx === -1) throw new Error(`沙盒 fixture 里找不到锚点 ${needle}`);
    return idx + 1;
  };
  const CTX = ' 不变的一行';
  const insPatch = (file, newStart, added) =>
    `--- a/${file}\n+++ b/${file}\n@@ -1,1 +${newStart},${added.length + 1} @@\n` +
    `${added.map((t) => `+${t}`).join('\n')}\n ${CTX}\n`;
  const delPatch = (file, oldStart, removed) =>
    `--- a/${file}\n+++ b/${file}\n@@ -${oldStart},${removed.length + 1} +${oldStart},0 @@\n` +
    `${removed.map((t) => `-${t}`).join('\n')}\n ${CTX}\n`;
  const modPatch = (file, oldStart, newStart, removed, added) =>
    `--- a/${file}\n+++ b/${file}\n@@ -${oldStart},2 +${newStart},2 @@\n-${removed}\n+${added}\n ${CTX}\n`;
  /**
   * 一个文件头 + 多个 @@ 段（git diff 的真实形状）。
   * 注意别用"同一路径的文件头重复拼接"代替它：parsePatch 见到第二个 `+++ 同路径` 会
   * 新建一条记录并覆盖前一条（真实 patch 不会这样），那样 8 行变更只会被数成 2 行 = 假绿。
   */
  const multiModPatch = (file, pairs) =>
    `--- a/${file}\n+++ b/${file}\n` +
    pairs.map(([oldStart, newStart, removed, added]) => `@@ -${oldStart},2 +${newStart},2 @@\n-${removed}\n+${added}\n ${CTX}\n`).join('');

  /* 四条通道的目标文件（**改动后的工作树版本**，与 git diff 的 post-image 语义一致） */
  const GREEN_SUPP_LINE = '  UNDO_LIMIT_REACHED: { http: 429, copy: `撤销次数用完了` },';
  const RED_SUPP_LINE = '  NOTHING_TO_UNDO: { http: 409, copy: `没有可撤销的` },';
  const errorsTs = [
    '// 沙盒：A-33-4 用例自持的 §4.6 形状，与真 packages/shared 无关',
    '/* 三个冻结符号一字不能动 */',
    'export const TM_ERROR_CODES = {',
    "  BAD_REQUEST: 'BAD_REQUEST',",
    '} as const;',
    '',
    'export const TM_ERROR_ROWS = [',
    "  ['BAD_REQUEST', 400, `请求不合法`],",
    '];',
    '',
    'export const TM_ERRORS = {',
    '  BAD_REQUEST: { http: 400, copy: `请求不合法` },',
    '};',
    '',
    'export const TM_ERRORS_SUPPLEMENT = {',
    '  FORBIDDEN: { http: 403, copy: `没权限` },',
    GREEN_SUPP_LINE,
    '};',
  ].join('\n');
  /* 红向 fixture：追加真的落在 TM_ERRORS 块内（行号与 post-image 自洽） */
  const errorsFrozenTs = [
    '// 沙盒红向：追加落进 §4.6 冻结符号',
    '/* 同上 */',
    'export const TM_ERROR_CODES = {',
    "  BAD_REQUEST: 'BAD_REQUEST',",
    '} as const;',
    '',
    'export const TM_ERROR_ROWS = [',
    "  ['BAD_REQUEST', 400, `请求不合法`],",
    '];',
    '',
    'export const TM_ERRORS = {',
    '  BAD_REQUEST: { http: 400, copy: `请求不合法` },',
    RED_SUPP_LINE,
    '};',
    '',
    'export const TM_ERRORS_SUPPLEMENT = {',
    '  FORBIDDEN: { http: 403, copy: `没权限` },',
    '};',
  ].join('\n');
  const pkgJson = [
    '{',
    '  "name": "@tm/web",',
    '  "version": "0.1.0",',
    '  "scripts": {',
    '    "dev": "next dev -p 3100",',
    '    "build": "next build",',
    '    "test": "vitest run",',
    '    "lint": "next lint"',
    '  },',
    '  "dependencies": {',
    '    "react": "19.2.8",',
    '    "next": "15.1.5"',
    '  }',
    '}',
  ].join('\n');
  const boundedTs = ['export const a = 1;', 'export const b = 2;', 'export const c = 3;', 'export const d = 4;'].join('\n');
  /**
   * 文件：具名块 `myArr`（多行数组，block-append 判据的绿/红 fixture）。
   * 首行注释是**必要**的：块必须从第 2 行开始，否则"紧贴块上方插一行"没有可表达的位置，
   * A-35-11 的块上方插入疫苗（baAboveBlock）就写不出来。
   */
  const blockAppendTs = [
    '// 沙盒 fixture 抬头：myArr 块故意不落在第 1 行（块上方插入疫苗要用到那一行）',
    'export const myArr = [',
    "  'a',",
    "  'b',",
    "  'c',",
    '];',
    'export const otherThing = 99;',
  ].join('\n');
  const exceptionsJson = ['{', '  "gate_cursor": "T-02",', '  "exceptions": [', '  ]', '}'].join('\n');
  /**
   * 通道 baseline-regenerate 的 fixture（A-36 四-1 的 E3′ 一次性再生）：
   * 一份"生成物快照" + 同名的 spec 本体，路径形状照真实的
   * `packages/server/test/trpc-shape.{spec.ts,baseline.json}` 那条窄授权面来（花括号二选一）。
   */
  const baselineJson = [
    '{',
    '  "note": "沙盒 fixture：生成物快照，只由测试再生",',
    '  "paths": [',
    '    "auth.login",',
    '    "profile.get"',
    '  ]',
    '}',
  ].join('\n');
  const shapeSpecTs = [
    '// 沙盒 fixture：spec 本体（再生通道碰它就必须红）',
    "it('shape', () => {});",
  ].join('\n');

  const tableFile = path.join(root, 'tools', 'ownership.json');
  const fExceptions = w('tools/exceptions.json', exceptionsJson);
  const fErrors = w('packages/shared/src/constants/errors.ts', errorsTs);
  const fErrorsFrozen = w('packages/shared/src/constants/errors-frozen.ts', errorsFrozenTs);
  const fPkg = w('apps/web/package.json', pkgJson);
  const fBounded = w('services/limited/thing.ts', boundedTs);
  const fBlockAppend = w('services/appendable/block.ts', blockAppendTs);
  const fContaminated = w('services/contaminated/thing.ts', boundedTs);
  const fBaseline = w('test/shape.baseline.json', baselineJson);
  const fShapeSpec = w('test/shape.spec.ts', shapeSpecTs);
  const fOtherBaseline = w('test/other.baseline.json', baselineJson);
  const fTypo = w('tools/typo.json', exceptionsJson);
  /**
   * F-41（A-81 #287）夹具：**同路径并列两条归属条目**（真表今天 `dup-paths=[]`，所以只能在沙盒里造）。
   * `thing.ts` = 正证对（帽子分别在先写者与后写者身上）；`conflict.ts` = 反证对（同一任务号两条不同幅度）。
   */
  const fTied = w('services/tied/thing.ts', boundedTs);
  const fTiedConflict = w('services/tied/conflict.ts', boundedTs);
  /** A-40 #50b 夹具：一颗文件上**同时**登记动作通道与 `zeroDiffFor`，钉判定顺序（先 actions）。 */
  const fOrder = w('services/order/both.ts', boundedTs);
  w('tools/ownership.json', `${JSON.stringify({
    ownership: [
      { path: 'tools/exceptions.json', owner: 'T-02', reason: '沙盒：例外台账（A-28-3 通道）', actions: ['delete-expired-entry'] },
      { path: 'packages/shared/src/constants/**', owner: 'T-03', reason: '沙盒：shared 文案唯一真相（A-30-8 通道）', actions: ['extend-supplement'] },
      { path: 'services/limited/thing.ts', owner: 'T-12', reason: '沙盒：有限授权幅度（A-30-10 通道）', actions: ['bounded-edit:A-30-10'], maxDiffLinesFor: { 'T-02': 4 } },
      { path: 'apps/web/package.json', owner: 'T-04', reason: '沙盒：只许加脚本行（A-34-3 通道）', actions: ['add-script-lines-only:A-34-3'] },
      { path: 'tools/typo.json', owner: 'T-02', reason: '沙盒：通道名写错的条目', actions: ['delete-expired-entryy'] },
      { path: 'services/appendable/block.ts', owner: 'T-99', reason: '沙盒：block-append 通道（A-35-11）', actions: ['block-append:A-35-11'], blockAppendFor: { 'T-02': { blocks: ['myArr'], maxAppendLines: 3 } } },
      // bounded-edit HEAD reject test: cap=2; a 3+ removal patch on this file triggers reject (A-35-1③)
      { path: 'services/contaminated/thing.ts', owner: 'T-99', reason: '沙盒：HEAD diff 污染拒判（A-35-1③）', actions: ['bounded-edit:A-35-1'], maxDiffLinesFor: { 'T-02': 2 } },
      { path: 'test/shape.{spec.ts,baseline.json}', owner: 'T-08', reason: '沙盒：生成物一次性再生通道（A-36 四-1）', actions: ['baseline-regenerate:A-36-E3'], baselineRegenerateFor: { E3: { outputs: ['test/shape.baseline.json'] } } },
      { path: 'test/other.{spec.ts,baseline.json}', owner: 'T-08', reason: '沙盒：再生通道缺自报产物清单 → 拒判', actions: ['baseline-regenerate:A-36-E3'], baselineRegenerateFor: { E3: {} } },
      /* F-41 正证对：帽子一条一个任务号，旧写法 `entries[0]` 只读先写者 ⇒ T-05 判"无上限授权"红 */
      { path: 'services/tied/thing.ts', owner: 'T-12', reason: '沙盒 F-41 先写者（只有 T-02 的帽子）', actions: ['bounded-edit:A-41-tie'], maxDiffLinesFor: { 'T-02': 4 } },
      { path: 'services/tied/thing.ts', owner: 'T-12', reason: '沙盒 F-41 后写者（带 T-05 的帽子，旧写法永远读不到）', actions: ['bounded-edit:A-41-tie'], maxDiffLinesFor: { 'T-05': 2 } },
      /* F-41 反证对：同一任务号在并列两条里幅度不同 = 账面矛盾，必须拒判而不是静默取大 */
      { path: 'services/tied/conflict.ts', owner: 'T-12', reason: '沙盒 F-41 冲突先写者', actions: ['bounded-edit:A-41-tie'], maxDiffLinesFor: { 'T-02': 4 } },
      { path: 'services/tied/conflict.ts', owner: 'T-12', reason: '沙盒 F-41 冲突后写者（想靠"再建一条"把额度扩到 6）', actions: ['bounded-edit:A-41-tie'], maxDiffLinesFor: { 'T-02': 6 } },
      /* A-40 #50b 钉子：同一条目上 actions 与 zeroDiffFor 都点名 T-02 ⇒ 判定必须先读 actions。
         顺序反了（zeroDiffFor 在前）则这条合规的 4 行 patch 会被"§10.4 明示零 diff"判红。 */
      { path: 'services/order/both.ts', owner: 'T-12', reason: '沙盒 A-40 #50b：动作通道优先于 zeroDiffFor', actions: ['bounded-edit:A-40-50b'], maxDiffLinesFor: { 'T-02': 4 }, zeroDiffFor: ['T-02'] },
    ],
  }, null, 2)}\n`);

  const patches = {};
  const EXPIRED = ['    {', '      "id": "e1a-expired",', '      "engine": "boundaries",', '      "owner": "T-02",', '      "expires_after": "T-13",', '      "reason": "到期条目"', '    },'];
  const NOTYET = ['    {', '      "id": "e1a-not-yet",', '      "engine": "boundaries",', '      "owner": "T-02",', '      "expires_after": "T-20",', '      "reason": "未到期条目"', '    },'];
  const HALF = ['      "id": "e1a-half",', '      "expires_after": "T-13",'];
  const P = (name, rel, body) => {
    const r = w(`.p/${name}.patch`, body);
    patches[name] = path.join(root, r.replace(/\//g, path.sep));
  };
  P('delOk', fExceptions, delPatch(fExceptions, 5, EXPIRED));
  P('delNotYet', fExceptions, delPatch(fExceptions, 5, NOTYET));
  P('delHalf', fExceptions, delPatch(fExceptions, 5, HALF));
  P('delMod', fExceptions, modPatch(fExceptions, 5, 5, '      "expires_after": "T-13",', '      "expires_after": "T-99",'));
  P('extOk', fErrors, insPatch(fErrors, lineNo(errorsTs, 'UNDO_LIMIT_REACHED'), [GREEN_SUPP_LINE]));
  P('extFrozen', fErrorsFrozen, insPatch(fErrorsFrozen, lineNo(errorsFrozenTs, 'NOTHING_TO_UNDO'), [RED_SUPP_LINE]));
  P('extRewrite', fErrors, modPatch(fErrors, lineNo(errorsTs, "'BAD_REQUEST', 400"), lineNo(errorsTs, "'BAD_REQUEST', 400"), "  ['BAD_REQUEST', 400, `请求不合法`],", "  ['BAD_REQUEST', 400, `请求不合法（改了措辞）`],"));
  P('bndOk', fBounded, multiModPatch(fBounded, [[1, 1, 'export const a = 1;', 'export const a = 11;'], [3, 3, 'export const c = 3;', 'export const c = 33;']]));
  P('bndOver', fBounded, multiModPatch(fBounded, [0, 1, 2, 3].map((k) => [k + 1, k + 1, `export const ${'abcd'[k]} = ${k + 1};`, `export const ${'abcd'[k]} = ${k + 1}0;`])));
  P('scrOk', fPkg, insPatch(fPkg, lineNo(pkgJson, '"lint"'), ['    "lint": "next lint"']));
  P('scrDep', fPkg, insPatch(fPkg, lineNo(pkgJson, '"next": "15'), ['    "next": "15.1.5"']));
  P('scrVer', fPkg, modPatch(fPkg, lineNo(pkgJson, '"version"'), lineNo(pkgJson, '"version"'), '  "version": "0.1.0",', '  "version": "0.2.0",'));
  /** 疫苗（E1c 收口轮补的洞）：紧贴 `"scripts"` 块上方插一个顶层键 —— post 行号落在块里，必须判红。 */
  P('scrAbove', fPkg, insPatch(fPkg, lineNo(pkgJson, '"scripts"'), ['  "e1cStrayKey": 1,']));
  /* 通道名写错的条目：patch 本身完全合规（整条删除到期例外），红只能来自"未知通道名"这一条 */
  P('typoOkShape', fTypo, delPatch(fTypo, 5, EXPIRED));
  /* ⑤ block-append（A-35-11）: myArr block = lines 2-6 (0-based: 1-5) of blockAppendTs */
  P('baOk', fBlockAppend, insPatch(fBlockAppend, lineNo(blockAppendTs, "'c'"), ["  'd',"]));
  P('baOutside', fBlockAppend, insPatch(fBlockAppend, lineNo(blockAppendTs, 'otherThing'), ['// stray comment']));
  P('baMod', fBlockAppend, modPatch(fBlockAppend, lineNo(blockAppendTs, "'a'"), lineNo(blockAppendTs, "'a'"), "  'a',", "  'A',"));
  P('baOver', fBlockAppend, insPatch(fBlockAppend, lineNo(blockAppendTs, "'c'"), ["  'd',", "  'e',", "  'f',", "  'g',"]));
  /**
   * 疫苗（E1c 收口轮补的洞）：紧贴块**上方**插一行 —— patch 给的是 post 行号 2，
   * 直接拿去比 pre 区间 1-5 会算成块内（实测改前判"无越界"）。换算回改动前坐标后必须红。
   */
  P('baAboveBlock', fBlockAppend, insPatch(fBlockAppend, lineNo(blockAppendTs, 'export const myArr'), ['// 块上方的新行，不在 myArr 里']));
  /**
   * ③ bounded-edit HEAD reject (A-35-1③): contaminated patch with 3 removals > cap=2
   * 多文件合并 patch（真实 `git diff` 形状，带 `diff --git` 头）：第二个文件段的 `--- a/...`
   * 头不得记成第一个文件的删除行 —— 改前实测：tables 侧纯追加被判"1 行删除/改写"= 误红。
   */
  P('bndHead', fContaminated, multiModPatch(fContaminated, [[1, 1, 'export const a = 1;', 'export const a = 11;'], [2, 2, 'export const b = 2;', 'export const b = 22;'], [3, 3, 'export const c = 3;', 'export const c = 33;']]));
  const multiFileGit = [
    `diff --git a/${fBlockAppend} b/${fBlockAppend}`,
    `--- a/${fBlockAppend}`,
    `+++ b/${fBlockAppend}`,
    `@@ -1,1 +${lineNo(blockAppendTs, "'c'")},2 @@`,
    "+  'd',",
    ` ${CTX}`,
    `diff --git a/${fPkg} b/${fPkg}`,
    `--- a/${fPkg}`,
    `+++ b/${fPkg}`,
    `@@ -1,1 +${lineNo(pkgJson, '"lint"')},2 @@`,
    '+    "lint": "next lint"',
    ` ${CTX}`,
  ].join('\n');
  P('multiFile', null, multiFileGit);
  /**
   * F-45（A-84 #306 / A-90 #347，E4c-i 修）：同一颗 patch 去掉两行 `diff --git` 头 =
   * 纯 `diff -u` 拼接形状。旧 `parsePatch` 只以 `diff --git` 复位游标 ⇒ 后一段的
   * `--- a/…` 记成前一颗文件的删除行（block.ts 从 +1/-0 变 +1/-1，`block-append`
   * 的"0 既有行变更"硬条件被误红）。修后两种形状**逐颗计数恒等**。
   */
  P('multiFilePlain', null, multiFileGit.split('\n').filter((l) => !/^diff --git /.test(l)).join('\n'));
  /** 同一文件拆成两个 `+++` 头重复拼接：幅度必须累加（8 行），不得只数最后一个头（4 行 = 假绿）。 */
  P('bndSplitHeaders', null, [
    `diff --git a/${fBounded} b/${fBounded}`,
    multiModPatch(fBounded, [[1, 1, 'export const a = 1;', 'export const a = 11;'], [2, 2, 'export const b = 2;', 'export const b = 22;']]).trim(),
    `diff --git a/${fBounded} b/${fBounded}`,
    multiModPatch(fBounded, [[3, 3, 'export const c = 3;', 'export const c = 33;'], [4, 4, 'export const d = 4;', 'export const d = 44;']]).trim(),
  ].join('\n'));
  /**
   * ⑦ baseline-regenerate:<裁决号>（A-36 四-1 的 E3′ 一次性再生，F2 登记）。
   * 合法再生的形状 = scoped patch 里**只有**登记的生成物，且那一行确实被生成器改写过（+1/-1）。
   * 红向四件 + 拒判一件：别的任务号 / 无 patch 只点名 / 碰 spec 本体 / 混入清单外文件（HEAD diff 形状）/
   * 0 行变更的空授权 / outputs 没自报。
   */
  const brRegen = modPatch(fBaseline, 5, 5, '    "profile.get"', '    "profile.get",');
  P('brOk', fBaseline, brRegen);
  P('brSpec', fShapeSpec, modPatch(fShapeSpec, 2, 2, "it('shape', () => {});", "it('shape', () => { /* 人手改了测试 */ });"));
  P('brStray', null, [
    `diff --git a/${fBaseline} b/${fBaseline}`,
    brRegen.trim(),
    `diff --git a/${fPkg} b/${fPkg}`,
    modPatch(fPkg, lineNo(pkgJson, '"react"'), lineNo(pkgJson, '"react"'), '    "react": "19.2.8",', '    "react": "9.9.9",').trim(),
  ].join('\n'));
  P('brEmpty', fBaseline, `--- a/${fBaseline}\n+++ b/${fBaseline}\n@@ -1,2 +1,2 @@\n ${CTX}\n`);
  P('brNoOutputs', fOtherBaseline, modPatch(fOtherBaseline, 5, 5, '    "profile.get"', '    "profile.get",'));
  /* F-41 并列条目：一颗 2 行 patch（+1/-1），帽子在"后写者"那条上 */
  P('tieOk', fTied, modPatch(fTied, 1, 1, 'export const a = 1;', 'export const a = 11;'));
  P('tieConflict', fTiedConflict, modPatch(fTiedConflict, 1, 1, 'export const a = 1;', 'export const a = 11;'));
  /* A-40 #50b：同一颗文件上的合规 4 行 / 越界 8 行两种 patch（走动作通道，不走 zeroDiffFor） */
  P('orderOk', fOrder, multiModPatch(fOrder, [[1, 1, 'export const a = 1;', 'export const a = 11;'], [3, 3, 'export const c = 3;', 'export const c = 33;']]));
  P('orderOver', fOrder, multiModPatch(fOrder, [0, 1, 2, 3].map((k) => [k + 1, k + 1, `export const ${'abcd'[k]} = ${k + 1};`, `export const ${'abcd'[k]} = ${k + 1}0;`])));

  const run = (task, patchName, files = []) => {
    const ctx = { cursor: task, scopeRoot: root, exceptions: { active: [], expired: [], malformed: [] } };
    try {
      return { res: checkOwnership({ task, files, patchFile: patchName ? patches[patchName] : null, ownershipFile: tableFile }, ctx) };
    } catch (e) {
      return { threw: e.message };
    }
  };
  const okCase = (label, task, patchName, via, files = []) => {
    const { res, threw } = run(task, patchName, files);
    out.push({
      ok: !threw && res.violations.length === 0 && res.notes.some((n) => n.includes(`通道 ${via}`)),
      label,
      detail: threw ? `抛错：${threw}` : `${res.violations.length ? `红：${res.violations.join(' | ')}` : '放行'} ／ ${res.notes.join(' | ') || '（无 NOTE：放行不是来自动作通道）'}`,
    });
  };
  const redCase = (label, task, patchName, mustMention, files = []) => {
    const { res, threw } = run(task, patchName, files);
    const v = threw ? `抛错：${threw}` : res.violations.join(' | ');
    out.push({
      ok: !threw && res.violations.length > 0 && v.includes(mustMention),
      label,
      detail: v || '放行（＝这条通道是不咬人的空壳）',
    });
  };
  /** 拒判用例：rejections 非空（exit 2）且 violations 空 —— 证据形状不符，不是越界。 */
  const rejectCase = (label, task, patchName, mustMention, files = []) => {
    const { res, threw } = run(task, patchName, files);
    const r = threw ? `抛错：${threw}` : (res.rejections || []).join(' | ');
    out.push({
      ok: !threw && (res.rejections || []).length > 0 && r.includes(mustMention) && res.violations.length === 0,
      label,
      detail: r || `未拒判（violations=${res?.violations.length ?? '?'}）＝证据形状错误没被发现`,
    });
  };

  /* ① delete-expired-entry（A-28-3） */
  okCase('通道① delete-expired-entry：整条删除 expires_after=当前任务的例外 → 放行', 'T-13', 'delOk', 'delete-expired-entry');
  redCase('通道① 疫苗：删掉 expires_after=T-20 的未到期条目 → 红', 'T-13', 'delNotYet', '未到期条目');
  redCase('通道① 疫苗：只删条目里的两行字段（拼不回完整条目）→ 红', 'T-13', 'delHalf', '拼不回完整条目');
  redCase('通道① 疫苗：改字段（既有删除又有新增）→ 红', 'T-13', 'delMod', '只许"删"');
  redCase('通道① 疫苗：只在 --files 里点名 exceptions.json、无 patch → 红（要证据）', 'T-13', null, '要证据', [fExceptions]);
  /* ② extend-supplement（A-30-8） */
  okCase('通道② extend-supplement：往 TM_ERRORS_SUPPLEMENT 纯追加 → 放行', 'T-02', 'extOk', 'extend-supplement');
  redCase('通道② 疫苗：追加落进 §4.6 冻结符号 TM_ERRORS 内 → 红', 'T-02', 'extFrozen', '冻结符号');
  redCase('通道② 疫苗：改写 §4.6 已有行（≠0 既有行变更）→ 红', 'T-02', 'extRewrite', '0 既有行变更');
  redCase('通道② 疫苗：只在清单里点名 errors.ts、无 patch → 红（要证据）', 'T-02', null, '要证据', [fErrors]);
  /* ③ bounded-edit:<裁决号>（A-30-10） */
  okCase('通道③ bounded-edit:A-30-10：实际 diff 4 行 = 授权幅度 4 行 → 放行', 'T-02', 'bndOk', 'bounded-edit:A-30-10');
  redCase('通道③ 疫苗：授权 4 行、实际 diff 8 行 → 红（按 diff 判，不按清单）', 'T-02', 'bndOver', '允许 ≤4 行');
  redCase('通道③ 疫苗：未给该任务登记 maxDiffLinesFor → 红（无上限授权拒绝判定）', 'T-07', 'bndOk', '无上限授权');
  redCase('通道③ 疫苗：只在清单里点名、无 patch → 红（要证据）', 'T-02', null, '要证据', [fBounded]);
  /* ④ add-script-lines-only:<裁决号>（A-34-3 预留） */
  okCase('通道④ add-script-lines-only:A-34-3：只在 scripts 块内新增 1 行 → 放行', 'T-02', 'scrOk', 'add-script-lines-only:A-34-3');
  redCase('通道④ 疫苗：新增行落在 dependencies 块内 → 红', 'T-02', 'scrDep', '不在 scripts 块内');
  redCase('通道④ 疫苗：改写 version 行 → 红', 'T-02', 'scrVer', '只许纯新增脚本行');
  redCase('通道④ 疫苗：只在清单里点名 apps/web/package.json、无 patch → 红（要证据）', 'T-02', null, '要证据', [fPkg]);
  redCase('通道④ 疫苗：紧贴 "scripts" 块上方插顶层键 → 红（块内判定换算回改动前坐标，E1c 补的洞）', 'T-02', 'scrAbove', '不在 scripts 块内');
  /* ⑤ 通道名写错 */
  redCase('未知通道名（delete-expired-entryy）→ 红，写错通道名不构成授权（patch 本身合规）', 'T-13', 'typoOkShape', '未知动作通道');
  /* ⑥ block-append:<裁决号>（A-35-11，T-25 批次4 开工硬前置） */
  okCase('通道⑥ block-append:A-35-11：myArr 块内纯追加 1 行 → 放行', 'T-02', 'baOk', 'block-append:A-35-11');
  redCase('通道⑥ 疫苗：追加落在 myArr 块外（otherThing 行）→ 红', 'T-02', 'baOutside', '不在声明块内');
  redCase('通道⑥ 疫苗：改写既有行（非纯追加）→ 红', 'T-02', 'baMod', '0 既有行变更');
  redCase('通道⑥ 疫苗：块内追加 4 行超出 maxAppendLines=3 → 红', 'T-02', 'baOver', '≤3 行块内追加');
  rejectCase('通道⑥ 疫苗：未给该任务声明 blockAppendFor → 拒判 exit 2（缺自报封顶，A-35-11）', 'T-88', 'baOk', '缺自报封顶');
  redCase('通道⑥ 疫苗：只在清单里点名 block.ts、无 patch → 红（要证据）', 'T-02', null, '要证据', [fBlockAppend]);
  redCase('通道⑥ 疫苗：紧贴块上方插一行（post 行号落在块区间内）→ 红，块内判定必须换算回改动前坐标', 'T-02', 'baAboveBlock', '不在声明块内');
  /* ⑦ baseline-regenerate:<裁决号>（A-36 四-1：E3′ 的唯一一次性基线再生，F2 登记） */
  okCase('通道⑦ baseline-regenerate:A-36-E3：E3 + 只含登记产物的 scoped patch → 放行', 'E3', 'brOk', 'baseline-regenerate:A-36-E3');
  redCase('通道⑦ 疫苗：未给该任务登记 baselineRegenerateFor（T-11 拿同一份合格再生 patch）→ 红', 'T-11', 'brOk', '未登记的再生授权');
  redCase('通道⑦ 疫苗：只在清单里点名生成物、无 patch → 红（要证据，不收"只点名就算过"）', 'E3', null, '要证据', [fBaseline]);
  redCase('通道⑦ 疫苗：改 spec 本体（产物清单之外）→ 红', 'E3', 'brSpec', '不在登记的产物清单内');
  redCase('通道⑦ 疫苗：patch 混入清单外文件（HEAD 相对 diff 形状）→ 红（不收 HEAD diff）', 'E3', 'brStray', '产物清单之外的文件');
  redCase('通道⑦ 疫苗：生成物在 patch 里 0 行变更 → 红（空授权，A-33-4）', 'E3', 'brEmpty', '空授权');
  rejectCase('通道⑦ 疫苗：outputs 未自报 → 拒判 exit 2（缺自报产物清单，宁可红不放行）', 'E3', 'brNoOutputs', '缺自报产物清单');
  /* patch 解析的归属正确性（E1c 收口轮）：多文件合并 + 同路径重复文件头 */
  {
    const { res, threw } = run('T-02', 'multiFile');
    out.push({
      ok: !threw && res.violations.length === 0
        && res.notes.some((n) => n.includes(`通道 block-append:A-35-11`) && n.includes(fBlockAppend))
        && res.notes.some((n) => n.includes(`通道 add-script-lines-only:A-34-3`) && n.includes(fPkg)),
      label: 'patch 解析：两个文件的纯追加合并成一份真实 `git diff` 形状 → 各自放行（后一个文件段的 `---` 头不得记成前一个文件的删除行）',
      detail: threw ? `抛错：${threw}` : (res.violations.length ? `红：${res.violations.join(' | ')}` : '两条通道各放行 1 个文件') + ` ／ ${res.notes.join(' | ') || '（无 NOTE）'}`,
    });
  }
  redCase('patch 解析：同一文件拆成两个 `+++` 头重复拼接 → 幅度累加 8 行 > 4 判红（不得只数最后一个头 = 假绿）', 'T-02', 'bndSplitHeaders', '允许 ≤4 行');
  /* ③ 扩展：bounded-edit HEAD diff 污染拒判（A-35-1③ / T-11-fix3 §4.3） */
  rejectCase('通道③ 疫苗：HEAD 相对 diff 含 3 行删除 > cap=2 → 拒判 exit 2（不收 HEAD diff）', 'T-02', 'bndHead', '疑似 HEAD 相对 diff');

  /**
   * ── E4c-i 四件（A-93）：F-41 并集 / F-43 标签同源 / F-45 形状等价 / F-52 零消费 ──
   * 每件都带"红绿两侧"，反"永真"：把修返还原样时该用例必须转红（下面每条 detail 里写清回落点）。
   */
  const rawCase = (label, ok, detail) => out.push({ ok, label, detail });
  {
    const { res, threw } = run('T-05', 'tieOk', [fTied]);
    rawCase('F-41 正证：同路径并列两条，帽子在后写者那条上 → 取并集后 T-05 放行（旧 entries[0] 读不到 = "无上限授权"红）',
      !threw && res.violations.length === 0 && res.notes.some((n) => n.includes('同档并列 2 条')),
      threw ? `抛错：${threw}` : `红=${res.violations.join(' | ') || '无'} ／ ${res.notes.join(' | ') || '（无 NOTE）'}`);
  }
  rejectCase('F-41 反证：同一任务号在并列两条里声明了不同幅度 → 拒判 exit 2（⛔ 不许静默取大 = 靠"再建一条"扩额度）',
    'T-02', 'tieConflict', '账面矛盾', [fTiedConflict]);
  {
    const { res, threw } = run('T-02', 'baOk', [fBlockAppend, fBounded]);
    rawCase('F-52 正证：清单点名 + 给了 patch 但该文件不在里面 = 诚实申报零消费 → 放行并 NOTE（旧写法判 exit 1，与它自己的文案矛盾）',
      !threw && res.violations.length === 0 && res.notes.some((n) => n.includes('bounded-edit:A-30-10') && n.includes('零消费')),
      threw ? `抛错：${threw}` : `红=${res.violations.join(' | ') || '无'} ／ ${res.notes.join(' | ') || '（无 NOTE）'}`);
    const g = run('T-02', 'multiFile');
    const p = run('T-02', 'multiFilePlain');
    rawCase('F-45 正证：同一颗多文件 patch 带 / 不带 `diff --git` 头两种形状 → 判定逐颗相同（旧写法纯拼接形状先写那颗多吃 1 行删除）',
      !g.threw && !p.threw && g.res.violations.length === 0 && p.res.violations.length === 0
        && g.res.notes.length === p.res.notes.length,
      `git 形状红=${g.res?.violations.join(' | ') || '无'} ／ plain 形状红=${p.res?.violations.join(' | ') || '无'}`);
    const cnt = (txt) => [...parsePatch(txt).values()].map((f) => `${f.file}:+${f.added.length}/-${f.removed.length}`).sort().join(' ');
    const plain = multiFileGit.split('\n').filter((l) => !/^diff --git /.test(l)).join('\n');
    const gitC = cnt(multiFileGit);
    const plainC = cnt(plain);
    const blank = parsePatch(`--- a/${fBounded}\n+++ b/${fBounded}\n@@ -1,0 +2,1 @@\n+\n ${CTX}\n`).get(fBounded);
    rawCase('F-45 计数直判（parsePatch 级）：两形状逐颗 added/removed 恒等，且先写那颗删除侧必须为 0；裸 `+`（新增空行）计 1 行新增（A-92 #360：这条同时把"闸门虚高"与"agent 漏计空行"分开钉）',
      gitC === plainC && /\+1\/-0/.test(gitC) && !/-[1-9]/.test(gitC) && blank.added.length === 1 && blank.removed.length === 0 && blank.added[0].text === '',
      `git=[${gitC}] plain=[${plainC}] 裸+=[+${blank?.added.length}/-${blank?.removed.length} 文本"${blank?.added[0]?.text ?? '?'}"]`);
    const bndNote = run('T-02', 'bndOk').res?.notes?.join(' | ') || '';
    const brNote = run('E3', 'brOk').res?.notes?.join(' | ') || '';
    rawCase('F-43 正证：NOTE 把"真被消费的那颗键"逐字写出来（通道名是旧裁决号，额度/清单按本轮任务号取）',
      bndNote.includes('实际授权来源 = maxDiffLinesFor["T-02"]') && bndNote.includes('bounded-edit:A-30-10')
        && brNote.includes('实际授权来源 = baselineRegenerateFor["E3"].outputs'),
      `bounded-edit NOTE=${bndNote} ／ 再生 NOTE=${brNote}`);
    /**
     * A-40 #50b 的**钉子**（判定顺序）：同一条目上 `actions` 与 `zeroDiffFor` 都点名 T-02。
     * 顺序正确 = 走动作通道（合规 4 行放行 / 越界 8 行按"允许 ≤4 行"红）；
     * 顺序反了（zeroDiffFor 在前）= 那 4 行会被"§10.4 明示 T-02 对该文件零 diff"判红，
     * 且越界那半也会错报成零 diff —— 红绿两侧都必须避开这句文案。
     */
    {
      const g = run('T-02', 'orderOk', [fOrder]);
      const r = run('T-02', 'orderOver', [fOrder]);
      const gv = g.threw ? `抛错：${g.threw}` : g.res.violations.join(' | ');
      const rv = r.threw ? `抛错：${r.threw}` : r.res.violations.join(' | ');
      rawCase('A-40 #50b 钉子：条目上 actions 与 zeroDiffFor 同名 T-02 ⇒ 判定必须先读 actions（放行走通道、越界报幅度，两侧都不得冒"零 diff"文案）',
        !g.threw && g.res.violations.length === 0
          && g.res.notes.some((n) => n.includes('bounded-edit:A-40-50b'))
          && !r.threw && r.res.violations.length === 1 && rv.includes('允许 ≤4 行') && !/零 diff/.test(rv),
        `绿侧红=${gv || '无'} ／ 越界侧红=${rv}`);
    }
  }

  fs.rmSync(path.dirname(root), { recursive: true, force: true });
  return out;
};

/**
 * A-24-1「漏一处就是新的幻影」的机检：MODES 的键、ACCEPTED_FLAGS 的开关，
 * 必须逐个出现在 HELP 里；反过来 HELP 里写到的 `--xxx` 也必须真存在。
 * 这条用例是 --web/--dist/--ownership-file 这类"注册了但没人能查到"的幻影的反制。
 */
const helpSurfaceParity = () => {
  const known = new Set([...Object.keys(MODES), ...ACCEPTED_FLAGS]);
  const missing = [...Object.keys(MODES), ...ACCEPTED_FLAGS].filter((f) => !HELP.includes(f));
  /** HELP 里"定义位"= 行首两个空格紧跟 --xxx 的那些行（续行/举例句不参与，避免把正文里的词当注册项）。 */
  const documented = [...new Set(HELP.split('\n')
    .map((l) => /^ {2}(--[a-z][a-z0-9-]*)/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]))];
  const ghosts = documented.filter((f) => !known.has(f));
  return {
    ok: missing.length === 0 && ghosts.length === 0,
    detail: `MODES ${Object.keys(MODES).length} 键 + ACCEPTED_FLAGS ${ACCEPTED_FLAGS.length} 开关 ⇄ HELP ${documented.length} 个定义位双向对齐（未写进 HELP ${missing.length} / HELP 里的幻影 ${ghosts.length}）${missing.length ? `：${missing.join(',')}` : ''}${ghosts.length ? `：${ghosts.join(',')}` : ''}`,
  };
};

/**
 * A-28-2 的反回归锁（E1a 补）。裁决原话："自测试探针永远不得依赖仓库里某个缺陷还留着
 * —— 那等于奖励不修缺陷"。E1 那轮把两条探针换成了 fixture 台账，但**换完就没人看守了**：
 * 谁把它们改回读 `tools/exceptions.json` 里活着的那条 `review-no-agent` 例外，`--self-test`
 * 当下仍是绿的，要到下次有人合法修掉缺陷时才又假红一次 —— 这正是本轮开工时的现场。
 * 判据两半：①**引用面**——两条探针的源码体里只准出现用例自持台账 A19_LEDGER，出现"单参数的
 * loadExceptions()"（= 读仓库默认台账）即判越界；②**结果面（蕴含式）**——仓库台账里 depcruise
 * 条目 = 0（T-10 整改并删例外后的盘面）时，A-19 疫苗与过期例外探针必须仍全绿。
 * 用蕴含式而不是合取：将来有人合法登记一条新的 depcruise 例外时，这条不该被误伤。
 */
const probeIndependenceFromLiveDefects = (a19, strict) => {
  const src = fs.readFileSync(path.join(HERE, 'boundaries.mjs'), 'utf8');
  /** 取一个模块级箭头函数的源码体（从声明行到下一个行首 `};`）。 */
  const bodyOf = (name) => {
    const i = src.indexOf(`const ${name} = `);
    if (i === -1) return null;
    const j = src.indexOf('\n};', i);
    return src.slice(i, j === -1 ? src.length : j);
  };
  const offenders = ['a19Vaccine', 'exceptionsStrictSample']
    .map((n) => ({ n, b: bodyOf(n) }))
    .filter(({ b }) => b && (!/A19_LEDGER/.test(b) || /loadExceptions\((?![^)]*,)/.test(b)))
    .map(({ n }) => n);
  const live = (loadExceptions('T-01').all || []).filter((e) => e && e.engine === 'depcruise');
  const a19Green = a19.cases.filter((c) => c.ok).length;
  /** 蕴含式而非合取：仓库台账一旦又有 depcruise 条目（合法登记的新例外），这条不该被误伤成红。 */
  const implicationHolds = live.length > 0 || (a19Green === a19.cases.length && strict.ok);
  return {
    ok: offenders.length === 0 && implicationHolds,
    detail:
      `两条探针的源码体均只引用用例自持台账 A19_LEDGER（越界引用仓库台账的探针：${offenders.join(',') || '无'}）；` +
      `仓库 tools/exceptions.json 现有 depcruise 条目 ${live.length} 条` +
      `${live.length === 0 ? `（＝T-10 已合法修掉 review-no-agent 并同 commit 删了例外）—— 在此前提下 A-19 疫苗 ${a19Green}/${a19.cases.length} 绿、过期例外探针 ${strict.ok ? '绿' : '红'}` : '（前提不适用，只查引用面）'}`,
  };
};

/**
 * E4a 件 3：归属判定器的钉死用例 —— 全部用 os.tmpdir() 下的**临时夹具表**跑真 checkOwnership，
 * 不碰仓库 tools/ownership.json、不碰任何产品代码、结束即删。钉住四件事：
 *  ① 具体条目赢过 `**` 兜底/花括号枚举，且结果与条目书写顺序无关（并用旧比较器复算，证明改前是错的）；
 *  ② 无条目文件报 no-entry 且**不阻断**（0 违规）；
 *  ③ per_file 的真实语义 = 「精确路径字典」：owner 按 rel 逐文件查字典，逗号列表与文件**没有**
 *     按序映射关系；逗号列表只是「glob 命中但不在字典里」的文件的兜底 owner 集合（任一即过）；
 *  ④ 疫苗：owner 写成未登记任务号 / '*' ⇒ 必须拒判（rejections 非空，出口码 2），仓库真表必须 0 账面错。
 */
const ownershipE4aCases = () => {
  const out = [];
  const pushC = (ok, label, detail) => out.push({ ok, label, detail });
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-e4a-own-')), 'r');
  const TASKS = { 'T-01': { batch: 1, title: '沙盒' }, 'T-02': { batch: 1, title: '沙盒' }, 'T-03': { batch: 1, title: '沙盒' } };
  const E = (p, owner, extra = {}) => ({ path: p, owner, readers: [], reason: '沙盒夹具（E4a）', handoff: false, ...extra });
  const writeTable = (name, ownership) => {
    const p = path.join(root, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ tasks: TASKS, ownership }));
    return p;
  };
  const runOn = (tablePath, task, files) => checkOwnership(
    { task, files: files.slice(), patchFile: null, ownershipFile: tablePath },
    { cursor: task, scopeRoot: root, exceptions: { active: [], expired: [], malformed: [] }, fixtures: true },
  );
  /** 旧比较器（改前形态：按模式串字符数降序、并列吃数组原序）—— 只用于"改前错"的对照复算。 */
  const oldWinner = (rel, ownership) => {
    const hits = ownership.filter((e) => ownershipEntryHits(rel, e));
    return (hits.sort((a, b) => b.path.length - a.path.length)[0] || {}).path || null;
  };
  const win = (rel, table) => (matchOwnership(rel, table)[0] || {}).path || null;

  /* ①a 具体度翻转实验：花括号枚举条目模式串更长，旧比较器让它压住精确条目（改前错），新比较器精确赢（改后对） */
  const specOrderA = [E('pkg/deep/**', 'T-02'), E('pkg/deep/{a.ts,z.ts}', 'T-03'), E('pkg/deep/a.ts', 'T-01')];
  const specOrderB = [E('pkg/deep/a.ts', 'T-01'), E('pkg/deep/{a.ts,z.ts}', 'T-03'), E('pkg/deep/**', 'T-02')];
  const tA = writeTable('spec-a.json', specOrderA);
  const tB = writeTable('spec-b.json', specOrderB);
  const oldPick = oldWinner('pkg/deep/a.ts', specOrderA);
  const newPickA = win('pkg/deep/a.ts', { ownership: specOrderA });
  const newPickB = win('pkg/deep/a.ts', { ownership: specOrderB });
  pushC(oldPick === 'pkg/deep/{a.ts,z.ts}', 'E4a①a 改前对照：旧比较器让更长的花括号条目压住精确条目（缺陷可复现）', `旧=${oldPick}（owner 会取 ${E('x', 'T-03').owner}）`);
  pushC(newPickA === 'pkg/deep/a.ts' && newPickB === 'pkg/deep/a.ts', 'E4a①a 改后：精确条目赢过枚举/兜底，且与书写顺序无关', `顺序A=${newPickA} 顺序B=${newPickB}`);
  const g1 = runOn(tA, 'T-01', ['pkg/deep/a.ts']);
  const g2 = runOn(tB, 'T-01', ['pkg/deep/a.ts']);
  const r1 = runOn(tA, 'T-03', ['pkg/deep/a.ts']);
  const r2 = runOn(tB, 'T-03', ['pkg/deep/a.ts']);
  pushC(
    g1.violations.length === 0 && g2.violations.length === 0 && r1.violations.length === 1 && r2.violations.length === 1,
    'E4a①a 活体判定：owner=T-01 两种书写顺序都放行、T-03（只在枚举条目里）两种顺序都判越界',
    `T-01:${g1.violations.length}/${g2.violations.length} 红，T-03:${r1.violations.length}/${r2.violations.length} 红`,
  );

  /* ①b 同长度并列（'aa/b.ts' 与 'aa/*.ts' 都是 7 字符）：旧比较器吃 JSON 书写顺序（改前顺序敏感），新比较器恒精确优先（改后稳定） */
  const tieOrderA = [E('aa/b.ts', 'T-01'), E('aa/*.ts', 'T-02')];
  const tieOrderB = [E('aa/*.ts', 'T-02'), E('aa/b.ts', 'T-01')];
  const oldTieA = oldWinner('aa/b.ts', tieOrderA.slice());
  const oldTieB = oldWinner('aa/b.ts', tieOrderB.slice());
  pushC(oldTieA === 'aa/b.ts' && oldTieB === 'aa/*.ts', 'E4a①b 改前对照：等长并列时旧比较器的胜者随书写顺序翻转（缺陷可复现）', `旧 顺序A=${oldTieA} 顺序B=${oldTieB}`);
  const tT1 = writeTable('tie-a.json', tieOrderA);
  const tT2 = writeTable('tie-b.json', tieOrderB);
  const tie1 = runOn(tT1, 'T-01', ['aa/b.ts']);
  const tie2 = runOn(tT2, 'T-01', ['aa/b.ts']);
  const tie3 = runOn(tT1, 'T-02', ['aa/b.ts']);
  const tie4 = runOn(tT2, 'T-02', ['aa/b.ts']);
  pushC(
    tie1.violations.length === 0 && tie2.violations.length === 0 && tie3.violations.length === 1 && tie4.violations.length === 1,
    'E4a①b 改后：精确条目恒赢同长 glob，两种顺序判定恒等',
    `T-01:${tie1.violations.length}/${tie2.violations.length} 红，T-02:${tie3.violations.length}/${tie4.violations.length} 红`,
  );

  /* ② 无条目 → no-entry 且只登记不阻断 */
  const tNo = writeTable('no-entry.json', [E('pkg/**', 'T-01')]);
  const noEnt = runOn(tNo, 'T-01', ['lonely/other.ts']);
  pushC(
    noEnt.violations.length === 0 && noEnt.notes.some((n) => n.includes('no-entry')),
    'E4a② 无条目文件报 no-entry 且不阻断（0 违规）',
    `${noEnt.notes.find((n) => n.includes('no-entry')) || '(没报 no-entry)'} violations=${noEnt.violations.length}`,
  );

  /* ③ per_file 语义钉死：字典按精确路径查；逗号列表不是按序映射、是兜底集合 */
  const pf = [E('lib/**', 'T-01,T-02', { per_file: { 'lib/a.ts': 'T-02' } })];
  const tPf = writeTable('per-file.json', pf);
  const pfT1 = runOn(tPf, 'T-01', ['lib/a.ts']);
  const pfT2 = runOn(tPf, 'T-02', ['lib/a.ts']);
  const pfFallback1 = runOn(tPf, 'T-01', ['lib/b.ts']);
  const pfFallback2 = runOn(tPf, 'T-02', ['lib/b.ts']);
  const pfOut = runOn(tPf, 'T-03', ['other/x.ts']);
  pushC(
    pfT1.violations.length === 1 && pfT2.violations.length === 0 && pfFallback1.violations.length === 0 && pfFallback2.violations.length === 0 && pfOut.violations.length === 0 && pfOut.notes.some((n) => n.includes('no-entry')),
    'E4a③ per_file=精确路径字典：字典内逐文件查值（逗号第 1 位不映射到第 1 个文件）、字典外吃逗号兜底集合、字典外路径不受本条目管辖',
    `lib/a.ts: T-01 红=${pfT1.violations.length === 1} T-02 绿=${pfT2.violations.length === 0}；lib/b.ts(兜底): T-01/T-02 都过=${pfFallback1.violations.length === 0 && pfFallback2.violations.length === 0}`,
  );

  /* ④ 疫苗：未登记任务号 owner / '*' owner 必须拒判 */
  const tBad = writeTable('bad-owner.json', [E('pkg/deep/a.ts', 'T-404')]);
  const bad = runOn(tBad, 'T-404', ['pkg/deep/a.ts']);
  pushC(
    bad.tableErrors.length === 1 && bad.rejections.some((r) => r.includes('T-404')),
    'E4a④ 疫苗 A：owner 写未登记任务号 T-404 → 拒判（rejections 非空，出口码 2），T-404 的假绿不存在',
    `${bad.rejections[0] || '(没拒判)'}${bad.violations.length === 0 ? ' —— 注意仅 violations=0 不算拦住，拒判才是' : ''}`,
  );
  const tStar = writeTable('star-owner.json', [E('pkg/**', '*')]);
  const star = runOn(tStar, 'T-01', ['pkg/x.ts']);
  pushC(star.tableErrors.some((t) => t.includes('*')), 'E4a④ 疫苗 B：owner 写成 "*" 蒙混 → 拒判', `${star.tableErrors[0] || '(没拒判)'}`);

  /* ⑤ 仓库真表：账面必须 0 错（owner/per_file 全在 tasks 名册内） */
  const live = checkOwnership({ task: 'T-02', files: ['tools/ownership.json'] }, { cursor: 'T-02', scopeRoot: REPO, exceptions: { active: [], expired: [], malformed: [] } });
  pushC(live.tableErrors.length === 0 && live.violations.length === 0, 'E4a⑤ 仓库 tools/ownership.json 真表：owner 名册校验 0 错、T-02 碰自己名下的表文件放行', `tableErrors=${live.tableErrors.length} ${live.tableErrors.slice(0, 2).join(' | ')}`);

  /* ⑥ 真表换书写顺序判定不变：以全部 per_file 键 + 在册精确路径为样本，正序 vs 倒序逐文件比对胜者 */
  const real = readJson(OWNERSHIP_TABLE);
  const rev = JSON.parse(JSON.stringify(real));
  rev.ownership.reverse();
  const samples = new Set();
  for (const e of real.ownership) {
    if (!/[*{]/.test(e.path) && fs.existsSync(path.join(REPO, e.path))) samples.add(e.path);
    for (const k of Object.keys(e.per_file || {})) samples.add(k);
  }
  const flips = [...samples].filter((f) => win(f, real) !== win(f, rev));
  pushC(flips.length === 0, 'E4a⑥ 真表对照实验：ownership 数组整体倒序后，全部样本文件（per_file 键 + 精确条目路径）的胜者条目一字不变', `样本 ${samples.size} 个，翻转 ${flips.length} 个${flips.length ? `：${flips.slice(0, 5).join(', ')}` : ''}`);

  try { fs.rmSync(path.dirname(root), { recursive: true, force: true }); } catch { /* 临时目录清不掉不影响判定 */ }
  return out;
};

/* ───────────────── A-101：判据口径三件的自带探针（⛔ 靠"仓库里还有红"判绿） ───────────────── */

/**
 * 剥注释器的形状表。每行给"输入 / 必须还在 / 必须已被涂白"，另无机检两条形：
 * 输出与输入**等长**、**换行数相同**（否则命中就失去可定位性，A-24-1 的四要素口径会碎）。
 */
export const STRIP_SHAPE_CASES = [
  {
    d: 'clike',
    src: "const u = 'https://x/y';\n// 云端在注释里\n/*\n块注释里没有前导星号的续行：以后再说\n*/\nexport const S = '定稿串';",
    must: ['https://x/y', "export const S = '定稿串';"],
    mustNot: ['云端', '以后再说'],
  },
  {
    d: 'clike',
    src: "export const C = '#22c55e'; // 台账 A-52 #135",
    must: ['#22c55e'],
    mustNot: ['#135'],
  },
  {
    d: 'clike',
    src: "const s = '没闭合的串 云端\nexport const K = 1;",
    must: ['没闭合的串', 'export const K = 1;'],
    mustNot: [],
  },
  { d: 'css', src: '/* 注释里的 fetch( 与 #abcdef */\n:root{ --x: red; }', must: ['--x'], mustNot: ['abcdef', 'fetch('] },
  { d: 'markup', src: '<!-- 这里写 fetch( 与 云端 -->\n<p>明天</p>', must: ['<p>'], mustNot: ['fetch(', '云端'] },
  { d: 'hash', src: '# 注释里有 passwordUpgradeDeadline\nKEY = "x"', must: ['KEY'], mustNot: ['passwordUpgradeDeadline'] },
  { d: 'sql', src: '-- 注释里写 passwordUpgradeDeadline\nSELECT 1;', must: ['SELECT'], mustNot: ['passwordUpgradeDeadline'] },
  { d: 'none', src: '{"url": "https://a/b", "note": "// 这不是注释"}', must: ['https://a/b', '// 这不是注释'], mustNot: [] },
];

/**
 * 一对夹具的"桶不许空"口径：绿必须是**噪音被正确归进未计入桶**，不是"什么都没扫到"；
 * 红必须是**真违犯进了计红桶**。min = 该桶在最噪音的那一侧至少要有几条。
 */
export const GATE_TRUTH_BUCKETS = [
  { assertion: 'copy-legacy-zero', task: 'T-02', bucket: 'commentHits', min: 2 },
  { assertion: 'deadline-key-zero', task: 'T-02', bucket: 'noteHits', min: 2 },
  { assertion: 'colors-no-hardcode', task: 'T-04', bucket: 'noteHits', min: 2 },
  { assertion: 'css-important-budget', task: 'T-04', bucket: 'noteHits', min: 2 },
  { assertion: 'dark-variant-budget', task: 'T-04', bucket: 'noteHits', min: 2 },
  { assertion: 'web-home-transport', task: 'T-12', bucket: 'commentHits', min: 2 },
];

/** 真仓库这一轮的账：改前 6 条红里，有多少命中应当只是"注释/键位/负例面"。 */
const NOISE_DIRS = { noise: 'comment-noise', real: path.join('violations', 'gate-truth-real') };

function gateTruthCases() {
  const cases = [];
  /* 1) 剥注释器：形状 + 等长 + 换行数不变 */
  for (const [i, c] of STRIP_SHAPE_CASES.entries()) {
    const out = stripComments(c.src, c.d);
    const bad = [];
    if (out.length !== c.src.length) bad.push(`长度变了 ${c.src.length}→${out.length}`);
    if (out.split('\n').length !== c.src.split('\n').length) bad.push('换行数变了（行号会漂）');
    for (const m of c.must) if (!out.includes(m)) bad.push(`该保留的没保留：${m}`);
    for (const m of c.mustNot) if (out.includes(m)) bad.push(`该涂白的还在：${m}`);
    cases.push({ ok: bad.length === 0, label: `A-101(a) 剥注释器 形状#${i + 1}（方言=${c.d}）`, detail: bad.join(' | ') });
  }
  /* 2) 台账引用排除：只许排纯十进制 `#号`，同行的真色值不许跟着被排 */
  const both = colorTokensOf("const BOTH = '口径见 A-52 #135，落地色值 #22c55e';", /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  const onlyLedger = colorTokensOf("const NOTE = '口径见 A-52 #135';", /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  const purpleRef = colorTokensOf("const P = '#8b5cf6';", /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  cases.push({
    ok: both.real.join(',') === '#22c55e' && both.ledger.join(',') === '#135',
    label: 'A-101(a) 同行混排：真色值留在计红桶、台账引用进 NOTE',
    detail: `real=[${both.real}] ledger=[${both.ledger}]`,
  });
  cases.push({
    ok: onlyLedger.real.length === 0 && onlyLedger.ledger.length === 1,
    label: 'A-101(a) 纯台账引用行不判红（但必须出现在 NOTE 里）',
    detail: `real=[${onlyLedger.real}] ledger=[${onlyLedger.ledger}]`,
  });
  cases.push({
    ok: purpleRef.real.length === 1 && purpleRef.ledger.length === 0,
    label: 'A-101(a) 带字母的十六进制永不进台账桶（排除口不许变成漏色值的缝）',
    detail: `real=[${purpleRef.real}] ledger=[${purpleRef.ledger}]`,
  });
  /* 3) dark: 的两种形状：变体计红、键位进 NOTE */
  const variantLine = `const c = 'translate-y-1 dark:translate-y-0';`;
  const keyLine = `const T = { light: 'dark', dark: 'system' };`;
  cases.push({
    ok: (variantLine.match(new RegExp(DARK_VARIANT.source, 'g')) || []).length === 1 && /\bdark:/.test(variantLine),
    label: 'A-101(b) dark: 变体识别（类名紧贴工具名 → 计一个）',
    detail: `命中 ${(variantLine.match(new RegExp(DARK_VARIANT.source, 'g')) || []).length}`,
  });
  cases.push({
    ok: (keyLine.match(new RegExp(DARK_VARIANT.source, 'g')) || []).length === 0 && /\bdark:/.test(keyLine),
    label: 'A-101(b) dark: 键位写法不算变体（对象键/标签表 → NOTE）',
    detail: `宽松扫到 ${keyLine.split('dark:').length - 1} 处、变体判 0`,
  });
  /* 4) 一对夹具的桶不许空：绿侧必须真扫到噪音，红侧必须真扫到违犯 */
  for (const b of GATE_TRUTH_BUCKETS) {
    const a = ASSERTIONS.find((x) => x.id === b.assertion);
    if (!a) {
      cases.push({ ok: false, label: `A-101 桶口径 ${b.assertion}`, detail: '注册表里没有这条断言' });
      continue;
    }
    for (const [which, dir, want] of [
      ['噪音侧', NOISE_DIRS.noise, 'green'],
      ['违犯侧', NOISE_DIRS.real, 'red'],
    ]) {
      const root = path.join(ST, dir);
      if (!fs.existsSync(root)) {
        cases.push({ ok: false, label: `A-101 桶口径 ${b.assertion} @${which}`, detail: `缺 fixture：${toRel(REPO, root)}` });
        continue;
      }
      const ctx = { cursor: b.task, scopeRoot: root, exceptions: { active: [], expired: [], malformed: [] }, curRoots: a.roots, fixtures: true };
      const res = runAssertion(a, ctx);
      const bucket = res[b.bucket] || [];
      const ok =
        res.status === want &&
        (want === 'green' ? bucket.length >= b.min : (res.hits || []).length >= 1);
      cases.push({
        ok,
        label: `A-101 ${b.bucket} 非空：${b.assertion} @${which}`,
        detail: `status=${res.status}（期望 ${want}）、${b.bucket}=${bucket.length}（噪音侧需 ≥${b.min}）、hits=${(res.hits || []).length} | ${res.detail.slice(0, 150)}`,
      });
    }
  }
  return cases;
}

const selfTest = (opts) => {
  const failures = [];
  const lines = [];
  const push = (ok, label, detail) => {
    lines.push(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
  };

  /* 1) 注册表覆盖：每条断言必须有红+绿两个用例（防"永真断言"） */
  for (const a of ASSERTIONS) {
    const red = SELFTEST_CASES.filter((c) => c.assertion === a.id && c.expect === 'red').length;
    const green = SELFTEST_CASES.filter((c) => c.assertion === a.id && c.expect === 'green').length;
    push(red >= 1 && green >= 1, `覆盖 ${a.id}`, `红用例 ${red} / 绿用例 ${green}（各需 ≥1）`);
  }
  const unknown = SELFTEST_CASES.filter((c) => !ASSERTIONS.some((a) => a.id === c.assertion));
  push(unknown.length === 0, '用例引用的断言都在注册表内', unknown.map((u) => u.assertion).join(','));

  /* 2) 逐条跑红/绿 */
  for (const c of SELFTEST_CASES) {
    const assertion = ASSERTIONS.find((a) => a.id === c.assertion);
    if (!assertion) continue;
    const dir = path.join(ST, c.dir);
    if (!fs.existsSync(dir)) {
      push(false, `${c.assertion} fixture 缺失`, toRel(REPO, dir));
      continue;
    }
    const ctx = { cursor: c.task, scopeRoot: dir, exceptions: { active: [], expired: [], malformed: [] }, fixtures: true };
    const res = runAssertion(assertion, ctx);
    const want = c.expect === 'red' ? 'red' : 'green';
    push(res.status === want, `${c.assertion} @${c.task} ${c.dir} 期望 ${want}`, `实际 ${res.status}：${res.detail}`);
  }

  /* 2b) A-101：判据口径三件（剥注释 / 样式形状 / 负例面）的自带探针与桶非空证明 */
  let gt = [];
  try {
    gt = gateTruthCases();
  } catch (e) {
    gt = [{ ok: false, label: 'A-101 探针跑不起来（夹具或注册表缺件）', detail: e && e.message }];
  }
  for (const c of gt) push(c.ok, c.label, c.detail);

  /* 3) 归属校验：越界必须红、合规必须绿 */  const ownCtx = { cursor: 'T-02', scopeRoot: REPO, exceptions: { active: [], expired: [], malformed: [] } };
  const bad = checkOwnership({ task: 'T-02', files: ['packages/shared/src/schema/tables.ts', 'apps/web/src/app/globals.css', 'eslint.config.js'] , patchFile: null }, ownCtx);
  push(bad.violations.length === 3, '--check-ownership 抓到 3 处越界（T-06 schema / T-04 globals.css / T-01 eslint）', bad.violations.join(' | ').slice(0, 160));
  const good = checkOwnership({ task: 'T-02', files: ['tools/boundaries.mjs', '.dependency-cruiser.cjs', 'tools/ownership.json'] }, ownCtx);
  push(good.violations.length === 0, '--check-ownership 放行 T-02 自己的文件', good.violations.join(' | '));
  const noEntry = checkOwnership({ task: 'T-02', files: ['packages/server/src/unowned-legacy.ts'] }, ownCtx);
  push(noEntry.violations.length === 1, 'routes/services 内的无主文件也判越界（owner 表按目录登记）', noEntry.violations.join(''));

  /* 3b) E4a：具体度比较器 / 书写顺序无关性 / per_file 语义 / no-entry 不阻断 / owner 名册疫苗
   *     （用例输入全部是 os.tmpdir() 里的临时夹具表，不碰真 ownership.json 与任何产品代码） */
  let e4a = [];
  try {
    e4a = ownershipE4aCases();
  } catch (e) {
    e4a = [{ ok: false, label: 'E4a 比较器/名册用例跑不起来（沙盒构造失败）', detail: e.message }];
  }
  for (const c of e4a) push(c.ok, c.label, c.detail);

  /* 4) 改动幅度：只改 import 行放行，多改一行即红 */
  const patchOk = path.join(ST, 'ownership', 't04-import-only.patch');
  const patchBad = path.join(ST, 'ownership', 't04-beyond-import.patch');
  const scopeWithFixture = { ...ownCtx, scopeRoot: path.join(ST, 'ownership', 'tree') };
  const r1 = checkOwnership({ task: 'T-04', files: [], patchFile: patchOk }, scopeWithFixture);
  push(
    r1.violations.length === 0 && r1.patchFilesParsed === 1 && r1.matched.length === 1,
    'T-04 只改 import 行 → 放行（且 patch 确实被解析并落到归属条目上）',
    `patchFiles=${r1.patchFilesParsed} matched=${r1.matched.join(',')} ${r1.violations.join(' | ')}${r1.notes.join(' | ')}`,
  );
  const r2 = checkOwnership({ task: 'T-04', files: [], patchFile: patchBad }, scopeWithFixture);
  push(r2.violations.length > 0 && r2.patchFilesParsed === 1, 'T-04 改了非 import 行 → 红', r2.violations.join(' | '));
  const r3 = checkOwnership({ task: 'T-16', files: [], patchFile: path.join(ST, 'ownership', 't16-too-many-lines.patch') }, scopeWithFixture);
  push(r3.violations.length > 0 && r3.patchFilesParsed === 1, 'T-16 对根 layout 超 4 行 → 红', r3.violations.join(' | '));
  const r5 = checkOwnership({ task: 'T-16', files: [], patchFile: path.join(ST, 'ownership', 't16-within-budget.patch') }, scopeWithFixture);
  push(r5.violations.length === 0 && r5.patchFilesParsed === 1, 'T-16 对根 layout 改 4 行以内 → 放行（证明上一条不是永真）', r5.violations.join(' | '));
  const r4 = checkOwnership({ task: 'T-15', files: ['apps/web/src/app/(user)/layout.tsx'] }, scopeWithFixture);
  push(r4.violations.length > 0, 'T-15 碰 (user)/layout.tsx → 红（§10.4 第 3 行零 diff）', r4.violations.join(' | '));
  const r6 = checkOwnership({ task: 'T-05', files: ['packages/ui/src/index.ts'] }, scopeWithFixture);
  push(r6.violations.length > 0, 'T-05 碰 packages/ui/src/index.ts → 红（§10.4 第 4 行零 diff）', r6.violations.join(' | '));
  const r7 = checkOwnership({ task: 'T-12', files: ['apps/web/package.json'], patchFile: path.join(ST, 'ownership', 't12-add-dep.patch') }, scopeWithFixture);
  push(r7.violations.length === 0 && r7.patchFilesParsed === 1, 'A-4：T-12 对 apps/web/package.json 只加依赖行 → 放行', r7.violations.join(' | ') + r7.notes.join(' | '));
  const r8 = checkOwnership({ task: 'T-12', files: ['apps/web/package.json'], patchFile: path.join(ST, 'ownership', 't12-edit-dep-version.patch') }, scopeWithFixture);
  push(r8.violations.length > 0, 'A-4：T-12 改写 apps/web/package.json 既有依赖版本 → 红', r8.violations.join(' | '));

  /* 4b) A-33-4：§10.4 四条动作通道各带红/绿用例对（用例自持沙盒，不吃 E1b 的 ownership.json） */
  let chCases = [];
  try {
    chCases = ownershipActionChannels();
  } catch (e) {
    chCases = [{ ok: false, label: 'A-33-4 通道用例跑不起来（沙盒构造失败）', detail: e.message }];
  }
  for (const c of chCases) push(c.ok, `A-33-4 ${c.label}`, c.detail);
  const hsp = helpSurfaceParity();
  push(hsp.ok, 'A-24-1 反幻影：MODES / ACCEPTED_FLAGS / HELP 三处同步', hsp.detail);

  /* 5) 例外白名单：过期例外仍存在即红 */
  const exc = loadExceptions('T-02');
  push(exc.malformed.length === 0, 'exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）', exc.malformed.join('；'));
  const depcruiseActive = runDepcruiseCase('review-no-agent-violation');
  push(
    depcruiseActive.ok && depcruiseActive.violations.some((v) => ruleName(v).startsWith('review-no-agent')),
    'depcruise review-no-agent 对故意违规 fixture 报红',
    depcruiseActive.why || `violations=${depcruiseActive.violations.length}`,
  );
  const strict = exceptionsStrictSample();
  push(strict.ok, '例外过期机制：cursor≥expires_after 时同一违规重新计红', strict.detail);

  /* 5b) A-30-4：--web 与 --ui-io 必须是同一条检查（词表 + 逐词行为 + 不对称） */
  const wtp = webTransportParity();
  push(wtp.ok, 'A-30-4 --web ⊇ --ui-io 共用核心词表，且逐词跑真代码两侧判定一致', wtp.detail);

  /* 6) §3.5 的 7 条规则逐条"故意违规必红 + 干净必绿" */
  for (const c of DEPCRUISE_CASES) {
    const badRun = runDepcruiseCase(`${c.case}-violation`);
    push(badRun.ok && badRun.exit !== 0 && badRun.violations.some((v) => ruleName(v).startsWith(c.rule)), `depcruise ${c.rule} 故意违规 → 红`, badRun.why || `exit=${badRun.exit} rules=${[...new Set(badRun.violations.map(ruleName))].join(',')} ${badRun.stderr || ''}`);
    const cleanRun = runDepcruiseCase(`${c.case}-clean`);
    push(cleanRun.ok && cleanRun.exit === 0 && cleanRun.violations.length === 0, `depcruise ${c.rule} 干净 fixture → 绿`, cleanRun.why || `exit=${cleanRun.exit} violations=${cleanRun.violations.map(ruleName).join(',')}`);
  }

  /* 6c) A-19 疫苗：例外只许豁免"被登记的那一对 (from,to)"，不许把整条规则搞成惰性 */
  const a19 = a19Vaccine();
  for (const c of a19.cases) push(c.ok, c.label, c.detail);

  /* 6c-2) A-28-2 反回归锁：探针不得靠"仓库里还留着某个缺陷"判绿（复用上面已算好的两条结果，不重跑 depcruise） */
  const pil = probeIndependenceFromLiveDefects(a19, strict);
  push(pil.ok, 'A-28-2 自测试探针不依赖仓库在途缺陷（depcruise 例外条目=0 时两条探针仍须全绿）', pil.detail);

  /* 6d) A-24-1：--dist 必须与 apps/app 的 tm-app:dist-guard 同口径，且命中必须可定位 */
  const parity = distGuardParity();
  push(parity.ok, 'A-24-1 --dist 清单 ⊇ tm-app:dist-guard 清单（现读 vite.config.ts 逐条比对，谁也不许更松）', parity.detail);
  const atBad = AT_RULE_SELF_TEST.filter(([s, must]) => (distAtViolations(s).length > 0) !== must);
  push(
    atBad.length === 0 && AT_RULE_SELF_TEST.some(([, must]) => must) && AT_RULE_SELF_TEST.some(([, must]) => !must),
    'A-24-1 .at 判据的反"永真"自检（与 dist-guard 的 AT_RULE_SELF_TEST 同表，红绿两侧都得有）',
    `${AT_RULE_SELF_TEST.length - atBad.length}/${AT_RULE_SELF_TEST.length} 判对${atBad.length ? ` / 判错：${atBad.map(([s, w]) => `期望${w ? '红' : '绿'}:${s}`).join(' | ')}` : ''}`,
  );
  const shape = distHitShapeCheck();
  push(shape.ok, 'A-24-1 脏产物 fixture 判红且命中含「文件:行/偏移 + 命中串」四要素', shape.detail);

  /* 6e) A-106：F-59 首屏 gzip 预算（判据③）的五问 —— 超预算必须红，其余四问钉"不许假绿" */
  for (const c of distBudgetTruthCases()) push(c.ok, c.label, c.detail);

  /* 6b) 反查：故意违规 fixture 留在真仓库里，不得改变门禁结论
   *     （否则「测试文件自己把门禁搞红」会让下一批次的 agent 去放宽规则） */
  const inertCursor = opts.task || process.env.TM_TASK || loadExceptions().gate_cursor;
  // .mjs 不能当可执行文件直接 spawn（Windows 实测 spawnSync → EFTYPE、status=null），
  // 必须经 process.execPath，与 runDepcruiseCase 同一个口径。
  const inert = spawnSync(
    process.execPath,
    [DEPCRUISE_BIN, '.', '--config', path.join(REPO, '.dependency-cruiser.cjs')],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, TM_TASK: inertCursor } },
  );
  push(
    inert.status === 0,
    `depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=${inertCursor}）→ 退出码仍为 0`,
    `exit=${inert.status} ${(inert.stdout || '').trim().split(/\r?\n/).slice(-1)[0] || ''} ${(inert.stderr || '').slice(0, 120)}`,
  );

  /* 7) ddl-parity 的自测（A/B/C 段的判定力 + 缺 schema 源的可读错误） */
  const dp = spawnSync(process.execPath, [path.join(REPO, 'tools', 'ddl-parity.mjs'), '--self-test'], { encoding: 'utf8', cwd: REPO });
  push(dp.status === 0, 'ddl-parity.mjs --self-test 通过', (dp.stdout || dp.stderr || '').trim().split(/\r?\n/).slice(-1)[0]);

  for (const l of lines) process.stdout.write(`${l}\n`);
  process.stdout.write(`\nboundaries --self-test：${lines.length - failures.length}/${lines.length} 通过\n`);
  if (failures.length) process.stdout.write(`失败：\n  - ${failures.join('\n  - ')}\n`);
  return failures.length ? 1 : 0;
};

/**
 * A-28-2：过期例外探针同样要自带输入。它过去从 tools/exceptions.json 里挑一条 depcruise 条目当
 * 样本 —— T-10 把最后一条 review-no-agent 例外删掉（那正是它该删的时候）之后就没有样本了，
 * 探针从此恒红：把"门禁自己缺前置"报成"你的代码违规"，没人会去修，也就没人信这条红。
 * 现在改成用 A-19 fixture 的自持台账：取台账里第一条能命中用例边表的 (from,to) 做样本，
 * 在用游标（例外生效）与过期游标各跑一次**同一份 fixture**，只换游标 ——
 * 前者该边必须在绿侧、后者该边必须回到红侧，才是"过期即重新计红"的机械证明。
 * 样本 = 0 或台账缺失即红（红的是自己的资产缺失，不是别人的缺陷在场）。
 */
function exceptionsStrictSample() {
  const entries = a19RuleEntries() || [];
  const sampleEdge = A19_EDGES.find((edge) => a19Exempted(edge, entries));
  if (!sampleEdge) {
    return { ok: false, detail: `台账 ${toRel(REPO, A19_LEDGER)} 里没有一条例外能命中用例边表（样本 = 0 ⇒ 探针空转）` };
  }
  const entry = entries.find((e) => e.from === sampleEdge.from && new RegExp(e.to, '').test(sampleEdge.to));
  const nums = entries.map((e) => taskNum(e.expires_after));
  const tm = (n) => `T-${String(n).padStart(2, '0')}`;
  const lenientCursor = tm(Math.min(...nums) - 1);
  const strictCursor = tm(Math.max(...nums));
  const lenient = runDepcruiseCase(A19_FIXTURE, lenientCursor);
  const strict = runDepcruiseCase(A19_FIXTURE, strictCursor);
  const lenientRed = a19ViolatedPairs(lenient);
  const strictRed = a19ViolatedPairs(strict);
  const key = a19Pair(sampleEdge);
  return {
    ok: lenient.ok && strict.ok && !lenientRed.has(key) && strictRed.has(key),
    detail: `样本例外 ${entry.id}（owner=${entry.owner}，expires_after=${entry.expires_after}，边 ${sampleEdge.id}=${sampleEdge.from}→${sampleEdge.to}）：`
      + `cursor=${lenientCursor} 时 ${lenientRed.has(key) ? '仍判红 ⇒ 在用例外没豁免住（例外机制是假的）' : '判绿（在用例外生效）'}；`
      + `cursor=${strictCursor} 时 ${strictRed.has(key) ? '重新判红（过期即收回豁免）' : '仍判绿 ⇒ 过期例外还在豁免（过期机制是假的）'}；`
      + `台账 = ${lenient.ownLedger || toRel(REPO, A19_LEDGER)}（用例自持，与 tools/exceptions.json 当前有没有 depcruise 条目无关）`,
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`[boundaries] 脚本自身异常：${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 2;
  });
}

