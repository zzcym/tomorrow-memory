# 04 开发报告 — 出口轮 E1a（门禁工具工程师）

- 任务：E1a（T-02 出口轮 A 组）
- 唯一可写文件：`tools/boundaries.mjs`（2290 行）
- 日期：2026-09-20
- 依据裁决：A-33-4（必交三条通道 + 各带疫苗）、A-30-10、A-28-3、A-30-8、A-34-3、A-32-5、A-28-2、A-30-4、A-24-1、A-31（报告优先）、A-32-9（对账表）

## 待办清单（按优先级）

| # | 交付项 | 裁决 | 状态 |
|---|---|---|---|
| 1a | `delete-expired-entry` 通道机检 + 疫苗 | A-28-3 / A-33-4 | ☑ 已交（§1，5 条用例 + 活体疫苗 1-V1） |
| 1b | `extend-supplement` 通道机检（判据 = diff 里 0 既有行变更）+ 疫苗 | A-30-8 / A-33-4 | ☑ 已交（§1，4 条用例 + 活体疫苗 1-V2） |
| 1c | `bounded-edit:<裁决号>` 通道机检（按实际 diff 行判定，不按 `--files` 清单）+ 疫苗 | A-30-10 / A-33-4 | ☑ 已交（§1，4 条用例 + 活体疫苗 1-V3；含"清单骗不过 diff"的反证） |
| 1d | `add-script-lines-only:<裁决号>` 通道预留（只增 `scripts` 块内行）+ 疫苗 | A-34-3 | ☑ 已交（§1，4 条用例 + 活体疫苗 1-V4，真仓库 E2 diff 仍在咬） |
| 1+ | 通道之间的优先级冲突（`actions` vs `predecessorAllowedDiff`）；未知通道名；注入表失败即关 | A-4 / A-33-4 | ☑ 顺带修掉我自己引入的 A-4 回归（对账表 R-7），+1 条"写错通道名不放行"用例、疫苗 1-V5 |
| 2 | `enforce-flag-single-read` 口径修正（只数 `packages/server/src/**` 非注释运行读点，豁免 `test/**`、`src/scripts/**`）+ 两步疫苗 | A-32-5 | ☑ 口径与断言描述 E1 已交（实测在册，非我重做）；**疫苗本轮我重跑并双侧取证**（§2：注入真读点→红、加噪音→仍绿、噪音在场再加真读点→仍红） |
| 3 | `--self-test` 探针去"活缺陷依赖"（`review-no-agent` / `a19Vaccine` / `exceptionsStrictSample`）改 fixture | A-28-2 | ☑ 病灶 E1 已切除（3 条 A-19 用例现全绿且引用 fixture 自持台账）；**本轮补一条永久锁** `probeIndependenceFromLiveDefects()` + 疫苗 3-V1/3-V2（§3） |
| 4 | `--web` 模式实装（`(user)/page.tsx` + `components/home/**` + `lib/api/**` 传输面） | A-30-4 | ☑ 开工前已由 E1 实装（**不是空壳**：真实仓库上正咬 2 处红）。本轮复核判据/词表/覆盖面与 A-30-4 逐字一致，见 §4 |
| 5 | `--dist` 模式实装（成为同一套检查的入口，不另写更松的一套） | A-24-1 | ☑ 开工前已由 E1 实装（含 `distGuardParity()` 的"⊇ tm-app:dist-guard"永久比对与脏产物 fixture）。本轮**复核并跑通**产物冒烟 + 三处同步机检（我补的 `helpSurfaceParity()` 正好覆盖 `--dist` 这类"注册了却没进 HELP"的幻影），见 §5 |

> 铁律：任何一条做成"不咬人的空壳"即视为未交。第 4、5 条时间不够可不交，但必须写明"未交 + 原因"，**禁止**注册成空壳。

## 盘面数字对账表（A-32-9）

（待填：简报数字 vs 实测数字，逐条归因）

## 证据区

### 0. 开工前的盘面实况（与简报锚点的差异 = 对账表 R-1~R-5）

简报给的行号锚点已过期：`tools/boundaries.mjs` 现为 **2290 → 2405 行**（E1 上一轮 01:43 落过一次盘）。**实测：简报清单里的第 2/3/4/5 条在我开工前已由 `04-dev-report-E1.md` 交掉**（`--self-test` 108/108、`--web`/`--dist` 进 MODES、`enforce-flag-single-read` 已按 A-32-5 改口径并贴过两步疫苗）。**唯独第 1 条（A-33-4 动作通道）是半截货**：三条通道的判定函数在文件里（`:1240+`），但

- `--self-test` 里**一条通道用例都没有**（`grep A-33-4/A-28-3/A-30-8/A-30-10` 结果为空）——而 `:1192` 的注释却写着"每条通道都有 --self-test 的红/绿 fixture 对"，**这是注释级假绿**；
- `add-script-lines-only:<裁决号>`（A-34-3）**完全不存在**；
- 更硬的：仓库 `tools/ownership.json` 里 `"actions"` 出现次数 = **0** ⇒ 三条通道在真实仓库上**根本没有可达的调用路径**，"实装了但没人能走到"正是 A-24-1 定义的幻影。

开工基线（真实输出）：

```
$ node tools/boundaries.mjs --self-test
boundaries --self-test：108/108 通过          ← 里面没有一条是动作通道的用例
$ node tools/boundaries.mjs --all
18/21 条通过，3 条红                            ← colors-no-hardcode / css-important-budget（T-14/T-05/T-04 名下，非我名下）、
                                                  web-home-transport 2 处（T-12 名下注释写了 fetch(，E1 已登记移交）
```

### 1. 交付清单第 1 条：三条 ownership 动作通道的机检 + A-34-3 预留 + 每条各带疫苗（A-33-4 必交项）

**改动全部在 `tools/boundaries.mjs` 一个文件内**（新增 ~200 行，未删任何断言）：

| 落点（实测行号） | 内容 |
|---|---|
| `:1114-1131` | 新 helper `scriptBlockSet()`（与既有 `depRangeSet` 同一条"进块/出块"写法，不开嵌套） |
| `:1316-1341` | 新通道④ `judgeAddScriptLinesOnly(rel, change, ctx, 裁决号)`：有删除行→红；新增行不在 `scripts` 块→红；0 变更→红（空授权）；找不到 scripts 块→红 |
| `:1342-1360` | `judgeActionChannels` 接第④条；未知通道名仍走原"不放行"分支 |
| `:1202-1212` | 段首注释从"三条"改为"四条"，并把那句假绿注释（"每条通道都有 fixture 对"）改成**已兑现的事实**：指明用例名 `ownershipActionChannels()` 与活体疫苗的做法 |
| `:1410-1437` | **并集语义修正**：条目上同时挂着 `actions` 与 `predecessorAllowedDiff`（A-34-3 的登记形态就是"追加"）时，通道判红后允许回落到同为窄授权的 `predecessorAllowedDiff`；**不**回落到 `maxDiffLinesFor` 纯预算分支。不改这条就会把 A-4 的"只加依赖行"合法路径判红（我改前 `--self-test` 的 A-4 用例真的因此转红，见 R-7） |
| `:1362-1378` | `--ownership-file P`：归属表**用例输入注入点**（默认仍 `tools/ownership.json`，读不到即退出码 2，绝不回落"无表=全放行"；用了注入表输出必打 `TABLE …← 注入表`）。CLI 解析 `:1653-1656`、`ACCEPTED_FLAGS:1553`、HELP `:1592` 三处同步 |
| `:2235-2430` | `ownershipActionChannels()`：4 条通道各 1 绿 + 1 "无 patch = 要证据" 红 + 2~3 条越界红，再加 1 条"通道名写错不放行"红 = **18 条用例**（`--self-test` 里全部以 `A-33-4 通道…` / `A-33-4 未知通道名…` 前缀在册，实测计数见对账表 R-4），全部在 `os.tmpdir()` 沙盒里跑**同一份** `checkOwnership`（不是复制的第二套判据），跑完 `rmSync` 回收 |
| `:2430-2444` | `helpSurfaceParity()`：MODES 键 / ACCEPTED_FLAGS 开关 ⇄ HELP 定义位**双向**对齐（简报"漏一处就是新的幻影"的机检版）；调用点 `:2511-2520` |

**`--self-test` 侧的永久疫苗（18 条，节选真实输出）**：

```
OK   A-33-4 通道① delete-expired-entry：整条删除 expires_after=当前任务的例外 → 放行 — 放行 ／ tools/exceptions.json：走动作通道 delete-expired-entry（按实际 diff 判定：+0/-7 行）
OK   A-33-4 通道① 疫苗：删掉 expires_after=T-20 的未到期条目 → 红 — …只许删 expires_after=T-13 的条目
OK   A-33-4 通道① 疫苗：只删条目里的两行字段（拼不回完整条目）→ 红 — …删掉的 2 行拼不回完整条目（只许整条删除，不许改字段/删半截）
OK   A-33-4 通道① 疫苗：改字段（既有删除又有新增）→ 红 — delete-expired-entry 只许"删"：patch 里有 1 行新增/改写
OK   A-33-4 通道① 疫苗：只在 --files 里点名 exceptions.json、无 patch → 红（要证据）
OK   A-33-4 通道② extend-supplement：往 TM_ERRORS_SUPPLEMENT 纯追加 → 放行 — （按实际 diff 判定：+1/-0 行）
OK   A-33-4 通道② 疫苗：追加落进 §4.6 冻结符号 TM_ERRORS 内 → 红 — …冻结符号 TM_ERRORS（11-14 行）…三个冻结集合一字不能动
OK   A-33-4 通道② 疫苗：改写 §4.6 已有行（≠0 既有行变更）→ 红 — 硬条件是"0 既有行变更"（A-30-8），实际有 1 行删除/改写
OK   A-33-4 通道② 疫苗：只在清单里点名 errors.ts、无 patch → 红（要证据）
OK   A-33-4 通道③ bounded-edit:A-30-10：实际 diff 4 行 = 授权幅度 4 行 → 放行 — （+2/-2 行）
OK   A-33-4 通道③ 疫苗：授权 4 行、实际 diff 8 行 → 红（按 diff 判，不按清单） — 允许 ≤4 行实际变更，patch 里是 8 行
OK   A-33-4 通道③ 疫苗：未给该任务登记 maxDiffLinesFor → 红（无上限授权拒绝判定）
OK   A-33-4 通道③ 疫苗：只在清单里点名、无 patch → 红（要证据）
OK   A-33-4 通道④ add-script-lines-only:A-34-3：只在 scripts 块内新增 1 行 → 放行 — （+1/-0 行）
OK   A-33-4 通道④ 疫苗：新增行落在 dependencies 块内 → 红 — 1 行新增不在 scripts 块内（dependencies/devDependencies/版本号仍算越界）
OK   A-33-4 通道④ 疫苗：改写 version 行 → 红 — 只许纯新增脚本行：patch 里有 1 行删除/改写
OK   A-33-4 通道④ 疫苗：只在清单里点名 apps/web/package.json、无 patch → 红（要证据）
OK   A-33-4 未知通道名（delete-expired-entryy）→ 红，写错通道名不构成授权（patch 本身合规）
OK   A-24-1 反幻影：MODES / ACCEPTED_FLAGS / HELP 三处同步 — MODES 13 键 + ACCEPTED_FLAGS 14 开关 ⇄ HELP 25 个定义位双向对齐（未写进 HELP 0 / HELP 里的幻影 0）
```

> 每条绿用例都额外断言"放行必须来自通道 NOTE"（`走动作通道 <id>`），否则绿可能来自别的分支 = 空壳伪装。这条断言在实现通道③时就抓到过一次假绿：`parsePatch` 遇到重复的 `+++ 同路径` 文件头会覆盖前一条记录（真实 git patch 不这样），8 行变更只被数成 2 行 → 用例红给我看，改成"单文件头 + 多 @@ 段"后才真判红。**这就是疫苗的意义**。

#### 1-V1 活体疫苗：`delete-expired-entry`（真 CLI，越界 patch → 红 → 无证据 → 红 → 合规 → 绿）

沙盒 = `mktemp -d` 出来的仓库外临时目录（**不在仓库里造文件**），命令是正式 CLI：

```
$ node tools/boundaries.mjs --check-ownership --task T-13 --root <沙盒> --ownership-file <沙盒>/tools/ownership.json --diff-file p/ch1-green.patch
TABLE C:\Users\...\Temp\e1a-live-JbH3GH\tools\ownership.json  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）
PATCH 1 个文件的 diff 参与判定
NOTE tools/exceptions.json：走动作通道 delete-expired-entry（按实际 diff 判定：+0/-7 行）
--check-ownership task=T-13 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
EXIT=0

$ …--diff-file p/ch1-red.patch            ← 故意把 expires_after=T-20（未到期）的条目删掉
RED  tools/exceptions.json（通道 delete-expired-entry 不通过）：delete-expired-entry：删了未到期条目 e1a-not-yet(expires_after=T-20)，当前任务 T-13 只许删 expires_after=T-13 的条目
EXIT=1

$ …--files tools/exceptions.json          ← 删掉 patch，只在清单里点名（A-30-10 报的就是这个病）
RED  …动作通道 delete-expired-entry 要证据：本文件没有出现在 --diff-file 的 patch 里（只在 --files 清单里点名不算授权）
EXIT=1
```

#### 1-V2 活体疫苗：`extend-supplement`

```
$ …--task T-02 --diff-file p/ch2-green.patch        ← 往 TM_ERRORS_SUPPLEMENT 纯追加 1 行
NOTE packages/shared/src/constants/errors.ts：走动作通道 extend-supplement（按实际 diff 判定：+1/-0 行）
→ 无越界  EXIT=0

$ …--diff-file p/ch2-red-frozen.patch               ← 同一行改投 §4.6 冻结符号 TM_ERRORS 内
RED  …extend-supplement：追加落进 §4.6 冻结符号 TM_ERRORS（11-14 行）的第 1 行 —— 三个冻结集合一字不能动，只能进 TM_ERRORS_SUPPLEMENT
EXIT=1
```

#### 1-V3 活体疫苗：`bounded-edit:<裁决号>`（按实际 diff 行判定）

```
$ …--task T-02 --diff-file p/ch3-green.patch        ← 声明 ≤4 行，实际 diff 4 行
NOTE services/limited/thing.ts：走动作通道 bounded-edit:A-30-10（按实际 diff 判定：+2/-2 行）
→ 无越界  EXIT=0

$ …--diff-file p/ch3-red.patch                      ← 同一授权下偷偷改到 8 行
RED  …bounded-edit:A-30-10 允许 ≤4 行实际变更，patch 里是 8 行
EXIT=1

$ …--task T-07 --diff-file p/ch3-green.patch        ← 换一个没登记幅度的任务
RED  …未给 T-07 声明 maxDiffLinesFor.T-07 = 无上限授权，拒绝判定（宁可红也不放行未登记的幅度）
EXIT=1
```

#### 1-V4 活体疫苗：`add-script-lines-only:A-34-3`（**含真实仓库现场**）

沙盒侧：

```
$ …--task T-02 --diff-file p/ch4-green.patch        ← scripts 块内新增 1 行
NOTE apps/web/package.json：走动作通道 add-script-lines-only:A-34-3（按实际 diff 判定：+1/-0 行）
→ 无越界  EXIT=0

$ …--diff-file p/ch4-red-dep.patch                  ← 同样的"只增一行"，但增在 dependencies 里
RED  …1 行新增不在 scripts 块内（dependencies/devDependencies/版本号仍算越界）：apps/web/package.json:12 ""next": "15.1.5""
EXIT=1
```

真实仓库侧（E1b 已在 `tools/ownership.json:336` 登记 `"actions": ["add-script-lines-only:A-34-3"]`，这条**不需要注入表**）：

```
$ git diff -- apps/web/package.json > $SB/real-web-pkg.diff     ← 只读取证，未做任何 git 写操作
$ node tools/boundaries.mjs --check-ownership --task E2 --diff-file $SB/real-web-pkg.diff
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：只许纯新增脚本行：patch 里有 6 行删除/改写（如 apps/web/package.json:10 ""lint": "next lint --max-warnings=0""）—— 改依赖行/版本号一律算越界
EXIT=1
```

**这条红我按 A-34-3②保留不消解**：E2 那次工作树改动混进了依赖行的删改（不只是 A-30-5 授权的脚本行），通道的职责就是把它继续咬住。A-34-3 说的"合法且仍然咬人"两面都拿到了。**给 TPM**：若 E2 的依赖行删改另有授权，需要的是另一条裁决，不是放宽这条通道。

#### 1-V5 回收与"失败即关"

```
$ rm -rf /tmp/e1a-live-JbH3GH        ← 疫苗沙盒全部删除（仓库内零残留）
$ node tools/boundaries.mjs --check-ownership --task T-02 --root <已删沙盒> --ownership-file <已删沙盒>/tools/ownership.json --diff-file …
RED --check-ownership 无法判定（前置缺失，不是放行）：归属表不存在：…\e1a-live-JbH3GH\tools\ownership.json（注入表读不到 = 判定无法进行，绝不回落成"无表 = 全放行"）
EXIT=2
$ node tools/boundaries.mjs --check-ownership --task T-02 --files tools/boundaries.mjs
TABLE E:\CC\tomorrow-memory\tools\ownership.json
--check-ownership task=T-02 触碰 1 个文件 → 无越界
EXIT=0
```

并集回落的反证（同一份真实 diff，换成登记在 `applies_to` 里的 T-12，窄授权也没放过删改行）：

```
$ node tools/boundaries.mjs --check-ownership --task T-12 --diff-file <真实 apps/web/package.json diff>
RED  apps/web/package.json（owner=T-04）：只允许新增依赖行，实际删除/改写了 6 行；动作通道也未通过：…只许纯新增脚本行…
EXIT=1
```

### 2. 交付清单第 2 条：`enforce-flag-single-read` 口径（A-32-5）+ 疫苗

**实况归因**：口径本体与断言描述在我开工前由 E1 落盘（`tools/boundaries.mjs:564-600` 的 `isRuntimeReadHit` 过滤 + `:568` 的 title 里明写"**只数 `packages/server/src/**` 的非注释运行时读点**，豁免 `test/**` 与 `src/scripts/**`"），`--list` 输出可见：

```
enforce-flag-single-read     enforce_from=T-07   `passwordUpgradeEnforce` 的**运行时读点** = 1（§4.7 开关边界：只允许 auth-service.issueTokens 读）。A-32-5 口径：**只数 `packages/server/src/**` 的非注释运行时读点**，豁免 `test/**` 与 `src/scripts/**`
```

简报要求的**疫苗我本轮真跑了一遍**，并且跑的是双向：既证明"多一个真读点必须红"，也证明"三处噪音不许计数"（只做前者 = 一条数一切的假严断言，A-32-5 要的是口径准确而非更严）。**沙盒放在 `os.tmpdir()`，用 `--root` 换扫描根，未在真仓库 `packages/server/src/**` 下落一个字节**。

```
===== [2-V0] 沙盒基线（1 个运行时读点 + 3 类写入点）=====
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:2（另有 0 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change,registration} = 3 个；命中 3 处；例外豁免 0 处
3/3 条通过，全绿
EXIT=0

===== [2-V1] 注入越界：packages/server/src/routes/tt.ts 里加一个真实运行时读点 =====
RED  enforce-flag-single-read   运行时读点 2 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"；口径 = 只数 packages/server/src/** 的非注释运行时读点，注释/测试/脚本 0 处噪音已按 A-32-5 剔除）：packages/server/src/routes/tt.ts:2 | packages/server/src/services/auth-service.ts:2
2/3 条通过，1 条红
EXIT=1

===== [2-V2] 删除注入 → 恢复 =====
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:2（另有 0 处注释/测试/脚本命中，按 A-32-5 不计入读点）
3/3 条通过，全绿
EXIT=0
```

口径的反向疫苗（同一批字面命中若落在注释 / `test/**` / `src/scripts/**` 就**不得**计数；随后再塞一个真读点，必须仍红 —— 证明"豁免噪音"没顺手把真读点一起豁免）：

```
===== [2-V3] 三处噪音（注释 / test/flags.spec.ts / src/scripts/backfill.ts）在场 =====
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:2（另有 3 处注释/测试/脚本命中，按 A-32-5 不计入读点）
3/3 条通过，全绿
EXIT=0

===== [2-V4] 噪音仍在场，再往 src 运行时加一处 =====
RED  enforce-flag-single-read   运行时读点 2 个 > 1（…注释/测试/脚本 3 处噪音已按 A-32-5 剔除）：packages/server/src/routes/tt.ts:2 | packages/server/src/services/auth-service.ts:2
EXIT=1

===== [2-V5] 清理 =====
OK   enforce-flag-single-read   运行时读点 1 个：…（另有 0 处注释/测试/脚本命中，按 A-32-5 不计入读点）
EXIT=0
沙盒已删除：ls: cannot access '/tmp/e1a-v2-iCUr4L': No such file or directory     ← 仓库内零残留
```

**真实仓库侧的噪音对账**（简报说"仓库里有十几处 `passwordUpgradeEnforce` 字面命中，会不会数错"）：`--all` 的这条绿将数得清清楚楚 —— 运行时读点 1 个 + 注释/测试/脚本 12 处，两者相加 = 仓库里该字面量的全部命中面，一个不多一个不少：

```
$ node tools/boundaries.mjs --all | grep enforce-flag-single-read
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
```

### 3. 交付清单第 3 条：`--self-test` 探针不再依赖活缺陷（A-28-2）

**实况归因**：病灶在 E1 那轮已切除 —— `a19Vaccine`（3 条 A-19 用例）与 `exceptionsStrictSample` 现在读的是**用例自持台账** `tools/fixtures/selftest/depcruise/review-no-agent-exception/_exceptions.json`（真实存在，2017 B），不再读仓库 `tools/exceptions.json`。T-10 把 `review-no-agent` 的例外合法删掉之后，这 3 条用例仍然全绿（`--self-test` 输出第 122-124 行），即"别人修好缺陷不再让我的自测试变红"。

**本轮我补的是"别让病灶长回来"的永久锁**（`:2445-2479` `probeIndependenceFromLiveDefects()`，调用点 `:2587`）：判据两半 —— ①**引用面**（静态读我自己这份源码）：两条探针的函数体里只准出现 `A19_LEDGER`，出现单参数 `loadExceptions(` （= 去读仓库台账）即红；②**蕴含式而非合取**：一旦仓库 `tools/exceptions.json` 的 depcruise 条目为 0，两条探针必须全绿；条目 >0（合法新登记）时只查引用面，不误伤。

疫苗 = 把 `a19Vaccine` 里那处 2 参数调用改回 1 参数（正是 A-28-2 的原始病灶），看锁咬不咬：

```
===== [3-V1] 故意把探针改回"读仓库台账" =====
$ node tools/boundaries.mjs --self-test
FAIL A-28-2 自测试探针不依赖仓库在途缺陷（depcruise 例外条目=0 时两条探针仍须全绿） — 两条探针的源码体均只引用用例自持台账 A19_LEDGER（越界引用仓库台账的探针：a19Vaccine）；仓库 tools/exceptions.json 现有 depcruise 条目 0 条（＝T-10 已合法修掉 review-no-agent 并同 commit 删了例外）—— 在此前提下 A-19 疫苗 0/3 绿、过期例外探针 绿
  - A-19③ 例外过期后仍违规 → 判红（cursor=T-12，同一 fixture 的同一批边）      ← 病灶复发时 A-19 三条自己就先塌了，锁与病灶同时红
EXIT=1

===== [3-V2] 还原（cp 回备份，cmp 逐字节一致）=====
还原后与备份逐字节一致
OK   A-28-2 自测试探针不依赖仓库在途缺陷（…） — 两条探针的源码体均只引用用例自持台账 A19_LEDGER（越界引用仓库台账的探针：无）；仓库 tools/exceptions.json 现有 depcruise 条目 0 条…—— 在此前提下 A-19 疫苗 3/3 绿、过期例外探针 绿
boundaries --self-test：128/128 通过
EXIT=0
```

`review-no-agent` 那一条的处置与简报一致：**它不再依赖仓库里有没有这条例外**（fixture 自带 `_exceptions.json`），所以 T-10 修完缺陷 + 删掉例外之后自测试没有一条红 —— 简报点名的这个 case 是本轮判据里唯一"绿不依赖别人在途缺陷"的方向。

### 4. 交付清单第 4 条：`--web`（A-30-4）—— 开工前已实装，本轮复核为"非空壳"

**实况归因**：`web-home-transport`（`:819-834`）由 E1 落盘。我按简报要求逐字核对判据面，不是复制粘贴的二手话：

| 核对项 | A-30-4 要求 | 实测（`:827-833`） |
|---|---|---|
| 扫描面 | `(user)/page.tsx` + `components/home/**` + `lib/api/**` | `roots: ['apps/web/src/app/(user)/page.tsx', 'apps/web/src/components/home', 'apps/web/src/lib/api']` —— 逐字一致，不多不少 |
| 断言 | `fetch(` / `XMLHttpRequest` / `localStorage` | `re: ioTermsRe([...IO_GLOBALS_TERMS, ...WEB_IO_EXTRA_TERMS])`，核心词表与 `--ui-io` **同一份常量**（`:1532` 注释登记），`WEB_IO_EXTRA_TERMS` 只加 `localStorage` |
| "同一套检查而不是另写一套更松的" | 必须共享 | `--self-test` 里 `A-30-4 --web ⊇ --ui-io 共用核心词表，且逐词跑真代码两侧判定一致`（`webTransportParity()`，`:2087+`）：5 个词各生成一段真会命中的代码，同时摆进 `packages/ui/src/**` 与 `apps/web/src/components/home/**` 两侧各跑一次，并核 `useQuery(` 只许 UI 红、`localStorage` 只许 web 红 |

**它确实在咬人（这是"非空壳"的最硬证据，真实仓库输出）**：

```
$ node tools/boundaries.mjs --web
RED  web-home-transport         2 处命中：apps/web/src/components/home/result-section.tsx:12 | apps/web/src/lib/api/lookup-stream.ts:4
0/1 条通过，1 条红
EXIT=1
```

两条红都在 **T-12 名下文件的注释里字面写了 `fetch(`**（E1 已按 A-27 同型案登记移交：改被扫内容、不改扫描器，且不为其加例外）。**我不消解、不顺手修**（文件不是我名下）。`--self-test` 侧这条断言有 2 个红用例 + 1 个绿用例在册（`覆盖 web-home-transport — 红用例 2 / 绿用例 1`）。

### 5. 交付清单第 5 条：`--dist`（A-24-1）—— 开工前已实装，本轮复核 + 跑通

**实况归因**：`dist-artifact-portability`（`:963+`）+ `runDistGuard()` + `distGuardParity()` 由 E1 落盘，模式在 MODES/ACCEPTED_FLAGS/HELP 三处齐备（`--dist [DIR]`，不给 DIR = 扫注册表在册目录）。**同一套检查、不是更松的第二套**由三条永久用例锁住：

```
OK   A-24-1 --dist 清单 ⊇ tm-app:dist-guard 清单（现读 vite.config.ts 逐条比对，谁也不许更松） — dist-guard 的 10 条正则全部在册（⊆ --dist 清单）；--dist 另有 1 条增量（只严不松）：["'`]\/[\w.@-][\w./@-]*\.(?:js|mjs|css|html|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map)\b〔"/…css" 根路径资源串〕
OK   A-24-1 .at 判据的反"永真"自检（与 dist-guard 的 AT_RULE_SELF_TEST 同表，红绿两侧都得有） — 7/7 判对
OK   A-24-1 脏产物 fixture 判红且命中含「文件:行/偏移 + 命中串」四要素 — 21 处命中四要素齐备，样例：apps/app/dist/assets/broken.css:1/47（第 1 行第 48 列）[判据① url(/…) ]
```

真产物冒烟（不指定 DIR，走注册表在册目录 `apps/app/dist`）：

```
$ node tools/boundaries.mjs --dist
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）
1/1 条通过，全绿
EXIT=0
```

另外我补的 `A-24-1 反幻影：MODES / ACCEPTED_FLAGS / HELP 三处同步` 用例（`:2430-2444`）会把 `--dist` / `--web` / `--check-ownership` 这类"注册了但 HELP 没写"或"HELP 写了但没实装"的双向不一致直接判红 —— 当前实测：

```
OK   A-24-1 反幻影：MODES / ACCEPTED_FLAGS / HELP 三处同步 — MODES 13 键 + ACCEPTED_FLAGS 14 开关 ⇄ HELP 25 个定义位双向对齐（未写进 HELP 0 / HELP 里的幻影 0）
```

**结论：第 4、5 条都不是空壳，也不是我这轮新写的；我按简报"做到哪算哪"把它们的判据面复核到逐字一致并留了执行证据。**

## 出口命令（真实跑、真实贴，退出码取自 `${PIPESTATUS[0]}` / `$?`）

```
$ node tools/boundaries.mjs --self-test
…
OK   A-28-2 自测试探针不依赖仓库在途缺陷（depcruise 例外条目=0 时两条探针仍须全绿） — …A-19 疫苗 3/3 绿、过期例外探针 绿
OK   A-24-1 反幻影：MODES / ACCEPTED_FLAGS / HELP 三处同步 — MODES 13 键 + ACCEPTED_FLAGS 14 开关 ⇄ HELP 25 个定义位双向对齐（未写进 HELP 0 / HELP 里的幻影 0）
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：128/128 通过
EXIT=0

$ node tools/boundaries.mjs --all
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
OK   copy-legacy-zero           0 命中（扫描 …；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   migration-forbidden        0 命中（扫描 18 个文件；例外豁免 0 处）
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
RED  web-home-transport         2 处命中：apps/web/src/components/home/result-section.tsx:12 | apps/web/src/lib/api/lookup-stream.ts:4
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）

18/21 条通过，3 条红
EXIT=1        ← 3 条红全部不在 E1a 名下：colors-no-hardcode（T-14/T-05）、css-important-budget（T-04/T-05）、web-home-transport（T-12 注释）。我一条都没放宽、没加例外、没顺手修，按简报"注明即可"处理。

$ node tools/boundaries.mjs --check-ownership --task T-02
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定

--check-ownership task=T-02 触碰 0 个文件 → 无越界
EXIT=0        ← 无输入 = 无判定（签名以实际为准：本模式要求显式给 --files / --diff-file）。措辞缺口见 §7-7。

$ node tools/boundaries.mjs --check-ownership --task T-02 --files tools/boundaries.mjs
TABLE E:\CC\tomorrow-memory\tools\ownership.json
--check-ownership task=T-02 触碰 1 个文件 → 无越界
EXIT=0

$ node tools/boundaries.mjs --check-ownership --task T-02 --diff-file <整棵工作树 git diff，只读取证>
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 81 个文件的 diff 参与判定
…（53 条 RED，全部指向 T-01/T-04/T-12/T-15 名下文件，例如：）
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：add-script-lines-only:A-34-3 只许纯新增脚本行：patch 里有 7 行删除/改写（…）—— 改依赖行/版本号一律算越界
--check-ownership task=T-02 触碰 53 个在册文件（清单 0 项 + patch 81 项） → 53 处越界
EXIT=1        ← 这批红全部是**并行 agent 的未提交改动**，与 E1a 无关（我的 tools/boundaries.mjs 不在红名单里）。按简报"注明即可、不许顺手修"保留。

$ node tools/boundaries.mjs --help
（节选：与本轮新增/改动的模式与选项直接相关的四段，全文 40 行）
  --web             A-30-4 / §10.2 T-12 判据⑤：首页传输面（(user)/page.tsx + components/home/** + lib/api/**）
  --dist [DIR]      产物门禁（§10.2 T-14 判据①② / A-24-1）…
  --check-ownership §10.4 的四条"有限授权动作通道"（A-28-3/A-30-8/A-30-10/A-34-3）由条目里的 actions:[] 声明，
                    **全部按 --diff-file 里的实际 diff 行判定**：
                      delete-expired-entry / extend-supplement / bounded-edit:<裁决号> / add-script-lines-only:<裁决号>
                    四条都没有 patch 证据 = 判红（"要证据"），通道名写错 = 判红，不放行未知通道
  --ownership-file P 归属表注入…表读不到即报错退出，不回落成"全放行"
EXIT=0

$ node tools/boundaries.mjs --list
共 21 条断言（§3.5 的 7 条 depcruise 规则由 .dependency-cruiser.cjs 落地）
EXIT=0
```

**反幻影核对**：新模式进 MODES（`--web`/`--dist` 在 MODES 13 键内）与 HELP（25 个定义位）两处，由 `--self-test` 的 `A-24-1 反幻影` 用例机检（"未写进 HELP 0 / HELP 里的幻影 0"），不是靠我口头保证。

## 盘面数字对账表（A-32-9：简报数字 vs 实测数字，逐条归因）

| # | 简报/上游给的数字 | 我实测的数字 | 差异归因 |
|---|---|---|---|
| R-1 | `tools/boundaries.mjs` 2290 行 | 开工 **2405** 行 → 收工 **2671** 行（净 +266） | 简报锚点是 E1 落盘**之前**的快照（E1 于 01:43 交过一轮）。我的 +266 行分布：`ownershipActionChannels()` 沙盒用例 `:2235-2430`（约 196 行）、通道④ + `scriptBlockSet` `:1114-1131`/`:1316-1341`、并集回落 `:1410-1437`、注入表 `:1362-1378` + CLI/ACCEPTED_FLAGS/HELP 三处、`helpSurfaceParity()` `:2430-2444`、`probeIndependenceFromLiveDefects()` `:2446-2479`。**未删任何断言、未加任何例外。** |
| R-2 | 简报未给 | `--self-test` 108/108 → **128/128**（+20） | +18 条通道用例（§1）+1 条反幻影三处同步 +1 条 A-28-2 探针锁。逐条计数：18+1+1=20，与总数吻合，无"用例外壳"。 |
| R-3 | 简报未给 | `--all` 开工前 18/21 3 红 → 收工仍 **18/21 3 红** | 3 条红全部非 E1a 名下（colors-no-hardcode / css-important-budget / web-home-transport），我没消解也没放宽；断言总数 21 未变（我没新增注册表条目，`--list` = 21 条在册）。 |
| R-4 | 简报："三条通道已实装" | 通道判定函数确在，但 **`--self-test` 里通道用例 0 条**；本轮 **18 条**；`tools/ownership.json` 里 `"actions"` 出现次数 **0 → 1** | "实装了但无人可走、无测试可证"= A-24-1 定义的幻影。用例是我补的；那 1 条 `"actions"`（`:336` `add-script-lines-only:A-34-3`）是**并行 E1b 落的**，不是我登记的（该文件不在我可写范围内）。 |
| R-5 | 简报 A-33-4：三条通道 + 各带疫苗 | 实交 **四条**（+A-34-3 预留）× 每条 1 绿 + N 红 + "无 patch 要证据" 红，另加"未知通道名不放行" | 第 4 条按简报第 1 项要求交付；未做成空壳：`add-script-lines-only` 在真实仓库上仍把 E2 那次含依赖行删改的改动咬红（1-V4）。 |
| R-6 | 简报第 2 条"口径修正 + 疫苗" | 口径与断言描述 E1 已交；疫苗本轮**我重跑**（2-V0~2-V5，含反向噪音半） | 真仓库噪音对账 1 读点 + 12 注释/测试/脚本 = 全部字面命中，逐处可归位。 |
| R-7 | 无（我自己引入的回归） | 通道分支一度抢占 `predecessorAllowedDiff`，使 `A-4` 的"T-12 只加依赖行"合法路径转红（E1b 登记 `"actions"` 之后才暴露） | **发现于 `--self-test`（该用例转红），修于 `:1410-1437` 并集回落**（只回落窄授权，绝不回落 `maxDiffLinesFor` 纯预算）。修后：A-4 用例恢复，且"A-4 + 通道"两条红同时命中同一处删改（`--self-test` 第 84 行可见两者叠加的 detail）。 |
| R-8 | 简报"工作区大量未提交改动是别人的" | `git diff` 实测 81 个文件在改、`--check-ownership --task T-02` 判 53 处越界（全为并行任务名下）；**`tools/boundaries.mjs` 本身在 git 里是未跟踪状态（`??`）** | 我未做任何 git 写操作（只用了 `status`/`diff` 只读）。未跟踪这点需要 TPM 决定何时 `git add`（见 §7-8）。 |

## 6. 未交项

**无。** 简报第 1~5 条全部有交付或有明确的"复核 + 执行证据"（第 4、5 条属"开工前已实装、本轮复核非空壳"，未重做也不该重做，见 §4/§5 的逐字比对）。**没有一条被我注册成空壳。**

## 7. 越界申请与待 TPM 拍板（我一行越界代码都没动）

1. **`tools/ownership.json` 的其余三条通道仍无人登记**：`delete-expired-entry`（A-28-3，条目在 `tools/exceptions.json`）、`extend-supplement`（A-30-8，条目在 `packages/shared/src/constants/**`）、`bounded-edit:<裁决号>`（A-30-10）。通道的判定函数与 18 条用例都在，但**登记条目在 `tools/ownership.json` 里，那是并行 E1b 名下**（简报点名该文件归 E1b）。请让 E1b 按 §1 的用例形态补齐这三条 `actions`，否则它们继续"可达但没人走"。
2. **E2 名下 `apps/web/package.json` 的红保留**（A-34-3②）：真实工作树 diff 里有 6~7 行依赖/脚本删改，`add-script-lines-only:A-34-3` 判红。**要消解需要的是另一条裁决或 E2 重做那笔改动，不是放宽通道。**
3. **`.gitignore` 的 A-33-9 授权没有机检通道**：owner 仍是 T-01（E1b 已在条目 reason 里登记 ⚠）。建议给 `bounded-edit:A-33-9` 或一条专用通道；我不改 owner、不动该文件。
4. **`--ownership-file P` 这个注入点请 TPM 追认**：它只为 `--self-test` 与出口轮疫苗在临时沙盒跑真判定而开，正式冒烟命令不传；读不到表 = 退出码 2（失败即关，绝不回落"无表=全放行"）。若不追认，我就把 §1 的用例改回"复制判据"那种更弱的形态 —— 那才是真的退步。
5. **`useQuery(` 不并入共用核心词表**（E1 已登记，我复核认同）：`apps/web` 的唯一合法传输面就是 trpc 的 `useQuery`，并进核心会把合规写法全扫红；`packages/ui` 的 `host.tsx`/`use-theme-toggle.ts` 本来在用 `localStorage`，塞进核心即误伤。若 Phase 5 想要更严，需要新裁决而不是改词表。
6. **T-12 名下两处注释里的 `fetch(`（§4 的红）**：按 A-27 同型案归 T-12 内容债（改写注释措辞），已由 E1 挂到 #26 内容债清偿轮 E3。门禁侧不动。
7. **一处措辞缺口（我发现但未改，怕改坏别人的流水线）**：`--check-ownership` 在**完全没给证据**（无 `--files`、无 `--diff-file`）时打 `NOTE …→ 无判定` 但汇总行写"触碰 0 个文件 → 无越界"、退出码 0。按 A-33-4"要证据"的口径，这里更该是退出码 2。改它会影响所有已按现行为写脚本的 agent（当前无任何 package.json script 调它，只有人肉/报告里调），请 TPM 点头再改。
8. **`tools/boundaries.mjs` 在 git 里是未跟踪文件（`??`）**：本轮 +266 行的门禁落地件没有版本控制保护（`tools/` 整个目录都未跟踪）。简报禁止我做任何 git 写操作，故只报告不动手。
9. **仓库根出现一个 `undefined/` 目录（00:09，非我产生）**：内容是 `undefined/temp/tsx-*/…` 的 tsx 编译缓存 —— 某个跑 `tsx`/`vitest` 的并行轮次里 `TMPDIR`（或 `TEMP`/`TMP`）未设置，Node 把 `undefined` 当路径拼了出来。它不是我的产物，按简报"工作区大量未提交改动是别人的，不要清理"我没动。建议：谁跑测试谁在自己的命令里显式带临时目录，或 TPM 决定是否把它加进 `.gitignore`（`.gitignore` 也不在我名下）。

