# 04-dev-report · E5c（客户端把上游裸文本当人话糊屏）

- 任务：TPM 修件 E5c，范围三处（件①/件②/件③）
- 报告写成时间（实测时钟 `date '+%F %T'`）：**2026-09-27 00:52:48**
- 分支/工作树状态：只做本修的四个源件 + 三个 spec 件，⛔ 未做任何 git 写操作（本会话只用了 `git diff --stat` 这一条只读命令）

---

## 1. 改动文件清单（绝对路径 + 行号 = 改后实测行号）

### 件① 客户端出口：让「响应体不是 JSON」可判别
`E:\CC\tomorrow-memory\apps\app\src\data\rest-fetcher.ts`

| 行号 | 改动 |
| --- | --- |
| 4 | 文件头规矩数：`三条不可让的规矩：` → `三条不可让的规矩（E5c 起加第 4 条）：` |
| 12-15 | 文件头新增规矩 4：上游原文永不上屏；判定只看「能不能 `JSON.parse`」，⛔ 按 `content-type` 字符串名匹配 |
| 63-71 | `apiErrorMessage()`：在 `isTmErrorCode` 支之后加一行 `if (isMissingEndpoint(error)) return PLAIN_TERMS.unknownEndpoint;`（契约码仍最优先，未被盖） |
| 73-88 | 新增导出 `interface RawResponseBody { readonly __raw: true; readonly text: string }` + 模块内 `isRawBody()`（用属性读判 `__raw === true`，⛔ `Object.hasOwn`） |
| 89-99 | 新增导出判定单点 `isMissingEndpoint(error: unknown): boolean`：非 `ApiError` ⇒ false；`isTmErrorCode(error.code)` ⇒ false（服务端给了契约码就不算"没端点"）；否则 `isRawBody(error.body) || status === 404 || status === 405` |
| 219-238 | `parseBody()` 由 `Promise<unknown>` 改判为 `Promise<ParsedBody>`（`{ value, isJson }`）：空体 ⇒ `{value:null,isJson:true}`（保持既有回落面不漂）；`JSON.parse` 成功 ⇒ `{value,json 原值,isJson:true}`；**失败 ⇒ `{ value: { __raw: true, text }, isJson: false }`**，旧的 `return { error: text }`（冒充服务端信封那一句）已删除 |
| 292 | 调用点改成解构 `const { value: payload, isJson } = await parseBody(res);` |
| 294-317 | `!res.ok` 分支重写：`safeParse` 只在 `isJson === true` 时跑（拿 `let code / let serverMessage` 收），新增 `const missingEndpoint = !isJson || res.status === 404 || res.status === 405;`，抛出的人话 = `missingEndpoint ? (known ? errorMessage(known) : PLAIN_TERMS.unknownEndpoint) : serverMessage || (known ? errorMessage(known) : SYNC_COPY.serverBusy)`；`ApiError` 的**码**（`known ?? (>=500?BAD_RESPONSE:HTTP_ERROR)`）、`status`、`body` 三格语义未动 |

未加 `RequestOptions.endpointMissing`：**简报写"允许"，本件未用**。理由：屏侧从不构造 `RequestOptions`（那是 `data/queries/auth.ts` 的活，属本修禁面），404/405 分流所需的 `status` 与"响应体不是 JSON"这两个事实都已经在 `ApiError` 上（`status` / `body.__raw`），件③ 走 `isMissingEndpoint()` 一颗判定单点即可；加一颗没有消费方的回调就是死代码，还会逼着我去动 `queries/auth.ts` 传参（越界）。故按"允许 0 或 1 颗"取 0。

### 件② 定稿串
`E:\CC\tomorrow-memory\packages\shared\src\constants\copy.ts`

| 行号 | 改动 |
| --- | --- |
| 104-112 | `PLAIN_TERMS`（原 87 行起）末尾新增一颗 `unknownEndpoint`，值逐字 = `'服务端未开通该功能，请稍后再试或到网页端 tmword.xyz 操作。'`；上方注释交底消费点（`rest-fetcher.apiErrorMessage()` + `LoginScreen.failureOf()`）与判定单点（`isMissingEndpoint()`） |

未写成 `` `…${BRAND.domain}…` `` 的理由：`PLAIN_TERMS` 在 87 行求值、`BRAND` 在 146 行才声明，`const` 无提升 ⇒ 引一次就是 TDZ 崩；简报要求"值逐字"，故按普通字面量落，唯一声明点仍是这里（`contracts.spec` 新增用例用 `filesContaining()` 钉了"shared src 内只 copy.ts 一处命中"）。

### 件③ 屏侧
`E:\CC\tomorrow-memory\apps\app\src\screens\LoginScreen.tsx`

| 行号 | 改动 |
| --- | --- |
| 32-34 | 文件头「失败面」段补 E5c 一条（纯注释） |
| 45 | `@tm/shared` import 追加 `PLAIN_TERMS`（既有行扩一项） |
| 57 | `rest-fetcher` import 追加 `isMissingEndpoint`（既有行扩一项） |
| 78-87 | `failureOf()`：`const message = isMissingEndpoint(error) ? PLAIN_TERMS.unknownEndpoint : apiErrorMessage(error);`，`code` 那一行一字未动（仍 `isApiError(error) ? String(error.code) : null`）⇒ **`ScreenFailure.code` 取值集合零新增**，只有 `message` 变；DOM/`className`/`testid` 全未动，`:190-191` 的 `errorCode` / `serverMessage` 传参形状不变 |

### 测试件（新增用例所在）
- `E:\CC\tomorrow-memory\apps\app\test\rest-fetcher.spec.ts`：`:28-37` 新增 `rawText()` 夹具；`:289-387` 新增 describe「E5c 判据：裸文本 / HTML 错误页的可判别形状与人话取串」8 颗用例
- `E:\CC\tomorrow-memory\apps\app\test\login-screen.spec.tsx`：`:78-95` `EndpointResponse` 加可选 `raw?: string`；`:126-138` 新增 `textResponse()` / `endpointResponse()` 夹具（零 headers，从夹具层面就钉死"不看 MIME"）；`:158` `stubFetch` 改走 `endpointResponse(response)`；`:417-433` 新增 B-03 源码哨兵；`:661-700` 新增 F-06 / F-07 / F-08
- `E:\CC\tomorrow-memory\packages\shared\test\contracts.spec.ts`：`:687-695` 新增 `E5c 件②` 用例；`:708-710` 既有"单位与格式"里追加一条逐字断言

既有断言：⛔ 放松、⛔ 删除、⛔ 改判定阈值。改动过的既有行只有两处**加严/等价搬运**：login spec 的 `stubFetch` 出口换成 `endpointResponse()`（JSON 支路行为逐字不变），以及 `EndpointResponse` 加一颗可选字段。

---

## 2. 三条出口命令的原文输出尾部

### 2-1 `pnpm --filter @tm/app test`（正规跑法；vitest 自报 `Start at 00:49:28`，日期 = 本轮实测时钟 2026-09-27）
```
   ✓ S-29 §3.5.5 末段 达到每日目标 = 二选一，无第三种出口 > 达标弹询问卡：标题/正文两颗按钮逐字，卡内只有这两颗可点（无遮罩关闭、无"稍后"）  500ms
   ✓ S-29 §3.5.5 末段 达到每日目标 = 二选一，无第三种出口 > `今天就到这` = 直接落完成页，带走本轮已评数字（不打卡、不断签）  410ms
   ✓ S-27~S-30 §3.5.7 / §6.6 / §5.1 源码级与运行时哨兵 > S-28b 四种状态各渲一次：渲染文本里不出现 undefined / NaN / 死路文案  930ms
 ✓  @tm/app  test/progress-screen.spec.tsx (28 tests) 14097ms
   ✓ B 组 · B 区三张大数字卡（判据①顺序文案 + 落点） > P-05 判据①/§3.7.1：三卡顺序锁死 本周新增/今日待复习/连续天数，文案逐字，grid-cols-3 gap-3  1132ms
   ✓ D 组 · §3.7.4 六态 + 离线横幅 > P-17 §3.7.4 拉取失败：C 区给「学习情况没拿到」+ 自动静默重试 1 次，点「再试一次」恢复  1953ms
   ✓ E 组 · 无障碍 / 禁词 / 判据⑤ / 路由挂载 > P-23 §6.6：全量渲染文本 0 禁词命中、无 undefined/NaN 上屏  513ms
   ✓ E 组 · 无障碍 / 禁词 / 判据⑤ / 路由挂载 > P-25 判据⑤：全交互后 0 写请求、URL 只落四张读表、localStorage（含任何存量 daily_goal 键）一字不动  781ms

 Test Files  18 passed (18)
      Tests  484 passed (484)
   Start at  00:49:28
   Duration  17.44s (transform 4.97s, setup 0ms, collect 24.71s, tests 65.33s, environment 13.88s, prepare 2.88s)
```
基线 18 files / 472 passed ⇒ 现 18 files / **484 passed**（+12 颗新增用例，无减少）。

### 2-2 `pnpm --filter @tm/shared test`（2026-09-27 00:50:21）
```
$ vitest run --root ../.. --project @tm/shared
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/shared  test/contracts.spec.ts (69 tests) 138ms

 Test Files  1 passed (1)
      Tests  69 passed (69)
   Start at  00:50:21
   Duration  1.19s (transform 242ms, setup 0ms, collect 722ms, environment 0ms, prepare 119ms)
```
基线 68 ⇒ 现 **69 passed**（新增 1 颗 `E5c 件②`，另在既有"单位与格式"里加了一条逐字断言）。

### 2-3 `npx tsc -p apps/app/tsconfig.json --noEmit`（2026-09-27 00:51:31 → 00:51:36）
```
2026-09-27 00:51:31
npm warn Unknown project config "link-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "prefer-workspace-packages". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
EXIT=0
2026-09-27 00:51:36
```
exit 0（三条 npm warn 是本仓 `.npmrc` 与 npm 的既有噪音，与本轮改动无关）。

---

## 3. 新增用例名与各自钉的事

### `apps/app/test/rest-fetcher.spec.ts`（8 颗）
| 用例 | 钉的事 |
| --- | --- |
| `E-01 线上缺陷本体（POST /api/register 回 404 + 404 Not Found 裸文本）：形状可判别、人话取定稿那颗` | 用户报的那一颗响应打进来的完整链：`code` 仍 `HTTP_ERROR`、`status`=404、`body` **等于 `{__raw:true,text:'404 Not Found'}`**（不再冒充 `{error:…}`）、`isMissingEndpoint()`=true、`api.message` 与 `apiErrorMessage()` 同一颗 `PLAIN_TERMS.unknownEndpoint` |
| `E-02 反证（必红反证）：上游回的是合法 JSON 的人话 ⇒ 原样显示，⛔ 被定稿串一刀切盖掉` | 400 + `{"error":"请输入手机号"}` ⇒ 取串**必须**是服务端那句（证明不是一刀切盖）；`isMissingEndpoint()`=false |
| `E-03 反证：判定只认"内容是不是合法 JSON"，⛔ 按 content-type 字符串名匹配（同一坨 JSON 挂 text/plain 仍是服务端人话）` | 同一颗 JSON 把 `Content-Type` 换成 `text/plain; charset=UTF-8` ⇒ 仍显示服务端那句（谁改成读头精确匹配，这颗当场红） |
| `E-04 405 同样按"端点不存在"分流（件③ 的另一支）：定稿串，不显示上游那句英文` | 405 + 合法 JSON `{error:'Method Not Allowed'}` ⇒ `isMissingEndpoint`=true、人话取定稿串（件③ 的 405 支在数据层就成立） |
| `E-05 反向哨：上游回了契约码 ⇒ 那颗码的人话优先，定稿串不得盖它（404 + PHONE_ALREADY_REGISTERED）` | 404 带契约码时 `code` 仍是那颗码、`isMissingEndpoint`=false、人话 = `TM_ERRORS.PHONE_ALREADY_REGISTERED.copy`（定稿串不吞 §3.9.5 的逐码落点） |
| `E-06 500 + HTML 错误页：非 2xx 且不是 JSON ⇒ 同一颗定稿串（码仍是既有 BAD_RESPONSE）` | 件② 的字面规则覆盖 5xx HTML：码不新造（`BAD_RESPONSE`）、人话取定稿串 |
| `E-07 件① 的正面：2xx 但响应体不是 JSON ⇒ 交回调用方的也是带标记形状，不冒充 {error:...}` | 成功面同样可判别：`apiGet` 直落 `{__raw:true,text:'OK'}` |
| `E-08 既有回落面未漂：合法 JSON 但不是错误信封（无 error 键）⇒ 仍是 serverBusy，⛔ 定稿串` | 400 + `{message:'unexpected shape'}` ⇒ 仍 `SYNC_COPY.serverBusy`（改前改后同一结果，钉住"回落面没被顺手改判"） |

### `apps/app/test/login-screen.spec.tsx`（4 颗）
| 用例 | 钉的事 |
| --- | --- |
| `B-03 E5c 判定面的源码哨兵：数据层 0 处按 content-type 字符串名判定（唯一事实 = 能不能 JSON.parse），屏内 0 处状态码分支` | `rest-fetcher.ts` 剥注释后必须有 `isJson: true` / `isJson: false` / `__raw: true` 三件标记、0 处 `headers….get('content-type`、0 处 `'text/plain'` 字面量；`LoginScreen.tsx` 必须调 `isMissingEndpoint(` 与取 `PLAIN_TERMS.unknownEndpoint`，且 0 处 `status === 40x`、0 处 `404`/`405` 字面量（件③ 的判定不许漂回屏上） |
| `F-06 注册 404 + 裸文本：message 取 PLAIN_TERMS.unknownEndpoint，屏上 0 命中上游原文，落点仍是既有 serverMessage 槽（0 新增码）` | 用户视角的缺陷本体：`/register` 路由进注册态、勾协议、填三格提交 ⇒ `[data-testid=auth-form-error]` 的文本逐字 = 定稿串；`container.textContent` **0 命中** `404 Not Found`；`auth-notice-card` 仍 null、`field-phone` 的 `role=alert` 仍空（⇒ `code` 是既有值走兜底槽，没有第 7 颗码、没有新落点）；不跳转、会话仍 `signed-out` |
| `F-07 反证（必红反证）：400 + 合法 JSON 的服务端人话 ⇒ 显示服务端那句，定稿串不得一刀切盖掉` | **简报点名的那颗**：body 换成合法 JSON 的 `{"error":"请输入手机号"}` ⇒ 屏幕显示 `请输入手机号`，且整屏 `textContent` 0 命中定稿串 |
| `F-08 注册 405（件③ 的另一支）：定稿串，上游那句英文原文 0 命中` | 405 + `{error:'Method Not Allowed'}` ⇒ 屏上 = 定稿串，`Method Not Allowed` 0 命中 |

### `packages/shared/test/contracts.spec.ts`（1 颗 + 既有用例加一条断言）
| 用例 | 钉的事 |
| --- | --- |
| `E5c 件②：PLAIN_TERMS.unknownEndpoint 一颗定稿串，逐字锁死，且不与任何既有串重复声明` | 值逐字 = TPM 给定串（多一个空格、少一个句号即红）；`continueAfterLogin` / `connectionDown` 两颗既有值未漂；`filesContaining('服务端未开通该功能')` = 只 `packages/shared/src/constants/copy.ts` 一处命中 |
| `单位与格式（§6.1 / §6.7）`（既有用例内追加一行） | 定稿串同时在文案总表那一组逐字断言里钉一遍，双处不互相背书 |

反证自查：F-07 / E-02 / E-03 若把 `apiErrorMessage` 或抛出处改成"非 2xx 一律定稿串"，三颗全红；F-06 / E-01 若把 `parseBody` 改回 `{error: 原文}`，两颗全红（`body` 与屏上文本都对不上）。

---

## 4. 遇到的红与怎么修的

1. **红（本轮唯一一次）**：第一次跑 `pnpm --filter @tm/app test`（00:48:34 起）
   ```
    FAIL   @tm/app  test/rest-fetcher.spec.ts > E5c 判据：裸文本 / HTML 错误页的可判别形状与人话取串 > E-05 反向哨：上游回了契约码 ⇒ 那颗码的人话优先，定稿串不得盖它（404 + WORD_NOT_FOUND）
   AssertionError: expected 'HTTP_ERROR' to be 'WORD_NOT_FOUND' // Object.is equality

    Test Files  1 failed | 17 passed (18)
         Tests  1 failed | 483 passed (484)
   ```
   原因：我拿 `WORD_NOT_FOUND` 当契约码写用例，但 `packages/shared/src/constants/errors.ts` 的 `TM_ERRORS`（§4.6 那 18 码，声明起于 `:100` 那颗 `PHONE_ALREADY_REGISTERED`）里**没有 `WORD_NOT_FOUND` 这个键**（实测 `grep WORD_NOT_FOUND packages/shared/src/constants/errors.ts` 0 命中，它只是本 spec 既有那颗断言 `rest-fetcher.spec.ts:133`（`expect(handleAuthError(401, 'WORD_NOT_FOUND', T0)).toBe(false)`）里的一个"非认证类码"入参名，并不在契约码表上），⇒ `isTmErrorCode()` 判 false，`ApiError.code` 落 `HTTP_ERROR`。**是我这条新用例的期望值选错，不是源码错**。
   修法：把 E-05 换成真实在表的 `PHONE_ALREADY_REGISTERED`（`packages/shared/src/constants/errors.ts:100` 起那条），并把夹具改成 `apiPost('/api/register', …, { handleAuthError: false })`（与本缺陷落点同一条端点）。既有断言未动一条。
   复跑（00:49:28）：`Test Files 18 passed (18) / Tests 484 passed (484)`。
2. 第一次 `pnpm --filter @tm/shared test`（00:49:50）时，新增的 shared 用例尚未落地，那一轮 68 绿只是基线复测；补上 `E5c 件②` 后复跑（00:50:21）= 69 绿，未见红。
3. 探查阶段撞过一次工具级错误（非测试红）：简报把契约文件写成 `apps/app/src/lib/auth-flow-contract.ts`，实测该路径 **不存在**（`Read` 报 File does not exist，全库 grep `ScreenFailureCode` / `auth-flow-contract` 0 命中）。现状是 `ScreenFailure` 接口就地声明在 `LoginScreen.tsx:68-71`、`code: string | null` 无枚举。约束"不得新增第 7 颗"我按"取值集合零新增"落实（`code` 那一行一字未动 + F-06 钉住落点不许多出提示卡/字段红），并在此报告，未自行扩大范围去新建契约文件。

---

## 5. 禁面自查（逐条对表）

- DOM：`LoginScreen.tsx` 的 JSX 与 `className`/`data-testid` 一颗都没改（只动 import、`failureOf`、注释）；无新 `testid`/`id`。
- 断言：⛔ 放松、⛔ 删除任何既有断言；新增用例 0 处 `test.skip` / `test.fail` / `test.only` / `waitForTimeout`（login spec 的 `settle()` 真宏任务夹具沿用既有那份，未新增 `waitForTimeout`）。
- `ScreenFailure.code` 取值份数不变（`code` 行未动）；`auth-flow-contract.ts` 不存在，故其枚举形状未被触碰。
- 首页可交互元素数量：未触碰任何首页文件；`mobile-memory/`、`packages/server`、`data.db*` 全程 0 读写（连打开都没有）；⛔ `--i-know-this-is-prod`。
- git：只读（`git diff --stat`）；⛔ add/commit/stash/checkout/restore/reset。
- Chrome84 红线：新增代码 0 处 `structuredClone(` / `Object.hasOwn` / `.at(` / 运行时 `import()` / `import.meta`（`isRawBody` 用属性读 + `typeof`；`parseBody` 的注释里那句"⛔ 拿 `{error:原文}` 去过契约"在 `/** */` 内，被既有 `stripComments` 剥掉）。
- 网络：全程 mock fetch（`vi.stubGlobal('fetch', …)` / `new Response(…)`），⛔ 向 `https://tmword.xyz` 发过任何请求（读或写都没有）。
- 件②的"非 2xx + 非 JSON ⇒ 定稿串"按简报字面实现，故 **5xx + HTML/裸文本也会取定稿串**（原回落是 `SYNC_COPY.serverBusy`）。这是简报规则的必然后果，不是我自作主张；若 TPM 认为 5xx 应保留 `serverBusy`，改一处 `missingEndpoint` 的定义即可（`rest-fetcher.ts:308`），对应新增断言在 E-06，本轮未擅自收窄。
- `RequestOptions.endpointMissing` 未加（理由见 §1 件① 末段），本修未用满"最多一颗可选字段"的额度。
