# T-21c-iii 开发报告（批次4C · 发布护栏收口）

任务：U-4 + U-6（`restore-drill.mjs`）／`ro()`+`SQL_SURFACE` 上收（`lib.mjs`←`reconcile.mjs`）／N-4（🆕`manifest.spec.ts`）。
出口命令共用 2 次（第 1 次双 `--self-test`、第 2 次 `pnpm --filter @tm/server test`），全部 PASS。

## 1. 交付物清单（文件 + 行数 + Δ）

| 文件 | 改前 | 改后 | Δ | 说明 |
|---|---:|---:|---:|---|
| ✏️`scripts/release/restore-drill.mjs` | 1469 | 1600 | +131 | U-4 回填 + U-6 升格 + 守卫换 lib 版 + `--manifest-check` |
| ✏️`scripts/release/lib.mjs` | 721 | 741 | +20 | 新增导出 `SQL_SURFACE` + `ro()`（:54-67），头部"五件事"改"六件事" |
| ✏️`scripts/release/reconcile.mjs` | 533 | 522 | −11 | 删本地 `ro()`/`SQL_SURFACE`，改 import；判定逻辑零改动（§3 逐字对比） |
| 🆕`packages/server/test/release/manifest.spec.ts` | — | 230 | 新增 | 两支：成功演练回填非 null 且字段齐全 / 未演练=null、缺项 exit 1 |

禁改面复核：`preflight.mjs`、`README.md`、总报告、`services/backup.ts`、`test/release/backup.spec.ts`、`apps/**`、`packages/shared/**`、`tools/**` 一字未动。

## 2. 四件逐条对账（改前 → 改后 → 证据行号）

### U-4（A-45 #91）台账 `restore_drill` 恒 null
- 改前：schema `:633` 承诺"恢复·回填·回滚演练结论"，实现 `:1075` 写死 `restore_drill: null` 后从不回填。
- 改后：步 5 建条目先存变量（`:1146 manifestEntry = {…restore_drill: null}`——未演练仍如实为 null，不伪造）；主流程末尾（只读执行面自证之后、出口判定之前，`:1499-1541`）对同 `tag·file·sha256` 条目**经 `upsertManifest()` 追加一次 `restore_drill` 更新**——`upsertManifest` 去重键就是 `file+sha256`，故为**原地替换**，仍走全文件唯一产物写点，**未加新写面**。回填体 14 键（齐全性钉在 `:641 REQUIRED_DRILL_FIELDS` 九项 + `ok/verdict/failed_gates/tag/snapshot_sha256`），含裁决点名的 `{restored_integrity, fingerprint_vs_source, backfill_scan_hits, rollback_conclusion_a..d, executed_at, local_fixture_only}`。
- 判别力：新增出口门 `:1533 '② 步 5/台账 restore_drill 已回填且字段齐全'`——快照未产出 / 结论缺项 / 演练 FAIL 一律 gate=false → exit 1。真跑证据见 §4。

### U-6（A-45 #91）A 腿口径易误读
- 采"升格为 `[GATE]`"口径（裁决：与 `REQUIRED_METRICS` **二选一**，故不重复加指标名）。
- 改前：`:997-1000` 的 `note('A 腿口径说明：…007 是幂等跳过…')` 是纸面说明。
- 改后：`:1075-1080` 变 `gate('④前置/判据④主证据腿=④-bis 副本腿：A 腿只证幂等路径…"，条件 = `assessment_cache.user_id` 在建表串里已在位（同形坐实）**且** 007 仍在待执行清单)`——两条都是可观察事实，同形口径一旦漂移该门即红 → exit 1，不再是注释。
- ④-bis 同步提为**主证据腿**：头注释 ④ 段（`:9-15`）、A/B 腿说明块（`:71-84`，B 腿标"判据④ 的主证据腿"）、④-bis 节标题（`:819`）。

### N-4（A-47 #105）manifest 台账面零测试 —— 与 U-4 同轮落地
- 🆕`manifest.spec.ts` 两支（只 spawn 真脚本、真迁移路径，产物全在 `os.tmpdir()/tm-t21c-iii-manifest-<pid>`）：支①跑完整演练后钉 `restore_drill` 非 null、14 键齐全、`verdict=PASS`、该 tag 恰 1 条（原地替换非重复追加）、**预置的未演练无关条目仍为 null 不被代填**；支②用 `--manifest-check`（`:986` 起，只读模式：只 `readFileSync` 一份 manifest.json，零写入）钉 `restore_drill=null → exit 1（有备份无演练）`、缺项 → exit 1、无该 tag 条目 → exit 1、齐全 → exit 0。
- `backup.ts` 本体零触碰（裁决 `:9` 明载 manifest 写入归 `restore-drill.mjs`，其台账面测试即本文件；`backup.ts`/`backup.spec.ts` 归 T-21c-vi 名下 agent）。

### 上收（A-47 #104 U-1/L-4）
- `lib.mjs:54-67` 新增 `export const SQL_SURFACE` + `export function ro`，函数体与 `reconcile.mjs` 现版本**逐字一致**（同 `String(sql).split(/\s+/)…` 归一、同 `/^(SELECT|PRAGMA)\b/i` 前置断言、同 80 字报错截断、同 160 字登记截断），**没有更松**。
- `restore-drill.mjs` 本地重复实现（原 `:126` 数组 + 原 `:257-264` 函数）删除，`:259` 留上收戳，import 换 lib 版；`reconcile.mjs` 同（原 `:68-80`，节标题改"已上收至 lib.mjs"）。

## 3. `reconcile.mjs` 上收前后输出逐字对比

方法：改前连跑两遍钉住"唯一噪声 = 子进程 pid 与时间戳"（`tm-t21-<pid>` 路径、`collected_at/mtime/打开时刻`），改后同法归一化再 diff。

- 归一化：`sed -E 's/tm-t21-[0-9]+/tm-t21-PID/g; s/20[0-9]{2}-…T[0-9:.]+(…)?/TS/g'`
- 结果：`diff pre1n post` → **0 行差异**（`RECONCILE OUTPUT IDENTICAL (modulo pid/timestamps)`），退出码 改前 `0/0` → 改后 `0` 一致；`sql_surface_count` 与 `[SQL-SURFACE]` 整表逐条一致；`--self-test` 改后 exit 0、`read_only_scan_hits=0`、`ro_guard_rejected=true`（出口运行 1 原文见 §4）。
- **结论：零可观察差异，判定强度不变，未触发"停止上收"回退条件。**

## 4. manifest 两支用例原文输出

定向跑（vitest，正式出口跑见 §5）：
```
✓ @tm/server test/release/manifest.spec.ts (2 tests) 2721ms
  ✓ …台账（U-4 回填 + N-4 判别力） > 支①：成功演练后同 tag 条目 restore_drill 非 null 且字段齐全；未演练的无关条目保持 null、不被代填  2409ms
  ✓ … > 支②：--manifest-check 对 restore_drill=null / 缺项条目 exit 1，字段齐全 exit 0  306ms
Test Files 1 passed (1)   Tests 2 passed (2)
```
真跑演练（tmpdir 产物目录）关键行：
```
[GATE] ④前置/判据④主证据腿=④-bis 副本腿：A 腿只证幂等路径，"三条 ADD COLUMN 已真执行"不得记在 A 腿头上 … → PASS :: A 腿源实例：assessment_cache.user_id 建表串已带列=yes（同形坐实） · 007 仍在待执行清单=true · 逐字执行证据 = ④-bis 的 legacy_alter_statements_executed（tmpdir 副本腿）
[METRIC] driver=sqlite manifest_restore_drill_backfilled=YES(PASS)
[GATE] ② 步 5/台账 restore_drill 已回填且字段齐全（防"有备份无演练"…） → PASS :: pre-release-v-t21c3.db → restore_drill.ok=true · verdict=PASS   （DRILL_EXIT=0）
[GATE] 台账核对/restore_drill 非 null 且字段齐全（tag=v-t21c3 · 1 条） → PASS :: 全部条目演练结论完备        （--manifest-check，CHECK_EXIT=0）
[GATE] 台账核对/restore_drill 非 null 且字段齐全（tag=v0.0.9 · 1 条） → FAIL :: [{"file":"pre-release-v0.0.9.db","issues":["restore_drill=null（有备份无演练）"]}] （EXIT=1）
```
台账条目核验（演练后 `manifest.json`）：`entries=1`（回填=原地替换）、`restore_drill_keys` 14 项齐全、`ok=true verdict=PASS integrity=ok hits=0 fp=EQUAL`。

出口运行 1（双 `--self-test`）：reconcile `verdict=PASS exit_code=0`（安全阀 6/6、零写语句 hits=0、ro() 拒写 OK）；restore-drill `self-test PASS`（三家 .mjs 静态扫描严格命中=0：restore-drill 0 / preflight 0 / account-audit 0，产物写点 1/1，VACUUM 形态合规）。

## 5. 出口命令 2 + 并发说明

`pnpm --filter @tm/server test` → **Test Files 19 passed (19) · Tests 433 passed | 1 skipped**，全绿。
基线为 410 passed | 1 skipped / 17 文件：其中 **+1 文件 / +2 用例是本报告 `manifest.spec.ts`**；其余 **+1 文件 / +21 用例来自并发改动的测试面**（T-21c-vi 名下 `backup.spec.ts` 扩充，A-47 #105 N-2 授权），非本轮产物、归因已标注并发。

## 6. 数据红线自证

| 库 | 跑前 | 跑后 | 判定 |
|---|---|---|---|
| `data.db` | 253952 B · mtime 2026-09-18 04:05:38.198449400+0800 · sha256 `6595517…d87d` | 逐字段相同 | **未动** |
| `packages/server/data.db` | 0 B · mtime 2026-09-17 00:10:53.374159200+0800 · sha256 `e3b0c44…b855`（空文件） | 逐字段相同 | **未动** |

全程写入路径清单（无一例外）：`%TEMP%/t21c3-drill-*`（演练产物目录）、`%TEMP%/tm-t21-<pid>`（脚本 TMP_ROOT）、`%TEMP%/t21c3-*.txt、rec-*.txt`（shell 捕获）、`os.tmpdir()/tm-t21c-iii-manifest-<pid>`（spec 夹具，afterAll 清理）。**`backups/` 本轮零写入**（`manifest.json` mtime Sep 21 00:56，早于本会话第一条命令，为前一 agent 轮遗留）；`data.db` 仅被脚本按既有 `legacyAddColumnLeg` 只读复制（其 `legacy_source_untouched` 门在真跑中 PASS）。本地 smoke-test 造数数字未进本报告任何结论；需线上库的判据一律「未实测，待 Phase 7 向用户本人索取只读访问」。

## 7. 上报未修

1. **`reconcile.mjs` 既有 lint 红**：`import fs`（:32）与 `const HERE`（:66）上收前即无使用者，eslint 报 2 个 `no-unused-vars`（上收不背锅：删除的 `ro()`/`SQL_SURFACE` 块不含任何 `fs`/`HERE` 使用；已实测改前同报）。本任务授权"只允许删本地重复实现"，死 import 不在授权面内 → 留 TPM 决定（一行删除即可，行为零影响）。
2. **`preflight.mjs` 未接线 `--manifest-check`**：发布出口若要"有备份无演练=预检即红"，需在该门加一条对 `manifest.json` 的核对调用——preflight 是并发 agent 名下，未碰。建议 T-21c-v 写进 README/排班。
3. **pg 侧台账**：`--manifest-check` 对 `kind=pg` 条目同样要求 `restore_drill`（口径一致），但 pg 演练本身归 T-22 CI，本机无实例不实测。

## 8. 遗留清单

- `--manifest-check` 为 fail-safe 设计：不显式给 `--tag` 即 0 条目 → exit 1（防"忘给参数=放过"），文档已写进 HELP；若发布窗口想要"全表核对"形态，T-21c-v 拍板。
- U-4 回填含 `failed_gates` 快照（回填时刻的门禁面），与出口判定时点相差 1 门（台账门自身）——如需完全同点可在 v 轮收口，本轮判不构成账面风险。
- 出口命令 2 次中已含全部验证；`restore-drill.mjs --self-test` 三家静态扫描 hits=0 持续成立（新增代码零裸写关键字，`ADD COLUMN` 类说明文字全部进注释或小写形态）。
- README（`scripts/release/README.md`）与本任务总报告口径按裁决归 **T-21c-v**（含 L-6 的 `account-audit` 主从关系、本轮 `--manifest-check` 用法与 `_entry_schema.restore_drill` 新说明的人读版）。
