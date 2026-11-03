# 04-dev-report-T-21-e — 把 T-21d 的门禁分级推广到 restore-drill / account-audit / reconcile

任务号 T-21e · 批次4 发布护栏收尾 · 写面：三个发布脚本 + README 退出码段（3 行改动，≤5 行合规）。
禁改面（lib.mjs / preflight.mjs / packages / apps / tools / docs / .gitignore / backups）一字未动；git 零写操作。

## ① 三面门清单（档位 + 理由；hard/advisory 逐条）

分级表锚点：`account-audit.mjs:108` / `reconcile.mjs:165` / `restore-drill.mjs:330`；查表 `gateTierOf` + 唯一入口 `gate()`；
出口算式全部复用 lib 的 `gateExitContrib(registryGates())`（hard红=2 / soft红=1 / advisory红=0 / 未登记从严按 soft），三面零第二份算式。
未登记的门一律默认 soft（红即 exit 1），下面只逐条列 hard/advisory；soft 给行号段。

### restore-drill.mjs（38 个 gate() 调用点 + 疫苗 4）
hard 12 条（逐条理由，均命中"触碰真库/契约破坏/静默丢数据"）：
| 行 | 门 | 理由 |
|---|---|---|
| L1104 | 步 5/产物目录纪律 | 产物漂出 tmpdir/backups = 可向任意位置（含真库旁）写，数据红线破防 |
| L1206 | 安全阀/源库可只读打开 | 未显式 --i-know-this-is-prod 触碰仓库内真库；本门自带 exit 2 分支，档位与行为对齐 |
| L1370 | ③ 步 6/与源实例指纹一致 | 恢复≠源 = 快照静默丢数据，发布窗口无可用备份 |
| L1375 | ③ 步 6/快照读不回 | 门 id 自身点名"R-24 ③ 同口径阻断"（静默丢数据极端形态） |
| L1437 | ④ 步 6b①/存量 password 逐行 hash | hash 变 = 回填覆盖存量凭据（R-40 红线） |
| L1448 | ④ 步 6b①/五表 COUNT/SUM/hash | 演练中变 = 静默丢数据 |
| L1459 | ④ 步 6b①/ac 行数与无主行数 | 存量行"凭空有主" = R-41 ③④ 回填红线被破 |
| L1465 | ④ 步 6b①/ac 逐行内容 hash | 同上（静默改数据） |
| L1027 | ④-bis 真·改造前库零回填 | 主证据腿失守 = 真库过同一路径会被同样改写 |
| L1041 | ④-bis ac 迁移后一律无主 | R-41 回填红线 |
| L1049 | 数据红线/复制源 data.db size+mtime 不变 | 真库被动过一下 = 红线事故 |
| L1642 | 只读执行面全 SELECT/PRAGMA | 混进写句 = "除产物外只读"契约整体破防 |
advisory 1 条：L1618 `步 5b(A)/告警通道未配置 = 降级` —— getAlertChannel() 两态恒 blocking:false、判据文案自身"绝不阻塞"，与 preflight 步 5b(A)（A-54 #146 / A-56 #154 已裁）同一条，不另立口径。
疫苗：L428–431（`疫苗 ②`=hard、`疫苗 ③`=advisory 进表）+ 分级表自证。其余 24 条（②③④路径/⑤/台账/四类账号等）未登记 → 默认 soft。

### account-audit.mjs（3 个 gate() 点 + 疫苗 4）
hard 0 条。advisory 1 条：L456 `步5b/告警通道未配置不得阻塞` —— 同上裁例。
soft：L261 `sqlite|pg/profiles==N`（跨表保留对账不变式，红 = 半状态信号、拦人复核即可，观测脚本自身不改数据故不升 hard）、L429 `判据①/双驱动各跑一遍`。疫苗 L152–155。

### reconcile.mjs（10 个 gate() 点 + 疫苗 4）
hard 2 条：L583 `只读纪律/全部执行语句属 SELECT|PRAGMA`（执行面混写 = 被连库含真库可能被写）；`self-test/` 三条（L469–471，安全阀/静态零写扫描/ro 守卫任一红 = "本脚本可能写数据"红线面，红即 exit 2）。
advisory 1 条：L408 `判据⑧[driver] 无主计数只观测不处置` —— 判据⑧ 口径"有数即可不要求为 0"（PRD 步 6），恒 PASS 的展示行；真拦截面在 REQUIRED_METRICS 缺项门禁。
soft：L313 采样集为空、L390–393 五项 diff + 合计（`for` 循环 + 总门）。疫苗 L221–224。

## ② 改前"报红却 exit 0"取证 与 改后对照

改前只读真跑（现状态实测，非凭猜）：
- `node scripts/release/account-audit.mjs` → **exit 0**（3 门全绿）
- 定制 tmpdir fixture（users 2 个空密码、profiles 空，零仓库写入）`--fixture $TMP/red-fixture.json --driver sqlite` →
  `[GATE] sqlite/profiles==N → FAIL :: retain_profile_rows=0 vs N=2` 且 **exit=0** —— "报红不改退出码"实锤复现。
  机理：旧算式 `exitCode = missing.length ? 1 : gateOk ? 0 : 1`（旧 L380）根本不看 profiles 门与注册表。
- `node scripts/release/reconcile.mjs --mode diff-sample --n 20` → exit 0（0 条 FAIL）
- `node scripts/release/restore-drill.mjs --manifest-check --tag v2.0.0` → exit 1（台账 9 条 v2.0.0、其中 7 条 restore_drill=null）
如实归因：三面中可复现"红却 exit 0"的是 account-audit。restore-drill 旧算式 `missing.ok && failed.length===0 ? 0:1` 把所有红一揽子记 1（无 hard→2、无 advisory 白名单，且自建 GATES 双轨注册表）；reconcile 旧算式 `missing.length || !roOk || !diffOk ? 1:0` 完全绕开注册表、用本地重言式复刻门结论（任何新增 printGate 门天然不拦人）。两者缺陷形态是"红与出口码无数据流关系/无分级"，本轮一并接进 registry。

改后对照：同一红探针 → **exit=1**，归因行 `门共 3 条（红 1：hard=0 soft=1 advisory=0…）· 缺计数项=0 → exit 1`。三个 --self-test 的疫苗（影子注册表）实证 hard红→2、advisory红→0、未登记红→1、全绿→0。

## ③ 三脚本改动（关键 hunk 逐字；纯新增段给锚点，全文见文件）

新增段（结构三面一致）：`GATE_TIERS` 表 + `gateTierOf()` + `gate()`（account-audit L100–190；reconcile L159–250；restore-drill L326–465）+ 疫苗 `runGateVaccine()`（影子注册表、跑完即 resetRegistry()，不改自检真退出码——T-21d 形态）。

account-audit.mjs：
```diff
-  printGate(`${d}/profiles==N`, …);  printGate('判据①/双驱动各跑一遍', …);  printGate('步5b/告警通道未配置不得阻塞', …);
+  gate(同上三处，经 gateTierOf 带 level/reason 入 registry)
-  const exitCode = missing.length ? 1 : gateOk ? 0 : 1;
-  if (!missing.length && exitCode === 1) {
+  const gateFacts = gateExitContrib(registryGates());
+  const exitCode = gateFacts.hard.length ? 2 : missing.length || gateFacts.soft.length ? 1 : 0;
+  console.log('\n===== 门禁 → 退出码归因（T-21e）=====');   // + 红门逐条 [level] 打印 + 汇总行
+  if (exitCode === 1 && !missing.length && !gateOk) {
-    process.exit(safety.allOk && self.ok && !ch.blocking ? 0 : 1);
+    const vaccineOk = runGateVaccine();
+    process.exit(safety.allOk && self.ok && !ch.blocking && vaccineOk ? 0 : 1);
```

reconcile.mjs：
```diff
-  printGate(×9：采样集空/五项diff循环/合计/判据⑧/self-test×3/只读纪律)  → 全部改走 gate()
-  printGate('self-test/安全阀…'); printGate('self-test/源码…'); printGate('self-test/ro()…');
-  const ok = safety.allOk && selfRo.ok && roGuardOk;  emitSummary({… exitCode: ok ? 0 : 1 …}); process.exit(ok ? 0 : 1);
+  const vaccineOk = runGateVaccine();（先跑，自带 reset）
+  gate('self-test/…'×3);  const stFacts = gateExitContrib(registryGates());
+  const ok = …&& vaccineOk && stFacts.failed.length === 0;  const stExit = ok ? 0 : stFacts.hard.length ? 2 : 1;
-  const exitCode = missing.length || !roOk || !diffOk ? 1 : 0;
+  const gateFacts = gateExitContrib(registryGates());
+  const exitCode = gateFacts.hard.length || !roOk ? 2 : missing.length || !diffOk || gateFacts.soft.length ? 1 : 0;
   // roOk/diffOk 本地兜底保留：门与算式任何一边失守都不放宽
```

restore-drill.mjs：
```diff
   const gate = (id, pass, detail) => {
-    GATES.push({ id, pass: Boolean(pass) });
-    return printGate(id, Boolean(pass), detail);
+    const t = gateTierOf(id);
+    GATES.push({ id, pass: Boolean(pass), tier: t.tier });
+    return printGate(id, Boolean(pass), detail, t.tier, t.why);
-    exitCode: checkOk ? 0 : 1 … process.exit(checkOk ? 0 : 1);            // --manifest-check 分支
+    const mcFacts = gateExitContrib(registryGates());
+    const mcExit = mcFacts.hard.length ? 2 : checkOk && mcFacts.soft.length === 0 ? 0 : 1;
-  const exitCode = missing.ok && failed.length === 0 ? 0 : 1;              // 主流程
+  const gateFacts = gateExitContrib(registryGates());
+  const exitCode = gateFacts.hard.length ? 2 : !missing.ok || gateFacts.soft.length ? 1 : 0;
-  const verdict = safety.allOk && own.ok && dirOk && roOk && !ch.blocking; // printSelfTest
+  const vaccineOk = runGateVaccine();
+  const verdict = … && vaccineOk;
```
三面 HELP 的"退出码"行同步为"2=…/hard 档红线门红；1=…/soft 档门红…"。
已知取舍：restore-drill 台账回填的 `failedPreLedger` 仍按"全档红清单"（GATES 本地轨）判 FAIL——比退出码更严（advisory 红也会记入台账结论），不构成放行，未改；见⑧。

## ④ 出口命令原文与退出码（全部本机亲跑）

| # | 命令 | exit |
|---|---|---|
| 1 | `node scripts/release/account-audit.mjs --self-test` | **0** |
| 2 | `node scripts/release/reconcile.mjs --self-test` | **0** |
| 3 | `node scripts/release/restore-drill.mjs --self-test` | **0** |
| 4 | `node scripts/release/account-audit.mjs`（缺省 dry-run 真跑，tmpdir 自建库） | **0**（归因：门共 3 红 0） |
| 5 | `node scripts/release/reconcile.mjs --mode diff-sample --n 20` | **0**（门共 7 红 0 · diffΣ=0） |
| 6 | `node scripts/release/restore-drill.mjs --manifest-check --tag v2.0.0` | **1**（台账 7 条 restore_drill=null，soft 红——与改前同因，护栏说真话） |
| 7 | `node --check ×3`（三面全 OK）+ `npx eslint scripts/release/*.mjs` | **0**（无任何 problem 输出） |
| 8 | `node scripts/release/preflight.mjs --self-test` | **0**（A-51 #132 跨轮硬门禁仍成立；其分级表未被触碰） |
诊断探针另跑：改前/改后红探针见②（0→1）；restore-drill account-audit reconcile 的真·线上口径（--i-know-this-is-prod 对真库）未跑，待 Phase 7。 |

## ⑤ data.db / wal / shm / 占位库 跑前 vs 跑后指纹（全程只读）

| 文件 | 跑前 | 跑后 | 一致 |
|---|---|---|---|
| data.db | 253952B · `6595517661cc` · 1789675538.198449400 | 253952B · `6595517661cc` · 1789675538.198449400 | ✅ |
| data.db-wal | 424392B · `88ed3fe2b2ce` · 1789675756.857435000 | 424392B · `88ed3fe2b2ce` · 1789675756.857435000 | ✅ |
| data.db-shm | 32768B · `2bceb8907276` · 1789577581.561551800 | 32768B · `2bceb8907276` · 1789577581.561551800 | ✅ |
| packages/server/data.db | 0B · `e3b0c44298fc` · 1789575053.374159200 | 0B · `e3b0c44298fc` · 1789575053.374159200 | ✅ |

全部临时写入仅在 os.tmpdir()（探针 fixture、日志、临时库）；对仓库根/真库未执行任何 `--i-know-this-is-prod` 命令；无 git 写操作。

## ⑥ 对 `preflight --dry-run` 退出码的影响与归因（未放宽任何门）

`--dry-run` 本轮未亲跑（不在出口命令清单、耗时且其步 8 会起服务 harness；并发对手在 packages/ui、apps/web）。归因基于④中子脚本亲测退出码：
- account-audit 子进程 0→0、reconcile 0→0、restore-drill --manifest-check 1→1（台账缺演练是 tempdir manifest 既有状态，改前实测即 exit 1）；preflight 的 inline 门"台账核对/对账基线 退出码 0"红绿状态不变 ⇒ **dry-run 退出码与红项数量不因本轮变化**。
- 若未来子脚本触发 hard 红线门（如 data.db 指纹变化、产物目录漂移、只读执行面混写），restore-drill 将从 1 升为 2，经 preflight 的 `childHardBad` 把 dry-run 顶到 2 —— 只会更严。
- advisory 白名单三面共 3 条，全部是"告警通道降级"同一条款（preflight #154 已裁同款）+ 疫苗③；无任何真实判据门从拦人改为放行。

## ⑦ README「退出码语义」段 diff（3 行措辞）

```diff
-| `1` | …或 `preflight` 任一 **soft 档 inline 门** `[GATE] … → FAIL` —— 缺项即红，报红即拦人 |
-| `2` | …或 `preflight` 任一 **hard 档红线门**失败 |
-`preflight` 的退出码 = 子进程最坏值与 inline 门禁最坏值再取最坏…（T-21d）。
+| `1` | …或四个脚本任一 **soft 档门** `[GATE] … → FAIL` —— 缺项即红，报红即拦人 |
+| `2` | …或四个脚本任一 **hard 档红线门**失败（hard 只收"触碰真库 / 契约破坏 / 静默丢数据"且逐条写理由） |
+四个脚本的 inline 门统一由 lib 的 `gateExitContrib(registryGates())` 汇出（hard→2 / soft→1 / advisory→0，未登记档位从严按 soft；T-21d/T-21e）；`preflight` 的退出码再与子进程最坏值取最坏…。只有各脚本分级表里逐条登记过理由的 `advisory` 白名单门报红不拦人。
```

## ⑧ 上报未修项（本轮刻意不动）

1. **脚手架四份重复**：`gateTierOf`/`runGateVaccine`/分级表自证现 preflight + 三脚本各一份（lib 禁改）；档位算式仍只有 lib `gateExitContrib` 一份。建议后续轮把查表/疫苗脚手架上收 lib（同 T-21c-iii 上收 ro() 的先例）。
2. **restore-drill 双轨注册表**：GATES 本地数组与 REGISTRY.gates 并存，台账 `failedPreLedger` 走 GATES（全档红，比退出码严）；合并需动台账语义，未越权。
3. **tempdir 台账既有脏数据**：%TEMP%/t21b/manifest.json 有 9 条 v2.0.0 条目、7 条 restore_drill=null（历史中断运行遗留）→ `--manifest-check` 现如实 exit 1；发布窗口需一次全流程成功演练回填，或在 Phase 7 决定清洗口径。
4. **pg 侧分级未实测**：`pg/profiles==N`、`判据⑦[pg]` 等门在本机无 DATABASE_URL_TEST 时不产数（显式 SKIP 非 PASS），归 T-22 CI 真跑。
5. **三脚本对真库的线上口径真跑**（--i-know-this-is-prod）待 Phase 7 由用户本人发起；本轮所有真跑均为 tmpdir dry-run 形态。
6. `upsertManifest` 按 file+sha256 去重，同 tag 多次演练产生同文件名不同 sha 的历史条目并存（③中 9 条的来源之一），属台账膨胀非本轮写面。
