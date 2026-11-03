# T-18b-r2 开发报告 —— App 单词本一级页（补用例 + 报告轮）

任务：`T-18b-r2`（接力轮：上一轮模型连接中断，实现已在盘上）
角色：前端（App `apps/app`）
上游：PRD `01-prd.md:203`（R-15）、`:204`（R-16）；UI `03-ui-spec.md:786-860`（§3.6 全节，`3.6.5` @836）、`:1594`（§6.6 禁词）
本轮性质：**只补用例 + 写报告**，实现零改动。

---

## ① 交付 / 修复清单（行数已 `wc -l` 复核）

| 文件 | 本轮动作 | 行数 | 说明 |
|---|---|---|---|
| `apps/app/test/wordbook-screen.spec.tsx` | **新增** | **1116** | 34 条用例 `C-01…C-34`，全部为本任务判据自证 |
| `apps/app/src/screens/WordbookScreen.tsx` | **未改一字节** | 649 | 与 TPM 13:5x 亲验的 649 行一致（`wc -l` 复核） |
| `apps/app/src/components/wordbook-toolbar.tsx` | **未改一字节** | 220 | 同上，220 行一致 |

- 本轮**修复项 = 0**：没有发现需要动实现才能成立的判据；发现的 2 处偏差（F-1 文案两套、F-2 队列吞异常）分别属 PM 收敛与 `data/**`（T-14b 名下），越界不改，见 §⑤。
- 用例台两处刻意写法（避免复用 `lookup-screen.spec.tsx` 的坑）：
  1. `settle()` 每轮 `await act(async () => setTimeout(12))` 等**真宏任务**（react-query 的 `NotifyManager` 批处理），越过 250ms 去抖门槛另用 `advance(320)`；
  2. 本 spec **显式 `startRouter()`**：`router.navigate()` 只写 `location.hash`，快照靠 `hashchange` 回来；不启动路由器会把「点 chip → URL 变了但列表没跟」误读成实现缺陷（登记为 F-3）。
- 读侧兼容：夹具词长全部 ≤ 64 字符，未触碰 `data/**`（T-14b 已修的 65-100 字符容错不在本轮范围内）。

---

## ② R-15 / R-16 判据 → 用例编号映射

### R-15 单词本升级为一级页（`01-prd.md:203`）

| 判据 | 用例 | 结论 |
|---|---|---|
| ① 两端各有独立一级页（App tab `#/wordbook`） | C-01（App 侧）、C-30（Web 侧栏不反套 App） | ✅ App 侧；Web `/wordbook` 属 **T-15** |
| ② 每行 词 / 首义 / 加入或最近复习 / 收藏删除态；点行=进详情、喇叭=发音 | C-01（三行内容齐 + `（暂无释义）` 不空行）、C-02（点行 `#/word/apple?from=wordbook`、喇叭只发音不跳转）、C-03（`已掌握` 文字徽章、新词/在背无标记） | ✅ |
| ③ 顶部搜索框，词与释义子串，100 词内 ≤300ms | C-06（同一帧出结果、实测 <300ms、0 请求）、C-07（释义子串 `苹果`+大小写不敏感）、C-08（无匹配 → 筛后空态 + 清空回默认）、C-09（✕ 清空即时回全量） | ✅ |
| ④ 排序 ≥4 项：字母 / 最新加入 / 最久没碰 / 最常忘 | C-13（菜单 4 项命名与 §3.6 表格**逐字**一致 + `role=menu`/`menuitemradio`/✔/Esc 焦点回弹）、C-14（选档写 `?sort=`、钮上文字改判）、C-15（四档语义全序，含「空值排最后」「lapse 降序」） | ✅ |
| ⑤ 预置筛选 4 项：全部 / 新词 / 在背 / 已掌握（「新词」= 无 FSRS 卡词数） | C-10（四档命名与计数 `6/1/4/1` 逐字）、C-11（点 `已掌握`/`在背` → `?filter=` 且行集正确，计数恒按整本）、C-33（`stageOf` 三档 + `countStages`）；**后端条数断言 = 跨任务（T-09/T-14）** | ✅ App 侧 / ⚠ 见 F-6 |
| ⑥ 删除按钮触屏直接可见 + 5 秒内 toast 可撤销并**含复习进度**完整恢复 | C-18（删除钮常驻、`tabIndex=0`、非 `sr-only`/`opacity-0`、toast `durationMs=TOAST_UNDO_MS=5000` + `撤销`）、C-19（**不是本地假删**：服务端缓存仍在、待删写进落盘队列 = `push` 的 `removedWords` 来源；重进本页不复活）、C-20（撤销 1 次点击 → 行回原位 + `addedAt/lastReview/reviewCount` 原值回灌 + `已恢复`） | ✅ |
| ⑦ 左滑删除保留为加速手势 | C-21（10px 不删不回弹开口 / 30px 露块不提交 / 76px 提交，且与显式钮同一条路）+ C-29（手势块内那颗钮收起时 `tabindex=-1`，显式钮恒可达 ⇒ **手势不是唯一出口**） | ✅ |
| ⑧ 100 词首屏一次批量、请求数 ≤3、取消 2.1s 逐词补拉 | C-04（`/api/wordbook` = **1** 次、0 次逐词补拉、0 次写请求）、C-05（首义第二来源 = 查词缓存，仍 0 额外请求） | ✅ |
| ⑨ ≥1280px 保留可收起侧栏、复用同一列表组件；<1280px 有等价入口 | C-01（App 列表本体 = `@tm/ui/patterns/WordbookList`，与 Web 同一份）、C-30（App 侧 `wordbook-sidebar` 0 处、源码无 `innerWidth`/`matchMedia`/`min-w-[1280px]` 分叉、`lg:grid lg:grid-cols-2` 承载宽屏双列）；**Web 侧栏外壳 = 跨任务 T-15** | ✅ App 侧 |
| 附：§3.6.3 URL `?q=&filter=&sort=` 可分享可回退、恢复时控件与列表同步 | C-16（直达三键同步）、C-17（非法值回落默认 + 默认值不落 URL） | ✅ |

### R-16 显式收藏取代自动灌入（`01-prd.md:204`，App 词本侧）

| 判据 | 用例 | 结论 |
|---|---|---|
| ① 查中不自动入本；行/条上的收藏按钮显示当前态且可切换 | C-22（本列表里的行 `aria-pressed=true` + `title=已收藏`，点下去即显式移出、无确认弹窗）、C-24（**浏览/搜索/筛选/排序全程 0 写请求、0 队列写入**，队列快照逐字节不变 ⇒ 进词本不会自动灌词） | ✅ App 侧 |
| ① 「清空单词本」全站 0 处 | C-24 | ✅ |
| ③ 收藏动作可撤销（toast 内 1 次点击） | C-18 / C-20 / C-31 | ✅ |
| ⑤ 游客查 10 词词本不变；登录用户点收藏 3 次 → 词本 +3 | **跨任务**：查词侧不入库 + 未登录走登录框 = T-17（`lookup-screen.spec.tsx` 判据⑥ 组）；本 spec 只锁「词本页自身不写入」 | ⚠ 跨任务 |
| ②④（未登录弹框记待收藏词 / 设置项「查词后自动收藏」默认关闭） | **跨任务**：查词页（T-17）+ 设置页（T-19/T-20） | ⚠ 不在本页 |
| ⑥ 收藏成功/失败可读反馈、失败可重试 | 本页 = 删除/撤销的 `已移出 … 撤销` / `已恢复` / 入队失败 `deleteNotQueued`（C-18/C-20/C-23） | ✅ App 侧 |

### §3.6.5 七态 / §3.6.7 无障碍 / §6.6 禁词

| 项 | 用例 | 结论 |
|---|---|---|
| 词本完全为空 | C-28 | ✅ 文案取 `WORDBOOK_COPY`（F-1） |
| 筛选/搜索无结果 | C-08 | ✅ 同上 |
| 未登录访问（骨架 + 引导卡并存、主按钮 `手机号登录`、文字链 `没有账号？注册`、0 业务请求） | C-25 | ✅ 按钮/链接两件按 §3.6.5 落，标题副行取 shared（F-1） |
| 首屏 8 条行骨架 + 工具条骨架、禁整页转圈 | C-26 | ✅ / ⚠「不锁输入」见 F-4 |
| 释义批量补齐中 | 由 C-04/C-05 保证 0 逐词请求；`metaPending` 灰条属 `WordbookList`（T-05 交付物），本页未启用 | ⚠ 见 F-6 |
| 列表拉取失败（错误卡 + `重试` 真重发 + `去查词`） | C-27 | ✅ |
| 删除写失败（离线）→ 行不消失 | C-23（在**导入接缝**上让 `removeWord` 抛错） | ⚠ 页面逻辑 ✅，真机分支不可达 = F-2 |
| §3.6.7：`<ul>/<li>`、行 `aria-label`、喇叭/删除可访问名、星标 `aria-pressed`、筛选 `role=group`、排序 `aria-haspopup`/`expanded`/`menu`/Esc/焦点回弹、计数 `role=status` | C-01 / C-02 / C-10 / C-13 / C-29 | ✅ |
| §6.6 禁词（渲染文字 + toast 串 0 命中，含 `undefined`/`NaN`/`p:`/`3:`） | C-31 | ✅ |
| Chrome84 红线（两文件源码级哨兵） | C-32 | ✅ |

---

## ③ 出口命令原文（**在仓库根 `E:\CC\tomorrow-memory` 跑**；全文落 `%TEMP%/t18b-r2/exit.md`，293 行）

```
$ pnpm --filter @tm/app test
 Test Files  1 failed | 9 passed (10)
      Tests  10 failed | 184 passed (194)
   Duration  11.62s
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/app@0.0.0 test: `vitest run --root ../.. --project @tm/app`  Exit status 1

$ pnpm --filter @tm/app typecheck
$ tsc -p tsconfig.json --noEmit
src/screens/ProgressScreen.tsx(267,33): error TS2552: Cannot find name 'WORDBBOOK_NEW_HREF'. Did you mean 'WORDBOOK_NEW_HREF'?
src/screens/ProgressScreen.tsx(329,32): error TS2339: Property 'heatSectionTitle' does not exist on type '{ … }'
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/app@0.0.0 typecheck: `tsc -p tsconfig.json --noEmit`  Exit status 2
```

**我名下 = 0 错 / 0 红**：`exit.md` 里 `FAIL` 行共 10 条，全部落在 `test/study-screen.spec.tsx`（S-02/03/04/07/08/11/12/13/14/19/20/25/27/28/30），`error TS` 共 2 条，全部在 `src/screens/ProgressScreen.tsx` —— 两个文件都是**并行 agent T-18a-r2 名下**（任务边界第 5 节点名的禁区），**疑似并发所致**，我没有触碰。`wordbook-screen.spec.tsx` 在两份输出里 0 命中。

**交付判据达成情况**：新增 34 条用例**全绿**（该文件 `Test Files` 计入 9 passed 之一，无一条 FAIL）。全套未绿，原因如上（并发轮次的他人在写文件），按边界约定不由我修。

---

## ④ 「未改任何既有断言」自证

1. 本轮**只新建一个文件**（`apps/app/test/wordbook-screen.spec.tsx`）+ 本报告；`WordbookScreen.tsx` 649 行、`wordbook-toolbar.tsx` 220 行与 TPM 亲验数字**逐字相同**（`wc -l` 复核，见 §① 表）⇒ 实现两文件未写入；既有 5 份 spec（`lookup/detail/router/offline-queue/rest-fetcher/startup`）与 `router.spec.tsx`、`host.tsx`、`main.tsx`、`data/**`、`packages/**` 未打开写。
2. 全套数字从 127 → 194 的增长 = 我 +34 与并行 agent 的净增，无一条既有用例被我删除、放宽或 `skip`；`exit.md` 里 `1 failed` 的那个文件不是我名下，且**我没有为了让它变绿去改它的断言**。
3. C-23 的处理方式说明：我**没有**放宽「入队失败 ⇒ 行不消失」这条断言。改为在 `removeWord` 的导入接缝上打桩，让页面自身的失败分支被真实执行（`expect(行仍在) + expect(deleteNotQueued) + expect(tone=error) + expect(队列无半截记录)`）；真机上该分支**当前不可达**这一事实如实登记为缺陷 F-2，不粉饰成 pass。
4. C-25/C-28/C-08 的断言取 `@tm/shared` 的 `WORDBOOK_COPY.*`（页面与 Web 共用同一文案源），而**不是**照抄 §3.6.5 表格串：这不是放宽，而是把「页面不许自造第二套文案」钉成断言；两者措辞不一致本身作为 F-1 上报，**不声称 §3.6.5 定稿串已达成**。

---

## ⑤ 遗留与越界申请

| 编号 | 内容 | 归属 / 诉求 |
|---|---|---|
| **F-1（遗留 → PM）** | `@tm/shared` 的 `WORDBOOK_COPY` 三态串与 §3.6.5 定稿串是同一场景的两套措辞。实测：未登录标题 `单词本还没有收进来的词` / 副行 `登录后可以从上一台设备继续`（§3.6.5 写 `登录后才能看到你的单词本` / `同一个手机号，词本和进度都会跟着走`）；空词本 `还没有收进来的词` + `查词时点星标，词就会进到这里`（§3.6.5 写 `单词本还是空的` + `查到想记的词，点一下星标就存到这里`）。要求：PM 定一套并写进 shared，否则 §8.2-2「两端并排走查逐字比对」比对不上 | PM 文档轮 → 之后我这边 0 改动（用例断常量，不锁字面串） |
| **F-2（缺陷 → 越界申请）** | `data/offline-queue.ts` 的 `saveState`/`kvSet` **吞掉** storage 写异常 ⇒ `enqueueRemove` 永不抛错，`WordbookScreen.removeRow` 的 `catch` 分支（§3.6.5 末行「行不消失 + 定稿 toast」）在真机不可达；实测把 `localStorage.setItem('tm.wbSyncState')` 改成抛错后，页面仍给 `已移出 apple · 撤销` 的成功承诺，而行既没消失也没落账。申请：T-14b 名下把写盘异常上抛（1 处），我这边不需要再改用例（C-23 已经钉好期望） | **`data/**` 是我禁区，未改**，等 TPM 派 |
| **F-3（约定 → 测试台）** | `router.navigate()` 只写 hash、快照靠 `hashchange`，故任何"点了控件后列表要跟上"的用例都必须先 `startRouter()`。已在本 spec 内自解；建议 E4 把这条写进 `host.tsx`/测试工具约定，避免后续轮次再踩 | T-14（`host.tsx` 我禁区内，未改） |
| **F-4（待 PM 定）** | §3.6.5 首屏行「不锁输入」在 App 侧实现为 B/C/D 整条工具条出骨架 ⇒ 首屏期间搜索框**未挂载**。语义两解：①"不许加 disabled/inert 锁"（已达成，C-26）②"输入框必须一直在"（未达成）。我按 ① 断言并如实登记，因为列表未到时本地过滤无意义 | PM 定稿；若取 ② 则改 `WordbookScreen.tsx`（我可改，等派单） |
| **F-5（遗留，实现方已声明）** | `FilterChips`/`SortMenu` 在 `apps/app/src/components/` 自建（`@tm/ui/patterns` 出口无此两件，T-05 未交付），四档排序/筛选字面串与 Web `lib/api/wordbook.ts` 各存一份 → 请上收 `@tm/shared`（消除两份手抄） | 架构师派 `packages/ui`/`packages/shared` 轮 |
| **F-6（跨任务）** | 服务端 `wordbook.list` 目前不回传 `state`/`lapses`/`nextDue`/`gloss` passthrough 键 ⇒ 四档筛选与「最常忘」现按客户端兜底推导（`stageOf` fallback），「新词条数 = 无 FSRS 卡词数」的**后端断言**（R-15 ⑤）与「释义批量补齐中」灰条都待服务端补键后自动亮起 | T-09/T-14（后端）+ 我这边 C-33 已覆盖键到位后的分支 |
| **F-7（并发观测）** | 本轮出口：`test/study-screen.spec.tsx` 10 红 + `src/screens/ProgressScreen.tsx` 2 TS 错，均在 T-18a-r2 名下、其轮次仍在跑 → 疑似并发瞬时红 | E4 出口轮复跑确认 |
| **L-4（走查项）** | 判据⑥「触屏直接可见」与 ③「≤300ms」在 jsdom 用替代量测（常驻渲染 + `tabIndex` + 同帧收敛）；真机 320/375/412 与 300ms 实测、hover 行为、5 秒窗口动画归 T-23 走查清单 | T-23 |
| **归属自检** | `--check-ownership` 本轮未跑（出口命令上限 2 次）。若 E4 因 `zeroDiffFor` 冲突判 RED（A-40 #50b），按任务指令登记即可 | E4 |
