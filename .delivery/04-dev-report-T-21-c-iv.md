# T-21c-iv 开发报告 — 步 8 开关初值读回 + 改值 ≤60 秒生效实测（判据⑥）

- **任务代号**：T-21c-iv（批次 4C · 多轮交付第 iv 片）
- **补的判据**：`.delivery/02-tech-design.md:918` §10.2 T-21 行 **判据⑥**「步 8 读回开关初值并断言与 PRD §6.4-7 一致 + 实测改值 ≤60 秒生效」
- **口径来源**：`.delivery/01-prd.md:688-689`（只读这两行；**未通读** 01-prd.md）
- **改动面**：`scripts/release/preflight.mjs`（唯一被修改的既有文件）+ 本报告。**未触碰** `lib.mjs` / `restore-drill.mjs` / `account-audit.mjs` / `reconcile.mjs` / `packages/**` / `apps/**`
- **本轮结论**：判据⑥ 前半 = **达成**（脚本面真读回，8/8 键逐字对齐 PRD）；后半 = **脚本面达成 + 真机待 Phase 7**（本机实测同进程 4 ms / 跨进程 29 813 ms，均 ≤60 000 ms）；`preflight --dry-run` 全链 **exit 0**

---

## 1. 交付物清单（行号区间 + 行数变化）

`scripts/release/preflight.mjs`：**333 行 → 1074 行（+741）**。prettier 已格式化、eslint 零告警。

| 区间（改后行号） | 性质 | 内容 |
| --- | --- | --- |
| L5-13 | ✏️ 改注释 | 清单顺序行：`步 8 开关初值读回 + 改值 ≤60 秒生效实测 …… 本文件 T-21c-iv（判据⑥）`；原来把步 6 对账 + 步 8 一起标"c 轮未实现"，现拆开 |
| L19-27 | ✏️ 新增文档块 | 步 8 的两条硬约束写进文件头：真值源 = `services/feature-flags.ts`（A-32-7 第三个授权文件），**不 import** `routes/admin-flags.ts`/`config.ts`；翻转只落 `os.tmpdir()` 临时库，仓库两个 `data.db` 全程只读 |
| L29-53 | ✏️ import | 新增 `crypto`、`spawn`（异步 watch）、`createRequire`（定位 tsx CLI）；从 `./lib.mjs` 追加 `requireMetrics`、`protectedSqlitePaths`（**只用不改**） |
| L86-96 | 🆕 | `FEATURE_FLAGS_TS`（真值源绝对路径，只作为 CLI 参数传给子进程）、`STEP8_HARNESS_FILE`（落在 `TMP_ROOT`） |
| L99-135 | 🆕 | `PRD_STEP8_INITIAL`（8 键定稿值，逐字抄 01-prd.md:688）、`FLAG_KEY`/`DEADLINE_KEY_RE`、`FLAG_LATENCY_MAX_MS=60_000`/`FLAG_WATCH_TIMEOUT_MS=90_000`/`FLAG_POLL_MS=2_000`、`REQUIRED_STEP8_METRICS`（8 项，缺任一 → exit 1） |
| L138-237 | 🆕 | `STEP8_HARNESS`：生成式 harness（100 行），三模式 `list` / `flip` / `watch`；自带 `assertTmpOnly()` 第二道红线闸；`createFeatureFlags(appDbStub)` **不传 ttlMs**（吃生产 30 秒 TTL）；`AppDB['flags']` 适配器只手写 `get/set/list` 三方法，不 import `db/**` |
| L240-247 | 🆕 | `tsxCliPath()` —— **本地顶**，与 `lib.mjs:runSqliteMigrations` / `restore-drill:runMigrate` 同逻辑，**待 iii 上收**（见 §6-4） |
| L249-293 | 🆕 | `step8Target()` / `parseResultLine()` / `runFlagChild()`（同步跑 list、flip） |
| L296-379 | 🆕 | `startFlagWatch()`：异步 watch 子进程 + READY 握手；stdout/stderr 双通道留存；子进程 close 时唤醒等待者（不再空等 90 秒） |
| L382-452 | 🆕 | `evaluateStep8(obs)`：**纯函数判定核**，产出 6 条门禁（① 读回出数且 source=db / ② `passwordUpgradeEnforce` 初值 / ③ 8 键逐字对齐 / ④ 无 `passwordUpgradeDeadline` / ⑤ 同进程 ≤60s / ⑥ 跨进程 ≤60s）。为 `--self-test` 的 fixture 而设计 |
| L455-487 | 🆕 | `step8ImportFaceCheck()`：扫自家 import 说明符 + harness 字面引用，断言零 `packages/server` 字面 import、零 `routes|trpc|admin-flags|config.ts` |
| L490-522 | 🆕 | `protectedDbFingerprints()` / `fingerprintEqual()`：仓库两个 `data.db` 的 size+mtime+sha256₁₆ 指纹；文件被并发进程持锁时**降级为 size+mtime 并在 detail 标注**，不把"读不动"当"没动过" |
| L525-651 | 🆕 | `runStep8()`：建临时库（真实迁移路径 000~007，含 005 种入）→ `list` 读回 → 起 watch → 等 READY → `flip` 翻转 → 收 watch 结果 → 出 8 个 `[METRIC]` → `requireMetrics` 门禁 → 前后真库指纹对照 |
| L654-668 | ✏️ HELP | 加 `--only step8` 用法行 + 提示"步 8 含一次 ≈30 秒真实等待" |
| L711-812 | ✏️ `printSelfTest` | 新增 6 条 fixture（1 正例 + 5 反例）+ 空计数 → `requireMetrics` 报 8/8 缺失 → exit 1 的疫苗断言 + 授权 import 面自证；三者并入 `verdict` |
| L840-841 | ✏️ | `--only` 白名单加 `step8`；引入 `want(seg)` |
| L853 / L866 / L899 | ✏️ | 步 4 / 步 5c / drill 三段条件由 `args.only !== …` 组合式改为 `want('…')`（语义等价，且新增 step8 段后不会误跑） |
| L913-949 | 🆕 | main 里步 8 接线：逐条 `gate()`、⑦ 缺项门禁、⑧ 真库指纹门禁、两条 `note()`（真机待 Phase 7 / 不走写口） |
| L951-966 | ✏️ | "明确不实现的项"改写：步 8 整体从"未做"移出，只保留**真机侧**一条并标 owner=Phase 7 |
| L973-981 | ✏️ | 退出码：`step8Bad`（6 条门禁 + 缺项 + 真库指纹不一致）并入 `softBad` → 任一红即 exit 1 |
| L1000-1025 | ✏️ | 状态汇总加`步 8`行（PASS/SKIP/EXIT 三态）；"未做"只剩步 6 对账；新增"待补 步 8 判据⑥ 的真机侧" |
| L1028-1066 | ✏️ | `emitSummary` 新增 `step8` 块（checks / metrics_missing / detail / 两半结论字段），`not_implemented_here` **删掉**"判据⑥（步 8）"；task 标签改 `T-21b/T-21c-iv preflight` |

---

## 2. 判据⑥ 对账表

| 判据⑥ 拆成的两半 | 结论 | 证据（本机实测，非造数冒充） |
| --- | --- | --- |
| **前半：步 8 读回开关初值并断言与 PRD §6.4-7 一致** | **达成** | 临时库（真实迁移路径 000~007，`005-feature-flags` 种入）上，用 `services/feature-flags.ts` 的 `list()` 读回 8 行，全部 `source=db`；`passwordUpgradeEnforce=on`（PRD 688 行定稿 `**passwordUpgradeEnforce=on**` 逐字一致）；8 键全表逐字对齐（`wordbookIncremental=0%`、`explicitFavorite=on`、`autoFavoriteDefault=off`、`studyModes=on`、`dailyReminder=on(20:30)`、`passwordRegister=on`、`avatarUnifiedLimit=on`）；读回键集中**无** `deadline` 族键（688 行"不再有 `passwordUpgradeDeadline`"）。门禁 ①②③④ 全 PASS |
| **后半：实测改值 ≤60 秒生效** | **脚本面达成 + 真机待 Phase 7** | 翻转走 `feature-flags.ts` 自己的 `set()`（**不经** `routes/admin-flags.ts` 写口），双路径实测：**同进程** `set → 缓存回填 → get` = **4 ms**；**跨进程**（读侧持生产 30 秒 TTL 缓存、靠到期重读看见新值，2 秒轮询）= **29 813 ms**；预算 60 000 ms（= `@tm/shared` `FLAG_EFFECTIVE_MAX_SECONDS`）。TTL **未缩短**、`ttlMs` **未注入**。门禁 ⑤⑥ 全 PASS。**未实测的部分**：线上服务端进程（经 HTTP 写口改值 → 该进程缓存失效）在本机没有可写的生产开关面 → 标"未实测，待 Phase 7 向用户索取只读访问"，**没有**用本地 smoke-test 造数冒充，也**没有**为凑数改服务端轮询实现 |
| 缺项即 exit 1（判据硬约束的镜像） | 达成 | `REQUIRED_STEP8_METRICS` 8 项全出（⑦ PASS）；`--self-test` 用空注册表喂 `requireMetrics` → 报 `8/8 项缺失 → exit 1` |
| 数据红线（T-21 行"全程只读 + 只写 backups/"） | 达成 | 门禁 ⑧：仓库两个 `data.db` 步 8 前后指纹一致（见 §4） |
| pg 双驱动同口径（判据① 式要求） | **未做 / SKIP** | 本机无 PG 实例、`DATABASE_URL_TEST` 未设置；步 8 当前是 sqlite 单驱动口径。已随 preflight 既有 `dual_driver.ok=false` 一起显式记 SKIP，不冒充 PASS（归 T-22/CI） |

---

## 3. 出口命令原文与输出摘要

技术设计 §10.2 T-21 行约定的出口命令（本轮实跑 1 次，另跑 `--only step8` 与 `--self-test` 各为取证）：

```
node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json
```

**EXITCODE=0**（真实耗时 35.4 秒，其中步 8 含 ≈30 秒跨进程生效等待）。状态汇总原文：

```
  步 4   线上账号体检 + 判据⑧ 只读计数                  PASS
  步 5c  先迁移再起服（清单读回）                       PASS
  步 5   快照 + size>0 + sha256 + manifest    PASS
  步 5b  失败可见性降级 + 发布前强制读回                  PASS
  步 6   恢复到临时实例 + 指纹一致                     PASS
  步 6b  三条 ADD COLUMN + 零回填断言              PASS
  步 7   旧镜像连新 schema + (a)(b)(c)(d)        PASS
  步 8   开关初值读回 + 改值 ≤60 秒生效实测              PASS
  未做  步 6 对账基线                          SKIP（c 轮，见 summary.skipped）
  待补  步 8 判据⑥ 的真机侧（线上实例改值生效）      未实测，待 Phase 7 向用户索取只读访问
```

步 8 的门禁与计数原文（同一次运行）：

```
[METRIC] driver=sqlite step8_flag_rows_read_back=8
[METRIC] driver=sqlite step8_passwordUpgradeEnforce_initial_value=on
[METRIC] driver=sqlite step8_passwordUpgradeEnforce_source=db
[METRIC] driver=sqlite step8_flag_key_count=8
[METRIC] driver=sqlite step8_deadline_key_present=no
[METRIC] driver=sqlite step8_same_process_effective_ms=4
[METRIC] driver=sqlite step8_cross_process_effective_ms=29813
[METRIC] driver=sqlite step8_protected_db_untouched=yes
[GATE] 步 8 ①/真值源 `feature-flags.ts` 的 `list()` 出数且全部 source=db（迁移 005 已种入） → PASS :: 读回 8 行 · 非 db 来源 0 行
[GATE] 步 8 ②/passwordUpgradeEnforce 初值 = PRD §6.4-7 定稿 "on" → PASS :: 实测 on（source=db）
[GATE] 步 8 ③/8 个开关初值逐字对齐 PRD §6.4-7（01-prd.md:688，含 8 键全表） → PASS :: 8/8 一致
[GATE] 步 8 ④/`passwordUpgradeDeadline` 不存在（v1.3 连同 14 天宽限期一并作废，代码与配置都不该有它） → PASS :: 读回键集中无 deadline 族键
[GATE] 步 8 ⑤/同进程改值生效实测 ≤60 秒（service.set → 缓存回填 → get 读回） → PASS :: 实测 4 ms（预算 60000 ms）
[GATE] 步 8 ⑥/跨进程改值生效实测 ≤60 秒（读侧持 30 秒 TTL 缓存，靠到期重读看见新值） → PASS :: 实测 29813 ms（预算 60000 ms · TTL 30s + 轮询 2000ms）
[GATE] 步 8 ⑦/必需计数项齐备（缺任一项即 exit 1，沿用 REQUIRED_METRICS 模式） → PASS :: 8 项全出
[GATE] 步 8 ⑧/仓库两个 data.db 步 8 前后指纹一致（真库零写入，翻转只发生在 tmpdir 临时库） → PASS :: untouched=true
```

机器可读小结：`"task": "T-21b/T-21c-iv preflight"`、`"verdict": "PASS"`、`"exit_code": 0`，
`step8.verdict_6_init_assert = "达成（临时库真读回，逐字对齐 PRD §6.4-7）"`、
`step8.verdict_6_effective_within_60s = "脚本面达成（同进程 + 跨进程 30 秒 TTL 双路径实测）· 真机待 Phase 7"`。

自检（疫苗）命令：

```
node scripts/release/preflight.mjs --self-test      # → self-test PASS（exit 0）
```

```
  OK  preflight.mjs：严格命中=0 · 带标记豁免=2 · 快照写点=0/0
  OK  应绿 · 实判 绿 —— 正例：8 键初值全对 + 同进程 7ms / 跨进程 32s
  OK  应红 · 实判 红 —— 反例：passwordUpgradeEnforce 初值被改成 "off"（PRD §6.4-7 要求 on）
  OK  应红 · 实判 红 —— 反例：dailyReminder 丢了 (20:30) 参数（逐字对齐口径）
  OK  应红 · 实判 红 —— 反例：库里复活了 passwordUpgradeDeadline 键（v1.3 作废）
  OK  应红 · 实判 红 —— 反例：跨进程生效 61000ms（超 FLAG_EFFECTIVE_MAX_SECONDS）
  OK  应红 · 实判 红 —— 反例：005 迁移没跑 → list() 未出数（读回缺失）
[FAIL] driver=sqlite 缺失计数项：step8_flag_rows_read_back, …（8 项）
  OK  缺项门禁：空计数 → requireMetrics 报 8/8 项缺失 → exit 1
  OK  授权 import 面自证：本文件对 packages/server 的字面 import=[] · 禁用面=[] · harness 服务器入口=flagsTs
  → self-test PASS
```

补充：`node scripts/release/preflight.mjs --only step8 --dry-run --driver sqlite` 亦独立 PASS（≈32 秒）。开发中一次性踩到两个真实缺陷并已由上述门禁抓出：① harness 的 upsert 误把两段 SQL 当 `prepare()` 的两个实参（`ON CONFLICT` 丢失 → flip 撞主键约束退出码 1）；② watch 子进程静默失败时 `waitReady` 会空等满 90 秒（现改为 close 即唤醒）。两处都是"门禁会红"的正常表现，不是绕过。

---

## 4. 数据红线自证

**跑前基线**（本 agent 独立用 `node` 直读，不依赖脚本自身）：

| 文件 | size | mtime (UTC) | sha256 前 16 |
| --- | --- | --- | --- |
| `E:\CC\tomorrow-memory\data.db` | 253952 | 2026-09-17T20:05:38.198Z | `6595517661cc6a34` |
| `E:\CC\tomorrow-memory\packages\server\data.db` | 0 | 2026-09-16T16:10:53.374Z | `e3b0c44298fc1c14` |

**跑后**（全链 exit 0 之后，同法再取）：

| 文件 | size | mtime (UTC) | sha256 前 16 | 对照 |
| --- | --- | --- | --- | --- |
| `data.db` | 253952 | 2026-09-17T20:05:38.198Z | `6595517661cc6a34` | **三项全等** |
| `packages\server\data.db` | 0 | 2026-09-16T16:10:53.374Z | `e3b0c44298fc1c14` | **三项全等** |

脚本内部另有门禁 ⑧ 的一次运行内前后对照（同一次 preflight 里取两次指纹，结果 `untouched=true`、未降级），与上表交叉一致。

其他红线：

- **翻转只发生在 tmpdir**：`STEP8_HARNESS` 的 `assertTmpOnly()` 对目标路径硬判 `os.tmpdir()` 前缀，非 tmpdir 直接抛；写点唯一（`feature_flags` 的一行 upsert，L177-178 两行 `SCAN-EXEMPT(T-21c-iv)` 标注），`list`/`watch` 两个模式均以 `readonly:true` 打开。临时库/harness 均在 `TMP_ROOT`，末尾 `cleanupTmpRoot()` 删除。
- **只读扫描仍绿**：`--self-test` 对自家三个 .mjs 扫写关键字 → `preflight.mjs：严格命中=0 · 带标记豁免=2`（豁免即上述 tmpdir upsert 两行）。
- **授权 import 面**：本文件对 `packages/server` 的**字面 import = 0**；真值源以**绝对路径 CLI 参数**传给 tsx 子进程，子进程内 `import(pathToFileURL(flagsTs))` 只加载 `services/feature-flags.ts`。未 import `routes/admin-flags.ts`（写口）、未 import `config.ts`、未 import `db/**` 实现（`AppDB['flags']` 三方法在 harness 里手写）、未 import `@tm/shared`（`FEATURE_FLAG_DEFAULTS` 由 `feature-flags.ts` 自己带）。`config.ts` 与所有 `packages/**` 文件零修改（`git status` 仅 `scripts/release/` 一条未跟踪项）。
- **未指向线上库**：全程未使用 `--i-know-this-is-prod`，`--dry-run` 缺省态保留；真库读回口径待 Phase 7 显式索取。
- **并发提示**：取基线时一次 `powershell Get-FileHash data.db` 被并发 agent 持锁失败（`node` 直读成功）。这是并发所致、非本轮写入，也正是 ⑧ 门保留"降级为 size+mtime 并标注"的理由。

---

## 5. 上报未修（发现但未动，越权或他人面）

1. **步 8 的 pg 侧缺口**：判据⑥ 目前只在 sqlite 上闭环。判据① 要求"双驱动各跑一遍"，若 TPM 认为⑥ 也应双驱动，需要 `feature_flags` 的 pg 读回 + `DATABASE_URL_TEST`，归 T-22/CI 面，不在本轮。
2. **`--self-test` 不碰 DB 的取舍**：新步的疫苗走纯函数 fixture + 空计数路径（快、可进 CI）；真实翻转只在出口命令里跑。若 TPM 要求 CI 也每次实测生效延迟，CI 时长 +32 秒，需拍板。
3. **`source='db'` 硬判**：若某环境靠 `FEATURE_FLAGS_JSON` 种子（无 005 行）跑，步 8 ①②会红。这是有意的（步 8 的初值断言必须断"库里那一行"），但"种子态算不算合格初值"要产品/架构确认；真要放宽也得显式改口径，不能默认绿。
4. **preflight 既有语义未动**：`printGate` 的红本身不参与退出码（现状只有子进程码 + 本轮新增的 step8Bad），步 5c 的三条门禁红了不会 exit 1。属 b 轮既有设计，我只照形扩，未越权修正。
5. **`restore-drill.mjs:94`** 那个 `'005-feature-flags'` 仍只是迁移文件名（TPM 已核，非读值）。步 8 现由 preflight 承接，我未去改 restore-drill。
6. **lib.mjs 未加导出**：`tsxCliPath()` 在 preflight 内本地实现（与 `lib.mjs:runSqliteMigrations`、`restore-drill:runMigrate` 三处同逻辑）；`protectedDbFingerprints`/`fingerprintEqual` 亦是可上收的通用件。**均待 T-21c-iii 上收 `lib.mjs` 后统一**（本轮按分工不碰 `lib.mjs`）。

## 6. 遗留清单

- [ ] **真机侧 ≤60 秒生效**：Phase 7 向用户索取线上只读访问后，在部署实例上按 688-689 行前置条件（"L1 部署后即处于 60 秒可改状态"）复测 `passwordUpgradeEnforce` 改值生效，重点验 HTTP 写口（`POST /api/admin/flags` → 本进程缓存立即失效）与服务端进程真实轮询路径；多实例部署需按 TTL 30 秒的最坏路径复核。
- [ ] 步 8 的 **pg 同口径**（`feature_flags` 表 pg 侧读回 + 生效实测）随 T-22 CI 补。
- [ ] `tsxCliPath()` / 指纹工具 **待 iii 上收**到 `lib.mjs`，然后 preflight 删本地版。
- [ ] 判据⑦（步 6 对账基线）仍 SKIP，归并行 agent 新建的 `reconcile.mjs`。
- [ ] 交付物清单里 `packages/server/test/release/backup.spec.ts` 与 `scripts/release/README.md` 仍缺（不在本轮范围）。
- [ ] CI 若嫌步 8 的 32 秒真实等待太慢，可用 `--only` 拆分或将跨进程实测降为发布窗口专用（需 TPM 拍板，不得默认放宽预算）。
