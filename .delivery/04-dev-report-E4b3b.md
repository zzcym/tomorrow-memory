# 开发报告 E4b3b · R-15⑤ 消费半件（REST `?with_progress=1` + App 取数 + 两端 `stageOf` 改判）

任务书：`BRIEF-E4b3b`（A-87 #322–#329 · 通道 `bounded-edit:A-87-E4b3b`）。
开工时刻（sha256 基线快照同刻落盘）：**2026-09-23T01:39:34+08:00**。
Scoped patch（`git diff --no-index` 生成，`diff --git` 头为仓库相对路径）：`C:\Users\曹怡明\AppData\Local\Temp\e4b3b\e4b3b.scoped.patch`（由 `scratch\gen-patch.mjs` 用 `%TEMP%\e4b3b\scratch\orig\` 的改前快照对现盘生成，不收 HEAD diff）。

## 0. 三件落点（行号为改后盘面行号）

| 件 | 文件 | 落点 | 状态 |
| --- | --- | --- | --- |
| A | `packages/server/src/routes/wordbook.ts` | `:19`（import 单点常量）、`:68-76`（GET 分支） | ✅ |
| A | `packages/shared/src/contracts/wordbook.ts` | `:48-53`（`WORDBOOK_PROGRESS_QUERY='with_progress'` + `WORDBOOK_PROGRESS_QUERY_ON='1'`，与键名单点同文件同区域） | ✅ |
| A | `packages/shared/test/contracts.spec.ts` | `:1234-1244`（单点哨） | ✅ |
| A | `packages/server/test/integration/wordbook-progress-keys.spec.ts` | `:334-380`（判据⑥，追加在既有 5 判据之后） | ✅ |
| A | `packages/server/src/services/wordbook-service.ts` | **未触碰（0/36 行）**：路由直接二选一调 `read()`/`readWithProgress()`，两颗入口签名一颗都没改，无须用额度 | ✅（以不做为完成） |
| B | `apps/app/src/data/queries/wordbook.ts` | `:10-13`（import）、`:126-139`（`wordbookQueryOptions().queryFn` 经 `apiGet` 的 `query` 选项带 `with_progress=1`） | ✅ |
| C | `apps/app/src/screens/WordbookScreen.tsx` | `:149-156`（doc 补改判理由）、`:159-163`（键到位分支） | ✅ |
| C | `apps/web/src/lib/api/wordbook.ts` | `:145-146`（doc 补改判理由）、`:152-157`（键到位分支） | ✅ |
| C | `apps/app/test/wordbook-screen.spec.tsx` | `:1160`（C-33 旧 `state>=3⇒mastered` 预期按改判作废）、`:1183-1221`（新 describe：件B 带参 / 件B 透传 / 件C 逐档 + 降级反证） | ✅ |

## 1. 件A — REST `GET /api/wordbook` 认 `?with_progress=1`（缺省逐字节不变）

门面（`routes/wordbook.ts:68-76`）：

```ts
  r.get('/api/wordbook', auth, async (c) => {
    // E4b3b 件A（A-87 #325）：`?with_progress=1` 才 opt-in 进度三键（additive）。
    // 缺省 / `0` / 任何其余取值都走 `read()` —— 缺省响应逐字节不变（§6.2-1 兼容快照红线）。
    const progressOn = c.req.query(WORDBOOK_PROGRESS_QUERY) === WORDBOOK_PROGRESS_QUERY_ON;
    const entries = progressOn
      ? await svc.readWithProgress(c.get('userId'))
      : await svc.read(c.get('userId'));
    return c.json({ data: entries });
  });
```

- **参数名常量单点**：`contracts/wordbook.ts:52-53`（含 `:48-51` doc），服务端分支与 App 取数共用；shared 单点哨（`contracts.spec.ts:1234-1244`）机检 `with_progress` 字面量在 shared 全部产出面**恰出现一次**（实测该用例过，66/66）。
- **`?with_progress=0` / 非法值口径（无暗分支，钉死）**：只有 query 值**恰为字符串 `'1'`** 才算开；缺省 / `0` / `true` / 乱值 / 空值一律走 `read()`。判据⑥ 里用 `['', '=0', '=true', '=maybe', '=']` 五例逐一断言响应序列化与缺省 GET **逐字节相等**（`JSON.stringify` 全等，不止键集合）。
- 三颗禁改哨未碰（两证见 §6）；`legacy-apk` 33 条与 `wordbook-concurrency` 全量在本轮 2 次 server 全套中均绿 ⇒ 缺省响应逐字节不变是**实测**，不是推定。
- 缓存口径：REST 带参分支直读 `readWithProgress()`（E4b3 原注释「缓存层属下一轮」），本行不引入第二份缓存语义。

**判据⑥ 双向证据**（`wordbook-progress-keys.spec.ts:334-380`，同数据同用户，mango 有卡 / pear 无卡）：

- 带参侧 = `readWithProgress()` 整份逐值 + 序列化相等（`:353-354`）；
- 缺省侧三颗 `in` 判断逐词为 `false`（`:361`）——"缺省无"方向；
- 带参侧对缺省侧的键集合差 `extra` **恰等于**该词在带参侧出现的进度键集合（`:362-363`），且既有键逐键等值（`:364`）——"带参有、且只多这三颗"方向；
- mango 三键齐（含 `state===CardState.Review`、`nextDue===DUE_MS` 逐值对卡），pear 带参侧也整键缺席（`:368-371`）。

## 2. 件B — App 取数带参数 + 解析层透传实测

`apps/app/src/data/queries/wordbook.ts:130-138`：`queryFn` 改为 `apiGet('/api/wordbook', { auth: true, query: { [WORDBOOK_PROGRESS_QUERY]: WORDBOOK_PROGRESS_QUERY_ON } }, …)`（走 `rest-fetcher` 既有的 `query` 选项，不动 fetcher 本体）。`pull` / `push` / `requestPull` 一字未动（§C-3 提醒已收）。

**透传实测（不是假设），两条路都钉**（`wordbook-screen.spec.tsx:1195-1204`，实跑绿）：

- 整批干净路径（`WordbookArraySchema` → `unwrapParse`）：`readWordbookList({data:[{word,addedAt,state:2,lapses:1,nextDue}]})` 后条目 `toMatchObject({state:2,lapses:1,nextDue})` 且 `salvaged=0`，`stageOf` 据此直接点亮 `mastered`；
- 逐条分流路径（`salvageEntry` 的 `{...raw}`）：掺一条 `reviewCount:-1` 的坏条目逼出 salvaged=1，其三键仍原样保留，`stageOf` 读到 `state:3 ⇒ learning`。
- 另钉**线上 URL**（`:1186-1193`）：真挂载屏幕后 `GET /api/wordbook` 恰 1 次且 URL 为 `/api/wordbook?with_progress=1`，`pull` 0 请求。zod `.passthrough()` 是键不丢的机理，此条是它的行为级反证。
- 机理注（假说级因果，行为已由上两条实测兜住）：三键不被剥**因为** `WordbookEntrySchema` 是 `.passthrough()` 且 `salvageEntry` 用展开保留未知键——这两处本轮都没改，属于对既有代码的读码结论。

## 3. 件C — 两端 `stageOf` 键到位分支改判（§C-5）

**两端并排对照（键到位分支逐字同套，实测 `awk` 截段比对）**：

| App `WordbookScreen.tsx:159-163` | Web `lib/api/wordbook.ts:154-158` |
| --- | --- |
| `if (typeof extra.state === 'number') {` | `if (typeof extra.state === 'number') {` |
| `  if (extra.state <= 0) return 'new';` | `  if (extra.state <= 0) return 'new';` |
| `  if (extra.state === 2 && typeof extra.nextDue === 'number' && extra.nextDue - now >= LONG_INTERVAL_DAYS * DAY_MS) return 'mastered';` | （同左，逐字一致） |
| `  return 'learning';` | `  return 'learning';` |
| `}` | `}` |

两行函数上方的改判理由注释（各 1 行，落点 `:152-153` / `:145-146`）：只有 `CardState.Review`(2) 是稳定卡、长间隔 due 才算掌握候选；`Relearning`(3) 刚失手重学 ⇒ 归在背（A-87 #325，`lapses` 不再参与该分支）。

§C-5 五条映射逐一有用例钉（`wordbook-screen.spec.tsx:1207-1214`，实跑绿）：`state=2`+≥7d ⇒ mastered；`state=2`+<7d ⇒ learning；`state=1` ⇒ learning；`state=3` ⇒ learning（哪怕 lapses=0、间隔再长）；`state=0` ⇒ new；此外钉了"键到位分支只按 ms 数值读 `nextDue`"（`nextDue` 缺席或字符串 ⇒ learning，不沿用降级支的 `Date.parse`）。

**降级分支没动的反证**：`WordbookScreen.tsx:164-171` 与 `wordbook.ts:159-162` 与简报 §C-4 原文逐字一致（scoped patch 里这两段无任何 hunk）；spec 侧同文件既有的降级支断言（`:1161-1162`、C-11 点`已掌握`只剩 cloud、`masteredBadge` 三处、fixture 表全不带 `state`）在 469/469 全绿中原样通过。新 describe 里再补一组"同夹具去掉 `state` 逐条走降级支得同档"（`:1216-1219`）。

`MASTERED_LAPSE_CEILING` 两颗都留着（降级分支仍在用，两端 typecheck 0 错）。

## 4. 额度对账（实际 diff，来自 scoped patch；`count-lines.mjs` 用 `boundaries.mjs` 的 `parsePatch` 同语义计数）

| # | 文件 | 额度 | +增 | -删 | 合计 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | packages/server/src/routes/wordbook.ts | 24 | 8 | 2 | 10 | OK |
| 2 | packages/server/src/services/wordbook-service.ts | 36 | 0 | 0 | 0 | OK（未触碰） |
| 3 | packages/shared/src/contracts/wordbook.ts | 12 | 7 | 0 | 7 | OK |
| 4 | packages/shared/test/contracts.spec.ts | 12 | 12 | 0 | 12 | OK（**贴顶**，见 §8-D-2） |
| 5 | packages/server/test/integration/wordbook-progress-keys.spec.ts | 80 | 50 | 0 | 50 | OK |
| 6 | apps/app/src/data/queries/wordbook.ts | 24 | 9 | 1 | 10 | OK |
| 7 | apps/app/src/screens/WordbookScreen.tsx | 20 | 3 | 1 | 4 | OK |
| 8 | apps/web/src/lib/api/wordbook.ts | 20 | 3 | 1 | 4 | OK |
| 9 | apps/app/test/wordbook-screen.spec.tsx | 60 | 42 | 3 | 45 | OK |

无一颗撞顶后强行放宽；#4 恰好 12/12，是本轮唯一贴额度线的一颗（第一版 13 行，砍掉一行注释压回，未动 `maxDiffLinesFor`）。

## 5. 出口判据实测（全部亲跑；管道一律 `> log 2>&1; echo exit=$?`）

| # | 命令 | 基线 | 实测 | exit |
| --- | --- | --- | --- | --- |
| 1 | `pnpm --filter @tm/server test` | 21f/445p/0f/1s | **21 files / 446 passed / 1 skipped / 0 failed**（+1=判据⑥） | **0** |
| 2 | `pnpm --filter @tm/shared test` | 65p | **66 passed**（+1=单点哨） | **0** |
| 3 | `pnpm --filter @tm/app test` | 466p/18f | **18 files / 469 passed**（+3=件B 两条+件C 一条） | **0** |
| 4a | `pnpm --filter @tm/web typecheck` | 0 错 | 0 错 | **0** |
| 4b | `pnpm --filter @tm/server typecheck` | 0 错 | 首跑 2 红（新 spec 的 `noUncheckedIndexedAccess` 索引，属我本轮代码），修好后 0 错 | **0** |
| 4c | `pnpm --filter @tm/app typecheck` | 0 错 | 同上：首跑 1 红，修后 0 错 | **0** |
| 5 | `node tools/boundaries.mjs --check-ownership --task E4b3b --files "<8 颗>" --diff-file <patch>` | 无越界 | `触碰 8 个在册文件 → 无越界`（F-43 第二形态已核：NOTE 标签显 `A-85-E4b3`/`A-74-235` 首颗动作号，额度取的是 `maxDiffLinesFor["E4b3b"]`=12/12，与 §4 实数一致） | **0** |
| 6 | `node tools/boundaries.mjs --self-test` | 157/157 | **157/157 通过** | **0** |

- 全套跑出过 2 次（server/app 第一遍在 typecheck 修复前、第二遍为终态；shared 同理）。日志：`%TEMP%\e4b3b\scratch\{server,app,shared}-full*.log`、`tc-*.log`、`ownership*.log`、`selftest.log`。
- **偏差声明（出口5）**：`--files` 传的是 **8 颗**而非简报模板的 9 颗——第 2 项 `wordbook-service.ts` 实际 0 行未改，按 `bounded-edit` 通道"清单点名不构成授权也不构成违规、但点了名就要 patch 证据"的机检语义（boundaries.mjs `judgeBoundedEdit`），列入而 patch 无该文件段会**拒判 exit 1**（实测过这一次，`ownership.log` 留有 RED 行）。移除点名后无越界。这是遵守机检，不是绕闸。

## 6. 两证（A-77 #261 标准口径）

1. **sha256 复算**：`sha256sum -c %TEMP%\e4b3b\sha256-baseline.txt` → **exit 0，12/12 全 OK**（`sha256-verify.log`）：真库三颗 `data.db`/`data.db-shm`/`data.db-wal`、`packages/server/data.db` 占位、§B-1 三颗哨所在文件（`legacy-apk.spec.ts`、`wordbook-concurrency.spec.ts`）、`router.tsx`、`main.tsx`、`tools/ownership.json`、三份主文档。**全程只读成立（内容级）。**
2. **`find -newermt "2026-09-23T01:39:34+08:00"` 反查**（mtime 级，`find-newermt.log`）：`apps/ packages/ tools/` 下命中恰为 **9 颗** = §0 表里的 8 颗已登记改动文件 + `apps/web/tsconfig.tsbuildinfo`（出口判据 4a 的 tsc 增量缓存副产物，非手改，见 §8-D-3）；根目录 `data.db*` 与 `packages/server/data.db` **0 命中**（mtime 未动）；`.delivery/` 命中恰 1 颗 = 本报告。测试全程用 `os.tmpdir()` 下 `tm-e4b3-wb-progress-<pid>` 独立临时 sqlite（判据⑥ 复用既有装配，未新增库路径）。
3. 未以 `git status --porcelain` 充当证据（该命令对本仓大量既有未提交面确无分辨力）。

## 7. 没做的东西（不沉默清单）

- **Web 端 `stageOf` 没有新增单测面**：简报明示"Web 那颗没有单测面，改完在报告里贴改后原文与两端并排对照"——已照办（§3 表格）。未给 Web 新开测试文件（可写面里没有它，开面=越界）。
- **App 侧 `WordbookEntryDto` 类型没上收三键声明**：E4b3 已裁（`WordbookEntrySchema` 同是 push 输入面），本轮遵守红线 §B-3，读侧靠 `extraOf` 转型，未动契约 schema。
- **REST 带参分支没接缓存**：`readWithProgress()` 的注释明言"缓存层属下一轮"，本行为持同一口径，未擅自接 `restCache`。
- **`GET /api/wordbook/pull` 与 `snapshot()` 未动**：不在本表面。
- 除 §5 表格中已申报的一次拒判外，无其他未达项；出口判据 1–7 全部拿到要求的退出码。

## 8. 偏差与登记

- **D-1**：件A 未消费 `wordbook-service.ts` 的 36 行额度（方案收敛为路由层二选一，两颗 service 入口签名原样）。判据⑥ 因此直接对照 `svc.readWithProgress()` 现成函数，无须 opts 改造。
- **D-2**：`contracts.spec.ts` 贴顶 12/12。后续任何要往该文件再写的轮次需新额度。
- **D-3**：`apps/web/tsconfig.tsbuildinfo` 因跑 typecheck 出口判据而被刷新 mtime/内容——它是构建缓存不是源码，判据 4a 本身要求跑这条命令，两因果链在此处是**实测**（find 命中 + 该文件在 .gitignore 内的状态未核，仅登记盘面事实）。
- **D-4**（假说）：App 端 `queryKey`（`wordbookKeys.list()`）没有把参数编进缓存键。当前无同 key 不带参的写入方，判定无实际后果；若日后 Web/App 混用同一 key 不同参数，需要下轮处理。**未做验证，仅登记。**
