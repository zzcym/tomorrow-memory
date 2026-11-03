# T-19g-iii 开发报告 · App「我的」屏 F 区设置列表 + G 区退出登录 + H 区页脚

- 任务号：T-19g-iii（批次 4 / T-19 第 10 轮）
- Agent：`t19giii`
- 上游：T-19g-ii（B 区账号头 + C 区三卡 + D 区打卡常驻，已判绿）
- 交付面：`apps/app/src/screens/MeScreen.tsx` + `apps/app/test/me-screen.spec.tsx`
- 写作纪律：本报告**增量落盘**（§0 先于第一行代码；此后每完成一区追加一节）。
  全程用文件写工具直写，未使用 shell 重定向 / `python -c` 内联（含反引号的 Markdown 不走内联）。
- 禁读三份主文档：本轮 0 次读 `.delivery/01-prd.md` / `02-tech-design.md` / `03-ui-spec.md`，
  规范原文一律取派单单第 1 节逐字贴出的那几行。

---

## §0 派单前置：盘面校对表（简报给定的行号/形状 vs 盘上实际）

规则："不一致以盘面为准"。本轮动第一行代码前把简报点到的每一处都读了盘。

| # | 简报口径 | 盘面实际 | 判定 |
|---|---|---|---|
| 0-1 | Web 对位件变量名 `NEXT_MODE: Record<ThemeMode, ThemeMode>` | `apps/web/src/components/profile/settings-list.tsx:63` 实名 **`NEXT_THEME`**，映射值 `{ light:'dark', dark:'system', system:'light' }` **逐字相同** | **仅标识符名差**，映射表一致 ⇒ 屏内按盘面取名 `NEXT_THEME`（"两端同形"指的是映射，不是变量名） |
| 0-2 | `settings-list.tsx:63` 有循环表 + `trailing='value'` 显示当前档 | ✔ :63 表；:130 `onClick={() => setTheme(NEXT_THEME[theme])}`；:131 `trailing={<span className="text-sm text-ink-muted">{THEME_MODE_LABELS[theme]}</span>}` | 一致，照此形状落 |
| 0-3 | `THEME_MODE_LABELS` 在 `copy.ts:72-74` | 声明块 `copy.ts:71-75`；三串 `浅色`/`深色`/`跟随系统` 分别落在 **:72 / :73 / :74** | 内容逐字一致，行号口径按"值行"算 ✔ |
| 0-4 | `use-theme-toggle.ts` 导出 `ThemeMode`/`THEME_STORAGE_KEY`/`readStoredTheme()`/`applyTheme()`/`systemPrefersDark()` | ✔ 五者全在（:13/:16/:20/:30/:39），且 `packages/ui/src/index.ts:34` 由根出口 `export * from './hooks/use-theme-toggle.js'` | 一致 |
| 0-5 | （简报未提）`ThemeMode` 的唯一引用源 | Web 的 `type ThemeMode` **引的是 `@tm/shared`**（`copy.ts:70` 另有一份同值定义），不是 `@tm/ui`；即**两份同名类型并存** | 本轮按"两端同形"引 shared 那份（与 Web 逐字同 import 行）；重复声明登记为观察项 §5-D4 |
| 0-6 | `SECURITY_ROUTE` 在 `MeScreen.tsx:124` | ✔ :124 `const SECURITY_ROUTE = '/security';`，:120-123 就是"A-44 #86 对 `router.tsx` 零 diff 的先例"注释 | 一致（本轮 `ABOUT_ROUTE` 依同一先例新增） |
| 0-7 | `upgradeTodo` 行的既有形状在 `MeScreen.tsx:310-321` | ✔ 310-321 | 一致 |
| 0-8 | `SETTINGS_COPY.signOut` 四键在 `copy.ts:568-573` | ✔ :568-573（`title`:569 `要退出吗？` / `body`:570 / `confirm`:571 `退出登录` / `cancel`:572 `取消`） | 一致，四串逐字对上了 |
| 0-9 | 页脚两串在 `copy.ts:138-143` | 二者同住在 **`BRAND`**（:137-144）：`footerLine1` = :142 `'© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1'`、`footerLine2` = :143 `'明天再记，也不算晚。'` | 内容逐字一致；**键名是 `BRAND.footerLine1/2`**（简报写的"shared 的同一颗常量组"= `BRAND`） |
| 0-10 | `signOut()` 在 `auth-store.ts:229`，注释逐字"调用方负责 `navigate(signOut())`" | ✔ :229 `export function signOut(): LoginRoute {`；那句注释在 **:227**（JSDoc 内）；文件头第 3 条纪律"清凭据只有一个函数"在 **:17** | 一致 |
| 0-11 | `SecurityScreen.tsx:112` = `setTimeout(() => leaveTo(signOut()), TOAST_LONG_MS)`；`UpgradePasswordScreen.tsx:175` = `leaveTo(signOut())` | ✔ :112 / ✔ :175（在 `handleSignOut` :172-176 内） | 一致 ⇒ 本轮走"立即那支"（:175 形状），`setTimeout+TOAST_LONG_MS` 那支是改密成功后常驻 6 秒用的，与"点退出即走"不是同一状态 |
| 0-12 | `ConfirmSheet` props 别猜，去 grep 现有消费者 | ✔ 已 grep：`apps/app` 侧消费者 = `LookupScreen.tsx:348/363`、`StudyScreen.tsx:755`、`WordDetailScreen.tsx`、`components/goal-ask-sheet.tsx:56`；契约面 `ConfirmSheetProps`（`packages/ui/src/patterns/ConfirmSheet.tsx:25-44`）：`open/onOpenChange/title/description/confirmText/cancelText/tone/onConfirm/onCancel/testid` | 一致，照 props 真名用（`description` 而非 `body`；`cancelText`/`confirmText`） |
| 0-13 | `SettingRow` 在盘面上不存在 | ✔ `packages/ui/src/patterns/` 15 个文件里没有 `SettingRow*`；全仓 `SettingRow` 只出现在两处**注释**里（Web `settings-list.tsx:6` 与 `packages/ui/src/primitives/switch.tsx:4`） | 一致 ⇒ **G-6 仍未闭**，本轮屏内自建局部件绕过（§2） |
| 0-14 | `FooterNote` 不是 ui pattern | ✔ `grep -rln "FooterNote" packages apps/app` → **0 命中**；唯一实现是 `apps/web/src/components/home/footer-note.tsx` | 一致 ⇒ H 区本轮在屏内用两行 `text-xs` 落地（§4） |
| 0-15 | spec 现状 1242 行 / 45 用例 / A~I 九组 | ✔ 1242 行（57191 B）；`grep -c "^  it("` = **45**；A~I 九组俱在 | 一致 |
| 0-16 | 屏现状 380 行 / 22113 B | ✔ `380 22113` | 一致 |
| 0-17 | 简报未提，但**影响 H 区形状**：Web `footer-note.tsx:5-6` 逐字写着"备案号用**线上真实号**……不用 `BRAND.footerLine1` 里的占位串 `冀ICP备2024XXXXXX号-1` —— 合规字段不许回退成模板" | 盘面 ✔（`footer-note.tsx:14` 另有 `const ICP_NUMBER = '赣ICP备2026013161号-1'` + :15 工信部外链） | **两端口径相反**：派单单裁定 App 侧引 `BRAND.footerLine1` 占位串 + F-32 记账；本轮**照派单单落 App**，并把这处 Web/App 分叉复述进 §4 与 §5-D5（屏内 0 自造备案号、0 外链） |
| 0-18 | 简报未提，但**影响 J 组断言面**：`:959` 的串列顺序是"`ICP 备案编号` + 产品态度一行"（= `footerLine1` 先、`footerLine2` 后），而 Web `FooterNote` 实际渲染顺序相反（:19 先态度话、后备案号） | 盘面 ✔ 两处都读到 | 本轮**以 App 的判据来源 `:959` 为准**（1 在前、2 在后），分叉登记 §5-D6 |
| 0-19 | 简报未提，但**影响 F 区行标签取源**：`:957` 三行的行标题 `外观`/`修改密码`/`关于` 在 shared **没有 F 区专属键** | 机检（原文见 §1-D3）：`'外观'` 与 `'关于'` 只在 `SETTINGS_COPY.groups`（:523）里独立成串；`'修改密码'` 只在 `AUTH_COPY.changePassword.title`（:722）；Web 侧那三串住在 **`apps/web/src/lib/api/profile.ts` 的 `PROFILE_COPY`**（`appearanceRow`/`securityRow`/`aboutRow`，未上收 shared） | 结论：App 侧取 `groups[2]` / `AUTH_COPY.changePassword.title` / `groups[4]`（前两处本仓已有先例：`AboutScreen.tsx:45` 就是 `SETTINGS_COPY.groups[4]`）；**A-07 现有禁借清单里的 `AUTH_COPY` 一颗必须翻面**，翻面账写在用例注释里（照 A-06 的既有先例）。缺口登记 §5-D1 |

**盘面与简报的实质差项只有 0-1（变量名）与 0-17/0-18/0-19（简报未写的三处），其余 16 项逐字吻合。**

---

## §1 三行"无源不渲染"的独立机检证据（原始输出，未加工）

我自己重跑了 grep（不采信派单单的结论，只复述它）：

```
$ grep -rn "autoFavorite\|自动收藏" --include=*.ts --include=*.tsx --include=*.json apps packages tools
apps/web/src/components/favorite-button.tsx:10: * - **不自动灌入**：本文件没有任何"查中即写词本"的路径（现网那份自动收藏代码随本次重写删除，
apps/web/src/components/favorite-button.tsx:11: *   开关 `autoFavoriteDefault` 的默认值是 `off`，见 §10.2 T-15 判据⑤）。
apps/web/src/lib/api/profile.ts:60:  autoFavoriteRow: '查词后自动收藏',
apps/web/src/lib/api/profile.ts:61:  autoFavoriteHint: '打开后每次查到新词都会直接进单词本',
packages/server/test/db/migrations.spec.ts:531:      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('autoFavoriteDefault', 'off', 0) ON CONFLICT (key) DO NOTHING",
packages/server/test/db/migrations.spec.ts:542:      "INSERT INTO feature_flags (key, value, updated_at) VALUES ('autoFavoriteDefault', 'off', 0) ON CONFLICT (key) DO NOTHING",
packages/shared/src/constants/flags.ts:15:  | 'autoFavoriteDefault'
packages/shared/src/constants/flags.ts:31:  autoFavoriteDefault: 'off',
packages/shared/test/contracts.spec.ts:820:      autoFavoriteDefault: 'off',
tools/fixtures/selftest/clean/packages/shared/src/constants/flags.ts:5:  autoFavoriteDefault: 'off',
tools/fixtures/selftest/violations/flag-default/packages/shared/src/constants/flags.ts:4:  autoFavoriteDefault: 'off',
```
判读：`autoFavorite` 家族只落在 ①服务端 feature_flags 表的一行默认值、②`packages/shared/src/constants/flags.ts` 那颗 flag（文件头明令代码内不得读，唯一读点在服务端）、③**Web 本地** `PROFILE_COPY` 的两串（且 `apps/web/src/components/profile/settings-list.tsx` 全文四行里根本没引 `autoFavoriteRow` ⇒ 那两串是 Web 侧的死键）。
⇒ **App 侧 0 数据源、`ProfileDto` 契约 0 对应字段**（本轮 grep `apps/app/src` 结果：0 命中）。不渲染。

```
$ grep -rni "reminderTime\|reminder_time\|\balarm\b" --include=*.ts --include=*.tsx apps packages
(exit=1)
```
判读：**全仓 0 命中**（`apps`/`packages` 两侧都空）。而文案串确实在 shared：`SETTINGS_COPY.reminder = { label:'每日提醒', subtitle:'默认 20:30，一天一次', timeLabel:'提醒时间' }`（`copy.ts:555-559`）——
⇒ 典型"文案有、字段无"：R-21 的原生调度未交付，渲染出去就是一颗点了没反应的设置（派单单第 2 节把它与 PRD §5 的 R-04 类缺陷同类）。不渲染。**A-07 式反向钉**：屏源码剥注释后 `reminder` 0 命中（用例 J-04）。

```
$ grep -rni "查询历史\|queryHistory\|searchHistory\|recentSearch" --include=*.ts --include=*.tsx apps packages | head -20
（全部 20 行命中都是 `最近查询` / `RecentSearch*` 家族：apps/app/src/components/result-row.tsx:31/223/228、
  apps/app/src/screens/LookupScreen.tsx:13/15/34/36/42/48/113/201/242/249/293、apps/web/e2e/home.spec.ts:18/34/106、
  apps/web/src/components/home/search-section.tsx:9/14/17）
```
判读：**`查询历史` 与 `queryHistory`/`searchHistory` 0 命中**（列出的都是"最近查询"chips 家族，那是首页输入框下的 `RecentSearchPanel`，不是 `:957` 说的「我的查询历史」页）。
`apps/app/src/router.tsx:43-55` 的 11 条名册里也**没有**该页落点。⇒ 无源且无路，不渲染。

**三行有源的那三行**（本轮全落）：
- 外观：`packages/ui/src/hooks/use-theme-toggle.ts`（五件套齐）+ shared `THEME_MODE_LABELS` ⇒ 见 §2。
- 修改密码：落点 `/security`，屏内既有常量 `SECURITY_ROUTE`（`MeScreen.tsx:124`，T-19d 已交付）。
- 关于：落点 `/me/about`，`router.tsx:52` 已登记（`kind:'secondary'`），屏内**新增**常量 `ABOUT_ROUTE`（照 :120-124 的 A-44 #86 零 diff 先例）⇒ 进 E4 路由字面量总账（§5-D2）。

---

## §2 F 区落地形状（§3.8.1:957 的**有源三行**）

### 2.1 盘上真实行号（本轮结束后复点，不是动手前记的）

| 件 | 盘上位置 | 落地形状 |
|---|---|---|
| 落点常量 | `MeScreen.tsx:193` / **:200** | `const SECURITY_ROUTE = '/security';`（既有）/ **新增** `const ABOUT_ROUTE = '/me/about';` |
| 三行行标签取源 | `:237` / `:238` / `:239` | `APPEARANCE_TITLE = SETTINGS_COPY.groups[2]`、`PASSWORD_TITLE = AUTH_COPY.changePassword.title`、`ABOUT_TITLE = SETTINGS_COPY.groups[4]` |
| 档位循环表 | `:246` | `const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };` |
| 行几何 | `:249-251` | `ROW_CLASS = 'flex min-h-[56px] w-full items-center gap-3 px-1 text-left text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus focus-visible:rounded-md'` |
| 行件 | `:253-294` | 屏内局部 `SettingRow`（props 见 2.4），渲成 `<li><button type="button">…</button></li>` |
| 列表本体 | `:555-571` | `<ul role="list" className="mt-4 divide-y divide-hair rounded-xl border border-hair bg-surface px-3">` + 三行，次序 = 外观 → 修改密码 → 关于 |
| 数据源单点 | `:388` | `const { theme, setTheme } = useThemeToggle();`（屏内**恰一处**） |

`:957` 那串的六行次序（自动收藏 · 每日提醒时间 · 外观 · 我的查询历史 · 修改密码 · 关于）**相对次序未打乱**，只删无源三行 ⇒ 剩下的三行仍是 `外观 < 修改密码 < 关于`。

两端"同形"的原始对照（本轮自己 grep 的，未加工）：

```
apps/web/src/components/profile/settings-list.tsx:21:import { IDENTITY_LABELS, NICKNAME_MAX_LENGTH, SETTINGS_COPY, THEME_MODE_LABELS, VERBS, type ThemeMode } from '@tm/shared';
apps/web/src/components/profile/settings-list.tsx:63:const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
apps/app/src/screens/MeScreen.tsx:163:  type ThemeMode,            ← 同一颗，同样来自 '@tm/shared'
apps/app/src/screens/MeScreen.tsx:246:const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
```

⇒ `:246` 与 Web `:63` **逐字符相同**，且两端引的都是 shared 那颗 `ThemeMode`（不是 `@tm/ui` 那份重名声明，见 §5-D4）。

### 2.2 每一颗 shared 键回指派单单 §1 原文，并标性质

> 本节及 §3/§4 里的 `copy.ts` 一律指真实落点 **`packages/shared/src/constants/copy.ts`**；
> `packages/shared/src/copy.ts` 只是 6 行再导出桶（文件头自注"不含任何文案字面量，以免出现第二份副本"）。

| 上屏的东西 | 表达式 | 声明点 | 性质（逐字 / 同形 / 我的推断） |
|---|---|---|---|
| `外观` | `SETTINGS_COPY.groups[2]` | `packages/shared/src/constants/copy.ts:523`（`groups: ['学习','提醒','外观','账号','关于','帮助']`） | **逐字**（就是 `:957` 那个行标题），但**不是 F 区专属键** ⇒ §5-D1 |
| `修改密码` | `AUTH_COPY.changePassword.title` | `copy.ts:722` | **逐字**，同样非专属键；这颗同时是落点那一屏自己的 H1（`SecurityScreen.tsx:146`）⇒ 行标签与目标页标题同一常量，永不漂移 |
| `关于` | `SETTINGS_COPY.groups[4]` | `copy.ts:523` | **逐字**；本仓先例 `AboutScreen.tsx:45` 就是拿 `groups[4]` 作「关于」页 H1 |
| 外观行右值 `浅色`/`深色`/`跟随系统` | `THEME_MODE_LABELS[theme]` | `copy.ts:71-75`（三串在 :72/:73/:74） | **逐字**，与 Web 同一颗 |
| `mt-4` / `min-h-[56px]` / 行间 `--hair` 1px | 见 `ROW_CLASS` 与 `:560` | — | **逐字** = `:957` 的几何话 |
| `ul > li > button` 与 `title/hint/trailing/onClick` 槽名 | `:253-294` | — | **同形**：槽位名照 `:972`，DOM 形状照本屏既有 `upgradeTodo` 行（`:310-321`）+ Web `settings-list.tsx:128-133` |
| 三档循环表 `{light→dark→system→light}` | `:246` | Web `settings-list.tsx:63` | **同形**（判据只有一条"两端同形"，指映射表；标识符名差见 §0 项 0-1） |
| 无源三行不渲染 | — | 派单裁定 + §1 我自己的 grep | 裁定是硬的；**我的推断只有一处** —— 用哪颗门去挡 F/G/H 三区（`:394-398`，§5-D3） |

屏内 0 中文字面量（A-01，含 F/G/H 三区全部新代码）；用例 J-01 另把三串行标签的**值**正向钉死（`groups[2] === '外观'` 等），下标漂移会立刻判红。

### 2.3 主题交互的可断言面（按裁定：不许断"看起来变了"）

用例 J-02 每点一次钉三件事，全部是"写了哪颗键、传了哪个 mode"这一类事实：

1. **存储键与其值**：`localStorage.getItem(THEME_STORAGE_KEY)` —— 键名只以 `@tm/ui` 那颗常量引用；屏源码里 `'tm:theme'` 字面量 **0 处**（A-05 反向钉），`localStorage` / `setItem` / `getItem` 裸调用 **0 处**（A-02），`applyTheme` 屏内 **0 引用**。
2. **传了哪个 mode**：`vi.spyOn(Storage.prototype, 'setItem')` 收到的写入序列，本轮末尾期望 `['light','dark','system','light']`（从默认 `system` 起、四击回到 `light`）。
3. **`<html>` 的 `.dark` 与 `style.colorScheme`**：只在 `light` / `dark` 两档钉。**`system` 档故意不钉类名** —— 那一档由 `systemPrefersDark()` 读宿主 media query，jsdom 的 `matchMedia` 是我们自己 stub 的，钉它等于把测试的假设当规范事实（用例里写了这句理由）。

> 过程真话：这一支第一版我按"点一下 system → dark"的直觉写，判红后才回读 `NEXT_THEME` —— 表里是 `system: 'light'`。方向以盘面表为准，不是以我的直觉为准。

### 2.4 行组件缺口复述（G-6 仍未闭）

`:972` 点名的 `@tm/ui/patterns/SettingRow.tsx` 盘面上不存在（§0 项 0-13：`patterns/` 15 件里没有它，全仓 `SettingRow` 只出现在两处注释里），`packages/ui` 本轮禁改。⇒ **G-6（SettingRow 未落 ui pattern）仍未闭，本轮以屏内局部件绕过**（`MeScreen.tsx:253-294`）。屏内件保住 `:972` 的槽位命名（`title` / `hint?` / `trailing?: 'chevron' | 'value'` / `trailingValue?` / `onClick`），将来上收时按同一签名搬走即可；`icon` / `badge` / `switch` 三槽本轮无源**不实现**（无源即不画）。右侧装饰箭头用 `aria-hidden` 的 `›`，与本包 `StatCard` 同一颗（`apps/app` 未引 lucide）。

### 2.5 `ABOUT_ROUTE` 入 E4 路由字面量总账（新增行）

| 屏 | 字面量常量 | 值 | `router.tsx` 名册登记 | 是否同值零 diff |
|---|---|---|---|---|
| `MeScreen` | `ABOUT_ROUTE`（**:200，本轮新增**） | `/me/about` | `router.tsx:52`，`kind:'secondary'` | ✔ 零 diff（A-44 #86 先例，同 `SECURITY_ROUTE`） |

`MeScreen.tsx` 的屏侧路由字面量总数 = **5**：`SECURITY_ROUTE`:193 / `ABOUT_ROUTE`:200 / `WORDBOOK_ROUTE`:207 / `PROGRESS_ROUTE`:208 / `STUDY_ROUTE`:211；五颗都能在 `router.tsx:43-57` 名册里找到同值条目，0 漂移、0 只在屏里存在的路径。用例 J-03 另钉两部落点确实 `routeFor(path).kind === 'secondary'`（不是跳进一个屏自己编出来的路径）。

### 2.6 "末行不描边"在 jsdom 里的可断言面

jsdom 没有样式引擎，`getComputedStyle` 量不到 `border-bottom`。⇒ 把判据挪到**结构面**：分隔线只由 `ul` 上的 `divide-y divide-hair`（`:560`）负责，行元素自身的 className 里 `border-b` / `border-t` / `last:border` / `first:border` **0 命中**（J-01 正则钉）。也就是"最后一行没有下游兄弟 ⇒ 天然无边"，而不是靠 `last:border-b-0` 覆写。**真实像素与 hair 线在 Chrome 84 里的观感：待证**（本轮没有真机复验）。

---

## §3 G 区落地形状（§3.8.1:958 + §3.8.2:973）

### 3.1 盘上形状

| 件 | 位置 | 形状 |
|---|---|---|
| 开关态 | `:391` | `const [signOutOpen, setSignOutOpen] = React.useState(false);` |
| 触发钮 | `:576-587` | `<div className="mt-6 mb-2 flex justify-center">` 包一颗 `text-danger text-sm min-h-tap` 文字按钮，标签 = `VERBS.signOut`（`退出登录`）；DOM 上**不在** F 区的 `ul` 里（K-01 用 `closest('[role=list]')` 钉 null，且列表可见文本不含这颗） |
| 确认层 | `:589-600` | 既有 `@tm/ui` `ConfirmSheet`（`:973` 点名件；本轮对 `packages/ui` 零 diff），`tone="danger"`、`testid="me-signout"`（用它的**既有** testid 契约面，屏未新增任何 DOM 钩子） |
| 动作 | `:401-404` / `:411-414` | `leaveTo(target) = { queryClient.clear(); navigate(target); }`；`onSignOutConfirmed = { setSignOutOpen(false); leaveTo(signOut()); }` |

### 3.2 四槽逐字与键溯源

| `ConfirmSheet` prop 真名 | 取值 | 声明点 | 盘面串 | 性质 |
|---|---|---|---|---|
| `title` | `SETTINGS_COPY.signOut.title` | `copy.ts:569` | `要退出吗？` | **逐字** |
| `description` | `SETTINGS_COPY.signOut.body` | `copy.ts:570` | `手机上的词本会保留，下次登录还能接着用。` | **逐字**（`:973` 说的是"正文"槽，`ConfirmSheet` 的 prop 真名是 `description` ⇒ 槽位**同形**，不猜名，照 §0 项 0-12 的 grep 结果用） |
| `confirmText` | `SETTINGS_COPY.signOut.confirm` | `copy.ts:571` | `退出登录` | **逐字** |
| `cancelText` | `SETTINGS_COPY.signOut.cancel` | `copy.ts:572` | `取消` | **逐字** |
| 触发钮标签 | `VERBS.signOut` | `copy.ts:814`（表起 `:804`） | `退出登录` | **逐字**，与 Web G 区同一颗（`settings-list.tsx:170`）⇒ **同形** |

### 3.3 清凭据只有一条路（K 组的正面判据）

- `signOut()`（`apps/app/src/lib/auth-store.ts:229`）是全仓唯一清凭据函数（该文件头第 3 条纪律，`:17`），它返回 `LOGIN_ROUTE` ⇒ 跳转仍归调用方（其 JSDoc `:227` 逐字："调用方负责 `navigate(signOut())`"）。
- 屏内 0 自碰 token 存储、0 直调 `clearStoredSession`；A-02 禁借清单本轮**主动扩三颗**：`clearStoredSession` / `saveSessionToken` / `clearCredential`（把"绕过唯一函数"这条路也钉死）。
- K-05 的断言面：① `getAuthSnapshot()` → `{ hasToken:false, upgradeRequired:false }`；② `SESSION_KEYS` 三把键（token/phone/nickname）在 `localStorage` 里一把不留；③ `queryClient.clear()` 恰被调到 1 次；④ `window.location.hash === '#/login'` 且 `routeFor(LOGIN_ROUTE).kind === 'gate'`；⑤ 全程 0 非 GET 请求（登出**没有**接口可打，K-03 打开层时也钉了"此刻凭据未清、页未跳"）；⑥ 0 toast。
- **动作形状的选择**：`leaveTo(signOut())` 立即那支（`UpgradePasswordScreen.tsx:175`）。`SecurityScreen.tsx:112` 的 `setTimeout(() => leaveTo(signOut()), TOAST_LONG_MS)` 是"改密成功后话要常驻 6 秒"的另一个状态，本屏没有那条话，不借 ⇒ 见 §0 项 0-11。
- **访客与拉取失败态这颗不存在**（K-02：0 触发钮、0 确认层；失败态另钉"凭据仍在"，也就是失败不许伪装成已退出）。
- `guestGuide`（G-4 / A-07 那颗访客话术）**仍未接线**：本轮没有为它编造渲染位，缺口原样保留。
- 新发现的一处规范沉默（§5-D7）：退出成功后**没有任何反馈话**。shared 里没有"已退出"这颗串（`SETTINGS_COPY.signOut` 只有那四键），屏不许自造 ⇒ 本轮 0 toast，留 PM 裁。

---

## §4 H 区落地形状（§3.8.1:959 + §3.1 的 App 侧口径 `:466`）

### 4.1 形状与取源

`MeScreen.tsx:604-611`：

```tsx
<footer className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
  <p>{BRAND.footerLine1}</p>
  <p className="mt-1">{BRAND.footerLine2}</p>
</footer>
```

| 上屏串 | 键 | 声明点 | 性质 |
|---|---|---|---|
| `© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1` | `BRAND.footerLine1` | `packages/shared/src/constants/copy.ts:142` | **逐字**（简报写的"shared 的同一颗常量组"= `BRAND`，键名以盘面为准，§0 项 0-9） |
| `明天再记，也不算晚。` | `BRAND.footerLine2` | `copy.ts:143` | **逐字** |
| 两行的先后 | 备案号在前、态度话在后 | — | 照 `:959` 的书写顺序；**Web 的 `FooterNote` 渲染顺序相反**（先话后号）⇒ §5-D6 |
| `text-xs` 两行、居中、`text-ink-muted`、`mt-2` | — | `:959` + §3.1 口径"页脚收进「我的」底部（App 首页不放页脚）" | **逐字**（几何话）；"本区是 App 侧唯一落点"是**同形**推论 |
| 三个 `mt-*` / 单颗 `<footer>` / B→C→D→E→F→G→H 的 DOM 全序 | — | — | L-01 用 `compareDocumentPosition` 钉，非样式断言 |

§3.1 的 ASCII 图示里那份 `蜀ICP备XXXXXX号` **未抄**（L-02 反向钉 `蜀ICP` 0 命中）；屏源码不含任何自造备案号：正则 `/ICP|备案/` 在屏源码（剥注释后）**0 命中**、`/[0-9]{6,}/` 0 命中、`/beian|miit\.gov\.cn|<a /` 0 命中，渲染出的文本里 `XXXXXX` 占位段原样在（L-02）。也就是"占位号没被偷偷改成看起来像真号的东西"。

### 4.2 两句必须复述的话（简报点名的两条）

1. **F-32 复述（不是我修的，是记着的）**：`BRAND.footerLine1` 里那颗 `冀ICP备2024XXXXXX号-1` 是**占位串**，属 PM + 发布前法务项 **F-32**。本轮**不改写、不删除、不补真号**，只把它原样上屏并钉住不许变形；将来替换点应落在 shared 那一颗，不是屏里。屏 0 外链（工信部链接同样不在本轮范围内，理由：`router.tsx`/`main.tsx` 禁改且规范未给 App 侧该落点）。
2. **"组件未上收为 ui pattern"复述**：全仓 `FooterNote` 在 `packages/ui` 里 **0 命中**（§0 项 0-14），唯一实现住在 `apps/web/src/components/home/footer-note.tsx` ⇒ 页脚仍是 Web 私件，**未上收为 ui pattern**，App 侧本轮以屏内两行 `text-xs` 落地。该缺口与 G-6（`SettingRow`）同性质：两端各画一份，收口点未定。

### 4.3 H 区的一处合规观感风险（我的判断，待裁）

访客与拉取失败态下 H 区**也不渲染**（L-03 钉 0 颗 `<footer>`），因为三区共用了本屏既有那道降级门（`:398`）。合规惯例上 ICP 号通常要求对未登录访客可见 ⇒ 这是本轮**最需要 PM 拍的一处**，见 §5-D3。改法只需要一颗 `||`，但"要不要"不是我能替 PM 定的，本轮不拍。

---

## §5 偏离申报与 PM 缺口（D1–D7）

| # | 事项 | 性质 | 我做了什么 / 要谁裁 |
|---|---|---|---|
| **D1** | `:957` 三行的行标题在 shared **没有 F 区专属键**（`外观`/`关于` 只在 `SETTINGS_COPY.groups`:523 里，`修改密码` 只在 `AUTH_COPY.changePassword.title`:722；Web 侧那三串住在 `apps/web/src/lib/api/profile.ts:57-59` 的 `appearanceRow`/`securityRow`/`aboutRow`，从未上收 shared） | 规范/契约缺口 | 屏内按下标取 `groups[2]` / `groups[4]` + 引 `AUTH_COPY.changePassword.title`（A-01 屏内 0 中文字面量得以守住）。**旁证**：Web 自己也只有这一条路 —— `profile.ts:58` 的 `securityRow` 写的**就是** `AUTH_COPY.changePassword.title`，两端同源同一颗。**差异**：Web 的 `appearanceRow`/`aboutRow` 是它文件里的裸中文字面量（`:57`/`:59`），App 侧 A-01 禁屏内中文字面量 ⇒ 本屏改取 `groups[2]`/`groups[4]`，串值逐字相同、取源路径不同。**代价**：`groups` 语义是"设置分组名册"而非"行标签名册"，将来重排下标会静默改行标题 ⇒ 已用 J-01 的三串**值**正向钉兜住。**请裁**：是否上收 `SETTINGS_COPY.rows = { appearance, security, about }` 并把 Web 那三颗搬上去（本轮禁改 `packages/shared/**` 与 `apps/web/**`，我没动） |
| **D2** | 屏侧新增路由字面量 `ABOUT_ROUTE`（`:200`） | 申报偏离（有先例） | 根因是 A-44 #86 禁本轮改 `router.tsx` 且路由表未导出可复用的字面量；照 `SECURITY_ROUTE` 同一条先例落，已入 E4 总账（§2.5） |
| **D3** | F/G/H 三区共用屏内既有降级门 `showSettings = showGoal`（`:398`）：访客与拉取失败态连「关于」行与 ICP 页脚都看不到 | **我的推断**，规范未逐字写 | 只复用既有那道门（不另立第二份可见性判定，也让四条既有 `toEqual([navTitle])` 访客断言原样绿）。**请裁**：静态行（关于 / 页脚）是否对访客可见；文件头与 :394-397 注释都写明了这处判断是我的 |
| **D4** | `ThemeMode` 在盘上有**两份同名声明**：`packages/ui/src/hooks/use-theme-toggle.ts:13` 与 `packages/shared/src/constants/copy.ts:70`（`:70` 逐字 `export type ThemeMode = 'light' \| 'dark' \| 'system';`） | 观察项（不是本轮造的） | 按"两端同形"引 **shared** 那份（Web `settings-list.tsx` 的 import 行就是引 `@tm/shared` 的 `type ThemeMode`）⇒ App 与 Web 逐字同 import。重复声明未合，收口归 TPM |
| **D5** | 两端备案号口径**相反**：Web `footer-note.tsx:5-6` 逐字拒绝 `BRAND.footerLine1` 的占位串、改用真号 `赣ICP备2026013161号-1`（:14）+ 工信部外链（:15）；App 本轮按派单裁定引**占位**串 | 两端一致性风险 | 照派单落 App（屏 0 自造号、0 外链）。**F-32 关闭时必须两处一起改**，否则分叉固化；且 `XXXXXX` 与真号"是否算占位"的口径本身要法务给一句话 |
| **D6** | `:959` 的书写顺序（备案号在前）与 Web `FooterNote` 实际渲染顺序（态度话在前）不一致 | 规范内部矛盾 | 本轮以 App 的判据来源 `:959` 为准（L-01 钉 1 在前、2 在后）。**请 UI 裁一份**，两端一起改 |
| **D7** | 退出成功后 0 反馈话（`SETTINGS_COPY.signOut` 只有那四键，没有"已退出"） | 规范沉默 | 不编串、不借别处的串凑（K-04/K-05 钉 `toastCalls` 为 0）。**请裁**：要不要第五颗串；写 §3 时才发现，故本节比 §0 预告的 D1–D6 多一条（§0 那张表没写错，是我预告得不全） |

既有未闭项（本轮未触碰，原样在册，供 TPM 汇总）：G-6（`SettingRow` 未落 ui pattern，本轮屏内局部件绕过，§2.4）、页脚未上收（§4.2）、`guestGuide` 未接线（§3.3）、E 区 dirty 离开确认未接（发生在外层壳，A-44 #86 禁触碰，`MeScreen.tsx:62-64` 已注）。

### 5.8 判据翻面账（改钉必须留痕，照 A-06 既有先例）

| 哨兵 | 翻面前 | 翻面后 | 理由 |
|---|---|---|---|
| A-05 屏自写 `<button>` 计数 | 恰 **3** 颗 | 恰 **5** 颗 | F 区行件 1 + G 区触发钮 1，源码各只写一次（行件被三行共用，不是三颗） |
| A-05 新增反向钉 | — | `'tm:theme'` 字面量 0、`applyTheme` 0、`useThemeToggle()` 恰 1、`ABOUT_ROUTE` 恰 2 | 主题写键只准经 `THEME_STORAGE_KEY`；路由常量只允许"声明 + 使用"两处 |
| A-07 禁借清单 `AUTH_COPY` | 全禁 | **移出并窄化**为 `AUTH_COPY.wall/.forceUpgrade/.switchTo/…`；改计数式正向钉 `code.match(/AUTH_COPY/g)` 恰 **2**（import 行 + `changePassword.title`） | D1：`:957` 的「修改密码」在 shared 只有这一份声明点。**过程真话**：第一版写成 `expect(code.replace(...)).not.toContain('AUTH_COPY')`，被自己的 import 行判红，才换成计数式 |
| A-07 禁借清单 `signOut(` | 禁 | **移出** | 派单裁定 G 区动作**必须**是 `signOut()`；同清单其余（`signedOut`/`fetchFail`/`guestGuide`…）**原样保留**，并新增"不许借"三颗：`reminder` / `notificationOff` / `deleteAccount` / `SETTINGS_COPY.avatar` |
| A-02 禁借清单 | — | **扩** `clearStoredSession` / `saveSessionToken` / `clearCredential` | 把"绕过唯一清凭据函数"这条路一起钉死（收紧，不是放松） |
| E-01 / G-04 / H-02 / H-03 交互计数 | 5 → | 9 | 屏多三行 + 一颗退出钮；四条均为"数得对"的机械跟随，无判据含义变化 |
| 访客态四条 `toEqual([navTitle])` | 不动 | 不动 | D3 那道门复用的好处：访客可见面一个字节没变 |

### 5.9 规范原文引用账（简报第 4 条④："规范不是逐字的地方，要贴规范原文"）

主文档本轮**禁读**，故下列片段一律取派单单第 1 节贴出的那几行（本轮唯一判据源），它们在屏文件头 `:81-129` 与用例标题里各有落点：

| 片段 | 我从派单单读到的内容 | 用在哪 / 哪里不逐字 |
|---|---|---|
| `§3.8.1:957` | F 区设置列表的次序串共六行：`自动收藏 · 每日提醒时间 · 外观 · 我的查询历史 · 修改密码 · 关于`；行高 `min-h-[56px]`、行间 1px、**末行不描边**；容器 `mt-4` | J-01 钉三行次序与几何；**不逐字处**：该句没写"没数据源的行要不要占位" ⇒ 我按派单裁定"不渲染"，也没写"未登录时是否可见" ⇒ D3 |
| `§3.8.1:958` | G 区 = **单独一行**危险色文字按钮，`mt-6 mb-2`、居中，不混进 F 列表 | K-01 逐字钉几何与"不在 `ul` 内"；**不逐字处**：没写点击后是否有成功反馈 ⇒ D7 |
| `§3.8.1:959` | H 区 = `ICP 备案编号` + 产品态度一行 | L-01 钉两串与先后；**不逐字处**：没写这行对访客是否可见 ⇒ D3；也没写与 Web `FooterNote` 的顺序冲突 ⇒ D6 |
| `§3.8.2:972` | 行组件契约 `@tm/ui/patterns/SettingRow.tsx`，槽位含 `title` / `hint?` / `trailing`（`chevron`/`value`/…）/ `icon` / `badge` / `switch` / `onClick` | 盘面无该件 ⇒ G-6 未闭，屏内局部件只实现有源的四槽（§2.4）；**这里就是"规范与盘面不符"最大的一处** |
| `§3.8.2:973` | 退出登录**必过** `ConfirmSheet`，四槽逐字 = `SETTINGS_COPY.signOut.{title,body,confirm,cancel}` | `:589-600` + K-03 钉四槽；**不逐字处**：`ConfirmSheet` 的 prop 真名是 `description`/`confirmText`/`cancelText`（我 grep 了它的 `ConfirmSheetProps` 而不是猜，§0 项 0-12） |
| `§3.1 口径 :466` | 页脚收进「我的」底部（App 首页不放页脚） | ⇒ 本屏 H 区是 App 侧唯一落点；**不逐字处**：该句没指定组件归属，`FooterNote` 至今不是 ui pattern（§4.2） |
| R-18② / R-25① | 派单点名本屏要遵守：软告知入口的读法（R-18 系）与"运维信息只以人话同步行出现一次"（R-25①） | R-25① 由 L-03 末段复钉（`sync-badge` 恰 1 颗、页脚不新增第二颗）；本轮未新增任何同步类话 |

> 诚实标注：上表"我读到的内容"是派单单原文的**压缩转述**（派单单里每处还带着更长的原句）。我**没有**为了填这张表去读三份主文档（禁读项）。若 TPM 需要逐字对照，请以派单单第 1 节为唯一源比对本表右列。

---

## §6 出口命令原始输出（三类，逐字粘贴，未加工）

### 6.1 ① `pnpm --filter @tm/app test`

```
 $  @tm/app  test/me-screen.spec.tsx (58 tests) 2590ms
    ✓ B 组 · 每日目标渲染面（§3.8.3：标题 + 滑杆 + 刻度 + 右对齐保存，串逐字同源） > B-01 已登录 + 档案到手：屏根 / 标题 / E 区四件套齐全，文本全部等于 SETTINGS_COPY 那一份（B/C/D 接上后按"包含"钉，全序由 G/H/I 组钉）  336ms
 ...
 Test Files  18 passed (18)
      Tests  456 passed (456)
   Start at  15:47:35
   Duration  17.39s (transform 5.24s, setup 0ms, collect 25.05s, tests 65.16s, environment 13.70s, prepare 2.82s)
EXIT=0
```

（基线是 18 文件 / **443** 通过 ⇒ 本轮 **456**，+13 = J×4 + K×6 + L×3；`me-screen.spec.tsx` 自身 45 → **58** 用例。上面这份是**最后一次**跑的原始尾（15:47:35 那次），它盖住了 §6.4 第 4 条那次 L-03 补支之后的状态；前一次同格式的输出是 15:39:17 / 17.34s。verbose 名册只打 >300ms 的用例行，故本屏那 12 条新用例未逐条列出，只汇在 `(58 tests)` 里。）

### 6.2 ② `pnpm --filter @tm/app typecheck`

第一跑**判红**（原始输出）：

```
$ tsc -p tsconfig.json --noEmit
test/me-screen.spec.tsx(1609,43): error TS2559: Type 'readonly ["profile"]' has no properties in common with type 'QueryFilters<any>'.
E:\CC\tomorrow-memory\apps\app:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/app@0.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
```

原因：`QueryCache.findAll` 在 v5 只有 `findAll(filters?: QueryFilters)` 一个签名（`query-core/build/modern/hydration-*.d.ts:443`），把 `profileKeys.all` 那支元组直塞是类型错的。改成 `findAll({ queryKey: profileKeys.all })` 后复跑：

```
$ tsc -p tsconfig.json --noEmit
EXIT=0
```

（0 错。）

### 6.3 ③ `pnpm --filter @tm/app build`

```
dist/assets/MeScreen-lPC_DwIT.js                 8.14 kB │ gzip:   2.91 kB
...
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
✓ built in 2.65s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
EXIT=0
```

（exit 0 + `[dist-guard]` 那句齐。500 kB 那条是 rollup 对 `index-*.js` 的既有告警，非本轮新增，本屏 chunk 8.14 kB。）

> 顺序如实：build 跑在 §6.4 第 4 条那次**用例侧**改动之前；此后产品源码 `MeScreen.tsx` 一个字节没再动（复点 `wc -l -c` 仍是 `614 36611`），改的只有 `test/**`，而 spec 不进产物 ⇒ 该 build 输出对最终盘面仍成立。第 5 条的 typecheck 则是在那之后**重跑**过的（`EXIT=0`）。

### 6.4 过程账（写坏过什么，全部判红后改的，不是绿的）

1. 五支首跑判红并逐个改正：A-07 的 `not.toContain('AUTH_COPY')` 撞自己 import 行 → 计数式；J-02 档位方向猜错 → 照 `NEXT_THEME` 表改成 `light→dark→system→light`；K-03/K-04 期望 `#/me` 实得 `#/me/about` → 读 `router.tsx:217-226` 才知道 `commitLocation()` 只刷快照**不写地址面**，于是改成"钉 hash 未被改动"（那才是真判据）并在 K-05/K-06 显式拨 hash；K-05 的"清完之后缓存条目 = 0"实得 3 → 还挂着的 react-query 观察者会立刻把键注册回去，改为钉 `queryClient.clear()` 恰调 1 次。
2. §6.2 那支 TS2559：test 全绿但 **typecheck 判红**（`QueryCache.findAll` 只吃 `QueryFilters`，我把 `profileKeys.all` 那支元组直塞了）。已修，并在改正后**重跑**了 typecheck（`EXIT=0`）与全套 test（6.1 那份原始尾）。
3. 自我纠正的语法/逻辑垃圾（跑前就抓出来）：`expect(...).toContain(...) === false` 这种半截表达式、塌掉的三元式、`'avatar.'` → `'SETTINGS_COPY.avatar'`、`ABOUT_ROUTE` 期望计数 3→2、`setSyncedAt` 未包 `act`。
4. **一条标题过宽的用例**（绿灯下的假覆盖，写 §4.3 时回读盘面才抓到）：L-03 标题写着"访客**与拉取失败**态 0 颗页脚"，body 里却只测了访客那半支。已补失败半支（`seedNormalSession()` + `getOutcome = serverErrorOf('TOO_MANY_REQUESTS', 429)` + 跑完 R-24⑥ 那次静默重试 ⇒ 仍 `all('footer')` 为 0，再恢复 `success(SERVER_GOAL)` 走已登录那支），补完复跑 `456 passed`。用例内注释写了这条来龙去脉。
5. **报告自身的一处口径校正**：§0 项 0-19 把 Web 那三串写作"`PROFILE_COPY` 的 `appearanceRow`/`securityRow`/`aboutRow`"，盘面精确事实是它们住在 **`HOST_PROFILE_COPY`（`apps/web/src/lib/api/profile.ts:57-59`）**，`:398` 才 `export const PROFILE_COPY = HOST_PROFILE_COPY;`。结论不变（未上收 shared），行号与块名以本条为准；另在 §5-D1 补了一条对 App 更有利的盘面事实：Web 的 `securityRow` 本身就等于 `AUTH_COPY.changePassword.title`。

### 6.5 纪律复验（本轮结束时的盘面事实）

| 纪律 | 复验证据 |
|---|---|
| 文件行数前后（简报第 4 条①） | `MeScreen.tsx` **380 行 / 22113 B → 614 行 / 36611 B**（+234 行）；`me-screen.spec.tsx` **1242 行 / 57191 B → 1745 行 / 89416 B**（+503 行）；本屏用例 **45 → 58**；`wc -l -c` 是本节定稿时的复点值 |
| 真库只读 | `ls -l data.db` → `253952 Sep 18 04:05`、`sha256sum` 前 12 位 → `6595517661cc`（与简报给定值逐字相同，mtime 未变 ⇒ 全程 0 写、0 DDL/DML）。测试数据只在 vitest/jsdom 的 `localStorage` 与 `vi.stubGlobal('fetch')` 里，未落任何真库 |
| 出口命令 ≤3 类 | 只有 `test` / `typecheck` / `build` 三类，未扩第四类。逐次账：`test` 6 次（压缩前 2 次 = 首跑 5 条判红 / 复跑全绿；本段 4 次 = 全量确认 2 次 + 抓名册 2 次）、`typecheck` 4 次（压缩前 1 次绿、本段首跑撞 TS2559 判红、修后 2 次 `EXIT=0`）、`build` 1 次（`EXIT=0` + `[dist-guard]`）。**一律 `pnpm --filter @tm/app <cmd>` 全量跑**，未用 `npx vitest run`（那会产出 104 条假 localStorage 红）、未用位置参数过滤单文件 |
| 报告增量落盘 | §0 先于第一行代码（`84` 行时只有 §0+§1）；§2–§6 在代码与用例完成后追加 |
| 禁读三份主文档 | 本轮 0 次读 `.delivery/01-prd.md` / `02-tech-design.md` / `03-ui-spec.md`；`§3.8.1:957` 等原文一律取派单单第 1 节贴出的那几行 |
| 禁改面 | `router.tsx` / `main.tsx` / `packages/shared/**` / `packages/ui/**` / `apps/app/src/{components,data,lib}/**` / `apps/web/**` / `tools/ownership.json` **零 diff**（本轮只写 `MeScreen.tsx` + `me-screen.spec.tsx` + 本报告） |
| 测试钩子不扩面 | 屏内 `data-testid` 仍恰 **1** 处（屏根 `me-screen`，既有）；F 区靠 `role=list` + `li` + 行标题文本定位，确认层用 `ConfirmSheet` **既有** `testid` 槽；0 为测试改的 className |
| Chrome 84 红线 / §6.6 禁词 | 新代码 0 `structuredClone`/`Object.hasOwn`/`.at()`/`requestIdleCallback`、0 `||=`/`??=`/`&&=`、0 `dvh/svh/lvh`、0 嵌套 `min()/clamp()`；A 组源码哨 + L-03 全树禁词哨均绿 |
| 无凑绿 | 0 `test.skip` / 0 `it.fail` / 0 `.only` / 0 `waitForTimeout`（A 组自禁项在钉这几条） |

**探针预算的诚实账（不给自己开脱）**：简报给的是"探针 ≤28 次"。压缩前那一批读检没有逐条编号留痕（只有 §0 的 19 项盘面校对与 §1 的四组 grep 是**结果**留痕）；压缩后这一段我可以如实报：读检类调用约 **20** 次（`wc`/`sha256sum`/`grep -n`/`find`/`Read`/`sed` 各次，其中 4 次是为了查 `QueryCache.findAll` 的签名而翻 `node_modules` 的 `.d.ts`，另 2 次因为路径猜错而空转）。两段相加**很可能已经越过 28 次这条线，我无法自证在预算内 —— 待 TPM 按回合日志判**。能证的两点是：① 没有一次探针用在"给 shared 补键"上（那是简报明令禁止、必须停下登记为缺口的路，D1/D5/D6 都是照这条停下来的）；② 出口命令严格三类，未扩。
