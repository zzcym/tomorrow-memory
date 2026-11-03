# 开发报告（批次3 出口轮 E1b：契约与登记工程师）

任务号口径：`--check-ownership --task T-03`（落点 3/4/5 的文案与错误码归 T-03 名下）+ `--task T-25`（落点 1 的两条 🆕owner）。
可写范围（四个落点）：`tools/ownership.json`、`.gitignore`、`packages/shared/src/constants/copy.ts`、`packages/shared/src/constants/errors.ts`。
`tools/boundaries.mjs` 归并行的 E1a —— 本轮**只读、只跑，零改动**（工作区内该行未被我碰过；下面的通道判定全部走 `--ownership-file` 注入表，不改仓库那份代码）。
**零 git 写操作**：本轮没有执行过任何 `git add / commit / stash / checkout / reset / clean / restore`。只用了 `git check-ignore` / `git status` / `git ls-files` / `git diff`（全为只读）。
未在 `data.db` / `packages/server/data.db` 上跑任何写操作或迁移（本轮完全没碰库）。

## 完成清单

| # | 交付项 | 裁决依据 | 落点 | 状态 |
|---|---|---|---|---|
| 1 | §10.4 第 8/9 行的两条 🆕owner 条目 + `schema/**`、`db/**`/`migrations/**`、`scripts/migrate.ts` 的 T-06→T-25 交接行 | A-33 一#4 · A-33-2 · §10.4 第 9 行 ①~⑤ + 落地约束④ | `tools/ownership.json` | ✅ done |
| 2 | `apps/web/package.json` 追加动作 `add-script-lines-only:A-34-3`（只登记条目，机检实装在 E1a 名下） | A-34-3 · A-30-5 · A-4 | `tools/ownership.json` | ✅ done（曾报的误伤副作用**已由 E1a 本轮修掉**，见证据 2「复核」+ 限制项 #1） |
| 3 | `.gitignore` 反向纳入 `mobile-memory/res/` + 两条 APK 产物忽略 | A-33-9（T-20 上报⑨/建议③） | `.gitignore` | ✅ done（只改文本，未 add） |
| 4 | A-30-7 的 7 项（8 条串）文案常量纯追加 | A-30-7 · A-8 · A-23 · T-12 报告 §5.1 | `packages/shared/src/constants/copy.ts` | ✅ done |
| 5 | 词名非法的 §4.6 缺码并入 `TM_ERRORS_SUPPLEMENT`（纯追加；三个冻结集合一字未动） | A-32-8（P-2）· A-28-4 · A-8 | `packages/shared/src/constants/errors.ts` + `bounded-edit:A-33-4` 一处键集合 | ✅ done |

### 本轮实际写过的文件（全部在落点内）

1. `tools/ownership.json` —— 112 → 115 条：新增 3 条、改写 4 条既有条目（`.gitignore` 仅补 reason 文本，`owner` 与行为未动）。
2. `.gitignore` —— 纯追加 8 行规则 + 注释块（第 70-87 行区间，`git diff` 见证据 3）。
3. `packages/shared/src/constants/copy.ts` —— 5 处纯插入（新增 1 个导出 + 4 个既有对象内追加键）。
4. `packages/shared/src/constants/errors.ts` —— 1 处纯插入（`TM_ERRORS_SUPPLEMENT` 内 +17 行，`+17/-0`）。
5. `packages/shared/test/contracts.spec.ts` —— **仅第 886 行 1 行改写**（`bounded-edit:A-33-4`，见证据 5）。

---

## 证据 1：§10.4 第 8/9 行的 owner 条目与交接行

写入的条目（`tools/ownership.json`，`path` 与关键字段）：

| path | owner | 机检钩子 | 判据出处 |
|---|---|---|---|
| `packages/server/src/db/migrations/007-assessment-cache-user-id.ts` | **T-25** | 独占 + reason 内写"合入后转只读" | §10.4 落地约束④ / A-33-4 |
| `packages/server/test/integration/assessment-isolation.spec.ts` | **T-25** | 独占 + 同上 | 同上 |
| `packages/server/src/db/migrations/{000,001,002,003,004,005,006}-*.ts` | T-06 | `zeroDiffFor: ["T-25"]` | §10.4 第 9 行判据① |
| `packages/shared/src/schema/**` | T-06 | `handoff: true` + `readers += T-25` + `successorConstraint` | 第 9 行判据② + A-33-2 时序门 |
| `packages/server/src/db/**` | T-06 | 同上 | 判据③ |
| `packages/server/src/scripts/migrate.ts` | T-06 | 同上 | 判据（追加注册 m007） |

**⚠ 路径更正（对账表第 6 行）**：简报写的 `packages/server/migrations/007-…` 与 `test/integration/…` 是简称，真实落点分别是
`packages/server/src/db/migrations/007-assessment-cache-user-id.ts`（§6.1 M7 行 + §10.4 第 9 行原文）与
`packages/server/test/integration/assessment-isolation.spec.ts`（§10.2 T-25 行原文）。按真实落点登记。

### 冒烟：条目放行 + 三面向后退（真实输出）

```
### P1: T-25 拥有两条新文件
TABLE E:\CC\tomorrow-memory\tools\ownership.json
--check-ownership task=T-25 触碰 2 个在册文件（清单 2 项 + patch 0 项） → 无越界

### P2(咬人): 别的任务去写 007
RED  packages/server/src/db/migrations/007-assessment-cache-user-id.ts 由 T-25 独占（当前任务 T-08）— …
RED  packages/server/test/integration/assessment-isolation.spec.ts 由 T-25 独占（当前任务 T-08）— …
--check-ownership task=T-08 触碰 2 个在册文件（清单 2 项 + patch 0 项） → 2 处越界

### P3(判据①): T-25 碰 000-006 → zeroDiffFor 生效
RED  packages/server/src/db/migrations/000-migrations-table.ts：§10.4 明示 T-25 对该文件零 diff
RED  packages/server/src/db/migrations/006-entry-updated-at-doc.ts：§10.4 明示 T-25 对该文件零 diff
--check-ownership task=T-25 触碰 2 个在册文件（清单 2 项 + patch 0 项） → 2 处越界

### P4(时序门 A-33-2): T-25 碰 schema/db/migrate.ts → 三条全红（预期，见「待 TPM 拍板项 #2」）
RED  packages/shared/src/schema/tables.ts 由 T-06 独占（当前任务 T-25）— …
RED  packages/server/src/db/sqlite.ts 由 T-06 独占（当前任务 T-25）— …
RED  packages/server/src/scripts/migrate.ts 由 T-06 独占（当前任务 T-25）— …
--check-ownership task=T-25 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 3 处越界
```

P4 的红**是本轮故意保留的失败关闭**：`predecessorAllowedDiff.kind` 的现有词表（`any` / `zero-diff` /
`import-lines-only` / `single-import-line` / `add-dependency-lines-only`）里**没有**"某个块内追加"这一档，
我不发明新 kind、也不给无上限的 `any`（A-33-4 明令"禁止把任何一条实装成不咬人的空壳"）。
开权必须由 TPM 拍板：E1a 增一种 kind，或批次4 现场约定 `maxDiffLinesFor.T-25` 的行数。

## 证据 2：`apps/web/package.json` 的动作通道登记

条目现状：`actions: ["add-script-lines-only:A-34-3"]`，`owner` 仍为 T-04，`predecessorAllowedDiff`（`add-dependency-lines-only`，
applies_to T-12/T-15/T-16）**一字未删**。E1a 已把通道④实装落盘（`boundaries.mjs:1317-1341`、`:1351` 分派），
所以本轮没有出现简报预警的"未知动作通道 → 不放行"，**无需保留那一种红**。

探针（合成 patch 建在系统临时目录，仓库内零新增文件；用完已删）：

```
### A: 在 "scripts" 块内加 1 行 + 任务 T-12（走 A-34-3 通道）
NOTE apps/web/package.json：走动作通道 add-script-lines-only:A-34-3（按实际 diff 判定：+1/-0 行）
--check-ownership task=T-12 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界

### B: 在 "dependencies" 块内加 1 行 + 任务 T-12（登记后）
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：
     1 行新增不在 scripts 块内（dependencies/devDependencies/版本号仍算越界）：apps/web/package.json:15 ""e1b-probe-dep": "0.0.0","
--check-ownership task=T-12 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界

### C: 同一条 dependency patch 打在【登记前】的表上（--ownership-file 注入，删掉 actions 一项）
TABLE C:\...\before.json  ← 注入表（非仓库 tools/ownership.json，仅用例/疫苗用）
--check-ownership task=T-12 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
```

A 证明通道**通**（E2 那次 A-30-5 授权改法现在合法）；B 证明它**咬**（改到依赖行仍红，A-34-3 的"仍然咬人"成立）；
C 是 B 的归因对照 —— **A-4 授权 T-12/T-15/T-16 加依赖行这件事，被我的登记从绿变成了红**。

### 复核（本轮收尾时重跑，盘面已被 E1a 改动）⚠ B/C 两例已过期

E1a 在我登记之后把 `checkOwnership` 的分支顺序改成了**并集回落**（`boundaries.mjs:1412-1438`，
注释里点名"两条授权是并集关系：走通任一条即放行"，且只回落到 `predecessorAllowedDiff`、
不回落到 `maxDiffLinesFor`）。⇒ 上面 **B 例的红已消失**，C 例暴露的误伤随之下方表格的 T-12/15/16 三格。
四象限重测（合成 patch 在系统临时目录 `dep.patch` / `scripts.patch`，仓库内零新增，用完即删）：

```
### D-1: dependencies 块 +1 行（A-4 授权面）—— 登记后的现表
task=T-12 → 无越界        task=T-15 → 无越界        task=T-16 → 无越界
task=T-13 → 1 处越界
RED  apps/web/package.json（通道 add-script-lines-only:A-34-3 不通过）：
     1 行新增不在 scripts 块内（dependencies/devDependencies/版本号仍算越界）：apps/web/package.json:39 ""some-new-dep": "^1.2.3","

### D-2: scripts 块 +1 行（A-34-3 通道面）
task=T-12 → NOTE 走动作通道 add-script-lines-only:A-34-3（按实际 diff 判定：+1/-0 行） → 无越界
task=T-13 → 同上一条 NOTE + 无越界
```

读法：**D-1 的 T-12/T-15/T-16 三格 = A-4 恢复**（走回落分支），**T-13 那格 = 通道仍咬**（不在 `applies_to`）；
**D-2 = A-34-3 的正例**。所以"登记动作通道会误伤加依赖行"这件事，在本轮结束前已经被 E1a 修掉，
不再需要 TPM 拍板修法（原待拍板项 #1 撤销，见该条）。
D-2 顺带暴露一个**登记语义事实**（不是我造成的，也不是红）：`actions` 是**条目级**授权，
分派时不看任务号 ⇒ T-13 这类与 `apps/web` 无关的任务也能靠这条通道往 `scripts` 块加行。
是否要把通道收窄成 `applies_to` 形态，归 E1a/TPM 判断，我只登记现象。

## 证据 3：`.gitignore`（A-33-9）

新增内容（纯追加，未删改任何既有行）：`!mobile-memory/res/`、`!mobile-memory/res/**`（含 6 行说明注释）、
`mobile-memory/tmword-*.apk`、`mobile-memory/tmword-*.apk.idsig`。注释里写明 ⛔ 不做 `git add -f`。

`.gitignore` 是本轮**四个落点里唯一被 git 跟踪**的文件，所以它是唯一能拿出真 `git diff` 的一个：

```
$ git diff --numstat -- .gitignore
26      0       .gitignore                      # ← +26 / -0 = 纯插入，机器可判，不靠我声称
$ git diff -U0 -- .gitignore | grep -c "^+[^+]"
23                                              # 23 行非空新增（另有 3 行空行 = 23+3 = numstat 的 26）
$ git diff -U0 -- .gitignore | grep "^-[^-]"
（空输出 = 0 行删除）
$ git diff -U0 -- .gitignore | grep -n "^@@"
5:@@ -61,0 +62,26 @@ deploy.sh                  # 单一个 hunk，接在 :61 之后，不动任何既有行
```

```
$ git check-ignore -v mobile-memory/res/mipmap-hdpi/ic_launcher.png        # 改前
.gitignore:38:*.png	mobile-memory/res/mipmap-hdpi/ic_launcher.png        # 改前（被忽略）

$ git check-ignore -v mobile-memory/res/mipmap-hdpi/ic_launcher.png        # 改后（-v 显示最后命中的规则）
.gitignore:77:!mobile-memory/res/**	mobile-memory/res/mipmap-hdpi/ic_launcher.png

$ git check-ignore mobile-memory/res/mipmap-hdpi/ic_launcher.png; echo exit=$?
exit=1                        # ← 无输出 + exit 1 = 不再被忽略（这才是判据）

$ git status --porcelain -uall -- mobile-memory/res
?? mobile-memory/res/mipmap-hdpi/ic_launcher.png
?? mobile-memory/res/mipmap-mdpi/ic_launcher.png
?? mobile-memory/res/mipmap-xhdpi/ic_launcher.png
?? mobile-memory/res/mipmap-xxhdpi/ic_launcher.png
?? mobile-memory/res/mipmap-xxxhdpi/ic_launcher.png
                              # ← 5 个图标可见但仍**未跟踪**，本轮没有 add（A-33-9：Phase 8 由 TPM 入库）

$ git check-ignore -v mobile-memory/tmword-dev.apk mobile-memory/tmword-v1.5.0.apk.idsig
.gitignore:86:mobile-memory/tmword-*.apk	mobile-memory/tmword-dev.apk
.gitignore:87:mobile-memory/tmword-*.apk.idsig	mobile-memory/tmword-v1.5.0.apk.idsig

$ git check-ignore -v gui-test-screenshots/r1_report_fixed.png   # 反向纳入没有扩大范围
.gitignore:38:*.png	gui-test-screenshots/r1_report_fixed.png   # ← 仓库其它 png 照旧被忽略
```

盘上真实产物状态（不是分词探针）：`mobile-memory/tmword-dev.apk`(177536B) 与 `tmword-dev.apk.idsig`(5496B)
现在被新行忽略；legacy 的 `明日记忆.apk` / `.apk.idsig` 在 `git status` 里仍是 ` M`（**未被我的规则吸收**，
与 A-33-12"绝不覆盖 legacy 件"一致）。第二行 `.idsig` 探针用了合成名 `tmword-v1.5.0.apk.idsig`（真实存在的那份是
`tmword-dev.apk.idsig`，已在上一行验中），**没有创建任何文件**。

**`-v` 的退出码坑（避免后人误读上面三行）**：`check-ignore -v` 打印的是**最后命中**的规则并因此 exit 0，
即使那条是反向规则——所以判据只能用不带 `-v` 的形式（exit 1 = 不被忽略）。真实输出：

```
$ for f in mobile-memory/res/mipmap-hdpi/ic_launcher.png mobile-memory/res/drawable/ic_stat_tm_wordbook.png \
           mobile-memory/keystore.jks mobile-memory/tmword-dev.apk; do \
      git check-ignore "$f" >/dev/null 2>&1; echo "exit=$? $f"; done
exit=1 mobile-memory/res/mipmap-hdpi/ic_launcher.png
exit=1 mobile-memory/res/drawable/ic_stat_tm_wordbook.png
exit=1 mobile-memory/keystore.jks
exit=0 mobile-memory/tmword-dev.apk
```

### ⚠ 本轮新发现的 P0 面（不在 A-33-9 授权的两条之内，故只上报不擅自改）

上面第三行：`mobile-memory/keystore.jks` **exit=1 = 不被忽略**。它是未跟踪文件，Phase 8 若有人图省事跑
`git add -A`，签名密钥本体就会进版本库——与 02-tech-design.md:187「keystore 本体仍严禁入库，RK-13」、
B-08「口令/密钥不入库」直接冲突。我的两条 `!mobile-memory/res/**` 只作用于 `res/` 子树，**既没有造成也没有
消除**这个口子（`.jks` 在 `mobile-memory/` 根，不被任何 res 规则命中）。

最小修法是一行纯追加（本轮未执行，等 TPM 点头，我可在同一落点立刻补上并重跑 6 条出口命令）：

```
mobile-memory/keystore.jks
```

不动它的原因：A-33-9 给我的只两条（图标反向纳入 + APK 产物忽略），第三类文件属新增授权面；
`.gitignore` 的 owner 仍是 T-01，我不在「裁决没写」的事上替自己扩权。

## 证据 4：A-30-7 的 7 项文案常量（纯追加，不改名）

| A-30-7 清单串 | 新常量落点 | 之前谁在用（宿主注入，仍合法） |
|---|---|---|
| `主导航` | `ARIA.primaryNav` | `header.tsx:138` + `mobile-nav.tsx:140`（两处各一份） |
| `切换深色·浅色` | `ARIA.themeToggle` | `header.tsx:139` 现值是 `切换深色/浅色` → **偏差①** |
| `我的` | `ARIA.profileLink` | `header.tsx:140` `TM_PROFILE_LABEL`；`NAV_ITEMS[4]` 已有 tab/title |
| `和 AI 聊聊` | `MORE_NAV_LABELS.chat`（新导出） | `apps/web/src/lib/nav.ts:30` |
| `测一测词汇量` | `MORE_NAV_LABELS.assess`（新导出） | `apps/web/src/lib/nav.ts:31` |
| `不是这个？换个查询方向` | `LOOKUP_COPY.directionSwitch` | `home/result-section.tsx:36` |
| `柯林斯` | `WORD_DETAIL_SECTION_LABELS.collins` + 组装函数 `WORD_DETAIL_COPY.frequencyCollins(freq)` | `word-lookup.tsx:34` `collinsBadge()` |
| `该单词已在单词本中` | `WORDBOOK_COPY.alreadyAdded` | `word-lookup.tsx:32` |

- 5 次编辑**全部是对象/文件内的行插入**，既有键一个未改名、未改值（`contracts.spec.ts:763` 的
  "shared 导出面只增不减"用例仍在、仍绿）。
- `frequencyCollins()` 的整串从 `WORD_DETAIL_SECTION_LABELS.collins` **组装**，不在函数里重复 `柯林斯` 字面量。
- **本轮没有动任何页面/组件**（宿主注入的旧用法继续可用，A-8/A-23 口径）。
- 简报说"7 项"，A-30-7 括号里的串实际是 **8 条**（`我的` 与其余 7 条并列）⇒ 8 条全部落码，对账表第 5 行。

## 证据 5：词名非法的 §4.6 缺码（`bounded-edit:A-33-4`）

`TM_ERRORS_SUPPLEMENT` 追加 `INVALID_WORDBOOK_ENTRY`：`http: 400`、
`copy: \`这个词没法存进单词本（词名不能为空，最长 ${WORD_MAX_LENGTH} 个字符）\``（模板字面量从 `limits.ts` 组装，
写法照 `INVALID_WORD` 那几条）、`from: 'A-32-8 P-2 / R-03⑦（原 400 机器话缺码）'`。
域内**没有**新建第二份码表；服务端把 400 出口换成 `errorMessage()`/`supplementErrorStatus()` 属 T-09 名下，本轮不改 `packages/server/**`。

### 冻结面未被触碰：三门独立取证

```
① 门禁通道判定（注入表把 actions:["extend-supplement"] 挂到 packages/shared/src/constants/**，task=T-99 非 owner）
$ node tools/boundaries.mjs --check-ownership --task T-99 --diff-file errors.patch --ownership-file table-supplement.json
NOTE packages/shared/src/constants/errors.ts：走动作通道 extend-supplement（按实际 diff 判定：+17/-0 行）
--check-ownership task=T-99 触碰 1 个在册文件 → 无越界
   ⇒ 通道自己算出的两条硬判据同时成立：**0 既有行变更**（A-30-8）+ 新增行不落进任何冻结符号区间。

② 疫苗（故意造一次应红 → 红 → 删除，探针文件全在系统临时目录，已 rm）
把同一行的位置改成 TM_ERRORS 内部（新文件第 101 行）再判：
RED  packages/shared/src/constants/errors.ts（通道 extend-supplement 不通过）：extend-supplement：
     追加落进 §4.6 冻结符号 TM_ERRORS（79-178 行）的第 1 行 —— 三个冻结集合一字不能动，只能进 TM_ERRORS_SUPPLEMENT
   ⇒ 通道不是空壳，它真的在盯冻结区。

③ 冻结符号区间（按门禁同一套 braceDepth 口径实测）
TM_ERROR_CODES = 行 20-39 / TM_ERROR_ROWS = 行 47-64 / TM_ERRORS = 行 79-178
TM_ERRORS_SUPPLEMENT = 行 215-239（改动前 215-222）⇒ 全部 +17 行都在 222 之后，1-221 行一字未动
```

（说明：`errors.ts` 的 patch 基线是**用当前文件反向删掉我那 17 行重建的**，因此"基线是我自己的重建件"这一点如实登记；
但 ①②③ 三条判据读的都是**盘上真实文件的冻结区间**，与基线怎么来的无关 —— 更强的独立证据是
`contracts.spec.ts:872` 判据①（`TM_ERROR_CODES`/`TM_ERRORS` 各 18、`TM_ERROR_ROWS` 16、补充码不在三个冻结集合里）
与 `:946` 的组装断言，它们**全部绿**，见「出口命令」段。）

### `contracts.spec.ts` 的 `bounded-edit:A-33-4`

**简报预警的键集合钉死确实存在**，就在 `packages/shared/test/contracts.spec.ts:885-887`（`② supplement 键集合 = …`）。
最小行编辑 = **只改第 886 行一处数组字面量**。

`git diff -U0` **对该文件不可用**：`packages/shared/test/contracts.spec.ts` 在 HEAD 里**不存在**（未跟踪）——
`git ls-files --error-unmatch` 报 `did not match any file(s) known to git`，`git diff -U0` 输出为空。
这正是 A-34-2 的盘面事实（批次1~3 产出只活在工作区），**空输出不等于"我没改"**。替代证据 = 用重建基线跑同一条 `-U0`：

```
--- a/packages/shared/test/contracts.spec.ts
+++ b/packages/shared/test/contracts.spec.ts
@@ -886 +886 @@
-      [...SUPPLEMENT_REVIEW_CODES, 'FORBIDDEN'].sort(),
+      [...SUPPLEMENT_REVIEW_CODES, 'FORBIDDEN', 'INVALID_WORDBOOK_ENTRY'].sort(),
--- 统计：新增 1 行 / 删除 1 行（全文件唯一改动，第 886 行）---
```

**它不是纯插入**：`Object.keys(TM_ERRORS_SUPPLEMENT)` 是等值断言，纯插入无法扩键集合（不改这一行 = 该用例必红，
而删断言是被禁止的放宽）。幅度 2 行（-1/+1）就是这件事的下界，按 `bounded-edit` 的"按实际 diff 行判"口径登记。

⚠ 该文件的 `it()` 标题（"= FORBIDDEN + 复习域 5 码"）改后略陈旧 —— 改标题要多花 1 行 diff，本轮**没改**，登记给批次4。

### 一处事实更正

简报说"钉住 supplement 键集合的只可能是 `contracts.spec.ts`（**T-11 名下**）"。实测 `tools/ownership.json` 现状：
`packages/shared/test/**` 的 `owner` = **T-03**（reason 原文就写着"§10.2 T-03 行 🆕packages/shared/test/contracts.spec.ts"）。
⇒ 本轮这次编辑**根本不需要动作通道**（T-03 就是 owner），`--check-ownership --task T-03 --files …contracts.spec.ts` 直接绿。
仍按指示以 `bounded-edit:A-33-4` 口径在报告里登记幅度。归 T-11 的是 `packages/server/test/integration/{chat-isolation,profile-dto}.spec.ts`。

---

## 出口命令（真实跑、真实贴，终态）

> 本块 6 条在收尾时（本机 02:16–02:24）**第二次全量重跑**过一遍，逐条结果与本块一致，
> 唯一抖动是 vitest 的耗时读数（87–91ms）。两次跑之间 `tools/boundaries.mjs` 被并行的 E1a 改过，
> 所以这 6 条的绿灯是在**他机改后的门禁上**取得的；E1a 若继续改分支顺序，批次3 收口时应复跑。

```
$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src,
     packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红）
1/1 条通过，全绿                                                      # ← 改前改后同一结果，仍绿

$ node tools/boundaries.mjs --password
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187
     （另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处
3/3 条通过，全绿

$ pnpm --filter @tm/shared test
 ✓  @tm/shared  test/contracts.spec.ts (50 tests) 90ms
 Test Files  1 passed (1)
      Tests  50 passed (50)                                # ← 改前基线也是 50 passed，本轮不增不减用例

$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit                            # 0 错，exit 0

$ node tools/boundaries.mjs --check-ownership --task T-03 --files \
      packages/shared/src/constants/copy.ts,packages/shared/src/constants/errors.ts,packages/shared/test/contracts.spec.ts
--check-ownership task=T-03 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 无越界

$ node tools/boundaries.mjs --check-ownership --task T-25 --files \
      packages/server/src/db/migrations/007-assessment-cache-user-id.ts,packages/server/test/integration/assessment-isolation.spec.ts
--check-ownership task=T-25 触碰 2 个在册文件（清单 2 项 + patch 0 项） → 无越界
```

### 保留的红（**不修、不放宽、不删条目**，逐条归因）

```
$ node tools/boundaries.mjs --check-ownership --task T-03 --files …,.gitignore
RED  .gitignore 由 T-01 独占（当前任务 T-03）— §10.3 第 4 行 … A-33-9 记录 …
→ 归因：A-33-9 把「改 .gitignore 文本」派给 T-02/E1，但该条目 owner=T-01 且无机检通道。
  我只在 reason 里补了 A-33-9 的记录（owner 与行为一字未动），红保留 = 裁决即授权，与 A-30-8 那次同口径。

$ node tools/boundaries.mjs --check-ownership --task T-03 --files tools/ownership.json
RED  tools/ownership.json 由 T-02 独占（当前任务 T-03）
→ 归因：本轮以出口轮 E1b 身份写 E1a/T-02 名下的登记件（A-34-3 明确"E1b 在 tools/ownership.json … 追加动作"）。
  以 `--task T-02` 判则绿。这是**任务号身份**问题，不是越权改他人文件。
```

其它并行 agent 名下的红（本轮**未触碰、未跑**，不属我）：`@tm/server test` 的 `trpc-shape` 基线（A-28-1，留 E3 再生）、
`@tm/web typecheck` 的 `profile/page.tsx:92`（A-34-1 归 T-11 微轮）、`@tm/agent` 0 用例（A-34-4 归批次4 T-08）。

## 盘面数字对账表（A-32-9）

| # | 数字 | 简报/裁决写的 | 本轮实测 | 归因 |
|---|---|---|---|---|
| 1 | `--copy` 通过条数 | A-33 只写"绿" | 1/1，改前后同（例外豁免 76 / 人工复核词 126 两次一致） | 本轮新增的 8 条文案与 1 条错误码不含任何禁词——由 `copy-legacy-zero` 这条机检在 `packages/shared/src` 上实测，非人工比对 |
| 2 | `--password` | A-32-5 把它挂上 `enforce-flag-single-read` | 3/3 绿，读点仍 = 1 | 与我无关，未动 |
| 3 | `@tm/shared` 单测 | A-34 盘面未给数 | 改前 50/50 → 改后 50/50 | 登记轮**不新增用例**；唯一被动的键集合断言按 -U0 改 1 行 |
| 4 | `tools/ownership.json` 条目数 | — | 112 → 115 | +3（007 / assessment-isolation / 000-006 精确零 diff 行）；另改写 4 条既有条目 |
| 5 | A-30-7 的"7 项" | 写"7 项文案常量" | 清单括号里是 **8 条串** | 计数口径差：`我的` 与另 7 条并列。8 条全部落常量，无遗漏 |
| 6 | 两条 🆕 路径 | `packages/server/migrations/007-…`、`test/integration/assessment-isolation.spec.ts` | 实际 `packages/server/src/db/migrations/007-…`、`packages/server/test/integration/…` | 简报用简称；按 §6.1 M7 行与 §10.2 T-25 行的真实落点登记 |
| 7 | `contracts.spec.ts` 归属 | 简报：T-11 名下 | 表内 `packages/shared/test/**` owner = **T-03** | 简报口径有误 ⇒ 本次编辑**无需**动作通道即绿；已按 `bounded-edit:A-33-4` 登记幅度 |
| 8 | supplement 键数 | 裁决：`FORBIDDEN` + 复习 5 码 = 6 | **7**（+ `INVALID_WORDBOOK_ENTRY`） | A-32-8 P-2 的必然结果；`REVIEW_ERROR_CODES` 仍 5 条（`:892` 的 `toHaveLength(5)` 未动、绿） |
| 9 | `git check-ignore` 图标 | T-20：5 个图标被忽略 → 干净克隆 aapt2 必红 | 改前 `.gitignore:38` 命中；改后不带 `-v` exit=1，5 个 `??` 可见 | 判据成立；**未 add**（A-33-9 禁令） |
| 10 | `git diff -U0`（spec） | 简报要求贴它 | 空输出（文件未跟踪，A-34-2） | 用重建基线的 `-U0` 替代并标注"基线是重建件"；`git status` = `M .gitignore` / 4 个 `??` |
| 11 | `mobile-memory/keystore.jks` 的忽略状态 | A-33-9 未提，简报未提 | 实测 `git check-ignore` **exit=1 = 不被忽略**（未跟踪） | 本轮新发现的 P0 面：`git add -A` 会把签名密钥本体入库，撞 RK-13/B-08。我**没加**这一行（超出 A-33-9 两条授权），见待拍板项 #3 |


## 越界申请

无。本轮**没有**写过四个落点之外的任何仓库文件；探针用的合成 patch / 注入表 / 基线副本全部落在系统临时目录并已删除。

## 契约偏差（需 TPM/PM 拍板）

1. **`切换深色·浅色`（A-30-7 逐字）vs `切换深色/浅色`（现网 `header.tsx:139` 宿主注入值）** —— 我按裁决清单逐字落了间隔号版，
   并把差异写进常量注释；两串哪一条是定稿值我没资格定，批次4 收敛前 `ARIA.themeToggle` 与现值**不同形**。
2. **`柯林斯` 在 `03-ui-spec.md` 全篇 0 命中**（实测 `grep -n 柯林斯 .delivery/03-ui-spec.md` = 无输出，`频率` 亦 0 命中）
   ⇒ 该串及其渲染格式（`柯林斯 5`）没有规范定稿面，来源只有 T-12 报告的"shared 缺常量"清单。请 PM 在 v1.5 补进 §6.4/§6.8。
3. **`ARIA.profileLink: '我的'` 与 `NAV_ITEMS[4].tab/title` 同值三处** —— 语义不同（可见标签 vs 可访问名），未合并；
   定稿 §6.8 后建议由 T-03 收敛为单一导出。
4. **`INVALID_WORDBOOK_ENTRY` 的 copy 是新串**，服务端现值仍是 400 `数据格式错误`（`wordbook-service.ts:614-615` /
   `wordbook-merge.ts:479`）⇒ 旧 APK 在这一条上看到的 `error` 键**暂时不变**（我无权改 `packages/server/**`）。
   切换出口需要 T-09 的一行改动 + 一条 parity 用例；坏 JSON 与词名非法是否拆成两条码，请 PM 定。

## 已知限制与 TODO（诚实列出）

1. **~~待 TPM 拍板项 #1~~（已撤销：E1a 本轮内修掉，无需拍板）**：我登记 `add-script-lines-only:A-34-3` 后曾出现
   `checkOwnership`（`boundaries.mjs:1408-1415` 旧形）在条目带 `actions` 时**先判通道并 `continue`**、
   `predecessorAllowedDiff` 分支根本走不到 ⇒ **A-4 授权 T-12/T-15/T-16 往 `apps/web/package.json` 加依赖行从绿变红**。
   现在的状态：E1a 已在 `:1412-1438` 实装**并集回落**（通道未通过时回落到 `predecessorAllowedDiff`，
   且明确不回落到 `maxDiffLinesFor`），证据 2 的 D-1 四格实测 A-4 授权已恢复。
   **残留小面（仍请 E1a/TPM 过目，我不擅改他人文件）**：`actions` 通道分派不看任务号 ⇒
   任何非 owner 任务都能往 `apps/web/package.json` 的 `scripts` 块加行（D-2 的 T-13 格）。
   我**没有**为变绿删条目、没改 owner、没动 `boundaries.mjs`。
2. **待 TPM 拍板项 #2**：§10.4 第 9 行判据②③④ 的幅度（"块内追加"）在现有 `kind` 词表里没有对应档 ⇒
   T-25 对 `schema/**`、`db/**`、`scripts/migrate.ts` 的写权仍是红（证据 1 的 P4）。批次4 开工前需拍板。
3. §10.4 第 **8** 行的两条（`trpc/routers/assessment*.ts` 的 T-08→T-25、`assess/page.tsx` 的 `maxDiffLines:8`）
   **不在本轮交付清单内，我没有写**。`assess/page.tsx` 现条目 owner=T-12（§10.4 第 1 行），与第 8 行的 T-25 认领**尚未合并**
   ⇒ 批次4 T-25 开工必红，需 TPM 单独拍一行归属。
4. `contracts.spec.ts:884` 的 `it()` 标题陈旧（说"5 码"、实为 7 键），本轮为守住 1 行幅度未改。
5. `packages/server/src/app.ts:134` 挂着 `TODO(T-03 / 报告 H-1)：TM_ERRORS_SUPPLEMENT 追加 REQUEST_TOO_LARGE`，
   以及 `avatar-service.ts:33` 自注"shared 无对应码" —— 同属 supplement 扩展位的欠账，**不在 A-30-7/A-32-8 清单里**，
   本轮没做（不自己加没被授权的码），登记给批次4 的 T-03 轮。
6. `packages/shared/dist/**` 里 `errors.d.ts` 是旧构建产物（仍写着 6 键 supplement）。测试/类型检查走 `src`，
   不影响本轮判据；下次 `pnpm --filter @tm/shared build` 会自然刷新，我没跑 build（不在出口命令清单内）。
7. **待 TPM 拍板项 #3（安全面，一行就能修）**：`mobile-memory/keystore.jks` 实测 **exit=1 = 不被 `.gitignore` 忽略**
   （证据 3 的退出码对照表），未跟踪状态下任何一次 `git add -A` / `git add .` 都会把**签名密钥本体**送进版本库
   —— 直接撞 RK-13 与 B-08「keystore 本体严禁入库」。我的两条 A-33-9 规则只作用于 `res/` 子树，既没造成也没消除它。
   修法 = `.gitignore` 纯追加一行 `mobile-memory/keystore.jks`。**本轮没动手**：A-33-9 只授权两条，
   且该条目 owner=T-01。点头后我在同一落点补上并重跑 6 条出口命令。

## 给测试的提示（Phase 5 / QA）

- **判据① 的机检面**：`--check-ownership --task T-25 --files …007…,`assessment-isolation.spec.ts`` 必绿；
  把 task 换成 T-08 或 T-06 必红。000-006 的零 diff 用 `--task T-25` 探（P3 输出即模板）。
- **A-34-3 通道**：改 `scripts` 块内行 ⇒ NOTE"走动作通道"；改 `dependencies`/版本行 ⇒ 对**不在 `applies_to` 里的任务**红、
  对 T-12/T-15/T-16 走 E1a 的并集回落 ⇒ 绿（证据 2 的 D-1/D-2 四格即当前真值，可直接当用例模板）。
  批次4 前**再跑一次这四格**，因为 E1a 还在改 `checkOwnership` 的分支顺序。
- **冻结面回归**：`contracts.spec.ts` 判据①（18/18/16 + 补充码不在冻结集合）与 `⑤ 数字域是组装的`（改 `WORD_MAX_LENGTH`
  ⇒ `INVALID_WORD`/`INVALID_WORDBOOK_ENTRY` 跟着变）是本轮最该盯的两条；想验"真组装"，把 `WORD_MAX_LENGTH`
  临时改 63 跑一次 `pnpm --filter @tm/shared test`，两条都该红（改完必须还原）。
- **`.gitignore` 判据只能验到"不再被忽略"**，验不到"干净克隆可打包" —— 后者要 T-20 的构建链在**入库之后**跑
  （A-33-10/A-34-2：批次3/4 禁止 commit，结论必须附"前提：脚本与图标已入库"）。
- **A-30-7 的 8 条串本轮只是"shared 里有了"**，各页面仍走宿主注入 ⇒ UAT 阶段不要按"已收敛到 shared"判过，
  真正的替换动作在批次4 的 T-12/T-15/T-17 面上；偏差 1/2 未定稿前，主题切换按钮的无障碍名会出现
  `·` 版（新常量）与 `/` 版（现网）两种，读屏走查时以 PM 定稿的那一版为准。
