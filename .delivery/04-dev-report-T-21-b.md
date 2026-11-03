# 04 开发报告 · T-21b（发布护栏脚本 · 判据②③④⑤）

- **任务代号**：T-21b-r3（接力轮 / 对账轮）
- **判据原文**：`.delivery/02-tech-design.md` 第 **918** 行（T-21 行）②③④⑤ 四条；PRD `.delivery/01-prd.md` §6.4-2 步 5 / 5b / 5c / 6 / 6b / 7 = 第 **609–614** 行（清单 v1.5 起 15 项，步 6b 自 v1.5 由两条 `ADD COLUMN` 扩为**三条**）
- **本轮性质**：**只读对账**。实现改动 **0 行**（无笔误修正，`backup.ts` 的 ` M` 状态是 T-21b 前轮留下的既有改动，本轮未再触碰）
- **完成时间**：2026-09-21（本机 Windows / Git Bash / node）

---

## 0. 结论速览

| 判据 | 一句话 | 结论 |
|---|---|---|
| ② 步 5 快照 + 校验和入 manifest | `VACUUM INTO` 出 `backups/pre-release-v2.0.0.db`，size=126976 > 0，sha256 与 size 写入 `backups/manifest.json` 条目 | **达成**（sqlite 侧；pg `.dump` 侧显式 SKIP） |
| ③ 步 6 恢复到临时实例并读出用户与词本 | 快照挂到 tmpdir 临时实例，`integrity=ok`，users/wordbooks 读出且与**源实例指纹全等** | **达成**（sqlite 侧；pg 侧显式 SKIP） |
| ④ 步 6b 三条 `ADD COLUMN` 后断言未回填 + hash 未变 + 四类账号 | 三条列存在且默认值合口径、`password` 逐行 hash 未变、五表 COUNT/SUM(id)/全行 hash 前后逐项相等、`assessment_cache` 行数与无主行数前后相等、迁移源码零回填扫描 hits=0、四类账号齐备、Q 源=恢复 | **达成（含 2 处口径外移，见 §6 U-5/U-6）**；pg DDL parity（②-b）显式 SKIP |
| ⑤ 步 7 `--rollback` 连新 schema 冒烟并出 (a)(b)(c)(d) | 四条结论逐条已输出；(a)(c)(d) 结构面已证，真机/预发窗口部分**不是 PASS** 而是显式 SKIP | **达成（脚本面）**；真机实测面显式 SKIP → §6.4-2b |
| 数据红线 | `data.db`（根 + `packages/server/`）改前/改中/改后 **size+mtime+sha256 三项一字未变** | **合规** |

**出口命令总次数：3**（self-test / 全流程 dry-run / 只读核对），未超 6 次上限。
**本轮未跑全套测试**：本轮无实现改动，且 3 个 agent 并行共用同一工作区，全套数字无对账价值（见 §7 L-5）。

---

## 1. 交付物清单

| 路径 | 行数 | 状态 | 本轮动作 |
|---|---|---|---|
| `scripts/release/lib.mjs` | 721 | 前轮已交（T-21a） | 只读引用（安全阀 / `stripJsComments` / SQL 关键字表 / tmpdir seed） |
| `scripts/release/account-audit.mjs` | 424 | 前轮已交（T-21a，判据①⑧ 闭合） | 只读静态扫描纳入 self-test |
| `scripts/release/preflight.mjs` | 333 | 前轮已交（TPM 亲跑 `--self-test` PASS） | 只读静态扫描纳入 self-test（严格命中 0） |
| **`scripts/release/restore-drill.mjs`** | **1469** | 前轮已交，**本轮首次真跑取证** | 只读执行 + 对账 |
| `packages/server/src/services/backup.ts` | 376 | 前轮已交（` M`） | 只读核对 `VACUUM INTO`（:250）/ `sha256File`（:144）/ `notified:false` 成功分支唯一写点（:277） |
| `backups/pre-release-v2.0.0.db` | 126976 B | **本轮产物**（判据②） | 本轮 `--out backups` 生成；`.gitignore` 已忽略，不入 git |
| `backups/manifest.json` | — | **本轮产物**（判据② 台账） | 本轮首次出条目（`manifest_entries=1`） |

**技术设计第 918 行明列、但盘上不存在的交付物**：`scripts/release/reconcile.mjs`、`scripts/release/README.md`、`backups/.gitkeep`、`packages/server/test/release/backup.spec.ts`（`test/release/` 整个目录不存在）→ 逐条见 §6。

---

## 2. 判据②③④⑤ 对账表

证据列的 `[GATE]/[METRIC]` 均出自 §3 命令 2 的实跑输出（`--dry-run` 缺省态 + tmpdir 自建源实例）。

### ② 步 5：快照产物 + size>0 + sha256 入 `backups/manifest.json`

| 子判据 | 实现位置 | 证据 | 结论 |
|---|---|---|---|
| 产物目录只准 `backups/` 或 tmpdir | `restore-drill.mjs:391` `assertSnapshotOutDir()` | `[GATE] 步 5/产物目录纪律 → PASS :: E:\CC\tomorrow-memory\backups`；self-test (2) 段 `REJECT E:\CC\tomorrow-memory\data.db` | 达成 |
| `VACUUM INTO`（源库只读、一字不动） | `restore-drill.mjs:600-611` `vacuumInto()`（全文件唯一产物写点）；服务端侧 `backup.ts:250` | `[GATE] 只读执行面 … 仅 1 处 VACUUM INTO → PASS :: 93 条 · 非只读 0 条` | 达成 |
| 文件命名 `pre-release-<tag>.db` | `restore-drill.mjs:403` `snapshotFileName()` | `[METRIC] snap_file=E:\…\backups\pre-release-v2.0.0.db` | 达成 |
| size > 0 | 门：`restore-drill.mjs:1052` | `[METRIC] snap_size_bytes=126976` + `[GATE] ② 步 5/快照产物存在且 size>0 → PASS` | 达成 |
| sha256（64 hex） | `restore-drill.mjs:613` `sha256Of()` / 门 `:1057` | `snap_sha256=746fb512…956876fe` → PASS | 达成 |
| 写入 `backups/manifest.json` | `restore-drill.mjs:617` `MANIFEST_SCHEMA` / `:640` `upsertManifest()` / 门 `:1081` | `[GATE] ② 步 5/manifest.json 已写且条目含 sha256 → PASS` · `[METRIC] manifest_entries=1`；台账实测条目含 `size_bytes`/`sha256`/`created_at`/`source_instance`/`source_table_counts` | 达成 |
| pg 侧 `pg_dump -Fc` → `.dump` | `--driver pg` 分支 | `[SKIP] pg 驱动未执行：本机无 PostgreSQL 实例、DATABASE_URL_TEST 未设置。这不是 PASS。` | **显式 SKIP**（A-18-3 → 归 T-22 CI） |

### ③ 步 6：快照恢复到临时实例并读出用户与词本

| 子判据 | 实现位置 | 证据 | 结论 |
|---|---|---|---|
| 恢复到临时实例 | `restore-drill.mjs:525` `measure()`；实例落 tmpdir（`tm-t21-67180/`） | `[GATE] ③ 步 6/恢复到临时实例并读出用户与词本 → PASS :: integrity=ok · users=7 · wordbook_rows=5 · entries=8` | 达成 |
| 读出「用户」 | 门：`restore-drill.mjs:1129`/`:1137` | `restored_users=7` · `restored_users_fp=756cc01fe2f4147c` | 达成 |
| 读出「词本」 | 同上 | `restored_wordbook_rows=5` · `restored_wordbook_entries=8` · `restored_wordbooks_fp=683cf1253538b7b6` | 达成 |
| 恢复等价性（不只是"能打开"） | `restore-drill.mjs:464` `rowHash()` / `:1137` | `[GATE] ③ …与源实例指纹一致（user_id 集合 + users 全行 + wordbooks 全行） → PASS :: 集合指纹 3c9097ac863f vs 3c9097ac863f` · `[METRIC] fingerprint_vs_source=EQUAL` | 达成 |
| "读不回 = 没有可用备份"阻断口径 | 门：`restore-drill.mjs:1142` | `[GATE] ③ 步 6/快照读不回 … → PASS :: 可读回` | 达成 |
| 步 6 的只读无主计数（R-41⑦ 基线） | 归 `account-audit.mjs`（T-21a 已闭合）+ 本文件 `ac_orphan_*` | `[METRIC] ac_orphan_before=3 / ac_orphan_after=3`（本地样例口径） | 达成（本地样例面） |
| 步 6 对账 5 项 × ≥20 真实账号（L5 diff-sample） | **无实现**（`preflight.mjs:244` 仅一条文案引用） | — | **未实现** → §6 U-1 |

### ④ 步 6b：三条 `ADD COLUMN` 后断言未回填 / hash 逐行未变 / 四类账号 ①-⑧

| 子判据（PRD :613 口径） | 实现位置 | 证据 | 结论 |
|---|---|---|---|
| 走真实迁移路径、脚本本体零 DDL | `restore-drill.mjs:418` `runMigrate()` / `:447` `migrateStatus()` / 门 `:1154`/`:1165` | `[GATE] ④ 步 6b/待执行清单含 007… → PASS` · `[GATE] ④ 步 6b/迁移路径重放退出码 0 → PASS :: 已重放 007-assessment-cache-user-id` | 达成 |
| ① 三列存在 + 默认值合口径（两列 0 / `user_id` NULL） | 门：`restore-drill.mjs:1194`，列清单 `:100` `NEW_COLUMNS` | `[METRIC] three_columns_present=users.pw_policy_version\|users.password_changed_at\|assessment_cache.user_id` → PASS | 达成 |
| ① 存量 `password` 逐行 hash 未变 | `:464` + 门 `:1203` | `[METRIC] pw_rowhash_before=7c3f4981a83ad222` = `pw_rowhash_after` → PASS | 达成 |
| ① 五表 COUNT / SUM(主键) / 改造前列集全行 hash 前后逐项相等 | 门：`restore-drill.mjs:1214` | `table_counts_before` = `_after`、`table_sumid_before` = `_after`、`table_rows_hash_before` = `_after`（users/wordbooks/fsrs_cards/checkin_logs/assessment_cache 五项逐一） → PASS | 达成 |
| ① `assessment_cache` 行数与"无主行数"前后相等、存量一律无主 | 门：`:1225` / `:1231` | `ac_rows 3→3` · `ac_orphan 3→3` · 内容 hash `43e074a4d5bde7e1→43e074a4d5bde7e1` → PASS | 达成 |
| ② **未执行任何回填**（无 `UPDATE users SET pw_policy_version` / 无 `UPDATE assessment_cache SET user_id`） | `restore-drill.mjs:664` `scanMigrationsForBackfill()`（禁令表 `:667-680`）/ 门 `:1239` | `[METRIC] backfill_scan_hits=0`（`_informational=5` 为其余文件 `down()` 的删表语句）→ `[GATE] ④ 步 6b②/迁移源码零回填 → PASS :: 扫 9 个迁移文件` | 达成 |
| ② 真执行面（不是幂等跳过）——「④-bis 副本腿」 | `restore-drill.mjs:799` `legacyAddColumnLeg()` + `:745` `statStamp()` + `:751` `measureLegacyShape()`；门 `:832/840/849/856/865/879/887` | `legacy_columns_pre_absent=三列均 absent` → `legacy_migrate_exit=0` → `legacy_alter_statements_executed` 三条逐字命中 `3/3` → `[SchemaDiff] 0 处差异` → `legacy_pw_rowhash_before=158c787b57c74dd5` = `after` → `legacy_user_id_default_null=NULL` | 达成 |
| ②-b 三列 sqlite/pg 等形（`tools/ddl-parity.mjs`） | 门：`restore-drill.mjs:1257` | `[GATE] …退出码 0 → PASS`，但尾行为 `⚠ 这不是通过：B/C 的"双驱动行为一致"这一层本机跑不到` → **退出码 0 ≠ 双驱动等形已证** | **部分**：A 段（sqlite 侧）达成；pg 侧**显式 SKIP** → T-22 CI |
| ③ `pw_policy_version=0` → `upgrade_required` + upgrade token、业务接口 403 | **脚本面只做取数与分类**（`:1276` 门 + `:1291` NOTE）；行为断言归 R-40 服务端用例 | `[NOTE] 6b③④⑤⑦ 的登录面 … 属服务端接口行为，判据落在 R-40 用例与 §6.4-2b 人工演练；本脚本只出取数面` | **口径外移** → §6 U-5 |
| ④ 改密后旧 token 401 / 新 token 可用 / `pw_policy_version` 变 1 | 同上 | 同上 | **口径外移** → §6 U-5 |
| ⑤ upgrade token 打非改密接口被拒 | 同上 | 同上 | **口径外移** → §6 U-5 |
| ⑥ 空密码账号走激活、激活后即 `pw=1` 且不落强制改密页 | 四类账号造数 `restore-drill.mjs:481` `buildDrillSeed()`；分类门 `:1276` | `[METRIC] acct_class_short_pw0=2 · strong_pw1=1 · empty_pw=3 · activated=1` → `[GATE] ④ 步 6b③-⑧/四类账号在恢复实例上齐备且可分类 → PASS` | 达成（齐备+可分类面）；激活后的接口行为随 ③④⑤ 外移 |
| ⑦ 上线时刻零掉线（未改密存量 token 仍可用） | 同 ③④⑤ | 同 `:1291` NOTE | **口径外移** → §6 U-5 |
| ⑧ 步 4 的 Q 与临时实例"会被拦下人数"同口径一致 | 门：`restore-drill.mjs:1286` | `[METRIC] q_source=2 / q_restored=2` → `[GATE] ④ 步 6b⑧/…Q 同口径一致（Q 的 SQL 排除空密码 → 空密码号不被误判需升级） → PASS :: Q 源=2 恢复=2 · 空密码=3` | 达成（**本地自洽性**面；线上 Q 的绝对值仍待 Phase 7） |
| 硬约束：只观测、不处置 | `restore-drill.mjs:257` `ro()` 唯一只读入口（非 SELECT/PRAGMA 即抛）；门 `:1407` | `sql_surface_readonly_only=YES(93 条)` · `非只读 0 条`；`:667-680` 的 6 条 `UPDATE …` 均为 **`// SCAN-EXEMPT 检测式而非执行式`** 的正则字面量，非执行语句 | **合规，无回填逻辑** |

### ⑤ 步 7：`--rollback` 旧镜像连新 schema 冒烟，输出 (a)(b)(c)(d)

| 子判据 | 实现位置 | 证据 | 结论 |
|---|---|---|---|
| 旧镜像读面（不读新列仍能跑） | `restore-drill.mjs:721` `oldImageReadShape()`；门 `:1341` | `[GATE] ⑤ 步 7/旧列清单在新 schema 上只读执行不报错 → PASS :: users=7 assessment=1 wordbooks=5（列清单里不含三列）` | 达成 |
| 旧镜像写面结构合法 | 门 `:1348` | `old_image_write_shape_ok=nullable_default_null` · `PRAGMA table_info(assessment_cache).user_id → notnull=0 dflt=NULL` | 达成 |
| 旧镜像 tag 探测 | `restore-drill.mjs:706` `probeOldImage()` | `[SKIP] ⑤ 步 7 真机回滚演练：未提供 --old-image-tag / ROLLBACK_IMAGE … 这不是 PASS` | **显式 SKIP** |
| **(a)** 旧镜像读写新 schema + 三列不读不报错 | 门 `:1375`，正文 `:1366` | 已输出：结构面已证；"密码登录与注册在旧镜像可用"= SKIP（需真机/`--old-image-tag`） | 达成（输出面）+ 真机 SKIP |
| **(b)** 旧 APK 回滚后 查词→背词→同步 | `:1367` | 已输出：SKIP —— 需真机 + §6.4-2b 连续 2 小时预发窗口；并只读引用 R-17⑧ 键名红线 | 达成（输出面）/ 实测 SKIP |
| **(c)** 新 App 回滚前写入不丢不覆盖 | `:1368` | 已输出：结构面已证 —— `wordbooks` 行数 5、全行 hash `683cf1253538b7b6` 快照内外一致；真机抽样 SKIP | 达成（结构面）+ 真机 SKIP |
| **(d)** 回滚只回镜像、不动库 | `:1369` 附近 | 已输出：已证 —— `001`/`007` 均无可逆 `down`（`007` 带 `noDownReason`）、迁移源码零删列/删表、本脚本执行面无结构语句；"门禁失效但数据完好"属 R-40⑦ 接口面，本脚本不替代 | 达成 |
| 四条逐条输出的门（缺任一条即不成立） | `restore-drill.mjs:1375` + `REQUIRED_METRICS:319-322` | `[GATE] ⑤ 步 7/(a)(b)(c)(d) 四条结论逐条输出 → PASS` | 达成 |
| pg 侧回滚冒烟 | `:1437` | `[SKIP] 判据③④⑤ 的 pg 侧未真跑（显式 SKIP，非 PASS）→ CI 必须带 DATABASE_URL_TEST 补跑` | 显式 SKIP → T-22 |

---

## 3. 出口命令原文与输出摘要

### 命令 1 —— 只读取证自检（无写入）

```
node scripts/release/restore-drill.mjs --self-test
```
`EXIT=0`，28 行，末行 `→ self-test PASS`。关键输出：

- `6/6 路径判定符合预期；参数解析拒判 OK` —— 仓库根 `data.db`（未带 `--i-know-this-is-prod`）**拒**、`packages/server/data.db` **拒**、仓库根 `data.db` + dry-run **拒**、带 `--i-know-this-is-prod` 只读放行并标注、tmpdir 临时库 + dry-run 放行、非 tmpdir 外部库 + dry-run **拒**（`--dry-run（缺省态）只允许打开 os.tmpdir() 下的临时库`）
- 静态扫描（"只读 + 只写 backups/" 的机器取证）：`restore-drill.mjs 严格命中=0 · 带标记豁免=8 · 产物写点=1/1 · 快照写点候选行缺 INTO 且无标记=[]`；`preflight.mjs 严格命中=0 · 产物写点=0/0`；`account-audit.mjs 严格命中=0 · 产物写点=0/0`
- 目录纪律：`ALLOW %TEMP%\t21b` / `ALLOW …\backups` / `REJECT …\data.db → 快照产物目录必须叫 backups 或落在 os.tmpdir() 内`
- `(4) 只读语句入口 ro() 的判别力：OK（非 SELECT/PRAGMA 被拒）`

### 命令 2 —— 全流程演练（判据②③④⑤ 主证据）

```
node scripts/release/restore-drill.mjs --out backups
```
`EXIT=0`，667 行（缺省即 `--dry-run`：源实例自建在 `%TEMP%\tm-t21-67180\`，产物写 `backups/`）。计数：**GATE 全 PASS / 必需计数 44 项全出数 / [SKIP] 4 处（pg 驱动、pg 双驱动面、⑤ 真机回滚、pg 侧③④⑤）/ 无 FAIL**。
关键行（前 8 条 + 四条结论）：

```
[GATE] ② 步 5/manifest.json 已写且条目含 sha256 → PASS :: E:\CC\tomorrow-memory\backups\manifest.json
[METRIC] driver=sqlite snap_size_bytes=126976
[METRIC] driver=sqlite snap_sha256=746fb512b54701051adc7b3fb9b30e81c8f4630d55952ff9da61388e956876fe
[GATE] ③ 步 6/恢复到临时实例并读出用户与词本 → PASS :: integrity=ok · users=7 · wordbook_rows=5 · entries=8
[GATE] ④ 步 6b②/迁移源码零回填 … → PASS :: hits=0
[GATE] ④ 步 6b①/五表 COUNT(*) · SUM(主键) · 改造前列集全行 hash 演练前后逐项相等 → PASS
[GATE] ④-bis 三条 ADD COLUMN 的语句逐字出现在本次迁移的执行输出里（真执行，不是幂等跳过） → PASS :: 3/3
[GATE] 数据红线/复制源 data.db 全程未被写入：迁移前后 size+mtime 一字未变 → PASS
```
（(a)(b)(c)(d) 四条结论文本已完整落在输出 `===== 步 7 回滚演练四条结论 =====` 段，见 §2 ⑤ 表；全文留存于 `%TEMP%\t21b-r3\drill.txt`）

`backups/manifest.json` 实测条目（判据② 台账 + 步 4「哪个库、什么时候」自证义务）：
```json
{ "tag": "v2.0.0", "kind": "sqlite", "file": "pre-release-v2.0.0.db",
  "size_bytes": 126976, "sha256": "746fb512…956876fe",
  "created_at": "2026-09-21T00:56:38.417+08:00",
  "source_instance": "C:\\Users\\…\\Temp\\tm-t21-67180\\pre-migration-source.db",
  "source_table_counts": { "users":7, "wordbooks":5, "fsrs_cards":6, "checkin_logs":4, "assessment_cache":3 },
  "local_fixture_only": true, "restore_drill": null }
```
> `local_fixture_only: true` 是脚本自带的禁入义务标记 —— 上述数字与 §2 的 `users=23`（④-bis 副本腿的改造前形状）均为**本地 smoke-test 造数样例**，**不是现网事实**，按 PRD :608/:39 硬纪律**禁入公告、清单报告与验收材料**。本报告仅作为脚本自检样例并在此明确标注。

### 命令 3 —— 只读核对（文件指纹 / gitignore / 缺失交付物）

```
ls -la --full-time data.db packages/server/data.db ; sha256sum data.db
git check-ignore -v backups/manifest.json backups/pre-release-v2.0.0.db
ls scripts/release/ ; ls packages/server/test/release/
```
输出要点：`backups/manifest.json`、`backups/pre-release-v2.0.0.db` 均命中 `.gitignore:29 backups/`；`scripts/release/` 下只有 4 个 `.mjs`（无 `reconcile.mjs`、无 `README.md`）；`packages/server/test/release/` **不存在**。

---

## 4. `data.db` 只读自证

跑任何脚本**之前**先取指纹，跑完**两次**复核（命令 2 之后、命令 3 之后）：

| 时点 | 文件 | size | mtime（含纳秒） | sha256 |
|---|---|---|---|---|
| 跑前（基线） | `data.db` | 253952 | 2026-09-18 04:05:38.198449400 +0800 | `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` |
| 命令 2 后 | `data.db` | 253952 | 2026-09-18 04:05:38.198449400 +0800 | `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` |
| 命令 3 后（终态） | `data.db` | 253952 | 2026-09-18 04:05:38.198449400 +0800 | `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` |
| 基线 / 终态 | `packages/server/data.db` | 0 | 2026-09-17 00:10:53.374159200 +0800 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（空文件常量，未变） |

**三项（size / mtime 纳秒位 / sha256）逐字段全等 → 真实库文件全程未被写入、未做 DDL/DML、mtime 未动。**

脚本自身的内建同项自证（第二重证据，非本轮外挂）：
```
[METRIC] legacy_source_untouched=size=253952·mtime=1789675538198
[GATE] 数据红线/复制源 data.db 全程未被写入：迁移前后 size+mtime 一字未变（本脚本只读复制，绝不对它跑迁移） → PASS
```

**本轮写入清单（全部在 `os.tmpdir()` 与 `backups/` 内）**：
- `backups/pre-release-v2.0.0.db`、`backups/manifest.json`（判据② 指定产物，`.gitignore` 已忽略）
- `%TEMP%\t21b-r3\selftest.txt`、`%TEMP%\t21b-r3\drill.txt`（报告取证留存）
- `%TEMP%\tm-t21-67180\`（演练自建源实例 / 快照 / 恢复实例 / ④-bis 副本，跑完由脚本清理策略处置）
- 另：`%TEMP%\t21b\{exit.md, manifest.json, pre-release-v2.0.0.db}` 与另外 6 个 `tm-t21-*` 目录为**前轮 / 并行 agent 遗留**，本轮未读写。

---

## 5. 判据④ 硬约束合规结论（"只观测、不处置"）

1. 本文件执行面 **93 条语句全部以 SELECT/PRAGMA 开头，非只读 0 条**；唯一非只读写点是 1 处 `VACUUM INTO` 的**产物侧**（源库只读打开）。
2. 全文件与 `preflight.mjs`、`account-audit.mjs` 的静态扫描 **严格命中 = 0**；`restore-drill.mjs` 的 8 处带标记豁免经交叉核对全部是 `// SCAN-EXEMPT 检测式而非执行式` 的**正则字面量**（`:667-680`），用于扫描迁移源码是否含回填，**不是**脚本自己执行 `UPDATE assessment_cache` / `DELETE`。
3. `backfill_scan_hits=0`（9 个迁移文件全扫）。
4. **未发现"脚本内出现回填/处置逻辑"这类缺陷 —— 无需上报红线违规。**

---

## 6. 上报未修（本轮按边界未动实现，交回 TPM 派下一轮）

| # | 事项 | 证据 | 影响 | 最小实现建议 |
|---|---|---|---|---|
| **U-1** | `scripts/release/reconcile.mjs` **整文件缺失**；判据⑦（L5 每档 `--mode diff-sample --n 20`）与 PRD 步 6 的"5 项 × ≥20 真实账号 diff 必须 = 0"对账面无脚本承载 | 技术设计 :918 交付物列 🆕`reconcile.mjs`；盘上 `ls scripts/release/` 只有 4 个 `.mjs`；全库 `diff-sample` 命中仅 `preflight.mjs:244` 一条**文案** | 判据⑥⑦ 不成立；步 6 对账只能人肉 | 新建 `reconcile.mjs`：`--mode diff-sample --n <N>` 复用 `lib.mjs` 的 tmpdir 只读连接，输出 `wordbooks 条数 / fsrs_cards 条数 / due 按天分桶 / 连续天数 / 打卡次数` 五项 + N/M/K/P/Q，并沿用 `ro()` 只读入口与 `REQUIRED_METRICS` 缺项 exit 1 的既有骨架 |
| **U-2** | `packages/server/test/release/backup.spec.ts` **缺失**（`test/release/` 目录都不存在）→ `backup.ts`（376 行，含 `VACUUM INTO` 与"成功不发通知"两条硬判据）**零单测覆盖** | `ls packages/server/test/release/` → No such file；技术设计 :918 交付物列明 🆕该 spec | 判据②的"服务端侧"与 5b 的"成功零通知"只有脚本自述、无测试锁 | 按 T-21a 报告同形补：tmpdir 临时库跑 `createBackup()` 断言产物存在 + `sha256` 稳定 + `notified===false`；构造只读目录/断链触发失败分支断言 `notified===true` 且 `ALERT_WEBHOOK_URL` 未配置时不抛 |
| **U-3** | `scripts/release/README.md` 缺失 + `backups/.gitkeep` **在现网 `.gitignore` 下做不到** | `.gitignore:29 backups/`（另 :83 `backups/*.db`）；`git check-ignore -v` 双命中；`manifest.json` 的 `_git_note` 已自行登记为待拍板 | 技术设计 :918 明列"仓库放 `.gitkeep` + schema 说明"这一条与仓库现状**规则级冲突**，且快照台账不入 git ⇒ 归档面完全依赖部署产物 | **待 TPM 拍板**（不自行改 `.gitignore`）：方案 A 加 `!backups/.gitkeep` + `!backups/manifest.json` 两条例外（保 schema 台账可评审，产物仍忽略）；方案 B 承认"归档 = 部署产物"、把技术设计该条就地打戳更正，README 单独补 |
| **U-4** | manifest 条目的 `restore_drill` 字段**恒为 `null`** —— schema 声明（`:633`）承诺"该快照的恢复·回填·回滚演练结论（判据③④⑤）"，实现（`:1075`）没回填 | 命令 2 实跑输出的台账 `"restore_drill": null` | 判据② 的台账只到"校验和"层：光看 `manifest.json` 看不出这份快照是否演练过 ⇒ 发布窗口易出现"有备份无演练" | 在 main() 末尾（现有 `:1407` 只读面门之后）对 `upsertManifest()` 追加一次同 `tag` 条目的 `restore_drill` 更新，内容为 `{restored_integrity, fingerprint_vs_source, backfill_scan_hits, rollback_conclusion_a..d, executed_at, local_fixture_only}`；仍走唯一产物写点，不加新写面 |
| **U-5** | 判据④ 的 **6b③④⑤⑦ 四条登录面**（`upgrade_required` + upgrade token 不含正常 token / 改密后旧 token 401 / upgrade token 打非改密接口被拒 / 上线时刻零掉线）脚本**明确不外延**，只出取数与分类；PRD :613 把这四条写成步 6b 的**判据本体** | `restore-drill.mjs:1291` `[NOTE] …属服务端接口行为，判据落在 R-40 用例与 §6.4-2b 人工演练` | 若 R-40 的服务端用例未真实覆盖这四条，步 6b 就是**实质缺项**（本脚本的"③-⑧ 齐备可分类"顶不上去） | 交 TPM 先做一次**跨任务核对**：确认 T-07/T-08 名下是否已有这四条的接口用例并绿；若无，最小实现是在 `restore-drill.mjs` 的恢复实例上直接调用 `auth-service` 的登录/改密函数出四条布尔量（**但需追加 import 授权**，现授权面只有 `backup.ts`/`feature-flags.ts`/`wordbook-service.reconcileFor`，不得自行扩） |
| **U-6** | **A 腿的 `init()` 同形问题**：全新库经 `migrate.ts` 建表时，`sqlite.ts` 的 `assessment_cache` 建表串与 007 同形 ⇒ 007 在 A 腿"待执行"里为空，"两条 ADD COLUMN 已在源上真执行"是靠**说明**而非在该腿证成；真正的"逐字执行"证据由 ④-bis 副本腿兜底 | 命令 2 第 4–5 行：`[GATE] ④前置/…恰为 007… → PASS` 紧接 `[NOTE] A 腿口径说明：migrate.ts 先 db.init() 建当前 DDL，而 sqlite.ts 里 assessment_cache 的建表串与 007 同形…` | 报告读者/AI 评审容易把 A 腿当成"三条 ADD COLUMN 已真执行"的证据，而它实际只证了幂等路径 | 把 ④-bis 提升为判据④ 的**主证据腿**（或把 `:4-5` 的 NOTE 改成 `[GATE]` 并在 REQUIRED_METRICS 里加 `addcolumn_executed_verbatim_leg=B`），避免两腿口径混读 |

---

## 7. 遗留清单

| # | 遗留 | 归属 | 备注 |
|---|---|---|---|
| **L-0** | **并发工作区状态提醒**：本轮终态 `git status` 显示 `.gitignore`、`apps/web/**`、`packages/server/src/**` 等多处为并行 agent 的未提交改动（**本轮除 `backups/` 产物与本报告外未改任何文件**）。U-3 引用的 `.gitignore:29 backups/` 行号在下一轮需重新核对 | 本轮 / 收口轮 | 报告内所有 `文件:行号` 引用以 2026-09-21 本轮取证的磁盘状态为准 |
| L-1 | 判据②③④⑤ 的 **pg 侧全部**（`pg_dump -Fc` `.dump`、pg 恢复、pg DDL parity ②-b 的 B/C 段、pg 回滚冒烟）本机无实例 ⇒ 显式 SKIP | **T-22 CI**（A-18-3 既有裁决认可） | 脚本已自带 `CI 必须带 DATABASE_URL_TEST 补跑` 的登记文案（`:1437`）；CI 未补跑前，判据④ 的"双驱动各跑一遍"不能算闭合 |
| L-2 | 步 7 的**真机回滚实测**：(a) 旧镜像上密码登录/注册可用、(b) 旧 APK 查词→背词→同步、(c) 回滚后抽样条数 ≥ 回滚前 | **§6.4-2b 第 5 行**（用户提供的连续 2 小时预发窗口）+ 步 12 人工签字 | 纸面推演按 PRD :614 判"未做"，脚本已如实标注"这不是 PASS" |
| L-3 | 判据⑥（开关初值 + 实测改值 ≤60 秒生效）、判据⑦（L5 diff-sample） | T-21 后续轮 / 见 U-1 | 本轮范围只有②③④⑤ |
| L-4 | 判据① 的 N/M/K/P/Q + 五类保留计数 **线上真实库实测**、步 6 的无主 `assessment_cache` **线上**基线 | **未实测，待 Phase 7 向用户索取只读访问** | 本轮所有出数均为 `local_fixture_only: true` 的本地样例，禁入验收材料 |
| L-5 | 全套测试/`typecheck` 未跑 | 本轮 | 本轮零实现改动；3 agent 并行共用工作区，全套数字可能瞬时红，跑了也无对账价值 ⇒ 请 TPM 在收口轮以单 agent 状态跑并标注"疑似并发所致" |
| L-6 | `%TEMP%` 下 7 个 `tm-t21-*` 演练目录与 `%TEMP%/t21b/` 遗留 | 清理类 | 均在 tmpdir 内，不污染仓库；如需可在收口轮统一删 |

---

## 8. 一句话交付判定

**判据②③④⑤ 在 sqlite 侧全部由真实执行取证成立**（`--dry-run` + tmpdir 临时实例，除 `backups/` 产物外面全程只读，`data.db` 三重指纹自证未动）；**pg 侧与真机窗口侧为脚本自带的显式 SKIP，不伪装 PASS**，分别归 T-22 CI 与 §6.4-2b；**6 项未修/待拍板**（U-1 `reconcile.mjs` 缺失、U-2 `backup.spec.ts` 缺失为实质缺项，U-3/U-4/U-5/U-6 为口径与归档面问题）交回 TPM 派下一轮。
