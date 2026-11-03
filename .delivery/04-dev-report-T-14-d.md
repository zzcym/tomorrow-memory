# T-14d 开发报告（批次4C · 第二波 · A-46 #98 三处写点接失败反馈）

任务代号 **T-14d**。范围 = 只接三个写点的 `catch`（T-14c 已把契约修好：`saveState` 现在真抛 `QueueWriteError`，
`addWord`/`removeWord` 是 `void` 透传 ⇒ 这三处从"谎报成功"变成"抛未捕获异常 + 无人话反馈"）。
禁改面（`native/bridge.ts`、`data/**`、`packages/**`、`apps/web/**`、`router.tsx`、`host.tsx`）**零改动**。

---

## 1. 交付物清单（文件 + 行数 + Δ）

| 文件 | 现行数 | Δ | 性质 |
|---|---|---|---|
| `apps/app/src/components/result-row.tsx` | 540 | **+24**（原 516） | 生产：写点 1 + 2（`drop` / `toggle` 的 `addWord`）+ 一条 import + 两处注释 |
| `apps/app/src/screens/WordbookScreen.tsx` | 657 | **+8**（原 649） | 生产：写点 3（`undoRemove` 的 `addWord`） |
| `apps/app/test/wordbook-screen.spec.tsx` | 1166 | **+52**（原 1114：C-35 用例行 +49 / 文件头真链路说明 +3） | 用例：C-35（撤销写盘失败，真链路注入） |
| `apps/app/test/lookup-screen.spec.tsx` | 719 | **+96**（原 623：两条用例 +93 / import +3） | 用例：收藏 / 取消收藏 写盘失败（真链路注入） |

生产净增 **+32 行**，测试净增 **+148 行**。新增反馈串 **0 条**（三处全部复用既有常量
`WORDBOOK_APP_COPY.deleteNotQueued`，与参照物 `removeRow` 同一条）。新增 `data-testid` **0**、
`test.fail()` **0**、DOM 结构改动 **0**。

三处 catch 的形态逐字对齐参照物 `WordbookScreen.tsx:469-475`（原 `removeRow`，现下移 8 行）：
`try { 写点 } catch { host.toast(同一条串, { tone:'error', durationMs:6000 }); return; }`。

---

## 2. 三处改动逐条（改前 → 改后 → 为什么）

### 2.1 `result-row.tsx:468` `removeWord(target)`（查词行星标移除）

**改前**（`drop` 无返回、无保护；两个调用方无条件做乐观落星标）：

```tsx
const drop = React.useCallback(
  (target: string): void => {
    removeWord(target);                                   // ← 现在会抛 QueueWriteError，无人接
    queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
  },
  [queryClient],
);
const unfavorite = ... { drop(word); mark(false); }        // ← 抛了就不执行，没抛但没落账则谎报
```

**改后**（现 472-495 行）：`drop` 返回 `boolean`（真落账才 `true`），失败即
`host.toast(WORDBOOK_APP_COPY.deleteNotQueued, { tone:'error', durationMs:6000 }); return false;`；
`unfavorite` 改成 `if (!drop(word)) return;` 才 `mark(false)`；`toggle` 里成功 toast 的「撤销」动作
改成 `if (drop(word)) mark(false);`。

**为什么**：`drop` 有两个调用方（二次确认后移除、收藏成功 toast 的撤销），二者都要"没落账就不许把星标
落回未收藏"。返回布尔而不是在 `drop` 内部自己 `mark`，是因为 `mark` 依赖 `key`/`setFlags`、放在
`drop` 里会让两颗星的语义分叉；调用点各挡一行，读起来就是"成功才乐观"。失败时也不 `invalidateQueries`
（列表没变，重新拉一次只会让星标闪一下）。

### 2.2 `result-row.tsx:493` `addWord(word)`（查词行收藏）

**改前**：`addWord(word); mark(true); invalidate; host.toast('已放进单词本', {tone:'success', action:撤销});`
—— 写盘失败 = 抛未捕获异常，整段不执行，用户点星标**毫无反应**（既不亮也不报错）。

**改后**（现 509-515 行）：`addWord` 包 `try/catch`，catch 里同一条失败反馈 + `return`；
成功路径（`mark(true)` / 失效 / `已放进单词本` + 撤销）保持原样、原顺序。

**为什么**：`已放进单词本` 是一句可兑现性存疑的承诺（R-16②「星标才入库」），没入队就不能发；
`mark(true)` 是纯本地乐观态，写了不发会与服务端列表不一致，所以两者一起挡在 catch 之后。

### 2.3 `WordbookScreen.tsx:450` `undoRemove` 里的 `addWord(word, patch)`（5 秒窗口内点「撤销」）

**改前**：`addWord(word, patch); publishPending(); bump(); invalidate; host.toast(COPY.restored /* 已恢复 */, {tone:'success'});`
—— 失败 = 抛未捕获异常，且 `已恢复` 永远发不出去，用户只看到"点了撤销没反应"。

**改后**（现 446-465 行）：`addWord` 包 `try/catch`，catch 里 `deleteNotQueued` + `return`，
**不做** `publishPending()` / `bump()`（即不翻回乐观态 ⇒ 行保持"已删"外观，与盘上仍是 `pendingRemovals`
这一事实一致），`COPY.restored` 只在真落账后发。

**为什么**：撤销的本质是一次 upsert 把待删翻掉；翻不动就必须承认"删除还挂着"。这一条比另两条更容易
被写成"先 `bump()` 再 try"，那会让行自己复活而队列里仍是待删 ⇒ 下次 refetch 又消失（闪烁 = 谎报第二形态）。

### 2.4 新增用例（真链路，不在导入接缝上桩）

- `wordbook-screen.spec.tsx` **C-35**：删 `dream` 正常落盘 → `vi.spyOn(Storage.prototype,'setItem')`
  抛（钉法照抄 `offline-queue.spec.ts:293`）→ 点撤销（`act()` 里，抛未捕获异常即红）→
  断 反馈 = `COPY.deleteNotQueued` / `tone:'error'` / `≠ COPY.restored` / 无 §6.6 禁词 /
  **盘上 `SYNC_STATE_KEY` 与撤销前逐字相同**、`pendingRemovals` 仍含 `dream`、`pendingUpserts` 仍空、
  行仍不在 → `spy.mockRestore()` 后再点同一颗撤销，走真成功路径（行回来 + `已恢复`），
  以证明上面的红是写失败而不是页面被点坏。
- `lookup-screen.spec.tsx` 两条（判据⑥ describe 内）：
  ① 点星标收藏时 `setItem` 抛 ⇒ `aria-pressed` 仍 `'false'`、toast 序列里 **0 次** `已放进单词本`、
  最后一条是 `deleteNotQueued` + `tone:'error'`、`localStorage.getItem(SYNC_STATE_KEY) === null`
  （内存兜底没被当成写成了）→ 恢复后同一条路成功；② 二次确认后移除时抛 ⇒ 星标留在已收藏 + 同一条反馈、
  盘上无队列 → 恢复后真删成功且 `pendingRemovals === ['happy']`。

三条用例都**不**在 `data/queries/wordbook.js` 的导入接缝上 `vi.mock`（A-46 #97 的理由：那样测不到
`addWord → enqueueUpsert → saveState → kvSet → localStorage`）。C-23 原有的接缝桩与 `fault` 开关
**未动**（改它 = U-4，归批次5，A-45 #100 已登记）。

---

## 3. 判据对账

| 判据 | 落点 | 状态 |
|---|---|---|
| **§3.6.5 末行**「删除写失败：行不消失 + 定稿 toast」 | 词本页：`removeRow`（既有）+ **C-35 新挡的撤销路径**（撤销失败 ⇒ 行保持已删、盘上仍是待删那一份）；查词/详情页：`result-row` 两颗星 | ✅ 该分支在真机（关 DOMStorage / 配额满）与测试里都可达，且**不再只有一处** |
| **§6.6 禁词**（云端 / 本地 / 缓存 / 未接入 / token / 数据源） | 三处 catch 全部复用 `deleteNotQueued` = `这条先记在手机上了，联网后会自动删掉` —— 0 命中；C-35 与两条 lookup 用例各自再 `not.toMatch(/云端\|本地\|缓存\|未接入\|token\|数据源/)` 钉一遍；C-31（全量渲染文字 + toast 禁词扫描）仍绿 | ✅ |
| **R-15 ⑥**（撤销完整恢复该词含复习进度） | 成功路径逐字未动（`patchOf` 的 `addedAt/lastReview/reviewCount` 回灌），C-20 仍绿；失败路径改为"不谎报恢复" | ✅ 无回归 |
| **R-15 ⑦**（5 秒撤销窗口） | 窗口与 `TOAST_UNDO_MS` 未动；失败反馈 `durationMs:6000`（≥ 窗口，用户一定看到），且失败 toast **不带 action**（不制造第二次假撤销入口） | ✅ |
| R-16 ①②（星标才入库 / 未登录走登录） | 未登录分支（`rememberPendingFavorite` → 登录页）一字未动；已登录写入失败不再落乐观态 | ✅ |
| 不抛未捕获异常 | 三处 `try/catch` 收口；四条新用例的点击都发生在 `act()` 内（抛即红），本次运行未红 | ✅ |
| Chrome84 红线（`result-row.tsx` / `WordbookScreen.tsx` 源码级哨兵 C-32 / L 组） | 新代码只用 `try/catch` + 箭头函数 + `Boolean`，无 `at`/`hasOwn`/`structuredClone`/`requestIdleCallback`；相关哨兵全绿 | ✅ |
| A-46 #98 硬约束①（不得改 `bridge.ts` / `offline-queue.ts`） | 两文件 mtime 仍为 01:02:52 / 01:04:43（T-14c 收口时刻），本任务 0 改动 | ✅ |
| A-46 #98 硬约束②（与 A-40 #50 同文件不得并发） | `result-row.tsx:85-91`（`flippedDirection`）区间本任务 0 改动（我的 diff 全在 33-43 与 425-540）；开工前该文件 mtime = 09-20 12:36，无在飞写入 | ✅ #50 的清理仍按裁决顺延给 E4 |

---

## 4. 出口命令原文与输出摘要

跑了 2 次（预算上限 2 次），两次结果一致；第 2 次为最终态复跑。

```
pnpm --filter @tm/app typecheck && pnpm --filter @tm/app test
```

- `typecheck`：`$ tsc -p tsconfig.json --noEmit` → **0 错**（两次）。
- `test`（最终一次）：`Test Files 1 failed | 11 passed (12)` / `Tests **1 failed | 241 passed (242)**`
  （上一轮 A-45 #96 基线 = 238 passed / 1 failed（239），**条数 +3 = 本任务新增三条**，
  基线唯一的红 `progress-screen.spec.tsx` 现已随 T-26b/T-18c-r3 收口转绿）。
- 唯一红：`test/wordbook-screen.spec.tsx > §3.6.5 空 / 加载 / 错误 > C-25 未登录：…文字链 \`没有账号？注册\``
  → `expected '#/' to be '#/login?mode=register&from=wordbook'`（`wordbook-screen.spec.tsx:997`）。
  **T-14d 名下 0 红**（C-35 与 lookup 两条全绿；单跑 `-t "C-35"` 绿、单跑 `-t "C-25"` 仍红 ⇒ 与本任务的
  三条新用例、与本任务两处生产改动**无因果关系**）。根因见 §5-2。

---

## 5. 上报未修（不在本任务权限内 / 越界风险）

1. **收藏侧的反馈串措辞不匹配（要 PM 定稿，禁自行新增）**
   `WORDBOOK_APP_COPY.deleteNotQueued` = `这条先记在手机上了，联网后会自动删掉` 是**删除侧**的措辞。
   裁决（A-46 #98）要求三处复用这一条且禁止新增文案，本任务照做，但：
   - §2.2（点星标收藏失败）走的是**添加**语义，"会自动删掉"在这一格说不通；
   - §2.3（撤销失败）恰好说得通（撤销没翻掉 ⇒ 删除确实还挂着、最终会被删），无需处理。
   ⇒ 请 PM 定一条收藏侧串（如 `favoriteNotQueued`，需过 §6.6 禁词），落 `copy.ts` 后把 §2.2 那一行
   换掉即可（1 行）。**本任务未加新串。**
   另：`deleteNotQueued` 目前住在 `apps/app/src/components/wordbook-toolbar.tsx`（工具条文件），
   被 `result-row.tsx` 跨模块 import 才能复用。若批次5 做文案收敛，建议上移到 `@tm/shared`（本次改不到，
   `packages/**` 是禁区且有 agent 在飞）。

2. **C-25 红是 T-03r 在飞改动带出来的，不属本任务，未动**
   根因已定位：`packages/shared/src/constants/copy.ts`（mtime **01:24:03**，T-03r / A-43 #76）把
   `WORDBOOK_COPY.emptySignedOut.link` 从 `随便查几个词` 改成引用 `SWITCH_TO_REGISTER_LABEL`
   = `没有账号？注册`，而 `AUTH_COPY.wall.link` 也是同一串 ⇒ `WordbookScreen` 未登录卡上
   **现在有两个同名单元**（`secondary` 的 onClick = `host.navigate('/')`，`link` 的 onClick = `goLogin('register')`），
   而 `wordbook-screen.spec.tsx:996` 的 `clickableByText(AUTH_COPY.wall.link)` 取的是**文档序第一个**
   = `secondary` ⇒ 点了去 `/`，于是 `expected '#/'`。
   修法二选一（都超出 T-14d 范围：`WordbookScreen.tsx` 的未登录卡 = T-18b 名下、`copy.ts` = 在飞禁区）：
   ① 若 §3.6.5-3 只要一件文字链，删掉 `secondary` 或换回 `随便查几个词`；② 若两件都要，用例改成按
   `[role=button]`/容器位置定位 `link` 那一件。请派 T-18b 或 T-03r 收口，**本任务没有为了绿而改用例**。

3. **`kvSet` 的内存兜底其实是"写了但读不到"（数据层观察，禁区未动）**
   `bridge.ts:69-79` 失败时 `memory.set(...)` 并返回 `false`，但 `kvGet`（`:48-55`）
   是 **localStorage 优先且直接 return**，只在 localStorage 整个不可用时才读 `memory`
   ⇒ 配额满这类"单个键写失败"之后，那份内存兜底**永远读不到**，`loadState()` 回到写之前的值。
   所以 `QueueWriteError` 的 message（"这条操作只在内存里"）比实际情况还乐观一点，
   而 `deleteNotQueued` 的"先记在手机上了"在这一格同样偏乐观。本任务的三处 catch 只保证**不发成功承诺**，
   语义与之一致；文案与兜底策略要不要一起收口，请 T-14 复核（`bridge.ts`/`data/**` 我一行未动）。

4. **在飞文件提醒**：`apps/app/src/components/wordbook-toolbar.tsx` mtime **01:24:43**（本任务开始后）
   —— 有 agent 在改它，而 `WORDBOOK_APP_COPY.deleteNotQueued` 正是本任务三处复用的常量。
   现值已复核仍在原位（`:71`），但若那一串被移动/改名，`result-row.tsx` 的 import 需同步。

---

## 6. 遗留清单

| 编号 | 事项 | 建议归属 |
|---|---|---|
| T-14d-L1 | 收藏侧失败串待 PM 定稿（见 §5-1），定稿后替换 `result-row.tsx:513` 一行 | PM + T-14e |
| T-14d-L2 | `deleteNotQueued` 从 `wordbook-toolbar.tsx` 上移到 `@tm/shared`（文案唯一源，§8.2-2） | T-12/T-18 文案收敛轮 |
| T-14d-L3 | C-25 未登录卡两个同名文字链（同 §5-2） | T-18b 或 T-03r |
| T-14d-L4 | C-23 的导入接缝桩（`vi.mock` + `fault.removeThrows`）换成 `Storage.prototype.setItem` 真链路 | 批次5 U-4（A-45 #100 已登记，本任务未插队） |
| T-14d-L5 | `kvGet` 的 localStorage 优先读使内存兜底不可见（§5-3） | T-14（契约面 owner） |
| T-14d-L6 | 真机走查：WebView 关 DOMStorage / 配额满 两种条件下三处反馈（jsdom 只能证到 `setItem` 抛这一半） | T-23 |
