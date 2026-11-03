/**
 * T-14（架构 §5.1）：`file:///android_asset/index.html` 的产物形态全部在这里保证。
 * 五件事，按重要性排：
 *  1. **产物形态 = 经典脚本 + 单颗 IIFE**（E5b / A-109 / F-70，见下面的 `tm-app:classic-output`）：
 *     `file://` 页面的源是 `null`，stock Chromium 在 `file://` 下**拒绝**任何 CORS-mode 取源
 *     （`<script type=module>`、`<link rel=modulepreload>`、带 `crossorigin` 的标签、运行时 `import()`、
 *     `import.meta.url` 全是这一类）→ 真机直接白屏。所以下面第 1 条的"相对化"只是必要条件之一，
 *     不充分；真正让脚本跑起来的是"经典 `<script src>` + 自包含 IIFE"；
 *  2. `base:'./'` + `renderBuiltUrl → {relative:true}`：所有 chunk / CSS / 资源引用都相对化；
 *  3. `build.target:['es2020','chrome84']` + `cssTarget`：语法降级到 WebView 底线；
 *     API 层（`structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`）
 *     esbuild **不 polyfill**，所以由下面的 `tm-app:dist-guard` 在构建期扫描，命中即构建失败（判据②）；
 *  4. A-15：`@tm/shared` / `@tm/ui` 与本包源码里的相对说明符写成 `./x.js`，webpack 侧靠
 *     `extensionAlias`，Vite 侧由 `tm-app:js-to-ts-resolve` 补齐（本文件属 T-14 可写清单）；
 *  5. `modulePreload.polyfill:false`：polyfill 里带 `document.head.querySelector` 之类没问题，
 *     但它会注入 `Object.keys` 遍历——真正的原因是产物不需要 preload 提示，`file://` 下 `rel=preload` 无意义。
 *     （E5b 之后这条从"没必要"升级成"必须"：`modulePreload` 注入的正是 `<link rel=modulepreload>`。）
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(APP_ROOT, '../..');

/* ───────── A-15：`.js` → `.ts` / `.tsx`（Vite 默认不做这步） ───────── */

const TS_EXT_BY_SOURCE: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
};

function jsToTsResolve(): Plugin {
  return {
    name: 'tm-app:js-to-ts-resolve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const ext = Object.keys(TS_EXT_BY_SOURCE).find((e) => source.endsWith(e));
      if (!ext) return null;
      const dir = dirname(importer);
      const stem = source.slice(0, -ext.length);
      for (const candidate of TS_EXT_BY_SOURCE[ext] ?? []) {
        const file = resolve(dir, stem + candidate);
        if (existsSync(file) && statSync(file).isFile()) return file;
      }
      for (const candidate of TS_EXT_BY_SOURCE[ext] ?? []) {
        const file = resolve(dir, stem, 'index' + candidate);
        if (existsSync(file) && statSync(file).isFile()) return file;
      }
      return null;
    },
  };
}

/* ───────── E5b（A-109 / F-70）：产物形态 = 经典脚本，不是 ESM ───────── */

/**
 * 判据④（与 `tools/boundaries.mjs` 的 `DIST_FILE_HTML_RULES` 同源，⛔ 不复用 `ROOT_RELATIVE_ASSET_REFS`
 * / `BANNED_APIS` 两个数组——`--dist` 的口径一致性检查（`distGuardParity`）逐条读它们，往里加一条就会
 * 报"dist-guard 有正则在 --dist 清单里没在册"；这里是另一组同族判据，只严不松）。
 *
 * 实测依据（本机 stock Edge 153 headless + CDP，夹具 `E:\e5b\probe\p_mod.html` / `p_cls.html`）：
 *  `file://` + `<script type="module" crossorigin src="./mod.js">` →
 *   `Access to script at 'file:///…' from origin 'null' has been blocked by CORS policy:
 *    Cross origin requests are only supported for protocol schemes: chrome-extension,
 *    chrome-untrusted, data, edge, http, https, isolated-app.` → `#app` 保持 EMPTY；
 *  同目录同协议下的经典 `<script src="./cls.js">` → 正常执行。
 * ⚠ `crossorigin` 只判 html 标签：react-dom 的 JS 里本就有这个词，判 JS 是误伤。
 */
const MODULE_ONLY_HTML_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['type="module"', /<script\b[^>]*\btype\s*=\s*["']module["']/gi],
  ['rel="modulepreload"', /<link\b[^>]*\brel\s*=\s*["']modulepreload["']/gi],
  ['crossorigin 属性', /<(?:script|link)\b[^>]*\bcrossorigin\b/gi],
];

/** 收集用：外部 `<script src>` 标签本体（inline `<script>` 没有 src，天然不在这一类里）。 */
const EXTERNAL_SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*><\/script>/gi;
/** 删除用：同一条标签**连同它那一行的缩进与行尾换行**，否则搬完会在 head 留下一片空白行。 */
const EXTERNAL_SCRIPT_LINE =
  /[ \t]*<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*><\/script>[ \t]*\r?\n?/gi;
const MODULEPRELOAD_LINK_TAG = /<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>/gi;
const CROSSORIGIN_ATTR = /\s*\bcrossorigin(?:\s*=\s*["'][^"']*["'])?/i;
const MODULE_TYPE_ATTR = /\s*\btype\s*=\s*["']module["']/i;
const ANY_TYPE_ATTR = /<script\b[^>]*\btype\s*=/i;
const STYLESHEET_LINK_TAG = /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi;
const CLOSE_BODY_WITH_INDENT = /([ \t]*)<\/body>/i;

/**
 * 把 Vite 注入 `<head>` 的 ESM 引用改写成 `file://` 能跑的经典形态，三处一起改（缺一处都白屏）：
 *  1. 外部 `<script>`：摘掉 `type="module"` 与 `crossorigin`，并从 `<head>` 搬到 `</body>` 之前 ——
 *     IIFE 是同步脚本，而入口 `main.tsx` 的 `bootstrap()` 要 `document.getElementById('app')`，
 *     留在 `<head>` 会取到 null（`main.tsx:170-172` 是"取不到就静默返回"，于是产物合法地什么都不挂）；
 *  2. `<link rel=stylesheet>`：摘掉 `crossorigin`，位置不动（样式在 head 是对的）；
 *  3. `<link rel=modulepreload>`：**不改写，直接判红** —— 它出现意味着产物不止一颗 chunk，
 *     那 `inlineDynamicImports` 就没成立，运行时必然跨 chunk `import()`（同一颗 CORS 死因），
 *     搬家改不动它。本仓 `mobile-agenda/assets/index.html` 就是这个形态的在机参照物。
 *
 * 幂等：一律"全部摘下 → 归到 `</body>` 前"，重复跑结果不变
 * （Vite 6 的 `writeBundle` 只在客户端环境跑一次，但幂等比依赖这件事便宜）。
 */
function toClassicFileHtml(html: string): { html: string; problems: string[] } {
  const problems: string[] = [];

  for (const match of html.matchAll(MODULEPRELOAD_LINK_TAG)) {
    problems.push(
      `出现 <link rel="modulepreload">（${match[0]}）⇒ 产物不是单颗 IIFE，搬家救不了跨 chunk import()`,
    );
  }
  let out = html.replace(MODULEPRELOAD_LINK_TAG, '');

  const moved: string[] = [];
  for (const match of out.matchAll(EXTERNAL_SCRIPT_TAG)) {
    const tag = match[0];
    if (ANY_TYPE_ATTR.test(tag) && !MODULE_TYPE_ATTR.test(tag)) {
      problems.push(`外部 <script> 带了非 module 的 type 属性，不做猜测改写：${tag}`);
      continue;
    }
    moved.push(tag.replace(MODULE_TYPE_ATTR, '').replace(CROSSORIGIN_ATTR, ''));
  }
  out = out.replace(EXTERNAL_SCRIPT_LINE, '');
  /** 收集用与删除用的两条正则必须同源：漏一条就是"标签还在文档里，又复制了一份到 body 尾"。 */
  if (out.match(EXTERNAL_SCRIPT_TAG)) {
    problems.push('有外部 <script> 没被摘干净（缩进/换行形状超出预期），不做半改写');
  }

  out = out.replace(STYLESHEET_LINK_TAG, (tag) => tag.replace(CROSSORIGIN_ATTR, ''));

  if (moved.length) {
    const at = CLOSE_BODY_WITH_INDENT.exec(out);
    if (!at) {
      problems.push('产物 index.html 里没有 </body>，无法把入口脚本放到 #app 之后');
    } else {
      const indent = at[1];
      out = out.replace(
        CLOSE_BODY_WITH_INDENT,
        () => moved.map((tag) => `${indent}${tag}`).join('\n') + `\n${indent}</body>`,
      );
    }
  }

  for (const [label, re] of MODULE_ONLY_HTML_PATTERNS) {
    const hits = out.match(re);
    if (hits) problems.push(`判据④ 命中 ${label} ×${hits.length}（${hits.slice(0, 3).join(' | ')}）`);
  }
  return { html: out, problems };
}

function classicOutput(): Plugin {
  const dist = join(APP_ROOT, 'dist');
  return {
    name: 'tm-app:classic-output',
    apply: 'build',
    enforce: 'post',
    // writeBundle（不是 transformIndexHtml）：改的是**落盘后的最终字节**，
    // 不依赖"Vite 在 generateBundle 里注入的到底是占位符还是真路径"这类版本内部行为；
    // 且它跑在 dist-guard 的 closeBundle 之前，守卫扫到的就是真正装进 APK 的那份文件。
    writeBundle() {
      const file = join(dist, 'index.html');
      if (!existsSync(file)) throw new Error(`[classic-output] 找不到 ${file}（产物形态无从改写）`);
      const before = readFileSync(file, 'utf8');
      const { html, problems } = toClassicFileHtml(before);
      if (problems.length) {
        throw new Error(
          `[classic-output] 产物在 file:// 下跑不起来（判据④）：\n  ${problems.join('\n  ')}\n` +
            '修法：检查 build.rollupOptions.output.format=inlineDynamicImports 是否被改回 es/false。',
        );
      }
      const externalScripts = [...html.matchAll(EXTERNAL_SCRIPT_TAG)];
      if (externalScripts.length !== 1) {
        throw new Error(
          `[classic-output] 期望恰好 1 颗外部 <script src>，实际 ${externalScripts.length} 颗 ⇒ 首屏入口不唯一`,
        );
      }
      const styleLinks = html.match(STYLESHEET_LINK_TAG) ?? [];
      if (styleLinks.length !== 1) {
        throw new Error(
          `[classic-output] 期望恰好 1 颗 <link rel="stylesheet">，实际 ${styleLinks.length} 颗 ⇒ ` +
            'CSS 若被 Vite 内联进 JS（iife + cssCodeSplit:true 那一支），首帧必 FOUC',
        );
      }
      const appDiv = html.search(/<div[^>]*\bid\s*=\s*["']app["']/i);
      const scriptAt = externalScripts[0]?.index ?? -1;
      if (appDiv < 0 || scriptAt < appDiv) {
        throw new Error(
          `[classic-output] 入口脚本没有落在 #app 之后（位置 ${scriptAt} vs #app ${appDiv}）⇒ IIFE 同步执行会取不到挂载点`,
        );
      }
      if (html !== before) writeFileSync(file, html, 'utf8');
      this.info(
        `[classic-output] 判据④ 成立：1 颗经典 <script src>（在 #app 之后、</body> 之前）+ 1 颗经典 ` +
          `<link rel="stylesheet">，0 处 type=module / crossorigin / modulepreload`,
      );
    },
  };
}

/* ───────── 判据①②：产物扫描（`tools/boundaries.mjs --dist` 的落地件尚未交付） ───────── */

/** Chrome84 之后才有的 API：esbuild 只降级语法、不补 API，命中 = 真机 TypeError。 */
const BANNED_APIS: ReadonlyArray<readonly [string, RegExp]> = [
  ['structuredClone', /structuredClone\s*\(/g],
  ['Object.hasOwn', /Object\s*\.\s*hasOwn\s*\(/g],
  ['requestIdleCallback', /requestIdleCallback/g],
];

/* ── Array.prototype.at（Chrome 92）：必须"归因"，因为 `.at(` 这个写法同样属于别的对象 ── */

const ANY_AT_CALL = /\.at\s*\(/g;
const ARRAY_PROTO_AT = /\bArray\s*\.\s*prototype\s*\.\s*at\b/g;
const AT_FEATURE_GUARD = /["']at["']\s*in\s+Array\s*\.\s*prototype/;
/** 同一文件里自己定义了 `at(i){…}` 方法（minify 后紧跟 `}`，所以字符类含 `}`）。 */
const OWN_AT_METHOD = /(?:^|[{};,])\s*at\s*\([^(){}]*\)\s*\{/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * 判据② 的 `.at` 部分：只拦"真的会在 Chrome84 上炸"的用法，且**默认判红**，
 * 只有下面两种可证明安全的情形放行（都不是"加例外名单"，是同类不同物）：
 *  1. `this.at(…)` 且**同一文件里存在自己的 `at(…)` 方法定义** —— 命中的是那个方法，
 *     与 `Array.prototype.at` 无关（`@radix-ui/react-collection` 的 OrderedDict 就是这种）；
 *  2. `Array.prototype.at` 且同一文件里有 `"at" in Array.prototype` 特性探测（探测失败走的是
 *     自家的下标兜底实现）→ 缺探测即红。
 * receiver 是数组字面量 / 下标 / 调用结果（`]`、`)`、引号结尾）或任意其它标识符 → 一律红。
 */
function atApiViolations(text: string): string[] {
  const hasOwnAtMethod = OWN_AT_METHOD.test(text);
  const featureGuarded = AT_FEATURE_GUARD.test(text);
  const found: string[] = [];
  for (const match of text.matchAll(ANY_AT_CALL)) {
    const dot = match.index ?? 0;
    let i = dot - 1;
    while (i >= 0 && IDENT_CHAR.test(text.charAt(i))) i -= 1;
    const receiver = text.slice(i + 1, dot);
    if (receiver === 'this' && hasOwnAtMethod) continue;
    found.push(`.at( 调用（receiver=${receiver || '计算表达式/字面量'}）`);
  }
  if (!featureGuarded) {
    for (const match of text.matchAll(ARRAY_PROTO_AT)) {
      found.push(`Array.prototype.at（${match[0]}，无 "at" in Array.prototype 特性探测）`);
    }
  }
  return found;
}

/**
 * 上面那条规则的反"永真断言"自检（同 `tools/boundaries.mjs --self-test` 的思路）：
 * 构建期先跑，任一条判错 → 构建直接失败，规则不可能被改成"永远绿"还留在这里。
 * 第二元 = 该片段是否**必须**判红。
 */
const AT_RULE_SELF_TEST: ReadonlyArray<readonly [string, boolean]> = [
  ['const x=[1,2,3];return x.at(0)', true],
  ['return t.split(" ").at(-1)', true],
  ['return [1,2].at(0)', true],
  ['class C{m(){return this.at(0)}}', true],
  ['return Array.prototype.at.call(a,n)', true],
  ['class D{at(i){return i}m(){return this.at(1)}}', false],
  ['function cu(l,n){if("at"in Array.prototype)return Array.prototype.at.call(l,n);return l[n]}', false],
];

function selfCheckAtRule(): void {
  const broken = AT_RULE_SELF_TEST.filter(
    ([snippet, mustFlag]) => (atApiViolations(snippet).length > 0) !== mustFlag,
  );
  if (broken.length) {
    throw new Error(
      `[dist-guard] 判据② 的 .at 规则自检失败（${broken.length}/${AT_RULE_SELF_TEST.length} 条判错）：\n  ` +
        broken.map(([s, want]) => `期望${want ? '红' : '绿'}：${s}`).join('\n  '),
    );
  }
}

/** 判据①：`file://` 下以 `/` 开头的路径会解析到文件系统根，必然 404。 */
const ROOT_RELATIVE_ASSET_REFS: ReadonlyArray<readonly [string, RegExp]> = [
  ['src="/…" 属性', /(?:src|href)\s*=\s*["']\//g],
  ['url(/…) ', /url\(\s*["']?\//g],
  ['import "/…" / from "/…"', /(?:import|from)\s*\(\s*["']\//g],
];

const walkFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
};

function guardDist(): Plugin {
  const dist = join(APP_ROOT, 'dist');
  return {
    name: 'tm-app:dist-guard',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      selfCheckAtRule();
      if (!existsSync(dist)) throw new Error(`[dist-guard] 找不到 ${dist}（判据①②无法成立）`);
      const files = walkFiles(dist);
      const problems: string[] = [];

      for (const file of files.filter((f) => /\.(html|css)$/.test(f))) {
        const text = readFileSync(file, 'utf8');
        for (const [label, re] of ROOT_RELATIVE_ASSET_REFS) {
          const hits = text.match(re);
          if (hits) {
            problems.push(
              `${rel(file)}：判据① 命中绝对路径 ${label} ×${hits.length}（${hits.slice(0, 3).join(' | ')}）`,
            );
          }
        }
      }

      for (const file of files.filter((f) => /\.(js|mjs)$/.test(f))) {
        const text = readFileSync(file, 'utf8');
        for (const [label, re] of BANNED_APIS) {
          const hits = text.match(re);
          if (hits) problems.push(`${rel(file)}：判据② 命中 Chrome84 之后的 API ${label} ×${hits.length}`);
        }
        for (const detail of atApiViolations(text)) {
          problems.push(`${rel(file)}：判据② 命中 Chrome84 之后的 API ${detail}`);
        }
      }

      if (problems.length) {
        throw new Error(
          `[dist-guard] 产物不符合 file:// + ES2020 约束：\n  ${problems.join('\n  ')}\n` +
            '修法：绝对路径 → 检查 base/renderBuiltUrl；高版本 API → 换等价写法或在 vite.config.ts 里 externalize/patch。',
        );
      }
      this.info(
        `[dist-guard] 判据①②通过：${files.length} 个产物文件，无绝对路径资源、无 Chrome84 之后的 API`,
      );
    },
  };
}

const rel = (p: string): string => p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');

export default defineConfig({
  base: './',
  plugins: [jsToTsResolve(), react(), classicOutput(), guardDist()],
  resolve: {
    // @tm/ui / @tm/shared 是"源码直出"的 workspace 软链包，必须按真实路径解析，
    // 它们的 node_modules 依赖（radix / clsx）才在包目录里找得到（§3.2 末段）。
    preserveSymlinks: false,
  },
  optimizeDeps: { exclude: ['@tm/ui', '@tm/shared'] },
  server: { fs: { allow: [REPO_ROOT] } },
  esbuild: { legalComments: 'none' },
  build: {
    target: ['es2020', 'chrome84'],
    cssTarget: 'chrome84',
    modulePreload: { polyfill: false },
    // E5b 配套（**不是**风格选择，是 `format:'iife'` 逼出来的）：Vite 6.4.3 的 `vite:css-post` 只在
    // `cssCodeSplit:true` 且 `format` 为 `es`/`cjs` 时才把 CSS 落成独立 `.css` 资产；
    // iife 那一支（源码 `dep-Dm0c1Wj2.js:43470-43486`）走的是运行时
    // `document.createElement('style')` 注入 —— 实测产物里 0 个 `.css`、head 里 0 颗 `<link>`。
    // 那样 file:// 是能跑（不取源），但 CSS 要等 645KB JS 解析完才出现 = §3.4 的 FOUC 判据失守，
    // 且不符合"一颗经典 `<link rel=stylesheet>`"的交付形态 ⇒ 关掉分包，让 CSS 走
    // `!cssCodeSplit` 那一支（`dep-Dm0c1Wj2.js:43543` 单一资产 + `:36759` 注入 `<link>`）。
    cssCodeSplit: false,
    sourcemap: false,
    reportCompressedSize: true,
    // E5b（A-109 / F-70）：**这里不再是**"按路由分包"。R-17⑥ 的分包口径在 `file://` 下不成立——
    // 拆出去的 chunk 只能靠 `<link rel=modulepreload>` 或运行时 `import()` 拿到，两者都是 CORS-mode
    // 取源（`type=module` 那条错误原文见本文件顶部），于是"分包"= 二级页在真机必白。
    // 所以产物是一颗自包含 IIFE：`React.lazy` 的 12 条动态 import 全部内联（lazy 组件本身照旧，
    // 变的只是"取源"这一步没有了），首屏与二级页共用同一颗 JS。
    // ⚠ 这条与 `format:'iife'` 是一对：`inlineDynamicImports:false` 会立刻让 Rollup 报
    //    "Invalid value 'iife' for output.format ... code splitting"，不许单独回滚其中一条。
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        // `cssCodeSplit:false` 时 CSS 的 emit 名固定是 `style.css`（Vite 源码 `dep-Dm0c1Wj2.js:43543`
        // 的 `name: getCssBundleName()`），落盘就成 `assets/style-<hash>.css`。这里把它钉回
        // `assets/index-<hash>.css`：与 JS 入口同一命名，也是交付形态里写的那一颗。
        // 只认扩展名，别的资产（本产物目前没有）走 Vite 默认模板。
        assetFileNames: (info) =>
          /\.css$/i.test(info.name ?? '') ? 'assets/index-[hash][extname]' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  experimental: {
    // A-22(b)：这个回调在 Vite 里**只**收到两类 URL（`RenderBuiltAssetUrl` 的 `type` 取值是
    // `'asset' | 'public'`）—— `asset` = 构建期 emit 到 assets/ 的静态资源，`public` = publicDir
    // 原样拷贝的文件。JS chunk 之间的引用**不经过这里**，由上面的 `base:'./'` 相对化；
    // 上一轮写的 `type === 'chunk'` 因而是一个 Vite 里不存在的分支（TS2367 的根因），删掉而不是加 cast。
    // 两类路径在 `file:///android_asset/index.html` 下的要求一致：相对宿主文件、绝不以 `/` 开头（判据①），
    // 所以这里只有一条真实分支（"是我认识的两类 → 强制相对"），没有按类型分叉的行为。
    renderBuiltUrl(_filename, { type }) {
      if (type === 'asset' || type === 'public') return { relative: true };
      // 取值域之外的东西不该出现；真出现了就交回 Vite 默认（= `base:'./'` 拼出的相对路径），
      // 判据① 由 dist-guard 在 closeBundle 硬扫，不依赖这一行。
      return undefined;
    },
  },
});
