# 04-dev-report-E3-prime · 批次3 收口硬门禁 E3′：`trpc-shape` 基线**唯一一次**再生

- 角色：测试基建工程师（出口轮 E3′）
- 裁决依据：`.delivery/04-adjudications.md` **A-36 一-#1/一-#2/三-#17①/四**（开工条件与硬对照表）
- 核对基准：`.delivery/04-dev-report-E3.md` §2/§3/§4
- 通道用法：`.delivery/04-dev-report-F2.md` §4-B/§4-C/§4-D
- 日期：2026-09-20
- 铁律自查：本轮**未做任何 git 写操作**；可写面仅 `packages/server/test/trpc-shape.baseline.json` + 本报告；未在仓库 `data.db` 上跑写操作（本用例不建 ctx、不触 db/LLM）；再生额度**只花一次**。

## 0. 结论先行（一句话）

**四组差异恰好对上 A-36 四-2 的对照表，`auth.login` / `auth.sendCode` 逐字节 0 行（#6 修对了），E3′ 已花掉批次3 唯一一次再生额度：新基线 sha `5d89760c…`，`trpc-shape` 全绿，`--check-ownership --task E3` 绿，批次3 出口手续闭合。**

⚠ 一句话不藏：再生把计划内那 1 红（`trpc-shape`）转绿的同时，暴露出**另一条此前没登记的红** —— `packages/server/test/integration/profile-output-parser.spec.ts:330` 把"基线尚未再生"这一 E3′ 之前的状态钉成了期望值（`@tm/server` 仍 356 用例，但 355 绿 / 1 红，套件 exit 1）。它属 spec 断言，是我的越界禁区，**未修、未放宽、未第二次再生**，逐条归因见 §6.1，待 TPM 拍板见 §9-1。

## 1. 再生前失败明细（步骤 1，真实粘贴）

命令：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape`（2026-09-20 06:29，再生前）

```
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 13ms
   ✓ T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 快照非空（防止空清单把门禁跑成永真） 1ms
   × T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面） 11ms
     → appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.logout, auth.register, profile.get, profile.update, review.queue, review.undo

⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.logout, auth.register, profile.get, profile.update, review.queue, review.undo
 ❯ test/trpc-shape.spec.ts:390:13

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  06:29:26
   Duration  1.83s (transform 309ms, setup 0ms, collect 1.51s, tests 13ms, environment 0ms, prepare 112ms)
undefined
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run --root ../.. --project "@tm/server" trpc-shape
```

### 1.1 取证口径（与 E3 报告 §1 同一手法，同一把尺子）

用例本身只打印**首个**差异行，拿不到逐轴明细，所以本轮沿用 E3 的方法：把 `trpc-shape.spec.ts` 的快照装配逻辑**逐字节复制**到仓库外临时件 `$TEMP/e3p/e3p-snapshot.ts`（= `C:\Users\曹怡明\AppData\Local\Temp\e3p\`），只改三处：① 两条 import 改绝对路径（同一份 `appRouter`/`createCallerFactory`）；② 删 `describe/it`，改写 `current-snapshot.json`；③ 不写 `BASELINE_FILE`。`describeZod` / `PROBES`(57 条) / `probeInput` / `procedureList` / `callerSurface` / `stableJson` 原样保留。**未建 ctx、未触 db/LLM**，与用例同口径；`data.db` 一个字节未碰。

```
$ node_modules/.bin/tsx /tmp/e3p/e3p-snapshot.ts
WROTE C:\Users\曹怡明\AppData\Local\Temp\e3p\current-snapshot.json
procedures=29 callerSurface=39 domains=10
byType={"mutation":19,"query":9,"subscription":1}
```

比对件 `$TEMP/e3p/audit.cjs`：按 `path` 对齐，七轴（`type`/`meta`/`nMiddlewares`/`input`/`output`/`inputProbes`/`outputProbes`）做叶子级 diff（探针数组按 `probe` 名对齐，不按位序，避免"整体替换"被算成 1 行），再单独比 `counts` 与 `callerSurface` 集合差。

> 自我校验：本脚本的复制件在新基线写盘后与基线**逐字节相同**（见 §4.4），故复制未失真。

### 1.2 再生前基线 sha256（A-28-1 额度未花的复核）

```
$ sha256sum packages/server/test/trpc-shape.baseline.json
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7 *packages/server/test/trpc-shape.baseline.json
```

即 E3 报告 §8 记录的 `9cc6b319…`，一字未动 ⇒ F2 确实没花额度。

## 2. 硬停条件判定（A-36 四-2：`auth.login` / `auth.sendCode` 必须 0 行）

**判定 = 通过，允许再生。** 三条独立证据：

1. **用例自己的"受影响 procedure"清单**（§1 输出）9 条：`auth.activate`、`auth.changePassword`、`auth.forceChangePassword`、`auth.logout`、`auth.register`、`profile.get`、`profile.update`、`review.queue`、`review.undo` —— **不含 `auth.login`、不含 `auth.sendCode`**。（该清单的口径是"整条 procedure 的 JSON 与基线不同名即列"，7 条新 path 因基线无同名项必被列出，属预期。）
2. **逐轴 diff**（§3.2）：22 条共有 procedure 里 `auth.login` / `auth.sendCode` 落在**零漂移 20 条**名单内，七轴差异计数全为 0。
3. **整条 procedure 逐字节比对**（最直接）：

```
auth.login 逐字节相同= true
auth.sendCode 逐字节相同= true
基线 auth.login password= {"typeName":"ZodOptional","innerType":{"typeName":"ZodString","coerce":false,"checks":[]}}
基线 auth.login phone checks= [{"kind":"regex","regex":{},"message":"手机号格式不正确"}]
基线 auth.sendCode phone checks= [{"kind":"regex","regex":{},"message":"请输入正确的手机号"}]
```

⇒ DEFECT-3（`password` 的 `min(8)/max(72)` 被摘掉，登录面只留 `optional()`）与 DEFECT-4（两条 message 逐字还原成人话、不合并）都**已从 diff 里消失**，这正是 A-36-#6 说的"修对了的可观测证据"。实物复核（只读）：`packages/shared/src/contracts/auth.ts:24/:26` 两个具名常量 `PHONE_LOGIN_COPY='手机号格式不正确'` / `PHONE_SEND_CODE_COPY='请输入正确的手机号'`、`:33` `phoneSchema(message)` 工厂（正则仍只有 `PHONE_PATTERN` 一份）、`PasswordSchema` 仍被注册/改密/强升三面引用而登录面不引用；`limits.ts:107-108` `DAILY_GOAL_MIN=1`/`DAILY_GOAL_MAX=200` 未被改动。**本轮未修任何源码。**

## 3. 逐轴差异审计（步骤 3：差异必须恰好等于四组）

审计脚本原始输出（`node /tmp/e3p/audit.cjs`，节选头四行）：

```
基线 procedure 数 = 22 | 现状 = 29 | 共有 = 22
新增 path (7): auth.activate, auth.changePassword, auth.forceChangePassword, auth.logout, auth.register, review.queue, review.undo
删除 path (0): (无)
零漂移 procedure (20): agent.chat, analyst.refresh, analyst.report, assessment.generate, assessment.submit, auth.login, auth.me, auth.sendCode, chat.history, checkin.create, checkin.status, dictionary.lookup, dictionary.lookupStatic, profile.changePassword, review.reviewCard, review.today, wordbook.add, wordbook.clear, wordbook.list, wordbook.remove
有变化 procedure (2): profile.get, profile.update
```

### 3.1 清单层（对齐 E3 报告 §2）

| 项 | 基线 | 现状应得 | 判定 |
|---|---|---|---|
| procedure 总数 | 22 | 29 | `+7 path` 只增 ✓ |
| 新增 path（7） | — | `auth.activate`、`auth.changePassword`、`auth.forceChangePassword`、`auth.logout`、`auth.register`（T-07，R-39/R-40）、`review.queue`、`review.undo`（T-10，R-02③④） | A-28-1 明文"允许出现新 `path`" ✓（与 E3 §2 名单逐字相同） |
| 删除 path | 22 | 0 条被删 | ✓ |
| domains | 10 域 | 同一份 10 域（`agent/analyst/assessment/auth/chat/checkin/dictionary/profile/review/wordbook`） | 不变 ✓ |
| byType | mutation 13 / query 8 / subscription 1 | mutation 19 / query 9 / subscription 1 | `+6 mutation +1 query = 7`，恰等于新 path 的类型分布 ✓ |
| callerSurface | 32 行 | 39 行；`仅现状有` = 7 条（逐字 = 7 条新 path 的 `X = procedure`），`仅基线有` = **0 条** | 只增 ✓ |

`counts` 轴叶子差异共 3 条，全部是上面 7 条新 path 的**派生量**（`procedures 22→29`、`byType.mutation 13→19`、`byType.query 8→9`），无独立成因。

### 3.2 逐 procedure 七轴

`type` / `meta` 两轴：**22 条共有 procedure 全部 0 漂移**。有变化的只有 2 条：

```
### profile.get  轴差异计数={"type":0,"meta":0,"nMiddlewares":1,"input":0,"output":1,"inputProbes":0,"outputProbes":58}
  [changed] nMiddlewares            基线: 2  ->  现状: 3
  [changed] output                  基线: null
                                    现状: {"typeName":"ZodObject","unknownKeys":"strip","shape":{…1478B}}
  [removed] outputProbes[probe:(no-parser)]  基线: {"probe":"(no-parser)","ok":false,"issues":null,"data":"unparseable:undefined"} -> (absent)
  [added]   outputProbes[probe:*]   57 条真实探针（= 固定探针集全量 57 条），基线侧全部 (absent)

### profile.update  轴差异计数={"type":0,"meta":0,"nMiddlewares":0,"input":3,"output":0,"inputProbes":6,"outputProbes":0}
  [removed] input.shape.avatar.innerType.checks[0]        基线: {"kind":"max","value":500} -> (absent)
  [added]   input.shape.daily_goal                         基线: (absent) -> {"typeName":"ZodOptional","innerType":{"typeName":"ZodNumber","coerce":false,"checks":[{"kind":"int"},{"kind":"min","value":1,"inclusive":true},{"kind":"max","value":200,"inclusive":true}]}}
  [changed] input.shape.dailyGoal.innerType.checks[2].value 基线: 100 -> 现状: 200
  [changed] inputProbes[probe:profileAvatar].ok            false -> true
  [removed] inputProbes[probe:profileAvatar].issues[0]     {"path":"avatar","code":"too_big","message":"String must contain at most 500 character(s)"}
  [added]   inputProbes[probe:profileAvatar].data          {"avatar":"aaaa…(501 字符)"}
  [changed] inputProbes[probe:profileDailyGoal101].ok      false -> true
  [removed] inputProbes[probe:profileDailyGoal101].issues[0] {"path":"dailyGoal","code":"too_big","message":"Number must be less than or equal to 100"}
  [added]   inputProbes[probe:profileDailyGoal101].data    {"dailyGoal":101}
```

`inputProbes` 那 6 条**不是第 4 组差异**：它们逐条都是上述 3 个 `input` 键的机械投影（`profileAvatar` ← `avatar` 摘 `max(500)`；`profileDailyGoal101` ← `dailyGoal` 域 100→200；探针集里没有任何 `daily_goal` 样本，故新增 canonical 键在探针轴上 0 行）。E3 §3 表 1/1b/1c 三行的探针投影数与此完全一致。

**profile.get 三轴的名称/顺序取证**（A-36-2 要求"只能多 `outputValidatorMiddleware` 这一个"，名称或顺序对不上即红）。快照面只存 `nMiddlewares` 计数，名称须另取：

```
$ node_modules/.bin/tsx /tmp/e3p/mw.ts
profile.get: nMiddlewares=3 -> #0{name:,_type:-} #1{name:outputValidatorMiddleware,_type:output} #2{name:resolveMiddleware,_type:-}
profile.update: nMiddlewares=3 -> #0{name:,_type:-} #1{name:inputValidatorMiddleware,_type:input} #2{name:resolveMiddleware,_type:-}
auth.login: nMiddlewares=2 -> #0{name:inputValidatorMiddleware,_type:input} #1{name:resolveMiddleware,_type:-}
auth.sendCode: nMiddlewares=2 -> #0{name:inputValidatorMiddleware,_type:input} #1{name:resolveMiddleware,_type:-}
auth.me: nMiddlewares=2 -> #0{name:,_type:-} #1{name:resolveMiddleware,_type:-}
review.queue: nMiddlewares=3 -> #0{name:,_type:-} #1{name:inputValidatorMiddleware,_type:input} #2{name:resolveMiddleware,_type:-}
auth.register: nMiddlewares=2 -> #0{name:inputValidatorMiddleware,_type:input} #1{name:resolveMiddleware,_type:-}

profile.get output: typeName=ZodObject unknownKeys=strip
键数=13 键名=avatar,dailyGoal,daily_goal,hasPassword,nickname,phone,pwPolicyVersion,reviewDates,reviewDays,streak,totalWords,updated_at,user_id

对照: protectedProcedure 中间件数 = 1 | +.output() 后 = 2 -> :-, outputValidatorMiddleware:output
```

判定：新增项名称**逐字**是 `outputValidatorMiddleware`（`_type:output`），插在既有 `#0` 与原末位 `resolveMiddleware` 之间 ⇒ 原有条目的相对顺序未变；对照实验证明"挂 `.output()` 必然 +1 且名字就是它" ⇒ 符合 A-36-2 写死的口径。`output` 轴 13 键 = 8 契约键 + 5 统计键、`unknownKeys='strip'`，与 A-35-1① 逐字相符（E3 §3 行 2 的实测结论复现）。

### 3.3 差异总量与"除此之外不得多出一行"

| 组 | 叶子差异行数 | 是否落在 A-36 四-2 四组内 |
|---|---|---|
| 新增 path 本体（7 条 procedure 快照） | 7 条 path | 组 1 ✓ |
| `counts`（3）+ `callerSurface`（+7 / −0） | 10（全部为 7 条新 path 的派生量） | 组 1 ✓ |
| `profile.get` `output` / `outputProbes` / `nMiddlewares` | 1 + 58 + 1 = 60 | 组 2 ✓ |
| `profile.update` `input` 三键 | 3 | 组 3 ✓ |
| `profile.update` `inputProbes` 投影 | 6 | 组 3 的机械投影（见 §3.2） |
| `auth.login` | **0** | A-36 四-2 要求 0 ✓ |
| `auth.sendCode` | **0** | A-36 四-2 要求 0 ✓ |
| 其余 18 条共有 procedure | **0** | "其余一律 0 行" ✓ |

⇒ **无"多出的一行"**，未触 A-36 四-2 的停下条件。

### 3.4 审计结论逐条落表（步骤 4）

| # | procedure | 轴 | 改动前值 | 改动后值 | 依据裁决号 | 为什么算只增 |
|---|---|---|---|---|---|---|
| 1 | `auth.activate`/`auth.changePassword`/`auth.forceChangePassword`/`auth.logout`/`auth.register`/`review.queue`/`review.undo` | 整条 path 新增 | 基线无此 path | 29 条清单中各占 1 条（type/meta/input/output/探针指纹齐备） | A-28-1（"允许出现新 `path`"，前两条在裁决里被点名）+ E3 §2 名单逐字复现 | 新增面，不触碰任何既有条目；删除 path = 0、`仅基线有` 的 callerSurface = 0 ⇒ 纯增量 |
| 2 | `profile.update` | `input.shape.avatar` | `ZodOptional(ZodString[max 500])` | `ZodOptional(ZodString)`（摘 `max(500)`）；探针 `profileAvatar` `ok false→true` | A-30-2 逐字口径（E3 §3 行 1 已判"合法例外 ✓"） | 旧 `max(500)` 正是 C-04"头像永远失败"成因；接受域变大，无既有合法输入被新拒 |
| 3 | `profile.update` | `input.shape.daily_goal` | `(absent)` | `ZodOptional(ZodNumber[int,min 1,max 200])` | A-30-2"新增 `daily_goal`"（E3 §3 行 1b） | 新增可选键，旧调用形状不受影响 |
| 4 | `profile.update` | `input.shape.dailyGoal.checks[2].value` | `100` | `200`；探针 `profileDailyGoal101` `ok false→true` | **A-36-1**（本轮追认的第三条例外） | 措辞按该条：**`profile.update` 入参除 `nickname` 键不变外，`dailyGoal`/`daily_goal` 两键共用同一对 `DAILY_GOAL_MIN/MAX`**；`DAILY_GOAL_MAX=200` 是 shared 单一真相（`packages/shared/src/constants/limits.ts:108`，本轮实读，`routers/profile.ts:140/:142` 两键同引 `DAILY_GOAL_MIN/MAX`）⇒ **域扩至 200 属单一真相对齐，非放宽**；改回 100 才是在同一入参对象里造第二把尺子，并打红 `profile-output-parser.spec.ts:364/:381` 与 `profile-dto.spec.ts:287` |
| 5 | `profile.get` | `output` | `null` | 闭合 `z.object({…ProfileDtoSchema.shape, dailyGoal, totalWords, reviewDays, reviewDates, streak})`，13 键、`unknownKeys='strip'`（实测） | A-34-1③ + A-35-1①④ | 出参从"盲"变"可见"：基线该轴覆盖面为 0（E3 §5），装上 parser 不使任何旧调用变红，只新增可见性 |
| 6 | `profile.get` | `outputProbes` | 1 条 `(no-parser)` | 57 条真实探针（该轴 58 处叶子差异 = 57 增 + 1 删，与 E3 §3 行 2b 计数逐字相同） | A-35-1④（明文"由 `(no-parser)`→有值"） | 删掉的 1 条是"没有 parser"这一事实本身，不是任何被依赖的行为 |
| 7 | `profile.get` | `nMiddlewares` | `2` | `3`，新增项**逐字** `outputValidatorMiddleware`（`_type:output`，插在 `resolveMiddleware` 之前） | **A-36-2**（写死"只能多这一个"） | `.output()` 在 tRPC v11.18 必然 push 该中间件（对照实验：`protectedProcedure` 1 → `+.output()` 2，名字就是 `outputValidatorMiddleware`）；本轮全库其余 21 条共有 procedure 的 `nMiddlewares` **一律未变** ⇒ 名称/顺序/数量三项都落在裁决允许的窄口径内 |
| 8 | `auth.login` | 七轴 | — | — | A-36-3（定性为 bug、回环修，**不是**登记例外） | **0 行**：修对了的可观测证据就是它从 diff 里消失（A-36 四-2 ⚠ 段） |
| 9 | `auth.sendCode` | 七轴 | — | — | A-36-4 | **0 行**：同上 |
| 10 | 其余 18 条共有 procedure | 七轴 | 基线值 | 逐字节相同 | A-28-1 | 0 行，无需依据 |


## 4. 唯一一次再生 + sha256 登记（步骤 6）

### 4.1 再生（**整轮只此一次**，命令逐字照 F2 §4-D）

```
$ cp packages/server/test/trpc-shape.baseline.json /tmp/e3p/before.json
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7 *packages/server/test/trpc-shape.baseline.json   # before.json

$ TRPC_SHAPE_UPDATE=1 pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape
 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 15ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  06:34:50
   Duration  1.65s (transform 259ms, setup 0ms, collect 1.33s, tests 15ms, environment 0ms, prepare 116ms)
```

### 4.2 新基线 sha256（登记值）

| 项 | 值 |
|---|---|
| 旧基线（E3 §8 / 本轮 §1.2 实测） | `9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7` |
| **新基线（本轮再生后，即刻记录）** | **`5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`** |
| 行数 | 9793 → 18334 |
| scoped patch 净变化 | +8569 / −28 行（由门禁自己算出，见 §5 输出） |

**额度状态：批次3 的那一次已花完。** 此后未再跑任何带 `TRPC_SHAPE_UPDATE` 的命令；`ownership.json:751` 的 note 已写明批次4 的第二次再生须另立裁决号（A-36-#11），不得复用 `A-36-E3`。

### 4.3 复跑必绿（第二次跑**不带** env，用于确认"没再写盘"）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 7ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  06:35:44
EXIT=0
$ sha256sum packages/server/test/trpc-shape.baseline.json
5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72 *packages/server/test/trpc-shape.baseline.json
```

⇒ 全绿，且 sha 与 §4.2 逐字相同（复跑未改写文件）。**无"第二次仍红"的情形，未触发停止条件。**

### 4.4 取证件未失真的自证

新基线（去掉 env 的写盘结果）与再生前用独立复制件产出的 `current-snapshot.json` **逐字节相同**：

```
新基线 vs 独立复制件 current-snapshot.json = BYTE-IDENTICAL | len 432762 432762
```

⇒ §1/§3 的"再生前审计"与真正写进基线的内容是同一份，**审计结论对得上账**（这是 A-28-1"不许先再生再审计"约束下唯一可得的等价证明）。

### 4.5 patch 里 28 行"减号"的逐条归属（防止被读成"多出的行"）

`diff -u` 的减号行 = 27 行内容 + 1 行文件头。逐条映射到 §3 的轴：

| 减号行 | 归属 |
|---|---|
| `"sourceModule": "../src/trpc/router.js"` | **非快照面**：`provenance` 块。用例比对的是 `{procedures, callerSurface, counts}`（`trpc-shape.spec.ts:381` 逐字），`provenance` 不参与比对；新值来自 spec 自己的常量 `SOURCE_MODULE = '../src/trpc/routers/index.js'`（`trpc-shape.spec.ts:30`），由官方再生通道写入，**不是我改的、也不是任何 procedure 的形状**。此项 E3 §8 已提前记录"基线的 provenance 仍写着拆分前模块"，再生必然把它刷成拆分后的模块名 |
| `"nMiddlewares": 2` | `profile.get` 轴 2c（→ 3） |
| `"output": null` | `profile.get` 轴 2（→ 闭合 Schema） |
| `"probe": "(no-parser)"` / `"issues": null` / `"data": "unparseable:undefined"` | `profile.get` 轴 2b 删除的那 1 条 `(no-parser)` |
| `"value": 500` | `profile.update` 键 1（`avatar` 摘 `max(500)`） |
| `"dailyGoal": {` | `diff -u` 的**对齐伪影**：该键的语义变化只有下面那一行 100→200；键名在基线里既减又加（shape 键按字母序排列，新增 `daily_goal` 使块整体位移）。按 `probe`/键名对齐的语义 diff（§3.2）对该轴只报 1 条叶子差异 |
| `"value": 100,` | `profile.update` 键 3（`dailyGoal` 域 100→200） |
| `"ok": false` / `"issues": [...]` / `"path": "avatar"` / `"code": "too_big"` / `"message": "String must contain at most 500 character(s)"` 等 8 行 | `profile.update` 探针 `profileAvatar` 的投影（键 1 的后果） |
| `"ok": false` / `"issues": [...]` / `"path": "dailyGoal"` / `"code": "too_big"` / `"message": "Number must be less than or equal to 100"` 等 8 行 | `profile.update` 探针 `profileDailyGoal101` 的投影（键 3 的后果） |
| `"procedures": 22` / `"mutation": 13` / `"query": 8` | `counts` 轴，7 条新 path 的派生量 |

⇒ 减号行里**没有任何一行**落在 `auth.login` / `auth.sendCode` 或其余 18 条共有 procedure 上（用 `grep -n '^-'` 全量列出，见上表；`auth.*` 相关行数为 0）。

## 5. ownership 自证（步骤 5：必须 `--task E3`）

scoped patch 按 F2 §4-D 第 3 步产出（label = 仓库相对路径）：

```
$ diff -u --label a/packages/server/test/trpc-shape.baseline.json \
         --label b/packages/server/test/trpc-shape.baseline.json \
         /tmp/e3p/before.json packages/server/test/trpc-shape.baseline.json > /tmp/e3p/e3-scoped-baseline.patch
```

**出口判据（绿）**：

```
$ node tools/boundaries.mjs --check-ownership --task E3 --diff-file /tmp/e3p/e3-scoped-baseline.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/test/trpc-shape.baseline.json：走动作通道 baseline-regenerate:A-36-E3（按实际 diff 判定：+8569/-28 行）

--check-ownership task=E3 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
EXIT=0
```

⇒ 绿，且**说清了走的是哪条通道**（A-35-11 口径），并给出实际 diff 规模 `+8569/-28`。

**反确认（同一份 patch 换任务号必红，证明通道是窄的、不是自我盖章）**：

```
$ node tools/boundaries.mjs --check-ownership --task T-11 --diff-file /tmp/e3p/e3-scoped-baseline.patch
RED  packages/server/test/trpc-shape.baseline.json（通道 baseline-regenerate:A-36-E3 不通过）：baseline-regenerate:A-36-E3 未给 T-11 声明 baselineRegenerateFor.T-11 = 未登记的再生授权，拒绝判定（宁可红，也不放别的任务号碰基线）

--check-ownership task=T-11 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界
EXIT=1
```

按简报要求**未走 `T-08`**（F2 §9-拍板#1 已注明 `T-08` 是 owner 会被短路绕过通道 —— 既有缺口，不是本轮账）。本轮 `--files` 里未点名 `trpc-shape.spec.ts`，该文件一字节未改（见 §10）。

## 6. 最终数字（步骤 7，全部真实跑）

时点：再生（06:34:50）之后连跑，06:36~06:41。

| # | 命令 | 结果（真实粘贴） | exit |
|---|---|---|---|
| 1 | `pnpm --filter @tm/server test` | `Test Files 1 failed \| 14 passed (15)` / `Tests 1 failed \| 355 passed (356)`，Duration 15.79s（Start at 06:36:45）<br>✓ `test/trpc-shape.spec.ts (2 tests) 15ms`（输出文件 `:510` 行，**计划内那 1 红已转绿**）<br>× 唯一红：`FAIL @tm/server test/integration/profile-output-parser.spec.ts > A-34-1①③ 形状只增不改 … > procedure 清单一字未动：get / update / changePassword，且不存在 profile.stats`<br>`AssertionError: 基线现状：get 出参无 parser: expected { typeName: 'ZodObject', …(2) } to be null`（`test/integration/profile-output-parser.spec.ts:330:102`） | **1**（`Exit status 1`）——**非预期，见 §6.1** |
| 2 | `pnpm --filter @tm/web test` | `✓ @tm/web test/home-shell.spec.tsx (16 tests) 474ms` / `Test Files 1 passed (1)` / `Tests 16 passed (16)`（stderr 仍有 A-30-9 已登记的 `act()` 警告，T-22 名下，未处理） | 0 |
| 3 | `pnpm --filter @tm/server typecheck` | `$ tsc -p tsconfig.json --noEmit` → 无任何诊断输出，**0 错** | 0 |
| 4 | `pnpm --filter @tm/web typecheck` | `$ tsc --noEmit` → 无任何诊断输出，**0 错** | 0 |
| 5 | `pnpm --filter @tm/shared test` | `✓ @tm/shared test/contracts.spec.ts (50 tests) 88ms` / `Tests 50 passed (50)` —— T-03 翻转的 `contracts.spec.ts:337/898` 已生效（T-07r3 §6-4 那 1 红消失） | 0 |
| 6 | `node tools/boundaries.mjs --all` | `18/21 条通过，3 条红`（逐条见 §7） | 1 |
| 7 | `node tools/boundaries.mjs --self-test` | `boundaries --self-test：146/146 通过`（与 F2 收工的 146 条同数，未增未减） | 0 |

### 6.1 与简报预期的偏差：逐条归因（用例数 / 红项）

| 预期 | 实测 | 归因 |
|---|---|---|
| 356 用例 | **356** | 相符。= T-07r3 收工值（353 → +3 条 DEFECT-3/4 疫苗），本轮未增删任何用例 |
| 计划内那 1 红（`trpc-shape`）转绿 | **已转绿**（该文件 2/2 ✓） | 再生生效，且是"一次到位"：§4.3 复跑仍绿 |
| 其余全绿 ⇒ 套件 exit 0 | **未达成**：套件仍 exit 1，红项**换成另一条** | **新暴露项，非形状漂移、非回归**：`profile-output-parser.spec.ts:330` 把"**基线尚未再生**"这一 E3′ 之前的状态钉成了期望值。它读的是基线文件本身（`BASELINE_PATH`，`:63`），断言 `基线.procedures[profile.get].output` **`toBeNull()`**（`:331` 那条 `profile.update` 的 `toBeNull()` 仍真，因为 update 至今没挂 output parser）。旧基线该格 = `null` ⇒ 绿；新基线该格 = `{typeName:'ZodObject', unknownKeys:'strip', 13 键}` ⇒ 该断言必红。实测两侧取值：`before.json profile.get.output = null` / `new baseline profile.get.output = {"typeName":"ZodObject","unknownKeys":"strip","键数":13}` ⇒ **因果链唯一，与 `trpc-shape` 门禁无关** |
| — | 该文件其余 18 条全绿 | 见 §6.2 逐条清单；**A-35-1② 的 4 支键集合钉用例全绿** ⇒ §8 要复述的保护仍然在位 |

**这条红不在 A-36 四-1 的四条开工前置里**（那四条点名了 `contracts.spec.ts:337/898` 要由 T-03 翻转，却没点名这一格）。修法只有两种，且**都不在我的可写面内**：① T-11 微轮把 `:330` 翻成"再生后的真相"（`expect(…'profile.get').output).not.toBeNull()` + 顺手把 `:329` 的注释与断言对齐，措辞建议："基线已于 E3′ 再生，此格记录的不再是'改动前'"；② 由 TPM 裁一条"基线文件只许 `trpc-shape.spec.ts` 读"的口径，把这类"用例外壳读基线"的断言整体请出基线面。**我没有自行改 spec，也没有第二次再生**（两条都是禁区/超额）。⇒ 交 TPM 拍板（§9-1）。

### 6.2 `profile-output-parser.spec.ts` 19 条逐条（再生后用 `--reporter=verbose` 单文件实跑）

```
 ✓ A-34-1② 判据一 > profile.get（tRPC caller，真库真 router）过 ProfileGetOutputSchema 与 shared 的 ProfileDtoSchema
 ✓ A-34-1② 判据一 > profile.get（REST createProfileRouter）与 tRPC 线上 HTTP 都过同一个 parser
 ✓ A-34-1② 判据一 > parser 返回的就是服务端装配的那一份（键与值逐字相等，未被裁剪/未被补键）
 ✓ A-34-1② 判据一 > PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一个 parser 仍然放行（别名键必填就是误杀）
 ✓ A-34-1② 判据二 > 缺任一统计键 ⇒ 拒
 ✓ A-34-1② 判据二 > 类型/越界 ⇒ 拒：reviewDates 非字符串、daily_goal 越界、totalWords 负数
 ✓ A-34-1② 判据二 > 出参装配面已闭合（A-35-1①）：未知键不拒但会被 strip ⇒ 必须靠键集合钉兜住；REST 侧 passthrough 未动
 ✓ A-35-1② 键集合钉 > 真实 getProfileDto() 的键集合与闭合 schema 的声明键集合全等（开关 on 的默认产品态）
 ✓ A-35-1② 键集合钉 > 声明键集合 = PROFILE_DTO_KEYS（服务端自报清单）+ 唯一别名键，不从第三方形状派生
 ✓ A-35-1② 键集合钉 > PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一支钉仍然成立
 ✓ A-35-1② 键集合钉 > 三门面实际返回的键集合都 ⊆ 声明键，且过 parser 后不增键
 × A-34-1①③ 形状只增不改 > procedure 清单一字未动：get / update / changePassword，且不存在 profile.stats   ← 唯一红（:330）
 ✓ A-34-1①③ > profile.get：入参一字未改（0 个 input parser），出参 = ProfileGetOutputSchema 且 8 个契约键就是 shared 的那一份实例
 ✓ A-34-1①③ > profile.update：input 形状 = A-30-2 逐字口径，且本轮**没**给它挂 output
 ✓ A-34-1①③ > profile.changePassword：input 形状与出参未挂 parser 都保持 A-30-3 的"签名一字不动"
 ✓ A-34-1①③ > 错误体未被 output parser 打搅（A-30-1 的 errorFormatter 仍是唯一出口）
 ✓ 类型面（tsc 证据）× 3 条
 Tests  1 failed | 18 passed (19)
```

> 该用例名下的**其它**基线读取项（`:322-326` 的 `profile.*` 清单比对、`profile.stats` 不存在）在新基线上仍然为真 —— 红的那一格只有 `:330` 一行。

### 6.3 单文件复跑（终态，证明 §6 第 1 行的红与 `trpc-shape` 无关）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape > $TEMP/e3p/final-rerun.txt 2>&1
FINAL_EXIT=0
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 8ms
      Tests  2 passed (2)
   Start at  06:43:08

$ sha256sum packages/server/test/trpc-shape.baseline.json
5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72 *packages/server/test/trpc-shape.baseline.json
```

⇒ 门禁面 **exit 0 / 2 passed**，sha 仍等于 §4.2 的登记值（复跑未再写盘）。`@tm/server` 全套的 exit 1 完全来自 §6.1 那一格。

## 7. `--all` 的红项复述（上轮 18/21）

`node tools/boundaries.mjs --all` 本轮 = **18/21 通过，3 条红**（`ALL_EXIT=1`），**与 E3 §7.3/§7.4 同一批、同一条目、同一行号**，5 处命中原文本轮实读：

| 红项 | 命中（本轮实测行号 = 上轮行号） | 实读原文 | 是否"注释/描述类" |
|---|---|---|---|
| `colors-no-hardcode` | `apps/app/src/styles/app.css:5` | ` * 扫 \`apps/**\`，hex / \`rgb()\` / \`hsl()\` 命中即红），只做两件事：` | **是**（注释自述被扫） |
| 同上 | `packages/ui/src/patterns/GrowthLine.tsx:8` | ` * 不引 \`recharts\`、零新依赖、零 \`#RRGGBB\`/\`rgba()\`（§8.2-1 与 §3.5 \`ui-no-io\`）。` | **是** |
| `css-important-budget` | `packages/ui/src/styles/tokens.css:89` | `  .decor-breath, .animate-breath { animation-name: none !important; }` | **否：真 `!important`**（reduced-motion 复位），归 T-04，E3′ 无权处置 |
| 同上 | `packages/ui/test/patterns.spec.tsx:691` / `:695` | `it('包内不引图片资源、不写 \`!important\`，…')` / `expect(src).not.toMatch(/!important/);` | **是**（用例描述串与断言字面量被扫，扫描口径问题） |
| `web-home-transport` | `apps/web/src/components/home/result-section.tsx:12`、`apps/web/src/lib/api/lookup-stream.ts:4` | 两处均为注释：`…（判据⑤：首页无裸 \`fetch(\`）`、`为什么单独一个文件：首页不写 \`fetch(\`…` | **是** |

⇒ 复述结论：**3 条红仍是同一批**，且**5 处命中里 4 处是注释/用例描述类**，第 5 处（`tokens.css:89`）是 E3 已归口 T-04 的真 `!important`。E3′ **一条没修、没放宽、没加例外、未动 `tools/boundaries.mjs`**。`--self-test` 从 E3 轮的 135/135 → F2 轮的 146/146 → 本轮 **146/146**（增量全部来自 F2 的通道⑦ 7 条用例，非回归）。

## 8. 必须显式复述的一句话（A-36-17①）

**基线再生之后，"未声明键也能出现在响应里"这类下游依赖已经不再由 `trpc-shape` 基线覆盖；它的保护来自 `packages/server/test/integration/profile-output-parser.spec.ts` 的 A-35-1② 键集合钉用例（4 支：真实 `getProfileDto()` 键集合 ≡ 闭合 schema 声明键集合、声明键集合不从第三方形状派生、`PROFILE_DTO_LEGACY_ALIAS=off` 仍成立、三门面实际返回键集合 ⊆ 声明键且过 parser 后不增键）。** 本轮（再生后）这 4 支**实跑全绿**（见 §6.2 的 ✓ 清单）⇒ 该保护在位、可勾、不是空口。QA 若把"基线看不见"读成"没人守"，请指回本节。

## 9. 越界申请 / 待 TPM 拍板

| # | 事项 | 性质 | 我为什么不能自行处置 |
|---|---|---|---|
| 1 | **`profile-output-parser.spec.ts:330` 新暴露的红**（`基线现状：get 出参无 parser … toBeNull()`）：它把"基线尚未再生"钉成期望值，E3′ 再生必然打红它。A-36 四-1 的四条前置没点名这一格 | **需要一次 T-11 微轮（或 TPM 裁"外部 spec 不得读基线文件"口径）**；否则批次3 的 `@tm/server test` 出口判据拿不到 exit 0 | spec 是我的越界禁区；严禁为绿改断言；第二次再生禁止 ⇒ 只能停在这里报给 TPM。**注意：这不是基线审计失败**，`trpc-shape` 门禁 2/2 绿、新基线 sha `5d89760c…` 稳定 |
| 2 | **基线行号引用漂移**（注释/文档类，0 条断言受影响）：再生把基线从 9793 行撑到 18334 行，`packages/shared/src/contracts/auth.ts:19`（引 `:3199`/`:3876`）与 `:58`（引 `:3509-3517`）、`packages/server/test/integration/auth-hardening.spec.ts:1096`（同两串）、E3 §5（引 `:663`/`:7060`）现在都对不上。新锚点实测：`auth.login` 段起 `:6011`（入参 phone message 在 `:6042`）、`auth.sendCode` 段起 `:7663`（入参 phone message 在 `:7678`）、`profile.get` 段起 `:10862` | 归 T-03（`contracts/auth.ts`）、T-07（`auth-hardening.spec.ts`）各一行注释刷新；E3 §5 的记录由 QA 复核时按本节改引 | 这些文件全在越界禁区；且改注释不改变任何判定，我没必要为此碰它们 |
| 3 | 批次4 的第二次再生额度 | 提醒：`ownership.json:751` 已写明须**另立裁决号**，`A-36-E3` 已被本轮花掉（`baseline-regenerate:A-36-E3` 现留痕于本报告 §5） | 工具的窄性由 F2 落死，我不越前去"复用额度" |
| 4 | 前置四项的实测回执（无需拍板，只为 TPM 对账） | 已全部落地：① DEFECT-3/4 —— `auth.login`/`auth.sendCode` 在再生前的 diff 里**整条 procedure 逐字节 = 基线**（§2）；② `contracts.spec.ts:337/898` 翻转 —— `@tm/shared test` **50/50 全绿**（T-07r3 §6-4 那 1 红已消失）；③ E1c 报告已补齐；④ `--self-test` **146/146**（= F2 收工值） | — |

**未提任何越界写申请：本轮实际写入的文件只有 2 个** —— `packages/server/test/trpc-shape.baseline.json`（经官方 `TRPC_SHAPE_UPDATE=1` 通道，1 次）+ `.delivery/04-dev-report-E3-prime.md`。

## 10. 铁律自查

| 铁律 | 自查 |
|---|---|
| 禁止 git 写操作 | 只跑过 `git status --porcelain` / `git rev-parse --abbrev-ref HEAD` 两条只读命令；无 commit/push/stash/checkout/reset/clean/restore/add |
| 不清理/不还原他人未提交改动 | 工作区其它角色的改动一字节未动（本轮所有写操作只有 §9 末那两个文件） |
| 真实粘贴、禁止编造 | §1/§4/§5/§6/§7 的每个代码块都是命令原文 + 输出原文；`--all`/`--self-test`/typecheck 的 exit 码用 `$?` 实取（不是从 `tail` 的退出码冒充） |
| 不碰 `data.db` | 本轮唯一跑过的用例外代码 = `$TEMP/e3p/` 的取证脚本（只 import `appRouter` 建快照，不建 ctx、不开库）。集成用例自身按 `profile-output-parser.spec.ts:23` 只在 `os.tmpdir()` 的临时库上跑；未跑任何迁移。仓库 `data.db`（253952 B，mtime Sep 18 04:05）与 `packages/server/data.db`（0 B，mtime Sep 17 00:10）本轮 mtime 未变 |
| 不放宽比较口径 | 未改 `trpc-shape.spec.ts` 一字节。**取证方式说明**：`git status --porcelain` 显示该 spec 与基线**两个文件都是未跟踪状态（`??`）** ⇒ git 视角自证不了"未改"，故改用时序证据：spec 的 mtime = `2026-09-19 16:32:35`（早于本轮开工近 14 小时，本轮全程未被写），sha256 = `b5bf5db9c1c144aa85dae31711c3ebe994b3fe60d6e6dbfa88b77c2eeaa559f4`；基线 mtime = `2026-09-20 06:34:52` = 唯一那次再生的时刻。未删探针、未加例外、未改 `tools/**`；差异审计用"语义按 `probe`/键名对齐"的独立脚本，比原始 `diff -u` 更严（§4.5 把 raw 减号行也逐条归了属）。**同一原因**：基线未跟踪 ⇒ HEAD 相对 diff 根本产不出它的账，出口判据只能用自证 scoped patch（F2 §4-B② 口径，本轮照办） |
| 再生只一次 | `TRPC_SHAPE_UPDATE=1` 出现 **1 次**（06:34:50）。此后的 `trpc-shape` 运行全部**不带** env：06:35:44（单跑，绿）、06:36:45（`@tm/server` 全套内，绿）、06:42:47（单跑，绿）、06:43:08（终态单跑，`FINAL_EXIT=0`）⇒ sha 恒为 `5d89760c…`，**无第二次再生** |
| CLI 坑 | 单文件一律用 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server <名>`；未使用不生效的 `test -- <名>` 形式 |
| 未碰三个文档 agent 的产出 | `.delivery/01-prd.md` / `02-tech-design*.md` / `03-ui-spec.md` 只字未写 |
| 临时件 | 全部在仓库外 `$TEMP/e3p/`（`e3p-snapshot.ts` / `audit.cjs` / `mw.ts` / `before.json` / `e3-scoped-baseline.patch` / 各命令输出）。**保留未删**：`before.json` 与新基线是"唯一一次再生"的两端账，`ownership.json:751` 的窄通道要求可交 `--diff-file` 复验；简报未要求本轮删除，QA 复核后可自行清理 |
