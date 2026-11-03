# 开发报告 · T-10 第三轮（A-33-6 / A-33-7：只补不完工）

任务：复习域**双门面错误码同源**（A-33-6 / N-2）+ **CL-3 events 接线**（A-33-7）。
角色：服务端开发（T-10）。批次：批次3 出口轮在途。
本文档所有输出均为**真实粘贴**（同一次终端会话的实际 stdout/stderr），未美化、未编造。
本轮**零 git 写操作**、**未在仓库根 `data.db` / `packages/server/data.db` 上跑任何写或迁移**
（两支用例都只吃 `os.tmpdir()/tm-t10-{parity,nollm}-<pid>/`，`afterAll` 自删）。

---

## 完成清单

| 裁决号 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| **A-33-6（N-2）** | done | `packages/server/src/trpc/routers/review.ts`、`packages/server/test/integration/review-parity.spec.ts` | `cause: err` → `cause: { tmCode: err.code, httpStatus: err.http }`；新增 4 条双门面等值断言（+24→28） |
| **A-33-7（CL-3）** | done | `packages/server/src/routes/review.ts`、`packages/server/src/app.ts`（**1 行**，`bounded-edit:A-33-7`）、`packages/server/src/services/review-service.ts`（形参注释同步）、`packages/server/test/review-no-llm.spec.ts` | 签名 `(db, _agentDeps, _llmRouter)` → `(db, deps:{events})`，REST 门面评分现在落事件 |
| 上轮已落地的 `review-no-agent` 例外删除 | 未回退 | — | 本轮 `--check-ownership` 六文件里 `routes/review.ts`/`trpc/routers/review.ts` 均判"在册·无越界" |

⚠ **A-33-7 的文件名勘误**：裁决写的是 `routers/review.ts`，但 `createReviewRouter` 实物在
**`packages/server/src/routes/review.ts`**（`app.ts:30` 就是从这里 import 的）；`trpc/routers/review.ts`
导出的是 `review` 这个 router 对象、没有工厂函数，且它的事件早从 `ctx.events` 拿到了。
A-28-6 原文写的正是 `routes/review.ts`，所以按实物落地。详见 §四。

---

## 一、基线（改动前盘面，本轮开工第一步实跑）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-parity
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 198ms
 Test Files  1 passed (1)
      Tests  24 passed (24)

$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-no-llm
 ✓  @tm/server  test/review-no-llm.spec.ts (16 tests) 56ms
      Tests  16 passed (16)

$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
EXIT=0

$ node tools/boundaries.mjs --password
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
3/3 条通过，全绿
```

---

## 二、必修 1：A-33-6（N-2）—— tRPC 侧错误码根本没提上来

### 2.1 改动（`trpc/routers/review.ts`，唯一的行为改动就是 `cause` 那一行）

```diff
-    throw new TRPCError({ code: reviewErrorTrpcCode(err), message: err.message, cause: err });
+    throw new TRPCError({
+      code: reviewErrorTrpcCode(err),
+      message: err.message,
+      cause: { tmCode: err.code, httpStatus: err.http },
+    });
```

零中文字面量（A-23-7）、零新建码表（A-28-4）：`err.code` 与 `err.http` 都是 service 从
`@tm/shared` 的 `REVIEW_ERROR_CODES` / `supplementErrorStatus()` 拿的值，本文件只是**换了键名搬运**。

### 2.2 新增判据：`review-parity.spec.ts` 末尾的 `A-33-6（N-2）双门面错误码等值` 四支

等值口径：REST 的 `{status, body.code, body.error}` ↔ tRPC **线上**错误体的
`{status, data.code, data.message}`。
`createCallerFactory` 直调会把 `TRPCError.data` 剥掉（T-11 在 `profile-dto.spec.ts:113-127`、
T-07 在 `auth-register.spec.ts` 都已踩过这个坑），所以本文件自己拼了线上门面
`trpcServer({ endpoint:'/trpc', router: review })` + 手搭 ctx，**不依赖 T-07 的 `app.ts`**。

### 2.3 实跑结果（28/28 绿）—— 简报预告的"等 T-07/A-33-5 的红"**没有出现**，原因如下，如实报告

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-parity
 ✓  @tm/server  test/integration/review-parity.spec.ts (28 tests) 219ms
 Test Files  1 passed (1)
      Tests  28 passed (28)
```

线上错误体的真实取证（四支各贴一条，`data.code` 就是那个补充码）：

```
[T-10 A-33-6] NOTHING_TO_UNDO REST={"status":409,"body":{"error":"这张已经撤过了，没有可撤销的评分","code":"NOTHING_TO_UNDO"}}
              tRPC 线上体={"error":{"message":"这张已经撤过了，没有可撤销的评分","code":-32009,
              "data":{"code":"NOTHING_TO_UNDO","httpStatus":409, ... "path":"undo"}}}
[T-10 A-33-6] INVALID_WORD   REST={"status":400,"body":{"error":"请输入要复习的词（最长 64 个字符）","code":"INVALID_WORD"}}
              tRPC 线上体={... "data":{"code":"INVALID_WORD","httpStatus":400, ... "path":"reviewCard"}}
[T-10 A-33-6] UNDO_LIMIT_REACHED REST={"status":429,"body":{"error":"一轮最多撤销 3 次，先继续背吧","code":"UNDO_LIMIT_REACHED"}}
              tRPC 线上体={... "data":{"code":"UNDO_LIMIT_REACHED","httpStatus":429, ... "path":"undo"}}
[T-10 A-33-6] INVALID_RATING REST={"status":400,"body":{"error":"评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松）","code":"INVALID_RATING"}}
              tRPC 线上体={... "data":{"code":"BAD_REQUEST","httpStatus":400, ... "path":"reviewCard"}}   ← 见 §2.5
```

**为什么没红（两条叠加，都实核过）**：
1. 简报指定的修法把 `httpStatus` 一起塞进了 `cause` ⇒ `init.ts` 的三元表达式
   `typeof cause.httpStatus === 'number' ? … : tmCode ? TM_ERRORS[tmCode].http : …`
   **短路**，根本走不到那次会 TypeError 的查表。
2. 更要紧的一条：**T-07 的 A-33-5 在本轮施工期间已经落到盘上**。我实读 `init.ts:91-95` 现在是
   ```ts
   function tmCodeHttpStatus(code: string): number | undefined {
     if (isTmErrorCode(code)) return errorHttpStatus(code);
     if (Object.hasOwn(TM_ERRORS_SUPPLEMENT, code)) return supplementErrorStatus(code as TmErrorSupplementCode);
     return undefined;
   }
   ```
   ⇒ 即便只传 `tmCode` 也不会再炸。**我没有为此动 `init.ts` 一行**（它是 T-07 名下，本轮只读）。

疫苗 B（临时把 `cause` 改成只带 `tmCode`，验证 N-1 是否还是本轮断言的前置条件）：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-parity -t "A-33-6"
      Tests  4 passed | 24 skipped (28)
```
四支全绿 ⇒ **本轮判据不依赖 N-1 是否已修**（因为修法自己把状态说全了）。
同时用 tsx 实探 `TM_ERRORS` 确认 A-33-5 的前提仍然成立（第一级表里确实没有复习码）：

```
$ tsx -e "import('@tm/shared').then((m)=>{console.log('TM_ERRORS.NOTHING_TO_UNDO =', m.TM_ERRORS.NOTHING_TO_UNDO);
          console.log('keys of TM_ERRORS include?', Object.keys(m.TM_ERRORS).includes('NOTHING_TO_UNDO'));})"
TM_ERRORS.NOTHING_TO_UNDO = undefined
keys of TM_ERRORS include? false
```
⇒ 兜底查表**必须**两级，A-33-5 的修法是对的；`init.ts:69` 那个洞对**只传 `tmCode` 的调用方**仍然是洞（简报"等 T-07"的担心是对的方向，只是被它自己抢先合掉了）。
两个疫苗跑完都已**还原**成最终形态（`cause: { tmCode, httpStatus }`），最终代码见 §五 的复跑。

### 2.4 疫苗 A：证明新断言**不是永真**（临时把 `cause` 改回 `err`，即修前形态）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-parity -t "A-33-6"
 FAIL ... > 同一张重复撤销的卡：NOTHING_TO_UNDO + 409 两侧逐字相同（修前 tRPC 侧是 CONFLICT）
 FAIL ... > 同一个非法词形（纯空格…）：INVALID_WORD + 400 逐字相同
   - Expected   [ "INVALID_WORD", 400 ]
   + Received   [ "BAD_REQUEST",  400 ]
 FAIL ... > 同一轮第 4 次撤销：UNDO_LIMIT_REACHED + 429 逐字相同（修前 tRPC 侧是 TOO_MANY_REQUESTS）
   - Expected   [ "UNDO_LIMIT_REACHED", 429 ]
   + Received   [ "TOO_MANY_REQUESTS",  429 ]
      Tests  3 failed | 1 passed | 24 skipped (28)
```
⇒ 三支等值断言在修前**必红**、修后**必绿**，不是摆设。第 4 支（非法 rating）在两种形态下都绿，因为它钉的是 A-28-5 那条**有意的**不对称。

### 2.5 契约偏差（待 TPM 认账）：A-33-6 原文"同一个非法 rating 的 `code` 也要逐字相同"**做不到，且不该做**

`trpc/routers/review.ts:18-21` 的 `ReviewCardInput.rating` 是 `@tm/shared` 的
`RatingLiteralSchema`（`z.union([literal(1..4)])`，`shared/src/contracts/rating.ts:15`）⇒
**越界 rating 在 zod 层就被拦，根本到不了 service 的 `normalizeRating`**，所以 tRPC 线上体只能是
协议码 `BAD_REQUEST`，永远不会是 `INVALID_RATING`。要把它们变相同，只能把 `ReviewCardInput` 换成
`RatingSchema`（preprocess 版）——那会**改 procedure 的 input shape**：
① 撞 A-28-1「基线只增不改」的硬线；② 撞 A-28-5「D-3 入参域不对称**保留现状**、只许写成显式契约」。
所以按 A-28-5 的优先级处理：该支断言 `httpStatus` 逐字相同（400↔400）+ 钉住两侧码各是什么 +
两侧零写入，并在注释里写明"载体不对称是显式契约"。**码逐字相同**那一半由另外三支
（`NOTHING_TO_UNDO` / `INVALID_WORD` / `UNDO_LIMIT_REACHED`，都是两侧真的到达同一个 service 的那类）承担。
"同一张重复撤销的卡"这一支是**逐字全等**，正是简报点名的那一个。

---

## 三、必修 2：A-33-7（CL-3）—— events 接线

### 3.1 `routes/review.ts`：签名与调用点

```diff
-export function createReviewRouter(
-  db: AppDB,
-  _agentDeps?: unknown,
-  _llmRouter?: unknown,
-): Hono<AuthEnv> {
+export function createReviewRouter(
+  db: AppDB,
+  deps: { events?: RateContext['events'] },
+): Hono<AuthEnv> {

-      const outcome = await rateCard(db, { userId: c.get('userId'), word: body.word, rating: body.rating, mode: normalizeMode(body.mode) });
+      const outcome = await rateCard(
+        db,
+        { userId: c.get('userId'), word: body.word, rating: body.rating, mode: normalizeMode(body.mode) },
+        { events: deps.events },
+      );
```
`deps.events` 的类型**复用 service 自己的 `RateContext['events']`**（`type` import 同文件既有模块），
不新增模块边、不 import `services/events.js`，所以 `review-no-agent` 的可达闭包一个字节都没变。
副作用收益：复习域对 agent 的**形参依赖**从此在签名上就不存在了（原来那两个"接而不用"的形参才是
`review-no-agent` 需要例外的原因）。

### 3.2 `app.ts` —— **只有一行**（`bounded-edit:A-33-7`）

`git diff -U0 packages/server/src/app.ts` 里属于本轮的那一个 hunk，逐字：

```
@@ -149 +268 @@ export function createApp(deps: AppDeps): AppRuntime {
-  app.route('/', createReviewRouter(db, agentDeps, llmRouter));
+  app.route('/', createReviewRouter(db, { events }));
```

自证幅度：
- hunk 头 `@@ -149 +268 @@` = 旧 1 行 → 新 1 行，**1 删 1 增 = 2 行实际变更**，零既有行被改写；
- 删掉的那行是 **HEAD 里的原行**（不是 T-07 本轮在途新增的行），行号 149 即其在 HEAD 的位置；
- 本文件 `git diff -U0` 中含 `createReviewRouter` 的行数 = **2**（一删一增），grep 实跑：
  ```
  $ git diff -U0 packages/server/src/app.ts | grep -c "createReviewRouter"
  2
  ```

⚠ **必须说明**：`git diff packages/server/src/app.ts` 的**整体**输出是 240 行 / 161 行 ±，因为
`app.ts` 在我开工前就已经是 T-07 名下的**未提交在途改动**（P-1a/P-1b/P-1c 五处装配、bodyLimit 分桶、
createContext 走 `verifyToken` 等）。那些**一行都不是我写的**，我没有清理、没有还原、没有 rebase。
按 A-33-7 的口径"证明只有那一行变化"用的是上面那个 hunk + `grep -c`，不是整篇 diff。

### 3.3 events 侧取证（A-28-6 要求的"出口报告里给出 events 侧的取证"）

`review-no-llm.spec.ts` 把 REST 的注入参数换成**记账式探针**，直接证明这条路真的落了事件：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-no-llm
 ✓  @tm/server  test/review-no-llm.spec.ts (17 tests) 59ms
      Tests  17 passed (17)
```
新增那一支（`CL-3（A-33-7）：REST 侧评分现在也落学情事件…`）的断言面：
`eventsSeen` 长度 == `RATING_VALUES.length`（4 条），每条
`{ user_id: uid, event_type: 'review', word_id: 'apple', metadata.rating 是 number }`，
且四条的 `metadata.rating` 集合 == `[1,2,3,4]`。
同文件原有判据①② 的 16 支**一支未删、一条断言未放宽**，仍然全绿
（`fetch` 仍是"调用即抛"、tRPC ctx 的 `agentDeps`/`llmRouter` 仍是"读属性即抛"）。

### 3.4 门禁对 `bounded-edit:A-33-7` 的判定 = **红**，本轮**保留红、未放宽**

```
$ TM_TASK=T-10 node tools/boundaries.mjs --check-ownership --files packages/server/src/app.ts,packages/server/src/routes/review.ts,packages/server/src/trpc/routers/review.ts,packages/server/src/services/review-service.ts,packages/server/test/integration/review-parity.spec.ts,packages/server/test/review-no-llm.spec.ts
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  packages/server/src/app.ts 由 T-07 独占（当前任务 T-10）— §10.4 第 7 行：批次2 T-08 只允许改 `import { appRouter }` 的 1 行；批次2 之后其他任务零 diff

--check-ownership task=T-10 触碰 6 个在册文件（清单 6 项 + patch 0 项） → 1 处越界
REAL_EXIT=1
```
按 patch 判定的同一口径（`--diff-file`）也是同样一条红：
```
$ git diff packages/server/src/app.ts > /tmp/a337-app.patch   # 240 行
$ TM_TASK=T-10 node tools/boundaries.mjs --check-ownership --diff-file /tmp/a337-app.patch
PATCH 1 个文件的 diff 参与判定
RED  packages/server/src/app.ts 由 T-07 独占（当前任务 T-10）…
--check-ownership task=T-10 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界
REAL_EXIT=1
```
**诊断（给 E1b）**：`tools/boundaries.mjs:1303-1312` 的 `judgeBoundedEdit()` 通道**已实装**
（`bounded-edit:<裁决号>` → 读 `maxDiffLinesFor.<task>`，无该字段就"拒绝判定"而不是放行），
但 `tools/ownership.json` 的 `packages/server/src/app.ts` 条目（`:528-540`）至今是
`owner: T-07` + `successorConstraint: "T-07 之后（批次3 起）非 owner 任务对本文件零 diff"`，
**没有** `actions:["bounded-edit:A-33-7"]`，也**没有** `maxDiffLinesFor: { "T-10": … }` ⇒ 走不到那条通道。
⇒ **等 E1a/E1b 合入**：需要 E1b 在该条目上登记
`"actions":["bounded-edit:A-33-7"]` + `"maxDiffLinesFor":{"T-10":2}`（2 = 一删一增，与我 §3.2 的实测一致）。
我自己没有改 `tools/**`（E1a/E1b 名下），也没有为了让它绿而把这行挪进 `routes/review.ts` 里绕开。
另外五个文件在同一次判定里都是"在册·无越界"（`--diff-file` 那份 patch 单跑：`→ 无越界`，exit 0）。

---

## 四、越界申请 / scope 说明

1. **`packages/server/src/routes/review.ts`**：本轮简报的"可写范围"里写的是
   `trpc/routers/review.ts`，但 CL-3 要改的 `createReviewRouter` 实物在 `routes/review.ts`
   （见 §一 的勘误）。我按 §10.4 归属表判定它是我的：`tools/ownership.json:553`
   `"packages/server/src/routes/review.ts": "T-10"`，且 `--check-ownership` 实跑判"无越界"（§3.4 末行）。
   现登记为**待 TPM 追认**：若认定越界，回退成本 = 单文件 `git checkout --`，不影响必修 1
   （两支的改动面完全独立，必修 1 单独交也是绿的）。
2. `trpc/init.ts` / `routers/profile.ts` / `tools/**` / `.gitignore` /
   `packages/shared/src/constants/**` / `vitest.workspace.ts` / `apps/web/**` —— **零改动**。
3. `packages/shared/**` —— 零改动（复习域没建第二份码表，文案一律 `errorMessage()` /
   `supplementErrorStatus()` / `RATING_VALUES` / `RATING_LABELS` / `TM_ERRORS_SUPPLEMENT`，A-28-4）。
4. `test/contract/trpc-shape.baseline.json` —— **未再生**、未碰（A-28-1，E3 的活）。

---

## 五、出口命令（最终形态复跑，真实粘贴）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-parity
 ✓  @tm/server  test/integration/review-parity.spec.ts (28 tests) 219ms
 Test Files  1 passed (1)
      Tests  28 passed (28)
   Duration  1.58s

$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server review-no-llm
 ✓  @tm/server  test/review-no-llm.spec.ts (17 tests) 59ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  1.38s

$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0                       ← 0 错

$ node tools/boundaries.mjs --password
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
3/3 条通过，全绿
```

CL-3 的签名与装配**同批合入**（不是半截）：`typecheck` 0 错就是这条的最硬取证 ——
`app.ts` 少传/多传一个参数都会是 TS2554。全库 `createReviewRouter` 引用面（本轮实 grep）：
`src/app.ts:30/268`、`src/routes/review.ts` 定义、`test/integration/review-parity.spec.ts:36/97`、
`test/review-no-llm.spec.ts:30/158` —— 五处全部已对齐，无残留旧调用。

---

## 六、盘面数字对账表（A-32-9）

| 指标 | 基线（本轮开工前实跑） | A-33 文档记载 | 本轮终值（实跑） | 差额与归因 |
|---|---|---|---|---|
| `review-parity` | 24 passed | — | **28 passed** | +4 = 本轮新增 A-33-6 四支 |
| `review-no-llm` | 16 passed | — | **17 passed** | +1 = 本轮新增 CL-3 events 取证 |
| `pnpm --filter @tm/server test` 全域 | 未跑基线（只跑了我这两支） | 320 passed / 1 failed | **333 passed / 1 failed (334)** | +13 来自并行任务（T-07 的 A-33-5 疫苗等）新增用例；唯一红仍是 `trpc-shape`（见下行） |
| 全域唯一红 | — | `trpc-shape` 基线 | `test/trpc-shape.spec.ts`：**受影响 procedure = auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo** | A-28-1 已知红，E3 出口再生。**清单里没有 `review.reviewCard` / `review.today`** ⇒ 本轮改动没进形状面（errorFormatter 不在 procedure 清单内，`init.ts:64` 注释亦已核对） |
| `typecheck` | 0 错 | 0 错 | **0 错** | 持平；本轮净增 5 个用例 + 1 处签名改动，全部自洽 |
| `boundaries --password` | 3/3 绿 | — | **3/3 绿** | 未碰 password 域 |
| `--check-ownership`（我触碰的 6 文件） | 未跑 | — | **1 处越界 = `app.ts`，exit 1** | `bounded-edit:A-33-7` 条目未登记（E1b），**保留红**，见 §3.4 |

---

## 七、已知限制与移交（诚实列出）

1. **`app.ts` 那一条 ownership 红不由我消**：等 E1b 在 `tools/ownership.json` 的 `app.ts` 条目登记
   `actions:["bounded-edit:A-33-7"]` + `maxDiffLinesFor:{"T-10":2}`。登记后这条红自动转绿
   （通道机检已在 `boundaries.mjs:1303` 就位，我实读过 `judgeBoundedEdit` 的实现：
   无 `maxDiffLinesFor` 字段 ⇒ "拒绝判定（宁可红也不放行未登记的幅度）"，不是空壳）。
2. **A-33-6 原文的"非法 rating 双门面 `code` 逐字相同"不可达**，理由与替代取证见 §2.5。
   这一条要 TPM 认账：是接受"三支码等值 + 一支状态等值"，还是开一个**批次4** 的
   `ReviewCardInput` → `RatingSchema` 微轮（代价：`trpc-shape` 基线的 input shape **发生变化**，
   直接撞 A-28-1 的"只增不改"硬线）。我按现状交，**没有**擅自改契约。
3. **`RateContext['events']` 是结构性类型**，与 `EventCollector` 靠"方法双变性"兼容
   （tRPC 侧 `ctx.events` 早就是这么传的，本轮只是让 REST 侧走同一条路）。
   若要把事件面收成具名类型，那是 `services/events.ts`（不在批次3 任何人的可写清单里）的活。
4. **L-3 未解**（沿上轮）：撤销计数是**进程内**轮次台账，跨进程重启会重新计数。
   `AppDB` 由 T-06 冻结且没有轮次表，本轮**未碰**。R-11④ 的"防重复回滚"半边由
   `snapshots.take()` 的"取一条删一条"保证，那半边是真绿的（`review-parity` 判据⑥ 四支）。
5. 本轮**没有**为变绿删任何断言、加任何例外、放宽任何规则；两个疫苗（改回 `cause: err` /
   只传 `tmCode`）跑完即还原，最终代码见 §2.1。
6. 给测试（T-21/T-22）的提示：错误码等值只覆盖到**服务层可达**的那三类
   （`NOTHING_TO_UNDO` / `INVALID_WORD` / `UNDO_LIMIT_REACHED`）；
   `INVALID_MODE` 与"越界 rating"两类的**入口不对称**是 A-28-5 显式契约，别当缺陷报。
   REST 落事件这件事现在只在 `review-no-llm` 里有单点取证，Phase 5 的学情统计联调
   （T-24 步 6b/7）应该从 `events` → Redis/ClickHouse 降级链那一侧继续验，那不在复习域。
