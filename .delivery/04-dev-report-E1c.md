# 开发报告 — 出口轮 E1c（ownership 通道最后一批）

角色：门禁工具工程师（E1c）
裁决依据：A-35-10② / A-35-11 / A-34-3 / A-33-4 / A-30-10 / A-28-2
**本轮 = E1c 第 2 轮（A-36-18：只补报告，实现零改动）**，另按 A-36-6 补一条 `bounded-edit:A-36-3` 登记（§4·补）；
取证口径按 A-36-13（scoped patch vs HEAD 相对 diff 的红→绿对照必须贴真实输出）
开工前基线：`--self-test` = **128/128 绿**（E1a 交）；`--all` = **18/21 绿 / 3 红**（packages/ui + apps/web 内容债，并行 agent 名下）；`--check-ownership --task T-25` 无证据 = **exit 0**（A-35-10② 要修的坑）

> §4 后半 / §5 / §6 / §7 的 `待补` 已在第 2 轮全部以真实输出补齐；第 2 轮新增 §4·补 与 §8。

---

## §1 交付①：`--check-ownership` 无证据 → exit 2（A-35-10②）

### 现状（修复前）

```
$ node tools/boundaries.mjs --check-ownership --task T-25
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定

--check-ownership task=T-25 触碰 0 个文件 → 无越界
EXIT=0          ← BUG：无证据不得声称通过
```

### 实装锚点

`tools/boundaries.mjs:1924-1927`（`noEvidence` 分支 → `return 2`）+ `:1527`（`touched.length === 0` 时只记 NOTE 不作判定）
+ `:1628`（`checkOwnership` 返回值新增 `noEvidence` 字段）+ `:1932`（原"无越界"总结行只能在**有证据**时走到）。
HELP：`:1728`「既无 `--files` 也无 `--diff-file` = 无证据 → 退出码 2（A-35-10②：无判定不得声称通过）」。

### 修复后真实输出（本轮实跑）

```
$ node tools/boundaries.mjs --check-ownership --task T-25
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定

--check-ownership task=T-25 无证据（既无 --files 也无 --diff-file）= 无判定，不得声称通过（A-35-10②）
exit=2
```

第二条疫苗（任务号都没有 = 连"给谁判定"都不成立，仍是 2 而不是 0）：

```
$ node tools/boundaries.mjs --check-ownership
--check-ownership 需要 --task T-XX（当前任务号），或给 env TM_TASK
exit=2
```

反向确认（给证据就不会 2）：`--task T-25 --files packages/shared/src/schema/tables.ts --diff-file <纯追加 patch>`
→ `exit=0`（见 §2 after）。**A-35-10② 要求的 `grep` 前置已做**：全仓 `check-ownership` 调用点均在
`.delivery/*.md` 的报告文本里，无任何脚本以"无参数 = 通过"为前提，改后不产生回归。

---

## §2 交付②：新增 kind `block-append:<裁决号>`（A-35-11）

用途：§10.4 第 9 行 T-25（批次4 开工硬前置）。判据 = diff **只在声明块内追加行**、0 既有行变更、追加行数封顶由条目自报（缺自报 = 拒绝判定）。

### 实装锚点

- 判定函数 `tools/boundaries.mjs:1432-1466`（`judgeBlockAppend`），分派 `:1480`，三态出口 `:1486-1490`
  （`null`=放行 / `string`=越界 exit 1 / `{reject:true}`=证据形状不符 exit 2），exit 映射 `:1928-1931`。
- 块几何 `namedBlockRanges:1278`（按 `const|let|var|function|class|interface <符号>` 找声明行，再按
  `braceDepthDelta` 配平到块尾），块行坐标换算 `insertionGaps:1380` + `gapsOutside:1387`（本轮补，见「本轮修掉的三个洞」）。
- 登记面（并行 E1b 名下，我只读）：`tools/ownership.json:148`（`packages/shared/src/schema/**`，
  `actions:["block-append:A-35-11"]` :153，`blockAppendFor.T-25.blocks=["assessmentCache","columnDdl"]`
  `maxAppendLines:15` :154-157）、`:164`（`db/**`，blocks=三个 AssessmentDB 实现/接口，`:173` `maxAppendLines:20`）、
  `:203`（`scripts/migrate.ts`，blocks=`ALL_MIGRATIONS`，`:212` `maxAppendLines:4`）。
- HELP `:1724`；self-test 用例 8 条（`:2639-2654` 区段，通道⑥）。

### 判据（写死在代码里的五条）

1. patch 里没有这个文件 → 红「要证据：清单里点个名不构成授权，也不构成违规」；
2. 任何删除/改写行 → 红（0 既有行变更是硬条件）；
3. 0 行变更 → 红（A-33-4 禁止不咬人的空壳）；
4. 条目无 `blockAppendFor.<任务>` 或 `maxAppendLines` 非数字 或 `blocks` 为空 → **拒判 exit 2**
   （缺自报封顶 = 宁可红，不发明人肉行数，A-35-11）；
5. 追加行数 > `maxAppendLines` → 红；追加行不在声明块的**改动前**行区间内 → 红。

### T-25 三条红 → 绿：改前/改后各一次真实输出

改前（E1b 报告 P4 原样引用，`.delivery/04-dev-report-E1b.md:63-66`）：

```
### P4(时序门 A-33-2): T-25 碰 schema/db/migrate.ts → 三条全红（预期，见「待 TPM 拍板项 #2」）
RED  packages/shared/src/schema/tables.ts 由 T-06 独占（当前任务 T-25）— …
RED  packages/server/src/db/sqlite.ts 由 T-06 独占（当前任务 T-25）— …
RED  packages/server/src/scripts/migrate.ts 由 T-06 独占（当前任务 T-25）— …
```

同一份 patch 的严格改前/改后对照（**输入完全相同**，只把登记撤掉再判一次；注入点是 A-35-10① 的
`--ownership-file`，正式命令不传）：

```
# 探针 patch（临时目录，仓库内零新增；`git apply --check` 实测 rc=0 后才用）
#   t25-01-tables-append.patch   +1/-0，插在 assessmentCache 块内（改动前 333-344 行）
#   t25-03-db-sqlite-append.patch +1/-0，插在 SqliteAssessmentDB 块内（改动前 656-685 行）

$ node tools/boundaries.mjs --check-ownership --task T-25 --diff-file <t25-01> --ownership-file <撤掉 3 处 block-append 登记的表>
TABLE C:\...\ownership-no-blockappend.json  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）
RED  packages/shared/src/schema/tables.ts 由 T-06 独占（当前任务 T-25）— §10.3：DDL 单一源…
--check-ownership task=T-25 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界     exit=1

$ node tools/boundaries.mjs --check-ownership --task T-25 --diff-file <t25-01>
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE packages/shared/src/schema/tables.ts：走动作通道 block-append:A-35-11（按实际 diff 判定：+1/-0 行）
--check-ownership task=T-25 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界        exit=0

$ node tools/boundaries.mjs --check-ownership --task T-25 --diff-file <t25-03>     # db/**
NOTE packages/server/src/db/sqlite.ts：走动作通道 block-append:A-35-11（按实际 diff 判定：+1/-0 行）
--check-ownership task=T-25 … → 无越界                                            exit=0
（db/types.ts 的 AssessmentDB 接口块同形，同样 +1/-0 → exit=0）
```

### 三种形态必须证明（用户点名的下限）

```
① 纯插入（块内追加 1 行）                       → exit=0 绿（上面 t25-01/02/03）
② patch 碰到既有行（改 indexes 那行再追加）      → exit=1 红：
RED  packages/shared/src/schema/tables.ts（通道 block-append:A-35-11 不通过）：block-append:A-35-11 只许纯追加（0 既有行变更）：patch 里有 1 行删除/改写（如 packages/shared/src/schema/tables.ts:343 "indexes: [{ columns: ['word', 'qtype'], "）
③ 缺自报封顶（同一份 t25-01，换成没登记的 T-26） → exit=2 拒判：
REJECT  packages/shared/src/schema/tables.ts（通道 block-append:A-35-11 拒判）：block-append:A-35-11 未给 T-26 声明 blockAppendFor.T-26 = 缺自报封顶，拒绝判定（A-35-11：宁可红，不发明人肉行数）
--check-ownership task=T-26 1 处拒判（证据形状不符，非越界判定，需重新提供正确证据）→ 退出码 2（A-35-1③ / A-35-11）
```

另两条疫苗（超出下限，防"通道变空壳"）：

```
追加 16 行 > 自报封顶 15                        → exit=1 红：
RED  …：block-append:A-35-11 允许 ≤15 行块内追加，实际 16 行
紧贴 assessmentCache 块上方插一行（改动前 332 行） → exit=1 红：
RED  …：block-append:A-35-11：1 行追加不在声明块内（assessmentCache / columnDdl，块区间按改动前行坐标算，块上方/块下方插行都算块外）：packages/shared/src/schema/tables.ts:333 "const e1cProbeAbove = 1;"
```

### `scripts/migrate.ts`：收口轮卡住的那条，实测**仍红**，且不是判据太严

```
$ … --task T-25 --diff-file <t25-06-migrate-import-only>   # 只加 m007 的 import 行
RED  …：block-append:A-35-11：1 行追加不在声明块内（ALL_MIGRATIONS，…）：packages/server/src/scripts/migrate.ts:49 "import { migration as m007 } from '../db…"   exit=1

$ … --task T-25 --diff-file <t25-05-migrate-expand>        # 展开数组 + 追加 m007（1 删 + 10 增，git apply --check 通过）
RED  …：block-append:A-35-11 只许纯追加（0 既有行变更）：patch 里有 1 行删除/改写（如 packages/server/src/scripts/migrate.ts:57 "export const ALL_MIGRATIONS: Migration[]"）   exit=1
```

现场证据（这就是物理事实，不是判据写严）：

```
$ sed -n '55,60p' packages/server/src/scripts/migrate.ts
/** 执行顺序 = 数组顺序（name 字典序一致性由静态自检断言）。 */
export const ALL_MIGRATIONS: Migration[] = [m000, m001, m002, m003, m004, m005, m006];
```

`namedBlockRanges` 实测该块 = **改动前 57-57 行，单行**。单行块的"块内纯追加"在 unified diff 上无解：
要么改 57 行本身（= 有删除行 → 条件 2 红），要么在块外插（→ 条件 5 红）。条目里 E1b 已把这件事写在
`successorConstraint`（`ownership.json:216`「⚠ 当前 ALL_MIGRATIONS 是单行数组…展开步骤须走另一授权通道
（批次4 开工前由 TPM 确认实现策略）」）。**我没有为了让它绿而放宽判据**（放宽办法是现成的：把 blocks 换成
文件级、或允许 1 行既有变更 —— 两者都会把这条通道变成不咬人的空壳）。处置见 §7 待拍板 #1。

### 本轮修掉的三个洞（全部是收紧方向，实现在 `tools/boundaries.mjs`）

| # | 洞 | 症状 | 修法 | 疫苗 |
|---|---|---|---|---|
| 1 | `parsePatch:1149` 不在 `diff --git` 处复位 `cur` | 多文件合并 patch 里，后一文件段的 `--- a/…` 头被记成**前一文件的删除行** → 纯追加合并即假红（T-04 报告 E-10/X-2 早记过同一条） | `diff --git` → `cur=null`；`+++ /dev/null` 不建档 | self-test `patch 解析：两个文件的纯追加合并成一份真实 git diff 形状 → 各自放行`（`:2561` 区段） |
| 2 | `parsePatch:1155` 同一路径第二个 `+++` 头**覆盖**前一个 | 把一个文件的改动拆成两个文件头，幅度只数最后一段 = 假绿 | 累加不覆盖 | self-test `同一文件拆成两个 +++ 头重复拼接 → 幅度累加 8 行 > 4 判红`（`:2666`） |
| 3 | `judgeBlockAppend` / `judgeAddScriptLinesOnly` 拿**改动后**行号去查**改动前**的块行集合 | 紧贴块上方插一行时 `line-1` 正好等于块首行索引 → **假绿放行** | 新增 `insertionGaps`/`gapsOutside`（`:1380-1393`），把每条形如纯插入的新增行换算回改动前的"上/下相邻既有行"再判块内 | self-test `通道⑥ 疫苗：紧贴块上方插一行`（`:2654`）、`通道④ 疫苗：紧贴 "scripts" 块上方插顶层键`（`:2644`） |

洞 #3 的"改前确实假绿"不是口头断言，用改前表达式对**真实仓库文件 + 真实 patch**跑过反证
（临时脚本 `old-vs-new.mjs`，只 import 未改动的 `parsePatch` 与块几何）：

```
── 通道④ add-script-lines-only（旧判据 `!block.has(a.line - 1)`，取改动前文件的块行集合）
  x3-scripts-only.patch: +2/-0 新增落在改动后行 6,7 → 旧判据 stray=0 【放行＝假绿】
  x5-probe-above-scripts.patch: +1/-0 新增落在改动后行 5 → 旧判据 stray=0 【放行＝假绿】
── 通道⑤ block-append（同一个"拿改动后行号查改动前块"的形状）
  t25-01-tables-append.patch (+1/-0，块=改动前 assessmentCache:333-344 columnDdl:116-138 1-based)
     新增的改动后行号 342 → 旧判据 stray=0 【放行＝假绿】 ／ 新判据 stray=0 放行
  t25-08-above-block.patch (+1/-0，块=改动前 assessmentCache:333-344 columnDdl:116-138 1-based)
     新增的改动后行号 333 → 旧判据 stray=0 【放行＝假绿】 ／ 新判据 stray=1 红
```

读法：t25-01（合法块内追加）改前改后都是放行 ⇒ 修复没有把合规改动判红；t25-08 / x5（块上方插行）改前放行、
改后红 ⇒ 咬到的正是原来漏掉的那一类。

---

## §3 交付③：bounded-edit 脏工作区基线污染修复（T-11-fix3 §4.3）

问题：`judgeBoundedEdit:1310` 按 patch 全部增删行计幅度，HEAD 相对 diff 混入他人未提交改动时误红。

裁决口径：证据基线必须是 agent 自证 diff（改前快照 → 改后），经 `--diff-file` 传入，不收 HEAD diff。

实现要求：
- 走已有 `--diff-file` 通道（A-24-1 口径，不另写一套）
- 明显是 HEAD diff（包含大量非本轮既有行变更）→ 拒绝判定 = exit 2
- HELP 与断言描述写清"bounded-edit 要自证 diff，不收 HEAD diff"

### 实装锚点

`tools/boundaries.mjs:1339-1368`（`judgeBoundedEdit`，三态语义写在 `:1347-1350`）：

- `:1353-1356` 无 `maxDiffLinesFor.<任务>` = 无上限授权 → 红（不发明人肉行数）；
- `:1357` patch 里没有这个文件 → 红「清单里点个名不构成授权，也不构成违规」；
- `:1361-1363` **删除行数单独超过整个预算 → 判为"证据形状不符"而非"你超幅了"** → `{reject:true}` → exit 2。
  这一条就是"不收 HEAD diff"的机检形式：HEAD 相对 diff 的特征是既有行大量被他人改写，
  scoped patch 的删除行数不可能超过自报上限；
- `:1366` 幅度超预算 → 红（exit 1），红因里同样写明"若混入他人改动请改用自证 scoped patch"。

HELP：`:1717-1722`（`--check-ownership` 段）与 `:1738`（`--diff-file` 说明）都写明
**bounded-edit 要 agent 自证 scoped diff，不收 HEAD diff**；断言描述同口径。
`tools/ownership.json` 侧：`apps/web/src/app/(user)/profile/page.tsx` 条目 `:518`、
`actions:["bounded-edit:A-35-1"]` `:523`、`maxDiffLinesFor:{"T-11":2}` `:524`，
证据口径写在 `reason`（`:521` 末句「`--diff-file` 必须是 agent 自证 scoped patch，不收 HEAD 相对 diff」）。

### 为什么必须换基线（现场事实，不是假设）

`profile/page.tsx` 的 HEAD 相对 diff 实测 7 行增删（其中含他人未提交 import 改动），
而 A-35-1③ 授权 T-11 的幅度是 **2 行**。用 HEAD diff 当基线 ⇒ 一次"只改 1 行"的合法授权被算成 7 行 ⇒ 误红。

### 疫苗两步（真实输出）

疫苗①：喂 HEAD 相对 diff → 必**拒判 exit 2**（不是红，因为"越界"这个结论本身不可信）

```
$ node tools/boundaries.mjs --check-ownership --task T-11 --files "apps/web/src/app/(user)/profile/page.tsx" --diff-file <git diff HEAD 里该文件的段>
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
REJECT  apps/web/src/app/(user)/profile/page.tsx（通道 bounded-edit:A-35-1 拒判）：bounded-edit:A-35-1 拒判：patch 含 7 行删除/改写，远超授权上限 2 行 —— 证据疑似 HEAD 相对 diff（混入他人未提交改动），请传入 agent 自证 scoped patch（改前快照 → 改后，仅含本轮增量），不收 HEAD diff

--check-ownership task=T-11 1 处拒判（证据形状不符，非越界判定，需重新提供正确证据）→ 退出码 2（A-35-1③ / A-35-11）
exit=2

$ … --task T-10 --files packages/server/src/app.ts --diff-file <app.ts 的 HEAD diff（240 行）>
REJECT  packages/server/src/app.ts（通道 bounded-edit:A-33-7 拒判）：bounded-edit:A-33-7 拒判：patch 含 21 行删除/改写，远超授权上限 2 行 —— …   exit=2
```

疫苗②：喂 agent 自证 scoped 单行 patch → 必绿

```
$ node tools/boundaries.mjs --check-ownership --task T-11 --files "apps/web/src/app/(user)/profile/page.tsx" --diff-file <scoped：+1/-1，只动 92 行 dailyGoal→daily_goal>
NOTE apps/web/src/app/(user)/profile/page.tsx：走动作通道 bounded-edit:A-35-1（按实际 diff 判定：+1/-1 行）
--check-ownership task=T-11 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 无越界
exit=0
```

疫苗③（比"拒判"更贴用户点名的"喂含他人 6 行的 patch 必红"）：把他人 4 行混进 scoped 证据里，
但删除行数**没有**超过预算 ⇒ 不走拒判，走幅度红，exit 1：

```
$ … --task T-10 --files packages/server/src/app.ts --diff-file <v5-t10-plus-others：本人 2 行 + 他人 2 行 = 4 行>
RED  packages/server/src/app.ts（通道 bounded-edit:A-33-7 不通过）：bounded-edit:A-33-7 允许 ≤2 行实际变更，patch 里是 4 行（若混入他人改动请改用自证 scoped patch；不收 HEAD diff）
--check-ownership task=T-10 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1
```

三条合起来构成完整梯度：**形状可疑 → 2；形状合规但超幅 → 1；形状合规且在幅内 → 0**。
scoped patch 的"真实性"用 `grep -F -x -f <真实 HEAD diff>` 核过（v4 2/2 行、v5 4/4 行、v6 2/2 行、v7 12/12 行
都逐字存在于真实 HEAD diff 里，我只做了按文件的裁剪，没有手写不存在于工作树的行）。

---

## §4 交付④：app.ts 登记 + add-script-lines-only 复验（A-35-11 / A-34-3）

### app.ts：`bounded-edit:A-33-7` + `maxDiffLinesFor:{"T-10":2}`（T-10r3 那条红转绿）

### 证据产法（本轮统一口径，零改工作区）

三条 scoped patch 全部按"**改动前快照 `cp` 到 `os.tmpdir()` 下 → 与现文件 `diff -u`**"产出，
仓库内不新增、不修改任何文件（`--diff-file` 只喂临时目录里的 patch）：

| 临时产物 | 产法 | 实测幅度 |
|---|---|---|
| `%TEMP%/e1c2/t10-scoped-app.patch` | `cp packages/server/src/app.ts e1c2/app-before.ts` → 把临时副本 268 行改回 T-10r3 改动前的写法 → `diff -u --label a/… --label b/… app-before.ts 现文件` | `+1/-1` = **2 行** |
| `%TEMP%/e1c2/t10-app-HEAD.diff` | `git diff HEAD -- packages/server/src/app.ts`（只读命令，不 add/不 stash） | `git apply --numstat` = **140 增 / 21 删**，文件共 **240 行** |
| `%TEMP%/e1c2/ownership-no-app-a337.json` | 读仓库表 → 只删 `packages/server/src/app.ts` 条目的 `actions` + `maxDiffLinesFor` 两个键 → 写临时表（A-33-4 的 `--ownership-file` 注入点，正式命令不传） | 用于"登记前"那一次 |

临时副本第 268 行的"改动前"形状不是我编的，四条 `grep -F -x`（整行逐字）实测：

```
$ git show HEAD:packages/server/src/app.ts | grep -n -F -x -- "  app.route('/', createReviewRouter(db, agentDeps, llmRouter));"
149:  app.route('/', createReviewRouter(db, agentDeps, llmRouter));     ← HEAD 里确有此行
$ grep -n -F -x -- "  app.route('/', createReviewRouter(db, { events }));" packages/server/src/app.ts
268:  app.route('/', createReviewRouter(db, { events }));               ← 工作树确有此行
$ grep -n -F -x -- "-  app.route('/', createReviewRouter(db, agentDeps, llmRouter));" t10-app-HEAD.diff
229:-  app.route('/', createReviewRouter(db, agentDeps, llmRouter));    ← 两行都逐字在 HEAD diff 里
$ grep -n -F -x -- "+  app.route('/', createReviewRouter(db, { events }));" t10-app-HEAD.diff
230:+  app.route('/', createReviewRouter(db, { events }));
```

即：patch 的两行都是 HEAD/工作树的真实内容，本轮只是把"属于 T-10r3 的那一处改动"单独剥成 2 行的增量
（他人 160 行不在 patch 里），没有手写不存在于仓库的行。

产出的 patch 全文：

```diff
--- a/packages/server/src/app.ts
+++ b/packages/server/src/app.ts
@@ -265,7 +265,7 @@
   // Phase 2：Multi-Agent API（新增，不影响旧 API）
   app.route('/', createAgentRouter(agentDeps, llmRouter, lookup, config));
   app.route('/', createTutorRouter(agentDeps, llmRouter));
-  app.route('/', createReviewRouter(db, agentDeps, llmRouter));
+  app.route('/', createReviewRouter(db, { events }));
 
   // ===== 静态文件：只服务专用 public 目录（绝不指向仓库根，避免 .env/数据库/备份外泄） =====
   app.get('/admin', (c) => {
```

### 登记前红 → 登记后绿（真实输出）

cap 行 = `tools/ownership.json:566-567`（`"actions": ["bounded-edit:A-33-7"]` / `"maxDiffLinesFor": { "T-10": 2 }`；
本轮 §4·补 之前它是 `:557-558`，下移 9 行的事见 §4·补 末"行号漂移"注）
⇒ **上限 2 行，实测算得 2 行（+1/-1）**，恰好落在上限内。

```
# 登记前：注入"撤掉本条 actions/maxDiffLinesFor"的表（判据一字未变，只是条目没登记）
$ node tools/boundaries.mjs --check-ownership --task T-10 --files packages/server/src/app.ts \
    --diff-file %TEMP%/e1c2/t10-scoped-app.patch --ownership-file %TEMP%/e1c2/ownership-no-app-a337.json
TABLE C:\Users\曹怡明\AppData\Local\Temp\e1c2\ownership-no-app-a337.json  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）
PATCH 1 个文件的 diff 参与判定
RED  packages/server/src/app.ts 由 T-07 独占（当前任务 T-10）— §10.4 第 7 行：批次2 T-08 只允许改 `import { appRouter }` 的 1 行；批次3 起 T-10r3 按 A-33-7 授权改装配点（≤2 行），A-35-11 登记此通道使 T-10r3 那条红转绿。⚠ A-35-11：批次3 之后新任务须走新登记，不得复用本条目

--check-ownership task=T-10 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1

# 登记后：同一份 patch、同一个任务号，只把表换回仓库那份
$ node tools/boundaries.mjs --check-ownership --task T-10 --files packages/server/src/app.ts \
    --diff-file %TEMP%/e1c2/t10-scoped-app.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/src/app.ts：走动作通道 bounded-edit:A-33-7（按实际 diff 判定：+1/-1 行）

--check-ownership task=T-10 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 无越界
exit=0
```

两次输入完全相同，差别只有登记表 ⇒ 转绿的原因是登记，不是判据。绿输出里 `NOTE` 点名走了哪条通道与实际行数
（A-36-13 要求的"绿也要说清走了哪条通道"）。

### A-36-13 点名的对照取证：同一个文件，两种证据两种结论

| 证据 | 文件 | cap（登记行） | 实测算得 | 判定 | 退出码 |
|---|---|---|---|---|---|
| agent 自证 scoped patch（`t10-scoped-app.patch`） | `packages/server/src/app.ts` | `ownership.json:567` `"maxDiffLinesFor": { "T-10": 2 }` ⇒ **上限 2 行** | **+1/-1 = 2 行**（`git apply --check -R` rc=0 ⇒ 形状合法，工作树已是改后态） | `NOTE 走动作通道 bounded-edit:A-33-7` → 无越界 | **0** |
| HEAD 相对 diff（`t10-app-HEAD.diff` = `git diff HEAD -- 该文件`） | 同上 | 同上 ⇒ 2 行 | **140 增 / 21 删**（`git apply --numstat` rc=0），diff 文件共 240 行 | `REJECT 拒判`（删除行 21 > cap 2 ⇒ 走 `boundaries.mjs:1361-1362` 的"证据形状不符"分支） | **2** |

```
$ node tools/boundaries.mjs --check-ownership --task T-10 --files packages/server/src/app.ts --diff-file %TEMP%/e1c2/t10-app-HEAD.diff
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
REJECT  packages/server/src/app.ts（通道 bounded-edit:A-33-7 拒判）：bounded-edit:A-33-7 拒判：patch 含 21 行删除/改写，远超授权上限 2 行 —— 证据疑似 HEAD 相对 diff（混入他人未提交改动），请传入 agent 自证 scoped patch（改前快照 → 改后，仅含本轮增量），不收 HEAD diff

--check-ownership task=T-10 1 处拒判（证据形状不符，非越界判定，需重新提供正确证据）→ 退出码 2（A-35-1③ / A-35-11）
exit=2
```

**为什么这里必须是 2 而不是 1**：HEAD 相对 diff 里那 21 行删除绝大多数是并行 agent 的账（`agentDeps`/`llmRouter`
签名、静态文件段等），拿它当"我改了多少"得出的"越界"结论本身不可信 ⇒ 拒判并要求重新给正确形状的证据
（A-35-1③ / A-35-11 的口径，`boundaries.mjs:1358-1363` 注释同口径）。A-36-13 选 (a) 的等价实现 = 这一条机检，
**不做"扣掉前人行数"的行减法**。

### 疫苗：登记之后 cap=2 仍然咬人（A-33-4「不许有不咬人的空壳」）

`packages/server/src/app.ts` 的登记刚加完，先用一份**合成超幅 patch** 复证它没被放开：把临时副本
`app-fake50.ts`（现文件 + 50 行 filler，`git apply --check` rc=0 ⇒ 形状合法）当"改后态"产 patch ⇒ 纯新增、
删除行 0（不会被误判成 HEAD diff）⇒ 必须走**幅度红**而不是拒判：

```
$ node tools/boundaries.mjs --check-ownership --task T-10 --files packages/server/src/app.ts --diff-file %TEMP%/e1c2/t10-fake50.patch
RED  packages/server/src/app.ts（通道 bounded-edit:A-33-7 不通过）：bounded-edit:A-33-7 允许 ≤2 行实际变更，patch 里是 51 行（若混入他人改动请改用自证 scoped patch；不收 HEAD diff）
--check-ownership task=T-10 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1
```

（51 = 50 行 filler + diff 对齐时带出的 1 行空行，`git apply --numstat` 实测 `51 0`。）
同一份表的对照：cap 2 放行真实规模的 2 行（上面 0），咬住 51 行（这里 1），拒收 21 行删除的 HEAD diff（那里 2）
⇒ **梯度 0/1/2 三条都活着，登记没有把它变成"这个文件随便改"**。

### apps/web/package.json `add-script-lines-only:A-34-3` 复验

#### ① 真实 `git diff HEAD -- apps/web/package.json`（本轮实跑，只读命令）

`git apply --numstat` 实测该段 = **10 增 / 6 删**。diff 里只有第 1 个 hunk 是 A-30-5 授权 E2 干的
（`scripts` 块加 `//test` + `test` 两行，附带把块尾 `lint` 行补逗号），后 3 个 hunk 全是别人的账
（依赖字典序重排 = T-04 名下，`@playwright/test` = E2 之外的另一笔）：

```diff
@@ -7,7 +7,9 @@
     "build": "next build",
     "start": "next start -p 3000",
     "typecheck": "tsc --noEmit",
-    "lint": "next lint --max-warnings=0"
+    "lint": "next lint --max-warnings=0",
+    "//test": "A-30-5（出口轮 E2）：本包此前没有 test 脚本，且根 vitest.workspace.ts 缺 @tm/web project，`apps/web/test/**` 在 `pnpm test` 里静默不跑。写法与其他四包一致：`--root ../..` 才能读到仓库根的装配文件，项目根由 vitest.workspace.ts 的绝对路径钉死。",
+    "test": "vitest run --root ../.. --project @tm/web"
   },
   "dependencies": {
@@ -23,7 +25,9 @@
     "@tanstack/react-query": "^5.59.0",
+    "@tm/server": "workspace:*",
     "@tm/shared": "workspace:*",
+    "@tm/ui": "workspace:*",
@@ -33,14 +37,14 @@            ← 依赖整体按字典序重排（4 删 4 增，非 E2 名下）
-    "sonner": "^1.7.0",
-    "tailwind-merge": "^2.5.4",
-    "@tm/server": "workspace:*",
-    "recharts": "^2.13.0",
     "react-markdown": "^9.0.1",
-    "remark-gfm": "^4.0.0"
+    "recharts": "^2.13.0",
+    "remark-gfm": "^4.0.0",
+    "sonner": "^1.7.0",
+    "tailwind-merge": "^2.5.4"
   },
   "devDependencies": {
+    "@playwright/test": "^1.63.0",
```

⇒ **整份 HEAD diff 直接喂进去必须红**（不是"通道没登记"，是它里面确实有依赖行删改）：

```
$ node tools/boundaries.mjs --check-ownership --task E2 --files apps/web/package.json --diff-file %TEMP%/e1c2/pkg-HEAD.diff
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：add-script-lines-only:A-34-3 只许纯新增脚本行：patch 里有 6 行删除/改写（如 apps/web/package.json:10 ""lint": "next lint --max-warnings=0""）—— 改依赖行/版本号一律算越界

--check-ownership task=E2 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1
```

通道**没有**把这个文件变成"随便改"（A-34-3 的"仍然咬人"要求）。

#### ② 复验：只增 `scripts` 块内的行 → 绿；碰依赖行 → 红（同一判据、同一任务号）

两条 patch 都按"`cp` 现文件到临时目录 → 在临时副本上做还原 → 与现文件 `diff -u`"产出：

- `pkg-pure-insert-one.patch`：临时副本删掉第 11 行（`//test` 注释行）→ 与现文件比 = **纯插入 1 行，落点在 `scripts` 块内**（现文件 10/12 行都以逗号结尾，插它俩中间不需要改既有行）；
- `pkg-dep-insert.patch`：临时副本删掉第 15 行（`"@radix-ui/react-avatar": "^1.1.1",`）→ **纯插入 1 行，落点在 `dependencies` 块内**，且**该行内容是仓库现存的真实依赖行**，不是我编的假依赖。

```
$ node tools/boundaries.mjs --check-ownership --task E2 --files apps/web/package.json --diff-file %TEMP%/e1c2/pkg-pure-insert-one.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE apps/web/package.json：走动作通道 add-script-lines-only:A-34-3（按实际 diff 判定：+1/-0 行）

--check-ownership task=E2 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 无越界
exit=0                                    ← 块内纯新增：放行

$ node tools/boundaries.mjs --check-ownership --task E2 --files apps/web/package.json --diff-file %TEMP%/e1c2/pkg-dep-insert.patch
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：add-script-lines-only:A-34-3：1 行新增不在 scripts 块内（dependencies/devDependencies/版本号/块上方插行都算越界）：apps/web/package.json:15 ""@radix-ui/react-avatar": "^1.1.1","

--check-ownership task=E2 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1                                    ← 同样是"纯插入"，插进 dependencies 就咬：A-4 的依赖面一寸未让
```

（`dependencies` 块内插行在 T-12/T-15/T-16 名下会经 A-35-11 的并集回落走通 A-4 那条 `add-dependency-lines-only`，
在 E2 名下不回落 —— 四象限实测见 E1b 报告 D-1/D-2，本轮未重复。）

#### ③ ⚠ 复验暴露的一条真实缺口（不改判据，交 TPM）：E2 落地的那笔增量在本通道下**判不出绿**

把 E2 的增量按**它实际落地的形状**还原成 scoped patch（临时副本删 11/12 两行 + 去掉 `lint` 行的尾逗号 →
与现文件比 = `+3/-1`）：

```
$ node tools/boundaries.mjs --check-ownership --task E2 --files apps/web/package.json --diff-file %TEMP%/e1c2/pkg-e2-real.patch
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：add-script-lines-only:A-34-3 只许纯新增脚本行：patch 里有 1 行删除/改写（如 apps/web/package.json:10 ""lint": "next lint --max-warnings=0""）—— 改依赖行/版本号一律算越界
exit=1
```

原因不是判据写严，是 JSON 的语法事实：E2 把新键加在 `scripts` 块**尾部**，就得给原块尾行补逗号 ⇒
unified diff 必然出现 1 行"删除+改写"。**同一份内容的等价写法**（把两行插在 `lint` 行之前，见 ② 的绿例）
在本通道下纯插入成立、判绿。三条出路都写在 §7 待拍板 #3，我**没有**为了让它绿去放宽判据
（放宽办法现成：允许"仅尾逗号差异"的既有行变更 —— 那要引入"逐字符比较两行"的新机检，且会把"改依赖行版本号"
与"补逗号"混进同一扇门，正是 A-33-4 禁止的空壳化方向）。

---

## §4·补 E1c 第 2 轮新增登记：`bounded-edit:A-36-3`（A-36-6 派发 / T-07-fix3 §8-② 上报）

本轮唯一一处 `tools/**` 改动 = **`tools/ownership.json` 加一条条目**（判据文件 `tools/boundaries.mjs` 一字未动，
`--self-test` 用例数因此不变）。补的是 T-07-fix3 §8-② 报的缺口：A-36-6 授权 T-07 微轮对
`packages/shared/src/contracts/auth.ts` 走 `bounded-edit:A-36-3`，但登记表里没有这一行动作通道 ⇒
`--check-ownership --task T-07` 按字面判 1 处独占红（其报告 §6-1 已把那条红原样交回，未自行放宽）。

### 上限怎么来的（不凭手感）

`packages/shared/src/contracts/auth.ts` 在 git 里是**未跟踪**状态（本轮实测：
`git status --porcelain packages/shared` 第 4 行 = `?? packages/shared/src/contracts/`）⇒ HEAD 相对 diff 按定义无输出，
T-07 那轮的"改前快照"未持久化 ⇒ 唯一可核的规模出处 = 其报告 §1-3 贴的 `git diff --no-index -U0` 真实输出。
本轮把它的**六个 hunk 头逐段相加**（`-U0` 的 hunk 头即精确行数，与正文是否被"节选"无关）：

| hunk 头 | 删除 | 新增 | 改后行号是否能在现文件复核 |
|---|---|---|---|
| `@@ -8 +8,3 @@` | 1 | 3 | 现文件 8-10 行 = 那三行注释 ✅ |
| `@@ -15,2 +17,22 @@` | 2 | 22 | 现文件 17 行起 = `/**` 展示串注释块 ✅ |
| `@@ -23 +45,16 @@` | 1 | 16 | 现文件 45 行起 = 登录面注释块 ✅ |
| `@@ -26 +62,0 @@` | 1 | 0 | — |
| `@@ -27,0 +64 @@` | 0 | 1 | 现文件 64 行逐字 = `  password: z.string().optional(),` ✅ |
| `@@ -42 +79 @@` | 1 | 1 | 现文件 79 行逐字 = `export const SendCodeInputSchema = z.object({ phone: SendCodePhoneSchema });` ✅ |
| **合计** | **6** | **43** | ⇒ 总规模 **49 行**，与其 §1-1 表格自报的 `+43 / -6 = 49` 一致 |

**cap = 49**（能容纳该规模的最小值本身；**没有**向上放大成 60/100 之类的"怎么都过"数字，理由见 §4·补末段）。

### 登记内容（`tools/ownership.json:126-134`，紧挨 `contracts/**` 条目；cap 行 = `:133`）

```json
{
  "path": "packages/shared/src/contracts/auth.ts",
  "owner": "T-03",
  "readers": ["T-07"],
  "reason": "依据 A-36-6：… owner = T-07 微轮，对本文件（shared 凭据契约）走动作通道 bounded-edit:A-36-3 …⚠ 这是一次性窄授权 … 49 = 本轮该文件 agent 自证 scoped patch 的实测规模 … 上限即取该最小可容纳值、不加余量 …",
  "handoff": true,
  "actions": ["bounded-edit:A-36-3"],
  "maxDiffLinesFor": { "T-07": 49 }
}
```

`owner` 仍是 **T-03**（`contracts/**` 条目一字未动），T-07 只以 `readers` + 一条按实际 diff 判定的窄通道出现；
`matchOwnership:1065-1072` 按 `path.length` 降序排序 ⇒ 精确路径条目优先于 `contracts/**`，不需要动别的条目。
JSON 合法性实测：`node -e "JSON.parse(...)"` → `ownership.json JSON OK`。

⚠ **行号漂移**：本条目占 9 行（`:126-134`），自 126 行起 `tools/ownership.json` 的后所有行号整体 +9。
本报告 §1/§2/§3 是上一轮写的，其中引用的 `ownership.json:148 / :164 / :203 / :518 / :523 / :524 / :557-558`
按现表应读作 `:157 / :173 / :212 / :527 / :532 / :533 / :566-567`（本轮已实测 `bounded-edit:A-35-1` 在 `:532`、
`bounded-edit:A-33-7` 在 `:566`）。`tools/boundaries.mjs` 的行号引用不受影响（该文件本轮一字未动）。

### 疫苗三条（真实输出，临时 patch 建在 `%TEMP%/e1c2/`，用完删；工作区零改动）

规模与 T-07 逐字对齐：`+43/-6 = 49`（新增 43 行**全部取自现文件真实行**，6 个删除行是临时副本里的
unique filler —— 因未跟踪文件无 HEAD 基线，只能构造**等规模**合成 patch；这一点如实记在下面"给测试的提示"里）。
超上限那一条 = `+50/-0`（删除行为 0 ⇒ 不会撞"证据形状不符"分支，逼判定走**幅度红**）。

```
$ node tools/boundaries.mjs --check-ownership --task T-07 --files packages/shared/src/contracts/auth.ts \
    --diff-file %TEMP%/e1c2/a363-scale49.patch --ownership-file %TEMP%/e1c2/ownership-no-a363.json
TABLE C:\Users\曹怡明\AppData\Local\Temp\e1c2\ownership-no-a363.json  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）
PATCH 1 个文件的 diff 参与判定
RED  packages/shared/src/contracts/auth.ts 由 T-03 独占（当前任务 T-07）— §10.3

--check-ownership task=T-07 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1                                    ← 登记前：红（= T-07-fix3 §6-1 那条红的复现）

$ node tools/boundaries.mjs --check-ownership --task T-07 --files packages/shared/src/contracts/auth.ts \
    --diff-file %TEMP%/e1c2/a363-overcap.patch
RED  packages/shared/src/contracts/auth.ts（通道 bounded-edit:A-36-3 不通过）：bounded-edit:A-36-3 允许 ≤49 行实际变更，patch 里是 50 行（若混入他人改动请改用自证 scoped patch；不收 HEAD diff）
--check-ownership task=T-07 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 1 处越界
exit=1                                    ← 疫苗：只多 1 行就咬，证明 49 不是"怎么都过"

$ node tools/boundaries.mjs --check-ownership --task T-07 --files packages/shared/src/contracts/auth.ts \
    --diff-file %TEMP%/e1c2/a363-scale49.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/shared/src/contracts/auth.ts：走动作通道 bounded-edit:A-36-3（按实际 diff 判定：+43/-6 行）

--check-ownership task=T-07 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 无越界
exit=0                                    ← 登记后 + T-07 真实规模 → 绿，且 NOTE 说清走了哪条通道（A-36-13）
```

第四条（防"窄授权被复用"）：同一条目、同一份 49 行 patch 换成没登记的 T-13 ⇒

```
RED  packages/shared/src/contracts/auth.ts（通道 bounded-edit:A-36-3 不通过）：bounded-edit:A-36-3 未给 T-13 声明 maxDiffLinesFor.T-13 = 无上限授权，拒绝判定（宁可红也不放行未登记的幅度）
exit=1
```

### 为什么上限不往上放

cap=49 的代价是"T-07 若再多改 1 行就得回来加登记"，收益是"这条通道只能装下这一轮那一件事"。
把 cap 写成 60/100 就等于把 `bounded-edit` 退化成"该文件对 T-07 开放写权"，与 A-33-4（禁止不咬人的空壳）、
A-35-11（不许用人肉放大的行数当授权）直接冲突；且 §4 的 `app.ts` 已经演示过同一形状：**cap=实测量 ⇒ 51 行必红、2 行必绿**。

---

## §5 出口命令真实输出

三条出口命令 + 一条反确认，全部本轮（E1c 第 2 轮，登记完 `A-36-3` 之后）**实跑**，退出码逐个回显。

### ① `node tools/boundaries.mjs --self-test` → 139/139，exit 0

```
… （尾部 8 行，中间 131 条 OK 从略，全文 26.7 KB）
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：139/139 通过
exit=0
```

**139 = 上轮收工数，本轮未变**：本轮只补报告 + 加一条登记条目（`tools/boundaries.mjs` 一字未动），
没有新增机检 ⇒ 用例数不动是正确的；A-36 四-1 把"E1c 第 2 轮报告补齐 + `--self-test` 仍 139/139"写成 E3′ 的开工前置，
本行即为该前置的实测。

### ② `node tools/boundaries.mjs --all` → 18/21，3 红，exit 1

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
…
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
RED  web-home-transport         2 处命中：apps/web/src/components/home/result-section.tsx:12 | apps/web/src/lib/api/lookup-stream.ts:4
…
18/21 条通过，3 条红
exit=1
```

**三条红与开工前基线同名同点**（`packages/ui` + `apps/web` 内容债，并行 agent 名下），本轮 `ownership.json`
那条登记不参与 `--all` 的这 21 条判据 ⇒ 无新增红、无消失红。归因逐条写在 §6。

### ③ 无证据的 `--check-ownership` → exit 2（A-35-10②）

```
$ node tools/boundaries.mjs --check-ownership --task T-25
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定

--check-ownership task=T-25 无证据（既无 --files 也无 --diff-file）= 无判定，不得声称通过（A-35-10②）
exit=2

$ node tools/boundaries.mjs --check-ownership          # 连任务号都不给
--check-ownership 需要 --task T-XX（当前任务号），或给 env TM_TASK
exit=2
```

### ④ 反确认：给了证据就不再是 2

```
$ node tools/boundaries.mjs --check-ownership --task T-07 --diff-file %TEMP%/e1c2/a363-scale49.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/shared/src/contracts/auth.ts：走动作通道 bounded-edit:A-36-3（按实际 diff 判定：+43/-6 行）

--check-ownership task=T-07 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
exit=0
```

### ⑤ 本轮顺带复跑的四条"上轮转绿"用例（证明登记没被后续盘面吃掉）

```
--task T-11 --diff-file <v6-t11-scoped.patch>  → NOTE bounded-edit:A-35-1（+1/-1） → 无越界  exit=0
--task T-25 --diff-file <t25-01-tables-append> → NOTE block-append:A-35-11（+1/-0） → 无越界  exit=0
--task T-25 --diff-file <t25-02-db-types-append> → NOTE block-append:A-35-11（+1/-0） → 无越界 exit=0
--task T-25 --diff-file <t25-03-db-sqlite-append> → NOTE block-append:A-35-11（+1/-0） → 无越界 exit=0
```

⚠ `scripts/migrate.ts` 那条（`ALL_MIGRATIONS` 单行块）本轮实测**仍红**（判据不放宽），见 §2 末与 §7 待拍板 #1。

---

## §6 盘面数字对账表（A-32-9）

### 6-A 简报数字 vs 本轮实测数字（逐条归因，A-32-9「报告缺章节 = 该交付未完成」的对账口径）

| 项目 | 开工前（简报基线） | 收工后（本轮实测） | 差值归因 |
|---|---|---|---|
| `--self-test` 通过数 | 128/128（E1a 交） | **139/139，exit 0** | **+11** = 上轮 E1c 第 1 轮加的机检用例（`block-append` 通道 8 条 + `parsePatch` 三个洞的 3 条，见 §2「本轮修掉的三个洞」表）。**本轮第 2 轮 +0**（只补报告 + 一条登记，未碰 `boundaries.mjs`），与 A-36 四-1 要求的"仍 139/139"一致 |
| `--all` 绿/红 | 18/21（3 红，并行 agent 名下） | **18/21，3 红，exit 1** | **±0**。三条红逐条核过同名同点：`colors-no-hardcode`（`apps/app/src/styles/app.css:5`、`packages/ui/src/patterns/GrowthLine.tsx:8`）、`css-important-budget`（`packages/ui/src/styles/tokens.css:89` + `packages/ui/test/patterns.spec.tsx:691/695`）、`web-home-transport`（`apps/web/src/components/home/result-section.tsx:12`、`apps/web/src/lib/api/lookup-stream.ts:4`）⇒ 全在 `packages/ui` + `apps/web` 内容债面，与 ownership 通道无关（本轮新登记也没让它们变绿或变红） |
| T-25 无证据 `--check-ownership` exit | 0（BUG：无判定却声称通过） | **2**（消息点名 A-35-10②） | A-35-10② 修复生效。第二层：连 `--task` 都不给也是 2，不是"参数缺失就不判" |
| T-25 三文件 red 数 | 3（schema / db-types / db-sqlite 全撞 T-06 独占） | **0**（三条 append patch 各 `NOTE block-append:A-35-11` → exit 0，本轮 §5-⑤ 复跑） | 上轮 `block-append` 通道实装 + E1b 登记；⚠ **第 4 条 `scripts/migrate.ts` 实测仍红**（单行数组块的"块内纯追加"在 unified diff 上无解），不是判据太严，见 §2 末与 §7 待拍板 #1 |
| T-10 `app.ts` red | 1（无通道 → 撞 T-07 独占） | **0**（`NOTE bounded-edit:A-33-7（+1/-1）`，exit 0；本轮 §4 重测） | 上轮 `bounded-edit:A-33-7` + `maxDiffLinesFor:{"T-10":2}` 登记生效；本轮另证 cap=2 仍咬（51 行红 / HEAD diff 拒判） |
| T-11 `profile/page.tsx` | 无条目 → 独占红 | **0**（`NOTE bounded-edit:A-35-1（+1/-1）`，exit 0；本轮 §5-⑤ 复跑） | 上轮 A-35-1③ 的条目 + 通道；HEAD diff 侧仍 `exit=2` 拒判（§3 疫苗①） |
| `--check-ownership --task T-07` | 1 处红（`contracts/auth.ts` 无 `A-36-3` 条目，T-07-fix3 §6-1/§8-② 交回） | **0**（本轮 §4·补：`NOTE bounded-edit:A-36-3（+43/-6）` exit 0） | **本轮唯一新增账**：`tools/ownership.json` 补一条 49 行窄授权登记。+50 行仍红 ⇒ 不是把门禁放宽换来的绿 |
| `@tm/shared` 测试 | 1 红：`packages/shared/test/contracts.spec.ts:337` | 1 红（同一条） | **不是本轮的账，本轮一行代码未改**：该断言把 DEFECT-3（登录面挂强度策略）钉成了期望值，owner = T-03；并行 agent 正在翻（A-36-6 派发给 T-07 微轮的那半已交，翻转半属于该文件主人）。我未碰 `packages/**` |

### 6-B 登记表自身的账面变化（本轮唯一一次写 `tools/**`）

| 计数项 | 上轮收工 | 本轮收工 | 差 |
|---|---|---|---|
| `ownership.ownership` 条目数 | 115 | **116** | +1（`packages/shared/src/contracts/auth.ts`） |
| 带 `actions` 的条目 | 6 | **7** | +1 |
| 其中 `bounded-edit:*` | 2（A-35-1 / A-33-7） | **3**（+ A-36-3） | +1 |
| 其中 `block-append:*` / `add-script-lines-only:*` | 3 / 1 | 3 / 1 | 0 |
| 带 `maxDiffLinesFor` 的条目 | 3 | **4** | +1（`{"T-07":49}`） |
| `tools/boundaries.mjs` | — | **一字未动** | 0（本轮禁区：判定逻辑不改写） |

---

## §7 越界申请 / 待 TPM 拍板

### 越界申请：**无**

本轮实际写入的文件只有两个，都在任务书给的可写范围内：

1. `.delivery/04-dev-report-E1c.md`（本报告）；
2. `tools/ownership.json`（**仅新增一条条目**，见 §4·补；未删改任何既有条目、未动判据字段）。

`tools/boundaries.mjs`、`packages/**`、`apps/**`、`.delivery/01-prd.md`、`.delivery/02-tech-design*.md`
本轮**只读**；git 侧只用了 `status` / `diff` / `show` / `apply --check`（全部不写索引、不写工作树），
未跑任何 `add`/`commit`/`stash`/`checkout`/`reset`/`clean`/`restore`；未在任何 `data.db` 上跑写操作或迁移。
所有探针 patch 与注入表建在 `%TEMP%/e1c2/` 下，用完删除（清理记录见 §8）。

### 待 TPM 拍板（5 条，按阻断程度排序）

| # | 事项 | 我的处置 | 请拍板什么 |
|---|---|---|---|
| **1** | `scripts/migrate.ts` 的 `block-append:A-35-11` 在单行数组 `ALL_MIGRATIONS` 上**物理无解**（§2 末实测：块区间 = 改动前 57-57 单行 ⇒ 要么改既有行（判据②红），要么块外插（判据⑤红））。批次4 开工硬前置仍卡这一条 | **没有放宽判据**（放宽办法现成且不咬人：把 `blocks` 换成文件级、或允许 1 行既有变更） | 三选一：(a) 给该条目另加一种新 kind / `bounded-edit` 的 `maxDiffLinesFor.{"T-25":11}`（"展开单行数组 + 追加 m007"实测 1 删 10 增）；(b) 先由 `migrate.ts` 的 owner 把它改写成多行数组（属形状变更，须另出裁决）；(c) T-25 改成"新增独立注册函数、不碰数组行"的写法。**我不发明 kind**，等号 |
| **2** | `add-script-lines-only:A-34-3` 与 E2 **落地时那一笔的形状不兼容**：新键加在 `scripts` 块尾 ⇒ 必须给原块尾行补逗号 ⇒ `+3/-1` 触发"0 既有行变更"硬条件判红（§4 ③ 实测 `exit=1`） | 如实报，**未改判据**；同一份内容改成块中插入即可判绿（§4 ② 实测 `exit=0`） | (a) 维持 A-34-3② 原口径：这条红保留（E2 报告已按"未处置红"记着）；或 (b) 派一次"把两行挪到 `lint` 之前"的零行为改动（内容等价，纯插入，判据不动）。**不建议** (c) "允许仅尾逗号差异"（要新写逐字符比对机检，且与"改依赖行版本号"混门） |
| **3** | 本轮新登记的 `bounded-edit:A-36-3` 是**一次性窄授权**，但 T-07 微轮已交回、A-36-#4 的 message 还原与 #3 的登录面摘策略此刻都活在该文件里；紧接着 T-03 名下的 `contracts.spec.ts:337` 翻转轮若再碰 `contracts/auth.ts`，会撞新独占 | 条目按"保留 + 写明失效条件"登记（`reason` 里已写"批次4 新任务须另出登记、不得复用"） | 定清理时点：**批次3 收口（E3′ 之后）**统一清理这类出口轮窄授权条目，还是现在就标过期？现在删 ⇒ T-03 复跑 E3′ 相关判定时会重新红（我已实测：撤掉条目即 §4·补 疫苗① 的红） |
| **4** | cap=49 的取证口径：`packages/shared/src/contracts/auth.ts` 是**未跟踪文件**（`?? packages/shared/src/contracts/`），HEAD 相对 diff 按定义无输出 ⇒ 49 行无法用 git 独立复核，只能取 T-07-fix3 §1-3 的 `git diff --no-index -U0` hunk 头相加，并由我用其中 3 处改后行号（64/79/8-10 行）逐字复核（§4·补 表） | 已把复核过程与限制写进 `reason` 和本报告 | 认这个口径吗？若要硬复核，唯一办法是 **A-34-2 的 git 入库窗口之后**由 T-03 或 E 轮对该文件重测一次幅度（批次5 可顺手做，成本 = 一次 `--check-ownership`） |
| **5** | A-36-10 的 owner 写的是"**E1c 或批次5**（`--copy` 扩面）"，本轮任务书明令"只补报告、不改 `tools/**` 判定逻辑" ⇒ **这条今天仍没人干** | 未做（如实报"未跑 + 原因"，见 §8-未跑清单） | 明确派给批次5，还是给 E1c 单开一轮（要求：`docs/**` 插一行旧串 → 必红 → 删 → 必绿，且按 A-36-10② 的"命中行含 `~~` 或在 `04-adjudications.md` 内则跳过"行级口径实装） |

---

## §8 未跑清单 / 给测试的提示 / 临时产物清理

### 8-A 未跑（不补口径）

| 命令 | 状态 | 原因 |
|---|---|---|
| `pnpm build` / 各包 `test` 全套 | **未跑** | 本轮零代码改动（报告 + 一条登记），A-36-18 给的判据就是 §5 那三条门禁命令；且 `@tm/shared` 此刻有 1 条 T-03 名下在翻的红（`packages/shared/test/contracts.spec.ts:337`），我复述它的数字只会污染对账 |
| A-36-10 的 `--copy` 禁词扩面 | **未做** | 本轮禁区 = 不改 `tools/boundaries.mjs`；见 §7 待拍板 #5 |
| `contracts/auth.ts` 的 HEAD 相对 diff | **结构性跑不了**（本轮实测） | `git diff --numstat HEAD -- packages/shared/src/contracts/auth.ts` → **空输出**（文件未跟踪）。这是 A-36-13 "不收 HEAD diff" 在该文件上的极端形：不是"会混入他人改动"，而是**根本没有 HEAD 基线** ⇒ 只能走 scoped patch |
| T-07 那轮的**原始** scoped patch 文件 | **不存在** | 其 §6-1 引用的 `<TEMP>/t07fix3/scoped.patch` 已被该轮按纪律删除（本轮 `ls` 实测该目录为空）⇒ 我只能构造**等规模** patch 证 cap 咬合，见 §4·补 |

### 8-B 给测试工程师的提示（Phase 5 重点测哪）

1. **三条通道的咬点各不相同**，别用一条的用例去推另一条：`bounded-edit` 测"幅度 + 证据形状"（0/1/2 三态，§3 末的梯度）；
   `block-append` 测"块几何（**改动前**行坐标）+ 自报封顶缺失即拒判"；`add-script-lines-only` 测"块内 + 0 既有行变更"。
2. 专测两类历史上真出过假绿的形状：**紧贴块上方插一行**（§2 洞 #3）与**同一路径两个 `+++` 头 / 多文件合并 patch**（洞 #1、#2）。
3. `ownership.json:127-133` 那条 `bounded-edit:A-36-3` 是**出口轮一次性窄授权**，不要读成"T-07 对 shared 凭据契约有常设写权"
   （条目 `reason` 里已写明；跨任务复用实测红：`未给 T-13 声明 maxDiffLinesFor.T-13`，§4·补 第四条疫苗）。
4. 要复跑我的取证：`%TEMP%/e1c2/` 已清空（§8-C），按 §4 与 §4·补 各自"证据产法"一段重造即可，每条都是 2~3 个命令；
   我没有把探针 patch 入库（A-24-1 口径，仓库内零新增文件）。

### 8-C 临时产物与清理记录

本轮在 `%TEMP%/e1c2/` 下生成过：`app-before.ts` / `app-fake50.ts` / `t10-scoped-app.patch` / `t10-app-HEAD.diff` /
`t10-fake50.patch` / `ownership-no-app-a337.json` / `pkg-before-e2real.json` / `pkg-before-one.json` /
`pkg-before-dep.json` / `pkg-e2-real.patch` / `pkg-pure-insert-one.patch` / `pkg-dep-insert.patch` / `pkg-HEAD.diff` /
`auth-before-overcap.ts` / `auth-before-scale49.ts` / `a363-overcap.patch` / `a363-scale49.patch` /
`ownership-no-a363.json` / `self-test.txt` / `all.txt` ⇒ 输出抄录完毕后**已全部删除**（`rm -rf %TEMP%/e1c2`）。
唯一保留的是**上一轮**的 `%TEMP%/e1c/`（§5-⑤ 复跑 T-11/T-25 用的 `v6-t11-scoped.patch` 与 `t25-0{1,2,3}-*.patch` 在里面，
留着给复核者重放；同样是系统临时目录，不入库，系统自会回收）。
仓库侧净变化 = 本报告 + `tools/ownership.json` 的一条条目，无新增文件（`git status --porcelain` 过滤 `e1c2`/`*.patch`
命中 0；工作区其余 160+ 项未提交改动属并行角色，本轮一个都没清理、没还原）。

**顺带纠正上一轮的一处不实陈述**：第 1 轮报告写"探针 patch 建在系统临时目录，仓库内零新增"，
但本轮开工实测 `git status --porcelain` 里有 **`?? .tmp-e1c/`**（8 个 `e1c-ba-*.patch` / `e1c-head-contaminated.patch` /
`e1c-self-proven.patch`，mtime 04:02-04:07 = 第 1 轮时段，前缀 = 本角色）⇒ 那是我上一轮漏删的探针，**"零新增"当时不成立**。
本轮已 `rm -rf .tmp-e1c`（只删自己名下的探针，未碰任何他人改动；`git status` 总行数 165 → **164**，
过滤 `e1c|\.patch` 现命中 0）。该目录未被 `.delivery/**`、`tools/**`、`.gitignore` 任何一处引用（本轮 grep 实测），
删除不影响别人复跑。**教训写进 §8-B 第 4 条**：临时产物一律落 `os.tmpdir()`，不要用仓库根的点目录。
