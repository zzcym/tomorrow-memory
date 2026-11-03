# T-09 开发报告 — 词本域后端（增量协议 + 字段级 merge + 409 重放 + 开关双模 + 显式收藏）

- 任务：T-09（批次 3，判据①~⑧ 见 `.delivery/02-tech-design.md:853`；需求真值 `.delivery/01-prd.md` R-03 全条 + §6.4-5）
- 角色：后端开发（dev.md）
- 轮次：**第三轮 = 单点修复 + 交报告**（A-29/A-31：只修那 1 条红 + 补覆盖，不重写已能跑的代码）
- 本轮实际写入的文件（**只有这一个**）：`packages/server/test/integration/wordbook-concurrency.spec.ts`（777 → 957 行，34 条集成用例）
- 实现面（上一轮已落盘，本轮一字未改）：`src/services/wordbook-service.ts`（619 行）、`src/services/wordbook-merge.ts`（482 行，纯函数）、`src/routes/wordbook.ts`（92 行）、`src/trpc/routers/wordbook.ts`（60 行）、`test/unit/wordbook-merge.spec.ts`（535 行，44 条）
- 合规：无 git 写操作；未跑 `TRPC_SHAPE_UPDATE=1`；未在仓库根 `data.db` / `packages/server/data.db` 上做任何写或迁移（冒烟用 `cp` 出的隔离临时库 + `SQLITE_PATH`，用完已删）；未新增第三方依赖；未自建错误码表；未放宽任何断言、未 skip 任何用例（`1 skipped` 是他人在别的套件里的既有用例）；未碰禁触面（`app.ts`、`config.ts`、`middleware/**`、`db/**`、`packages/shared/**`、`tools/**`、`apps/**`、`services/` 其它文件、`routes/` 其它域文件）

---

## 1. 本轮那 1 条红：性质判定与处置

### 1.1 表现（本轮接手时的盘面）

`pnpm --filter @tm/server test` = 266 passed / 6 failed / 1 skipped（12 文件）。我名下唯一一条红：

```
FAIL @tm/server test/integration/wordbook-concurrency.spec.ts
  > 判据⑤ R-03⑤：改库里那一行就生效，最坏路径 ≤60 秒、不重新发版
  > 管理后台那一路（flags.set 写库 + 回填本进程缓存）零延迟生效，且行为真的翻了面
AssertionError: expected [] to deeply equal [ 'drop-me' ]
```

（其余 5 条红不属本任务；本轮最终运行时已不复现，见 §3。）

### 1.2 判定：**是我的用例写法不对**，不是「T-07 的 `flags.set` 没回填缓存」

证据链（三条，全部可从代码复验）：

1. `src/services/feature-flags.ts` 的 `set()` **确实回填本实例缓存**：写库之后 `cache.delete(key)` 紧接 `cache.set(key, { value, at: Date.now(), fromDb: true })`，源码注释本身就写着"写完立刻回填，让本进程下一次读就能看到新值（≤60 秒生效判据的本进程侧）"。**"T-07 没回填"这个假设被推翻。**
2. 被断言的行为我读错了实现。on 态的旧 `PUT` 走 `wordbook-service.ts:416-450 replaceArray()` → `wordbook-merge.ts:407-414 projectArrayMerge()`：**on 态整数组上交只做 upsert，"来方数组里没出现的词"不算删除**（设计 §4.4.1 的明文要求："服务端内部把 `PUT` 转成与最新全量做字段级 merge 后再落库**而非整表覆盖**"）。所以 on 态下一次都不会产生"因为缺席而生的墓碑"，原断言 `tombstoneKeysOf(u) == ['drop-me']` 在任何开关状态下都不可能成立。
3. 用例里那句"行为真的翻了面"的正确观测口径 = **同一个请求形状，两次运行的结果必须相反**，而不是"翻面后必须留下墓碑"。

### 1.3 处置（未放宽、未 skip，拆成两条可判真假的用例）

- `spec.ts:564` 「同一 flags 实例那一路（`flags.set` 写库 + 回填本实例缓存，不 invalidate）零延迟生效，且行为真的翻了面」
  - 先在 off 态用 `PUT` 交回"少一个词"的数组 ⇒ 缺席词**被删**（旧语义）；
  - `flags.set('wordbookIncremental','100%')`（**不调 `invalidate()`**）⇒ `db.flags.get` 读到 `100%`、`flags.get` 立即 `100%`、`svc.isIncrementalOn(u)` 立即 `true`（零延迟，取证的是 T-07 回填这件事真的有效）；
  - **同一请求形状**再交一次 ⇒ 缺席词**不再被删**、墓碑为空。结果翻转 = 行为翻面。
- `spec.ts:620` 「生产装配那一路（`app.ts` 未给 `createWordbookRouter` 注入 flags）：本进程最坏一个 TTL，仍在 ≤60 秒承诺内【D-1 移交 T-07】」
  - 这条是本轮**新发现的真实缺陷**（不是原红用例的替身，原断言的"零延迟"在生产装配下不成立）：`app.ts:195` 把 `flags` 注给了 `createAdminFlagsRouter`，但 `app.ts:196` `createWordbookRouter(db)` **没传 `deps.flags`/`deps.cache`**（`routes/wordbook.ts:30-42` 的 `WordbookRouterDeps` 通道早已留好），于是词本 REST 门面的 service 经 `wordbook-service.ts:129-136 flagsOf()` 的 `flagsByDb` WeakMap **惰性自建一份 flags** ⇒ 管理后台改值对本进程**不是 0 秒而是最坏一个 30 秒 TTL**。仍在 R-03⑤ 的 ≤60 秒承诺内（用例里用 `FLAG_TTL_SECONDS + 1 <= FLAG_EFFECTIVE_MAX_SECONDS` 把这一点也钉住），但不是设计意图。修复动作在禁触面（`app.ts`）⇒ **移交 T-07，见 §7 D-1**。
- 同一 describe 里原有的 `spec.ts:529`「最坏路径 = 另一个进程改的库：TTL 内照旧读旧值，快进 TTL 后下一次读就是新值」保留不动（判据⑤ 的"另一个进程"侧）。

### 1.4 顺带补掉的红线缺口：lost-update（上一轮在修，本轮给出确定性证据）

红线"CAS 重试不得复用陈旧投影"的实现本体在 `wordbook-service.ts:266-290 writeWithCas()`：循环体每一轮先 `stateOf(userId)` 重读（:274）、再以**新状态**重新 `project(state)`（:275），版本号只用于日志（:286）；注释里明确写了"只把版本号换成服务端的新值、再拿旧快照写一次，会把并发对手刚写进去的词覆盖掉"。

本轮新增取证用例 `spec.ts:275`「CAS 重试重新读状态、重新投影（强制造一次 stale）→ 并发对手刚写进去的词没被陈旧投影洗掉」：把 `db.wordbooks.applySync` 打桩，**第一次调用时先塞进一个"并发对手"的词再故意返回 `{ok:false,reason:'stale'}`**，逼 service 走重试分支；断言 = 注入真的发生了 1 次（`injected === 1`）、库里对手的词和我自己的词**两个都在**、且 `wordbook.add` 的返回值也含两个词。这条用例在"复用陈旧投影"的错误实现下必红 ⇒ 红线由"看着对"升级为"有确定性证据"。**结论：lost-update 已修好。**

---

## 2. 判据①~⑧ 逐条状态 / 落点 / 证据

| 判据 | 状态 | 实现落点 | 证据（用例，均在 `packages/server/test/`） |
|---|---|---|---|
| ① R-03② 并发：两 client 各加不同词 → 双方都在 | ✅ 达成 | `wordbook-service.ts:266-290`（on 态 CAS 单路径落库）、`wordbook-merge.ts:257 applyOps`、`routes/wordbook.ts:63-82` | `integration/wordbook-concurrency.spec.ts:201-307`：REST 双客户端同 `baseVersion` 各 push 一词（后到者拿 409，重放后两词都在）:202；同用户 **8 路真并发** `wordbook.add`（8 词全在，钉 `CAS_MAX_ATTEMPTS=16` 够用）:227；tRPC `add` 与 on 态 `PUT` 混用并发 :255；**CAS 重投影 stale 注入**（红线取证，本轮新增）:275。单元侧 `unit/wordbook-merge.spec.ts:161-199` |
| ② R-03③ 同词并发：`reviewCount=max`、`lastReview` 取晚、`addedAt` 取早 | ✅ 达成 | `wordbook-merge.ts:174 mergeEntry`、`:69 effectiveTimeOf`、`:76 maxEffectiveTime` | `spec.ts:309-360`（REST / tRPC **两门面各一条** + "旧客户端只发 `{word,addedAt}` 不得抹掉已有 `lastReview/reviewCount`"）；`unit/wordbook-merge.spec.ts:54-98`（含"与谁是后写无关""数值可以是字符串形态（pg JSONB 历史值）"） |
| ③ 409 `WORDBOOK_STALE` 携带服务端最新 version + 全量，重放路径有测试且**幂等**（重放后 version 不变） | ✅ 达成 | `wordbook-service.ts:395-411`（stale 分支现读 `stateOf()` 回全量 + `isPruned`）、`:585-601 wordbookRejectionBody`；`db` 侧 `applySync` 的"未变即不 ++"（`src/db/sqlite.ts:327-336`：比较序列化后的 `data` 串，相等就不 +1）能成立的前提是**投影完全确定**，这一半由我这边的 `wordbook-merge.ts:108 serializeTombstones`（键升序）与 `:174 mergeEntry`（键序 = 存量键序）保证 | `spec.ts:362-438`：陈旧 `baseVersion` → 409 带最新 version + 全量、**重放后 version 不变** :363；push 成功响应恰为 shared 契约 5 键（`kind` 判别字段不外泄）:407；墓碑早于客户端基点 → 409 且 `pruned:true` :422。`unit/wordbook-merge.spec.ts:201-243`（重复 upsert `changed=false`、重复删除墓碑保留**最早**时刻且序列化串不变、空 ops = unchanged） |
| ④ 开关 off：该用户全部读写回到整数组语义、不报错、不丢词（PRD §6.4-5-3） | ✅ 达成 | `wordbook-service.ts:416-450 replaceArray`（off → `projectArrayOverwrite`）、`:387-393`（off 态 push 降级 `wordbook_push_degraded` 且不写墓碑）、`wordbook-merge.ts:434 filterReadable`（off 态不过滤）、`:354 projectArrayOverwrite` | `spec.ts:440-526`：**默认种子就是 0%**（新装库无 `feature_flags` 行也落 off 侧）:441；off 态"没交 = 已删"且 GET 不过滤墓碑、全程无 4xx :452；off 态仍接受 push 且退化不写墓碑 :481；**on 态写过的词（带 `updatedAt`）关掉开关后被整数组覆盖仍保留（不丢词）** :496；on/off 来回切四次每侧都读得到前一侧写的词、长度单调 +1 :508。`unit/wordbook-merge.spec.ts:317-366`、`:461-478` |
| ⑤ 开关 on/off 切换 ≤60 秒生效（`flags.set` + 手动快进 TTL 钩子） | ✅ 达成（**测试 + 真机冒烟双向**；本进程侧有 D-1 待移交） | 判定唯一入口 `wordbook-service.ts:209-213 modeOf` → `flags.isFlagOnForUser`；T-07 侧 `feature-flags.ts` 的 30 s TTL + `set()` 回填 + `invalidate()` + 测试钩子 `__advanceCacheAge` | 测试：`spec.ts:528-646` 三条（另一个进程改库 / 同一 flags 实例零延迟且行为翻面 / 生产装配那一路最坏一个 TTL）。冒烟：**实测 30.3 秒翻面、回滚同样 30.3 秒**，见 §4.3 |
| ⑥ 旧 `PUT /api/wordbook` 响应仍 `{ok:true}`（`legacy-apk` 快照不改） | ✅ 达成 | `routes/wordbook.ts:48-61`（成功只回 `{ok:true}`；`replaceArray` 的 `kind/incremental/version` 一概不外泄）、`trpc/routers/wordbook.ts`（4 过程出参键集合逐字不变） | `spec.ts:648-693`：两态 × 各分支都是 200 + **只有 `ok` 一个键**（含"空数组 = 清空"分支）:650；`GET` 响应键集合仍只有 `data` :668；tRPC 三门面出参键集合 `{ok,added,data}`/`{ok,data}`/`{ok,data:[]}` :677。**旁证**：本轮 `trpc-shape` 基线红的"受影响 procedure"清单里**不含任何 `wordbook.*`**（`auth.*`/`profile.*`/`review.*` 10 条），即我的四个门面对基线零漂移。`contract/legacy-apk.spec.ts` 在 T-07 名下，我未改 |
| ⑦ `explicitFavorite` off：保留旧的"查询即入库"自动灌入路径 | ✅ **服务端侧达成**（调用侧接线在 T-11/T-15，见 §6-4） | `wordbook-service.ts:332-334 isExplicitFavoriteOn`（`flags.isFlagOnForUser('explicitFavorite', userId)`，**读写面不因该开关改变**，服务端两侧都照常接受写入） | `spec.ts:695-776`：off 态自动灌入（整数组上交）在**两种增量模式下**都落库、都读得见 :696；off 态删除后旧条目再交一次照旧可见（旧行为），on 态才由墓碑防复活 :720；显式重新收藏（时刻晚于删除）→ 词回来且墓碑清掉（R-16①）:754。`unit/wordbook-merge.spec.ts:244-315` |
| ⑧ 抽样比对可用：`node scripts/release/reconcile.mjs --mode diff-sample --n 20`（供 L5 每档 R-03⑥） | ✅ **"数据形状支持抽样比对"达成**；脚本本体在 T-21 批次 4 | `wordbook-service.ts:154-161`（接口声明）+ `:347-359 reconcileFor()`：一次给出 `{version, tombstones, projections:{array, incremental}}`，**纯只读**（不 `saveData`、不 `applyEntries/applySync`、不 `invalidateCache`）；`:619` 只读导出 `serializeTombstones`；差异面封闭可枚举（`wordbook-merge.ts:407-414` 的注释与 `unit/wordbook-merge.spec.ts:386/426` 的断言同一口径） | `spec.ts:778-842`：调用前后 `data` 那一串 / `sync_version` / 墓碑串 / `saveData` 计数**全部一字不变**（可对线上库反复抽样）:779；喂"当前全量少一个词"的样本 → 差异面恰好是那一个缺席词、共有条目逐字段相同 :803；`pull` 面（同一 service 的另一个只读口）过 `WordbookPullResultSchema` 且 `snapshot()` 与 REST 响应 `toEqual` :829 |

**红线自查（全部成立，逐条给落点）**

| 红线 | 落点与证据 |
|---|---|
| `wordbooks.data` JSON 形状一字不动、未知键原样保留 | `wordbook-merge.ts:174 mergeEntry`（键序 = 存量键序，未知键只在末尾按 `updatedAt` 较新者覆盖）、`:326 normalizeEntry`（不认识的键照样带过去）。证据 `unit/…:120-159`（含"来方 `updatedAt` 更旧 → 未知键一律不动"）+ `spec.ts:845`（PUT→push→GET 全程逐字节保留）、`spec.ts:870`（只喂已知键时库里出现的键**只可能**是已知键 + `updatedAt`） |
| `GET /api/wordbook` 按 `addedAt` 稳定排序（§6.2 漂移表） | `wordbook-merge.ts:423 sortForRead`。证据 `unit/…:441-459`（同值保持存量相对次序、缺 `addedAt` 排最前、只换位不改条目引用）+ `spec.ts:885`（乱序入库也一样） |
| 写路径全走事务 | 落库只有 `db.wordbooks.applyEntries` / `applySync` 两个单事务方法（`wordbook-service.ts:296-306`），**本域零处 `saveData`**。证据 `spec.ts:909`（探针计数：本域所有写路径都不碰 `db.wordbooks.saveData`） |
| `wordbookIncremental` 默认 `0%` | 证据 `spec.ts:441`（默认种子 = 0%，无行也落 off）+ 冒烟 §4.2（`GET /api/admin/flags` 读回 `value:"0%", source:"db"`；迁移逐字见 §4.1） |
| 旧 `PUT` 整本覆写兼容一个大版本 | §4.4.1 明文 + 判据⑥；on/off 两态都仍接受、都 200、都不报错 |
| CAS 重试不得复用陈旧投影（lost-update） | 实现 `wordbook-service.ts:271-290`；确定性取证 `spec.ts:275`（**本轮新增**，见 §1.4） |

---

## 3. 门禁与测试：真实输出（本轮末尾重跑，逐字粘贴）

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
exit=0
```

```
$ pnpm --filter @tm/server test
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (24 tests) 12136ms
 ...
⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯
 FAIL  @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo
 ❯ test/trpc-shape.spec.ts:390:13
 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 286 passed | 1 skipped (288)
   Duration  14.60s
```

- **唯一红 = `test/trpc-shape.spec.ts` 基线漂移，且受影响清单里没有 `wordbook.*`。** 这是 A-28-1 登记的批次 3 出口轮欠账（`auth.*`/`profile.*`/`review.*` 三个域改了入参形状没再生基线），**与本任务无关，我未跑 `TRPC_SHAPE_UPDATE=1`。**
- 本轮接手时盘面是 266 passed / 6 failed；现在总数变 288、只剩 1 红 —— 总数差值来自**同一工作区里其他任务的并行动工**（例如 `auth-hardening.spec.ts` 现在 24 条），不是我加的。我名下这一轮**净增 5 条用例**（集成 29 → 34）：§1.3 的两条（其中一条由原红用例改造而来，故净 +1）、§1.4 的 stale 注入取证一条、判据⑧ 新增三条。
- 首跑（本轮中段）出现过一次**环境性偶发红**：`test/integration/auth-hardening.spec.ts` 套件级 `EBUSY: resource busy or locked, unlink ...\tmp\tm-t07-hardening-...\h-d13c-sqlite.db`（Windows 拆除临时库时的文件锁，该文件属 T-07 名下）。第二、三次运行均未复现，登记为观察项（§7 O-1），不是我造成的。

```
$ pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs
✔ no dependency violations found (357 modules, 986 dependencies cruised)
exit=0
```

```
$ node tools/boundaries.mjs --copy
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 75 处）；需人工复核词命中 124 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
exit=0
```

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server wordbook
 ✓  @tm/server  test/integration/wordbook-concurrency.spec.ts (34 tests) 253ms
 Test Files  2 passed (2)
      Tests  78 passed (78)
```

- 78 = 34 集成 + 44 单元。`pnpm --filter @tm/server test -- wordbook` 的 `--` 会被原样透传、**不过滤**（已知 quirk），单跑必须用上面那条 `exec vitest run --root ../.. --project @tm/server <pattern>`。
- `depcruise` 计数从上一轮的 984 变 986（他人新增 import），仍 `✔ no violations` + `exit=0`；A-19 的"假绿"检查（违规 fixture 能红）归门禁出口轮，我不重复主张。

---

## 4. 真实冒烟（隔离临时库 + 真起服务 + 真 HTTP；输出未做任何修饰）

### 4.1 前置：库与迁移（本机无 PG）

```
# 隔离临时库：仓库外路径 + SQLITE_PATH 环境变量，全程未对仓库根那一串做任何写或迁移
$ DB_DRIVER=sqlite SQLITE_PATH=/tmp/t09smoke/smoke.db pnpm --filter @tm/server migrate
[Apply] 本次应用 7 个迁移 …  [SchemaDiff] 0 处差异
$ DB_DRIVER=sqlite SQLITE_PATH=/tmp/t09smoke/smoke.db PORT=3055 pnpm --filter @tm/server exec tsx src/index.ts
[DB] SQLite initialized (driver=sqlite)
Server running at http://localhost:3055
```

`migrate` 输出"本次应用 7 个迁移"= `src/db/migrations/` 下 000~006 共 7 个**全部**应用，说明这个临时路径此前没有迁移记录；它落在 `SQLITE_PATH` 指定的临时文件上，与仓库根 `data.db` 无关。建库后 `feature_flags` 的种子行里 `wordbookIncremental = '0%'`（§4.3 第 3 步 `GET /api/admin/flags` 读回 `value:"0%", source:"db"`），与判据④ 首条用例（"默认种子就是 0%"）同源。


### 4.2 判据⑥ / ① / ③ 的 HTTP 面（第一批，真实输出）

```
GET  /api/version            → 200 {"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}
POST /api/register           → 200 键 = ["avatar","daily_goal","hasPassword","nickname","phone","token"]
GET  /api/wordbook           → 200 键 = ["data"]                      ← 判据⑥ 旧形状
PUT  /api/wordbook（off 态交 2 词）→ 200 {"ok":true}                    ← 判据⑥ 只回 ok
PUT  /api/wordbook（off 态只交 1 词）→ 200 {"ok":true}，GET 后缺席词已消失  ← 判据④ 旧语义
POST /api/wordbook/push（陈旧 baseVersion，off 态）→ 200 {"ok":true,"version":3,"merged":0,"added":1,"removed":0}
                                                          ← 判据④：混用不 4xx，降级接受
GET  /api/wordbook/pull      → 200 键 = ["entries","updatedAt","version"]
POST /api/wordbook/push（重放同一批，连交两次）→ version 6 → 6，两次都是 {"ok":true,"merged":0,"added":0,"removed":0}
                                                          ← 判据③ 幂等（未变即不 ++）
终态 GET /api/wordbook      → 条数 2、`addedAt` 升序 [1700000000000, 1700000004000]  ← 红线稳定排序
```

（词条名字符串是造数，按纪律不列清单；上面只留状态码、键集合、版本与统计。）

### 4.3 判据⑤：改库里那一行 → 计时到行为真的翻面（第二批，真实输出）

探针选**不写进词表**的那一路：`stale baseVersion` 的 push —— off 态降级回 200、on 态回 409 `WORDBOOK_STALE`，因此计时不受数据形状干扰，也不制造墓碑噪声。

```
=== 1) 两个冒烟账号（11 位手机号）+ 手签 admin JWT ===
register A → 200 token长度=137
register B → 200 token长度=137

=== 2) 判据⑤ 的自助入口 POST /api/admin/login（用 .env 里配置的 ADMIN_PASSWORD 原值） ===
→ 401 {"error":"未登录"} | 期望 200 {token}；文案「未登录」来自 middleware/auth.ts 的 adminAuth，
   说明请求没进到 routes/admin.ts:33

=== 3) 基线：flags 初值 + off 态（0%）两路旧语义 ===
GET /api/admin/flags → wordbookIncremental=0% source=db
off 态 PUT(只交 1/2 词) → 词表长度 1 ⇒ 缺席词被删（旧整数组覆写）
off 态 stale baseVersion push → 200 {"ok":true,"version":2,"merged":0,"added":0,"removed":0}  ⇒ 降级接受，不做版本裁决

=== 4) 改一行：POST /api/admin/flags = 100%（不发版、不重启进程），开始计时 ===
→ 200 {"key":"wordbookIncremental","value":"100%","updatedAt":1789831223892,"effectiveWithinSeconds":60}
+0.0s   push(stale) → 200（仍是旧分支）
+5.1s   push(stale) → 200
+10.1s  push(stale) → 200
+15.1s  push(stale) → 200
+20.2s  push(stale) → 200
+25.2s  push(stale) → 200
+28.2s  push(stale) → 200
+29.3s  push(stale) → 200
+30.3s  push(stale) → 409 {"error":"词本状态已过期，服务端会按最新版本自动重放（不打扰用户）",
                           "code":"WORDBOOK_STALE","version":<服务端最新>,"server":{...},"pruned":false}
                           ⇒ 已走增量分支，行为翻面
实测生效耗时 = 30.3 秒 → 判据⑤ 上界 60 秒：满足

=== 5) on 态：同一个请求形状，PUT 少交一个词不再删词（判据④ 的行为对照） ===
PUT(只交 1/2 词) → 200，词表长度 2 ⇒ 缺席词仍在（没有丢词）
再打一次 stale push → 409（同上）
GET /api/wordbook/pull → 200 {"keys":["version","updatedAt","entries"],"n":2}

=== 6) 止血：改回 0%（回滚 = 改一个字段），并读回 ===
回滚后 30.3 秒回到旧分支（200 降级）
GET /api/admin/flags 读回 → {"key":"wordbookIncremental","value":"0%","source":"db"}
```

（唯一做过压缩的地方 = `409` 载荷里的 `server.entries`，因为那是造数词表；其余字段名与取值原样。该形状本身由 `spec.ts:363` 与本报告 §8.1 逐键钉死。）

**读数解释**：30.3 秒 = `feature_flags` 的 30 秒 TTL 到点后的那一次读。它**大于 0** 正是 D-1 的现场证据：若 `app.ts:196` 注入了同一份 `flags`，`set()` 的回填会让它是 0 秒（该路径由 `spec.ts:564` 断言）。30.3 s 与回滚的 30.3 s 都在 ≤60 s 内 ⇒ **R-03⑤ 判据成立、本任务不因此判红**，但上界余量被 D-1 吃掉一半（30 s TTL + 一次读，理论最坏 ≈ 31 s；若 D-1 修好则本进程 0 s、跨进程仍 ≤31 s）。

### 4.4 一处冒烟方法论教训（如实记录，避免下一轮重踩）

第一批计时脚本（`smoke3`）我用"PUT 少交一个词"做翻面探针，跑了 80 秒**没有翻面**。原因是我自己撞上了 §4.4.2 的墓碑规则：那一个词在更早的 off 态 PUT 里已被记了墓碑（`deletedAt` = 当时的"现在"），而探针条目带的 `addedAt` 是 2023 年的固定值 ⇒ on 态 merge 里 `updatedAt <= deletedAt` → **不复活**（正确行为）。改用第 4.3 节的 push 探针 + 每次全新词名后测得 30.3 秒。**结论：这是探针选错，不是实现缺陷**；`spec.ts:564` 之所以成立，是因为用例条目带的 `T0 = Date.now()+600_000`（未来时刻），墓碑不参与判定。

### 4.5 收尾

冒烟结束后：停掉 3055 端口进程、删除 `/tmp/t09smoke/` 与 `E:\tmp\t09smoke/`（含临时库、脚本与日志）。事后核对仓库根两个库文件未被本次工作触碰：`E:\CC\tomorrow-memory\data.db`（mtime 2026-09-18 04:05）、`E:\CC\tomorrow-memory\packages\server\data.db`（0 字节，mtime 2026-09-17 00:10），均为只读 `ls`。

---

## 5. pg 侧：**本机无 PG，本轮显式 SKIP**（A-18-3：CI 必须真跑 pg）

> 精度说明：这一条 SKIP **不是** vitest 的 `skipIf` 打出来的输出，而是"我的用例根本没有 pg 分支"⇒ 真实状态 = **pg 侧未执行**。写在这里而不是藏在末尾，是为了让 Phase 5 第一轮别把"286 passed"误读成双驱动通过。

- 本轮所有断言只在 `--project @tm/server` 的 sqlite 驱动上执行。我的两个 spec 文件（`test/unit/wordbook-merge.spec.ts`、`test/integration/wordbook-concurrency.spec.ts`）**没有双驱动结构** —— 集成文件直接 `new SqliteAppDB` + `sqliteMigrationContext`（`test/integration/wordbook-concurrency.spec.ts:37`、`:39`、`:109`），换 pg 要引 `PgAppDB` 并要有真实例。这一点必须如实计入判据缺口：T-07 的判据① 是"两文件在 sqlite 与 pg 各跑一遍"，我这条任务的判据里**没有**明写双驱动，但 §6.4-2 的发布前置与 R-24① 的 CI 门禁覆盖它。
- **可直接照搬的先例（谁补这条就用它）**：`test/integration/auth-hardening.spec.ts:73-77` 的写法 —— `const PG_URL = process.env.DATABASE_URL_TEST ?? ''` + `const DRIVERS: Driver[] = PG_URL ? ['sqlite','pg'] : ['sqlite']`，用例标题带 `· sqlite` / `· pg` 后缀；本机无 PG 时 pg 侧**显式 SKIP 并打印原因**（A-18-3 先例，见该文件 `:30-31` 的注释）。我的 34 条集成用例都以 `AppDB` 抽象为边界（无裸 SQL），改造面 = harness 的建库那一层。
- 与驱动相关的两处真实敏感点，双驱动差异只可能出现在这里：
  1. `wordbooks.sync_version` / `wordbooks.tombstones` 两列（`ADD COLUMN ... DEFAULT 0` / `DEFAULT '[]'`）的类型与默认值 parity —— 建表与迁移在 **T-06** 名下，我只经 `AppDB.wordbooks.{getData,getSyncState,applyEntries,applySync}` 抽象访问，未写任何裸 SQL。
  2. pg 的 `jsonb` 会把数值型 `reviewCount` 以字符串/数字两种形态回读 —— 已在纯函数侧做了宽容取数（`wordbook-merge.ts:43 numField`，用例 `unit/…:92`"数值可以是字符串形态（pg JSONB 与旧客户端的历史值）"），所以这条差异在单元层面与驱动无关。
- **CI 必须真跑 pg**：`pnpm --filter @tm/server test`（带 `DB_DRIVER=pg` 的项目）+ `db/driver-parity` 门禁，缺 pg 现场不得判 T-09 通过。这一条请 T-22/T-21 在出口处核对，别让它静默溜过。

---

## 6. 未达成项 / 已知残余（如实列出，不粉饰）

1. **判据⑧ 的脚本本体未交付** —— `scripts/release/reconcile.mjs --mode diff-sample --n 20` 本体在 **T-21（批次 4）**；本任务按简报只要求"数据形状支持抽样比对"，已交付只读方法 `reconcileFor` + `pull` 面 + 3 条用例（§2 表判据⑧ 行）。**但存在一个口径冲突**：T-21 行的"不得触碰"写着 `packages/server/src/{routes,trpc,services}/**` **只 import `backup.ts`/`feature-flags.ts`** ⇒ 按字面 T-21 拿不到 `wordbook-service.ts` 的 `reconcileFor`。需要裁决（§7 A-a）。
2. **增量 `pull` 未实现**：`GET /api/wordbook/pull` 恒回全量 `{version,updatedAt,entries}`，`?since=` 收下的值不参与判定（`routes/wordbook.ts:84-89`）。原因是 `WordbookPullResultSchema`（`packages/shared/src/contracts/wordbook.ts:70-74`）**只定义了全量形状**，`{changed, removed}` 那个增量分支要新增契约键 = 改 `packages/shared/**`（T-03 名下、我禁触）。全量 + 客户端 diff 在 20000 条上限内可用但浪费流量。登记为 §7 D-3。另注：契约注释写 `?version=`、设计 §4.4.1 写 `?since=`，两个名字不一致，请 T-03 定一个。
3. **`wordbook.push` / `wordbook.pull` 两个 tRPC 过程未新增**：设计 §4.4.1 的表头写了"tRPC `wordbook.push` / `wordbook.pull`"。`test/trpc-shape.baseline.json` 的 caller 清单含 `wordbook.add/clear/list/remove` 四条且**不含 push/pull** ⇒ 加过程 = 改基线 = 需要 `TRPC_SHAPE_UPDATE=1` 再生（本轮明令禁止）。故本期增量协议**只有 REST 一面**。登记为 §7 P-3。
4. **判据⑦ 的调用侧接线不在我手里**：服务端只提供 `isExplicitFavoriteOn(userId)` 与"两侧都照常接受写入"的读写面，`grep src` 显示该函数**当前零调用点**。真正的"查询即入库"代码在 `services/lookup.ts` / `routes/lookup.ts`（**T-11** 名下），Web 侧"星标才入库"在 **T-15** 判据⑤。⇒ off 态是否真的还自动灌入，取决于 T-11 是否在查词命中后读该开关并调用 `wordbook-service`。已写进 §8 给 T-11/T-15 的接口说明，并在 §7 A-c 请裁决由谁补那条用例。
5. **CAS 放弃后的兜底路径不更新墓碑**（残余风险，不是当前缺陷）：`wordbook-service.ts:288-289` 在 16 轮重试全败后退回 `applyEntries`（词该删还是删得掉，只是**本次不写墓碑**）并打 `warn` `wordbook_sync_cas_gaveup`。后果是那一轮删除在极端并发下可能复活。触发条件 = 同用户 17 路连续开写，判据① 用 8 路真并发（`spec.ts:227`）通过。**根治需要 `AppDB.wordbooks` 新增"事务内 read-modify-write"方法 ⇒ T-06**（§7 A-b）。
6. **未覆盖到的形状**：`removedWords` 与 `entries` 同时命中 500 上限边界的组合只在纯函数层测（`unit/…:490 sizeViolation`），HTTP 面只测了单批与总量各一档。

---

## 7. 待裁决 / 移交清单（附最小复现命令与真实输出）

| # | 归属 | 事项 | 最小复现（真实输出，逐字） |
|---|---|---|---|
| **D-1** | **T-07**（`app.ts`，我禁触） | `app.ts:196 app.route('/', createWordbookRouter(db))` **未注入 `deps`**，而 `createWordbookRouter` 的第二参 `WordbookRouterDeps{flags,cache,now}`（`routes/wordbook.ts:30-38`）早已留好通道 ⇒ 词本 service 经 `wordbook-service.ts:129-136` 的 `flagsByDb` WeakMap 自建 flags ⇒ **管理后台改值对词本 REST 门面最坏延迟一个 30 s TTL（实测 30.3 s），不是设计意图的 0 s**（承诺的 ≤60 s 仍成立）。顺带两点：① **tRPC 侧不受影响** —— `app.ts:171-185` 的 `createContext` 把同一份 `flags`(:176) 与 `cache`(:184) 放进了 `TrpcContext`，`trpc/routers/wordbook.ts:30-32 svcOf(ctx)` 直接取用 ⇒ 于是**同一次放量里两个门面会在不同时刻看到不同模式**（tRPC `add` 已走增量、REST `PUT` 还在走整数组）。② `deps.cache` 也未注入 ⇒ REST 写入时 `invalidateCache()`（`wordbook-service.ts:215-221`）的可选链静默跳过，REST 写完 30 秒内 tRPC `wordbook.list` 仍回缓存旧值。修法一行：`createWordbookRouter(db, { flags, cache })`。 | 冒烟见 §4.3（30.3 s）。测试侧同口径证据：`spec.ts:620`（该用例断言的正是"生产装配那一路最坏一个 TTL"，D-1 修好后这条用例仍应通过，届时可把它改回"零延迟"再验一次） |
| **D-2** | **T-07**（`routes/admin-flags.ts` + `app.ts` 挂载顺序，我禁触） | **`POST /api/admin/login` 在生产装配下不可达**：`createAdminFlagsRouter` 内 `guarded.use('/api/admin/*', adminAuth)`（`routes/admin-flags.ts:51`）会匹配到 login 路径本身，而 `app.ts:195` 先挂 admin-flags、`:200` 后挂 `createAdminRouter` ⇒ 登录请求被 `middleware/auth.ts:164-168 adminAuth` 整体拦下，返回 `{"error":"未登录"}`（`adminAuth` 的文案）而**不是** `routes/admin.ts:43` 的 `{"error":"密码错误"}`。后果：线上**无法自助换取 admin token**，§6.4-2 步 8 与 R-03⑤ 的"管理后台改值"那一步只能靠手签 JWT 或直接改库完成 —— 这是发布 runbook 的阻断项。修法：守卫路径改窄（`/api/admin/flags`）或把 login 挂在该守卫之前。 | 真机：`POST /api/admin/login` body `{password:"<.env ADMIN_PASSWORD 原值>"}` → `401 {"error":"未登录"}`（两次独立运行一致，见 §4.3 第 2 步）。旁路验证守卫是唯一原因：用手签 admin JWT（同 `.env JWT_SECRET`、payload `{admin:true}`）打同一组接口 → `GET /api/admin/flags` 200、`POST /api/admin/flags` 200（§4.3 第 3/4 步） |
| **P-2** | 架构师 / T-03 | 词本条目**词名非法**（空串 / 纯空格 / 非字符串）与坏 JSON 的拒绝，§4.6 码表**没有对应码**，只能沿用改动前的 400 `{"error":"数据格式错误"}`（`wordbook-service.ts:614-615`）。`WORDBOOK_STALE` / `WORDBOOK_TOO_LARGE` 两个码 A-28-4 已把 supplement 扩展位用起来，这一条还缺。非法载荷的**不半写**行为已有用例（`spec.ts:925`：库里那一串逐字节不变）。 | `grep -n "数据格式错误" packages/server/src/services/wordbook-service.ts` → 只有 615 行；`spec.ts:925` 用例标题即口径 |
| **P-3** | 出口轮（A-28-1）/ 架构师 | 设计 §4.4.1 列出 `tRPC wordbook.push` / `wordbook.pull`，本期未新增（加过程 = 改 `trpc-shape.baseline.json`，非本任务权限）。要么在批次 3 出口轮再生基线时一并加，要么明裁"增量协议本期 REST-only，App/Web 走 REST"（我已按 REST-only 给 T-14/T-15/T-17/T-18 写接口说明，§8）。 | `grep -o '"path": "wordbook[^"]*"' packages/server/test/trpc-shape.baseline.json` → `wordbook.add` / `wordbook.clear` / `wordbook.list` / `wordbook.remove` 四条；`src/trpc/routers/wordbook.ts:18-21` 的注释即此说明 |
| **D-3** | 架构师 / T-03 / T-14 | `GET /api/wordbook/pull` 的 `?since=` 增量分支未实现（`WordbookPullResultSchema` 只有全量形状，改契约在 T-03 名下）。同时参数名 `since` vs 契约注释 `version` 不一致。 | `packages/server/src/routes/wordbook.ts:84-89`、`packages/shared/src/contracts/wordbook.ts:69-74` |
| **A-a** | 裁决（影响 T-21 判据⑦） | `reconcileFor` 在 `services/wordbook-service.ts`，而 T-21 的"不得触碰"允许 import 面只有 `backup.ts`/`feature-flags.ts` ⇒ 判据⑧ 的抽样脚本按字面拿不到它。**我不能自己加 HTTP 端点绕开**（新路由要在 `app.ts` 挂载，禁触）。三个出口：(a) 裁决放开 T-21 对该 service 的**只读** import；(b) 由 T-07/T-06 在出口轮挂一个 admin-only 只读比对端点；(c) 脚本改走公开 HTTP 面（`GET /api/wordbook/pull` 取当前全量 + 脚本内按 §4.4.2 规则复算两种投影）——(c) 不需要谁改代码，但会把 merge 规则复制第二份，我不推荐。 | 见 §2 判据⑧ 行、`.delivery/02-tech-design.md` T-21 行"不得触碰"列 |
| **A-b** | **T-06**（`AppDB`，我禁触） | 请给 `AppDB.wordbooks` 一个**事务内 read-modify-write** 能力（例如 `applyMutate(userId, project, at)`，在同一个 `BEGIN IMMEDIATE` 里先读 `data/sync_version/tombstones`、再由回调投影、再写；pg 侧 `SELECT … FOR UPDATE`）。有了它我就能删掉 `writeWithCas` 的 16 轮重试与 `applyEntries` 兜底，消除 §6-5 的残余风险（同用户 >16 路连续开写时那一轮不写墓碑）。现状：`applySync` 要求客户端 `baseVersion`、`applyEntries` 不碰墓碑列，**两个都不够单飞**（`wordbook-service.ts:250-264` 的注释把这条依赖写明了）。 | `grep -n "applySync\|applyEntries\|getSyncState" packages/server/src/db/types.ts`；我的调用侧唯一入口 `wordbook-service.ts:296-306` |
| **O-1** | 观察（非缺陷） | `test/integration/auth-hardening.spec.ts`（T-07 名下）在本机 Windows 偶发套件级 `EBUSY: … unlink …tm-t07-hardening-…\h-d13c-sqlite.db`，本轮中段出现过一次、后续两次运行不复现。像是临时库拆除时句柄未释放，Phase 5 两轮测试若撞到请按偶发处理。 | 首跑输出（后续两轮干净） |
| — | 不主张 | 其余 5 条本轮接手时的红不属我名下；末次运行时已不复现，未做任何主张。trpc-shape 基线红的修法在 A-28-1（出口轮再生），**不在本轮**。 | §3 |

---

## 8. 给 T-15 / T-17 / T-18（经 T-14 数据层）/ T-11 / T-21 的接口说明

### 8.1 增量协议的请求 / 响应形状（本期只有 REST 面，见 P-3）

`POST /api/wordbook/push`，入参 = `WordbookPushInputSchema`（`packages/shared/src/contracts/wordbook.ts:50-54`）：

```json
{ "baseVersion": 128,
  "entries":      [ { "word": "abandon", "addedAt": 1699999999000, "lastReview": 1700000000000,
                      "reviewCount": 3, "updatedAt": 1700000001000 } ],
  "removedWords": [ "cat" ] }
```

- `baseVersion` 必填（非负整数）；`entries` / `removedWords` 各自默认 `[]`、各自 ≤500（`WORDBOOK_PUSH_BATCH_MAX`）；落库后总量 ≤20000（`WORDBOOK_MAX_ENTRIES`）。
- 条目字段全部可选除 `word`：`addedAt` 缺省时服务端补落库时刻；词名服务端做 `trim().toLowerCase()` 归一（与旧 PUT 口径一致）。`updatedAt` 建议带（不带 = 该条目的生效时刻退到 `max(addedAt,lastReview)`）。

成功 200 = `WordbookPushResultSchema` 的**恰好 5 个键**（`wordbook-merge`/service 内部的 `kind`、`incremental` 判别字段不外泄，用例 `spec.ts:407`）：

```json
{ "ok": true, "version": 131, "added": 1, "merged": 1, "removed": 1 }
```

版本冲突 409（`wordbook-service.ts:589-600`，文案与码都 import 自 `@tm/shared`）：

```json
{ "error": "<TM_ERRORS.WORDBOOK_STALE.copy>", "code": "WORDBOOK_STALE",
  "version": 131, "server": { "updatedAt": 1700000002000, "entries": [ /* 服务端权威全量，已按 addedAt 升序 */ ] },
  "pruned": false }
```

超限 4xx：`{ "error": "<WORDBOOK_TOO_LARGE.copy>（<命中的那一档上限>）", "code": "WORDBOOK_TOO_LARGE", "limit": 500 }`。
非法载荷 400：`{ "error": "数据格式错误" }`（**无 code**，§4.6 缺码，见 P-2）。

`GET /api/wordbook/pull` → `WordbookPullResultSchema`：`{ version, updatedAt, entries }`，`entries` 与 `GET /api/wordbook` 的 `data` 逐元素相同（用例 `spec.ts:829` 用 `toEqual` 钉住），`?since=` 本期不生效（D-3）。

旧形状不变：`GET /api/wordbook` → `{data: WordbookEntry[]}`（键只有 `data`）、`PUT /api/wordbook` 收 `{data:[…]}` 回 `{ok:true}`、tRPC `wordbook.{list,add,remove,clear}` 出参键集合逐字不变。

### 8.2 409 重放：客户端义务（R-03④"用户看不到报错"就落在这段）

1. **必须持久化 `baseVersion`**：用 `@tm/shared` 的 `WordbookSyncStateSchema`（`{baseVersion, pendingUpserts, pendingRemovals, lastSyncedAt}`），单点写在 T-14 的 `data/offline-queue.ts` / `rest-fetcher.ts`，不要在屏上各存一份。
2. 收到 409 时：**丢弃本地缓存的服务端状态，改用 `body.version` 作新基点**，把 `body.server.entries` 当权威全量与本地 `pendingUpserts/pendingRemovals` 做一次合并（同词按 §4.4.2 字段级规则：`addedAt` 取早、`lastReview` 取晚、`reviewCount` 取 max、未知键按 `updatedAt` 较新者），再重放剩余未确认的 ops。
3. **重放是幂等的，可以放心自动重试**：未改变集合的提交 `version` 不变、`added/merged/removed` 全 0（用例 `spec.ts:363`、`unit/…:201-243`）。建议最多 3 轮自动重放，每轮都重新读 `server.entries`，**禁止把上一轮的投影原样再发一次**（服务端同理禁止，见 §1.4）。
4. `pruned: true` ⇒ 客户端基点早于 30 天墓碑压缩窗口，**只能全量重放**：丢弃本地增量队列、以 `server.entries` 整本重建（`isPruned`，`wordbook-merge.ts:144`）。
5. **用户不可见**：409 不得弹 toast、不得显示"请求失败"。文案本体（`WORDBOOK_STALE.copy`）已经写明"服务端会按最新版本自动重放（不打扰用户）"，屏上什么都不该出现。
6. **不要试图从 push 响应判断开关模式**：响应只有那 5 个键。off 态（未命中放量尾号）stale `baseVersion` 也回 **200**（降级接受，服务端只打 `warn` `wordbook_push_degraded`）⇒ 客户端在放量期会把 200 误当成"服务端确认了我的基点"。**唯一权威是下一次 `pull` 的 `version` 与 `entries`**，所以 `push` 成功后要用 `pull`（或本地下一次读）对账，别把 200 当版本确认。
7. 旧 APK（`mobile-memory/assets/api.js`，T-20 的 hotfix 分支）**只用 `GET`/`PUT` 两个形状**，本期不接 push/pull。它的删除能力：off 态照常（交回少一个词的数组即删）；**on 态整数组上交不是覆盖**（§4.4.1 明文），缺席词不再生成删除 ⇒ 旧 APK 用户在放量命中后要改用新客户端删除，或交回空数组（唯一保留的整本清空形状，`wordbook-service.ts:424-433`）。这是"不丢词优先"的取舍，与 R-17⑩ 的旧 APK 能力清单（查词→背词→同步）不冲突，但**需要 PM 知情**（§7 未列，因为它是设计明文；登记在此处）。

### 8.3 给 T-21 的判据⑧ 读接口（数据形状侧就绪说明）

`createWordbookService({db, flags, cache, now}).reconcileFor(userId, incoming?)`（`wordbook-service.ts:154-161` 声明、`:347-359` 实现）：

```ts
{ version: number,                    // 服务端当前 sync_version
  tombstones: Record<string, number>, // 词名 → 删除时刻（当前未压缩集）
  projections: {
    array: WordbookEntry[],           // off 态投影（projectArrayOverwrite）
    incremental: WordbookEntry[]      // on 态投影（projectArrayMerge）
  } }
```

- **纯只读**：不落库、不失效缓存、可反复对同一批线上用户抽样（用例 `spec.ts:779` 用 `saveDataCalls` 探针 + `data` 串/`version`/墓碑串三重比对钉死）。
- 不传 `incoming` ⇒ 两种投影都以**库里当前全量**为输入 ⇒ 输出必然逐字段相等（这条就是 R-03⑥ 想要的 `diff = 0` 基线）。
- 传 `incoming`（例如"当前全量去掉一个词"）⇒ 差异面**封闭可枚举**：只可能是 ① 来方数组里没写的词、② 来方没带的可选字段（用例 `unit/…:386`、`:426`；HTTP 侧 `spec.ts:803`）。脚本按这两个维度报 diff 即可，不需要重新实现 merge 规则。
- 墓碑序列化要复算时用 `serializeTombstones`（`wordbook-service.ts:619` 只读导出，键升序、两次调用逐字节相等，`unit/…:294`）。
- **取数口径**：抽样用户列表与 `data` 原文要从 `wordbooks` 表读（`db/**` 在 T-06/T-21 的 import 面内），比对用 `pull` 面（`snapshot()` 与 REST 响应 `toEqual`，`spec.ts:829`）。但 `reconcileFor` 本身能不能被 T-21 import，见 §7 **A-a**（需裁决）。

### 8.4 给 T-11（`explicitFavorite`）的接线义务

服务端已提供 `svc.isExplicitFavoriteOn(userId)`（`wordbook-service.ts:332-334`，`userId % 100 < pct` 尾号放量，与增量开关同一实现路径）。T-11 的"查询即入库"分支必须在**调用侧**读它：off → 维持旧自动灌入（查词命中即写词本），on → 只在显式收藏时写。服务端读写面**故意不因该开关改变行为**（用例 `spec.ts:696` 写明"服务端读写不因该开关改变"），所以判据⑦ 的端到端成立需要 T-11（+ T-15 的"星标才入库"）各补一条用例；我这边没有调用点可测。

---

## 9. 出口条件核对（请 TPM/架构师逐条签）

- 判据①~⑧：✅ 全部有实现落点 + 可判真假用例；⑤ 另有真机计时（30.3 s ≤ 60 s，双向）。
- 四条红线 + 兼容线：✅ 见 §2 末尾红线表；lost-update 已修好并有**确定性注入取证**（`spec.ts:275`）。
- 门禁：`typecheck` 0、`depcruise` 0（`✔ 357 modules / 986 dependencies`）、`boundaries --copy` 0（全绿）；`pnpm --filter @tm/server test` 唯一红 = `trpc-shape` 基线（A-28-1，非本任务）。
- **阻塞项（必须有人认领才能出批次 3）**：D-2（admin 登录被自身守卫挡死 ⇒ 发布 runbook 步 8 不可执行，T-07）、A-a（判据⑧ 的 import 口径 ⇒ 否则 T-21 判据⑦ 无法落地）、pg 双驱动真跑（§5，A-18-3）。
- 非阻塞但请登记：D-1（≤60 s 承诺内但余量减半，T-07 一行修）、P-3 / D-3（契约与基线两处欠账）、A-b（T-06 的新 `AppDB` 方法，做完我才能删掉 CAS 兜底）、P-2（缺码）。
