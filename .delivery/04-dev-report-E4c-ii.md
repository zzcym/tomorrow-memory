# 交付报告 · E4c-ii（A-94 三件：件① AnalysisPeriod 单点化 / 件② @tm/agent 补真测 / 件③ MeScreen 五处过期注释）

- 任务号：**E4c-ii**｜仓库根：`E:\CC\tomorrow-memory`｜分支未动（⛔ 全程零 git 写操作，只用 `git status`/`diff` 级别只读，且本轮实际未需要）
- 开工时刻（实测时钟）：`2026-09-23 05:34:20`　收工时刻：`2026-09-23 05:54:13`（终轮验证 + `sha256sum -c` + `find -newermt` 的取样时刻）
- 结论：**三件全部落地，6 条验证全绿，越界闸 exit 0「无越界」，两证全 OK。**

## 0. 触碰清单（与 `--files` 逐项一致）

| # | 文件 | 件 | scoped patch 实测幅度 | 授权额度 | 判定 |
|---|---|---|---|---|---|
| 1 | `packages/agent/src/deps.ts` | ① | `+6 / -1` = **7** 行 | ≤ 8 | ✅ |
| 2 | `packages/agent/test/assessment.spec.ts` | ②（新建） | `+176 / -0` | ≤ 200 | ✅ |
| 3 | `packages/agent/test/fsrs.spec.ts` | ②（新建） | `+175 / -0` | ≤ 200 | ✅ |
| 4 | `packages/agent/test/orchestrator-intent.spec.ts` | ②（新建） | `+102 / -0` | ≤ 200 | ✅ |
| 5 | `apps/app/src/screens/MeScreen.tsx` | ③ | `+14 / -13` = **27** 行 | ≤ 40 | ✅（0 条代码行；`+` 侧 14 条逐条注释起始，`-` 侧 1 条是旧裸块注释正文 ⇒ 见 §3.0） |
| 6 | `.delivery/04-dev-report-E4c-ii.md` | 本报告 | — | — | 闸内 NOTE：`no-entry，不阻断` |

- 件② 共 **3 颗** spec（额度 ≤4），全部落在 `packages/agent/test/`，未新建任何 config，未碰 `vitest.workspace.ts`。
- ⚠ 只读 `git status --porcelain`（收工 `2026-09-23 05:56:12`）另显示 `M packages/agent/package.json`、`M packages/agent/src/threaded.ts`、`M packages/agent/tsconfig.json` 三颗 —— 这三颗**不是本轮改动**：§5.2 的 `find -newermt "2026-09-23 05:34:20"` 写入清单里没有它们，且 `packages/agent/package.json` 在开工锚点里 `sha256sum -c` = **OK**（与 TPM 登记的现值同）。它们是前几轮留下的工作区状态，正是"A-94 要求证据形式为 agent 自证 scoped patch、⛔ 不收 HEAD 相对 diff"的原因。
- scoped patch：`C:\Users\曹怡明\AppData\Local/Temp/e4c2-ii/e4c2-ii.scoped.patch`（551 行，5 个文件段，只含授权面）。
- 探针脚本（非仓库文件，全部写在系统临时目录，仓库内 0 残留）：`Temp/e4c2-ii/probe1.mjs`（fsrs）、`probe2.mjs`（assessment + orchestrator）、`probe3.mjs`（orchestrator 边界补测）。它们只 `import` 被测源文件读真实返回值，**不写任何仓库文件**。

## 1. 件① —— `packages/agent/src/deps.ts` 的 `AnalysisPeriod` 收成单点

盘面核对与 TPM 给的事实一致：唯一声明点 `packages/shared/src/types.ts:204`，agent 侧第二份在 `deps.ts:17`，值域逐字相同；再导出点 `packages/agent/src/index.ts:64-71`（`export type { … AnalysisPeriod, … } from './deps.js'`）本轮**一字未动**，消费点无感。前例形状照 `apps/app/src/data/queries/analyst.ts:22-36`（T-03r2b）。`@tm/shared` 已是 `packages/agent/package.json` 的 dependency，未装任何东西。

改动原文（`diff -u before/deps.ts deps.ts` 全量，`+6 / -1` = 7 行 ≤ 8）：

```diff
--- a/packages/agent/src/deps.ts
+++ b/packages/agent/src/deps.ts
@@ -6,6 +6,7 @@
  */
 
 import type {
+  AnalysisPeriod,
   AnalyticsDataset,
   CefrLevel,
   FsrsCardRow,
@@ -14,7 +15,11 @@
 } from '@tm/shared';
 import type { LookupResponse } from './types.js';
 
-export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';
+/**
+ * 分析周期。**唯一声明点** = `@tm/shared` 的 `types.ts:204`（两侧值域逐字相同 ⇒ 零语义漂移）。
+ * 本模块只转发，`index.ts` 的再导出面一字不动，消费点无感。
+ */
+export type { AnalysisPeriod };
 
 /** 学情分析端口（server 的 AnalystService 实现；ClickHouse 优先，DB 降级） */
 export interface AnalystPort {
```

- 注释块 **3 行**（`/**` + 2 正文 + `*/` 共 4 物理行，正文陈述 2 行 ≤ 5 行要求），import 列表项 1 行，转发 1 行，删自声明 1 行。
- `wc -l` 前后：`packages/agent/src/deps.ts` **58 → 63**（实测时钟 `2026-09-23 05:34:55`，改后立即 `diff`）。
- 全仓 `AnalysisPeriod` 的声明点复核：`grep -n "type AnalysisPeriod =" packages/agent/src/**` → 现 0 命中（改前 1 命中在 `:17`）。
- 回归意义：shared 侧将来加一档（例如 `'today'`）时，agent 这颗不再需要跟着改第二遍，漏改即编译红的单点保证成立。
### 2.0 装配与硬判据自查

- 装配点：`vitest.workspace.ts` 的 project `@tm/agent`（`root` 绝对路径、`environment: 'node'`、`include = ['test/**/*.spec.{ts,tsx}', 'src/**/*.spec.{ts,tsx}']`）现成，**未新建/未改任何 config**。用例只落 `packages/agent/test/`（⛔ 未往 `src/**` 放）。
- 零网络 / 零 LLM / 零 DB / 零 Qdrant：三颗 spec 的 import 闭包只有 `zod`（assessment 透传）、`ts-fsrs`（fsrs）、`@langchain/langgraph` 的 `interrupt` 符号（orchestrator 透传 import，**不调用**）。未 import `src/index.ts`（避免拖进 graph 装配），一律直引 `../src/tools/*.js` / `../src/nodes/orchestrator.js`。
- ⛔ 未 import `packages/agent/src/scripts/**`（`grep -n "scripts/" packages/agent/test/*.spec.ts` = 0 命中）；未读任何 `process.env`（`grep -n "process.env" packages/agent/test/*.spec.ts` = 0 命中）。
- 零真实时钟：`fsrs.ts` 里 `retrievability:66` / `retrievabilityPowerLaw:75` / `buildTodayQueue:84` / `applyRating:117` / `createDefaultCard:53` 默认参数都是 `now: Date = new Date()` ⇒ **每处调用一律显式传 `NOW = 2026-03-01T12:00:00.000Z`**（`grep -n "new Date()" packages/agent/test/*.spec.ts` = 0 命中）。assessment / orchestrator 两颗 helper 本身无 `Date` 路径。
- 期望值来源：**全部**先用 `Temp/e4c2-ii/probe{1,2,3}.mjs` 跑一次真实调用打印后再钉（`node --import tsx <探针>`；探针只 import 源码读返回值，不写任何仓库文件），不是照抄简报文字。
- ⛔ 无 `test.skip` / `test.fail` / `passWithNoTests` / `waitForTimeout`；`expect` 的参数里 0 条中文定稿串（中文只出现在 `describe`/`it` 标题与 ASCII 夹具之外的输入样本里，文案哨仍归 shared 管）。
- ⛔ 未为测试改任何产品代码/DOM：`packages/agent/src/**` 本轮只有 `deps.ts` 一处（件①）。
- `ts-fsrs` 确定性实测核对：`grep -c "Math.random" node_modules/.pnpm/ts-fsrs@4.7.1/node_modules/ts-fsrs/dist/index.mjs` → **0**（`enable_fuzz` 默认关）⇒ `applyRating` 的钉值是确定函数。
- 颗数 **3**（额度 ≤4），每颗 added+removed：176 / 175 / 102，均 ≤200。

### 2.1 `packages/agent/test/assessment.spec.ts`（15 用例，+176/-0）

钉 `src/tools/assessment.ts` 的 `gradeAnswer:136` / `scoreToFsrsRating:166` / `pickQuestionType:61` / `fallbackQuestion:99` / `AssessmentQuestionSchema:31`。夹具：`choice.options = ['a0','b1','c2','d3']`、`answerIndex = 2` ⇒ `correctAnswer` 应为 `'c2'`。

| 用例 | 钉住什么回归 | 断言原文（负载那颗） |
|---|---|---|
| choice 命中 answerIndex 且无信号 ⇒ 5 | 完全正确快速 = Perfect；`correctAnswer` 取 `options[answerIndex]` 而非作答本身 | `expect(gradeAnswer(choice, 2)).toEqual({ score: 5, correct: true, correctAnswer: 'c2' });` |
| else-if 顺序 ⇒ hesitated 优先于 modified | **简报点名的顺序陷阱**：两信号同时给只降一档到 4，不会被 modified 抢先成 3 | `expect(gradeAnswer(choice, 2, { hesitated: true, modified: true }).score).toBe(4);`（同颗另两条钉单信号 ⇒ 4 / 3） |
| 错答 ⇒ modified 才给 2，否则 1 | 1/2 档分界 + 错答支 hesitated 不参与分档 | `expect(gradeAnswer(choice, 0, { modified: true })).toEqual({ score: 2, correct: false, correctAnswer: 'c2' }); expect(gradeAnswer(choice, 0, { hesitated: true }).score).toBe(1);` |
| choice 只认 number 下标 | 字符串 `"2"` 判错（与文本题支的不对称是设计） | `expect(gradeAnswer(choice, '2')).toEqual({ score: 1, correct: false, correctAnswer: 'c2' });` |
| fill / spelling 走 trim + toLowerCase | 文本题比对口径；下标作答对文本题一律错；spelling 大小写不敏感 | `expect(gradeAnswer(fill, '  QUIT ')).toEqual({ score: 5, correct: true, correctAnswer: 'quit' }); expect(gradeAnswer(fill, 3).correct).toBe(false); expect(gradeAnswer(spelling, 'Abandon  ').correct).toBe(true);` |
| scoreToFsrsRating 完整映射表 | 5→4, 4→3, 3→2, 2→1, 1→1（1 与 2 合流到 Again） | `const scores: AssessmentScore[] = [1, 2, 3, 4, 5]; expect(scores.map(scoreToFsrsRating)).toEqual([1, 1, 2, 3, 4]);` |
| d < 4 恒为 choice | 低难度确定支 | `expect(pickQuestionType(0)).toBe('choice'); expect(pickQuestionType(3.99)).toBe('choice');` |
| 4<=d<=7 内 5.5 分界 | `<5.5→choice / >=5.5→fill`，且 **d===7 仍属确定支**（若哪天写成 `< 7` 就掉进 `Math.random()` 支） | `expect(pickQuestionType(5.49)).toBe('choice'); expect(pickQuestionType(5.5)).toBe('fill'); expect(pickQuestionType(7)).toBe('fill');` |
| 三种题型都能过 Schema | 降级题与 union 校验面同形（防"降级题自己先解析失败"） | `expect(AssessmentQuestionSchema.safeParse(q).success).toBe(true);` |
| choice 的 options 恒 4、答案在 index 0、definition 缺省回落 word | 简报点名的 `length(4)` 口径 + `extra.definition \|\| word` 回落 | `expect(q.options).toHaveLength(4); expect(q.answerIndex).toBe(0); expect(q.options[0]).toBe('abandon');` |
| fill 的 hint 取前 2 字符、spelling 透传 phonetic | 降级题槽位形状 | `expect(f.hint).toBe('gi'); expect(s.phonetic).toBe('/a/');` |
| choice options 长度 3 与 5 都拒 | `length(4)` 是硬门，不是"至少 4" | `expect(AssessmentQuestionSchema.safeParse({ ...choice, options: ['a','b','c'] }).success).toBe(false);` |
| answerIndex 越界(4) 与未知 type 都拒 | `min(0).max(3)` + discriminated union 的未知判别值 | `expect(AssessmentQuestionSchema.safeParse({ ...choice, answerIndex: 4 }).success).toBe(false);` |
| fill 缺 answer/hint 时拒 | 必填字段不因降级而放宽 | `expect(AssessmentQuestionSchema.safeParse({ type:'fill', word:'w', sentence:'s' }).success).toBe(false);` |

### 2.2 `packages/agent/test/fsrs.spec.ts`（11 用例，+175/-0）

夹具 `MATURE_JSON`：`state:2 / stability:5 / difficulty:6.25 / reps:4 / lapses:1 / elapsed_days:3 / scheduled_days:5 / due:2026-03-05T12:00Z / last_review:2026-03-01T12:00Z`（= `NOW`，故 `due = NOW+4d`）。

| 用例 | 钉住什么回归 | 断言原文（负载那颗） |
|---|---|---|
| createDefaultCard(now) 九槽 | 新卡占位参 S=1 / D=5 / state=0 / due=now / last_review=null | `expect(JSON.parse(cardToJson(createDefaultCard(NOW)))).toEqual({ due:'2026-03-01T12:00:00.000Z', stability:1, difficulty:5, elapsed_days:0, scheduled_days:0, reps:0, lapses:0, state:0, last_review:null });` |
| `cardToJson∘cardFromJson` 恒等（老卡 + 新卡） | server `fsrs_data` 落库/取库往返无损 | `expect(cardToJson(cardFromJson(MATURE_JSON))).toBe(MATURE_JSON);` |
| last_review=null 反序列化后仍 null | `cardFromJson` 内部以 `createEmptyCard(new Date())` 打底 ⇒ 钉住"真实时钟不渗进序列化面" | `expect(JSON.parse(cardToJson(cardFromJson(noLast))).last_review).toBeNull();` |
| R(now)=1、+1 天=exp(-1/5)、+5 天=exp(-1) | 任务约定的指数式 `R(t)=exp(-t/S)` 口径（非 ts-fsrs 内部幂律） | `expect(retrievability(card, at(1))).toBeCloseTo(Math.exp(-1 / 5), 12);` |
| now 早于 last_review ⇒ R=1 | 简报点名的"夹到 1"：`Math.max(0, …)` 防出现 R>1 | `expect(retrievability(card, at(-100))).toBe(1);` |
| last_review=null 时回落 due 作基准 | 基准点回落（本卡 due=NOW+4d ⇒ `at(4)` 恰 0 天、`at(5)` 为 1 天） | `expect(retrievability(c, at(4))).toBe(1); expect(retrievability(c, at(5))).toBeCloseTo(Math.exp(-1 / 5), 12);` |
| 幂律 t=0⇒1、t=1⇒0.977337546216906 | 与 ts-fsrs `DECAY=-0.5` / `FACTOR=19/81` 同式（值为探针实测） | `expect(retrievabilityPowerLaw(card, at(1))).toBeCloseTo(0.977337546216906, 12);` |
| 幂律 t=5、S=5 恰为 0.9 = REVIEW_THRESHOLD | 阈值与幂律的天然交点：`REVIEW_THRESHOLD` 一漂移，这条与队列入队门一起红；同时钉住两式在 S 大时才接近 | `expect(retrievabilityPowerLaw(card, at(5))).toBeCloseTo(0.9, 12); expect(REVIEW_THRESHOLD).toBe(0.9); expect(retrievability(card, at(5))).toBeCloseTo(0.367879441171442, 12);` |
| buildTodayQueue 入队条件与排序 | **R<0.9 才入队、按 R 升序、`state===0` 新卡无条件入队（此刻 R=1 仍排最后）**；`fresh`(last_review=now ⇒ R=1) 被排除；返回体剥掉 `state` 槽 | `expect(list.map((i) => i.word)).toEqual(['stale','mid','newcard']); const r = list.map((i) => i.retrievability); expect([...r].sort((a, b) => a - b)).toEqual(r); expect(r.at(-1)).toBe(1); expect(list.map((i) => i.elapsedDays)).toEqual([59, 4, 0]);` |
| applyRating 老卡 Good(3) 九槽 | ts-fsrs 5.0 更新后的确定值（S 不变、D→6.23608271、due=now+6d、reps=5、state=2）+ 同输入二次调用逐字节恒等（确定性自证） | `expect(JSON.parse(next)).toEqual({ due:'2026-03-07T12:00:00.000Z', stability:5, difficulty:6.23608271, elapsed_days:0, scheduled_days:6, reps:5, lapses:1, state:2, last_review:'2026-03-01T12:00:00.000Z' }); expect(next).toBe(cardToJson(applyRating(cardFromJson(MATURE_JSON), 3, NOW)));` |
| applyRating New 卡被 init 覆写 | 简报点名的坑：`createDefaultCard` 的 S=1/D=5 只是占位，首评即被 `init_stability`/`init_difficulty` 覆写（Good ⇒ S=3.173 / D=5.28243442 / state=1 学习步；Easy ⇒ S=15.69105） | `expect(JSON.parse(cardToJson(good))).toEqual({ due:'2026-03-01T12:10:00.000Z', stability:3.173, difficulty:5.28243442, …, state:1, … }); expect(applyRating(card, 4, NOW).stability).toBe(15.69105); expect(applyRating(card, 1, NOW).lapses).toBe(0);` |

### 2.3 `packages/agent/test/orchestrator-intent.spec.ts`（13 用例，+102/-0）

只测 `heuristicIntent:31` 与 `hasClearIntent:56`。文件头写明为何不测 `makeOrchestratorNode`：`:118` 的 `interrupt()` 在编译图外会抛、`:129-142` 还可能原样重抛 ⇒ 属图运行时行为，不是这颗 helper 的语义。

| 用例 | 钉住什么回归 | 断言原文（负载那颗） |
|---|---|---|
| assess 支：关键词 + 拉丁词 + `<数字>分` 抽 rating | rating 抽取，`\s*` 两侧空格皆可 | `expect(heuristicIntent('考我 apple 我答 3 分')).toEqual({ intent: 'assess', word: 'apple', rating: 3 }); expect(heuristicIntent('考我 apple 我答5分').rating).toBe(5);` |
| assess 的隐藏门槛 | `'考我 3 分'`/`'测评'`/`'测验单词'` 都命中 assess 关键词，但 0 拉丁词 ⇒ 整支跳过、一路掉到默认 lookup（最易被"顺手补个 else"改掉） | `expect(heuristicIntent('考我 3 分')).toEqual({ intent: 'lookup' }); expect(heuristicIntent('测评')).toEqual({ intent: 'lookup' });` |
| review 优先于 report | 分支书写顺序即优先级（`'学习 abc 分析'` 走 report 因 review 未命中） | `expect(heuristicIntent('分析复习')).toEqual({ intent: 'review', word: undefined }); expect(heuristicIntent('学习 abc 分析')).toEqual({ intent: 'report', word: 'abc' });` |
| rating 只在 assess 支抽取 | review 支里的 `"3 分"` 被丢弃 | `expect(heuristicIntent('复习 review 3 分')).toEqual({ intent: 'review', word: 'review' });` |
| lookup 支带词 | 查 / 是什么意思 类关键词 | `expect(heuristicIntent('abandon 是什么意思')).toEqual({ intent: 'lookup', word: 'abandon' });` |
| learn 支关键词 + "整句即单词"兜底 | 大小写归一后才相等（`Hello`/`HELLO` ⇒ word `'hello'` 且判 learn）；句中嵌词走末尾默认支 | `expect(heuristicIntent('HELLO')).toEqual({ intent: 'learn', word: 'hello' }); expect(heuristicIntent('i 想 learn')).toEqual({ intent: 'learn', word: 'learn' });` |
| 默认支尾：无词且无关键词 ⇒ lookup | 空串 / 纯空格 / 纯英文短句无关键词时的落点 | `expect(heuristicIntent('')).toEqual({ intent: 'lookup' }); expect(heuristicIntent('review please')).toEqual({ intent: 'learn', word: 'review' });` |
| 单字母词不落 word | 简报点名边界：`[a-zA-Z][a-zA-Z'-]{1,63}` 最短 2 字符 | `expect(heuristicIntent('x')).toEqual({ intent: 'lookup' }); expect(heuristicIntent('ab')).toEqual({ intent: 'learn', word: 'ab' });` |
| 首字母后必须字母/连字符/撇号 | `'B1'` ⇒ 无词（`1` 不在类内）；`'bb12'` ⇒ `'bb'`；`'90 分'` 不以字母开头 ⇒ 无词 | `expect(heuristicIntent('B1')).toEqual({ intent: 'lookup' }); expect(heuristicIntent('bb12')).toEqual({ intent: 'learn', word: 'bb' });` |
| 连字符/撇号属词元、标点截断、取首个匹配并小写 | 词元字符类 + "第一个匹配"口径 | `expect(heuristicIntent("help me with don't")).toEqual({ intent: 'learn', word: 'help' }); expect(heuristicIntent('abc-def')).toEqual({ intent: 'learn', word: 'abc-def' }); expect(heuristicIntent('a-')).toEqual({ intent: 'learn', word: 'a-' });` |
| hasClearIntent：裸拉丁词不算明确意图 | 关键词表不含英文词 | `expect(hasClearIntent('abandon')).toBe(false); expect(hasClearIntent('today is fine')).toBe(false);` |
| hasClearIntent：关键词命中 | 表内真子集 8 颗 | `for (const text of ['复习','考我','分析','教','意思','打分','进度','我要学习']) { expect(hasClearIntent(text)).toBe(true); }` |
| 两颗 helper 的口径差 | **`hasClearIntent=true` ≠ 启发式必进对应分支** ⇒ 钉住"别把两颗门当同一颗"（改任何一颗表都会红） | `expect(hasClearIntent('打分')).toBe(true); expect(heuristicIntent('打分')).toEqual({ intent: 'lookup' });` |



- 第一版 `fsrs.spec.ts` 把 "last_review=null 回落 due" 那颗写成 `at(5) ⇒ exp(-1)`，**实测 exit 1**（`AssertionError: expected 0.8187307530779818 to be close to 0.36787944117144233`）⇒ 原因是夹具 `due = NOW+4d` 而非 `NOW`，回落基准后 t 只有 1 天。已按真实盘面改为 `at(4) ⇒ 1` + `at(5) ⇒ exp(-1/5)`。这正是"期望值必须先跑再钉"的用处。
- `pnpm --filter @tm/agent typecheck` 首跑 exit 2，三处 TS 诊断（`test/fsrs.spec.ts(131,12)/(132,12)` 两条 `TS2532 Object is possibly 'undefined'` + `test/assessment.spec.ts(95,32)` 一条 `TS2345`）。根因：`packages/agent/tsconfig.json` 的 `include` = `["src", "test", "../shared/src"]` ⇒ **typecheck 确实含 `test/`**，且 `tsconfig.base.json` 开了 `noUncheckedIndexedAccess`（索引访问出 `| undefined`）；`TS2345` 是 `[1,2,3,4,5].map(scoreToFsrsRating)` 的 `number → AssessmentScore` 逆变。已改为 `r.at(-1)` / `list.at(-1)?.cardJson` 与显式 `const scores: AssessmentScore[]`，现 exit 0。⚠ 这与简报里"agent 的 typecheck 与 coverage 都不含 `test/`"的说法**不符**（coverage 的 `exclude` 含 `test` 是对的，typecheck 不是）：以盘面为准登记在此，未自行扩面。
## 3. 件③ —— `apps/app/src/screens/MeScreen.tsx` 五处过期注释（只改注释，代码 0 字）

幅度：`diff -u before/MeScreen.tsx MeScreen.tsx` 实测 **+14 / -13 = 27 行**（额度 ≤40）；`wc -l` **766 → 767**（净 +1 行，因 `:96-98` 那处由 3 行改写为 4 行）。**0 条代码行**：`+` 侧 14 行逐条以 `*` / `/*` 起始，`-` 侧 13 行里 12 行同形、1 行是旧裸块注释的正文行（详见 §3.0 的逐条自查）。⛔ 未新增任何 TODO/占位；⛔ 未顺手整理别的注释；`apps/app/test/me-screen.spec.tsx` 与其余 4 张屏 0 触碰（锚点校验 OK，见 §5）。

自证 patch 里本文件的每一条 +/- 行（共 27 行）：
`-:96 -97 -98 +96 +97 +98 +99`、`-:160 -161 -162 +161 +162 +163`、`-:400 -401 +401 +402`、`-:448 -449 +449 +450`、`-:452 -453 +453 +454`、`-:485 -486 +486 +487`（行号为改后位置；全部命中 `//`/`/*`/`*`/`*/` 形态）。

### 处 1（`:96-98`，行标题键路径）

改前：
```
 *     - 三行的行标题各取盘上唯一一份：`外观`/`关于` = `SETTINGS_COPY.groups` 的第 2/4 格
 *       （同 `AboutScreen.tsx:45` 用 `groups[4]` 作「关于」页 H1 的先例）；`修改密码` =
 *       `AUTH_COPY.changePassword.title`，也就是落点 `/security` 那一屏自己的标题
```
改后（`:96-99`）：
```
 *     - 三行的行标题各取盘上唯一一份：`外观`/`关于` = `SETTINGS_COPY.rows.appearance` / `.about`（F 区专用键）
 *       （A-86 #320 选项 5A：两串在 `copy.ts` 单点声明，`groups` 的第 2/4 格与 `rows` 同引同一颗 const；
 *       `AboutScreen.tsx:45` 的「关于」页 H1 也已换到同一颗 `rows.about` ⇒ 两处同源）；`修改密码` =
 *       `AUTH_COPY.changePassword.title`，也就是落点 `/security` 那一屏自己的标题
```
盘面依据：`:260 const APPEARANCE_TITLE = SETTINGS_COPY.rows.appearance;`、`:262 const ABOUT_TITLE = SETTINGS_COPY.rows.about;`（改后行号，原 `:259`/`:261`），`apps/app/src/screens/AboutScreen.tsx:45 const ABOUT_GROUP_LABEL = SETTINGS_COPY.rows.about;` ⇒ 旧注释的"用 `groups[4]` 作 H1 的先例"已不成立，改为"同一颗 `rows.about` ⇒ 同源"。

### 处 2（`:160-161`，文件头降级支页脚口径）

改前：
```
 * 确认层）。在途（`isPending`）不出这张卡（loading 支不在本轮）；该支不画 C/D/E/F/G，也**不画 H 页脚**
 * （F-36 待裁：备案号是否穿透整页降级；裁定前照 `:1001` 逐字"整页降级为一个错误卡"，由用例显式钉住，
 * 将来翻口径会翻一颗钉留痕）。首屏骨架（`:1000` 第三行）不在本轮。
```
改后（`:161-163`）：
```
 * 确认层）。在途（`isPending`）不出这张卡（loading 支不在本轮）；该支不画 C/D/E/F/G，但 **H 页脚照画**
 * （F-36 已裁 = A-86 #320 选项 6A：备案号是企业法定公示、穿透 `:1001` 整页降级支；门已拆成 `:457` 的
 * `showSettingsSections` 与 `:463` 的 `showFooter` 两颗，E4b6 落地）。首屏骨架（`:1000` 第三行）不在本轮。
```

### 处 3（`:400-401`，`fetchFailed` 那颗门的注释）

改前：
```
   * `showCheckinData` 里同一条 `!fetchFailed` 一并收进降级面（F-29 拆门后仍守住"整页只一颗卡"），H 页脚也不画
   * （F-36 待裁：备案号是否穿透降级支；裁定前照 `:1001` 逐字"整页降级为一个错误卡"）。
```
改后（`:401-402`）：
```
   * `showCheckinData` 里同一条 `!fetchFailed` 一并收进降级面（F-29 拆门后仍守住"整页只一颗卡"），但 H 页脚照画
   * （F-36 已裁 = A-86 #320 选项 6A：备案号穿透整页降级，放行点是 `:463` 的 `showFooter`）。
```

### 处 4（`:447-453`，`showSettingsSections` 注释块的两条旧结论）

改前（第一段 `:448-449`）：
```
   * - 已登录但档案没到手（在途 / 拉取失败）⇒ 一律不渲染：跟 `:1001` 的整页降级口径（拉取失败支自
   *   T-19g-v 起画错误卡，页脚仍不画 = F-36 待裁前的照旧口径；在途支的骨架不在本轮）。
```
改后（`:449-450`）：
```
   * - 已登录但档案没到手（在途 / 拉取失败）⇒ 本门为假（F 区不渲染）：跟 `:1001` 的整页降级口径；
   *   拉取失败支的 H 页脚改由 `:463` 单独放行（F-36 已裁 6A，A-86 #320），在途支仍不画页脚（M-06 钉着）。
```
改前（第二段 `:452-453`）：
```
   * ⚠ 简报口径"页脚无条件渲染"与"拉取失败支 F-03/L-03 既有整表空钉不翻转"不可兼得 ⇒ 按测试钉面做：
   *   页脚只摘**登录门**，`:1001` 降级支仍不出页脚（差异登记交付报告 §0.2/§5）。
```
改后（`:453-454`）：
```
   * ⚠ 简报口径"页脚无条件渲染"与"拉取失败支 F-03/L-03 既有整表空钉不翻转"的不可兼得已由 A-86 #320
   *   选项 6A 裁定（F-36 闭）：备案号穿透 `:1001` 降级支 ⇒ 页脚另立 `:463` `showFooter`，与登录门分离。
```
（同块 `:450-451` 的"页脚对访客常驻 = TPM 裁定"那条与 `:455` 的 G 区 F-34 那条仍是盘上事实，未动。）

### 处 5（`:485-486`，`fetchFailed` JSX 支的块注释）

改前：
```
        /* §3.8.5:1001「整页降级为一个错误卡」：本支不画 C/D/E/F/G（各门天然全假），也不画 H 页脚
           （F-36 待裁：备案号是否穿透降级支；裁定前照 :1001 逐字，测试把"不画页脚"钉成显式断言）。
```
改后（`:486-487`）：
```
        /* §3.8.5:1001「整页降级为一个错误卡」：本支不画 C/D/E/F/G（各门天然全假），但 H 页脚照画 ——
         * F-36 已由 A-86 #320 裁定选项 6A（备案号是企业法定公示、穿透整页降级支），放行点 = `:463` `showFooter`。
```
⚠ 这一处的第二行原本以全角括号起始（无 `*` 前缀），若照抄形状会撞注释分类器的"`//`|`/*`|`*`|`*/` 起始"口径 ⇒ 改写后两条 +/- 行分别以 `/*` 与 `*` 起始。该块其余 4 行（`装配照 StudyScreen.tsx:630-648`…`开的是 G 区那颗既有 ConfirmSheet。 */`）为上下文行，**未进入 +/-**，形状原样保留（不算"顺手整理"）。

#### 3.0 注释分类器自查（TPM 亲跑前的自证，逐条 +/- 行）

用一段 Python 把 scoped patch 里 `apps/app/src/screens/MeScreen.tsx` 的 **全部 27 条 +/- 行**按"去 diff 前缀 + 去缩进后是否以 `//`|`/*`|`*`|`*/` 起始"过了一遍（留档 `Temp/e4c2-ii/` 内联脚本，不入库）：

- **26 / 27 条直接判 OK**（JSDoc `* `  gutter 或 `/*` 起始；`+` 侧 14 条**全部**判 OK，即本轮新增的每一天都是注释）。
- **唯一 1 条需要按"注释块内正文"判定**，它是被**删除**的旧行（原文逐字）：
  ```
  -           （F-36 待裁：备案号是否穿透降级支；裁定前照 :1001 逐字，测试把"不画页脚"钉成显式断言）。
  ```
  这颗位于旧 `:486`，处在旧 `:485` 打开、旧 `:490` 关闭的 `/* … */` JSX 子注释块内，**"无 `*` gutter"是它在本文件里的既有书写形状（改前快照逐字如此），不是本轮引入**：`grep -c "^ *[^(/*]"` 级别上它当然是注释正文。要改正"F-36 待裁 / 不画页脚"这条旧事实就必然删掉这一行 ⇒ 该 `-` 行不可回避，且它 0 代码语义（删掉它前后 `@tm/app test` 470/470 逐颗同绿，见 §4 验证 4）。
- 若 TPM 的分类器只认前缀 token 而不跟踪块注释状态，则本处（件③ 的第 5 处，简报点名 `:485-490`）在数学上不可满足：其余四处所在的是 `/** … */` JSDoc，每行天然带 `*`，唯独这颗是裸 `/* … */` 块。⛔ 我不为此改第 5 处之外的形状（额度与"⛔ 顺手整理"双闸），按简报要求"遇到不符就停下写清证据链"处理，请 TPM 判定。


### 3.1 行为零漂移证明

- 五处改完 `apps/app` 侧测试不减不动：**18 files / 470 passed**（改前 TPM 给的基线同值，见 §4 验证 4）。
- `showSettingsSections = !signedIn || showGoal`（`:457`）与 `showFooter = showSettingsSections || fetchFailed`（`:463`）两颗门的代码行一字未改，注释只是把事实对齐到它们。
- 注释里新增的自指行号 `:457` / `:463` 是按**改后盘面**实测 `grep -n` 取的（`grep -n "const showSettingsSections\|const showFooter" → 457: / 463:`），⛔ 未沿用简报里改前的 `:456`/`:462`（那两颗因本文件净 +1 行而漂移 1 位）。

## 4. 六条验证（命令 + 退出码 + 关键输出行）

全部在仓库根 `E:\CC\tomorrow-memory` 执行；一律 `> log 2>&1` 后单独取 `$?`，⛔ 无管道吃退出码。日志留档于 `C:\Users\曹怡明\AppData\Local\Temp\e4c2-ii\v*.log`。

| # | 命令 | exit | 关键输出行 | 时刻 |
|---|---|---|---|---|
| 1 | `pnpm --filter @tm/agent test` | **0** | `Test Files  3 passed (3)` / `Tests  39 passed (39)` / `Duration  785ms` | 05:41:34（首绿 05:39:36） |
| 2 | `pnpm test`（根） | **0** | `Test Files  47 passed (47)` / `Tests  1207 passed \| 1 skipped (1208)`；日志内 `@tm/agent` **3 次**出现（改前 0 次） | 05:46:13 |
| 3a | `pnpm --filter @tm/agent typecheck` | **0** | `tsc -p tsconfig.json --noEmit` 无诊断 | 05:41:34 |
| 3b | `pnpm --filter @tm/app typecheck` | **0** | `tsc -p tsconfig.json --noEmit` 无诊断 | 05:45:22 |
| 4 | `pnpm --filter @tm/app test` | **0** | `Test Files  18 passed (18)` / `Tests  470 passed (470)` | 05:45:45 |
| 5 | `node tools/boundaries.mjs --check-ownership --task E4c-ii --diff-file <scoped patch> --files <清单>` | **0** | `--check-ownership task=E4c-ii 触碰 5 个在册文件（清单 6 项 + patch 5 项） → 无越界` | 05:47:2x |
| 6a | `pnpm --filter @tm/shared test` | **0** | `Test Files  1 passed (1)` / `Tests  68 passed (68)` | 05:46:29 |
| 6b | `pnpm --filter @tm/server test` | **0** | `Test Files  21 passed (21)` / `Tests  446 passed \| 1 skipped (447)` | 05:46:43 |

- **终轮复跑（收工前，时刻 `2026-09-23 05:54:13`）**：`pnpm test` → exit **0**，`Test Files 47 passed (47)` / `Tests 1207 passed | 1 skipped (1208)`；`pnpm --filter @tm/agent test` → exit **0**，`3 passed (3)` / `39 passed (39)`；`node tools/boundaries.mjs --check-ownership …` → exit **0**「无越界」；`sha256sum -c <锚点>` → exit **0** 九行全 OK。本轮最终状态以上述终轮为准，上表首次取样（05:41–05:47）与终轮逐字相同。
- 验证 1 的改前事实复核：`packages/agent` 由 0 用例 → **3 文件 / 39 用例**，`pnpm --filter @tm/agent test` 由 exit 1（`No test files found`）→ exit 0。
- 验证 2 的"只增不减"核对：文件 44 → **47**（+3，全是 `@tm/agent/test/**`），用例 1168 → **1207**（+39），skipped 1 → **1**（未新增 skip，那 1 颗仍是既有的）。
- 验证 5 的完整 NOTE 逐条：`packages/agent/src/deps.ts` 通道 `bounded-edit:A-94-E4c-ii` 实测 `+6/-1`；`apps/app/src/screens/MeScreen.tsx` 实测 `+14/-13`（授权来源 `maxDiffLinesFor["E4c-ii"]=40`）；三颗 spec 分别 `+176/-0`、`+175/-0`、`+102/-0`（额度 200/颗）；`.delivery/04-dev-report-E4c-ii.md` = `no-entry，不阻断`。⛔ 无一条红、⛔ 无"幅度超限"、⛔ 无"混入他人改动"。

## 5. 两证（A-77 #261 口径）

### 5.1 开工前锚点（时刻 `2026-09-23 05:34:20`，文件 `Temp/e4c2-ii/a94-anchor.txt`）

```
6595517661cc6a348f85473bce60162a1d021856857b7a88b852c6c81bddd87d *data.db
2bceb890727622281fc883e5c0d7acda7968224794996974dc7c5d2e56ed6d02 *data.db-shm
88ed3fe2b2ce5fe882e1888d7278fd11a23f42c0fa6a781e50c4aa4b1b3f954c *data.db-wal
48ee7b46773699a99062b2d430347b1a6c8036887e7560469245ad4e0edaa623 *tools/boundaries.mjs
9bf17a2d0bc5c2d3e0a35afe2166121f0121cc93a33c2fc70de9cc1afba10ba0 *tools/ownership.json
200b255f0e38190fc6d634338ee3a480c7d93e0708398ae5160f89b47a15219b *packages/shared/src/types.ts
cd7d6c2b00cb14628ca684af99509323b0d2cec6758aed8a61732c5cf3f7b444 *apps/app/test/me-screen.spec.tsx
11180db8855abc6ff4dcdd42bbac4c3b1cbaacbb45a7edae3cb889dc70fc59d3 *packages/agent/package.json
82d1aa5d4f6eaf72d370762fd6da04a58c386b602b64e9bf59aa1ccb3660f443 *vitest.workspace.ts
```
（`stat -c "%n %s"` 同刻取样：`data.db 253952` / `data.db-shm 32768` / `data.db-wal 424392` —— 三颗真库面大小与 TPM 给的期望值逐字相同；三颗 sha256 前缀 `6595517661cc…` / `2bceb8907276…` / `88ed3fe2b2ce…` 亦与期望值一致。）

### 5.2 收工校验（在仓库根跑，时刻 `2026-09-23 05:47:57`）

`sha256sum -c Temp/e4c2-ii/a94-anchor.txt` → **exit 0**，九行全 OK（含三颗真库面 + `-shm`/`-wal` 的只读三颗，⛔ 零写入、mtime 未动）：
```
data.db: OK
data.db-shm: OK
data.db-wal: OK
tools/boundaries.mjs: OK
tools/ownership.json: OK
packages/shared/src/types.ts: OK
apps/app/test/me-screen.spec.tsx: OK
packages/agent/package.json: OK
vitest.workspace.ts: OK
```

`find . -newermt "2026-09-23 05:34:20" -type f -not -path "./node_modules/*" -not -path "*/node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "*/dist/*"`（终轮取样时刻 `2026-09-23 05:54:13`）→ 6 行，逐颗说明：
```
./.delivery/04-dev-report-E4c-ii.md                     交付物本体（本轮唯一 .delivery 写位，闸内 NOTE = no-entry，不阻断）
./apps/app/src/screens/MeScreen.tsx                     件③ 授权面（精确路径条目，通道 A-94-E4c-ii，≤40）
./packages/agent/src/deps.ts                            件① 授权面（精确路径条目，≤8）
./packages/agent/test/assessment.spec.ts                件② 授权面（packages/agent/test/**，≤200/颗）
./packages/agent/test/fsrs.spec.ts                      件② 授权面（同上）
./packages/agent/test/orchestrator-intent.spec.ts       件② 授权面（同上）
```
除这 6 颗外**零写入**：临时产物全部落在 `C:\Users\曹怡明\AppData\Local\Temp\e4c2-ii\`（`before/` 快照 2 颗 + 探针 3 颗 + 日志 10 份 + scoped patch 2 颗 + 锚点 2 颗），仓库内 0 残留。终轮另用 `diff -u` 重生成 patch 并与交付 patch `cmp` → **exit 0 逐字节相同**（`patch_identical_exit=0`，05:53:33），证明 patch 之后未再碰过那 5 颗文件。

### 5.3 未使用任何 git 写操作

本轮全程只跑过 `sha256sum` / `diff -u` / `find` / `grep` / `wc -l` / `stat` / `cp`（快照）/ `pnpm` / `node`，⛔ 无 `git add` / `commit` / `push` / `stash` / `checkout` / `restore` / `reset` / `clean`（连只读 git 都不需要，证据全部来自 scoped patch）。

## 6. 遗留与待证

1. **`vitest.workspace.ts` 的"空项目静默容忍"仍在**：件② 把 `@tm/agent` 填成 39 用例后，根 `pnpm test` 对它由"0 次出现"变"3 次出现"，但**多项目运行容忍空项目的语义没变**：任一 project 用例数归零时根命令仍 exit 0（本轮实测口径：改前 44 文件 exit 0 而单包 exit 1）。按 A-94 #379「⛔ 改脚本语义」，这颗缺口保留在册，建议后续轮另立裁决（例如在 `tools/boundaries.mjs` 加一条"逐 project 用例数 > 0"的闸，或在 CI 里对 `--filter` 逐包跑）。⛔ 本轮未动 `vitest.workspace.ts` 与任何 `package.json`（锚点 OK 为证）。
2. **agent 包的覆盖率面**：`packages/agent/tsconfig.json` 的 `include` 含 `test`（⇒ 件② 的 spec 受 typecheck 管，已 exit 0），但 `vitest.config.ts` 的 coverage `exclude` 含 `test/**`、`include` 是 `src/**` ⇒ 39 用例对 src 的实际覆盖率本轮**未测**（不在授权面，也未跑 `--coverage`）。若 TPM 要 E4c-iii 钉覆盖数，需另开额度。
3. **件② 未覆盖的 src 面（有意留下，非漏）**：`llm-router.ts`（要 LLM/网络）、`graph.ts` / `nodes/*` 其余节点（要 `interrupt()` 与 checkpointer）、`tools/*` 其余（tutor / report / lookup 等，多数要 `AgentDeps` 端口注入或 LLM）、`deps.ts` 的端口形状（纯 type，无可执行面）、`src/scripts/**`（简报禁 import）。⇒ `packages/agent` 现有 19 源文件中被钉的是 `tools/assessment.ts`、`tools/fsrs.ts`、`nodes/orchestrator.ts` 三颗的纯函数支。
4. **`pickQuestionType` 的 `d > 7` 支未钉**：源码 `assessment.ts:65` 是 `Math.random() < 0.5 ? 'fill' : 'spelling'` ⇒ 按"零随机"硬判据刻意不覆盖，只在该 `it` 后留一行说明注释（非 TODO、非占位，是"为什么不测"的事实陈述）。
5. **注释里的自指行号仍是易漂移锚**：件③ 按改后盘面写了 `:457` / `:463`（见 §3.1）。本文件任何后续增删都会让它们再次漂移。A-82 FU03⑥ 的先例是"把行号锚换成符号名"，但那属于其他文件的既有注释整理，本颗文件的 40 行额度与"⛔ 顺手整理别的注释"两道闸都不允许我在这里改形状 ⇒ 登记为待裁：是否允许把 MeScreen 注释内的自指行号统一换成符号名。
6. **`packages/agent/test/**` 的 per_file 归属**：三条在册条目（`deps.ts` / `agent/test/**` / `MeScreen.tsx`）的 `reason` 都写明"E4c-ii 用完即止"，本轮已各自消费 7 / ≤200 / 27 行 ⇒ 请 TPM 在下一轮派单前按惯例把这三条通道收口（我不改 `tools/ownership.json`，只提示额度已消费）。
