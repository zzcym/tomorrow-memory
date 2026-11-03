# 开发报告 · T-06 数据库层与迁移框架（后端）

> 角色：后端开发工程师 · 任务：**T-06**（§10.2 批次1：DDL 单一源 + M1-M6 + 双驱动新读写）
> 覆盖需求：R-40③④、R-03、R-39⑤b⑦、R-11、R-24④ · PRD §6.4-2 步 6b①②
> 报告时间：2026-09-19 15:2x（本机 Node v22.20.0，pnpm 11.24.0）
> **本报告承接上一个 T-06 agent 的盘上成果**：`packages/shared/src/schema/tables.ts`、`db/migrations/000…006 + index.ts`、`db/{types,index,sqlite,pg}.ts`、`scripts/migrate.ts`、`test/db/*.spec.ts` 均已存在。
> 本轮我做的是：**跑通三条冒烟 → 修掉挡住冒烟的 4 处真实缺陷 → 逐条闭合判据①~⑤ → 写本报告**。已能工作的代码没有被重写。

---

## 0. 一句话结论

三条冒烟里 **`pnpm ddl-parity`（A 段/sqlite 0 差异，exit 0）与 migrate CLI（副本上 7 个迁移全绿、SchemaDiff 0）为真绿**；
`pnpm --filter @tm/server test -- db` **命令本身跑不起来**（T-01 的 `test` 脚本 `--root ../..` 导致 vitest 发现 0 个用例），
其**等价命令 `npx vitest run --project @tm/server db` 为 50/50 全绿**。pg 侧运行时面本机无实例 → 未执行（见 §9）。

---

## 1. 完成清单

| 编号/项 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| DDL 单一源（§6.2 第 1 步） | done（盘上已有，本轮验证） | `packages/shared/src/schema/tables.ts` | 13 张表描述 + `columnDdl/createTableDdl/createIndexesDdl/tableDdlFor/findTable/findColumn`；被 6 个迁移、`diffSchemaAgainstDescriptor`、`tools/ddl-parity.mjs` 三方共用 |
| 迁移 M0 | done（盘上已有） | `db/migrations/000-migrations-table.ts` | `_migrations(name, applied_at)`，`noDownReason` |
| M1 凭据列 | done（盘上已有） | `db/migrations/001-credentials-columns.ts` | 两条 `ADD COLUMN … NOT NULL DEFAULT 0`，列清单取自 `CREDENTIAL_COLUMNS` |
| M2 撤销快照表 | done（盘上已有） | `db/migrations/002-review-snapshots.ts` | `CREATE TABLE` + 复合索引，带 `down()`（生产禁执行） |
| M3 账号审计表 | done（盘上已有） | `db/migrations/003-account-audit-log.ts` | 同上，带 `down()` |
| M4 词本同步列 | done（盘上已有） | `db/migrations/004-wordbook-sync-columns.ts` | 两条 `ADD COLUMN … DEFAULT`，带 `noDownReason` |
| M5 开关表 + 种子 | done（盘上已有） | `db/migrations/005-feature-flags.ts` | 8 个开关键值全部来自 `FEATURE_FLAG_DEFAULTS`（T-03 单一源），幂等 `ON CONFLICT DO NOTHING` |
| M6 条目可选键文档 | done（盘上已有） | `db/migrations/006-entry-updated-at-doc.ts` | **无 DDL**；`verifyWordbookEntryDoc()` = dry-parse：加 `updatedAt` 后既有键解析结果必须不变 |
| 迁移执行框架（静态自检 + 运行器 + 反读比对） | done（盘上已有）+ 本轮修 1 处 | `db/migrations/index.ts` | `assertMigrationDiscipline` / `MigrationRunner`（一条迁移=一个事务、sqlite 走 `BEGIN IMMEDIATE`）/ `diffSchemaAgainstDescriptor` |
| `scripts/migrate.ts` 与安全阀 | done + **本轮修 1 处严重隐患** | `packages/server/src/scripts/migrate.ts` | 见 §8-X-T06-1：静态 `import './init-fsrs.js'` 会让"只跑 DDL"的默认路径连带触发一次 **FSRS 卡片写入**（目标=当时的默认 config，未设 `SQLITE_PATH` 时即仓库根 `data.db`）→ 改为 `--init-fsrs` 分支内的动态 import |
| 双驱动新读写（判据④ 的 16 个方法） | done | `db/types.ts`、`db/sqlite.ts`、`db/pg.ts` | 三个文件 **`git diff -U0 HEAD` 无任何 `-` 行 = 既有方法体一字未改**（纯新增） |
| `test/db/migrations.spec.ts` | done + **本轮修 3 处假绿/红** | 同路径 | 判据①用例缺 `AppDB.init()`（空文件直接 ALTER → `no such table: users`）；判据③负向用例的 fixture 名与规则对不上（`x0-no-down` vs 实际 `x00-…`；"业务数据"与"字典序"两条规则**从未被真正触发**） |
| `test/db/methods.spec.ts` | done + **本轮修 3 处** | 同路径 | 断言口径见 §5.3 |
| `tools/ddl-parity.mjs` schema 源接线 | **无需改动**（自动接通） | — | 见 §6 时序交接登记 |

**本轮改动面（全部在 T-06 的 §10.2 可写清单内）**：`src/scripts/migrate.ts`（1 处 import + 1 处动态 import）、`src/db/sqlite.ts`（5 个**新增方法**加 `async` 前缀，方法体一字未动）、`test/db/migrations.spec.ts`、`test/db/methods.spec.ts`。**未触碰**：`tools/**`、`packages/shared/src/{contracts,constants}/**`、`packages/shared/test/**`、`packages/server/src/{routes,trpc,services,middleware}/**`、`packages/*/package.json`、`pnpm-workspace.yaml`。

---

## 2. 六个迁移（+M0）各自做了什么

| # | name | sqlite 语句（实际执行输出见 §4.1） | pg 语句 | 回滚 |
|---|---|---|---|---|
| M0 | `000-migrations-table` | `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)` | 同形（类型映射） | `noDownReason`：账本表不可删（删了下次 migrate 会把全部迁移当未执行重跑） |
| M1 | `001-credentials-columns` | `ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0`<br>`ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0` | `ALTER TABLE users ADD COLUMN IF NOT EXISTS … BIGINT NOT NULL DEFAULT 0` | `noDownReason`：R-40/PRD §6.1-1 只加不删；回滚只回镜像 |
| M2 | `002-review-snapshots` | `CREATE TABLE IF NOT EXISTS review_snapshots(id,user_id,word,prev_data,prev_due,reps_before,created_at)` + `CREATE INDEX IF NOT EXISTS idx_review_snapshots_user_id_word_created_at` | 同形 | `down()`：`DROP TABLE IF EXISTS`（仅本地/预发；生产窗口禁执行） |
| M3 | `003-account-audit-log` | `CREATE TABLE IF NOT EXISTS account_audit_log(id,user_id,phone_masked,action,result,ip,ua,created_at)` + `idx_account_audit_log_user_id_action_created_at` | 同形 | `down()`：同上 |
| M4 | `004-wordbook-sync-columns` | `ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0`<br>`ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'` | 同形 | `noDownReason`：删列会丢已放量的增量真相；回滚 = 回镜像 + `wordbookIncremental=0%` |
| M5 | `005-feature-flags` | `CREATE TABLE IF NOT EXISTS feature_flags(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL)` + **8 条** `INSERT … ON CONFLICT (key) DO NOTHING` | 同形 | `down()`：`DROP TABLE`（发布窗口内禁止） |
| M6 | `006-entry-updated-at-doc` | **无 DDL**（0 条语句）；注册 `verifyWordbookEntryDoc()` 供 `--verify-data` 只读 dry-parse | 同 | `noDownReason`：无库变更可回滚 |

**没有做的（红线，逐条对齐）**：未改任何既有列名/类型（`users.id/phone/created_at/password`、`wordbooks.data` 原样）、未动 `fsrs_cards.data`/`fsrs_calendar`、未动 `profiles.avatar`、未动 `chat_messages` 旧裸 threadId 行、未加 `search_history`；迁移语句里**零** `UPDATE`/`DELETE`/`RENAME`/`ALTER COLUMN`/`DROP COLUMN`（白名单只放四种形态）；M5 的 8 条 `INSERT` 目标只有 `feature_flags`（新表），不含任何业务表。

---

## 3. 新 DB 方法清单（判据④）

两驱动**公开面逐域全等**（`methods.spec.ts` 断言），判据④点名的方法在两驱动上都存在（同一用例）：

| 域 | 方法（新） | 语义要点 |
|---|---|---|
| `users` | `findCredentialsByPhone(phone)` / `findCredentialsById(id)` | **凭据视图**（M1 两列 + 存量 `password`）。刻意**不扩** `UserRow`，避免任何 `findByPhone` 返回值自带哈希 |
| `users` | `createWithPassword(phone, hash, policy, now)` | 一条事务建 `users`+`wordbooks`+`profiles` 三表；进 SQL 前 `assertPhone`/`assertPasswordHash` |
| `users` | `setPassword(uid, hash, policy, now)` | 改密三件事一起：写 hash + 推进 `password_changed_at` + 落 `pw_policy_version` |
| `users` | `activateIfEmpty(uid, hash, policy, now)` | **条件写**：`UPDATE … WHERE id = ? AND (password IS NULL OR trim(password)='')`，`changes===1` 者胜 = R-39⑤b 的"认领"，无读后写竞态；判空口径与 `EMPTY_PASSWORD_SQL` 同一真相 |
| `users` | `touchPasswordChanged(uid, now)` | 只推进 `password_changed_at`，**不碰** `password` |
| `wordbooks` | `getData(userId)` | 读整数组（存量形状不动） |
| `wordbooks` | `applyEntries(userId, data, now)` | §4.4.3 单一落库路径：集合未变 → 不 `++version`（幂等）；新词建 FSRS 卡（卡片 JSON 与既有 `saveData` 逐字相同，用例已断言） |
| `wordbooks` | `getSyncState(userId)` | `sync_version` + `tombstones` 原文；行不存在返回 `null` |
| `wordbooks` | `applySync(userId, data, tombstones, baseVersion, now)` | CAS：命中则写并 `++`；不命中返回 `stale` + **服务端当前 version**（409 载荷）；行不存在返回 `missing`（不抛、不建半行） |
| `snapshots` | `save` / `take` / `remove` | `take` 取最近一条并**消费**（同一条不重复撤销）；`prev_data` 原文入库，不解析不改写（ts-fsrs 4.7.1 红线，A-2） |
| `audit` | `append(entry, plaintext?)` / `listByUser(userId, limit)` | 写入前 `assertNoCredentialLeak`：bcrypt 指纹或明文密码出现在任一字段 → 拒写；`phone_masked` 只存后 4 位 |
| `flags` | `get(key)` / `set(key, value, now)` / `list()` | `set` 为 upsert；语义解释不在 DB 层（`@tm/shared/constants/flags` 才是真相） |
| 辅助 | `assertPhone` / `assertPasswordHash` / `assertNoCredentialLeak`、`EMPTY_PASSWORD_SQL`、`UserCredentialRow`、`WordbookSyncStateRow`、`ApplySyncResult` | `db/types.ts` 新增导出；`assertPhone` 收口 §6.2 漂移 1（pg `VARCHAR(11)` 截断 vs sqlite 不限长） |
| 聚合 | `createMigrationContext(app)` / `sqliteMigrationContext` / `pgMigrationContext` / `resetAppDB` | `db/index.ts` 新增，只暴露 DDL 需要的 6 件事；时间戳唯一来源 `Date.now()` |

**注意**：判据④写的 `users.findByPhone` 在 DB 层的落点是**新增的凭据视图方法** `findCredentialsByPhone/ById`；既有 `findByPhone` 一字未改（用例"既有方法行为不变"重测了 `findByPhone/findById/updatePassword/saveData/createUser`，特别是 `updatePassword` **仍不碰** `password_changed_at`）。

---

## 4. 完成判据①~⑤ 逐条证据

### 4.1 判据①：`ddl-parity` A 段差异 = 0

```
$ pnpm ddl-parity
$ node tools/ddl-parity.mjs
schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：users, wordbooks, profiles, checkin_logs,
fsrs_cards, tutor_cache, chat_messages, assessment_cache, analyst_cache, _migrations, review_snapshots,
account_audit_log, feature_flags
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B 段：AppDB 已存在，但两驱动集成用例需 @tm/server 的 test-only 装配（T-06 交付方法后接上）
C 段：AppDB 已存在，但两驱动集成用例需 @tm/server 的 test-only 装配（T-06 交付方法后接上）
exit code = 0
```
- **A 段口径一字未放宽**：比对项 = 列集合 / 归一化类型 / NOT NULL / 默认值 / 索引集合，由 `tables.ts` 生成 DDL 打到临时 sqlite 库后**反读**比对。本轮**没有改 `tools/ddl-parity.mjs` 的任何一行**（含比对口径、含 B/C 段的"待装配"提示）。
- A 段/pg 需要活库（本机 5432 `ECONNREFUSED`）→ **未执行**，脚本按 §6.2 自行 SKIP（不是绿、也不是红）。
- **包内等价物（真绿，见 §5.3）**：`migrations.spec.ts` 判据①组 = `SqliteAppDB.init()`（两驱动**内联基线 DDL**）→ 跑 000…006 → `diffSchemaAgainstDescriptor` 必须 0 差异 + 重跑幂等 + M5 种子不翻倍。这条用例是"驱动内联 DDL 与单一源不漂移"的**唯一**机器护栏（本轮才发现它此前根本没跑起来）。

### 4.2 判据②：M1/M4 只有 `ADD COLUMN … DEFAULT`，且 `grep -c "UPDATE users SET pw_policy_version" = 0`

```
$ grep -rn 'UPDATE users SET pw_policy_version' packages/server/src/db/migrations packages/server/src/scripts packages/server/src/db/*.ts | wc -l
0
```
全仓该字面量只出现在 3 处，且都不是生产语句：`tools/boundaries.mjs`（禁词规则本身）、`tools/fixtures/selftest/violations/migration-backfill/…`（T-02 的"故意违规"fixture）、`packages/server/test/db/migrations.spec.ts`（注释 + 该 grep 用例本身 + 断言器负向 fixture）。
机器断言另有两层：`assertMigrationDiscipline` 的**语句白名单**（只有建表/建索引/`ADD COLUMN DEFAULT`/新表幂等种子四种形态能过）+ `boundaries.mjs`：
```
OK   migration-forbidden        0 命中（扫描 16 个文件；例外豁免 0 处）
```
测试侧：`001/004 在两个驱动上都只产出 ALTER TABLE … ADD COLUMN … DEFAULT`、`M1/M4 的语句里没有 wordbooks.data / fsrs_cards 列` 均 ✓。

### 4.3 判据③：每个迁移有 `down()` 或 `noDownReason`（脚本断言）

```
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason     ← tools/boundaries.mjs
$ pnpm --filter @tm/server migrate        （静态自检，连库之前）
[Discipline] 0 违规（7 个迁移 × 2 驱动：白名单形态 + down/noDownReason + 无业务数据读写）
```
测试侧三条：`ALL_MIGRATIONS 覆盖 000…006 七格且按 name 字典序` ✓、`每个迁移恰好有 down 与 noDownReason 之一` ✓（本期只有 `002/003/005` 有 `down()`）、`断言器不是空转` ✓ —— **本轮修的正是最后这条**：原 fixture 的 `x02-business-read` 用的是一条**先被白名单挡下**的语句（`continue`），所以"读写业务数据表"那条规则**从未被触发**；`x05-out-of-order` 的名字实际是**字典序合法**的，所以"字典序"那条也从未被触发；`'x0-no-down'` 拼错（实现里是 `x00-`）。改法是把 fixture 改**严**（x02 换成"过白名单但 `SELECT … FROM users`"的种子形态；顺序 fixture 改名 `a05-out-of-order` 使其真的乱序；断言逐条点名 5 个 fixture + 5 类理由），不是放宽断言。

### 4.4 判据④：新 DB 方法齐 → 见 §3 清单

用例 `判据④点名的 20 个新方法在两驱动上都存在` ✓（19 条点名项 × 2 驱动，逐个 `typeof === 'function'`）+ `12 个域的方法名逐域全等` ✓。

### 4.5 判据⑤：在**已存在的 `data.db` 副本**上跑迁移，存量 `password` hash 逐行全等

**方法**（对应 PRD §6.4-2 步 6b①）：`cp data.db(+ -wal/ -shm) → tmp/t06/copy.db` → 只读导出 `SELECT id,phone,password FROM users ORDER BY id` 指纹 → `DB_DRIVER=sqlite SQLITE_PATH=<副本绝对路径> pnpm --filter @tm/server migrate` → 再只读导出一次 → 三层比对：① 逐行三元组 `JSON.stringify` 相等、② `id:password` 串接后的 **sha256 全等**（挡"顺序变了"）、③ 差异行数。

```
BEFORE rows=23 sha256(all password)= 4eb3261d67db3b241f254faa58b5674c977f2694873365e84d6c31dfd3860fd9
…（migrate 输出见 §5.1）…
[Apply] 本次应用 7 个迁移：000…, 001…, 002…, 003…, 004…, 005…, 006…
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===
rows before/after = 23 / 23
sha256 before = 4eb3261d67db3b241f254faa58b5674c977f2694873365e84d6c31dfd3860fd9
sha256 after  = 4eb3261d67db3b241f254faa58b5674c977f2694873365e84d6c31dfd3860fd9
逐行全等 = true         有差异的行 = 0        非空 hash 行数 = 7
users cols: id:INTEGER, phone:TEXT NN, created_at:INTEGER NN, password:TEXT D=NULL,
            password_changed_at:INTEGER NN D=0, pw_policy_version:INTEGER NN D=0
wordbooks cols: user_id, data, updated_at, sync_version, tombstones
_migrations: 000-migrations-table … 006-entry-updated-at-doc（7 条）
fsrs_cards rows: 55（迁移前后同值）
```
> **补一条同源证据（全部冒烟跑完后复核）**：仓库根 `data.db` 以 `readonly` 打开、同样算法导出的指纹
> = `4eb3261d67db3b241f254faa58b5674c977f2694873365e84d6c31dfd3860fd9` —— 与副本的 before/after **三者全等**，
> 且 `data.db` 的 mtime 仍是开工前的 `Sep 18 04:05`。即"副本 == 真库"与"真库未被动"同时成立。
> 临时目录 `tmp/t06/`（副本 + 指纹 JSON + 探针脚本）已全部删除，仓库里不留临时库。

> ⚠ 上述 23/7/55 是**本地 smoke-test 造数**，PRD §9-3 已判定不得进入任何面向用户或验收的结论；线上规模一律由 **T-21 步 4** 用 `account-audit.mjs` 在真实库实测 N/M/K/P/Q。本判据只断言"迁移前后逐行全等"，与行数多少无关。

同一判据在测试里也有一份可重跑的（`migrations.spec.ts` 判据⑤组，7 条用例全 ✓）：hash 三元组全等、**九张业务表行数一字不变**、`fsrs_cards` 序列化原文与 `updated_at` 一字未动、迁移后与单一源 0 差异且 000…006 全部记账、**存量行的两个新列全部是 DEFAULT 0（零回填的正面证据）**、副本上重跑 = 幂等。

---

## 5. 冒烟真实输出（未跑的一律写明）

### 5.1 `pnpm --filter @tm/server migrate`

**先说安全阀**：默认 `.env` 是 `DB_DRIVER=pg`、`SQLITE_PATH=`（空），不带 env 直接跑会走 pg 分支并因本机无 PG 失败；把 `SQLITE_PATH` 指到仓库根 `data.db` 时脚本**自己拒绝执行**（`拒绝执行：SQLITE_PATH 指向仓库内的真库文件…`）。因此本轮 CLI 冒烟**全部打在 `cp` 出来的临时副本上**，跑完已删除（§9）。

```
$ cp data.db tmp/t06/copy.db && cp data.db-wal tmp/t06/copy.db-wal && cp data.db-shm tmp/t06/copy.db-shm
$ DB_DRIVER=sqlite SQLITE_PATH="E:/CC/tomorrow-memory/tmp/t06/copy.db" pnpm --filter @tm/server migrate
=== 数据库迁移（T-06）===
[Discipline] 0 违规（7 个迁移 × 2 驱动：白名单形态 + down/noDownReason + 无业务数据读写）
[DB] driver=sqlite 目标=sqlite:E:\CC\tomorrow-memory\tmp\t06\copy.db
> 000-migrations-table … > 006-entry-updated-at-doc（逐条打印实际语句，见 §2/§4.5）
[Apply] 本次应用 7 个迁移：000-migrations-table, 001-credentials-columns, 002-review-snapshots,
        003-account-audit-log, 004-wordbook-sync-columns, 005-feature-flags, 006-entry-updated-at-doc
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===
exit code = 0
```
（本轮修复前，同一条命令的输出里还有一行 `=== FSRS 卡片初始化 ===` —— 即 §8-X-T06-1 的隐患证据。）

### 5.2 `pnpm ddl-parity` → 见 §4.1，exit 0，A 段/sqlite 0 差异；**A 段/pg 未执行**（本机 5432 `ECONNREFUSED`，未设 `DATABASE_URL_TEST`，脚本自行 SKIP 而非假绿）。

### 5.3 `pnpm --filter @tm/server test -- db` → **命令红，但原因不在 T-06**

```
$ pnpm --filter @tm/server test -- db
$ vitest run --root ../.. --project @tm/server "--" "db"
 RUN  v3.2.7 E:/CC/tomorrow-memory
No test files found, exiting with code 1
projects: @tm/server
include: test/**/*.spec.{ts,tsx}, src/**/*.spec.{ts,tsx}
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] … Exit status 1
```
`pnpm --filter @tm/server test`（不带参数）同样 0 发现 → 根因是 T-01 写在 `packages/server/package.json` 的 `test: vitest run --root ../.. --project @tm/server`：`--root` 会把 workspace 里各 project 的 `test/**/*.spec.ts` 相对**仓库根**解析，而不是相对 `packages/server`。脚本文件本身（`packages/server/test/db/migrations.spec.ts`、`methods.spec.ts`）是存在的。**修这个要改 `packages/server/package.json`（T-01 所有，且 `test` 脚本被 6 个包共用）→ 已按 §8-X-T06-2 提越界申请，我没有自行动手。**

**等价命令（仓库根执行，不改任何配置）为全绿**：
```
$ npx vitest run --project @tm/server db
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 68ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 74ms
 Test Files  2 passed (2)
      Tests  50 passed (50)
exit code = 0
```
本轮修前：`6 failed | 41 passed | 3 skipped` + 2 个 unhandled rejection（`init-fsrs.ts:89 process.exit` 被 vitest 打红）。修复项：
1. `migrate.ts` 静态 import → 动态 import（消除测试期 `process.exit(1)`，同时消除 §8-X-T06-1 的生产隐患）；
2. `migrations.spec.ts` 判据①组补 `SqliteAppDB.init()`（此前 beforeAll 直接抛 `no such table: users`，3 条用例**从未真正执行**）；
3. `migrations.spec.ts` 判据③负向 fixture 修正（§4.3）；
4. `sqlite.ts` 5 个新增方法加 `async`（`findCredentialsByPhone/setPassword/activateIfEmpty/createWithPassword/audit.append`）：此前 sqlite 侧的 `assertPhone/assertPasswordHash/assertNoCredentialLeak` 是**同步 throw**，pg 侧是**reject** —— 这是一处真实的双驱动行为分叉（调用方 `promise.catch()` 路径两侧不同），修成两侧都 reject；方法体一字未动。
5. `methods.spec.ts` 两处断言口径修正（**未放宽**）：① `assertPhone('123456789012')`（12 位）此前被写成 `.not.toThrow()`，实为 §6.2 漂移 1 要拦的情形 → 改为 `.toThrow()`；② "12 个域方法集合全等"与"AppDB 聚合面全等"此前把**两驱动各自的私有 helper**（sqlite `ensureNewCards` / pg `insertNewCards`+`writeWordbook`）和**各自的底层句柄字段**（sqlite `.db` / pg `.pool`，T-06 之前就存在且被 `--copy-legacy` 依赖）算进了公开面 → 改为"公开面逐域全等 + helper 名单显式登记且必须存在"，并显式断言两个句柄都在。登记见 §10-遗留 3。

### 5.4 其它已跑的门禁（批次1 出口口径）

```
$ pnpm --filter @tm/shared --filter @tm/server typecheck      → 两个 Done（exit 0）
$ pnpm depcruise                                             → ✔ no dependency violations found (246 modules, 478 dependencies cruised)
$ node tools/boundaries.mjs                                  → 16/19 通过，3 条红（均非 T-06）
   RED copy-legacy-zero      packages/ui/src/hooks/use-recent-searches.ts:5        ← T-04/T-20 面
   RED colors-no-hardcode    packages/ui/test/ui.spec.tsx:249                      ← T-05 面
   RED route-string-preserved /api/auth/login, /api/auth/register                  ← A-12 待接线 + T-12/15/16
$ pnpm test                （仓库根，全量）→ Test Files 1 failed | 3 passed (4)
   FAIL @tm/shared test/contracts.spec.ts > 判据③ > 门禁禁词在 shared 全部产出里 0 命中   ← T-03/A-11 在途，非本任务
```
> A-5 的"`pnpm test` 在 T-03/T-06 交付后必须转绿"：**T-06 侧的 50 条已全绿**；仍红的 1 条在 `@tm/shared/test/contracts.spec.ts`（T-03 + A-11 改文案那条），请 TPM 按 A-11 的口径核对是否已被 T-03 的修复轮次覆盖。

---

## 6. `tools/ddl-parity.mjs` 的时序交接登记（§10.4 格式）

**结论：本轮对 `tools/ddl-parity.mjs` 的 diff = 0 行。** 该脚本 T-02 交付时按 §6.2 第 1 步写的是**约定路径装载**（`export const SCHEMA_SOURCE = 'packages/shared/src/schema/tables.ts'` + `loadSchemaSource()`：文件不存在 → 打印"待 T-06 提供 schema 源"并 exit 2；存在 → `import()` 并校验导出形状）。T-06 把 `tables.ts` 落在约定路径且导出 `export const tables: TableDescriptor[]` 之后，**接线由"文件出现"这一事件自动完成**，无需也不应改动 T-02 的收口件。已核 `mtime`：`tools/ddl-parity.mjs` = 09-19 12:48，早于 `tables.ts`（14:34），即上一轮 T-06 agent 也**没有**碰过它。

| 文件 | 先动（批次/任务 + 允许的改动幅度） | 后动（批次/任务 + 允许的改动幅度） | 为什么无法避免 | 越界判据 |
|---|---|---|---|---|
| `tools/ddl-parity.mjs` | 批次1 **T-02**（已收口）：建脚本 + 预留 `SCHEMA_SOURCE` 约定路径；缺文件时 exit 2 且**声明"待 T-06 提供 schema 源"** | 批次1 **T-06**：**零 diff**（只在 `packages/shared/src/schema/tables.ts` 落单一源，并按 T-02 声明的形状导出 `tables`）。若 T-06 需要脚本改口径 → 必须回到 §10.4 重新登记，不许现场改 | 门禁脚本与被检代码不能由同一任务同时定稿；T-02 用"缺源即 exit 2"把等待变成显式红，T-06 交付即自动接通 | T-06 对 `tools/**` 零 diff（本报告的实测：`tools/` 目录 mtime 全部早于 `tables.ts`，且本轮未执行任何写该目录的命令）；反向判据：**归不了零就是红**，本轮 A 段差异=0 是在**未放宽任何比对项**的前提下取得的 |

---

## 7. 数据红线自证

| 红线 | 自证 |
|---|---|
| 绝不在仓库根 `data.db` / `packages/server/data.db` 上跑迁移 | 只读过（`{readonly:true}`）。三次跑 `migrate` 全部打在 `tmp/t06/copy.db`。全部冒烟跑完后 `ls -la data.db*` = `253952 / Sep 18 04:05`、`424392 / Sep 18 04:09`、`32768 / Sep 17 00:53` —— **与本任务开工前逐字节同 mtime**，未被写。`assertSafeTarget()` 另有机器拒绝（测试里 3 条用例覆盖：根 `data.db` 拒、`packages/server/data.db` 拒、副本放行 + `--i-know-this-is-prod` 才放行且日志标注） |
| 不改既有列名/类型、不动 `fsrs_cards.data` | `db/{sqlite,pg,types}.ts` 的 `git diff -U0 HEAD` **无 `-` 行**；副本迁移前后 `fsrs_cards` 的 `fsrs_data` 原文与 `updated_at` 逐行全等（用例 ✓）；`ts-fsrs` 仍钉 **4.7.1**、`pnpm-workspace.yaml` 未动（A-2） |
| 迁移里不读写业务数据、不做回填 UPDATE | 白名单四形态 + `BUSINESS_TABLES_IN_STATEMENT` 规则；M5 种子只写新表；`--copy-legacy/--init-fsrs/--verify-data` 全部在显式开关后面，默认路径不触发（本轮 §8-X-T06-1 的修复正是把这条做实） |
| 不把本地造数数量写进结论 | §4.5 已标注 23/7/55 为 smoke-test 造数，规模口径一律指向 T-21 步 4 |
| 临时文件 | `tmp/t06/`（副本 + 指纹 JSON + 探针脚本）本轮末已删除 |

---

## 8. 越界申请（不自行动手，等裁决）

**X-T06-1｜`packages/server/src/scripts/init-fsrs.ts` 顶层无护栏 `main()`（数据安全隐患，建议 T-06 一并修但按边界不许我改）**
`init-fsrs.ts:83-91` 是裸的 `main().catch(err => { console.error(…); process.exit(1); })`。任何 `import { initFsrsCards } from './init-fsrs.js'` 都会**立刻以当时的 `loadConfig()` 结果真跑一次 FSRS 卡片初始化（写库）**。上一轮 T-06 把这句 import 放在了 `migrate.ts` 顶部 → 后果：`pnpm --filter @tm/server migrate` 的**默认路径**会连带向"默认 config 指向的库"写卡片；未设 `SQLITE_PATH` 时那个默认值就是**仓库根 `data.db`**（`.env` 里 `SQLITE_PATH=` 空 → 回落 `DATA_DIR/data.db`），在 CI/预发设了 `DATABASE_URL` 的机器上则是**线上 PG**。
本轮我已在**自己文件内**消掉这条链（`migrate.ts` 改为 `--init-fsrs` 分支里 `await import()`），默认路径与 `--status/--dry-run` 都碰不到它。但根因仍在 `init-fsrs.ts`：
① 请允许给它加 `migrate.ts` 已有的 `invokedDirectly()` 护栏（1 处、约 6 行，无行为变化）；
② 未加护栏前，`pnpm --filter @tm/server migrate -- --init-fsrs` 会**跑两遍**初始化（import 触发的 main + 我们的显式调用），幂等但重复写；`init-fsrs` 的归属不在 §10.2 T-06 清单里（ownership.json 也无条目）→ 请 TPM 定 owner。

**X-T06-2｜`packages/server/package.json` 的 `test` 脚本（T-01 所有）**
`vitest run --root ../.. --project @tm/server` 使 `--project` 的 include 相对仓库根解析 → **该包任何用例都无法被发现**（`No test files found`），于是 §10.2 T-06 冒烟第 3 条、以及 T-07/T-09/T-10/T-11 的 `pnpm --filter @tm/server test -- …` **全部不可能绿**。建议修法（任一）：`test: vitest run --project @tm/server`（在仓库根 workspace 下跑）、或给该 project 的 include 写 `packages/server/test/**/*.spec.ts`。同一处缺陷对 `@tm/shared` 不存在（shared 的 `test` 是 `vitest run`，能跑），所以只影响带 `--root ../..` 的包。请派给 T-01；**批次1 出口前必须修**，否则 T-07~T-11 的冒烟口径会集体失真。

**X-T06-3｜`packages/shared/package.json` 的 `./schema` 导出（已在盘上，请确认归属合法）**
`migrate.ts` / `db/migrations/index.ts` 通过 `@tm/shared/schema` 消费单一源（§10.3 明写"T-06 的 `schema/**` 通过 `@tm/shared/schema` 二级路径消费，不经 index.ts"），故 `"./schema": "./src/schema/tables.ts"` 这条 exports 是 T-06 的必要前置。该文件不在我的可写清单，盘上已有 → 请 TPM 确认它由 T-01/T-03 合法添加并冻结，避免后续任务再改二级出口。

---

## 9. 契约偏差与"未执行"清单（如实）

1. **pg 运行时面：未执行**。本机无 PG 实例（127.0.0.1:5432 `ECONNREFUSED`），`.env` 的 `DATABASE_URL` 指向不存在的库。因此以下三项本轮**只有静态证据**：① `ddl-parity` A 段/pg；② `diffSchemaAgainstDescriptor` 的 pg 分支；③ 判据④的 pg 方法运行时行为。缓解（已做实）：pg 的 `statements('pg')` 过**同一套**白名单与纪律断言（扫描面=执行面）、两驱动**公开方法集合逐域全等**、pg DDL 与 sqlite DDL 由**同一份描述**（`tableDdlFor/columnDdl/createTableDdl`）生成。补齐入口 = T-22 CI 起 PG service container 后同两个 describe 换驱动跑。
2. **`--verify-data`（M6 dry-parse）未在真副本上执行**：它读 `wordbooks.data`（属"只读核对"，不写），本轮没跑是为了把副本演练严格限定在"默认路径"。命令已可用：`DB_DRIVER=sqlite SQLITE_PATH=<副本> pnpm --filter @tm/server migrate -- --verify-data`。建议测试/T-21 步 6b 顺带跑一次（本地副本 23 行 / 55 卡，秒级）。
3. **`--rollback` 未执行**：`--rollback` 需 `--allow-rollback`，且 M2/M3/M5 的 `down()` 注记写明**生产窗口禁执行**。本轮按边界只做了"每个迁移有 down 或 noDownReason"的静态断言，没有真的 drop 过任何表。演练归属 = T-21 步 7（在临时实例上）。
4. **两驱动 `init()` 的基线建表 DDL 仍是各自内联字面量**（`sqlite.ts:50`、`pg.ts:79`，HEAD 原样），尚未由 `tables.ts` 生成。原因：改 `init()` = 改既有方法体，直接违反 §10.2 T-06 的风险缓解条款（"既有方法体一字不改"）。漂移风险已由 §4.1 那条"init → migrate → 反读 0 差异"的用例堵住（sqlite 侧真跑；pg 侧待 CI）。是否本期做"基线 DDL 外移"请 TPM 裁决，建议列 P2（与 §11 F-3 ORM 化同批）。
5. **`ddl-parity` 直接 `import()` 一个 `.ts` 文件**，依赖 Node ≥22.18 的默认类型剥离（本机 22.20 可跑；CI `node-version: 22` 可跑；但根 `package.json` 的 `engines.node` 写的是 `>=20`）。若哪天在 Node 20 上跑会 `ERR_UNKNOWN_FILE_EXTENSION`。要么把 `engines` 抬到 `>=22.18`（T-01 所有），要么让脚本经 `tsx` 装载 —— 两者都在别人边界内，仅登记。

---

## 10. 已知限制与 TODO

1. 步 6b 的 ③~⑧（upgrade token、四类账号、零掉线、Q 口径对账）**不在 T-06 面**：T-06 只交付列与读写的**落点**（①②已实证），被验逻辑归 T-07、演练脚本归 T-21。
2. `ddl-parity` 的 **B 段（行为对账）与 C 段（长度语义对账）仍是 deferred**：`activateUser/changePassword` 语义在 service 层（T-07），B 段还要求 `@tm/server` 有 test-only 的双驱动装配。fixtures（`tools/fixtures/schema-fixtures.json`）已就绪。**不要在 T-06 里把 B/C 假装接上** —— 需要 T-07 之后由 T-02/T-22 编排。
3. `methods.spec.ts` 里的 `PRIVATE_HELPERS` 名单（sqlite `ensureNewCards`；pg `insertNewCards`/`writeWordbook`）是一处**显式登记的实现差异**。若后续任务在两驱动里加私有 helper，必须同步这张表，否则对应用例会自动打红（设计如此）。
4. 迁移**不含**任何"旧镜像读到多余列"的风险处置：旧镜像 `SELECT *` 容忍（`UserRow` 接口键多余无害），已由 M1/M4 的 `noDownReason` 文字与 PRD §6.4-2 步 7 覆盖，T-21 的 `restore-drill.mjs --rollback` 才真验。
5. `--copy-legacy` 的历史实现里 `readLegacySqlite()` 在 `readonly` 连接上做 `pragma journal_mode=WAL` + `wal_checkpoint(TRUNCATE)`（**HEAD 原有，非 T-06 引入**），在某些 sqlite 构建上会抛；它不在默认路径，本轮没动。若哪天要用它搬数据，建议单独立项复核。

---

## 11. 给测试的提示（重点测哪里 / 哪些路径我没测到）

- **必查**：`pnpm --filter @tm/server test -- db` 在 X-T06-2 修好之前一定是红的（`No test files found`），**那不是 T-06 的缺陷**；用 §5.3 的等价命令复跑 50 条。
- **真库零写入**：任何人复跑判据⑤时请先 `cp data.db` 到临时文件并**用绝对路径**给 `SQLITE_PATH`（相对路径会相对 `packages/server` 解析 —— 本轮踩过，报的是"directory does not exist"，不会误伤真库，但会浪费一次排查）。
- **没测到的路径**：pg 侧全部运行时行为（§9-1）、`--rollback`（§9-3）、`--verify-data`（§9-2）、`--copy-legacy`（§10-5）、以及 M5 种子在 pg 上的 `ON CONFLICT (key) DO NOTHING` 幂等。请 T-22 起 PG 后第一批覆盖。
- **给 T-07 的接口约束**：判空口径只能用 `EMPTY_PASSWORD_SQL`（`password IS NULL OR trim(password)=''`，两侧同一常量），激活只能走 `activateIfEmpty`（条件写、返回 `boolean`，不要"读—判—写"），改密只能走 `setPassword`（三件事一次做齐），审计只能走 `audit.append(entry, plaintext?)`（它会主动拒写泄漏，别绕过它自己 INSERT）。`flags` 只给"存/取"，语义解释在 `@tm/shared/constants/flags`。
- **给 T-09 的接口约束**：`wordbooks.data` 的整数组顺序与形状一字未动；增量走 `applySync`（CAS：`stale` 时返回体里已带服务端最新 `sync_version`，直接用作 409 载荷），`sync_version=0` 一律按"全量首同步"处理；墓碑在 `tombstones` 列（TEXT，`'[]'` 默认）。
- **给 T-21 的接口约束**：步 4 的 N/M/K/P/Q 与"每人五类计数"请直接读 `tables.ts` 的 `BUSINESS_TABLES`/`CREDENTIAL_COLUMNS`/`WORDBOOK_SYNC_COLUMNS` 常量生成 SQL 口径，不要再抄一份列清单（`findTable()` 已可用）；sqlite/pg 的 `json_array_length` vs `jsonb_array_length` 方言需各写一份（§6.2 漂移 2）。
