# 开发报告 T-19a（批次4D 第一路 · App 账号域地基轮）

任务代号：**T-19a** ｜ 依据：§10.2 T-19 行 + **A-44 #83/#84/#85**（本轮只承 **判据②** 与 **判据⑧**，**不写任何屏**）
轮次开始时间：`2026-09-21 01:22`（Git Bash `date` 原文：`Mon Sep 21 01:22:31 2026`）
仓库根：`E:\CC\tomorrow-memory`（Windows + Git Bash）

---

## 1. 交付物清单（文件 + 行数）

| 文件 | 行数 | 性质 | 一句话职责 |
|---|---:|---|---|
| 🆕 `apps/app/src/lib/auth-store.ts` | **321** | App 侧登录态**单一真值源**（订阅式 store） | 快照 + 订阅 + `signIn`/`signOut`/gate 判定 + React 钩子；**无 HTTP 状态码分支** |
| 🆕 `apps/app/src/lib/token-bridge.ts` | **114** | `native/bridge.ts` 的**薄封装** | token / 身份 / 临时 token 的读写清转发 + 原生桥缺失的降级口径（**只诊断、不判成败**） |
| 🆕 `apps/app/test/auth-store.spec.ts` | **519** | 判据②⑧ 的可测面（26 条用例，6 个 `describe`） | 含 4 条**源码级红线机检**（不引路由 / 不发 fetch / 无第二份 401 / Chrome84 API） |

`apps/app/src/lib/` 目录本轮**从零新建**（A-44 #83 实测结论，未复核、直接照此实现）。

**store 的对外面（下游五轮的全部入口）**：
读：`getAuthSnapshot()` / `subscribeAuth()` / `useAuthSnapshot()` / `useSignedIn()` / `isSignedIn()` / `businessRequestGate()` / `runWhenSignedIn()`
写：`signIn(facts)` / `signOut()` / `afterPasswordChanged(facts?)` / `refreshFromStorage()` / `notePasswordUpgradeRequired()`
接线：`attachAuthSignals()`
续作：`rememberPendingAction()` / `peekPendingAction()` / `takePendingAction()`
常量：`LOGIN_ROUTE = '/login'`、`UPGRADE_PASSWORD_ROUTE = '/upgrade-password'`
`token-bridge` 面：`SESSION_KEYS` / `tokenChannel()` / `currentToken()` / `hasStoredToken()` / `saveSessionToken()` / `readStoredIdentity()` / `saveIdentity()` / `clearStoredSession()` / `saveUpgradeToken()` / `currentUpgradeToken()` / `hasUpgradeToken()` / `clearUpgradeToken()`

**形状对齐（不改 `host.tsx` / `shell/**` 的前提下）**：快照是**不可变引用** + `Set<() => void>` 订阅 + `subscribe` 返回解绑函数，与 `host.tsx:94` 的 `useSyncExternalStore(subscribeToasts, getToasts, getToasts)` **逐字同形**；也与 `data/startup.ts` 的 `subscribeSyncStatus/getSyncStatus`、`router.tsx` 的 `subscribe/getLocation` 同套路。`useAuthSnapshot()` 的 server snapshot 直接给同一份当前值 —— App 是 `file://` 无 SSR，不存在 Web 那套 `idle → authed` 中间帧（R-23② 是 Web 面的事）。

---

## 2. 判据② / 判据⑧ 对账表

判据原文：
**② 注册/激活成功即 `AndroidBridge.saveToken`（R-39⑧），无二次登录**
**⑧ 401 单点清凭据并跳登录（走 T-14 的 `rest-fetcher`）**

| 判据 | 用例名（`apps/app/test/auth-store.spec.ts`） | 断言要点 | 结果 |
|---|---|---|---|
| ② | `登录成功：token 一次落到桥 + localStorage 双写，返回的那一帧快照已是 signed-in` | `saveToken` **恰好 1 次**且入参 = token；`tm.token`/`tm.phone`/`tm.nickname` 三键同帧落盘；**一次动作 = 一次订阅通知**（`snapshots` 长度 1，无需第二次登录调用） | ✅ |
| ② | `注册与激活（activated:true）共用同一个落点：仍然只调一次 saveToken` | 新建支与激活支各只 1 次 `saveToken`（R-39① 的"三出口单点"在客户端的镜像） | ✅ |
| ② | `原生桥缺失时降级：不抛、localStorage 仍写得到，快照照常 signed-in（§5.6①）` | `tokenChannel()==='storage'`；桥整个不存在时 `signIn` 不抛、状态照常进门 | ✅ |
| ② | `upgrade_required + 空 token：绝不签发正常凭据，只落临时 token（R-40④）` | `saveToken` **0 次**、`saveTempToken('tmp-1')` 1 次、`tm.token` 仍为 `null`、快照 `upgradeSessionOnly:true` 且手机号仍回显 | ✅ |
| ② | `登录后临时 token 必须作废：两把钥匙不同时存在` | 拿到正常 token 后 `clearTempToken` **恰好 1 次**、`currentUpgradeToken()===''` | ✅ |
| ② | `改密成功（afterPasswordChanged）：临时凭据清掉，带新 token 就直接进门` | 带新 token 即 `signed-in`，`tm.tempToken` 已 `null`，`upgradeRequired` 归零 | ✅ |
| ② | `单一真值源对账：store 与 rest-fetcher 的 hasCredential() 永远同一结论` | 三态（未登录/登录后/退出后）两个读点结论逐次相等 ⇒ 地基件**不改变判定**，只加订阅面 | ✅ |
| ⑧ | `handleAuthError 命中 401 → 快照转 signed-out、身份回显清空，且清点只发生一次` | **`bridge.clearToken` 恰好 1 次**（"单点"的计数证据：store 没有再清第二次）；三键清空；**订阅只通知 1 次** | ✅ |
| ⑧ | `跳登录由 rest-fetcher 执行到 /login；store 只提供常量，本身不 import router` | `bindNavigation` 的 spy 收到 `['/login']`；常量值逐字为 `/login`、`/upgrade-password` | ✅ |
| ⑧ | `走完整请求链路的 401（真走 T-14 的 rest-fetcher）：抛 ApiError + 一次登出 + 一次跳登录` | `apiGet` 抛 401 `ApiError` 的同时：快照翻转 + `clearToken` 1 次 + 通知 1 次 + 跳 `/login` 1 次 | ✅ |
| ⑧ | `三条并发 401 → 只清一次、只通知一次（"单点"的并发面落到 store 上）` | 三条 `apiGet` 并发 401：`clearToken` **1 次**、订阅通知 **1 次**、路由 **1 条** | ✅ |
| ⑧ | `403 PASSWORD_UPGRADE_REQUIRED → 凭据保留、upgradeRequired 置位、目标是改密页` | `clearToken` **0 次**、快照仍 `signed-in` 但 `upgradeRequired:true` / `upgradeSessionOnly:false`，路由 `/upgrade-password`（与 T-14 判据④-2 口径一致） | ✅ |
| ⑧ | `主动退出登录：token/手机号/昵称/临时 token 一次清干净，并回跳转目标常量` | `signOut()` 返回 `LOGIN_ROUTE`；四键全空、内存位归零 | ✅ |
| ⑧ | `未接线时也不会失同步：refreshFromStorage() 手动对齐即可（同源读点）` | 断开订阅后屏可自行对齐，且与 `hasCredential()` 同结论 | ✅ |
| ⑧ | `对齐 Java 的 SharedPreferences → localStorage 回灌（§5.6 第 2 行的时序）` | 晚于首帧的回灌只靠 `refreshFromStorage()` 一次调用即进门（不清、不重发） | ✅ |
| 无 token 不发请求（判据⑧ 前半句） | `未登录：gate 判否 + 目标是 /login，runWhenSignedIn 一次都不执行任务体` | `vi.fn()` 任务体 **0 次调用** ⇒ 一个请求都不发 | ✅ |
| 同上 | `只有临时凭据（强制改密门禁）：目标是 /upgrade-password，不是 /login` | gate 目标按凭据种类分叉，且**只写常量** | ✅ |
| 同上 | `登录后放行、退出后再判否（同一把尺子，不是两套判定）` | 放行/拦截与快照同源 | ✅ |
| 形状 | `getAuthSnapshot 稳定引用…` / `解绑后不再收到通知；某个订阅方抛错不反噬其他订阅方` | `Object.is` 稳定性（防渲染死循环）+ 解绑 + 抛错隔离（与 `host.tsx`/`startup.ts` 同口径） | ✅ |
| 形状 | `待续作动作：签到不冲掉它，取出即清，退出登录一并作废（R-16② / R-39⑧）` | `signIn` 保留 `pendingAction`（"待收藏自动完成"才有料可续） | ✅ |
| 形状 | `notePasswordUpgradeRequired 只动告知位，不碰任何凭据` | 软告知位与清点解耦 | ✅ |
| 红线 | `两个新文件都不 import router / 不发 fetch / 不判 HTTP 状态码与认证错误码` | `codeOnly()` 后 0 命中：`from '../router.js'`、`fetch(`、`=== 40[13]`、`CREDENTIAL_EXPIRED`/`PASSWORD_UPGRADE_REQUIRED`/`handleAuthError(` | ✅ |
| 红线 | `auth-store 只从 rest-fetcher 引 onAuthSignal 一个符号（接线面收窄到订阅）` | import 列表**逐字** `['onAuthSignal']` | ✅ |
| 红线 | `两个新文件都不用禁不掉就白屏的四个 API（…）` | `structuredClone(`、`Object.hasOwn(`、`requestIdleCallback`、`.at(` **0 命中** | ✅ |
| 红线 | `判据⑧ 的"走 T-14 的 rest-fetcher"是订阅不是改写：本 spec 只调它已导出的面` | 只用 `handleAuthError`/`resetAuthHandling`/`onAuthSignal` 三个既有导出 | ✅ |

**26 passed / 0 failed**（本 spec 单跑亦 26/26，见 §4）。

---

## 3. 与 `rest-fetcher` 的接线契约（`rest-fetcher.ts` **一字未改**）

### 3.1 我留了什么注入点
注入点是**订阅**，不是回调注册表 —— 因为 T-14 早已把广播面导出了：

```
data/rest-fetcher.ts（未改动）            lib/auth-store.ts（本轮新建）
  handleAuthError(401,'CREDENTIAL_EXPIRED')   attachAuthSignals()
    ├─ clearCredential()   ← 全仓唯一清点         └─ onAuthSignal(listener)  ← 既有导出，就是这里
    ├─ emit('sign-out')  ────────────────────────┘   ├─ 'sign-out'                   → refreshFromStorage()（只读对齐，不再清）
    └─ goto('/login')                                 └─ 'password-upgrade-required' → notePasswordUpgradeRequired(true)（只动内存位）
```

- 我没有新增 `setOnCredentialCleared(handler)` 这类**第二条**回调通道：`onAuthSignal` 已经是 `main.tsx:138` 在用的那一条（`bindNavigation` + `onAuthSignal` 两处接线是 T-14 交付物）。再加一条就出现了"登出有两个人喊"的第二个真值源。
- 幂等：`attachAuthSignals()` 带引用计数（多张屏各挂各的，最后一个解绑者才真断开），`rest-fetcher` 的抑制窗口（1500ms）保证同波 401 只广播一次 ⇒ store 只重读一次（用例 `三条并发 401 → 只清一次、只通知一次` 钉住）。

### 3.2 谁在什么时候调用它
**应用入口挂载时调一次**（与 `bindDataLayerNavigation()` 同一位置最自然，即 `main.tsx:136-141`）。本轮**禁改 `main.tsx` / `host.tsx`**，所以接线动作留到批次4D 收口轮（与 A-44 #86 的路由挂载**串行一起做**）。
未接线窗口内 store **不会失真**：`hasToken`/`status` 每次都从 `readToken()` 派生，与 `hasCredential()` 同源，屏可自行调 `refreshFromStorage()` 对齐（用例 `未接线时也不会失同步` 就是这条的判据）。

### 3.3 为什么这不算"第二份 401 处理"
三件事全部留在 `rest-fetcher` 一处，`auth-store` 一件都没有：
1. **判定**：`status===401 && code==='CREDENTIAL_EXPIRED'` 与 `TM_ERRORS[code].clientAction` 的查表 ⇒ 机检用例证明 `auth-store.ts`/`token-bridge.ts` 代码面 0 命中 `=== 40x`、两个认证错误码字面量、`handleAuthError(`；
2. **清凭据**：`clearCredential()` 仍是唯一清点，store 的 `signOut()` 只是**转发**它（主动退出这条用户动作路径），401 路径上 store **只读不清**（机检证据：`clearToken` 恰好 1 次）；
3. **跳转**：`goto('/login')` 仍由 `rest-fetcher` 执行；store 只导出 `LOGIN_ROUTE` 常量供屏在自己主动动作里用（不 import `router.tsx`，避免成环并兑现 #86）。
import 面也被钉死为**一个符号**（`onAuthSignal`），所以"store 顺手把 401 处理抄回来"在源码级就会红。

---

## 4. 出口命令原文与摘要

```
$ pnpm --filter @tm/app typecheck && pnpm --filter @tm/app test
$ tsc -p tsconfig.json --noEmit        # ← 0 错
...
 Test Files  1 failed | 12 passed (13)
      Tests  1 failed | 267 passed (268)
   Duration  15.45s
```

- `typecheck`：**0 错**（一次通过）。
- `test`：**267 passed / 1 failed（13 文件）**。失败那一条**不是本轮的**，见 §5。
- 本轮的 26 条全绿，单独复跑：`Test Files 1 passed (1) / Tests 26 passed (26)`。
- 基线对账：简报给的基线 239 passed / 12 文件 ⇒ 239 + 26 = 265；实际总数 268 = 265 + 3，**多出的 3 条来自并发轮次**（见 §5），本文件（`auth-store.spec.ts`）之外的用例数与文件数都在动。
- 迭代过程里为定位假桥语义共跑了两次 `pnpm exec vitest run --project @tm/app auth-store`（**仓库根 + `--project`**，未裸跑 `npx vitest run`，因此没有出现 104 条 localStorage 假红）。

---

## 5. ⚠ 并发点名（非我名下、我没改）

唯一的一条红：

```
FAIL  @tm/app  test/wordbook-screen.spec.tsx > §3.6.5 空 / 加载 / 错误 > C-25 未登录：0 词本请求，骨架 + 引导卡并存；主按钮 `手机号登录`、文字链 `没有账号？注册`
AssertionError: expected '#/' to be '#/login?mode=register&from=wordbook'
 ❯ test/wordbook-screen.spec.tsx:997:34
```

**判定：属并发写入，不由 T-19a 引起、也不由 T-19a 修**。证据（`ls -l --time-style=+%F_%T`）：

```
-rw-r--r-- 1 曹怡明 197121 28032 2026-09-21_01:25:34 apps/app/src/screens/WordbookScreen.tsx
-rw-r--r-- 1 曹怡明 197121 50912 2026-09-21_01:27:09 apps/app/test/wordbook-screen.spec.tsx
```

两处 mtime 都落在本轮窗口内（本轮 01:22 开始），但**都不是我名下的文件**（我只写 `src/lib/*` 与 `test/auth-store.spec.ts`）。该失败断言的期望值是 `#/login?mode=register&from=wordbook` —— 屏侧自造的登录引导跳转参数，与 `auth-store` 无任何 import 关系（`grep -rn "lib/auth-store\|lib/token-bridge" apps/app/src` 除本轮三件外 0 命中）。⇒ 已在 §7 登记为上报未修 U-1，交 TPM 与那一路（词本登录引导）串行核对。

---

## 6. "未改任何既有文件"的自证

`find` 原文（`2026-09-21 01:20` = 本轮开始时间之前的一分钟，取整便于复核）：

```
$ find apps/app/src -newermt "2026-09-21 01:20" -type f
apps/app/src/components/result-row.tsx
apps/app/src/components/wordbook-toolbar.tsx
apps/app/src/lib/auth-store.ts
apps/app/src/lib/token-bridge.ts
apps/app/src/screens/WordbookScreen.tsx

$ find apps/app/test -newermt "2026-09-21 01:20" -type f
apps/app/test/auth-store.spec.ts
apps/app/test/lookup-screen.spec.tsx
apps/app/test/wordbook-screen.spec.tsx
```

**逐行归因**：
- `src/lib/auth-store.ts`、`src/lib/token-bridge.ts`、`test/auth-store.spec.ts` = 本轮三件交付物（全部新建，落在简报允许的白名单内）。
- `src/components/result-row.tsx`、`src/components/wordbook-toolbar.tsx`、`src/screens/WordbookScreen.tsx`、`test/lookup-screen.spec.tsx`、`test/wordbook-screen.spec.tsx` = **并发 agent 的写入**（§5 的 mtime 与 §5 的红同向）；本轮对它们的 mtime 变化**只读不改**。
- 关键反证：`router.tsx`、`native/bridge.ts`、`data/**`（含 `rest-fetcher.ts`/`offline-queue.ts`）、`host.tsx`、`shell/**`、`packages/**`、`apps/web/**`、`scripts/**` **一条都不在输出里** ⇒ 禁改清单逐条成立。

---

## 7. 上报未修（含留给 T-19b~f 的接口清单）

### U-1（并发，非本轮缺陷）
`wordbook-screen.spec.tsx` 的 `C-25` 一条红（§5）。请 TPM 与词本那一路核对该断言的期望串（`#/login?mode=register&from=wordbook`）是否要经 `auth-store` 的 `LOGIN_ROUTE` —— 若要用，宜在 T-19b 之后统一改，而不是让两路同时改 `screens/WordbookScreen.tsx`。

### U-2（本轮**未做**接线：受禁改清单约束，需要 TPM 排一次串行收口）
`attachAuthSignals()` 目前**没有任何生产调用点**（唯一调用者是 `test/auth-store.spec.ts`）。落点应是 `main.tsx` 的 `bindDataLayerNavigation()` 内（约 `:134-141`，与既有 `onAuthSignal` 那处并列）。**代价明示**：不接线时屏仍可自行 `refreshFromStorage()` 对齐（有判据），但"别人把用户踢下线"这件事不会自动触发重渲染。**不许**为省这一步而在屏里各挂一次 `onAuthSignal`（那才是第二份处理）。

### U-3（接口清单：五屏轮各自需要什么）
| 轮 | 屏 | 从本轮地基拿什么 | 本轮**没有**给、需要该轮自建或提需求 |
|---|---|---|---|
| **T-19b** | `LoginScreen.tsx`（判据①⑨） | `signIn(facts)`（登录/注册/激活**同一个落点**）、`takePendingAction()`（R-16② 待收藏续作）、`UPGRADE_PASSWORD_ROUTE`/`LOGIN_ROUTE`、`AuthSnapshot.phone` 回显（`activated` 支不新增第三态，R-39⑨） | 表单本体仍走 `@tm/ui/auth/AuthFormShell`（**不另写一套**）；`POST /api/login`、`POST /api/register` 的 `data/queries/auth.ts` **本轮无授权**（`data/**` 禁改）⇒ 该轮需 TPM 单开一次 `data/queries/auth.ts` 授权，或在屏内暂用 `apiPost` |
| **T-19c** | `UpgradePasswordScreen.tsx`（判据③） | `AuthSnapshot.upgradeSessionOnly`（提交前提）、`currentUpgradeToken()`、`afterPasswordChanged(facts?)`、`UPGRADE_PASSWORD_ROUTE` 常量、`GateLayout` 的 `header` 手机号（`AuthSnapshot.phone` 在只有临时凭据时也回显） | 物理返回键 `canGoBack()===false` 属 `router.tsx`/T-20 面（本轮不碰）；tab 栏隐藏由 `Shell` 的 `kind==='gate'` 决定，已在 `main.tsx:53-62` |
| **T-19d** | `SecurityScreen.tsx`（判据④） | `AuthSnapshot.phone/nickname`、`signOut()`（"退出登录"动作，回 `LOGIN_ROUTE`）、`notePasswordUpgradeRequired(false)`（改密成功后清告知位） | `PUT /api/password` 同 U-3 T-19b 的 queries 缺口；改密表单**必须**复用 `@tm/ui/auth/ChangePasswordForm`（A-44 #85① 已解除，A-45 #93） |
| **T-19e** | `MeScreen.tsx`（判据⑤） | `useAuthSnapshot()`/`useSignedIn()`（未登录引导）、`signOut()`、`businessRequestGate()`（三卡数字点击前的放行判定） | 每日目标滑杆 + 保存 + toast 的数据面（`GET/PUT /api/profile`）不在本轮；头像：见 L-2 |
| **T-19f** | `AboutScreen.tsx`（判据⑥⑦） | `businessRequestGate()`、`AuthSnapshot.status`（"当前登录方式"公告在未登录也须可读 ⇒ 屏**不得**被 gate 拦住） | 文案**必须** import 自 `@tm/shared/constants/notice.ts`；"有新版本"复用 `data/startup.ts` 的 `getPendingVersionPrompt`/`subscribeVersionPrompt`/`dismissVersionPrompt`（24h 抑制已实现，**不要重写**） |

### U-4（本轮的三处刻意取舍，请 QA 判"可接受"而不是"漏做"）
1. **标志位不落盘**：`upgradeRequired`（含软告知位）只从"登录响应 / 403 广播"推导。落盘需要一个 `tm.*` 新键，而清点的唯一函数 `clearCredential()` 在 `native/bridge.ts`（本轮禁改）⇒ 落盘会留下"退出登录清不掉的门禁位"，比不落盘严重。**代价**：强制改密会话中途杀进程，冷启动会落回登录页（`upgradeSessionOnly` 由 `tm.tempToken` 派生，仍正确），而不是直达改密页。
2. **`pendingAction` 只在内存**：同理，登录页与应用同处一个 JS 上下文（hash 路由，不重载），落盘多一个清点管不到的键。
3. **`avatar` 不持久化**：`native/bridge.ts` 只有 token/phone/nickname 三键，加第四键必然绕开 `clearCredential()`。屏的头像请读 `/api/profile` 派生数据，或由 TPM 授权在 `bridge.ts` 加 `AVATAR_KEY` **并同时纳入 `clearCredential()`**（一处改完，别在 lib 里私自加）。

---

## 8. 遗留清单

| # | 事项 | 归属建议 |
|---|---|---|
| L-1 | `attachAuthSignals()` 无生产调用点（= U-2），批次4D 收口轮与 `router.tsx` 五行挂载**同一次串行**做完 | TPM |
| L-2 | `avatar` 无持久化位（= U-4.3）；`MeScreen`/`AboutScreen` 若要求冷启动首帧就有头像，需授权改 `native/bridge.ts` 的键与清点 | T-19e / TPM |
| L-3 | 登录/注册/改密三个接口在 App 侧**没有 queries 文件**（`data/queries/auth.ts` 不存在，`data/**` 禁改）⇒ T-19b/c/d 的 `apiPost` 调用形态需要一次显式授权，否则三张屏会各写一份 fetch 封装（正是要避免的重复） | TPM（批次4D 派发前） |
| L-4 | `main.tsx:133-134` 的 `LOGIN_PATH`/`UPGRADE_PASSWORD_PATH` 与本轮 `LOGIN_ROUTE`/`UPGRADE_PASSWORD_ROUTE` **同值两处**（`main.tsx` 禁改）。L-1 接线那轮顺手统一为一处（用 lib 的常量），本轮不动 | TPM（与 L-1 同轮） |
| L-5 | 判据②的完整形态要等**注册接口**接上才能端到端复现（本轮测的是"成功响应 → `saveToken`"这一段，服务端那一段归 T-07 已交付并有用例）；端到端冒烟建议进 T-23 走查清单（PRD §8.3-B） | T-19b + T-23 |
| L-6 | `kvSet` 的 boolean 返回值在 token/flags 面**一律未判**（A-47 与 #99 口径：本期只有离线队列判成败）。若后续要"写失败要给 toast"，那是**新的裁决**，不是本轮的漏做 | 记 open_items 观察 |
| L-7 | `tools/ownership.json:971` 把 `apps/app/src/lib/{auth-store,token-bridge}.ts` 记在 T-19 名下（本轮交付，无需改账）；`test/auth-store.spec.ts` 该账上记的是 `test/account.spec.tsx` ⇒ 五屏轮各自的 spec 名与 spec 落点仍需 TPM 在派发时逐轮点名（A-44 #84 只写了屏，没写 spec 文件名） | TPM |
