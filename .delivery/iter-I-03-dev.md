# 迭代 I-03 开发记录（实测 2026-09-28 16:32–16:50，stock Chromium 1.63.0）

## 改动摘要（只改两颗静态位高度档，DOM 结构/testid/动画曲线一字未动）
| file:line | 改了什么 |
| --- | --- |
| `apps/web/src/components/home/search-section.tsx:97` | 未聚焦 spacer `h-[38vh]` → `md:h-[23.5vh] max-md:h-[14.2vh]`（+ `:88-93` 注释） |
| `apps/app/src/screens/LookupScreen.tsx:274` | 未聚焦 spacer `h-[45vh]` → `md:h-[27.5vh] max-md:h-[22.2vh]`（+ `:264-268` 注释） |
定档法：中心 Y = 固定基线 A + spacer，A 与视口无关 ⇒ 单一 vh 撑不住两档，按 768px 断点分两颗。反解 A(Web)≈161.7/159.0px、A(App)≈93.7/91.0px（由 I-01 基线实测回推），⛔ 魔法像素、⛔ 新增 CSS 变量。

## 做完标准自验（脚本 `E:\e5b\i03\probe.cjs`（判据1/2 中心 Y，含 --strict 门禁）/`geom.cjs`（判据3 重叠/遮挡/横滚/transition），产物 `latest.json`/`geom.json`/`shots/*`）
| 判据 | 实测 |
| --- | --- |
| ① 未聚焦中心 Y = 33%±2pp（四组） | App dist 980×1700 **33.01%** / 390×844 **32.98%**；Web 980×1700 **33.01%** / 390×844 **33.04%**（Web 生产产物 `next build`+`next start -p 3212` 与 `next dev -p 3213` 两路各测一次，四组数字逐位一致） |
| ② 聚焦仍 ≤20% | App 5.51% / 10.78%；Web 9.51% / 18.84%（与 I-01 收口值一字未变）；spacer 聚焦实测 0px；`transitionProperty=height`、`transitionDuration=0.24s` = 既有 `duration-move`(`--dur-move:240ms`)，⛔ 新毫秒数 |
| ③ 截图两档各一张 | `shots/idle-*`、`shots/focus-*` 共 8 张：slogan↔胶囊纵向重叠 **0px**、胶囊↔底部 tab 栏重叠 **0px**、`scrollWidth>clientWidth` **false**（四组×两态全绿，`geom.cjs` 退出码 0） |
| ④ 必红反证 | 16:43:52 两文件临时改回 `h-[38vh]`/`h-[45vh]` + 重建 dist/`.next` ⇒ `probe --strict` **EXIT=1 RED**：App 50.51%/55.78%、Web 47.51%/56.84% 四组全出档（`red2.log`）；16:46:20 复点回绿 **EXIT=0**（`green_prod.log`/`green_dev.log`，16:47:05 与 16:48:55） |
| ⑤ 套件复跑（终态 16:50:50） | `@tm/app test` **484/484**、`@tm/ui test` **169/169**、`@tm/web test` **16/16**、web e2e `home.spec`+`home-redline.spec` **16 passed**（两档视口 @16:50:02）、`node tools/boundaries.mjs --all` **21/21** |
边界自证：`SearchBar.tsx` mtime 09-28 14:45:56（I-02 时刻）、`tokens.css` 09-23 04:10:41、`lookup-screen.spec.tsx` 09-23 03:14:16 均未动；⛔ git 写操作、⛔ 新增 testid、⛔ 碰 `data.db`；`packages/**` 零改动。

## 波及其他功能的自查
只改一处 className 的字符串值 ⇒ 波及面 = 未聚焦静态位。I-01 的 dock 节点身份/`sticky` 断言、I-02 的焦点环、首页可交互元素计数（e2e 实测仍 3）全部复跑无回归；结果区/最近查询面板/TabBar 位置由 `geom.cjs` 覆盖为 0 重叠。

## 未尽事项（如实）
1. 只本地实测，⛔ 部署：tmword.xyz 仍是 I-02 旧版（`h-[38vh]`），App 侧需重出 APK 才生效 —— 等 TPM 拍出口。
2. 未做安卓真机实测，390×844 是浏览器模拟档；软键盘弹起时 Web 聚焦态中心会偏低（I-01 在册风险，本轮档位未触碰）。
3. 两颗 vh 常量是对当前 A 的一次反解：上方内容（slogan 字号、顶栏高度）一旦变化就会整体漂移，本轮⛔ 新增自动化哨兵（工单禁新增 testid，判据本身是浏览器量测），后续改档需重跑 `probe.cjs --strict`。
4. 取证期间多次 `next build` 覆盖了共享 `.next`，一度打坏他人在 3211 的 dev 服务（已回收）；3210 上他人 `next start` 仍 200，`.next` 终态已按本轮源码重建。
