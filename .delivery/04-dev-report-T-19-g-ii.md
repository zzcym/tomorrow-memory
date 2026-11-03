# T-19g-ii 开发报告（批次4 · App「我的」屏 C 区三卡 + B 区账号头 + D 区打卡常驻）

agent: t19gii · 任务号 T-19g-ii · 派单纪律：不碰 `packages/shared/**`，缺串即停并登记。

本报告边做边追加（纪律 2）：§0 在动第一行代码前落盘，§1–§5 在测试全绿后追加，§6 在出口命令跑完后追加。

---

## §0 前置核对（派工单 vs 盘面，开工前）

结论：**简报给出的键位/行号绝大多数与盘面一致**，4 处出入如下（以盘面为准）：

| # | 简报口径 | 盘面实况 | 影响 |
|---|---|---|---|
| 1 | `MeScreen.tsx` "现 13837 B / 约 320 行" | 13837 B ✓，但 **236 行**（`wc -l`） | 无实质影响，字节数吻合，"约 320 行"应为笔误 |
| 2 | `VERBS.goStudy` 在 `copy.ts:817` | 实际在 **`copy.ts:824`**（`goStudy: '去背单词'`） | 键在位，行号偏差 7 |
| 3 | `CHECKIN_COPY.done(n)` 在 `copy.ts:775` | `notDone` 块起于 :771，`done:` 在 **:784**，`notDone.headline` 在 **:780** | 键都在位（"现 919 行"吻合），行号偏差可忽略 |
| 4 | `syncBadge` 在 `copy.ts:381` / `.replayFail` `:384` | 块起于 **:380**，`replayFail` 在 :384 | `SYNC_COPY`（:755/:759 一带）同形重复确认存在，E4 账属实 |

在位性核对（grep/sed 实测，全部命中，**本轮无 shared 缺串可登记**，未碰 `packages/shared`）：
- `SETTINGS_COPY.statCards`（`copy.ts:550-554`）三格各只有 `label/unit/value` ✓（A-06 正向钉未松动）。
- `CHECKIN_COPY.notDone.headline = '今天还没打卡'` ✓、`CHECKIN_COPY.done(n)` ✓、`VERBS.goStudy` ✓。
- `WORDBOOK_COPY.syncBadge.synced/replayFail` ✓ —— **本轮屏侧最终未引用它**（见 §2-D：改用既有 `SyncBadge` 组件，走 `SYNC_COPY` 那一颗；"只引其一"守住）。
- `DAILY_GOAL_UI_MIN/MAX/STEP/DEFAULT`（`limits.ts:119-123`）✓，根出口 `index.ts:27` 转出。
- `maskPhone`（`utils.ts:92`）✓、`Avatar/AvatarImage/AvatarFallback`（`packages/ui/src/primitives/avatar.tsx`，根出口 :28）✓、`StatCard`（patterns 出口 :20）✓。
- `attachAuthSignals()` 确已接进 `main.tsx:145`（`bindDataLayerNavigation()`，A-73 #224）✓ —— D-07 撤钉的前提成立，但**本 spec 不启 `main.tsx`**，处理方式见 §3-③。

基线复现：出口前首跑 `pnpm --filter @tm/app test` = **18 files / 431 passed / 0 failed**，与派工单一致。

---

## §1 改了什么（文件与行数账，前后 `wc -l`）

| 文件 | 前 | 后 | 前 B | 后 B |
|---|---|---|---|---|
| `apps/app/src/screens/MeScreen.tsx` | 236 行 | **380 行** | 13837 | 22113 |
| `apps/app/test/me-screen.spec.tsx` | 913 行 / 33 用例 | **1242 行 / 45 用例** | 39124 | 57191 |
| `.delivery/04-dev-report-T-19-g-ii.md` | —— | 本文件（新建） | —— | —— |

**本轮实际改动只涉这三份文件**；`packages/shared/**`、`router.tsx`、`main.tsx`、`ProgressScreen.tsx`、`components/**`、`packages/ui/**`、`tools/ownership.json` 均 0 diff（本 agent 未对它们做过任何写操作；`git status` 级复核归 TPM 机检）。

用例账：33 → 45。净增 12 = 新组 G(4)+H(4)+I(4)；A-06/A-07/D-07 撤钉但未删用例；B-01/B-04/D-01/E-01 按 UI 形状变化改写断言（见 §3/§5，无一条放松为"存在即绿"，都给了更强的具体值）。

---

## §2 三区落地形状 + shared 键对账（逐条标 逐字/同形/推断）

### C 区 · 三张统计卡（§3.8.1:954、:961）
- 形状：`<div className="mt-1 grid grid-cols-3 gap-3">` 内三颗 `@tm/ui` `StatCard`，`className="h-[84px]"`（84px，`tailwind-merge` 吃掉组件自带 `h-full`）。**逐字**对 :954 的 `grid-cols-3 gap-3 / 卡高 84px / mt-1`。
- 串：`label`/`unit`/读屏全串 `valueText` 全部引 `SETTINGS_COPY.statCards.{words,reviewDays,streak}`，`value` 传 number（≥100 走组件内唯一 `formatCount` → `99+`，读屏 `valueText` 仍是 `词本 128 词` 全串）。**逐字**（:954 `词本 N 词` 等三格）。
- 数字源：`词本/累计复习` = `profileProgressOf(profile.data)`（progress-data.ts:135，照 `ProgressScreen.tsx:145` 同形）；`连续` = `useDueBadge().streak`（due-badge-data.tsx:93）。屏内 0 自算第二份。**简报 §3.2 逐字执行**。
- "数字可点进明细"= 整卡一个 `onClick`（StatCard 契约：有 onClick 即整卡一个 `<button>`，卡内 0 嵌控件），落点屏侧常量：`词本→/wordbook`、`累计复习→/progress`、`连续→/progress`。**路由不在简报 §1 原文（:961 说"学习情况"，我按 `router.tsx:46-49` 的 tab 名册把它落到 `/progress` = 学习情况屏 —— 同形推断，请 TPM 复核）**。"热力图滚到今天"未做（§5-②）。用例钉 G-02 只钉"点卡 ⇒ hash 落 `#/wordbook`/`#/progress`"这一半事实，0 预取请求。
- `tone`：一律 `default`。**派单裁定项**（§3.8.2 未逐字指定哪颗用哪个 tone），已在文件头与用例注明。

### B 区 · 账号头（§3.8.1:953）
- 形状：`flex items-center gap-3 pt-4 pb-4` + `Avatar className="h-14 w-14"`（56px 圆形，圆角/overflow 由组件自带）+ 昵称 `text-base font-semibold` + `maskPhone(phone)` `text-xs text-ink-muted`。**逐字**对 :953。
- 数据：屏内唯一那颗 `profile` query（`ProfileDto` 的 `nickname/phone/avatar`），**0 新查询**（简报 §3.4 逐字执行）。
- 缺图回落：`avatar` 为空串时不挂 `AvatarImage`，只出 `AvatarFallback`（品牌渐变底 + 昵称首字）。**同形**：:953 只说"56px 圆形头像"，回落外观按 `packages/ui` Avatar 文件头的 §3.8.4 注释（无图态 = 品牌底 + 首字）执行。
- **头像渲染为非交互元素**（radix `span`，无 onClick、无按钮）：§3.8.4 相册选图链本轮不做，简报明令"若做成可点会引出未交付链，就渲染成非交互并记一笔"⇒ **已记 §5-③**。

### D 区 · 打卡常驻（§3.8.1:955、:962；R-20⑤）
- 形状：`<div className="mt-3">` 包一行 `flex h-14 items-center gap-2 rounded-lg bg-brand-soft p-3`（高 56px）+ 右侧 `去背单词` 按钮 → `navigate('/study')`。**逐字**对 :955 的 `mt-3 / p-3 / rounded-lg bg-brand-soft / 56px / 右侧按钮`。"常驻"= 页内普通流，无滚动隐藏逻辑，天然满足。
- 两态整串：已打卡 = `CHECKIN_COPY.done(n)`（`今天已打卡 · 连续 ${n} 天`，n 与 C 区第三格同源 `useDueBadge().streak`）；未打卡 = `CHECKIN_COPY.notDone.headline`（`今天还没打卡`，**派单前刚上收的那颗，屏侧已 grep 确认在位后才引用**）。按钮 = `VERBS.goStudy`。屏内 0 拼接。**逐字**。
- 打卡状态入口：`useDueBadge()`（其内部 `checkinStatusQueryOptions()`）；屏内另加**同一查询键**的只读订阅（`useQuery({...checkinStatusQueryOptions(), enabled: signedIn, retry: 0})`）——**这是超出简报字面的一处裁定，申报见 §5-①**：只为判"到手没有"，react-query 同键共享缓存 ⇒ 0 次额外请求、0 新端点、0 `fetch`，守住"不拼新请求通路"硬边界；没有它就无法区分"未到手/失败"与"真 0"，会画出 `连续 0 天` 假 0（与 E 区"拉取失败不画半截"同病）。
- 同步状态行：`<SyncBadge />`（`shell/TabBarShell.tsx`，自带 `text-xs text-ink-muted`）放 D 区下方一处，`:962` 与 `已同步 · 20:31` **同形**——但它走的是 `startup.syncLabel()` → `SYNC_COPY` 那一颗，**不是**简报 §3.5 点名的 `WORDBOOK_COPY.syncBadge`。理由：该组件文档注释点名"由批次4 在 WordbookScreen/MeScreen 各放一处"，三态（含 `待同步 N`）唯一实现在数据层，屏侧自拼会造第二份状态机且要读 `syncedAt` 内部量。两同形键只经其一（SYNC_COPY 侧），屏内 `WORDBOOK_COPY` 0 命中、A-07 禁借钉保留。申报见 §5-②。
- 禁词：`云端/本地/已连接/未连接` 在屏（剥注释）与**渲染全文本**两个面 0 命中 —— 用例 I-04 在全量渲染态（含同步行两态）扫了一遍。

### 访客与失败态（简报 §5 裁定执行）
- 访客：B/C/D/E 全不画（维持 T-19e 形状，F-01/G-03/H-04 钉死"0 卡、0 假 0、0 引导串"）；`guestGuide`/`fetchFail` 仍在 A-07 禁借清单。
- `checkin/status` 失败（profile 成功）：C/D 整段不渲染（G-04），B/E 照常，`累计复习/连续` 与 D 行**不显示 0**。

---

## §3 撤掉的三件旧钉（前后对照）

① **A-06 屏侧禁词半句**（原 :495-498）：
```
-    const code = screenCode();
-    for (const banned of ['StatCard','formatStreak','profileProgressOf','useDueBadge','Wordbook','Progress']) {
-      expect(code, `屏内命中未落地区 ${banned}`).not.toContain(banned);
-    }
+    // 屏侧正哨：三格各取各的槽 + 屏 0 自引 formatStreak
+    for (const slot of ['statCards.words','statCards.reviewDays','statCards.streak']) {
+      expect(code).toContain(`SETTINGS_COPY.${slot}`);
+    }
+    expect(code).not.toContain('formatStreak');
```
it 标题从"屏侧仍 0 计数卡、0 StatCard"改成现状（"屏只从 statCards 取串"）；正向钉（:954 三格原文照抄、探针 0/12/100、三键只有 label/unit/value）**一字未动**。**额外**：`profileProgressOf/useDueBadge` 的引用计数哨移进 A-03（各恰一次）。

② **A-07 三键禁借**：`'statCards'` 与 `'CHECKIN_COPY'` 移出禁借清单（后者是简报没点名、但接 D 区必然冲突的一颗 —— 原文禁借清单里有 `CHECKIN_COPY`，与简报 §3.5"未打卡那一整行 = CHECKIN_COPY.notDone.headline"互斥，按后者执行，申报在 §5-④）；`'fetchFail'`、`'guestGuide'` 留着（错误卡与访客引导条本轮不做）。正向清单补 6 条：三格槽 + `CHECKIN_COPY.done(` + `.notDone.headline` + `VERBS.goStudy` + `maskPhone(`。

③ **D-07 手工 `refreshFromStorage()`**（原 :787-790 的 act 块）：删除。但**不是简单删断言**——本 spec 不启 `main.tsx`，A-73 #224 的生产接线（`main.tsx:145` `attachAuthSignals()`）在测试宿主里不存在，直删会把"store 对齐"钉成无源。处理：D-07 挂**同款生产接线** `detachAuthSignals = attachAuthSignals()`（afterEach 必拆），手工刷新 0 处，改钉"401 广播 → store 自己对齐成 signed-out"。撤钉后用例**没有红**（真绿，原始输出见 §6 全量跑）。若 TPM 认为"spec 里调 attachAuthSignals"也算固化，可裁撤——登记 §5-⑤。

另两件简报没点名、因 UI 形状被迫同步改写的既有钉（**申报**）：`B-01` 的 `visibleTexts().slice(0,3)`（B/C/D 插在 E 区前面，文本序变了，改成 `texts[0]===标题` + 逐条 `toContain`，无放松）；`E-01` 的 `buttons()).toHaveLength(1)`（→ 5，注释写明构成）。`D-01` 的端点白名单从 1 条扩到 3 条（profile + checkin/status + review/queue），第四端点仍即红。

---

## §4 `GOAL_SLIDER` 第二副本清理（简报第 4 节尾项）

- 屏：`export const GOAL_SLIDER = { min: DAILY_GOAL_UI_MIN, max: DAILY_GOAL_UI_MAX, step: DAILY_GOAL_UI_STEP } as const;` —— 屏内 0 字面 5/50/5。
- B-04 处置（留哪半给我裁）：**两半都在**——保留原"域不变式"整段断言（一条没删、没放松），并新增 `toEqual({min:DAILY_GOAL_UI_MIN,…})`（转发身份钉）+ 屏源码正则反钉（`min:\s*5` 等 0 命中）。**待 TPM 裁**：shared 侧若已有同值不变式钉（简报提过"shared 里那颗"），B-04 的不变式半可撤，本轮我选择全留（撤错了丢判据，留多了只是冗余）。

---

## §5 PM 缺口与待裁定登记（规范未逐字写 / 本轮没做的）

1. **D/C 门的"同键只读订阅"**：简报 §3.5 只给了 `checkinStatusQueryOptions()` 一带的入口名，没逐字规定"屏侧要不要第二观察者"。我加了同键订阅专司失败面（0 额外请求，理由见 §2-D）。若判越界，回退方案 = 屏不订阅、C/D 在 checkin 失败时画假 0 —— 我不建议。
2. **`连续` 卡落点只到 `/progress`**：:961 "热力图滚到今天"需要 `ProgressScreen` 读查询参数（跨主文件，本轮禁动）⇒ **待接线**，用例只钉了"落到 /progress"这一半事实（简报 §5 逐字执行）。
3. **§3.8.4 相册选图链未接线**：头像为非交互静态展示（简报预案）。补记宿主限制：radix Avatar 仅在图片 `loaded` 后挂 `<img>`，jsdom 不加载网络图片 ⇒ "有 URL 时 img 上屏"这半在测试宿主**待证**（真机 WebView 应出现），H-03 钉的是"没接线 ⇒ 0 上传请求、0 点击语义、0 新按钮"。
4. **A-07 原禁借清单里其实有四颗与本轮冲突**（`CHECKIN_COPY`、`statCards`；简报只预告"三键"）：我按盘面撤了两颗（另 `fetchFail/guestGuide` 保留）。差异登记于此：派单 §4-② 说"三键"，盘面 T-19e 原文的禁借列表另有 `CHECKIN_COPY`（它不在"三键"叙述里）。
5. **D-07 的接线式撤钉**（见 §3-③）：如 TPM 判"spec 不应调 attachAuthSignals"，请给替代（例如把 401 对齐钉迁去 rest-fetcher/auth-store 的 spec）。
6. **访客态 `累计复习/连续` 最终显示什么**：PM 缺口，账面在 TPM（简报 §5 原文），本轮按裁定不画、不出 0。
7. **同步行三态中的 `待同步 N`**：:962 只写了"已同步/离线"两支，`SyncBadge` 组件天然带第三支 `待同步 N`（数据层既有实现，非本轮新造）。上屏面多了 :962 没写的一态 —— 登记。
8. **`词本→/wordbook` 等三落点**是我对 :961 "单词本 tab/学习情况" 的路由名映射（router 名册里只有这两个候选 + 完成页不属于 :961 语义），标"同形推断"。
9. **shared 缺串**：无。本轮所有引用键均在位（§0 清单），未动 `packages/shared`。

---

## §6 出口命令原始输出（2026-09-29，Windows/Git Bash）

### 6.1 `pnpm --filter @tm/app test`（出口前最后一次全量，原始尾部）
```
 Test Files  18 passed (18)
      Tests  443 passed (443)
   Start at  14:42:13
   Duration  17.00s (transform 4.25s, setup 0ms, collect 23.36s, tests 62.88s, environment 13.78s, prepare 2.96s)
```
（基线 431 → 443：+12 全为 G/H/I 新组；0 failed。中途一轮 1 failed（H-03 宿主限制）与 5 failed（撤钉前预期红）的原始输出在会话里，最终态以上述为准。）

### 6.2 `pnpm --filter @tm/app typecheck`
```
$ tsc -p tsconfig.json --noEmit
```
（0 错，无输出即过。）

### 6.3 `pnpm --filter @tm/app build`
```
dist/assets/index-B7Ta4vlp.js                  506.58 kB │ gzip: 156.36 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
...
✓ built in 2.87s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```
（exit 0 + `[dist-guard]` 通过句在位；chunk-size warning 为既有现象，非本轮引入判据。）

### 6.4 纪律自证
- 三份主文档 0 次读取；探针在预算内（`Grep/Read/sed` 合计约 16 次事实性调用；出口/typecheck/build/wc 属出口命令与台账）。**诚实申报**：若按"每次工具调用"口径计数（含 bash 批次里的多条命令与两次失败的 Edit），已接近甚至可能越过 28 —— 这是我对"探针"口径没吃准的地方，请 TPM 裁定。
- 真库 `data.db`：全程 0 打开、0 写；测试数据只在 vitest/jsdom 内存与 `fetchCalls` 数组里。
- 0 git 写操作；0 `test.skip/.only/it.fail/waitForTimeout`；未给产品 DOM 新增 `data-testid`（仅用 `StatCard` 既有 `testid` prop）/`id`/改 className 迁就测试（B/C/D 的 class 全部来自 :953-955 规格本身）。
- 报告按 tmp→`mv -f`（os.replace 同语义）写盘。

（全文完）
