# T-15r2c 开发报告（批次4C · e2e 归位 + A-41 两笔账收口）

任务代号 **T-15r2c**。范围严格锁在 `apps/web/e2e/**` 与 `apps/web/playwright.config.ts`；
`apps/web/src/**`、`packages/**`、`apps/app/**`、`scripts/**` **一字未改**（发现的不合一律进 §5 上报）。

- 工作树：`E:\CC\tomorrow-memory`（所有命令只在仓库根跑，一律带 `--filter @tm/web`）
- 出口命令用量：6 / 6 次（详见 §4），已达上限，未再追加跑测

---

## 1. 交付物清单（路径 + 行数，移动前后对照）

### 1.1 归位（A-41 #59 裁决 (b)：落点是 `apps/web/e2e/`，简报写错了不是设计有歧义）

| 移动前（`apps/web/tests/`） | 行数 | 移动后（`apps/web/e2e/`） | 行数 | 改名理由 |
|---|---|---|---|---|
| `tests/wordbook.spec.ts` | 133 | `e2e/wordbook.spec.ts` | 133 → **133** | 文件名照原名直用（§10.2:913 名单里就叫 `wordbook`） |
| `tests/account-security.spec.ts` | 185 | `e2e/profile.spec.ts` | 185 → **183** | **按设计改名**：§10.2:913 的 e2e 名单是 `apps/web/e2e/{study,wordbook,profile}.spec.ts`；-2 行是删掉"预期失败"注解与其旧注（见 §3） |
| `tests/home-redline.spec.ts` | 105 | `e2e/home-redline.spec.ts` | 105 → **105** | **保留原名**，登记为"设计外交加"（见 §5-U-9） |
| `tests/helpers.ts` | 153 | `e2e/helpers.ts` | 153 → **200** | 随三个 spec 同目录可达；+47 行是 §1.3 的两处更正与两个文案真源读法（无既有用例改动） |
| `apps/web/tests/`（空目录） | — | **已删除**（不留 `.gitkeep`） | — | 全仓再无第二处 e2e 落点 |

`import` 路径**无需改**：四个文件同批移动，`./helpers` 说明符仍然正确（移动前后一致）。
注释里的旧路径 3 处已就地更正：`e2e/wordbook.spec.ts:8`（跑法）、`:12`（helpers 头注指向）、`:130`（指向 `e2e/profile.spec.ts`）。

### 1.2 新建

| 文件 | 行数 | 内容 |
|---|---|---|
| `apps/web/e2e/study.spec.ts` | **236** | T-15 欠的第三个 e2e 面，覆盖 §10.2:913 判据 **①②⑤**，4 条用例（见 §2） |
| `.delivery/04-dev-report-T-15-r2c.md` | 本文件 | 本报告 |

### 1.3 装配点收敛

| 文件 | 移动前 | 移动后 | 变更 |
|---|---|---|---|
| `apps/web/playwright.config.ts` | 106 行 / **3 个 project** | **83 行 / 2 个 project** | 删掉第三档 `chromium-375x667-tests`（原 :65-92，含其注释与自带 `testDir: './tests'`）；顶层 `testDir: './e2e'`、两档视口 project、`webServer`(:95) **一字未改**；原注释"解法是在 `projects` 里追加第三档"就地更正为"**全部归位 `e2e/`，两档视口**"（新头注第 17-23 行） |
| `e2e/helpers.ts` 的 `mockTrpc` | 错误项按 `data.httpStatus` 回 4xx | **一律 200** | 与文件头注承诺的"手法与 `e2e/auth-wall.spec.ts` 完全一致"对齐（auth-wall 的 `:85` 一直是 200）。根因见 §5-U-1/U-2 |
| `e2e/helpers.ts` 的 `trpcError` | 负载缺 tRPC 协议码 | 补 `error.code`（数字） | v11 的 `isTRPCErrorResponse()` 要 `typeof error.code === 'number'` 才把 `error.data` 挂上 `TRPCClientError.data`。真服务端恒带这一位（`packages/server/test/integration/auth-register.spec.ts:1021` 原话："`raw.error.code` 是 tRPC 的数字码"） |
| `e2e/helpers.ts` 新增导出 | — | `sharedStrings()` / `sharedCopyPattern()` | 供 `study.spec.ts` 现读 `@tm/shared` 的 `RATING_LABELS` / `ARIA.undoRating` / `ARIA.favorite` / `CHECKIN_COPY.done` ⇒ 沿用"文案不硬编码"的既有纪律（同 `sharedErrorCopy`） |

---

## 2. 判据对账表（§10.2:913 T-15 行 判据 ①②⑤）

结果列的"两档全绿"= `chromium-375x667` 与 `chromium-1280x900` 各跑一次都过。
行号取最后一次跑测（run D）的原始输出；§1.3 之后 `study.spec.ts` 只做了一处**类型等价**改动（`DECKS` 的索引签名 → 联合键 + 同语义守卫），用例行位移 +2/+3，见 §6 第 1 条。

| 判据 | 用例（`apps/web/e2e/study.spec.ts`） | 关键断言 | 结果 |
|---|---|---|---|
| **①**「四档评分与撤销、三模式切换（`?mode=`），**`new`/`selfTest` 不发 `reviewCard`**」 | `:110`（现 :112）四档按钮齐、评分发出 `reviewCard`、撤销窗口可点并发出 `review.undo` | `study-rating` 组内 4 颗按钮且可及名逐字 = `@tm/shared` 的 `RATING_LABELS`（防英文术语回流）；点第三档 ⇒ 网络层 `review.reviewCard` **1 次**且入参 `{word:'apple', rating:3}`；推进到下一张；撤销钮**用 `role=button` + 可及名 `撤销上一条评分` 定位**（A-41 #61：没给产品 DOM 加 `data-testid`）⇒ `review.undo` 1 次、退回 `apple`、窗口收起、`reviewCard` 仍只有 1 次 | **两档全绿** |
| **①** 同一判据的"0 请求"那一半 | `:141`（现 :143）三模式切换走 `?mode=`，`new`/`selfTest` 全程 0 条 `reviewCard` | `radiogroup` 内 3 颗 `radio`；点第 2 颗 ⇒ URL `mode=new` 且牌组换掉；点第 3 颗 ⇒ URL `mode=selfTest`；两种模式下各评一张并**走完最后一张落完成页**，全程 `countOf(reviewCard) === 0`、`countOf(review.undo) === 0`、撤销钮 0 个；同时断言 `review.queue` 的入参里 `review`/`new`/`selfTest` 三种 mode 都真取过数 ⇒ **排除"根本没进牌组"造成的假 0** | **两档全绿** |
| **②**「完成页 + "今天已打卡 · 连续 N 天"常驻可点（非弹窗）」 | `:178`（现 :180） | 评完最后一张 ⇒ `study-summary` 可见；`role=dialog` 与 `role=alertdialog` 均 **0 个**（非弹窗）；打卡那一行用 `summary-checkin` **是完成页 DOM 的子节点**（`summary.locator('[data-testid=summary-checkin]')` 计数 1 ⇒ 结构上常驻，不是会自己消失的 toast）；点之前 `toBeEnabled()` ⇒ 可点；点击 ⇒ `checkin.create` **1 次** ⇒ 完成页文本命中现读自 `CHECKIN_COPY.done` 的定稿形状 `今天已打卡 · 连续 (.+?) 天`，且天数是服务端给的 `12`（打卡前 11）；已打卡后该行仍在、钮转已完成态 | **两档全绿** |
| **⑤**「星标才入库（自动灌入代码已删）」 | `:207`（现 :209） | 从 `/study?mode=new` 进（服务端两张卡都回 `hasCard:false`）→ 翻到卡背（星标只长在卡背）→ 评走第一张 → 第二张也翻面：全程 `wordbook.list` 读**发生过**、`wordbook.add` 与 `wordbook.remove` **各 0 次** ⇒ 自动灌入那條路不存在；再显式点星标（可及名现读 `ARIA.favorite`）⇒ `wordbook.add` **恰好 1 次**且入参 `{word:'ember'}`（当前这张，不是别的）⇒ 服务端成员关系回来后 `aria-pressed` 翻为 `true` | **两档全绿** |
| ④ 撤销（对照） | 本轮**不新增** | 词本行删除钮在 `e2e/wordbook.spec.ts:94` 已有（用行内位置定位）；"删除后 toast 里的撤销动作钮"这一面仍缺，见 §6 第 3 条 | 未做（按简报：判据①②⑤） |

**本轮名下文件的红：0。** run D 里 `e2e/study.spec.ts` 8 条、`e2e/wordbook.spec.ts` 14 条、`e2e/profile.spec.ts` 10 过 + 2 skip、`e2e/home-redline.spec.ts` 6 条，全绿。

---

## 3. `test.fail()` 删除自证

### 3.1 结论先说：**没有 unexpected-pass，是"仍按预期失败"** —— A-41 #62 给的前置事实与实测不符

简报说 T-06r 修好 `ChangePasswordForm` 后，原 `tests/account-security.spec.ts:132` 那条钉法"应当转为 unexpected-pass"。
**实测不是**：钉法在位时该用例是 `x`（预期失败成立，缺陷仍在），不是 `Fixed`。原文输出（run A，钉法临时补回后单跑该用例）：

```
$ pnpm --filter @tm/web exec playwright test e2e/profile.spec.ts -g "WEAK_PASSWORD"
Running 4 tests using 4 workers
  ok 2 [chromium-1280x900] › e2e\profile.spec.ts:74:7 › … 新密码不足 8 位：字段级提示逐字等于 `@tm/shared` 的 `WEAK_PASSWORD.copy` (2.0s)
  ok 3 [chromium-375x667]  › e2e\profile.spec.ts:74:7 › … 新密码不足 8 位：字段级提示逐字等于 `@tm/shared` 的 `WEAK_PASSWORD.copy` (2.0s)
  x  1 [chromium-375x667]  › e2e\profile.spec.ts:130:7 › … 服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示 (12.0s)
  x  4 [chromium-1280x900] › e2e\profile.spec.ts:130:7 › … 服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示 (12.6s)
  4 passed (17.5s)
```

（`x` = 该用例真失败；`test.fail()` 注解把失败计成"预期失败"，所以尾部仍写 `4 passed`。若真转 unexpected-pass，Playwright 会打 `Test was expected to fail, but succeeded` 并让整跑红 —— 这里没有。）

**为什么没绿**（两处装配错，都不在页面实现里，逐条查实后就地修）：

1. **产物落后于源码**：`apps/web/.next/BUILD_ID` mtime `09-20 12:56`，而 `packages/ui/src/auth/ChangePasswordForm.tsx`（T-06r 的修复）mtime `09-21 00:57` ⇒ `next start` 跑的是**修复前**的 bundle。§10.2:913 的冒烟命令本来就带 `pnpm --filter @tm/web build`，前两轮省略了它。
2. **打桩层缺 tRPC 协议码**：`e2e/helpers.ts` 的 `trpcError()` 只出 `{error:{message,data:{code,httpStatus}}}`，**没有 v11 要求的数字 `error.code`** ⇒ `@trpc/client` 的 `isTRPCErrorResponse()` 判假 ⇒ `TRPCClientError.data` 为 `undefined` ⇒ 页面 `tmCodeOf()` 只得 `undefined` ⇒ `errorCode` 落成 `null` ⇒ 屏幕上 0 提示。加上原 `mockTrpc` 还回 4xx 状态（v11 在 `!response.ok` 时把整个 batch 数组当**非批量**负载解，`data` 更拿不到）。
   ⇒ 这正是原 T-15 报告 §5-D2 记的"打桩无法复现 v11 错误线格式"的**真身**：不是需要真后端，是桩不忠实。

失败现场（run B，删注解后作为正常断言跑，改桩**之前**）原文：

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  getByRole('alert').filter({ hasText: '密码至少 8 位' })
Expected: 1
Received: 0
Timeout:  10000ms
Call log:
  - waiting for getByRole('alert').filter({ hasText: '密码至少 8 位' })
    22 × locator resolved to 0 elements
       - unexpected value "0"
    141 |     const expected = sharedErrorCopy('WEAK_PASSWORD');
  > 142 |     await expect(page.getByRole('alert').filter({ hasText: expected })).toHaveCount(1);
```
页面快照（`test-results/…/error-context.md`）当时只剩强度条那句"建议更长一点，或混用字母和数字"，无字段级提示 —— 与"旧 bundle + 桩不忠实"两条同时吻合（`auth.changePassword` 的 `expect.poll(===1)` 那一步是**过**的，说明请求真发出去了、只有错误码没送到页面）。

### 3.2 删后转绿（run D，改桩 + 重构建之后）

```
  ok 23 [chromium-375x667]  › e2e\profile.spec.ts:130:7 › … 服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示 (1.1s)
  ok 68 [chromium-1280x900] › e2e\profile.spec.ts:130:7 › … 服务端回 `WEAK_PASSWORD`（客户端长度已合规）：必须仍有可见提示 (1.2s)
```
12 秒超时 → **1.1 秒通过**：不是碰巧，是提示真的当场渲染出来了（`packages/ui/src/auth/AuthFormShell.tsx:260` 的字段级 `role="alert"`，映射表 `CODE_FIELD[WEAK_PASSWORD]='new'` 在 `ChangePasswordForm.tsx:64-70`）。

### 3.3 只动了这一处（边界自证）

`grep -rn "test.fail" apps/web/e2e/` → **只剩注释里的两处文字提及**（`:122`、`:127`，说明为什么撤销），无 `test.fail()` 调用 ⇒ A-41 "`test.fail()` 不得跨轮遗留"清零。
其余用例**一字未改**：`profile.spec.ts` 另外 5 条、`wordbook.spec.ts` 7 条、`home-redline.spec.ts` 3 条断言本体全部原样；`e2e/auth-wall.spec.ts`、`e2e/upgrade.spec.ts`、`e2e/home.spec.ts`（T-16/T-12 名下）**未打开过、未改过**。

---

## 4. 出口命令原文与输出摘要（6 次用完）

```
# 0) 归位后先看条数 —— 2 project × 7 文件
$ pnpm --filter @tm/web exec playwright test --list
Total: 90 tests in 7 files          # 前置事实是 66 tests in 6 files（3 档）；4 文件归位 + 1 新建 ⇒ 90/7，两档

# A) 钉法临时补回，单跑该用例取"删前"证据          → 见 §3.1，结果 x（预期失败成立，非 unexpected-pass）
$ pnpm --filter @tm/web exec playwright test e2e/profile.spec.ts -g "WEAK_PASSWORD"

# B) 删掉注解后作为正常断言单跑（改桩前）            → 2 failed，原文见 §3.1
$ pnpm --filter @tm/web exec playwright test e2e/profile.spec.ts -g "客户端长度已合规"

# C) 全量（未重构建，旧产物）
$ pnpm --filter @tm/web exec playwright test
  37 failed / 2 skipped / 51 passed (1.9m)

# （中间一步，非跑测配额）按 §10.2:913 冒烟命令补生产构建
$ pnpm --filter @tm/web build       → 构建成功，产物含 T-06r 的 ChangePasswordForm

# D) 全量（重构建 + `mockTrpc` 200 口径之后）
$ pnpm --filter @tm/web exec playwright test
  38 failed / 2 skipped / 50 passed (1.5m)      # profile:130 仍红 ⇒ 定位到 §3.1 第 2 条缺件

# E) 全量（`trpcError` 补数字协议码之后，最终态）
$ pnpm --filter @tm/web exec playwright test
  39 failed / 2 skipped / 49 passed (1.4m)
  └ 39 红的分布：e2e/auth-wall.spec.ts 21 · e2e/upgrade.spec.ts 12 · e2e/home.spec.ts 6   ← 全非我名下
    我名下：study 8 绿 · wordbook 14 绿 · profile 10 绿 + 2 skip · home-redline 6 绿 ⇒ 名下 0 红

$ pnpm --filter @tm/web typecheck
$ tsc --noEmit            # 0 error（首轮报了 study.spec.ts 5 处 TS18048 'possibly undefined'，已按 noUncheckedIndexedAccess 修好）
```

> C/D/E 三轮全套数字**不稳定**（37→38→39 红），且红点全在 `auth-wall`/`upgrade`/`home` 三份（T-16/T-12 名下）。
> 逐条比过 run 间差异：`auth-wall.spec.ts:210`、`:326`、`:348` 在三轮里**红/绿交替**，而我名下唯一的公共改动
> `e2e/helpers.ts` 它们并不 import（auth-wall/upgrade 各带自己的 `err()`/`mockTrpc`）。⇒ **疑似 5 个 agent
> 并行同一工作区所致（并发写源码 + 争用 :3100 与 `.next`），本轮原样上报、不背这笔账。**

---

## 5. 归位遗漏上报（含"发现实现/他人用例与判据不合"的登记，一律未擅自修）

- **U-1 打桩层缺 tRPC 协议码（假挡，影响面比本任务大）**：`e2e/helpers.ts` 的 `trpcError()` 原样出 `{error:{message,data}}`，缺 v11 的数字 `error.code` ⇒ 客户端拿不到 `data.code` ⇒ **"服务端 §4.6 码 → 页面翻译"这一整面在过去两轮里根本没被判到**。本轮在自己名下文件里修好（这也是 profile:130 转绿的真正原因）。**同一缺陷仍在 `e2e/auth-wall.spec.ts:67` 的 `err()` 里**（`:85` 回 200 但没有协议码）⇒ 那 21 条红里有多少同因，归 T-16 名下判，本轮**未动其文件**。
- **U-2 两份打桩层口径互斥**：`helpers.ts` 的 `mockTrpc` 注释写着"与 `auth-wall` 完全一致"，实现却按 `httpStatus` 回 4xx（auth-wall 一律 200），二者不可能同时忠实于 v11。本轮统一为 **200**（并写明为什么不照抄 4xx）。建议下一轮把两份打桩层合成一份（`e2e/helpers.ts` 已具备 batch 逗号拆名、`input` 下标取负载、错误项解包全部能力，auth-wall 那份是它的子集）。
- **U-3 出口命令必须自带 build**：§10.2:913 的冒烟命令是 `pnpm --filter @tm/web build && … playwright test …`，前两轮（以及本任务简报的出口命令）把 build 省了 ⇒ 判的是旧产物。本轮补 build 后才有 §3.2 的转绿。**建议写进 A-41 的 e2e 门禁口径**。
- **U-4 `test.skip` 的理由已不成立（本轮不改）**：`e2e/profile.spec.ts:103` 的 `test.skip(true, '打桩无法复现 v11 错误线格式 ⇒ 需真后端')` 在 U-1 修好后**已经可以解开**（同一打桩路径现在能把 `TOO_MANY_REQUESTS` 送到页面）。它不是本轮名下那一条断言，且 A-41 #62 禁两个 agent 同轮换同一断言 ⇒ **原样保留，登记给下一轮**（解开后判的是 `password-form-error` 的表单级落点）。
- **U-5 `e2e/home.spec.ts`（T-12 名下）自身有装配错**：`ReferenceError: INTERACTIVE is not defined` ×2 —— 常量定义在 node 作用域，却被 `page.evaluate` 在浏览器上下文里引用且没当参数传入 ⇒ 该文件 6 条全红。**与实现无关，是测试侧缺陷**，不在我名下，未动。
- **U-6 卡面星标可及名不随状态变**：`packages/ui/src/patterns/Flashcard.tsx:341-347` 的星标 `aria-label` **恒为** `ARIA.favorite(word)`（`收藏 {word}`），入本后只改 `aria-pressed` 与 `title`，`ARIA.unfavorite`（`取消收藏 {word}`）只在 `components/favorite-button.tsx` 那颗用 ⇒ 屏幕阅读器读不到"已收藏"。A-41 #61 不许为测试改 DOM ⇒ `study.spec.ts` 判据⑤ 改判 `aria-pressed`，此处登记。**注意：这是 `packages/ui`（禁改面）的一处真缺陷，不是测试问题。**
- **U-7 完成页没有模式切换器（设计观察，非红）**：`app/(user)/study/page.tsx:94-99` 在 `closed` 分支直接 `return <SessionSummary/>`，不含 `QueueSwitch` ⇒ 走完一轮后只能"再背一批/回首页"，不能就地换模式。判据①/② 的字面要求都满足（三模式切换在牌组未走完时可点、完成页常驻），故**不判红**，仅登记供 A-30 系列裁一句"完成页要不要留模式切换器"。
- **U-8 环境绕行确已无必要**：第三档删除时一并撤掉了 `T15_BROWSER_CHANNEL` 绕行。实测本机 `%LOCALAPPDATA%/ms-playwright` 现有 `chromium_headless_shell-1243` 与 `ffmpeg-1011` ⇒ 不设任何环境变量、走默认内核 + `video: 'retain-on-failure'`，我名下 40 条全绿 ⇒ 该绕行可以退役（与"A-41 #58：装了内核 ≠ 无头能跑"不冲突：判据仍应是 `--list` 起得来，本轮 `--list` 90/7 起得来，跑也真跑完了）。
- **U-9 `home-redline.spec.ts` 登记为"设计外交加"**：§10.2:913 T-15 行的 e2e 名单是 `{study,wordbook,profile}.spec.ts` 三份，**没有这一份**。它就是用户那条"首页只留搜索框 + 必要菜单"硬约束（R-07① / UI §8.3-C）的守门用例（可交互元素 ≤5 + 七项 banned testid 归零），**追认为有价值新增、保留原名**。
- **归位遗漏：无。** 4 个文件全部到位、`tests/` 已空并删除、config 收敛两档、`--list` 7 文件 90 条与两档 project × 7 文件完全对齐（45 条/档）。

---

- **U-10 仓库卫生（未动，只登记）**：`.gitignore` 与 `apps/web/.gitignore` 都**没有** `test-results/` 条目 ⇒ 跑测产物（他人 39 红的截图/录像）会以 untracked 身份混在 `git status` 里。本轮只删掉自己名下那几个失败产物目录，**没有代改 `.gitignore`**（配置面不属本任务授权）。建议 E4 出口前补 `test-results/`、`playwright-report/` 两行。

## 6. 遗留清单（下一轮 / 别的 agent 名下）

1. **确认跑（配额已用满 6/6）**：`study.spec.ts` 在 run E 之后只挨过一次**类型等价**修改（`Record<string,string[]>` → `Record<DeckMode,string[]>` + 同语义守卫，`?? DECKS.review` → `isDeckMode(mode) ? DECKS[mode] : DECKS.review`）与零处逻辑修改；`profile.spec.ts` 其后只改过 `/** */` 注释文字。按 cap 不再追加跑测，请下一轮出口顺带复跑：`pnpm --filter @tm/web exec playwright test e2e/study.spec.ts e2e/profile.spec.ts`（记得先 build）。
2. **解开 U-4 那条 `test.skip`**（`e2e/profile.spec.ts:102-103`）：桩修好后它该转正常断言并判 `password-form-error` = `TM_ERRORS.TOO_MANY_REQUESTS.copy`。
3. **判据④ 的撤销面**：`e2e/wordbook.spec.ts` 只判到"显式删除发出 `wordbook.remove`"，"删除后 toast 里一次可撤"未判。定位一律走 `role`/可及名（`host.toast(…, { action:{ label: … } })` 出的那颗钮）；**不给产品加 `data-testid`**（A-41 #61）。
4. **auth-wall 打桩层同缺协议码（U-1）**：等 T-16 名下处理，或按 U-2 合并两份打桩层后自然消失。
5. **全套 39 红非我名下**（auth-wall 21 / upgrade 12 / home 6），含 U-5 那条测试自身缺陷；并发争用 `.next`/`:3100` 期间数字可能瞬时漂移，**下轮出口请以"名下 0 红 + 一次 build 后的全套"两个口径分别记**。
6. **判据⑥（`globals` 无硬编码色）/⑦（无内部术语徽章）**：全站 grep 门禁归 E4 统一跑（A-41 #63），本轮不背。
7. `apps/web/e2e/helpers.ts` 新增的两个文案真源读法是**正则读盘**（`sharedErrorCopy` 的老路子）：`@tm/shared` 若把 `RATING_LABELS`/`CHECKIN_COPY` 改写成别的声明形式，它们会抛"找不到"而不是假绿 —— 属预期行为，改 shared 时请顺带看一眼。
