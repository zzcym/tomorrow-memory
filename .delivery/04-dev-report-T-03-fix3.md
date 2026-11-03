# T-03 开发报告 · 修复轮 3 —— `@tm/shared` 凭据文案补件（T-13 §4 清单 + A-23-5 / A-23-6）

- 任务：§10.2 **T-03**（`@tm/shared` 契约与常量）修复轮 3
- 角色：共享契约/前端开发（角色卡 `roles/dev.md`）
- 轮次定位：**范围很窄，只新增、不重构**（派单原话）
- 依据（全部按行区间取读，未整篇通读）：
  - `.delivery/04-adjudications.md` → **A-23 表第 5、6 行**（本次唯二裁决）、A-11（禁词与定稿文案冲突的调子）、A-8（错误码 16 行/18 码口径、`@tm/shared/copy` 垫片口径）
  - `.delivery/04-dev-report-T-13.md` → §4「待 shared 补的常量清单」**11 行**（逐条处置见本文 §1）
  - 定稿字面出处：`.delivery/03-ui-spec.md` §3.9.1:1027/1035、§3.9.4:1063/1066/1070、§3.9.5:1080、§6.4:1530-1543、§6.8:1613-1630；`.delivery/01-prd.md` R-39②⑨、R-40①③④、§6.6
- 日期：2026-09-19
- 可写面实际使用：`packages/shared/src/constants/copy.ts`、`packages/shared/src/constants/limits.ts`、`packages/shared/test/contracts.spec.ts` + 本报告。**其余一字未动**（`packages/ui/**`、`apps/**`、`packages/server/**`、`tools/**` 全程只读取证）

---

## 0. 结论一句话

**采纳 8 条（12 个新增常量点：11 串 + `PASSWORD_MAX`；顶层新导出只有 `PASSWORD_MAX` 一个，其余是 `AUTH_COPY`/`ARIA` 加键，见 §2 口径说明）／驳回 4 条（附理由与证据）／待 PM 定稿 3 条。**
`pnpm --filter @tm/shared test` **43/43 绿**（本轮前基线 37/37，新增 6 条用例）、`pnpm --filter @tm/shared typecheck` **exit 0**、
`pnpm -r typecheck` **6/6 Done**（消费方 `@tm/ui`/`@tm/server`/`apps/web`/`apps/app`/`@tm/agent` 一个都没破）、
`node tools/boundaries.mjs --copy` **全绿 0 命中**、`pnpm depcruise` **0 违规**。
**新增文案对禁词表 0 命中**，且是**逐条整段普通字面量**，未使用任何分词/拼接/正则/例外登记（A-11 的调子）。
`--check-ownership --task T-03` → **无越界**。

---

## 1. 逐条处置表

### 1.1 T-13 §4 清单（11 行）逐条

| # | T-13 建议 | 处置 | 落点（文件:行） | 出处与判定理由 |
|---|---|---|---|---|
| 1 | `AUTH_COPY.switchToRegister` / `.switchToSignIn` | ✅ **采纳** | `copy.ts:458` / `copy.ts:460`（声明点 `copy.ts:445`） | UI §3.9.1:1027 表格「次级文字链」两格，逐字。跨端必需：Web 登录弹窗薄壳 + App `LoginScreen` 同一 `AuthFormShell`；§8.2-14 走查表第 14 行（:1823）要求"弹窗内始终可见 `没有账号？注册`"。宿主自带串 = 单一源退化 |
| 2 | `AUTH_COPY.cardActions.goSignIn` = `去登录` | ✅ **采纳** | `copy.ts:465-467` | UI §3.9.5:1080 `PHONE_ALREADY_REGISTERED` 行「+ `去登录`（手机号保留）」；PRD R-39③ 同格「给可点"去登录"」。正文仍走 `errors.ts`（同源不复制），此处**只补动作标签** |
| 3 | `ARIA.showPassword` / `.hidePassword` | ✅ **采纳**（**与派单提示不同，理由见下**） | `copy.ts:697-698` | UI §3.9.1:1035 `aria-label="显示密码"` / `"隐藏密码"`（逐字，配 `aria-pressed`）。**它不是"只有一处用"的组件私有物**，四条实测证据（行号为 19:0x 快照，ui 侧 agent 正在并行改，会漂移）：① 这颗眼睛由 `AuthFormShell` 内导出的 `PasswordField` 渲染，**三件七处**透传复用 —— `AuthFormShell.tsx:546/571/595`、`ChangePasswordForm.tsx:199/217/237`、`ForcePasswordUpgradeForm.tsx:156`，Web+App 两端挂载。② 三个组件的 `showPasswordLabel`/`hidePasswordLabel` **全是可选 prop、组件内无默认值**（`AuthFormShell.tsx:225` `const ariaLabel = visible ? hideLabel : showLabel;`），且 `:246` 是 `{showLabel \|\| hideLabel ? (…) : null}` —— **宿主不传串，这颗眼睛整颗不渲染**，即"驳回"不是回到宿主字面量，而是砍掉 §3.9.1 要求的可访问名。③ `packages/ui/test/auth.spec.tsx:247-248` 目前只能拿 `VERBS.speak`/`VERBS.undo` 去占这两个位，正是缺源的症状。④ `packages/ui/test/auth.spec.tsx:528` 判据④ 要求 `src/auth` 七文件去注释后 **0 处中文字面量**，且 `packages/ui/src/patterns/**` 已有多件直接 `import { ARIA } from '@tm/shared'` 用（`Flashcard.tsx:15`、`RatingBar.tsx:14`、`WordbookList.tsx:14`）—— aria 串进 `ARIA` 就是这个仓库的既有惯例，不是我为一条串新开例规。②③④ 合起来：驳回 = 逼宿主自己写字面串或让按钮消失，两者都是 T-13 §0 说的"单一源退化" |
| 4 | `AUTH_COPY.forceUpgrade.subtitle` | ✅ **采纳** | `copy.ts:512` | UI §3.9.4:1063（规范自己标「逐字」）。Web `upgrade-password/page.tsx` 与 App `UpgradePasswordScreen` 同一页两处用 |
| 5 | `AUTH_COPY.changePassword.title` / `.submit` | ✅ **采纳** | `copy.ts:530-532` | UI §3.9.4:1070：普通改密「复用同一表单组件，差异只有……标题 `修改密码`、按钮 `保存新密码`」。T-19 `SecurityScreen` 与 Web `(user)/profile/security` 两端共用，`ChangePasswordForm.submitLabel` 至今是**必填**（`ChangePasswordForm.tsx:39` `submitLabel: string;`，无默认值 = 强制宿主给串），且该文件 `:35` 的注释还写着"普通态 shared 缺'修改密码'这一格 → 宿主覆写，见 T-13 报告"——本轮正是把这格补上，`title?`（`:36`）随之可省略 |
| 6 | 改密成功反馈两串 | ✅ **采纳** | `copy.ts:533-536`（`success.toast` / `success.reloginNotice`） | UI §3.9.4:1066 逐字 `toast \`密码已更新\`` + `常驻 6 秒的信息条 \`其他设备需要重新登录\``（R-40③④）。时长 `TOAST_LONG_MS = 6000` 已在 `limits.ts:134`，**只差文案**，与 T-13 §4 第 6 行的判断一致 |
| 7 | `PASSWORD_MAX` 命名与口径 | ✅ **采纳**（A-23-6 直接派单） | `limits.ts:27-34` | 见本文 §2.2。**`PASSWORD_MAX_BYTES` 一字未改**（值仍 72），两条各加注释说明用途与计数单位 |
| 8 | `PHONE_DISPLAY_GROUPS=[3,4,4]` / `PHONE_PLACEHOLDER` | ❌ **驳回** | — | **非文案，且共享侧已有判据**：① 分组 `[3,4,4]` 与 `maxLength=13` 是**格式化器的输入**，`138 0000 0000` 由它渲染出来；A-23-4 已就同类问题定调"格式化器函数不是文案，不进 shared"（T-05 的 6 项文案采纳、3 项格式化器驳回成立），派生配置跟着格式化器走，进 shared 只会多出第二份派生源。② `PHONE_PLACEHOLDER` 是**数字示例**（`13800000000`），不在 §6.4 定稿文案总表内，唯一渲染点是 `AuthFormShell` 手机号框（`placeholder` 仅在 §3.9.1:1034 作格式示例，且规范明写"placeholder 不参与对比度判定、不作为唯一提示"→ 它不是验收文案）。③ 它不参与合法性判定（判据只有 `PHONE_PATTERN`），驳回**不产生任何中文 literals 落在 `src/auth`**，不破 ui 判据④ |
| 9 | 60 秒倒计时可见标签 | ❌ **驳回**（并列入待 PM 定稿） | — | **规范里没有这条字面串**：§3.9.5:1087 的「等 60 秒后按钮自动解禁」在表内属**「可否重试」列**（给测试的判据说明），不是「文案（最终）」列；§3.9.1:1028 底部小字那一格只有 `使用验证码登录`（已在 `smsEntryLabel`）。更硬的一条：§3.9.5:1091 明写本期**不启动 60 秒倒计时**、"任何'倒计时从 60 开始'的截图判为不通过" → 本期无渲染面。按铁律"规范里找不到出处的不许编" → 不落码，等 PM 定稿后随真实通道接入一并补 |
| 10 | 新增凭据错误码（如 `WRONG_CREDENTIAL`） | ❌ **驳回本轮** | — | 新增错误码**不是补文案**：`TM_ERRORS` 的码集合是 §4.6 契约表（16 行/18 码，A-8 口径），`contracts.spec.ts:339-346` 用 `TM_ERROR_ROWS` 锁死集合、`packages/server/**` 与双驱动集成用例按同名码对齐，PRD R-39①③ 还要求 REST/tRPC 逐字一致 → 属**架构/TPM 裁决面**，不在"只新增导出"的修复轮里顺手做。文案本身**无缺口**：`手机号或密码不正确` 已有单一源 `AUTH_COPY.wrongCredential`（`copy.ts:485`，§6.4:1534 / R-01①），宿主按 T-13 §3 的方式传 `serverMessage` 即可 |
| 11 | `TM_ERRORS.PHONE_ALREADY_REGISTERED.clientAction` 改 `'switch-to-sign-in'` | ❌ **驳回本轮**（转 TPM） | — | ① 它是**既有取值的改向**，不是新增，与本轮"只新增、不重构"的边界冲突。② A-23 一次裁了 7 个待裁决点，**只处理了 T-13 的第 5、6 条**，第 3 条（本行）未被裁 → 无授权。③ 落地面已核：`errors.ts:71` 的 `clientAction` 联合类型**不含** `'switch-to-sign-in'`（要同时改类型与取值 = 两处契约变更），消费点 `apps/app/src/data/rest-fetcher.ts:127` 逐码做 `action !== '…'` 等值守卫。④ ui 侧不受阻：`AuthFormShell` 已按 §3.9.5 实现切登录态，shared 这个字段没被它读。**已写进本文 §7 待裁决，请 TPM 一并裁 T-13 待裁决点 3** |

小计：T-13 的 11 行 → **采纳 7 行 / 驳回 4 行**。

### 1.2 派单直接指定、但不在 T-13 清单里的一条

| 事项 | 处置 | 落点 | 出处 |
|---|---|---|---|
| **登录态协议小字**（A-23-5：登录态**不加勾选框**，改底部小字） | ✅ **采纳** | `copy.ts:508` `AUTH_COPY.agreementSignInNote = '登录即表示同意《用户协议》与《隐私政策》'` | A-23-5 引号原文（逐字）。**注**：UI §6.4-登录表（:1528-1543）与 §3.9.1 表格目前都**没有这一行**（该表协议格只有注册态 `AgreementCheckbox`），PRD 全文 grep `登录即表示`/`即表示同意` **0 命中**（只有 `04-adjudications.md:155` 一处）。这与 A-11 是同一形态：裁决已给字面、`.delivery/**` 由 PM 同步 → 我按裁决落码，并把文档缺行登记为**待 PM 定稿/同步**（§7.2 的 P-1）。既存的注册态勾选句 `AUTH_COPY.agreement`（`copy.ts:501`）**一字未动**，两者并存不混用 |

---

## 2. 新增导出清单（本轮全部新增，共 12 个可见常量点）

先说清"导出"这个词，免得对账时误读：**顶层新导出只有 1 个 —— `PASSWORD_MAX`**（`limits.ts:34`）。其余 11 条是**既有顶层导出对象 `AUTH_COPY` / `ARIA` 下新增的键**（`AUTH_COPY` 与 `ARIA` 本身是前几轮就在的导出名，本轮只加键、没改名、没删名），宿主拿到它们要写的 import 与既有用法完全一致。下表按"从 `@tm/shared` 出发的一条可取值路径"计一个点。

### 2.1 文案（`packages/shared/src/constants/copy.ts`，11 串）

| 导出 | 值（= 规范定稿，逐字） | 出处 |
|---|---|---|
| `AUTH_COPY.switchToRegister` | `没有账号？注册` | §3.9.1:1027 / §6.4:1530 |
| `AUTH_COPY.switchToSignIn` | `已有账号？去登录` | §3.9.1:1027 |
| `AUTH_COPY.cardActions.goSignIn` | `去登录` | §3.9.5:1080 |
| `AUTH_COPY.agreementSignInNote` | `登录即表示同意《用户协议》与《隐私政策》` | A-23-5（§6.4 待补行） |
| `AUTH_COPY.forceUpgrade.subtitle` | `这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。` | §3.9.4:1063 |
| `AUTH_COPY.changePassword.title` | `修改密码` | §3.9.4:1070 |
| `AUTH_COPY.changePassword.submit` | `保存新密码` | §3.9.4:1070 |
| `AUTH_COPY.changePassword.success.toast` | `密码已更新` | §3.9.4:1066 |
| `AUTH_COPY.changePassword.success.reloginNotice` | `其他设备需要重新登录` | §3.9.4:1066 / R-40③④ |
| `ARIA.showPassword` | `显示密码` | §3.9.1:1035 |
| `ARIA.hidePassword` | `隐藏密码` | §3.9.1:1035 |

出口无需改动：`@tm/shared`、`@tm/shared/constants`、`@tm/shared/constants/copy`、`@tm/shared/copy`（A-8 保留的 re-export 垫片）四条路径自动可见（`constants/index.ts` 与 `src/index.ts` 早已 `export * from './constants/copy.js'`）。归属习惯：全部落 `copy.ts`（**没往 `notice.ts` 放**——`notice.ts` 只承载 §6.6-4 对外告知/公告单一源，这 11 串是界面静态文案，按 `copy.ts` 头注释的规则 3 归位）。

### 2.2 数值（`packages/shared/src/constants/limits.ts`）

`PASSWORD_MAX = 72`（`limits.ts:34`）—— A-23-6 派单。`PASSWORD_MIN=8` / `PASSWORD_MAX=72`（字符）/ `PASSWORD_MAX_BYTES=72`（bcrypt UTF-8 字节）三条现在**并存且各表其义**，两条 max 各带一段注释写明用途与计数单位（`limits.ts:27-40`）。

---

## 3. 两处"非纯新增"的改动（不属导出面，逐条交代）

派单的铁律是"既有**导出名**一个都不许删、不许改名"，以下两处不涉及导出名，但仍主动申报：

| # | 改动 | 为什么必须做 | 零 API 变更自证 |
|---|---|---|---|
| 1 | `AUTH_COPY.wall.link` 的字面量改为引用新增的**模块内私有常量** `SWITCH_TO_REGISTER_LABEL`（`copy.ts:445`，未导出） | `没有账号？注册` 在规范里被**两处引用同一串**（§6.4:1530 登录墙文字链 + §3.9.1:1027 弹窗登录态次级文字链）。若各写一份字面量，`copy.ts` 里就出现同一验收值的第二份副本，PM 改一处漏一处 → 违反本文件头规则 2 | 导出名不变；**值的类型都不变**：把 `copy.ts` 单独 emit 到仓库外的临时目录后 `grep` 结果 —— `readonly link: "没有账号？注册";` 与 `readonly switchToRegister: "没有账号？注册";` 仍是同一**字面量类型**（`as const` 引 const 字面量不拓宽）。临时产物已删除，仓库内 `packages/shared/dist/**` 未重新生成 |
| 2 | `PASSWORD_MAX_BYTES` 的注释从 1 行扩为 4 行（`limits.ts:35-39`） | A-23-6 要求"两者各加一行注释说明用途"。**值 72 一字未改**，`PASSWORD_MIN` 未改 | `git`/测试双证：`contracts.spec.ts` 判据⑤ 的 `expect(PASSWORD_MIN).toBe(8)` 与新增的 `expect(PASSWORD_MAX_BYTES).toBe(72)` 同时绿 |

其余全部是**新增行**：`errors.ts`、`notice.ts`、`flags.ts`、`rating.ts`、`constants/index.ts`、`src/index.ts`、`src/copy.ts`、`contracts/**`、`types.ts`、`utils.ts` **本轮 0 改动**（mtime 仍是 13:0x-13:3x，本轮编辑发生在 18:48-18:55）。

---

## 4. 自检与冒烟（真实运行，原始输出，未编辑）

链式跑于本轮最后一次**源码**编辑之后，并在 19:04（写完本报告、只剩文档改动之后）**整链复跑一遍**，两遍输出逐项一致（测试数 43/43、6/6 `Done`、`--copy` 全绿、`--all` 18/20、depcruise 0 违规）。最后一次触碰源码是 18:54 的 `copy.ts`。
**19:10 又补跑了一次 `--copy` 与 `pnpm --filter @tm/shared test`**：因为并行 agent 在 19:06 动过 `tools/boundaries.mjs`（禁词表若变，本轮内联同步的 `toHaveLength(33)` 与 `--copy` 都会立刻现形）—— 结果仍是 **全绿 / 43 passed**，即词表那侧没有因他的改动而失配。

| 命令 | 结果（关键输出） |
|---|---|
| `pnpm --filter @tm/shared test` | `Test Files 1 passed (1)` / **`Tests 43 passed (43)`**（本轮前基线 37/37 → 新增 6 条全绿） |
| `pnpm --filter @tm/shared typecheck` | `tsc -p tsconfig.json --noEmit` → **`exit=0`** |
| `pnpm -r typecheck` | `Scope: 6 of 7 workspace projects` → shared/agent/ui/app/server/web 六个 **`Done`**，`grep -c Done` = **6**（判据"6/6 仍绿、没破消费方"成立） |
| `node tools/boundaries.mjs --copy` | **`OK copy-legacy-zero 0 命中`**（扫描含 `packages/shared/src`；例外豁免 67 处、需人工复核词 108 处不判红）→ `1/1 条通过，全绿` |
| `node tools/boundaries.mjs --all` | **`18/20 条通过，2 条红`**（见下一条表） |
| `pnpm depcruise` | `✔ no dependency violations found (309 modules, 736 dependencies cruised)` |
| `node tools/boundaries.mjs --check-ownership --task T-03 --files <4 个>` | `--check-ownership task=T-03 触碰 4 个文件 → 无越界`（`test/contracts.spec.ts` 与 `.delivery/…fix3.md` 各一条 `NOTE：归属表无条目（no-entry，不阻断）`） |
| `pnpm exec eslint packages/shared --no-warn-ignored` | 无输出，**RC=0** |

### 4.1 `--all` 那 2 条红不在我这一侧（同一份红 T-13 报告 §1.4 在 18:38 已记录过）

```
RED  colors-no-hardcode    apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
RED  css-important-budget  !important 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | :695
```

四条命中全部在 `packages/ui/**` 与 `apps/app/**`（T-04 / T-05 / T-14 面，另有 2 个 agent 正在并行改 ui 与 tools）；`packages/shared/src` **0 命中**。

**关于"8 与 20"这个差异，不要误读成门禁变严**：T-13 §1.4 跑的是三模式子集 `--copy --colors --ui-io`（`1+6+1` = 8 条断言），本轮跑的是 `--all`（`MODES['--all'] = ASSERTIONS.map(a => a.id)`，注册表全部 20 条，另含 `--password`/`--migrations`/`--tokens`/`--flags`/`--versions`/`--routes` 与 `dist-artifact-portability`）。两个数字是**两次不同的采样口径**，不可直接比较（"20 条 / `--all` = 注册表全量"是 **19:02 的快照**：`tools/boundaries.mjs` 正被并行 agent 改，我写这段时它 mtime 已跳到 19:06，注册表再变与本任务无关）；上面这两条红在 T-13 那次的口径下同样存在、命中的文件与规则一致（`patterns.spec.tsx` 的行号 684/688 → 691/695 是并行 agent 在 18:36 之后往该文件里加用例造成的位移，不是新增违规）。反向差异：T-13 那次红的第三条 `copy-legacy-zero`（`packages/ui/src/patterns/EmptyState.tsx:6`）本轮已为 **OK / 全仓 0 命中** —— 那不是我收的口（本轮我只写了 `packages/shared` 下 3 个源码文件，见本文头「可写面实际使用」与 §6），是 ui 侧并行改动带掉的，登记于此仅供 TPM 对账。

### 4.2 逐字一致 + 禁词 0 命中的**独立机器核验**（一次性脚本，跑完即删，未入库）

用 `pnpm exec tsx` 直接 import 编译前的 `copy.ts` / `limits.ts` 与 `tools/boundaries.mjs` 的 `BANNED_TERMS`（**门禁自己那份词表**，不是测试内联副本），逐条要求"值 ∈ 规范原文"且"不含任何禁词"：

```
LITERAL-OK  banned:0 AUTH_COPY.switchToRegister = 没有账号？注册  [UI §3.9.1:1027]
LITERAL-OK  banned:0 AUTH_COPY.switchToSignIn = 已有账号？去登录  [UI §3.9.1:1027]
LITERAL-OK  banned:0 AUTH_COPY.cardActions.goSignIn = 去登录  [UI §3.9.5:1080]
LITERAL-OK  banned:0 ARIA.showPassword = 显示密码  [UI §3.9.1:1035]
LITERAL-OK  banned:0 ARIA.hidePassword = 隐藏密码  [UI §3.9.1:1035]
LITERAL-OK  banned:0 AUTH_COPY.forceUpgrade.subtitle = 这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。  [UI §3.9.4:1063]
LITERAL-OK  banned:0 AUTH_COPY.changePassword.title = 修改密码  [UI §3.9.4:1070]
LITERAL-OK  banned:0 AUTH_COPY.changePassword.submit = 保存新密码  [UI §3.9.4:1070]
LITERAL-OK  banned:0 AUTH_COPY.changePassword.success.toast = 密码已更新  [UI §3.9.4:1066]
LITERAL-OK  banned:0 AUTH_COPY.changePassword.success.reloginNotice = 其他设备需要重新登录  [UI §3.9.4:1066 / R-40③]
LITERAL-OK  banned:0 AUTH_COPY.agreementSignInNote = 登录即表示同意《用户协议》与《隐私政策》  [A-23-5（UI §6 尚无该行 → 待 PM 同步）]
PASSWORD_MIN=8 PASSWORD_MAX=72 PASSWORD_MAX_BYTES=72 72个全角字符的字节数=216
cases=11 异常=0
```

`docs.includes(value)` 是**整串子串**判定（码点级），不是分词命中 → "逐字一致"是可复跑的，不是口头承诺。

---

## 5. 禁词与"未绕扫描"自证（A-6 / A-7 / A-11 的调子）

1. **整段普通字面量**：11 条串每条都是**一个连续字符串字面量**，无 `join()`、无相邻字面量相加、无 `String.raw`/`fromCharCode`/`\uXXXX`。这四类手段在 `contracts.spec.ts` 的"零绕扫描"用例里对 `packages/shared/src/**` 逐文件被机器否决，本轮仍绿。
2. **没有动词表**：`tools/boundaries.mjs` 的 `BANNED_TERMS`（33 条）与 `contracts.spec.ts` 的 `BANNED_TERMS_LOCAL` 本轮**一个字符都没改**（`toHaveLength(33)` 绿）。对 `contracts.spec.ts` 这个文件本轮**只有追加**——加了一行 import 与一个 `describe` 块，词表数组本体、既有用例、反分词断言均未编辑。（该文件在 git 里仍是 untracked，前几轮产物未入库，所以这里给的是"改动形态"自证而不是 diff 页码。）
3. **没有加例外**：`tools/exceptions.json` 未新增条目（mtime 仍是 **17:14**，早于本轮 18:48-18:55 的写入窗口；该文件 owner = T-02，我无权改，也没申请）。`--copy` 输出里的"例外豁免 67 处"与本轮无关，且我新增的 11 串**一条都不在那 67 处里**（它们是被扫到 0 命中，不是被豁免）。
4. **没有触碰的冲突**：本轮 11 条串与禁词表**零相交**，不存在 A-11 那种"定稿与禁词真互斥"的情形，因此**不需要**任何裁决；若后续 PM 把 §6.6-4 类句子往 `AUTH_COPY` 里搬，才可能再撞。
5. 唯一"看起来像拼接"的东西是**注释里的行号引用**（`§3.9.1:1035`），不属语句。
6. **给测试的一句预防**：`contracts.spec.ts` 里确实存在一处拆写 —— `:195` 的 `'password' + 'Upgrade' + 'Deadline'`。那是**前几轮（T-02 修复轮）留下的禁词表条目本体**，为了不让本文件自己撞红 `deadline-key-zero`（该断言 `noExceptions: true`、无例外通道，文件内 `:190-194` 有完整因果说明）；它不是"落码文案的绕法"，本轮**没扩大、没新加**任何这类写法，我落的 11 串全是连续整段字面量。

---

## 6. 越界申请

**无。** 只写了允许清单：`packages/shared/**` 三个文件 + 新报告一份。全程未用任何 git 写操作（只用了 `git status --porcelain` / `git diff --stat` 只读取证，且**未清理/未还原**别人的未提交改动）。

---

## 7. 契约偏差 / 待裁决 / 待 PM 定稿（诚实清单）

### 7.1 请 TPM 裁定（2 条，本轮按边界驳回，未动码）

| # | 事项 | 我要说的话 |
|---|---|---|
| C-1 | **T-13 待裁决点 3 / §4 第 11 行**：`TM_ERRORS.PHONE_ALREADY_REGISTERED.clientAction = 'switch-to-register'` 语义反向（§3.9.5:1080 要求切**登录**态）。A-23 只裁了第 5、6 点，这一点悬空 | 组件侧已按规范实现（切 sign-in、保留手机号），shared 字段与它相反 → **谁按 shared 实现就错**。修正需：`errors.ts:71` 联合类型加 `'switch-to-sign-in'` + **只**改 `errors.ts:99` 的值 + 复核 `apps/app/src/data/rest-fetcher.ts:121-140` 的等值守卫。**特别提请注意**：`'switch-to-register'` 这个取值在表里出现**两次**——`:99`（本条，方向错）与 `:106` 的 `NO_PASSWORD_ACCOUNT`（规范 §3.9.5:1081 该行的动作列写的是**「进激活态」**，激活态在注册分支上 → 与本取值同向、**不该一起改**）→ 改的时候**不许全局替换**，只动 `:99`。属契约取值改向，请裁一个 owner 与时机（建议与批次3 的 T-10 复习域一并） |
| C-2 | **T-13 §4 第 10 行**：是否新增凭据失败错误码（现表只有 `AUTH_COPY.wrongCredential` 一份串、无对应码） | 会改 §4.6 的 16 行/18 码集合，牵动 `contracts.spec.ts` 判据② 快照 + server 双驱动同码同文案（PRD R-39①"三出口 × 两协议 6 例断言同码同文案"）→ 本轮**没做**，也不该由 shared 单方面做 |

### 7.2 **待 PM 定稿 / 文档同步**（3 条，开发不编字面、不改 `.delivery/**`）

| # | 缺口 | 现状 | 需要 PM 做的 |
|---|---|---|---|
| P-1 | **登录态协议小字** | `AUTH_COPY.agreementSignInNote` 已按 A-23-5 引号原文落码；但 UI §6.4-登录表与 §3.9.1 三态表格**均无此行**，PRD 全文 0 命中 | 把该行补进 §3.9.1 表格「协议」格（登录态 = 小字句，注册态 = `AgreementCheckbox`）与 §6.4-登录表；若 PM 对字面（尤其"与"字、书名号之间是否加顿号）另有定稿，**改 shared 一处即可全站生效**，T-13 不必改组件 |
| P-2 | **60 秒倒计时可见标签**（T-13 §4 第 9 行） | 规范无界面字面串（§3.9.5:1087 那句在「可否重试」列），本期倒计时永不触发 → **未落码** | 需要显示时（真实短信通道接入那一轮）先定稿字面串，再由 T-03 补 `AUTH_COPY.smsCountdownLabel` |
| P-3 | **`PASSWORD_MAX`（字符数）的数值口径** | 已落 72。但 PRD R-39② 只写「≥8 位且 ≤72 字节」，UI 规范无字符上限条目 → 72 取自**已在生效的** `contracts/auth.ts` `PasswordSchema.max()`（zod `.max()` 按字符计），属"给既成约束命名"，不是新增约束 | 请 PM/TPM 追认一句：**表单侧字符上限 = 72**（还是另给一个更小的值）。另需一句定稿：**超限时的人话提示串**（§6.4 与 §3.9.5 表内都没有"密码太长"这一格，`TM_ERRORS` 也没有对应码 → 本轮**没有编造**该提示） |

---

## 8. 已知限制与 TODO

1. **L-1（不是本轮引入，但被本轮的核验照到）**：`contracts/auth.ts:19` 写的是 `z.string().min(PASSWORD_MIN).max(PASSWORD_MAX_BYTES)` —— zod 的 `.max()` 按**字符**计，所以这个 schema 实际执行的是"≤72 个字符"，**不是** bcrypt 的字节边界（全角密码 72 字符 = 216 字节能过 schema、过不了 bcrypt）。这与 A-23-6"谁也不许拿字节数当字符数用"是同一病灶的另一侧。我**没改** schema（改它 = 动既有契约面，且 `packages/shared/test` 判据① 与 server 侧用例都盯着它）。建议裁一处修法：要么 `.refine()` 里按 `TextEncoder` 算字节，要么把该处改用新命名的 `PASSWORD_MAX` 并让服务端 bcrypt 校验另跑字节线。**owner 建议 T-03 修复轮 4（需 TPM 授权改契约）**。
2. **L-2**：本轮**没有**为 T-13 的 props 覆写位做任何接线（那是 ui 面，禁止触碰）。T-13 现在可以删掉的宿主必传 props 共 4 个：`switchToRegisterLabel`、`switchToSignInLabel`、`alreadyRegisteredActionLabel`、`ChangePasswordForm.submitLabel`（+ 强制改密页 `subtitle`）；眼睛按钮的 `showPasswordLabel`/`hidePasswordLabel` 也有源了。**交接给 T-13**：把这些 props 的默认值改成 import `AUTH_COPY.*` / `ARIA.showPassword`，覆写位保留即可。
3. **L-3（prettier 面，19:07 重测，别把它读成"我留了两处 warn"）**：`pnpm exec prettier --check packages/shared` → **10 个文件 warn**，其中 `errors.ts`/`flags.ts`/`notice.ts`/`contracts/profile.ts`/`contracts/review-queue.ts`/`contracts/wordbook.ts`/`schema/tables.ts`/`types.ts` **8 个我本轮根本没碰** → 这个包从早几轮起就不满足 prettier，是全包既有状态。落到我这一侧的实测：
   - `limits.ts` 单查 **`All matched files use Prettier code style!`** → 我的新增 **0 delta**。
   - `copy.ts` 去 CRLF 后与 prettier 输出比，delta **11 行**，全部落在 `:277-279`（`formatRatingBreakdown` 的 `.map().join(' · ')` 链式换行）与 `:495-500`（`strengthLevels` 数组换行）—— 两处都是前几轮的行，我新增的 11 串**一行 delta 都没有**（写的时候特意把 `forceUpgrade.subtitle` 收回单行以对上 prettier 的换行宽度）。
   - `contracts.spec.ts` 去 CRLF 后 delta 419 行，主因是**内联禁词表被故意压成"一词一 literal、多词一行"**（拆词或换行拼接正是 A-11 要防的手段），外加整文件 CRLF。
   - 我**没跑** `prettier --write`：它会重排别人与前几轮的行，且实测 `:489` 的断言 `expect(COPY_SRC).toContain(\`helpRecoveryAnswer:\n    '${HELP_RECOVERY_ANSWER_FINAL}'\`)` 依赖 `copy.ts` 里那条 literal 的换行形态 → 一键格式化会把 A-11 那条字面断言撞红。
4. **L-4**：T-13 §4 第 3 行提到"两个 aria 都不传时眼睛按钮不渲染"，导致注册/登录态当前**缺**显示密码切换的无障碍名。本轮补了串，但**是否渲染**仍由 T-13 的组件决定，shared 侧不介入。**并且请注意这里有一处真冲突，别判成我的缺口**：UI 规范 §7.3:1696 对强制改密页写死了 Tab 序 5 项（当前密码 → 新密码 → 确认新密码 → 更新密码并继续 → 退出登录）且"无其他可点元素"；而 `ForcePasswordUpgradeForm.tsx:156` 会把 `showPasswordLabel` 透传下去 —— **同一条 `ARIA.showPassword` 在注册/登录/普通改密三处该渲染、在强制改密页一渲染就违反 §7.3**。合理读法是"眼睛是装饰件、不计入 Tab 序"（ui 侧就是这条口径：`AuthFormShell.tsx:13` 与 `:205` 的注释、按钮上的 `data-auth-affordance="password-visibility"`（`:249`）、以及 `packages/ui/test/auth.spec.tsx:258` 的断言注释都写着"不占 5 个额度"），但**§7.3:1696 的字面只写了"无其他可点元素"、没写这个豁免** → 该判归 T-13/T-22 与走查。**这一条我没有列进 §7.2 的待 PM 定稿**：它不涉及我落码的字面串（shared 侧两条串都已在位），要裁的是"渲染面归谁"，属 ui/走查侧的裁决而不是文案定稿，登记在此仅供 TPM 分流。
5. **L-5**：本轮未跑 `pnpm --filter @tm/shared build`（会重写仓库里已存在的双份陈旧 `dist/**` 布局：`dist/constants/…` 与 `dist/src/constants/…`）。类型面证据改用**向仓库外临时目录 emit**（`tsc --emitDeclarationOnly --outDir` 退出码 0，产物已删）→  declaration 可正常生成，未破 §10.1 build 面。

---

## 9. 给测试的提示

- **重点 1（P-1）**：登录态底部小字。规范里现在有两个协议串：`agreement`（注册态勾选句，带书名号连排）与 `agreementSignInNote`（登录态小字，带"与"字）。走查/断言**不许互换**，也不许出现"登录态有勾选框"（A-23-5 的判据：注册态可交互元素 = 5 因此不被破坏）。**这条字面尚未经 UI 规范表格背书**，PM 若改字面，改 `copy.ts:508` 一处。
- **重点 2（A-23-6）**：密码放行的**两条线要分开测**：72 个全角字符（216 字节）应过字符线、不过字节线；本轮的 `contracts.spec.ts` 新增用例已把这条做成机器断言（`PASSWORD_MAX` 与 `PASSWORD_MAX_BYTES` 各表其义）。若发现某端只按其中一个判，即缺陷。
- **重点 3**：`AUTH_COPY.changePassword.success.reloginNotice`（`其他设备需要重新登录`，常驻 6 秒 = `TOAST_LONG_MS`）与 `TM_ERRORS.CREDENTIAL_EXPIRED.copy`（`密码已修改，请重新登录`）是**两回事**（前者是改密成功后的告知、后者是旧 token 被打回的错误码）。测试别把它们判成重复串，`contracts.spec.ts` 已断言两者不互换。
- **重点 4**：`aria-label` 两条（`显示密码`/`隐藏密码`）来自 §3.9.1 的属性示例，**§6.8 总表未收录**；建议 PM 补进 §6.8，届时 shared 不需要改（值已一致）。
- **没测到的路径**：本轮 shared 侧无运行时行为可测（纯常量），全部证据是字面断言 + 门禁。组件是否**真的**换了 props 默认值、页面是否**真的**出现这三串，要等 T-13 接线后的 `pnpm --filter @tm/ui test -- auth` 与 T-16/T-19 的页面走查，本轮无法代证。
