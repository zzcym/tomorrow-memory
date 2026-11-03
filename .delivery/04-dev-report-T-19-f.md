153 .delivery/04-dev-report-T-19-f.md

# T-19f 交付报告 — App「关于」屏 `AboutScreen`（批次 4 / 批次4 App 端屏，A-69 派工）

日期：2026-09-21　施工方：T-19f　PRD §8.3-B 第 12 项 / R-01⑧ / R-03·R-20 / R-17⑨、UI §3.8.6。
出口命令两条全部亲跑，原样尾行见 §④；`data.db` 跑前跑后指纹见 §②（逐字段未变）。

**一句话**：新增且仅新增 2 个文件（屏 75 行 / spec 449 行 · 20 条用例），全部文案逐字引 `@tm/shared` 的
`notice.ts`/`copy.ts`（屏内 0 中文产品字面量、0 新串、0 自画控件、0 网络请求、0 凭据写、0 新存储通路），
"关闭 24 小时"这一档**复用壳既有件 `VersionBanner`** 而非在屏内重写；
`pnpm --filter @tm/app test` = **16 files / 355 passed / 0 failed**（基线 15/335，只增不减），
`pnpm --filter @tm/app typecheck` = **0 errors**。`router.tsx`/`main.tsx`/`data/**`/`auth-store.ts`/
`packages/shared`/`packages/ui`/`apps/web` **一字未动**。

---

## ① 开工指纹（真库只读，开工 / 收工各量一次）

| 文件 | 大小 (B) | sha256 前 12 | mtime |
|---|---|---|---|
| `data.db`（真实库，只读）开工 | 253952 | `6595517661cc` | 2026-09-18 04:05:38 |
| `data.db` 收工（全部出口命令之后） | 253952 | `6595517661cc` | 2026-09-18 04:05:38 |
| `packages/server/data.db` 开工 = 收工 | 0 | `e3b0c44298fc` | 2026-09-17 00:10:53 |

跑前 = 任务书基线，跑后逐字段相同 ⇒ 本轮对两库**零写入 / 零 DDL/DML / 零 mtime 变化**。
未使用 `--i-know-this-is-prod`。库内内容数字未进本报告（§6.6-2：N/M/K 一律"若干"，本轮根本不触库）。

## ② 新文件与逐件判据 + 实测落点

| 文件 | 行数（`wc -l`）| 职责 |
|---|---|---|
| 🆕`apps/app/src/screens/AboutScreen.tsx` | **75** | 纯公开只读信息屏。三块：同步承诺两句 + 当前登录方式公告 + 版本行。全部串 import 自 `@tm/shared`。0 登录态分支、0 请求、0 存储 API、0 自画可交互件。 |
| 🆕`apps/app/test/about-screen.spec.tsx` | **449** | 20 条用例，A 源码哨兵 6 / B 屏内容逐字同源 5 / C 访客 vs 已登录 2 / D 关闭 24h 两态 4 / H 反向哨 3。宿主形态照 T-19c：`createRoot`+`act` 直渲，**外套真实 `shell/TabBarShell`**（版本横幅档就挂在它上面），只 stub `global.fetch`（供 `checkAppVersion` 取 `/api/version`），全文件 fake timers 推 `Date.now`。 |

### 逐件判据 → 落点（`文件:行号`）

| 判据（来源） | 落点 |
|---|---|
| 「同步承诺」逐字同源、引 `notice.ts`、不改写不拼接（§8.3-B12 + UI §3.8.6 + §8.3-D/§6.2 数据存放硬口径） | `AboutScreen.tsx:53` `SYNC_ROWS = [SYNC_PROMISE, DATA_OWNERSHIP_NOTE]`，`:64-70` 原样 map 成 `<li>`；两串在 `notice.ts:69` = `同账号同数据、换机不丢`、`notice.ts:71` = `你的词本和学习记录只属于你，可以随时导出或删除`。二者**都不含** `云端`/`本地`/`缓存` ⇒ 定稿串已处理该口径，屏只引用（spec B-02 逐字 `toEqual` + H 组禁词 0 命中双钉）。 |
| 「当前登录方式公告」= `LOGIN_METHOD_NOTICE`，与登录弹窗 `NoticeBar` 同形态同源（R-01⑧） | `AboutScreen.tsx:74-76` 经 `@tm/ui` 的 `NoticeBar`（`layout='bar'` `role='status'`，其文件头 :8 写明该形态就是 R-01⑧ 的固定公告一句）。串引 `notice.ts:63`。 |
| 公告"两态（验证码 / 密码）"真断言 | `notice.ts:63` 这一**单条定稿串本身即两态取值**：正文报当前 = 手机号 + 密码，括注报验证码通道"后续开通"（Q1 定案：本期验证码入口仍在但不给送达承诺）。spec B-03 钉 `可见文本 === LOGIN_METHOD_NOTICE` 且 `toContain('手机号 + 密码')` + `toContain('验证码')`。**产品不存在 per-device 的"验证码登录态"**（见 §⑥-1）。 |
| 访客态行为钉住、不得出现"请登录"式自造话术（R-01⑧ 未登录可读） | 屏**不判登录态**、不 import `auth-store`/`token-bridge`/`native/bridge`（A-03/A-05 静态钉），公告对任何态恒为同一串。spec B-05（访客）、C-01（`signIn` 播种已登录后）、C-02（两态同一公告节点、同串、条数=1）三处断言渲染文本 0 命中 `请登录`/`请先登录`/`登录后可见` 族。 |
| "有新版本时可关公告 24 小时"落盘走既有 kv 门面（约束 #4） | **不在屏内重写**：`/me/about` = `kind:'secondary'` → `main.tsx:62` 套 `TabBarShell`，其顶部 `VersionBanner`（`TabBarShell.tsx:79-109`）已用 `getPendingVersionPrompt`/`subscribeVersionPrompt` 订阅、文案取 `NOTICE_CHANNEL_COPY.updateAvailable`、关闭走 `dismissVersionPrompt()`（`data/startup.ts:230` → 写 `native/bridge.ts:69 kvSet`，`VERSION_PROMPT_KEY` 存 `{version, at}`，抑制判据 `shouldShowVersionPrompt` 用 `VERSION_PROMPT_SUPPRESS_HOURS=24`）。屏若再画一条即同页两条横幅 = 重复，故遵"0 重写 / 不新开裸存储通路"。spec A-06 钉"屏不 import 版本 store、不引 updateAvailable"。 |
| 关闭 24h 两态：关掉之后 24h 内不再出现 + 过期后重新出现（可控时钟，无 `waitForTimeout`） | spec D-01（有新版本→横幅出现、文案逐字、关闭钮 `aria-label===VERBS.cancel`）、D-02（点关→消失 + `VERSION_PROMPT_KEY` 落 `{version,at:T0}` + 窗口内 `checkAppVersion(T0+24h-1ms)` 仍不出）、D-03（跨窗 `checkAppVersion(T0+24h+1ms)`→重新出现）、D-04（抑制记录按版本键，只压制那一版）。全用 `vi.setSystemTime(T0)` + 显式 `now` 入参推进，无 `waitForTimeout`。 |
| 屏内 0 中文产品字面量 / 0 `:has(` / 0 `test.fail` / 0 `required` / 0 裸 `localStorage`·`setItem`（约束 #3） | 剥注释机检：CJK(一-鿿) 命中 = **0**、`:has(` = 0、`localStorage` = 0、`setItem` = 0、`getItem` = 0、`test.fail` = 0、`required` = 0（见 §⑤自查）。spec A-01/A-02 同口径再钉一遍。 |
| 二级页返回语义（约束 #7）：能正常返回上一屏，不照抄强制改密页 `stay` | `router.tsx:278 handleSystemBack` 对非 `GATE_UPGRADE_PATH` 走默认后退支（`/me/about` 不在 `stay` 名单里）；屏**不装饰 `window.onAndroidBack`、不引 `blockedBackSignal`**（A-06 静态钉屏 0 触版本/返回件），返回完全交回 router。屏 0 diff 于 `router.tsx`/`main.tsx`。 |
| `data-testid` 只挂屏根（约束 #6，照 T-19c `:189`） | 全文 `data-testid` 恰 **1** 处 = `AboutScreen.tsx:60` 根 `about-screen`（本屏自建）；公告/承诺用 `role=status` + 结构选择器在 spec 定位，未给任何存量 DOM 补测试钩子，未为测试改产品 DOM。 |

其余仓库文件（`packages/**`、`apps/web/**`、`apps/app/src/router.tsx`/`main.tsx`/`data/**`/`lib/auth-store.ts`、`tools/**`、`.delivery/**` 主文档）**零 diff**。

## ③ 用例分组账（20 条，逐组钉住哪条判据）

| 组 | 用例 | 钉住的判据 |
|---|---|---|
| A 源码哨兵 | A-01 | 屏内剥注释后 CJK 0（0 中文产品字面量） |
| | A-02 | 0 `:has(` / 0 裸 `localStorage`/`setItem`/`getItem` / 0 `test.fail`/`it.fail` / 0 `required` |
| | A-03 | 屏 0 网络、0 凭据写、0 直接 import 存储桥 |
| | A-04 | Chrome84 四禁 + §5.1 新特性 + 逻辑赋值 + 顶层 `await` 0 命中 |
| | A-05 | `data-testid` 恰 1 且在根上；屏不 import `router.js`、不调 `navigate(` |
| | A-06 | 屏不重写版本横幅（不 import `data/startup`、不引 `updateAvailable`/`dismissVersionPrompt`） |
| B 屏内容 | B-01 | 真实 `TabBarShell` 下渲染，标题逐字 = `SETTINGS_COPY.groups[4]` |
| | B-02 | 同步承诺两句逐字 = `SYNC_PROMISE`/`DATA_OWNERSHIP_NOTE`、顺序锁死 |
| | B-03 | 登录方式公告逐字 = `LOGIN_METHOD_NOTICE`，且该串内含"密码 / 验证码"两态取值 |
| | B-04 | 版本行逐字 = `NOTICE_REVISION` |
| | B-05 | 访客态屏体 0 命中禁词族（含"请登录"） |
| C 两态 | C-01 | `signIn` 播种已登录后公告逐字不变、仍无"请登录"（读数只读、屏对态不敏感） |
| | C-02 | 访客 vs 已登录：同一公告节点、同串、`[role=status]` 条数各 = 1 |
| D 关闭 24h | D-01 | 有新版本→横幅出现、文案逐字 = `updateAvailable`、关闭钮 `aria===VERBS.cancel` |
| | D-02 | 关掉→消失 + 落 `{version,at}` 记录 + 24h 窗口内再检查仍不出 |
| | D-03 | 跨 24h 窗→同一版本重新出现（可控时钟） |
| | D-04 | 抑制记录按版本键（只压那一版，钉既有件语义不误伤） |
| H 反向哨 | H-01 | 初始帧本屏子树可见文本 0 命中 §8.3-D/§6.2 禁词族 |
| | H-02 | 带版本横幅帧连壳横幅一起扫仍 0 命中数据存放禁词 |
| | H-03 | 本屏子树可交互元素 = 0（动作全归壳与既有件） |

**存量只增不减**：`Test Files 16`（基线 15 + 我的 1）、`Tests 355`（基线 335 + 20），0 skipped、0 failed。
本轮**未改任何存量文件**，故基线的 335 条一字未动。

## ④ 出口命令：原样尾行（只贴真跑出来的）

预算 2 条 = `#1 pnpm --filter @tm/app test`、`#2 pnpm --filter @tm/app typecheck`。**各实跑 2 次**（第 1 次跑通、第 2 次取原样尾行），全部一次通过、无判闪。

`#1`（终态，11:45 起跑，`tail` 原样）：

```
 ✓  @tm/app  test/about-screen.spec.tsx (20 tests) 345ms
 Test Files  16 passed (16)
      Tests  355 passed (355)
   Start at  11:45:42
   Duration  16.23s (transform 4.72s, setup 0ms, collect 28.04s, tests 49.99s, environment 20.15s, prepare 4.30s)
```

`#2`（终态，整段就是原样输出，0 错误所以没有第二行）：

```
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0
```

超编申明（依 A-69 行 196 新规"允许 N 次 + 判闪重跑单独申明"）：
- 出口命令：`#1` 实跑 2 次（首次即 15→16 全绿，第二次取尾行）、`#2` 实跑 2 次（首次即 0 错，第二次取尾行）。**无判闪、无失败迭代**，第 2 次纯属抓原样尾行。
- 其余非出口只读命令（读文件 / `grep` / `sed` / `wc -l` / `python` 只读 `sha256`）不计入出口预算：
  - 读写面文件与 `notice.ts`/`copy.ts`/`auth-store.ts`/`token-bridge.ts`/`bridge.ts`/`startup.ts`/`offline-queue.ts`/`host.tsx`/`TabBarShell.tsx`/`NoticeBar.tsx`/`router.tsx`/`main.tsx`/`ui-spec`/`prd` 的锚点定位（grep/wc）。
  - `PYTHONIOENCODING=utf-8 python -c "…sha256…"` ×2：开工 / 收工取两库指纹（只读 `open(...,'rb')`）+ 屏面 CJK/禁项自查。
  - 未跑：Playwright、`@tm/web test`、`@tm/server test`（任务书禁列）。

**并发中间态说明**：T-19d 同时在写 `data/queries/auth.ts`。本轮两次出口全绿、未见非我名下红；
我的屏/spec **不 import `data/queries/**`**，与其写面无交集，不构成撞车。若后续合跑出现 `data/` 红，按并发中间态归类，不属本轮修面。

## ⑤ 复用清单（0 重写）

| 复用件 | 来源 | 本轮怎么用（只消费不改） |
|---|---|---|
| `SYNC_PROMISE` / `DATA_OWNERSHIP_NOTE` / `LOGIN_METHOD_NOTICE` / `NOTICE_REVISION` / `SETTINGS_COPY.groups[4]` | `@tm/shared`（`notice.ts` / `copy.ts`） | 屏内每一句用户可见中文都逐字引这些常量，屏 0 新串、0 拼接。 |
| `NOTICE_CHANNEL_COPY.updateAvailable` / `VERBS.cancel` / `VERSION_PROMPT_SUPPRESS_HOURS` | `@tm/shared` | 版本横幅文案与关闭动作标签的唯一源（由壳既有件引，屏 0 触）。 |
| `NoticeBar`（`layout='bar'`） | `@tm/ui` | 登录方式公告的呈现件，与登录弹窗那颗同源同形态。 |
| `VersionBanner` + `getPendingVersionPrompt`/`subscribeVersionPrompt`/`dismissVersionPrompt`/`shouldShowVersionPrompt`/`checkAppVersion` | `apps/app/src/shell/TabBarShell.tsx` + `apps/app/src/data/startup.ts` | "关闭 24 小时"整档复用，屏 0 重写；spec 挂真实壳 + `checkAppVersion` 驱动两态。 |
| `kvGet`/`kvSet`（App 既有 kv 门面） | `apps/app/src/native/bridge.ts` | 落盘抑制记录由 `dismissVersionPrompt`→`kvSet` 完成（屏与本轮均不直连此层，遵 token-bridge 规约）。 |
| `signIn` / `refreshFromStorage`（唯一写点 / 只读快照） | `apps/app/src/lib/auth-store.ts` | 仅 spec 侧播种已登录态（与 T-19c 同口径）；屏不 import 它，读数保持只读。 |
| 宿主形态（`createRoot`+`act`、真实壳包裹、只 stub `global.fetch`、`stripComments` 源码扫描） | `apps/app/test/upgrade-screen.spec.tsx`（T-19c） | spec 骨架照抄其已验收形态，未新引测试依赖。 |

屏侧一条都不重写：文案（shared）、公告呈现件（`@tm/ui`）、版本提示与 24h 抑制（`startup.ts`+壳）、
存储落盘（`bridge.ts`）、登录态（`auth-store`）。

## ⑥ 上报未修（凡我写的与盘面不符，如实上报，未自改产品迁就措辞）

1. **🔴 任务书"当前登录方式两态（验证码 / 密码）"与盘面对不上**：
   - `notice.ts` 里"登录方式公告"**只有一条定稿串** `LOGIN_METHOD_NOTICE = 当前登录方式：手机号 + 密码（短信验证码通道后续开通）`（`:63`），
     UI §3.9.1 `:1033` 与 §8.3-B 第 12 项也确认关于页这一格**恒为该单串**（三列同左）。**没有**"验证码登录"的第二态定稿串。
   - 且 App 侧登录态真值源（`auth-store` 快照 `AuthSnapshot`、`token-bridge` 的 `readStoredIdentity`/`tokenChannel`）**不带任何"登录方式"维度**：
     只有 `status/phone/nickname/hasToken/upgradeRequired/upgradeSessionOnly/pendingAction`。⇒ "现在这台是验证码登录还是密码登录"**无 per-device 读数可取**。
   - 处置：屏按**单一固定串**渲染（未登录可读），未伪造"验证码态"文案、未新增数据源、未自造第二句。spec B-03 把"两态"钉在**定稿串自身的两 clauses**（含 `手机号 + 密码` 与 `验证码`）上，C 组钉"该串对访客 / 已登录两态逐字一致"。
   - **要请 TPM 定夺**：若确实要 per-device 的验证码/密码两态，那是 **shared 缺串 + auth-store 缺维度**（缺串应回 T-03，auth-store 归 T-19a），不在本屏可写面。我按现有盘面交付，**未自行改产品行为**。

2. **🔴 "关闭公告 24 小时写失败要如实可见"与既有裁决 A-47 #99 正面冲突，且缺用户可见失败定稿串**：
   - 既有 kv 门面**能给"带过期时间的键"这一形状**（`startup.ts` 的 `{version, at}` 记录 + `shouldShowVersionPrompt`），约束 #4 的这一问**不成问题**，故未停在这一步。
   - 但"写失败要如实可见"做不到：App 端承载 24h 关闭的**唯一**既有动作 `dismissVersionPrompt()`（`startup.ts:230`）**丢弃 `kvSet` 的 boolean 返回值**，不抛 `QueueWriteError`。而 `token-bridge.ts:6` 明文记 **A-47 / #99："本期只有离线队列判写盘成败，token/flags 面沿用现状"** ⇒ 版本公告抑制是"flags 面"，被该裁决划在**不判成败**之列。
   - 要让本屏"写失败可见"，只有三条路且全越界：改 `data/startup.ts`（禁改、T-19d 在飞）、开一条屏内裸 `kvSet` 通路（约束 #4 明禁 + 违 token-bridge 规约）、或自造一句"没记住"失败 toast（**shared 无此定稿串**，且 §8.3-D 禁把 `本机存储`/`进程` 这类 `QueueWriteError.writeFailedMessage` 的诊断语上屏）。
   - 处置：屏**只复用**既有 `dismissVersionPrompt`（内存兜底时本会话内 `kvGet` 仍能读回 ⇒ "24h 内不再出现"在会话内成立，仅跨进程重启才丢，与 A-47 #99 的 flags 面口径一致），**未假装"已持久化"**、未新开通路、未自造串。spec D-02 只钉"关掉后不再出现 + 落了 `{version,at}` 记录"，**不**断言跨进程持久性。**若要求 flags 面也判写成败，请回 A-47 #99 重裁或给失败定稿串**。

3. **"有新版本时可关公告 24 小时"这一档不在屏体内，在壳的全局横幅**（设计判定，供复核）：
   `/me/about` 由 `TabBarShell` 包裹，`VersionBanner` 已在顶部单点承载 R-17⑨（文案 / 关闭 / 24h 抑制 / 落盘全在既有件）。屏若再画一条 = 同页两条横幅重复。故遵"0 重写"把该档留在壳里，spec 把屏挂进**真实壳**验证两态。若产品要"关于页内单独一条常驻版本行（可关）"，那是**新形态、需新落点与可能新串**，请明示，我按指示重做。

4. **屏未 import `auth-store`/`token-bridge`**：因屏无"登录方式"可取（见 1），import 它会为不存在的数据分支。任务书"读数只读取得（auth-store 快照 / token-bridge）"的前提（存在登录方式读数）不成立 ⇒ 屏保持 0 读登录态、公开可读。已按 §⑥-1 上报。

5. **`tools/ownership.json` 授权缺口（未动，属 E4）**：`apps/app/src/screens/AboutScreen.tsx` 与 `apps/app/test/about-screen.spec.tsx` 的 owner 行若缺表，`--check-ownership` 会红。按 A-69 #197 口径（跨主 / 新文件的账面归 E4 补），本轮一行未碰。

6. **挂载未做（A-44 #86 / A-69 收口）**：`router.tsx:58` 的 `/me/about` 仍登记 `SCREEN_PLACEHOLDER`，未接真 `load`。需要 TPM 加的**一行**：
   `apps/app/src/router.tsx:58` 把 `{ path: '/me/about', kind: 'secondary', load: SCREEN_PLACEHOLDER }` 的 `load` 换成
   `load: () => import('./screens/AboutScreen.js')`。`main.tsx` **无需改**（非 gate → `TabBarShell`，`VersionBanner` 随壳自动出现）。
   与 T-19c 的 gate 屏、T-19d 的 security 屏同批，建议 A-69 所说"五屏齐一次改一次跑"。

7. **`NoticeBar` 的 `role` 默认值**：`layout='bar'` 默认 `role='status'`（其 :105），本屏显式传 `role='status'` 与之一致；spec 靠 `[role=status]` 在屏子树内唯一定位公告（屏子树 0 其它 `role=status`）。若后续 shared/`@tm/ui` 改这条默认，B-03/C-02 会红，属跨面联动，登记备查。
