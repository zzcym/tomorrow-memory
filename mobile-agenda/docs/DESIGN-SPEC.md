# 明日日程 · Design Spec v2

设计基调：白纸上的墨线。参照 Things 3 / Apple 日历的克制——白底、hairline 分层、单一主色、极轻动效。信息是主角，界面退后。

---

## 1. 主色：墨青（方向 A）

**#0F6B5C**。理由：沉静的青绿传达"秩序与掌控感"，与日程工具气质一致；且它与"当前时间线"的红色互为对比色、互不打架（朱砂会与红线、危险色全部冲突，故排除）。

### 墨青色阶（day）

| Token | Hex | 用途 |
|---|---|---|
| teal-50 | #F2F8F6 | 极浅底（暂未用，备用） |
| teal-100 | #E0EEEA | 选中底纹备选 |
| teal-300 | #96C1B4 | 装饰 |
| teal-500 | #378570 | 次级强调 |
| teal-700 | **#0F6B5C** | 主色：主按钮 / 今天 / 选中 / 导航激活 |
| teal-800 | #0B5347 | 主色按压 |
| teal-900 | #0A4A3E | 浅底上的事件文字（primary-fg） |

夜间主色换为 **#52B09A**（薄荷青，暗底可读），按钮文字用深色 `--on-primary:#07231D`，不再用白字。

### 中性 & 语义 token（完整两套）

| Token | Day | Night | 用途 |
|---|---|---|---|
| --bg | #FFFFFF | #0E1211 | 页面底 |
| --surface | #FFFFFF | #161B19 | 卡片/分段控件激活面 |
| --fill-1 | #F3F4F3 | #1D2321 | 输入框底、分段轨道 |
| --fill-2 | #EBEDEB | #262D2A | 按压底 |
| --fill-3 | #DFE2E0 | #333B38 | 拖把条、强填充 |
| --text-1 | #1B1F1E | #E8ECEA | 主文本 |
| --text-2 | #59625E | #A2AAA6 | 次文本、图标默认 |
| --text-3 | #8A928E | #6E7672 | 刻度、占位、辅助 |
| --text-4 | #B9C0BC | #4A514E | 禁用 |
| --hairline | rgba(0,0,0,.08) | rgba(255,255,255,.09) | 分隔线 |
| --hairline-strong | rgba(0,0,0,.13) | rgba(255,255,255,.16) | 描边按钮/输入框 |
| --danger | #D64540 | #F0655F | 当前时间线、删除、录音态 |
| --on-danger | #FFFFFF | #3A0D0B | 危险按钮文字 |
| --ok | #2E7D4F | #63B98A | 成功 |
| --inverse-bg / fg | #262B29 / #F4F6F5 | #E8ECEA / #161B19 | Toast 反色 |
| --scrim | rgba(0,0,0,.38) | rgba(0,0,0,.55) | 遮罩 |
| color-scheme | light | dark | 原生控件跟随 |

### 事件分类色（浅底色块 + 深色文字，日/夜自动换挡）

| 类 | day bg / fg / bar | night bg / fg / bar |
|---|---|---|
| teal（默认） | rgba(15,107,92,.10) / #0A4A3E / #17806C | rgba(102,199,175,.14) / #9ADCC9 / #57B39B |
| c-blue | rgba(36,92,190,.10) / #1C4390 / #2E64C4 | rgba(112,156,255,.15) / #A9C2FF / #7396F0 |
| c-red | rgba(214,69,64,.10) / #93312D / #D64540 | rgba(255,124,118,.15) / #FFB3AE / #EF7069 |
| c-orange | rgba(210,112,26,.12) / #8A4A10 / #D2701A | rgba(255,167,92,.15) / #FFC79A / #E89B5C |
| c-green | rgba(46,125,79,.11) / #275C3B / #358A55 | rgba(116,201,146,.14) / #A9DDBD / #62B583 |
| c-slate | rgba(73,86,100,.10) / #3D4753 / #5D6E80 | rgba(168,182,200,.14) / #C6CFDB / #8E9DB0 |

---

## 2. 字号阶梯

| 级 | px/行高 | 字重 | 用途 |
|---|---|---|---|
| display | 26 / 1.2 | 700 | `.tb-title` 大标题（日期数字 tabular-nums） |
| title | 16 / 1.4 | 600 | `.sheet-title`、卡片标题 |
| headline | 15 / 1.4 | 600 | `.dh-date`、`.ws-num` |
| body | 14 / 1.5 | 400/500 | 正文、`.menu-item`、输入框、`.btn` |
| secondary | 13 / 1.5 | 400/500 | `.tb-sub`、`.seg-btn`、`.chip` |
| caption | 12 / 1.4 | 500 | `.evb-loc`、标签、`.dh-today` |
| micro | 11 / 1.3 | 500 | `.tl-hour`、`.ws-dow`、`.evb-time`、`.ev-block.mini` |

数字（时间、日期、刻度）一律 `font-variant-numeric: tabular-nums`。

## 3. 间距 / 圆角 / 描边与阴影

- 间距 4pt 网格：4 / 8 / 12 / 16 / 20 / 24；页面左右 16，卡片内 16，组件间 12。
- 圆角：sm 8（mini 事件 6）、md 10（按钮/输入/事件块）、lg 12（菜单、周条日格）、xl 14（卡片、抽屉顶部）。胶囊仅用于 chip / today / toast。
- 分层靠 1px hairline，不靠阴影。仅三处允许阴影：弹出菜单 `0 10px 30px rgba(23,32,29,.14)`、抽屉 `0 -10px 34px rgba(23,32,29,.10)`、分段控件激活面 `0 1px 3px rgba(23,32,29,.10)`；主按钮浮起投影用主色低透明度 `0 8px 20px rgba(15,107,92,.30)`。

## 4. 关键布局尺寸

- `.topbar`：padding `max(10px, safe-top) 16 6`；左大标题+副标题（副标题为 `.tb-title` 内的 block），右 `.seg` + 38px `.icon-btn`。
- `.seg`：轨道 fill-1、内边距 2、按钮高 28、激活面 surface + 微阴影。
- `.week-strip`：7 等分；`.ws-num` 15px/600，`.today` 数字变主色，`.selected` 数字填充 30px 主色圆、白字。
- 时间轴：`--row-h:56px`×24，`--tl-gutter:52px`（刻度左对齐，文字 11px tabular）；`.tl-events` 绝对定位层 `pointer-events:none`，`.ev-block` 恢复 `auto`；`.now-line` 红线 1.5px + 7px 圆点，z 在事件之上。
- 周视图：`--wg-gutter:44px` + 7 列，刻度线 `.wg-hour` 绝对定位（JS 内联 top = i×56px），日列间 1px hairline；`.ev-block.mini` 高约 18px、左侧 2.5px 色条、单行省略、隐藏时间/地点。
- `.bottom-nav`：固定底部，高约 58 + safe-bottom，面板底 + hairline 上缘；中间 `.nav-mic` 54px 圆形主按钮上浮 16px；`.recording` 转危险红并外扩呼吸圈。
- `.sheet`：底部滑入，顶部圆角 14，`max-height:85vh`，`.sheet-body` 内部滚动（≤60vh）。
- `.menu-pop`：右上弹出，min-width 176，item 高 42，圆角 12。
- `.voice-overlay`：全屏深色 scrim + blur，104px 主色圆 `.vo-orb` 双呼吸圈，`.vo-cancel` 底部胶囊。

## 5. 组件规格要点

- **事件块 `.ev-block`**：浅色底（分类色 10~14% 透明度）+ 同色系深字，无边框；`.compact` 单行只留标题；`.all-day` 转为通栏矮条；`.past` 降透明度 0.5。
- **`.field`**：label 12.5/500 text-2，输入框 44 高、fill-1 底、无边框态 → focus 时 border 变主色 + 底转 surface。
- **`.btn`**：44 高、radius 10；primary 实心墨青、ghost 描边、danger 实心红；按压 `scale(.97)`。
- **`.toast`**：顶部安全区下方反色胶囊，`pointer-events:none`。
- **`.course-row`**：时间列 tabular + 主信息，行间 hairline，末行无线。
- **`.error-text`**：12.5px danger。

## 6. 动效参数（全部无弹跳）

| 场景 | 参数 |
|---|---|
| 按压反馈 | `transform:scale(.97)`，120ms ease；背景色 150ms |
| 抽屉滑入 | translateY(100%)→0，240ms cubic-bezier(.32,.72,0,1) |
| 遮罩 / Toast / 录音浮层淡入 | 200ms ease |
| 菜单弹出 | scale(.96)→1 + fade，160ms cubic-bezier(.2,.8,.3,1)，原点右上 |
| 录音呼吸圈（唯一循环动效） | scale 1→1.5 + 淡出，1.6~1.8s ease-out infinite |
| 时间线 | 静态红线，无动画 |

显隐约定：`.menu-pop` / `.sheet` / `.sheet-mask` / `.voice-overlay` 默认可见，用全局 `.hidden{display:none!important}` 切换；由 none→block 会自动重放入场动画。`prefers-reduced-motion: reduce` 时全部动画/过渡关闭。

## 7. 自定义背景（body.has-bg）可读性策略

- JS 只需给 body 设 `background-image` 并加 `has-bg` 类；CSS 负责 cover/fixed/居中。
- 叠加双层保障：① 全屏薄纱 `body::before`（日间白 14%、夜间黑 35%）；② 所有面板（topbar/卡片/抽屉/底部导航/菜单/周视图表头）切换为 `--panel-bg` 半透明 + `backdrop-filter: blur(18px) saturate(160%)`：日间 rgba(255,255,255,.78)、夜间 rgba(18,23,21,.72)；`@supports not (backdrop-filter)` 时升到 .94 不透明兜底。
- 事件块改为**近不透明白/深面板 + 3px 分类色左条**（--ev-panel），颜色语义保留、正文对比度拉满。
- 刻度/日期等游离文字加同色系 text-shadow 光晕（--halo）。
- 输入框、chip 在 has-bg 下各自提到 ≥.72 不透明度。

## 8. 「去 AI 味」自查清单

1. **Don't** 紫/蓝紫渐变主色、渐变按钮、渐变横幅。**Do** 单一墨青实色，页面彩色占比 <10%。
2. **Don't** emoji 当图标。**Do** 24px 线性 SVG、stroke 1.8、currentColor（icons.js）。
3. **Don't** 满屏玻璃拟态卡片。**Do** blur 只出现在固定栏与 has-bg 模式。
4. **Don't** 圆角 20px+ 的"药丸大卡"。**Do** 10~14px，小元素 6~8px。
5. **Don't** 多层彩色投影堆立体感。**Do** 1px hairline 分层，阴影仅弹层三处。
6. **Don't** 居中大标题 + 居中按钮堆叠的"海报式"布局。**Do** 左对齐大标题、信息左读。
7. **Don't** 全文一档灰。**Do** text-1/2/3/4 四级灰阶各司其职。
8. **Don't** 比例字体排时间。**Do** 一切数字 tabular-nums。
9. **Don't** spring/弹跳/陀螺视差。**Do** 只保留滑入、按压、录音呼吸、静态红线，150~250ms。
10. **Don't** 假设深色底设计浅色组件。**Do** 默认纯白底达 AA 对比（正文 ≥4.5:1），夜间与 has-bg 是覆盖态而非默认态。

## 9. icons.js

`window.ICONS['名称']` 返回完整 `<svg>` 字符串：`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-width="1.8"`、圆头圆角，24px 默认尺寸（CSS 可覆写）。已含：calendar, week, mic, sliders, dots, plus, close, chevronL, chevronR, clock, pin, note, image, upload, sun, moon, trash, check, refresh, book, alarm，另附 inbox（空状态）、alert（错误）。
