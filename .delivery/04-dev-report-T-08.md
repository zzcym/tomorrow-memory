# 开发报告 · T-08（后端）：tRPC `router.ts` 按域拆分（纯搬迁）

> 任务定义：`.delivery/02-tech-design.md` §10.2 批次2 **T-08 行**；判据①~④逐条见下。
> 结论先说：**判据① 已达成并证明有判定力；判据③ 达成；判据② 9/10 达标（`assessment.ts` 165 行，见「已知限制」）；判据④ 未达成（且成因不是本任务引入，见该节）；`tools/exceptions.json` 里并不存在带 `expires_after: T-08` 的条目，故无可删项。**

---

## 1. 完成清单

| 编号 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| T-08 判据① 快照门禁 | done | 🆕`packages/server/test/trpc-shape.spec.ts` + 🆕`packages/server/test/trpc-shape.baseline.json`(220 124 B) | 基线在**拆分前**生成，见 §2.1 |
| T-08 按域拆分 | done | 🆕`packages/server/src/trpc/routers/{index,dictionary,wordbook,review,checkin,profile,agent,assessment,chat,analyst}.ts` | 逐字搬迁，见 §4 |
| T-08 越界（已按 A-13 自证） | done | 🆕`packages/server/src/trpc/routers/auth.ts`、✏️`packages/server/src/index.ts`(**仅 1 行 export 说明符**) | 见 §5 越界申请 |
| T-08 删除原件 | done | 🗑️`packages/server/src/trpc/router.ts`(610 行) | 同一改动内删除，无双份 `appRouter` |
| T-08 判据④ 摘例外 | **未做（无可摘项）** | `tools/exceptions.json` 零改动 | 见 §2.4 |

`git status` 口径：本任务在 `packages/server` 下的改动 = 11 个新建 `trpc/routers/*.ts` + 1 个 `router.ts` 删除 + 2 个新建 test 文件 + 2 行 import（`app.ts:36`、`index.ts:33`）。其余 `M`（`src/db/**`、`src/scripts/**`、`package.json`、`tsconfig.json`）是 T-06/A-18 修复轮的未提交改动，非本任务产出，未清理、未还原、**未做任何 git 写操作**。

---

## 2. 自检与冒烟（全部真实运行，命令与关键输出原样粘贴）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @tm/server typecheck` | 通过（`tsc -p tsconfig.json --noEmit` 无输出、退出码 0） |
| `pnpm --filter @tm/server test -- trpc-shape` | `Test Files 3 passed (3) / Tests 52 passed (52)`，其中 `✓ @tm/server test/trpc-shape.spec.ts (2 tests)` |
| `pnpm --filter @tm/server test`（全量） | `Test Files 3 passed (3) / Tests 52 passed (52)`：`test/db/methods.spec.ts (25)` + `test/db/migrations.spec.ts (25)` + 本任务 2 → **T-06 的 50 个 db 用例未被打断** |
| `pnpm depcruise` | `✔ no dependency violations found (280 modules, 579 dependencies cruised)` —— 但判据④**不是靠 merit 绿的**，见 §2.4 |
| `npx eslint packages/server/src/trpc packages/server/test/trpc-shape.spec.ts` | 无输出（0 error / 0 warning） |
| `node tools/boundaries.mjs --copy` | `RED copy-legacy-zero 1 处命中：packages/ui/src/patterns/EmptyState.tsx:6` —— 命中面是 **T-05 的文件，不是本任务**；`trpc/routers/**` 0 命中（搬迁后的字符串仍落在 `legacy-server-copy-residual` 的 `^packages/server/src/` 例外面内，未新增豁免） |
| 逐字搬迁自证脚本（仓库外临时脚本，未落库） | 10/10 域过程体逐字一致，见 §4.2 |

数据库安全：全程无写操作落在 `data.db`。快照用例只读 `appRouter` 的元数据与 zod 解析器，**不构造 ctx、不调用 procedure**；`ls -l data.db` 显示 mtime 仍为 `Sep 18 04:05`（本任务开工前），`packages/server/data.db` mtime `Sep 17 00:10`（0 字节，未动）。

### 2.1 判据①：快照比对的真实输出

**顺序（关键）**：先写用例 → 在旧 `router.ts` 上生成基线 → 搬迁 → 复跑比对。

1. 基线生成（**此时 `packages/server/src/trpc/router.ts` 仍在盘上**，用例的 import 是 `../src/trpc/router.js`）：
   ```
   $ TRPC_SHAPE_UPDATE=1 pnpm --filter @tm/server test -- trpc-shape
   ✓ @tm/server test/trpc-shape.spec.ts (2 tests) 15ms
   Test Files  3 passed (3)      Tests  52 passed (52)
   ```
   基线内记录的 provenance（`trpc-shape.baseline.json` 的 `provenance` 字段，只作文档、不参与比对）：
   `sourceModule = "../src/trpc/router.js"`、`oldRouterLines = 610`、
   `oldRouterSha256GitHead = d9e7c4649158501289465dfeada80a5d585d92ed3b43dee1e67b278d1d1c625d`
   （= `git cat-file -p HEAD:packages/server/src/trpc/router.ts | sha256sum` 的实测值）。
   **基线文件留在盘上未被覆写**（拆分后未再带 `TRPC_SHAPE_UPDATE=1` 跑过）。
2. 搬迁后把用例的 import 改指 `../src/trpc/routers/index.js`，删除旧 `router.ts`，复跑：
   ```
   ✓ @tm/server test/trpc-shape.spec.ts (2 tests) 6ms
   Test Files  3 passed (3)      Tests  52 passed (52)
   ```
   → `procedures` 22 条、`callerSurface` 32 行、`counts` 全部与基线**逐字节相等**（用例把两侧 `JSON.stringify(…, null, 2)` 做字符串全等比较，不等即抛错）。

基线统计（`node -e` 读取 `trpc-shape.baseline.json` 的实测输出）：

```
procedures: 22
domains: agent,analyst,assessment,auth,chat,checkin,dictionary,profile,review,wordbook
byType: {"mutation":13,"query":8,"subscription":1}
callerFactory: init.createCallerFactory(appRouter)
paths(带中间件数): agent.chat:mutation:mw3 | analyst.refresh:mutation:mw3 | analyst.report:query:mw3 |
 assessment.generate:mutation:mw3 | assessment.submit:mutation:mw3 | auth.login:mutation:mw2 |
 auth.me:query:mw2 | auth.sendCode:mutation:mw2 | chat.history:query:mw3 | checkin.create:mutation:mw2 |
 checkin.status:query:mw2 | dictionary.lookup:subscription:mw2 | dictionary.lookupStatic:query:mw2 |
 profile.changePassword:mutation:mw3 | profile.get:query:mw2 | profile.update:mutation:mw3 |
 review.reviewCard:mutation:mw3 | review.today:query:mw2 | wordbook.add:mutation:mw3 |
 wordbook.clear:mutation:mw2 | wordbook.list:query:mw2 | wordbook.remove:mutation:mw3
procedures with null input（无 .input() 的 7 条）: auth.me, checkin.create, checkin.status,
 profile.get, review.today, wordbook.clear, wordbook.list
```

快照口径三层（用例文件头有完整注释）：
- **清单层**：`path` / `type` / `meta` / **中间件条数**（`mw2`/`mw3` 差 1 = `protectedProcedure` 的那道 `use`，能抓到「把 public 写成 protected」这类漂移）/ `input`、`output` 的 zod 结构描述（`typeName` + `shape` + `checks` + `defaultValue` 生效值 + `unknownKeys`，递归 ≤16 层）。
- **行为指纹层**：同一份 **58 例固定探针集**（缺省/null/裸标量/空对象/边界长度 0·100·101·500·501·72·73/手机号正则三种形态/rating 0~5 与字符串/period 枚举/cycle key 拼装…）逐个过 `safeParse`，记录 `ok` + `issues(path,code,message)` + **解析后的 data**（含 `.default()` 落值、`.trim()` 之类效果）。
- **调用面层**：`createCallerFactory(appRouter)` 建壳 + 走 `appRouter._def.record` 的 32 条路径（`procedure`/`namespace`）。

> **对任务书字面的一处偏离（如实）**：装的是 `@trpc/server@11.18.0`，`router.unstable_getProcedureList()` **在该版本已不存在**（`grep -r unstable_getProcedureList packages/server/node_modules/@trpc/server` → 0 命中；首版用例直调它时 `TypeError: Cannot read properties of undefined`）。同理 `appRouter.createCallerFactory` 在 11.18 的运行时对象上也不存在（`createRouter` 返回 `{...record, _def, createCaller}`）。用例的处理是：**先探测该 API，存在就调它，不存在就读同一份数据源 `_def.procedures` / `_def.record`**（v11 里 `unstable_getProcedureList` 本来就只是它的一层包装），并把实际用到的工厂来源（`init.createCallerFactory(appRouter)`）写进快照参与比对。字段口径不变：path/type/meta/input/output。

### 2.2 判据①的反证（门禁有判定力，不是永真断言）

搬迁完成后，故意把 `review.ts` 的 `RATING_SCHEMA` 多加一个 `z.literal(5)`（**随即已改回**），复跑：

```
→ appRouter 形状漂移：首个差异在第 7574 行
  现值:               },
  基线:               }
  受影响 procedure: review.reviewCard
FAIL @tm/server test/trpc-shape.spec.ts > 与拆分前的基线逐字节一致…
Tests  1 failed | 51 passed (52)
```
→ 单字符级别的入参放宽也能被抓到并定位到具体 procedure。还原后复跑回到 `52 passed`。
另外用例第一条 `it` 断言 `procedures.length ≥ 20` 且 `domains` 集合等于 10 个域名，防止「清单空了也算通过」。

### 2.3 判据②：行数统计（`wc -l packages/server/src/trpc/routers/*.ts`）

| 文件 | 行数 | ≤120 | 装了什么 |
|---|---|---|---|
| `dictionary.ts` | 73 | ✅ | `dictionary.lookup`(SSE subscription) + `dictionary.lookupStatic` |
| `wordbook.ts` | 65 | ✅ | `wordbook.list/add/remove/clear` |
| `review.ts` | 54 | ✅ | `review.today/reviewCard` + 本域私有的 `RATING_SCHEMA` |
| `checkin.ts` | 29 | ✅ | `checkin.status/create` |
| `profile.ts` | 56 | ✅ | `profile.get/update/changePassword` |
| `auth.ts` | 108 | ✅ | `auth.sendCode/login/me` + 本域私有的 `PHONE_RE`（后续 owner = T-07） |
| `agent.ts` | 30 | ✅ | `agent.chat` |
| `assessment.ts` | **165** | ❌ | `assessment.generate/submit`（源长度 138 行，见「已知限制」） |
| `chat.ts` | 16 | ✅ | `chat.history` |
| `analyst.ts` | 68 | ✅ | `analyst.report/refresh` |
| `index.ts` | 40 | — | 只做装配：`appRouter = router({ dictionary, wordbook, review, checkin, profile, auth, agent, assessment, chat, analyst })`，**键名顺序与拆分前逐字一致**；`export type AppRouter = typeof appRouter` |
| 合计 | 704 | | 拆分前原件 610 行 → 净增 94 行 = 10 × (文件头注释 + 各自 import 段)，过程体零增长（§4.2 已逐字核对） |

`PHONE_RE` 只被 auth 用、`RATING_SCHEMA` 只被 review 用 → 各自内聚进本域文件，**没有新增共享 helper 文件**（可写清单之外一个文件都不建）。

### 2.4 判据④：`review-no-agent` × `trpc/routers/review.ts` —— **未达成，如实报告**

**(a) `expires_after: T-08` 的例外条目不存在，无项可删。** 实测：
```
tools/exceptions.json 共 29 条；其中 rule=review-no-agent 的只有 1 条
  id=legacy-review-routes-import-agent, from=packages/server/src/routes/review.ts,
  owner=T-10, expires_after=T-10          ← 不是 T-08
按 expires_after=T-08 过滤 → 0 条；按 from 含 "trpc" 过滤 → 0 条
```
成因（与 §11 F-4 的预测不同）：`.dependency-cruiser.cjs` 的 `review-no-agent` 的 `from` 写的是**拆分后的三个文件名**（`services/review-service.ts|trpc/routers/review.ts|routes/review.ts`），拆分前的 `trpc/router.ts` **根本不在 `from` 集合里** → 该规则对旧文件恒不命中 → 批次1 无需为它登记例外 → 到 T-08 就没有「同 commit 删除例外」这一步。
**我没有动 `tools/**` 的任何字段**（owner/expires_after/断言/命中面全部原样）。

**(b) 拆分后 `trpc/routers/review.ts` 确实是这条规则的违规者，`pnpm depcruise` 的绿不是 merit 绿。** 把游标推到该例外到期的那一档，实测：
```
$ TM_TASK=T-10 depcruise . --config .dependency-cruiser.cjs --output-type json
review-no-agent 违规 30 条，按 from 分布：
  packages/server/src/routes/review.ts        15     ← 既存（有 T-10 例外挡着）
  packages/server/src/trpc/routers/review.ts  15     ← 本次拆分新暴露
via: packages/agent/src/index.ts → packages/agent/src/graph.ts 等 15 个可达目标
```
纯搬迁**不可能**让它变绿：`review.today` 要 `buildTodayQueue`、`review.reviewCard` 要 `applyRating/cardFromJson/cardToJson/createDefaultCard`，这四个函数现在（`02-tech-design` §4.1 也这么写）就住在 `@tm/agent` 里，而规则是**可达闭包**（穿透再导出），换任何 import 写法都红。真正清零要靠 T-10 落 `services/{review-service,fsrs}.ts`（T-10 的可写清单含 ✏️`trpc/routers/review.ts`，其判据①就是这条规则绿）。**我没有为它登记新例外**（`tools/**` 不归我，且那等于放宽门禁）。

**(c) 顺带发现一条 T-02 工具缺陷（本任务无权限修，需 TPM 拍板）**：`.dependency-cruiser.cjs` 的 `materialize()` 在生成主干规则时把 **`from.path` 自身塞进了 `from.pathNot`**（`mergeNot` 的第二段 `base.path ? [base.path] : []`）。后果：**只要某条规则挂着 ≥1 条生效例外，这条规则的主干就匹配不到任何 from，整条规则变惰性**。所以 `pnpm depcruise`（默认游标 T-02，`review-no-agent` 挂着那条 T-10 例外）对我新建的 `routers/review.ts` 报 0 违规 —— 单文件实测：
```
$ depcruise packages/server/src/trpc/routers/review.ts --config .dependency-cruiser.cjs --output-type json
violations: 0        ← 但依赖边确实在：review.ts → packages/agent/src/index.ts (aliased-tsconfig, import)
```
`A-10` 的「按规则×文件逐条豁免」意图被这行放大成「有例外=整条规则停摆」。修法是 `mergeNot(from, …)` 不并入 `base.path`（只并 `extra`），但那会立刻让 `routes/review.ts` 之外的存量面重新计红，属 T-02 owner 的活。**我没有改它。**

---

## 3. `app.ts` 的那 1 行（判据③登记的唯一例外）

```
@@ -36 +36 @@ import { metrics } from './telemetry/metrics.js';
-import { appRouter } from './trpc/router.js';
+import { appRouter } from './trpc/routers/index.js';
```
`git diff -U0 packages/server/src/app.ts packages/server/src/index.ts` 的完整输出就是上面这一行 + §5 的那一行，两文件**再无第二个 hunk** → 自证零逻辑改动。`trpc/init.ts`、`src/{routes,services,middleware,db}/**`、`packages/shared/**`、`packages/ui/**`、`apps/**` 全部零 diff。

---

## 4. 每个域文件装了什么 + 逐字搬迁自证

### 4.1 对号入座（§4.1 表格的行者列）
`dictionary`←原 :48-113、`wordbook`←:114-169、`review`←:170-213、`checkin`←:214-236、`profile`←:237-285、`auth`←:286-376、`agent`←:377-399、`assessment`←:400-541、`chat`←:542-551、`analyst`←:552-610。
`index.ts` 头部保留了原 `router.ts` 的文件级注释（那 6 行 doc），只追加 T-08 装配说明。

### 4.2 逐字核对（仓库外临时脚本，产物不落库）
对 10 个域：从 `HEAD` 版 `router.ts` 里按 `  <域>: router({` … 同缩进收尾行切出过程体，去掉一层缩进，与新文件 `export const <域> = router({` … `});` 之间的内容做字符串全等比较：
```
dictionary  旧 62行 / 新 62行  逐字一致
wordbook    旧 52行 / 新 52行  逐字一致
review      旧 40行 / 新 40行  逐字一致
checkin     旧 19行 / 新 19行  逐字一致
profile     旧 45行 / 新 45行  逐字一致
auth        旧 87行 / 新 87行  逐字一致
agent       旧 19行 / 新 19行  逐字一致
assessment  旧138行 / 新138行  逐字一致
chat        旧  6行 / 新  6行  逐字一致
analyst     旧 54行 / 新 54行  逐字一致
RESULT: 10/10 域的过程体逐字一致（仅去掉一层缩进）
```
（脚本第一版用括号计数找收尾行，被 `dictionary.lookup` 提示词里的「1) 记忆口诀 2) 词根拆解…」里的裸 `)` 提前截断 → 假报差异；改成「同缩进收尾行」判定后 10/10 一致。这条也算一次反向的漂移检测。）

未搬迁即丢失的东西：`export type AppRouter` 移到 `index.ts`（导出面经 `src/index.ts` 的 type re-export 保持不变，`apps/web/src/lib/trpc.ts:6` 的 `import type { AppRouter } from '@tm/server'` 仍解析）。

---

## 5. 越界申请（2 条，请 TPM 裁定）

1. **🆕`packages/server/src/trpc/routers/auth.ts`（108 行）不在 T-08 的可写清单里**，但 §10.2 T-08 行要求「删除 `router.ts` 且不留双份 `appRouter`」，而 `index.ts` 的装配键序必须含 `auth`（§4.1 表格明写），auth 域 87 行若不落单独文件就只能塞进 `index.ts`（会让装配文件超 120 行、且 T-07 的 ✏️`trpc/routers/auth.ts` 无处可改）。裁决取「建 `auth.ts`」：内容为**原样逐字搬迁**（§4.2 已自证），文件头注释显式写明「后续 owner = T-07」。**它不在也不该在 T-08 之后的改动面上** —— 我建完即交还。
2. **✏️`packages/server/src/index.ts:33` 的 1 行** `export type { AppRouter } from './trpc/router.js'` → `'./trpc/routers/index.js'`。这是删除被引用模块后的一行 import-only 改引，按 **A-13 的通用规则**（删/迁模块允许只改引用点 import 行 + 报告逐文件列出 + `git diff -U0` 自证）执行并已自证（§3 输出）。除 `app.ts:36` 外，全仓（`apps`/`packages`/`scripts`/`tools`，排除 node_modules 与 dist）只有这一处引用 `trpc/router`，实测 grep 全量列出。

## 6. 契约偏差

无。过程名、键序、入参/出参形状、中间件链、返回结构、注释文本全部零漂移（§2.1 + §4.2 双重证明）。未新增依赖，未写 `pnpm.overrides`，未碰 ts-fsrs 版本（A-2 口径：与 T-08 无关，本期不升）。

## 7. 已知限制与 TODO（诚实列出）

1. **`assessment.ts` = 165 行，违反判据②的 ≤120 行线**。该域在原件里就是 141 行（:400-541，`generate` 一过程含 60 行选题+缓存拼装），§4.1 明写「现内联逻辑**原样搬迁**」、搬迁纪律禁止在搬迁 commit 内夹带抽函数。要在 T-08 里压到 120 行，只能 (i) 建清单外的 `routers/assessment-helpers.ts` 并把内联逻辑挪进去（= 一次未登记的职责拆分），或 (ii) 由 T-07/T-11 抽 service 时顺带清零。**请 TPM 选：接受 165 行并登记为已知例外 / 授权我建 helper 文件 / 把 ≤120 的到期点挪到抽 service 的那一棒。** 其余 9 个域文件全 ≤108 行。
2. **判据④未达成**：`trpc/routers/review.ts` 挂着 15 条 `review-no-agent` 可达违规（现状被 T-02 的惰性规则掩盖，见 §2.4(c)）。纯搬迁无法转绿，清零点在 T-10。本期 `pnpm depcruise` 输出为绿，但那是工具缺陷造成的假绿，**不许据此认为 R-02① 的结构前提已满足**。
3. `trpc-shape.baseline.json` 220 KB：探针指纹占大头。它是有意的冗余（宁可大也要能定位漂移），若要瘦身可把探针降到 20 例，但那会削弱判定力 —— 默认保持现状。
4. 用例只读元数据，**不执行任何 procedure**：真实调用面（ctx 装配、db/LLM 行为）没测，那是 T-07/T-09/T-10/T-11 与测试（T-22）的活。给测试的提示见 §8。

## 8. 给测试的提示

- 重点盯 `review.ts` 与 `routes/review.ts` 的 `@tm/agent` 可达闭包（R-02①）：T-10 之后跑 `TM_TASK=T-10 pnpm depcruise`，若 `trpc/routers/review.ts` 仍出现在违规里就是没清干净。
- 想验判据① 的强度，别只看它绿：`TRPC_SHAPE_UPDATE=1` 会重写基线，**测试环境不许带这个环境变量**；任何入参/中间件/键序漂移都会像 §2.2 那样报出具体 procedure 名。
- `dictionary.lookup` 是唯一的 subscription（byType 里 `subscription:1`），拆包后如果它的 SSE 帧序列变了，快照抓不到（快照只看入参）→ 帧序列属 T-11/T-22 的契约测试面。
