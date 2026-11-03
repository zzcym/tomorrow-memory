# 开发报告 · T-17 第 3 轮 B（前端 / App 词详情页）

范围：`apps/app/src/screens/WordDetailScreen.tsx` + `apps/app/test/detail-screen.spec.tsx`（独占两件）。
未碰：`components/result-row.tsx`、`components/ai-mnemonic-bar.tsx`、`lib/**`、`native/**`、`router.tsx`、
`data/**`、`packages/{shared,server,ui}/**`、`apps/web/**`、`test/lookup-screen.spec.tsx`。

## 一句话根因

**20 条红（TPM 单上的 5 类全在里面）不是文案错，是用例的 `settle()` 只排空微任务队列**：
`@tanstack/react-query` 的观察者通知走 `NotifyManager` 的 `setTimeout` 批处理（>0ms 宏任务），
微任务式 flush 永远等不到 `query.data` 上屏 ⇒ 整张卡停在 `WordDetailCard` 的 loading 骨架分支
（`packages/ui/src/patterns/WordDetailCard.tsx:156-167`：`loading=true` 时 `article` 里只有一个 `SkeletonBlock variant="result-bar"`），
于是 `#word-detail-head` / `#word-detail-empty` / `#word-detail-mnemonic` / `[aria-label="释义"]` **全部查不到** ⇒
`textOf()` 一律 `''`、`click(null)` 一律抛 `找不到要点的元素`。本屏实现与 shared 文案都没有错。

## 定位过程与证据（先定位后动手，未改任何文案）

1. 单独跑本 spec（`pnpm --filter @tm/app exec vitest run --root ../.. --project @tm/app detail-screen`，
   落 `%TEMP%/t17r3b/dbg1.md`）+ 在独占 spec 里临时插一条 dump 用例打印 `container.innerHTML`（跑完即删）：
   - `dbg1.md:7`：`<article data-testid="detail-card" class="rounded-xl border border-hair bg-surface p-4">` 内**只有** 4 块 shimmer，
     没有区 2–8 的任何节点 ⇒ 命中 `WordDetailCard.tsx:156` 的 loading 分支（`loading = word !== '' && query.isPending`，见 `WordDetailScreen.tsx:235`）。
   - `dbg1.md:8`：`fetchCalls` = [`/api/lookup?word=happy&direction=en2zh`, `/api/wordbook`] ⇒ **请求已发出、词头已解析对**，只是结果没上屏。
   - `dbg1.md:11`：同一文件 33 条里 20 红，且**用 `qc.setQueryData` 预置缓存的 R-10③ 两条是绿的**（首帧即有数据、不需要跨宏任务）——
     这条反差把根因钉死在"异步结果 flush"，而非取数/props/文案。
2. 对照同批的 `apps/app/test/lookup-screen.spec.tsx:133-145`：A 轮同名 helper 的注释已写明该机制
   （`setTimeout` 批处理，"只排空微任务队列会出现『请求已发出、结果还没上屏』"），并每轮 `act(async () => await setTimeout(12))`。
   本 spec 的 `settle()`（原 160-164 行）漏了这一步 ⇒ **同一轮两份 spec 的 flush 口径不一致**。
3. 排除项（都有证据，不再动）：
   - shared 四条串齐全且逐字正确：`packages/shared/src/constants/copy.ts:152-156`（`没找到这个词` / `查询失败了 · 再试一次`）、
     `:220-226`（`还有 N 句` / `英文释义` / `AI 记法 · 词根 / 口诀 · 点击查看` / `立即背这个词`）、`PLAIN_TERMS.continueAfterLogin`（`登录后可以继续`，UI §6.8 `03-ui-spec.md:1424`）。
   - UI 规范文案表口径：`03-ui-spec.md:1461`（查不到 = `没找到这个词` + 副行）、`:1462`（网络失败 = `查询失败了 · 再试一次`）、
     `:663`（收起行整行是 `<button aria-expanded=false>`，左 `✦` 右 `›` 均为图标）、`:676`（未登录可读 + 两个动作走登录）。
   - `@tm/shared`/`@tm/ui` 的 `main` 都指 `src/*.ts`（`packages/shared/package.json`、`packages/ui/package.json`），无 dist 陈旧问题。

## 改动清单（只落在两个独占文件）

| 文件 | 位置 | 改动 |
| --- | --- | --- |
| `apps/app/test/detail-screen.spec.tsx` | `settle()` | 微任务循环 → `rounds × act(async () => setTimeout(12ms))`，口径对齐 `lookup-screen.spec.tsx:139`，注释写明为什么 |
| 同上 | 新增 `readableText()` helper | 取可读文案节点、剥 `aria-hidden` 装饰图标（`›` / `⌄`），依据 `03-ui-spec.md:663` |
| 同上 | 判据④ 第 1 条收起行断言 | 先钉 `WORD_DETAIL_COPY.mnemonicCollapsed === 'AI 记法 · 词根 / 口诀 · 点击查看'`，再钉屏上可读文案与 shared 常量逐字相等（比原来更严，不放宽） |
| 同上 | 判据④ 第 1 条 | 新增 `import { WORD_DETAIL_COPY } from '@tm/shared'`：验收串经 shared 取词，用例不抄第二份 |
| 同上 | `R-09③ > 有应用内历史时返回` | 造历史改为 `navigate()` + `commitLocation(…, false)` 两步（即 `router.tsx:197-232` 真实链路的两端），断言原样保留 |
| `apps/app/src/screens/WordDetailScreen.tsx` | — | **零改动**（见下判定：本屏实现无缺陷） |

## 5 类红的判定与取证

| # | 用例（TPM 单口径） | 判定 | 依据 |
| --- | --- | --- | --- |
| 1a | 判据⑥ 未登录点「立即背这个词」→ 先登录并带上词 | **用例错**（helper 未 flush 宏任务） | 现绿：`exit_test2.md` `✓ …未登录点「立即背这个词」… 205ms`，`#/login?intent=study&word=happy` 由 `WordDetailScreen.tsx:227-233` 产出，实现无错 |
| 1b | 判据⑥ 已登录点同按钮 → `#/study?focus=…`（交棒 T-18 接缝） | **用例错**（同上） | 现绿：`✓ …已登录点「立即背这个词」= 打开背词 tab 并把词放进 ?focus= 213ms` ⇒ 接缝串 `#/study?focus=happy` 已钉住，T-18 只要消费 `?focus=` |
| 1c | 判据⑥ 未登录展开记法 → 0 请求 + 「登录后可以继续」 | **用例错**（同上） | 现绿：`✓ 未登录展开记法 = 0 请求 + 「登录后可以继续」，再试一次去登录页 395ms` |
| 2 | R-09④ 空态 `没找到这个词` | **用例错**（同上，非文案错） | 现绿：`✓ 查不到 = 空态卡 + 重试 + 次按钮「去背单词」 372ms`；串来自 `copy.ts:152-155`，未改一字 |
| 3 | R-09④ 错误态 `查询失败了 · 再试一次` | **用例错**（同上） | 现绿：`✓ 网络失败 = 标题换成失败文案，重试确实再发请求 390ms`；`copy.ts:156` |
| 附 | §3.4.1 词形变化 / 区块顺序 / 例句折叠 / 英文释义 / 喇叭 / 星标 / 标题 等 15 条同源红 | **用例错**（同一 helper） | 一并转绿，见 `dbg3.md` |
| 附 | `R-09③ > 有应用内历史时返回` | **用例错**（造历史的方式绕过 `stack` 维护） | `router.tsx:258-260` `canGoBack() = stack.length > 1`，而 `stack` 只由 `commitLocation()` 追加（`:223-232`），监听器在 `startRouter()`（`:235-248`）里；本 spec 挂单屏不挂 `AppRoutes` ⇒ 光调 `navigate()` 栈不长。改后 `history.back` 调用 1 次 + hash 不变两条断言均绿 |
| 附 | 判据④ `展开才发 1 次请求；内容四类齐全；再点不重复发` | **共用文件错**（仍红，见「越界申请」） | `data/queries/lookup.ts:49` 用裸 `TutorContentSchema` 收形，服务端实发信封 `{word,level,content,cached}`（`packages/server/src/routes/tutor.ts:34`）⇒ 必判 `BAD_RESPONSE` ⇒ `mnemonicState='failed'`，`ai-mnemonic-content` 永不为节点。反证：同一用例族里给**裸形状**的 3 条（失败降级/重试、空内容整块不显示、挂住出骨架）**全绿** ⇒ 状态机与本屏接线没错，错在数据层 parse |

## 出口真实输出（原文落 `%TEMP%/t17r3b/exit.md`）

1. `pnpm --filter @tm/app test -- detail`（该 filter 实际不过滤，跑的是全套；已在报告里如实标注）
   - 第 1 次（settle 修完、后两条断言未修）：`Tests 4 failed | 103 passed (107)`
   - 第 2 次（收尾，等价于 `pnpm --filter @tm/app test`）：**`Test Files 2 failed | 4 passed (6)` / `Tests 3 failed | 104 passed (107)`**
     剩余 3 条：
     - `detail-screen.spec.tsx > 判据④ 展开才发 1 次请求；内容四类齐全；再点不重复发（缓存复用）` → `AssertionError: expected null not to be null`（`:315`，共用文件错，见越界申请）
     - `router.spec.tsx > 判据③-3 五个 tab…` ×2 → `Error: No QueryClient set, use QueryClientProvider to set one`，栈顶 `LookupScreen src/screens/LookupScreen.tsx:112` ⇒ **A 轮名下还剩 2 条红**（路由/查词页装配），不在本轮范围，未代改
   - `test/lookup-screen.spec.tsx` 本轮**全绿**（A 轮已并修）
2. `pnpm --filter @tm/app typecheck` → `exit=0`，`tsc -p tsconfig.json --noEmit` 无输出（**0 错**）

## 越界申请（不改，请 TPM 派单）

- **A-1｜`apps/app/src/data/queries/lookup.ts:45-51`（tutor 契约收形）** —— 判据④ 主用例唯一残留。
  两种改法请拍板：
  (a) 数据层 unwrap：`parse: (raw) => unwrapParse(TutorContentSchema.safeParse((raw as {content?:unknown})?.content ?? raw))`（`ai-mnemonic-bar.tsx:36-39` 的 `asTutorContent` 已按"两种形状都吃"预备，此改动后该文件零改动）；
  (b) 契约补齐：`packages/shared/src/contracts/lookup.ts` 加 `TutorResponseSchema = z.object({word,level,content:TutorContentSchema,cached})` + `parseTutorResponse()`，数据层用它。
  (b) 更合 §5.2「出参一律经 shared 的 zod 收形」，但动 `packages/shared`（T-03 边界）。修好后本屏与 `detail-screen.spec.tsx` 均**零改动**即转绿。
  真机影响：AI 记法展开后永远停在失败态（R-09⑥ / R-14③ 不可达）。

## 待拍板项

- **P-1｜`WordDetailCard` 区块 7 收起行缺左 `✦` 图标**（`packages/ui/src/patterns/WordDetailCard.tsx:374-388` 只渲染右侧 `›`），
  而 `03-ui-spec.md:663` 定稿是「左 ✦ 图标 `text-brand` 20px，右 `›`」。属 T-05/T-12 的共用组件，未自改。
- **P-2｜`exchange.base`（`0 原形`）无档可落**：`INFLECTION_LABELS` 无 `0:`（`WordDetailScreen.tsx:92-104` 已注明，本屏故意不映射），
  §3.4.1 表里却有 `0 原形`；shared 缺口，第 2 轮已登记，仍待 PM/UI 拍板。
- **P-3｜本屏顶栏无可见页面标题**：shared 无「词详情」串，现用 `sr-only` `<h1>{word} · 明日记忆</h1>`（`WordDetailScreen.tsx:245-257`）。
  若需可见标题，请定稿后再加常量，勿在 App 侧写字面量。
- **P-4｜交棒 T-18 的接缝已钉住**：`#/study?focus={word}` 由本屏写入（`WordDetailScreen.tsx:232`），消费方 T-18 未接时动作退化为"打开背词 tab"，不报错。

## 自检与冒烟

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @tm/app test -- detail`（= 全套） | `Tests 3 failed \| 104 passed (107)`；本屏 spec 31/32 绿 |
| `pnpm --filter @tm/app typecheck` | exit 0，0 错 |
| `pnpm --filter @tm/app exec vitest run --root ../.. --project @tm/app detail-screen`（诊断，非出口） | 改前 20 红 → 改后 1 红（仅剩 A-1） |

未跑：真机/Chrome84 手工冒烟与 375×667、412×915 `getBoundingClientRect` 量测（判据⑤ 仍只有源码级与内联样式级哨兵，见 `detail-screen.spec.tsx` 末尾两条），
按第 2 轮口径交给 T-23 的 CDP 用例。

## 给测试的提示

- 本屏任何"元素找不到 / 文本为空"的红，先怀疑 `settle()` 是否覆盖了 react-query 的宏任务批处理窗口，再看文案。
- 断言可读文案一律用 `readableText()`，`textOf()` 会把 `aria-hidden` 的 `›`/`⌄` 图标算进串里。
- 需要在单屏 spec 里模拟"应用内历史"时，必须 `navigate()` + `commitLocation()` 成对；只调 `navigate()` 时 `canGoBack()` 恒 false（`AppRoutes` 未挂 ⇒ 无 `hashchange` 监听）。
- A-1 修好后，`判据④ 展开才发 1 次请求…` 一条同时验证 R-14③ 缓存复用（卸载再进不重发），值得回归跑一次。
