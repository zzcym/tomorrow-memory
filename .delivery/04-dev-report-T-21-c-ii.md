# 04-dev-report · T-21c-ii（批次 4C）—— `backup.ts` 双分支单测补口（U-2 结项）

- 任务代号：**T-21c-ii** ｜ 轮次：批次 4C ｜ 上游：`.delivery/04-dev-report-T-21-b.md` §6 未修表 **U-2 行**
- 范围纪律：**只新增 1 个 spec 文件 + 本报告**，`backup.ts` / `scripts/release/**` / `apps/**` / `packages/shared/**` 一字未改（见 §4 git 取证）
- 阅读纪律：判据原文只读 `02-tech-design.md:918`（单行）；U-2 只读 `04-dev-report-T-21-b.md` 的 §6 那一行；夹具只读 `assessment-isolation.spec.ts` 前 120 行 —— **未通读任何主文档**

---

## 1. 交付物清单

| # | 路径 | 行数 | 用例条数 | 状态 |
|---|---|---|---|---|
| 1 | `packages/server/test/release/backup.spec.ts` | 🆕 **405** | **17**（全绿，0 skipped） | 交付 |
| 2 | `.delivery/04-dev-report-T-21-c-ii.md` | 本报告 | — | 交付 |
| — | `packages/server/src/services/backup.ts` | 376（**未改**） | — | 被测对象，覆盖从 **0 → 17 例** |

用例分组（`describe` 三档）：

| 组 | 条数 | 内容 |
|---|---|---|
| `成功分支（判据② VACUUM INTO 产物）` | 6 | 产物存在/size>0/size 与磁盘一致、sha256 可复核（独立 `node:crypto` 重算 == 实现回显）、sha256 稳定（同库两次跑哈希逐字节相等）、产物是合法库（只读打开查回源表 5 行）、**成功 notified===false 且通道已配置也零出站**、源库三指纹未动 |
| `失败分支（R-24② 可感知 + R-24⑩ 未配置降级）` | 6 | 写不进去（父路径是普通文件）→ `notified===true` + 告警四要素、源库断链 → reason 点名"源库文件不存在"、产物目录闸门拒绝且**目录未被创建**、`ALERT_WEBHOOK_URL` 未配置 → 降级为日志/不抛/不阻塞/`notified===false`、失败必返结构化五字段、通道配置但死端口 → 吞错降级 |
| `通道与目录护栏` | 5 | `describeAlertChannel` 未配置（`configured:false`/`blocking:false`/永不抛）、URL 不可解析不抛、`notifyViaChannel` 未配置降级 + **host 脱敏**（完整 URL 含 `?key=` 不出现在返回值里）、`assertSnapshotOutDir` 三态、`snapshotFileName` 防目录穿越 |

夹具风格：`os.tmpdir()/tm-t21c-ii-backup-${process.pid}` + `better-sqlite3` 自建一张 `widget` 表 + `afterAll` 清理，与 `test/integration/assessment-isolation.spec.ts`（T-25）同形。**不跑任何迁移、不建迁移**。
`notified===true` 的成立前提是"通道已配置且 HTTP 真 2xx"（`backup.ts:208-221`），故本文件在 `beforeAll` 真起了一个 `127.0.0.1` 随机端口 HTTP 收件箱（`received[]`），既钉失败分支"告警真出站 + 四要素 payload"，也用同一个端点**反证成功分支零出站请求**。

---

## 2. 判据对账表（`backup.ts` 两条硬判据 → 用例 → 结果）

| 判据（原文位置） | 断言面 | 用例 | 结果 |
|---|---|---|---|
| **判据②**：SQLite 产物 = `VACUUM INTO` 的 `pre-release-<tag>.db`，**size>0 + sha256**（`backup.ts:241-279`；§918 判据②/③ 行） | `ok===true` ∧ 文件存在 ∧ `size_bytes>0` ∧ `size_bytes===fs.statSync(file).size` ∧ `sha256` 64 位十六进制 ∧ `===` 独立重算值 ∧ 同库两次跑哈希相等 ∧ 产物只读可查回源表 5 行（= 快照真能恢复面的一小步） | 成功分支 1-4 | **PASS** |
| **步 5b③ / R-24⑩**：**成功备份不发通知**（防噪音；`backup.ts:277` 的 `notified:false` 声称"本行是唯一写点"） | `result.notified===false` ∧ `alert===null` ∧ **把 `ALERT_WEBHOOK_URL` 配成真端点后重跑成功快照** → 收件箱 `received.length===0` | 成功分支 5 | **PASS**（结构性主张被行为反证锁住：以后若有人给成功分支加通知，这条立刻红） |
| R-24②（F-6 原始缺陷）：失败必须可感知 —— 结构化返回 + `[BACKUP][RED]` 日志 + 出站 | `ok===false` ∧ `reason/action` 非空 ∧ `notified===true` ∧ `alert.sent===true` ∧ payload 含 database/at/reason/action 四要素 ∧ `console.error` 命中 `[BACKUP][RED]` | 失败分支 1、2、3、5 | **PASS** |
| R-24⑩：告警目标未配置 **不得**因未配置而报错或阻塞发布 | 未配置下失败分支：`await` 正常返回（不抛）∧ `notified===false` ∧ `alert.sent===false` ∧ reason 含"降级" ∧ 日志含"不报错、不阻塞" ∧ 零 HTTP 请求；`describeAlertChannel({})` 永不抛且 `blocking:false` | 失败分支 4、6；护栏 1、3 | **PASS** |
| §10.2 T-21 行"全程只读 + 只写 `backups/`"在服务端侧的等价闸门 | 非 `backups`/非 tmpdir 的 outDir → `ok===false` + reason 含"拒绝写入" + **目标目录磁盘上不存在**（证明拒绝发生在写之前）；源库 size/mtime/sha256 三指纹跑前后一致 | 失败分支 3；成功分支 6 | **PASS** |

结论：U-2 的实质缺项（"`backup.ts` 零单测覆盖"）**结项**，两条硬判据（`VACUUM INTO` 产物 + 成功不发通知）现在有测试锁。

---

## 3. 出口命令原文与输出摘要

```
$ pnpm --filter @tm/server test -- backup
$ vitest run --root ../.. --project @tm/server "--" "backup"
 ✓  @tm/server  test/release/backup.spec.ts (17 tests) 491ms
 Test Files  17 passed (17)
      Tests  410 passed | 1 skipped (411)     ← 首跑 tail 记录
 Duration  18.70s

$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
（无输出，exit 0）
```

- **`--filter` 后的文件名过滤确实没过滤**（照抄任务书警告）：`-- backup` 与 `-- test/release/backup.spec.ts` 两次都收集到 **17 个 test file / 410 条**，即全套。按行数判断：本人名下 `test/release/backup.spec.ts (17 tests)` 单行 **✓**，全套 `17 passed (17)` ⇒ **本人名下 0 红，全套也 0 红**（唯一 1 条 skipped 是 T-11 `chat-isolation` 的 pg 环境自证，非本轮）。
- 本仓既有坑复现确认：在包目录裸跑会丢装配，必须走 `pnpm --filter @tm/server test`（脚本自带 `--root ../..`）。
- 中途 1 次 typecheck 红（`TS18048: 'payload' is possibly undefined`，`noUncheckedIndexedAccess`）→ 在 **spec 文件内**修（`received[0] ?? {}` 显式标注类型），未动实现；修后 typecheck 干净。
- 并发提示：本机另有并行 agent 在同一工作区跑（`git status` 显示 `apps/**`、`.gitignore` 等大量非本任务改动在册），全套数字若瞬时红按"疑似并发所致"处理；本轮 3 次出口命令内**未观察到红**。

---

## 4. 数据红线自证

`data.db`（根 + `packages/server/`）**跑前/跑后各取一次 size + mtime + sha256 前 16 位**：

| 文件 | 跑前 size | 跑前 mtime | 跑前 sha256[0:16] | 跑后 size | 跑后 mtime | 跑后 sha256[0:16] | 判定 |
|---|---|---|---|---|---|---|---|
| `data.db`（仓库根） | 253952 | 2026-09-18 04:05:38.198449400 +0800 | `6595517661cc6a34` | 253952 | 2026-09-18 04:05:38.198449400 +0800 | `6595517661cc6a34` | **一字未动** |
| `packages/server/data.db` | 0 | 2026-09-17 00:10:53.374159400 +0800 | `e3b0c44298fc1c14` | 0 | 2026-09-17 00:10:53.374159400 +0800 | `e3b0c44298fc1c14` | **一字未动**（空文件，`e3b0c442…` 即空串哈希） |

- 本 spec **从不打开**仓库内任何 `data.db`：源库与产物全部在 `os.tmpdir()/tm-t21c-ii-backup-<pid>/` 下，`afterAll` 里 `fs.rmSync(tmpDir,{recursive:true,force:true})` 清干净。
- **未向 `backups/` 落任何产物**：全部快照的 `outDir` 传 tmpdir 下的临时目录；"闸门"用例传的是 `process.cwd()/tm-t21c-ii-forbidden-out`，但断言的正是**它没被创建**（拒绝发生在 `mkdirSync` 之前，`backup.ts:232-238`）。仓库根 `backups/` 目录跑后内容与跑前一致（`ls` 复核，无新 `pre-release-*` 条目）。
- **未建任何迁移**：夹具只 `CREATE TABLE widget`；未 import `MigrationRunner`/`ALL_MIGRATIONS`，未跑 `db:migrate`。
- 唯一新增文件即 §1 两个；取证说明：`git check-ignore -v` 对这两个路径**零命中**（未被忽略），而 `git status --porcelain packages/server/test` 输出 `?? packages/server/test/`（整个 test 目录当前是未跟踪态，属仓库存量状态而非本轮造成），故无法用 porcelain 逐条点名本轮新增 —— 本轮**只新增** §1 那两个文件，未修改任何既有文件；`git status` 里其余 M/D 条目（`apps/**`、`.gitignore` 等）属并行 agent 与既有工作区状态，非本轮。

---

## 5. 上报未修（交回 TPM 派单）

| # | 事项 | 证据 | 影响 | 最小修法 |
|---|---|---|---|---|
| **N-1** | U-2 行与任务书写的 **`createBackup()` 在 `backup.ts` 里不存在**。真实导出只有 `preReleaseSnapshot()`（步 5 快照）/ `scheduleBackup()`（每日 PG 例行）+ 一组纯函数 | `grep -n "^export" packages/server/src/services/backup.ts` 无 `createBackup` | 若照 U-2 字面派单会要求测一个不存在的符号；本轮**按真实导出写用例，未改实现** | 派单口径统一改为 `preReleaseSnapshot()`（P-9 式文案更正，登记进 `04-adjudications.md` 即可，不动代码） |
| **N-2** | `scheduleBackup()`（`backup.ts:320-376`）**仍 0 覆盖**：它 `setTimeout(5min)+setInterval(24h)` 起轮并直接 `execFile` 真 `pg_dump`，**没有任何注入点**（不像 `preReleaseSnapshot` 有 `req.alert` / `req.pgDumpBin`）。在当前形态下单测要么等 5 分钟要么真打 PG | `backup.ts:320-376` 对比 `:159-158` 的 `alert?` 注入位 | "每日例行备份失败可见性"这条面只有代码注释自述 | 需授权改 `backup.ts`（**本轮未做**）：把备份体提成可导出纯函数 `runDailyBackupOnce(config, databaseUrl, now, deps?)`，`scheduleBackup` 只负责定时器；测试注入 `deps.runDump`。约 +10/-6 行，行为等价 |
| **N-3** | pg 侧快照面（`runPgDump()` / `findPgDump()` / `pre-release-<tag>.dump`）本轮**未覆盖**，非 SKIP 而是**未写**：本机无 `postgresql-client`、无 `DATABASE_URL_TEST` | 全套输出里 T-11/T-25 的 pg 用例同样按 A-18-3 先例 SKIP | 判据② 的"PG 走 `pg_dump -Fc`"半条只有 sqlite 侧被测试锁 | `findPgDump` 可纯函数直测（`PGDUMP_BIN` 注入）；`runPgDump` 建议加 `execFile` 注入点后测 ENOENT/非零退出两支 → 归 T-22 CI 或 N-2 同轮 |
| **N-4** | 判据② 后半句 **"size>0 + sha256 写入 `backups/manifest.json`"不在 `backup.ts`**（文件头 `:8-9` 明写 manifest 写入归 `scripts/release/restore-drill.mjs`），本轮不越界测脚本面；该半条仍只有脚本自述，且 T-21b 的 **U-4（`restore_drill` 恒 `null`）** 未修 | `backup.ts:8-9`；`04-dev-report-T-21-b.md` §6 U-4 行 | 台账面（"有备份且演练过"）仍无测试锁 | 由 TPM 合单：manifest 的读写测（`test/release/manifest.spec.ts`）应跟 U-4 的修复同轮，别只补测试不补回填 |

**无一条判据因"实现做不到"而写成 SKIP**：17 条全部真跑真断言，`it.skip` / `describe.skip` 零出现。

---

## 6. 遗留清单

1. **L-1**（=N-2）`scheduleBackup()` 可测性改造 → 需 TPM 授权动 `backup.ts` 的一轮，下一期与 N-3 合单最省。
2. **L-2**（=N-3）pg 侧 `findPgDump`/`runPgDump` 两分支 + `preReleaseSnapshot({kind:'pg'})` 的 sqlite/pg 双驱动对账 → 归 T-22 CI（有 `postgresql-client` 的 runner）。
3. **L-3**（=N-4）`backups/manifest.json` 台账与 `restore_drill` 回填 → 跟 U-4 同轮。
4. **L-4** `VACUUM INTO` 产物的**哈希稳定性目前是"同版本 SQLite 下逐字节一致"的经验结论**：本文件已把它钉成断言（成功分支 3）。若未来升 `better-sqlite3` 主版本导致 SQLite 头部写计数变化，这条会变红 —— 那时应放宽为"可复核 + 与源库一致性"两档，并在报告登记，不要直接删断言。
5. **L-5** 本文件在 `assertSnapshotOutDir` 的"backups 命名放行"分支只测了 `deep/backups`（tmpdir 内），**未在仓库真实 `backups/` 下产生产物**（红线要求）；真机发布窗口的 `backups/pre-release-<tag>.db` 落盘面归 §6.4-2b 真机窗口验证。
