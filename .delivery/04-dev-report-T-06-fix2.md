# 开发报告 · T-06 修复轮 2（A-32-1(b) 启动自检收口 + A-32-6 RMW 交接）

> 角色：数据层开发 · 任务：**T-06 第六轮 / 修复轮 2**（简报口径："代码已经写完，本轮把上一轮差的那一步跑完并交报告"）
> 判据来源：`04-adjudications.md` **A-32-1(b)**（启动 fail-fast 自检）与 **A-32-6**（事务内 read-modify-write），辅证 A-18-3 / A-32-9 / A-30 / A-28
> 报告时间：2026-09-20 00:3x（本机 Node v22.20.0 / pnpm 11.x / 无 PostgreSQL 实例）
> 上一轮的原始报告 `04-dev-report-T-06.md`（批次1 交付）**未被覆盖**，本文件是增量。

---

## 0. 一句话结论

两件事都**收口并真跑绿**：`test/db/boot-check.spec.ts` **12/12 绿**、`test/db/wordbook-rmw.spec.ts` **16/16 绿**，
四条冒烟 = `typecheck` **0 错** / `@tm/server test` **320 passed · 1 failed（唯红 = `trpc-shape` 基线，A-28-1 已知，未碰）** /
`node tools/ddl-parity.mjs` **A 段/sqlite 仍 0 差异 · exit 0** / `pnpm depcruise` **✔ no violations · exit 0**。
简报说的"只剩 1 处类型错"实际是 **3 处**（另 2 处在 `wordbook-rmw.spec.ts`，上一轮只跑了 vitest 没跑 typecheck 所以没看见），
外加新用例**抓到 1 处真实的双驱动错误通道分叉**（`sqlite.ts:findCredentialsById` 同步 throw vs pg reject）—— 本轮一并修掉，共改 3 个文件 4 处，全部在 T-06 可写面内。
简报点名的"待对齐的只读断言（`tableNames`、WAL 库上的 `{ readonly: true }`）"**无需放宽**：现实与断言一致，首跑即绿。

---

## 1. 开工盘面确认（简报要求的第一步，两条只读命令）

```
$ git status --porcelain packages/server/src/db packages/server/test/db
 M packages/server/src/db/index.ts
 M packages/server/src/db/pg.ts
 M packages/server/src/db/sqlite.ts
 M packages/server/src/db/types.ts
?? packages/server/src/db/migrations/
?? packages/server/test/db/

$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
test/db/boot-check.spec.ts(170,20): error TS2339: Property 'applied' does not exist on type 'string[]'.
test/db/wordbook-rmw.spec.ts(78,10): error TS7053: Element implicitly has an 'any' type because expression of type '"sync_version"' can't be used to index type '{}'.
test/db/wordbook-rmw.spec.ts(381,36): error TS2532: Object is possibly 'undefined'.
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] … Exit status 2
```
与交接记录**一致**：`db/{types,sqlite,pg,index}.ts` 的改动在盘、`db/migrations/` 与 `test/db/` 是未跟踪的新增、
`wordbook-rmw.spec.ts` 与 `boot-check.spec.ts` 都在。**全程零 git 写操作**（只用了 `git status` / `git diff` / `git ls-files`）。

> 唯一与简报不符之处 = 编译错是 3 处不是 1 处。根因是口径问题不是掩盖问题：**vitest 用 esbuild 转译、不做类型检查**，
> 所以上一轮"16/16 绿"与 `tsc` 红完全可以同时成立。这条已写进 §10 对账表，供简报模板今后修正。

---

## 2. 本轮改动清单（3 个文件 / 4 处，全部在 `test/db/**` + `src/db/**`）

| # | 文件:行 | 改了什么 | 为什么这样改 |
|---|---|---|---|
| 1 | `test/db/boot-check.spec.ts:169-171` | `expect(applied.applied.length)` → `expect(applied.length).toBeGreaterThan(0)` + `expect(applied).toContain('001-credentials-columns')` | 简报点名的那处：`MigrationRunner.apply()` 的返回类型是 `Promise<string[]>`（`db/migrations/index.ts:237`），`.applied` 是 `plan()` 的字段，两者被记混。补的第二条断言把它从"能编译"变成"确实应用过 M1"——自检判据的输入就是这个事实 |
| 2 | `test/db/wordbook-rmw.spec.ts:77-84` | `rawVersion()` 的 `better-sqlite3` 行对象显式窄化成 `Record<string, unknown> \| undefined` 再取 `sync_version` | TS7053。与同文件 `rawData()`/`rawRow()` 已有的写法对齐，不加 `as any`、不关 `noUncheckedIndexedAccess` |
| 3 | `test/db/wordbook-rmw.spec.ts:381` | `s.split(' ')[0].toUpperCase()` → `(s.split(' ')[0] ?? '').toUpperCase()` | TS2532（`noUncheckedIndexedAccess`）。断言的期望数组一字未动 |
| 4 | `src/db/sqlite.ts:210-216` | `findCredentialsById` 加 `async`（方法体一字未动）+ 3 行注释说明为什么 | **新用例抓到的真实分叉**：未迁移库上 `db.prepare(CREDENTIAL_SELECT)` 同步抛 `no such column`，同步方法里它是 **throw**，pg 侧同名方法是 **reject**（`pg.ts:222` 是 `async`）。上一轮已按同一口径把 `findCredentialsByPhone` 等 5 个新方法改成 async，这一处是同一家族的漏项。改后 `boot-check.spec.ts:132` 那条"读凭据立刻炸"的断言两侧同一条路 |

**未触碰**（硬约束逐条核对）：`db/migrations/**`（M1-M6 只加不删）、`packages/shared/**`、`app.ts`、`config.ts`、`middleware/**`、`routes/**`、`trpc/**`、`services/**`、`tools/**`、`apps/**`、任何 `package.json`/`pnpm-workspace.yaml`/`vitest.workspace.ts`。
`--check-ownership` 实测：

```
$ TM_TASK=T-06 node tools/boundaries.mjs --check-ownership --files <本轮+上一轮 T-06 面 9 个文件>
NOTE .delivery/04-dev-report-T-06-fix2.md：归属表无条目（no-entry，不阻断）
--check-ownership task=T-06 触碰 9 个文件 → 无越界
```

---

## 3. A-32-1(b) 启动自检 —— 实现（上一轮）+ 本轮收口

### 3.1 判据依据

A-32-1 把 T-07 报告 §8-1 的缺陷裁成两半：**(a)** 运维口径"起服前先 `pnpm db:migrate`"（PRD §6.4-2 + T-21 preflight 兜底），**(b)** 代码口径"**由 T-06 在 `db/{sqlite,pg}.ts` 的 `init()` 里做启动自检**——`_migrations` 未含 `001-credentials-columns` 即启动 fail-fast 并打印 `pnpm db:migrate`，绝不允许退化成一堆 per-request 500"。
裁决给的理由我照抄进注释：这是本期唯一破坏性变更的落地路径，症状直接命中 §6.4-6 回滚判据，而"500/服务器内部错误"同时违反 §4.6 的 P0 路径红线。

**实现口径的一个选择**（简报未指定，我按裁决原文选的）：裁决写的是"`_migrations` 未含 001"，我落成了**"读 `users` 实际列、缺 M1 两列即失败"**（`CREDENTIAL_COLUMNS.filter(col => !存在)`）。理由：
① 判据直接落在**真正会被打炸的那两列**上，不依赖账本表（未迁移库上 `_migrations` 本身也不存在，拿它当判据等于把"表缺缺"和"账本缺缺"两种情形混成一条消息）；
② 与 §6.1-1"只加不删"一致：账本可能被手工 `INSERT`、列不会骗人；
③ `pnpm db:migrate` 结尾本来就有 `[SchemaDiff] 0 处差异` 那一步，账本一致性已由迁移框架看守，不需要在启动路径上重复一遍。
**"未迁移"与"缺列"在这两列上是同一件事**（M1 是这两列的唯一来源，`init()` 的旧 DDL 里没有它们），用例第 2、3 条把两种库形状（基线表齐但缺列 / 全新空库）都钉了。

### 3.2 改动点（上一轮已在盘，本轮核对为实）

| 位置 | 内容 |
|---|---|
| `db/types.ts:560` | `CREDENTIAL_COLUMNS = ['password_changed_at','pw_policy_version'] as const`（M1 两列的唯一定义源，迁移 `001` 也用它） |
| `db/types.ts:563` | `MIGRATE_COMMAND = 'pnpm db:migrate'`（根 `package.json:23` 的实脚本） |
| `db/types.ts:569` | `credentialColumnsMissingMessage(missing)`：人话（"数据库还没迁移…登录和注册会整片返回 500"）+ **可执行动作**（`pnpm db:migrate`，并说明幂等、如何用 `SQLITE_PATH`/`DATABASE_URL` 指到同一个库） |
| `db/types.ts:575/578/601` | `ALLOW_UNMIGRATED_ENV` / `MIGRATION_BOOTSTRAP_ENTRY` / `migrationBootstrapExemption(ctx)` —— 三条豁免：`TM_DB_ALLOW_UNMIGRATED=1`、`src/scripts/{migrate,ddl-parity-runner}.ts`、测试 runner（`VITEST`/`JEST_WORKER_ID`）。**`src/index.ts` 故意不豁免** |
| `db/types.ts:616` | `assertCredentialColumnsForBoot(missing, ctx)`：两驱动 `init()` 的收敛点，判据与消息**只有一份** |
| `db/sqlite.ts:886` | `init()` 末尾用 `PRAGMA table_info` 算缺列后调它（在既有那段"只补两条上古列"的轻量迁移之后，位置=建完基线表的最后一站） |
| `db/pg.ts:926` | `init()` 末尾用 `information_schema.columns`（`table_name = 'users'`）算缺列后调同一条 |

### 3.3 用例 `test/db/boot-check.spec.ts`：**12 条全绿**（本轮首跑）

为什么用 tsx 子进程：豁免里有"测试进程放行"一条，于是**服务进程**那一支只能在真实进程语义里验；夹具 `test/db/fixtures/{boot-init,boot-init-pg}.ts` 重新拼 env（不带 `VITEST`/`TM_DB_ALLOW_UNMIGRATED`）。

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server boot-check
 ✓  @tm/server  test/db/boot-check.spec.ts (12 tests) 3559ms
   ✓ 未迁移库（基线表已建、缺 M1 两列）→ 启动失败，消息含 `pnpm db:migrate`  500ms
   ✓ 全新空库（连基线表都没有）→ 同样失败  463ms
   ✓ 已迁移库 → 正常起（exit 0 + BOOT-OK）  733ms
   ✓ 自检只读不写：失败那一次不碰 schema、不建 `_migrations`  537ms
   ✓ pg 侧未迁移 → 同一子进程语义下失败，且那句消息与 sqlite 侧逐字相同  870ms
   ✓ pg 侧已迁移（introspection 回报齐两列）→ 正常起  419ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```
六组判据的落点：① 缺陷现场复现（L122）② 未迁移必拒 + 消息含动作（L142/L157）③ 已迁移正常起且**读凭据真的拿到行**（L166，含本轮新增的 `toContain('001-credentials-columns')`）④ **自检只读不写**（L193，失败那次 `users` 列集合不变、不建 `_migrations`）⑤ 两驱动对称（L206/L219/L228：消息 `toBe` 逐字相等 + pg 侧确实走 `information_schema.columns` 且不靠 `ALTER` 兜）⑥ 豁免判据本身（L257/L268/L274/L287：迁移引导入口放行、`src/index.ts`/`init-fsrs.ts`/`src/app.ts` 一律不放行、开关只认 `=1`）。

**简报第 2 步要求的"把只读断言与现实对齐"= 无需改动**：`tableNames()` 与 WAL 库上的 `new Database(file,{readonly:true})` 首跑即命中现实（只读连接在 WAL 库上读得到 `users`/`wordbooks`/`_migrations`），我没有为了变绿改过任何断言。**"自检不改 schema"那条（L193）原样保留**——它是判据本体。

### 3.4 高价值证据：**真实服务进程**在未迁移库上拒绝启动（本轮新增，简报第 3 步）

用的是**仓库根 `data.db` 的临时副本**（`cp data.db{,-wal,-shm} tmp/t06-fix2/boot-copy.db`；该库实测 `users 列 = id,phone,created_at,password`、`_migrations: no such table`、23 行 = 未迁移）。入口是 `packages/server/src/index.ts` 本体，不是夹具。

**(1) 未迁移副本 → 起服立刻失败 + exit 1**
```
$ DB_DRIVER=sqlite SQLITE_PATH=E:/CC/tomorrow-memory/tmp/t06-fix2/boot-copy.db PORT=3999 \
>   node node_modules/tsx/dist/cli.mjs packages/server/src/index.ts
[OTEL] 链路追踪未启用（设置 OTEL_ENABLED=true + Jaeger 地址）
Failed to start: Error: 数据库还没迁移：表 users 缺少凭据列 password_changed_at 与 pw_policy_version（这两列由迁移 001-credentials-columns 添加，旧建表 DDL 里没有它们）。服务因此拒绝启动 —— 在这种库上起服，登录和注册会整片返回 500。请先执行 pnpm db:migrate（幂等，可重复执行；用 SQLITE_PATH / DATABASE_URL 指到同一个库），再重新起服。
    at assertCredentialColumnsForBoot (packages\server\src\db\types.ts:623:9)
    at SqliteAppDB.init (packages\server\src\db\sqlite.ts:886:5)
    at main (packages\server\src\index.ts:73:12)

[PROBE] exit code=1 signal=null booted=false
[PROBE] 输出含拒绝启动消息 = true
[PROBE] 输出含 pnpm db:migrate = true
```
失败后立刻只读复核副本：`users cols: id,phone,created_at,password`、`_migrations: no such table` —— **真进程侧也证伪了"自检会顺手补列"**（`index.ts:73` 的 `db.init()` 在 Redis/ClickHouse/端口绑定之前，所以既没建 `_migrations` 也没监听端口）。

**(2) 对同一个副本 `pnpm db:migrate`**
```
$ DB_DRIVER=sqlite SQLITE_PATH="E:/CC/tomorrow-memory/tmp/t06-fix2/boot-copy.db" pnpm db:migrate
[Discipline] 0 违规（7 个迁移 × 2 驱动：白名单形态 + down/noDownReason + 无业务表读写）
[DB] driver=sqlite 目标=sqlite:E:\CC\tomorrow-memory\tmp\t06-fix2\boot-copy.db
> 001-credentials-columns … ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0 / pw_policy_version …
[Apply] 本次应用 7 个迁移：000-migrations-table, 001-credentials-columns, …, 006-entry-updated-at-doc
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===        MIGRATE_EXIT=0
```
（注意：`migrate.ts` 自己也会 `db.init()`，它走的是**豁免②迁移引导入口**才跑起来的 —— 若给它也 fail-fast，A-32-1(b) 要人执行的那条命令就自相矛盾了。）

**(3) 迁移后再起 → 正常，且缺陷症状（500）真的消失**
```
$ node node_modules/tsx/dist/cli.mjs packages/server/src/index.ts   # DB_DRIVER=sqlite SQLITE_PATH=<同一个副本> PORT=3999
[DB] SQLite initialized (driver=sqlite)
[CH] ClickHouse 不可用（开发降级）: fetch failed
[REDIS] 不可用（降级为内存实现）: Connection is closed.
[AGENT] LLM 未配置（降级启发式/规则模式）
[WS] WebSocket 已启用（/ws）
Server running at http://localhost:3999

[PROBE] POST /api/login -> HTTP 401
[PROBE] body: {"error":"手机号或密码不正确"}
[PROBE] exit code=null signal=SIGTERM booted=true
```
`POST /api/login` 拿 **401 + §4.6 的人话文案**，不是 A-32-1 描述的 500 `{"error":"服务器内部错误"}` —— 这条是"症状消失"的直接证据（副本里 `13800138000` 是有密码的存量账号，故意填错）。

取证跑完：子进程已 SIGTERM 杀掉（`netstat` 确认 3999 不再监听），`tmp/` 整个目录（副本 + 一次性探针 `boot-probe.mjs`）**已删除**，`git status --porcelain | grep "?? tmp/"` = 0 行。端口用 3999 是刻意避开在跑的 3001 dev 服务，不干扰别的任务。

---

## 4. A-32-6 `wordbooks.applyMutate` —— 实现（上一轮，本轮核对为实）+ 用例 16/16 绿

### 4.1 判据依据与形状

A-32-6 认可 T-09 报告 A-b：`applySync` 要客户端 `baseVersion`、`applyEntries` 不碰墓碑列，于是 service 层只能"读投影 → merge → CAS 覆写"并自己重试 16 轮，**极端并发下残余那一轮不写墓碑**。裁决"两个改动都在 `db/**`，同一轮做"。

| 位置 | 内容 |
|---|---|
| `db/types.ts:166/186/201/217` | `WordbookCurrent` / `WordbookPatch<T>` / `WordbookMutationPlan<T>` / `WordbookMutateResult<T>` |
| `db/types.ts:508` | `wordbookCurrentOf(row)`：一行 → 归一 current（两驱动共用，缺行 = `exists:false`） |
| `db/types.ts:528` | `planWordbookMutate(current, patch)`：**唯一一份**"字节全等 ⇒ 不写不 bump version"规则；回调返回非对象或 `data:null` **直接抛**（当成 `[]` 会删光用户的词，PRD §6.4-6 回滚判据级） |
| `db/sqlite.ts:406` | `BEGIN IMMEDIATE`（`run.immediate`，先拿整库写锁）→ 读行 → plan → **缺行才**最小 INSERT → **仅变化时** `sync_version = sync_version + 1` → `ensureNewCards`；同步抛错转 rejection（与 pg 同通道） |
| `db/pg.ts:381` | `BEGIN` → `SELECT … FOR UPDATE`（行锁）→ 同一决策 → COMMIT / ROLLBACK+rethrow → `finally client.release()`；`data` 接受数组或**字符串**（字符串 = 逐字写 ⇒ 未知键不丢） |

### 4.2 用例（本轮首跑即绿，只改了 §2 的 2 处类型写法）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server test/db/wordbook-rmw.spec.ts
 Test Files  1 passed (1)      Tests  16 passed (16)
```
覆盖：基本流（版本 +1 / `value` 原样带回 / 新词补卡）、持锁内读墓碑与版本、**幂等重放**（逐字相同 ⇒ 不写不 bump、`updated_at` 不动）、墓碑省略=一个字节不碰、回调抛错整体回滚、非对象/`data:null` 抛错且不写、缺行两分支（写非空 → 版本 1 / 写 `[]` → 版本 0）、**两个独立写事务叠加不丢词**（取代 CAS 的可观察判据）、字符串分支逐字落库（未改动条目的序列化一字不差）、数组分支不校验不排序不裁键、纯函数助手直测、pg 事务边界与 SQL 序列、pg 幂等、pg 回滚、**同一组场景两驱动返回值序列与落库内容逐字相同**、pg 真库缺 `DATABASE_URL_TEST` 时显式 SKIP 并打印原因。

`wordbooks.data` 的 JSON 形状：本方法**一字不动、不校验、不排序**（`applyEntries` 也是），要"未知键原样保留"就走 `data: string` 分支从 `current.dataJson` 起合并 —— 这条写进 §6 给 T-09。

---

## 5. 全量冒烟（简报第 4 步的四条，真实粘贴）

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit            （无输出 = 0 错，exit 0）

$ pnpm --filter @tm/server test
 ✓  @tm/server  test/db/boot-check.spec.ts (12 tests) 3631ms
 …（另有 test/db/{wordbook-rmw 16, methods 25, migrations 25} 全绿）…
 FAIL  @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移
 Error: appRouter 形状漂移：首个差异在第 3162 行 —— 受影响 procedure: auth.activate, …, review.queue, review.undo
 Test Files  1 failed | 13 passed (14)
      Tests  1 failed | 320 passed (321)
```
> 唯红 = **A-28-1 批次3 已知红**，按裁决**没跑** `TRPC_SHAPE_UPDATE=1`、没加例外、没碰基线。`chat-isolation` 本轮**没有**因 T-11 在写而瞬时红（25/25 绿），无需单独复跑。

```
$ node tools/ddl-parity.mjs        DDL_PARITY_EXIT=0
schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：…
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B/C 段：调 packages/server/src/scripts/ddl-parity-runner.ts（sqlite=临时文件库 / pg=DATABASE_URL_TEST），同一份 tools/fixtures/schema-fixtures.json（b_cases 12 组 / c_cases 4 组）
B 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
C 段/pg：SKIP —— …（同上，并明确"这不是通过"）
```
**A 段仍 0 diff 的前提成立**：本轮 `db/migrations/**` 与 `packages/shared/src/schema/tables.ts` 一字未动（简报的这条约束我按"迁移文件与 tables.ts 一字未动"核对为实）。B/C 段的 sqlite 侧是真跑了（脚本在 `ran !== true` 时会打 `FAIL —— 装配没跑起来` 并 exit 1；它只在 pg 被 SKIP 时不单独打印 sqlite 行），但**"双驱动行为一致"这一层本机拿不到结论**，见 §9。

```
$ pnpm depcruise                     DEPCRUISE_EXIT=0
✔ no dependency violations found (364 modules, 1027 dependencies cruised)
```

附加（只读，给出口轮对账用；不在简报的四条里）：
```
$ node tools/boundaries.mjs          → 17/20 通过，3 条红，全部是已登记的存量红：
   RED enforce-flag-single-read  引用点 13 个 > 1        ← A-32-5 / T-02（出口 E1）
   RED colors-no-hardcode        apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8  ← A-27 假阳口径，owner 各自改注释
   RED css-important-budget      !important 3 处 > 1     ← A-27（tokens.css 那行 a11y 注释面）
$ node tools/boundaries.mjs --self-test → 96/98；唯二红 = A-28-2 那 2 条探针（"例外过期机制"、"A-19 前置：exceptions.json 里至少有一条 review-no-agent 例外"）
```
这四条红（含 `trpc-shape`）**一个都不在我名下，我一条都没修**。`--password` 那条我没单独跑（A-32-5 归 T-02，且 `enforce-flag-single-read` 的 13>1 已在默认扫描里复现）。

---

## 6. 给 T-09 的 `applyMutate` 接线说明（可以直接照抄的一段）

**签名**（`db/types.ts:277`，两驱动同一个）：
```ts
applyMutate<T = void>(
  userId: number,
  mutate: (current: WordbookCurrent) => WordbookPatch<T>,   // ← 同步纯函数，禁止 await / IO
  now: number,
): Promise<WordbookMutateResult<T>>                        // { value: T|undefined, version: number, wrote: boolean }
```
回调入参 `WordbookCurrent` 就是**持锁之后的当前行**：`exists` / `dataJson`（`data` 列**原文**）/ `entries`（解析结果）/ `tombstones`（墓碑列原文）/ `sync_version` / `updated_at`。
返回值 `WordbookPatch<T>` = `{ data: WordbookEntry[] | string; tombstones?: string; value?: T }`。

**五条接线规则**：
1. **回调必须同步且纯**：`stateOf(userId)` 那种 `await` 不能出现在回调里。你现在 `wordbook-service.ts:196 stateOf()` 的返回 `WordbookState` 可以由 `WordbookCurrent` **纯派生**（`data ← entries`、`tombstonesRaw ← tombstones`、`version ← sync_version`、`updatedAt ← updated_at`），`parseTombstones` / `tombstonesForDb` / `pruneTombstones` / 合并投影本来就都是纯函数 —— 所以 `CasProjection<T>` 那套投影**一行逻辑都不用改**，只是从"异步读到的 state 上跑"变成"在持锁的 current 上跑"。
2. **`tombstones` 省略 = 不碰该列**（决策上；实现里同事务把当前值原样写回，值不会变）；给了 = 整列覆盖。`add/remove/clear` 要写墓碑就显式给 `tombstonesForDb(...)` 的返回值。
3. **要保住"未知键原样保留"就走 `data: string` 分支**：从 `current.dataJson` 起合并、把结果作为字符串交回去 ⇒ **逐字节落库**、本层不重新序列化。给数组则 `JSON.stringify` 后落库（本层**不校验、不排序、不裁键**，形状规则与 `applyEntries` 完全一致）。丢用户词 = 不可逆（PRD §6.4-6），这条是 `planWordbookMutate` 宁可抛错也不把 `undefined`/`null` 当 `[]` 的原因。
4. **有了它 `CAS_MAX_ATTEMPTS` 那一圈可以删**（`wordbook-service.ts:176/273`）：把 `writeWithCas` 改成一次 `applyMutate`，
   ```ts
   const r = await db.wordbooks.applyMutate<T>(userId, (cur) => {
     const next = project(toWordbookState(cur));           // 纯派生，不再 await
     return { data: next.entries, tombstones: tombstonesForDb(next.tombstones, next.tombstonesRaw, at), value: next.out };
   }, at);
   return { version: r.version, out: r.value as T };
   ```
   顺带删掉 :288-289 那条 `wordbook_sync_cas_gaveup` 的 warn 与"那一轮不写墓碑"的兜底 —— A-32-6 残余风险的正主就是它。
   **但只删门面侧（无客户端版本号的那条）**：`sync.push`（`wordbook-service.ts:395`）带客户端 `baseVersion`，409 `WORDBOOK_STALE` 的语义要靠 `applySync` 的 CAS 未命中返回值（里面已带服务端最新 `sync_version`），**那条不许换成 `applyMutate`**（换了就等于把"客户端基线"这个信息丢掉）。
5. **回调抛错 = 整个事务回滚**（sqlite 回滚 + 错误转 rejection；pg `ROLLBACK` 后 rethrow），所以 `shapeRejection`/上限校验这类"不该半写"的判断可以直接在回调里 `throw`，库里那一串保持改动前的字节。另外**幂等要求由调用方负责**：pg 的行锁等待与 sqlite 的 `SQLITE_BUSY` 重试都可能让同一请求把回调跑到第二次，请保持投影对同一输入是确定性的（你现在的投影本来就是）。
   新卡补建是同事务内的 `ON CONFLICT DO NOTHING`，`fsrs_cards.data` 的序列化与 `applyEntries`/`saveData` 逐字同形（用例已断言），不用你额外调用。

**给并发用例的提示**：`test/integration/wordbook-concurrency.spec.ts` 判据①（8 路并发各加不同词）可以直接复跑；`test/db/wordbook-rmw.spec.ts:191`「两个独立写事务叠加不丢词、版本连续推进」就是它的 DB 层等价物，两侧结论应一致。

---

## 7. 给 T-21 的说明：A-32-1(a) 的 preflight 步骤（一步机器判定）

现状核对：根 `package.json:18` 已挂 `"release:preflight": "node scripts/release/preflight.mjs"`，但 **`scripts/release/` 目录还不存在** → 现在跑 `pnpm release:preflight` 会是 `MODULE_NOT_FOUND`。文件归 T-21，我不建（越界）。

**preflight 里请这样写这一步（判据与 `init()` 自检同源）**：
1. 用**部署目标的那份配置**（同一 `DB_DRIVER` + 同一 `SQLITE_PATH`/`DATABASE_URL`，不是 preflight 自己的临时库）连上库；
2. 只读问一句 `users` 的实际列（sqlite `PRAGMA table_info(users)` / pg `information_schema.columns WHERE table_name='users'`），与 **`@tm/server/db/types` 导出的 `CREDENTIAL_COLUMNS`** 比，缺列即 preflight FAIL；
3. 顺手做账本核对（可选、第二条判据）：`SELECT name FROM _migrations` 应含 `000`…`006` 七条 —— 缺 001 而列却存在 = 有人手工补过列，那也要红；
4. 失败输出请**复用 `credentialColumnsMissingMessage(missing)` 与 `MIGRATE_COMMAND`**（`db/types.ts:569/563`），别另抄一份文案：这样"人话 + 可执行动作"只有一份真相，也不会出现 preflight 与起服两条互相矛盾的消息；
5. 连接方式用**只读**（sqlite `{readonly:true}`），preflight 永远不许动 schema —— 它跑在部署窗口里，动了就是事故。

**为什么自检挡不住、必须两步都有**：自检是**最后一道**（起服即拒），它给人看的是"服务为什么没起来"；preflight 的价值是**在切流量之前**就知道缺什么，并把"要不要跑 `pnpm db:migrate`"变成流水线里的一个非 0 退出码。§6.4-2 的独立前置步 + 这道机器判定，就是 A-32-1(a) 要的两层。
另外提醒：`MIGRATE_COMMAND` 只是命令名，真正跑迁移时**演练一律 `cp` 到临时副本**（`migrate.ts:assertSafeTarget` 会机器拒绝仓库根 `data.db` 与 `packages/server/data.db`，除非 `--i-know-this-is-prod`）。

---

## 8. 待裁决点：**豁免清单范围**（已按 TPM 裁决落地）

**议题**：`src/scripts/init-fsrs.ts`、`src/scripts/test-agent.ts` 这类一次性脚本要不要进 `migrationBootstrapExemption()` 的豁免名单？

**裁决（本简报已定，我这轮照此落地）：不豁免。** 一次性脚本要用未迁移库，必须显式 `TM_DB_ALLOW_UNMIGRATED=1`。

**理由（写进报告，作为今后加豁免条目的门槛）**：
1. 豁免名单里每一条的**准入条件**是"调用方紧接着就要 migrate"。`migrate.ts` / `ddl-parity-runner.ts` 满足（它们自己的顺序就是"init 建基线表 → 跑 000…006"）；`init-fsrs.ts` 与 `test-agent.ts` **不 migrate**，豁免它们 = 允许一个既不建列、又要往库里写数据的进程长期存在，正是 A-18-1 那类"默认库被静默写脏"隐患的镜像。
2. 未迁移库上写 FSRS 卡片会把"缺列"这个状态**固化**进更多行（卡片建了、登录还是 500），排障时更难归因。
3. 代价极小且可显式表达：一个环境变量。显式的 `TM_DB_ALLOW_UNMIGRATED=1` 在 CI/脚本里是**可读的意图声明**，藏在豁免名单里不是。
4. `src/index.ts` 同理**永不豁免**（它就是 `dev`/`start`/生产容器那条路，A-32-1(b) 的全部意义就在这）。

**实测证据（就是裁决的可执行形态，跑在临时副本上，跑完已删）**：
```
$ DB_DRIVER=sqlite SQLITE_PATH=<未迁移副本> pnpm --filter @tm/server init-fsrs
=== FSRS 卡片初始化 ===
[DB] 写入目标=sqlite:E:\CC\tomorrow-memory\tmp\t06-fix2\unmig2.db
FSRS 卡片初始化 失败: 数据库还没迁移：表 users 缺少凭据列 password_changed_at 与 pw_policy_version …请先执行 pnpm db:migrate …
Exit status 1                                   ← 不豁免：同一句话、非 0 退出

$ DB_DRIVER=sqlite SQLITE_PATH=<同一个未迁移副本> TM_DB_ALLOW_UNMIGRATED=1 pnpm --filter @tm/server init-fsrs
[FSRS] 初始化完成：新建 1 张卡片，跳过 53 张（已存在）      Exit=0      ← 显式开关放行
```
用例侧也钉了同一条：`boot-check.spec.ts:268` 把 `src/index.ts` / `src/scripts/init-fsrs.ts` / `src/app.ts` / 仓库外同名 `scripts/migrate.ts` / `src/scripts/other.ts` 五个入口逐个断言 `toBeNull()`（不豁免）；`:274` 断言开关**只认 `=1`**（`0`/空串/`true` 都不放行）。
`test-agent.ts` 一类"连的是别的东西"的脚本本轮**没有**为它加任何特例（它若走 `createAppDB()+init()` 就会被同一条自检挡下，行为与 `init-fsrs` 一致，这是设计意图）。

---

## 9. 未达成项与"未执行"清单（如实）

1. **A-18-4 的 `ddl-parity` B/C 接线不在本轮**：盘上已有 `src/scripts/ddl-parity-runner.ts`（未跟踪，09-19 16:07）+ `tools/ddl-parity.mjs:321-` 的装配调用，**本轮 `tools/**` 零 diff**，我只核了它没有把口径放宽（B/C 的比对口径仍只在 `ddl-parity.mjs` 里）。**没有**在本轮为 B/C 新增用例或改判定；A 段 0 diff 是本轮实测。
2. **pg 运行时面 = 未执行**（本机无 PG，A-18-3）：`test/db/wordbook-rmw.spec.ts` 的 pg 真库用例显式 SKIP 并打印原因（`DATABASE_URL_TEST` 未设）；`ddl-parity` 的 A 段/pg、B 段/pg、C 段/pg 同为显式 SKIP。**这些不是通过**。`001` 的 pg 分支（`ADD COLUMN IF NOT EXISTS … BIGINT DEFAULT`）、启动自检的 pg 分支（`information_schema.columns`）、`applyMutate` 的 pg 真库路径，全都只有"语句桩 + 与 sqlite 的逐字对账"这一层等效证据 ⇒ **CI（T-22）必须带 `DATABASE_URL_TEST` 真跑 pg**，否则 A-32-1 的 pg 侧等于没验收。
3. **本轮没有**给 `migrationBootstrapExemption` 加/删豁免条目（§8 的裁决落成"零改动 + 用例钉住"）。
4. **本轮没有**跑 `pnpm -r test`（全仓）与 `pnpm --filter @tm/web build`：不在简报的四条里，且 apps 侧正被 T-11/T-12 在写；`@tm/server` 面已全量跑过。
5. **better-sqlite3 ABI 无异常**：本机 `better-sqlite3@11.10.0` 正常加载（本轮所有 sqlite 用例 + 真进程起服都跑通了），未触发简报提醒的那类环境问题，因此没有"先报告再动手"的事项。
6. `data.db` 的副本演练全部打在临时文件上（§3.4 / §8），**仓库根 `data.db` 至今仍是未迁移状态且未被本轮写过**（见 §11）。真正的"上线前迁移"是 T-21 的窗口，不是数据层开发该做的事。

---

## 10. 盘面数字对账表（A-32-9：简报数字 vs 实测数字，逐条归因）

| 项 | 简报（上一轮交接）说的 | 本轮实测 | 归因 |
|---|---|---|---|
| `typecheck` 已知错 | **1 处**（`boot-check.spec.ts` 的 `applied.applied`） | **3 处**（另 2 处在 `wordbook-rmw.spec.ts:78/:381`） | 上一轮只跑 vitest（转译不做类型检查）没跑 `tsc` ⇒ "用例绿"与"typecheck 红"并存。三处都是**测试文件的写法**问题，非实现问题；本轮全修，现 0 错 |
| A-32-6 用例 | 完成，**16/16 绿** | 16/16 绿 | 一致 |
| A-32-1(b) 用例 | 实现完成、用例写完**没跑过** | 首跑 11/12 → 修 1 处后 **12/12 绿** | 首跑那条红是 `findCredentialsById` 同步 throw vs `rejects`，抓到的是**真实的双驱动错误通道分叉**（§2-4）。"没跑过"这一条被证明是必要的一步：它抓到东西了 |
| `test/db` 总数 | 未给 | **78 passed / 4 文件**（12+16+25+25） | — |
| `@tm/server test` 总数 | 未给（A-32 时点是 286/1/1） | **320 passed / 1 failed / 14 文件**，唯红 = `trpc-shape`（A-28-1） | 286→320 的增量 = T-07/T-09/T-10/T-11 在途用例 + 本轮 `boot-check` 12 条 + `wordbook-rmw` 16 条转正式计数；本轮**没有**跳过或删过任何用例 |
| `auth-hardening.spec.ts:929 TS2532` | 简报列为"已知红、别修"（T-07 名下） | **本轮 typecheck 里不存在**（总 0 错） | T-07 第五轮此刻在改 `auth-service.ts`/`app.ts`，该处已被其自己修掉。我没碰过这个文件（登记为盘面漂移，A-32-9 口径） |
| 只读断言需要"与现实对齐" | 简报担心 `tableNames`/WAL 库 `{readonly:true}` 与现实不符 | 首跑即绿，**一条都没放宽** | 该风险未成立；"自检不改 schema"断言原样保留 |
| `ddl-parity` | "A 段必须仍 0 diff" | A 段/sqlite 0 diff · exit 0；B/C 已接线（非本轮） | 见 §9-1 |
| `depcruise` | 期望绿 | ✔ no violations（364 modules / 1027 deps）exit 0 | A-19 修好后的口径；本轮无新增跨域 import（`test/db/fixtures` 只 import `src/db/**`） |
| `boundaries` | 简报列 4 条已知红 | 3 条红（`enforce-flag-single-read` / `colors-no-hardcode` / `css-important-budget`）+ `--self-test` 2 探针红 | 全部是 A-27 / A-28-2 / A-32-5 登记的存量红，非本轮引入、非我名下 |

---

## 11. 数据红线自证

| 红线 | 自证 |
|---|---|
| 绝不在仓库根 `data.db` / `packages/server/data.db` 上跑迁移或起服 | 全程只读（`{readonly:true}`）。起服/迁移/`init-fsrs` 三件事**全部**打在 `tmp/t06-fix2/` 的副本上，且 `SQLITE_PATH` 一律绝对路径。收尾复核：`data.db 253952 / Sep 18 04:05`、`-wal 424392 / Sep 18 04:09`、`-shm 32768 / Sep 17 00:53`（与开工前逐字节同 mtime），`users 列 = id,phone,created_at,password`、`23 行` —— 仍是未迁移形状、未被写 |
| 临时文件不留在仓库 | 取证后 `rm -rf tmp`；`git status --porcelain` 里 `?? tmp/` 已消失。中途一次 `mkdir` 因 shell 变量为空误建在 Git 安装根目录（`/tm-t06-fix2`），已同轮删除，未碰任何仓库/工程文件 |
| `wordbooks.data` 的 JSON 形状一字不动 | 本轮 `db/{types,sqlite,pg}.ts` 的 4 处改动**没有一处**碰 `data` 列的序列化路径（唯一 src 改动是给一个 `users` 读方法加 `async`）；`planWordbookMutate` 的"不校验/不排序/不裁键 + 字符串逐字写"仍由 16 条用例钉着 |
| `db/migrations/**` 只读、M1-M6 只加不删 | 本轮零 diff（`git status` 里 `?? packages/server/src/db/migrations/` 与开工时同一状态），A 段 0 diff 与 `[Discipline] 0 违规` 同时成立 |
| 未放宽规则、未删断言、未加例外、未改 `tools/{ownership,exceptions}.json` | `tools/` 零 diff；`boot-check` 的"自检只读不写"与"不豁免 `src/index.ts`"两条判据都是**加强**（新增 `toContain('001-credentials-columns')`、pg 侧消息 `toBe` 逐字相等）而不是放宽 |
| 无新增第三方依赖 | 任何 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` 都未改；`tsx`/`pg`/`better-sqlite3` 全是既有依赖 |
| 未替别人修红 | `trpc-shape`、`--self-test` 2 探针、`enforce-flag-single-read`、A-27 两条、`auth-hardening` 全部原样保留 |

---

## 12. 给测试 / QA 的提示

- **A-32-1(b) 的人工复现口令**（唯一能在无 PG 机器上复现"症状消失"的一条）：`cp data.db 到临时副本` → `DB_DRIVER=sqlite SQLITE_PATH=<副本绝对路径> pnpm --filter @tm/server start` → 期望**非 0 退出 + 那句"数据库还没迁移 … 请先执行 pnpm db:migrate"**；再 `pnpm db:migrate`（同一 env）→ 起重试 → `Server running` → `POST /api/login` 拿到 401 人话而不是 500。相对路径会相对 `packages/server` 解析（踩过，报的是"directory does not exist"，不会误伤真库）。
- **别把 `pnpm --filter @tm/server test -- db` 当 db 面冒烟命令**：A-18-2 修好后该命令能跑，但位置参数**不生效**（实测它跑了全部 14 个文件）。要单跑 db 面请用 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server test/db`（本轮的 78/78 就是这么来的）。
- **Phase 5 重点测这里**：① 未迁移库上的起服（真进程，不是夹具）；② pg 侧三条（`001` 的 pg 分支 / pg 启动自检 / pg `applyMutate` 真库并发）—— 本机全部只有等效证据，CI 起 PG 后是第一批；③ `applyMutate` 换成 service 之后的 `wordbook-concurrency` 判据①（T-09 接线前后各跑一遍，比对墓碑不再有任何"那一轮不写"的窗口）。
- **给 T-07 的连带提醒**：`findCredentialsById`/`ByPhone` 现在两驱动都是 **reject**（不会再同步 throw）。我把扫到的调用点都核过了：`middleware/auth.ts:92` 是 `await` 在 async 函数里；`services/profile-service.ts:137` 是在 async 的 `getProfileDto` 里把 promise 放进 `Promise.all([...])` 的数组字面量 —— 那种写法下同步 throw 也发生在 async 函数体内，仍然变成 `getProfileDto` 的 rejection，**所以这两处的对外行为不变**（这条只是记录，不是要求 T-07 改动）。真正会受影响的是"在非 async 同步函数里裸调且不 catch"的写法，目前全仓没有。
