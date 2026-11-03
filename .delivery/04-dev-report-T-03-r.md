# T-03r 开发报告 · 批次 4C 第二波（`WORDBOOK_COPY` 词本三态改串 + A-43 #80 四档字面串上收）

- **任务代号**：T-03r（依 `.delivery/04-adjudications.md` **A-46 #95**（553 行）派单，解锁条件 = **A-46 #94**（552 行）PM-fix5 判绿）
- **角色**：`packages/shared/src/constants/**` 唯一 owner（T-03 名下）
- **时间**：2026-09-21 01:30（+08:00）
- **依据（只读这两份）**：`.delivery/01-prd-fix4.md`（208 行，全文）· `.delivery/04-adjudications.md` **仅 grep 命中区间**（#76=517、#77=518、#78=519、#79=520、#80=521、#94=552、#95=553、#105=570）
- **本轮性质**：纯代码轮，零文档改动（本报告除外）、零 git 写操作、零 `data.db` 触碰、零测试文件改动。

---

## 一、交付物清单（文件 + 行数 + Δ）

| # | 文件 | 本轮前 | 本轮后 | Δ | 归属/性质 |
|---|---|---|---|---|---|
| 1 | `packages/shared/src/constants/copy.ts` | 758 | **806** | **+48** | ✅ 我名下（唯一 shared 改动面）：① 11 步改串 + `pullFail` 拆 4 key；② 四档筛选/排序字面串上收（新增 4 个导出 + 2 个类型）；③ `SWITCH_TO_REGISTER_LABEL` 声明点上移（见 §五-9） |
| 2 | `apps/app/src/components/wordbook-toolbar.tsx` | 220 | **220** | **0**（净持平；删 25 行自带字面量、增 22 行 import/转发 + 头注释 +3） | ⚠ ②点名面的**实际载体文件**（`filter-chips.tsx`/`sort-menu.tsx` 盘上不存在，见 §六-1）：仅字面量改 import，**组件本体/交互/导出名一个未动** |
| 3 | `apps/web/src/lib/api/wordbook.ts` | 402 | **398** | **-4** | ②点名面：`HOST_COPY.sort/filter` + 两个取值域数组改 import，**未跳过**（mtime 证据见 §五-8） |
| 4 | `.delivery/04-dev-report-T-03-r.md` | 0 | 本文 | 新建 | 我名下唯一 `.delivery/` 文件 |

**两端测试文件改动 = 0**（`git status --short apps/app/test apps/web/test` 本轮无新增改动；本报告未改任何 `*.spec.*`）。
**未触碰**：`packages/server/**`、`scripts/**`、`packages/ui/**`、`apps/app/src/{screens,router.tsx,data/**}`、`.delivery/` 其余文件。
**真实库只读自证（跑前跑后同一读数）**：`data.db` = **253952 字节 / mtime 2026-09-18 04:05:38**（与 A-46 #96 记录的指纹逐字一致）；`packages/server/data.db` = **0 字节 / mtime 2026-09-17 00:10:53**。本轮零 DDL/DML、零写句柄、mtime 未变。

---

## 二、逐项改动表（旧串 → 新串 → PM 出处行号）

### A. `WORDBOOK_COPY` 的 §5 十一步（`01-prd-fix4.md` §5 表 = 164-176 行；对账依据 = §1 表 ① 19-29 行）

| 步 | key | 旧值（代码现值） | **新值（逐字照抄 §3.6.5）** | PM 出处 | 状态 |
|---|---|---|---|---|---|
| 1 | `emptySignedOut.title` | `还没有收进来的词` | `登录后才能看到你的单词本` | §5:166 / §1:19 / UI 842 | ✅ |
| 2 | `emptySignedOut.subtitle` | `登录后可以从上一台设备继续` | `同一个手机号，词本和进度都会跟着走` | §5:167 / §1:20 / UI 842 | ✅ |
| 3 | `emptySignedOut.cta` | `手机号登录` | **不动** | §5:168 / §1:21 | ✅ 未动 |
| 4 | `emptySignedOut.link` | `随便查几个词` | **`SWITCH_TO_REGISTER_LABEL`**（引用常量，渲染值 `没有账号？注册`，未重打字面量） | §5:169 / §1:22 / §4(d):154 / `copy.ts` 原 483 | ✅（连带 TDZ 上移，见 §五-9；**宿主副本撞车见 §五-2**） |
| 5 | `emptyLoggedIn.title` | `还没有收进来的词` | `单词本还是空的` | §5:170 / §1:23 / UI 840 | ✅ |
| 6 | `emptyLoggedIn.subtitle` | `查词时点星标，词就会进到这里` | `查到想记的词，点一下星标就存到这里` | §5:171 / §1:24 / UI 840 | ✅ |
| 7 | `emptyLoggedIn.cta` | `去查词` | **不动** | §5:172 / §1:25 | ✅ 未动 |
| 8 | `filteredEmpty.title` | `没有符合条件的词` | `这里没有符合条件的词` | §5:173 / §1:26 / UI 841 | ✅ |
| 9 | `filteredEmpty.subtitle` | `换个筛选条件试试` | `换个筛选，或者清空搜索看看` | §5:174 / §1:27 / UI 841 | ✅ |
| 10 | `filteredEmpty.cta` | `清除筛选` | `清空筛选和搜索` | §5:175 / §1:28 / UI 841 | ✅ |
| 11 | `pullFail`（原 343 行的单串） | `'单词本没打开 · 再试一次'` | **拆为 4 key 对象**（见下表 B） | §5:176 / §1:29 / §3 表 ③:101-106 / UI 845 | ✅ 整条作废、不留别名、不加 `@deprecated` |

**逐字纪律自证**：全部新串从 §5 表「到」列整段复制，全角逗号 `，`、全角问号 `？`、无句末句号、无多余空格；`as const` 与对象顺序保持；`noGloss`（原 344 行注释）、`syncBadge`（原 362 行）、`alreadyAdded`（原 370-375 行）三处注释块**原文保留**；§2 表 A（7 条规范缺口 = `batch.*` 4 条 + `syncBadge.{pending,offlineSilent,replayFail}` 3 条）**一条未动**（`startup.spec.ts:238` 的优先级链锁仍在）；§2 表 B（`sortMenu` 3 档串、`swipeDelete.confirm`、`swipeDelete.undoToast`）**一条未动**；表 C（`deleteNotQueued` / §3.6.5-5 两串）**未补 key**（张力见 §五-4）。

### B. `pullFail` 拆分（`01-prd-fix4.md` §3 表 ③ 101-106 行，逐 key 对 UI 845 行四段）

| 新 key | §3.6.5-6 的段 | 定稿值（逐字） | 已落 |
|---|---|---|---|
| `pullFail.title` | 标题 | `没能取到你的单词本` | ✅ |
| `pullFail.subtitle` | 副行 | `再试一次，或者先回首页查词` | ✅ |
| `pullFail.retry` | 按钮（主） | `重试` | ✅ |
| `pullFail.lookup` | 按钮（次） | `去查词` | ✅ |

`pullFail` 原值 `单词本没打开 · 再试一次` 在全仓**无任何消费点**（`grep pullFail` 仅命中 `copy.ts` 与两处宿主注释），拆形状零连带风险，实测坐实 §3 表 ③ 的判断。

### C. ②「字面串上收」新增的 shared 唯一真源（`copy.ts` 现 405-432 行，紧接 `WORDBOOK_COPY` 之后）

| 新导出 | 值 | 取代的两份手抄 |
|---|---|---|
| `WORDBOOK_SORTS` | `['recent','alphabetical','longestIdle','mostForgotten'] as const` | `wordbook-toolbar.tsx:31` + `lib/api/wordbook.ts:79` |
| `WordbookSort`（type） | 同派生 | 两处同名本地 type（保留为派生别名，消费方 import 路径不动） |
| `WORDBOOK_FILTERS` | `['all','new','learning','mastered'] as const` | `wordbook-toolbar.tsx:34` + `lib/api/wordbook.ts:82` |
| `WordbookFilter`（type） | 同派生 | 同上 |
| `WORDBOOK_SORT_LABELS` | `{ alphabetical:'字母', recent:'最新加入', longestIdle:'最久没碰', mostForgotten:'最常忘' } as const` | `WORDBOOK_APP_COPY.sort` + `HOST_COPY.sort` |
| `WORDBOOK_FILTER_LABELS` | `{ all:'全部', new:'新词', learning:'在背', mastered:'已掌握' } as const` | `WORDBOOK_APP_COPY.filter` + `HOST_COPY.filter` |

**三处改 import 的落法（只换真源，不动公开面）**：
- `wordbook-toolbar.tsx`：`WORDBOOK_APP_COPY.sort` / `.filter` 改为引 `WORDBOOK_SORT_LABELS` / `WORDBOOK_FILTER_LABELS`；数组与 type 改为 `import` + `export { WORDBOOK_FILTERS, WORDBOOK_SORTS }` **转发**，`sortLabel()`/`filterLabel()`/`isXxxValue()` 一字未动 ⇒ `WordbookScreen.tsx:75-77,646` 与 `wordbook-screen.spec.tsx:52-54` 的 import 路径与断言**零改动**。
- `lib/api/wordbook.ts`：`HOST_COPY.sort/filter` 同上；数组改 import + 转发，`page.tsx:29-30` 消费路径不变。
- 结果：**四档筛选/四档排序这两套串在全仓只剩一处字面量声明**（`packages/shared/src/constants/copy.ts`），验证见 §三-2。
- 未动 `packages/ui`、未把组件搬进 `@tm/ui/patterns`（#80 原话：组件本体留在 app 侧）。
- 未改 `WORDBOOK_COPY.sortMenu` 的 3 条旧串（§2 表 B 明写归 #80 之外的轮次，两件事不是一回事，我在新块注释里也钉了这条边界）。

---

## 三、§5 闭合哨兵：原文命令与命中数

### 1. 判据 (i) 原文命令（`01-prd-fix4.md`:180 逐字照抄，加 `-r` 与产物排除）

```
grep -rn --exclude-dir=node_modules --exclude-dir=.next "还没有收进来的词\|登录后可以从上一台设备继续\|随便查几个词\|查词时点星标\|换个筛选条件试试\|清除筛选\|单词本没打开" packages/ apps/
```

**命中数 = 33（原始）/ 1（源码）**。逐类归属（复核于 01:35，两次读数见下）：

| 命中类别 | 命中数 | 是否计入判据 | 说明 |
|---|---|---|---|
| `packages/shared/dist/**`（`constants/copy.{js,d.ts}` 与 `src/constants/copy.{js,d.ts}` 四文件，各 8 行） | **32** | **不计**（§5:180 原文即「`dist/` 产物除外，需重跑构建刷新」） | 陈旧构建产物，见 §五-6；`@tm/shared` 的 `main/types` 直指 `src/index.ts`，两端 typecheck 不吃 dist，故不影响出口命令 |
| `packages/ui/test/patterns.spec.tsx:920` | **1** | **源码命中，但不属本轮差口** | T-05 名下 `EmptyState` 组件用例里把 `清除筛选` 当作一个**任意的 prop 夹具标签**（`primary={{ label: '清除筛选' }}`），与 `WORDBOOK_COPY.filteredEmpty.cta` 零引用关系；`packages/ui/**` 对本任务是禁区（#80 原话），我不越界改别人的用例。 |
| `apps/**/src/**` + `packages/shared/src/**` 的三态与 `pullFail` 旧串 | **0** | ✅ **判据 (i) 实质达成** | 八条旧串在**全部源码**里已 0 残留 |
| （附加自证）加 `--exclude-dir=dist --exclude-dir=test-results` 的源码面复跑 | **1** | — | 即上表 `patterns.spec.tsx` 一条；其余全零 |

> ⚠ **一次读数的时效性**：01:26 首次跑该哨兵时另有 **6 条** `apps/web/test-results/**/error-context.md`（Playwright 上一轮 auth-wall 失败的 DOM 转储，非源码）；01:35 复跑同命令时这 6 条**已归 0**（并发的 e2e 轮重跑清掉了旧转储）⇒ 这类产物**不可作为判据**，也不该由我去删别人的跑测产物。

> **一句话**：判据 (i) 在源码面 **命中 0**；非 0 的三项分别是 dist 产物（§5 自己除外）、e2e 转储产物、以及 `packages/ui` 一个语义无关的 prop 夹具（我名下禁改面）。若 TPM 要求字面 0，需 (a) 重跑 `pnpm --filter @tm/shared build` 刷 dist，(b) 清 `apps/web/test-results`，(c) 把 `patterns.spec.tsx:920` 的夹具标签换掉 —— 三件都在我禁改面/额度外，见 §五-5、§五-6。

### 2. 四档字面串「唯一真源」自证（A-43 #80 的闭合哨兵）

```
grep -rn --exclude-dir=node_modules --exclude-dir=dist "最久没碰\|最常忘" apps/ packages/
```
源码面命中 **10** 处，全部为：`copy.ts:414/418/419`（唯一声明点）+ 4 处**注释**（`wordbook-toolbar.tsx:11`、`WordbookScreen.tsx:138/254/258`）+ 3 处 `wordbook-screen.spec.tsx:675-680` 的**期望值列表**（该用例断的是 `WORDBOOK_SORTS.map(sortLabel)` 的结果，属既有测试面，值未变 ⇒ 0 改动）。
**四档字面量的声明点在改前 = 2（app + web 各一份），改后 = 1（shared）。**

---

## 四、出口命令原文与输出摘要（额度 2 次，已用 2 次）

**出口 1**（三条并一次）：
```
pnpm --filter @tm/shared test
→ Test Files 1 passed (1) | Tests 52 passed (52)     # A-37 §七-29 的 52/52 门禁保持
pnpm --filter @tm/app typecheck
→ tsc -p tsconfig.json --noEmit                      # 0 错，干净
pnpm --filter @tm/web typecheck
→ tsc --noEmit  ⇒ 6 errors，全部在 e2e/study.spec.ts（54/55/58/73/183/204 行，TS18048 'words'/'DECKS.review' possibly undefined）
   # 我改的 src/lib/api/wordbook.ts、两端消费方 page.tsx/WordbookScreen.tsx ⇒ 0 错
   # 该文件 mtime = 2026-09-21 01:18（我跑命令前 8 分钟），并发在飞，不归本轮，见 §五-7
```

**出口 2**（仓库根，未在 `apps/app` 裸跑 `npx vitest run`）：
```
pnpm --filter @tm/app test
→ Test Files 1 failed | 11 passed (12) | Tests 1 failed | 239 passed (240)
   唯一红：test/wordbook-screen.spec.tsx > C-25 未登录 …… 主按钮 `手机号登录`、文字链 `没有账号？注册`
   AssertionError: expected '#/' to be '#/login?mode=register&from=wordbook'  (spec:997)
```
**239 绿 / 1 红，红因已定位且不在我改动面内** —— 完整根因、证据与修法见 §五-2（这是本轮唯一需要 TPM 拍板的事项）。

---

## 五、上报未修（发现但不该我做的事，只列不做）

1. **A-43 #80（及 A-46 #95）点名的两个文件在盘上不存在**：`apps/app/src/components/filter-chips.tsx`、`sort-menu.tsx` 均无（`ls apps/app/src/components/` 只有 `ai-mnemonic-bar / due-badge-data / goal-ask-sheet / progress-data / result-row / wordbook-toolbar`）。T-18b 把 `FilterChips` 与 `SortMenu` **两件合并在同一个 `wordbook-toolbar.tsx`** 里（该文件头注释 4-7 行自陈原因）。⇒ 我把②的实施对象按**实际载体**认（`wordbook-toolbar.tsx`），未新建两个同名文件（新建 = 造第三份真源，与 #80 相反）。**请 E4 把 ownership 账面（A-43 #80 后半句「实外交加件补录」）按 `wordbook-toolbar.tsx` 登记，不要照抄不存在的两个路径。**
2. **⚠ 步骤 4 造成 App/Web 未登录卡片各出现「两颗同名不同行为」的文字链 ⇒ C-25 红（需 TPM 派 T-18b/T-15 收口，我禁改面外）**
   - 现状（改串后）：`WordbookScreen.tsx:515-520` 与 `apps/web/src/app/(user)/wordbook/page.tsx:179-185` 的 `EmptyState` 同时挂了 **`secondary`**（label = `WORDBOOK_COPY.emptySignedOut.link`，onClick = `host.navigate('/')` 回首页查词）与 **`link`**（label = `AUTH_COPY.wall.link`，onClick = 去注册）。PM §4(c):147 判定「app 侧走 `AUTH_COPY.wall.link`，不受 `emptySignedOut.link` 影响」**只对了一半**：值确实不受影响，但两步改完**两条 label 变成同一串**，`secondary` 在 DOM 序里在前 ⇒ `wordbook-screen.spec.tsx:994` 的 `clickableByText('没有账号？注册')` 现在命中「回首页」那颗 ⇒ 断 `#/login?mode=register` 红。Web 侧 `auth-wall.spec.ts:187/201` 用 `getByText('没有账号？注册')` 同理会在**严格模式下命中 2 个元素**（Playwright 直接报 resolved to 2 elements）。
   - **这不是违规用例**：C-25 断的是 §3.6.5-3 定稿要求的正确行为（点注册链 → 去注册页），旧串它压根没写；改测试迁它就是错的方向。**也不是我改错串**：§5 步骤 4 逐字如此定，且 §5-纪律④ 明写「改后 …… **宿主不得再有副本**」。
   - **建议修法（一行级，归屏文件 owner）**：未登录词本卡里 **删掉 `secondary` 这一出路**（§3.6.5-3 的四个槽位 = 标题/副行/主按钮/注册文字链，本就没有「回首页查词」这颗；`随便查几个词` 这个旧语义随旧串一起作废），两端各删 3-4 行；若 TPM 判定「回首页查词」要保留，则改 `secondary.label` 为 `VERBS.goLookup`（`去查词`）**并同步 §3.6.5-3 表**——那是定稿动作，属 PM/UI，不属本轮。
   - 我**没有**自选任何一套：既没回退步骤 4（PM 定稿串，Web e2e 靠它靠拢），也没偷改 screens/page 两个禁改文件。
3. **`pullFail` 拆好后，两端宿主副本仍在（PM 自己已预告，本轮不该我收）**：`wordbook-toolbar.tsx:68-69` 的 `loadFailTitle/loadFailBody` 与 `lib/api/wordbook.ts:67-68` 同名两串，现与 `WORDBOOK_COPY.pullFail.{title,subtitle}` 逐字重复。PM §3:109 明写「该 app 侧收口属实现轮，**由 TPM 派 E/T 轮**，本文只登记触发条件」⇒ 触发条件现已成立（shared 四 key 齐备），请派单把两端改指 `WORDBOOK_COPY.pullFail.*` 并删宿主副本（`wordbook-screen.spec.tsx:977-980` 的既有断言靠宿主串，改指后仍逐字相同，预期不红）。
4. **§2 表 C 的归属在本文内部自相矛盾（我按「不补」执行）**：表 C（fix4:82-83 行）处置列写「登记给 A-43 #80『字面串上收 shared』**同一轮**一并处理」（即 `deleteNotQueued` = §3.6.5-7 串、`fillingGlosses/glossStalled` = §3.6.5-5 两串共 3 条缺 key），而 §5-纪律②（fix4:178 行）又写「**禁止**顺手改 …… 表 C（缺 key，另轮）」。我按**出口清单所在的 §5**（任务书亦称「§5 就是你的改动清单」）与「只做三件、一件不许多做」执行 = **未补**。请 TPM 显式裁定这两句取哪一句；若裁「同轮补」，则新增 3 个 shared key + 两端改指，需再开一个我的微轮（约 +8 行 shared / -6 行宿主）。
5. **`packages/ui/test/patterns.spec.tsx:920` 用 `清除筛选` 当 prop 夹具标签**：与 §5 判据 (i) 的 grep 面撞车（见 §三-1）。属 T-05 名下、且 `packages/ui` 对本任务禁改。建议该轮把它换成中性夹具词（如 `清空`），否则 §5 的字面 0 永远闭不掉。
6. **`packages/shared/dist/**` 陈旧**（A-37 §四 已登记过同类）：里面还留着三态旧串与旧 `pullFail` 单串形状。本轮**未跑 build**（出口额度只 2 次、且建议命令里没有 build）。任何依赖 dist 产物的消费方（若有）需自行重跑 `pnpm --filter @tm/shared build`；两端走 `src` 直出，不受影响。
7. **并发在飞证据登记**：`apps/web/e2e/` 下 `wordbook.spec.ts`(01:11) / `helpers.ts`(01:16) / `study.spec.ts`(01:18) / `profile.spec.ts`(01:20) 本轮开工前后仍在被写；`packages/server/test/release/`、`apps/app/test/progress-screen.spec.tsx`、`apps/app/src/{native,data,screens}` 多文件 mtime = 2026-09-21 00:3x-01:0x。我未与任何一路抢文件。
8. **`apps/web/src/lib/api/wordbook.ts` 未跳过的依据**：任务书要求「先看它的 mtime，若正被并发改动则跳过」。实测 `mtime = 2026-09-20 12:39:05`（开工时点 01:19 之前 **12 小时 40 分**未被触碰），而并发轮只动 `apps/web/e2e/**`（测试面）与该 lib 无 import 冲突；同目录其余 lib（`profile.ts` 12:46 / `review.ts` 12:23）同样停在昨日 ⇒ **判定不在飞，按②执行**。若 TPM 认为「同域 e2e 在跑就算在飞」，本轮该文件的改动可整块回退（它只删字面量、换 import，无任何行为变化）。
9. **`const` 无提升 ⇒ §5 步骤 4 与「唯一声明点」冲突，我用最小代价解开**：`SWITCH_TO_REGISTER_LABEL` 原声明在 **483 行**，晚于 `WORDBOOK_COPY`（326 行）的求值点 ⇒ 直接在 `emptySignedOut.link` 引它会 **TDZ ReferenceError（模块加载即抛，会炸全仓）**。改法 = 把**同一条 const + 其完整 doc 注释整体上移到文件顶部**（现 33-42 行），原 §6.4-登录处只留一行指路注释 ⇒ **声明点仍唯一**（未新增第二份字面量，符合 §4(d):154 的要求），`AUTH_COPY.wall.link`（现 537 行）/ `AUTH_COPY.switchToRegister`（现 543 行）的引用一字未动，52/52 绿。**PM §5 步骤 4 未预见这一点，建议下一版指令表补一句「声明须在 `WORDBOOK_COPY`（现 336 行）之前」。**（现盘上：`const` 在 41 行、`emptySignedOut.link` 引它在 342 行、`pullFail` 对象在 355 行。）

---

## 六、遗留清单（交下游，不在本轮）

| # | 事项 | 建议归属 |
|---|---|---|
| L-1 | §五-2 的两端 `EmptyState` 注册链同名撞车（C-25 红 + Web `auth-wall` e2e 严格模式风险） | **T-18b（app screens）+ T-15/T-16（web page.tsx）**，TPM 先裁「删 `secondary`」还是「改 `secondary.label` 为 `去查词` 并补 §3.6.5-3 表」 |
| L-2 | §五-3 `pullFail` 宿主副本删除 + 两端改指 `WORDBOOK_COPY.pullFail.*`（PM §3:109 已预告） | TPM 派 E/T 轮 |
| L-3 | §2 表 C 三条缺 key（`deleteNotQueued` / `fillingGlosses` / `glossStalled`）→ shared 上收 | 待 TPM 裁 §五-4 的自相矛盾后另轮 |
| L-4 | §2 表 B 三组差口（`sortMenu` 3 档串改 4 档、`swipeDelete.confirm` ↔ `删除`、`swipeDelete.undoToast` 拆正文+动作按钮（含 U+201C/U+201D）） | 分别 = 待 TPM 判与 `batch.remove` 同批 / **T-05 toast 契约** + UI 定稿双挂 |
| L-5 | `FilterChips`/`SortMenu` 是否上收 `@tm/ui/patterns`（`wordbook-toolbar.tsx:4-7` 头注释的原始遗留项） | **T-05**，#80 已判本期不做 |
| L-6 | §五-1 的 ownership 账面路径更正（两个不存在的文件 → `wordbook-toolbar.tsx`） | **E4**（A-41 #60 X-1 通用规则） |
| L-7 | §五-6 `@tm/shared` dist 刷新、§五-5 `packages/ui` 夹具串替换 | 各自 owner（构建轮 / T-05） |
| L-8 | `WORDBOOK_COPY` 之外的 app 侧宿主串（`metaJoined`/`metaReviewed`/`resultCount`/`pageTotal`/`filterGroup`/`sortHint`/`sortMenuLabel`/`searchPlaceholder`/`restored`/`clearAll` 等）**仍是 app 与 web 各存一份**（我改前就存在，本轮未扩大也未收敛，只并了 #80 点名的四档两套） | 待 #80 后半段或表 C 同轮一起做（会牵 `WordbookScreen.tsx` 与 `page.tsx`，非 shared 单文件面） |

**不变量复核**：无新增需求 ID、无新增裁决号（只引 A-43 #76/#79/#80 与 A-46 #94/#95）、未改 `.delivery/` 除本报告外任何文件、未跑 DDL/DML、未在产品 DOM 加 `data-testid`、未留 `test.fail()`、未改任何测试文件。
