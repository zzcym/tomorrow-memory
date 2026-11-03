230 .delivery/04-dev-report-T-13-r.md  (wc -l, 首行 = 本文件收工终值的原样输出)

# 04-dev-report-T-13-r — T-13r：对话框入场动效与 transform 居中正交化

任务号 T-13r。只动两颗文件：`packages/ui/src/tailwind-preset.ts`、`packages/ui/src/primitives/dialog.tsx`。
目标：让 §3.11.2「面板上移 8px 淡入」与 Tailwind `translate-x/y-[-50%]` 居中不再互斥，而是把居中量直接写进对话框专用关键帧的两个端点。

## ① 开工指纹

真库只读三指纹（`python -c` 读字节算 sha256 前 12 位，全程未打开/写入任何 `.db`，未跑 DDL/DML）：

```json
{
  "data.db": {
    "bytes": 253952,
    "sha12": "6595517661cc",
    "mtime": "2026-09-18 04:05:38"
  },
  "packages/server/data.db": {
    "bytes": 0,
    "sha12": "e3b0c44298fc",
    "mtime": "2026-09-17 00:10:53"
  }
}
```

与 TPM 给定基线逐字相同（`data.db` = 253952 / 6595517661cc / 2026-09-18 04:05:38；`packages/server/data.db` = 0 / e3b0c44298fc）。

**收工复测（五条出口与取证全部跑完后，同一命令同一法）**：两份 JSON 全文与开工块 **diff 零差异**——
`data.db` = 253952 / 6595517661cc / 2026-09-18 04:05:38，`packages/server/data.db` = 0 / e3b0c44298fc / 2026-09-17 00:10:53，逐字相同，无漂移。

取证脚本（原文，两次同法）：

```
python -c "import hashlib, os, datetime, json; ... 读 data.db / packages/server/data.db 全量字节, sha256().hexdigest()[:12], fromtimestamp(st_mtime)"
```

开工时 `apps/web/e2e/` 形态：7 颗 spec（auth-wall / home-redline / home / profile / study / upgrade / wordbook）+ `helpers.ts`。

## ② 改动清单 + 行号

只动两颗文件（与授权清单一致，越界 0）：

1. `packages/ui/src/tailwind-preset.ts`
   - `:251-267`（新增）：`keyframes` 块内 `fade-in` 之后新增 `'dialog-in'` 关键帧（`:264-267`）+ 13 行决策注释（`:251-263`）。两个端点：
     `0% = opacity:0 + transform: translate(var(--tw-translate-x), calc(var(--tw-translate-y) + 8px))`，
     `100% = opacity:1 + transform: translate(var(--tw-translate-x), var(--tw-translate-y))`。
   - `:278`（新增一行）：`animation` 块内 `'dialog-in': 'dialog-in var(--dur-enter) var(--ease-standard) both'`
     （时长/缓动沿用现成 token，`fill-mode` 保持 `both`，与 `fade-in-up` 同参）。
   - 硬约束 A：`fade-in-up` 关键帧本体（现仍逐字在 `:243-246`：`'0%': { opacity: '0', transform: 'translateY(8px)' }` /
     `'100%': { opacity: '1', transform: 'translateY(0)' }`）与 `sheet-in`（`:279`）**一字未改**；
     其 4 处别处消费者（`LookupScreen.tsx:332`、`report/page.tsx:193`、`word-lookup.tsx:61`、`AuthFormShell.tsx:550`）零触达。
     注：`packages/ui/` 整树在 git 里是未跟踪态（`??`），无 diff 基线可贴，故以"行号 + 原文逐字"实证。
   - 硬约束 B：新关键帧只含 `translate()` + `calc()` + `var()` 与百分比/长度组合，无 dvh/svh/lvh、无嵌套 min()/clamp()（产物 CSS 见 §③-2）。

2. `packages/ui/src/primitives/dialog.tsx`
   - `:74`（原 `:68`，因 JSDoc 增行而下移）：`animate-fade-in` → `animate-dialog-in`。className 其余 token 逐字未动
     （`fixed left-1/2 top-1/2 z-dialog grid max-h-dvh … overflow-y-auto overscroll-contain … shadow-elev-2`），
     DOM 结构、元素顺序、`showClose`/`closeLabel` 契约零改动，未加任何 `data-testid`。
   - `:25-52`（原 `:25-46`）：F-24 JSDoc 更正为「两条独立因 + T-13r 正交化现状」，删掉了上一轮已过期的
     「解药 = 换成 fade-in、弃位移」表述；引用裁决条目按哨兵要求写成「A-68 第 192 条」（无井号形态）。
   - 遮罩 `DialogOverlay`（`:19`）的 `animate-fade-in` 保持不变（它不吃 transform 居中，无冲突）。

## ③ 机制与取证

### ③-1 关键设计偏离申报（属 TPM 授权面「关键帧写法」，但必须先讲清理由）

TPM 给的形如（`形如：`）是端点写死 `translate(-50%, calc(-50% + 8px))` / `translate(-50%, -50%)`。
实测该写死版会**打碎一颗在册消费者**：`apps/web/src/components/home/more-menu.tsx:73` 用
`className` 把 DialogContent 覆写成右上下拉（`left-auto top-14 right-3 translate-x-0 translate-y-0`）。
动画层叠优先于普通作者声明且 `both` 持久填充 ⇒ 端点写死 -50% 会在动画结束后继续把该面板按
自身宽高推走 50%。而本文件历史 JSDoc 记载的三条备选被否的**正是同一条理由**（外溢到 more-menu 的
`translate-x-0 translate-y-0` 覆写面）。因此端点改走 Tailwind 自己的 `--tw-translate-x/y` 变量转写：
对默认居中对话框，变量值就是 `-50%`（工具类亲手设的），端点计算值与写死版**逐字同值**、
「8px 只叠在 y 上」与 §3.11.2 一致；对 more-menu，变量被 `translate-x-0 translate-y-0` 改写为
`0px`，覆写面天然成立。居中量仍同时存在于两个端点（经由变量源）。若 TPM 认为形如必须逐字落地，
该项列入 §⑥ 待裁。

### ③-2 构建产物取证（web build 后的 `.next/static/css/0bee2a7a3765e8d0.css`）

```
@keyframes dialog-in{0%{opacity:0;transform:translate(var(--tw-translate-x),calc(var(--tw-translate-y) + 8px))}to{opacity:1;transform:translate(var(--tw-translate-x),var(--tw-translate-y))}}
.animate-dialog-in{animation:dialog-in var(--dur-enter) var(--ease-standard) both}
.translate-x-\[-50\%\]{--tw-translate-x:-50%}
.translate-x-0{--tw-translate-x:0px}
*,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;…}
```

末行证明 `--tw-translate-x/y` 有全局回落定义（值 0）⇒ 关键帧里的 `var()`/`calc()` 在任何元素上都可解析，
不存在「变量未定义 → 整个关键帧失效」的路径；`.translate-x-0{--tw-translate-x:0px}` 证明 more-menu 的
覆写走的就是同一组变量。

### ③-3 真机几何取证（浏览器实测）

（待补：动画结束态 DialogContent 的 rect/transform 实测 + more-menu 覆写面实测）

### ③-3 真机几何取证（浏览器实测，临时 spec `e2e/tmp-t13r-forensics.spec.ts`，收工已删）

取证跑法：`cd apps/web && npx playwright test e2e/tmp-t13r-forensics.spec.ts` → **4 passed (7.6s)**
（两档 project × A/B 两条）。控制台原始尾行：

```
[T13R-B] more-menu after=matrix(1, 0, 0, 1, 0, 0) rect=988.0,56.0 | hard-offset dx=-140.0 dy=-123.3
[T13R-A] viewport={"width":375,"height":667} after=matrix(1, 0, 0, 1, -172.5, -250.805) base=matrix(1, 0, 0, 1, -172.5, -250.805) rect=15.0,82.7..360.0,584.3
[T13R-B] more-menu after=matrix(1, 0, 0, 1, 0, 0) rect=55.0,0.0 | hard-offset dx=-160.0 dy=-333.5
[T13R-A] viewport={"width":1280,"height":900} after=matrix(1, 0, 0, 1, -220, -233.055) base=matrix(1, 0, 0, 1, -220, -233.055) rect=420.0,216.9..860.0,683.1
  4 passed (7.6s)
```

判读（TPM 要求的"新增一条自己的取证"即此）：
- **A（登录弹窗，动画结束态）**：`getComputedStyle().transform` 与**同元素摘掉动画类后的基准值逐字相等**，
  且两档都是 `matrix(1,0,0,1,-w/2,-h/2)` 形态（375 档弹窗宽 = min(92vw,440)=345 ⇒ `tx=-172.5` ✓、
  `ty=-250.805`=-h/2；1280 档 `-220,-233.055` = -440/2 ✓）⇒ 居中在动画结束后**没有**被再次覆盖；
  rect 上下边距对称成立（375 档 top 82.7 / bottom 距视口底 667-584.3=82.7；1280 档 216.9/216.9）。
  起始帧断言（动画在途时 pause + currentTime=0 取值）：tx=-w/2、ty=-h/2+8 逐像素命中
  ⇒ 「8px 位移只叠在 y 上」的 §3.11.2 动效真实存在，且动画期间也只偏移 8px（不再像 F-24 那样整颗出界）。
- **B（more-menu 覆写面，本轮新增的正交性守卫）**：两档动画结束态 `transform=matrix(1,0,0,1,0,0)`，
  rect 与基准逐像素一致 ⇒ `translate-x-0 translate-y-0` 覆写面未被新关键帧污染（375 档抽屉钉死右上 `55.0,0.0`）。
- **C（反例模拟，证死"端点写死 -50%"不可用）**：向页面注入字面形如关键帧
  `translate(-50%,calc(-50% + 8px))`→`translate(-50%,-50%)` 挂到 more-menu 上，实测被推走
  **dx=-140.0 / dy=-123.3**（1280 档，恰为其自身宽高之半）与 **dx=-160.0 / dy=-333.5**（375 档抽屉）
  ⇒ TPM 形如字面版会打碎这颗在册消费者，本轮走 `--tw-translate-x/y` 变量转写的理由成立。

临时 spec 删除后 `apps/web/e2e/` 复核：`ls | wc -l` = **8**（7 spec + `helpers.ts`，与开工同形）；
`test-results/` 内仅 Playwright 自带的 `.last-run.json`（一次性运行痕迹，见 §⑤ 申报）。

## ④ 出口命令尾行原文

全部为本人本轮亲跑。（并发窗口确实存在，收工自查发现他轮活跃写入痕迹，详见 §⑤-b 补记；本轮 6 次长跑未观测到由此产生的时序红。）

1. `pnpm --filter @tm/ui test`（件 1/件 2 最终形态落地后跑）尾行：

```
 Test Files  3 passed (3)
      Tests  167 passed (167)
   Duration  2.72s (transform 502ms, setup 0ms, collect 3.22s, tests 1.40s, environment 1.37s, prepare 447ms)
```

   基线 167/3 files 未降。`patterns.spec.tsx` 里**没有**钉 keyframe/animation 名单的用例
   （全 test 目录 grep `keyframes|fade-in-up|animation:` 仅命中 `animate-spinner|animate-breath` 两条运行时断言），
   故本轮新增关键帧**无需**追加或放宽任何断言——既非收紧也非放宽，是名单无哨。

2. `pnpm --filter @tm/web build`：尾行

```
○  (Static)  prerendered as static HTML (uses generateStaticParams)
```

   并以 `pnpm --filter @tm/web build > /dev/null 2>&1; echo "exit=$?"` 二次确认 **exit=0**。

3. `cd apps/web && npx playwright test`（逐字无参数，临时取证 spec 已删之后跑）尾行：

```
  98 passed (36.3s)
```

   含 ⑨c 两档（`auth-wall.spec.ts:559`）。因全量 list 尾行截断看不到 ⑨c 原行，另单跑
   `npx playwright test e2e/auth-wall.spec.ts` 取到硬证尾行（28 条含 ⑨c 两档全 ok，无重试）：

```
  ok 14 [chromium-375x667] › e2e\auth-wall.spec.ts:559:7 › T-16 登录墙与凭据交互 › ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 (1.6s)
  ok 28 [chromium-1280x900] › e2e\auth-wall.spec.ts:559:7 › T-16 登录墙与凭据交互 › ⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动 (2.0s)
  28 passed (20.6s)
```

4. `pnpm --filter @tm/web typecheck`：

```
$ tsc --noEmit
typecheck exit=0
```

5. `pnpm --filter @tm/app build` 尾行：

```
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：13 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```

   且 `echo "app build exit=$?"` = **exit=0**。新 keyframe 随 `apps/app/tailwind.config.js:13` 扫入 App 产物，
   dist-guard 的"无 Chrome84 之后的 API"判据通过（关键帧内只有 `translate()`/`calc()`/`var()`，Chrome 49 前即全支持）。

**并发假红处置**：本轮五条出口 + 一次临时取证共 6 次长跑，全部一次绿，未触发"先单跑复证"流程；
唯一的两次红是本人临时 spec 里误用 `.closeTo`（Playwright 无此 API，应为 `toBeCloseTo`），属取证工装自身缺陷，
修工装即绿，未触任何产品码/配置/断言。

**明确豁免（TPM 下达，非漏跑）**：按任务书要求**未跑** `pnpm --filter @tm/app test`
（T-19e 正在 App 侧交测，避免并发排队假红）。

## ⑤ 越界/授权申报

- 写入面：仅 `packages/ui/src/tailwind-preset.ts`、`packages/ui/src/primitives/dialog.tsx`、
  本报告 `.delivery/04-dev-report-T-13-r.md`（含其 `.tmp` 原子替换中间态），临时工件一律落
  `%TEMP%`/`C:\Users\Public`（取证 spec 曾短暂落于 `apps/web/e2e/`，收工已删，目录回到 7 spec + helpers.ts）。
- 一次性痕迹申报：`rm -rf apps/web/test-results` 在临时取证红跑后执行过一次（删的是 Playwright 失败截图/视频
  工装目录，非交付物）；随后的全量 98 绿跑又生成了 `.last-run.json`。`apps/web/playwright-report/` 未生成。
- 未做：git 任何写操作（仅 `git status/diff/log` 只读）；未打开/写入任何 `.db`；未跑 DDL/DML；
  未用 `--i-know-this-is-prod`；未新增中文产品字面量（dialog.tsx 新增文案全在注释内，`CJK_RE` 走 stripComments 不命中，
  且 ui test 167 绿即该门禁实证）；未改 `ui.spec.tsx` 那颗 hex 哨；注释引用裁决全部写成「A-68 第 192 条」无井号形态。
- 禁改清单（`tokens.css`/`host.tsx`/`apps/web/**`/`apps/app/**`/`packages/shared|server/**`/主文档/
  `ownership.json`/`boundaries.mjs`/`router.tsx`/`main.tsx`）零触达。
- 授权外自裁项：仅「关键帧写法」一处（端点走 `--tw-translate-x/y` 变量而非字面 -50%），属任务书划归我的
  裁量面，但该裁量改变了 TPM 给的形如字面值，**主动请 TPM 复核**（证据链在 §③-1 / §③-3-C）。

## ⑥ 遗留（待 TPM 裁，本轮未擅自扩大处置）

1. **形如偏离追认**：见 §③-1 与 §③-3-C——写死端点版实测把 more-menu 推走 140~333px，故端点改走
   Tailwind 变量转写。若 TPM 认为形如必须逐字落地，则必须同步给 DialogContent 开"动画可选关闭"的
   props（触 DOM 契约，超出本轮授权），本轮维持 var 写法并等追认。
2. **`max-h-dvh` Chrome 84 面**：TPM 已裁「本期保留」，本轮未动；App 侧旧 WebView 上该声明整条失效时
   弹窗退化为无上限（内容短则无碍）。登记备查。
3. **`more-menu` 的 `max-md:h-dvh`**：同为 dvh 存量，与上条同命运，本轮未触。
4. **⑨c 与入场动画的竞态窗口**：⑨c 在压矮视口到 400 高的档位里若恰在动画 180ms 在途瞬间取 rect，
   会有 ≤8px 的纵向偏移（bottom 408 > 401 可致红）。实测全量 98 绿 + 单跑取证 4 绿均未复现
   （断言链路的墙钟远超 180ms），**判定为理论窗口、非现役缺陷**；若未来出现并发假红样本，
   解药应是测试侧等 `getAnimations().finished`，而不是动产品码。待证。
5. 上一轮报告（T-16r5b）里「解药 = 换 fade-in、弃位移」的表述已被本轮事实取代，主文档未回填该节
   （`.delivery` 主文档禁改清单内），请 TPM 决定是否在裁决页补一条勘误指针。

### ⑤-b 并发观测补记（收工自查时新增，修正 §④ 首句的"无并发感知"措辞）

收工用 `os.stat().st_mtime` 列了"本轮开工以来被修改的文件"，命中 13 项，其中**非我写入**的有：
`.delivery/04-adjudications.md`、`.delivery/04-dev-report-T-16-r5.md`、`04-dev-report-T-19-d.md`、
`04-dev-report-T-19-e.md`、`status.json`、`apps/app/src/screens/MeScreen.tsx`、`apps/app/test/me-screen.spec.tsx`、
`apps/web/playwright.config.ts`、`apps/web/src/components/upgrade-gate.tsx`。
判定：与任务书预告的 **T-19e 正在 App 侧交测**同窗口并发的他轮写入（我全程未 Edit/Write 过这些路径，
工具调用序列可复核）。这意味着我的 web 全量 98 绿与 app build 绿是在他轮对 `playwright.config.ts`/
`upgrade-gate.tsx` 的现场改动之上跑出的，**未出现任何一条红、未触发单跑复证流程**；6 次长跑一次绿。
§④ 首句"无并发窗口冲突感知"更正为："并发窗口确实存在（他轮活跃写入为证），但本轮未观测到其造成任何
时序红；若有复跑差异，先查他轮对 `playwright.config.ts` 的并发改动，勿判为本轮产品码"。
另 `apps/web/tsconfig.tsbuildinfo` 为我跑 `typecheck`（`tsc --noEmit` 增量态）的生成物，非手写。
