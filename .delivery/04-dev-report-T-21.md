# 04-dev-report · T-21 全任务总报告（批次4 发布护栏 · 由 T-21c-v 收口）

- **任务代号**：T-21c-v（批次4 发布护栏**最后一轮** = 装配 + 台账说明 + 总报告）
- **上游裁决**：A-45 #88/#89/#91/#92、A-47 #104/#105、A-49 #110/#111、A-51 #131/#132/#134（**只读命中行**，未通读任何主文档）
- **判据原文**：`.delivery/02-tech-design.md:918`（§10.2 T-21 行，**逐字核对后确认判据编号止于 ⑧** —— 见 §2.1 的编号澄清）
- **文件面（本轮只动这 5 个）**：🆕`scripts/release/README.md`、🆕`.delivery/04-dev-report-T-21.md`、✏️`scripts/release/preflight.mjs`、✏️`scripts/release/lib.mjs`、✏️`.gitignore`（**1 行**）+ 🆕`backups/.gitkeep`（0 字节）
- **禁改面自证**：`account-audit.mjs`（mtime `09-20 12:45:34`）/ `restore-drill.mjs`（`09-21 01:34:28`）/ `reconcile.mjs`（`01:43:32`）三件的 mtime **全部早于本轮第一次写盘（`01:50:59`）** ⇒ 本轮只**调用**它们，一字未改；`packages/**`、`apps/**`、`tools/**`、`docs/**`、其余 `.delivery/**` 同样零触碰（`scripts/release/` 整目录本就未入库，见 §7 的 git 面实测）
- **本轮结论一句话**：批次4 发布护栏的**脚本面已全部闭合并有实跑证据**；`preflight --self-test` **exit 0**、`reconcile --self-test` **exit 0**、全链 `--dry-run` 把两处新装配的检查**真调并出数**（其中台账核对判 **EXIT=1**，是真实缺陷信号而非接线故障，见 §9 V-2）；**所有"只有线上才能取得的口径"一律未实测**（§8）

---

## 1. 本轮交付五件

| # | 交付 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 🆕`scripts/release/README.md`：四脚本职责/跑法/退出码、`manifest.json` schema 与**唯一写点**、判据⑧ 主从口径、`backups/` 的 git 纳入口径、红线与未实测清单 | 交付 | 文件 157 行；§3.1「唯一写入口 = `restore-drill.mjs` 的 `upsertManifest()`（A-51 #131）」、§4 主从表、§5 git 口径 |
| 2 | ✏️`.gitignore` **只加一行** `!backups/.gitkeep` + 创建 `backups/.gitkeep`（0 字节） | 交付（但该行在当前目录级排除下**惰性**，实测留档 §7 + 上报 V-1） | `git diff .gitignore` 仅 +1 行；`manifest.json` 与 `pre-release-*.db` **维持忽略未动** |
| 3 | ✏️`preflight.mjs` 装配①：步 6 对账基线 **从 SKIP 改为真调** `reconcile.mjs --mode diff-sample --n 20`（U-5/L-1） | 交付，真调出数 | `:945-971`；dry-run 实跑输出 §5.2 |
| 4 | ✏️`preflight.mjs` 装配②：`restore-drill.mjs --manifest-check`（只读零写入）接进步 5/7 检查清单（iii 上报②） | 交付，真调出数且**判红**（门禁有效） | `:909-943`；dry-run 实跑输出 §5.1 + 判别自证 §5.3 |
| 5 | ✏️`lib.mjs` + `preflight.mjs`：`tsxCliPath()` 上收（A-49 #111），**函数体逐字照搬**，本文件改 import | 交付，**零可观察差异** | lib `:308-320`（新导出）；preflight 删本地版（`:251` 留指路注释）、`:55` 改 import、`:271/:301` 两处调用点不动。**上收后的真跑证据**：lib 导出版解析到 `node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/cli.mjs`（与本地版同一解析结果），且 §4.3 的 dry-run 里 **步 8（该函数的唯一消费方）`→ PASS`** |
| 6 | 🆕本报告（T-21 总报告） | 交付 | 本文件 |

**判定强度核对（"只许变严不许变松"）**：两处装配都把**子进程退出码塞进 `children`** ⇒ `softBad = children.some(c => c.code !== 0)` 现在多覆盖两条判据；`--only` 增加 `step6` 段（不减少任何原有段）；`not_implemented_here` 从 2 项缩到 1 项（判据⑦ 已承载）；未删除、未放宽任何既有门禁或断言。`preflight --self-test` 改后仍 **exit 0**（§4.1）。

---

## 2. §10.2 T-21 判据逐条对账表

### 2.1 先澄清编号（不自行造判据）

`02-tech-design.md:918` 的 T-21 行**只定义到判据⑧**（①步4计数 ②快照入台账 ③恢复到临时实例 ④6b零回填断言 ⑤回滚(a)(b)(c)(d) ⑥开关初值+≤60秒 ⑦`--mode diff-sample --n 20` ⑧无主测评缓存只读计数）。
任务书要求"①-⑩"，多出的两号在本仓另有真实出处，一并对账并**标明出处**，避免与 §10.2 混淆：

| 号 | 真实出处 | 承载 |
| --- | --- | --- |
| **⑨**（批次4 语境里出现的两义） | (a) §10.2 **T-11 行**的判据⑨（测评域 DTO 同形用例）；(b) **A-33-11 / RK-13** 的"CI secret keystore 与 `keystore-cert.sha256` 基线同 blob"这条签名判据 | (a) 归 T-11/T-25，不在 T-21 面；(b) **未实测，依赖用户给出 U-1 的仓库外双备份位置与访问人**（§8 第 2 件） |
| **⑩** | **R-24⑩**「例行备份成功不发通知 / 失败必发通知且含四要素 / 无 `ALERT_WEBHOOK_URL` 时降级不抛」 | `packages/server/test/release/backup.spec.ts`（c-ii 17 条 + c-vi 补 `runDailyBackupOnce()` 两支）⇒ 已达成，`@tm/server test` 由 TPM 复跑 **419→431 passed / 0 failed**（A-48 #116） |

### 2.2 判据①–⑧ 主表

| 判据 | 承载脚本 / 用例 | 本轮实跑证据（2026-09-21） | 状态 |
| --- | --- | --- | --- |
| **①** 步 4 输出 N/M/K/P/Q + 五类保留，**双驱动各一遍**，缺任一项 `exit 1` | `account-audit.mjs`（16 项 `REQUIRED_METRICS`）+ `preflight` 步 4 门 | `--dry-run --driver sqlite` → `account-audit.mjs EXIT=0` → `[GATE] 步 4 … → PASS`（log:219-220）；缺项门禁由 a 轮 `--self-test` 与 `requireMetrics` 兜底 | **脚本面达成**；**线上真实条数未实测**（Phase 7，§8 第 3 件）；本轮按 §10.2 出口命令走 `--driver sqlite`，**pg 侧归 T-22 CI** |
| **②** 步 5 产出 `backups/pre-release-<tag>.db`（`VACUUM INTO`），size>0 + sha256 入 manifest | `restore-drill.mjs` ②（唯一产物写点）+ `preReleaseSnapshot()`（服务端侧，`backup.spec.ts` 锁） | 本轮 dry-run：`restore-drill.mjs EXIT=0`、`[GATE] ② 步 5/台账 restore_drill 已回填且字段齐全 → PASS :: pre-release-v2.0.0.db → restore_drill.ok=true · verdict=PASS`（log:363）；A-45 #87 已独立复核 size>0 + sha256 | **sqlite 侧达成**；**pg 的 `.dump` 侧显式 SKIP → T-22 CI**（A-45 #87） |
| **③** 步 6 能把快照恢复到临时实例并读出用户与词本 | `restore-drill.mjs` ③（tmpdir 临时实例 + 指纹逐项相等） | `preflight` 步 6 行 `恢复到临时实例 + 指纹一致 → PASS`（log 状态汇总）；A-45 #87 判"users/wordbooks 读出与源指纹全等" | **达成（sqlite 侧）**；真机窗口侧不属本判据 |
| **④** 步 6b 三条加列后**断言未回填**、hash 逐行未变、四类账号①-⑧ | `restore-drill.mjs` ④ + **④-bis 副本腿（U-6 修复后 = 判据④ 主证据腿）** + `scanMigrationsForBackfill()` 零回填扫描 + `manifest.spec.ts` | `步 6b 三条 ADD COLUMN + 零回填断言 → PASS`；迁移源码零回填 hits=0（A-45 #87 复核）；副本腿由 A-51 #131 判"提为主证据腿、A 腿只证幂等" | **达成（sqlite 侧）**；6b 的 ③④⑤⑦ 四条**登录面**按 U-5 不外延 → 归 R-40/T-07 接口用例（**跨任务核对仍未做，见 §10 L-7**） |
| **⑤** 步 7 `--rollback` 旧镜像连新 schema 冒烟，输出 (a)(b)(c)(d) | `restore-drill.mjs --rollback`（结论四键已进台账 `restore_drill.rollback_conclusion_a..d`） | `步 7 旧镜像连新 schema + (a)(b)(c)(d) → PASS`；四条结论现在**进了台账**并被 `--manifest-check` 要求齐全（本轮装配后可机检） | **脚本面达成**；**真机/预发 2 小时窗口的实测仍待 §6.4-2b**（纸面推演按 PRD :614 判"未做"） |
| **⑥** 步 8 读回开关初值断言与 PRD §6.4-7 一致 + 实测改值 ≤60 秒生效 | `preflight.mjs` 的 `runStep8()`（8/8 键逐字对齐，tmpdir 临时库）+ `REQUIRED_STEP8_METRICS` 缺项门 | `步 8 开关初值读回 + 改值 ≤60 秒生效实测 → PASS`；`--self-test` 的六条反例全部"应红·实判红"（§4.1） | **脚本面达成**；**生产实例经 `POST /api/admin/flags` 改值的真机侧未实测**（Phase 7） |
| **⑦** L5 每档 `--mode diff-sample --n 20` 可执行 | `reconcile.mjs`（c-i 交付）+ **本轮真调挂进 `preflight` 步 6**（U-5/L-1 结项） | `reconcile.mjs（参数：--dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json --mode diff-sample --n 20）` → `EXIT=0`；`判据⑦[sqlite] ①…⑤… diff=0`、`五项 diff 合计=0 → PASS`（原文尾串 `∣Σ∣=0`）、`只读纪律/全部执行语句属 SELECT∣PRAGMA → PASS :: 语句种类=SELECT`（§5.2；A=/B= 两侧的本地样例条数按红线**不转录**） | **脚本面达成**；**"≥20 真实账号 diff=0" 是线上口径 → 未实测，待 Phase 7**（c-i U-2/L-2 原样有效） |
| **⑧** 无主测评缓存只读计数（`assessment_cache.user_id IS NULL`），sqlite 与 pg 各一遍，**只观测不处置**，缺项 `exit 1` | **唯一发布出口 = `account-audit.mjs`**（`r41_assessment_cache_user_id_is_null`）；**交叉校验 = `reconcile.mjs --mode assessment-orphan`**（`assessment_orphan_rows`）—— 主从口径本轮已落文（README §4，A-47 #104 L-6） | `步 4 … 判据⑧ 无主计数出数 → PASS`；静态扫描 `preflight.mjs/account-audit.mjs/restore-drill.mjs 严格命中=0`（§4.1）⇒ "不处置"可机检 | **脚本面 + 主从口径达成**；**线上计数未实测**；pg 侧"各一遍"归 T-22 CI |

### 2.3 §10.2 交付物清单对账（5 件里曾有 2 件整文件缺失）

| 交付物 | 现况 |
| --- | --- |
| 🆕`scripts/release/{preflight,account-audit,reconcile,restore-drill,lib}.mjs` | **五件齐**（`reconcile.mjs` 由 c-i 补，U-1 结项） |
| ✏️`packages/server/src/services/backup.ts` | c-vi 交付（377→421，导出 `runDailyBackupOnce`），A-48 #116 判绿 |
| 🆕`packages/server/test/release/backup.spec.ts` | c-ii（405 行/17 条）+ c-vi（→649 行）⇒ U-2 结项 |
| 🆕`packages/server/test/release/manifest.spec.ts` | c-iii 交付（230 行/2 支，N-4 与 U-4 同轮） |
| 🆕`backups/manifest.json`（运行时产物）+ 仓库 `.gitkeep` + 🆕`scripts/release/README.md` | **本轮结项**：README 交付；`.gitkeep` 已建；git 纳入口径按 A-45 #89 落文（台账与产物**维持忽略**） |

---

## 3. 合并视图：批次4C 各轮交回结论（a / b / i / ii / iii / iv / vi / v）

| 轮 | 交了什么 | 上报 → 现况 | 裁决 |
| --- | --- | --- | --- |
| **a** | `lib.mjs` 共用层 + `account-audit.mjs`（判据①⑧ 脚本面） | 8 条待拍板（含"单/双驱动退出码解释""`mode=ro` 等价写法""webhook 未回收"） | A-45 #87 追认；webhook 仍未回收 → §8 第 1 件 |
| **b** | `restore-drill.mjs` 全流程（判据②③④⑤） | **U-1~U-6**：U-1/U-2 由 c-i、c-ii/c-vi 结项；U-3 由**本轮**结项（README + `.gitkeep`）；U-4/U-6 由 c-iii 结项；**U-5（6b 四条登录面）仍未闭合** → §10 L-7 | A-45 #88/#89/#91/#92 全部就地裁决 |
| **c-i** | `reconcile.mjs` 533 行（判据⑦ + ⑧ 承载位） | U-1（`ro()`/`SQL_SURFACE` 上收）→ c-iii 结项；**U-5/L-1（未接 preflight）→ 本轮结项**；U-2 线上、U-3/L-3 pg → 仍未实测 | A-47 #104 判绿；L-6 主从 → 本轮落文 |
| **c-ii** | `backup.spec.ts` 17 条 / 0 SKIP | N-1 文案（真实导出 `preReleaseSnapshot()`/`scheduleBackup()`）→ #105 已打戳；N-2 → c-vi；N-3 pg → T-22；N-4 → c-iii | A-47 #105 判绿 |
| **c-iii** | `restore-drill.mjs` 1469→1600（U-4 回填 + U-6 升格 `[GATE]`）+ `lib.mjs` 上收 `ro()`/`SQL_SURFACE` + `reconcile.mjs` 533→522 + `manifest.spec.ts` | 上报①（reconcile 死 import）**实测已不在盘上** → V-6 结项；**上报②（preflight 未接 `--manifest-check`）→ 本轮结项**；上报③（pg 台账）→ T-22 | A-51 #131/#132 判绿 |
| **c-iv** | `preflight.mjs` 333→1074（步 8 判据⑥） | 上报⑥（`tsxCliPath()` 本地顶待上收）→ **本轮结项（#111）**；上报① pg 侧、② self-test 不碰 DB、③ `source='db'` 硬判、④ `printGate` 红不进退出码 → 仍开放（后者见 V-4） | A-49 #110（self-test 曾 exit 1）→ c-iii 修复后 #132 复跑 exit 0 |
| **c-vi** | `backup.ts` 导出纯函数 + 注入口、spec 追加 9 条 | 增量超预估 → A-48 #116 判"不违规"；§2.3 有意不等价、定时器接线仍无测试 → 记档 | A-48 #116 判绿 |
| **c-v（本轮）** | README + 两处装配 + `tsxCliPath` 上收 + ⑧ 主从落文 + 本总报告 | V-1~V-7 见 §9 | — |

**跨轮纪律的兑现**：批次4C 六小轮 + 本收口轮，**没有一轮为了自证绿去放宽别轮门禁**（c-iv 遇到 self-test 抓到自己写的 `ALTER` 时选择上报而非豁免，A-49 #110；c-i/iii 对 `lib.mjs` 先"只 import 不改"再按裁决上收，A-47 #104 / A-51 #131）。本轮同样按该原则处理 `tsxCliPath()`：**只搬不改**（§9 V-3 记录未合并的第二处同逻辑）。

---

## 4. 出口命令原文与输出尾部（3 次额度用满 3 次）

### 4.1 `node scripts/release/preflight.mjs --self-test` → **exit 0**

静态扫描面（改后仍 0 严格命中，含本轮新增代码）：

```
  OK  preflight.mjs：严格命中=0 · 带标记豁免=2 · 快照写点=0/0
  OK  account-audit.mjs：严格命中=0 · 带标记豁免=0 · 快照写点=0/0
  OK  restore-drill.mjs：严格命中=0 · 带标记豁免=8 · 快照写点=1/1
```

输出尾部原文：

```
  OK  应红 · 实判 红 —— 反例：跨进程生效 61000ms（超 FLAG_EFFECTIVE_MAX_SECONDS）
        → 红的门禁：跨进程改值生效实测 ≤60 秒（读侧持 30 秒 TTL 缓存，靠到期重读看见新值）
  OK  应红 · 实判 红 —— 反例：005 迁移没跑 → list() 未出数（读回缺失）
        → 红的门禁：真值源 `feature-flags.ts` 的 `list()` 出数且全部 source=db（迁移 005 已种入） | …（6 条门禁同红）
[FAIL] driver=sqlite 缺失计数项：step8_flag_rows_read_back, step8_passwordUpgradeEnforce_initial_value, step8_passwordUpgradeEnforce_source, step8_flag_key_count, step8_deadline_key_present, step8_same_process_effective_ms, step8_cross_process_effective_ms, step8_protected_db_untouched
  OK  缺项门禁：空计数 → requireMetrics 报 8/8 项缺失 → exit 1
  OK  授权 import 面自证：本文件对 packages/server 的字面 import=[] · 禁用面=[] · harness 服务器入口=flagsTs（= services/feature-flags.ts 绝对路径，由 preflight 以 CLI 参数传入）
  → self-test PASS
```
**`PREFLIGHT_SELFTEST_EXIT=0`**（`[FAIL]` 那一行是缺项门禁的**疫苗用例**：故意用空注册表喂 `requireMetrics`，证明它真会红 —— 不是本轮引入的红。）

### 4.2 `node scripts/release/reconcile.mjs --self-test` → **exit 0**

```
    {
      "id": "self-test/ro() 运行时守卫拒写",
      "pass": true,
      "detail": "非只读语句被抛=符合只读纪律"
    }
  ],
  "notes": [],
  "mode": "diff-sample",
  "read_only_scan_hits": 0,
  "ro_guard_rejected": true
}
```
**`RECONCILE_SELFTEST_EXIT=0`**（`read_only_scan_hits: 0` = 静态面干净；`ro_guard_rejected: true` = 运行时守卫真拒。）

### 4.3 `node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json` → **exit 1**

即 §10.2 T-21 行的出口命令原形。1677 行输出，状态汇总原文：

```
===== §6.4-2 清单（T-21 可机器化步）· 状态汇总 =====
  步 4   线上账号体检 + 判据⑧ 只读计数                  PASS
  步 5c  先迁移再起服（清单读回）                       PASS
  步 5   快照 + size>0 + sha256 + manifest    PASS
  步 5b  失败可见性降级 + 发布前强制读回                  PASS
  步 5   台账 restore_drill 核对（--manifest-check） EXIT=1
  步 6   恢复到临时实例 + 指纹一致                     PASS
  步 6   对账基线 5 项 × 20 采样 diff=0            PASS
  步 6b  三条 ADD COLUMN + 零回填断言              PASS
  步 7   旧镜像连新 schema + (a)(b)(c)(d)        PASS
  步 8   开关初值读回 + 改值 ≤60 秒生效实测              PASS
  未做  步 6 对账基线的线上口径（≥20 真实账号）    未实测，待 Phase 7 向用户索取只读访问（脚本面已真调，见上）
  未做  步 5/6/7 的 pg 侧台账与演练                本机无实例 → 显式 SKIP，归 T-22 CI（不算 PASS）
  待补  步 8 判据⑥ 的真机侧（线上实例改值生效）      未实测，待 Phase 7 向用户索取只读访问
```
**`DRYRUN_EXIT=1` 的唯一成因 = 新装的台账核对门**（其余子进程 `EXIT=0`：log:219/919/1290；步 8 `PASS`）。这条红的性质与判别自证见 §5.1/§5.3，**未做任何放宽处理**。

---

## 5. 新装配的两处在 `--dry-run` 下的**实际输出行**（不是"已挂载"）

### 5.1 装配② —— `restore-drill.mjs --manifest-check`（步 5/7 检查清单，只读零写入）

子进程调用行与其判定行（逐字）：

```
──────────── restore-drill.mjs（参数：--manifest-check --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json --tag v2.0.0） ────────────
[METRIC] driver=n/a manifest_drill_check[pre-release-v2.0.0.db]=缺项：restore_drill=null（有备份无演练）      ← ×7
[METRIC] driver=n/a manifest_drill_check[pre-release-v2.0.0.db]=完备                                          ← ×1（本轮刚回填的那条）
[GATE] 台账核对/restore_drill 非 null 且字段齐全（tag=v2.0.0 · 8 条） → FAIL :: [{"file":"pre-release-v2.0.0.db","issues":["restore_drill=null（有备份无演练）"]}, …×7]
──────────── restore-drill.mjs EXIT=1 ────────────
[GATE] 步 5 台账核对 / restore-drill --manifest-check 退出码 0（台账 restore_drill 非 null 且结论字段齐全，缺项即 exit 1） → FAIL :: EXIT=1 · tag=v2.0.0
```

**为什么"本轮演练成功（步 5 PASS）"与"台账核对 FAIL"能同时成立**（这是本轮最有价值的一条账面事实）：
`--manifest-check` 按 **tag** 过滤台账条目，而 `%TEMP%/t21b/manifest.json` 已跨轮累积 **8 条 `tag=v2.0.0`** 条目 —— 其中 **7 条是 U-4 修复之前落的历史条目，`restore_drill` 恒为 `null`**，只有本轮那条回填完备。实测（只读，转录时**不含任何条数**）：

```
C:\Users\…\Temp\t21b\manifest.json  => tag/kind/drill: v2.0.0/sqlite/null ×7 , v2.0.0/sqlite/filled
backups/manifest.json               => tag/kind/drill: v2.0.0/sqlite/null   （1 条，00:56 落盘 = U-4 修复前）
```

⇒ 门禁说的是真话：**"有备份无演练"在这两份台账里都真实存在**。仓库 `backups/manifest.json` 那条尤其要紧 —— 若发布窗口今天就 `--out backups` 复用既有快照，预检会**正确地**把它钉红。

### 5.2 装配① —— `reconcile.mjs --mode diff-sample --n 20`（步 6 对账基线）

```
──────────── reconcile.mjs（参数：--dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json --mode diff-sample --n 20） ────────────
[METRIC] driver=sqlite diff_wordbook_rows=0
[METRIC] driver=sqlite diff_fsrs_card_rows=0
[METRIC] driver=sqlite diff_due_partition=0
[METRIC] driver=sqlite diff_streak_days=0
[METRIC] driver=sqlite diff_checkin_rows=0
[GATE] 判据⑦[sqlite] ①wordbooks diff=0 → PASS          ← 五项逐条 PASS（各行的 A=/B= 侧本地样例条数按数据红线不转录）
[GATE] 判据⑦[sqlite] 五项 diff 合计=0 → PASS :: |Σ|=0
[GATE] 只读纪律/全部执行语句属 SELECT|PRAGMA → PASS :: 语句种类=SELECT
──────────── reconcile.mjs EXIT=0 ────────────
[GATE] 步 6 对账基线 / reconcile --mode diff-sample --n 20 退出码 0（判据⑦：五项 diff 全 0 + N/M/K/P/Q 口径位齐，缺项即 exit 1） → PASS :: EXIT=0
```
`--n 20` 由常量 `RECONCILE_SAMPLE_N` 提供（`preflight.mjs:82-89`，注释里写明它是判据⑦ 要求的**采样档位**，而不是"本地已有 20 个账号"的断言）。

### 5.3 判别自证（证明门禁"能红也能绿"，不是接线故障）—— 第 3 次出口命令

在 `os.tmpdir()` 新建一份**只含已回填条目**的台账副本（读原台账、写新目录，仓库零写入），再跑同一命令：

```
clean ledger entries = 1        （C:\Users\…\Temp\t21v-mc-clean\manifest.json）
node scripts/release/restore-drill.mjs --manifest-check --out <该新目录> --tag v2.0.0
→ [METRIC] driver=n/a manifest_drill_check[pre-release-v2.0.0.db]=完备
  [GATE] 台账核对/restore_drill 非 null 且字段齐全（tag=v2.0.0 · 1 条） → PASS :: 全部条目演练结论完备
  MANIFEST_CHECK_CLEAN_EXIT=0
```
⇒ 同一道门：干净台账 **EXIT=0**、含 7 条未演练历史条目的台账 **EXIT=1**。**判定力成立，且方向是变严。**

---

## 6. 数据红线自证

| 对象 | 跑前（施工前实测） | 跑后（三条出口命令之后实测） | 结论 |
| --- | --- | --- | --- |
| 仓库根 `data.db` | size `253952` · mtime `2026-09-18 04:05:38.198449400 +0800` · sha256 `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` | **三项逐字相同** | 只读，未写、未 DDL/DML、mtime 未动 |
| `packages/server/data.db` | size `0` · mtime `2026-09-17 00:10:53.374159200 +0800` · sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | **三项逐字相同** | 同上 |
| 附属 `data.db-wal` / `-shm` | `424392 / 2026-09-18 04:09:16` · `32768 / 2026-09-17 00:53:01` | 逐字相同 | 无 checkpoint、无新 WAL 帧 |

- **未使用 `--i-know-this-is-prod`**：三条出口命令的参数面见 §4/§5，全程 `--dry-run`，所有目标库都在 `os.tmpdir()`（`tm-t21-<pid>/`、`t21b/`、`t21v-mc-clean/`）。
- **`backups/` 本轮不新增产物**（唯一新文件 = 交付 2 要求的 `backups/.gitkeep`，0 字节）：

```
0          2026-09-21 01:50:59  backups/.gitkeep        ← 本轮唯一新增
1987       2026-09-21 00:56:38  backups/manifest.json   ← mtime 未变（本轮只读）
126976     2026-09-21 00:56:38  backups/pre-release-v2.0.0.db ← mtime 未变
```
- **本地 smoke-test 条数零转录**：本报告与 README 里出现的数字只有「判据编号 / 行数 / 字节 / 条目**条数（台账行数，非业务表行数）** / diff=0」。`step4_*`、`rec_*`、`restored_*` 与 `A=/B=` 各行的本地样例条数一律未抄（c-i U-2、A-47 #104 同款纪律）。
- 本轮**未跑** e2e / build / 全套 vitest（并发中三个 agent 在改 `apps/**`、两个在改 `packages/**`）；`pnpm --filter @tm/server test` 的数字以 A-48 #116 的 TPM 复跑为权威，未重跑。

---

## 7. git 纳入口径（A-45 #89）与 `check-ignore` 证据

改动：`.gitignore` **只 +1 行**（`:30`），并在 `backups/` 放 0 字节 `.gitkeep`。

```
 # archives & backups
 backups/
+!backups/.gitkeep
 pgdata/
```

`git check-ignore -v` 对三者（**加例外行之后**的实测）：

```
.gitignore:29:backups/	backups/.gitkeep
.gitignore:29:backups/	backups/manifest.json
.gitignore:29:backups/	backups/pre-release-v2.0.0.db
```
（加例外行**之前**的基线逐字相同 —— 即三者本来就都被 `:29` 命中。）

⇒ **两个结论，一好一坏，都不粉饰**：
1. ✅ `manifest.json` 与一切快照产物**维持忽略**，本轮没有制造纪律破口（这正是 #89② 要的）。
2. ⚠ `!backups/.gitkeep` **当前是惰性的**：git 的规则是"父目录被排除时其内文件无法再被重新纳入"，故 `.gitkeep` 仍被 `backups/` 命中、`git status` 里不出现。收口法两条（① 规则换成 `backups/*` + `!backups/.gitkeep`；② 规则不动，由 TPM 在 Phase 8 一次性 `git add -f backups/.gitkeep`）**都超出"只加一行"的授权**，且本仓既有纪律明写"`git add -f` 是 git 写操作，任何 agent 都不许做"（`.gitignore` 内 E1b 段的同款说明）⇒ **未自行实施，上报 V-1**。
   本轮的 git 面（实测，不粉饰）：`git status --porcelain` 对 `scripts/release .gitignore backups .delivery/04-dev-report-T-21.md` 只给出
   `M .gitignore` / `?? .delivery/04-dev-report-T-21.md` / `?? scripts/release/` —— 也就是 **`scripts/release/` 整目录本来就未入库**（批次4 全程"本期产物尚未入库"的既有事实，A-38-2），
   `backups/`（含新放的 `.gitkeep`）在 git 眼里仍不可见 ⇒ **本轮对 git 索引零影响**。`.gitignore` 的 `git diff --stat` 显示 +27 行，其中**只有 1 行是本轮加的**，其余 26 行是并行 agent（T-01 构建基线 / 出口轮 E1b）名下的既有未提交改动，本轮未增删其任何一条。

---

## 8. 线上才取得到的口径 —— 一律「未实测，待 Phase 7 向用户本人索取只读访问」

| 口径 | 现况 |
| --- | --- |
| 判据⑦ 的 **≥20 真实账号 五项 diff=0** | **未实测**（本机只有 tmpdir 自建样例库，脚本仅证"有判定力"）—— 取法：`reconcile.mjs --db <线上只读副本> --mode diff-sample --n 20 --i-know-this-is-prod` |
| 判据① 的 **N/M/K/P/Q + 五类保留计数真实条数** | **未实测**（步 4 的取证对象是线上库；本地数字禁入验收材料） |
| 判据⑧ 的 **R-41 线上无主 `assessment_cache` 计数** | **未实测**（"有数即可、不要求为 0"，是下一期清理窗口的输入） |
| 判据②③④⑤⑦⑧ 的 **pg 侧双驱动**（`pg_dump -Fc` `.dump`、pg 恢复、pg DDL parity、pg 回滚冒烟、pg 台账条目） | **本机无 PostgreSQL 实例 → 脚本显式 SKIP，不算 PASS**，归 **T-22 CI**（带 `DATABASE_URL_TEST` 的 runner；A-45 #87、A-47 #104 U-3/L-3、A-47 #105 N-3） |
| 判据④ 的 **6b③④⑤⑦ 四条登录面**（upgrade token 不含正常 token / 改密后旧 token 401 / 打非改密接口被拒 / 上线时刻零掉线） | **未闭合**：脚本按 U-5 不外延，需 R-40/T-07 接口用例真覆盖 —— 跨任务核对至今未做（L-7） |
| 判据⑤ 的 **真机回滚 (a)(b)(c)(d) 实测**、步 9 的 2 台真机 + 旧 APK 两例 | **未实测**，归 §6.4-2b 用户提供的连续 2 小时预发窗口 + 步 12 人工签字 |
| 判据⑥ 的 **生产实例改值 ≤60 秒生效**（`POST /api/admin/flags` → 服务端进程缓存失效；多实例最坏路径） | **未实测**（本机只有 tmpdir 侧同进程 + 跨进程 30 秒 TTL 双路径） |

### ⛔ 需要用户本人给的三件东西（Phase 7 前不闭环 ⇒ 以上四行无法收口）

| # | 要什么 | 卡住了谁 |
| --- | --- | --- |
| **1** | **F-6 告警目标地址**（`ALERT_WEBHOOK_URL` 的真实 webhook） | 步 5b 的"失败必须 ≤60 秒收到 1 条 / 成功 0 条"演练：现在只能证**降级分支**（未配置即标红不阻塞） |
| **2** | **U-1 keystore 的仓库外双备份位置与访问人**（PRD §9-6 未回收项） | T-22 CI 的签名同源判据（A-33-11 / RK-13）：CI secret 那份与仓库这份是否同 blob，第一次跑就要比对，否则表现为"CI 第一天突然红" |
| **3** | **线上生产库的只读访问** | 判据①⑦⑧ 的真实取证 + 步 6b 的 `assessment_cache` 线上基线（全部"未实测"项的共同前提） |

---

## 9. 上报未修（本轮发现，未自行扩大范围）

| # | 事项 | 证据 | 建议归属 |
| --- | --- | --- | --- |
| **V-1** | `.gitignore` 的 `!backups/.gitkeep` 在 `backups/` 目录级排除下**惰性**：目录与占位现在**仍然进不了 git 视野**，A-45 #89① 想要的"目录与占位可评审"未兑现（②③④ 兑现了：产物与台账维持忽略、README 单独补） | §7 的 `git check-ignore -v` 三行逐字 | TPM 二选一（改 `backups/*` 规则 / Phase 8 `git add -f`），两条都超本轮授权 |
| **V-2** | `--manifest-check` 的过滤维度是 **tag**，不是"本轮快照"⇒ **同一 tag 的历史未演练条目会把预检永久钉红**。本机 `%TEMP%/t21b` 已累积 7 条 U-4 修复前的 `null` 条目；仓库 `backups/manifest.json` 那 1 条也是 `null`。门禁本身有效（§5.3 已证能红能绿），但**发布窗口若复用旧产物目录就会一片红** | §5.1 输出 + `entries.map(drill)` 实测 | 短期口径（**推荐，零改动**）：发布窗口用**干净产物目录**（`--out` 指新目录，或先归档再演练）。长期修法需给 `restore-drill.mjs` 加 `--latest-only`（该文件本轮禁改）→ TPM 裁 |
| **V-3** | `tsxCliPath()` 上收后，`lib.mjs` 内**仍有第二处同逻辑**：`runSqliteMigrations:286-292` 把同样的 `require2.resolve('tsx/cli')` 内联了一遍（`seedTempSqlite:384` 亦有 `createRequire`）。按"逐字照搬、不许顺手改进"与"改它会影响三个脚本的迁移路径"两条，本轮**未合并** | `grep -n "tsx/cli" scripts/release/lib.mjs` 两处 | 批次5 格式化/收口轮统一（改动面 = lib 一处 + 三个调用点回归） |
| **V-4** | `preflight` 的 **`printGate` 红本身不参与退出码**（c-iv 上报④ 原样存在）：本轮两处装配刻意走**子进程退出码**进门禁才有效力。若后来者把某道检查改成"只打 gate 不起子进程"，会**静默失效** | `softBad = children.some(…)` 是唯一的红源之一 | 收口轮决定是否把 gate 行纳入退出码（会变严，但会牵动步 5c 既有语义） |
| **V-5** | 本轮**未跑** `account-audit --self-test` / `restore-drill --self-test`（出口命令额度 3/3 用满）；这两家的绿以 A-51 #132 的 TPM 亲跑（exit 0，三家严格命中=0）为权威 | §4 额度自陈 | 收口/出口轮复跑 |
| **V-6** | c-iii 上报①（`reconcile.mjs` 的 `import fs` 与 `const HERE` 死代码 → 2 个 `no-unused-vars`）**已不在盘上**：现文件 `:32-33` 只 import `path`/`process`/`url`，无 `fs`、无 `HERE`；`npx eslint scripts/release/reconcile.mjs` = 0 problem | 实测 grep + eslint | 该上报项**可结项**（无需派单） |
| **V-7** | c-iii 的"未演练如实 `null`"取舍 + 台账核对的**时点差**：回填含 `failed_gates` 快照，与出口判定相差一道门（iii 遗留第 2 条），本轮判仍不构成账面风险，未动 | `restore-drill.mjs` 回填段 | 记档 |

**本轮未修不阻塞**：判据⑦/⑧ 的**装配面**、README 的**口径落文**、`tsxCliPath()` 的**上收**、`.gitignore` 的**一行例外**、本总报告 —— 五件全部交付，且 `--self-test` 仍 exit 0。

---

## 10. 遗留清单（T-21 全任务视角）

| # | 遗留 | 归属 |
| --- | --- | --- |
| L-1 | **pg 侧全表面**（判据①②③④⑤⑦⑧ 各跑一遍 + `pg-<stamp>.dump` 台账条目 + `findPgDump`/`runPgDump` 两支） | **T-22 CI**（带 `DATABASE_URL_TEST` + `postgresql-client` 的 runner；本机为显式 SKIP，不算 PASS） |
| L-2 | **线上真实取证**：N/M/K/P/Q 真实条数、判据⑦ 的 ≥20 真实账号 diff=0、R-41 线上无主计数、步 6 的线上 `assessment_cache` 基线 | **未实测，待 Phase 7 向用户本人索取只读访问**（§8 第 3 件） |
| L-3 | **真机面**：步 7 回滚 (a)(b)(c)(d) 实测、步 9 两台真机 + 旧 APK 两例、步 8 判据⑥ 生产侧 ≤60 秒 | §6.4-2b 的 2 小时预发窗口 + 步 12 人工签字 |
| L-4 | **F-6 告警地址 / U-1 keystore 仓库外双备份**两件未回收物 | 用户本人（§8） |
| L-5 | `git add -f backups/.gitkeep` 或 `.gitignore` 规则收口（V-1） | TPM（Phase 8 入库窗口） |
| L-6 | 台账核对的"历史条目钉红"口径（V-2）：干净产物目录写进发布 runbook，或给 `restore-drill.mjs` 加 `--latest-only` | TPM + T-24 发布 runbook |
| L-7 | **U-5 仍未闭合**：步 6b ③④⑤⑦ 四条登录面的跨任务核对（R-40/T-07 是否有真用例并绿）；若无，需追加 import 授权才能在恢复实例上出四条布尔量 | TPM 派单（本任务书明令**禁止**自行扩 import 面） |
| L-8 | `tsxCliPath()` / `createRequire` 在 `lib.mjs` 内的第二处内联（V-3）；`protectedDbFingerprints`/`fingerprintEqual` 亦同族可上收（c-iv 上报⑥ 后半句） | 批次5 收口轮 |
| L-9 | `preflight` 的 gate 行与退出码脱钩（V-4）；步 5c 三条门禁红了不 `exit 1` 的既有语义 | TPM 裁（改则变严） |
| L-10 | `%TEMP%` 下 `tm-t21-*` / `t21b` / `t21v-mc-clean` / `reconcile-selfcheck*.db` 演练目录，全在 tmpdir 不污染仓库 | 清理类（收口轮统一删） |
| L-11 | §10.2 T-21 行"仓库放 `.gitkeep` + schema 说明"的措辞与现网 `.gitignore` 的冲突，A-45 #89④ 派 **E4** 就地打戳为"`.gitkeep` 例外入库、产物与台账一律忽略" | E4（文档面，非本 agent 授权文件） |
| L-12 | 本任务书要求的"判据⑨/⑩"在 §10.2 T-21 行无对应条目：本报告 §2.1 已把两号的真实出处（T-11 行判据⑨ / A-33-11 签名判据 / R-24⑩）逐条对账，**未自造判据** | 口径类，供 TPM 在排班表收口 |

---

## 11. 一句话交付判定

**T-21 的脚本面在批次4 全部闭合**：八条判据（§10.2 的①–⑧）每条都有承载脚本/用例 + 本轮或前轮实跑证据，`preflight` 现在是**一条命令能把账号体检、迁移核对、快照·恢复·回填·回滚演练、台账核对、对账基线、开关初值实测串起来并按最坏子进程码退出**的出口；本轮新装的两处检查在 `--dry-run` 下**真调、真出数、真判红**，`--self-test` 改后仍 **exit 0**，两份 `data.db` 三项指纹跑前跑后逐字未动；**pg 侧、真机侧、线上条数一律显式标"未实测"而不伪装 PASS**，并且台账核对那道门当场抓出"历史快照有备份无演练"这一真实状态（V-2），批次4 的护栏因此**比交回时更严，而不是更绿**。
