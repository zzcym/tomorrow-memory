- 任务：§10.2 批次3 **T-07** —— 凭据域后端（登录 / 注册 / 激活 / 改密 / 强制改密门禁 / 开关 / **`app.ts` 全局装配**），覆盖 **R-01①③④⑤⑥⑦⑧⑨⑩ + R-39 全条 + R-40 全条**
- 角色：后端开发（角色卡 `roles/dev.md`）
- 轮次：**第三轮 · 单点修复 + 交报告**（前两轮按 **A-29** 收口：实现面与用例面均已在盘，本轮只做「把那 4 条红修对 + 写报告」）
- 日期：2026-09-19；本报告所有输出的测量时间戳逐条标注（工作区并行在写，盘面每 ~10 分钟漂移一次）

---

## 0. 结论一句话

**简报点名的 4 条红全部修绿，TS2339 一并消除，且实现面 0 改动**：四条红的根因**全在用例侧**（两处 `7 位` 夹具实际是 8 位、一处 `settle()` 放错位置导致吊销判定撞上"同秒容忍"、一处进程内吊销缓存跨用例串味），逐条判定与 PRD 原文依据见 §4；没有任何一处是"把断言改松 / 删断言 / `it.skip` / 放宽常量"（自查见 §1-2）。

**判据①~⑦：⑥⑦ 与 ②③④⑤ 的 sqlite 面闭合**；**判据① 的 pg 面按 A-18-3 显式 SKIP**（本机无 PG 实例，§6），**判据②③④⑤ 的 pg 面随之未实证** —— R-40⑨ 与 R-39⑤b 都把"双驱动各跑一遍结果一致"写成硬判据，**CI（T-22）必须真跑 pg**，这条是本任务最大的未闭合面。

**本轮唯一新增的硬发现（比那 4 条红重要）**：判据⑦ 起服实测里，**未经 `pnpm db:migrate` 的库（含仓库根 `data.db`、也包括全新建的空文件）上一切凭据口都是 500**（`SqliteError: no such column: password_changed_at`）。`/api/version` 200 字面成立，但凭据域三条口全断。集成用例之所以绿，是因为用例自己显式跑了迁移（§8-1 有完整取证与两个候选处置）。

---

## 1. 本轮改了什么 / 没改什么

### 1-1 本轮实际写入（**只有 1 个文件**，7 处编辑，全部在 T-07 允许的 `test/integration/auth-*.spec.ts` 面内）

`packages/server/test/integration/auth-hardening.spec.ts`（929 → 953 行）

| # | 位置 | 改了什么 | 为什么（对应 §4 的哪条红） |
|---|---|---|---|
| 1 | `:238` | 删掉 `init.init ?? ` 与一段恒真的 `… .replace(/ .*/, '') ? ... : ''` 三元，还原为 `Bearer ${init.token}` | 简报点名的 **TS2339**（`Property 'init' does not exist on type '{ method?; body?; token?; ip?; }'`）。那是个不存在的属性 + 一层包了等于没包的三元；同族夹具（`auth-register.spec.ts:372`、`legacy-apk.spec.ts:216`）都是直写。**没有用 `as any`、没有把 `init` 的类型注解加宽**。 |
| 2 | `:44-49`、`:56` | 补两个 import：`PASSWORD_MIN`（来自 `@tm/shared`）、`__resetAuthDepsForTest`（来自 `../../src/middleware/auth.js`） | 供下面 3/6 两处使用 |
| 3 | `:412-419` | 新增夹具 `const SEVEN_CHAR_PW = 'sevenpw'` + 自证 `assertSevenCharProbe()`（`expect(SEVEN_CHAR_PW.length).toBe(PASSWORD_MIN - 1)`） | 红 #1/#2：原夹具 `'sevenday'` 数一下是 **8 个字符**，用例标题写"7 位"但送进去的是**合法密码** |
| 4 | `:531,535`（D-12b）、`:727,731`（D-16①） | 两处 `'sevenday'` → `SEVEN_CHAR_PW`，各在本用例开头调一次 `assertSevenCharProbe()` | 同上；**断言一字未动**（仍然是"7 位必须 `WEAK_PASSWORD`"、"off 态三条规则逐字不变"），只是把"喂进去的密码"真的变成 7 位 |
| 5 | `:854-857`（D-13b 登出型操作） | 把 `await settle()` 从 logout 请求**之后**移到**之前** | 红 #3：`password_changed_at` 落毫秒、`iat` 落秒，不跨秒边界时 `iat < floor(changedAtMs/1000)` 不成立 → 旧 token 侥幸存活，这条用例变成随机绿 |
| 6 | `:317-328`、`:375-385`（harness 追踪 + `afterEach`） | 单变量 `let current: Harness \| null` → `const opened: Harness[]`；`afterEach` 里加 `__resetAuthDepsForTest()`，并**逐个关闭本用例开过的全部 harness** | 红 #4：进程内吊销缓存跨用例串味（D-14 被判 401）；顺带修掉 `Failed Suites 1 — EBUSY: resource busy or locked, unlink '…\h-d13c-sqlite.db'`（一条用例开两个库时前一个 sqlite 句柄没关，Windows 上 `rmSync` 失败会把整份文件按 Failed Suite 计） |
| 7 | `:5-9`（文件头） | 把"开关引用点 = 1 由 `node tools/boundaries.mjs **--flags**` 把守"改为正确的 `--password` + `enforce-flag-single-read`，并注明 `--flags` 里只有 `flag-defaults-match-prd` | 原注释是**事实错误**，会把 Phase 5 指向一个不存在的断言入口（同 A-24-1 / A-30-4 的"幽灵门禁条目"族，见 §8-2） |

### 1-2 本轮**没有**做（红线自查，逐条对简报）

- **未跑 `TRPC_SHAPE_UPDATE=1`、未改 `test/**/trpc-shape.baseline.json`**（该红归 A-28-1 的批次3 出口轮）。
- **未改任何实现文件**：`src/**` 本轮 0 diff（`auth-hardening.spec.ts` 是唯一改动文件）。盘上 T-07 实现文件 mtime 在 22:08–22:13 之间变动过，那是别人的在途产出（`app.ts` / `routes/auth.ts` / `trpc/init.ts` / `trpc/routers/auth.ts` / `password-policy.ts`），不是本会话写的。
- 无 `it.skip` / `describe.skip` / 删断言 / 放宽断言：文件里 `Tests 24 passed (24)`，条数比上一轮**只增不减**（新增的 1 条就是 7 位夹具的自证探针，塞在既有两条用例内，不额外计条）。
- 未改 `PASSWORD_MIN` 等任何常量；未新增第三方依赖；文案/错误码全部 `import` 自 `@tm/shared`。
- **无任何 git 写操作**；未清理/还原工作区在途改动。
- **未在仓库根 `data.db` / `packages/server/data.db` 上跑写操作或迁移**：判据⑦ 的起服与迁移全部跑在 `%TEMP%` 下的副本，用完已删；收尾复核 mtime 未变（§2-9）。
- `node tools/boundaries.mjs --check-ownership --task T-07 --files packages/server/test/integration/auth-hardening.spec.ts` → `--check-ownership task=T-07 触碰 1 个文件 → 无越界`。

---

## 2. 冒烟（原始输出，一字未改）

> 所有输出已剥掉 ANSI 颜色码，其余原样。测量时间戳在每段前。

### 2-1 `pnpm --filter @tm/server typecheck` —— **绿**（23:25:53）

```
$ tsc -p tsconfig.json --noEmit
EXIT=0
```

**同一命令在 23:16 的那一次是红的**，两条错误都不在本任务文件里（简报点名的我那条 TS2339 已修）：

```
test/integration/chat-isolation.spec.ts(638,12): error TS2532: Object is possibly 'undefined'.
test/integration/chat-isolation.spec.ts(647,12): error TS2532: Object is possibly 'undefined'.
Exit status 2
```

= T-11 的 `test/integration/chat-isolation.spec.ts`（`list[0].at` / `pushed[0].word` 在 `noUncheckedIndexedAccess` 下不通过）。**不在本任务可写面内，未触碰**；23:25 复跑时 T-11 已自行修掉。

### 2-2 `pnpm --filter @tm/server test` —— 1 红，且那 1 红是 **A-28-1 已知红**（23:25:53）

```
 ✓  @tm/server  test/unit/wordbook-merge.spec.ts (44 tests) 31ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 108ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 148ms
 ✓  @tm/server  test/review-no-llm.spec.ts (16 tests) 137ms
 ✓  @tm/server  test/integration/profile-dto.spec.ts (23 tests) 286ms
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 470ms
 ✓  @tm/server  test/integration/wordbook-concurrency.spec.ts (34 tests) 447ms
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 29ms
 ✓  @tm/server  test/contract/legacy-apk.spec.ts (25 tests) 2412ms
 ✓  @tm/server  test/integration/auth-register.spec.ts (21 tests) 2598ms
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests | 1 skipped) 4865ms
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (24 tests) 12092ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针…
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo
 ❯ test/trpc-shape.spec.ts:390:13

 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 286 passed | 1 skipped (288)
   Duration  14.69s
```

- 唯一红 = **A-28-1 的基线红**（`auth.activate`/`auth.register` 是 R-39 新增过程、`review.queue`/`review.undo` 是 T-10 的，都属于"只增不改"，批次3 出口轮一次性再生）。**本任务不背、也不许背**：未跑 `TRPC_SHAPE_UPDATE=1`。
- 那 1 skipped 是 T-11 的 WS 403 用例（`chat-isolation.spec.ts`），与本任务无关。
- **本任务的三个文件全绿**：`auth-hardening (24)` / `auth-register (21)` / `legacy-apk (25)`。

单文件复跑（判据④⑤ 的两条红 + 新夹具自证，改完注释后再跑一次，23:31）：

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-hardening
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

### 2-3 单文件跑的坑（简报已提，这里留字面给 Phase 5）

`pnpm --filter @tm/server test -- auth-hardening` **不透传**：`--` 会被原样传给 vitest，结果是"跑了全量、看起来没筛"。单文件/单名的正确写法是 §2-2 末尾那条 `exec vitest run --root ../.. --project @tm/server <name>`。

### 2-4 `pnpm depcruise` —— **绿**（23:19）

```
✔ no dependency violations found (357 modules, 986 dependencies cruised)
DEPCRUISE_EXIT=0
```

### 2-5 `node tools/boundaries.mjs --flags` —— **绿**（23:19）

```
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等

1/1 条通过，全绿
FLAGS_EXIT=0
```

⚠ `--flags` 集合里**只有这一条断言**。判据④ 括注要求的"引用点=1 断言"不在这里，在 `--password` 里 —— 见 §8-2。

### 2-6 `node tools/boundaries.mjs --password` —— **1 条红（不在本任务可修面，未达成项 §7-2）**（23:19）

```
OK   deadline-key-zero          0 命中
RED  enforce-flag-single-read   引用点 13 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"）：packages/server/src/routes/admin-flags.ts:10 | packages/server/src/scripts/ddl-parity-runner.ts:216 | packages/server/src/services/auth-service.ts:187 | packages/server/src/services/password-policy.ts:11 | packages/server/test/integration/auth-hardening.spec.ts:5 | packages/server/test/integration/auth-hardening.spec.ts:19 …(+7)
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）

2/3 条通过，1 条红
PW_EXIT=1
```

13 个命中点的逐条归因与"为什么在本任务边界内修不绿"见 §8-3。`deadline-key-zero`（R-40⑨ 的 `passwordUpgradeDeadline`/宽限期 grep）与 `password-write-points`（凭据写入点角色）两条 **绿**。

### 2-7 `node tools/boundaries.mjs --copy` —— **绿**（23:20，§8.3-D-20 的后端侧兜底）

```
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 75 处）…
1/1 条通过，全绿
```

### 2-8 `--check-ownership`（见 §1-2 末行）—— 无越界。

### 2-9 判据⑦ `pnpm --filter @tm/server dev` + `curl /api/version` —— **字面达成，但连带一条必须上报的部署面事实**

**第 1 步：不动仓库库，只取副本**（红线要求）

```
$ cp data.db  $TEMP/t07-dev-smoke2.sqlite        # 连 -wal / -shm 一起 cp
$ DB_DRIVER=sqlite SQLITE_PATH='C:\Users\曹怡明\AppData\Local\Temp\t07-dev-smoke2.sqlite' PORT=3199 pnpm --filter @tm/server dev
$ tsx watch src/index.ts
[OTEL] 链路追踪未启用（设置 OTEL_ENABLED=true + Jaeger 地址）
[DB] SQLite initialized (driver=sqlite)
[CH] ClickHouse 不可用（开发降级）: fetch failed
[REDIS] 不可用（降级为内存实现）: Connection is closed.
[EVENTS] 采集器启动（间隔 1000ms，批量 1000）
[AGENT] LLM 未配置（降级启发式/规则模式）
[WS] WebSocket 已启用（/ws）
Server running at http://localhost:3199
```

**第 2 步：判据⑦ 的字面要求通过**

```
$ curl -s -o - -w "\nHTTP_STATUS=%{http_code}\n" http://localhost:3199/api/version
{"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}
HTTP_STATUS=200
```

**第 3 步：同一个未迁移的库上，凭据域三条口全 500**（→ §8-1）

```
--- POST /api/register (8 位新号)
{"error":"服务器内部错误"}
HTTP_STATUS=500
--- POST /api/register (7 位)
{"error":"密码至少 8 位","code":"WEAK_PASSWORD"}
HTTP_STATUS=400
--- POST /api/login (token_len=0)
{"error":"服务器内部错误"}
HTTP_STATUS=500

服务端日志（两次同栈）：
[ERROR] SqliteError: no such column: password_changed_at
    at SqliteUserDB.findCredentialsByPhone (packages/server/src/db/sqlite.ts:197:25)
    at Object.registerOrActivate (packages/server/src/services/auth-service.ts:232:37)
    at <anonymous> (packages/server/src/routes/auth.ts:86:33)
    at Object.login (... auth-service.ts:307:32) / routes/auth.ts:74:33  { code: 'SQLITE_ERROR' }
```

副本与仓库 `data.db` 的实际 schema（只读反查）：

```
users cols: id,phone,created_at,password
password_changed_at? false  pw_policy_version? false
tables: users,wordbooks,profiles,checkin_logs,fsrs_cards,tutor_cache,chat_messages,assessment_cache,analyst_cache,sqlite_sequence
（无 _migrations / account_audit_log / review_snapshots / feature_flags / thread_messages）
```

**第 4 步：显式跑迁移（仍只在副本上）**

```
$ DB_DRIVER=sqlite SQLITE_PATH='…\t07-dev-smoke2.sqlite' pnpm --filter @tm/server migrate
…
> 001-credentials-columns
    · ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0
    · ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0
…
[Apply] 本次应用 7 个迁移：000-migrations-table, 001-credentials-columns, 002-review-snapshots, 003-account-audit-log, 004-wordbook-sync-columns, 005-feature-flags, 006-entry-updated-at-doc
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===
```

**第 5 步：迁移后重启，R-40 全链路在真实 HTTP 上逐条码死**（10 次 curl 打在同一进程；`x-forwarded-for` 未变 ⇒ 已接近 `credential:<ip>` 10 次/分钟的上限，见 §9-4）

```
1  GET  /api/version                       → {"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}                [HTTP 200]
2  POST /api/register  新号 + 9 位密码      → {"token":"eyJ….eyJpZCI6MjQsImlhdIjoxNzgu..","phone":"13900002222","hasPassword":true,…} [HTTP 200]
3  POST /api/register  新号 + 7 位密码      → {"error":"密码至少 8 位","code":"WEAK_PASSWORD"}                                      [HTTP 400]
4  POST /api/login     正确密码             → 200，token_len=139，`iat=1789831428`
5  PUT  /api/password  只发 {password}（旧 APK 形状） → {"error":"请输入当前密码","code":"OLD_PASSWORD_REQUIRED"}                   [HTTP 400]
6  PUT  /api/password  旧密码对 + 新密码 7 位        → {"error":"密码至少 8 位","code":"WEAK_PASSWORD"}                             [HTTP 400]
7  PUT  /api/password  旧密码错                      → {"error":"当前密码不正确","code":"OLD_PASSWORD_INCORRECT"}                    [HTTP 401]
8  PUT  /api/password  全对                          → {"ok":true}                                                                    [HTTP 200]
9  GET  /api/me        带改密**前**那枚 token        → {"error":"密码已修改，请重新登录","code":"CREDENTIAL_EXPIRED"}                [HTTP 401]
10 POST /api/login     新密码 → 200 有 token；旧密码 → {"error":"手机号或密码不正确"} [HTTP 401]
```

这十条就是判据②③④⑤ + §8.3-D 10/11/12/13/17 在**真实 HTTP + 真实进程**上的旁证（不替代集成用例，集成用例覆盖面比这大得多）。

**第 6 步：停服 + 清场复核**

```
$ taskkill //PID <tsx-watch 父进程> //T //F      # 连带 node 子进程一起
$ curl -m 3 http://localhost:3199/api/version    → HTTP=000 / connection refused   （端口已释放）
$ ls -l --time-style=+%m-%d_%H:%M data.db data.db-wal data.db-shm packages/server/data.db
253952 09-18_04:05 data.db
32768  09-17_00:53 data.db-shm
424392 09-18_04:09 data.db-wal
0      09-17_00:10 packages/server/data.db        # 三者与冒烟前完全一致：仓库一个字节都没被写过
$ rm -f $TEMP/t07-dev-smoke2.sqlite*              # 临时副本（含 -wal/-shm）已删
```

---

## 3. 完成判据 ①~⑦ 逐条闭合（状态 / 落点 / 证据）

> 「落点」列的实现行号是**本轮读到的当前盘上行号**；T-07 的 `src/**` 在 22:08–22:13 被别人动过，行号可能随并行提交继续漂移，用例行号以文件名为准。

### 判据①：`auth-register` / `auth-hardening` 两文件在 **sqlite 与 pg 各跑一遍全绿**，覆盖 PRD §8.3-D 的 1-17 项中后端侧全部 —— **部分达成（sqlite 全绿 / pg 显式 SKIP）**

| 面 | 状态 | 证据 |
|---|---|---|
| sqlite | ✅ | §2-2：`auth-hardening.spec.ts (24 tests) ✓`、`auth-register.spec.ts (21 tests) ✓`、`legacy-apk.spec.ts (25 tests) ✓`；本任务范围内 70 例全绿 |
| pg | ❌→CI | 本机无 PostgreSQL 实例、`DATABASE_URL_TEST` 未设置 → 驱动表 `DRIVERS`（spec `:77`）退化为 `['sqlite']`，并有一条专门的环境自证用例把原因**打印**出来（`:394-404`，输出见 §6）。A-18-3 先例：sqlite 绿 + pg 显式 SKIP，**报告标注"CI 必须真跑 pg"** |
| §8.3-D 1-17 覆盖面 | ✅（映射表见 §5） | 1-7、9-17 都有具名用例；D-8（弹窗可交互元素 ≤5）是前端项，后端不适用 |

**用例落点（sqlite 跑过、pg 待 CI）**：驱动开关 `test/integration/auth-hardening.spec.ts:73-77`、库准备 `openSqlite()` `:282-302`（`data.db` 副本 → `db.init()` → **显式 `MigrationRunner(ALL_MIGRATIONS,…).apply({})`** `:293`）、`openPg()` `:305-316`（同形态，含 `createMigrationContext`）。

### 判据②：`registerOrActivate()` 三出口唯一；`PHONE_ALREADY_REGISTERED` 时三表逐字段快照不变 —— **达成（sqlite）**

- 落点：`services/auth-service.ts:223 registerOrActivate()`（🔴 唯一裁决点：**出口 A** 已设密码 → `:234` `PHONE_ALREADY_REGISTERED` 零写入；**出口 B** 空密码 → `:240-245` `db.users.activateIfEmpty(...)`；**出口 C** 新号 → `:262-270` `db.users.createWithPassword(...)`）；REST 门面 `routes/auth.ts:82`、tRPC 门面 `trpc/routers/auth.ts:103,112`（两条过程指向同一函数）。
- 证据：`auth-register.spec.ts:609-673`（D-6 三表 + `password` hash 逐字节全等）、`:1125-1126`（"除这三条出口外没有第四个结果"的字面断言）、`:850`（三出口 × 两协议 6 例同码同文案）、`:933`（A-30-1 的 `data.code` 提升）、`:961`（把 schema 级拒绝的两端口径差异钉成"已知偏差"）。

### 判据③：激活 = 单条 `UPDATE`、三表行数相等、`activated:true` + 正常 token、**不落强制改密页**、`account_audit_log` +1 —— **达成（sqlite）**

- 落点：`auth-service.ts:240-245`（出口 B 的单条 `UPDATE`：`db.users.activateIfEmpty(id, hash, PW_POLICY_VERSION, now())`，`written===false` 即并发输家 → 与出口 A 同一响应、零写入）+ `services/account-audit.ts:66`（表 `account_audit_log`，动作 `account_activated`，字段 `user_id / phone_masked / action / result / ip / ua / created_at`）+ `auth-service.ts:171 issueTokens(after, { activated: true })`。
- 证据：`auth-register.spec.ts:676-775`（继承判据四类计数 + 审计 +1 + `activated:true` + 正常 token + 门禁不命中）、`:777-815`（同号并发恰一个写成功）、`:1089-1123`（三类事件各至少一条、字段齐全、无凭据泄漏）。

### 判据④：`pw_policy_version=0` 登录 → 响应无正常 token、upgrade token 打业务接口 403；`passwordUpgradeEnforce=off` → 发正常 token 且①-⑤ 强度/验旧/吊销**不变**（"引用点=1"断言把守）—— **达成（sqlite）；括号里的门禁条目名有误（§8-2）且该门禁当前红（§7-2）**

| 子项 | 落点 | 用例 |
|---|---|---|
| 判定条件 `password 非空 && pw_policy_version===0` | `services/password-policy.ts:181 requiresPasswordUpgrade()`（`isEmptyPassword` `:168`） | `auth-hardening.spec.ts:594-611`（200 + `upgrade_required:true` + **响应里不存在可用的正常 token**） |
| 唯一签发点 / 唯一读 flag 点 | `auth-service.ts:171 issueTokens()`，`flags.isOn('passwordUpgradeEnforce')` 在 **`:187`（全仓唯一业务读点）** | 同上 + `:789-810`（off 只作用于待升级人群，本期新号完全不受影响） |
| upgrade token `aud:'pw-upgrade'` / ≤30 分钟 | `auth-service.ts:149 signUpgradeToken()` + `middleware/auth.ts:45 UPGRADE_AUDIENCE` | `:594-611`、`:636-672` |
| 403 `PASSWORD_UPGRADE_REQUIRED` + 白名单 | `middleware/password-gate.ts:19-31`（TRPC/REST 两份白名单，与 §4.7 逐条对齐）、`middleware/auth.ts:131 auth()`、`trpc/init.ts:117 upgradeProtectedProcedure` | `:612-634`（业务读写 + tRPC 全 403、白名单内读自己仍放行）、`legacy-apk.spec.ts:645-675`、`auth-hardening.spec.ts:468-482`（upgrade token 打**普通**改密口也 403，不许因为"它也是改密口"就放行） |
| off 态三条安全规则不变 | 强度/验旧/吊销三处**代码内不读该 flag**（§4.7 "开关边界"） | `:720-787`（本轮修的红 #1 就在这条） |
| 门禁条目本身 | `tools/boundaries.mjs` 的 `enforce-flag-single-read` 在 **`--password`** 集合（`boundaries.mjs:1220`），**不在 `--flags`** | 输出见 §2-6；判定见 §8-2/§8-3 |

### 判据⑤：上线零掉线（`password_changed_at=0` 的旧 token 仍可用）—— **达成（sqlite）**

- 落点：`middleware/auth.ts:103 verifyToken()` —— `:118` 判 `changedAtMs > 0 && iat < Math.floor(changedAtMs / 1000)`；`DEFAULT 0` ⇒ 该分支对未改密账号**永不触发**。缓存 `revokedCache` `:72`（60 秒 TTL，`readPasswordChangedAt` `:80-96`）。
- 单位陷阱与容忍窗口写在 `middleware/auth.ts` 头注 + `auth-hardening.spec.ts:25-29`（`password_changed_at` 是**毫秒**、JWT `iat` 是**秒**；同秒内改密的旧 token 判为仍有效，代价 ≤1 秒，被 R-40③ 的"≤60 秒"上限和 60 秒缓存 TTL 双双兜住）。
- 证据：`auth-hardening.spec.ts:892-975`（D-14 三条：5 天前签的存量 token 读写全通 / 同一枚 token 在该账号真改密后立刻 401 / **`password_changed_at=0` 的判定不依赖 `pw_policy_version`**，已升级与待升级两账号同权）+ 本轮修的红 #3/#4。

### 判据⑥：`legacy-apk.spec.ts` 覆盖 9 个红线接口 + `SMS_NOT_CONFIGURED`/`OLD_PASSWORD_REQUIRED` 响应形状 —— **达成**

- 证据：`test/contract/legacy-apk.spec.ts` 25 例全绿（§2-2）。结构：`:314-376` auth 五端点键集合快照（含"未登录的 401 恰好 `{error}` 单键，没被顺手加 `code`"）、`:378-417` 旧 APK 只发 `{password}` → `OLD_PASSWORD_REQUIRED` 两键形状、`:419-451` `send-code` 保留 `{ok:true}` 并附 `code`、`:453-641` lookup / wordbook / review / profile / chat-history / `/trpc/*` 信封 / `/ws` 仍在装配表、`:643-675` R-40④ 的 403 形状、`:677-720` A-30-1 的 `data.code = tm_code`。
- 说明：`§8.3-D-21/22`（旧 APK **界面不崩溃 / 不丢离线队列**）不在本文件能力内 —— 本文件只能钉服务端响应形状，真机侧归 **T-20 / T-24**（§7-4）。

### 判据⑦：`app.ts` 装配后 `pnpm --filter @tm/server dev` 起服 + `curl localhost:PORT/api/version` 200 —— **达成（附一条必须上报的部署面事实）**

- 落点：`app.ts:191/193/195` 分别挂 `createAuthRouter(authService)` / `createVersionRouter(config)` / `createAdminFlagsRouter(flags)`；`app.ts:81 createApp()` 内建 `flags` / `audit` / `authService` 并 `registerAuthDeps(db)`（`:91`）、`c.set('db', db)`；`config.ts:99 sqlitePath` 默认 `<PROJECT_ROOT>/data.db`。
- 证据：§2-9 全部（起服日志、`/api/version` 200、迁移前后对比、10 条真实 HTTP 探测、停服与 mtime 复核）。
- 附：未迁移库上凭据域 500 → §8-1。

---

## 4. 简报点名的 4 条红 + TS2339：逐条判定

判定口径只有一条：**PRD 判据本身**（`.delivery/01-prd.md` R-01/R-39/R-40 与 §8.3-D，以及 `02-tech-design.md` §4.7 的实现口径）。四条全部判为 **用例侧缺陷**，因此实现面 0 改动；每条都给出"凭什么认定用例是错的、实现是对的"的可复核证据。

---

#### 红 #4（先说这条，因为 #1 是它的下游）：`D-11/D-12 验旧与强度三条 > 新密码 7 位 → WEAK_PASSWORD`（`auth-hardening.spec.ts:528`）

- **判据原文**
  - R-40① ：「`PUT /api/password`（`routes/auth.ts:130` 现判 `length < 4`）与 tRPC `auth.changePassword`（`router.ts:277` 现 `z.string().min(4).max(72)`）**两处一并改为 ≥8 位、≤72 字节**，并收敛为与 R-39② **同一个校验函数**（C-09）」。
  - §8.3-D-2：「密码 **7 位 → `WEAK_PASSWORD`**、8 位 → 通过（两端各测一次，**含绕过前端直接打接口**）」。
- **当时的失败输出**：`AssertionError: expected [ 400, 'WEAK_PASSWORD' ] to deeply equal [ 200, undefined ]`，响应体 `{"ok":true}`（= 密码**被改掉了**）。
- **现实现行为（已核对，正确）**：`services/password-policy.ts:131 assertPasswordStrength()` 判 `raw.trim().length < PASSWORD_MIN`（`packages/shared/src/constants/limits.ts:PASSWORD_MIN = 8`）→ `WEAK_PASSWORD`；`auth-service.ts:375 preparePasswordChange()` 的顺序是 取凭据行 → 空密码 `NO_PASSWORD_ACCOUNT` → **强度** → 确认一致 → 验旧 → 新旧相同，即改密口**在写库之前**必经强度校验。`@tm/shared` 的 `exports` 直指 `./src/index.ts`，无"改了源码但 dist 没重建"造成的假值。
- **认定依据（为什么是用例错）**：用例标题写"7 位"，但送进去的字面量是 `'sevenday'` —— `s,e,v,e,n,d,a,y` = **8 个字符**。8 位密码在 `PASSWORD_MIN=8` 下**合法**，实现放行 `{"ok":true}` 完全符合 R-40①；红的是"用一条合法的 8 位密码去测'7 位必拒'"。
- **改动（只收紧、不放宽）**：新增 `SEVEN_CHAR_PW = 'sevenpw'`（7 字符）+ `assertSevenCharProbe()`，用例第一行就断言 `expect(SEVEN_CHAR_PW.length).toBe(PASSWORD_MIN - 1)`。这样若将来有人把 `PASSWORD_MIN` 改回 4 或又手写一个"看着像 7 位"的字面量，探针会先红，**不会再出现"红的是用例、看起来像实现"**。语义一字未动。
- **旁证**：§2-9 第 3/6 条真实 HTTP 探测（`sevend1` = 7 字符）在开/关两态之外都稳定回 `400 WEAK_PASSWORD`。

---

#### 红 #1：`判据④ / D-16 passwordUpgradeEnforce=off > off 态下强度 / 验旧 / 吊销三条规则逐字不变`（`:720`）

- **判据原文**
  - §8.3-D-16：「`passwordUpgradeEnforce=off`（仅应急态）→ 同样账号仍收到 `upgrade_required` 与改密页，但同时签发正常 token…；**而 10-14 的行为不变（证明止血阀没顺手关掉安全面）**，且 `off` 状态跨过 72 小时即为本项失败」。
  - §6.4-5-5 末段（最硬的一句）：「**开关的边界（必须写死，不许互相牵连）**：`passwordUpgradeEnforce` 只管"拦不拦"，**管不到** ≥8 位强度校验、改密必须验旧密码、`password_changed_at` 吊销判定、以及 R-39⑤b 的"仅空密码可写"条件这四条 —— 这四条是 R-39/R-40 的核心，**没有任何运行时开关可以把它们关掉**。若架构师把它们中的任何一条接进这个开关，即违反 Q9/Q9' 定案」。
- **当时的失败输出**：同一个 `expected [400,'WEAK_PASSWORD'] to equal [200,undefined]` —— 断言点正是这条用例里的"① 强度：7 位仍被拒"子探针。
- **现实现行为**：off 只改 `auth-service.ts:187` 的"发不发正常 token"，**不参与** `assertPasswordStrength` / `assertOldPasswordMatches`（`:356`）/ `verifyToken` 的吊销判定（三处代码内都不读该 flag；`--password` 的 `enforce-flag-single-read` 就是钉这条，见 §8-3 的引用点归因）。
- **认定依据**：这条红的**唯一**失败点就是红 #4 的 8 位假夹具；off 态本身的三项语义（仍给 `upgrade_required` + upgrade token、同时给可用正常 token、三条安全规则不变）**全部通过**。即：**用例写错（夹具错），实现无缺陷**。若把这条改判成"实现缺陷"去动 `:187` 以外的代码，就是给 §6.4-5-5 明令禁止的"把安全面接进开关"开门。
- **改动**：仅替换夹具（同红 #4），并让 `assertSevenCharProbe()` 在 off 态里再自证一次。**未加任何例外、未放宽任何断言**：`:727-786` 仍然逐条测「7 位必拒 / 旧密码错必 `OLD_PASSWORD_INCORRECT` 且计入失败锁 / 改密后旧 token 必 401」。

---

#### 红 #2：`判据⑤ / D-13 > 登出型操作（R-40③）同样推进 password_changed_at ⇒ 此前 token 作废，但不碰 password 列`（`:846`）

- **判据原文**：§8.3-D-13「改密成功 → 改密前签发的 token 对任一写接口 401 `CREDENTIAL_EXPIRED`（**≤60 秒**）」；R-40③「`middleware/auth.ts` 现仅 `jwt.verify`（无吊销判定），须增加 `token.iat < password_changed_at → 401 CREDENTIAL_EXPIRED`」；§4.7 ③ 把比较口径与「进程内 60 秒 Map 缓存」定死。
- **当时的失败输出**：期望旧 token 401，实得 `200`。
- **现实现行为（正确）**：`auth-service.ts:482 logout()` → `db.users.touchPasswordChanged(row.id, now())`（**只推进 `password_changed_at`，一字不碰 `password` / `pw_policy_version`**）+ `invalidateRevocationCache(row.id)` + 审计 `account_logout`；`middleware/auth.ts:118` 的换算是 `iat < Math.floor(changedAtMs / 1000)`。
- **认定依据**：`iat` 只有**秒**精度。原用例把 `await settle()` 放在 logout 请求**之后**，于是"取 token 的那一秒"与"写 `password_changed_at` 的那一秒"落在同一秒：`floor(ms/1000)` 与 `iat` 相等 ⇒ 严格小于不成立 ⇒ 旧 token 判为仍有效。这是 `middleware/auth.ts` 头注与 `auth-hardening.spec.ts:25-29` 都写明的**同秒容忍**（代价 ≤1 秒，在 R-40③ 的 60 秒上限内）。用例没有跨过秒边界 → **随机绿/随机红**，属**用例时序缺陷**；把它改成"等 61 秒"或直接放宽断言都是拿容忍窗口凑数，不允许。
- **改动**：只把 `settle()` 提到 logout **之前**（`:854`），logout 之后再 `settle()` 一次；三条断言（`password_changed_at` 推进、`password`/`pw_policy_version` 不变、旧 token 401 `CREDENTIAL_EXPIRED`）**一字未动**。
- **顺带登记**：**登出到底该不该吊销该账号的全部旧 token**，PRD 没强制（R-40③⑤ 只对"改密"下要求；§4.7 只把 `auth.logout` 放进**门禁白名单**）。现实现做得比 PRD 严（退出即作废本号此前所有 token，per-user 不影响别人）。用例已按现实现钉住 → 属**实现选择被测试固化**，列为 §8-4 待裁决点，不影响本条判绿的正确性。

---

#### 红 #3：`判据⑤ / D-14 上线零掉线 > password_changed_at=0 的判定不依赖 pw_policy_version（已升级/待升级两账号同权）`（`:945`）

- **判据原文**：§8.3-D-14「**上线时刻零掉线**：未改过密码的账号旧 token 全部仍可用（`password_changed_at` 默认 0 的实证）」；R-40⑤ 方案 A「`password_changed_at` 默认 0 ⇒ **上线时刻没有任何存量 token 被判失效**，正在使用的设备零掉线」。
- **当时的失败输出**：期望 200，实得 `401 CREDENTIAL_EXPIRED`。
- **现实现行为（正确）**：`verifyToken` 只在 `changedAtMs > 0` 时才可能 401，且判定式里**不含** `pw_policy_version`（门禁走的是签发侧 `requiresPasswordUpgrade`，两件事互不相干）。同文件 `:870` 那条"别的账号改密不影响我"也是通的。
- **认定依据**：本文件每个用例都**新开一个 harness，库都是同一份 `data.db` 副本**，于是自增出来的 `user_id` **在用例之间重复**（大多是 24 号）。而吊销缓存是**进程内 `Map<userId, changedAtMs>`**（`middleware/auth.ts:72`，设计 §4.7 ③ 明确要求免查库）。上一条用例（D-13 系）刚给"24 号"写过毫秒戳，缓存还在 60 秒 TTL 内 → 本条的"24 号"读到的就是**上一个用例的** `password_changed_at`，于是被判 401。**生产一进程一库、同一 `user_id` 就是同一个人，不存在这种串味**。⇒ 跨用例污染，不是实现的吊销判错。
- **佐证（不是猜的）**：`middleware/auth.ts:66` 早就提供了测试钩子 `__resetAuthDepsForTest()`（清空 `registeredDb` + `revokedCache`），实现方就是按"用例之间要复位"来设计的；且 `changePassword`/`forceChangePassword`/`logout` 三条真实路径都显式调了 `invalidateRevocationCache`（`auth-service.ts:400,426,486`），真实链路没有脏缓存问题。
- **改动**：`afterEach`（`:375-385`）里加 `__resetAuthDepsForTest()`（已有 `__resetAuthPolicyStateForTest()` 同处）。**断言一字未动**，也没把 `password_changed_at` 的判定条件放宽。
- **同处顺带修的第二个问题**：`Failed Suites 1 — Error: EBUSY: resource busy or locked, unlink '…\h-d13c-sqlite.db'`。原因：D-13c / D-14c 这类"两个账号 = 两个装配"的用例里，`fresh()` 只把 harness 记进单个 `current` 变量，第一个 sqlite 句柄没关，`afterAll` 的 `rmSync` 在 Windows 上失败 → 整份文件被按 Failed Suite 计（看起来比实际更糟）。改为 `const opened: Harness[]`（`:322-328`）逐个关。

---

#### 附：TS2339（`auth-hardening.spec.ts(234,60) Property 'init' does not exist on type '{ method?; body?; token?; ip?; }'`）

简报的判断正确：**夹具类型注解没写窄，是代码里多打了一个 `init.init`**，且外层还包了一个恒真三元（`.replace(/ .*/, '') ? `Bearer ${init.token}` : ''`），化简后与 `Bearer ${init.token}` 完全等义。已按"改代码、不加 `as any`、不宽化类型"的要求还原为同族写法（`:238`）。

---

## 5. §8.3-D 1-17 ↔ 用例映射（判据① 的覆盖面自证；`D-1x` 编号就是 §8.3-D 的项号）

| §8.3-D 项 | 一句话判据 | 钉住它的用例（文件:行） | 本轮状态 |
|---|---|---|---|
| 1 | 空/错格式手机号 → `INVALID_PHONE` 且不写库 | `auth-register:488` | ✅ |
| 2 | 7 位 → `WEAK_PASSWORD`、8 位 → 通过（含绕过前端直打接口） | `auth-register:499`；改密口侧 `auth-hardening:528`（**本轮修**）、`:727`（**本轮修**） | ✅ |
| 3 | 两次不一致 → `PASSWORD_MISMATCH` | `auth-register:514` | ✅ |
| 4 | 未勾协议 → `AGREEMENT_REQUIRED` 且不写库 | `auth-register:526` | ✅ |
| 5 | 注册成功三表各 +1、`daily_goal=10`、有正常 token | `auth-register:551`（+ `:591` 故障注入禁半状态） | ✅ |
| 6 | 已设密码号二次注册 → `PHONE_ALREADY_REGISTERED` + 五类逐字段不变 | `auth-register:611` | ✅ |
| 7 | 空密码号设密即激活（`activated:true` + 正常 token + 审计 +1 + 不落门禁） | `auth-register:678`（并发 `:779`、登录侧不回退 `:765`） | ✅ |
| 8 | 注册态弹窗可交互元素 ≤5 | **前端项** → T-13 / T-16 / T-19 | n/a（后端不适用） |
| 9 | `passwordRegister=off` 只关新建、不关激活 | `auth-register:819`（K-1 配额 `:1004/1047/1073`） | ✅ |
| 10 | 两处改密入口不带 `oldPassword` → `OLD_PASSWORD_REQUIRED` | `auth-hardening:424/455`（+ `legacy-apk:379` 旧 APK 形状、`:662` tRPC 同码） | ✅ |
| 11 | 旧密码错 → `OLD_PASSWORD_INCORRECT` 且计入 5 次/10 分钟锁 | `auth-hardening:487` | ✅ |
| 12 | 新旧相同 → `PASSWORD_SAME_AS_OLD`（含"在验旧之后、不留写入"） | `auth-hardening:514/542` | ✅ |
| 13 | 改密后旧 token 打写接口 401 `CREDENTIAL_EXPIRED`（≤60 秒） | `auth-hardening:812/846（**本轮修**）/870` | ✅ |
| 14 | 上线零掉线（`password_changed_at=0` 实证） | `auth-hardening:900/923/945（**本轮修**）` | ✅ |
| 15 | 硬门禁：`upgrade_required` + upgrade token + 无正常 token + 403 + 改密后 `pw_policy_version=1` | `auth-hardening:594/612/636/674/682` | ✅ |
| 16 | off 态：仍给 `upgrade_required`/改密页 + 同时给正常 token + **10-14 不变** | `auth-hardening:699/720（**本轮修**）/789` | ✅（"off 不得跨过 72 小时"= 运营态判据，代码不可自证，见 §7-5） |
| 17 | `password` 为空调改密 → `NO_PASSWORD_ACCOUNT` 且 `password` 仍 NULL | `auth-hardening:559/582` | ✅ |

D-18~D-23（线上实测 N/M/K/P/Q、上线后对账、全站禁词 grep、旧 APK 真机两例、R-41 跨用户隔离）→ 不归 T-07 用例面，见 §7-4；其中禁词那一项的后端侧由 `--copy` 与 `--password/deadline-key-zero` 两条门禁把守（§2-6/§2-7 均绿）。

---

## 6. pg 侧：显式 SKIP（A-18-3 口径）——**CI 必须真跑 pg**

本任务三个文件里 pg 驱动用例**一条都没跑**。原因不是"没写"，是**本机没有 PostgreSQL 实例**且 `DATABASE_URL_TEST` 未设置；用例把这件事写成了一条会**打印原因**的自证用例，而不是静默跳过（静默跳过 = A-19 家族的假绿）。真实输出（§2-2 那次跑里的 stderr）：

```
stderr | test/integration/auth-hardening.spec.ts > 判据①-环境：pg 侧可用性自证（缺实例时显式 SKIP 并打印原因） > 未设 DATABASE_URL_TEST 时 pg 侧不跑，但原因必须留在输出里（CI 必须真跑 pg）
[SKIP] auth-hardening 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。 按 A-18-3 先例：sqlite 侧全绿 + pg 侧显式 SKIP；R-40⑨ 要求双驱动一致，CI（T-22）必须真跑 pg。
```

（`auth-register.spec.ts:468-483` 与 T-11 的 `profile-dto.spec.ts` 是同形态的自证，三条 SKIP 都会出现在 CI 日志里。）

- **打开 pg 的唯一开关**：设 `DATABASE_URL_TEST=postgresql://…`。`auth-hardening.spec.ts:70-74` 的 `DRIVERS` 会从 `['sqlite']` 变成 `['sqlite','pg']`，**同一批用例（含 D-10~D-17 全部）在 pg 上逐条重跑**，不需要任何额外命令。
- **必须真跑的判据（跑不动就是没交付）**：R-40⑨「①-⑤ 全部用例纳入 R-24① CI，任一失败**阻断 deploy**」、R-39⑤b 末段「三表行数、hash 长度、`user_id`、审计记录条数逐字段一致」、§8.3-D 组头「全部机器可判定，SQLite 与 PG 双驱动各跑一遍」、§3.1 DoD ①「三条均须在双驱动上各跑一遍结果一致」。
- **另一条独立的 pg 防线**（不替代上面的用例）：`packages/server/src/scripts/ddl-parity-runner.ts`（T-06）—— 它同时是 `--password` 那条红里的引用点之一，见 §8-3。
- 本任务侧的 pg 兼容性静态证据：迁移在 pg 与 sqlite 上产出**同一份** `users` 两列定义（`001-credentials-columns`，两侧都是 `NOT NULL DEFAULT 0`，**迁移文本里不含任何 `UPDATE users SET …` 回填**，`--password/deadline-key-zero` 与 R-40⑤⑦ 的"禁回填"由 §2-6 的绿项 + §7-4 的 preflight 静态扫共同把守）。

---

## 7. 未达成项（如实列出，不粉饰）

1. **判据① 的 pg 面未实证**（§6）。这是 T-07 唯一"字面未闭合"的判据，且它同时是判据②③④⑤ 的双驱动面。本机无 PG 实例、无 Docker；按 A-18-3 先例留 SKIP + 原因，**CI（T-22）必须真跑**。
2. **`node tools/boundaries.mjs --password` 红 1 条**：`enforce-flag-single-read 引用点 13 个 > 1`（§2-6）。**该红在本轮之前就在盘上，与本轮 7 处编辑无关**（本轮新增的 0 处引用；注释编辑后仍是 13 个，逐条归因见 §8-3）。**在本任务可写面内修不绿**：13 个命中里只有 2 个是我的注释，把它们全删了还剩 11 个（含 6 个 `flags.set('passwordUpgradeEnforce', …)` —— 判据④ 明确要求 off/on 两态可切，测试不可能不点名该键）。需要 T-02/主会话裁决扫描口径。
> **【第四轮】已由 A-32-5 裁决**：13 > 1 判为**扫描口径问题**（该断言把注释、测试夹具、脚本探针都算成了"业务读点"），**修的对象是扫描器，归出口轮 T-02**。T-07 不再为它改写任何注释或测试来凑绿。本轮重跑仍是 `引用点 13 个 > 1`（§10-5 第 4 条），其中 `routes/admin-flags.ts` 那一条命中因本轮加了注释而**行号 10 → 11**，总数不变。→ §10-6

3. **`test/trpc-shape.spec.ts` 红**：A-28-1 已知红，批次3 出口轮（任务板 E2）一次性再生基线；本任务**未跑 `TRPC_SHAPE_UPDATE=1`、未改基线**。
> **【第四轮】原样保留，仍未消**：第四轮重跑（§10-5 第 2 条）全盘 309 例里**唯一一条红仍是它**（`test/trpc-shape.spec.ts:390`）。本轮三处改动涉及 `app.ts` 装配与 `logout` 出参语义，基线未再生 ⇒ 该红的归因不变（只增不改签名，等 E2）。

4. **判据④⑤⑦ 的"线上/真机"半边不在本任务**：§8.3-D-18/19（线上库实测 N/M/K/P/Q 与上线后每人五类计数对账）→ T-21 脚本 + T-24 发布窗口；D-21/22（旧 APK 界面不崩溃、不丢离线队列、改密后能力恢复）→ T-20 真机 + T-24；`pw_policy_version` 相关四类账号演练 = 清单步 6b；R-41（D-23）不归本任务。
5. **§8.3-D-16 后半句"`off` 状态跨过 72 小时即为本项失败"**：运行时长度，单元/集成用例无法自证。需要的是发布流程上的计时与签字（§6.4-2 步 12 的人工件），**建议 Phase 5/6 明确落到发布记录模板**，不要指望 CI 绿。
6. **`passwordUpgradeEnforce` 的"≤60 秒生效"（R-40⑦ / §6.4-5-1）**：代码上由 `services/feature-flags.ts` 的 60 秒缓存 TTL 满足（`readRow`/`CacheEntry` `:59`），用例用 `flags.set()` + 显式 `invalidate` 验证；**跨进程真实 ≤60 秒生效**属预发实测项（同 §7-4）。
7. **未迁移库起服 500 未修**（§8-1）：根因在 `db/**`（T-06）与发布清单缺一"上库先迁移"步（PM 侧），不属本任务可写面，也**不在判据①~⑦ 的任何一条字面里**，故只做取证与上报，未动代码。
> **【第四轮】已由 A-32-6 裁决**（(a)+(b) 两条都做，归 **T-06 微轮**，A-32-1 的 `user_snapshots.user_id` 微轮同批并行施工）。T-07 侧仍不动 `db/**`。**本轮判据⑦ 按新口径实跑**：先在 `cp` 出的临时副本库上 `migrate`，再起服打真 HTTP —— 通道全通，见 §10-4。A-32-3 那条挂载顺序缺陷（runbook 步 8 断链）已由 T-07 本轮修掉，所以"迁移 → 起服 → 后台改开关"三步现在是**一条走得通的路**。

---

## 8. 待裁决点 / 移交清单

### 8-1【新发现，优先级最高】`dev` / 生产镜像启动不跑迁移 → 凭据域在"未迁移态"整片 500

- **现象**：§2-9 第 3 步，`/api/register`、`/api/login`、（任何走 `findCredentialsByPhone` 的口）在**未迁移的库**上 `500 {"error":"服务器内部错误"}`，栈顶 `packages/server/src/db/sqlite.ts:197`（`no such column: password_changed_at`）。
- **根因（三处事实叠加）**：
  1. `SqliteAppDB.init()`（`db/sqlite.ts:800`）只 `exec` 旧 `DDL` 数组 + 补两条**上古**列（`users.password`、`profiles.daily_goal`），**不经过 `_migrations` 注册表**；
  2. 当前 `DDL` 里 `users` 仍是四列（`db/sqlite.ts:51-56`），`pw_policy_version` / `password_changed_at` 只由迁移 `001-credentials-columns` 加 ⇒ **全新空文件也需要先 migrate**；
  3. `pnpm --filter @tm/server dev` = `tsx watch src/index.ts`，**不调** `pnpm db:migrate`（`package.json:17` / 根 `db:migrate`）。
- **为什么用例没暴露它**：`openSqlite()` 在 `db.init()` 之后**显式** `new MigrationRunner(ALL_MIGRATIONS, sqliteMigrationContext(raw)).apply({})`（`auth-hardening.spec.ts:290`；`auth-register.spec.ts`、`profile-dto.spec.ts` 同形态）。⇒ 集成用例测的是"迁移后的库"，而 `dev` 起的是"迁移前的库"，两条路径不同。
- **影响**：这是本期唯一破坏性变更的落地路径。若发布窗口里"改代码镜像"先于"上迁移"，或预发/回滚演练忘了 migrate，**症状是登录与注册 500（不是可读 4xx、不是门禁 403）**，直接命中 §6.4-6 的回滚判据；PRD §6.4-2 的 14 步里**没有一步**明写"部署前先跑迁移"（只有步 6b 在临时实例**演练** R-40 迁移）。
- **请裁决的两个方向（本任务不越权实施）**：
  - **(a) 运维口径**：把"先 `pnpm db:migrate` 再起服"写成 §6.4-2 的独立步（或由 `deploy.yml` / `scripts/release/preflight.mjs` 保证），并把 §10.2 判据⑦ 的冒烟命令补成 `pnpm db:migrate && pnpm --filter @tm/server dev`。
  - **(b) 代码口径**：在装配层做一次"凭据两列存在性自检"，缺列时**启动即失败并打印 `pnpm db:migrate`**，或降级为可读 503 —— 落点是 `app.ts`/`config.ts`（T-07）+ `db/sqlite.ts`、`db/pg.ts`（**T-06 禁触面**），因此需要主会话派给 T-06 或授权跨界。
  - 我的建议：**(a) 必做**（它同时是回滚演练的前提），**(b) 选做**，且若做 (b) 则应由 T-06 在 `db` 层做，而不是在 T-07 的 `app.ts` 里读 schema。

### 8-2 判据④ 括注「`--flags` 断言引用点=1」指向一个**不存在的入口**（幽灵条目，A-24-1 / A-30-4 同族）

`tools/boundaries.mjs` 的 MODES 表（`:1219-1228`）里 `--flags = ['flag-defaults-match-prd']` 只有一条；"引用点=1" 的 `enforce-flag-single-read` 注册在 **`--password`**（`:1220`）。§10.2 T-07 行的冒烟命令因此写的是 `--flags`（跑起来永远绿，且绿得没有意义）。已在 `auth-hardening.spec.ts:5-9` 注释里更正指向；**请同步更正 §10.2 的冒烟命令列**（建议 `--password`，或 `--flags --password`）。同类问题：简报本身也照抄了这个括注。
> **【第四轮】已由 A-32-5 裁决（同一条把 §8-3 一起裁了）**：①§10.2 T-07 冒烟命令 `--flags` 更正为 **`--flags --password`**，判据④ 括注同步更正 —— 文档两处由 **A-33（TPM）** 落，不在 T-07 可写面；②扫描口径取我在 §8-3 提的 **(b) 案**（只数 `packages/server/src/**` 的非注释运行读点，豁免 `test/**` 与 `src/scripts/**`），owner = **T-02 / 出口 E1**，并且裁决**追加一条要求**：改完必须带疫苗（临时在某个 `src/**` 运行处加一次 `flags.isOn('passwordUpgradeEnforce')` → 该门禁必红 → 删除），没有疫苗即视为未修。本轮实跑见 §10-5 第 4 条：简报第四轮已按 `--flags --password` 双跑口径下发。

### 8-3 `enforce-flag-single-read` 的 13 个命中点逐条归因（请 T-02 裁"被扫文本 vs 扫描器"）

扫描器（`tools/boundaries.mjs`）按 `STYLE_EXT = /\.(ts|tsx|js|jsx|css|html|xml)$/i` 在 `['apps','packages','scripts']` 三个根下 grep `/passwordUpgradeEnforce/`，只豁免 `shared/src/constants/flags.ts`、`server/src/db/migrations/`、`services/feature-flags.ts`、`config.ts`、`tools/`。13 个命中：

| 命中 | 性质 | 归属 | 是否"业务读点" |
|---|---|---|---|
| `services/auth-service.ts:187` | `flags.isOn('passwordUpgradeEnforce')` | T-07 | ✅ **唯一真读点**（正是设计要求的 1 个） |
| `src/scripts/ddl-parity-runner.ts:216` | `app.flags.get('passwordUpgradeEnforce')` 双驱动 parity 探针 | **T-06** | ❌ 键名取样，语义无关 |
| `routes/admin-flags.ts:10` | 注释「本文件不解释任何开关的业务语义，也不点名 `passwordUpgradeEnforce`」 | T-07 | ❌ 反向声明 |
| `services/password-policy.ts:11` | 注释「没有任何开关可以把它们关掉；`passwordUpgradeEnforce` 只管"拦不拦"」 | T-07 | ❌ 反向声明 |
| `test/integration/auth-hardening.spec.ts` ×9（`:5`、`:19`、`:698` describe 标题、`:701/716/722/785/791/804` 六次 `flags.set(...,'off'\|'on')`） | **判据④ 要求 off/on 两态可切** ⇒ 测试必须点名该键 | T-07 | ❌ 测试夹具 |

结论：**注释改写救不了**（删掉我这两处注释仍剩 11 > 1），`test/**` 与脚本探针才是主体。三个候选，请裁决一个：**(a)** 断言只统计 `src/**` 的**非注释行**（与 A-27「扫描器误报就改被扫文本」的口径需一并说明，因为这里"被扫文本"是语义正确的注释）；**(b)** 扫描面加 `packages/server/test/**` 与 `src/scripts/**` 豁免、并在 `--password` 断言描述里写明"只数运行时读点"；**(c)** 给 `tools/boundaries-exceptions.json` 加条目（两条都要动 `tools/**` / 门禁例外表，均在本任务禁触面外）。**本轮不动 `tools/`**。
> **【第四轮】已由 A-32-5 采纳 (b) 并裁给 T-02**（出口 E1，与 A-28-2 / A-30-4 同轮）。我上一版列的三个候选里 (b) 被选为口径，(a)(c) 作废。第四轮我因此**一个字都没为这条红去改**：不删注释、不动测试、不加例外。重跑数字（§10-5 第 4 条）：仍 **13 个 > 1**，与本轮 9 处编辑的净增引用点 = **0**；唯一变化是 §8-3 表里 `routes/admin-flags.ts:10` 那条**行号变成 :11**（同一处反向声明注释，我给它上面加了 3 行）。等 T-02 落地时请连裁决要求的"疫苗"一起做，否则该门禁会从"红"变成"绿得没有意义"。

### 8-4 「登出型操作推进 `password_changed_at`」是否 PRD 要求？（影响 D-13b 该不该存在）

PRD 只在 R-40③ 对"**改密**"要求 token 失效；§4.7 ④ 只把 `auth.logout` 放进**门禁白名单**（让强制改密页有"退出"出口）。现实现（`auth-service.ts:482`）把登出做成"推进 `password_changed_at`"，即**退出即作废该账号此前签发的全部 token**（其余账号不受影响，`:870` 那条用例钉了 per-user）。这是**比 PRD 更严**的选择，代价是"手机上退出、网页端也被踢"。用例已按现实现固化并修好时序。**请产品/架构确认这个语义**（保留 / 改为只清客户端凭据），因为 §8.2-8 与 §6.4-2 步 3 的人工验收会遇到它。
> **【第四轮】已由 A-32-4 裁决为"不保留"并落地**：`auth.logout` 改为**只清该客户端凭据**（会话语义），服务端**不推进 `password_changed_at`**，`account_audit_log` 照记一条 logout。代码 1 处 + 注释 4 处、用例 D-13b 整组改写（**不是删断言**，改成了逐位等值 + 三条"仍可用"的反向断言）。完整改法、理由与 PRD 依据在 **§10-3**；App 侧凭据要真清干净的口径在 **§10-7**。上面原文里"现实现（`auth-service.ts:482`）"与"用例已按现实现固化"两句**已过期**，保留只为留痕。

### 8-5 `auth-hardening` 用例里的 `D-1x` 编号 ↔ PRD §8.3-D 项号（简报要求给判断）

已按 PRD §8.3-D 原文（`:737-741`，"编号不重排以免打乱交叉引用"）逐项核对：**`D-10`~`D-17` = §8.3-D 的第 10~17 项，一一对应，无偏移**（"凭据加固与强制改密（R-40）"那一组正好从第 10 项起）。文件头 `:11-23` 的映射表与实际 describe 命名一致。两处需要说明的细节：
- 用例内 `D-12` 的 describe 里同时测了「新旧相同」(§8.3-D-12) 与「新密码 7 位」(严格说是 **§8.3-D-2** 的强度项在改密口的延伸，R-40①) —— 标题合并是为了"改密口三条规则"读起来连续；判据① 覆盖面无缺口。
- `D-16` 的"off 跨过 72 小时即失败"与 `D-14` 的"上线时刻"都是**时间轴/发布时刻**语义，用例只能证"判定条件为 0 时不吊销 / off 不改三条规则"，不能证时间长度（→ §7-5）。

### 8-6 盘面漂移（简报数字 vs 本轮实测数字，逐条对账）

| 项 | 简报（2026-09-19 早些时候） | 本轮实测 23:25 | 归因 |
|---|---|---|---|
| `--filter @tm/server test` | 266 passed / 6 failed / 1 skipped（273） | **286 passed / 1 failed / 1 skipped（288）** | 总数 +15 = 别人新落的用例（`profile-dto` 23 例里有 A-30-3 新增、`chat-isolation` 25 例、`wordbook-*` 若干）；红的 6→1 = 本任务的 4 条修绿 + 另 1 条被 T-11 修掉，剩 1 条 = A-28-1 |
| `--filter @tm/server typecheck` | 1 红（本任务那条 TS2339） | **EXIT=0** | 本任务修 1 条；期间 T-11 在 23:06 一度引入 `chat-isolation` 2 条红、23:25 前自行修掉（§2-1 两段输出都留了） |
| 一次 23:15 的跑里曾见 `profile-dto.spec.ts` 2 红 | — | 单独复跑 23/23 绿 | **与我的跑同时刻该文件正在被写**（mtime 23:16）。属并行读-写撞车，不是缺陷；留给 Phase 5 一个提醒：并行期红要单独复跑一次再立项 |
| `pnpm depcruise` | 357 modules / 984 deps | 357 modules / **986** deps | 别人加了 2 条 import |

### 8-7 给 T-16 / T-19（前端门禁 UI）的接口口径（已钉在用例里，别重写）

- 登录响应在门禁态是 `{ token:'', upgrade_required:true, upgradeToken, … }`；**正常 30 天 token 在改密成功前一律不签发**（`auth-hardening:594-611`）。
- upgrade token 的 `aud='pw-upgrade'`、TTL 30 分钟；能打的只有 `middleware/password-gate.ts:19-31` 两份白名单（`auth.forceChangePassword` / `POST /api/password/force` / `auth.logout` / `GET /api/me` / `auth.me` 与 REST 对应项）；**`PUT /api/password`（普通改密口）不在白名单**（`auth-hardening:468-482` 钉死），所以强制改密页必须走 `/api/password/force`。
- 401 `CREDENTIAL_EXPIRED` 与 403 `PASSWORD_UPGRADE_REQUIRED` 的响应体形状都是**恰好 `{error, code}` 两键**，文案来自 `@tm/shared`（`legacy-apk:379/645`）。
- tRPC 侧 §4.6 的码经 `cause` 提升到 `data.code`（A-30-1，`trpc/init.ts:60-80`；`auth-register:933`、`legacy-apk:678` 钉形状）。
> **【第四轮】已由 A-32-9 接受**："这 4 条接口口径**已视为 T-16/T-19 的契约**，重写下端的门禁 UI 时以它为准，不许另发明"。同一条又追加了"盘面数字漂移对账表今后各任务报告照抄"——本轮照做了，见 §10-6。**本节 4 条一字未改**；A-32-4 新加的第 5 条（登出语义 / App `saveToken('')`）写在 **§10-7**，因为它是本轮才产生的口径变化。

---

## 9. 给 Phase 5 测试工程师的复跑指引与已知坑

1. **单文件/单用例复跑**：`pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server auth-hardening`（`pnpm … test -- 名字` 不透传，别用）。整目录：`pnpm --filter @tm/server test`。
2. **pg**：设 `DATABASE_URL_TEST=postgresql://…` 即自动把整批用例在 pg 上再跑一遍（`auth-hardening.spec.ts:70-74`）。没有它就只能拿到 sqlite 半张脸（§6）。
3. **先迁移再起服**（§8-1）：任何"真实起服"验收，起服前先 `DB_DRIVER=sqlite SQLITE_PATH=<副本> pnpm --filter @tm/server migrate`，否则 `/api/login`、`/api/register` 会 500 且**那不是 T-07 的缺陷**。副本用法见 §2-9 第 1 步。
   > **【第四轮】已按这条口径完整实跑**（A-32-6 也把它写成了正式部署前置步）：migrate → 真起服 3055 → 真 HTTP 打 `/api/version`、`/api/admin/login`、`/api/admin/flags` 全通，全过程与逐条输出在 **§10-4**。
4. **凭据口 IP 限流**：同 IP 每分钟 10 次（`shared` 的 `IP_RATE_LIMIT_PER_MINUTE=10`，`auth-policy.ts:63/75` 两个桶 `login:<ip>` / `credential:<ip>`）。§2-9 那 10 条 curl 已经贴着上限，复跑请分两批或带不同 `x-forwarded-for`，否则会看到 `TOO_MANY_REQUESTS`/429 被误读成缺陷。另有"同 IP 每日新建 ≤5 / 激活 ≤20"两个日桶。
5. **改密后旧 token 立刻 401 的人工验收**：`iat` 秒级 + `password_changed_at` 毫秒级 ⇒ 同一秒内有 ≤1 秒容忍（设计口径），且吊销缓存 TTL 60 秒 ⇒ 手工测试请"改密前 ≥1 秒拿到 token"，或直接读 `users.password_changed_at` 复核；不要把这个窗口报成"吊销不生效"。
6. **`trpc-shape` 的红不属 Phase 5 缺陷池**：`auth.activate`/`auth.register`/`review.queue`/`review.undo` 的"只增"待批次3 出口轮再生基线（A-28-1 / 任务板 E2）。
7. **`--password` 的 `enforce-flag-single-read` 红**是门禁口径问题（§8-3），不要按"实现越权接线"记缺陷 —— 真读点确实只有 `auth-service.ts:187` 一个，可用 `grep -n "flags.isOn('passwordUpgradeEnforce'" packages/server/src` 复核。
8. 用例文件对仓库 `data.db` 是**只读**（`fs.copyFileSync` 到临时目录再打开）；判据⑦ 类实测请沿用同一写法，别在 `data.db` / `packages/server/data.db` 上直接跑迁移。

---

## 附：本轮 diff 与文件清单

| 文件 | 状态 | 说明 |
|---|---|---|
| `packages/server/test/integration/auth-hardening.spec.ts` | ✏️ 7 处编辑（唯一改动文件） | §1-1 |
| `packages/server/src/**` | **0 改动** | 简报点名"实现面已全部落盘"；四条红全部判为用例侧，实现无缺陷（§4） |
| `.delivery/04-dev-report-T-07.md` | 🆕 本文件 | 判据①~⑦ 闭合 + 4 条红判定 + 冒烟取证 + 未达成/待裁决 |
| `test/trpc-shape.baseline.json`、`tools/**`、`db/**`、`packages/shared/**`、`apps/**` | **未触碰** | 简报禁触 + 无 git 写操作 |

---
---

## 10. 第四轮：三处出口必修（A-32-2 / A-32-3 / A-32-4）

> 本轮范围 = 裁决表 `04-adjudications.md:221-235` 的**第 2、3、4 行**（简报原话："这三行就是任务书"）。三处都已落地，前两处各带一次"把它改回去必红"的**疫苗实跑**（§10-1 末、§10-2 末）。第 1、6 行（`db/**` 启动自检 + 事务内 RMW）归 T-06 微轮，本轮正在并行施工，我没碰；第 5 行那条红按 A-32-5 **不归我修**，一个字都没为它改（§10-6 末两行有对账）。
>
> 一句话结论：**判据⑦ 那类"装配后真起服"的口子现在是通的** —— 副本库 migrate → 真起服 3055 → `.env` 口令 `POST /api/admin/login` 200 → 拿 token 读写 `/api/admin/flags` 200 → 改值立刻读回，全部实测通过（§10-4）。

### 10-0 先读后写（定位方式 → 取到的事实；未整读任何源文件）

| 读物 | 定位 | 用到的关键事实 |
|---|---|---|
| 角色卡 `references/roles/dev.md` | 全文（简报要求先读） | 出口判据是"能跑通 + 带证据"；禁放宽规则 / 删断言 / 加例外 / 改归属表；并行期他人文件挡路只记录不动手 |
| `04-adjudications.md:221-241` | grep `A-32` → 线读 221-241 | 第 2 行 owner = "T-07 第四轮"且**修法给到具体签名**；第 3 行要求"真起服 + 真 HTTP"取证 + "不许用干脆放开糊过去"；第 4 行要求"改写理由与 PRD 依据写在报告里，不许只把断言删掉"；第 5 行的"必须带疫苗"是**给 T-02 的**要求；第 9 行接受 8-5/8-6/8-7 并把对账表定为通用口径 |
| `02-tech-design.md:852` | 线读 848-856 | T-07 行的**允许面**含 `app.ts`、`routes/admin.ts`、🆕`routes/admin-flags.ts`、三个 test 文件；**不得触碰**含 `routes/{wordbook,…}.ts`、`db/**`、`packages/shared/**` ⇒ 本轮 9 个改动文件全在允许面内（机器自检输出 §10-5 第 7 条）。判据⑦ 原文正是"`app.ts` 装配后起服 + `curl localhost:PORT/api/version` 200"，简报的"新口径"是在它前面加一步"只在临时副本库上 migrate" |
| 本报告 §7 / §8 / §9 | 线读第三轮原文（`§7 :415-423`、`§8 :427-485`、`§9 :489-498`） | §8-4 即 A-32-4 所裁；§8-2+§8-3 即 A-32-5 所裁；§8-1 即 A-32-6；§8-7 即 A-32-9 接受为契约；§9-3 那条"先迁移再起服"本轮首次实跑。（本文件已加了 6 处【第四轮】标注 ⇒ 现行号：§7 `:415-430`、§8 `:432-496`、§9 `:498-521`、§10 从 `:524` 起） |
| `routes/wordbook.ts:30-42`、`services/wordbook-service.ts:54`/`:127` | grep → 线读 | 撑住 §10-1 的后果链。**这两个文件一字未改**（T-09 名下 + `:852` 禁触） |
| `middleware/auth.ts:116-119`/`:134`/`:167`、`routes/admin.ts:39`/`:49`/`:55`/`:67` | grep → 线读 | 401「未登录」的出处、`iat` 秒级换算所在行、admin 各端点**各自**挂着 `adminAuth` 的事实（§10-2"没放宽"的举证） |

### 10-1 A-32-2 —— `app.ts` 给词本 REST 门面注入唯一一份 `flags`/`cache`

**改了什么**（`app.ts:201`，1 行代码 + 4 行注释；只这一个调用点）：

```ts
- app.route('/', createWordbookRouter(db));
+ app.route('/', createWordbookRouter(db, { flags, cache }));
```

`routes/wordbook.ts` 与 `wordbook-service.ts`（T-09 名下、`02-tech-design.md:852` 明列禁触）**一字未动**。

**为什么**（后果链，每步指到行）：

1. 签名 `createWordbookRouter(db: AppDB, deps: WordbookRouterDeps = {})`（`routes/wordbook.ts:40`），`WordbookRouterDeps = { flags?, cache?, now? }`（`:30-38`）⇒ **deps 可整个省略**，所以漏注入既不报 typecheck 也不报运行错，只静默退化。这正是它能活到第三轮的原因。
2. 省略时落到 `wordbook-service.ts:54` 那条注释描述的机制：按同一 `AppDB` 惰性建一份 feature-flags，`flagsByDb`（`:127`，`WeakMap<AppDB, FeatureFlags>`）记忆 ⇒ 进程内**两份 FeatureFlags 实例**。
3. 两份实例各有 30 秒读缓存（`feature-flags.ts` 的 `FLAG_TTL_SECONDS`），而 `flags.set()` 只回填**它自己那一份**的缓存。管理后台改值用的正是装配层那一份（`app.ts:196` 把 `flags` 交给 `createAdminFlagsRouter`）⇒ 词本 REST 门面要**再等一个 TTL** 才看得见后台那一行，最坏 30 秒；对外承诺的生效上限是 `FLAG_EFFECTIVE_MAX_SECONDS=60`，等于把一半预算白烧在"注入漏了"上。
4. 更实质的一条：**同一次放量里两个门面看到不同模式** —— tRPC 门面走 `ctx.flags`（装配层那一份），REST 门面走自建那一份。同一用户同一秒，`trpc.wordbook.sync` 可能已在 CAS 增量分支、`PUT /api/wordbook` 还在整数组降级分支。这就是裁决说的"同一份开关两把真相"的种子，与 PRD §6.4-5-5「开关一处读」直接冲突。
5. `cache` 不注入同理：词本侧的失效只会打到自建那份，装配层的 `cache` 收不到。

**证据**：

- 新用例 `test/contract/legacy-apk.spec.ts:900`（describe）/ `:914`（it）：`A-32-2 真起服 · 后台改 wordbookIncremental 后，词本 REST 门面无需再等一个 TTL`。它**从真 HTTP 后台端点改值**（`POST /api/admin/flags`），**零等待**，用同一请求形状打 `POST /api/wordbook/push`：`0%` 态先拿 200（顺带暖 REST 门面自己那份缓存，使"再等 TTL"这条退路失效），改 `100%` 后同一请求立刻 `409 WORDBOOK_STALE`。两门面若各持一份 flags，这一步必然仍 200。
- 对 T-09 中性核实：`wordbook-concurrency.spec.ts:620-640` 自建 `createFeatureFlags(db)` 是**模拟放量**、`:114` 用独立 Hono 实例，不经 `app.ts` 装配 ⇒ 注入不改变其语义。该文件本轮实跑全绿（含在 §10-5 第 2 条的 12 个绿文件里）。
- `wordbook-service.invalidateCache` 内部把 `deps.cache?.invalidate(…)` 包在 try/catch 里 ⇒ 老 harness 传 `cache: {} as never` 也不会因这次注入炸开（实跑印证）。

**疫苗（把注入撤掉，00:09:38 实跑）**：

```
$ sed -i 's/createWordbookRouter(db, { flags, cache })/createWordbookRouter(db)/' packages/server/src/app.ts
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server legacy-apk -t "A-32-2"
   × A-32-2 真起服 · 后台改 `wordbookIncremental` 后，词本 REST 门面无需再等一个 TTL > 0% → 200（并暖缓存）⇒ 后台改 100% ⇒ 同一请求形状立刻 409 `WORDBOOK_STALE` 206ms
     → 词本 REST 门面没看到后台那一行（仍在等自己那份 TTL）：{"ok":true,"version":0,"merged":0,"added":0,"removed":0}: expected 200 to be 409 // Object.is equality
AssertionError: 词本 REST 门面没看到后台那一行（仍在等自己那份 TTL）：{…}: expected 200 to be 409 // Object.is equality
- Expected
+ Received
- 409
+ 200
 ❯ test/contract/legacy-apk.spec.ts:951:82
 Test Files  1 failed (1)
      Tests  1 failed | 27 skipped (28)
```

撤掉后 `app.ts` 由本轮先前拍的备份原样还原，还原后 `grep -n "createWordbookRouter(db" packages/server/src/app.ts` → `201:  app.route('/', createWordbookRouter(db, { flags, cache }));`，`legacy-apk` 28 例回全绿（00:10:07）。备份文件已删。

### 10-2 A-32-3 —— admin 守卫收窄到它自己的两条路径 + 真起服真 HTTP 取证

**改了什么**（3 个文件，**逻辑改动只有 2 行**）：

| 文件:行 | 改动 |
|---|---|
| `routes/admin-flags.ts:58-59` | `use('/api/admin/*', adminAuth)` → **两条精确路径**：`guarded.use('/api/admin/flags', adminAuth)` + `guarded.use('/api/admin/flags/*', adminAuth)`（上面 `:49-57` 是一整块"为什么不能写通配"的注释，文件头作用域说明同步） |
| `app.ts:194-195` | 只加注释（装配处标明守卫作用域），**挂载顺序未动** |
| `routes/admin.ts:8-12` | 只加一段「⚠ 挂载顺序红线（A-32-3）」注释并指向取证用例，**0 行逻辑** |

**为什么是这个修法**（机制，逐条可复核）：

- `app.route('/', sub)` 不改写路径，多个子路由共用同一棵匹配链，**先挂的先命中**。`createAdminFlagsRouter`（`app.ts:196`）比 `createAdminRouter`（`app.ts:205`）早 9 行 ⇒ 前者内部的通配 `use('/api/admin/*')` 会在 `/api/admin/login` 上先命中 `adminAuth`，`middleware/auth.ts:167` 直接 `c.json({ error: '未登录' }, 401)` 收束整条链，`routes/admin.ts:39` 的 handler 永不执行。症状即简报引用的 T-09 §5-D-2：真用 `.env` 的 `ADMIN_PASSWORD` 打过去拿到 `401 未登录`，而不是 `routes/admin.ts:49` 的"密码错误"。
- 为什么既有 288 例看不见它：老用例打的是 `app.fetch(new Request(...))`（进程内，且**没有一条**先 login 再拿 token 打 flags；`adminAuth` 与 login 各自被单测过）。跨子路由的**顺序**缺陷只在真装配 + 真请求序列下暴露 ⇒ 必须真起服，这正是裁决追加取证要求的原因。
- 两个候选修法里选了"收窄守卫"：另一种（把 login 先于守卫挂载）要动 `admin.ts` 导出形状或装配表，而**通配守卫仍留在前缀上** —— 今后任何新 `/api/admin/*` 端点都会被无声接管，下一个"公开取 token 口"（例如未来的 SSO 回调）会踩同一个坑。收窄等于把作用域写对，而不是把顺序再赌一次。

**鉴权没有放宽**（裁决点名的红线，逐条举证）：

- `adminAuth` 仍覆盖**每一条 admin 能力**：flags 两条由本文件 `:58/:59` 守；`/api/admin/stats`（`admin.ts:55`）、`/api/admin/users`（`:67`）由 `admin.ts` 自己逐个挂。`adminAuth` 要求 `payload.admin === true`，普通用户那枚 30 天 token 一样 401。
- 未新增任何公开端点：`/api/admin/login` 第三轮之前就在，本轮只是让它**可达**。
- 用例把这层钉成断言（不是靠注释）：未登录打 4 条 admin 路径 = 4 条 `[401, ['error']]`；普通用户 token 打 flags 两条 = 401。

**新增取证用例（真起服 + 真 HTTP，`test/contract/legacy-apk.spec.ts`）**：

- 夹具 `:732-792`：`serve({ fetch: h.runtime.app.fetch, hostname: '127.0.0.1', port: 0 })` → `server.address().port` 拼 base，`openServers` 集合 + 幂等 `shutdown()`（含 `closeAllConnections?.()`）+ `afterAll` 兜底关服；`liveReq()` 用真 `fetch`（Node v22 全局）并解析 JSON，默认带**互不相同**的 `x-forwarded-for`（admin login 桶是 5 次/分钟）。库仍是本文件既有的 `fresh()`：`cp` 仓库 `data.db` 到临时目录再迁移打开 ⇒ **对仓库根两个库只读**。
- `:796` describe / `:797` it「POST /api/admin/login（正确口令）→ 200 `{token}` ⇒ 该 token 打 GET/POST /api/admin/flags 都成功」：login 200 且键 `['token']` → GET flags 200 且键 `['effectiveWithinSeconds','flags']`、`effectiveWithinSeconds === FLAG_EFFECTIVE_MAX_SECONDS`、8 个 `FEATURE_FLAG_DEFAULTS` 键逐个必现 → POST 改 `studyModes='off'` 200 回显 → 再 GET 读回 `'off'`。口令用 `process.env.ADMIN_PASSWORD` 覆盖（`routes/admin.ts:45` 每请求现读 `loadConfig()`，所以环境变量有效），try/finally 还原，**全程不打印口令**。
- `:837` it「鉴权语义没被放宽」：未登录 4 条（`GET/POST /api/admin/flags`、`GET /api/admin/stats`、`GET /api/admin/users`）全 `[401, ['error']]`；真注册一个普通用户、拿它的正常 token 打 flags 两条仍 401；**错误口令** → 401 且 `error` **`not.toBe('未登录')`** 且 **`toBe('密码错误')`** —— 这一对字面串之差就是挂载顺序本身，应答方必须是 `admin.ts`（守卫若写回通配，这条先红在"拿到了未登录"）。注：两个串都是旧后台遗留字面、不在 §4.6 码表内，此处判的是"谁应答"，文案对齐仍归 A-30-7/T-11 那批，**我没有为此新增任何字面文案到生产代码**。
- 放置理由：`legacy-apk.spec.ts` 是简报允许面内的"装配/契约"层文件，而这两条断言的对象就是**装配表**。

**疫苗（守卫写回通配，00:09:51 实跑，两条同时红）**：

```
$ sed -i "s#  guarded.use('/api/admin/flags', adminAuth);#  guarded.use('/api/admin/*', adminAuth);#" packages/server/src/routes/admin-flags.ts
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server legacy-apk -t "A-32-3"
AssertionError: {"error":"未登录"}: expected [ 401, [ 'error' ] ] to deeply equal [ 200, [ 'token' ] ]
- Expected
+ Received
  [
-   200,
+   401,
    [
-     "token",
+     "error",
    ],
  ]
 ❯ test/contract/legacy-apk.spec.ts:807:61
AssertionError: 应答方不是 admin.ts（说明守卫又吃掉了 login）：{"error":"未登录"}: expected '未登录' not to be '未登录' // Object.is equality
 ❯ test/contract/legacy-apk.spec.ts:888:83
 Test Files  1 failed (1)
      Tests  2 failed | 26 skipped (28)
```

第一条红的形状（`401 未登录` 顶掉 `200 {token}`）就是简报里那个"发布 runbook 步 8 阻断"的复现原文。还原后 `grep -n "guarded.use"` → `:58 '/api/admin/flags'` / `:59 '/api/admin/flags/*'`，28 例回全绿。

### 10-3 A-32-4 —— 登出不再作废全量 token；D-13b 整组改写（附改写理由与 PRD 依据）

**改了什么**（1 处逻辑 + 6 处注释 + 1 组用例）：

| 文件:行 | 改动 | 性质 |
|---|---|---|
| `services/auth-service.ts:489-504` | `logout()` 删去 `await db.users.touchPasswordChanged(row.id, now())` 与两处 `invalidateRevocationCache(...)`；保留 `safeAudit({ action: AUDIT_ACTIONS.accountLogout, ok: true, … })`；恒返回 `{ ok: true }` | **唯一逻辑改动** |
| `services/auth-service.ts:126` | 接口注释：只清该客户端凭据（会话语义），**不推进 `password_changed_at`** | 注释 |
| `services/auth-service.ts:476-488` | 函数上方新增理由块（PRD 依据搬进代码，防"顺手改回去"） | 注释 |
| `routes/auth.ts:13` / `:141` | 端点表与行内注释：登出是会话语义、服务端不作废全量 token | 注释 |
| `trpc/routers/auth.ts:154` 上方 docstring | 会话语义 / 其它端 token 仍可用 / R-39⑧ App 侧清凭据 / R-40③ 才是全量失效 / 出参仍 `{ok:true}` | 注释 |
| `services/account-audit.ts:39` | `accountLogout` 注释：只记审计行，不推进 `password_changed_at` | 注释 |
| `test/integration/auth-hardening.spec.ts:18` | 文件头 §8.3-D 映射行加「⚠ 登出不在这一条里 → 单列 D-13b 组」 | 注释 |
| `test/integration/auth-hardening.spec.ts:867-…` | **D-13b 整组改写**（下见） | 用例 |

`invalidateRevocationCache` 的 import 保留（`changePassword`/`forceChangePassword` 仍在用，`:400`/`:426`）；**吊销机制本身一字未动**。`touchPasswordChanged` 也没有变成死代码（`src/scripts/ddl-parity-runner.ts`、`test/db/methods.spec.ts` 仍调它，改密路径仍调它）。

**为什么（PRD 依据 —— A-32 第 4 行点名要写在报告里的东西）**：

1. **R-40③ 的失效要求只挂在"改密"上**：原文是"修改密码后……此前签发的 token 全部失效、≤60 秒内不可再用于任何写接口"。R-40 通篇是**安全语义**（吊销的前提是"凭据已变更"）。
2. **登出是会话语义**：R-39⑧ 把登出的动作面写在**客户端**（`AndroidBridge.saveToken('')`）；§4.7 ④ 把 `auth.logout` / `POST /api/logout` 放进强制改密门禁白名单，理由只是"不可关闭的改密页要有一条退出出口"。**两处都没有**要求登出作废该账号其它设备/其它端的 token。
3. 原实现是**比 PRD 更严**的选择，代价正是裁决引用的症状：**"手机上退出、网页端也被踢"**，用户会误判成账号被盗；而且它和判据⑤ / R-40⑤"上线零掉线"**共用 `password_changed_at` 这一根字段** —— 一列同时表达"凭据变更"与"某一次退出"，语义被污染，后面任何读这列的逻辑（含 T-21 的上线前对账口径）都要多问一句"这次推进是哪一类"。第三轮 §8-4 提的就是这个二选一，A-32-4 裁"不保留"。
4. 改后的边界很清楚：**要全网失效就走改密**（R-40③），退出只影响这台设备。审计不丢：`account_audit_log` 仍 +1 条 `account_logout`（§4.5 五类计数里的 logout 保持可回溯），只是不再产生吊销副作用。

**D-13b 改写：原判据 → 新判据**（裁决要求"不许只把断言删掉或改成 `it.skip`"；本轮**没删过任何一条断言**，也**没有一处 `skip`**）

- **原判据**（1 条 it）：登出型操作同样推进 `password_changed_at` ⇒ 此前 token 作废（REST 与 tRPC 各打一发 401 `CREDENTIAL_EXPIRED`），但不碰 `password` 列。
- **新判据**（3 条 it，`:889` / `:932` / `:948`，`describe` 在 `:888`）：
  1. `:889`「REST 登出后同一枚 token 读写照旧、凭据三列一字不动，`account_audit_log` 恰 +1 条 `account_logout`」：`/api/logout` → 200 且键 `['ok']`（§6.2 形状不动）→ `password_changed_at` **逐位 `=== before`**（原来是"必须 `> before`"，等值断言**更强**，且起点钉 `=== 0`）→ `password`、`pw_policy_version` 逐位不变 → 同一枚 token 打 `GET /api/me` 200、`PUT /api/wordbook`（**写**口）200、tRPC `auth.me` 200（三条反向断言，正是要杀死的症状）→ `db.audit.listByUser` 里 `account_logout` **恰好 1 条**且 `result === 'ok'`。
  2. `:932`「tRPC `auth.logout` 与 REST 同一语义（两门面都不吊销、都留痕）」+ 钉住 `wire.data` 逐字 `{ok:true}`（旧 APK 兼容面）。
  3. `:948`「强制改密页的"退出"出口仍在」：upgrade token 打登出 200（§4.7 ④ 白名单未被语义改动波及）、凭据三列不动、`pw_policy_version` 仍 0、`/api/me` 仍 `upgradeRequired:true`。
- **判别力守恒**：`await settle()`（跨 `iat` 秒边界）保留、注释重写过 —— 原来它保证"推进看得见"，现在保证"**若实现再偷偷推进 changed_at，三条'仍可用'必红；不跨秒就是随机绿**"。D-13 组其余用例（改密 / 强改 / 改手机号 / 禁用 / 封禁 → `CREDENTIAL_EXPIRED`）与 per-user 隔离例**一字未动**，吊销机制本身仍被完整钉住，logout 只是从它的使用者名单里移出。
- 数量：`auth-hardening` 24 → **26 例**（+2 = D-13b 由 1 条变 3 条），两文件 54/54 绿（§10-5 第 3 条）。

### 10-4 判据⑦ 重跑（新口径：只在临时副本库上 migrate + 真起服 + 真 HTTP + 停服删库）

隔离做法抄 T-09 报告 §4（`:134-221`）：仓库外临时目录 + `SQLITE_PATH`，用完删。**全程未对 `data.db` / `packages/server/data.db` 做任何写或迁移**（前后 mtime 与字节数核对见本节末）。

```
$ mkdir -p /tmp/t07r4 && DB_DRIVER=sqlite SQLITE_PATH=/tmp/t07r4/smoke.db pnpm --filter @tm/server migrate
[Apply] 本次应用 7 个迁移：000-migrations-table, 001-credentials-columns, 002-review-snapshots,
        003-account-audit-log, 004-wordbook-sync-columns, 005-feature-flags, 006-entry-updated-at-doc
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===
```

（这条命令**没有传** `ADMIN_PASSWORD`，起服那条也没有 —— 口令走 `.env`，测的才是 runbook 步 8 的原样路径。）

```
$ DB_DRIVER=sqlite SQLITE_PATH=/tmp/t07r4/smoke.db PORT=3055 pnpm --filter @tm/server start
[OTEL] 链路追踪未启用（设置 OTEL_ENABLED=true + Jaeger 地址）
[DB] SQLite initialized (driver=sqlite)
[CH] ClickHouse 不可用（开发降级）: fetch failed
[REDIS] 不可用（降级为内存实现）: Connection is closed.
[EVENTS] 采集器启动（间隔 1000ms，批量 1000）
[AGENT] LLM 未配置（降级启发式/规则模式）
[WS] WebSocket 已启用（/ws）
Server running at http://localhost:3055
```

真 HTTP 逐条（`curl`；口令从 `.env` 读进 shell 变量，**没有任何一步把它写到 stdout**，只打了长度 8）：

| 步 | 请求 | 实测输出 |
|---|---|---|
| 1 | `GET /api/version` | `HTTP 200` · `{"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}` —— **判据⑦ 字面达成** |
| 2 | `POST /api/admin/login`（body = `.env` 的口令） | `HTTP 200` · `keys: [ 'token' ]` · `token prefix: eyJhbGciOiJI…(len 145)` —— **A-32-3 修的就是这条断链** |
| 3 | `GET /api/admin/flags`（Bearer admin token） | `HTTP 200` · 8 键全在：`autoFavoriteDefault=off(db) avatarUnifiedLimit=on(db) dailyReminder=on(20:30)(db) explicitFavorite=on(db) passwordRegister=on(db) passwordUpgradeEnforce=on(db) studyModes=on(db) wordbookIncremental=0%(db)` · `effectiveWithinSeconds: 60` —— 与 §10.2 用例的键集断言一致 |
| 4 | `POST /api/admin/flags` `{key:'studyModes',value:'off'}` | `HTTP 200` · `{"key":"studyModes","value":"off","updatedAt":1789833797961,"effectiveWithinSeconds":60}` |
| 5 | 立刻 `GET /api/admin/flags` 读回 | `studyModes=off@1789833797961`（`updatedAt` 与步 4 **逐位相同**）；随后恢复 `on` → `HTTP 200` |
| 6 | 不带 token `GET /api/admin/flags` / `GET /api/admin/stats` | `HTTP 401 {"error":"未登录"}` ×2 |
| 7 | 不带 token `POST /api/admin/flags` | `HTTP 401 {"error":"未登录"}` |
| 8 | 错误口令 `POST /api/admin/login` | `HTTP 401 {"error":"密码错误"}` —— 应答方是 `admin.ts`，**不是**守卫 |

停服与清理：

```
$ netstat -ano | grep 3055
  TCP    0.0.0.0:3055           0.0.0.0:0              LISTENING       56208
$ cmd //c "taskkill /PID 56208 /F /T"
$ curl -s -m 3 -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3055/api/version
HTTP 000            # 已无监听
$ rm -rf /tmp/t07r4
$ ls -la data.db packages/server/data.db
-rw-r--r-- 1 … 253952 Sep 18 04:05 data.db
-rw-r--r-- 1 …      0 Sep 17 00:10 packages/server/data.db     ← 两个库的 mtime / 字节数一字未动
```

- **坑（留给 Phase 5）**：后台任务只 `kill` 掉 `pnpm` 外壳时，`tsx` 子进程**仍占着 3055 和临时库**（`rm` 报 `Device or resource busy`）；要按 `netstat` 给的 PID `taskkill /F /T`。
- 副本库跑出过 `smoke.db-wal` / `-shm`（步 4/5 的写全落在副本上），这正是"写没打到仓库根"的物证；三者随目录一起删除。
- **一条观察**（不改代码，属 A-32-6 (b) 的输入）：这个副本是 `cp` 仓库根 `data.db` 得来的，而 `[Apply] 本次应用 7 个迁移` 说明它此前**一条迁移都没登记过** —— 与 §8-1 的结论完全一致：旧库靠 `SqliteAppDB.init()` 的 DDL 建表、不经 `_migrations`。T-06 的启动自检落地后，这条输出应当变成"0 个迁移 + 已登记"或 fail-fast。

### 10-5 冒烟（本轮 00:05~00:10 实跑，原始输出）

1. **`pnpm --filter @tm/server typecheck`** —— 第三轮那次是 `EXIT=0`；第四轮两次（00:05、00:10）红，但**两条错都在别人名下**：

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
test/db/wordbook-rmw.spec.ts(78,10): error TS7053: Element implicitly has an 'any' type because expression of type '"sync_version"' can't be used to index type '{}'.
  Property 'sync_version' does not exist on type '{}'.
test/db/wordbook-rmw.spec.ts(381,36): error TS2532: Object is possibly 'undefined'.
Exit status 2
```

   归因：`packages/server/test/db/wordbook-rmw.spec.ts` mtime = **00:03**（我 00:05 跑时它正在被写），属 **T-06 微轮**（A-32-6 的 `AppDB` 事务内 RMW，`git status` 同批显示 `src/db/{index,pg,sqlite,types}.ts` 为 M、`test/db/`、`src/db/migrations/` 为新增）。按并行安全口径**记录不动手**。错误清单里没有我名下 9 个文件中的任何一个 ⇒ **T-07 侧 0 错**（可用"第三轮 23:25 同一批文件在盘上时 EXIT=0"交叉印证）。
2. **`pnpm --filter @tm/server test`** —— 唯一红仍是 A-28-1：

```
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 31ms
 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
 ❯ test/trpc-shape.spec.ts:390:13
 Test Files  1 failed | 12 passed (13)
      Tests  1 failed | 307 passed | 1 skipped (309)
```

   **未跑 `TRPC_SHAPE_UPDATE=1`、未碰基线**（A-28-1 归出口轮 E2）。
3. **我名下两文件单跑**（00:05:25）：

```
 ✓  @tm/server  test/contract/legacy-apk.spec.ts (28 tests) 2626ms
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (26 tests) 12217ms
 Test Files  2 passed (2)
      Tests  54 passed (54)
```
4. **`node tools/boundaries.mjs --flags --password`** —— 3/4，红的正是 A-32-5 裁给 T-02 的那条（数字仍 13）：

```
OK   deadline-key-zero          0 命中
RED  enforce-flag-single-read   引用点 13 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"）：packages/server/src/routes/admin-flags.ts:11 | packages/server/src/scripts/ddl-parity-runner.ts:216 | packages/server/src/services/auth-service.ts:187 | packages/server/src/services/password-policy.ts:11 | …
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等

3/4 条通过，1 条红
```

   真读点仍只有 `auth-service.ts:187`（`grep -n "flags.isOn('passwordUpgradeEnforce'" packages/server/src` 可复核）。`password-write-points` 这条 OK 也顺带说明 A-32-4 没让 `password` 列多出写入点。
5. **`pnpm depcruise`** —— 绿：`✔ no dependency violations found (362 modules, 1010 dependencies cruised)`。
6. **`node tools/boundaries.mjs --copy`** —— 绿：`OK copy-legacy-zero 0 命中（… 例外豁免 75 处）；需人工复核词命中 126 处（不判红…）` + `1/1 条通过，全绿`。
7. **归属自检**（本轮 9 个文件逐个喂给门禁）：

```
$ node tools/boundaries.mjs --check-ownership --task T-07 --files <本轮 9 个文件>
--check-ownership task=T-07 触碰 9 个文件 → 无越界
```

   （A-28-3 那条对 `tools/exceptions.json` 的误报本轮**没有命中** —— 它只在 `--diff-file` 形态下出现。）

### 10-6 盘面数字对账（按 A-32-9 定的通用口径：简报数字 vs 实测数字逐条归因）

| 项 | 简报 / A-32 盘面（`:223`，第三轮深夜） | 第四轮实测（00:05~00:10） | 归因 |
|---|---|---|---|
| `--filter @tm/server test` | 286 passed / 1 failed / 1 skipped（**12 文件** = 288） | 307 passed / 1 failed / 1 skipped（**13 文件** = 309） | **+21 = 我 +5 + T-06 +16**。我的 +5：`auth-hardening` 24→26（D-13b 1 条改 3 条）、`legacy-apk` 25→28（真起服 3 条）。T-06 的 +16：新文件 `test/db/wordbook-rmw.spec.ts` 单跑 `(16 tests)` 全绿（00:08:10 取证）。文件 12→13 与 +16 同步 ⇒ **无第三来源**。红的 1→1 仍是 `trpc-shape`（A-28-1）。`1 skipped` 是他人既有用例（§2-2 已记） |
| `--filter @tm/server typecheck` | **0 错** | 2 错，全在 `test/db/wordbook-rmw.spec.ts` | T-06 微轮**正在写**该文件（mtime 00:03）；我名下 9 文件 0 错 → §10-5 第 1 条。**不是 T-07 的缺陷，也未由我修** |
| `pnpm depcruise` | 357 modules / 986 deps（§2-4 / §8-6） | **362 / 1010** | +5 modules、+24 deps 来自 T-06 的 `test/db/**`、`db/migrations/**` 等新文件进入扫描面；我本轮三处改动**没新增一条 import**（`app.ts` 只是给已有调用点补参数）。仍 0 违规 |
| `--flags --password` | 1 红，`enforce-flag-single-read` 13 > 1 | **同一条、同一数字 13** | A-32-5 归 T-02（扫描口径），本轮净增引用点 **0**；唯一变化是 §8-3 表内 `routes/admin-flags.ts` 那条**行号 10→11**（同一处反向声明注释被我加的注释挤下去 1 行） |
| `--copy` | 1/1 绿 | 1/1 绿 | 本轮未新增任何用户可见文案。`'密码错误'` / `'未登录'` 只出现在**测试断言**里（判"谁应答"），不在 `--copy` 扫描面；生产侧文案/错误码仍全部 import `@tm/shared` |
| 起服冒烟 | §2-9 是"未迁移库"取证（当时 500） | §10-4 是"副本库先 migrate"实测（全通） | 两条不冲突：§2-9 证的是 A-32-6 (a)/(b) 的必要性（已由 T-06 微轮实施），§10-4 证的是 A-32-3 修完之后 runbook 步 8 真的走得通 |

### 10-7 给 T-19 / T-16 的口径（**在 §8-7 四条之上追加**，§8-7 原文一字未改）

1. **登出语义变了（A-32-4）**：`POST /api/logout` 与 `auth.logout` 仍 200、出参仍 `{ok:true}`，**但服务端不再作废 token** ⇒ **客户端必须自己把凭据清干净**。App 侧就是 R-39⑧ 的 `AndroidBridge.saveToken('')`：**T-19 的退出按钮若只调接口不清本地 token，用户"退出"后本机那枚 30 天 token 依然能打所有接口 —— 服务端已经不再兜这一手**。Web 侧对应清掉本地存的同一枚 token（含 WS 首帧与 SSE 取用的那份，`tokenFromRequest` 三种取法都还认它）。
2. **"退出即全设备下线"不是本期能力**：要它请走**改密**（R-40③，≤60 秒生效），或把它做成显眼的第二个动作（"退出并注销其它设备"）—— 后者需要新 PRD 条目，**不要拿 logout 凑**。
3. **强制改密页的"退出"出口行为不变**（§4.7 ④ 白名单仍在，`auth-hardening:948` 钉了 upgrade token 登出仍 200 且不解除门禁态）：改密页上"退出"这两个字现在**名副其实地只是退出这台设备**，不会把用户已经改成功的凭据弄坏。
4. **A-32-2 的连带口径**：`wordbookIncremental` 现在全进程一份 flags 实例，但 `routes/wordbook.ts` 的 `deps` 仍是**可选**的 ⇒ 任何新的装配方（批次4 若换装配表）必须显式传 `{ flags, cache }`，否则 §10-1 第 2 步的 WeakMap 退化会重现。`legacy-apk.spec.ts:900` 那条用例就是这条红线的哨兵，别删。
5. **移交一条 T-06 名下的注释过期（我没碰，禁触面）**：`packages/server/src/db/types.ts:130` 对 `touchPasswordChanged` 的注释仍写"让旧 token 失效的**登出型操作**"。该列现在只由**改密类**操作推进（`auth-service.ts:400` / `:426`）。方法本身不是死代码（改密路径、`src/scripts/ddl-parity-runner.ts`、`test/db/methods.spec.ts` 都在调），只是注释过期 → 请 T-06 在微轮里顺手改一行，或出口轮统一处理。（旁证：`git status` 显示 `src/db/types.ts` 此刻正被 T-06 标为 M。）

### 10-8 本轮 diff（9 个文件，全在 `02-tech-design.md:852` 允许面内；机器自检 §10-5 第 7 条）

| 文件 | 改动量 | 归属裁决 |
|---|---|---|
| `packages/server/src/app.ts` | `+1/-1` 代码（`:201` 注入）+ 两段注释 | A-32-2 / A-32-3 |
| `packages/server/src/routes/admin-flags.ts` | `+2/-1` 代码（`:58-59` 收窄）+ 头注释 | A-32-3 |
| `packages/server/src/routes/admin.ts` | 注释 `:8-12`，**0 行逻辑** | A-32-3 |
| `packages/server/src/services/auth-service.ts` | `logout()` 去推进 + 注释（`:126`、`:476-488`） | A-32-4 |
| `packages/server/src/routes/auth.ts` | 2 处注释（`:13`、`:141`） | A-32-4 |
| `packages/server/src/trpc/routers/auth.ts` | 1 处 docstring（`:154` 上方） | A-32-4 |
| `packages/server/src/services/account-audit.ts` | 1 处注释（`:39`） | A-32-4 |
| `packages/server/test/integration/auth-hardening.spec.ts` | D-13b 整组改写（1 条 → 3 条 + `:869-887` 理由块）+ 文件头 `:18`；24 → 26 例；1033 行 | A-32-4 |
| `packages/server/test/contract/legacy-apk.spec.ts` | 文件头 1 段 + 真起服夹具 `:732-792` + 3 条用例 `:796`/`:837`/`:914`；25 → 28 例；722 → **964** 行 | A-32-3 / A-32-2 |

**未触碰**：`packages/shared/**`、`db/**`（T-06 微轮正在写，含 `src/db/types.ts` 与 `test/db/wordbook-rmw.spec.ts`）、`routes/{wordbook,review,profile,chat,lookup,tutor}.ts`、`trpc/routers/` 其它域、`services/{wordbook*,review*,queue*,checkin*,fsrs,profile*,avatar*,search-history*}.ts`、`tools/**`、`apps/**`、`test/trpc-shape.baseline.json`。

**合规**：无 git 写操作（只用了 `git status` 只读）；未跑 `TRPC_SHAPE_UPDATE=1`、未改基线；未在 `data.db` / `packages/server/data.db` 上做任何写或迁移（副本库跑完已删，两个库 mtime/字节数复核未变）；未放宽任何规则、未删任何断言、未加 `it.skip`、未加门禁例外；未新增第三方依赖（真起服用例只用了已在 `package.json` 里的 `@hono/node-server` 与 Node 内置 `node:http`）；文案与错误码仍 import `@tm/shared`，测试里的两个遗留字面串比较的是"谁应答"，不构成新文案；并行撞面（`test/db/**` 挡住 typecheck）按口径**只记录不动手**。

