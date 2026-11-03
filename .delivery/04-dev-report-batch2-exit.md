# 04 · 开发报告 —— 批次 2 收口轮

- **仓库根**：`E:\CC\tomorrow-memory`；本轮全部命令与输出为 2026-09-19 实测。
- **角色**：开发工程师（全栈）· 执行 A-22/A-23 批次 2 收口令。
- **本任务范围**：① 清 8 条 lint（4 error + 4 warning）；② 平 1 条跨任务断言；③ 跑 §10.1 批次 2 出口门禁 + T-08 trpc-shape 逐字节复跑。
- **未做任何 git 写操作**。工作区大量未提交改动为其它并行 agent 所有，未清理、未还原。
- **未修改 `eslint.config.js`**。未修改 `packages/shared/**`、`tools/**`、`apps/web/**`。

---

## ① lint：8 条全清（4 error + 4 warning → 0/0）

| # | 文件 | 行 | 级别 | 原错误 | 处置 |
|---|---|---|---|---|---|
| 1 | `apps/app/src/main.tsx` | 25 | warning | `subscribeRoute` 未使用 | 删除 import 行 `subscribe as subscribeRoute` |
| 2 | `apps/app/test/offline-queue.spec.ts` | 189 | warning | `batch` 参数未使用 | 改 `_batch`（符合 `argsIgnorePattern: '^_'`） |
| 3 | `apps/app/test/rest-fetcher.spec.ts` | 12 | error | `ApiError` 仅作类型使用 | 改 `type ApiError`（仅用于 `as ApiError`，无值调用） |
| 4 | `apps/app/test/router.spec.tsx` | 42 | warning | `TabBar` 未使用 | 删除 import 中的 `TabBar`，保留 `TabBarShell` |
| 5 | `packages/server/src/trpc/routers/assessment-parts.ts` | 8 | error | `generateQuestion` 仅作类型使用 | 改 `type generateQuestion`（仅用于 `Parameters<typeof …>[3]`，无值调用） |
| 6 | `packages/ui/src/auth/ChangePasswordForm.tsx` | 121 | error | `Definition for rule 'react-hooks/exhaustive-deps' was not found` | **见下方说明，选择删掉失效 disable 注释** |
| 7 | `packages/ui/test/auth.spec.tsx` | 95 | warning | `SHORT_PASSWORD` 未使用 | 删除该常量声明 |
| 8 | `packages/ui/test/auth.spec.tsx` | 656 | error | Unnecessary escape character: `\.` | 将模板串 `` `\.length` `` 中多余的 `\` 删去（正则里的 `\.` 保留不变） |

**`ChangePasswordForm.tsx:121` 选路说明**：
`eslint.config.js` 未注册 `react-hooks` 插件（只用了 `@eslint/js`、`typescript-eslint`、`eslint-config-prettier`），所以 `eslint-disable-next-line react-hooks/exhaustive-deps` 指向一个不存在的规则 ID。该处 `useEffect` 依赖数组 `[autoFocus]` 本身就是正确的——`focusFirst()` 走的是 ref（ref 不应在依赖数组里），因此删掉这句失效的 disable 注释是唯一正确处置。**本轮未改 `eslint.config.js`**。若未来需要 react-hooks 插件，由 TPM 另派任务。

**验证**：`pnpm lint` → exit 0，0 error，0 warning（见 §③ 真实输出）。

---

## ② 跨任务断言：1 红 → 转绿（集合相等契约钉死）

**问题**：`packages/ui/test/ui.spec.tsx`（T-04 owner 面）测试名含"auth 出口仍是空占位"，断言 `auth/index.ts` 内容为 `export {};` 且目录无其它文件。T-13 已填满 7 件，断言过时，144 例中红这 1 例。

**处置**（按 A-23-1 追认 + A-13 授权范围，仅改这一条用例）：

- 在 `PATTERNS_14` 常量之后新增 `AUTH_7` 常量（7 件：`NoticeBar`、`PasswordStrength`、`AgreementCheckbox`、`SmsCodeEntry`、`AuthFormShell`、`ChangePasswordForm`、`ForcePasswordUpgradeForm`）。
- 替换原空占位两行断言（`toBe('export{};')` 和 `readdirSync(auth).filter(…)==[]`）为：
  1. 解析 `auth/index.ts` 的 re-export 集合 → 与 `AUTH_7.sort()` **集合相等**（`expect(…).toEqual(…)`）；
  2. `readdirSync(auth)` 过滤 `.tsx` 后的文件名集合 → 与 `AUTH_7.sort()` **集合相等**。
- 测试名更新为：`"根出口无人抢改；patterns 出口已由 T-05 填满 14 件，auth 出口已由 T-13 填满 7 件（契约钉死）"`。

**未动 T-04 自己的其它任何断言**：`root` 出口 barrel 行集合、`patterns/index.ts` 的 re-export 集合、patterns 目录文件集合——全部原样保留。

**git diff 自证**：所有目标文件（含 `ui.spec.tsx`）均为 `??`（未跟踪状态，批次 2 产出尚未 commit）。`git diff -U0 packages/ui/test/ui.spec.tsx` 返回空输出（git 无基线）。自证方式改为代码审查：`ui.spec.tsx` 的 T-04 断言块（约第 483-501 行）在编辑前后内容一致，只有第 503-505 行（原空占位检查）被替换为 AUTH_7 集合相等检查。

**验证**：`pnpm --filter @tm/ui test` → 144 passed，0 failed（见 §③）。

---

## ③ 批次 2 出口门禁（§10.1）—— 全部命令真实输出

> **数据库安全**：全程无写操作落在仓库根 `data.db`。`trpc-shape.spec.ts` 用例只读 `appRouter` 元数据 + zod 解析器，不构造 ctx、不触碰 db。

### typecheck

```
Scope: 6 of 7 workspace projects
packages/shared typecheck: Done
packages/agent typecheck: Done
packages/ui typecheck: Done
apps/app typecheck: Done
packages/server typecheck: Done
apps/web typecheck: Done
TYPECHECK_EXIT=0
```

### @tm/web build（Next.js）

```
✓ Compiled successfully in 3.2s
✓ Generating static pages (209/209)
○ (Static) prerendered as static content
● (SSG) prerendered as static HTML (uses generateStaticParams)
EXIT=0
```

### @tm/app build（Vite + tm-app:dist-guard）

```
vite v6.4.3 building for production...
✓ 225 modules transformed.
✓ built in 2.63s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：4 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
EXIT=0
```

### @tm/app test

```
✓  @tm/app  test/rest-fetcher.spec.ts (18 tests)
✓  @tm/app  test/startup.spec.ts (16 tests)
✓  @tm/app  test/offline-queue.spec.ts (12 tests)
✓  @tm/app  test/router.spec.tsx (10 tests)

 Test Files  4 passed (4)
      Tests  56 passed (56)
EXIT=0
```

### @tm/ui test

```
✓  @tm/ui  test/ui.spec.tsx (38 tests)
✓  @tm/ui  test/auth.spec.tsx (55 tests)
✓  @tm/ui  test/patterns.spec.tsx (51 tests)

 Test Files  3 passed (3)
      Tests  144 passed (144)
EXIT=0
```

### @tm/shared test

```
✓  @tm/shared  test/contracts.spec.ts (43 tests)

 Test Files  1 passed (1)
      Tests  43 passed (43)
EXIT=0
```

### @tm/server test（含 trpc-shape 判据）

```
✓  @tm/server  test/db/methods.spec.ts (25 tests)
✓  @tm/server  test/db/migrations.spec.ts (25 tests)
✓  @tm/server  test/trpc-shape.spec.ts (2 tests)

 Test Files  3 passed (3)
      Tests  52 passed (52)
EXIT=0
```

**T-08 trpc-shape 逐字节复跑证明（§10.1 批次 2 硬判据）**：

`trpc-shape.spec.ts` 的 2 个用例均在本轮独立跑绿：
- 用例①：`"快照非空"` → 通过
- 用例②：`"与拆分前的基线逐字节一致"` → 通过（a === b，无差异行）

基线文件 `packages/server/test/trpc-shape.baseline.json`（9793 行）在盘上未被覆写（本轮未带 `TRPC_SHAPE_UPDATE=1` 跑）。
来源证明：基线 `provenance.sourceModule = "../src/trpc/router.js"`（拆分前的原始 `router.ts`），拆分后比对目标是 `../src/trpc/routers/index.js`。逐字节相等 = **零签名漂移成立**。

### depcruise

```
✔ no dependency violations found (309 modules, 736 dependencies cruised)
EXIT=0
```

### boundaries.mjs --all

```
18/20 条通过，2 条红
```

RED 1：`colors-no-hardcode` 2 处（均为注释假阳）：
- `apps/app/src/styles/app.css:5`（T-14 文件，注释里写了 "`rgb()` / `hsl()` 命中即红"，被扫描器命中）
- `packages/ui/src/patterns/GrowthLine.tsx:8`（T-05 文件，注释里写了 "`#RRGGBB`/`rgba()`"，被扫描器命中）

RED 2：`css-important-budget` 3 处 > 预算 1：
- `packages/ui/src/styles/tokens.css:89`（T-04 文件，唯一一条真 `!important`，在 `prefers-reduced-motion` 块内但缺 `a11y-exception` 行内注释）
- `packages/ui/test/patterns.spec.tsx:691`（T-05 测试，断言名称字符串含 `!important`）
- `packages/ui/test/patterns.spec.tsx:695`（T-05 测试，`/!important/` 正则字面量）

**以上 2 条红均不在本轮 8 条 lint 范围内**，属于 T-04/T-05/T-14 的文件边界，未修改，列入 §批次3 前置清单。

### boundaries.mjs --self-test

```
boundaries --self-test：100/100 通过
EXIT=0
```

### boundaries.mjs --dist apps/app/dist

```
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处...判据② 0 处...
产物门禁：全绿
EXIT=0
```

### boundaries.mjs --copy

```
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 67 处）；需人工复核词命中 108 处（不判红）

1/1 条通过，全绿
EXIT=0
```

注：A-23-7 提到的 `EmptyState.tsx:6` 禁词命中已在上轮清零，当前 `--copy` 0 命中。

### boundaries.mjs --tokens

```
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中

2/2 条通过，全绿
EXIT=0
```

### pnpm ddl-parity

```
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B/C 段：调 packages/server/src/scripts/ddl-parity-runner.ts（sqlite=临时文件库 / pg=DATABASE_URL_TEST）
B 段/pg：SKIP —— 本机无 PG 实例（A-18-3 → T-22 出口判据）
C 段/pg：SKIP —— 本机无 PG 实例（A-18-3 → T-22 出口判据）
EXIT=0
```

### pnpm lint

```
$ eslint .
EXIT=0
```
0 error，0 warning。

---

## 批次 3 开工前置清单

以下红不属于本轮收口令范围（均在我不可写的文件面内），保留原状，需各 owner 在批次 3 开工前清零。

| 红项 | 文件 | owner | 说明 |
|---|---|---|---|
| `colors-no-hardcode` 假阳 1 | `apps/app/src/styles/app.css:5` | **T-14** | 注释行含 `` `rgb()` `` / `` `hsl()` `` 字面串被扫描器命中；需 T-14 改写该处注释（去掉括号或转义） |
| `colors-no-hardcode` 假阳 2 | `packages/ui/src/patterns/GrowthLine.tsx:8` | **T-05** | 注释行含 `` `#RRGGBB` `` / `` `rgba()` `` 字面串被扫描器命中；需 T-05 改写该处注释 |
| `css-important-budget` 1/3 | `packages/ui/src/styles/tokens.css:89` | **T-04** | 真实 `!important`，位于 `prefers-reduced-motion` 块内，但缺 `/* a11y-exception */` 行内注释，规则判红 |
| `css-important-budget` 2/3 | `packages/ui/test/patterns.spec.tsx:691` | **T-05** | 测试描述字符串含 `!important`，被计数扫描器命中（假阳）；需 T-05 改写测试名或转义 |
| `css-important-budget` 3/3 | `packages/ui/test/patterns.spec.tsx:695` | **T-05** | 正则 `/!important/` 含 `!important`，同上假阳；需 T-05 改写正则（如拆串或用动态构造）或加 `/* eslint-disable */` 注释绕过扫描器字符串识别 |

> 注：以上 5 条红共同使 `node tools/boundaries.mjs --all` 返回 exit 1。`--self-test` / `--copy` / `--tokens` / `--dist` / `--check-ownership` 单独均为绿。批次 3 的 T-04/T-05/T-14 各自在实现面清零这 5 条后，`--all` 即可转 20/20 全绿。

| 待 PM 定稿（A-23 遗留） | 说明 |
|---|---|
| A-23-2 | `03-ui-spec.md` §3.7.2 的 `HeatmapMode` 名称需 PM 改为 `'cumulative'`（代码零改）|
| A-23-7 `review.ts:74` | 中文字面量抛错清零，owner=T-10（批次 3 复习域后端） |
| A-19 `review-no-agent` 15 条 | 已按 A-10 粒度登记 `expires_after: T-10` 例外，T-10 合入时同 commit 删除例外 |
| A-25 `--check-ownership` TM_TASK=T-10 下 30 红 | 由 TPM 在批次 3 开工前对齐 §10.2/§10.3 归属表 |
| A-17 不 FOUC 真机判据 | 需 Playwright，owner=T-22 |
| A-18-3 pg 段（ddl-parity B/C、A/pg） | 需 CI 有 PG 实例，owner=T-22 |

---

## 已知限制与 TODO

1. **`ui.spec.tsx` 的 git diff 自证**：该文件（以及本轮全部 8 个目标文件）均为 `??`（未跟踪），git 无基线，`git diff -U0` 返回空。代码层面 T-04 断言块未动，已在 §② 用行号范围说明。
2. **`patterns.spec.tsx` stderr**：jsdom 不支持非 hash 的 `window.location` 跳转，测试输出含一条 `Error: Not implemented: navigation` stderr，但这不使任何用例失败（51/51 passed）。这是 jsdom 已知限制，不是本轮引入的。
3. **Next.js build 有一条 ESLint 警告**：`⚠ The Next.js plugin was not detected in your ESLint configuration.` 这是 Next.js 内置 lint 与 eslint.config.js 的兼容提示，不是 error，build exit 0。归 T-04/T-12 后续处理。
