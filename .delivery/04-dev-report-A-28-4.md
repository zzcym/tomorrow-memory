# 开发报告 · A-28-4 专项小轮（共享层开发 / 复习域 5 码收编）

任务书：`.delivery/04-adjudications.md` **A-28 第 4 行**（裁决："不认可域内码表先例，走 `TM_ERRORS_SUPPLEMENT` 扩展位"）
背景：`.delivery/04-dev-report-T-10.md` §7 **D-1**（192 行）与 §9 第 4 条（217 行）
施工窗口：2026-09-19 21:07 ~ 21:25（本机时钟）

---

## 1. 完成清单

| # | 裁决要求 | 状态 | 落点 | 备注 |
|---|---|---|---|---|
| 1 | `§4.6` 冻结面一字不动：`TM_ERROR_CODES`(18) / `TM_ERROR_ROWS`(16) / `TM_ERRORS` 都不许改 | **done** | `packages/shared/src/constants/errors.ts` | 逐声明哈希自证见 §4.1；`-U0` diff 显示该文件**被删/被改的既有行数 = 0**（4 个 hunk 全是 `@@ -x,0 +y,n @@` 纯插入） |
| 2 | 5 码追加进 `TM_ERRORS_SUPPLEMENT`，每条带 `http` + `from: 'R-02③④⑥ / T-10 D-1'` | **done** | `errors.ts:215-222` | `INVALID_RATING`400 / `INVALID_MODE`400 / `INVALID_WORD`400 / `NOTHING_TO_UNDO`409 / `UNDO_LIMIT_REACHED`429；原 `FORBIDDEN` 条目逐字未动（§4.1 有哈希） |
| 3 | `copy` 用**同一模板字面量**从 `RATING_VALUES / RATING_LABELS / MODE_VALUES / MODE_LABELS / WORD_MAX_LENGTH / UNDO_MAX_PER_SESSION` 组装 | **done** | `errors.ts:180-202` | 新增 `RATING_DOMAIN_HINT`、`MODE_DOMAIN_HINT` 两个组装点（`MODE_DOMAIN_HINT` 是原 `REVIEW_ERROR_COPY.INVALID_MODE` 内联式提取出的同名等价物；`INVALID_WORD`/`UNDO_LIMIT_REACHED` 就地组装）。渲染值逐字不变，见 §4.2 |
| 4 | 补一个 supplement 的取值助手，**不改既有函数签名** | **done** | `errors.ts:237-244` | 新增 `supplementErrorStatus(code: TmErrorSupplementCode): number`。`errorHttpStatus(code: TmErrorCode)` 与 `errorMessage()` 的签名一字未动（`errorMessage` 本来就吃 `TmErrorCode \| TmErrorSupplementCode`） |
| 5 | `review-service.ts` 删掉本地 `REVIEW_ERROR_COPY`，改 import `errorMessage()` + 新 http 助手；对外行为与码值一字不变 | **done** | `packages/server/src/services/review-service.ts` | 行数 279 → 259（`split('\n')` 口径，即 §4.3 那份打印；`wc -l` 口径是 278 → 258）。`ReviewError` 只换构造体两行（`super(errorMessage(code))` / `this.http = supplementErrorStatus(code)`）；`reviewErrorBody` / `reviewErrorTrpcCode` / `normalize{Word,Rating,Mode}` / `rateCard` / `undoRating` / `ledgerFor` / `noteRated` / `outcome` **各自后 14 行与改前逐字一致**（§4.3 自证） |
| 6 | `REVIEW_ERROR_CODES` 保留为 shared 的 re-export 别名 | **done** | 声明点：`errors.ts:194-200`；别名：`review-service.ts:38` | Grep 结果：外部引用点**只有** `test/integration/review-parity.spec.ts:40`（`routes/review.ts`、`trpc/routers/review.ts` 都不引它，只引 `ReviewError`/`reviewErrorBody`/`reviewErrorTrpcCode`）→ 保留别名后**引用点零改动** |
| 7 | `RATING_DOMAIN_HINT` 归属：原导出点仍有等价物，或 import-only 改引用点 | **done（走"等价物"路线）** | `review-service.ts:18,38` re-export shared 的 `RATING_DOMAIN_HINT` | 因此**没有改任何引用点的 import 行**（§3） |
| 8 | shared 追加 supplement 断言（只追加，不删改既有断言） | **done** | `packages/shared/test/contracts.spec.ts` 末尾 `describe('A-28-4：TM_ERRORS_SUPPLEMENT 的复习域 5 码')` 7 条 `it` | 全文件被删/被改的既有行**只有 1 行 import**（§4.4）；既有 43 条用例一条未动，43 → 50 全绿 |

**未做（刻意不做）**：`TRPC_SHAPE_UPDATE=1` 未跑；`--self-test` / `--check-ownership` 未跑未修；`tools/exceptions.json`、`tools/ownership.json`、`routes/**`、`trpc/**`、`apps/**`、T-09/T-11/T-12 的在途文件一律未触。禁止任何 git 写操作 —— 本轮 `git` 只用了 `status` / `diff --no-index`（只读）。

---

## 2. 自检与冒烟（真实粘贴）

### 2.1 `pnpm --filter @tm/shared typecheck` —— **绿**

```
$ tsc -p tsconfig.json --noEmit
```

（无输出即通过。`packages/shared/tsconfig.json` 的 `include: ["src","test"]` ⇒ 追加的 7 条断言也在 typecheck 面内。）

### 2.2 `pnpm --filter @tm/server typecheck` —— **红 5 条，全部不是我的**（基线对照见下）

改后（21:21:08）：

```
$ tsc -p tsconfig.json --noEmit
src/routes/auth.ts(33,12): error TS2589: Type instantiation is excessively deep and possibly infinite.
src/routes/auth.ts(42,66): error TS2339: Property 'header' does not exist on type '{ raw: Request; }'.
src/services/profile-service.ts(233,34): error TS5076: '??' and '||' operations cannot be mixed without parentheses.
src/trpc/init.ts(77,7): error TS2353: Object literal may only specify known properties, and 'data' does not exist in type '{ message?: string | undefined; code: "TOO_MANY_REQUESTS" | ... }'.
src/trpc/routers/auth.ts(69,7): error TS2353: Object literal may only specify known properties, and 'data' does not exist in type '...'.
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
```

**基线对照（受控复现，非目测）**：把 `errors.ts` + `review-service.ts` 两份文件临时还原成改前副本（`/tmp/a284/before/`，还原后已用 `git diff --no-index --stat` 证明写回无误），跑同一条命令：

```
$ pnpm --filter @tm/server typecheck        # 改前基线
src/app.ts(163,13): error TS2353: ... 'data' does not exist in type ...
src/routes/auth.ts(33,12): error TS2589: Type instantiation is excessively deep and possibly infinite.
src/routes/auth.ts(42,66): error TS2339: Property 'header' does not exist on type '{ raw: Request; }'.
src/trpc/init.ts(77,7): error TS2353: ... 'data' does not exist in type ...
src/trpc/routers/auth.ts(69,7): error TS2353: ... 'data' does not exist in type ...
```

⇒ 改前改后**同一条命令、同一批文件、同一批错误**（`app.ts(163)` 与 `profile-service.ts(233)` 的进出是 T-07/T-11 在我施工窗口内继续写盘造成的，两次抓取相差约 90 秒）。**我的三个文件一条错误都没有**，且没有任何一条错误落在 `review-service.ts` / `shared/constants/errors.ts`。归属：`src/{app,routes/auth,trpc/init,trpc/routers/auth}.ts` = T-07 在途；`src/services/profile-service.ts` = T-11 在途。按并行安全口径**只记录不动手**。

### 2.3 `pnpm --filter @tm/server test`（全量）

21:19:53 那次抓到 **A-28-1 已知红**（基线漂移，正是"唯一允许的红"）：

```
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 92ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 106ms
 ✓  @tm/server  test/review-no-llm.spec.ts (16 tests) 100ms
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 320ms
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 16ms
   ✓ T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 快照非空（防止空清单把门禁跑成永真） 2ms
   × T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面） 13ms
     → appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, review.queue, review.undo

 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 91 passed (92)
```

21:21:38 复跑时同一个文件的红**换了形态**：`trpc-shape.spec.ts` 连收集都进不去，原因是 T-11 刚写盘的 `profile-service.ts:233` 语法错（`TS5076` 的 esbuild 版）：

```
E:/CC/tomorrow-memory/packages/server/src/services/profile-service.ts:233:93: ERROR: Cannot use "||" with "??" without parentheses
  Plugin: vite:esbuild
  File: E:\CC\tomorrow-memory\packages\server\src\services\profile-service.ts:233:93
  232|    await db.profiles.update(userId, { nickname, avatar, daily_goal }, opts.now ?? Date.now());
  233|    return { ok: true, daily_goal: daily_goal ?? (await db.profiles.ensure(userId)).daily_goal || DAILY_GOAL_DEFAULT };
     |                                                                                               ^
 Test Files  1 failed | 4 passed (5)
      Tests  90 passed (90)
```

⇒ **两次红都不是我的**，且都在"不许修"清单里（A-28-1 基线漂移 / 并行在途 T-11 的 `services/profile-service.ts`）。
**与我相关的判据面全绿**：`test/integration/review-parity.spec.ts` **24 tests 全通过**，其中判据④ 的 7 个非法值（`[0,5,-1,2.5,'x',null,undefined]`）逐个 400 + `code='INVALID_RATING'` + 卡片 `fsrs_data` 一字不变；`:238` 的 `res.body.error` 仍 `toBe(RATING_DOMAIN_HINT)`、`:241` 的 `new ReviewError('INVALID_WORD').message` 仍与 REST 响应体相等 —— 这两条正是"码表搬家后同源关系没断"的直接证明。`test/review-no-llm.spec.ts` 16 条也全绿。

### 2.4 `pnpm --filter @tm/shared test`（我追加了断言，额外补跑）

```
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 104ms

 Test Files  1 passed (1)
      Tests  50 passed (50)
```

（改前是 43 条，改后 50 条 = 43 + 我追加的 7 条，既有 43 条一条未删未放宽。）

### 2.5 `node tools/boundaries.mjs --copy` —— **绿**

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 75 处）；需人工复核词命中 123 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
```

**禁词没有被咬**：新文案 = 原渲染值，未引入任何新词，因此不需要绕词、没有冲突待裁决（`REVIEW_TERMS` 的"人工复核 123 处"不判红）。附带自证：`errors.ts` 里的 `.join(' ')` 是**数组** join（前一个字符是 `.`），不触发 `contracts.spec.ts` 的"零绕扫描"正则 `[^\w.$]join\(\s*['"]`；追加断言 ⑥ 另钉了"产出面唯一一份"：`NOTHING_TO_UNDO` 的整串 + 4 条模板串的静态前缀（`评分必须为` / `复习模式必须为` / `请输入要复习的词` / `一轮最多撤销`）在 `packages/shared/src/**` 里都只命中 `errors.ts` 一个文件。

### 2.6 `pnpm depcruise` —— **绿**

```
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (346 modules, 859 dependencies cruised)
```

（`shared-pure` / `review-no-agent` 都没被咬：`errors.ts` 只新增了对同包 `./limits.js` / `./rating.js` 的 import，二者都不 import `errors.js` ⇒ 无环；`review-service.ts` 的 import 面反而**变小**了。取证探针在盘上的那一次跑批是 `348 modules, 858 dependencies`，删掉探针后是 `346 modules, 859 dependencies` —— 模块数 -2 就是两份探针，依赖数的 +3 来自并行 agent 同窗口写盘；两次都是 **0 违规**。）

### 2.7 `npx eslint` 三个改动文件 —— **绿**

```
$ npx eslint packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts packages/server/src/services/review-service.ts
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "prefer-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
```

（那 3 行是 npm 读仓库 `.npmrc` 里 pnpm 专用配置的告警，与 lint 无关；**eslint 诊断行为 0 条**。）

### 2.8 出口前最后一次全量复跑（终轮，约 21:28）—— 结论未变，但并行面更热闹了

同一批命令再跑一遍，`@tm/server` 的测试文件数已从 5 涨到 7（T-07/T-11 的新 spec 落盘）：

```
##### shared typecheck
$ tsc -p tsconfig.json --noEmit                       （绿，无输出）

##### server test
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 406ms     ← 本轮回归面，全绿
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed)
   → appRouter 形状漂移：首个差异在第 3162 行                                  ← A-28-1 已知红（回到"形状漂移"形态：T-11 那条语法错已被其自行修掉）
 FAIL  test/integration/auth-register.spec.ts  × 7 条                            ← T-07 在途
 FAIL  test/integration/profile-dto.spec.ts    × 1 条（头像 >300KB 三入口同码）  ← T-11 在途
 Test Files  3 failed | 4 passed (7)
      Tests  9 failed | 120 passed (129)

##### server typecheck（终轮 8 条，全部在 T-07/T-11 面上）
src/app.ts(163,13) TS2353 / src/routes/auth.ts(33,12) TS2589 / src/routes/auth.ts(42,66) TS2339
src/trpc/init.ts(77,7) TS2353 / src/trpc/routers/auth.ts(69,7) TS2353
src/trpc/routers/profile.ts(35,7)+(42,7) TS2353 / test/integration/auth-register.spec.ts(60,46) TS2769

##### boundaries --copy
OK   copy-legacy-zero           0 命中（… 例外豁免 75 处）；需人工复核词命中 124 处（不判红）
1/1 条通过，全绿                                       ← 123 → 124 是并行面新增的 `REVIEW_TERMS`（`本地/已发送/FSRS/stability`）字样；该计数不判红，本轮未逐条定位到是哪个文件涨的

##### depcruise
✔ no dependency violations found (350 modules, 905 dependencies cruised)   ← 0 违规（模块数随并行写盘增长）
```

⇒ 终轮**没有任何一条红落在** `packages/shared/src/constants/errors.ts`、`packages/server/src/services/review-service.ts`、`packages/shared/test/contracts.spec.ts`、`test/integration/review-parity.spec.ts` 上；三条静态门禁（shared typecheck / `--copy` / `depcruise`）与 `@tm/shared` 全量测试在改前改后同样本一样绿。

---

## 3. 引用点：零改动（A-13 口径自证）

裁决给的路线有两条：保别名 or import-only 改引用点。**选了前者，所以引用点一行没动。**

| 文件 | 引的东西 | 本轮改动 |
|---|---|---|
| `packages/server/src/routes/review.ts` | `ReviewError` / `reviewErrorBody` / `normalizeMode` / `rateCard` / `undoRating` | **无**（mtime 20:26:20，早于我 21:12 的第一次写盘） |
| `packages/server/src/trpc/routers/review.ts` | `ReviewError` / `reviewErrorTrpcCode` | **无**（mtime 20:26:59） |
| `packages/server/test/integration/review-parity.spec.ts` | `RATING_DOMAIN_HINT` / `REVIEW_ERROR_CODES` / `ReviewError` | **无**（mtime 20:54:41） |

`git diff -U0` 自证（这三个文件根本不在我的 diff 里，用 mtime + 上面 2.3 的 24 条测试通过共同佐证）：本轮**唯一**被改的 import 行在 `packages/shared/test/contracts.spec.ts`（共享测试文件本身，见 §4.4），引用点 import 行数 = **0**。

---

## 4. 逐字不变证据（全部 `node -e` 实测打印，非目测）

取证手法：改前用一份临时探针（`import` 真 `review-service.ts`，打印 `RATING_DOMAIN_HINT` + 5 个码的 `{http, message, body, trpc}` JSON）落到 `/tmp/a284-before.json`；改代码；同一份探针再跑一次落 `/tmp/a284-after.json`。**探针文件已在取证后删除，未留在仓库**（复核：`ls a284* *.mts` → `No such file or directory`；`git status --short | grep -iE "a284|probe"` → 空输出）。

### 4.1 `§4.6` 冻结三集合逐声明哈希（改前 vs 改后）

```
TM_ERROR_CODES   改前 sha256=4a98cb476c344419 改后 sha256=4a98cb476c344419 字符数 825/825 一致=true
TM_ERROR_ROWS    改前 sha256=d31f24ea1387d5d3 改后 sha256=d31f24ea1387d5d3 字符数 497/497 一致=true
TM_ERRORS        改前 sha256=7dc1483fba11cdc6 改后 sha256=7dc1483fba11cdc6 字符数 2192/2192 一致=true
TmErrorSpec      改前 sha256=555c31391f85dd39 改后 sha256=555c31391f85dd39 字符数 473/473 一致=true
§4.6 冻结三集合+接口 逐字未动 = true
FORBIDDEN 条目逐字未动 = true |   FORBIDDEN: { http: 403, copy: '这份记录不属于当前账号', from: '§4.5 R-05② / R-41①（文案待 PM 定稿）' },
```

另一路独立自证：`errors.ts` 的 `git diff --no-index -U0` 里以 `-` 开头的行**输出为空**（0 行被删/被改），4 个 hunk 头全是 `@@ -x,0 +y,n @@` 纯插入。快照测试侧：`contracts.spec.ts:342-348`（16 行 / 18 码 / 行内码与表键一一对应）仍绿，我另加了一条"5 码不得出现在 `TM_ERROR_CODES`/`TM_ERROR_ROWS`/`TM_ERRORS` 里"的反向隔离断言（追加件 ①）。

### 4.2 五个串的实际渲染值对比表（`node -e` 原始输出）

```
| 键 | 改前实际渲染值（review-service 本地表） | 改后实际渲染值（shared supplement） | 一致 | 改前hash | 改后hash |
| RATING_DOMAIN_HINT | 评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松） | 评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松） | ✅逐字相同 | dedac96ad4 | dedac96ad4 | 30 字 |
| INVALID_RATING | 评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松） | 评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松） | ✅逐字相同 | dedac96ad4 | dedac96ad4 | 30 字 |
| INVALID_MODE | 复习模式必须为 review / new / selfTest（今日复习 / 学新词 / 随机自测） | 复习模式必须为 review / new / selfTest（今日复习 / 学新词 / 随机自测） | ✅逐字相同 | 877f6f0933 | 877f6f0933 | 50 字 |
| INVALID_WORD | 请输入要复习的词（最长 64 个字符） | 请输入要复习的词（最长 64 个字符） | ✅逐字相同 | ab16a143ef | ab16a143ef | 19 字 |
| NOTHING_TO_UNDO | 这张已经撤过了，没有可撤销的评分 | 这张已经撤过了，没有可撤销的评分 | ✅逐字相同 | 4b1756b496 | 4b1756b496 | 16 字 |
| UNDO_LIMIT_REACHED | 一轮最多撤销 3 次，先继续背吧 | 一轮最多撤销 3 次，先继续背吧 | ✅逐字相同 | d63aa629e6 | d63aa629e6 | 16 字 |

http 映射：INVALID_RATING=400(改前=400) INVALID_MODE=400(改前=400) INVALID_WORD=400(改前=400) NOTHING_TO_UNDO=409(改前=409) UNDO_LIMIT_REACHED=429(改前=429)
tRPC 码：INVALID_RATING=BAD_REQUEST(改前=BAD_REQUEST) INVALID_MODE=BAD_REQUEST(改前=BAD_REQUEST) INVALID_WORD=BAD_REQUEST(改前=BAD_REQUEST) NOTHING_TO_UNDO=CONFLICT(改前=CONFLICT) UNDO_LIMIT_REACHED=TOO_MANY_REQUESTS(改前=TOO_MANY_REQUESTS)
响应体全文一致：true
```

最强的一条：`diff /tmp/a284-before.json /tmp/a284-after.json` **无任何输出**（两份探针 JSON 全文相等，含 `reviewErrorBody()` 的完整 `{status, body:{error, code}}`）⇒ 旧 APK 从 `error` 键读到的东西、`code` 键的值、REST status、tRPC `TRPCError.code` 四者同时逐字不变。

### 4.3 `review-service.ts` 对外行为面

```
export function reviewErrorBody          改前L73 改后L53 后 14 行逐字一致=true
export function reviewErrorTrpcCode      改前L81 改后L61 后 14 行逐字一致=true
export function normalizeWord            改前L89 改后L69 后 14 行逐字一致=true
export function normalizeRating          改前L96 改后L76 后 14 行逐字一致=true
export function normalizeMode            改前L103 改后L83 后 14 行逐字一致=true
export async function rateCard           改前L141 改后L121 后 14 行逐字一致=true
export async function undoRating         改前L257 改后L237 后 14 行逐字一致=true
function ledgerFor                       改前L222 改后L202 后 14 行逐字一致=true
function noteRated                       改前L232 改后L212 后 14 行逐字一致=true
function outcome                         改前L177 改后L157 后 14 行逐字一致=true
对外行为面（除 import/码表/ReviewError 构造之外）一字未动 = true
行数：改前=279 改后=259
```

### 4.4 `contracts.spec.ts` 的改动面（import-only + 纯追加）

```
=== 全部被删/被改的行（- 开头） ===
-import { MODE_LABELS, RATING_LABELS, ratingLabel } from '../src/constants/rating.js';
=== hunk 头 ===
@@ -99 +99,6 @@      （上面那行 import 换成 6 行：新增 MODE_VALUES）
@@ -101,0 +107,3 @@  （errors.js import 追加 MODE_DOMAIN_HINT / RATING_DOMAIN_HINT / REVIEW_ERROR_CODES）
@@ -104,0 +113 @@   （追加 TM_ERRORS_SUPPLEMENT）
@@ -106,0 +116 @@   （追加 errorHttpStatus）
@@ -108,0 +119 @@   （追加 supplementErrorStatus）
@@ -839,0 +851,123 @@ （文件末尾纯追加 123 行：A-28-4 describe 块）
=== 新增行数合计 === 136
```

⇒ 既有 43 条断言**一行未删一行未改**；唯一被"改"的一行是 import 行（A-13 口径允许）。

### 4.5 shared 侧改前/改后 diff（本轮唯一"搬家"内容，供复核）

`errors.ts` 新增 5 段（全为插入）：`import { UNDO_MAX_PER_SESSION, WORD_MAX_LENGTH, RATING_VALUES } from './limits.js'` + `import { MODE_LABELS, MODE_VALUES, RATING_LABELS } from './rating.js'`（13-17 行）、`RATING_DOMAIN_HINT` / `MODE_DOMAIN_HINT`（180-188）、`REVIEW_ERROR_CODES` + `type ReviewErrorCode`（190-202）、`TM_ERRORS_SUPPLEMENT` 的 5 条目（217-221）、`supplementErrorStatus()`（237-244）。

---

## 5. 越界申请 / 契约偏差

- **越界申请：无。** 三个可写文件外，本轮零改动（引用点连 import 行都没动）。
- **契约偏差：无新增。** 本轮是把 D-1 消掉，不是造新偏差。§4.6 的响应体约定（`{error, code}`）与 `TmErrorResponseBodySchema` 未动；追加断言 ⑦ 顺手把"supplement 码也吃得下这个形状"钉住了。
- 原 **D-1 现已闭环**（`review-service.ts` 不再有域内码表），T-10 报告 §7 D-1 / §9-4 可据此销账。
- **D-3 / D-4 未动**（A-28-5 明令本批次不改），仍按裁决保留 REST 容忍 `'3'`、tRPC 拒的不对称现状。

## 6. 记进报告的其它红（按指令：只记录，不动手）

| # | 内容 | 归属 |
|---|---|---|
| 1 | `test/trpc-shape.spec.ts` 基线漂移（首个差异第 3162 行 `auth.activate`；受影响含 `review.queue`/`review.undo`）| **A-28-1**，批次3 出口轮统一再生。本轮**未跑** `TRPC_SHAPE_UPDATE=1`、未改基线 |
| 2 | `test/trpc-shape.spec.ts` 在 21:21 复跑时改为"收集期 esbuild 语法错"，源头 `packages/server/src/services/profile-service.ts:233` 的 `?? / \|\|` 混用 | T-11 在途（并行安全面：`services/profile-*`）。批次3 出口轮跑 `--self-test` 之前，出口轮需先确认该语法错已被 T-11 自己收掉，否则 trpc-shape 的红会以"收集失败"形态掩盖 A-28-1 的"形状漂移"形态 |
| 3 | `pnpm --filter @tm/server typecheck` 的 5 条（`app.ts` / `routes/auth.ts`×2 / `trpc/init.ts` / `trpc/routers/auth.ts` / `services/profile-service.ts`） | T-07 / T-11 在途；§2.2 已用受控还原证明改前同一批红就在盘上。终轮（§2.8）涨到 8 条，多出 `trpc/routers/profile.ts`×2 与 `test/integration/auth-register.spec.ts`，仍全在 T-07/T-11 面上 |
| 3b | 终轮新增的两处断言红：`test/integration/auth-register.spec.ts` 7 条（K-1 配额 / 三表快照 / 激活认领 / D-4 未勾协议）与 `test/integration/profile-dto.spec.ts` 1 条（头像 >300KB 三入口同码） | T-07 / T-11 在途（并行安全面：`test/integration/{auth-*,profile-dto}` + `services/{auth,profile,avatar}*`）。本轮**未跑** `TRPC_SHAPE_UPDATE=1`、未改基线、未动这两个 agent 的任何文件 |
| 4 | `node tools/boundaries.mjs --self-test` 的 2 条探针用例（拿真 `routes/review.ts` 当探针 + `review-no-agent` 疫苗用例）| **A-28-2**，归 T-02。本轮未跑；本轮也没改 `routes/review.ts` 与 `tools/exceptions.json`，所以探针状态与 T-10 上报时一致 |
| 5 | `--check-ownership` 对 `tools/exceptions.json` 的误判 | **A-28-3**，归 T-02。本轮未跑该模式（冒烟清单里没有）。**给 TPM 的一条提示**：`tools/ownership.json` 里 `packages/shared/src/constants/**` 的 owner 是 **T-03**、`packages/server/src/services/review-service.ts` 的 owner 是 **T-10**，而 A-28-4 授权本轮（一个非 T-03/T-10 的任务号）改这两处 —— 出口轮若跑 `--check-ownership`，本轮的三个文件**必然被机检判越界**，这是授权与机检的口径缺口（与 A-28-3 同族），需要 TPM 决定：给 `ownership.json` 增 A-28-4 的一次性授权，或在出口轮豁免本轮 diff |
| 6 | A-27 的 2 条 CSS 扫描器假阳（注释色值 / a11y 注释）| 不在 `--copy` 模式内，本轮 `--copy` 全绿；仍归各自 owner |

## 7. 已知限制与 TODO（诚实列出）

1. **`RATING_DOMAIN_HINT` 在 `review-service.ts` 里是 re-export 别名，不是声明点**（声明点已进 shared）。这是"保引用点零改动"的代价：将来 T-10 名下清理时可以把 `test/integration/review-parity.spec.ts:40` 的 import 直接换成 `@tm/shared`，然后删掉 `review-service.ts:18,38` 两行。本轮**没有**替 T-10 做这一步（幅度控制）。
2. `MODE_DOMAIN_HINT` 是我给原 `INVALID_MODE` 内联式起的名字（shared 里需要一个具名表达式来同时服务 `copy` 与"组装而非写死"的断言）。若 TPM 认为 supplement 不该多一个导出名，可以内联回 `copy` 里，但那样追加断言 ⑤ 的"改常量→文案跟着变"就只能靠渲染值比对，会弱一档。
3. `supplementErrorStatus()` 只覆盖 supplement 表；`tmErrorBody()`（构造统一响应体）**仍只吃 `TmErrorCode`**，本轮没扩 —— 因为 `reviewErrorBody()` 已经承担了复习域的响应体构造，扩 `tmErrorBody` 会牵动 §4.6 快照面的函数形状，超出裁决授权。
4. `apps/app`、`apps/web`、`packages/ui` 的 typecheck/build **本轮未跑**（不在冒烟清单内，且在 T-12 等 agent 的在途面上）。风险评估：`errorMessage` / `errorHttpStatus` 的签名未变，`TmErrorSupplementCode` 只是键集合从 1 变 6（联合类型放宽），全库 Grep 确认没有任何 `Record<TmErrorSupplementCode, …>` 或对该联合的穷尽 `switch`，故放宽不会打断任何消费点（`apps/app/src/data/rest-fetcher.ts:245`、`apps/app/src/data/queries/profile.ts:13,58,59` 三处引用点均只吃 `TmErrorCode`）。
5. 探针取证手法是"临时脚本 + 改后复跑 diff"，脚本已删除、未留在仓库；若测试需要长期复跑这条"逐字不变"比对，`contracts.spec.ts` 追加件 ④ 已经把同一事实以断言形式常驻（更强）。

## 8. 给测试的提示

- **重点 1**：`review-parity.spec.ts` 判据④（7 个非法值）与判据⑥（409/429）是本轮的回归面，已实测 24 tests 全绿；R-02③④⑥ 若加新码，必须进 `TM_ERRORS_SUPPLEMENT` 而不是域内 —— `contracts.spec.ts` 追加件 ① 会把"往 §4.6 三集合里塞码"直接判红。
- **重点 2**：本轮**没有任何一条 UI 渲染面**变化（supplement 的 5 个码不进前端文案表），但 `packages/shared/src/constants/errors.ts` 现在 import 了 `limits.ts` + `rating.ts` —— 若谁把 `rating.ts` 或 `limits.ts` 改成 import `errors.ts`，就是循环依赖，depcruise 当前无环（2.6 绿），改后会红。
- **重点 3**：旧 APK 契约的实测口径在 §4.2 的 diff 上（before/after JSON 全文相等）。真机侧（T-20/T-22）不需要重测复习域错误文案，本轮证明的是"服务端串一字未变"，不是"APK 渲染未变"。
- **重点 4**：批次3 出口轮再生 `trpc-shape` 基线前，请先确保 `profile-service.ts:233` 的语法错已由 T-11 收掉，否则那条 spec 会以收集失败而非形状漂移失败，掩盖 §10.2 判据① 要看的"只增不改" diff。
