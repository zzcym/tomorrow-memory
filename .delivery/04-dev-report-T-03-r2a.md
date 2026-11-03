# T-03r2a 施工报告（批次4 · shared 唯一声明点定稿文案四颗 + 一条码 + 一个类型）

任务号 T-03r2a。改动面：`packages/shared/` 内 4 个文件（3 个源 + 1 个 spec 钉，spec 那一条由任务书 §2 明令"按只增同步"）。宿主 `apps/**` 与 `packages/server/**` 本轮零改动。

---

## ① diff 逐字

### 1) `packages/shared/src/constants/copy.ts` —— `WORDBOOK_COPY` 内追加四颗（原 :336 起，现 :393-401 处收口）

文件是 untracked 状态（`packages/shared/src/constants/` 整目录未进 git 索引），故不给 `git diff`，给**改后原文**（插入点在既有 `alreadyAdded`（:393）之后、`} as const;` 之前）：

```ts
   alreadyAdded: '该单词已在单词本中',            // :393 既有，未动
+  /** §3.6.5 第 7 行（`03-ui-spec.md:846`）删除写失败（离线）· A-48 #114 缺 key 补齐。现状唯一真源在 App `apps/app/src/components/wordbook-toolbar.tsx:71`，宿主改引归 T-03r2b（本轮不动宿主）。 */
+  deleteNotQueued: '这条先记在手机上了，联网后会自动删掉',
+  /** §3.6.5 第 5 行（`03-ui-spec.md:844`）释义批量补齐中·起手一次性小字 · A-48 #114 缺 key 补齐。现状只活在 Web `apps/web/src/lib/api/wordbook.ts:58`（键名 `fillingGlosses`），宿主改引归 T-03r2b。 */
+  glossPending: '正在补齐释义…',
+  /** §3.6.5 第 5 行（`03-ui-spec.md:844`）释义批量补齐中·超 5s 改口态 · A-48 #114 缺 key 补齐。现状只活在 Web `apps/web/src/lib/api/wordbook.ts:59`（同名），宿主改引归 T-03r2b。 */
+  glossStalled: '有些词的释义还没补上',
+  /** §3.6.5 第 8 行（`03-ui-spec.md:847`）加星写失败（离线）· PM-fix6 定稿 / A-52 #135 戳表。⚠ 收藏侧**没有自动补传**，本串不得含任何"会自动…"式承诺；App `apps/app/src/components/result-row.tsx:513` 现复用删除侧 `deleteNotQueued`（会说出"会自动删掉"的反话），改引本串归 T-03r2b。 */
+  favoriteNotSaved: '这条没能记下，再点一次试试',
   } as const;
```

值与任务书四条逐字一致（含 `…` 省略号、逗号全角、无句号收尾）；`deleteNotQueued` 与 `wordbook-toolbar.tsx:71` 现值、`glossPending`/`glossStalled` 与 `apps/web/src/lib/api/wordbook.ts:58-59` 现值均逐字相同（机检见下）。未新增第五颗、未新增第二个文件。

出处旁证（只读行号 ±5，未通读）：
- `03-ui-spec.md:844` = §3.6.5 第 5 行「释义批量补齐中」→ `工具条下方一次性小字 正在补齐释义…（≤5s 后若仍未完成改 有些词的释义还没补上）`；
- `03-ui-spec.md:846` = 第 7 行「删除写失败（离线）」→ `这条先记在手机上了，联网后会自动删掉`（**不出现"云端/本地"**）；
- `03-ui-spec.md:847` = 第 8 行「加星写失败（离线）」→ `这条没能记下，再点一次试试`（PM-fix6 定稿 · A-52；**不得**写成任何"会自动…"式承诺；可重试列 = 手动、**无自动补传**）。

宿主现值机检（grep 全 `apps/`）：
```
apps\app\src\components\wordbook-toolbar.tsx:71:  deleteNotQueued: '这条先记在手机上了，联网后会自动删掉',
apps\web\src\lib\api\wordbook.ts:58:  fillingGlosses: '正在补齐释义…',
apps\web\src\lib\api\wordbook.ts:59:  glossStalled: '有些词的释义还没补上',
```
`这条没能记下` 在 `apps/` 下 grep 0 命中 ⇒ `result-row.tsx:513` 确为复用删除侧，本轮只登记、不改引。

### 2) `packages/shared/src/constants/errors.ts` —— `TM_ERRORS_SUPPLEMENT`（:215）内纯追加一条（现 :239-250）

```ts
   INVALID_WORDBOOK_ENTRY: { ... },                              // :234-238 既有，未动
+  /**
+   * A-48 #125 的缺码回环（PM-fix6 定码名与文案 · A-52 #135）：非法 `period` 等**通用入参非法**
+   * 在 §4.6 的 18 码里没有对应码，服务端此前借用别的域的文案回 400（语义错位）。本条即该缺码的
+   * 登记落点，做法与 A-28-4 / A-32-8 同一口径：纯追加进本表，`TM_ERROR_CODES` / `TM_ERROR_ROWS` /
+   * `TM_ERRORS` 三个冻结集合一字未动（A-8）。服务端把该 400 出口换成 `errorMessage()` 属后续动作，
+   * 本轮只登记契约，不改 `packages/server/**`。
+   */
+  INVALID_PARAMETER: {
+    http: 400,
+    copy: '这个页面有点问题，刷新后再试一次',
+    from: 'PM-fix6 / T-26a 缺码回环（A-52 #135 / PRD §5.4-5）',
+  },
 } as const;
```

三个冻结集合 `TM_ERROR_CODES`(:20) / `TM_ERRORS`(:79) / `TM_ERROR_ROWS`(:47) 一字未动；机检由 `contracts.spec.ts:881-891` 的 ① 承担（断言 18 码 / 18 码 / 16 行长度并 `not.toHaveProperty`），本轮 52 tests 全绿即证明未扩写快照面。

`packages/shared/test/contracts.spec.ts` 同步的那**一条**期望（:895，纯追加数组元素，基线未重排、无新基线文件）：
```diff
-      [...SUPPLEMENT_REVIEW_CODES, 'FORBIDDEN', 'INVALID_WORDBOOK_ENTRY'].sort(),
+      [...SUPPLEMENT_REVIEW_CODES, 'FORBIDDEN', 'INVALID_WORDBOOK_ENTRY', 'INVALID_PARAMETER'].sort(),
```

### 3) `packages/shared/src/types.ts` —— `AnalysisPeriod` 唯一声明点（紧邻 `AnalystInsight`，现 :198-204）

```ts
 /** LLM 洞察 */
 export interface AnalystInsight { ... }        // 既有，未动
+/**
+ * 学情分析周期（本类型的**唯一声明点**）。
+ * 真源原在 `packages/server/src/services/analyst.ts:21`（本轮**不改** `packages/server/**`，那里的同域
+ * 声明与 REST 面 `routes/analyst.ts` 的 `PeriodQuerySchema` 保持原样）；上收 shared 只为消掉 App 侧的
+ * 镜像声明 —— `apps/app/src/data/queries/analyst.ts` 里 T-26b 留的过渡件，下一轮 T-03r2b 换成 `import type`。
+ */
+export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';
```

值域逐字 `'7d' | '30d' | '90d' | 'all'`，不增不减（与 `packages/server/src/services/analyst.ts:21` 的 `export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';` 现值逐字相同）。`src/index.ts:15` 已是 `export * from './types.js'` ⇒ 无需改 barrel 即从包入口导出。`grep -n AnalysisPeriod packages/shared/src` 现命中 `types.ts:204` 一处（shared 内无第二声明点）。

---

## ② 禁词自检（机检，非目测）

机检样本落在系统 temp（**非仓库内**）：`C:\Users\曹怡明\AppData\Local\Temp\t03r2a_values.txt`（Git Bash 路径 `/tmp/t03r2a_values.txt`）。生成命令（TPM 可直接复跑）与文件内容：
```
$ cd packages/shared && grep -nE "^  (deleteNotQueued|glossPending|glossStalled|favoriteNotSaved): |^    copy: '这个页面有点问题" \
    src/constants/copy.ts src/constants/errors.ts > /tmp/t03r2a_values.txt
```
```
src/constants/copy.ts:395:  deleteNotQueued: '这条先记在手机上了，联网后会自动删掉',
src/constants/copy.ts:397:  glossPending: '正在补齐释义…',
src/constants/copy.ts:399:  glossStalled: '有些词的释义还没补上',
src/constants/copy.ts:401:  favoriteNotSaved: '这条没能记下，再点一次试试',
src/constants/errors.ts:248:    copy: '这个页面有点问题，刷新后再试一次',
```

1. 任务书八字段（`云端|本地|缓存|参数|接口|HTTP|token|数据源`）+ UI §8.2 表第 12 行机器话兜底串（`暂无数据|加载失败|请求失败|No data|undefined|NaN|[object Object]`）：`grep -c` = **0 命中**。
2. UI §8.2 表第 11 行凭据类禁语 15 项（出处列 = §6.6 后半 + PRD §8.3-D-20；`以后再说|稍后再改|下次提醒|宽限期|截止日期|passwordUpgradeDeadline|忘记密码|找回密码|本期无法找回|请用其他手机号注册|用验证码登录|旧进度无法迁移|联系管理员|重新注册|换手机号`）：`grep -c` = **0 命中**。
3. "会自动…"式承诺：仅对 `favoriteNotSaved` 行 `grep -c "会自动"` = **0**（删除侧 `deleteNotQueued` 的"会自动删掉"是 §3.6.5 第 7 行定稿原文，且该情形可重试列 = 自动补传，属应有承诺，不在本条约束内）。

附注（诚实边界）：对整份 `copy.ts` 跑同一禁词正则会有 2 处命中（`:102`、`:620`），均在既有注释里出现 `token` 一词，属既有内容，非本轮引入；故上面的机检口径限定为"新串取值行"。

---

## ③ `data.db` 改前 / 改后指纹对比（预期完全一致 —— 本轮未接触）

| 文件 | 改前 size / mtime | 改前 md5 前 12 | 改后 size / mtime | 改后 md5 前 12 |
|---|---|---|---|---|
| `E:\CC\tomorrow-memory\data.db` | 253952 / Sep 18 04:05 | `a6763d4a0065` | 253952 / Sep 18 04:05 | `a6763d4a0065` |
| `E:\CC\tomorrow-memory\packages\server\data.db` | 0 / Sep 17 00:10 | `d41d8cd98f00` | 0 / Sep 17 00:10 | `d41d8cd98f00` |

全量 md5 亦一致：`a6763d4a0065759e44a5c07ef9d1d9b9`、`d41d8cd98f00b204e9800998ecf8427e`（空文件 MD5）。未跑任何写库/DDL/DML 命令。

---

## ④ 出口命令原文（各 1 次，共 2 次；报告写 PASS 前已自跑）

`pnpm --filter @tm/shared test`（尾部）：
```
$ vitest run --root ../.. --project @tm/shared
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/shared  test/contracts.spec.ts (52 tests) 98ms

 Test Files  1 passed (1)
      Tests  52 passed (52)
   Start at  01:59:07
   Duration  1.25s (transform 232ms, setup 0ms, collect 733ms, tests 98ms, environment 0ms, prepare 173ms)
```

`pnpm --filter @tm/shared typecheck`（原文全量，命令后无任何诊断输出；同一行的 `&& ls` 得以执行 ⇒ 退出码 0）：
```
packages/shared typecheck:
$ tsc -p tsconfig.json --noEmit
packages/shared/src:      ← 以下为紧随其后的 `ls packages/shared/src packages/shared/test` 输出
constants/
copy.ts
index.ts
...
packages/shared/test:
__snapshots__/
contracts.spec.ts
```

两命令 **0 红**。结论：T-03r2a 出口 PASS（待 TPM 复跑确认）。

---

## ⑤ 上报未修项（发现即登记，本轮顺手零改动）

1. **`contracts.spec.ts:893` 的 it 标题已与实际不符**：标题写「supplement 键集合 = FORBIDDEN + 复习域 5 码」，实际键集合现已是 FORBIDDEN + 复习域 5 码 + `INVALID_WORDBOOK_ENTRY` + `INVALID_PARAMETER`（8 键）。我只按任务书"只增"改了 :895 的数组，**未改标题字符串**（改标题属重排账面，越权）。建议下一轮顺带把标题补成实际集合。
2. **`packages/server/src/services/analyst.ts:21` 与 shared 现为两份 `AnalysisPeriod` 声明**：本轮任务书面禁止改 server，故漂移风险仍在；r2b 之后建议 server 侧改为 `import type { AnalysisPeriod } from '@tm/shared'`，并核 `routes/analyst.ts` 的 `PeriodQuerySchema = z.enum([...])` 是否也随上收（值域三处一致是这条的真正判据）。
3. **`apps/app/src/data/queries/analyst.ts` 的过渡镜像声明自陈缺口**（:29 注释「`@tm/shared` 目前没有导出 `AnalysisPeriod`」）：该句现已过期，r2b 换 `import type` 时应连带删注释，否则账面留下反话。
4. **`packages/shared/src/constants/copy.ts:102/:620` 注释含 `token` 字面**：若哪天门禁把 §6.6 禁词机检从"取值行"扩到"整文件含注释"，这两行会红。属既有件，登记不动。
5. **仓库整体 `git status` 极脏**（`packages/shared/src/constants/`、`test/`、`apps/app/` 等均为 untracked；`.delivery/` 亦 untracked），导致我的三处源改动中只有 `types.ts` 出现在 `git diff`，另两处只能给"改后原文 + 插入点"作账面。这不是本轮缺陷，但会让后续任何"以 git diff 为准"的复核对 `constants/*` 失效，建议 TPM 决定是否先做一次索引基线。
6. **`vitest` 的 workspace file 弃用告警**（`DEPRECATED The workspace file is deprecated...`）：不影响退出码，属工具链噪声，登记备查。
