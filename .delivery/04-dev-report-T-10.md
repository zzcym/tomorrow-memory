# 开发报告 · T-10（后端）：复习域评分唯一实现 + 三模式队列 + 撤销快照 + 打卡

> 任务定义：`.delivery/02-tech-design.md` §10.2 批次3 **T-10 行**（第 854 行）；覆盖 R-02 全条 / R-11 / R-12 / R-13 后端面。
> 结论先说：**判据①②③④⑤⑥⑦⑧ 全部达成并有用例取证**；`review-no-agent` 的两条 `expires_after: T-10` 例外已在本改动内删除，删后 `pnpm depcruise`（cursor=T-02）与 `TM_TASK=T-10 pnpm depcruise` **双向皆绿**；审计 S2 的两套"评分"实现已收敛为 `services/review-service.ts` 一处。
> **未达成项 0，但因本任务的整改动作连带打红 3 处别人名下的门禁**（T-08 的 `trpc-shape` 基线、T-02 `--self-test` 的 2 条用例、`--check-ownership` 的 `tools/exceptions.json` 一条），全部见 §9 待裁决，我按 A-26-3 的口径照常施工、不自行放宽、不替别人改登记表。

---

## 1. 完成清单

| 编号 | 状态 | 落点 | 备注 |
|---|---|---|---|
| 🆕 评分唯一实现 | done | `packages/server/src/services/review-service.ts`(278 行) | `rateCard()` / `undoRating()`，REST 与 tRPC 都只转调它 |
| 🆕 ts-fsrs 唯一入口 | done | `packages/server/src/services/fsrs.ts`(144 行) | 全仓 `import ... from 'ts-fsrs'` 在 `packages/server/src` 内只此一处（§5） |
| 🆕 三模式队列 | done | `packages/server/src/services/queue-service.ts`(165 行) | `review`/`new`/`selfTest`；后两者走 `bootstrap:false` 纯读分支 |
| 🆕 打卡唯一实现 | done | `packages/server/src/services/checkin-service.ts`(64 行) | `streak` 单源 = `db.checkins.getStreak`；`dueToday` 与队列同算法 |
| ✏️ REST 门面瘦身为转调 | done | `packages/server/src/routes/review.ts`(102 行)、`routes/checkin.ts`(27 行) | 零 `db.` 直调、零 `@tm/agent`、零 `fetch`；+`POST /api/review/undo`、+`GET /api/review/queue` |
| ✏️ tRPC 门面 | done | `trpc/routers/review.ts`(73 行)、`trpc/routers/checkin.ts`(18 行) | 中文字面量清零（A-23-7）；新增 `review.queue` / `review.undo` |
| 🆕 判据③④⑤⑥⑦⑧ 用例 | done | `test/integration/review-parity.spec.ts`(500 行, 24 用例) | 临时 sqlite + 冻结时钟 + 双门面全等 |
| 🆕 判据② 用例 | done | `test/review-no-llm.spec.ts`(245 行, 16 用例) | fetch/agentDeps/llmRouter 触之即抛，四档仍 200 |
| 🗑️ 删除 `expires_after: T-10` 例外 | done | `tools/exceptions.json` | 删 2 条（A-25 说的"唯一例外"实测是 2 条，见 §6） |
| ✏️ 依赖声明 | done | `packages/server/package.json` 加 `"ts-fsrs": "^4.1.1"` | 实装版本由 `pnpm-workspace.yaml` 的 override 钉 4.7.1（A-1/A-2），未写 `pnpm.overrides` |

**未做 git 写操作**（无 commit/push/stash/checkout/reset/clean）。工作区里 `packages/server/src/services/{auth-service,account-audit,feature-flags,password-policy}.ts`、`auth-policy.ts` 等 `??`/`M` 是 T-07/T-06 的在途改动，非本任务产出，未清理未还原。

---

## 2. 冒烟与门禁（真实输出，命令原样）

### 2.1 指定冒烟命令 `pnpm --filter @tm/server test -- review-parity review-no-llm && pnpm depcruise`

```
$ vitest run --root ../.. --project @tm/server "--" "review-parity" "review-no-llm"
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. …
 RUN  v3.2.7 E:/CC/tomorrow-memory
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 102ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 107ms
[T-10 判据①] packages/server/src 内 import 'ts-fsrs' 的文件 = ["services/fsrs.ts"]
 ✓  @tm/server  test/review-no-llm.spec.ts (16 tests) 87ms
stdout | test/integration/review-parity.spec.ts > 判据⑦ 单次评分 P95 < 300ms（本机 sqlite，100 次采样，进程内断言） > POST /api/review ×100 的 P95 在阈值内
[T-10 判据⑦] POST /api/review n=100 p50=0.89ms p95=4.79ms max=7.75ms
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 281ms
   ✓ T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 快照非空（防止空清单把门禁跑成永真） 2ms
   × T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面） 12ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   @tm/server  test/trpc-shape.spec.ts > …
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, review.queue, review.undo
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 91 passed (92)
```

- **本任务两文件 40/40 全绿**（24 + 16），且 `&& pnpm depcruise` 一侧绿：
  `✔ no dependency violations found (344 modules, 851 dependencies cruised)`
- ⚠ `pnpm --filter` 会把 `--` 原样透传给 vitest（命令行里能看到 `"--" "review-parity"`），**位置参数没起到过滤作用**，所以这条命令实际跑的是 @tm/server 全项目 5 个文件。因此 §2.1 与 §2.2 的输出同源，唯一失败项是 T-08 的基线快照（见 §9-1）。

### 2.2 `pnpm --filter @tm/server test`（全量，证明没打断别人的用例）

`Test Files 1 failed | 4 passed (5) / Tests 1 failed | 91 passed (92)` —— T-06 的 `db/methods`(25) 与 `db/migrations`(25) 全绿，`trpc-shape` 的"快照非空"用例绿、比对用例红（成因见 §9-1）。**开工前基线**：`Test Files 3 passed (3) / Tests 52 passed (52)`（当时 `trpc-shape` 尚绿 → 之后 T-07 往 `appRouter` 加了 7 个 auth 过程，第一个差异点是 `auth.activate`，先于我的 `review.*`）。

### 2.3 depcruise 双游标（删例外前后各跑）

| 时点 | cursor=T-02（默认） | `TM_TASK=T-10`（该例外已过期） |
|---|---|---|
| 整改后、删条目**前** | `✔ no violations (341 modules, 823 deps)` | `✔ no violations (342 modules, 826 deps)` |
| 删条目**后** | `✔ no violations (344 modules, 851 deps)` | `✔ no violations (344 modules, 851 deps)` |

模块数在两次测量之间变化是因为工作区被并行 agent（T-07/T-12/T-20）同时写入，不是我的改动。`TM_TASK=T-10` 那一列的意义：**规则在"例外本应失效"的游标下咬人时，复习域 0 命中**，所以删条目不会把门禁搞成"靠例外才绿"。

### 2.4 `pnpm -r typecheck`

```
packages/shared typecheck: Done
packages/agent typecheck: Done
packages/ui typecheck: Done
apps/app typecheck: Done
packages/server typecheck: src/app.ts(163,13): error TS2353 … 'data' does not exist in type …
packages/server typecheck: src/routes/auth.ts(33,12): error TS2589: Type instantiation is excessively deep …
packages/server typecheck: src/routes/auth.ts(42,66): error TS2339: Property 'header' does not exist on type '{ raw: Request; }'.
packages/server typecheck: src/trpc/init.ts(77,7): error TS2353 …
packages/server typecheck: src/trpc/routers/auth.ts(69,7): error TS2353 …
packages/server typecheck: Failed
```

**5 处红全部落在 T-07 的文件**（`app.ts` / `routes/auth.ts` / `trpc/init.ts` / `trpc/routers/auth.ts`），与本任务无关（我开工时它们是另外 3 处红：`middleware/auth.ts`×2 + `services/feature-flags.ts`，说明 T-07 正在改）。**我名下 10 个文件 0 error / 0 warning**：`grep` 过 `tsc` 输出，无一条指向我写的文件。按铁律不替并行 agent 修红。

### 2.5 eslint（只跑我名下 10 个文件）

`npx eslint <10 files>` → **无输出（0 error / 0 warning）**。（首轮有 4 条 warning：2 条未使用变量、2 条多余的 `eslint-disable`，已改代码消除而非加豁免。）

### 2.6 `node tools/boundaries.mjs --self-test`（删例外前后）

| | 删前 | 删后 |
|---|---|---|
| 计数 | `99/100 通过` | `96/98 通过` |
| 失败项 | `例外过期机制：cursor≥expires_after 时同一违规重新计红 — 例外 legacy-review-routes-import-agent：cursor=T-10 时 0 红；cursor=T-02 时 0 红` | 同一条（detail 变为 `exceptions.json 里没有 depcruise 条目可证明过期`）+ `A-19 前置：exceptions.json 里至少有一条 review-no-agent 例外` |
| 判据① 直接相关的两条 | `OK depcruise review-no-agent 对故意违规 fixture 报红 — violations=5`、`OK … 故意违规 → 红 — exit=5 rules=review-no-agent`、`OK … 干净 fixture → 绿` | 三条**全部仍 OK** |

条数从 100 变 98 的原因：A-19 疫苗在用例外存在时展开成 3 条用例（①②③），例外清零后 `a19Vaccine()` 短路成 1 条 setup 红（`tools/boundaries.mjs:1607-1612`）。两条红的**根因都是"违规被真的修好了 + 例外被真的删了"**，而不是规则失效：见 §9-2 的复现定位与修法建议。

### 2.7 `TM_TASK=T-10 node tools/boundaries.mjs --check-ownership --files <我触碰的 12 个文件>`

```
NOTE packages/server/package.json：归属表无条目（no-entry，不阻断）
RED  tools/exceptions.json 由 T-02 独占（当前任务 T-10）— §2 tools/ 四项均归 T-02；scripts/release/** 归 T-21（另有条目）
--check-ownership task=T-10 触碰 12 个文件 → 1 处越界
```

4 个新服务 + 2 门面 + 2 tRPC 路由 + 2 用例 **全部放行**（A-25 预警的"批次3 开工前先对齐 §10.2/§10.3"看起来已做过，`services/**` 粗粒度串未误判我）。唯一红是 A-26-2 明确授权我做的事（删 `expires_after == 当前 TM_TASK` 的条目），但 A-26-2 结尾"owner = T-02 落地机检"的机检还没进 `tools/ownership.json` → 按 A-26-3 照常施工并把红记进报告（§9-3）。

### 2.8 数据库红线

全程只在 `os.tmpdir()` 下的临时库跑（`tm-t10-parity-<pid>/parity.db`、`tm-t10-nollm-<pid>/no-llm.db`，`afterAll` 里 `fs.rmSync(..., {recursive:true, force:true})`），**没有任何写操作落在 `data.db`**：

```
-rw-r--r-- 1 … 253952 2026-09-18 04:05 data.db
-rw-r--r-- 1 …      0 2026-09-17 00:10 packages/server/data.db
```

两个 mtime/大小与 T-08 报告 §2 记录的开工前值逐字相同（`Sep 18 04:05` / `Sep 17 00:10` / 0 字节）→ 本任务未触碰。测试里唯一"评了 100 次"的是临时库上的 `perf-apple`。

---

## 3. 判据①~⑧ 逐条取证

| 判据 | 结论 | 证据 |
|---|---|---|
| ① `depcruise review-no-agent` 绿且 fixture 违规能红 | **达成** | 绿：§2.3 双游标 `✔ no violations`；红：§2.6 的 `depcruise review-no-agent 故意违规 → 红 exit=5`（fixture `tools/fixtures/selftest/depcruise/review-no-agent-{violation,clean,exception}`）+ 用例 `[T-10 判据①] packages/server/src 内 import 'ts-fsrs' 的文件 = ["services/fsrs.ts"]`（S13 半边，见 §5） |
| ② fetch/LLM 换成 throw 后四档评分仍 200 | **达成** | `test/review-no-llm.spec.ts` 16 用例：`vi.stubGlobal('fetch', 抛错)` + `agentDeps`/`llmRouter` 换成"读属性/调用即抛"的 Proxy，REST 四档 200 且 `response === ''`；tRPC 四档同样 200；`undo`/`queue`/`today`/打卡两门面同在抛throw世界里 200 |
| ③ 双端同 `(user,word,rating)` 的 `due/state/reps` 逐字段相等 | **达成（4/4 档）** | §4 的比对方法；除三字段外还断言整响应体全等（除 `reviewedAt` 单独比）、`fsrs_cards.data` **逐字节**相等、`last_review` 相等、两侧都是 shared `ReviewResultSchema` 的合法实例 |
| ④ rating 越界 → 400 `INVALID_RATING`（非截断） | **达成** | 7 个非法值 `[0,5,-1,2.5,'x',null,undefined]` 逐个 400 + `code='INVALID_RATING'` + 卡片 `fsrs_data` 一字不变（`normalizeRating` 用 `RATING_VALUES.includes`，全域无 `Math.min/max`）；tRPC 侧同值 → `BAD_REQUEST`（400 语义），文案见 §7 D-1 |
| ⑤ `mode=new/selfTest` 不写 FSRS 卡（`fsrs_cards` 行数不变） | **达成** | 队列表面：取队前后 `rowCount` 与 `cardStateOf`（`[word,fsrs_data,last_review]` 全表指纹）逐字相等；评分表面：`mode=selfTest` 的 `POST /api/review` 返回 `scheduled:false` 且 `fsrs_data` 与评分前同一串。机检口径 = `todayQueue(..., {bootstrap:false})` 分支内**没有任何** `upsertCard/saveData/snapshots.save` 调用 |
| ⑥ `review.undo` 后 `data/due/reps` 回到快照值，序列化格式与 ts-fsrs 版本未变 | **达成** | 评 `rating=1` → `reps 3→4`、`fsrs_data` 变；undo 后 `fsrs_data` **逐字节等于起点 `FIXTURE_DATA`**（回写的是快照 `prev_data` 原文，不是重新序列化的结果）、`due` 与 `last_review` 同前、`reps` 回 3；`cardToJson(createDefaultCard(0))` 与手写 `SERIALIZATION_SNAPSHOT` 全等（键集合+键序）；`cardToJson(cardFromJson(x)) === x` 往返自证；实装版本断言 `installedTsFsrsVersion() === '4.7.1'`；tRPC `review.undo` 同一实现同一串；`remaining=UNDO_MAX_PER_SESSION-1`、`index=0`、同一张卡撤第二次 409 `NOTHING_TO_UNDO`、第 4 次撤销 429 `UNDO_LIMIT_REACHED` |
| ⑦ P95 < 300ms（本机 sqlite，100 次采样，进程内断言） | **达成** | 用例内 `console.log` + `expect(p95).toBeLessThan(300)`。6 次实跑：`p95=2.48 / 2.90 / 2.05 / 2.18 / 4.79 / 2.80 ms`（p50 ≈ 0.8 ms，max ≤ 12.7 ms）。采样 = 真实 HTTP 形状经 Hono `app.request()` 走完整门面（auth 中间件 + JWT 验签 + 读卡 + 存快照 + 写卡），不是裸函数调用 |
| ⑧ `POST /api/review`、`GET /api/review/today` 响应形状不变 | **达成** | `today`：键集合恰为 `{total,dueToday,queue}`、条目键恰为 `{word,retrievability,elapsedDays}`（旧字段名一个没动，新增字段只出现在**新**端点 `queue` 上）；`POST /api/review`：仍含 `ok:true` 与 `response:''`，其余为只增键（`scheduled/stabilityBefore/stabilityAfter/difficulty/nextReview/...`）；`today` 两门面在同一用户同一冻结时刻返回**完全相同**的载荷 |

---

## 4. 判据③ 的比对方法（为什么这个等式有意义）

审计 S2 的病灶是"同一个 `(user, word, rating)` 从 REST 进和从 tRPC 进会得到两套排期"。要证伪它，等式两侧必须**只差门面、不差起点**：

1. **同一张库、两个用户**：`uRest` / `uTrpc` 在同一临时 sqlite 上，各写入**同一串** `FIXTURE_DATA`（手写死的线上 4.7.1 序列化形状，`state:2 / reps:3 / lapses:1 / stability:5.5`，不经被测代码生成 → 顺带证明 `cardFromJson` 读的是存量格式而不是我自己写的格式）。
2. **冻结时钟**：`vi.useFakeTimers({ toFake: ['Date'] })` + `setSystemTime(2026-03-05T09:00:00Z)`。FSRS 的 `due` 由 `now` 推，跨秒即漂；只 fake `Date`，不动定时器实现，避免把 better-sqlite3 的微任务一起冻住。
3. **两侧都走真门面**：REST = `new Hono<AuthEnv>().route('/', createReviewRouter(db))` + 真 `jsonwebtoken` 签的 Bearer（§10.3 的 standalone 口径，不依赖 T-07 的 `app.ts`）；tRPC = `createCallerFactory(review)(ctx)`。
4. **四层断言**：整响应体（`reviewedAt` 单列比）→ `fsrs_cards.data` 逐字节 → 由该串解出的 `due/state/reps` → 两侧各过一次 `ReviewResultSchema.safeParse`。
5. `fsrs_cards` 行**没有 `due` 列**（列 = `fsrs_data/last_review/created_at/updated_at`，`due` 在 JSON 里）→ 判据点名的 `due` 一律 `cardFromJson(data).due` 解出来比，那才是排期真正落库的位置。
6. 错误面也收敛：`rating=9` 两侧都 400/BAD_REQUEST；`word='   '`（能过 zod、被 service 拦）两侧 surfacing 同一份 `ReviewError('INVALID_WORD').message`。

**结论**：两门面之间不存在第二处排期计算 —— 因为 `routes/review.ts` 与 `trpc/routers/review.ts` 里除 `rateCard/undoRating/todayQueue/buildQueue` 之外没有任何逻辑。

---

## 5. ts-fsrs 唯一入口（S13 / 判据① 的另一半）

全仓 grep（`--include=*.ts`，排除 `node_modules`/`dist`）：

```
packages/agent/src/tools/fsrs.ts:12:import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
packages/server/src/services/fsrs.ts:18:import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
tools/fixtures/selftest/depcruise/fsrs-version-lock-clean/packages/server/src/services/fsrs.ts:1
tools/fixtures/selftest/depcruise/fsrs-version-lock-violation/packages/server/src/services/review-service.ts:1
```
（另有两处是我文件里的注释/文档字符串。）

- **服务端**：`import from 'ts-fsrs'` 只出现在 `services/fsrs.ts` —— 这条已由 `review-no-llm.spec.ts` 用**读文件**的方式变成用例（`packages/server/src/**` 全量扫描，命中集合必须恰等于 `['services/fsrs.ts']`），因为 depcruise 有盲点：见下。
- ⚠ **depcruise 的 `fsrs-version-lock` 抓不到已安装的包**：`packages/agent/**` 的 `ts-fsrs` 在 depcruise 图里 `dependencies: []`（pnpm 的 `.pnpm` 实装路径未被该规则 `to.path` 命中），所以规则只对 fixture 里的裸包名有效（`--self-test` 的 fixture 红/绿两侧仍 OK）。真正的机检是我那条"读文件"用例 + 本 grep。**已安装的 ts-fsrs 版本断言 = 4.7.1**（`node_modules/ts-fsrs/package.json` 实读，不读 package.json 的范围串）。
- `packages/agent/src/tools/fsrs.ts` 的重复份**我没删也不该删**：`packages/agent/**` 是本任务的"不得触碰"项。它现在只服务 agent 内部（`nodes/scheduler.ts` 等），**不再是复习域的写卡路径**。

---

## 6. 删除的例外条目（唯一被授权对 `tools/**` 做的动作）

依据：A-25「T-10 合入时同 commit 删除该例外」+ A-26-2「允许且仅允许删除 `expires_after == 当前 TM_TASK` 的条目」。

从 `tools/exceptions.json` 删除的 2 条（原文）：

1. `legacy-review-routes-import-agent`（engine=depcruise / rule=`review-no-agent` / from=`packages/server/src/routes/review.ts` / owner=T-10 / expires_after=T-10）
2. `legacy-review-trpc-router-import-agent`（同 rule / from=`packages/server/src/trpc/routers/review.ts` / to=逐条枚举的 15 个 agent 闭包模块 / owner=T-10 / expires_after=T-10）

- A-25 把它写成"**唯一例外**"，实测是 **2 条**（第 2 条是 A-19 修复 `materialize()` 假绿之后才暴露的），两条 owner/expires 都是 T-10、清零动作都是"评分收进 `services/review-service.ts`" → 同批删除，登记为 §7 D-5 供对账。
- 删后校验：`grep -c review-no-agent tools/exceptions.json` = 1（只剩 `$changelog` 里那句历史叙述），`exceptions[]` 中 `engine=depcruise` 条目 **0 条**，`expires_after=T-10` 条目 **0 条**，JSON 解析通过（`node -e require(...)`）。未新增/改写任何其它条目，未放宽任何规则。

---

## 7. 契约偏差（D）

| ID | 内容 | 建议归属 |
|---|---|---|
| **D-1** | **`INVALID_RATING` / `INVALID_MODE` / `INVALID_WORD` / `NOTHING_TO_UNDO` / `UNDO_LIMIT_REACHED` 在冻结的 `packages/shared/src/constants/errors.ts` 里不存在**（该文件只有 18 个码）。`packages/shared/**` 是我的禁触面 → 码表与文案落在 `review-service.ts` 的 `REVIEW_ERROR_CODES` / `REVIEW_ERROR_COPY`，其中数字域与档位名一律从 shared 的 `RATING_VALUES`/`RATING_LABELS`/`MODE_VALUES`/`MODE_LABELS`/`WORD_MAX_LENGTH`/`UNDO_MAX_PER_SESSION` **组装**（不写死 "1-4"、不写死档位名），组装出的 `RATING_DOMAIN_HINT` 与旧 REST 串逐字同形 → 旧 APK 读到的 `error` 不变，同时满足 A-23-7（门面里零中文字面量） | T-03：把这 5 个码并入 `TM_ERROR_CODES`，之后我把 `review-service` 的本地表换成 import（一次纯替换） |
| **D-2** | 三处"契约有名无实"：① `QueueItemDto.gloss` —— `AppDB`（T-06 冻结）没有 dictionary 域，队列条目的 `gloss` **恒为空串**（契约注明"缺失即空串"，合法但不真），释义应由 T-11 的 `lookup` 侧批量补；② `SELF_TEST_MIN_WORDS = 5` 在服务侧自定（shared 无此常量，与 `STUDY_COPY.emptyQueue.selfTest` 的文案口径一致）；③ shared 只导出 `ReviewUndoResultSchema`，没有 `ReviewUndoResultDto` 别名 → 我在 service 里声明了等形的 `UndoResult` | T-11（gloss）/ T-03（②③） |
| **D-3** | **入参域两端仍不对称**（唯一残留的 S2 类差异，且是拆分前就有的）：REST 走 `normalizeRating` 故 `'3'` 与 `3` 同义；tRPC `reviewCard` 的 input 是 `RatingLiteralSchema`（4 个字面量），`'3'` 会被 zod 拒。我**故意保留旧形状**（基线里 `review.reviewCard.input.shape` = `ZodUnion[1,2,3,4]` + `word:min(1)`，逐字一致），否则 T-08 的基线在"只增"之外还要多一处形状变更。改成 shared 的 `ReviewInputSchema` 是一行，但必须与基线再生一起做 | T-08/TPM：随 §9-1 的基线再生一并决定是否换 `ReviewInputSchema` |
| **D-4** | `mode` 越界的拒绝点不对称（语义同、载体不同）：REST 走 `normalizeMode` → 400 `INVALID_MODE` + shared 组装文案；tRPC `review.queue` 走 `ReviewQueueModeSchema` → `BAD_REQUEST` + zod issue。两侧都"拒"，无默认回退、无截断 | 同 D-1/D-3 的收口 |
| **D-5** | A-25 的"唯一例外"实测为 2 条（见 §6） | TPM 对账 |

---

## 8. 遗留（L）

| ID | 内容 |
|---|---|
| **L-1** | `rateCard` 每次 `mode=review` 都存一条前置快照，**不做轮次回收**（`snapshots` 只有 `save/take/remove(id)`，无"按用户清理"方法，db 层冻结）。`review_snapshots` 会随复习量线性增长 → 需要 T-19/T-21 的清理任务（按 `created_at` 过期删除，走 `remove(id)`），或 T-06 追加 `prune(userId, before)` |
| **L-2** | `GET /api/review/today` 的 bootstrap 副作用（给词本里的新词补建 New 卡、把队列里的历史词回补进词本）**按"响应形状与行为一字不变"保留了**，判据⑧ 优先于 R-02④ 的"只要登录不该 mutate"。纯读分支已实现（`todayQueue(..., {bootstrap:false})`），`new`/`selfTest`/`checkin.status` 都走它。要把 `today` 也切成纯读，需要一条用例证明旧 APK 不依赖那两处写入（属 T-20/T-22 的真机面），届时改 `routes/review.ts` 一行 —— `services/queue-service.ts:41` 的注释同指此项 |
| **L-3** | R-11④ 的"同轮 ≤3 次撤销"服务端只能在**进程内**计数（`Map<userId,{windowStart:6h, rated[], undos}>`），重启即重新计数 —— `AppDB` 没有轮次/计数表，db 层归 T-06 冻结。**防重复回滚不依赖它**（`snapshots.take()` 取一条删一条，同卡第二次撤销必然 409），受影响的只有"这一轮总共能撤几次"的上限，前端仍按 `UNDO_MAX_PER_SESSION` 自计。用例已覆盖 200→429 的边界 |
| **L-4** | `RoundSummarySchema`（完成页"本轮 N 张 · 忘记 x …"）**当前没有后端生产者**。我的轮次台账里已有 `rated[]` 与每次评分的 `rating`，补一个 `review.round`（或 REST `GET /api/review/round`）是十几行，但它会**再往 `appRouter` 上加一个过程** → 与 §9-1 的基线再生冲突，故未做，等 TPM 指派（R-13① 目前由前端本地累计，属 T-13/T-15） |
| **L-5** | 学情事件只在 tRPC 侧有 `ctx.events`（REST 门面没有事件采集器，`app.ts` 归 T-07 我不能改其装配）。`rateCard` 的 `events?.record` 是可选注入，REST 侧评分目前**不落事件** → Phase 5 的学情统计会漏掉 REST 流量。修法：T-07 在 `app.ts` 给 `createReviewRouter` 传第四个参数，或 REST 也接 `createContext` 同源注入 |

---

## 9. 待裁决点（都是"整改动作的连带后果"，我没有一处靠放宽规则换绿）

1. **T-08 的 `trpc-shape` 基线必须再生，且不是我一家的事。** 现红：首个差异在第 3162 行 = `auth.activate`（T-07 在 `trpc/routers/auth.ts` 新增的过程），受影响集合里 `review.queue` / `review.undo` 是我按 §10.2 第 130 行要求**新增**的两个过程。基线文件 `packages/server/test/trpc-shape.baseline.json` 归 T-08（`readers: []`），再生路径 `TRPC_SHAPE_UPDATE=1` 按其文件头要求需 TPM 批准 —— **我没跑那个开关，也没改基线**。建议：批次3 合并完成后由 T-08 一次性再生，把 T-07 与 T-10 的增量一起吃进去。可核对的"我只增不改"证据：基线里 `review.reviewCard` 的 `input.shape`（`ZodUnion[1,2,3,4]` + `word min(1)`）与 `nMiddlewares:3`、`checkin.*` 的 `input:null` 都与现实现逐字对应。
2. **T-02 `--self-test` 有 2 条用例把"违规必须仍然存在"写死成了期望**（`tools/boundaries.mjs:1877 exceptionsStrictSample()` 用真仓库的 `packages/server/src/routes/review.ts` 当探针；`:1605 a19Vaccine()` 要求 exceptions.json 里至少有一条 `review-no-agent` 例外）。整改+删例外之后它们**必然红**：修好违规 ⇒ 探针无红可看；A-26-2 授权删条目 ⇒ 疫苗没有在用例外可测。判据① 自己那 3 条（故意违规必红 / 干净必绿 / A-19 展开语义）仍全绿。**建议修法**（都动 `tools/**`，归 T-02）：把 `exceptionsStrictSample()` 的探针从"真仓库文件"换成 `review-no-agent-exception` fixture；A-19 的 setup 用例改为"无 depcruise 条目时 SKIP 并说明"或让 fixture 自带一份只在用例内生效的例外。
3. **`--check-ownership` 判我删例外越界**（`tools/exceptions.json 由 T-02 独占`），而 A-26-2 正是授权我做这件事的条款，且它写明"owner = T-02 落地机检"—— 机检未落地。按 A-26-3 照常施工、把红记在这里。建议 `tools/ownership.json` 给 `tools/exceptions.json` 增一条 `actions:["delete-expired-entry"]` 型机检（当前任务号 == expires_after 才算合法动作）。
4. **`INVALID_RATING` 等 5 个码的归属**（D-1）：判据④ 点名的这个码在冻结的 shared 错误表里不存在，我把它实现成了复习域本地码表 + shared 常量组装文案。要么 T-03 收编（推荐，一次纯替换），要么 TPM 认可"域内码表"这个先例 —— 否则 T-09/T-11 会各自再发明一套。
5. **入参域 `'3'` 两端不对称**（D-3）与 **`mode` 错误载体不对称**（D-4）：是否随基线再生一起换成 `ReviewInputSchema` / `ReviewQueueInputSchema` 的 fail-closed 文案，请定。
6. **`rateCard` 事件采集只有 tRPC 侧**（L-5）需要 T-07 在 `app.ts` 传第 4 个装配参数；我已把 `createReviewRouter(db, _agentDeps?, _llmRouter?)` 的形状保持成 `app.ts:149` 的现有调用位（接而不用，**复习域不 import agent**），T-07 收口 `app.ts` 时可顺手删形或改传 events。

---

## 10. 交付文件清单

```
144 packages/server/src/services/fsrs.ts                     🆕 ts-fsrs 唯一入口
278 packages/server/src/services/review-service.ts           🆕 评分/撤销唯一实现（错误码表 D-1）
165 packages/server/src/services/queue-service.ts            🆕 三模式队列（bootstrap 纯读分支）
 64 packages/server/src/services/checkin-service.ts          🆕 打卡唯一实现（streak/dueToday 单源）
102 packages/server/src/routes/review.ts                     ✏️ 薄门面 + /undo + /queue
 27 packages/server/src/routes/checkin.ts                    ✏️ 薄门面
 73 packages/server/src/trpc/routers/review.ts               ✏️ 去 @tm/agent、去中文字面量、+queue/+undo
 18 packages/server/src/trpc/routers/checkin.ts              ✏️ 薄门面
500 packages/server/test/integration/review-parity.spec.ts    🆕 24 用例（判据③④⑤⑥⑦⑧）
245 packages/server/test/review-no-llm.spec.ts               🆕 16 用例（判据①②）
  -            packages/server/package.json                  ✏️ 1 行（ts-fsrs 依赖声明）
  -            tools/exceptions.json                         🗑️ 2 条目（A-26-2 授权）
```
