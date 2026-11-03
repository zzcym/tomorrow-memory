# 04-dev-report E4b — 服务端词本面收口（批次4 出口轮 E4 · 伪任务号 A-82-E4b）

- dev agent：E4b
- 开工时刻（实测 `date`）：`Mon Sep 21 21:23:26 2026`
- 收尾时刻（实测 `date`）：`Mon Sep 21 21:50:40 2026`
- scratch / 日志目录：`C:\Users\曹怡明\AppData\Local\Temp\e4b-server\`（全程留存，未删）
- 真库只读首点（开工前）：`data.db` 253952 字节 / `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d` / mtime 2026-09-18 04:05:38；`packages/server/data.db` 0 字节 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

---

## §0 盘面核对（与简报不符处点名）

逐件 grep 核实，**绝大多数锚点与简报逐字相符**；以下三处需点名更正：

1. **件4 `contracts/auth.ts` 的归属**——简报写"件4 动的一颗是 owner=T-07 的精确条目"。盘面实测：`packages/shared/src/contracts/auth.ts` 的精确条目 **owner=T-03**（`readers:["T-07"]`、既有 `actions:["bounded-edit:A-36-3"]`、`maxDiffLinesFor:{"T-07":49}`，见 `tools/ownership.json:140`）。真正 owner=T-07 的是 **`auth-hardening.spec.ts`**（经 `{auth-register,auth-hardening}.spec.ts` glob 判给 T-07，`ownership.json:785`）。⇒ 登记时按盘面走：`contracts/auth.ts` 并入 T-03 既有条目、`auth-hardening.spec.ts` 新立精确条目（owner 记 T-07）。**按盘面做**。

2. **件1③"待核"结论已被盘面直接闭合**——简报要我读 `addWord` 判 service 内部有无自 trim。实测 `wordbook-service.ts:499-500`：
   ```
   async addWord(userId, rawWord) {
     const word = String(rawWord ?? '').trim().toLowerCase();
   ```
   ⇒ **service 自己就 trim+lowercase**。`:42`（现 `:43`）算的 trim+lowercase 只喂事件、`:43`（现 `addWord` 那行）传的未 trim `input.word` 进 service 后又被同样处理 ⇒ **存储值无差异**，仅"事件 word_id 与入库 word 同源都取 trim 后小写"。这是取证结论，**未改代码**（按裁决：行为面差异不在本轮）。

3. **出口判据 #2 的"单命令 + 件3 patch + 跨主文件清单"在门禁自身语义下不可能同时 exit 0**（结构性，非我实现问题）：`tools/boundaries.mjs:1530` 的 `judgeBaselineRegenerate` stray 规则判"baseline patch 里出现 outputs 之外的任何文件 → 红"；而 `judgeBoundedEdit`（`:1393`）判"本文件没出现在 patch 里 → 要证据红"。⇒ 若把件1/件2/件4 的跨主文件与基线塞进**同一** `--diff-file`，基线那颗必因 stray 红（已实测，见出口判据节 `gate-combined.log`）。我因此**拆成两条 scoped-patch 判定**（基线一条、三颗代码文件一条），两条各自 exit 0，原文均贴。

其余锚点全部相符：`wordbook.ts:39-43` 原形状、`wordbookRejectionBody` 定义在 `wordbook-service.ts:670` 且只被 `routes/wordbook.ts:84/90/113` 用、`WORD_MAX_LENGTH=64` 在 `constants/limits.ts:70`（经 `constants/index.ts`、`shared/src/index.ts:27` 两级 `export *` 可达，无裸出口行但确实 `import { WORD_MAX_LENGTH } from '@tm/shared'` 可用）、`:3876` 恰命中 `auth-hardening.spec.ts:1096` 与 `contracts/auth.ts:25`、基线再生开关 `TRPC_SHAPE_UPDATE=1`（`trpc-shape.spec.ts:18/369`）、`ownership.json` 的 `trpc-shape` 条目已由 TPM 加好 `baseline-regenerate:A-82-E4b` 与 `baselineRegenerateFor.E4b.outputs`。

---

## 件1 — tRPC 词本 `add` 上限收紧 max(100) → max(WORD_MAX_LENGTH)

**实现位置**：`packages/server/src/trpc/routers/wordbook.ts`
- `:24` 新增 `import { WORD_MAX_LENGTH, type WordbookEntry } from '@tm/shared';`
- `:41` `.input(z.object({ word: z.string().min(1).max(WORD_MAX_LENGTH) }))`（原 `max(100)`）

`WORD_MAX_LENGTH` 值 = 64（`@tm/shared` 单一源，**未写字面量 64**）。

**只动 tRPC add，未碰 PUT(legacy) 面**：`LEGACY_WORD_MAX_LENGTH=100`（REST `parseLegacyArray`）一字未动，65-100 档在 legacy PUT 仍设计内放行（A-40 #51/#53）。

**scoped diff 幅度**：`+19 / -3 = 22 行`（import 段一处 + add 块，见 `e4b-code.patch` 第 4、17 行 hunk 头 `@@ -20,9 +20,10 @@`、`@@ -37,9 +38,24 @@`）。

**用例**（新建 `packages/server/test/integration/wordbook-trpc-add.spec.ts`，未碰 `trpc-shape.spec.ts` 本体）：
- `WORD_MAX_LENGTH` 值为 64；
- 64 字符走 tRPC add（caller + 线上 HTTP）→ 放行 `added:true` / HTTP 200；
- 65 字符走 tRPC add → caller 抛 `BAD_REQUEST`、线上 HTTP 400（收紧前此处为 200）。

原始尾行（单独跑该 spec，`run-e4b-spec.log`）：
```
 ✓  @tm/server  test/integration/wordbook-trpc-add.spec.ts (7 tests) 141ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

**⚠ 件1 的直接连带后果（见"缺陷自报 D-1 / 出口判据 #1"）**：收紧后，`packages/server/test/integration/wordbook-concurrency.spec.ts:1219`（T-09 名下、预先登记为"待拍板"的观测用例，钉的是收紧前旧行为 65 字符→tRPC add 得 200）转红。我**未改 T-09 的断言、未加 skip**，停下报告由 TPM 裁。

---

## 件2 — 纯空格词在 tRPC add 面拒成 400（同码同 body）

**实现位置**：`packages/server/src/trpc/routers/wordbook.ts:43-58`（`add` mutation 体内、调 service 之前）
```
const word = input.word.trim().toLowerCase();
if (word === '') {
  const { status, body } = wordbookRejectionBody({
    kind: 'invalid-entry', words: [input.word], cause: 'invalid_word_name',
  });
  throw new TRPCError({
    code: 'BAD_REQUEST', message: String(body.error),
    cause: { tmCode: body.code, httpStatus: status },
  });
}
```
新增 import：`TRPCError`（`@trpc/server`）、`wordbookRejectionBody`（service）。

**不动 zod 形状**：守卫在 mutation 体内、input schema 之后；`min(1)` 仍放行 `'   '`（长度 3），只在 trim 后为空时拒 ⇒ **不消耗基线额度**（基线 input 形状无第二处变化，件3 diff 佐证）。

**照先例接错误形状、未自造第二套**：走 `trpc/init.ts:107-120` 唯一 errorFormatter，把 `cause.{tmCode,httpStatus}` 提升为 `data.{code,httpStatus}`——与 `review.ts:33-42` `asTrpcError` 同一口径（`INVALID_WORDBOOK_ENTRY` 住 `TM_ERRORS_SUPPLEMENT`，不用 `tmErrorCause()`（它只查 `TM_ERRORS`），直传字面 cause，同 review 域补充码的做法）。

**同码同 body 成立面**：REST 三面（push/PUT/push-zod关）本轮前已成立；tRPC 面本轮补齐。REST 与 tRPC 都经同一个 `wordbookRejectionBody → wordbookInvalidEntryBody`（`wordbook-service.ts:670/644`），恒两键 `{error, code:INVALID_WORDBOOK_ENTRY}`、status 400，测试里不写第二份裸文案。

**用例**：`'   '` 走线上 tRPC add → 400 + `data.code` 与 `message` **逐值等于** REST push 对纯空格的返回；并断 caller 直调同样 `BAD_REQUEST` 且不落库（`GET /api/wordbook` 回空）。

原始尾行：见上 `run-e4b-spec.log`（件2 三用例并入 7 passed）。REST 侧日志实锚（`run-e4b-spec.log` 尾段）：
```
[wordbook_invalid_entry] {"userId":5,"facade":"push","cause":"invalid_word_name","count":1}
```

---

## 件3 — 一次性基线再生（A-82-E4b 额度）

**流程**：改码前 `cp` 基线快照到 scratch（`baseline-before-regen.json`）→ 先跑 `trpc-shape.spec.ts`（不带开关）**确认漂移被捕获且只命中 wordbook.add**：
```
→ appRouter 形状漂移：首个差异在第 16987 行
  现值: "value": 64   基线: "value": 100   受影响 procedure: wordbook.add
```
→ `TRPC_SHAPE_UPDATE=1 pnpm exec vitest run --root . --project @tm/server packages/server/test/trpc-shape.spec.ts`（`shape-regen.log`）：
```
 ✓  @tm/server  test/trpc-shape.spec.ts (2 tests) 16ms
      Tests  2 passed (2)
```
→ `diff -u <快照> <再生后> > e4b-baseline.patch`（patch 头写仓库相对路径 `a/… b/…`）。

**逐段 diff 统计**（`diff` 全量，只 2 处 hunk，共 +2/−2 = 4 行）：
```
16993c16993   < "value": 100        →  > "value": 64      （wordbook.add / 字段 path="word" 的 max）
17104c17104   < "message":"...at most 100 character(s)"  →  > "...at most 64 character(s)"
```
- 两处 `path` 定位（向上找最近 procedure）：`line16993 => "path": "wordbook.add"`、`line17104 => "path": "word"`（即 wordbook.add 的 word 入参）⇒ **仅 wordbook 段变**。
- **对照证据（E3′ 先例口径）**：`diff | grep -iE 'auth\.|login|sendCode' | wc -l` = **0** ⇒ `auth.*` 段 0 行变化。全仓 `"value": 100` 计数 5→4（余 4 处是别的过程既有 max，未受影响）。

**门禁放行**（`gate-baseline.log`，exit 0）：
```
PATCH 1 个文件的 diff 参与判定
NOTE packages/server/test/trpc-shape.baseline.json：走动作通道 baseline-regenerate:A-36-E3（按实际 diff 判定：+2/-2 行）
--check-ownership task=E4b 触碰 1 个在册文件（清单 1 项 + patch 1 项） → 无越界
```
（通道实为 TPM 登记的 `baseline-regenerate:A-82-E4b`；门禁按 actions 数组首个判通者显示为 `A-36-E3`，二者 `baselineRegenerateFor['E4b']` 同一份 outputs 配置，`只准写 trpc-shape.baseline.json`、`trpc-shape.spec.ts` 本体一字未碰。）

第 1 次再生即判绿（漂移范围 = 预期，无"多跑凑绿"）。

---

## 件4 — 注释旧行号锚 `:3876` 清零

**只改注释、零代码/断言改动**。两处命中换成符号名（先例 A-58 #160 / FU14）：
- `packages/shared/src/contracts/auth.ts:25`：`基线 \`:3876\` 逐字` → `基线 \`auth.sendCode\` 段逐字（A-58 #160：以符号名代易漂移的行号锚）`。scoped diff **+1/−1 = 2 行**。
- `packages/server/test/integration/auth-hardening.spec.ts:1096`：`... / \`:3876\`（sendCode）` → `... / \`auth.sendCode\` 段（sendCode，原行号锚已按符号名替换）`。scoped diff **+1/−1 = 2 行**。

复点残留：`grep -rn 3876 packages/shared/src/contracts/ packages/server/test/integration/auth-hardening.spec.ts` → **空**。

**两面 `:数字` 锚点全清单与处置**（FU03⑥ 缩核只点名 `:3876`；范围外一律**留**，未顺手改）：

| 文件:行 | 锚点 | 处置 | 理由 |
|---|---|---|---|
| contracts/auth.ts:19 | `auth.login` 基线 `:6011`/`:6042` | 留 | 范围外（非 :3876），login 面锚点 |
| contracts/auth.ts:20 | `auth.sendCode` 基线 `:7663`/`:7678` | 留 | 范围外，是入参形状锚、与本轮 :3876 逐字文案锚不同源 |
| contracts/auth.ts:22 | `errors.ts:80` | 留 | 源码行锚，非基线锚，范围外 |
| contracts/auth.ts:58 | `baseline.json:6352-6360` | 留 | 范围外 |
| contracts/auth.ts:25 | `:3876` | **改** | 件4 目标 |
| contracts/lookup.ts:7 | `page.tsx:106/169`、`word-lookup.tsx:38-39`、`nodes/lexicon.ts:63` | 留 | 指向 apps/**、packages/agent（apps 禁动面），范围外 |
| contracts/wordbook.ts:40 | `routes/wordbook.ts:22` | 留 | 源码行锚，范围外 |
| auth-hardening.spec.ts:1096 | `:3876`（sendCode） | **改** | 件4 目标；同句 login 侧 `baseline.json:3199` 范围外 → 留 |
| auth-hardening.spec.ts:896 | `middleware/auth.ts:118` | 留 | 源码行锚，范围外 |
| auth-hardening.spec.ts:1038 | `tools/ownership.json:740` | 留 | 账面行锚，范围外（且会随账面漂移，非本轮裁决项） |
| auth-register.spec.ts:531 | `app.ts:221-235` | 留 | 源码行锚，范围外（本轮未改此文件） |
| auth-register.spec.ts:1200 | `auth-service.ts:228/242` | 留 | 源码行锚，范围外 |
| auth-register.spec.ts:297 | （`w${i}` 模板串误命中，非行号锚） | 无关 | 非锚点 |

`auth-register.spec.ts` 本轮 0 改动（简报只点名 auth-hardening 与 contracts/auth 两颗）。

---

## 授权通道登记（tools/ownership.json）

三颗跨主文件均按盘面归属登记，形状照先例（`actions:["bounded-edit:A-82-E4b"]` + `maxDiffLinesFor.E4b = 实测幅度`，reason 点名"谁独占/本轮为何改/幅度出处"）：

1. **`packages/shared/src/contracts/auth.ts`**（既有精确条目 idx13，owner=T-03）——按 F-41（`boundaries.mjs:1627` 取胜者 `entries[0]`，同路径新建第二条读不到）**并入既有条目**：`actions` 追加 `bounded-edit:A-82-E4b`、`maxDiffLinesFor` 追加 `"E4b": 2`（件4 实测 +1/-1）。
2. **`packages/server/src/trpc/routers/wordbook.ts`**——**新立精确条目**（owner=T-09，specificity 恒赢 `{...,wordbook,...}.ts` glob 兜底条目），`maxDiffLinesFor.E4b=22`（件1/件2 实测 +19/-3）。
3. **`packages/server/test/integration/auth-hardening.spec.ts`**——**新立精确条目**（owner=T-07，赢 `{auth-register,auth-hardening}.spec.ts` glob），`maxDiffLinesFor.E4b=2`（件4 实测 +1/-1）。

`trpc-shape.baseline.json` 的再生通道由 TPM 预先登记（A-82-E4b），我未动那颗条目本体，`trpc-shape.spec.ts` 未碰。`wordbook-trpc-add.spec.ts` 是我新建文件，归属表无条目（no-entry，不阻断）。

JSON 合法性：`node -e "JSON.parse(...)"` OK。

**`--self-test` 复跑**（`selftest.log`，尾行）：
```
boundaries --self-test：157/157 通过
```

---

## 出口判据

### #1 `pnpm --filter @tm/server test`（全量） — **未达全绿，1 红**

尾行（`full-test.log`）：
```
 FAIL  @tm/server  test/integration/wordbook-concurrency.spec.ts > T-09r1 §5.4-2 ... > 观测（A-37 §八-32 约束② 的前提与实测不符，已登记待拍板）：65 字符在 tRPC `add` 上是 200，REST `push` 上是 400
AssertionError: ...{"code":"too_big","maximum":64,...}...: expected undefined to be defined
 ❯ test/integration/wordbook-concurrency.spec.ts:1234:61

 Test Files  1 failed | 19 passed (20)
      Tests  1 failed | 439 passed | 1 skipped (441)
Exit status 1
```
- 账面增减：files 19 → **20**（我 +1）；passed 433 → **439**（我新增 7，减 1 = 下述陈旧观测用例转红）；skipped 恒 1。**只增不减**对我名下 7 颗新用例成立；唯一红是下述 D-1。

### #2 `--check-ownership` scoped-patch 放行（两条，各 exit 0）

因 §0 第 3 点（门禁自身 stray 规则），单命令塞全部跨主文件与基线不可能 exit 0，拆两条：

- 三颗代码文件（`gate-code.log`，exit 0）：
```
PATCH 3 个文件的 diff 参与判定
NOTE packages/server/src/trpc/routers/wordbook.ts：走动作通道 bounded-edit:A-82-E4b（按实际 diff 判定：+19/-3 行）
NOTE packages/shared/src/contracts/auth.ts：走动作通道 bounded-edit:A-36-3（按实际 diff 判定：+1/-1 行）
NOTE packages/server/test/integration/auth-hardening.spec.ts：走动作通道 bounded-edit:A-82-E4b（按实际 diff 判定：+1/-1 行）
--check-ownership task=E4b 触碰 3 个在册文件（清单 3 项 + patch 3 项） → 无越界
```
- 基线（件3，`gate-baseline.log`，exit 0）：见件3 节原文。
- （反证：合并 patch 的 `gate-combined.log` 因 stray 判红，`combined exit=1`，仅用于说明 §0-3 结构性事实。）

### #3 两证复算 + 真库三值复点

**证一（sha256 全量快照复算）**——开工前对 `apps/**`+`packages/shared/**`+`packages/server/**`（1575 文件，去 node_modules）落 `pre-freeze.sha256`，收尾 `sha256sum -c`。全量复算把并行轮 E4b2 在 `apps/**` 的写入也一并照出（9 处 apps FAILED，其中 `ScreenFallback.tsx` 报 `open or read`= 原子写窗口锁），非我写入。为隔离，限定到 `packages/**`（我禁动面内自有面）：
```
packages/** 快照行数: 536
packages/server/src/trpc/routers/wordbook.ts: FAILED
packages/server/test/integration/auth-hardening.spec.ts: FAILED
packages/server/test/trpc-shape.baseline.json: FAILED
packages/shared/src/contracts/auth.ts: FAILED
OK=532 FAILED=4
```
⇒ packages/** 内 FAILED **恰为我名下 4 颗**（第 5 颗 `wordbook-trpc-add.spec.ts` 是新建文件，快照时无 ⇒ 不出现在 -c）。apps/** 的 9 处 FAILED 全归并行轮 E4b2。

**证二（find -newermt 反查本轮写入清单）**——`find packages -type f -newermt "2026-09-21 21:23:00" -not -path '*/node_modules/*' -not -path '*/dist/*'`：
```
packages/server/src/trpc/routers/wordbook.ts
packages/server/test/integration/auth-hardening.spec.ts
packages/server/test/integration/wordbook-trpc-add.spec.ts
packages/server/test/trpc-shape.baseline.json
packages/shared/src/contracts/auth.ts
```
⇒ 本轮我名下写入 = 5 颗（4 改 + 1 新建），与证一完全吻合；`tools/ownership.json` 在快照面之外（简报授权的登记面）。两法互证。

**真库三值复点**（收尾，`date` 实测 `Mon Sep 21 21:50:40 2026`）：
```
data.db:            6595517661cc6a348f85473b  |  253952 bytes  mtime=2026-09-18 04:05:38  → 未变
server/data.db:     e3b0c44298fc1c149afbf4c8  |  0 bytes                                  → 未变
```
全程无任何开关打真库、无写入真库，测试临时库均在 `os.tmpdir()` 内。

---

## 缺陷自报

**D-1（阻断出口判据 #1，需 TPM 裁，非我可自修）**
- 现象：`pnpm --filter @tm/server test` 有 1 红，位于 `packages/server/test/integration/wordbook-concurrency.spec.ts:1219-1237`（T-09 名下）。
- 根因：该用例标题自陈"观测（A-37 §八-32 约束② 的前提与实测不符，**已登记待拍板**）：65 字符在 tRPC add 上是 200"，正文注释（`:1229-1233`）明确"要收敛就得改 tRPC 入参形状 = 撞 trpc-shape 基线（约束③ 不许再生成）⇒ **本轮只登记，不动门面**"。FU02①/A-82 的裁决恰是拍板去收敛（件1），A-82-E4b 又解除了"不许再生"（件3）⇒ 件1 落地后该"待拍板"观测用例钉的旧行为（65→200/toBeDefined/入库 true）被推翻，`:1234` 转红。
- 我的处置：**未改 T-09 的断言、未加 `test.skip`/`test.fail`、未放松任何门禁**（硬纪律）。这是跨主、且涉及"改他人测试以自证变绿"的判断，属简报"停下报告我来裁"那一类。
- 建议（供裁，不自行执行）：授权在下一轮以窄通道更新 `wordbook-concurrency.spec.ts:1219` 那颗观测用例——把 `toBeDefined()/status 200/入库 true` 改为 `status 400`、`data.code` 与件1 收紧后一致、且不入库；同时该用例标题"待拍板"可去掉。此项是本轮唯一挡全绿的点。

**其余**：无。件1/件2 的 7 颗新用例、件3 再生、件4 注释、门禁两票、两证、真库复点均如上述原始输出所示，无放松断言、无 skip/fail 遗留、无 `waitForTimeout`、无屏蔽端点、无改产品 DOM/门禁脚本、未碰 `tools/boundaries.mjs`、未碰 `apps/**`。

TS 类型检查（`tsc2.log`，`pnpm --filter @tm/server typecheck`）：exit 2，唯 3 条报错全在 `test/release/manifest.spec.ts:164/167/180`（`'entry' is possibly 'undefined'`，**存量、非我名下文件、非本轮引入**）；我改的 `wordbook.ts` 与新建 `wordbook-trpc-add.spec.ts` **0 TS 错误**。

---

## 收尾状态摘要（交回 TPM）

件1–件4 均已按裁决落地：件1 `wordbook.ts:41` 上限由 `max(100)` 收紧为 `max(WORD_MAX_LENGTH)`（64，取自 `@tm/shared`，无字面量），未碰 legacy PUT；件2 在 `add` mutation 体内、service 之前用 `wordbookRejectionBody()` 拒纯空格 400，错误形状经 `init.ts` 唯一 errorFormatter 提升 `data.{code,httpStatus}`，与 REST 三面同码同 body，未动 zod 形状；件3 第 1 次再生即绿，基线 diff 仅 2 hunk/+2-2 行、全落 `wordbook.add`、`auth.*` 段 0 行（对照成立）；件4 `:3876` 两处换成符号名、零代码改动，其余 `:数字` 锚点已列清单全部标"留"。三颗跨主文件的 `bounded-edit:A-82-E4b` 通道按盘面归属登记（auth.ts 并入 T-03 既有条目、wordbook.ts 与 auth-hardening.spec.ts 新立精确条目），`--self-test` 复跑仍 157/157 通过，ownership JSON 合法。**两证**：packages/** 复算 532 OK + 恰我 4 颗 FAILED、find 反查 5 颗写入完全吻合，真库三值未变。**出口判据 #2 两条 scoped-patch 判定各 exit 0**（因门禁 stray 规则拆两条，原因见 §0-3）。**唯一未达绿是 #1**：`wordbook-concurrency.spec.ts:1219` 一颗 T-09 名下"待拍板"观测用例钉的是件1 收紧前的旧行为，被裁决推翻后转红（files 19→20、passed 433→439、1 failed、1 skipped）；我按纪律**未擅改他人断言、未加 skip**，列 D-1 请裁——建议下一轮以窄通道把该观测用例改判为 65→400/不入库。
