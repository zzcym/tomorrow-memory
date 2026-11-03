# 开发报告 — T-21 第 1 轮（a）：发布护栏脚本的**只读观测面**

角色：后端 / 发布工具链开发工程师
任务：`T-21(a)`（按 A-38 §39 预拆，本轮只做判据① 与判据⑧）
取证纪律说明：本轮**未整篇通读** `.delivery/01-prd.md` / `02-tech-design.md`，只按给定行号做了 4 段定点取证：
`01-prd.md:601-720`（§6.4-2 步 4 / 5 / 5b / 5c / 6 / 6b / 7 / 8 / §6.4-2b 第 1 行 / §6.4-4 / §6.4-5 / §6.4-7 开关初值 / §6.6-2）、
`02-tech-design.md:918`（T-21 行全文，含判据①⑧ 与 `--dry-run`/`--fixture`/`--i-know-this-is-prod` 口径）、
`02-tech-design.md:980`（§10.4 第 9 行的时序句：`T-06 微轮交回 db/** < T-25 < T-21 判据⑧ < T-24 步 6b`）。

---

## 一、完成清单

| 编号 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| T-21(a)-1 发布脚本共用层 | done | 🆕`E:\CC\tomorrow-memory\scripts\release\lib.mjs`（721 行） | CLI 解析 / 安全阀 / 只读连库 / 计数出口 / 告警降级 / 临时库装配 / 只读静态取证，全部为 b、c 轮可复用出口（见 §三） |
| T-21(a)-2 只读账号体检 | done | 🆕`E:\CC\tomorrow-memory\scripts\release\account-audit.mjs`（424 行） | 判据① 的 16 个必需指标 + 判据⑧；纯 `SELECT`，无写死库路径 |
| 判据① 步 4 六项 + 五类保留计数 | **部分**（脚本面 done，线上出数待发布窗口） | 同上 | sqlite 侧实测出数；pg 侧因本机无实例为**显式 SKIP**（未伪装 PASS）。**步 4 原文要求"必须连线上生产库测"——本轮拿不到线上只读访问**，见 §五 待拍板第 5 项 |
| 判据⑧ `assessment_cache` 无主行只读计数 | done（sqlite 侧） | 同上 | `SELECT COUNT(*) FROM assessment_cache WHERE user_id IS NULL` 出数；前置（007 已在盘上并注册）经真实迁移路径实证；"只观测不处置"由**对本文件源码的静态扫描**机器取证 |
| 未创建（按预拆属 b/c 轮） | 未做（**故意的**） | — | `preflight.mjs` / `restore-drill.mjs` / `reconcile.mjs` / `packages/server/src/services/backup.ts` / `test/release/backup.spec.ts` / `scripts/release/README.md` 一律未建、未碰 |

**文件边界自证**：`git status --porcelain scripts/` → 只有 `?? scripts/release/`。本轮零 `git` 写操作、零对 `data.db` 的写操作/迁移、未触碰 `packages/server/src/**`、`packages/shared/src/**`、`tools/**`、`.github/**`、`db/**`、`trpc-shape.baseline.json`、任何测试断言。零新增第三方依赖。

---

## 二、自检与冒烟（真实输出）

以下输出全部为**实际执行**结果，同一份也已落到 `C:\Users\曹怡明\AppData\Local\Temp\t21a\exit.md`。

| # | 命令 | 结果（关键输出原文） |
|---|---|---|
| 1 | `node scripts/release/account-audit.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json` | **EXIT=0**。逐行原文（节选）：<br>`[TMP] 临时库迁移完成（真实迁移路径，非手写 DDL）：…\Temp\tm-t21-66180\audit-selfcheck.db`<br>`[TARGET] driver=sqlite 实例=…size=126976B mtime=2026-09-20T04:45:44.556Z 打开时刻=2026-09-20T12:45:44.562+08:00`<br>`step4_N_empty_password_users=3` `step4_M_wordbook_rows=3` `step4_M_wordbook_entries=4` `step4_K_fsrs_card_rows=4` `step4_P_checkin_rows=3` `step4_Q_pw_policy0_with_password=2`<br>`step6_snapshot_users_rows=6` `step6_snapshot_wordbooks_rows=4` `step6_snapshot_fsrs_cards_rows=5` `step6_snapshot_checkin_logs_rows=3`<br>`retain_wordbook_rows=3` `retain_wordbook_entry_total=4` `retain_fsrs_card_rows=4` `retain_checkin_rows=3` `retain_profile_rows=3`<br>`[GATE] sqlite/profiles==N → PASS`<br>`empty_password_userid_set_count=3` `empty_password_userid_set_sha256_12=8a6ae1512200`<br>`[METRIC] driver=sqlite r41_assessment_cache_user_id_is_null=2` ← **判据⑧**<br>`[RED] 告警通道未配置 → 标红 + 写日志，判定为通过（降级）`<br>`[GATE] 步5b/告警通道未配置不得阻塞 → PASS :: configured=false blocking=false`<br>小结：`"missing": []`、`"dual_driver": {"ran":["sqlite"],"ok":false,"tolerated_single_driver":true}`、`"exit_code": 0` |
| 2 | `node scripts/release/account-audit.mjs --self-test` | **EXIT=0**，9 条判定全 OK：<br>`OK [REJECT R1] 仓库根 data.db + 未带 --i-know-this-is-prod`<br>`OK [REJECT R1] packages/server/data.db + 未带 --i-know-this-is-prod`<br>`OK [REJECT R1] 仓库根 data.db + dry-run`<br>`OK [ALLOW] 仓库根 data.db + --i-know-this-is-prod（只读放行，但日志标注）`<br>`OK [ALLOW] tmpdir 下的临时库 + dry-run`<br>`OK [REJECT R2] 非 tmpdir 的一般外部库（examples.db）+ dry-run`<br>`OK [REJECT] 未知 CLI 参数` / `OK [REJECT] --driver 缺取值` → `6/6 路径判定符合预期`<br>`OK account-audit.mjs 的写语句关键字命中数 = 0`（扫描前先去注释）<br>`未配置 → PASS（降级） · blocking=false` |
| 3 | `node scripts/release/account-audit.mjs --driver sqlite --db data.db`（**不带** prod 旗标） | **EXIT=2** `[SAFETY-VALVE] 拒绝执行：目标库 E:\CC\tomorrow-memory\data.db 是仓库内的真库文件。…才加 --i-know-this-is-prod。` ← 数据红线安全阀真拒绝，未打开文件 |
| 4 | `node scripts/release/account-audit.mjs --driver sqlite --db examples.db` | **EXIT=2** `--dry-run（缺省态）只允许打开 os.tmpdir() 下的临时库，收到 …examples.db` ← R2 兜底 |
| 5 | `--execute --driver sqlite --db <tmpfile>`（真实读取但只跑一个驱动） | **EXIT=1** `[GATE] 判据①/双驱动各跑一遍 → FAIL :: 实跑驱动 = sqlite；真实读取需双驱动` → 不因为"少跑了 pg"就发绿 |
| 6 | 同上加 `--allow-single-driver` | **EXIT=0**，verdict 如实写 `PASS（单驱动容忍口径：--allow-single-driver 显式豁免）· 判据① 的"双驱动各跑一遍"本轮未达成（pg 未调度：--driver 限定）` |
| 7 | `node scripts/release/account-audit.mjs --dry-run`（缺省 `--driver both`） | **EXIT=0**，中间确有：`[SKIP] pg 驱动未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。…CI（T-22）必须带 DATABASE_URL_TEST 真跑这一条。` SKIP 同时 summary 里 `"dual_driver":{"ok":false}` |
| 8 | `npx eslint scripts/release/lib.mjs scripts/release/account-audit.mjs` | 无输出，exit 0（`ESLINT_CLEAN`）。补证它**不是被忽略**：`npx eslint --print-config scripts/release/lib.mjs` 解析出真实配置（plugins `@`/`@typescript-eslint@8.68.0`，rules 260 条） |
| 9 | `npx prettier --check scripts/release/*.mjs` | `All matched files use Prettier code style!`（先 `--write` 了**仅这两个新文件**，未跑全仓 `pnpm format`，避免动到他人未提交改动） |
| 10 | `pnpm -r typecheck` / `pnpm -r test` / `pnpm ddl-parity` | **本轮未跑**。两个新文件是仓库根 `scripts/**` 的纯 `.mjs`，不在任何 tsconfig 项目里，也不在 vitest workspace project 里；判据⑧ 的前置（007 在盘上并注册）由主会话告知"已实测绿"，且被本报告的命令 #1 用**真实迁移路径**间接实证（临时库里 `assessment_cache.user_id` 列存在且可 SELECT）。**如实登记：全量 CI 面未由我复核** |

> 诚实声明：命令 #1 我第一次执行时是**红的**（`EXIT=1`），原因是把 better-sqlite3 的选项写成 `readOnly`（正确键名是 `readonly`），sqlite 侧一条指标都没出、`requireMetrics` 正确判出"缺失 16 项"并 `exit 1`。修完才是上表的 EXIT=0。**门禁本身先于实现被验证有效**——这条失败恰好证明"缺任一项即 exit 1"不是纸面话。

---

## 三、`lib.mjs` 导出清单与 b / c 轮接手指引

### 3.1 导出面（按轮次标注消费方）

| 分组 | 导出 | 签名 / 返回 | 谁用 |
|---|---|---|---|
| 常量 | `REPO_ROOT`、`TMP_ROOT`、`DEFAULT_FIXTURE`、`HELP_FLAGS`、`WRITE_STATEMENT_KEYWORDS` | 值 | a/b/c 全部 |
| CLI | `parseReleaseArgs(argv, extra)` | → `{dryRun,execute,driver,fixture,db,json,iKnowThisIsProd,allowSingleDriver,selfTest,help,outDir,…extra}`；未知参数/缺取值 **throw**（调用方 `exit 2`） | b `preflight.mjs`/`restore-drill.mjs`、c `reconcile.mjs` 直接用；`extra` 传各自专属开关（见 a 轮的 `--keep-tmp` 用法） |
| 安全阀 | `protectedSqlitePaths()`、`assertSafeTarget(args, sqlitePath)` | → `{ok:true,label,target,prod}` 或 `{ok:false,code:2,rule:'R1'\|'R2',reason}` | a 已用；b 轮 `restore-drill.mjs`/`preflight.mjs` **必须**在任何连库动作前调用 |
| 只读连库 | `openSqliteReadOnly(file)` / `openPgReadOnly(url)` / `pgUrl()` / `pgSkipReason()` | 统一句柄：`{driver,uri,label,all(sql,params),one(sql,params),identity(),close()}`；sqlite 侧同步 API 也允许 `await` | a 已用；b/c 轮同一句柄形状，别再各写一套 |
| 临时库装配 | `runSqliteMigrations(sqliteFile)` | `spawnSync(node, tsx/cli, migrate.ts)`，env 只改 `DB_DRIVER=sqlite` + `SQLITE_PATH`；→ `{ok,reason?}` | b 轮快照/恢复演练的建库底座（= PRD 步 5c 的真实迁移路径） |
| fixture | `loadFixture(p)` | → `{abs,seed,hasReleaseSeed,raw}`；**`release_seed` 缺失时回落 `builtinSeed()`** | a 已用；b/c 沿用同一约定，见 §3.2 |
| 造数 | `builtinSeed()` / `seedTempSqlite(file, seed)` | 只 `INSERT`；`seedTempSqlite` 内部硬拦"目标不在 tmpdir 内即 throw" | a 自检；b/c 需要真造数时替换 `release_seed`，**不要**改这个函数 |
| 计数出口 | `resetRegistry()` / `printMetric(name,value,driver)` / `printGate(id,pass,detail)` / `note(text)` / `requireMetrics(list,driver?)` / `emitSummary({task,verdict,exitCode,targets,extra})` / `nowStamp()` | `requireMetrics` → `{ok,missing}`（只判不改退出码，退出码由脚本决定）；`emitSummary` 打 `[METRIC]/[GATE]/[NOTE]` 之外的机器可读小结 | b/c 轮**必须**走这几个函数，别再自造输出格式 |
| 告警通道 | `getAlertChannel(env?)` / `sendFailureAlert(channel,payload)` / `setLogFile(p)` / `logLine(l)` | `getAlertChannel()` → `{configured,blocking:false,verdict,red_flag?,host?,note}`，**永不抛**；`sendFailureAlert` 吞掉一切异常返回 `{sent,reason}` | b 轮 `backup.ts`/`restore-drill.mjs` 是唯一真实消费方 |
| 只读取证 | `scanForWriteStatements(text,label)` / `assertScriptIsReadOnlySelf(file)` | 去注释后扫 `WRITE_STATEMENT_KEYWORDS`；→ `{ok,hits}` | **b/c 轮的 `preflight.mjs`/`reconcile.mjs` 请把 `--self-test` 里对 `account-audit.mjs` 的自扫扩到自家文件**——步 6 与 R-41④ 的"对账脚本出现任何 UPDATE/DELETE/DROP 即阻断"由此变成可执行断言 |
| 杂项 | `fingerprintInts(ids)` / `resolveRepoPath(p)` / `importFromRepo(rel)` / `cleanupTmpRoot()` / `runSafetySelfTest()` | `fingerprintInts` → `{count, sha256_12}`，用于 §6.6-2 的"user_id 集合快照（脱敏或哈希化）" | a 已用；c 轮 `reconcile.mjs --mode diff-sample` 应复用同一指纹口径做"前后集合比对" |

### 3.2 与 b / c 轮的三条约定（需要它们一并遵守，故写死在此）

1. **`--fixture <path>` 语义**：造数与口径声明文件。脚本**优先读其顶层 `release_seed` 块**：
   `{ users:[{id,phone,password,pw_policy_version,password_changed_at}], profiles:[{user_id}], wordbooks:[{user_id,data:[…]}], fsrs_cards:[{user_id,word}], checkin_logs:[{user_id,date}], assessment_cache:[{word,user_id}] }`；
   缺失则回落 `builtinSeed()` 并打印"本地样例造数、非线上口径"。当前 `tools/fixtures/schema-fixtures.json`（T-02 产出，本任务只读）**没有** `release_seed`，所以走的是回落分支——这是本轮的实测事实。
   **`--db <path>`** 是 sqlite 目标的显式入口（b/c 轮恢复演练会用到"快照恢复出来的那份库"，它就是 `--db`）。两者关系：给了 `--db` 就不自建、`--fixture` 只作为归档元信息记录来源。
2. **退出码分工**：`2` = 安全阀拒绝 / CLI 非法；`1` = 缺必需计数项 或 判据不成立；`0` = 判据成立（dry-run 自检口径下单驱动 + pg 显式 SKIP 可为 0，但 summary 的 `dual_driver.ok` 必为 `false`）。
3. **开关初值表在 b 轮（判据⑥）**：取证行号已确认——PRD `01-prd.md:615`（步 8）+ `01-prd.md:688`（§6.4-7"进入窗口时的开关初值"）给出 **8 个**：`wordbookIncremental=0%`、`explicitFavorite=on`、`autoFavoriteDefault=off`、`studyModes=on`、`dailyReminder=on(20:30)`、`passwordRegister=on`、`avatarUnifiedLimit=on`、`passwordUpgradeEnforce=on`；判据另含"改开关不需重新发版、≤60 秒生效"与"`passwordUpgradeEnforce` 初值 = `on`（`off` 即阻断）"，且 **`passwordUpgradeDeadline` 这个键名在代码/配置/文案三处 grep 命中必须为 0**。b 轮断言请直接用这 8 项，别再从别处推。

---

## 四、判据①⑧ 达成证据

### 判据①（§10.2 T-21 行：「步 4 输出 N/M/K/P/Q + 五类保留计数 六项，双驱动各一遍，缺任一项 exit 1」）

- **口径来源**：`01-prd.md:608`（步 4 全文，五段 SQL 逐字照抄，含 `TRIM(password)=''` 判空、`COALESCE(SUM(json_array_length(w.data)),0)` 与 PG 侧 `SUM(jsonb_array_length(w.data::jsonb))`）、`01-prd.md:653`（§6.4-4 Q8' 五类保留计数）、`01-prd.md:717`（§6.6-2 声明"口径与 SQL 以 §6.4-2 步 4 为唯一来源"）。
- **脚本侧达成**：`REQUIRED_METRICS` 共 16 项，缺任一 → `[FAIL] 六项计数缺失 N 项：…` + `exit 1`（已被第二节的"诚实声明"那次真红跑证伪过）。双驱动在 `--driver both` 下各跑一遍；单驱动时不判 PASS 而是判 `未达成`（命令 #5 实证 `exit 1`）。
- **库自证**：`[TARGET]` 行打印库实例绝对路径 + size + mtime + 打开时刻（带时区 ISO），满足步 4 判据"报告里能看到哪个库、什么时候跑的，看不到即判本步未做"。
- **未达成部分（如实）**：**"必须连线上生产库测"这一条 a 轮不可能成立**——本机没有线上库只读访问（PRD §6.4-2b 第 1 行把它连同 U-1/U-2 一起登记为"只有用户能给"的待索取项）。所以判据① 在 a 轮的准确状态是：**出数面与口径已就位并自检通过；步 4 本身的判据成立要等到发布窗口对线上库跑 `--i-know-this-is-prod`**。

### 判据⑧（`02-tech-design.md:918` 一整行 + PRD `01-prd.md:612` 步 6 括号里的同一句 SQL）

- 输出项：`[METRIC] driver=sqlite r41_assessment_cache_user_id_is_null=2`；缺该项即在 `REQUIRED_METRICS` 里 → `exit 1`（实证见诚实声明那条）。
- **"只观测、不处置"的硬约束由机器取证**：`--self-test` 对 `account-audit.mjs` 本体做去注释后的写语句关键字扫描，命中数 = 0（命令 #2 原文）。全文件对 `assessment_cache` 只有一条 `SELECT COUNT(*)`；无 `UPDATE`、无 `DELETE`、无回填、无索引动作（§10.2 T-21 行明确"不得为此加索引"）。
- 前置时序（`02-tech-design.md:980`：`T-25 < T-21 判据⑧`）已满足：本轮临时库经**真实迁移路径**（`runSqliteMigrations` → `packages/server/src/scripts/migrate.ts`）建出，007 的 `ADD COLUMN user_id INTEGER DEFAULT NULL` 落列后 SELECT 成功。若 007 缺列，该 SELECT 会抛 `no such column` → 走 `[FAIL] sqlite 侧未出数` → **`exit 1` 而非降级跳过**，正是 §10.4 第 9 行要求的"缺列就是缺列"。
- 数字合规：输出里没有任何"23 账号 / 16 空密码"及其衍生数字（本轮临时库实测是 6 用户 / 3 空密码 / Q=2 / 无主行 2，全部来自 SELECT）。`[NOTE]` 行明确标注"本地库 ≠ 线上库，禁止进入任何验收材料"。

---

## 五、待 TPM 拍板项（本轮一律未自行改 PRD / 技术设计 / 判据）

1. **`package.json:18` 多了一行 `"release:preflight": "node scripts/release/preflight.mjs"`，而该文件按预拆要到 b 轮才建 → `pnpm release:preflight` 目前是坏的。** 取证：`git diff -- package.json` 显示这一行是**工作区未提交的新增**（HEAD `8d2e8ca` 里没有），即由他人（并发 agent）在 `package.json` 里预登记了 T-21 的入口。`package.json` 不在 §10.2 T-21 行的文件清单内，我**没有**动它（也没动 `git`）。请裁：谁在何时补 `preflight.mjs` 闭合这一行（建议 b 轮建脚本时自然闭合，无需额外授权；也可要求该行在 b 轮之前先撤回）。
2. **判据① 与出口命令的口径冲突（我做了自我限定，需追认）**：判据① 字面是"双驱动各一遍，缺任一项 exit 1"，而 §10.2 给的出口命令固定 `--driver sqlite`。按字面执行会让该命令在 a 轮恒红。我的实现取"**dry-run 允许单驱动判 0（但 `dual_driver.ok=false` 并打 NOTE 声明未达成），真实读取（`--execute`/`--i-know-this-is-prod`）必须双驱动否则 exit 1**"。这是我方的解释，不是文档原文——请认定或改判。
3. **两处"六项"不是同一套划分**：PRD 步 4（`:608`）的六项 = ①N ②M ③K ④P ⑤Q ⑥**四张表前后行数快照**；§10.2 T-21 判据① 的六项 = N/M/K/P/Q + **五类保留计数**。内容不重合（后者含 `profiles`，前者不含；前者含 users 全表快照）。本轮**两组全部输出**（合并成 16 个必需指标）以覆盖两种读法，但这是分歧不是共识，请 TPM 认定以哪个为准、或让 PM 在 §10.2 补一句把步 4 第⑥项写进必需项。
4. **步 4 第⑥项"测试前后的行数快照"在 a 轮只能出"前"**：只读观测面没有"测试后"这个时刻（它属于 b 轮 preflight 强制读回 / c 轮 reconcile）。我按 `step6_snapshot_*` 打了单侧基线并在注释里写明"测试后快照归 b/c 轮对账"。请确认这个归属划分不被理解成"步 4 第⑥项由 a 轮闭环了"。
5. **`--fixture` 的真造数落点越界**：本轮约定 `release_seed`，但 `tools/fixtures/schema-fixtures.json` 属 T-02，T-21 无权修改（我只读）。若 b/c 轮要用真造数而非 `builtinSeed()`，需要**要么**在 `scripts/release/fixtures/*.json` 新建（不越界，建议）、**要么**申请对 `tools/fixtures/` 的写权。请预先裁可，免得 b 轮再走一次越界申请。
6. **`ALERT_WEBHOOK_URL` 全仓零接线（记录不修）**：grep 过 `packages/`、`tools/`、`.github/`、`.env.example`，除 `.delivery/*` 文档外无任何代码读它，`packages/server/src/config.ts` 也没有该字段。这与 PRD §6.4-7"`ALERT_WEBHOOK_URL` 不是运行时开关、是部署期环境变量、不得加'未配置即启动失败'的校验"一致 → 我按 `process.env` 直读实现降级，**没有**去 `config.ts` 加字段（那属 `packages/server/src/**`，越界）。b 轮 `backup.ts` 才是真实消费方。另：§6.4-2b 第 1 行的 **U-2（具体 webhook 地址）尚未向用户回收**，所以步 5b (A)① 的"≤60 秒收到 1 条 / 成功 0 条"演练在 a 轮无法取证，只做到了 (A)② 的降级判定。
7. **只读 sqlite 的实现口径**：任务书要求 `file:…?mode=ro`，但仓内驱动是 better-sqlite3，它默认不开 `SQLITE_OPEN_URI`（传 URI 会被当普通文件名）。我用 `new Database(file, { readonly: true, fileMustExist: true })`（= `SQLITE_OPEN_READONLY`，同一语义），并在 summary 的 `targets[].uri` 里保留 `file:…?mode=ro` 字样作为可读标识。**若 TPM 坚持字面 URI**，唯一出路是换 `node:sqlite`（Node v22 下仍是 ExperimentalWarning，且与 `db/sqlite.ts` 的驱动不再同一）→ 请裁，我倾向维持现状。
8. **`profiles==N` 这条交叉校验的强度未定**：§6.4-4 只说"应恒等于"，没说不等即阻断。本轮它进 `gates` 但**不影响退出码**。要不要升级成阻塞项，请裁（升级后线上若有历史半状态账号会在步 4 直接红，这可能不是产品想要的）。

### 已知限制与 TODO（诚实列出）
- pg 侧 SQL 未在真库跑过（无实例）。`SUM(jsonb_array_length(w.data::jsonb))` 与 `SET default_transaction_read_only = on` 都按原文/标准写法实现，但 CI 第一次真跑有红的可能（例如 `wordbooks.data` 在 pg 侧若是 `jsonb` 则 `::jsonb` 冗余但合法；若测试账号无权 SET 则 pg 侧整条判 FAIL）。**属预期风险，不是已知缺陷。**
- `--out-dir` 归档路径未做任何越界限制（除 `resolveRepoPath`）。默认不写文件。b 轮若要写 `backups/manifest.json` 请在那一侧加约束。
- 日志文件固定在 `%TEMP%\tm-t21-<pid>\account-audit.log`；带 `--db` 运行时 TMP_ROOT 仍会被创建（只为放日志），跑完不清理。无功能影响，记录在案。
- 未跑 `pnpm -r typecheck/test/ddl-parity`（见命令 #10）。

### 给测试（QA）的提示
- 重点测"**它会不会假装绿**"：① 人为删掉临时库的 `users` 表列 → 应 `exit 1` 且打缺失项；② 造一个 `profiles` 行数 ≠ N 的库 → `sqlite/profiles==N` 应为 FAIL 但退出码仍 0（当前设计，见待拍板第 8 项）；③ 空密码集合里混入 `password='   '`（纯空白）→ N 应包含它（TRIM 口径）；④ 带 `ALERT_WEBHOOK_URL` 环境变量跑一次 → `[RED]` 行应换成"已配置（host=…）"且**URL 本体不得出现在任何输出里**（只打 host，防密钥泄漏到发布报告）。
- 我没测到的路径：pg 真库全链路；`--i-know-this-is-prod` 指向真 `data.db`（**故意没跑**，那是只读但仍是真库，且步 4 明令禁本地数字）。

### 越界申请
无。本轮未修改任何他人名下文件；未见到需越界修复的项（并发提示里那三个文件我一行都没读也没改）。

### 契约偏差
无 API 契约改动。仅两处实现口径请追认：待拍板第 2 项（单/双驱动的退出码解释）与第 7 项（`mode=ro` 的等价写法）。
