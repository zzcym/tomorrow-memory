# `@tm/ui/patterns` — 接口契约（T-05）

> **本文件即接口契约**。架构 §10.2 T-05 行明写：批次2 出口后不得再改签名；
> 确需改动 → 回 `02-tech-design.md` 登记并由 TPM 裁决。消费方：T-12 / T-13 / T-15 / T-17 / T-18。
>
> - 出口：`packages/ui/src/patterns/index.ts`（根出口 `@tm/ui` 已由 T-04 预留 `export * from './patterns/index.js'`）。
> - 铁律：**全部 props 驱动、零网络、零 store、零宿主假设**（§3.5 `ui-no-io`）。导航/存储/发音/Toast 一律走 `useHost()`（`../host.tsx`）。
> - 文案：**包内不写任何中文字面量**（§8.2-14，由 `packages/ui/test/ui.spec.tsx` 逐行断言）。
>   下表 `默认值` 列里写的中文一律是 `@tm/shared/constants/copy` 的常量名（§4.2-2 唯一真源）；
>   标 **`宿主注入`** 的 prop 没有默认值 = shared 目前**缺该常量**，宿主必须传（需求清单见 `04-dev-report-T-05.md`）。
> - 尺寸/颜色：只用 `@tm/ui/styles/tokens.css` + `tailwind-preset` 的语义类（§1.12.2）。表内 `--tap`=44px、`--search-h`=50px。
> - `React.Ref`：全部组件用 `forwardRef`，`Handle` 见各节。

## 目录

| # | 组件 | 规范出处 | 双端 |
|---|---|---|---|
| 1 | `SearchBar` | §3.1.5 / §3.2 / §3.3 / §3.6.3 / §7.4 | 同源，差异 = `size` |
| 2 | `LookupResultBar` | §3.2 | 同源，差异 = `layout` + 义项行数 |
| 3 | `ReviewCta` | §3.1.2 C/D、§3.1.5 | 完全同源（`href` 由宿主给） |
| 4 | `RecentSearchPanel` | §3.3 | 同源，容器差异由宿主 `className` |
| 5 | `WordDetailCard` | §3.4 全节 | 完全同源 |
| 6 | `Flashcard` | §3.5.2 / §3.5.3 / §3.5.5 | 同源，差异 = 桌面卡宽 ≤600px |
| 7 | `RatingBar` | §3.5.4 / §7.4 | 完全同源（禁 `.primary-rate`） |
| 8 | `WordbookList` | §3.6.2 / §3.6.4 / §3.6.7 | 同源，差异 = `variant` |
| 9 | `StatCard` | §3.7.2 / §3.7.3 | 同源 |
| 10 | `GrowthLine` | §3.7.2 / §3.11.6 / §7.5 | 同源，差异 = `heightPx` |
| 11 | `Heatmap` | §3.7.2 / §3.7.3 / §3.7.6 / §7.1 唯一豁免 | 同源（R-27 ③ 禁两份） |
| 12 | `EmptyState` | §3.11.7 / §3.6.5 / §3.7.4 | 同源 |
| 13 | `ConfirmSheet` | §3.11.2 | 同源，差异 = variant（桌面 dialog / 移动 sheet） |
| 14 | `SkeletonBlock` | §3.11.3 | 同源 |

**共用的窄类型（在同一组件文件里声明并从 `patterns/index.ts` 再导出）**：
`SearchBarHandle`、`SearchBarSize`、`LookupResultBarProps`、`HeatmapMode`、`HeatmapDayCell`、
`GrowthLinePoint`、`WordbookRow`、`StatCardTone`、`EmptyStateAction`、`ConfirmSheetProps`、
`SkeletonBlockVariant`、`RatingBarProps`、`FlashcardSide`、`WordDetailSection`。

---

## 1. `SearchBar`（`SearchBar.tsx`）

整卡 = `role="search"` 容器 + `sr-only` `<label>` + 输入 + 框内清除 ✕ + 框内提交。
最近查询面板经 `children` 插槽渲染在框下方 `z-pop`（`panelOpen=false` 时**不渲染子树**，§3.3）。
**判据⑤：`focus()` 经 ref 暴露**（R-20 ③ 小组件直达、R-21 ⑥）。

`ref` → `SearchBarHandle`：`focus(): void`（聚焦并 `select()`）、`blur(): void`、`getInput(): HTMLInputElement | null`。

| prop | 类型 | 默认值 | 必填 | 说明 / 场景 |
|---|---|---|---|---|
| `value` | `string` | — | ✅ | 受控输入值（R-07 ②） |
| `onChange` | `(value: string) => void` | — | ✅ | 本地过滤场景（词本 §3.6.3）与首页都用；组件**不发请求** |
| `onSubmit` | `(value: string) => void` | `undefined` | — | Enter 与提交按钮共用；缺省时不提交（宿主自接 `onKeyDown`） |
| `onClear` | `() => void` | `undefined` | — | ✕ 与 Esc（§7.4 Esc 清空并保持焦点） |
| `size` | `'hero' \| 'list'` | `'hero'` | — | `hero` = 首页 50px `--r-full`（§3.1.5）；`list` = 词本工具条 44px `--r-lg`（§3.6.3） |
| `placeholder` | `string` | `SEARCH_PLACEHOLDER`（`shared/copy`） | — | 值非空时宿主应传 `''`（§6.4：输入中无 placeholder） |
| `label` | `string` | **宿主注入**（定稿 `查单词`，§3.1.6） | ✅ | `sr-only` 字段名，禁只靠 placeholder |
| `submitLabel` | `string` | `VERBS.query` | — | 放大镜按钮 `sr-only` 名（§6.5） |
| `clearLabel` | `string` | `VERBS.clear` | — | ✕ 的可访问名 |
| `busy` | `boolean` | `false` | — | 提交中：放大镜 → 16px 环（`animate-spinner`，§3.1.5） |
| `disabled` | `boolean` | `false` | — | 灰底 + `opacity .5`，placeholder 不断链（§1.4 #2） |
| `panelOpen` | `boolean` | `false` | — | → `aria-expanded` |
| `panelId` | `string` | `undefined` | — | → `aria-controls`（指向 `RecentSearchPanel` 的 `id`） |
| `children` | `React.ReactNode` | `undefined` | — | 面板插槽 |
| `maxLength` | `number` | `WORD_MAX_LENGTH`（`@tm/shared`） | — | 64 |
| `containerClassName` / `className` | `string` | `undefined` | — | 外层定位（App `z-dock`）/ 框体覆写 |
| `id` / `testid` | `string` | `undefined` | — | `id` 给 `label htmlFor` 用 |
| `onFocus` `onBlur` `onKeyDown` | `(e: React.KeyboardEvent<HTMLInputElement> \| React.FocusEvent<HTMLInputElement>) => void` | `undefined` | — | 透传 |

双端差异（仅此）：Web 首页吸顶、App `z-dock` 绝对层；高度恒 50/44px 两档。

---

## 2. `LookupResultBar`（`LookupResultBar.tsx`）

§3.2 的"精简结果条"。根 = `<div role="group">` + **显式 `<a>`「查看详情」**（禁 `<a>` 嵌 `<button>`）；
整卡可点由根上的 `onClick` 走 `onOpen ?? host.navigate(detailHref)`，行内控件 `stopPropagation`。
`layout='card'` = 英→中单条卡（3 行）；`layout='row'` = 中→英列表条目（词 + 首义 + 喇叭，行高 ≥52px）。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `word` | `string` | — | ✅ | 词头 `text-h3`/`text-display-xs`，`lang="en"` |
| `phonetic` | `string` | `''` | — | `text-sm text-ink-muted`，`lang="en"`；空则不渲染 |
| `gloss` | `string` | `''` | — | 义项行；`line-clamp-2`（桌面 2 行）/`max-md:line-clamp-1`（移动 1 行），截断规则同一份 `format.ts`（§4.1 末列） |
| `layout` | `'card' \| 'row'` | `'card'` | — | 见上 |
| `detailHref` | `string` | — | ✅ | `/word/{w}?from=home` 或 `#/word/{w}?from=…`（§3.4 `from=`） |
| `onOpen` | `(href: string) => void` | `undefined` | — | 缺省走 `host.navigate(detailHref)` |
| `detailLabel` | `string` | `LOOKUP_COPY.resultActions.detail` | — | 窄屏 320px 缩为纯 `›` + `aria-label`（CSS 实现） |
| `detailAriaLabel` | `string` | **宿主注入**（定稿 `查看 {word} 的完整释义`，§3.2 无障碍） | — | 缺省时回退 `detailLabel` |
| `inWordbook` | `boolean` | `undefined` | — | 传 `onToggleFavorite` 才渲染星标 |
| `onToggleFavorite` | `() => void` | `undefined` | — | → `aria-pressed`（§7.5 收藏星标） |
| `favoriteLabel` / `favoritedLabel` | `string` | `VERBS.favorite` / `VERBS.favorited` | — | |
| `onSpeak` | `(word: string) => void` | `undefined` | — | 缺省不渲染喇叭；有则内部走 `useSpeak()` 呈现 `speaking` |
| `speakLabel` | `(word: string) => string` | `ARIA.speak` | — | 播放中换 `正在播放` → **宿主注入** `speakingLabel` |
| `speakingLabel` | `string` | **宿主注入** | — | `aria-label` while playing |
| `ttsUnavailable` | `boolean` | `false` | — | **保持可点**，点击给行内提示（R-14 ⑥，不只 toast） |
| `ttsUnavailableHint` | `string` | `STUDY_COPY.ttsUnavailable` | — | 行内 `text-xs text-warning` |
| `onSpeakUnavailable` | `() => void` | `undefined` | — | 跳系统设置 / 帮助段（宿主决定） |
| `dismissHintLabel` | `string` | `undefined` | — | **宿主注入**；传了才在行内提示右侧给 ✕（可关闭该提示，§7.5 可关闭元素需可访问名）；不传 = 不可关 |
| `onDirectionChange` | `() => void` | `undefined` | — | 行3「换个查询方向」文字链 |
| `directionLabel` | `string` | **宿主注入** | — | 定稿见 §3.2 行3 |
| `directionAriaLabel` | `string` | **宿主注入** | — | `改用英译中查询`／`改用中译英查询` 动态 |
| `partial` | `boolean` | `false` | — | 有词头无释义：首义位显示 `partialHint`，禁 `undefined`/空白（R-09 ④） |
| `partialHint` | `string` | **宿主注入** | — | |
| `staleHint` | `string` | `undefined` | — | 离线/缓存：`text-xs text-ink-muted` 一行（§3.4.3） |
| `ariaLive` | `'polite' \| 'off'` | `'polite'` | — | 结果区 `aria-live`（§3.2 末） |
| `className` / `testid` | `string` | `undefined` | — | |

---

## 3. `ReviewCta`（`ReviewCta.tsx`）

首页「今天还有 N 词要背」胶囊。是 `<a>` 不是 `<button>`（§3.1.6）；外锚点命中 ≥44px，内芯 `h-9`。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `due` | `number` | — | ✅ | 数字唯一来自 `DueCountDto.dueToday`（宿主注入，禁组件自算） |
| `href` | `string` | — | ✅ | `/study` 或 `#/study` |
| `onNavigate` | `(href: string) => void` | `undefined` | — | 缺省 `host.navigate(href)` |
| `signedIn` | `boolean` | `true` | — | `false` → 文案 `HOME_CAPSULE.signedOut(due)`，同色不置灰（§3.1.5） |
| `loading` | `boolean` | `false` | — | 数字位骨架 28×14px（`aria-hidden`），整句 `aria-label` 保持可读 |
| `streak` | `number` | `undefined` | — | 传了才在 `aria-label` 里追加 `formatStreak(streak)` |
| `ariaLabel` | `string` | `due>0 ? HOME_CAPSULE.due(due) : HOME_CAPSULE.cleared` | — | §3.1.6：整句 `aria-label`，数字 `<span aria-hidden>` |
| `className` / `testid` | `string` | `undefined` | — | `testid` → `data-testid`（§8 走查锚点，与其余 13 件同口径） |

文案：`due>0` → `HOME_CAPSULE.due(due)`；`due===0` → `HOME_CAPSULE.cleared`；未登录 → `HOME_CAPSULE.signedOut(due)`。

---

## 4. `RecentSearchPanel`（`RecentSearchPanel.tsx`）

§3.3 聚焦面板。**`open=false` 时整棵子树不渲染**（不是 `visibility:hidden`，R-07 ④ / R-10 ①）。
数据由宿主从 `useRecentSearches()`（`@tm/ui/hooks`，走 `host.kv`）取好后注入 —— 组件自身不读 kv。
↑↓ 移焦 + Enter 选中 + Esc 关闭（`open` 时挂 `document` keydown；§7.4）。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `open` | `boolean` | — | ✅ | 见上 |
| `items` | `RecentSearchItemDto[]` | — | ✅ | ≤20 条由 `RECENT_MAX` 与 `useRecentSearches` 保证 |
| `onSelect` | `(item: RecentSearchItemDto) => void` | — | ✅ | **复用缓存结果，不再发请求**（R-10 ③） |
| `onRequestClear` | `() => void` | `undefined` | — | 「清空」→ 宿主弹 `ConfirmSheet`（§3.3 末条）；无历史时整行不渲染 |
| `clearLabel` | `string` | `LOOKUP_COPY.recent.clear` | — | |
| `title` | `string` | `LOOKUP_COPY.recent.title` | — | 头部行文案 |
| `timeLabel` | `(at: number) => string` | `undefined` | — | `刚刚 / N 分钟前 / …`（§3.3）；缺省不渲染时间。真源应为 `patterns/format.ts`（**本任务不可写**，见报告） |
| `noGlossLabel` | `string` | **宿主注入**（定稿 `（无释义）`） | — | 首义缺失不得留空白（R-10 ②） |
| `emptyHint` | `string` | **宿主注入**（§3.1.5 聚焦且无历史那行） | — | 传了才渲染 108px 空态；不传 = 不渲染 |
| `storageErrorHint` | `string` | **宿主注入**（`暂时读不到查词记录`） | — | kv 异常时一行，不空白 |
| `onDismiss` | `() => void` | `undefined` | — | Esc |
| `onActiveIndexChange` | `(index: number \| null) => void` | `undefined` | — | 宿主若要 `aria-activedescendant` 口径可接管 |
| `id` / `className` / `listClassName` | `string` | `undefined` | — | `id` = `SearchBar.panelId` 的目标 |
| `maxHeightPx` | `number` | `320` | — | 内部滚动 + `overscroll-contain`（§3.3） |
| `testid` | `string` | `undefined` | — | |

---

## 5. `WordDetailCard`（`WordDetailCard.tsx`）

§3.4 的 1–7 区（**不含顶栏与吸底操作条外壳**：那是 T-12/T-17 的宿主壳；操作区按钮在卡内、由 props 决定是否出现）。
区块顺序锁死，无内容的区块整块不渲染（R-14 ③⑤）。`<h2>` 不跳级。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `word` | `string` | — | ✅ | 区块 2 `text-display`（移动 `display-xs`）`lang="en"` |
| `phonetic` | `string` | `''` | — | |
| `groups` | `TranslationGroup[]`（`@tm/shared`） | `[]` | — | 区块 3 词性分组；≥2 义项才编号 |
| `meaningLabel` / `inflectionLabel` / `exampleLabel` / `mnemonicLabel` | `string`（四者同） | **宿主注入**（定稿 `释义` / `词形变化` / `例句` / `AI 记法`，§3.4） | — | 四个区块的小标题与 `<section aria-label>` **同源同一串**：传了才渲染 `<h3>`，不传 = 该块无可见小标题、`<section>` 也无 `aria-label`（读屏退化为按内容定位）。包内不写中文（§8.2-14）故无默认值 |
| `freqLabel` | `string` | `undefined` | — | 区块 2 Badge（`neutral`），**不叫 `tag`** |
| `inflections` | `ReadonlyArray<{ tag: string; form: string }>` | `[]` | — | 区块 4；`tag` 形如 `p:`，标签取 `INFLECTION_LABELS`，`INFLECTION_HIDDEN` 与未知 tag 整条不渲染（§6.3）。**绝对禁止**原始缩写上屏 |
| `examples` | `ExamplePair[]` | `[]` | — | 区块 5；≤3 全展开，>3 折叠为 `examplesCollapseLabel(n)`，`aria-expanded` |
| `examplesCollapseLabel` | `(n: number) => string` | **宿主注入**（`还有 N 句`） | — | |
| `enDefinition` | `string` | `undefined` | — | 区块 6 默认收起；`whitespace-pre-line`。渲染 Markdown 由宿主经 `enDefinitionSlot` 覆盖 |
| `enDefinitionSlot` | `React.ReactNode` | `undefined` | — | 放 `@tm/ui/patterns/Markdown`（不在本任务 14 件内） |
| `enDefinitionLabel` | `string` | **宿主注入**（`英文释义`） | — | |
| `mnemonicState` | `'absent' \| 'collapsed' \| 'loading' \| 'content' \| 'failed'` | `'absent'` | — | 区块 7 五态（§3.4.2）；`absent` 整块不显示 |
| `mnemonic` | `React.ReactNode` | `undefined` | — | 展开后的内容（Markdown） |
| `onMnemonicToggle` | `() => void` | `undefined` | — | `<button aria-expanded>` 整行 52px |
| `onMnemonicRetry` | `() => void` | `undefined` | — | 失败态 `重试`；静态释义必须仍可见（R-09 ⑥） |
| `mnemonicCollapsedLabel` | `string` | **宿主注入**（§3.4.2 定稿一行） | — | |
| `mnemonicFailLabel` | `string` | `STUDY_COPY.aiMnemonicFail` | — | |
| `onSpeak` | `(word: string) => void` | `undefined` | — | 喇叭 44 热区 |
| `speakLabel` | `(w: string) => string` | `ARIA.speak` | — | |
| `ttsUnavailable` / `ttsUnavailableHint` / `onSpeakUnavailable` | `boolean` / `string` / `() => void` | `false` / `STUDY_COPY.ttsUnavailable` / `undefined` | — | 行内提示（§3.4.3） |
| `inWordbook` | `boolean` | `undefined` | — | 区块 8 |
| `onToggleFavorite` | `() => void` | `undefined` | — | 主按钮 `VERBS.favorite`/`favorited`（实心主色，§3.4.3） |
| `onStudy` | `() => void` | `undefined` | — | 次按钮 |
| `studyLabel` | `string` | **宿主注入**（`立即背这个词`） | — | |
| `backHref` / `onBack` / `backLabel` | `string` / `() => void` / `string` | `undefined` / `undefined` / `ARIA.back` | — | `?from=` 决定（R-09 ③）；不传即不渲染返回 |
| `cachedHint` | `string` | `undefined` | — | 弱网降级一行（§3.4.3） |
| `loading` | `boolean` | `false` | — | 卡内 `SkeletonBlock` |
| `emptyTitle` / `emptyHint` / `onRetry` / `retryLabel` / `secondaryAction` | `string` / `string` / `() => void` / `string` / `{ label: string; onClick: () => void }` | `LOOKUP_COPY.notFound.*` / **宿主注入** / `undefined` / `VERBS.retry` / `undefined` | — | 完全无内容 → 空态卡（`重试` + `去背别的`，不白屏） |
| `className` / `testid` | `string` | `undefined` | — | |

## 6. `Flashcard`（`Flashcard.tsx`）

§3.5.2/3.5.3。**无 3D 翻转**：正背切换 = 内容替换 + `animate-fade-in`（`--dur-micro`）。
背面高度自适应、**卡内不套 `overflow:auto`**（§3.5.3 必删项）。整卡正面为 `<button aria-label="显示释义">`。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `word` / `phonetic` | `string` / `string` | — / `''` | ✅ / — | 正面居中；`lang="en"` |
| `side` | `'front' \| 'back'` | — | ✅ | 受控 |
| `onFlip` | `() => void` | `undefined` | — | 点击与 `Space/Enter`（`CARD_FLIP_KEYS`） |
| `groups` / `examples` / `inflections` / `mnemonic` | 同 `WordDetailCard` | `[]` / `[]` / `[]` / `undefined` | — | 背面结构顺序 = §3.5.3 |
| `index` / `total` | `number` / `number` | — | ✅ | 顶部 `STUDY_COPY.progress(index,total)`，`aria-live="polite"` |
| `progressValueText` | `string` | **宿主注入**（`今天 3/12`） | — | 顶部进度条 `aria-valuetext`（§7.5 progressbar） |
| `progressDone` / `progressTotal` | `number` / `number` | `undefined` | — | 传了才渲染 6px 进度条 |
| `onSpeak` / `speakLabel` / `ttsUnavailable` / `ttsUnavailableHint` | 同 §2 | 同 §2 | — | 喇叭在**正面**音标右侧 8px（R-14 ②） |
| `noGloss` | `boolean` | `false` | — | §3.5.5 跳过态（不评分盲路径禁止） |
| `noGlossHint` | `string` | **宿主注入** | — | `不评分也不影响后面的词，改天再补` |
| `onRetryGloss` / `onSkip` | `() => void` | `undefined` | — | 文案 `STUDY_COPY.noGloss.retry` / `.skip` |
| `onOpenDetail` | `() => void` | `undefined` | — | 背面出口 `查这个词 ›`（`from=study`） |
| `detailLabel` | `string` | **宿主注入** | — | |
| `inWordbook` / `onToggleFavorite` / `favoriteLabel` / `favoritedLabel` | 同 §2 | 同 §2 | — | R-16 ① 背词卡也要显式收藏 |
| `undo` | `{ remaining: number; onUndo: () => void; label?: string; ariaLabel?: string } \| undefined` | `undefined` | — | 顶部 `撤销上一张`；`label` 默认 `STUDY_COPY.undo.button`，`ariaLabel` 默认 `ARIA.undoRating`；`remaining<=0` 不渲染（上限 `UNDO_MAX_PER_SESSION`） |
| `swipeSubmit` | `boolean` | `false` | — | §3.5.4 横滑（`touch-action: pan-y`，≥24px 出胶囊、≥`FLASHCARD_SWIPE_THRESHOLD_PX` 松手提交、纵向 >12px 终止） |
| `onSwipeRating` | `(rating: RatingValue) => void` | `undefined` | — | 左 = `RATING_VALUES[0]`（忘记）/ 右 = 末位（轻松），**不写字面量 1/4** |
| `hint` | `string` | `undefined` | — | 正面触屏提示（`STUDY_COPY.cardFaceHint` 由宿主传） |
| `loading` | `boolean` | `false` | — | 卡位骨架 |
| `className` / `testid` | `string` | `undefined` | — | 桌面 `max-w-read` 居中由宿主 className 给 |

## 7. `RatingBar`（`RatingBar.tsx`）— 判据②

四档 **同权重**（禁主推实心档 / 禁 `.primary-rate`）+ **撤销位**。
`RATING_VALUES` / `RATING_LABELS_ORDERED` / `ARIA.rating` / `UNDO_MAX_PER_SESSION` **全部 import 自 `@tm/shared`**，
包内 `[1,2,3,4]` 一个字面量都不出现（`patterns.spec.tsx` 有源码级断言）。
四档色：`bg-danger-soft/text-danger`、`bg-warning-soft/text-warning`、`bg-brand-soft/text-brand`、`bg-success-soft/text-success`（按 `RATING_VALUES` 数组序映射）。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `onSelect` | `(rating: RatingValue) => void` | — | ✅ | |
| `intervals` | `Partial<Record<RatingValue, string>>` | `undefined` | — | 小字（`formatReviewInterval(min)` 的结果，宿主算）；桌面显示、移动 CSS 隐藏 |
| `showIntervals` | `boolean` | `true` | — | `false` = 完全不出小字 |
| `labels` | `readonly string[]` | `RATING_LABELS_ORDERED` | — | 长度必须等于 `RATING_VALUES.length` |
| `disabled` | `boolean` | `false` | — | `aria-disabled` 而非 `disabled`（§7.5，不丢焦点） |
| `pending` | `RatingValue \| null` | `null` | — | 乐观提交中的那一档（降透明度，不锁 UI） |
| `undo` | `{ onUndo: () => void; remaining: number; label?: string; ariaLabel?: string } \| undefined` | `undefined` | — | 撤销位；`remaining<=0` 时禁用并 `aria-disabled` |
| `maxUndo` | `number` | `UNDO_MAX_PER_SESSION` | — | 只用于文案 `remaining/maxUndo` 展示，不自行计数 |
| `keyboard` | `boolean` | `true` | — | `←`=首位、`→`=末位（`RATING_KEY_MAP`）、`↓`=`RATING_VALUES[1]`、`↑`=`RATING_VALUES[2]`，数字键 `1..4` 按数组序 |
| `groupLabel` | `string` | `PLAIN_TERMS.retention`（`记住程度`） | — | `<div role="group" aria-label>`（§3.5.7） |
| `ariaItemLabel` | `(rating: RatingValue, interval: string) => string` | `ARIA.rating` | — | `良好，下次 4 天后`；无 interval 时回退 `ratingLabel` |
| `hint` / `hintKeyboard` | `string` | **宿主注入** / **宿主注入** | — | 触屏 `点卡片翻面 · 左滑忘记 右滑轻松` / 桌面 `空格 翻面 · ← 忘记 · → 轻松`（`md+` 且 `pointer: fine`） |
| `sticky` | `boolean` | `false` | — | 吸底 `z-dock`；窄屏下沿 = tab 之上（`pb-safe-bottom`） |
| `className` / `testid` | `string` | `undefined` | — | |

## 8. `WordbookList`（`WordbookList.tsx`）— 判据③

§3.6.2 行（3 行内容，高 ≥60px）+ **左滑删除（pointer events 自实现，零新依赖）** + 行内喇叭 + **显式删除按钮**。
`<ul>/<li>`；行内 `<a>`（整行文字区）与 `<button>`（喇叭/星/删除）平铺，不嵌套（§3.6.7）。
左滑几何：露出阈值 24px、提交阈值 64px、删除块 76px（§3.6.4）；`touch-action: pan-y`；纵向 >12px 判为滚动。
删除后由组件调用 `host.toast(WORDBOOK_COPY.swipeDelete.undoToast(word), { tone:'info', action:{ label: undoLabel, onClick: restore } })` —— 5 秒窗口与撤销按钮归宿主 Toast（§3.11.1）。

`WordbookRow = { word: string; phonetic?: string; gloss?: string; meta?: string; badge?: { label: string; tone?: 'success' | 'brand' | 'neutral' }; addedAt?: number; lastReview?: number; reviewCount?: number }`
（`badge.label` 用 `已掌握` 一词 = 宿主从 `@tm/shared` 取；排序/筛选枚举**不在本组件**，见 §3.6.3 的 `FilterChips`/`SortMenu` 归属 T-15/T-18。）

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `items` | `WordbookRow[]` | — | ✅ | 已排序/已过滤（宿主负责，§3.6.3 本地过滤不发请求） |
| `hrefFor` | `(word: string) => string` | — | ✅ | 行 `<a>` 目标（`from=wordbook`） |
| `onOpen` | `(row: WordbookRow) => void` | `undefined` | — | 缺省 `host.navigate(hrefFor(word))` |
| `onDelete` | `(row: WordbookRow, index: number) => void \| Promise<void>` | `undefined` | — | **显式删除回调**（不传 = 不渲染左滑与删除按钮） |
| `onToggleFavorite` | `(row: WordbookRow) => void` | `undefined` | — | 星标 |
| `onSpeak` | `(word: string) => void` | `undefined` | — | 行内喇叭，`stopPropagation` 不跳转 |
| `swipeDelete` | `boolean` | `true` | — | 需 `onDelete` 同时存在 |
| `rowHrefOpensNewView` | `boolean` | `false` | — | 侧栏形态下不卸载列表 |
| `variant` | `'page' \| 'sidebar'` | `'page'` | — | `sidebar` 去行3 元信息、行高 ≥52px（§3.6.6） |
| `rowAriaLabel` | `(word: string) => string` | **宿主注入**（`查看 {word} 的详情`） | — | §3.6.7 |
| `speakLabel` | `(w: string) => string` | `ARIA.speak` | — | |
| `favoriteLabel` / `favoritedLabel` | `string` | `VERBS.favorite` / `VERBS.favorited` | — | |
| `deleteLabel` | `string` | `WORDBOOK_COPY.swipeDelete.confirm` | — | 显式按钮 + 左滑块同一串 |
| `deleteAriaLabel` | `(word: string) => string` | **宿主注入**（`从单词本删除 {word}`） | — | |
| `undoLabel` | `string` | `STUDY_COPY.undo.button` | — | 撤销 toast 动作名（shared 缺通用 `VERBS.undo` → 见报告） |
| `onUndoDelete` | `(row: WordbookRow, index: number) => void` | `undefined` | — | 不传 = 只乐观删除（宿主自己发 toast） |
| `glossFallback` | `string` | **宿主注入**（`（暂无释义）`） | — | 不得空行（§3.6.2） |
| `metaPending` | `boolean` | `false` | — | 释义批量补齐中：行2 灰条 + 工具条下方一次性小字（宿主渲染） |
| `loading` | `boolean` | `false` | — | 8 行骨架（§3.6.5），禁整页转圈 |
| `empty` | `React.ReactNode` | `undefined` | — | 宿主放 `EmptyState` |
| `className` / `testid` | `string` | `undefined` | — | |

## 9. `StatCard`（`StatCard.tsx`）

§3.7.2 原样：`{ label, value, unit?, delta?, tone?, onClick?, loading?, testid }`（另加 className / `valueText`）。
数字 `text-2xl font-bold leading-none tnum` + 标签 `text-xs text-ink-muted mt-1`，**左对齐**；有 `onClick` 时整卡 = 一个 `<button>` + 右侧 `›`。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `label` | `string` | — | ✅ | `PROGRESS_COPY.cards.*` 或 `SETTINGS` 侧文案，宿主注入 |
| `value` | `number \| string` | — | ✅ | 数字经 `formatCount`（`@tm/shared/copy`，`99+` 唯一一份）；0 必须显示 `0`（§3.7.4） |
| `unit` | `string` | `undefined` | — | `词`/`天`（`DAILY_GOAL_LABELS.unit` 同源） |
| `delta` | `string` | `undefined` | — | 副行（`text-2xs text-ink-muted`） |
| `tone` | `'default' \| 'brand' \| 'warning'` | `'default'` | — | `warning` = 配额语义 `text-warning` |
| `onClick` | `() => void` | `undefined` | — | §3.7.1 三卡可点进明细 |
| `loading` | `boolean` | `false` | — | 整卡换骨架 + `aria-disabled` + `pointer-events-none` |
| `ariaLive` | `'polite' \| 'off'` | `'off'` | — | 仅手动刷新后置 `polite`（§3.7.6） |
| `valueText` | `string` | `undefined` | — | 覆盖 `aria-label`（读屏整句） |
| `testid` / `className` | `string` | `undefined` | — | 宿主给 `grid` 单元格尺寸 |

## 10. `GrowthLine`（`GrowthLine.tsx`）— 判据（A-16 抽取）

展示层从 `apps/web/src/components/charts/growth-line-chart.tsx` 抽出并**改为纯 SVG + token**
（`var(--chart-1|2|3|grid|axis)`；**零 `#RRGGBB`/`rgba()`**、**不引 recharts、零新依赖**）。
`role="img"` + `aria-label` + 紧随的 `sr-only` 数据表（§7.5）。

`GrowthLinePoint = { date: string; value: number }`

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `data` | `GrowthLinePoint[]` | — | ✅ | 主 series（近 30 天累计/新增，由宿主决定语义） |
| `secondary` | `GrowthLinePoint[]` | `undefined` | — | 次 series（对比线，`--chart-4` 虚线 `4 3`） |
| `seriesLabels` | `{ primary: string; secondary?: string }` | **宿主注入** | — | 图例必须中文（§3.11.6），禁"系列 1" |
| `accessibleSummary` | `string` | — | ✅ | §3.7.6：`近 30 天掌握词数增长曲线：从 42 词增长到 96 词…`，禁只写"图表" |
| `heightPx` | `number` | `160` | — | App 160 / Web 220（§3.7.1 C 区，唯一允许的尺寸差异） |
| `minPointsForCurve` | `number` | `3` | — | <3 点 → `tooFewLabel` 文本进度（§3.7.4） |
| `loading` | `boolean` | `false` | — | 曲线轮廓骨架 |
| `error` | `boolean` | `false` | — | `PROGRESS_COPY.fail.*` + 主按钮 |
| `onRetry` | `() => void` | `undefined` | — | |
| `retryLabel` / `errorTitle` / `errorBody` / `tooFewLabel` | `string` | `VERBS.retry` / `PROGRESS_COPY.fail.title` / `PROGRESS_COPY.fail.body` / `PROGRESS_COPY.tooFewData` | — | |
| `xTickCount` | `number` | `4` | — | HTML 轴标签（不进 SVG，避免缩放糊字） |
| `areaOpacity` | `number` | `0.22` | — | 深色下宿主传 `0.12`（§3.11.6 末条） |
| `animate` | `boolean` | `true` | — | `false` = reduced-motion 直接终态（宿主用 `useReducedMotion()`） |
| `className` / `testid` | `string` | `undefined` | — | |

## 11. `Heatmap`（`Heatmap.tsx`）— 判据④（A-16 抽取）

三模式 + 点选信息条。展示层从 `apps/web/src/components/charts/heatmap-chart.tsx` 抽出，
**能力迁移自 `mobile-memory/assets/app.js:470-557`（只参考交互，不迁代码）**。
色阶 = `--heat-1..4` + `--heat-empty`（L0 虚线框 = 形状通道）+ `--heat-future`（不进无障碍树）；
三重编码（色阶 + 虚线框 + 数值文本）为 §1.2.1 硬规则。格阵 11px 视觉 / 命中外扩 6px = §7.1 **唯一豁免**。

`HeatmapMode = 'daily' | 'weekly' | 'cumulative'`（`PROGRESS_COPY.heatmapModes` 的键 = 唯一命名源；
§3.7.2 字面写的 `'total'` 与 shared 键 `cumulative` 冲突，按 shared 取值 → 已记契约偏差 D-1）。
`HeatmapDayCell = { key: string; count: number }`（`key` = `YYYY-MM-DD`）

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `days` | `HeatmapDayCell[]` | — | ✅ | 宿主聚合好的按日计数（组件不读时钟、不发请求） |
| `today` | `string` | — | ✅ | `YYYY-MM-DD`，注入式"今天"（SSR 稳定 + 可测） |
| `mode` | `HeatmapMode` | — | ✅ | 受控（`?mode=`/持久化归宿主） |
| `modeLabels` | `Record<HeatmapMode, string>` | `PROGRESS_COPY.heatmapModes` | — | 每日/每周/累计 |
| `onModeChange` | `(mode: HeatmapMode) => void` | `undefined` | — | |
| `monthsAxis` | `boolean` | `true` | — | 月份轴（§3.7.1 D 区） |
| `weeks` | `number` | `53` | — | 52 周 + 当前周 |
| `selectedKey` | `string \| null` | `undefined` | — | 受控点选；`aria-current` / `aria-selected` |
| `onSelect` | `(cell: { key: string; count: number; label: string }) => void` | `undefined` | — | 信息条文案 = `label`（同 `cellAriaLabel`，§1.2.1 ③） |
| `tip` | `string \| null` | `undefined` | — | **滚动区外**的信息条（`role="status" aria-live="polite"`，未点选不渲染文字） |
| `cellAriaLabel` | `(key: string, count: number) => string` | `PROGRESS_COPY.heatCell` / `heatCellEmpty` | — | |
| `legend` | `{ left: string; right: string; ranges?: string }` | **宿主注入** | ✅ | §1.2.1 ②「少 → 多 + 数值区间」；shared 缺常量 → 见报告 |
| `ariaLabel` | `string` | — | ✅ | §3.7.6：`每日背词热力图，最近一年，共打卡 63 天` |
| `levelBreaks` | `readonly [number, number, number]` | `[1, 3, 6]`（`0 / 1 / ≤3 / ≤6 / >6`，与 App 现实现同口径） | — | 色阶分界 |
| `cumulativeBreaks` | `readonly [number, number, number]` | `[0.25, 0.5, 0.75]` | — | 累计模式按占比 |
| `cellPx` / `gapPx` / `hitExpandPx` | `number` | `11` / `3` / `6` | — | 内联 style，不写 Tailwind 任意值 |
| `scrollClassName` | `string` | `'heatmap-scroll'` | — | §3.7.5-5：横向滚动只允许发生在这里 |
| `onBrowseToggle` / `browseLabel` | `(open: boolean) => void` / `string` | `undefined` / **宿主注入** | — | 传了才给「浏览热力图」键盘通道（§3.7.3 末行）：可聚焦 `<table>` 同数据纯文本 |
| `loading` | `boolean` | `false` | — | `true` → 整块换 `SkeletonBlock variant="heatmap-grid"`（rows 按 `weeks/7` 推），§3.11.3 同形同位；与 `unavailableLabel` 降级行互斥 |
| `unavailableLabel` | `string` | `undefined` | — | `PROGRESS_COPY.heatmapUnavailable`；组件只在宿主传值时渲染降级行（失败态归宿主判定） |
| `className` / `testid` | `string` | `undefined` | — | |

## 12. `EmptyState`（`EmptyState.tsx`）

§3.11.7 + §3.6.5 + §3.7.4。**图标 64px 线性**（`--ink-muted`，`aria-hidden`）；禁"暂无数据 + 灰大卡"三件套。
`EmptyStateAction = { label: string; onClick?: () => void; href?: string }`

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `title` | `string` | — | ✅ | 15px/medium（`text-body font-medium`） |
| `hint` | `string` | `undefined` | — | 13px `--ink-muted`，≤2 行 |
| `icon` | `React.ReactNode` | `undefined` | — | 不引图片资源；宿主传内联 `svg` |
| `primary` | `EmptyStateAction` | `undefined` | — | 主按钮 1 颗（`variant=default`，移动 `h-tap`） |
| `secondary` | `EmptyStateAction` | `undefined` | — | 次按钮（`outline`） |
| `link` | `EmptyStateAction` | `undefined` | — | 文字链（无按钮形态，§3.6.5 筛选无结果） |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | — | 上下留白 ≥40px（`py-10`）；`lg` = 64px 图标 |
| `tone` | `'default' \| 'success'` | `'default'` | — | `success` → 图标 `text-success`（§3.5.6 队列空态） |
| `onNavigate` | `(href: string) => void` | `host.navigate` | — | `href` 动作走宿主路由 |
| `className` / `testid` | `string` | `undefined` | — | |

## 13. `ConfirmSheet`（`ConfirmSheet.tsx`）

§3.11.2：`Dialog`（桌面居中）与底部 `Sheet`（移动）= **同一组件的两个 variant**，props 表完全一致。
底座 = `@tm/ui/primitives/dialog`（Radix，焦点圈闭 / Esc / 焦点回弹已内建）。
`confirm` 按钮 `tone='danger'` 时 `bg-danger`；**破坏性动作永不预聚焦**（`DialogPrimitive` 默认不 autofocus）。

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `open` | `boolean` | — | ✅ | 受控（`onOpenChange` 同步） |
| `onOpenChange` | `(open: boolean) => void` | `undefined` | — | |
| `title` | `string` | — | ✅ | `aria-labelledby` |
| `description` | `string` | `undefined` | — | `aria-describedby` |
| `confirmText` | `string` | — | ✅ | |
| `cancelText` | `string` | `VERBS.cancel` | — | |
| `tone` | `'default' \| 'danger'` | `'default'` | — | |
| `onConfirm` | `() => void \| Promise<void>` | — | ✅ | pending 期间 `aria-busy` + spinner，取消同时禁用 |
| `onCancel` | `() => void` | `undefined` | — | |
| `variant` | `'auto' \| 'dialog' \| 'sheet'` | `'auto'` | — | `auto` = `<md` 走底部抽屉（CSS 断点，两端同一份 DOM） |
| `dismissible` | `boolean` | `true` | — | `false` = 遮罩/Esc 不可关（强制改密 R-40 ④、§3.5.5 目标达成二选一） |
| `pending` | `boolean` | `false` | — | |
| `showClose` | `boolean` | `false` | — | 右上角 ✕（需 `closeLabel`） |
| `closeLabel` | `string` | `undefined` | — | primitive 要求宿主注入文案 |
| `trigger` | `React.ReactNode` | `undefined` | — | `<DialogTrigger>` 插槽 |
| `children` | `React.ReactNode` | `undefined` | — | 描述区下方的自定义内容（如 `§3.5.5` 的两按钮二选一之外的说明） |
| `className` / `testid` | `string` | `undefined` | — | |

## 14. `SkeletonBlock`（`SkeletonBlock.tsx`）

§3.11.3：**与真实元素同形同位**。容器 `aria-busy="true"` + `role="status"` + `sr-only` 文案（`label`，
真源 `@tm/shared`）；块自身 `aria-hidden`。单页 ≤10 块。`Skeleton` primitive 承担流光。

`SkeletonBlockVariant = 'line' | 'text' | 'result-bar' | 'card' | 'row' | 'list-rows' | 'stat-card' | 'flashcard' | 'rating-bar' | 'chart' | 'heatmap-grid'`

| prop | 类型 | 默认值 | 必填 | 说明 |
|---|---|---|---|---|
| `variant` | `SkeletonBlockVariant` | `'line'` | — | 每种对应 §3.x 定稿形状（`result-bar` = 160×24 + 88×14 + 100%×12 + 70%×12；`list-rows` = 8 × (120×16 + 100%×12 + 80×10)；`heatmap-grid` = 7×N 的 11px 方块阵列） |
| `rows` | `number` | 各 variant 自带（`list-rows` = 8、`heatmap-grid` = 13 列） | — | |
| `label` | `string` | `undefined` | — | `sr-only` 文案（如 `PROGRESS_COPY.loading`）；不传 = 无播报（§3.11.3 禁"加载中…"文字的场景） |
| `width` / `height` | `string \| number` | variant 默认 | — | `line`/`text` 覆写尺寸（number 按 px，走内联 style，不写 Tailwind 任意值） |
| `className` | `string` | `undefined` | — | 定位/圆角 |
| `testid` | `string` | `undefined` | — | 与真实元素同 testid 便于 §8 走查 |

---

## 冻结与变更

- 本表 14 个组件的 **props 名/类型/必填性/默认值语义** 自批次2 出口起冻结。
- 新增可选 prop 属"兼容性变更"，仍需回 §10.2 登记；删除/改名/改必填性 = 破坏性变更，必须 TPM 裁决。
- 消费方对照（谁在什么场景用）：T-12（`SearchBar`/`LookupResultBar`/`ReviewCta`/`RecentSearchPanel`/`SkeletonBlock`/`EmptyState`）、
  T-13（`ConfirmSheet` 复用）、T-15（`WordDetailCard`/`Flashcard`/`RatingBar`/`WordbookList`/`StatCard`/`GrowthLine`/`Heatmap`/`EmptyState`/`ConfirmSheet`）、
  T-17（`SearchBar`/`LookupResultBar`/`RecentSearchPanel`/`WordDetailCard`）、
  T-18（`Flashcard`/`RatingBar`/`WordbookList`/`StatCard`/`GrowthLine`/`Heatmap`/`EmptyState`/`ConfirmSheet`/`SkeletonBlock`）。
- **禁止覆写**（§10.2 T-18 行）：App 侧只允许 props，不允许 fork 组件，否则破坏 PRD §8.2-2 双端比对。
