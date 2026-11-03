# 迭代 I-02 开发记录（实测 2026-09-28 14:21–14:50，stock Chromium = playwright 1.63，取证件在 E:\e5b\）

## 取证（改前，before.json @14:27）
绿框 owner = 内层 `<input>`：`outline: 2px auto rgb(15,107,92) offset 2px`（色 = --focus）。390×844 档 input 盒 x61..305、h24，胶囊盒 x16..374、h50 ⇒ 环左缩 45px/右缩 67px/上下缩 12px = 孤立矩形；容器同时 `focus-within:border-brand` 1px rgb(15,107,92) 整圈 ⇒ 双绿。
## 选型：(a)。理由：(b) 要环由容器承担就必须压掉 input 自己的环（触闸；flex 内两盒物理不可重合）。(a) 让 input 盒铺满胶囊 padding-box（`absolute inset-0`），环走同档圆角 + `outline-offset-0` 贴边，并收掉竞争的 `focus-within:border-brand` ⇒ 只有一圈，且环仍真实挂在焦点元素上（⛔ 任何 outline 抑制手法，产物 0 处禁词）。
## 改动摘要
| 文件 | 改了什么 |
| packages/ui/src/patterns/SearchBar.tsx | 容器 `:141-166` flex→relative（去 px-4/gap/`focus-within:border-brand`）；放大镜/busy 环 `:167-176` 浮标 `left-4 inset-y-0 my-auto`（busy 走 my-auto，⛔ translate 与 spin 关键帧打架）；input `:205-217` 铺满整盒 + `outline-offset-0` + 圆角随档 + `pl-11`/token 化 `pr-[calc(var(--tap)+var(--sp-4)+var(--sp-2))|×2 键位]`；清除/提交收进 `:219-249` 右缘按钮轨（`right-0 pr-4 gap-2`，pointer-events 轨 none 键 auto），逐像素等位原 flex |
| packages/ui/test/patterns.spec.tsx | 判据⑤ 块内新增 1 条正向哨（源含 `focus-visible:outline-focus`+`outline-offset-0`+`absolute inset-0`），同 ui.spec.tsx:390 Button 口径 |
## 做完标准自验（after.json @14:37 / final3.json @14:45）
| 标准 | 验证 | 结果 |
| ① 无内矩形、外圈一整圈 | 980×1700 与 390×844 截图（final-hero-*/final-list-*/web-home-*）+ 计算值：input 盒=胶囊内盒（inset 0/1px），环 2px auto rgb(15,107,92) offset 0，radius 999px/14px 随档；容器 border 恢复 transparent | 绿 |
| ② 闸绿 + 0 禁词 | `focus-ring-not-hidden` 原文：`OK … 0 命中（扫描 apps, packages）；例外豁免 0 处；注释内命中 0 处`；产物 grep `outline-none|outline: none|outline-0|outline-transparent` = 0 | 绿 |
| ③ 双路径可见 + ≥3:1 | 鼠标点按与键盘 Tab 两探均 `focusVisible=true` 同环；WCAG 实算：环 vs 页底 3.28:1、vs 框内 surface 6.41:1 | 绿 |
| ④ 必红反证 | 临时摘掉 input 环类 ⇒ 新哨红：`Tests 1 failed | 168 passed (169)` @14:45:48；还原后 sha 回 `9a88c2be…` = 摘前 keep.sha，169/169 @14:46:00 | 绿 |
| ⑤ 套件 | 见下方尾行；⛔ 新增 testid（0 个） | 绿 |
## 命令尾行（实测时钟）
`@tm/ui test`：`Test Files 3 passed (3) / Tests 169 passed (169)` @14:46:00（基线 168+新哨 1，无减少）；`@tm/app test`：`484 passed (484)` @14:46:23；`--all`：`21/21 条通过，全绿` @14:46:29（`colors-no-hardcode` 原文 `OK 白名单内 6 处，其余 0 命中；例外豁免 60 处…`）；`--dist`：`判据③ 首屏 JS … gzip 合计 184156 B ≤ 封顶 256000 B（index-pTS28z_B.js）` @14:46:42；`@tm/web test`：`16 passed (16)`；`@tm/web typecheck`/`@tm/ui typecheck`：静默过 @14:47:15；web e2e `home.spec+wordbook.spec`：`24 passed (11.1s)` @14:49:22。
## 波及自查与 list 档对照
背词/单词本 `size="list"` 胶囊盒改前后逐位相同（390：capsule 16,52,358,44；980：16,52,948,44；icon/按钮位不变），对照图 list-old-* vs final-list-*（idle/focused/typed 三态）；LookupScreen/search-section 的 I-01 spacer 未触碰（聚焦后 dock 仍在顶，final-hero y=67/69.6）。App dist 重建 @14:43:10（sha 自证：SearchBar.tsx `9a88c2be…`、patterns.spec.tsx `ff6b2333…`，⛔ git 依赖）。
## 未尽事项
① `type=search` 的 UA 清除 ✕ 与自绘清除键并排在长词态仍出现（改前即如此，非本轮引入，未越权动）；② 深色套同环（--focus 157 57% 68%）未单独截图，逻辑同 token 消费；③ 390 窄档 + 软键盘的环观感留装机回看。
