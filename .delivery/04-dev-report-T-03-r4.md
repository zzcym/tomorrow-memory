# 04-dev-report-T-03-r4 —— FE-3 · shared 常量唯一写者（批次 4E / T-03r4）

- **自报行数（硬查项）· `wc -l` 原样输出行**：`157 .delivery/04-dev-report-T-03-r4.md`（命令：`wc -l .delivery/04-dev-report-T-03-r4.md`；写完量、只回填数字未增减行数）
- 任务：把 PM-fix7 定稿的两句登录态本地拦截串接回既有错误显示通道（§3.9.7）
- 写面（我发起的写入 = 4 份，逐条对账见文末 ⑥）：`packages/shared/src/constants/copy.ts`、`packages/ui/src/auth/AuthFormShell.tsx`、`packages/ui/test/auth.spec.tsx`。**三份均在简报白名单内**；`packages/shared/test/contracts.spec.ts` 与 `apps/app/test/login-screen.spec.tsx` **一字未改**（理由见 ①件 1 / 件 4）
- 未做：git commit / push、e2e、`@tm/server` 套件、build、`apps/web/**` 与 `apps/app/src/**` 与 `router.tsx` 的任何读取之外的动作、`.delivery/**` 主文档通读（只读了简报点名的 `01-prd-fix7.md` 与 `05-report-t29r.md` 两份定稿件）
- 真库 `data.db`：**未读未写**，指纹与 mtime 见 ④

---

## ① 四件落点（改后实测行号）

### 件 1 · `packages/shared/src/constants/copy.ts`：`AUTH_COPY` 两个平铺键（总行数 814 → **818**）

| 内容 | 实测行号 |
|---|---|
| 既有同族错误串 `unregistered` / `wrongCredential`（锚点，未动） | `:577` / `:578` |
| 串 A 单行注释（§3.9.7 + **PM-fix7 定稿** + 消费点符号名 `AuthFormShell` 登录态 `passwordError`） | `:579` |
| `signInPasswordMissing: '这里还空着，填一下再点登录'` | `:580` |
| 串 B 单行注释（同上，并写明"换掉原先借用的 `TM_ERRORS.WEAK_PASSWORD.copy`"） | `:581` |
| `signInPasswordTooLong: '这里太长了，删短一点再点登录'` | `:582` |
| 紧邻的 `noPasswordAccount`（锚点，未动） | `:583` |

- 键形 = **平铺**，紧挨同族两条错误串之后（PM §四 唯一取值）；两串逐字照抄，0 改字、0 加数字。
- **`contracts.spec.ts` 未同步、未改**：该文件对 `AUTH_COPY` 的键集合钉只有一处，是 `:795-801` 那个"本轮之前的键**一个不少**"的**存在性**钉（`expect(AUTH_COPY, key).toHaveProperty(key)`），不是封闭集合钉（该文件的 `Object.keys` 用法全部落在 `SHARED_SRC` 键名 / `TM_ERRORS` 码位（`:360`）/ 垫片导出对（`:564-565`）/ 各 schema `shape`（`:576-595`）上，**没有一处**枚举 `AUTH_COPY` 的键集）。存在性钉对"只增"天然免疫 ⇒ 按简报口径"无键集合钉需同步"，冻结三集合 `TM_ERRORS` / `TM_ERROR_CODES` / `TM_ERROR_ROWS` 一字未动（A-8）。
- 顺带确认：`:469` 那条"门禁禁词在 shared 全部产出里 0 命中"扫的是 `packages/shared/src/**` 全量字面，`BANNED_TERMS_LOCAL`（`:200-214`）不含新串任何子串 ⇒ 新键进入扫描面后仍 0 命中（出口命令 1 的 52/52 即证）。

### 件 2 · `packages/ui/src/auth/AuthFormShell.tsx`：两条本地拦截接回话术通道（改后实测 732 行；本轮 +23 行，全在 `:334-339` / `:362-382` / `:443-464` 三处，锚点位移可核：`passwordEmpty` 由 `:353`→`:359`、`handleSubmit` 由 `:415`→`:433`）

| 内容 | 实测行号 |
|---|---|
| **未动**：`agreementBlocked` 既有 state（范式来源） | `:332-333` |
| 🆕 `signInLocalBlocked` state + 6 行注释（为什么不能共用 `touched.password`） | `:334-339`（语句本体 `:339`） |
| **一字未动**：三条判据 `passwordEmpty` / `passwordTooWeak` / `passwordTooLong`（含 `PASSWORD_MIN` / `PASSWORD_MAX_BYTES` / `utf8Bytes` 引用） | `:359` / `:360` / `:361` |
| ✏️ 注释块补记 T-03r4 接入理由（原 D-1 三行原样保留） | `:362-374` |
| ✏️ `passwordError`：服务端回码分支优先 + 登录态两条各引 `AUTH_COPY.signInPasswordMissing` / `signInPasswordTooLong`（同一变量、同一条通道） | `:375-382`（`:376-377` = 未动的 `codeField === 'password'` 回码出口；`:378-379` 串 A、`:380-381` 串 B、`:382` `undefined`） |
| **未动**：`confirmError` / `agreementError` / `underButtonError` | `:383-393` |
| ✏️ 切态清理：`setSignInLocalBlocked(false)` 紧跟既有 `setAgreementBlocked(false)` | `:418-419` |
| ✏️ `handleSubmit` 两条出口的注释补记（`不发请求 + focus` 两个行为原样描述） | `:444-450` |
| **拦截行为一字未动**，只各加一行置真：`if (isRegister) { if (passwordTooWeak) return; }`（`:450-451`）→ `else if (passwordEmpty) { setSignInLocalBlocked(true); passwordRef.current?.focus(); return; }` | `:452-456`（置真 `:453`） |
| `if (passwordTooLong) { if (!isRegister) setSignInLocalBlocked(true); passwordRef.current?.focus(); return; }` | `:457-461`（置真 `:458`） |
| 放行前清态：`setAgreementBlocked(false)` + `setSignInLocalBlocked(false)` | `:463-464` |
| 既有成功出口 `void onSubmit({...})`（未动） | `:465` |
| 槽位（**未动、未新开**）：`PasswordField` 的 `{error ? (<p id={errorId} role="alert" className="mt-1 text-xs text-danger">…) : null}` 渲染块 | `:263-267`（`<p>` 本体 `:264`）；两处 `error={passwordError}` 传参 `:595`（注册态）/ `:620`（登录态） |

- **显示时机**（PM §一 明令）：串只在 `signInLocalBlocked` 真时出。该开关**只由点主按钮**置真；`onBlur` 置的是 `touched.password`，二者不共用 ⇒ 用户没提交时输入框为空**不常驻红字**（新钉 4 锁死）。选这条而不是直接挂 `touched.password`，是因为挂了会把 T-29 组 ④ 那条"blur 之后 `fieldAlert` 仍为 null"的既有时机钉（`auth.spec.tsx:974`）判红 —— 既有钉零放松优先于"沿用同一变量"。
- 三面零改动：`!isRegister` 前置在两条分支上，注册 / 激活 / 改密 / 强制改密都吃不到串（新钉 5 锁死）；`codeField === 'password'` 回码出口的优先级在前，`errorCode="WEAK_PASSWORD"` 时行为与串一字不变（既有 ④b `auth.spec.tsx:980-983` 仍绿）。

### 件 3 · `packages/ui/test/auth.spec.tsx`：只追加（总行数 1054 → **1187**）

- 🆕 块：`:1063-1187`（注释头 `:1063`、`describe` `:1065`、块末 `:1187` = 文件末行）
  - `:1066-1087` 组内常量与两个助手：`OVER_LONG`（= `PASSWORD_MAX_BYTES` 个 3 字节字符）、`MIN_BITS`（**正则由 `PASSWORD_MIN` 拼，用例不写死数字**）、`alertIn()`、`assertSameErrorSlot()`（钉"同一槽位"：节点在 `field-password` 内 + `aria-invalid=true` + `aria-describedby` 指向同一个 `id`）
  - 新钉 1 正向串 A：`:1089` 起（逐字 `toBe(AUTH_COPY.signInPasswordMissing)` + `onSubmit` 未调 + `document.activeElement` 仍是密码框 + 纯空格同路再钉一次 + `expectAllCopyFromShared`）
  - 新钉 2 正向串 B：`:1111` 起（逐字 `toBe(AUTH_COPY.signInPasswordTooLong)` + `onSubmit` 未调 + 焦点仍在密码框 + 字节越界由 `TextEncoder` 自证）
  - 新钉 3 反向哨：`:1126` 起（`['', 空格×`PASSWORD_MIN`, OVER_LONG]` 三态：整表单与 alert 对"至少 N 位"式话术 0 命中、0 `TM_ERRORS.WEAK_PASSWORD.copy`，并钉框下**只有**那一条定稿串）
  - 新钉 4 时机哨：`:1146` 起（打进去再清空 + blur ⇒ `alertIn` 为 `null`、串 A/串 B 都不在表单里；点过主按钮之后才出现）
  - 新钉 5 外溢哨：`:1165` 起（注册态与激活态 × 空/纯空格/超长 = 6 组：串 A、串 B 各自 0 命中，密码框下 0 alert 节点，`onSubmit` 未调）
- ✏️ **唯一一处既有钉改判（互斥申报见 ②b）**：`:1034-1042`（T-29r 组"反向哨 · 登录态过长路径"的最后一条断言）
- 未动：T-29r 三颗哨 `:988-1060`（其余断言一字未改）、T-29 组 `:862-984`、`contains→not.toContain` 那颗 `:776`、`:749-779` 全部、`:731-747` 源码级阈值钉、`:767-779`。

### 件 4 · 下游期望自查：**0 改判、0 红**

- `pnpm --filter @tm/app test` → **294/294 原样全绿**（简报基线 294/294），`apps/app/test/login-screen.spec.tsx` **一字未改**。
- 最可能翻红的 C-03（`:400-415`）实测仍绿，理由：它钉的是"填 `'123'` → **blur** → `alertOf(field-password)` 为 `null` → 提交发出 1 条 `POST /api/login`"，串 A 只在**点过主按钮**后置真（件 2 的 `signInLocalBlocked`），blur 不触发 ⇒ 该钉与本轮**不互斥**，无需按"最小反向改判"处理。同文件唯一的密码框 alert 钉就这一处（全文件 `field-password` 只出现在 `:410`）。
- `@tm/ui` 基线 156 → **161**（+5 颗新钉，0 删 0 skip 0 fail）。

---

## ② 三条出口命令的**原样尾行**

### ②a 三条命令（交回前的最后一轮实测尾行，三条同批跑于 `03:06:32`~`03:06:38`）

命令 1 · `pnpm --filter @tm/shared test`（基线 52/52 → 52/52）

```
 Test Files  1 passed (1)
      Tests  52 passed (52)
   Start at  03:06:32
   Duration  920ms (transform 186ms, setup 0ms, collect 501ms, tests 91ms, environment 0ms, prepare 136ms)
```

命令 2 · `pnpm --filter @tm/ui test`（基线 156/156 → 161/161）

```
 Test Files  3 passed (3)
      Tests  161 passed (161)
   Start at  03:06:35
   Duration  2.30s (transform 432ms, setup 0ms, collect 2.76s, tests 1.23s, environment 1.19s, prepare 406ms)
```

命令 3 · `pnpm --filter @tm/app test`（基线 294/294 → 294/294，用的是简报点名的 `pnpm --filter` 形式，未在 `apps/app` 裸跑 vitest）

```
 Test Files  14 passed (14)
      Tests  294 passed (294)
   Start at  03:06:38
   Duration  13.85s (transform 3.22s, setup 0ms, collect 16.47s, tests 45.40s, environment 11.58s, prepare 2.41s)
```

（`@tm/ui` 那一跑上方另有 `patterns.spec.tsx` 的 `Error: Not implemented: navigation` jsdom 存量 stderr 噪声，非本轮引入、不计失败。）

### ②b 如实登记：出口命令实际跑了 **7 次**（shared 2 · ui 3 · app 2），比简报的"≤3 条"多出 4 次

- 三条命令**各跑过一次即 PASS**；唯一的额外一次是命令 2（`@tm/ui`）在 `02:59` 的**首跑**为 `1 failed | 160 passed (161)`，唯一红点是 `auth.spec.tsx:1035` 的存量断言 `expect(alertIn(container,'password')).toBeNull()`（T-29r D-1 的"过长时压根没有 alert 节点"半句正面断言）。改判后 `03:00` 与交回前 `03:06` 两跑均 161/161。
- 处置：**最小反向改判**（`:1040-1042`）：`toBeNull()` → `not.toBeNull()` + `textContent` 逐字 `toBe(AUTH_COPY.signInPasswordTooLong)`。**这是收紧不是放松**（旧断言只排除节点存在，新断言同时锁死节点内容），同用例其余断言（两条 `MIN_BITS` 0 命中、blur 后两条、`onSubmit` 未调）一字未动。
- **互斥理由显式申报**：该断言钉的是"§3.9.7 落地前的过渡形态（focus 是唯一反馈）"；PM-fix7 定稿后登录态过长被拦时框下**必须**有串 B，二者不能同时成立。裁决依据取本文 §三 表格"同一错误槽、同一位置"与 §五 串 B②（"登录态路径 `WEAK_PASSWORD` 引用 = 0"仍成立）。若 TPM 判该处应保留旧期望，则件 2 串 B 半截不能做 —— 二者互斥，请裁留哪一条。
- 重跑后 161/161 即上表；无 `test.fail()`、无 `.skip`、无放松阈值。

---

## ③ 三处 grep 断言（实测命中数）

| # | 检查（命令口径） | 实测 | 判定 |
|---|---|---|---|
| 1 | **两串字面全仓源码声明点**：`grep -rn -F "<串>" packages apps tools scripts --include=*.ts --include=*.tsx` | 串 A = **1**（`packages/shared/src/constants/copy.ts:580`）、串 B = **1**（`copy.ts:582`）；`AuthFormShell.tsx` / `LoginWall.tsx` / `ChangePasswordForm.tsx` / `ForcePasswordUpgradeForm.tsx` / `apps/app/src` / `apps/web/src` / `packages/server/src` 逐面 `grep -c` = **0**（壳与宿主无第二字面，只引符号） | ✅ 唯一声明点在 `AUTH_COPY`（PM §四 / §5.4-4）；`.delivery/**` 里另有定稿件自身的引用，不计入源码面 |
| 2 | **登录态两条本地拦截出口引 `WEAK_PASSWORD` = 0**：`grep -n WEAK_PASSWORD packages/ui/src/auth/AuthFormShell.tsx` + `handleSubmit` 函数体单独计数 | `handleSubmit`（`:433-466`）体内 = **0**；全文件共 4 处 = `:113`（注释）/ `:116`（`CODE_FIELD` 码位映射表项）/ `:367`（注释）/ `:377`（**服务端回码**分支，`codeField === 'password'`，注册与改密面共用 —— 按简报**不计违规、本轮不动**） | ✅ 两条本地拦截出口零借用；串 B 只从 `AUTH_COPY.signInPasswordTooLong` 来 |
| 3 | **新串对 §8.3-D 禁词 + "会自动…"式承诺 = 0 命中**：把 `copy.ts` 的两条串行喂进 `grep -o -e 云端 -e 本地 -e 缓存 -e 未接入 -e token -e 数据源 -e 接口 -e HTTP -e 参数 -e 请求 -e 会自动 -e 稍后自动`（并附加 `至少 / 上限 / 长度 / 字节 / 密码` 与数字字符） | **0 命中**（空输出）；两串 12 字 / 14 字、0 数字、0 英文字母、0 字段名 | ✅ 与 PM §六 的两端自检同结论 |

补一条自查（同属 PM §五 反向哨）：**串 A / 串 B 未被复用到建密码三面** —— 符号引用面 `grep -rn "signInPasswordMissing\|signInPasswordTooLong" packages apps --include=*.ts --include=*.tsx` 只命中 `copy.ts` 声明 + `AuthFormShell.tsx` 登录态出口 + `auth.spec.tsx` 新钉，`ChangePasswordForm` / `ForcePasswordUpgradeForm` / `PasswordStrength` / 注册态分支 = **0**（件 2 的 `!isRegister` 前置 + 新钉 5 双保险）。

---

## ④ 真库未动

`sha256sum data.db | cut -c1-12` = **`6595517661cc`**（= 简报基线）
`stat -c '%s %y' data.db` = **`253952 2026-09-18 04:05:38.198449400 +0800`**（253952 字节 / mtime `2026-09-18 04:05` 均未变）
本轮无任何 SQL/DDL/DML，无写入 `data.db`；测试期写入只在 vitest/jsdom 内存与 `os.tmpdir()` 既有约定内。

---

## ⑤ blast radius · 只列不动（给 PM/TPM 并轮次）

### 5.1 本轮**没动**、但可能依赖"登录被本地拦下时无话术 / 无 alert"的下游

| 文件:行号 | 依赖形态 | 风险判断（本轮实测口径） |
|---|---|---|
| `apps/web/e2e/auth-wall.spec.ts:259-264` | 弹窗登录态默认焦点在 `field-password` 的 `document.activeElement` | 走 `autoFocus` 既有路径，与本轮无关；**但**该文件 5 处主按钮点击（`:330 :355 :403 :503 :531`）前面**全都**填了非空密码（`strong-password-8` / `wrong-password-1`，≥8 字符且 ≤72 字节）⇒ 不触发串 A/B，预期仍绿。取证排队的那轮若新增"空密码点登录"步骤，期望要按 §3.9.7 写成"串 A 逐字 + 焦点在密码框" |
| `apps/web/e2e/**`（全 8 文件） | 无任何 `role=alert` / `getByRole('alert')` 断言落在**登录壳**上 | 实测 `grep` 命中仅 `AGREEMENT_REQUIRED`（`auth-wall:531-533`）与改密两面（下表），与本轮两条串无交叠 |
| `apps/web/e2e/upgrade.spec.ts:255 :271`、`apps/web/e2e/profile.spec.ts:74-89 :130-142` | 页面上出现"密码至少 8 位"（`WEAK_PASSWORD.copy`） | 全部落在**改密 / 强制改密**两面（`ChangePasswordForm` / `ForcePasswordUpgradeForm`），串由服务端回码 `:377` 与强度条给，本轮未动 ⇒ 应仍绿（简报禁令未跑 e2e，请在 T-28 收口后补跑） |
| `apps/web/e2e/wordbook.spec.ts:131` | 钉 `sharedErrorCopy('WEAK_PASSWORD')` 含 `8 位` | 取 `errors.ts`，本轮 `errors.ts` 一字未动 ⇒ 无风险 |
| `apps/web/**` 登录弹窗宿主（`login-dialog` 组件与它的 e2e 断言） | 若宿主自己按"壳会显示 `WEAK_PASSWORD`"写过兜底提示，或按"空密码被拦时无任何 alert"写过零节点断言 | **我没读、没改**（禁写面）。请在并进去的那轮里专项走查：串 A 现在**会**出现在 `field-password` 的 `[role=alert]` 里（且仅在该屏点过`登录`之后），任何 `toHaveCount(0)` 型 alert 计数需要按此重述 |
| `apps/app/src/**`（`LoginScreen` / `router.tsx`） | 宿主侧兜底话术 / 路由与 main.tsx | 未读未改（A-44 #86 由你串行收口）；App 套件 294/294 原样绿，无需本轮申报改判 |
| `packages/server/**`、`scripts/**`、`tools/**` | 无 | 未动、未跑（禁令）。`tools/boundaries.mjs --copy` 一类门禁若扫 `packages/shared/src/**` 字面，新两串不含禁词（见 ③#3），预期不改变结论 |

### 5.2 语义与判据提示（不改，等你裁）

- **`touched.password` 与"点过主按钮"是两个不同的真值**：本轮为了同时守住"未提交不常驻红字"（PM §一）与 T-29 组 ④ 的既有 blur 时机钉，引入了第三个开关 `signInLocalBlocked`。若 UI 设计师补 §3.9.7 表行时想把口径写回"沿用 `touched.password`"，请先确认 `auth.spec.tsx:974` 那条 blur 后零 alert 的钉要不要一起翻 —— 现在盘面是"blur 不出串、点`登录`才出串"，与 PM §一 的字面要求同向。
- 注册态超 `PASSWORD_MAX_BYTES` 仍是同型 focus 静默拦（`:457-461` 的 `!isRegister` 已明确把话术留给登录面）：PM §五 串 B③ 说该缺口"由该轮上报 PM 另定"，**此处正式登记为待裁缺口**，我没有把串 B 复过去。
- 登录态密码被改回非空合规值后串即消失（派生式，不需要额外清态）；`切态`（`:418-419`）与`放行成功`（`:463-464`）两处都随既有 `agreementBlocked` 一起清零，不留中间态。

---

## ⑥ 写面自检（如实登记，不用 `git status` 装证据）

- 本轮由我发起的写入**恰好 4 份**：`packages/shared/src/constants/copy.ts`（1 处编辑）、`packages/ui/src/auth/AuthFormShell.tsx`（4 处编辑：state / 注释+`passwordError` / `handleSubmit` 两条出口 / 切态清态）、`packages/ui/test/auth.spec.tsx`（2 处编辑：追加块 + 一处反向改判注释与断言）、本报告。**简报白名单内但一字未改**：`packages/shared/test/contracts.spec.ts`（无封闭键集钉可同步，见 ①件 1）、`apps/app/test/login-screen.spec.tsx`（下游 0 红，见 ①件 4）。
- **不能用 `git status --short` 或 `find -mmin` 当本轮写面的证明**：工作树本就是大面积未提交态（`packages/ui/`、`packages/shared/src/constants/`、`.delivery/`、`apps/app/` 整目录 untracked），且此刻有**并发写者**在动同一批文件 —— 我实测 `find -mmin -180` 的近期清单里除我这三份外还包含 `packages/shared/src/constants/errors.ts`、`packages/shared/test/contracts.spec.ts`、`packages/ui/src/auth/ChangePasswordForm.tsx`、`apps/app/test/login-screen.spec.tsx`、`apps/app/src/router.tsx`、`apps/web/e2e/**`、`scripts/release/**` 等，**都不是我写的**。⇒ ②a 的三条尾行取自**交回前同批复跑**（`03:06:32` / `03:06:35` / `03:06:38`，源文件自 `03:00` 起未再被我改动），收口前若他人又动了 shared/ui，请重跑三条再判绿。
- `data.db` **不在**上述近期写入清单里（`find -mmin -180 data.db` 空），与 ④ 的 sha256 + mtime 双重一致 ⇒ 真库未动。
