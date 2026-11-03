# T-15 开发报告（整任务：第 1 轮 + 第 2 轮 A + 第 2 轮 B）

- 任务：**T-15** Web 学习闭环与词本/我的页（`02-tech-design.md:913`）
- 角色：前端开发工程师（Web 端）
- 本轮：**第 2 轮 B（e2e + 总报告）**
- 主工作区：`E:\CC\tomorrow-memory`（非 worktree）
- 本轮写盘范围：`apps/web/tests/**`（新建 4 个文件）+ `apps/web/playwright.config.ts`（**纯追加**一个 project）
- **绝对未碰**：`apps/web/src/app/(user)/page.tsx`（首页，用户唯一原始约束）、`apps/web/src/**` 其余全部、`packages/**`、`tools/**`、`mobile-memory/**`、`apps/app/**`；无任何 git 写操作；未写 `data.db` / `packages/server/data.db`（e2e 全程 `page.route` 打桩，不落任何库）

---

## 0. 一段必须写在最前面的现场事实（关系到本轮为什么"重做"）

第 2 轮 B 的**第一版** e2e（另一套打法：`tests/utils.ts` + `tests/dev-code.ts` + 真后端 + `scan-restore` 隔离库，约 37/38 通过）写在 `.worktrees/wt-config` 里。本轮开工中途该工作树被**外部删除**（`git worktree list` 现在只剩 `E:/CC/tomorrow-memory [main]`），那一版连同 config 改动一起全灭，主工作区里 `apps/web/tests/` 目录不存在、`playwright.config.ts` 也未改。

回到主工作区后勘察发现：**主工作区的代码状态比那个 worktree 旧**，简报"现场"表里的若干前提在这里不成立——

| 简报说法 | 主工作区实测 |
|---|---|
| 「另有 agent 在 `.worktrees/wt-config` 跑」 | 该目录已不存在（`ls .worktrees` → No such file） |
| 「Playwright chromium 内核我刚装完（exit 0），本机跑得动 e2e」 | **`%LOCALAPPDATA%\ms-playwright` 目录当时根本不存在**。这与 `04-dev-report-E2.md:19/181`、`04-dev-report-T-12.md:197/208`、`T-04`、`T-05` 四份报告的记录一致：本机从来没有内核。首轮 13 条全红于 `browserType.launch: Executable doesn't exist at ...\chromium_headless_shell-1243\chrome-headless-shell.exe`。本轮我自己执行了 `playwright install chromium --only-shell`（114.6 MiB，一次被超时截断、后在后台跑完 exit 0）+ `playwright install ffmpeg`（`video:'retain-on-failure'` 需要，否则 `newPage()` 就抛），现在缓存里是 `.links \| chromium_headless_shell-1243 \| ffmpeg-1011 \| winldd-1007` |
| e2e 落点 `apps/web/tests/` | 主工作区既有 e2e 在 **`apps/web/e2e/`**（`auth-wall` / `home` / `upgrade` 三个 spec），且 `playwright.config.ts:12` 明写「⛔ T-15/T-16 不要再各自造配置文件……新增 `e2e/wordbook.spec.ts`、`e2e/profile.spec.ts` 一律落进 `apps/web/e2e/`」。→ 见 §6 越界申请 X-1 |
| 首页/词本/安全页接线 | ✅ 属实，见 §1（行数与简报一致） |

因此第一版那套「真后端 + 短信哨兵码 + 隔离 dev.db」的打法在主工作区**不成立**（这里没有 `/api/auth/dev-verification-code` 路由、`config.ts` 没有测试号白名单、没有 `.local/` 目录），本轮改为**复用既有手法**：照抄 `e2e/auth-wall.spec.ts` 的 `page.route('**/trpc/**')` + tRPC v10/v11 batch 线格式打桩层（见 `tests/helpers.ts` 头注），完全不碰任何数据库文件。

---

## 1. 交付清单

### 1.1 第 2 轮 A（页面接线，已落盘，本轮只复述 + 实测行数，未改动）

| 文件（相对仓库根） | 行数 | §10.2 交付物栏 |
|---|---|---|
| `apps/web/src/app/(user)/wordbook/page.tsx` | **289** | 🆕 |
| `apps/web/src/app/(user)/profile/security/page.tsx` | **110** | 🆕 |
| `apps/web/src/app/(user)/profile/page.tsx` | **94**（313 → ≤100 ✅ 瘦身达成） | ✏️ |
| `apps/web/src/app/(user)/study/page.tsx` | **114**（283 → ≤120 ✅） | ✏️ |
| `apps/web/src/app/(user)/word/[word]/page.tsx` | 49 | ✏️ |
| `apps/web/src/components/flashcard.tsx` | **已删除**（🗑️ 拆为 `components/study/card-view.tsx`(160) + `@tm/ui/patterns/Flashcard`） | 🗑️ |
| `apps/web/src/components/study/{card-view,deck-states,queue-switch,session-summary}.tsx` | 160 / 118 / 69 / 136 | 🆕 |
| `apps/web/src/components/wordbook-sidebar.tsx` | 97（瘦身） | 🆕 |
| `apps/web/src/components/profile/{avatar-setting,checkin-card,goal-setting,settings-list,stat-cards}.tsx` | 132 / 84 / 109 / 190 / 69 | 🆕 |
| `apps/web/src/components/favorite-button.tsx` | 106 | 🆕 |
| `apps/web/src/lib/api/{review,wordbook,profile}.ts` | 265 / 402 / 426 | 🆕 |

> ⚠️ §10.2 交付物栏点名的 `apps/web/e2e/{study,wordbook,profile}.spec.ts` **三份都还没有**（第 1 轮和第 2 轮 A 都撞回合上限中断、没产出 e2e）。本轮 B 交付的是其中 **wordbook / profile(账号安全) / 首页红线** 三面，落点在 `apps/web/tests/`；`e2e/study.spec.ts`（判据①②）仍未建 → 见 §5-D3。

### 1.2 第 2 轮 B（本轮新建，共 576 行）

| 文件 | 行数 | 作用 |
|---|---|---|
| `apps/web/tests/helpers.ts` | 153 | 共用打桩层：`mockTrpc` / `ok` / `trpcError` / `seedSignedIn` / `payloadOf` / `sharedErrorCopy`。**文案不硬编码**：`sharedErrorCopy()` 现读 `packages/shared/src/constants/errors.ts` 的 `TM_ERRORS[*].copy` |
| `apps/web/tests/wordbook.spec.ts` | 133 | 判据面①：登录态进页 / 列表渲染 / 空态 / 未登录引导 / 搜索 / 阶段分组 / 删除（移出） |
| `apps/web/tests/account-security.spec.ts` | 185 | 判据面②：我的 → 账号安全 → 修改密码**三级导航** + 改密校验口径（≥8 位 / 两次不一致 / 成功态重登告知 + 退出） |
| `apps/web/tests/home-redline.spec.ts` | 105 | 判据面③：首页 `[data-testid=home-root]` 子树可交互元素 **≤5** 的 DOM 断言（**只写断言，未动首页**） |
| `apps/web/playwright.config.ts` | +21（纯追加） | `projects` 末尾追加第三档 `chromium-375x667-tests`（自带 `testDir: './tests'` + `testMatch: /.*\.spec\.ts/`）。**既有两档、顶层 `testDir`/`webServer`/`use`/`expect` 一字未改** |

`helpers.ts` 相对 `e2e/auth-wall.spec.ts` 多做两件事（都是实测踩出来的，不是另起一套）：
1. **批量多过程解包**：`httpBatchLink` 会把同帧两条查询合成 `/trpc/profile.get,checkin.status?batch=1&input={"0":…,"1":…}`。照 auth-wall 的"整串当过程名"写法，`/profile` 页直接被判成"账号信息没拿到"（首轮实测红）。
2. **负载解包** `unwrapInput()`：POST batch 的 `[{id,type,path,input}]` / GET 的 `input={"0":{…}}` 都还原成过程入参，于是"删的是哪个词、改密提交了什么"可断言。

---

## 2. e2e 真实输出（原始尾部）

### 2.1 规范命令（默认下载内核，无绕行）

```
$ pnpm --filter @tm/web exec playwright test tests/wordbook.spec.ts tests/account-security.spec.ts tests/home-redline.spec.ts
  ok  9 [chromium-375x667-tests] › tests\home-redline.spec.ts:97:7 › 首页极简红线（R-07① / §8.3-C） › 聚焦搜索框后仍不出现页面级导航（最近查询面板另记，不判红） (2.0s)
  ok 10 [chromium-375x667-tests] › tests\wordbook.spec.ts:30:7 › 单词本页（/wordbook） › 登录态：列表按服务端整数组渲染，行数与总数一致 (1.4s)
  ok 12 [chromium-375x667-tests] › tests\wordbook.spec.ts:53:7 › 单词本页（/wordbook） › 未登录：只给登录引导，不发词本查询 (877ms)
  ok 16 [chromium-375x667-tests] › tests\wordbook.spec.ts:128:5 › 文案真源：改密提示与 `@tm/shared` 的 `TM_ERRORS` 逐字相同（防页面自造口径） (14ms)
  ok 11 [chromium-375x667-tests] › tests\wordbook.spec.ts:43:7 › 单词本页（/wordbook） › 空态：服务端回空数组时出 `wordbook-empty`，不出列表行 (1.3s)
  ok 13 [chromium-375x667-tests] › tests\wordbook.spec.ts:63:7 › 单词本页（/wordbook） › 搜索：命中数收窄并出实时计数，清空后复原 (1.1s)
  ok 14 [chromium-375x667-tests] › tests\wordbook.spec.ts:81:7 › 单词本页（/wordbook） › 分组（阶段筛选）：切到「新词」只剩 reviewCount 为 0 的那条 (1.1s)
  ok 15 [chromium-375x667-tests] › tests\wordbook.spec.ts:94:7 › 单词本页（/wordbook） › 删除（移出词本）：行内显式删除按钮发出 `wordbook.remove`，服务端摘除后行消失 (887ms)
  x   1 [chromium-375x667-tests] › tests\account-security.spec.ts:131:7 › 账号安全页（/profile/security） › 服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示 (12.7s)

  1 skipped
  15 passed (18.5s)
```

读法（三件事，不许混）：
- **15 passed 里含 1 条"预期失败"**：`account-security.spec.ts:131` 用 `test.fail()` 钉住 §5-D1 那个真缺陷。Playwright 对 `test.fail()` 的失败计进 passed。缺陷修好后它会以 `Fixed` 反报红，不会被悄悄删。
- **1 skipped** 是 §5-D2：打桩复现不了 tRPC v11 的**错误线格式** ⇒ 该面（服务端 §4.6 码 → 页面按 shared 定稿串翻译）本轮**没有跑到**，断言本体留在文件里，补上真后端把 `test.skip` 改回 `test` 即可跑。**没有把 skip 记成 pass。**
- `x 1` 那一行是 `test.fail()` 的可视化输出，不是失败用例数（失败数 0）。

### 2.2 首轮（内核缺件时，走系统 Chrome 绕行）

```
[home-redline] 初始可交互元素 = 3 → input[role=combobox] | button | a
[home-redline] 聚焦后可交互元素 = 3 → input[role=combobox] | button | a
  1 failed
    [chromium-375x667-tests] › tests\account-security.spec.ts:92:7 › … 服务端码（无字段归属）：表单级 `password-form-error` 渲染 shared 定稿串
  14 passed (15.1s)
```
更早两轮的原始红（环境 / 自身用例问题，都已定位，非"凑绿"）：
```
  13 failed / 1 passed
    Error: browserType.launch: Executable doesn't exist at C:\Users\曹怡明\AppData\Local\ms-playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe
  ——
  11) … Error: browserContext.newPage: Executable doesn't exist at …\ms-playwright\ffmpeg-1011\ffmpeg-win64.exe
```
被红暴露并修掉的**用例侧**问题（都不是改断言，是改打桩/选择器）：
1. `/profile` 双查询被 batch 合并 → `helpers.ts` 增按逗号拆过程 + 下标取输入；
2. `expect(locator).first()` 括号写错位置；
3. `calls[0]` 与 `payloadOf(calls, proc)` 混用（首页先发的 GET 把 `calls[0]` 占了）；
4. 词本假数据 `addedAt` 同毫秒 → `recent` 排序不可判定 → 显式拉开；
5. 行内"删除"与"已收藏"两颗按钮都带 `title` → strict mode violation → 改按行内控件顺序（`WordbookList.tsx:334/350/364` 星标→喇叭→删除，删除是最后一颗）定位。

### 2.3 首页红线的实测计数（判据③ 的核心数字）

`home-root` 子树里可交互元素 = **3**（`input[role=combobox]` 搜索框 + 1 颗 `button` + 1 个 `a`），聚焦搜索框后仍是 **3** ⇒ 上限 5 有余量，**红线成立**。计数口径（宽口径，防假绿）写在 `home-redline.spec.ts` 头注：14 个选择器取并集、按 DOM 身份去重、剔 `aria-hidden` 与零尺寸。顶栏菜单在 `(user)/layout.tsx` 壳里、不在 `home-root` 内，故不计入（属"必要菜单"）。

---

## 3. 出口命令输出

```
$ pnpm --filter @tm/web exec playwright test tests/{wordbook,account-security,home-redline}.spec.ts --project=chromium-375x667-tests
  1 skipped
  15 passed (18.5s)            # 失败 0

$ pnpm --filter @tm/web typecheck
$ tsc --noEmit
../../packages/server/src/services/backup.ts(208,49): error TS2345: Argument of type 'BackupAlertPayload & { kind: string; tag: string; }' is not assignable to parameter of type 'Record<string, unknown>'.
../../packages/server/src/services/backup.ts(248,75): error TS2322: Type 'null' is not assignable to type '((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined'.
Exit status 2
```
> **归属**：`pnpm --filter @tm/web typecheck` 现在**不是 0 错**（与简报"门禁实测 0 错"不同），但 2 条红**全部**在 `packages/server/src/services/backup.ts`——并发 agent（`packages/server/src/**`）名下，`apps/web/tests/**` 与 `apps/web/src/**` 均 0 条红（`grep -E "^tests/|^src/" → 空`）。按"看到别人名下的红一律记录不修"处理。**记录时点**：本轮最后一次跑（同一条命令本轮共跑 3 次：2 次修自己的用例红、1 次出口）。
> 注：`apps/web/tsconfig.json` 的 include 覆盖 `../packages/server/**`，所以 web 的 typecheck 门禁会被 server 面的改动污染 —— 这条本身值得 TPM 记一笔（门禁归属不清）。

```
$ node tools/boundaries.mjs --check-ownership --task T-15 --diff-file t15b.patch
PATCH 5 个文件的 diff 参与判定
NOTE apps/web/tests/helpers.ts：归属表无条目（no-entry，不阻断）
NOTE apps/web/tests/wordbook.spec.ts：归属表无条目（no-entry，不阻断）
NOTE apps/web/tests/account-security.spec.ts：归属表无条目（no-entry，不阻断）
NOTE apps/web/tests/home-redline.spec.ts：归属表无条目（no-entry，不阻断）
NOTE apps/web/playwright.config.ts：归属表无条目（no-entry，不阻断）
--check-ownership task=T-15 触碰 0 个文件 → 无越界
```
`node tools/boundaries.mjs --status | grep T-15` → **无匹配**：`tools/ownership.json` 里 T-15 名下 0 条目，`apps/web/tests/**` 与 `playwright.config.ts` 都是 no-entry。→ §6 X-2 申请登记。

`pnpm --filter @tm/web build`：本轮**未跑**（简报"不要重复 build"，且产物 `apps/web/.next/BUILD_ID` 已在；`webServer` 用 `next start -p 3100` 直接复用，e2e 全程跑通 ⇒ 产物可用性已被间接证明）。

---

## 4. 逐条对照 §10.2 T-15 行完成判据（`02-tech-design.md:913` 原文）

原文（列 8）：
> ① 四档评分与撤销、三模式切换（`?mode=`），**`new`/`selfTest` 不发 `reviewCard`**（网络层断言 0 请求）；② 完成页 + "今天已打卡·连续 N 天"常驻可点（非弹窗）；③ 词详情页四来源进入、按 `?from=` 返回；④ `/wordbook` 搜索+4 排序+4 筛选+行内释义与喇叭+删除撤销；⑤ 星标才入库（自动灌入代码已删）；⑥ `globals` 无硬编码色；⑦ 无内部术语徽章（R-25 范围内本期 P0 页面 0 命中）

| 判据 | 本轮状态 | 证据 / 缺口 |
|---|---|---|
| ① 四档评分与撤销 + 三模式切换 + `new`/`selfTest` 0 请求 | ❌ **未覆盖** | 需要 `e2e/study.spec.ts`（§10.2 交付物栏点名，至今未建）。本轮 e2e 三面不含 study。→ §5-D3 |
| ② 完成页 + "今天已打卡·连续 N 天"常驻可点 | ❌ **未覆盖** | 同上（`session-summary.tsx`(136) / `checkin-card.tsx`(84) 已落盘，但无 e2e 面）。→ §5-D3 |
| ③ 词详情页四来源、按 `?from=` 返回 | ⚠️ **部分** | `wordbook.spec.ts` 断言了行链接由 `wordHref(word,'wordbook')` 生成（`?from=wordbook`，DOM 快照 `- link "查看 pepper 的详情"`）；四来源齐备与返回落点未测（详情页归 §10.2 另一行） |
| ④ `/wordbook` 搜索+4 排序+4 筛选+行内释义与喇叭+删除撤销 | ✅ **本轮 6 条 e2e** | 搜索（`pep`→1 行 + 实时计数 + URL 带 q + 清空复原）、分组（4 个 chip 齐 ⇒ `toHaveCount(4)`，切「新词」→1 行）、删除（`wordbook.remove` 入参 `{word:'lemon'}` ⇒ 行数 3→2 且该词行归零）、登录态列表、空态、未登录引导。**未覆盖**：4 档**排序**菜单切换、喇叭（`speakLabel`）、**删除后撤销**（`wordbook.add` 支路已写进 mock，但撤销入口是 toast 动作钮、其 testid 未钉，见 §5-D4） |
| ⑤ 星标才入库（自动灌入代码已删） | ❌ **未覆盖** | 只观测到星标按钮 `title="已收藏"` 的渲染；"不自动灌入"要网络层断言（0 次 `wordbook.add`）⇒ 归 study/wordbook 补测轮 |
| ⑥ `globals` 无硬编码色 | ➖ 非本轮面 | `apps/web/src/app/globals.css` 不在本轮写权限内；A 轮未声明处理。归属：出口轮 E4 用 `node tools/boundaries.mjs --copy` 或既有 `--check-*` 判 |
| ⑦ 无内部术语徽章 | ➖ 非本轮面 | 同上，属全站 grep 门禁，建议 E4 统一跑 |
| 出口命令（原文列 7） | ⚠️ **部分** | 原文写 `pnpm --filter @tm/web build && playwright test e2e/study.spec.ts e2e/wordbook.spec.ts`：`wordbook` 面本轮已跑绿（落点在 `tests/` 而非 `e2e/` ⇒ §6 X-1）；`build` 未重复跑；`e2e/study.spec.ts` 不存在 |
| 简报追加的三面墙 | ✅ | 单词本页（6 条）、账号安全二级页 + 三级导航 + 改密口径（4 passed / 1 skipped / 1 expected-fail）、首页红线 ≤5（3 条，实测 3） |

改密文案口径（简报点名的一条）实测细节：
- 客户端：新密码 `abc` → 字段级 `role=alert` 文案 = `TM_ERRORS.WEAK_PASSWORD.copy` = **`密码至少 8 位`**（`packages/shared/src/constants/errors.ts:87`），`input[name=newPassword]` 带 `aria-invalid="true"`，且**不发请求**（`countOf('auth.changePassword') === 0`）。
- 客户端：`BrandNewPass1` ≠ `BrandNewPass2` → `role=alert` = `TM_ERRORS.PASSWORD_MISMATCH.copy` = **`两次输入的密码不一致`**。
- 成功态：`security-relogin-notice` 可见 → `security-signout` 点击后 `localStorage.tm_token` 被清。
- 页面自身**不含任何自造句子**：用例把屏幕文本与现读的 shared 定稿串做 `toHaveText`/`filter({hasText})` 全等比较（`sharedErrorCopy()` 用正则从 `errors.ts` 取，不在 spec 里落中文串常量）。

---

## 5. 缺陷登记（发现即上报，一律未修）

**D1｜`packages/ui` 名下真缺陷（阻塞"服务端 WEAK_PASSWORD 的用户可见性"）**
`packages/ui/src/auth/ChangePasswordForm.tsx:134-146`：
```ts
const newError = codeField === 'new' && code !== 'WEAK_PASSWORD' ? TM_ERRORS[...].copy
               : touched.new && (newTooWeak || newTooLong) ? TM_ERRORS.WEAK_PASSWORD.copy : undefined;
const underButton = code && !codeField ? TM_ERRORS[code].copy : code ? undefined : serverMessage;
```
`CODE_FIELD` 把 `WEAK_PASSWORD → 'new'`（:67）。于是**服务端**回 `WEAK_PASSWORD`、而客户端长度这一关已过（≥8 位，例：服务端因策略/黑名单更严）时：字段级因 `code !== 'WEAK_PASSWORD'` 不出话、`touched.new && newTooWeak` 也假；表单级因 `codeField` 有值被置 `undefined` ⇒ **屏幕上 0 条提示**，用户点保存只见焦点回到第一个字段。违反 §3.9.4「失败必给人话」。
本轮处理：`account-security.spec.ts:131` 用 `test.fail()` 钉成预期失败（修好后以 `Fixed` 反报红）。**未改 `packages/ui`。**

**D2｜tRPC v11 错误线格式：打桩层复现不出来（也牵出 T-16 的一处可疑前提）**
`auth.changePassword` 的调用**确实发出**（`payloadOf` 断言过 `{oldPassword, newPassword}`），但三种错误负载都未被客户端当失败：
① `[{error:{message,data:{code,httpStatus}}}]` + HTTP 200（= `e2e/auth-wall.spec.ts` 头注第 2 条写的口径）；② 再套 `error.json`（transformer 解包路径）；③ 按 §4.6 给 4xx 状态。快照均显示表单 0 提示、0 toast，`onError` 未进。
⇒ 「服务端码 → shared 定稿串」这一面**本轮未证**，`account-security.spec.ts:102` 已 `test.skip(true, …)` 并留断言本体，归 **Phase 5 / CI 真后端**（`apps/app` 侧有真 :3001 的 e2e 装配可抄）。
**连带上报 TPM**：`e2e/auth-wall.spec.ts` 头注把 ① 当作既有事实（"失败 `[{error:{message,data}}]`、`data.code` 就是 §4.6 码"），而该 spec 至今**从未在本机执行过**（内核今天才装）。若 ① 站不住，T-16 那套里所有"服务端码驱动"的断言都可能在首次真跑时成片红——建议 T-16 第 3 轮或 E4 第一件事就是把 `e2e/auth-wall.spec.ts` 真跑一遍。

**D3｜§10.2 交付物栏的 `apps/web/e2e/{study,wordbook,profile}.spec.ts` 不齐**
本轮交的是 wordbook / 账号安全(profile 系) / 首页红线，且落在 `tests/`。**`e2e/study.spec.ts` 无人写**，直接导致判据①②⑤⑦ 无 e2e 面。第 2 轮 A 只做了页面接线，没算这项。→ 请派 T-15 第 3 轮（或并入 E4）。

**D4｜删除撤销的断言入口**
`lib/api/wordbook.ts:361-400` 的撤销是 `toast(...)` 的 **action 按钮**（label = `VERBS.undo`），而 toast DOM 无 testid/`data-` 锚点可稳定定位。本轮 mock 里已备好 `wordbook.add` 支路，缺一个可寻址的出口。归属 T-12/T-16 的 toast 宿主（`components/*` 不在我写权限内）→ 建议给 toast 动作钮加 `data-testid="toast-action"`（越界申请，见 §6 X-3）。

**D5｜并发红（记录不修）**
`packages/server/src/services/backup.ts` 2 条 TS 红（见 §3），拉红 `@tm/web` 的 typecheck 门禁。

**D6｜环境**：本机 Playwright 内核/ffmpeg 由本轮补齐（§0）。之前 5 份报告（E2/T-04/T-05/T-12 + 本轮首跑）记的"环境缺件"至此关闭；后续 agent 可直接跑 `pnpm --filter @tm/web exec playwright test …`，**不需要** `T15_BROWSER_CHANNEL`。

---

## 6. 越界申请与待 TPM 拍板项

| # | 事项 | 申请 / 待拍板 |
|---|---|---|
| **X-1** | **e2e 落点冲突**：简报给 `apps/web/tests/`，`§10.2:913` 交付物栏与 `playwright.config.ts:12` 的 A-30-6 注都给 `apps/web/e2e/` | 本轮**按简报**落 `tests/`，并用**纯追加**的第三 project 收集（既有两档零改动）。请拍板：**(a)** 维持 `tests/`（承认这是 e2e 的第二目录，A-30-6 的"一律落 e2e/"注需补一句例外），或 **(b)** 我把 4 个文件 `mv` 进 `e2e/`（随后 config 的追加**可整块回退**，命名 `wordbook.spec.ts`/`account-security.spec.ts`/`home-redline.spec.ts` 已按既有 `.spec.ts` 约定，进 `e2e/` 即被既有两档自动收集）。我倾向 (b)，一条命令的事，等批准再动 |
| **X-2** | `tools/ownership.json` 里 T-15 名下 0 条目（`--check-ownership` 只能报 no-entry ⇒ 归属门禁对本任务实际不设防） | 申请把 `apps/web/tests/**`（或 `apps/web/e2e/{wordbook,profile,home-redline}.spec.ts`）+ `apps/web/playwright.config.ts` 的**追加段**登记到 T-15 名下。注意 config 是全仓唯一装配点（A-30-6 占位面），登记为"共写/仅追加"更合适 |
| **X-3** | 判据④ 的"删除撤销"要一个可寻址的 toast 动作钮（D4） | 申请让 T-12/T-16 在 toast 宿主上加 `data-testid="toast-action"`（1 行，属 `apps/web/src/components/**`，我不碰） |
| **X-4** | D1 缺陷修复权 | 归 `packages/ui` owner（T-06/E 系列）。我只钉了预期失败用例，**没动组件** |
| **X-5** | 判据⑥⑦（`globals` 无硬编码色 / 无内部术语徽章） | 属全站 grep 门禁，不在本轮三面 e2e 能力内 → 建议 E4 出口轮统一跑 `node tools/boundaries.mjs --copy` 等 |
| **X-6** | `@tm/web` typecheck 因 `tsconfig` include `../packages/server/**` 而继承后端面的红（D5） | 请拍板是否把 server 面从 web 门禁里摘出去（`tools/**`、`apps/web/tsconfig.json` 都不在我写权限内） |
| **X-7** | 简报"现场"表里的 chromium 内核前提不成立（§0） | 已在本轮自行补齐并记录。若 TPM 那次 `install` 是在别的 HOME / `PLAYWRIGHT_BROWSERS_PATH` 下做的，请给出路径，否则以本轮补齐的 `%LOCALAPPDATA%\ms-playwright` 为准 |

---

## 7. 本轮自查

- 未跑 git 写命令；未改 `apps/web/src/**`（含首页）、`packages/**`、`tools/**`；未写任何 `.db`。
- 未放宽任何门禁：`--check-ownership` 用的是合成 patch（新增文件未 `git add -N`），config 改动是数组尾部追加一个对象。
- 未删/未改任何既有断言；新增的 1 条 `test.skip` 与 1 条 `test.fail()` 都带完整原因注释，且都不记为 pass。
- 出口命令计数：playwright 规范跑 1 次（另有 3 次定位性诊断跑，原始输出在 §2）；typecheck 3 次（§3 已声明时点与归属）；boundaries 1 次。
