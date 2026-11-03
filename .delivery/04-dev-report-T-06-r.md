# T-06r 开发报告（批次 4C 微轮 · `ChangePasswordForm` 服务端 `WEAK_PASSWORD` 静默缺陷）

- 任务代号：T-06r（前一轮 T-06 的微轮，范围刻意收窄到 1 个实现文件 + 1 个既有 spec）
- 缺陷来源：`.delivery/04-adjudications.md` A-41 表 #62 行（TPM 已核实并裁决，只读该行）
- 判据出处：`.delivery/02-tech-design.md` 第 895 行 §10.2 T-13 判据④「错误文案全部 `import` 自 `@tm/shared/constants/errors`」
- 阅读纪律遵守情况：**未**通读 01-prd / 02-tech-design / 03-ui-spec，只按预算读了 tech-design 第 895 行区间与 errors.ts 第 85 行附近。

---

## 1. 交付物清单（文件 + 行数）

| # | 文件（绝对路径） | 动作 | 行数变化 | 落点行 |
|---|---|---|---|---|
| 1 | `E:\CC\tomorrow-memory\packages\ui\src\auth\ChangePasswordForm.tsx` | 改（实现，最小化） | 276 → 282（+6：净逻辑只删 1 个条件式，其余 6 行为注释；props/DOM/样式零变化） | 第 10-12 行头注释订正；第 135-146 行 `newError` |
| 2 | `E:\CC\tomorrow-memory\packages\ui\test\auth.spec.tsx` | 补用例（既有 spec 内新增 1 个 describe / 3 条 `it`） | 775 → 855（+80） | 第 536-615 行 |
| 3 | `E:\CC\tomorrow-memory\.delivery\04-dev-report-T-06-r.md` | 新建（本报告） | — | — |

未新建任何 spec 文件；未触碰 `packages/shared/**`；未触碰 `apps/web/tests/account-security.spec.ts`。

## 2. 判据对账

| 判据 / 约束 | 要求 | 本次如何满足 | 证据（可复核） |
|---|---|---|---|
| A-41 #62（本缺陷） | 服务端 `code='WEAK_PASSWORD'` + `codeField='new'` 时**必须**在新密码字段下方显示原因，不得静默 | 删除 `codeField === 'new' && code !== 'WEAK_PASSWORD'` 里的排除式，使 `WEAK_PASSWORD` 与其他映射到 `new` 的码走同一条「服务端码 → 字段下」通路 | `ChangePasswordForm.tsx:140-146`；新用例 1 断言 `role="alert"` 节点的 `textContent` **逐字** `=== TM_ERRORS.WEAK_PASSWORD.copy` |
| T-13 判据④（§10.2 第 895 行） | 文案全部 `import` 自 `@tm/shared/constants/errors`，组件内 0 中文字面量 | 只用了 `TM_ERRORS[...]`（组件里唯一新增文本来源即该对象），未新增任何字面量；`packages/shared/src/constants/errors.ts` 未改 | 既有源码级用例「src/auth 七个文件去注释后 0 处中文字面量」保持绿；新用例 1 额外跑 `expectAllCopyFromShared`（可见中文串 ∈ shared 全量文案反查） |
| 「客户端自有校验优先级保持原样」 | `touched` 才报客户端长度错的 behavior 不许变 | `touched.new && (newTooWeak \|\| newTooLong)` 分支原样保留，仅在其前面接上服务端通路；服务端无码时行为与改前逐字一致 | `ChangePasswordForm.tsx:142-145`（原 137-138 行逻辑未改写，只删了排除条件）；新用例 2 断言「未 blur 前不报错、blur 后按长度报错」这条通路仍走 `TM_ERRORS.WEAK_PASSWORD.copy` |
| 「不互相覆盖、按 code 归到对应字段」 | 服务端原因不得顶掉更精确的客户端原因，反之亦然 | `CODE_FIELD` 单点映射未动：`OLD_PASSWORD_*`→old、`PASSWORD_SAME_AS_OLD`/`WEAK_PASSWORD`→new、`PASSWORD_MISMATCH`→confirm、非映射码→主按钮下（`underButton` 原逻辑未动） | 新用例 2（`PASSWORD_MISMATCH` 只落确认框、新密码框仍显示自己的长度原因）+ 新用例 1（断言 old/confirm 无错、主按钮下无 `password-form-error`） |
| 反向哨兵 | 「服务端拒绝不会静默」需有兜底断言 | 组件已有 `serverMessage` 通路（`underButton`），本轮**只断言其生效**、不改它 | 新用例 3：未知 code + `serverMessage` → `password-form-error` 逐字显示；已知码（`TEMP_LOCKED`）优先于 `serverMessage` |
| 边界：不许两个 agent 同改一个断言 | `apps/web/tests/account-security.spec.ts:132` 的 `test.fail()` 钉法归 T-15r2c | **完全未动该行**。该钉法是为钉住本缺陷而设，缺陷本轮已修 ⇒ 语义上已过时，**待 T-15r2c 删除**（A-41 #62 明令，本 agent 不越权） | `git status` 可证 `apps/web/**` 无本 agent 改动 |
| 边界：文案单源 | `packages/shared/**` 禁改 | 只读 `errors.ts` 第 85 行附近取 `WEAK_PASSWORD.copy`（`'密码至少 8 位'`），未编辑该文件 | 见上表第 1 行 |

## 3. 出口命令原文与输出摘要

命令原文（本轮实际使用 1 次、内含两条命令）：

```
pnpm --filter @tm/ui test
pnpm --filter @tm/ui typecheck
```

输出摘要：

```
$ vitest run --root ../.. --project @tm/ui
 ✓  @tm/ui  test/ui.spec.tsx (38 tests) 57ms
 ✓  @tm/ui  test/auth.spec.tsx (58 tests) 422ms
 ✓  @tm/ui  test/patterns.spec.tsx (51 tests) 502ms
 Test Files  3 passed (3)
      Tests  147 passed (147)
 Duration  2.17s

$ tsc -p tsconfig.json --noEmit
（无输出 = 0 错误）
```

- 名下文件全绿：`auth.spec.tsx` 由 55 tests → **58 tests 全过**（新增 3 条），`@tm/ui` 全套 147/147 通过，typecheck 干净。
- `test/patterns.spec.tsx` 的 `Error: Not implemented: navigation (except hash changes)` 是 jsdom 对 `<a href>` 的既有 stderr 噪声，该文件仍 51 tests passed，非本轮引入。
- 全套仓库数字本轮**未跑**（出口命令按任务规定只到 `@tm/ui` 两格）；`apps/web` 的 `account-security.spec.ts:132` 钉法在本缺陷修复后预期会从「`test.fail()` 通过」翻成失败（因为钉的是旧行为），**这是 T-15r2c 的删除动作，不是回归**；另有 3 个 agent 并行跑同一工作区，任何瞬时红都**疑似并发所致**，本 agent 名下两格已单独证明为绿。

## 4. 改动 diff 要点

`packages/ui/src/auth/ChangePasswordForm.tsx`（净逻辑改动 = 1 个条件式）：

```diff
@@ 头注释 §3.9.5 落点表（第 10-12 行）：把「WEAK_PASSWORD → 强度条」订正为「服务端 WEAK_PASSWORD → 新密码框下（强度条只是常驻说明），不得只靠强度条、更不得静默」
- * 错误落点按 §3.9.5：… ；`PASSWORD_SAME_AS_OLD` → 新密码框下；
- * `WEAK_PASSWORD` → 强度条；`TEMP_LOCKED` → 主按钮下且**不显示倒计时、只禁提交**（§3.9.4）。
+ * 错误落点按 §3.9.5：… ；`PASSWORD_SAME_AS_OLD` / 服务端 `WEAK_PASSWORD`
+ * → 新密码框下（强度条只是常驻说明；服务端按更强策略拒绝时**必须**在字段下给出可见原因，
+ * 不得只靠强度条、更不得静默 —— A-41 #62 / T-06r）；`TEMP_LOCKED` → 主按钮下且**不显示倒计时、只禁提交**（§3.9.4）。

@@ newError（原 134-139 → 现 135-146）
+  /** §3.9.5 落点：`codeField` 命中的字段**必须**显示服务端原因，不得静默（A-41 #62 / T-06r）。… */
   const newError =
-    codeField === 'new' && code !== 'WEAK_PASSWORD'
+    codeField === 'new'
       ? TM_ERRORS[(code ?? 'PASSWORD_SAME_AS_OLD') as TmErrorCode].copy
       : touched.new && (newTooWeak || newTooLong)
         ? TM_ERRORS.WEAK_PASSWORD.copy
         : undefined;
```

要点：
1. 唯一行为改变 = 去掉 `&& code !== 'WEAK_PASSWORD'`。改后 `WEAK_PASSWORD` 走 `TM_ERRORS[code].copy`，与 `AuthFormShell` 里 `passwordError` 的既有写法（`codeField === 'password' ? TM_ERRORS.WEAK_PASSWORD.copy : …`，`AuthFormShell.tsx:351-356`）**同构**，即向表单族既有模式收敛，不是新造机制。
2. 未改 props、未改 DOM 结构、未改样式、未改 `CODE_FIELD`、未改 `underButton`/`locked`/`handleSubmit`，未顺手重构。
3. 强度条（`role="status"`）与新字段错误（`role="alert"`）是两个节点，本轮改动不会让二者互相顶替；新用例显式断言 `expect(error).not.toBe(byTestId(container, 'password-strength'))`。

`packages/ui/test/auth.spec.tsx`（第 536-615 行，插在判据④与判据⑤两个 describe 之间）：新增 1 个 describe + 局部 helper `fieldError(scope, control)`（`input → .relative → PasswordField 外层 div` 内找 `[role="alert"]`，刻意不用 `textContent` 全局包含，避免再被强度条同句文案蹭绿）。3 条 `it`：
1. `code=WEAK_PASSWORD + codeField=new`：先灌入**客户端长度合规**的口令（由 `PASSWORD_MIN` 派生的 `OK_PASSWORD`，用例内断言其长度 ≥ `PASSWORD_MIN`），再断言新密码框下 `role="alert"` 文本 `toBe(TM_ERRORS.WEAK_PASSWORD.copy)`（逐字）、`aria-invalid="true"`、`aria-describedby` 含该错误位 `id`、old/confirm 无错、无 `password-form-error`、可见中文串全在 shared。
2. 互不覆盖：`errorCode="PASSWORD_MISMATCH"` + 新密码短于 `PASSWORD_MIN` 并 blur ⇒ 新密码框显示自己的长度原因、确认框显示 `PASSWORD_MISMATCH.copy`，两条同时成立。
3. 反向哨兵（不静默）：未知 code（`'PASSWORD_POLICY_VIOLATION'`，不在 `TM_ERRORS` 内）+ `serverMessage` ⇒ 主按钮下 `password-form-error`（`role="alert"`）逐字显示该人话；并断言已知码 `TEMP_LOCKED` 优先于 `serverMessage`、且不会误落新密码字段。

## 5. 上报未修（发现但本轮范围外，未动）

1. **未知 code 且无 `serverMessage` 时仍会静默**：`errorCode` 为非 `TM_ERRORS` 码的字符串、宿主又没给 `serverMessage` 时，`code`/`underButton` 双双为 `undefined` ⇒ 提交后无任何反馈。修法需要一条通用兜底文案，而 `packages/shared/src/constants/errors.ts` 里**不存在**任何通用码（grep `NETWORK|UNKNOWN|INTERNAL|SERVICE_UNAVAILABLE|MAINTENANCE` = 0 命中），组件内又不许写中文字面量 ⇒ 需先在 shared 加格子（`packages/shared/**` 本轮禁改）。建议登记给 T-03/T-14 的文案单点 owner。
2. **`serverMessage` 落在主按钮下而非被拒字段下**：宿主只回人话不带码时无字段归属信息，现状只能整表单级展示。若 §3.9.5 要求字段级，需要服务端契约加 `codeField` 一并透传（属 T-14/T-19 契约面）。
3. **强度条与新密码字段错误同句共存**（`密码至少 8 位` 一次输入后可能出现两处）：属 §3.9.2/§3.9.5 的视觉口径问题，非本缺陷，未动 DOM。
4. **`apps/web/tests/account-security.spec.ts:132` 的 `test.fail()` 钉法已过时**（本缺陷已修，该钉法会把「已修好」判成红）：按 A-41 #62 明令，**待 T-15r2c 删除**，本 agent 未触碰。
5. `ForcePasswordUpgradeForm` 复用本组件 ⇒ 强制改密页的服务端 `WEAK_PASSWORD` 一并被本轮修好（同一通路，无需额外改动），未单独补用例以免与其 owner 的 spec 重叠。

## 6. 遗留清单

| # | 遗留 | 归属建议 | 阻塞面 |
|---|---|---|---|
| L-1 | 上报未修 #1：shared 缺通用错误码 ⇒ 未知 code 无 `serverMessage` 仍静默 | T-03（`errors.ts` owner）→ T-14（单点处理消费） | 不阻塞本缺陷关闭 |
| L-2 | 上报未修 #2：`serverMessage` 无字段归属，只能落主按钮下 | T-14 / T-19 契约轮 | 不阻塞 |
| L-3 | 上报未修 #3：强度条 + 字段错误同句双现的视觉口径 | UI owner（§3.9.2）复看 | 不阻塞 |
| L-4 | `account-security.spec.ts:132` `test.fail()` 待删（本轮按禁令未动） | **T-15r2c** | 全套 `apps/web` 数字会因此瞬时红 |
| L-5 | 本轮只跑 `@tm/ui` 两格（任务规定的出口命令），`@tm/ui` 之外的 lint/build/boundaries 未跑 | 出口批次 | 不阻塞 |
| L-6 | 工作区另有 3 个 agent 并行；`git status` 显示 `packages/ui/` 整体仍未纳入版本控制（`?? packages/ui/`），故本轮无法给出 `git diff`，diff 要点以手工对照原文写就 | TPM / 出口轮 | 不阻塞 |
