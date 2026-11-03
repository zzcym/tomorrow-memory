208 .delivery/04-dev-report-T-16-r4.md

# T-16r4 —— 批次 4 Web e2e 红点取证（纯只读轮）

任务号 T-16r4。本轮**未改任何文件**（产品码 / 测试码 / `tools/**` / `.delivery/**` 主文档 / 真库），
唯一写入 = 本报告 + Playwright 自己覆写的 `apps/web/test-results/`（未跟踪目录）。
无 git 写操作。未使用 `--i-know-this-is-prod`。

---

## ① 开工热文件取证 + 真库指纹

### 盘面冷热（§1 第 2 步，开工瞬间各取一次）

| 取证 | 命令 | 结果 |
| --- | --- | --- |
| 工作树 | `git status --porcelain` | 184 行（M/D/?? 混合，全轮结束仍为 184 行 ⇒ 本轮零写入） |
| 热 `.tsx` | `find packages apps -name '*.tsx' -newermt '5 minutes ago'` | **0 命中** |
| 放宽到任意源文件 | `find packages apps -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.css' -o -name '*.json' \) -not -path '*/node_modules/*' -not -path '*/.next/*' -newermt '10 minutes ago'` | **0 命中** |
| 开工时刻 | `date` | `Mon Sep 21 10:20:47 2026` |

**结论：本轮无并发中间态。** 五门里的 ④ 一类**空集**，所有红都不该用"另一轮在写"解释。
（`packages/ui/src/auth/AuthFormShell.tsx` 的 mtime = `2026-09-21 03:38:35`，早于开工 6 小时 42 分，是冷文件。）

### 出口命令第 1 条：build（A-50 #126 坑，必跑）

`pnpm --filter @tm/web build` → **exit 0**。产物新鲜度自证：

```
AuthFormShell.tsx mtime : 2026-09-21 03:38:35
.next/BUILD_ID   mtime  : 2026-09-21 10:22:31   (ifx86LuvKGWDZNumUhQWi)
.next 中比源码新的产物   : apps/web/.next/server/app/(user)/about/page.js  → 存在
```

⇒ `.next` 吸到的确是 `AuthFormShell.tsx` 的**当前终态**，不存在"测到旧壳"。（顺带复核 A-59 #163 的 mtime 反驳：本轮盘面比 T-28 更新且同样冷，反驳继续成立。）

### 真库指纹（跑前 / 跑后各量一次，全程只读）

| 文件 | 跑前 | 跑后 | 判定 |
| --- | --- | --- | --- |
| `data.db` | size=253952 mtime=2026-09-18 04:05:38.198449 sha256[0:12]=`6595517661cc` | size=253952 mtime=2026-09-18 04:05:38.198449 sha256[0:12]=`6595517661cc` | **逐字未动**（与派发单三项全等） |
| `packages/server/data.db` | size=0 mtime=2026-09-17 00:10:53.374159 sha256[0:12]=`e3b0c44298fc` | 同左 | **逐字未动** |

本轮**未打开过任何 `.db`**（无 sqlite/无 DML）。e2e 后端全部由 `page.route` 桩接管。
本地库内容类数字一律不入本报告（派发单禁令）；线上生产库判据：**未实测，待 Phase 7 向用户本人索取只读访问**。

### 全量 e2e 规模与两档成绩（实测 7 个 spec 文件，非派发单估的 92 条）

| 档位 | 条数 | 首跑 | 复跑（判闪） |
| --- | --- | --- | --- |
| `chromium-375x667` | 47 | **38 passed / 9 failed** | 39 passed / 8 failed |
| `chromium-1280x900` | 47 | **41 passed / 6 failed** | 41 passed / 6 failed |
| 合计 | **94** | **79 passed / 15 failed** | **80 passed / 14 failed** |

---

## ② 逐条红归类表（15 条实例 / 9 个用例）

五门：① 桩夹具病 ② 期望过期 ③ 产品未接线 ④ 并发中间态 ⑤ 真缺陷。
"归口"列 = **归 TPM 裁** 或 **可自派工程轮**。

| # | spec:行 + 用例名 | 档位 | 报错原文首行 | 门 | 一句依据 | 归口 |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | `auth-wall.spec.ts:468` ⑧ 关于页+弹窗两态+业务页 0 命中禁词 | 375 | `Error: locator.click: Test timeout of 30000ms exceeded.`（内层：`waiting for locator('[data-testid=auth-switch]')` → `element is visible, enabled and stable` → **`element is outside of the viewport`** ×42） | **⑤** | 元素**首轮后即 stable**（`not stable` 全文只出现 1 次），卡死的是几何溢出，不是动画 | 归 TPM 裁（修法见 §5） |
| R2 | `auth-wall.spec.ts:490` ⑨ 注册态未勾协议主按钮禁用 | 375 | `Error: locator.click: Element is outside of the viewport`（`[data-testid=auth-submit]`，`:505` 带 `{force:true}` 仍失败） | **⑤** | `force:true` 已跳过 visible/enabled/stable 三道检查，仍报视口外 ⇒ 与稳定性判定无关，纯几何 | 归 TPM 裁 |
| R3 | `auth-wall.spec.ts:520` ⑨b 服务端回 AGREEMENT_REQUIRED | 375 | `Error: locator.click: Test timeout of 30000ms exceeded.`（内层：`[data-testid=agreement] [role=checkbox]` → `element is visible, enabled and stable` → **`element is outside of the viewport`** ×49） | **⑤** | 与 R1/R2 同一签名、同一根因（注册态表单更高，勾选框落在溢出区） | 归 TPM 裁 |
| R4 | `upgrade.spec.ts:98` 零副作用：未命中门禁时 `<UpgradeGate>` 不发请求 | 375+1280 | `Error: expect(received).toBe(expected) // Object.is equality`（Expected: 0, Received: 1） | **②** | 那 1 次请求是 `mobile-nav.tsx:21` → `useDueCount()` → `trpc.review.today.useQuery({enabled: signedIn})`；用例自己种了 `tm_token` ⇒ 必发。`/about` 在 `(user)` 组内（`(user)/layout.tsx:36` 挂 `<MobileNav>`），"about 树里只有门禁层与顶栏"的前提已过期 | 可自派工程轮（口径边界需 TPM 认） |
| R5 | `upgrade.spec.ts:125` 零副作用·止血阀 off | 375+1280 | 同 R4（Expected: 0, Received: 1） | **②** | 同 R4 同一颗查询（该用例也种了 `tm_token: 'tk-e2e'`） | 可自派工程轮 |
| R6 | `upgrade.spec.ts:140` ⑦ 登录出参 upgrade_required + 空 token | 1280（375 复跑转绿） | `Error: expect(locator).toBeVisible() failed` / `Locator: locator('[data-testid=login-dialog]')` / `Error: element(s) not found` | **①** | `:145` 用**一次性** `page.evaluate(dispatchEvent)` + `toBeVisible()`，正是姊妹文件 `auth-wall.spec.ts:138-158` 已诊断并修掉的"早于水合的广播无人接收"竞态；**复跑时 375 档转绿 = 闪已实证**，非确定性红 | 可自派工程轮 |
| R7 | `upgrade.spec.ts:162` ⑦ 命中门禁进任意业务页：先出骨架再换到改密页 | 375+1280 | `Error: expect(locator).toHaveCount(expected) failed`（`[data-testid=upgrade-password-page]` Expected 1, Received 0，23 次轮询全 0） | **⑤** | 失败帧 ARIA 快照只有 `- generic: - status - status`（**无 `main`、无 header、无内容**）= `upgrade-gate-blocking` 的两枚 `SkeletonBlock`；URL 已在 `:167` 命中 `/upgrade-password`。差分正证：同一 GATED 种子**直载**时（`:175` 帧）快照是完整改密页 ⇒ 断的是"门禁换页"这一跳 | 归 TPM 裁（属判据⑦ 主路径） |
| R8 | `upgrade.spec.ts:175` ⑦ 改密页不可关闭 | 375+1280 | `Error: expect(locator).toHaveAttribute(expected) failed` / `Locator: locator('[data-testid=force-password-upgrade]')` / `Error: element(s) not found` | **②** | `upgrade-password/page.tsx:171` 显式传 `testid="upgrade-password-form"`，覆写了 `ForcePasswordUpgradeForm.tsx:130` 的默认值 `force-password-upgrade` ⇒ 这颗 testid 在 Web 端**从未存在过**；同帧快照证明页面本身在场（`data-auth-hard-gate="true"` 也确实挂在根上，`:131`） | 可自派工程轮（改选择器，不许动 DOM） |
| R9 | `upgrade.spec.ts:252` ⑦ 改密失败：显示 §4.6 人话 | 375+1280 | `Error: expect(received).toContain(expected) // indexOf`（Expected value: `"auth.forceChangePassword"`, Received array: `[]`） | **②**（附 **①**） | 用例把新密码填成 `'short'`（5 位）却期待"打到服务端"。建密码面已被 `PASSWORD_MIN=8` 在客户端前置拦截（`AuthFormShell.tsx` 头注 A-36-3/T-29 口径），`onSubmit` 根本不触发 ⇒ 那一支按构造不可达。**附病**：本文件自带私有 `err()`（`:42`）= `{error:{message,data}}`，**缺 v11 数字协议码 `code` 与 `json` 信封**，即便打出去 `tmCodeOf()` 也读不到 §4.6 码（派发单第二坑；头注 `:22` 仍写"tRPC v10"） | 可自派工程轮（改期望 + 迁 `helpers.trpcError`） |

**五门条数账（按 15 条实例）**：① = 2（R6×2 档）｜② = 8（R4/R5/R8/R9 × 2 档）｜③ = **0**｜④ = **0**｜⑤ = 5（R1/R2/R3 + R7×2 档）。
**按用例去重（9 个）**：① 1 个｜② 4 个｜③ 0 个｜④ 0 个｜⑤ 4 个（= 2 项独立缺陷）。

---

## ③ 首批点名目标逐条结论

### 3.1 `auth-wall.spec.ts` ⑧⑨b（375 档三红）—— 定类 = **⑤ 真缺陷：弹窗溢出视口且不可滚动**；派发单第一嫌疑（动画不收敛）**被证据否掉**

两条嫌疑按 TPM 要求**分开判**，不合并：

- **动画假设（`animate-fade-in-up` 在 375 窄档不收敛）→ 否证。** 三条红的 Playwright 动作日志**逐字**都是
  `element is visible, enabled and stable` 之后才失败；`element is not stable` 在 R1 全文只出现 **1 次**（首轮尝试），
  R2/R3 为 **0 次**（复跑工件 `grep -c` 复核：R1=1、R2=0、R3=0）。
  源码侧同向：`tailwind-preset.ts:259` `fade-in-up: 'fade-in-up var(--dur-enter) var(--ease-standard) both'`
  + `tokens.css:42` `--dur-enter:180ms` ⇒ **单次、180ms 收敛**，`both` 不循环。仓里 `infinite` 只有
  `breath` / `shimmer` / `spinner` 三颗，均不在弹窗点击路径的祖先上（`AuthFormShell.tsx:717` 的 `animate-spinner`
  是 `pending` 时主按钮**内部**的后代，不改祖先包围盒）。
- **溢出假设（弹窗真的出视口）→ 成立。** `packages/ui/src/primitives/dialog.tsx:47` 的 `DialogContent` 是
  `fixed left-1/2 top-1/2 … translate-y-[-50%]`，**既无 `max-h-*` 也无 `overflow-y-auto`**；Radix 模态锁 body 滚动
  ⇒ 内容一旦高于 667px，上下两端同时出视口且**没有任何滚动路径**。日志里 `scrolling into view if needed` →
  `done scrolling` → 仍 `outside of the viewport` 正是"滚不动"的指纹。
  三红落在弹窗的**不同边**，与几何自洽：R1 `auth-switch` 在标题行（顶部出界）、R2 `auth-submit` / R3 协议勾选框在注册态长表单下部（底部出界）。
  排除档位假象：`app/layout.tsx:20-24` 的 viewport 是标准 `width=device-width`（`maximum-scale=5`），375 档是真 375 CSS px；
  同三条断言在 1280×900 全绿 ⇒ 差异是 900px vs 667px 的高度，不是动画、不是配置。
  **复跑逐字复现**（R2 首行仍是 `Element is outside of the viewport`）⇒ 非闪。

> 用户可见后果（这是它进 ⑤ 而不是 ① 的理由）：375×667 档上，一个真人**既看不见也点不到**注册态的协议勾选框与主按钮 —— R-38/R-40 钦定的"移动主战场档位"上注册流程走不完。

### 3.2 `auth-wall.spec.ts:259-264` —— **绿，且确实测到了东西**（非空跑）

用例 ②（`:250-268`）在该区间内跑 6 条真断言：`data-mode=sign-in`、`field-confirm` 计数 0、
`field-password input` 计数 1、`document.activeElement === 密码框`（`:261-264` 的焦点判据）、
`agreement` 计数 0（登录态不给勾选框）、`login-agreement-note` 计数 1。两档全绿。

### 3.3 `auth-wall.spec.ts:402` —— **绿，且确实测到了东西**

该行在 ⑥b（`:395-413`）内：向**验密码**面填 `'wrong-password-1'` 并提交，期待命中"服务端故意不给 §4.6 码"那一支
（`bareError` 只回 401 + `httpStatus`），随后断 `auth-unregistered-hint` 在场、点它切注册态、手机号保留、凭据未被清。
两档全绿 ⇒ R-40④ 的"弱口令也能提交上去、登录面不做强度审判"这一面**被真判到了**。

### 3.4 `upgrade.spec.ts:150-156` —— **红**（属 R6 用例 `:140`）

`:151-153` 的 `field-phone` / `field-password` fill 与 `:154` 的 `auth-submit` click 从未执行到：
用例在 `:146` 的 `login-dialog` `toBeVisible()` 就断了（弹窗没开成）。定类 ①（一次性广播竞态），
**不是**"登录壳不显示服务端话术"那次改动的后遗症。

### 3.5 `upgrade.spec.ts:255` 与 `:271` —— **红**（属 R9 用例 `:252`），定类 ② 期望过期 + ① 桩病

- `:255` `err('密码至少 8 位', { code: 'WEAK_PASSWORD', httpStatus: 400 })` —— 用的是本文件私有 `err()`，
  桩形 `{error:{message,data}}` **缺数字协议码 `code`/`json`**（A-50 #126 之后 T-16r3 只在 `auth-wall.spec.ts` 迁到
  `helpers.trpcError`，本文件没跟上）。⇒ 门①。
- `:271` `expect(form.getByText('密码至少 8 位').first()).toBeVisible()` —— 硬编码字面量（不走 `sharedErrorCopy`），
  且它期待的服务端那一支被客户端 `PASSWORD_MIN` 前置拦截，按构造不可达。⇒ 门②。
  **注意 R-40④ 合规性**：这条断言落在**强制改密页 = 建密码面**，强度话术在此**合法**（`:175` 的 ARIA 快照里
  `heading "为了账号安全，请设置新密码（至少 8 位）"` + `status: 密码至少 8 位` 在场即为正证），
  所以它是"期望过期"，**不是**产品把话术漏到了登录面。

### 3.6 `profile.spec.ts:74-89` —— **绿，且确实测到了东西**

"新密码不足 8 位"用例：断 `role=alert` 里逐字等于 `sharedErrorCopy('WEAK_PASSWORD')`（现读真源，非硬编码）、
`input[name=newPassword]` 的 `aria-invalid=true`、**且 `auth.changePassword` 调用次数 = 0**（客户端拦下、不发请求），
末行 `expect(expected).toContain('8 位')` 钉的是 shared 真源的内容。这正是 R9 该照抄的**新契约写法**：
建密码面 = 客户端拦 + 0 请求。两档全绿。

### 3.7 `profile.spec.ts:130-142` —— **绿，且确实测到了东西**

"服务端回 `WEAK_PASSWORD`（客户端长度已合规）"用例：新密码填 `'abcdefgh'`（8 位，过客户端那一关）⇒
`expect.poll(countOf(calls,'auth.changePassword')).toBe(1)` 真打到桩，再断 alert 恰 1 处显示定稿串。
**这条用例的存在本身就说明"两条出口分开钉"的口径已经建立**，`upgrade.spec.ts:252` 只是没跟上。两档全绿。

### 3.8 login-dialog 用例里有没有"兜底依赖旧 WEAK_PASSWORD 话术"的断言 —— **没有**

`grep -rn "WEAK_PASSWORD" apps/web/e2e` 的 11 个命中里 **`auth-wall.spec.ts` 0 处**（弹窗/登录面用例对该码零引用）。
全仓 e2e 唯一把强度话术**硬编码进期望**的是 `upgrade.spec.ts:271`，落点在**建密码面**（合法面），不在登录面。
⇒ R-40④（登录面 = 验密码，永不出现「至少 8 位」式话术）在 Web 侧**未被违反，也未被旧期望钉住**。

### 3.9 两组 grep 的命中是否全在注释

| 命令 | 命中 | 判定 |
| --- | --- | --- |
| `grep -rn "请先登录后" apps/web/src` | 6 处：`components/auth-gate.tsx:4,8,16`、`components/login-wall.tsx:14`、`lib/use-auth.ts:8` | **全在 JSDoc/注释块内**（逐行均以 ` * ` 或 `//` 起头，`:16` 是注释里的"改前"示例代码）。**渲染面 0 命中** ⇒ 判据① 的静态归零成立，与 e2e ①①b 两档全绿相互印证 |
| `grep -rn "至少 8 位\|8 位" apps/web/e2e` | 6 处：`profile.spec.ts:74,89,123`、`upgrade.spec.ts:255,271`、`wordbook.spec.ts:131` | 注释/用例标题：`profile.spec.ts:74,123`、`wordbook.spec.ts:131`（后者 `sharedErrorCopy(...)` 现读真源再判，合规）；`profile.spec.ts:89` 同属现读真源。**期望面硬编码 = `upgrade.spec.ts:255`（桩串）与 `:271`（断言字面量）两处**，即 §3.5 那条红 |

---

## ④ 出口命令原样尾行

```
pnpm --filter @tm/web build
npx playwright test                     # cwd = apps/web；首跑：79 passed / 15 failed（94 条）
npx playwright test                     # 超编第 3 条 = 复跑判闪（§4 授权）：80 passed / 14 failed
```

如实登记：**实际用了 3 条出口命令**。第 3 条是 §4 明文允许的"原样重跑同一命令判闪"，
产物 = 定位到 `upgrade.spec.ts:140` 在 375 档**由红转绿**（唯一跨跑翻转的红），其余 14 条逐字复现。
其余命令全部是只读取证（`git status` / `find` / `stat` / `sha256sum` / `grep` / `sed -n` 读工件），不产生写入。

---

## ⑤ 上报未修（本轮判了但不动手，交 TPM 裁）

1. **【⑤ 弹窗溢出】修法越出取证范围，且会波及其他面。** 最小修法是给 `packages/ui/src/primitives/dialog.tsx:47`
   的 `DialogContent` 加高度上限 + 内部滚动（`max-h-*` + `overflow-y-auto`）。但：
   (a) 该文件是 **T-13 名下 `packages/ui`**，其 `:29` 注释明写当年不为 14 个在用对话框加关闭钮的理由是
   "§10.4 要求存量页面非 import 行零变更" ⇒ 同一把尺下给所有 Dialog 改高度/滚动是**规范级决策**（UI §3.11.2 vs §3.1.1 计数口径），不是工程顺手改；
   (b) 也可能该修的是**登录壳本身**（375 档收紧间距/字号，或注册态把协议勾选与主按钮挪进可见首屏）。
   **⇒ 归 TPM 裁"改壳容器"还是"改壳内容"，本轮不猜。**
2. **【⑤ 门禁换页吞 children】修法清楚但属产品码。** 疑点机制：`apps/web/src/components/upgrade-gate.tsx:65`
   的 `onUpgradePage` 用 `window.location.pathname` **非反应式**求值，`router.replace` 之后该组件无依赖变化
   ⇒ 不再重算 ⇒ 一直返回 `:75` 的 blocking 骨架。改成订阅 `usePathname()` 即可。文件在 T-16 名下、
   影响的是判据⑦ 主路径 ⇒ **可自派工程轮，但优先级与是否本期修归 TPM**。
   （另需该轮复核：R7 的 `:172` 断言 `upgrade-gate-blocking` 计数 0 至今**未被执行到**，修好后才第一次真判到。）
3. **【② 零副作用口径】"0 请求"这句话到底管谁，需要 TPM 定边界。** 用例守的契约是"**门禁层**零请求"
   （`upgrade.spec.ts:8-13` 头注写得很清楚），但实现是"数整棵 `/about` 树的所有 `/trpc`+`/api` 请求"。
   今天多出的那 1 次来自 `(user)/layout.tsx` 的 `<MobileNav>` → `useDueCount` → `review.today`（T-12/T-28 名下、
   且**登录态发它是正确行为**）。改法有两条路（按 proc 白名单只算门禁层 / 换一棵真无客户端的页测），
   语义不同 ⇒ **归 TPM 裁**。
4. **【① 桩病跨文件】`upgrade.spec.ts` 整文件仍停在旧装配**：私有 `mockTrpc`/`err()` 缺 v11 数字协议码与 `json` 信封、
   头注 `:22` 还写"tRPC v10 batch"、开弹窗还是一次性广播。`auth-wall.spec.ts` 在 T-16r3 已迁到
   `e2e/helpers.ts` 的 `mockTrpc`+`trpcError`+轮询 `openDialog()`。⇒ 建议**一个工程轮把 `upgrade.spec.ts` 整体接上 helpers**
   （可自派），否则 R6/R9 修完仍会在别的档位上闪。
5. **【禁令自检】** 本轮未加 `test.skip` / `test.fail()`、未放宽任何阈值、未用 `waitForTimeout` 糊 stability、
   未加 `data-testid`/`id`、未改 `className`、未碰 `tools/ownership.json`（那处已知授权缺口按派发单归 **E4 收口**）。
   上表所有"改期望"的建议都只改期望，**没有一条建议改产品 DOM**。

---

## ⑥ 一句话总账

这批 15 条红里**真缺陷（门⑤）共 2 项、5 条红**：
**(1) 登录/注册弹窗在 375×667 档溢出视口且无滚动路径**（`dialog.tsx:47` 无 `max-h`/`overflow`，Radix 锁 body 滚动）
⇒ `auth-wall` ⑧⑨⑨b 三条红，真人手机上注册流程走不完；
**(2) 命中硬门禁时 `<UpgradeGate>` 用 `router.replace` 换到改密页后仍吞着 children**（`upgrade-gate.tsx:65` 非反应式读 `window.location.pathname`）
⇒ `upgrade.spec.ts:162` 两档红，判据⑦ 主路径停在骨架屏。
