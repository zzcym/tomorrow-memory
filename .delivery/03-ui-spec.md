# 03 · UI 视觉与交互规范（UI Spec）

> 版本：v1.0（**已完成 §1–§9 全部九节**；后续修订只增不改编号）
> 修订（v1.0 内 · §6.4 文案表一行，非规范变更）：依 `04-adjudications.md` **A-11**（裁决人＝TPM，本条用户未参与），§6.4「找回口令（帮助页唯一答案）」一行按等义改写更新为与 `packages/shared/src/constants/copy.ts` 的 `helpRecoveryAnswer` 一致的定稿文本，以消除与 §6.6 / §8.2-11 硬零禁词「找回密码」的字面冲突。**§6.6 与 §8.2 的禁词表一字未动、未放宽、未开例外**；语义与 §8 验收判据不变，影响面＝仅文案字面。
> 修订（v1.0 内 · §6.4 文案表新增一行，非规范变更）：依 `04-adjudications.md` **A-37 §五-23**（补派 **A-36-#15** 的逾期未做欠账；裁决人＝TPM，本条用户未参与），§6.4「同步、离线与连接」表新增「跨属主访问 / 复习越权 / R-41①」一行，像素级验收值 = 这份内容不属于当前账号，与 `packages/shared/src/constants/errors.ts:216` 的 `TM_ERRORS_SUPPLEMENT.FORBIDDEN.copy` 逐字一致（PRD §5.4-1 定稿，三面共用同一句、不另起码）。**§6.6 与 §8.2 的禁词表一字未动、未放宽、未开例外**；语义与 §8 验收判据不变，影响面＝仅文案字面。
> 修订（v1.0 内 · §6.4 文案表新增一行，非规范变更）：依 `04-adjudications.md` **A-37 §六-26**（补 `03-ui-spec-fix1.md` §2-③「缺，未入表」欠账；裁决人＝TPM，本条用户未参与），§6.4「单词本（§3.6）」表新增「词名超字符上限（65 个字符）」一行，像素级验收值 = PRD **§5.4-4** 定稿句逐字抄写（错误码归属 = 400 `INVALID_WORDBOOK_ENTRY`，与 §5.4-2 同句同码、不另起码），句内数字**由 `WORD_MAX_LENGTH`（`packages/shared/src/constants/limits.ts`）模板字面量组装、表内不写第二份数字**。**§6.6 与 §8.2 的禁词表一字未动、未放宽、未开例外**；语义与 §8 验收判据不变，影响面＝仅文案字面。
> 修订（v1.0 内 · §3.11.2「动效」一行 · **本条改动像素级验收值（入场位移 16px→8px），不是"非规范变更"**）：依 `04-adjudications.md` **A-86 #316**，**裁决人＝用户本人**（文案七问之选项 3A；答复时刻我只有区间锚点 —— 上次账面写入实测 09-22 06:44:34、本条落笔实测 09-23 00:16:57，中间跨午夜，见 `04-adjudications.md` A-86 #315），把面板 `translate-y-4→0` 改述为**8px 入场位移 + 与居中式正交的关键帧实现**；出处 = 已交付实装 `packages/ui/src/tailwind-preset.ts:264-266` 的 `dialog-in`（T-13r，A-72 ①）。理由：原句的 `translate-y-4` 是写死 `transform` 的工具类，与 §3.11.2 同节要求的 `translate-x-[-50%] translate-y-[-50%]` 居中**互斥**，二者实装只能留其一；语义（面板自下方淡入、不跳位、reduced-motion 1ms 淡入）**一字未动**。
> 修订（v1.0 内 · §3.11.2「尺寸」一行 + §1.12.3 白名单 · **本条改动像素级验收值（App 侧弹层每侧留距 16.6px→24px）并把「App 弹层没有高度上限」这桩缺陷修掉，不是“非规范变更”**）：依 `04-adjudications.md` **A-86 #319（用户本人拍的选项 4C：只在 App 侧做留距、Web 不动）** + **A-91（留距数值 24px、`@supports (height: 100dvh)` 双声明 + preset `maxHeight.dialog` 的机制、以及「Web 不动 = 计算值不变而非类串不变」的口径，裁决人＝TPM）**。实装落点 = `packages/ui/src/styles/tokens.css`、`packages/ui/src/tailwind-preset.ts`、`packages/ui/src/primitives/dialog.tsx:74`、`apps/app/src/styles/app.css`（第 4 条白名单）；连带把 F-28 那颗「触发式观察项」在同轮转正（其触发条件——App 出现 `@tm/ui` 弹层消费者——实测早已成立：`ConfirmSheet` 六处消费者）。修订时刻实测 = 2026-09-23 03:52:17。
> 适用对象：`apps/web`（Next.js + Tailwind + shadcn/ui）、`mobile-memory`（Capacitor + React）、`packages/ui`
> 约束来源：`01-prd.md` v1.4、`00-user-review.md`、`02-tech-design.md`
> 本文件是唯一视觉真源。开发 agent 不需要再问任何视觉问题；如本节与代码现状冲突，以本文件为准并提 PR 修正。

## 章节清单（全部已完成）

- [x] 1. 设计 Token（精确值）
- [x] 2. 栅格与断点
- [x] 3. 逐页规范（3.1 ~ 3.11）
- [x] 4. 双端复用与差异表
- [x] 5. 深色模式规范
- [x] 6. 文案与术语对照表
- [x] 7. 无障碍与触控清单
- [x] 8. 视觉验收判据
- [x] 9. 给开发的两句话

**本文件内已裁决并写死的上游冲突（不再回头问需求方）**：D-1 品牌色取绿弃紫（§1.0）、D-2 紫色 ramp 改名换值（§1.0）、D-3 主题仅三态（§1.0）、D-4 tab 用两字标签 + 顶栏用全称（§3.10.1，PRD R-08 ① `学习` vs R-18 ① `学习情况`）、D-5 单词本排序/筛选项以架构 §7.1 为准（§3.6）、D-6 新增 6 个 patterns + `slider` 已在 §3.11 与 §9 登记。
**一条视觉侧声明的实现限制（见 §6.4 背词表末行）**：R-14 ⑥ 的"点这里安装/切换系统英文语音"在 Web 端无法直达系统 TTS 设置，因此 Web 落到帮助区（App 落 `Intent` 到系统设置）；两端都必须给出可点入口，不得只 toast —— 这是本文件对 R-14 ⑥ 的实现口径，不是降级。

---

## 1. 设计 Token

> 单一真源：`packages/ui/src/styles/tokens.css`（变量）+ `packages/ui/src/tailwind-preset.ts`（映射成语义类）。
> 两端宿主（`apps/web/src/app/globals.css`、`apps/app/src/styles/app.css`）只允许 `@import '@tm/ui/styles/tokens.css'` + `@tailwind` + 宿主级≤10 行覆盖（覆盖仅限 §1.12.3 白名单），**不得再定义任何颜色**。
> 落地形态与架构 §3.2 / §3.4 一致：变量存 **HSL 三元组**，Tailwind 侧写 `hsl(var(--x))`；组件只用 §1.12.2 的语义类。

### 1.0 三条定案（先说结论，避免开发自行选择）

| # | 决策 | 定案 | 影响的现状事实 |
|---|---|---|---|
| D-1 | **品牌色只有一套，取绿色**（App 现主色为基准） | `--brand` = `#0f6b5c`（浅）/ `#56c2ab`（深） | `apps/web/src/app/globals.css:13` 的 `--primary: 262 83% 58%`（紫 `#8b5cf6`）、`:36` 暗色 `262 83% 66%` → 全部改指本规范绿色；`.dark` 套同步 |
| D-2 | **紫色全站退役，不做"紫+绿"双色** | `apps/web/tailwind.config.ts:10-22` 的 `brand.*` 十级紫 ramp（全站 0 处使用）→ **改名为绿色 ramp**（值见 §1.2），保留键名 `brand-50…950`，只换值。任何 `#8b5cf6 / #7c3aed / 262 83%` 出现在源码即判违规 | 该 ramp 从未被使用，改名值零回归成本；架构 §3.4 示例代码块里的 `--brand: 262 83% 58%` 是**占位示例**，以本文件为准（变量名/分层不动） |
| D-3 | **主题只有三态：浅色 / 深色 / 跟随系统**（§6 第 6 条不做自定义主题） | 底座不提供任何配色选择器 UI；唯一开关为 `light｜dark｜system` 三值（Web 顶栏"更多"抽屉一处、App「我的」设置一处），实现走 `@tm/ui/hooks/use-theme-toggle`，首帧禁闪白见 §5.3 | `components/theme-provider.tsx`（`useEffect` 切类 → 必闪白）按架构 §7.2 删除 |

**目标感受（写死，供走查对齐）**：清晨、克制、可信。大面积留白 + 单一视觉焦点（首页只有搜索框是"可交互重色"，其余为灰阶）+ 一层低饱和品牌柔光。**低饱和 ≠ 灰暗**：品牌色只出现在"可交互/正在进行"的地方，静止信息一律灰阶 + 一处语义色。

### 1.1 语义色板（浅色，两套中的第 1 套）

| 语义 | Hex | 写入 CSS 变量（HSL 三元组，可直接粘贴） | Tailwind 语义类 | 用途 |
|---|---|---|---|---|
| bg（页面底） | `#f6f8f7` | `--bg: 150 12% 97%` | `bg-bg` | 全站底色，装饰层渐变铺在此之上 |
| surface（卡/面板） | `#ffffff` | `--surface: 0 0% 100%` | `bg-surface` | 卡片、弹层、输入框聚焦底 |
| surface-sunken（下沉面） | `#eef2f0` | `--surface-sunken: 150 13% 94%` | `bg-sunken` | 输入框静置底、骨架屏底、分段控件槽、表格隔行 |
| surface-brand（品牌柔面） | `#e6f2ef` | `--brand-soft: 165 32% 93%` | `bg-brand-soft` | 词性标签、选中态行、胶囊底 |
| ink（主文本） | `#14211d` | `--ink: 162 25% 10%` | `text-ink` | 一切正文/标题/词头 |
| ink-muted（次文本） | `#5b6b66` | `--ink-muted: 161 8% 39%` | `text-ink-muted` | 说明、时间、12px 灰字、空态文案 |
| hair（描边/分隔） | `#dde4e1` | `--hair: 154 11% 88%` | `border-hair` | 1px 描边、分隔线、骨架屏描边 |
| brand（主色/可交互） | `#0f6b5c` | `--brand: 170 75% 24%` | `bg-brand` / `text-brand` | 主按钮、链接、进度条、选中 tab |
| brand-strong（按压态） | `#0a483e` | `--brand-strong: 170 76% 16%` | `bg-brand-strong` | active/pressed |
| on-brand（品牌面上的字） | `#ffffff` | `--on-brand: 0 0% 100%` | `text-on-brand` | 主按钮文字 |
| focus-ring | `#0f6b5c` | `--focus: 170 75% 24%` | `ring-focus`（2px，offset 2px） | 唯一焦点样式，禁 `outline:none` 裸消失 |
| success | `#157f4a` | `--success: 150 72% 29%` | `text-success` / `bg-success` | 已掌握、打卡成功、同步完成 |
| warning | `#8a5000` | `--warning: 35 100% 27%` | `text-warning` | 提醒关闭、离线待补传、词数偏少 |
| destructive | `#b3261e` | `--danger: 3 71% 41%` | `text-danger` / `bg-danger` | 删除、错误文本、评分"忘记" |
| success-tint / warning-tint / danger-tint | `#eaf6ef` / `#fbeeda` / `#fbe9e7` | `--success-soft: 145 40% 94%`；`--warning-soft: 36 80% 92%`；`--danger-soft: 6 71% 95%` | `bg-success-soft` 等 | 状态标签/评分按钮的底色；上面的文字一律用对应深色（对比度见 §1.4） |

**必须替换的现存值**（App → token 迁移）：`--bg #ffffff`→`#f6f8f7`（页面底）/`#ffffff`（卡面，二者原本混用一个变量）；`--text #111111`→`#14211d`；**`--muted #8a8f98`→`#5b6b66`**（旧值白底对比仅 3.25:1，全线不达标，是本期最大的一处无障碍缺陷）；`--field #f4f5f6`→`#eef2f0`；`--hairline rgba(0,0,0,.08)`→`#dde4e1`（半透明描边在深色下失效，禁再使用 rgba 描边）；`--danger #d64540`→`#b3261e`；`--primary-soft rgba(15,107,92,.09)`→`#e6f2ef`；`--radius 16px`→按 §1.8 分档。

### 1.2 品牌 ramp（`brand-50…950`，两端共用，仅用于渐变装饰层与图表）

| 级 | Hex | HSL 三元组 | 用途 |
|---|---|---|---|
| 50 | `#eef7f4` | `160 36% 95%` | 装饰层渐变最亮端 |
| 100 | `#d7ece6` | `163 36% 88%` | 装饰层、hover 柔面 |
| 200 | `#aedbd0` | `165 38% 77%` | 图表 series-3（深色下改用 dark ramp） |
| 300 | `#7fc4b5` | `167 37% 63%` | 热力图 L3 |
| 400 | `#4fa897` | `169 36% 48%` | 装饰层中段（**禁止用作白底文字**：2.85:1 不达标） |
| 500 | `#0f6b5c` | `170 75% 24%` | = `--brand` |
| 600 | `#0c5a4d` | `170 76% 20%` | 深色 ramp 的过渡（Web 渐变用） |
| 700 | `#0a483e` | `170 76% 16%` | = `--brand-strong`；热力图 L4（浅） |
| 800 | `#08372f` | `170 75% 12%` | 装饰层深端 |
| 900 | `#062922` | `168 74% 9%` | 深色模式的 on-brand 文字底 |
| 950 | `#031610` | `161 76% 5%` | 仅 logo/图形内部 |

`--search-h`、`--tap` 等尺度层沿用架构 §3.4 命名，值定死：`--tap: 44px`、`--search-h: 50px`、`--tab-h: 56px`、`--topbar-h: 56px`。

### 1.2.1 图表 / 热力图专用 token（`tokens.css` 内，明暗两套各一份）

> 目的：图表与热力图**只允许**读下面这 14 个变量；`recharts` 的 `stroke` / `fill` / `Cell` 一律 `var(--chart-*)` 字符串（recharts 支持 CSS 变量着色）。任何 `.tsx` 里出现 `#0f6b5c`、`rgba(15,107,92,` 之类字面量 = §8 的 grep 判据不通过。

| 变量 | 浅色值 | 深色值 | 用途 |
|---|---|---|---|
| `--chart-1` | `170 75% 24%` `#0f6b5c` | `167 47% 55%` `#56c2ab` | 主 series（增长曲线线色、柱填充、"本周新增"） |
| `--chart-2` | `169 50% 37%` `#2f8f79` | `166 40% 68%` `#7fd0bd` | 次 series / 主 series 的填充端（面积渐变下段） |
| `--chart-3` | `167 37% 63%` `#7fc4b5` | `168 33% 38%` `#41756a` | 第三 series、面积渐变上段、hover 光晕 |
| `--chart-4` | `161 8% 39%` 灰 | `= --ink-muted`（`160 8% 63%`） | 对比 / 上期 series（永远不是强调色） |
| `--chart-5` | `35 100% 27%` 琥珀 | `= --warning`（`34 68% 69%`） | **仅**"提醒/待复习"语义一色；一屏最多一次 |
| `--chart-danger` | `3 71% 41%` `#b3261e`（白底 6.53:1） | `= --danger`（`0 73% 78%`） | 遗忘曲线 / 错误标注线 |
| `--chart-grid` | `154 11% 88%` | `= --hair`（`160 13% 18%`） | 网格线、坐标轴细线（1px，非文本，仅作分隔） |
| `--chart-axis` | `161 8% 39%` | `= --ink-muted`（`160 8% 63%`） | 轴刻度文字（12px，surface 上 ≥4.5:1） |
| `--heat-1` | `162 20% 80%` `#c2d8d1` | `165 18% 20%` `#2a3b36` | 热力图最低档 |
| `--heat-2` | `167 37% 63%` `#7fc4b5` | `166 19% 30%` `#3d5a51` | 第二档 |
| `--heat-3` | `169 50% 37%` `#2f8f79` | `167 47% 55%` `#56c2ab` | 第三档 |
| `--heat-4` | `170 76% 16%` `#0a483e` | `160 48% 83%` `#bde8dd` | 最高档 |
| `--heat-empty` | `transparent` + 1px dashed `--hair` | `transparent` + 1px dashed `--hair` | **L0 未打卡**：用"形状"而不是"更浅的颜色"承载"无" |
| `--heat-future` | `transparent`，无描边 | `transparent`，无描边 | 未来日（不可点、不读、不进无障碍树） |

**热力图可达性硬规则**（§7 会复述）：五级色阶的相邻亮度比只有 1.2–1.4，**不满足** 1.4.11 的 3:1，因此**禁止把颜色作为唯一信息通道**。三处必须同时存在：① L0 用虚线框（形状通道）；② 图例文字写明"少 → 多 + 数值区间"；③ 每个格子 `aria-label="2026/05/12 · 背词 4 次"`，点按信息条复述同一句。缺任一处即判 §8 视觉验收不通过。

### 1.3 语义色板（深色，两套中的第 2 套）

写在 `tokens.css` 的 `.dark` 块内，**变量名与 §1.1 完全一致**（组件不感知主题，见 §5.1）。

| 语义 | Hex | HSL 三元组（`.dark` 覆盖值） |
|---|---|---|
| bg | `#0c1412` | `--bg: 165 25% 6%` |
| surface | `#131c1a` | `--surface: 167 19% 9%` |
| surface-sunken | `#1b2522` | `--surface-sunken: 162 16% 13%` |
| brand-soft | `#14312b` | `--brand-soft: 168 42% 14%` |
| ink | `#e8efec` | `--ink: 155 20% 88%` |
| ink-muted | `#9aa9a4` | `--ink-muted: 160 8% 63%` |
| hair | `#27332f` | `--hair: 160 13% 18%` |
| brand | `#56c2ab` | `--brand: 167 47% 55%` |
| brand-strong | `#7fdcb8` | `--brand-strong: 157 57% 68%` |
| on-brand（品牌面上的字） | `#06231c` | `--on-brand: 166 71% 8%`（深色下主按钮是浅绿底 + 深绿字，反转） |
| focus | `#7fdcb8` | `--focus: 157 57% 68%` |
| success | `#79c9a4` | `--success: 152 43% 63%` |
| warning | `#e6b87a` | `--warning: 34 68% 69%` |
| danger | `#f0a0a0` | `--danger: 0 73% 78%` |
| 三态 tint | `success-soft #16302a` / `warning-soft #2f2517` / `danger-soft #2b1614` | `--success-soft: 166 37% 14%`；`--warning-soft: 33 34% 14%`；`--danger-soft: 6 34% 13%` |

深色硬规则：**不允许把浅色套的 tint/hair 值直接搬进 dark**；`--bg` 与 `--surface` 的亮度差恒定 ≥ 3 个 L 百分点，靠色差分层而非阴影（深色下阴影无效，见 §1.9）。

### 1.4 对比度自查表（R-22 ① 的 12 个关键文本节点 + 补充；全部 ≥4.5:1）

| # | 文本节点 | 前景 / 背景 | 比值 | 判定 |
|---|---|---|---|---|
| 1 | 首页 slogan 18px/600 | `#14211d` / `#f6f8f7` | 15.56 | ✅ |
| 2 | 搜索框 placeholder 15px | `#5b6b66` / `#eef2f0` | 4.97 | ✅ |
| 3 | 搜索框输入值 15px | `#14211d` / `#ffffff` | 16.60 | ✅ |
| 4 | 胶囊「今天还有 N 词要背」13px/600 | `#0f6b5c` / `#e6f2ef` | 5.59 | ✅ |
| 5 | 结果条码目/词头 20-30px | `#14211d` / `#ffffff` | 16.60 | ✅ |
| 6 | 结果条首义与音标 13px | `#5b6b66` / `#ffffff` | 5.62 | ✅ |
| 7 | 词性标签 12px/700 | `#0f6b5c` / `#e6f2ef` | 5.59 | ✅ |
| 8 | 主按钮文字 15px/600（浅） | `#ffffff` / `#0f6b5c` | 6.41 | ✅ |
| 9 | 四档评分「忘记」14px/700 | `#b3261e` / `#fbe9e7` | 5.58 | ✅ |
| 10 | 四档评分「困难」 | `#8a5000` / `#fbeeda` | 5.68 | ✅ |
| 11 | 四档评分「良好」 | `#0f6b5c` / `#e6f2ef` | 5.59 | ✅ |
| 12 | 四档评分「轻松」 | `#157f4a` / `#f0f9f4` | 4.69 | ✅（注意：文字必须用 `#157f4a`，底用 `#f0f9f4`；若底改用 `#eaf6ef` 则 4.44 ❌ → 禁用该组合） |
| 13 | 完成页大数字 34px/800 | `#14211d` / `#ffffff` | 16.60 | ✅ |
| 14 | 词本行首义 13px | `#5b6b66` / `#ffffff` | 5.62 | ✅ |
| 15 | 底部 12px 备案灰字 | `#5b6b66` / `#f6f8f7` | 5.26 | ✅ |
| 16 | 错误文案 13px | `#b3261e` / `#ffffff` | 6.54 | ✅ |
| 17 | 「已掌握」标签文字 | `#157f4a` / `#f0f9f4` | 4.69 | ✅ |
| 18 | 焦点环 2px 描边（非文本，1.4.11） | `#0f6b5c` / `#f6f8f7` | 6.01 | ✅（深色：`#56c2ab` / `#131c1a` = 8.03 ✅） |
| 19 | 选中/未选中 tab 文字（非文本对比靠字重，仍测文字） | `#0f6b5c`、`#5b6b66` / `#ffffff` | 6.41、5.62 | ✅；两者互比仅 1.14 → 必须叠加字重与 `aria-current`（§7.9） |
| D1 | 深色：正文 | `#e8efec` / `#131c1a` | 13.68 | ✅ |
| D2 | 深色：次文本 | `#9aa9a4` / `#131c1a` | 7.10 | ✅ |
| D3 | 深色：主按钮文字 | `#06231c` / `#56c2ab` | 7.67 | ✅ |
| D4 | 深色：链接/品牌文字 | `#56c2ab` / `#131c1a` | 8.03 | ✅ |
| D5 | 深色：危险文字 | `#f0a0a0` / `#131c1a` | 8.47 | ✅ |
| D6 | 深色：警告文字 | `#e6b87a` / `#131c1a` | 9.52 | ✅ |
| D7 | 深色：成功文字 | `#79c9a4` / `#131c1a` | 8.86 | ✅ |
| D8 | 深色：placeholder | `#9aa9a4` / `#1b2522` | 6.43 | ✅ |

**图形对象（非文本）≥3:1**：icon `#5b6b66`/`#ffffff` = 5.62 ✅；输入框描边 `#dde4e1` 属"纯装饰描边"，可不承担信息；**承担选中信息的描边必须用 `--brand`**（`#0f6b5c`/`#f6f8f7` = 6.01 ✅）。热力图最低档与图表 series 的 3:1 自查见 §5.2/§3.11.6。
**明确禁止**（会被判不通过）：`#4fa897`、`#7fc4b5`、`#8a8f98`、`#6b7280`、`#9aa0a6` 出现在任何文本或 placeholder 上。

### 1.5 字体族与字号阶梯

**字体族（两端逐字符同一份，写在 `tokens.css`）**：

```css
--font-sans: "PingFang SC", "HarmonyOS Sans SC", "MiSans", "Source Han Sans SC",
             "Noto Sans SC", "Microsoft YaHei", system-ui, -apple-system,
             "Segoe UI", Roboto, sans-serif;
--font-latin: "SF Pro Text", -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
              Arial, var(--font-sans);   /* 英文词头/音标/例句用，中文栈兜底 */
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", monospace;
```

- **不加载任何 webfont / 不引外链 CDN 字体**（`file://` 离线必须可用，R-17 ①）。谁写 `@font-face` + 远程 url 即判违规。
- 英文词头、例句、音标一律 `--font-latin`；中文文本用 `--font-sans`；数字（进度、计数、日期）一律加 `font-variant-numeric: tabular-nums`（Tailwind 语义工具类 `tnum`，preset 内定义）。

**字号阶梯（同一份，两端共用；"移动"列是 App/窄屏 Web 的落地值，"桌面"列是 ≥1024px）**：

| Token | Tailwind 类 | 桌面 | 移动 | 字重 | 行高 | 用途 |
|---|---|---|---|---|---|---|
| `display` | `text-display` | 32px | 28px | 800 | 1.15，字距 `-0.4px` | 词头（详情页/卡正面）、完成页大数字 34px 单点例外 |
| `h1` | `text-h1` | 22px | 20px | 800 | 1.3，`-0.2px` | 顶栏标题、页面主标题 |
| `h2` | `text-h2` | 18px | 17px | 700 | 1.4 | 区块标题、卡内分组标题 |
| `h3` | `text-h3` | 16px | 15.5px | 700 | 1.4 | 行标题（词本词条、义项首行） |
| `body` | `text-body` | 15px | 15px | 400 | 1.6 | 正文、输入文字、按钮外的一切默认字号 |
| `body-strong` | `text-body font-semibold` | 15px | 15px | 600 | 1.6 | 例句英文、次要强调 |
| `sm` | `text-sm` | 13px | 13px | 400/500 | 1.6 | 辅助说明、时间、首义摘要、toast |
| `xs` | `text-xs` | 12px | 12px | 400/500/600 | 1.55 | 标签、词性、图例、底部备案灰字 |
| `2xs` | `text-2xs` | 11px | 11px | 500 | 1.45 | 热力图月份轴、评分按钮下方小字、验证码小字（**仅限非正文装饰，11px 文本必须 ≤1 行**） |

- 桌面 15px 而非 16px：与 App 现状（`style.css:21` 15px）对齐，两端"同一产品"的第一观感。`html { font-size: 16px }` 保持不动，preset 的字号用 **px 值显式声明**（`{ fontSize: { display: ['2rem','1.15'] … } }` 换算见 §1.12.2），避免宿主 root 字号漂移。
- **Tailwind 默认档同时被 preset 覆写**（两端一致，避免 §3 各节写 `text-sm` 时落到 14px）：`text-xs=12px`、`text-sm=13px`、`text-base=15px`、`text-lg=17px`、`text-xl=20px`、`text-2xl=24px`。语义名（`text-display/h1/h2/h3/body/2xs`）**优先**用于新写的组件；页面级规范里出现默认档名不算违规，但其值必须是左列。`text-2xs` = 11px（新增档）。
- 不允许出现阶梯外的字号（含 `text-[13.5px]` 这类任意值）；现有 `style.css` 里的 `14.5 / 12.5 / 13.5 / 11.5` 一律就近归入阶梯（→ 15 / 13 / 13 / 11）。
- **不做字号缩放面板**（§6 第 6 条），但**允许系统/浏览器缩放**（§7 第 5 条：去掉 `user-scalable=no`）。

### 1.6 字重 / 行高 / 字距

- 字重只用 **400 / 500 / 600 / 700 / 800** 五档（系统字体可变字重；700 以下差异小，500 与 400 不可在同一列并排出现）。
- 行高：正文类 1.6、标题类 1.3-1.4、标签类 1.5；**任何多行文本行高 < 1.4 判为缺陷**。
- 字距：仅大字号负字距（display `-0.4px`、h1 `-0.2px`）；中文正文禁止 letter-spacing；英文词头 `0`。
- 对齐：中文左对齐；数字列 `tabular-nums` + 右对齐；卡面词头居中，卡背一律左对齐（保留 App 现有正确行为 `style.css:157`）。

### 1.7 间距刻度（4px 基数，两端同一份）

| Token | 值 | Tailwind（preset） | 典型用途 |
|---|---|---|---|
| `--sp-0` | 0 | — | — |
| `--sp-1` | 4px | `p-1/gap-1` | 图标与文字之间 |
| `--sp-2` | 8px | `p-2/gap-2` | 标签内边距、按钮图标间距 |
| `--sp-3` | 12px | `p-3/gap-3` | 卡内次级间距、行内元素 |
| `--sp-4` | 16px | `p-4/gap-4` | **页面左右安全边距（移动）**、卡片内边距、卡间距 |
| `--sp-5` | 20px | `p-5/gap-5` | 桌面卡内边距、区块内元素 |
| `--sp-6` | 24px | `p-6/gap-6` | 桌面页面左右安全边距 |
| `--sp-8` | 32px | `p-8/gap-8` | 区块之间（section-to-section） |
| `--sp-10` | 40px | `p-10` | 首页视觉区上下留白（搜索框上方） |
| `--sp-12` | 48px | `p-12` | 二级页顶部留白、空态上下留白 |
| `--sp-16` | 64px | `p-16` | 完成页/登录页上下留白 |

规则：① 相邻同级元素 12px，卡内 16/20px，卡间 12px（移动）/16px（桌面），区块间 32px；② **禁止 13/14/18/22/26px 等刻度外间距**，也禁止 `mt-[13px]` 式任意值；③ 列表底部安全留白 = `calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px)`（移动），杜绝 App 现状 `padding-bottom:130px` 的死占位；④ `env(safe-area-inset-*)` 只允许出现在 §2.4 列出的四处。

### 1.8 圆角

| Token | 值 | 用途 | Tailwind |
|---|---|---|---|
| `--r-xs` | 6px | 词性小标签、图例方块 | `rounded-xs` |
| `--r-sm` | 8px | 标签、chips、内嵌小按钮 | `rounded-sm` |
| `--r-md` | 10px | 输入框内按钮、菜单项、列表行 | `rounded-md` |
| `--r-lg` | 14px | 卡片、对话框、抽屉、弹层（= 架构 §3.4 `--radius-lg`） | `rounded-lg` |
| `--r-xl` | 18px | 一级大卡（背词卡、统计卡、结果条容器） | `rounded-xl` |
| `--r-full` | 999px | 搜索框、胶囊、tab 图标底、toast、评分条外框 | `rounded-full` |

- 深色/浅色圆角不变。同一容器内子元素圆角 = 父圆角 − 父内边距（最小 6px），禁止内外同圆角。
- 现存 `--radius: 0.75rem`（shadcn）、`20px`（App `rv-card`）、`16px`（App card）、`12px`（按钮）→ 一律映射到上表；App 卡面 `20px→18px`，卡 `16px→14px`。

### 1.9 阴影与描边

| Token | 浅色值 | 深色值 | 用途 |
|---|---|---|---|
| `--elev-0` | `none` | `none` | 页面内静态卡：**只用 1px `border-hair` 描边**（描边是默认层级手段） |
| `--elev-1` | `0 1px 2px hsl(162 25% 10% / .04), 0 1px 3px hsl(162 25% 10% / .06)` | `none`（改由 `--surface-sunken` 色差 + 1px hair 承担） | 悬起卡、列表浮层 |
| `--elev-2` | `0 8px 24px hsl(162 25% 10% / .10)` | `0 8px 24px hsl(165 25% 2% / .55)` | 弹层、抽屉、对话框、toast |
| `--elev-brand` | `0 4px 18px hsl(170 75% 24% / .10)` | `0 4px 18px hsl(167 47% 55% / .16)` | 搜索框聚焦（品牌柔光，唯一带色的阴影） |

规则：① 阴影只表达"离地高度"，**不得用于装饰性彩色投影**；② 深色下正文卡不用阴影分层（App/网页深色统一"色差 + 描边"）；③ `--elev-*` 由 preset 暴露为 `elev-1`/`elev-2` 工具类，禁止组件内写 `shadow-*` 调色板类；④ 现有 App 的 `0 12px 34px rgba(20,30,28,.14)` → `--elev-2`。

### 1.10 层级（z-index）表

| 层 | 值 | Tailwind（preset `zIndex`） | 内容 | 备注 |
|---|---|---|---|---|
| base | 0 | `z-base` | 页面流内容 | — |
| sticky | 10 | `z-sticky` | 顶栏（Web ≥768px）、页内粘性工具条（词本搜索/排序行） | `backdrop-blur` 允许，须带 `bg-bg/85` |
| dock | 30 | `z-dock` | 底部 tab（移动）、App 首页搜索 dock、结果条吸底 | App 现 `search-dock:30` 保持 |
| mask | 40 | `z-mask` | 遮罩层 | 全屏、`bg-ink/40`（深色 `#000/60`） |
| drawer | 50 | `z-drawer` | 「更多」抽屉、BottomSheet、ConfirmSheet | 高于 mask |
| dialog | 60 | `z-dialog` | 对话框（登录/注册/激活/强制改密/清空确认） | 强制改密对话框形态时同层，禁用 mask 关闭 |
| pop | 70 | `z-pop` | 最近查询面板、下拉筛选、tooltip | 面板类必须 < dialog（80），避免登录弹窗被面板盖住 |
| toast | 80 | `z-toast` | Toast / 撤销条 / 同步提示 | 单实例（新的替换旧的），**撤销 toast 必须可点且不被自身消失**，见 §3.11.1 |
| busy | 90 | `z-busy` | 顶部进度条（加载条） | 高于 toast |

- 禁止任何组件写 `z-[9999]`；新增层级须回来改本表。
- App 原生小组件与通知不涉及；`res/values*` 与 CSS 层级的对应见 §5.4。

### 1.11 动效时长、缓动与 reduced-motion 降级

| Token | 值 | 缓动 | 用途 |
|---|---|---|---|
| `--dur-tap` | 90ms | `linear` | 按压 `scale(.97)`（保留 App 现状手感） |
| `--dur-micro` | 120ms | `cubic-bezier(.2,.8,.3,1)` | hover/active 色变、选中态、复选框 |
| `--dur-enter` | 180ms | `cubic-bezier(.2,.8,.3,1)` | 弹层出现、最近查询面板展开、结果条淡入上移 8px |
| `--dur-exit` | 140ms | `cubic-bezier(.4,0,1,1)` | 弹层消失（比出现快） |
| `--dur-move` | 240ms | `cubic-bezier(.4,0,.2,1)` | 进度条宽度过渡、tab 指示条、排序切换换位 |
| `--dur-sheet` | 280ms | `cubic-bezier(.2,.8,.3,1)` | BottomSheet / 抽屉滑入 |
| `--dur-breath` | **24s**（≥20s 硬指标） | `ease-in-out`，`infinite alternate` | 首页装饰层唯一周期动效：柔光斑位移 ≤24px + 透明度 0.90↔1.00 |
| `--dur-spin` | 900ms | `linear`，`infinite` | spinner 旋转（§3.7 刷新、§3.9 提交中、§3.11.7）；reduced-motion 下归 0s = **静止环**，组件必须同时改用它对应的 `aria-busy` + 文案表达进度（不得只留一个不动的圈） |
| `--dur-skeleton` | 1400ms | `linear`，`infinite` | 骨架 shimmer（= §1.11 末"shimmer 周期 1.4s"的同一个值） |

**本文件（含 §3 各节）使用的三个书写别名 —— 在 `tokens.css` 里就是 `var()` 别名，不是第二套值**：`--dur-fast ≡ var(--dur-micro)`（120ms）、`--dur-base ≡ var(--dur-move)`（240ms）、`--dur-instant ≡ var(--dur-tap)`（90ms）。§3 里出现别名处，实现时可直接写别名（已随 tokens.css 定义），也可改写为规范名；**禁止**在组件里再声明第四个时长字面量。

缓动曲线只允许上述三条 + `linear/ease-in-out`；`tailwind.config.ts` 现有 `flip-in`（3D 翻面）**删除**（§6 第 5 条：翻面零延迟，不做 3D；`globals.css` 的 `.perspective-1000/.preserve-3d/.backface-hidden/.rotate-y-180` 四个类一并删除，卡背切换用"内容直接替换 + `--dur-micro` 淡入"）。`shimmer` 保留但周期改为 **1.4s** 且色值取 token（§3 各节加载态）。

**`@media (prefers-reduced-motion: reduce)` 降级值（写死，全局一条）**：

```css
@media (prefers-reduced-motion: reduce) {
  :root { --dur-tap:1ms; --dur-micro:1ms; --dur-enter:1ms; --dur-exit:1ms;
          --dur-move:1ms; --dur-sheet:1ms; --dur-breath:0s;
          --dur-spin:0s; --dur-skeleton:0s; }   /* 别名经 var() 自动跟随，无需再写一遍 */
  .decor-breath { animation: none !important; }        /* 呼吸动效完全停止，不是变慢 */
  * { transition-duration: 1ms !important; }
  .flip, .slide { transform: none !important; }        /* 翻面/滑入退化为直接显示 */
}
```

- 判据：reduced-motion 下首页 `getComputedStyle` 的装饰层 `animation-name` 必须为 `none`（R-22 ④）。
- **禁止清单（出现即返工）**：粒子、`<video autoplay>`、鼠标/滚动跟随、逐字弹跳、打字机式文字动画、超过一层的并发动画、时长 >400ms 的功能性动效、`scroll-behavior` 之外的自动滚动。唯一例外：AI 记法展开时的"淡入"（180ms），不做逐字流式（首页 AI 卡已搬走，`GET /api/tutor` 一次性返回）。

### 1.12 Token 落地

#### 1.12.1 `packages/ui/src/styles/tokens.css`（变量层，唯一颜色真源）

```css
:root {
  color-scheme: light;
  /* 语义色（浅色套 = §1.1） */
  --bg: 150 12% 97%;      --surface: 0 0% 100%;   --surface-sunken: 150 13% 94%;
  --brand-soft: 165 32% 93%;
  --ink: 162 25% 10%;     --ink-muted: 161 8% 39%; --hair: 154 11% 88%;
  --brand: 170 75% 24%;  --brand-strong: 170 76% 16%; --on-brand: 0 0% 100%;
  --focus: 170 75% 24%;
  --success: 150 72% 29%; --warning: 35 100% 27%;  --danger: 3 71% 41%;
  --success-soft: 145 40% 94%; --success-soft-strong: 147 43% 96%;
  --warning-soft: 36 80% 92%;  --danger-soft: 6 71% 95%;
  /* 图表 / 热力图（§1.2.1，浅色套） */
  --chart-1: 170 75% 24%; --chart-2: 169 50% 37%; --chart-3: 167 37% 63%;
  --chart-4: 161 8% 39%;  --chart-5: 35 100% 27%; --chart-danger: 3 71% 41%;
  --chart-grid: 154 11% 88%; --chart-axis: 161 8% 39%;
  --heat-1: 162 20% 80%; --heat-2: 167 37% 63%; --heat-3: 169 50% 37%; --heat-4: 170 76% 16%;
  /* L0 未打卡 = transparent + 1px dashed --hair（形状通道，见 §1.2.1 硬规则）；未来日 = transparent 无描边 */
  /* 装饰层（低饱和品牌渐变，两端同一份） */
  --decor-a: 160 36% 95%;  --decor-b: 163 36% 88%;  --decor-c: 169 36% 48%;
  /* 尺度层（§1.7/§1.8/§1.9/§1.11；两端禁止覆写） */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px;
  --sp-8:32px; --sp-10:40px; --sp-12:48px; --sp-16:64px;
  --r-xs:6px; --r-sm:8px; --r-md:10px; --r-lg:14px; --r-xl:18px; --r-full:999px;
  --elev-1: 0 1px 2px hsl(162 25% 10% / .04), 0 1px 3px hsl(162 25% 10% / .06);
  --elev-2: 0 8px 24px hsl(162 25% 10% / .10);
  --elev-brand: 0 4px 18px hsl(170 75% 24% / .10);
  --tap: 44px; --search-h: 50px; --tab-h: 56px; --topbar-h: 56px; --field-h: 48px;
  --dur-tap:90ms; --dur-micro:120ms; --dur-enter:180ms; --dur-exit:140ms;
  --dur-move:240ms; --dur-sheet:280ms; --dur-breath:24s;
  --dur-spin:900ms; --dur-skeleton:1400ms;              /* 见 §1.11 表 */
  --dur-fast: var(--dur-micro); --dur-base: var(--dur-move); --dur-instant: var(--dur-tap);
  --ease-standard: cubic-bezier(.2,.8,.3,1);
  --ease-decelerate: cubic-bezier(.4,0,.2,1);
  --ease-accelerate: cubic-bezier(.4,0,1,1);
  --font-sans: "PingFang SC","HarmonyOS Sans SC","MiSans","Source Han Sans SC","Noto Sans SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-latin: "SF Pro Text",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,var(--font-sans);
  --font-mono: ui-monospace,"SF Mono",Menlo,Consolas,"Cascadia Mono",monospace;
}
.dark {
  color-scheme: dark;
  --bg: 165 25% 6%;       --surface: 167 19% 9%;  --surface-sunken: 162 16% 13%;
  --brand-soft: 168 42% 14%;
  --ink: 155 20% 88%;     --ink-muted: 160 8% 63%; --hair: 160 13% 18%;
  --brand: 167 47% 55%;  --brand-strong: 157 57% 68%; --on-brand: 166 71% 8%;
  --focus: 157 57% 68%;
  --success: 152 43% 63%; --warning: 34 68% 69%;  --danger: 0 73% 78%;
  --success-soft: 166 37% 14%; --success-soft-strong: 166 37% 14%;
  --warning-soft: 33 34% 14%;  --danger-soft: 6 34% 13%;
  /* 图表 / 热力图（§1.2.1，深色套；与 §1.3 同名的直接复用值） */
  --chart-1: 167 47% 55%; --chart-2: 166 40% 68%; --chart-3: 168 33% 38%;
  --chart-4: 160 8% 63%;  /* = --ink-muted */
  --chart-5: 34 68% 69%;  /* = --warning */ --chart-danger: 0 73% 78%; /* = --danger */
  --chart-grid: 160 13% 18%; /* = --hair */ --chart-axis: 160 8% 63%; /* = --ink-muted */
  --heat-1: 165 18% 20%; --heat-2: 166 19% 30%; --heat-3: 167 47% 55%; --heat-4: 160 48% 83%;
  --decor-a: 166 37% 10%; --decor-b: 168 42% 14%; --decor-c: 167 47% 55%;
  --elev-1: none;
  --elev-2: 0 8px 24px hsl(165 25% 2% / .55);
  --elev-brand: 0 4px 18px hsl(167 47% 55% / .16);
}
```

> **品牌 ramp 的变量形式**（`brand-50…950`）同时导出为 `--brand-50 … --brand-950`，仅供 `--elev`/渐变/图表使用；组件不得直接引用级别变量（只允许 `--brand*` 语义名）。

#### 1.12.2 `packages/ui/src/tailwind-preset.ts`（映射层）

| Tailwind 语义类 | 由 preset 生成 | 说明 |
|---|---|---|
| `bg-bg` `bg-surface` `bg-sunken` `bg-brand-soft` | `hsl(var(--*))` | 面 |
| `text-ink` `text-ink-muted` `text-brand` `text-success` `text-warning` `text-danger` `text-on-brand` | 同上 | 文字（`brand-soft` 上必须配 `text-brand`） |
| `border-hair` `border-brand` | 同上 | 描边 |
| `ring-focus` | `--focus` | 全局焦点环（2px / offset 2px） |
| `rounded-xs/sm/md/lg/xl/full` | `--r-*` | 覆写 shadcn 默认 `--radius` |
| `p-/m-/gap-*` 全部 | `--sp-*` | `spacing` 直接引用变量，禁任意值 |
| `elev-0/1/2/brand` | `boxShadow: {…}` | 禁 `shadow-md` 等原生类 |
| `text-display/h1/h2/h3/body/sm/xs/2xs` | §1.5 表 | 含行高；桌面值，`max-md:` 变体覆写为移动值（见 §2） |
| `z-base/sticky/dock/mask/drawer/dialog/pop/toast/busy` | §1.10 | 禁 `z-[...]` |
| `duration-tap/micro/enter/exit/move/sheet` + `ease-standard/decelerate/accelerate` | §1.11 | 禁 `duration-300` 之类数字类 |
| `tap-target` | `min-width:min-height:var(--tap)` | 供 §7 触控统一使用 |
| `tnum` | `font-variant-numeric: tabular-nums` | 数字对齐 |
| `decor-breath` | `animation: breath var(--dur-breath) …` | 唯一周期动效，keyframes 只在 preset 内定义 |

`packages/ui` 的 primitives 命名保持架构 §3.1 的 13 个（`button card input dialog avatar badge separator skeleton progress tabs switch label scroll-area`，另加 §3.11 登记的 `slider`）→ 迁到 `packages/ui/src/primitives/*`，**类名一律换成上表语义类**。

#### 1.12.3 宿主允许的唯一覆写白名单（超出即返工）

1. `apps/web`：`--topbar-h`、`--max-w-page`（§2.2）、`body { @apply bg-bg text-ink antialiased }`。
2. `apps/app`：`html { -webkit-text-size-adjust:100% }`、`env(safe-area-inset-*)` padding（仅 §2.4 四处）、`--tab-h`（刘海机 56→64px）、**第 4 条【A-91 for A-86 #319 的 4C】**`:root { --dialog-max-h: calc(100vh - var(--sp-6) * 2); }`（弹层上下留距各 24px；它是**读**尺度 token 组合出的一颗组件级高度上限，不是覆写 `--sp-*/--tap/--tab-h` 等尺度层本身，第 3 条的重定义禁令照旧生效）。
3. 两端都禁：重定义任何 `--bg/--surface/--ink/--hair/--brand/--success/--warning/--danger` 与任何 hex。

#### 1.12.4 grep 门禁（与 `tools/boundaries.mjs` 对齐，R-22 ③ / R-06 ③）

源码（`apps/**`、`packages/ui/**`、`mobile-memory/res/values*/colors.xml` 之外）**命中数必须 = 0** 的串：
`#8b5cf6` `#7c3aed` `#0f6b5c` `#d64540` `#188038` `#E6F4EA` `#ef4444` `#8a8f98` `#9aa0a6` `#1a73e8` `#e5e5e5` `#444` `#666` `#556` `262 83%` `text-gray-` `bg-gray-` `border-gray-` `bg-red-` `text-red-` `!important`（§1.11 reduced-motion 与 `!leading-none` 两处例外须逐条挂注释说明）`z-[` `duration-[` `p-\[` `text-\[1?[0-9]px\]`（任意值字号/尺寸）。
唯一允许出现 hex 的三个文件：`packages/ui/src/styles/tokens.css`、`packages/ui/src/tailwind-preset.ts`（图表色常量）、`mobile-memory/res/values*/colors.xml`（§5.4）。

## 2. 栅格与断点

### 2.1 断点（与 PRD §4.2 / 架构 §7.1 口径逐一对齐，Tailwind 默认刻度不额外造）

| 名称 | 宽度 | 导航形态 | 关键变化 |
|---|---|---|---|
| `xs` 手机 | `0–767px`（`max-md:`） | **底部 5 tab + 右上「更多」抽屉**（R-08 ①） | 单列、页边距 16px、字号取 §1.5「移动」列、卡片满宽、侧栏 0 处 |
| `md` 平板竖 / 大屏手机横 | `768–1023px` | 顶栏横排（5 项 + 更多） | 单列、页边距 24px；内容仍居中，不铺满 |
| `lg` 平板横 / 小笔电 | `1024–1279px` | 顶栏横排 | 一级列表页开始出现 2 列（词本 ≥1024 双列），**仍无侧栏** |
| `xl` 桌面 | `≥1280px` | 顶栏横排 | **唯一允许单词本可收起侧栏的宽度**（R-15 ⑨ / §4.1-7）；报告页图表 2×2 |

- **375px 与 412px 为强制实测档**（R-19 ④：两档宽度无横向滚动、无溢出）；另测 320px 不得破版（最小支持档）。
- 禁止 `sm`(640) 参与导航/侧栏决策；禁止任意值断点 `min-[900px]`。
- 判定归属：`xs` 归 App + 手机浏览器（两端同一套 CSS，App 就是 375/412 的 Web），`md+` 归 Web。

### 2.2 内容最大宽度（preset 暴露 `max-w-*` 语义名，宿主可覆写 `--max-w-page`）

| Token | 值 | 用在 |
|---|---|---|
| `--max-w-auth` | `420px` | 登录/注册/激活/强制改密表单列 |
| `--max-w-read` | `680px` | 首页视觉区（slogan + 搜索框 + 结果条）、背词卡列、词详情页正文、轻学情页 |
| `--max-w-list` | `900px` | 单词本一级页、更多抽屉内容列 |
| `--max-wide` | `1120px` | Web 完整分析报告页（P1 重排后）、App 大屏词本 + 侧栏整体 |
| 侧栏 | `320px`（固定，不参与缩放） | ≥1280px 单词本侧栏；收起后 0px（不留残余占位） |

- 所有居中列：`mx-auto w-full px-4 md:px-6`，**页面主体一律居中，禁止"内容贴左、右侧大片空白"的后台感**（这是"没做完的后台管理系统"观感的第二大来源，仅次于配色）。
- 首页搜索列：`max-w-read` 内部再限 `max-width: 560px`（搜索框 + slogan + 胶囊同一列，宽度一致）。

### 2.3 四类页在各断点下的布局形态（文字版网格）

| 页面 | `xs` <768 | `md` 768–1023 | `lg` 1024–1279 | `xl` ≥1280 |
|---|---|---|---|---|
| **首页** | 单列居中；slogan→搜索框→胶囊，垂直位置：搜索框中心在视口 `38%`（**固定，不随查询跳位**）；底 tab 56 + 安全区 | 同单列，整列上移到 `32%`，顶栏 56px | 同 `md`，`32%` | 同 `md`；**不许出现侧栏/胶囊/最近查询常驻**（§4.1-7 首页彻底不显示） |
| **列表页（单词本）** | 单列行式，满宽，工具条吸顶（`z-sticky`） | 单列，`max-w-list` 居中 | **双列**（`grid-cols-2 gap-3`），行内容不变 | 双列 + 可选侧栏（收起态）；开启侧栏时主列降为单列，主列宽 = `max-w-list − 320 − 24` |
| **详情页（词）** | 单列满宽、卡片堆叠、区块间距 12px；顶栏返回 | 单列 `max-w-read` 居中 | 单列 `max-w-read` 居中（**不做两栏**，避免"后台感"与阅读断行） | 同 `lg`；右侧只允许"操作吸顶组"（收藏 / 立即背它）浮动，宽度 ≤240px |
| **背词** | 卡面满宽（减页边距），评分条吸底在 tab 之上；卡高 = `min(100dvh − topbar − ratings − tab, 560px)` | 居中 `max-w-read`，卡高 ≤600px，左右留白 | 居中 `max-w-read` | 居中 `max-w-read`（**桌面不许把四档评分横铺成 4 列宽条**，仍 4 等分一行，宽度随列收缩） |

### 2.4 安全区与键盘（硬要求，`viewport-fit=cover` 全端开启）

| 位置 | 写法（只允许这四处出现 `env(safe-area-inset-*)`） |
|---|---|
| 顶栏 / App 顶栏 | `padding-top: max(var(--sp-3), env(safe-area-inset-top))` |
| 底部 tab（App + 窄屏 Web） | `height: calc(var(--tab-h) + env(safe-area-inset-bottom))`，`padding-bottom: env(safe-area-inset-bottom)`；`--tab-h`：刘海机 App 侧覆写为 64px |
| 列表/滚动容器底部 | `padding-bottom: calc(var(--tab-h) + env(safe-area-inset-bottom) + var(--sp-4))`（替代 App 现状 `padding-bottom:130px` 死占位） |
| 抽屉 / BottomSheet / 对话框主体按钮 | `padding-bottom: calc(var(--sp-4) + env(safe-area-inset-bottom))` |

- Web 侧 `app/layout.tsx` 导出 `viewport`：`{ width:'device-width', initialScale:1, maximumScale:5, viewportFit:'cover', themeColor:'#f6f8f7' }`（dark 下 `#0c1412`，两条 `<meta name="theme-color">` 带 `media` 属性）。
- App 侧 `apps/app/index.html`：`<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover">` —— **删除 `user-scalable=no`**（R-33 ② / §7 第 5 条）。现状 `mobile-memory/assets/index.html:5` 即该违规点。
- **键盘与底部 tab 冲突（R-08 ⑤ 实测项）**：① 页面高度用 `100dvh`，禁 `100vh`；② 任何输入框获得焦点时，其容器 `scroll-margin-bottom: calc(var(--tab-h) + 24px)`，并在 `visualViewport` resize 时把 tab 栏 `translateY(100%)` 收起（失焦后 140ms 复位），保证"输入框 + 完成按钮"同时可见；③ 首页搜索框在 App 内是**绝对定位的 `z-dock` 层**，键盘弹起时改为 `position: sticky; top: 0`（同 Web 窄屏），不得被键盘顶出可视区；④ 背词页评分条在键盘弹起时（仅自测输入拼写题，P2）不需要处理，本期背词页无输入框。
- `overflow-x: hidden` 只允许出现在 `html, body`；页面内部横向滚动只允许出现在 §3.7 热力图与 §3.11.6 图表（带"可横滑"提示）。

## 3. 逐页规范

### 3.1 首页（三态各画一遍：Web 宽屏 / Web 窄屏 / App）

**组件来源约定（全文通用）**：`@tm/ui/patterns/*` = 两端同源（禁本地副本）；`@tm/ui/primitives/*` = shadcn 迁移件；`宿主本地` = 只允许"外壳/装配"，不许自带颜色。

| 组件 | 来源 | Web | App |
|---|---|---|---|
| `SearchBar` | `@tm/ui/patterns` | ✅ | ✅ |
| `LookupResultBar` | `@tm/ui/patterns` | ✅ | ✅ |
| `RecentSearchPanel` | `@tm/ui/patterns` | ✅ | ✅ |
| `ReviewCta`（今日 N 词胶囊） | `@tm/ui/patterns` | ✅ | ✅ |
| `DecorLayer`（渐变 + 呼吸） | `@tm/ui/patterns`（两端同一份，Web 由 `components/home/decor-layer.tsx` 薄封装） | ✅ | ✅ |
| `FooterNote`（备案 + 态度话） | Web `components/home/footer-note.tsx`；App 收进「我的」底部（App 首页不放页脚，避免与 tab 挤） | ✅ | 变体 |
| 顶栏 / 底 tab / 更多抽屉 | Web `components/header.tsx` + `components/mobile-nav.tsx`；App `shell/TabBarShell.tsx`（架构 §5.4 ③：App 专属，不入 ui 包） | ✅ | ✅ |

#### 3.1.1 可交互元素计数规则（R-07 ① / §8.3-C 的唯一定义，必须先统一口径）

- **计数范围**：`[data-testid=home-root]` 子树内一切 `a[href] / button / input / textarea / select / [role=button] / [tabindex]:not([tabindex="-1"])`。**全局顶栏、底部 tab、更多抽屉不计**（它们属于导航，不计入首页元素，PRD §4.1 第 1 行的"顶栏"是布局元素说明，不是首页主体计数项）。
- **聚合规则（写死，避免 QA 与前端各执一词）**：① `SearchBar` 的输入框与框内放大镜提交按钮 = **2 个**；② `LookupResultBar` 右侧"查看详情"与"收藏星标"合为一个操作组 = **1 个**；③ 结果条喇叭 = 1 个。
- **未查询态（硬指标 ≤5）**：输入框(1)、框内提交(2)、`ReviewCta`(3) = **3 个**。允许再加 2 个的余量已用于 slogan 不可点、装饰层不可点。
- **已查询态（≤8）**：+ 结果条操作组(4)、喇叭(5)、方向文字链(6)、面板清空/条目（聚焦时才存在，失焦归 0）= **6–8**。
- **DOM 必须为 0 的元素**（§8.3-C）：方向三按钮、常驻历史 chips、"输入单词开始查询…毫秒级…流式加载"大灰卡、单词本侧栏/浮动胶囊、AI 教学长卡。测试选择器：`[data-testid=home-direction-buttons],[data-testid=home-history-chips],[data-testid=home-empty-graycard],[data-testid=wordbook-sidebar],[data-testid=home-ai-card]` 命中数 = 0。

#### 3.1.2 Web 宽屏（≥1024px）文字版布局

```
┌─────────────────────────────────────────────────────────── 100% ──────────────────────────────────────────────┐
│ A 顶栏 z-sticky 56px：  [Logo 明日记忆]      查词 · 背单词 · 单词本 · 学习 · 更多▾        [主题] [头像]        │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ B 装饰层 z-base（absolute inset-0，pointer-events:none）：低饱和品牌渐变 + 一层柔光斑，周期 24s 呼吸            │
│   渐变：linear-gradient(160deg, bg 0%, brand-50 42%, surface 100%) + radial 光斑（§5.2）                        │
│                                                                                                                │
│        （上留白 = 视口 32%）                                                                                    │
│ C   记不住的，交给明天            ← slogan 22px/700 text-ink，居中，1 行                                        │
│     ┌────────────────────────────────────────── 560px ─────────────────────────────────────┐                   │
│     │ 🔍  输入单词或中文…                                                        ⏎         │  ← SearchBar 50px  │
│     └───────────────────────────────────────────────────────────────────────────────────────┘                   │
│     （C→D 间距 10px）                                                                                            │
│ D   〔 今天还有 12 词要背 → 〕             ← ReviewCta 胶囊 36px 高、内容热区 ≥44px，居中                        │
│     （查询后：E 结果条从 D 下方 12px 处淡入上移 8px，D 保持不动）                                                 │
│ E   ┌ 词头 20px/800 · /ˈhæppy/ · 🔍喇叭 ┐                                                                        │
│     │ adj. 快乐的 · n. 幸福        查看详情 ★ │  ← LookupResultBar（最多 2 行义项）                             │
│     └ 不是这个？换个查询方向 ────────────────────────────────────────────────────────                            │
│ F 底部 12px 灰字（text-xs text-ink-muted，居中，页脚留白 32px）：                                                │
│     明日记忆 · 每天进步一点点  赣ICP备2026013161号-1                                                             │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- 列：`mx-auto max-w-read px-6`；C/D/E 同列同宽（胶囊宽度 = 搜索框宽度，不留"短胶囊斜挂"的失衡）。
- 垂直间距全部走刻度：slogan→搜索框 `mt-3`(12px)、搜索框→胶囊 `mt-3`(12px)、胶囊→结果条 `mt-3`(12px)。**不使用 10px 等光学值**（§1.7 规则 ②）。
- 装饰层 B：`z-base`，**必须 `pointer-events:none`**（否则算可交互元素，计数超）。
- ⚠ 上面图示 `F 底部` 那一行**只管备案号这一维**（真号 `赣ICP备2026013161号-1`，用户本人 2026-09-26 给，A-98 #415）。图示前半句「每天进步一点点」与 §6.4 定稿表不同源 ⇒ **逐字一律以 §6.4 那张表为准**（slogan 行、页脚两行 `:1466`/`:1467`，为本次插入后的行号），⛔ 从 ASCII 图示抄文案（F-57 的成因就是抄了这颗图示）。两端页脚**次序**差（Web 先态度话、App 先备案号）仍是 D5 未裁项，本轮不动。

#### 3.1.3 Web 窄屏（<768px）文字版布局

```
┌────────────── 100vw ──────────────┐
│ A 顶栏 56px：[Logo]        [☰ 更多]│  ← 右上抽屉入口，热区 44×44
│ B 装饰层（同 3.1.2，光斑半径 ×0.8） │
│   记不住的，交给明天  (20px/700)    │  ← 搜索框中心在视口 38%
│ ┌──── 全宽 − 32px ────┐            │
│ │ 🔍 输入单词或中文…   ⏎ │           │  ← SearchBar 50px，`px-4`
│ └──────────────────────┘            │
│ 〔 今天还有 12 词要背 → 〕           │
│ E 结果条（满宽卡片，圆角 14px）       │
│ F 页脚 12px 灰字：查询后出现于列表尾 │
├────────────────────────────────────┤
│ ⌂ 查词  ▤ 背词(•12)  ✦ 词本  ↗ 学习  ◍ 我的 │  ← 底部 5 tab，56px + 安全区
└────────────────────────────────────┘
```
- 顶栏与底 tab **同时存在**（顶栏只放 Logo + 更多；导航主责在底 tab，避免"顶栏汉堡是唯一出口"）。
- 页脚 F 在窄屏不吸底（底 tab 已占位），改为内容末尾 `pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+16px)]`。

#### 3.1.4 App 首页（结构不动，只修三件事）

```
┌──────────── 100vw ────────────────┐
│ A 顶栏：[← 返回热区] 明日记忆   [☰] │  ← 标题即页名（R-18 ⑤）；二级页才有 ←
│ B 装饰层（同 token，opacity .55）    │
│      记不住的，交给明天 (20px/700)   │
│  ┌─ min(84vw,560px) 居中圆角胶囊 ─┐  │  ← SearchBar 50px，位置固定（不再 top:29%→0 跳位）
│  │ 🔍 输入单词或中文…        ⏎    │  │
│  └────────────────────────────────┘  │
│  〔 今天还有 12 词要背 → 〕           │  ← 与 Web 同一胶囊组件、同一文案
│  E 结果条（从下方淡入，位置绝对固定）  │
│  （最近查询面板：聚焦时从框下方浮出）   │
├────────────────────────────────────┤
│ ⌂ 查词  ▤ 背词(•12)  ✦ 词本  ↗ 学习  ◍ 我的 │
└────────────────────────────────────┘
```
- **修 ①**：搜索框 `position` 固定（App 用 `sticky top:0` 于滚动容器内），查询前后**不跳位**；结果区 `padding-top` 恒定；删除 `padding-bottom:130px` → §2.4 公式。判据：连查 3 次，`getBoundingClientRect().top` 差值 = 0（PRD §8.3-B-1）。
- **修 ②**：结果由"完整释义卡"收为 `LookupResultBar`（词 + 音标 + 喇叭 + ≤2 行首义 + 查看详情/收藏），完整信息进详情页。
- **修 ③**：恢复最近查询面板（现状 `app.js:236` 完全不显示 → 聚焦浮出）。
- 小组件直达：`launch-focus.ts` → 聚焦 `SearchBar` 并弹键盘（R-20 ③），此时最近查询面板必须展开（聚焦即展开）。

#### 3.1.5 状态表（首页所有元素，七态）

| 元素 | 默认 | hover | active/pressed | focus-visible | disabled | 加载 | 空/错误 |
|---|---|---|---|---|---|---|---|
| `SearchBar` 框体 | `bg-sunken` + 无边框，`--r-full`，高 50px，`px-4` | — | — | `bg-surface` + `border-brand` + `box-shadow: var(--elev-brand)`（ring 2px `--focus`） | 灰底 + `opacity .5`，placeholder 仍 ≥4.5:1 | 提交中：放大镜替换为 16px 环形 spinner（`--dur-micro` 淡入） | 输入超 64 字符：右侧 ✕ 清空按钮（热区 44px） |
| 框内提交按钮 | 图标 `text-ink-muted` 20px，热区 44×44 | `text-ink` | `scale(.94)` | ring | 输入为空时 `disabled`（**视觉只是变淡，不移除 DOM**） | 同上 | — |
| 清除 ✕ | `text-ink-muted` | `text-ink` | `scale(.94)` | ring | — | — | — |
| `ReviewCta` 胶囊 | `bg-brand-soft` `text-brand` `text-sm font-semibold`，`--r-full`，高 36px 内容/热区 44px | `bg-brand-soft` + `elev-1` | `scale(.97)` + `--brand-strong` 文字 | ring | 无（未登录态不是 disabled，见下） | 数字用骨架 28×14px | 未登录：文案换 `登录后可同步你的词本`，同色不置灰 |
| 结果条 | `bg-surface border-hair --r-xl elev-1`，`p-4` | 整卡 `elev-2`（桌面） | `scale(.99)` | 卡内控件各自有 ring | — | 骨架见 §3.1.6 | 见下 |
| 喇叭 | 32×32 视觉圆（`bg-brand-soft` `text-brand`），**热区 44×44**（`tap-target`） | `bg-brand` `text-on-brand` | `scale(.92)` | ring | 发音不可用时 **不 disabled**：点击给 inline 提示（R-14 ⑥） | 播放中图标转 `text-brand` + 2px 进度环 | — |
| 查看详情/收藏组 | 文字链 `text-brand text-sm` + 星标 24px 图标（热区 44） | 下划线 / 星标填色 | `scale(.97)` | ring | — | 星标写入中转 spinner | 未登录点星标 → 不报错，开登录弹窗并保留待收藏词（R-16 ②） |

**首页空态 / 加载态 / 错误态（文案定稿，可直接粘贴）**：

| 情形 | 视觉 | 文案（唯一版本） | 重试 |
|---|---|---|---|
| 未查询（默认态） | **不放任何占位卡、不放灰底提示块**；只有 slogan + 框 + 胶囊 | 无（slogan 即视觉重心：`记不住的，交给明天`） | — |
| 聚焦且无历史 | 面板仍浮出（避免"点了没反应"），高度 108px | `查过的词会出现在这里，最多记 20 个` | — |
| 查询中（首帧 <300ms） | 不显示任何东西（防闪） | — | — |
| 查询中（≥300ms） | 顶部 `z-busy` 2px 品牌进度条 + 结果条位置出**条状骨架**：1 条 160×24px（词头）+ 1 条 88×14px（音标）+ 2 条 `100%×12px`、`70%×12px`（义项），`bg-sunken` + `shimmer 1.4s` | 无文字（禁"加载中…"文字） | 用户可继续输入（不锁） |
| 查到但无释义（词典有条目无中文） | 结果条内首义位置 | `这个词还没收录中文解释，可以查看详情里的英文释义` | 可点"查看详情" |
| 无结果 | 结果条位置出 `bg-sunken --r-xl p-4`，左对齐，图标 🔍 24px `text-ink-muted` | 标题 `没找到“{query}”`；副行 `检查一下拼写，或者换个说法试试` | 右侧文字链 `换个方向查` |
| 请求失败（网络/5xx） | 同上容器，图标换 ⚠ `text-warning` | 标题 `这次没查到`；副行 `网络好像不太稳定，再试一次` | 主按钮 `重试`（次要 `取消`），**按钮 ≥44px，禁只有文字"重试"的死路** |
| 离线（App/Web 断网） | 同上，图标 ⚠ | 标题 `现在没有网络`；副行 `查词需要联网，你收藏的词会在联网后自动传上去` | `重试` + 结果条保留上次成功结果并加一行 `刚才查到的是上一次的，可能不是最新` |

#### 3.1.6 首页无障碍

- 顶栏 `<nav aria-label="主导航">`；当前页 `aria-current="page"`。
- `SearchBar`：`role="search"`；`<label class="sr-only" for="tm-search">查单词</label>`（**禁止只靠 placeholder 表达字段含义**）；`aria-expanded` + `aria-controls` 绑最近查询面板；`aria-autocomplete="list"`；`autocomplete="off"`。
- 结果条：`<section aria-live="polite">`，查询成功/失败用一次 `role=status` 播报（`已找到 happy`／`没找到这个词`），**骨架屏 `aria-hidden="true"`**。
- 装饰层：`aria-hidden="true"` + `pointer-events:none`。
- slogan 必须是 `<h1>`（首页唯一 h1；App 顶栏标题改为 `<h1>` 内联显示，二选一：首页有 slogan 时顶栏标题用 `<span>`，不得两个 h1）。
- 胶囊：`<a href="/study">`（不是 `<button>`），读屏念 `今天还有 12 个词要背，链接`；`ReviewCta` 数字用 `<span aria-hidden>` 外的一整句 `aria-label` 防止读成"1 2"。
- 焦点顺序（窄屏）：更多抽屉 → 搜索框 → 提交 → 胶囊 → 底 tab 5 项；**跳内容链**「跳到主内容」在 Web 顶栏第一个可聚焦项（`sr-only focus:not-sr-only`）。

### 3.2 搜索结果条 → 词详情页入口

**组件**：`@tm/ui/patterns/LookupResultBar`（两端同源，首页/中→英列表复用）。**宿主**：Web `components/home/result-section.tsx`、App `screens/LookupScreen.tsx`。

**布局与尺寸（两端同一 DOM 结构，只有列宽差异）**：

```
┌ p-4 (桌面 20px) · bg-surface · border-hair 1px · --r-xl · elev-1 ──────────────────┐
│ happy  /ˈhæpi/  🔊                                     查看详情 ›   ☆              │  行1：词头 text-h3(20px/800, font-latin) + 音标 text-sm text-ink-muted
│ adj. 快乐的 · 幸福的  ·  n. 幸福                                                     │  行2：义项 ≤2 行，text-sm，行高 1.6，超出 2 行截断 + 末尾 …
│ 不是这个？换个查询方向                                                               │  行3（仅在结果与输入语言判定不一致或用户点过时出现）：text-xs text-ink-muted 文字链
└────────────────────────────────────────────────────────────────────────────────────┘
```
- 行1 与行2 间距 4px；行2 与行3 间距 8px；卡内左右内边距 16px（移动）/20px（桌面）。
- 词头与音标同排，`gap-2`；喇叭紧跟音标 `gap-2`。右侧"查看详情"与星标固定右下/右上对齐（桌面右中对齐，移动在行1 右端），**二者与词头之间的最小间距 24px，窄屏 320px 下"查看详情"缩为纯图标 `›` 且 `aria-label="查看详情"`**。
- 整卡可点（= "查看详情"同一动作，`<a>` 包裹，href=`/word/{word}?from=home`）；行内控件（喇叭/星标/方向链）用 `e.stopPropagation()` 且不嵌套在 `<a>` 内 —— 实现为"卡 = a，控件绝对定位浮在 a 之上"或直接 `<div role=group>` + 显式链接，**禁止 `<a>` 嵌 `<button>`（HTML 非法）**。
- **禁止在结果条出现**：AI 长文本、英文释义、例句、词形变化、"加入单词本"大按钮、进度条。收藏只有星标图标。
- 中→英结果（输入中文）：结果为**条目列表**（最多 5 条，每条 = 词 + 首义 + 喇叭），列表容器 `bg-surface border-hair --r-xl overflow-hidden`，行间 `divide-y divide-hair`；每条行高 ≥52px（触控 44px 底线之上），点击进详情页；"更多结果"文字链放最后。

**交互态**：

| 元素 | 默认 | hover | active | focus-visible | disabled |
|---|---|---|---|---|---|
| 整卡 | `elev-1` | 桌面 `elev-2` + `border-brand/40`；移动无 hover | `scale(.99)` | `ring-focus` 卡外 2px | — |
| 喇叭 | `bg-brand-soft text-brand` 32px 视觉圆，44px 热区 | `bg-brand text-on-brand` | `scale(.92)` | ring | 不可用时**保持可点**，点击给行内提示（R-14 ⑥） |
| 收藏 ☆ | `text-ink-muted` 描边星 24px，44px 热区 | `text-brand` | `scale(.94)` | ring | — |
| 收藏 ★（已收藏） | `text-brand` 实心 | `text-brand-strong` | `scale(.94)` + 一次 180ms 弹入 | ring | — |
| 查看详情 › | `text-brand text-sm` | 下划线 | `text-brand-strong` | ring | — |
| 换个查询方向 | `text-xs text-ink-muted` | `text-ink` + 下划线 | `text-ink` | ring | — |

**空 / 加载 / 错误**（结果条专用，与首页 3.1.5 一致口径）：
- 加载：条状骨架（§3.1.5），**不是整页 spinner、不是进度环**。禁文字。
- 空（无结果）/ 错误 / 离线：文案见 §3.1.5 表末三行 + §6 对照表（同一份常量，禁两处各写）。
- 部分成功（有词头无释义）：卡内首义位置 `暂时没查到中文解释 · 查看详情`，**不得出现 `undefined`、`null`、空白卡**（R-09 ④）。

**无障碍**：卡 `<a>` 的 `aria-label` = `查看 {word} 的完整释义`；喇叭 `aria-label="播放发音"`，播放中 `aria-label="正在播放"`；星标 `aria-pressed={inWordbook}` + `aria-label="收藏到单词本"`；方向链 `aria-label="改用英译中查询"`／`改用中译英查询` 动态；结果区 `aria-live="polite"`。

### 3.3 「最近查询」聚焦面板

**组件**：`@tm/ui/patterns/RecentSearchPanel` + `@tm/ui/hooks/use-recent-searches`（`host.kv`，key `tm:recent:v1`，≤20 条，`RecentSearchItemSchema`）。

- **只在搜索框聚焦时出现**：`position: absolute; top: calc(100% + 8px)`，`z-pop`；失焦 / Esc / 提交后 `display:none` 且**DOM 高度 0、不占首页布局**（R-07 ④、R-10 ①）。实现要求：未展开时不渲染子树（不是 `visibility:hidden`）。
- 面板容器：`bg-surface border-hair --r-xl elev-2`；宽度 = 搜索框宽度（两端一致）；`max-height: 320px`（移动 `60dvh − top`）内部滚动 + `overscroll-behavior: contain`；上下内边距 6px。
- 头部行（高 36px，热区 44px）：左 `最近查询` `text-xs text-ink-muted font-medium`；右 `清空` 文字链 `text-xs text-brand`（**无历史时整行不渲染，不是置灰**）。
- 条目（高 48px，`px-4`，`gap-3`）：词 `text-h3 15.5px/700 font-latin` + 首义 `text-sm text-ink-muted`（单行截断）+ 相对时间 `text-xs text-ink-muted`（桌面右对齐；移动放在首义后 `·` 分隔）。**首义缺失 → 显示 `（无释义）`，不得留空白**（R-10 ②）。
- 分隔：条目之间**无描边**（靠间距），hover/焦点行整行 `bg-brand-soft`。
- 时间文案：`刚刚 / N 分钟前 / N 小时前 / 昨天 / M月D日`（超过 7 天），禁 `2026-09-19T02:11:00Z`、禁"24h 缓存"式术语。
- 键盘：↑↓ 移动焦点、Enter 选中、Esc 关闭并 blur、Tab 到"清空"后回到条目（焦点陷阱不做，面板不是模态）。
- 交互：**点条目 = 复用缓存结果，不再发请求**（R-10 ③）；重复查同词顺序前移（R-10 ⑤）；`清空` 走 `ConfirmSheet`（§3.11.2），确认文案见 §6。
- 未登录完全可用（本机存储，R-10 ⑦），**不得弹登录**。
- 加载/错误：面板无独立加载态（数据来自本机 kv，同步读取）；kv 读取异常 → 面板显示一行 `暂时读不到查词记录`，不空白。

### 3.4 词详情页（`/word/[word]?from=home|study|wordbook|chat` · App `#/word/{word}?from=…`）

**组件**：`@tm/ui/patterns/WordDetailCard`（主体，两端同源）+ `Markdown/EnResultView`（英文释义/AI 记法渲染，同源）+ `FavoriteButton`（同源）+ 宿主外壳（顶栏返回、吸底操作条）。

**分区顺序（两端同一顺序，不许重排）**：

| # | 区块 | 内容与视觉 | 间距 |
|---|---|---|---|
| 1 | 顶栏 | `‹ 返回`（热区 44×44，href 由 `from` 决定 = **按来源返回** R-09 ③）+ 标题 `词详情`（移动）/ 无标题（桌面，返回链在卡内）。桌面 ≥1024 顶栏保留全站导航，返回链进内容区第一行 | `h 56px` |
| 2 | 词头区 | 词头 `text-display`(28/32px,800,font-latin) + 喇叭（44 热区）+ 音标 `text-sm text-ink-muted` + 词频标签（`text-xs` Badge，`bg-sunken text-ink-muted`，**不叫"tag"**，显示如 `常见词`） | 区块内 `gap-2` |
| 3 | 中文释义（词性分组） | 每组一行：词性标签 `bg-brand-soft text-brand text-xs font-bold --r-xs px-2 py-1`（`min-width:44px` 居中）+ 义项 `text-h3`；多义项按序编号仅在有 ≥2 项时显示 `1.` `2.`（`text-sm text-ink-muted`） | 组间 `gap-2`(8px)，组内 `gap-2` |
| 4 | 词形变化 | **中文标签卡**（见 3.4.1）；**无变化时整块不显示**（R-14 ⑤） | 上 `mt-4` |
| 5 | 例句 | ≤3 条全展开；**>3 条折叠**为 `还有 N 句 ›`（`text-sm text-brand`）。每条：英文 `text-body-strong`（2 行截断，展开后不截）+ 中文 `text-sm text-ink-muted`（1 行截断，同上）；条目间 `divide-y divide-hair`，`py-2` | 上 `mt-4` |
| 6 | 英文释义 | 默认收起，标题行 `英文释义 · 展开`（`text-sm text-ink-muted`）；展开用 `EnResultView`（Markdown 容器 §3.11.5），按句分行 `text-sm`，行高 1.6 | 上 `mt-4` |
| 7 | AI 记法 | **默认收起为一行**（3.4.2） | 上 `mt-4` |
| 8 | 操作区 | 桌面：吸顶右侧操作组（`收藏/已收藏` 主按钮 + `立即背这个词` 次按钮，宽 ≤240px，`--r-lg`，高 44px）；移动：**吸底一条**（`z-dock`，`bg-surface/95 backdrop-blur`，两按钮等宽 44px 高，`px-4 pb-[safe-area]`） | 上 `mt-6` |
| 9 | 页脚 | 仅 Web：`FooterNote` 12px 灰字 | `mt-8` |

#### 3.4.1 词形变化（R-14 ⑤ 的落地）

- 常量单一源：`@tm/shared/constants` 的 `INFLECTION_LABELS`（由现 `mobile-memory/assets/app.js:77` 的 `EXCH_ZH` 提升而来，两端共用）。映射：`p 过去式 / d 过去分词 / i 现在分词 / 3 第三人称单数 / s 与 S 复数 / r 比较级 / t 最高级 / 0 原形`；**未命中键 → 标签写 `其他形式`**，右侧仍显示词形。
- 形态：`flex flex-wrap gap-2`，每项 `bg-surface border-hair --r-md px-3 py-2 min-w-[90px]`，**上下两行**：上行 `text-xs text-ink-muted`（中文标签）+ 下行 `text-body font-semibold text-ink font-latin`（词形）。
- **绝对禁止**：`p: hugged`、`3: hugs`、`S:` 式原始缩写出现在界面任何位置（含 title/aria-label/骨架屏占位）。grep 判据见 §8.4。
- 区块标题 `词形变化`（`text-h2 17/18px`）—— 桌面显示标题，移动不显示标题（标签已自明），避免小屏冗余。

#### 3.4.2 AI 记法区（两态，R-09 ①/⑥ + R-14 ③）

| 态 | 视觉 | 文案 |
|---|---|---|
| **收起（默认）** | 一行高 52px，`bg-brand-soft --r-lg px-4 flex items-center gap-2`，左 ✦ 图标 `text-brand` 20px，右 `›` `text-brand`；整行是一个 `<button aria-expanded=false>`，热区 44px | `AI 记法 · 词根 / 口诀 · 点击查看` |
| **展开（生成中）** | 容器保留，内部 3 行骨架（`100%×12px` ×2、`60%×12px`），**不显示"AI 生成中…"文字**；顶部 2px `z-busy` | 无文字 |
| **展开（有内容）** | `bg-surface border-hair --r-lg p-4`，Markdown 渲染（§3.11.5），标题行 `AI 记法` + 右侧 `收起 ›` 文字链；内容最多 8 行后折叠为 `展开全文` | — |
| **展开（失败）** | 同容器，图标 ⚠ `text-warning` + 一行文案 + `重试` 按钮（44px）；**静态释义区必须仍完整可见，不得整页空白**（R-09 ⑥） | `AI 记法暂时没生成，稍后再试` |
| **无内容（缓存空且接口返回空）** | **整块不显示**（R-14 ③：禁出现"🧠 口诀"标题下空白） | — |
- 生成/读取走 `GET /api/tutor`（与背词卡背面同一缓存内容，R-14 ③）；展开时才请求；失败不留空白卡。
- **不做逐字流式**（§1.11 禁止打字机动画）。

#### 3.4.3 交互态 / 空 / 错误 / 无障碍

- 收藏按钮定案：**收藏用主色实心 `bg-brand text-on-brand`**（它是本页第一动作），`已收藏` 退为 `bg-sunken text-ink border-hair` + 实心星（R-16 ① 要求显示当前态且可切换；`#14211d` on `#eef2f0` = 13.4:1 达标）。`立即背这个词` = 次级 `border-brand text-brand bg-transparent`。**一页只有一个主色实心按钮**。
- 发音不可用（R-14 ⑥）：**行内提示，不只 toast**。喇叭下方出现一行 `text-xs text-warning`：`点这里安装/切换系统英文语音`（可点，跳系统设置；Web 端跳「我的 · 帮助」说明段），保留 12s 后不自动消失（用户可点 ✕）。
- 无释义降级（弱网/词典缺）：显示缓存内容 + 顶部一行 `text-xs text-ink-muted`：`刚才查到的是上一次的，可能不是最新`；完全无内容 → 空态卡（`这个词暂时没有释义` + `重试` + `去背别的`）。**不白屏、不出现 `undefined`**。
- 未登录：详情页可读（R-23 ①）；点收藏 → 弹登录 + 保留待收藏词；点"立即背这个词" → 先登录引导（可点主按钮 `手机号登录`）。
- 返回栈：`from=wordbook` 返回时须恢复词本滚动位置（R-09 ③）—— 实现为返回链接带 `?scroll=` 或使用路由状态；判据走查。
- 无障碍：区块用 `<h2>` 顺序（3/4/5/6/7 各一个 h2，无跳级）；例句折叠按钮 `aria-expanded`；`<ol>` 承载义项；Markdown 容器 `tabindex="0"` 使长文本可键盘滚动；页面标题 `document.title = {word} · 明日记忆`。

### 3.5 背词（三模式入口 / 卡正面 / 卡背面 / 跳过态 / 四档评分条 / 撤销 / 完成页）

**组件**：`@tm/ui/patterns/{QueueSwitch, Flashcard, RatingBar, SessionSummary, ConfirmSheet}`（全同源；`QueueSwitch`/`SessionSummary` 是本规范对架构 §3.1 组件清单的两处补充 —— 三模式命名与完成页数字格式必须两端逐字一致，R-12 ① / R-13 ①）。宿主：Web `app/(user)/study/page.tsx` + `components/study/{queue-switch,card-view,session-summary}.tsx`；App `screens/{StudyScreen,CompletionScreen}.tsx`。
**四档常量与文案唯一源**：`@tm/shared/constants` 的 `RATING_VALUES = [1,2,3,4]` + `RATING_LABELS = ['忘记','困难','良好','轻松']`（`packages/ui` 内不许再写一份）。

#### 3.5.1 三模式入口（页面顶部 segmented，非独立页）

```
[ 今日复习 | 学新词 | 随机自测 ]        ← QueueSwitch：bg-sunken --r-full p-1，选中项 bg-surface text-ink font-semibold elev-1
进度 · 今天 3/12                        ← text-xs text-ink-muted + 6px 高进度条（bg-sunken 槽 / bg-brand 填充），role=progressbar
```
- 高度：整条 44px（每项热区 ≥44×88）；宽度 = `max-w-read` 居中；移动端满宽减页边距。选中态**必须同时有底色 + 字重**（不仅靠颜色，§7 第 4 条）。
- URL 单一真源：`?mode=review|new|selfTest`，默认 `review`；App 用 `#/study?mode=`。
- `学新词` 在词本为空时：该项**可见不可点**（`aria-disabled=true` + `text-ink-muted`）并在下方一行 `text-xs text-warning`：`先去查几个词，再回来学新词`（R-12 ⑤）。
- 三模式各自说明只在**该模式第一次进入时**显示一行 `text-xs text-ink-muted`（`随机自测不会改动你的复习计划`），不常驻。

#### 3.5.2 卡正面

```
┌ bg-surface border-hair --r-xl p-6 · 高 min(可算值, 560px) · 内容居中 · 整卡可点(翻面) ┐
│                        happy                                   ← text-display 28/32px 800 font-latin
│                        /ˈhæpi/  🔊                             ← text-sm text-ink-muted + 喇叭(44 热区)
│                                                                               │
│                        点一下看释义                       ← text-2xs text-ink-muted，仅触屏
└──────────────────────────────────────────────────────────────────────────────┘
```
- 喇叭在正面（R-14 ②），位置 = 音标右侧 8px；正面**不显示中文释义、不显示 AI 记法**。
- 顶部一行：`今天 3/12`（`text-xs text-ink-muted tnum`）+ 进度条 + 右侧 `撤销上一张`（仅当有可撤销项时出现，`text-xs text-brand`，热区 44px）。
- **无 3D 翻转**：正面→背面用内容替换 + `--dur-micro` 淡入（120ms），零延迟手感（§6 第 5 条）。

#### 3.5.3 卡背面（长释义整页可滚）

- 结构：`词头(20px/800) 音标 喇叭` → `中文释义（词性分组，text-body）` → `词形变化（中文标签，§3.4.1）` → `例句 ≤2 句` → `AI 记法（有内容才出现，整块无内容不显示）`。
- **卡高自适应内容，超屏时整页滚**（R-14 ①）：外层 `min-h` 而非 `h`，滚动容器是页面本身；**禁止在卡内部再套 `overflow:auto` 小框**（现状 `flashcard.tsx:85-126` 的 3D 层内滚是本期必删项）。
- 背面内容一律**左对齐**（保留 App 已验证的行为），只有正面词头居中。
- 行内提供两个出口：`查这个词 ›`（进详情页，带 `from=study`）与 `收藏 ☆`（R-16 ① 背词卡也要有显式收藏）。
- 底部与评分条之间 `gap-3`；评分条吸底（`z-dock`），页面滚动时不消失；窄屏评分条下沿 = tab 之上（`bottom: calc(var(--tab-h) + env(safe-area-inset-bottom))`）。

#### 3.5.4 四档评分条（`RatingBar`）

```
┌ bg-surface border-hair --r-full p-2 elev-1 · 一行 4 等分 gap-2 ┐
│  忘记      困难      良好      轻松        ← 每项高 52px（移动）/48px（桌面），--r-md，text-sm/700
│  6 分钟后   明天     4 天后    9 天后      ← 小字 text-2xs（仅桌面显示；移动只留主标签，避免 11px 挤行）
└──────────────────────────────────────────────────────────────────┘
```
| 档 | 底色（浅/深） | 文字（浅/深） | 按压 | 对比度 |
|---|---|---|---|---|
| 忘记 1 | `#fbe9e7` / `--danger-soft` | `text-danger` `#b3261e` / `#f0a0a0` | `scale(.97)` | 5.58 ✅ |
| 困难 2 | `#fbeeda` / `--warning-soft` | `text-warning` `#8a5000` / `#e6b87a` | 同 | 5.68 ✅ |
| 良好 3 | `#e6f2ef` / `--brand-soft` | `text-brand` `#0f6b5c` / `#56c2ab` | 同 | 5.59 ✅ |
| 轻松 4 | `#f0f9f4` / `--success-soft` | `#157f4a` / `#79c9a4` | 同 | 4.69 ✅ |
- **四档同权重，不做"主推实心档"**：App 现有 `.primary-rate`（浅绿实底 + 深绿字，`style.css:166/205`，且带 `!important`）**废弃删除** —— 一端有高亮即违反两端一致，且它破坏了对比度表 #11 的配色。
- 键盘：桌面 `←`=1、`→`=4、`↓`=2、`↑`=3、`空格`=翻面；提示文案只在 `md+` 且 `pointer: fine` 时出现：`空格 翻面 · ← 忘记 · → 轻松`（`text-2xs text-ink-muted`）。触屏改显示：`点卡片翻面 · 左滑忘记 右滑轻松`（R-11 ①）。
- 滑动提交（R-11 ②）：位移 ≥24px 开始在卡片右上角浮现目标档胶囊（左=忘记 / 右=轻松，`bg-danger`/`bg-success` `text-on-brand` 小胶囊，`--dur-micro`）；≥64px 且松手才提交；松手前滑回 <24px 取消；纵向位移 >12px 判为滚动并终止横滑（`touch-action: pan-y`）。**横滑查看长例句不得计分**（用例：滑看例句后评分计数不变）。
- 提交后：乐观切下一张（不锁 UI），失败回滚并 toast `这条没记下，再试一次` + `重试`。

#### 3.5.5 撤销与跳过态

- **撤销提示**（R-11 ③④）：评分后顶部出现 5 秒条（`z-toast`，§3.11.1 变体）：左 `已记下：良好` + 右按钮 `撤销`（热区 44px）。生命周期：离开该卡、或再评满 3 张后自动消失；同轮可连续撤销 ≤3 次。
- 撤销失败：`撤销没成功，进度还是刚才那条 · 再试一次` + `重试`；**卡面不得停留成"已评分"假象**（回到该卡正面，评分按钮全部可用）。
- **无释义跳过态**（R-14 ④）：卡正面照出，背面区显示：
```
┌ bg-sunken --r-xl p-5 text-center ┐
│  这个词暂无释义                    ← text-h2 text-ink
│  不评分也不影响后面的词，改天再补   ← text-sm text-ink-muted
│   [ 重试 ]   [ 今天先跳过 ]        ← 两个 44px 按钮；重试=次级描边，跳过=主色实心
└──────────────────────────────────┘
```
  跳过 = 不写 FSRS、不计入本轮 x/y/z/w，但记日志（R-14 ④）。禁止"仅可评分"的盲评路径。
- **达到每日目标**（§8.3-B-8）：`ConfirmSheet`（§3.11.2）：标题 `今天 {goal} 个词的目标完成了`，正文 `再多背一点，或者明天继续 —— 你已经连续 {streak} 天了`，按钮 `再背一批`（主）/ `今天就到这`（次）。不可点遮罩关闭（必须二选一）。

#### 3.5.6 队列空 / 完成页 / 加载 / 错误

| 情形 | 布局 | 定稿文案 |
|---|---|---|
| 今日复习队列为空 | 居中卡（`bg-sunken --r-xl p-6 text-center`）+ 一个 40px ✔ 图标 `text-success` + 标题 + 两个 44px 按钮 | 标题 `今天的复习清空了`；副行 `明天会再来一批，或者现在多学几个新词`；按钮 `学 10 个新词`（主）、`去查词`（次）—— **不做死路，不出现"队列空空如也"**（R-12 ③） |
| 学新词无可学（都学过） | 同上，图标 `text-ink-muted` | 标题 `词本里的词都在背了`；副行 `去查几个新词加进来，就能开新一轮`；按钮 `去查词` |
| 随机自测无词（词本 <5） | 同上 | 标题 `词还不够，先攒几个`；副行 `自测要从你的单词本里抽词，至少要有 5 个`；按钮 `去查词` |
| 队列加载中（≥300ms） | 卡位骨架：`200×32px` + `100×14px` + 2 × `100%×12px`；评分条骨架 4 × `1fr×52px`；顶部 `z-busy` 进度条 | 无文字 |
| 队列拉取失败 | 卡位错误卡（图标 ⚠ `text-warning`）+ 主按钮 | 标题 `今天没能取到词单`；副行 `可能是网络的事，再试一次`；按钮 `重试`（主）、`去查词`（次） |
| 离线（App） | 顶部一条 `text-xs` 提示 + 页面可用（已缓存卡继续背） | `现在没有网络，背词进度会先记在手机上，联网后自动同步` |
| **完成页**（R-13） | 居中列 `max-w-read`：大数字 → 明细行 → 打卡区 → 三按钮 | 见下 |

**完成页版式（两端同构）**：
```
        本轮结束                      text-h1
        12 张                        text-display 34px/800 tnum（唯一允许 34px 的例外）
  忘记 2 · 困难 1 · 良好 6 · 轻松 3    text-sm text-ink-muted（四档数字用对应语义色，标签用 ink-muted）
        用时 4 分 12 秒                text-sm text-ink-muted
  ┌ 今天已打卡 · 连续 37 天  ✓ ┐        打卡区常驻可点（bg-success-soft text-success --r-lg p-4，整块可点）
  │ 未打卡时：[ 今天打卡 ] 连续 36 天 │   主按钮 44px；失败 → 可点重试（R-13 ⑤）
  └──────────────────────────┘
   [ 再背一批 ]  [ 回首页 ]            两个 44px 按钮（主=再背一批，次=回首页）
```
- 完成页**不得自动回到第 1 张、不得产生新评分记录**（R-13 ②）。打卡入口常驻可点（非弹窗）。
- 连续天数/待背数三处（完成页 / 我的 / tab 红点）同一时刻必须相等（R-13 ⑥）。

#### 3.5.7 背词无障碍

- `QueueSwitch`：`role="tablist"` + `aria-selected`；卡片容器 `aria-live="polite"`（切卡播报 `第 4 张，共 12 张`）。
- 卡正面整卡为 `<button aria-label="显示释义">`；背面评分组 `<div role="group" aria-label="记住程度">`，每按钮 `aria-label="良好，下次 4 天后"`。
- 撤销按钮 `aria-label="撤销上一条评分"`；进度条 `role="progressbar" aria-valuenow/min/max` + `aria-label="今日进度"`。
- 完成页数字区用 `<dl>`（`dt` 标签 / `dd` 数字），读屏可逐项念出；打卡区按钮 `aria-pressed`。
- 键盘 Tab 顺序：模式切换 → 撤销 → 卡（翻面）→ 喇叭 → 四档 → 查这个词 → 收藏；**四档评分必须可键盘到达**（现状只能鼠标点）。

### 3.6 单词本一级页（`/wordbook` · App tab3）

**组件**：`@tm/ui/patterns/WordbookList`（行 + 左滑 + 显式删除，两端同一列表本体）+ `SearchBar`（变体 `size="list"`）+ `FilterChips` / `SortMenu`（同源新增，命名见下）+ Web `components/wordbook-sidebar.tsx`（≥1280px 可收起外壳，架构 §7.2 瘦身为 ≤60 行）。
**口径冲突以 PRD 为准（本规范锁定）**：排序 = **字母 / 最新加入 / 最久没碰 / 最常忘**（R-15 ④）；筛选 = **全部 / 新词 / 在背 / 已掌握**（R-15 ⑤，"新词"条数 = 无 FSRS 卡词数，后端断言）。架构 §7.1 表内写的"加入时间/复习次数/…/待复习优先""全部/今日待背/已掌握/未学"是早期措辞，**按本小节实现**（两端命名与顺序完全一致，§8.2-2 并排走查会逐字比对）。

#### 3.6.1 布局分区

```
┌ 顶栏 / tab（复用全站） ──────────────────────────────────────────────┐
│ A 页头：单词本 · 共 128 词            （text-h1 + text-sm text-ink-muted）│
│ B 搜索框（size=list，高 44px，--r-lg，bg-sunken；placeholder `搜单词或释义`）│
│ C 筛选 chips 一行（可横滑）：全部 128 · 新词 34 · 在背 79 · 已掌握 15      │
│ D 排序行（右对齐）：排序：最新加入 ▾   + 结果计数（筛选后 `找到 41 词`）    │
│ E 列表（WordbookList）                                                │
│ F 底部安全留白 = calc(var(--tab-h) + env(...) + 16px)                  │
└──────────────────────────────────────────────────────────────────────┘
```
- B/C/D 合并为**吸顶工具条**（`z-sticky`，`bg-bg/92 backdrop-blur`，高 = 44+40+40，`py-2`）；滚动时页头 A 消失、B/C/D 保持可见。
- 间距：A→B 12px，B→C 12px，C→D 8px，D→E 12px，行卡之间 0（列表用 `divide-y divide-hair`，非卡片堆叠）。
- ≥1024px 双列（`grid-cols-2 gap-3`）；≥1280px 允许侧栏形态（3.6.6）。

#### 3.6.2 行形态（`WordbookList` 行，高 ≥60px，`px-4 py-3`）

```
┌ happy  /ˈhæpi/                        ★(已收藏) 🔊(行内喇叭) ┐  行1：词 text-h3 + 音标 text-2xs text-ink-muted
│  adj. 快乐的 · 幸福                                        │  行2：首义 text-sm text-ink-muted，单行截断
│  加入 3 天前 · 复习 4 次 · 下次 明天                        │  行3：元信息 text-2xs text-ink-muted（tnum）
└────────────────────────────────────────────────────────────┘
```
- **行高由三行内容决定（≥60px）**；首义缺失时行2 显示 `（暂无释义）`（不得空行）；元信息按排序需要可省（320px 下只保留行1 + 行2）。
- 点击整行 = 进详情页（`from=wordbook`）；**喇叭只发音，不跳转**（`stopPropagation`）；星标切换收藏（可撤销 toast）。三个 affordance 首屏可见（架构 §5.4 ②）。
- 行状态色：`新词` 无标记（避免彩色噪音）；`在背` 不加色；`已掌握` 行1 词头后加一个 `已掌握` Badge（`bg-success-soft text-success`）—— **仅靠文字区分，不靠颜色**（§7 第 4 条）。
- 选中/hover：桌面 `bg-brand-soft`；移动按压 `bg-sunken`（`--dur-micro`）。

#### 3.6.3 搜索 / 筛选 / 排序

| 控件 | 形态 | 规则 |
|---|---|---|
| 搜索框 | `SearchBar` 变体，高 44px，`--r-lg`，右侧 ✕ 清空（44 热区） | 子串匹配词与释义；100 词内输入后 ≤300ms 出结果（R-15 ③，本地过滤，**不发请求**）；无匹配 → 空态（3.6.5） |
| 筛选 chips | 4 个 `--r-full` 胶囊，高 32px 内容 / 44px 热区，`gap-2`，横向可滑（`snap-x`，右侧渐隐 24px 提示可滑） | 选中态 `bg-brand text-on-brand`，未选 `bg-sunken text-ink`；带计数 `全部 128`（tnum）；单选，写进 `?filter=` |
| 排序 | `SortMenu`：文字按钮 `排序：最新加入 ▾`（44px 热区）→ 弹出 4 项 `role=menu`，每项高 44px，当前项右侧 ✔ | 不做成 4 个常驻按钮（省窄屏空间）；写进 `?sort=`；`最常忘` = lapse 次数降序，`最久没碰` = lastReview 升序（空值排最后） |
| URL | `?q=&filter=&sort=` 全部可分享、可回退（架构 §7.1） | 恢复时控件与列表同步 |

#### 3.6.4 删除（显式 + 左滑 + 撤销）

- **显式删除按钮**：触屏（`pointer: coarse`）**每行右侧直接显示 🗑**（`text-ink-muted`，44×44 热区，默认不常驻红色以免整列血腥）；桌面 hover/聚焦行时才显示，但**键盘 Tab 必须能到达**（不显示=不可访问，禁止 `opacity:0` 移出焦点序；用 `sr-only` + `focus:not-sr-only` 或行内常驻）。
- **左滑删除保留**（§8.3-B-4）：位移 ≥24px 露出删除块（宽 76px，`bg-danger text-on-brand`，文字 `删除` 13px/700），≥64px 松手即删；未达阈值回弹（`--dur-move`）；`touch-action: pan-y` 防与纵向滚动打架（`WordbookList` 内 pointer events 自实现，不引手势库 —— 架构 §5.4 ①）。
- 删除反馈 = **撤销 toast**（不是确认弹窗）：`已删除“happy”` + 按钮 `撤销`，**窗口 5 秒**（R-15 ⑥）；撤销成功 → 行回到原位 + `已恢复`；5 秒后不可恢复。
- 批量清理入口不做（§6 第 5 条不做花哨功能）；"清空单词本"按钮全站 0 处。

#### 3.6.5 空 / 加载 / 错误（单词本）

| 情形 | 视觉 | 定稿文案 | 可重试 |
|---|---|---|---|
| 词本完全为空 | 居中插画位用一个 40px 图标 `text-ink-muted`（**不引图片、不做插画**）+ 标题 + 副行 + 主按钮 | 标题 `单词本还是空的`；副行 `查到想记的词，点一下星标就存到这里`；按钮 `去查词`（44px 主） | — |
| 筛选/搜索无结果 | 同上，无按钮改文字链 | 标题 `这里没有符合条件的词`；副行 `换个筛选，或者清空搜索看看`；链 `清空筛选和搜索` | — |
| 未登录访问 | 可读引导页（R-23 ①），列表区显示骨架 + 引导卡 | 标题 `登录后才能看到你的单词本`；副行 `同一个手机号，词本和进度都会跟着走`；主按钮 `手机号登录` + 文字链 `没有账号？注册` | — |
| 首屏加载（100 词） | **行骨架 8 条**（每条：`120×16px` + `100%×12px` + `80×10px`，`bg-sunken` + `shimmer 1.4s`），工具条同时出骨架；**禁整页转圈** | 无文字 | 不锁输入（＝不加 disabled/inert；不要求首屏常驻挂载，列表未到时本地过滤无意义） |
| 释义批量补齐中 | 行的首义位置出 `— — —` 灰条（`bg-sunken` 60% 宽 12px），整页**一次批量请求**（R-15 ⑧ 网络请求数 ≤3，禁 2.1s 逐词补拉） | 工具条下方一次性小字 `正在补齐释义…`（≤5s 后若仍未完成改 `有些词的释义还没补上`） | 自动重试 1 次 |
| 列表拉取失败 | 错误卡 | 标题 `没能取到你的单词本`；副行 `再试一次，或者先回首页查词`；按钮 `重试`（主）、`去查词`（次） | ✅ |
| 删除写失败（离线） | 行不消失 + toast | `这条先记在手机上了，联网后会自动删掉` （**不出现"云端/本地"**） | 自动补传 |
| 加星写失败（离线） | 星标不落 + toast（形态同上一行，`tone: error`） | `这条没能记下，再点一次试试`（**PM-fix6 定稿 · A-52**；不出现"云端/本地/缓存"，**不得**写成任何"会自动…"式承诺——收藏侧没有补传） | 手动（再点星标）；**无自动补传** |

#### 3.6.6 ≥1280px 侧栏复用形态（Web 专属外壳）

- 结构：主内容 + 右栏 320px（`--r-lg border-hair bg-surface`，`overflow-hidden`），侧栏内 = **同一个 `WordbookList`**（行内容去掉行3 元信息，行高 ≥52px）+ 顶部一个 40px 高的搜索框 + 底部 `打开单词本页 ›` 链接。
- 收起：顶栏「单词本」右侧一个 `«` 按钮（44 热区）→ 侧栏宽度动画 240ms 收为 **0px**，不留占位；收起状态存 `host.kv`（`tm:wb-sidebar:v1`）。
- **首页绝不挂载侧栏/浮动胶囊**（§4.1-7 硬判据；`data-testid=wordbook-sidebar` 在首页命中数 = 0）；<1280px 时侧栏 DOM 不渲染（`hidden xl:flex`），入口 = 底 tab / 顶栏菜单（A-11"点了没反应"修复）。

#### 3.6.7 无障碍

- 列表 `<ul>/<li>`；每行链接 `aria-label="查看 happy 的详情"`；喇叭 `aria-label="播放发音"`；星标 `aria-pressed`；删除 `aria-label="从单词本删除 happy"`。
- 筛选组 `role="group" aria-label="筛选"`，chip `aria-pressed`；排序按钮 `aria-haspopup="menu" aria-expanded`，菜单 `role=menu`/`menuitemradio` + Esc 关闭 + 焦点回弹。
- 左滑删除**必须有等价的显式删除按钮**（手势不得是唯一出口，R-15 ⑥）；撤销 toast 里按钮 `role="button"`，`aria-live="assertive"`，5 秒窗口内焦点可达。
- 计数变化（筛选后）用 `role="status"` 播报 `找到 41 词`。

### 3.7 学习情况

> 两个形态、一套组件：**App 轻版**（tab4，`apps/app/src/screens/ProgressScreen.tsx`，T-18，R-19 ①）= 3 张大数字卡 + 1 条曲线 + 热力图；**Web 完整版**（`apps/web/src/app/(user)/report/page.tsx`，R-06 + R-25 + R-27）= 关键数字组 + 曲线 + 其余四图。两者共用 `@tm/ui/patterns/{StatCard,GrowthLine,Heatmap}`（架构 §5.1 表第 2 行 / §5.4 ④）；Web 侧只保留 recharts 适配壳（架构 §7.2：`charts/heatmap-chart.tsx`、`growth-line-chart.tsx` 展示层迁出，`forgetting-bar-chart`/`review-line-chart` 留 Web）。
> **禁止**在 App 出现"学情分析"字样以外的第二种页面命名；App 顶栏标题固定 `学习情况`（R-18 ⑤ 回归用例逐 tab 截图）。

#### 3.7.1 App 轻版 · 布局分区（375 / 412 两档，列宽用 §2.2 的 `--max-w-read`，轻学情列内再限 560px）

| 区 | 内容 | 高度/间距 |
|---|---|---|
| A 顶栏 | `学习情况` 标题 + 右侧「刷新」图标按钮（唯一非卡片交互） | `--topbar-h 56px`，`sticky top-0 z-sticky` |
| B 三张大数字卡 | 顺序固定：`本周新增` / `今日待复习` / `连续天数`（R-19 ① 原文顺序，不得按"好看"重排） | 3 列等宽 `grid grid-cols-3 gap-3`（12px）；卡最小高 `84px` |
| C 增长曲线 | `GrowthLine` 单图：近 30 天累计掌握词数 | `mt-4`（16px），高 `160px`（App）/ `220px`（Web） |
| D 热力图卡 | **区标题（`sr-only`）`每日背词热力图`**（= §3.7.6 `heatmapAria` 前半句**逐字同源**，一致性由不变式哨 `heatmapAria(63) === heatSectionTitle + '，最近一年，共打卡 63 天'` 钉，**PM-fix8 定稿 / A-65 #181**）+ 模式切换（每日/每周/累计）+ 月份轴 + 横向滚动格阵 + **滚动区外**的点选信息条 + 图例 | `mt-4`，卡内 `p-4` |
| E 底部留白 | 供 §3.10 底 tab 不遮内容 | `pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+16px)]` |

- B 区**必须**是三列等宽（`grid-cols-3`），`gap-3`（12px），每卡内：数字 `text-2xl font-bold leading-none tabular-nums` + 标签 `text-xs text-ink-muted mt-1`。数字与标签**左对齐**（不居中，避免三卡视觉跳轴）。
- 三列在 <340px（极端小屏 / 系统字号放大）降级为 `grid-cols-1`（横条卡：标签在左、数字在右），降级用容器查询 `@container (min-width: 340px)`，不新增断点。
- 三张卡的数字**可点击进明细**（R-19 ② 沿用「我的」的口径）：`本周新增`→单词本 `?filter=新词`；`今日待复习`→背词（`review` 队列）；`连续天数`→热力图并滚到今天那一列。整卡就是一个 `<button>`，`justify-between`，右侧 `›` 16px `--ink-muted`。

#### 3.7.2 组件清单与来源

| 组件 | 来源 | props 形状（`UiHost` 注入，组件内零请求） |
|---|---|---|
| `StatCard` | 🆕 `@tm/ui/patterns/StatCard.tsx`（架构 §3.1 已列） | `{ label, value, unit?, delta?, tone?: 'default'\|'brand'\|'warning', onClick?, loading?, testid }` |
| `GrowthLine` | 🆕 `@tm/ui/patterns/GrowthLine.tsx`，由 `apps/web/src/components/charts/growth-line-chart.tsx` 抽出展示层 | `{ data: {date,value}[], loading?, error?, onRetry?, accessibleSummary, heightPx? }` |
| `Heatmap` | 🆕 `@tm/ui/patterns/Heatmap.tsx`，由 `apps/web/src/components/charts/heatmap-chart.tsx` 抽出；三模式 + 点选信息条为**新补**（App 现有实现在 `mobile-memory/assets/app.js:470-557`，迁移其能力，不迁代码） | `{ days: {key,count}[], mode: 'daily'\|'weekly'\|'total', onModeChange, tip, onSelect?, monthsAxis: true }` |
| `ModeSwitch`（每日/每周/累计） | 复用 `@tm/ui/primitives/tabs`（shadcn Tabs）`variant="segment"` | `role="tablist"`，选中 `aria-selected` + `data-state=active` |
| 空态 / 错误态 | 复用 `@tm/ui/patterns/EmptyState`、`ConfirmSheet` 不参与 | `{ icon?, title, hint?, action? }` |
| 数据 | `profile.get` / `analyst.*`（架构 §5.1 表末行）；App 走 `useQuery` + `speak` 无关；页内**不得**出现 `fetch(` | — |

刷新按钮：`RefreshCw` 图标 20px + `sr-only` 文本「刷新学习情况」，`aria-busy` 期间图标 `animate-spin`（`--dur-spin 900ms` linear，reduced-motion 下停转但仍 `aria-busy`）。

#### 3.7.3 状态样式（逐控件）

| 控件 | hover | active | focus-visible | disabled |
|---|---|---|---|---|
| `StatCard`（可点） | `bg-surface` → `bg-brand-soft/60`，`--dur-micro 120ms`；**不抬起、不加阴影**（防"后台面板"感） | `scale-[0.99]`，`--dur-instant 80ms` | 2px `--focus` ring，`ring-offset-0`，`outline-offset: 2px` | `loading` 时整卡换骨架并 `aria-disabled` + `pointer-events-none` |
| `ModeSwitch` | 非选中项 `text-ink-muted`→`text-ink` | 选中：`bg-brand-soft text-brand-strong`（浅）/ `bg-brand/20 text-brand`（深），**字重同步升到 600**（颜色+字重双通道，不单靠底色） | 每个按钮各自入焦点序，环 2px | 数据未就绪时整组 disabled |
| 热力图格子 | 桌面 `outline: 2px solid var(--focus)` 于 hover 格 + 信息条实时跟随 | 点按后该格 `ring-2 --brand`（`aria-current="true"`），信息条常驻 | **不进入焦点序**（52×7=364 格会淹没键盘用户）；改为提供「用键盘逐周浏览」的 `Tab` 锚点：卡内一颗 `浏览热力图` 按钮打开可键盘操作的整年列表（同数据、纯文本 `<table>`） | — |
| 刷新 | `bg-sunken` | `scale-[0.97]` | 2px ring | 请求中 disabled（`aria-busy="true"`） |

#### 3.7.4 空态 / 加载态 / 错误态（文案可直接粘贴）

| 情形 | 视觉 | 文案（最终中文，逐字） | 可否重试 |
|---|---|---|---|
| 未登录（仅 Web 完整版） | 整页 `EmptyState`，插画位用一个 64px 线性图标 | 标题`登录后就能看到你的进步`；副`账号里的词单和学习记录会跟着你走。`；主按钮`登录`，次按钮`先随便查查` | — |
| 已登录、0 词 0 复习 | 三卡显示 `0`（**不是空**，数字必须存在），曲线区替换为空态 | `还没有背过词` / `背完第一轮，这里就有内容了。` / 按钮`去背单词` | — |
| 首屏加载 | 骨架：3 个 `rounded-lg` 块 `84px`；1 条 `mt-4 h-40 rounded-lg`；1 个 `h-[168px]` 网格状骨架（**必须画出 7 行×N 列的 11px 方块阵列轮廓**，让形状=真实形状）+ 模式条 3 个 44×24 块 | 骨架下方一行 `text-xs text-ink-muted`：`正在整理学习记录…` | — |
| 曲线数据不足（<3 天） | 不画图，改为 3 行文本进度 | `再多背几天，就能看到曲线` / `已有记录：3 月 2 日 · 背词 6 次` | — |
| 拉取失败 | 卡内 `bg-danger-soft/50` 边框 `--danger/30`，图标 `AlertTriangle` 18px | `学习情况没拿到` + `网络或服务器刚好在忙，你的记录没有丢。` + 主按钮`再试一次` | **是**，且自动 1 次静默重试后仍失败才显示（R-24 ⑥） |
| 局部：热力图失败但卡片成功 | 只 D 区降级 | `热力图暂时打不开` / `其他数字不受影响。` / 文字按钮`重新加载热力图` | 是 |
| 热力图数据不足（有记录但不足一周） | 格阵照画（形状 = 真实形状），卡下补一行 `text-xs text-ink-muted`（**可见小字，非 `sr-only`**，`ProgressScreen.tsx` 的 `sparse` 分支） | `最近一年背了 N 天，再多背几天就能看出一周的习惯`（N = **窗口内**有记录天数 `activeDays`，由接口结果派生、**不得写死**、**不得**填服务端全量 `reviewDays`；**PM-fix8 定稿 / A-65 #181**） | — |
| 离线（App） | 顶部一条 `--warning-soft` 细横幅，`--dur-fast` 淡入 | `离线中 · 显示的是上次到手机上的记录` | 下拉刷新即重试；**不写"未接入/云端/本地"**（R-25 ①） |

#### 3.7.5 Web 完整版移动重排（R-27）

- ≥1024px：维持 `max-w-wide`（§2.2 的 `--max-wide` = 1120px），左「关键数字 4 张 + 曲线」，右「时段热力图 24×7 + 遗忘柱 + 复习折线」双列，`gap-6`（24px）。
- 768–1023px：单列，图表两两并排 `grid-cols-2 gap-4`。
- <768px（含手机内浏览器）：
  1. 顺序锁死：**1 组关键数字（3 列 `StatCard`，与 App 同一组件同尺寸）→ 1 条 `GrowthLine` → 其余图表**；
  2. 其余每张图**降级为「一张可点开的卡」**：卡内只留标题 + 一句话结论 + `查看图表`，点开为 `max-h-[80vh]` 底部抽屉内单图（`role="dialog"` `aria-modal` `aria-label="遗忘曲线"`），可左右滑切换上一张/下一张（`--dur-base 240ms`，reduced-motion 下淡入无位移）；
  3. **24×7 时段热力图在 375px 下不可读 → 改为分日列表**（`7 行 × (时段条 + 数字)`，横条用 `--chart-1`，其余 `--chart-grid`），抽屉里才给完整 24×7；
  4. 网页年热力图必须补齐 **月份轴 + 每日/每周/累计切换 + 点选信息条**（与 App 同一 `Heatmap` 组件，不允许两份实现，R-27 ③）；
  5. 页面根容器 `overflow-x: clip`（非 hidden，避免破坏 sticky），任何横向滚动只允许发生在 `.heatmap-scroll` 内。
- 术语清零（R-25 ①②，回归用例逐条 grep）：
  - 删除 `report/page.tsx:79-81` 的 `数据来源：ClickHouse 事件流 / 本地数据库（ClickHouse 未接入）` 整段 → 替换为 `数据截至 今天 09:20`（`{相对日期} {HH:MM}`，跨天显示`数据截至 6月30日 21:05`）；
  - 删除 `<Badge variant="outline">24h 缓存</Badge>`（`:182`）→ AI 洞察区标题旁不再有任何徽章；
  - `洞察已缓存` / `· 已缓存` 一律不显示；
  - 「AI 学习洞察」保留（是给人看的词），但**每张洞察下的技术脚注**（含 `stability`、`S:`、`掌握度变化（S）`）折叠进默认收起的「详细信息」`<details>`，其 summary 文案固定 `详细信息（技术）`；
  - 断线态文案统一 `连接断了 · 点这里重连`，重连后保留已输入内容（R-25 ③，见 §3.11 与 §6）。

#### 3.7.6 无障碍

- 语义：B 区是 `role="list"`（每卡 `listitem`，卡内按钮为真 `<button>`）；C/D 区各自 `<section aria-labelledby>`。
- 图表**必须**同时给文本替身：`GrowthLine` 容器 `role="img"` + `aria-label="近 30 天掌握词数增长曲线：从 42 词增长到 96 词，最近一天新增 5 词"`（由 `accessibleSummary` prop 生成，禁止只写"图表"）；`Heatmap` 容器 `role="group"` + `aria-label="每日背词热力图，最近一年，共打卡 63 天"`。
- 点选信息条：`aria-live="polite"` `role="status"`，未点选时不渲染文字（不播报"未选择"）。
- 数字：全部 `font-variant-numeric: tabular-nums`；刷新导致数值跳动时该卡 `aria-live="polite"`（**只有**手动刷新后播报一次，轮询静默）。
- 键盘：焦点序 = 刷新 → 卡1 → 卡2 → 卡3 → 模式1/2/3 → 浏览热力图 → 图表链接；`Escape` 关闭 Web 抽屉并把焦点还给触发卡。
- 触控：热力图格子 11px 是**视觉**尺寸，命中区用 `::before` 扩到 `24px`（相邻格扩 6px 后仍不重叠），且点选有 200ms 内的即时反馈（`--tap` 全局 44px 规则在格阵内按本条例外并在 §7 登记为唯一豁免）；模式切换按钮 `min-h-[44px]`。
- 色觉：色阶 + 虚线框 + 数值文本三重编码（§1.2.1）；`prefers-contrast: more` 下 L1 描边加 1px `--ink-muted`。

### 3.8 我的

> 组件源：App `apps/app/src/screens/MeScreen.tsx`（架构 §5.1 表 `page-me`→T-19，复用 `@tm/ui/patterns/StatCard`）；Web `apps/web/src/app/(user)/profile/page.tsx`（同一套行组件，宽屏单列 `--max-w-read`（680px）居中）。
> 一句话定位：这一页只做三件事——**你是谁（头像/昵称）· 你进步了吗（三张卡 + 打卡）· 你想让它怎么工作（每日目标 + 提醒 + 主题）**。任何"数据/同步/缓存"类运维信息不得出现在这里（R-25 ①），唯一例外是人话的 `已同步 · 20:31`。

#### 3.8.1 布局分区（自上而下顺序锁死，App 与 Web 一致）

| 区 | 内容 | 间距/尺寸 |
|---|---|---|
| A 顶栏 | 标题 `我的`（App 无返回箭头；Web 与顶栏菜单合并） | `--topbar-h` |
| B 账号头 | 56px 圆形头像 + 昵称（`text-base font-semibold`）+ 脱敏手机号（`138****8000`，`text-xs text-ink-muted`）；未登录时替换为登录引导（见 §3.8.5） | `pt-4 pb-4`，头像与文字 `gap-3` |
| C 三张统计卡 | `词本 N 词` / `累计复习 N 天` / `连续 N 天`；数字可点进明细（R-19 ② 口径） | `grid-cols-3 gap-3`，卡高 `84px`，`mt-1` |
| D 打卡常驻 | 一行：`今天已打卡 · 连续 12 天`（未打卡时`今天还没打卡`）+ 右侧按钮`去背单词`；**常驻**，不因滚动而隐藏 | `mt-3` `p-3` `rounded-lg bg-brand-soft`，高 `56px` |
| E 每日目标 | 标题行 + 滑杆 + 当前值 + **保存按钮** | `mt-4` 卡内 `p-4` |
| F 设置列表 | 有序列表：自动收藏 · 每日提醒时间 · 外观（浅色/深色/跟随系统）· 我的查询历史 · 修改密码 · 关于 | `mt-4`，行高 `min-h-[56px]`，行间 `--hair` 1px，末行不描边 |
| G 退出登录 | 单独一行危险色文字按钮，不混进 F 列表 | `mt-6 mb-2`，居中，`text-danger text-sm` |
| H 页脚 | 同 §3.1：12px `--ink-muted`，`ICP 备案编号` + 产品态度一行 | `text-xs leading-relaxed` |

- C 区三张卡的落点：`词本`→单词本 tab；`累计复习`→学习情况（Web：报告页）；`连续`→学习情况热力图滚到今天。**不再**跳"数字明细弹层"（无此页，别造）。
- 「同步状态」只在 D 区下方以 `text-xs` 出现一次：`已同步 · 20:31`；离线时 `还没同步 · 联网后会自动补上`；**永不**出现 `云端/本地/已连接/未连接`（R-20 ⑤、R-25 ①）。

#### 3.8.2 组件清单与来源

| 组件 | 来源 | 说明 |
|---|---|---|
| `Avatar`（shadcn） | `@tm/ui/primitives/avatar` | 56px（App）/ 64px（Web ≥1024）；缺图为品牌渐变底 + 昵称首字（`--brand-soft` → `--brand` 135° 线性渐变 + `--on-brand` 文字）；**不显示"暂无头像"文字** |
| `StatCard` | `@tm/ui/patterns/StatCard` | 与 §3.7 同一份，`tone` 不同 |
| `Slider` | `@tm/ui/primitives/slider`（Radix） | 见 §3.8.3 每日目标 |
| `Switch` | `@tm/ui/primitives/switch` | 轨道 44×24、把手 20px，整行都可点（命中 ≥44px 高） |
| `SettingRow` | 🆕 `@tm/ui/patterns/SettingRow.tsx`（本页与「更多」抽屉共用） | `{ icon, title, hint?, trailing?: 'chevron'\|'switch'\|'value', badge?, onClick }`；`trailing='value'` 时值右对齐 `text-ink-muted` |
| `ConfirmSheet` | `@tm/ui/patterns/ConfirmSheet` | 退出登录 / 放弃未保存目标 使用 |
| 时间选择 | 🆕 `apps/app` 侧走原生 `AlarmManager` 配好的分钟选择弹层；Web 侧 `input[type=time]` + 12px 帮助文案 | `role="dialog"`，`aria-label="每日提醒时间"` |

#### 3.8.3 每日目标：滑杆 + 明确保存 + toast（R-19 ②，替换现网"点别处静默保存"）

- 结构：`每日目标` 标题（`text-sm font-medium`）→ 滑杆 → 下方左右两端 `5 词` / `50 词`（`text-xs --ink-muted`）→ 卡底部**右对齐**主按钮 `保存`。
- 参数：`min=5 max=50 step=5`，默认 `10`；`aria-valuetext="20 词"`；轨道高 4px `--hair`，已填充段 `--brand`，把手 28px 圆 + 2px `--surface` 描边 + `--elev-2`，**把手命中区 44×44（透明 padding）**。
- 值显示：滑杆正上方一颗跟随把手的胶囊气泡（`bg-ink text-on-brand text-xs tnum h-5 px-2 rounded-full`），仅拖动中可见（`opacity` `--dur-micro` 淡入淡出；reduced-motion 下改为常驻显示在标题右侧、不跟随）。
- `保存` 按钮：`disabled` 当且仅当值未变化（`aria-disabled` + `--ink-muted`/`--hair`，**不降饱和度**）；dirty 时按钮转 `--brand` 实心并出现未保存小点 `●`（4px，`--warning`）在标题右侧。
- 保存成功 toast：`每日目标已更新为 20 词`（`--success` 描边 1px，3 秒自动收起，可点X）；失败 toast 带 `重试`。
- **禁止**：`onBlur` 静默保存、滑杆上方"自动保存"字样、离开页面时代替用户偷偷提交。
- dirty 时离开本页（点 tab / 返回）→ `ConfirmSheet`：`每日目标还没保存` / `要放弃这次修改吗？` / 按钮 `留在本页`（主）+ `放弃修改`（危险文字钮）。

#### 3.8.4 头像：只能从相册选，**删掉 URL 输入框**

- B 区整颗头像就是一个按钮：`aria-label="更换头像"`，右下角 20px 相机角标（`bg-surface` + `--hair` 描边，**角标不单独可点**，避免两个热区）。
- 点击 → 直接触发 `<input type="file" accept="image/*">`（`capture` 不加，交给系统）。**现网 `apps/web/src/app/(user)/profile/page.tsx:182` 的 `placeholder="头像图片 URL（可选）"` 输入框连同 `保存头像` 按钮一并删除**（R-04 的下游症状，PRD §5 已把"要求用户提供图片 URL"列为缺陷）；Web 侧改后**不再有任何文本框**出现在头像区。
- 选图后：本地先乐观裁成 200×200、压 JPEG（≤300KB，R-04 ①⑥）→ 立刻显示（`--dur-base` 淡入）→ 上传；成功后 5 秒内两端与顶栏一致（R-04 ④：`profile` query 失效重取 + `host.kv` 写回）。
- 错误文案（逐字，进 §6 总表）：过大 → `图片太大，请换一张 300KB 以内的`；格式 → `这张图片打不开，换一张试试`；网络 → `头像没传上去，你的账号其他内容不受影响` + `重试`。
- 长按/右键头像 → 菜单只有 `更换头像` / `移除头像`（两项，`role="menu"`）；移除后回落到品牌首字底，**不出现破图**。

#### 3.8.5 未登录 / 空 / 加载 / 错误

| 情形 | 视觉 | 文案（逐字） |
|---|---|---|
| 未登录（App，本地词本仍可用） | B 区替换为引导条；C/D/E 保留但数字用本地值；F 中「我的查询历史」「修改密码」隐藏 | `登录之后，换手机也不丢` / 副`词本、学习记录和提醒会跟着账号走。` / 主按钮`登录`、次按钮`注册`、下方文字`先不用，继续本机使用` |
| 未登录（Web `/profile`） | 整页 `EmptyState`（与 §3.7 同一份），不显示任何统计 | 同上三条 |
| 首屏加载 | 骨架：56px 圆 + 2 条 12px 文本条 + 3 个 `84px` 卡块 + 5 条 `56px` 行块（**行形状=真实行形状**） | 无文字（本页骨架不写文案，避免与错误文案打架） |
| 拉取失败 | 整页降级为一个错误卡（不显示半真半假的 0）；**降级只及内容区 —— H 区页脚（含备案号）保留常驻**（`04-adjudications.md` **A-86 #320 的 6A**，用户 2026-09-22/23 裁定；本条原句"整页"曾被读成连页脚一并摘掉并据此立钉＝旧 **F-36** 待裁项，裁定后措辞收口，页脚穿透的唯一例外是**在途态**，由下行与本行的区分维持）。实装：`apps/app/src/screens/MeScreen.tsx:462` `showFooter = showSettingsSections \|\| fetchFailed` | `账号信息没拿到` / `检查网络后再试一次，你的数据没有改动。` / 主按钮`再试一次`；次按钮`退出登录`仅在已登录态出现 |
| 通知被拒（R-21 ①） | F 区「每日提醒时间」行的 `hint` 变危险色 + `trailing` 变为可点文字 | `通知未开启 · 点这里去系统设置`（整行可点，跳系统通知设置页；不静默重试弹窗） |
| 提醒已开但 N=0 | 行值显示 `今天没有要背的词` | 不额外弹说明 |
| 强制改密待办（R-40） | F 区「修改密码」行右侧 `●`（`--warning` 8px）+ 标题下 `hint` | `需要先更新密码才能继续使用`；点击进 §3.9 的强制改密页（不是普通改密弹层） |

#### 3.8.6 控件状态与无障碍

- 所有 `SettingRow`：hover `bg-sunken`（Web 键盘可达，App 无 hover）；active 时整行 `scale-[0.99]`；focus 2px `--focus` ring 包住整行（`rounded-md`）；disabled 用 `--ink-muted` 文字 + 去掉 chevron，**不给行加灰底**。
- 开关：`role="switch"` + `aria-checked`，与标题 `<label htmlFor>` 绑定；状态切换 150ms，无弹跳。
- 列表：F 区 `role="list"`，行 `role="listitem"`；「关于」行进入关于页（版本号 + 用户协议 + 隐私政策 + 同步承诺一句：`你的词本和学习记录只属于你，可以随时导出或删除`）。
- 焦点序：头像 → 卡1 → 卡2 → 卡3 → 去背单词 → 滑杆 → 保存 → 各行 → 退出。
- 退出登录必须 `ConfirmSheet` 二次确认：`要退出吗？` / `手机上的词本会保留，下次登录还能接着用。` / `退出`（危险钮）+ `再想想`（主钮）；确认后 toast `已退出`。
- 触控：全部行 ≥56px、按钮 ≥44×44；滑杆把手命中 44；页脚文字距上方内容 ≥24px（防误触）。

### 3.9 登录 / 注册 / 激活认领 / 强制改密

> 四个形态、**两个壳**：`@tm/ui/auth/AuthFormShell`（登录/注册/激活 = 三合一两态，R-39 ⑨，架构 §3.1 `packages/ui/src/auth/`）与 `@tm/ui/auth/ForcePasswordUpgrade`（强制改密，同目录）。文件落点：Web 弹窗薄壳 `apps/web/src/components/login-dialog.tsx`（架构 §7.2 已判"变薄壳，主体迁 `@tm/ui/auth`"）+ 强制改密页 `apps/web/src/app/upgrade-password/page.tsx`（**刻意在 `(user)` 组外**，不套登录墙与底部导航）+ 拦截层 `components/upgrade-gate.tsx`；App `screens/LoginScreen.tsx`、`screens/UpgradePasswordScreen.tsx`（渲染在 `GateLayout` 之外 → tab 栏隐藏）、`screens/SecurityScreen.tsx`（普通改密）。
> 铁律：**同一套字段、同一套校验常量、同一套文案**，两端逐字一致（`@tm/shared/contracts/auth.ts`）；两端任一处的错误提示都不得是 `500` 或"请求失败"。

#### 3.9.1 表单壳布局（登录态 / 注册态 / 激活态）

| 区 | 登录态 | 注册态 | 激活认领态（= 注册态，只改两处文案） |
|---|---|---|---|
| 标题 | `登录` | `注册` | `设置密码，拿回原来的词本` |
| 副标题 | `手机号 + 密码，30 天内不用重复登录` | `同一个手机号：设一个至少 8 位的密码即可激活并保留原有的单词本、学习卡片和打卡记录` | **同注册态副标题逐字复用**（R-39 ⑥） |
| 字段 1 | 手机号 | 手机号 | 手机号（从登录态报错过来时**已填**） |
| 字段 2 | 密码 | 密码 | 新密码 |
| 字段 3 | — | 确认密码 | 确认密码 |
| 协议 | — | `AgreementCheckbox` | `AgreementCheckbox` |
| 主按钮 | `登录` | `注册` | **`设置密码并激活`** |
| 次级文字链 | `没有账号？注册` | `已有账号？去登录` | 同注册态 |
| 底部小字 | `使用验证码登录`（12px，非按钮） | 同左 | 同左 |
| 公告条 `NoticeBar` | `当前登录方式：手机号 + 密码（短信验证码通道后续开通）` | 同左 | 同左 |

- **可交互元素计数（DOM/截图断言口径，与 §3.1.1 同风格）**：作用域 = 表单壳根 `[data-testid=auth-form]`；登录态 = 手机号 + 密码 + 主按钮 + 文字链 + 验证码小字 = **5**；注册/激活态 = 手机号 + 密码 + 确认密码 + 协议勾选 + 主按钮 = **5**（次级文字链与验证码小字计入"底部小字 ≤1 处"额度：两者合计不得 >1 个可见元素，若同屏出现即**不通过**——实现上把 `已有账号？去登录` 放标题右侧、`使用验证码登录` 放最底，走查按可见计数）。
- **激活认领不新增第三态**（R-39 ⑨ 末段）：DOM 结构、元素个数、tab 序与注册态**完全相同**，只换标题/主按钮文案；断言方式：注册态与激活态快照 diff 只允许 `textContent` 不同。
- 布局尺寸：Web 弹窗 `w-[min(92vw,380px)]`、`rounded-lg`、`p-6`（24px）、字段间距 `space-y-4`（16px）、主按钮距协议勾选 `mt-4`；App 全屏页 `--max-w-auth`（420px）居中、`px-5`、内容顶部 `pt-[calc(env(safe-area-inset-top)+24px)]`、主按钮吸底 `pb-[calc(env(safe-area-inset-bottom)+16px)]`（键盘弹起时不吸底，见 §2.4）。
- 输入框：高 `--field-h 48px`、`rounded-md`、`bg-surface`、`border --hair`；label 置于框内上方 12px `--ink-muted`（floating 不用，避免中英混排跳动）；placeholder 仅用于格式示例：手机号 `13800000000`，密码留空（**placeholder 不参与对比度判定，但必须用 `--ink-muted` 且不作为唯一提示**）。
- 手机号字段：`inputmode="numeric"` `autocomplete="tel"` `maxLength=13` 并本地格式化 `138 0000 0000`（**提交时去掉空格**，`INVALID_PHONE` 只按 11 位判定）；密码字段 `autocomplete="current-password"` / 新密码 `new-password`，右侧 `Eye`/`EyeOff` 切换（`aria-label="显示密码"` / `aria-label="隐藏密码"`，`aria-pressed`）。
- 登录/注册/激活成功 = **自动登录**（R-39 ⑧）：不出现"请登录"二次步骤；有 `pendingFavorite` 时直接完成收藏并 toast（R-16 ②）。
- 切换登录↔注册：手机号与协议勾选**保留**，密码与确认密码**清空**（R-39 ⑨），切换为 150ms 淡入 + `translate-y-1`，焦点落在第一个空的密码框。

#### 3.9.2 实时校验与强度条

- 校验时机：`onBlur` 首次、之后 `onInput` 实时（避免边打边红）；错误挂在字段下方 `text-xs text-danger` + `aria-describedby`，输入框 `aria-invalid="true"` + 边框 `--danger`。
- **`PasswordStrength`**（`@tm/ui/auth/PasswordStrength.tsx`）：仅在注册/激活/改密出现。位于新密码框下 4px。
  - 形状：4 段 4px 高、等宽、`gap-1` 的条 + 右侧 12px 文字。
  - 阈值（与 `password-policy.ts` 同源常量，前端不得自算第二套）：`<8 位` → 全条 `--hair` + 文字 `密码至少 8 位`（`--danger`）；`8–11 位且仅单一字符类` → 1 段 `--warning` + `建议更长一点，或混用字母和数字`；`≥8 且含两类` → 2–3 段 `--success` + `可以了`；`≥12 且含三类` → 4 段 `--success` + `很稳`。
  - 只写"够不够/更长更好"，**不显示"强弱百分比"、不显示 crack-time、不显示彩色 gauge 图**（避免"后台面板"感）。
  - `role="status"` `aria-live="polite"`，段条 `aria-hidden`。
- 确认密码：不等时实时提示 `两次输入的密码不一致`（`PASSWORD_MISMATCH` 同一字符串，前后端共用）。
- 协议勾选：`AgreementCheckbox` 16px 方框（**命中区整行 44px 高**），文案 `我已阅读并同意《用户协议》和《隐私政策》`，两个书名为 `--brand` 链接（`target=_blank`，点击不切换勾选态）；未勾选时主按钮 `aria-disabled`（外观 `--ink-muted`/`--hair`，不是半透明），点击给 `请先阅读并同意《用户协议》《隐私政策》` 并让焦点跳到勾选框。

#### 3.9.3 激活认领的用户旅程（视觉上只有 3 步）

1. 用户在**登录态**输错/用密码登录一个从未设过密码的号 → `NO_PASSWORD_ACCOUNT`（仅登录分支，R-01 ③）。
2. 表单下方出现一条 `--brand-soft` 提示卡（`p-3`、`rounded-lg`、12px 图标 `KeyRound` 18px）：
   `这个手机号还没设置过密码` / `点"设置密码激活"，用同一个手机号设一个至少 8 位的密码，就能拿回原来的词本和进度。` / 一颗**文字按钮**`设置密码激活`。
3. 点击 → **就地切到激活态**（同一壳、手机号保留、密码框清空、焦点进密码框、主按钮变`设置密码并激活`）。
- **禁止**（两端 grep 判据，§8）：`未设置密码，请用验证码登录`、`本期无法找回`、`请用其他手机号注册`、`旧进度无法迁移`、`联系管理员代设密码`（R-01 ④ / R-39 ⑥）。
- 激活成功：toast `密码已设好，原来的词本和进度都回来了`；随后进入首页，`今天还有 N 词要背` 与服务端一致（R-39 ⑤b 继承判据）。
- 激活失败（弱密码/不一致/配额）：留在激活态、不清手机号、不跳登录，错误按 §3.9.5 表；命中 `TOO_MANY_REQUESTS` 时**不静默失败、不指向验证码、不显示"已注册"**。

#### 3.9.4 强制改密页（R-40 ④：不可关闭、不可跳过）

- 视觉：与 App 登录页同壳但**无返回箭头、无关闭 X、无底部 tab、无「以后再说」**；Web 为全屏层（`app/upgrade-password/page.tsx` 独立路由 + `upgrade-gate.tsx` 拦截，业务路由直接访问会弹回本页）。
- 标题 `为了账号安全，请设置新密码（至少 8 位）`；副标题一句（逐字）：`这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。`
- 字段：`当前密码`（必填）+ `新密码` + `确认新密码` + `PasswordStrength`。**只有两个出口按钮**：主按钮 `更新密码并继续`（全宽）+ 其下居中文字按钮 `退出登录`。
- 强度/校验失败：留在本页、**不白屏、不踢回登录页丢失已输入内容**（R-40 ④ 末段）；`当前密码不正确` 计入失败锁 → `TEMP_LOCKED` 时提示 `失败次数过多，请 10 分钟后再试`（本页不显示倒计时按钮，只禁用提交）。
- 成功：签发正常 30 天 token、写 `pw_policy_version=1` → **回到用户第 1 步想去的那页**；toast `密码已更新` + 一条常驻 6 秒的信息条 `其他设备需要重新登录`（R-40 ③④）。
- 物理返回（App 返回键 / Web `←`）：不退出、不后退，页面 shake 一次（`--dur-fast`、位移 ≤4px；reduced-motion 下改为一次 1px 描边闪烁）并让焦点回到第一个字段。
- 待升级账号在旧 APK / 旧 Web 上只要求不崩溃并显示 `请在网页端 tmword.xyz 修改密码后重新登录`（R-40 ⑩，新 App/Web **不显示**这句）。
- 全站 0 处：`以后再说` / `稍后再改` / `下次提醒` / `已为您延至` / `宽限期`（R-40 ④⑨）。
- 普通改密（`SecurityScreen` / `(user)/profile/security/page.tsx`）复用同一表单组件，差异只有：有返回、标题 `修改密码`、按钮 `保存新密码`，无 `退出登录` 出口。

#### 3.9.5 错误码 → 界面落点（逐字文案，同步进 §6）

| code | 落点 | 文案（最终） | 可否重试 |
|---|---|---|---|
| `INVALID_PHONE` | 字段下 | `请输入正确的 11 位手机号` | 改了即通过 |
| `WEAK_PASSWORD` | 强度条 | `密码至少 8 位` | 同上 |
| `PASSWORD_MISMATCH` | 确认框下 | `两次输入的密码不一致` | 同上 |
| `AGREEMENT_REQUIRED` | 勾选框下 | `请先阅读并同意《用户协议》《隐私政策》` | 勾上即可 |
| `PHONE_ALREADY_REGISTERED` | 提示卡 | `这个手机号已经注册过，请直接登录` + `去登录`（手机号保留） | 切换 |
| `NO_PASSWORD_ACCOUNT` | 提示卡 | 见 §3.9.3 第 2 步 | 进激活态 |
| `OLD_PASSWORD_REQUIRED` / `OLD_PASSWORD_INCORRECT` | 当前密码框下 | `请输入当前密码` / `当前密码不正确` | 是 |
| `PASSWORD_SAME_AS_OLD` | 新密码框下 | `新密码不能和当前密码相同` | 是 |
| `CREDENTIAL_EXPIRED` | 全局（清凭据→登录） | `密码已修改，请重新登录` | 重登 |
| `PASSWORD_UPGRADE_REQUIRED` | 拦截跳本页 | `为了账号安全，请先设置新密码` | 是 |
| `SMS_NOT_CONFIGURED` | 验证码小字下方 | `短信通道暂未开通，请使用密码登录` | **不启动倒计时** |
| `TOO_MANY_REQUESTS` | 主按钮下 | `操作过于频繁，请稍后再试` | 等 60 秒后按钮自动解禁 |
| `TEMP_LOCKED` | 主按钮下 | `失败次数过多，请 10 分钟后再试` | 服务端解锁 |
| `REGISTER_CLOSED` | 提示卡 | `暂时无法注册，请稍后再试`（**不指向验证码**） | 开关恢复 |

**验证码入口硬规则（R-01 ⑥）**：点 `获取验证码` → **不发请求成功态、不显示"已发送"、不启动 60 秒倒计时**，直接在原位置显示 `短信通道暂未开通，请使用密码登录`；入口旁**常驻** 12px 说明 `短信通道暂未开通，验证码可能收不到`。60 秒倒计时逻辑保留但**永不触发**（真实通道接入时启用，见 §7 后续项）——任何"倒计时从 60 开始"的截图判为不通过。

#### 3.9.6 状态样式 / 加载 / 无障碍

- 主按钮：`h-12`（48px）、`bg-brand text-on-brand`、`rounded-md`、`font-medium`；hover `--brand-strong`；active `scale-[0.99]`；disabled（请求中）→ `--hair` 底 + `--ink-muted` 字 + 左侧 16px spinner（`aria-busy`），**文案不变**（不写"登录中…"，避免按钮宽度跳动）；提交中整表单 `aria-busy` 且 `pointer-events-none`（但字段仍可读）。
- 文字链 / 文字按钮：`text-sm text-brand underline-offset-2`，hover 加下划线，focus 2px ring；命中高 ≥44px（用 `py-3` 撑）。
- 弹窗：`role="dialog"` `aria-modal="true"` `aria-labelledby=标题`；打开时焦点进手机号（登录态则按 R-01 ⑤ **默认焦点在密码框**——DOM/截图断言：`document.activeElement` 为密码框），焦点圈闭在弹窗内，`Esc` 可关闭**未登录引导弹窗**（强制改密页**不可**关闭）。
- 遮罩：`bg-ink/45`（深色 `black/60`），无模糊（省性能，WebView 一致）。
- 错误出现/消失：150ms 高度展开（`grid-template-rows` 过渡，reduced-motion 下直接显示），错误图标 + 颜色 + 文字三重编码。
- 无障碍：手机号 `aria-describedby="phone-err phone-hint"`；焦点序严格按视觉自上而下；`Enter` 在主按钮提交；Android 软键盘不挤压表单（`visualViewport` 监听，滚动到可视，见 §2.4）；`user-scalable=no` 移除后允许缩放，长手机号字段不因缩放换行（`overflow-wrap: anywhere` 关闭，用 `input` 自然滚动）。

#### 3.9.7 登录态本地拦截（无错误码的两条 · **PM-fix7 定稿 · A-60 就地打戳**，定稿全文见 `01-prd-fix7.md` §三）

| 情形 | 视觉 | 定稿文案 | 可重试 |
|---|---|---|---|
| 登录态·密码框为空/纯空格，已点过`登录` | 该框下方内联错误位（错误槽同 §3.9.5 字段下级），焦点仍在该框；**不弹窗、不发请求** | `这里还空着，填一下再点登录`（**PM-fix7 定稿**；不出现"至少 8 位"式强度话术、不点字段名） | 手动（填上再点`登录`） |
| 登录态·输入内容超传输上限被拦 | 同上位置、同上形态 | `这里太长了，删短一点再点登录`（**PM-fix7 定稿**；**不出现任何数字/上限字样**，**不得**再引 `WEAK_PASSWORD` 的「密码至少 8 位」） | 手动（删短再点`登录`） |

> **本节两条的落地现状（A-60 戳）**：§3.9.5 表（`:1075-1092`）**一字不动**——该表首列是 `code`，本两条是纯本地拦截、服务端收不到请求，塞进去等于假装有码。自 **T-29r**（A-61）起，登录态这两条已经**不静默**（焦点进密码框、无话术、不发请求），本表两串由 **T-03r3 / E5-copy 轮**经既有 `passwordError` / `touched.password` 通道接入；接入前后**阈值判据与拦截行为不得变**（`passwordEmpty` / `passwordTooWeak` / `passwordTooLong`，判据只取 `limits.ts`）。

### 3.10 移动导航：底部 tab + 更多抽屉 + 顶栏

> 组件源：Web 🆕 `apps/web/src/components/mobile-nav.tsx`（底部 tab + 更多抽屉）+ ✏️ `components/header.tsx`（现 `:61` 的 `hidden md:flex` 就是 A-01「窄屏无导航」的病灶，必须与 mobile-nav 同时挂在 `(user)/layout.tsx`，靠 `md:hidden` / `hidden md:flex` 二选一，**不得**用 JS 断点判断）；App `apps/app/src/shell/TabBarShell.tsx`（架构 §5.4 ③：**App 专属、不入 `packages/ui`**，因为 Web 是顶栏语义）+ `shell/BackKeyBridge.tsx`（R-18 返回语义）。
> 两端共享同一份常量 `apps/web/src/lib/nav.ts` 的 `NAV_ITEMS`（架构 §5.5：Web 与 App 共用 href，**禁止两端各自硬编码菜单**）。

#### 3.10.1 定案 D-4：tab 文案与页面标题的分工

PRD 两处措辞不同（R-08 ① 写 `学习`，R-18 ① 写 `学习情况`）。裁决：**tab 标签用两字版，顶栏标题用全称版**——375px 五等分下 4 字标签必然截断。

| # | tab 标签（11px） | 图标（lucide，22px，`stroke-width 1.75`） | href / hash 路由 | 顶栏标题（`--topbar-h` 内，16px semibold） |
|---|---|---|---|---|
| 1 | `查词` | `Search` | `/` · `#/` | 无标题（首页不写"查词"，见 §3.1） |
| 2 | `背单词` | `Layers` | `/study` · `#/study` | `背单词` |
| 3 | `单词本` | `BookOpen` | `/wordbook` · `#/wordbook` | `单词本` |
| 4 | `学习` | `TrendingUp` | `/report` · `#/progress` | `学习情况` |
| 5 | `我的` | `User` | `/profile` · `#/me` | `我的` |

- 顶栏标题必须与**实际渲染的页面**一致（R-18 ⑤，回归用例逐 tab 截图；`#/progress` 的顶栏写`学习`即判不通过）。
- 全站只有一颗 `←`，语义唯一 = 回上一级（R-18 ③）；背词卡内那颗行为不同的 `←` 已按 §3.5 移除；tab 顶层页面**不显示** `←`。

#### 3.10.2 底部 tab 栏

- 容器：`position: fixed; inset-inline: 0; bottom: 0`，高 `var(--tab-h) 56px` + `padding-bottom: env(safe-area-inset-bottom)`；`bg-surface/95 backdrop-blur-[8px]`；顶边 1px `--hair`；`z-dock`（§1.10）。
- 每项：`flex-1`、`min-w-0`、整项命中区 = `56px 高 × 屏宽/5`（375px 时 75px 宽 ≥44px ✓）；图标上、标签下，`gap-1`（4px）；标签 `text-2xs leading-none`。
- 选中态：图标与标签 `--brand`（浅）/ `--brand`（深），标签 `font-medium`；未选中 `--ink-muted`。**颜色 + 字重双通道**；选中项**不加**底色块、不加下划线（5 项太挤）。
- hover（仅 Web ≥768px 不会渲染本组件，故 768 以下无 hover；指针设备走查用 `md:hidden` 隐藏即可）；focus-visible：2px `--focus` ring 包住整项（`rounded-full`），`aria-current="page"`。
- 按压反馈：`active:scale-[0.96]`，`--dur-instant 80ms`；切换页面时**不做**指示器滑动动画（跨组件难对齐，reduced-motion 也省事）。
- 滚动关系：内容容器统一 `padding-bottom: calc(var(--tab-h) + env(safe-area-inset-bottom) + 8px)`，保证搜索结果最后一条、单词本最后一行、完成页按钮都不被遮住（R-08 ⑤）；键盘弹起时 tab 栏收起的规则**不在本页重写**，直接实现 §2.4 的第 ② 条（`100dvh` + `visualViewport` + `scroll-margin-bottom`），且根容器用 `100dvh` 不用 `100vh`。

**待背数红点（仅第 2 项，R-18 ① / §8.3-B-5）**

| 条件 | 表现 |
|---|---|
| 词本为空 **或** `dueCount === 0` | 红点**不存在**（不是 `0`、不是灰点） |
| `1–99` | 红点为数字胶囊：`min-width 18px; height 18px; padding 0 5px; border-radius pill; bg --danger; color white; font-size 11px; font-medium; tabular-nums`，定位在图标右上角 `top:2px; right:calc(50% - 22px)`，描边 2px `--surface`（压在图标上仍可辨） |
| `≥100` | `99+` |
| `dueCount` 请求中 | 不显示红点（**不显示骨架点**，避免闪烁） |
| `dueCount` 请求失败 | 红点消失（回落到"无红点"），不显示 `!` 感叹号 |
| 未登录 | 不显示红点；改由首页胶囊 `登录后可同步，本机已背 N 词`（R-23，见 §3.1）承担 |

- 红点 `aria-hidden="true"`；文案进 tab 的 `aria-label`：`背单词，今天还有 12 个要背`（0 时 `背单词`）。红点变化不做单独播报（避免每 30 秒喂一次屏幕阅读器）。

#### 3.10.3 右上「更多」抽屉

- 触发按钮：**只在顶栏右上**（App/移动 Web），`44×44px`、图标 `MoreHorizontal` 22px + `sr-only`「更多」+ `aria-expanded` + `aria-haspopup="menu"`；顶栏左侧放标题，右侧只此一颗（顶栏不出现第二颗图标，除非是二级页的 `←`）。
- 内容（顺序锁死，架构 §5.5：`/chat`、`/assess`、主题、退出）：
  1. `和 AI 聊聊` → `/chat`（App 不做完整聊天窗，改为 §3.4 词详情/学习情况里的**预置问题快捷条** → App 抽屉里这一项写 `怎么记这个词` 并跳学习情况的快捷条锚点，**不出现"聊天/AI 对话"死链**；R-30 ②）
  2. `测一测词汇量` → `/assess`（App 仅在词本 ≥N 词时出现，R-28 ④）
  3. `外观` → 三段 `浅色 / 深色 / 跟随系统`（`role="menuitemradio"`，仅这三项，D-3）
  4. `我的查询历史` → §3.3 面板（Web/App 同一入口）
  5. 分隔线 `--hair` → `退出登录`（`text-danger`，`role="menuitem"`，走 §3.8.6 的二次确认）
- 形态：移动 Web = 从右滑入 `w-[min(86vw,320px)]` `bg-surface` `--elev-2`，`--dur-sheet 280ms`；App = 同一实现（`host.navigate` + 内部 state，不用原生菜单）。桌面 Web（≥768px）= 顶栏头像下拉菜单，同一份 items、同一 DOM 结构。
- 遮罩 `bg-ink/40`；点遮罩/`Esc`/再次点触发钮关闭；焦点圈闭，关闭后焦点回触发钮；`role="menu"` + `role="menuitem"`（外观三项为 `menuitemradio` + `aria-checked`）。
- 抽屉里**不得**出现：同步状态、云端/本地、缓存、`已连接/未连接`、版本号以外的运维信息（版本号只出现在「关于」页）。

#### 3.10.4 顶栏分档

| 断点 | 顶栏 | 一级导航 |
|---|---|---|
| <768px | 左标题（16px semibold）+ 右 `更多`；二级页时左为 `← 上一级`（文字可省略，仅图标 + 14px 标题），高 `56px` | 底部 tab（§3.10.2） |
| 768–1023px | 左 logo + 标题，右 `更多` 保留（横排 5 项在 768 会挤，且 thumb 更近） | 底部 tab |
| 1024–1279px | 左 logo、中间横排 5 项（`text-sm`，当前项 `--brand` + 3px 下划条）、右头像菜单 | 顶栏横排 |
| ≥1280px | 同上 + 单词本页出现侧边栏（§3.6.5），顶栏不重复放词本筛选 | 顶栏横排 |

- ≥1024px 时底部 tab 与 `更多` 抽屉**必须不渲染**（不是 `display:none` 后仍在 DOM；DOM 断言：`nav[aria-label="主导航"]` 在 ≥1024 视口下计数 0），桌面形态不回退（R-08 ⑥）。
- 顶栏吸顶 `z-sticky`，滚动 4px 后加 `--hair` 下边线（未滚动时无边线、无阴影）。

#### 3.10.5 Android 返回键与可发现性

- 规则（R-18 ④，`BackKeyBridge` 单点实现）：二级页 → 上一级；tab 顶层 → 切到 `查词` tab；已在 `查词` tab → 弹 `ConfirmSheet`：`要退出明日记忆吗？` / `今天还有 12 个词没背。`（N=0 时这句改为 `今天的词都背完了。`）/ 按钮 `留在应用`（主）+ `退出`（危险文字钮）。**不静默杀进程、不"再按一次退出"**（两次按键盲操作对手指不友好）。
- 每个 tab 顶层 ≤2 次点击可达其任意二级页（R-18 ② / §8.3-A 走查）：tab(1) + 行/卡(1)；实现上禁止三级模态叠加。
- 未登录时 5 个 tab 全部可点（查词/背词/单词本/学习/我的都允许本地用），**不得**在 tab 上盖锁图标（R-23 拆登录墙）。

#### 3.10.6 无障碍与状态

- `<nav aria-label="主导航">` + `<ul>` 5 个 `<li><a>`；当前项 `aria-current="page"`；焦点序 1→5 与视觉一致。
- 抽屉菜单打开后焦点进第一项，`↑↓` 移动，`Esc` 关闭并 `focus()` 回触发钮；`aria-expanded` 双向同步（不是只在 click 时改）。
- 图标全部 `aria-hidden="true"`（文字/`aria-label` 承载语义）；红点见 §3.10.2。
- 加载：导航栏永不做骨架（5 项是静态的）；红点无骨架。
- 错误：路由跳转失败（App `#/` 非法 hash）→ 回落查词 tab + toast `这个页面打不开，已经回到查词`。
- 触控：5 项每项 ≥44×44（实测 75×56）；`更多` 44×44；抽屉每行 ≥48px 高；tab 与系统手势条（Android 三键/手势区）用 `env(safe-area-inset-bottom)` 隔离，最小 16px。

### 3.11 全局组件

> 目录：`packages/ui/src/primitives/*`（架构 §3.1 列的 13 个，自 `apps/web/src/components/ui/*` 迁入，T-04 后 Web 侧删原件）+ `packages/ui/src/patterns/*`。
> **本文件在架构清单（§3.1 的 12 个 patterns）之上只新增 6 个组件**：`@tm/ui/patterns/Toast`、`/Markdown`、`/QueueSwitch`、`/SessionSummary`、`/ReviewCta`（§3.1 首页"今天还有 N 词要背"胶囊）、`/SettingRow`（§3.8 设置行），外加 1 个 primitive 补项 `slider`（§3.8 每日目标用，shadcn 标准件、走 Radix `react-slider`）。除此之外不得新增全局组件，也不得在页面里私写第二份 toast/dialog 样式。
> 所有组件**零网络、零 store**（`.dependency-cruiser.cjs` 的 `ui-no-io`）：toast 走 `host.toast`，导航走 `host.navigate`，存储走 `host.kv`。

#### 3.11.1 Toast（含撤销）

| 维度 | 规范 |
|---|---|
| 位置 | App / 移动 Web：`bottom: calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px)`，水平居中，`w-[min(92vw,420px)]`；桌面 Web（≥1024）：右下角 `right-6 bottom-6`，宽 `360px`，多条向上堆叠 `gap-2`，最多同时 3 条（旧的静默移除，不做飞走动画） |
| 层级 | `z-toast`（§1.10，高于 dialog 之外的全部） |
| 外观 | `rounded-full` + `--elev-2`。**浅色主题**：`bg-ink text-on-brand`（深底反白，在任何页面底色上都可读）；**深色主题**：`bg-surface text-ink` + 1px `border-hair`（深色下 `--ink` 已是浅字，禁止再套 `bg-ink` 否则白字白底）。两套均由 token 类给出，组件内不写条件类（§5.1） |
| 结构 | 16px 图标（可选）+ 文案（`text-sm`，最多 2 行，超出省略号）+ 右侧动作按钮（可选）+ 关闭 X（可选） |
| 时长 | 普通信息 `3000ms`；**带撤销 `5000ms`**（与 §3.6 删除撤销同值）；错误 `6000ms` 且必须可点关闭、不自动消失于内容被遮挡处 |
| 动效 | 进入 `translateY(8px)+opacity 0→1`，`--dur-base 240ms`，`cubic-bezier(0.2,0.8,0.2,1)`；退出 `150ms` 淡出；reduced-motion：淡入淡出各 1ms、无位移 |
| 撤销按钮 | 文案固定 `撤销`，`underline underline-offset-2 text-current`（跟随 toast 前色：浅主题=白、深主题=主文本色，**不写死 `text-on-brand`**），命中 ≥44px 高（`py-3 px-2`），hover 只加粗；点击后立即关闭 toast 并回滚，`role="button"`（不是链接） |
| 无障碍 | 信息/成功：`role="status"`（`aria-live="polite"`）；错误/可撤销删除：`role="alert"`（`assertive`）；容器 `aria-atomic="false"`；动作按钮可被键盘 Tab 命中，`5s` 窗口内不移除焦点圈；Toast **不抢焦点** |
| 禁令 | 不出现 `成功！`、`操作成功`、`Error: xxx`、`code: 500` 式文案（一律人话，见 §6）；不做进度条式倒计时（除错误外的自动消失不需要进度） |

Web 适配：`apps/web/src/lib/host.tsx` 内把 `host.toast(msg,{tone,action,undo})` 转 `sonner.toast`，`position/className` 由 tokens 注入；**页面不得直接 `import { toast } from 'sonner'`**（`tools/boundaries.mjs` grep 判据：`from 'sonner'` 只允许出现在 `lib/host.tsx`）。App 用同一 `Toast` 组件自绘，不引 sonner。

#### 3.11.2 Dialog / `ConfirmSheet`

- 结构：`Dialog`（桌面居中）与 `ConfirmSheet`（移动底部）是**同一组件的两个 variant**，同一份 props `{title, description, confirmText, cancelText, tone='default'|'danger', onConfirm, onCancel}`。
- 尺寸：桌面 `w-[min(92vw,440px)] p-6 rounded-lg`；移动底部抽屉 `rounded-t-lg`（上圆角 14px，下边无圆角）`p-5` + `pb-[calc(env(safe-area-inset-bottom)+20px)]`，拖拽把手 40×4px `bg-hair` 居中顶部 `mt-2`（**纯装饰**，`aria-hidden`，不实现真实手势拖拽）。**满高与留距【A-86 #319 的 4C ＋ A-91 拍数值与机制】**：两 variant 同一颗上限 = `max-h-dialog` → token `--dialog-max-h`（`@supports (height: 100dvh)` **双声明**：常青内核 `100dvh`、老内核兜底 `92vh`；实装 `packages/ui/src/styles/tokens.css` + `tailwind-preset.ts` 的 `maxHeight.dialog`）。**Web 侧计算值不变**（走 `100dvh` 支，与替换前的 `max-h-dvh` 同值）；**App 侧**由 §1.12.3 第 4 条覆写为 `calc(100vh - var(--sp-6) * 2)` ⇒ 375×667 档上限 **619px**、居中态上下各留 **24px**（改前现状：面板自然高 633.8px ⇒ 每侧约 16.6px，见 A-72 #215；⚠ A-86 #319 把它写成「合计 16.6px」是笔误，已在 A-90/A-91 更正为**每侧**）。底部抽屉 variant（`bottom-0` 锚定）在同一颗 token 下表现为**顶部留 48px、底部贴边**，这是正确形态。⛔ 不许用两颗 `max-h-*` 工具类堆叠实现（`cn()=twMerge` 归同组、后者吃掉前者，A-72 #215 实测判死）。
- 按钮排布（写死，避免两端"猜"）：桌面右下角 `[取消]`（`variant=outline`）→ `[确认]`（`variant=default`，danger 时 `bg-danger`）；移动为**全宽堆叠**：`[确认]` 在上（`h-12`）、`[取消]` 在下（文字按钮，`h-11`）。破坏性动作的确认按钮**永远不预聚焦**（键盘 Enter 不得直接删数据）。
- 状态：`aria-modal` `role="dialog"` `aria-labelledby/ describedby`；焦点圈闭，`Esc`/遮罩可关（除强制改密、删除进行中之外）；关闭后焦点回触发元素；遮罩 `bg-ink/45`（深 `black/60`）。
- 禁用态：`onConfirm` pending 时确认按钮 `aria-busy` + spinner（文案不变），取消按钮同时禁用（防半途关窗）。
- 动效：遮罩 200ms 淡入；面板 ~~`translate-y-4→0` + 淡入 `--dur-base`~~ **【A-86 #316 · 用户裁定 3A：改措辞以匹配已交付实装，非放松要求】入场竖向位移为 8px（不是 16px），且由 preset 关键帧 `dialog-in`（`packages/ui/src/tailwind-preset.ts:264-266`）以 `translate(var(--tw-translate-x), calc(var(--tw-translate-y) + 8px)) → translate(var(--tw-translate-x), var(--tw-translate-y))` 的形式实现 ⇒ 与面板的 `translate-x-[-50%] translate-y-[-50%]` 居中式**正交**（T-13r 交付；原句的 `translate-y-4` 是写死 transform 的工具类，与居中式互斥，实装上做不到）。淡入时长仍 `--dur-base`。reduced-motion 全部 1ms 淡入。

#### 3.11.3 Skeleton（骨架）

- 基元：`@tm/ui/primitives/skeleton`，`rounded-xs`、底色 `bg-sunken`、shimmer 渐变 `--brand-soft → transparent`（深色用 `--brand/12%`），`background-size 200%`，`animation: shimmer var(--dur-skeleton) linear infinite`；reduced-motion → **停掉位移**，改 `opacity .55↔.8` 1200ms（或完全静止，二选一，禁止跑流光）。
- 语法（各页 §3.x 已指定形状，这里定总规则）：骨架块必须**与真实元素同形同位**——文本行用 12 / 14 / 16px 三档对应 `text-xs / text-sm / text-body`，卡用 `rounded-lg`，行用 56px，图片/头像用正圆或 `rounded-lg`，图表用 §3.7.4 的网格/曲线轮廓。**禁止一整块灰板糊住全页**。
- 高度写法豁免：§1.7 的"禁止任意值"只管 `p-/m-/gap-`；骨架与实元素的 `h-`/`min-h-` 允许任意值，但必须等于该页真实元素高度（不一致即返工）。
- 数量：一个页面骨架元素 ≤10 个块；骨架**不加**"加载中…"文字（除非该区域 >1s 且文案已在 §6 定稿，如 `正在整理学习记录…`）。
- 时长闸门：真实数据 <200ms 返回时不闪骨架（`useSuspenseQuery` 的 `minDuration: 200` 或在 `Skeleton` 外层做 delay）。
- 无障碍：容器 `aria-busy="true"` + `role="status"` + `sr-only` 的 `正在加载`；骨架块自身 `aria-hidden="true"`。

#### 3.11.4 Badge / 状态标记（**技术徽章一律清零**）

| variant | 浅底/深底 | 用途 |
|---|---|---|
| `brand` | `bg-brand-soft text-brand-strong`（深：`bg-brand/18 text-brand`） | `新词` / `在背` / `已掌握` 三态词状态、词性 |
| `neutral` | `bg-sunken text-ink-muted` | 计数（`41`）、释义语言标记 `英` |
| `success` | `bg-success-soft text-success` | 打卡完成、同步成功的一次性标记 |
| `warning` | `bg-warning-soft text-warning` | 需要更新密码、通知未开启 |
| `danger` | `bg-danger-soft text-danger` | 冲突需人工、删除提示 |

- 尺寸：`text-2xs leading-none h-4 px-2 rounded-full font-medium`（11px 字 + 16px 高，见 §1.5 的 `2xs` 附加条件：必须 ≤1 行）；同屏 Badge ≤3 个（多了就是"后台面板"）。
- **禁止存在**（R-25 ① / §8 grep）：`ClickHouse`、`未接入`、`24h 缓存`、`S:`、`stability`、`掌握度变化（S）`、`已连接`、`未连接`、`云端`、`本地`、`缓存中`、`同步中 · baseVersion=…`。
- 状态不能只靠颜色：Badge 必须有文字；红点/小点是例外（§3.10 已给 `aria-label`）。

#### 3.11.5 Markdown 容器（AI 输出与 mnemonic 共用）

- 源：现 `apps/web/src/components/markdown.tsx`（`react-markdown` + `remark-gfm`）迁为 `@tm/ui/patterns/Markdown.tsx`，props `{ content, tone?: 'default'|'compact', links?: 'plain'|'word' }`；App 侧同一组件（**不引 `dangerouslySetInnerHTML`**，`renderBuiltUrl` 下允许把 md 源打进包，见架构 §5.6）。
- 排版：根 `text-sm leading-[1.7] text-ink`；`h1/h2/h3` → `text-base/font-bold`、`text-sm/font-bold`、`text-sm/font-semibold`，上间距 `mt-3`（12px）下 `mb-2`（8px）；`p` 下 `mb-2`；`ul/ol` `ml-4 space-y-1`；`hr` `my-3 border-hair`。
- 语义类替换（**旧类名全部改掉，否则深色下不可读**）：`text-foreground`→`text-ink`、`bg-muted`→`bg-sunken`、`border-primary/50`→`border-brand/40`、`text-muted-foreground`→`text-ink-muted`、`text-primary`→`text-brand`。
- `code`：`rounded-xs bg-sunken px-1 font-mono text-[0.85em]`；`pre` 额外 `p-3 overflow-x-auto max-w-full`（横向滚动不外溢，`overscroll-behavior-x: contain`）。
- `a`：`text-brand underline underline-offset-2` + `target=_blank rel=noopener noreferrer`；App 内点击走 `host.navigate` 或 `window.open` 由宿主决定（组件不判断环境）。
- `links="word"`（AI 回答中的词条）：渲染为 `LookupLink`——`text-brand` + 按下划线虚线 `border-b border-dashed border-brand/50`，点击进词详情（`?from=chat`），hover `bg-brand-soft`；每条回答最多渲染 8 个词链（超出截断并在末尾 `…`），避免"整屏都是链接"。
- 表格：`block overflow-x-auto` + `whitespace-nowrap` 于 ≥2 列时（移动端不撑破布局）；表头 `bg-sunken text-xs text-ink-muted`。
- 不可信内容：`remark-gfm` 已关 HTML（`skipHtml` 或 react-markdown 默认不渲染 raw HTML），**禁止**开 `rehype-raw`（XSS 面，B-03 的 React 化替代）。
- 状态：无内容时不渲染容器（不出现空 `div` 撑出间距）；流式输出时容器高度稳定（`min-h` 用最后一行占位），尾部一个 2px×14px `--brand` 光标，1s 闪烁；reduced-motion 下光标常亮不闪。

#### 3.11.6 图表与配色（recharts 适配规则）

- 全部颜色读 §1.2.1 的 `--chart-*` / `--heat-*`，写法 `stroke="var(--chart-1)"`、`fill="url(#areaBrand)"`；渐变 `<stop stopColor="var(--chart-1)" stopOpacity={0.22}/>`（面积）；**不允许** `#RRGGBB` 或 `rgba()` 字面量出现在 `apps/**`、`packages/ui/**` 的 `.tsx`（§8 grep 判据）。
- 线宽：主 series `2px`、对比 series `1.5px` 虚线 `4 3`；点：默认 `dot={false}`，activeDot `r=3.5` + `strokeWidth=2 stroke var(--surface)`；网格线 `stroke var(--chart-grid)`、`vertical={false}`；轴：`tick={{ fontSize: 12, fill: 'var(--chart-axis)' }}`、`axisLine={false} tickLine={false}`。
- Tooltip 容器：`rounded-md border border-hair bg-surface px-3 py-2 text-xs elev-2`；`labelStyle={{ color: 'var(--ink-muted)' }}`；数值 `tnum text-ink`；移动端不依赖 hover tooltip（必须有可点选信息条或可点开单图，见 §3.7.5）。
- Legend：`text-xs text-ink-muted`，色块 8px 方 + `1px` 描边 `--hair`，**不加**"系列 1/2"式默认命名（必须中文：`本周`/`上周`）。
- 明暗两套的额外要求：深色下面积图不透明度减半（`0.12`）、柱图加 `--hair` 顶边描边以免与卡背景粘连；`--chart-2/3` 在深色下已提亮（§1.2.1），组件侧不得再手写 `opacity` 调色。
- 动效：`isAnimationActive` = `!prefersReducedMotion`（Web 用 `useReducedMotion()`、App 用媒体查询 hook，两端各一处，不新增依赖）；`animationDuration 400ms`、`easing 'ease-out'`；reduced-motion 下直接出终态。
- 空数据：画一条 `--hair` 基线 + 中央 `text-xs text-ink-muted` 文案（走 §3.7.4 的文案），**禁止** `No data`、`undefined`、`NaN` 上屏（`Number.isFinite` 守卫，格式化函数只有一份在 `@tm/ui/patterns/format.ts`）。

#### 3.11.7 其余全局件（一句话规格）

| 组件 | 规格 |
|---|---|
| `EmptyState` | 图标 64px 线性（`--ink-muted`）+ 标题 15px/medium + 说明 13px/`--ink-muted`（≤2 行）+ 主按钮 1 颗 +（可选）次按钮；上下留白 ≥40px；**禁止**"暂无数据 + 灰色大卡片"三件套（§3.1 已移） |
| `ProgressBar` | 高 6px `rounded-full`，槽 `--surface-sunken`，填充 `--brand`（打卡进度）或 `--warning`（配额）；`role="progressbar"` + `aria-valuenow/min/max` + `aria-valuetext="今天 8 / 10 词"`；进度变化 240ms 宽度过渡，reduced-motion 关闭 |
| `Chip`（筛选） | 高 32px、`px-3 rounded-full border --hair bg-surface text-sm`；选中 `bg-brand-soft border-brand/35 text-brand-strong font-medium`；可带计数 `41`（`tabular-nums`，`--ink-muted`）；横向 `overflow-x-auto` + `scrollbar-none`，**不换行**（§3.6） |
| `IconButton` | 44×44 命中、图标 20px；`aria-label` 必填（无 label 即 lint 不过）；tone `default/muted/danger` |
| `Divider` | 1px `--hair`，`my-4`（16px）；分节标题下的线不加（避免管理台面） |
| `Spinner` | 16/20px 两档，`--brand`（浅底）或 `currentColor`，`--dur-spin 900ms` linear；reduced-motion 下**既不旋转也不呼吸**（§7.8），改静态环 + `aria-busy="true"` + 同行文案 |
| `SkipLink` | `sr-only focus:not-sr-only`，固定 `top-2 left-2 z-toast`，文案 `跳到主要内容`，Web 与 App 都要有，指向各页 `<main id="main">` |
| `Tooltip` | 桌面仅用于图标按钮；`bg-ink text-on-brand text-xs rounded-md px-2 py-1`，延迟 500ms，`role="tooltip"` + `aria-describedby`；移动端**不用** tooltip 承载任何必要信息（触屏不可达） |
| `Sheet`（底部抽屉） | 见 §3.11.2 / §3.6；把手 + 顶圆角 16px + `max-h-[80vh]`，内部滚动、外部不滚 |

## 4. 双端复用与差异表

> 判定原则：**"同一件事"只能有一份实现**——所有承载"含义"的东西（颜色、文案、校验、排序口径、组件状态机）必须同源；只有"宿主物理差异"（导航形态、hover 可用性、尺寸、安全区、返回键）才允许分叉，且逐项登记在本表。任何未登记的差异 = 缺陷。

### 4.1 组件级复用矩阵

| 组件 / 资产 | 包 | Web 形态 | App 形态 | 允许的差异（且仅此） |
|---|---|---|---|---|
| `tokens.css` / `tailwind-preset.ts` | `@tm/ui` | `globals.css` `@import` | **构建期内联进 `index.html`**（架构 §3.4：`file://` 下不额外发 CSS 请求） | 加载方式；**值不得不同** |
| `SearchBar` | patterns | 首页吸顶 / 词本工具条 | 首页 `z-dock` 绝对层 | 高度 50px 固定；聚焦时 sticky 行为（§2.4） |
| `LookupResultBar` | patterns | 全宽卡，含 `查看详情` + `收藏` | 同，收藏为图标钮 | 桌面可显示 2 义项、移动 1 义项（截断规则同一份 `format.ts`） |
| `RecentSearchPanel` | patterns | 聚焦下拉（`z-pop`） | 全屏遮罩面板 | 呈现容器；数据/清空/上限 20 条同源 |
| `WordDetailCard` | patterns | 独立路由页 | `#/word/:w` | 无（`?from=`/`#from=` 语义一致） |
| `Flashcard` + `RatingBar` | patterns | `/study` | `#/study` | 桌面卡 ≤600px 居中；评分条四档恒等分（禁 `.primary-rate`） |
| `WordbookList` / `FilterChips` / `SortMenu` | patterns | 一级页 + ≥1280 侧栏复用（≤60 行壳） | 一级页 | 侧栏只在 Web/≥1280；筛选口径与排序枚举**同一份常量** |
| `Heatmap` / `GrowthLine` / `StatCard` | patterns | 报告页（recharts 适配壳留 Web） | 轻学情页 | 尺寸/高度；色值与三模式同源（R-27 ③） |
| `EmptyState` / `ConfirmSheet` / `Toast` / `Markdown` / `Skeleton` / `Badge` / `Chip` | patterns/primitives | 同 | 同 | toast 位置（§3.11.1）仅此一项 |
| `AuthFormShell` / `ForcePasswordUpgrade` / `PasswordStrength` / `AgreementCheckbox` / `NoticeBar` | `@tm/ui/auth` | 弹窗 + `upgrade-password` 路由 | 全屏页 + `UpgradePasswordScreen` | 容器（弹窗/整页）；字段、校验、错误码、≤5 计数同源 |
| `TabBarShell` | `apps/app/src/shell` | ✗（Web 用 `header` + `mobile-nav`） | ✓ | **不同源**（导航语义不同），但 `NAV_ITEMS` 必须同一份 |
| `BackKeyBridge` / `AndroidBridge` / 通知 / 小组件 | `apps/app` + 原生 | ✗ | ✓ | App 专属，不算 fork |

### 4.2 必须完全同源、禁止分叉的清单（出现两份即返工）

1. 颜色/圆角/间距/动效全部 token（§1）；两端任何 `#RRGGBB`、`rgba(` 字面量。
2. 文案：错误码→人话映射（§6/§3.9.5）、空态与引导语、四档评分 `RATING_LABELS`、词形变化 `INFLECTION_LABELS`、同步状态句、公告两句（R-01 ⑧/⑧b）。真源在 `@tm/shared`（`contracts/*` + `copy.ts`），两端只 import。
3. 校验规则：密码 ≥8、手机号 11 位、协议必勾 —— 与 `password-policy.ts` 同一函数导出。
4. 排序/筛选枚举与标签（字母/最新加入/最久没碰/最常忘；全部/新词/在背/已掌握）与写进 URL 的 query 键名。
5. 组件状态机：折叠/展开、撤销窗口 5s、四档评分键值 `1|2|3|4`、`aria` 角色与可交互元素计数口径。
6. 日期/数字格式化、"数据截至 …"、相对日期、`99+` 上限（`@tm/ui/patterns/format.ts` 唯一一份）。
7. 主题判定：只有 `light|dark|system`；同一首帧脚本逻辑（§5.3）。
8. 深色/浅色两套值的对应关系（§5.1）；`res/values{,-night}/colors.xml` 与 token 同名同值（§5.4）。

### 4.3 允许并登记在册的差异

| 维度 | Web | App | 理由 |
|---|---|---|---|
| 一级导航 | ≥1024 顶栏横排；<1024 底部 tab | 恒底部 tab（+ 顶栏右上更多） | §3.10 |
| hover / tooltip | 有（指针设备） | 无（触屏），信息改常驻或点选 | 触屏无 hover |
| 单词本侧栏 | ≥1280 可收起侧栏 | 无（首页永不挂载） | R-15 ⑨ / §3.6.5 |
| 列表列数 | ≥768 双列、≥1280 双列+侧栏 | 恒单列 | §2.3 |
| 完整 AI 聊天 | `/chat` 全功能 | 只做预置问题快捷条 | R-30 ② |
| 分析图表张数 | 4 图（重排后） | 3 卡 + 1 曲线 + 热力图 | R-19 ① / R-27 ① |
| toast 位置 | 右下（桌面）/底部居中（移动 Web） | 底部居中，tab 之上 | §3.11.1 |
| 字体加载 | 同一栈 | 同一栈（禁 webfont/CDN） | R-17 ① |
| 键盘/安全区 | `100dvh` + `viewport-fit=cover` | 同 + `AndroidBridge` 焦点/返回键 | §2.4 |
| 状态栏/系统色 | 不适用 | `--brand` 同步到原生 `colors.xml` | §5.4 |

## 5. 深色模式规范

> 唯一机制：**`.dark` 类 + 同名 CSS 变量覆盖**。组件永远只写语义类（`bg-surface` / `text-ink` / `border-hair`），**不写** `dark:` 前缀条件类（除 §5.5 列出的 3 个例外）。R-29 ②要求 6 页 × 明暗 12 张截图走查、全部文本 ≥4.5:1；§1.4 已把每个关键节点算过，本节负责"怎么落地、哪些东西会漏"。

### 5.1 变量映射（明 ↔ 暗，同名不同值）

| 语义 | 浅（`:root`） | 深（`.dark`） | 深色下的规则 |
|---|---|---|---|
| `--bg` | `150 12% 97%` `#f6f8f7` | `165 25% 6%` `#040d0b` | 页面底，装饰层铺其上 |
| `--surface` | `0 0% 100%` | `167 19% 9%` `#121816` | 卡/弹层/输入聚焦底 |
| `--surface-sunken` | `150 13% 94%` | `162 16% 13%` | 深色下**提亮**（不是压暗），承担"分层" |
| `--brand-soft` | `165 32% 93%` | `168 42% 14%` | 柔面在深色下仍是低饱和，禁止变成发光绿块 |
| `--ink` | `162 25% 10%` | `155 20% 88%` | 主文本；**深色下 `--ink` 是浅色**，所以任何"用 `bg-ink` 反白"的组件必须同时换前色（§3.11.1 toast 即此类） |
| `--ink-muted` | `161 8% 39%` | `160 8% 63%` | 12px 灰字在深色底 ≥4.5:1 |
| `--hair` | `154 11% 88%` | `160 13% 18%` | 深色描边 = "亮一点点"，**不用 rgba 白** |
| `--brand` | `170 75% 24%` | `167 47% 55%` `#56c2ab` | 主色提亮降饱；`bg-brand` 上的文字必须切 `--on-brand` 深绿 |
| `--brand-strong` | `170 76% 16%` | `157 57% 68%` | 语义是"更强的强调"，深色下**变亮**不是变暗 |
| `--on-brand` | `0 0% 100%` | `166 71% 8%` | 品牌面上的字：浅=白、深=近黑绿（对比 ≥4.5:1，见 §1.4） |
| `--focus` | `170 75% 24%` | `157 57% 68%` | 焦点环必须两色都可辨 |
| `--success/--warning/--danger` | §1.1 | §1.3（全部提亮） | soft 底同名反转（深=同色 14% 亮度） |
| `--elev-1` | 有 | **`none`** | 深色下靠色差 + 描边分层（§1.9 ②） |
| `--elev-2` | `hsl(162 25% 10% / .10)` | `hsl(165 25% 2% / .55)` | 弹层阴影用近黑，禁止白色发光 |
| `--chart-*` / `--heat-*` | §1.2.1 浅列 | §1.2.1 深列 | 图表换套，组件不判断主题 |

**不得存在的东西**：`--bg-dark`、`--text-dark`、`.dark-bg`、`dark:bg-[#…]`、第二份 `colors-dark.css`、任何"如果深色就拼一个不同 hex"的 JS。

### 5.2 图片 / 图表 / 背景层

- **装饰层**（§3.1 首页柔光）：深色用 `--decor-a/b/c`（§1.2.1 已给 `.dark` 值），透明度 ≤12%，呼吸动画同一份 keyframes，reduced-motion 完全停止。禁止"深色下不加装饰层"（会显得两套产品）。
- **图片**：本期唯一位图类资产 = 用户头像。头像不加滤镜、不加白边；缺图态是品牌渐变 + 首字（§3.8.2），深色下渐变端改 `--decor-a → --brand`。禁止使用带白底的 PNG 图标（全部走 `currentColor` 的线性图标）。
- **图表**：`--chart-*` 两套；深色面积不透明度 `0.12`、柱加 1px `--hair` 顶边、热力图 L0 虚线框不变（§1.2.1 硬规则在两套都成立）。recharts 的 `CartesianGrid`/`Tooltip` 一律走 CSS 变量，不写 `stroke="#8884d8"` 式默认色。
- **骨架屏**：深色基色 `--surface-sunken`，shimmer 用 `--brand/12%`（浅用 `--brand-soft`）。
- **遮罩**：浅 `hsl(var(--ink) / .45)`，深 `hsl(0 0% 0% / .6)`（深色必须用纯黑才有"沉下去"的感觉，不算硬编码色值——写在 `.dark` 里）。

### 5.3 首帧不闪白（对齐架构 §3.4，逐条可验收）

1. Web：`apps/web/src/app/layout.tsx` 内 `<head>` 末段插入**同步内联脚本**（无 `defer`、无模块、无外部请求）：读 `localStorage['tm:theme']`（`light|dark|system`，默认 `system`）→ 若 `dark` 或（`system` 且 `matchMedia('(prefers-color-scheme: dark)').matches`）则 `documentElement.classList.add('dark')`；并把 `color-scheme` 一并设为 `dark`/`light`。根 `<html>` 加 `suppressHydrationWarning`（预期 DOM 差异只在这一处）。
2. 删除 `theme-provider.tsx`（架构 §3.4 定案）与任何 React 层的 `useEffect(() => addDark())` —— **effect 里改类必然晚于首帧**，这是"闪一下白"的唯一成因。
3. 切换主题 = 写 `localStorage` + 立即改 `documentElement` 类名（同一函数 `applyTheme()`，Web/App 各一份但逻辑逐行相同，且在 `@tm/ui/theme/apply.ts` 共享实现）。切换后**不重载页面**。
4. App（`file://`）：`apps/app/index.html` 的 `<head>` 内联同一脚本 + 构建期把 `tokens.css` 内联进同一 `<head>`（架构 §3.4）；`system` 档跟随 WebView 的 `prefers-color-scheme`（由 `values-night` 驱动，见 §5.4）。禁止在 Capacitor 侧再存一份主题偏好：偏好键固定 `tm:theme`，Web/App 同名。
5. 验收判据（机器可判，§8 引用）：`page.goto` 后**第一帧截图**（`screenshot: true` 于 `domcontentloaded`）在 `prefers-color-scheme: dark` 下页面根元素背景色必须 = `--bg` 深色值；出现 `#ffffff`/`#f6f8f7` 即不通过。

### 5.4 原生面（`res/values{,-night}` + 小组件）

- **原则**：CSS 变量是产品真源；`colors.xml` 只镜像**原生可见的 6 个色**，两边同名，并在 §8 用 grep 断言一致性。现网 `values-night/colors.xml` 只有 3 个色，且 `widget_hint #8A8F98` 在 `#262D2A` 上仅 ≈4.1:1 → 必须换。

| Android 颜色名 | `values/` | `values-night/` | = token | 用途 |
|---|---|---|---|---|
| `app_bg` | `#f6f8f7` | `#040d0b` | `--bg` | 启动窗口背景（`windowBackground`），消除冷启动白闪 |
| `widget_bg` | `#f6f8f7`（现 `#F4F5F6` 改） | `#121816`（现 `#262D2A` 改） | `--bg` / `--surface` | 小组件底（R-21 ⑥） |
| `widget_stroke` | `#dde4e1`（现 `#00000000` 改：深色下需要描边才看得出边界） | `#2b3a36` | `--hair` | 小组件描边 |
| `widget_text` | `#14211d` | `#d9e6e1` | `--ink` | 待背数大数字 |
| `widget_hint` | `#5b6b66`（现 `#8A8F98`，浅底 2.9:1 不达标） | `#a2b3ad`（现 `#8A8F98`） | `--ink-muted` | "登录后可见今日词单" / "查单词…" |
| `widget_accent` | `#0f6b5c` | `#56c2ab` | `--brand` | 进度条填充、"查"按钮 |

- 小组件进度条底槽：`widget_track` = `#eef2f0` / `#212d29`（`--surface-sunken`）。
- `SearchWidget.java` 里**禁止**任何 `Color.parseColor("#…")` 字面量，统一 `context.getColor(R.color.widget_accent)`；深浅两套由 `-night` 自动选，Java 侧不判断夜间模式。
- 状态栏：`values/styles.xml` 的 `android:statusBarColor` = `@color/app_bg`、`windowLightStatusBar` 在 `values/` = `true`、`values-night/` = `false`；导航栏同值。App 的 `--tab-h` 在刘海机覆写 64px（§1.12.3 白名单）。
- 通知（R-21 ②③）：`smallIcon` 单色白描边；通知文案固定 `今天还有 N 个词要背`（不走 CSS，见 §6）。

### 5.5 `dark:` 条件类的三个允许例外（其余一律不许）

1. `color-scheme` 相关的根样式（由内联脚本设，不算 `dark:` 类）。
2. 遮罩透明度（§5.2 末条）：`bg-ink/45 dark:bg-black/60`。
3. 纯装饰层的可见度微调：`dark:opacity-[.12]` 这类**只调 opacity/无颜色值**的写法。

判据：`grep -rn "dark:" apps packages/ui --include=*.tsx` 命中数 ≤3，且命中处必须能对上本表；出现 `dark:bg-\[`、`dark:text-\[#` = 返工（§8）。

## 6. 文案与术语对照表

> **文案唯一真源**：`packages/shared/src/constants/copy.ts`（界面静态文案）+ `packages/shared/src/constants/errors.ts`（错误码→人话，见 §3.9.5，本文件不重复那 14 行）。两端组件**只能 import，不得自带字面量**（§4.2 第 2 项）。
> 本节的作用是"把每一个格子填满最终汉字"，开发不需要再想措辞，QA 不需要再猜预期值。**表内文案即验收值，一字不改**（含间隔号 `·`、破折号、空格）。

### 6.1 命名口径（术语字典，全表引用此处）

| 概念 | 定名（唯一合法写法） | 代码常量 | 禁止写法 | 出处 |
|---|---|---|---|---|
| 三个学习模式 | `今日复习` / `学新词` / `随机自测` | `MODE_LABELS`、`'1'\|'2'\|'3'` | `复习`、`新词`、`自测`（缩写各自出现）、`Review/New/Random` | R-12 ① |
| 四档评分 | `忘记` / `困难` / `良好` / `轻松` | `RATING_LABELS` = `[1,2,3,4]` | `Again/Hard/Good/Easy`、`不认识`、`记得/模糊` | R-11 ① |
| 底部 tab | `查词` / `背单词` / `单词本` / `学习` / `我的` | `NAV_ITEMS`（§3.10.1） | 同一屏出现"背词""词汇本""进度" | R-08 ① / R-18 ① / 定案 D-4 |
| 页面标题 | `背单词` / `单词本` / `学习情况` / `我的` | 同上，`title` 字段 | tab 写 `学习` 而顶栏写 `进度`（不一致即 R-18 ⑤ 不通过） | R-18 ⑤ |
| 今日待背单位 | `N 个词`（数字与"个"之间不空格，"词"前不空格） | `formatDue(n)` | `N词`、`N words`、`N 个单词` | R-07 ① |
| 连签单位 | `连续 N 天` | `formatStreak(n)` | `打卡 N 天`、`Streak N` | R-13 ③ |
| 头像/昵称 | `头像` / `昵称` | — | `Avatar`、`用户名`（本产品无 username） | §3.8.4 |
| 每日目标 | `每日目标` / `词` | — | `Daily limit`、`配额` | §3.8.3 |
| 主题三态 | `浅色` / `深色` / `跟随系统` | `ThemeMode` | `夜间模式`、`护眼模式`、`自动` | D-3 |
| 技术细节折叠区 | `详细信息` | `DetailsDisclosure` | `原始数据`、`debug` | R-25 ④ |

### 6.2 内部术语 → 人话对照（R-25 ①，右侧列 = grep 断言 0 命中）

| 现在源码里的东西 | 改成（定稿，可粘贴） | 位置 |
|---|---|---|
| `ClickHouse` / `PG` / `SQLite` | 不出现；需要时间口径时写 `数据截至 今天 09:20` | `report/page.tsx:79-81` |
| `24h 缓存`（Badge） | `数据截至 今天 09:20` | `report/page.tsx:182` |
| `未接入` / `暂未支持` | 该区块整块不渲染；若必须解释：`这个功能还没上线` | assess/chat 各处 |
| `已连接` / `未连接` | `连接断了 · 点这里重连`（仅此一句；正常态不显示任何连接状态） | `chat/page.tsx:172-175` |
| `云端` / `本地` 徽章 | `已同步 · 20:31` / `还没同步 · 联网后会自动补上` / `待同步 3` | `wordbook-sidebar.tsx:98-101`、App |
| `S:` / `stability` / `掌握度变化（S）` / `稳定度` | `记住程度`；数字变化写成 `下次再见：4 天后` | 详情/学情 |
| `D` / `retrievability` / `衰减曲线` | `还要不要复习` + 一句人话；曲线标题 `复习安排` | `assess/page.tsx:192-196` |
| `p: hugged` / `3: hugs` / `1e: hugging` | 见 §6.3 中文标签表 | 卡面/详情 |
| `FSRS` / `算法` | 不出现，最多 `我们会根据你答的情况安排下一次` | 全局 |
| `userId` / `token` / `401` / `500` | 不出现；未登录写 `登录后可以继续` | 全局 |
| `同步冲突 409` / `WORDBOOK_STALE` | 静默重放，用户只看到 `已同步 · 20:31`（R-03 ④） | 词本 |
| `加载失败，错误码：xxx` | 见 §6.4 各页错误态文案 | 全局 |

### 6.3 词形变化中文标签（R-09 ⑤ / R-14 ⑤，`INFLECTION_LABELS`）

| 原始缩写 | 定稿标签 | 原始缩写 | 定稿标签 |
|---|---|---|---|
| `p:` | 过去式 | `R:` | 比较级 |
| `d:` | 过去分词 | `T:` | 最高级 |
| `f:` / `ing:` | 现在分词 | `s:` | 第三人称单数 |
| `1e:` / `2e:` / `3e:` | 复数形式（`1e:` 主复数、`2e:` 次复数不展示） | `z:` | 副词形式 |
| 无任何变化 | 整块不渲染（禁止出现"词形变化"空标题） | 未知缩写 | 整条不渲染，并上报 `logMeta('inflection_unknown')` |

渲染格式：`过去式 hugged · 过去分词 hugged`（标签 `text-xs text-ink-muted`，词形 `text-sm text-ink`）。

### 6.4 定稿文案总表（按场景；这一列就是像素级验收值）

**品牌与首页（R-22 ③）**

| 场景 | 定稿文案 |
|---|---|
| 首页 slogan（`<h1>`，22px/700） | `记不住的，交给明天` |
| 搜索框 placeholder（默认） | `查一个单词` |
| 搜索框 placeholder（输入中，非空） | 无 placeholder（不清空用户已输入内容） |
| 胶囊（已登录、有待背） | `今天还有 12 个词要背` |
| 胶囊（已登录、待背 0） | `今天的词背完了` |
| 胶囊（未登录） | `登录后可同步，本机已背 12 词` |
| 页脚第 1 行（12px，`--ink-muted`） | `© 2026 明日记忆 · 赣ICP备2026013161号-1` |
| 页脚第 2 行（12px，`--ink-muted`，产品态度一句） | `明天再记，也不算晚。` |
| 低频呼吸动效（≥20s 周期） | 无文案；纯装饰层，`aria-hidden="true"`（§3.1、§5.2） |

**查询与结果（§3.2）**

| 场景 | 定稿文案 |
|---|---|
| 搜索中（≥300ms 才显示） | 无文字，只有骨架（§3.11.3） |
| 查不到 | 标题 `没找到这个词`；副行 `检查一下拼写，或者换个词形试试` |
| 网络失败 | `查询失败了 · 再试一次`（"再试一次"是按钮） |
| 结果条动作 | `查看详情`、`收藏` / `已收藏` |
| 收藏成功 toast | `已放进单词本` + 文字链 `撤销`（5 秒，§3.11.1） |
| 取消收藏 ConfirmSheet | 标题 `从单词本移除？`；正文 `{word} 会从单词本移除，复习记录一并删除。`；按钮 `移除`（危险）/ `取消` |
| 最近查询空态 | 不渲染面板（不是"暂无数据"） |
| 最近查询面板标题 | `最近查询`；清空按钮 `清空`（ConfirmSheet：`清空最近查询？` / `只清这一台设备上的记录。`） |

**背词（§3.5）**

| 场景 | 定稿文案 |
|---|---|
| 卡正面提示 | `点击卡片看释义` |
| 进度 | `第 4 张，共 12 张` |
| 四档按钮（含下次间隔） | `忘记` / `困难` / `良好` / `轻松`；下方 `4 天后`（≤60 分钟显示 `25 分钟后`） |
| 撤销 | 按钮 `撤销`；toast `已撤销，回到第 4 张` |
| 无释义降级 | 标题 `这个词暂无释义`；按钮 `重试` / `今天先跳过` |
| AI 记法失败 | `AI 记法生成失败 · 重试`（静态释义照常显示） |
| 评分接口失败 | 卡面停在当前张 + 行内 `评分没保存 · 再试一次`（**禁止**"请再按一次"） |
| 发音不可用 | 行内提示 `点这里安装/切换系统英文语音`（Web：指向 §3.4 帮助锚点；App：跳系统 TTS 设置） |
| 队列空（今日复习） | 标题 `今天的复习清空了`；副行 `明天会再来一批，或者现在多学几个新词`；按钮 `学 10 个新词` / `去查词` |
| 队列空（学新词） | 标题 `词本里的词都在背了`；副行 `去查几个新词加进来，就能开新一轮`；按钮 `去查词` |
| 队列空（随机自测） | 标题 `词还不够，先攒几个`；副行 `自测要从你的单词本里抽词，至少要有 5 个`；按钮 `去查词` |
| 取词失败 | 标题 `今天没能取到词单`；副行 `可能是网络的事，再试一次`；按钮 `重试` / `去查词` |
| 达到每日目标 | 标题 `今天 20 个词的目标完成了`；正文 `再多背一点，或者明天继续 —— 你已经连续 37 天了`；按钮 `再背一批` / `今天就到这` |
| 完成页 | `本轮结束` / `12 张` / `忘记 2 · 困难 1 · 良好 6 · 轻松 3` / `用时 4 分 12 秒` / `再背一批` / `回首页` |
| 离线背词（App） | `现在没有网络，背词进度会先记在手机上，联网后自动同步` |

**单词本（§3.6）**

| 场景 | 定稿文案 |
|---|---|
| 词本空（未登录） | 标题 `还没有收进来的词`；副行 `登录后可以从上一台设备继续`；按钮 `手机号登录` + 文字链 `随便查几个词` |
| 词本空（已登录） | 标题 `还没有收进来的词`；副行 `查词时点星标，词就会进到这里`；按钮 `去查词` |
| 筛选后为空 | 标题 `没有符合条件的词`；副行 `换个筛选条件试试`；按钮 `清除筛选` |
| 拉取失败 | `单词本没打开 · 再试一次` |
| 批量操作条 | `已选 3 个` / `加入今日` / `移出单词本` / `取消选择` |
| 排序菜单 | `最近加入` / `按字母` / `复习到期在前` |
| 左滑删除确认 | `移出单词本`（危险色）+ Undo toast `已移出 {word} · 撤销` |
| 词名超字符上限（65 个字符 → 服务端 400 `INVALID_WORDBOOK_ENTRY`，词本存词/收藏被拦） | `这个词没法存进单词本（词名不能为空，最长 N 个字符）`（照 PRD §5.4-4 定稿句逐字抄写；**N = `limits.ts` 的 `WORD_MAX_LENGTH`，禁写死** —— 数字由 `WORD_MAX_LENGTH` 模板字面量组装，本表不写第二份数字；与 §5.4-2 同句、不另起第二句、不拆第二条码；A-37 §六-26） |

**学习情况（§3.7）**

| 场景 | 定稿文案 |
|---|---|
| 加载中 | `正在整理学习记录…` |
| 失败 | 标题 `学习情况没拿到`；正文 `网络或服务器刚好在忙，你的记录没有丢。`；按钮 `再试一次` |
| 热力图不可用 | `热力图暂时打不开`（其余区块照常显示） |
| 离线（App） | `离线中 · 显示的是上次到手机上的记录` |
| 三张卡标题 | `本周新增` / `今日待复习` / `连续天数` |
| 曲线标题 | `新增单词`；副标题 `最近 30 天` |
| 热力图模式 | `每日` / `每周` / `累计` |
| 数据少 | `背够 3 天就有曲线了` |
| 未登录 | 标题 `登录后能看到你的进步`；副行 `词本和进度会自动同步过来`；按钮 `手机号登录` |

**我的 / 设置（§3.8）**

| 场景 | 定稿文案 |
|---|---|
| 设置分组 | `学习` / `提醒` / `外观` / `账号` / `关于` / `帮助` |
| 每日目标滑杆 | 标签 `每日目标`；右侧 `10 词`；脏值行尾 `●`；按钮 `保存`；toast `每日目标已更新为 20 词` |
| 脏值离开 ConfirmSheet | 标题 `每日目标还没保存`；正文 `离开后这次的修改会丢失。`；按钮 `留在本页` / `放弃修改` |
| 提醒开关 | `每日提醒`；副行 `默认 20:30，一天一次`；时间选择 `提醒时间` |
| 通知被拒 | `通知未开启 · 点这里去系统设置` |
| 头像 | 按钮 `换头像` / `取个头像`（仅本机选图，§3.8.4）；超上限 `图片太大，请换一张 300KB 以内的` |
| 退出登录 | 标题 `要退出吗？`；正文 `手机上的词本会保留，下次登录还能接着用。`；按钮 `退出登录`（危险）/ `取消` |
| 强制改密待办 | 入口行 `需要先更新密码才能继续使用` + 按钮 `去更新` |

**登录墙与登录弹窗（§3.9 / R-23）**

| 场景 | 定稿文案 |
|---|---|
| 登录墙（未登录进 study/assess/report/chat/wordbook） | 标题 `登录后开始背单词`；副行 `手机上的词本会自动同步，换设备也能接着背`；主按钮 `手机号登录`；文字链 `没有账号？注册` |
| 登录弹窗标题 | `手机号登录`；注册 `注册新账号`；激活 `设置密码，激活原账号` |
| 主按钮 | `登录` / `注册` / `设置密码并继续` |
| 手机号未注册 | `这个手机号还没注册，点这里注册`（整句可点，点击即切注册并保留手机号） |
| 密码错误（不区分账号/密码） | `手机号或密码不正确` |
| 空密码账号 | `该手机号此前用验证码注册、还没设置过密码，点『设置密码激活』用同一个手机号设一个 ≥8 位密码，即可拿回原来的词本与进度` + 可点按钮 `设置密码激活` |
| 空密码账号（卡片标题，§3.9.3） | `这个手机号还没设置过密码` |
| 找回口令（帮助页唯一答案） | `这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。` |
| 强度条四档 | `密码至少 8 位` / `建议更长一点，或混用字母和数字` / `可以了` / `很稳` |
| 协议勾选 | `我已阅读并同意《用户协议》《隐私政策》`（两个书名号内为链接） |
| 强制改密页 | 标题 `为了账号安全，请设置新密码（至少 8 位）`；唯一主按钮 `更新密码并继续`；次按钮 `退出登录` |
| 强制改密页输入框 label | `当前密码` / `新密码` / `确认新密码`（无"以后再说"、无关闭 X） |
| 旧 APK 兜底 | `请在网页端 tmword.xyz 修改密码后重新登录` |
| 短信通道（本期未开通） | `短信通道暂未开通，请使用密码登录`（不显示"已发送"、不启动 60 秒倒计时） |

**同步、离线与连接（§3.11 / R-20 ⑤ / R-25 ③ / R-30 ①）**

| 状态 | 定稿文案 | 是否可点 |
|---|---|---|
| 同步成功（App） | `已同步 · 20:31` | 否（纯状态） |
| 待同步队列非空 | `待同步 3` | 是 → 跳单词本并触发补传 |
| 离线且无队列 | 不显示任何文案 | — |
| 离线补传失败 | `还没同步 · 联网后会自动补上` | 是 → `重试` |
| 词本冲突（409 重放） | 用户无感，只显示 `已同步 · 20:31` | — |
| 对话/流式断线 | `连接断了 · 点这里重连`（重连后已输入内容与历史必须保留） | 是 |
| 重连中 | `正在重新连接…` | 否 |
| 服务器繁忙（全局 5xx 兜底） | `服务器刚才没响应，再试一次` | 是 → `重试` |
| 跨属主访问 / 复习越权 / R-41①（全局 403，`FORBIDDEN`） | `这份内容不属于当前账号` | 否（纯提示，重试不改变结果） |

**打卡（R-13 ③④⑤，三处入口文案一致）**

| 状态 | 定稿文案 |
|---|---|
| 未打卡（完成页/我的/App 菜单） | 按钮 `今天打卡` + 旁边 `连续 36 天` |
| 已打卡 | `今天已打卡 · 连续 37 天` |
| 打卡中 | 按钮内 spinner 常驻（`--dur-spin 900ms` 一圈），文字保持 `今天打卡` 不变 |
| 打卡失败 | 行内 `打卡没成功 · 再试一次`（**禁止**静默成功、禁止 `签到成功` 假反馈） |

**通知与桌面小组件（R-21 ③⑥）**

| 场景 | 定稿文案 |
|---|---|
| 每日提醒通知标题 | `今天还有 12 个词要背` |
| 通知正文 | `点开就能开始，大概 3 分钟` |
| 小组件（有数据） | `今日待背 12` + 进度条 + `已背 8 / 20` |
| 小组件（未登录/无数据） | `登录后可见今日词单` |
| 小组件（数据过期 >24h） | 数字照常显示 + 12px `数据是昨天的` |
| 应用内更新提示 | `有新版本，点这里更新`（可关闭，关闭后 24 小时内不再提示） |

### 6.5 通用动词与按钮词典（同一动作全站同名）

| 动作 | 定稿 | 禁止 |
|---|---|---|
| 提交查询 | 放大镜图标 + `sr-only`「查询」 | `搜索`/`Go` 文字按钮（首页禁止独立"查词"按钮，R-07 ③） |
| 前往登录 | `手机号登录` | `请登录`、`立即登录`、`登录/注册` |
| 重试 | `重试` / `再试一次`（句内） | `点击刷新`、`Error, retry` |
| 危险确认 | 动词本身：`移除` / `清空` / `退出登录` / `注销账号` | `确定` / `确认`（无信息量） |
| 次要退出 | `取消` / `留在本页` | `算了`、`不不不` |
| 发音 | 喇叭图标 + `sr-only`「发音」，长按 `aria-label="朗读 {word}"` | `播放` |
| 收藏 | `收藏` / `已收藏`（★ 实心） | `加入单词本`（仅在明确说明处用一次） |

### 6.6 禁止词清单（两端 + App，§8.4 grep 断言 = 0）

`未接入`、`暂未支持该功能`、`24h 缓存`、`ClickHouse`、`S:`、`稳定度`、`掌握度变化（S）`、`已连接`、`未连接`、`云端`、`本地`（徽章语境）、`p:`、`3:`、`1e:`、`FSRS`、`以后再说`、`稍后再改`、`下次提醒`、`宽限期`、`截止日期`、`passwordUpgradeDeadline`、`忘记密码`、`找回密码`、`本期无法找回`、`请用其他手机号注册`、`用验证码登录`、`旧进度无法迁移`、`联系管理员`、`已发送`（验证码语境）、`请再按一次`、`请求失败`、`加载失败`、`暂无数据`、`No data`、`undefined`、`NaN`。

> 说明：`本地` 在 §3.9 的 `手机上的词本会保留` 这类句子里已用"手机上"替代，任何位置都不允许出现"本地"二字；`已连接`/`未连接` 用 `连接断了 · 点这里重连` 替代且**正常态不显示状态**；倒计时判据见 §3.9.5。

### 6.7 数字、时间与标点规范

| 项 | 规范 | 例 |
|---|---|---|
| 千分位 | 不加，一律原样数字 | `1284 个词` 而非 `1,284` |
| 溢出 | ≥100 → `99+`（§3.10.2）；计数上限展示同规则 | `99+` |
| 数字对齐 | 所有可变宽度数字用 `tabular-nums`（`tnum` 类） | 倒计时、待背数 |
| 时间 | 24 小时制 `HH:MM`，秒不写（除用时） | `20:31`、`数据截至 今天 09:20` |
| 时长 | `4 分 12 秒`；不足 1 分钟 `48 秒`；≥1 小时 `1 小时 5 分` | 完成页 |
| 日期 | `今天 09:20` / `昨天` / `3 月 7 日` / `2025 年 12 月 31 日`（跨年才带年份） | 学情轴 |
| 间隔号 | 并列状态用 `·`，前后各一个半角空格 | `忘记 2 · 困难 1` |
| 破折号 | 补充说明用 `——`（中文双破折号），其余禁止长破折号 | `明天继续 —— 你已经连续 37 天了` |
| 引号 | 界面内引用按钮名用『』或"按钮"字样，不用反引号 | `点『设置密码激活』` |
| 省略号 | `…` 单字符（加载文案），禁止三个英文句点 | `正在整理学习记录…` |
| 单位与数字 | 数字与单位之间不加空格（`12 个词`、`20 词`、`300KB`） | — |
| 空值 | 不显示 `—`/`-`/`null`：整行或整块不渲染 | — |

### 6.8 屏幕阅读器与图标标签定稿（配合 §7）

| 元素 | `aria-label` 定稿 |
|---|---|
| 跳转链接（skip link，§7.3） | 可见文字与 label 同为 `跳到主要内容` |
| 背单词 tab | 有待背：`背单词，今天还有 12 个要背`；无：`背单词` |
| 更多抽屉触发 | `更多` |
| 顶栏返回 | `返回上一级` |
| 发音按钮 | `朗读 {word}` |
| 收藏（结果条） | `收藏 {word}` / `取消收藏 {word}` |
| 评分四档 | `{良好}，下次 4 天后` |
| 撤销 | `撤销上一条评分` |
| 今日进度条 | `今日进度，已完成 8 / 20` |
| 热力图单格 | `{3 月 7 日}，背了 {12} 个词`（无数据：`{3 月 7 日}，没有学习`） |
| 曲线图容器 | `最近 30 天新增单词曲线` + 同信息的数据表（`sr-only`） |
| 滑杆 | `每日目标，当前 20 词`，`aria-valuetext="20 词"` |
| Toast | 容器 `role="status"`（错误用 `role="alert"`） |
| 骨架 | 容器 `aria-hidden="true"`，真实等待说明用同层 `sr-only` 文案 |

---

## 7. 无障碍与触控清单

> 目标等级：WCAG 2.1 AA（R-33 / R-22 ① / R-29 ② 的合并口径）。本节每一条都是**可判**的：要么有像素数，要么有选择器，要么有走查动作。
> 术语：`命中区` = 该元素可点击矩形的实际尺寸（含 padding），不是图标绘制尺寸。

### 7.1 触控目标（≥44×44px，R-33 ①）

**规则**

1. 任何可交互元素的命中区 **≥44×44px**；两个相邻可点元素之间的**净间距 ≥8px**（§1.7 `gap-2`），否则按"合并或外扩"处理。
2. 图标本身可以 20–22px，但必须用 preset 的 `tap-target`（= `min-width/min-height: var(--tap) 44px`，§1.12.2）把命中区撑到 44px，配 `inline-flex items-center justify-center`；**不得**用 `margin` 假装（margin 不属于命中区），也**不得**写 `min-h-[44px]` 任意值。
3. 行式列表（词本行、设置行、最近查询条目）命中区 = 整行（高 ≥`56px` = `min-h-14`，宽 = 容器宽；§3.6 / §3.8 的行高即此值），行内小图标不单独收窄为唯一入口。
4. 视觉反馈尺寸（图标 20px）与命中区（44px）不一致时，用透明伪元素外扩：`::before{inset:-12px}`（§3.4 喇叭即此法）。
5. 禁用态：按 WCAG 1.4.3 的"非活跃控件"豁免对比度，但**不得塌陷命中区**；`opacity` 不得低于 `45%`，且必须另有非颜色通道（图标变 `−`、文案加"暂不可用"、`aria-disabled` 而非 `disabled`）。

**抽查 20 个（R-33 ① 的 20 项，逐条填尺寸即过；单位 px，375px 视口）**

| # | 元素 | 页 | 定稿命中区 | 依据 |
|---|---|---|---|---|
| 1 | 搜索框（输入区） | 首页 | 全宽 × 48 | §3.1 |
| 2 | 框内放大镜提交 | 首页 | 44 × 44（框内右对齐，`right:2px`） | §3.1 |
| 3 | `ReviewCta` 胶囊 | 首页 | ≥180 × 44 | §3.1 |
| 4 | 结果条整体（→详情） | 首页 | 全宽 × 72 | §3.2 |
| 5 | 结果条喇叭 | 首页 | 44 × 44 | §3.2 |
| 6 | 结果条收藏星标 | 首页 | 44 × 44 | §3.2 |
| 7 | 最近查询条目 | 首页面板 | 全宽 × 44 | §3.3 |
| 8 | 面板「清空」 | 首页面板 | 44 × 44 | §3.3 |
| 9 | 详情页返回 `←` | 二级页 | 44 × 44（顶栏内，`left:6px`） | §3.4 |
| 10 | 详情页发音 | 详情 | 44 × 44（图标 22，外扩 11） | §3.4 |
| 11 | 详情页收藏 | 详情 | 44 × 44 | §3.4 |
| 12 | 词形变化词条（若可点） | 详情 | 44 × 44，否则**不可点**（纯文本） | §3.4 |
| 13 | `QueueSwitch` 三个模式段 | 背词 | 各 `flex-1` × 44 | §3.5 |
| 14 | 卡面（翻面） | 背词 | 卡全尺寸（≥240 × 320） | §3.5 |
| 15 | 四档评分按钮 | 背词 | `grid-cols-4 gap-2`，各 ≥`52px` 高、≥72px 宽 | §3.5 |
| 16 | 撤销按钮 | 背词 | 44 × 44 | §3.5 |
| 17 | 完成页三按钮 | 背词 | 各全宽 × 48 | §3.5 |
| 18 | 打卡区（整块可点） | 完成页/我的 | ≥`--row-h 56px` × 全宽 | §3.8 |
| 19 | 词本行左滑后的「移出」 | 单词本 | 高 = 行高（≥56）× 宽 88 | §3.6 |
| 20 | 底部 5 颗 tab / 右上「更多」 | 全局 | `56 × 屏宽/5`（375 时 56×75）/ 44 × 44 | §3.10 |
| 21 | 滑杆拖拽柄 | 我的 | 视觉 24px，命中区 44 × 44（透明外扩） | §3.8.3 |
| 22 | 主题三段（浅/深/系统） | 我的/抽屉 | 各 ≥44 高 × `flex-1` | §3.10.3 |

**唯一豁免（§8.4 走查表按此判）**：热力图格阵（§3.7）。格为 11px、命中区 24×24px。理由与补偿：① 格阵是**缩放型数据可视化**，13 周 ×7 行在 375px 下物理上不可能 44px；② 提供等效替代通道 —— 图例数值区间 + 点选信息条 + 分日列表模式（`<768px` 时默认改用分日列表，格阵只在 ≥768px 出现，此时指针为主）；③ 每格 `aria-label` 完整（§6.8）。**除此一处，任何 44px 违规都是缺陷。**

### 7.2 不依赖 hover、不依赖手势、不依赖精确指针

- 所有 hover 只改**反馈强度**（底色/阴影/位移 ≤2px），**不得**是功能的唯一入口：任何 `group-hover:opacity-100` 才出现的按钮（如行内"移出"）必须在触屏下有等价路径（左滑或长按菜单），否则判缺陷。
- 左滑删除（词本）**必须**同时提供"长按出操作条"或行内可见的 `⋯`，因为左滑不可发现（R-19 ③"左滑删除"要保留，但不能是唯一路径）。
- 无拖拽需求（本期不做拖拽排序）；无双指手势； pinch 只用于系统缩放（§7.7）。
- 指针精度的替代：`:active` 反馈必须有（`--dur-tap`），且 `touch-action: manipulation` 全局开启（去掉 300ms 双击延迟）。

### 7.3 焦点顺序与可见焦点

| 项 | 规格 |
|---|---|
| 跳转链接 | 全站第 1 个可聚焦元素：文案 `跳到主要内容`（组件 `SkipLink`，§3.11.7），默认 `sr-only`，`:focus-visible` 时左上角显形（`top-2 left-2 z-toast`，`bg-surface text-ink` + 2px `--focus` ring） |
| 焦点环 | `outline: 2px solid var(--focus); outline-offset: 2px; border-radius: inherit`；`--focus` 对 `--bg` 与 `--surface` 均 ≥3:1（实测 6.01 / 6.41，§1.4 第 18 行）；**禁止** `outline: none` / `outline-none` 而不给替代（grep 断言 §8.2） |
| 焦点方式 | 只用 `:focus-visible`（鼠标点击不给环，键盘给）；不得用 `:focus` 给鼠标用户画环 |
| 顺序 | 严格等于视觉顺序（DOM 顺序 = 视觉顺序，禁止 `tabindex` 正数重排；`tabindex="0"` 只用于自定义可点 div，且必须补 `role` + 键盘事件） |
| 焦点陷阱 | Dialog / ConfirmSheet / 更多抽屉 / 登录弹窗内必须环抱（Tab 与 Shift+Tab 不外逃）；背景内容 `inert` 或 `aria-hidden="true"` + 焦点不可达 |
| 焦点归还 | 浮层关闭后焦点回到触发它的按钮（不得丢到 `<body>`）；页面切换后焦点在 `<h1>`/主容器（`tabindex="-1"` + `.focus()`），读屏不从头念 |
| 自动聚焦 | 仅两种情况允许：① 小组件深链进入 App 聚焦搜索框（R-20 ③，`launch-focus.ts`）；② 登录弹窗打开聚焦手机号输入。其余页面**禁止**进入即弹键盘（首页搜索框不 autofocus，§3.1） |
| 强制改密页 | 焦点进入即落在"当前密码"，Tab 顺序 = 当前密码 → 新密码 → 确认新密码 → 更新密码并继续 → 退出登录；**不得** Tab 出页面（无其他可点元素，§3.9.4） |

### 7.4 键盘可达矩阵

| 组件 | 键 | 行为 |
|---|---|---|
| 搜索框 | `Enter` | 提交查询；`Esc` 清空输入并保持焦点（不关面板之外） |
| 最近查询面板 | `↑↓` | 在高亮条目间移动（`aria-activedescendant`）；`Enter` 选中；`Esc` 关闭面板并归还焦点给输入框 |
| `QueueSwitch` | `←→` | 切换模式（roving tabindex），`Home/End` 首尾；`role="tablist"` |
| 背词卡 | `Space` / `Enter` | 翻面；背面另支持数字键 `1/2/3/4` 与方向键 `←/↓/↑/→` = 忘记/困难/良好/轻松（键位登记 §3.5.7） |
| 评分按钮 | `Tab` | 四档必须可 Tab 到达（现状只能鼠标点 = 缺陷）；`Enter` 评分 |
| 撤销 | `Ctrl+Z`（Web） | 与按钮同效，5 秒窗口内；App 无此键 |
| 弹层 | `Esc` | 关闭并归还焦点；**强制改密页除外**（Esc 无效 + 抖动反馈，§3.9.4） |
| 列表/菜单 | `↑↓←→ Home End Esc` | `role="menu"` + `menuitemradio`；`typeahead` 支持中文首字 |
| 滑杆 | `←→` ±1 步、`↑↓` ±1 步、`PgUp/PgDn` ×5、`Home/End` 端点 | 步进 5；`aria-valuetext="20 词"` |
| 底 tab | `Tab` 遍历 5 项，`Enter` 激活 | 不在 tab 栏内做 `←→` 漫游（会与浏览器行为混）；`aria-current="page"` |
| 热力图格阵 | `Tab` 进入 → `↑↓←→` 在格间移动（`role="grid"` + `aria-activedescendant`）→ `Enter` 展开信息条 | 每格 `aria-label`（§6.8）；**不用** 11px 视觉格做唯一通道 |

### 7.5 ARIA 角色对照（组件 → role → name → value）

| 组件 | role / 语义 | name 来源 | 状态 |
|---|---|---|---|
| 底 tab | `role="navigation"` + 内部 `<a>`；当前项 `aria-current="page"` | `aria-label="主导航"`（容器）/ 可见文字 | 红点 `aria-hidden`，信息进 label（§3.10.2） |
| 更多抽屉 | `role="dialog"`（移动全屏抽屉）或 `menu` | `aria-labelledby` 指向标题 | 触发 `aria-expanded` + `aria-haspopup="menu"` |
| 主题三段 | `role="radiogroup"` + `menuitemradio`/`radio` | `aria-label="外观"` | `aria-checked` |
| 收藏星标 | `<button>`（非 `<a>`） | `aria-label="收藏 {word}"` | `aria-pressed` |
| 四档评分 | `role="group"`（`aria-label="记住程度"`）内 4 个 `<button>` | 可见文字 + 下次间隔（`aria-label`） | 禁用态 `aria-disabled`（不用 `disabled` 以免丢焦点） |
| 进度条 | `role="progressbar"` + `aria-valuenow/min/max` + `aria-valuetext` | `aria-label="今日进度"` | — |
| 骨架 | 容器 `aria-hidden="true"` + 同层 `sr-only` 等待文案 | 见 §6.4 | — |
| Toast | `role="status"`（普通）/ `role="alert"`（错误、打卡失败） | 文本 | 不打断读屏（`aria-live="polite"`） |
| 表单错误 | `aria-invalid="true"` + `aria-describedby="{id}-err"` | `<label for>` | 提交后一次性 `role="alert"` |
| 图标按钮 | `<button>` + `<svg aria-hidden="true">` + 文字或 `sr-only` span | `aria-label`（§6.8） | — |
| 装饰层/呼吸光 | `<div aria-hidden="true">` + `role="presentation"` | 无 | 不得进焦点序 |
| 热力图 | `role="grid"` > `row` > `gridcell` | 每格 `aria-label` | 选中格 `aria-selected` |
| 折线图 | `role="img"` + `aria-label` + 紧随的 `sr-only` 数据表 | §6.8 | — |
| 语言标注 | 全站 `<html lang="zh-CN">`；**英文词条、音标、例句、AI 记法里的英文片段** 包 `lang="en"`（读屏换音库，否则中文引擎念英文完全不可懂） | — | 强制，见 §7.10 末条 |

### 7.6 状态播报（`aria-live`）

- 只允许 **2 个** live region：全局 toast 容器（`polite`）+ 表单/错误容器（`assertive`，`role="alert"`）。页面内新增 live 区域必须登记。
- 卡片切换：`aria-live="polite"` 挂在卡容器上，播报 `第 4 张，共 12 张`；**不播报**装饰变化。
- 流式 AI 文本：**不挂 live**（逐字播报会淹没读屏），完成后两端统一播报 `记法已生成`。
- 数字节流：tab 红点与进度条数值变化不单独播报；仅在页面进入时播报一次当前值。
- 加载结束：结果条渲染后播报 `找到 1 条：{word}`；未命中播报 `没找到这个词`。

### 7.7 缩放、字号与不折版

| 项 | 规格 |
|---|---|
| viewport | `width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover`；**必须删除 `user-scalable=no`**（现状违规点：`mobile-memory/assets/index.html:5`、`mobile-agenda/assets/index.html:5`；React App 新入口 `apps/app/index.html` 按本行写） |
| 200% 缩放走查 | 5 个页面在 375px + 200% 下：无元素重叠、无横向滚动、主按钮仍可达（页面总高可滚是允许的） |
| 布局底线 | 高度用 `min-height` 不用 `height`（文字变长/字号变大时撑开）；`overflow-wrap: break-word` 用于释义区；长单词（`antidisestablishmentarianism`）在卡面不溢出 |
| Android 字体放大 | WebView 的 `text-size-adjust: 100%` 不阻止系统 SP 字号；组件按 `rem` 排版（§1.5 已用 rem），**禁止** px 固定行高（用 `leading-*`）；`--tab-h` 在字号超大时 56→64px 自适应（§1.12.3 白名单覆写） |
| 横向滚 | 全站唯一允许的横向滚动容器 = 热力图周条与图表横滑卡（`snap-x`，§3.7.5），且必须带"可横滑"文字提示 |
| 图片文字 | 任何文案不得以图片形式承载（截图走查 + `alt` 断言） |

### 7.8 `prefers-reduced-motion: reduce` 降级矩阵（§1.11 的可验收版）

| 动效 | 默认 | reduce 时 | 判据 |
|---|---|---|---|
| 首页呼吸柔光层（≥20s） | `--dur-breath 24s infinite` | `animation: none`，停在静态中间态（不是消失、不是闪一下） | 录屏 3s 无像素变化 |
| 卡片翻面/切换 | `--dur-move 220ms` | 直接换内容（无位移、无淡入） | DOM 断言 `transition-duration: 0s` |
| 骨架 shimmer | `--dur-skeleton 1400ms` | 静止灰块（保留形状与 `aria-hidden`） | 无动画 |
| spinner | `--dur-spin 900ms` | **停止旋转**，改为静止环 + `aria-busy="true"` + 文案（如 `正在整理学习记录…`） | 不得出现"看起来卡死"的空白：必须有 `aria-busy` 或文字 |
| hover 位移/缩放（≤2px / 0.96） | `--dur-micro/-tap` | 取消 transform，仅保留颜色变化 | — |
| 抽屉/弹层进出 | `--dur-move` | 立即显隐 | — |
| `scroll-behavior` | `smooth` | `auto` | — |
| 红点/数字变化 | 无动画 | 无动画（同） | — |
| 任何 3Hz 以上闪烁 | **禁止存在**（无论是否 reduce） | — | 走查 + 无自动播放视频（R-22 ⑤） |

### 7.9 非文本对比与"颜色不是唯一通道"（1.4.1 / 1.4.11）

- 图标描边（`currentColor`，20–22px，stroke 1.75）对所在底色 ≥3:1：`--ink-muted #5b6b66` on `--surface #ffffff` = 5.62:1 ✓、on `--bg #f6f8f7` = 5.26:1 ✓；`--brand #0f6b5c` on `--surface` = 6.41:1 ✓、on `--bg` = 6.01:1 ✓。
- 未选中 tab `--ink-muted` 与选中 `--brand` 互比仅 **1.14:1**（远低于 3:1）→ 因此选中信息**必须**叠加 `font-medium` 字重 + `aria-current="page"`，颜色差不得作为唯一通道（合规做法；反之若只改色即判缺陷）。
- 表单必填/错误：错误同时给 ①`--danger` 描边 ②文字提示行 ③`aria-invalid`，**不**只用红边。
- 四档评分按钮：颜色 + 文字标签 + 顺序三重通道（R-11 ①），无纯靠色区分。
- 热力图/图表：见 §1.2.1 三条硬要求（虚线 L0 形状 + 图例数值区间 + 每格 `aria-label` 与点选信息条）。
- 徽标（Badge）：本期仅用于状态词（`已学`/`待复习`/`到期`），一律 `bg-*-soft` + 同族深色文字（§1.4 表内均 ≥4.5:1），**禁止**彩色底 + 白字小字号。

### 7.10 原生面与备份/安全收尾（R-33 ③，登记在此因它由走查确认）

- `AndroidManifest.xml`：`android:allowBackup="false"`（或 `fullBackupContent` 排除 token prefs），确保凭据不随系统备份外泄。
- 小组件（`SearchWidget.java`）：进度条补 `contentDescription`（`今日待背 12，已背 8`），`android:textAllCaps=false`；点击区域整卡（≥44dp）。
- 通知：`POST_NOTIFICATIONS` 被拒不弹二次请求，改为可点设置跳转（§3.8.5）；通知文案见 §6.4。
- 返回键语义（§3.10.5）对 TalkBack 用户同样可用：确认弹窗出现时焦点进入 `留在应用` 按钮。
- `file://` 下 TalkBack 需要 `lang="zh-CN"` 才能正确念中文（§7.5 末行）。

### 7.11 QA 走查表（每页签一次字，工具固定）

| # | 动作 | 工具/方法 | 通过标准 |
|---|---|---|---|
| 1 | 只用键盘走完 11 页 | Chrome + Tab/Enter/Esc/↑↓ | 无焦点丢失、无功能不可达 |
| 2 | 焦点可见性 | 关闭鼠标，看环 | 每个可点元素有 ≥3:1 焦点环 |
| 3 | 命中区抽测 | DevTools 量 20 项（§7.1 表） | ≥44px，除热力图 1 处豁免 |
| 4 | 200% / 400% 缩放 | 浏览器缩放 + Android 字体超大 | 无重叠、无横滚（热力图除外） |
| 5 | `prefers-reduced-motion` | DevTools Rendering 勾选 + macOS 辅助 | §7.8 全表成立 |
| 6 | 屏幕阅读器 | Android TalkBack / iOS VoiceOver / NVDA | §6.8 标签逐条被念出，英文词用英文引擎 |
| 7 | 对比度 | axe DevTools + WebAIM 抽查 12 节点（R-22 ①） | 全部 ≥4.5:1，非文本 ≥3:1 |
| 8 | 深色首屏 | 冷启动录屏 / Playwright 首帧断言 | 无白闪（§5.3） |
| 9 | 禁用词 | `grep`（§6.6、§8.4） | 命中 = 0 |
| 10 | 颜色硬编码 | `grep`（§8.4） | 命中 = 0（除 `tokens.css` 与 `colors.xml` 镜像） |

---

## 8. 视觉验收判据

> **编号约定**：本节 `§8.x` 指**本文件**；出现 `PRD §8.3-A/B/C/D/E` 时指 `01-prd.md` 第 8.3 节的走查清单（两套编号不混用）。
> **承载位置**：① 结构/尺寸/截图类 → `apps/web/e2e/visual.spec.ts`（Playwright，Web 与 App 各一套 project，App 走 `chromium.launchServer` + CDP，与 R-34 的 `gui-cdp.mjs` 共用 driver）；② 字符串类 → `tools/boundaries.mjs`（与架构里既有的 grep 门禁同一个脚本、同一份 `--fail-on-hit` 退出码）；③ 人工类 → 本节表格 + UAT 签字页。
> **判级**：**A = 阻断发布**；**B = 返工但不阻断**（本期必修，不得跨窗口遗留）；**C = 登记在册的例外**（只有本节列出的条目可以是 C）。

### 8.1 结构计数断言（机器可判 · DOM）

| # | 断言（期望值即验收值） | 选择器 / 方法 | 判级 | 出处 |
|---|---|---|---|---|
| 1 | **首页未查询态可交互元素 = 3（硬上限 ≤5）** | `[data-testid=home-root]` 子树内 `a[href],button,input,textarea,select,[role=button],[tabindex]:not([tabindex="-1"])`，按 §3.1.1 聚合规则计数 | **A** | R-07 ① |
| 2 | 首页禁止存在的 5 类元素 = 0 | `[data-testid=home-direction-buttons],[data-testid=home-history-chips],[data-testid=home-empty-graycard],[data-testid=wordbook-sidebar],[data-testid=home-ai-card]` | **A** | PRD §8.3-C |
| 3 | 首页 `<h1>` 数量 = 1 且文本 = `记不住的，交给明天` | `document.querySelectorAll('h1')` | A | R-22 ③ / §3.1.6 |
| 4 | 呼吸动效周期 ≥20s；`reduce` 下 `animation-name = none` | `getComputedStyle(decorLayer).animationDuration` → `24s` | **A** | R-22 ③④ |
| 5 | 首页无粒子 / 无自动播放视频 / 无鼠标跟随：`canvas=0`、`video[autoplay]=0`、`mousemove` 监听 = 0 | DOM + 运行时 `getEventListeners(window)` 抽样 | **A** | R-22 ⑤ |
| 6 | 搜索框高度 ∈ [48,52]px；无独立"查词"文字按钮 | `getBoundingClientRect().height` | A | R-07 ③ |
| 7 | `<768px` 底 tab 项数 = 5；**`≥1024px` 时 `nav[aria-label="主导航"]` 数量 = 0**（不是隐藏，是不渲染） | 三档视口 375 / 768 / 1280 各测一次 | **A** | R-08 ① / §3.10.4 |
| 8 | 顶栏右上「更多」触发器每屏 ≤1，且带 `aria-expanded` `aria-haspopup="menu"` | `[aria-haspopup=menu]` | A | §3.10.3 |
| 9 | 底 tab 第 2 项红点：`due=0` 或词本空 → 节点不存在（不是 `0`、不是灰点）；`due=12` → 文本 `12`；`due=120` → `99+`；红点 `aria-hidden=true` 且 `aria-label = 背单词，今天还有 12 个要背` | `[data-testid=tab-study-badge]` | **A** | R-18 ① / §3.10.2 |
| 10 | 每页 `<h1>`/顶栏标题与路由表 `NAV_ITEMS` 一致（11 条逐页断言；`#/progress` 顶栏必须写 `学习情况`） | 页面对象表驱动 | A | R-18 ⑤ / 定案 D-4 |
| 11 | live region 总数 ≤2 | `[aria-live],[role=status],[role=alert]` | A | §7.6 |
| 12 | 浮层焦点不逃逸：打开抽屉/弹窗后连按 Tab 12 次，`activeElement` 仍在浮层内；关闭后焦点 = 触发按钮 | Playwright `keyboard.press('Tab')` 循环 | A | §7.3 |
| 13 | **强制改密页可交互元素 = 2**（`更新密码并继续` + `退出登录`）；无返回箭头、无关闭 X、无底 tab、无第三颗可点；`Esc`/返回键不离开该页 | `[data-testid=force-upgrade]` 子树 | **A** | R-40 ④ / §3.9.4 |
| 14 | 登录弹窗：登录态 5 个、注册/激活态 5 个可交互元素（§3.9 计数口径）；弹窗内始终可见 `没有账号？注册` 文字链 | `[data-testid=auth-form]` 子树 | A | R-23 ① / PRD §8.3-D-8 |
| 15 | 未登录进入 `study/assess/report/chat/wordbook` 时 DOM 中**不出现** `请先登录后…` 中间态（登录态未确定只有骨架） | 进入瞬间与 +500ms 各快照一次 | **A** | R-23 ② |
| 16 | 点"获取验证码"后：不出现 `已发送`、无倒计时节点、手机号仍在输入框 | 点击后 0/1/3 秒三快照 | **A** | R-01 ⑥ / §3.9.5 |
| 17 | 背词四档按钮可 Tab 到达并 `Enter` 生效；`aria-label` 含下次间隔（如 `良好，下次 4 天后`） | 键盘 only 走完一轮 | A | §3.5.7 |
| 18 | 走完最后一张不产生新评分记录、不回第 1 张（完成页停留） | 评分请求计数 = N | A | R-13 ② |
| 19 | 连续天数/待背数三处（完成页 / 我的 / tab 红点）同一时刻相等 | 三处文本比对 | **A** | R-13 ⑥ |
| 20 | 热力图每格 `aria-label` 覆盖率 = 100%；图例含数值区间文本；`<768px` 默认渲染分日列表（格阵容器 = 0） | `[data-testid=heat-cell]` 遍历 | A | §1.2.1 / §3.7.5 |
| 21 | 每张图表容器有 `role="img"` + `aria-label`，且紧随一个 `sr-only` 数据表 | `svg[role=img]` 与相邻 `table.sr-only` 配对计数相等 | A | §6.8 |
| 22 | 英文内容被 `lang="en"` 包裹（详情页词头/音标/例句 ≥1 处） | `[lang=en]` 计数 > 0 | B | §7.5 |
| 23 | 375/412 两档宽度下：`document.scrollingElement.scrollWidth === clientWidth`（无横向滚动），除登记的两处横滑容器 | 逐页断言 | A | R-19 ④ |
| 24 | 命中区实测：§7.1 的 22 项逐个 `getBoundingClientRect()` ≥44（热力图格按豁免 ≥24） | 表驱动 | **A** | R-33 ① |
| 25 | 200% 缩放下 5 个主页面：无元素重叠（`Intersection` 面积为 0 的成对可点元素）、主按钮仍在视口内可达 | `deviceScaleFactor`/`zoom: 2` 两跑 | A | §7.7 |
| 26 | `<html lang="zh-CN">`、viewport meta 含 `viewport-fit=cover` 且不含 `user-scalable=no` | `head` 快照 | **A** | R-33 ② / §7.7 |

### 8.2 grep 断言（`tools/boundaries.mjs`，跨平台实现；下列命令为等价说明）

| # | 断言 | 命令（等价） | 期望命中 | 判级 |
|---|---|---|---|---|
| 1 | **零硬编码颜色**：源码（`.tsx/.ts/.css`）不含 hex / `rgb(` / `rgba(` / `hsl(` 字面量 | `grep -rIn --include=*.{ts,tsx,css} -E "#[0-9a-fA-F]{3,8}\b\|rgba?\(\|hsl\(" apps packages/ui/src` | `tokens.css`、`tailwind-preset.ts`（图表常量）、`colors.xml` 三个文件内 = 允许，**之外 = 0** | **A** |
| 2 | 紫色退役：`#8b5cf6`、`#7c3aed`、`262 83%` | `grep -rIn -E "8b5cf6\|7c3aed\|262 83%" apps packages mobile-memory` | 0 | **A** |
| 3 | 被禁的现网旧值：`#8a8f98`、`#d64540`、`#188038`、`#E6F4EA`、`text-gray-`、`bg-gray-`、`bg-red-`、`text-red-` | 同脚本白名单串表 | 0 | **A** |
| 4 | 语义类唯一：出现 Tailwind 原生调色板类（`(bg\|text\|border)-(slate\|gray\|zinc\|neutral\|stone\|red\|green\|blue\|violet\|purple\|emerald\|teal\|cyan)-[0-9]`） | `grep -rInE "(bg\|text\|border)-(slate\|gray\|zinc\|neutral\|stone\|red\|green\|blue\|violet\|purple\|emerald\|teal\|cyan)-[0-9]" apps packages/ui/src` | 0 | **A** |
| 5 | `!important` | `grep -rn "!important" apps packages/ui/src --include=*.css --include=*.tsx` | **≤1**，且必须是 §1.11 reduced-motion 块内并带 `/* a11y-exception: R-22 ④ */` 注释；组件里 = 0 | **A** |
| 6 | 焦点环不被抹掉：`outline-none`、`outline: none`、`focus:outline-none` | `grep -rn -E "outline-none\|outline:\s*none" apps packages/ui/src` | 0 | **A** |
| 7 | 深色只走变量：`dark:` 条件类 | `grep -rn "dark:" apps packages/ui/src --include=*.tsx` | **≤3** 且逐条对得上 §5.5 表；`dark:bg-[`、`dark:text-[#` = 0 | **A** |
| 8 | 任意值类：`z-[`、`duration-[`、`shadow-[`、`p-[`、`text-[1?[0-9]px]`、`leading-[` | `grep -rnE "z-\[\|duration-\[\|shadow-\[\|p-\[\|leading-\[\|text-\[1?[0-9]px\]" apps packages/ui/src --include=*.tsx` | 骨架 `h-`/`min-h-` 按 §3.11.3 登记清单 ≤ 该清单条数，其余 0 | B |
| 9 | **内部术语清零**（§6.2 右列全表）：`ClickHouse`、`未接入`、`24h 缓存`、`已连接`、`未连接`、`云端`、`本地`、`掌握度`、`稳定度`、`S:`、`stability`、`FSRS` | `grep -rIn -E "ClickHouse\|未接入\|24h 缓存\|已连接\|未连接\|云端\|掌握度变化\|稳定度\|FSRS" apps packages/ui/src mobile-memory/res` | 0（`本地` 需人工复核：仅允许出现在 `localStorage/本地缓存` 等代码注释，界面字符串 0） | **A** |
| 10 | 词形原始缩写：`p:`、`3:`、`1e:` 出现在渲染串里 | `grep -rInE "['\"( ](p\|d\|3\|1e\|2e\|3e\|z\|R\|T): " apps packages/ui/src` | 0（`INFLECTION_LABELS` 的键定义除外） | **A** |
| 11 | 凭据类禁语（§6.6 后半 + PRD §8.3-D-20）：`以后再说`、`稍后再改`、`下次提醒`、`宽限期`、`截止日期`、`passwordUpgradeDeadline`、`忘记密码`、`找回密码`、`本期无法找回`、`请用其他手机号注册`、`用验证码登录`、`旧进度无法迁移`、`联系管理员`、`重新注册`、`换手机号` | 同脚本词表 | 0 | **A** |
| 12 | 机器话兜底串：`暂无数据`、`加载失败`、`请求失败`、`No data`、`undefined`、`NaN`、`[object Object]` | `grep -rIn -E "暂无数据\|加载失败\|请求失败\|No data\|object Object" apps packages/ui/src` | 0（`undefined/NaN` 另由 §8.1 的文本快照断言覆盖：渲染结果里不得出现这两个词） | **A** |
| 13 | viewport 违规：`user-scalable=no`、`maximum-scale=1` | `grep -rn "user-scalable" mobile-memory apps` | 0 | **A** |
| 14 | 文案唯一真源：组件内不得自带中文字面量（须 import `@tm/shared/constants/copy\|errors`） | `grep -rIn "[一-龥]" packages/ui/src --include=*.tsx \| grep -v "^\s*//"` | 0（例外：`copy.ts` 自身、Storybook 样例、`RATING_LABELS` 等已登记常量） | B |
| 15 | 主题键唯一：`tm:theme` 只允许出现在 `use-theme-toggle` 内 | `grep -rn "tm:theme" apps packages` | ≤2（hook + §5.3 内联脚本字符串） | B |
| 16 | 原生侧禁 `Color.parseColor("#…")`：颜色只从 `res/values*/colors.xml` 取（§5.4） | `grep -rn "parseColor(\"#" mobile-memory/src mobile-memory/assets` | 0 | **A** |
| 17 | 两端同源清单未被复制（§4.2 的 8 项） | `grep -rn -E "RATING_LABELS\|INFLECTION_LABELS\|NAV_ITEMS" apps/web/src apps/app/src --include=*` 中"定义"出现次数 | 每项定义次数 = 1（定义在 `packages/{shared,ui}`，宿主只 import） | **A** |

### 8.3 截图与视觉回归（机器 + 人眼各一遍）

**截图矩阵（必拍，缺一即判未完成走查）**

| 页 | 视口 | 主题 | 状态 | 张数 |
|---|---|---|---|---|
| 首页 | 375×667、412×915、1280×800 | 浅 + 深 | 未查询 / 查询中(骨架) / 已查询 / 查不到 | 24 |
| 词详情 | 375、1280 | 浅 + 深 | 正常 / 无释义降级 / AI 记法失败 | 12 |
| 背词 | 375、1280 | 浅 + 深 | 正面 / 背面 / 撤销条 / 完成页 / 队列空 | 20 |
| 单词本 | 375、1280 | 浅 + 深 | 有词 / 空(未登录) / 空(已登录) / 筛选空 / 批量态 | 15 |
| 学习情况 | 375、1280 | 浅 + 深 | 正常 / 骨架 / 失败 / 离线 | 12 |
| 我的 | 375、1280 | 浅 + 深 | 已登录 / 脏值 / 未登录 / 通知被拒 / 待改密 | 15 |
| 登录·注册·激活·强制改密 | 375 | 浅 + 深 | 各态 + 4 条错误提示 | 16 |
| 抽屉与弹层 | 375 | 浅 + 深 | 更多抽屉 / ConfirmSheet / toast（含撤销） | 8 |
| 底 tab | 375（Web 窄）+ App | 浅 + 深 | 有红点 / 无红点 / `99+` | 6 |

> 合计 128 张，命名规约 `shots/{end}/{page}/{state}-{theme}-{w}x{h}.png`；基线首次由 UI 走查签字后锁定，此后 diff 即回归。

**机器判据**

1. **两端并排比对（R-22 ⑥）**：同一页（首页 / 背词 / 词本）Web 与 App 各 375px 截图**左右并排成一张** `shots/pair/{page}.png`，走查判据 = 除布局宽度与导航形态外，**语义色取值与组件形态一致**。取色法：在并排图上按固定语义点位（页面底、卡面、主按钮底、主按钮字、次文本、描边、选中 tab、红点）各采一个 8×8 区域，两端均值 RGB 逐通道差 **≤2** 即通过；超差即说明有一端绕开了 token（回 §8.2-1）。
2. **明暗两套同点位**：同页浅/深两张按同一点位表采样，断言取到的颜色能在 §5.1 的映射表里对上（不允许"深色只是加了个滤镜"或某个元素在深色下不可见）。
3. **首帧不闪白（§5.3）**：冷启动/硬刷新录制 5 帧，第 1 帧 `documentElement.classList` 含 `dark`（系统深色时）且首帧非白像素占比 >95%（深色）/ 底色为 `--bg`（浅色）；三档（浅/深/系统）各跑一次。
4. **reduced-motion diff**：`prefers-reduced-motion: reduce` 下对首页间隔 3 秒拍两张，像素 diff = 0（呼吸层必须完全静止）。
5. **骨架对齐**：同一页骨架屏与真实内容两张截图，做 box 对齐检查（各骨架块的 `x/y/w/h` 与对应真实元素误差 ≤4px）。
6. **溢出带**：每页整页截图 + `scrollWidth` 断言（§8.1-23）；App 需在 375 与 412 两档都过（R-19 ④）。
7. **对比度复测**：对 12 个关键文本节点（§1.4 表 1–15 中前 12 项）用取色 + 相对亮度公式在 CI 里复算（不是靠肉眼看），任一 <4.5 直接失败。

**人工走查（每页 3 问，签字才算过）**

| # | 页 | 三问（任一为"否"即返工） |
|---|---|---|
| 1 | 首页 | 3 秒内是否只看到"一个能输入的地方"？除搜索相关外是否还有第二个视觉重色？像不像"官网首页"而不是"管理台首页"？ |
| 2 | 结果条 / 详情 | 首义 ≤2 行不？AI 内容有没有把静态信息挤到折叠区？详情页能不能一眼找到"发音"和"收藏"？ |
| 3 | 最近查询 | 失焦后是否彻底不占位？面板像浮层还是像第 4 个区块？ |
| 4 | 背词 | 卡背面是否需要内部滚动？四档按钮是否一眼是"终点动作"？忘记/轻松的语义色是否只出现在按钮上？ |
| 5 | 完成页 | 大数字是否唯一焦点？打卡区是否一眼可点？有没有"任务已完成请退出"的客服感？ |
| 6 | 单词本 | 像不像"我的东西"而不是"表格视图"？批量条是否只在选中时出现？行高/斑马纹是否过度后台化？ |
| 7 | 学习情况 | 三张数字卡是否读得出进步？曲线与热力图在深色下是否仍可辨？有没有出现"缓存/ClickHouse/更新时间"类运维信息？ |
| 8 | 我的 | 三件事（身份/进步/设置）是否分区清晰？滑杆是否一眼知道要按"保存"？有没有系统状态词？ |
| 9 | 登录族 | 未登录的人 3 秒内是否知道"手机号 + 密码"是唯一门？错误提示是否给了可点的下一步？强制改密页是否"关不掉但没有威胁感"？ |
| 10 | 导航 | 5 个 tab 是否 22px 图标 + 11px 标签且互不粘连？更多抽屉是否像补充而不是第二个 tab 栏？顶栏标题是否与实际页一致？ |
| 11 | 深色整体 | 是否有任一元素在深色下"糊成一团"（卡与底同色、描边消失、图表线不可见）？图片/头像是否压黑过头？ |

### 8.4 明确不允许"以现状为准"的 8 个返工点（现状 → 目标）

| 现状（已核对源码） | 目标 | 判据 |
|---|---|---|
| `apps/web/src/app/globals.css:13/36` 紫色主色 `262 83%` | 绿色 `--brand`（§1.1/§1.3） | §8.2-2 |
| `apps/web/src/app/(user)/report/page.tsx:79-81`、`:182` 的 `24h 缓存`/数据源徽章 | `数据截至 今天 09:20` | §8.2-9、§3.7.5 |
| `apps/web/src/app/(user)/profile/page.tsx:182` 的 `头像图片 URL（可选）` + `保存头像` | 删除，改本机选图（§3.8.4） | §3.8.4 判据 |
| `profile/page.tsx:282` 的 `新密码（至少 4 位）` | `密码至少 8 位`（走 `errors.ts`） | §3.9.5 / R-40 ① |
| `apps/web/src/components/theme-provider.tsx`（effect 切类） | 删除，改 §5.3 内联脚本 | §8.3-3 |
| `mobile-memory/assets/index.html:5` 的 `user-scalable=no` | 新入口按 §7.7 写 | §8.2-13 |
| App `--muted #8a8f98`（白底 3.25:1） | `#5b6b66`（5.62:1） | §8.3-7 |
| App `padding-bottom:130px` 死占位 / `widget_bg #F4F5F6` 等 `colors.xml` 旧值 | §2.4 的 `calc()` 公式 / §5.4 镜像表 | §5.4、§8.2-16 |

### 8.5 判定流程（开发自查 → QA → UAT）

1. 开发提 PR 前本地跑 `pnpm boundaries && pnpm e2e:visual -- --update-snapshots`（首次建基线需 UI 走查签字，之后只准 diff 不准随意更新基线）。
2. CI 上 A 类断言红 → 阻断合并；B 类红 → 允许合并但挂在本期，出包前必须清零。
3. QA 走 §7.11 十项 + 本节 §8.3 人工 11 页三问，逐项签字；C 类例外只允许 §5.5（3 条）、§7.1（热力图 1 条）、§3.11.3（骨架 `h-` 清单）、§4.3（两端差异表）四组，**新增例外必须回来改本节并说明理由**。
4. UAT 只看两件事：① 首页与深色首页的第一眼感受是否达到 §1.0 "清晨、克制、可信"（用 §8.3 并排图说话）；② 11 页每页的三态（空/加载/错误）都截得到图、读得懂（§6.4 文案一字不差）。

---

## 9. 给开发的两句话

1. **组件只长在 `packages/ui` 上**：primitives 保持架构 §3.1 的 13 个（只加 §3.11 登记的 `slider`），patterns 保持架构的 12 个（只加已登记的 6 个：`Toast / Markdown / QueueSwitch / SessionSummary / ReviewCta / SettingRow`）；props 一律 `{data, loading, error, onXxx}` 四段式（数据 + 两态 + 回调，**组件内不发请求**，`UiHost` 提供 `kv / speak / navigate / toast`），变体一律 `variant: 'primary'|'secondary'|'ghost'|'danger'` + `size: 'sm'|'md'|'lg'`（图标按钮 `tone: 'default'|'muted'|'danger'`），除 `className` 透传外不接受任何颜色类名入参，宿主只能用 §1.12.2 的语义类微调。
2. **写样式时只允许三种动作**：用语义类（`bg-surface text-ink border-hair bg-brand-soft bg-sunken`）、用语义间距/字号/圆角/时长 token、用 §5.1 的变量 —— 除此之外：**不许写 hex、不许写 `rgb()/hsl()` 字面量、不许写 `!important`（唯一例外是 §1.11 的 reduced-motion 块且必须挂注释）、不许写 `dark:` 条件类做换色（深色靠同名变量换值，§5.5 的 3 条例外之外全算返工）、不许写 `z-[`、`duration-[`、`text-[Npx]` 任意值**；这些不是风格建议，§8.2 的 grep 会在 CI 上直接红。
