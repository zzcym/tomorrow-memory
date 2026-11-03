# 开发报告（前端）— T-14b（T-14 数据层第二个微轮）

任务书来源：`.delivery/04-adjudications.md` A-40 第 49 / 56 / 57 行（grep 定位后按行读，未通读三份主文档）。
文件边界实测：`tools/ownership.json` — `apps/app/src/data/**`(:411)、`apps/app/src/router.tsx`(:393)、
`apps/app/src/host.tsx`(:419)、`apps/app/src/main.tsx`(:453)、`apps/app/test/{rest-fetcher,offline-queue,startup,router}.spec.{ts,tsx}`(:474) 均记 T-14。

## 完成清单

| 项 | 状态 | 实现文件 | 备注 |
| --- | --- | --- | --- |
| (a) A-40 #49① 词本读侧逐条分流 | done | `apps/app/src/data/queries/wordbook.ts` | 新增纯函数 `readWordbookList` + 诊断位 `lastWordbookListRead`；`wordbookQueryOptions().queryFn` 改为只走它 |
| (a) A-40 #49② pull 半形不静默 | done | 同上 | `readPullPayload`（可单测的纯函数）+ `pullWordbook` 改 async：认不出来 ⇒ **带 since 时退回全量重取一次**，仍不成 ⇒ 抛 `ApiError('BAD_RESPONSE')` |
| (a) A-40 #49③ 补两条用例 | done | `apps/app/src/data/queries/wordbook.spec.ts`（新增 15 条） | 含 65 字符词条的快照必须解析成功（两种包装都钉）+ pull 半形必须不静默 + 两条反永真守卫 |
| (b) A-40 #56① `/api/tutor` 信封收形 | done | `apps/app/src/data/queries/lookup.ts` | 新增 `unwrapTutorPayload`：先试裸 `TutorContent`，再剥信封取 `content` 校契约；都不合才 `unwrapParse` 抛 `BAD_RESPONSE` |
| (b) 数据层用例 | done | `apps/app/src/data/queries/lookup.spec.ts`（新增 5 条） | 验收主口径仍是 `test/detail-screen.spec.tsx` **一字未改即转绿**（见下） |
| (c) A-40 #56② `router.spec.tsx` 2 红 | done | `apps/app/test/router.spec.tsx` | 性质判定 = **夹具缺 Provider**（非生产缺陷）：`src/main.tsx` 的 `Root` 本来就挂 `QueryClientProvider > AppProviders > TabBarShell/AppRoutes`；夹具只挂了后两层。补齐同构挂载点，未动 `screens/**` |

### 判据映射（三项各自钉在哪）

- **#49①「超长词保留并正常展示、不拖垮整批」** → `wordbook.spec.ts`：
  「`{data:[…]}` 快照里含一个 65 字符词条 ⇒ 解析成功，两条都在，超长词原样保留」「裸数组 + 100 字符（旧写侧上限）」「形状不合但有词面（数值字段坏掉/带未知键）⇒ 保留展示、坏字段按缺省、未知键不丢（R-03⑦）」「经真实出口 `wordbookQueryOptions().queryFn` + fetch 的端到端一条」。
  分流规则：`WordbookArraySchema` 整批先试（干净数据零额外开销，与改前同路径）→ 失败才逐条 `WordbookEntrySchema.safeParse` → 仍失败的走 `salvageEntry`（有非空 `word` 就原样保留，`addedAt/lastReview/reviewCount` 坏掉按缺省，未知键不动）→ 连词面都取不出才丢，且计入 `report.dropped`（不静默）。
  整批只在这两种情况判 `BAD_RESPONSE`：响应里根本没有数组、条数越出 `WORDBOOK_MAX_ENTRIES`。
- **#49②「pull 的半形禁止静默空」** → `wordbook.spec.ts` 的 6 条：半形 + `since` ⇒ 断言发了第 2 次**不带 `since=`** 的全量请求并交出 `entries`；两次都是半形 ⇒ `rejects` `BAD_RESPONSE` 且 `calls` 长度为 2；不带 `since` 拿到半形 ⇒ 一次即报错（不重复打）；`null`/`'pull'`/缺 `version` ⇒ `readPullPayload().kind === 'unknown'`。
  关键改动：改前的洞正是"`full.success` 为 false 后 fall-through 到增量分支、把 `{version,updatedAt}` 当增量返回"，现在**半形不再算增量分支**（增量必须真的有 `changed`/`removed` 数组）。
- **#56①「展开才发 1 次请求」** → 验收 = `apps/app/test/detail-screen.spec.tsx` 32/32（该文件本轮**零改动**，见自证）。数据层另有 5 条钉 unwrap 本身（信封/裸形/空内容/null/垃圾），含一条 6 个输入的反永真循环。
- **#56②** → `apps/app/test/router.spec.tsx` 10/10（其中判据③-3 的 2 条）。
  同时把该 describe 里"渲染出该路由的懒加载页"这条断言改成**按 `load()` 的 `default` 身份分叉**（`expectRenderedScreen`）：仍指向 `shell/ScreenFallback` 的（`/study`、`/wordbook`、`/progress`、`/me` = T-18/T-19 在飞）断言内容区是骨架屏；已接线的（`/` = `LookupScreen`）断言骨架屏与 Suspense 占位都消失、`#main` 里出现该页自己的标识区块。
  这不是放宽：原断言（"每条 tab 都渲染 `screen-fallback`"）在 T-17r3a 把 `router.tsx:50` 接成真页面后就已经**不为真**了，新写法对每个 tab 都要求"渲染的必须正是它登记的那个组件"，且 T-18/T-19 接线后判据自动继续成立。

## 自检与冒烟

| 命令（均在仓库根） | 结果 |
| --- | --- |
| `pnpm --filter @tm/app test` | `Test Files 8 passed (8)` / **`Tests 127 passed (127)`**，0 failed。原始输出落 `%TEMP%/t14b/exit.md` |
| `pnpm --filter @tm/app typecheck` | 唯一 1 条错：`src/components/due-badge-data.tsx(29,38) TS2724 '"../data/startup.js"' has no exported member named 'useSyncStatus'` — **不在 T-14b 名下**（ownership.json:967 = T-18，本轮禁触清单内）。T-14b 的 5 个文件 0 错 |
| `npx eslint <本轮 5 个文件>` | 无输出（0 problem） |
| `git status --porcelain`（只读） | 确认改动只在 `apps/app/src/data/**` 与 `apps/app/test/router.spec.tsx`；仓库内无临时文件（临时件在 `%TEMP%/t14b/`） |

127 = TPM 13:18 账面的 107 + 本轮新增 20 条用例（`wordbook.spec.ts` 15、`lookup.spec.ts` 5）。
出口命令各跑 2 次：第 1 次是实现自检（`1 failed | 125 passed`，红的正是我自己新写的一条期望值，详见 exit.md 的按语），第 2 次是出口跑。

Chrome84 红线自查：新增代码只用 `Array.isArray` / `typeof` / `Number.isInteger` / 对象展开 / `filter`+`map` / `indexOf`，未用 `structuredClone`、`Object.hasOwn`、`Array.prototype.at`、`requestIdleCallback`。

## 未改断言 / 未放宽门禁（自证）

1. **`packages/shared/src/contracts/**` 一字未动** —— `WordbookEntrySchema` 仍是 `max(WORD_MAX_LENGTH)`(=64)，`trpc-shape` 基线零 diff，`packages/shared/test/contracts.spec.ts:262` 的既有绿断言未被触碰。本轮 `@tm/shared` / `@tm/server` / `@tm/ui` / `@tm/web` 全部零改动。
2. **未改任何既有断言**：`apps/app/test/detail-screen.spec.tsx`、`apps/app/test/lookup-screen.spec.tsx` 本轮零改动（前者 32/32 全绿即 (b) 的验收）；`router.spec.tsx` 是 T-14 名下夹具，改动 = 补 Provider + 把一条**已因他人接线而失真**的渲染断言改写为按登记身份判定（上一条已注明理由，未删任何一条断言，判据③-3 的 `it` 数量不变）。
3. **未 skip、未降门禁**：本轮没有 `it.skip`/`describe.skip`/`expect.soft`，没动 `vite.config.ts` 的 `dist-guard`，没动 `tools/**`。整批容错仍保留两条硬失败路径（非数组、条数越界），并有专门用例钉住"容错 ≠ 什么都收"。
4. **无 git 写操作**：只跑了 `git status --porcelain`（只读）。`data.db` / `packages/server/data.db` 未接触，本轮不需要集成用例（纯 App 数据层 + 夹具）。

## (a) 为什么不走"把 `WordbookEntrySchema` 放宽到 100"这条路

契约的 64 是**写侧**口径（`WORD_MAX_LENGTH`），100 是旧 `PUT` 面的 legacy 口径，两者本就该分开——把它合并成 100 等于用放宽契约来掩盖读侧缺的分流，代价是：① 直接二次撞 `trpc-shape` 基线（要消耗基线额度）；② `packages/shared/test/contracts.spec.ts:262` 的既有绿断言会被改红，那正是"改断言迁就实现"的禁区；③ 契约一旦放宽，读侧仍然只有一条 `safeParse` 全有或全无的通路，**下一个未知形状照样整页挂**，缺陷本身没被修掉。所以按 A-40 #49 的裁决只做读侧逐条分流，契约层区分 write-max / legacy-max 的长期方案留给已登记的 **F-12**（下一期）。

## 越界申请

1. **【要求裁决，本轮未动】`apps/app/src/components/due-badge-data.tsx`(:29) 从 `../data/startup.js` import `useSyncStatus`** —— 该 hook 的现有唯一实现在 `apps/app/src/shell/TabBarShell.tsx`(:53，T-14 名下)，`LookupScreen.tsx:55` 走的就是这条路径。文件属 T-18 且在并行编辑（本轮两次 typecheck 之间该行由 :28 移到 :29），T-14b 按纪律未碰。两种收口方式请择一裁决：
   - (推荐) T-18 把 import 改成 `../shell/TabBarShell.js` —— 一行，零归属变化；
   - 或授权 T-14 把 `useSyncStatus` 的**唯一实现**移到 `apps/app/src/data/startup.ts`（store 本体在那里）、`TabBarShell` 改为 re-export —— 代价是数据层模块要 import React。
   在任一种收口前，`@tm/app typecheck` 就是 1 条红，且**不是** T-14b 引入的。
2. 本轮无其他越界需要：三项都在 T-14 名下，未申请窄授权，也未改 `host.tsx` / `main.tsx`（装配面本来就是对的，(c) 的性质判定因此落在夹具一侧）。

## 已知限制与 TODO（诚实列出）

- (a) 的"正常展示"只证到**数据层出口**（`wordbookQueryOptions().queryFn` + 假 fetch 端到端解析出超长词）。真正的 `WordbookScreen` 在 T-18 名下、本轮在飞，未渲染它（引在飞文件做断言会互相踩）。已核对其消费面 `components/result-row.tsx:450` 只做 `entry.word.toLowerCase()`，分流后的条目在该路径上必然可渲染；请 T-18/UAT 在词本页补一条"含 65 字符词的列表不报错"的页面级用例。
- `lastWordbookListRead()` 是"最近一次整批读取"的诊断位，只反映最后一次调用（非累计），面向排障与用例，不进缓存、不面向用户文案。
- 服务端 `GET /api/wordbook/pull` 目前恒回全量（`routes/wordbook.ts:125-130`，其自陈偏差 D-3），所以"增量分支"在现网暂时走不到；本轮的增量收形与半形防护是按 §4.4.1 协议面写的，等 T-09 侧真发增量时才被生产命中。
- `/api/tutor` 的信封仍未在契约里表达（A-40 #56① 明令走数据层 unwrap）。契约层如何登记这个信封，属 F-12 同族的长期账，本轮不新开。

## 给测试的提示

- 重点看 `apps/app/src/data/queries/wordbook.spec.ts` 的两条反永真（"响应连数组都不是"、"条数越界"）—— 若有人把读侧容错改成"永远不报错"，这两条会先红。
- pull 的重试是一次性的（`since` 存在 ⇒ 最多第 2 次全量），若 UAT 在弱网看到词本同步链第 2 步偶发多一个请求，是这个防护而非风暴；`startup.ts` 的每步隔离保证它不会阻塞冷启动。
- 真机（Chrome84 WebView）没跑：本轮纯数据层与夹具，无 DOM 之外的新 API 面。
