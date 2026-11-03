# 迭代 I-07 独立验证报告（stock Chromium 1.63.0 · 自建改前对照 · 实测 2026-09-29 21:43–21:56）

## 结论：通过（5/5 判据绿；额外 (i) 判定既有→登记 F-77，不阻断本单）

取证：开发报的 `.next` 共享，我独占端口 **3107**（`next start -p 3107`，测毕自杀）；改前对照 = 临时把 `decor-layer.tsx:23` 换回 `bg-brand-100` 重 build，⛔ 拿线上旧版当对照。e2e 用其自带 3100（跑毕自动收）。遗留服务 **3210**(pid45416)/3001(pid40116) 非我起，未动。件全在 `E:\e5b\i07v\`。

| 判据 | 结果 | 实测数字 / 取证方式 |
| 1 深色降对比 | **绿** | 全行剖面峰值(逐层归属口径)：**390 102.43→4.50 / 980 129.43→6.15**（自测改前基准≈工单 101.64/129.96）；步长 0.73→0.72 / 0.46→0.32；blob 层「框下方」\|Δ\|>3 面积 **42770→0 / 8911→0**、maxBelow 79.43→1.79 / 16→1；改后深色贡献(0)≤浅色同级(0)。截图 `shots/final-{light,dark}-{390x844,980x1700}-c0.png`。 |
| 2 浅色零变化 | **绿** | 自建改前对照 build，浅色同坐标逐像素 max\|Δ\|=**0/255**（390 全 329160px、980 全 1666000px，>0 者 0 颗）；blob 浅色 computed `rgb(213,235,229)` 前后同值。 |
| 3 波及面 | **绿** | 三树(`apps/web/src`,`apps/app/src`,`packages/ui/src`) `bg-brand-50/100` 类名使用者改后 **0 命中**；tokens.css 全值 sha256 `6c2b43a7c676789baf7862425bd2fb10875e7e3e6b0b0e81636a1ecc47e16221`（dev 前 12 `6c2b43a7c676` 一致）；`.dark` 块内**无** `--brand-50/100` 覆写(旧全局深色值 0 处定义、0 处被改)。 |
| 4 必红反证 | **绿** | 探针把 `.dark --decor-b` 改回浅色同值(163 36% 88%，探针 sha `a49ed6e65d05`=dev 值)→深色 blobBg 变亮、剖面峰值 **49.00/74.00**、blob 框下方面积 **17158/1496** ⇒ 判据 1 转红；恢复后 tokens.css sha 逐字回 `6c2b43a7c676…`、重 build 复点 4.50/6.15 回绿。如实记：探针同时提亮渐变层 via-decor-b，红值(49/74)低于原始改前(102/129)，最强红是逐层归属面积档(0→17158)。 |
| 5 套件闸 | **绿** | `@tm/ui` **169/169** @21:55:37、`@tm/web` **16/16** @21:55:45、e2e home+home-redline **16/16** @21:56:07、`--all` **21/21** @21:55:27、`--colors` **6/6** @21:55:28（0 处写死色值/无新 testid）。 |

## 额外点名
- **(i) React #418 = 既有**：dark 首页两档各 1 条 `pageerror: Minified React error #418; ...args[]=HTML`，light 0 条；**改前对照(bg-brand-100 build)同样各 1 条** ⇒ 非 I-07 引入。落点：`apps/web/src/components/header.tsx:89` 主题切换图标 `{isDark?<Sun/>:<Moon/>}`，isDark 由 `packages/ui/src/hooks/use-theme-toggle.ts` 的 `useState(()=>readStoredTheme())` 惰性初始化在首帧读 `localStorage['tm:theme']`/媒体查询——服务端恒 `system→Moon`、客户端 dark→`Sun` ⇒ 水合 HTML 不匹配（仅深色触发，浅色两侧同为 Moon 故 0 条）。**建议登记 F-77**。
- **(ii) I-03/I-04 未回归**：`decor-layer.tsx` `bottom-[10%]` 源码命中 0、产物 211 颗 HTML 命中 0（右下光斑未复活）；`search-section.tsx:97` 仍 `md:h-[23.5vh] max-md:h-[14.2vh]`（sha `63fb90cc0c9e`）；首页 home-root 可交互元素 **=3** ≤5（light/dark × 390/980 + e2e 375/1280 一致）。

## 越界检查（只读）
仅 `decor-layer.tsx:23` 类档被换（:22 渐变 via-decor-b 未动，sha 全等 dev 终值 `60722ea0fa64…`）；tokens.css :root brand 逐字未变（= 我 21:47 探针前快照，`packages/ui` 未入 git 无 baseline，故以自持快照反证）；`LookupScreen`(f00d5e97daa3)/`Heatmap`(dbf6afc352de) sha 与出口收口一致；`data.db` 三颗未碰（连探针都没做）；对 tmword.xyz 0 请求；0 git 写。终态 `.next` BUILD_ID `UJSg32F3pRfpTswk_vOvc` 与源码同代。
