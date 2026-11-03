# `scripts/release` —— 发布护栏脚本（T-21）

一句话：**"备份存在 ≠ 备份可用"**，所以这四条脚本把 PRD §6.4-2 的 15 步清单里**能被机器判定**的那几步做成可执行门禁，
全部受同一条纪律约束：**除产物外面全程只读；写只落在 `os.tmpdir()` 与 `backups/`**。
指向真实库必须显式 `--i-know-this-is-prod`，否则安全阀直接 `exit 2`。

判据原文 = `.delivery/02-tech-design.md:918`（§10.2 T-21 行，判据①–⑧）。

---

## 1. 四个脚本各干什么

| 脚本 | 承载判据 | 做什么 | 只读性 / 写面 |
| --- | --- | --- | --- |
| `preflight.mjs` | 串起①–⑧的可执行入口 | 一键按顺序真调下面三个子脚本并汇总成 §6.4-2 清单状态表；自己只额外承担 **步 5c**（先迁移再起服：真实迁移路径 + `migrate --status` 只读核对）与 **步 8**（开关初值读回 + 改值 ≤60 秒生效实测） | 本体零产物写入；只在 `%TEMP%/tm-t21-<pid>/` 下落临时库、日志与步 8 harness |
| `account-audit.mjs` | **判据① + 判据⑧** | 步 4 的六项计数 `N/M/K/P/Q` + §6.4-4 五类保留计数 + 无主测评缓存只读计数（`assessment_cache.user_id IS NULL`），sqlite / pg 各一遍 | 纯 `SELECT`；仅当显式给 `--out-dir` 才写 `account-audit-<ts>.json` 归档小结（**不写 manifest**） |
| `restore-drill.mjs` | **判据②③④⑤** | 步 5 `VACUUM INTO` 出 `pre-release-<tag>.db` + size>0 + sha256 入台账 → 步 6 恢复到临时实例并比对指纹 → 步 6b 三条加列后断言"零回填 + hash/COUNT/SUM 逐项未变 + 四类账号齐备" → 步 7 `--rollback` 旧镜像连新 schema 冒烟，出 (a)(b)(c)(d) 四条结论 | **本目录里唯一允许写 `backups/` 的脚本**（唯一产物写点 = `upsertManifest()`，见 §3）；缺省产物目录是 `%TEMP%/t21b`，只有显式 `--out backups` 才进仓库 |
| `reconcile.mjs` | **判据⑦**（+ 判据⑧ 的交叉校验位） | `--mode diff-sample --n 20`：五项（词本条数 / 卡条数 / due 按天分桶 / 连续天数 / 打卡次数）用**两条独立计算路径互校**，每项随一个 diff，任一 diff≠0 即 `exit 1`；随附与 `account-audit` 同名的 `N/M/K/P/Q` 口径位。`--mode assessment-orphan` 见 §4 | 纯 `SELECT`/`PRAGMA`，运行时守卫 `ro()` 拒绝其它语句种类；零产物写入 |
| `lib.mjs` | — | 上述四个脚本的共用层：参数面 `parseReleaseArgs`、安全阀 `assertSafeTarget`、只读连接、真实迁移入口 `runSqliteMigrations`、`tsx` CLI 定位 `tsxCliPath()`、计数注册表与 `requireMetrics`（缺项 → `exit 1`）、写语句静态扫描 `WRITE_STATEMENT_KEYWORDS`/`scanForWriteStatements`、告警通道 `getAlertChannel` | 不落产物（只写 tmpdir 日志） |

`preflight.mjs` 的 `--only` 可切段：`step4 | step5c | drill | step6 | step8`。
其中 **`step6`（对账基线 = 真调 `reconcile.mjs`）** 与 **步 5 的台账核对（真调 `restore-drill.mjs --manifest-check`）** 是 T-21c-v 装配进来的两处；
台账核对与 `drill` 段同进退（跳过演练就没有本轮台账可核对）。

## 2. 怎么跑

```bash
# 自检（只读取证，不建库不出数）—— 四个脚本都支持
node scripts/release/preflight.mjs      --self-test
node scripts/release/account-audit.mjs  --self-test
node scripts/release/restore-drill.mjs  --self-test
node scripts/release/reconcile.mjs      --self-test

# 本地全链演练（缺省即 dry-run：目标库 = tmpdir 自建临时库，仓库 data.db 不可达）
node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json

# 单段
node scripts/release/preflight.mjs --only step6      # 只跑判据⑦ 的对账基线
node scripts/release/preflight.mjs --only drill      # 快照·恢复·回填·回滚 + 台账核对

# 发布窗口的真实形态（显式三步动作，缺一不可）
node scripts/release/preflight.mjs --execute --i-know-this-is-prod --db <部署机库副本> --tag v2.0.0 --out backups
```

### 退出码语义（四个脚本一致）

| 码 | 含义 |
| --- | --- |
| `0` | 判据成立。**但 `0` 不等于"全表面成立"**：pg 侧与真机回滚演练在本机是**显式 SKIP**，只进 `summary.skipped`，不算 PASS |
| `1` | 任一判据不成立，或**必需计数缺任一项**（`REQUIRED_METRICS` / `REQUIRED_STEP8_METRICS` / 台账 `restore_drill` 缺项），或四个脚本任一 **soft 档门** `[GATE] … → FAIL` —— 缺项即红，报红即拦人 |
| `2` | 安全阀拒绝（dry-run 态指向仓库 `data.db` / `packages/server/data.db` 且未带 `--i-know-this-is-prod`）、CLI 非法、产物目录不合规，或四个脚本任一 **hard 档红线门**失败（hard 只收"触碰真库 / 契约破坏 / 静默丢数据"且逐条写理由） |

四个脚本的 inline 门统一由 lib 的 `gateExitContrib(registryGates())` 汇出（hard→2 / soft→1 / advisory→0，未登记档位从严按 soft；T-21d/T-21e）；`preflight` 的退出码再与子进程最坏值取最坏（任一子脚本 `2` 或 hard 门红 → `2`；任一非 `0` 或 soft 门红 → `1`）。只有各脚本分级表里逐条登记过理由的 `advisory` 白名单门报红不拦人。

---

## 3. `backups/manifest.json`

### 3.1 谁唯一写它

**唯一写入口 = `restore-drill.mjs` 的 `upsertManifest()`（A-51 #131）**，去重键是 `file` + `sha256`，条目上限 200 条。
其余三个脚本**都不写台账**：`account-audit` 只在 `--out-dir` 下另写 `account-audit-<ts>.json`；`preflight`/`reconcile`/`lib` 的写面全在 tmpdir。
这一"单一写点"由 `preflight --self-test` 的静态扫描兜底：自家三个 `.mjs` 里快照写点（`VACUUM INTO` 执行处）数量必须 = 1（只允许出现在 `restore-drill.mjs`）。

### 3.2 文档层（顶层键）

| 键 | 含义 |
| --- | --- |
| `schema_version` | 当前 `1` |
| `_doc` | 台账定位：PRD §6.4-2 步 5 的"校验和写入部署产物" |
| `_entry_schema` | 条目字段的人读说明（见 3.3） |
| `_git_note` | 归档面说明：仓库 `backups/` 被忽略 ⇒ **真归档面 = 部署产物，不是 git**（见 §5） |
| `updated_at` | 每次 `upsertManifest()` 刷新 |
| `entries` | 条目数组 |

### 3.3 条目字段

| 字段 | 含义 / 判据 |
| --- | --- |
| `tag` | 发布 tag（缺省 `v2.0.0`，由 `--tag` 决定） |
| `kind` / `driver` | `sqlite` \| `pg` |
| `file` | 相对台账所在目录的产物名：`pre-release-<tag>.db`（sqlite）/ `.dump`（pg，归 T-22 CI） |
| `size_bytes` | **判据②**：必须 > 0 |
| `sha256` | **判据②**：64 位十六进制校验和（与 `file` 一起构成去重键） |
| `created_at` | 产出时刻（含时区 ISO）——步 4 的"什么时候跑的"自证义务 |
| `source_instance` | 源库自证：绝对路径，或脱敏后的 `pg://host/db` |
| `source_table_counts` | 五表行数快照基线（⚠ 真实条数，见 §5 的忽略理由） |
| `local_fixture_only` | `true` = 数字来自本地样例造数，**禁入公告 / 清单报告 / 验收材料** |
| `restore_drill` | **该快照的恢复·回填·回滚演练结论（判据③④⑤）**。步 5 建条目时**如实为 `null`**（未演练 = `null`，不填占位）；主流程末尾对**同 `tag`·同 `file`·同 `sha256`** 的条目追加一次回填 —— 仍走 `upsertManifest()` 这个唯一写点，**不新增写面**（U-4 修法，A-45 #91 + A-51 #131） |

`restore_drill` 回填的必备字段（缺任一项 = 结论不完整 ⇒ 出口门与 `--manifest-check` 都 `exit 1`）：
`restored_integrity`、`fingerprint_vs_source`、`backfill_scan_hits`、`rollback_conclusion_a`…`rollback_conclusion_d`、
`executed_at`、`local_fixture_only`（另含 `failed_gates` 快照，记录回填时刻的门禁面）。

### 3.4 只读核对：`--manifest-check`

```bash
node scripts/release/restore-drill.mjs --manifest-check --out <产物目录> [--tag v2.0.0]
```

零写入模式：不开源库、不产快照，只 `readFileSync` 一份 `manifest.json` 并核对每条目 `restore_drill` 非 `null` 且字段齐全。
**fail-safe 取向**：不显式给 `--tag` ⇒ 匹配 0 条目 ⇒ `exit 1`（防"忘给参数 = 放过"）；`preflight` 因此总是把 tag 补齐后再调它。
这条检查在 `preflight` 里的位置 = 步 5/7 检查清单，语义是**"有备份无演练 → 预检即红"**。

---

## 4. 判据⑧ 的主从口径（A-47 #104 L-6）

| | 承载 | 地位 |
| --- | --- | --- |
| **唯一发布出口** | `account-audit.mjs` 的计数项 `r41_assessment_cache_user_id_is_null`（在 `REQUIRED_METRICS` 里，缺项即 `exit 1`） | ✅ 发布报告只看这一处 |
| **交叉校验** | `reconcile.mjs --mode assessment-orphan`（输出 `assessment_orphan_rows` / `assessment_total_rows`） | 🔍 并存，但**不是**发布出口；用来独立复核上式那条 `SELECT COUNT(*) FROM assessment_cache WHERE user_id IS NULL` |

两处并存是**有意的**（同一判据两条计算路径），但**主从已定**：`preflight` 步 4 挂的是 `account-audit`，`reconcile` 只挂 `--mode diff-sample`。
硬约束两侧同口径：**只观测、不处置** —— 脚本内不得出现任何该表的回填或删除逻辑（由 `--self-test` 的写语句静态扫描 + 运行时 `ro()` 守卫双重取证）；
该计数是**下一期清理窗口的输入**，不是本期的动作项，也**不要求为 0**。

---

## 5. `backups/` 的 git 纳入口径（A-45 #89 拍板的混合方案）

1. `.gitignore:29 backups/` **不改**；只加了**一条例外行** `!backups/.gitkeep`，仓库放了 0 字节的 `backups/.gitkeep` 占位，目的是让"目录 + 占位"这一层面可评审。
2. **`backups/manifest.json` 与一切快照产物（`pre-release-*.db` / `*.dump` / `account-audit-*.json`）维持忽略，禁止入库。**
   理由（不是洁癖）：台账里带 `source_table_counts` 等**真实条数**，而本仓有硬纪律 —— 本地 `data.db` 的 smoke-test 条数**禁止出现在公告、清单报告或验收材料里**；
   把台账提交进 git 等于给这条纪律开一个永久破口。
3. ⚠ **实测事实（T-21c-v 留档，请 TPM 知悉）**：只要 `backups/` 这条目录级排除还在，`!backups/.gitkeep` 就是**惰性的** ——
   git 的规则是"父目录被排除时，其内文件无法再被重新纳入"。`git check-ignore -v` 对 `backups/.gitkeep` 报的仍是 `.gitignore:29:backups/`。
   两个候选收口法（**均超出本轮授权，未自行实施**）：
   - ① 把目录规则换成 `backups/*` + `!backups/.gitkeep`（产物与 `manifest.json` 继续被 `backups/*` 与 `backups/*.db` 挡住）；
   - ② 规则不动，由 TPM 在 Phase 8 的入库窗口一次性 `git add -f backups/.gitkeep`。
     本仓既有纪律是"**`git add -f` 是 git 写操作，任何 agent 都不许做**"（`.gitignore` 内 E1b 段的同款说明），所以本轮**未执行**。
4. 结论：**归档面的真相在部署产物，不在 git**。发布窗口的台账必须随产物归档（`--out backups` + 把 `manifest.json` 拷进发布记录），而不是指望版本库。

---

## 6. 数据红线（四条脚本共同遵守，可机检）

- 仓库根 `data.db` 与 `packages/server/data.db` **只读**：dry-run 态命中它们且未带 `--i-know-this-is-prod` → `exit 2`。
- 每条脚本的 `--self-test` 都会**静态扫描自家源码**（写关键字表在 `lib.mjs`，扫描前先去注释、**不去字符串**），并要求严格命中 = 0；
  `restore-drill.mjs` 只允许那 1 处快照产物写点。检测式正则（步 6b 用来扫迁移文本的那些）走 `SCAN-EXEMPT` 显式标记，不靠放宽规则。
- 运行时还有第二道闸：`reconcile` / `restore-drill` 的每条语句都过 `lib.mjs` 的 `ro()`，只收 `SELECT`/`PRAGMA`，执行面整表在输出里打印（`[SQL-SURFACE]`）。
- 本地样例库出的任何数字 = `local_fixture_only: true`，**只用来证明"脚本有判定力"**，禁入任何验收材料。

## 7. 本机取不到证、必须去线上取的口径（一律标"未实测"）

| 项 | 归属 |
| --- | --- |
| 判据⑦ "≥20 **真实账号** 五项 diff=0" | Phase 7 向用户索取线上生产库**只读**访问后真跑（脚本面已挂载、已出数） |
| 判据① 的 `N/M/K/P/Q` + 五类保留计数、判据⑧ 的无主计数 | 同上（PRD 步 4 要求"是一次显式动作" = `--i-know-this-is-prod`） |
| 判据②③④⑤⑦⑧ 的 **pg 侧**（`pg_dump -Fc` `.dump`、pg 恢复、pg DDL parity、双驱动） | **T-22 CI**（带 `DATABASE_URL_TEST` 的 runner；本机无 PostgreSQL 实例，脚本出显式 SKIP） |
| 步 7 真机回滚实测、步 9 真机 + 旧 APK 两例 | §6.4-2b 用户提供的连续 2 小时预发窗口 + 步 12 人工签字 |
| 判据⑥ 的**真机侧**（线上实例改值 → 服务端 ≤60 秒生效） | Phase 7（本机只有 tmpdir 侧的同进程 + 跨进程 30 秒 TTL 双路径实测） |

**需要用户本人给的三件东西**（Phase 7 前必须闭环，否则以上四行无法收口）：
① **F-6 告警目标地址**（`ALERT_WEBHOOK_URL`，步 5b 的"失败必须可见"目前只能证降级分支）；
② **U-1 keystore 的仓库外双备份位置与访问人**（PRD §9-6 未回收项，T-22 CI 判据⑨ 的前置）；
③ **线上生产库的只读访问**（判据①⑦⑧ 的真实取证对象）。
