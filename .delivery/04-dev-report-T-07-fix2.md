# T-07 第六轮（只补不完工）开发报告 —— A-33-5（N-1）errorFormatter 两级查表

任务：T-07 服务端 · 第六轮 · **只补不完工**
裁决依据：A-33 第二节 #5（N-1，必修）、A-33 第二节 #7（A-33-7 装配那一半，**归 T-10，本轮不碰 `app.ts`**）、A-30-1（errorFormatter 是 §4.6 码上线唯一通道）、A-32-9（盘面数字对账表）、A-31（报告优先级）、A-8（§4.6 快照面形状不得改）、A-28-1（`trpc-shape` 基线禁止本轮再生）
可写面（本轮实际动过的文件）：
1. `packages/server/src/trpc/init.ts`
2. `packages/server/test/integration/auth-register.spec.ts`
3. 本报告

---

## 0. 本轮范围（一句话）

**必修 1 项**：`init.ts` 的 `errorFormatter` 对 `TM_ERRORS_SUPPLEMENT` 里的补充码是瞎的（`TM_ERRORS[code].http` → `undefined.http` → 在 errorFormatter **内部**抛 TypeError ⇒ 本该 403 的门变 500）。修法 = 在 `init.ts` 内两级查表，只 import 现成助手。
**可选 1 项**：A-33-7 的另一半（`app.ts` 装配那一行）—— 本轮**不做**：并行 T-10 已被授权 `bounded-edit:A-33-7` 由它自己改 `app.ts`，双改必撞车；`app.ts` 在我本轮禁触面内。

## 0.1 判据清单（每完成一条立刻追加真实输出）

| # | 判据 | 状态 |
|---|---|---|
| C-1 | `init.ts` 只做**两级查表**：`isTmErrorCode(code) ? errorHttpStatus(code) : 补充表内 ? supplementErrorStatus(code) : undefined`；**不新增 shared 导出、不动 `packages/shared/src/constants/errors.ts`** | ✅ §2-1（第二级前的成员判定见 §2-1 末段说明，已如实标为唯一偏离） |
| C-2 | 两类码都查不到时 `data.httpStatus` 保持 `shape.data.httpStatus`，**不无中生有** | ✅ §2-1 / 断言在疫苗② |
| C-3 | 疫苗①：显式 `cause = { tmCode: 'FORBIDDEN' }`（不带 `httpStatus`）让 **protected 过程**抛错，走 tRPC **线上门面**断言 `data.code === 'FORBIDDEN'` + `data.httpStatus === 403` + HTTP 403 + **不抛 TypeError**（改前该用例必红） | ✅ 改前红 §1-3、改后绿 §3-1 |
| C-4 | 疫苗②：未知码（`'NOT_A_CODE'`）不崩、不 500 化，`httpStatus` 保持协议默认 | ✅（`data.code` 那一轴的语义 → §5 P-1 待拍板） |
| C-5 | 覆盖面：`TM_ERRORS_SUPPLEMENT` **全部** 码逐个断言状态 = 表内 `http`；再取 §4.6 冻结码 3 个回归断言第一级查表未被改坏 | ✅ 全 7 键逐个 |
| C-6 | 出口命令真实跑：`vitest run --root ../.. --project @tm/server auth-register` / `pnpm --filter @tm/server typecheck` / `node tools/boundaries.mjs --password` | ✅ 三条全绿，§3-1/3-2/3-3 |
| C-7 | 盘面数字对账表（简报数字 vs 实测数字，逐条归因） | ✅ §4（8 条，含 2 条简报数字与实测不符的归因） |
| C-8 | 红线自查：无 git 写操作、未在 `data.db` 上写、未跑 `TRPC_SHAPE_UPDATE=1`、未放宽任何既有断言、keystore 口令/`E:/android-build` 未出现 | ✅ 附节 |

---

## 1. 实测现状（改前取证）

### 1-1 实读 `packages/server/src/trpc/init.ts:64-79`（改前，逐字）

```ts
const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    const cause = readTmCause(error.cause);
    const tmCode = typeof cause.tmCode === 'string' ? (cause.tmCode as TmErrorCode) : undefined;
    const httpStatus =
      typeof cause.httpStatus === 'number' ? cause.httpStatus : tmCode ? TM_ERRORS[tmCode].http : undefined;
```

⇒ 简报描述**成立**：兜底只查 §4.6 冻结表 `TM_ERRORS`（`errors.ts:79`），补充码在 `TM_ERRORS_SUPPLEMENT`（`errors.ts:215`）。

### 1-2 三个现成助手的实读位置（简报给的 229/234/243/248 已漂，见 §4 对账表 R-2）

`errorMessage` `errors.ts:245` / `errorHttpStatus` `:250` / `supplementErrorStatus` `:259` / `isTmErrorCode` `:263`。
`isTmErrorCode` 的实现是 `hasOwnProperty(TM_ERROR_CODES, v)` ⇒ 补充码与未知码都落到第二级，与裁决的三元式一致。

### 1-3 疫苗先写、先跑：**改前 3 条全红**，红的原因正是裁决预言的那处 TypeError

命令：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-register`

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   @tm/server  test/integration/auth-register.spec.ts > 判据②字面：三出口 × 两协议 6 例同码同文案（R-39①/审计 C-09）· sqlite > A-33-5 疫苗①：补充码 FORBIDDEN 只经 cause.tmCode 上来 → 线上 403，errorFormatter 不抛 TypeError
AssertionError: expected 'Cannot read properties of undefined (…' to be '这份记录不属于当前账号' // Object.is equality

Expected: "这份记录不属于当前账号"
Received: "Cannot read properties of undefined (reading 'http')"

 FAIL   @tm/server  ... > A-33-5 覆盖面：补充码全表逐个上 wire 状态逐字相同 + §4.6 冻结码回归
AssertionError: data.code = FORBIDDEN: expected 'INTERNAL_SERVER_ERROR' to be 'FORBIDDEN' // Object.is equality

Expected: "FORBIDDEN"
Received: "INTERNAL_SERVER_ERROR"

 FAIL   @tm/server  ... > A-33-5 疫苗②：未知码不崩、httpStatus 保持协议默认（不无中生有）
AssertionError: expected '{"error":{"message":"Cannot read prop…' not to contain 'TypeError'

Received: "{"error":{"message":"Cannot read properties of undefined (reading 'http')","code":-32603,"data":{"code":"INTERNAL_SERVER_ERROR","httpStatus":500,"stack":"TypeError: Cannot read properties of undefined (reading 'http')\n    at Object.errorFormatter (E:\\CC\\tomorrow-memory\\packages\\server\\src\\trpc\\init.ts:69:92)\n    at getErrorShape (.../@trpc/server/src/unstable-core-do-not-import/error/getErrorShape.ts:35:17)\n    at resolveResponse (.../@trpc/server/src/unstable-core-do-not-import/http/resolveResponse.ts:431:24)\n ..."

 Test Files  1 failed (1)
      Tests  3 failed | 21 passed (24)
   Duration  5.05s
```

**取证结论（三条，逐字对上裁决）**：
1. 栈顶 `at Object.errorFormatter (…/trpc/init.ts:69:92)` —— TypeError **发生在 errorFormatter 内部**，不是 procedure 里；
2. 本该 403 的 `FORBIDDEN` 在线上变成 `code: 'INTERNAL_SERVER_ERROR'` + `httpStatus: 500` + HTTP 500 = **"403 的门变成 500"确实成立**；
3. 未知码 `'NOT_A_CODE'` **同样**触发这处 TypeError（`TM_ERRORS['NOT_A_CODE']` 也是 `undefined`）⇒ 疫苗②不是形式主义，它守的是同一个 `.http`。

补充实测一条（改前顺带发现，写进报告不掩盖）：`createCallerFactory` 直调路径**不跑** errorFormatter，所以这条红只能走 `/trpc/*` 线上门面取证 —— 与 `trpcHttp` 上方原有注释一致，本轮把该注释补全为"且 errorFormatter 根本不在 caller 路径上运行"。

## 1-A 附：本轮新增的探针门面（只存在于测试文件，不挂进 `appRouter`）

`tmCodeProbeRouter` = 用 `init.ts` 导出的**生产** `router` + `protectedProcedure` 拼的一个 mutation，
抛 `new TRPCError({ code, message, cause: { tmCode } })` —— **cause 里刻意不带 `httpStatus`**，
因为带 `httpStatus` 会在第一句短路、永远走不到兜底查表（那是 T-11 fix1 在 `routers/chat.ts:42-47`
的临时绕法，不是修法）。探针 app 由用例私有的 `probeApp()` 用 `@hono/trpc-server` 挂到一个
临时 `Hono` 实例上 ⇒ **没有动 `app.ts`、没有动 `src/trpc/routers/**`**。


## 2. 改动内容

### 2-1 `packages/server/src/trpc/init.ts`（必修项本体）

改前（§1-1 已逐字贴）：`tmCode ? TM_ERRORS[tmCode].http : undefined`。
改后（新增一个私有助手 + errorFormatter 换成调它）：

```ts
function tmCodeHttpStatus(code: string): number | undefined {
  if (isTmErrorCode(code)) return errorHttpStatus(code);
  if (Object.hasOwn(TM_ERRORS_SUPPLEMENT, code)) return supplementErrorStatus(code as TmErrorSupplementCode);
  return undefined;
}

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    const cause = readTmCause(error.cause);
    const tmCode = typeof cause.tmCode === 'string' ? cause.tmCode : undefined;
    const httpStatus = typeof cause.httpStatus === 'number' ? cause.httpStatus : tmCode ? tmCodeHttpStatus(tmCode) : undefined;
    return {
      ...shape,
      data: { ...shape.data, code: tmCode ?? shape.data.code, httpStatus: httpStatus ?? shape.data.httpStatus },
    };
  },
});
```

逐条对照裁决（A-33 第二节 #5）：
| 裁决要求 | 落地 |
|---|---|
| 两级查表 `isTmErrorCode(code) ? errorHttpStatus(code) : supplementErrorStatus(code)` | ✅ 第一级 `isTmErrorCode→errorHttpStatus`，第二级 `supplementErrorStatus`。**唯一偏离**：第二级前加了一次 `Object.hasOwn(TM_ERRORS_SUPPLEMENT, code)` 成员判定 | 
| 不新增 shared 导出、不动 `errors.ts` | ✅ `git diff` 里 `packages/shared/**` 一行未动；只 import 现成的 `isTmErrorCode`/`errorHttpStatus`/`supplementErrorStatus` + `TM_ERRORS_SUPPLEMENT`（该常量本就是 `export const`，`@tm/shared` barrel `export * from './constants/errors.js'` 已导出，不是新增导出） |
| 两类码都查不到 → 保持 `shape.data.httpStatus`，不无中生有 | ✅ 助手返回 `undefined` ⇒ `httpStatus ?? shape.data.httpStatus` 路径不变 |
| 不改 `data.code` 那一轴 | ✅ `code: tmCode ?? shape.data.code` 一字未动（A-30-1 规则） |

**为什么加 `Object.hasOwn` 而不是照字面直接 `supplementErrorStatus(code)`**：
三元式的第二级对"两张表都没有的字符串"仍会 `TM_ERRORS_SUPPLEMENT['NOT_A_CODE'].http` = **同一个 TypeError 换个表再来一次**，裁决自己的疫苗②（未知码不崩）当场不成立。
选 `Object.hasOwn` 而不是 `code in 表`：`in` 顺原型链，`'constructor'`/`'toString'` 这类键会被判"在表里"，又掉回 `undefined.http`。`isTmErrorCode` 自己的实现就是 `hasOwnProperty`（`errors.ts:263-265`），此处的第二级与它同口径，不是自创风格。

### 2-2 `packages/server/test/integration/auth-register.spec.ts`

- 新增 3 条用例（上一节 §1-3 贴的改前红即这三条），紧挨 `A-30-1` 那条：
  `A-33-5 疫苗①`（补充码 FORBIDDEN → 403 + 不 TypeError + 未登录时同过程回 401 自证它是 protected）
  `A-33-5 覆盖面`（`TM_ERRORS_SUPPLEMENT` 全 7 码逐个断言 `data.code`/`data.httpStatus`/HTTP 状态/文案，再取 §4.6 冻结码 3 个回归第一级）
  `A-33-5 疫苗②`（`'NOT_A_CODE'` + 协议码换成 `NOT_FOUND` ⇒ 不崩、`httpStatus` 保持协议自带 404）
- 新增测试私有的 `tmCodeProbeRouter` / `probeApp()`（§1-A 说明），**不挂进 `appRouter`、不改 `app.ts`**。
- 两处纯重构（不改行为）：
  `trpcCaller` 的 ctx 构造提成 `buildTrpcContext()`，`trpcHttp` 的解析提成 `trpcWire(app, …)`（`trpcHttp` 变成它的薄包装），
  目的是让探针 app 与生产 app 共用同一份 wire 解析、同一份 ctx 构造，不留"同一规则抄两份"（C-04 失效模式）。
  既有 21 条用例的断言**一字未放宽**。
- `trpcHttp` 上方注释补一条实测事实：errorFormatter **不在 `createCallerFactory` 路径上运行**，故线上形状只能打 `/trpc/*` 取证。

## 3. 出口命令真实输出

### 3-1 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-register` —— 绿

```
 ✓  @tm/server  test/integration/auth-register.spec.ts (24 tests) 2965ms
   ✓ 判据②字面：三出口 × 两协议 6 例同码同文案（R-39①/审计 C-09）· sqlite > 新建 / 激活 / 拒绝 三出口在 REST 与 tRPC 上的成功形状与错误形状逐字一致  502ms
   ✓ §8.3-D 9 / §8.3-E 2：K-1 配额（新建 ≤5、激活 ≤20、两桶互不占用、端点总闸 10/分）· sqlite > 同 IP 第 6 个新建账号被拒 → 429；打满后同 IP 仍可激活；激活桶 20/新建桶 5 各自成桶  562ms
   ✓ §8.3-D 9 / §8.3-E 2：K-1 配额（新建 ≤5、激活 ≤20、两桶互不占用、端点总闸 10/分）· sqlite > 同 IP 一分钟内第 11 次凭据请求 → 429（人话，不是 500）  451ms

 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  5.28s (transform 493ms, setup 0ms, collect 2.01s, tests 2.97s, environment 0ms, prepare 122ms)
```
（24 = 本轮前 21 + 本轮 3。pg 侧仍显式 SKIP：`DATABASE_URL_TEST` 未设、本机无 PG，与 A-18-3 同口径，CI 必须真跑。）

### 3-2 `pnpm --filter @tm/server typecheck` —— 0 错

```
$ tsc -p tsconfig.json --noEmit
```
（首次跑红过一条，是我探针的 `createContext` 返回类型不满足 `trpcServer` 的 `Record<string, unknown>` 约束 ——
`TrpcContext` 是 interface、无隐式索引签名；在测试文件内用 `{ ...ctx }` 展开修好，见 §2-2，
未改 `init.ts`/`app.ts` 的签名。修后本条 0 输出 = 绿。**`app.ts` 侧本轮没有看到因 T-10 在途而红。**）

### 3-3 `node tools/boundaries.mjs --password` —— 3/3 全绿

```
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）

3/3 条通过，全绿
```
（本条在最后一次测试文件微调之后**又原样复跑过一次**，输出逐字相同，即上面这份。）

### 3-4 附跑（我自己加的回归面，不是指定出口）：`--project @tm/server` 全量

```
 Test Files  1 failed | 13 passed (14)
      Tests  1 failed | 333 passed (334)
```
唯一红 = `test/trpc-shape.spec.ts`（A-28-1 名下、批次3 出口由 **E3** 一次性再生，本轮**未跑** `TRPC_SHAPE_UPDATE=1`、未碰基线文件）。
它的红**与本轮改动无关**，取证两条：
1. 差异是 `_def.procedures` 的**顺序与清单**（`现值: "path": "auth.activate"` vs `基线: "path": "auth.login"`，受影响含 `review.queue`/`review.undo` = T-10 在途面），errorFormatter 不在 procedure 清单里；
2. 基线文件 `grep -c "httpStatus\|errorFormatter\|FORBIDDEN" packages/server/test/trpc-shape.baseline.json` → **0**，`trpc-shape.spec.ts` 同 grep 亦 **0** ⇒ 本文件改的那段代码不在这份快照的覆盖面内。

另附跑默认门禁 `node tools/boundaries.mjs`（21 条）：`18/21 通过，3 条红` —— 3 处红全在
`apps/app/src/styles/app.css:5`、`packages/ui/src/patterns/GrowthLine.tsx:8`、`packages/ui/styles/tokens.css:89`+`packages/ui/test/patterns.spec.tsx`、
`apps/web/src/components/home/result-section.tsx:12`+`apps/web/src/lib/api/lookup-stream.ts:4`，
即 `colors-no-hardcode` / `css-important-budget` / `web-home-transport` 三条，**`packages/server/**` 0 命中**，
全部属并行任务（T-04/T-05/E2 名下）面上，本轮**注明不修**、未放宽任何规则。

## 4. 盘面数字对账表（A-32-9：简报数字 vs 实测数字，逐条归因）

| # | 简报给的数字 | 实测 | 归因 |
|---|---|---|---|
| R-1 | `init.ts` 第 64-79 行是 errorFormatter | ✅ 64-79（TypeError 抛出点在 `:69:92`，见 §1-3 栈） | 一致 |
| R-2 | 三个助手在 `errors.ts:229 / :234 / :243 / :248` 附近 | `errorMessage` `:245`、`errorHttpStatus` `:250`、`supplementErrorStatus` `:259`、`isTmErrorCode` `:263` | 整体下移 ~15-16 行：E1b/T-03 在途往 `TM_ERRORS_SUPPLEMENT` 追加了 `INVALID_WORDBOOK_ENTRY`（A-32-8 P-2，含注释 19 行）。**语义未变**，符号名与签名逐字对得上，仍按现名 import |
| R-3 | `TM_ERRORS` = 18 码冻结面（`errors.ts:79`） | ✅ 18 个键，定义起于 `:79` | 一致 |
| R-4 | "`FORBIDDEN` 与 **6 个复习域码** 住在 `TM_ERRORS_SUPPLEMENT`（`errors.ts:215` 起）" | `:215` ✅；补充表实为 **7 个键 = FORBIDDEN + 复习域 5 码 + INVALID_WORDBOOK_ENTRY** | 简报的"6 个复习域码"把复习域 5 码（`INVALID_RATING/INVALID_MODE/INVALID_WORD/NOTHING_TO_UNDO/UNDO_LIMIT_REACHED`，A-28-4）与 `INVALID_WORDBOOK_ENTRY`（A-32-8 P-2，非复习域）合并计数了。A-33 原文写的是"FORBIDDEN 与 5 个复习码"，也漏了后者。**结论不受影响**（都是补充表内的码，都得走第二级），但覆盖面按 **7 个键全表**做，不做 6/5 的取舍 |
| R-5 | 简报："这正是 R-05② / R-09 / R-10 / R-41① 三面共用的入口"（写"三面"列了四项） | 裁决原文也是"三面"列四项 | 计数措辞不一致，非事实分歧；报告按**四项**记 |
| R-6 | 出口命令：`pnpm --filter @tm/server test -- auth-register` 的 `--` 不过滤 | ✅ 未采用该条；按简报给的 `exec vitest run --root ../.. --project @tm/server auth-register` 跑（24 tests，只跑本文件） | 一致，已核实过滤生效 |
| R-7 | 全量测试数（上一份在档报告 T-11 §4-3 记的是 286/1/1） | 334 tests（333 passed + 1 trpc-shape 红） | +46 = T-09/T-10/T-11/E2 在途新增用例 + 本轮 3 条；并行期数字本就该不等，**不是回归** |
| R-8 | 本地 `data.db` | 未读写；仅 `copyFileSync` 到 `os.tmpdir()/tm-t07-register-<pid>/` 副本上跑迁移，`afterEach` 关句柄、`afterAll` `rmSync` | 该库内数字是 smoke-test 造数，**未写进任何结论** |

## 5. 待 TPM 拍板项 / 移交

| # | 事项 | 建议 |
|---|---|---|
| P-1 | **`data.code` 那一轴对"未知码"的语义**：A-30-1 的规则是"有 §4.6 码时 `data.code = 那个码`，没有时保持协议码"，但实现是 `tmCode ?? shape.data.code`，即 cause 里给了什么字符串就上什么 wire，**不校验它是不是契约码**。本轮按"逐字照 A-33-5 执行、别自由发挥"只动了 httpStatus 轴，`code` 轴一字未改，并把这个现状**钉成了断言**（疫苗② 最后一条 `expect(wire.data.code).toBe('NOT_A_CODE')`）。简报疫苗②的措辞是"未知码不崩、**保持协议码**"，与该现状可读成两种要求 | 二选一，需拍板：(a) 现状即合规（"保持协议码"读作"不崩、httpStatus 保持协议默认"）→ 本轮已完备；(b) 要求未知码把 `data.code` 退回协议码 → 是本文件的一处 2 行改动，但那超出了 A-33-5 的修法文字，我**没做**。若选 (b)，疫苗②那条断言要反过来 |
| P-2 | `routers/chat.ts:42-47` 与 `routers/profile.ts:42/49` 当年为绕开 N-1 而**显式带 `httpStatus`**（T-11 fix1 的临时解）。N-1 修好后那是冗余、不是错误，两处都仍走同一张表取值 | 建议留给下一轮 T-11/T-08 收口（可去掉 `httpStatus` 只留 `tmCode`，或保留双保险）；本轮禁触，**未动** |
| P-3 | A-33-7 的另一半（`app.ts` 少传 `deps{events}` 会红）：本轮按简报授权**未碰 `app.ts`**，归 T-10 自改。当前 server `typecheck` 0 错 ⇒ 至少此刻 T-10 的构造签名改动还没落到工作区 | 若 T-10 落完后 `app.ts` 仍红，按裁决 #7 "必须同批合入"回到 TPM；本轮无欠账 |
| P-4 | `test/trpc-shape.spec.ts` 的基线红（A-28-1：批次3 出口由 E3 一次性再生） | E3；本轮未跑 `TRPC_SHAPE_UPDATE=1` |
| P-5 | 默认 `node tools/boundaries.mjs` 的 3 条前端红（§3-4） | 并行任务名下（T-04/T-05/E2），注明不修 |

## 6. 给 Phase 5 测试工程师的复跑指引

1. 复跑必修项取证：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-register` → 期望 **24 passed**。
   三条新用例名都以 `A-33-5` 开头，位置在 `test/integration/auth-register.spec.ts` 的
   `判据②字面：三出口 × 两协议 6 例同码同文案（R-39①/审计 C-09）· <driver>` describe 内、`A-30-1` 那条之后。
   （注意：`pnpm --filter @tm/server test -- auth-register` 的 `--` 原样下传、**根本不过滤**，别用。）
2. **pg 侧必须真跑**：设 `DATABASE_URL_TEST` 后同一命令会自动多出一整套 `· pg` 用例（本轮本机无 PG，pg 分支显式 SKIP，A-18-3）。
   探针 app 与驱动无关（探针根本不读库），pg 侧只需确认那 3 条同样绿。
3. 若要手工复现 N-1 改前的红：把 `init.ts` 里 `tmCodeHttpStatus(tmCode)` 临时换回 `TM_ERRORS[tmCode].http`，
   三条红会逐字复现 §1-3 的 `at Object.errorFormatter (…/init.ts:69:92)`；**不要提交这个回退**。
4. 覆盖面用例外延（Phase 5 可加、我没有）：
   - `review-parity.spec.ts` 的双门面等值断言（N-2 / A-33 #6，T-10 名下）现在**失去了"N-1 未修前会红"这个前置**，可直接要求绿；
   - 生产路径的 403（`chat.history` 跨用户会话、`search-history` 跨属主写入）在 N-1 修好后，可去掉 T-11 fix1 那份"必须带 httpStatus"的依赖，改成只带 `tmCode` 也应回 403（P-2 的验收面）。
5. `trpc-shape` 基线红**不是** Phase 5 的缺陷，E3 再生前它会一直在；本轮未碰基线（A-28-1）。

## 附：本轮红线自查

| 红线 | 自查 |
|---|---|
| 任何 git 写操作 | **零**。只跑过 `git status --porcelain` / `git diff --stat`（只读） |
| 可写面 | 只动了 `packages/server/src/trpc/init.ts`、`packages/server/test/integration/auth-register.spec.ts`、本报告。`app.ts`/`auth-service.ts`/`routers/review.ts`/`review-service.ts`/`routers/profile.ts`/`tools/boundaries.mjs`/`tools/ownership.json`/`.gitignore`/`packages/shared/src/constants/**`/`vitest.workspace.ts`/`apps/web/**` 一行未动（§2-1 的 shared 未动有 `git diff` 佐证） |
| 绝不在 `data.db` 上写 | 全用例走 `copyFileSync` 到 `os.tmpdir()` 副本；`afterAll` 删临时目录；未跑任何迁移脚本对仓库根 / `packages/server/data.db` |
| 基线不得再生 | 未跑 `TRPC_SHAPE_UPDATE=1`，未打开 `trpc-shape.baseline.json` 写模式 |
| 不为变绿放宽 | 既有的 21 条用例断言一字未改；改前红→改后绿的差异只在 `init.ts` 的查表本身。新增断言比改前**更强**（多了全补充码表逐个 + protected 自证 + 不无中生有） |
| 并行 agent 的红 | `trpc-shape`（E3）、3 条前端 boundaries 红（T-04/T-05/E2）：**注明不修** |
| 禁词 | keystore 口令明文与 `E:/android-build` 未出现在本报告或两个改动文件里；未用分词/正则等手段规避扫描。测试里的假 hash 是 `'$2a$10$n…01234'` 占位串，与本文件既有 6 处同形状，非凭据 |
| 本地 `data.db` 数字 | 未用作任何结论（§1/§3 的数字全部来自命令真实输出） |

