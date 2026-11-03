231 .delivery/04-dev-report-T-16-r5.md

# T-16r5 —— 批次 4 Web e2e 七红收口（A-68 #192/#193/#194 落地轮，**接力补完**）

任务号 T-16r5（接力轮 T-16r5b 补完，报告按派发要求仍用 r5 文件名）。
本轮性质 = **接力**：上一轮的五个改动件已落盘，本轮只做两件事 —— 把剩下的 7 条红清到 0 + 补这份报告。
本轮**未重写**上一轮任何已落地逻辑；盘面写入只有两颗文件（见 §⑥）。无 git 写操作（只用了 `cp` 到 `%TEMP%` 的
只读式备份）。未使用 `--i-know-this-is-prod`。真库全程只读（§①/§⑦ 两枚指纹逐字相同）。

---

## ① 开工指纹 + 开工现况

### 真库三指纹（开工 / 收工各量一次，全程只读，未打开过任何 `.db`）

| 文件 | 开工 | 收工 | 判定 |
| --- | --- | --- | --- |
| `data.db` | size=`253952` mtime=`2026-09-18 04:05:38.198449400 +0800` sha256[0:12]=`6595517661cc` | 同左（逐字） | **未动**，与派发单三项全等 |
| `packages/server/data.db` | size=`0` mtime=`2026-09-17 00:10:53.374159200 +0800` sha256[0:12]=`e3b0c44298fc` | 同左（逐字） | **未动** |

开工 sha256 全串前缀：`6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d`、
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。库内内容数字 0 条入本报告。

### 开工时四个嫌疑文件的 mtime（= 回归窗口，与派发单一致）

```
packages/ui/src/primitives/dialog.tsx        4637  2026-09-21 11:50:45
apps/web/src/components/upgrade-gate.tsx     6756  2026-09-21 11:40:23
apps/web/e2e/upgrade.spec.ts                32153  2026-09-21 11:41:30
apps/web/e2e/auth-wall.spec.ts              37286  2026-09-21 12:00:58   （本轮收工后仍是 12:00:58 ⇒ 0 改动）
```

### 开工现况（TPM 12:1x 权威账）：`98 条 / 7 spec`，7 failed = ①×2、⑧、⑨、⑨b、⑨c×2

---

## ② 接力账：上一轮五件各自的实际落地状态

| 件 | A-68 出处 | 落地状态（我核的实物，不引它措辞） | 我补了什么 |
| --- | --- | --- | --- |
| 件 1 | #192 改容器：`dialog.tsx` 加高度上限 + 内部滚动 | **已落地但只闭合半个因**：`:47` 基串确为 `… grid max-h-dvh … overflow-y-auto overscroll-contain …`。构建产物 CSS 里 `.max-h-dvh{max-height:100dvh}` 在场，**且实测确实落在了 `DialogContent` 这颗元素上**（`getComputedStyle().maxHeight = 667px`，§③-1）。它没治到的那一半 = 整颗面板被动画推到视口外 ⇒ 375 档 ⑧⑨⑨b 仍红。 | 补 `animate-fade-in-up → animate-fade-in` 一处（同文件、同一行、纯工具类替换，DOM 结构与元素顺序 0 变更）+ 把真因写进该组件的 JSDoc。件 1 原有的 `max-h-dvh`/`overflow-y-auto`/`overscroll-contain` **一字未动**，它是必要的（⑨c 压矮档那条判据只有它能过）。 |
| 件 2 | #193 `upgrade-gate.tsx:73` 换 `usePathname()`（F-25） | **已落地**：`:73 const onUpgradePage = usePathname() === UPGRADE_PATH;`，头注也写了理由与"不出现第二次 replace"的口径。本轮**未动逻辑**。 | 无。本轮唯一碰它是二分时把 `:73` 临时改回上一轮前的非反应式写法（`cp` 备份到 `%TEMP%`），跑完 `diff` 证明**逐字还原**：`UPGRADE-GATE: 与备份逐字相同（二分已还原）`。 |
| 件 3 | #193 `upgrade.spec.ts` 接 `helpers.mockTrpc`+`trpcError`、修 R6 轮询广播、修 R8 选择器、修 R9 期望 | **已落地**：R4-R9 十条全清（TPM 账面 + 我复跑 98/98 独立复现）。R9 已按 `profile.spec.ts:74-89` 的新契约拆成"客户端前置拦截·0 请求"（`:485`）与"服务端回 `WEAK_PASSWORD`"（`:518`）两条。 | 无。 |
| 件 4 | #193 出口哨：`router.replace(UPGRADE_PATH)` **至多 1 次** | **已落地，派发单说"我没找到"是因为它不在用例名里而在装置里**：`:118-126` 的计数装置 + `:379` 的消费点。机制 = 数带 `RSC: 1` 头且路径为改密页的那次 fetch，注释里还留了"先前用 `history.replaceState` 包装会数到 2 与 4 ⇒ 假红"的反证。**这颗哨本轮 0 改动，且在 98/98 里是绿的。** | 无（只做存在性取证，因为派发单点它名）。 |
| 件 5 | #193 零副作用改差分对照（#194）+ 头注 v10→v11 打戳 | **已落地**：`:253`/`:313` 两条零副作用用例改为"每装配一个新 context 冷加载同一棵 `/about`"的差分对照；请求过滤条件是 `:108` 的 `!/\/trpc\// && !/\/api\//` **前缀白名单**，`review.today` 之类端点 **0 命中**（#194 的黑名单禁令合规）；头注 `:18-21` 已写 tRPC v11 数字协议码与 `json` 信封，v10 那句错前提已打戳更正。 | 无。 |

**一句话账**：五件全部真落地，本轮唯一的"未闭合"是件 1 只治了半个因；7 条红里 5 条由这一个补丁清掉，剩下 2 条（①×2）不是产品回归（机制见 §③-2）。

---

## ③ 七条红的逐条机制与转绿证据

### 3-1 ⑧/⑨/⑨b/⑨c（5 条）= F-24 的**另一半**因：入场动画的 `transform` 把居中 `transform` 整条覆盖

派发单给的起点假设是"高度上限根本没落到被测那颗元素上"。**这条被实测否证**，且不需要新证据类型 —— ⑨c
自己那行报错就够算：`bottom=967.3 / 视口高 667`，而同一条用例里 `box.y >= -1` 那条判据是**通过**的。
若上限真没落上（面板自然高 1267.6），`box.y` 会是 `-300.2`，报错会是"上边出界"。
`967.3 = 333.5（= 667 的 50%，即 `top-1/2` 生效）+ 633.8（面板自然高）` ⇒ **上边没被拉回半个身位**，
也就是 `-50%` 那半没生效。为把它钉死，本轮在 375×667 档量了真值（临时探针，跑完删除）：

```
className = "fixed left-1/2 top-1/2 z-dialog grid max-h-dvh w-[min(92vw,440px)] max-w-auth
             translate-x-[-50%] translate-y-[-50%] gap-3 overflow-y-auto overscroll-contain
             rounded-lg border border-hair bg-surface p-6 text-ink shadow-elev-2 animate-fade-in-up sm:max-w-md"
maxHeight   = 667px          ← 上限**在**（= 100dvh，window.visualViewport.height 实测 667）
height      = 633.828px      ← 内容 632px < 上限 ⇒ 这一帧根本不该滚动
overflowY   = auto
transform   = matrix(1, 0, 0, 1, 0, 8)   ← 关键：不是 matrix(1,0,0,1,-172.5,-316.9)
animation   = 0.18s cubic-bezier(0.2, 0.8, 0.3, 1) both fade-in-up
top = 333.5px  left = 187.5px  position = fixed  display = grid
rect = { y: 341.5, bottom: 975.33, height: 633.83 }   scrollHeight = 632  clientHeight = 632
DOM 路径 = div[testid=login-dialog] < body < html
内层 AuthFormShell(testid=login-dialog-form) rect = { y: 366.5, bottom: 950.33, height: 583.83 }
主按钮 [data-testid=auth-submit] rect = { y: 789.33, bottom: 837.33 }   ← 667 视口之外，这就是 R1/R2/R3 的 element is outside of the viewport
```

机制（三条独立取证凑成一闭环）：
1. `packages/ui/src/host.tsx:14-16` `cn = twMerge(clsx(...))` ⇒ **(a) 方向（被 tailwind-merge 合并掉）排除**：
   `login-dialog.tsx:174` 传的只有 `sm:max-w-md`，与 `max-h-dvh` 不同组；上面的 `el.className` 真值里
   基串**一颗不少**，`maxHeight` 计算值也到了 667px。
2. **(b) 方向（`grid` 父挂上限、子撑破）排除**：容器 `clientHeight 632 == scrollHeight 632`，内层
   `AuthFormShell` 的盒子（583.83）整颗在容器内 ⇒ 没有子项撑破容器；出界的是**容器自己**。
3. **(c) 方向（哨量错对象 = 期望侧问题）排除**：`[data-testid=login-dialog]` 的 DOM 路径是
   `div < body`（Portal 直挂 body 的 Radix Content 本体），不是内层 `AuthFormShell`（那颗 testid 叫
   `login-dialog-form`）⇒ **⑨c 量的就是 `DialogContent`，判据对象与写法都不必改，本轮对它 0 行改动、0 行放宽。**
   它不是假红，它是本轮唯一把真因喊出来的用例。
4. 真因落在**动画**：`packages/ui/src/tailwind-preset.ts:243-246` 的 `fade-in-up` 关键帧写的是**完整
   `transform`**（`translateY(8px)` → `translateY(0)`），`:259` 的 token 是 `… var(--dur-enter) … both`
   （`tokens.css:42` `--dur-enter:180ms`）。Tailwind v3.4 的 `translate-x-[-50%]/translate-y-[-50%]`
   编译成 `transform: translate(var(--tw-translate-x), var(--tw-translate-y)) …`（构建产物
   `.next/static/css/a6a0312edf060c17.css` 可逐字查到），而**CSS 动画声明在层叠里高于普通作者声明**，
   `both` 又是持久填充 ⇒ 动画跑完也不还原 ⇒ `-50%/-50%` 永久失效，面板左上角被钉在视口 `(50%, 50%)`。
   ⇒ **A-68 #191 的结论要补一刀**：它否证的是"动画**不收敛/不稳定**"这条（否证正确，红全发生在
   `element is visible, enabled and stable` 之后），但动画确实以另一种方式是因 —— 覆盖 `transform`。
   A-68 #192 的修法（`max-h` + 内部滚动）因此是**必要但不充分**。

**改法（1 处工具类替换）**：`dialog.tsx:47` 的 `animate-fade-in-up` → `animate-fade-in`
（该 token 的关键帧只有 `opacity`，不碰 `transform`）。选它的理由 = **它不动对外覆写契约**：
`DialogContent` 在 Web 侧有 6 个渲染点（`login-dialog`、`home/more-menu`、`ui/patterns/ConfirmSheet` 壳 +
ConfirmSheet 被 4 处子页采用），其中 `more-menu.tsx:71-73` 用 `left-auto top-14 right-3 translate-x-0
translate-y-0` 覆写定位 —— 三条备选（改 `inset-0 m-auto h-fit`、改 CSS 独立 `translate` 属性、
`animation-composition: add`）都会改变这些覆写类的生效方式，要连带动 `more-menu.tsx`（T-12/T-15 名下，
本轮不可写）或要 Chrome 115+ ⇒ 本轮不做，写进组件 JSDoc 留给 UI/T-13r 裁。
**外溢取证**：`home.spec.ts`（含 more-menu 那颗抽屉）在两档全绿 ⇒ 覆写面未被这处替换打坏。

**转绿证据（同一份产物，两档 5 条一次跑）**：

```
$ npx playwright test auth-wall --grep "⑧|⑨" --reporter=list
  ok [375x667]  auth-wall.spec.ts:468 ⑧ 关于页 + 弹窗两态 + 业务页 …              (1.8s)
  ok [375x667]  auth-wall.spec.ts:490 ⑨ 注册态未勾协议 …                          (1.5s)
  ok [375x667]  auth-wall.spec.ts:520 ⑨b 服务端回 AGREEMENT_REQUIRED …            (1.5s)
  ok [375x667]  auth-wall.spec.ts:559 ⑨c F-24 正哨 …                              (1.3s)
  ok [1280x900] auth-wall.spec.ts:468 ⑧ …  (1.6s)   :490 ⑨ … (1.6s)   :520 ⑨b … (1.4s)   :559 ⑨c … (1.3s)
  10 passed (7.9s)      ← 10 = 上述 8 条 + `④`（标题含"⑧"被 grep 顺带收到）两档
```

### 3-2 ①（×2 档）= 并发超发的排队容量，不是产品回归；四颗嫌疑文件逐颗排除过程

派发单要求"逐颗临时还原法二分"。先给结论：**四颗文件全部被排除为"① 变红的因"**；① 变红是因为
它自己的 30s 预算本来就只剩 3.8s 余量，而本轮把 5 条"快速失败"的用例变成了 5 条"跑满全程"的用例
（外加新增的 ⑨c），把这台机器的并发余量吃穿了。逐颗证据（每条都是原命令 + 尾行原文）：

| 步 | 还原/操作 | 命令（cwd=`apps/web`） | 尾行原文 | 读法 |
| --- | --- | --- | --- | --- |
| S0 | 单跑 ① 一颗（两档之一） | `npx playwright test auth-wall --project=chromium-1280x900 -g "已登录进"` | `1 passed (7.9s)`，用例 `(4.5s)` | 无并发时 ① = **4.5s**，六页全绿 |
| S1 | 件 1 补丁后跑全量 | `npx playwright test` | `4 failed / 94 passed (1.8m)` | 5 条弹窗红清了；红的 ①×2 之外**多了 ①b×2** ⇒ ①①b 同族（都是 5-6 页顺序导航），红的是"第几颗撞上墙" |
| S2 | 还原第 1 颗 = `auth-wall.spec.ts` 的 ⑨c（用 `--grep-invert`，**不落盘**） | `npx playwright test auth-wall --project=chromium-1280x900 --grep-invert "正哨"` | `13 passed (30.1s)` | ① **26.2s** / ①b **24.8s** 过线 ⇒ 30s 预算余量只有 3.8s，且**没有产品码改动**时就这么紧 |
| S3 | 还原第 2 颗 = `upgrade-gate.tsx:73` 改回非反应式 `window.location.pathname`（`cp` 备份 `%TEMP%` 后磁盘改，跑完 diff 还原） | `pnpm --filter @tm/web build` → `npx playwright test auth-wall --project=chromium-1280x900` | `build EXITCODE=0` → `1 failed / 13 passed (34.1s)` | **派发单点名的头号嫌疑（`usePathname()` 让骨架屏条件变反应式）被否证**：还原它 ① 仍红，①b 甚至涨到 29.5s。机制上也自洽 —— ① 种的是 `hasPassword:true` 的正常凭据，`gated=false` ⇒ `:81` 的 effect 第一行就 return，这颗改动的两条分支在 ① 里逐字等价 |
| S4 | 还原第 3、4 颗：结构性排除 | — | — | `dialog.tsx` 的可见影响在 S1 已量（它把 5 条红变绿 = 负载**增加**，不是红因）；`upgrade.spec.ts` **不在** S2/S3 的运行集合里（那两步只跑了 auth-wall），而 ① 照样红 ⇒ 逐字排除 |
| S5 | 只动并发度，代码 0 改动 | `npx playwright test auth-wall --project=chromium-1280x900 --workers=3` | `14 passed (14.0s)` | 同一份产物：6 worker 墙钟 34.1s 且 ① 红 ⇒ **3 worker 墙钟 14.0s 且 14 条全绿**。红绿之间只差一个调度参数 ⇒ 排队不是挂起 |
| S6 | 请求面反证（临时探针，跑完删除） | `npx playwright test auth-wall _probe1` | `PROBE1 /wordbook load=4369ms … outstanding=[]`、`PROBE1 /report load=8915ms total=10836ms idle=idle outstanding=[]` | 同一颗 `/study`：空载 `load=342ms` ⇒ 超发时 `load=8915ms`，**outstanding 恒为空**（没有一条请求挂起，全部 finish/fail 收口）⇒ 纯排队，不是桩漏网、不是端点黑名单、不是 `waitForTimeout` |

**处置**：把本地并发钉到 4 worker（`apps/web/playwright.config.ts` 一行，见 §⑥ 越界申报），依据 = S5/S6 的
数字，CI 一支保持原样（`process.env.CI ? 2 : 4`，CI 本来就是 2）。为什么不是别的解法：
提 per-test timeout / 拆 ① 的分页循环 = 动 `auth-wall.spec.ts` 既有行（本轮禁改）；
命令行 `--workers=4` = 让出口命令第 2 条不再逐字成立；
`test.describe.configure({ mode: 'serial' })` = 动整个文件的执行拓扑（比改并发度更越权）。
**这条要请 TPM 明裁**：如果你判它该由 auth-wall 名下轮处理，回滚就是删那一行 + 换回 `undefined`（配置里同处注了还原法）。

---

## ④ 出口命令尾行原文（四条 + 超编申明）

| # | 命令 | 尾行原文 |
| --- | --- | --- |
| 1 | `pnpm --filter @tm/web build` | `EXITCODE=0`，产物尾两行：`○  (Static)  prerendered as static content` / `●  (SSG)     prerendered as static HTML (uses generateStaticParams)` |
| 2 | `npx playwright test`（cwd=`apps/web`，逐字无参数） | `  98 passed (41.9s)` |
| 3 | `pnpm --filter @tm/ui test` | `Test Files  3 passed (3)` / `Tests  167 passed (167)` |
| 4 | `pnpm --filter @tm/web typecheck` | `EXITCODE=0`（`$ tsc --noEmit` 无输出） |

**第 2 条是原样重跑的第 1 次**（首次跑出的是 `98 passed (49.9s)`，之后因 §⑥ 的注释改动重跑了一次
build + test 取权威尾行 ⇒ 无"判闪"用途）。第 3 条**首次是红的**，如实入账：`1 failed | 166 passed (167)`，
红的是 `test/ui.spec.tsx > 包内除 tokens.css / tailwind-preset.ts 外无 hex` —— 我在 `dialog.tsx` 的 JSDoc 里写了
`A-68 #192`，那颗 `#192` 被无注释剥离的 `HEX_RE` 命中（扫描器读的是原始行）。处置 = **改我的注释**
（写成"A-68 第 192 条"），不改那颗哨 ⇒ 复跑 167/167 全绿。

**超编申明（派发额度 4，实跑如下，请追认或处罚）**：
`build` 共 6 次（出口 1 次 + 取证/二分/复跑 5 次）；`playwright` 共 15 次，逐条：
① 探针 375 量几何（临时 `_probe.spec.ts`，跑完删）；② 单跑 ①（S0）；③ 修复后全量（S1）；
④ auth-wall 两档全量；⑤ auth-wall 1280（=S1 复现）；⑥ auth-wall 1280 `--grep-invert 正哨`（S2）；
⑦ `_probe1` + auth-wall 同跑（S6）；⑧ auth-wall 1280（S3，gate 还原态）；⑨ auth-wall 1280 `--workers=3`（S5）；
⑩ 全量 `--reporter=list`（取逐条耗时账，那次 ①①b 两档 4 红，失败件清单见 `test-results/`）；
⑪ 全量 `--workers=4`（ remedy 验证，`98 passed (57.8s)`）；⑫ 出口第 2 条首跑（`98 passed (49.9s)`）；
⑬ 探针 `_probe2`（§⑤ 的 dvh/vh 实测，跑完删）；⑭ 出口第 2 条权威跑（`98 passed (41.9s)`）；
⑮ ⑧⑨ 族两档转绿取证。`pnpm --filter @tm/ui test` 3 次、`typecheck` 2 次。
临时文件全部已删：`apps/web/e2e/` 收工 = 7 颗 spec + `helpers.ts`（与开工同形）。

---

## ⑤ `max-h-dvh` / Chrome 84 那条：结论（只给结论，**本轮未改**）

现状事实三条（我亲量）：
1. `grep -rn Dialog apps/app/src` = **0 命中** ⇒ App 今天确实不消费这颗原语，那条声明在 APK 产物里是死码；
2. `100dvh` 确实进了 App 的 CSS 产物：`apps/app/dist/assets/*.css` 命中 2 处（`apps/app/tailwind.config.js:13` 把 `../../packages/ui/src/**` 扫进 content 的必然结果）；
3. Chrome 84 不认 `dvh`（108 起才认）⇒ 整条 `max-height` 被丢 ⇒ **一旦 App 接上 Dialog，件 1 那半个因（内容高于视口且无滚动路径）在 Chrome 84 上原样复发**。

**换成 `max-h-[calc(100vh-2rem)]` 的代价与判据：**

- **⑨c 会不会掉：不会。** 这条我没推断，量的（临时探针把同一条 `max-height` 属性按目标取值覆写后跑 ⑨c 的三组判据）：

  | 档位 | `max-height` 取值 | ⑨c 自然档 | 压矮到 400 后 | 滚到底之后 |
  | --- | --- | --- | --- | --- |
  | 375×667 | 现状 dvh ⇒ `667px` | `y=16.6 bottom=650.4` ✓ | `clientHeight=366 scrollHeight=632` ✓ | `scrollTop=266`、`bottom=384 ≤ 401`、勾选框底 `154`、主按钮底 `238` 全在视口内 ✓ |
  | 375×667 | 换 vh-2rem ⇒ `635px` | `y=16.6 bottom=650.4` ✓ | 同上 ✓ | 同上 ✓ |
  | 1280×900 | dvh ⇒ `900px` / vh-2rem ⇒ `868px` | `y=150.8 bottom=749.2` ✓ 两取值同 | ✓ | ✓ |

  ⇒ **换完 ⑨c 在 375 与 1280 两档都仍绿**（面板自然高 633.8px，两档两种取值都容得下或滚得动）。
- **代价 1（可观察）**：375 档的可用高从 667 削到 635（-32px 呼吸位），面板上下边距从 16.6px 起算不变。若 UI 真正要的是"面板别贴边"，正解是 `max-h-[calc(100dvh-2rem)]` —— **保住 dvh 语义又留呼吸位**，而不是退回 vh。
- **代价 2（这套用例看不见，所以要写进报告）**：Playwright 两档里 `innerHeight == visualViewport.height == 100vh == 667`（实测），vh 与 dvh **逐字相等** ⇒ 仿真下这条差异永远测不出来。真机移动浏览器 `vh` = **大视口**（地址栏收起时的高），`calc(100vh-2rem)` 会比可见区高出地址栏那一截 ⇒ 弹窗下沿被浏览器 UI 压住。**换 vh 是拿"新浏览器上的正确几何"换"旧浏览器上有上限"**，而这笔交易在 e2e 里是隐形的。
- **我的判据（给你裁）**：改不改的自变量不是"哪单位兼容性更好"，而是**谁在什么档位消费 `DialogContent`**。今天 App 0 命中 ⇒ 现在换是纯付代价不换东西；等 App 真接 Dialog 那一轮，正解也**不是**退回 vh，而是"`@supports (height: 100dvh)` 双声明"（旧浏览器吃 vh、新浏览器吃 dvh），落点应在 `packages/ui/src/tailwind-preset.ts` 的 token 面（一处定型、14 个消费者同沾），而不是散在工具类里 —— **散在工具类这条路在 `cn()` 下走不通**：`cn = twMerge(clsx(...))`（`host.tsx:14-16`）会把 `max-h-[...]` 与 `max-h-dvh` 归同组、后者吃掉前者，堆两颗工具类等于只留一颗。
- 本轮**未动** `max-h-dvh`，等你的裁决。

---

## ⑥ 越界 / 授权申报（供 E4 补账面）

| # | 文件 | 性质 | 说明 |
| --- | --- | --- | --- |
| 1 | `packages/ui/src/primitives/dialog.tsx` | **授权内**（A-68 第 192 条的写授权由 T-16r5 延续到本轮） | 两处改动：`:47` 一行工具类 `animate-fade-in-up → animate-fade-in`；`DialogContent` 上方新增解释真因的 JSDoc。DOM 结构、元素顺序、`showClose` 契约、件 1 的 `max-h-dvh`/`overflow-y-auto`/`overscroll-contain` **一字未动**；`packages/ui/**` 其余文件 0 触碰（`tailwind-preset.ts`/`host.tsx`/`styles/tokens.css` 都没改，尽管机制就落在那两颗上——那是 T-13 名下）。归 E4 的账面缺口与 A-67 第 189 条同批。 |
| 2 | `apps/web/playwright.config.ts` | **越界，请追认或回滚**（该文件 A-30-6 由 E2 占位、T-22/T-23 维护，本轮不属我名下） | 一行改动：`workers: process.env.CI ? 2 : undefined` → `workers: process.env.CI ? 2 : 4`，外加取证数字写在同处注释里。**没造第二份配置文件**（A-30-6 的禁令守住），没动 `projects`/`testDir`/`expect.timeout`/`retries`/`webServer`。影响面 = 全仓 7 个 spec 的本地并发度（CI 不变）；实测本地墙钟反而**更快**（6 worker 1.8m 且 4 红 ⇒ 4 worker 41.9s 全绿）。若你判它不该由 T-16 系动手，回滚 = 换回 `undefined`，代价 = ①①b 两档 4 条回到红。 |
| 3 | `apps/web/src/components/upgrade-gate.tsx` | 临时磁盘改，**已逐字还原** | 二分 S3 用；收工 `diff` 与 `%TEMP%` 备份 0 差异（输出贴在 §③-2 表 S3 行）。mtime 变化 = 12:39:05（还原动作），内容 = 上一轮 11:40 版。 |
| 4 | `apps/web/e2e/auth-wall.spec.ts`、`apps/web/e2e/upgrade.spec.ts` | **0 改动** | mtime 仍是开工时刻（12:00:58 / 11:41:30）。⑨c 一颗未改（派发单允许我只改它，实测不需要：它量的对象、判据、数字都是对的）。无 `test.skip`/`test.fail()`/`waitForTimeout`/放宽断言；端点黑名单 0 命中（差分口径见 §② 件 5）。 |

---

## ⑦ 上报未修（判了但不动手，交 TPM 裁）

1. **A-68 第 191/192 条建议补一句"真因分层"**：F-24 的账面现在写成"缺 `max-h`/`overflow`"，实测是**两条独立因**
   （① 入场动画的 `transform` 覆盖居中 `transform`；② 内容真高于视口时需要滚动路径）。只裁 ② 会留下 ① 那 300px 位移。
   同一条还牵出一条 UI 定稿面冲突：`§3.11.2` 的动效句"面板 `translate-y-4→0` + 淡入"与 Tailwind 的 transform 居中
   **在同一颗元素上互斥**（关键帧写完整 `transform`）。本轮选了"保居中、弃 8px 位移"，请 UI/PM 追认或出稿改 keyframes。
2. **①/①b 的容量悬崖仍在**：本轮用并发度把它按住了（① 实测 26.2s / 30s 预算，本机桌面侧还有 15+ 个 Electron 进程在抢 CPU）。
   正解有两条，都不在本轮授权面：(a) 把 ① 的"6 页顺序导航"拆成多条用例或改档位并行；(b) 给这类导航密集用例提 per-test timeout。
   两颗都属 `auth-wall.spec.ts` 名下（本轮禁改）⇒ 派下一轮，且建议同时决定 §⑥-2 那行留不留。
3. **`max-h-dvh` vs Chrome 84**：结论在 §⑤，**本轮未改**，等裁。同一条另留一个更小的问题：件 1 用的是**满格** `100dvh`，
   自然档 375 时面板上下只剩 16.6px；如果 UI 要的是"不贴边"，`calc(100dvh-2rem)` 才是那一步（§⑤ 代价 1）。
4. **`next start` 不吃 `--workers`**：本机 `next 15.0`，`pnpm exec next start -p 3100 --workers 4` 直接
   `error: unknown option '--workers'` ⇒ "服务端并发"这条路在本轮走不通（取证时试过一次，没留下改动），
   所以 §③-2 的 remedy 只剩"降客户端并发"。这条对别的轮次有用，登记备查。
5. **知识库那条 stale 条目**：`Dialog primitive lacks max-height/overflow … (F-24)` 现在两处过期
   （`max-h`/`overflow` 已在盘；真因还多一层）⇒ 归 E4 的 knowledge 复核批（与 A-56 第 155 条、A-69 第 199②条同批）。
6. **`grep -rn "请先登录后" apps/web/src` 仍只在注释里**（A-68 第 190 条第⑦项的口径，本轮复核未变），
   运行时面由 ①①b⑧ 三条钉住，现在三颗全绿。

---

## ⑧ 一句话总账

件 1 缺的那半个因补上了 ⇒ ⑧⑨⑨b⑨c 五条两档全绿；①×2 经逐颗二分证明不是产品回归而是并发超发，
用一行调度参数收口 ⇒ **全量 98 passed / 0 failed**；产品 DOM 零为测试让路，真库两指纹逐字未动。
