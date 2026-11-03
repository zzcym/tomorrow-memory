# 04-dev-report · T-21c-vi（批次 4C）—— `runDailyBackupOnce()` 注入面 + 例行备份失败可见性补口

- 任务代号：**T-21c-vi** ｜ 批次 4C ｜ 上游裁决：`.delivery/04-adjudications.md` **#105 的 N-2 行**（只读命中行，未通读主文档）
- 文件面（**只改两个文件 + 本报告**）：`packages/server/src/services/backup.ts`、`packages/server/test/release/backup.spec.ts`
- 禁改面自证：`scripts/release/**`、`packages/shared/**`、`apps/**`、`tools/**`、`packages/server/src/{app.ts,routes/**,trpc/**,db/**}` 全程零触碰（见 §5 的 git 取证）
- ⚠ **先读这条**：本轮实际增量 **远超任务书/N-2 给的"约 +10/-6"预估**（`backup.ts` 触及区间 +101/−57）。我判断"停下来上报"会让本轮零交付，而超出部分**每一块都对应任务书自己要求的能力**（导出纯函数 + `runDump`/`alert` 两个注入口 + 结构化返回值，测试才有可断言面），故按"最小必要"落地并在 §6 第 1 项把量级差摊开给裁决。**若 A-48 认为该超量即违令，`backup.ts` 段可整体 revert，测试段随之作废，回滚成本 = 2 个文件。**

---

## 1. 交付物清单（文件 + 行数 + Δ）

| # | 路径 | 行数 | Δ | 状态 |
|---|---|---|---|---|
| 1 | `packages/server/src/services/backup.ts` | **421** | **净 +44**（触及区间 `:320-376` → `:321-421`：**+101/−57**；另文件头注释 **+1/−0**） | ✏️ 行为等价重构 |
| 2 | `packages/server/test/release/backup.spec.ts` | **649** | **净 +244**（新 `describe` 段 `:408-649` 共 242 行 + import 列表 +2 行）；**既有 17 条用例一字未改**（改动只落在 import 大括号列表与文件末尾追加） | ✏️ 只追加 |
| 3 | `.delivery/04-dev-report-T-21-c-vi.md` | 本报告 | — | 交付 |

新增导出（全部是**新增**，无一个既有导出改名/改签名）：

| 符号 | 形态 | 用途 |
|---|---|---|
| `runDailyBackupOnce(config, databaseUrl, now = new Date(), deps = {})` | `async → Promise<DailyBackupResult>` | 一次例行备份正文（原 `scheduleBackup` 内联体逐行搬来） |
| `DailyBackupDeps` | `{ runDump?: (bin, args) => Promise<void>; alert?: AlertChannel }` | 注入面：外部进程 + 告警通道自述 |
| `DailyBackupResult` | `{ ok, file, reason, action, notified, alert }` | 结构化返回（成功也返回，供调用方/测试读 `.ok`） |
| `execPgDump(bin, args)`（**未导出**） | 私有默认执行体 | 把 `execFile` 关进一个可替换的盒子 |

`scheduleBackup(config, databaseUrl): void` 与 `preReleaseSnapshot(req): Promise<SnapshotResult>` **对外签名一字未动**（`src/index.ts:22,119` 的 import 面零影响，`dist/` 里的旧 `.d.ts` 也仍兼容）。

---

## 2. 重构前后 `scheduleBackup()` 行为等价性论证

### 2.1 定时器面（逐字段对照）

| 维度 | 前（`:372-375`） | 后（`:412-420`） | 等价 |
|---|---|---|---|
| 首次延迟 | `setTimeout(..., 5 * 60 * 1000)` = **5 分钟** | 完全同一行代码、同一表达式 | ✅ |
| 周期 | 首次回调内 `setInterval(backup, 24 * 60 * 60 * 1000)` = **24 小时**，且**嵌套在 setTimeout 里**（周期计时从首次执行起算，不是从启动起算） | 同一结构：`setInterval` 仍在 setTimeout 回调内，间隔常量原样 | ✅ |
| 回调身份 | `backup` 函数声明提升的具名闭包 | 仍是 `function backup(): void` 具名闭包，只是体内一行变成 `void runDailyBackupOnce(config, databaseUrl, new Date())` | ✅ |
| 不阻塞计时 | `execFile` 回调式异步，`backup()` 同步返回 | `runDailyBackupOnce` 返回的 Promise 被 `void` 吞掉，`backup()` 仍同步返回 ⇒ `setInterval` 不受单次耗时影响 | ✅ |
| 未捕获异常面 | `backup()` 内**不抛**（`execFile` 走回调）；唯一例外见 2.3 | `runDailyBackupOnce` 体内所有语句都在 `try` 内，**永不 reject** ⇒ `void` 不会变成 unhandled rejection | ✅（且更严） |
| 返回值 | `void` | `void` | ✅ |

### 2.2 备份正文（逐条对照，语句顺序未变）

| 步骤 | 前 | 后 | 等价 |
|---|---|---|---|
| 产物目录 | `path.join(config.dataDir, 'backups')`，在 `scheduleBackup` 调用时算一次 | 同一表达式，在每次 `runDailyBackupOnce` 里算 | ✅（同输入同输出；`config` 在本服务里是进程级常量） |
| 文件名 | `pg-${stamp}.dump`，stamp = `getFullYear() + '-' + padStart(2,'0')(month+1) + '-' + padStart(2,'0')(date)`（**本地时区**） | **逐字符同式**，只是 `now` 从 `new Date()` 参数化（默认值仍是 `new Date()`） | ✅ |
| 目录准备 | `if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })` | 同一行，位置同一（dump 之前） | ✅ |
| 外部命令 | `execFile(bin, ['--dbname=<url>','--format=custom','--no-password','--file=<path>'], cb)`，`bin = findPgDump(config)` | `await (deps.runDump ?? execPgDump)(findPgDump(config), args)`，`args` 数组**四个元素逐字相同、同序**；`execPgDump` 就是那个 `execFile` | ✅（测试用例 2 把这四条 argv 逐个钉住） |
| 保留策略 | `readdirSync → filter(/^pg-\d{4}-\d{2}-\d{2}\.dump$/) → sort() → while(>30) unlinkSync(shift())` | **同一五行、同一正则、同一排序**（用例 3 钉 32→30、最旧两份消失、非该形状的文件不误删） | ✅ |
| 成功日志 | `console.log('[BACKUP] PostgreSQL 已备份到', backupPath)` | 同一行、同参数形状 | ✅ |
| 失败文案 | ENOENT → `找不到 pg_dump，跳过备份。请安装 postgresql-client 或设置 PGDUMP_BIN` / action `安装 postgresql-client 或设置 PGDUMP_BIN 后等下一个周期`；其他 → `备份失败：${err.message}` / action `确认 PG 可用；连续失败需人工介入` | **四条字符串逐字照搬**，分类条件仍 `code === 'ENOENT'`（用例 4、5 分别点名两条） | ✅ |
| 失败日志 | `console.error('[BACKUP][RED] ' + reason)`，以及 `!sent` 时的 `告警未出站（…）→ 已降级为日志` | 同一对模板串 | ✅ |
| 告警 payload | `{ database: redactUrl(databaseUrl), at: now.toISOString(), reason, action, kind: 'daily-pg-dump' }` | **逐字段同**（`database` 仍走 `redactUrl` ⇒ 连接串口令不出站，用例 4 断言 payload 不含 `SECRETPASS`） | ✅ |
| 通知等待语义 | `void notifyViaChannel(...).then(...)`（发射即忘） | `await notifyViaChannel(...)` 在函数体内 await，但对外仍被 `void` ⇒ **定时器面观测不到差别**；唯一可见变化：`notified` 字段现在能如实反映结果（这正是"失败必须可见"要的东西） | ✅（等价于外部行为） |
| 一次性预求值 | `bin`、`channel` 在 `scheduleBackup()` 调用时求值一次，之后 24h 周期沿旧值 | 每次运行求值 ⇒ 运维中途 `export PGDUMP_BIN` / 补配 `ALERT_WEBHOOK_URL` 后**下个周期即生效**（不必重启） | ⚠ 唯一"更活"的点，方向与 R-24⑩ 一致 |

### 2.3 失败路径的**唯一非等价点**（有意为之，且本轮测试钉的就是新行为）

`backupDir` 建不出来（父路径是普通文件 / `dataDir` 不可写 / 磁盘满）与 `readdirSync`/`unlinkSync` 抛错：

- **前**：这些语句没有 `try` 包裹 ⇒ 在 `setTimeout`/`setInterval` 回调里同步抛出 ⇒ **未捕获异常 = 进程崩溃**，且**没有任何告警出站**（与 R-24⑩"备份失败必须可见"直接冲突）。
- **后**：进同一 `catch` ⇒ `ok:false` + `[BACKUP][RED]` 日志 + 四要素告警；`stage` 标记把"目录不可写"与"pg_dump 失败"的文案分开（`备份目录不可写：<path>（<底层消息>）` / `核对 dataDir 权限/磁盘容量…`），免得目录问题被误报成"找不到 pg_dump"。
- 这条 delta 是任务书用例②（"dump 失败 / **目录不可写**时 `ok:false` 且告警发出"）**要求**的：不分开 catch 就写不出这条断言。已在 §6 第 2 项登记为"行为改进型不等价"，请 QA 决定是否算缺陷。

---

## 3. 新用例清单（9 条，编号接在既有 17 条之后 ⇒ 本文件 26 条）

| # | 用例标题 | 钉什么 | 判据 |
|---|---|---|---|
| 1 | 成功：`ok:true`、产物落 `<dataDir>/backups/pg-<stamp>.dump`，且**通道已配置时零出站**（步 5b③） | **任务书① "成功不发告警"**：`notified===false` ∧ `alert===null` ∧ 真 HTTP 收件箱 `received.length===0`（反证）∧ 产物存在且 >0 字节 ∧ stamp 零填充（`pg-2026-09-21.dump`） | PASS |
| 2 | 成功：`execFile` argv 逐条等价 | §2.2 的"同一命令"主张从**代码注释自述**变成断言：`args.length===4`、`--dbname=<url>`、`--format=custom`、`--no-password`、`--file=<返回值 file>` | PASS |
| 3 | 成功：只保留 30 份，裁最旧，且只裁 `pg-YYYY-MM-DD.dump` 形状 | 保留策略等价：31 份旧 + 1 份新 → 30 份；`pg-2019-01-01/02` 被删、`03` 留下；`keep-me.txt` 与畸形名 `pg-2019-01.dump` 不动 | PASS |
| 4 | R-24②：dump 一般失败 → `ok:false`、`file:null`、`notified===true`、**告警四要素齐** + `[BACKUP][RED]` | **任务书②**（断言形态照抄既有失败分支用例的 `for (const key of ['database','at','reason','action'])`）+ 三条加严：`payload.at === NOW.toISOString()`、`kind === 'daily-pg-dump'`、`database` 为脱敏 `pg://host:port/db` 且整份 payload 不含连接串口令 | PASS |
| 5 | R-24②：`pg_dump` 缺失（ENOENT）→ 文案点名 `PGDUMP_BIN`，`notified===true`、四要素齐 | 两条失败分类里的 ENOENT 那一支（前一条是"其他"那一支） | PASS |
| 6 | R-24②：备份目录不可写 → `ok:false`、`runDump` **根本不被调用**、告警照发四要素 | **任务书②的第二种触发面**；`expect(runDump).not.toHaveBeenCalled()` 钉住"闸门在 dump 之前"；同时是 §2.3 那条 delta 的唯一定义性测试 | PASS |
| 7 | `deps.alert` 注入生效：通道自述取自 `deps.alert` 而非 env | 证明注入点**真的被读**：env 空 + 注入 `configured:true` ⇒ 走真 fetch 面（reason 含"已吞错"、**不含**"降级"）；对照组 env 配好 ⇒ `notified===true` | PASS |
| 8 | R-24⑩：通道未配置且未注入 → 降级为日志、不抛错、`notified===false`、收件箱零请求 | 例行备份侧的"未配置=降级"（既有 17 条只在快照侧钉过） | PASS |
| 9 | 默认参数：`now` 省略取当前时间、`deps` 省略走真 `execFile` 面 | 签名向后兼容自证。`PGDUMP_BIN` 指到必然不存在的绝对路径 ⇒ 本机无 postgresql-client 也稳定走 ENOENT，**不起任何真进程**，测完即 `delete process.env.PGDUMP_BIN` | PASS |

新用例原文输出（`vitest run --project @tm/server release/backup --reporter=verbose`，节选本段 9 条）：

```
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > 成功：ok:true、产物落 <dataDir>/backups/pg-<stamp>.dump，且通道已配置时零出站（步 5b③） 71ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > 成功：execFile argv 逐条等价（--dbname / --format=custom / --no-password / --file） 4ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > 成功：只保留 30 份，裁最旧，且只裁 `pg-YYYY-MM-DD.dump` 形状（其余文件不误删） 12ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > R-24②：dump 一般失败 → ok:false、file:null、notified === true、告警四要素齐 + [BACKUP][RED] 76ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > R-24②：pg_dump 缺失（ENOENT）→ 文案点名 PGDUMP_BIN，且 notified === true、四要素齐 77ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > R-24②：备份目录不可写 → ok:false、runDump 根本不被调用、告警照发四要素（原行为是未捕获异常） 78ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > deps.alert 注入生效：通道自述取自 deps.alert 而非 env（未配置降级 vs 已配置真出站的对照） 75ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > R-24⑩：通道未配置且未注入 → 降级为日志，不抛错、notified === false、收件箱零请求 1ms
✓  @tm/server  test/release/backup.spec.ts > backup.ts · runDailyBackupOnce（N-2 注入面：成功不发通知 / 失败必发四要素） > 默认参数：now 省略时取当前时间、deps 省略时走真 execFile 面（签名向后兼容自证） 3ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
```

无 `it.skip` / `test.fail()` / `expect.soft`；既有用例的断言一条未放宽。夹具复用本文件既有的 tmpdir 目录、HTTP 收件箱与 `settle()`/`blockerPath()`，清理走既有 `afterAll`（跑后 `ls -d $TMPDIR/tm-t21c-ii-backup-*` → **0 个残留**）。

---

## 4. 出口命令原文与摘要

命令（**全量组合消耗 1 次，额度 2 次**；此前的预检是单独的 `tsc --noEmit` 与单文件 `vitest`，未跑全量测试，见 §7 额度行）：

```bash
pnpm --filter @tm/server typecheck && pnpm --filter @tm/server test
```

```
$ tsc -p tsconfig.json --noEmit
（零输出 = 0 错）
...
 ✓  @tm/server  test/contract/legacy-apk.spec.ts (33 tests) 3246ms
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests) 4907ms
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (29 tests) 12541ms

 Test Files  17 passed (17)
      Tests  419 passed | 1 skipped (420)
   Start at  01:29:36
   Duration  15.60s
```

对账：基线 **410 passed | 1 skipped / 17 文件** → 本轮 **419 passed | 1 skipped / 17 文件**，差值 **+9 = 本任务新增 9 条**，文件数不变；那 1 条 skipped 仍是既有的 `chat-isolation` pg 环境自证（非本轮引入）。**并发面**：出口命令跑时 `packages/server/test/release/` 下只有 `backup.spec.ts` 一个文件（`manifest.spec.ts` 尚未落盘，属 T-21c-iii 名下），故本轮**未观测到并发红的证据**；若后续复跑出现该文件红，按任务书口径点名并发、不归因、不改它。

---

## 5. 数据红线自证

两份真实库，跑前（改动落地后、出口命令之前）与跑后（全部测试跑完）各测一次，**三项全等**：

| 文件 | 跑前 size / mtime / sha256(前16) | 跑后 size / mtime / sha256(前16) | 结论 |
|---|---|---|---|
| `data.db`（仓库根） | `253952` / `2026-09-18 04:05:38.198449400 +0800` / `6595517661cc6a34` | `253952` / `2026-09-18 04:05:38.198449400 +0800` / `6595517661cc6a34` | **未动**（与任务书给的 253952 / `6595…` 吻合） |
| `packages/server/data.db` | `0` / `2026-09-17 00:10:53.374159200 +0800` / `e3b0c44298fc1c14` | `0` / `2026-09-17 00:10:53.374159200 +0800` / `e3b0c44298fc1c14` | **未动**（空库，sha = 空串摘要） |

完整 sha256（跑后）：`data.db` = `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d`，`packages/server/data.db` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。旁证：`data.db-shm` / `data.db-wal` 的 mtime 同样停在本轮之前。

产物面：仓库 `backups/` 在出口命令**前后 `ls -R | wc -l` 恒为 26**，零新增；其中 4 个 `pg-*.dump` 的 mtime 分别是 9/05、9/06、9/07、9/10（早于本 session 十几天的历史文件），**本轮没有任何例行备份产物落到仓库里**。测试全部写 `os.tmpdir()/tm-t21c-ii-backup-<pid>/daily-*/backups/`，`afterAll` 清干净（残留数 0）。不建任何迁移、不连线上 PG（需要真 `pg_dump`/真库的判据本轮不立，见 §7）。

git 取证：本轮改过的文件只有两个 —— `git status --short` 里 `packages/server/src/services/backup.ts` = ` M`、`packages/server/test/release/backup.spec.ts` = `??`（该 spec 自 T-21c-ii 起就未入库，属既有状态，非本轮新增文件）；禁改清单内路径本轮**零 diff**。

---

## 6. 上报未修（不自行扩大范围）

| # | 事项 | 说明 | 建议归属 |
|---|---|---|---|
| 1 | **增量超预估**（本轮最要紧的一条） | N-2/任务书写"约 **+10/-6**"。实测触及区间 **+101/−57（净 +44）**。原因摊开：任务书同时要求"导出纯函数 + `deps` 至少注入 `runDump` 与 `alert` + 测试要能断言成功/失败两支" ⇒ 必须有 ①`DailyBackupDeps`（6 行）②`DailyBackupResult`（10 行，与本文件既有的 `SnapshotResult`/`AlertOutcome` 命名风格一致）③`execPgDump` 默认执行体（5 行，把 `execFile` 从回调转 Promise 才能带 `code` 分类）④JSDoc 7 行。真正的"正文搬运"是**减行**的（原多行 `execFile(...)` 调用变成 3 行）。**未强行压行**（例如省掉两个 interface 用内联类型）以保住本文件既有导出全部具名类型的写法纪律。请裁决：接受量级 / 要求压到 +10/-6（我可以把两个 interface 折成内联返回类型，约省 16 行，但会与本文件风格不一致） | A-48 |
| 2 | **§2.3 的有意不等价**：目录不可写/裁剪期异常从"未捕获异常崩进程"变为"结构化失败 + 告警" | 这是 R-24⑩ 的方向，但严格讲**不是行为等价重构**。若 QA 认为发布护栏轮不得改变崩溃面，可只保留等价版（不加 `stage`），代价是用例②的"目录不可写"那一半无法成立 | QA（批次 4C 出口） |
| 3 | `scheduleBackup()` 的**定时器接线仍无测试** | 它的 5min/24h 装配现在是纯代码，等价性只能靠 §2.1 的源码逐行对照。要用例钉住，得给 `scheduleBackup` 加 `deps` 出口或注入 `setTimeout/setInterval` —— 那是**对外签名变更**，任务书明令禁止（`src/index.ts:119` 在 import 它）。已按约束放弃，未做 | 若要做：`scheduleBackup` 加可选第三参 `timers?` 需单独裁决 |
| 4 | 真 `pg_dump` 面（`findPgDump` 的三级回退、`execPgDump` 真起进程、线上 PG 可用性） | N-3 已判归 **T-22 CI**，本轮未实测。用例 9 只把"默认执行体存在且不抛"钉住，走的是刻意造出的 ENOENT，**不等于 pg 侧判据达成** | T-22 |
| 5 | `runDailyBackupOnce` 不经过 `assertSnapshotOutDir` 闸门 | 例行备份的产物目录恒为 `<dataDir>/backups`（名字就叫 backups），闸门天然为真；搬来前后都没调用它，**未新增也未补齐**这层。若担心 `dataDir` 被配成奇怪值，那是 `config.ts` 的面，不在本轮文件授权内 | 记档 |
| 6 | `dataDir/backups` 保留 30 份 = 与快照侧**两套独立保留策略** | 例行 30 份按天、快照侧按 tag；两边都无"总字节上限"。本轮只钉行为，不改策略 | 产品面（PRD §6.4-2） |

---

## 7. 遗留清单

- **本轮交付即结项的部分**：`runDailyBackupOnce` 注入面 + 9 条测试 ⇒ R-24⑩ 的"例行备份失败必须可见"与"成功不发通知"首次具备真断言（此前该面只有代码注释自述）。
- **交给 T-22 CI（未实测）**：真 `pg_dump` 起进程、`findPgDump` 的 `PGDUMP_BIN` / `<dataDir>/pgsql/bin` / PATH 三级回退、连真 PG 出一份非 0 字节的 `.dump`。
- **未做的 pg 侧断言**：`execPgDump` 的默认分支只被"必然 ENOENT 的路径"覆盖过一次；`err.code` 为其他值（如 `EACCES`）走"备份失败"文案这一支，由用例 4 通过注入替身覆盖，真进程面仍未测。
- **并发提示**：`test/release/manifest.spec.ts` 由另一路（T-21c-iii）在改；本轮出口命令跑到 `:release` 项目时该文件为绿，但**该文件的任何红都不是本轮引入**（本轮文件面 = 2 个文件，见 §5 git 取证）。
- **额度**：出口命令 `typecheck && test` 的**全量组合跑 1 次（额度 2 次，剩 1）**；另为定位自己的语法错跑过 `pnpm --filter @tm/server typecheck` 1 次、`pnpm exec tsc --noEmit` 1 次、单文件 `vitest` 2 次（预检，不是出口命令）。lint 侧另跑过 `eslint`（本轮两文件 0 problem）。探针总量 < 25。
