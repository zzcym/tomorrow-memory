# 04 · 开发报告 —— 批次 1 出口阻塞修复（补写件）

- **依据**：`.delivery/04-adjudications.md` 的 **A-14 / A-16 / A-18**（§10.1 批次1 出口口径 = `pnpm -r typecheck && pnpm ddl-parity && pnpm depcruise`）。
- **仓库根**：`E:\CC\tomorrow-memory`；本轮全部命令与输出为本机 **2026-09-19 16:20～16:40** 实测。
- **本报告的组成**：①~④ 四项出口修复由**上一轮 agent 完成**（它未及写报告）；本报告 (a) 反查并逐项写清它的改动面与真实行为证据，(b) **全部冒烟由我重跑一遍**（不沿用任何人给的数字），(c) 追加第 5 项：**清掉 `pnpm lint` 剩下的 7 条 error**（TPM 直接下给本 agent 的令）。
- **并行面声明**：另有 agent 同时在改 `packages/server/src/trpc/**`、`packages/ui/src/patterns/**`、`apps/app/**`。本报告**只标注**它造成的红，未替它改任何文件。

---

## 0. 取证方法，以及"哪些能证、哪些不能证"（先说清，避免把反查当见证）

①~④ 的执行过程没有日志可查，所以我用的是三类**只读**证据：

1. `git status --porcelain` / `git status --porcelain --untracked-files=all -- <path>` —— 工作区有 81 个已跟踪文件被改动 + 大量未跟踪新文件（其中很多属于其它并行 agent）；
2. `git diff --stat`（仅对**已跟踪**文件有意义）；
3. 文件内自带的裁决编号注释（`A-18-1`、`A-18-2`、`A-14`、`A-16`、`A-18-4`）＋ **我重跑命令得到的行为证据**（这一类最硬）。

⚠ **必须登记的局限**：本轮的关键文件绝大多数是**未跟踪**（`??`），git 里没有"改前版本"，因此**给不出增量 diff**，只能给"当前存在 + 行数 + 内部标注 + 行为验证"：

| 文件 | git 状态 | 行数 | 能给出的证据 |
|---|---|---|---|
| `vitest.workspace.ts` | `??`（未跟踪） | 67 | 文件内 `A-18-2` 注释 + §1 的命令实测 |
| `.dependency-cruiser.cjs` | `??` | 260 | 文件内 `A-14` 注释 + `pnpm depcruise` / `--self-test` 实测 |
| `tools/boundaries.mjs` | `??` | 1444 | 文件内 `A-14` 注释 + `--all` / `--self-test` 实测 |
| `tools/exceptions.json` | `??` | 313 | 文件内 `$changelog` 自述 A-16 + `--exceptions` 实测 |
| `packages/server/src/scripts/entry-guard.ts` | `??` | 120 | 文件头 `A-18-1` 自述 + §2 的 8 组拒绝/放行实测 |
| `packages/server/src/scripts/ddl-parity-runner.ts` | `??` | 342 | 文件头 `A-18-4` 自述 + `pnpm ddl-parity` 实测 |
| `packages/server/test/db/*.spec.ts` | `??` | 25 例 × 2 | vitest 实测全绿 |
| `packages/shared/src/schema/tables.ts` | `??` | —— | `pnpm ddl-parity` A 段实测 |
| `packages/server/src/scripts/{init-fsrs,migrate,smoke-test,test-agent,test-agent-api,test-analyst,test-trpc,test-ws}.ts` | `M`（已跟踪） | 见 §2 表 | **有真 diff** |

我**自己**这一刀的改动面在 §6，且我留了改前副本，给出了逐行 diff（§6 末尾）。

---

## 1. A-18-2：测试装配（裁决原文："owner = T-01 修复轮，`vitest.workspace.ts` + 各包 `test` 脚本是 T-01 独占"）

### 1.1 改了什么（反查结论）

- `vitest.workspace.ts`：project 的 `root` 由相对路径改成 **绝对路径**（`projectRoot(rel) = fileURLToPath(new URL(rel, import.meta.url))`），并统一 `SPEC_INCLUDE = ['test/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}']`。文件内注释把根因写清了：vitest 3 把 workspace project 的相对 `root` 解析到 **CLI 的 cwd**，而 `pnpm --filter @tm/server test` 的 cwd 是 `packages/server` → 项目根被算成 `packages/server/packages/server` → 发现 0 用例。
- 各包 `test` 脚本统一带 `--root ../..`（实测现值）：
  - `packages/server/package.json` → `vitest run --root ../.. --project @tm/server`
  - `packages/shared/package.json` → `vitest run --root ../.. --project @tm/shared`
  - `packages/ui/package.json` → `vitest run --root ../.. --project @tm/ui`，并新增了 `//test` 键把 A-18-2 的装配口径写在那里
  - `apps/app/package.json` → `vitest run --root ../.. --project @tm/app`
- `packages/server/src/db/{index,sqlite,pg,types}.ts` 与 `packages/server/test/db/*.spec.ts` 是这套装配能被跑起来的被测试面（`git diff --stat`：index +98 / pg +359 / sqlite +335 / types +270 行；两个 spec 为未跟踪新文件）。

### 1.2 复测：与 TPM 给的口径**有一处出入**（我实测到的数，不是他的数）

TPM 说："`pnpm --filter @tm/server test -- db` 现在发现 2 文件 50 例全绿"。**我复测到的是 3 文件 / 52 例全绿**，且原因查清了，两条都做了实验：

1. **`-- db` 在这条官方命令里是空转的**：pnpm 11 把参数转发成 `"--" "db"`（命令回显可见），vitest 不再把它当文件名过滤器。证据 = 把过滤器换成一个根本不存在的路径 `zzz-nonexistent`，结果**仍是 3 文件 52 例**（下面 D2）。
2. **多出来的 2 例是并行 agent 的在写文件**：`packages/server/test/trpc-shape.spec.ts`（2 例）的 mtime 落在我的复测前几分钟内（§6.4 的 mtime 取证），属 tRPC agent 面，被"空转的过滤器"一并收进来。
3. 把过滤器**真正接上**（不经 pnpm 的 `--`）就复现 TPM 的数：**2 文件 / 50 例全绿**（D4、D5）。

→ 两种跑法都是全绿，**A-18-2 这条出口判据本身成立**；但"§10.2 官方冒烟命令只跑 db 面"这一层语义现在失效（它会跑整个 `@tm/server` 项目）。修它要动各包 `test` 脚本或装配文件 = **T-01 独占**，不在我授权面内，故只登记不修。

**实验 D1~D5 原样输出**（D1 = 官方命令本身；D2 = 把过滤器换成一个根本不存在的路径，结果一字不变 → 证明 `-- db` 空转；D3 = 不加过滤器；D4/D5 = 不经 pnpm 的 `--` 把过滤器真正接到 vitest 上的对照组）：

```
###### D1 pnpm --filter @tm/server test -- db
$ vitest run --root ../.. --project @tm/server "--" "db"
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 75ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 86ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 6ms
 Test Files  3 passed (3)
      Tests  52 passed (52)

###### D2 换一个根本不存在的路径当过滤器（若仍跑全部 = 过滤器被 -- 吞掉，不生效）
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 76ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 78ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 6ms
 Test Files  3 passed (3)
      Tests  52 passed (52)

###### D3 不带过滤器
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 71ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 75ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 6ms
 Test Files  3 passed (3)
      Tests  52 passed (52)

###### D4 直接在 vitest 上带过滤器（不经 pnpm 的 --）
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 67ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 71ms
 Test Files  2 passed (2)
      Tests  50 passed (50)

###### D5 test/db/methods.spec.ts 与 migrations.spec.ts 各多少例 + trpc-shape.spec.ts 归属
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 77ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 81ms
 Test Files  2 passed (2)
      Tests  50 passed (50)
```

---

## 2. A-18-1：`src/scripts/**` 顶层副作用门 + 默认拒绝写仓库根 `data.db`（裁决原文 owner = T-06 修复轮）

### 2.1 改了什么

新增 `packages/server/src/scripts/entry-guard.ts`（120 行，未跟踪），导出 4 件套：
`invokedDirectly(moduleUrl)`（`process.argv[1]` 比对，`moduleUrl` 必须由调用脚本显式传 `import.meta.url`）、`runWhenDirect(main, label, moduleUrl)`、`assertExplicitWriteTarget(scriptName, force)`（写库目标闸门）、`hasForceDbArg/stripForceDbArg`（`--force-db`）、`httpTargetBanner`（只打 HTTP 的脚本用的提示，不判红）。

8 个脚本接护栏（`M` = 已跟踪，有真 diff）：

| 文件 | git diff --stat | 做的事 |
|---|---|---|
| `init-fsrs.ts` | `27 +-` | 原**无条件** `main().catch(...)` → `runWhenDirect(main, …, import.meta.url)`；`main()` 前先过 `assertExplicitWriteTarget('init-fsrs', hasForceDbArg())` |
| `smoke-test.ts` | `10 +` | 整段主体收进 `main()`（自述"逻辑一字未改"）+ `runWhenDirect` + `httpTargetBanner` |
| `test-agent.ts` | `12 +-` | 同上口径 |
| `test-agent-api.ts` / `test-analyst.ts` / `test-trpc.ts` | `10 +` ×3 | 同上口径 |
| `test-ws.ts` | `7 +-` | 原无条件 `main().catch(...)` → `runWhenDirect` |
| `migrate.ts` | `279 ++--` | 自带同一口径的 `invokedDirectly()` + 导出 `protectedSqlitePaths()`（仓库根 `data.db` / `packages/server/data.db`）与 `assertSafeTarget({dbDriver,sqlitePath,iKnowThisIsProd})`，放行口令 `--i-know-this-is-prod`；`parseArgs` 对未知参数直接报错 |

受保护路径的**唯一定义源**是 `migrate.ts:protectedSqlitePaths()`，`entry-guard.ts` 用动态 `import('./migrate.js')` 取它（避免只用护栏的脚本被拖进整个 DB 层）——这条写在 `entry-guard.ts` 文件头，我在实测里确认了两处口径一致（§6.2 第三段的 W5/W5b，以及 §6.2 第四段 S2 里 `migrations.spec.ts` 那 4 条"数据红线安全阀"用例的 verbose 实测）。

### 2.2 真实验证（全部我自己跑，命令与输出原样在 §6.2）

1. **零顶层副作用**：把 `src/scripts/` 下 10 个模块（8 个脚本 + `ddl-parity-runner.ts` + `entry-guard.ts`）逐个 `node --import tsx -e "await import(…)"` 导入 → **10/10 自身输出 0 字符、exit 0**（§6.2 第一段）。
2. **默认库拒绝（sqlite 面）**：`DB_DRIVER=sqlite` 且不给 `SQLITE_PATH` → 打印"拒绝执行：init-fsrs 会写库，但没有显式设置 SQLITE_PATH。当前兜底目标 = E:\CC\tomorrow-memory\data.db" 并 **exit 1**（§6.2 第三段 W4）。
3. **显式指真库也拒绝**：`SQLITE_PATH=<仓库根>/data.db`、`SQLITE_PATH=<packages/server>/data.db` 两次都命中"SQLITE_PATH 指向仓库里的真库文件"分支，**exit 1**（W5、W5b）。
4. **正样本（不是永真的拒绝）**：`cp data.db{,-wal,-shm}` 到**仓库外** `E:/tmp/drill/copy.db`，`DB_DRIVER=sqlite SQLITE_PATH=E:/tmp/drill/copy.db` → 放行并打印 `[DB] 写入目标=sqlite:E:\tmp\drill\copy.db`、`初始化完成：新建 2 张卡片，跳过 52 张`，**exit 0**；副本 mtime 变新、真库三件套 mtime/inode 一字未动；副本目录已删除（W6、W6b、§8）。
5. **护栏自身有包内测试**：`packages/server/test/db/migrations.spec.ts:218-257` 的 `describe('数据红线安全阀（assertSafeTarget / parseArgs）')` 共 **4 条**用例（仓库根 `data.db` 拒绝 / `packages/server/data.db` 拒绝 / 临时副本+`--i-know-this-is-prod` 放行 / 未知 CLI 参数报错），我用名称过滤器单独跑了一遍 verbose → **4 passed / 21 skipped，exit 0**（§6.2 第四段 S2）。
6. **一个必须记录的环境事实**：本机 `.env` 是 `DB_DRIVER=pg` + `DATABASE_URL` 已配置。所以我第一轮不加 `DB_DRIVER=sqlite` 的 4 次运行（§6.2 第二段的 V4~V6）**并没有走到 sqlite 拒绝分支**，它们是在 pg 分支上因为"本机没有 PG 实例"而连接失败 —— 那**不是护栏放行**，但也不是护栏拒绝。要测 A-18-1 的 sqlite 语义**必须显式 `DB_DRIVER=sqlite`**，上面第 2~4 条都是这样测的。后续 agent/CI 请注意这个坑。

---

## 3. A-14：eslint 与 depcruise 两套工具的 `*-no-io` 口径对齐

实测三处同 ID 同面（都是 `src/**`，`test/**` 一并豁免）：

| 工具 | 落点 | 实测到的写法 |
|---|---|---|
| eslint | `eslint.config.js` | `files: ['packages/ui/src/**/*.ts','packages/ui/src/**/*.tsx']` → `uiForbidden`；`files: ['packages/shared/src/**/*.ts','packages/shared/src/**/*.tsx']` → `sharedForbidden`（`git diff` 里该文件 `181 ++++++++++`，含 A-14 注释） |
| depcruise | `.dependency-cruiser.cjs` | `ui-no-io` 的 `from.path = '^packages/ui/src/'`；`shared-pure` 与 `shared-pure-core` 的 `from.path = '^packages/shared/src/'`（各带 A-14 注释） |
| boundaries | `tools/boundaries.mjs` | `ui-no-io-globals` 的 `roots = ['packages/ui/src']`、`shared-pure-env` 的 `roots = ['packages/shared/src']` |

**被禁清单一条都未放宽**（实测文件内容）：`@tm/server`、`@tm/agent`、`next/navigation`、`next/*`、`@trpc/*`、`axios`、`undici`、`node:*`、`fs/http/path/os`、`react/react-dom` 全部仍在。
**反证（口径确实对齐了）**：`packages/ui/test/ui.spec.tsx:18-19` 顶层 `import { existsSync, readFileSync, readdirSync } from 'node:fs'; import path from 'node:path';` → 现在 `pnpm lint` **0 error**、`pnpm depcruise` **0 violations**（§6.1.6 与 §6.1.9）；`--self-test` 的 `ui-no-io` / `shared-pure` 正反 fixture 仍各判红/绿（§6.1.8 里 `depcruise ui-no-io 故意违规 → 红` / `depcruise shared-pure 故意违规 → 红` 与两条"干净 fixture → 绿"）。T-03 的 `import.meta.glob('?raw')` 写法按裁决保留未动（`packages/shared/test/contracts.spec.ts:156` 注释仍写着"这里不能 `import 'node:fs'`"，说明 shared 侧那处历史复杂度未被回改，也未新增豁免）。

## 4. A-16：例外条目改责任人（`legacy-web-charts-colors` / `legacy-web-charts-purple`）

`tools/exceptions.json`（未跟踪，313 行）里只动这两条的归属字段，实测原文：

- `legacy-web-charts-colors`：`assertion=colors-no-hardcode`，`file=^apps/web/src/components/charts/(forgetting-bar|growth-line|heatmap|review-line)-chart\.tsx$`，`owner="T-05（heatmap-chart.tsx + growth-line-chart.tsx）/ T-15（forgetting-bar-chart.tsx + review-line-chart.tsx）"`，`expires_after="T-05"`；
- `legacy-web-charts-purple`：`assertion=colors-purple-retired`，`file=…(growth-line|review-line)-chart.tsx$`，`owner="T-05（growth-line-chart.tsx）/ T-15（review-line-chart.tsx）"`，`expires_after="T-05"`；
- `$changelog`（同文件第 3 行）自述本轮"**只改这两条的归属字段**……未增删条目、未改 assertion、未改 file 命中面、未放宽任何规则"。

⚠ **两条如实上报的缺口**（不是我引入的，也不在我授权面内）：
1. 裁决要求"per-file 两个到期日"，但 exceptions 的命中粒度是**条目级**（`boundaries.mjs:filterExceptionHits` 只比 assertion+file+term），单条目只有一个 `expires_after`。落码方式取了两半里**最早的 T-05**（不宽于裁决），per-file 归属只写在 `owner` 文本里 —— 即"到 T-05 时，本该归 T-15 的两条也一起变红"。要真正分两个到期日必须**拆条目**，而 A-16 未授权增删条目。请 TPM 复核是否需要拆。
2. 我实测 `node tools/boundaries.mjs --self-test` 的 91 条里，与例外有关的只有"结构合法"（`exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）`）和"过期例外仍存在即红"两类；**没有任何一条断言"owner 必须等于裁决指定的任务号"**，A-16 的正确性目前无人机器可验。owner 表与 exceptions 归 T-01/T-02，故只登记。

---

## 5. 我这刀：`pnpm lint` 的 7 条 error → 0 error（TPM 直接下的令）

| # | 位置 | 规则 | 修法 | 语义影响 |
|---|---|---|---|---|
| 1 | `packages/server/test/db/migrations.spec.ts:97` | `prefer-const` | `let hits: string[] = []` → `const hits: string[] = []`（只 `push`，从不重新赋值） | 无（数组内容不变） |
| 2 | `tools/boundaries.mjs:318` | `no-unused-vars`（`files` 赋值后未用） | 删掉 `const files = uniqFile(hits);` 这一行死代码，并**连带删掉因此变成孤儿的 `uniqFile` 定义（原 154 行）** | 无（`files` 在该 `run()` 里从未被读；`uniqFile` 全仓仅此一处引用） |
| 3 | `tools/boundaries.mjs:582` | `no-useless-escape`（`\s`） | 模板串里 `\\()?\s*[` → `\\()?s*[` | **运行时正则字符串一字未变**：`"\s" === "s"` 是 ECMAScript 的 NonEscapeCharacter 规则，原代码求值出来的串本来就是 `s*`（见 §5.1 的 A 组等价证明） |
| 4 | `tools/boundaries.mjs:607` | `no-useless-escape`（`\s`） | 字符类 `[^'"\s#]` → `[^'"s#]`（同一规则：串内 `\s` 早就是 `s`） | 同上，运行时 `RegExp.source` 实测全等 |
| 5 | `tools/boundaries.mjs:756` | `no-useless-escape`（`\$`） | 字符类 `[.*+?^\$|[\]\\]` → `[.*+?^$|[\]\\]` | 字符类内 `$` 本来就是字面量；103 个字符 + 20 条真实 glob 的转义结果实测全等 |
| 6 | `tools/boundaries.mjs:769` | `no-useless-escape`（`\$`） | 同上（带 `()` 的那条） | 同上 |
| 7 | `tools/boundaries.mjs:1052` | `no-unused-vars`（`ctx` 未用参数） | `printResults(results, opts, ctx)` → `printResults(results, opts)`，并把唯一调用点（原 1161 行）的第三个实参一起去掉 | 无（函数体从未读 `ctx`；`ctx` 在调用处仍被其它语句使用） |

- **红线遵守**：7 条中没有任何一条用 `eslint-disable` 注释；`eslint.config.js` **一字未改**（`git diff --stat` 里它的 `181 +` 全属上一轮 A-14，见 §3）；未放宽任何规则。
- **为什么第 2 条不是"删了个变量"那么轻**：`uniqFile` 只被这一处使用，不连带删掉就会把 `no-unused-vars` 从 `files` 换成 `uniqFile`，等于拿一条 error 换另一条。改名 `_files` / `_ctx` 这条路在本仓库**走不通**：`.mjs` 的 `@typescript-eslint/no-unused-vars` 用的是 `tseslint.configs.recommended` 的默认配置，`argsIgnorePattern/varsIgnorePattern` 只写在 `files: ['**/*.ts','**/*.tsx']` 那个块里（`eslint.config.js:151`），对 `.mjs` 无效 —— 改前缀仍是 error。故选择"删死代码"。
- **`--self-test` 断言强度未降的证明（§6.1.8 的 91/91 + 下面 §5.1 的等价性脚本）**。

### 5.1 等价性验证脚本（只读，放在仓库外 `E:/tmp/verify-boundaries-escape.mjs`，改前副本 `E:/tmp/baseline/boundaries.before.mjs`）

它做五件事：① 把改动前/后两行的模板字面量**抽出来真实求值**，比对运行时字符串与 `RegExp.source`；② 把两处字符类字面量在 103 个字符 + 20 条真实 glob 上逐个字面化比对；③ 用 `pathToFileURL` **同时 import 改前副本和当前文件**，对真实 `ownership.json` × 23 条路径跑 `matchOwnership`，比对命中条目与排序；④ 用改动后的正则跑**正样本 + 4 个负样本**（删行/改值/写成区间），确认该报的还是报；⑤ 对受影响的 3 条断言（`enforce-flag-single-read`/`flag-defaults-match-prd`/`version-pin-overrides`）在**同一棵树、同一时刻**做 before/after A/B 对照。

脚本输出（每行一条断言，`EQ` = 通过、`FAIL` = 不通过；末行是总计）：

```
EQ   flag-defaults-match-prd：改动前/后模板求值出的运行时字符串全等 —— "passwordUpgradeEnforce\\s*:\\s*(?:JSON\\.stringify\\()?s*['\"`]([^'\"`]*)['\"`]"
EQ   flag-defaults-match-prd：RegExp.source 全等
EQ   version-pin-overrides：改动前/后模板求值出的运行时字符串全等 —— "^\\s*'?react-dom'?\\s*:\\s*['\"]?([^'\"s#]+)"
EQ   version-pin-overrides：RegExp.source 全等
EQ   globToRe 分支 alt 转义类：source 仅差「被删掉的那个反斜杠」 —— before=[[.*+?^\$|[\]\\]] after=[[.*+?^$|[\]\\]]
EQ   globToRe 分支 alt 转义类：103 个字符逐个转义结果全等 —— 差异 0 个
EQ   globToRe 分支 alt 转义类：20 条真实 glob/字符串整体转义结果全等
EQ   globToRe 单字符转义类：source 仅差「被删掉的那个反斜杠」 —— before=[[.*+?^\$|[\]\\()]] after=[[.*+?^$|[\]\\()]]
EQ   globToRe 单字符转义类：103 个字符逐个转义结果全等 —— 差异 0 个
EQ   globToRe 单字符转义类：20 条真实 glob/字符串整体转义结果全等
EQ   matchOwnership（真实归属表 × 路径样本）命中条目与排序全等 —— 23 条全等

[正样本] flags.ts 8 个开关读出：wordbookIncremental=0%  explicitFavorite=on  autoFavoriteDefault=off  studyModes=on  dailyReminder=on(20:30)  passwordRegister=on  avatarUnifiedLimit=on  passwordUpgradeEnforce=on
EQ   正样本：8 个键全部读得到且 = PRD §6.4-7 期望值
EQ   负样本①：删掉 passwordUpgradeEnforce 行 → 读不出（判"缺失"红）
EQ   负样本②：on 改成 off → 读出 off（判"应为 on"红） —— 实得 off
[正样本] overrides 6 项读出：react=19.2.8
  react-dom: 19.2.8
    react-dom=19.2.8
    @types/react=19.2.18
    @types/react-dom=19.2.5
  t  ts-fsrs=4.7.1
  zod: 3.25.76
  zod=3.25.76

EQ   正样本：6 个钉死项全部读得到
EQ   负样本③：删掉 react 行 → 读不出（判"overrides 缺 react"红）
EQ   负样本④：react 写成 ^19.2.8 → 读出 ^19.2.8（判"区间不是精确版本"红）

结论：4 处改写全部等价、断言强度未降
EQ   A/B：两版本解析出的 cursor 与例外清单全等 —— cursor=T-02，生效例外 29 条 / 已过期 0 条
EQ   A/B：enforce-flag-single-read 返回体全等 —— green | 引用点 1 个：packages/server/src/scripts/ddl-parity-runner.ts:216
EQ   A/B：flag-defaults-match-prd 返回体全等 —— green | 8 个开关初值与 PRD §6.4-7 全等
EQ   A/B：version-pin-overrides 返回体全等 —— green | 6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮

最终结论：全部等价（含 3 条断言 A/B 对照）
EQUIV_EXIT=0
```

### 5.2 `--all` / `--self-test` 与基线的差异 = 并行 agent 的落盘，不是我这刀

改前我先存了一份 `node tools/boundaries.mjs --all` / `--self-test` 输出基线，改后重跑，全文只有两行不同，且都是**计数**：

| 行 | 改前 | 改后（16:22→16:31 三次采样） | 归因 |
|---|---|---|---|
| `copy-legacy-zero` 的"需人工复核词命中"（**不判红**项） | 98 | 99 → **101** | 并行 agent 在同一分钟往 `packages/ui/src/patterns/**`、`apps/app/**` 写新文件 |
| `depcruise .` 子用例的 modules/dependencies 数 | 247/499 | 265/535 → **279/576** | 同上（depcruise 是子进程扫真树） |

两条硬证据：① §6.4 的 `find … -newermt '-30 minutes'` 列出 `apps/app/{tailwind,vite}.config.ts`、`packages/ui/src/patterns/*.tsx`、`packages/server/test/trpc-shape.spec.ts` 正在被并行 agent 写入；② §5.1 的**同刻 A/B 对照**里，三条受影响断言的返回体在改前副本与当前文件之间**逐字节全等** —— 我这刀对输出是惰性的。19/19、91/91 两次计数与退出码均未变。

---

## 6. 冒烟（全跑，输出原样；ANSI 着色码已剥离，其余未编辑）

命令顺序 = TPM 给的清单：`pnpm -r typecheck && pnpm --filter @tm/server test -- db && pnpm --filter @tm/shared test && pnpm --filter @tm/ui test && pnpm ddl-parity && pnpm depcruise && node tools/boundaries.mjs --all && node tools/boundaries.mjs --self-test && pnpm lint`（这是 9 条命令**逐条跑并各记退出码**，不是一根 `&&` 串——`typecheck` 红会短路掉后面 8 条，见 §7 的判定）。

### 6.1 九条冒烟命令逐条输出

#### 6.1.1 `pnpm -r typecheck`

```
Scope: 6 of 7 workspace projects
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck: Done
packages/agent typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck: src/patterns/index.ts(16,15): error TS2307: Cannot find module './WordDetailCard.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(17,15): error TS2307: Cannot find module './Flashcard.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(18,15): error TS2307: Cannot find module './RatingBar.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(19,15): error TS2307: Cannot find module './WordbookList.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(20,15): error TS2307: Cannot find module './StatCard.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(21,15): error TS2307: Cannot find module './GrowthLine.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(22,15): error TS2307: Cannot find module './Heatmap.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(23,15): error TS2307: Cannot find module './EmptyState.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(24,15): error TS2307: Cannot find module './ConfirmSheet.js' or its corresponding type declarations.
packages/ui typecheck: Failed
E:\CC\tomorrow-memory\packages\ui:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/ui@0.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
EXIT=2
```

#### 6.1.2 `pnpm --filter @tm/server test -- db`

```
$ vitest run --root ../.. --project @tm/server "--" "db"
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 81ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 82ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 5ms

 Test Files  3 passed (3)
      Tests  52 passed (52)
   Start at  16:31:58
   Duration  1.50s (transform 404ms, setup 0ms, collect 2.14s, tests 168ms, environment 1ms, prepare 473ms)

EXIT=0
```

#### 6.1.3 `pnpm --filter @tm/shared test`

```
$ vitest run --root ../.. --project @tm/shared
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/shared  test/contracts.spec.ts (37 tests) 90ms

 Test Files  1 passed (1)
      Tests  37 passed (37)
   Start at  16:32:01
   Duration  1.07s (transform 174ms, setup 0ms, collect 565ms, tests 90ms, environment 0ms, prepare 116ms)

EXIT=0
```

#### 6.1.4 `pnpm --filter @tm/ui test`

```
$ vitest run --root ../.. --project @tm/ui
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory


⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   @tm/ui  test/ui.spec.tsx [ packages/ui/test/ui.spec.tsx ]
Error: Failed to resolve import "./WordDetailCard.js" from "src/patterns/index.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: E:/CC/tomorrow-memory/packages/ui/src/patterns/index.ts:16:14
  3  |  export * from "./ReviewCta.js";
  4  |  export * from "./RecentSearchPanel.js";
  5  |  export * from "./WordDetailCard.js";
     |                 ^
  6  |  export * from "./Flashcard.js";
  7  |  export * from "./RatingBar.js";
 ❯ TransformPluginContext._formatLog ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42658:41
 ❯ TransformPluginContext.error ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42655:16
 ❯ normalizeUrl ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40634:23
 ❯ ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40753:37
 ❯ TransformPluginContext.transform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40680:7
 ❯ EnvironmentPluginContainer.transform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42453:18
 ❯ loadAndTransform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:35845:27

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:32:03
   Duration  1.65s (transform 205ms, setup 0ms, collect 0ms, tests 0ms, environment 472ms, prepare 140ms)

E:\CC\tomorrow-memory\packages\ui:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/ui@0.0.0 test: `vitest run --root ../.. --project @tm/ui`
Exit status 1
EXIT=1
```

#### 6.1.5 `pnpm ddl-parity`

```
$ node tools/ddl-parity.mjs
schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：users, wordbooks, profiles, checkin_logs, fsrs_cards, tutor_cache, chat_messages, assessment_cache, analyst_cache, _migrations, review_snapshots, account_audit_log, feature_flags
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B/C 段：调 packages/server/src/scripts/ddl-parity-runner.ts（sqlite=临时文件库 / pg=DATABASE_URL_TEST），同一份 tools/fixtures/schema-fixtures.json（b_cases 12 组 / c_cases 4 组）
B 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
  ⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）。
C 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
  ⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）。
EXIT=0
```

#### 6.1.6 `pnpm depcruise`

```
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (279 modules, 576 dependencies cruised)

EXIT=0
```

#### 6.1.7 `node tools/boundaries.mjs --all`

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 67 处）；需人工复核词命中 101 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   引用点 1 个：packages/server/src/scripts/ddl-parity-runner.ts:216
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   migration-forbidden        0 命中（扫描 18 个文件；例外豁免 0 处）
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
OK   colors-no-hardcode         白名单内 8 处，其余 0 命中；例外豁免 60 处
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
OK   css-important-budget       !important 1 处（预算 1，且合规）
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）

19/19 条通过，全绿
EXIT=0
```

#### 6.1.8 `node tools/boundaries.mjs --self-test`

```
OK   覆盖 copy-legacy-zero — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 deadline-key-zero — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 enforce-flag-single-read — 红用例 2 / 绿用例 1（各需 ≥1）
OK   覆盖 password-write-points — 红用例 2 / 绿用例 1（各需 ≥1）
OK   覆盖 migration-forbidden — 红用例 2 / 绿用例 1（各需 ≥1）
OK   覆盖 migration-down-declared — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 tokens-single-source — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 globals-css-no-brand-hex — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 colors-no-hardcode — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 colors-purple-retired — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 colors-tailwind-palette — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 css-important-budget — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 focus-ring-not-hidden — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 dark-variant-budget — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 ui-no-io-globals — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 shared-pure-env — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 flag-defaults-match-prd — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 version-pin-overrides — 红用例 1 / 绿用例 1（各需 ≥1）
OK   覆盖 route-string-preserved — 红用例 1 / 绿用例 1（各需 ≥1）
OK   用例引用的断言都在注册表内
OK   copy-legacy-zero @T-02 violations/copy 期望 red — 实际 red：2 处命中：apps/web/src/Settings.tsx:1 | apps/web/src/Settings.tsx:2；需人工复核词命中 0 处（不判红，UI §8.2-9 明示由走查确认）
OK   copy-legacy-zero @T-02 clean 期望 green — 实际 green：0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 0 处）；需人工复核词命中 0 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero @T-02 violations/deadline 期望 red — 实际 red：1 处命中：packages/server/src/services/auth-service.ts:1
OK   deadline-key-zero @T-02 clean 期望 green — 实际 green：0 命中
OK   enforce-flag-single-read @T-02 violations/enforce-two-reads 期望 red — 实际 red：引用点 2 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"）：packages/server/src/middleware/password-gate.ts:3 | packages/server/src/routes/auth.ts:2
OK   enforce-flag-single-read @T-07 violations/enforce-none-late 期望 red — 实际 red：引用点 0 个 —— T-07 之后必须恰好 1 处（Q9' 硬门禁未接线）
OK   enforce-flag-single-read @T-07 clean 期望 green — 实际 green：引用点 1 个：packages/server/src/services/auth-service.ts:15
OK   password-write-points @T-02 violations/password-rogue-write 期望 red — 实际 red：出现第 4 类写入点（角色无法归入 §6.5-4 的三种）：packages/server/src/routes/admin.ts:4
OK   password-write-points @T-07 violations/password-only-one-role 期望 red — 实际 red：角色 {registration} = 1 个；命中 1 处；例外豁免 0 处 —— 要求恰好 3 类
OK   password-write-points @T-07 clean 期望 green — 实际 green：角色 {activation,password-change,registration} = 3 个；命中 7 处；例外豁免 0 处
OK   migration-forbidden @T-06 violations/migration-drop 期望 red — 实际 red：1 处命中：packages/server/src/db/migrations/0004_drop_grace.ts:1[DROP COLUMN]
OK   migration-forbidden @T-06 violations/migration-backfill 期望 red — 实际 red：1 处命中：packages/server/src/db/migrations/0005_backfill_policy.ts:1[回填 UPDATE users SET pw_policy_version]
OK   migration-forbidden @T-06 clean 期望 green — 实际 green：0 命中（扫描 2 个文件；例外豁免 0 处）
OK   migration-down-declared @T-06 violations/migration-no-down 期望 red — 实际 red：1 个迁移缺 down()/noDownReason：packages/server/src/db/migrations/0006_index_only.ts
OK   migration-down-declared @T-06 clean 期望 green — 实际 green：2 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source @T-04 violations/tokens-dup 期望 red — 实际 red：2 处变量定义在 tokens.css 之外：apps/web/src/app/globals.css:2 | apps/web/src/app/globals.css:3
OK   tokens-single-source @T-04 clean 期望 green — 实际 green：7 处定义全部在 tokens.css
OK   globals-css-no-brand-hex @T-04 violations/globals-hex 期望 red — 实际 red：1 处命中：apps/web/src/app/globals.css:2
OK   globals-css-no-brand-hex @T-04 clean 期望 green — 实际 green：0 命中（扫描 apps/web/src；例外豁免 0 处）
OK   colors-no-hardcode @T-04 violations/hex-color 期望 red — 实际 red：1 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：packages/ui/src/components/Button.tsx:2
OK   colors-no-hardcode @T-04 clean 期望 green — 实际 green：白名单内 15 处，其余 0 命中；例外豁免 0 处
OK   colors-purple-retired @T-04 violations/purple 期望 red — 实际 red：1 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/web/src/app/(user)/page.tsx:1
OK   colors-purple-retired @T-04 clean 期望 green — 实际 green：白名单内 0 处，其余 0 命中；例外豁免 0 处
OK   colors-tailwind-palette @T-04 violations/tw-palette 期望 red — 实际 red：1 处命中：apps/web/src/app/(user)/page.tsx:2
OK   colors-tailwind-palette @T-04 clean 期望 green — 实际 green：0 命中（扫描 apps, packages；例外豁免 0 处）
OK   css-important-budget @T-04 violations/important 期望 red — 实际 red：唯一一条 !important 未挂在 reduced-motion 块或缺 a11y-exception 注释：apps/web/src/app/globals.css:2
OK   css-important-budget @T-04 clean 期望 green — 实际 green：!important 1 处（预算 1，且合规）
OK   focus-ring-not-hidden @T-04 violations/outline-none 期望 red — 实际 red：1 处命中：packages/ui/src/components/Button.tsx:2
OK   focus-ring-not-hidden @T-04 clean 期望 green — 实际 green：0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget @T-04 violations/dark-arbitrary 期望 red — 实际 red：dark: + 任意值（UI §5.5 禁止）：packages/ui/src/components/Card.tsx:2
OK   dark-variant-budget @T-04 clean 期望 green — 实际 green：dark: 2 处（预算 3）
OK   ui-no-io-globals @T-04 violations/ui-fetch 期望 red — 实际 red：1 处命中：packages/ui/src/hooks/useWord.ts:2
OK   ui-no-io-globals @T-04 clean 期望 green — 实际 green：0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env @T-03 violations/shared-env 期望 red — 实际 red：1 处命中：packages/shared/src/runtime.ts:1
OK   shared-pure-env @T-03 clean 期望 green — 实际 green：0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd @T-03 violations/flag-default 期望 red — 实际 red：studyModes=off（应为 on）；dailyReminder=on(09:00)（应为 on(20:30)）；avatarUnifiedLimit=off（应为 on）；passwordUpgradeEnforce=off（应为 on）
OK   flag-defaults-match-prd @T-03 clean 期望 green — 实际 green：8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides @T-01 violations/version-pin 期望 red — 实际 red：overrides react=^19.2.8
   是区间不是精确版本；overrides 缺 react-dom；overrides @types/react=~19.2.0
 是区间不是精确版本；overrides 缺 @types/react-dom；overrides 缺 ts-fsrs；overrides 缺 zod；根 package.json 又出现了 pnpm.overrides（A-1 明令禁止）
OK   version-pin-overrides @T-01 clean 期望 green — 实际 green：6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved @T-08 violations/route-deleted 期望 red — 实际 red：旧接口路径消失：/api/auth/register, /api/review/today, /api/wordbook, /api/profile, /api/checkin, /api/lookup, /api/chat；锚点 packages/server/src/routes/auth.ts:1 | packages/server/src/routes/auth.ts:1 | packages/server/src/routes/auth.ts:1 | packages/server/src/routes/auth.ts:1 | packages/server/src/routes/auth.ts:1 | packages/server/src/routes/auth.ts:1 …(+1)（例外豁免 0 处）
OK   route-string-preserved @T-08 clean 期望 green — 实际 green：旧路径清单 8 条全部在册
OK   --check-ownership 抓到 3 处越界（T-06 schema / T-04 globals.css / T-01 eslint） — packages/shared/src/schema/tables.ts 由 T-06 独占（当前任务 T-02）— §10.3：DDL 单一源，T-02 的 parity 脚本与 T-21 的审计脚本只读消费 | apps/web/src/app/globals.css 由 T-04 独占（当前任务 T-02）— §
OK   --check-ownership 放行 T-02 自己的文件
OK   routes/services 内的无主文件也判越界（owner 表按目录登记） — packages/server/src/unowned-legacy.ts 由 T-06/T-07/T-08/T-09/T-10/T-11 独占（当前任务 T-02）— §10.2 批次1/2/3 各 server 行的兜底：包内文件必须落在某个已登记的 owner 名下，无主文件按越界处理（--check-ownership 的 owner 表按目录登记）
OK   T-04 只改 import 行 → 放行（且 patch 确实被解析并落到归属条目上） — patchFiles=1 matched=apps/web/src/app/(user)/page.tsx 
OK   T-04 改了非 import 行 → 红 — apps/web/src/app/(user)/page.tsx（owner=T-12）：只允许改 import 行，实际有 1 行非 import 变更（如 apps/web/src/app/(user)/page.tsx:5 "const pending = 12;"）
OK   T-16 对根 layout 超 4 行 → 红 — apps/web/src/app/layout.tsx：T-16 允许 ≤4 行，实际 6 行
OK   T-16 对根 layout 改 4 行以内 → 放行（证明上一条不是永真）
OK   T-15 碰 (user)/layout.tsx → 红（§10.4 第 3 行零 diff） — apps/web/src/app/(user)/layout.tsx：§10.4 明示 T-15 对该文件零 diff
OK   T-05 碰 packages/ui/src/index.ts → 红（§10.4 第 4 行零 diff） — packages/ui/src/index.ts 由 T-04 独占（当前任务 T-05）— §10.3 + §10.4 第 4 行：T-05/T-13 零 diff
OK   A-4：T-12 对 apps/web/package.json 只加依赖行 → 放行
OK   A-4：T-12 改写 apps/web/package.json 既有依赖版本 → 红 — apps/web/package.json（owner=T-04）：只允许新增依赖行，实际删除/改写了 1 行
OK   exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）
OK   depcruise review-no-agent 对故意违规 fixture 报红 — violations=5
OK   例外过期机制：cursor≥expires_after 时同一违规重新计红 — 例外 legacy-review-routes-import-agent：cursor=T-10 时 15 红；cursor=T-02 时 0 红
OK   depcruise ui-no-io 故意违规 → 红 — exit=1 rules=ui-no-io 
OK   depcruise ui-no-io 干净 fixture → 绿 — exit=0 violations=
OK   depcruise review-no-agent 故意违规 → 红 — exit=5 rules=review-no-agent 
OK   depcruise review-no-agent 干净 fixture → 绿 — exit=0 violations=
OK   depcruise shared-pure 故意违规 → 红 — exit=2 rules=shared-pure 
OK   depcruise shared-pure 干净 fixture → 绿 — exit=0 violations=
OK   depcruise app-web-isolated 故意违规 → 红 — exit=1 rules=app-web-isolated 
OK   depcruise app-web-isolated 干净 fixture → 绿 — exit=0 violations=
OK   depcruise fsrs-version-lock 故意违规 → 红 — exit=1 rules=fsrs-version-lock 
OK   depcruise fsrs-version-lock 干净 fixture → 绿 — exit=0 violations=
OK   depcruise thin-facade 故意违规 → 红 — exit=1 rules=thin-facade 
OK   depcruise thin-facade 干净 fixture → 绿 — exit=0 violations=
OK   depcruise no-legacy-app-js 故意违规 → 红 — exit=1 rules=no-legacy-app-js 
OK   depcruise no-legacy-app-js 干净 fixture → 绿 — exit=0 violations=
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (279 modules, 576 dependencies cruised) 
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：91/91 通过
EXIT=0
```

#### 6.1.9 `pnpm lint`

```
$ eslint .
EXIT=0
```

#### 6.1.10 附：九条跑完之后的真库/侧文件快照（对应 §8 的数据红线自检）

```
data.db size=253952 mtimeMs=1789675538198.4495 mtime=2026-09-17T20:05:38.198Z ino=562949953845567
packages/server/data.db size=0 mtimeMs=1789575053374.1592 mtime=2026-09-16T16:10:53.374Z ino=281474977326340
GIT_STATUS_EXIT=0
```

#### 6.1.11 附：R1 与 R2 之间（16:38）单独再跑一次 `pnpm lint` 的全量输出 + 真库快照

0 error。这一轮的 3 条 warning 全在并行 agent 当时未写完的 `packages/ui/src/patterns/**` 上（到 R2 的 16:45 已收敛成 1 条，见 §6.5.9）；`@typescript-eslint/no-unused-vars` 对 `.ts/.tsx` 配的是 `'warn'`，不判红。

```
###### FINAL pnpm lint
$ eslint .

E:\CC\tomorrow-memory\packages\ui\src\patterns\RatingBar.tsx
  33:7  warning  'INDEX_OF' is assigned a value but never used  @typescript-eslint/no-unused-vars

E:\CC\tomorrow-memory\packages\ui\src\patterns\WordbookList.tsx
  103:10  warning  'TrashGlyph' is defined but never used                                            @typescript-eslint/no-unused-vars
  140:3   warning  'favoritedLabel' is defined but never used. Allowed unused args must match /^_/u  @typescript-eslint/no-unused-vars

✖ 3 problems (0 errors, 3 warnings)

EXIT=0
###### FINAL db 快照
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340
###### FINAL git status --porcelain data.db packages/server/data.db
行数=0
```

### 6.2 追加验证：A-18-1 的脚本发现流程与真库快照

四段，按时间顺序：**第一段** = 逐脚本 `import` 的零顶层副作用实测（V3）；**第二段** = 第一轮**没有**加 `DB_DRIVER=sqlite` 时的实况（V0、V4~V8b）—— 本机 `.env` 是 pg，所以那 4 次都停在 pg 连接失败上，把它们原样贴出来正是为了说明"exit≠0 不等于护栏拒绝"（§2.2 第 6 条）；**第三段** = 补上 `DB_DRIVER=sqlite` 后的 3 个拒绝分支 + 1 个放行正样本（W4~W8）；**第四段** = 护栏自身的 4 条包内用例（S1~S3）。每段头尾都带 `data.db` 三件套 + `packages/server/data.db` 的 size/mtime/inode 快照与 `git status --porcelain` 计数。

**第一段**（V3）：逐脚本 `import` → 零顶层副作用

```
###### V3：逐个 import src/scripts/*.ts（应零顶层副作用）
IMPORTED init-fsrs.ts 用时=96ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED migrate.ts 用时=113ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED smoke-test.ts 用时=32ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED test-agent.ts 用时=1519ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED test-agent-api.ts 用时=31ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED test-analyst.ts 用时=33ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED test-trpc.ts 用时=35ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED test-ws.ts 用时=46ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED ddl-parity-runner.ts 用时=150ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
IMPORTED entry-guard.ts 用时=8ms 脚本自身输出=""（长度 0 字符）
   -> exit=0
```

**第二段**（V0、V4~V8b）：第一轮未加 `DB_DRIVER=sqlite` 时的实况

```
###### V0 真库快照（跑任何脚本之前）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340

###### V4 未设 SQLITE_PATH 直接跑写库脚本 init-fsrs（期望：拒绝执行 + 非 0）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
[DB] 写入目标=pg（DATABASE_URL 显式配置：postgresql://tm_user:***@localhost:5432/tomorrow_memory）
FSRS 卡片初始化 失败: 
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### V5 显式把 SQLITE_PATH 指到仓库根真库（期望：仍然拒绝）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
[DB] 写入目标=pg（DATABASE_URL 显式配置：postgresql://tm_user:***@localhost:5432/tomorrow_memory）
FSRS 卡片初始化 失败: 
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### V5b SQLITE_PATH 指到 packages/server/data.db（期望：仍然拒绝）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
[DB] 写入目标=pg（DATABASE_URL 显式配置：postgresql://tm_user:***@localhost:5432/tomorrow_memory）
FSRS 卡片初始化 失败: 
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### V6 正样本：cp 到仓库外临时副本后用 SQLITE_PATH 指过去（期望：放行并只写副本）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
[DB] 写入目标=pg（DATABASE_URL 显式配置：postgresql://tm_user:***@localhost:5432/tomorrow_memory）
FSRS 卡片初始化 失败: 
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### V6b 副本自身 mtime（应已变新 = 写的是副本）
-rw-r--r-- 1 曹怡明 197121 253952 2026-09-18 04:05:38.198449400 +0800 /e/tmp/drill/copy.db

###### V7 真库快照（全部跑完之后）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340

###### V8 git status --porcelain data.db packages/server/data.db（期望：空输出）
   -> 输出行数=0 exit=0

###### V8b 连侧文件一起看：git status --porcelain data.db* packages/server/data.db*
   -> 输出行数=0
   （data.db* 本身在 .gitignore 里：git check-ignore -v 结果如下）
.gitignore:9:*.db	data.db
.gitignore:12:*.db-wal	data.db-wal
.gitignore:9:*.db	packages/server/data.db
```

**第三段**（V0、W4~W8）：补上 `DB_DRIVER=sqlite` 之后的拒绝分支与放行正样本

```
###### V0 真库快照（sqlite 面这轮之前）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340

###### W4 DB_DRIVER=sqlite、未设 SQLITE_PATH 跑 init-fsrs（期望：护栏拒绝执行，非 0）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
FSRS 卡片初始化 失败: 拒绝执行：init-fsrs 会写库，但没有显式设置 SQLITE_PATH。
  当前兜底目标 = E:\CC\tomorrow-memory\data.db（config 的 DATA_DIR/data.db；仓库根就是真库 data.db）。
  请 SQLITE_PATH=./tmp/xxx.db pnpm --filter @tm/server ... 指到临时副本；
  确实要动真库文件，才加 --force-db（PRD §6.4-2 步 6b：先 cp 副本再演练）。
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### W5 DB_DRIVER=sqlite + SQLITE_PATH=仓库根 data.db（期望：仍拒绝，命中受保护路径分支）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
FSRS 卡片初始化 失败: 拒绝执行：SQLITE_PATH 指向仓库里的真库文件 E:\CC\tomorrow-memory\data.db。
  演练/验收一律先 cp 到临时副本再跑（PRD §6.4-2 步 6b①）；确实要对这个文件动手才加 --force-db。
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### W5b DB_DRIVER=sqlite + SQLITE_PATH=packages/server/data.db（期望：仍拒绝）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
FSRS 卡片初始化 失败: 拒绝执行：SQLITE_PATH 指向仓库里的真库文件 E:\CC\tomorrow-memory\packages\server\data.db。
  演练/验收一律先 cp 到临时副本再跑（PRD §6.4-2 步 6b①）；确实要对这个文件动手才加 --force-db。
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 init-fsrs: `tsx src/scripts/init-fsrs.ts`
Exit status 1
   -> exit=1

###### W6 正样本：DB_DRIVER=sqlite + SQLITE_PATH=仓库外临时副本（期望：放行，只写副本）
$ tsx src/scripts/init-fsrs.ts
=== FSRS 卡片初始化 ===
[DB] 写入目标=sqlite:E:\tmp\drill\copy.db
[FSRS] 初始化完成：新建 2 张卡片，跳过 52 张（已存在）
=== 完成：新建 2，跳过 52 ===
   -> exit=0

###### W6b 副本 mtime/大小（应已变 = 写的是副本，不是真库）
-rw-r--r-- 1 曹怡明 197121 253952 2026-09-19 16:36:12.935629300 +0800 /e/tmp/drill/copy.db

###### W7 真库快照（sqlite 面这轮之后）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340

###### W8 git status --porcelain data.db packages/server/data.db
   -> 行数=0
```

**第四段**（S1~S3）：护栏自身那 4 条包内用例的 verbose 实测

```
###### S1 真库快照（本轮 verbose 复跑之前，路径相对仓库根 E:/CC/tomorrow-memory）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340

###### S2 只跑 migrations.spec.ts 里那 4 条"数据红线安全阀"用例（-t 名称过滤器 + verbose 报告器；输出已剥离 ANSI 并略去未命中用例的 21 行 ↓）
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server test/db/migrations.spec.ts -t "安全阀" --reporter=verbose
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.
 RUN  v3.2.7 E:/CC/tomorrow-memory
 ✓  @tm/server  test/db/migrations.spec.ts > 数据红线安全阀（assertSafeTarget / parseArgs） > SQLITE_PATH 指向仓库根 data.db → 拒绝执行 2ms
 ✓  @tm/server  test/db/migrations.spec.ts > 数据红线安全阀（assertSafeTarget / parseArgs） > SQLITE_PATH 指向 packages/server/data.db → 同样拒绝 0ms
 ✓  @tm/server  test/db/migrations.spec.ts > 数据红线安全阀（assertSafeTarget / parseArgs） > 临时副本路径 → 放行；显式 --i-know-this-is-prod → 放行且日志标注 0ms
 ✓  @tm/server  test/db/migrations.spec.ts > 数据红线安全阀（assertSafeTarget / parseArgs） > 未知 CLI 参数直接报错（不静默忽略） 1ms
 Test Files  1 passed (1)
      Tests  4 passed | 21 skipped (25)
   Start at  16:50:59
   Duration  1.19s (transform 231ms, setup 0ms, collect 742ms, tests 6ms, environment 0ms, prepare 189ms)
EXIT=0（该命令的真实退出码，未接管道）

###### S3 真库快照（之后）
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340
```

### 6.3 我这刀的逐行 diff（`tools/boundaries.mjs`，改前副本 vs 当前）

```diff
--- /e/tmp/baseline/boundaries.before.mjs	2026-09-19 16:25:21.549372800 +0800
+++ tools/boundaries.mjs	2026-09-19 16:24:03.423227100 +0800
@@ -151,7 +151,6 @@
   return { kept, exempted };
 };
 
-const uniqFile = (hits) => [...new Set(hits.map((h) => h.file))].sort();
 /** depcruise JSON 里 violation.rule 是 {name, severity} 对象（18.3 实测），不是字符串。 */
 const ruleName = (v) => String((v && (v.rule?.name ?? v.rule)) || '');
 const preview = (hits, n = 6) =>
@@ -315,7 +314,6 @@
         scopeRoot: ctx.scopeRoot,
         re: /passwordUpgradeEnforce/,
       }).filter((h) => !ENFORCE_DEFINITION_FILES.some((re) => re.test(h.file)));
-      const files = uniqFile(hits);
       if (hits.length > 1) {
         return {
           status: 'red',
@@ -579,7 +577,7 @@
       const src = linesOf(file).join('\n');
       const bad = [];
       for (const [key, want] of Object.entries(FLAG_DEFAULTS)) {
-        const m = new RegExp(`${esc(key)}\\s*:\\s*(?:JSON\\.stringify\\()?\s*['"\`]([^'"\`]*)['"\`]`).exec(src);
+        const m = new RegExp(`${esc(key)}\\s*:\\s*(?:JSON\\.stringify\\()?s*['"\`]([^'"\`]*)['"\`]`).exec(src);
         if (!m) bad.push(`${key}=缺失（应为 ${want}）`);
         else if (m[1] !== want) bad.push(`${key}=${m[1]}（应为 ${want}）`);
       }
@@ -604,7 +602,7 @@
         if (!block) problems.push('pnpm-workspace.yaml 无 overrides: 段（A-1 钉版本落点）');
         else {
           for (const key of ['react', 'react-dom', '@types/react', '@types/react-dom', 'ts-fsrs', 'zod']) {
-            const re = new RegExp(`^\\s*'?${esc(key)}'?\\s*:\\s*['"]?([^'"\s#]+)`, 'm');
+            const re = new RegExp(`^\\s*'?${esc(key)}'?\\s*:\\s*['"]?([^'"s#]+)`, 'm');
             const m = re.exec(block[1]);
             if (!m) problems.push(`overrides 缺 ${key}`);
             else if (/[\^~*x]/.test(m[1])) problems.push(`overrides ${key}=${m[1]} 是区间不是精确版本`);
@@ -753,7 +751,7 @@
     if (ch === '{') {
       const end = glob.indexOf('}', i);
       const alts = glob.slice(i + 1, end).split(',');
-      src += `(?:${alts.map((a) => a.replace(/[.*+?^\$|[\]\\]/g, '\\$&')).join('|')})`;
+      src += `(?:${alts.map((a) => a.replace(/[.*+?^$|[\]\\]/g, '\\$&')).join('|')})`;
       i = end;
       continue;
     }
@@ -766,7 +764,7 @@
       src += '[^/]*';
       continue;
     }
-    src += ch.replace(/[.*+?^\$|[\]\\()]/g, '\\$&');
+    src += ch.replace(/[.*+?^$|[\]\\()]/g, '\\$&');
   }
   return new RegExp(`^${src}$`);
 };
@@ -1049,7 +1047,7 @@
   return { id: assertion.id, title: assertion.title, enforce_from: assertion.enforce_from, ...res };
 };
 
-const printResults = (results, opts, ctx) => {
+const printResults = (results, opts) => {
   let red = 0;
   for (const r of results) {
     if (r.status === 'red') red += 1;
@@ -1158,7 +1156,7 @@
   } else {
     process.stdout.write(`静态断言门禁 boundaries.mjs —— cursor=${ctx.cursor}，扫描根=${ctx.scopeRoot === REPO ? '仓库根' : ctx.scopeRoot}\n\n`);
   }
-  const red = opts.json ? results.filter((r) => r.status === 'red').length : printResults(results, opts, ctx);
+  const red = opts.json ? results.filter((r) => r.status === 'red').length : printResults(results, opts);
   if (!opts.json) {
     process.stdout.write(`\n${results.length - red}/${results.length} 条通过`);
     process.stdout.write(red ? `，${red} 条红\n` : '，全绿\n');
```

### 6.4 并行 agent 在写面的取证（用来归因 §6.1 与 §6.5 里所有"不是我这一刀"的数）

```
# 并行 agent 在写面取证：最近 30 分钟内被改动的 apps/packages 源文件（我全程只碰 2 个文件，见 §6.3）
2026-09-19 16:24:07.9280571000  packages/server/test/db/migrations.spec.ts
2026-09-19 16:27:16.1217514000  packages/ui/src/patterns/index.ts
2026-09-19 16:27:31.2266294000  packages/ui/src/patterns/SearchBar.tsx
2026-09-19 16:28:00.3884998000  apps/app/vite.config.ts
2026-09-19 16:28:03.4612950000  packages/ui/src/patterns/ReviewCta.tsx
2026-09-19 16:28:22.6407489000  packages/server/test/trpc-shape.baseline.json
2026-09-19 16:28:24.7119018000  apps/app/tailwind.config.ts
2026-09-19 16:28:40.0422549000  apps/app/package.json
2026-09-19 16:28:40.0627127000  apps/app/tsconfig.json
2026-09-19 16:29:05.2785690000  packages/ui/src/patterns/LookupResultBar.tsx
2026-09-19 16:29:23.2337025000  packages/server/src/trpc/routers/dictionary.ts
2026-09-19 16:29:54.1959377000  packages/server/src/trpc/routers/wordbook.ts
2026-09-19 16:29:57.2649487000  apps/app/src/native/speak.ts
2026-09-19 16:30:12.5595835000  packages/server/src/trpc/routers/checkin.ts
2026-09-19 16:30:12.5869701000  packages/server/src/trpc/routers/profile.ts
2026-09-19 16:30:21.9001987000  packages/server/src/trpc/routers/agent.ts
2026-09-19 16:30:21.9280196000  packages/server/src/trpc/routers/chat.ts
2026-09-19 16:30:31.6937568000  apps/app/src/native/launch-focus.ts
2026-09-19 16:30:52.5740113000  packages/server/src/trpc/routers/analyst.ts
2026-09-19 16:30:52.5977185000  packages/server/src/trpc/routers/auth.ts
2026-09-19 16:31:04.5668338000  packages/ui/src/patterns/RecentSearchPanel.tsx
2026-09-19 16:31:19.2394158000  packages/server/src/trpc/routers/assessment.ts
2026-09-19 16:31:26.6598006000  packages/server/src/trpc/routers/index.ts
2026-09-19 16:31:33.2418104000  packages/server/src/app.ts
2026-09-19 16:31:33.2777384000  packages/server/src/index.ts
2026-09-19 16:32:11.4359850000  apps/app/src/native/bridge.ts
2026-09-19 16:32:35.3800343000  packages/server/test/trpc-shape.spec.ts
2026-09-19 16:33:21.1167973000  packages/server/src/trpc/routers/review.ts
2026-09-19 16:33:51.7367829000  apps/app/src/data/offline-queue.ts
2026-09-19 16:34:59.6788051000  packages/ui/src/patterns/EmptyState.tsx
2026-09-19 16:35:47.4176721000  apps/app/src/data/queries/wordbook.ts
2026-09-19 16:35:53.6500895000  apps/app/src/data/queries/lookup.ts
2026-09-19 16:36:29.0240606000  apps/app/src/data/queries/review.ts
2026-09-19 16:36:55.4173319000  apps/app/src/data/rest-fetcher.ts
2026-09-19 16:37:25.8535845000  apps/app/src/data/queries/profile.ts
2026-09-19 16:37:52.2411059000  apps/app/src/data/queries/checkin.ts
2026-09-19 16:38:23.0381518000  packages/ui/src/patterns/WordbookList.tsx
2026-09-19 16:38:46.5706140000  packages/ui/src/patterns/StatCard.tsx
2026-09-19 16:38:51.7709192000  packages/ui/src/patterns/RatingBar.tsx
2026-09-19 16:39:08.0797844000  packages/ui/src/patterns/SkeletonBlock.tsx

# packages/ui/src/patterns/ 目录实况（typecheck 报缺的 5 个组件不在其中）
total 148
-rw-r--r-- 1 曹怡明 197121  5000 2026-09-19T16:34:59 EmptyState.tsx
-rw-r--r-- 1 曹怡明 197121  8926 2026-09-19T16:40:15 GrowthLine.tsx
-rw-r--r-- 1 曹怡明 197121 17330 2026-09-19T16:41:11 Heatmap.tsx
-rw-r--r-- 1 曹怡明 197121  8700 2026-09-19T16:29:05 LookupResultBar.tsx
-rw-r--r-- 1 曹怡明 197121 35851 2026-09-19T16:26:34 README.md
-rw-r--r-- 1 曹怡明 197121  6801 2026-09-19T16:38:51 RatingBar.tsx
-rw-r--r-- 1 曹怡明 197121  5743 2026-09-19T16:31:04 RecentSearchPanel.tsx
-rw-r--r-- 1 曹怡明 197121  2124 2026-09-19T16:28:03 ReviewCta.tsx
-rw-r--r-- 1 曹怡明 197121  6685 2026-09-19T16:27:31 SearchBar.tsx
-rw-r--r-- 1 曹怡明 197121  4911 2026-09-19T16:39:08 SkeletonBlock.tsx
-rw-r--r-- 1 曹怡明 197121  3426 2026-09-19T16:38:46 StatCard.tsx
-rw-r--r-- 1 曹怡明 197121 14693 2026-09-19T16:38:23 WordbookList.tsx
-rw-r--r-- 1 曹怡明 197121  1080 2026-09-19T16:27:16 index.ts

# 被 -- db 一并收进来的并行面文件
packages/server/test/:
total 236
drwxr-xr-x 1 曹怡明 197121      0 2026-09-19T16:24:07 db/
-rw-r--r-- 1 曹怡明 197121 220147 2026-09-19T16:28:22 trpc-shape.baseline.json
-rw-r--r-- 1 曹怡明 197121  16262 2026-09-19T16:32:35 trpc-shape.spec.ts

packages/server/test/db/:
total 44
-rw-r--r-- 1 曹怡明 197121 20914 2026-09-19T15:15:25 methods.spec.ts
-rw-r--r-- 1 曹怡明 197121 19711 2026-09-19T16:24:07 migrations.spec.ts
```

### 6.5 复核轮 R2（16:42 起，同一台机器、同一工作区，九条命令原样再跑一遍）

跑 R2 的动机：并行 agent 在 R1 之后又落了 `GrowthLine.tsx` / `Heatmap.tsx`（见 §6.4），所以九条里有一条**从绿转红**了 —— 必须如实记录，不能只留对我有利的那一轮。R2 的九条**只截取尾部关键行**（完整口径与 R1 相同），末尾再附真库快照。

#### 6.5.1 `pnpm -r typecheck`

```
Scope: 6 of 7 workspace projects
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck: Done
packages/agent typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck$ tsc -p tsconfig.json --noEmit
packages/agent typecheck: Done
packages/ui typecheck: src/patterns/index.ts(16,15): error TS2307: Cannot find module './WordDetailCard.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(17,15): error TS2307: Cannot find module './Flashcard.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/index.ts(24,15): error TS2307: Cannot find module './ConfirmSheet.js' or its corresponding type declarations.
packages/ui typecheck: src/patterns/WordbookList.tsx(421,12): error TS2322: Type 'Ref<HTMLUListElement>' is not assignable to type 'Ref<HTMLDivElement> | undefined'.
packages/ui typecheck:   Type 'RefObject<HTMLUListElement | null>' is not assignable to type 'Ref<HTMLDivElement> | undefined'.
packages/ui typecheck:     Type 'RefObject<HTMLUListElement | null>' is not assignable to type 'RefObject<HTMLDivElement | null>'.
packages/ui typecheck:       Type 'HTMLUListElement | null' is not assignable to type 'HTMLDivElement | null'.
packages/ui typecheck:         Property 'align' is missing in type 'HTMLUListElement' but required in type 'HTMLDivElement'.
packages/ui typecheck: Failed
E:\CC\tomorrow-memory\packages\ui:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/ui@0.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
EXIT=2
```

#### 6.5.2 `pnpm --filter @tm/server test -- db`

```
$ vitest run --root ../.. --project @tm/server "--" "db"
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 69ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 68ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 6ms

 Test Files  3 passed (3)
      Tests  52 passed (52)
   Start at  16:41:49
   Duration  1.41s (transform 364ms, setup 0ms, collect 2.01s, tests 143ms, environment 1ms, prepare 394ms)

EXIT=0
```

#### 6.5.3 `pnpm --filter @tm/shared test`

```
$ vitest run --root ../.. --project @tm/shared
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/shared  test/contracts.spec.ts (37 tests) 97ms

 Test Files  1 passed (1)
      Tests  37 passed (37)
   Start at  16:41:52
   Duration  1.06s (transform 219ms, setup 0ms, collect 583ms, tests 97ms, environment 0ms, prepare 138ms)

EXIT=0
```

#### 6.5.4 `pnpm --filter @tm/ui test`

```
|                 ^
  6  |  export * from "./Flashcard.js";
  7  |  export * from "./RatingBar.js";
 ❯ TransformPluginContext._formatLog ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42658:41
 ❯ TransformPluginContext.error ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42655:16
 ❯ normalizeUrl ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40634:23
 ❯ ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40753:37
 ❯ TransformPluginContext.transform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:40680:7
 ❯ EnvironmentPluginContainer.transform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:42453:18
 ❯ loadAndTransform ../../node_modules/.pnpm/vite@6.4.3_@types+node@22.20.1_jiti@1.21.7_tsx@4.23.12/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:35845:27

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:41:55
   Duration  1.50s (transform 201ms, setup 0ms, collect 0ms, tests 0ms, environment 418ms, prepare 153ms)

E:\CC\tomorrow-memory\packages\ui:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/ui@0.0.0 test: `vitest run --root ../.. --project @tm/ui`
Exit status 1
EXIT=1
```

#### 6.5.5 `pnpm ddl-parity`

```
$ node tools/ddl-parity.mjs
schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：users, wordbooks, profiles, checkin_logs, fsrs_cards, tutor_cache, chat_messages, assessment_cache, analyst_cache, _migrations, review_snapshots, account_audit_log, feature_flags
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B/C 段：调 packages/server/src/scripts/ddl-parity-runner.ts（sqlite=临时文件库 / pg=DATABASE_URL_TEST），同一份 tools/fixtures/schema-fixtures.json（b_cases 12 组 / c_cases 4 组）
B 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
  ⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）。
C 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
  ⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）。
EXIT=0
```

#### 6.5.6 `pnpm depcruise`

```
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (286 modules, 615 dependencies cruised)

EXIT=0
```

#### 6.5.7 `node tools/boundaries.mjs --all`

```
RED  copy-legacy-zero           1 处命中：packages/ui/src/patterns/EmptyState.tsx:6；需人工复核词命中 105 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   引用点 1 个：packages/server/src/scripts/ddl-parity-runner.ts:216
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   migration-forbidden        0 命中（扫描 18 个文件；例外豁免 0 处）
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
RED  colors-no-hardcode         1 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：packages/ui/src/patterns/GrowthLine.tsx:8
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
OK   css-important-budget       !important 1 处（预算 1，且合规）
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）

17/19 条通过，2 条红
EXIT=1
```

#### 6.5.8 `node tools/boundaries.mjs --self-test`

```
OK   A-4：T-12 改写 apps/web/package.json 既有依赖版本 → 红 — apps/web/package.json（owner=T-04）：只允许新增依赖行，实际删除/改写了 1 行
OK   exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）
OK   depcruise review-no-agent 对故意违规 fixture 报红 — violations=5
OK   例外过期机制：cursor≥expires_after 时同一违规重新计红 — 例外 legacy-review-routes-import-agent：cursor=T-10 时 15 红；cursor=T-02 时 0 红
OK   depcruise ui-no-io 故意违规 → 红 — exit=1 rules=ui-no-io 
OK   depcruise ui-no-io 干净 fixture → 绿 — exit=0 violations=
OK   depcruise review-no-agent 故意违规 → 红 — exit=5 rules=review-no-agent 
OK   depcruise review-no-agent 干净 fixture → 绿 — exit=0 violations=
OK   depcruise shared-pure 故意违规 → 红 — exit=2 rules=shared-pure 
OK   depcruise shared-pure 干净 fixture → 绿 — exit=0 violations=
OK   depcruise app-web-isolated 故意违规 → 红 — exit=1 rules=app-web-isolated 
OK   depcruise app-web-isolated 干净 fixture → 绿 — exit=0 violations=
OK   depcruise fsrs-version-lock 故意违规 → 红 — exit=1 rules=fsrs-version-lock 
OK   depcruise fsrs-version-lock 干净 fixture → 绿 — exit=0 violations=
OK   depcruise thin-facade 故意违规 → 红 — exit=1 rules=thin-facade 
OK   depcruise thin-facade 干净 fixture → 绿 — exit=0 violations=
OK   depcruise no-legacy-app-js 故意违规 → 红 — exit=1 rules=no-legacy-app-js 
OK   depcruise no-legacy-app-js 干净 fixture → 绿 — exit=0 violations=
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (286 modules, 615 dependencies cruised) 
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：91/91 通过
EXIT=0
```

#### 6.5.9 `pnpm lint`

```
$ eslint .

E:\CC\tomorrow-memory\packages\ui\src\patterns\RatingBar.tsx
  33:7  warning  'INDEX_OF' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)

EXIT=0
```

#### 6.5.10 附：R2 之后的真库快照（含 `git status --porcelain` 行数）

```
data.db                    size=253952   mtime=2026-09-17T20:05:38.198Z ino=562949953845567
data.db-wal                size=424392   mtime=2026-09-17T20:09:16.857Z ino=2251799814109378
data.db-shm                size=32768    mtime=2026-09-16T16:53:01.562Z ino=6473924464899711
packages/server/data.db    size=0        mtime=2026-09-16T16:10:53.374Z ino=281474977326340
行数=0
```

---

## 7. 批次 1 出口判定

**两轮的退出码对照**（R1 = §6.1，16:31~16:33；R2 = §6.5，16:42~16:45）：

| §10.1 出口口径命令 | R1 退出码 | R2 退出码 | 结论 |
|---|---|---|---|
| `pnpm -r typecheck` | **2** | **2** | ❌ 红点全在 `packages/ui`：R1 是 `patterns/index.ts` 的 5 条 re-export 找不到文件；R2 缩到 3 条（`WordDetailCard`/`Flashcard`/`ConfirmSheet` 仍未创建），并**新出** 1 条 `patterns/WordbookList.tsx(421)` 的 `Ref<HTMLUListElement>` 类型错。均属并行 T-05/T-04 在写面，本 agent 未碰。 |
| `pnpm --filter @tm/server test -- db` | 0 | 0 | ✅ 两轮都是 3 文件 / 52 例全绿；把过滤器真接上 = 2 文件 / 50 例全绿（§1.2） |
| `pnpm --filter @tm/shared test` | 0 | 0 | ✅ 1 文件 / 37 例全绿 |
| `pnpm --filter @tm/ui test` | **1** | **1** | ❌ 与 typecheck 同一根因（vite 解析不到 `./WordDetailCard.js`），同一并行面 |
| `pnpm ddl-parity` | 0 | 0 | ✅ A 段/sqlite 0 差异；A/B/C 的 pg 侧**显式 SKIP**（本机无 PG，非静默通过）；B/C 段已真接到 `packages/server/src/scripts/ddl-parity-runner.ts`，b_cases 12 / c_cases 4 |
| `pnpm depcruise` | 0 | 0 | ✅ 0 violations（R1 279 modules / 576 deps → R2 286 / 615，数在随并行 agent 落盘漂移） |
| `node tools/boundaries.mjs --all` | 0（19/19） | **1（17/19）** | ⚠ **R1 全绿、R2 出现 2 条红**，两条都命中并行 agent 刚落的文件：`copy-legacy-zero` → `packages/ui/src/patterns/EmptyState.tsx:6`（禁词），`colors-no-hardcode` → `packages/ui/src/patterns/GrowthLine.tsx:8`（硬编码色值）。**不是本轮 7 条 lint 修复造成的**：我的改动面与该两条断言无关（§5.1 的同刻 A/B 对照 + §5.2 的漂移归因），且 `--self-test` 在 R2 仍 91/91。 |
| `node tools/boundaries.mjs --self-test` | 0（91/91） | 0（91/91） | ✅ 两轮 91/91，内嵌 `ddl-parity --self-test 26/26（SKIP 0）` |
| `pnpm lint` | **0 error** | **0 error** | ✅ 我这一刀的验收条：R1 无任何输出；R2 只有 1 条 warning（`patterns/RatingBar.tsx` 的 `INDEX_OF` 未用），在并行 agent 面上，`no-unused-vars` 对 `.ts/.tsx` 配的是 `'warn'`，不判红 |

**结论**：
- 我负责的 `pnpm lint` = **0 error**（7 条清零：未用 `eslint-disable`、未改 `eslint.config.js` 任何规则、正则语义经 §5.1 证明一字未变）。
- **批次 1 出口现在不能判"全绿"**，而且比 R1 又多了一条红：R1 是 9 条里 7 绿 2 红，R2 是 **6 绿 3 红**。三条红（`pnpm -r typecheck`、`pnpm --filter @tm/ui test`、`boundaries --all` 的新 2 条命中）**全部落在并行 agent 的 `packages/ui/src/patterns/**` 在写面上**，没有一条来自批次1 出口修复本身、也没有一条来自我这一刀。
- 反过来说：**A-14 / A-16 / A-18 四个出口阻塞项已各自被实测判定闭合**（A-18-1 见 §2.2 的 10 次 import + 3 个拒绝分支 + 1 个放行正样本；A-18-2 见 §1.2；A-18-4 见 §6.1.5 的 B/C 接线；A-14 见 §3 的三处同面 + lint/depcruise 双绿；A-16 见 §4 的字段原文，但带着两条待裁缺口）。等并行面把 patterns 的剩余 3 个组件 + 2 处禁词/色值收敛后，这 3 条红应一次性转绿；若届时 `boundaries --all` 仍红，就要按缺陷回环打到 T-05/T-04，而不是重开 A-18。
- 不进出口判定的登记项：pg 运行时面按 A-18-3 记 **SKIP → T-22**；`-- db` 过滤器语义空转（§1.2）；A-16 的两个到期日 + 无 owner 校验（§4）。

## 8. 数据红线自查（真库未被动过）

- 全程只在**只读**意义上碰 `data.db`：一次 `cp -p data.db data.db-wal data.db-shm` 到仓库外 `E:/tmp/drill/`，用完 `rm -rf` 已删（§6.2 第三段的 W6/W6b 证明被写的就是副本；`E:/tmp/drill` 目录现已不存在）。
- 快照对照（§6.2 第三段的 V0/W7、§6.1.10、§6.5.10、§6.1.11 末段）：`data.db` 253952 B / mtime `2026-09-17T20:05:38.198Z` / ino `562949953845567`，`data.db-wal` 424392 B / `2026-09-17T20:09:16.857Z`，`data.db-shm` 32768 B，`packages/server/data.db` 0 B / `2026-09-16T16:10:53.374Z` —— **size / mtime / inode 三指标在两轮共 18 条冒烟命令 + 10 次 import + 9 次脚本运行 + 1 次单跑 spec 前后完全一致**。
- `git status --porcelain data.db packages/server/data.db` → **0 行**（`*.db` / `*.db-wal` 在 `.gitignore:9,12`，故另附 `git check-ignore -v` 输出与文件系统快照双重证据，避免"被 ignore 掩盖改动"）。
- 未做任何 git 写操作；未 `clean`/`checkout`/`restore` 别人的未提交改动。

## 9. 越界申请与契约偏差

- **越界申请：无。** 我改的文件只有授权的 2 个：`tools/boundaries.mjs`、`packages/server/test/db/migrations.spec.ts`；§5 第 2 条里连带的 `uniqFile` 定义删除在同一文件内、属同一条 error 的必要后果。新报告文件 1 个（本文件）。
- **契约偏差：无。** 未动 API 契约、未动 schema 源、未动 eslint/depcruise/boundaries 任何规则、未新增依赖。
- **上报（不改）**：§1.2 的 `-- db` 过滤器语义空转（T-01 独占面）、§4 的两条 A-16 缺口（T-01/T-02 独占面）、§2.2 第 6 条的"本机 `.env` 是 `DB_DRIVER=pg`，测 sqlite 分支必须显式覆盖"。

## 10. 已知限制与 TODO（诚实列出）

1. **`tools/boundaries.mjs` 里我修的两处 `\s` 是"既有的、被 lint 揭示出来的语义疑点"，我按红线原样保留了。** 说清后果：`new RegExp('…\\()?\s*…')` 里 `\s` 在**字符串**里就是字母 `s`，所以：
   - `flag-defaults-match-prd` 的 `…\()?s*['"`]` 实际含义是"`JSON.stringify(` 之后**不允许**空白，且允许多个字母 s"；
   - `version-pin-overrides` 的 `[^'"s#]` 实际是"**排除字母 s**"而不是"排除空白"。
   这两条现在都能读到真实值（§5.1 的正样本 8/8、6/6），但**作者的意图**大概率是 `\s*` / `[^'"\s#]`。改它 = 放宽/改变比对口径（例如会开始容忍 `overrides: react-dom: 19.2.8` 前后空格、或让含 `s` 的版本串被截断），**A-14/A-16 一贯要求"口径不许放宽、要改由 TPM 裁决"**，所以本轮只除多余反斜杠、不碰语义。建议 TPM 单独裁一刀：若确认要 `\s*`，需同时补 `--self-test` 的 flag/version-pin 反例 fixture 到"带空格"这一维度。**现状不是缺陷**：两条断言的自测在 91/91 里判绿，红/绿两个方向都有 fixture（§6.1.8 里 `flag-defaults-match-prd @T-03 violations/flag-default → red` 与 `version-pin-overrides @T-01 violations/version-pin → red` 两条，及其各自的 clean → green 对偶）。
2. `pnpm -r typecheck` / `pnpm --filter @tm/ui test` 的两条红**不是我引入的**，我没替并行 agent 修；它们收敛前批次 1 出口无法判全绿。
3. ①~④ 的"改前版本"因未跟踪而无法 diff（§0 表格），我对它们的描述来自**文件内标注 + 我重跑的行为证据**，不是过程见证。
4. 我没有对 `migrate.ts` 做真实演练（只读它的 `assertSafeTarget`/`protectedSqlitePaths`，并在 §2.2 里靠 `migrations.spec.ts` 的 4 条安全阀用例（§6.2 第四段 verbose 实测 4 passed）+ `init-fsrs` 调用的同源函数实测覆盖）；跑真库迁移演练属 T-21/T-22 的发布面。
5. A-18-1 的 pg 分支只测到"有 `DATABASE_URL` 时返回脱敏目标"（§6.2 第二段 V4~V6 那三次就是这条路径 + PG 未起）；"pg 且 `DATABASE_URL` 未配置即拒绝"这一分支我没有真实环境可测，未验证。
6. `.delivery/**` 需求文档一字未动（A-11 要求 PM 同步的文案改动不归开发）。

## 11. 给测试 / QA 的提示（重点测哪里、哪些我没测到）

- **重点 1**：`packages/server/src/scripts/**` 的入口门。回归时请一定 **`DB_DRIVER=sqlite`** 显式覆盖（本机 `.env` 是 pg），否则你测的是 pg 分支，会误判"护栏没咬"。四条命令见 §6.2。
- **重点 2**：`ddl-parity` 的 B/C 段现在是**真接线**（`runServerAssembly` 用 tsx 起 `ddl-parity-runner.ts`，临时文件库；比对口径仍在 `tools/ddl-parity.mjs`）。QA 要看的是"pg 侧记的是显式 SKIP 而不是绿"——在 CI 起 PG 后（T-22），这三行 SKIP 必须变成真实比对。
- **重点 3**：`pnpm --filter @tm/server test -- db` 会跑整个 `@tm/server` 项目（§1.2）。CI 里若想只跑 db 面，请直接用 §6.1.2 里 D4 的写法（不经 pnpm 的 `--`），或在装配层解决；不要把"3 文件 52 例"误读成"db 面膨胀了"。
- **重点 4**：`packages/ui/src/patterns/index.ts` 与 `tools/exceptions.json` 的 A-16 两条（含"单条目两个到期日"表达不了这件事）我**没有**测到任何机器断言覆盖，建议测试面补"owner/expires_after 与裁决表逐条一致"的校验（需要 T-01/T-02 授权）。
- **没测到的路径**：pg 运行时反读比对（本机无 PG）、`migrate.ts` 的真实 `--rollback`/`--verify-data` 通路、`--force-db` 与 `--i-know-this-is-prod` 的**放行**分支（我只验证了拒绝分支与"非受保护路径"的放行，见 W6）。
