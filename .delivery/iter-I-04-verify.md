# 迭代 I-04 验证报告（独立复测，实测时钟 2026-09-28 17:22–17:42）

## 结论：通过（附 4 项待拍板，⛔ 我未改任何产品代码）

口径：stock Chromium 1.63.0（`node_modules/.pnpm/playwright@1.63.0`）打 `next start` 127.0.0.1:3100（BUILD_ID `JSdkHfSyX04V1xdwBK-W7`@17:16:40，与源码同代：首页 HTML `bottom-[10%]` 命中 0）；取样 = 5×5 均值逐通道最大 |Δ|，`reducedMotion:reduce` + 摘动画求确定性；脚本/截图 `E:\e5b\i04v\`（`measure2.cjs`/`measure3.cjs`/`appdist.cjs`/`patch.cjs`、`shots/`）。

| 标准 | 结果 | 实测证据 |
| --- | --- | --- |
| 1 光斑取样 ≤3/255（深浅 × 两档） | **绿** | 改后原光斑中心 vs 同高左右 = **0.08 / 0.12 / 0.08 / 0.08**（浅390/深390/浅980/深980）；该行全宽剖面峰值 ≤1、相邻步长 ≤1（无任何边界）；截图 `shots/after-prod3-{light,dark}-{390x844,980x1700}-c0.png` + 动效版 `after-prod-*-evidence.png`。搜索框中心 33.04%/33.01%（I-03 位） |
| 2 可交互计数不变 | **绿** | `home-root` 内 **3**（`input[role=combobox]`/`button`/`a#home-review-cta`），我的独立计数与 `home-redline` 自报一致；decor 根实测 `aria-hidden=true` + computed `pointer-events:none`，删的是根内裸 `<div>` ⇒ 计数不可能变 |
| 3 边界闸 | **绿** | `boundaries.mjs --all` **21/21** @17:28:27、`--colors` **6/6** @17:28:33；`decor-layer.tsx` 内 `#hex`/`rgb(`/`hsl(数字` **0 命中**（颜色只走 `from-decor-a`/`bg-brand-100` 语义类） |
| 4 必红反证 | **绿（含口径缺陷，见待拍板②）** | 我把该层加回源文件（`patch.cjs apply`：新 sha `cd06ae0101c8`，dev 服务器 HTML 出现与线上**逐字相同**的 `animate-breath absolute bottom-[10%] … max-md:w-52`）；同层像素实测在**同 DOM 的线上产物** tmword.xyz（只读 GET，仍是 I-02 代含该层）：判据 1 取样 = **1.04 / 133.16 / 1.92 / 156.68** ⇒ 深色**红**（≫3），逐层归属：删掉的那团对"框下方"贡献 深 134/157、浅 5/5。`patch.cjs revert` 后 sha = **40045500ef98a5663ed9230d9f6f244b97e5a37e3e8cf1af58ae961871373536**（与改前逐字一致，`identical=true`，1405 B），复点取样回绿 0.08–0.12。⚠ 本地 `next dev` 3005 的 `layout.css` 现返回 **404**（17:16 build 覆写 .next 所致，改前即坏）⇒ 加回后的源文件无法在本机出像素，故红值取自 DOM 同构的线上产物；为不覆写共享 `.next`，我⛔ 本地重 build |
| 5 套件 + 未连带删 | **绿** | `@tm/web test` **16/16** @17:28:41（含 `home-shell.spec.tsx:214` 装饰层不可交互那条，未改）、web e2e 首页两套 **16/16** @17:29:08、全量 **118/118** @17:41:36（开发报的 `upgrade.spec:440 ⑦` 这次没红）、`@tm/ui test` **169/169** @17:28:55；`:17` 渐变底与 `:18` 顶部光斑源码/DOM 双在位（kids=2），`:18` computed `animation-name: breath` / `24s`（非 none），reduced-motion 摘动画口径未动 |

越界核查：`search-section.tsx` = `63fb90cc0c9e…` 且 `:97` 仍是 `md:h-[23.5vh] max-md:h-[14.2vh]` ✓；`LookupScreen.tsx` = `f00d5e97daa3…` ✓；`tokens.css` mtime **09-23 04:10:41** ✓。17:00 后全仓源码只 `decor-layer.tsx` 一颗动过（现由我 revert 重写，字节同值，mtime 变 17:36:47）；`03-ui-spec.md` 09-26、`04-adjudications.md` 16:12（均早于开发窗口）⇒ 未擅改规范。`data.db` 三颗 mtime 09-17/09-18 未碰（连探针都没开）；对 tmword.xyz 只发 GET，0 次写；⛔ git 写操作。终态 `.next` BUILD_ID 未变、与源码一致。

待拍板（我⛔ 自己改）：
① **`:18` 顶部那团在深色模式 = 同类问题**：中心 vs 同高两侧 **101.64（390）/129.96（980）**，摘掉它对"搜索框下方"的贡献 390 档达 **76/255**（39300 px >3）——I-03 把框抬到 33% 后这团正好压在框上下；浅色仅 5.16/8.96、框下方 ≤4 ⇒ 深色用户仍会看到一团。根因 = `.dark` 未覆写 `--brand-50/100`（`tokens.css:30` 只在 `:root`）。工单边界明令禁动 `:15/:18` ⇒ 请 TPM 拍是否另开一轮。
② **判据 1 的 ≤3/255 字面口径在浅色下是空判据**：光斑在场时浅色也只有 1.04/1.92（取样点落在晕圈内），只有深色能红 ⇒ 反证记账需改用"逐层归属/全行剖面"口径（我这轮的 `measure3.cjs` 可直接接）。
③ **账面改判未落**：`04-adjudications.md` 里 grep `A-115` = **0 命中**，UI §3.1.2 B / R-22 ③「两团柔光斑」现与盘面（一团）不符。
④ **线上仍是改前产物**：tmword.xyz 首页 HTML 里那团还在（本轮未部署）⇒ 用户看到的绿圈实际未消失，需另拍部署。
另：开发自报深色 104–141 与我实测 133–157 差在侧参考点取位（其 x=16/374，我 x=8/w-9），方向一致；"绿圈只在 Web、App dist 同坐标 0.00" 我实测复核为**真**（`apps/app/dist` 0 个 blur 元素，四档整行剖面峰值 0.00，`shots/appdist-*.png`）。
