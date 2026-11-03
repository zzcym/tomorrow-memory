# 04-dev-report · E4b5（服务端测试面收尾：件A 翻转观测用例 / 件B 清 3 条 TS18048）

- 任务号：**E4b5** · 伪任务轮次 · 胜者通道：`bounded-edit:A-83-E4b5`（TPM 已预登记于 `tools/ownership.json`，本轮**未写**该表）
- 可写面：`packages/server/test/integration/wordbook-concurrency.spec.ts`、`packages/server/test/release/manifest.spec.ts`、本报告、scratch `C:\Users\曹怡明\AppData\Local\Temp\e4b5-server\`
- 开工时刻（`date` 实测）：**2026-09-22 06:10:09** · 收尾复点时刻（`date` 实测）：**2026-09-22 06:20:01**（见 §5）
- 出口判据：**5/5 绿**（详见 §4，exit code 汇总在 §6）

---

## §0 盘面核对（简报每个锚点都用我亲跑的命令复验）

结论：**简报的 8 个锚点全部与盘面一致，0 处需要更正。** 日志：`logs/10-anchors.log`、`logs/00-baseline-typecheck.log`、`logs/00-baseline-test.log`、`logs/00-baseline-full-test.log`。

### 0-1 真库三值（开工 06:10:09 与收尾各复点一次）

```
$ ls -la data.db packages/server/data.db
-rw-r--r-- 1 曹怡明 197121 253952 Sep 18 04:05 data.db
-rw-r--r-- 1 曹怡明 197121      0 Sep 17 00:10 packages/server/data.db
$ stat -c '%y %n' data.db packages/server/data.db
2026-09-18 04:05:38.198449400 +0800 data.db
2026-09-17 00:10:53.374159200 +0800 packages/server/data.db
$ sha256sum data.db packages/server/data.db
6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d *data.db
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *packages/server/data.db
```
✅ 253952 字节 / 前 12 位 `6595517661cc` / mtime `2026-09-18 04:05:38`；占位库 0 字节 / `e3b0c44298fc` —— 四项全对。（`data.db-shm` 32768 / `data.db-wal` 424392 也全程未动，见 §1 附注。）

### 0-2 tRPC 入参关已收紧（简报说 `wordbook.ts:41`）

```
$ grep -n "max(WORD_MAX_LENGTH)" packages/server/src/trpc/routers/wordbook.ts
41:    .input(z.object({ word: z.string().min(1).max(WORD_MAX_LENGTH) }))
```
✅ 行号一字不差（简报正文另一处写 `:40` 是那颗旧用例注释里的行号，不是 src 的）。

### 0-3 `WORD_MAX_LENGTH` = 64

```
$ grep -rn "export const WORD_MAX_LENGTH" packages/shared/src/constants/limits.ts
70:export const WORD_MAX_LENGTH = 64;
```
✅ 64。旧 PUT 面的 `LEGACY_WORD_MAX_LENGTH = 100` 仍在（双口径有意并存，本轮不动）。

### 0-4 那颗观测用例的位置与原文（`:1219-1237`）

从开工时的 `before/` 副本复点（`sed -n '1219,1237p'` + `cat -n`），19 行、首行行号 **1219**、末行 `});` 行号 **1237**，标题原文含"（A-37 §八-32 约束② 的前提与实测不符，已登记待拍板）…65 字符在 tRPC `add` 上是 200"。✅ 与简报逐字一致。
`:1201`、`:1229-1233` 两处旧自述也逐字一致。文件头注释（1-17 行）与 describe 块头（970-980 行）经 `grep -n "观测|待拍板|max\(100\)|65 字符|trpc-shape|内联|登记"` 自查：**除 :1201/:1219-1237 外无第三处叙述这颗观测** ⇒ 无需同步。

### 0-5 `manifest.spec.ts` 的三处直用点

```
$ sed -n '160,166p' before/manifest.spec.ts | cat -n
      const mine = doc.entries.filter((e) => e.tag === 'v-t21c3');
      // 回填 = 原地更新（唯一产物写点 upsertManifest 以 file+sha256 去重），不是第二条条目
      expect(mine.length, `tag=v-t21c3 应恰有 1 条台账条目`).toBe(1);
      const entry = mine[0];
      expect(entry.restore_drill, 'restore_drill 回填后不得为 null').not.toBeNull();
      expect(drillIssues(entry), '演练结论字段应齐全').toEqual([]);
```
✅ `:163` 不收窄、`:164`/`:167`/`:180` 三处直用。

### 0-6 基线 `pnpm --filter @tm/server typecheck` = exit 2 / 3 条 TS18048

```
$ pnpm --filter @tm/server typecheck   # logs/00-baseline-typecheck.log
test/release/manifest.spec.ts(164,14): error TS18048: 'entry' is possibly 'undefined'.
test/release/manifest.spec.ts(167,17): error TS18048: 'entry' is possibly 'undefined'.
test/release/manifest.spec.ts(180,38): error TS18048: 'entry' is possibly 'undefined'.
Exit status 2
```
✅ 行/列号三个全部一致（164,14 / 167,17 / 180,38）。

### 0-7 基线 `pnpm --filter @tm/server test` = 20 files / 439 passed / **1 failed** / 1 skipped

```
 Test Files  1 failed | 19 passed (20)
      Tests  1 failed | 439 passed | 1 skipped (441)
EXIT=1
```
✅ 独红就是 `wordbook-concurrency.spec.ts > … > 观测（…待拍板）：65 字符在 tRPC add 上是 200，REST push 上是 400`（`AssertionError: {"error":{…}}: expected undefined to be defined` @ `:1234`）。其余 439 全绿 ⇒ 与"这颗推翻后即 0 failed"的推断一致。

### 0-8 归属表 E4b5 通道与幅度上限（只读）

```
tools/ownership.json:811-814  wordbook-concurrency.spec.ts → actions ["bounded-edit:A-83-E4b5"] · maxDiffLinesFor {"E4b5": 40}
tools/ownership.json:1166-1169 manifest.spec.ts            → actions ["bounded-edit:A-83-E4b5"] · maxDiffLinesFor {"E4b5": 8}
```
✅ 40 / 8 与简报一致；理由串明确点名 `:1219-1237` 改判、`:1201`/`:1229-1233` 同步、撤"待拍板"，以及 `:162` 三处收窄且"不许动任何断言语义"。

---

## §1 件A —— 翻转那颗"待拍板"观测用例

### A-1 先取证：65 字符走线上 tRPC `add` 的**实际响应原文**

做法：在 `:1228` 之后临时把 `trpcOnlineCall` 的四个字段（HTTP status / `data.code` / `data.httpStatus` / `error.message`）塞进一条必红断言的消息里，单跑该文件，从失败消息读出盘面真值，**再按实测写断言**（日志 `logs/01-probe-65chars.log`）。

```
$ pnpm exec vitest run --root . --project @tm/server packages/server/test/integration/wordbook-concurrency.spec.ts   # 探针跑
→ E4b5-PROBE-RAW: expected { status: 400, …(3) } to be 'DUMP'
+ Received:
{
  "dataCode": "BAD_REQUEST",
  "httpStatus": 400,
  "message": "[\n  {\n    \"code\": \"too_big\",\n    \"maximum\": 64,\n    \"type\": \"string\",\n    \"inclusive\": true,\n    \"exact\": false,\n    \"message\": \"String must contain at most 64 character(s)\",\n    \"path\": [\n      \"word\"\n    ]\n  }\n]",
  "status": 400,
}
```

**实测 = 简报预期**，逐值对上：HTTP **400**、`error.data.code` = **`BAD_REQUEST`**、`data.httpStatus` = **400**、`error.code` = `-32600`（tRPC 协议内码），message 是 zod 原文 `too_big / maximum 64 / "String must contain at most 64 character(s)" / path ["word"]`，响应体里**没有 `result` 键**。⚠ 没有一处以推断落笔，也不需要改 src。

顺带从基线那次失败消息（§0-7，那颗旧断言本来就带 `JSON.stringify(viaTrpc.raw)` 当消息）也拿到了同一份线上响应体（下面这串是**折叠版**：zod 数组与 `stack` 内部的 node_modules 路径用 `…` 收掉，键与键序照原样），两处独立互证：

```
{"error":{"message":"[ … too_big … maximum: 64 … \"String must contain at most 64 character(s)\" … path: [ \"word\" ] … ]","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"stack":"TRPCError: …","path":"add"}}}
```

### A-2 改动（`wordbook-concurrency.spec.ts`，改前 → 改后）

**A-2a `:1219`（用例标题）** —— 撤"待拍板/前提与实测不符"，改成陈述当前行为 + 点名收敛来源：

```
-  it('观测（A-37 §八-32 约束② 的前提与实测不符，已登记待拍板）：65 字符在 tRPC `add` 上是 200，REST `push` 上是 400', …
+  it('A-37 §八-32 约束②（E4b/A-82 件1 收紧 tRPC 入参后已收敛）：65 字符在 tRPC `add` 上是 400、REST `push` 上也是 400，两侧都不入库', …
```

**A-2b `:1228-1237`（注释 + 断言）** —— 旧 5 行自述（"文件内联的 `.max(100)`""旧 PUT 面同理""撞 `trpc-shape` 基线""本轮只登记"）整段撤掉，换成收敛点 + **两侧载体差别**的说明；断言从 `result toBeDefined / status 200 / 在库` 翻成 `status 400 / httpStatus 400 / code BAD_REQUEST / code ≠ INVALID_CODE / result undefined / 不在库`。`REST` 那条原断言（`:1226`）**一字未动**。改后主体（现文件 `:1228-1243`；整颗用例现在占 `:1219-1244`，文件由 1238 行变 1245 行）：

```ts
    const viaTrpc = await trpcOnlineCall('add', u, { word: sixtyFive });
    // 收敛点：`trpc/routers/wordbook.ts:41` 的入参关已从**文件内联**的 `.max(100)` 收紧成
    // `max(WORD_MAX_LENGTH)`（值 64，来自 `@tm/shared`）⇒ 65 字符现在在 **zod 入参关**就被拦，
    // 进不了 procedure 体（也就不经 `contracts/wordbook.ts` 的 `WordKeySchema`/`WordbookEntrySchema`）。
    // ⚠ 两个面都是 400，但**载体不同**，本用例因此不写"与 REST 同码同 body"：
    //   - REST `push` = 契约关 / service 出口 → 业务码 `INVALID_WORDBOOK_ENTRY`（`INVALID_CODE`）+ §4.6 定稿文案；
    //   - tRPC `add` = zod 入参关 → 协议码 `BAD_REQUEST`、message 是 zod 原文（`too_big`/maximum 64），
    //     没有 `cause.tmCode` ⇒ `init.ts` 的 errorFormatter 不提升业务码、也不经 `wordbookRejectionBody`。
    //   两侧同码同体只对**纯空格词**那一支成立（它过了 zod 关、在 trim 后走 `wordbookRejectionBody`），
    //   那是 `wordbook-trpc-add.spec.ts`（E4b 名下）已经钉过的判据，本用例不重复造。
    expect(viaTrpc.status).toBe(400);
    expect(viaTrpc.httpStatus).toBe(400);
    expect(viaTrpc.code).toBe('BAD_REQUEST');
    expect(viaTrpc.code).not.toBe(INVALID_CODE);
    expect(viaTrpc.raw.result, JSON.stringify(viaTrpc.raw)).toBeUndefined();
    expect((await getBook(u)).some((e) => e.word === sixtyFive)).toBe(false);
  });
```

**A-2c `:1201`（那颗邻居用例的注释，只改注释、断言一字未动）**：

```
-    const tooLongForBoth = 'z'.repeat(LEGACY_WORD_MAX_LENGTH + 1); // 101：REST 旧关与 tRPC 内联关都拦
+    const tooLongForBoth = 'z'.repeat(LEGACY_WORD_MAX_LENGTH + 1); // 101：REST 旧关（100）与 tRPC 入参关（`WORD_MAX_LENGTH`=64）都拦
```

### A-3 判据（这颗新钉住什么）

1. 65 字符（`WORD_MAX_LENGTH + 1`）在**线上 HTTP tRPC 面**（`@hono/trpc-server` + `fetch`，非 caller 直调）拿 **HTTP 400**，且 `data.httpStatus === 400`、`data.code === 'BAD_REQUEST'`；
2. **明确它不是业务码**：`expect(viaTrpc.code).not.toBe(INVALID_CODE)` —— 两侧同码同体这句话我没写，因为没证明；
3. 响应体无 `result`（`raw.result` undefined）；
4. 该词**不落库**（`getBook(u).some(...) === false`）；
5. 与同批 `:1197` 那颗（两侧各钉自己的协议码 + `httpStatus` 等值）互补：那颗钉"101 字符两侧都拦但载体不同"，这颗钉"65 字符在收紧后同样两侧都拦、且都不入库"。

### A-4 附注：与 `wordbook-trpc-add.spec.ts` 的重叠度（如实申报）

那颗文件 `:200`/`:208` 已钉过 caller 面的 `BAD_REQUEST` 与线上面的 `status===400`。本用例的**增量**是：同一请求在 REST `push`（契约关 → `INVALID_WORDBOOK_ENTRY`）与 tRPC `add`（zod 关 → `BAD_REQUEST`）两个载体上的**码不同**这条对照、`data.httpStatus`、`raw.result` 缺席、以及"词不入库"。简报要求是"翻转这颗"而不是删除，且归属表理由串写的就是"改判为 400/不入库"，所以按翻转做、不删、不把两颗合成一颗。

---

## §2 件B —— 清掉 `manifest.spec.ts` 的 3 条 TS18048

### B-1 改动（改前 `:163` 之后 / 改后新增 `:164-166`，守卫在 `:166`）

```ts
       const entry = mine[0];                                    // :163（未动）
+      // `noUncheckedIndexedAccess` 下 `mine[0]` 不收窄 ⇒ 下面三处直用会报 TS18048；早退守卫只做收窄，
+      // 不改判据（上一行已经把 `length === 1` 钉死了，这里只是把它告诉类型系统）。
+      if (!entry) throw new Error('tag=v-t21c3 应有恰 1 条台账条目（上一行已钉 length===1）');
       expect(entry.restore_drill, 'restore_drill 回填后不得为 null').not.toBeNull();   // 原 :164 → 现 :167
```

三处直用点随之后移：`entry.restore_drill` `:164→:167`、`drillIssues(entry)` `:165→:168`、`entry.restore_drill as Record…` `:167→:170`、`entry.sha256` `:180→:183`（文件 230 → 233 行）。

### B-2 判据与合规性

- **只做类型收窄**：`entry!` / `as` / 删断言 / 改 `expect(mine.length).toBe(1)` 一条都没用；三处直用点（`entry.restore_drill`、`drillIssues(entry)`、`entry.sha256`）的断言语义一字未动。
- 守卫的抛错文案与上一行判据同源（`length===1`），运行时不可达（`mine.length` 已钉为 1）；若哪天真不可达变成可达，那条 `expect(mine.length).toBe(1)` 会先红，不会静默跳过。
- patch 幅度 **+3/-0 = 3 行**（上限 8）。

---

## §3 两证（A-77 #261 口径）

### 证① 对 `apps/**` + `packages/**`（除我两颗文件）做 sha256 全量快照 → 收尾 `sha256sum -c`

- 快照哈希窗口 **06:15:50 → 06:16:40**（`stat -c` 实测：`logs/06-snapshot-start.txt` 06:15:50、`sha256-before.txt` 06:16:40）；清单 1732 个文件（`find apps packages -type f -not -path '*/node_modules/*'` 减去我两颗）。
- 覆盖关系（如实）：判据 1/3/4/5 的跑次（06:14:05 / 06:14:14 / 06:14:30 / 06:15:12）都在哈希窗口**之前**结束，判据 2 的全量 test（06:16:48 → 06:17:04）在窗口**之后** ⇒ 五条出口门禁的副作用全在快照的某一侧被覆盖，且哈希窗口与两者无重叠。
- 复验（第一次，紧跟判据 2）：`logs/08-sha256-verify.txt` 原文 ——

```
VERIFY_AT 2026-09-22 06:17:11
sha256sum -c EXIT=0
```

- 复核（第二次，写本报告之后）：`logs/11-close.log` 原文 ——

```
### 复核快照 sha256sum -c
EXIT=0
1732
```

`--quiet` 只打印失败项，**两次都 0 行 FAILED**、exit=0 ⇒ 1732/1732 逐字节未变，包括 `packages/server/data.db`（0 字节占位库，`e3b0c44298fc…`，在那 1732 行里）。**FAILED 归谁：无人**——本轮窗口内没有第二只手动过 `apps/**`、`packages/**`。（快照清单未含 `node_modules`，那是包管理器地盘、非源码面；`data.db*` 在仓库根、不在 `apps|packages` 里，另由 §0-1/§5 三值单独复点。）

### 证② `find . -newermt "<开工时刻>"` 反查我写过什么

判据后缀跑（`logs/09-find-newermt.txt`，06:17:21，`.delivery` 被 prune 以避开多角色噪声）：

```
$ find . \( -path './node_modules' -o -path './.git' -o -path './pgdata' -o -path './pgsql' -o -path './.delivery' \) -prune -o \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -newermt "2026-09-22 06:10:09" -print
./packages/server/test/integration/wordbook-concurrency.spec.ts
./packages/server/test/release/manifest.spec.ts
exit=0
```

收尾再跑一次（`logs/11-close.log`，06:20:01，**不 prune `.delivery`、加 `-name '*.md'`**）：

```
$ find . \( -path './node_modules' -o -path './.git' -o -path './pgdata' -o -path './pgsql' \) -prune -o \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.md' \) -newermt "2026-09-22 06:10:09" -print
./.delivery/04-dev-report-E4b5.md
./packages/server/test/integration/wordbook-concurrency.spec.ts
./packages/server/test/release/manifest.spec.ts
```
✅ 整窗口内被改名的源码只有我名下两颗，外加授权面内的本报告一颗。`.md` 全仓反查也证明没往别人的文档/配置里塞东西（`tools/ownership.json`、`package.json` 等一律未出现在结果里）。
git 侧：本轮**一次 git 命令都没跑**（写操作全禁，读操作也不需要，两证走的是 sha256/mtime），自证走 scoped patch 而非 HEAD diff。

---

## §4 出口判据五条（逐条原始输出，未合并）

### 判据 1 · 单文件（仓库根写法）

```
$ pnpm exec vitest run --root . --project @tm/server packages/server/test/integration/wordbook-concurrency.spec.ts
 ✓  @tm/server  test/integration/wordbook-concurrency.spec.ts (42 tests) 234ms

 Test Files  1 passed (1)
      Tests  42 passed (42)
EXIT=0
```
（日志 `logs/02-gate1-single-file.log`。改前该文件是 42 用例 / 1 failed，改后 42/42 —— **用例数不减**，未新增用例，只是把一颗改判。）

### 判据 2 · 服务端全量

```
$ pnpm --filter @tm/server test
 Test Files  20 passed (20)
      Tests  440 passed | 1 skipped (441)
   Start at  06:16:48
   Duration  15.82s (transform 3.01s, setup 0ms, collect 23.35s, tests 34.89s, environment 5ms, prepare 3.68s)
EXIT=0
```
（日志 `logs/07-gate2-full-test.log`。**0 failed**。基线 439 passed/1 failed → 现在 440 passed/0 failed：那颗独红翻绿，**用例总数 441 一字未变**，1 skipped 仍是那颗既有 skip。）

### 判据 3 · typecheck

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
EXIT=0
```
（日志 `logs/03-gate3-typecheck.log`。基线同命令 exit 2 / 3 条 TS18048，现在零诊断。）

### 判据 4 · 归属门禁（scoped patch，只点我两颗文件）

patch：`C:\Users\曹怡明\AppData\Local\Temp\e4b5-server\e4b5-scoped.patch` —— 真实 `git diff` 形状（每颗文件前一行 `diff --git a/<rel> b/<rel>` + `--- a/<rel>` / `+++ b/<rel>` + 标准 hunk 头），由开工 `before/` 副本与改后文件逐颗 `diff -u --label a/… --label b/…` 拼接、前置手写 `diff --git` 行。

```
$ node tools/boundaries.mjs --check-ownership --task E4b5 --files packages/server/test/integration/wordbook-concurrency.spec.ts,packages/server/test/release/manifest.spec.ts --diff-file <patch>
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 2 个文件的 diff 参与判定
NOTE packages/server/test/integration/wordbook-concurrency.spec.ts：走动作通道 bounded-edit:A-83-E4b5（按实际 diff 判定：+17/-10 行）
NOTE packages/server/test/release/manifest.spec.ts：走动作通道 bounded-edit:A-83-E4b5（按实际 diff 判定：+3/-0 行）

--check-ownership task=E4b5 触碰 2 个在册文件（清单 2 项 + patch 2 项） → 无越界
EXIT=0
```
（日志 `logs/04-gate4-ownership.log`。幅度：件A **27/40**、件B **3/8**，均在预登记上限内，未申请放宽、未开新通道。触碰清单里**没有** `tools/ownership.json`。）

### 判据 5 · 门禁自测

```
$ node tools/boundaries.mjs --self-test
…
boundaries --self-test：157/157 通过
EXIT=0
```
（日志 `logs/05-gate5-selftest.log`。未改门禁、未改 `tools/ownership.json`。）

---

## §5 收尾复点真库三值（原始输出，`logs/11-close.log` 首段）

```
$ date "+%Y-%m-%d %H:%M:%S"
2026-09-22 06:20:01
$ ls -la data.db packages/server/data.db
-rw-r--r-- 1 曹怡明 197121 253952 Sep 18 04:05 data.db
-rw-r--r-- 1 曹怡明 197121      0 Sep 17 00:10 packages/server/data.db
$ sha256sum data.db packages/server/data.db
6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d *data.db
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *packages/server/data.db
$ stat -c '%y %n' data.db packages/server/data.db
2026-09-18 04:05:38.198449400 +0800 data.db
2026-09-17 00:10:53.374159200 +0800 packages/server/data.db
```
✅ 253952 / `6595517661cc…` / mtime `2026-09-18 04:05:38` 与开工值（06:10:09，§0-1）逐字符相同；占位库 0 字节 / `e3b0c44298fc…` 相同。真库整轮只读、mtime 未刷。
（附带：仓库根的 `data.db-shm` 32768 / `data.db-wal` 424392 在开工时 `ls -la` 已记下，本轮同样一字未动 —— 简报只点了两颗 `.db`，这两个 sidecar 我一并只读。）

---

## §6 缺陷自报

1. **并发跑了两轮基线全量 test**（`b5n6i8khf` 与 `b002g1wxs` 两个后台任务在 06:11-06:12 重叠）：起因是我第一次派错（未等结果又补发一条同命令）。这属于本项目已知的假红/假绿源，本轮**运气好没受影响**——两份日志独立给出完全相同的 `1 failed | 439 passed | 1 skipped`，反而成了互证；但做法本身不规范，正式口径只把 `logs/00-baseline-test.log` 当基线，另一份标为"并发复核"。返工：无（结论未受影响）。
2. **探针法留了个临时断言**：取证用的 `toBe('DUMP')` 必红断言在改后文件里不存在（同一次 Edit 里替换掉了），但若只跑 `--gate 1` 前忘了清，会留一颗假红。已确认最终 patch 里不含 `PROBE`/`DUMP` 字样（`grep -c` 于改后文件 = 0）。
3. **件A 与 `wordbook-trpc-add.spec.ts` 存在判据重叠**（caller 面 65→`BAD_REQUEST`、线上面 65→HTTP 400 各已被钉过一次），见 §1-A-4 的增量说明。我选择"翻转不合并"，因为简报与归属表理由串都点名"改判这颗"。若 TPM 认为该收敛成一颗，需要**新通道**（那颗文件本轮禁写、且上限未登记给我）。
4. **未做的事**：没新增用例（用例数 441 不变）、没动 src、没动 shared、没动 `LEGACY_WORD_MAX_LENGTH` 的双口径、没动 `trpc-shape` 基线、没写 `tools/ownership.json`、没跑任何 git 写命令。
5. 无 `test.skip` / `test.fail` / `test.todo` / `.only`；无 `waitForTimeout`；无 `as any`；无放松断言（400 就是 400，没写成 `<500`）；`as` 仅出现在**既有**代码（探针与守卫都没引入新 `as`）。

---

## §7 出口判据 exit code 汇总 + 件A 实际 tRPC 响应原文

| # | 命令 | exit |
|---|---|---|
| 1 | `pnpm exec vitest run --root . --project @tm/server packages/server/test/integration/wordbook-concurrency.spec.ts` | **0**（42/42） |
| 2 | `pnpm --filter @tm/server test` | **0**（20 files / 440 passed / 1 skipped / 0 failed） |
| 3 | `pnpm --filter @tm/server typecheck` | **0** |
| 4 | `node tools/boundaries.mjs --check-ownership --task E4b5 --files <两颗> --diff-file <patch>` | **0**（无越界；+17/-10 ≤ 40、+3/-0 ≤ 8） |
| 5 | `node tools/boundaries.mjs --self-test` | **0**（157/157 通过） |

**件A 的实际 tRPC 响应原文**（65 字符走线上 `POST /trpc/add`，06:13 探针跑与 06:11 基线跑两次独立取值一致）：

- HTTP **status 400**
- 响应体（键序照原样，只把 `stack` 那串内部路径省略为 `…`）：`{"error":{"message":"[\n  {\n    \"code\": \"too_big\",\n    \"maximum\": 64,\n    \"type\": \"string\",\n    \"inclusive\": true,\n    \"exact\": false,\n    \"message\": \"String must contain at most 64 character(s)\",\n    \"path\": [\n      \"word\"\n    ]\n  }\n]","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"stack":"TRPCError: …at inputValidatorMiddleware (…)","path":"add"}}}` —— **无 `result` 键**，`data.code === 'BAD_REQUEST'`（不是 `INVALID_WORDBOOK_ENTRY`），词未入库。
