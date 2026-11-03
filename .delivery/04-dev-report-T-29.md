# T-29 开发报告 · 修掉登录侧对存量弱密码的 UI 拦截（P0）

施工方：UI 壳单件 | 改动文件：`packages/ui/src/auth/AuthFormShell.tsx`、`packages/ui/test/auth.spec.tsx`（+ 本报告）
出口命令：`pnpm --filter @tm/ui test` / `pnpm --filter @tm/ui typecheck` —— **均自跑通过，原文见 §⑦**

## ① 壳的 diff（改前 / 改后同屏并列）

**A. 提交拦截（原 `handleSubmit` 第 416 行 → 现 :430-431）**
```diff
  setTouched({ phone: true, password: true, confirm: true, agreement: true });
  if (!PHONE_PATTERN.test(phone)) return;
- if (passwordTooWeak || passwordTooLong) return;
+ /* A-36-3 修 DEFECT-3 / T-29：`PASSWORD_MIN` 只拦**建密码态**（注册与激活认领）；
+    登录态唯一的强度侧门槛是"空 / 纯空格不可提交"，短密码必须能提交上去，
+    否则 `PASSWORD_UPGRADE_REQUIRED` 那条强制改密链（R-40④）在两端永不可达。 */
+ if (isRegister ? passwordTooWeak : passwordEmpty) return;
+ if (passwordTooLong) return;
  if (isRegister && confirmPassword !== password) return;
```

**B. 判据常量（原 :349 → 现 :353-355，新增 `passwordEmpty`，阈值表达式一字未改）**
```diff
+ const passwordEmpty = password.trim().length === 0;
  const passwordTooWeak = password.trim().length < PASSWORD_MIN;
  const passwordTooLong = utf8Bytes(password.trim()) > PASSWORD_MAX_BYTES;
```

**C. 字段话术（原 :351-356 → 现 :362-367）：登录面不再讲建密码面的话**
```diff
  const passwordError =
    codeField === 'password'
      ? TM_ERRORS.WEAK_PASSWORD.copy
-     : !isRegister && touched.password && (passwordTooWeak || passwordTooLong)
+     : !isRegister && touched.password && passwordTooLong
        ? TM_ERRORS.WEAK_PASSWORD.copy
        : undefined;
```
⚠ **与工单口径的一处偏离，主动报备**：工单说 C 段"是对的、不必动"，但工单 simultaneously 要求新钉子④"登录态不得出现'密码至少 8 位'式提示"。二者只有在此处摘掉 `passwordTooWeak` 才能同时成立，故按④落；`!isRegister` 的分模式骨架、`codeField === 'password'` 的服务端优先分支、注册态"话术只由强度条给"的行为**全部一字未动**。若 TPM 认为 C 段须原样保留，revert 本 3 行即可，A/B 两段与强制改密链的可达性不受影响（届时④号哨需降级为"只哨提交"）。

**D. 头注释（现 :19-22）** 追加 4 行，把"密码门槛分两面"写进自述；纯注释，无行为。

## ② 三态 × 密码长度行为矩阵（格 → 决定行）

| 密码（trim 后） | 登录态 sign-in | 注册/激活态 register | 改密态 ChangePassword/ForceUpgrade（未改，仅列口径） |
|---|---|---|---|
| 空 / 纯空格 | **不提交、无话术**：:430 `passwordEmpty`（:353） | 不提交（`passwordTooWeak` 亦真）：:430 | 新密码不提交：`ChangePasswordForm.tsx:159` `newTooWeak` |
| 1 … PASSWORD_MIN-1（存量弱密码） | **提交照发**（本案修复）：:430 走 `passwordEmpty` 分支；无字段话术 :365 | 不提交：:430 `passwordTooWeak`；话术=强度条 `PasswordStrength`（:558 挂载） | 不提交：`ChangePasswordForm.tsx:159`；话术=新密码框 `:143` `WEAK_PASSWORD.copy` |
| PASSWORD_MIN … 字节上限内 | 提交：:430（两分支皆假）+ :431 假 | 提交：:430/:431/:432 全假 | 提交：`ChangePasswordForm.tsx:159` |
| > PASSWORD_MAX_BYTES 字节 | **仍不提交、仍出 `WEAK_PASSWORD.copy`**：:431 + :365（与既有登录态用例同向，见 §⑤-2） | 不提交：:431 | 不提交：`newTooLong` |
| 服务端回 `WEAK_PASSWORD` | 字段下显示：:363-364（`codeField`） | 字段下显示：:363-364 | 新密码框下显示：`:141` |

字节上限在登录面保留是**刻意**的：它是与强度无关的传输口径，且被既有登录态用例锁住（禁改期望方向）；工单点名要摘的是 `PASSWORD_MIN`。

## ③ 新钉子（只追加，既有用例 0 改动）：`describe('T-29 密码门槛分两面…')` 共 6 条，全绿
```
✓ … > ① 登录态：短密码 + 合法手机号 → 提交真的发出去，onSubmit 收到原样密码串 5ms
✓ … > ①b 登录态：切到注册再切回登录（密码框被清空）后，短密码仍然发得出去 15ms
✓ … > ② 建密码三面同口径：同一串短密码在注册 / 改密 / 强制改密态一律不放行，且给人话 36ms
✓ … > ③ 登录态唯一的强度侧门槛：空密码与纯空格都不提交 14ms
✓ … > ④ 反向哨：登录态任何一步都不出现建密码面的话术（WEAK_PASSWORD.copy） 13ms
✓ … > ④b 反向哨只针对客户端判据：服务端真回 WEAK_PASSWORD 时登录面照旧显示（不吞错） 3ms
Tests  64 passed (64)
```
钉子里的短密码串一律由 `PASSWORD_MIN - 1` 派生、空格串由同长派生；断言的话术全取 `TM_ERRORS.WEAK_PASSWORD.copy`，**无新中文字面量、无新 `data-testid`、无 `test.fail()`**。

## ④ 阈值单点自证
`grep -n 'PASSWORD_MIN|PASSWORD_MAX_BYTES|[<>]=?\s*[0-9]|===?\s*[0-9]|\b(8|72|7)\b' packages/ui/src/auth/AuthFormShell.tsx` 全量命中：:353 `=== 0`（空值判断）、:354 `< PASSWORD_MIN`、:355 `> PASSWORD_MAX_BYTES`、:168 `> 0`（既有 `joinIds`），其余均为注释（:9/:16/:20-22/:161/:352/:357/:427）。文件里唯一的数字组是 :129-131 的手机号展示分组 `[3, 4, 4]`（既有、非比较、与密码无关）。⇒ 除 `PASSWORD_MIN` / `PASSWORD_MAX_BYTES` 两个 import 引用外，**本文件无第二个密码阈值数字**；既有源码级判据 `auth.spec.tsx:731`（禁数字比较 + 必须留 `.length < PASSWORD_MIN`）仍然通过。

## ⑤ 波及面点名清单（**本任务只修壳，以下一律未修，请派人跟**）
1. **P0 会变红 · `apps/app/test/login-screen.spec.tsx:400-408`（C-03）**：断言登录态输 `'123'` + blur 后 `field-password` 的 `role=alert` === `TM_ERRORS.WEAK_PASSWORD.copy`。这正是 §①C 摘掉的那条话术 → 该条期望**必红**（同用例的 `fetchCalls = 0` 仍成立，因为它没点提交）。属"宿主用例依赖旧口径"，请派 T-19b 的宿主 owner 改向（改断言为 `null` 或改测"能发出去"）。
2. **保留未动 · `packages/ui/test/auth.spec.tsx:767-776`**：既有登录态用例要求 >`PASSWORD_MAX_BYTES` 时仍拦、仍出 `WEAK_PASSWORD.copy` —— 本壳按原方向保留（见 §② 末行说明）。
3. **`apps/web/e2e/auth-wall.spec.ts`**：登录面填的密码串是 `'strong-password-8'`(:299/:470/:498)、`'wrong-password-1'`(:372) —— 全部 ≥8 位，**不受影响**；但整套 e2e 里**没有**一条"存量 <8 位密码能发出 `auth.login`"的用例 ⇒ 本案修复在 e2e 面仍是盲区，建议补一条（可顺手把 R-40④ 的 403→改密页链打通）。
4. **`apps/web/e2e/upgrade.spec.ts:255/271`、`profile.spec.ts:74-141`、`wordbook.spec.ts:131`**：都落在改密/注册面或只做 shared 串自检，方向未变。
5. **`apps/web/src/components/login-dialog.tsx:150-157` 与 `apps/app/src/screens/LoginScreen.tsx`**：宿主侧无第二套长度预检（grep `length|PASSWORD_MIN|trim|WEAK` 于 LoginScreen 0 命中）⇒ 两端只需壳修即通，宿主代码无需改。
6. **注释自述 · `apps/web/src/app/upgrade-password/page.tsx:28`**：讲的是契约把 `oldPassword` 过 `min(PASSWORD_MIN=8)` 的既有事实，与本案无关，未动。
7. **已登记在册的同一缺陷**：`.delivery/04-dev-report-T-19-b.md:100`（"壳挡弱密码 ⇒ App 侧 R-40④ UI 路径不可达"，当时点名"修复落 packages/ui、我禁改"）—— 本案即该条的收口，请 QA 在同一判据下复核 Web/App 两面。
8. **shared 缺串登记（不自造）**：登录态"密码为空"目前**无任何可见提示**（点了不提交）。`TM_ERRORS` 里没有"请输入密码"这一格，`OLD_PASSWORD_REQUIRED`（"请输入当前密码"）语义属改密面，不借用。请 PM 定串后由 shared owner 补 `errors.ts` 键，壳再接上（阈值面不需改）。

## ⑥ `data.db` 指纹（跑前 / 跑后，全程只读）
| 文件 | 跑前 | 跑后 |
|---|---|---|
| `E:\CC\tomorrow-memory\data.db` | 253952 B · mtime 2026-09-18 04:05:38.198449400 +0800 · sha256 `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` | **逐字相同**（字节/大小/mtime 三项全等） |
| `E:\CC\tomorrow-memory\packages\server\data.db` | 0 B · mtime 2026-09-17 00:10:53.374159200 +0800 · sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | **逐字相同** |

无写操作、无 DDL/DML、未新建临时文件（出口命令不触库）；未跑 `@tm/app` / `@tm/web` 任何测试或构建。

## ⑦ 出口命令原文（自跑通过）
`pnpm --filter @tm/ui test`
```
 ✓  @tm/ui  test/ui.spec.tsx (38 tests) 59ms
 ✓  @tm/ui  test/auth.spec.tsx (64 tests) 521ms
 ✓  @tm/ui  test/patterns.spec.tsx (51 tests) 527ms
 Test Files  3 passed (3)
      Tests  153 passed (153)
   Start at  02:28:00
   Duration  2.60s (transform 566ms, setup 0ms, collect 3.88s, tests 1.11s, environment 1.26s, prepare 411ms)
```
（`test/patterns.spec.tsx` 的 `stderr | Error: Not implemented: navigation` 是 jsdom 对 `<a href>` 的既有噪声，与本案无关，该文件仍 51 passed。）

`pnpm --filter @tm/ui typecheck`
```
$ tsc -p tsconfig.json --noEmit
```
（无输出 = 通过。）
