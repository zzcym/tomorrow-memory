# 迭代工单（quick-iteration 流程）

本文件是快速迭代的唯一长期记忆：每个优化点一张独立工单，**串行**闭环（立项 → 实现 → 验证 → 用户确认）。
表头说明：`状态` ∈ 进行中 / 待确认 / 已闭环 / 已升级；报告文件命名 `.delivery/iter-<ID>-dev.md`、`.delivery/iter-<ID>-verify.md`。
常设纪律（与 `.delivery/04-adjudications.md` 同源，⛔ 放松）：⛔ 为测试新增 `data-testid`；⛔ `test.skip`/`test.fail` 跨轮遗留；
每颗绿配一颗必红反证；时间戳一律实测时钟；`tools/boundaries.mjs` 的闸说真话，⛔ 用绕过字符串的手法凑绿。

---

## 迭代 I-01：查词页搜索框「聚焦前居中、聚焦后平滑上滑」（2026-09-28，状态：已闭环）

- 原话诉求：> 查词界面我希望在没有输入之前搜索框在屏幕偏中部的位置，点击搜索以后才滑动到屏幕上部
- 追问确认（本人原话选项）：触发时机 = **「一聚焦搜索框就上滑」**；范围 = **「App 和网页版一起改」**。
- 改动点：`apps/app/src/screens/LookupScreen.tsx:260-309`（hero 与 `lookup-search-dock` 之间加可折叠 spacer，聚焦时高度收 0）；
  `apps/web/src/components/home/search-section.tsx:87` 附近同一手法；`focused` 状态已在 `LookupScreen.tsx:122` 存在，⛔ 新增状态机。
  动画只走 CSS `transition` + 既有时长 token（`duration-micro` 一类，见 `packages/ui/src/tailwind-preset.ts`）。
- 做完标准：
  1. 未聚焦且无输入时，搜索框（`[data-testid=lookup-search]`）的垂直中心落在视口高度的 **42%–62%** 区间（stock Chromium 980×1700 与 390×844 两档各测一次，`getBoundingClientRect()` 实测值写进报告）；
  2. 聚焦后该中心落在 **0%–22%** 区间，且从聚焦到位置稳定的动画时长 **120–420 ms**（`transition-duration` 计算值实测，非形容词）；
  3. 全程 `lookup-search-dock` 是**同一个 DOM 节点实例**（⛔ 卸载重挂、⛔ `top:29%→0` 那类跳位），`apps/app/test/lookup-screen.spec.tsx:271-287` 两条断言（含 `sticky`）**不改且仍绿**；
  4. 结果区/最近查询面板/底部 TabBar 的位置与可点性不变，`@tm/app test` 与 `@tm/ui test` 全绿，`node tools/boundaries.mjs --all` 21/21；
  5. 网页版首页 `/`：未聚焦时搜索框中心同样落在 42%–62%，聚焦后落到 0%–22%（两档视口各测一次）。
- 边界-不许动：`apps/app/test/lookup-screen.spec.tsx` 的 DOM 身份与 `sticky` 断言；`packages/ui/src/styles/tokens.css`（token 唯一定义源）；
  首页可交互元素数量（≤5）；`data.db` 三颗只读面；⛔ 动服务端。

> 口径变更在册：本页原契约「修① 搜索框不跳位」（`LookupScreen.tsx:6-9` 注释 + A-级裁决）由用户本人本轮原话改判为
> 「聚焦平滑上移」；节点身份与 sticky 两项仍在，⛔ 写成「跳位回归」。裁决落 `04-adjudications.md`。

- 验证收口（实测 2026-09-28 13:12–13:22，报告 = `.delivery/iter-I-01-dev.md` / `.delivery/iter-I-01-verify.md`）：
  判据① 未聚焦中心 50.51%/55.78%（App）、47.51%/56.84%（Web）；② 聚焦 5.51%/10.78%（App）、9.51%/18.84%（Web），
  时长计算值 0.24 s；③ dock 同一节点 + `sticky`，`lookup-screen.spec.tsx:271-287` 未改；④ 面板/TabBar 可点性不变、可交互元素无新增；⑤ 网页版达标。
  TPM 亲跑复点：`@tm/app test` **484/484** @13:22:16、`@tm/ui test` **168/168** @13:21:54（开发自报 164 = 账面误差，以盘面为准）、
  `--all` **21/21**、`--dist` 首屏 JS gzip **184062 B** ≤256000（主块 `index-BvT2VxNn.js`）。
  在册风险：390 宽窄屏 + 软键盘把视口压到 55% 时，Web 聚焦态中心实测 34.27% 出 22% 档（真机键盘弹起时框会偏低，判据本身仍按无键盘口径达标）。
- 用户确认（原话）：> 继续 I-02 ⇒ 未提修正，按认可闭环；键盘态那条留作装机后回看项（⛔ 现在擅自改档位）。

---

## 迭代 I-02：搜索框内绿色焦点框整改（2026-09-28，状态：待确认）

- 原话诉求：> 现在点击搜索会有一个绿色的框框在搜索栏很不好看
- 已定位的现场（主会话亲读）：`packages/ui/src/patterns/SearchBar.tsx:192` 内层 `<input>` 上的
  `focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2`；`--focus` = `170 75% 24%`（`tokens.css:15`，青绿），
  `outline-offset:2px` 使环画在胶囊**内部**、宽度只覆盖文字区 ⇒ 视觉上就是一块孤立的绿框。容器侧另有
  `focus-within:border-brand focus-within:shadow-elev-brand`（`:145`）。
- 改动点：`packages/ui/src/patterns/SearchBar.tsx:189-194` 与 `:141-150` —— 焦点环改由**胶囊容器整圈**承担（圆角随 `rounded-full`），
  内层输入不再单独画矩形环；App 与 Web 同一组件 ⇒ 两端一次生效。
- 做完标准：
  1. 聚焦态截图（stock Chromium，两档视口）中：搜索框内**不再出现只包住文字区的矩形绿框**，焦点指示为胶囊外圈一整圈；
  2. `node tools/boundaries.mjs --all` 的 `focus-ring-not-hidden` 仍为绿，且产物里 **0 处** `outline-none` / `outline: none` / `outline-0` /
     `outline-transparent`（⛔ 用"还在但看不见"的手法绕闸）；
  3. 键盘 Tab 聚焦与手指点按聚焦两条路径都有可见焦点指示（WCAG 2.4.7 口径：环与非焦点背景对比 ≥3:1，实测计算值写进报告）；
  4. 必红反证：临时把容器焦点环删掉 ⇒ `focus-ring-not-hidden` 或新增用例必须红，复点回绿；
  5. `@tm/ui test`、`@tm/app test`、web e2e 相关套件全绿，⛔ 新增 testid。
- 边界-不许动：`tokens.css` 的颜色定义（⛔ 为了不难看就改品牌色）；`tools/boundaries.mjs` 的闸语义（若确需改判据，由 TPM 本人改并配必红反证，⛔ 开发 agent 自改）；
  同组件在其他页面（背词/单词本）的既有布局。

- 验证收口（实测 2026-09-28 14:21–15:17，报告 = `.delivery/iter-I-02-dev.md` / `.delivery/iter-I-02-verify.md`）：
  绿框真实 owner = 内层 `<input>` 的 `outline 2px rgb(15,107,92) offset 2px`（390 档环左缩 45px/右缩 67px ⇒ 孤立矩形），容器同时 `focus-within:border-brand` = 双圈。
  采用 (a) 案：`SearchBar.tsx` 内 `<input>` 改 `absolute inset-0` 铺满胶囊（`:196`、`:204` `outline-offset-0`），环仍真实挂在焦点元素上；收掉容器 `border-brand`；放大镜/busy 浮标 `left-4`，
  清除/提交收进右缘 `pointer-events-none` 轨道（键位 `auto`，`:208-232`）。
  独立验证实测：聚焦态胶囊一整圈（inset 0，App/Web × 两档视口八组）、双路径 `focusVisible=true` 且最差对比 5.67:1、
  长词不穿字、✕ 与提交键真命中、Tab 序无死键、面板缓存复用、`list` 档逐位不变。
  TPM 亲跑复点：`@tm/ui` **169/169**、`@tm/app` **484/484** @15:17:43、`--all` **21/21** @15:16:54、禁词（`outline-none`/`outline: none`/`outline-0`/`outline-transparent`）
  在 `packages/ui/src`+`apps/app/src`+`apps/web/src` **0 命中**；边界三处自证未动 = `tokens.css` mtime 09-23 04:10:41、`LookupScreen.tsx` 13:05:43、`search-section.tsx` 13:09:52（均 I-01 时刻）。
  **在册风险（判据④的实质缺口，如实记）**：开发新增的反证哨是**源级字符串断言**（断 `SearchBar.tsx` 含那几个类名），验证 agent 实测把 dist 里的环色改成 transparent 后视觉环消失而 `@tm/ui` 仍 169 全绿 ⇒
  「焦点环可见」目前只有手动量测撑着，无自动化兜底。出路（下一轮再拍，⛔ 现在擅自扩范围）：闸侧改成「容器或焦点元素上必须存在 `outline-2 + outline-focus` 之一且无禁词」的实质判定，配必红反证。
  另两处轻微：开发自报对比度 3.28:1 取的底色口径不实（已按验证实测 5.67:1 记）；`type=search` 的 UA 原生 ✕ 与自绘 ✕ 并排 = 改前既有，未越权动。
- 出包（用户原话「构建完整的app给我」，实测 15:21:46–15:27:46）：`mobile-memory/tmword-internal-20260928.apk` 316714 B / sha256 `10e32488c03e` / mtime 15:22:09，
  含 I-01 + I-02 + E5c；四颗 exit 0（BUILD/CONTENT/VERIFY/FP），证书指纹 == 基线；交付物级 stock Chromium 复量（从 APK 抽出的三颗字节）= idle 50.51%/55.78%、focus 5.51%/10.78%、
  环 `2px offset 0 radius 999px`、JS 报错 0 @15:26:50。首跑我的一颗内容级判据**假红**（标记串不专属，旧包也命中）已入册 A-113 #595。

- 上线（用户原话「也部署一下」，实测 16:05:34–16:07:27）：web 侧两条改动已部署到 tmword.xyz —— 本地 `next build`（BUILD_ID `mGqV8a0uDFC7tBjHPz4GS` @15:50:47）→ 上传 `.next`（剔 cache 210 M）+ 3 颗源文件（包 1356808 B / `3fa1a5e04b33`，盒上同值）→ 盒上 3100 staging 冒烟绿 → `pm2 stop tm-web`（旧代 08-28 代，定义保留 = 回退件）→ `tm-web-new` 绑 3000，**停机窗口实测 1.564 s**（连续探测 128 样本、6 次非 200）→ 公网 `/` 200 且 `h-[38vh]`=1、CSS `f248e5509267ff57.css` 200、`/nope-such-route` 404、HSTS/CSP 头在；交付物级 stock Chromium 直打线上：idle 47.51%(980×1700)/56.84%(390×844) → focus 9.51%/18.84%、环 `auto 2px rgb(15,107,92) offset 0px`、胶囊边框 transparent、两档 JS 报错 0（截图 `E:\e5b\shots\pub\*`）。⛔ 盒上 build Next.js（沿用 A-111 #562，实测 MemAvailable 590–693 MB）；`NEXT_OUTPUT=standalone` 在 Windows 撞 symlink EPERM ⇒ 未采用。生产活库三颗前后逐字同值，本轮对生产面 0 次写请求。详见 A-114 #597–#606。App 侧仍待装机回看。


---

## 迭代 I-03：查词页搜索框静态位上移到视口上三分之一（2026-09-28，状态：待确认）

- 原话诉求：> 1.搜索框放的太下面了，要在中上部而不是中下部，最好是屏幕三分之一的位置。
- 已定位现场（主会话亲读）：Web `apps/web/src/components/home/search-section.tsx:95` 未聚焦撑 `h-[38vh]`（线上实测中心 47.51% @980×1700 / 56.84% @390×844）；
  App `apps/app/src/screens/LookupScreen.tsx:272` 撑 `h-[45vh]`（交付物实测 50.51% / 55.78%）。两端同一手法（可折叠 spacer + `transition-[height]`），只调这两颗高度档。
- 改动点：上述两行的静态位高度常量 —— 目标 = 未聚焦时搜索框几何中心落在视口高度 33%；聚焦态与位移曲线不动。
- 做完标准：
  1. 未聚焦静态位中心 Y = 视口 33% ±2pp，四组实测（App dist / Web dev × 390×844 与 980×1700），数字逐组写进报告；
  2. 聚焦后仍上滑到顶（I-01 档，中心 ≤20%），位移只走 `transition-[height] duration-move`，⛔ 新增魔法毫秒数；
  3. 两档视口各一张 stock Chromium 截图：slogan 与框不重叠、框不被底部 tab 栏遮挡、无新增横向滚动条；
  4. 必红反证：把 spacer 临时改回 38vh/45vh ⇒ 判据 1 的量测脚本必须红，复点回绿；
  5. `@tm/app test`、`@tm/ui test`、web e2e 相关套件全绿，⛔ 新增 testid / ⛔ 改 DOM 结构。
- 边界-不许动：I-02 的焦点环实现（`SearchBar.tsx` 的 `absolute inset-0` 与 `outline-offset-0`）；`tokens.css` 色值定义；App/Web 的 tab 栏、页脚与 slogan 文案。

## 迭代 I-04：去掉首页搜索框下方那团"绿圈"光斑（2026-09-28，状态：待确认）

- 原话诉求：> 2，没搜索的时候有一个莫名其妙的绿色圆圈在搜索框下面。
- 已定位现场（主会话亲读）：`apps/web/src/components/home/decor-layer.tsx:16` 右下光斑 `bottom-[10%] right-[6%] h-64 w-64 rounded-full bg-brand-50 opacity-80 blur-3xl`，
  压在渐变底 `to-surface`（近白）上 ⇒ 读成一个有边界的绿圈；`:15` 顶部那团压在绿底上不明显，App 侧无 decor 层（grep 无命中）。
- 改动点：删除/收掉 `decor-layer.tsx:16` 这一层（或降到不可辨识为圆）。
- 与设计的冲突（如实记，不擅自抹平）：UI §3.1.2 B / R-22 ③ 写的是"两团柔光斑"。本轮以用户本人口述为准 ⇒ 出口时账面记一行改判（A-115），⛔ 开发 agent 自改设计文档。
- 做完标准：
  1. 390×844 与 980×1700 两档未聚焦截图：搜索框下方无可辨识边界的圆形光斑（像素取样：原光斑中心点与同高左右两侧取样点亮度差 ≤3/255）；
  2. 首页可交互元素计数不变（decor 层保持 `aria-hidden` + `pointer-events-none`，⛔ 顺手加元素）；
  3. `node tools/boundaries.mjs --all` 全绿，含 `--colors` 口径（⛔ 写死色值字面量）；
  4. 必红反证：恢复该层 ⇒ 判据 1 的像素取样必须红；
  5. 深浅两色模式各一张截图，顶部光斑与呼吸动画仍在（⛔ 连带删掉 `:14`/`:15`）。
- 边界-不许动：`decor-layer.tsx:14` 渐变底与 `:15` 顶部光斑；`tokens.css` 的 `--brand-50/100`；`animate-breath` 与 `prefers-reduced-motion` 摘动画的口径；App 侧（本就没有 decor 层，⛔ 顺手补一层）。

## 迭代 I-05：背单词首次翻卡即可见释义（预取，不再"必须重试"）（2026-09-28，状态：待确认）

- 原话诉求：> 3，背单词的时候每次第一次查看释义都查不到，要重试才显示。
- 已定位现场（Explore 只读诊断 + 主会话亲读，根因不是网络抖动）：队列接口的 `gloss` 恒为空串（`packages/server/src/services/queue-service.ts:13`，`StudyScreen.tsx:27-29` 已自认"批量释义属 T-11"）；
  翻卡只 `setFlipped`（`:708`），全 App 唯一一次取释义是「重试」那一下的 `fetchQuery`（`:530`）⇒ 每张卡第一次必然落进 `noGloss`（`:680-681` → `Flashcard.tsx:297-311`）。
  次因：`retryGloss` 拿到空串时静默 `return`（`:533`），上游失败被吞成空译文（`services/youdao.ts:67-69`，`AbortSignal.timeout(5000)`）⇒ 未实测是否叠加。
- 改动点：`apps/app/src/screens/StudyScreen.tsx` —— 队列装配/翻到第 i 张时预取第 i、i+1 张释义（复用 `apps/app/src/data/queries/lookup.ts` 的 `lookupQueryOptions`）；
  `retryGloss` 空串分支不再静默返回，回落既有"查不到释义 + 重试"态。
- 做完标准：
  1. 连续 5 张卡首次翻面即出释义，零「重试」命中 5/5（本地造数队列，量测脚本 + 请求日志进报告）；
  2. 只发 `GET /api/lookup`，⛔ 新增服务端写路径；同词不重复请求（React Query 缓存命中，network 计数为证）；预取不得突破 `routes/lookup.ts:16` 的 30/min 限流；
  3. 上游真查不到时显示既有"查不到释义 + 重试"态，不再空白无反馈；
  4. 必红反证：关掉预取 ⇒ 判据 1 必须回落到 0/5；
  5. `@tm/app test` 与 `node tools/boundaries.mjs --all` 全绿，⛔ 新增 testid。
- 边界-不许动：`queue-service.ts` 的 `gloss` 契约（批量释义是 T-11 未开工范围）；`Flashcard.tsx` 的 DOM 与状态机；Web 侧查词页；限流阈值；`youdao.ts` 的凭据与超时值（F-74 另案）。

## 迭代 I-06：日历热力图月份标签与方格逐列对齐（含横滚脱节）（2026-09-28，状态：待确认）

- 原话诉求：> 4，热力图显示有问题。追问口径（本人选定）：手机 App「学习」页的日历热力图；具体表现 = 月份标签和方格对不齐 / 横向滚动时错位。
- 已定位现场（Explore 只读诊断）：`packages/ui/src/patterns/Heatmap.tsx` 月份标签行渲染在 `.heatmap-scroll` 滚动容器**外面**（标签行 `:296` vs 滚动区 `:311`）⇒ 横滚必然脱节；
  标签按列首格生成（`:221-232`）用 14px `truncate` span，与 53 列 × 格子宽不同源（`:119`、`:57-58`）。App 唯一渲染点 = `apps/app/src/screens/ProgressScreen.tsx:361`。
- 改动点：`packages/ui/src/patterns/Heatmap.tsx` —— 标签行移进同一滚动容器，列宽与格子同源（同一列宽常量/同一 grid 轨道）。
- 做完标准：
  1. 横滚三个位置（最左/中/最右）各一张截图：逐列对齐，标签左缘 x 与该列首格左缘 x 差 ≤1px（量测数字进报告）；
  2. 390×844 自动滚到"今天"后仍对齐（`:207-211` 的自动滚动路径单独取证）；
  3. 标签归属正确：每列标签 = 该列首格所在月份，只在月份变化处出标签（连续同月不重复），可见区间 12 个月至少覆盖 11 个；
  4. 必红反证：把标签行移出滚动容器（还原现状）⇒ 判据 1 必须红；
  5. `@tm/ui test` 与 `@tm/app test` 全绿。注意既有断言 `patterns.spec.tsx:444-532` 里有一条"状态行在滚动区外"的口径可能把当前布局当成了契约 ——
     若与判据 1 冲突，在报告里点名并给出改判理由，⛔ 静默删断言凑绿（改测试需 TPM 本人拍板）。
- 边界-不许动：`--heat-*` 色档 token；日期解析口径（UTC getters + 周一起始 `:87`，⛔ 顺手改成周日起始）；`apps/web` 的 `heatmap-chart.tsx` 与 `lib/api/profile.ts:408 buildHeatCells`（本轮不碰）；`ProgressScreen.tsx` 的数据装配。


---

## I-03～I-06 出口收口（实测 2026-09-28 16:31–18:42 + 2026-09-29 15:22–15:35，四张单状态 = 待确认）

- **I-03 判绿**：`search-section.tsx:97` → `md:h-[23.5vh] max-md:h-[14.2vh]`（6104 B / `63fb90cc0c9e`）、`LookupScreen.tsx:274` → `md:h-[27.5vh] max-md:h-[22.2vh]`（19719 B / `f00d5e97daa3`）。
  单一 vh 撑不住两档视口（固定基线 Web≈160px / App≈92px 与视口无关）⇒ 按 768px 断点分两颗。四组中心 Y 实测 33.01/32.98/33.01/33.04%，聚焦态 5.51/10.78/9.51/18.84% 未回归，
  spacer computed `transition-duration:0.24s` = `--dur-move`（⛔ 硬编码毫秒）。反证改回 38vh/45vh ⇒ 四组全出档 EXIT=1，恢复后 sha 逐字一致。报告 `iter-I-03-dev.md` / `iter-I-03-verify.md`。
- **I-04 判绿**：`decor-layer.tsx` 删原 `:16` 右下光斑整层（1405 B / `40045500ef98`），保留渐变底与顶部光斑（computed `animation-name:breath/24s` 在位）。
  改后原光斑中心取样差 0.08–0.12/255；可交互元素仍 3；首页 HTML `bottom-[10%]` 命中 0。绿圈归属面复核为真 = **只在 Web**（`apps/app/dist` 0 个 blur 元素、四档整行剖面峰值 0.00）。
  **两颗如实记**：① 我的判据 ≤3/255 在浅色下是空判据（光斑在场浅色仅 1.04/1.92，只有深色能红）⇒ 反证口径改用逐层归属/全行剖面（A-115 #609）；② 顶部那团在深色模式同类问题（A-115 #610，待拍板）。
- **I-05 判绿（含第二轮修复回环）**：根因不是网络抖动 = **根本没发请求**（`queue-service.ts:13` 的 `gloss` 恒空 + 翻卡只 `setFlipped` + 全 App 唯一取释义是「重试」那一下）。
  最小修 = 客户端预取第 i、i+1 张（`StudyScreen.tsx:526-550`）+ `retryGloss` 空串不再静默（`:551-570`）。第二轮 `:562` 在重试前 `removeQueries` ⇒ 重试必发 1 条真请求
  （实测 6→7 条，改前 0 条）：否则上游超时被 `youdao.ts:67-69` 吞成"成功但空译文"进缓存驻留 5 分钟，用户诉求会换个形式继续存在。
  终值 40067 B / `cb24c4443994` @18:29:34。首翻 5/5 零重试、`/api/lookup` 全 GET 同词 0 重发、峰值 6/30（限流余量 24）；关预取反证 0/5 转红再回绿。
  S-26"重写为新契约"经独立审 = 行为确按工单变，⛔ 断言弱化（两颗 spec mtime 早于本轮窗口）。
- **I-06 判绿**：`Heatmap.tsx` 月份标签行移进 `.heatmap-scroll`、列宽与格子共用 `colPitchPx = cellPx + gapPx`（16959 B / `dbf6afc352de` @18:42:11）。
  三档横滚（0/218/435=scrollMax）**逐列**量测 54 列 Δx 恒 0px（非抽样）；自动滚到今天同档 0px；归属违例 0、出标签 12 个月；自建红版（移出容器）中/右档 218/435px 转红，恢复 sha 逐字一致。
  三项点名风险均无：纵向 +19.94px 只涨在滚动容器内（卡总高/标题/图例/status 逐字不变）、13 颗标签 0 截字、无第二条横滚条。
- **TPM 亲跑终态 @2026-09-29 15:35:37**：`node tools/boundaries.mjs --all` **21/21**、`@tm/ui test` **169/169**、`@tm/app test` **488/488**、`--dist` 首屏 JS gzip **184295 B ≤ 256000**。
- **盘面 ≠ 线上**：tmword.xyz 仍是 I-02 代（首页 HTML 里那团光斑与 `h-[38vh]` 都还在），APK 仍是 `tmword-internal-20260928.apk` ⇒ 四条里有三条（I-03/I-04 需部署、I-05/I-06 需重出包）用户侧尚未生效，等出口拍板。
- **【A-116 更正 @09-29 22:40】** 上一条「盘面 ≠ 线上」已过期：web 已切到 20260929 代（`BUILD_ID WGcxWIDIU7mGWu5v5CWPZ`，停机 ≈1.358 s），APK 已重出 `tmword-internal-20260929.apk`（316714 B / `8f78fb8f5b8e`）⇒ I-03/I-04 线上已生效，I-05/I-06 在新包里待装机。
- **仍待用户本人**：四张单目视确认（I-02 亦仍待确认）+ F-75 是否开工单升级闸 + Phase 7 欠件（F-6 告警地址、U-1 keystore 双备份、V-2 恢复演练、生产库常设只读通道、F-74 有道凭据轮换、一台开 USB 调试的安卓真机）。


---

## 迭代 I-07：深色模式下首页顶部光斑不再读成一个圆（2026-09-29，状态：待确认 · 判绿见 A-116 #617，已随 A-116 #619 部署上线）

- 原话诉求：> （A-115 #610 待拍板项，用户选定）"另开 I-07 修深色光斑"。现象出处（独立实测）：`apps/web/src/components/home/decor-layer.tsx` 现存的顶部光斑中心 vs 同高两侧取样差 = **101.64（390）/ 129.96（980）**，对"搜索框下方"的贡献在 390 档达 76/255；浅色仅 5.16/8.96。根因 = `.dark` 未覆写 `--brand-50/100`（`packages/ui/src/styles/tokens.css:30` 一带只定义在 `:root`）。
- 改动点（**首选 contained 方案**）：给 decor 光斑单独一条语义档（同文件既有 `--decor-a/--decor-b` 就是 decor 专用档的先例），令其在深色下与底色同族低对比；⛔ 直接改 `--brand-50/100` 的全局深色值（那是所有 chip/badge/角标共用的色，波及面远超本单）。若你判定必须走全局改法，**先停下来报告**，说明波及清单再动。
- 做完标准（取样口径按 A-115 #609 改判：⛔ 用"中心 vs 两侧 ≤3/255"这条已被证明在浅色下空判的字面口径，一律用**逐层归属 + 全行剖面峰值/步长**）：
  1. 深色模式 390×844 与 980×1700 两档：光斑所在整行的剖面峰值与相邻步长显著低于改前（改前 101.64/129.96 为基准），且逐层归属显示"框下方"贡献 ≤ 浅色同级；数字与截图进报告；
  2. 浅色模式两档**视觉零变化**：改前/改后同坐标像素差 ≤2/255（⛔ 为了深色把浅色那团也弄没了 —— 用户没提浅色问题）；
  3. 波及面自证：全仓 grep `bg-brand-50` / `bg-brand-100`（含 `apps/web/src`、`apps/app/src`、`packages/ui/src`）使用者清单逐颗列出，并声明是否受影响；若走了 contained 方案，须给出"旧全局深色值 0 处被改"的反证（`tokens.css` 里 `--brand-50/100` 的 `:root` 值逐字不变）；
  4. 必红反证：把新档的深色值改回与浅色同值 ⇒ 判据 1 必须红，恢复后 `tokens.css` / `decor-layer.tsx` sha256 与改后终值逐字一致；
  5. `@tm/ui test`、`@tm/web test`、web e2e 首页两套、`node tools/boundaries.mjs --all`（含 `--colors`）全绿；⛔ 新增 testid / ⛔ 写死色值字面量 / ⛔ 动 `animate-breath` 与 `prefers-reduced-motion` 口径。
- 边界-不许动：I-03 的两颗 spacer 值、I-04 已删的右下光斑（⛔ 加回来）、I-06 的 `Heatmap.tsx`、`--brand-*` 的浅色档、首页可交互元素计数（≤5）。

## 迭代 I-08：学情页热力图首帧定位到"今天"（2026-09-29，状态：待确认 · 判绿见 A-116 #618，已随 A-116 #620 进新包）

- 原话诉求：> （A-115 #614 待拍板项，用户选定）"要，另开 I-08"。现象出处（独立实测，既有行为、非本轮改坏）：`packages/ui/src/patterns/Heatmap.tsx:207-211` 自动滚动的 deps =（mode / weeks / grid.length），loading→loaded 之间不变 ⇒ 打开学情页 `scrollLeft=0`，用户第一眼看到的是半年前的列，"今天"要自己往右滚（实测 `result-judge2.json.initial`）。
- 改动点：让首帧（数据到位后）就把滚动位置定到今天所在列，与宿主"滚到今天"走同一条路径（`ProgressScreen.tsx:283` 的 `revealToday` 同口径）；最小改动，⛔ 顺手重构滚动逻辑。
- 做完标准：
  1. 390×844 / 980×1700 两档、真实 `ProgressScreen` 装配路径（本机 mock 数据）：首帧 `scrollLeft` = 使"今天"列完整可见所需位置（报实测值与 scrollMax），且 today 单元格在视口内；
  2. **不回归 I-06**：首帧定位后重跑三档横滚（含新首帧位）全 54 列逐列 Δx ≤1px；
  3. 三种模式（每日/每周/累计）切换后仍定位正确、⛔ 出现纵向跳动或二次滚动抖动（量测容器高度与 scrollLeft 时间序列）；
  4. 必红反证：把 deps 改回原样 ⇒ 判据 1 必须红（首帧 scrollLeft=0），恢复后 sha256 与改后终值逐字一致；
  5. `@tm/ui test`、`@tm/app test`、`node tools/boundaries.mjs --all` 全绿；⛔ 新增 testid / ⛔ 删或弱化既有断言凑绿。
- 边界-不许动：I-06 刚落的 `colPitchPx` 同源列宽与标签行位置；日期解析口径（UTC getters + 周一起始 `:87`）；`--heat-*` 色档；`GrowthLine.tsx:242` 的 sr-only 表（F-76 另案，⛔ 顺手修）；`ProgressScreen.tsx` 的数据装配。


---

## 出口执行（实测 2026-09-29 22:29–22:47，裁决 A-116 #619/#620/#621）

- **web 上线**：本机 build ⇒ `BUILD_ID WGcxWIDIU7mGWu5v5CWPZ` → 上传 `.next`（剔 cache）+ 三颗改动源 → 3100 staging 冒烟 → 切 3000（`pm2 delete`+`pm2 start`）→ 公网复点 → `pm2 save`。
  改动足迹比对：部署前 3 颗（`search-section.tsx` / `decor-layer.tsx` / `Heatmap.tsx`）、部署后 **diff 0**；盒上备份 `/opt/tm-new/backups/pre-web-20260929/`（409105 B / `22f902f993ae`）。
  停机：公网 502 共 4 样本（22:40:14.272→15.282）⇒ **用户可见 ≈1.358 s**；生产库三颗前后逐字不变。
- **APK 重出**：`mobile-memory/tmword-internal-20260929.apk` 316714 B / sha12 `8f78fb8f5b8e` @22:30:22，证书指纹 == 基线（可覆盖安装）；
  内容级主证 = APK 内嵌 asset 与 `apps/app/dist` **逐颗 sha256 相等**（2/2）+ 专属标记 `22.2vh`/`27.5vh` 新 2 / 旧 0、负向 `45vh` 新 0 / 旧 3。
- **公网交付物级复量**（stock Chromium，四组两态）：中心 Y 33.04%/33.01%、聚焦 18.84%/9.51%；深色光斑「框下方」贡献 maxBelow 2/1、>3 面积 0/0，浅色与改前逐位同值；`home-root` 可交互 3；无横滚；lookup/trpc 请求 0 条。
- **新增待拍板**：F-77（深色首页 React #418 水合不匹配，改前对照同样在场 ⇒ 非本串引入）。

---

## 迭代 I-09：登录面短密码的一致告知 + 「4 位」残留收口（2026-09-29，状态：**已出口 · 待用户目视确认（Step 4）** · A-117 #625–#635 + A-118 #636–#649）

- 原话诉求：> 「网页版的注册逻辑好像和手机不一样，手机需要的密码长度更长」；追问后用户选定 = 「**网页用老密码直接登进去了**」+「**清残留 + 统一文案**」。
- 实测出处（TPM 亲跑 @09-29 23:14–23:21，`E:\e5b\i09\result-app.json` / `result-web.json` / 9 张截图）：两端**建密码门槛一致 = 8 位**（App 与线上 web 各测 4/6/7 位点主按钮 ⇒ 0 条非 GET 请求；App 8 位档发出 1 条 `POST /api/register` 打向不可路由基址 `127.0.0.9`，未出本机；web 的 8 位档 ⛔ 不点 = 会在真库建号）；可见话术两端逐字相同（「密码至少 8 位」+「设一个至少 8 位的密码即可激活…」）。差异的真实来源 = 登录面按设计不拦长度（`packages/ui/src/auth/AuthFormShell.tsx:466`）与旧包 `mobile-memory/assets/app.js:951,962` 的「至少 4 位」。
- 改动点（最小两颗）：① 旧包 bundle 的改密口文案与门槛 4→8（`mobile-memory/assets/app.js:951` 的 label、`:962` 的 `p1.length < 4`），⛔ 顺手重出「明日记忆.apk」（是否重出由出口拍板）；② 登录成功后若**本次输入的密码 < 8 位** ⇒ Web/App 在**同一位置**给**同一条**告知 + 改密入口，新串唯一声明点 = `packages/shared`（`AUTH_COPY.signInShortPasswordNotice`），两端 import，⛔ 复制字面量、⛔ 改提交拦截、⛔ 改服务端契约。
- 做完标准：1) bundle 两颗改后：`grep -c "4 位" mobile-memory/assets/app.js` = 0 且门槛值与 `PASSWORD_MIN` 同值（报改前/改后 sha256+mtime 两证）；2) 登录告知实测：在 `E:\e5b\i09\` 自建 scratch 库（服务端 env 指过去，⛔ 碰仓库根 `data.db`、⛔ 碰生产库）造一个 6 位密码账号，Web 与 App 两端登录**成功**后各出现 1 条、文案逐字相同，且 8 位密码账号 0 条；短密码仍能登进（R-40④「短密码必须能提交」行为一字不变）；3) 必红反证：把告知的触发阈值临时改成 `< 4` ⇒ 6 位账号那条判据必红（0 条），恢复后两证逐字回；4) 闸：`@tm/ui test`、`@tm/app test`、`@tm/web test`、`node tools/boundaries.mjs --all` 全绿，且 `packages/server/test/trpc-shape.baseline.json` 差异 **0 行**；5) **若你判定「登录成功后的告知」与 A-36-3（登录面不讲 `PASSWORD_MIN` 那句话）口径冲突 ⇒ 停下来报告**，⛔ 自己放宽既有裁决或把提示塞进字段错误槽。
- ⛔ 明令不收的一颗（理由随出口入 A-117）：`packages/server/src/trpc/routers/profile.ts:176-177` 的 `z.string().min(4)` —— 它是**故意冻结的死口**（转调硬塞 `oldPassword:''` ⇒ 任何输入先被 `OLD_PASSWORD_REQUIRED` 拒，`:171-173` 注释自证「这条口不再能改密」），改 schema 会打穿 trpc-shape 基线而收益为零；只允许在该处注释补一句「4 = 冻结形状遗留、不可达」，**不动 schema**。
- 边界-不许动：`AuthFormShell.tsx:364-371,464-470` 的判据与拦截口径、`limits.ts:26` 的 `PASSWORD_MIN` 单点、I-01…I-08 已交付终态（`search-section.tsx`/`decor-layer.tsx`/`Heatmap.tsx`/`StudyScreen.tsx`/`tokens.css` 逐字不变）、`trpc-shape.baseline.json`；⛔ 新增 testid、⛔ 在两端复制文案字面量、⛔ 为测试改产品 DOM。
- **【A-117 落地 @2026-09-30 00:43:07】判绿口径与两颗保留**：① bundle 4→8 判绿，但「明日记忆.apk」未重出 ⇒ 装机面仍旧串；② 告知串/判据/入口两端逐字一致、提交口径未动（`AuthFormShell` 未改），四数由独立验证 agent 自建库复点（1/0/1/0 @00:26:23–00:26:57）；**保留 = 这条告知在 `enforce:'on'` + `version DEFAULT 0` 零回填下，对 version 0 的存量短密码号不可达**（走强制改密早退）⇒ 用户原话成因仍未定位，立 **F-78**；③ 闸：我亲跑 ui 169 / app 488 / web 16 / server 446+1skip / boundaries 21/21 全 exit 0，trpc-shape 基线未动（差异 0 行）；⚠ 新记 `@tm/ui` 的 4 条软哨依赖 `apps/web/.next` 构建产物（跑过 `next dev` 会静默 169→165）。**出口欠件** = 重部署 web + 重出 APK 才能让用户看见这一条。
