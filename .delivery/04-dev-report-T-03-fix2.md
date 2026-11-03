# 开发报告（T-03 微轮 · fix2）—— A-36-#9 + A-36-#14② + A-36-3 翻转：批次3 出口收尾的 4 处小改

角色：契约文案工程师（T-03）。轮次：批次3 出口第 2 微轮。授权来源（逐条对号，不扩面）：

| 改动 | 出处 | 落点 |
|---|---|---|
| ① 注释：`?version=` → 请求侧 `since`，删对不存在的 `wordbook.pull` procedure 的正面引用 | A-36 **#9**（`04-adjudications.md:334`：一行注释、零行为变更，派 T-03 第 2 微轮；上游事实 = `02-tech-design.md:477` ①②，键名口径 = A-35-3 / `02-tech-design.md:474`） | `packages/shared/src/contracts/wordbook.ts:67`（**仅注释**） |
| ② `FORBIDDEN.from` 补第三面 R-09·R-10 | A-36 **#14②**（`04-adjudications.md:344`："三面同标要 —— 定稿裁决的依据就是'三面共用一条码'，`from` 少一面等于把结论的出处弄丢"），三面顺序照 PRD 定稿①（`01-prd-fix2.md:15`：`R-05② / R-09·R-10 / R-41①`） | `packages/shared/src/constants/errors.ts:216`（**仅 `from` 字段**，`copy` 一字未动） |
| ③ 钉 `from` 的用例与 ② 同步 | A-36 **#14②** 同条明写 "`errors.ts:216` + `contracts.spec.ts:897` 各 1 行追加" | `packages/shared/test/contracts.spec.ts:897` → 改后在 **`:898`**（④ 插了一行，行号右移） |
| ④ 翻转 `LoginInputSchema` 短密码断言 + `A-36-3` 注释 | A-36 **#3**（DEFECT-3 定性 = bug 回环修："登录面只验'有没有给'，不验强度"）+ `04-dev-report-T-07-fix3.md` **§8-①**（另一 agent 报给 T-03 的那条红） | `packages/shared/test/contracts.spec.ts:337`（注释新增在 337、断言在 **338**） |

**一句话结论**：4 处全部落地，`@tm/shared` 全套 **50/50 绿**（改前是 T-07 §6-4 报的 `1 failed | 49 passed`，红就在 `:337`）；typecheck 0 错、`--copy` / `--tokens` / `--check-ownership` 全绿；**§4.6 三个冻结面逐字节未变**（`TM_ERROR_CODES` / `TM_ERROR_ROWS` / `TM_ERRORS` 三段行区间改前后 md5 全等）；`WordbookPullResultSchema` 形状与出参键 `version` **零改动**（md5 取证）；**注册/改密/强升三面的 ≥8 未被上一轮影响**（13 条只读探针全 PASS，`contracts/auth.ts` 本轮一字未动）。待拍板 6 条全在 §6，本轮未自行处置任何一条。

---

## 0. 改前基线（真实输出，先于任何代码改动采集）

### 0.1 `pnpm --filter @tm/shared test`（改前）—— T-07 §8-① 那条红实测复现

```
- Expected
+ Received

- false
+ true

 ❯ test/contracts.spec.ts:337:93
    335|     expect(LoginInputSchema.safeParse({ phone: '13800000000', password…
    336|     expect(LoginInputSchema.safeParse({ phone: '1380000000', password:…
    337|     expect(LoginInputSchema.safeParse({ phone: '13800000000', password…
       |                                                                                             ^
    338|     expect(RegisterInputSchema.parse({ phone: '13800000000', password:…
    339|     expect(ChangePasswordInputSchema.safeParse({ oldPassword: 'abcd123…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 49 passed (50)
   Duration  1.13s
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/shared@2.0.0 test: `vitest run --root ../.. --project @tm/shared`
Exit status 1
```

⇒ 与 `04-dev-report-T-07-fix3.md` §6-4 的数字与位置**逐字一致**（红在 `:337`），确认这条红不是本轮引入，且按 A-36-#3 的唯一正确修法就是翻转。

### 0.2 `node tools/boundaries.mjs --copy`（改前）

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
```

### 0.3 三个改动文件在 git 里的基线状态（决定本轮证据形态）

```
$ git diff -U0 -- packages/shared/src/contracts/wordbook.ts packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts
（空输出，退出码 0）

$ git status --porcelain packages/shared | head -12
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

$ git ls-files packages/shared/src/contracts/wordbook.ts | wc -l
0
```

**不是"没改"，是这三条路径在仓库里根本没有 git 基线**（整目录从未 `git add`，与 `04-dev-report-T-03-fix1.md` §1「证据说明」同一事实）。禁止 `git add`（铁律）⇒ 按上轮先例改用**改前快照 → 改后 + `git diff --no-index -U0`**：先把三文件 cp 到系统 `%TEMP%/t03fix2/before/`，改动后再 cp 到 `after/`，两者做无索引 diff（临时件跑完删除，仓库内零残留）。

---

## 1. 改动清单（4 处 / 3 个文件，全部在可写范围内；`git diff --no-index -U0` 真实输出）

```
=== wordbook.ts ===
@@ -67 +67 @@ export type WordbookPushResultDto = z.infer<typeof WordbookPushResultSchema>;
-/** pull 出参（`GET /api/wordbook/pull?version=` 与 `wordbook.pull`）。 */
+/** pull 出参（`GET /api/wordbook/pull?since=`；请求侧键名 = `since`、出参侧仍 `version`，A-35-3 两个键名都不改。本期同步只有 REST 两端点 `POST /api/wordbook/push` / `GET /api/wordbook/pull`，无 tRPC `wordbook.pull` 过程 —— A-36-8/#9）。 */
=== errors.ts ===
@@ -216 +216 @@ export const TM_ERRORS_SUPPLEMENT = {
-  FORBIDDEN: { http: 403, copy: '这份内容不属于当前账号', from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）' },
+  FORBIDDEN: { http: 403, copy: '这份内容不属于当前账号', from: '§4.5 R-05② / R-09·R-10 / R-41①（PRD §5.4-1 定稿）' },
=== contracts.spec.ts ===
@@ -337 +337,2 @@ describe('判据①：§3.3.1 四契约 + auth + review-queue 六份文件', ()
-    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(false);
+    // A-36-3：登录面只验"有没有给"、不验强度 ⇒ 存量短密码必须能过 zod（强度判定在 service 侧），把 min 加回登录面本条必红
+    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(true);
@@ -897 +898 @@ describe('A-28-4：TM_ERRORS_SUPPLEMENT 的复习域 5 码', () => {
-      from: '§4.5 R-05② / R-41①（PRD §5.4-1 定稿）',
+      from: '§4.5 R-05② / R-09·R-10 / R-41①（PRD §5.4-1 定稿）',
```

幅度（`git diff --no-index --numstat` 真实输出，顺序 = contracts.spec / errors / wordbook）：

```
3	2	.../before/contracts.spec.ts => .../after/contracts.spec.ts
1	1	.../before/errors.ts => .../after/errors.ts
1	1	.../before/wordbook.ts => .../after/wordbook.ts
```

⇒ **合计 +5 / −4 行、4 个 hunk、0 个额外行**。裁决出处要求的行数（#9 = 1 行注释；#14② = `errors.ts:216` + `contracts.spec.ts:897` 各 1 行；#3 = 1 行断言 + 1 行注释）**逐字对上，无多余改动**。

各条落地的语义要点：

- **①** 请求侧键名改成 `since`；"本期只有 REST 两端点"按 `packages/server/src/routes/wordbook.ts:63/84`（`r.post('/api/wordbook/push')` / `r.get('/api/wordbook/pull')`）与 `trpc/routers/wordbook.ts:17-19`（"未新增 `wordbook.push`/`wordbook.pull` 过程"）的实物写；`wordbook.pull` 只以**否定句**出现（"无 tRPC `wordbook.pull` 过程"），不再被当作存在的门面引用。零行为变更。
- **②** 只动 `from`；`copy` 串 `这份内容不属于当前账号` 与 `http: 403` 一字未动（见 §2 的 `:216` 行 md5 与 §5 的命中计数）。
- **④** 是**判据方向翻转**（按 A-36-#3 的裁决），不是删断言：断言仍在、仍跑、仍钉同一入参，只是期望值从 `false` 改为 `true`，注释里写明疫苗方向（"把 `min` 加回登录面本条必红"）。

---

## 2. §4.6 三个冻结面逐字节不变取证（A-8 / A-35-2 硬约束）

工具：临时件 `%TEMP%/t03fix2/frozen-check.mjs`（node + `crypto`，按 `errors.ts` 的顶层符号行区间切片取 md5；区间由 `grep -n "^export const \|^const \|^}"` 实测得：`TM_ERROR_CODES` 20-39、`TM_ERROR_ROWS` 47-77、`TM_ERRORS` 79-178、`TM_ERRORS_SUPPLEMENT` 215-239）。真实输出：

```
区间                                 改前 md5                             改后 md5                             判定
TM_ERROR_CODES (20-39)             fe53b1733b78178b30454c92c749a65b   fe53b1733b78178b30454c92c749a65b   SAME ✅
TM_ERROR_ROWS (47-77)              8a4a6a75897c02ffc759d25a91d48b0a   8a4a6a75897c02ffc759d25a91d48b0a   SAME ✅
TM_ERRORS (79-178)                 ad9bfa6cdb4f9f62c12b761cefc0ba8e   ad9bfa6cdb4f9f62c12b761cefc0ba8e   SAME ✅
TM_ERRORS_SUPPLEMENT 头 1 行 (216)   c875bf34fdae4bb98adbed1d2677d002   523e182fc0e786af778eef8b1090e262   DIFF（本轮按裁决改动的那一块）
WordbookPullResultSchema+Dto (68-73) dd483e750b6dec6d7998bd23a6123e41   dd483e750b6dec6d7998bd23a6123e41   SAME ✅
supplement 钉子用例 (884-899)          ff9ad038256bff35cae2754d14c3166d   f031bbdc917ede92379cdb9083e29f46   DIFF（本轮按裁决改动的那一块）
errors.ts: 抠掉声明的改动行后余下内容 md5 改前=0f9b997ba6e4… 改后=0f9b997ba6e4… → 余下 0 行变更 ✅
wordbook.ts: 抠掉声明的改动行后余下内容 md5 改前=d5445c5becbb… 改后=d5445c5becbb… → 余下 0 行变更 ✅
contracts.spec.ts: 抠掉声明的改动行后余下内容 md5 改前=e684aff45544… 改后=e684aff45544… → 余下 0 行变更 ✅
```

三重收口：

1. **三个冻结符号所在行区间改后 md5 与改前全等** ⇒ `TM_ERRORS` / `TM_ERROR_CODES` / `TM_ERROR_ROWS` 逐字节不变，A-8 的 md5 快照钉子必绿（`contracts.spec.ts` 的 `判据②` 组 50 条内含这些用例，本轮全绿，见 §4.3）。
2. **改动只落在 `TM_ERRORS_SUPPLEMENT`（`:215-239`，非 §4.6 快照面，文件内 `:212-213` 注释已明示）** 的 `:216` 一行的 `from` 字段。
3. **余行 0 变更**：把声明的改动行整块抠掉后，三个文件的剩余内容 md5 改前后相同 ⇒ 除 §1 列出的 4 个 hunk 外没有任何一行被顺手碰过（含 `copy` 串所在同行的其余字段——它就在 `:216` 上，md5 变了只因 `from` 变了，`copy` 部分见 §5 的串命中计数）。

**门禁侧同口径复核**：`tools/boundaries.mjs:1231-1235` 的 `FROZEN_SHARED_ERROR_SYMBOLS = ['TM_ERROR_CODES','TM_ERROR_ROWS','TM_ERRORS']` 是 `extend-supplement` 通道的判据；本轮走的是 **T-03 对名下水册路径的正常写权**（不借任何动作通道），且 `--check-ownership` 实跑无越界（§4.5）。

---

## 3. `WordbookPullResultSchema` 形状与出参键 `version` 零改动取证（A-35-3）

- 上面 §2 第 5 行：`wordbook.ts` 的 **68-73 行**（`export const WordbookPullResultSchema = z.object({ version / updatedAt / entries })` + `export type WordbookPullResultDto`）改前后 md5 **SAME**，一个字节未动。
- `:67`（本轮唯一改动）是该块的**上一行 JSDoc**，不参与任何运行时形状。
- 键名口径按 A-35-3 写进注释：**请求侧 `since`、出参侧 `version`，本期两个键名都不改**。
- 无任何服务端/门面行为改动：`packages/server/**` 零触碰（§5 表 #9 的 git 状态佐证）。

---

## 4. 出口命令（真实跑、真实贴，改后）

### 4.1 `git diff -U0` 三处改动

真身命令输出为**空**（原因见 §0.3：三条路径未被 git 跟踪，且禁 `git add`）：

```
$ git diff -U0 -- packages/shared/src/contracts/wordbook.ts packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts
GIT_DIFF_EXIT=0
（无输出）
```

行级证据改由 §1 的 `git diff --no-index -U0`（改前快照 → 改后）承担，并附 `--numstat` 幅度。

### 4.2 `pnpm --filter @tm/shared typecheck` ✅

```
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0
```

（`tsc` 无诊断输出即通过。）

### 4.3 `pnpm --filter @tm/shared test`（全套最终数字）✅

```
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 93ms

 Test Files  1 passed (1)
      Tests  50 passed (50)
   Start at  05:48:01
   Duration  1.10s (transform 223ms, setup 0ms, collect 707ms, tests 93ms, environment 0ms, prepare 108ms)
SHARED_TEST_EXIT=0
```

⇒ 改前 `1 failed | 49 passed` → 改后 **50 passed (50)**，T-07 §8-① 报的那条红闭合，且没有为变绿动任何别的断言（全套仍 50 条，未减条）。

### 4.4 `node tools/boundaries.mjs --copy` ✅

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
COPY_EXIT=0
```

豁免/复核计数与改前**完全一致（76 / 126）** ⇒ 本轮未新增任何例外或豁免条目。顺带复跑 `--tokens`：`2/2 条通过，全绿`（`TOKENS_EXIT=0`）。

### 4.5 `node tools/boundaries.mjs --check-ownership --task T-03 --files <三文件>` ✅

```
TABLE E:\CC\tomorrow-memory\tools\ownership.json

--check-ownership task=T-03 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 无越界
OWNERSHIP_EXIT=0
```

⚠ **CLI 坑（简报原文命令按字面跑会 exit 2）**：`--files` 要**逗号分隔的单个参数**。按简报的空格分隔写法跑：

```
$ node tools/boundaries.mjs --check-ownership --task T-03 --files packages/shared/src/contracts/wordbook.ts packages/shared/src/constants/errors.ts packages/shared/test/contracts.spec.ts
（打印 --help 全文）OWNERSHIP_EXIT=2
```

即"第三个及以后的路径被当成未知参数 → 无有效证据 → exit 2"（与 A-35-10② 的"无判定不得声称通过"一致，方向是对的）。已按逗号形式重跑取绿，未改 `tools/**` 一行。

补交：带 scoped patch 的加严形态（真实输出）：

```
$ node tools/boundaries.mjs --check-ownership --task T-03 --files <逗号三项> --diff-file %TEMP%/t03fix2/scoped.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 3 个文件的 diff 参与判定
NOTE "b/C:/Users//346/233/271/.../after/wordbook.ts"：归属表无条目（no-entry，不阻断）
NOTE "b/C:/Users//346/233/271/.../after/errors.ts"：归属表无条目（no-entry，不阻断）
NOTE "b/C:/Users//346/233/271/.../after/contracts.spec.ts"：归属表无条目（no-entry，不阻断）

--check-ownership task=T-03 触碰 3 个在册文件（清单 3 项 + patch 3 项） → 无越界
OWNERSHIP_PATCH_EXIT=0
```

三条 NOTE 是**快照文件绝对路径**（`%TEMP%` 下）在归属表里查不到条目，属预期噪声、不阻断；判绿走的是清单面（T-03 名下的 `packages/shared/src/contracts/**` / `src/constants/**` / `test/**`，ownership.json idx 12/14/78）。

---

## 5. 盘面数字对账表（A-32-9 口径：简报/裁决数字 vs 实测，逐条归因）

| # | 项 | 简报/上游给的数 | 本轮实测 | 归因 |
|---|---|---|---|---|
| 1 | 改动处数 / 行数 | "4 处、约 6 行" | 4 处 / **+5 −4 行**（4 hunk） | ④ 含 1 行新增注释 + 1 行翻转断言 ⇒ 与"约 6 行"同量级；无第 5 处 |
| 2 | 改前 `@tm/shared` 数字 | T-07 §6-4：`1 failed \| 49 passed (50)`，红在 `:337` | 逐字复现（§0.1） | 红确为 DEFECT-3 病灶，非本轮引入 |
| 3 | 改后 `@tm/shared` 数字 | 要求全绿 | **50 passed (50)**，`SHARED_TEST_EXIT=0` | 判据条数未减（仍 50），无放宽 |
| 4 | `@tm/shared` typecheck | — | exit 0，0 诊断 | 注释与断言类型均无变化 |
| 5 | `--copy` 豁免/复核计数 | fix1 §7.3：76 / 126 | 76 / 126（改前后同值） | 未新增例外 |
| 6 | `--tokens` | — | `2/2 全绿` | 本轮不涉 token |
| 7 | `--check-ownership --task T-03` | 期望无越界 | `无越界` exit 0；简报的空格分隔写法 exit 2 | CLI 形态坑已记 §4.5 |
| 8 | §4.6 三面 md5 | 必须不变 | 20-39 / 47-77 / 79-178 三段全 SAME | ② 只碰 supplement 的 `:216` |
| 9 | 他人未提交改动 | 不得清理/还原 | `git status --porcelain -- packages/server` 终态 = **27 M / 22 ?? / 1 D（共 50 行）**，全程未被我修改；`apps/**` 状态同理未动 | 我只读不写他人面；未 `checkout`/`restore`/`clean` |
| 10 | `data.db`（仓库根 / `packages/server`） | 禁写禁迁移 | `253952 B` / `2026-09-18 04:05`；`0 B` / `2026-09-17 00:10` —— 与 fix1 §5 #14 记录的字节数一致、mtime 未变 | 全程未在真库上跑任何写/迁移（本轮也没跑 server 套件） |
| 11 | `trpc-shape.baseline.json` | 不得再生 | 未再生（本轮未跑 `@tm/server` 任何用例，也无 `TRPC_SHAPE_UPDATE=1`） | 一次性再生额度仍完整保留给 E3′ |
| 12 | 定稿串 `这份内容不属于当前账号` 源码命中 | 应仍为 2（唯一真值 + 它的钉子） | `errors.ts:216` = 1、`contracts.spec.ts:897` = 1 ⇒ **2** | `copy` 未被改动，命中面未扩散 |
| 13 | 建密码三面 ≥8 | "原样保留、不得变短" | 13 条只读探针全 PASS（§5.1）+ `PASSWORD_MIN = 8` 的钉子 `:618`/`:751` 仍在 50 条绿里 | **无一条被上一轮影响**，故本轮无需报缺陷 |
| 14 | 本轮是否碰禁区 | 禁 `contracts/auth.ts` / `packages/server/**` / `tools/**` / `.delivery/0[12]*.md` / `apps/**` | 全部 0 改动（写操作仅 §1 的 3 个文件 + 本报告） | 见 §6 的越界申请（只申请、未动手） |

### 5.1 ≥8 三面探针（任务 4 要求的"确认"，只读、临时件 `%TEMP%/t03fix2/probe-8.mts`，经 `tsx` 直读 `src`，真跑）

```
PASSWORD_MIN = 8
PASS  PasswordSchema 7 位被拒  got=false want=false
PASS  PasswordSchema 8 位通过  got=true want=true
PASS  登录面 password=short 过 zod（A-36-3）  got=true want=true
PASS  登录面 password=7 位过 zod  got=true want=true
PASS  登录面不给 password 仍过（只验"给没给"的 optional）  got=true want=true
PASS  登录面手机号非法仍拒（强度≠格式）  got=false want=false
PASS  注册面 short 仍拒（≥8 保留）  got=false want=false
PASS  注册面 8 位通过  got=true want=true
PASS  改密面 newPassword=short 仍拒  got=false want=false
PASS  改密面 oldPassword=short 仍拒  got=false want=false
PASS  改密面 8/8 通过  got=true want=true
PASS  强升面 newPassword=short 仍拒  got=false want=false
PASS  强升面 8 位通过  got=true want=true
```

结构侧同证（只读 `grep`，`packages/shared/src/contracts/auth.ts`，T-07 上一轮的成品）：`:41` `PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX_BYTES)`、`:71`（注册）/`:83-84`（改密）/`:91`（强升）**四处仍引用同一个 `PasswordSchema`**，只有 `:64` 登录面是 `password: z.string().optional()`。⇒ **A-36-#3 末段"R-39② 三条现状不得变短"成立，三面均未被上一轮改动影响，无需报缺陷。**

---

## 6. 越界申请 / 待 TPM 拍板（本轮一律未自行处置）

1. **`packages/server/src/trpc/init.ts:78` 的注释仍是两面** —— 原文 "`FORBIDDEN`（R-05② / R-41①）与复习域那几码…"，缺第三面 R-09·R-10，与 A-36-#14② 同类的"出处少一面"残留，但在 `packages/server/**`（我的禁区）。**申请派给 `packages/server/src/trpc/init.ts` 的名义 owner（T-07 / T-10）** 一次 1 行注释追加。跑不红（注释无断言依赖），纯账面一致性。
2. **`errors.ts:205-206` 表头注释两处过期**（**在我名下文件内**，但不在本轮 4 处授权范围内，故未动）：`:205` "本任务只做登记，文案标'待 PM 定稿'"（文案已定稿）、`:206` "`TM_ERRORS_SUPPLEMENT` 之外的既有码…§4.5 R-05② **与 R-41①** 的 403"（同样缺第三面）。fix1 §7.2 已登记过一次同类问题。**请拍板：是否批准下一轮 shared 触碰时一并更正（各 1 行）**，还是并入架构师/文档轮的 §4.6 说明。
3. **`contracts.spec.ts:894`（原 `:893`，④ 插行后右移 1）注释已不成立**（在我名下、本轮未动）：`// FORBIDDEN 是 A-28-4 之前唯一的一条，原文案与原 http 一字未动。` —— 定稿后 `copy` 已改、`http` 未变；本轮又按 #14② 改了 `from`。该注释现与紧邻的断言矛盾。**申请 1 行注释更正**（与 §6.2 同轮做最省），或指定 owner。
4. **`packages/shared/dist/**` 是过期构建产物**（本轮实测）：`dist/constants/errors.d.ts:58` 仍写着定稿前的 `from: '§4.5 R-05② / R-41①（文案待 PM 定稿）'`，`dist/contracts/wordbook.d.ts:227` 仍写着旧注释 `?version=` 与 `wordbook.pull`（`dist/src/…` 各一份镜像）。源码面已全绿，只有 dist 落后。我**没跑 `pnpm build`**（dist 不在本轮可写范围，且并行窗口下重建会覆盖他人产物的时间戳）。**申请：批次3 出口指定一次 `@tm/shared` 重建轮**（或由 E3′ 在再生基线前跑），不要留到 QA 把 dist 当盘面。
5. **T-07 §8-① 建议的 +2 条"防反向摘除"断言我没有加** —— 它给的 diff 里除翻转外还追加了 `RegisterInputSchema … password:'short' → false` 与 `ChangePasswordInputSchema … newPassword:'short' → false` 两条。本轮简报把 ④ 明确限定为"改成 `true` + 补一句注释标 `A-36-3`"并要我不扩面，故只做这两行。**盘面事实**：`@tm/shared` 全套对建密码三面的 ≥8 **只有正向断言**（`:338-341` 用 `'abcd1234'`/`'wxyz5678'`），短密码的**负向**钉子活在 `packages/server/test/integration/auth-register.spec.ts:1156-1172` 与 `auth-hardening.spec.ts`（7 位下界探针）+ 我这轮的只读探针（未入库）。**请拍板**：是否另派一轮把那 2 条负向断言加进 shared 契约面（属 shared 面，T-03 可做，只需一句授权）。
6. **`trpc-shape` 的 `auth.*` 0 行要求本轮无新增风险，但我未跑 `@tm/server` 套件**（未跑 + 原因：不在本轮出口清单；`packages/server/**` 非我可写面，且 T-07 fix3 §6-3 已给出该套最新数字 `1 failed | 355 passed (356)`，那 1 红是计划内留给 E3′ 的 `trpc-shape.spec.ts`）。本轮 0 行 src 契约改动（`contracts/auth.ts` 未动），`auth.login`/`auth.sendCode` 的形状面不随 shared 测试文件的断言方向变化。

**契约偏差**：无。四个改动都不改任何出参/入参形状、码名、`http` 值或文案真值。

---

## 7. 给 E3′ / 测试的提示

1. `:337` 现在钉的是**登录面不验强度**（A-36-#3 的回归钉子）。疫苗口径写在注释里：把 `min` 加回 `LoginInputSchema.password` ⇒ 本条必红。这与 `auth-hardening.spec.ts:1045` 附近 T-07 留的服务端侧疫苗是**同一条判据的两个面**，E3′ 可只信服务端那条端到端版本，shared 这条是早退哨。
2. `--check-ownership` 的 `--files` **必须逗号分隔**（§4.5）；下一个用简报原文命令的 agent 会先撞 exit 2，别误判成越界。
3. 若 QA 用 grep 查 "`wordbook.pull` 是否还有引用"，本轮之后 `packages/shared/src/contracts/wordbook.ts:67` 仍会命中 1 次，但那是**否定句**（"无 tRPC `wordbook.pull` 过程"）。真正的过期命中只剩 §6.4 说的 `dist/**` 与 `packages/server/src/trpc/routers/wordbook.ts:17` 的说明行。判"是否还有门面"请以 `routers/wordbook.ts` 的过程清单为准，不要以这条注释为准。
4. §4.6 三个冻结面的行号（`errors.ts` 20-39 / 47-77 / 79-178）本轮未漂移，可继续用同一套区间做 md5 对账；supplement 块仍是 215-239。
5. `这份内容不属于当前账号` 的源码真值仍是 **1 处**（`errors.ts:216`）+ 1 处钉子（`contracts.spec.ts:897`）；三面出处现已完整（`R-05② / R-09·R-10 / R-41①`）。全仓最后一处旧串 `这份记录不属于当前账号` 仍是 `packages/server/src/services/search-history-service.ts:71`（A-36-#14① 已派 T-11 第 4 微轮，本轮未碰）。

---

## 8. 铁律遵守声明

无任何 `git add/commit/push/stash/checkout/reset/clean/restore`；未清理/还原他人未提交改动；未再生 `trpc-shape.baseline.json`、未跑 `@tm/server` 任何用例；未在 `data.db` / `packages/server/data.db` 上跑写操作或迁移（§5 #10 取证：字节数与 mtime 均未变）；`contracts/auth.ts`、`packages/server/**`、`tools/**`、`apps/**`、`.delivery/0[12]*.md` **零改动**；临时件（改前/改后快照、取证脚本、只读探针、scoped patch）全部建在系统 `%TEMP%/t03fix2/`，跑完 `rm -rf`，仓库内零残留；无编造输出（空输出、exit 2 与红项均原样贴出）；未放宽任何门禁、未删任何断言（④ 是按 A-36-#3 **翻转判据方向**并保留断言与条数 50→50）、未加任何例外条目。

---

## 9. 终态复核（交报告后追加的一轮真跑，防止他人并发轮把本面改黄）

时间：`06:05`（本机）。全部为本轮第二次实测输出，非复用 §4 的旧贴。

```
$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit            # 无输出 = 0 错

$ pnpm --filter @tm/shared test
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 88ms
 Test Files  1 passed (1)
      Tests  50 passed (50)

$ node tools/boundaries.mjs --check-ownership --task T-03 --files packages/shared/src/contracts/wordbook.ts
--check-ownership task=T-03 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 无越界      exit=0
$ … --files packages/shared/src/constants/errors.ts                                   → 无越界  exit=0
$ … --files packages/shared/test/contracts.spec.ts                                    → 无越界  exit=0
```

- **逐条单跑而不是批量一次传 3 个文件**：批量循环的输出上一轮被我误读过（见 `04-tooling-report-T-03-review.md` §6.5），这次一个文件一次调用，三次各自 exit 0，结论才敢写。
- 三文件命中的归属条目已用紧凑逐字段 dump 复核（不再打整表）：idx 12 `packages/shared/src/contracts/**`、idx 14 `packages/shared/src/constants/**`、idx 78 `packages/shared/test/**`，owner 均 `T-03`、`readers: "*"`、`handoff: false` —— 与 §4.5 的引用一致。
- 四处改动仍在盘上：`wordbook.ts:67` 含 `A-36-8/#9`（1 命中）、`errors.ts:216` 与 `contracts.spec.ts:898` 各含 `R-09·R-10`（各 1 命中）、`contracts.spec.ts:337` 注释 + `:338` `.toBe(true)`。
- **行号口径统一**：③/④ 落地后 spec 自 `:337` 起整体下移 1 行 —— FORBIDDEN 的 `copy` 钉子实际在 **`:897`**、`from` 在 **`:898`**。§5 #12 与 §7-5 已改为实测的 897；§1 表 #③ 与 §1.2 的 diff 头写 `897 → 898` 是"改前行号 → 改后行号"（引 A-36-#14② 原文时用改前 897），两处不矛盾。
- 临时件 `%TEMP%/t03fix2/`（改前/改后快照、`frozen-check.mjs`、`probe-8.mts`、`scoped.patch` 及归属复核 dump）已 `rm -rf`，`ls` 确认目录不存在；§8 那句"跑完已删"自此为真。仓库内零残留。

