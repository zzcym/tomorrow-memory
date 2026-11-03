# 04-dev-report-E4b2 · App 面收口（批次4 出口轮 E4 第二颗）

- 伪任务号：**E4b2**（App 面收口；服务端面并行轮 = E4b，两互不越界）
- 开工时刻（实测 `date`）：**2026-09-21 21:23:16** ｜ 收尾时刻：**2026-09-21 21:57:35**
- 可写面：`apps/app/**`（`src/router.tsx`、`src/main.tsx` 本轮 **0 diff**）+ `tools/ownership.json` + 本报告 + scratch
- scratch / 日志目录（绝对路径，留待复核）：`C:\Users\曹怡明\AppData\Local\Temp\e4b2-app\`
- 用例数：**463 → 466**（18 files 不变）｜ typecheck 0 错 ｜ `--self-test` **157/157** ｜ `--check-ownership --task E4b2` **exit 0**

---

## §0 盘面核对

简报三件的锚点逐条复跑，**六处全部与盘面相符**，无「简报写错」的更正项；但有三处**简报口径与盘面/硬约束不可兼得**，按盘面无视简报做，逐条点名如下。

| 简报锚点 | 我亲跑的命令 | 盘面结果 |
| --- | --- | --- |
| 件1 `src/shell/ScreenFallback.tsx` `:17/:22/:42` | `grep -rn "ScreenFallback" apps packages --include='*.ts' --include='*.tsx'` | 逐字相符；`src/**` 内除自身三行外 **0 引用** |
| 件1 `router.spec.tsx:44/:76/:87`（+`:7` 自述注释） | 同一颗 grep | 逐字相符 |
| 件1 前置：路由表 11 条 `load` | `grep -n "lazy\|import(" apps/app/src/router.tsx` | `:44-54` 十一条全部 `./screens/*.js` ⇒ `:87` 那颗分叉永不可能为真 = 死码 |
| 件2 三份字面量 | `grep -rn "LOGIN_PATH\|LOGIN_ROUTE" apps packages tools` | 逐字相符：`auth-store.ts:48`（单点）/ `ai-mnemonic-bar.tsx:33` / `result-row.tsx:379` |
| 件3 `MeScreen.tsx:393` 用在 `:551`/`:583` | `sed -n '388,396p'` + `'548,600p'` | 逐字相符：一颗 `showCheckinRow` 同时管 C 区三格 + D 区整行 |
| 基线 463 / 18 files、typecheck 0 错、self-test 157 | 开工前先各跑一遍（`baseline-test.txt` / `baseline-typecheck.txt`） | `Test Files 18 passed (18)` / `Tests 463 passed (463)` / `tsc --noEmit` exit 0 |

**三处口径差异（点名，按盘面做）**：

1. **件3 的新增用例要求「`checkin/status` 失败/未回时 `词本 N 词` 与连续卡仍在位」与盘面数据源冲突**。
   连续格唯一的数字源是 `useDueBadge().streak`，而它 = `components/due-badge-data.tsx:122` 的
   `streak: status.data?.streak ?? 0` —— `status` 就是 `checkin/status` 那一颗。
   ⇒ 打卡源挂掉时"连续卡仍在位"只能靠画「连续 0 天」这个**假 0**兑现，直接撞同一份简报件3 的硬约束①
   （「宁可不画也不画错」的降级支里不许出错误卡，M-06 已钉成下限）。
   **按盘面做**：`词本 N 词` 与 `累计复习` 两格（档案源）常驻在位；连续格与 D 区整行（打卡源）缺源不画，
   并把这条下限反向钉死（新用例里 `连续 0 天` 与带真数的 streak 全串都 0 命中）。
2. **件2 的"两份 `export const LOGIN_PATH`"实测有四颗消费方，简报未点名**：
   除两颗定义处，`CompletionScreen.tsx:40`、`StudyScreen.tsx:77`、`WordDetailScreen.tsx:53` 三处 import 这个名字。
   ⇒ 见件2 的取舍交底（0 测试引这颗导出名 ⇒ 不留兼容别名，一次收口）。
3. **F 编号**：简报说「盘面已用到 F-42，新号从 F-43 起」。`grep -rn "F-43" .delivery` 命中 6 处，
   但 6 处全是 A-80 #287 / A-81 #293 那句「F 编号自 F-43 起用」的指令本身，**没有观察项真的占住 F-43**；
   考虑并行的 E4b 同刻可能在抢 F-43，本轮新观察项取 **F-44**（见件2 末），不撞号。

**另一处简报未点到的盘面事实（登记 F-44，本轮不改）**：
`apps/app/src/data/rest-fetcher.ts:133` 还有第四份 `'/login'` 字面量（`handleAuthError` 的 `goto('/login')`），
不在简报「三份」清单里。它落在 `apps/app/src/data/**`（owner=T-14 且带 `zeroDiffFor: T-17/18/19`），
按「一次性收口、不在绿灯下顺手动别的」纪律**不改**，只列给 TPM。

---

## 件1 · ScreenFallback 死码收口 ✅

### 复核（改前先自己跑）
`grep -rn "ScreenFallback" apps packages --include='*.ts' --include='*.tsx'` 的完整命中集 = 定义文件自身 3 行 +
`router.spec.tsx:7/:44/:76/:87`。**`src/**` 内 0 引用**（`shell/` 旧路径与 lazy 字符串两种写法都扫过：
`grep -rn "shell/Screen"` 只命中 `router.spec.tsx` 的两处注释；`grep -n "import(" apps/app/src/router.tsx`
的 11 条全部指向 `./screens/*.js`）。`data-testid="screen-fallback"` 的引用面也只有那颗死组件与 spec。

### 改动（`文件:行号` + 判据）
| 处 | 改法 |
| --- | --- |
| `apps/app/src/shell/ScreenFallback.tsx` | **整件删除**（0 增 / 42 删） |
| `apps/app/test/router.spec.tsx:44` | 撤 `import { ScreenFallback } from '../src/shell/ScreenFallback.js';` |
| `:5-7`、`:78-84` | 撤两处自述注释（「占位指向 `shell/ScreenFallback`，批次4 只改这一行」「仍指向…→ 内容区渲染骨架屏」）；顺手把 `:6` 那句陈旧的「路由表 **10** 条」改回 11（`:99` 的 `expect(ROUTES).toHaveLength(11)` 早就是 11） |
| `:71-72` | `SHELL_TESTIDS` 摘掉 `'screen-fallback'`（生产者已删，留着就是死名单） |
| `:74-86` | 新增 `REAL_SCREEN_DEFAULTS`：`import.meta.glob('../src/screens/*.tsx', { eager: true })` 取 11 张真屏 `default` 的**全集**（`apps/app/tsconfig.json:8` 已含 `"vite/client"`，两颗先例 = `packages/shared/test/contracts.spec.ts:185`） |
| `:88-110` | `expectRenderedScreen` 的永假分叉改成 FU24① 的**硬判据**：内容区既不许出 `route-fallback` 也不许出 `screen-fallback`，且 `load()` 的 `default` 必须 `REAL_SCREEN_DEFAULTS.has(...) === true`，命中后仍要求该页自己的带标识区块非空（原断言面**只加不减**） |
| `:148-165`（新增一颗 `it`） | 「**FU24①：11/11 条路由的 load 全部指向 `src/screens/*` 真屏，且两两不同**」：先钉全集本身 `size === 11` 且与 `ROUTES` 同数，再逐条 `load()` 命中全集，最后 `seen.size === 11` 钉一条路由一张屏（堵住"两条路由共用同一颗占位"的假接线） |

**用例增减**：`router.spec.tsx` 10 → **11**（+1 颗，0 减；其余九颗的断言面一字未动）。
**未顺手动别的**：`router.tsx` / `main.tsx` 对批次4 先例保持 **0 diff**（`find -newermt` 清单里没有它们，见「两证」）。

### 原始尾行
```
 ✓  @tm/app  test/router.spec.tsx (11 tests) 392ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
```
（日志：`e4b2-app\件1-router.txt`；删文件后 `ls apps/app/src/shell` = `BackKeyBridge.tsx GateLayout.tsx TabBarShell.tsx`）

---

## 件2 · `/login` 路由字面量上收单点 ✅

### 消费面取证（改前跑）
`grep -rn "LOGIN_PATH" apps packages tools --include='*.ts' --include='*.tsx'` 全仓命中 =
两颗 `export const` 定义 + 三处屏内 import + 定义文件内各一处使用。
**没有任何测试 import 或断言 `LOGIN_PATH` 这颗导出名**（测试侧只引 `LOGIN_ROUTE`：
`auth-store.spec.ts:19/285/286`、`me-screen.spec.tsx:98/1770-1772`、`security-screen.spec.tsx:55`、
`upgrade-screen.spec.tsx:50`）⇒ 改判不构成"放松既有断言"，因为**根本没有钉住这颗导出的断言**。

### 取舍交底（为什么不留 `export const LOGIN_PATH = LOGIN_ROUTE;` 兼容别名）
简报给了这条路，但它的前提是"确需保留兼容导出"。实测这个前提不成立：
消费方只有三张屏（同一包内、同一轮可改），0 测试钉名字，0 跨包消费者。
保留别名 = 同一个路由在盘上继续挂**两颗名字**，而"屏里再抄一份字面量"正是从别名漂移里长出来的
（今天这三份就是这么来的）⇒ 按"一次性收口"把名字也收掉。

### 改动
| 处 | 改前 | 改后 |
| --- | --- | --- |
| `apps/app/src/lib/auth-store.ts:48` | `export const LOGIN_ROUTE = '/login';` | **不动**（全仓唯一字面量单点） |
| `apps/app/src/components/ai-mnemonic-bar.tsx:33` | `export const LOGIN_PATH = '/login';` | 删除，改 `import { LOGIN_ROUTE } from '../lib/auth-store.js';` |
| `ai-mnemonic-bar.tsx:124` | `window.location.hash = \`#${LOGIN_PATH}\`` | 改引 `LOGIN_ROUTE` |
| `apps/app/src/components/result-row.tsx:379` | `export const LOGIN_PATH = '/login';` | 同上删除 + 引单点 |
| `result-row.tsx:385` | `` `${LOGIN_PATH}?intent=favorite&word=…` `` | `` `${LOGIN_ROUTE}?intent=favorite&word=…` ``（`loginHrefForFavorite` 形状不变） |
| `screens/CompletionScreen.tsx:40/:187` | 从 `result-row.js` 引 `LOGIN_PATH` | 从 `lib/auth-store.js` 引 `LOGIN_ROUTE`（1 行 import 换 1 行 + 1 处使用） |
| `screens/StudyScreen.tsx:77/:618/:622` | import 块里的 `LOGIN_PATH,` | 撤该行 + 新增 `LOGIN_ROUTE` import，两处 `navigate()` 改引 |
| `screens/WordDetailScreen.tsx:53/:189/:229` | `{ LOGIN_PATH, useMnemonicBar }` | 拆开只留 `useMnemonicBar`，新增 `LOGIN_ROUTE` import，两处 `navigate()` 改引 |

### 结果（原始 grep，改后）
```
$ grep -rn "LOGIN_PATH" apps packages tools --include='*.ts' --include='*.tsx' | grep -v node_modules
（空；exit=1）
$ grep -rn "'/login'" apps/app/src packages --include='*.ts' --include='*.tsx' | grep -v node_modules
apps/app/src/data/rest-fetcher.ts:133:      goto('/login');           ← F-44，本轮不改
apps/app/src/lib/auth-store.ts:48:export const LOGIN_ROUTE = '/login'; ← 单点
apps/app/src/router.tsx:53:  { path: '/login', kind: 'gate', …        ← 禁动面（路由表本体）
apps/app/src/screens/MeScreen.tsx:144: *（注释文本，非字面量取值）
```
**用例增减：0 颗**（件2 是纯实现面收口；既有钉面全绿即证据，见下面尾行）。

### 屏内自造 `*_ROUTE` 现状取证（**本轮不改，未并入上收面**）
```
apps/app/src/screens/LoginScreen.tsx:63            const HOME_ROUTE = '/'
apps/app/src/screens/MeScreen.tsx:215/222/229/230/233  SECURITY_ROUTE / ABOUT_ROUTE / WORDBOOK_ROUTE / PROGRESS_ROUTE / STUDY_ROUTE
apps/app/src/screens/SecurityScreen.tsx:52         const PARENT_ROUTE = '/me'
apps/app/src/screens/UpgradePasswordScreen.tsx:71  const HOME_ROUTE = '/'
```
结论 = **F-44 级观察项**（与 `rest-fetcher.ts:133` 并一颗）：简报点名的 MeScreen 四颗盘上实为**五颗**
（多了 `:222 ABOUT_ROUTE`，`:203/690` 使用，且 `me-screen.spec.tsx:648` 把它钉成
`code.match(/ABOUT_ROUTE/g)` **恰 2 次**的源码哨）。本轮不动它们的理由：件2 的判据是「`/login` 这一颗
路由的字面量单点」，屏内自造常量是**另一种缺陷**（路由表 `router.tsx` 的 `path` 与屏侧常量两份真值），
要真修得给 `router.tsx` 导出可 import 的路径表 —— 那是禁动面 + `zeroDiffFor T-17/18/19`，不归本轮。
`/login` 面今天已经干净：屏侧不再有任何一颗 `/login` 字面量或别名。

### 原始尾行（件2 受影响四颗 spec + 全量）
```
 ✓  @tm/app  test/study-screen.spec.tsx …
 Test Files  4 passed (4)
      Tests  104 passed (104)        ← study / completion / detail / lookup 四份，改后单跑
```
（日志：`e4b2-app\件2-screens.txt`）

---

## 件3 · F-29「我的」页三格降级解耦（真修）✅

### 缺陷与判据
改前 `apps/app/src/screens/MeScreen.tsx:393`：
`const showCheckinRow = showGoal && checkin.data !== undefined;` 一颗门同时管 `:551`（C 区三格）与
`:583`（D 区整行）⇒ `checkin/status` 挂掉时 `词本 N 词` 一起消失，而那颗数来自
`profileView = profileProgressOf(profile.data)`（`:339`），与打卡无关。R-19② 要的是三格常驻。

### 改动（`文件:行号` = 改后现值）
| 处 | 改法 |
| --- | --- |
| `MeScreen.tsx:392-393`（原门） | **撤销**：不再存在跨区共门 |
| `MeScreen.tsx:413` | 新增 `const showCheckinData = !fetchFailed && checkin.data !== undefined;` —— 只 gate 打卡源的两块内容 |
| `MeScreen.tsx:415` | 新增 `const showStatGrid = showGoal || showCheckinData;` —— C 区**容器**门（三种数字全缺才整段不画） |
| `MeScreen.tsx:399-400` | `:1001` 整页降级门的注释同步：C/D 改由 `showCheckinData` 里同一条 `!fetchFailed` 收进降级面 |
| `MeScreen.tsx:565-601` | C 区三格**各自包条件支**：`stat-words`/`stat-review-days` 走 `showGoal`，`stat-streak` 走 `showCheckinData` |
| `MeScreen.tsx:603-604` | D 区整行 `{showCheckinRow …}` → `{showCheckinData …}`（含 `SyncBadge`） |
| `MeScreen.tsx:18-30 / 37-41` | 文件头 0b/0c 两段自述同步（旧文写「没到手/拉失败 ⇒ C/D 整段不渲染」，今天按格） |

**硬约束逐条对齐**：
① 降级支不出错误卡/假 0 —— `!fetchFailed` 守住 `:1001` 整页只一颗卡；缺源那格**整格不画**，
`badge.streak ?? 0` 的假 0 没有上屏路径。
② 页脚门**未碰**：`MeScreen.tsx:747` 的 `{showSettingsSections ? (` 与 `:741-752` 的注释块
（F-36 系那一问）本轮一字未改，见下面「未做」。
③ 无新增内联样式数值：三格仍是 `@tm/ui` 的 `StatCard` + 既有 `className="h-[84px]"`、容器仍是
`grid grid-cols-3 gap-3`、`mt-1/mt-3`、D 行仍 `h-14 bg-brand-soft p-3`（`G-01` 的几何钉未翻即证）；
Chrome84 红线面无新增现代 CSS 用法（`typecheck` + `--dist` 侧本轮未跑产物，改动不含样式源）。
④ 服务端契约与 shared 文案面 **0 diff**（`packages/**` 只被并行的 E4b 写过，见「两证」的反查清单）。

### spec 侧逐颗交底（`apps/app/test/me-screen.spec.tsx`）

**改判一颗（颗号 / 改前断言原文 / 改后 / 理由）**

- **G-04**（标题改判：`打卡数没到手/拉失败：C 与 D 整段不渲染（不半截、不假 0），B/E 照常，0 toast`
  → `打卡拉失败：只有打卡源的连续格与 D 行不画（不半截、不假 0），档案源两格与 B/E 照常，0 toast`）

  | 改前断言原文 | 改后 | 理由 |
  | --- | --- | --- |
  | `expect(statCardsAll()).toHaveLength(0);` | `expect(statCardsAll()).toHaveLength(2);` + `stat-words`/`stat-review-days` 两颗的 `aria-label` 逐字等于 `SETTINGS_COPY.statCards.{words,reviewDays}.value(n)`（与 G-01 同值）+ `expect(statCard('stat-streak')).toBeNull();` | 旧值把屏侧共门**缺陷**钉成期望值；F-29 真修后档案源两格必须常驻，且留下的数字不许因旁边少一格而漂 |
  | `expect(texts).not.toContain(SETTINGS_COPY.statCards.streak.value(0));` | `expect(texts.some((t) => t.includes(SETTINGS_COPY.statCards.streak.value(0)))).toBe(false);` **并加** `…streak.value(STREAK_DAYS)…).toBe(false);` | 下限不放松、只收紧：旧钉只挡"整串恰好等于假 0"，新钉连"任何可见串里含假 0 / 含带真数 12 的连续全串"一起挡 |
  | `expect(texts).not.toContain(CHECKIN_COPY.notDone.headline);` | **原样保留**，另加 `expect(buttonByLabel(VERBS.goStudy)).toBeNull();` | D 行仍不画（这一支本来就是对的），补一颗按钮级钉防"行没了按钮还在" |
  | `expect(texts).toContain(SETTINGS_COPY.dailyGoal.label);` | **原样保留** | E 区只等 profile，与本轮同向 |
  | `expect(buttons()).toHaveLength(5);` | `toHaveLength(7);`（注释写明 9 颗常态 −「连续」卡 − D 行「去背单词」） | 两格回来了 ⇒ 可点面必然 +2；这是**面变大**不是放松 |
  | `expect(toastCalls).toHaveLength(0);` | **原样保留** | — |

- **G-05（新增）**`打卡数在途未回：与 G-04 同一档按格降级（档案源两格已在位、0 假 0、0 半截）`
  —— 夹具改走 `holdCheckin = true`（`/api/checkin/status` **永不应答**），断言形状同 G-04 并额外钉
  `expect(slider()).not.toBeNull();`。理由：F-29 的门是"到手没有"而不是"失败没有"，旧版屏在这一档
  同样会整段不画，而盘上原来**没有任何一颗用例覆盖"打卡未回"**（旧 G-04 标题写了"没到手"却只测了 500）。
- **G-06（新增）**`档案在途未回而打卡已回：只画打卡源那一格 + D 行，档案两格与 B/E 不画，且不出 :1001 错误卡`
  —— `holdProfile = true` + 默认打卡桩。钉 `statCardsAll()===1`、`stat-streak` 的 `aria-label` 逐字 =
  `statCards.streak.value(12)`、`stat-words`/`stat-review-days` 为 `null`、
  `visibleTexts()).toContain(CHECKIN_COPY.done(STREAK_DAYS))`、`goalSection()).toBeNull()`、
  `not.toContain(SETTINGS_COPY.fetchFail.title)`、`buttons()).toHaveLength(2)`、
  `texts.some(t => t.includes(statCards.words.value(0)))===false`。
  理由 = 反方向的那一半证据：**有人把两颗门重新合并成 `showGoal && …` 时本条立刻判红**（G-04/G-05 抓不到这种回退）。
- **夹具新增**（非断言面）：`let holdCheckin = false; let holdProfile = false;`（`:170-171`）
  + `stubFetch` 内两处 `if (hold…) return new Promise<Response>(() => undefined);`（`:220`、`:243`）
  + `beforeEach` 复位两枚（`:491-492`）。默认桩形与既有 65 颗的走位一字未改（全绿即证）。
- **未动清单**（简报点名的整表常量逐颗复跑原样绿）：F-03（`:1001` 错误卡五串整表钉 + `statCardsAll()===0` +
  `all('footer')` 0 命中）、M-04（错误卡钮 2 颗唯一可点面 + 恢复后 `statCardsAll()===3`）、
  M-06（在途同步整表只有 h1）、G-01/G-02/G-03（三卡逐字/落点/访客 0 卡）、H-01~04、J 组、K 组、
  L-01/L-02/L-03、`GUEST_VISIBLE_TEXTS` 与 `GUEST_BASE_VISIBLE_TEXTS` 两颗整表常量**未增一行未删一行**。
  ⇒ **没有任何"只删不加"的用例**；`A 组源码哨`（`useDueBadge()` / `checkinStatusQueryOptions()` 各恰一次、
  `ABOUT_ROUTE` 恰 2 次）也未翻面。

**用例增减**：`me-screen.spec.tsx` 65 → **67**（改判 1 + 新增 2 + 0 减）。

### 原始尾行
```
 ✓  @tm/app  test/me-screen.spec.tsx (67 tests) 649ms

 Test Files  1 passed (1)
      Tests  67 passed (67)
```
（第一轮改码未改 spec 时的**唯一**红点即 G-04，原始输出留在 `e4b2-app\件3-me-screen-首轮.txt`：
`AssertionError: expected [ <button …(5)>…(1) ] to have a length of +0 but got 2` ⇒ 证明这颗门的确被真修翻转，
不是我先改了断言再凑绿。）

### 未做（原样带上，不谎称已交）
- **降级支要不要留页脚 = F-36 系，本轮未动**：`MeScreen.tsx:747` 的 `showSettingsSections` 页脚门
  与 `:741-752` 的注释块一字未改；`:1001` 整页降级支仍不画页脚，F-03 里那句
  `expect(all('footer')).toHaveLength(0)` 显式钉还在（翻口径才会翻它）。
- C 区三格"缺源那一格的位置留空"是 `grid-cols-3` 的自然结果，本轮**没有**为占位造第三种控件
  （`G-01` 的"恰三张，不许多造"与 J-04 的反向钉都未翻）。
- 「热力图滚到今天」的查询参数接线（0b 末尾那条）不在本轮面内，未动。

---

## 缺陷自报

1. **件2 我一开始按"保留兼容别名"的方案写了两颗定义处，随即自查出盘上有四颗消费方**（简报未点名）
   ⇒ 停下来先 grep 消费面再定取舍，最终改成一次收口。中间态未落盘运行，不影响任何绿灯申报。
2. **件1 的改前快照我一开始漏采**：三张屏（Study/Completion/WordDetail）在 21:36 落快照时才进 `FILES`
   清单，但它们当时已被改过 ⇒ 用逐字逆向替换（与 Edit 当时同一颗字符串）还原改前面并核对
   `wc -l` 与原始 Read 的 `:6/:7/:44/:72/:76/:87` 逐字相符后才继续。这条写进报告是因为它一度会让
   scoped patch 虚高（少了 3 颗文件的账）。
3. **件3 的 G-06 我第一版把可点面写成 5 颗**（漏算 F/G 两区走 `showSettingsSections` 而非 `showGoal`）
   ⇒ 先按代码事实算成 2 颗再跑，跑测一次通过，未出现"改断言凑绿"。
4. **出口第 3 条我第一次交出的 patch 被门禁判红 8 处、拒判 1 处**（不是放松断言、也不是改门禁）：
   `parsePatch` 只认 `diff --git` 行复位游标，纯 `diff -u` 拼接时每颗文件会多吃下一颗文件的
   `--- a/…` 头 = 每颗虚高 1 行（`42→43` 触发拒判、`61→62` 触发超幅）。修法 = 每段前补一行
   `diff --git a/<rel> b/<rel>`（真实 `git diff` 形状），幅度回到实测值后 exit 0。
   **这条同时是"登记的通道不是恒放行"的反证**（同一颗 patch 超限即红）。
5. `tools/ownership.json` 的登记我一开始写进了一对裸英文引号（JSON 语法错），`json.load` 立刻抓到并改成
   『』。登记后复算：`json ok entries= 150`。

---

## 两证（A-77 #261）

### 证一：禁动面 sha256 全量快照复算
开工后第一件事对 `packages/**` + `apps/web/**` 的 `ts/tsx/json/css/mjs/sql` 落 455 条快照
（`forbidden-sha256-before.txt`），收尾 `sha256sum -c` 原始输出：
```
packages/server/src/trpc/routers/wordbook.ts: FAILED
packages/server/test/integration/auth-hardening.spec.ts: FAILED
packages/server/test/trpc-shape.baseline.json: FAILED
packages/shared/src/contracts/auth.ts: FAILED
sha256sum: WARNING: 4 computed checksums did NOT match
```
451 条 OK + 4 条 FAILED。**这 4 颗全部是并行的服务端轮 E4b 的写入**（它的交付报告 §件1/件2/件4 点名
`wordbook.ts` 的 add 上限与守卫、`trpc-shape.baseline.json` 的再生、`contracts/auth.ts:25` 注释、
`auth-hardening.spec.ts:1096` 注释），且它在 `tools/ownership.json` 里为这四颗各登记了
`bounded-edit:A-82-E4b` / `baseline-regenerate:A-82-E4b` 通道 —— 与本轮无关。
**本轮 E4b2 对 `packages/**` 与 `apps/web/**` 0 写入**，由下面证二的按分钟反查坐实。

### 证二：`find -newermt "2026-09-21 21:23:16"` 反查本轮写入清单（原始输出）
```
./.delivery/04-dev-report-E4b.md                      ← 并行轮 E4b 的报告
./.delivery/04-dev-report-E4b2.md                     ← 本报告
./apps/app/src/components/ai-mnemonic-bar.tsx         ← 件2
./apps/app/src/components/result-row.tsx              ← 件2
./apps/app/src/screens/CompletionScreen.tsx           ← 件2
./apps/app/src/screens/MeScreen.tsx                   ← 件3
./apps/app/src/screens/StudyScreen.tsx                ← 件2
./apps/app/src/screens/WordDetailScreen.tsx           ← 件2
./apps/app/test/me-screen.spec.tsx                    ← 件3
./apps/app/test/router.spec.tsx                       ← 件1
./packages/server/src/trpc/routers/wordbook.ts        ← E4b
./packages/server/test/integration/auth-hardening.spec.ts   ← E4b
./packages/server/test/integration/wordbook-trpc-add.spec.ts ← E4b（新建）
./packages/server/test/trpc-shape.baseline.json       ← E4b
./packages/shared/src/contracts/auth.ts               ← E4b
./tools/ownership.json                                ← 本轮登记 + E4b 登记（见下）
```
`find` 看不到**删除**：`apps/app/src/shell/ScreenFallback.tsx` 的消失是件1 的删除动作，证据 =
`ls apps/app/src/shell`（`BackKeyBridge.tsx GateLayout.tsx TabBarShell.tsx`）+ 它出现在我的 scoped patch 里
（`@@ -1,42 +0,0 @@`）+ 改前快照留在 `e4b2-app\before\apps\app\src\shell\ScreenFallback.tsx`。
**`apps/app/src/router.tsx` 与 `apps/app/src/main.tsx` 不在清单里 = 禁动面 0 diff**（批次4 的先例保持）。

### `tools/ownership.json` 是一颗两轮的共用账面
它是归属表本体（`tools/**` 在册 owner=T-02），本轮与 E4b 同刻各写自己的登记行 ⇒
**任何快照差都会混进对方的登记**，所以它**不进**自证 scoped patch（混入他人改动正是 `bounded-edit`
的拒判形状）。我名下 9 颗产品文件的幅度全部按实测登记，登记动作本身的证据改由 JSON 校验 +
`--self-test` + `--check-ownership` 三条一起兜。

### 真库三值复点（全程只读）
```
-rw-r--r-- 1 曹怡明 197121 253952 Sep 18 04:05 data.db
-rw-r--r-- 1 曹怡明 197121      0 Sep 17 00:10 packages/server/data.db
6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d *data.db
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *packages/server/data.db
2026-09-21 21:57:35
```
253952 字节 / `6595517661cc` / mtime `2026-09-18 04:05` 三值与开工前逐字相同；占位库 `e3b0c44298fc` 0 字节未变。
本轮没有任何一次连库动作（未跑 seed / 未跑 `--i-know-this-is-prod` / 未启服务端）。

---

## 出口判据（三条，逐条贴原始输出）

### #1 `pnpm --filter @tm/app test`（基线 463 → 466，只增不减）
```
 Test Files  18 passed (18)
      Tests  466 passed (466)
   Start at  21:56:14
   Duration  18.11s (transform 5.77s, setup 0ms, collect 29.13s, tests 68.00s, environment 14.93s, prepare 2.86s)
```
（`test_exit=0`；日志 `e4b2-app\exit1-test.txt`。用例增减：件1 `router.spec` +1 / 件3 `me-screen.spec` +2 /
件2 +0 ⇒ **463 + 3 = 466**，0 颗删除，0 颗 `test.skip` / `test.fail`，0 处 `waitForTimeout`，
未新增任何 `data-testid` / `id` / `className`（三格用的 `testid` prop 是 `StatCard` 既有契约面））

### #2 `pnpm --filter @tm/app typecheck`
```
$ tsc -p tsconfig.json --noEmit
tc_exit=0
```
（基线 0 错 → 0 错；日志 `e4b2-app\exit2-typecheck.txt`）

### #3 归属门禁
```
$ node tools/boundaries.mjs --check-ownership --task E4b2 --files <9 颗> --diff-file e4b2-app\e4b2-scoped.patch
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 9 个文件的 diff 参与判定
NOTE apps/app/src/shell/ScreenFallback.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+0/-42 行）
NOTE apps/app/test/router.spec.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+46/-15 行）
NOTE apps/app/src/components/ai-mnemonic-bar.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+3/-4 行）
NOTE apps/app/src/components/result-row.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+4/-4 行）
NOTE apps/app/src/screens/MeScreen.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+57/-35 行）
NOTE apps/app/src/screens/StudyScreen.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+4/-3 行）
NOTE apps/app/src/screens/CompletionScreen.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+3/-2 行）
NOTE apps/app/src/screens/WordDetailScreen.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+5/-3 行）

--check-ownership task=E4b2 触碰 9 个在册文件（清单 9 项 + patch 9 项） → 无越界
exit=0
```
（`apps/app/test/me-screen.spec.tsx` 第 9 颗走既有条目的 `maxDiffLinesFor.E4b2 = 97` 预算分支按实际
diff 判（+92/-5 = 97 ≤ 97），通道形状差异见下面「登记面交底」。）

**登记前的反证**（同一颗命令、未登记任何通道时）：
```
RED  apps/app/src/shell/ScreenFallback.tsx 由 T-14 独占（当前任务 E4b2）— §10.4 第 5 行
RED  apps/app/test/router.spec.tsx 由 T-14 独占（当前任务 E4b2）— A-24-2：…
RED  apps/app/src/components/ai-mnemonic-bar.tsx 由 T-17 独占（当前任务 E4b2）— §10.2 T-17 行 …
--check-ownership task=E4b2 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 3 处越界   exit=1
```
**登记后仍会判红的反证**（幅度只多 1 行时）：`允许 ≤61 行实际变更，patch 里是 62 行` +
`拒判：patch 含 43 行删除/改写，远超授权上限 42 行` → exit 2（原始输出留在 `e4b2-app\check-ownership-final.txt`
的第一版；修法见「缺陷自报」第 4 条）。⇒ 通道不是空壳、也不是恒放行。

### 收尾复跑 `node tools/boundaries.mjs --self-test`
```
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (452 modules, 1553 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：157/157 通过
exit=0
```
（登记改 JSON 后复跑，157/157 未变红；日志 `e4b2-app\self-test.txt`）

---

## 授权通道登记交底（A-67 #187 一条一 path）

新建 8 颗**精确路径**条目 + 并 1 颗既有条目：

| path | owner（不改归属） | `actions` | `maxDiffLinesFor.E4b2` |
| --- | --- | --- | --- |
| `apps/app/src/shell/ScreenFallback.tsx` | T-14 | `bounded-edit:A-82-E4b2` | 42（=0 增 +42 删） |
| `apps/app/test/router.spec.tsx` | T-14 | 同上 | 61（+46/-15） |
| `apps/app/src/components/ai-mnemonic-bar.tsx` | T-17 | 同上 | 7（+3/-4） |
| `apps/app/src/components/result-row.tsx` | T-17 | 同上 | 8（+4/-4） |
| `apps/app/src/screens/MeScreen.tsx` | T-19 | 同上 | 92（+57/-35） |
| `apps/app/src/screens/StudyScreen.tsx` | T-18a | 同上 | 7（+4/-3） |
| `apps/app/src/screens/CompletionScreen.tsx` | T-18a | 同上 | 5（+3/-2） |
| `apps/app/src/screens/WordDetailScreen.tsx` | T-17 | 同上 | 8（+5/-3） |
| `apps/app/test/me-screen.spec.tsx`（**并既有精确条目**） | T-19e | 见下 | 97（+92/-5） |

- **为什么不新建同路径第二条**：F-41（`boundaries.mjs:1627` 只取 `entries[0]`）⇒ `me-screen.spec.tsx`
  那颗已有精确条目，本轮把授权**并进去**（新增 `"E4b2": 97` + 一颗 `_e4b2_note`），与 E4a2 收
  `login-screen.spec.tsx` 空壳案同一处理。
- **精确条目 vs 粗条目的胜者**：`ownershipSpecificity`（`:1165`）把 `*` 与 `{` 一律记 `exact=0`
  ⇒ 精确路径恒赢 `apps/app/src/shell/**`、`apps/app/src/screens/**`、
  `apps/app/test/{…,router}.spec.{ts,tsx}`、`apps/app/src/components/{result-row,…}.tsx` 四颗粗条目，
  本轮 exit 0 的 NOTE 逐颗点名即实测证据（形状先例 = E4b 件4 的 `auth-hardening.spec.ts`）。
  这样做而**不**并入粗条目的理由：粗条目一条兜 4~11 颗文件，把 92 行的帽子挂到 `screens/**`
  等于给另外九张屏也开面；精确条目只点到我真正写过的那一颗。
- **一处形状差异，主动交底**：`me-screen.spec.tsx` 那颗**只加 `maxDiffLinesFor.E4b2`、不加 `actions`**。
  原因是它已有 `T-19g-i…v` 五轮的纯预算授权，而那五轮的 scoped patch 已不可得（E4a2 件4 在这颗
  reason 里交底的实测结论：`bounded-edit` 无 `--diff-file` 直接判「要证据」= 违规）⇒ 给条目补 `actions`
  会让历史轮次在账面变成不可判定。E4b2 自己带 patch 走 `extra` 分支同样按实际 diff 判（97 ≤ 97）。
- **E4b2 是一次性伪任务号**：九颗通道的 reason 全部写了「E4b2 用完即止，后续批次新任务须另立登记
  （A-35-11 口径）」。`--task E4b2` 未在 `tasks` 名册里（名册校验只查 `owner`/`per_file`，
  `maxDiffLinesFor` 与 `actions` 的键位不参与，A-82 的 E4b 同形状先例已跑通）。

---

## 交付清单（本轮写过的字节）

| 文件 | 件 | 实测幅度 |
| --- | --- | --- |
| `apps/app/src/shell/ScreenFallback.tsx` | 件1 | **删除** 0/42 |
| `apps/app/test/router.spec.tsx` | 件1 | +46/-15 |
| `apps/app/src/components/ai-mnemonic-bar.tsx` | 件2 | +3/-4 |
| `apps/app/src/components/result-row.tsx` | 件2 | +4/-4 |
| `apps/app/src/screens/CompletionScreen.tsx` | 件2 | +3/-2 |
| `apps/app/src/screens/StudyScreen.tsx` | 件2 | +4/-3 |
| `apps/app/src/screens/WordDetailScreen.tsx` | 件2 | +5/-3 |
| `apps/app/src/screens/MeScreen.tsx` | 件3 | +57/-35 |
| `apps/app/test/me-screen.spec.tsx` | 件3 | +92/-5 |
| `tools/ownership.json` | 登记 | 9 颗通道（不入自证 patch，理由见「两证」） |
| `.delivery/04-dev-report-E4b2.md` | 本报告 | — |

合计 **327 diff 行**（+214 / -113，不含 ownership.json 与本报告），用例 **463 → 466**。
