# 04-dev-report · E4/批次4 出口报告（TPM 亲写亲跑）

- 轮次：**#7 / #39 E4：批次4 出口轮**（账面补录 + 基线再生 + 越界授权收口）
- 执行人：TPM 本人（本轮全部数字是我亲跑的命令原始输出，无 agent 转述）
- 开工时钟：**2026-09-26 04:16:20**（`%TEMP%\e4x\run.log` 第 1 行 `START 2026-09-26 04:16:20`，`date` 实测）
- 收工时钟：**2026-09-26 04:26:4x**（本报告最后一段取证 `date` 实测）
- 一句话结论：**批次4 出口判据的十条实测面全绿**（typecheck 6/6、单测 47 files / 1207 passed + 1 skipped、逐颗隔离与根跑**逐字对账一致**、`--all` 21/21、`--self-test` 201/201、`--dist` 22 产物面 1/1、Playwright e2e 118 passed、只读面 6/6 原值、越界扫 18 颗**全部可归因**）。三件**没绿也不该绿**的欠账如实挂账：F-59（首屏 gzip 断言未落地）、产物陈旧（`apps/app/dist` = 09-23 04:29 / `.next` = 02:19:25）、APK 无本轮交付件。Phase 7 五件仍全部「未实测，待向用户本人索取」。

---

## 0. 先说清楚：这一轮为什么由我亲跑，不派 agent

A-101 #459 把 `@tm/server` 那颗补跑判给 TPM，理由是「为保护真库只读面三颗，agent 不碰 server 全量」。A-101 #465 排的下一颗就是本出口轮，且把**基线再生**整包划给我。所以本轮没有任何产品代码改动，只有：跑命令、读盘面、落账面。

**⛔ 本轮我 0 次写打开产品文件。** 唯一新落盘的仓库内文件 = 本报告 + A-102 所在的 `04-adjudications.md` + `status.json`（这三颗都在 TPM 面上），加一颗 Playwright 副产物 `apps/web/test-results/.last-run.json`（04:21:51，`{"status":"passed","failedTests":[]}`，工具自写）。

---

## 1. 件1：出口复跑五组（T1–T5），一次脚本、全 exit 0

脚本：`%TEMP%\e4x\run_t1_t5.sh`；总日志：`%TEMP%\e4x\run.log`；分颗日志：`t1-*.log` / `t2-root-test.log` / `t3-<pkg>-test.log` / `t4-*.log`。

| 组 | 命令 | 区间（实测） | exit | 结论 |
|---|---|---|---|---|
| T0 | `sha256sum -c` 只读面锚（**跑前**） | 04:16:20 | 0 | 6/6 OK |
| T1 | `pnpm -r typecheck` | 04:16:20 → 04:16:40 | **0** | 6 颗全 Done |
| T2 | `pnpm -r test` | 04:16:40 → 04:17:27 | **0** | 47 files / 1207 passed + 1 skipped |
| T3 | 六颗**逐颗隔离** `test` | 04:17:27 → 04:18:21 | 6×0 | 与 T2 逐字对账（§2） |
| T4 | `--all` / `--all --json` / `--self-test` / `--dist` | 04:18:21 → 04:18:58 | 0/0/0/0 | 21/21、201/201、1/1（§3） |
| T5 | `sha256sum -c` 只读面锚（**跑后**） | 04:18:59 | 0 | 6/6 OK，三颗 mtime 原值未变（§5） |

T1 原文（`t1-root-typecheck.log`，`Scope: 6 of 7 workspace projects`）：`packages/shared`、`packages/agent`、`packages/ui`、`apps/app`、`packages/server`、`apps/web` 六颗逐条 `Done`，0 error。⇒ **E4d 件A（shared typecheck 清零）在根跑面上复确认**，且 A-100 让 agent 用 `--outDir` 把三颗 spec 退出 agent typecheck 之后没有把任何一颗的覆盖弄丢（`apps/app`、`packages/server`、`apps/web` 各自 typecheck 都在跑）。

---

## 2. 件2：单测「根跑 vs 逐颗隔离」双向对账 —— 1207 这个数字现在有两个独立来源

`pnpm -r test` 一把跑（T2）与六颗各跑一次（T3）在 vitest workspace 模式下**可能不等价**（裸跑丢 jsdom、`--project` 过滤不严格，见既有账面坑）。所以两边都跑、逐字比：

| 包 | T2 根跑原文 | T3 隔离原文 | 一致 |
|---|---|---|---|
| `@tm/shared` | `Test Files 1 passed (1)` / `Tests 68 passed (68)` | 同 | ✔ |
| `@tm/ui` | `3 passed (3)` / `168 passed (168)` | 同 | ✔ |
| `@tm/agent` | `3 passed (3)` / `39 passed (39)` | 同 | ✔ |
| `@tm/app` | `18 passed (18)` / `470 passed (470)` | 同 | ✔ |
| `@tm/server` | `21 passed (21)` / `446 passed \| 1 skipped (447)` | 同 | ✔ |
| `@tm/web` | `1 passed (1)` / `16 passed (16)` | 同 | ✔ |
| **合计** | **47 files / 1207 passed + 1 skipped（1208 条）** | **47 / 1207 + 1** | ✔ |

- 对账基线：E4c-iii 那颗根跑日志 `47 files / 1207 passed \| 1 skipped` ⇒ **逐字对齐**，本轮无新增/无丢失用例。
- **A-101 #459 的欠账已清**：`@tm/server` 一颗由我本人跑（21 files / 446 passed + 1 skipped，隔离 18.00s / 根跑 33.54s），不再依赖「本轮改动面无 server 侧」的推理。
- server 那颗里唯一 skipped = 既有那一条（D-14 上线零掉线组内），**不是**本轮新造，且 `test.skip`/`test.fail` 跨轮遗留扫过 0（E4d 出口闸的 comment-only 分类器 + ownership 通道同一口径）。
- ⚠️ 一条无害噪声如实登记：`@tm/web` 那颗跑时 console 有 `DEPRECATED The workspace file is deprecated...` 与一条 `An update to SearchSection inside a test was not wrapped in act(...)`（`apps/web/test/home-shell.spec.tsx`，`[T-12 已查询态计数] raw = 7 聚合 = 6`）。用例仍绿，`act()` 警告不改变断言结果，登记不擅自修（属产品测试面，不在 TPM 通道）。

---

## 3. 件3：门禁三面（`--all` / `--self-test` / `--dist`）+ colors 基线重钉入册

### 3.1 `--all` = 21/21 全绿（`t4-all.log`，04:18:2x）

末行原文：`21/21 条通过，全绿`。E4d-gate-truth 那颗（A-101(a)(b)(c) 三处判据口径改判）之后**没有任何一条靠词表/例外/预算放宽变绿**，六颗改判据的红在 04:18 的现盘上仍是同一口径。逐颗 `report-only` 计数与 A-101 #452 的 142 对账之间要做**口径区分**（这是本轮新发现的一颗账面坑，登记在 §8-2）：

| 断言 | 04:18 现盘 detail 原文（节选） |
|---|---|
| `copy-legacy-zero` | `0 命中`；例外豁免 51；**注释内命中 36 处按 A-101(a) 不判红**；需人工复核词命中 52；复核词的注释内命中 125 |
| `deadline-key-zero` | 运行面与配置面 `0 命中`；**负例/测试面 8 处按 A-101(c) 计入不判红** |
| `colors-no-hardcode` | **白名单内 6 处，其余 0 命中**；例外豁免 60；注释内命中 108；**台账引用（A-<n> #号）7 处不判红** |
| `css-important-budget` | **样式面 1 处（预算 1，且合规）**；未计入 3 处反例面、0 处非样式形状、0 处注释 |
| `dark-variant-budget` | **`dark:` 变体 2 处（预算 3，覆盖 2 行）**；键位写法 3 行按 A-101(b) 不计红 |
| `web-home-transport` | `0 命中`；例外豁免 0；**注释内命中 7 处按 A-101(a) 不判红** |
| `dist-artifact-portability` | **22 个产物文件（js/css/html）：判据① 0 处以 `/` 开头的资源路径、判据② 0 处 Chrome84 之后的 API** |

⇒ **colors 基线按剥注释口径重钉后的在册值**：代码面硬编码 **0 处**、白名单 **6 处**、例外豁免 60、注释内 108（不判红）、台账引用 7（不判红）。旧口径的 **100 / 106 两颗作废**，A-102 入册。

**判红面未漂移的实测证据**：把 03:49 的 `e4d/a101-all-json-AFTER.json` 与 04:18 的 `e4x/t4-all.json` 逐颗比 `status` 与 `hits.length`：六颗分别 `green/51`、`green/0`、`green/6`、`green/1`、`green/2`、`green/0` ⇒ **两侧完全相同**。也就是 04:18 的 `--all` 与 A-101 落账时的判定是同一份盘面结论，21/21 不是一次新运气。

### 3.2 `--self-test` = 201/201（`t4-selftest.log`，45746 B）

末两行原文：`OK ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）` ⇒ `boundaries --self-test：201/201 通过`。

其中 E4d-gate-truth 新种的 **10 颗夹具**（`tools/fixtures/selftest/comment-noise/**` 5 颗 + `violations/gate-truth-real/**` 5 颗，mtime 03:44:19 → 03:46:19，见 §6 越界扫原文）在册；净增 +37 条自测（A-101 #451）。⇒ **门禁仍有判定力**这条不是我说出来的：每颗绿都有对应的一颗必红夹具在自测里守着。

### 3.3 `--dist` = 1/1（`t4-dist.log`，22 个产物文件）

原文：`22 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）`。
⚠️ **这 22 颗产物的新鲜度有问题，见 §4。**

---

## 4. 件4：产物面 —— gzip 我亲量了，但产物是旧的（这是本轮最重要的一颗挂账）

### 4.1 我亲量的 gzip（`gzip -9 -c <file> | wc -c`，04:25:52 实测，全 22 颗）

| 文件（`apps/app/dist/`） | raw | **gzip** |
|---|---|---|
| `assets/index-fsestLC2.js`（首屏主块） | 506926 | **155486** |
| `assets/index-T4SUTEM1.css` | 38631 | **8047** |
| `index.html` | 3087 | **1698** |
| `assets/StudyScreen-k-7mxp_Y.js` | 12605 | 5348 |
| `assets/LookupScreen-B_jkKtSk.js` | 10710 | 4286 |
| `assets/result-row-BVrqGfqu.js` | 13519 | 5272 |
| `assets/WordbookScreen-CY2kMbXR.js` | 8697 | 3612 |
| `assets/MeScreen-aIuVHPh0.js` | 9665 | 3238 |
| `assets/useQuery-B-61RJPI.js` | 9504 | 3401 |
| `assets/ProgressScreen-DwKtev-K.js` | 6790 | 2755 |
| 其余 12 颗（每颗 ≤2675 B gz） | — | 全部 ≤2675 |

- 判据本体：`02-tech-design.md:571`「**首屏 JS 预算 ≤ 250KB gzip**，在 CDP 用例里断言」。前半句实测满足：**155486 B ≈ 151.8 KiB ≤ 250 kB**。
- 与 agent 曾报的 `155416` 差 **70 B**：属 `gzip` 头/文件名 MTIME 编码差异，两颗都在阈值内 ⇒ 不追（要追只能钉同一个 gzip 实现）。
- 后半句（**在 CDP 用例里断言**）**现盘 0 实现** ⇒ **F-59 仍开**。我没有为了凑绿手写一条一次性脚本判据：预算断言必须落在 e2e/CDP 用例里，那是 #54 E5-apk 通道的活，不在 TPM 面上。

### 4.2 产物陈旧两颗（实测 mtime）

| 产物 | mtime | 相对本轮代码 |
|---|---|---|
| `apps/app/dist/**`（全部 22 颗） | **2026-09-23 04:29** | 早于 E4d 的三件（03:26:43 `copy.ts` / 03:32:18 `MeScreen.tsx` / 03:32:30 `footer-note.tsx`）**三天** |
| `apps/web/.next/BUILD_ID` | **2026-09-26 02:19:25** | 早于 `footer-note.tsx` 那颗注释件（03:32:30） |
| `packages/shared/dist/**` | 2026-09-19 14:00 起 | 里面仍是过期文案串（E4d 报告 §9.4 已登记，简报 ⛔ 手改） |

⇒ 三条必须写进结论的诚实标注：
1. `--dist` 的 22 面与 §4.1 的 gzip 都是**对 09-23 那颗产物的度量**，不是对现源码的度量；
2. §6 的 Playwright 118 passed 是**对 02:19:25 那颗 `.next` 构建产物测的**（E4d 的三件里 `footer-note.tsx` 只改了注释 ⇒ 屏上内容无变化，所以这条陈旧**不使本轮 e2e 结论失效**，但它必须在报告里显形）；
3. **重建 `dist` + 复跑 `--dist` + 首屏 gzip 断言 + 重打 APK = #54 E5-apk**，本轮不偷跑（重建会写 `apps/app/dist`，那颗不在 TPM 通道上）。

---

## 5. 件5：真库只读面 —— 跑前/跑后 6/6 逐字 OK，三颗 mtime 原值未变

锚点清单 `%TEMP%\e4x\anchor.txt`（`sha256sum` 全值）与 `run.log` 的 T0/T5 段：

| # | 路径 | sha256 前 12 | 大小 | mtime | T0 04:16:20 | T5 04:18:59 |
|---|---|---|---|---|---|---|
| 1 | `data.db`（**真库**） | `6595517661cc` | 253952 | 2026-09-18 04:05:38.198449400 | OK | OK（原值） |
| 2 | `data.db-shm` | `2bceb8907276` | 32768 | 2026-09-17 00:53:01.561551800 | OK | OK（原值） |
| 3 | `data.db-wal` | `88ed3fe2b2ce` | **424392** | 2026-09-18 04:09:16.857435000 | OK | OK（原值） |
| 4 | `tools/ownership.json` | `8ec08ad32042` | 本轮未动 | — | OK | OK |
| 5 | `package.json` | `5c70b5d21c1d` | — | — | OK | OK |
| 6 | `vitest.workspace.ts` | `82d1aa5d4f6e` | — | — | OK | OK |

⇒ 新证一条：**`pnpm -r test`（含 `@tm/server` 全量 21 files）与逐颗隔离跑，合计跑完以后三颗只读面逐字未变**，尤其 `data.db-wal` 仍是 424392 B / 04:09:16 ⇒ **没有发生 checkpoint、没有读写打开**。A-85 #311 / F-46 的「只读面 = 三颗，不只 `data.db`」口径这轮拿到了一次跨全量测试的实测支撑。
⇒ **e2e 段的第三点也已补齐**：Playwright 跑完（04:21:51）之后我在 **04:29:04** 再点一次 `sha256sum -c` ⇒ **6/6 OK**，且 `stat` 实测三颗 = `data.db 253952 @2026-09-18 04:05:38.198449400` / `data.db-shm 32768 @2026-09-17 00:53:01.561551800` / `data.db-wal 424392 @2026-09-18 04:09:16.857435000` ⇒ **三颗 mtime 与大小跨「全量单测 + 门禁 + e2e」整轮原值未动**，本轮只读面**两证齐全、无缺口**（04:16:20 / 04:18:59 / 04:29:04 三点）。

---

## 6. 件6：e2e（Playwright）118 passed，冷服务、2 workers

`%TEMP%\e4x\pw-run.log`（28489 B）原文：
```
PW START 04:20:36
Running 118 tests using 2 workers
  118 passed (1.2m)
PW_EXIT=0
PW END 04:21:51
```
- 覆盖两个视口：`chromium-375x667`（移动）+ `chromium-1280x900`（桌面），含 `auth-wall.spec.ts`（T-16 登录墙/①①b②③④⑤）、`wordbook.spec.ts`（含最后一条「文案真源：改密提示与 `@tm/shared` 的 `TM_ERRORS` 逐字相同」）、`upgrade.spec.ts`（T-16 强制改密门禁 ⑦）。
- **冷服务口径**：04:20:36 前实测 `127.0.0.1:3100` 无 `LISTENING`（`netstat` 输出在会话内、未单独落盘 ⇒ 记为「会话实测」），跑完 04:26:43 复点仍 `0` 监听 ⇒ webServer 由 Playwright 起、自关。1.2m 与 A-101 #465 排的「62–68s 冷服务 / 56.8s 暖服务」区间一致（75s）。
- `apps/web/test-results/.last-run.json`（04:21:51）= `{"status":"passed","failedTests":[]}`。
- ⛔ 本轮 e2e 判据不涉及线上生产库，也没拿本地 `data.db` 的账号数据凑数（23 账号 / 16 空密码这类字样在本报告 0 出现，属 Phase 7 前的禁用面）。

---

## 7. 件7：越界扫 —— 18 颗，逐条归因，0 颗无主

`find apps packages tools scripts -type f -newermt '2026-09-26 03:15'`（剪 `node_modules` / `dist` / `.next` / `coverage` / `*.tsbuildinfo`），全量原文 `%TEMP%\e4x\overreach-scan.txt`（1453 B / 18 行）：

| # | mtime | 文件 | 归因 |
|---|---|---|---|
| 1 | 03:22:56 | `packages/shared/test/contracts.spec.ts` | E4d 件A（通道在册，A-100 六颗） |
| 2 | 03:25:24 | `packages/agent/tsconfig.json` | E4d 件B（通道在册，唯一 tracked 颗） |
| 3 | 03:26:43 | `packages/shared/src/constants/copy.ts` | E4d 件C-1（ICP 真号） |
| 4 | 03:32:18 | `apps/app/src/screens/MeScreen.tsx` | E4d 件C-2 |
| 5 | 03:32:30 | `apps/web/src/components/home/footer-note.tsx` | E4d 件C-4 |
| 6 | 03:35:11 | `apps/app/test/me-screen.spec.tsx` | E4d 件C-3 |
| 7–11 | 03:44:19 → 03:45:17 | `tools/fixtures/selftest/comment-noise/**` 5 颗 | **我**（E4d-gate-truth，A-101 #451） |
| 12–16 | 03:45:45 → 03:46:19 | `tools/fixtures/selftest/violations/gate-truth-real/**` 5 颗 | **我**（同上） |
| 17 | 03:48:55 | `tools/boundaries.mjs` | **我**（223388 B / sha12 `51570e64c932`；A-101 #454 裁掉 agent 报的「外部改四次」= 就是我） |
| 18 | 04:21:51 | `apps/web/test-results/.last-run.json` | Playwright 工具自写（本轮 e2e 副产物） |

⇒ 03:15 之后**没有任何一颗**产品文件在 E4d 六颗通道之外被改；本轮（04:16 之后）新增 1 颗且是测试工具产物。归属闸与我的重算 patch 两条独立证据链同结论（A-101 #458）。

---

## 8. 未尽项 / 待 Phase 7 / 账面新坑（如实登记）

1. **F-59 仍开**：`02-tech-design.md:571` 后半句「在 CDP 用例里断言」0 实现。我亲量的 155486 B 只是**度量**，不是**断言**。派给 #54。
2. **账面新坑一颗（本轮亲测，登记待 A-102 入册）**：`a101_reconcile.py` 的「copy-legacy-zero 12」与 `--all` detail 的「注释内命中 36 处」是**两个不同分母**——前者 = 改前 142 条红命中里归属该颗的名额，后者 = 现盘该颗 report-only 的注释命中总数（含改前也一直不判红的那些）。⛔ 以后引用这两个数必须带口径，否则会出现「12 变 36」的假漂移。
3. **行数口径差异一颗（A-101 #465 遗留）**：`04-adjudications.md` 现盘 `wc -l` = **1239**，python `count("\n")+1` = **1240**（末尾换行）。账面统一以 `wc -l` 为准并标注口径，登记于 A-102。
4. **只读面三点齐全（本轮无缺口）**：04:16:20（跑前）/ 04:18:59（T1–T4 后）/ 04:29:04（e2e 后）三点 `sha256sum -c` 均 **6/6 OK**，三颗 mtime 与大小原值（§5）。
5. **Phase 7 五件全部未实测**（A-97 定档：用户本轮只给 F-32 一件）：F-6 告警目标地址、U-1 keystore 仓库外双备份位置与访问人、线上生产库只读访问、V-2 真实恢复演练回填 `backups/manifest.json.restore_drill`，以及 F-32 的**线上域名展示核对**——用户给的真值 = 备案号 `赣ICP备2026013161号-1` / 主办单位 **曹怡明（个人主体）**，源码与测试面已由 E4d 件C 落屏并实测（A-101 #457），但 tmword.xyz **线上页脚**是否显示该串，只能等部署后向用户本人索取只读访问才能判 ⇒ F-32 的「闭」仅指**源码/产物屏**这一层。
6. **APK 无本轮交付件**（9 颗全是旧物，⛔ 删）：`mobile-memory/明日记忆.apk` 58691 B @09-18 04:09:52、`tmword-dev.apk` 177536 @09-20 00:07:15（+ `build/base.apk` 162322 / `apk/app.unsigned.apk` 169060 / `apk/app.aligned.apk` 169063）、`mobile-agenda/**` 4 颗属隔壁项目。⇒ 「内部可用版」的**装得上**这一条目前只有 09-20 那颗旧 APK 作证据，与 09-23 之后的代码面脱节 ⇒ 必须走 #54 重打。
7. **未裁四件不阻塞**（A-98 #421：App 页脚工信部外链、两端页脚次序、`© 2026` 年份与主办单位名上屏口径、以及 #465 排的两处复核）：仍在册等用户。
8. ⛔ 本会话未授权任何 git 写操作（无 `commit`/`push`/`stash`/`checkout`/`restore`/`reset`/`add`）。全部 git 调用只有 `status`/`ls-files`/`show`/`check-ignore` 这类只读。工作区仍是多角色未提交状态（88 ` M` / 94 `??`），越界自证一律走 scoped patch，不走 HEAD diff。

---

## 9. 交付档位对表（内部可用版：装得上 / 跑得住 / 测得绿 · 截止 2026-09-27 06:00）

| 档 | 判据 | 本轮实测 | 判定 |
|---|---|---|---|
| **测得绿** | 类型 + 单测 + 门禁 + e2e 四面全绿 | T1 6/6 exit 0；T2/T3 47 files / 1207+1skip 双向对账；T4 21/21、201/201、1/1；T6 e2e 118 passed | **达成（源码面）** |
| **跑得住** | 冷启动 e2e 覆盖登录墙/改密/词本/文案真源；只读面不被触碰 | §6 冷服务 118 passed（75s）；§5 三颗原值 | **达成** |
| **装得上** | 内部版 APK 在场且对应现产物 | 最新 APK = 09-20 00:07，`dist` = 09-23 04:29 | **未达成 → #54** |
| 产物新鲜度 | `dist` / `.next` 对应现源码 | §4.2 三颗陈旧 | **未达成 → #54** |
| 预算断言 | 首屏 JS ≤250KB gzip 且**在用例里断言** | 度量 151.8 KiB 达标；断言 0 实现 | **未达成 → F-59 / #54** |

⇒ 实测余量：本档收工 **2026-09-26 04:3x**，窗口截止 = **2026-09-27 06:00**（`status.json · 内部可用版交付窗口.截止`）⇒ **≈25.5 小时**。剩余关键路径 = **#47 E5-register**（`/register` 落路由表，通道先独占登记再派单）→ **#54 E5-apk**（重建两颗 `dist` ⇒ 复跑 `--dist` ⇒ F-59 断言 ⇒ 重打内部版 APK）。「装得上」这一条要在 #54 之前拿到，否则交付档位只有两档半。

---

## 10. 本轮时间线（全部 `date` / 日志实测）

| 时钟 | 动作 | 证据 |
|---|---|---|
| 04:10:15 → 04:15:17 | 落 **A-101**（21 行 #445–#465 + #444/#464/#465 就地更正） | 现盘 1239 行（`wc -l`）/ 589338 B / sha12 `b991b1aca82f`，最终 sha 落 `e4d\a101-final-proof.log`（账面不自我引用） |
| 04:13:54 | 落 **status.json** A-101 同步（`latest_adjudication` A-100→A-101、四颗 open_items 就地打【已闭 · A-101 #…】、`batch4_done` += `E4d`,`E4d-gate-truth`、基线面 9 键重钉） | 353 行 / 134645 B / sha12 `286c26210049` |
| 04:16:20 | 出口轮 T0 锚点 6/6 OK → **T1 `pnpm -r typecheck`** exit 0（04:16:40） | `e4x\run.log`、`t1-root-typecheck.log` |
| 04:16:40 → 04:17:27 | **T2 `pnpm -r test`** exit 0（47/1207+1skip） | `t2-root-test.log`(171491 B) |
| 04:17:27 → 04:18:21 | **T3 六颗逐颗隔离**，6× exit 0，与 T2 逐字对账 | `t3-{shared,ui,agent,app,web,server}-test.log` |
| 04:18:21 → 04:18:58 | **T4** `--all` 21/21 · `--all --json` · `--self-test` 201/201 · `--dist` 1/1，4× exit 0 | `t4-all.log`(4196 B)、`t4-all.json`(138376 B)、`t4-selftest.log`(45746 B)、`t4-dist.log`(318 B) |
| 04:18:59 | **T5 收工锚点 6/6 OK**（三颗 mtime 原值） | `run.log` T5 段 |
| 04:19:xx | `--all --json` 与 03:49 AFTER json 逐颗比 `status`/`hits.length` ⇒ 六颗完全相同 | 本节实测（口径 §3.1） |
| 04:20:36 → 04:21:51 | **Playwright e2e** 冷服务 `--workers=2` ⇒ `118 passed (1.2m)`，exit 0 | `pw-run.log` |
| 04:22:xx | 越界扫 18 颗逐条归因 | `overreach-scan.txt` |
| 04:24:35 → 04:25:52 | 只读面/闸脚本 sha 复点 + `apps/app/dist` 22 颗 **gzip 我亲量** + APK 9 颗盘点 | `sha256sum`/`stat`/`gzip -9` 输出 |
| 04:26:43 | 复点 3100 无监听（webServer 自关）；写本报告 | 本节时钟 |
| **04:29:04** | **只读面第三点：`sha256sum -c` 6/6 OK** + `stat` 三颗原值（e2e 之后） | §5（`anchor.txt` 复跑） |
| 04:31:02 | 落 **A-102**（14 行 #466–#479，版式机检 `LAYOUT_BAD=0`，脚本 `e4x\land_a102.py` → `land_a102.log`） | 现盘 **1258 行（`wc -l`）/ 599821 B / sha12 `215cbb4fa893`** @04:31:02 |
| 04:34:20 | 落 **status.json** A-102 同步（`latest_adjudication` A-101→**A-102**、`batch4_queued` 清空 + `batch4_done` += `E4-exit`（79 条）、基线键 26→**29**、F-59 就地追加【A-102 #471/#472 复确认，仍未闭】、交付窗口顺序重写） | 现盘 **355 行（`wc -l`）/ 141043 B / sha12 `de264f02b338`** @04:34:20 |
| 04:34:30 | 三颗 TPM 面终值复点（`wc -l -c` + `sha256sum`） | `e4x\a102-final-proof.log` |

---

## 11. 本档两证 + 账面终值（全部实测，⛔ 预测值）

**A-102 与 status.json 的收工两证（我 04:34:30 亲点）**：

| 文件 | 行数（`wc -l` 口径，A-102 #478） | 字节 | sha256 前 12 | mtime |
|---|---|---|---|---|
| `.delivery/04-adjudications.md`（A-102 落完） | **1258** | **599821** | `215cbb4fa893` | 2026-09-26 04:31:02.753051100 |
| `.delivery/status.json`（A-102 同步完） | **355** | **141043** | `de264f02b338` | 2026-09-26 04:34:20.094906200 |

（两颗改前值与备份：`04-adjudications.md` 1239 行 / 589338 B / `b991b1aca82f` → `%TEMP%\e4x\_bk_pre-A102_04-adjudications.md`；`status.json` 353 行 / 134645 B / `286c26210049` → `%TEMP%\e4x\_bk_pre-A102_status.json`。`status.json` 写入前我先做了一次「无改动 re-dump 必须与盘面逐字相同」的形状断言并通过 ⇒ 落法与盘面同形。）

**本档自身**：报告落盘后由外部日志 `e4x\a102-final-proof.log` 记录 `wc -l` / `wc -c` / `sha256sum` 前 12 + mtime，避免「一颗文件无法实测写完自己之后的自己」（E4c-iii 那条在册教训）⇒ 本行不写本档的 sha。本档最后一次内容改动 = 04:35 前后补的四段（只读面第三点、F-32 线上口径、余量实测 ≈25.5h、时间线与两证表），此后未再改。

**⛔ git 写操作 0**（本轮全部 git 调用只有只读 `status`/`ls-files`）。
