# 开发报告（前端）— T-16 Web 登录墙拆除与凭据交互 · **第 2 轮接手**

> **一句话交接**：本轮不重做，只做三件事——(a) 把上一轮遗留的 typecheck 红**逐条清零**（基线实测 **7 行**错误码，交底书写"8 条"，两处 `asChild` 与两处 `override` 分别已各计 1 条，逐条清单见 §1）、(b) 补两个缺失的 e2e spec（判据①-⑨ 全部可 e2e 化的项 + §10.2 点名的"未命中门禁时 upgrade-gate 零副作用"用例，共 **20 条用例 × 2 视口 = 40 条**，`--list` 可收集）、(c) 交出本报告。
> **上一轮的产物绝大多数是复用未改的**：`components/{auth-gate.tsx,login-wall.tsx}`、`app/upgrade-password/page.tsx`、`lib/api/auth.ts`、`lib/use-auth.ts`、`components/providers.tsx`、`lib/trpc.ts` 六件一字未动（清单见 §2）。
> **两件上一轮的实质缺口本轮必须补，否则判据⑦ 不成立**：① `app/layout.tsx` 里**从来没有挂过** `<UpgradeGate>`（grep 0 命中，上一轮没用那"1 import + 1 包裹标签"的例外额度）⇒ 拦截层实际不存在；② `upgrade-gate.tsx` 的 fail-open 兜底**当时不成立**（boundary 出错后仍返回那颗抛错的 `UpgradeGateInner`）。修法见 §1.8/§1.9。
> **出口状态如实报**：`typecheck` **绿（exit 0）**；`build` **红（exit 1）**，红位在 **T-15 名下两个文件**（`src/lib/api/profile.ts:346`、`app/(user)/wordbook/page.tsx` 预渲染），我的文件在 build 面上唯一的红（`login-dialog.tsx` 的 `consistent-type-imports` error）已修；Playwright **未跑**（两条硬原因，见 §3/§9）。

任务：T-16（批次 4A）｜覆盖：R-23 全条、R-39⑧⑨、R-40③④⑥ 前端面、R-01⑤⑥⑧｜角色卡：`roles/dev.md`
并发：同批 T-15 正在改 `app/(user)/{study,wordbook,profile}/**` 与 `components/{study,profile}/**`、`lib/api/profile.ts`、`lib/api/review.ts` —— **本轮一律未碰**（含 build 红也不代修），红位登记在 §5。

---

## 1. 第 2 轮：基线 7 行 typecheck 红，逐条怎么修

基线取证（`pnpm --filter @tm/web typecheck`，本轮开工第一步实跑，与 TPM 交底一致）：

```
$ tsc --noEmit
src/app/(user)/about/page.tsx(30,26): error TS2352: Conversion of type 'RegExpMatchArray | []' to type 'readonly [string, string]' may be a mistake …
src/app/(user)/about/page.tsx(56,10): error TS2304: Cannot find name 'NOTICE_REVISION_LABEL'.
src/app/(user)/about/page.tsx(62,24): error TS2322: … Property 'asChild' does not exist on type '… HTMLAttributes<HTMLDivElement> …'.
src/app/(user)/about/page.tsx(71,24): error TS2322: （同上）
src/components/login-dialog.tsx(64,42): error TS2304: Cannot find name 'requestLogin'.
src/components/upgrade-gate.tsx(45,3): error TS4114: This member must have an 'override' modifier …
src/components/upgrade-gate.tsx(49,3): error TS4114: （同上）
[ELIFECYCLE] Command failed with exit code 2.
```

| # | 红位 | 码 | 修法 | 是否新写实现 |
|---|---|---|---|---|
| 1 | `about/page.tsx:30` | TS2352 | **删掉强转**，不改为 `as unknown as` 二段转。`match()` 无命中回 `null`，`?? []` 与二元组类型天然不重叠，强转是把"源串一定含两个书名"这个假设藏进类型里骗编译器。现在写成 `const AGREEMENT_TITLES: readonly string[] = AUTH_COPY.agreement.match(/《[^》]*》/g) ?? []`，两枚书名按下标读（`noUncheckedIndexedAccess` 下是 `string \| undefined`，正是合法 `ReactNode`）。 | 否。正则与源串（`AUTH_COPY.agreement`）是上一轮成品，**复用未改**；未新增任何文本 |
| 2 | `about/page.tsx:56` | TS2304 `NOTICE_REVISION_LABEL` | 该符号在 `@tm/shared` **根本不存在**（`packages/shared/src/constants/notice.ts` 只有 `NOTICE_REVISION:99` 与 `NOTICE_REVISION_HISTORY:102`，全仓 grep `NOTICE_REVISION_LABEL` 0 命中）。改为 type-position 用不到、直接 `import { NOTICE_REVISION } from '@tm/shared'` 并渲染其值。UI §3.8.6:1008 对「关于」页只要求"**版本号**"一格 ⇒ 渲染口径版本值本身即合规。**没有在组件里补一句"文案口径版本："的字面量**（那是第二份文案，违 A-37 §五-24 零字面量）；缺 label 常量登记为 shared 缺口 → 待拍板 P-1 | 否（只换 import + 换符号名） |
| 3 | `about/page.tsx:62` | TS2322 `asChild` | 按 `packages/ui` 契约消费：`CardTitle` 是 `forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>`（`packages/ui/src/primitives/card.tsx:22`），**无 Slot、不吃 `asChild`**（只消费禁改，本轮 `packages/**` 零 diff）。上一轮写的是 `asChild={false}` ⇒ 删掉该 prop 后**零行为变化**（false 本就是默认）。 | 否 |
| 4 | `about/page.tsx:71` | TS2322 `asChild` | 同上，同一文件第二处。 | 否 |
| 5 | `login-dialog.tsx:64` | TS2304 `requestLogin` | **两步，且不走"直接加进 value import 列表"那条捷径**（见下方说明）。① 在唯一真源 `lib/auth.ts` 把 `requestLogin()` 的**内联 detail 形状**提为导出接口 `export interface LoginOpenDetail`，`requestLogin(detail?: LoginOpenDetail)` 原地引用（函数体一字未改）；② 组件删掉 `type LoginOpenDetail = Parameters<typeof requestLogin>[0];`，改成 `import { …, type LoginOpenDetail, … } from '@/lib/auth'`。 | 否。形状仍只有一个声明点（`lib/auth.ts`），组件里不出现第二份定义 |
| 6 | `upgrade-gate.tsx:45` | TS4114 | `componentDidCatch` 补 `override`。 | 否 |
| 7 | `upgrade-gate.tsx:49` | TS4114 | `render` 补 `override`（顺带把它的兜底语义改对，见 §1.9）。 | 是（同一条语句内） |

**#5 为什么不"从既有单一源 import 一个函数符号"就完事**：`requestLogin` 在弹窗里只被 `Parameters<typeof …>` 用作**类型**，把值导入补上进行列表后 `tsc` 确实绿，但 `next build` 的 `@typescript-eslint/consistent-type-imports`（`eslint.config.js:152`，**error 级**）会判 `Imports "requestLogin" are only used as type` 而**把 build 打死** —— 本轮第一跑实测撞到，证据在 §3 的 build 日志。所以修法必须落在"给 detail 形状一个具名导出"上，而不是把值符号塞进组件。这也正是本轮唯一一条**typecheck 绿但 build 红**的坑，交给 E4 记一笔。

### 上一轮遗留、不在 typecheck 面上但影响判据的两件（本轮一并补）

| # | 缺口 | 实测 | 修法 |
|---|---|---|---|
| 8 | 根 layout 从未挂门禁层 | `grep -n "UpgradeGate\|upgrade-gate" apps/web/src/app/layout.tsx` → **No matches**（本轮开工实测）。判据⑦ 写死"拦截层跨全站"，没挂 = 强制改密硬门禁在前端**不存在**，任何待升级账号可以直接逛全站 | 用掉登记例外额度：`app/layout.tsx` **新增 3 物理行、0 删除** = 1 行 `import { UpgradeGate } from '@/components/upgrade-gate'` + 1 个包裹标签的开/闭各 1 行。落点在 `<Providers>` 之内（要 `useRouter`/trpc 上下文），包住 `WebUiHostProvider` 与 `Toaster`。scoped patch 里的对应 hunk 全文在 §3 |
| 9 | fail-open 兜底当时不成立 | `UpgradeGateBoundary.render()` 原来无条件 `return this.props.children` —— 而它的 `children` 就是那颗**抛错的** `<UpgradeGateInner>`；`getDerivedStateFromError` 之后原样重渲染 = 第二次抛错并冒到根，"这一层不拦、绝不把 children 一起带走"（该文件头注第 2 条兜底）成了空话，命中路径反而是**全站白屏** | 给 boundary 加一个 `fallback` prop（= 未经本层包裹的原始 children），`render()` 改为 `this.state.failed ? this.props.fallback : this.props.children`；`UpgradeGate` 传 `<UpgradeGateBoundary fallback={children}>`。**该文件对外 API 一字未变**（`UpgradeGate`/`UpgradeEntryNotice`/`UPGRADE_PATH` 三个出口形状不变），故 layout 侧只需那 3 行 |

**复用未改（上一轮成品，本轮零 diff）**：`components/auth-gate.tsx`(87 行)、`components/login-wall.tsx`(88 行)、`app/upgrade-password/page.tsx`(194 行)、`lib/api/auth.ts`(159 行)、`components/providers.tsx`、`lib/use-auth.ts`、`lib/trpc.ts`。
**本轮实有 diff 的文件**：`about/page.tsx`、`login-dialog.tsx`、`upgrade-gate.tsx`、`lib/auth.ts`（只加 `LoginOpenDetail`）、`app/layout.tsx`（3 行）、新增 `e2e/auth-wall.spec.ts`、新增 `e2e/upgrade.spec.ts`。

---

## 2. 完成清单

| PRD/任务编号 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| R-23①②/判据① 三态与骨架屏 | **部分（组件侧 done，采用侧不可我改）** | `components/auth-gate.tsx`、`lib/use-auth.ts` | 机制齐备且 e2e 已钉。**全站 5 个业务页至今没有一处采用 `<AuthGate>`**（`grep -rn "AuthGate\|LoginWall" apps/web/src/app` 只命中我自己 `about/page.tsx` 的注释）⇒ 判据① 的"页面不再吐中间态"要 T-15/T-12 接线才算落地，已登记 §6 |
| R-23③④/R-39⑨/判据②③⑤⑨ 弹窗薄壳 | done | `components/login-dialog.tsx`、`components/login-wall.tsx` | 控件与判定全在 `@tm/ui/AuthFormShell`（T-13），文案零字面量 |
| R-40③④⑥/判据⑥⑦/判据⑦ 401·403 单点与硬门禁 | done | `components/providers.tsx`、`lib/api/auth.ts`、`components/upgrade-gate.tsx`、`app/upgrade-password/page.tsx`、`app/layout.tsx`(例外 3 行) | 本轮补 §1.8/§1.9 两洞后，链路才第一次物理闭合 |
| R-01⑧⑧b/R-39⑪/判据⑧ 「关于」页 | done | `app/(user)/about/page.tsx` | 服务端组件、未登录可读、页面文案全部来自 `@tm/shared` |
| §10.2 判据①-⑨ e2e | done（**未执行**） | 🆕`e2e/auth-wall.spec.ts`(11 条)、🆕`e2e/upgrade.spec.ts`(9 条) | 配置仍只有 A-30-6 那一份 `playwright.config.ts`，本轮未再造第二份 |
| `.delivery/04-dev-report-T-16.md` | done | 本文件 | 第 2 轮覆盖第 1 轮报告位（上一轮未交报告） |

---

## 3. 自检与冒烟（命令与关键输出全部实取；`$?` 逐条实测）

### ① `pnpm --filter @tm/web typecheck` → **绿**

```
$ pnpm --filter @tm/web typecheck
$ tsc --noEmit
REAL_EXIT=0
```
本轮共跑 3 次：开工基线 1 次（exit 2 / 7 行红，见 §1）、修完 5 个源文件后 1 次（exit 0）、补完两个 spec 后 1 次（exit 0）。
中途出现过一次 `src/app/(user)/study/page.tsx(126,70) TS2322` —— **T-15 正在保存文件的瞬时红**，两次实测之间自行消失，登记不修（§5）。

### ② `pnpm --filter @tm/web build` → **红（exit 1），红位不在 T-16 名下**

第一跑（我名下还带着那条 eslint error）：
```
./src/components/login-dialog.tsx
45:1  Error: Imports "requestLogin" are only used as type.  @typescript-eslint/consistent-type-imports
Exit status 1
```
修好后第三跑（真实 `$?`，未过 pipe）：
```
BUILD_EXIT=1
 ✓ Compiled successfully in 4.2s
Failed to compile.
./src/lib/api/profile.ts:346:27
Type error: Property 'nickname' does not exist on type '{ ok: true; daily_goal: number; }'.
Exit status 1
```
第二跑（同一次修复后的另一种落点，证明是移动靶）：
```
 ⨯ useSearchParams() should be wrapped in a suspense boundary at page "/wordbook".
Error occurred prerendering page "/wordbook".
```
**结论**：`✓ Compiled successfully` 之后我的 14 个文件在 build 面上**零 error**（ESLint 余下 4 条全是 warning，位置在 `components/profile/checkin-card.tsx`、`components/study/card-view.tsx`、`lib/api/review.ts`，全部 T-15 名下）。两处阻断点 `src/lib/api/profile.ts` 与 `src/app/(user)/wordbook/page.tsx` 都在 T-15 的可写面里、且两次跑的错误不一样（对方在并行施工）⇒ 按并发提醒**登记不修**，build 由 T-15 交回后复跑。

### ③ Playwright `e2e/auth-wall.spec.ts e2e/upgrade.spec.ts` → **未执行（未跑）**，原因两条都是实测

已跑到的部分（收集与语法/类型校验，无浏览器、无 webServer）：
```
$ pnpm exec playwright test e2e/auth-wall.spec.ts e2e/upgrade.spec.ts --list
Total: 40 tests in 2 files
LIST_EXIT=0
```
真跑一次的过程证据：
```
$ timeout 200 pnpm exec playwright test e2e/auth-wall.spec.ts e2e/upgrade.spec.ts --workers=1 -g "零副作用：未命中门禁"
[WebServer] [Error: Could not find a production build in the '.next' directory. Try building your app with 'next build' …]
Error: Process from config.webServer was not able to start. Exit code: 1
PW_EXIT=1
```
两条硬原因：
1. **本机无浏览器内核**：`%LOCALAPPDATA%\ms-playwright` 目录不存在（`ls` 实测 `NO_BROWSER_DIR`）。`playwright.config.ts` 装的是 chromium 两个 project，即便服务起来也起不了浏览器。这与 T-12 `e2e/home.spec.ts` 头注记录的同一环境限制一致（那份 spec 至今也未执行过）。
2. **`webServer: next start` 起不动**：需要 `.next` 生产产物，而 build 被 T-15 名下两处红挡住（§3②）。
**没有谎报**：这 40 条用例一条都没跑过，只做到"`--list` 可收集 + 通过 `tsc` 类型校验"。

### ④ `node tools/boundaries.mjs --copy` → **红（exit 1），2 处命中均不在 T-16 名下**

```
RED  copy-legacy-zero  2 处命中：apps/web/src/app/(user)/wordbook/page.tsx:17 | apps/app/src/screens/LookupScreen.tsx:73；需人工复核词命中 138 处（不判红，UI §8.2-9 明示由走查确认）
0/1 条通过，1 条红
COPY_EXIT=1
```
`apps/web/src/app/(user)/wordbook/**` = T-15，`apps/app/src/screens/LookupScreen.tsx` = T-17。T-16 名下 12 个 src 文件对该规则的词表 0 命中（下方 §3⑥ 的逐串实测为证）。

### ⑤ `node tools/boundaries.mjs --check-ownership --task T-16 --diff-file <scoped patch>` → **绿（exit 0）**

```
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 14 个文件的 diff 参与判定
--check-ownership task=T-16 触碰 14 个在册文件（清单 0 项 + patch 14 项） → 无越界
OWN_EXIT=0
```
patch = `%TEMP%/t16-r2…` 下 `t16-scoped.patch`（2405 行 / 14 个 `+++` 段）。**scoped 的构造法**（全程零 git 写）：
- 已跟踪的 5 个 T-16 源文件走 `git diff -- <paths>`；
- 8 个未跟踪新文件走 `git diff --no-index -- /dev/null <path>`（不用 `git add -N`，那是索引写操作，铁律禁）；
- **`app/layout.tsx` 单独合成**：`git show HEAD:…` 取基线 → 只插入我这 3 行 → `diff -u` 打标为 `a/…layout.tsx`。原因：工作树该文件同时背着 T-04 批次 2 **未提交**的 34 行（viewport + 首帧主题脚本），若直接 `git diff` 会把别人的行算进 T-16 的"改动幅度"，既虚报越界也说不清额度。合成 hunk 全文：
```
@@ -1,6 +1,7 @@
 import type { Metadata } from 'next';
 import { Toaster } from 'sonner';
 import { Providers } from '@/components/providers';
+import { UpgradeGate } from '@/components/upgrade-gate';
 import { ThemeProvider } from '@/components/theme-provider';
 import './globals.css';
@@ -23,8 +24,10 @@
         <Providers>
+          <UpgradeGate>
           <ThemeProvider>{children}</ThemeProvider>
           <Toaster position="top-center" richColors />
+          </UpgradeGate>
         </Providers>
```
（真实文件里被包裹的两行做了缩进对齐，是空白差异；T-16 可归因的净增仍是 **3 行、0 删除**。）

### ⑥ 判据⑧ 六串 grep 证据（与 `boundaries --copy` 同 roots/同 exts：`apps/web/src`、`apps/app/src`、`packages/{ui,shared,server,agent}/src`、`mobile-memory`；`*.ts`/`*.tsx`）

```
-- 忘记密码 : 0
-- 找回密码 : 0
-- 以后再说 : 0
-- 用验证码登录 : 1
packages/shared/src/constants/copy.ts:580:  smsEntryLabel: '使用验证码登录',
-- 重新注册 : 0
-- 换手机号 : 0
```
唯一命中**不在 T-16 名下**（`packages/shared/**` 是 T-03 独占，我只 import），且它是 **PRD R-01⑤ 与 R-39⑨ 明令保留的定稿标签**`使用验证码登录`（弹窗底部 12px 小字入口），`用验证码登录` 是其子串。这一条已由 `04-adjudications.md` **A-7** 裁为"改词表、不改定稿文案"，窄化为 `请用验证码登录` / `改用验证码登录` 两句完整句式（`packages/shared/test/contracts.spec.ts:518` 钉着"过宽那条不得在词表里"）。按 A-7 的窄口径复查，两句在 `packages/**/src`、`apps/**/src` 的**实现面** 0 命中（命中的只有 shared 测试自己的词表）。⇒ 本条按"5/6 逐字 0 命中 + 第 6 条按 A-7 窄口径 0 命中"呈请 TPM 判定，见待拍板 **P-2**。

T-16 名下 12 个 src 文件单独逐串（含 `请先登录后`，判据① 的对象）：
```
忘记密码 : 0 | 找回密码 : 0 | 以后再说 : 0 | 用验证码登录 : 0 | 重新注册 : 0 | 换手机号 : 0
```
`请先登录后` 在我名下 src 出现 5 次，**全部是注释里对被消除对象的原样引用**（`auth-gate.tsx:4/8/16`、`login-wall.tsx:14`、`use-auth.ts:8`），无一处是渲染文案；两个 e2e spec 里出现的禁词是**测试数据本体**（`FORBIDDEN_IN_DOM` 数组），且 `apps/web/e2e/` 不在 `--copy` 的 roots 内（先例：T-03 的词表住在 `packages/shared/test/`）。若 QA 要做"全仓逐字 0 命中"的机器化断言，须显式排除注释面与测试数据面，否则必然自打 —— 登记为 P-6。

### ⑦ A-37 §五-25 的两条批次 2 遗留红：实测定位在 T-15/T-04 名下

```
$ node tools/boundaries.mjs --colors
RED  colors-no-hardcode   2 处命中：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
RED  css-important-budget !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | :695
COLORS_EXIT=1
```
按 §五-25"若属 `packages/ui` 文件归 T-15 消费不改"与"谁的文件谁修"：T-16 名下 **0 处**（`grep '#hex|!important'` 在我 12 个 src 文件 → 空）。

---

## 4. 判据①-⑨ 自证（§10.2 T-16 行逐条）

| 判据 | 状态 | 证据 |
|---|---|---|
| ① 已登录进 5 页 DOM 无"请先登录后…"中间态（骨架屏 → 内容） | 机制 done / **实测未跑** | `use-auth.ts` 的 `useSyncExternalStore` + 服务端快照恒 `idle` ⇒ SSR/水合首帧只出骨架、不出文案；`auth-gate.tsx` `idle` 分支渲染 `<AuthSkeleton>`（零文案）。e2e：`auth-wall.spec.ts › ①` 用 `addInitScript` 挂 MutationObserver，**对整段生命周期的每一帧**扫 `请先登录后`（不是只查稳定态），再钉 `login-wall`/`auth-gate-skeleton`/`[data-auth-status=idle]` 三者归零 × 5 页。⚠ 前提"页面采用 `<AuthGate>`"不在我名下（§6） |
| ② 弹窗默认密码模式 + 默认焦点在密码框 | done / 未跑 | `login-dialog.tsx` `mode` 初值 `'sign-in'` + `autoFocus="password"`；e2e `› ②` 断言 `data-mode="sign-in"`、`field-confirm` 计数 0、`document.activeElement === document.querySelector('[data-testid=field-password] input')` |
| ③ 未登录进 `/wordbook`：可读引导 + "手机号登录"主按钮 + "没有账号？注册"文字链 | done / 未跑 | `login-wall.tsx` 四串全部 import 自 `AUTH_COPY.wall.*`，可交互元素 2 颗；e2e `› ③` 按定稿值逐字断言三样 + 点主按钮开弹窗且不换路由。⚠ `/wordbook` 挂 `LoginWall` 是 T-15 的接线（§6） |
| ④ 登录成功回跳原页 + 完成"待收藏" | done / 未跑 | `login-dialog.tsx` 的 `onAuthed()` 单点消费 `takePendingAction()`/`takeReturnTo()`；e2e `› ④` 预置两把键 → 提交 → 断言 `wordbook.add` 真被打到、URL 回 `/wordbook`、`tm_token` 写入、两把一次性键**腾空** |
| ⑤ `NO_PASSWORD_ACCOUNT` → 固定文案 + 可点"设置密码激活"→ 切注册态并保留手机号 | done / 未跑 | 卡片正文 = `TM_ERRORS.NO_PASSWORD_ACCOUNT.copy`、动作 = `AUTH_COPY.noPasswordAccount.action`（都在 `AuthFormShell`，T-13）；e2e `› ⑤` 打桩 401 + `data.code` → 断言卡片、点"设置密码激活"、`data-mode=register` + `data-activate=true`、手机号 digits 保留、**弹窗仍在（不被踢出流程）** |
| ⑥ 401 `CREDENTIAL_EXPIRED` → 清 localStorage + 跳登录 + 提示 | done / 未跑 | 唯一执行点 `providers.tsx` 的 `handleCredentialError()`（QueryCache + MutationCache 同一点，带 1.5s 闸门）；e2e `› ⑥` 用"整片 401"打桩（不依赖页面自有过程名）→ 断言 `tm_token`/`tm_user` 归 null、门禁两把键**未被顺手置位**、弹窗可见、`TM_ERRORS.CREDENTIAL_EXPIRED.copy` 在场。`› ⑥b` 钉对照组：密码错（服务端故意不给 §4.6 码）走的是 R-23④ 的"这个手机号还没注册，点这里注册"，不清凭据 |
| ⑦ `upgrade_required` → `/upgrade-password` 不可关闭、只有"改密/退出"两出口、成功后回原页 | done（本轮补齐）/ 未跑 | 本轮前：拦截层根本没挂（§1.8）。本轮后：`upgrade.spec.ts` 9 条钉全链 —— 登录出参 `token:''+upgrade_required` 只写两把 upgrade 键、`tm_token` **必须为 null**；命中标志位进任意业务页被 `router.replace` 到 `/upgrade-password`；`data-auth-hard-gate=true` + `header`/`mobile-nav`/`dialog-close`/`a[href]` 四种"第三条路"计数全 0 + 出口只有 `password-submit` 与 `force-sign-out` 两颗；Escape 与物理返回都出不去（popstate 重压历史）；改密成功清两把 upgrade 键、写正常 token、`TOAST_LONG_MS` 后回 `tm_return_to`；**反向用例**（不该在这一页的人）只给骨架并换回原页；改密失败留本页、不清任何键、显示 §4.6 人话 |
| ⑧ 六串禁词 0 命中 | **5/6 逐字 0 命中；第 6 条按 A-7 窄口径 0 命中** | §3⑥ 全量证据。另 e2e `› ⑧` 把同一张表变成运行时断言（关于页 + 弹窗两态 + 业务页走一遍，观察器命中数必须 `[]`） |
| ⑨ 协议未勾 → 主按钮禁用且给 `AGREEMENT_REQUIRED` | done / 未跑 | `AuthFormShell` `primaryBlockedByAgreement` → `aria-disabled` + `handleSubmit` 里 `setAgreementBlocked(true)` 并 **return**；e2e `› ⑨` 断言 `aria-disabled=true`、点击后 `[data-slot=agreement-error]` 逐字 = `请先阅读并同意《用户协议》《隐私政策》`、**`auth.register` 请求数为 0**，勾上即解禁且不重录；`› ⑨b` 另钉服务端回码路径显示同一句人话、不出现"请求失败/500"兜底 |
| §10.2 风险栏：未命中门禁时 upgrade-gate **零副作用** | done / 未跑 | `upgrade.spec.ts › 零副作用`（+ 一条止血阀 off 的姊妹用例）。落点选 **`/about`**（我名下服务端组件、页面树里零客户端数据获取）⇒ 冷加载一次对 `/trpc` 与 `/api/` 的请求数**必须为 0**（`page.on('request')` 计数，不受 route 覆盖顺序影响）；七把 `tm_*` 键位快照逐键相等（不写不清）；`upgrade-gate-blocking` 计数 0；URL 一字未变。四条合起来就是"只读一位标志位、不发网络请求"的可判真假版本 |

---

## 5. 并发登记（T-15 名下红位，本轮一律未碰、未修）

| 位置 | 现象 | 我做了什么 |
|---|---|---|
| `apps/web/src/lib/api/profile.ts:346` | `Type error: Property 'nickname' does not exist on type '{ ok: true; daily_goal: number; }'` —— **这是本轮 build exit 1 的直接原因** | 只登记。非 T-16 可写面 |
| `apps/web/src/app/(user)/wordbook/page.tsx` | `useSearchParams() should be wrapped in a suspense boundary` → 预渲染 `Export encountered an error` | 只登记 |
| `apps/web/src/app/(user)/study/page.tsx:126` | `TS2322 (next: StudyMode) => void vs () => void` —— 仅在一次 typecheck 中间出现过，两次实测之间自行消失（对方在保存） | 只登记，未修 |
| `apps/web/src/components/profile/checkin-card.tsx`、`components/study/card-view.tsx`、`lib/api/review.ts` | ESLint warning ×4（未用变量） | 只登记（warning 不阻断） |

另：§10.2 T-16 行的"不得触碰"清单本轮全部为 0 diff —— `packages/**`、`app/(user)/layout.tsx`、`components/{mobile-nav,header}.tsx`、`components/home/**`、`app/globals.css`、`app/(user)/{study,wordbook,profile}/**`。

---

## 6. 越界申请（不改，等主会话派给对应 owner）

| # | 越界对象 | 我要什么 | 为什么不能自己做 |
|---|---|---|---|
| X-1 | `app/(user)/{study,wordbook,report}.tsx`（T-15）、`{chat,assess}.tsx`（T-12） | 各页把"未登录就吐一行文案"改成 `<AuthGate>{内容}</AuthGate>`，游客态默认 `<LoginWall>` | 判据①③ 的**采用侧**在这 5 个文件里；`AuthGate`/`LoginWall` 已备好、API 是一行。当前全站 `AuthGate` 采用数 = 0 ⇒ 判据① 的 e2e 会在"墙是否出现"上判红，而不是判我的机制红 |
| X-2 | `app/(user)/layout.tsx`（T-12） | 确认「关于」页 `/about` 在**游客**下不被本层拦（R-01⑧"未登录可读"） | 我的页面本身是服务端组件、零门禁，但路由在 `(user)` 组内、由该 layout 包住。该文件是 T-12 独占且 §10.3 明写"T-16 不动 layout" |
| X-3 | `packages/ui/src/auth/AuthFormShell.tsx`（T-13） | 服务端回 `AGREEMENT_REQUIRED` 时同一句话在 `[data-slot=agreement-error]` 与 `[data-testid=auth-form-error]` **各渲染一次**（`CODE_FIELD` 无该码 ⇒ `underButtonError` 非空），提示弹两次 | 只消费禁改 `packages/**`。e2e `› ⑨b` 已按"至少出现一次 + 不出现'请求失败'兜底"写，改回来后不用动用例 |
| X-4 | `packages/shared/src/constants/notice.ts`（T-03） | 「关于」页版本行需要一句 label（如"文案口径版本："），与 `NOTICE_REVISION` 同处声明 | 判据"零字面量"禁止我在组件里自造第二份文案；`NOTICE_REVISION_LABEL` 这个符号本来就不存在（§1#2） |
| X-5 | `packages/server/**`（T-07/T-05） | `auth.forceChangePassword` / `auth.changePassword` 的 `oldPassword` **不得过 `PasswordSchema(min 8)`**：待升级人群的定义就是"密码不足 8 位"，现在他们在 zod 层就被拒，永远提交不上来 ⇒ 判据⑦ 的**真后端路径无法通过**（上一轮已登记为 D-1 连带缺陷，本轮复核仍在） | `packages/**` 禁碰。我的 e2e 用打桩绕过了它，所以**这条只能由服务端集成测试与走查证伪**，见 §9 |

---

## 7. 契约偏差

| # | 内容 |
|---|---|
| D-1（上一轮已登记，本轮复核仍在） | 冻结契约 `ForceUpgradeInputSchema` 无 `oldPassword`，服务端在边界 `.extend({oldPassword})`；客户端 `forceUpgradeInput()` 按冻结形状送、页面再补该键（`upgrade-password/page.tsx:138`）。**本轮未改形状**。X-5 是该偏差的实害面 |
| 本轮新增 0 条契约变更 | 未新增依赖、未改 tRPC 出入参形状、未动 `packages/**`。`lib/auth.ts` 的 `LoginOpenDetail` 是**前端本地类型提取**（把已有的内联形状起个名），不是契约面 |

---

## 8. 待拍板清单（P-1…P-6）

| # | 事项 | 我需要谁定 |
|---|---|---|
| P-1 | 「关于」页版本行现在只渲染 `NOTICE_REVISION` 的值 `v1.4-r1`（无前缀语）。要不要 T-03 补 label 常量（X-4）？ | TPM→PM/T-03 |
| P-2 | 判据⑧ 第六串 `用验证码登录` 全仓 1 命中 = T-03 名下 `使用验证码登录` 定稿标签（PRD R-01⑤ 明令保留、A-7 已裁"改词表不改文案"）。§10.2 的 T-16 行仍逐字写这条 ⇒ 请确认本任务按 A-7 窄口径判合格 | TPM |
| P-3 | build 的两处红在 T-15 名下（§5）。批次 4A 的门禁判定要"4A 全部报告交回 + 三套全绿"，T-16 侧 `typecheck` 已绿而 `build` 被同批 agent 挡住 ⇒ 是否接受"build 复跑推迟到 T-15 交回后 / E4 出口轮"？ | TPM |
| P-4 | X-5 是**判据⑦ 真链路无法闭合**的服务端缺陷（存量 <8 位密码账号提交不上改密）。本期 DoD 要不要为它单独派 T-07 微轮？不派的话，R-40④ 只能在 e2e 打桩面上成立、真实迁移账号走不通 | TPM→后端 |
| P-5 | 判据①/③ 的**采用侧**在 5 个业务页（X-1/X-2）。要不要把它们对 T-15/T-12 列为出口判据的一部分，否则我这两个 e2e 用例首跑即红，而红因不在我名下 | TPM |
| P-6 | 若 QA 把判据⑧ 做成"全仓逐字 0 命中"的机器化断言，需先约定排除项：注释面（我 3 个文件 5 处对被消除对象的原样引用）与测试数据面（两个 spec 的 `FORBIDDEN_IN_DOM`，先例是 T-03 词表住在 `packages/shared/test/`） | TPM→T-23 |

---

## 9. 未跑清单（诚实）

1. **Playwright 两个 spec 的 40 条用例：一条未跑**。原因 = 无 chromium 内核（`ms-playwright` 不存在）+ `next start` 无产物（build 红在 T-15）。已跑到的只有 `--list`（exit 0，证明可收集、类型正确）。
2. **真后端凭据链路**（`auth.login` 401/403、`upgrade_required`、`auth.forceChangePassword`）：未跑，需起 :3001 与真库；且 X-5 未修前真链路必红。
3. **R-01⑧b 五条告知 + 两条承诺的人工走查**（§8.3-E 第 4 项"人话、无内部术语"）：未做走查，只写了 DOM 断言方向。
4. **375×667 / 1280×900 两档**：未跑（同上）。
5. **dev server 冒烟路径**（角色卡第 5 条要求的"启动 dev server 验证自己的冒烟路径"）：**未做** —— `pnpm dev:web` 依赖 :3001 服务端与登录态，本机未起后端；我用 `playwright --list` + `tsc` 代替，不等价。
6. `apps/app/**`（App 端）：本任务范围外，未碰。

---

## 10. 铁律自查

| 铁律 | 自查 |
|---|---|
| 禁止一切 git 写操作（含 add） | **零写**。本轮用到的 git 命令只有 `git status`、`git diff`、`git show HEAD:<path>`（全部只读）。未执行 `add`/`commit`/`checkout`/`reset`/`stash`/`restore`；`--no-index` 那条是纯比较、不碰索引。`git status` 前后无索引变化 |
| 不碰任何 `data.db` | 未读未写。全程无 DB 连接、无迁移、无 `pnpm db:migrate`。`data.db`/`-wal`/`-shm` 三个文件时间戳未变（本轮没有一条命令指向它们） |
| 临时件在 `%TEMP%/t16r2/` | 是：`layout-base.tsx`、`layout-mine.tsx`、`t16-scoped.patch`、`build.log`、`build2.log`、`exit1.log` 六件，全在 `C:\Users\曹怡明\AppData\Local\Temp\t16r2\`。仓库内**未新增任何临时/报告类旁支文件** |
| `packages/**` 不碰 | 零 diff（`ownership` 判定 14 个在册文件全在我清单内，§3⑤ exit 0） |
| `app/(user)/layout.tsx`、`components/{mobile-nav,header}.tsx`、`components/home/**`、`app/globals.css`、T-15 名下页面 | 零 diff（§5） |
| `app/layout.tsx` 例外额度 | 用量 = **1 个 import + 1 个包裹标签**（开/闭各 1 行）⇒ 净增 3 行、0 删除。**如实报**：若把"1 个包裹标签"按字面读作 1 行，则物理上是 3 行（JSX 包裹标签必然成对），无缩进以外的其它改动；hunk 全文在 §3⑤ |
| 不发明第二份文案 / 第二套实现 | 本轮新增字面量仅出现在**测试期望值**（spec 里的中文串按定稿值断言，与 `e2e/home.spec.ts` 既有口径一致）与注释。产品代码 12 个 src 文件零新增文案；缺符号一律回既有单一源（`NOTICE_REVISION`、`LoginOpenDetail`）|
| 不吞错 | `componentDidCatch` 仍 `console.warn` 带原始 error；改密失败留在本页并显示 §4.6 人话；403/401 单点各自只处理自己那一码 |

---

## 11. 给测试的提示（重点测哪里、我没测到什么）

- **先测判据⑦ 的真链路**（我完全没测到）：造一个 `pw_policy_version=0` + 密码 6 位的存量账号 → 密码登录 → 应"不进门、不签发正常 token、落地改密页" → 提交旧密 6 位 + 新密 8 位 → **这里十有八九卡在 X-5**（服务端 zod 把旧密拒了）。这条一旦红，R-40④ 整体不成立，不是前端的锅。
- **再测"零副作用"的反面**：手工把 `localStorage.tm_upgrade_required='1'` 塞进去再刷新任意页 —— 应当被换到 `/upgrade-password` 且刷不掉；然后清掉该位再刷 —— 应当完全无感。这两步是我 e2e 里 `› 零副作用` 与 `› 命中门禁进任意业务页` 的人肉等价版。
- **止血阀 off（§6.4-5-5）**：`passwordUpgradeEnforce=off` 时服务端既给正常 token 又标 `upgrade_required` ⇒ 前端应"人已进门 + 业务入口显示'请先修改密码'"。门禁侧我测了（`tm_upgrade_advisory` 不拦、不发请求），但 **`UpgradeEntryNotice` 全站零采用**（没有任何页面挂它，X-1 的同一条），R-23⑦ 末句在页面上目前不成立。
- **判据①/③ 依赖页面接线**：X-1 未完成前，那两条 e2e 的红因在页面 owner，不在 `auth-gate.tsx`/`login-wall.tsx` 本身。
- **弹窗焦点（判据②）是我最没底的一条**：Radix `DialogContent` 开合时会自己抢焦点，`AuthFormShell` 的 `autoFocus` 效应与它的时序谁赢，只有真跑浏览器才知道。若红，修法在 `@tm/ui` 侧（`onOpenAutoFocus` 交给壳），不在薄壳里。
