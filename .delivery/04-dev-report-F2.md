# 04-dev-report-F2 · 批次3 出口收尾微轮 F2（注释残留 + E3′ 基线再生通道）

任务号口径：本轮 `--check-ownership` 只用伪任务号 **E3**（出口轮伪任务号有先例，取证见 §3-B）。
并行在途：3 个文档 agent 在写 `.delivery/01-prd.md` / `02-tech-design*.md` / `03-ui-spec.md` —— 本轮一行未碰。

## 0. 本轮要办的两件事与可写面

| # | 事项 | 归属 | 落点文件 | 实到 |
|---|---|---|---|---|
| a | `SearchHistoryForbidden` 类注释仍引 `FORBIDDEN` **旧串**（A-36-#14①） | T-11 第 4 微轮 | `packages/server/src/services/search-history-service.ts:69-74`（仅注释） | ✔ 只改注释 |
| b | 给 E3′ 登记**窄授权、一次性**基线再生通道 + 最小机检（A-36 四-1 开工前置） | T-02/E1 系 | `tools/ownership.json:741-756`、`tools/boundaries.mjs`（新增通道⑥/自测⑦ + HELP） | ✔ |

禁区本轮全部只读：`packages/shared/**`、`packages/server/src/trpc/**`、
`packages/server/test/trpc-shape.{spec.ts,baseline.json}` **本体**（**未再生基线：`TRPC_SHAPE_UPDATE` 零次执行，
改前改后 sha 逐字相同，见 §5-末**）、`apps/**`、`.delivery/0[123]*.md`、`tools/**` 其余文件、两枚 `data.db`（未跑写操作/迁移）。

## 1. 改动前基线（起点数字，全部本轮实跑）

```
$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src,
     packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处
1/1 条通过，全绿            ← 旧串注释**本来就不红**，原因见 §2-末

$ node tools/boundaries.mjs --self-test
boundaries --self-test：139/139 通过     ← 与任务书给的基线数字一致

$ sha256sum packages/server/test/trpc-shape.baseline.json
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7     ← 与 E3 报告 §8 记录的 sha 逐字相同

$ node tools/boundaries.mjs --check-ownership --task E3 --files packages/server/test/trpc-shape.baseline.json
RED  packages/server/test/trpc-shape.baseline.json 由 T-08 独占（当前任务 E3）— §10.2 T-08 行 🆕packages/server/test/trpc-shape.spec.ts（baseline.json 是该快照判据①的产物）
--check-ownership task=E3 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 1 处越界
exit=1                                     ← **E3′ 开工前撞的就是这条红**（04-tooling-report S2 说对了）
```

## 2. 任务 a：注释残留（A-36-#14①，零行为变更）

**改前逐字**（`:69-72`，旧串在 `:71`；同一行另有 `.delivery/04-dev-report-T-03-fix1.md:40` 的独立 grep 记录）：

```ts
/**
 * 跨属主访问。文案与状态都取自 `@tm/shared` 的补充码 `FORBIDDEN`
 * （`这份记录不属于当前账号` / 403），与 `routes/chat.ts`、`trpc/routers/chat.ts` 同一条。
 */
```

**改后**（`:69-74`）：按任务书**优先不复述字面**，改成指回 `errors.ts` 的具名真值 + 取用方式：

```ts
/**
 * 跨属主访问。文案与状态都取自 `@tm/shared` 的补充码 `FORBIDDEN`
 * （人话串的唯一真值 = `constants/errors.ts` 里 `TM_ERRORS_SUPPLEMENT.FORBIDDEN.copy`，本文件只经
 * `errorMessage('FORBIDDEN')` 取、不复述字面 —— 复述必再漂，见 A-36-#14①/A-36-10 的教训），
 * 与 `routes/chat.ts`、`trpc/routers/chat.ts` 同一条。
 */
```

> 刻意**不写 `errors.ts:216` 这个行号**：行号也会漂（本文件与 `errors.ts` 都在被并行动），符号名 `TM_ERRORS_SUPPLEMENT.FORBIDDEN.copy` 才是钉得住的出处。

**串面对账（grep 实测，排除 node_modules/dist/.next/.turbo）**：

```
旧串「这份记录不属于当前账号」在 packages/ apps/ tools/ 命中 = 0     ← 全仓源码最后一处残留即本轮改掉的这行
定稿串「这份内容不属于当前账号」源码命中文件 = 2：
  packages/shared/src/constants/errors.ts          （:216 唯一真值）
  packages/shared/test/contracts.spec.ts           （:897 钉子）
⇒ 与 T-03r2 §表-12 的"1 真值 + 1 钉子"口径相同，本轮**未扩散**第三处，也**未碰** `packages/shared/**` 一个字节。
```

**为什么这条在 `--copy` 上跑不红（不是我把红改绿的）**：`BANNED_TERMS`（`tools/boundaries.mjs:167-182`）里
**根本没有** `FORBIDDEN` 的任何一串（旧串/定稿串都没有），76 处豁免也不涉及本文件 ⇒ 该门禁扫不到它。
这与 A-36-#14① 的"跑不红"完全一致，也意味着**"定稿串与各处逐字一致"今天没有机检**，只靠人肉 grep（已登记为待拍板 #3）。

**判据零变化的证明**：本轮 `@tm/server` 侧唯一跑到的覆盖者是 `test/integration/chat-isolation.spec.ts`
（实测：`SearchHistoryForbidden` 在全仓只被这一个 spec 引用），**25/25 绿**（§7-CMD1b）。

## 3. 任务 b 第 1 步：先例取证（只读，Grep 定位后按行区间读）

### 3-A. E 轮当年对 `trpc-shape.{spec.ts,baseline.json}` 做过什么

| 轮 | 是否碰过基线 | 跑 `--check-ownership` 用的 `--task` | 有无登记过条目/通道 | 出处（逐字定位行） |
|---|---|---|---|---|
| E1 | 未碰 | — | 无 | — |
| E1a | 未碰 | **`--task E2`**（对 `apps/web/package.json`，走 E1b 登记的 `add-script-lines-only:A-34-3`）+ `T-02`/`T-12`/`T-13` | 无（该文件不是基线件） | `04-dev-report-E1a.md:152-162` |
| E1b | **明示未碰** | `--task T-03`（自己是 owner 时直接绿）、`--task T-25`（新 owner） | 无 | `04-dev-report-E1b.md:3`、`:283`、`:332`、`:338`（"基线（A-28-1，留 E3 再生）"） |
| E1c | 未碰 | `--task T-10`/`T-11`/`T-25`/`T-07`/**`E2`**（出口轮对**别人名下**的文件用 E 系伪任务号 + 条目通道） | 登记过两条：`bounded-edit:A-33-7`（app.ts，`ownership.json:566-567`）、`bounded-edit:A-36-3`（contracts/auth.ts，`:126-134`）；**基线件 0 条** | `04-dev-report-E1c.md:263-378`（scoped vs HEAD 对照口径，本轮照抄）、`:423-477` |
| E2 | **明示未碰**（"未触碰 `test/contract/trpc-shape.baseline.json`（E3）"） | `--task T-01`（只对自己的三件） | 无 | `04-dev-report-E2.md:4`、`:115`、`:358`、`:398` |
| E3 | **未再生**（审计未过 ⇒ 正确拒了） | 该报告里 `--check-ownership` **0 次命中** | 无 | `04-dev-report-E3.md:11/28/119/202/219/224` |
| （旁证）T-03r 工具链评审 | — | — | **S2 明文点名这条欠账**，并给了同一形态的建议：`baseline-regenerate:<号>` + 红向 fixture + `--task E3` 或 T-08 明文 | `04-tooling-report-T-03-review.md:70`、`:121` |

**取证结论（三条）**：
1. **没有任何 E 轮为基线再生跑过 `--check-ownership`，也没有任何一条登记过条目** —— 因为 E1b/E2/E3 都把基线件列为禁区，E3 干脆没再生。⇒ 这条通道是**第一次**要建，无现成先例可抄，只能新建。
2. 但**出口轮用"E 系伪任务号 + 条目上的动作通道"去打别人名下的文件**是有先例且被裁决追认过的：`--task E2` + `add-script-lines-only:A-34-3`（E1a/E1c 实跑）。⇒ 本轮把 `outputs` 的 `--task` 定为 **`E3`** 是同一形态，不是发明。
3. 登记的**证据格式**照 E1c §4：`%TEMP%` 下建临时件、agent 自证 scoped patch 经 `--diff-file`、注入表只在用例里用、**不收 HEAD diff**、绿输出必须点名走了哪条通道（A-36-#13）。

> 顺带纠两处旁证报告的事实错误（不改它的结论）：S2 建议的裁决号写成 `A-36-14`，而 #14 是"两条残留文本"，本轮出处应是 **A-36 四-1/E3′** ⇒ 我用 `A-36-E3`；它写的"`--self-test` 151 条"与"`tools/selftest-fixtures/ownership/` 19 个条目"实测**都不存在**（现值：改前 139 条；仓库只有 `tools/fixtures/`，通道用例跑在 `os.tmpdir()` 沙盒里）。

## 4. 任务 b 第 2 步：选型与登记

### 4-A. 为什么选"新增 kind"而不是"复用 `bounded-edit:<裁决号>`"（另一条不选的理由）

复用 `bounded-edit:A-36-E3` 唯一的形态差异是**必须给一个行数 cap**（`maxDiffLinesFor.E3`），而这条 cap 在本件上是个**两难**：

- `judgeBoundedEdit`（`:1352-1368`）两条硬判据：`change.removed.length > cap ⇒ 拒判 exit 2`、`total > cap ⇒ 红`。
  A-36 四-2 的对照表要求再生**必然**是行级重写（`+7 path` = 每条新 procedure 在 JSON 里占多行；`profile.get` 三轴、`profile.update` 三键都是改既有行）⇒ 删除行数天生很大。
- cap 给小了 ⇒ E3′ 第一次跑就**误红**（违反硬要求①）；cap 给大到"容得下一次任意规模的再生" ⇒ 那就是**无上限授权**，正是 A-19/A-28-2/A-35-10 判死的假绿形态（违反硬要求③），而且**没人能预先算出这个数**（A-35-11 明令"不许现场约定人肉行数"）。
- 结论：**再生这件事的窄性不在"改了多少行"，在"只准改哪几个文件"** —— 行数由测试自己保证（`trpc-shape.spec.ts` 与基线逐字节比对），门禁不该再用一把错的尺子。所以新建 kind，把 cap 换成**产物清单**。

### 4-B. 新 kind `baseline-regenerate:<裁决号>` 的判据（`tools/boundaries.mjs:1469-1496`，共 6 条，全收紧）

| # | 条件 | 判定 |
|---|---|---|
| ① | 未给 `--task` 声明 `baselineRegenerateFor.<任务>` | **红**（别的任务号走同一文件必红 = 硬要求②） |
| ② | 该文件不在 `--diff-file` 的 patch 里（含"根本没配 `--diff-file`"） | **红**"要证据"（与 `bounded-edit` 同口径；基线件在 git 里是**未跟踪**状态 ⇒ HEAD 相对 diff 根本产不出它的账，唯一合法证据就是自证 scoped patch） |
| ③ | `outputs` 未声明或为空 | **拒判 exit 2**（缺自报产物清单，宁可红不放行） |
| ④ | 被判文件不在 `outputs` 内 | **红**（`trpc-shape.spec.ts` 本体不在授权面：人手改测试不是"再生基线"） |
| ⑤ | patch 里出现 `outputs` 之外的**任何**文件 | **红**（这一条就是"不收 HEAD diff"：他人未提交改动一混进来就咬） |
| ⑥ | 该文件在 patch 里 0 行变更 | **红**"空授权"（A-33-4 禁止不咬人的空壳） |

改动面（`tools/boundaries.mjs` 2920 → 3003 行；判据本体 12 行，其余是注释/HELP/用例）：
`judgeBaselineRegenerate` 新函数 `:1469-1496`；通道总入口加一条分支并透传 `patchFiles` `:1511`（函数签名 `:1499`）/调用点 `:1580`；
HELP `:1758-1761`（"五条"→"六条"，逐条列出新 kind）；`--self-test` 用例 `:2730-2737`（7 条，见 §6）。
**未新增任何"无证据也放行"的分支，未改任何既有判据的阈值**（`--self-test` 原 139 条一条未动、全绿）。

### 4-C. 登记内容（`tools/ownership.json:741-756`，该条目原 owner 仍是 **T-08**，未改）

```json
{
  "path": "packages/server/test/trpc-shape.{spec.ts,baseline.json}",
  "owner": "T-08", "readers": [],
  "reason": "…（原文）；A-36 四-1 出口门禁 E3′ 开工前置 ⇒ F2 只登记一条窄授权、一次性动作通道，**基线本体由 E3′ 再生，F2 未碰一个字节**",
  "actions": ["baseline-regenerate:A-36-E3"],
  "baselineRegenerateFor": {
    "E3": { "outputs": ["packages/server/test/trpc-shape.baseline.json"], "note": "…（一次性口径 + 六条判据指针 + 批次4 须另立裁决号）" }
  }
}
```

### 4-D. 给 E3′ 的开工用法（照此跑才判绿）

```bash
# 1) 再生前先取改前快照（零改工作区）
cp packages/server/test/trpc-shape.baseline.json $TEMP/e3/before.json
# 2) 唯一一次再生
TRPC_SHAPE_UPDATE=1 pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server trpc-shape
# 3) 产 scoped patch（label 必须是仓库相对路径，别用 git 的 a/b 前缀以外的形状）
diff -u --label a/packages/server/test/trpc-shape.baseline.json \
         --label b/packages/server/test/trpc-shape.baseline.json \
         $TEMP/e3/before.json packages/server/test/trpc-shape.baseline.json > $TEMP/e3/e3-scoped-baseline.patch
# 4) 出口判据（**必须 --task E3**，用 T-08 会绕过通道，见 §9-拍板#1）
node tools/boundaries.mjs --check-ownership --task E3 --diff-file $TEMP/e3/e3-scoped-baseline.patch
```
⚠ 第 4 步的绿**不含** A-36 四-2 的对照表 —— 那张表（`auth.*` 必须 0 行等四条）仍要 E3′ 自己逐轴核，多出一行即停下不再生。

## 5. 任务 b 第 3 步：红/绿对照与活体疫苗（真实输出）

证据形态说明：**真再生是 E3′ 的额度，F2 不许花**，所以绿向用**合成 scoped patch**（`%TEMP%/f2/`，用完已删）：
hunk 的 `-` 行**逐字取自真基线第 3171 行**（`      "nMiddlewares": 2,`），`+` 行只把它改成 `3` —— 正是 A-36-#2 那条轴的形状；
工作区文件一字节未改（改前/改后 sha 见本节末）。通道的窄性不数行数，故合成的 1 行与真再生的 N 行在判定上同构。

```
### A（绿向）：--task E3 + scoped 再生 patch
$ node tools/boundaries.mjs --check-ownership --task E3 --diff-file "$TEMP/f2/e3-scoped-baseline.patch"
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/test/trpc-shape.baseline.json：走动作通道 baseline-regenerate:A-36-E3（按实际 diff 判定：+1/-1 行）

--check-ownership task=E3 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
exit=0
```
⇒ 硬要求①：E3′ 按此通道能判绿，且绿输出点名走了哪条通道与实际行数（A-36-#13）。

```
### B（红向·硬要求②）：**同一份 patch** 换 --task T-11
$ node tools/boundaries.mjs --check-ownership --task T-11 --diff-file "$TEMP/f2/e3-scoped-baseline.patch"
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
RED  packages/server/test/trpc-shape.baseline.json（通道 baseline-regenerate:A-36-E3 不通过）：baseline-regenerate:A-36-E3 未给 T-11 声明 baselineRegenerateFor.T-11 = 未登记的再生授权，拒绝判定（宁可红，也不放别的任务号碰基线）

--check-ownership task=T-11 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界
exit=1
```

```
### C（红向·不收 HEAD diff）：同一 --task E3，但 patch = 基线 hunk + `git diff HEAD -- packages/server/src/app.ts`（246 行，T-07/T-10r3 的账）
$ node tools/boundaries.mjs --check-ownership --task E3 --diff-file "$TEMP/f2/e3-head-shaped.patch"
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 2 个文件的 diff 参与判定
RED  packages/server/test/trpc-shape.baseline.json（通道 baseline-regenerate:A-36-E3 不通过）：baseline-regenerate:A-36-E3：patch 里有 1 个产物清单之外的文件（如 packages/server/src/app.ts）—— 证据不是 scoped 再生 patch（疑似 HEAD 相对 diff 混入他人未提交改动），只许含 packages/server/test/trpc-shape.baseline.json
RED  packages/server/src/app.ts（通道 bounded-edit:A-33-7 不通过）：bounded-edit:A-33-7 未给 E3 声明 maxDiffLinesFor.E3 = 无上限授权，拒绝判定（宁可红也不放行未登记的幅度）

--check-ownership task=E3 触碰 2 个在册文件（清单 0 项 + patch 2 项） → 2 处越界
exit=1
```

```
### D（红向·要证据）：--task E3 只在 --files 里点名基线、不给 --diff-file
$ node tools/boundaries.mjs --check-ownership --task E3 --files packages/server/test/trpc-shape.baseline.json
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  packages/server/test/trpc-shape.baseline.json（通道 baseline-regenerate:A-36-E3 不通过）：baseline-regenerate:A-36-E3 要证据：本文件没有出现在 --diff-file 的 patch 里（清单里点个名不构成授权，也不构成违规；再生须交 agent 自证 scoped patch：改前快照 cp → TRPC_SHAPE_UPDATE=1 → 与现文件 diff -u，不收 HEAD diff）

--check-ownership task=E3 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 1 处越界
exit=1
```
⇒ **登记把 §1 那条"由 T-08 独占"的红换成了"要么走通道要么给证据"的红**：红仍是红，且更具体。临时件 `$TEMP/f2/` 已在取证后删除（`ls` 复验 No such file）。

```
### 反确认（既有判据未被放宽，A-35-10②）
$ node tools/boundaries.mjs --check-ownership --task E3            ← 既无 --files 也无 --diff-file
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定
--check-ownership task=E3 无证据（既无 --files 也无 --diff-file）= 无判定，不得声称通过（A-35-10②）
exit=2

### 基线本体一字节未改（F2 未花 E3′ 的额度）
$ sha256sum packages/server/test/trpc-shape.baseline.json
9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7   ← 与 §1 改前、与 E3 报告 §8 三方逐字相同
```

**已知限制（本轮未修，属改判据）**：`--task T-08`（该文件的 **owner**）无 patch 也绿 ——
`checkOwnership` 的 owner 短路（`tools/boundaries.mjs:1572` 的 `if (owners.includes(opts.task)) continue;`）
是既有语义，本轮一字未动，所以通道只约束**非 owner** 路径。⇒ E3′ 若自称 T-08 会绕过门禁，已写成 §4-D 的显式要求 + 待拍板 #1。

## 6. `--self-test` 数字（A-33-4「每条通道各带一个疫苗」）

**改前 139/139 → 改后 146/146，本轮新增 7 条**（全在 `ownershipActionChannels()` 沙盒里跑真 `checkOwnership`，红绿两侧都是真判定，不是打桩）：

```
$ node tools/boundaries.mjs --self-test 2>&1 | grep 通道⑦
OK   A-33-4 通道⑦ baseline-regenerate:A-36-E3：E3 + 只含登记产物的 scoped patch → 放行 — 放行 ／ test/shape.baseline.json：走动作通道 baseline-regenerate:A-36-E3（按实际 diff 判定：+1/-1 行）
OK   A-33-4 通道⑦ 疫苗：未给该任务登记 baselineRegenerateFor（T-11 拿同一份合格再生 patch）→ 红 — …未登记的再生授权…
OK   A-33-4 通道⑦ 疫苗：只在清单里点名生成物、无 patch → 红（要证据，不收"只点名就算过"） — …要证据…
OK   A-33-4 通道⑦ 疫苗：改 spec 本体（产物清单之外）→ 红 — …test/shape.spec.ts 不在登记的产物清单内…
OK   A-33-4 通道⑦ 疫苗：patch 混入清单外文件（HEAD 相对 diff 形状）→ 红（不收 HEAD diff） — …1 个产物清单之外的文件（如 apps/web/package.json）…
OK   A-33-4 通道⑦ 疫苗：生成物在 patch 里 0 行变更 → 红（空授权，A-33-4） — …0 行变更 = 空授权
OK   A-33-4 通道⑦ 疫苗：outputs 未自报 → 拒判 exit 2（缺自报产物清单，宁可红不放行） — …缺自报产物清单，拒绝判定…

boundaries --self-test：146/146 通过
```
沙盒 fixture：`test/shape.{spec.ts,baseline.json}`（花括号二选一的真实形状）+ `test/other.*`（`outputs` 未自报的拒判向）；
6 条判据一一对应用例，没有未测分支（③ 由 rejectCase 覆盖）。

## 7. 出口命令真实输出（终态，一次不落地重跑）

**CMD1** `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server search-history` —— **未跑绿：`@tm/server` 里根本没有名字含 `search-history` 的 spec**（实测输出，不编造）：

```
No test files found, exiting with code 1
filter: search-history
projects: @tm/server
 @tm/server
include: test/**/*.spec.{ts,tsx}, src/**/*.spec.{ts,tsx}
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run --root ../.. --project "@tm/server" search-history
```
全仓 grep 证实：`search-history-service.ts` / `SearchHistoryForbidden` 的引用者只有 `packages/server/test/integration/chat-isolation.spec.ts`
（web 侧只有 `apps/web/src/components/home/search-section.tsx`，无同名 spec）⇒ 任务书给的这条出口命令**指的是一个不存在的测试文件名**。

**CMD1b（同一判据的真实覆盖者，用它代跑并如实标注）**

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server chat-isolation
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests) 4819ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

**CMD2** `pnpm --filter @tm/server typecheck`

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
exit=0                       ← 0 错
```

**CMD3** `node tools/boundaries.mjs --self-test` → `boundaries --self-test：146/146 通过`（§6）
**CMD4** `node tools/boundaries.mjs --copy` → `1/1 条通过，全绿`（`copy-legacy-zero` 0 命中，与 §1 改前同一行数字）
**CMD5（任务 b 的红/绿两条对照）** → §5 的 A（exit=0）/ B（exit=1），另附 C/D（exit=1）与反确认（exit=2）。

## 8. 盘面数字对账表（A-32-9）

| 项 | 简报/预期 | 本轮实测 | 归因 |
|---|---|---|---|
| `--self-test` | 139/139 | **146/146** | +7 = 通道⑦ 的 1 绿 + 5 红 + 1 拒判；原 139 条一字未动 |
| `--copy` | 1/1 绿 | **1/1 绿**（76 处豁免/126 待复核词，数字与改前完全相同） | 任务 a 是注释，且旧串不在 `BANNED_TERMS` |
| `@tm/server typecheck` | 0 错 | **0 错** | 注释改动 |
| `search-history` spec | 任务书假设有 | **不存在**（No test files found） | 出口命令口径问题，见待拍板 #2 |
| `chat-isolation`（真实覆盖者） | — | **25/25 绿** | 判据零变化的证据 |
| 旧串源码命中 | 0 | **0**（`packages/ apps/ tools/`） | 全仓最后一处即本轮这行 |
| 定稿串源码命中 | 2（真值+钉子） | **2** | 未复述、未扩散 |
| 基线 sha | 不得变 | `9cc6b319…` 改前=改后=E3 报告 | **未再生**（E3′ 额度完整保留） |
| `tools/ownership.json` | 只加通道 | 1030 → 1037 行（+7），条目数 116 不变，JSON 合法（node 实解析） | §4-C |
| `tools/boundaries.mjs` | 最小机检 | 2920 → 3003 行（+83；判据本体 12 行 + HELP 4 行 + 用例/fixture/注释 67 行） | §4-B |
| `--check-ownership --task E3`（改前） | 红 | **红 exit=1**（T-08 独占） | §1 |
| 同上（改后 + scoped patch） | 绿 | **绿 exit=0** | §5-A |

本轮实到文件（`git status --porcelain`，只读）：
`packages/server/src/services/search-history-service.ts`、`tools/ownership.json`、`tools/boundaries.mjs`、`.delivery/04-dev-report-F2.md` —— 4 件，全在可写面内（前三件在 git 里都是 `??` 未跟踪，属并行盘面，未做任何 git 写操作）。

## 9. 越界申请 / 待 TPM 拍板

**越界申请：无**（未写任何禁区文件；`packages/server/test/trpc-shape.*` 本体、`packages/shared/**` 全程只读）。

**待 TPM 拍板（4 条，按阻断程度排序）**：

1. **【阻断 E3′ 的操作口径】`--task` 必须钉死为 `E3`**。`--task T-08`（owner）走的是既有 owner 短路，**不经过通道**（§5-末的已知限制）。要把它变成机检得动 `checkOwnership` 的 owner 分支 = 改既有判据，F2 无权做。⇒ 请 TPM 在 E3′ 简报里明文写死"基线再生的出口判据命令用 `--task E3`"，或另裁一条"生成物条目对 owner 也须走通道"（建议批次5 随 `--copy` 扩面一轮一起做）。
2. **【出口命令口径】** 任务书 CMD1 的 `search-history` 在 `@tm/server` 无同名 spec。请确认：是把 T-11 的 web 侧 spec 名字并进来，还是今后统一写 `chat-isolation`（本轮已按实测如实标注，未改任何测试文件）。
3. **【"逐字一致"仍无人守】** `--copy` 的 `BANNED_TERMS` 不含 `FORBIDDEN` 的任何一串 ⇒ A-36-#14① 这类注释漂移**跑不红**，只能靠人肉 grep 发现。建议并入 A-36-#10 已派的 `--copy` 扩面轮：加一条"定稿串在源码里只准出现在 `errors.ts` 真值 + `contracts.spec.ts` 钉子两处"的机检（红向疫苗 = 在任意 server 注释里塞定稿串）。
4. **【"一次性"仍无机检】** `A-36-E3` 用满后条目仍活（批次4 若复用同一裁决号仍会绿）。这正是 `04-tooling-report-T-03-review.md` S1 已登记的欠账（`consumedBy`/`usedAt` 位或"第二次仍判绿 ⇒ 红"的自测），本轮按任务书范围**没有自行发明**；批次4 出口轮（A-36-#11 的第二次再生额度）之前需要它。

## 10. 铁律自查

- **git**：`commit/push/stash/checkout/reset/clean/restore/add` **零执行**；只用了 `git status`/`git diff HEAD -- <单文件>`/`git ls-files`（只读）。工作区他人的未提交改动未清理、未还原。
- **基线**：`TRPC_SHAPE_UPDATE` **零次执行**，sha 三方一致（§5-末）；再生额度完整留给 E3′。
- **数据库**：未在任何 `data.db`（仓库根 / `packages/server/`）上跑写操作或迁移；本轮没跑迁移。
- **冒烟真实性**：§1/§5/§6/§7 的每条输出都是本轮实跑粘贴；CMD1 跑不出来如实写"不存在 + 实测输出 + 替代覆盖者"。
- **临时件**：`%TEMP%/f2/`（2 份 patch）取证后已 `rm -rf` 并复验目录不存在；仓库内无残留文件。
- **CLI 坑**：单文件测试按规避写法 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server <名>` 执行（没用 `test -- <名>`）。
- **判据方向**：只新增机检、未放宽任何既有判据、未新增"无证据也放行"分支；原 139 条自测全绿。
