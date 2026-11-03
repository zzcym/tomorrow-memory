# T-26a 开发报告 · 学情分析 REST 门面（服务端）

- 任务代号：**T-26a**（批次4C 新派，服务端；上游判定 = **A-47 #106 / #107**）
- 一句话：补 `GET /api/analyst` 与 `GET /api/analyst/dataset` 两条**服务端从来不存在**的 REST 路由，
  形状/语义/限流与 tRPC `analyst.report` 同一把尺子，解 R-19 轻学情页（热力图 + 增长曲线）"真机永远拿不到数"的 P0 缺口。
- 本轮**只动服务端**，`apps/app/**` 一行未碰（App 侧 `days→period` 对齐属下一轮 T-26b）。
- 出口命令用量：**1 / 2**（第 1 次即按简报警告跑了全量 `typecheck && test`，全绿；第 2 次未消耗）。

---

## 1. 交付物清单（文件 + 行数）

| # | 文件 | 状态 | 行数 | 说明 |
|---|---|---|---|---|
| 1 | `packages/server/src/routes/analyst.ts` | 🆕 | **145** | 工厂 `createAnalystRouter(db: AppDB, deps: { analyst, llmRouter })`，与 `routes/checkin.ts:15` 同形（`Hono<AuthEnv>` + `auth` 中间件 + 返回 `r`）。两条端点：`GET /api/analyst`（:97）、`GET /api/analyst/dataset`（:134） |
| 2 | `packages/server/src/app.ts` | ✏️ | **+2 行**（`:26` import、`:270` 挂载） | 见 §7 的"授权边界"一条：`.route()` 挂载 1 行是简报授权的那一行，另 1 行是 TS 编译必需的 import（`createCheckinRouter` 等 13 个路由的既有写法就是"每路由一行 import"），**未改动任何既有行、未动任何逻辑行** |
| 3 | `packages/server/test/integration/analyst-rest.spec.ts` | 🆕 | **401** | 12 条用例，覆盖判据 ①②③④⑤ + "限流同一把尺子" + period 值域四例 + 空串缺省口径 + pg 环境自证 |
| 4 | `.delivery/04-dev-report-T-26-a.md` | 🆕 | 本文件 | — |

挂载行原文（`packages/server/src/app.ts:270`，放在 :268 那组 `.route()` 之后）：
```ts
app.route('/', createAnalystRouter(db, { analyst, llmRouter }));
```

**禁改面自查**：`services/analyst.ts`、`trpc/routers/analyst.ts`、`trpc/init.ts`、`middleware/**`、`db/**`、
`packages/shared/**`、`apps/**`、`scripts/**`、`tools/**` —— 本轮 **diff 0 行**（只 import，不改）。
`AnalysisPeriod` 值域未扩（`7d/30d/90d/all`，`routes/analyst.ts:76` 的 `PeriodQuerySchema` 是那一行的镜像，注释已标出处）。

---

## 2. 判据对账表（①-⑤ 逐条 → 用例名 → 结果）

结果口径：`pnpm --filter @tm/server test` 全量输出里的
`✓ @tm/server test/integration/analyst-rest.spec.ts (12 tests) 283ms`。

| 判据 | 用例名（`describe › it`） | 结果 |
|---|---|---|
| **①** REST↔tRPC 顶层 + 内层 key 集合全等（禁两套尺子） | `判据①：同用户同 period 下 GET /api/analyst 与 tRPC analyst.report 的 key 集合全等 › 两侧顶层键集合 == {dataset, insights, cached}，dataset 内层键集合全等，取值同源` | 绿（原文输出见 §3） |
| **①** 值域四例都不漂 | 同上 describe › `四个 period 取值 × 两门面：key 集合逐一全等（值域不扩，与 tRPC input 同集）` | 绿（7d/30d/90d/all 四对） |
| **②** 无 token → 401 | `判据②：无 token → 401；强制改密 token → 403 PASSWORD_UPGRADE_REQUIRED › 两条端点缺 Authorization 都是 401 { error: "未登录" }（与 checkin 同一中间件出口）` | 绿 |
| **②补** 密码升级门禁语义不变 | 同上 describe › `upgrade token（aud=pw-upgrade）在两条端点都撞 403 硬门禁，码与文案出自 TM_ERRORS` | 绿（403 + `PASSWORD_UPGRADE_REQUIRED` + 表内文案） |
| **③** 非法 period → 400 + 可回查的 `TM_ERRORS` 码 | `判据③：非法 period → 400，且错误码出自 @tm/shared 的 TM_ERRORS（不自创码、不自创文案） › 两条端点上的 ?period=2d 都被拒为 400 + { error, code }，且 code/http/copy 三项都回查得到` | 绿（断言方式是 `hasOwnProperty(TM_ERRORS, code)` + `body.error === TM_ERRORS[code].copy` + `status === TM_ERRORS[code].http`，即"码、文案、状态三者都反查回表"） |
| **③补** 缺省/空串口径 | 同上 describe › `缺省 period 落 30d；空串按"没给"处理（与 tRPC 的 .optional().default("30d") 同口径）` | 绿 |
| **④** dataset 端点不产生 `analyst_cache` 行 | `判据④：/api/analyst/dataset 不产生 analyst_cache 行；report 的命中/回写两条分支 › dataset 端点跑 3 次前后 COUNT(*) 相等，且响应只有 AnalyticsDataset 的键（无 insights/cached）` | 绿（跑前/跑后 `SELECT COUNT(*) FROM analyst_cache` 相等；并断言响应体无 `insights`/`cached` 两键） |
| **④** report 缓存**回写**分支 | 同上 describe › `缓存未命中分支：首次 report → cached:false 且 analyst_cache +1（回写 user_id/period 正确）` | 绿（`cached:false`、`COUNT+1`、行内容 `[user_id, '90d']`） |
| **④** report 缓存**命中**分支 | 同上 describe › `缓存命中分支：24h 内第二次 report → cached:true 且 COUNT 不变，insights 与首次逐字相同` | 绿（另断言命中时 `dataset.source` 仍是实时值 ⇒ 顺序与 tRPC 一致：先 `analyze()` 再查缓存） |
| **④补** 限流"同一把尺子" | 同上 describe › `限流同一把尺子：同一用户 REST 5 次 + tRPC 5 次共用一个桶，第 11 次两侧同时超限；dataset 不吃配额` | 绿（证据见 §4） |
| **⑤** 跨用户隔离 | `判据⑤：用户 A 取不到用户 B 的数据（只有自己的 userId 参与查询） › A 的两个端点都只数得出 A 的 1 个词，B 的 4 个词一个字都不出现` | 绿（A 的 `growthCurve` 累计 = 1、B = 4；A 的 report 只写自己 `user_id` 的缓存行；B 侧无缓存行） |
| 环境自证 | `环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里） › 未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg）` | 绿（本机无 pg 实例 ⇒ 走 A-18-3 的显式 SKIP 输出通道，原因已在 stdout，见 §6） |

无 `it.skip` / `test.fail()` / `expect(true)` 占位；pg 面按 A-18-3 先例留 `[SKIP]` 输出而非静默。

---

## 3. REST ↔ tRPC 同形状证明（**原文输出**）

vitest stdout，逐字照贴（`test/integration/analyst-rest.spec.ts` 判据① 那一条用例打的）：

```
[T-26a 判据①] REST  /api/analyst   keys = ["dataset","insights","cached"]
[T-26a 判据①] tRPC  analyst.report keys = ["dataset","insights","cached"]
[T-26a 判据①] REST  dataset.keys = ["period","generatedAt","growthCurve","reviewEfficiency","forgettingCurve","studyHeatmap","cefrDistribution","source"]
[T-26a 判据①] tRPC  dataset.keys = ["period","generatedAt","growthCurve","reviewEfficiency","forgettingCurve","studyHeatmap","cefrDistribution","source"]
[T-26a 判据①] cached(REST/tRPC) = [true,true] | insights(REST/tRPC) = [3,3]
```

口径说明（为什么这不是"两套尺子"）：
- tRPC 侧取的是**装配后的 `appRouter`**：`createCallerFactory(appRouter)(ctx).analyst.report({ period })`
  （先例 `test/trpc-shape.spec.ts:28-29` 的 import 面 + `auth-register.spec.ts:427` 的用法），
  不是我自己另拼的一个域路由；
- 两侧在**同一张临时 sqlite、同一个 user、同一个 period** 上取数，且共用同一份 `db`/`analyst`/`llmRouter` 实例；
- 断言不止 key 集合：`cached` 相等、`insights` 深相等、`dataset` 剥掉 `generatedAt`（两侧各自的 `Date.now()`）后**逐字段全等**；
- 顶层键集合进一步钉成字面量 `['cached','dataset','insights']`，防"两侧各自加同一个键又恰好相等"这种假绿。

---

## 4. 限流"同一把尺子"的证据（两边各在哪一行用了同一个串）

| 门面 | 文件:行 | 原文 |
|---|---|---|
| tRPC | `packages/server/src/trpc/routers/analyst.ts:27` | ``rateLimit(`user:${userId}:analyst-report`, 10, 60_000);`` |
| tRPC（包装层） | `packages/server/src/trpc/init.ts:155-157` | `export function rateLimit(key, limit, windowMs) { const result = checkRateLimit(key, limit, windowMs); … }` ⇒ `rateLimit()` **就是** `checkRateLimit()` 的包装 |
| REST（本轮） | `packages/server/src/routes/analyst.ts:66-70` | ``const REPORT_RATE = { key: (userId) => `user:${userId}:analyst-report`, limit: 10, windowMs: 60_000 } as const;`` |
| REST（本轮） | `packages/server/src/routes/analyst.ts:106` | `const rl = checkRateLimit(REPORT_RATE.key(userId), REPORT_RATE.limit, REPORT_RATE.windowMs);` |

- **底层同一个函数**：REST 直接调 `middleware/rate-limit.ts` 的 `checkRateLimit()`（`trpc/init.ts:155` 包装的那一个），
  因此两侧命中**进程内同一张 `buckets` Map**（`middleware/rate-limit.ts:16`）⇒ 同一个桶，不是各算各的。
- **没有第二套阈值**：key 串逐字相同、`10 / 60_000` 逐字相同、24h TTL 也是 `trpc/routers/analyst.ts:26` 的 `CACHE_TTL` 镜像
  （`routes/analyst.ts:73`）。因为 `trpc/routers/analyst.ts` 在 T-08 名下"本期不再改"、那两个数是**行内字面量**
  （没有可 import 的导出），所以本轮只能做"具名镜像 + 用例钉死"，镜像处有注释标出处。
- **可执行证明（不靠注释）**：判据④补 那条用例对**同一个用户**先 REST 5 次 + tRPC 5 次（都放行），
  第 11 次 REST ⇒ `429` + `code:'TOO_MANY_REQUESTS'`（文案取自 `TM_ERRORS`），
  紧接第 11 次 tRPC ⇒ 抛 `TOO_MANY_REQUESTS`。**两侧同时超限 = 二者共用同一个桶**；
  若两侧各算一套，第 11 次 REST 不可能撞限（它自己那侧只用了 6 次）。
- 同一用例还断言 `GET /api/analyst/dataset` 在桶已耗尽时仍 200 ⇒ 高频读面不吃报告配额（也解释了为何它不接这把尺子：
  它零 LLM、零写，把它塞进 `analyst-report` 桶只会让热力图刷新去抢报告的名额）。
- 429 的响应体走 `tmErrorBody(TM_ERROR_CODES.TOO_MANY_REQUESTS)`（429 + §4.6 人话），
  `retryAfterSeconds` 只进 HTTP `Retry-After` 头，不塞进 `error` 文案 ⇒ 不新写第二份文案
  （tRPC 侧那句带秒数的 `message` 是 `trpc/init.ts:160` 的既有行为，本轮未改、也不复制）。

---

## 5. `appRouter` 基线仍绿（本轮不消耗 `baseline-regenerate` 额度）

- 基线用例名与跑法（简报要求先找它叫什么）：`packages/server/test/trpc-shape.spec.ts`
  （T-08 判据① 的 tRPC 过程清单快照门禁），命令 `pnpm --filter @tm/server test`（`--` 过滤在本仓包装下不裁文件，故第一次即全量）。
- 本轮**只新增 REST 面**，`trpc/routers/**`、`trpc/init.ts` 零 diff ⇒ `appRouter` 形状一字不变。
- 出口输出原文（同一次全量运行）：
  ```
  ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 15ms
  ```
- 全量结果：**`Test Files 18 passed (18)` / `Tests 431 passed | 1 skipped (432)`**，
  对比简报给的绿色基线 `410 passed | 1 skipped / 17 文件` ⇒ 文件 +1（= 本轮的 `analyst-rest.spec.ts`，12 条）、
  passed 只增不减。差额（+21 passed / +1 文件）里本轮占 12 条，
  其余 9 条与第 18 个文件不在本轮 diff 内（工作树里另有并行批次的未提交改动，如 `test/release/backup.spec.ts`），
  已在 §7 作为"基线漂移"登记，请 TPM 在 A-48 里认账口径。
- `packages/server` `typecheck`（`tsc -p tsconfig.json --noEmit`）：**0 错误**。

---

## 6. 数据红线自证（两份 `data.db` 跑前 / 跑后）

命令：`stat -c '%s %y' <f>` + `sha256sum <f>`，跑前在写文件之前、跑后在全量测试之后各取一次。

| 文件 | 跑前 | 跑后 | 判定 |
|---|---|---|---|
| `E:/CC/tomorrow-memory/data.db` | size `253952`；mtime `2026-09-18 04:05:38.198449400 +0800`；sha256 `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` | size `253952`；mtime `2026-09-18 04:05:38.198449400 +0800`；sha256 `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` | **三项逐字相同 ⇒ 未被触碰** |
| `E:/CC/tomorrow-memory/packages/server/data.db` | size `0`；mtime `2026-09-17 00:10:53.374159200 +0800`；sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | size `0`；mtime `2026-09-17 00:10:53.374159200 +0800`；sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | **三项逐字相同 ⇒ 未被触碰** |

- 测试全程只在 `os.tmpdir()/tm-t26a-analyst-<pid>/analyst.db` 上跑：`new Database(临时文件)` +
  `SqliteAppDB` + `MigrationRunner(ALL_MIGRATIONS)` 在**副本**上建表，`afterAll` 里 `rmSync` 清掉；
  连 `profile-dto`/`auth-register` 那种"从仓库根 `data.db` 只读复制"都没做（本域不需要历史数据）。
- 本轮**不建迁移**（未新增/修改任何 `db/migrations/*`）、未用 `--i-know-this-is-prod`、未连生产 `DATABASE_URL`。
- pg 侧本机无实例 ⇒ 显式 SKIP 并在输出里留原因（原文，A-18-3 先例）：
  ```
  [SKIP] T-26a analyst-rest 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。 本域对 pg 的依赖面 = `analyst_cache.{user_id,period,content,created_at}` 的 get/set 与 `fsrs_cards` 的 按用户读（两侧列名一字不动），REST 门面自己不新增任何 SQL。
  ```

---

## 7. 上报未修（只登记，不自建通道）

1. **`tools/ownership.json` 需为 `routes/analyst.ts` 补录归属**（本轮**未自行改**该文件）：
   `packages/server/src/routes/**` 条目（`tools/ownership.json:576-596`）的 `per_file` 表里没有
   `packages/server/src/routes/analyst.ts` ⇒ 静态归属门禁会把新路由判成无主。需要的纯追加（一行）：
   `"packages/server/src/routes/analyst.ts": "T-26a"`（并考虑把 `T-26a` 加进该条目 `owner` 的
   `T-07,T-09,T-10,T-11` 列表）。
2. **`tools/ownership.json` 的 `packages/server/src/app.ts` 条目需为 T-26a 新开一条授权通道**：
   现条目（`:561-575`）写着 `successorConstraint = "T-07 之后（批次3 起）非 owner 任务对本文件零 diff，除 A-33-7 授权的 T-10（≤2 行装配改动）"`。
   本轮按简报的例外授权（先例 = §10.2 T-08 判据③ / A-22）改了 **2 行**（`:26` import、`:270` 挂载），
   **形态与 T-08/T-10 的既有授权通道一致**（1 行 import + ≤2 行装配），但没有对应的 T-26a 登记项 ⇒
   `--check-ownership task=T-26a` 会拒判/判红。请 TPM 按 A-35-11 的口径补一条
   `maxDiffLinesFor.T-26a = 2`（或 `predecessorAllowedDiff` 式的单 import 行 + 单挂载行）。
   **授权边界自陈**：简报写"只加 1 行 `.route()`、多改一个字符都算越界"，而 TS 编译要求
   `createAnalystRouter` 必须先被 import（`app.ts` 对 13 个既有路由都是"一路由一 import"），
   故本轮净增 **2 行**、且这 2 行都是**纯新增行、零改动既有行、零逻辑改动**。这是简报字面与编译事实的唯一冲突点，主动登记。
3. **§4.6 缺"通用入参非法"码**（本轮 400 的妥协点，请裁决）：`TM_ERRORS` 的 18 码冻结面里
   400 档只有 `INVALID_PHONE / WEAK_PASSWORD / PASSWORD_MISMATCH / AGREEMENT_REQUIRED / OLD_PASSWORD_REQUIRED /
   PASSWORD_SAME_AS_OLD / WORDBOOK_TOO_LARGE / AVATAR_TOO_LARGE` 八条，逐条都是具体域文案；
   `TM_ERRORS_SUPPLEMENT` 里也没有通用条（`INVALID_*` 三条都钉在复习域）。
   简报硬约束"不许自创错误码或文案、只用 `TM_ERRORS`" ⇒ 本轮非法 `period` 的 400 复用了语义最贴的
   **`WORDBOOK_TOO_LARGE`**（"超出支持的上限"），文案与状态全部由 `tmErrorBody()` 取（代码与 `routes/analyst.ts:38-44` 的注释都写明了成因）。
   副作用：真机上若 App 发错 period，用户会在学情页看到"单词数量超出上限"这句不贴切的人话（这条路径正常流程不会触发：
   T-26b 之后 App 只会发四个合法值）。**建议修法（属 T-03 排他面，本轮不碰）**：
   在 `TM_ERRORS_SUPPLEMENT` 纯追加 `INVALID_PERIOD`（http 400 + 一句"这个时间范围看不了"人话），
   或补一条通用 `INVALID_PARAMETER`；同型欠账已有两处先例（A-32-8 P-2 的 `INVALID_WORDBOOK_ENTRY`、
   P-1a 在 `app.ts:135` 留的 `REQUEST_TOO_LARGE` TODO）。
4. **`analyst` 域无 zod 契约面**（`@tm/shared` 只有 `AnalyticsDataset` / `AnalysisReport` 两个 interface，
   App 侧 `data/queries/analyst.ts:4-6` 自陈"本期无法 safeParse"）⇒ 本轮判据① 只能比 key 集合 + 取值全等，
   双侧 `safeParse` 做不到（`profile-dto` 判据① 是能 safeParse 的）。登记给 T-03/T-26b。
5. **`GET /api/analyst/dataset` 未接限流**（本轮自主判断，简报未要求）：它零 LLM、零 `analyst_cache` 读写，
   接 `analyst-report` 桶会让热力图刷新抢报告配额。若 TPM 认为受保护读接口也该有独立桶
   （如 `user:${userId}:analyst-dataset`），那是一行改动，但**必须新开 key 而不是复用** —— 请裁决。
6. **基线漂移**：全量 passed 从简报的 410 变 431（本轮 12 条 + 非本轮的 9 条 / 第 18 个文件）。
   本轮未新增/修改非本轮文件里的用例，但出口数字与简报的"绿色基线"不再对得上，请 TPM 认账后再作为 T-26b 的基线。
7. **`services/analyst.ts` 的 `'all'` 语义**：`periodDays('all')` 返回 0（`services/analyst.ts:222-232` 的 `default` 分支），
   `fromDb` 里靠 `period === 'all' ? 0 : …` 兜住 ⇒ 现在能跑，但"0 = 不限"这条约定很脆。该文件在 T-26a 禁改面上，只登记。

---

## 8. 遗留清单（含下一轮该做的）

- **T-26b（App 侧，排在本轮交回之后）**：`apps/app/src/data/queries/analyst.ts`
  的 `days:number` → `period:'7d'|'30d'|'90d'|'all'`（服务端已按 `period` 落地，非法值 400、缺省 30d），
  删掉 `:37` 那句"T-11 落地"的错前提注释；`components/progress-data.ts` 的形状容错与
  `test/progress-screen.spec.tsx` 的 P 组夹具同步；热力图要"一整年"用 `?period=all` + **客户端裁剪**
  （`AnalysisPeriod` 不扩值，#106 末段口径）。
- **本轮交付的可供对端使用的契约**（T-26b 就按这个写）：
  - `GET /api/analyst?period=7d|30d|90d|all` → 200 `{ dataset: AnalyticsDataset, insights: AnalystInsight[], cached: boolean }`；
    401 `{error:'未登录'}`；403 `{error,code:'PASSWORD_UPGRADE_REQUIRED'}`；429 `{error,code:'TOO_MANY_REQUESTS'}` + `Retry-After` 头；400 `{error,code}`（见 §7-3）。
  - `GET /api/analyst/dataset?period=…` → 200 `AnalyticsDataset`（八键，无 `insights`/`cached`）。
- **CI（T-22）待办**：本文件 12 条 + pg 面 `[SKIP]` ⇒ `DATABASE_URL_TEST` 下必须真跑 pg 一遍
  （双驱动一致面：`analyst_cache` 的 `get/set` 与 `fsrs_cards` 按用户读，REST 面自己零新 SQL）。
- **可选增强（未做，避免越界）**：`POST /api/analyst/refresh`（对应 tRPC `analyst.refresh` 的强制重算 + 5 分钟冷却）
  本轮**未补 REST 面** —— 简报只授权两条端点；App 侧若不主动刷新就不需要，需要时按同一 key 口径另开一轮。
