# 交付报告 · #47 E5-register（真修「注册」落点 · A-86 7C 落地）

- 开工实测 `date`：**2026-09-26 04:46:06**（pre 复点第一行）
- 收工实测 `date`：**2026-09-26 05:09:5x**（本报告落盘时刻见文末「时间线」逐条实测）
- 执行人：前端 agent（App 面）· 档位：内部可用版窗口（截止 2026-09-27 06:00）
- scoped patch：`C:\Users\曹怡明\AppData\Local\Temp\e5reg\e5-register.patch`（408 行，13 颗全量 `diff -u`，基线 = `%TEMP%\e5reg\pre\`）
- 全部出口日志：`C:\Users\曹怡明\AppData\Local\Temp\e5reg\logs\`（下文引用的日志名都在该目录）

## 0. 开工第一步：pre 基线复点（日志 `logs/00-precheck-sha.log`）

13 颗现盘 sha256 前 12 逐颗 = `pre/manifest.json`（sha12 与字节双比对）：`ALL MATCH`（04:46:06→04:46:2x），无别人在写，放行开工。

**改后 sha12 现值**（`e5reg\post-manifest.json`，05:08 实测，供 TPM 复点）：

| 文件 | pre | post |
|---|---|---|
| apps/app/src/lib/auth-store.ts | df3fd620f230 | 11ea37fe82fb |
| apps/app/src/router.tsx | 7f2b9c5c189a | 64c4d62d516d |
| apps/app/src/screens/LoginScreen.tsx | bc106a61d2dc | 8f542dc1551f |
| apps/app/src/screens/MeScreen.tsx | 9756f7cc913e | 76e4e34cb56c |
| apps/app/src/screens/StudyScreen.tsx | d4f8a5b29b59 | c28e86c6f303 |
| apps/app/src/screens/WordbookScreen.tsx | 3c30c2fc7926 | 0a4c6f603a96 |
| apps/app/src/screens/CompletionScreen.tsx | 20ddf69fa411 | a114c5732db5 |
| apps/app/test/router.spec.tsx | cd6b0469af69 | b609dd6adc59 |
| apps/app/test/login-screen.spec.tsx | d8328ed5691f | 4cd29db09f3d |
| apps/app/test/me-screen.spec.tsx | ab4e8be34142 | 50b2f1969d18 |
| apps/app/test/study-screen.spec.tsx | 133d36974f56 | 184fed2be040 |
| apps/app/test/completion-screen.spec.tsx | 4d267a5d704f | 1033b114d1bf |
| apps/app/test/wordbook-screen.spec.tsx | 9d2c3b192da1 | 5ada245a4c65 |

---

## 件A —— 路由名单点（auth-store.ts）

**改了什么**：`LOGIN_ROUTE` 旁同形新增 `export const REGISTER_ROUTE = '/register';`（带注释一行）+ `export type RegisterRoute = typeof REGISTER_ROUTE;`（照 `:52` `LoginRoute` 的别名形状）。+3/-0 行。

**出口命令原文片段**（`logs/t9-exit-evidence.log` @05:07:32）：

```
$ grep -rn "REGISTER_ROUTE" apps/app/src
apps/app/src/lib/auth-store.ts:50:export const REGISTER_ROUTE = '/register';
apps/app/src/lib/auth-store.ts:55:export type RegisterRoute = typeof REGISTER_ROUTE;
apps/app/src/router.tsx:20:import { REGISTER_ROUTE } from './lib/auth-store.js';
apps/app/src/router.tsx:56:  { path: REGISTER_ROUTE, ... }
apps/app/src/screens/LoginScreen.tsx:56 / :90
apps/app/src/screens/MeScreen.tsx:149 / :201 / :514 / :534
apps/app/src/screens/StudyScreen.tsx:84 / :623
apps/app/src/screens/WordbookScreen.tsx:85 / :653

$ grep -rn "'/register'" apps/app/src
apps/app/src/lib/auth-store.ts:50:export const REGISTER_ROUTE = '/register';   ← 全仓 src 面 `/register` 字面量 1 处
```

屏侧/路由侧全部只引常量，`src` 内 `/register` 字面量 = **1 处**（auth-store.ts:50）。用例侧的断言字面量申报见「待裁」W-1。

## 件B —— 路由表加第 12 条（router.tsx）

**改了什么**：① `import { REGISTER_ROUTE } from './lib/auth-store.js';`（单颗具名 import，形状与屏侧对 auth-store 的既有 import 一致，未开第二条约路径 import）；② `ROUTES` 末尾新增 `{ path: REGISTER_ROUTE, kind: 'gate', load: () => import('./screens/LoginScreen.js') }` + 行尾注释一行（写明两条 gate 共指一屏的原因 = 校验/勾选/话术单份、两态由路由派生，非任务流水账）；③ 文件头 `:37` 历史口径「11 行现已全部指向真实屏」随手改为 12 行（不改进期注释 N1）。+3/-1 行。

**出口：改后 ROUTES 逐条 path 清单（12 条，含 kind；实测自 `logs/t9-exit-evidence.log`）**：

| # | path | kind | 行 |
|---|---|---|---|
| 1 | / | tab | :45 |
| 2 | /word/:word | secondary | :46 |
| 3 | /study | tab | :47 |
| 4 | /study/done | secondary | :48 |
| 5 | /wordbook | tab | :49 |
| 6 | /progress | tab | :50 |
| 7 | /me | tab | :51 |
| 8 | /security | secondary | :52 |
| 9 | /me/about | secondary | :53 |
| 10 | /login | gate | :54 |
| 11 | /upgrade-password | gate | :55 |
| 12 | REGISTER_ROUTE（'/register'） | gate | :56 |

简报 §1 的两颗禁改面一寸未动：`main.tsx` 未动（gate⇒`GateLayout` 按 kind 自然命中第 12 条）；`router.tsx` 的 back 语义 / `ROUTE_ALIASES` / `TAB_PATHS` 未动（`'stay'` 仍只判 `GATE_UPGRADE_PATH`，`/register` 物理返回行为与 `/login` 同形状）。

## 件C —— 登录屏 mode 改由路由驱动（LoginScreen.tsx，核心）

**改了什么**（+10/-2 行）：
1. `const loc = useLocation();`（引 `../router.js` 既有导出，形状照 `CompletionScreen.tsx:103` 等 5 处既有消费者）；
2. `React.useState<AuthFormMode>('sign-in')` → 惰性初值 `() => loc.path === REGISTER_ROUTE ? 'register' : 'sign-in'`，注释写明为什么**不加** `useEffect` 同步：`AppRoutes` 以 `key={def.path}` 挂载（router.tsx:362），两颗 gate 的 `def.path` 不同 ⇒ 换路由必重挂本屏、初值必按**新路由**重算 —— 「从 /login 点屏内注册钮、回退、再进 /register 得是注册态」由重挂保证；未用 `key` 强刷新形状、未用 `location.reload()`；
3. 文件头第一行同步为「`#/login` 与 `#/register` 两条 gate 共指本屏」。
- ⛔ 未用 `?mode=` 当驱动源（只认 `loc.path`）；屏内 `changeMode`（含 activate 联动、`setFailure(NO_FAILURE)` 清位）与 `settleSession`/`gotoUpgrade`/`leaveTo` 链一寸未动。
- Chrome84 红线：只用了既有 `useLocation`（`useSyncExternalStore` 是仓内既有形状）与惰性初值，零新内置 API。

**手测 hash→mode 对照表**（四行里三行有本轮用例实跑背书，jsdom 真挂载；真机 WebView 未测 = 「未实测」U-1）：

| hash | loc.path | mode 初值 | 证据 |
|---|---|---|---|
| `#/register` | /register | register | login-screen H-01（绿）|
| `#/login` | /login | sign-in | login-screen H-02 前半（绿）|
| `#/login?mode=register`（死参手敲回来） | /login | sign-in（查询参数不翻面） | login-screen H-02 后半（绿）|
| `#/`、其它任意 | 非 /register | sign-in | 既有 C-01~G-02 全组在 `beforeEach resetRouterForTest('/')` 下不翻面（18 files 全绿）|

## 件D —— 六个发送方改指向 + 死参清理

**改后 6 行 file:line 实测**（`logs/t9-exit-evidence.log` @05:07:32）与去参前后 hash 对照：

| 发送方 | 现 file:line | 改前落点 | 改后落点 |
|---|---|---|---|
| StudyScreen「登录」 | StudyScreen.tsx:619 | `#/login?mode=sign-in&from=study` | `#/login?from=study` |
| StudyScreen「注册」 | StudyScreen.tsx:623 | `#/login?mode=register&from=study` | `#/register?from=study` |
| WordbookScreen sign-in 分支 | WordbookScreen.tsx:653-654（`goLogin`） | `/login?mode=sign-in&from=wordbook`（且 `/login` 第二份字面量） | `${LOGIN_ROUTE}?from=wordbook` → `#/login?from=wordbook` |
| WordbookScreen register 分支 | 同上 | `/login?mode=register&from=wordbook` | `${REGISTER_ROUTE}?from=wordbook` → `#/register?from=wordbook` |
| CompletionScreen「登录」 | CompletionScreen.tsx:187 | `#/login?mode=sign-in&from=study` | `#/login?from=study` |
| MeScreen B 区次钮「注册」 | MeScreen.tsx:534 | `navigate(LOGIN_ROUTE)`（降级落登录态） | `navigate(REGISTER_ROUTE)` |
| （主钮「登录」不变） | MeScreen.tsx:524 | `navigate(LOGIN_ROUTE)` | `navigate(LOGIN_ROUTE)` |

- `from=` 一律原样保留（F-62 另案）；`intent=`/`word=` 家族（result-row.tsx:376、WordDetailScreen.tsx:231）本轮 0 diff。
- `mode=` 死参全仓 src 面清零：`grep -rn "mode=sign-in\|mode=register" apps/app/src` → **0 命中**（`logs/t9-exit-evidence.log` 末段）。
- MeScreen 两处「已知降级」注释（文件头 `:148-151` 四行、`onClick` 上方 `:516-518` 三行）已改写为描述新形状（两颗 gate 各落各的、共指一屏、mode 由路由派生），⛔ 无「本轮不改 router/LoginScreen」流水账。MeScreen diff 合计 +6/-9（额度 16 内，注释占大头）。

## 件E —— 用例改判（六颗 spec 一颗不缺）

1. **router.spec.tsx**（+25/-9，额度 34 用满不超）：`:114` 11→**12**；`:116` 清单尾加 `REGISTER_ROUTE`（引常量非字面量）；`:142` 后加 `routeFor(REGISTER_ROUTE).kind === 'gate'`；**FU24① 换更强钉**（不删不松）：`REAL_SCREEN_DEFAULTS.size` **仍 = 11**（未造第 12 张屏）、逐条 load 解析真屏原样保留、新增 `seen.size === 11`（12 条折叠成 11 张不同屏 ⇒ 数学上有且仅有一对共指）+ `defaults.get(REGISTER_ROUTE) === defaults.get(LOGIN_ROUTE)`（把唯一共指对钉死为两颗 gate ⇒ 其余 10 条一条一屏、两两不同、不与 gate 共用）+ **正向钉**：读 `LoginScreen.tsx` 源码形状（剥注释）断言含 `useLocation()` 与 `REGISTER_ROUTE`（mode 只能由 path 派生；未造任何 DOM 钩子）。踩坑如实报：`new URL('字面量', import.meta.url)` 被 Vite 静态改写成 dev-server 资产 URL（实测打出 `http://localhost:3000/...`，红过一次），已改走变量形状（与 login-screen.spec `readSrc` 同形），注释里写明原因。
2. **login-screen.spec.tsx**（+32/-0，额度 36 内）：新增 **H 组两颗**：H-01 `#/register` 首屏即注册态（标题=`AUTH_COPY.dialog.register`、提交钮=`AUTH_COPY.submit.register`、`[role=checkbox]` 在、`login-agreement-note` 不在、0 请求）；H-02 `#/login` 仍登录态 + 「死参 `?mode=register` 不翻面」半颗。`beforeEach` 加 `resetRouterForTest('/')` 保隔离。`:364` 的 `'\/api\/register'` 恰 1 颗钉与 `:102` fetch 分派形状 ⛔ 动（现值见 B-02 绿）。
3. **me-screen.spec.tsx**（+6/-5）：M-03 反向哨改判 —— **跨轮翻转申报见下一节**。
4. **study(1032)/completion(418)/wordbook(1005/1011)**（+3/-1、+1/-1、+2/-2）：随件D 改钉为 `#/login?from=study`、`#/register?from=study`（S-24 顺带补点了第二颗 link 的正向钉）、`#/login?from=wordbook`、`#/register?from=wordbook`，全部 `toBe` 精确比对，⛔ `toContain`、⛔ 删用例。

### 件E-3 翻转申报（M-03，先例口径 = A-94 #382）

- **改前那一句**（用例标题，me-screen.spec.tsx:2083）：
  `M-03 「登录」/「注册」都落 #/login（已知降级照裁定钉死：不造 #/register）、点击 0 请求`
  改前关键断言（逐字）：`expect(window.location.hash).toBe('#/login');` + `expect(window.location.hash).not.toContain('register');`（注释：`降级面钉死：注册与登录同一落点（LoginScreen.tsx:83 的 mode 无 URL 驱动入口，T-19g-v 裁定，登记待裁）`）
- **改后这一句**：
  `M-03 「登录」落 #/login、「注册」落 #/register（E5 翻正旧「已知降级」钉）、点击 0 请求`
  改后关键断言：`expect(window.location.hash).toBe('#/register');`（「点击 0 请求」`expect(fetchCalls).toHaveLength(before)` **原样保留**；并新增 `routeFor('/register').kind === 'gate'` 正向钉）
- **为什么**：旧钉的前提是「路由表只有 /login 一颗 gate、LoginScreen 的 mode 无 URL 驱动入口」——本颗（#47 E5-register，简报 §1 病灶 1~7 实证）就是来拆这个前提的：第 12 条 gate 已登记、mode 已由路由派生且被 H-01/FU24① 正向钉死。前提消失 ⇒ 反向哨翻正。「不悄悄改绿」：本节 + 改后代码内两行注释就地申报了改前原文与理由。

---

## 六条出口命令 —— 逐条实跑结果（日志均在 `e5reg\logs\`）

| # | 命令 | 时刻（date 实测） | 结果 |
|---|---|---|---|
| 1 | `node tools/boundaries.mjs --check-ownership --task E5-register --diff-file C:\Users\曹怡明\AppData\Local\Temp\e5reg\e5-register.patch` | 05:06:04（首跑 05:02:14 亦 0） | **exit 0**。尾行：`--check-ownership task=E5-register 触碰 13 个在册文件（清单 0 项 + patch 13 项） → 无越界`（日志 `a103-ownership-check.log`） |
| 2 | `pnpm --filter @tm/app typecheck` / `pnpm --filter @tm/shared typecheck` | 05:07:07→05:07:14（首轮 04:58:58→04:59:05） | **双双 exit 0**（日志 `t1-app-typecheck.log`/`t1-shared-typecheck.log`/`t1-typecheck.log`） |
| 3 | `pnpm --filter @tm/app test` | 05:05:33→05:05:53 | **exit 0**：`Test Files 18 passed (18)` / `Tests 472 passed (472)`。对账：基线 470 + 净增 2（H-01、H-02；其余为既有用例内新增断言不计数）= 472 ✓（日志 `t3-app-test.log`） |
| 4 | `pnpm -r test` | 05:06:11→05:06:48 | **exit 0**：全仓 `Test Files` 1+3+3+18+21+1 = **47 files**；`Tests` 68+39+168+472+446+16 = **1209 passed | 1 skipped**。对账：基线 1207+1skipped，+2 = App 面净增 2 颗，无新红（日志 `t2-root-test.log`） |
| 5 | `node tools/boundaries.mjs --all` | 05:04:11 首跑、05:07:2x 终盘复跑 | **exit 0 / `21/21 条通过，全绿`**（`route-string-preserved` 只扫 `packages/server/src/routes`，本轮 0 触碰；日志 `t6-boundaries-all.log`） |
| 6 | 收工两证 | 05:07:24 | 见下节，**全 OK / 命中 13 颗全归因**（日志 `t7-close-two-proofs.log`） |

### scoped patch 逐颗 +/- 行数（boundaries 按实际 diff 判定行，原文自 `a103-ownership-check.log`）

| 文件 | patch 实际 | 额度 |
|---|---|---|
| src/lib/auth-store.ts | +3/-0 | 10 ✓ |
| src/router.tsx | +3/-1 | 10 ✓ |
| src/screens/LoginScreen.tsx | +10/-2 | 24 ✓ |
| src/screens/MeScreen.tsx | +6/-9 | 16 ✓ |
| src/screens/StudyScreen.tsx | +3/-3 | 10 ✓ |
| src/screens/WordbookScreen.tsx | +4/-2 | 12 ✓ |
| src/screens/CompletionScreen.tsx | +1/-1 | 8 ✓ |
| test/router.spec.tsx | +25/-9 =34 | 34 ✓（贴满未超） |
| test/login-screen.spec.tsx | +32/-0 | 36 ✓ |
| test/me-screen.spec.tsx | +6/-5 | 24 ✓ |
| test/study-screen.spec.tsx | +3/-1 | 14 ✓ |
| test/completion-screen.spec.tsx | +1/-1 | 10 ✓ |
| test/wordbook-screen.spec.tsx | +2/-2 | 14 ✓ |

## §3-6 收工两证（原文片段，ANSI 已剥）

```
$ sha256sum -c（真库三颗 + ownership + package.json + vitest.workspace.ts） @ 2026-09-26 05:07:24
data.db: OK
data.db-shm: OK
data.db-wal: OK
tools/ownership.json: OK
package.json: OK
vitest.workspace.ts: OK
（另以 sha256 前 12 比对简报 §0-1 给定值：6595517661cc / 2bceb8907276 / 88ed3fe2b2ce / 74b7b6214b7a 全 MATCH；
 package.json mtime=2026-09-19、vitest.workspace.ts mtime=2026-09-19，均早于开工时刻，非我面。）

$ find apps packages tools -type f -newermt '2026-09-26 04:46:06'（剪 node_modules/dist/.next/coverage/tsbuildinfo） @ 2026-09-26 05:07:24
apps/app/src/lib/auth-store.ts          ← 13 颗通道
apps/app/src/router.tsx                 ← 同上
apps/app/src/screens/CompletionScreen.tsx
apps/app/src/screens/LoginScreen.tsx
apps/app/src/screens/MeScreen.tsx
apps/app/src/screens/StudyScreen.tsx
apps/app/src/screens/WordbookScreen.tsx
apps/app/test/completion-screen.spec.tsx
apps/app/test/login-screen.spec.tsx
apps/app/test/me-screen.spec.tsx
apps/app/test/router.spec.tsx
apps/app/test/study-screen.spec.tsx
apps/app/test/wordbook-screen.spec.tsx
命中 13 / 通道 13 / 无归因外文件 = 0。（本报告的 .delivery/04-dev-report-E5-register.md 在 find 目录之外，§3-6 口径不含它。）
```

## §4-1 必红探针（绿配红，实测非声称）

操作：`cp pre/.../LoginScreen.tsx → 现盘`（临时换回改前那颗，盘上 sha12 复点 = `bc106a61d2dc` 与 pre manifest 逐字吻合），只跑新增的 H 组两颗：

```
$ pnpm --filter @tm/app exec vitest run --root ../.. --project @tm/app test/login-screen.spec.tsx -t "路由派生的 mode 初值"   @ 05:02:36→05:02:40
AssertionError: expected '手机号登录' to be '注册新账号' // Object.is equality
 FAIL   @tm/app  test/login-screen.spec.tsx > H 组 · 路由派生的 mode 初值 > H-01 `#/register`：首屏即注册态 —— 标题/提交钮串 = AUTH_COPY 注册常量、协议勾选件在、0 请求
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 24 skipped (26)        ← 探针 exit 1，日志 t4-probe-red.log
```

（红得正是病灶：改前屏对 `#/register` 画的是默认登录态。H-02 在旧屏上本就是绿的 —— 它钉的是"不许翻面"的反方向，符合预期，如实报。）

还原复跑（05:02:49，日志 `t5-probe-green-restored.log`）：

```
restored-run exit=0
 Test Files  1 passed (1)
      Tests  2 passed | 24 skipped (26)
盘上 sha12 复点 = 8f542dc1551f（= 最终值，探针未残留；最终盘面随后又被 18/472 全量跑与 patch 复点各自背书）
```

## §4-2 F-62 候选（只登记事实与行号，本颗 ⛔ 顺手修）

以下参数同样无人读（简报 §1-3 实证 `LoginScreen` 全文 0 处读 query；本颗清掉的只有 `mode=` 一族）：

| 参数族 | 发送方（file:line，改后现值） | 状态 |
|---|---|---|
| `from=`（登录/注册两条都还带） | StudyScreen.tsx:619、:623（`from=study`）；CompletionScreen.tsx:187（`from=study`）；WordbookScreen.tsx:653-654（`from=wordbook`） | 屏侧无人读，本颗按简报原样保留 |
| `intent=favorite&word=` | apps/app/src/components/result-row.tsx:376（`LOGIN_ROUTE?intent=favorite&word=…`） | 未动（简报明令） |
| `intent=study&word=` | apps/app/src/screens/WordDetailScreen.tsx:231 | 未动（简报明令） |
| （附注）`/login` 第二份字面量 | apps/app/src/data/rest-fetcher.ts:133 `goto('/login')` | 通道外文件，未动；简报 §1-8 点名的 WordbookScreen.tsx:652 那颗本颗已上收引常量 |

归属待 TPM 裁决。

## 待裁 / 未尽 / 未实测

**待裁**
- **W-1** 件A「`/register` 字面量全仓 1 处」的口径：我按「生产面（apps/app/src）1 处」执行并出证（auth-store.ts:50）。用例侧：router.spec / login-screen.spec 全部引 `REGISTER_ROUTE` 常量；me-screen/study/completion/wordbook 四颗 spec 的期望串用了 `'#/register'` 字面量（断言字符串与 hash 直读形状一致、且这四颗的通道 reason 未强制引常量）。若 TPM 要求测试面也单点，增量在 me(±2)/study(±1)/wordbook(±1) 三颗内可容纳，router.spec 额度 34 已用满需 +1~2 行 —— **请裁是否补**。
- **W-2** router.tsx `:39-42` 文件头注释块（「本任务只交懒加载占位」「per_file 把 10 个文件分别记给 T-17/T-18/T-19」）是 A-22 轮历史流水账，现与盘面（12 条全真屏）部分过期。非我通道内额度充裕度所趋、且简报件B 未点名 ⇒ 未改。是否清，请裁。
- **W-3** StudyScreen.tsx:83 的 FU24② 注释（「登录落点引 LOGIN_ROUTE 单点」）仍只述登录一颗；常量已双份。改写要 +1/-1 行（通道余量在），但简报件D 未点名 ⇒ 未动，登记。
- **W-4** `#/register` 是否需要进 `ROUTE_ALIASES`（如外部入口给 `signup` 之类旧口径）——简报明令 ⛔ 动 ROUTE_ALIASES，未加；若产品侧有该入口需求另案。

**未实测（如实报）**
- **U-1** 真机 Android WebView Chrome 84 内的 hash→mode 手测：本轮全部证据在 jsdom（vitest）面；产物未重新装机跑过（简报档位判据不含装机，登记为未实测）。
- **U-2** `/register` 在 `GateLayout` 下的运行时形状（`data-locked="0"`）：只按简报 §1 的既定事实 + `routeFor('/register').kind==='gate'` 静态钉推定，未跑运行时断言（⛔ 禁改 main.tsx/GateLayout ⇒ 加不了这颗钉而不越界）。

**未尽**：无 —— 件A~件E 五件全部落地，六条出口命令全部 exit 0（含两轮终盘复跑）。

## 时间线（全部 `date` 实测）

- 04:46:06 开工 pre 复点 `ALL MATCH`（logs/00-precheck-sha.log）
- 04:46~05:01 13 颗通道编辑（原子写：harness 整文件替换 + 探针处 `cp→tmp 再 mv`）
- 04:58:25 额度自检 ALL WITHIN CAP；04:58:58→04:59:05 typecheck 双 0
- 04:59:09→04:59:30 App test 首轮 1 红（Vite URL 改写坑）⇒ 修复
- 05:01:33→05:01:53 App test 复跑 18/472 绿
- 05:02:14 patch 重建 + ownership exit 0（首轮）
- 05:02:26→05:02:40 必红探针（pre 屏上 H-01 红）；05:02:49 还原复跑绿
- 05:03:00→05:03:39 `pnpm -r test` exit 0
- 05:04:11 `boundaries --all` exit 0
- 05:05:33→05:05:53 H-02 增补后 App test 终跑 18/472 绿
- 05:06:04 patch 终版重建（408 行）+ ownership 终判 exit 0
- 05:06:11→05:06:48 `pnpm -r test` 终盘复跑 exit 0（47 files / 1209 passed + 1 skipped）
- 05:07:07→05:07:14 typecheck 终盘复跑双 0；05:07:2x boundaries --all 复跑 21/21
- 05:07:24 收工两证（sha256sum -c 全 OK；find 命中 13 颗全归因）
- 05:09:52 本报告落盘 `.delivery/04-dev-report-E5-register.md`（实测 `date` 05:09:5x，盘面终核 05:09:57：13 颗 sha = post-manifest、patch 基线与盘面一致、wal 仍 424392 B）
