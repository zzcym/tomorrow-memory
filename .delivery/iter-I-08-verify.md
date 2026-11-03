# 迭代 I-08 验证报告（2026-09-29 22:25 系统钟；独立复测，取证 E:\e5b\i08v\）
结论：**通过**（5/5 判据 + 两项点名均绿；stock pw@1.63.0、量测面 = `pnpm -F @tm/app build` dist；我独有 127.0.0.1:4621 已收回，serve.log 零 LEAK、零外发）
| 判据 | 结果 | 实测证据 |
|---|---|---|
| 1 首帧定位今天 | 绿 | 真实 ProgressScreen 装配 + route 全拦 /api/** 本机 mock：@390×844 容器首现帧（t=785ms）scrollLeft=435=scrollMax（759−324），today 格 [340,351]⊂容器 [33,357]；@980×1700 sl=265=max（759−494），today [720,731]⊂[243,737]；此后 sl 恒单值（result-full.json） |
| 2 不回归 I-06 | 绿 | 三档（每日/每周/累计）× {0/中/新首帧位/max} 横滚位，**全 54 列逐列**「标签左缘−该列首格左缘」max|Δx|=0.0000px，>1px 列数 0（非抽样） |
| 3 三档切换无抖动 | 绿 | @390 新载后切 每→周→累→每（1470/2347/3220ms），235 帧序列：sl∈{435} 变化 0 次、window.scrollY∈{0}（无纵跳）；容器 ch 101↔119、卡高 306.88↔324.88 仅每周档 +18px 且回每日档复原（transitions 表见 result-full.json judge3）。基线复点：卡总高 306.88 / 标题行 top 419.92 / 图例 648.86 / status 672.8 —— 与 I-06 基线逐字相等 |
| 4 必红反证 | 绿 | 我自行把 deps 改回 `[mode, weeks, grid.length]` 并删早退、重建 ⇒ 两档首帧 sl=0（390 t=762 / 980 t=775），至 4.38s 恒 {0}（判据 1 红）；字节级恢复后 sha256=`badf43fe4f2de5a2035a3aef056e3730bb38ceb7735a40a348ce7f927aa3ef07` 逐字一致、17194B 一致，重建复测回 435/265 绿（result-red/green-recheck.json）。注：恢复动作使 mtime 更新为 22:25:05，内容零差 |
| 5 三闸全绿 | 绿 | @tm/ui test 169/169、@tm/app test 488/488、boundaries.mjs --all 21/21（我复跑 @22:25）；未动 spec：patterns.spec.tsx mtime 09-28 14:34:10 sha `ff6b2333279e…`、progress-screen.spec.tsx mtime 09-21 03:40:42 sha `dab80a4a321d…`，P-08 revealToday 断言（:447-475）在场且绿 |
额外①（根因复核）：loaded 帧标签行 = 54 格 span（grid.length=54）；红版旧 deps 在 loading→loaded 全程未再触发（3.6s+ 恒 sl=0）⇒「grid.length 跨 loading→loaded 不变」实测成立；源码头注：列数仅由 today（`useMemo([])` 定死）与 weeks 决定，days 只改格值不改列数（Heatmap.tsx:148-172）。
额外②（越界核查）：全仓 21:55 后 src 改动面仅 Heatmap.tsx 一颗；GrowthLine.tsx 仍 09-19（:242 sr-only 表在场，F-76 未顺手修）；ProgressScreen.tsx 仍 09-21 03:31:58 / `6fb9cc87cbd0…`；`Heatmap.tsx:87` 周一起始 `(getUTCDay()+6)%ROWS` 逐字未变；tokens.css（--heat-*）mtime 21:51:46、早于 I-08 窗口未动；decor-layer.tsx sha `60722ea0fa64391a11b85c7196a85e4d…`（I-07 终值，mtime 21:49:53）；search-section.tsx `63fb90cc0c9e…` ✓；仓库根 data.db / packages/server/data.db 全程未触碰（连探针都没开）。
主流程回归：学情页载入→三卡/曲线/热力图渲染、三档切换、横滚逐列对齐、revealToday 路径均正常；`apps/web/.next` 未动、终态与始态一致（BUILD_ID UJSg32F3pRfpTswk_vOvc，mtime 21:51:59）。
发现的问题：无。
