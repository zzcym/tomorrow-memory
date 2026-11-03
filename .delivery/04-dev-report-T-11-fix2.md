# 开发报告（后端）· T-11 微轮 fix2 —— A-34-1：给 `profile.get` 挂 `output` parser

> 口径来源：`.delivery/04-adjudications.md` A-34 #1（即 A-34-1）逐字，辅助口径 A-30-2、A-30-3；
> 现状原文 `.delivery/02-tech-design-fix1.md:52-54`（§11 F-7）。
> 本报告边做边追加真实输出，是 Phase 5 的唯一输入（A-31）。
> **一句话结论：`profile.get` 已挂上以现成 DTO 为真相的 `output` parser（F-7 的出参侧盲区关闭），
> 但"Web typecheck 从 1 错变 0 错"这个判据在本轮的可写面内被实测证否——红仍在 `page.tsx:92`，
> 根因从"没有 parser"变成"页面读的是别名键 `dailyGoal`，而它是产品级可停发的可选键"。证据见 §3.1/§5.1。**

## 0. 开工前盘面（实测取证，未改任何文件）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @tm/web typecheck` | **1 错**（逐字见下） |
| `grep -n "\.output(\|output:\|z\.infer" packages/server/src/trpc/routers/profile.ts` | 0 命中 → F-7 成立 |
| `packages/server/test/trpc-shape.baseline.json` 的 `profile.get` 条目 | `output: null` + `outputProbes:[{probe:"(no-parser)"}]` |
| `pnpm --filter @tm/server test`（改动前，且排除本轮新建 spec） | **1 failed \| 333 passed (334)，14 files** |

```
$ pnpm --filter @tm/web typecheck
$ tsc --noEmit
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.
E:\CC\tomorrow-memory\apps\web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 typecheck: `tsc --noEmit`
Exit status 2
```

```
$ python -c "... baseline['procedures'] 里 path=='profile.get' 的条目"
{"path": "profile.get", "type": "query", "meta": null, "nMiddlewares": 2, "input": null, "output": null,
 "inputProbes": [{"probe": "(no-parser)", "ok": false, "issues": null, "data": "unparseable:undefined"}],
 "outputProbes": [{"probe": "(no-parser)", "ok": false, "issues": null, "data": "unparseable:undefined"}]}
```

### 出参真相的定位（不许新造第二份 DTO）
- 现成 DTO = `@tm/shared` 的 **`ProfileDtoSchema`**（导出名核实：`packages/shared/src/contracts/profile.ts:45`；
  类型 `ProfileDto` 在 `:58`；经 `packages/shared/src/index.ts:23` 的 `export *` 直出）。
- 实证双侧 `safeParse` 用例：`packages/server/test/integration/profile-dto.spec.ts`
  —— 任务书写的 `test/unit/` 是路径笔误，实际在 `test/integration/`；`:184`/`:188-196` 就是那两行
  `ProfileDtoSchema.safeParse(viaRest / viaTrpc)`。**该文件本轮一字未改**（避免与并行 agent 抢同一文件）。
- 关键事实（决定后面所有取舍）：`ProfileDtoSchema` 是 **`.passthrough()`** 的 8 键对象，
  而 `profile.get` 实际发 **13 键**（`getProfileDto()` 的 `ProfileDtoView`：8 契约键 + `totalWords`/`reviewDays`/`reviewDates`/`streak` + 别名 `dailyGoal`）。

## 1. 完成清单

| 任务编号 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| A-34-1① 给 `profile.get` 挂 `.output(<现成 DTO>)` | **done** | `packages/server/src/trpc/routers/profile.ts:36-56, 110-114` | 真相 = `ProfileDtoSchema`；入参一字未改、procedure 清单未变 |
| A-34-1② "真实服务端输出过 schema"用例 + "parser 真的会咬"用例 | **done** | `packages/server/test/integration/profile-output-parser.spec.ts`（新建，15 条全绿） | 三门面（REST / caller / 线上 HTTP）+ 开关 off 态 + 负对照 |
| A-34-1③ `update` / `stats` 本轮不挂 | **done（按最小扩口径扩了 get 自己的类型面）** | 同上 | `update`/`changePassword` 仍无 parser，`profile.stats` 不存在（§5.2） |
| A-34-1⑤ 禁 `as number` / 禁改 `page.tsx` | **遵守** | — | `git status` 核过：`apps/web/**` 零改动 |
| 判据"Web typecheck 0 错" | **未达成（实测证否，非未做）** | — | 见 §3.1 三段实测 + §5.1 待拍板 |

## 2. 改动明细（本轮只动 2 个文件）

### 2.1 `packages/server/src/trpc/routers/profile.ts`
新增出参 schema 并挂到 `get`：

```ts
export const ProfileGetOutputSchema = ProfileDtoSchema.extend({
  /** 唯一别名键，只读派生自 `daily_goal`（生成点 = shared 的 `profileDtoLegacyAlias()`）。 */
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  totalWords: z.number().int().nonnegative(),
  reviewDays: z.number().int().nonnegative(),
  reviewDates: z.array(z.string()),
  streak: z.number().int().nonnegative(),
});

get: protectedProcedure
  .output(ProfileGetOutputSchema)
  .query(async ({ ctx }) => getProfileDto(ctx.db, ctx.userId)),
```

- **为什么不是裸 `.output(ProfileDtoSchema)`**：那是 A-34-1① 的字面写法，我先按字面挂了一次，
  实测把 Web 门禁从 1 错推到 **5 错**（§3.2），因为 passthrough 的 5 个真实键在客户端退化成
  `unknown`/`{}`。任务书第 3 条已预留这条通道（"仍红才按同一口径最小扩，并逐条说明是哪一行错误驱动的"），
  驱动行 = `page.tsx:144/200/207/214`。
- **"不新造第二份真相"的可证形式**：8 个契约键的 parser **实例**与 `ProfileDtoSchema.shape[key]` 逐字同一个对象
  （用例 `契约键 ${key} 复用 shared 实例` 用 `toBe` 断引用相等），`_def.unknownKeys` 仍是 `passthrough`（§3.3）。
- `dailyGoal` 只能是 `optional`：见 §5.1 的实测链；声明成必填会当场打死现存绿用例（§3.4 直接取证）。

### 2.2 `packages/server/test/integration/profile-output-parser.spec.ts`（新建，15 条）
三组：① 真实输出过 schema（三门面 + 键集合/取值逐字等于装配点 + 开关 off 不误杀）；
② parser 真的会咬（缺 8 契约键任一 / 缺 4 统计键任一 / 类型错 / 越界 ⇒ 全拒，未知键仍放行）；
③ 形状只增不改（清单 = 基线清单、`get` 入参 0 个 parser、`update`/`changePassword` 仍无 parser、
A-30-2 的 input 逐字口径、`profile.stats` 不存在）+ 3 条 `expectTypeOf` 类型面钉桩。

## 3. 自检与冒烟（全部真实粘贴）

### 3.1 出口命令一：`pnpm --filter @tm/web typecheck`（本轮成败判据）

**改动后（终态）= 仍 1 错，行号/消息与改动前逐字相同：**
```
$ pnpm --filter @tm/web typecheck
$ tsc --noEmit
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.
E:\CC\tomorrow-memory\apps\web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 typecheck: `tsc --noEmit`
Exit status 2
```
判据未达成。它**不是**"parser 没挂上"：挂上后 `profile.data` 的 12 个装配键都恢复了真实类型（§3.2 反证），
只剩 `:92` 读的别名键 `dailyGoal` —— 该键在真实契约里是**可停发**的（§5.1），
且 tRPC 的出参序列化会把 passthrough 交叠里的可选键仍推成 `unknown`（实测，§5.1 第③步）。

### 3.2 中间态实测：字面挂 `.output(ProfileDtoSchema)` 的后果（1 错 → 5 错）

```
$ pnpm --filter @tm/web typecheck        # get: protectedProcedure.output(ProfileDtoSchema).query(...)
src/app/(user)/profile/page.tsx(92,20): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.
src/app/(user)/profile/page.tsx(144,32): error TS2345: Argument of type '{}' is not assignable to parameter of type 'string[]'.
  Type '{}' is missing the following properties from type 'string[]': length, pop, push, concat, and 35 more.
src/app/(user)/profile/page.tsx(200,50): error TS2322: Type '{}' is not assignable to type 'ReactNode'.
src/app/(user)/profile/page.tsx(207,50): error TS2322: Type '{}' is not assignable to type 'ReactNode'.
src/app/(user)/profile/page.tsx(214,50): error TS2322: Type '{}' is not assignable to type 'ReactNode'.
```
⇒ `:144`(`reviewDates`) / `:200`(`totalWords`) / `:207`(`reviewDays`) / `:214`(`streak`) 四行就是 §2.1 "最小扩"的逐条驱动源。
补类型后这四行恢复绿，终态回到 1 错（不多不少）。

### 3.3 出口命令三：新 spec（A-34-1② 的用例）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-output-parser
[A-34-1 真实输出] profile.get = {"user_id":1,"phone":"13900000031","nickname":"","avatar":"","daily_goal":10,
 "updated_at":1770000000000,"hasPassword":false,"pwPolicyVersion":0,"dailyGoal":10,"totalWords":0,
 "reviewDays":2,"reviewDates":["2026-01-02","2026-01-03"],"streak":0}
[A-34-1 出参面] get: hasParser=true type=ZodObject | update: hasParser=false | changePassword: hasParser=false | update._def keys=["procedure","inputs","middlewares","meta","type","resolver"]

 ✓  @tm/server  test/integration/profile-output-parser.spec.ts (15 tests) 47ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
```
（`reviewDates` 非空 = fixture 自证，parser 不是"恰好空数组通过"；
`update._def keys` 那一串是 tRPC 11.18 的实测内部面 —— 未挂 parser 时 `_def` **根本没有** `output` 键，
所以"本轮不挂"的断言用 `hasOutputParser()===false`，不是抄一个 `'ZodUnknown'` 字面量。）

### 3.4 出口命令三之二：既有 `profile-dto` 域（一条没删、一条没改，仍全绿）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-dto
 ✓  @tm/server  test/integration/profile-dto.spec.ts (23 tests) 117ms

 Test Files  1 passed (1)
      Tests  23 passed (23)
```
其中判据② 那条"开关 off ⇒ 两门面同时停发 `dailyGoal`"（`:267-283`）现在是**替我管着误杀**的守门用例。
本轮终态两个 profile 域 spec 合跑：
```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-dto profile-output-parser
 ✓  @tm/server  test/integration/profile-dto.spec.ts (23 tests) 127ms
 Test Files  2 passed (2)
      Tests  38 passed (38)
```
把出参 parser 的 `dailyGoal` 改成必填 ⇒ 这条现存绿用例**当场红**（真实输出与结论见 §5.1 第②步）。

### 3.5 出口命令二：`pnpm --filter @tm/server typecheck`

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
（无输出 = 0 错）
```

### 3.6 出口命令四：`pnpm --filter @tm/server test` 总数

| 状态 | Test Files | Tests |
|---|---|---|
| 改动前（parser 注释掉 + 排除本轮新 spec，实跑） | 1 failed \| 13 passed (14) | 1 failed \| 333 passed (334) |
| 改动后（终态，实跑） | **1 failed \| 14 passed (15)** | **1 failed \| 348 passed (349)** |

净增 = 1 文件 / 15 用例，全绿；唯一的红**不是新增**，是 §3.7 那条。

### 3.7 ⚠ 该红的就是这条：`trpc-shape` 基线（我没有再生，按 A-28-1 留给 E3）

```
$ pnpm --filter @tm/server test
 FAIL  @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout,
                    auth.register, auth.sendCode, profile.get, profile.update, review.queue, review.undo
 Test Files  1 failed | 14 passed (15)
      Tests  1 failed | 348 passed (349)
```

**归因实验（真实两跑对照，不是推测）**：把 `.output(ProfileGetOutputSchema)` 临时注释掉再跑同一条 spec：
```
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout,
                    auth.register, auth.sendCode, profile.update, review.queue, review.undo     ← profile.get 不在列
```
⇒ **`profile.get` 这一条只由本轮的 output parser 产生**；`auth.*` 属 T-07（A-33-x 在途）、
`review.queue`/`review.undo` 属 T-10、`profile.update` 属 A-30-2 已追认的入参例外 —— 四条在我改动前就红，
**不属我，我没顺手修**。（`app.ts` 的 `bounded-edit:A-33-7` 红在 `--check-ownership` 面，本轮未跑，仍属 T-10 名下。）

**留给出口 E3 按 A-34-1③ 核对的 delta（本轮唯一新增项，逐字）：**
```
profile.get:
  output:        null            → <ZodObject, unknownKeys: "passthrough", 13 键>
  outputProbes:  "(no-parser)"   → 真探针
```
即 `output: null → <Schema>` **属只增**（入参一字未改：`get` 的 `_def.inputs` 仍是 `[]`，用例已钉；
procedure 清单未变：`get/update/changePassword` 三条，用例已钉）。除此之外我没有改动任何既有 procedure 的出参形状。
**我没有跑 `TRPC_SHAPE_UPDATE=1`，`trpc-shape.baseline.json` 一字未动（新 spec 只 `readFileSync` 它做对照）。**

## 4. 盘面数字对账表（A-32-9）

| 门禁/命令 | 改动前 | 改动后 | 差值 | 归属 |
|---|---|---|---|---|
| `pnpm --filter @tm/web typecheck` | 1 错（`:92`） | 1 错（`:92`，同一行同一消息） | **0** | 残余红的根因变了，见 §5.1 |
| 同上（中间态：裸 `.output(ProfileDtoSchema)`） | — | 5 错（`:92/144/200/207/214`） | +4 | 已按 A-34-1③ 最小扩消掉，未留 |
| `pnpm --filter @tm/server typecheck` | 0 错 | 0 错 | 0 | — |
| `pnpm -r typecheck`（全仓） | 仅 `@tm/web` Failed | 仅 `@tm/web` Failed（1 错） | 0 | `shared/agent/ui/server/app` 全 Done |
| `pnpm --filter @tm/server test` | 14 files / 334 tests / 1 红 | 15 files / 349 tests / 1 红 | +1 file +15 tests | 新红 0 |
| `vitest … profile-dto`（既有域） | 23/23 | 23/23 | 0 | 未删未改一条断言 |
| `vitest … profile-output-parser`（本轮新建） | 不存在 | 15/15 | +15 | — |
| `test/trpc-shape.spec.ts` | 红（10 条 procedure） | 红（**11 条**：多 `profile.get`） | +1 且预期 | E3 再生时按 §3.7 delta 核对 |
| `pnpm exec eslint <我改的 2 个文件>` | — | 0 error | — | 中途 1 条 `consistent-type-imports` 已修 |
| `pnpm --filter @tm/web test`（顺手核 E2 的存量面，未改一行 Web） | 16/16 绿（E2 交接数） | **16/16 绿** | 0 | `test Files 1 passed / Tests 16 passed` |
| `pnpm exec prettier --check <2 个文件>` | warn | warn | 0 | 未改的 `init.ts`/`profile-service.ts`/`profile-dto.spec.ts` **同样 warn** ⇒ 全仓存量口径，非本轮引入，未跑 `--write`（避免整文件 churn 抢别人 diff） |
| 数据库面 | — | 只用 `os.tmpdir()/tm-t11-profile-output-<pid>/profile-output.db`，`afterAll` 里 `close()` + `rmSync()` | — | **没碰**仓库根 `data.db` / `packages/server/data.db`；本地库数字（`user_id:1`、`totalWords:0` 等）是造数，未写进任何结论 |

## 5. 已知限制、契约偏差与待 TPM 拍板项

**越界申请：无。** 本轮写入过的文件只有 3 个：`packages/server/src/trpc/routers/profile.ts`、
`packages/server/test/integration/profile-output-parser.spec.ts`（新建）、本报告。
`trpc-shape.baseline.json` / `trpc-shape.spec.ts` / `init.ts` / `review.ts` / `routes/review.ts` / `app.ts` /
`tools/**` / `vitest.workspace.ts` / `apps/web/**` / `packages/shared/**` / `.delivery/01-prd.md` **零改动**；
`TRPC_SHAPE_UPDATE=1` 没跑过；git 零写操作。
**契约偏差：1 条**（§5.3，出参装配面的 5 个键目前派生声明在 router 里，请 TPM 裁 (a)/(b)）。

### 5.1 【待拍板 1】`page.tsx:92` 在本轮可写面内**无法**归零 —— 三步实测链

1. `page.tsx:92` 是 `setDailyGoal(profile.data.dailyGoal)`，React 的 setter 要 `number`。
2. **把 `dailyGoal` 声明成必填 ⇒ 误杀**（这正是 A-34-1② 要防的）。**实跑对照取证**（只把出参 schema 那一行去掉
   `.optional()`，第 128 行的入参不动）：

```
 Test Files  2 failed (2)
      Tests  2 failed | 36 passed (38)
 FAIL  @tm/server  test/integration/profile-dto.spec.ts > 判据② daily_goal / dailyGoal 只有一份真值 + 兼容映射开关 > 开关 off ⇒ 两门面同时停发 dailyGoal，且键集合仍然全等（别名是唯一生成点）
 FAIL  @tm/server  test/integration/profile-output-parser.spec.ts > A-34-1② 判据一：真实服务端输出过 schema（三个门面都不误杀） > PROFILE_DTO_LEGACY_ALIAS=off ⇒ 同一个 parser 仍然放行（别名键必填就是误杀）
    Serialized Error: { issues: [ { code: 'invalid_type', expected: 'number', received: 'undefined', path: [ 'dailyGoal' ], message: 'Required' } ] … }
```
   ⇒ 必填化会**当场打死一条现存绿用例**（`profile-dto.spec.ts` 判据②），恢复 optional 后 `38 passed (38)`。
   同一次实验里 tsc 也立刻红：`getProfileDto()` 的返回类型 `ProfileDtoView` 含 `Partial<{dailyGoal:number}>`，
   必填化后 `profile.ts:115` 报 TS2322（`Type 'Promise<ProfileDtoView>' is not assignable to …`）——
   类型面与行为面两处独立证据同向。
   （另记一次实验事故以免后人重踩：先前有一版实验用整串替换，把**入参**里同名的 `dailyGoal` 那行一起顶成了必填，
   于是 `page.tsx:126/:254` 冒出两条与出参无关的 TS2345。那两行是**实验的副作用**，不是出参必填的后果，
   本轮终态入参一字未改（§3.3 的 `inputOf('update')` 用例已钉）。）
3. 声明成 `optional` ⇒ 客户端拿到 `number | undefined`，仍不满足 `SetStateAction<number>`；
   且 tRPC 的出参序列化在 passthrough 交叠下把它进一步推成 `unknown`（终态实测消息仍是 `unknown`）。

⇒ 唯一不撒谎、不动 `page.tsx`、不删断言的归零办法是**换读键**：`profile.data.daily_goal`
（`ProfileDtoSchema` 的正式契约键，本轮挂 parser 后在客户端类型里就是 `number`，新 spec 的
`expectTypeOf<ClientOut['daily_goal']>().toBeNumber()` 已钉桩）。这也正是
`packages/shared/src/contracts/profile.ts:8` 头注写的"新代码只读 `daily_goal`"。
该行归属 = 批次4 的 T-15（T-12 已把 `page.tsx` 钉给 T-15 重写，本轮我一行未动）。
**请 TPM 二选一：(a) 把这一行的读键改动正式派给 T-15，并把 Web typecheck 门禁的解除时点标为 T-15 之后；
(b) 另开一条"停发 `dailyGoal` 别名"的裁决（要同时改 service 语义 + 删/改现存绿断言，不属本轮范围）。**

### 5.2 【事实核对】`profile.stats` 不存在

任务书第 2/3 条点名的 `profile.stats` 在本仓库**没有这条过程**：`profile` 域只有
`get`/`update`/`changePassword`（`routers/profile.ts` 与 `trpc-shape.baseline.json` 两条路都核过，
新 spec 第 3 组里有 `expect(Object.keys(procedures())).not.toContain('stats')` 与
`baseline.paths 不含 'profile.stats'` 两条断言）。所以"stats 的形状没被带歪"我按**它不存在**来交付，
并把 `changePassword`（profile 域第三条、A-30-3 冻结签名的那条）纳入同一组形状断言。

### 5.3 【待拍板 2】5 个统计键的类型面落在服务端，是否算"第二份真相"

`ProfileGetOutputSchema` = `ProfileDtoSchema.extend({...5 键})`，8 个契约键**复用 shared 的 parser 实例**
（引用相等已断言），但 4 个统计键的 zod 声明目前写在 `routers/profile.ts` 里，真相来源是
`profile-service.ts` 的 `ProfileDtoView`（不是 shared）。两条可选处置：
(a) 认可"DTO + 出参装配面派生"合法（A-34-1① 的"不新造第二份 DTO"只约束那 8 个契约键）；
(b) 批次4 开一条 shared 契约轮，把 13 键出参面上收进 `@tm/shared/contracts/profile.ts`，router 只引用。
我倾向 (b)（`reviewDates` 在 `ProfileSummarySchema` 里是 `array(number)`、在 `profile.get` 里是 `string[]`，
这个分歧只有 shared 侧能裁），但那要先改 `packages/shared` —— 不在本轮可写面，我没动。

### 5.4 其余登记（都不为本轮变绿服务）

- `profile-dto.spec.ts` 里"旧 `GET /api/profile` 六键一字未动"那条用 `ProfileSummarySchema.safeParse` 兜形状，
  但用的用户 `reviewDates` 恰为空数组 ⇒ `array(number)` vs `string[]` 的分歧被空数组**恰好放过**（假绿嫌疑）。
  该文件不属本轮可写面，我只登记不处置。
- pg 驱动面：本机无实例，新 spec 与 `profile-dto.spec.ts` 一样只在 sqlite 上跑；
  `reviewDates: z.array(z.string())` 在 pg 侧的实际返回类型（`db/pg.ts:576` 是 `row.date as string` 的裸 cast）
  需 CI（T-22）真跑 pg 才算覆盖 —— 这是本轮唯一一处"出参 parser 可能因驱动差异咬人"的未知面，如实标出。
- §4.6 冻结面（`TM_ERROR_CODES`/`TM_ERROR_ROWS`/`TM_ERRORS`）与 `ts-fsrs` 未触碰。
- **git**：零写操作。`profile.ts` / `profile-dto.spec.ts` / 本报告在新加目录下都是 `??`（未跟踪，A-34#2 的盘面），
  所以 `git diff` 看不到我的改动 —— 我用 `git status --porcelain` 核过，`apps/web/**` 一条都没出现。
  收工时的盘面计数：`83 M / 14 D` 与 A-34#2 记录**逐字相同**（⇒ 我没有改到任何一个被跟踪的文件），
  `??` 从 62 变 65（其中 2 条是我：新建的 spec + 本报告；另 1 条与 `2 AM` 属并行 agent 名下，未处置）。

## 6. 给测试的提示（Phase 5 重点）

1. **重点测 `profile.get` 的出参门禁现在真的生效**：手工把 `getProfileDto()` 的任一统计键改坏
   （例如 `streak: undefined`），tRPC 侧应当以 `INTERNAL_SERVER_ERROR`/`BAD_OUTPUT` 红出来，
   而不是像 F-7 那样静默漂到客户端。
2. 线上门面（`@hono/trpc-server`）已进用例：出参 parser 是**序列化前**跑的，
   Date/BigInt 之类的非 JSON 值现在会在这条路上被拒 —— 这是挂 parser 带来的新暴露面，值得回归。
3. **没测到的路径**：pg 驱动（本机无实例，见 §5.4）；`PROFILE_DTO_LEGACY_ALIAS` 的其他取值（`'0'`/`'false'`）；
   `changePassword` 的真实改密链路（A-30-3 只断签名，函数体归 T-07 的 auth 域测）。
4. T-15 接手 `page.tsx` 时请连 §5.1 一起处置：读键换成 `daily_goal` 之后，
   `expectTypeOf<ClientOut['daily_goal']>().toBeNumber()` 这条钉桩就是它的绿灯前置。
5. E3 再生基线时：只认 §3.7 那一条 delta 为"只增"；`auth.*`/`review.*`/`profile.update` 的红要在各自名下核对，
   并且按 F-7 的"替代证据"口径，出参等值性现在**除了** `profile-dto.spec.ts:184/188-196` 之外，
   还多了 `profile-output-parser.spec.ts` 的三门面真实输出用例 —— 审计在出参侧不再是 0 覆盖。
