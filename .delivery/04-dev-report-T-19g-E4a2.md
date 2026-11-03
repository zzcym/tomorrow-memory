# 04-dev-report-T-19g-E4a2 — 批次4 出口轮 E4a2（归属与账面补录）

轮次：E4a2（批次4 出口·第一轮）｜日期：2026-09-21｜可写面：`tools/ownership.json` + 本报告
性质：**只补账面，不改任何产品代码/测试**。

---

## §0 开工前核简报：三处与盘面不符，点名更正

简报 §F 末段要求「凡 TPM 写的因果/口径都算假说，以实跑输出为准，发现错了在 §0 点名更正」。本轮核出三处，全部成立：

| # | 简报口径 | 盘面实况（我亲跑） | 影响与处置 |
| --- | --- | --- | --- |
| 0-1 | §C-3：「幅度按 A-74 #235 实测口径写进 reason：**T-19g-i/ii/iii 对 shared 面 +50 / +15 / +162**」 | 那三个数**不是三轮的分配，是一轮三文件**。`04-dev-report-T-19-g-i.md` ②-1/2/3 原文：`copy.ts` 862→912（**+50**）、`limits.ts` 138→153（**+15**）、`contracts.spec.ts` 1041→1203（**+162**）。A-74 #235 原文也是这么写的：「实测幅度 `copy.ts` +50 / `limits.ts` +15 / `contracts.spec.ts` +162」。**T-19g-ii/iii/iv/v 对 `packages/shared/**` 是 0 diff**：ii 报告 §1 把 `packages/shared/**` 列进禁动清单并申报「均 0 diff」；iii 全文只在**读** shared（§0 核对表）；iv 报告 §3-1 以开工前 sha256 快照自证 shared 未动；v 无申报。⇒ 三颗窄条目的帽子**只给 T-19g-i 一颗**，不给 ii/iii 编授权（§D-3「不许给不存在的轮次编 owner」的同族） | 已按盘面落账，reason 里点名出处 |
| 0-2 | §C-3/§C-4：「起始行数无独立记录者按 A-74 #233 标 待证」暗示**只有一部分**要标 | A-74 #233① 的口径是**全部**：`git ls-files` 显示 `packages/shared/**` 与 `apps/app/**` **整目录未跟踪**（本轮实测：`git status --porcelain` 里 `apps/`、`packages/shared/` 全是 `??`/未列）⇒ 三颗 shared 文件的 862/138/1041 与 me-screen 的 884/913/1242/1745/1828 **一律无独立记录可核**。终态可钉：本轮 `wc -l` 亲测 copy.ts **919** / limits.ts **153** / contracts.spec.ts **1203** / me-screen.spec.tsx **2059** | 五处全部标 待证，只 `wc -l` 钉终态。另：copy.ts 盘面 919 ≠ T-19g-i 申报终态 912，差的 7 行 = A-74 #237① 记的 **TPM 本人**那次上收（`CHECKIN_COPY.notDone.headline`，912→919），它不属任何 dev 轮 ⇒ 没有登记成任务号授权 |
| 0-3 | §A-1/§D-2：「已有 **135** 条 `"path"`」「不改既有 **134** 条」 | `python json.load` 实测：`ownership` 数组 = **133** 条，`unowned_but_guarded` 另有 2 条 `path` ⇒ `grep -c '"path"'` = **135**。也就是 135 是「`path` 字样出现次数」，**在册归属条目是 133 条**（§D-2 说的 134 也差一颗） | 本轮出口数：133 + **8 条新增** = **141** 条（`path` 字样 143）。tasks 名册 33 → **37**（见件1 的必要性论证） |

另有一条**简报未预见的结构性事实**（不是 TPM 的错，是盘面的错），记在件2 与 §5-F-41。

---

## §1 出口判据（逐条原始输出）

（本节在收尾时按 §E 逐条填，原始日志全部留存于 `C:/Users/曹怡明/AppData/Local/Temp/e4a2/`，文件名带序号 + 设定）

## 件1 · 四颗 spec 补 owner（§C-1）+ `tasks` 名册补 4 号

### 1.1 改前盘面：四颗查无条目（原始输出，`node …/probe_cov.mjs` 用 `matchOwnership` 真函数逐文件比对，非 grep）

```
NO-ENTRY apps/app/test/about-screen.spec.tsx
NO-ENTRY apps/app/test/me-screen.spec.tsx
NO-ENTRY apps/app/test/security-screen.spec.tsx
NO-ENTRY apps/app/test/upgrade-screen.spec.tsx
```
同一次探测里 `apps/app/test/` 另 12 颗、`apps/app/src/screens/` 11 颗、`apps/web/e2e/` 7 颗**全部有胜者条目**（简报 §B 的「16 颗 spec / 4 颗查无 / screens+e2e 全绿」逐字对上）。

### 1.2 登记面（四条精确条目，字段与措辞照 E4a 件1 那一族）

| path | owner | reason 引的文件头原话（我 `head -8` 逐字复点，与简报 §A-3 相符） |
| --- | --- | --- |
| `apps/app/test/about-screen.spec.tsx` | **T-19f** | 「T-19f 判据自证（App「关于」屏 `#/me/about`）—— `apps/app/test/about-screen.spec.tsx`。」 |
| `apps/app/test/security-screen.spec.tsx` | **T-19d** | 「T-19d 判据自证（App 账号安全屏 `#/security`，普通改密面）—— `apps/app/test/security-screen.spec.tsx`。」 |
| `apps/app/test/upgrade-screen.spec.tsx` | **T-19c** | 「T-19c 判据自证（App 强制改密全屏 `#/upgrade-password`）—— `apps/app/test/upgrade-screen.spec.tsx`。」 |
| `apps/app/test/me-screen.spec.tsx` | **T-19e**（+ 件4 的窄通道） | 「T-19e + T-19g-ii 判据自证（App「我的」屏 `#/me`）—— `apps/app/test/me-screen.spec.tsx`。」 |

四行 `wc -l` 终态（本轮亲测，供日后对账钉死）：

```
$ wc -l apps/app/test/about-screen.spec.tsx apps/app/test/me-screen.spec.tsx apps/app/test/security-screen.spec.tsx apps/app/test/upgrade-screen.spec.tsx
   449 apps/app/test/about-screen.spec.tsx
  2059 apps/app/test/me-screen.spec.tsx
   996 apps/app/test/security-screen.spec.tsx
   910 apps/app/test/upgrade-screen.spec.tsx
  4414 total
```
`security-screen` 996 与 `04-dev-report-T-19-d.md` §① 申报的 `996 apps/app/test/security-screen.spec.tsx` 逐字相符。
```

### 1.3 一件 TPM 未预见、但**必须**做的配套：`tasks` 名册补 4 号

`tools/boundaries.mjs:1591-1607` 的 owner 名册校验（E4a 件3④）会把「`owner`/`per_file` 引用了 `tasks` 名册里没有的任务号」压进 `rejections` → `--check-ownership` 出口码 2，并且 `--self-test` 的用例 ⑤（`:2987`）**拿仓库真表**断言 `tableErrors.length === 0`。盘上名册原本只到 `T-19a`/`T-19b` 两颗子轮（33 号），**`T-19c/d/e/f` 与 `T-19g-*` 一律不在册**（简报 §B/§C 未提这一点）。⇒ 若把 owner 写成 T-19f 而不补名册，`--self-test` 直接判红。

处置（A-67 #187 的先例正是「件1 … **`tasks` 名册补 9 号**」，同族做法）：名册新增 4 行，出处逐条指向盘上报告文件名。

```
  grep -n '"T-19[cdef]":' tools/ownership.json
40:    "T-19c": { "batch": 4, "title": "App 强制改密全屏 `#/upgrade-password`（T-19 拆分 c 轮，出处 04-dev-report-T-19-c.md；E4a2 件1 为名册校验补登）" },
41:    "T-19d": { "batch": 4, "title": "App 账号安全屏 `#/security` 普通改密面（T-19 拆分 d 轮，出处 04-dev-report-T-19-d.md；E4a2 件1/件2 补登）" },
42:    "T-19e": { "batch": 4, "title": "App「我的」屏 `#/me`（T-19 拆分 e 轮，出处 04-dev-report-T-19-e.md；A-74 #235 指定为本屏 spec 的 owner）" },
43:    "T-19f": { "batch": 4, "title": "App「关于」屏 `#/me/about`（T-19 拆分 f 轮，出处 04-dev-report-T-19-f.md；E4a2 件1 补登）" },
```
**刻意不给 `T-19g-i…v` 建名册行**：这五号只出现在 `maxDiffLinesFor` 的键位（授权幅度）与 reason 正文里，**不参与 owner 名册校验**（校验面只有 `owner` 与 `per_file`，源码实测），建了就是"为凑绿而发明任务行"。简报 §D-3 禁的是编 owner，不是登记实际存在的轮号；A-74 #235 那句「本轮不动名册」约束的是 dev 轮 T-19g-i（它没动，判对），出口轮按 #187 先例动。

### 1.4 出口面复点（改后，`node tools/boundaries.mjs --check-ownership`，真表）

```
### 正证2 T-19f / about-screen
TABLE E:\CC\tomorrow-memory\tools\ownership.json

--check-ownership task=T-19f 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 无越界
exit=0
```

## 件2 · `login-screen.spec.tsx` 的跨主改动补记（§C-2）

### 2.1 出处（两轮都在盘上找到了，**没有**需要标「找不到出处」的一半）

| 轮 | 报告与原文（逐字摘自盘上文件） | 幅度 |
| --- | --- | --- |
| **T-19c** | `04-dev-report-T-19-c.md` 交付清单行：「`apps/app/test/login-screen.spec.tsx` \| 653 \| **只动 B-02 一处**(:370-375)：T-19b 留的哨兵 `not.toMatch(/ChangePasswordInputSchema\|ForceUpgradeInputSchema\|change-password\|force-upgrade/)` 与本轮交付正面冲突 ⇒ 改成"强制改密工厂/端点各**恰一处**、普通改密面继续禁止"。**用例数不变**」；同报告 §缺陷自报第 3 条另给起算点：「行数 642（T-19b 报告口径）→ 653 的差值我无法用 git 核对（`apps/app/` 整目录未入库）」 | 642 → 653 ⇒ 净 **+11** |
| **T-19d** | `04-dev-report-T-19-d.md` §① 清单行：「`apps/app/test/login-screen.spec.tsx` \| ✏️peer 哨兵改判 \| `666 apps/app/test/login-screen.spec.tsx`」；§② 标题：「peer 哨兵改判交底（`login-screen.spec.tsx:368-390`，A-61 #169 三件套逐件）」，正文自陈「本用例的 `not.toMatch` 由 2 条变 3 条 … 正面计数由 7 条增到 11 条。**净效果是门槛提高，不是放松。**」 | 653 → 666 ⇒ 净 **+13** |

盘面终态与 T-19d 申报逐字相符：`666 apps/app/test/login-screen.spec.tsx`（本轮 `wc -l` 亲测，见件3 的合并输出）。
⚠ 待证：11/13 是**净行数**（`wc -l` 差），不是 diff 的 added+removed；`apps/app/**` 未跟踪 ⇒ 无 diff 可折（A-74 #233① 同口径）。

### 2.2 登记形状：一条一 path（A-67 #187 先例），owner 与既有条目一致

新增精确条目 `apps/app/test/login-screen.spec.tsx`：`owner: "T-19b"`（**与既有条目一字相同，不抢建轮**）+ `maxDiffLinesFor: { "T-19c": 11, "T-19d": 13 }` + `handoff: false`。

### 2.3 结构性事实：这条**当前读不到**，简报「这样登记就能授予」的假说在件2 这一格不成立（实测，不是推测）

`tools/boundaries.mjs:1627` 是 `const entry = entries[0];` —— 归属判定**只取胜者一条**，不取并集。两条同路径精确条目在 `ownershipSpecificity`（`:1087-1095`）四档里全等（`exact=1` / `literalLen` 等 / `wildcards=0` / `localeCompare=0`），排序回落数组原序 ⇒ **先写的 E4a 件1 那条恒赢**。我用注入表（`--ownership-file`，不碰仓库那份）在改前就验过一次，改后拿真表复验：

```
### 件2 现状 T-19d / login-screen（证明新条目被压住）
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  apps/app/test/login-screen.spec.tsx 由 T-19b 独占（当前任务 T-19d）— E4a 件1：文件头原话「T-19b 判据自证（App 登录屏 `#/login`）—— apps/app/test/login-screen.spec.tsx」

--check-ownership task=T-19d 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 1 处越界
exit=1
```

⇒ **本轮不越权修这个**：§D-2 只许「新增条目」与 §C-5/§C-6 那两条措辞，把 `maxDiffLinesFor` 并进既有的 `:1098` 条目 = 改别人的条目判定语义，判红风险在我这边；而把新条目**插到既有条目之前**会静默改写别人条目的胜者身份，更糟。已把两轮的**事实与出处**钉进账面（谁改了什么、改了几行、出处文件名），授权生效留 TPM 二选一裁：
- (a) 由 TPM 把 `{ "T-19c": 11, "T-19d": 13 }` 并进既有 `apps/app/test/login-screen.spec.tsx` 条目，然后删本条；
- (b) 修 `matchOwnership`/`checkOwnership` 让同路径多条做**授权并集**（这属简报 §A-2 说的「判定顺序缺陷是另一轮 F-xx 名下」那颗，建议新账 **F-41**）。

件3 的三颗 `bounded-edit` 条目**不受此缺陷影响**：那三个路径此前只被粗 glob 条目（`packages/shared/src/constants/**`、`packages/shared/test/**`）覆盖，我的精确条目按具体度恒赢 glob（实测正证见 3.3）。

## 件3 · shared 面的三颗窄条目（§C-3）

### 3.1 登记（形状 = `packages/shared/src/contracts/auth.ts` 先例：`actions:["bounded-edit:<裁决号>"]` + `maxDiffLinesFor`，裁决号取授权它的 A-74 #235 → `A-74-235`）

| path | owner | 帽子 | 幅度出处与口径 |
| --- | --- | --- | --- |
| `packages/shared/src/constants/copy.ts` | T-03 | `bounded-edit:A-74-235` / `maxDiffLinesFor: { T-19g-i: 50 }` | 申报 862→912（**+50**，`04-dev-report-T-19-g-i.md` ②-1）；起始 **待证**（A-74 #233①）；终态本轮 `wc -l` = **919**，与申报 912 差 7 行 = A-74 #237① 记的 TPM 本人那次上收 ⇒ 未登记成任何 dev 轮的授权 |
| `packages/shared/src/constants/limits.ts` | T-03 | 同上 / `{ T-19g-i: 15 }` | 申报 138→153（**+15**，②-2，新增 4 条 `DAILY_GOAL_UI_*`）；起始待证；终态 `wc -l` = **153** 与申报逐字相符 |
| `packages/shared/test/contracts.spec.ts` | T-03 | 同上 / `{ T-19g-i: 162 }` | 申报 1041→1203（**+162**，②-3，4 个 describe / 8 颗 it，既有 55 颗一字未改）；该轮正文写「+161」是算术滑点，A-74 #233② 已更正为 162 ⇒ 本条取 **162**；起始待证；终态 `wc -l` = **1203** 逐字相符 |

**只点到被真改的这一颗文件，不给 `packages/shared/test/**` 整目录开面**（简报 §B 说的是整目录欠账，但盘面证据只有 `contracts.spec.ts` 一颗被写过）；粗条目 `packages/shared/src/constants/**` 与 `packages/shared/test/**` **一字未动**，精确条目按具体度压过它（E4a 件3 的定序语义，`--self-test` 用例③/⑥ 钉着）。帽子只给 T-19g-i 一颗的理由见 §0-1（ii/iii/iv/v 对 shared 0 diff，各报告自证在案）。

### 3.2 原始 `wc -l`（本轮亲测，与简报 §B 的口径一致）

```
$ wc -l apps/app/test/login-screen.spec.tsx packages/shared/src/constants/copy.ts packages/shared/src/constants/limits.ts packages/shared/test/contracts.spec.ts
   666 apps/app/test/login-screen.spec.tsx
   919 packages/shared/src/constants/copy.ts
   153 packages/shared/src/constants/limits.ts
  1203 packages/shared/test/contracts.spec.ts
  2941 total
```

### 3.3 出口判据（真表，三向）

```
### 3-A 三颗文件无 patch（应各自判「要证据」= 越界，证明条目被读到且是窄授权）
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  packages/shared/src/constants/copy.ts（通道 bounded-edit:A-74-235 不通过）：bounded-edit:A-74-235 要证据：本文件没有出现在 --diff-file 的 patch 里（清单里点个名不构成授权，也不构成违规；bounded-edit 要自证 scoped diff，不收 HEAD diff）
RED  packages/shared/src/constants/limits.ts（通道 bounded-edit:A-74-235 不通过）：…（同文）
RED  packages/shared/test/contracts.spec.ts（通道 bounded-edit:A-74-235 不通过）：…（同文）

--check-ownership task=T-19g-i 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 3 处越界
exit=1

### 3-B 带 agent 自证 scoped patch（+3 行 ≤ 50）＝正证：条目真的能授予
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 1 个文件的 diff 参与判定
NOTE packages/shared/src/constants/copy.ts：走动作通道 bounded-edit:A-74-235（按实际 diff 判定：+3/-0 行）

--check-ownership task=T-19g-i 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
exit=0

### 3-C 反证：未登记的轮号 T-19f 碰 copy.ts
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  packages/shared/src/constants/copy.ts（通道 bounded-edit:A-74-235 不通过）：bounded-edit:A-74-235 未给 T-19f 声明 maxDiffLinesFor.T-19f = 无上限授权，拒绝判定（宁可红也不放行未登记的幅度）

--check-ownership task=T-19f 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 1 处越界
exit=1
```

3-A 的三条 RED 同时是「条目被读到」的正证：报的是**我这条窄通道要证据**，不是粗条目的「由 T-03 独占」，也没落进 no-entry。
3-B 用的 patch 是 scratch 里的合成夹具（`e4a2/scoped-copy.patch`，3 行纯追加），**没写进仓库**，只作为通道形状的证据喂给 `--diff-file`。

## 件4 · `me-screen.spec.tsx` 的跨主窄通道（§C-4）

owner = **T-19e**（件1 已落，A-74 #235 指定）。除 owner 外开的是**逐轮幅度通道** `maxDiffLinesFor`，五轮五顶帽子：

```
"maxDiffLinesFor": { "T-19g-i": 29, "T-19g-ii": 329, "T-19g-iii": 503, "T-19g-iv": 83, "T-19g-v": 231 }
```

| 轮 | 申报行数前后 | 净增（= 帽子） | 出处文件名 |
| --- | --- | --- | --- |
| T-19g-i | 884 → 913 | +29 | `04-dev-report-T-19-g-i.md` ②-4（「**只动 A-06（:465-499，+24）与 A-07（:501-536，+5）两颗**」） |
| T-19g-ii | 913 → 1242 | +329 | `04-dev-report-T-19-g-ii.md` §1 表（「`apps/app/test/me-screen.spec.tsx` \| 913 行 / 33 用例 \| **1242 行 / 45 用例**」） |
| T-19g-iii | 1242 → 1745 | +503 | `04-dev-report-T-19-g-iii.md` §4「文件行数前后（简报第 4 条①）」 |
| T-19g-iv | 1745 → 1828 | +83 | `04-dev-report-T-19-g-iv.md`「### `apps/app/test/me-screen.spec.tsx`（1745 → 1828 行）」 |
| T-19g-v | 1828 → 盘面 2059 | +231 | `04-dev-report-T-19g-v.md` **未报行数**（只报用例 59→65），起算 1828 是 iv 的收工申报 |

简报 §C-4 只点了 iii/iv/v 三轮 ⇒ 账面按盘面补成**五轮**（i/ii 同样跨主改过本文件，漏登就是继续欠账）。
⚠ 五处「起始行数」全部标 **待证**（A-74 #233①：`apps/app/**` 未跟踪，无独立记录可核），reason 里只以 `wc -l` = **2059 行**钉终态（与 TPM 20:15 亲数同值）。
⚠ 口径另注一句：`maxDiffLinesFor` 在 `checkOwnership` 里比的是 **diff 的 added+removed**，我登记的是各轮申报的**净行数**（`wc -l` 差），两者在"改写既有断言"的轮次里不等（净 +29 可能是 31 增 + 2 删 = 33 行）。⇒ 帽子按"最小可容纳净增量"取，**若 TPM 要按 diff 行重开这些帽子，须逐轮复核**（我没有更强证据，不自行放大数字，§D-3 同条纪律）。

### 4.1 通道形状的一条实测结论（简报 §C-4 说「开窄通道」，我先试了 bounded-edit 那一族，判不可用）

`actions:["bounded-edit:…"]` 在本格**不能**用：`judgeBoundedEdit` 无 patch 时直接返回「要证据」= 违规（`--check-ownership --task T-19g-i --files packages/shared/src/constants/copy.ts` 的 3-A 输出即此形状），而 §E-3 要求的正证命令**只给 `--files` 不给 `--diff-file`** ⇒ 用 bounded-edit 就必然把 §E-3 的第一条正证跑成红。五轮已交付、scoped patch 不再可得，剩下的证据只有报告里的 `wc -l` ⇒ 取 `maxDiffLinesFor`（`checkOwnership:1698-1715` 的清单分支：无 patch 时按清单放行并打 NOTE，有 patch 时按行判）。这条取舍写进了 reason 正文，不藏在报告里。

### 4.2 正证 / 反证（真表原始输出）

```
### 正证1 T-19g-v / me-screen
TABLE E:\CC\tomorrow-memory\tools\ownership.json
NOTE apps/app/test/me-screen.spec.tsx：T-19g-v 声明 ≤231 行，但本次没有 patch 可比 → 按清单放行（正式冒烟请配 --diff-file；新授权请用 bounded-edit:<裁决号>）

--check-ownership task=T-19g-v 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 无越界
exit=0

### 反证 T-99 / me-screen
TABLE E:\CC\tomorrow-memory\tools\ownership.json
RED  apps/app/test/me-screen.spec.tsx 由 T-19e 独占（当前任务 T-99）— E4a2 件1 + 件4：文件头原话「T-19e + T-19g-ii 判据自证（App「我的」屏 `#/me`）—— …」（后接 reason 全文，原始输出见 `e4a2/run4-checks.log`）

--check-ownership task=T-99 触碰 1 个在册文件（清单 1 项 + patch 0 项） → 1 处越界
exit=1

### 4-A 幅度反证：T-19g-v 交 300 行 patch（帽子 231）应判越界
PATCH 1 个文件的 diff 参与判定
RED  apps/app/test/me-screen.spec.tsx：T-19g-v 允许 ≤231 行，实际 300 行
--check-ownership task=T-19g-v 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 1 处越界
exit=1

### 4-B 合规幅度：+50 行 ≤ 231 应放行
--check-ownership task=T-19g-v 触碰 1 个在册文件（清单 0 项 + patch 1 项） → 无越界
exit=0
```

4-A/4-B 用的是 scratch 里的合成 patch（`oversize-me.patch` / `ok50-me.patch`），**没有**碰 `apps/app/**` 一个字节。这两条一起说明：帽子**会咬人**，不是"登记了但恒放行"的空壳（A-33-4 禁的空壳形状）。
改前对照（同一颗文件，账面空档时门禁恒绿）：

```
NOTE apps/app/test/me-screen.spec.tsx：归属表无条目（no-entry，不阻断）
--check-ownership task=T-99 触碰 1 个文件 → 无越界
exit=0
```
⇒ 「E4 第一件不做，后续每轮归属门禁都是虚的」这句在 `--task T-99` 这颗假任务号上直接复现了。



---

## §9 TPM 补录（E4a2 收尾轮，2026-09-21 起）

轮次性质：**E4a2 撞 150 回合上限**（165 次工具调用），件1–件6 的账面改动**已全部落盘**，但报告 §1 出口判据与件5/件6 两节未写。本节由我（TPM）本人补录，口径与 A-70 #204 一致：**码在盘上就算交付，缺的是账面而不是活**；补录只写我亲跑的输出，不代 agent 复述。

### 9.1 件5 / 件6 的落盘面（我亲读 `tools/ownership.json` 原文，21:06:39）

| 件 | 条目 | 实测 |
| --- | --- | --- |
| 件5（§C-5） | `packages/server/src/app.ts`（现 :575） | reason 尾部追加「E4a2 件5（只加账面注记，**判定字段一字未动**）」一段，把 `git diff --numstat` = **142 插入 / 21 删除** 钉成「未提交窗口内批次3+批次4 全部轮次的**累积量**，不是任何单轮增量」，并明确 ⛔「不得为了让 `--check-ownership` 变绿把 `maxDiffLinesFor` 开到 142」。判定字段复点：`actions` 仍 `["bounded-edit:A-33-7"]`、`maxDiffLinesFor` 仍 `{"T-10": 2}`、`predecessorAllowedDiff` 仍 T-08 的 1 行 import ⇒ **注记型改动，无授权面变化**，与简报 §D 的「只许改措辞」相符 |
| 件6（§C-6） | `apps/web/src/app/(user)/assess/page.tsx`（现 :567） | reason 内把「≤8 行 diff」换成 A-38 §38 的**语义口径**（新增文案字面量 0 条 + 新增分支 ≤8 行，`@/components/ui/*`→`@tm/ui` 的 import 改写不计入），机检落点改为「T-25 只断『无新文案字面量』、不断行数」；`owner` 仍 **T-12**、`predecessorAllowedDiff` 仍只覆盖 T-04 ⇒ agent 如实上报了「§10.4 第 8 行要求的 owner=T-25/maxDiffLines=8 那半件授权在归属表里**从未落地**」并留我裁 ⇒ 记 **F-42** |

### 9.2 我对件2 遗留二选一的裁定：取 (a) 案，已执行

盘面上 `apps/app/test/login-screen.spec.tsx` 原有**两条同路径精确条目**（E4a 件1 建 in :1102 区、E4a2 件2 建 in :1194 区），后者带 `{T-19c:11, T-19d:13}` 但按 agent 实测**读不到**（`tools/boundaries.mjs:1627 const entry = entries[0]` 单胜者，同路径具体度四档全等 ⇒ 回落数组原序 ⇒ 先写者恒赢）。我取 **(a)**：把 `{ "T-19c": 11, "T-19d": 13 }` 与出处逐字**并入先写的 E4a 件1 条目**（owner 仍 T-19b，一字未动），并**删除**那条读不到的空壳。

- 没取 (b)（改 `matchOwnership`/`checkOwnership` 为同路径并集）的理由：那是**判定语义**改动，属 E4c 名下 `boundaries.mjs` 判定顺序修的同一颗（A-40 #50b），在出口轮里顺手改门禁判定 = 我用改门禁让账面变绿，形状不对。⇒ 登记为 **F-41**：「`entries[0]` 单胜者语义 ⇒ 同路径多条精确条目不取授权并集，先写者恒赢；E4c 与 #50b 的判定顺序修同批处理，并补 `--self-test` 用例」。
- 删除后账面数：**归属条目 141 → 140**，`dup-paths = []`（脚本实测），`tasks` 名册仍 **37**，JSON 可解析。
- 改前快照备份：`%TEMP%/e4a2_closeout/_bk_ownership_pre-tpm.json`；写入用 tmp + `os.replace`。

### 9.3 出口判据（我亲跑，原始日志 `%TEMP%/e4a2_closeout/`）

```
$ node tools/boundaries.mjs --self-test
boundaries --self-test：157/157 通过
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）
SELF_TEST_EXIT=0        # 21:03:16
```

四颗正证（agent 报告 §1.4 只跑了一颗，其余三颗由我复跑）+ 反证，退出码在**管道前**取（`subprocess.run` 直接读 returncode，避开 `| tail` 把退出码吃掉的老坑）：

| # | 命令 | 期望 | 实测 |
| --- | --- | --- | --- |
| P1 | `--check-ownership --task T-19f --files apps/app/test/about-screen.spec.tsx` | 放行 | exit **0**（agent 已跑，我复跑同值） |
| P2 | `--check-ownership --task T-19d --files apps/app/test/security-screen.spec.tsx` | 放行 | exit **0** |
| P3 | `--check-ownership --task T-19c --files apps/app/test/upgrade-screen.spec.tsx` | 放行 | exit **0** |
| P4 | `--check-ownership --task T-19g-v --files apps/app/test/me-screen.spec.tsx` | 放行 + NOTE ≤231 无 patch 按清单放行 | exit **0** |
| P5 | `--check-ownership --task T-19c --files apps/app/test/login-screen.spec.tsx`（并条后） | 放行 + NOTE ≤11 | exit **0** |
| P6 | `--check-ownership --task T-19d --files apps/app/test/login-screen.spec.tsx`（并条后） | 放行 + NOTE ≤13 | exit **0** |
| N1 | `--check-ownership --task T-99 --files apps/app/test/me-screen.spec.tsx` | 判红「由 T-19e 独占」 | exit **1** |
| N2 | `--check-ownership --task T-99 --files apps/app/test/login-screen.spec.tsx` | 判红「由 T-19b 独占」 | exit **1** |
| N3 | `--check-ownership --task T-19c --diff-file login-over.patch`（合成 20 行，帽子 11） | 判红「允许 ≤11 行，实际 20 行」 | exit **1** |
| N4 | `--check-ownership --task T-19d --diff-file login-over.patch`（20 行，帽子 13） | 判红 | exit **1** |
| N5 | `--check-ownership --task T-19c --diff-file login-ok.patch`（合成 8 行 ≤ 11） | 放行 | exit **0** |

⇒ P5/P6 是 (a) 案生效的正证：**并条之后帽子真能被读到**（改前同一命令判红「由 T-19b 独占」，agent 报告件2 §2.3 的原始输出即改前面）。N3/N4/N5 说明帽子会咬人，不是登记了恒放行的空壳（A-33-4 禁的形状）。N1/N2 说明补录没有把面开松。

### 9.4 全量与只读面复点（我亲跑）

```
$ pnpm --filter @tm/app test            # 21:04:38 → 21:04:56
 Test Files  18 passed (18)
      Tests  463 passed (463)
APP_TEST_EXIT=0
```
与批次4 基线 **463 颗 / 18 文件** 逐字相符 —— 本轮改的是 `tools/ownership.json` 一颗，产品码与测试零触碰，全量仍绿。

禁动面（A-77 #261 两证口径的可达部分）：

```
$ stat -c '%n %s %y' data.db packages/server/data.db && sha256sum data.db | cut -c1-12
data.db 253952 2026-09-18 04:05:38.198449400 +0800
packages/server/data.db 0 2026-09-17 00:10:53.374159200 +0800
6595517661cc
```
⇒ 真库字节数/sha256 前 12 位/mtime **三值一字未变**。
`find . -type f -newermt "2026-09-21 20:55"`（排除 node_modules/.next/.git）在本机本轮窗口内只命中 **1 颗**：`tools/ownership.json`（21:03:03）。

⚠ 两证口径的**缺口如实记**：E4a2 自己没交开工前禁动面 sha256 全量快照，我用的是「改前 `--self-test`/真表探测 + `find -newermt` 窗口 + 真库三值 + 全量测试」四件替代证据。按 A-78 #262 的降级口径 ⇒ **E4a2 的「未越界」申报记 待证（窗口级证据），不记红**。

### 9.5 我更正 agent 的一处，与 agent 更正我的三处（对照留档）

- agent 报告 §0-3 说「在册归属条目 133 条」——**并条后我实测 140 条**，`grep -c '"path"'` 会得 142（含 `unowned_but_guarded` 2 条）。它的算术没错（133+8=141），我这一轮把 141 减成 **140**。
- agent 更正我的三处（§0-1 幅度是一轮三文件、§0-2 起始行数全部 待证、§0-3 135 是字样计数）我全部认账，已随 A-81 入册；这三处都是**简报口径错**而不是 agent 越权。
- 另记一条纪律：本轮我给它写简报时把 §E 的出口命令写成「只 `--files` 不给 `--diff-file`」，与 §C-3/§C-4 用 `bounded-edit` 通道自相矛盾（无 patch 必判「要证据」）——agent 在件4 §4.1 自己发现并改走 `maxDiffLinesFor` 清单分支，判对。⇒ 与 FU12 同族：**出口命令与授权通道必须同形**，写简报时逐件对一遍。
