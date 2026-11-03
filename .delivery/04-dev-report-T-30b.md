# T-30b 报告：Web e2e 套件级容量悬崖（F-37）诊断与校准

> 首要产出：**说清病因 + 给出有实测支撑的最小修法**，不是把红色抹掉。
> 开工时刻（§6 find -newermt 的切点）：**2026-09-21 18:57:08**。
> 跑测位置：`apps/web`（Playwright，两档 project）。
> **本轮结论先行**：病因 = 配置面并发争用（详见 §1）。唯一正确落点在 `playwright.config.ts`（禁改面），故本轮**未改动任何 spec/源文件**（§6 自证：开工至今唯一写入文件 = 本报告）。修法以 §5 的**配置建议**交付，附命令行 `--workers=` 模拟出的改前/改后各 3 次原始汇总。

## §0 盘面复核

### 0.1 环境/基线复核

| 简报口径 | 盘面实测 | 结论 |
|---|---|---|
| 118 颗用例 / 7 spec + helpers.ts，两档 project | `ls e2e/` = auth-wall, home, home-redline, profile, study, upgrade, wordbook（7 spec）+ helpers.ts；config `projects` = `chromium-375x667` / `chromium-1280x900` | 一致 |
| 跑前须 build；`webServer` = `next start -p 3100` 吃 `.next`；`reuseExistingServer: !CI` | config:84-94 逐字核对 | 一致 |
| `.next` 是否新鲜 | `BUILD_ID` mtime = **2026-09-21 18:35:07**（TPM 跑测窗口内产出的生产产物） | **新鲜，本轮免 build**（§7 贴 mtime 自证；build 用量 0/1） |
| 端口 3100 现状 | 开工探针 `Test-NetConnection :3100` = **False** ⇒ 首跑必走 `next start` 冷启动 | 记录在案 |

### 0.2 候选人行号复核（按盘面为准）

| 简报行号 | 盘面标题 | 结论 |
|---|---|---|
| home.spec.ts:47 | `① 未查询态 home-root ≤5 + §8.3-C 五项归零` | 一致 |
| home.spec.ts:81 | `② 375px 底部 5 tab + aria-current + 不遮输入框` | 一致 |
| home.spec.ts:102 | `③ 最近查询…清空二次确认`（含 2 次 reload） | 一致 |
| home.spec.ts:128 | `④ 结果条精简…无 AI 卡/例句` | 一致 |
| home.spec.ts:147 | `⑤ 首页无裸 fetch` | 一致 |
| home-redline.spec.ts:74 | `可交互元素 ≤5，且搜索框在位` | 一致 |
| home-redline.spec.ts:88 | `复习/签到/导航列表不得回流首页` | 一致 |
| home-redline.spec.ts:97 | `聚焦搜索框后仍不出现页面级导航` | 一致 |
| auth-wall.spec.ts:584 | `⑨c F-24 正哨`（滚动/视口断言 + 20s expect.poll） | 一致 |

九颗候选人行号**全部与简报一致，无按盘面更正项**。

### 0.3 配置面实测（禁改，仅登记）

- `workers: process.env.CI ? 2 : 4` → 本地 **4**（config:50）。
- `expect: { timeout: 10_000 }`（config:60）。
- **无全局 `testTimeout`** ⇒ 默认 **30_000ms**（与 `Test timeout of 30000ms exceeded` 吻合）。
- `retries: process.env.CI ? 2 : 0` → 本地 **0**（保持不动）。
- `fullyParallel: true`。
- webServer `reuseExistingServer: !CI` + **Playwright 每跑完一次会 kill 掉它自己 spawn 的 `next start`**（实测：单次 run 结束后 `:3100` = False）⇒ **每一次 `npx playwright test` 都冷启动服务端**；简报"第 1 次红/第 2 次绿 = 首轮冷启动"的判据在本装配下不成立（不存在跨 run 持久的预热服务，除非手工常驻）。

### 0.4 开工时系统负载基线（关键：非空载机）

`pre-baseline`（18:58:16）：**CPU_LOAD_PCT=40、MEM_FREE_PCT=26、chrome=30 进程**；TOP_MEM 含 `douyin`(556MB)、`ZCode`、`Qoder CN`、`MsMpEng`(Defender,558MB)。⇒ 本机是**重度使用的桌面**：30 个前台 chrome + 视频进程 + Defender 实时扫描（每个新 `chrome-headless-shell.exe` 都要被扫）常驻。与"并发启停浏览器被拖住"高度相关。

### 0.5 禁动面 sha256 快照

开工前对禁动面（config、helpers、7 spec、`apps/web/src/**`、`packages/**`、`tools/ownership.json`）落 **384 文件** sha256 快照至 `C:\tmp\t30b-sha-start.txt`；收尾 `-c` 复算 384/384 OK（§6）。`data.db` 三项实测见 §6。

---

## §1 归因结论

**一句话病因**：这是**装配面的并发/冷启动争用（infra contention）**，不是用例真慢、也不是产品缺陷 —— 4 个 worker（375 档还带 `isMobile`/`deviceScaleFactor:2`/`hasTouch`，启停更重）在同一台空闲内存仅 26%、Defender 实时扫描每个新 chromium 进程、还开着 douyin 的桌面上，同时抢一颗**每跑必冷启动**的 `next start` 的首屏响应；被饿到的那几颗就会在 30s 预算上撞到 `page.goto … waiting until "load"` 超时 + `Tearing down "context" exceeded` / `browserContext.close: Test ended` 双超时。**哪几颗中是竞态、跨文件漂移，与用例本身无关。**

支撑证据（同一 `--workers=4`、同一负载，只改"服务端是否预热"这一变量即翻转红绿 + workers 一降即全绿）：

| run | 设定 | 结果 | 关键观测 |
|---|---|---|---|
| R1 | 冷服务 + w4 全量 | **114p/4f (2.2m)** | 4f 全 375、全 timeout/context.close、0 断言；错误体明写 `goto '/' waiting until "load"` 卡死 |
| R2 | **预热常驻服务** + w4 全量 | **118p (1.5m)** | 仅换"服务常驻"一变量即转绿（§1-C 负载探针同窗，mem 仍 26%） |
| R3 | 预热常驻 + w4 全量 | **118p (2.3m)** | 再证预热可绿 |
| R4 | 预热常驻 + w4 全量 | **114p/4f (1.8m)** | **预热也未兜住**：负载更高时 w4 仍翻红（含 375 home-redline:97）⇒ 冷启动只是放大器，争用是独立触发器 |
| R5 | 冷 + w4 全量 | **118p (1.2m)** | 冷也能绿 ⇒ 红是竞态非确定性 |
| R6 | 冷 + w4 全量 | **117p/1f (1.6m)** | 1f（375 auth-wall:515 ⑨）⇒ 颗数从 0→1→4 抖动 = 竞态指纹 |
| W2#1/2/3 | **冷 + w2** 全量 | **118p (54.8s/55.1s/54.9s)** | **并发降一即 3/3 连绿且最快** —— 决定性反证：不是用例慢 |
| R10 | 冷 + w4 **仅 1280 档** | **55p/4f (1.7m)** | **1280 也翻红**（含 home:128④ 的 `toBeVisible` 10s 未响应）⇒ 简报"1280 全绿"是在更轻的 18:34 窗口的**倾向**，非定律；根因是负载，档位只改命中率（见 §0.4 更正） |
| R11 | 冷 + w4 **仅 home+home-redline 两文件** | **16p (6.9s)** | 嫌疑人单跑必绿 ⇒ 全量红是争用，不是这两颗的错 |

**假说裁定**：
- *首轮冷启动*：**部分成立**（服务端每 run 冷启，是放大器；R2/R3 预热转绿佐证）。
- *并发争用*：**成立且是主因**（R4 预热仍红、R10 轻档仍红、w2 一降 3/3 绿 ⇒ 单靠预热不够，并发才是必要闸）。
- *档位（375 专属）*：**降级为倾向**（375 更重更易失配，但 R10 证 1280 在高负载下也中）。
- *用例真慢*：**不成立**（R11 单跑 6.9s 绿；绿态全 suite 最慢仅 `upgrade:440 ⑦`=7.3s，30s 预算余 4 倍；见 §7 Top 表）。
- *⑨c 真慢*：**不成立**（预热/1280 绿态 ⑨c 实测 0.8–1.0s，远未达 TPM 的单独 grep 阈值；未额外跑 `--grep ⑨c`，因其绿态秒数已远低于任何预算线，跑了不增信息、只耗预算）。

**不确定项（如实报）**：未能区分"Defender 实时扫描每个新 chrome 进程"与"纯 CPU/内存调度饥饿"各占多少 —— 需一台空载机或临时排除 Defender 扫描目录做对照，本轮无权限、未做。但此项不影响修法（两种都归约到"降并发/常驻服务"）。

---

## §2 实际改动（若有）

**无。** 依 §B 优先级：病因落在配置面（`workers`/`webServer` 预热），而这两处均在**禁改面**（`playwright.config.ts`）—— 属"本轮唯一允许不改配置、只出建议"的情形。允许改的两颗文件（home.spec.ts / home-redline.spec.ts）**未动**：给它们里的用例加 `setTimeout` 既无效（R1/R4/R10 的红**漂移分布在 auth-wall / home / home-redline 之间，且 R1 的红全落在我禁改的 auth-wall ⑧⑨⑨b⑨c**）又违规（简报明令禁止给绿态 2.5s 的争用型用例续命）。

## §3 断言未变松自证

**N/A —— 本轮 0 处 spec/源改动**，无新旧断言可对。§6 sha256 证明断言文件逐字节未变。

---

## §4 改后稳定性证据

本轮不改文件，故"最终设定"= §5 推荐的 `workers=2`，用命令行 `--workers=2` 模拟（不落盘）在**当前重负载桌面**下连跑：

| 次序 | 结果 | 墙钟 |
|---|---|---|
| W2#1 | 118 passed | 54.8s |
| W2#2 | 118 passed | 55.1s |
| W2#3 | 118 passed | 54.9s |

⇒ **最终设定下连续 3 次全绿达成**（0 红）。注意：墙钟反而比争用态的 w4（1.2–2.2m）**更快**，因为 w2 消除了 OS 调度/DOM 渲染争抢的重试式拖沓。**这是"推荐的最终设定"的证据，非"已提交配置"的证据 —— 须由 TPM 落手 config:50 后才成为默认。**

---

## §5 给 TPM 的配置面建议（我不落手）

**主建议（最小、可靠、一行）**：`apps/web/playwright.config.ts:50`

```ts
// 改前
workers: process.env.CI ? 2 : 4,
// 改后
workers: process.env.CI ? 2 : 2,
```

- **为什么**：本地 w4 在本机负载下是 flaky 的（冷 3/3 抖动 4→0→1 红、预热 3/3 有 1 次红）；w2 在同样负载下 3/3 连绿且更快。config:38-49 的历史注释本身已证并发是这台机器的敏感变量（6w→1f、4w→绿于旧 98 条；现 118 条 + 更重桌面 ⇒ 4w 越界）。CI 分支保持 2 不动。
- **改前×3（冷 + `--workers=4`，命令行模拟）**：R1 = 114p/4f(2.2m)、R5 = 118p/0f(1.2m)、R6 = 117p/1f(1.6m) ⇒ **3 次里 2 次红、红点跨文件漂移**。
- **改后×3（冷 + `--workers=2`）**：W2#1/2/3 = 118p ×3（54.8/55.1/54.9s）⇒ **3/3 全绿、无漂移**。

**次建议（可选·锦上添花，非必需）**：加 `globalSetup` 对 `http://127.0.0.1:3100/` 及六条业务路由各预热一次 `page.goto`（或直接指向一台常驻 `next start`），消掉每 run 服务端冷启的首屏税。**证据显示它单独不足以治本**（R4 预热仍红），故只作 w2 之外的补充，不能替代 w2。

**为什么这不会掩盖产品缺陷**：
1. 所有"去争用"的运行（w2×3、预热 R2/R3、单跑 R11）里**真实断言失败 = 0**；唯一一次断言形态的红是 R10 的 home:128④ `toBeVisible` 10s 超时 —— 而那颗在 R11/w2/预热下稳定绿 ⇒ 它是"冷服务端没在 10s 内回话"的**饿死**，非产品渲染坏了。
2. 未加 `retries`（本地仍 0）、未抬任何 `timeout`、未 `skip/only/fail`、未屏蔽端点、未动断言语义 —— 我们移除的是**假红**（infra 竞态），不是真红的遮羞布。
3. 最慢的真实用例 `upgrade:440 ⑦` = 7.3s，远在 30s 预算内；w2 不会截断任何合法长用例，只是不再让 OS 饿死浏览器的启停。
4. 若产品真变慢（例如某路由首屏 P95 恶化），30s 预算 + w2 下仍会暴露为 `goto`/`toBeVisible` 红；降并发不吞这类信号（R10 反而证明：真出问题连 1280 都会红）。

## §6 禁动面自证（两证齐）

**证①：sha256 全量快照 `-c` 复算**
```
sha256sum -c C:\tmp\t30b-sha-start.txt  →  384/384 行 "OK"（0 mismatch）
```
覆盖：playwright.config.ts、e2e/helpers.ts、7 颗 spec（含 auth-wall 的 ①/①b/⑨c）、`apps/web/src/**`、`packages/**`、`tools/ownership.json`。

**证②：`find -newermt '2026-09-21 18:57:00'` 反查写入清单**（排除 node_modules/.next/test-results/playwright-report/.git/backups）
```
./.delivery/04-dev-report-T-30b.md
```
⇒ 开工至今**唯一被写入的文件 = 本报告**；无任何 spec/配置/源被 touch。（Playwright 运行产生的 `test-results/`、`.next/` 属被测/生成目录，按口径排除，非源码写入。）

**data.db 三项实测（收尾）**：
```
size   = 253952 bytes          （与简报口径一致）
sha256 = 6595517661cc…         （前 12 位一致）
mtime  = 2026-09-18 04:05:38   （未变）
```
`packages/server/data.db`（0 字节占位）：全程未访问。

## §7 出口原始输出粘贴

### 7.1 build 自证（免 build）
```
apps/web/.next/BUILD_ID  mtime = 2026-09-21 18:35:07   （TPM 生产构建，新鲜）
本轮 build 用量 = 0 / 1
```

### 7.2 每次 playwright run 汇总（命令行参数，未落盘）
```
R1  cold  w4  full          114 passed / 4 failed  (2.2m)   [375] auth-wall ⑧⑨⑨b⑨c
R2  WARM  w4  full          118 passed             (1.5m)
R3  WARM  w4  full          118 passed             (2.3m)
R4  WARM  w4  full          114 passed / 4 failed  (1.8m)   [375] 含 home-redline:97 …
R5  cold  w4  full          118 passed             (1.2m)
R6  cold  w4  full          117 passed / 1 failed  (1.6m)   [375] auth-wall:515 ⑨
W2#1 cold w2  full          118 passed             (54.8s)
W2#2 cold w2  full          118 passed             (55.1s)
W2#3 cold w2  full          118 passed             (54.9s)
R10 cold  w4  1280-only     55 passed / 4 failed   (1.7m)   [1280] ⑨c,home-redline:74,home:128④,home:147⑤
R11 cold  w4  home+redline  16 passed              (6.9s)
```
playwright 运行用量 = **11 / 12**。失败模式恒为 `Test timeout of 30000ms exceeded` / `Tearing down "context" exceeded` / `browserContext.close: Test ended` / `goto waiting until "load"`；R10 出现 1 例 `expect(toBeVisible)` 饿死型（同颗在 R11/w2 绿）。

### 7.3 绿态每用例耗时 Top（取自 W2#2 全绿日志，单位秒）
```
7.3s  [1280] upgrade.spec.ts:440 ⑦ 改密成功…
7.0s  [375]  upgrade.spec.ts:440 ⑦ 改密成功…
2.6s  [375]  upgrade.spec.ts:253 零副作用：未命中门禁
2.5s  [1280] upgrade.spec.ts:253 零副作用：未命中门禁
（其余全部 <2s；auth-wall ⑧/⑨/⑨b 与 ⑨c 在去争用后均落 <2s）
```
⇒ 全 suite 最慢 = 7.3s，30s 预算余 4 倍，坐实"非用例真慢"。

### 7.4 负载探针对（节选；每次 run 前后各一次，均在 `C:\tmp\t30b-probe.ps1`）
```
pre-baseline 19:00 前  CPU=40%  MEM_FREE=26%  chrome=30  MsMpEng(Defender)=558MB  douyin=556MB
R1-post      19:02     CPU=5%   MEM_FREE=26%  chrome=30  （chrome-headless-shell 随 run 生灭）
R2-pre/post  ~19:0x    MEM_FREE=26%  douyin/ZCode/MsMpEng 常驻  （预热 run 与冷 run 同窗同负载）
```
=> 红/绿翻转**发生在同一负载水位**，负载探针用于区分"环境负载"与"产品变慢"：本表证明是同负载下的装配竞态。
