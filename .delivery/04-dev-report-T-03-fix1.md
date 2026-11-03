# 开发报告（T-03 微轮 · fix1）—— A-35-2 + A-35-7：`FORBIDDEN` 定稿中文串一次落到两处一致

角色：契约文案工程师（T-03）。轮次：批次3 出口微轮。授权来源：`.delivery/04-adjudications.md` **A-35 #2**（追认 PM 定稿①）+ **A-35 #7 / PM-3**（UI 侧同轮同步，本轮由 TPM 授权 `bounded-edit:A-35-7` 只改那一条串）。

定稿串（逐字，来自 `.delivery/01-prd-fix2.md` §0 定稿①，全文位置 PRD §5.4-1）：

> **这份内容不属于当前账号**

一句话结论：**shared 唯一真值 + 钉住它的 supplement 用例已改为定稿串，全绿；§4.6 三个冻结面逐字节未变（md5 取证）；`03-ui-spec.md` §6.4 实测根本不含这条串（既无旧串也无 FORBIDDEN 行），③ 无可改之处，未动 UI 文档一字，PM-3 的实测前提与现状不符 —— 待 TPM 拍板是"UI 侧补这一行"还是"撤 PM-3"。**

---

## 0. 改前基线（真实输出，先于任何代码改动采集）

### 0.1 `node tools/boundaries.mjs --copy`（改前）

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
```

### 0.2 `pnpm --filter @tm/shared test`（改前）

```
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 86ms

 Test Files  1 passed (1)
      Tests  50 passed (50)
```

### 0.3 旧串盘面定位（改前 grep，任务书要求的命令）

命令：`grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=.turbo "这份记录不属于当前账号" packages/ apps/ tests/ tools/`
（根目录**无 `tests/` 目录** ⇒ 任务书原命令带该参数时 grep 退出码 2，源码命中不受影响，已如实记在下面）

```
packages/server/src/services/search-history-service.ts:71: * （`这份记录不属于当前账号` / 403），与 `routes/chat.ts`、`trpc/routers/chat.ts` 同一条。
packages/shared/src/constants/errors.ts:216:  FORBIDDEN: { http: 403, copy: '这份记录不属于当前账号', from: '§4.5 R-05② / R-41①（文案待 PM 定稿）' },
packages/shared/test/contracts.spec.ts:896:      copy: '这份记录不属于当前账号',
```

另有 `packages/shared/dist/**`（`constants/errors.js`、`.d.ts` 及 `src/` 镜像共 4 处）命中 —— 构建产物，不入源码盘面，`pnpm build` 会覆盖，本轮未手改。

**逐处判定**：

| 命中 | 性质 | 处置 |
|---|---|---|
| `errors.ts:216` | 唯一真值（`TM_ERRORS_SUPPLEMENT` 表内，supplement 一处） | ① 改 |
| `contracts.spec.ts:896`（+ 同块 `:897` 的 `from`） | 钉住"**人话文案**"的 supplement 快照断言。**它不是 §4.6 快照面**：§4.6 的 18 码 / 16 行由同文件 `判据②` 那组用例（`:353`/`:361`/`:373`/`:380`/`:394`）钉，本次一字未碰，50/50 仍绿 | ② 同轮改（`toEqual` 是整对象断言，`from` 不改必红） |
| `search-history-service.ts:71` | JSDoc 注释里**引用**该串（非断言、非第二份码表、跑不红） | **不在本轮可写范围**（`packages/server/**`），登记在 §6.1 越界申请 |

任务书点名的另外两个文件**实测不含该串**（它们走取值助手，本就零字面量，无需改）：
- `packages/server/test/integration/chat-isolation.spec.ts`：`errorMessage('FORBIDDEN')` ×5、`TM_ERRORS_SUPPLEMENT.FORBIDDEN.http` ×5，0 处字面量。
- `packages/server/test/integration/profile-dto.spec.ts:449`：`expect(TM_ERRORS_SUPPLEMENT.FORBIDDEN.http).toBe(403)`，只断言 http，不引串。

全仓 `FORBIDDEN` 相关断言复核（`grep -rn FORBIDDEN packages/*/test …`）：余下命中全部是 `errorMessage('FORBIDDEN')` / `.http` / 码名字面量 `'FORBIDDEN'`，或同名无关物（`packages/ui/test/auth.spec.tsx` 与 `packages/server/test/review-no-llm.spec.ts` 里的局部变量 `FORBIDDEN` 是**禁词表**，与本码无关）。**服务端生产侧也是零字面量**：`routes/chat.ts:62` 的 `THREAD_FORBIDDEN_BODY.error = errorMessage('FORBIDDEN')`，即"三面共用一句"由同一真值自动达成，无第二处要改。

---

## 1. 改动清单（共 2 个文件、3 行，全部在可写范围内）

### ① `packages/shared/src/constants/errors.ts:216`

```diff
-  FORBIDDEN: { http: 403, copy: '这份记录不属于当前账号', from: '§4.5 R-05② / R-41①（文案待 PM 定稿）' },
+  FORBIDDEN: { http: 403, copy: '这份内容不属于当前账号', from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）' },
```

### ② `packages/shared/test/contracts.spec.ts:896-897`

```diff
       http: 403,
-      copy: '这份记录不属于当前账号',
-      from: '§4.5 R-05② / R-41①（文案待 PM 定稿）',
+      copy: '这份内容不属于当前账号',
+      from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）',
```

### 证据说明（为什么这里贴的不是 `git diff -U0`）

`git diff -U0 -- packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts` **实测输出为空**，原因不是"没改"，而是**这两条路径在仓库里根本没有 git 基线**（整目录从未 `git add`）：

```
$ git status --porcelain packages/shared | head -20
 M packages/shared/package.json
 M packages/shared/src/index.ts
 M packages/shared/src/types.ts
 M packages/shared/src/utils.ts
 M packages/shared/tsconfig.json
?? packages/shared/src/constants/
?? packages/shared/src/contracts/
?? packages/shared/src/copy.ts
?? packages/shared/src/schema/
?? packages/shared/test/

$ git ls-files packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts
（空 = 未被跟踪）
```

禁止 `git add`（铁律），故改用**逐行还原 + `git diff --no-index`** 给出行级证据：把当前文件里的新串按 §0.3 记录的原行还原成 `.before`，与当前 `.after` 做无索引 diff（临时目录在系统 `%TEMP%`，跑完 `rm -rf`，仓库内零残留）：

```
=== packages_shared_src_constants_errors.ts ===
@@ -216 +216 @@ export const TM_ERRORS_SUPPLEMENT = {
-  FORBIDDEN: { http: 403, copy: '这份记录不属于当前账号', from: '§4.5 R-05② / R-41①（文案待 PM 定稿）' },
+  FORBIDDEN: { http: 403, copy: '这份内容不属于当前账号', from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）' },
=== packages_shared_test_contracts.spec.ts ===
@@ -896,2 +896,2 @@ describe('A-28-4：TM_ERRORS_SUPPLEMENT 的复习域 5 码', () => {
-      copy: '这份记录不属于当前账号',
-      from: '§4.5 R-05② / R-41①（文案待 PM 定稿）',
+      copy: '这份内容不属于当前账号',
+      from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）',
```

⇒ 全轮改动 = **1 行 + 2 行，无第三行**。（还原脚本要求每行新串必须命中才继续，`MISS` 即抛错；实际输出 `reconstructed ok`。）

---

## 2. §4.6 三个冻结集合"逐字节不变"取证（A-8 / A-35-2 硬约束）

方法：对 `errors.ts` 取"**除被改的 216 行之外的全文**"（1-215 + 217-288）做 md5，改前 / 改后各跑一次。

```
改前：lines=288   0f9b997ba6e4190dc0cf07c3d490caaa
改后：lines=288   0f9b997ba6e4190dc0cf07c3d490caaa     ← 逐字节相同，行数未变
```

⇒ `TM_ERROR_CODES`（`:20-39`）/ `TM_ERROR_ROWS`（`:47`）/ `TM_ERRORS`（`:79`）以及 supplement 其余 6 条、三个取值助手全部零改动；`TM_ERRORS_SUPPLEMENT` **未增未删键**（键数 7 → 7，`INVALID_WORDBOOK_ENTRY` 等 E1b 落地的 6 条一字未碰）。
双保险：`@tm/shared test` 50/50 仍绿，其中 `判据②` 那组用例正是"16 行 / 18 码 + 行内码与表键一一对应 + 每条有中文文案"的快照面，冻结面若动必红。

A-28-4 红线（不得域内建第二份码表）：本轮**只在唯一真值处改词**，新增第二处码表 = 0（§0.3 的全仓 grep 与 §1 的 diff 共同证明）。

归属机检（`tools/ownership.json` 未改，仅跑只读校验）：

```
$ node tools/boundaries.mjs --check-ownership --task T-03 --files packages/shared/src/constants/errors.ts,packages/shared/test/contracts.spec.ts
TABLE E:\CC\tomorrow-memory\tools\ownership.json

--check-ownership task=T-03 触碰 2 个在册文件（清单 2 项 + patch 0 项） → 无越界
exit=0
```

---

## 3. ③ `.delivery/03-ui-spec.md` §6.4：**实测无此串，本轮一字未改**（结论与 PM-3 相反）

定位命令与结果（全部真实）：

```
$ grep -n "FORBIDDEN" .delivery/03-ui-spec.md            → 0 命中
$ grep -n "不属于"   .delivery/03-ui-spec.md             → 仅 1 处，与本文案无关：
  1644:2. 图标本身可以 20–22px，…；**不得**用 `margin` 假装（margin 不属于命…
$ grep -n "这份记录\|这份内容" .delivery/03-ui-spec.md   → 0 命中
$ grep -c "这份"    .delivery/03-ui-spec.md              → 0
$ grep -n "当前账号" .delivery/03-ui-spec.md             → 0 命中
# §6.4 区间（1438-1578，标题 = 「### 6.4 定稿文案总表（按场景；这一列就是像素级验收值）」）内
# 再筛 403 / 账号 / 越权 / 无权 / 错误 / 失败 行：只有品牌·登录·失败态等 13 行，无任何 403/跨属主行
```

⇒ **旧串在 `03-ui-spec.md` 里不存在**，"改成定稿串"这一动作没有对象。文件 mtime `Sep 19 15:43`，早于 PM 上报，故不是"UI 侧已抢先改掉"，而是**该表从未登记过 `FORBIDDEN` 这一行**（PM-3 的"仍引旧串"判断与现状不符，推测取自 PRD/裁决里的引文而非 ui-spec 实物）。

`git diff -U0 .delivery/03-ui-spec.md` 的真实输出（任务书要求贴）：

```
$ git diff -U0 .delivery/03-ui-spec.md
（无输出）
$ git status --porcelain .delivery/03-ui-spec.md
?? .delivery/03-ui-spec.md
```

空输出的两个独立原因，都如实列出：① 本轮确实**没动这个文件**；② 它是 **untracked**（`.delivery/` 整目录未入库），即便动了 `git diff` 也是空 —— 所以这条命令**不能**当"单行改动"的证据，行级证据见 §1 的方法。

**因此本轮不声称"UI 侧 §6.4 与 shared 已逐字一致"**（一致的前提是表里有这一行可比对）。真实状态是：**shared 侧定稿串已生效，UI 侧缺行**。授权的 `bounded-edit:A-35-7` **未被使用**（没有可改的那一条串，也不越权新增行 —— 新增文案行是 UI 设计师的定稿动作，且 `--copy` 门禁的例外表归 E1c）。待 TPM 拍板，见 §6.2。

---

## 4. 出口命令（真实跑、真实贴，改后）

### 4.1 `node tools/boundaries.mjs --copy` —— 必须仍绿 ✅

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
exit=0
```
（豁免 76 / 复核词 126 两个数与改前**完全相同** ⇒ 本轮没有为了变绿而动门禁。）

### 4.2 `node tools/boundaries.mjs --tokens` ✅

```
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）

2/2 条通过，全绿
exit=0
```

### 4.3 `pnpm --filter @tm/shared test` ✅

```
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 83ms
 Test Files  1 passed (1)
      Tests  50 passed (50)
```

### 4.4 `pnpm --filter @tm/shared typecheck` ✅（0 错，`tsc` 无输出即通过）

```
$ tsc -p tsconfig.json --noEmit
（无输出）
```

### 4.5 server 侧 contracts —— **任务书原文命令匹配不到文件，已按实物改正**

原文命令真实输出（照贴，不粉饰）：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server contracts
 RUN  v3.2.7 E:/CC/tomorrow-memory
No test files found, exiting with code 1
filter: contracts
projects: @tm/server
E:\CC\…[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1
```

原因：`contracts.spec.ts` 这个文件在 **`@tm/shared` project**（= 4.3 那条），`@tm/server` project 下只有 `test/contract/legacy-apk.spec.ts`（单数）。名字过滤改对后：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server contract
 ✓  @tm/server  test/contract/legacy-apk.spec.ts (33 tests) 3986ms
 Test Files  1 passed (1)
      Tests  33 passed (33)
exit=0
```

（首跑曾出现 `1 failed | 32 passed`，见 §6.3 的 flake 记录。）

再加三条**真正消费这句人话**的门面用例（REST / tRPC / WS 三面的钉子都在这里，改串后必查）：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server chat-isolation profile-dto auth-register
 ✓  @tm/server  test/integration/profile-dto.spec.ts (23 tests) 132ms
 ✓  @tm/server  test/integration/auth-register.spec.ts (24 tests) 2543ms
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests) 4832ms
 Test Files  3 passed (3)
      Tests  72 passed (72)
```

### 4.6 终轮总数（任务书要求的最后一跑）

```
$ pnpm --filter @tm/shared test
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 90ms
 Test Files  1 passed (1)
      Tests  50 passed (50)

$ pnpm --filter @tm/server test
 Test Files  1 failed | 14 passed (15)
      Tests  1 failed | 352 passed (353)
   Duration  15.89s
 FAIL  @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout,
                    auth.register, auth.sendCode, profile.get, profile.update, review.queue, review.undo
```

**这条红不是我的，也不是本轮的**：它漂的是 `appRouter` 的 procedure 形状（`auth.*` 排序/形状 + `profile.get` 的 `output` 由 `(no-parser)`→有值 = A-35-1④），错误文案**不进**该基线；A-35 盘面早已登记"唯一红 = `trpc-shape` 基线，按计划留 E3"，本轮两次全量跑数字稳定复现（353 / 1 红）。基线 `test/contract/trpc-shape.baseline.json` **未再生、未读改**（A-28-1：只有 E3 做）。

---

## 5. 盘面数字对账表（A-32-9）

| # | 指标 | 改前 | 改后 | 判定 |
|---|---|---|---|---|
| 1 | 旧串 `这份记录不属于当前账号` 源码命中（排除 dist） | 3 | **1** | 剩 1 = `search-history-service.ts:71` JSDoc，范围外，登记 §6.1 |
| 2 | 新串 `这份内容不属于当前账号` 源码命中 | 0 | **2** | `errors.ts:216`（唯一真值）+ `contracts.spec.ts:896`（钉子）= 2，符合"只应出现在 supplement 一处 + 它的钉子" |
| 3 | `文案待 PM 定稿` 全仓命中 | 2 | **0** | 已按定稿①删净 |
| 4 | `errors.ts` 行数 | 288 | 288 | 未增删键（`TM_ERRORS_SUPPLEMENT` 7 → 7） |
| 5 | `errors.ts` 除 216 行外的 md5 | `0f9b997b…caaa` | `0f9b997b…caaa` | §4.6 三个冻结面逐字节不变 ✅ |
| 6 | `--copy` | 1/1 全绿（豁免 76 / 复核 126） | 1/1 全绿（豁免 76 / 复核 126） | 门禁数字未被动 ✅ |
| 7 | `--tokens` | 未采（与本串正交） | 2/2 全绿 | ✅ |
| 8 | `@tm/shared test` | 50/50 | 50/50 | 用例数不变，无人被删 ✅ |
| 9 | `@tm/shared typecheck` | — | `tsc` 0 错 | ✅ |
| 10 | server `contract` project | — | 33/33（另见 §6.3 一次 flake） | ✅ |
| 11 | server 全量 | A-35 登记 349 / 1 红 | **353 / 1 红**（同一 `trpc-shape`） | 差 +4 用例来自并行 agent（`profile-output-parser.spec.ts` 等在两次采样间落盘）；红项与 A-35 登记的同一条 ⇒ 非本轮引入 |
| 12 | 本轮改动面 | — | 2 文件 / 3 行 | 全在可写范围内，`--check-ownership → 无越界` |
| 13 | `03-ui-spec.md` 旧串命中 | 0 | 0 | **③ 无对象可改**（见 §3） |
| 14 | `data.db`（仓库根 / `packages/server`） | 253952 B / `2026-09-18 04:05:38`；0 B | 同左，字节与 mtime 均未变 | 全程未在真库上跑写操作或迁移 ✅ |

---

## 6. 越界申请 / 待 TPM 拍板（本轮一律未自行处置）

### 6.1 `packages/server/src/services/search-history-service.ts:71` —— 注释里引用旧串（跑不红）

现状：`* （`这份记录不属于当前账号` / 403），与 `routes/chat.ts`、`trpc/routers/chat.ts` 同一条。`
它是**注释**不是第二份码表（该文件的取值走 `supplementErrorStatus('FORBIDDEN')` / `errorMessage`，实测零字面量依赖），所以不影响任何门禁与用例；但它是**全仓最后一处旧串**，留着会让下一个 grep 的人误以为定稿没落地。归 T-07/T-06 名下，**申请一次 1 行注释替换**（旧串 → 定稿串），或指定 owner 顺手带走。

### 6.2 ③ 的两种收口，请 TPM 二选一

- (a) **UI 设计师补行**：在 §6.4 的 403/跨属主场景补 `这份内容不属于当前账号` 一行（属定稿动作，我没有授权新增行，也不该由文案工程师替 UI 拍表结构）；
- (b) **撤 PM-3 / 改写 A-35 #7**：认定"`FORBIDDEN` 人话只由 shared 单点供给，UI 规范表不登记错误码文案"，则 §6.4 无行为正解，`bounded-edit:A-35-7` 授权作废（本轮已作废，未使用）。
不选不行：现状是"三面共用一句"里 **UI 面根本没有那一句**，与定稿①的"三面共用"表述差一面。

### 6.3 `test/contract/legacy-apk.spec.ts` 的一次不可复现红（并行窗口，注明不修）

首跑 `1 failed | 32 passed`（当时的 `tail -12` 把失败用例名截掉了，未捕获），随后**单跑 6 次全部 33/33 绿**（5 次循环 + 1 次正式）。唯一区别：首跑与 `pnpm --filter @tm/shared typecheck` 在同批并行发起，两个 vitest 进程同时真起服（该套用例走 ephemeral 端口 + 临时库）。疑为并发窗口下的端口/暖缓存竞态。**不是本轮改动引入**（我只改 shared 的 3 行字面量），也**不在我名下**（`test/contract/**` 归 E2/E3），按要求注明不修，交 QA 起 5 连跑判定是否需要串行化。

### 6.4 并行 agent 名下 / 明确不碰的项（按简报）

`profile.ts`、`profile/page.tsx`（T-11 在改）、`tools/boundaries.mjs`、`tools/ownership.json`（E1c 在改）、`02-tech-design.md`（架构师在改）、`copy.ts`（E1b 落地 7 项）—— **零改动**（§5 表 #12 的 3 行即本轮全部）。

### 6.5 定稿①的"三面"是否要进 `from`（小口径，二选一拍板）

`from` 现标 `§4.5 R-05② / R-41①（PRD §5.4-1 定稿）`，第三面 **R-09·R-10** 未进 `from`（现文只留两面的出处）。简报命令是"只把 `文案待 PM 定稿` 换成 `PRD §5.4-1 定稿`"，故按字面执行、未自行加出处。若 TPM 要"三面同标"，是 `errors.ts:216` 与 `contracts.spec.ts:897` 各 1 行的追加。

---

## 7. 给测试 / E1c 的提示

1. 该串的唯一真值是 `packages/shared/src/constants/errors.ts:216`；任何端要 403 人话只能 `errorMessage('FORBIDDEN')` 或读 `TM_ERRORS_SUPPLEMENT.FORBIDDEN.copy`（A-28-4）。grep 旧串当且仅当允许命中 §6.1 那一条注释，命中别处即新缺陷。
2. `contracts.spec.ts:893` 的注释「FORBIDDEN 是 A-28-4 之前唯一的一条，原文案与原 http 一字未动」在定稿后**已不成立**（copy 已改，http 未变）。按简报"只改那一串"我**没动注释**；E1c 或下一轮 shared 触碰时一并更正为宜（同类的还有 `errors.ts:205` 表头「本任务只做登记，文案标"待 PM 定稿"」，现已定稿）。
3. 门禁侧无需新增例外：`--copy` 的豁免/复核计数改前后完全一致（76 / 126）。
4. `@tm/shared` 与 `@tm/server` 的 contracts 类用例都**不硬串**（除 §0.3 那处 supplement 快照），所以定稿改动天然只红一处 —— 这也是"三面共用一句"能一次落地的结构原因。

---

## 8. 铁律遵守声明

无任何 `git add/commit/push/stash/checkout/reset/clean/restore`；未清理/还原他人改动；`test/contract/trpc-shape.baseline.json` 未再生；未在 `data.db` / `packages/server/data.db` 上跑写操作或迁移（§5 #14 取证）；临时文件建在系统 `%TEMP%` 并已 `rm -rf`；无编造输出（空输出与红项均原样贴出）；未放宽任何门禁、未删任何断言、未加例外；报告与代码不含口令明文或本机外置构建路径。
