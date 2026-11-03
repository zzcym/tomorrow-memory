# 04-dev-report · E4c-iii（取证轮 · 批次4 出口复点与报告）

- 任务号：**E4c-iii**　性质：**纯取证轮**（简报 `C:\Users\曹怡明\AppData\Local\Temp\e4c3-iii\a96-brief-E4c-iii.md` / A-96 #403）
- 开工：`2026-09-26 02:08`（首条命令 `sha256sum -c` 基线）　收工：本文件落盘时刻，见文末「收工自证」
- 仓库根：`E:\CC\tomorrow-memory`　环境：Windows + Git Bash / node v22.20.0 / pnpm 11.24.0
- **本轮写面 = 本文件一颗**。⛔ 未改任何 `apps/**`、`packages/**`、`tools/**`、`scripts/**`；⛔ 任何 git 写操作；⛔ 碰三颗真库面；⛔ `--i-know-this-is-prod`；⛔ 改断言/retries/timeout/加 skip/屏蔽端点/`--update-snapshots`。全部由件4 两证自证（§5）。
- **本报告不宣布「E4 / 批次4 出口通过」**。出口判定与 6 红处置权在 TPM（§7、§8 只给证据与建议）。

日志根目录（下称 `$T`）= `C:\Users\曹怡明\AppData\Local\Temp\e4c3-iii\`

---

## 1. 件1 · 闸门与静态面复跑

### 1.1 `node tools/boundaries.mjs --self-test`
```
命令原文：node tools/boundaries.mjs --self-test
退出码：0
尾行原文：boundaries --self-test：164/164 通过
日志：$T\e4c3-1-1-boundaries-selftest.log（35049 B）
```
账面期望 164 → **实测 164/164，一致**。内含 `ddl-parity --self-test：26/26 通过（SKIP 0）`、`A-24-1 --dist 清单 ⊇ tm-app:dist-guard`、`A-19 疫苗 3/3`。

### 1.2 `node tools/boundaries.mjs --all`
```
命令原文：node tools/boundaries.mjs --all
退出码：1
尾行原文：15/21 条通过，6 条红
日志：$T\e4c3-1-2-boundaries-all.log（3455 B）；全量命中 JSON：$T\e4c3-1-2c-all-json.log、$T\e4c3-1-2b-colors-json.log
cursor=T-02（取自 tools/exceptions.json 的 gate_cursor，本轮未改）
```
红名单与账面逐条比对（账面 = A-93 #375 / `current_green_baselines["tools/boundaries.mjs --all"]`）：

| # | 断言 | 账面 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | `copy-legacy-zero` | 12 命中 + 176 待走查 | 12 + 176 | **一致** |
| 2 | `deadline-key-zero` | 8 | 8 | **一致** |
| 3 | `colors-no-hardcode` | 100 | **106** | **漂移 +6**，见 §1.2.1 |
| 4 | `css-important-budget` | 4>1 | 4>1 | **一致** |
| 5 | `dark-variant-budget` | 5>3 | 5>3 | **一致** |
| 6 | `web-home-transport` | 7 | 7 | **一致** |

绿侧 15 条与账面同（含 `dist-artifact-portability` 22 产物 / `route-string-preserved` 消失 2 条在例外内 / `migration-down-declared` 9 迁移全声明）。

#### 1.2.1 `colors-no-hardcode` 100→106 的归因
判据原文（`tools/boundaries.mjs:728-732`）：`零硬编码颜色：hex / rgb() / hsl() 字面量（UI §8.2-1）`，`roots: ['apps','packages','mobile-memory']`，正则 `/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/`，白名单 `tokens.css` / `tailwind-preset.ts` / `colors.xml`。

- **不是本轮引起**：本轮 0 触碰产品码（§5 两证：12/12 锚点 OK、窗口内 0 源文件）。
- **归因（推断依据 = 盘面对照，非改前对照复点）**：账面 100 那次 = A-93 的 `a93-all.log` @`09-23 05:00:51`；**E4c-ii 件③ 在 05:45:06 改过 `apps/app/src/screens/MeScreen.tsx`（A-94 #385 那五处过期注释，+14/-13）**，该文件现贡献 **12 颗命中**，命中行号 `:97 / :162 / :450 / :453 / :487` 正落在被改写的那五段注释区（`:96-98 / :160-161 / :447-453 / :485-486`）内，改写后的注释新写了 `A-86 #320`、`A-61 #209②` 这类**裁决号交叉引用**。A-95 未复点 `--all`（grep 实测：`04-dev-report-E4c-ii.md` 内 `colors-no-hardcode` / `--all` **0 命中**）⇒ 本次 106 是 E4c-ii 落地后的**第一次读数**。
- **诚实交底**：改前的 `MeScreen.tsx` 不在 git 里（`?? untracked`），我无法跑「改前同命令」的正面对照，故这条按 A-77 #261 口径记 **「归因待证」**，不记红。

> ⚠ 本节最重要的取证结论（对 6 红全部适用，详见 §8）：**这 6 条红里没有一条是产品缺陷本体**。我对 106 颗命中逐颗取词元复算：
> **`0 / 106` 命中是真的硬编码颜色**。全部是 `#NNN` 形状的裁决号引用（`A-86 #320`、`T-19e #210`…，`#[0-9]{3,4}`）或注释里在讲规则本身的 `rgb()` / `hsl()` / `#RRGGBB` 字面串。
> 复算脚本与分类输出：`$T\e4c3-1-2b-colors-json.log` + §8 的分类表。

### 1.3 `pnpm depcruise`
```
命令原文：pnpm depcruise        （展开 = depcruise . --config .dependency-cruiser.cjs）
退出码：0
尾行原文：✔ no dependency violations found (456 modules, 1573 dependencies cruised)
日志：$T\e4c3-1-3-depcruise.log（128 B）
```
按规则名分类计数：**0 条违规，无任何规则名可分类**。`.dependency-cruiser.cjs` 本轮 0 触碰。

### 1.4 `node tools/ddl-parity.mjs`
```
命令原文：node tools/ddl-parity.mjs
退出码：0
日志：$T\e4c3-1-4-ddl-parity.log（1122 B）
```
两侧条数（原文抄录）：
- schema 源 `packages/shared/src/schema/tables.ts` 载入 **13 张表**：users, wordbooks, profiles, checkin_logs, fsrs_cards, tutor_cache, chat_messages, assessment_cache, analyst_cache, _migrations, review_snapshots, account_audit_log, feature_flags
- **A 段/sqlite：0 处差异**
- **A 段/pg：SKIP —— 未设 `DATABASE_URL_TEST`**（§6.2 允许跳过，CI 必须起 PG，§6.4 T-22）
- B 段/pg、C 段/pg：**均 SKIP**（本机无 PG 实例）；夹具 `tools/fixtures/schema-fixtures.json` = b_cases 12 组 / c_cases 4 组
- 脚本自身的显式警告原文：「⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到，只能在有 PG 的 CI 里跑（A-18-3 → T-22 出口判据）」

⇒ **pg 侧本轮 = 0 条实测**，退出码 0 只代表 sqlite 侧 + 显式 SKIP 被接受。「双驱动一致」这一层**未实测**（§9 第 1 条）。

---

## 2. 件2 · 单测与类型面逐颗亲跑

### 2.1 逐颗隔离跑（每颗一条命令、一份日志、自己的 `Test Files` 行）

| 命令原文 | exit | `Test Files` 原文 | `Tests` 原文 | 日志 |
|---|---|---|---|---|
| `pnpm test` | **0** | `Test Files  47 passed (47)` | `Tests  1207 passed \| 1 skipped (1208)` | `$T\e4c3-2-0-root-test.log` |
| `pnpm --filter @tm/agent test` | **0** | `Test Files  3 passed (3)` | `Tests  39 passed (39)` | `$T\e4c3-2-pkg-agent-test.log` |
| `pnpm --filter @tm/app test` | **0** | `Test Files  18 passed (18)` | `Tests  470 passed (470)` | `$T\e4c3-2-pkg-app-test.log` |
| `pnpm --filter @tm/shared test` | **0** | `Test Files  1 passed (1)` | `Tests  68 passed (68)` | `$T\e4c3-2-pkg-shared-test.log` |
| `pnpm --filter @tm/server test` | **0** | `Test Files  21 passed (21)` | `Tests  446 passed \| 1 skipped (447)` | `$T\e4c3-2-pkg-server-test.log` |
| `pnpm --filter @tm/web test` | **0** | `Test Files  1 passed (1)` | `Tests  16 passed (16)` | `$T\e4c3-2-pkg-web-test.log` |
| `pnpm --filter @tm/ui test` | **0** | `Test Files  3 passed (3)` | `Tests  168 passed (168)` | `$T\e4c3-2-pkg-ui-test.log` |

根跑 `Duration 40.38s (… tests 99.32s …)`；六颗隔离跑各自 Duration = agent 698ms / shared 1.03s / ui 2.76s / web 2.95s / app 14.82s / server 15.65s。

**空项目防呆（简报点名的历史事故）＝ 已排除**：六颗**逐颗隔离**跑，每颗都有自己的非零 `Test Files` 行。交叉对账：
- 文件数 `3+1+3+1+18+21 = 47` ＝ 根跑 47 ✅
- 用例数 `39+68+168+16+470+447 = 1208` ＝ 根跑 (1208) ✅
- ⇒ 根跑确实覆盖全部 6 个 project，无被静默容忍的空项目。

账面逐条对账：agent 39 ✅ / app 470 ✅ / shared 68 ✅ / server 446+1skip ✅ / 根 47 files 1207+1 ✅；web **16**、ui **168**（账面要求「按实测报」，现补为实测值）。

### 2.2 typecheck 逐颗

| 命令原文 | exit | 结果 | 日志 |
|---|---|---|---|
| `pnpm --filter @tm/agent typecheck` | 0 | 0 错 | `$T\e4c3-2-typecheck-agent.log` |
| `pnpm --filter @tm/app typecheck` | 0 | 0 错 | `$T\e4c3-2-typecheck-app.log` |
| `pnpm --filter @tm/shared typecheck` | **2** | **2 条 TS 错** | `$T\e4c3-2-typecheck-shared.log` |
| `pnpm --filter @tm/ui typecheck` | 0 | 0 错 | `$T\e4c3-2-typecheck-ui.log` |
| `pnpm --filter @tm/web typecheck` | 0 | 0 错 | `$T\e4c3-2-typecheck-web.log` |
| `pnpm --filter @tm/server typecheck` | 0 | 0 错 | `$T\e4c3-2-typecheck-server.log` |
| （附加）`pnpm typecheck` | **2** | 唯一失败面 = `@tm/shared` | `$T\e4c3-2-root-typecheck.log` |

#### 🔴 本轮新发现 1：`@tm/shared typecheck` 盘面为红（账面从来没有这颗基线）
日志原文（343 B 全量）：
```
$ tsc -p tsconfig.json --noEmit
test/contracts.spec.ts(1240,21): error TS2532: Object is possibly 'undefined'.
test/contracts.spec.ts(1253,71): error TS2554: Expected 1 arguments, but got 2.
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/shared@2.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
```
- 两颗错都在**测试文件**里，源码 `src/**` 0 错。
- **账面为什么从没抓到**：`status.json` 的 `current_green_baselines` 有 `@tm/server typecheck` / `@tm/app typecheck` / `@tm/web typecheck` 三颗，**没有 `@tm/shared typecheck`，也没有 `@tm/ui typecheck`**（我逐颗列过 20 个键）。⇒ 这颗红**不是被掩盖，是从来没有被量过**。本轮 `pnpm --filter @tm/ui typecheck` 同样实测 exit 0（补掉另一半盲区）。
- vitest 走 esbuild 不做类型检查 ⇒ `@tm/shared test` 68 颗全绿与这颗红**同时成立**，不矛盾。
- 出处定位：`:1240` = E4b3b 件A 的 `with_progress` 单点哨（A-88 / A-87 #325），`:1253` = E4b6 件1 的 5A 同源哨（A-89 / A-86 #320）。两颗都是**批次4 内**落的，`tsconfig include: ["src","test"]`（`packages/shared/tsconfig.json:6`）。

#### 🔴 本轮新发现 2：`packages/shared/test/contracts.spec.ts:1253` 是一颗**永真断言**（不只是类型错）
原文：
```ts
const hits = (copySrc.match(new RegExp(`['"\`]${label}['"\`]`), 'g') ?? []).length;
expect(hits, `copy.ts 里 ${label} 的字面量声明处 ${hits} 份（第二份就可分叉）`).toBe(1);
```
`'g'` 被传给了 **`String.prototype.match`** 而不是 `RegExp` 构造器。无 `g` 时 `match()` 返回的是「首个匹配 + 捕获组」，该正则 0 捕获组 ⇒ `hits ∈ {0,1}` **恒成立**，与字面量真实份数无关 ⇒ `toBe(1)` 在 4 份「外观」时也绿。这正是本项目 `--self-test` 反「永真断言」在防的那一族（A-19/A-35-10），只不过落在用例面。
现场实证（临时目录探针，⛔ 未进仓库）：
```
命令：node $T\e4c3-2-probe-match-flags.mjs    退出码：0    输出：$T\e4c3-2-probe-match-flags.out
occurrences in sample          = 4
spec :1253 as-written  hits    = 1 (expect().toBe(1) => 永真)
corrected .match(new RegExp(pattern,"g")) = 4
single-source case as-written  = 1
```
⇒ **A-89 #337 里 TPM 亲读判定的那颗「全仓第二份『外观』/『关于』字面量 0 处（shared 那颗新哨机检的正是这条）」，其机检效力不成立**：那颗哨当前**测不到分叉**。「5A 单一声明点」这件事目前只由那颗哨的 `:1248-1250`（`rows.* === groups[2]/[4]` + 逐字相等）与 `:1251` 的 `!` 那半边的**取值比较**在守，**份数计数这一维是空的**。
对照：同文件 `:1240` 那颗 `with_progress` 哨写的是 `/with_progress/g` 字面量正则，**`g` 位置正确、非永真**，只有它的 `SHARED_SRC[key]` 少个 `!` 而触 TS2532。
处置建议见 §10（属用例缺陷，归 shared 面；**裁决在 TPM**）。

---

## 3. 件3 · 产物门禁与体积

### 3.1 `node tools/boundaries.mjs --dist`
```
命令原文：node tools/boundaries.mjs --dist
退出码：0
尾行原文：1/1 条通过，全绿
日志：$T\e4c3-3-1-dist-gate.log（318 B）
```
判据原文 + 实测：`dist-artifact-portability  22 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）`
- 扫描颗数 = **22**（账面 22 ✅）；`find apps/app/dist -type f | wc -l` = **22**（20 js + 1 css + 1 html）独立自证一致。
- **每条命中原文：0 条命中**（判据①②各 0）。

### 3.2 ⚠️ 产物陈旧（本轮只报状态，未自行 build）
| 面 | 实测 mtime |
|---|---|
| `apps/app/dist/index.html` = `assets/index-fsestLC2.js` = `index-T4SUTEM1.css` | **2026-09-23 04:29:04** |
| `apps/app/src/screens/MeScreen.tsx`（E4c-ii 件③ 落地） | **2026-09-23 05:45:06** ← **晚于产物 1h16m** |

`find apps packages -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -newer apps/app/dist/index.html`（剪 `node_modules/dist/.next`）命中 **5 颗**：
`apps/app/src/screens/MeScreen.tsx`、`packages/agent/src/deps.ts`、`packages/agent/test/{assessment,fsrs,orchestrator-intent}.spec.ts`

- 结论：**当前 `apps/app/dist` 是 A-92（E4b7）复点窗口 04:28–04:30 那次 build 的产物，E4c-ii 未重建**（与 `status.json` 自述一致：「⚠ build 类本轮**未重跑**…仍读 A-92 的 04:28–04:30 那组」）。
- 影响（**待 TPM 判**）：§3.1 的 `--dist` 全绿、§3.3 的 506.93 kB、§3.5 的首屏预算，**三者都是在「不含 E4c-ii 的 MeScreen 改动」的产物上测的**。MeScreen 那颗改动是纯注释（A-95 #395 判 GREEN 的注释件），语义上不改变 bundle，但**我没有在盘上证明它不进产物**（要证明需重建，本轮⛔）。
- 简报给的处置分支我走的是第一支：「**先只报状态，别自行 build**」⇒ 本轮 0 跑 `pnpm --filter @tm/app build`。

### 3.3 主 chunk 与 A-92 留名值对账
```
实测：apps/app/dist/assets/index-fsestLC2.js = 506926 bytes
A-92 #364 留名：506.93 kB
506926 / 1000 = 506.926 kB → 四舍五入 506.93 kB   ✅ 逐位吻合（口径 = 十进制 kB；若按 KiB = 495.05 KiB）
```

### 3.4 APK（**只读量体积，未重新打包**）
`find mobile-memory mobile-agenda -name '*.apk'` → **8 颗**（`stat -c '%s %y'`，未做任何写操作）：

| 路径（相对仓库根） | 字节数 | mtime |
|---|---|---|
| `mobile-memory/tmword-dev.apk` | **177536** | 2026-09-20 00:07:15.905 |
| `mobile-memory/build/apk/app.aligned.apk` | 169063 | 2026-09-20 00:07:15.416 |
| `mobile-memory/build/apk/app.unsigned.apk` | 169060 | 2026-09-20 00:07:15.349 |
| `mobile-memory/build/base.apk` | 162322 | 2026-09-20 00:07:13.056 |
| `mobile-memory/明日记忆.apk` | 58691 | 2026-09-18 04:09:52.399 |
| `mobile-agenda/明日日程.apk` | 136919 | 2026-09-19 14:47:10.591 |
| `mobile-agenda/build/apk/app.aligned.apk` | 126760 | 2026-09-19 14:47:10.044 |
| `mobile-agenda/build/apk/app.unsigned.apk` | 126756 | 2026-09-19 14:47:09.823 |
| `mobile-agenda/build/base.apk` | 66716 | 2026-09-19 14:47:06.139 |

- **最新一颗** = `mobile-memory/tmword-dev.apk`（09-20 00:07:15）。账面 A-96 #405 的三颗值（177536 @09-20 00:07、58691 @09-18 04:09、169063 @09-20 00:07）**逐颗对得上** ✅。
- **体积差能否由 dist 变化解释 = 不能判定（未见证据）**，理由两条实测事实：
  1. 全部 8 颗 APK 的 mtime（最晚 09-20 00:07）**早于当前 `apps/app/dist`（09-23 04:29）约 3 天** ⇒ 没有任何一颗 APK 装的是当前产物；`tmword-dev.apk`(09-20 00:07) 与 `明日记忆.apk`(09-18 04:09) 相差 118845 B，对应的是 **09-18→09-20 之间**那批 dist 变化，而那段产物已被覆盖、**盘上不存在**（无中间态可核）。
  2. APK 内部构成未解包核对（本轮⛔重打包、⛔解包写盘）⇒ 体积与 dist 字节的映射关系**未见证据**。
- 简报要求的原样一句：**「哪颗是交付件 = 待 TPM 判」**。
- 补一条盘面事实供裁决：A-97 #411 的新排程是「E5-register 落地后**重打一颗新件**」⇒ 若走该支，上列 8 颗全部不是交付件；A-97 #413 已写明「内部版 = E5-register 落地后重打」。

### 3.5 首屏预算（判据数字，**结论待 TPM 判**）
从 `apps/app/dist/index.html` 实测其阻塞式资源恰 2 颗（`<script type="module" src="./assets/index-fsestLC2.js">` + `<link rel="stylesheet" href="./assets/index-T4SUTEM1.css">`）：

| 资源 | raw | gzip -9（本地自算） |
|---|---|---|
| `index.html` | 3087 | 1687 |
| `index-fsestLC2.js`（主 chunk） | 506926 | 155416 |
| `index-T4SUTEM1.css` | 38631 | 8077 |
| **首屏阻塞面合计** | **548644 B = 548.64 kB（十进制）/ 535.79 KiB** | **165180 B = 165.18 kB** |

- 另有 **18 颗非 `index-` 的懒加载 js chunk 合计 104903 B**（各屏 dynamic import，不计入首屏阻塞面）。
- 传输层是否压缩：`Caddyfile:44-45` = `# 压缩：gzip + brotli` / `encode zstd gzip` ⇒ **Web 侧走 gzip**；App 是 `file://` 装载（APK 内），gzip 那一列**不适用**。
- ⚠ 「首屏预算」的**阈值本体我在盘上没找到**（简报与 `01-prd/02/03` 我未逐字通读，本轮⛔通读 52 万字符文档）⇒ 只给判据数字，**结论标「待 TPM 判」**。Vite 的 `>500 kB` 单 chunk 提示自 T-19g-i 起就在（A-92 #364），本轮未 build 故无新提示文本，**未见本轮证据**。

---

## 4. 件4 · 历史轮两证复点（A-77 #261 + F-46 三颗真库面口径）

### 4.1 12 颗 sha256 锚点：跑测前基线 + 跑测后复点，**两侧都 12/12 OK**
```
命令原文（仓库根跑）：sha256sum -c "C:/Users/曹怡明/AppData/Local/Temp/e4c3-iii/a96-anchor.txt"
① 开工基线 02:08  → EXIT=0   日志：$T\e4c3-anchor-BEFORE-baseline.log
② 收工复点 02:24  → EXIT=0   日志：$T\e4c3-4-2-anchor-AFTER.log
```
收工逐行原文（`sha256sum -c` 输出，12/12）：
```
data.db: OK
data.db-shm: OK
data.db-wal: OK
tools/boundaries.mjs: OK
tools/ownership.json: OK
packages/agent/src/deps.ts: OK
packages/agent/test/fsrs.spec.ts: OK
apps/app/src/screens/MeScreen.tsx: OK
apps/web/playwright.config.ts: OK
package.json: OK
vitest.workspace.ts: OK
packages/shared/src/types.ts: OK
```
⇒ **跑测（含 Playwright 3 连跑 + `@tm/web` build + 件2 全量单测）之后，三颗真库面与 9 颗工具/装配/落地面逐字未动**，本轮 0 越界。

### 4.2 A-8x / A-9x 段声明的锚点逐颗现场复算（三态判定）
定位方式（简报要求，⛔ 通读全文）：`grep -n '^## A-' .delivery/04-adjudications.md` → A-80..A-97 落在 `:937`–`:1163`，本文件现 **1170 行 / 525661 字节**。按行号区间读 `:1027-1170`。
复算命令 = `bash $T\e4c3-4-anchor-recompute.sh`（全只读）→ 日志 `$T\e4c3-4-1-anchor-recompute.log`（2699 B），复算时刻 `2026-09-26 02:17:33`。

| 锚点申报（出处） | 账面申报值 | 现场复算 | 三态 |
|---|---|---|---|
| `data.db`（A-93 #376/#378、A-94 #388、A-95 #397、A-96 #404） | 253952 / `6595517661cc…` / 09-18 04:05:38 | 253952 / `6595517661cc` / 2026-09-18 04:05:38 | **对得上**（size+sha+mtime 三项） |
| `data.db-shm`（同批） | 32768 / `2bceb8907276…` / 09-17 00:53:01 | 32768 / `2bceb8907276` / 09-17 00:53:01 | **对得上** |
| `data.db-wal`（同批） | 424392 / `88ed3fe2b2ce…` / 09-18 04:09:16 | 424392 / `88ed3fe2b2ce` / 09-18 04:09:16 | **对得上** |
| `packages/server/data.db` 占位（A-88 #330、A-90 #344） | 0 字节 / `e3b0c44298fc…` / 09-17 00:10:53 | 0 / `e3b0c44298fc` / 09-17 00:10:53 | **对得上** |
| `tools/boundaries.mjs`（A-93 #366 行数、A-96 #404 sha） | 3206→**3419** 行 / `48ee7b467736…` | 201924 B / **3419** 行 / `48ee7b467736` / 09-23 04:58:34 | **对得上** |
| `tools/ownership.json`（A-94 #382、A-96 #404、`current_green_baselines`） | 161→**163 条目** / 1466 行 / 99441 字节 / `9bf17a2d0bc5…` / `dup-paths=[]` | **163 条目**（`.ownership` 数组实测长度）/ 1466 行 / 99441 B / `9bf17a2d0bc5` / 09-23 05:26:29 / `tasks` 名册 **37** 键 | **对得上** |
| `packages/agent/test/fsrs.spec.ts` mtime（A-96 #409） | 09-23 05:40:51 | 09-23 05:40:51（sha `1d10ebddd99d`） | **对得上** |
| `packages/shared/src/types.ts`（A-96 #404，锚点全值） | `200b255f0e38…` | `200b255f0e38` / 09-21 01:58:42 | **对得上** |
| `vitest.workspace.ts` / 根 `package.json` / `apps/web/playwright.config.ts`（A-96 #404） | `82d1aa5d4f6e…` / `5c70b5d21c1d…` / `16734361088240…` | `82d1aa5d4f6e` / `5c70b5d21c1d` / `16734361088240` | **对得上** |
| `apps/app/dist` = 22 产物 + `index-*.js` **506.93 kB**（A-92 #364） | 22 / 506.93 kB | 22 / 506926 B = 506.93 kB | **对得上** |
| `packages/agent/dist`「**09-19 11:34:34 的旧产物、暂无 test/**」（A-95 #399） | dir mtime 09-19 11:34:34 / 无 spec | **dir mtime 09-19 11:20:42**，但 `find -printf` 最新 5 颗文件 mtime = **09-19 11:34:34**（`src/scripts/test-lookup.*`）；`find packages/agent/dist -name '*.spec.*'` = **0 颗**；共 88 文件 | **对得上**（申报的是**文件** mtime，非目录 mtime；`*test*` 命中的 4 颗是 `src/scripts/test-lookup.*` 而非 spec，我逐颗点名核对过 ⇒ 不构成「dist 带 spec」） |
| A-93 #378「`sha256sum -c` = **11 OK / 1 FAILED**，FAILED 那颗是 `04-adjudications.md` 本体」 | — | 那颗文件在 TPM 名下继续被 A-94/A-95/A-96/A-97 追加（现 mtime 09-26 02:15:20 / 525661 B），**已非当时状态** | **无档可查（记「待证」）**：该申报当时成立与否我无独立留痕（`a93` 系日志在 `%TEMP%\e4b4\`，不在我的 scratch 面，简报⛔我去读别轮 scratch） |
| A-94 #389「探针首跑失败日志被同名覆盖」 | TPM 自曝**无档可查** | — | **无档可查（账面已自记「待证」）**，本轮复核该口径成立 |
| A-93 #375「改前 `--all` 同 6 红」的对照 | 账面自记**待证**（改前日志不存在） | — | **无档可查（待证）**，本轮亦无法补证（见 §1.2.1 同族） |

**小结**：A-8x/A-9x 段凡**在册且可现场复算**的 sha256 / size+mtime 锚点 = **11 组，全部对得上，0 组对不上**。另 **3 组「无档可查」**（账面本来就已标待证或物理无留痕），我不补写、不冒充实测。

### 4.3 收工越界窗口扫（`find -newermt`）
```
命令原文（仓库根）：
find . -path ./node_modules -prune -o -path ./.git -prune -o -type f -newermt "2026-09-23 06:13:16" -print
退出码：0        命中：801 行
日志：$T\e4c3-4-3-find-newermt.log（36229 B）
```
分类复算（脚本按路径前缀归组 + 排除式反查）：
```
797  ./apps/web/.next/*              ← @tm/web build 产物（件5 步骤1，预期内）
  1  ./apps/web/test-results/…        ← Playwright 运行产物（预期内）
  1  ./apps/web/tsconfig.tsbuildinfo   ← tsc 增量缓存（gitignored，A-88 #333 / .gitignore:62）
  1  ./.delivery/04-adjudications.md   ← TPM 亲笔（A-96/A-97，简报明示允许）
  1  ./.delivery/status.json           ← TPM 亲笔（简报明示允许）
────────────────────────────────────
非产物 / 非缓存 / 非 TPM 账面 的命中 = 0 颗
```
- 分组式 `'.next' | 'test-results' | '.tsbuildinfo'` 之外的 apps/web 命中我做了显式反查 = **0**，不是靠肉眼看清单。
- `apps/app/dist` **未出现在窗口内** ⇒ 自证本轮 0 重建 App 产物（§3.2 走「只报状态不 build」支）。
- `packages/agent/dist` **未出现在窗口内** ⇒ 自证 F-56 探针（§9-4）只写进了 TEMP。
- `.delivery/04-dev-report-E4c-iii.md` 将在本报告落盘后出现（本轮唯一可写文件，简报授权），**落盘前跑的本扫不含它属正常**。
- 简报预告的「允许出现」清单（`.next/`、`apps/app/dist/`、`test-results/`、`playwright-report/`、`*.tsbuildinfo`、本报告 + TPM 两颗账面）**逐颗对上，无一超出**。⚠ `playwright-report/` 本轮 0 出现：我用 `--reporter=json` + `PLAYWRIGHT_JSON_OUTPUT_NAME` 指向 TEMP，未生成 HTML 报告面。
- **⇒ 无源码/配置文件冒出来，本轮不停手。**

### 4.4 线上生产库相关判据（简报硬约束）
凡判据涉及线上生产库（真实账号数、真实词量、N/M/K/P/Q 与 R-41 计数等）：**未实测，待 Phase 7 向用户本人索取只读访问**。本轮我**没有**读取本地 `data.db` 的任何内容（只对它做 `stat` + `sha256sum`，⛔ 以读写方式打开、⛔ SQL/PRAGMA），本地库内 23 账号 / 16 空密码一类数字**一律不出现在本报告中**。

---

## 5. 件5 · Playwright（独占机器跑，跑时 0 并行）

### 5.1 步骤1 · `pnpm --filter @tm/web build`
```
命令原文：pnpm --filter @tm/web build
退出码：0
窗口：02:19:2x → 02:19:41
日志：$T\e4c3-5-0-web-build.log（2532 B）
```
新鲜度自证：`stat -c '%n size=%s mtime=%y' apps/web/.next/BUILD_ID` → `size=21 mtime=2026-09-26 02:19:25.732662 +0800`，值 `sKebZJAgwG9VkHqng4KMt`。⇒ **BUILD_ID 落在本次 build 窗口内**，产物新鲜。

### 5.2 步骤2 · 连跑 3 次（⛔ 未改 `apps/web/playwright.config.ts`）
```
命令原文（在 apps/web 下）：pnpm exec playwright test --reporter=json
   环境变量：PLAYWRIGHT_JSON_OUTPUT_NAME=$T\e4c3-5-pw-run{1,2,3}.json（只动命令行/环境，未动配置文件）
```
| 次 | 起 | 止 | 墙钟 | exit | 结果原文 | 日志 / JSON |
|---|---|---|---|---|---|---|
| 1 | 02:19:55 | 02:21:03 | **68s** | **0** | `118 passed` | `$T\e4c3-5-pw-run1.log` / `.json` |
| 2 | 02:21:09 | 02:22:13 | **64s** | **0** | `118 passed` | `$T\e4c3-5-pw-run2.log` / `.json` |
| 3 | 02:22:18 | 02:23:21 | **62s** | **0** | `118 passed` | `$T\e4c3-5-pw-run3.log` / `.json` |

- **账面期望 118 passed × 3 → 实测达成，0 红、0 flaky、0 重试**（JSON 里 `retry:true` 的结果条目 = 0，见 §5.3 首段）。三次原始结果全部保留，未做任何「跑到绿为止」。
- 装配面核对（`grep -n` 现读 `apps/web/playwright.config.ts`，本轮 0 改）：`:37 retries: process.env.CI ? 2 : 0` ⇒ 本地 **0**；`:51 workers: 2`；`:61 expect: { timeout: 10_000 }`；`:92 timeout: 120_000`；`projects` 两档视口 `:66 chromium-375x667` / `:77 chromium-1280x900`。⇒ 简报「钉 workers:2 / 本地 retries:0 / expect 10s」**逐条对得上**，且 `118 = 59 支 × 2 project`（JSON 实测：`chromium-375x667: 59, chromium-1280x900: 59`）。
- ⚠ **墙钟与账面不符**：账面（`current_green_baselines["playwright"]`）留的是 **54.8 / 55.4 / 54.4s**，本轮实测 **68 / 64 / 62s**，慢 **8–14s**。归因（有盘面对照）：**用例本体没变慢**（§5.3 的逐条 max 与账面 Top 同量级：7.15s vs 账面 7.3s；2.62s vs 2.6s；全量逐条合计 118.6s / 118 颗 = mean 1.005s，无长尾膨胀）⇒ 差额在 **`webServer` 起 `next start -p 3100` 的启动 + 收尾开销**，不在用例面。此条列入 §10「账面 vs 盘面不一致」，**不判红**（简报⛔我改 timeout 去凑）。

### 5.3 步骤3 · 每用例耗时表（`--reporter=json` 落盘后解析，⛔ 未改配置文件）
解析脚本 `$T\e4c3-5-pw-durations.py` → 表 `$T\e4c3-5-pw-duration-table.log`（3715 B）+ 全量逐条 `$T\e4c3-5-pw-duration-all.json`（21971 B）。

三次条数/状态：`run1 条数=118 passed=118 非passed=0 retry-run=0` / `run2 同` / `run3 同`。

**降序 Top 15**（每颗 = 同一用例在两个 project 下的一条；单位 ms，余量 = 30000 − max）：

| max | run1 | run2 | run3 | 余量/30s | 用例 |
|---|---|---|---|---|---|
| 7147 | 7067 | 7147 | 7123 | 22853 | `upgrade.spec.ts` :: ⑦ 改密成功：清两把 upgrade 键、写正常 token、告知常驻后回原页（判据⑦ 末句 / R-40③）[375x667] |
| 7069 | 7069 | 7015 | 7039 | 22931 | `upgrade.spec.ts` :: ⑦ 同上 [1280x900] |
| 2619 | 2605 | 2568 | 2619 | 27381 | `upgrade.spec.ts` :: 零副作用：未命中门禁时根 layout 的 `<UpgradeGate>` 不发请求、不写存储、不改 DOM |
| 2568 | 2568 | 2545 | 2564 | 27432 | `upgrade.spec.ts` :: 零副作用：同上（另一档视口） |
| 2012 | 1962 | 2012 | 1664 | 27988 | `auth-wall.spec.ts` :: ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词 |
| 1926 | 1926 | 1213 | 1134 | 28074 | `auth-wall.spec.ts` :: ① 已登录进 /study：DOM 全程不出现"请先登录后…"，骨架屏不留存（R-23②） |
| 1890 | 1890 | 1230 | 1129 | 28110 | `auth-wall.spec.ts` :: ① 已登录进 /wordbook：同上（R-23②） |
| 1881 | 1540 | 1514 | 1881 | 28119 | `auth-wall.spec.ts` :: ⑧ 运行时 0 命中禁词（另一档视口） |
| 1758 | 1685 | 1758 | 1726 | 28242 | `upgrade.spec.ts` :: 零副作用·止血阀 off：软待办位置起也不拦人、也不发请求（R-23⑦ 末句 / §6.4-5-5） |
| 1734 | 1696 | 1713 | 1734 | 28266 | `upgrade.spec.ts` :: 零副作用·止血阀 off（另一档视口） |
| 1613 | 1456 | 1410 | 1613 | 28387 | `auth-wall.spec.ts` :: ⑤ NO_PASSWORD_ACCOUNT：固定文案 + 可点"设置密码激活"→ 切注册态并保留手机号（R-01④） |
| 1494 | 1494 | 1339 | 1371 | 28506 | `auth-wall.spec.ts` :: ⑤ NO_PASSWORD_ACCOUNT（另一档视口） |
| 1492 | 1492 | 1427 | 1457 | 28508 | `auth-wall.spec.ts` :: ⑥b 对照组：密码错（服务端故意不给 §4.6 码，防枚举）不清凭据 |
| 1472 | 1377 | 1252 | 1472 | 28528 | `auth-wall.spec.ts` :: ⑥b 对照组（另一档视口） |
| 1456 | 1313 | 1350 | 1456 | 28544 | `home.spec.ts` :: ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 |

**全量统计**（每颗取三次最大值）：
```
条数 = 118        sum = 118604 ms      mean = 1005.1 ms     median = 784.5 ms
p95  = 1890 ms    max = 7147 ms
对 30s 用例预算的最小余量 = 22853 ms（最慢一颗）
超预算(>30000ms) = 0 颗        超 10s = 0 颗        超 5s = 2 颗
同一颗三次间最大抖动 (max-min) = 792 ms
```
**点名 >5s 的单条**（简报要求）：只有 **2 条，且是同一支用例在两档视口下各一次** —— `apps/web/e2e/upgrade.spec.ts` 的 **`⑦ 改密成功：清两把 upgrade 键、写正常 token、告知常驻后回原页（判据⑦ 末句 / R-40③）`**，7.15s / 7.07s。与账面 Top（A-78/A-79 留名 `upgrade:440 ⑦` 7.3s）**同一颗、同量级**，非本轮新增的慢点；仍余 22.8s 预算（3.2 倍）。

按 spec 分布（run1 实测）：`auth-wall 48 / upgrade 20 / wordbook 14 / profile 12 / home 10 / study 8 / home-redline 6` = 118（含两 project 各一次）。

---

## 6. 批次4 出口判据对账表（实测(数字) / 待证 / 未见证据）

判据清单来源（本轮不新造）：`status.json.batch_tasks.batch4_in_progress[0]`（E4c-iii 六件）、`batch4_followup` 内 E4 名下条目、`current_green_baselines` 各键、A-92 #365 列给 E4c 的 6 条「随单新料」、A-94 #386 的 8 条出口判据。

| # | 判据（E4c / E4 名下） | 三态 | 实测数字 / 缺口 |
|---|---|---|---|
| 1 | `--self-test` 闸门自证 | **实测 164/164，exit 0** | §1.1 |
| 2 | `--all` 全量门禁 = 15/21、6 红逐条处置 | **实测（15/21、6 红、5 条同账面、1 条 106）** + **处置建议已交（§8）** | §1.2；红 1 条数漂移归因**待证**（§1.2.1） |
| 2b | 账面「改前 `--all` 同 6 红」对照（A-93 #375 自记待证） | **无档可查 → 待证** | 改前日志物理不存在，本轮亦无法补 |
| 3 | `depcruise` 0 违规 | **实测 exit 0**（456 modules / 1573 deps，0 规则命中） | §1.3 |
| 4 | `ddl-parity` 双驱动一致 | sqlite **实测 0 差异** / pg **未见证据** | A/B/C 段 pg 全 SKIP（本机无 PG）；需 CI 起 PG（T-22 名下）→ §1.4、§10-1 |
| 5 | 根 unit 47 files / 1207+1 | **实测**（40.38s，exit 0） | §2.1 |
| 6 | 逐颗隔离跑防空项目 | **实测 6/6 非空** + 合计对账 47/1208 相等 | §2.1 |
| 7 | `@tm/agent` 补真测 ≥1 用例（A-63 #175 / A-94 #379） | **实测 3 files / 39 tests / exit 0** | §2.1 |
| 8 | 6 颗 typecheck 全绿 | **实测 5 绿 + 1 红（`@tm/shared` exit 2）** | §2.2 ← 本轮唯一新红 |
| 8b | `@tm/shared` / `@tm/ui` typecheck 是否在册 | **未见证据**（`current_green_baselines` 无这两颗键） | §2.2，建议入账（§10-2） |
| 9 | `--dist` 产物门禁 22 面 | **实测 exit 0 / 22 面 / 0 命中** | §3.1（**但产物是 E4b7 那颗、不含 E4c-ii 改动** ⇒ §3.2「待 TPM 判」） |
| 10 | `index-*.js` 506.93 kB 对账 | **实测 506926 B = 506.93 kB，吻合** | §3.3 |
| 11 | APK 只读体积清点 | **实测 8 颗 + 账面 3 颗对得上**；「哪颗交付」= 待 TPM 判；「体积差能否由 dist 解释」= **未见证据** | §3.4 |
| 12 | 首屏预算 | **实测判据数字 548644 B raw / 165180 B gzip**；阈值本体**未见证据** ⇒ 待 TPM 判 | §3.5 |
| 13 | 两证① 12 颗 sha256 锚点（含 F-46 三颗真库面） | **实测 开工 12/12 OK + 收工 12/12 OK** | §4.1 |
| 14 | 两证② `find -newermt` 越界扫 | **实测 801 命中 = 799 产物 + 2 颗 TPM 账面，源/配置 0 颗** | §4.3 |
| 15 | 历史轮锚点复算（A-8x/A-9x 带 sha 或 size+mtime 者） | **11 组对得上 / 0 组对不上 / 3 组无档可查（待证）** | §4.2 |
| 16 | Playwright 118 ×3 连绿（workers:2、本地 retries:0、expect 10s） | **实测 118×3，exit 0×3，0 retry**；墙钟 68/64/62s（账面 54.x）⇒ 差异见 §5.2、§10-3 | §5.2 |
| 17 | 每用例耗时表 + 30s 预算余量（A-78 #②/ A-79） | **实测 118 条全表 + Top15 + max 7147ms / 最小余量 22853ms / >5s 2 条点名** | §5.3 |
| 18 | F-56（A-95 #399）临时目录复算 | **实测复现，exit 0，产出 3 颗 `agent/test/*.spec.js`**；仓库 dist 0 写入自证 | §9-4 |
| 19 | F-45 验收判据（A-90 #347 钉的「带/不带 `diff --git` 头计数恒等」） | **未见证据（本轮无 scoped patch 输入，且⛔动闸门）**；由 E4c-i 的 `--self-test` 夹具 164/164 在册代证（A-93 #372 记 `:2997/:3006` 两条），**我没独立复跑那颗夹具** | §10-4 |
| 20 | F-41 / F-43 / F-52 闭项的出口复点 | **未见证据**（`--check-ownership` 需要各轮 scoped patch；简报未派、且本轮⛔新开通道） | §10-4 |
| 21 | `--check-ownership` 本轮自证 | **实测**：A-96 #403 已跑（exit 0 + no-entry NOTE，`$T\a96-precheck-report.log`）；本轮唯一写面 = 本报告，未复跑第二遍 | 账面在册 |
| 22 | `@tm/app build` 出口复跑（A-76 #②、A-92 #365⑤） | **未跑**（简报 §件3 明示「先只报状态、别自行 build」）⇒ 读 A-92 的 04:29 那颗 | §3.2 |
| 23 | N1 注释件（A-89 #339 → E4c-ii 件③） | **实测产物面**：`MeScreen.tsx` mtime 05:45:06 + 锚点 OK + `@tm/app test` 470 与基线逐字同数 ⇒ 行为 0 漂移；注释分类器 GREEN 属 A-95 #395 的 TPM 亲跑，本轮**未见证据**（工具在 `%TEMP%\e4b4\`，非我 scratch 面） | §2.1、§4.1 |
| 24 | 线上生产库相关全部判据（F-6 / U-1 / V-2 / F-32 / 只读访问） | **未实测，待 Phase 7 向用户本人索取只读访问** | §4.4 |
| 25 | QA/UAT 真机（Android WebView / dvh 语义 / F-28 残留） | **未见证据**（本轮无真机面；简报未派） | §10-5 |

---

## 7. 件6 · 报告本体与合规自证
- 唯一写面 = `E:\CC\tomorrow-memory\.delivery\04-dev-report-E4c-iii.md`（本文件）。字节数 / 行数 / 落盘时刻见文末实测。
- 全部 scratch、日志、快照、探针脚本 = `$T`（⛔ 仓库内无 scratch 文件）。
- 中间只读 git 命令 = `git status --short`（开工基线，未复跑）。
- `--filter` 约束：件2 的 6 颗逐颗都带 `--filter`；根跑那颗是账面要求的 `pnpm test` 本身，且我另用逐颗合计对账防「裸跑假红/假绿」。
- 退出码取法：一律 `命令 > "$绝对路径" 2>&1; echo EXIT=$?`，⛔ 管道吃码。

---

## 8. `--all` 6 红的逐条处置建议（**建议而已，裁决在 TPM**）

先给一条**总证据**，它改变全部 6 条的性质判断：我对每条红的命中做逐颗词元分类（`$T\e4c3-1-2c-all-json.log` + `--json` 全量 hits），结论是 **6 条红里绝大多数命中是「注释/负向断言里在复述被禁词本身」，不是被禁事实**。判据的正则不做注释剥离 ⇒ 「说明自己遵守规则」这句话本身触发红。

| # | 断言 | 实测命中构成（逐颗分类） | 真缺陷本体 | 我的处置建议 |
|---|---|---|---|---|
| 1 | `copy-legacy-zero` 12（+176 待走查） | **12/12 全是注释**，且内容就是在写「禁"云端/本地"字样」「禁词 `云端`/`本地`/`已连接`/`未连接` 屏内 0 处」这类**自陈遵守**的注释（`wordbook/page.tsx:17`、`settings-list.tsx:16`、`result-row.tsx:471`、`queries/auth.ts:33`、`AboutScreen.tsx:11`、`LookupScreen.tsx:73`、`MeScreen.tsx:48/:141`、`ProgressScreen.tsx:106`、`UpgradePasswordScreen.tsx:23`、`WordbookScreen.tsx:457/:475`） | **0 处上屏文案**。176 颗「人工复核词」判据原文已明示「不判红，UI §8.2-9 由走查确认」 | **走查后豁免**：建议把 `--copy` 的扫描面按 `codeOnly()` 剥注释（先例：A-90 件D `lookup-screen.spec.tsx` 的 `codeOnly()`、A-74 的自扫口径）后复点；剥完预期命中 0 ⇒ 该条转绿，176 走查仍留。**⛔ 建议只动扫描口径不动词表**。属 `tools/` 面 = TPM 亲写轮（A-93 先例） |
| 2 | `deadline-key-zero` 8 | 6 颗在 `apps/app/test/{security,study,upgrade×2,wordbook}-screen.spec.tsx` 的**禁词数组字面量**里（`for (const banned of [... 'passwordUpgradeDeadline'])`），2 颗在 `scripts/release/preflight.mjs:508/:846/:848`（preflight 的**规则名**与**故意造的负例夹具** `rows:[...goodRows,{key:'passwordUpgradeDeadline',…}]`） | **产品代码/配置里 0 处该键**。该断言 `noExceptions: true`、判据原文「全文 0 命中」——按字面它永远不可能绿，因为**钉子本身必须提到钉名** | **留下一期或改判据语义**：这颗是 6 条里唯一「修不动」的——把禁词从用例里删掉等于删掉守门人。建议：判据改为「`src/**` + 配置文件 0 命中，`test/**` 与 `scripts/release/**` 的负例夹具计入 NOTE 不计入红」，并补 `--self-test` 反例。**这是判据语义变更，必须 TPM 裁**，我不建议豁免 |
| 3 | `colors-no-hardcode` **106** | **真硬编码颜色 = 0 颗**（逐颗取词元复算：104 颗是 `#[0-9]{3,4}` 形状的**裁决号交叉引用**（`A-86 #320`、`#209`、`#210`、`#113`、`#106`、`#182`…）＋ 2 颗是注释里在讲 `rgb()`/`hsl()`/`#RRGGBB` 规则本身（`app.css:5`、`GrowthLine.tsx:8`，这两处 A-27 早就判过「注释自述被扫」）。分类分布：注释 92 + 尾注释行 14 | **0 处真缺陷** | **走查后豁免（同 #1 的剥注释修法，同一颗改动一起收）**。⚠ 附带一条**必须报的机制**：这条红的命中数会随**每一轮新写注释引用裁决号**而漂移（账面 100 → 实测 106 就是这么来的，§1.2.1 ⇒ A-88 #330 那次 E4b3b 也写过 `A-87 #325`）。不修 ⇒ 出口轮的 `--all` 数字对账**永远在漂**，这是账面稳定性问题不是产品债 |
| 4 | `css-important-budget` 4>1 | 1 颗真产品面 `packages/ui/src/styles/tokens.css:95`（`animation-name: none !important`），3 颗是测试里的**禁词正则**（`study-screen.spec.tsx:710` `not.toMatch(/primary-rate\|!important/)`、`patterns.spec.tsx:691/:695` 同族） | **1 处** = 恰等预算（≤1）。我亲读 `tokens.css:86-96`：该 `!important` **在 `@media (prefers-reduced-motion: reduce)`（`:89`）块内**，且块上方 `:86` 有 `a11y-exception: R-22 ④ —— 全站唯一一条提权声明` 注释 ⇒ **判据要求的三个条件（≤1 / reduced-motion 内 / 带 a11y-exception 注释）产品侧全部满足** | **修（只修计数面）**：把预算统计限定在 `src/**` 或剥注释/剥 test，即「产品面 1 处 = 达标」⇒ 该条转绿。风险最低的一颗，改动面只在 `css-important-budget` 的 `roots`/过滤 |
| 5 | `dark-variant-budget` 5>3 | **真 `dark:` 工具类 = 2 颗**：`packages/ui/src/primitives/dialog.tsx:19`（`dark:bg-black/60`）、`apps/web/src/app/(user)/chat/page.tsx:218`（`dark:text-amber-300`）。**3 颗是假阳**：`NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' }`（`MeScreen.tsx:269`、`settings-list.tsx:63`）与 `THEME_MODE_LABELS` 用例（`me-screen.spec.tsx:1615`）—— 正则把 TS **对象字面量的键** `dark:` 当成了 Tailwind 变体 | **2 处 ≤ 3 = 达标**。判据后半（`dark:bg-[` / `dark:text-[#` = 0）**实测 0 命中**（两颗真值都是命名色不是方括号任意值） | **修**：`dark:` 正则限定在 class/字符串上下文（或排除 `Record<` 行）⇒ 实测 2 颗、直接达标转绿。这颗剥开后**连豁免都不需要** |
| 6 | `web-home-transport` 7 | **7/7 全是注释**，内容是在解释规则本身：「传输仍只有 `@/lib/trpc`（判据⑤：首页无裸 `fetch(`）」「本文件既不发请求也不读存储」「禁 `fetch(` / `XMLHttpRequest` / `localStorage`」 | **0 处真越界**（无一处 `fetch(` 调用、无 `localStorage` 读写、无 `XMLHttpRequest`） | **走查后豁免（同 #1/#3 的剥注释修法）**。⚠ 但这条与 `--ui-io` 是「同一条检查、同一张共用核心词表」（判据原文，A-24-1/A-30-4）⇒ 改过滤必须两条同改 + 保持 `--dist` 与 `dist-guard` 的 ⊇ 关系，别只动一颗（那颗 `--self-test` 的 A-24-1 清单比对哨会红） |

**给 TPM 的一句话总结**：**6 红 = 5 条假阳（注释/负例/对象键被扫）+ 1 条判据语义自相矛盾（`deadline-key-zero` 字面不可能绿）**；真产品债 0 条，其中 `css-important-budget` 与 `dark-variant-budget` 剥掉假阳后**实测已在预算内**。集中处置动作 = **一次 `tools/boundaries.mjs` 的「剥注释 + 限定 class 上下文 + 排除 test/负例夹具」三件改动**，归 `tools/` 面（TPM 亲写，A-93 先例），⛔ 由开发轮顺手改词表。**是否算批次4 出口阻塞项 = TPM 裁**。

---

## 9. 件6 结构第 4 项 · F-56 复算（A-95 #399 / A-96 #406，TPM 新立）

### 9.1 申报与判据面
- 病灶：`packages/agent/tsconfig.json:6` = `"include": ["src", "test", "../shared/src"]`（本轮 `cat` 实测，原文照录；**我 0 改**）。
- 全仓只有 `@tm/agent` 的 `build` 脚本会消费这颗 tsconfig：`packages/agent/package.json` 的 `build = tsc -p tsconfig.json`（实测）。

### 9.2 临时目录复算（⛔ 改 tsconfig、⛔ 往仓库 `packages/agent/dist/` 写）
```
命令原文：
pnpm --filter @tm/agent exec tsc -p tsconfig.json \
  --outDir "C:\Users\曹怡明\AppData\Local\Temp\e4c3-iii\agent-build-probe" \
  --declaration false --declarationMap false --sourceMap false
退出码：0（无任何诊断输出）
时刻：2026-09-26 02:18:16
日志：$T\e4c3-6-4-f56-agent-build-probe.log（0 B = 无错无警）
产出清单：$T\e4c3-6-4b-f56-manifest.log（1848 B）
```

### 9.3 产出清单佐证
总产出 **41 颗**文件。**spec 被编进产物 = 实测复现，3 颗**：
```
agent-build-probe/agent/test/assessment.spec.js              7379 bytes
agent-build-probe/agent/test/fsrs.spec.js                    7082 bytes
agent-build-probe/agent/test/orchestrator-intent.spec.js     5731 bytes
```
（另有 `agent/src/scripts/test-lookup.js` 1817 B —— 这颗是 `src/scripts/**` 本体，**不算 F-56 的病灶**，但同样值得注意：node-only 脚本也进产物。）

**F-56 之外我实测多出的一条（账面未记，交 TPM 一并判）**：41 颗里有 **22 颗是 `shared/src/**`**（`shared/src/index.js`、`constants/*.js`、`contracts/*.js`、`schema/tables.js`、`types.js`、`utils.js` 等）。⇒ `@tm/agent build` 一旦跑，除测试码外还会**把 `@tm/shared` 整份再编进 agent 自己的 dist**（因为 `include` 里带了 `../shared/src`），而 shared 自己有独立 `build`/`dist`。这是同一颗 `include` 造成的第二个卫生问题，A-95 #399 那句只说了 test/，**没覆盖 shared 面**。

### 9.4 仓库面未被写入的自证
```
find packages/agent/dist -newermt "2026-09-26 02:00:00" -type f | wc -l  = 0
find packages/agent/dist -type f | wc -l                                 = 88（与复算前同数）
find packages/agent/dist -name '*.spec.*'                                = 0 颗
```
⇒ 与 §4.3 的 `find -newermt` 窗口自证一致（`packages/agent/dist` 未出现在越界窗口）。

### 9.5 现状定性（**判定权在 TPM**）
- **F-56 成立**（可复现、非推测）：`@tm/agent build` 会把 3 颗 spec 编进 `dist/agent/test/`。
- **本轮不构成出口阻塞的证据链**（与 A-95 #399 同口径，我实测复证）：① 产物门禁 `dist-artifact-portability` 的 `roots` 只含 `apps/app/dist`（`boundaries.mjs` 实测：`--dist` 报 22 面 = `apps/app/dist` 全部）⇒ agent dist **不在任何门禁面上**；② 全仓无任何命令/冒烟跑 `@tm/agent build`（A-95 #399 grep 结论；本轮我复核 `packages/agent/package.json` 的 scripts：只有 `build:index`/`test-query` 是 tsx 直跑源码，`build` 无消费者）；③ `packages/agent/dist` 现盘上是 09-19 的旧产物、**无 spec**（§9.4 实测 0 颗）。
- 简报给的裁决二选一（「`build` 前排除 `test`」或「明确允许 dist 带 spec 并写清理由」）我**都不自行选**；若选「排除」，我实测的可行动作是 `include` 去掉 `"test"`（`packages/agent/tsconfig.json:6`）或拆 `tsconfig.build.json` —— 二者都属 `packages/agent` 归属面 + 可能触 `@tm/agent typecheck`（那颗现在 exit 0，去掉 test 后 **spec 内的类型错会不会显形 = 我未实测，需 TPM 派轮验证**）。⛔ 我同意 #399 那句「别用加 `--all` 例外糊过去」。

---

## 10. 本轮没跑成的项 · 账面与盘面不一致之处（单列）

### 10.1 没跑成 / 跑不了的项
1. **`ddl-parity` 的 pg 面（A/B/C 三段）** —— 本机无 PG 实例、`DATABASE_URL_TEST` 未设，脚本自己打显式 SKIP 并警告「这不是通过」。**未在别处补跑**（起 PG 属环境装配动作，简报未授权）。⇒ 「sqlite/pg 双驱动行为一致」这一层**批次4 至今 0 实测**，只能在有 PG 的 CI 里出证（T-22 名下）。
2. **`pnpm --filter @tm/app build`** —— 简报明示「先只报状态、别自行 build」⇒ 未跑。当前 `apps/app/dist` 是 E4b7（09-23 04:29）那颗，**E4c-ii 的 MeScreen 改动不在产物里**（§3.2）。凡依赖「当前源码的产物」的判据（首屏预算、`--dist`、506.93 kB）**都是对这颗旧产物测的**。
3. **F-45 / F-41 / F-43 / F-52 的出口复点** —— 需要各历史轮的 scoped patch 作输入（都在 `%TEMP%\e4b*\` 别轮 scratch 面），简报未派、本轮⛔新开 `--check-ownership` 通道（A-96 #403）。⇒ 只有 `--self-test` 164/164 在册代证（A-93 #372 记了 `:2997` F-45 形状等价、`:3006` parsePatch 计数直判两条用例，我跑了但**没逐条读那两组用例的实现**）。
4. **注释分类器（A-94 #384 / A-95 #395）** —— 工具在 `%TEMP%\e4b4\a94-comment-only-check.mjs`，属别轮 scratch，简报未派我复用；且 MeScreen 那五处注释件的出口在 E4c-ii 已由 TPM 亲跑。**本轮未见证据**，不冒充实测。
5. **真机 / APK 内部体积** —— ⛔ 重打包、⛔ 解包。APK 与 dist 的体积映射**未见证据**（§3.4）。
6. **线上生产库全部相关判据** —— 未实测，待 Phase 7 向用户本人索取只读访问（§4.4、A-97 #410）。

### 10.2 账面与盘面不一致（逐条，**不修**）
| # | 不一致 | 账面 | 盘面实测 | 我的读法 |
|---|---|---|---|---|
| A | `colors-no-hardcode` 命中数 | 100（A-93 #375） | **106** | 漂移 +6，**归因待证**（§1.2.1）；且这条**机制上会继续漂**（§8 #3） |
| B | `@tm/shared typecheck` | `current_green_baselines` **无这颗键**（只有 server/app/web 三颗 typecheck；`@tm/ui` 也没有） | **exit 2、2 条 TS 错** | 不是「账面绿、盘面红」，是**账面从来没有这颗**。⇒ 批次4 出口若按账面读「6 张 typecheck 全绿」会**漏掉这颗红**（A-95 #398 那句只写「`@tm/agent` 与 `@tm/app` 各 0 错」，没覆盖 shared/ui） |
| C | `contracts.spec.ts:1253` 那颗同源哨的机检效力 | A-89 #337：「全仓第二份『外观』/『关于』字面量 0 处（**shared 那颗新哨机检的正是这条**）」 | 该哨的份数计数**恒 ≤1 ⇒ 永真**（§2.2 新发现 2，带现场实证） | 账面把一条**实际不成立**的机检当成了成立。「5A 单一声明点」目前只有取值比较那半边在守，份数那维是空的 |
| D | Playwright 墙钟 | 54.8 / 55.4 / 54.4s | **68 / 64 / 62s** | 用例本体未变慢（逐条 max 与账面 Top 同量级、>5s 只有账面点名的那 2 条）⇒ 差额在 `webServer` 启停，**不判红**，但出口报告的耗时数字要按本轮实测改读 |
| E | 简报正文里的 `--all` 六红名单 | 5 条对得上 | 第 3 条 = 106 | 同 A，我按简报要求「数字漂移就报差异并给归因」，⛔ 未修 |
| F | 账面 `current_green_baselines["playwright"]` 的 Top 耗时指针 | `upgrade:440 ⑦` 7.3s、`upgrade:253` 2.6s | 7.15s / 2.62s（同名同支用例） | 对得上（行号锚 `:440/:253` 我未逐行核，只核了用例标题） |
| G | 简报「已知 `mobile-memory/tmword-dev.apk` 177536 B @09-20 00:07」等三颗 | 同 | 逐颗对得上；另**账面未列的 5 颗**（`mobile-agenda` 4 颗 + `build/base.apk`）我一并列入 §3.4 | 简报 A-96 #405 已注明「`mobile-agenda/` 四颗属隔壁项目」⇒ 一致，非差异 |
| H | 我在册的 `@tm/ui test` / `@tm/web test` 颗数 | 账面有（168 / 16） | 168 / 16 | 一致 ✅（无差异） |

### 10.3 一条流程观察（不是缺陷，供出口报告参考）
本轮**全部红点都是「从来没量过的面」而不是「量过又坏掉的面」**：`@tm/shared typecheck`（无基线键）、`:1253` 哨（无 `--self-test` 型反永真自检覆盖用例面）。这与 `status.json.batch4_followup` 里 A-63 #175 那句「我两次把没跑过的推断当成结论写」、A-79 #274「日志未存 ⇒ 不可独立复核」是同一族：**账面可信度取决于覆盖面，不取决于跑过的次数**。⇒ 建议（**裁决在 TPM**）：`current_green_baselines` 的 typecheck 键补齐到 **6 颗全**（现 3 颗），并把「每颗 project 隔离跑 + 合计对账」钉成出口硬判据（本轮 §2.1 的 `3+1+3+1+18+21=47`、`39+68+168+16+470+447=1208` 两行对账就是这项的可复制形状）。

---

## 11. 收工自证（实测，非估算）

我不宣布「E4 / 批次4 出口通过」。§6 表里凡是 **待证 / 未见证据** 的行，我按 A-77 #261 口径保持原态，⛔ 用推测冒充实测。

### 11.1 本报告本体（`stat` + `wc -l` 实测）
```
路径：E:\CC\tomorrow-memory\.delivery\04-dev-report-E4c-iii.md

V1 首版落盘：      51229 B / 502 行 / 2026-09-26 02:30:18.306974900 +0800
V2 补写 §11 后：   54412 B / 555 行 / 2026-09-26 02:30:48.045458300 +0800
```
⚠ **一颗文件无法实测「写完自己之后的自己」**：§11.1 这处更正本身会让字节数再变。故此处只保证两条：
① 上面两行数字都是 `stat`/`wc -l` 的**当场实测值**（⛔ 估算、⛔ 未填占位）；
② **权威终值以 §11.2 收工复扫与收工回执里报给 TPM 的那一组为准**（那组是在本轮最后一次写面之后测的）。

### 11.2 收工两证（第三次复点）
```
① sha256sum -c（仓库根跑，锚点 = $T\a96-anchor.txt）
   时刻 02:30 之后 → EXIT=0，12/12 全 OK
   日志：$T\e4c3-4-4-anchor-CLOSING.log
   ⇒ 本轮三个时点各复算一次，三次全 OK：开工基线 02:08（e4c3-anchor-BEFORE-baseline.log）
     / 件5 跑完 02:24（e4c3-4-2-anchor-AFTER.log）/ 收工落盘后 02:30（本颗）

② find -newermt "2026-09-23 06:13:16"（剪 node_modules / .git）
   命令原文同 §4.3，仅追加一次复扫
   日志：$T\e4c3-4-5-find-newermt-CLOSING.log（EXIT=0）
   命中 802 颗 = 797 颗 `apps/web/.next/**` + 1 颗 `apps/web/test-results/**`
              + 1 颗 `apps/web/tsconfig.tsbuildinfo`
              + 3 颗 `.delivery/**` 账面/报告
   非产物、非缓存的全部命中逐颗列出（3 颗，一颗不多）：
     ./.delivery/04-adjudications.md        ← TPM 亲笔（A-96/A-97；简报明示允许，A-96 #409）
     ./.delivery/status.json                ← TPM 亲笔（同上）
     ./.delivery/04-dev-report-E4c-iii.md   ← 本轮唯一可写文件（简报 §1 明示授权）
   ⇒ 源码 / 配置 / 闸源码 / 三颗真库面 / apps/app/dist / packages/agent/dist = 窗口内 0 命中
   ⇒ 无越界，不停手。
```

### 11.3 归属机检自证（本轮写面进闸走一遍）
```
命令原文：node tools/boundaries.mjs --check-ownership --task E4c-iii --files .delivery/04-dev-report-E4c-iii.md
退出码：0
原文输出：
  TABLE E:\CC\tomorrow-memory\tools\ownership.json
  NOTE .delivery/04-dev-report-E4c-iii.md：归属表无条目（no-entry，不阻断）
  --check-ownership task=E4c-iii 触碰 1 个文件 → 无越界
日志：$T\e4c3-7-check-ownership.log
⇒ 与 A-96 #403 的派单前预跑同数（那颗 = $T\a96-precheck-report.log）
```

### 11.4 需要 TPM 裁的（blockers，逐条，我不自行处置）
1. **`@tm/shared typecheck` exit 2**（§2.2 新发现 1）——批次4 出口是否接受「带一颗从未在册、现实测为红的 typecheck」出去。
2. **`contracts.spec.ts:1253` 永真哨**（§2.2 新发现 2 / §10.2-C）——涉及 A-89 #337 已判绿账面的一句「机检的正是这条」是否要更注。
3. **`--all` 6 红处置**（§8）——5 条假阳 + 1 条判据语义矛盾；是否阻塞出口。
4. **`colors-no-hardcode` 100→106 的归因**（§1.2.1）——我按「归因待证」交回，不记红。
5. **`apps/app/dist` 陈旧**（§3.2）——出口报告的产物类判据是按 09-23 04:29 那颗读，还是补跑一次 `@tm/app build`。
6. **F-56 二选一 + 我实测多出的 shared 面**（§9.3 末段）——账面 A-95 #399 只记了 test/ 半件。
7. **APK「哪颗是交付件」**（§3.4）+ 首屏预算阈值本体（§3.5）。
8. **pg 侧 ddl-parity 0 实测**（§1.4 / §10.1-1）——T-22/CI 面是否计入批次4 出口。
9. **Playwright 墙钟 62–68s vs 账面 54.x**（§5.2 / §10.2-D）——是否改账面留名值。
10. **`current_green_baselines` 的 typecheck 键只有 3/6 颗**（§10.3）——建议补齐，属账面动作。

