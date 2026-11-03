# 迭代 I-02 验证报告（独立复点，实测 2026-09-28 15:00–15:15，stock Chromium=playwright 1.63，取证在 E:\e5b\v-*）

## 结论：通过（附 1 在册风险 + 2 轻微项）

## 做完标准逐条
| 标准 | 结果 | 实测证据 |
| ① 无内矩形/外圈一整圈 | 通过 | input 盒=胶囊 padding-box（inset 上/左/右/下=0/0/0/0，App+Web×980×1700/390×844×鼠标/Tab 八组）；环 2px auto rgb(15,107,92) offset 0，radius 999px/14px 随档；容器 border 1px transparent。截图 v-hero-*/v-web-hero-*（胶囊一整圈、无孤立矩形）|
| ② 闸绿+0 禁词 | 通过 | `focus-ring-not-hidden 0 命中（扫描 apps, packages）；例外豁免 0 处；注释内命中 0 处`；独立 grep packages/ui·apps/app/src·apps/web/src `outline-none\|outline: none\|outline-0\|outline-transparent\|box-shadow:.*focus`=0 命中；产物 dist/web css 亦 0 |
| ③ 双路径可见+≥3:1 | 通过 | 鼠标点按与冷启动 Tab 均 focusVisible=true；WCAG 自算（环 rgb(15,107,92) vs 真实邻接底）：vs 白面 6.41、vs 页底 6.01、vs idle 胶囊 5.67，均≥3 |
| ④ 必红反证（验实质）| 不通过→在册风险 | 开发新哨是源级字符串断言（仅 toContain 三子串）。真实反证：向 dist CSS 注入 `input[type=search]:focus-visible{outline-color:transparent}` ⇒ 环视觉消失（v-counter-broken-ring-390.png，outlineColor=rgba(0,0,0,0)），但 `@tm/ui test` 仍 169 passed @15:13:31 ⇒ 该哨拦不住"实现还在但环视觉丢了/错位"。还原后 sha 回 d57f4511、环回 rgb(15,107,92)（v-restored-ring-390.png）|
| ⑤ 套件+交互回归 | 通过 | 见下逐条 |

## 重排带来的交互回归（逐条实测）
①长词不穿字：`internationalization` padL 44/padR 空68·有值120px，contentRight 253<首键261(390)、709<717(980)，fitsWithoutScroll=true、textOverlapsButtons=false（两档 hero+list）。②键真命中：✕/提交中心命中 self，真点 ✕⇒清空且焦点回 input、真点提交⇒1 次 /api/lookup+结果区、list 过滤生效。③Tab/死键：放大镜 aria-hidden 不可焦(预期)，input→清空→提交 各带 2px 环，pointer-events:none 轨未造死键。④面板：聚焦 aria-expanded=true 可见，点条目 valueAfter=elephant·newLookupReqs=0(复用缓存)。⑤list 逐位：自量 390 胶囊 16,52,358,44、980 16,52,948,44，键 44×44、放大镜 20×20 不变。

## 边界-不许动
tokens.css mtime 09-23（未动）；LookupScreen sha dd3bc3…、search-section sha 920a32… 与 I-01 绿态逐字一致（spacer 未触碰）；本轮 14:00–15:10 窗口内仅 SearchBar.tsx(14:45)+patterns.spec.tsx(14:34) 改；boundaries.mjs mtime 09-26 未动；⛔ 新增 testid（SearchBar 仅 1 处 data-testid 透传）。

## 套件复跑（尾行+实测时钟）
`@tm/ui test` Tests 169 passed(169) @15:02:23；`@tm/app test` 484 passed(484) @15:02:42；`@tm/web test` 16 passed(16) @15:03:03；`--all` 21/21 全绿 @15:00:53；`--dist` 首屏 JS gzip 184156 B≤256000 @15:03:03；web e2e `home+wordbook` 24 passed(9.9s) @15:03:26（其余 spec 未跑，如实说明）。App dist 重建后 sha 逐字节相同（源码比 dist 新仅因还原环类，产物未变）。

## 问题清单（按严重度）
1. [在册风险] 判据④：新哨仅字符串断言，实测证明其无法拦截视觉回归——"可见"这条只被我本轮手动量撑着，⛔ 被自动化哨兜住。建议改像素/计算值级断言或补 e2e 环截图比对。
2. [轻微] 开发报告"3.28:1"系拿 body 透明底 rgba(0,0,0,0) 反算，非真实邻接色；真实最差 5.67:1（仍达标，仅报告口径不实）。
3. [轻微·改前既有] `type=search` UA 原生清除 ✕（蓝）与自绘清除键在长词态并排（v-hero-980x1700-longtext.png 可见三枚右缘图标），非本轮引入，未越权动。
