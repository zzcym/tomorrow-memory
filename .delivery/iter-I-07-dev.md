# 迭代 I-07 开发记录（实测时钟 2026-09-29 21:20–21:40 · stock Chromium 1.63.0 · `next start` 3107 真产物）

## 改动（contained 方案：只换档，⛔ 新增 token、⛔ 动全局 brand 档）
| 文件:行 | 改了什么 |
| `apps/web/src/components/home/decor-layer.tsx:23` | 光斑色档 `bg-brand-100` → **`bg-decor-b`**（1993 B / sha `60722ea0fa64`）；`:2-17` 注释记 I-07 归属与理由；零 DOM 结构变化、零新增元素、⛔ 色值字面量 |
| `packages/ui/src/styles/tokens.css` | **一字未改**：`:28` `--decor-b: 163 36% 88%` 与 `:30` `--brand-100: 163 36% 88%` 浅色逐字同值、`:80` 早有深色覆写 `168 42% 14%` ⇒ 终值 sha `6c2b43a7c676…` 与改前全等 |
| 编译自证 | `tailwindcss -c apps/web/tailwind.config.ts` 与终态产物 CSS `6c130c849863119a.css` 均出 `.bg-decor-b{background-color:hsl(var(--decor-b))}`；产物里 `bg-brand-100` 0 处（评论串已改写，不留死工具类） |

## 五条判据实测（取样口径按 A-115 #609 改判：逐层归属 + 全行剖面，⛔「中心 vs 两侧 ≤3/255」字面口径）
| 判据 | 实测数字 |
| 1 深色降对比 | 过光斑中心整行亮度剖面峰值 **102.71→4.50（390）/ 129.43→6.15（980）**，相邻步长 2.14→1.79 / 2.00→1.72；逐层归属（摘该层的像素差）框下方 maxBelow **81→2 / 16→1**、>3 面积 **42108→0 / 8911→0**，均 ≤ 浅色同级（4 / 1）；渐变底层归属值 121 / 146 前后不变 ⇒ 转红的只有这一层。字面口径（仅参考，非判据）101.64→4.52 / 129.96→5.76。四组截图 `E:\e5b\i07\shots\final-{light,dark}-{390x844,980x1700}-c0.png`（改前/反证同理共 46 张） |
| 2 浅色零变化 | 改前/改后同坐标逐像素 max \|Δ\| = **0/255**（390 全 329160 px、980 全 1666000 px，>0 者 0 颗），光斑 computed `rgb(213,235,229)` 前后同值 ⇒ 选档未弄没浅色那团 |
| 3 波及面 | `bg-brand-100` 改前使用者 **1 颗** = `decor-layer.tsx:18`（`apps/app/src`、`packages/ui/src` 0 颗），`bg-brand-50` 改前 **0 颗**（I-04 已删）⇒ 改后三树 grep **0 命中**；`--brand-*` 在 `.dark` 块内覆写 **0 处** = 旧全局深色值 0 处被改，`:root` brand 档逐字未动 + tokens.css sha 全等为反证；App 侧 4 条 `decor` 命中全是 `decoration-*`/局部变量名，无光斑层 |
| 4 必红反证 | 临时把 `:80` 的 `--decor-b` 深色值改回与浅色同值 `163 36% 88%`（探针 sha `a49ed6e65d05`）→ 重 build 深档峰值 **49.00（390）/ 74.00（980）**、光斑层框下方 >3 面积 **16849 / 1496** ⇒ 红；revert 后 sha 逐字回 `6c2b43a7c676…`（`identical=true`），重 build 复点 4.50 / 6.15 回绿。如实记：该探针会把渐变层 `via-decor-b` 端点一起提亮 ⇒ 红值低于改前 102/129，更强的红是逐层归属档（改前 = `bg-brand-100`） |
| 5 套件与闸 | `@tm/ui test` **169/169** @21:38:04（含 4 颗读 `.next` 产物的动态用例，0 skipped）、`@tm/web test` **16/16** @21:39:06、web e2e 首页两套 home + home-redline **16/16** @21:39:46、`node tools/boundaries.mjs --all` **21/21** @21:39:21、`--colors` **6/6** @21:39:35；`next build` 五次 EXIT=0（改前基线 / 改后 / 修序重 build / 反证探针 / 终态） |

## 边界自证
`animate-breath` 与 reduced-motion 口径未动：非 reduce 档 computed `breath/24s/infinite` + `@keyframes breath` 在位，reduce 档 `none/0s`（`tokens.css:89-95` 一字未改）；装饰根 `aria-hidden=true` + `pointer-events:none` + kids=2，首页可交互 13（decor 根内 0，未新增元素）；I-03 `search-section.tsx:97` 仍 `md:h-[23.5vh] max-md:h-[14.2vh]`（sha `63fb90cc0c9e`）、`LookupScreen.tsx` `f00d5e97daa3`；I-04 右下光斑在终态产物 `index.html` 内 `bottom-[10%]` **0** 处；I-06 `Heatmap.tsx` `dbf6afc352de` 未动；`data.db` 三颗 + `packages/server/data.db` mtime 仍 09-17/09-18（连开库探针都没做）；对 https://tmword.xyz **0 次请求**（本地取证只打 127.0.0.1）；⛔ 任何 git 写操作。

## 未尽事项（如实）
1. 深色首页 1 条既有 hydration 报错（React #418，顶栏主题图标）改前/改后各 1 条，非本单引入、未越界处理。
2. 本单只落盘面：线上 tmword.xyz 仍是 I-02 代、APK 仍是 20260928 代 ⇒ 用户要等部署/重出包才看得到效果。
3. 并发清理（需 TPM 知悉）：`.next` 为共享产物 —— 09-28 遗留的孤儿 `next dev -p 3005` 在我改源码时回写 `.next`，把当时在跑的 `next start` 打成 500（实测发生一次，重 build 即消）；e2e 复用的孤儿 3100 又服务旧代内存 HTML（仍是 `bg-brand-100`）⇒ 我终止了 3005/3100 两颗孤儿进程（只杀进程，⛔ 动其文件），旧代 3210 未动；终态 `.next` BUILD_ID `2JVU73wriwfmT2CkX7obj`（21:35:58）与源码同代。
4. 取证件全在 `E:\e5b\i07\`（`measure.cjs`/`diff.cjs`/`evidence.cjs`/`probe-token.cjs`/`result-*.json`/`shots/`/`build*.log`），仓库与 `.delivery/` 未落临时文件。
