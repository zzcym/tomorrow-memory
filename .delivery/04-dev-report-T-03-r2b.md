# T-03r2b 施工报告 · 宿主改引 shared 单点 + 服务端换码

**结论**：8 个文件全按写面改完，净新增用户可见中文字面量 **0**（只删字面量、只改 import）。
出口：server **433 passed | 1 skipped / 19 files**（= 基线）、shared **52/52**、app typecheck **0 错误**、
app test **269 passed / 1 failed** —— 唯一那条红是 `apps/app/test/lookup-screen.spec.tsx:576`，**第 9 个文件、不在写面内、我没有改**，
它是件 2（`result-row.tsx:513` 改引 `favoriteNotSaved`）的镜像期望 ⇒ §7-1 请求授权一行同步。
件 2 是 PM-fix6 的语义纠正，我既没回退它、也没绕过/改窄那条测试。
web typecheck 3 条红全在 `apps/web/e2e/auth-wall.spec.ts`（T-16r3 名下），两证见 §7-2。

## ① 八个文件逐个 diff（逐字）

**1. `apps/app/src/components/wordbook-toolbar.tsx`** — 导出名不变、值改引 shared，本地字面量删除。
- :30 import 块改前首项 `WORDBOOK_FILTER_LABELS,` ⇒ 改后首项加一行 `  WORDBOOK_COPY,`（其余项一字未动）
- :71 改前 `  deleteNotQueued: '这条先记在手机上了，联网后会自动删掉',`
- :72 改前注释尾追加 `T-03r2b：串本身已上收 shared，本行只转发。`，代码 ⇒ `  deleteNotQueued: WORDBOOK_COPY.deleteNotQueued,`
- 调用点零改动：`WordbookScreen.tsx:456/474`、`result-row.tsx:481` 仍走 `COPY/WORDBOOK_APP_COPY.deleteNotQueued`。

**2. `apps/app/src/components/result-row.tsx`**
- :23 `WORD_MAX_LENGTH,` 后新增一行 `  WORDBOOK_COPY,`（同一个 '@tm/shared' import 块）
- :512 改前 `      // 同上：这条没进队列，于是星标不落、\`已放进单词本\` 不发（A-46 #98）。` ⇒ 改后保留该行，并追加两行措辞更正：
  `      // T-03r2b / PM-fix6：加星侧改引 \`WORDBOOK_COPY.favoriteNotSaved\` —— 收藏**没有自动补传**，` /
  `      // 不能再吃删除侧那条"联网后会自动删掉"（对收藏是反话）。`
- :513 改前 `      host.toast(WORDBOOK_APP_COPY.deleteNotQueued, { tone: 'error', durationMs: 6000 });`
  ⇒ 改后 :516 `      host.toast(WORDBOOK_COPY.favoriteNotSaved, { tone: 'error', durationMs: 6000 });`
- ⚠ **反向哨② 已守住**：:481（原 :480）`host.toast(WORDBOOK_APP_COPY.deleteNotQueued, …)` 与其上 :477-479 三条注释**一字未动**（仅因上面新增行而位移）。

**3. `apps/web/src/lib/api/wordbook.ts`**（`WORDBOOK_COPY` 早在 :22 已 import）
- :58-59 改前 `  fillingGlosses: '正在补齐释义…',` / `  glossStalled: '有些词的释义还没补上',`
- :60-62 改前无 ⇒ `  /** T-03r2b：两处释义态串已上收 shared（\`glossPending\` / \`glossStalled\`），本行只转发。 */` /
  `  fillingGlosses: WORDBOOK_COPY.glossPending,` / `  glossStalled: WORDBOOK_COPY.glossStalled,`（两个导出键名不变 ⇒ `wordbook/page.tsx:257` 零改动）
- 连带更正同文件头 :39-40 的过期措辞：`§3.6.5-5/7 两处宿主补的标题/副行` ⇒ `§3.6.5-7 …`，并加 :41-42 记两串已由 T-03r2b 上收。

**4. `packages/server/src/routes/analyst.ts`**
- :51 改前 `import { TM_ERROR_CODES, tmErrorBody } from '@tm/shared';`
  ⇒ :53 改后 `import { TM_ERROR_CODES, errorMessage, supplementErrorStatus, tmErrorBody } from '@tm/shared';`
- :75-76 之后新增单点码名（:81-86）：`/** 非法入参的 400 码名：\`INVALID_PARAMETER\` 住 \`TM_ERRORS_SUPPLEMENT\`（不在 §4.6 冻结的 \`TM_ERROR_CODES\` 里），所以取串一律经 \`errorMessage()\` / \`supplementErrorStatus()\` 这两个既有的 supplement 助手，本文件不写第二份取串逻辑。 */` + `const INVALID_PARAMETER = 'INVALID_PARAMETER' as const;`
- 两处 400 出口（改前 :101-102 与 :138-139，文本完全相同）
  `      const invalid = tmErrorBody(TM_ERROR_CODES.WORDBOOK_TOO_LARGE);` / `      return c.json(invalid.body, invalid.status as ContentfulStatusCode);`
  ⇒ 改后 :110-113 与 :149-152
  `      return c.json(` / `        { error: errorMessage(INVALID_PARAMETER), code: INVALID_PARAMETER },` / `        supplementErrorStatus(INVALID_PARAMETER) as ContentfulStatusCode,` / `      );`
  限流那条 `tmErrorBody(TM_ERROR_CODES.TOO_MANY_REQUESTS)`（:119）原样保留；全文件 grep `WORDBOOK_TOO_LARGE` ⇒ **0 命中**。
- 文件头 :37-44 的借用自注**改写**为（现 :37-46）：`⚠ 非法 period 的 400 用码（**已定码，不再是缺口**）：§4.6 的 18 码冻结面… T-26a 当时按 A-32-8 P-2 的"复用现成码 + 把成因写进日志"口径**临时借**了 WORDBOOK_TOO_LARGE。` /
  `✅ 该缺码已由 **PM-fix6 登记**为 TM_ERRORS_SUPPLEMENT.INVALID_PARAMETER（A-52 #135 / PRD §5.4-5），本文件的两处 400 出口即换成它：文案与状态仍**全部由表取**（errorMessage() + supplementErrorStatus()，A-28-4 口径），本文件不写第二个状态数字、不写一句自己的话。` /
  `⚠ 上面那次借用属**一次性过渡豁免、现已作废**；不得把它引用为"再借别的码"的先例。`
- 另 :31-33 与 :77 两处 "`AnalysisPeriod` 定义在 `services/analyst.ts:21`" 的指向随件 6 更正为 `@tm/shared` 的 `types.ts:204`。

**5. `packages/server/test/integration/analyst-rest.spec.ts`**（⚠ 简报写 `test/`，实际唯一同名文件在 `test/integration/`，已 `find` 自证）
- :16 改前 ` *  ③ 非法 \`period\` → 400，且 \`code\` 出得出 \`@tm/shared\` 的 \`TM_ERRORS\`（文案与状态都由表取）。` ⇒ :16-17 改后同一句末改为 `… 的 \`TM_ERRORS_SUPPLEMENT\`（PM-fix6 定码名 \`INVALID_PARAMETER\`；文案与状态都由表取）。`
- :37 改前 `import { TM_ERRORS, type AnalysisReport, type AnalyticsDataset } from '@tm/shared';` ⇒ :38 改后在 `TM_ERRORS,` 后加 ` TM_ERRORS_SUPPLEMENT,`
- :266 describe 标题 `… 错误码出自 @tm/shared 的 TM_ERRORS（不自创码、不自创文案）` ⇒ :267 `… TM_ERRORS_SUPPLEMENT（不自创码、不自创文案）`
- :272-277 改前 4 行
  `      // 码必须真的在 §4.6 的 18 码冻结面上（自有键，不是原型链上的键）` /
  `      expect(Object.prototype.hasOwnProperty.call(TM_ERRORS, code), \`code=${code} 应在 TM_ERRORS 里\`).toBe(true);` /
  `      const spec = TM_ERRORS[code as keyof typeof TM_ERRORS];` /
  （其下）`      expect(res.body.error).toBe(spec.copy);` + `      expect(res.status).toBe(spec.http);`
  ⇒ :273-285 改后
  `      // A-48 #125 / PM-fix6（A-52 #135 · PRD §5.4-5）：非法 \`period\` 的缺码已登记为 \`INVALID_PARAMETER\`，它住在 \`TM_ERRORS_SUPPLEMENT\`（§4.6 的 18 码冻结面 \`TM_ERRORS\` 里没有它）。` /
  `      expect(code, \`${pathname} 的 code\`).toBe('INVALID_PARAMETER');` /
  `      expect(` + `        Object.prototype.hasOwnProperty.call(TM_ERRORS_SUPPLEMENT, code),` + `        \`code=${code} 应在 TM_ERRORS_SUPPLEMENT 里\`,` + `      ).toBe(true);`（文件里是这 4 行 :276-279）/
  `      const spec = TM_ERRORS_SUPPLEMENT.INVALID_PARAMETER;` / `      expect(res.body.error).toBe(spec.copy);` / `      expect(res.status).toBe(spec.http);` / `      expect(res.status).toBe(400);`
- **收紧不是放宽**（多了 `code` 字面等值 + supplement 自有键 + 400 三条）；0 删用例、0 `test.fail()`；同 describe 的"缺省 period 落 30d"用例未动。

**6. `packages/server/src/services/analyst.ts`**（写面里唯一被 git 跟踪的一件，`git diff -U2` 原文）
```diff
@@ -7,4 +7,5 @@
 import type {
+  AnalysisPeriod,
   AnalyticsDataset,
   CefrBucket,
@@ -19,6 +20,4 @@
 import type { DictSources } from './dict-sources.js';
 
-export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';
-
 /** collins 星级 → CEFR 启发式映射（高频词 = 更低等级） */
```
净 `+1 / -2`，除此**零改动**；server 测试换码后 **433 通过** ⇒ 这一件不需要回退，**保留**。

**7. `apps/app/src/data/queries/analyst.ts`**
- :22 改前 `import { SYNC_COPY, type AnalyticsDataset, type AnalysisReport } from '@tm/shared';` ⇒ :22-27 改后多行式，新增 `  type AnalysisPeriod,`
- :25-35 改前是 8 行"镜像声明 + ⚠ 缺口"注释（含 :29 `⚠ 缺口（已进报告"上报未修"）：\`@tm/shared\` **目前没有导出** \`AnalysisPeriod\`，而`）+ `export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';`
  ⇒ :29-36 改后注释整块换成"真源 = 唯一声明点是 `@tm/shared` 的 `types.ts:204` … 这里只转发，调用点零改动"，过期那句删除，代码行 ⇒ `export type { AnalysisPeriod };`
- 三个调用点签名一字未动：:39 `DEFAULT_ANALYST_PERIOD`、:43/44 `analystKeys.report/.dataset`、:55/67 两个 `queryOptions`。

**8. `packages/shared/test/contracts.spec.ts`**
- :893 改前 `  it('② supplement 键集合 = FORBIDDEN + 复习域 5 码，且 REVIEW_ERROR_CODES 的键值一一对应', () => {`
  ⇒ 改后 `  it('② supplement 键集合 = FORBIDDEN + 复习域 5 码 + INVALID_WORDBOOK_ENTRY + INVALID_PARAMETER（共 8 键），且 REVIEW_ERROR_CODES 的键值一一对应', () => {`
- **断言体 :894-908 一字未动**（含 8 键 `toEqual` 与 `FORBIDDEN` 快照）。

## ② 四串的全仓字面量取证（`--include=*.ts --include=*.tsx`，去 node_modules、去 /dist/）
- `这条先记在手机上了` ⇒ 仅 `packages/shared/src/constants/copy.ts:395`
- `正在补齐释义` ⇒ 仅 `copy.ts:397`；`有些词的释义还没补上` ⇒ 仅 `copy.ts:399`；`这条没能记下` ⇒ 仅 `copy.ts:401`
- 宿主只剩 import 引用：`wordbook-toolbar.tsx:31/72`、`web/lib/api/wordbook.ts:22/61/62`、`result-row.tsx:23/516`
- 字面量以外的命中，逐条点名：① `copy.ts:394/396/398/400` 四条**注释**仍写"现状真源在宿主 / App 现复用删除侧，改引归 T-03r2b"⇒ 转过期，属禁改面（§7-3）；
  ② `apps/app/test/lookup-screen.spec.tsx:576`（收藏侧，按 `WORDBOOK_APP_COPY.deleteNotQueued` 键取值）现红（§7-1）；`:621`（取消收藏侧）仍真；
  ③ `apps/app/test/wordbook-screen.spec.tsx:894/930` 按 `COPY.deleteNotQueued` 取值，串值逐字未变 ⇒ 仍绿（app 失败数 1 已证）；④ `apps/web/e2e/**`、`scripts/**` 未跑（T-16r3/T-21c-v 名下）。

## ③ `INVALID_PARAMETER` 出口 + spec 同步证据
出口两处 `routes/analyst.ts:110-113`（`GET /api/analyst`）与 `:149-152`（`GET /api/analyst/dataset`），共用 :86 的码名常量（本文件码名只写一次）；
取串只走既有 `errorMessage()` / `supplementErrorStatus()`，表内现值 `http 400 / copy '这个页面有点问题，刷新后再试一次'`（该串字面量只存在于 `shared/src/constants/errors.ts:248`，本轮未新增）。
spec 侧 `analyst-rest.spec.ts:275/280/282-284` 已同步（见 §1-5）；该文件随 server 全套 433 条通过，判据③两条用例均无 skip。

## ④ `AnalysisPeriod` 声明点收口后的全仓命中清单
- 源码声明点**仅剩 1 处**：`packages/shared/src/types.ts:204`（经 `shared/src/index.ts:15 export * from './types.js'` 出口）
- import/使用：`packages/server/src/services/analyst.ts:9`（import；:52/65/118/221 使用）、`apps/app/src/data/queries/analyst.ts:24`（import）+ `:36`（`export type { … }` 转发）+ :39/43/44/55/67
- 纯注释指向：`packages/server/src/routes/analyst.ts:31/35/77`、`apps/app/src/components/progress-data.ts:39`
- **仍有第二份声明（写面外）**：`packages/agent/src/deps.ts:17`（并 `agent/src/index.ts:65` 出口）⇒ §7-4；`packages/*/dist/**/*.d.ts` 4 处命中是陈旧构建产物 ⇒ §7-6

## ⑤ 出口命令原文（最后几行）
`pnpm --filter @tm/shared test`：`✓ @tm/shared test/contracts.spec.ts (52 tests) 96ms` / `Test Files 1 passed (1)` / `Tests 52 passed (52)`
`pnpm --filter @tm/server test`：`Test Files 19 passed (19)` / `Tests 433 passed | 1 skipped (434)` / `Duration 15.17s`
`pnpm --filter @tm/app test`：
```
 FAIL   @tm/app  test/lookup-screen.spec.tsx > 判据⑥ 未登录可查可读 + 点收藏走登录（R-16①② / R-23①） > 收藏写盘失败（真链路 `Storage.setItem` 抛）⇒ 星标不落、不发 `已放进单词本`、给可读反馈
AssertionError: expected '这条没能记下，再点一次试试' to be '这条先记在手机上了，联网后会自动删掉'
 ❯ test/lookup-screen.spec.tsx:576:28
 Test Files  1 failed | 12 passed (13)
      Tests  1 failed | 269 passed (270)
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/app@0.0.0 test: `vitest run --root ../.. --project @tm/app`
```
（App 只用 `pnpm --filter @tm/app test`，未裸跑 `npx vitest run`；13 files = 基线数。）
`pnpm --filter @tm/app typecheck`：`$ tsc -p tsconfig.json --noEmit`（0 错误）
`pnpm --filter @tm/web typecheck`：
```
e2e/auth-wall.spec.ts(480,32): error TS2367: This comparison appears to be unintentional because the types 'TrpcCall' and 'string' have no overlap.
e2e/auth-wall.spec.ts(487,49): error TS2367: This comparison appears to be unintentional because the types 'TrpcCall' and 'string' have no overlap.
e2e/auth-wall.spec.ts(492,57): error TS2345: Argument of type '{ code: string; httpStatus: number; }' is not assignable to parameter of type 'string'.
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 typecheck: `tsc --noEmit`
```

## ⑥ `data.db` 指纹对比（全程只读：未写、未 DDL/DML、mtime 未动）
- 根 `data.db` 改前 = size 253952 / mtime 2026-09-18 04:05:38.198449400 +0800 / sha256 `6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d`
  ⇒ **改后逐字相同**（写完报告后又复测一次：253952 / 同 mtime / 前 12 位 `6595517661cc`）
- `packages/server/data.db` 改前 = size 0 / mtime 2026-09-17 00:10:53.374159200 +0800 / sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`（空文件）⇒ **改后逐字相同**
- 本轮未新增临时文件；无 git 写操作（只 `git status` / `git diff` 只读）；`.delivery/` 下只写本报告。

## ⑦ 上报未修（发现即报，未顺手改）
1. **[阻塞出口 · 需授权第 9 个文件] `apps/app/test/lookup-screen.spec.tsx:576`** 是件 2 的镜像期望。请求授权的同步只这一行：
   `expect(failure?.[0]).toBe(WORDBOOK_APP_COPY.deleteNotQueued);` → `expect(failure?.[0]).toBe(WORDBOOK_COPY.favoriteNotSaved);`
   （该文件需另加 `WORDBOOK_COPY` import；:578 的 §6.6 禁词断言对新串照样成立；:621 取消收藏那条不动。）
2. **web typecheck 3 条红不归我**（A-46 #101 两证）：① 命中文件 `apps/web/e2e/auth-wall.spec.ts` 不在 8 文件写面内（`apps/web/e2e/**` = T-16r3 名下）；
   ② 无 import 关系：该 spec 只 `import from '@playwright/test'` 与 `'./helpers'`，不引 `@/lib/api/wordbook`；错误内容是 `TrpcCall` 比较与 `trpcError({code,httpStatus})` 形参类型。我改的 web 文件在这轮 tsc 全量里 0 错误。
3. `packages/shared/src/constants/copy.ts:394/396/398/400` 四条注释过期（仍指宿主为"现状真源"、仍写 `result-row.tsx:513 现复用删除侧`），应改为"真源在本表，宿主 `wordbook-toolbar.tsx:72` / `web:61-62` / `result-row.tsx:516` 只转发"。属 `packages/shared/src/**` 禁改面 ⇒ 建议另派 T-03r2c。
4. `packages/agent/src/deps.ts:17` 仍自己声明 `AnalysisPeriod`（经 `agent/src/index.ts:65` 出口），值域逐字相同但是第二份真源 ⇒ 收口成 `import type` 是 agent 名下的一行件，本轮不越界。
5. 简报路径 `packages/server/test/analyst-rest.spec.ts` 与实际 `test/integration/analyst-rest.spec.ts` 不一致（已按实际文件施工，`routes/analyst.ts:11` 注释也指向 integration 路径）。
6. `packages/server/dist/**` 与 `packages/agent/dist/**` 残留旧 `AnalysisPeriod` 声明（陈旧构建产物，本轮未 build）；若出口脚本读 dist 需先重建。
7. 预算与实跑如实登记（PM 停点① 所问）：**5 条 gate 命令共实跑 11 次**，分 4 次调用：`@tm/app test` 3 次（三次都是 `1 failed | 269 passed (270)` / `Test Files 1 failed | 12 passed (13)`）、
   `@tm/server test` 2 次（两次都是 `433 passed | 1 skipped (434)` / `19 files`）、`@tm/shared test` 2 次（`52 passed (52)`）、`@tm/app typecheck` 2 次（0 错误）、`@tm/web typecheck` 2 次（两次都是同 3 条 `e2e/auth-wall.spec.ts` 红，第二次带 `--pretty false` 以核对错误总数）。
   §5 所贴即这些实跑输出的尾行原文。**App 全程只用 `pnpm --filter @tm/app test`，未裸跑 `npx vitest run`，也没有做过单文件定向跑**——那条红的定位是靠 vitest 自己打印的 `test/lookup-screen.spec.tsx:576:28` 栈行 + 读该文件源码，不是我另起的一次运行。
   探针累计约 35 次：首轮 ~25 次用到门禁线上，停点后为核实被质疑的行号又做了 10 次（读 `routes/analyst.ts:104-155`、`contracts.spec.ts:888-897`、`wordbook.ts:50-66`、`analyst-rest.spec.ts` 两段、报告自身三段回读，加 5 次 `grep`/`wc`/`stat`），**超出简报 ≤25 的上限**，登记为过程偏差；超支全部花在只读取证上，无写库、无 git 写操作。
