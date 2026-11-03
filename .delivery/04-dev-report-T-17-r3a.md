# 开发报告 · T-17 第 3 轮 A（App 前端：lookup 侧 + 路由挂载）

角色：前端开发工程师（App 端）｜独占文件：`apps/app/src/screens/LookupScreen.tsx`、`apps/app/test/lookup-screen.spec.tsx`、`apps/app/src/router.tsx`（仅 :50/:51 两行 `load`）
本轮**未碰**：`screens/WordDetailScreen.tsx`、`test/detail-screen.spec.tsx`（并行 r3b）、`components/result-row.tsx`、`components/ai-mnemonic-bar.tsx`、`lib/**`、`packages/**`。零 git 写操作，零 `data.db` 触碰。

---

## 一、完成清单

| 项 | 状态 | 文件 | 备注 |
|---|---|---|---|
| 判据③ 最近查询面板恢复（红 1） | done | `test/lookup-screen.spec.tsx:400-417` | **断言侧错**，实现侧合规；按 UI §3.3:625 重摆断言位置并加反向断言 |
| 判据③ 清空二次确认（红 2） | done | `test/lookup-screen.spec.tsx:443-467` | **断言侧错**（Radix portal 断言打在容器上）；文案取自 `LOOKUP_COPY.recent.*` |
| 判据⑥ 取消收藏二次确认（红 3） | done | `test/lookup-screen.spec.tsx:505-530` | **断言侧错**（两处：夹具形状 + portal）；文案 `LOOKUP_COPY.unfavoriteConfirm.*` |
| §3.1.5 方向链带方向（红 4） | done | `src/screens/LookupScreen.tsx:214-225` | **实现侧错**，根因在共用件 `result-row.flippedDirection`（见 §四 越界申请 ①），本轮在页内按 aria 承诺取反向，未改共用件 |
| 路由挂载 `:50` `:51` | done | `src/router.tsx:50-51` | 产物按路由分包已生效（见 §三 出口 3） |
| 词本列表夹具形状 | done | `test/lookup-screen.spec.tsx:492-495/508-512` | `{words:[…]}` → `{data:[…]}`（`WordbookGetResultSchema`） |

**四条红的文案/断言取证**（判据口径：文案真相在 `@tm/shared`，界面文案本已由第 2 轮正确引用，无需改动实现文案）：

| 串 | shared 源 | UI 规范行 | 结论 |
|---|---|---|---|
| `最近查询` | `packages/shared/src/constants/copy.ts:175` | §3.3 `03-ui-spec.md:625`「头部行……**无历史时整行不渲染**，不是置灰」+ §6 `:1467` | 实现按 §3.3 渲染（无历史时面板只有 §3.1.5 `:564` 的 108px 空态行，`RecentSearchPanel.tsx:98-161` 三元顺序可证）。**断言把标题要求放在了无历史态** ⇒ 断言侧错。现改判：无历史态断言标题**缺席**，有历史态断言 `最近查询` 出现（`panel` 实得 `最近查询 · 1`）。净增 1 条反向断言，未放松任何一条 |
| `清空最近查询？` / `只清这一台设备上的记录。` | `copy.ts:177-178` | §6 `:1467`、§3.3 `:629`「`清空` 走 `ConfirmSheet`」 | 文案与 `LookupScreen.tsx:345-346` 引的常量一字不差。红因：`ConfirmSheet` = Radix `Dialog`，`DialogContent` 走 portal 挂 `document.body`（`packages/ui/src/patterns/ConfirmSheet.tsx:106`），断言却打在 `container` 上；spec 自己的 `bodyText()`（`:175`）注释已写明该口径但未使用 ⇒ **断言侧错**。改为 `document.body` 作用域，并**新增**「确认前 kv 不许清空」（R-10④ 防误触） |
| `从单词本移除？` | `copy.ts:167-168` | §3.4.3 `:1465`、§6 `:1465` | 两处断言侧错：① portal 作用域同上一条；② 夹具 `{words:[{word:'happy'}]}` 不是 `GET /api/wordbook` 的合法形状——`data/queries/wordbook.ts:36-41` 先试 `WordbookGetResultSchema`（`packages/shared/src/contracts/wordbook.ts:76-78` = `{data:[…]}`）再试裸数组，`{words}` 两种都不过 ⇒ 列表读空 ⇒ `inWordbook=false` ⇒ 点星标走**新增**而非二次确认。现改 `{data:[…]}` 并**新增**：确认前 `aria-pressed=true`、点 `移除` 后 `aria-pressed=false` |
| `direction=zh2en` | — | §3.1.2 `:592` 行3 + `:617`「方向链 `aria-label` = 改用英译中查询／改用中译英查询 **动态**」；`ARIA.directionZh2En`（`copy.ts:733`） | **实现侧错**：`result-row.tsx:85-91 flippedDirection(applied,text)` 在 `applied='en2zh'` 且输入非中文时**返回 `en2zh`**，与 `:303` 自己给的 aria-label（此档写「改用中译英查询」）自相矛盾 ⇒ 查询键不变 ⇒ 不发请求，`last.url` 停在第一次的 `direction=en2zh`。该件是 Web `apps/web/src/lib/api/lookup-stream.ts:39-43` 的逐行复制，但 Web 的 `resolveDirection` 对纯英文留 `auto`，而 App 版（`result-row.tsx:68-71` 键对齐注释）**刻意钉为 `en2zh`** ⇒ 复制过来的 fallback 分支在 App 侧是死代码且有害。根因在共用件，本轮未改（见 §四①）；页内改为按 aria 承诺取 `applied` 反向，并**新增**「必须再发 1 次 `/api/lookup`」断言防"最后一呼是旧请求"蒙混 |

## 二、改动清单（本轮 diff）

1. `apps/app/src/screens/LookupScreen.tsx`
   - `switchDirection`（`:214-225`）：`flippedDirection(applied,text)` → `applied === 'zh2en' ? 'en2zh' : 'zh2en'`，注释写明与 `DirectionLink` aria-label 同档、以及为何绕开共用件。
   - 顶部 import 去掉已不用的 `flippedDirection`（其余 import 与文案引用未动）。
2. `apps/app/test/lookup-screen.spec.tsx`：4 条红的用例改写（见 §一 取证），另修 2 处词本夹具形状。
   **未删、未放松任何既有断言**；净增 4 条（无历史态标题缺席 / 确认前不清空 / 确认前不删 / 方向链确实再发一次请求）。
3. `apps/app/src/router.tsx` 路由挂载 diff（仅 2 行，其余 11 条一字未动）：

```diff
-  { path: '/', kind: 'tab', load: SCREEN_PLACEHOLDER }, /* T-17 → screens/LookupScreen.js */
-  { path: '/word/:word', kind: 'secondary', load: SCREEN_PLACEHOLDER }, /* T-17 → screens/WordDetailScreen.js */
+  { path: '/', kind: 'tab', load: () => import('./screens/LookupScreen.js') }, /* T-17 → screens/LookupScreen.js */
+  { path: '/word/:word', kind: 'secondary', load: () => import('./screens/WordDetailScreen.js') }, /* T-17 → screens/WordDetailScreen.js */
```

## 三、自检与冒烟（原始输出：`%TEMP%/t17r3a/exit.md`）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @tm/app test -- lookup` | `test/lookup-screen.spec.tsx (19 tests) ✓` **19/19 全绿**；全套 `Tests 4 failed \| 103 passed (107)`（exit 1）。剩余 4 条：`detail-screen.spec.tsx` 2 条 = 并行 r3b 名下；`router.spec.tsx` 2 条 = 本轮挂载的真副作用（见 §四②） |
| `pnpm --filter @tm/app typecheck` | **exit 0，0 错** |
| `pnpm --filter @tm/app build:only` | **exit 0**；`dist/assets/LookupScreen-DGOALqWg.js 10.69 kB`、`dist/assets/WordDetailScreen-DUAaDmc0.js 6.19 kB`、`ScreenFallback 0.46 kB` ⇒ R-17⑥ 按路由分包**因挂载而首次成立**；`tm-app:dist-guard` 判据①②通过（7 个产物，无绝对路径、无 Chrome84 之后 API） |
| `node tools/boundaries.mjs --check-ownership --task T-17 --diff-file %TEMP%/t17r3a/t17r3a-scoped.patch` | **exit 1，1 处 RED**：`apps/app/src/router.tsx：§10.4 明示 T-17 对该文件零 diff，实际 4 行`。patch 构造：`router.tsx` 用合成 2 行 hunk（未跟踪文件无 HEAD 基线，不收 HEAD diff），另两份新文件走 `git diff --no-index -- /dev/null`。此 RED 是**授权口径冲突**而非越界改动，见 §五① |

> 注：`-- lookup` 位置参数不过滤（跑的是整个 `@tm/app` project），与 `project-test-invocation-quirks` 记录一致；`localStorage is not defined` 类满屏假红未出现（本轮全程走 `pnpm --filter @tm/app test`）。

## 四、越界申请

**① `apps/app/src/components/result-row.tsx:85-91`（`flippedDirection`）—— 红 4 的真实根因，r3a 名下未改**
建议改法（与 `:303` 的 aria 档位一一对齐，App 侧永不再出现"点了没反应"）：

```ts
export function flippedDirection(applied: LookupDirectionValue): LookupDirectionValue {
  return applied === 'zh2en' ? 'en2zh' : 'zh2en';
}
```
或保留 `query` 形参但只在 `applied === 'auto'`（中英混输）时用 `detectLanguage` 兜底。改后 `LookupScreen.switchDirection` 应回接该件（我这边一行即可切回），避免页内长期挂着一份反向表。`apps/web/src/lib/api/lookup-stream.ts:39` 是否同步由 Web 侧任务定，本轮不判断。

**② `apps/app/test/router.spec.tsx`（owner = T-14，`tools/ownership.json:474-480`）—— 挂载路由的必然副作用，r3a 无权改**
两条红（`判据③-3` 的两条用例）症状：`Error: No QueryClient set` @ `LookupScreen.tsx:112`。
原因：`main.tsx:67` 的生产装配是 `QueryClientProvider` + `UiHostProvider` 包 `TabBarShell/AppRoutes`，而该 spec `:142-149` 只渲染 `TabBarShell > AppRoutes`。路由全为占位时看不出来，`/` 一旦挂真页面就炸。
需 T-14（或 TPM 指定的收口轮）做两处：
1. `:143-147` 补上 `main.tsx` 同款两个 Provider（含 `UiHost` 夹具）；
2. `:169`/`:182` 的 `expect(…[data-testid="screen-fallback"]…).not.toBeNull()` 目前对**全部** 12 条路由成立，挂载语义落地后只对 T-18/T-19 未接线的 9 条成立 ⇒ 该断言须按"仍在占位的路由"取集合。**这不是放松**：判据③-3 要证的是"5 tab 可达"，被可达性证明引用的应是各自路由的真实页/占位页任一。

## 五、待 TPM 拍板

1. **`router.tsx` 的挂载授权与 ownership 表冲突**：`02-tech-design.md:976`（§10.4 第 5 行）同一行前半句写"批次4 T-17/18/19 **只新增 screens/\*，把懒加载指向真组件**"、后半句写"对 `router.tsx` **零 diff**"；`A-13`（`04-adjudications.md:144`）与 `A-38 §44`（`:461`）均明确 r3a 交回"两行挂载"。`tools/ownership.json:392-401` 现取严格口径 `zeroDiffFor:[T-17,T-18,T-19]` ⇒ `--check-ownership` 必 RED。请给该条目补动作通道（形如 `bounded-edit:A-13` 或新增 `loader-mount`，允许每路由 1 行、禁改 path/kind/查询键），否则 T-18/T-19 接线会各撞一次同一 RED。
2. **最近查询 kv 键名**：UI §3.3 `:621` 写 key `tm:recent:v1`，既实现（`packages/ui/src/hooks/use-recent-searches.ts:13` = `tm:recent-searches`）与两端共用件、本轮 spec 均按现名。属组件面（T-05）历史偏差，不在 r3a 范围内，登记不擅改（改键 = 存量本机记录蒸发，须先定迁移口径）。

## 六、契约偏差

无。请求/响应形状一律走 `@tm/shared` 契约与 `data/**`（本轮未改数据层）；`GET /api/wordbook` 的 `{data:[…]}` 用法是**修正测试夹具**去贴契约，不是改契约。

## 七、已知限制与 TODO（诚实列出）

- 页内方向反向表是 §四① 的临时替身，共用件修好后应回接 `flippedDirection`。
- `判据③-3` 两条 router 红由挂载引入，r3a 未修（无权）；T-14 接手前，`@tm/app` 全套测试无法整体变绿。
- 未跑真机/`file://` 冒烟（无 Android 现场），未跑 Playwright e2e；本轮证据面 = 19 条 lookup 单测 + typecheck + build + dist-guard。
- `r3b` 并行改 `WordDetailScreen.tsx`/`detail-screen.spec.tsx`，同工作树内我看到的 2 条 detail 红不代表其终态。

## 八、给测试的提示

1. 重点：`/` 与 `/word/:word` 挂真组件后**首屏**行为（占位骨架屏 `ScreenFallback` 不再常驻，T-18/T-19 未接线的 9 条仍占位）。
2. 方向链请补一条中英混输（`applied='auto'`）用例：那是 §四① 修共用件时唯一还需要 `detectLanguage` 分支的落点，我这条只覆盖纯英文。
3. 我没测到：`ConfirmSheet` 打开时面板因焦点转移而自动收起（180ms 宽限），若产品期望"确认框背后面板仍在"需走查判定；以及 kv 读取异常那一行（`LOOKUP_COPY.readFail`）只在列表为空时出现，属组件面已知缺陷（第 2 轮已登记给 T-05）。
