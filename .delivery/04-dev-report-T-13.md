# T-13 开发报告 —— `@tm/ui/auth` 表单族（登录/注册两态一壳 + 激活认领 + 强制改密 + 强度条）

- 任务：§10.2 批次2 **T-13**（`@tm/ui/auth` 7 件；唯一排期表 = §10.2 T-13 行）
- 角色：前端开发（角色卡 `roles/dev.md`）
- 轮次：**首轮实现**（盘上原只有 T-04 预置的 `auth/index.ts` 空占位，`src/auth/**` 无实现）
- 日期：2026-09-19

---

## 0. 结论一句话

**7 件全部落地：`pnpm --filter @tm/ui typecheck` 绿（exit 0）；`auth` 面 55 条用例全绿（`test/auth.spec.tsx` 55/55）；`--check-ownership task=T-13` 无越界；`depcruise packages/ui/src/auth` 0 违规。**
完成判据 **①~⑥ 全部闭合**，每条有「具名测试 + DOM 断言 + 源码扫描」三类证据（见 §2）。
`packages/shared/**` 一字未改；缺的常量全部列进 §4 清单，缺口处**留 props 覆写位 + TODO 注释**，组件内没有顶替任何字面文案（判据④有源码级反查断言）。

**待裁决点（3 条，均不阻塞判据闭合）**

1. **`AUTH_COPY` 缺 5 组本任务必需文案**（§4 全清单）：其中 2 条是**功能必需** —— ①登录↔注册次级文字链（UI §3.9.1:1027 `没有账号？注册` / `已有账号？去登录`）、②`PHONE_ALREADY_REGISTERED` 提示卡动作（§3.9.5:1080 `去登录`）。shared 不补，宿主就只能自己传字符串，"文案单一源"就从 shared 退到各端；建议 **T-03 本轮直接补上**。
2. **R-23⑤ 与 UI §3.9.1 表格互斥**：登录态到底要不要协议勾选。当前默认按 §3.9.1（不出现），并留 `requireAgreementOnSignIn` 开关；请 TPM 裁决一次（改默认值即全站生效，不必改组件）。
3. **`TM_ERRORS.PHONE_ALREADY_REGISTERED.clientAction = 'switch-to-register'` 语义反向**（`errors.ts:99`）：§3.9.5:1080 要求"这个手机号已经注册过，请直接登录" → 应切**登录**态。本件按 §3.9.5 实现（切 sign-in），shared 那个字段请 T-03 修正，否则宿主按 shared 字段实现会与本组件相反。

---

## 1. 冒烟（原始输出，未编辑）

### 1.1 `pnpm --filter @tm/ui test -- auth`

```
$ vitest run --root ../.. --project @tm/ui "--" "auth"
 ...
 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 141 passed (142)
   Duration  2.43s
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/ui@0.0.0 test: ... Exit status 1
```

**两点必须说清（不是掩盖）**：

1. 脚本尾部已有的 `--` 让 vitest 把包脚本里的 `--` 之后的参数当位置参数吞掉，实际等价 `vitest run --project @tm/ui`，**`auth` 过滤器未生效 → 跑的是 @tm/ui 全部 3 个 spec 文件（142 条）**。要只跑本任务的面：
   `pnpm exec vitest run --project @tm/ui auth`（§1.2）。这属 T-01 脚本口径问题，我没改 `packages/ui/package.json`。
2. 唯一的红是 `test/ui.spec.tsx`（**T-04 基线文件，不在我的可写清单**）第 504-505 行：

```
 FAIL  @tm/ui  test/ui.spec.tsx > 判据③ ... > 根出口无人抢改；patterns 出口已由 T-05 填满 14 件，auth 出口仍是空占位
AssertionError: expected 'export*from\'./NoticeBar.js\';export*…' to be 'export{};'
 ❯ test/ui.spec.tsx:504:88
```

该断言的字面前提是"**T-13 尚未开工**"（文件内注释 461 行原文）。T-13 交付后它必然变红，属**排期推进断言**、不是本实现缺陷；须由该文件 owner 按 patterns 那一条的写法改成"auth 出口已由 T-13 填满 7 件"。我没有放宽、也没有删任何断言。

### 1.2 `pnpm exec vitest run --project @tm/ui auth`（本任务面，全绿）

```
 ✓  @tm/ui  test/auth.spec.tsx (55 tests) 388ms

 Test Files  1 passed (1)
      Tests  55 passed (55)
   Start at  18:36:30
   Duration  2.44s
```

### 1.3 `pnpm --filter @tm/ui typecheck` —— 绿

```
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0
```

### 1.4 附加门禁（只读取证，未改 `tools/**`）

```
$ node tools/boundaries.mjs --copy --colors --ui-io
RED  copy-legacy-zero      1 处命中：packages/ui/src/patterns/EmptyState.tsx:6；需人工复核词命中 108 处（不判红）
RED  colors-no-hardcode    2 处命中：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
OK   colors-purple-retired / colors-tailwind-palette / focus-ring-not-hidden / dark-variant-budget(dark: 2 处，预算 3)
RED  css-important-budget  !important 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:684 | :688
OK   ui-no-io-globals      0 命中（扫描 packages/ui/src）
5/8 条通过，3 条红
```

**三条红没有一条在 `src/auth/**`**（分别是 T-05 的 `EmptyState.tsx`/`GrowthLine.tsx`/`patterns.spec.tsx`、T-04 的 `tokens.css`、T-14 的 `app.css`）。`dark:` 预算与 `ui-no-io` 由我这条面维持 OK。

```
$ node tools/boundaries.mjs --check-ownership --task T-13 --files <本次 9 个文件>
NOTE packages/ui/test/auth.spec.tsx：归属表无条目（no-entry，不阻断）
--check-ownership task=T-13 触碰 9 个文件 → 无越界

$ pnpm exec depcruise packages/ui/src/auth --config .dependency-cruiser.cjs
✔ no dependency violations found (27 modules, 75 dependencies cruised)
```

---

## 2. 完成判据逐条取证（§10.2 T-13 行）

计数口径先说清（这是判据①能不能"可测"的前提）：**5 个主控件带 `data-auth-control`**，其余可交互元素必带 `data-auth-switch` / `data-auth-secondary` / `data-auth-affordance` / `data-auth-link` 四类次级标记之一，测试用一条"不得存在无标记可交互元素"的反查兜住，因此计数不受"眼睛按钮 / 书名号链接"是否渲染影响。作用域 = `[data-testid=auth-form]`。

| 判据 | 结论 | 证据（`packages/ui/test/auth.spec.tsx` 具名用例） |
|---|---|---|
| ① 两态齐；注册态可交互元素 = 5；底部小字 1 处 | ✅ | `注册态：可交互主控件恰好 5 个…`：`[data-auth-control]` 长度 **5**、键集恰为 `{phone,password,confirm,agreement,submit}`；`除 5 个主控件外的可交互元素一律带次级标记`：无标记元素集合 `= []`；`底部小字区只有 1 个可交互元素…`：`[data-slot=auth-footer]` 内交互元素 **1**（= 验证码入口），公告条交互 **0**；`登录态逐元素计数`：3 控件 + 1 文字链 + 1 小字 = **5**；`激活认领不新增第三态`：`data-testid`+`data-auth-control` 组成的 DOM 结构数组与注册态**逐元素相等**，只有 `auth-title`/`auth-submit` 文案不同（`AUTH_COPY.dialog.activate` / `AUTH_COPY.submit.activate`） |
| ② 主按钮全站唯一；切换保留手机号与勾选、清空两个密码框 | ✅ | `两态各自只有 1 个主按钮…`：`[data-auth-control=submit]` = 1、`button[type=submit]` = 1；登录态品牌底按钮 = 1 且就是主按钮（注册态未勾协议时主按钮按 §3.9.6 走 `bg-hair` 禁用样式，已单独断言）；`注册 → 登录 → 注册…`：点 `data-auth-switch` 后手机号仍是 `138 0000 0000`、两个密码框都 `''`，切回注册后勾选 `aria-checked=true` 保留、两个密码框仍空；另加 `未勾协议时主按钮 aria-disabled…焦点进勾选框`（提交不被调用、`AGREEMENT_REQUIRED` 逐字、焦点落在勾选框） |
| ③ 验证码入口 = 12px 文字（不是按钮）+ 旁注常驻 | ✅ | `入口用 text-xs（12px），不套 Button 基元的按钮盒`：className 含 `text-xs`，且不含 `h-field/h-tap/h-9/rounded-md/bg-brand/px-4/shadow-elev-1` 任一；旁注 `AUTH_COPY.smsHint` 与入口同屏常驻、也是 `text-xs`；`点击后：就地显示通道未开通，不出现"已发送"、不启动倒计时`：`data-cooldown` 恒 `off`、`sms-result` = `AUTH_COPY.smsResult`（= `TM_ERRORS.SMS_NOT_CONFIGURED.copy`）、全树 `!/已发送\|发送成功/`、入口无 `disabled`；`通道接上后才允许倒计时` 证明倒计时逻辑位在、本期永不触发（R-23⑥） |
| ④ 错误文案全部 import 自 `@tm/shared` | ✅ | 运行时反查 `expectAllCopyFromShared()`：把 `@tm/shared` 全量导出压成一个字符串，逐条要求"渲染出的每条中文串都能在 shared 里原样找到"，覆盖 AuthFormShell 10 个码 × ChangePasswordForm 6 个码 × 强制改密页 × 两态；`逐码落点（§3.9.5）`：`INVALID_PHONE`→字段下、`PASSWORD_MISMATCH`→确认框下、`PHONE_ALREADY_REGISTERED`/`NO_PASSWORD_ACCOUNT`/`REGISTER_CLOSED`→提示卡、`TOO_MANY_REQUESTS`/`TEMP_LOCKED`→主按钮下；源码级 `src/auth 七个文件去注释后 0 处中文字面量` |
| ⑤ `ForcePasswordUpgradeForm` 无关闭、无"以后再说" | ✅ | `出口 = 2…`：整棵强制改密子树里 `<button>` **恰好 2 个**（submit=`AUTH_COPY.forceUpgrade.submit`、`data-auth-secondary=sign-out`=`AUTH_COPY.forceUpgrade.secondary`）；`无返回箭头 / 无关闭件 / 无第三出口`：可交互元素集合恰为 `{old-password,new-password,confirm-password,submit,sign-out}`、无 `data-auth-affordance`、出口按钮无 `aria-label`、无 `data-dismiss`；`渲染出的文字里不存在任何延后/关闭语义串；src/auth 源码亦 0 命中`（§3.9.4:1069 全站 0 处清单 + 页面上再加 `关闭/跳过/取消`）；`被拦下的返回：Esc/alt+← 不后退、shake 一次（位移 ≤4px）…`：`defaultPrevented=true`、`data-nudge=true`、位移类 `translate-x-[3px]`（≤4px）、120ms 后复位、`blockedBackSignal` 自增再触发一次；`TEMP_LOCKED 只禁用提交、本页不显示倒计时` |
| ⑥ 强度校验复用 `PASSWORD_MIN`/`PASSWORD_MAX` | ✅（口径见下） | 源码级：7 个文件去注释后 `[<>]=?[1-9]` **0 命中**（不存在任何与数字比较的判据）、`.length === 数字` 0 命中；`AuthFormShell`/`ChangePasswordForm` 必含 `PASSWORD_MIN` + `PASSWORD_MAX_BYTES` + `.length < PASSWORD_MIN`；`PasswordStrength` 必含 `passwordStrength(` 与 `AUTH_COPY.strengthLevels.length` 且**不得**出现 `PASSWORD_MIN/MAX`（它不做放行）；运行时：`PASSWORD_MIN-1` 位不放行（强度条 `data-level=0`、文案 = `TM_ERRORS.WEAK_PASSWORD.copy` = `strengthLevels[0]`）、`PASSWORD_MIN` 位放行、`PASSWORD_MAX_BYTES` 个全角假名（240 字节）不放行；段数/档位与 `passwordStrength()` 逐样本相等。**口径说明**：shared 里没有 `PASSWORD_MAX`，只有 `PASSWORD_MAX_BYTES = 72`（字节口径，NIST 一致），本件按它实现 —— 见 §4 第 7 行 |

补充取证（同属本任务面）：
- `七个组件文件都在盘上，二级出口逐一再导出` + 根出口 `export * from './auth/index.js'` 在位；
- `§3.5 ui-no-io 与组件契约`：7 个文件均无 `fetch(`/`XMLHttpRequest`/`node:`/`react-dom/`/`next/`/`localStorage`/`Date.now`/`Math.random`，均以 `'use client';` 开头，且不 re-export 基元；
- R-01⑤ 默认焦点在密码框（`document.activeElement` 断言）。

---

## 3. 七件组件状态表

| # | 组件 | 文件 : 行数 | 规范落点 | 状态 | 宿主必读 props |
|---|---|---|---|---|---|
| 1 | `NoticeBar` | `packages/ui/src/auth/NoticeBar.tsx` : 157 | §3.9.3 提示卡 / §3.9.4 页面告知 / §6.6 公告条 | ✅ | `layout:'card'\|'bar'`、`tone`、`title?`、`action?{label,onClick}`、`role`（card=alert/bar=status） |
| 2 | `PasswordStrength` | `…/PasswordStrength.tsx` : 85 | §3.9.2 强度条（4 段 4px + `gap-1` + 右侧 12px） | ✅ | `value`（唯一入参，档位= `passwordStrength()`）、`hideLabel?` |
| 3 | `AgreementCheckbox` | `…/AgreementCheckbox.tsx` : 171 | §3.9.2 勾选行（16px 勾 + 44px 命中行 + 书名号成链不切换勾选） | ✅ | `checked`/`onChange`、`error`+`describedby`、`termsHref`/`privacyHref` 或 `onOpenTerms`/`onOpenPrivacy`、`buttonRef` |
| 4 | `SmsCodeEntry` | `…/SmsCodeEntry.tsx` : 99 | §3.9.1 底部小字 / §3.9.5:1091 入口硬规则 | ✅ | `phone`、`onRequestCode`、`channelReady`（本期恒 false）、`cooldownSecondsRemaining` |
| 5 | `AuthFormShell` | `…/AuthFormShell.tsx` : 686（含导出的 `PasswordField`、`digitsOnly`、`formatPhoneForDisplay`、`utf8Bytes`） | §3.9.1/3.9.2/3.9.3/3.9.5/3.9.6；R-01⑤⑥⑧、R-39②③⑥⑨、R-23④ | ✅ | `onSubmit`、`mode`/`defaultMode`、`activate`、`errorCode`/`serverMessage`、`showUnregisteredHint`、`pending`、`requireAgreementOnSignIn`、**以及 §4 清单对应的文案覆写位**（不传即不渲染，绝不内联） |
| 6 | `ChangePasswordForm` | `…/ChangePasswordForm.tsx` : 277 | §3.9.4 末段（普通改密复用同一表单）；R-40①②、R-31① | ✅ | `onSubmit({oldPassword,newPassword,confirmPassword})`、**`submitLabel` 必填**（shared 缺"保存新密码"）、`title`、`headerAction?`、`belowSubmit?`、`result?`、`oldPasswordRef?` |
| 7 | `ForcePasswordUpgradeForm` | `…/ForcePasswordUpgradeForm.tsx` : 183 | §3.9.4；R-40③④⑩（判据⑤） | ✅ | `onSubmit`、**`onSignOut`（唯一副出口）**、`blockedBackSignal`（路由守卫/返回键桥自增）、`subtitle`（§4 第 4 行，缺省不渲染）、`result`（成功后的常驻条） |

出口：`packages/ui/src/auth/index.ts`（13 行，7 条 `export * from './X.js'`）；根 `packages/ui/src/index.ts` 已有 `export * from './auth/index.js'`，**未改**。测试：`packages/ui/test/auth.spec.tsx`（776 行 / 55 条）。

---

## 4. 待 shared 补的常量清单（交 T-03 / TPM；我未碰 `packages/shared/**`）

| # | 建议键 | 逐字要求出处 | 现在怎么处理 | 影响 |
|---|---|---|---|---|
| 1 | `AUTH_COPY.switchToRegister` = `没有账号？注册` / `AUTH_COPY.switchToSignIn` = `已有账号？去登录` | UI §3.9.1:1027 | `switchToRegisterLabel` / `switchToSignInLabel` 覆写位，**不传就不渲染切换链** | **高**：没有这两条串，用户无法在登录↔注册间切换；宿主只能自带字面串，单一源退化 |
| 2 | `AUTH_COPY.cardActions.goSignIn` = `去登录` | §3.9.5:1080 | `alreadyRegisteredActionLabel` 覆写位（缺省时卡片只给文案不给动作） | 中：`PHONE_ALREADY_REGISTERED` 的"可点下一步"（R-23④）缺动作 |
| 3 | `ARIA.showPassword` = `显示密码` / `ARIA.hidePassword` = `隐藏密码` | §3.9.1:1035（Eye/EyeOff + `aria-pressed`） | `showPasswordLabel`/`hidePasswordLabel`；**两个都不传时眼睛按钮不渲染**（§7.3 强制改密页 Tab 序也只有 5 项，故强制页默认不渲染是对的） | 中：注册/登录态缺显示密码切换的无障碍名 |
| 4 | `AUTH_COPY.forceUpgrade.subtitle` = `这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。` | §3.9.4:1063（逐字） | `ForcePasswordUpgradeForm.subtitle` 覆写位（缺省不渲染） | 中 |
| 5 | 普通改密：`AUTH_COPY.changePassword.title` = `修改密码`、`.submit` = `保存新密码` | §3.9.4:1070 | `ChangePasswordForm.submitLabel` **必填**、`title` 可选 | 中：T-19 `SecurityScreen` 接它时必须自己给串 |
| 6 | 改密成功反馈：`密码已更新`（toast）、`其他设备需要重新登录`（常驻 6 秒条） | §3.9.4:1066 / R-40③；`limits.ts:121-122` 已有 `TOAST_LONG_MS` 但**没有对应文案常量** | `result` 槽由宿主挂 `NoticeBar`；toast 走 `UiHost` | 中 |
| 7 | `PASSWORD_MAX` 命名与口径 | 判据⑥写的是 `PASSWORD_MIN`/`PASSWORD_MAX`，shared 只有 `PASSWORD_MIN=8` + `PASSWORD_MAX_BYTES=72` | 本件按 `PASSWORD_MAX_BYTES`（UTF-8 字节）实现并加注释 | 低（口径请 TPM 确认一句：字节 vs 字符） |
| 8 | 手机号展示分组/占位：`PHONE_DISPLAY_GROUPS=[3,4,4]`（`maxLength=13` 由它派生）、`PHONE_PLACEHOLDER` | §3.9.1:1035 | `AuthFormShell.tsx:128` 局部 `PHONE_DISPLAY_GROUPS` + TODO；`phonePlaceholder` 覆写位（缺省不写占位符） | 低（不参与合法性判定，只看 `PHONE_PATTERN`） |
| 9 | 60 秒倒计时可见标签（§3.9.5:1087"等 60 秒后按钮自动解禁"对应文字） | §3.9.5 / R-01⑥ | 倒计时中只置 `aria-disabled`，**不渲染任何自造文字**（`SmsCodeEntry.tsx` TODO） | 低（本期永不触发） |
| 10 | 登录（密码错）专属码：`errors.ts` 里**没有任何** credential 失败码，只有 `AUTH_COPY.wrongCredential` = `手机号或密码不正确` | §6 表:1534 / R-01① | 宿主以 `serverMessage={AUTH_COPY.wrongCredential}` 传入 → 渲染在主按钮下 | 中：建议补码（如 `WRONG_CREDENTIAL`）后本件接进 `CODE_FIELD`，宿主就不必传串 |
| 11 | `TM_ERRORS.PHONE_ALREADY_REGISTERED.clientAction` 应为 `'switch-to-sign-in'`（现值 `'switch-to-register'`，`errors.ts:99`） | §3.9.5:1080 | 本件按 §3.9.5 实现（切登录态、保留手机号） | 中（两端若按 shared 字段实现会与本组件相反） |

---

## 5. 越界申请 / 未触碰项

- **无需越界申请**：根出口 `packages/ui/src/index.ts` 已由 T-04 预留 `export * from './auth/index.js'`，我只写了允许清单内的 `src/auth/**` 与 `test/auth.spec.tsx`；`--check-ownership --task T-13` 结果 = **无越界**（§1.4）。
- 未改：`packages/ui/src/{primitives,patterns,styles,host.tsx,index.ts}`、`packages/shared/**`、`packages/server/**`、`apps/**`、`tools/**`、`mobile-memory/**`、`packages/ui/test/ui.spec.tsx`、`packages/ui/test/patterns.spec.tsx`。
- `packages/ui/package.json` **未改**，**没有新增依赖**（不需要；也未写任何 `pnpm.overrides`）。React/ReactDOM 用 workspace 统一值 19.2.8。
- **无任何 git 写操作**（只用了只读命令与文件写入）。

---

## 6. 遗留项

1. **测试装配未覆盖的两处需要真机/内核**（与 §3.9.6 走查项对应，非本文件能判定）：遮罩 `bg-ink/45`、弹窗焦点圈闭、软键盘 `visualViewport`、错误 150ms 高度展开 —— 属 T-16/T-19 宿主与 T-22 Playwright 面。
2. **宿主接入必须给的 props**（shared 补齐后即消失）：`switchToRegisterLabel`、`switchToSignInLabel`、强制改密页 `subtitle`、普通改密 `submitLabel`；`requireAgreementOnSignIn` 待裁决②定值后可去掉。
3. **强制改密页的 shake 在 reduced-motion 下应改为"1px 描边闪烁"**：已用 `motion-reduce:translate-x-0 motion-reduce:ring-1 motion-reduce:ring-focus` 表达，但 jsdom 不解析媒体查询 → 需 T-22 真机走查一眼。
4. `NUDGE_RESET_MS = 120`（`ForcePasswordUpgradeForm.tsx:60`）是本面唯一的时间字面量，对齐 `--dur-fast`=`--dur-micro`=120ms；等 §4 第 9 行的 `MOTION_FAST_MS`（建议同批补）到位后替换。注释已标注，不参与任何判据。
5. `PasswordStrength` 的 `FILLED_SEGMENTS`（1 档→1 段、2 档→3 段、3 档→满段）：§3.9.2 只写"2–3 段"区间，取整规则由本件定；若 QA 走查要 1 档=2 段，改这一处映射即可。

---

## 7. 不属于本任务的既成红/噪声（并行 agent 面，仅供收口时对照）

| 位置 | 现象 | 归属 |
|---|---|---|
| `packages/ui/test/ui.spec.tsx:504-505` | 断言"`auth/index.ts` 仍是 `export {};`"、"`src/auth` 下不得有实现" → T-13 交付后必红（前提已失效） | T-04 基线文件 owner；按 patterns 那条的写法改为"auth 出口已填满 7 件" |
| `boundaries --copy` | `packages/ui/src/patterns/EmptyState.tsx:6` 命中旧口径词 | T-05 |
| `boundaries --colors` | `packages/ui/src/patterns/GrowthLine.tsx:8`、`apps/app/src/styles/app.css:5` | T-05 / T-14 |
| `boundaries --colors` `css-important-budget` | `packages/ui/src/styles/tokens.css:89` + `patterns.spec.tsx:684,688`（>1 处） | T-04 / T-05 |
| `pnpm exec vitest run --project @tm/ui` stderr | `Error: Not implemented: navigation (except hash changes)` 来自 `test/patterns.spec.tsx`（jsdom 点 `<a href>`） | T-05 |
