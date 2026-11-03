# 开发报告（后端）— T-25 第 3 轮（缺陷微轮：§10.2 判据⑥ 两条建库路径不一致）

## 完成清单

| 任务 | 状态 | 实现文件 | 备注 |
| --- | --- | --- | --- |
| ① `init()` 建表串补 `user_id` | done | `packages/server/src/db/sqlite.ts:112-122`、`packages/server/src/db/pg.ts:146-156` | 各加 1 列 + 2 行 why 注释；`pnpm ddl-parity` 仍 0 差异 |
| ② 判据⑥ 用例（纯追加） | done | `packages/server/test/db/migrations.spec.ts:824-991`（新增 1 个 describe（865-991）+ 3 个文件级 helper） | sqlite 真跑 4 例 + pg 运行时面 1 例显式 SKIP；既有用例一字未动 |
| ③ 两条陈旧标题 | done | `migrations.spec.ts:303`、`:432` | 只改标题字符串（"7 条"→"8 条"、"000…006 全部记账"→"000…007"），断言逻辑零改动 |
| ③ `get/set` 残留调用点实测 | done | 见下「无属主 get/set 的实测结论」 | 生产代码 0 调用点，未自行删除任何方法 |

## 改了哪几行

**`packages/server/src/db/sqlite.ts`**（`const DDL` 第 6 项，原 112-119）
```diff
+  // user_id 必须与迁移 007 的 `ADD COLUMN user_id INTEGER DEFAULT NULL` 同形（§10.2 T-25 判据⑥）：
+  // 只 init() 不 migrate() 的库上 getOwned/setOwned 也要能跑，且两条建库路径反读到的形状一致。
     `CREATE TABLE IF NOT EXISTS assessment_cache (
       ...
       created_at INTEGER NOT NULL,
+      user_id INTEGER DEFAULT NULL,
       UNIQUE (word, qtype)
     )`,
```

**`packages/server/src/db/pg.ts`**（同位置，原 146-153）
```diff
+      user_id INTEGER DEFAULT NULL,
```

### 类型词的一处口径纠正（与提示词括注不同，请 TPM 复核）

提示词写「沿用本表 `created_at` 的双驱动惯例（sqlite `INTEGER` / pg `BIGINT`）」。**照此写在 pg 上会直接违反判据⑥**：

- schema 源 `assessmentCache.columns` 里 `user_id` 是 `{ name:'user_id', type:'integer', default:null }`，**没有 `pgType`**（`packages/shared/src/schema/tables.ts:354`），`created_at` 才有 `pgType:'BIGINT'`；
- 007 的 `ADD COLUMN` 由 `columnDdl('pg', …, 'user_id', {explicitDefaultNull:true})` 生成 ⇒ `pgColumnType()` 走 `LOGICAL_TO_PG.integer = 'INTEGER'`（同文件 74-88 行）⇒ **pg 上 ALTER 出来的列是 `integer`**；
- 若建表串写 `BIGINT`，活库上 `information_schema.data_type` 就是 `bigint` vs `integer` —— 正是判据⑥ 要禁的形状漂移（`ddl-parity` 的归一表把 `bigint`/`int8` 一律折成 `integer`，所以**它抓不到这个漂移**，不能拿它当兜底）。

故两处都写 **`user_id INTEGER DEFAULT NULL`**：① 与 007 的 ALTER 逐字同形（含 `DEFAULT NULL` 字面量，sqlite 侧 `dflt_value` 都回 `'NULL'`，两侧连归一前都一致）；② 与 pg.ts 里兄弟表的 `user_id`（`chat_messages:139`、`analyst_cache:156`）一致；③ `DEFAULT NULL` 的写法与本文件既有的 `password TEXT DEFAULT NULL` / `last_review INTEGER DEFAULT NULL` 同风格。

## 新增用例（`migrations.spec.ts` 末尾，纯追加）

`describe('T-25 判据⑥（第 3 轮）：只 init() 不 migrate() 的全新库 == 旧库 ALTER 之后的 user_id 形状')`

- **A 侧**：`os.tmpdir()` 下的全新库，只 `new SqliteAppDB(raw).init()`，**一条迁移都不跑**（前提用 `_migrations` 不存在/0 条自证）→ `PRAGMA table_info` 反读 `user_id`；
- **B 侧**：仓库根 `data.db` 的**临时副本**（现状确实还没有 `user_id`，已实测：读它的 `PRAGMA` 只有 5 列）→ 补 000-006 → 只执行 007 → 同一读法反读；
- 4 条实跑断言：① 对照前提（A 未记账 / B 迁移前无该列）；② `initOnly` toEqual `afterAlter` 且 `type='INTEGER'` / `notNull=false` / 无有效默认值（默认值归一口径与 `src/db/migrations/index.ts:344 normalizeDefault()` 一致，`DEFAULT NULL` 与「不写 DEFAULT」同类）；③ 该库上 `setOwned`/`getOwned` 跑通：属主读到、他人读不到、无主行（`user_id IS NULL`）读不到；④ **两驱动静态面**——从 `{sqlite,pg}.ts` 源文件正则取建表串，与 007 生成的 ALTER 比「类型词 / NOT NULL / DEFAULT NULL」三项，并钉死 pg 侧必须是 `INTEGER`；
- 1 条 **显式 SKIP**：`it.skipIf(PG_URL === '')` 的 pg 运行时面（活库 `information_schema` 反读 + `PostgresAppDB.setOwned/getOwned` 往返）。本机无 PG 实例 ⇒ 计 `skipped`，**未伪装 PASS**。

## 自检与冒烟（真实输出尾部）

```
### 1) pnpm --filter @tm/server test -- migrations assessment-isolation   exit=0
 ✓  @tm/server  test/db/migrations.spec.ts (39 tests | 1 skipped) 206ms
 Test Files  16 passed (16)

### 2) pnpm --filter @tm/server test                                     exit=0
 Test Files  16 passed (16)
      Tests  393 passed | 1 skipped (394)
   Duration  15.05s

### 3) pnpm ddl-parity                                                   exit=0
schema 源 packages/shared/src/schema/tables.ts 载入 13 张表：… assessment_cache …
A 段/sqlite：0 处差异
A 段/pg：SKIP —— 未设 DATABASE_URL_TEST（§6.2 允许跳过，但 CI 必须起 PG，见 §6.4 T-22）
B 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP
C 段/pg：SKIP —— 未设置 DATABASE_URL_TEST（本机无 PG 实例）—— 由 tools/ddl-parity.mjs 记显式 SKIP

### 4) pnpm --filter @tm/server typecheck                                exit=0
$ tsc -p tsconfig.json --noEmit
```

- 基线核对：TPM 实测 **389 passed / 0 failed** → 本轮 **393 passed / 0 failed / 1 skipped**（+4 = 新增实跑例，skipped 1 = 新增的 pg 运行时面显式 SKIP），未放宽任何门禁、未改任何既有断言、未碰 `trpc-shape.baseline.json`。
- 首次跑挂了 1 次：`RangeError: Too many parameter values were provided`（我新例里那条无主行 INSERT 写了 4 个绑定值却只有 3 个 `?`，`NULL` 是字面量）→ 改为 4 个 `?` 后全绿；未涉及任何既有断言。
- 只读红线：全程只在 `os.tmpdir()/tm-t25r3-*` 与 `tm-t06-<pid>` 下写；`data.db` mtime 仍是 `2026-09-18 04:05`（本轮只 `copyFileSync` 读它），`packages/server/data.db` 仍是 0 字节。无 git 写操作。

## 判据⑥ 现在是否达成

**sqlite：达成（已实跑证明）。** 两条建库路径（`init()` 建表串 / 旧库 007 ALTER）反读到的 `user_id` 逐字段全等（`INTEGER`、可空、无有效默认值），且"只 init 不 migrate"的库上 `getOwned`/`setOwned` 不再 `no such column: user_id`。

**pg：静态面达成，运行时面本机未执行。** 建表串与 `columnDdl('pg',…)` 生成的 ALTER 三项同形（新例第 4 条钉死），但"活库上 `information_schema` 反读 == ALTER"这一层本机无实例 → 显式 SKIP，需 T-22 的 CI 起 PG 补齐（与 A 段/pg、B/C 段/pg 同一前置）。

## 无属主 `get`/`set` 的实测结论（判据③）

命令：`grep -rn "\.assessment\.get(\|\.assessment\.set(" packages/server/src apps` → **exit 1，0 命中**。
再放宽到全仓（Grep 工具，尊重 .gitignore）`assessment\.(get|set)\s*\(`：命中仅
- `packages/server/test/integration/assessment-isolation.spec.ts:312/335/382/409`（测试自己造无主行/挤占场景）与该文件 `:499` 的反向断言「`src/**` 里没有 `db.assessment.get(`/`set(` 调用点」；
- `.delivery/*.md` 文档。

生产侧只有 `packages/server/src/trpc/routers/assessment.ts:64/73/87` 调 `getOwned`/`setOwned`，属主一律 `ctx.userId`。
⇒ **结论：`AssessmentDB` 的 4 个方法里，无属主 `get`/`set` 在 `packages/server/src` 与 `apps` 里已 0 调用点，判据③ 无漏洞**；两个遗留方法按边界规定未自行删除（它们在 `db/types.ts` 接口里，删除属越界动作）。

**§10.4 第 9 行的口径差**：该处写"三处方法"，第 2 轮实际交的是 **4 个方法**（新增 `getOwned`/`setOwned` + 保留无属主 `get`/`set`）。本轮未改任何文档，如实上报。

## 越界申请

无。本轮改动全部落在授权边界内：`src/db/sqlite.ts` 与 `src/db/pg.ts` 各只碰那一条 CREATE 语句，`test/db/migrations.spec.ts` 纯追加 + 两条标题字符串（另加 1 行 `import { PostgresAppDB }` 供 pg 运行时面使用，未动既有 import/用例）。未碰 `db/types.ts`、`db/migrations/**`、`trpc/routers/**`、`packages/shared/**`、`tools/**`、基线文件、`apps/**`。

## 契约偏差

无（API/DTO 一字未动）。唯一口径偏离已在上面「类型词的一处口径纠正」登记：pg 侧用 `INTEGER` 而非提示词括注的 `BIGINT`，理由是判据⑥ 要求与 007 ALTER 结果完全一致。

## 已知限制与 TODO（诚实列出）

1. pg 运行时面本机未执行，只有静态面 + CI 待补（`it.skipIf(PG_URL === '')`）。
2. 新例的 B 侧（"旧库"）取的是仓库根 `data.db` 的副本，沿用了本文件判据②/⑤ describe 的既有前置（`expect(hasReal).toBe(true)`、迁移前 `preCols` 必须无 `user_id`）。**真库一旦被正式迁移，这条前置例就会红** —— 与既有 3 条用例同一退化条件，本轮不独自改口径，交由 TPM 决定：要么把"旧库"改造成测试内自建的历史形状表，要么在 T-22/发布流程里钉死"迁移前先跑完这批用例"。
3. `ddl-parity` 的归一表把 `bigint`/`int8` 折成 `integer`，所以它对"pg 侧 INTEGER vs BIGINT"这类漂移**天生无牙**；本轮靠新例第 4 条静态面把 pg 的类型词钉死，建议 TPM 考虑是否把它升格为 A 段的通用判据（属 `tools/**`，越界，仅登记）。
4. `assessment_cache` 仍只有 `UNIQUE (word, qtype)`（无 user_id 维度），`setOwned` 的 `DO UPDATE` 会把行改写成当前写入者 —— 这是 R-42/RK-14 的既有代价，本轮未触碰。

## 给测试的提示

- 重点看 `migrations.spec.ts` 末尾新 describe 的第 2、3 条：它们是把判据⑥ 钉死的两条，删掉 `sqlite.ts` 里的 `user_id` 一行就会同时红掉「形状全等」和「getOwned 跑通」（后者即缺陷现场 `no such column: user_id`）。
- pg 侧请在有 PG 的 CI 里确认那条 SKIP 转跑：入口是 `DATABASE_URL_TEST`，同一用例还会实跑 `PostgresAppDB.setOwned/getOwned` 往返。
- 我未测：pg 真库上"旧库(无该列) → 007 ALTER → 反读"的完整链路（本机无实例，且 pg 侧无法用 data.db 副本那套手法）。

## 待 TPM 拍板

1. §10.4 第 9 行"三处方法" vs 实际 4 个方法（`get`/`set`/`getOwned`/`setOwned`）的文档口径由谁改（本轮按边界规定未碰 `.delivery` 除本报告外的文件）。
2. 无属主 `get`/`set` 是否在本期收口删除（需同时动 `db/types.ts` 与 `assessment-isolation.spec.ts:499` 那条反向断言的对象，属越界）。
3. pg 类型词 `INTEGER`（与 007 ALTER 同形）与提示词括注 `BIGINT` 的冲突：本轮取 `INTEGER`，请确认裁决。
4. 「旧库」前置对 `data.db` 的依赖（见已知限制 2）是否需要独立一条排期。
