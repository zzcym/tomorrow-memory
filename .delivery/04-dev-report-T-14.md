# T-14 开发报告 —— `apps/app` Vite 工程 + REST 数据层 + 原生桥 + 导航壳 · 收口验证轮

- 任务：§10.2 批次2 **T-14**（无业务页；交付工程壳 + 数据层 + 原生桥 + 导航壳）
- 角色：前端开发（角色卡 `roles/dev.md`）
- 轮次：**收口验证轮**。盘上代码已按 **A-22(a)** 落地（懒加载 `shell/ScreenFallback` 占位、`router.tsx` 无硬 import 业务页）、build/test 已绿；本轮**不重写实现**，只做「冒烟重跑 + 判据逐条取证 + 字面量自查 + 出报告」。
- 日期：2026-09-04

---

## 0. 结论一句话

**`pnpm --filter @tm/app build` 绿（含 `tm-app:dist-guard` 判据①②通过）、`test` 绿（4 files / 56 tests）、`boundaries --check-ownership task=T-14` 无越界。**
完成判据 **①~⑥ 全部闭合**，每条均有「命令输出 / 产物扫描 / 具名测试」三类可复核证据之一（见 §2）。
组件与数据层无用户可见字面文案（全部 `import` 自 `@tm/shared`）；仅 `data/queries/review.ts:74` 有 1 处 **thrown invariant 中文串**（非 UI 文案、非 TM_ERROR 码），列给 TPM 见 §3。

**待裁决点（不阻塞本报告判据闭合）**：
1. §10.2 冒烟三件里的 `node tools/boundaries.mjs --dist apps/app/dist` **无法按字面执行** —— 该工具从未实现 `--dist` 模式（见 §1.3 证据）；需 **T-02** 补一个扫 dist 的判据模式，本轮以 T-14 内建的 `dist-guard` + 本报告的独立产物 grep 作为等效证据。
2. `check-ownership` 对 `apps/app` 的多数文件报 `no-entry（不阻断）`（归属表只登记了 `router.tsx`/`shell/**`/`data/**`/`host.tsx`/`package.json`/`tsconfig.json`）；是否把 `main.tsx`/`native/**`/`vite.config.ts`/`index.html` 等一并登记为 T-14 owner，属 **T-02 的 ownership.json owner 面**，本任务不改。

---

## 1. 冒烟三件（原始输出，未编辑）

### 1.1 `pnpm --filter @tm/app build` —— 绿

```
$ tsc -p tsconfig.json --noEmit && vite build
vite v6.4.3 building for production...
transforming...
✓ 218 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                           3.09 kB │ gzip:   1.74 kB
dist/assets/index-BZqPT64y.css           32.95 kB │ gzip:   7.20 kB
dist/assets/ScreenFallback-BN5jUGvy.js    0.46 kB │ gzip:   0.33 kB
dist/assets/index-BVHI6t_J.js           469.95 kB │ gzip: 143.54 kB
✓ built in 2.71s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：4 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```

> 产物按路由分包：`ScreenFallback-*.js` 是独立懒加载 chunk（A-22 的落点，R-17⑥）。

### 1.2 `pnpm --filter @tm/app test` —— 绿（4 files / 56 tests）

```
 ✓  @tm/app  test/rest-fetcher.spec.ts (18 tests) 19ms
 ✓  @tm/app  test/startup.spec.ts (16 tests) 21ms
 ✓  @tm/app  test/offline-queue.spec.ts (12 tests) 335ms
   ✓ 判据⑤-2 恢复后按序补传 > 超过单批上限就分批，且批次之间仍按原顺序（500 条一批）  315ms
 ✓  @tm/app  test/router.spec.tsx (10 tests) 1103ms
   ✓ 判据③-1 路由表与懒加载登记（A-22） > 11 条路由（= §5.3 的 11 个页面落点）、5 个 tab 与 NAV_ITEMS 同源，每条都有懒加载器  764ms

 Test Files  4 passed (4)
      Tests  56 passed (56)
```

### 1.3 `node tools/boundaries.mjs <正确参数>` —— `--dist` 不存在，改用等价正确形式

设计文档 §10.2 的 `--dist apps/app/dist` 直接执行只会打印 help（`--dist` 不是它的模式）。**已实测确认该模式从未实现**，而非产物不合格：

- `--help` 的模式清单（`--copy/--password/--migrations/--tokens/--colors/--ui-io/--shared-pure/--flags/--versions/--routes/--all/--check-ownership/--self-test/--list/--exceptions`）里**无 `--dist`**。
- `node tools/boundaries.mjs --list` → 「共 19 条断言」，逐条无任何扫描 `apps/app/dist` 的规则。
- 工具源码里 `dist` 只出现在一处**扫描排除**正则（`boundaries.mjs:91` 把 `dist` 目录排除在扫描外）。
- 本任务 `vite.config.ts:54` 注释即自陈：「`tools/boundaries.mjs --dist` 的落地件尚未交付」。

因此 T-14 能合法驱动的边界模式是**归属校验**，实跑：

```
$ node tools/boundaries.mjs --check-ownership --task T-14 --files <apps/app 全 30 个交付文件>
--check-ownership task=T-14 触碰 30 个文件 → 无越界
（13 个未在归属表登记路径的文件仅报 NOTE no-entry，不阻断 —— 见 §0 待裁决点 2）
```

旁证（确认本任务未引入新的全局红）：

```
$ node tools/boundaries.mjs --ui-io
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
1/1 条通过，全绿

$ node tools/boundaries.mjs --copy
RED  copy-legacy-zero  1 处命中：packages/ui/src/patterns/EmptyState.tsx:6
0/1 条通过，1 条红
```

> `--copy` 的唯一红落在 `packages/ui/src/patterns/EmptyState.tsx:6` —— 属**并行 agent 的 `@tm/ui` 面**，**不在 apps/app 内、不属 T-14**；apps/app 对 `--copy` 贡献 0 命中。本任务不代它修（角色卡 + 越界规则）。

**等效闭合**：判据①②由 `vite.config.ts` 的 `tm-app:dist-guard` 在构建期 `closeBundle` 硬扫（见 §2 ①②、§4），配合本报告的独立产物 grep（§2 ①②）覆盖 `--dist` 想做的事。

---

## 2. 完成判据 ①~⑥ 逐条闭合与证据

### ① `dist/index.html` 不含任何以 `/` 开头的资源路径 —— **成立**

- **构建期**：`vite.config.ts` `guardDist()`（`ROOT_RELATIVE_ASSET_REFS` 三条正则扫全部 `.html/.css`），命中即 `throw`；本轮 build 打印 `判据①②通过：4 个产物文件，无绝对路径资源`（§1.1）。
- **独立复核**（对本轮产物直接跑）：`grep -rnE '(src|href)="\/|url\(/|…' apps/app/dist` → **0 命中**；`dist/index.html:61-62` 实际引用为 `src="./assets/index-BVHI6t_J.js"`、`href="./assets/index-BZqPT64y.css"`，均以 `./` 相对。
- **来源保证**：`base:'./'` + `experimental.renderBuiltUrl`（`vite.config.ts:195,222-227`）把 asset/public 两类强制相对；源码 `index.html` 的 dev 入口 `/src/main.tsx` 由 Vite 改写成 `./assets/…`。

### ② 产物不含 Chrome84+ API（`structuredClone`/`Object.hasOwn`/`Array.prototype.at`/`requestIdleCallback`）—— **成立**

- **构建期**：`guardDist()` 扫全部 `.js/.mjs`，`BANNED_APIS`（structuredClone/Object.hasOwn/requestIdleCallback）+ `atApiViolations()`（`.at` 归因规则）；命中即 build 失败。
- **反「永真断言」自检**：`selfCheckAtRule()`（`vite.config.ts:116-126`）每次构建先跑 7 条 fixture（`AT_RULE_SELF_TEST`），任一条判错 → 构建直接失败。规则不可能被悄悄改成永远绿。
- **独立复核**（本轮产物）：`structuredClone|Object.hasOwn|requestIdleCallback` → **0 命中**；`.at(` 全 4 处均为 `this.at(...)`，命中的是 Radix `@radix-ui/react-collection` 的 `OrderedDict` **自身定义的 `at(i){…}` 方法**（bundle 内可见 `at(i){const s=cu(G(this,mt),i)…}`），与 `Array.prototype.at` 同类不同物；唯一一处 `Array.prototype.at` 在 `function cu(l,n){if("at"in Array.prototype)return Array.prototype.at.call(l,n); …下标兜底…}` —— 带特性探测、失败走自实现，二者都是 `atApiViolations` **默认判红、仅这两类可证明安全才放行**的白名单分支，非「加例外名单」。
- **语法降级**：`build.target:['es2020','chrome84']` + `cssTarget:'chrome84'`（`vite.config.ts:206-207`）。

### ③ hash 路由 5 tab 可达 + `window.__router.canGoBack()` 与 `window.__app.onForeground()` 两入口存在 —— **成立**

- **路由表**：`router.tsx:49-61` 的 `ROUTES` 共 11 条（= §5.3 全部页面落点），`TAB_PATHS` 由 `NAV_ITEMS.map`（`router.tsx:75`）派生，不复制第二份导航表。
- **测试**：`test/router.spec.tsx`（10 tests）——
  - 判据③-1：断言 `ROUTES.length===11`、路径逐条对齐、`TAB_PATHS.length===5` 且与 `NAV_ITEMS` 同源、**每条 `load` 是可解析出 `default` 组件的懒加载器**；
  - 判据③-3：5 个 tab 在 `TabBar` 上**真实点击** → `location.hash` 变化 → 快照换路由 → 渲染 `screen-fallback`，当前项唯一激活；
  - 判据③-4：`window.__router.canGoBack` 为 function 且返回值与内部栈一致；
  - 判据③-5：`window.__app.onForeground` 为 function，2s 去抖单飞（连调两次只补 1 次 `/api/version`）。
- **产物运行时复核**：`grep` 主 bundle → `__router`(1) / `canGoBack`(1) / `__app`(1) / `onForeground`(1) / `onAndroidBack`(4) 均在；`import("./ScreenFallback-BN5jUGvy.js")` 为动态懒加载。
- **实现点**：`installRouterGlobals()`（`router.tsx:318-331`）装 `window.__router`；`installAppGlobals()`（`main.tsx:124-131`）装 `window.__app`；`onForeground()` 在 `main.tsx:105-108`。

### ④ `rest-fetcher` 对 401 `CREDENTIAL_EXPIRED` / 403 `PASSWORD_UPGRADE_REQUIRED` 的单点处理有测试 —— **成立**

- **实现**：`handleAuthError()`（`rest-fetcher.ts:121-146`）——动作查 `TM_ERRORS[code].clientAction`（`clear-credential-and-login` / `goto-upgrade-password`），**本文件零文案字面量**；`claimHandling()`（`:110-114`）1500ms 抑制窗保证并发只处理一次（「单点」的并发面）。数据层不 import 路由，跳转经 `bindNavigation` 注入（`:93-100`）。
- **测试**：`test/rest-fetcher.spec.ts`（18 tests），关键：
  - 判据④-1/④-2：401 CREDENTIAL_EXPIRED → 清凭据+广播 sign-out+去 `/login`；403 PASSWORD_UPGRADE_REQUIRED → 广播+去 `/upgrade-password` **且不清凭据**；状态码与码不配对不消化；
  - 「并发命中只处理一次」「超抑制窗可再处理」「三条并发 401 → 仅一次登出广播」；
  - 「登录接口自身 401 用 `handleAuthError:false` 不误清」「无 code 的 401 → HTTP_ERROR 不误清」「`clearCredential` 四键清干净」。
- **fetch 单点**：全 `apps/app/src` 仅 `rest-fetcher.ts:217` 一处 `fetch(`（已 grep 确认），`data/queries/*` 与 screens 均经它。

### ⑤ 离线队列入队 + 恢复按序补传（模拟 3 次重试）—— **成立**

- **实现**：`enqueueUpsert`/`enqueueRemove`（`offline-queue.ts:164-190`）写本地、同词按 `seq` 翻转；`flushOfflineQueue`（`:264-360`）`composeBatch` 按 `seq` 升序组批（`:199`），`MAX_FLUSH_ATTEMPTS=3`（`:34`）+ `RETRY_BACKOFF_MS=[400,1200,3000]`，网络类失败静默重试 ≤3 次、仍失败整批留队（`:331-342`），409 采纳快照同批幂等重放（`:307-321`）。上限取 `WORDBOOK_PUSH_BATCH_MAX`/`WORDBOOK_MAX_ENTRIES` 常量。
- **测试**：`test/offline-queue.spec.ts`（12 tests），关键：
  - 判据⑤-1 入队（不发请求、同词翻转）；
  - 判据⑤-2「前两次网络失败、第三次成功 → 恰好消耗 3 次请求并走完退避」「3 次都失败 → 整批留队、下次恢复按序补传（apple/pear 顺序不乱）」「超单批上限分批且批间仍按原顺序」；
  - 判据⑤-3 补传期间续写不误清（R-20⑥）；判据⑤-4 409 同批重放幂等；判据⑤-5 旧手写版 `tm.wbQueue` 迁移。

### ⑥ `GET /api/version` 更新提示可关闭且 24h 不再提示 —— **成立**

- **实现**：`checkAppVersion`（`startup.ts:324-342`，启动链第 4 步）→ `shouldShowVersionPrompt`（`:237-246`）+ `dismissVersionPrompt`（`:230-234`，写 `VERSION_PROMPT_KEY`）。抑制时长 = `VERSION_PROMPT_SUPPRESS_HOURS`（`@tm/shared` 常量，=24，`:210` 换算），**不写死**。文案 = `NOTICE_CHANNEL_COPY.updateAvailable`（`:334`）。离线/404/形状不符一律静默返回 null（R-17⑨）。展示与关闭在 `shell/TabBarShell.tsx:79-109`（`VersionBanner`，关闭钮 aria 取 `VERBS.cancel`）。
- **测试**：`test/startup.spec.ts`（16 tests），关键：
  - 判据⑥-1 远端更新出一条提示、文案=shared 唯一定稿；已最新/更旧/缺 url/离线/500 均不提示；与登录态无关；
  - 判据⑥-2「关闭 → 提示消失；窗口内再检查不出、超窗后同一版本重新提示」；「关一个版本只压制该版本、官方再发新号重新提示」；「窗口边界按小时常量算」；
  - 判据⑥-3 版本号点分归一比较。

> **闭合口径说明**：①②是**产物形态判据**，其「测试」即构建期 `dist-guard`（每构建执行 + 7 条自检 fixture），配合本报告对当轮 dist 的独立 grep 取证 —— 属真跑真判，非「代码写了没测」。③④⑤⑥为具名单测覆盖，均在 §1.2 全绿。六条无「写了没测」的部分闭合项。

---

## 3. 字面量文案自查（组件 + 数据层）

**方法**：`grep -nE "['\"\`][^'\"\`\n]*\p{Han}[^'\"\`\n]*['\"\`]" apps/app/src`（匹配引号内含中文的字符串字面量），再逐条比对是否位于注释。

**结论**：命中项**全部为 JSDoc/行注释**；组件与数据层的**用户可见文案与错误码一律 `import` 自 `@tm/shared`**：

| 面 | 来源 | 证据 |
|---|---|---|
| tab 标签 / 导航项 | `NAV_ITEMS`（`@tm/shared`） | `TabBarShell.tsx:11,129-147`、`router.tsx:19,75` |
| 同步三态文案 | `SYNC_COPY`（`pending/synced/replayFail/offlineQuiet`） | `startup.ts:186-191`、`TabBarShell.tsx:11` |
| 版本提示文案 | `NOTICE_CHANNEL_COPY.updateAvailable` | `startup.ts:334` |
| 错误码/人话/动作 | `TM_ERRORS[code].copy/.clientAction`、`errorMessage`、`isTmErrorCode` | `rest-fetcher.ts:14-22,59-65,121-146` |
| 离线队列上限/批大小/落盘形状 | `WORDBOOK_MAX_ENTRIES`/`WORDBOOK_PUSH_BATCH_MAX`/`WordbookSyncStateSchema` | `offline-queue.ts:15-23` |
| 抑制时长 | `VERSION_PROMPT_SUPPRESS_HOURS` | `startup.ts:14-18` |
| ARIA / 动词 / 计数格式化 | `ARIA`、`VERBS`、`formatCount` | `TabBarShell.tsx:11` |
| 占位（Route/Screen Fallback） | **零文案**，仅 `Skeleton` + `aria-busy` | `ScreenFallback.tsx:8-11`、`router.tsx:346-353` |
| 打卡文案 | `CHECKIN_COPY`（数据层不写第二份） | `data/queries/checkin.ts:5` |

**清单（1 处，交 TPM 定夺，本任务不改 `packages/shared/**`）**：

| # | 文件:行 | 内容 | 性质 | 建议 |
|---|---|---|---|---|
| L-1 | `apps/app/src/data/queries/review.ts:74` | `throw new Error('review-queue: mode=new|selfTest 不评分（R-12②）')` | **开发者侧 thrown invariant**（防在 `new/selfTest` 模式误调 `rateWord` 的断言），不面向用户、非 TM_ERROR 码 → 严格说不在「文案/错误码须 import shared」的管辖内 | 保留可接受；若要求数据层零中文字面量，建议改英文字面量（**属 T-14 owner 面，等 TPM 一句话即改，不自作主张**）。**不新增 `@tm/shared` 常量**（T-03 owner 面，且并行 agent 正在改 `packages/shared`）。

**未越界**：未向 `packages/shared/**` 加任何常量；未改 `tools/**`；`--copy` 唯一红属并行 agent（§1.3）。

---

## 4. `file://` 与 ES2020 各自怎么保证（两条独立约束）

| 约束 | 保证手段 | 落点 | 失败即 |
|---|---|---|---|
| **`file://`（无服务器重写、origin=null）** | ① 只用 `location.hash` 路由（无 History API）；② `base:'./'` + `renderBuiltUrl{relative}` 全资源相对；③ 请求 `credentials:'omit'`、GET 不发 `Content-Type`（少预检，配合服务端白名单含 `null`）；④ 首帧主题与低版本提示写进 `index.html` 内联脚本 | `router.tsx:1-16`；`vite.config.ts:195,222-227`；`rest-fetcher.ts:217-222`；`index.html:18-60` | 判据① 由 `dist-guard` 扫绝对路径 build 失败；CORS/真机在 T-20 |
| **ES2020 / Chrome84（WebView 底线）** | ① 语法层 `build.target:['es2020','chrome84']`+`cssTarget`；② API 层 esbuild **不 polyfill**，故 `dist-guard` 构建期扫 banned API（含 `.at` 归因规则），且规则自带 7 fixture 反永真自检 | `vite.config.ts:56-126,206-207` | 判据② 命中即 build 失败 |

---

## 5. 新建 / 修改文件清单（本轮 = 仅新增本报告；下列盘上文件为上轮 T-14 交付，本轮未改）

**本轮唯一改动**：🆕 `.delivery/04-dev-report-T-14.md`（本报告）。

**T-14 交付面（盘上现状，未提交，本轮核对无越界）** —— 共 30 文件 / 约 4226 行：

- 工程壳：`apps/app/{vite.config.ts,index.html,postcss.config.js,tailwind.config.ts,tsconfig.json,package.json}`
- 入口/路由/宿主：`src/{main.tsx,router.tsx,host.tsx}`、`src/styles/app.css`
- 数据层：`src/data/{rest-fetcher.ts,offline-queue.ts,startup.ts}`、`src/data/queries/{lookup,wordbook,review,profile,checkin,analyst}.ts`
- 原生桥：`src/native/{bridge.ts,speak.ts,launch-focus.ts}`
- 导航壳：`src/shell/{TabBarShell.tsx,GateLayout.tsx,BackKeyBridge.tsx,ScreenFallback.tsx}`
- 测试：`test/{rest-fetcher,offline-queue,startup,router}.spec.{ts,tsx}`
- **未创建** `src/screens/*.tsx` 业务页（A-22(a)：属批次4 的 T-17/T-18/T-19；`router.tsx` 全部 `load` 指向 `shell/ScreenFallback`）。

---

## 6. 给 T-17 / T-18 / T-19 / T-20 的接口说明

### 6.1 路由懒加载表（批次4 接线）
`src/router.tsx:49-61` 的 `ROUTES` 已把 11 条 `path → load` 全部登记；当前每条 `load = SCREEN_PLACEHOLDER`（`() => import('./shell/ScreenFallback.js')`）。**批次4 唯一接线动作 = 把对应那一行的 `load` 换成真组件**（`router.tsx` 每行只改 1 处，路由名/查询键不动；§10.4 第 5 行 + A-13/A-22）：

| # | hash 路径 | kind | 目标 screen | 归属 |
|---|---|---|---|---|
| 1 | `/` | tab | `screens/LookupScreen` | T-17 |
| 2 | `/word/:word` | secondary | `screens/WordDetailScreen` | T-17 |
| 3 | `/study` | tab | `screens/StudyScreen` | T-18 |
| 4 | `/study/done` | secondary | `screens/CompletionScreen` | T-18 |
| 5 | `/wordbook` | tab | `screens/WordbookScreen` | T-18 |
| 6 | `/progress` | tab | `screens/ProgressScreen` | T-18 |
| 7 | `/me` | tab | `screens/MeScreen` | T-19 |
| 8 | `/security` | secondary | `screens/SecurityScreen` | T-19 |
| 9 | `/me/about` | secondary | `screens/AboutScreen` | T-19 |
| 10 | `/login` | gate | `screens/LoginScreen` | T-19 |
| 11 | `/upgrade-password` | gate | `screens/UpgradePasswordScreen` | T-19 |

- `React.lazy` 要求组件为 **`default` 导出**（`RouteLoader` 签名 `router.tsx:34`）。
- 别名归一（通知/小组件/分享链）见 `ROUTE_ALIASES`（`router.tsx:64-72`）：`/report→/progress`、`/about→/me/about`、`/password→/upgrade-password`、`/lookup|/home→/`；未识别路径回落 `#/`。
- 二级页取参：`useLocation()` → `{path,query,route,params}`（如 `#/word/apple%20pie?from=tab` → `params.word`、`query.from`）。
- 数据层出口（screens 只 import、不自己 `fetch`）：`src/data/queries/*` 的 `queryOptions`/动作函数；文案/错误码经 `@tm/shared`（见 §3）。
- 搜索框聚焦令牌：`native/launch-focus.ts:88-93` 的 `takeSearchFocusRequest()`，供 T-17 `LookupScreen` 挂载后配合 `SearchBar.focus()`。
- 同步区文案三态/红点：订阅 `startup.ts` 的 `subscribeSyncStatus`/`syncLabel`/`pendingLabelCount`（`shell/TabBarShell.tsx` 已放 `SyncBadge`/`VersionBanner`，页面复用即可）。

### 6.2 两个冻结 JS 入口（名字不许改，§5.6，T-20 的 Java 依赖）
- `window.__router.canGoBack(): boolean` —— `router.tsx:318-331`（`installRouterGlobals`，`main.tsx:157` 首帧挂载）。返回是否有应用内历史可退。
- `window.__app.onForeground(): void` —— `main.tsx:124-131`（`installAppGlobals`）。Java `onResume` 用 `evaluateJavascript` 调它；与 `visibilitychange` 收敛到同一函数、2s 去抖（`FOREGROUND_DEBOUNCE_MS`）。
- 兼容旧钩子 `window.onAndroidBack(): string`（`router.tsx:296-298,328`）：现网 `MainActivity.onBackPressed` 仍在调；返回值含 `exit` 字样即交给原生 `finish()`。强制改密页返回 `stay`（`handleSystemBack` 对 `/upgrade-password` → `'stay'`，R-40④）。
- `window.__app.status()`：诊断位（`{sync, path}`），供真机 remote inspect / T-23 用例。

### 6.3 原生桥方法名与键（`src/native/bridge.ts`，全部**特性探测**、缺失回落 localStorage/内存）
- 注入对象名 `AndroidBridge`；**冻结三方法**（现网已存在）：`saveToken` / `readToken` / `consumeLaunchFocus`。
- §5.6 计划、T-20 需补：`setLaunchFocus` / `saveTempToken` / `readTempToken` / `clearTempToken` / `clearToken` / `getAppVersion`。缺 `getAppVersion` 时版本回落 `kv['tm.appVersion']` 或 `0.0.0`（`bridge.ts:133-143`）。
- localStorage 键（一字不许改）：`tm.token` / `tm.phone` / `tm.nickname` / `tm.tempToken` / `tm.wbSyncState`（本任务新队列表 `offline-queue.ts`）；离线队列**一次性迁移**旧手写版键 `tm.wbQueue`/`tm.wbSeq`/`tm.wbCache`（`migrateLegacyQueue`，覆盖安装不丢词）。
- 深链目标取值（`consumeLaunchFocus` 返回）：`lookup`（小组件直达+聚焦）/ `#/<path>`（通知 `open=#/study`）→ 归一见 `launch-focus.ts`。
- 请求根址开关 `window.__API_BASE__`（沿用旧 `api.js`，浏览器自测可覆盖；默认 `https://tmword.xyz`）。

---

## 7. 遗留项 / 越界申请 / 契约偏差

- **越界申请**：无。本轮只新增本报告；未触碰 `mobile-memory/**`、`apps/web/**`、`packages/**`、`tools/**`。
- **契约偏差**：无改契约。`/api/version` 尚无 zod 契约（T-07 落地），`startup.ts:279-295` 只做宽容归一（`latest|latestVersion|version|versionName` × `url|apkUrl|downloadUrl|link`），已在源码注释登记为「给 T-03/T-07 的需求」。增量词本 `{version,updatedAt,changed,removed}` 契约缺 schema（`queries/wordbook.ts:47-48`），同登记为需求，未自造第二份真相。
- **遗留 / 未在本任务闭合**：
  1. `--dist` 边界模式未实现（§1.3）→ 由 T-02 补；本轮以 dist-guard + 独立 grep 等效。
  2. `ownership.json` 对 `apps/app` 多数文件 `no-entry`（§0 待裁决点 2）→ 归 T-02。
  3. **真机 `file://` 冒烟属 T-20**（判据「只在真机暴露」的部分本任务出口不覆盖，§10.2 T-14 回归风险列已注明）。
  4. 业务页 `screens/*` 全为 `ScreenFallback` 占位 → T-17/T-18/T-19 接线。
- **给测试的提示**：重点测 `handleAuthError` 的并发单点（1500ms 抑制窗）与 `flushOfflineQueue` 的 409 同批重放幂等 + 补传期间续写不误清；`file://` 资源相对性与 Chrome84 API 已由构建门禁保证，测试侧无需重复，但真机冷启动 `ReferenceError` 属 T-20/T-23 的 CDP 面。
