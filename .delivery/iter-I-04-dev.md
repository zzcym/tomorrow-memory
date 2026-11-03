# 迭代 I-04 开发记录（实测时钟 2026-09-28 17:04–17:20）

## 改动摘要（采用 (a) 直接删层）
| 文件:行 | 改了什么 |
| `apps/web/src/components/home/decor-layer.tsx:16` | 删除右下光斑整层 `animate-breath absolute bottom-[10%] right-[6%] h-64 w-64 rounded-full bg-brand-50 opacity-80 blur-3xl max-md:h-52 max-md:w-52`；`:14` 渐变底与 `:15` 顶部光斑、`tokens.css`、`animate-breath`/reduced-motion 口径一字未动 |
| 同文件 `:2-11` 注释 | 「三层/两团柔光斑」→「两层/一团」+ 记删除理由与改判归属（⛔ 未碰 `03-ui-spec.md`） |
理由：`--brand-50`(160 36% 95%) 与 `--decor-a` 同值 ⇒ 浅色下这团"中心 vs 两侧"本来只有 0.86/1.80，(b) 案要压到 ≤3 只能 opacity→0（等于留一具空节点）；而 `.dark` 未覆写 brand ramp，同一 token 在深色下是亮斑（实测 104/141），要达标需乘 0.02 系数 = 删。最小改动 = 删一行。

## 绿圈归属面（工单前置问题）
- **Web 真实存在**：`next dev`(3005) 与 `next start`(3100) 双证一致。390×844 深色下直径 ~416px 的亮绿圆斑（`E:\e5b\i04\shots\before\web-dark-390x844.png`）；浅色下只剩 ~5/255 的边界环。
- **App dist 不存在**（`apps/app/dist`，09-28 17:01 产物，含 I-03 的 `max-md:h-[22.2vh]`，未回退）：同坐标取样中心-两侧 = 0.00、整行剖面峰值 = 0；DOM 扫描 0 个 `blur` 元素，圆形者只有搜索胶囊(358×50)与复习胶囊(60×36) = 真实控件。⇒ 无同类元素可上报，App 侧未动。

## 判据 1/4/5 实测（stock Chromium 1.63.0，未聚焦，`animations:'disabled'`，dsf=1）
口径A = 工单字面（光斑几何中心 vs 同高左右两侧 5×5 均值，逐通道最大 |Δ|）；口径B = 过中心的每一行全宽剖面峰值（x=8 为参考列，纵向覆盖盘径）。
| 档 | 改前A | 改后A | 改前B | 改后B | 恢复层B(反证) | 删回B |
| 浅 390×844 / 980×1700 | 0.86 / 1.80 | 0.08 / 0.08 | 5 / 5 | 1 / 1 | 5 / 5（红） | 1 / 1（绿） |
| 深 390×844 / 980×1700 | 103.96 / 141.08 | 0.12 / 0.08 | 134 / 157 | 1 / 1 | 134 / 157（红） | 1 / 1（绿） |
判据1：改后 A≤0.12、B=1 ⇒ 绿。**如实报口径缺陷**：浅色档"改前"的 A 也只有 0.86/1.80（≤3）——390 档光斑晕圈足迹右缘到 x=389/390，"左右两侧"取样点本身在圈内，故判据4 的反证以口径B 记账（1→5→1，红→绿可复点）。
判据2：home-root 可交互元素 改前/改后均 **3**（≤5，未增元素）；decor 层 `aria-hidden=true` + `pointer-events-none` 实测在位。
判据5：深浅各一张 `E:\e5b\i04\shots\after-prod\web-{light,dark}-{390x844,980x1700}.png`，`:15` 顶部光斑与呼吸动画仍在（reduced-motion 摘动画口径未动）。

## 套件与闸
`pnpm -F @tm/web test` **16/16** @17:14:44（含 `home-shell.spec.tsx:214-221` 装饰层不可交互那条，未改）；`@tm/ui test` **169/169** @17:15:29；web e2e 全量 **118/118** @17:19（首跑 `e2e/upgrade.spec.ts:425 ⑦` 红 1 条：单跑两档绿、整跑复绿 ⇒ F-37 并发悬崖族，与 decor 无关）；`node tools/boundaries.mjs --all` **21/21**（含 `--colors` 三闸与 `css-important-budget`）；`@tm/web typecheck` 与 `next build` 通过。**没有任何既有断言因删这层而红** ⇒ 无"待 TPM 拍板"条目；§3.1.2 B / R-22 ③「两团柔光斑」是文档口径冲突，归 A-115。

## 未尽事项（如实）
1. 深色下 `:15` 顶部光晕下缘在 390 档落在 y≈364（搜索框下方约 60px），若用户指的是这一团需另拍——本轮边界明令禁动。
2. `.dark` 未覆写 `--brand-50/100`（`tokens.css:30` 只在 `:root`）⇒ 任何引用 brand ramp 的装饰在深色都是亮斑；本轮只减了一处引用。
3. 线上 tmword.xyz 仍是 I-02 那代产物（含这团），本轮未部署、对生产面 0 次写请求；仓库根 `data.db` 三颗与 `packages/server/data.db` 未碰（连探针都没开）。
4. 深色首页 1 条既有 hydration 报错（顶栏主题图标 SSR/CSR 不一致），改前改后同样存在，未越界处理。
5. 取证脚本/截图/JSON 全在 `E:\e5b\i04\`（`measure.cjs`/`attrib.cjs`/`summ.cjs`/`shots/`），未落仓库与 `.delivery/`。
