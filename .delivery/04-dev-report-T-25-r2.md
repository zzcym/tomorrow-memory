# 开发报告 · T-25 第 2 轮（接力轮）— 后端

任务：T-25（`assessment_cache` 补 `user_id` + 读路径属主过滤，R-41 全条）第 2 轮
本轮性质：第 1 轮（R-41）实现主体已落盘，本轮**只做两件事**——
①在 `packages/server/test/db/migrations.spec.ts` 就地追加 §10.2 T-25 判据①② 的用例；
②跑出口命令并把第 1 轮实现的自检结论按判据①-⑩逐条落到本报告。
取证口径：`.delivery/02-tech-design.md:919`（§10.2 T-25 行判据①-⑩）与 `:980`（§10.4 第 9 行①-⑤），
均以 `grep -n "T-25"` 定位后**只读该行区间**，未整篇通读该文件与 PRD/UI 规范。

---

## 1. 完成清单

| 项 | 状态 | 文件 | 备注 |
| --- | --- | --- | --- |
| T-25 第 2 轮（判据①②用例） | done | `packages/server/test/db/migrations.spec.ts` | **本轮唯一改动文件**（463 行 → 821 行） |
| 第 1 轮已落盘实现（DDL/db/trpc/前端） | 未触碰 | 见 §3 自检 | 按要求一字未改，只做对照自检 |

### 1.1 具体加了哪几条用例（全部为追加，无一条既有断言被改/删/放宽）

**(a) 注册表扩容**（:130）——`ALL_MIGRATIONS 覆盖 000…006 七格` → `000…007 八格`，数组追加
`'007-assessment-cache-user-id'`。`toEqual` 精确比对与"按 name 字典序"语义原样保留（这是扩容不是放宽：
数组若少一格或多一格都会红）。

**(b) 判据①：M1-M6 语句数组逐字节快照**（:457-632，`describe('T-25 判据①…')`，2 条用例）
- `快照对象正好是 000-006 六格；本期新增的只有 007` —— 钉住快照的覆盖面，防"新迁移静默并进快照"把断言掏空。
- `000-006 的两驱动语句数组与快照逐字节全等（§10.4 第 9 行①「000-006 零 diff」）` ——
  快照 = `MIGRATIONS_000_006_BYTE_SNAPSHOT`（:476，`String.raw` 承载的 5420 字符 JSON，
  `name → driver → 语句顺序`全量原文，用 `JSON.stringify(…, null, 2)` 比 **`toBe`**，
  差一个空白/类型词/种子顺序即红）。生成口径：`m.statements(driver)` **不传 ctx**（M5 的
  `updated_at` 恒落 0 占位 ⇒ 确定性）。对应 §10.2 T-25 判据① "把六条迁移的语句序列化成稳定快照比对"。
- `assertMigrationDiscipline()` 对全量迁移（含 007）仍 0 违规 = 该文件既有 :211 那条用例，
  它遍历 `ALL_MIGRATIONS`，注册表扩容后自动把 007 纳入 —— 未新增、未修改。

**(c) 判据②**（:634-712 静态面 + :714-818 运行时面，共 6 条用例）
静态面 `describe('T-25 判据②：007 只 1 条 ADD COLUMN…')`：
- `语句数组长度 = 1（两驱动同形），且就是那条 ADD COLUMN … DEFAULT NULL` ——
  `length === 1` + 正则靶 `assessment_cache` / `user_id` + `DEFAULT NULL` 字面量必须真写出（判据⑤的字面量要求）
  + 语句体内 `UPDATE|DELETE|INSERT|SELECT|CREATE INDEX` 0 命中 + `down` 省略、`noDownReason` 非空。
- `BUSINESS_TABLES_IN_STATEMENT（真源正则）对 007 的每一条语句 0 命中` ——
  正则**不抄第二份**：`businessTablesInStatement()`（:643）在运行时从
  `packages/server/src/db/migrations/index.ts:101` 反读该常量的字面量并 `new RegExp` 复用它；
  取不到即抛（断言失去对象=红）。同一用例内带正向对照（指向 `assessment_cache` 的
  `INSERT…SELECT` / `UPDATE` 必须命中），证明 0 命中不是空转。

运行时面 `describe('T-25 判据②（运行时面）…')`（:714，手法照抄本文件 :359 既有那条：只写临时副本）：
- `副本就绪，且迁移前 assessment_cache 确实还没有 user_id 列`（:766） ——
  `data.db` → `os.tmpdir()/tm-t06-<pid>/t25-m7-copy.db`；先在副本上补齐 000-006
  （`apply({ to: '006-entry-updated-at-doc' })`），再**单独**执行 007，
  这样"迁移前 vs 迁移后"的差异只可能来自 007；断言 `appliedM7 === ['007-…']`（真执行、非幂等跳过的空跑）。
  真库全程未被打开写句柄。
- `迁移前后 COUNT(*) / SUM(id) / 既有 4 列逐行 sha256 完全一致（零回填的正面证据）`（:776） ——
  `assessFingerprint()`（:659）只读既有 5 列，逐行对 `word/qtype/question/created_at` 做 sha256。
- `迁移后 user_id 列存在且可空；NULL 行数 == 迁移前行数`（:784） —— 含 `ownedRows === 0`、
  `nullRows + ownedRows === 迁移后总数`、`_migrations` 里 007 恰 1 条记账（全表 NULL = 预期结果，用例名里写明"不是缺陷"）。
- `旧镜像口径：不 SELECT user_id 的既有查询在迁移后的库上照样可执行`（:793） —— 判据⑩的出口面（只读句柄）。

**(d) grep 证据用例**（:584，仿本文件 :95 那条既有用例的风格）
`迁移目录内 DROP COLUMN / DROP TABLE / ALTER COLUMN / RENAME 的命中面`：扫描面 =
`packages/server/src/db/migrations/**` 的非注释代码行（与 CI `tools/boundaries.mjs:635 migration-forbidden`
同口径）。三层断言：① `DROP COLUMN`/`ALTER COLUMN`/`RENAME` 严格 0 命中；② 007 自己连注释面也 0 命中四类禁词；
③ `DROP TABLE` 的命中面被精确钉死为 3 处、且必须是 M2/M3/M5 各自 `down()` 里
`await ctx.exec('DROP TABLE IF EXISTS <自己新建的那张表>')`（详见 §4-③，DoD 字面口径与既有实现冲突）。

---

## 2. 出口命令与真实输出尾部

原始输出全量存于 `%TEMP%/t25r2/exit.md`（= `C:\Users\曹怡明\AppData\Local\Temp\t25r2\exit.md`），下面照抄尾部。

| # | 命令 | 真实输出尾部（照抄） |
| --- | --- | --- |
| 1 | `pnpm --filter @tm/server test -- migrations` | ` Test Files  16 passed (16)`<br>`      Tests  389 passed (389)`<br>`   Start at  12:41:53`<br>`   Duration  16.86s (transform 3.52s, setup 0ms, collect 24.99s, tests 32.56s, environment 4ms, prepare 3.31s)`<br>`EXIT=0`<br>**如实记录**：位置参数 `migrations` 没有起到过滤作用（vitest 仍按 `--project @tm/server` 全量跑了 16 个文件），所以第 1 条与第 2 条输出同源；单文件证据见 1c。 |
| 1b | `pnpm --filter @tm/server typecheck`（自查，非清单项） | `$ tsc -p tsconfig.json --noEmit`<br>`TYPECHECK_EXIT=0` |
| 1c | `npx vitest run --root ../.. --project @tm/server test/db/migrations.spec.ts test/integration/assessment-isolation.spec.ts` | ` ✓  @tm/server  test/db/migrations.spec.ts (34 tests) 107ms`<br>` ✓  @tm/server  test/integration/assessment-isolation.spec.ts (16 tests) 109ms`<br>` Test Files  2 passed (2)`<br>`      Tests  50 passed (50)` |
| 2 | `pnpm --filter @tm/server test`（全套） | ` Test Files  16 passed (16)`<br>`      Tests  389 passed (389)`<br>`   Start at  12:42:31`<br>`   Duration  15.18s (transform 2.60s, setup 0ms, collect 21.06s, tests 28.26s, environment 4ms, prepare 3.10s)`<br>`EXIT=0`<br>**0 failed**（TPM 实测的 371 passed/1 failed 已收口；`migrations.spec.ts` 自身 25 → **34 条**，+9 全来自本轮）。全套 372 → 389 的其余增量来自并行 agent 的新增用例（见 §4-⑥ 并发免责）。 |
| 3 | `pnpm ddl-parity` | `schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：… assessment_cache, analyst_cache, _migrations, review_snapshots, account_audit_log, feature_flags`<br>`A 段/sqlite：0 处差异`<br>`A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）`<br>`B 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP`<br>`C 段/pg：SKIP —— 同上`<br>`EXIT=0` |
| 4 | `git diff --numstat -- packages/server/test/db/migrations.spec.ts` | **输出为空**，`GIT_EXIT=0`。原因（照抄 `git status --porcelain`）：<br>`?? packages/server/test/db/migrations.spec.ts`<br>该文件在仓库里是**未跟踪**状态（`git ls-files` 空），`git diff` 对未跟踪文件天然无输出 —— 不是"没改动"。改动量用行数佐证：463 → 821（净 +358），全部为追加；唯一被改的既有块是 :130 那条注册表用例（标题字 + 数组 1 行）。未执行任何 git 写操作。 |

---

## 3. 第 1 轮已落盘实现的自检（§10.2 T-25 判据①-⑩，一行一条）

| 判据 | 结论 | 证据（文件:行） |
| --- | --- | --- |
| ① M1-M6 只加不删（语句数组逐字节 + 0 违规 + grep 四类禁词） | **达成（本轮补齐）** | `migrations.spec.ts:476`（快照常量）、`:573`（`toBe` 全等）、`:584`（grep 面）；0 违规 = 既有 `migrations.spec.ts:211`。注：000-006 六个迁移文件本轮**未被本 agent 写入**（工具侧只改 `migrations.spec.ts`），但"零 diff"无法用 git 佐证 —— 该目录整体是未跟踪状态（`git status --porcelain -- packages/server/src/db/migrations` → `??`），故改由上面的字节快照在断言层面钉死 |
| ② 007 长度=1 + `BUSINESS_TABLES_IN_STATEMENT` 0 命中 + 副本前后 COUNT/SUM/4 列 hash 全等 + 全表 NULL | **达成（本轮补齐）** | `migrations.spec.ts:683`（长度/DEFAULT NULL 字面量）、`:701`（真源正则 0 命中 + 正向对照）、`:766`（副本对照前提）、`:776`（hash 全等）、`:784`（NULL 行数 == 迁移前行数）；实现侧 `migrations/007-assessment-cache-user-id.ts:40` |
| ③ 旧行 `user_id IS NULL` 一律拒读、不猜属主、不当公共池 | **达成（第 1 轮）** | 读路径 `db/sqlite.ts:691`（`… AND user_id = ?`）、`db/pg.ts:719`；用例 `test/integration/assessment-isolation.spec.ts:306`（无主题面谁都读不到）、`:327`（"公共池捷径"反例）、`:379`（无主题行提交给同一个 403） |
| ④ 他人属主拒读 + `userId` 只取会话凭据（`input` 里的 userId 无效）+ `set` 的 `DO UPDATE` 改写行属主 | **达成（第 1 轮）** | `db/types.ts:351/353`（`getOwned/setOwned` 签名带 `userId`）、`trpc/routers/assessment.ts:64/73/87`（属主只来自 `ctx.userId`）、`db/sqlite.ts:699`、`db/pg.ts:731-732`（`user_id = excluded.user_id`）；用例 `assessment-isolation.spec.ts:255/270/288`（双用户 × 双驱动、塞 `userId/ownerId` 被 strip） |
| ⑤ `DEFAULT NULL` 字面量真的出现在语句里 + M1/M4 生成语句一字未变 | **达成** | `shared/src/schema/tables.ts:354`（`user_id` 描述）+ `columnDdl()` 的 `opts.explicitDefaultNull`；语句实证 = 本轮 `migrations.spec.ts:692` 的 `/\bDEFAULT\s+NULL\b/`；一字未变 = 快照 `:476`（覆盖面比"只 M1/M4"更宽，含全部 000-006） |
| ⑥ 双驱动对等 + 两条建库路径一致 + `migrate --status` 只列 007 | **sqlite 面达成；pg 面本机未执行（如实记录）** | `ddl-parity` A 段/sqlite 0 差异、EXIT=0；两驱动语句同形 = `migrations.spec.ts:683` 的循环；pg 运行时面需活库 → `assessment-isolation.spec.ts:230` 显式 SKIP（CI/T-22 补）。"旧库 ALTER 后 vs 全新库 CREATE 后反读一致"目前**只在 ALTER 路径上有证据**（本轮副本用例 + 既有 :271 全新库 init+migrate 的 0 差异），因为 `sqlite.ts:112`/`pg.ts:146` 的建表 DDL **未补该列** → 见 §4-②。`migrate --status` 无专用例，等价证据 = 本轮 `:766`（000-006 已记账后待执行集恰为 007） |
| ⑦ 错误语义：`generate` 未命中正常出题、`submit` 未命中 403 `FORBIDDEN`（非 500）且经 `errorFormatter` 带得出 code；前端命中 code 走重新出题 | **达成（第 1 轮）** | `trpc/routers/assessment.ts:91-100`（`FORBIDDEN` + `errorMessage('FORBIDDEN')` + `supplementErrorStatus`）；用例 `assessment-isolation.spec.ts:348`（caller 面）、`:363`（线上面 403、不冒 500）、`:389`（generate 200）；前端 `apps/web/src/app/(user)/assess/page.tsx:103-113`。**前端本轮只读、未运行 e2e** |
| ⑧ 不做 REST 门面 / 不做 App 侧 | **达成** | 本轮实测 `grep -in "assess" packages/server/src/app.ts packages/server/src/routes/*.ts` → **0 命中**（与本期前现状一致）；用例面 `assessment-isolation.spec.ts:493/499/505` |
| ⑨ trpc 形状只增不改 + 基线覆盖自证 | **达成（未动 baseline）** | 基线比对由 `packages/server/test/trpc-shape.spec.ts` 承担（全套 389 passed 含它，`trpc-shape.baseline.json` 本轮零改动）；出参盲区（§11 F-7）由 `assessment-isolation.spec.ts:441/455` 的"返回键集合等值"用例自证 |
| ⑩ 回滚前提：旧镜像（不读 `user_id`）连新 schema 仍可出题判分 | **达成（出口侧先行）** | 手工构造不含该列的 SELECT 仍可执行：`assessment-isolation.spec.ts:398` + 本轮 `migrations.spec.ts:793`；完整 `--rollback` 演练归 T-21 步 7（未在本轮范围） |

---

## 4. 待 TPM 拍板（本轮一律未自行动手）

1. **`AssessmentDB` 的方法数从 3 变 4**：实现走的是**新增** `getOwned/setOwned`，并**保留**了无属主的
   `get/set`（`db/sqlite.ts:661/679`、`db/pg.ts:692/709`）。
   与 §10.4 第 9 行③"`db/**` 中除 `AssessmentDB` **三处**方法外零 diff"、以及与 TPM 交接说明里
   "`AssessmentDB.get/set` 已带 `userId`"的表述都不完全一致。现状的后果是被
   `assessment-isolation.spec.ts:499` 钉成"`src/**` 里 `db.assessment.get(/set(` 0 调用点（只有测试在用）"——
   安全上成立，但"遗留面还在"。**请裁决**：本期保留遗留 `get/set`（现状），还是删到只剩 `getOwned/setOwned`
   （删它属"改签名面二次扩权"，需登记）。
2. **建表 DDL 未补列（判据⑥的 DoD 字面项未做）**：`packages/server/src/db/sqlite.ts:112` 与
   `packages/server/src/db/pg.ts:146` 的 `CREATE TABLE IF NOT EXISTS assessment_cache` 仍只有 5 列，
   `user_id` 完全依赖 007 的 `ALTER` 落地。§10.2 T-25 允许改动面明文要求"建表面同步补该列"。
   今天不红的机理是：`AppDB.init()` 之后一定跟一次 `migrate`（既有 :270 全新库用例即此序），所以反读 0 差异。
   **风险**：任何"只 init 不 migrate"的库（例：只读副本演练、旧镜像回滚窗口内的新库）里
   `getOwned` 的 `… AND user_id = ?` 会直接 `no such column` 抛错。改它 = 动 `db/{sqlite,pg}.ts` 的建表块，
   越出本轮"只改一个测试文件"的授权，故未动，请派工。
3. **判据① grep 口径与既有实现冲突（本轮按"精确钉死"落地，请确认口径）**：DoD 写的是
   "目录内 `DROP COLUMN`/`DROP TABLE`/`ALTER COLUMN`/`RENAME` 0 命中"，但 `002/003/005` 三个文件的
   `down()` 各自写着 `DROP TABLE IF EXISTS <自己的新表>`（实测行号：`002-review-snapshots.ts:22`、
   `003-account-audit-log.ts:23`、`005-feature-flags.ts:42`），先于 T-25 存在、且被 §10.4 第 9 行① 钉成零 diff。
   字面执行会立刻红。本轮的落地：`DROP COLUMN`/`ALTER COLUMN`/`RENAME` 严格 0 命中 + `DROP TABLE`
   命中面钉死为"这 3 个文件、`await ctx.exec(` 开头、删的表名 == 该迁移自己新建的表"三件套，
   另加"007 自身四类禁词连注释都 0 命中"。**若 QA 要求按字面 0 命中，则需要先裁 `down()` 的存废。**
   （CI 侧 `tools/boundaries.mjs:188` 的禁词表本来就不是裸 `DROP TABLE`，而是 `DROP TABLE … users`，可佐证。）
4. **两条陈旧用例标题（数字过时，断言本身动态正确、仍绿）**：`migrations.spec.ts:302`
   "清单仍是 7 条"、`:431` "000…006 全部记账"。两者断言写的是 `ALL_MIGRATIONS.map(...)`，注册表扩容后
   实际比的是 8 格 —— **标题与实际语义不符但门禁未放宽**。按硬约束"不得改既有断言"，标题也不属本轮授权，未动。
   请裁决是否开一条"仅改字符串"的微轮（各 1 行）。
5. **运行时面用例的对照前提绑在 `data.db` 现状上**：本轮断言"迁移前 `assessment_cache` 没有 `user_id`"，
   实测依据 = `data.db` 里该表只有 5 列、`_migrations` 表**不存在**、`assessment_cache` 3 行
   （`SUM(id)=6`）。若任何人在本用例之后对仓库根 `data.db` 真跑了 `pnpm db:migrate`，该前提失效 → 用例会红
   （用例名里已把"对照前提"写明，失败信息可自解释）。**备选方案**：改成纯合成旧库（自建 5 列表 + 注入行），
   代价是不再吃真实存量数据。请裁决保留哪种。
6. **`tools/ownership.json` 侧的断言未落（越界，非本轮可办）**：§10.4 第 9 行⑤ 要求
   "为①-④ 四点各写一条断言、`--check-ownership` 按 commit 作者任务号校验"，且明文
   "T-25 自己不改 `tools/**`，由 T-02 在出口轮写入"。本轮未碰 `tools/**`，请派 T-02。
7. **并发干扰免责**：本轮全套 389 passed / **0 failed**，未观察到 wordbook/web 名下红；
   `packages/server/src/services/wordbook-service.ts`、`routes/wordbook.ts`、`apps/web/**` 本轮零 diff。
   全套计数相对 TPM 上次实测的增量含并行 agent 的新用例，非本轮引入。

---

## 5. 越界申请 / 契约偏差

- 越界：**无**。本轮只写 `packages/server/test/db/migrations.spec.ts` 一个文件；
  `app.ts`、`middleware/**`、`services/**`、`trpc-shape*`、`tools/**`、`vitest.workspace.ts` 零改动，
  仓库根 `data.db` 与 `packages/server/data.db` 只被 `copyFileSync` 读过（写句柄只开在
  `os.tmpdir()/tm-t06-<pid>/` 下的副本；真库全程未开写句柄）。git 写操作 0 次。
- 契约偏差：无。`assessment.*` 的 input/output zod 形状未动（判据⑨），错误码仍只读消费
  `TM_ERRORS_SUPPLEMENT` 的 `FORBIDDEN`，未加码、未新增 REST 入口。
- 新增依赖：无（仅 `node:crypto` 的 `createHash`，Node 内置）。
- 真库未被触碰的实测旁证（本轮结束后查）：`ls -la data.db` → `-rw-r--r-- … 253952 Sep 18 04:05 data.db`
  （mtime 未变，本轮为 Sep 20 12:41+）；`data.db-wal/-shm` 亦为 Sep 18/17 的既有产物，非本轮生成。
  本轮对 `data.db` 的全部动作 = `fs.copyFileSync` 读取 + 只读副本探测。

## 6. 给测试的提示

- 重点回归 §4-②：在**只 `AppDB.init()` 不跑 migrate** 的库上调 `assessment.generate`，观察是否 `no such column: user_id`。
  这条路径本轮没有用例覆盖（出口判据里没有，实现里也没有）。
- 判据② 的运行时面在 3 行真实存量数据上取证；若要在大数据量旧库上复验，直接改
  `migrations.spec.ts:715` 的 `original` 指向一个临时副本即可（其余断言与列名无关）。
- pg 侧（判据⑥/⑦的线上面）本机全部显式 SKIP，必须在起真 PG 的 CI（T-22）里跑
  `DATABASE_URL_TEST=… pnpm --filter @tm/server test -- assessment-isolation`。
