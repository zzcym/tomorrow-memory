# T-05 开发报告 —— `@tm/ui` patterns · **修复轮 2（三件小事）**

- 任务：**T-05 修复轮 2**，依据 `.delivery/04-adjudications.md` **A-23 表第 3 行 / 第 7 行** + 交接 **H-1**（`04-dev-report-T-03-fix2.md:177`）
- 角色：前端开发（角色卡 `roles/dev.md`）
- 日期：2026-09-19
- 本轮范围：**只做派下来的三件事，零重构**。组件源码改动合计 4 行（`Flashcard.tsx`）+ 2 行注释（`EmptyState.tsx`）；无 props 签名变更。

---

## 0. 结论一句话（不美化）

| 判据 | 要求 | 实测 | 结论 |
|---|---|---|---|
| `node tools/boundaries.mjs --copy` | 全库 0 命中 | **0 命中 / 1/1 全绿** | ✅ 达成（A-23-7 的"当前唯一红"已清零） |
| `node tools/boundaries.mjs --tokens` | 绿 | **2/2 全绿** | ✅ 达成 |
| `pnpm --filter @tm/ui typecheck` | 绿 | **exit=0，0 error** | ✅ 达成 |
| H-1 引用换成 `FLASHCARD_SWIPE_THRESHOLD_PX` | 组件与 patterns 不留 60/64 本地字面量 | **`Flashcard.tsx` 0 处 60/64 字面量；旧常量在 `src/**` 消费方归零** | ✅ 达成（`WordbookList` 的 64 另属语义，见 §4-①） |
| `pnpm --filter @tm/ui test` | 绿 | **143 passed / 1 failed** —— 红的是 `test/ui.spec.tsx`（T-04 owner 面）对 `src/auth/index.ts` 的**占位期**断言，被并行的 T-13 填口然作废；**我这一面 `patterns.spec.tsx` 51/51 绿** | ⚠️ **未达成，且不属我可写面**（越界申请 X-1） |
| `pnpm lint` | 0 error 0 warning | **4 error / 4 warning，全部在我可写面之外**；派单点名的 `RatingValue` 未用警告**盘上已不存在** | ❌ **未达成**（越界申请 X-2，逐条列 owner） |
| `pnpm depcruise` | 绿 | **no violations（309 modules / 736 deps）** | ✅ 达成 |

**我没有为了让 test/lint 变绿去碰任何他人边界内的文件，也没有放宽任何规则。** 两条未达成项是并行 agent 在途改动造成的真实盘态，如实上交。

---

## 1. 完成清单

| 项 | 依据 | 状态 | 落点 | 备注 |
|---|---|---|---|---|
| 1 | A-23-3 / 交接 H-1 | done | `packages/ui/src/patterns/Flashcard.tsx`（9 / 17 / 124 / 125 行）+ `packages/ui/src/patterns/README.md:214`（1 个词，见 §5）+ 新增守卫用例 `test/patterns.spec.tsx` | 阈值 60 → 64 生效；`src/**` 内 `CARD_SWIPE_SUBMIT_PX` 消费方清零 |
| 2 | A-23-7 | done | `packages/ui/src/patterns/EmptyState.tsx`（6–7 行，**纯注释**） | `--copy` 从 1 红 → **0 命中**；未加例外、未改词表、代码一行未动 |
| 3 | 派单第 3 件 | **前提已失效 / 无需改** | — | 盘上 patterns 面**不存在** `RatingValue` 未用告警；`--fix` 未跑（见 §3 取证） |

---

## 2. 三件事逐条怎么改的

### 2-1（H-1）闪卡横滑阈值收口到 `@tm/shared`

先按要求 grep 找齐引用点（`CARD_SWIPE_SUBMIT_PX` / `\b6[04]\b` / `swipe`），命中面只有 `Flashcard.tsx` 一处。四处最小编辑，**不改任何 props**：

```
9:   * - 横滑提交：`touch-action: pan-y`，≥24px 出胶囊、≥`FLASHCARD_SWIPE_THRESHOLD_PX` 松手提交、   ← 原 `CARD_SWIPE_SUBMIT_PX`
17:    FLASHCARD_SWIPE_THRESHOLD_PX,                                                                ← import 名单换名（原位字母序仍成立）
124:     if (travel <= -FLASHCARD_SWIPE_THRESHOLD_PX && forget !== undefined) onSwipeRating(forget);
125:     else if (travel >= FLASHCARD_SWIPE_THRESHOLD_PX && easy !== undefined) onSwipeRating(easy);
```

注释里**没有补写 "64px"**（值只在 `@tm/shared` 一处），避免把数值抄成第二份真相。`PILL_PX = 24` / `VERTICAL_ABORT_PX = 12` 保留 —— `limits.ts:110-111` 明示"那两个阈值属组件几何"，不是本交接项。

守卫用例（防回归，写在**我可写面** `packages/ui/test/patterns.spec.tsx`，判据①块内）：

```ts
it('H-1（A-23-3）：闪卡横滑阈值只来自 @tm/shared，组件内不写 60/64 字面量', () => {
  const src = sourceOf('Flashcard');
  expect(src).toContain('FLASHCARD_SWIPE_THRESHOLD_PX');
  expect(src).not.toMatch(/CARD_SWIPE_SUBMIT_PX/);
  expect(stripComments(src)).not.toMatch(/\b6[04]\b/);
});
```

修复后扫描（真实输出）：

```
$ grep -rn "\b6[04]\b" packages/ui/src/patterns/*.tsx
ConfirmSheet.tsx:159:  'disabled:pointer-events-none disabled:opacity-60'   ← Tailwind 透明度类，非阈值
RatingBar.tsx:145:     isPending && 'opacity-60',                            ← 同上
StatCard.tsx:97:       'hover:bg-brand-soft/60 active:scale-[.99]'           ← 同上
WordbookList.tsx:21:   const SWIPE_COMMIT_PX = 64;                           ← 见 §4-①，不属 H-1 语义

$ grep -rn "CARD_SWIPE_SUBMIT_PX" packages/*/src apps/*/src
packages/shared/src/constants/limits.ts:108:export const CARD_SWIPE_SUBMIT_PX = 60;   ← 只剩定义，零消费方
```

**可回签 TPM**：`@tm/shared` 侧 `CARD_SWIPE_SUBMIT_PX`（`limits.ts:108`）现已**无任何 src 消费方**，H-1 关闭；撤除该既有导出需授权，按 A-23-3 保留一个发布周期由 **T-18** 执行。

### 2-2 `--copy` 唯一红：`EmptyState.tsx:6`

命中词是 **`暂无数据`**（`tools/boundaries.mjs` 的 `BANNED_TERMS` 兜底项），出现在注释"这里不是"暂无数据 + 灰大卡""里 —— 禁令的**引文本身**被门禁咬了。按裁决"改写注释"处理：

```diff
- * 三件套禁令：这里不是"暂无数据 + 灰大卡"。图标 64px 线性（`--ink-muted`、`aria-hidden`）、
+ * 三件套禁令：这里不是一块灰底配一句敷衍话。图标线性、`aria-hidden`、尺寸随 `size` 档走，
```

- **只动注释**：`EmptyState.tsx` 的代码（含 `tone === 'success' ? 'text-success' : 'text-ink-muted'`、`ICON_SIZE` 三档映射）**一行未改**。
- 顺带去掉注释里的 `64px` 与 `--ink-muted` 字面抄写：图标尺寸真源是同文件 `ICON_SIZE`（`sm=h-10 / md=h-14 / lg=h-16`），注释改指 `size` 档，不再抄第二份数值。
- **未加例外、未改 `tools/**` 词表**（新文案亦不含 `REVIEW_TERMS` 的"本地/已发送/FSRS/stability"）。

### 2-3 lint 的 `RatingValue` 未用告警 —— **盘上已不存在，本轮无动作**

派单口径来自**上一轮**报告的起点表（`04-dev-report-T-05.md` §1："`RatingValue`（测试）未用、`INDEX_OF` 死码、`native` 死码"），那 3 条在收口轮已随死码删除/用例补写消掉了。本轮实测（真实输出）：

```
$ npx eslint packages/ui/src/patterns packages/ui/test/patterns.spec.tsx; echo $?
ESLINT_PATTERNS_EXIT=0        ← 我这整面 0 error 0 warning

$ grep -rn "RatingValue" packages/ui/src/patterns/*.tsx packages/ui/test/patterns.spec.tsx
patterns/Flashcard.tsx:24:  type RatingValue,       → :66  onSwipeRating?: (rating: RatingValue) => void;   ← 在用
patterns/RatingBar.tsx:21:  type RatingValue,       → :34 :35 :39 :49 四处                                   ← 在用
test/patterns.spec.tsx:31:  type RatingValue,       → :873 vi.fn<(rating: RatingValue) => void>()            ← 在用
```

即：**既有的 `RatingValue` import 全部有真实消费点，无需删也无需用力"用掉"**。我没有为了交差去动它，也没有跑 `--fix`（`--fix` 会改到他人文件）。第 3 件的**实际缺口**是 §4-② 那 8 条，全部越界。

---

## 3. 自检与冒烟（2026-09-19 18:47 真实执行，未编造）

```
### A: pnpm --filter @tm/ui test
 FAIL   @tm/ui  test/ui.spec.tsx > 判据③ components/ui/* 与 theme-provider 已删，primitives 可渲染 > 根出口无人抢改；patterns 出口已由 T-05 填满 14 件，auth 出口仍是空占位
 AssertionError: expected 'export*from\'./NoticeBar.js\';export*…' to be 'export{};' // Object.is equality
  Test Files  1 failed | 2 passed (3)
       Tests  1 failed | 143 passed (144)

### A2: patterns.spec only（我这一面）
 ✓  @tm/ui  test/patterns.spec.tsx (51 tests) 554ms
  Test Files  1 passed (1)
       Tests  51 passed (51)

### B: pnpm --filter @tm/ui typecheck
$ tsc -p tsconfig.json --noEmit
exit=0

### C: node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src,
     packages/server/src, packages/agent/src, mobile-memory；例外豁免 67 处）；需人工复核词命中 108 处
     （不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿

### D: node tools/boundaries.mjs --tokens
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
2/2 条通过，全绿

### E: pnpm depcruise
✔ no dependency violations found (309 modules, 736 dependencies cruised)

### F: pnpm lint
✖ 8 problems (4 errors, 4 warnings)
  2 errors and 0 warnings potentially fixable with the `--fix` option.
[ELIFECYCLE] Command failed with exit code 1.
```

`pnpm lint` 全量明细（**逐条归属，一条都不在我可写面内**）：

```
apps/app/src/main.tsx                                25:16  warning  'subscribeRoute' is defined but never used      @typescript-eslint/no-unused-vars
apps/app/test/offline-queue.spec.ts                 189:40  warning  'batch' is defined but never used               @typescript-eslint/no-unused-vars
apps/app/test/rest-fetcher.spec.ts                   12:1   error    Imports "ApiError" are only used as type        @typescript-eslint/consistent-type-imports
apps/app/test/router.spec.tsx                        42:10  warning  'TabBar' is defined but never used              @typescript-eslint/no-unused-vars
packages/server/src/trpc/routers/assessment-parts.ts  8:1   error    Imports "generateQuestion" are only used as type @typescript-eslint/consistent-type-imports
packages/ui/src/auth/ChangePasswordForm.tsx         121:5   error    Definition for rule 'react-hooks/exhaustive-deps' was not found
packages/ui/test/auth.spec.tsx                       95:7   warning  'SHORT_PASSWORD' is assigned a value but never used
packages/ui/test/auth.spec.tsx                      656:37  error    Unnecessary escape character: \.                 no-useless-escape
```

**基线对照（证明非本轮引入）**：本轮开工前（18:44，任何编辑之前）跑过同一条 `pnpm lint`，输出与上表**逐字相同**（4 error / 4 warning）；`pnpm --filter @tm/ui test` 开工前也是同一条 `ui.spec.tsx` 红（142 passed / 1 failed）。我这 3 件事**净新增 0 个问题、净修 1 条门禁红（`--copy`）**。

---

## 4. 越界申请（请主会话裁决，我一行都没自己动）

**① `packages/ui/src/patterns/WordbookList.tsx:20-21`** —— `SWIPE_REVEAL_PX = 24` / `SWIPE_COMMIT_PX = 64` / `DELETE_BLOCK_PX = 76` 是 patterns 里剩下的一组本地字面量。
**本轮我故意没动**，三条理由：(a) 它不是闪卡横滑，A-23-3 第 3 行只裁了闪卡阈值；(b) `FLASHCARD_SWIPE_THRESHOLD_PX` 的 doc 注释钉死了"闪卡横滑"语义，拿它去当词本删除提交阈值 = 造一个假的单一真相，两个值一旦有一处要调就同时坏；(c) T-03-fix2 §43 已给出口径"收口应是新增 `WORDBOOK_SWIPE_*` 一组常量，由 TPM 先定口径"，而 `packages/shared/**` 本轮对我是禁写面。**申请**：由 TPM 派 T-03 新增 `WORDBOOK_SWIPE_REVEAL_PX/COMMIT_PX/DELETE_BLOCK_PX`，再回派我把这三行换掉。

**② 派单判据"`pnpm lint` 0 error 0 warning" 与"不得触碰 `apps/**`" 两条互斥。** 剩 8 条全在他人面，按域归属：`apps/app/**` 4 条 → **T-14**；`packages/server/src/trpc/routers/assessment-parts.ts` 1 条 → **T-08**；`packages/ui/src/auth/**` + `packages/ui/test/auth.spec.tsx` 3 条 → **T-13**（`ui.spec.tsx` 归 T-04）。这 8 条里 7 条是 `--fix` 一次可清或删个 import 的事，但**都不是我能写的文件**。**申请**：转派各 owner；我不代跑 `eslint --fix .`（会顺带改到 `apps/**`、`packages/server/**`）。

**③ `packages/ui/test/ui.spec.tsx:504-505`（T-04 owner 面）** —— 断言 `src/auth/index.ts` 必须是 `export {};`、`auth/` 目录除 `index.ts` 外必须空。T-13 已按判据把 7 个 auth 组件填进这个出口，断言必然红。这**不是** T-05 的东西：我没写 auth 一行，也不改 `ui.spec.tsx`（A-23-1 只追认了上一轮那一次）。**申请**：转 **T-13**（或 T-04）把该占位期断言更新为"auth 出口已填满"口径 —— 同 A-23-1 对 patterns 出口做过的那次处理。

**④ 回签事项（无需授权即可结案，仅登记）**：`packages/shared/src/constants/limits.ts:108` `CARD_SWIPE_SUBMIT_PX = 60` 已零消费方，等 T-18 撤除。撤除前请勿再有任何 agent 把它 import 回去。

---

## 5. 契约偏差 / 需你复核的一处判断

`packages/ui/src/patterns/README.md:214`（`swipeSubmit` 行说明列）原文含 `≥CARD_SWIPE_SUBMIT_PX`，是 **patterns 内最后一个旧常量引用点**。派单要求"grep 找齐 patterns 内任何其它引用点"，故我把它换成 `FLASHCARD_SWIPE_THRESHOLD_PX`。

- **改动面**：只有那个常量名。该行前三列 `| \`swipeSubmit\` | \`boolean\` | \`false\` |`（props 名 / 类型 / 默认值）**逐字未动**，全 README 无其它阈值提及（已 grep `横滑|滑动|SWIPE|swipe`）。
- **为什么不算动签名**：A-23 冻结的是对外 props 契约；组件真实类型 `swipeSubmit?: boolean` 也没变。留旧名 = README 指向一个 T-18 就要删的导出，比换新名风险更大。
- **不认账的代价极低**：单行单词回滚即可，`git checkout` 都不用（我无任何 git 写操作）。要撤你说一声。
- 判据①的 README 契约用例（`patterns.spec.tsx:200-207` 断言分节数 = 14、每组件名在盘）**改后仍绿**。

其余：**零新增依赖、零 API 面变更、零 `tools/**` 变更、零 `packages/shared/**` 变更（只 import）、零 git 写操作**。

---

## 6. 已知限制与 TODO（诚实列出）

1. `pnpm --filter @tm/ui test` 与 `pnpm lint` 两条判据**未达绿**，全部缺口为他人面，见 §4-②③。本轮交付的三件事本身可独立验证（`patterns.spec.tsx` 51/51、`--copy` 0 命中、`--tokens` 全绿）。
2. H-1 生效**只能从行为侧证**：阈值 60→64 会让"横滑 60–63px 松手"这条路径从"提交"变成"回弹"。`patterns.spec.tsx` 现有手势用例的位移是 ±80px，**跨越不了这个边界**，所以旧用例改前改后都绿 —— 这是测试面的真实盲区，不是我测过了。已用源码扫描用例锁住"引用点 + 无字面量"（防的是回归，不是行为）。
3. 真机手势（触摸板惯性、`pointercancel` 在 iOS Safari 的触发时机、`touch-pan-y` 与浏览器下拉刷新的竞争）**未在真机验证**，同上一轮判据⑥ Playwright 半边的口径（A-17），仍待 T-22。
4. `--copy` 另有 108 处 `REVIEW_TERMS`（本地/已发送/FSRS/stability）人工复核命中，门禁按 §8.2-9 设计**不判红**，不属本轮动作，留给走查。

## 7. 给测试的提示

- **重点测**：闪卡横滑在 **60 / 62 / 63 / 64px** 四个位移上的边界（期望：63px 松手**不**提交并回弹，64px 提交 `RATING_VALUES[0]` / 末位）。这是 A-23-3 唯一的行为变更点，现有单测覆盖不到（见 §6-2）。
- 别只测 shared：`@tm/shared` 侧只有常量定义，正确性只能从 `Flashcard` 手势反推（T-03-fix2 §198 同口径）。
- `grep -n FLASHCARD_SWIPE_THRESHOLD_PX packages/ui/src/patterns/Flashcard.tsx` 应命中 4 行（9/17/124/125）；`grep -rn "CARD_SWIPE_SUBMIT_PX" packages/*/src apps/*/src` 应只剩 `limits.ts:108` 的定义行。
- `EmptyState` 只需回归"文案全由 props 给"（`title`/`hint`/`primary`/`secondary`/`link`），本轮只动了注释、渲染逻辑一字未改。
