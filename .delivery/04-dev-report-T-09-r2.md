# 开发报告 · T-09r2（后端 · 报告轮）

- 任务：T-09 修复轮第 2 次（T-09r2 = **报告轮**）。上一轮 T-09r1 撞 150 回合上限（A-39 §40 已定性："实现与用例已落盘且为绿，仅缺报告"）。
- 角色卡：`product-delivery-workflow/references/roles/dev.md`（后端）。
- **本轮零改动**：未改任何实现文件、未改任何测试断言、未碰 `packages/shared/**`、未碰 `test/trpc-shape.baseline.json`、未碰 `tools/**`；无 git 写操作；未对任何 `data.db` 执行写/迁移（取证件跑在 `%TEMP%/t09r2/probe.db`）。本轮唯一新增文件 = 本报告。
- 出口命令：1 条（`node_modules/.bin/tsx %TEMP%/t09r2/matrix.mts`，临时取证件；首跑被 `db/types.ts:633` 启动自检拦下、次跑我自己在表里取错了 `code` 键、末跑为盘面真值 —— 三次都是同一条命令，未跑 typecheck/test，理由见下）。原始输出落 `%TEMP%/t09r2/exit.md`，全文附在本报告 §6。

---

## 1. 交付面

### 1.1 实测清单（TPM 亲测，权威，本轮回抄不重跑）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @tm/server typecheck` | **0 错** |
| `pnpm --filter @tm/server test` | **389 passed / 0 failed**（16 个文件全绿） |
| `pnpm --filter @tm/server test -- wordbook` | **102 passed / 3 files** |

⚠ 写法登记（非异常）：按项目已知跑测口径，`test -- <name>` 的位置参数在本 monorepo **不做用例过滤**（仍收集整个 `@tm/server` project）。上面 "102 passed / 3 files" 是 TPM 实跑读数，我照抄不复核。

### 1.2 接线落点 → 满足了 §10.2 T-09 行 / PRD §5.4-2（含 §5.4-4）的哪一条

| # | 盘上落点（行号=我读盘实测） | 落点内容 | 满足的条款（原文口径） |
|---|---|---|---|
| 1 | `packages/server/src/services/wordbook-service.ts:636` | `const INVALID_ENTRY_CODE: TmErrorSupplementCode = 'INVALID_WORDBOOK_ENTRY'` —— 词本域**唯一**一处该码的字面量（全仓命中已核：除本行 + 本域 spec 的验收哨外无第二处） | **§5.4-2 定稿句 + 判据**"一条 `INVALID_WORDBOOK_ENTRY` 覆盖两种成因、不拆第二条码"；A-28-4"域内不得再建第二份码表"；§10.2 T-09 行范围 `R-03` 全条里的 **R-03⑦**（字段名/语义不变 + 非法输入出口） |
| 2 | 同文件 `:644-649` `wordbookInvalidEntryBody()` | 恒返 `{status, body:{error, code}}` **两键**；`status` 取 `supplementErrorStatus()`、`error` 取 `errorMessage()`，本文件不写第二个状态数字、不复制第二份文案 | **§5.4-2 约束④ / R-17⑧**：旧 APK 读到的 `error` **键名不变、只换值**；**§5.4-2 判据**"不得无码"；§5.4-4 判据② 的"数字由模板组装、不写死第二份"（数字唯一真值仍在 `limits.ts:70`） |
| 3 | 同文件 `:670-705` `wordbookRejectionBody()`，末端 `:704` `return wordbookInvalidEntryBody()` | `invalid-entry` 那一支不再回机器话兜底串；`stale`/`too-large` 两支一字未动 | **§5.4-2 约束③**"禁止把该 400 退化成'数据格式错误'式机器话，也禁止 500"；A-37 §八-31 那条真缺陷的闭合点；§10.2 T-09 判据③（409 面）不受扰动 |
| 4 | 同文件 `:217-230` `logWordbookInvalidEntry()` + `:87` `WordbookRejectCause` | 事件名沿用改动前的 `wordbook_invalid_entry`（只加键、不改名/级别），`cause: 'malformed_json' \| 'invalid_word_name'` **只出现在日志 meta** | **§5.4-2 理由②**"可辨性由日志承担、不由错误码承担"；§5.4-2 判据"日志能区分两种成因（有一条用例断言日志字段存在即可，**不断言响应用户能看到差异**）" |
| 5 | `packages/server/src/routes/wordbook.ts:101-109`（注释在 101，出口在 108-109） | REST `push` 门面自己的契约关失败也走 `wordbookInvalidEntryBody()`，与 service 侧、与旧 `PUT` 侧同一函数（`:84`/`:90`/`:108` 三处同源） | **§5.4-2 判据**"请求体坏 JSON → 400 同码"；§4.2 收敛规则"REST 与 tRPC 是同一个 service 的两个门面，判定必须同源"—— 即 §10.2 T-09 行判据①②③ 的"三门面同源"这一半 |
| 6 | `packages/server/src/services/wordbook-merge.ts:478-490`（`invalidWordKeys` 的注释块，更正行在 `:481`） | 旧注释"§4.6 里没有对应码，见报告待裁决 P-2"已更正为"该码已登记进 `TM_ERRORS_SUPPLEMENT`（`errors.ts:234`），P-2 已闭合"，并写清本函数只管"去空白后为空"、长度关在文件外两处 | **§5.4-2 背景行**（"是否再拆一条码由 PM 定"→ 已定稿不拆）；A-37 §八-32 派单要求的"两处过时注释随接线一并更正"；§10.2 批次4 通用约束"注释不得留已被裁决推翻的 TODO" |
| 7 | `packages/server/src/trpc/init.ts:78`（登记）＋ `:91-95` `tmCodeHttpStatus()` 真正的第二级查表 | 补码表进两级查表的第二级（`Object.hasOwn(TM_ERRORS_SUPPLEMENT, code)` → `supplementErrorStatus`），未知码返回 `undefined` 由调用方保持协议自带状态 | **§5.4-2 约束③ 的机制面**（不 500）：A-33-5/N-1 那条"两级查表把 403 变 500"的同型疫苗，本码走同一条路径；§10.2 T-09 行的"错误处理/输入校验统一约定" |
| 8 | `packages/server/test/integration/wordbook-concurrency.spec.ts:972` 起的 describe（`:1052` 四个 400 出口逐字节同一个体且都不是 500、`:1083` 不新增第二条码、`:1099` 成因只进日志、`:1149` service 直调同出口、`:1170` R-17⑧ 键名红线、`:1197` tRPC 门只回协议码、`:1219` 观测登记） | §5.4-2/§5.4-4 判据的可判真假用例集，全绿 | **§5.4-2 判据四条**全量 + **§5.4-4 判据①** 在 REST 两面上的成立；§10.2 T-09 行"🆕`wordbook-concurrency.spec.ts`"这一交付物本体 |

### 1.3 简报行号与盘上行号的差（如实登记，不改文档）

| 简报给的锚 | 盘上实测锚 | 内容 |
|---|---|---|
| `wordbook-service.ts:711` | **`:704`** | `wordbookRejectionBody()` 末端 `return wordbookInvalidEntryBody()` |
| `trpc/routers/wordbook.ts:41`（A-39 §41 亦写作 `:41`） | **`:40`** | `add` 的 `.input(z.object({ word: z.string().min(1).max(100) }))` |
| `trpc/routers/wordbook.ts:52` | **`:50`** | `remove` 的 `.input(z.object({ word: z.string().min(1) }))`（无 `max`） |
| `trpc/init.ts:78` | `:78` ✓（注释登记）；**生效点在 `:91-95`** | 见 §1.2 第 7 行 |
| `routes/wordbook.ts:101` | `:101` ✓（注释）；**出口在 `:108-109`** | 见 §1.2 第 5 行 |
| `wordbook-merge.ts:481` | `:481` ✓（在 `:478-490` 注释块内） | 见 §1.2 第 6 行 |
| spec `:972` / `:1219` | ✓ 两个锚都对得上 | — |

⇒ 与 A-38 §30 的"锚点腐化"同类：`trpc-shape` 基线与两处 router 行号在 A-39 §41 里以 `:41/:52` 引用，盘上真实是 `:40/:50`。**我没有改任何文档**，只把差口报出来（Q-6）。

---

## 2. R-17⑧ 兼容面自证：旧 APK 能看到的响应体

**口径**：旧 APK 只读 `error` 这个**键名**；T-09r1 只换它的**值**，并新增一个旧客户端会忽略的 `code` 键。恒两键、码恒定、成因只进日志。

### 2.1 行号证据（读盘）

- 出口唯一构造点：`packages/server/src/services/wordbook-service.ts:644-649` —— 返回体形状在类型上就写死为 `{ status: number; body: { error: string; code: string } }`（**没有** `cause` 键；函数签名里没有它 ⇒ 想加必须改签名）。
- 码值不随成因变化：`:636` 定义 → `:647` 单点使用 `body: { error: errorMessage(INVALID_ENTRY_CODE), code: INVALID_ENTRY_CODE }`；两个成因的分家发生在 `:663-667` `wordbookPushIssueCause()` 与 `:217-230` `logWordbookInvalidEntry()`，两者都**只喂日志**。
- 三个调用点全部指向同一个函数、都不追加键：`wordbook-service.ts:704`、`routes/wordbook.ts:84`（旧 PUT 载荷关）、`routes/wordbook.ts:108`（push 契约关）。旧 PUT 的 507 行超限支与 409 陈旧支在 `wordbook-service.ts:674-698`，**本次零 diff**。
- 键名冻结的反证哨已在盘上：`wordbook-concurrency.spec.ts:1170`（"`error` 键仍在，`{ok:true}`/`{data:[]}` 两快照一字未动"）、`packages/server/test/contract/legacy-apk.spec.ts:488`（T-09 判据⑥ 的 `{ok:true}` 快照，本文件未被本轮改动）。
- 全仓 `'数据格式错误'` 残留复核（只读 grep）：**2 处，均为注释**（`shared/constants/errors.ts:225` 的历史自陈、`wordbook-concurrency.spec.ts:977` 的反证哨文案），**响应路径 0 命中** ⇒ 没有第二处机器话出口被漏接。
- `cause` 是否漏进响应：见 §2.2 实测行"响应体里出现 cause 的条数 = 0"。

### 2.2 一条实测输出（本轮回的真实数字，非 TPM 回抄）

```
- PUT  坏 JSON → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- PUT  词名非法 → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 坏 JSON → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 词名非法(65) → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 词名非法(101) → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}

- 键集合（每一体）：["code","error"]
- 五体逐字节全等：TRUE
- 码值恒定不分成因：TRUE
- 响应体里出现 cause 的条数（应为 0）：0
- 状态码是否为 500（应为 false）：false
```

同一次跑测里日志侧（成因只在日志分家，事件名与级别沿用改动前）：

```
- warn wordbook_invalid_entry {"userId":25,"facade":"PUT /api/wordbook","cause":"malformed_json","count":0}
- warn wordbook_invalid_entry {"userId":26,"facade":"PUT /api/wordbook","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":27,"facade":"POST /api/wordbook/push","cause":"malformed_json","issues":1}
- warn wordbook_invalid_entry {"userId":28,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
共 13 条，cause 取值集合 = ["invalid_word_name","malformed_json"]
```

结论：`error` 键名一字未动、只换值；恒两键；`code` 恒 `INVALID_WORDBOOK_ENTRY` 且不随成因变化；`cause` 不进响应体；四个 400 出口都不是 500。R-17⑧ 成立。

---

## 3. 四面 × 六输入 实测矩阵（Phase 5 必测基线）

### 3.1 我的原始观察 + TPM 裁决（如实保留）

- **原始观察（T-09r1 落盘、本轮回读）**：`wordbook-concurrency.spec.ts:1219` 的用例名与断言写着"65 字符在 tRPC `wordbook.add` 上是 **200**、REST `push` 上是 **400**"，并指出 A-37 §八-32 约束② 的前提（"65 字符走契约关在 tRPC 面只能得 `BAD_REQUEST`"）与实测不符 —— 根因是 `trpc/routers/wordbook.ts:40` 的 `add` 入参关是**文件内联**的 `.max(100)`，不经 `contracts/wordbook.ts` 的 `WordKeySchema`/`WordbookEntrySchema`（`.max(WORD_MAX_LENGTH)`）。
- **裁决（已归位）**：**我的观测是对的，是 TPM 写错了。** 见 `04-adjudications.md` 行 458 的 **A-39 §41**（简报写作"A-38 §41"，盘上该行的节标题是 A-39，见 `:453`）：① 收紧 `add` 为 `.max(WORD_MAX_LENGTH)` **归 E4 出口轮**，与 `dist` 重建、`ownership.json` 补录同批，**消耗本期唯一再生额度 `baseline-regenerate:A-37-E4`**；② `remove` 无上限登记为下一期项 **F-11**（理由：收紧 `remove` 会让旧 `PUT` 面写进来的 65–100 字符词永远删不掉）；③ PM 第 4 轮必须按本行实测矩阵改 §5.4-4 判据① 的门面适用范围，不得再沿用那句错前提。
- **本轮动作**：**什么都不改**（未碰 router、未碰基线、未碰断言），只把矩阵补全为真实数字。

### 3.2 取数方式

单一临时取证件 `%TEMP%/t09r2/matrix.mts`（`tsx` 直跑，仓库内**不留任何文件**、**不新增 spec**）：`os.tmpdir()` 下独立 sqlite（`init()` 后立刻显式跑 `ALL_MIGRATIONS`，用 `db/types.ts:607` 登记的豁免① `TM_DB_ALLOW_UNMIGRATED=1` 过启动自检 —— 该豁免的前提正是"调用方紧接着就要 migrate"）；REST 面 = `new Hono().route('/', createWordbookRouter(db,{flags,cache,now,log}))`（§10.3 standalone，不挂 `app.ts`）；tRPC 面 = 真 HTTP 载体（`@hono/trpc-server`，A-33-6 口径：`createCallerFactory` 直调会剥掉 `data` 取不到 `data.code`）；`wordbookIncremental = 100%`；每格一个新用户，互不串扰。

### 3.3 矩阵（真实数字）

| 面 | 输入 | HTTP 状态 | 响应/载体里的 code | REST 响应体键集合 | 词最终是否进书 |
|---|---|---|---|---|---|
| tRPC add | 空串 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC add | 纯空格(3) | 200 | `-` | `-` | **否** |
| tRPC add | 64 字符 | 200 | `-` | `-` | 是 |
| tRPC add | **65 字符** | **200** | `-` | `-` | **是** |
| tRPC add | 100 字符 | 200 | `-` | `-` | 是 |
| tRPC add | 101 字符 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC remove | 空串 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC remove | 纯空格(3) | 200 | `-` | `-` | 否 |
| tRPC remove | 64 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | 65 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | 100 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | **101 字符** | **200** | `-` | `-` | 否 |
| REST PUT(legacy) | 空串 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST PUT(legacy) | 纯空格(3) | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST PUT(legacy) | 64 字符 | 200 | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | **65 字符** | **200** | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | **100 字符** | **200** | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | 101 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 空串 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 纯空格(3) | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 64 字符 | 200 | `(无码·成功体)` | `added+merged+ok+removed+version` | 是 |
| REST push(契约) | **65 字符** | **400** | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 100 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 101 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |

### 3.4 矩阵读出来的四条新事实（超出 A-39 §41 已写范围）

1. **`add` 的纯空格是 200，不是 `BAD_REQUEST`**：`z.string().min(1)` 放行 3 个空格，service 的 `addWord`（`:500` `String(rawWord).trim().toLowerCase()`）把它洗成空串后 `applyOps` 不加条目 ⇒ **200 + 静默 no-op**（`inBook=否`）。A-39 §41 只登记了 65/100 这一半，空白那一半在 tRPC 面今天**既不 400 也不带码**，§5.4-2 判据"纯空格必 400"在 tRPC 面不成立（Q-1）。
2. **65–100 字符经 tRPC `add` 会真的写进书**（`inBook=是`），而 `GET /api/wordbook/pull` 的 `snapshot()`（`wordbook-service.ts:386-389`）**不做契约校验**，`WordbookPullResultSchema.entries = z.array(WordbookEntrySchema)`（`contracts/wordbook.ts:68-72` + `:21` 的 `.max(64)`）⇒ 增量客户端按契约严格解析全量快照时，这一本词会**整批解析失败**。服务端侧未越界（矩阵实测），但这是 E4 收紧 `add` 的实质理由，不只是"口径收敛"（Q-2）。
3. **`remove` 六格只有空串 400**，其余全 200 ⇒ 印证 A-39 §41② 的推理成立：收紧 `add` 之后，存量 65–100 字符词仍能删。F-11 的定性不变。
4. **REST `push` 的"纯空格"被拒但拒绝点不在契约关**：契约 `word: z.string().min(1)` 放行空格，真正拒它的是 service 侧 `invalidWordKeys`（`wordbook-merge.ts:488`，去空白后为空），日志里 `facade` 字段因此是 `push` 而不是 `POST /api/wordbook/push`（见 §2.2 的 `userId:20`）。两关的成因都可辨、响应仍同一主体；但 `wordbookPushIssueCause`（`:663-667`）按"path 含 `word` ⇒ `invalid_word_name`"分类，**分不清长度与空白**——只影响日志粒度，不改（登记为观测）。

---

## 4. 待 TPM 拍板项（Q-1…Q-7，本轮一个都没自己动）

| # | 事项 | 我的建议 |
|---|---|---|
| **Q-1** | tRPC `add` 的**纯空格 → 200 + 静默 no-op**：§5.4-2 判据四类里的"纯空格"在 tRPC 面既不 400 也不带任何码，A-39 §41 未覆盖这一半 | E4 只做 `.max(WORD_MAX_LENGTH)`，**不要**顺手加 `.trim()`：加 trim 会让 `typeName` 从 `ZodObject.shape.word=ZodString` 变成 `ZodEffects`，形状漂移面比单纯改 `max` 大得多（撞 §10.2 判据"入参形状只增不改"的边界）。空白词落不进库（矩阵已证），属"静默 no-op"而非脏数据 ⇒ 建议与 F-11 同批进下一期 |
| **Q-2** | 收紧 `add` 之后，**存量** 65–100 字符词怎么办（本期无回填纪律 R-24④，`pull` 快照会把它们继续发给增量客户端 → 契约解析整批失败，见 §3.4 第 2 条） | 请在 E4 明写一条口径：增量客户端（T-14/T-16）**读侧必须宽容、写侧严格**，或把 `WordbookPullResultSchema` 的 `.max` 放宽为只约束写面。这是"谁兜住"的选择，不是 T-09 可自决面（`packages/shared/**` 不属我） |
| **Q-3（含对 §5.4-4 判据① 门面适用范围的意见）** | 判据①"四类输入 → 400 + `INVALID_WORDBOOK_ENTRY` + 数字 64"的门面适用范围 | 建议 PM 第 4 轮写成三段，**不得**写成"四面同一码"：① **REST 两面（旧 PUT 载荷关 / push 契约关）+ service 直调** → 400 + `INVALID_WORDBOOK_ENTRY` + §5.4-2 定稿句；② **tRPC 入参关** → 400 + 协议码 `BAD_REQUEST`（`data.httpStatus` 与 REST 等值，A-35-9 同型显式契约），**即使 E4 收紧 `add` 之后仍是 `BAD_REQUEST` 而非本码**；③ **65–100 字符在旧 PUT 与 tRPC `add` 上恒 200** = Q5「只放宽不收紧」兼容面，不判缺陷（矩阵已给真值） |
| **Q-4** | §10.2 T-09 行的出口命令是 `pnpm --filter @tm/server test -- wordbook && pnpm depcruise`：**`pnpm depcruise` 在 r1、r2 两轮都没跑**（r2 被简报限成 ≤2 条出口命令，全部预算给了取证件矩阵） | 诚实登记为未自证项；建议由 **E4 出口轮**统一跑 `depcruise` + `ddl-parity` 并计入 T-09 账面。我不擅自加跑第 3 条命令 |
| **Q-5** | `GET /api/wordbook/pull` 的 `since` **恒不参与判定**（`routes/wordbook.ts:125-130`，注释自陈 D-3）：本期恒回全量快照 | 与 PRD §6.2-3"缺省/失效一律回全量、不得 4xx"不冲突（恒全量 = 缺省分支的超集），但"增量窗口"这半本期不存在。请在 §6.2-3 补一句"`since` 本期为占位、不判 4xx、不参与裁剪"，否则 QA 会按增量语义判缺陷 |
| **Q-6** | 简报/A-39 §41 的行号锚与盘上差 1–7 行（`wordbook-service.ts:711`→`:704`；`trpc/routers/wordbook.ts:41/:52`→`:40/:50`），见 §1.3 | 建议 PM/架构在第 4 轮改写时以盘上为准，并按 A-38 §30 的做法加一条"引用前 `grep -n` 复锚"纪律。我未改任何文档 |
| **Q-7（旧账，仍未闭合）** | D-1：`app.ts` 未给 `createWordbookRouter` 注入 `flags` ⇒ 词本门面经 `flagsOf()` WeakMap 自建实例，最坏慢一个 TTL（用例已钉"仍在 60 秒承诺内"，`wordbook-concurrency.spec.ts:631`） | 属 T-07 独占面（`app.ts`），T-09 不可写。请确认是否由 **E4** 一次性收口；不收口则 §6.4-5-3 的"≤60 秒"仍成立，账面可过 |

---

## 5. 越界申请 / 契约偏差 / 已知限制 / 给测试的提示

- **越界申请**：**0 件**。本轮零改动，未产生任何越界写。临时件全部在 `%TEMP%/t09r2/`（`matrix.mts`、`probe.db`、`exit.md`），仓库内不留。
- **契约偏差**：D-1（见 Q-7）、D-3（见 Q-5）两条**沿用 T-09 首轮报告的既有登记**，本轮未新增偏差；§4.6 三个冻结集合（`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS`）零触碰，接线只 import `TM_ERRORS_SUPPLEMENT` 的两个助手（`errors.ts:228-230` 自陈的那两个）。
- **已知限制（诚实）**：① 本轮未跑 typecheck/test/depcruise，绿是 TPM 实跑的账面（§1.1 回抄），我未复核；② 矩阵的取证件跑在**独立临时库 + standalone 装配**，不覆盖 `app.ts` 生产装配面（该面的词本形状由 `legacy-apk.spec.ts` 与 `wordbook-concurrency.spec.ts:631` 钉住）；③ pg 驱动侧未取数（矩阵只有 sqlite）；④ 65–100 字符经 tRPC `add` 进书后 `pull` 整批解析失败这一条是**契约形状推得的结论，未实测客户端解析**（§3.4 第 2 条已标明）。
- **给 Phase 5 / QA 的提示**：
  1. §3.3 那张矩阵是本期**必测基线**（A-39 §41③ 要求 PM 按它改文档，Phase 5 按它验收）。逐格可判真假，尤其 **REST `PUT` 65/100 字符 = 200** 这一格 —— 它就是 PRD §5.4-4 差口① 点名要 Phase 5 取的那条 R-17⑧ **反向哨**证据（`LEGACY_WORD_MAX_LENGTH` 未被误当 64 收紧），本轮已实测为真。
  2. 必测"四个 400 出口逐字节同一个体 + 无 500 + 无裸码"已在 `:1052` 钉住；请另补 **非词本面不受影响** 的抽查（`WORDBOOK_STALE` 409 / `WORDBOOK_TOO_LARGE` 413 两支本轮零 diff，`wordbook-service.ts:674-698`）。
  3. 若 QA 按 §5.4-4 判据① 原文把"tRPC `add` 收 65 字符"判成缺陷 —— **不判**，以 Q-3 的三段口径为准（该口径等 PM 第 4 轮落文，落文前请先按 A-39 §41 裁决行判定）。
  4. 日志侧断言只需"存在 `cause` 键且取值 ∈ {`malformed_json`,`invalid_word_name`}}"，**不得**断言用户可见差异（§5.4-2 判据原句）。

---

## 6. 附：`%TEMP%/t09r2/exit.md` 实测输出全文

```markdown
# T-09r2 出口实测输出（单一临时取证件 `%TEMP%/t09r2/matrix.mts`，tsx 直跑，库=临时 sqlite）

## 1. 四个面 × 六种词名输入的实测矩阵（真实数字，非推断）

| 面 | 输入 | HTTP 状态 | 响应/载体里的 code | REST 响应体键集合 | 词最终是否进书 |
|---|---|---|---|---|---|
| tRPC add | 空串 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC add | 纯空格(3) | 200 | `-` | `-` | 否 |
| tRPC add | 64 字符 | 200 | `-` | `-` | 是 |
| tRPC add | 65 字符 | 200 | `-` | `-` | 是 |
| tRPC add | 100 字符 | 200 | `-` | `-` | 是 |
| tRPC add | 101 字符 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC remove | 空串 | 400 | `BAD_REQUEST` | `-` | 否 |
| tRPC remove | 纯空格(3) | 200 | `-` | `-` | 否 |
| tRPC remove | 64 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | 65 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | 100 字符 | 200 | `-` | `-` | 否 |
| tRPC remove | 101 字符 | 200 | `-` | `-` | 否 |
| REST PUT(legacy) | 空串 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST PUT(legacy) | 纯空格(3) | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST PUT(legacy) | 64 字符 | 200 | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | 65 字符 | 200 | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | 100 字符 | 200 | `(无码·成功体)` | `ok` | 是 |
| REST PUT(legacy) | 101 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 空串 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 纯空格(3) | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 64 字符 | 200 | `(无码·成功体)` | `added+merged+ok+removed+version` | 是 |
| REST push(契约) | 65 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 100 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |
| REST push(契约) | 101 字符 | 400 | `INVALID_WORDBOOK_ENTRY` | `code+error` | 否 |

## 2. R-17⑧ 兼容面自证：五个 400 出口的响应体逐字节比对

- PUT  坏 JSON → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- PUT  词名非法 → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 坏 JSON → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 词名非法(65) → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}
- push 词名非法(101) → status=400 body={"error":"这个词没法存进单词本（词名不能为空，最长 64 个字符）","code":"INVALID_WORDBOOK_ENTRY"}

- 键集合（每一体）：["code","error"]
- 五体逐字节全等：TRUE
- 码值恒定不分成因：TRUE
- 响应体里出现 cause 的条数（应为 0）：0
- 状态码是否为 500（应为 false）：false

## 3. 同一次跑测里日志通道收到的 `wordbook_invalid_entry` 事件（成因只在日志分家）

- warn wordbook_invalid_entry {"userId":13,"facade":"PUT /api/wordbook","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":14,"facade":"PUT /api/wordbook","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":18,"facade":"PUT /api/wordbook","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":19,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
- warn wordbook_invalid_entry {"userId":20,"facade":"push","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":22,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
- warn wordbook_invalid_entry {"userId":23,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
- warn wordbook_invalid_entry {"userId":24,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
- warn wordbook_invalid_entry {"userId":25,"facade":"PUT /api/wordbook","cause":"malformed_json","count":0}
- warn wordbook_invalid_entry {"userId":26,"facade":"PUT /api/wordbook","cause":"invalid_word_name","count":1}
- warn wordbook_invalid_entry {"userId":27,"facade":"POST /api/wordbook/push","cause":"malformed_json","issues":1}
- warn wordbook_invalid_entry {"userId":28,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}
- warn wordbook_invalid_entry {"userId":29,"facade":"POST /api/wordbook/push","cause":"invalid_word_name","issues":1}

共 13 条，cause 取值集合 = ["invalid_word_name","malformed_json"]
```

> 注：矩阵第 1 节里的 `userId` 编号与 §3.3 表的行序对应关系为 —— `add`=1–6、`remove`=7–12、`PUT`=13–18、`push`=19–24，逐字节比对块=25–29。日志块中 `userId:20` 那条 `facade:"push"`（而非 `"POST /api/wordbook/push"`）即 §3.4 第 4 条登记的"纯空格由 service 关拒、不由契约关拒"。
