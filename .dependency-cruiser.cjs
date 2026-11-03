'use strict';
/**
 * T-02 架构门禁：`.dependency-cruiser.cjs`（§3.5 的 7 条规则的落地件）
 *
 * 设计约束（照 §10.2 T-02 行「回归风险」栏执行）：
 *   规则本身一律不放宽。历史遗留违规只登记在 `tools/exceptions.json`，由本文件在加载时
 *   把「未过期」的例外从规则的匹配集合里摘出去（生成 `__exc_<id>` 变体规则），过期例外自动失效
 *   → 违规重新变红。例外是否过期由「当前任务号游标」判定：`process.env.TM_TASK` 优先，
 *   否则取 exceptions.json 的 `gate_cursor`。语义：`num(cursor) >= num(expires_after)` ⇒ 已过期。
 *
 * 与 §3.5 字面的三处落地差异（已写进 04-dev-report-T-02.md「契约偏差」）：
 *   1) `app-web-isolated` 需要双向断言，而 dependency-cruiser 18.3 不支持 from/to 之间的
 *      捕获组反向引用（实测 `^apps/$1/`、`^apps/\1/` 均不匹配）→ 拆成 `app-web-isolated`
 *      （app→web）与 `app-web-isolated-reverse`（web→app），两条都属于同一条验收。
 *   2) `ui-no-io` 的 `fetch` 与 `shared-pure` 的 `process.env` 里「全局调用」不是 import，
 *      depcruise 看不见 → 模块依赖部分在本文件强制，全局调用部分在 `tools/boundaries.mjs`
 *      （`--ui-io` / `--shared-pure` 断言）强制，两处同规则 ID、同一份 exceptions.json。
 *   3) 不使用 `options.includeOnly`：实测它会把「指向 npm 包的依赖边」整条剪掉，
 *      使 ui-no-io / shared-pure / fsrs-version-lock / thin-facade-pg-client 变成永真断言；
 *      相应地把 node_modules 从 exclude 挪到 doNotFollow，并用「路径前缀 + 裸包名」双形态匹配。
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * A-28-2：例外台账允许由调用方注入（`TM_EXCEPTIONS_FILE`），缺省仍是 tools/exceptions.json。
 * 只给 `--self-test` 的两条探针用 —— 它们各自带一份 fixture 台账
 * （tools/fixtures/selftest/depcruise/review-no-agent-exception/_exceptions.json），
 * 这样"例外机制好不好使"不再取决于真仓库此刻有没有一条活着的 review-no-agent 例外。
 * 注入的是**用例的输入**，不是门禁的后门：正式跑 `pnpm depcruise` / `boundaries --all`
 * 不设这个 env，读的还是那一份白名单。
 */
const EXCEPTIONS_FILE = process.env.TM_EXCEPTIONS_FILE
  ? path.resolve(process.env.TM_EXCEPTIONS_FILE)
  : path.join(__dirname, 'tools', 'exceptions.json');

function num(taskId) {
  const m = /^T-(\d+)$/.exec(String(taskId || '').trim());
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** 把包名里的正则元字符转义（`@scope/name` 里的 `/` 不用转义）。 */
function escRe(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readExceptions() {
  try {
    const raw = JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf8'));
    return {
      gate_cursor: raw.gate_cursor || 'T-02',
      entries: Array.isArray(raw.exceptions) ? raw.exceptions : [],
    };
  } catch (error) {
    // 白名单文件读不到 = 门禁失效，宁可得罪人也不许静默放行（与 A-5 的口径一致）。
    throw new Error(
      `无法读取 ${EXCEPTIONS_FILE}（depcruise 例外白名单）：${error.message}`,
    );
  }
}

const EXC = readExceptions();
const cursor = process.env.TM_TASK || EXC.gate_cursor;
const cursorNum = num(cursor);

const active = [];
const expired = [];
for (const entry of EXC.entries) {
  if (entry.engine !== 'depcruise') continue;
  (num(entry.expires_after) <= cursorNum ? expired : active).push(entry);
}

/**
 * 一条逻辑规则 → N 条物理规则（1 条严格主干 + 每个生效例外 1 个变体）
 *
 * A-19（P0 修复）：`pathNot` 只允许并入「例外登记的那一侧」，**永远不许并入规则自身的
 * `path`**。旧实现在这里多并了一项 `base.path`，于是只要某条规则有 ≥1 条在用例外，
 * 主干就变成 `from: { path: P, pathNot: [P] }` —— 命中 P 的模块必然同时命中 pathNot，
 * 整条规则永久不触发（`pnpm depcruise` 的绿是假的）。`to` 侧同一个毛病。
 * 修完的语义：有例外 = 只豁免被登记的那一对 (from,to)，同规则其余 from/to 组合照旧全红。
 * 回归疫苗见 tools/boundaries.mjs `--self-test` 的「A-19 三条用例」。
 */
function materialize(name, from, to) {
  const excs = active.filter((entry) => entry.rule === name);
  const mine = expired.filter((entry) => entry.rule === name);
  const hint = mine.length
    ? `｜已过期例外（违规仍在即红，请整改后删除条目）：${mine.map((e) => `${e.id}(${e.expires_after})`).join(', ')}`
    : '';
  if (excs.length === 0) {
    return [{ name, severity: 'error', from, to, comment: `${name}${hint}` }];
  }
  /** 并 pathNot 时只吃「例外登记的路径」，绝不回头吃规则自己的 path。 */
  const mergeNot = (base, extra) =>
    [base.pathNot ? [].concat(base.pathNot) : [], extra].flat().filter(Boolean);
  /** 装配期自证：一条侧的 pathNot 里出现该侧自己的 path = 该规则永真不触发（A-19 的病根）。 */
  const assertNotBlinded = (side, label) => {
    if (side.path && (side.pathNot || []).some((p) => String(p) === String(side.path))) {
      throw new Error(
        `.dependency-cruiser.cjs: 规则 ${name} 的 ${label}.pathNot 含自身 path（永真断言，A-19）`,
      );
    }
  };
  const mainFrom = { ...from, pathNot: mergeNot(from, excs.map((e) => e.from)) };
  assertNotBlinded(mainFrom, 'from');
  const rules = [
    {
      name,
      severity: 'error',
      from: mainFrom,
      to,
      comment: `${name}${hint}`,
    },
  ];
  for (const entry of excs) {
    const variantTo = { ...to, pathNot: mergeNot(to, [entry.to]) };
    assertNotBlinded(variantTo, 'to');
    rules.push({
      name: `${name}__exc_${entry.id}`,
      severity: 'error',
      from: { path: `^${entry.from}$` },
      // 例外只豁免登记过的那一条 to，其余照旧全红。
      to: variantTo,
      comment: `${name}（例外 ${entry.id} 生效中，owner=${entry.owner || entry.expires_after}，expires_after=${entry.expires_after}）`,
    });
  }
  return rules;
}

/**
 * 「已安装的包」在 depcruise 里的路径形态：pnpm 会解析成
 *   node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…
 * 未安装时解析不成，路径就是裸标识符（见下面的 specifierAnyOf）。两种都要匹配，
 * 否则规则在真仓库里"永远抓不到"—— 那正是本任务定义的永真断言。
 */
function npmAnyOf(names) {
  const alt = names.map(escRe).join('|');
  return `(^|/)node_modules/(?:${alt})/`;
}

/** 裸标识符形态（fixture 里没有 node_modules，depcruise 用 module 名当路径）。 */
function specifierAnyOf(names) {
  return `^(${names.map(escRe).join('|')})(/|$)`;
}

const forbidden = [
  // ── R-06 ②「ui 包不发请求」 ────────────────────────────────────────────
  // A-14：`*-no-io` 家族的 from 作用面 = **只有 src/**（test/** 豁免），与
  // eslint.config.js 的 files、tools/boundaries.mjs 的 roots 三处同 ID 同面。
  // 理由："不得做 IO"针对被打进产物的代码，测试文件不进产物；to 侧的被禁模块清单一条未减。
  // to.path 两种形态都要写：pnpm 装好后是 node_modules/<pkg>/…，fixture 里没有
  // node_modules 时 depcruise 用裸标识符当 path（实测见 04-dev-report-T-02.md）。
  ...materialize(
    'ui-no-io',
    { path: '^packages/ui/src/' },
    {
      path:
        npmAnyOf(['axios', 'node-fetch', 'got', 'superagent', 'next', '@tm/server', '@tm/agent']) +
        '|(^|/)node_modules/@trpc/[^/]+/|' +
        specifierAnyOf(['axios', 'node-fetch', 'got', 'superagent', 'next/navigation', '@tm/server', '@tm/agent']) +
        '|^@trpc/[^/]+(/|$)',
    },
  ),
  // ── R-02 ①「评分路径不得 import agent/LLM」：可达闭包（§4.3） ──────────
  ...materialize(
    'review-no-agent',
    {
      path: '^(packages/server/src/services/review-service\\.ts|packages/server/src/trpc/routers/review\\.ts|packages/server/src/routes/review\\.ts)$',
    },
    {
      path: `^(@tm/agent|packages/agent/|packages/server/src/services/analyst\\.ts)|${npmAnyOf(['@tm/agent'])}`,
      reachable: true,
    },
  ),
  // ── §3.3「shared 无 IO、无框架」 ───────────────────────────────────────
  // A-14：同 ui-no-io —— from 收窄到 src/，test/** 豁免（eslint 与 boundaries 同面）。
  ...materialize(
    'shared-pure',
    { path: '^packages/shared/src/' },
    {
      path:
        npmAnyOf([
          'react',
          'react-dom',
          'next',
          'hono',
          'express',
          'fastify',
          'axios',
          'pg',
          'better-sqlite3',
          'ioredis',
        ]) +
        '|(^|/)node_modules/(@trpc|@hono)/[^/]+/|' +
        specifierAnyOf([
          'react',
          'react-dom',
          'next',
          'hono',
          'express',
          'fastify',
          'axios',
          'pg',
          'better-sqlite3',
          'ioredis',
        ]) +
        '|^(@trpc|@hono)/[^/]+(/|$)',
    },
  ),
  ...materialize(
    // A-14：域内禁 IO 的"node 内置模块"半边，作用面与 shared-pure 一致（只 src/）
    'shared-pure-core',
    { path: '^packages/shared/src/' },
    { dependencyTypes: ['core'] },
  ),
  // ── 顶层边界 ③：apps/app 与 apps/web 互不可达（双向） ──────────────────
  ...materialize(
    'app-web-isolated',
    { path: '^apps/app/' },
    { path: '^apps/web/' },
  ),
  ...materialize(
    'app-web-isolated-reverse',
    { path: '^apps/web/' },
    { path: '^apps/app/' },
  ),
  // ── S13：ts-fsrs 只能出现在 services/fsrs.ts ───────────────────────────
  ...materialize(
    'fsrs-version-lock',
    {
      pathNot: [
        '^packages/server/src/services/fsrs\\.ts$',
        '^tools/fixtures/',
        '(^|/)(node_modules|dist|build|coverage|_archive|pgdata|public|docs|mobile-agenda|backups|tmp-logs|gui-test-screenshots)/',
      ],
    },
    { path: `${npmAnyOf(['ts-fsrs'])}|${specifierAnyOf(['ts-fsrs'])}` },
  ),
  // ── §4.2 收敛规则 1：门面层不碰 SQL（白名单仅 routes/admin.ts） ─────────
  // db/types.ts 是 §10.3 明确放行的接缝（其他任务「只调 AppDB 接口方法」），
  // 因此本规则只禁止直达两个驱动实现与迁移目录，以及自带 SQL 客户端。
  ...materialize(
    'thin-facade',
    {
      path: '^packages/server/src/(routes|trpc/routers)/',
      pathNot: ['^packages/server/src/routes/admin\\.ts$', '^tools/fixtures/'],
    },
    {
      path:
        '^packages/server/src/db/(sqlite|pg|index)\\.ts$|^packages/server/src/db/migrations/|^(better-sqlite3|node:sqlite)$|' +
        npmAnyOf(['better-sqlite3']),
    },
  ),
  ...materialize(
    'thin-facade-pg-client',
    {
      path: '^packages/server/src/(routes|trpc/routers)/',
      pathNot: ['^packages/server/src/routes/admin\\.ts$', '^tools/fixtures/'],
    },
    { path: `^pg$|^pg/|${npmAnyOf(['pg'])}` },
  ),
  // ── R-20 ⑦：手写版只活在 legacy 分支，apps/** 不得 import 产物目录 ──────
  ...materialize(
    'no-legacy-app-js',
    { path: '^apps/' },
    { path: '^mobile-memory/assets/' },
  ),
];

module.exports = {
  forbidden,
  options: {
    moduleSystems: ['es6', 'cjs', 'amd'],
    tsConfig: { fileName: 'tsconfig.base.json' },
    // 注意：这里刻意「不使用 includeOnly」，也不把 node_modules 放进 exclude。
    // 实测（depcruise 18.3.1，见 04-dev-report-T-02.md「契约偏差」第 3 条）：
    // includeOnly 会把指向 node_modules / 裸包名的依赖边整条剪掉 —— 那么
    // ui-no-io、shared-pure、fsrs-version-lock、thin-facade-pg-client 这几条
    // 「禁某个 npm 包」的规则在真仓库里永远抓不到东西，就是本任务定义的永真断言。
    // node_modules 保留在 doNotFollow 里：包本身进图（能命中 to.path），但不爬它的内容。
    exclude: {
      path:
        '(^|/)(dist|build|coverage|\\.next|_archive|pgdata)/|^tools/fixtures/',
    },
    doNotFollow: {
      path: '(^|/)(node_modules|dist|build|coverage|\\.next|_archive)/',
    },
    detectProcessBuiltinModuleCalls: true,
  },
};
