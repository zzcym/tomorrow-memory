242 .delivery/04-dev-report-T-19-c.md

# T-19c 交付报告 — App 强制改密全屏 `UpgradePasswordScreen`（批次4 / A-44 #84 的 T-19 拆分）

日期：2026-09-21　施工方：T-19c　PRD R-40④ / UI §3.9.4 + §3.9.5 + §8.3-D 第 13、20 项 / A-44 #84 第 8 条、A-50 #128。
出口命令两条全部亲跑，原样尾行见 §④；`data.db` 跑前跑后指纹见 §⑤（未变）。

**一句话**：新增且仅新增 2 个文件（屏 210 行 / spec 910 行 · 41 条用例），复用 T-19a/T-19b 已验收的
`auth-store` / `token-bridge` / `LoginScreen` 同款件与 `@tm/ui` 的 `ForcePasswordUpgradeForm`，
屏内 0 新中文串、0 自画控件、0 第二份凭据落地、0 第二份状态码处理；
`pnpm --filter @tm/app test` = **15 files / 335 tests / 0 failed**（基线 14/294，只增不减），
`pnpm --filter @tm/app typecheck` = **0 errors**。`router.tsx` / `main.tsx` 一字未动（A-44 #86 收口归 TPM）。

---

## ① 新增文件与行数 + 每条出口/判据的源码落点

### 新文件（只有这两个）

| 文件 | 行数 | 职责 |
|---|---|---|
| 🆕`apps/app/src/screens/UpgradePasswordScreen.tsx` | **210** | 薄壳全屏：把 `@tm/ui` 的 `ForcePasswordUpgradeForm` 接到 App 的单点设施上。只管五件——门禁判定、`blockedBackSignal` 反馈、两颗出口、成功换钥匙、成功告知。屏内 0 控件、0 中文字面量、0 存储 API、0 状态码分支。 |
| 🆕`apps/app/test/upgrade-screen.spec.tsx` | **910** | 41 条用例，A 源码哨兵 8 / B 全屏+恰两出口 5 / C 表单不完整 4 / D 成功链 5 / E 失败面 4 / F 退出登录 2 / G 物理返回 5 / H 反向哨 4 / I 访客与工厂 4。宿主形态照本仓既有 spec：`createRoot`+`act` 直渲（真 `GateLayout` 包住以证"无 tab"），`QueryClientProvider`+`UiHostProvider`，只 stub `global.fetch`，禁词/缺串走 `stripComments` 源码扫描。 |

### 改动（不是新文件；每条都在 §⑥ 自查里申报）

| 文件 | 现行数 | 本轮动了几行 / 为什么 |
|---|---|---|
| `apps/app/src/data/queries/auth.ts` | 158 | **+ 强制改密这一件**（T-19b 文件头原话"改密面的 mutation 由需要它的那一轮再加"，那一轮 = 本轮）：`authKeys.forceUpgrade`(:57)、`ForceUpgradeInput`(:125)、`forceUpgradeMutationOptions()`(:140-157) + 头部口径(:1-24)。`ChangePasswordInputSchema` 与 `PUT /api/password` **没有**预写（留给 T-19d）。 |
| `apps/app/src/data/rest-fetcher.ts` | 304 | **一处加法 + 一处改写**：`RequestOptions.bearer?: string`(:153-160，含注释) + 取 token 那一行(:205-206)。**纯传输通道**，值由调用方从 `lib/token-bridge.ts` 现取，这里不读存储、不写存储 ⇒ 不是第二份凭据落地；`bearer` 不给时行为与改前逐字相同。理由见 §⑥-2（不给就没有任何一条路能把一次性 token 送进 Header）。精确增删行数无法用 git 核对（`apps/app/` 未入库），故不报数字。 |
| `apps/app/test/login-screen.spec.tsx` | 653 | **只动 B-02 一处**(:370-375)：T-19b 留的哨兵 `not.toMatch(/ChangePasswordInputSchema\|ForceUpgradeInputSchema\|change-password\|force-upgrade/)` 与本轮交付正面冲突 ⇒ 改成"强制改密工厂/端点各**恰一处**、普通改密面继续禁止"。**用例数不变**（24 条；总数 294 → 335 的差全部来自我的新 spec）。 |

其余仓库文件（`packages/**`、`apps/web/**`、`router.tsx`、`main.tsx`、`tools/ownership.json`、`.delivery/**` 主文档）**零 diff**。
今天这些文件的 mtime 属其它轮次（如 `router.tsx` 01:07、`copy.ts` 03:29、`ownership.json` 03:21），均早于本轮开工（10:34 起）。

### 出口/判据 → 落点（`文件:行号`）

| 判据（来源） | 落点 |
|---|---|
| 全屏 + 底 tab 不渲染（§3.9.4 / R-40④） | 屏本身**不画任何壳**（`UpgradePasswordScreen.tsx:188-209` 只回一块 `div` + 共用件）；壳由 `main.tsx:61` `kind === 'gate'` → `GateLayout`（无 tab 栏），路由行 `router.tsx:60` 早已登记 `kind: 'gate'` ⇒ 本屏对 `router.tsx`/`main.tsx` **零 diff** |
| 物理返回不退出（与 T-20 的 `__router.canGoBack()` 配套） | 后退语义唯一实现 `router.tsx:280` `if (norm === GATE_UPGRADE_PATH) return 'stay'`（不 `back()`、不含 `exit`）；本屏只补"给一次可见反馈"：挂载期装饰 `window.onAndroidBack`(:116-130)，命中 `'stay'` 才 `setBlockedBackSignal(n+1)`(:122)，**原样返回别人的返回值**、解绑时只摘自己那一层(:128)（与 `shell/BackKeyBridge.tsx` 同型、顺序无关）；shake + 焦点回首个字段在共用件内部 `ForcePasswordUpgradeForm.tsx:107-112` |
| 出口①：主按钮 `更新密码并继续` | 串由共用件内部直接引 `AUTH_COPY.forceUpgrade.submit`（`packages/shared/src/constants/copy.ts:654`，`ForcePasswordUpgradeForm.tsx:151`）⇒ 本屏没有传该 prop，也就没有抄第二份的可能 |
| 出口②：居中文字按钮 `退出登录` | `UpgradePasswordScreen.tsx:195` `signOutLabel={AUTH_COPY.forceUpgrade.secondary}`（`copy.ts:655`）+ 行为 `handleSignOut`(:172-176) |
| 两颗串 0 自造、屏内 0 新增中文 | `:192-197`（title/subtitle/notice/secondary + `ARIA.showPassword/hidePassword` 全取常量）、`:152`（成功 toast）、`:180`（成功信息条）；机检 = spec A-02(:334) 剥注释后 CJK 0 命中 |
| 提交 = 既有 mutation（不另起一份） | `:102` `useMutation(forceUpgradeMutationOptions())` → `data/queries/auth.ts:140-157`；调用点 `:159-164`；全仓 `/api/password/force` 唯一次数由 spec A-06(:401) 钉死 |
| 一次性 token 换正常 30 天 token + 回原页，屏侧 0 第二份落地 | `:148` 只调 `afterPasswordChanged(facts)`（落 token / 作废一次性 / 广播全在 `auth-store`）；回跳目标 `:149-150` `takePendingAction()` 的 `open` 路径，无则 `HOME_ROUTE`；离开只经 `leaveTo`(:106-113) |
| 屏内 0 存储 / 0 凭据写 API | `:163` 唯一凭据触碰 = 只读 `currentUpgradeToken()`；`writeToken`/`saveSessionToken`/`clearUpgradeToken`/`clearCredential`/`localStorage`/`AndroidBridge` 全 0 命中（spec A-03(:344)、A-08(:419)） |
| `errorCode` / `serverMessage` / `pending` 接回共用件，服务端原因优先、不得静默（§3.9.5） | `:198-201`；失败态来自 `failureOf(error)`(:81-84) = `ApiError.code` + 既有单点 `apiErrorMessage()`；落点（哪格显示哪句）在 `ChangePasswordForm` 内，屏不重算 |
| 屏内不成第二份状态码处理 | `0` 命中 `=== 40` / `handleAuthError(`（spec A-04(:369)）；401 由 `rest-fetcher` 单点消费（spec E-04(:651) 实测 `window.location.hash === '#/login'`） |
| 成功后 6 秒信息条（`result` 槽由宿主挂） | `:178-182` `NoticeBar`（`testid="upgrade-result-notice"`）+ 常驻时长 `TOAST_LONG_MS`（`limits.ts:134` = 6000，:140-144 到点才 `leaveTo`）；文案 `AUTH_COPY.changePassword.success.reloginNotice`（`copy.ts:676`）。**shared 两串都在 ⇒ 没有留空槽、没有自造**（详见 §⑥-7 的过期注释） |
| 不该在这一页的人 | 派生位 `auth.upgradeSessionOnly`(:92) 判定；换出 `:134-137`（游客→`/login`、已握正常 token→`/`），过渡帧 `:186` 回 `null`（不写骨架文案、不新增串）；`leavingRef`(:100,:108,:135) 保证"离开"只发生一次 |
| Chrome84 / 360dp / §5.1 四禁 | 屏与查询层 0 命中 `structuredClone`/`Object.hasOwn`/`:has()`/`@container`/`text-wrap`/顶层 `await`/`??=`/`||=`/`&&=`（spec A-05(:377) 三文件一起扫）；0 新依赖（`package.json` 未动） |
| 无 `test.fail()` / 不给产品交互件加 `data-testid` / 无 `required` | 全文 0 命中 `test.fail`、0 命中 `required=`；屏内 `data-testid` 只有本屏**自己渲**的两处 —— 包裹层 `upgrade-password-screen`(:189) 与成功信息条 `upgrade-result-notice`(:179 走 `NoticeBar` 的 `testid` prop，Web 宿主 `apps/web/src/app/upgrade-password/page.tsx:186` 同型），**表单里的可交互件一颗 testid 都没加**（`force-upgrade` 是共用件自带），spec 数出口/找字段全靠 DOM 语义（`button`/`[role=status]`/`aria-invalid`/文本），与已验收的 `LoginScreen.tsx:171,173` 同口径 |

---

## ② 接线图：复用了什么、留了什么覆盖槽

```
用户(物理返回键)
  └─ AndroidBridge → window.onAndroidBack            [router.tsx 的 installRouterGlobals() 装的冻结钩子]
        └─ router.handleSystemBack() → 'stay'         [router.tsx:280，GATE_UPGRADE_PATH 专属；不 back()/不 exit]
              └─ 本屏的装饰层                          [UpgradePasswordScreen.tsx:116-130 只装饰、不改返回值、只摘自己那一层]
                    └─ blockedBackSignal++  ──────────► ForcePasswordUpgradeForm(:201)
                                                        └─ shake ≤4px + 焦点回「当前密码」(ui:107-112)

UpgradePasswordScreen（屏 = 只有编排，没有一草一木）
  ├─ useAuthSnapshot()  ← lib/auth-store.ts（不可变快照 + useSyncExternalStore）    :89  派生位 upgradeSessionOnly :92
  ├─ currentUpgradeToken() ← lib/token-bridge.ts（**只读**）                        :163 ┐
  ├─ forceUpgradeMutationOptions() ← data/queries/auth.ts:140                        :102 ├─ 请求
  │     └─ apiPost('/api/password/force',{auth:true,bearer=一次性token})               │      data/rest-fetcher.ts:205-206
  │           └─ 401/403 → 单点 handleAuthError（清凭据 + 去 /login），屏 0 参与        ┘      （屏内 0 命中 `=== 40`）
  ├─ 成功 → afterPasswordChanged(facts)  ← auth-store **唯一**落点（正常 30 天 token + 作废一次性 + 广播）  :148
  │        → takePendingAction() 的 open.path = 回"第 1 步想去的那页"                                        :149-150
  │        → host.toast(AUTH_COPY.changePassword.success.toast) + result 槽常驻 TOAST_LONG_MS 后 leaveTo     :140-152
  ├─ 副出口 → signOut() ← auth-store 唯一清法 → leaveTo('/login')                                              :172-176
  └─ 渲染 <ForcePasswordUpgradeForm>（@tm/ui，只消费不改）                                                      :190-207
        props 实传：testid / title / subtitle / notice / signOutLabel / show·hidePasswordLabel /
                     pending / errorCode / serverMessage / blockedBackSignal / result / onSubmit / onSignOut
        props 留默认（不覆盖 = 共用件自带默认，避免抄第二份）：submitLabel（组件内部引 copy.ts:654）、
                     fieldLabels（copy.ts:656-660）、shake/autofocus 行为、§3.9.5 的码→字段落点
        壳（无 tab / data-locked / min-h-dvh）：main.tsx:61 routeFor(path).kind==='gate' → shell/GateLayout —— 本屏零 diff
```

**屏侧一条都不重写**的东西：token 读写与广播（`auth-store`）、请求与状态码（`rest-fetcher`）、
字段级校验与错误落点（`@tm/ui` `ChangePasswordForm`）、全部文案（`@tm/shared`）。

---

## ③ spec 用例清单（41 条，逐条钉住哪条判据）

| 组 | 用例（`test/upgrade-screen.spec.tsx:行`） | 钉住的判据 |
|---|---|---|
| A 源码哨兵 | A-01(:326) | 屏内不自己画表单：`<input`/`<button`/`<form`/`<label` 各 0 |
| | A-02(:334) | 文案单一源：屏 + 查询层剥注释后 CJK 字面量 0 命中（= 0 新增用户可见中文） |
| | A-03(:344) | 落地单点未扩面：屏内存储 API / 凭据写函数 0 命中；`currentUpgradeToken()` 恰 1、`afterPasswordChanged(` 恰 1、`signOut()` 恰 1 |
| | A-04(:369) | 不成第二份状态码处理：`=== 40`/`handleAuthError(`/`fetch(`/`apiPost(` 全 0 |
| | A-05(:377) | Chrome84 + §5.1 四禁 + 逻辑赋值 + 顶层 `await`：屏 / 查询层 / `rest-fetcher` 三文件 0 命中 |
| | A-06(:401) | `/api/password/force` App 侧唯一次数（只 `data/queries/auth.ts` 一处） |
| | A-07(:408) | 静态禁词：跳过出口族 + §6.6 词 0 命中 |
| | A-08(:419) | `auth-store` 的清凭据仍恰一处，屏未新增第二套清法 |
| B 全屏/两出口 | B-01(:432) | 真 `GateLayout` 包住渲染 ⇒ `routeFor().kind==='gate'`、`tab-shell`/`tab-bar`/`[data-tab]`/`<nav>` 各 0 命中 |
| | B-02(:446) | 读屏与视觉都不出现五个 tab：整棵树 `NAV_ITEMS` 五串 0 命中、0 导航按钮 |
| | B-03(:458) | §8.3-D 第 13 项：`[data-testid=force-upgrade]` 子树可交互出口**恰 2 颗**且顺序 = 主按钮 → 退出登录 |
| | B-04(:474) | 四句串逐字 `=== AUTH_COPY.forceUpgrade.{title,subtitle,notice,secondary}` |
| | B-05(:486) | §3.9.4：进入本页焦点即在「当前密码」 |
| C 不完整不发 | C-01(:496) / C-02(:506) / C-03(:517) | 空表单 / 新密码 <8 位 / 两次不一致 ⇒ **一个请求都不发**、0 跳转、对应格给可读原因、焦点回该格 |
| | C-04(:528) | pending 期间重复提交只 1 个请求（防半途换两把钥匙） |
| D 成功链 | D-01(:548) | Header 带的是一次性 upgrade token；**发出前**正常 token 仍为空 |
| | D-02(:561) | 成功后：一次性凭据作废 + `tm.token` = 新正常 token + toast 一句 + `result` 槽文案逐字 + **6 秒内不跳** |
| | D-03(:580) | `advanceTimersByTimeAsync(TOAST_LONG_MS)` 后才回 `pendingAction.open.path`（第 1 步想去的那页） |
| | D-04(:592) | 无待续作动作回首页；`favorite` 型 pendingAction 不被当路径 |
| | D-05(:602) | 成功前 `result` 槽不渲染（不给假告知） |
| E 失败面 | E-01(:615) | `OLD_PASSWORD_INCORRECT` ⇒ 当前密码格下显示**服务端原因优先**，凭据不动、不跳页 |
| | E-02(:627) | `TEMP_LOCKED` ⇒ 只禁提交 + 定稿句，本页 0 倒计时（§3.9.4 末段） |
| | E-03(:640) | 网络断（契约外无码）⇒ 有可见人话、不静默、仍无第三出口 |
| | E-04(:651) | 401 `CREDENTIAL_EXPIRED` 由 `rest-fetcher` 单点消费 ⇒ 清凭据 + `hash === '#/login'`，屏内 0 参与 |
| F 退出登录 | F-01(:675) | 副出口恰 1 处；点击后两把钥匙一起清、**只跳一次**、0 请求 |
| | F-02(:689) | pending 期间两颗出口同时禁用 |
| G 物理返回 | G-01(:715) | `__router.canGoBack()` 为 true 时返回键仍判 `stay`：不后退、不卸载、`data-nudge="true"` 一次、焦点回首个字段 |
| | G-02(:737) | 连按两次仍不退出、页不卸载（R-40④ 不可关闭） |
| | G-03(:756) | 卸载只摘自己那一层，还原挂载前的钩子（不永久占有 T-20 的冻结入口） |
| | G-04(:768) | 期间别人换过钩子 ⇒ 本屏卸载不把自己的还原盖上去 |
| | G-05(:779) | 对照：同一钩子在非 gate 路径判 `go-back` ⇒ `stay` 是本页专属，不是钩子坏了 |
| H 反向哨 | H-01(:801) | 可见文本 0 命中禁词族（§8.3-D 第 20 项 + §3.9.4 + §6.6 + 旧 APK 行），初始/失败/成功**三帧都扫** |
| | H-02(:822) | 「至少 8 位」唯一豁免：命中可见串逐字等于 shared 定稿句（屏内无一条自造） |
| | H-03(:836) | 结构性无跳过出口：本页可交互动作集合 = 那两颗，「以后再说/稍后再改/下次提醒/宽限期」一颗都没有 |
| | H-04(:847) | 副标题与告知全部取常量；缺串时才留空不渲染 |
| I 访客/工厂 | I-01(:860) | 游客直访：不渲染表单、只去 `/login`、0 请求 |
| | I-02(:868) | 已握正常 token（止血阀 off 的软告知面）：放行走、不清凭据、0 请求 |
| | I-03(:878) | 工厂直调：端点 / 入参形状（`upgradeToken`+`oldPassword` 补在契约之外）/ 响应过 `AuthResultSchema` |
| | I-04(:898) | `bearer` 优先于 `readToken()` 的那一处；`bearer:''` 不回落正常 token ⇒ 本地 `NO_AUTH` |

**存量 spec 只增不减**：`Test Files 15`（基线 14 + 我的 1）、`Tests 335`（基线 294 + 41），0 skipped、0 failed。

---

## ④ 出口命令：原样尾行（只贴真跑出来的）

预算 2 条 = `#1 pnpm --filter @tm/app test`、`#2 pnpm --filter @tm/app typecheck`。
**#1 实跑 4 次、#2 实跑 2 次** ⇒ 超编申报见下表后的清单。

`#1` 最后一次（终态，2026-09-21 10:51，`tail -25` 原样）：

```
   ✓ E 组 · 无障碍 / 禁词 / 判据⑤ / 路由挂载 > P-25 判据⑤：全交互后 0 写请求、URL 只落四张读表、localStorage（含任何存量 daily_goal 键）一字不动  468ms

 Test Files  15 passed (15)
      Tests  335 passed (335)
   Start at  10:51:10
   Duration  15.34s (transform 4.04s, setup 0ms, collect 24.19s, tests 48.04s, environment 18.30s, prepare 3.93s)

EXIT=0
```

`#2` 最后一次（终态，整段就是原样输出，0 错误所以没有第二行）：

```
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0
```

全部运行台账（前 3 次 #1 / 第 1 次 #2 只留计数，**未留原样尾行，故不虚报为原文**）：

| 次序 | 命令 | 结果 |
|---|---|---|
| #1 第 1 次 | `pnpm --filter @tm/app test` | 31 failed / 304 passed（原因：① `login-screen.spec.tsx` B-02 的过期哨兵；② 我把 `GateLayout` 当默认 import——它**没有** default export） |
| #1 第 2 次 | `pnpm --filter @tm/app test` | 3 failed / 332 passed（D-01 断言时机写错、F-01 出现第二次跳转 = 真实缺陷、H-02 误伤 shared 自己的「至少 8 位」） |
| #1 第 3 次 | `pnpm --filter @tm/app test` | 汇总行 `Test Files 15 passed (15)` / `Tests 335 passed (335)` / `Duration 15.50s`，0 failed |
| #1 第 4 次 | `pnpm --filter @tm/app test` | 同上（尾行原文见上），`EXIT=0` |
| #2 第 1 次 | `pnpm --filter @tm/app typecheck` | 0 errors |
| #2 第 2 次 | `pnpm --filter @tm/app typecheck` | 0 errors（尾行原文见上） |

超编清单（除读文件/grep/sed 以外的全部命令）：

- 超编第 1 条 = `#1` 的第 1/2/3 次实跑（迭代修失败用例，未伪装成一次通过）。
- 超编第 2 条 = `#2` 的第 1 次实跑（与第 2 次同结论）。
- 超编第 3 条 = `PYTHONIOENCODING=utf-8 python -c "…sha256…"` ×2：跑前/跑后取 `data.db` 与 `packages/server/data.db` 指纹（只读，`open(...,'rb')`）。
- 超编第 4 条 = `wc -l` 五个文件：量本轮新增/改动的行数。
- 超编第 5 条 = `git diff --stat` / `git status --porcelain`：**只读**核对越界 diff（无任何 git 写操作）。
- 超编第 6 条 = `sed -n` / `grep -n` 读 `router.tsx`、`main.tsx`、`auth-store.ts`、`copy.ts`、`limits.ts`、`ForcePasswordUpgradeForm.tsx` 的行号（为 §①② 的落点定位）。
- 未跑：`apps/web` 的 e2e / Playwright（另一轮正在只读跑，避 `.next` 争用）、裸 `npx vitest run`（已知环境陷阱，非缺陷）。

---

## ⑤ `data.db` 跑前 / 跑后指纹（本轮零写入，mtime 未变）

| 文件 | 大小 (B) | sha256 前 12 | mtime |
|---|---|---|---|
| `data.db`（**真实库，只读**）跑前 = 任务书基线 | 253952 | `6595517661cc` | 2026-09-18 04:05 |
| `data.db` 跑前实测（本轮开工时） | 253952 | `6595517661cc` | 2026-09-18 04:05:38 |
| `data.db` 跑后实测（全部出口命令之后） | 253952 | `6595517661cc` | 2026-09-18 04:05:38 |
| `packages/server/data.db`（只读）跑前 / 跑后 | 0 | `e3b0c44298fc` | 2026-09-17 00:10:53 |

跑前与跑后逐字段相同 ⇒ 本轮对两库**零写入、零 DDL/DML、零 mtime 变化**。
测试期写盘只发生在 jsdom 内存与 `os.tmpdir()` 语义下的 vitest 缓存；spec 里的 localStorage 全为 jsdom 进程内桩，未触真实文件。

---

## ⑥ 上报项：本轮已改（但可能不该我改）/ 缺串 / 该做但越界

1. **任务书的前提与仓库现状不符（已按最小面积补）**：任务书写"提交用 `data/queries/auth.ts` 里**已有**的强制改密 mutation"，实际该文件只有 login/register/sendCode，且文件头明写"改密面的 mutation 由需要它的那一轮再加"。⇒ 我在**既有文件**内补 `forceUpgradeMutationOptions()`（未新建文件、未新建 mutation 第二份），并在头部把它与 T-19d 的普通改密面切清。请 TPM 认可这处口径或指定回退方式。
2. **`rest-fetcher` 加了 `bearer?: string`（改动非新文件，请复核）**：一次性 upgrade 会话下正常 token 按设计恒空，服务端 `middleware/auth.ts` 只认 `Authorization` 头 ⇒ 不给这个通道，App 侧**没有**任何合法路径能打 `POST /api/password/force`。改动是纯加法（默认行为一字未变），不读不写存储，`bearer:''` 显式不回落。若 TPM 认为应换个形状（例如 `RequestOptions.auth: 'session' | 'upgrade'`），我按指示重做。
3. **改了一处别人已验收的 spec 断言**：`login-screen.spec.tsx` B-02 的旧哨兵把"强制改密面"也一起禁了（那是 T-19b 有意留白），与本轮正面冲突 ⇒ 只把该断言改成"工厂/端点各恰一处 + 普通改密继续禁止"，**用例数 24 未变**。行数 642（T-19b 报告口径）→ 653 的差值我无法用 git 核对（`apps/app/` 整目录未入库），我只对上面动的那几行负责。
4. **`退出登录` 不发 `POST /api/logout`**：Web 侧 `upgrade-gate`/登录面的退出会打服务端登出；App 侧 `auth-store.signOut()` 是**本机清凭据**语义（T-19a 已验收），屏照它走。A-32-4 的会话语义（账号与进度都在服务端，本机退出即回登录）满足 §3.9.4 那颗出口的目的，但两端不同形。若要求 App 也发 `auth.logout`，那是 `auth-store`/`rest-fetcher` 的决策，**不在屏里补第二份登出**（禁改文件 + 单点纪律）。
5. **止血阀 `passwordUpgradeEnforce=off` 的软告知面在 App 侧没有落地页**：该形态下用户已握正常 token，本屏把他放行回首页（I-02）。§5.3「我的 → 安全」的普通改密屏属 **T-19d**（`SecurityScreen` + `ChangePasswordInputSchema`），本轮**没有**为它留半句串、半个 mutation。⇒ 强制改密全屏在 App 侧本期只有硬门禁这一支。
6. **过渡帧选了"空帧"而不是骨架**：`:186` 在两 effect 生效前返回 `null`（Web 侧同一支渲 `upgrade-password-bounce` 骨架）。App 侧要渲骨架就得写一句加载文案 = 新串 ⇒ 违反文案单一源；一帧空页换 0 新串，我判定划算，登记供裁决。
7. **`packages/ui/src/auth/ForcePasswordUpgradeForm.tsx` 有**过期 TODO**（禁改文件，未动）**：其注释称副标题与"6 秒常驻信息条"文案"待 shared 补常量"，实际两条都在（`copy.ts:653` subtitle、`copy.ts:676` reloginNotice、`limits.ts:134` `TOAST_LONG_MS`）。⇒ 本轮**没有**留空覆盖槽；请 UI 轮次删掉那条误导性 TODO。
8. **`tools/ownership.json` 的授权缺口（未动，属 E4）**：`apps/app/test/upgrade-screen.spec.tsx` 与屏文件的 owner 行若缺表，`--check-ownership` 会红。这是已登记缺口 ⇒ 按任务书"谁都不许自改表格把它刷绿"，我一行未碰。
9. **挂载未做（A-44 #86 / A-50 #130 的 TPM 串行收口）**：屏与路由都就位但尚未接上，`#/upgrade-password` 现在仍解析到 `SCREEN_PLACEHOLDER`。需要 TPM 加的行见 §⑦。
10. **`LoginScreen` 的 R-40④ 入口判定未复核**（T-19b 已验收，只读确认它会 navigate 到 `GATE_UPGRADE_PATH`）；若它的 pendingAction 写入形状与本屏 `takePendingAction()` 的 `open` 分支不一致，回原页会退化成回首页。D-03/D-04 按 `auth-store` 的形状钉死，未越界改登录屏。

---

## ⑦ 给 TPM 的结论（一段话）

本轮只新增 2 个文件：`apps/app/src/screens/UpgradePasswordScreen.tsx`（210 行）与
`apps/app/test/upgrade-screen.spec.tsx`（910 行 / 41 条用例），另在 3 个既有文件内做加法
（`data/queries/auth.ts` 补 `forceUpgradeMutationOptions()` 这一件、`data/rest-fetcher.ts` 补
`RequestOptions.bearer`（一处加法 + 一处取 token 改写）、`test/login-screen.spec.tsx` 只改 B-02 一处过期哨兵，用例数不变）；
亲跑 `pnpm --filter @tm/app test` = **Test Files 15 passed (15) / Tests 335 passed (335) / 0 failed / 15.34s**
（基线 14 files / 294 tests，只增不减；共跑 4 次，前 3 次的失败与原因都写进了台账）与
`pnpm --filter @tm/app typecheck` = **0 errors**（跑 2 次），`data.db` 与 `packages/server/data.db`
跑前跑后指纹逐字段相同（253952 B / `6595517661cc` / 2026-09-18 04:05:38 与 0 B / `e3b0c44298fc`），
零 git 写操作、未碰 `apps/web`、未跑 e2e；复用的既有件 = `@tm/ui` 的 `ForcePasswordUpgradeForm`
（只传 props、0 覆盖 submitLabel/fieldLabels）+ `main.tsx:61` 的 `GateLayout`（全屏无 tab 靠它，屏零 diff）
+ `lib/auth-store.ts` 的 `useAuthSnapshot/afterPasswordChanged/signOut/takePendingAction`（token 落地唯一份）
+ `lib/token-bridge.ts` 的 `currentUpgradeToken()`（只读）+ `data/rest-fetcher.ts` 的
`apiPost/parseWith/apiErrorMessage` 与 401/403 单点 + `@tm/shared` 的
`AUTH_COPY.forceUpgrade.*` / `AUTH_COPY.changePassword.success.*` / `ARIA.*Password` / `TOAST_LONG_MS`；
上报项 = ⑥ 的 10 条（任务书"已有 mutation"的前提不符、`rest-fetcher` 的 `bearer` 加法、别人 spec 的一处改动、
`退出登录` 不发 `auth.logout` 与 Web 不同形、止血阀 off 面属 T-19d、过渡空帧、
`ForcePasswordUpgradeForm` 的过期 TODO、`tools/ownership.json` 缺口留给 E4、挂载未收口、
`LoginScreen` 的 pendingAction 形状未复核）。**挂载需要 TPM 加两行**：
（a）`apps/app/src/router.tsx:60` 把
`{ path: '/upgrade-password', kind: 'gate', load: SCREEN_PLACEHOLDER }` 的 `load` 换成
`load: () => import('./screens/UpgradePasswordScreen.js')`（`main.tsx` 的 `Shell()` 已会把 `kind==='gate'` 送进
`GateLayout`，因此**不需要**改 `main.tsx` 来隐藏底 tab）；
（b）`apps/app/src/main.tsx` 补 `attachAuthSignals()`（现全仓只有 `auth-store.spec.ts` 调过它，生产入口 0 调用）：
在 `:35` 之后加 `import { attachAuthSignals } from './lib/auth-store.js';`，并在 `bootstrap()` 内
`startRouter();`（:159）之后加 `attachAuthSignals();`——A-50 #130 第 ② 项，缺它则 403 软告知位与
服务端推送信号不会进 store。
