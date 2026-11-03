# T-12 开发报告 —— Web 外壳与极简查词首页（移动导航 / 主题 / 装饰层）· 收口轮（finish-only）

- 任务：§10.2 批次3 **T-12**（覆盖 R-07 / R-08 / R-10 / R-22 / R-23② 的外壳层）
- 角色：前端开发（角色卡 `roles/dev.md`）
- 轮次：**收口轮**。按 **A-29**：实现面已基本落地（`page.tsx` 47 行、`components/home/*` 5 件、`mobile-nav.tsx`、`lib/{nav,hooks/use-lookup,api/lookup-stream}`、`e2e/home.spec.ts` 均在盘），本轮**不重写已在盘且能跑的代码**，只做「补完 + 冒烟重跑 + 判据逐条取证 + 出报告」。
- 日期：2026-09-19

---

## 0. 结论一句话

**判据 ①~⑤ 全部闭合**（每条有「具名测试 / 命令输出 / 静态 grep」三类可复核证据之一，见 §2）。
本轮真实修复了两处硬缺陷：**① 断点用错（`lg`=1024px 应为 `md`=768px，导致 768–1023px 区间既无顶栏主导航又有底部 tab，同时违反 R-08① 与 R-08⑥）；② §2.4-② 键盘弹起收起底 tab 的逻辑整块缺失（判据②「100dvh 不遮输入框」无实现）**。
门禁：`--copy` 全绿、`--ui-io` 全绿、`--check-ownership --task T-12` 对 17 个文件**无越界**、13 个 T-12 文件 `eslint` **0 输出**。
**`pnpm --filter @tm/web build` 仍红**，但红点 100% 在禁触面：全量 `tsc` 6 条错误 = 5 条 `packages/server/**`（T-07/T-11）+ 1 条 `apps/web/src/app/(user)/profile/page.tsx:92`（T-15），**T-12 文件 0 条**；webpack 阶段本身 `✓ Compiled successfully`（见 §1.1 / §1.2）。

**`word-lookup.tsx` 未删除**，`word/[word]/page.tsx` 保持 **0 diff** —— 这是 A-29 第 2 条明示的合法路径（「patterns 里确实没有对应实现 → 不许在 T-12 里新写业务组件，改为保留该文件并在报告里登记移交 T-15；**登记即合法，硬凑即违规**」），论证与两块具体缺口见 §4。

---

## 1. 冒烟（原始输出，一字未改）

### 1.1 `pnpm --filter @tm/web build` —— **红（红点不在 T-12）**

```
$ next build
   ▲ Next.js 15.5.24

   Creating an optimized production build ...
 ✓ Compiled successfully in 3.6s
   Linting and checking validity of types ...

 ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config
Failed to compile.

./src/app/(user)/profile/page.tsx:92:20
Type error: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.

  90 |     if (profile.data) {
  91 |       setNickname(profile.data.nickname);
> 92 |       setDailyGoal(profile.data.dailyGoal);
     |                    ^
  93 |       setAvatar(profile.data.avatar);
  94 |     }
  95 |   }, [profile.data]);
Next.js build worker exited with code: 1 and signal: null
E:\CC\tomorrow-memory\apps\web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 build: `next build`
Exit status 1
```

关键点：**编译阶段 `✓ Compiled successfully`（无悬空 import、无模块解析失败）** —— 这正好命中 §10.2 给 T-12 的回归风险条：「风险在删 `word-lookup.tsx` 的隐性依赖 → `build` 绿即证明无悬空 import」；红在**后续的类型校验阶段**，且第一条类型错误落在 T-15 的 `profile/page.tsx`。

> 本轮**首跑**（改动前）红点更靠前，停在 `packages/server/src/app.ts:163`；那是 T-07 在途写入。T-07 期间该文件被反复改动，红点因此前移过一次。两条诊断的当前原文见 §1.2（同一次 `tsc` 全量输出，未编辑）。

### 1.2 全量类型错误按文件归因 —— 证明「0 条属于 T-12」

`next build` 只报第一条错误就中断，无法据此排除 T-12。故用同配置的全量 `tsc` 做按文件归因（命令：`cd apps/web && npx tsc -p tsconfig.json --noEmit`）：

```
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.
../../packages/server/src/app.ts(163,13): error TS2353: Object literal may only specify known properties, and 'data' does not exist in type '{ message?: string | undefined; code: "BAD_REQUEST" | ... }'.
../../packages/server/src/routes/auth.ts(33,12): error TS2589: Type instantiation is excessively deep and possibly infinite.
../../packages/server/src/routes/auth.ts(42,66): error TS2339: Property 'header' does not exist on type '{ raw: Request; }'.
../../packages/server/src/trpc/init.ts(77,7): error TS2353: Object literal may only specify known properties, and 'data' does not exist in type '{ ... }'.
../../packages/server/src/trpc/routers/auth.ts(69,7): error TS2353: Object literal may only specify known properties, and 'data' does not exist in type '{ ... }'.
=== exit=2 ===
```

| 归属 | 文件 | 条数 | 是否 T-12 可修 |
|---|---|---|---|
| **T-07 / T-11** | `packages/server/src/{app.ts,routes/auth.ts×2,trpc/init.ts,trpc/routers/auth.ts}` | **5** | ❌ `packages/**` 全程禁触（§10.2 T-12「不得触碰」首项） |
| **T-15** | `apps/web/src/app/(user)/profile/page.tsx` | **1** | ❌ `app/(user)/{study,wordbook,profile,…}/**` 明文禁触 |
| **T-12** | —— | **0** | —— |

结论：**build 变红与 T-12 无关，T-12 也没有能力把它变绿**（唯一两条路径都要越界）。这是 A-26-3 口径下「被在途任务压住的红灯照常上报」的情形，未做任何放宽/绕过。

### 1.3 `node tools/boundaries.mjs --web` —— **该模式不存在**（§10.2 文档缺陷）

判据⑤写的是「首页无 `fetch(`（`boundaries --web`）」。实跑：

```
未知模式：--web

用法：node tools/boundaries.mjs [模式] [选项]

模式（可组合；不给模式 = --all）
  --copy            判据②-1 旧口径文案 0 命中（§4.7⑥⑨ / UI §6.6）
  --password        判据②-2/3/4 passwordUpgradeDeadline=0、passwordUpgradeEnforce 引用点=1、SET password 写入点=3
  --migrations      判据②-5 迁移禁词（DROP/RENAME/ALTER COLUMN/回填 UPDATE）+ down() 声明
  --tokens          T-04 判据①②：token 唯一定义源 + globals.css 无 hex
  --colors          UI §8.2-1..7 的 grep 断言
  --ui-io           §3.5 ui-no-io 的全局调用面（fetch/XMLHttpRequest）
  ...
```

`--web` 从未实现（注册表里的模式清单见 §1.3 输出，与 `--list` 一致）。**未改工具**（owner = T-02）。改用等价正确口径：`--ui-io`（§1.4）+ 首页传输面的具名静态断言（§1.9 / 判据⑤测试）。

### 1.4 `--copy` / `--ui-io` / `--colors`

```
$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 75 处）；需人工复核词命中 124 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿

$ node tools/boundaries.mjs --ui-io
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
1/1 条通过，全绿

$ node tools/boundaries.mjs --colors
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
4/6 条通过，2 条红
```

`--colors` 两条红**均在禁触面**、且均非 T-12 引入：`apps/app/src/styles/app.css`（T-14）、`packages/ui/src/patterns/GrowthLine.tsx`（T-05）、`tokens.css`/`packages/ui/test/**`（T-04/T-05）。T-12 的装饰层刻意只用 token 语义类（`from-decor-a` / `bg-brand-100` / `bg-brand-50`），本身零命中。→ 移交见 §7-6。

### 1.5 `--check-ownership --task T-12` —— **无越界**

命令：`node tools/boundaries.mjs --check-ownership --task T-12 --files <17 项，见 §3>`

```
NOTE apps/web/test/home-shell.spec.tsx：归属表无条目（no-entry，不阻断）
NOTE apps/web/package.json：T-12 是交接前动方，改动幅度=add-dependency-lines-only（本次无 patch 可比，只登记不阻断）
NOTE pnpm-lock.yaml：归属表无条目（no-entry，不阻断）

--check-ownership task=T-12 触碰 17 个文件 → 无越界
```

**同时记录一次很有价值的“自我纠正”**：上面第一次跑时我把 `apps/web/src/app/(user)/word/[word]/page.tsx` 也放进了 `--files`（因为 A-29 授权我可以改它），结果：

```
RED  apps/web/src/app/(user)/word/[word]/page.tsx 由 T-15 独占（当前任务 T-12）— §10.4 第 1 行（T-04 只改 import 行）
--check-ownership task=T-12 触碰 18 个文件 → 1 处越界
```

该页最终 **0 改动**（`git diff --stat` 空，见 §3.2），所以从「实际触碰清单」里移除它是事实纠正、不是为凑绿。门禁语义是「按提交清单判定」，A-29 的授权幅度以 diff 为准。**这一点值得 T-02/架构师复核**（§7-4）。

### 1.6 `apps/web` 单测 —— **16/16 绿**（须经仓库外临时配置才能跑，见 §6-2）

```
$ cd apps/web && npx vitest run --config "$TEMP/t12/vitest.web.config.mjs" --reporter=verbose
 ✓ test/home-shell.spec.tsx > 判据① home-root 可交互元素 > 未查询态 = 3（输入框 + 框内提交 + 胶囊），≤5 112ms
 ✓ test/home-shell.spec.tsx > 判据① home-root 可交互元素 > 已查询态 ≤8（结果条出现后） 28ms
 ✓ test/home-shell.spec.tsx > 判据① home-root 可交互元素 > §8.3-C 五类选择器整页命中数 = 0（方向按钮/历史 chips/大灰卡/侧栏/AI 卡） 22ms
 ✓ test/home-shell.spec.tsx > 判据① home-root 可交互元素 > 装饰层不可交互（pointer-events:none + aria-hidden） 15ms
 ✓ test/home-shell.spec.tsx > 判据③ 最近查询聚焦才出现 > 未聚焦：面板整棵子树不存在（DOM 高度 0） 16ms
 ✓ test/home-shell.spec.tsx > 判据③ 最近查询聚焦才出现 > 聚焦后出现条目；失焦后再次归零 294ms
 ✓ test/home-shell.spec.tsx > 判据③ 最近查询聚焦才出现 > 容量 = RECENT_MAX(20)：本机存 20 条全出，存 24 条（越界）时读不出来 13ms
 ✓ test/home-shell.spec.tsx > 判据③ 最近查询聚焦才出现 > 清空要先过二次确认（ConfirmSheet 浮出，确认前不删） 95ms
 ✓ test/home-shell.spec.tsx > 判据④ 结果条组成 > 词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情；无例句/词形变化/AI 文本 9ms
 ✓ test/home-shell.spec.tsx > 判据④ 结果条组成 > 中译英：投影层把候选裁到 3 行，组件按投影渲染 8ms
 ✓ test/home-shell.spec.tsx > 判据② 移动导航结构 > 5 个 tab 全部可点，含 /wordbook；当前项 aria-current=page 8ms
 ✓ test/home-shell.spec.tsx > 判据② 移动导航结构 > 背单词 tab 的可访问名带待背数（ARIA.studyTab） 6ms
 ✓ test/home-shell.spec.tsx > 判据② 移动导航结构 > 底 tab = `md:hidden`、顶栏主导航 = `hidden md:flex`，两处严格互补且不用 JS 断点 15ms
 ✓ test/home-shell.spec.tsx > 判据② 更多抽屉 > 抽屉含 chat / assess 两项 39ms
 ✓ test/home-shell.spec.tsx > 判据⑤ 传输口径 > 首页五个文件均无裸 fetch( / axios / XMLHttpRequest 4ms
 ✓ test/home-shell.spec.tsx > 判据② 键盘/底 tab 让位 > 首页根容器用 100dvh，搜索区带 scroll-margin 让位底 tab 10ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
```

两条非致命的测试噪声，如实记录：`stdout` 的 `[T-12 已查询态计数] raw = 7  聚合 = 6` 是断言自打的点；`stderr` 的 `An update to SearchSection inside a test was not wrapped in act(...)` 来自“聚焦后异步出现面板”，不影响断言结果，留给 T-22 收测试卫生（§7-7）。

### 1.7 §10.2 冒烟第二件 `playwright test e2e/home.spec.ts` —— **本机无浏览器，按 A-29 第 3 条收口**

文件收集正常（证明 spec 语法与类型成立）：

```
$ npx playwright test e2e/home.spec.ts --list
Listing tests:
  e2e\home.spec.ts:27:7 › T-12 首页与移动导航 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零
  e2e\home.spec.ts:46:7 › T-12 首页与移动导航 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框
  e2e\home.spec.ts:67:7 › T-12 首页与移动导航 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认
  e2e\home.spec.ts:87:7 › T-12 首页与移动导航 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句
  e2e\home.spec.ts:103:7 › T-12 首页与移动导航 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截）
Total: 5 tests in 1 file
```

实跑（原始输出，**未伪造为通过**）：

```
Running 5 tests using 1 worker

  x  1 e2e\home.spec.ts:27:7 › T-12 首页与移动导航 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零 (2ms)
  x  2 e2e\home.spec.ts:46:7 › T-12 首页与移动导航 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框 (3ms)
  x  3 e2e\home.spec.ts:67:7 › T-12 首页与移动导航 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 (3ms)
  x  4 e2e\home.spec.ts:87:7 › T-12 首页与移动导航 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句 (3ms)
  x  5 e2e\home.spec.ts:103:7 › T-12 首页与移动导航 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截） (2ms)

  1) ... › ① ...
    Error: browserType.launch: Executable doesn't exist at C:\Users\曹怡明\AppData\Local\ms-playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe
    ╔════════════════════════════════════════════════════════════╗
    ║ Looks like Playwright was just installed or updated.       ║
    ║ Please run the following command to download new browsers: ║
    ║                                                            ║
    ║     npx playwright install                                 ║
    ║                                                            ║
    ║ <3 Playwright Team                                         ║
    ╚════════════════════════════════════════════════════════════╝
```

同时 `ls ~/AppData/Local/ms-playwright` → `no ms-playwright cache`，确认是环境缺件而非代码问题。
另需澄清一个假红：不加文件过滤直接跑 `npx playwright test` 会去收集 `test/home-shell.spec.tsx` 并抛 `Vitest cannot be imported in a CommonJS module` —— 根因是 **`apps/web` 没有 `playwright.config.ts`**（无 `testDir`/`baseURL`/`webServer`），默认收集范围把 Vitest 规格也吞了。已登记 §6-3 / §7-3。
`--list` 与实跑都会在 `apps/web/` 生成未忽略的 `test-results/` 目录，**已由本 agent 删除**（不在 `.gitignore` 里，不清理会污染别人的 `git status`）。

→ 按 A-29 第 3 条：**文件在盘 + 判据逐条人工/静态取证（§2）+ 显式标注「待 T-23 在 CI 内跑通」**。A-29 该条的另一个前置「`build` 绿」当前不可达，原因与归因见 §1.1/§1.2，属**外部阻塞**而非 T-12 未完成。

### 1.8 `eslint`（13 个 T-12 文件）

```
$ cd apps/web && npx eslint <13 files>
eslint exit=0        （无任何输出 = 0 error / 0 warning）
```

### 1.9 判据⑤ 的静态证据（全量命中、未筛）

```
$ cd apps/web/src && grep -rn "fetch(\|XMLHttpRequest\|axios" "app/(user)/page.tsx" "app/(user)/layout.tsx" components/home/ lib/nav.ts lib/hooks/use-lookup.ts lib/api/lookup-stream.ts components/mobile-nav.tsx components/header.tsx
components/home/result-section.tsx:12: * 传输仍只有 `@/lib/trpc`（判据⑤：首页无裸 `fetch(`）。
lib/hooks/use-lookup.ts:6: * - 传输：`trpc.dictionary.lookupStatic`（零 `fetch(`，判据⑤）。
lib/hooks/use-lookup.ts:102:    void query.refetch();
lib/api/lookup-stream.ts:4: * 为什么单独一个文件：首页不写 `fetch(`（判据⑤ / `boundaries` 的 `ui-no-io` 同口径），
```

4 条命中 = 3 条注释 + 1 条 React Query 的 `query.refetch()`（重试按钮，不是传输调用）。**无任何对 `fetch` / `XMLHttpRequest` / `axios` 的调用**；首页数据面只有 `@/lib/trpc`。

---

## 2. 完成判据 ①~⑤ 逐条闭合

| 判据（§10.2 T-12 行原文） | 状态 | 证据 |
|---|---|---|
| **①** `[data-testid=home-root]` 可交互元素 ≤5（PRD §8.3-C 五项各 =0：方向按钮 / 历史 chips / 大灰卡 / 侧栏胶囊 / AI 卡） | ✅ | §1.6 前三条测试：未查询态实测 **3**（断言名即「输入框 + 框内提交 + 胶囊」，`raw = aggregated = 3`，≤5）；已查询态 raw **7** / 聚合 **6**（断言 `aggregated ≤ 8` 且 `> 3`、`raw ≤ 9`，即 R-07①「结果条出现后」口径）；§8.3-C 五类 `data-testid` 选择器**整页命中 0**（`home-direction-buttons` / `home-history-chips` / `home-empty-graycard` / `wordbook-sidebar` / `home-ai-card`）。`page.tsx` 47 行 ≤80 达标（`wc -l`） |
| **②** 375px：底部 5 tab 可点、“更多”抽屉含 chat/assess、当前项 `aria-current`、`100dvh` 不遮输入框（PRD §8.3-A） | ✅（键盘部分待真机） | §1.6 后 5 条：5 tab 全部可点且含 `/wordbook`、当前项 `aria-current=page`、可访问名走 `ARIA.studyTab`（带待背数）、抽屉含 chat/assess、根容器 `min-h-[100dvh]`（`app/(user)/layout.tsx:30`、`page.tsx:31`）+ 搜索区 `scroll-margin` 让位。**本轮新补**：`mobile-nav.tsx` 的 `useKeyboardTuck()`（§2.4-② 原为整块缺失）与断点 `md:hidden`。`visualViewport` 真机行为无法在本环境验证 → 标注「待 T-23 在 CI / 真机跑通」 |
| **③** 最近查询仅聚焦时出现（未聚焦 DOM 高度 0）、≤20 条、可清空二次确认 | ✅ | §1.6 判据③ 四条：未聚焦时面板**整棵子树不存在**（比“高度 0”更强）；聚焦出现、失焦归零；容量以 `RECENT_MAX=20` 为准且越界数据读不出来；清空必经 `ConfirmSheet`，确认前不删（R-10④）；未登录可用（localStorage 面，R-10①） |
| **④** 结果条精简：词+音标+喇叭+词性首义 ≤2 行+星标+"查看详情" | ✅ | §1.6 判据④ 两条：`LookupResultBar` 组合齐全且**无例句/词形变化/AI 文本**；中译英走 `lib/api/lookup-stream.ts` 纯投影（候选裁到 3 行）。R-07⑤⑥ 的“首页零 AI 渲染”由 §8.3-C 的 AI 卡选择器命中 0 覆盖 |
| **⑤** 首页无 `fetch(`（`boundaries --web`） | ✅（模式为幻影，取等价口径） | §1.9 grep（0 处真实调用）+ §1.6 具名断言 + §1.4 `--ui-io` 全绿。`--web` 模式从未存在（§1.3），未改工具、未放宽规则 |

**R-22（品牌视觉）补充取证** —— 判据行未点名但属 T-12 覆盖 R：
- ②渐变柔光背景层 + ③≥20s 低频动效：`home/decor-layer.tsx` 两团 `animate-breath`，周期 = `--dur-breath: 24s`（`packages/ui/src/styles/tokens.css:43`，实测 grep）>20s ✅
- ④`prefers-reduced-motion` 停止：`tokens.css:83-90` 一条全局 `@media (prefers-reduced-motion: reduce)` 将 `--dur-breath: 0s` 并 `.animate-breath { animation-name: none !important; }`（带 `a11y-exception` 注释、占 §8.2-5 的 =1 预算）✅
- ⑤无粒子 / 无 `<video autoplay>` / 无鼠标跟随：`decor-layer.tsx` 全文 19 行，仅 2 个 `blur-3xl` 圆斑，无事件监听 ✅；外层 `aria-hidden="true"` + `pointer-events-none`（判据① 不被装饰层顶爆）
- 底部 12px 备案：`home/footer-note.tsx` `text-xs`（=12px）+ 真实备案号 `赣ICP备2026013161号-1` 外链 `beian.miit.gov.cn`（`rel="noopener noreferrer"`）✅
- 搜索框高 48–52px（R-07③）：`--search-h: 50px`（`tokens.css:41`）✅

---

## 3. 完成清单（本轮实际写了什么）

> 口径说明：工作区整体未提交（大量未提交改动属其他任务，本 agent **未做任何 git 写操作**）。因此 `git diff` 是「累计 vs HEAD」，包含上一轮 T-12 agent 的产出；`§10.2` 标 🆕 的文件在 `git status` 里是 `??`（未跟踪），`git diff` 对它们恒为 0 行 —— 不要把这一点误读成“没改”。

### 3.1 本轮（收口轮）新增/修改

| 文件 | 动作 | 内容 | `git diff -U0` 自证 |
|---|---|---|---|
| `apps/web/src/components/mobile-nav.tsx` | 修 | `lg:hidden`→`md:hidden`；新增 `useKeyboardTuck()`（`visualViewport` resize/scroll + `focusout` 延迟回位，键盘判定阈值 120px、回位 140ms），`tucked && 'translate-y-full'` | 未跟踪新文件（`??`），`git diff` 恒 0；全文 140 行 |
| `apps/web/src/components/header.tsx` | 修 | 主导航 `lg:flex`→`md:flex`；装饰层注释重定向到 §3.10:1104 | 累计 193 行（含上一轮 T-12 重写 + T-04 改引），本轮只动 2 个类名与注释 |
| `apps/web/src/components/home/more-menu.tsx` | 修 | 抽屉 5 个 `max-lg:` → `max-md:`，与顶栏/底 tab 断点同源 | 未跟踪新文件（`??`） |
| `apps/web/src/app/(user)/layout.tsx` | 修（**仅注释**） | JSX **零改动**；重写注释 ② 记录：§3.10.1:1129 的统一内容内边距**已**由 `FooterNote` 的 `pb-safe-bottom` 单点承担（故 `<main>` 不得重复加，加了会多 72px），键盘收起现在在 `mobile-nav.tsx` | 45 行（含上一轮的 nav 壳改造） |
| `apps/web/src/components/word-lookup.tsx` | 修（A-29 允许面） | 去 `sonner` 直装改 `useHost()`、去 6 处组件体内中文字面量改 `@tm/shared` 常量、加 12 行“未退役原因”文档注释 | **56 行 `+/-`**（`--stat`: 33 insertions / 21 deletions） |
| `apps/web/e2e/home.spec.ts` | 修 | 删 1 行已失效的 `// @ts-expect-error`（装完 `@playwright/test` 后它自己会报 unused） | 未跟踪新文件（`??`），5 tests 可收集（§1.7） |
| `apps/web/test/home-shell.spec.tsx` | 修 | 1 条陈旧 `lg:hidden` 断言 → 换成更强的规格对齐断言（见 §5 末尾说明） | 未跟踪新文件（`??`），16/16 绿（§1.6） |
| `apps/web/package.json` + `pnpm-lock.yaml` | 修 | `@tm/web` devDependencies 新增 `"@playwright/test": "^1.63.0"`（§10.2 冒烟命令要求 `pnpm --filter @tm/web exec playwright …`，且 `e2e/home.spec.ts` 不装就无法类型检查，会额外给 build 添 9 条错误） | `--check-ownership` 判定：`add-dependency-lines-only`（§1.5 NOTE） |
| `.delivery/04-dev-report-T-12.md` | 新建 | 本报告 | —— |

### 3.2 本轮**未**写（重要）

- `apps/web/src/app/(user)/word/[word]/page.tsx`：**0 diff**
  `git diff --stat -- 'apps/web/src/app/(user)/word/[word]/page.tsx'` 输出为空（`git status --porcelain -- apps/web` 里也无此文件）。原因见 §4。
- `word-lookup.tsx` 未执行 🗑️ 删除（同上）。
- `packages/**` 零改动；`tools/ownership.json` / `tools/exceptions.json` 零改动；未放宽任何门禁、未删任何断言、未加任何豁免；未对仓库根 `data.db` 做写操作。

### 3.3 已在盘、本轮未改的 T-12 产出（上一轮交付，仅验证）

`app/(user)/page.tsx`(47) 、`components/home/{search-section(137),result-section(251),decor-layer(19),footer-note(27)}`、`lib/nav.ts`(38) 、`lib/hooks/use-lookup.ts`(110) 、`lib/api/lookup-stream.ts`(135) —— 均过 §1.6 / §1.8。

---

## 4. `word-lookup.tsx` 未退役的论证（A-29 第 2 条“保留 + 移交”路径）与移交 T-15 清单

### 4.1 结构性不可行（不是“没做完”，是“做不了”）

A-29 允许的幅度是「把 `WordLookup` 的 import/使用换成 `@tm/ui` patterns 现成组件 + 必要的 props 传参，其余行不动」。但 `page.tsx` 是**服务端组件**：

```
apps/web/src/app/(user)/word/[word]/page.tsx:10   import { WordLookup } from '@/components/word-lookup';
apps/web/src/app/(user)/word/[word]/page.tsx:48   return <WordLookup word={word} />;
```

同文件有 `generateStaticParams()`（200 高频词）+ `export const revalidate = 3600` + `generateMetadata()`，这三者**与 `'use client'` 互斥**。而 `@tm/ui/patterns` 按 §3.5 `ui-no-io` 是**零网络、零 store、纯 props 驱动**，它不能自己承接 `trpc.dictionary.lookupStatic.useQuery`（取数）与 `wordbook.add/remove.useMutation`（收藏写）。要在 T-12 里完成替换，只有两条路：

1. 在 `packages/**` 禁触面外新写一个业务容器（查词 + 词本读写）—— A-29 **明文禁止**（“不许在 T-12 里新写业务组件，那是 T-05/T-15 的地盘”）；
2. 在 `page.tsx` 服务端直接取数后把结果当 props 传给 pattern —— 这会绕过 tRPC/React Query 层，且 `generateStaticParams` 阶段的 200 词构建期取数会碰**仓库根 `data.db`**（硬约束“绝不写”，而词详情页的浏览行为本身要写 `search_history`）。

因此选了 A-29 第三条明示的合法出口：**保留文件 + 登记移交**。未对 `page.tsx` 动一行，以“零 diff”作为幅度自证（这是比“小 diff”更强的证据）。

### 4.2 两块**具体**的 patterns 能力缺口（读 `packages/ui/src/patterns/WordDetailCard.tsx` 与 `packages/shared/src/contracts/lookup.ts` 得到）

移交 T-15 时若只换组件会**丢功能**，这两块是丢在哪里：

1. **`translation`（顶层一行中译释义）无槽位。**
   `WordDetailCard` 的 props 里只有 `groups: TranslationGroup[]`，**没有 `translation`**；而 `packages/shared/src/contracts/lookup.ts:51-60` 的 `LookupEn2ZhSuccessSchema` 把 `translation: z.string()` 定为**必填**。更坑的是它的空态判定：
   `const isEmpty = !hasMeaning && !enDefinition && !enDefinitionSlot && examples.length === 0 && !freqLabel;`
   —— 不看 `translation`。后果：`groups` 为空、只有 `translation` 的词（中查英结果的常见形状）会被 `WordDetailCard` **误渲染成“未找到该词条”空态**。这是真实回归，不是样式差异。
   → 需求：`WordDetailCard` 加 `translation?` prop（或 `translationSlot`）并把 `translation` 计入 `isEmpty`。owner = **T-05**（`packages/ui`）。
2. **频率徽章「柯林斯 N」在 `@tm/shared` 无常量。**
   `WORD_DETAIL_SECTION_LABELS` 未收录柯林斯档位前缀，所以即使迁到 pattern 也得在组件里现写中文串 → 违反 A-8/A-23。
   → 需求：`@tm/shared/constants/copy.ts` 新增（例如）`WORD_DETAIL_COPY.collinsBadge(freq)`。owner = **T-03**。

（本轮为此在 `word-lookup.tsx` **模块层**（非组件体）临时放了 `TM_ALREADY_ADDED` 与 `collinsBadge()` 两个“宿主注入”常量，并逐条注释了缺哪个 shared 常量，`--copy` 全绿。它们是 §5 清单里的欠账，不是藏起来的字面量。）

### 4.3 移交 T-15 的落地步骤（已写进 `word-lookup.tsx` 文件头 12 行注释，防丢）

1. `page.tsx` 保留 server 部分（`revalidate` / `generateStaticParams` / `generateMetadata`），新增一个客户端叶子（建议名 `word-detail-view.tsx`）承接 tRPC 查询与收藏 mutation；
2. 客户端叶子内部用 `WordDetailCard` + `LookupResultBar`（props 契约 = `packages/ui/src/patterns/README.md`，宿主能力走 `useHost()`）；
3. 先补上 §4.2 的两块能力（T-05/T-03），再 🗑️ `apps/web/src/components/word-lookup.tsx`。

---

## 5. 文案字面量自查（A-8 / A-23）

**组件体内中文字面量：0**。本轮从 `word-lookup.tsx` 组件体内清掉的 6 处（→ 共享常量或模块层宿主注入）：

| 原字面量（组件体内） | 现口径 |
|---|---|
| `已加入单词本：${word}` | `LOOKUP_COPY.favoriteToast.body + '：' + word` |
| `该单词已在单词本中` | 模块层 `TM_ALREADY_ADDED`（**shared 缺常量**，见 §5.1-2） |
| `err.message`（直抛技术错） | `LOOKUP_COPY.networkFail`（人话化，R-25） |
| `未找到该词条，请稍后重试或回到首页搜索。` | `LOOKUP_COPY.notFound.title` + `notFound.subtitle` |
| `aria-label="发音"` | `ARIA.speak(word)` |
| `柯林斯 {freq}` / `加入单词本` | 模块层 `collinsBadge()`（**shared 缺常量**） / `VERBS.addToOneWordbook` |

同时：`toast` 从 `import { toast } from 'sonner'` 改为 `useHost()`（§3.5 `ui-no-io` + §3.11.1：`apps/web/src/lib/host.tsx` 是唯一允许 `from 'sonner'` 的地方）；`@/components/ui/{button,badge,card,skeleton}` 改引 `@tm/ui`（T-04 已删本地 shadcn 副本，属 A-13 的 import-only 通道）；发音从直写 `SpeechSynthesisUtterance` 改为 `host.speak(word, 'us')`。

### 5.1 缺失常量清单（需 T-03 往 `@tm/shared/constants/copy.ts` 补，本轮无权改 `packages/**`）

| 串 | 位置 | 备注 |
|---|---|---|
| `'主导航'` | `header.tsx` 模块层 | README 已标“宿主注入”= shared 暂无 |
| `'切换深色/浅色'` | `header.tsx` 模块层 | 同上；`THEME_MODE_LABELS` 只有三个模式名，无切换按钮标签 |
| `'我的'` | `header.tsx` 模块层 | 头像菜单项 |
| `和 AI 聊聊` / `测一测词汇量` | `more-menu.tsx` | 抽屉两项副标题 |
| `不是这个？换个查询方向` | `result-section.tsx` | R-07 的方向切换引导 |
| `柯林斯 {N}` | `word-lookup.tsx` | 见 §4.2-2 |
| `该单词已在单词本中` | `word-lookup.tsx` | `WORDBOOK_COPY` 只有“移出”侧，无“已存在”态 |

### 5.2 关于“改断言”的说明（防止被误读为“为了让门禁绿而放宽”）

`test/home-shell.spec.tsx` 里原有一条断言期望底 tab 为 `lg:hidden`。它与 PRD R-08①/⑥ 和 UI §3.10:1104 直接矛盾（规范写的是 768px = `md`），是**上一轮留下的陈旧断言**。本轮不是删它，而是把它**换成更强的四条断言**：① 挂载后 class 必含 `md:hidden`；② **不得**含 `lg:hidden`；③ `header.tsx` 源码正则 `/className="hidden[^"]*md:flex/`；④ 两文件源码合并不命中 `/matchMedia|window\.innerWidth/`（禁 JS 断点）。测试数从 16 仍是 16，无跳过、无 `only`、无放宽阈值。依据已在测试内以注释写明。
实际断言（`test/home-shell.spec.tsx:400-422`）：
```
expect(navClass).toContain('md:hidden');
expect(navClass).not.toContain('lg:hidden');
expect(/className="hidden[^"]*md:flex/.test(header), 'header 主导航 = hidden … md:flex').toBe(true);
expect(/matchMedia|window\.innerWidth/.test(header + mobileNav), '无 JS 断点').toBe(false);
```

---

## 6. 未达成项

1. **`pnpm --filter @tm/web build` 未绿** —— 唯一一条“判据①~⑤ 均闭合但冒烟不绿”，完全由 §1.2 的 6 条外部类型错误导致。**解锁条件**：T-07/T-11 修完 `packages/server` 的 5 条（`TRPCError` 构造器多传 `data`、`c.req.raw.header`、`routes/auth.ts:33` 的 TS2589 无限深）+ T-15 修 `profile/page.tsx:92`（`ProfileDto.dailyGoal` 在 web 侧被推成 `unknown`，像是 `@tm/shared` DTO 导出形状未到位）。两者任一未修，T-12 出口都不可能出现绿 build。
2. **`apps/web` 单测不在 CI 可见路径上** —— 根 `vitest.workspace.ts`（T-01 owner）只注册了 `@tm/shared/@tm/ui/@tm/server/@tm/agent/@tm/app`，**没有 `@tm/web` 工程**，所以 `apps/web/test/**` 从仓库根 `pnpm test` 永远 `No test files found`。本轮**未改该文件**（越界），改用一个仓库外临时配置取证：
   `$TEMP/t12/vitest.web.config.mjs`（`root=apps/web`、`environment=jsdom`、`server.deps.inline=['@tm/ui','@tm/shared']`、`include=['test/**/*.spec.tsx']`、`esbuild.jsx='automatic'`、`resolve.alias['@']=apps/web/src`）→ 得到 §1.6。**该配置不入库**，所以 T-12 的 16 条测试目前**不会在 CI 里跑**（登记 §7-2）。
3. **`e2e/home.spec.ts` 未真实跑通** —— 环境无浏览器（§1.7）+ **无 `apps/web/playwright.config.ts`**（无 `testDir` / `baseURL` / `webServer`）。A-29 第 3 条口径收口。
4. **`word-lookup.tsx` 未删除**（§4，A-29 明许可的移交路径）。
5. **键盘收起底 tab 的真机行为未验证** —— `useKeyboardTuck()` 在 jsdom 里只能验“不报错且默认不收起”，iOS Safari / Android Chrome 的实际 `visualViewport.height` 差值需真机，归 T-23。

---

## 7. 待裁决点 / 移交清单（不阻塞判据闭合）

| # | 事项 | 给谁 | 严重度 |
|---|---|---|---|
| 1 | **`tools/boundaries.mjs` 从未实现 `--web` 模式**，但 §10.2 T-12 判据⑤ 把“首页无 `fetch(`”的机检指给它。要么 T-02 新增一个扫 `apps/web/src/{app/(user)/page.tsx,components/home/**,lib/api/**}` 的模式，要么架构师把判据⑤ 的括号改成已有的 `--ui-io` + 具名测试（本轮已按后者取等效证据）。T-14 报告的 `--dist` 幻影是同一类缺陷，现在 `--dist` 已存在，说明这类“文档先于工具”的偏差会自行收敛，但需登记 | T-02 / 架构师 | 中（门禁可信度） |
| 2 | **`vitest.workspace.ts` 缺 `@tm/web` 工程** ⇒ T-12/T-15/T-16 的 Web 单测全部游离于 CI 之外（现状是静默不跑，不是报错，很坑） | T-01（owner）+ T-23 | **高**（测试覆盖假绿） |
| 3 | **`apps/web/playwright.config.ts` 不存在**：需 `testDir:'./e2e'` + `baseURL` + `webServer`（`next start -p 3100`）+ projects（375px 与 1280px）。不配好，T-15/T-16 的 `e2e/{study,wordbook,profile,auth-wall,upgrade}.spec.ts` 会集体踩同一个“默认收集把 Vitest 文件也吃了”的坑 | T-22 / T-23 | **高**（§10.2 五个任务的冒烟命令都依赖它） |
| 4 | **`--check-ownership` 按“提交清单”而非“实际 diff”判定**：A-29 授权我改 `word/[word]/page.tsx`，但只要把它列进 `--files` 就必红（因为该文件 owner=T-15 独占），而 diff 为 0 也无法自证清白。建议给 `no-entry`/授权白名单加一个“A-29 式有限授权”通道 | T-02 | 低 |
| 5 | **`@tm/shared` 文案常量缺 7 项**（清单见 §5.1），现有实现靠“模块层宿主注入”顶着（A-8/A-23 允许、`--copy` 绿）。补齐后可从 `word-lookup.tsx`/`header.tsx`/`more-menu.tsx`/`result-section.tsx` 里删掉这 7 个临时 const | T-03 | 中 |
| 6 | `--colors` 2 条红（`apps/app/src/styles/app.css:5`、`packages/ui/src/patterns/GrowthLine.tsx:8` 硬编码色；`!important` 3 处超 1 预算）均在 T-14/T-04/T-05 面内，非 T-12 引入。注意 `tokens.css:89` 那条 `!important` 是 R-22④ 的**设计内**例外（带 `a11y-exception` 注释），预算超的其实是 `packages/ui/test/patterns.spec.tsx` 的两处 | T-14 / T-04 / T-05 | 中 |
| 7 | `apps/web/src/components/user-shell.tsx` 是**孤儿死代码**（无 import 方，功能已被 `app/(user)/layout.tsx` + `mobile-nav.tsx` 取代）。不在 §10.2 T-12 的 🗑️ 清单里，所以本轮未删；建议归档时一并清 | 架构师 | 低 |
| 8 | `apps/web/src/app/(user)/chat/page.tsx` 仍用 `100vh`（§2.4-① 明禁，应 `100dvh`），属 `app/(user)/chat/**` 禁触面 | T-16 | 中 |
| 9 | `word-lookup.tsx` 残留的 `text-muted-foreground` / `bg-muted/50` 是 shadcn 旧 token 名，T-04 收敛 token 后这两个类**在 preset 里已无定义**（渲染时静默无样式）。本轮未改（属视觉修正、且该文件已登记移交），请 T-15 重写时直接消失 | T-15 | 低-中 |
| 10 | `@tm/web` devDependencies 新增 `@playwright/test@^1.63.0`：§10.2 冒烟命令必需，但根 `pnpm-workspace.yaml:overrides`（RK-10/A-1 钉版本面）未统一管 playwright 版本。`--versions` 当前绿，但建议 T-23 把两端 playwright 锁到同一定点，避免 CI 与本地驱动版本漂移 | T-23 / T-01 | 低 |
| 11 | `app/(user)/page.tsx:31` 的 `home-root` 自带 `min-h-[100dvh]`，而 `layout.tsx:30` 根容器也是 `min-h-[100dvh]`（且顶栏 56px 在其上方）—— 两者叠加会使首页比普通页多出一个很浅的滚动余量。不违反判据②（“不遮输入框”反而更宽松），但 §8.3-A 走查时建议确认是否要把 `home-root` 改成 `flex-1` | T-12（下轮）/ QA | 低 |
| 12 | `search-section` 聚焦面板那条 `act(...)` 警告（§1.6）：测试卫生，不影响断言 | T-22 | 低 |

---

## 8. 给后续任务的接口说明

- **`app/(user)/layout.tsx` 归 T-12 唯一 owner，T-15/T-16 只读**（§10.4:913）。本轮已确认其 JSX **零改动**：`div.flex.min-h-[100dvh].flex-col` → `<Header/>` → `<main id="main" class="flex flex-1 flex-col">` → `<FooterNote/>` → `<MobileNav/>`。词本一级入口已预留在 `lib/nav.ts` 的 `PRIMARY_NAV`（从 `@tm/shared` 的 `NAV_ITEMS` 派生），**5 个 tab 包含 `/wordbook`**（§1.6 判据② 已断言），T-15 无需碰本文件。
- 导航单一真源：`apps/web/src/lib/nav.ts` 导出 `PRIMARY_NAV`（5 项，= 底部 tab = 顶栏主导航）、`MORE_NAV`（chat/assess，= 抽屉）、`isCurrent()`。新页面入口请改 `@tm/shared` 的 `NAV_ITEMS`，不要在组件里加字面量。
- 断点约定（本轮刚修正）：**768px = `md` 是唯一的导航切换断点**（底 tab `md:hidden` / 顶栏 `hidden md:flex` / 抽屉 `max-md:`），禁 JS 断点。新代码请沿用，不要再引入 `lg:` 作为导航语义（`header.tsx:107` 的登录 CTA `lg:flex` 是密度取舍，非导航语义，抽屉始终提供登录入口）。
- 底 tab 高度让位：`--tab-h: 56px`（`tokens.css:41`）+ 预设尺寸类 `h-tab`/`min-h-tap`/`pb-safe-bottom`（`tailwind-preset.ts:182-199`）。页面内容的底部安全区**由 `FooterNote` 单点提供 `pb-safe-bottom`**，`<main>` 不要重复加（会多 72px）。
- 宿主能力一律 `useHost()`（`packages/ui/src/host.tsx`），不要在 `apps/web/src/components/**` 里 `from 'sonner'`。

---

## 附：本轮使用的完整 `--check-ownership` 文件清单（17 项）

```
apps/web/src/components/word-lookup.tsx
apps/web/src/components/mobile-nav.tsx
apps/web/src/components/header.tsx
apps/web/src/components/home/more-menu.tsx
apps/web/src/components/home/search-section.tsx
apps/web/src/components/home/result-section.tsx
apps/web/src/components/home/decor-layer.tsx
apps/web/src/components/home/footer-note.tsx
apps/web/src/app/(user)/layout.tsx
apps/web/src/app/(user)/page.tsx
apps/web/src/lib/nav.ts
apps/web/src/lib/hooks/use-lookup.ts
apps/web/src/lib/api/lookup-stream.ts
apps/web/e2e/home.spec.ts
apps/web/test/home-shell.spec.tsx
apps/web/package.json
pnpm-lock.yaml
```

（`word/[word]/page.tsx` **不列**：本轮对它 0 改动。列出它时的红跑结果已在 §1.5 完整记录，未隐瞒。）
