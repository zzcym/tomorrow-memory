# 04-dev-report E5b-classic — App 产物从 ESM 改为单文件经典脚本（T1）+ 壳补 setAllowFileAccess（T2）

- 日期：2026-09-26（本机 Windows / Git Bash，headless Edge 153 + CDP 9333）
- 执行人：前端 agent（E5b-classic，第 3 次派发）
- 任务：两颗，都不改业务逻辑 —— T1 落 `apps/app/vite.config.ts`，T2 落 `mobile-memory/src/com/tomorrow/memory/MainActivity.java`
- 结论：**两颗都绿**。`file:///…/apps/app/dist/index.html` 在 stock Chromium 下首屏挂出内容，CORS 类控制台错误 0 条；472/18 与 68 两条测试口径原样通过，**0 条断言被改动**；`tsc --noEmit -p apps/app` exit 0。
- 本报告路径：`E:\CC\tomorrow-memory\.delivery\04-dev-report-E5b-classic.md`

---

## 0. 先说三件 TPM 必须知道的事（都在下面有实测支撑）

1. **`build.cssCodeSplit: false` 是这颗任务必需的第三处改动，不是风格选择。** 只做 `format:'iife'` + `inlineDynamicImports:true` 的第一版产物**根本没有 `.css` 文件、head 里 0 颗 `<link>`** —— Vite 6.4.3 在 iife 下把 CSS 编成运行时 `document.createElement('style')` 注入。原因与原文见 §4.1。
2. **`R-17⑥「产物按路由分包」与这颗改判在文字上互斥**，需要一条 A-台账把旧命题改判掉（`React.lazy` 的 12 条动态 import 现在全部内联进单颗 JS）。代码侧注释我已写明（`vite.config.ts:367-373`），但**台账不是我能改的面**。见 §5.2。
3. **本会话期间 `apps/app/vite.config.ts:187` 被另一路 agent（`04-dev-report-E5b-classic-fix1.md`）改了一行**（`externalScripts[0].index` → `externalScripts[0]?.index`，TS2532 + `noUncheckedIndexedAccess`）。我没有回滚它，我的所有出口数据都是**在含该行的当前文件上**跑出来的。见 §5.5。

---

## 1. 改动清单（逐处 `file:line` + 为什么）

### 1.1 `apps/app/vite.config.ts`（T1）

| 位置 | 改了什么 | 为什么 |
| --- | --- | --- |
| `:20` | `import { …, writeFileSync } from 'node:fs'` | 改写落盘的 `dist/index.html` 需要写文件（见 :162 的 `writeBundle`）。 |
| `:2-17` 文件头注释（整段是 `:1-18`） | 「四件事」→「五件事」（`:3`），新增第 1 条"产物形态 = 经典脚本 + 单颗 IIFE"（`:4-8`），原 2~5 条顺延重编号（`:9-17`） | 原注释把 ESM 形态当成前提（"JS chunk 之间的引用由 `base:'./'` 相对化"），在 `file://` 下正是这条前提造成白屏；注释与判据必须同步，否则下一个 agent 会照旧注释把它改回 ESM。 |
| `:15-17`（头注释第 5 条） | `modulePreload.polyfill:false` 的理由从"没必要"升级成"必须" | `modulePreload` 注入的正是判据④ 禁止的 `<link rel=modulepreload>`。 |
| `:60-79` | 新增区块注释 + `MODULE_ONLY_HTML_PATTERNS`（判据④ 三条：`type="module"` / `rel="modulepreload"` / 标签上的 `crossorigin`） | 与 `tools/boundaries.mjs:695-699` 的 `DIST_FILE_HTML_RULES` 同源。**刻意不往 `BANNED_APIS` / `ROOT_RELATIVE_ASSET_REFS` 里加条目**：`boundaries.mjs:3026-3078`（`distGuardParity`）逐行抠那两个数组并要求每条正则都在 `--dist` 清单在册，往里塞会把门禁打成"dist-guard 有正则没在册"的红。 |
| `:81-91` | 6 条标签级正则（收集/删除/`modulepreload`/`crossorigin`/`type=module`/stylesheet/`</body>`） | 拆成"收集用"与"删除用"两条同源正则：删除时必须连该行缩进与换行一起删，否则 head 留下一片空白行；两者若不同源，:127 的自检会立刻判红（漏删=文档里留两份）。 |
| `:92-151` `toClassicFileHtml()`（函数体 `:106-151`，前面 `:92-105` 是注释） | 纯函数：把 Vite 注入 `<head>` 的 ESM 引用改写成经典形态并搬位置（详见注释三条） | ①外部 `<script>`：摘 `type="module"` + `crossorigin`，从 `<head>` 搬到 `</body>` 之前 —— IIFE 是同步脚本，而入口 `main.tsx:170-172` 取不到 `#app` 是**静默 return**，留在 head 会得到一颗合法但什么都不挂的产物；②`<link rel=stylesheet>`：只摘 `crossorigin`，位置不动；③`<link rel=modulepreload>`：**不改写、直接判红** —— 它出现就意味着产物不止一颗 chunk，`inlineDynamicImports` 没成立，运行时跨 chunk `import()` 是同一颗 CORS 死因，搬家救不了。幂等：一律"全部摘下 → 归到 `</body>` 前"。 |
| `:153-200` `classicOutput()` | 新插件 `tm-app:classic-output`，`apply:'build'` + `enforce:'post'` + **`writeBundle`**（不是 `transformIndexHtml`） | `writeBundle` 改的是**落盘后的最终字节**，不依赖"Vite 在 generateBundle 里注入的是占位符还是真路径"这类版本内部行为；且它在 `tm-app:dist-guard` 的 `closeBundle` 之前跑完 ⇒ **守卫扫到的就是真正装进 APK 的那份文件**（插件序 :344：`jsToTsResolve → react → classicOutput → guardDist`）。 |
| `:173-185` | 三条硬校验：外部 `<script src>` 恰好 1 颗、`<link rel=stylesheet>` 恰好 1 颗、入口必须在 `#app` 之后（:186-192） | 反"永真"：任何一条不成立 = 构建失败，而不是产物里留一个能骗过 grep 的形状。stylesheet 计数为 1 这条专门盯 §4.1 那个坑（CSS 被内联进 JS 时 head 是 0 颗 `<link>`）。 |
| `:344` | 插件表加 `classicOutput()` | —— |
| `:356-364` | `modulePreload:{polyfill:false}` 保留；**新增 `cssCodeSplit:false`**（附 Vite 源码行号与实测） | 见 §4.1：不加这条就没有 CSS。 |
| `:374-385`（`format:'iife'` `:376`、`inlineDynamicImports:true` `:377`、`assetFileNames` `:382-383`、分包理由注释 `:367-373`） | `rollupOptions.output` 从 `{ inlineDynamicImports:false }` 改成 `{ format:'iife', inlineDynamicImports:true, assetFileNames }` | 原注释"二级页按 React.lazy 自然分包"在 `file://` 下不成立。`assetFileNames` 只把 CSS 的落盘名从 Vite 默认的 `assets/style-<hash>.css` 钉回 `assets/index-<hash>.css`（与 JS 入口同命名 = 交付形态里写的那一颗）；命名依据是 Vite 源码 `dep-Dm0c1Wj2.js:43543` 用 `name: getCssBundleName()`（= `style.css`）emit。 |

**未动的东西（要求 3 的"保留"清单，逐条核对）**：`base:'./'`（:343）、`experimental.renderBuiltUrl → {relative:true}`（:394-399，一字未改）、`build.target:['es2020','chrome84']` + `cssTarget:'chrome84'`（:354-355）、`jsToTsResolve`（:31-58，一字未改）、`tm-app:dist-guard` 的 `BANNED_APIS`（:205）/ `ROOT_RELATIVE_ASSET_REFS`（:277）/ 四条 `.at` 判据常量与 `selfCheckAtRule`（一字未改 ⇒ `distGuardParity` 的对照面没有漂移）。`optimizeDeps`/`server.fs`/`esbuild.legalComments`/`sourcemap` 未动。

**没有改**：`apps/app/index.html`（源码）、`apps/app/src/**` 任何一行、`packages/**`、`tools/**`、`mobile-memory/build-apk.sh`、任何 `*.apk`/`keystore*`、`.delivery/**` 主文档、`vitest.workspace.ts`。

### 1.2 `mobile-memory/src/com/tomorrow/memory/MainActivity.java`（T2）

```
:31        s.setAllowFileAccess(true);
```

- 落点：`WebSettings s = web.getSettings();`（:28）段的第三行，紧跟 `s.setDomStorageEnabled(true);`（:30），与参照物 `mobile-agenda/src/com/tomorrow/agenda/MainActivity.java:53` **同形**（同一位置、同一写法、同样在 `web.setBackgroundColor(...)` 之前）。
- 为什么：`android:targetSdkVersion="34"`（本机读 `mobile-memory/AndroidManifest.xml:7` 实测：`minSdkVersion="26" android:targetSdkVersion="34"`）⇒ `setAllowFileAccess` 默认为 `false`，`file:///android_asset/index.html` 及其相对资源的文件访问要显式开。
- 只加这一行，`git diff --stat` 对该文件报 `mobile-memory/src/com/tomorrow/memory/MainActivity.java | 1 +`（全仓唯一 1 行改动）。

---

## 2. 出口条件①②：重新构建 + `dist/index.html` 的全部 `<script`/`<link`

```
$ cd /e/CC/tomorrow-memory && pnpm --filter @tm/app build        # = tsc -p tsconfig.json --noEmit && vite build
[plugin tm-app:classic-output] [classic-output] 判据④ 成立：1 颗经典 <script src>（在 #app 之后、</body> 之前）+ 1 颗经典 <link rel="stylesheet">，0 处 type=module / crossorigin / modulepreload
computing gzip size...
dist/index.html                   3.09 kB │ gzip:   1.74 kB
dist/assets/index-T4SUTEM1.css   38.63 kB │ gzip:   8.12 kB
dist/assets/index-prq-99Wt.js   606.01 kB │ gzip: 184.07 kB
✓ built in 2.73s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：3 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
build-exit=0
```

（`npx vite build` 单跑同样 exit 0，输出一致；上面选官方脚本因为它自带 tsc。）

`apps/app/dist/index.html` 的资源标签行（含行号）：

```
$ grep -n -E "<script|<link" apps/app/dist/index.html
18:    <script>
35:    <script>
61:    <link rel="stylesheet" href="./assets/index-T4SUTEM1.css">
65:  <script src="./assets/index-prq-99Wt.js"></script>
```

```
$ grep -c -E 'type="module"|crossorigin|modulepreload' apps/app/dist/index.html
0        # grep exit=1（1 = 零命中）
```

- :18 / :35 是 head 里两颗**内联**脚本（首帧主题 + WebView 过低提示页），无 `src`，不属于"外部脚本"这一类，守卫的 `EXTERNAL_SCRIPT_TAG` 天然不匹配它们。
- :61 = 唯一一颗 `<link rel="stylesheet">`，无 `crossorigin`，路径 `./assets/…`（判据① 相对）。
- :65 = 唯一一颗经典 `<script src>`，**在 `<div id="app">`（:64）之后、`</body>` 之前**。

产物 JS 侧（判据④ 的 JS 两条 + 打包形态）：

```
$ grep -o -E "\bimport\s*\(|import\.meta" apps/app/dist/assets/index-prq-99Wt.js | wc -l
0
```

```
# 用 node 读落盘字节实测（IIFE 包裹是否真在）
wrapper 起点偏移 = 517        # `(function(){ "use strict"; …` 从这里开始
包裹内代码长度   = 599109 B
pre-wrapper 517 B = esbuild hoist 出来的 helper（4 条 var 语句 / 7 个标识符：AC xv N we ue Ue uf）
vm 里跑一遍 ⇒ 泄漏到全局的名字恰好 = 那 7 个 helper，其余 0 个
```

⇒ `format:'iife'` 真的生效（不是被 Vite 悄悄改回 `es`），"自包含"成立；但**有 7 个极短名的 helper 在包裹之外**，见 §5.3。

---

## 3. 出口条件③：CDP 复验（硬条件，原文照贴）

### 3.0 headless Edge 存活确认（TPM 拉起的进程还在，我没有新起）

```
$ curl -s http://127.0.0.1:9333/json/version
{
   "Browser": "Edg/153.0.4234.48",
   "Protocol-Version": "1.3",
   "User-Agent": "... HeadlessChrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0",
   "V8-Version": "15.3.12.7",
   ...
}
```

### 3.1 TPM 留在盘上的夹具 `E:\e5b\probe\cdp.mjs`

```
$ cd /e/CC/tomorrow-memory/apps/app && node E:/e5b/probe/cdp.mjs "file:///E:/CC/tomorrow-memory/apps/app/dist/index.html"
PROBE {"app":"记不住的，交给明天查单词查词背单词单词本学习我的","len":5658}
URL   file:///E:/CC/tomorrow-memory/apps/app/dist/index.html
LOG   {"entry":{"source":"network","level":"error","text":"Failed to load resource: the server responded with a status of 404 ()","timestamp":1790421543928.16,"url":"https://tmword.xyz/api/version","networkRequestId":"62936.11"}}
```

判绿：`app` 字段 = 首屏「记不住的，交给明天」+ 5 个 tab 名，**不再是 EMPTY / NO_APP**；`document.body.innerHTML` 长 5658 字符。控制台唯一一条错误是 `https://tmword.xyz/api/version` 的 404（在册的另一颗缺陷，允许存在）。**0 条 CORS / "blocked by" / "Cross origin requests" 字样。**

### 3.2 我自己加的复核夹具（`E:\e5b\probe\cdp2.mjs`，只读产物，⛔ 未改 cdp.mjs）

量的是"标签形状 + CSS 是否真应用 + 冻结入口 + 全局泄漏"：

```
PROBE2 {"appText":"记不住的，交给明天查单词查词背单词单词本学习我的","appChildren":1,
"scripts":["./assets/index-prq-99Wt.js"],
"links":["stylesheet=./assets/index-T4SUTEM1.css"],
"cssApplied":"453px","bodyBg":"rgba(0, 0, 0, 0)",
"globalsLeaked":["AC","xv","we","ue","Ue","uf"],"reactMounted":true,"routerPath":"/"}
URL   file:///E:/CC/tomorrow-memory/apps/app/dist/index.html
LOGCOUNT 1
LOG   {...404 https://tmword.xyz/api/version...}
CORSISH 0
```

- `scripts` 元素没有任何 `[type=module]` / `[crossorigin]` 后缀 ⇒ 浏览器侧读到的属性形状就是经典脚本。
- `cssApplied:"453px"` = `getComputedStyle(...).minHeight` 从 `min-h-dvh` 这个 Tailwind 类算出了真值 ⇒ 那颗 `<link>` **不只是存在，而是被应用了**（CSS 未被内联进 JS 的反证）。
- `reactMounted:true` = `window.__router` 与 `window.__app` 两颗冻结入口都在（§5.6 ③⑤，Java 侧要调的那两个），`routerPath:'/'`。

### 3.3 路由复核（`E:\e5b\probe\cdp3.mjs`：这 5 张屏在原 ESM 产物里全是独立 lazy chunk）

```
$ MSYS_NO_PATHCONV=1 node E:/e5b/probe/cdp3.mjs "file:///E:/CC/tomorrow-memory/apps/app/dist/index.html" "#/wordbook,#/progress,#/me,#/study,#/login"
ROUTE /            -> {"path":"","len":24,"head":"记不住的，交给明天查单词查词背单词单词本学习我的"}   (logs so far: 1)
ROUTE #/wordbook    -> {"path":"#/wordbook","len":56,"head":"单词本登录后才能看到你的单词本同一个手机号，词本和进度都会跟着走手机号登录没有账"}   (new logs: 0)
ROUTE #/progress    -> {"path":"#/progress","len":107,"head":"学习情况刷新学习情况本周新增0›今日待复习0›连续天数0›新增单词最近 30 天"}   (new logs: 0)
ROUTE #/me          -> {"path":"#/me","len":107,"head":"我的登录之后，换手机也不丢词本、学习记录和提醒会跟着账号走。登录注册先不用，继续"}   (new logs: 0)
ROUTE #/study       -> {"path":"#/study","len":63,"head":"今日复习学新词随机自测登录后开始背单词手机上的词本会自动同步，换设备也能接着背手"}   (new logs: 0)
ROUTE #/login       -> {"path":"#/login","len":123,"head":"手机号登录没有账号？注册手机上的词本会自动同步，换设备也能接着背手机号密码登录当"}   (new logs: 0)
--- ALL LOGS ---
LOG   {...404 https://tmword.xyz/api/version...}
CORSISH 0
```

⇒ 5 张二级/门禁屏全部在 `file://` 下渲染出内容，**每次切路由新增日志 0 条**（既没有新的取源，也没有新错误），`CORSISH 0`。这就是"运行时 `import()` 已经被消掉"的直接行为证据，不是推理。

（跑法提醒：MSYS 会把 `#/wordbook` 当 Windows 路径转换，第一次跑没带 `MSYS_NO_PATHCONV=1` 时 hash 被改写成 `#D:/program files/Git/wordbook`——那是**壳参数**问题，App 按 `startRouter()` 的归一逻辑 replace 回 `#/`，未白屏、未新增日志。上面贴的是带 `MSYS_NO_PATHCONV=1` 的有效跑。）

---

## 4. 出口条件④⑤：单测与类型（含一条命令修正）

### 4.1 顺带把 §0-1 的因果坐实（这是本次唯一"发现"，不是猜）

第一版只改 `format:'iife'` + `inlineDynamicImports:true` 时，构建输出是：

```
dist/index.html                   3.01 kB
dist/assets/index-lhrtubgk.js  645.01 kB │ gzip: 192.52 kB      # 没有 .css 这一行
```

`ls dist/assets` 只有 1 个文件、`grep -c "<link" dist/index.html` = 0，而 JS 里 grep 到 `document.createElement("style")` 与 `.min-h-dvh{`。第二来源 = Vite 6.4.3 源码 `node_modules/.pnpm/vite@6.4.3_.../vite/dist/node/chunks/dep-Dm0c1Wj2.js`：

- `:43441-43443` `if (this.environment.config.build.cssCodeSplit) { if (opts.format === "es" || opts.format === "cjs") { …emitFile 独立 .css… }`
- `:43469-43471`（else 分支，client）`const injectCode = "var __vite_style__ = document.createElement('style');" + "…textContent = …;document.head.appendChild(__vite_style__);" ⇒ ` 注入 JS；
- `:43491-43493` `else { chunkCSSMap.set(...) }`（`cssCodeSplit:false` 才走这里）+ `:43543-43549` 单一 CSS 资产 emit + `:36759-36776` `if (!cssCodeSplit) injectToHead(<link rel=stylesheet crossorigin href=…>)`。

⇒ 三条一起解释了"为什么必须 `cssCodeSplit:false`"，也解释了 `classicOutput` 里 stylesheet 计数守卫的必要性。加回 `cssCodeSplit:false` 后 CSS 落盘 38,631 B，且 **hash 与原 ESM 产物那颗 `index-T4SUTEM1.css` 完全同名** ⇒ CSS 内容一字未变（这是一条有用的旁证：改的只有形态）。

### 4.2 测试

```
$ cd /e/CC/tomorrow-memory && npx vitest run --root . --project "@tm/app"
 Test Files  18 passed (18)
      Tests  472 passed (472)
   Duration  16.48s
```

```
$ cd /e/CC/tomorrow-memory && npx vitest run --root packages/shared
 ✓ test/contracts.spec.ts (68 tests) 98ms
 Test Files  1 passed (1)
      Tests  68 passed (68)
```

```
$ cd /e/CC/tomorrow-memory && npx tsc --noEmit -p apps/app
（无输出）exit=0
```

**⚠ 出口条件里给的命令 `npx vitest run --root apps/app` 在本仓跑不通，且与我的改动无关**（原文照贴）：

```
$ cd /e/CC/tomorrow-memory && npx vitest run --root apps/app
 FAIL  src/data/queries/wordbook.spec.ts > …
ReferenceError: localStorage is not defined
 ❯ src/data/queries/wordbook.spec.ts:68:3
 Test Files  17 failed | 1 passed (18)
      Tests  463 failed | 9 passed (472)
```

根因：`vitest.workspace.ts:12-16`（A-18-2）写明 project 的 `root` 必须是绝对路径、各包 `test` 脚本统一带 `--root ../..`，因为**换 root 就读不到仓库根的 workspace 装配文件** ⇒ `environment:'jsdom'`（`vitest.workspace.ts:67-74` 的 `@tm/app` 那条）不生效 ⇒ node 环境下 `localStorage` 未定义。**这条决定性反证我实测了**：同一颗命令只补一个 `--environment jsdom`（不改任何文件、不碰任何用例、不加任何 skip），立刻 472 全绿：

```
$ cd /e/CC/tomorrow-memory && npx vitest run --root apps/app --environment jsdom
 Test Files  18 passed (18)
      Tests  472 passed (472)
   Start at  19:23:31
   Duration  14.54s
```

⇒ 463 条失败的**唯一**原因是那颗命令自己丢了 jsdom，与本改动无关（我的改动集里没有一个测试文件或环境装配文件）。同一时刻正规跑法（`--root . --project "@tm/app"`，等价于仓库自带的 `pnpm --filter @tm/app test`）也是 472/18。**建议 TPM 把出口条件④的命令改成 `npx vitest run --root . --project "@tm/app"`，或保留 `--root apps/app` 但补 `--environment jsdom`；⛔ 别把这条环境错读成"产物改动打坏了测试"。**

### 4.3 **用例改动清单：0 条**

- 改动的断言：无。删除的断言：无。新增的断言：无。`test.skip` / `test.fail` / `waitForTimeout`：0 处（我全程没编辑过任何 `*.spec.*`）。
- 依据（先查后改，结论是"没有可改的对象"）：
  - `grep -rn -E "dist|assets/|modulepreload|type=\\?\"module" apps packages --include="*.spec.ts(x)"` → `apps/app/test/**` 里 **0 处**提到 `dist/`、chunk 名、21 颗 assets、`type=module`；唯一沾边的一条命中是 `apps/app/test/login-screen.spec.tsx:359` 的注释"Chrome84 四禁（§5.1 / tm-app:dist-guard），两个文件一起钉"，它钉的是 **`LoginScreen.tsx` + `queries/auth.ts` 两份源码**的 `structuredClone|Object\.hasOwn|requestIdleCallback|\.at\(`（`B-01` 用例），与产物形态无关，未动。
  - 其余命中都在别的包的无关位置（`packages/agent/test/fsrs.spec.ts:5` 讲 ts-fsrs 自带 dist、`packages/server/test/db/boot-check.spec.ts:53` 讲 tsx CLI 路径、`packages/ui/test/ui.spec.tsx:704` 的"dist 侧证据见 dev 报告"是一句**不测**的说明）。
  - `vitest.workspace.ts` 未动（它不产 dist 形态断言）。

---

## 5. 新的 dist 清单、体积、以及留给 TPM 的六件事

### 5.1 产物清单与预算

```
$ ls -la apps/app/dist/assets | wc -l
5                      # = total + . + .. + 2 个文件 ⇒ 资产 2 颗（改前 21 颗：20 颗 js + 1 颗 css）

apps/app/dist/index.html                    3,047 B   (gzip -c | wc -c = 1,691 B)
apps/app/dist/assets/index-prq-99Wt.js    606,013 B   gzip -c | wc -c = 183,168 B
apps/app/dist/assets/index-T4SUTEM1.css    38,631 B   gzip -c | wc -c =   8,062 B
```

（Vite 自报 606.01 kB / gzip 184.07 kB，与 `gzip -c | wc -c` 的 183,168 B 差 ~0.9 kB，是 gzip 头/级别口径差异，两颗都记下来。）

首屏预算对照：`tools/boundaries.mjs:571` `DIST_BUDGET_BYTES = 256000`。单颗 183,168 B ≤ 256,000 B（占额 71.5%）。**但我没有跑 `boundaries.mjs`（纪律 :6 禁止），这条是我读它的正则与阈值自己算的口径，需要 TPM 亲跑认定。**

`--dist` 的"首屏 JS 引用"函数 `firstScreenJsRefs`（`tools/boundaries.mjs:582-596`）**已改成同时认经典 `<script src>`**（`classicScript` 分支 `:591`，判入 `:593`；`:579-580` 的 A-109 注释写明"真机产物是经典脚本，所以『首屏 JS』必须同时认 `<script src>`；⛔ 只认新形状＝旧形状漏判"）⇒ 我这颗 `./assets/index-prq-99Wt.js` 会被数进判据③。"解析到 0 颗首屏 JS ⇒ 按未交付判红"现在是 `:618`（我 19:0x 看到的旧版在 `:610`）。这条改动是 TPM 做的，我没碰 `tools/**`。

⛔ **TPM 第 3 次派发提到的第二条门禁改动（`app-entry-deferred-dom-ready`，说在 `:726`／registry `:1541`／self-test `:3184`）在盘上不存在**：`grep -c "app-entry-deferred-dom-ready" tools/boundaries.mjs` = **0**，`grep -n "dom-ready|readyState|app-entry"` 同样 **0 命中**（当前文件共 4,156 行；你给的三个行号都落在这条改动上但内容不是它：`:726` 是 `function scanDistFile(abs, rel)`、`:1541` 是一段 owner 优先级注释、`:3184-3188` 是 `A-106③⑤ 有产物但无 index.html → 判红` 的夹具与断言）。要么它在你的中断里没落盘，要么落的是另一份文件。我的实现**没有**为它做任何形似匹配，且我把真实形状如实报出来（不粉饰）：产物里那颗 `<script src>` **没有 `defer`**；`getElementById('app')` 确实在函数 `bootstrap()` 内部（`apps/app/src/main.tsx:158` 定义、`:171` 取值、`:172` 取不到就静默 `return`），但 `bootstrap()` 是**顶层直接调用**的（`main.tsx:180-182`，没有 `DOMContentLoaded`/`readyState` 包装）。我能保证 DOM 的**唯一机制**是把脚本物理放到 `</body>` 之前（`:133-144`）＋构建期位置守卫（`:186-192`），出口证据是 CDP 实测 `#app` 挂载成功（§3）。⛔ 我没有去改 `apps/app/src/**` 加 `DOMContentLoaded`（不在可写面），也没有加顶层 `window.__T` 之类导出（纪律禁止）。若你确认要 `defer` 那条口径，我这边是**一行**改动：`toClassicFileHtml` 的 `:123`（`moved.push(tag.replace(MODULE_TYPE_ATTR, '').replace(CROSSORIGIN_ATTR, ''))`）里再 `.replace(/^(<script\b)/i, '$1 defer')`；它会重跑构建与 CDP 复验，所以我等你点头再做。

### 5.2 R-17⑥「产物按路由分包」需要正式改判

`apps/app/src/router.tsx:32` 的 `RouteDef.load` 注释写着"懒加载（R-17⑥"产物按路由分包"，**不允许整站一次性加载**）"。当前形态下 `React.lazy` 的 12 条动态 import 全被内联 ⇒ 站点确实是"一次性加载"。行为面 `React.lazy` + `Suspense`（`router.tsx:336` / `RouteFallback`）一字未改，切换路由的观感与 `data-testid="route-fallback"` 都还在。⛔ 我没有改 `router.tsx` 的任何注释/逻辑（不在我的可写面），⛔ 也没改 R-17 的台账。这条冲突必须由 TPM 落一条 A-记（`vite.config.ts:367-373` 已就地写明理由与不可回滚性）。

### 5.3 7 个 esbuild helper 泄漏在全局（实测，非推理）

`format:'iife'` 的 Rollup 包裹确实在（偏移 517 起，见 §2），但 esbuild 的语法降级 helper 被 hoist 到包裹**之前**：`AC xv N we ue Ue uf`（4 条 `var` 语句、517 B）。这是 Vite 已知行为——`dep-Dm0c1Wj2.js:9256-9264` 只为 **lib 构建**做补救（把 helper 挪进包裹），非 lib 的 App 构建不处理。影响：`file://` 执行无碍（CDP 已证首屏与 5 张屏都渲染），但全局多了 7 个 1-2 字符的名字，理论上可被同名全局覆盖/覆盖同名全局。要清零有两条路（都超出我的面）：`build.lib` 形态改造，或再加一颗 renderChunk 插件把 :0-517 那段搬进包裹。**我选择不动，并把它记在这里**，因为它不改变任何判据的红绿。

### 5.4 两处已知的文案漂移（我没改，都在别人的面上）

- `apps/app/index.html:36-37` 内联提示脚本的注释：「…此时连 ES module 都不会执行」——产物已不是 ES module（这句的**结论**仍然成立：更旧的 WebView 连经典脚本也跑不动，提示页仍必须内联；只是"ES module"三个字过时了）。
- `apps/app/index.html:7` 注释"构建产物会改写成 `./assets/…`"仍准确，但没提"且改成经典脚本、搬到 `</body>` 前"。

### 5.5 并发编辑披露

`apps/app/vite.config.ts:187` 的 `?.` 由另一路（`04-dev-report-E5b-classic-fix1.md`，19:13）改入，不是我写的。我的全部出口数据（构建 19:18、CDP 19:19、472/68/tsc）都是在**含该行**的当前文件上跑出来的：`pnpm --filter @tm/app build` 内含 `tsc -p tsconfig.json --noEmit` 且 exit 0（§2 原文），所以那行修改与我的实现互不阻塞。

### 5.6 `dist-guard` 的 `.at` 判据：文件数 21→2 带来的固有语义变化（实测计数 + 读码）

`atApiViolations()`（`vite.config.ts:229-247`；两面旗标常量 `AT_FEATURE_GUARD :215`、`OWN_AT_METHOD :217`）的两条例外是**按文件**判的：`OWN_AT_METHOD`（同一文件里有自己的 `at(i){…}`）与 `AT_FEATURE_GUARD`（同一文件里有 `"at" in Array.prototype` 探测）。合并成单颗 JS 后，这两面旗标的作用域从"一颗 chunk"变成"整个产物"。当前真产物的实测计数：

```
ANY_AT_CALL（`.at(`）  = 4 处
ARRAY_PROTO_AT          = 1 处
OWN_AT_METHOD 命中      = true
AT_FEATURE_GUARD 命中   = true
```

⇒ 这四条 `.at(` 与那一条 `Array.prototype.at` 现在**全部落在被放行的一侧**，判据② 仍然通过（构建原文见 §2："判据①②通过：3 个产物文件"）。改前的 21 颗 chunk 也是同一套判据跑绿的（**改前逐颗的命中分布我没有测**，因为要回滚配置才能产出对照物 ⇒ 未实测）。规则本体我一字未动，`selfCheckAtRule()` 的 7 条反"永真"自检仍在构建期必跑（不通过就 throw），这里只登记"作用域随文件数变化"这件事本身。



1. **真机 Android WebView**：全程是 Windows 本机 stock Edge 153 headless + CDP。Chrome84 那档语法/API 降级我只由 esbuild target + `dist-guard` 判据② 的构建期扫描保证（它扫的是**真实落盘 JS**，通过），**没在 Chrome84 内核上跑过**，也没在 Android System WebView 上跑过。
2. **APK 未重打**：按纪律没碰 `build-apk.sh` / keystore / `*.apk`。我只读了 `build-apk.sh:152-159`（`cp -r "$DIST"/. build/assets/` + 只校验 `index.html` 存在）⇒ 新增的 `index-prq-99Wt.js` / 消失的 20 颗旧 chunk 都不需要脚本改动，这是**读码结论**，不是打包实测。
3. **Java 未编译**：`javac` 在（`/d/program files/java/jdk/bin/javac`），但本机没有可发现的 Android SDK（`ANDROID_HOME`/`ANDROID_SDK_ROOT` 均空，常见路径无 `android.jar`）⇒ `s.setAllowFileAccess(true)` 这行的**编译期正确性未实测**，依据只有"与 `mobile-agenda/…/MainActivity.java:53` 同形且那份壳在用户手机上跑起来过"。
4. **Vite dev server**：`classicOutput` 带 `apply:'build'`（`vite.config.ts:157`），dev 形态理论上完全不变，但**我没起过 dev server 复验**。
5. `mobile-memory/tests/*` 未跑（该目录 `type:commonjs`、其测试与本改动的接口面是 assets 文件名，不在我的面上）。
6. `tools/boundaries.mjs` 未跑（纪律明令）。

---

## 7. 纪律自查

- **零 git 写操作**：全程只执行过 `git diff --stat` / `git status --short`（只读）。无 add/commit/stash/checkout/restore/reset。
- **根 `data.db` 三件套只读**：开工与收工各 `ls -la` 一次，mtime 与大小**逐字未变**：
  `data.db 253952 Sep 18 04:05` / `data.db-shm 32768 Sep 17 00:53` / `data.db-wal 424392 Sep 18 04:09`。全程没有任何进程打开过它。
- **未跑 `tools/boundaries.mjs`**，未改 `tools/**`、`.delivery/**` 主文档、`mobile-memory/build-apk.sh`、`keystore*`、任何 `*.apk`。
- **未放松任何断言**：0 条用例被编辑（§4.3），无 skip/fail/waitForTimeout。
- **中间文件全在 ASCII 目录 `E:\e5b\probe\`**（`cdp2.mjs` / `cdp3.mjs` / `report-cdp*.txt` / `final-cdp*.txt` / `build-final.txt`）；一次 `--minify false` 的临时产物建在 `E:\e5b\tmp-nomin` 并已删除，未落在仓库内。全仓 `pnpm --filter @tm/app build` 只重写 `apps/app/dist/**`。

---

## 8. 第 3 次派发：TPM 五问直答 + 最终态原文（全部在最终文件状态上重跑）

| # | TPM 的问题 | 状态 | 落点（`file:line`） |
| --- | --- | --- | --- |
| 1 | `mobile-memory/.../MainActivity.java` 的 `s.setAllowFileAccess(true);` | **已落盘**（19:06 前后写入，之后未再动过该文件；TPM 说"别动它"，我没动） | `mobile-memory/src/com/tomorrow/memory/MainActivity.java:31` |
| 2 | `vite.config.ts` 出经典脚本形态（`type=module`/`crossorigin`/`modulepreload` 0 命中 + DOM 就绪） | **是** | 判据④ 词表 `apps/app/vite.config.ts:75-79`；改写纯函数 `:106-151`；插件 + 三道守卫 `:153-200`（外部 script 恰 1 颗 `:174-178`、stylesheet 恰 1 颗 `:179-185`、脚本必须在 `#app` 之后 `:186-192`）；**DOM 就绪靠的是"搬位置"而不是"等事件"**：`:117-129` 把 `<head>` 里那颗外部 `<script src>` 整行删掉（顺带摘 `type=module`/`crossorigin`），`:133-144` 把它重新插到 `</body>` 之前 ⇒ 执行时 `#app` 已在文档里。落盘证据：`apps/app/dist/index.html:64` 是 `<div id="app">`、`:65` 才是 `<script src="./assets/index-prq-99Wt.js">`，且 `:186-192` 的位置守卫在构建期硬校验（不成立 = 构建失败），不是靠 `<link rel=stylesheet>` 的注入顺序"推断"出来的 |
| 3 | 单文件 IIFE（`format:'iife'` + `inlineDynamicImports:true`，React.lazy 全内联） | **是** | `apps/app/vite.config.ts:376-377`（配置）／`:367-373`（为什么不能再分包）；实测产物 `import(` 0 命中、`import.meta` 0 命中、`(function(){` 包裹在偏移 517 起（§2 末段） |
| 4 | `cssCodeSplit:false` 配套 | **是**（而且是必需：不加就没有 CSS，实测 0 个 `.css` + head 0 颗 `<link>`） | `apps/app/vite.config.ts:364`（配置行），理由与 Vite 源码行号在 `:357-363`；因果原文见本报告 §4.1 |
| 5 | `assetFileNames` 把 CSS 命名钉回 `assets/index-[hash].css` | **是** | `apps/app/vite.config.ts:382-383`（函数体），命名依据注释 `:378-381`；落盘证据 `apps/app/dist/assets/index-T4SUTEM1.css`（`.css` 只有这一颗，见 §8.1 的 `ls`） |

### 8.1 出口检查（最终态重跑，原文照贴）

```
$ cd /e/CC/tomorrow-memory && grep -n -E 'type="module"|crossorigin|modulepreload' apps/app/dist/index.html
（无输出）
grep-exit=1 (1 = 零命中)

$ ls -la apps/app/dist/assets/
total 632
drwxr-xr-x 1 曹怡明 197121      0 Sep 26 19:18 ./
drwxr-xr-x 1 曹怡明 197121      0 Sep 26 19:18 ../
-rw-r--r-- 1 曹怡明 197121  38631 Sep 26 19:18 index-T4SUTEM1.css
-rw-r--r-- 1 曹怡明 197121 606013 Sep 26 19:18 index-prq-99Wt.js
文件数 = 2

$ grep -n -E "<script|<link" apps/app/dist/index.html
18:    <script>
35:    <script>
61:    <link rel="stylesheet" href="./assets/index-T4SUTEM1.css">
65:  <script src="./assets/index-prq-99Wt.js"></script>
```

`node E:/e5b/probe/cdp.mjs`（TPM 的夹具，Edge 153 headless / 9333，本轮 9333 仍在，无需重拉 profile）：

```
$ cd /e/CC/tomorrow-memory/apps/app && node E:/e5b/probe/cdp.mjs "file:///E:/CC/tomorrow-memory/apps/app/dist/index.html"
PROBE {"app":"记不住的，交给明天查单词查词背单词单词本学习我的","len":5658}
URL   file:///E:/CC/tomorrow-memory/apps/app/dist/index.html
LOG   {"entry":{"source":"network","level":"error","text":"Failed to load resource: the server responded with a status of 404 ()","timestamp":1790421880163.051,"url":"https://tmword.xyz/api/version","networkRequestId":"42056.11"}}
```

⇒ `#app` 已挂出（不是 EMPTY / NO_APP），唯一一条控制台错误是在册的 `api/version` 404，**0 条 CORS 类**。

### 8.2 T2 那一行的现状（我复核后确认已在位）

```
$ grep -n "setAllowFileAccess" mobile-memory/src/com/tomorrow/memory/MainActivity.java mobile-agenda/src/com/tomorrow/agenda/MainActivity.java
mobile-memory/src/com/tomorrow/memory/MainActivity.java:31:        s.setAllowFileAccess(true);
mobile-agenda/src/com/tomorrow/agenda/MainActivity.java:53:        s.setAllowFileAccess(true);
$ git diff --stat -- mobile-memory/src/com/tomorrow/memory/MainActivity.java
 mobile-memory/src/com/tomorrow/memory/MainActivity.java | 1 +
```

### 8.3 本轮我实际执行过的写操作（全清单）

1. `apps/app/vite.config.ts`（T1，§1.1 逐处）；
2. `mobile-memory/src/com/tomorrow/memory/MainActivity.java:31`（T2，+1 行，此后未再触碰）；
3. `apps/app/dist/**`（构建再生，出口条件①要求）；
4. 本报告 `.delivery/04-dev-report-E5b-classic.md`；
5. 仓库外 ASCII scratch：`E:\e5b\probe\cdp2.mjs`、`E:\e5b\probe\cdp3.mjs` 与若干 `*.txt` 原始输出；`E:\e5b\tmp-nomin`（`--minify false` 对照产物）已删除。

未跑 `tools/boundaries.mjs`；未改 `tools/**`（`boundaries.mjs` 的 `firstScreenJsRefs` 改判与 `app-entry-deferred-dom-ready` 那条新增断言都是 TPM 自己做的，我在 19:05 的 mtime 上读到过前者，后者在当前文件的磁盘版本里**搜不到**（`grep -n "app-entry|deferred|dom-ready|DEFER" tools/boundaries.mjs` → 0 命中）⇒ 若那条断言确实要落，请 TPM 确认它是否随中断丢失。**我没有为了这条断言改过一次实现**：我的方案本来就是"脚本搬到 `#app` 之后"，不依赖 `defer`。
