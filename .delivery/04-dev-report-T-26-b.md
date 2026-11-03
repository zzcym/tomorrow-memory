# 开发报告 · T-26b（批次4D：App 侧数据层对齐 `analyst` REST 真契约）

任务：把 `apps/app` 的轻学情数据面从"对着不存在的契约写"（`?days=<number>`）改到 T-26a 刚交付的
REST 面（`?period=7d|30d|90d|all`）。**只改 App 侧四个文件，`packages/**` 与 `packages/server/**` 零改动。**
出口命令 2 次用完，两次一致全绿。

---

## 1. 交付物清单（文件 + 行数 + Δ）

| 文件 | 行数 | Δ | 改了什么 |
| --- | --- | --- | --- |
| `apps/app/src/data/queries/analyst.ts` | 75 | +28（47→75） | `days:number` → `period:AnalysisPeriod`；`analystKeys.report/dataset` 的键尾从数字换成 period（`dataset` 也带上 period，与端点入参一致）；两条 `apiGet` 的 `query` 由 `{days}` 改 `{period}`；新增 `DEFAULT_ANALYST_PERIOD = '30d'`（与 tRPC `.optional().default('30d')` / REST `DEFAULT_PERIOD` 同口径）；删掉两处错前提注释，改为指回真实实现 `packages/server/src/routes/analyst.ts`（:97 / :134）；显式写死"不在这一层加'取不到当空'的静默兜底" |
| `apps/app/src/components/progress-data.ts` | 348 | +33（315→348） | ①`growthPointsOf` 上那段"服务端 REST 面尚未落地（`app.ts` 只挂了 tRPC）"按 A-48 就地打戳更正（原文保留在戳里，理由改为"两条真实读路径本就同存"）；②新增 `ANALYST_PERIOD = 'all' as const` 与 `shiftKeyBack()`，把 `ANALYST_WINDOW_DAYS = 365` 的语义从"请求覆盖天数"更正为"**客户端**裁剪窗口"并在 `growthPointsOf` 末尾落地那道 filter；③文件头 +4 行 T-26b 戳。**投影算法一字未动**：`cellsFromGrowth`/`cellsFromReviewDates`/`preferCells`/`sumFrom`/`weekAdded`/`legendRangesOf`/`curvePointsOf`/`curveSummaryOf`/`isEmptyBoard`/`positiveDays` 十个函数体零改动 |
| `apps/app/src/screens/ProgressScreen.tsx` | 462 | 0（两处各一行替换） | 只改调用形态：import 表里 `ANALYST_WINDOW_DAYS` → `ANALYST_PERIOD`；:140 `analysisReportQueryOptions(ANALYST_WINDOW_DAYS)` → `analysisReportQueryOptions(ANALYST_PERIOD)`。逻辑/文案/DOM **零改动**（行数不变即证据） |
| `apps/app/test/progress-screen.spec.tsx` | 813 | +50（763→813） | `makeAnalyst` 夹具改成服务端真实三键形状 `{dataset:{period,generatedAt,growthCurve},insights,cached}`；新增 **P-27**（客户端裁 365 的取数形状）与 **P-28**（出网 URL 只带 `period=all`、0 处 `days=`）；P-24 的**文件清单**扩到 `data/queries/analyst.ts`（四条正则一字未改）。26 条 → 28 条 |

未触碰（禁改面自查）：`packages/**`、`packages/server/**`、`apps/app/src/{router.tsx,host.tsx,shell/**,native/**}`、
`data/**` 内除 `queries/analyst.ts` 外的任何文件、`components/{filter-chips,sort-menu,wordbook-toolbar,result-row}.tsx`、
`apps/web/**`、`scripts/**`、`tools/**`。**0 个新增 `data-testid`、0 处 DOM 改动、0 条 `test.skip`/`test.fail`。**
Chrome84 红线自查：新代码只用 `Date` 算术 + `Array.prototype.filter/sort` + `String.split`，
`structuredClone`/`Object.hasOwn`/`.at()`/`requestIdleCallback` 命中 **0**（探针实测，见 §6）。

---

## 2. `days → period` 的全部引用点（改后原文）

改后 `grep -rn "days" apps/app/src apps/app/test | grep -i analyst` 的**全部输出**（只剩 2 处，且都不是入参）：

```
apps/app/src/data/queries/analyst.ts:11: * 服务端**从不**接受 `days:number` —— 本文件此前那套 `days` 入参照 #106 判为"对着不存在的契约写"，
apps/app/test/progress-screen.spec.tsx:801:  it('P-28 T-26b 契约对齐：analyst 只发 `?period=all`、全量 URL 0 处 `days=`，且真实响应形状能落数', async () => {
```

（P-28 的实际断言行 `expect(call.url).not.toContain('days=')` 在 :807，因不含 "analyst" 字样未被上面那条 `-i analyst` 过滤留下；它由 §5 的 P-28 片段给出原文。）

改前被本轮清掉的 `days` 出网点，逐条对账：

| 改前 | 现在 |
| --- | --- |
| `analyst.ts:15 report: (days: number) => [...analystKeys.all, 'report', days]` | `analyst.ts:42 report: (period: AnalysisPeriod) => [...analystKeys.all, 'report', period]` |
| `analyst.ts:26 analysisReportQueryOptions(days = 30)` | `:54 analysisReportQueryOptions(period: AnalysisPeriod = DEFAULT_ANALYST_PERIOD)` |
| `analyst.ts:31 { auth: true, query: { days } }` | `:59 { auth: true, query: { period } }` |
| `analyst.ts:37` 那句 "`/api/analyst/dataset`，**T-11 落地**"（错前提） | `analyst.ts:65` 改指 `routes/analyst.ts:134` + "零 LLM、零 `analyst_cache` 读写" |
| `ProgressScreen.tsx:140 analysisReportQueryOptions(ANALYST_WINDOW_DAYS)`（= 发 `?days=365`） | `analysisReportQueryOptions(ANALYST_PERIOD)`（发 `?period=all`） |

其余仍含 `days` 标识符的行**与 analyst 无关、原样保留**：`heatmapAria(days)` / `heatSparse(days)`（§3.7.6 文案模板入参）、
`positiveDays`（有记录天数）、`reviewDays`（`profile.get` 的键）、`curvePointsOf/curveSummaryOf` 的窗口入参（`CURVE_WINDOW_DAYS = 30`）、
`<Heatmap days={cells}>`（组件 prop 名）。这些都不是 HTTP 出参，改它们才是越界。

---

## 3. `period:'all'` + 客户端裁 365 的取数路径（为什么不需要新枚举值）

```
ProgressScreen :140  analysisReportQueryOptions(ANALYST_PERIOD /* 'all' */)
  → analystKeys.report('all') = ['analyst','report','all']            （缓存键含 period，两档不互串）
  → apiGet('/api/analyst', { auth:true, query:{ period:'all' } })      → GET /api/analyst?period=all
  → { dataset, insights, cached }（= tRPC `analyst.report` 同形状，A-47 #106/#107 钉着）
  → growthPointsOf(report.data, today /* 默认参 = todayKeyOf() */)（progress-data.ts:139）
       收两种包装 → 逐点收形状 → 按日期升序
       末尾：const from = shiftKeyBack(today, ANALYST_WINDOW_DAYS - 1)   // 今天往前 364 天 = 闭区间下界
             return out.filter((p) => p.date >= from)                     // ← 一整年就是在这里"裁"出来的
  → 同一份 points 喂三处（判据③）：cellsFromGrowth → D 区格阵 / legendRangesOf、
    curvePointsOf(取尾巴 30) → C 区、weekAdded(本周一起) → B 区卡 1
```

为什么不扩 `AnalysisPeriod`：

1. **枚举值不是"够不够长"的问题，是口径对齐的问题。** 值域 `7d|30d|90d|all` 的真源是
   `packages/server/src/services/analyst.ts:21`，REST 面用 `PeriodQuerySchema = z.enum([...])` 逐字校验；
   加一个 `365d` 要同时改 `@tm/shared`（另一下家名下、本轮禁区）、`services/analyst.ts` 的 `periodDays()`、
   tRPC input、以及 `analyst_cache` 的 `period` 唯一键值域 —— 为了一个**客户端显示窗口**去扩服务端枚举，
   等于把 UI 的"53 周格阵"写进存储层。A-47 #106 末段因此把口径定死为"不扩枚举，App 侧裁"。
2. **`'all'` 已经足够，且裁剪不丢任何本页要的东西。** 热力图需要的只是"最近 365 天里有记录的那些天"，
   `'all'` 给的是它的超集；曲线只要尾巴 30 天、B 区卡只要本周，两者都在裁剪窗口之内（曲线取尾巴因此完全不受裁剪影响）。
   裁剪落在 `growthPointsOf` 一处，正好是"接口结果 → 本页数字"的**唯一入口**，所以三处仍然同源（判据③不破）。
3. **裁剪确实会改变可判真假的输出，不只是装饰。** 不裁的话，一年外的日子会进 `positiveDays`（"数据不足"那句的天数）
   与 `legendRangesOf`（图例的数值区间 = §1.2.1 ② 的**文本通道**），而 `Heatmap` 自己只画 53 周 ——
   于是"图例说的最大值"可能是画不出来的格子。P-27 用"窗口外一天塞 999 词"专门盯这条：裁完图例仍是 `range(1, 6)`。
4. `profile.get` 的 `reviewDates` 兜底源**没有**加裁剪（`cellsFromReviewDates` 属投影算法，任务书明令不动）。
   它只在主源一条格子都没有时才上屏，且 `Heatmap` 的 53 周列对它同样截断；差异已进 §7 遗留清单。

`GET /api/analyst/dataset`（零 LLM、零缓存写那条）本轮同步改了入参（`analyticsDatasetQueryOptions(period)`，
键 `['analyst','dataset',period]`），但**页面继续只发 `report` 那一条**：一页四条请求是本页上限（T-18c 既有口径），
不为"少一次 LLM"把同页拆成两条读同一份 dataset 的请求。该函数的消费者数仍是 0，已在 §7 登记。

---

## 4. P-24 / P-25 未放松的证据

**P-24 用例名**（源码级，剥注释后；四条正则与改前**逐字一致**，只是 `files` 从 2 个文件扩到 3 个）：

> `P-24 判据⑤/§3.7.2 哨兵：屏与投影模块与 analyst 数据层（剥注释后）零 fetch、零 daily_goal、零 mutation、零连胜自算`

```tsx
const files = [
  '../src/screens/ProgressScreen.tsx',
  '../src/components/progress-data.ts',
  '../src/data/queries/analyst.ts',
];
for (const rel of files) {
  const code = stripComments(readSrc(rel));
  expect(code, `${rel} 不得直调 fetch`).not.toMatch(/(^|[^A-Za-z0-9_])fetch\(/);
  expect(code, `${rel} 不得触碰 daily_goal`).not.toMatch(/daily_goal|dailyGoal/);
  expect(code, `${rel} 不得有 mutation`).not.toMatch(/useMutation|apiPut|apiPost|updateProfile/);
  expect(code, `${rel} 不得自算连胜（R-13⑥ 只读接口）`).not.toMatch(
    /computeStreak\(|computeStreakFromDates\(|currentStreak\(/,
  );
}
```

**P-25 用例名**（运行时；文件内 **0 处改动**，与改前逐字相同）：

> `P-25 判据⑤：全交互后 0 写请求、URL 只落四张读表、localStorage（含任何存量 daily_goal 键）一字不动`

```tsx
expect(fetchCalls.every((c) => c.method === 'GET')).toBe(true);
expect(
  fetchCalls.every((c) =>
    ['/api/analyst', '/api/profile', '/api/checkin/status', '/api/review/queue'].some((path) =>
      c.url.includes(path),
    ),
  ),
).toBe(true);
expect(lsSnapshot()).toEqual(before);
```

两条哨兵本轮**都跑绿**（出口命令第 2 次的逐条输出里点名可见：`✓ … P-24 …` / `✓ … P-25 …`）。
新增的 P-27/P-28 只做加法，没有替换、没有削弱任何一条既有断言。

---

## 5. 新增两条用例的原文（判据对账用）

```tsx
it('P-27 T-26b 取数形状：`period:"all"` 的全量返回在客户端裁到最近 365 天（两种包装同解）', async () => {
  const m = await import('../src/components/progress-data.js');
  expect(m.ANALYST_PERIOD).toBe('all');
  expect(m.ANALYST_WINDOW_DAYS).toBe(365);
  const stale = { date: dminus(m.ANALYST_WINDOW_DAYS), newWords: 999, total: 4000 }; // 窗口外一天
  const edge = { date: dminus(m.ANALYST_WINDOW_DAYS - 1), newWords: 1, total: 66 };  // 闭区间下界
  const points = m.growthPointsOf(makeAnalyst([stale, edge, ...HAPPY_POINTS]), TODAY);
  expect(points.some((p) => p.date === stale.date)).toBe(false);
  expect(points.map((p) => p.date)).toEqual([edge.date, ...HAPPY_POINTS.map((p) => p.date)]);
  expect(m.legendRangesOf('daily', m.cellsFromGrowth(points))).toBe(HEATMAP_LEGEND.range(1, 6));
  expect(m.curvePointsOf(points).map((p) => p.value)).toEqual([66, 70, 80, 92, 96]);
  expect(m.growthPointsOf(makeAnalyst([stale]), TODAY)).toEqual([]);
  expect(m.growthPointsOf({ growthCurve: [stale, edge, ...HAPPY_POINTS] }, TODAY)).toEqual(points);
});

it('P-28 T-26b 契约对齐：analyst 只发 `?period=all`、全量 URL 0 处 `days=`，且真实响应形状能落数', async () => {
  render();
  await settle();
  const analyst = fetchCalls.filter((c) => c.url.includes('/api/analyst'));
  expect(analyst.length).toBeGreaterThanOrEqual(1);
  for (const call of analyst) {
    expect(call.url).toContain('period=all');
    expect(call.url).not.toContain('days='); // 服务端从来没有这个入参（A-47 #106）
  }
  expect(cellByLabel(`${TODAY}，背了 4 个词`)).not.toBeNull();
});
```

最后一条 `growthPointsOf({growthCurve:[…]}, TODAY)` 等值断言，钉的是"**两条真实存在的读路径同解**"，
不是新增的兜底分支 —— 收形逻辑与改前一致（`isRecord(source.dataset) ? source.dataset : source` 原样保留），
只是注释里的理由换了。

---

## 6. 出口命令原文与摘要

命令（仓库根，共 2 次 = 额度用满）：

```
pnpm --filter @tm/app typecheck && pnpm --filter @tm/app test
```

两次一致：

```
$ tsc -p tsconfig.json --noEmit            # 0 错误
 Test Files  13 passed (13)
      Tests  270 passed (270)
   Duration  13.98s / 14.56s
```

- 条数对账：任务书基线口径 242 passed（12 文件，T-14d 刚 +3）。本轮 `progress-screen.spec.tsx` 自身 26 → **28**（+P-27/P-28）。
  全量 270 是并发批次（T-19a/T-16r3 等在飞的其它 spec）叠加后的数，**只增不减**，且 13 个文件全绿。
- 未在 `apps/app` 裸跑 `npx vitest run`（避开 104 条 localStorage 假红）。
- **0 条红，因此没有需要点名的非我名下失败**：`apps/app/src/lib/{auth-store,token-bridge}.ts`（T-19a 在飞）
  本轮两次出口均无红，未读未改。
- 探针用量（≤25）：读/查类合计 **20** 次（`grep` 定位真源与锚点为主：`AnalysisPeriod` 三面、`api/analyst` 全量引用、
  `#106/#108/A-48` 裁决区间、`days` 残留、`wc -l`/`git status`/长行扫描各 1，加 1 个临时哨兵脚本
  `tmp-logs/t26b-sentinel-probe.mjs`）。该脚本对三个文件跑四条哨兵正则 → **全部 false 命中**，
  Chrome84 四个禁用 API `structuredClone|Object.hasOwn|.at(|requestIdleCallback` 亦 **false**；跑完即删，
  仓库里没留任何临时文件（`.delivery` 主文档只 `grep -n` 后读命中区间，未通读）。出口命令 2 次 = 额度用满。

---

## 7. 上报未修（本轮权限外，需裁决）

1. **⚠ 任务书的前提交错：`@tm/shared` 并不导出 `AnalysisPeriod`。**
   任务书第 1 件写"入参改 `period:AnalysisPeriod`（从 `@tm/shared` import 类型）"，实测
   `grep -rn "AnalysisPeriod" packages/shared/src` → **0 命中**（shared 只有 `AnalyticsDataset.period: string`、
   `AnalysisReport`）。真源两处：`packages/server/src/services/analyst.ts:21` 与 `packages/agent/src/deps.ts:17`
   （值域逐字相同）。两处都在禁改面（`packages/**` 另一 agent 名下）。
   **本轮处置**：按 T-15 `HOST_PROFILE_COPY` / T-18c `PROGRESS_APP_COPY` 的先例，在
   `apps/app/src/data/queries/analyst.ts:35` **单点声明镜像类型** `export type AnalysisPeriod = '7d'|'30d'|'90d'|'all'`，
   值域逐字抄服务端、不增不减，注释写明 T-03 导出后整块换成 `import { type AnalysisPeriod } from '@tm/shared'`、
   三个调用点不动。**⇒ 派 T-03r**：由架构师在 `@tm/shared` 导出该类型（并考虑 `z.enum` 契约，一并解掉
   `analyst` 域"只有 interface、无法 safeParse"的既有缺口）。
   没有改走 `import type from '@tm/server'`：那会给纯 REST 客户端的 App 拉起一条跨包运行时依赖
   （`@tm/app` 的 deps 只有 `@tm/shared`/`@tm/ui`），并把服务端类型变成 App 的编译期依赖 —— 比镜像更糟。
2. **`AnalysisPeriod` 目前有两处真源**（`server/services/analyst.ts` 与 `agent/src/deps.ts` 各一份同值定义，
   靠 `AnalystPort` 的结构性类型对得上）。#106 说扩枚举"要牵 shared 与 services/analyst.ts"，实际还要牵第三处 agent。
   归 T-03 收口时一并看。
3. **非法 `period` 的 400 借用 `WORDBOOK_TOO_LARGE` 码**（T-26a 已在 #107 面上上报，本轮只是引用侧）：
   App 侧不因此多写分支 —— 400 走 `apiGet` 的既有失败面（`HTTP_ERROR`），页面按 §3.7.4 失败态显示，
   不伪装成 0 词。
4. `packages/server/test/integration/analyst-rest.spec.ts` 判据① 钉的是两侧 key 集合全等；
   **App 侧无法在同一轮加对账用例**（App 测试不能起服务端）。本轮以 P-28 钉"出网 URL 只有 `period=`"，
   两侧同形的最终证据仍在服务端那条集成用例里。

---

## 8. 遗留清单

1. `cellsFromReviewDates`（兜底源，来自 `profile.get.reviewDates`）**未做 365 天裁剪** —— 该函数属投影算法，
   任务书明令不动。影响面：主源为空、且 `reviewDates` 含一年前的日期时，`positiveDays`/`legendRangesOf` 的
   数会比可见 53 周宽。与 §3 第 4 点同源，已登记为口径差；要抹平需另开一轮（改点在投影层或 `profile` 数据面）。
2. `analyticsDatasetQueryOptions`（`GET /api/analyst/dataset`）入参与键已对齐，但**消费者仍是 0 个**。
   若后续要做"进页只拉图形、洞察按需拉"的拆分（省 LLM 配额，正是 #107 单开这条端点的理由），
   接线点在 `ProgressScreen` 的 `report` 那一条，属 R-19 的下一轮，不在 T-26b 范围内。
3. `PROGRESS_APP_COPY` 的 7 条宿主注入串（含 `heatSectionTitle` / `heatSparse` 两条自拟文案）仍在等 T-03/PM 定稿
   （T-18c 遗留，本轮未动、未新增）。
4. P-13 依赖的 `Heatmap.onBrowseToggle` 屏内补丁行（T-18c-r3）仍在，`packages/ui` 侧的组件缺口未变。
5. 真机端到端（Android WebView 打现网 `/api/analyst?period=all`）仍未跑；本轮证据面是
   App 单测的 URL/形状断言 + 服务端集成用例的两侧同形判据，两者拼起来才是完整链路。
