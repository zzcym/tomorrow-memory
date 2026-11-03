# 04-dev-report-E3 · 批次3 出口轮 E3：`trpc-shape` 基线"只增不改"审计 + 一次性再生

任务：E3（A-28-1 / A-30-2 / A-34-1③ / A-35-1④ / A-35-14）
时间：2026-09-20 04:08 ~ 04:25（本机 Git Bash，`date` 逐条留痕）
并行在途：**E1c 收口轮正在改 `tools/boundaries.mjs` 与 `tools/ownership.json`**（本轮所有 `--all`/`--self-test` 结果均注明时间戳，红/绿中途变化不作回归处理，见 §7）

---

## 0. 结论先行（一句话）

**本轮未执行 `TRPC_SHAPE_UPDATE=1`，基线文件一个字节未改。**
"只增不改"审计**未通过**：22 条共有 procedure 里查出 **3 处未登记的形状变化（判为缺陷）** + **1 处已登记例外的机械副作用（`nMiddlewares` 轴，需 TPM 追认口径）**。按 A-28-1 与本轮简报第 1 步的硬前置，审计不过 → 停下不再生，交缺陷清单。这是本轮的合格答案，不是失败。

- 基线现状：`packages/server/test/trpc-shape.baseline.json` 与本轮开始时**逐字节相同**（sha256 见 §8 复核行）。
- 唯一红仍在：`@tm/server test` = **353 用例 / 1 红**（红 = `trpc-shape`，A-28-1 已知红）。

---

## 1. 方法与取证口径（怎么在"不动基线"的前提下拿到"现状应得"的快照）

A-28-1 只允许**一次**再生，所以**绝不能先再生再审计**。做法：把 `trpc-shape.spec.ts` 的快照装配逻辑**逐字节复制**到临时脚本（`$TEMP/e3-work/e3-snapshot.ts`），只改三处：
1. 两条 import 由相对路径改绝对路径（`packages/server/src/trpc/routers/index.ts` / `src/trpc/init.ts`，同一份 `appRouter`）；
2. 删掉 `describe/it`，改为把 `buildSnapshot()` 写到 `$TEMP/current-snapshot.json`；
3. 不写 `BASELINE_FILE`。
`describeZod` / `PROBES`（55 条固定探针）/ `probeInput` / `procedureList` / `callerSurface` / `stableJson` **原样保留** ⇒ 与真用例同一把尺子。运行：`node_modules/.bin/tsx $TEMP/e3-work/e3-snapshot.ts`（不建 ctx、不触 db/LLM，与用例同口径）。

对比脚本 `$TEMP/e3-work/audit.cjs`：按 `path` 对齐，逐轴比 `type / meta / nMiddlewares / input / output / inputProbes / outputProbes`，再单独比 `counts` 与 `callerSurface` 集合差。
（临时文件本轮结束前已删除；基线的修改通道只有官方 `TRPC_SHAPE_UPDATE=1`，本轮未使用。）

---

## 2. 清单层审计（这一层是干净的"只增"）

| 项 | 基线 | 现状应得 | 判定 |
|---|---|---|---|
| procedure 总数 | 22 | 29 | 只增 ✓ |
| **新增 path（7）** | — | `auth.activate`、`auth.changePassword`、`auth.forceChangePassword`、`auth.logout`、`auth.register`（T-07，R-39/R-40）、`review.queue`、`review.undo`（T-10，R-02③④） | A-28-1 明文"允许出现新 `path`" ✓（前两条在 A-28-1 里就被点名） |
| **删除 path** | 22 | 0 条被删 | ✓ 无意外删项 |
| domains | 10 个域 | 同一份 10 个域（`agent/analyst/assessment/auth/chat/checkin/dictionary/profile/review/wordbook`） | 不变 ✓ |
| byType | mutation 13 / query 8 / subscription 1 | mutation 19 / query 9 / subscription 1 | 增量全部来自新 path ✓ |
| callerSurface | 32 行 | 39 行；差集 = 7 条新 path，**"仅基线有"= 0 条** | 只增 ✓ |

---

## 3. 逐 procedure 轴审计表（22 条共有 procedure）

**18 条零漂移**（七轴全部逐字节一致，含探针指纹）：`agent.chat`、`analyst.refresh`、`analyst.report`、`assessment.generate`、`assessment.submit`、`auth.me`、`chat.history`、`checkin.create`、`checkin.status`、`dictionary.lookup`、`dictionary.lookupStatic`、`profile.changePassword`、`review.reviewCard`、`review.today`、`wordbook.add`、`wordbook.clear`、`wordbook.list`、`wordbook.remove`。
> 特别记两条：`profile.changePassword` 按 A-30-3"签名一字不动、函数体转调 `ctx.auth`"改造后**七轴零漂移**（基线无感，如裁决所预期）；`review.*` / `wordbook.*` 在 T-10/T-09 的 N-2/CL-3 改动后也零漂移。

**4 条有变化**：

| # | procedure | 变了哪一轴 | 具体差异（基线 → 现值） | 凭什么算"只增"？ | 对应裁决 | 判定 |
|---|---|---|---|---|---|---|
| 1 | `profile.update` | `input.shape.avatar` | `ZodOptional(ZodString[max 500])` → `ZodOptional(ZodString)`；探针 `profileAvatar`（501 字符）`ok false→true` | 登记例外：A-30-2 逐字口径（旧 `max(500)` 正是 C-04"头像永远失败"成因） | A-30-2 | **合法例外** ✓ |
| 1b | `profile.update` | `input.shape.daily_goal` | `(absent)` → `ZodOptional(ZodNumber[int,min 1,max 200])` | 登记例外：A-30-2"新增 `daily_goal`" | A-30-2 | **合法例外** ✓ |
| 1c | `profile.update` | `input.shape.dailyGoal` | `checks[2].value: 100 → 200`；探针 `profileDailyGoal101` `ok false→true` | **算不了只增**：A-30-2 逐字要求"`nickname`/`dailyGoal` 两键一字不变"，本键的域被放宽 | 无登记 | **DEFECT-1** |
| 2 | `profile.get` | `output` | `null` → 闭合对象 `z.object({...ProfileDtoSchema.shape, dailyGoal, totalWords, reviewDays, reviewDates, streak})`（`unknownKeys='strip'`，13 键 = 8 契约键 + 5 统计键） | 登记例外：A-34-1③ + A-35-1④"出参从盲变可见属只增"；形状与 A-35-1① 逐字相符（复用 `.shape` 而非 `.extend()`，`unknownKeys` 实测 `strip` 而非 `passthrough`） | A-34-1③ / A-35-1①④ | **合法例外** ✓ |
| 2b | `profile.get` | `outputProbes` | 1 条 `(no-parser)` → **57 条真实探针**（固定探针集共 57 条；该轴共 58 处差异 = 57 增 + 1 删） | 同上（A-35-1④ 明文"由 `(no-parser)`→有值"） | A-35-1④ | **合法例外** ✓ |
| 2c | `profile.get` | `nMiddlewares` | `2 → 3` | **不在任何裁决的措辞覆盖范围内**（A-28-1 明文"禁止 `nMiddlewares` 变化"）。但它是 2 的**机械副作用**：tRPC v11.18 的 `.output()` 就是把 `outputValidatorMiddleware` push 进 `_def.middlewares`。实证见 §4 DEFECT-2 | 待 TPM 追认 | **DEFECT-2（待拍板，偏向追认）** |
| 3 | `auth.login` | `input.shape.password` | `ZodOptional(ZodString[无 checks])` → `ZodOptional(ZodString[min 8, max 72])`；探针 `phonePassword`（`password:'abcd'`）**`ok true→false`**、`phoneEmptyStrings` 同向翻转 | **算不了只增**：既有键被**收紧**，接受域变小，且是行为翻转（旧值从"进得去 service"变成"zod 层就拒"） | 无登记 | **DEFECT-3** |
| 3b | `auth.login` | `input.shape.phone.checks[0].message` | `"手机号格式不正确"` → `"INVALID_PHONE"`（探针 `phoneBad11`/`phoneBadPrefix` 的 `issues[0].message` 同步变化） | 算不了只增：A-28-1 把"探针指纹变化"单列为禁止项。错误**判定**（`ok`）没变，变的是**文案串** | 无登记（与 A-28-4④/A-30-7"人话唯一真相在 shared"相冲） | **DEFECT-3**（与 3 同条上报） |
| 4 | `auth.sendCode` | `input.shape.phone.checks[0].message` | `"请输入正确的手机号"` → `"INVALID_PHONE"`（2 条探针 message 同步变化） | 同上 | 无登记 | **DEFECT-4** |

`type` / `meta` 两轴：**22 条共有 procedure 全部零漂移**（无一条形变、无一处 meta 变化）。

---

## 4. 缺陷清单（交 TPM；本轮一律未修、未放宽、未写进基线）

### DEFECT-1 `profile.update` 的 `dailyGoal` 别名键被放宽：`max 100 → 200`
- 直接违反 A-30-2 的逐字口径"**`nickname`/`dailyGoal` 两键一字不变**"。
- 实物：`packages/server/src/trpc/routers/profile.ts:141` `dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional()`，而 `packages/shared/src/constants/limits.ts:108` `DAILY_GOAL_MAX = 200`（注释标 R-04）。基线里那条 100 来自拆分前旧 router 的字面量。
- 行为后果：`{dailyGoal:101}` 由"拒"变"收"（探针 `profileDailyGoal101` 翻转）。
- **为什么不能靠"回滚成 100"解决**：现存绿用例已把 200 这套钉住 —— `packages/server/test/integration/profile-output-parser.spec.ts:364`（`input.safeParse({dailyGoal: DAILY_GOAL_MAX+1}).success === false`）、`:381`（tRPC 侧 `update({daily_goal: 201})` 必拒）、`profile-dto.spec.ts:287`（REST 人话含"1-200"）。把别名键改回 `max(100)` 会同时打红这些用例，并制造"REST 1-200 / tRPC 别名 1-100"的两把真相（A-30-2 立论本身要消灭的就是这个）。
- 归因：`routers/profile.ts` 归 T-11；`shared/src/constants/limits.ts` 归 T-03（`ownership.json:120/127`）。**属"裁决措辞与实物不符"，不是谁偷改** —— 但按本轮铁律，E3 无权自行把它写成例外。
- **待拍板**：要么 (a) 追加登记为第三条例外（口径改为"除 `nickname` 外，`dailyGoal` 与 `daily_goal` 共用同一对 `DAILY_GOAL_MIN/MAX`"），要么 (b) 回 T-11 微轮把别名键改回字面量 100 并连带处理被打红的用例。E3 建议 (a)，理由如上。

### DEFECT-2 `profile.get` 的 `nMiddlewares: 2 → 3`（已登记例外的机械副作用）
- A-28-1 原文把 `nMiddlewares` 与 `input/output shape`、探针指纹并列为"禁止变化"项；A-34-1③/A-35-1④ 登记 `output` 那一轴时**没有把 `nMiddlewares` 一并写进例外措辞**。
- 但这一轴在本条**不可能不变**：tRPC 11.18.0 的 `.output(schema)` 实现就是 `this.use(outputValidatorMiddleware(schema))`。实证（`$TEMP/e3-mw-proof.ts`，用真 `appRouter` + 对照实验）：
  ```
  profile.get: nMiddlewares=3 -> #0{...} #1{name:outputValidatorMiddleware,_type:output} #2{name:resolveMiddleware}
  profile.update: nMiddlewares=3 -> #0{...} #1{name:inputValidatorMiddleware,_type:input} #2{name:resolveMiddleware}
  auth.me: nMiddlewares=2 -> #0{...} #1{name:resolveMiddleware}
  对照: protectedProcedure 中间件数 = 1 | +.output() 后 = 2
  ```
  第 3 个中间件名就叫 `outputValidatorMiddleware`，且基线里所有 procedure 的 `nMiddlewares` 都已把 `inputValidatorMiddleware` 计入（有 `.input()` 的都是 3），口径一致。
- **待拍板**：把口径补一句"`output: null→闭合 Schema` 登记例外**含**其带来的 `nMiddlewares +1`（`outputValidatorMiddleware`）"。否则 A-34-1③ 的授权在字面上无法被执行一次而不违规。

### DEFECT-3 `auth.login` 入参被收紧：`password` 加 `min(8)/max(72)` + `phone` 错误文案换成码串
- 实物：`packages/server/src/trpc/routers/auth.ts:95` `.input(LoginInputSchema)`，其中 `packages/shared/src/contracts/auth.ts:24` `LoginInputSchema = { phone: PhoneSchema, password: PasswordSchema.optional(), code: z.string().optional() }`，`PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX_BYTES)`（`:21`），`PhoneSchema = z.string().regex(PHONE_PATTERN,'INVALID_PHONE')`（`:16`）。基线记的是拆分前旧 router 的内联 schema（`password` 无任何 check、`phone` 文案是人话）。
- **风险（这条最硬）**：`password` 的 `ok true→false` 翻转意味着**任何历史短密码账号（<8 位）走 tRPC 登录时，在 zod 层就被拒，永远进不到 `auth-service.login()` 比对 bcrypt** —— 新库里的账号是本期新Register的、按 R-39② 本就要 ≥8，所以本地看不出问题；但**现网存量账号**（旧 APK 时代建的短密码）在 tRPC 面上会被锁死。R-39② 的 ≥8 管的是**注册**（`RegisterInputSchema`/`ChangePasswordInputSchema` 复用同一 schema 是对的），把它挂到**登录**上是另一回事。
  - 缓解事实：**REST 门面不受影响** —— `packages/server/src/routes/auth.ts:75` 是 `svc(ctx).login({phone:String(body.phone…),password:body.password,code:body.code})` 直传，不套 `LoginInputSchema`，故旧 APK 走 REST 的登录面未被改（R-17⑧"旧 APK 保留可用"未被打破）。所以这是一条**只咬 tRPC 面的兼容性风险**，不是全门面事故。
  - 本地 `data.db` 里那些短密码账号是 smoke-test 造数，**未作为判据**。
- 另一半（`phone` 文案 `"手机号格式不正确"` → `"INVALID_PHONE"`）：`contracts/auth.ts` 文件头第 3 条自己写着"**本文件不放文案**、人话由 `constants/errors.ts` 单点提供"，但 `PhoneSchema` 把**码串塞进了 zod message**，与自述矛盾；且它同时改动了 `auth.login`/`auth.sendCode` 两条既有 procedure 的探针指纹。**要么**确认 errorFormatter/门面确实把它映射回 §4.6 人话（那基线里留码串仍是 A-28-1 的禁止项，须登记），**要么**这是文案面的一次泄漏（P0 红线：用户可见文案须人话）。本轮**未追这条的下游渲染**（超出 E3 名下面），列为待查。
- 归因：`routers/auth.ts` 归 T-07（`ownership.json` per_file）；`shared/src/contracts/auth.ts` 归 T-03（`ownership.json:120`，且 A-28-4④ 明文"批次3 期间其它任务一律不得改 `packages/shared/**`"）。**请 TPM 核对这份 `contracts/auth.ts` 是谁在本期写进 `login` 的**。

### DEFECT-4 `auth.sendCode` 入参 `phone` 错误文案 `请输入正确的手机号` → `INVALID_PHONE`
- 与 DEFECT-3 的后半同因（共用 `PhoneSchema`），探针 `phoneBad11`/`phoneBadPrefix` 的 `issues[0].message` 同步变化；判定（`ok`）未变。
- 归因同 DEFECT-3。

> 四条 DEFECT 的**共同教训（建议写进技术设计/批次4 简报）**：`trpc-shape` 基线的探针集里，**"错误 message 串"和"checks 数值"都在快照面上**，所以"把 tRPC 门面从内联 schema 换成 shared 契约 schema"这类**看起来很纯的重构**必然打穿 A-28-1。批次4 凡做"门面改引用 shared 契约"，必须**先**申报基线例外，而不是出口时一起塞给 E3。

---

## 5. 必须写死的一句话（防 QA 误引，F-7）

**"baseline 只增不改"根本不是出参证明。** 基线里大量 procedure 记的是 `output: null` + `probe:'(no-parser)'` —— 实测本轮基线：22/22 条共有 procedure 的 `output` 全为 `null`，`(no-parser)` 探针出现 **29 处**（22 条出参 + 7 条无 input parser 的入参侧），首处出参证据在 `packages/server/test/trpc-shape.baseline.json:663`，`profile.get` 段起于 `:7060`。也就是说**出参那一轴在旧基线里覆盖面为 0**，"没漂"只等于"没装 parser 的壳子没漂"。
出参等值性的真证据另有：
- `packages/server/test/integration/profile-dto.spec.ts:184 / :188-196` 的 `safeParse` **双侧**用例（REST 体与 tRPC 返回各过一遍同一 DTO schema）；
- T-11 本轮新建的 `packages/server/test/integration/profile-output-parser.spec.ts`（19 条，含 A-35-1② 要求的"键集合钉"4 支）。
Phase 5/6 的简报与 QA 结论引用出参一致性时，**只能引这两份**，不得写"因为基线只增不改，所以出参没变"。

---

## 6. 步骤 2（再生一次 + 再生前后 diff 摘要）：**本轮未执行**

- 原因：§3/§4 的硬前置未过（3 处未登记"改" + 1 处待追认）。按简报"表里没有登记例外之外的每一处'改'，都停下来不再生"。
- 未跑 `TRPC_SHAPE_UPDATE=1` 任何一次 ⇒ 那唯一一次再生额度**仍完整保留**给 DEFECT-1/3/4 处置后的下一个出口轮。
- 基线文件 sha256 前后一致（复核行见 §8）。
- 附：§2/§3 已把"再生后会是什么样"**逐轴**取证在本报告里（`$TEMP` 的 `current-snapshot.json` / `audit-out.txt` 本轮结束按简报要求删除，**本报告 §2/§3/§4 是唯一持久记录**）。若 TPM 追认 DEFECT-1 为例外 + 追认 D2/D3 的处置，则再生后的 diff 应当恰好等于：`+7 path`、`profile.get` 三轴（output / outputProbes / nMiddlewares）、`profile.update` 三键、`auth.login` 两键、`auth.sendCode` 一键 —— 除此之外不得多出一行。**这是给下一轮的对照表，请 QA 按此复核。**
- 复核方法（下一轮照抄即可，无需读生产代码）：`cp` 基线到 `$TEMP/baseline.before.json` → 用 §1 的临时脚本产出 `current-snapshot.json` → 跑 §1 的 `audit.cjs`，只看"共有 procedure 中有差异的"那一行是否只剩已登记例外。

---

## 7. 批次3 最终数字（真实粘贴，2026-09-20 04:14~04:25）

### 7.1 测试面

| 命令 | 结果 | 时间戳 |
|---|---|---|
| `pnpm --filter @tm/server test` | **Test Files 1 failed / 14 passed (15)；Tests 1 failed / 352 passed (353)** —— 唯一红 = `test/trpc-shape.spec.ts`（A-28-1 已知红，按计划**不再生**）。`Exit status 1` | 04:14:32 起，20.51s |
| `pnpm --filter @tm/web test` | **1 file / 16 passed (16)**，exit 0。（stderr 有 A-30-9 已登记的 `act()` 警告 1 条，属 T-22 名下，未处理） | 04:16:39 |
| `pnpm --filter @tm/shared test` | **1 file / 50 passed (50)**，exit 0 | 04:16:44 |
| `pnpm --filter @tm/agent test` | **`No test files found, exiting with code 1`** → exit 1（A-34-4 预期：0 用例，登记给批次4 的 T-08）。**未加 `passWithNoTests`、未从 workspace 删除该 project** | 04:16:46 |

> **04:19:43 二次复跑（本轮结束时点）取到同一批数字**：`@tm/server` = **1 failed / 352 passed (353)**，`SERVER_EXIT=1`；`@tm/web` = **16 passed (16)**，`WEB_EXIT=0`。两次间隔 5 分钟、期间并行 agent 在写 `tools/**`，服务端/前端测试面数字无变化 ⇒ §7.1 的数字可直接当批次3 出口终值。

trpc-shape 失败原文（截断自真输出）：
```
 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login,
                    auth.logout, auth.register, auth.sendCode, profile.get, profile.update,
                    review.queue, review.undo
```
（该用例的"受影响 procedure"清单把 7 条新 path 也算进去了 —— 它用整段 JSON 比对，新 path 令其后所有行位移。**E3 的轴级审计比它细**：新 path 属允许项，真正变化的共有 procedure 只有 4 条，见 §3。）

### 7.2 类型面（真实退出码复跑）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @tm/server typecheck` | `tsc -p tsconfig.json --noEmit` → **0 错**，exit 0 |
| `pnpm --filter @tm/web typecheck` | `tsc --noEmit` → **0 错**，exit 0（A-34-1/A-35-1③ 的那条 `unknown` 已消失） |
| `pnpm --filter @tm/ui typecheck` | `tsc -p tsconfig.json --noEmit` → **0 错**，exit 0 |

### 7.3 门禁面（`tools/boundaries.mjs`，**并行 E1c 在途**）

```
### node tools/boundaries.mjs --all
2026-09-20 04:17:15 开始（并行 E1c 在改 tools/boundaries.mjs 与 tools/ownership.json）
...
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
RED  web-home-transport         2 处命中：apps/web/src/components/home/result-section.tsx:12 | apps/web/src/lib/api/lookup-stream.ts:4

18/21 条通过，3 条红
EXIT_ALL=1

### node tools/boundaries.mjs --self-test
2026-09-20 04:17:15
...
boundaries --self-test：135/135 通过
EXIT_SELFTEST=0
```

`--self-test` = **135/135 全绿**（A-35 盘面记的是 128/128、E1a 收工记的是 108/108 —— 增量全部来自**并行 E1c 在途新增用例**，非回归；本轮结束时数字若再变同理，见 §7.4）。

### 7.4 `--all` 的 3 条红：逐条归因（**全部非 E3 名下，一条没修、一条没放宽、没加例外**）

| 红项 | 命中 | 实读原文 | 归因 | 是否本轮引入 |
|---|---|---|---|---|
| `colors-no-hardcode` | `apps/app/src/styles/app.css:5` | 该行是**注释**：`* 扫 apps/**，hex / rgb() / hsl() 命中即红），只做两件事：` | 注释里字面写了 `rgb()`/`hsl()` 被扫到。文件归 **T-05**（apps/app 壳）。口径同 A-27"**改被扫内容、不改扫描器、不加例外**" ⇒ 应由 T-05 重写那两行注释 | 否：E1 报告 `:13` 与 E1a `:333` 已逐字登记同一处、同行号 |
| 同上 | `packages/ui/src/patterns/GrowthLine.tsx:8` | 注释：`* 不引 recharts、零新依赖、零 #RRGGBB/rgba()（§8.2-1 与 §3.5 ui-no-io）。` | 注释自述里写了 `#RRGGBB`/`rgba()`。文件归 **T-13/T-04**（`packages/ui` patterns） | 否：同上 |
| `css-important-budget` | `packages/ui/src/styles/tokens.css:89` | `.decor-breath, .animate-breath { animation-name: none !important; }` | **真 `!important`**（reduced-motion 复位）。E1a 归 **T-04** 名下：要么走 A-27 把它移出预算口径的争议、要么按登记流程进例外；E3 无权处置 | 否 |
| 同上 | `packages/ui/test/patterns.spec.tsx:691,695` | `it('包内不引图片资源、不写 !important，长串一律 truncate/line-clamp', …)` 等 | **测试文件名描述串被扫**（用例文本里的 `!important`）。归 **T-05/T-13** 名下 + 门禁扫描口径（`test/**` 是否该计入预算 = T-02/E1c 的 `--all` 口径问题，A-32-5 同型："只数运行时读点"）。E3 未动 `tools/boundaries.mjs` | 否 |
| `web-home-transport` | `apps/web/src/components/home/result-section.tsx:12`、`apps/web/src/lib/api/lookup-stream.ts:4` | 两处均为注释：`* 传输仍只有 @/lib/trpc（判据⑤：首页无裸 fetch(）`、`* 为什么单独一个文件：首页不写 fetch(（判据⑤ …）` | 注释里字面写了 `fetch(`。该断言由 **E1** 落盘（A-30-4 的 `--web` 欠账），命中文件归 **T-12**。E1a `:282` 已登记同一结论："改被扫内容、不改扫描器，且不为其加例外……我不消解、不顺手修" | 否：E1a `:277` 逐字同一处 |

**结论：3 条红与 E1/E1a 收工时完全同一批、同一行号**（18/21 → 18/21），E3 未新增/未消解任何红。这 5 处命中的处置权在 T-05 / T-04 / T-12（改被扫文本）与 E1c（`--all` 扫描口径是否豁免注释与 `test/**`），**不在 E3 名下，本轮一律未动。**

---

## 8. 基线未被改动之复核

```
$ sha256sum packages/server/test/trpc-shape.baseline.json  <本轮 04:12 的只读副本>
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7 *packages/server/test/trpc-shape.baseline.json
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7 *…/e3-work/baseline.before.json
```
两条 sha 逐字相同 ⇒ **基线自本轮开始（04:12）以来一字节未改**；`TRPC_SHAPE_UPDATE=1` 全程未执行（一次性再生额度完整保留）。
其它铁律复核：`packages/shared/**` §4.6 三面（`TM_ERROR_CODES`/`TM_ERROR_ROWS`/`TM_ERRORS`）零改动（E3 未写任何 `packages/**` 文件）；`ts-fsrs` 版本与序列化格式未动；未在 `data.db` / `packages/server/data.db` 上跑任何写操作或迁移（快照脚本只 `import` router 建壳、不建 ctx、不触库）；无任何 git 写操作。

本地 `data.db` 里的数字（若有用例间接触达）**一律未进本报告结论** —— 那是 smoke-test 造数。

---

## 9. 批次3 出口结论

### 9.1 可以开批次4 吗？—— **可以开批次4 的"代码工作面"；批次3 的出口手续差一步，不能算已闭合。**

**判定为"代码面已可收口"的依据（本轮实测）**：
- `@tm/server typecheck` / `@tm/web typecheck` / `@tm/ui typecheck` = **三面 0 错**（A-34-1 那条 `unknown` 阻断已消失）。
- `@tm/web test` 16/16 绿、`@tm/shared test` 50/50 绿、`@tm/agent` 0 用例 exit 1（A-34-4 预期红，已登记批次4 T-08，未掩盖）。
- `@tm/server test` 353 用例里**只有 1 红，且红的是契约基线本身**（不是任何功能缺陷）；A-30-1/A-33-5/A-33-6 那几处的收口用例、A-35-1② 的"键集合钉"4 支全绿。
- `boundaries --self-test` 135/135 全绿（门禁自己在咬人）；`--all` 的 3 条红全部是 E1/E1a 已登记的**注释文本类 carry-over 假红**，不在 E3 名下，也**不阻断批次4 开工**（它们阻断的是"发布门禁变绿"，见 §7.4）。

**判定为"出口手续未闭合"的唯一一条**：`trpc-shape.baseline.json` **仍未再生**，因为"只增不改"审计未过（§3/§4）。批次3 的收口定义（A-28-1 + A-35-14）里"基线一次性再生"这一步**尚未发生**，那唯一一次额度还在。

### 9.2 还差什么（按依赖顺序）

1. **TPM 出一版新裁决（建议记作 A-36）**，逐条处置 §4 的 4 项：追认 DEFECT-1 为第三登记例外（或回 T-11 微轮改回 `max(100)`）、把 DEFECT-2 的 `nMiddlewares +1` 写进 A-34-1③ 的例外措辞、给 DEFECT-3/4 定性（回环修 或 登记例外）。
2. **由 A-36 指定的那一轮**处置完成后，跑**唯一一次** `TRPC_SHAPE_UPDATE=1 pnpm --filter @tm/server test -- trpc-shape`，并按 §6 末段的"应当恰好等于"清单核对 diff（多出一行即停）。
3. 复跑 `@tm/server test` 至 0 红（预期 **353/353**），批次3 才算出口。

**给排期的关键约束（重要）**：第 2 步之前**不要**让批次4 的任何任务改动既有 procedure 的 `input/output` 形状、`nMiddlewares` 或探针可见的文案 —— 否则新基线会被再推翻一次，而额度只有**一次**（A-28-1）。批次4 的前端面（T-15/T-16/T-17/T-18/T-19 的页面重写）与 `packages/ui`、`apps/app`、`tools/**` 均不触这条线，**可与 E3' 并行开工**；`routers/**`、`services/**`、`shared/src/contracts/**` 的改动请排在 E3' 之后。

### 9.3 待拍板项清单（交 TPM，E3 一律未自行处置）

| # | 事项 | E3 的建议 | 若照建议做的代价 |
|---|---|---|---|
| P-1 | `profile.update.dailyGoal` 的 `max 100→200`（DEFECT-1） | **追认为第三条例外**，措辞改"除 `nickname` 外，两键共用同一对 `DAILY_GOAL_MIN/MAX`" | 不追认则须回 T-11 把别名键改回字面量 100，并连带打红 `profile-output-parser.spec.ts:364/:381`、`profile-dto.spec.ts:287`，还会重造 REST/tRPC 两把真相 |
| P-2 | `profile.get.nMiddlewares 2→3`（DEFECT-2） | 在 A-34-1③ 的例外里补"含 `.output()` 机械带来的 `outputValidatorMiddleware`（+1）" | 零代码代价；不补则 A-34-1③ 的授权字面上无法被合规执行 |
| P-3 | `auth.login.password` 挂上 `min(8)/max(72)`（DEFECT-3） | **回环修**：登录面只保留 `optional`，策略挂在注册/改密（`RegisterInputSchema`/`ChangePasswordInputSchema` 已各自引用同一 `PasswordSchema`，摘掉不影响它们）。R-39② 的 ≥8 管的是**建密码**，不是**验密码** | 需 T-07 一轮 + 1 条"短密码存量账号仍可经 tRPC 登录"的用例；不改则现网短密码账号在 tRPC 面被锁死（REST 面不受影响，见 §4 DEFECT-3 缓解事实） |
| P-4 | `PhoneSchema` 的 zod message 写死为码串 `INVALID_PHONE`，波及 `auth.login`/`auth.sendCode` 两条既有 procedure 的探针指纹（DEFECT-3/4） | 先由 T-03/T-07 查清**渲染路径**：若客户端最终看到的就是 `INVALID_PHONE` ⇒ 违反 §4.6 人话红线，改回人话（或经 errorFormatter 映射后仍留人话）；若确认对外文案不受影响，则作为第四条例外登记（措辞须写"仅 message 串变化、判定域不变"） | 本轮未追下游渲染（超 E3 面），**留给 TPM 派 T-03 微轮**；注意 `contracts/auth.ts` 文件头自己写着"本文件不放文案"，与实现相矛盾 |
| P-5 | `--all` 3 条红（5 处命中）是否把"注释 / `test/**` 文本不计入"写进门禁口径 | 归 **E1c**（他正在改 `boundaries.mjs`），且必须**带疫苗**、**不许**放宽成不咬人（A-32-5 同型、A-19/A-28-2 教训）；否则按 A-27 由 T-04/T-05/T-12 改被扫文本 | 与 E3 无关，本轮一字未动 |
| P-6 | A-34-2 的"批次1~3 产物尚未入库"前提**依旧成立**（本轮未做任何 git 写） | 一切"CI 能跑测试/能出 APK"的结论继续显式附该前提；入库窗口 Phase 7→8 由 TPM 亲自做 | 无 |
| P-7 | A-35-12 的 keystore 私钥入远端仓库（用户处置项）、A-34-4 的 `@tm/agent` 0 用例 | 均**原样保留**，未掩盖、未顺手修 | 无 |

### 9.4 一句话给 QA

批次3 的 `trpc-shape` 红**不是**"E3 忘了再生"，是"再生前置未过"；而**基线绿灯也绝不等于出参正确**（见 §5，F-7）。出参一致性只认 `profile-dto.spec.ts:184/188-196` 与 `profile-output-parser.spec.ts` 那 19 条。

