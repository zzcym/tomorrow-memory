# 开发报告 —— 共享契约层（`packages/shared` 名义 owner T-03）· 批次4 前置微轮第 3 轮（T-03r3）

轮次性质：A-37 §五-22 裁定的 **T-03r3**（与批次4A 并行，只碰 `packages/shared/**`，与 4A 各 agent 文件面零重叠）。
输入（全读）：角色卡 `roles/dev.md`、`04-adjudications.md` **A-37 全节**（§二-5/6/7/10 + §五-22 + §四-19 + §二-3/4）、**A-36 §三-#14**（三面同标口径）、`01-prd.md` **§5.4-1**（定稿串所在）与 **§6.6-4 第 6 条**（新增正文不复述测评旧串）、`04-dev-report-T-03-fix2.md` §6/§7（本轮 4 项授权的原文上报）、`04-dev-report-E3-prime.md` §9-2（新锚点）。

## 0. 改前基线（真实输出，先于任何代码改动采集，本机 11:41–11:42）

```
$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0                       # 经 PIPESTATUS 实取

$ pnpm --filter @tm/shared test
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 96ms
 Test Files  1 passed (1)
      Tests  50 passed (50)
TEST_EXIT=0

$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（…例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
COPY_EXIT=0

$ <改前> md5 对账（冻结面三段，行区间取 T-03-fix2 §7-4）
file=packages/shared/src/constants/errors.ts bytes=12403 lines=289 whole-md5=d2272c248caca0031a03c6f54b5c0941
TM_ERRORS 20-39 md5=fe53b1733b78178b30454c92c749a65b bytes=825
TM_ERROR_CODES 47-77 md5=8a4a6a75897c02ffc759d25a91d48b0a bytes=1158
TM_ERROR_ROWS 79-178 md5=ad9bfa6cdb4f9f62c12b761cefc0ba8e bytes=2898
```

三个改动文件在 git 里的形态（决定证据形态，与 fix2 §0.3 同）：

```
$ git status --porcelain -- packages/shared
 M packages/shared/src/index.ts
 M packages/shared/src/types.ts
 M packages/shared/src/utils.ts
 M packages/shared/package.json
 M packages/shared/tsconfig.json
?? packages/shared/src/constants/        ← errors.ts 未跟踪
?? packages/shared/src/contracts/        ← auth.ts 未跟踪
?? packages/shared/test/                 ← contracts.spec.ts 未跟踪
（另有并发 agent 的 ?? packages/shared/src/schema/ 等，本轮未碰）
```

⇒ HEAD 相对 diff 对三个目标文件按定义无输出，出口判据只能用 **agent 自证 scoped patch**（A-35-1③ / A-36-13），生成方式见 §5.4。

## 1. 改动清单（授权 4 项改动 + 2 项"核查后 0 改动"，共 3 个源文件；scoped patch 全文）

| # | 授权出处 | 文件 | 行 | 形态 |
|---|---|---|---|---|
| ① | A-37 §二-5 | `packages/shared/src/constants/errors.ts` | 205、206 | 表头注释 2 行更正（各 1 行改写，**行数不变**） |
| ② | A-37 §二-6 | `packages/shared/test/contracts.spec.ts` | 894（改后 902） | 注释 1 行更正（1 删 1 增） |
| ③ | A-37 §二-7 | 同上 | 347-354（插入位置） | 追加 **2 条负向用例**（纯插入 8 行，用例数 50→52） |
| ④ | A-37 §二-3 | `packages/shared/src/contracts/auth.ts` | 19-20、58 | 行号注释刷新为 E3′ 实测新锚点（各 1 行改写，**行数不变**） |
| ⑤ | A-37 §二-10 | 同上 `:3-12` 文件头 carve-out | — | **只复核 ⇒ 结论"不矛盾" ⇒ 0 改动**（见 §3） |
| ⑥ | 本轮任务 5 | `packages/shared/src/index.ts` | — | **核查 = 无需改动，0 改动**（见 §4） |

幅度合计：**+14 行 / −6 行**（20 行 diff），全部在 `packages/shared/**` 内。逐字 diff（`git diff --no-index` 同形，`diff -u -U3` 带仓内相对标签）：

```diff
--- a/packages/shared/src/constants/errors.ts
+++ b/packages/shared/src/constants/errors.ts
@@ -202,8 +202,8 @@
 export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[keyof typeof REVIEW_ERROR_CODES];
 
 /**
- * §4.6 之外的既有码（本任务只做登记，文案标"待 PM 定稿"）：
- * §4.5 R-05② 与 R-41① 的 403 跨用户隔离。写入本表以免各端自己造人话。
+ * §4.6 之外的既有码（`FORBIDDEN` 的文案已定稿：PRD §5.4-1 / A-33 第四节定稿①）：
+ * §4.5 R-05② 与 R-09·R-10 与 R-41① 三面的 403 跨用户隔离共用这一条码。写入本表以免各端自己造人话。
   *
   * A-28-4（原 T-10 D-1）：复习域 5 码收进本表 —— 域内不得再建第二份码表。
   * 下面 5 条的 `copy` 用模板字面量从 `RATING_VALUES / RATING_LABELS / MODE_VALUES /
--- a/packages/shared/src/contracts/auth.ts
+++ b/packages/shared/src/contracts/auth.ts
@@ -16,8 +16,8 @@
 
 /**
  * 手机号校验失败的展示串（A-36-4①：两条**逐字还原**基线"改动前"指纹，不合并成一句）。
- * 出处 = `packages/server/test/trpc-shape.baseline.json` 的 `auth.login`（`:3199`）与
- * `auth.sendCode`（`:3876`）两段；两串语境不同（登录报格式、发码催输入），合并仍会打穿指纹。
+ * 出处 = `packages/server/test/trpc-shape.baseline.json` 的 `auth.login`（`:6011`，入参 phone message `:6042`）与
+ * `auth.sendCode`（`:7663`，入参 phone message `:7678`）两段；两串语境不同（登录报格式、发码催输入），合并仍会打穿指纹。
  * ⚠ 码串 `INVALID_PHONE` 不再充当这里的 message（A-36-4②）；作为**码**它照旧走
  *    `constants/errors.ts:80` 的 `copy`（服务端 `tmAuthError('INVALID_PHONE')` 那一条路）。
   */
@@ -55,7 +55,7 @@
  *
  * ⚠ 键的**声明顺序**是 `phone → code → password`：zod 出参 `data` 的键序跟着 shape 走，
  * 基线 `auth.login` 的 `phoneEmptyStrings` 探针记的就是 `{phone, code, password}`
- * （`trpc-shape.baseline.json:3509-3517`）。写成 `phone → password → code` 会在
+ * （`trpc-shape.baseline.json:6352-6360`）。写成 `phone → password → code` 会在
  * 快照面上多出 2 行纯键序差异（A-36 四-2 要求修完 `auth.login` = 0 行）。
   */
  export const LoginInputSchema = z.object({
--- a/packages/shared/test/contracts.spec.ts
+++ b/packages/shared/test/contracts.spec.ts
@@ -344,6 +344,14 @@
     expect(AuthResultSchema.safeParse({ ...upgradeOnly, upgradeToken: undefined }).success).toBe(true);
     expect(MeResultSchema.parse({ user_id: 1, phone: '13800000000', nickname: '', avatar: '', daily_goal: 10, hasPassword: true, pwPolicyVersion: 1 }).upgradeRequired).toBe(false);
   });
+
+  it('A-37 §二-7 负向哨：注册面短密码必须被 zod 拒（建密码三面的 ≥8 不可反向摘除）', () => {
+    expect(RegisterInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(false);
+  });
+
+  it('A-37 §二-7 负向哨：改密面 newPassword 短密码必须被 zod 拒（同上一条，钉 newPassword 这一键）', () => {
+    expect(ChangePasswordInputSchema.safeParse({ oldPassword: 'abcd1234', newPassword: 'short' }).success).toBe(false);
+  });
 });
 
 /* ═════════════════════════ 判据② 16 行错误码 ═════════════════════════ */
@@ -891,7 +899,7 @@
       expect(TM_ERRORS_SUPPLEMENT).toHaveProperty(value);
     }
     expect(Object.keys(REVIEW_ERROR_CODES)).toHaveLength(5);
-    // FORBIDDEN 是 A-28-4 之前唯一的一条，原文案与原 http 一字未动。
+    // FORBIDDEN 是 A-28-4 之前唯一的一条：`http` 403 与原码名一字未动，`copy` 已按 PRD §5.4-1 定稿改写，`from` 已按 A-36-#14② 三面同标。
     expect(TM_ERRORS_SUPPLEMENT.FORBIDDEN).toEqual({
       http: 403,
       copy: '这份内容不属于当前账号',
```

**逐条对表授权**：
- ① `:205` 删的正是"本任务只做登记，文案标'待 PM 定稿'"，改指 **PRD §5.4-1 / A-33 第四节定稿①**（`:216` 的 `from` 自 T-03-fix2 起已带 `（PRD §5.4-1 定稿）`，表头与行内现同一口径）；`:206` 补第三面 **R-09·R-10**，现为 `R-05② / R-09·R-10 / R-41①`，与 `:216` 的 `from`、`contracts.spec.ts:905-906` 的钉子三处逐字同标（A-36 §三-#14② "三面同标"）。
- ② 原注释"原文案与原 http 一字未动"与紧邻的 `:905 copy: '这份内容不属于当前账号'`（PRD §5.4-1 定稿改写值）矛盾 ⇒ 现按事实拆成三句：`http`/码名未动、`copy` 已按 §5.4-1 改写、`from` 已三面同标。断言一字未动（仍是同一条 `toEqual`）。
- ③ 两条负向用例的**内容逐字 = 裁决给的表达式**；裁决号写进 `it` 标题，**未另加注释行**（避免超出"2 条用例"的授权）。`@tm/shared` 的 ≥8 三面自此有正向 + 负向两侧哨（见 §7 疫苗）。
- ④ `:19`（该注释块起 `:19`，锚点跨 `:19-20` 两行）刷为 E3′ §9-2 实测：`auth.login` 段 `:6011` + 入参 phone message `:6042`、`auth.sendCode` 段 `:7663` + phone message `:7678`；`:58` 刷为 `:6352-6360`。四个锚点本轮**逐个回基线实读复核**（非转引）：

```
6011:       "path": "auth.login",            ← 段起
6042:                 "message": "手机号格式不正确"
6352:           "probe": "phoneEmptyStrings", ← :58 所指探针块 = 6352-6360（9 行，与原 3509-3517 同行数）
6360:           }                            ←   data = {phone, code, password}，即注释钉的键序
7663:       "path": "auth.sendCode",         ← 段起
7678:                 "message": "请输入正确的手机号"
（`trpc-shape.baseline.json` 433054 B / mtime 2026-09-19T22:34:52Z = E3′ 唯一那次再生的时刻，本轮只读、未再生）
```

## 2. §4.6 三个冻结面逐字节不变取证（A-8 / A-35-2 硬钉子）

行区间沿用 T-03-fix2 §7-4；对账方式 = 按行区间取字节流求 md5（改前用开工时的活文件，改后用现文件；`base/errors.ts` 快照 whole-md5 与改前活文件 **完全一致** ⇒ 快照无失真）：

| 面 | 行区间 | 改前 md5 | 改后 md5 | 结论 |
|---|---|---|---|---|
| `TM_ERRORS` | 20-39 | `fe53b1733b78178b30454c92c749a65b`（825 B） | 同值 | **SAME** |
| `TM_ERROR_CODES` | 47-77 | `8a4a6a75897c02ffc759d25a91d48b0a`（1158 B） | 同值 | **SAME** |
| `TM_ERROR_ROWS` | 79-178 | `ad9bfa6cdb4f9f62c12b761cefc0ba8e`（2898 B） | 同值 | **SAME** |

```
$ <改后> node $TEMP/t03r3/frozen-md5.mjs packages/shared/src/constants/errors.ts
file=packages/shared/src/constants/errors.ts bytes=12464 lines=289 whole-md5=62dcbfe56750a8a5846fa7cd4f9b10a5
TM_ERRORS 20-39 md5=fe53b1733b78178b30454c92c749a65b bytes=825
TM_ERROR_CODES 47-77 md5=8a4a6a75897c02ffc759d25a91d48b0a bytes=1158
TM_ERROR_ROWS 79-178 md5=ad9bfa6cdb4f9f62c12b761cefc0ba8e bytes=2898
```

- 文件总行数 **289 → 289**（① 是 2 行改 2 行），故 `:216` 起的 supplement 块与三段冻结面**行号零漂移**。
- 本轮未动 `:216` 一行（`copy` / `http` / `from` 均为 fix2 落地的现值）；定稿串 `这份内容不属于当前账号` 在 `src`+`test` 的命中仍是 **2 处**（真值 `errors.ts:216` + 钉子 `contracts.spec.ts:905`），未扩散。

## 3. A-37 §二-10：文件头 carve-out 注释 = 只复核，结论「不矛盾」⇒ 0 改动

复核三问，全部实测（只读，脚本在仓库外 `$TEMP/t03r3/carveout2.mjs`）：

| 文件头 `:3-12` 的主张 | 实现现状 | 是否矛盾 |
|---|---|---|
| "本文件不放**响应码文案**" | `auth.ts` 内 `copy:` 出现 **0** 次、`errorMessage(` **0** 次；从 `constants/errors.js` 只 import `TmErrorResponseBodySchema`（形状，非文案） | 否 |
| "唯一的例外是下面两个入参校验的展示串具名常量" | 代码级中文字符面量**恰好 2 条**：`:24 PHONE_LOGIN_COPY = '手机号格式不正确'`、`:26 PHONE_SEND_CODE_COPY = '请输入正确的手机号'`（其余中文全在注释里） | 否 |
| "`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面一字不动" | 全文只在 `:10` 的注释里提过一次；§4.6 三段 md5 全 SAME（§2） | 否 |

⇒ 按裁决原文"**不矛盾就不动一行**"，本轮对 `:3-12` **0 改动**，也未占用 A-37 §二-10 的"若矛盾才允许 1 行"额度。

## 4. `packages/shared/src/index.ts` 核查（任务 5，本表禁改项）

- 结论：**无需改动，0 改动**。理由：本轮改动 = 6 行注释（① 2 行 + ④ 3 行 + ② 1 行）+ 2 条测试用例，**未新增任何导出符号**，`index.ts` 的 `export * from './contracts/auth.js'`（`:24`）与 `export * from './constants/errors.js'`（`:30`）两条 re-export 已覆盖全部现名；新用例消费的两个 Schema 走测试文件的相对路径直引（`../src/contracts/auth.js`），不经门面。
- 字节级自证（开工前快照 → 终态）：

```
index.ts bytes=1609 md5=31e41113fdaf99656b1859d356385616   ← 改前（11:40 快照）
index.ts bytes=1609 md5=31e41113fdaf99656b1859d356385616   ← 改后（现文件）
```

## 5. 出口命令（真实跑、真实贴；终态复跑）

### 5.1 `pnpm --filter @tm/shared typecheck` ✅

```
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0        # 0 诊断（含 test/，A-9 口径）
```

### 5.2 `pnpm --filter @tm/shared test` ✅ 52/52

```
$ vitest run --root ../.. --project @tm/shared
 ✓  @tm/shared  test/contracts.spec.ts (52 tests) 105ms
 Test Files  1 passed (1)
      Tests  52 passed (52)
   Duration  1.07s
```

新增两条的真实执行行（`--reporter=verbose`）：

```
 ✓  @tm/shared  test/contracts.spec.ts > 判据①：§3.3.1 四契约 + auth + review-queue 六份文件 > A-37 §二-7 负向哨：注册面短密码必须被 zod 拒（建密码三面的 ≥8 不可反向摘除） 0ms
 ✓  @tm/shared  test/contracts.spec.ts > 判据①：§3.3.1 四契约 + auth + review-queue 六份文件 > A-37 §二-7 负向哨：改密面 newPassword 短密码必须被 zod 拒（同上一条，钉 newPassword 这一键） 0ms
```

⚠ 快照未被改写（QA 关注点）：`:606` 的 `keySets` 快照断言仍绿，`test/__snapshots__/contracts.spec.ts.snap` mtime = `2026-09-19T05:34:51Z`（早于本轮开工）、输出无 `written` / `obsolete` 行 ⇒ 本轮没有改写任何快照产物。

### 5.3 `node tools/boundaries.mjs --copy` ✅

```
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
COPY_EXIT=0
```

豁免/复核计数与改前**逐值相同（76 / 126）** ⇒ 未新增任何例外条目，也未把任何旧串引进扫描面。
另按 PRD §6.6-4 第 6 条纪律自查：本轮 14 条新增行全文过一遍禁用措辞与内部术语表（"混用/会串/拿到别人的题"式旧串 + `BANNED_TERMS` 相关子集 + `user_id`/`缓存键`/`UNIQUE 约束`/`RK-14`/`属主过滤` 等）⇒ **命中 0**（脚本 `$TEMP/t03r3/banned-scan.mjs`，新增行全文已在脚本输出里逐行贴出）。

### 5.4 `node tools/boundaries.mjs --check-ownership --task T-03 --diff-file <scoped patch>` ✅

```
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 3 个文件的 diff 参与判定

--check-ownership task=T-03 触碰 3 个在册文件（清单 0 项 + patch 3 项） → 无越界
OWNERSHIP_EXIT=0
```

- patch 生成方式：三文件在 git 里是 `??` 未跟踪 ⇒ HEAD diff 无输出，故按 A-36-13 口径自证 —— `diff -u -U3 --label a/<仓内相对路径> --label b/<仓内相对路径> <改前快照> <现文件>` 三段拼接为 `$TEMP/t03r3/t03r3-scoped.patch`（4030 B / 61 行 / 3 文件）。**标签用仓内相对路径**，所以不像 fix2 §4.5 那样产生 `no-entry` NOTE 噪声（那三条 NOTE 的根因是当年用绝对路径当标签）。
- 命中的归属条目（逐字段复核）：idx 12 `packages/shared/src/contracts/**`、idx 13 `packages/shared/src/contracts/auth.ts`（**owner 仍是 T-03**，那条 `bounded-edit:A-36-3` + `maxDiffLinesFor.T-07 = 49` 是 T-07 微轮的一次性窄授权，本轮走的是 owner 分支 `owners.includes('T-03') → 放行`，**未复用、未触碰 T-07 的额度**）、idx 14 `packages/shared/src/constants/**`、idx 78 `packages/shared/test/**`。
- 幅度：owner 面无人行上限；本轮实测 +14/−6 行（20 行），全部为注释与用例。

### 5.5 冻结面 md5 对账 ✅ —— 见 §2（三段全 SAME，`errors.ts` 行数 289 未变）

## 6. 盘面数字对账表（A-32-9 口径：裁决/简报数字 vs 实测，逐条归因）

| # | 项 | 简报/裁决给的数 | 本轮实测 | 归因 |
|---|---|---|---|---|
| 1 | 改动行数 | "errors.ts 2 行注释、spec 1 行注释 + 2 条用例、auth.ts 行号注释 2 处" | +14/−6（errors 2/2、auth 3/3、spec 9/1） | ①④是等行改写（各 2/2 与 3/3）；③两条 `it` 块含空行 = 8 行插入；②=1/1。与授权面**逐处对齐、无第 5 处** |
| 2 | 用例数 | 50→52 | **52 passed (52)** | 未删、未放宽任何既有用例（改前后 diff 只增不减） |
| 3 | `:58` 的新锚点 | A-37 §二-3 只给了段起与 phone message 四个锚点，未给探针区间新值 | `:6352-6360` | E3′ §9-2 未点名该区间 ⇒ 本轮**回基线实读**定位（`auth.login` 段内唯一 `phoneEmptyStrings`，9 行，与原 `3509-3517` 同行数；段内另一处同名探针在 `:7194` 属 `auth.register`，非本锚点） |
| 4 | `--copy` 豁免/复核 | fix2 §5：76 / 126 | 76 / 126（改前后同值） | 无新例外 |
| 5 | 冻结面 | 必须不变 | 20-39 / 47-77 / 79-178 三段 md5 全 SAME | 只碰 `:204-214` 的表头块 |
| 6 | 定稿串命中 | 应仍为 2（真值 + 钉子） | `errors.ts:216` + `contracts.spec.ts:905` = **2** | `copy` 未被本轮改动，命中面未扩散 |
| 7 | spec 行号漂移 | — | 注释 894→**902**、`copy` 钉子 897→**905**、`from` 898→**906** | ③ 在 `:347` 前插入 8 行所致，纯账面；E4 的"账面一致性"清单若引旧行号请按此改引 |
| 8 | `index.ts` | 本表禁改 | bytes/md5 改前后同值 | 见 §4 |
| 9 | 基线 | 不得再生 | 433054 B / mtime `2026-09-19T22:34:52Z` 未变；未跑任何 `@tm/server` 用例、无 `TRPC_SHAPE_UPDATE=1` | 批次4 的 `baseline-regenerate:A-37-E4` 额度**分文未动**（A-37 §五-20） |
| 10 | `data.db` | 禁写禁迁移 | 根库 253952 B / mtime `2026-09-17T20:05:38Z`、`-wal` 424392 B / `20:09:16Z`、`packages/server/data.db` 0 B / `2026-09-16T16:10:53Z` —— 与 fix2 §5 #10 记录的字节数一致、mtime 未变 | 本轮只在 `@tm/shared` 面跑用例 |
| 11 | 他人并发面 | 不得清理/还原 | `packages/shared/src/schema/tables.ts`、`packages/server/src/db/types.ts`、`apps/web/.next/**` 在开工窗口内被他人改写（`find -newermt "-30 minutes"` 实测），本轮**一次写操作都没有落在它们上** | 只写 §1 表内 3 个文件 + 本报告 |
| 12 | 本轮是否碰禁区 | 禁 `packages/shared/**` 之外的一切仓内文件 | 写入清单 = `src/constants/errors.ts`、`src/contracts/auth.ts`、`test/contracts.spec.ts`、`.delivery/04-dev-report-T-03-r3.md`；`tools/**`、`.delivery/0[123]*.md`、`apps/**`、`mobile-*` 零改动 | 无越界，故**无越界申请需要代提** |

## 7. 疫苗：两条负向哨真守得住（只读探针，仓库外 `$TEMP/t03r3/probe-negative.mts`，经 `tsx` 直读 `src`，真跑）

```
$ pnpm exec tsx "$TEMP/t03r3/probe-negative.mts"
PASSWORD_MIN = 8
PASS  新增用例①：注册面 password=short 被拒  got=false want=false
PASS  新增用例②：改密面 newPassword=short 被拒  got=false want=false
PASS  疫苗：摘掉 ≥8 后注册面 short 变通过 ⇒ 用例①转红  got=true want=true
PASS  疫苗：摘掉 ≥8 后改密面 short 变通过 ⇒ 用例②转红  got=true want=true
PASS  正向仍在位：注册面 8 位通过  got=true want=true
PASS  正向仍在位：改密面 8/8 通过  got=true want=true
PASS  登录面仍不验强度（A-36-3，本轮未动）  got=true want=true
ALL PASS
PROBE_EXIT=0
```

（"摘掉 ≥8"在探针里以 `z.string()` 替代 `PasswordSchema` 构造同形状对象来复现，未改仓内任何源文件。）⇒ 这正是 A-37 §二-7 要的性质：**把 `PASSWORD_MIN` 从"建密码"两面摘掉，本轮新增的两条必红**；同时登录面"只验给没给、不验强度"（A-36-3）不回退。

## 8. 越界申请 / 待 TPM 拍板（本轮一律未自行处置）

1. **`contracts/auth.ts:25` 还有一处旧锚点 `基线 :3876` 未刷新** —— 原文 `/** 见 PHONE_LOGIN_COPY 的注释（发码面的那一条，基线 :3876 逐字）。 */`。E3′ §9-2 只点名 `:19`（引 `:3199`/`:3876`）与 `:58` 两处，**漏计了这一行**；A-37 §二-3 逐字授权也是 "`:19` 与 `:58`" ⇒ 本轮未动（多一行就算越界）。**申请**：并入 A-37 §二-3 已设的 E4 "账面一致性"清单（与 `auth-hardening.spec.ts:1096` 同批），新值 = `:7678`（本轮实测，见 §1 表 ④ 的取证块）。跑不红、零断言依赖。
2. **`packages/shared/dist/**` 仍是定稿前产物**（本轮实测）：`dist/constants/errors.js:158` 与 `dist/src/constants/errors.js:158` 仍是旧 `copy: '~~这份记录不属于当前账号~~'`（PRD §5.4-1 的"应删对照物"）+ `from: '…（文案待 PM 定稿）'`，`dist/constants/errors.d.ts:57` 同。A-37 §四-19 已裁"E4 出口轮跑一次 `pnpm --filter @tm/shared build` 重建"，**本轮按裁决未跑 build**（dist 不在授权面，且并发窗口下重建会覆盖他人产物时间戳）。列为给 QA 的盘面提示，不是申请。
3. **`packages/server/src/trpc/init.ts:78` 缺第三面**（T-03r2 §6-1 旧账）：A-37 §二-4 已裁归 E4 账面批注轮代办。本轮再次**只复述、不动、不重复申请**（`packages/server/**` 是 T-03 禁区）。
4. **出口命令形态确认**：简报给的 `--diff-file <scoped patch>` 已按 §5.4 跑绿（清单 0 项 + patch 3 项）。fix2 §4.5 那条 `--files` 必须逗号分隔的坑本轮未触发（未用该形态）。若 TPM 要 `--files` 与 `--diff-file` 双形态并交，我下一轮 1 条命令即可补。
5. **`03-ui-spec.md` §6.4 定稿行（A-37 §五-23）**：UI 设计师名下，本轮未碰；`errors.ts:216` 的真值现仍与 §5.4-1 逐字一致，若 UI 侧补行请按 §5.4-1 的"只改 `copy` 一个字符串、不动三个冻结面"边界核对。

**契约偏差**：无。本轮 4 项都不改任何出参/入参形状、键序、码名、`http` 值、`copy` 真值或基线形状；`auth.login`/`auth.sendCode` 的七轴在 shared 侧 0 字节变化（①④⑤ 全是注释，③ 全是测试文件）。

## 9. 铁律自查

| 铁律 | 自查 |
|---|---|
| 禁止一切 git 写操作 | 只跑过 `git status --porcelain -- packages/shared` 与 `git rev-parse --abbrev-ref HEAD` 两条只读命令；无 `add/commit/push/stash/checkout/reset/clean/restore/switch` |
| 不碰 `packages/shared/**` 之外的仓内文件 | 写入 = `packages/shared/` 下 3 个源/测试文件 + `.delivery/04-dev-report-T-03-r3.md`（本轮唯一要求的产物）。`tools/**`、`.delivery/0[1-3]*.md`、`apps/**`、`mobile-*`、`scripts/**`、`packages/server/**` **零改动**；未清理/还原他人 1 字节（§6 #11） |
| 不碰任何 `data.db` | 根库与 `packages/server/data.db` 及其 `-wal`/`-shm` 的字节数与 mtime 与 fix2 §5 #10 记录一致（§6 #10）；未跑迁移、未跑任何 server 用例 |
| 不改 §4.6 三个冻结面 | `TM_ERRORS` 20-39 / `TM_ERROR_CODES` 47-77 / `TM_ERROR_ROWS` 79-178 三段 md5 改前后**逐段全等**（§2 对账表）；`errors.ts` 总行数 289 未变 |
| 不越权改动 `contracts/auth.ts` 的 T-07 窄授权面 | 只刷新 `:19-20`/`:58` 两处行号注释（A-37 §二-3 授权），`:3-12` 复核后 0 改动（§3），未走 `bounded-edit:A-36-3` 通道（走的是 T-03 owner 分支），未消耗/未复用 T-07 的 49 行额度 |
| 再生额度 | `TRPC_SHAPE_UPDATE=1` 本轮出现 **0 次**；基线 mtime 未变 |
| 真实输出、禁止编造 | §0/§2/§5/§6/§7 每个代码块都是命令原文 + 输出原文；exit 码用 `PIPESTATUS` 实取（不是 `tail` 的退出码）；红项与噪声原样贴（本轮无红） |
| 未放宽门禁 | 未改 `tools/**`、未加 `exceptions.json` 条目、未删/未放宽任何断言；② 只把**与断言矛盾的注释**改成如实表述，`toEqual` 一字未动 |
| 临时件 | `$TEMP/t03r3/`（改前快照 `base/{errors.ts,auth.ts,index.ts,spec.ts}`、`frozen-md5.mjs`、`mkbase.mjs`、`carveout2.mjs`、`banned-scan.mjs`、`probe-negative.mts`、`t03r3-scoped.patch`、各命令输出）全在仓库外。**本轮保留未删**（`--diff-file` 复验要它：E4/QA 按 `node tools/boundaries.mjs --check-ownership --task T-03 --diff-file $TEMP/t03r3/t03r3-scoped.patch` 可原样复跑 §5.4），QA 复核后可自行清理；仓库内零残留 |
| PRD §6.6-4 第 6 条禁词纪律 | 14 条新增行全文过禁用措辞与内部术语表 ⇒ 命中 0（§5.3 末）；测评旧串未被复述进任何正文 |

## 10. 给 E4 / 测试的提示（重点测哪里、哪些路径我没测到）

1. **要测的**：① `errorMessage('FORBIDDEN')` 与三面 403 响应体的人话字段是否仍逐字 = §5.4-1 定稿串（§6 #6 只钉了 shared 侧 2 处命中，三面端到端仍归 §8.3-D 第 23/24 项走查）；② 两条新负向哨是否随批次4 任何"门面改引用 shared 契约"的改动仍绿（A-36-11 判据面）。
2. **我没测到的**：`@tm/server` / `@tm/web` 全套（非我可写面，且 `auth.*` 形状面本轮 0 变化）；`pnpm --filter @tm/shared build` 后的 `dist` 面（A-37 §四-19 归 E4）；`--tokens` / `--all`（本轮出口清单不含，未跑即如实写"未跑"）。
3. **别按行号找 spec**：§6 #7 的 894→902 / 897→905 / 898→906 漂移是本轮造成的，凡引旧行号的账面（含 fix2 §7-5 与 §9 的 897 口径）请按此改引。
4. **A-36-4 的 message 常量口径未受影响**：两条入参展示串仍是 `auth.ts:24/:26` 两个具名常量 + `phoneSchema(message)` 工厂单点判定，`PHONE_PATTERN` 仍只有 `limits.ts` 一份 —— ④ 只动注释，任何机制都未复制。

## 11. 终态复核（交报告前最后一轮真跑，本机 12:01；防并发轮把本面改黄）

```
$ pnpm --filter @tm/shared typecheck      → TYPECHECK_EXIT=0
$ pnpm --filter @tm/shared test           → Test Files 1 passed (1) / Tests 52 passed (52)
$ node tools/boundaries.mjs --copy        → COPY_EXIT=0
$ node tools/boundaries.mjs --check-ownership --task T-03 --diff-file $TEMP/t03r3/t03r3-scoped.patch
--check-ownership task=T-03 触碰 3 个在册文件（清单 0 项 + patch 3 项） → 无越界
OWNERSHIP_EXIT=0
$ <冻结面 md5 第三次实取>  TM_ERRORS 20-39 fe53b1733b78178b30454c92c749a65b / TM_ERROR_CODES 47-77 8a4a6a75897c02ffc759d25a91d48b0a / TM_ERROR_ROWS 79-178 ad9bfa6cdb4f9f62c12b761cefc0ba8e   ← 与 §0 改前逐段全等
$ index.ts md5=31e41113fdaf99656b1859d356385616   ← 与开工前快照全等（0 改动成立）
```

四处改动仍在盘上（实测行号）：`errors.ts:205`/`:206` 含 `PRD §5.4-1` 与 `R-09·R-10 与 R-41①`；`contracts.spec.ts:348`/`:352` 两条负向哨、`:902` 新注释、`:905`/`:906` 仍是未动的 `copy`/`from` 钉子；`auth.ts:19`/`:20`/`:58` 三个新锚点。`contracts.spec.ts` 行数 975 → 983（+8，只来自 ③）。
