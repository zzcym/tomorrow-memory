# 迭代 I-08 开发记录（2026-09-29 22:02–22:14 系统时钟）
## 改动摘要
| 文件 | 改了什么 |
| packages/ui/src/patterns/Heatmap.tsx:207-214 | 自动滚动 effect 加 `if (loading) return;` 且 deps 纳入 `loading`（`[mode, weeks, grid.length, loading]`）；无其他改动，未用 rAF/timeout |
## 做完标准自验（stock Chromium pw@1.63.0；量测面 = `pnpm -F @tm/app build` 的 dist；真实 ProgressScreen 装配 + route 全拦 /api/** 本机 mock，零外发）
1. 首帧（`.heatmap-scroll` 出现那一帧；骨架帧 368ms 真实在场）：390×844 @432.4ms scrollLeft=435=scrollMax（scrollWidth 759 / clientWidth 324），today 格 [340,351]⊂容器 [33,357] 完整可见；980×1700 @417.7ms scrollLeft=265=scrollMax（759/494），today [720,731]⊂[243,737]；其后 517 帧 sl 恒单值 {435}/{265}
2. 不回归 I-06：0/中/新首帧位三档（390: 0/218/435；980: 0/133/265）× 全 54 列逐列「标签左缘−首格左缘」max|Δx|=0px（非抽样）
3. 每日/每周/累计切换 scrollLeft 时间序列恒单值（{435}/{265}，变化次数 0 ⇒ 无二次滚动抖动），window.scrollY 恒 0 ⇒ 无纵向跳动；容器 clientHeight 101↔119、卡高 307↔325 仅每周档 +18px，系既有内容高度差（周格单行 95px vs 日 7×11px），本 diff 未触碰布局
4. 反证：deps 改回 `[mode, weeks, grid.length]` ⇒ 两档首帧 scrollLeft=0（390 @422ms、980 @394ms，3.2s 后仍 0）判据 1 红；恢复后回 435/265 绿；终值 sha256=badf43fe4f2de5a2035a3aef056e3730bb38ceb7735a40a348ce7f927aa3ef07 逐字一致
5. @tm/ui test 169/169、@tm/app test 488/488、`node tools/boundaries.mjs --all` 21/21（终态 @22:11 复跑）；⛔ 新增 testid、⛔ 删改断言；两份 spec 既有 scrollLeft 断言（progress-screen.spec.tsx:451-475 revealToday）无冲突仍绿
## 波及其他功能的自查
与 `revealToday`（ProgressScreen:192-198）同一条 `scrollLeft=scrollWidth` 路径；日期口径/`--heat-*`/数据装配 0 改动；刷新导致 loading 翻转时 effect 重触发为幂等（sl 已在 scrollMax）
## 未尽事项
无。取证在 E:\e5b\i08\（run.mjs / run-red.mjs / result-main.json / result-red.json / 4 截图 + 红版 2 截图）；4317 为本轮独有端口已收（PID 61680），未触碰他人进程；apps/web/.next 未动、终态一致
