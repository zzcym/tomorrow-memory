# 迭代 I-06 验证报告（独立复测，实测时钟 2026-09-29 15:22–15:34）

## 结论：通过（5/5 判据达标；1 项既有遗留待拍板 + 1 项越界外新见缺陷登记）

取证面 = 我方自跑 `pnpm -F @tm/app build` 的 dist（3.02–17.45 s，产物名 `index-DzLi0U-i.js` 与盘面一致 ⇒ dist 与源码同代）+ 真实 `ProgressScreen` 装配 + 本机合成 401 天 mock（独立造数）；stock Chromium（playwright@1.63.0）390×844；脚本/截图/JSON 全在 `E:\e5b\i06v\`（`verify.mjs.js`/`judge2.js`/`probe-hscroll.js`，`result-{green,red,restored,judge2}.json`）。

## 做完标准逐条结果
| 标准 | 结果 | 实测数字 / 取证 |
|---|---|---|
| 1 三档横滚逐列 ≤1px | 绿 | scrollLeft=0/218/435（scrollMax 435），**每档全 54 列逐列量测**（非抽样），Δx 去重集合恒为 `[0]` ⇒ maxAbsDiff=0px、>1px 列数 0/54；`C-judge1-{left,mid,right}-restored.png` |
| 2 自动滚到"今天"后仍对齐 | 绿 | `:207-211` 路径（每日→每周→每日，`result-judge2.json`）：scrollLeft=435=scrollMax、54 列 Δx 全 0、today=2026-09-29 可见；宿主 `revealToday`（点 `[data-testid=progress-card-streak]`，`ProgressScreen.tsx:283`）同档 435/Δ0（`D-reveal-today.png`） |
| 3 标签归属 | 绿 | 54 列逐列对「标签 vs 该列首格（第一个有真实日期格）月份」：13 颗标签、12 次月份变化全部出标签且等值、非变化处 0 重复 ⇒ 违例 **0**；出标签月份 **12** 个（区间 2025-09-22→2026-09-28）≥11 |
| 4 必红反证 | 绿（该红即红） | 我方自建红版：把标签行 div 移回滚动容器**之前**（容器外）⇒ 中档 maxAbs=**218px**、右档 **435px**、54/54 列 >1px（`result-red.json`，`C-judge1-mid-red.png` 肉眼可见脱节）；恢复后 sha256=`DBF6AFC352DE732EDCE683E4AC4D6E086E4984365ECCC70FFE873270953E6063`（16959 B / mtime 09-28 18:42:11）**逐字一致**，重建重跑三档回 0px |
| 5 三套门禁 | 绿 | `@tm/ui test` **169/169** @15:29:47、`@tm/app test` **488/488** @15:30:18、`node tools/boundaries.mjs --all` **21/21** exit 0 @15:30:25（复跑一次同值）；页内 JS 报错 0 |

## 三项点名风险（结论）
- (i) 纵向无挤压：滚动容器盒高 81→100.94px（+19.94 = 标签行 15.94 + `mb-1` 4），**卡总高 306.88、标题行 top 419.92、图例 top 648.86、status top 672.8 前后逐字不变**；标签行 bottom 551.86 < 容器 bottom 636.86（完整可见、在格阵上方，gridTop 555.86）。容器 scrollHeight 103 vs client 100.94 的 2px 溢出在红版同样存在（83 vs 81）= 命中区外扩所致，非本轮引入。
- (ii) 无截字：13 颗带字标签逐颗 `scrollWidth == clientWidth == 14px`（含 10/11/12 与 1 位数字）⇒ 0 颗被切。
- (iii) 右缘/横滚：容器 scrollWidth 759（红绿同值 ⇒ 标签行入内未加宽）；最右档末列格 right=351、末标签 right=354 ≤ 容器 right=357 ⇒ 未裁；全页"overflow-x:auto|scroll 且内容超宽"的容器只有 `.heatmap-scroll` 一颗 ⇒ **无第二条横滚条**。**但页面级横滚存在**：document scrollWidth 2698 vs innerWidth 390（可横滚 ≥120px），owner = `packages/ui/src/patterns/GrowthLine.tsx:242` 的 `<table className="sr-only">`（盒宽 2683 / right 2698），红版同值 2698 ⇒ 与热力图无关、非本轮引入，建议另立一单（C 区无障碍表把 `sr-only` 撑成实宽）。

## 主流程回归
学情页 D 区渲染 54 列×7 行、三模式切换、点选信息条、浏览表、宿主"滚到今天"全通；`@tm/app` 488 与 `@tm/ui` 169 全绿 ⇒ 未见破坏。

## 越界检查（mtime + sha256 两证）
`tokens.css` 6136 B / 09-23 04:10:41 / `6C2B43A7C676…`；`ProgressScreen.tsx` 20079 B / 09-21 03:31:58 / `6FB9CC87CBD0…`；`progress-data.ts` 15479 B / 09-21 03:31:47 / `0F605447CAE9…`；`heatmap-chart.tsx` 2027 B / 08-27 08:18:56 / `41336A9C552B…`；`profile.ts` 15508 B / 09-20 12:46:38 / `509C432D9D7A…`；`SearchBar.tsx` 8018 B / 09-28 14:45:56 / `9A88C2BECD97…` ⇒ 六颗全在 I-06 窗口（09-28 18:39–18:42）之前，未动。日期口径复核 `Heatmap.tsx:69-87`：`toMs=Date.UTC`、`keyOf=getUTC*`、`:87 rowOf=(getUTCDay()+6)%7` 周一起始，未被顺手改。09-28 17:00 后仓库源/测文件仅 `Heatmap.tsx` 被本单改动（并发 I-04/I-05 两文件不属本单）。data.db 三颗只读 stat：`data.db` 253952 B / 09-18 04:05:38、`-shm` 09-17 00:53、`-wal` 09-18 04:09、`packages/server/data.db` 0 B / 09-17 00:10 ⇒ 未开库、未写。git 写操作 0 次；对 tmword.xyz 0 请求。
断言冲突复核：`patterns.spec.tsx:476` 主语是 `[role=status]`（实测 status `inScroller=false`）⇒ 不冲突；`:687`/`:689`（`split('heatmap-scroll')` 与"横溢出面唯一"静态哨）实测绿；`:857` 那颗属 Flashcard 的 overflow 断言，与热力图无关；`apps/app` 侧 `:451`（P-08 scrollLeft 桩）/`:544`/`:692` 亦全绿。两颗 spec mtime = 09-28 14:34:10 / 09-21 03:40:42 ⇒ 本轮**未删未弱化任何断言**。开发"仅此一处 +2/-8"中"+2/-8"的行数账无法用 git 证真（`Heatmap.tsx` 未被 git 跟踪、仓库无 pre-I-06 副本），但可见改动足迹仅 `:240-241` 与 `:299-316` 两处，标签生成 `:221-232`、格子 `:318-408`、信息条 `:424-431`、浏览表 `:433-458` 与工单"已定位现场"逐段吻合 ⇒ 无第二处改动痕迹。

## 发现的问题 / 待拍板
1. （既有、开发已如实记）首帧不自动滚到今天：`:207-211` deps（mode/weeks/grid.length）在 loading→loaded 间不变 ⇒ 打开学情页 scrollLeft=0、today 不可见（实测 `result-judge2.json.initial`）。判据 2 按"自动滚动路径"口径达标，但用户实际第一眼看到的是半年前的列 —— 是否另开一单请 TPM 拍板（本单未扩范围）。
2. （新见，越界外）`GrowthLine.tsx:242` 的 `sr-only` 数据表把页面撑到 2698px 宽 ⇒ 学情页可横向拖动。非 I-06 引入，建议登记另单。
