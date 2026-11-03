# 开发报告 · T-04（`@tm/ui` 底座：设计 token / primitives / UiHost / 不 FOUC）

> 角色：前端开发（角色卡 `roles/dev.md`）。任务行：`02-tech-design.md` §10.2 批次1 **T-04**。
> 上游输入：`03-ui-spec.md` §1.1/§1.2/§1.2.1/§1.3/§1.12.1-4/§2.2/§5.3、`04-adjudications.md` A-1/A-3/A-4/A-5/A-9/A-10。
> **本轮是接力**：盘上已有上一轮的 T-04 成果（`packages/ui/**` 全套 + web 侧改引）。本报告同时标注「上一轮已完成」与「本轮（接力）改动」。

## 0. 接手时的真实缺口（先跑再猜，结论与交接说明有出入）

| 交接说明 | 实测 | 差异 |
|---|---|---|
| `pnpm --filter @tm/ui typecheck` 绿 | ✅ 绿 | 一致 |
| 「`apps/web` 已改，多为 import 改指 `@tm/ui`」 | ⚠️ `pnpm --filter @tm/web build` **红**：`Module not found: Can't resolve './primitives/card.js'`（+ `./host.js`、`button/input/textarea.js` 共 5 条，webpack 不解析 `.js`→`.tsx`） | **build 不绿**，判据③ 当时不成立 → 本轮修（见 D-1） |
| 缺 `04-dev-report-T-04.md` | ✅ 确实缺（本文件即补） | — |
| 判据是否齐全未验证 | ⚠️ `packages/ui/test/ui.spec.tsx` 存在但 **6 条断言红**（断言自身写错：按行锚定 CSS 声明、用文本正则查 `hsl(var(--x))`、把注释当命中面）；且 `pnpm --filter @tm/ui test` 在该包 cwd 下报 `No projects matched` | 本轮修（见 §4/§7） |
| — | ⚠️ 上一轮的文件在 4 个门禁里制造了**真实红**：`colors-no-hardcode`（注释里写了 `hsl(`）、`css-important-budget`（注释里写了提权声明原文，7>1）、`focus-ring-not-hidden`（注释里写了 `outline:none`）、`copy-legacy-zero`（注释里写了 R-25 禁词「云端」）、§8.2-15 主题键 grep = 4 处（>2） | 本轮全部在**我自己的文件里**清零，未动规则、未加例外（见 §4 表 E-8） |

## 1. 完成清单

| 任务/判据 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| T-04 底座：token 变量层 | done | 🆕`packages/ui/src/styles/tokens.css`(94L) | 逐条比对 §1.12.1/§1.1/§1.3/§1.2/§1.2.1，**无一个自造 hex/HSL**；新增 §1.2.1 的 `--heat-empty/--heat-future`、§1.2 的 `--brand-50…950`、§2.2 的 `--max-w-*`（规范点名要求）。本轮只改注释（去门禁命中面） |
| T-04 底座：Tailwind 映射层 | done | 🆕`packages/ui/src/tailwind-preset.ts`(268L) | §1.12.2 语义类齐（面/文字/描边/环/圆角/间距/z 层/时长/缓动/字号/`tap-target`/`tnum`/`decor-breath`）。本轮 `export const tokenColor`（给测试反推形状，见 E-9） |
| primitives 13+1 | done | 🆕`packages/ui/src/primitives/*.tsx`（14 个，784L） | 12 个自 `apps/web/src/components/ui/*` 迁入；`tabs`/`switch` 无 web 原件（§10.2 清单点名）；`textarea` 是原件第 13 个。类名全部换成 §1.12.2 语义类。`slider` 未做（见 L-3） |
| UiHost 注入面 | done | 🆕`packages/ui/src/host.tsx`(121L) | `useHost/UiHostProvider/fallbackHost/normalizeToastOptions/toastDurationMs/cn`；未挂 Provider 不抛错（§3.1） |
| hooks | done | 🆕`packages/ui/src/hooks/{use-theme-toggle,use-speak,use-recent-searches}.ts` | 主题只做「切换+落盘」，首帧交内联脚本（§5.3-3） |
| 根出口 + 批次2 预留 | done | 🆕`packages/ui/src/index.ts` | 已预留 `export * from './patterns/index.js'` 与 `'./auth/index.js'`（§10.3/§10.4 第 4 行）；`patterns/index.ts`、`auth/index.ts` 是**只有 `export {};` 的占位**，未实现任何 T-05/T-13 组件 → 有测试钉住（判据③ 第 4 条） |
| web 样式入口 | done | ✏️`apps/web/src/app/globals.css` | 只剩 `@import '@tm/ui/styles/tokens.css'` + 3 个 `@tailwind` + §1.12.3 白名单内 2 条 `@apply` |
| 不 FOUC（首帧脚本） | done（真机部分未测，见 L-1） | ✏️`apps/web/src/app/layout.tsx`、🗑️`theme-provider.tsx` | 内联同步脚本在 `<head>`，`<html suppressHydrationWarning>` |
| web 构建配置 | done | ✏️`apps/web/next.config.ts`、✏️`apps/web/tailwind.config.ts`、✏️`apps/web/package.json` | `transpilePackages` + 本轮新增 webpack `extensionAlias`（D-1）；tailwind.config 只挂 preset；package.json 加 `@tm/ui`（A-4 授权 T-04 建基线） |
| Web 宿主实现 | done | 🆕`apps/web/src/lib/host.tsx` | 全站唯一 `from 'sonner'` 处（§3.11.1） |
| 自门禁 spec | done（本轮重写失效断言） | 🆕`packages/ui/test/ui.spec.tsx`(645L，38 例) | 判据①②③④ + 本包 hygiene + UiHost + 构建产物 HTML 静态断言 |

## 2. 判据①~④逐条证据

### 判据① `globals.css` 内不含任何十六进制品牌色（grep 0 命中）

```
$ node tools/boundaries.mjs --tokens            （cursor=T-02 与 cursor=T-04 两个游标各跑一次，结论同）
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
2/2 条通过，全绿
```
同源第二证据（我的 spec）：`globals.css 只 @import token 层…（判据①）` → 断言 `not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/)`、`not.toMatch(/262 83%/)`、无 `--brand/--surface/--ink/--hair` 定义、宿主有效声明 ≤10 行（§1.12.3）→ 通过。
A-10 表第 2 行的 `legacy-web-globals-purple-retired` / `legacy-web-tailwind-config-colors` / `legacy-web-tailwind-config-purple` 三条（`expires_after: T-04`）在 cursor=T-04 下不再计红（原命中面已清零，只剩 stale 提示）。

### 判据② `--tokens`：`tokens.css` 是 `--brand/--surface/--ink/--hair` 唯一定义处

- 门禁：上面 `tokens-single-source OK`。
- 我的 spec 另钉 4 条：① `:root`/`.dark` 两块各含这四个 token 且**块内无重复声明**；② 全仓（`packages/ui/src` + `apps/web/src`）第二处定义 = 空集；③ **逐条值等于规范**——浅色 18 条 =§1.1、深色 18 条 =§1.3、图表/热力图 14 条 =§1.2.1 两列、品牌 ramp 11 级 =§1.2 且深色不另出 ramp、装饰层 3 端点 =§1.12.1、尺度/列宽 =§1.7/§1.2/§2.2（`420/680/900/1120px`）；④ 映射层形状由导出的 `tokenColor` 反推：所有颜色项必须是 `tokenColor('--x')` 或 `var('--x')`，且**引用的每个 token 都在 tokens.css 里定义**（无悬空 var）→ 38 例全绿。

### 判据③ Web `build` 绿且 `components/ui/*` 已删

```
$ pnpm --filter @tm/web build
 ✓ Compiled successfully in 3.5s
 ✓ Generating static pages (209/209)
○ /  /_not-found  /admin  /assess  /chat  /profile  /report  /study     ● /word/[word]（201 条 SSG 路径）
+ First Load JS shared by all  103 kB
（本轮接手时此处为 RED：Module not found ./primitives/{card,button,input,textarea}.js 与 ./host.js —— 由 D-1 修复）
```
删除证据（只读 git）：`git status --porcelain -- apps/web` → **12 个 `D apps/web/src/components/ui/*.tsx` + 1 个 `D apps/web/src/components/theme-provider.tsx`**；目录 `apps/web/src/components/ui/` 已不存在（`existsSync` 断言）。
引用侧证据：spec 断言 `apps/web/src` 内 `@/components/ui/*`、`@/components/theme-provider` 的 import 命中 = 空集。

### 判据④ 暗色首帧不闪白

> **Playwright 真机验证未执行。原因：本机/仓库根本没有 Playwright —— `node_modules` 无 `playwright/@playwright/test`、`node_modules/.bin` 无 `playwright`、`%LOCALAPPDATA%/ms-playwright` 不存在、`apps/web/e2e/` 目录未建**（T-12 起才建 e2e，且 `02-tech-design` §10.1 批次1 出口不含 e2e）。**未伪造任何输出。** 真机 `page.goto` + 首帧截图/`toHaveClass('dark')` 断言 → **交 T-22/T-23 补测**（并需在 T-01 的根 package.json 里加 playwright 依赖，属 A-4 的 T-01 独占面）。

替代证据两条，均已自动化：

1. **构建产物 HTML 静态断言**（`next build` 后跑，未构建时整块 skipIf 不算红）：`apps/web/.next/server/app/{index,study,profile,report}.html` 四条全绿 —— 内联主题脚本位于 `<head>` 内、早于 `<body>` 与 `</head>`，标签形态是 `<script>`（无 `src`/`defer`/`async`），串内含 `localStorage.getItem` / `prefers-color-scheme: dark` / `classList.toggle('dark'` / `colorScheme`。
   实测 `index.html` 偏移：`<head>`@62 → CSS `<link>`@197 → Next 引导 JS@399 → **主题脚本@1581** → `<body>`@1967。样式表与引导 JS 在本脚本之前，但样式表只挡渲染、不挡内联脚本执行，`<body>` 尚未解析 → 无「先白后暗」帧。此事实已写进测试注释，供 T-22 真机复核时对齐。
2. **jsdom 用例**（6 例）：把 `layout.tsx` 的 `THEME_INIT_SCRIPT` **原文**取出来在 jsdom 执行（不在测试里抄第二份逻辑），断言 显式dark / 显式light / system+系统深 / system+系统浅 / 无记录→system / 脏值→system 六种输入下 `<html>` 当场带 `.dark` 与 `color-scheme`，且与 `applyTheme()` 逐例同结果、切换只改类+落盘不重载。
   另钉 §5.3-2：全仓 `classList.*('dark'` 只允许出现 1 次且必须在 `THEME_INIT_SCRIPT` 串里（`app/layout.tsx` 之外的 web 文件 0 命中）；`ThemeProvider` 字样 0 命中。

## 3. 文件清单（迁入 / 删除 / 新建 / 修改）

- **迁入**（12，`apps/web/src/components/ui/*` → `packages/ui/src/primitives/*`，类名换语义类）：`avatar badge button card dialog input label progress scroll-area separator skeleton textarea`。
- **新建 primitives**（2，无 web 原件）：`tabs switch`。
- **删除**（13）：`apps/web/src/components/ui/{avatar,badge,button,card,dialog,input,label,progress,scroll-area,separator,skeleton,textarea}.tsx`、`apps/web/src/components/theme-provider.tsx`。
- **新建 `packages/ui`**：`package.json`、`tsconfig.json`、`src/index.ts`、`src/host.tsx`、`src/tailwind-preset.ts`、`src/styles/tokens.css`、`src/primitives/`(14)、`src/hooks/`(3)、`src/patterns/index.ts`(占位)、`src/auth/index.ts`(占位)、`test/ui.spec.tsx`。
- **新建 web**：`apps/web/src/lib/host.tsx`。
- **修改 web**：`src/app/globals.css`、`src/app/layout.tsx`、`tailwind.config.ts`、`next.config.ts`、`package.json`；**import-only** 改引 13 个文件 = §10.4 第 1 行登记的 6 个页面（`(user)/{page,study,wordbook?/profile,report,assess,chat}`）+ 越界的 7 个（`app/admin/page.tsx`、`app/error.tsx`、`components/{header,login-dialog,flashcard,word-lookup,wordbook-sidebar}.tsx`）→ 见 X-1。

## 4. 自检与冒烟（全部为**真实输出**，2026-09-19 本机 Windows）

| # | 命令或操作 | 结果 |
|---|---|---|
| E-1 | `pnpm --filter @tm/ui typecheck` | ✅ `$ tsc -p tsconfig.json --noEmit`（无输出，exit 0） |
| E-2 | `pnpm --filter @tm/web build` | ✅ `✓ Compiled successfully in 3.5s` / `✓ Generating static pages (209/209)`（接手时 RED，D-1 修复） |
| E-3 | `node tools/boundaries.mjs --tokens` | ✅ `2/2 条通过，全绿` |
| E-4 | **§10.2 T-04 冒烟三连** `typecheck && build && --tokens` | ✅ 全绿（E-1+E-2+E-3） |
| E-5 | `pnpm --filter @tm/ui test` | ✅ `Test Files 1 passed (1) / Tests 38 passed (38)`（接手时 `No projects matched the filter "@tm/ui"`，X-3 修复） |
| E-6 | `pnpm -r typecheck` | ✅ `packages/{shared,ui,agent,server} / apps/{web,app} typecheck: Done` |
| E-7 | `pnpm test`（根） | ✅ `Test Files 4 passed (4) / Tests 121 passed (121)` → **A-5 要求「T-03 交付后 pnpm test 转绿」现已成立** |
| E-8 | `pnpm depcruise` | ✅ `✔ no dependency violations found (246 modules, 478 dependencies cruised)` |
| E-9 | `node tools/boundaries.mjs --all`（19 条） | ✅ `19/19 条通过，全绿`（含 `--colors` 6 条、`--copy`、`--ui-io`、`--shared-pure`、`--versions`、`--routes`；cursor=T-02 与 TM_TASK=T-04 各跑一次同绿） |
| E-10 | `node tools/boundaries.mjs --check-ownership --task T-04 --diff-file <逐文件 git diff> --files <26 个>` | ⚠️ 见 X-1/X-2：6 NOTE「归属表无条目」+ 1 条 RED（`study/page.tsx` 多行 import 的续行 `} from '@tm/ui';` 被按「非 import 行」计）；6 个页面里 5 个单独 patch 判绿，合并 patch 时 6 个都报（工具把后一个文件的 `--- a/...` 头误挂到前一个文件）。**未动 `tools/**`** |
| E-11 | `pnpm lint`（根 `eslint .`） | ❌ `92 errors`，其中 **88 条在 `tools/fixtures/selftest/**`（T-02 的门禁 fixture 未被 tsconfig 收录 → Parsing error）**、`tools/boundaries.mjs` 5 条 + `tools/ddl-parity.mjs` 1 条 + `packages/server/test/db/migrations.spec.ts` 1 条（均**非我改动面**）；**属于我的 2 条**：`packages/ui/test/ui.spec.tsx:18,19` `node:fs`/`node:path` 被 `no-restricted-imports(ui-no-io)` 禁 → 见 X-2。`lint` 不在 §10.1 批次1 出口门禁内 |
| E-12 | 判据④真机（Playwright） | ⛔ **未执行**：仓库无 playwright 依赖与浏览器内核（见 §2 判据④）。已用 E-5 的 8 条替代断言覆盖机制，未伪造任何输出 |
| E-13 | **报告落盘后复跑**（因 T-02 并行改 `tools/boundaries.mjs`）：`--tokens` / `--all` / `@tm/ui typecheck` / `@tm/ui test` / `@tm/web build` | ✅ 2026-09-19 15:34 复跑：`--tokens 2/2 全绿`、`--all 19/19 全绿`、`tsc` 干净、`38 passed`、`✓ Compiled successfully in 4.2s`。**未出现任何不属于我改动面的新红**，故无需按「并行红」另记 |

## 5. 越界申请

- **X-1（已发生的 import-only 改引，请求追认）**：`apps/web/src/app/admin/page.tsx`、`apps/web/src/app/error.tsx`、`apps/web/src/components/{header,login-dialog,flashcard,word-lookup,wordbook-sidebar}.tsx` 各只改了 `import` 行（`@/components/ui/*`、`@/components/theme-provider` → `@tm/ui`；`git diff -U0` 逐行核对：无任何非 import 行变更）。
  **必要性**：§10.2 T-04 强制「本任务内删除 `components/ui/*` 与 `theme-provider.tsx`」，而引用它们的**不止** §10.4 第 1 行登记的 6 个页面（共 13 个引用点文件）；不改这 7 个文件则 `pnpm --filter @tm/web build` 必红 → 判据③ 不可能成立。
  **请求**：把 §10.4 第 1 行的豁免面从「6 个 `(user)` 页面」扩为「**所有引用被删原件的文件，且只允许 import 行**」，并给 `tools/ownership.json` 补条目（该文件属 T-02/T-01，我未动）。
- **X-2（请求裁决，我未自我豁免）**：`eslint.config.js` 的 `no-restricted-imports(ui-no-io)` 作用面是 `packages/ui/**/*.ts(x)`，**含 `test/**`**；而 §10.2 T-04 点名交付 `packages/ui/test/ui.spec.tsx`，静态判据（读 `globals.css`/`layout.tsx`/`.next` 产物）必须 `node:fs`+`node:path`。`.dependency-cruiser.cjs` 的 `ui-no-io` **不禁 `node:*`**（禁 axios/node-fetch/got/superagent/next/@trpc/server/agent），所以 `pnpm depcruise` 绿、`eslint` 红 —— 两套工具同 ID 不同口径。
  **我没有加 `eslint-disable`、没有拼串绕扫描、没有动 `tools/**` 或 `eslint.config.js`（A-4：T-01 独占）**；请求 T-01 把该 rule 的 `files` 改为不含 `packages/ui/test/**`（或给 `ui.spec.tsx` 单开 allowlist）。当前状态：`pnpm lint` 上 T-04 贡献 2 条红。
- **X-3（我改了自己包的 test 脚本）**：`packages/ui/package.json: "test": "pnpm -w exec vitest run --project @tm/ui"`。原因：vitest 把 workspace project 的 `root: './packages/ui'` 按 **CLI cwd** 解析，`pnpm --filter @tm/ui test` 在包目录跑会 `No projects matched`（原脚本）或「找到 project 但 0 test files」（`--root ../..`）。A-4 授权 T-04 建 `packages/ui/package.json` 基线，未新建 `vitest.config.ts`（遵守 vitest.workspace.ts 的 S14 注释）。**这条直接决定 T-05/T-13 的冒烟命令能否跑**，请 TPM 确认口径。
- **X-4（他人面，未动）**：`apps/web/tsconfig.json` **未修改**。若要把 `packages/ui/test/**` 排除出 web 的 tsc 项目或加 `include`，需越界，请 T-01/T-12 处理（目前不需要：`pnpm -r typecheck` 全绿）。

## 6. 契约偏差

- **D-1（本轮修复 build）**：`apps/web/next.config.ts` 在 §10.2 的 T-04 行只被授权写 `transpilePackages:['@tm/ui']`，我**额外加了一条 webpack 钩子**：`config.resolve.extensionAlias = { '.js': ['.tsx','.ts','.js'], '.mjs': ['.mts','.mjs'] }`。原因：架构 §3.3 与 §10.3 都把源码包内部说明符定成 `./x.js`（T-05 的 `export * from './patterns/index.js'` 也依赖它），tsc 能解析、webpack 默认不能。未改依赖、未改规则、`reactStrictMode` 等原样。**下游注意**：`apps/app`（T-14）若走 Vite 可能同样需要 extension 别名；Turbopack 原生支持。
- **D-2（applyTheme 落点）**：UI §5.3-3 写「在 `@tm/ui/theme/apply.ts` 共享实现」。实际实现为 `packages/ui/src/hooks/use-theme-toggle.ts` 导出 `applyTheme/readStoredTheme/systemPrefersDark`，并经根出口给两端；**未建 `theme/` 目录**（同一函数、单一声明点，`@tm/ui/patterns/*`、`@tm/ui/auth/*` 的子路径导出仍留给 T-05/T-13）。T-14 若坚持 §5.3-3 的路径，请裁决后我加薄壳 re-export（不产生第二份逻辑）。
- **D-3（`theme-color` meta 未写）**：UI §2.4 要两条带 `media` 的 `<meta name="theme-color">`，值即 §1.3 的 `--bg`；但 §1.12.4 规定 hex 只允许出现在 3 个文件里，且 Next 的 `Viewport.themeColor` 不支持 `media` 字段 → **本期不写**，已在 `apps/web/src/app/layout.tsx:12-18` 注释登记同一口径。请 TPM 裁决（要么给 tokens 增加 `--theme-color-*` 由宿主注入，要么列入 §1.12.4 例外）。
- **D-4（Badge 旧变体名保留为别名）**：`preset` 里 `border/input/ring/background/foreground/card/popover/primary/secondary/destructive/muted/accent` 一组**纯 var() 转发别名**（不含任何新颜色值），用于让 T-12/T-15/T-16 整页重写前的存量 shadcn 类名「换 token 不换渲染」。批次3/4 收口后整块删除 → 见 L-2。
- **无新增依赖**（`packages/ui` 依赖 = §10.2 迁入原件所需 Radix + cva/clsx/tailwind-merge + `@tm/shared`；React 版本走 workspace 统一份，A-3；未写 `pnpm.overrides`，A-1）。

## 7. 已知限制与遗留项（诚实列出）

- **L-1 判据④真机未测**：Playwright 缺位（E-12）。**T-22/T-23 必须补**：`prefers-color-scheme: dark` + `localStorage['tm:theme']='dark'` 下 `page.goto('/')` 首帧断言 `html.dark`，并按 §5.3-5 检查首帧根元素背景 = `--bg` 深色值 `#0c1412`（不得出现 `#ffffff`/`#f6f8f7`）。注意 F-2：CSP 的 `'unsafe-inline'` 是这条判据的**前提**，本期不许收紧。
- **L-2 色值散落只剩 4 个文件，但责任人存疑**：`apps/web/src/components/charts/{forgetting-bar,growth-line,heatmap,review-line}-chart.tsx` 仍有 5 处 hex/`rgba`（其中 2 处是退役紫 `#8b5cf6`/`#6d28d9`）。它们**不在** T-04 可写清单内（§10.4 第 1 行只给 import 行）。`tools/exceptions.json` 的 `legacy-web-charts-colors`/`legacy-web-charts-purple` 由 T-02 写为 `owner=T-12, expires_after=T-16` 并留了「若 TPM 认为该按 A-10 咬 T-04，把 expires_after 改回 T-04」的话；我的 spec 已把这 4 个文件钉成**集合相等**（新增第 5 个文件即红）。**请裁决归属**（A-10 表第 2 行 vs exceptions.json 条目不一致）。
- **L-3 `primitives/slider` 缺失**：UI §1.12.2 末行 + §3.8.3（每日目标）要求 `@tm/ui/primitives/slider`（Radix），但 §10.2 T-04 的 13 个清单里没有它，且需要新增 `@radix-ui/react-slider` 依赖 → 按「不引入技术设计之外的新依赖/先仲裁」未做。建议归 T-05（patterns 同批）或 T-15（首个消费者 `profile/goal-setting`）。
- **L-4 `patterns/`、`auth/` 是空占位**：`index.ts` 各 5 行（`export {};`），目录内无其它文件（有测试钉住）。`@tm/ui/patterns/*`、`@tm/ui/auth/*` 的子路径导出已在 package.json `exports` 预留。
- **L-5 `--check-ownership` 的 import 行判定不认多行 import 续行**（E-10）。属工具面（T-02 正在并行改 `tools/boundaries.mjs`），**我没替它修**；若该 agent 落地后重跑仍红，请以其结论为准。
- **L-6 存量别名 token 与旧类名**：`header.tsx` 等仍以 `{ theme, toggle }` 解构 → `@tm/ui` 导出了 `useTheme = useThemeToggle` 兼容名（§3.11 收口后可删）。
- **L-7 未做（本就不属 T-04）**：任何页面逻辑、i18n、App 侧（`apps/app/index.html` 的首帧脚本 + tokens 内联 = T-14）、e2e 目录、`slider`、`ConfirmSheet` 等 patterns。

## 8. 给测试的提示

1. **重点测判据④真机**（L-1）与 375/412/320 三档下 primitives 的语义类落地（`bg-surface/border-hair/text-ink` 在 `--tokens` 全绿前提下仍可能因 content 扫描漏类而掉样式）。
2. `packages/ui` 的 SSR 面已在 jsdom/`renderToStaticMarkup` 下测；**没测真实浏览器水合**（`suppressHydrationWarning` 只在 `<html>` 一处，任何新增的首帧差异都会静默吞掉 hydration warning → 建议 QA 走查 `<html>` 的 class 唯一性）。
3. 词表门禁的口径提醒：`boundaries --colors/--copy` 扫的是**含注释的源码文本**，写注释时别把禁词/禁串（提权声明原文、`outline:none`、`hsl(`、`rgb(`、R-25 内部术语、主题键字面量）原样抄进 `packages/ui/**` 与 `apps/web/**` —— 本轮清了 5 处这类红（§0 表最后一行）。
4. 改 token 只准改 `packages/ui/src/styles/tokens.css`；`globals.css`/宿主覆写超 §1.12.3 白名单会被 spec 的 ≤10 行断言拦住。
