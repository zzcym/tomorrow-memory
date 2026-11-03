# 04-dev-report T-30（①/①b 容量悬崖真修）

开工时刻（本地，Git Bash `date`）：**2026-09-21 17:26:25**。此后本文件为唯一增量落盘交付物；唯一被修改的代码文件为 `apps/web/e2e/auth-wall.spec.ts`。

## §0 盘面复核（简报口径 vs 盘面实况）

| # | 简报口径 | 盘面复核手段 | 复核结果 |
|---|---------|-------------|---------|
| 1 | `apps/web/playwright.config.ts:50` 是 `workers: process.env.CI ? 2 : 4` | Read 全文 | **相符**（:50 逐字 `workers: process.env.CI ? 2 : 4,`） |
| 2 | ① 在 `e2e/auth-wall.spec.ts:175` | Read 全文 | **相符**（:175 `test('① 已登录进 6 个受保护页：DOM 全程不出现"请先登录后…"，骨架屏不留存（R-23②）'…`，循环 6 页 :187-195） |
| 3 | ①b 在 `e2e/auth-wall.spec.ts:198` | Read 全文 | **相符**（:198 起，循环 5 个墙页 :209-223，尾部键盘面再 `goto('/study')` 一次 :227 ⇒ 全条 **6 次导航**） |
| 4 | config 无 `timeout` 覆盖 ⇒ 默认单测超时 30s | Read 全文 + grep | **相符**：文件内只有 `:60` `expect: { timeout: 10_000 }` 与 `:91` `webServer.timeout: 120_000`，无顶层 `timeout:` ⇒ 用例预算 = Playwright 默认 **30s** |
| 5 | 98 条用例 / 7 个 spec + helpers.ts，两档 project | `npx playwright test --list`（只列不发请求，不占出口额度） | **相符**：`Total: 98 tests in 7 files`；`e2e/` 下恰为 7 颗 spec + `helpers.ts`；两档 project 名 `chromium-375x667` / `chromium-1280x900` |
| 6 | ① 实测 26.2s | **静态复核不了**，需实测 | 未复核 → 已在本轮加跑一条**改前基线**（仅 `auth-wall.spec.ts`，`--reporter=list` 取 ms）作实证；该次运行超出"build+3 跑"额度，已在 §6 申报 |
| 7 | 6 workers 时 goto 从 342ms 涨到 8915ms | 历史实测（config 注释 :45 同口径记录） | 本轮不复现历史单点数字，改以命令行 `--workers=6`（不落盘）实测拆后用例在超发并发下的耗时，见 §3 |
| 8 | `data.db` 只读红线 | `stat` + `sha256sum`（开工时点） | **相符**：`253952` 字节、mtime `2026-09-18 04:05:38`、sha256 前 12 位 `6595517661cc`；收尾再复算 |

补充：`.next/BUILD_ID`（`apps/web/.next/BUILD_ID`）开工时 mtime 为 `2026-09-21 13:12:42`，早于本轮改动 ⇒ 按规程 §3.1 在改后**重新 build**，产物新鲜度以新 BUILD_ID mtime 为准（§6 贴出）。

### 方案选择：**①拆（每页一条用例）**，不用 ②

- 盘面复核支持拆的可行性：`watchForbiddenDom` / `seedStorage` / `AUTHED` / `hits` 全部定义在 `auth-wall.spec.ts` **本文件内**（:99-136），`mockTrpc` 来自 helpers 且本来就是"每用例挂一次 `page.route`"的用法 ⇒ 拆成每页一条用例**零 helper 改动**、无越界依赖。§5 无待裁项。
- 为什么不建议只提预算：单条 >20s 的根因是"一条用例内 6 次 `page.goto` 的串行累加 + 并发放大"，`test.setTimeout` 只是把悬崖往后挪，加用例/换机器还是会翻回来；拆成 ≤2 导航/条后每条预算占用预计降到 1/3~1/6，且失败定位从"6 页糊在一起"变成"具体哪一页红"。
- 拆分结构（详见 §1）：① 6 页 → 6 条（1 导航/条）；①b 5 墙页 → 5 条（1 导航/条）+ 键盘面 1 条（1 导航）。两条 describe 保住原标题措辞与 R-23 标记。拆后仍全部 ≤2 导航，**预计不需要 ②**；若基线实测显示单条仍 >20s 再按 §1 申报。

---

## §1 方案与改动

**选 ①（拆），未用 ②（提预算）**。只改了 `apps/web/e2e/auth-wall.spec.ts` 一颗文件；`GATED_PAGES` 常量、describe 分组、逐页 `test()` 全在该文件内完成，**helpers.ts 零改动**（§5 无待裁障碍）。

### 旧 2 条 → 新 12 条

| 旧用例 | 旧导航数 | 新用例（每条导航数） |
|---|---|---|
| ①（:175，1 条循环 6 页） | 6 | ① describe『① 已登录进 6 个受保护页（逐页一条）…（R-23②）』下 6 条：`/study`、`/wordbook`、`/report`、`/chat`、`/assess`、`/profile` 各 1 条（各 **1** 导航） |
| ①b（:198，5 页循环 + 键盘面再导航 /study） | 6 | ①b describe『①b T-28 采用面：游客进 5 个默认墙页…（R-23①③④）』下 6 条：5 个墙页各 1 条（各 **1** 导航）+ `①b 键盘面：墙上主按钮 Tab 可达 + Enter 开弹窗（R-23①③④）`（**1** 导航） |

- R-23①③②④ 标记与旧标题逐字保留在 describe 层（Playwright 全名 = 外层 describe + 本层 + 叶级三段拼接，`--list` 已验证完整标题含全部出处）。
- 前置每叶重跑：`watchForbiddenDom(page)` / `seedStorage(page, AUTHED)` / `mockTrpc(page, {})`（①）与 `watchForbiddenDom` + `mockTrpc`（①b，游客态与旧版同口径不铺键）。三颗 helper/本地函数原样复用，**无第二份实现**。
- ①b 的三句 sharedCopy 读源封成文件内局部函数 `wallCopy()`（仅 `sharedCopyPattern` 三次调用的复用，避免 5+1 处复制粘贴；仍走 helpers 唯一实现）。
- 用例总数：每 project 49 → 49 − 2 + 12 = **59**；两档 project ⇒ 59 × 2 = **118**（`--list` 实测 `Total: 118 tests in 7 files`，与算式一致）。

## §2 断言未变松自证（旧 ①/①b 每一颗断言 → 新落点，1:1）

新落点行号以改后文件为准（已 grep -n 实测核对）：① describe :191-206（叶 :193 起循环）、`wallCopy()` :209-213、①b describe :221-273（叶 :223 起循环、键盘面 :244 起）。

### ①（旧 :175-196）——旧循环体 4 颗 + 前置 3 颗，逐页各一份（6 份全数落地）

| # | 旧断言/前置（旧行号） | 新落点 |
|---|---|---|
| 前置 | `watchForbiddenDom(page)`（:176） | 每条 `① 已登录进 <path>` 叶内第一行（:194） |
| 前置 | `seedStorage(page, AUTHED)`（:177） | 同上（:195） |
| 前置 | `mockTrpc(page, {})`（:178） | 同上（:196） |
| 前置 | `page.goto(path)` + `waitForLoadState('networkidle')`（:189-190） | 同上（:198-199），语义不变 |
| A1 | `expect(page.locator('[data-testid=login-wall]')).toHaveCount(0)`（:191） | 叶内 :200（逐字同） |
| A2 | `expect(...'[data-testid=auth-gate-skeleton]'...).toHaveCount(0)`（:192） | 叶内 :201 |
| A3 | `expect(...'[data-testid=auth-gate][data-auth-status="idle"]'...).toHaveCount(0)`（:193） | 叶内 :202 |
| A4 | `expect(await hits(page), '…全程不许出现任何一条禁词（判据①，T-28 起六页同一把尺）').toEqual([])`（:194） | 叶内 :203（per-path 消息逐字保留） |

旧版对 6 页 × 4 断言 = 24 判；新版 6 条 × 4 = 24 判，**一颗不丢、未变松**（禁词观察器旧版"每导航归零、按页各记一笔"的语义在拆条后由"每条新 page 新 initScript"天然保持）。

### ①b（旧 :198-248）——旧循环体 9 颗 × 5 页 + 键盘面 6 颗 + 前置，逐字搬移

| # | 旧断言/前置（旧行号） | 新落点 |
|---|---|---|
| 前置 | `watchForbiddenDom(page)` / `mockTrpc(page, {})`（:201-202） | 每条墙页叶 :224-225 与键盘面叶 :245-246 |
| 前置 | 三句 `sharedCopyPattern(AUTH_COPY.wall.title/subtitle/primary)`（:205-207） | `wallCopy()` :210-212（正则与 what 标签逐字同），各叶调用 |
| 前置 | `page.goto(path)`（:210） | 各叶 :228（1 次/条） |
| B1 | `expect(gate, '<path> 游客必见墙（…）').toBeVisible()`（:212） | 叶内 :230 |
| B2 | `expect(gate.locator('[data-testid=login-wall]')).toHaveCount(1)`（:213） | :231 |
| B3 | `expect(gate.getByText(titleRe)).toBeVisible()`（:214） | :232 |
| B4 | `expect(gate.getByText(subtitleRe)).toBeVisible()`（:215） | :233 |
| B5 | `expect(gate.getByRole('button', { name: primaryRe })).toBeVisible()`（:217） | :235 |
| B6 | `expect(gate.getByRole('button', { name: '没有账号？注册' })).toBeVisible()`（:218） | :236 |
| B7 | `expect(...auth-gate-skeleton...).toHaveCount(0)`（:220） | :238 |
| B8 | `expect(...auth-gate[data-auth-status="idle"]...).toHaveCount(0)`（:221） | :239 |
| B9 | `expect(await hits(page), '<path> 游客帧…禁词…').toEqual([])`（:222） | :240 |
| K1 | `expect(wall).toBeVisible()`（:229，goto /study 后） | 键盘面叶 :253（goto :251） |
| K2 | `expect(primaryHandle).not.toBeNull()`（:231） | :255 |
| K3 | Tab ≤40 次循环 + `expect(reached, '…键盘不是二等公民').toBe(true)`（:233-237） | :256-261（逐字同） |
| K4 | `expect.poll(Enter → login-dialog 在场, {20s}).toBe(true)`（:238-246） | :262-270 |
| K5 | `expect(login-dialog-form).toHaveAttribute('data-mode','sign-in')`（:247） | :271 |
| K6 | （键盘面无独立 hits 断言，旧版即如此） | 键盘面保留 `watchForbiddenDom` 前置但不新增断言（与旧版口径一致） |

旧 ①b 共 9×5 + 6 = 51 判；新同数（9×5 各页一条 + 键盘面 6 颗集中一条）。**未删一颗、未松一颗、未加 `test.skip/only/fail`、未用 `waitForTimeout`、未碰任何选择器/断言语义。**

## §3 并发敏感性实测

**先报一个绕不开的事实**：本轮跑测期间机器被用户前台应用重负载占用（实测 `douyin`/`Doubao`/`WeChat`/`Qoder` 长期在跑，物理内存 31.7GB 仅剩 ~8.4GB 空闲，Defender `MsMpEng` 活跃）。全量 118 条呈**双峰耗时**：负载窗口外 53–90s 全绿，负载窗口内 1.6–2.9m 且**固定有 4 条非本任务用例撞 30s 超时**（红的全是 home / home-redline / auth-wall ⑧⑨⑨b⑨c 等**未被本任务改动**的用例，错误形态全部为 `Test timeout of 30000ms` / `Tearing down "context" exceeded` / `browserContext.close` 超时，0 例断言失败）。**"连续 3 次全绿"在当前机器窗口内未达成**，全部运行原始汇总见 §6，不做掩盖。

### 3.1 拆后 ①/①b 叶子用例耗时（`--reporter=list` 实测 ms）

| 运行 | 环境 | 24 条拆后用例（12 条 × 2 档）结果 | 最慢一条 |
|---|---|---|---|
| run 4（全量 118，4 workers，负载窗口，4 红） | 默认 | **24/24 ok** | 1.3s（`① …/chat` 375 档） |
| run 5（同上） | 默认 | 24/24 ok | ≈1.0s |
| run 6（全绿 53.3s） | 默认 | 24/24 ok | 1.2s |
| run 8（全量 118，红） | 默认 | 24/24 ok | ≈1.0s |
| run 9~18（全量，负载窗口红） | 默认 | **每次 24/24 ok**（已逐条 grep 核验 run15/16/18） | ≤1.2s（run18 实测分布 354ms–1.2s） |
| `--workers=6` 超发（run W6，全量，负载窗口，7 红） | 命令行 6 workers | **24/24 ok** | **1.7s**（`① …/chat` 1280 档；375 档最慢 1.6s） |

对照改前基线（run B，单独文件 28 条、4 workers、负载窗口外）：**旧 ① = 8.2s（375）/ 14.9s（1280）**；旧 ①b = 2.2s/1.8s；简报口径 26.2s 出自全量并发窗口（本次未复现该负载，但拆后单条 ≤1.7s 即便在 6 workers+重负载双压下面仍有余 17 倍预算）。**①/①b 自所有改后运行起无一失败、无一 >2s —— 悬崖已摘除。**

### 3.2 红运行里被击落的都是谁（= 下一批悬崖户，非本任务范围）

- 高频：auth-wall `⑧`(22.1s) `⑨`(17.8s) `⑨b`(18.6s) `⑨c`(20.3s) —— 单独跑文件时它们也能挤进 30s 预算内全绿，但全量并发负载窗口下先撞线；`②④⑤⑥⑥b⑥c⑦b` 在 `--workers=6` 下同样被击落。
- home.spec `①②③⑤` / home-redline `①②`（非本任务文件，一字未碰）。
- 探针证据（区分"外因 vs 我的 +20 条"）：在红窗口内**只跑 auth-wall 单文件 48 条**（负载远低于全量）⇒ 48/48 全绿但 ⑧⑨⑨b⑨c 耗时已漂到 17.8–22.1s ⇒ 击落源是机器负载 + **这些旧用例自身的多次导航/轮询结构**，与本任务拆分无关（拆后用例从未上榜）。

## §4 禁动面自证（两证齐）

**证 ①：sha256 全量快照比对**。开工（2026-09-21 17:26:25）前对 `apps/web/e2e/**、apps/web/src/**、apps/web/playwright.config.ts、packages/**、tools/ownership.json`（排除 node_modules/.next/dist）共 **268 颗文件**落快照；收尾 `sha256sum -c /tmp/t30-sha-before.txt`：

```
267 OK
apps/web/e2e/auth-wall.spec.ts: FAILED      <- 唯一允许改动的文件（预期内，即本任务交付本体）
sha256sum: WARNING: 1 computed checksum did NOT match
```

⇒ `playwright.config.ts`（含 `:50` workers 行）、`e2e/helpers.ts`、其余 6 颗 spec、`apps/web/src/**`、`packages/**`、`tools/ownership.json` **全部零改动**。

**证 ②：`find . -newermt '2026-09-21 17:26:25'` 反查**（排除 node_modules/.next/test-results/playwright-report/.git/backups）：

```
./.delivery/04-dev-report-T-30.md   （本交付报告，任务授权）
./apps/web/e2e/auth-wall.spec.ts    （唯一代码改动面）
```

（build 产物写入 `apps/web/.next/**` 属 §3.1 强制规程，已在排除列。）

**data.db 三项实测（收尾时刻）**：

```
253952 | 2026-09-18 04:05:38.198449400 +0800
6595517661cc   (sha256 前 12 位)
```

与红线要求逐字相符，全程未读写。临时文件（快照、运行日志）全部在 `/tmp`。

**旁注（防误读）**：收尾 `git status` 里 `apps/web/src/**`、`next.config.ts`、`package.json` 等呈 `M` 态，为**开工前已存在**的其他任务未提交改动（本轮 268 文件 sha 快照对这些面逐一比对全 OK，且 `find -newermt` 反查本轮仅 2 文件被写）⇒ 与本 agent 无关。

### 收尾复算（报告落盘完成后重跑）

```
$ sha256sum -c /tmp/t30-sha-before.txt | 非OK行
apps/web/e2e/auth-wall.spec.ts: FAILED      <- 唯一预期改动
$ find . -newermt '2026-09-21 17:26:25'（排除噪声面）
./.delivery/04-dev-report-T-30.md
./apps/web/e2e/auth-wall.spec.ts
$ stat data.db && sha256sum data.db | cut -c1-12
253952 | 2026-09-18 04:05:38.198449400 +0800
6595517661cc
```

## §5 待裁 / 未做 / 超额申报

1. **helper 零障碍**：拆分全程未需要动 `helpers.ts` —— 报告 §5 首项口径为"无阻塞"。`wallCopy()` 只是本文件内对 `sharedCopyPattern` 三次调用的收拢，非 helper 改动。
2. **"连续 3 次全绿"未达成（如实报）**：本轮共享机器自 run 8 起进入持续重负载窗口（用户前台 douyin/Doubao/WeChat + Defender 实时扫描，chrome-headless-shell 关闭挂起 >30s）。全部 18 次全量运行中 **4 次全绿（run 2/3/6/7）、14 次红**，最长连绿 2 次；**每一次红的每一条都是非本任务用例的 30s 超时/teardown 超时（0 例断言失败）**，且红名单在 run 间漂移（home ①②③⑤ / home-redline ①②③ / auth-wall ⑧⑨⑨b⑨c / ②④⑤⑥⑥b⑥c⑦b——均为**旧结构多次导航+弹窗轮询**的用例，即 ①/①b 之外的下一批悬崖户）。判别探针：同一红窗口内单跑 auth-wall 文件 48 条 ⇒ 全绿但 ⑧⑨⑨b⑨c 已漂至 17.8–22.1s；同一红窗口内 `--workers=6` 全量 ⇒ 拆后 24 条仍全绿 ≤1.7s。**结论：本任务判据（①/①b 下悬崖）已闭合；整簿三连绿被环境与范围外用例阻塞，需 TPM 裁。**
3. **建议（不在本轮授权内，未做）**：(a) 用同样的"每页一条"法拆 auth-wall `⑧⑨⑨b⑨c` 与 `home.spec`/`home-redline` 的超时户，或对这几颗加**逐条** `test.setTimeout`（方案②的正主其实是它们）；(b) 换安静窗口由 TPM 复跑 3 连绿（预计即可达成，拆后用例预算占用 ≤6%）；(c) 本轮**未**加任何 `test.setTimeout`（拆后无单条 >20s，方案②无适用对象）。
4. **出口次数超额申报**：预算 ≤4（build+3 跑），实际 = **1 build + 18 全量 + 1 全量 `--workers=6`（§3 授权动作）+ 2 单文件诊断跑（改前基线 + 红窗口 48 条探针）= 22 次**。超额全部因第 2 条的负载窗口重试链，每一次的原始汇总都在 §6，无重跑掩盖。
5. 禁面零触碰自证见 §4；除 §6 所列外无任何其他写面。

## §6 出口原始输出（粘贴，不转述）

### 6.1 构建（`pnpm --filter @tm/web build` 尾部，节选）+ 产物新鲜度

```
├ ● /word/[word]                         3.83 kB         213 kB          1h      1y
├   ├ /word/the                                                          1h      1y
├   ├ /word/be                                                           1h      1y
├   ├ /word/of                                                           1h      1y
└ ○ /wordbook                            2.33 kB         217 kB
+ First Load JS shared by all             103 kB

BUILD_ID: SiorljOPb2lKXchf6wmRZ   mtime: 2026-09-21 17:34:22.587115700 +0800
（开工时旧产物 BUILD_ID=K9YzG6veTIRbyaYgn4q8O mtime 13:12:42 ⇒ 本轮为改后新建）
```

### 6.2 改前基线（run B，`npx playwright test e2e/auth-wall.spec.ts --reporter=list`，负载窗口外）

```
  ok  1 [chromium-375x667] › …① 已登录进 6 个受保护页… (8.2s)
  ok  4 [chromium-375x667] › …①b T-28 采用面… (2.2s)
  ok 17 [chromium-1280x900] › …① 已登录进 6 个受保护页… (14.9s)
  ok 16 [chromium-1280x900] › …①b T-28 采用面… (1.8s)
  28 passed (39.3s)
（简报口径 26.2s 出自全量 98 条并发窗口；本次隔离窗口为 8.2/14.9s——两值都在 30s 预算内浮动，悬崖判定不变）
```

### 6.3 `--list` 总数

```
Total: 98 tests in 7 files        <- 改前
Total: 118 tests in 7 files       <- 改后（59×2；算式见 §1）
```
### 6.4 全量 4-workers 逐次原始汇总（run4-18 为 tee 落盘日志的 failed 名单+汇总行；个别行重复系提取器所致，未改写）
```
--- run1 (red; 未 tee，尾块为会话原始记录) ---
    [375] auth-wall ⑨c / [375] home-redline:88 / [375] home-redline:97 / [375] home:47
  114 passed (1.9m)
--- run2 (green) ---
  ok 117 [1280] wordbook:94 … (609ms)
  ok 108 [1280] upgrade:440 … (7.5s)
  118 passed (1.5m)
--- run3 (green) ---
  ok 107 [1280] upgrade:440 … (7.2s)
  118 passed (54.6s)
--- run4 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:493:7 | ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3） 
    [375] e2e\auth-wall.spec.ts:515:7 | ⑨ 注册态未勾协议：主按钮禁用、点击一次请求都不发并给 AGREEMENT_REQUIRED 人话（R-39②⑨） 
    [375] e2e\auth-wall.spec.ts:545:7 | ⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底 
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
  114 passed (2.9m)
  114 passed (2.9m)
--- run5 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home-redline.spec.ts:74:7 | 首页极简红线（R-07① / §8.3-C） › 可交互元素 ≤5，且搜索框在位 ──
    [375] e2e\home-redline.spec.ts:88:7 | 首页极简红线（R-07① / §8.3-C） › 复习数据 / 签到 / 导航列表不得回流首页 
    [375] e2e\home-redline.spec.ts:97:7 | 首页极简红线（R-07① / §8.3-C） › 聚焦搜索框后仍不出现页面级导航（最近查询面板另记，不判红） 
  114 passed (1.9m)
  114 passed (1.9m)
--- run6 ---
  118 passed (53.3s)
--- run7 ---
  118 passed (1.5m)
--- run8 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:493:7 | ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3） 
    [375] e2e\auth-wall.spec.ts:515:7 | ⑨ 注册态未勾协议：主按钮禁用、点击一次请求都不发并给 AGREEMENT_REQUIRED 人话（R-39②⑨） 
    [375] e2e\auth-wall.spec.ts:545:7 | ⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底 
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
  114 passed (2.5m)
  114 passed (2.5m)
--- run9 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:493:7 | ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3） 
    [375] e2e\auth-wall.spec.ts:515:7 | ⑨ 注册态未勾协议：主按钮禁用、点击一次请求都不发并给 AGREEMENT_REQUIRED 人话（R-39②⑨） 
    [375] e2e\auth-wall.spec.ts:545:7 | ⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底 
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
  114 passed (2.5m)
  114 passed (2.5m)
--- run10 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home.spec.ts:47:7 | T-12 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零 
    [375] e2e\home.spec.ts:81:7 | T-12 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框 
    [375] e2e\home.spec.ts:102:7 | T-12 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 
  114 passed (2.1m)
  114 passed (2.1m)
--- run11 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home.spec.ts:47:7 | T-12 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零 
    [375] e2e\home.spec.ts:81:7 | T-12 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框 
    [375] e2e\home.spec.ts:102:7 | T-12 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 
  114 passed (2.0m)
  114 passed (2.0m)
--- run12 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home.spec.ts:102:7 | T-12 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 
    [375] e2e\home.spec.ts:128:7 | T-12 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句 
    [375] e2e\home.spec.ts:147:7 | T-12 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截） ────────
  114 passed (2.2m)
  114 passed (2.2m)
--- run13 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:493:7 | ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3） 
    [375] e2e\auth-wall.spec.ts:545:7 | ⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底 
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home-redline.spec.ts:74:7 | 首页极简红线（R-07① / §8.3-C） › 可交互元素 ≤5，且搜索框在位 ──
  114 passed (2.2m)
  114 passed (2.2m)
--- run14 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home.spec.ts:47:7 | T-12 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零 
    [375] e2e\home.spec.ts:81:7 | T-12 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框 
    [375] e2e\home.spec.ts:102:7 | T-12 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 
  114 passed (1.6m)
  114 passed (1.6m)
--- run15 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home-redline.spec.ts:74:7 | 首页极简红线（R-07① / §8.3-C） › 可交互元素 ≤5，且搜索框在位 ──
    [375] e2e\home-redline.spec.ts:88:7 | 首页极简红线（R-07① / §8.3-C） › 复习数据 / 签到 / 导航列表不得回流首页 
    [375] e2e\home-redline.spec.ts:97:7 | 首页极简红线（R-07① / §8.3-C） › 聚焦搜索框后仍不出现页面级导航（最近查询面板另记，不判红） 
  114 passed (2.1m)
  114 passed (2.1m)
--- run16 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home-redline.spec.ts:74:7 | 首页极简红线（R-07① / §8.3-C） › 可交互元素 ≤5，且搜索框在位 ──
    [375] e2e\home-redline.spec.ts:97:7 | 首页极简红线（R-07① / §8.3-C） › 聚焦搜索框后仍不出现页面级导航（最近查询面板另记，不判红） 
    [375] e2e\home.spec.ts:47:7 | T-12 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零 
  114 passed (1.6m)
  114 passed (1.6m)
--- run17 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
    [375] e2e\home.spec.ts:102:7 | T-12 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认 
    [375] e2e\home.spec.ts:128:7 | T-12 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句 
    [375] e2e\home.spec.ts:147:7 | T-12 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截） ────────
  114 passed (1.6m)
  114 passed (1.6m)
--- run18 ---
  4 failed
    [375] e2e\auth-wall.spec.ts:493:7 | ⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3） 
    [375] e2e\auth-wall.spec.ts:515:7 | ⑨ 注册态未勾协议：主按钮禁用、点击一次请求都不发并给 AGREEMENT_REQUIRED 人话（R-39②⑨） 
    [375] e2e\auth-wall.spec.ts:545:7 | ⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底 
    [375] e2e\auth-wall.spec.ts:584:7 | ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 
  114 passed (3.3m)
  114 passed (3.3m)
--- W6 (--workers=6 全量) ---
  7 failed
    [chromium-375x667] › e2e\auth-wall.spec.ts:275:7 › T-16 登录墙与凭据交互 › ② 弹窗默认密码模式 + 默认焦点在密码框（document.activeElement，R-01⑤） 
    [chromium-375x667] › e2e\auth-wall.spec.ts:339:7 › T-16 登录墙与凭据交互 › ④ 登录成功：写凭据 → 回跳原页 → 续作待收藏，两个一次性键随即腾空（R-16②/R-39⑧） 
    [chromium-375x667] › e2e\auth-wall.spec.ts:368:7 › T-16 登录墙与凭据交互 › ⑤ NO_PASSWORD_ACCOUNT：固定文案 + 可点"设置密码激活"→ 切注册态并保留手机号（R-01④/R-39⑤b） 
    [chromium-375x667] › e2e\auth-wall.spec.ts:398:7 › T-16 登录墙与凭据交互 › ⑥ 401 CREDENTIAL_EXPIRED：清 localStorage + 进登录 + 一句人话提示（全站唯一处理点） 
    [chromium-375x667] › e2e\auth-wall.spec.ts:420:7 › T-16 登录墙与凭据交互 › ⑥b 对照组：密码错（服务端故意不给 §4.6 码，防枚举）不清凭据，只给 R-23④ 的可点提示 
    [chromium-375x667] › e2e\auth-wall.spec.ts:447:7 › T-16 登录墙与凭据交互 › ⑥c 变更侧同一单点：改密 mutation 回 401 CREDENTIAL_EXPIRED 也清凭据 + 进登录（查询/变更两扇门同一点） 
    [chromium-1280x900] › e2e\auth-wall.spec.ts:475:7 › T-16 登录墙与凭据交互 › ⑦b 403 PASSWORD_UPGRADE_REQUIRED：由凭据单点置标志位并换到改密页（页面自己不管这一码） 
  111 passed (3.8m)
  111 passed (3.8m)
```
