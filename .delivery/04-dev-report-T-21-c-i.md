# 04-dev-report-T-21-c-i —— 发布对账脚本 `reconcile.mjs`（§10.2 T-21 判据⑦）

- 任务代号：**T-21c-i**（批次 4C · 第 3 轮 c 的第一子轮）
- 交付日期：2026-09-21
- 范围：**只新建 `scripts/release/reconcile.mjs` 一个实现文件 + 本报告**。`lib.mjs` / `preflight.mjs` / `restore-drill.mjs` / `account-audit.mjs` / `packages/**` 一字未改（`lib.mjs` 仅 import）。
- 任务书来源：`04-dev-report-T-21-b.md:226` 的 U-1 行 —— "`reconcile.mjs` 缺失为实质缺项"。

---

## 0. 一句话结论

`scripts/release/reconcile.mjs` 已落地并跑通：`--mode diff-sample --n 20` 在 sqlite 侧对 tmpdir 自建临时库产出**五项对账**（`wordbooks 条数 / fsrs_cards 条数 / due 按天分桶 / 连续天数 / 打卡次数`）各随一个 `diff`（两条独立计算路径之差）全为 0，并随附 `N/M/K/P/Q` 步 4 口径位；缺项 → exit 1 与源码只读静态扫描 → PASS 均已实测；仓库内 `data.db` 两份全程只读、跑前跑后三重指纹逐字一致。pg 侧与线上生产库侧为脚本自带**显式 [SKIP]**，不伪装 PASS。

---

## 1. 交付物清单

| 路径 | 行数 | 类型 | 说明 |
| --- | --- | --- | --- |
| `scripts/release/reconcile.mjs` | **533** | 🆕新建 | 判据⑦ 对账脚本，`--mode diff-sample`（缺省）/ `--mode assessment-orphan`（判据⑧ 可选承载位） |
| `.delivery/04-dev-report-T-21-c-i.md` | 本文件 | 🆕新建 | 开发报告 |

未触碰面（红线遵守）：`scripts/release/lib.mjs`（721 行，仍为原状，仅 `import`）、`preflight.mjs`(333)、`account-audit.mjs`(424)、`restore-drill.mjs`(1469)、`packages/**`、`apps/**`。

---

## 2. 判据⑦ 对账表（每项输出 → 实现行号 → 实跑证据）

判据⑦ 原文（`02-tech-design.md:918`）：**"⑦ L5 每档 `--mode diff-sample --n 20` 可执行"**；PRD 步 6 / R-39⑤b 对账（`01-prd.md:688` 区间所属的 §6.4-2 步 6）：**"5 项 × ≥20 真实账号 diff 必须 = 0"**。

"diff" 语义落地为**两条独立计算路径互校**（不是与外部基线互校）：路径 A = 一条聚合 SQL 直接出数（`COUNT(*)` 带 `IN` 采样集）；路径 B = 逐账号拆算再汇总（per-user 查询 / JS 重算）。同一 driver、同一采样集、同一项，diff = A − B 必须逐字为 0。

| # | 输出项 | 指标名 | 实现行号 | 采样集内实跑值（本地 tmpdb，禁入验收） | diff | 门禁 |
| --- | --- | --- | --- | --- | --- | --- |
| ① | wordbooks 条数 | `rec_wordbook_rows` / `diff_wordbook_rows` | 聚合 A=`238` · 逐账号 B 循环=`240-242` · 出数 `244-245` | 4 | `diff=0` | `[GATE] ①wordbooks diff=0 → PASS :: A=4 B=4` |
| ② | fsrs_cards 条数 | `rec_fsrs_card_rows` / `diff_fsrs_card_rows` | 聚合 A=`248` · B=`250-252` · 出数 `254-255` | 5 | `diff=0` | `[GATE] ②fsrs_cards diff=0 → PASS :: A=5 B=5` |
| ③ | due 按天分桶 | `rec_due_bucket_total` / `diff_due_partition` | 取数 `259` · 分桶函数 `dueBucketKey`=`136-146` · 汇总 `264` · 出数 `266-267` | 5 卡全落 `unknown:5`（1 桶） | `diff=0`（分区完备：Σ桶=卡数） | `[GATE] ③due 分桶完备 diff=0 → PASS :: cards=5 bucketed=5` |
| ④ | 连续天数 | `rec_streak_total_days` / `diff_streak_days` | 算法 A `streakAlgoA`=`106-116` · 算法 B `streakAlgoB`=`119-131` · 逐账号求和 `285-286` · 出数 `288-289` | Σ=3 天 | `diff=0`（两套独立算法互校） | `[GATE] ④连续天数 diff=0 → PASS :: A=3 B=3` |
| ⑤ | 打卡次数 | `rec_checkin_rows` / `diff_checkin_rows` | 聚合 A=`292` · B=`294-296` · 出数 `298-299` | 3 | `diff=0` | `[GATE] ⑤打卡次数 diff=0 → PASS :: A=3 B=3` |
| — | 五项合计 | `diff_total` | 汇总 `301-307` · 门禁 `判据⑦[sqlite] 五项 diff 合计=0` | — | `|Σ|=0` | `[GATE] PASS` |

随附的 `N/M/K/P/Q` 口径位（`collectCaliber`，`180-194`，指标名与 `account-audit.mjs` 步 4 逐字同名，保证跨脚本口径一致）：

| 口径 | 指标名 | 行号 | 本地值 | 语义（步 4） |
| --- | --- | --- | --- | --- |
| N | `step4_N_empty_password_users` | 182 | 3 | 空密码可激活账号数 |
| M | `step4_M_wordbook_rows` / `step4_M_wordbook_entries` | 184-185 | 4 / 6 | 词本行数 / 词条总数 |
| K | `step4_K_fsrs_card_rows` | 187 | 5 | FSRS 卡数 |
| P | `step4_P_checkin_rows` | 189 | 3 | 打卡记录数 |
| Q | `step4_Q_pw_policy0_with_password` | 194 | 2 | 已设密码但 `pw_policy_version=0` 的强改拦截数 |

> 采样档位说明：判据⑦ 要求 `--n 20`。本地 tmpdb `users` 仅 6 行，脚本按 `SELECT id FROM users ORDER BY id LIMIT 20` 取到 6 个（"users 总数不足 n 时按全量取"），采样命中数记入 `per_driver.sqlite.M` 并在报告 `[NOTE]` 打印。**"≥20 真实账号"是线上口径，本地 6 行不代表线上规模**，见 §5 U-2。

---

## 3. 出口命令原文与输出摘要

技术设计 §10.2 T-21 行的脚本级出口口径：`node scripts/release/reconcile.mjs --mode diff-sample --n 20`。

### 3.1 `--mode diff-sample --n 20`（缺省 dry-run，tmpdir 自建库）

```
$ node scripts/release/reconcile.mjs --mode diff-sample --n 20
```

摘要：
- `[NOTE] 未给 --db → 在 os.tmpdir() 自建临时库：fixture=tools\fixtures\schema-fixtures.json（release_seed=无 → 回落 lib.mjs builtinSeed 本地样例）；本地库 ≠ 线上库，以下所有数字禁止进入任何验收材料。`
- `[TMP] 临时库迁移完成（真实迁移路径，非手写 DDL）：…\tm-t21-51636\reconcile-selfcheck.db` → `tmp_db_migrations_ok=1`（复用 `lib.runSqliteMigrations` + `seedTempSqlite`）
- `[TARGET] driver=sqlite … size=126976B …`；`[sqlite] diff-sample：采样集实际命中 6/20 个账号`
- 五项输出 + 五项 `diff=0`（见 §2 表），`N/M/K/P/Q` 全出数
- `[GATE] 判据⑦[sqlite] 五项 diff 合计=0 → PASS :: |Σ|=0`
- `[SKIP] pg 驱动未执行：本机无 PostgreSQL 实例、DATABASE_URL_TEST 未设置。这不是 PASS。`
- `[SQL-SURFACE] …` 34 条语句整表打印，`语句种类=SELECT`
- `[GATE] 只读纪律/全部执行语句属 SELECT|PRAGMA → PASS`
- 小结：`"verdict":"PASS", "exit_code":0, "diff_total":0, "missing":[], "sql_surface_count":34, "read_only_statement_kinds":["SELECT"]`

### 3.2 缺项 → exit 1 门禁（实测，非纸面）

对**无 `users` 表的空 tmpdb** 跑同一 mode，`SELECT` 抛异常被 catch 后全部 sqlite 计数标记 `(异常)` → `requireMetrics` 报缺 → 退出码 1：

```
$ node scripts/release/reconcile.mjs --driver sqlite --db "%TEMP%\tm-rec-empty-*.db" --mode diff-sample
MISSING_RUN_EXIT=1
```

即 `requireMetrics(REQUIRED_METRICS, driver)`（`REQUIRED_METRICS`=`150-176`，门禁调用在缺项汇总处）骨架生效——**复用 lib 的缺项 exit 1 一套，未另写更松的检查**（A-28 同源原则）。空库跑完即删（仅 tmpdir 内文件）。

### 3.3 `--self-test`（只读取证，静态扫描）

```
$ node scripts/release/reconcile.mjs --self-test
[GATE] self-test/安全阀用例全部命中拒绝 → PASS :: pass=6/6
[GATE] self-test/源码去注释后零写语句关键字 → PASS :: hits=0
[GATE] self-test/ro() 运行时守卫拒写 → PASS :: 非只读语句被抛=符合只读纪律
  "verdict": "PASS", "exit_code": 0
```

- 安全阀 6/6（`runSafetySelfTest`：两份 `data.db` + 非 tmpdir dry-run 目标全被拒）
- 静态扫描 `assertScriptIsReadOnlySelf()`（lib，`376` 调用）对本文件去注释后扫 `WRITE_STATEMENT_KEYWORDS` → **hits=0**
- 运行时守卫 `ro()`（`73-79`）对非 `SELECT|PRAGMA` 语句抛异常

---

## 4. 数据红线自证

| 库 | 跑前 | 跑后 | 一致 |
| --- | --- | --- | --- |
| `data.db` | size=`253952` · mtime=`2026-09-18 04:05:38.198449400 +0800` · sha256=`6595517661cc6a34…` | size=`253952` · mtime=`2026-09-18 04:05:38.198449400 +0800` · sha256=`6595517661cc6a34…` | ✅ 逐字一致 |
| `packages/server/data.db` | size=`0` · mtime=`2026-09-17 00:10:53.374159200 +0800` · sha256=`e3b0c44298fc1c14…`（空文件） | size=`0` · mtime=`2026-09-17 00:10:53.374159200 +0800` · sha256=`e3b0c44298fc1c14…` | ✅ 逐字一致 |

- **全程只读**：脚本内所有 SQL 均经 `ro()`（`73-79`）守卫，非 `SELECT|PRAGMA` 直接抛；执行面 34 条整表打印，种类只有 `SELECT`。
- **只打 tmpdir**：所有执行仅针对 `os.tmpdir()` 下 `tm-t21-<pid>/reconcile-selfcheck.db`（缺省路径）；指向仓库内 `data.db` 走 `assertSafeTarget`（lib），未带 `--i-know-this-is-prod` 即 R1/R2 拒绝（exit 2）——本轮**从未**用 `--i-know-this-is-prod`，也**从未**打开过 `data.db`。
- **`lib.mjs` 只 import 不修改**：`import` 块在 `34-64`，无任何 Edit 落到 lib。

---

## 5. 上报未修（交回 TPM）

| 编号 | 事项 | 类别 | 处置建议 |
| --- | --- | --- | --- |
| U-1 | `local helper 待上收`：本文件自带的 `ro()` 运行时守卫 + `SQL_SURFACE` 执行面登记 + 注释保行处理，`lib.mjs` 当前未导出（`restore-drill.mjs` 亦各写一份）。 | 复用面 | 待 **T-21c-iii**（持有 `lib.mjs` 修改权）上收为 lib 共用件；本轮不碰 `lib.mjs` 以免与 iii 撞。 |
| U-2 | `--n 20 的线上取证未做`：本地 tmpdb 仅 6 账号，diff-sample 的 "≥20 真实账号 diff=0" **未在线上成立**，仅证明脚本有判定力。 | 线上口径 | 待 Phase 7 向用户索取线上生产库**只读**访问后，用 `--db <线上只读副本> --i-know-this-is-prod --n 20` 真跑；本地 6 行数字禁止写入发布报告结论。 |
| U-3 | `pg 侧未跑通`：本机无 PostgreSQL 实例、`DATABASE_URL_TEST` 未设，pg 为**显式 [SKIP]** 非 PASS。判据⑦"每档"是否要求 pg 各一遍以 §10.2 步 4"双驱动"类推。 | 双驱动 | 归 T-22 CI（带 `DATABASE_URL_TEST` 真跑）。 |
| U-4 | `due 分桶本地全落 unknown`：`builtinSeed` 写入的 `fsrs_data='{}'` 无 `due` 字段（`lib.mjs:391`），故本地桶为 `unknown:5`。脚本已把"无 due"单列一桶保证分区完备（Σ桶=卡数），但**按天分布的真实形状**本地取不到证。 | 数据形状 | 线上取证（U-2）时自然覆盖；无需改 lib。 |
| U-5 | `判据⑦ 未接入 preflight 调度`：`preflight.mjs:302` 仍把"步 6 对账基线"标 SKIP、`:321` 列在 `not_implemented_here`。本轮只交付 `reconcile.mjs` 本体，**未改 `preflight.mjs`**（越界）。 | 装配面 | 待收口轮（或持 `preflight.mjs` 权的 agent）把 `--mode diff-sample` 挂进步 6 检查清单。 |

**未修不阻塞本轮**：本轮判据⑦（脚本承载 + sqlite 侧 diff=0 + 缺项 exit 1 + 只读静态/运行时双证）已成立。

---

## 6. 遗留清单

| 编号 | 内容 | 归属 |
| --- | --- | --- |
| L-1 | `preflight.mjs` 步 6 挂载 reconcile（见 U-5） | 收口轮 / preflight 权 owner |
| L-2 | 线上 ≥20 真实账号 diff=0 实测（见 U-2） | Phase 7 |
| L-3 | pg 驱动真跑（见 U-3） | T-22 CI |
| L-4 | `ro()` / 执行面登记上收进 `lib.mjs`（见 U-1） | T-21c-iii |
| L-5 | `%TEMP%` 下 `tm-t21-*` / `tm-rec-empty-*.db` 演练目录，均在 tmpdir 内不污染仓库，收口轮可统一清理 | 清理类 |
| L-6 | 判据⑧ 的 `--mode assessment-orphan` 承载位已实现但 account-audit 已判⑧；两处并存以哪个为唯一发布出口由 TPM 拍板 | 口径类 |

---

## 7. 并发说明

工作区 6 个 agent 并行。本轮结论（§2 五项 diff=0、§3 三条出口、§4 双重指纹）均为 reconcile.mjs 名下、针对独立 tmpdir 临时库自成闭环，不受并发影响；未观测到 `lib.mjs` / `data.db` 被并发改动的迹象（指纹逐字一致）。若后续全套 `preflight.mjs` 汇总变红，优先怀疑并发，非本文件所致。
