# 04 · 开发报告 —— 门禁完整性修复轮（A-19）+ T-08 域内二拆（A-21）

- 任务：A-19（P0 门禁假绿修复 + 三条疫苗用例 + 新暴露红的逐条上报）／ A-21（`assessment` 域内二拆）
- 角色：开发工程师（T-02 门禁件 owner 侧 + T-08 服务端 tRPC 域 owner 侧）
- 唯一依据：`.delivery/04-adjudications.md` 的 A-19 / A-21 两节（另参考 A-10 登记粒度、A-12 例外结构）
- 本轮可改文件（全部在授权清单内，未越界）：
  `.dependency-cruiser.cjs`、`tools/exceptions.json`、`tools/boundaries.mjs`（仅 self-test 相关部分）、
  `tools/fixtures/selftest/**`（新增 1 个 fixture 目录）、
  `packages/server/src/trpc/routers/assessment.ts` + 新建同目录 `assessment-parts.ts`
- 未做任何 git 写操作；未在 `data.db` / `packages/server/data.db` 上跑任何写操作。

---

## 0. 一句话结论（A-19 第 4 点要求的"唯一价值证明"）

**修复前处于惰性状态的规则只有一条：`review-no-agent`（在用例外 1 条 → 整条规则永久不触发，R-02① 的结构门禁在盘上跑的一直是假绿）；修复后它真的开始咬人——同一份仓库、同一个 cursor=T-02，`pnpm depcruise` 从 exit=0「no violations」变成 exit=15 / 15 条真红。**

### 0.1 修复前的惰性规则清单（逐条，实测 `require('.dependency-cruiser.cjs')` + `tools/exceptions.json` 现算）

| 逻辑规则 | cursor=T-02 在用例外 | 修复前是否整条惰性 | 原因 |
|---|---|---|---|
| `ui-no-io` | 0 | 否（走 80-82 行早退分支） | 无在用例外 |
| **`review-no-agent`** | **1**（`legacy-review-routes-import-agent`） | **是 ⇒ 完全失效** | 有 ≥1 条在用例外 → 旧 `mergeNot` 把规则自己的 `from.path` 并进 `from.pathNot`，命中 `path` 的模块必然同时命中 `pathNot` |
| `shared-pure` | 0 | 否 | 无在用例外 |
| `shared-pure-core` | 0 | 否 | 无在用例外 |
| `app-web-isolated` | 0 | 否 | 无在用例外 |
| `app-web-isolated-reverse` | 0 | 否 | 无在用例外 |
| `fsrs-version-lock` | 0 | 否（结构上也瞎不了） | 无在用例外；且 `from` 只有 `pathNot` 没有 `path`，旧 bug 的第二项为空 |
| `thin-facade` | 0 | 否 | 无在用例外 |
| `thin-facade-pg-client` | 0 | 否 | 无在用例外 |
| `no-legacy-app-js` | 0 | 否 | 无在用例外 |

**修复后是否真的开始咬人**：
- `review-no-agent`：**是**（§2 的 15 条红 = 直接证据；`--self-test` 的 A-19① 在临时回退旧 `mergeNot` 后立刻 FAIL，见 §3.3）。
- 另外 8 条：修复前后都一直有效，本轮**没有**让任何一条变严或变松；我用"把真配置指到故意违规 fixture 上、cursor=T-02"复测了一遍（这是 §3 之外的附加自检，不改仓库）：

| 规则 | 自己的 `-violation` fixture 在 cursor=T-02 的红（修复后实测） |
|---|---|
| `ui-no-io` | 1 |
| `shared-pure` | 2 |
| `app-web-isolated` | 1 |
| `fsrs-version-lock` | 1 |
| `thin-facade` | 1 |
| `no-legacy-app-js` | 1 |
| `shared-pure-core` / `app-web-isolated-reverse` / `thin-facade-pg-client` | 无同名 fixture，跳过（见 §7 待裁决 D-4） |

### 0.2 潜在风险面（本轮没红 ≠ 规则没事）

10 条逻辑规则里有 **9 条 `from.path` 非空**、**9 条 `to.path` 非空** —— 也就是说在旧实现下，**任何人只要给这 9 条中的任何一条登记 1 条例外，那条规则当场整条失效**（`shared-pure-core` 的 `to` 没有 `path`，`fsrs-version-lock` 的 `from` 没有 `path`，是仅有的两处天然免疫）。这就是我在 `materialize()` 里加装配期自证（`assertNotBlinded`）的理由，而不只是修一处。

---

## 1. A-19 第 1 点：`materialize()` 怎么修的

`.dependency-cruiser.cjs` 的改动只有三处（逐字对照）：

1. `mergeNot` 删掉第二项 `base.path ? [base.path] : []` —— 这就是病根：`from` 侧的 `pathNot` 从此**只并各条例外登记的 `from`**，`to` 侧同理**只并例外登记的 `to`**。
2. 主干规则由 `{ ...from, pathNot: mergeNot(from, ...) }` 保持不变（现在语义正确了：主干只跳过"被登记的那个文件"，其余 from 照旧全红）。
3. 变体规则 `to: { ...to, pathNot: mergeNot(to, [entry.to]) }` 保持不变（现在语义正确了：变体只跳过"被登记的那一条 to"，同一文件的其它 to 照旧全红）。
4. **新增装配期自证 `assertNotBlinded(side, label)`**：主干的 `from.pathNot` 或任何变体的 `to.pathNot` 里一旦出现该侧自己的 `path`，配置加载时直接抛错（"规则 X 的 from.pathNot 含自身 path（永真断言，A-19）"），把这条规则**不允许再被这样装配**写死在代码里。这条守卫本身就是可回归的：§3.3 的临时回退实验里，旧 `mergeNot` 一恢复、守卫未禁用时，depcruise 直接拒绝加载配置。

### 逐条自检（A-19 第 1 点末句："修完之后，'有例外'必须只豁免被登记的那一对 from→to"）

| 组合 | 修复前 | 修复后（实测，见 §3.2 的 fixture 输出） |
|---|---|---|
| 已登记的 (from,to) | 绿（但理由是"整条规则瞎了"，不是"被豁免"） | **绿**（理由正确：变体规则的 `to.pathNot` 命中） |
| 已登记 from、**未登记 to** | 绿（假） | **红** `review-no-agent__exc_legacy-review-trpc-router-import-agent` |
| **未登记 from**、任意 to | 绿（假） | **红** `review-no-agent`（主干） |
| 例外过期（cursor ≥ expires_after） | 该规则回到主干分支 → 红（这一条旧实现碰巧也对） | **红**（同一 fixture 的 E1 在 T-09 绿 / T-10 红，实测翻转） |

---

## 2. A-19 第 3 点：修完后 `pnpm depcruise` 新暴露的**全部**红（15 条，一条不落）

命令：`pnpm depcruise`（= `depcruise . --config .dependency-cruiser.cjs`，cursor 取 `exceptions.json` 的 `gate_cursor=T-02`），在**只修 `materialize`、尚未登记任何新例外**的状态下跑，原样输出：

```
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/qdrant.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/llm-router.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/fsrs.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/embedding.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/assessment.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/tools/analyst.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/threaded.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/state.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/nodes/tutor.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/nodes/scheduler.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/nodes/orchestrator.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/nodes/lexicon.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/nodes/analyst.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/index.ts
  error review-no-agent: packages/server/src/trpc/routers/review.ts → packages/agent/src/graph.ts
x 15 dependency violations (15 errors, 0 warnings). 305 modules, 681 dependencies cruised.
[ELIFECYCLE] Command failed with exit code 15.
```

表格化（文件 + 规则 + 违规边；`review-no-agent` 是 `reachable: true`，"到达链"即 depcruise 打印的 pass-through）：

| # | from（文件） | 规则 | → to（违规边） | 到达链 |
|---|---|---|---|---|
| 1 | `packages/server/src/trpc/routers/review.ts` | `review-no-agent` | `packages/agent/src/index.ts` | 直达（`review.ts:7` 的 `import ... from '@tm/agent'`） |
| 2 | 同上 | `review-no-agent` | `packages/agent/src/graph.ts` | index.ts → graph.ts |
| 3 | 同上 | `review-no-agent` | `packages/agent/src/state.ts` | index → graph → state.ts |
| 4 | 同上 | `review-no-agent` | `packages/agent/src/threaded.ts` | index → threaded.ts |
| 5 | 同上 | `review-no-agent` | `packages/agent/src/nodes/tutor.ts` | index → graph → nodes/tutor.ts |
| 6 | 同上 | `review-no-agent` | `packages/agent/src/nodes/scheduler.ts` | index → graph → nodes/scheduler.ts |
| 7 | 同上 | `review-no-agent` | `packages/agent/src/nodes/orchestrator.ts` | index → graph → nodes/orchestrator.ts |
| 8 | 同上 | `review-no-agent` | `packages/agent/src/nodes/lexicon.ts` | index → graph → nodes/lexicon.ts |
| 9 | 同上 | `review-no-agent` | `packages/agent/src/nodes/analyst.ts` | index → graph → nodes/analyst.ts |
| 10 | 同上 | `review-no-agent` | `packages/agent/src/tools/qdrant.ts` | index → tools/qdrant.ts |
| 11 | 同上 | `review-no-agent` | `packages/agent/src/tools/llm-router.ts` | index → tools/llm-router.ts |
| 12 | 同上 | `review-no-agent` | `packages/agent/src/tools/embedding.ts` | index → tools/embedding.ts |
| 13 | 同上 | `review-no-agent` | `packages/agent/src/tools/assessment.ts` | index → tools/assessment.ts |
| 14 | 同上 | `review-no-agent` | `packages/agent/src/tools/fsrs.ts` | index → graph → nodes/scheduler → tools/fsrs.ts |
| 15 | 同上 | `review-no-agent` | `packages/agent/src/tools/analyst.ts` | index → graph → nodes/analyst → tools/analyst.ts |

- 根因一行：`packages/server/src/trpc/routers/review.ts:7`
  `import { applyRating, buildTodayQueue, cardFromJson, cardToJson, createDefaultCard } from '@tm/agent';`
  —— 只用了纯 FSRS/排期函数，但整包 barrel import 把 agent 的 15 个模块拖进可达闭包。**给 T-10 的提示**：这些函数的真正落点是 `packages/server/src/services/fsrs.ts`（S13 唯一允许 ts-fsrs 的地方），换过去即可一次清掉 15 条并删掉例外。
- **其它规则新暴露的红：0 条。** 逐条实测（同一 fixture 目录，修复前/后各跑一遍，红数不变）：
  `ui-no-io` / `shared-pure` / `shared-pure-core` / `app-web-isolated` / `app-web-isolated-reverse` /
  `fsrs-version-lock` / `thin-facade` / `thin-facade-pg-client` / `no-legacy-app-js` 在真仓库上均为 0 命中，
  本轮修复**没有**让它们中的任何一条冒出红（它们在修复前就不惰性）。
  → 因此"交你裁决的其它红"= 无（`packages/ui` / `apps/app` 的 3 条 `boundaries --all` 红与 1 条 typecheck 红是并行 agent 的域，见 §6，不属于 depcruise 新暴露面）。
- 说明：两次运行的 `(305 modules, 681 dependencies)` / `(298, 679)` 数字不同，**不是**我改了图 —— 另有 agent 正在并行删改 `packages/ui/**`、`apps/app/**`，同一命令在不同时刻的模块数本身在漂。

---

## 3. A-19 第 2 点：三条疫苗用例（缺一条即视为未修 → 三条都在，且都有判定力）

### 3.1 落点选择

放在 **`tools/boundaries.mjs --self-test`**，不放 vitest。理由：depccruise 例外的展开发生在配置文件**加载期**（`materialize()`），vitest 跑在包级 tsx 环境里拿不到 depcruise 的判定结果；而 `--self-test` 已经有 `runDepcruiseCase()` 这套"把 fixture 拷到临时目录 → 用真配置跑真 depcruise → 读 `summary.violations`"的机制，是唯一能真实观测规则物理形态的地方。既有 fixture 套路（`tools/fixtures/selftest/depcruise/<rule>-{violation,clean}`）照用。

### 3.2 新增 fixture + 用例

新增故意违规 fixture：`tools/fixtures/selftest/depcruise/review-no-agent-exception/`
（5 个源文件 + 1 个 `tsconfig.base.json`；三条 from 都落在 `review-no-agent` 的 `from.path` 里，两条 to 都落在 `to.path` 里，**规则本身一字未改**）

| 边 | from | → to | 白名单状态 | 期望 |
|---|---|---|---|---|
| E1 | `packages/server/src/routes/review.ts` | `packages/agent/src/graph.ts` | 被 `legacy-review-routes-import-agent` 登记（`^(@tm/agent\|packages/agent/\|…)` 命中） | 在用⇒**绿**；过期⇒**红** |
| E2 | `packages/server/src/services/review-service.ts` | `packages/agent/src/graph.ts` | **没有**以它为 from 的例外（主干必须吃到） | 恒**红** |
| E3 | `packages/server/src/trpc/routers/review.ts` | `packages/server/src/services/analyst.ts` | from **有**登记、但该 to **不在**登记的 to 里（变体规则必须吃到） | 恒**红** |

E2 与 E3 分别钉住 bug 的两个半边：**from 侧不许被自家 path 蒙住**、**to 侧不许被自家 path 蒙住**。

代码：`tools/boundaries.mjs` 新增 `A19_RULE / A19_FIXTURE / A19_EDGES` + `a19Vaccine()`，`selfTest()` 里新增 `6c` 段逐条 `push()`。用例游标**不写死**：
`lenientCursor = 最早 expires_after 的前一档`（=T-09，全部在用）、`strictCursor = 最晚 expires_after`（=T-10，全部过期）；
期望红/绿集合每次从 `tools/exceptions.json` 现算（口径与 `materialize` 一致：该 from 名下有没有一条 to 正则命中该 to 的在用例外），
所以 T-10 整改或删条目后用例会随之变化而**不会假绿**；红、绿两侧都要求非空，空转即红。

三条断言（当前盘上，修复后）：

```
OK   A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=T-09） — 在用例外 2 条 / 期望红 E2,E3 / 实际红 2
OK   A-19② 已豁免的那一条 (from,to) 判绿（cursor=T-09） — 期望绿 E1 / 被误判红的绿边 无
OK   A-19③ 例外过期后仍违规 → 判红（cursor=T-10，同一 fixture 的同一批边） — 在用游标下绿、过期游标必须转红的边 E1 / 过期游标期望红 E1,E2,E3 / 实际红 3 / 仍漏 无
```

（附带：`--self-test` 的断言总数从 **91 → 94**，即新增的 3 条 A-19 断言；原有 91 条一条未删、一条未改，全部保持绿。
 §5 只粘贴与本任务直接相关的 22 条，其余 72 条（注册表覆盖 / 红绿 fixture / 归属校验 / 例外体检）见终端全量 94 行。）

fixture 单独跑的原始证据（拷到临时目录、用真配置）：

```
cursor T-02 → 2 红：review-no-agent | services/review-service.ts -> agent/src/graph.ts
                  review-no-agent__exc_legacy-review-trpc-router-import-agent | trpc/routers/review.ts -> services/analyst.ts
cursor T-09 → 同上 2 红
cursor T-10 → 3 红（E1 翻红：review-no-agent | routes/review.ts -> agent/src/graph.ts）
```

### 3.3 判定力自证（**这条用例能不能抓到 A-19 那个 bug**）

把 `.dependency-cruiser.cjs` 的 `mergeNot` **临时**改回旧实现（并临时禁用新加的守卫），其余一字未动，重跑：

```
=== [临时回退到 A-19 缺陷版] pnpm depcruise ===
✔ no dependency violations found (299 modules, 683 dependencies cruised)      ← 15 条真红又消失了（假绿复现）
exit=0

=== [临时回退版] boundaries --self-test 的 A-19 三条 ===
FAIL A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=T-09） — 在用例外 2 条 / 期望红 E2,E3 / 实际红 0 / 漏报 E2,E3
OK   A-19② 已豁免的那一条 (from,to) 判绿（cursor=T-09） — 期望绿 E1 / 被误判红的绿边 无
OK   A-19③ 例外过期后仍违规 → 判红（cursor=T-10，同一 fixture 的同一批边） — 实际红 3
boundaries --self-test：93/94 通过
  - A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=T-09）
```

→ **A-19① 就是疫苗本体**（旧实现下必红转绿、断言必 FAIL）；②③ 是反向保险（防我把例外机制改成"全豁免"或"永不豁免"）。
回退实验做完已把 `mergeNot`/守卫**改回修复版**，当前盘上状态见 §5 冒烟。旧 bug 若在，新守卫还会让配置直接抛
`规则 review-no-agent 的 from.pathNot 含自身 path（永真断言，A-19）` 并阻断整条门禁 —— 已实测。

---

## 4. A-21：`assessment` 域内二拆

| 文件 | 行数 | ≤120 | 内容 |
|---|---|---|---|
| `packages/server/src/trpc/routers/assessment.ts` | **114** | ✅ | router 组装 + 2 个 procedure（`generate` / `submit`）：副作用、db 调用、rateLimit、事件写入全部留在这里 |
| `packages/server/src/trpc/routers/assessment-parts.ts` | **99** | ✅（新建） | 纯 helper + 共享 input schema：`generateInput` / `submitInput`（zod）、`CACHE_TTL`、`GEN_OPTIONS`、`AssessmentRow` 类型、`toRow()`、`pickWords()`、`applyRatingToRow()`，以及 `FsrsCard` / `FsrsRating` / `FsrsCardSeed` 三个类型别名 |

红线自检：

- **纯搬迁，procedure 的 path / input / output 形状零变化**：`pnpm --filter @tm/server test -- trpc-shape` →
  `✓ test/trpc-shape.spec.ts (2 tests)`，与盘上 T-08 基线 `test/trpc-shape.baseline.json` 的行级 diff 为 **0 行差异**（用例本身是"逐字节比较 + 打印首个差异行"，通过即无差异）；未设 `TRPC_SHAPE_UPDATE`，基线文件未被写。
  另外 `routers/index.ts` 未改（仍 `import { assessment } from './assessment.js'`，装配键序不变）。
- helper **没有**挪进 `services/**`（A-21 明令）：新文件在同目录 `trpc/routers/`，两个文件都归 T-08。
- `assessment-parts.ts` 里**不 import `ts-fsrs`** —— 用 `ReturnType<typeof cardFromJson>` / `Parameters<typeof applyRating>[1]` 取形状，否则会给 `fsrs-version-lock` 添新红。
- 行为等价细节：`toRow()` 的 `key` 由调用方传入（原实现用"选中的题型"拼 key、用"题面里的题型"填 `type` 字段，两者不一定相同），`pickWords()` 保留"先今日队列、再按卡片顺序补齐、最后 `slice(0,count)`"的原序；`applyRatingToRow()` 只算不写库，`upsertCard(...)` 仍在 procedure 里。
- 顺带闭合 T-08 报告里那条"已知限制"（源 141→165 行超线、等 T-07/T-11 抽 service 才收紧）：本轮按 A-21 就地拆，不再等下游任务。

---

## 5. 冒烟（全部实跑，输出原样粘贴）

链式命令里 `--all` 是红的（3 条，全在并行 agent 的 `packages/ui` / `apps/app` 文件里），会把 `&&` 断在第 3 步，所以按同一顺序逐条跑并各自记退出码。
下面这份是**盘上最终态的一次性连续复跑**（`(N modules, M dependencies)` 会随并行 agent 的增删漂移，同一命令本小时内出现过 298/679、299/683、300/686、301/692 几种计数，均与本轮改动无关；报告写完后再跑一次仍是 `exit=0`，只是计数变成 301/692）。

```
### [1] pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (300 modules, 686 dependencies cruised)
exit=0

### [2] node tools/boundaries.mjs --self-test
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
OK   A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=T-09） — 在用例外 2 条 / 期望红 E2,E3 / 实际红 2
OK   A-19② 已豁免的那一条 (from,to) 判绿（cursor=T-09） — 期望绿 E1 / 被误判红的绿边 无
OK   A-19③ 例外过期后仍违规 → 判红（cursor=T-10，同一 fixture 的同一批边） — 在用游标下绿、过期游标必须转红的边 E1 / 过期游标期望红 E1,E2,E3 / 实际红 3 / 仍漏 无
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (300 modules, 686 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）
（上面还有 72 条既有断言，全 OK，逐条输出见终端）
boundaries --self-test：94/94 通过
exit=0

### [3] node tools/boundaries.mjs --all
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
RED  copy-legacy-zero           4 处命中：apps/app/src/data/startup.ts:174 | apps/app/src/shell/GateLayout.tsx:4 | apps/app/src/shell/GateLayout.tsx:5 | packages/ui/src/patterns/EmptyState.tsx:6；需人工复核词命中 106 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   引用点 1 个：packages/server/src/scripts/ddl-parity-runner.ts:216
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   migration-forbidden        0 命中（扫描 18 个文件；例外豁免 0 处）
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:684 | packages/ui/test/patterns.spec.tsx:688
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）

16/19 条通过，3 条红
exit=1

### [4] pnpm --filter @tm/server test -- trpc-shape
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 77ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 77ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 7ms
 Test Files  3 passed (3)
      Tests  52 passed (52)

### [5] pnpm --filter @tm/server test
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 76ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 80ms
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 7ms
 Test Files  3 passed (3)
      Tests  52 passed (52)
exit=0

### [6] pnpm -r typecheck   （最终态，exit=0）
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck: Done
packages/ui typecheck$ tsc -p tsconfig.json --noEmit
packages/agent typecheck$ tsc -p tsconfig.json --noEmit
packages/agent typecheck: Done
packages/ui typecheck: Done
apps/app typecheck$ tsc -p tsconfig.json --noEmit
packages/server typecheck$ tsc -p tsconfig.json --noEmit
apps/app typecheck: Done
packages/server typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/web typecheck: Done
exit=0
→ 说明：本轮中途同一命令曾两次红在 apps/app（`test/rest-fetcher.spec.ts:262 Cannot find name 'handleAuthError'`、
  `test/offline-queue.spec.ts:145 Cannot find name 'isApiError'`），并行 agent 在期间改掉了；上面是**最终复跑**的结果。
  本轮涉及的包单独跑：`pnpm --filter @tm/server typecheck` = 绿。
```

### 行数统计（`wc -l packages/server/src/trpc/routers/*.ts`，真实输出）

```
   30 packages/server/src/trpc/routers/agent.ts
   68 packages/server/src/trpc/routers/analyst.ts
   99 packages/server/src/trpc/routers/assessment-parts.ts
  114 packages/server/src/trpc/routers/assessment.ts
  108 packages/server/src/trpc/routers/auth.ts
   16 packages/server/src/trpc/routers/chat.ts
   29 packages/server/src/trpc/routers/checkin.ts
   73 packages/server/src/trpc/routers/dictionary.ts
   40 packages/server/src/trpc/routers/index.ts
   56 packages/server/src/trpc/routers/profile.ts
   54 packages/server/src/trpc/routers/review.ts
   65 packages/server/src/trpc/routers/wordbook.ts
  752 total
```

---

## 6. 例外登记：本轮只加了 A-19 授权的那一条

`tools/exceptions.json` 新增 1 条（`engine=depcruise`、`rule=review-no-agent`、`owner=T-10`、`expires_after=T-10`，
按 A-10 的"规则 × 文件 × to"粒度；from 只有实测命中的那一个文件，to 逐条枚举实测的 15 个可达闭包模块，**不用目录通配**）：

```json
{
  "id": "legacy-review-trpc-router-import-agent",
  "engine": "depcruise",
  "rule": "review-no-agent",
  "from": "packages/server/src/trpc/routers/review.ts",
  "to": "^packages/agent/src/(index|graph|state|threaded)\\.ts$|^packages/agent/src/nodes/(tutor|scheduler|orchestrator|lexicon|analyst)\\.ts$|^packages/agent/src/tools/(qdrant|llm-router|fsrs|embedding|assessment|analyst)\\.ts$",
  "owner": "T-10",
  "expires_after": "T-10"
}
```

（`reason` / `evidence` 字段已按 §2 的实测输出写全。）

- 除此之外**没有**增、删、改任何例外条目的豁免面；只另动了两处纯文字：`$changelog` 追加本轮一段、`semantics.depcruise` 补一句"A-19 修复后此语义才真正成立"。
- `--self-test` 的结构体检仍绿（每条都有 owner + `expires_after=T-NN`）。
- 其它规则新暴露的红：无（见 §2），所以没有"原样保留为红、等你裁决"的 depcruise 项。

**必须提醒（A-19 第 4 点）**：现在 `pnpm depcruise` 是绿的，但**绿只因为 2 条例外在用**，R-02① 的两处真违规一行未消：
`TM_TASK=T-10 pnpm depcruise` 实测 **30 条红**（`x 30 dependency violations (30 errors, 0 warnings)`；
其中 `packages/server/src/routes/review.ts →` 15 条 = 既有例外 `legacy-review-routes-import-agent` 挡住的，
`packages/server/src/trpc/routers/review.ts →` 15 条 = 本轮新登记那条挡住的，与 §2 的清单逐条同序）。
T-10 开工那天两条例外同时到期，这 30 条会自动咬人 —— 批次 3 出口前不要把当前绿当 R-02① 的证据。

---

## 7. 待你裁决 / 提请复核

| # | 事项 | 我为什么不自作主张 |
|---|---|---|
| D-1 | `packages/ui` / `apps/app` 的 **6 处 `boundaries --all` 红**（3 条断言）：`copy-legacy-zero` 4 处（`apps/app/src/data/startup.ts:174`、`apps/app/src/shell/GateLayout.tsx:4,5`、`packages/ui/src/patterns/EmptyState.tsx:6`）、`colors-no-hardcode` 2 处（`apps/app/src/styles/app.css:5`、`packages/ui/src/patterns/GrowthLine.tsx:8`）、`css-important-budget` 3 处 >1（`packages/ui/src/styles/tokens.css:89`、`packages/ui/test/patterns.spec.tsx:684,688`）。另：`pnpm -r typecheck` 本轮中途两次红在 `apps/app`（`rest-fetcher.spec.ts:262 handleAuthError` / `offline-queue.spec.ts:145 isApiError`），18:58 的复跑已绿 | 全部落在并行 agent 正在写的文件里（T-05 patterns / T-14 shell），简报明示不代修；同一命令在几分钟内结论会翻，说明对方正在提交中，我这时插进去改必然撞车 |
| D-2 | `password-write-points` 报「角色 {activation,password-change} = 2 个 … 待 T-06/T-07 落库方法」但判 OK（未到期不红）。`registration` 那一类现在不在扫描结果里 | 属 T-06/T-07 域与既有断言语义，A-19 未授权我动 boundaries 的其它检查（简报：`tools/boundaries.mjs` 只许改 self-test 部分） |
| D-3 | 是否把 A-19 的复测口径（`TM_TASK=T-10 pnpm depcruise` 的 30 条红）写进批次 3 出口判据 | 出口判据是你/QA 的口径，我不改 §10.x |
| D-4 | `shared-pure-core`、`app-web-isolated-reverse`、`thin-facade-pg-client` 三条逻辑规则**没有自己的** `-violation/-clean` fixture（`DEPCRUISE_CASES` 只登记了 7 条），它们搭在同名兄弟规则的 fixture 上 | 补 fixture 属于扩 `--self-test` 覆盖面，超出 A-19 点名的"三条用例"，等你点头我再单独做一轮 |
| D-5 | `legacy-review-routes-import-agent` 的 to 是宽口径 `^(@tm/agent\|packages/agent/\|…)`（T-02-fix1 轮就写成这样，本轮未改）；我新登记的那条用了逐模块枚举的窄口径。同一规则两种粗细并存 | 改既有豁免面 = 新增豁免，A-19 未授权 |

## 8. 契约偏差

无。A-19 / A-21 按字面执行：规则一条没放宽、无例外降级 warn、procedure 形状零变化、helper 未进 `services/**`。
唯一"新机制"是 `materialize()` 里的装配期自证（`assertNotBlinded`）：它不改变任何规则的判定结果，只在"某条规则被装配成永真断言"时让配置加载直接失败 —— 这是 A-19 第 1 点的加固，不是新规则。

## 9. 已知限制（诚实列出）

1. 疫苗三条挂在 `boundaries --self-test` 上，不在 `pnpm test`（vitest）里；只跑 `pnpm test` 的人抓不到这个回归 —— 与 §3.1 的理由一致，批次 3 出口的官方命令序列里 `--self-test` 在（A-19 修复轮的简报也要求跑）。
2. `a19Exempted()` 在测试侧复刻了 `materialize()` 的豁免口径（from 精确相等 + to 正则命中）。它是"配置实现的镜像"，不是从配置里读出来的；若将来 `materialize` 换匹配语义（例如 from 也改正则），需同步这一处 —— 已在使用 6c 段的注释里写明。
3. 例外登记只覆盖"当前 depcruise 能解析出的路径形态"（pnpm workspace + tsconfig paths）。若将来 agent 包改用 `node_modules/@tm/agent/...` 形态解析，登记的 to 正则不吃，会变红 —— 那是安全侧失败。
4. fixture 拷贝到临时目录后跑真配置，因此**同一份 `tools/exceptions.json` 被共享**：将来若有人给 `services/review-service.ts`（E2 的 from）登记例外，E2 会从"期望红"变成"期望绿"，用例①的非空断言会立刻报"用例空转"来提示改用例 —— 不会静默失效。
5. `assessment` 二拆后仍有一处重复：`routers/review.ts` 与 `routers/assessment.ts` 各自 import 了同一批 `@tm/agent` FSRS 函数（这正是 §2 的 15 条红的家族）。真正的收敛点是 T-10/T-11 的 `services/fsrs.ts`，不在我的 owner 面内。
6. 我没跑 `pnpm -r build` / dev server（简报未要求，且 `apps/app` build 当前因并行改动处于红态）。

## 10. 给测试 / QA 的提示

- 重点回归"门禁本身"：`node tools/boundaries.mjs --self-test`（现在 94 条，其中 A-19①②③ 是本轮新增）。要复核我的判定力自证，把 `.dependency-cruiser.cjs` 的 `mergeNot` 临时加回 `base.path ? [base.path] : []` 跑一次 —— ① 必须 FAIL（**别提交这个改动**）。
- 直接看规则咬合力：`TM_TASK=T-10 pnpm depcruise` 应得 30 条红；`pnpm depcruise`（cursor=T-02）应得 0 条。两个数不对就说明例外展开又退化了。
- `packages/server/src/routes/review.ts` 与 `packages/server/src/trpc/routers/review.ts` 是 §3.5 R-02① 的现存债务（各 15 条，T-10 到期）；任何 UAT 里"评分路径不碰 LLM"的证据都应以 A-19 修复后的复测为准，不以修复前的绿为准。
- T-08 的 tRPC 契约面：`test/trpc-shape.spec.ts` 是逐字节基线比较，A-21 二拆后仍 0 差异；后续任何人改 `assessment*.ts` 只要动了 input/output 形状，这条会精确指出第一个差异行。
