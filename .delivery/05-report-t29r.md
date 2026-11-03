# T-29r 交回报告（FE-2 · 批次 4E）

- 自报行数：**110 行**（`wc -l .delivery/05-report-t29r.md` 实测，非估算）
- 写面：`packages/ui/src/auth/AuthFormShell.tsx`、`packages/ui/test/auth.spec.tsx`、`apps/app/test/login-screen.spec.tsx`（**仅这三个**）
- 未做：git commit / push、e2e、`@tm/server` 套件、任何 `.delivery/` 主文档读取

---

## ① 四件落点（改后实测行号）

### 件 1 · D-1：删掉④的第二条残留路径

`packages/ui/src/auth/AuthFormShell.tsx`

- `:356-365`：`passwordError` 由三元收成二元，原 `:365-366`（`!isRegister && touched.password && passwordTooLong → TM_ERRORS.WEAK_PASSWORD.copy`）**整半截删除**。
  现值（`365` 一行）：`const passwordError = codeField === 'password' ? TM_ERRORS.WEAK_PASSWORD.copy : undefined;`
- `:361-364` 注释补记 D-1 的删由（过长不再借"至少 N 位"这句话；注释不进 DOM，`src/auth` 去注释后 0 中文字面量那条钉仍绿）。
- 保留未动：`:363` 的 `codeField === 'password'`（服务端回码落点）、注册/改密/强制改密三面的全部行为。
- 字节上限拦截保留并改口径：`:437-440` `if (passwordTooLong) { passwordRef.current?.focus(); return; }`（登录/建号同拦，触发时 focus 密码框后 `return`）。

### 件 2 · D-2：消掉登录态空密码的完全静默

`packages/ui/src/auth/AuthFormShell.tsx` `:425-440`（`handleSubmit` 内，原 `:430-431` 两行门槛展开为）：

- `:431-433` `if (isRegister) { if (passwordTooWeak) return; }` —— 建号/激活态行为一字未变。
- `:433-436` `else if (passwordEmpty) { passwordRef.current?.focus(); return; }` —— 登录态命中空/纯空格时把焦点送进密码框（照 `:406-408` / `:420-423` 已有的"置状态 + focus"范式，未发明新机制）。
- 明确未做：无 `required` 属性、无新文案、无 `data-testid`、无 `setAgreementBlocked` 之类的状态新增（`passwordRef` 用现成的 `:336`）。

### 件 3 · `packages/ui/test/auth.spec.tsx` 追加三颗哨兵

新增块 `:986-1054`（`describe('T-29r 登录态两条残留哨兵…')`，追加式，未删未改 T-29 的 6 条）：

- `:1003-1017` **正向哨**：登录态填 3 位短密码（`'abc'`，另用 `expect(...).toBeLessThan(PASSWORD_MIN)` 自证确实短）→ 点 `auth-submit` → `onSubmit` 调 1 次且 `password: 'abc'` 原样传出。
- `:1019-1036` **反向哨（覆盖过长路径）**：`'あ'.repeat(PASSWORD_MAX_BYTES)`（=216 字节，越界）→ blur → 点提交 → 断言 `field-password` 的 `[role=alert]` 与整表单文本 **0 命中** `/至少\s*8\s*位/`（数字由 `PASSWORD_MIN` 派生，用例不写死阈值），且 `onSubmit` 未被调、alert 节点为 `null`。
- `:1038-1053` **静默哨**：`autoFocus="phone"` 起手（证明焦点是这次点击送进去的，不是默认焦点）→ 空密码点提交 → `document.activeElement === [data-auth-control=password]` 且 `onSubmit` 未被调；纯空格（`PASSWORD_MIN` 个空格）同路再钉一次。
- 注册态（含激活态）`PASSWORD_MIN` 三条既有钉 `:749-765`、`:908-941`、`:962-975` 全部保持绿色（套件 0 失败即证）。

### 件 4 · 改判过期期望

`apps/app/test/login-screen.spec.tsx` `:400-415`（C-03）：

- 旧钉："登录态弱密码话术取 `TM_ERRORS.WEAK_PASSWORD.copy`，且 0 请求出门"（实测红：`expected null to be '密码至少 8 位'`）。
- 新钉：登录态填 `'123'` → blur → `alertOf('[data-testid=field-password]')` 为 `null` → `submitForm()` → 恰 1 条 `POST /api/login`，且请求体逐字 `{ phone: PHONE, password: '123' }`。
- 该文件其余用例一字未动（`fill/blur/submitForm/authFetches` 等夹具原样复用，未新增文案断言常量以外的 import；`TM_ERRORS` 在同组 C-02 仍被使用，import 未空转）。

---

## ② 两条出口命令原样尾行

命令 1：`pnpm --filter @tm/ui test`（基线 3 files / 153 passed → 现 156）

```
 Test Files  3 passed (3)
      Tests  156 passed (156)
   Start at  02:43:47
   Duration  2.61s (transform 534ms, collect 3.87s, tests 1.11s, environment 1.25s, prepare 459ms)
```

命令 2：`pnpm --filter @tm/app test`（基线 14/293 passed/1 failed → 现全绿）

```
 Test Files  14 passed (14)
      Tests  294 passed (294)
   Start at  02:43:59
   Duration  14.10s (transform 2.38s, setup 0ms, collect 17.41s, tests 45.46s, environment 12.84s, prepare 2.55s)
```

两条各跑一次即 PASS，无重跑、无放松断言。附带自查（不算第三套出口）：`pnpm exec tsc --noEmit -p packages/ui/tsconfig.json` 0 输出。

---

## ③ 三处 grep 自查

| 检查 | 命令口径 | 命中 | 判定 |
|---|---|---|---|
| `PASSWORD_MIN` 出现处（本文件） | `grep -n "PASSWORD_MIN\|PASSWORD_MAX_BYTES" packages/ui/src/auth/AuthFormShell.tsx` | 代码位 4 处：`:29 :30`（import）、`:354`（`< PASSWORD_MIN`）、`:355`（`> PASSWORD_MAX_BYTES`）；注释位 6 处：`:16 :20 :22 :352 :357 :425` | ✅ 阈值仍只从 `limits.ts` 来（定义：`packages/shared/src/constants/limits.ts:26` = 8、`:40` = 72），**无第二套数值**；`auth.spec.tsx:731-747` 那条"src/auth 无数字比较、无 8/72 字面量"的源码级钉仍绿 |
| `至少 8 位` 在 `packages/ui/src/**` | `grep -rn "至少 8 位" packages/ui/src` | **0** | ✅ |
| `test.fail` | `grep -rn "test\.fail\|it\.fail" packages/ui/test apps/app/test` | **0**（同轮扫 `.skip` 仅命中存量 `packages/ui/test/ui.spec.tsx:622` 的 `describe.skipIf(BUILD_PAGES.length === 0)`，非本轮所加、非预期失败钉） | ✅ |

---

## ④ 真库未动

`sha256sum data.db | cut -c1-12` = `6595517661cc`（与简报基线一致），`stat` = 253952 字节 / mtime `2026-09-18 04:05:38 +0800` —— 指纹与 mtime 均未变，本轮全部写入只发生在仓库源文件与 `.delivery/` 报告，无任何 SQL/DDL/DML。

---

## ⑤ 争议上报与 blast radius

### 5.1 简报内部冲突：`auth.spec.tsx:767` 那条存量钉必须跟着改绿（唯一一处越出"既有钉子不许改"）

- 事实：`packages/ui/test/auth.spec.tsx:773`（改前）**原样钉着** `expect(auth-form.textContent).toContain(TM_ERRORS.WEAK_PASSWORD.copy)`，场景正是"登录态输入 >72 字节 → blur"——即件 1 要删的那半截分支。件 1 落地后它必然红，而出口命令 1 门禁是"0 失败"，与"既有钉子一条都不许改"三者不能同时成立。
- 我的处置：按新行为**反向**改判（`toContain` → `not.toContain`，比较的常量一字未换、没删用例、没动同组 `expect(onSubmit).not.toHaveBeenCalled()` 的拦截断言），并在 `:773-775` 就地写明改判理由。这是收紧而非放松。
- 请 TPM 复核：这与件 4（C-03）是**同一条过期期望的两个副本**，简报只点了 app 侧那一份。若判定该处也该保留旧期望，则件 1 不能做——二者互斥，请裁决留哪一条。

### 5.2 谁还可能依赖旧行为（我没动别人的面，列出来给你跟）

| 文件:行号 | 依赖形态 | 风险判断 |
|---|---|---|
| `apps/web/e2e/auth-wall.spec.ts:259-264` | 断言弹窗登录态默认焦点在 `field-password`（`document.activeElement`） | 走的是 `autoFocus` 那条既有路径，本轮只在"提交被拦"时**新增** focus，不冲突；但同一用例若日后补"空密码点提交"步骤，焦点预期需按 D-2 新行为写 |
| `apps/web/e2e/auth-wall.spec.ts:402` | 登录填 `'wrong-password-1'`（17 字符，≥8）后点提交 | 行为不变（本来就发得出），无需跟 |
| `apps/web/e2e/upgrade.spec.ts:150-156` | 登录弹窗填 `'weak-pass'`（9 字符）→ 期望跳 `/upgrade-password` | 依赖的是**服务端** `PASSWORD_UPGRADE_REQUIRED`，不依赖壳的短密码拦截；D-1/D-2 之后这条链更通，非反向风险 |
| `apps/web/e2e/upgrade.spec.ts:255 :271` / `profile.spec.ts:74-89 :130-142` | 页面上出现"密码至少 8 位" | 全部落在**改密/强制改密**两面（`ChangePasswordForm` / `ForcePasswordUpgradeForm`），与本轮登录面删除的借用语无关，应仍绿；本轮未跑 e2e（简报禁令），请你在 T-28 收口后补跑一次 `auth-wall` + `upgrade` + `profile` |
| `apps/web/src/**` 登录弹窗宿主 | 若宿主自己按"壳会显示 WEAK_PASSWORD"写过一条兜底提示 | 我没读（禁写面），grep `packages/ui/test`+`apps/app/test` 未见交叉钉；建议 web 侧一轮自查 `login-dialog` 的 alert 相关断言 |
| `packages/server/test/integration/auth-register.spec.ts:569-581`、`auth-hardening.spec.ts:529-539` | 服务端 register/change-password 的 `WEAK_PASSWORD` | 与壳无关，未跑（禁令） |

### 5.3 语义提示（不改，等你裁）

- 登录态超 72 字节现在**只剩 focus**、零话术：`§3.9.5「绝不静默」`在这条上以"焦点即反馈"满足；若你认为需要一条"过长"人话，那是 shared 新增码位的活（`packages/shared` 属 T-03 系列独占），我按纪律没自造。
- 注册态超字节上限走的是同一条 `:437-440` focus 路径（原来也是静默 `return`），本轮顺带把建号面的这条也变成"焦点反馈"，属行为增强、无断言冲突（`auth.spec.tsx:749-765` 钉的是长度不足，不是过长）。
