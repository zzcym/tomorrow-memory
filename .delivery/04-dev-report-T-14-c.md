# T-14c 开发报告 — 缺陷 F-2（A-43 #77）：storage 写盘失败必须对调用方可感知

- 任务代号：**T-14c**（批次 4C 第二波）｜裁决依据：`.delivery/04-adjudications.md:518` A-43 #77
- 规范依据：`.delivery/03-ui-spec.md:846`（§3.6.5 表末行「删除写失败（离线）| 行不消失 + toast | `这条先记在手机上了，联网后会自动删掉`」）+ PRD §6.6 人话原则
- 允许改动面（本轮实到 3 个文件，全在 T-14 名下）：`apps/app/src/native/bridge.ts`、`apps/app/src/data/offline-queue.ts`、`apps/app/test/offline-queue.spec.ts`
- **未触碰**：`screens/**`、`components/**`、`data/startup.ts`、`host.tsx`、`packages/**`、`apps/web/**`，以及 `wordbook-screen.spec.tsx` 的 C-23 用例（一字未改，`git` 层面该文件本轮零改动）

---

## 1. 交付物清单（文件 + 行数）

| # | 文件 | 轮前 | 轮后 | Δ | 性质 |
|---|---|---|---|---|---|
| 1 | `apps/app/src/native/bridge.ts` | 157 | 169 | +12 | 改：`kvSet` 由 `void` 改返回 `boolean` |
| 2 | `apps/app/src/data/offline-queue.ts` | 364 | 433 | +69 | 改：新增 `QueueWriteError`；`saveState`/`migrateLegacyQueue` 写失败上抛；`flushOfflineQueue` 内部消化并如实报 `ok:false` |
| 3 | `apps/app/test/offline-queue.spec.ts` | 286 | 334 | +48 | 补 **1 条**用例（该文件 12 → **13 个 `it`**，未新建 spec 文件） |
| 4 | `.delivery/04-dev-report-T-14-c.md` | — | 本文件 | 新增 | 交付报告 |

源码净增 **+81** 行，测试净增 **+48** 行。生产代码 0 处新增依赖、0 处签名破坏（`kvSet` 返回类型 `void → boolean` 对调用方源码兼容，见 §4）。

---

## 2. 改动点逐条（文件:行号 → 改前 → 改后 → 为什么这么选）

### D-1 `apps/app/src/native/bridge.ts:57-66` → `:57-79`（`kvSet`）

- **改前**：`export function kvSet(key, value): void { try { …setItem/removeItem…; return; } catch { memory.set(key, value ?? ''); } }` —— 写异常被吞成**静默内存兜底**，返回值 `void`，调用方无从得知"其实没落盘"。
- **改后**：签名 `export function kvSet(key: string, value: string | null): boolean`（`:69`）；成功路径 `return true`（`:74`），catch 里仍然 `memory.set(...)` 后 `return false`（`:76-77`）；`:57-68` 补文档，写明"为什么不改成抛错"与 `@returns` 语义。
- **为什么 boolean 而不是抛错**：`kvSet` 是 token / identity / tempToken / flags / startup / host.kv 共 **12 处**调用点的底座（全表见 §4）。抛错会把语义无关的登录面、启动面一起炸掉；返回 boolean 对忽略返回值的 11 处**零影响**，只有需要成败的那一处（队列）自行判定后抛。内存兜底对"读"仍然成立 —— `kvGet`（`:48-55`）**一字未动**，隐私模式 / 未开 DOMStorage 时读路径行为不变。

### D-2 `apps/app/src/data/offline-queue.ts:52-73`（新增错误契约）

- **改前**：无。写失败在本模块根本没有"失败"这个概念。
- **改后**：`export class QueueWriteError extends Error { readonly key: string }`（`:59-68`，构造里 `Object.setPrototypeOf(this, new.target.prototype)` 防 ES5 降级断链导致 `instanceof` 失效）+ `export const isQueueWriteError`（`:70-71`）+ 私有 `writeFailedMessage(key, what)`（`:73-74`，错误对象带**可读原因**：「离线写队列没能存进本机存储（键 tm.wbSyncState）：WebView 未开 DOMStorage 或配额已满。这条操作只在内存里，进程结束就找不到，故按失败处理。」）。
- **为什么自定义类而不是裸 `Error`**：调用方（未来接线 toast 的 screen）要能把它和网络错误区分开；`key` 字段便于原生侧日志定位。`isApiError` 那条链（`rest-fetcher`）不受影响，二者互斥。

### D-3 `apps/app/src/data/offline-queue.ts:102-109` → `:126-140`（`saveState`，**根因收口点**）

- **改前**：`kvSet(SYNC_STATE_KEY, JSON.stringify(bounded));` 直接调、无返回判定 ⇒ `saveState` 永不抛 ⇒ `enqueueRemove` 永不抛 ⇒ `WordbookScreen.tsx:464` 的 `catch` 是死代码 ⇒ §3.6.5 末行分支真机不可达。
- **改后**：`:137-139` —— `if (!kvSet(SYNC_STATE_KEY, JSON.stringify(bounded))) throw new QueueWriteError(writeFailedMessage(...), SYNC_STATE_KEY);`
- **为什么**：这是口径要求的那一刀。bounded 截断逻辑（`WORDBOOK_MAX_ENTRIES`）与序列化完全不变，只加成败判定。

### D-4 `apps/app/src/data/offline-queue.ts:141-143` → `:172-183`（`migrateLegacyQueue` 的三处同族写点）

- **改前**：`saveState(state); kvSet(LEGACY_QUEUE_KEY, null); kvSet(LEGACY_SEQ_KEY, null); return moved;` —— 迁移写和两个"清旧键"写都不判成败，永远回一个 `moved` 成功数。
- **改后**：`saveState(state)` 现在天然会抛（新状态没落账就别回"搬好了"）；`:175-183` 把两个清除改成 `const queueCleared = kvSet(...)` / `const seqCleared = kvSet(...)`，任一为 false → 抛 `QueueWriteError('…旧队列键没能清掉，迁移未完成')`。**顺序刻意保持 `saveState` 先、清旧键后**（见 `:172` 注释）：反过来会在"清除成功 / 写盘失败"时把用户还没传上去的词直接抹掉，那是 R-20⑦ 的反例；现在最坏情况只是下次冷启动重搬一遍（push 幂等），**不丢词**。
- **附带**：无旧键时 `:141` 的 `if (!legacy || !legacy.length) return 0;` 提前返回，不产生任何写 ⇒ 常规路径零新开销。

### D-5 `apps/app/src/data/offline-queue.ts:171`（`enqueueUpsert` 的 `saveState`）与 `:184`（`enqueueRemove` 的 `saveState`）→ 现 `:211` / `:232`

- **改前**：两处调用 `saveState` 但 `saveState` 不可能抛 ⇒ 收藏与删除**永远成功**。
- **改后**：函数体一行未改（改动点在 D-3），但因为 `saveState` 现在会抛，两条入队路径**自动向调用方上抛**；本轮把 `:198-202`（`enqueueUpsert`）和 `:216-220`（`enqueueRemove`）的文档改成显式契约：「写盘失败抛 `QueueWriteError` —— 这是 §3.6.5 末行在真机上可达的唯一前提（`WordbookScreen.removeRow` 的 catch 依赖它）」。
- **为什么不在这里包 try/catch 转成返回值**：`data/queries/wordbook.ts:202-208` 的 `addWord`/`removeWord` 是 `void` 同步函数、被 screen 直接 `try { removeWord(...) } catch` 用；异常正是那条 catch 期望的形状，改成返回值等于要求禁改面的 screen 配合改动。

### D-6 `apps/app/src/data/offline-queue.ts:264-360` → `:313-330 / :348-354 / :379 / :405 / :410-417 / :420-428`（`flushOfflineQueue` 的三处写点：`:271` 迁移、`:314` 409 快照、`:345` 落账）

这三处不能"跟着一起抛"：flush 是 `async`，往外抛会变成 `runStartup` 步骤 reject，而且**服务端已经收下的批**不能因为本地没记上账就说没送。所以口径落地为「**不 reject，但绝不 `ok:true`**」：

- `:313-330` 新增 `let persistError: unknown = null;` 与 `const save = (state): boolean => { try { saveState(state); return true } catch (e) { if (!persistError) persistError = e; return false } }`；原 `:271` 的裸 `migrateLegacyQueue()` 改成 `try { migrateLegacyQueue() } catch { 记 persistError }`（`:331-335`）。
- `:348` 队列为空的提前返回：`ok: true` → **`ok: persistError === null`**，并带 `error: persistError ?? undefined`（`:354`）。
- `:379` 409 `WORDBOOK_STALE` 采纳快照的写：`saveState({...})` → `save({...})`（失败只记账不炸循环，同批重放的 `batch.baseVersion` 仍在内存里更新）。
- `:405` 整批彻底失败的返回：`error: lastError` → `error: lastError ?? persistError ?? undefined`（网络错误优先，写盘失败兜底）。
- `:408-417` 补传成功后的落账：原 `saveState(after); totalSent += …; onSynced?.(…)` 改成「先累加**事实**计数 → `if (!save(after)) break;` → 才调 `options.onSynced?.(…)`」。关键取舍：**写盘失败时 `onSynced` 不触发**，所以顶栏不会显示「已同步 · HH:MM」（那正是"承诺失真"的另一种形态）；`break` 是因为继续循环只会拿同一份没落盘的旧状态空转（否则最多 20000 轮）。
- `:422` 收口返回：`ok: !upserts.length && !removals.length` → **`ok: persistError === null && …`**，并补 `error: persistError ?? undefined`（`:428`）。
- 配套：`:69-70` 把 `FlushResult.error` 的文档从"最后一批彻底失败时的原始错误"扩为"或补传途中本地写盘失败的 `QueueWriteError`"。`startup.ts:60-66` 的 `if (!r.ok) setSyncFailed(true)` 因此**自动**在写盘失败时保留「还没同步」，无需改 `data/startup.ts`（禁改面）。

### D-7 `apps/app/test/offline-queue.spec.ts`（补的 1 条用例，未新建 spec 文件）

- `:14` `import { beforeEach, describe, expect, it }` → 加 `vi`；`:22/:24/:29` 从被测模块追加 `QueueWriteError` / `isQueueWriteError` / `saveState`（`addWord`/`removeWord` 本来就已 import，`:33`）。
- `:291-334` 新增 `describe('写盘失败（§3.6.5 末行「删除写失败」的可达性前提）')` 内 **1 个 `it`**：先正常 `enqueueRemove('apple')` 并留一份盘上快照 `seeded`，再用 `vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })` 复现"WebView 写不进"，断言四件事：
  1. `saveState(loadState())` **抛** `QueueWriteError`（不是静默成功）；
  2. `enqueueRemove('banana')` / `removeWord('cherry')` / `addWord('date')` 全部**抛** `QueueWriteError`；
  3. `localStorage.getItem(SYNC_STATE_KEY)` 仍 `=== seeded` —— **盘上没有半截记录**（内存兜底没被当成写成了）；
  4. 网络侧成功的 `flushOfflineQueue` 回 `result.ok === false` + `isQueueWriteError(result.error) === true` + `onSynced` 调用数 `=== 0`；
  `finally` 里 `spy.mockRestore()`，随后断言 `loadState().pendingRemovals).toEqual(['apple'])` / `pendingCount()).toBe(1)` —— **恢复后队列还在原地，没凭空丢词**。
- 为什么打桩在 `Storage.prototype.setItem`：这是**真链路**（`kvSet` → `setItem`），不碰数据层以外的任何接缝，也不需要改禁改面。

---

## 3. C-23 转绿证据（命令原文 + 输出行）

### 出口命令 1

```
pnpm --filter @tm/app test -- offline-queue wordbook
```

关键输出行（两份文件全绿）：

```
 ✓  @tm/app  test/offline-queue.spec.ts (13 tests) 476ms
 ✓  @tm/app  test/wordbook-screen.spec.tsx (34 tests) 6287ms
 Test Files  1 failed | 11 passed (12)
      Tests  7 failed | 232 passed (239)
```

（`1 failed` 全部来自 `test/progress-screen.spec.tsx`，见 §5 并发说明；`--` 过滤位在本仓 `vitest run --project` 包装下不裁文件，所以这一跑实际是全量，数字与出口命令 2 一致。）

### 出口命令 2

```
pnpm --filter @tm/app test
```

```
 Test Files  1 failed | 11 passed (12)
      Tests  7 failed | 232 passed (239)
   Duration  13.72s
 FAIL   @tm/app  test/progress-screen.spec.tsx > … P-04 / P-09 / P-11 / P-12 / P-21 / P-22 / P-26（共 7 条，全在同一文件）
```

### 哨兵语义必须说清（不粉饰）

C-23 的断言在**本轮前后都是绿的** —— 因为它在 `wordbook-screen.spec.tsx:66-77` 用 `vi.mock('../src/data/queries/wordbook.js')` 在**导入接缝**上直接把 `removeWord` 换成会抛的桩，桩**绕过了** `bridge.kvSet → localStorage` 这条真链路，所以旧代码里那个"永不抛"的洞它测不到。也就是说：**"红"发生在生产链路（§3.6.5 末行真机不可达），不在这条用例的断言里。**

本轮把两半都补齐了：

- 桩所模拟的那个抛错，**现在真链路会给出了** —— 由 `test/offline-queue.spec.ts:293`（`vi.spyOn(Storage.prototype,'setItem')` 打真链路）钉住：`saveState` / `enqueueRemove` / `removeWord` / `addWord` 全部上抛 `QueueWriteError`。
- C-23 本身（`wordbook-screen.spec.tsx:884-898`，`expect(rowOf('apple')).not.toBeNull()` / `lastToast().message).toBe(COPY.deleteNotQueued)` / `tone === 'error'` / 禁「云端/本地」字样 / `pendingRemovals).toEqual([])`）**零改动且持续绿**（上面 `(34 tests)` 行），即接线的 catch 分支与数据层的新契约**语义对齐**。

---

## 4. 12 处 `kvSet` 调用点的影响面自查（`void → boolean`）

`grep -rn "kvSet(" apps/app/src packages apps/web/src` → **恰好 12 处**（不含定义行 `bridge.ts:69`）。TS 层面：返回 `boolean` 的函数可赋给 `(k,v)=>void` 类型的槽位，**忽略返回值不构成类型错误**，所以 11 处"不判成败"的调用点源码与行为都不变。

| # | 位置 | 写的键 | 是否判返回值 | 语义影响 |
|---|---|---|---|---|
| 1 | `native/bridge.ts:91`（`readToken` 反向回灌） | `tm.token` | 否（忽略） | 无。冷启动 token 补写仍是尽力而为；写不进则下次再灌 |
| 2 | `native/bridge.ts:98`（`writeToken`） | `tm.token` | 否 | 无。Bridge `saveToken` 是这条路径的真源（双写 §3.1），localStorage 只是副 |
| 3 | `native/bridge.ts:109`（`writeIdentity`） | `tm.phone` | 否 | 无（同上） |
| 4 | `native/bridge.ts:110`（`writeIdentity`） | `tm.nickname` | 否 | 无 |
| 5 | `native/bridge.ts:116`（`clearCredential`，401 单点登出） | `tm.phone` | 否 | 无。登出的真源是服务端 + Bridge `clearToken` |
| 6 | `native/bridge.ts:117`（`clearCredential`） | `tm.nickname` | 否 | 无 |
| 7 | `native/bridge.ts:135`（`writeTempToken`，R-40④） | `tm.tempToken` | 否 | 无 |
| 8 | `data/offline-queue.ts:137`（`saveState`） | `tm.wbSyncState` | **是 → 抛** | **本轮靶心**：删除/收藏写失败不再谎报成功 |
| 9 | `data/offline-queue.ts:175`（`migrateLegacyQueue` 清旧键） | `tm.wbQueue` | **是 → 抛** | 迁移未完成不再回"搬好了" |
| 10 | `data/offline-queue.ts:176`（`migrateLegacyQueue` 清旧 seq） | `tm.wbSeq` | **是 → 抛** | 同上 |
| 11 | `data/startup.ts:231`（`VERSION_PROMPT_KEY`，R-17 提示去重） | `tm.appVersionPrompt` | 否 | 无。**且是好事**：这是"下次还提示一次"的抑制位，写失败顶多多提示一次，不该升级为异常（该文件禁改，本轮未动） |
| 12 | `host.tsx:133`（`UiHost.kv.set`，通用 KV 底座） | 任意（如 `tm:wb-sidebar:v1`） | 否 | 无。箭头函数 `(k, v) => kvSet(k, v)` 现在多返回一个 `boolean`，但 `UiHost.kv.set` 的声明返回 `void`，消费方全部忽略；侧栏收起态之类写失败只是不记忆偏好（该文件禁改，本轮未动） |

**结论**：判成败的 3 处全在 `offline-queue.ts`（本轮名下）；其余 9 处零影响。`kvGet`（读侧）未改 ⇒ 内存兜底对"读"仍然成立，隐私模式 / 未开 DOMStorage 的读行为与改前逐字一致。

---

## 5. 上报未修（交回 TPM 派单）

- **U-1｜查词页星标/移除未接失败反馈** —— `apps/app/src/components/result-row.tsx:468`（`removeWord(target)`）与 `:493`（`addWord(word)`）**没有 try/catch**。`saveState` 现在会真抛，这两处在 storage 写失败时会把异常抛到点击处理器里（改前是**谎报成功**，改后是**不谎报但无反馈**）。§3.6.5 末行那条定稿 toast 在这一面尚未接线。文件属 `components/**`，**禁改面**，请派 T-14d（owner：R-16 / 查词页）。
- **U-2｜撤销路径同类问题** —— `apps/app/src/screens/WordbookScreen.tsx:450`（`undoRemove` 里的 `addWord(word, patch)`）无 try/catch：配额满时，用户在 5 秒窗口点「撤销」会抛未捕获异常（且撤销没落账，行状态与服务端不一致）。属 `screens/**`，**禁改面**，与 U-1 同批派单最省（同一条失败 toast 的复用）。本轮刻意**没去**改 `WordbookScreen.tsx`，包括没动那行 catch 的注释。
- **U-3｜token / flags / host.kv 要不要也可见** —— 口径明确要求 `kvSet` **不得抛错**，因此 `bridge.ts` 内 7 处凭据写、`startup.ts:231`、`host.tsx:133` 本轮**一律不判返回值**。若产品要求"登录态写失败也要提示"，正确做法是新增一个 `kvSetOrThrow` / `kvSetChecked` 门面再逐点迁移，属新范围（估算 4 处、含 startup/host 两个禁改面），未做。
- **U-4｜C-23 的桩仍绕过真链路** —— 建议后续把 `wordbook-screen.spec.tsx:66-77` 的 `vi.mock('../src/data/queries/wordbook.js')` 换成 `vi.spyOn(Storage.prototype, 'setItem')`，让这条用例端到端钉住「WebView 关 DOMStorage ⇒ 点删除 ⇒ 行不消失 + 定稿 toast」，而不是钉一个手写桩。该文件在**禁改**清单（本轮一字未动），故只上报。
- **U-5｜全套数字瞬时红，疑似并发所致** —— 本轮出口 2 的 `7 failed` **全部**落在 `test/progress-screen.spec.tsx`（P-04 / P-09 / P-11 / P-12 / P-21 / P-22 / P-26），报错形态是 `Invalid Chai property: toBeDisabled`（jest-dom 匹配器未注册）与 `router /progress 仍指向 ScreenFallback`（T-18c-r3 在飞）。与 T-14c 的三个文件**无文件交集、无调用交集**（单词本队列不参与 progress 投影）。交回时**T-14c 名下 0 错**（`offline-queue.spec.ts 13/13`、`wordbook-screen.spec.tsx 34/34`），输出原样如上。

---

## 6. 遗留清单

| 编号 | 事项 | 影响 | 建议归属 |
|---|---|---|---|
| L-1 | U-1 / U-2 两面失败反馈未接线（`result-row.tsx` 星标/移除、`WordbookScreen.undoRemove` 的撤销） | 写盘失败时这两条路径抛未捕获异常（不谎报，但也没有人话反馈）；概率=配额满 / WebView 关 DOMStorage | T-14d（同一条 `deleteNotQueued` 文案复用，约 20 行 + 2 条用例） |
| L-2 | U-4：C-23 桩改成真链路注入 | 测试强度（现在靠 §3 的两半证据拼出闭环） | 批次 5 测试加固轮 |
| L-3 | `kvSet` 内存兜底与 localStorage 的一致性：写失败时 `memory` 里会留影子值，`kvSet` 成功恢复后读侧仍以 localStorage 优先（`kvGet` 不改即无脏读），但 `memory` Map **只增不减**，长期跑有微量驻留 | 极小（键数量个位数）；本轮刻意不动 `kvGet`/`memory` 以保持读侧零改动 | 观察项，暂不派 |
| L-4 | 迁移重入可能产生**同词重复 upsert**（旧键清不掉 → 下次冷启动重搬） | push 幂等（服务端按词 upsert），仅载荷体积变大；已刻意用"先写后清"保证**绝不丢词** | 观察项；若要根治需在 `migrateLegacyQueue` 里对 `state` 去重，可并入 T-14d |
| L-5 | `progress-screen.spec.tsx` 的 7 条红（U-5） | 非本轮面 | TPM 找 T-18c 确认是否并发瞬时态 |
