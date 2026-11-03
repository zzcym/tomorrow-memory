# T-03r5 开发报告 — PM-fix8 落地（五件一批 · 无中间态）

出口命令实测行（本行按 TPM 要求逐字收录 `wc -l` 输出）：

```
164 .delivery/04-dev-report-T-03-r5.md
```

- 任务：T-03r5（PM-fix8 五件：件 A 九键上收 / 件 B D 区两串与同源哨 / 件 C `setPasswordTooLong` / 件 D 建密码面超长出口 / 件 E F-23 拆反号）
- 依据：`.delivery/01-prd-fix8.md`（定稿串逐字照抄源）、`.delivery/04-adjudications.md` A-64 #176–#179 / A-65 #181–#182
- 日期：2026-09-19（凌晨批跑）

---

## ① 逐件改动表（file:line，前 → 后）

### 件 A — `PROGRESS_APP_COPY` 九键整体上收，宿主对象整体删除

| 文件 | 行（后） | 前 → 后 |
|---|---|---|
| `packages/shared/src/constants/copy.ts` | 475–509 | 无此块 → `PROGRESS_COPY` 内新增 9 键（并入既有命名空间，非新对象）：`refreshLabel`(480) `emptyTitle`(482) `emptyBody`(484) `heatDegradedBody`(486) `heatSectionTitle`(494) `heatReloadLabel`(496) `heatmapAria`(498) `curveAria`(500) `heatSparse`(508)；块前注释写明吸收来源与"9 键、零合并"（A-65 #182） |
| `apps/app/src/components/progress-data.ts` | 13–16 | 原"7 串"错误注释所在 bullet → 改写为过去式收编说明（实体 9 键、注释自陈"7"不实） |
| `apps/app/src/components/progress-data.ts` | 29 | `import { ARIA, HEATMAP_LEGEND, PROGRESS_APP_COPY, PROGRESS_COPY, ... }` → 去掉 `PROGRESS_APP_COPY` |
| `apps/app/src/components/progress-data.ts` | （原 220 附近，约 33 行） | 宿主对象 `PROGRESS_APP_COPY` 整块 → **整体删除**（0 残留标识符） |
| `apps/app/src/components/progress-data.ts` | 264–265 / 290–296 | `PROGRESS_APP_COPY.heatmapAria` / `.curveAria` → `PROGRESS_COPY.*`（实参口径不动：aria 仍吃 `reviewDays`） |
| `apps/app/src/screens/ProgressScreen.tsx` | 251, 298, 299, 328, 339, 340, 351, 352, 381, 386 等 | 仅改引用前缀 `PROGRESS_APP_COPY.X → PROGRESS_COPY.X`；页面结构 / className / data-testid / sr-only **一字未动** |
| `apps/app/test/progress-screen.spec.tsx` | import 行 | 去掉 `PROGRESS_APP_COPY`（`PROGRESS_COPY` 原已从 `@tm/shared` 引入） |
| `apps/web/**` | — | grep 全库：9 个键在 web 侧 **0 消费点**，无需改动 |

九键与 shared 既有键（`heatCell`/`heatCellEmpty`/`cards.*`/`curve.title` 等）按名、按值均无碰撞 → **零合并、9 键全部纯新增**；"7 串"仅为宿主注释的陈述错误（A-65 #182 已裁定），无第 2 处中文键值需要处置。

### 件 B — D 区两串 + 同源不变式哨

| 文件 | 行 | 前 → 后 |
|---|---|---|
| `packages/shared/src/constants/copy.ts` | 494 | `heatSectionTitle: '每日背词热力图'` — 值不变，声明点收敛到 shared 唯一（上收自宿主） |
| `packages/shared/src/constants/copy.ts` | 508 | `heatSparse` 模板 → 逐字 `` `最近一年背了 ${days} 天，再多背几天就能看出一周的习惯` ``；实参仍只吃既有的 `activeDays`（`ProgressScreen.tsx:381`），**不引 `reviewDays`、无硬编码数字、无 SPARSE_DAYS 派生"还差 N 天"** |
| `packages/shared/test/contracts.spec.ts` | 985–1041 | 新 describe「T-03r5 PROGRESS_COPY 九键上收 + D 区同源不变式哨」3 条 `it`：九键存在性+形状、三串唯一声明点 `filesContaining`、`已经背了`=0（split-literal 写法防自污染，先例见同文件 `['password' + 'UpgradeEnforce']`）；**同源不变式哨** `heatmapAria(63) === heatSectionTitle + '，最近一年，共打卡 63 天'`（A-65 #181："两份字面各自声明 + 这颗哨"，不做运行时拼接、不两式并存）；另钉 `heatSparse` 模板形状（两实参串仅差一位数字、含"最近一年"、恰一个数字） |
| `apps/app/test/progress-screen.spec.tsx` | 659–662 | 旧自拟字面（T-18c"已经背了"式）→ 重新钉死为定稿串，`heatSparse(3)` 与 DOM 文本两截皆尔；:370 / :694 的 aria 全串钉**一字未动**；该文件用例数只增不减 |

### 件 C — `AUTH_COPY.setPasswordTooLong`

| 文件 | 行 | 前 → 后 |
|---|---|---|
| `packages/shared/src/constants/copy.ts` | 620–626 | 在 `signInPasswordTooLong`(618) 之后紧邻新增扁平键 `setPasswordTooLong: '这里太长了，删短一点再试一次'`（逐字照抄 fix8），无嵌套；JSDoc 注明 PM-fix8 件 3 / F-23 来源与"禁外溢到登录面" |

### 件 D — `AuthFormShell` 建密码面超长出口

| 文件 | 行 | 前 → 后 |
|---|---|---|
| `packages/ui/src/auth/AuthFormShell.tsx` | 345 | 新增 `const [setPasswordLocalBlocked, setSetPasswordLocalBlocked] = React.useState(false);`（镜像 `signInLocalBlocked`；**不挂 `touched.password`**，保 `auth.spec.tsx:974` 的 blur 时机钉；注释按"第 168 条"措辞避开 ui.spec 的十六进制哨） |
| `packages/ui/src/auth/AuthFormShell.tsx` | 385–392 | `passwordError` 链：`codeField === 'password'` 服务端分支仍**首位** → 登录面两串（仍由 `signInLocalBlocked` 把关）→ 新增 `setPasswordLocalBlocked && isRegister && passwordTooLong ? AUTH_COPY.setPasswordTooLong` |
| `packages/ui/src/auth/AuthFormShell.tsx` | 463–480 | `handleSubmit` 超长块：`if (isRegister) setSetPasswordLocalBlocked(true); else setSignInLocalBlocked(true);` 后照常 `passwordRef.current?.focus(); return;` — "不发请求 + 焦点进密码框"**不变**；`passwordEmpty/passwordTooWeak/passwordTooLong` 判据与 `PASSWORD_MIN`/`PASSWORD_MAX_BYTES` **一字未动**；成功提交与模式切换两处重置新 flag |
| `packages/ui/test/auth.spec.tsx` | 1165–1198（钉 5 内） | **申报互斥的最小反向改判**（A-61 #169 口径，见 ⑤）：OVER_LONG 档"密码框下 0 槽位"期望翻为 alert 存在且 `=== AUTH_COPY.setPasswordTooLong`；空串/纯空格档的 `toBeNull()` 原样保留 |
| `packages/ui/test/auth.spec.tsx` | 1200–1313 | 新 describe 6 条 `it`：正向钉×2（注册/激活：勾协议+超长+点主按钮 → alert 逐字 = `setPasswordTooLong`、0 提交、焦点在密码框、alert 文本不含"至少 8 位"、`expectAllCopyFromShared`）；时机钉×2（只 blur 不点按钮 → 0 呈现；点后才出）；出口钉（`ChangePasswordForm` + `ForcePasswordUpgradeForm` 超长 → alert = `setPasswordTooLong` 且 `not.toMatch(/至少\s*8\s*位/)`、`not.toBe(WEAK copy)`）；判据不动钉（弱密码仍走强度条、服务端 `codeField` 分支仍压过本地串）。161 → 167 只增 |

`signInPasswordMissing/TooLong` 串 A/串 B 未泄漏到任何建密码面（出口钉 + 钉 5 外溢哨共同盯住）。

### 件 E（F-23）— `ChangePasswordForm` 拆并串

| 文件 | 行 | 前 → 后 |
|---|---|---|
| `packages/ui/src/auth/ChangePasswordForm.tsx` | 145–151 | `newTooWeak || newTooLong` 合并出口拆开：`codeField === 'new'` 服务端分支仍首位不动；`newTooWeak` 仍 `TM_ERRORS.WEAK_PASSWORD.copy`；`newTooLong` → `AUTH_COPY.setPasswordTooLong`；JSDoc 按"A-64 第 179 条"改写 |
| `packages/ui/src/auth/ChangePasswordForm.tsx` | 165 | 提交拦截 `if (oldMissing || newTooWeak || newTooLong || confirmPassword !== newPassword) return;` **一字未动** |
| `packages/ui/src/auth/ForcePasswordUpgradeForm.tsx` | — | 未改动：核对确认它委托 `ChangePasswordForm`，故强制改密面同批被件 E 治愈（PM-fix8 §三"待工程核"的答复，见 ⑤） |
| `packages/ui/test/auth.spec.tsx` | 1268–1290（出口钉） | 哨：改密/强制改密两面超长 fixture 的 alert `not.toMatch(/至少\s*8\s*位/)` 且 `=== setPasswordTooLong`（fix8 件 3 反向哨 2 的等价判据） |

---

## ② 出口命令逐字尾行

1. `pnpm --filter @tm/shared test`（基线 52 → 只增）：

```
✓  @tm/shared  test/contracts.spec.ts (55 tests) 92ms

 Test Files  1 passed (1)
      Tests  55 passed (55)
```

2. `pnpm --filter @tm/ui test`（基线 161 / 3 文件）：

```
 ✓  @tm/ui  test/patterns.spec.tsx (51 tests) 552ms
 ✓  @tm/ui  test/auth.spec.tsx (78 tests) 750ms

 Test Files  3 passed (3)
      Tests  167 passed (167)
```

3. `pnpm --filter @tm/app test`（基线 14 文件 / 294 / 0；按 TPM 红线用 filter 形式跑，未踩裸 `npx vitest run` 的 104 假红灯）：

```
 Test Files  14 passed (14)
      Tests  294 passed (294)
```

4. typecheck：`pnpm --filter @tm/app typecheck` → `tsc -p tsconfig.json --noEmit` 退出码 0；`@tm/shared`、`@tm/ui` 同法均 0。`@tm/web` 亦以 0 通过（例行确认；apps/web 本轮**未改动**，故非义务项）。

5. 三串 grep 分布 + `已经背了`=0 — 见 ③。

6. `WEAK_PASSWORD` 出口哨 grep — 见 ③ 末段。

---

## ③ grep 自证

**`每日背词热力图`（8 处，全部可解释）**

| 位置 | 性质 |
|---|---|
| `packages/shared/src/constants/copy.ts:494` | 唯一值声明（heatSectionTitle） |
| `packages/shared/src/constants/copy.ts:497` | JSDoc 逐字引用 §3.7.6 模板（注释，非上屏串） |
| `packages/shared/src/constants/copy.ts:498` | `heatmapAria` 模板前半句 — 件 B 裁定的"两份字面各自声明 + 一颗不变式哨"，即同源纪律本体 |
| `packages/shared/test/contracts.spec.ts:1011` | 唯一声明点哨（钉 copy.ts） |
| `packages/ui/src/patterns/README.md:346` | 既有文档，未动 |
| `packages/ui/test/patterns.spec.tsx:438, :650` | 既有组件测试 ariaLabel 装配件，未动 |
| `apps/app/test/progress-screen.spec.tsx:369, :693` | 既有 aria 全串钉，TPM 明令不动 |

**`最近一年背了`（3 处）**：`copy.ts:508`（唯一声明）＋ `contracts.spec.ts:1012`（唯一声明点哨）＋ `progress-screen.spec.tsx:659`（TPM 明令重钉处）。宿主文件（progress-data.ts / ProgressScreen.tsx）中 0 处。

**`这里太长了，删短一点再试一次`（fix8 定稿全串）**：仅 `copy.ts:626` 声明 + `contracts.spec.ts:1013` 唯一性哨；消费点（AuthFormShell / ChangePasswordForm）一律 `AUTH_COPY.setPasswordTooLong` 引用，无第二处中文字面。`signInPasswordTooLong`（`copy.ts:618`，尾词"再点登录"）为既存的另一串，两串不同值、互不串面（contracts 有 ≠ 哨）。

**`grep -rn "已经背了" apps packages` → 0 命中**（contracts 内的负钉用 split-literal `'已经背' + '了'` 写法，避免自污染，先例同文件）。

**`PROGRESS_APP_COPY`**：代码标识符 0 处；剩余 3 处全为过去式叙述注释（progress-data.ts:14 头注、copy.ts:475 来源注、contracts.spec.ts:989 裁定注）。

**WEAK_PASSWORD 出口哨（件 E 收口后两文件全景）**：
- `ChangePasswordForm.tsx`：:10/:138 注释、:68 `CODE_FIELD` 服务端码映射、:148 `newTooWeak` 分支（TPM 明令保留）→ 均非 too-long 路径；
- `AuthFormShell.tsx`：:113 注释、:116 `CODE_FIELD`、:373 注释、:386 `codeField === 'password'` 服务端分支（明令首位保留）→ 均非本地 too-long 路径。
- 结论：两文件的**本地超长路径**上 `WEAK_PASSWORD` 0 出现，F-23 反号（超长被说成"太弱"）已消灭；服务端回码引用属合法存量。

**DOM 红线自证**：本轮 0 新增 `data-testid`、0 新增 `required`、0 处 `test.fail()`；改动仅引用前缀、串声明、状态位与测试期望。

---

## ④ `data.db` 指纹（跑前 / 跑后）

红线执行：全程只读；临时写一律落 `os.tmpdir()`（本轮测试自身沙盒，无工程侧临时文件）；未执行任何 git 写操作。

| 时点 | 文件 | 字节 | sha256 前 12 | mtime |
|---|---|---|---|---|
| 跑前 | `data.db` | 253952 | `6595517661cc` | 2026-09-18 04:05:38.198449400 +0800 |
| 跑后 | `data.db` | 253952 | `6595517661cc` | 2026-09-18 04:05:38.198449400 +0800 |
| 跑前/跑后 | `packages/server/data.db` | 0 | —（空文件） | 2026-09-17 00:10:53.374159200 +0800 |

**指纹未动。**

---

## ⑤ 申报：互斥改判 / 核回 / 上报

1. **申报互斥（A-61 #169 口径）**：`packages/ui/test/auth.spec.tsx` 钉 5（:1165–1198）旧期望"注册/激活面超长 → 密码框下 alert `toBeNull()`"与件 D 新判据**逻辑互斥**（旧钉正钉着本轮要修的静默分支）。处置：只翻 OVER_LONG 一档为 alert 存在且 `=== AUTH_COPY.setPasswordTooLong`，空串/纯空格档及 0 提交、串 A、串 B 诸期望**原样保留**；翻转处就地留有 5 行改判理由注释（:1183–1187）。除此之外未放宽任何既有断言。
2. **零合并答复（A-65 #182）**：7-vs-9 差异纯属宿主注释陈述错误；9 键与 shared 既有键按名按值均无碰撞，全部纯新增上收，无键需要合并或丢弃。
3. **ForcePasswordUpgrade 核回（PM-fix8 §三"待工程核"）**：`ForcePasswordUpgradeForm.tsx` 委托渲染 `ChangePasswordForm`，超长拦截判据同源存在，旧出口确为 `WEAK_PASSWORD`（"太弱"说"太长"）— 与改密面同型；已随件 E 同批治愈并纳入出口钉（1268–1290 循环覆盖两面）。fix8 §三 的条件句成立。
4. **apps/web**：9 键在 web 侧 0 消费点，未改动；web typecheck 以 0 通过作例行确认。
5. **越界需要：无**。未触碰 `packages/server/**`、`packages/agent/**`、`scripts/**`、`tools/**`（含在飞的 `ownership.json`/`boundaries.mjs`）、`.delivery/` 主文档、`router.tsx`、`main.tsx`。无需 TPM 追加授权的项。
6. **已知坑绕行**：`packages/ui/test/ui.spec.tsx` 的十六进制哨（`#[0-9a-fA-F]{3,8}` 扫 src 全行含注释）— ui 两源文件内所有裁定引用改为"第 NNN 条"措辞，0 命中。

---

## 结论（一段）

T-03r5 五件**全部落地**：件 A（9 键整体上收 `PROGRESS_COPY`、宿主对象整体删除、页面结构零动、web 无消费点）、件 B（`heatSectionTitle` 收敛单点声明、`heatSparse` 定稿串只吃 `activeDays`、A-65 #181 的同源不变式哨一颗入 contracts、app spec :660 旧钉按令重钉且 :370/:694 aria 钉未动）、件 C（`AUTH_COPY.setPasswordTooLong` 扁平键紧随 `signInPasswordTooLong` 入位）、件 D（`setPasswordLocalBlocked` 镜像位只在点主按钮后开闸，判据/不发请求/焦点进密码框全未动，串 A/B 未外溢）、件 E（改密/强制改密两面超长出口与弱密码拆开，服务端 `codeField` 分支与提交拦截一字未动）。出口命令实测：shared **55/55**（基线 52 只增）、ui **167/167 · 3 文件**（基线 161 只增）、app **14 文件 294/294**、app/shared/ui typecheck 退出码 0（web 未改动、例行亦 0）。三串 grep 分布：`每日背词热力图` 8 处=声明 1 + 同源模板 1 + 注释/文档/既有测试钉 6、`最近一年背了` 3 处=声明 1 + 哨 1 + 令钉 1、`这里太长了…试一次` 2 处=声明 1 + 哨 1，宿主源码 0 第二中文字面；`已经背了` 全库 **0**；`WEAK_PASSWORD` 在两文件本地超长路径 0 出现。`data.db` 跑前跑后指纹一致（253952 / `6595517661cc` / 2026-09-18 04:05:38 +0800），**只读红线未破**。申报：1 处互斥反向改判（auth.spec 钉 5 OVER_LONG 档，就地注释理由）、零合并答复、ForcePasswordUpgrade 核回结论（同型已修）；无越界需要、无 git 写操作、无 DOM 测试驱动的改动。
