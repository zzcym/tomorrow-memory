# 开发报告（T-02 · fix5 轮 · `tools/ownership.json` ↔ §10.2 逐条对账）

> 角色：开发工程师（门禁脚本 owner）。任务来源：主会话（TPM）在 A-25 里挂的账 —— "批次3 开工前由我把 §10.2/§10.3 对齐后再开，不许由开发 agent 自行扩写归属表"。
> **本轮性质：纯对账，不是裁决。** 不一致处一律列在 §6 交给 TPM，本轮一条都没有自行选边。
> 真相源：`.delivery/02-tech-design.md` §10.2（L833-876 共 24 行）/ §10.3（L882-901）/ §10.4（L911-917）+ `.delivery/04-adjudications.md` A-4 / A-13 / A-24-2 / A-25（并引用了 A-14/A-16/A-18/A-19/A-21/A-22/A-23 的已裁结论）。
> 禁读：`01-prd.md`、`03-ui-spec.md` 未通读（本轮用不到）。

---

## 1. 完成清单

| 项 | 状态 | 实现文件 | 备注 |
|---|---|---|---|
| 从 §10.2 全部 24 行提取"允许新建/修改（精确）"+"不得触碰"两列 | done | 逐行摘录（行号见 §3 各表），未整篇通读文档 | Grep 定位表格行后按 L827-876 区间读 |
| 双向差集（登记表 vs 排班表） | done | 报告 §3 | 对账用的临时脚本已删除，不留在仓库里 |
| 无争议部分写入 `tools/ownership.json` | done | `tools/ownership.json` | **新增 43 条条目 + 9 个 `per_file` 精确键 + 2 条 `reason` 补注**；未删任何既有条目、未动 cursor 语义、未动 `handoff`/`predecessorAllowedDiff`/`zeroDiffFor`/`maxDiffLinesFor` 结构 |
| 复跑批次3 六个任务的 `--check-ownership` | done | 报告 §5 | 六个任务用**自己那行的可写清单**跑 → 全部 `无越界` 且 **0 条 no-entry** |
| 有争议处 | **未写** | 报告 §6 | 10 条 owner 差集 + 6 组结构性缺口，全部交 TPM |

---

## 2. 门禁输入口径：那"30 条红"到底是什么（实测，未编造）

我没能用 `TM_TASK=T-10 node tools/boundaries.mjs --check-ownership` 复现"恰好 30 红"，因为该模式**不给 `--files`/`--diff-file` 时不产生任何判定**：

```
$ TM_TASK=T-10 node tools/boundaries.mjs --check-ownership
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定
--check-ownership task=T-10 触碰 0 个文件 → 无越界
```

用两种可复现的输入逼近那个数：

| 输入口径 | 文件数 | T-10 结果 |
|---|---|---|
| **§10.2 L854 T-10 行自己声明的可写清单**（对账前） | 10 | **0 红 + 2 条 no-entry**（`test/integration/review-parity.spec.ts`、`test/review-no-llm.spec.ts`） |
| `git diff --name-only HEAD`（**整个工作区未提交改动** = 86 件，含其他 agent 的 `packages/**`/`apps/**`） | 86 | 对账前 **26 红** → 对账后 **33 红** |
| 上一条再加 `git ls-files --others`（未跟踪 328 件） | 414 | 266 红 |

**结论（这条与 A-25 的假设不同，交给 TPM 记账）：**
1. 红数不是"批次3 任务按 §10.2 开工就会被咬"。用任务**自己那行**清单跑，批次3 六个任务对账前就已经是 **0 红**。
2. 那 26/33/266 条红来自**把全工作区 diff 当 `--files`**：里面绝大多数文件（`package.json`、`tsconfig.base.json`、`db/**`、`apps/web/**`、`mobile-memory/**`…）本来就不在 T-10 的面上，红是**正确判定**，不是误报。
3. 真正的缺陷是那 **89 个 `no-entry` 路径 = 静默无主**：`no-entry` 只是 NOTE 不阻断，所以任何任务碰批次4 的 `apps/web/**`、任何人的 `packages/*/test/**` 都不会被咬 —— 这才是"并行时互相踩文件"的根因，也正是 §3.1 补掉的。
4. **副作用要预警**：补细登记表后，"全工作区 diff"口径的红数从 26 **升到** 33（新登记的 `apps/web/components/header.tsx`、`wordbook-sidebar.tsx`、`flashcard.tsx`、`(user)/chat|assess/page.tsx` 现在有主了）。这是期望行为，但意味着**门禁输入必须是"该任务自己的可写清单"或"该任务的 patch"**，不能拿脏工作区当输入。批次3 简报里建议把这句写进开工前置。

---

## 3. 双向差集

### 3.1 排班表有 / 登记表没有（= `no-entry` 根因）：**89 条 → 0 条**

以下全部是 §10.2 该行**原文明写**的路径，此前 `tools/ownership.json` 无条目，本轮已登记（登记动作 = 把"静默无主"变成"有主可咬"，见 §4 逐条出处）：

| 归属任务 | §10.2 行 | 此前无条目的路径（数量） |
|---|---|---|
| T-03 | L835 | `packages/shared/test/contracts.spec.ts`（1） |
| T-04 | L836 | `packages/ui/test/ui.spec.tsx`、`apps/web/tailwind.config.ts`、`apps/web/next.config.ts`、`apps/web/src/lib/host.tsx`、`packages/ui/src/primitives/{13 件}`、`packages/ui/src/host.tsx`、`packages/ui/src/hooks/{3 件}`（19） |
| T-06 | L837 | `packages/server/test/db/migrations.spec.ts`（1） |
| T-05 | L843 | `packages/ui/test/patterns.spec.tsx`（1） |
| T-08 | L844 | `packages/server/test/trpc-shape.spec.ts`（1） |
| T-13 | L845 | `packages/ui/test/auth.spec.tsx`（1） |
| T-07 | L852 | `packages/server/src/trpc/init.ts`（只被 `packages/server/src/**` 粗兜底覆盖）、`test/integration/{auth-register,auth-hardening}.spec.ts`、`test/contract/legacy-apk.spec.ts`（4） |
| T-09 | L853 | `services/wordbook-merge.ts`（粗 glob）、`test/integration/wordbook-concurrency.spec.ts`、`test/unit/wordbook-merge.spec.ts`（3） |
| T-10 | L854 | `services/{queue-service,checkin-service,fsrs}.ts`（粗 glob）、`test/integration/review-parity.spec.ts`、`test/review-no-llm.spec.ts`（5） |
| T-11 | L855 | `services/{avatar-service,lookup.ts,tutor.ts}`（粗 glob）、`test/integration/{chat-isolation,profile-dto}.spec.ts`（5） |
| T-12 | L856 | `components/home/{4 件}`、`components/{mobile-nav,header,word-lookup}.tsx`、`lib/{nav.ts,hooks/use-lookup.ts,api/lookup-stream.ts}`、`e2e/home.spec.ts`（11） |
| T-15 | L863 | `(user)/wordbook/page.tsx`、`(user)/profile/security/page.tsx`、`components/study/{3 件}`、`components/profile/{5 件}`、`components/{wordbook-sidebar,favorite-button,flashcard}.tsx`、`lib/api/{review,wordbook,profile}.ts`、`e2e/{study,wordbook,profile}.spec.ts`（19） |
| T-16 | L864 | `lib/{use-auth,auth,trpc}.ts`、`components/{providers,login-dialog}.tsx`、`components/{auth-gate,upgrade-gate,login-wall}.tsx`、`app/upgrade-password/page.tsx`、`app/(user)/about/page.tsx`、`lib/api/auth.ts`、`e2e/{auth-wall,upgrade}.spec.ts`（12） |
| T-17 | L865 | `apps/app/src/components/{result-row,ai-mnemonic-bar}.tsx`、`apps/app/test/{lookup-screen,detail-screen}.spec.tsx`（4） |
| T-18 | L866 | `apps/app/src/components/{goal-ask-sheet,due-badge-data}.tsx`（2）—— ⚠️ 该行**没列任何 test 文件**，我没有替它补（见 §6-D） |
| T-19 | L867 | `screens/SecurityScreen.tsx`（per_file 缺这一件）、`apps/app/src/lib/{auth-store,token-bridge}.ts`、`apps/app/test/account.spec.tsx`（4） |
| T-21 | L868 | `packages/server/test/release/backup.spec.ts`、`backups/manifest.json`（+.gitkeep）、`scripts/release/README.md`（2，README 原已被 `scripts/release/**` 覆盖，登记为精确条目） |
| T-22 | L874 | `.github/actions/*`、`web-static/`（2） |
| T-23 | L875 | 仓库根 `e2e/**`：`e2e/web/{7 件}`、`e2e/app-cdp/{5 件}`、`e2e/README.md`、`e2e/grep-copy.spec.mjs`（15） |
| T-24 | L876 | `.delivery/release-report-<date>.md`（1） |
| 出处非 §10.2 而是 §10.3 | L895 | `packages/server/test/{wordbook,review,profile}-standalone.spec.ts`（3）—— §10.3 第 15 行明示的并行自测机制，逐文件登记 |

**没有替任何任务扩写文件面**：上表每一件都能在 §10.2 对应行的"允许新建/修改"列里逐字找到（或出自 §10.3 明示），未加"看起来它可能需要"的文件。

### 3.2 两边都有但 owner 不同：**10 条，本轮一条未改**

| # | 路径 | 登记表 owner（行号） | 排班表 owner（行号） | 说明 |
|---|---|---|---|---|
| 1 | `packages/ui/package.json` | T-04（ownership L245，依据 A-4 第 3 行） | **T-01 建**（§10.2 L833 🆕） | A-4 只写"T-04 建基线"，与 §10.2 L833 的 🆕 冲突。Apps/app 那两条有 `predecessorOwner: "T-01"` 通道，本条**没有** → 实测 T-01 碰它会红（§5.3） |
| 2 | `packages/ui/tsconfig.json` | T-04（L258，§10.3 L884 例外登记"T-01 建、归属改 T-04"） | T-01（§10.2 L833 🆕） | 同上，且本条无 `predecessorOwner` |
| 3 | `apps/app/package.json` | T-14 + `predecessorOwner: T-01`（L314） | T-01 建（L833）→ T-14 独占（A-4 第 2 行） | 这条**有** predecessor 通道，实测 T-01 绿 |
| 4 | `apps/app/tsconfig.json` | T-14 + `predecessorOwner: T-01`（L323） | 同上 | 同上，实测 T-01 绿 |
| 5 | `packages/server/src/trpc/routers/wordbook.ts` | T-09（per_file，L197 条目） | **T-08 建**（§10.2 L844 🆕 十件）；§10.3 L894 判给 T-09 | "建"与"拥有"差集未闭合；A-20 只追认了 `routers/auth.ts` + `index.ts` 那一行改引 |
| 6 | `…/routers/review.ts` | T-10（L197） | T-08 建（L844）/ §10.3 L894 = T-10 | 同上 |
| 7 | `…/routers/checkin.ts` | T-10（L197） | 同上 | 同上 |
| 8 | `…/routers/dictionary.ts` | T-11（L197） | 同上 | 同上 |
| 9 | `…/routers/profile.ts` | T-11（L197） | 同上 | 同上 |
| 10 | `…/routers/chat.ts` | T-11（L197） | T-08 建（L844）/ §10.3 L894 = T-11 | 同上；另外 §10.2 L855（T-11 行）的可写清单里**没有** `trpc/routers/chat.ts`（只有 `routes/chat.ts`），T-11 的唯一出处是 §10.3 |

这 10 条在 `--check-ownership` 上的表现 = 用 T-08/T-01 的 §10.2 原文清单跑会红（历史动作，批次2 已合）。要闭合需要 TPM 二选一：给这些条目补 `predecessorOwner`，或把 §10.2 L844 的 🆕 改成"由 T-08 提交、归属即时转交"。我不动。

### 3.3 登记表有 / 排班表没有（逐条标出处）

**A. 合法补充（出自 A-4/A-16/A-18/A-22/A-23/A-24-2/A-19②/§10.3，本轮保留不动）**

| 条目（行号） | owner | 出处 |
|---|---|---|
| `tools/fixtures/depcruise/**`（L99） | T-02 | A-19②（`--self-test` 三条新用例的 fixture）；§10.2 L834 只列 tools/ 三件 |
| `tools/**`（L106，覆盖 `tools/exceptions.json`） | T-02 | §2 目录树；A-10/A-12 把例外结构落地给 T-02。**⚠️ 与 A-25 第 1 条相撞，见 §6-B（最关键）** |
| `apps/web/package.json`（L301） | T-04 + readers T-12/15/16 | A-4 第 1 行（§10.2 L836 未列此文件） |
| `packages/ui/src/patterns/format.ts`（L280） | T-05 | A-23#4 + A-24-2（§10.2 L843 未列） |
| `apps/app/src/shell/**`（L341）内的 `ScreenFallback.tsx` | T-14 | A-22(a)（§10.2 L846 只列 shell 三件；盘上实存 4 件） |
| `apps/app/test/{startup,router}.spec.{ts,tsx}`（L413） | T-14 | A-22 收口轮 + T-14 报告；**§10.2 L846 未回写 → 建议 TPM 在排班表补这两个文件名（文档侧，我无权改）** |
| `packages/agent/src/**` owner 串含 T-08（L570） | T-08,T-11 | 出处是 §2 目录树（graph/agent=T-08），不在 §10.2/§10.3 任一行 |
| `packages/server/src/**` 兜底（L563）owner T-06..T-11 | — | T-02 自加的"包内文件必须有主"兜底，无 §10.2 出处；副作用见 §6-C |
| `apps/app/src/screens/**` owner 串含 T-14（L365） | T-14,T-17,T-18,T-19 | 与 A-22(a)"T-14 **不得**创建这些业务页面"矛盾（盘上 `screens/` 目前不存在）。**未改** → §6-E |
| `packages/server/src/services/**` owner 串含 T-08（L598） | …,T-08 | 与 §10.2 L844（T-08 不得触碰 `services/**`）+ A-21（不许把 helper 挪进 services）矛盾。**未改**，已在该条 `reason` 里写"⚠️ 待 TPM 复核" → §6-F |
| `apps/web/src/app/(user)/report/page.tsx`（L475）= **T-15** | T-15 | **直接冲突**：§10.2 L863（T-15 行）"不得触碰"列原文含 `app/(user)/{chat,assess,report}/**`。§10.4 L911 也只把 page/study/word/profile 四页交给 T-12/T-15 整页重写 |
| `…/(user)/chat/page.tsx`（L483）= **T-12** | T-12 | **直接冲突**：§10.2 L856（T-12 行）"不得触碰"含 `app/(user)/{study,wordbook,profile,report,chat,assess}/**` |
| `…/(user)/assess/page.tsx`（L491）= **T-12** | T-12 | 同上 |
| `packages/server/src/routes/agent.ts` → T-11（L530） | T-11 | §10.2 L855 的可写清单**没有**这一件（只有 avatar/profile/lookup/tutor/chat），§10.3 也没有 → 无出处 |
| `packages/server/src/services/lookup-service.ts` → T-11（L618） | T-11 | §10.2 L855 写的是 `services/lookup.ts`（盘上真实存在的那件），`lookup-service.ts` **盘上不存在** = 幽灵条目。我按原文补了 `lookup.ts`，**没有删**这条 |
| `unowned_but_guarded: apps/web/src/**` 注记 | — | 盘上仍有一批存量文件不在任何 §10.2 行里：`apps/web/src/{app/admin/page.tsx,app/error.tsx,app/not-found.tsx,lib/utils.ts,components/markdown.tsx,components/user-shell.tsx}` |

**B. 本轮未新增、也未修改的任何"看起来该给谁"的判断** —— 上表所有加粗"冲突/矛盾/无出处"行，登记表现状保持原样，等 TPM。

---

## 4. 本轮写进 `tools/ownership.json` 的内容（43 条新条目 + 9 个 per_file 键）

**新增条目**（每条 `reason` 内都写了自己的出处）：

- server：`packages/server/src/trpc/init.ts`=T-07
- ui：`packages/ui/src/primitives/**`、`packages/ui/src/host.tsx`、`packages/ui/src/hooks/**`=T-04；`packages/ui/test/{ui,patterns,auth}.spec.tsx`（per_file T-04/T-05/T-13）
- shared：`packages/shared/test/**`=T-03
- server 测试：`test/db/**`=T-06、`test/trpc-shape.{spec.ts,baseline.json}`=T-08、`test/integration/{auth-register,auth-hardening}.spec.ts`+`test/contract/legacy-apk.spec.ts`=T-07、`test/integration/wordbook-concurrency.spec.ts`+`test/unit/wordbook-merge.spec.ts`=T-09、`test/integration/review-parity.spec.ts`+`test/review-no-llm.spec.ts`=T-10、`test/integration/{chat-isolation,profile-dto}.spec.ts`=T-11、`test/{wordbook,review,profile}-standalone.spec.ts`（per_file T-09/T-10/T-11）、`test/release/backup.spec.ts`=T-21
- web：`apps/web/{tailwind.config.ts,next.config.ts}`、`apps/web/src/lib/host.tsx`=T-04；`components/charts/{4 件}`（per_file，A-16）；`components/home/**`、`components/{mobile-nav,header,word-lookup}.tsx`、`lib/{nav.ts,hooks/use-lookup.ts,api/lookup-stream.ts}`=T-12；`(user)/{wordbook,profile/security}/page.tsx`、`components/{study,profile}/**`、`components/{wordbook-sidebar,favorite-button,flashcard}.tsx`、`lib/api/{review,wordbook,profile}.ts`=T-15；`lib/{use-auth,auth,trpc}.ts`、`components/{providers,login-dialog}.tsx`、`components/{auth-gate,upgrade-gate,login-wall}.tsx`、`app/upgrade-password/page.tsx`、`app/(user)/about/page.tsx`、`lib/api/auth.ts`=T-16；`apps/web/e2e/{6 件}`（per_file T-12/T-15/T-16）
- app：`apps/app/src/components/{4 件}`（per_file T-17/T-18）、`apps/app/src/lib/{auth-store,token-bridge}.ts`=T-19、`apps/app/test/{lookup-screen,detail-screen,account}.spec.tsx`（per_file T-17/T-19）
- 批次5：`scripts/release/README.md`、`backups/{manifest.json,.gitkeep}`=T-21、`.github/actions/**`、`web-static/**`=T-22、`e2e/**`=T-23、`.delivery/release-report-*.md`=T-24

**per_file 精确化（在既有条目里加键，未删键）**：
- `packages/server/src/services/**`（L598）：+ `wordbook-merge.ts`=T-09、`queue-service.ts`/`checkin-service.ts`/`fsrs.ts`=T-10、`avatar-service.ts`/`lookup.ts`/`tutor.ts`=T-11
- `packages/server/src/trpc/routers/{…}.ts`（L197）：+ `assessment-parts.ts`=T-08（A-21）
- `apps/app/src/screens/**`（L365）：+ `SecurityScreen.tsx`=T-19

**`reason` 补注（不改判定语义）**：L197（记录 §10.2 L844 与 §10.3 L894 的"建/拥有"差集 + A-20 只追认 auth）、L598（记录 owner 串含 T-08 与 A-21 矛盾、存量 legacy services 缺口）。

**刻意没做的事**：
- 没删 `services/lookup-service.ts`（幽灵）/ `routes/agent.ts`（无出处）/ owner 串里的 T-08、T-14 —— 属"删既有正确条目？"灰区，交 TPM。
- 没给 `packages/server/test/**`、`apps/web/src/**` 加粗兜底条目（那会把无主文件集体判给某个任务，是替 TPM 决定归属）。
- 没动 `tools/ownership.json` 的 `$comment`、`source`、`tasks`、`unowned_but_guarded`。
- **A-13 的 import-only 通用规则无法在登记表里表达**：`checkOwnership` 只有 `predecessorAllowedDiff.kind` 这一套，没有"任意任务删/迁模块时允许只改引用点 import 行"的通道。`--files` 不带 patch 时精确条目会把批次4 的删组件动作全判红（例如 T-15 🗑️`flashcard.tsx` 后 `app/(user)/*` 的 import 行改引落在 T-12/T-16 面上）。本轮**未加任何伪字段**（脚本不认，等于假配置），列为 §6-A。

---

## 5. 自检与冒烟（全部真跑，原样输出）

### 5.1 批次3 六个任务：各用 §10.2 **自己那行**的可写清单当 `--files`

```
$ TM_TASK=T-07 node tools/boundaries.mjs --check-ownership --files <§10.2 L852 原清单 18 件>
--check-ownership task=T-07 触碰 18 个文件 → 无越界
$ TM_TASK=T-09 node tools/boundaries.mjs --check-ownership --files <L853 原清单 6 件>
--check-ownership task=T-09 触碰 6 个文件 → 无越界
$ TM_TASK=T-10 node tools/boundaries.mjs --check-ownership --files <L854 原清单 10 件>
--check-ownership task=T-10 触碰 10 个文件 → 无越界
$ TM_TASK=T-11 node tools/boundaries.mjs --check-ownership --files <L855 原清单 15 件>
--check-ownership task=T-11 触碰 15 个文件 → 无越界
$ TM_TASK=T-12 node tools/boundaries.mjs --check-ownership --files <L856 原清单 13 件>
--check-ownership task=T-12 触碰 13 个文件 → 无越界
$ TM_TASK=T-20 node tools/boundaries.mjs --check-ownership --files <L857 原清单 16 件>
--check-ownership task=T-20 触碰 16 个文件 → 无越界
```

六个任务：**0 红、0 条 no-entry**（对账前 T-10 有 2 条 no-entry、T-07 有 4 条、T-12 有 11 条）。

### 5.2 批次4/5 同口径（顺带证明登记面对下游也干净）

```
--check-ownership task=T-15 触碰 24 个文件 → 无越界
--check-ownership task=T-16 触碰 14 个文件 → 无越界
--check-ownership task=T-17 触碰 6 个文件 → 无越界
--check-ownership task=T-18 触碰 6 个文件 → 无越界
--check-ownership task=T-19 触碰 8 个文件 → 无越界
--check-ownership task=T-21 触碰 10 个文件 → 无越界
--check-ownership task=T-22 触碰 6 个文件 → 无越界
--check-ownership task=T-23 触碰 4 个文件 → 无越界
```

### 5.3 反向探针（证明新条目**真的会咬**，不是永真）

```
RED  packages/server/src/services/fsrs.ts 由 T-10 独占（当前任务 T-09）
RED  apps/web/src/components/header.tsx 由 T-12 独占（当前任务 T-16）
RED  apps/web/src/components/charts/heatmap-chart.tsx 由 T-05 独占（当前任务 T-12）
RED  apps/app/test/lookup-screen.spec.tsx 由 T-17 独占（当前任务 T-18）
RED  packages/server/src/trpc/init.ts 由 T-07 独占（当前任务 T-10）
RED  packages/ui/package.json 由 T-04 独占（当前任务 T-01）— A-4：T-04 建基线
RED  packages/ui/tsconfig.json 由 T-04 独占（当前任务 T-01）
--check-ownership task=T-01 触碰 2 个文件 → 2 处越界
```

最后两条就是 §3.2 #1/#2 的实测证据（`apps/app/{package.json,tsconfig.json}` 因有 `predecessorOwner: T-01` 而对 T-01 绿，ui 那两条没有该字段 → 红）。

### 5.4 回归：门禁自身与静态断言链

```
$ node tools/boundaries.mjs --self-test
… （末段）OK A-24-1 脏产物 fixture 判红且命中含四要素 — 21 处命中
OK depcruise（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ exit=0 ✔ no dependency violations found (310 modules, 740 dependencies cruised)
OK ddl-parity.mjs --self-test 通过 — 26/26 通过（SKIP 0）
boundaries --self-test：100/100 通过
EXIT=0

$ node -e "require('./tools/ownership.json')"   → JSON_OK entries=112
$ node --check tools/boundaries.mjs            → SYNTAX_OK
```

`--self-test` 内三条与归属表直接耦合的用例（`checkOwnership` 抓 3 处越界 / 放行 T-02 自己 / `packages/server/src/unowned-legacy.ts` 必须仍 no-entry）**全部仍 OK** —— 本轮没让任何 legacy 路径意外获得条目。

未跑：`pnpm install/build/typecheck/test/depcruise`（`tools/boundaries.mjs --self-test` 内部已真跑 depcruise 与 ddl-parity，见上）；按主会话要求**没有 import `packages/**`、没有跑其他 agent 的测试**。

---

## 6. 待裁决清单（本轮一条未写进登记表）

按"不裁就会挡住批次3 并行"排序。**⭐ = 我建议的最关键三条。**

| # | 事项 | 两侧出处 | 需要 TPM 做的动作 |
|---|---|---|---|
| **A ⭐1** | **A-13 import-only 规则在登记表/门禁里没有通道**。任何任务删或迁一个被广泛 import 的模块时按 A-13 允许只改引用点 import 行，但 `--check-ownership` 只有 `predecessorAllowedDiff`（且只对**登记在 `applies_to` 里的单个任务**生效）。批次4 的 T-15 🗑️`flashcard.tsx`/`wordbook-sidebar.tsx`、T-12 🗑️`word-lookup.tsx`、T-04 已做的 `components/ui/*` 删除，都会踩到"别人页面上的 import 行" | A-13（通用规则，"此后各批次适用"）↔ `tools/ownership.json` 的 `predecessorAllowedDiff` 结构、§10.4 L911 只登记了 T-04 一个前动方 | 要么授权我给 `tools/boundaries.mjs` + 登记表加一个 `importOnlyFollowers` 通道（**本轮我未动脚本，也未伪造字段**）；要么逐文件把 import 改引授权写进 §10.4 |
| **B ⭐2** | **`tools/exceptions.json` 由 T-02 独占，与"T-10 合入时同 commit 删除该例外"互斥**。实测 `TM_TASK=T-10 --files tools/exceptions.json` → `RED … 由 T-02 独占` | `tools/**`=T-02（ownership L106，§2 目录树）↔ A-25 第 1 条、A-19③、§10.2 L844 T-08 判据④（都要求**到期任务自己**在同 commit 删例外） | 决定：① 把 `tools/exceptions.json` 从 `tools/**` 里拆出来，按"规则×文件"逐条给到期责任人写权限；或 ② 规定例外删除一律由 T-02 代删（那 T-08/T-10 的"同 commit"判据要改写）。批次3 的 T-10 会直接撞上 |
| **C ⭐3** | **`packages/server/src/**` 兜底条目（L563）与 legacy services/routes 无主面 = RK-11 缺口**：owner 串 = T-06..T-11 六个任务，粗 glob 之下盘上存量 `services/{analyst,cache,sms,redis,clickhouse,events,dict-sources,dictionaryapi,youdao}.ts`、`scripts/{init-fsrs,smoke-test,test-*}.ts`（A-18① 判给 T-06 修复轮）、`packages/shared/src/index.ts` 之外的 shared 存量，**六个后端任务碰哪个都绿** | ownership L563/L598/L512 的粗 owner 串 ↔ §10.2 各批次3 行的 FORBID + A-18① + A-21 | 建议：点名逐文件归属（我给清单，不动手）。A-18① 已裁 `packages/server/src/scripts/**`=T-06，但登记表中只有 `scripts/migrate.ts` 一件 —— 这条是否要我现在补，请一并答复 |
| D | `apps/app/src/screens/**` owner 串含 **T-14**，与 A-22(a)"T-14 不得创建这些业务页面"矛盾（盘上 `screens/` 尚不存在）；`packages/server/src/services/**` owner 串含 **T-08**，与 §10.2 L844 FORBID + A-21 矛盾（L598 已加"⚠️ 待复核"注） | A-22(a)/A-21 ↔ ownership L365/L598 | 答复"是否授权我删这两个 owner"。另：§10.2 L866（T-18 行）**没列任何 test 文件**，但它要交付判据①~⑥ → 是否给它 `apps/app/test/{study,wordbook,progress}.spec.tsx`（我不替它扩写） |
| E | `(user)/report/page.tsx`=T-15、`(user)/chat/page.tsx`=T-12、`(user)/assess/page.tsx`=T-12 三条，与 §10.2 L856/L863 的"不得触碰"列**逐字冲突**；`apps/web/src/components/word-lookup.tsx` 归 T-12 是本轮按 L856 原文（🗑️）新登记的，不冲突 | §10.2 L856/L863 ↔ ownership L475/L483/L491；§10.4 L911 只覆盖 4 个页面 | 决定这 3 个页面本期到底谁整页改（还是保持"只改 import 行"+到期消红）。批次4 的 T-15/T-16 与批次3 的 T-12 会撞 |
| F | §10.2 L844（T-08 🆕 十个 routers 文件）与 §10.3 L894（逐文件判给 T-07/09/10/11）的"建/拥有"差集；A-20 只追认 auth。另 §10.2 L855 未列 `trpc/routers/chat.ts` 与 `routes/agent.ts`，登记表却给了 T-11 | §10.2 L844/L855 ↔ §10.3 L894 ↔ ownership L197/L530 | 答复是否给 `routers/{wordbook,review,checkin,dictionary,profile,chat}.ts` 补 `predecessorOwner: "T-08"`；`routes/agent.ts`=T-11 与 `services/lookup-service.ts`=T-11 两条有无出处需确认（后者盘上不存在，是幽灵条目） |
| G | `packages/ui/{package.json,tsconfig.json}`：§10.2 L833 写 T-01 🆕，A-4/§10.3 写 T-04 建基线；两条缺 `predecessorOwner`（实测 §5.3 对 T-01 红）。盘上文件未跟踪、git 查不到创建者 | §10.2 L833 ↔ A-4 表第 3 行 ↔ ownership L245/L258 | 答复以哪侧为事实，并决定是否补 `predecessorOwner: "T-01"` |
| H | 存量无主面：`apps/web/src/{app/admin/page.tsx,app/error.tsx,app/not-found.tsx,lib/utils.ts,components/markdown.tsx,components/user-shell.tsx}`、根 `scripts/*` 旧脚本、`mobile-agenda/**`（A-10/A-16 只给了消红责任人，没给文件归属） | §10.2 全文未出现 ↔ `unowned_but_guarded` 注记 | 决定"本期不碰=保持 no-entry"是否可作为出口口径（保持现状则任何任务碰它都不会被咬） |
| I | §10.2 L846（T-14）"不得触碰"只写 `mobile-memory/**`/`apps/web/**`/`packages/**`，但 A-15 与 A-22(b) 都要求改 `apps/app/vite.config.ts`（登记在 L385 归 T-14）—— 无冲突，仅提请确认 A-22(b) 的 dist-guard 就地修是否已闭合 | A-22(b)、A-15 ↔ ownership L385 | 知悉即可 |

---

## 7. 越界申请

无。本轮只写 `tools/ownership.json` 与本报告；未碰 `.delivery/**` 排班表正文、`packages/**`、`apps/**`、`tools/boundaries.mjs`、`tools/exceptions.json`、`.dependency-cruiser.cjs`。**未执行任何 git 写操作**（`git diff --name-only` / `git log` 只读用于取证）。工作区 117 项未提交改动属其他 agent，未清理、未还原。

对账用的临时脚本 `tmp-logs/t02fix5-recon.mjs` 已删除（不留在仓库）。

## 8. 契约偏差

1. **对 A-25 前提的实测偏离**：见 §2 —— "30 条红"不能用"任务自己那行清单"复现（那是 0 红）；红来自把工作区整体 diff 当输入。这不是裁决请求，是口径澄清，请 TPM 在批次3 简报里把 `--check-ownership` 的正确输入方式写明（推荐 `--diff-file <本任务 patch>` 或 `--files <§10.2 该行清单>`）。
2. **`backups/**` 我故意没给通配**：只登记 `backups/{manifest.json,.gitkeep}`=T-21，避免 T-24 通过脚本产出的 `pre-release-<tag>.db` 被判越界。若 TPM 认为 T-24 该有 `backups/**` 写权限，请补一条（我没有替 T-24 要）。
3. `scripts/release/README.md` 已被 `scripts/release/**` 覆盖，仍登记为精确条目 —— 目的是让 owner 差异比对能看见它，不是新增权限。

## 9. 已知限制与 TODO（诚实列出）

- 登记表的 `no-entry` 仍**只是 NOTE 不阻断**（脚本行为，本轮不许改 `tools/boundaries.mjs`）。所以 §3.1 的补登记是"降低静默无主面"，不是"消灭静默无主面"：批次3/4 若新建 §10.2 未点名的文件，仍然静默通过。彻底闭合需要 §6-A/§6-H 的裁决 + 脚本改造。
- `apps/app/src/data/{…queries…}` 这类 §10.2 里的**嵌套花括号**写法，我无法在提取时逐字展开成精确清单（当前靠 `apps/app/src/data/**`=T-14 覆盖，不影响判定）；报告 §3 里的提取对这类 token 按"整组归一行声明的任务"处理。
- 未复跑 `pnpm -r typecheck/build/test`、未跑 depcruise 全量（除 `--self-test` 内部那一次）：主会话禁止 import/测试他人代码。`--all` 的既有红本轮**未重跑**，不作"未新增红"的声明。
- §6-C 的 legacy 归属清单我可以下一轮整理成 patch 提案，但**不在被授权范围内自行写**。

## 10. 给测试 / 下游的提示

- **批次3 六个任务现在可作为开工前置**：按 §5.1 的口径跑各自 `--check-ownership` → 全绿 0 NOTE。
- 重点复查两处**新咬人**的位置：`packages/server/src/services/fsrs.ts`（现 T-10 独占，A-2 要求 ts-fsrs 4.7.1 API + 序列化格式钉住）与 `packages/server/src/trpc/init.ts`（现 T-07 独占，T-11 的 WS 鉴权要走它）。
- 批次4 开工前先看 §6-E：`report/chat/assess` 三个页面的归属没裁，T-15/T-16 谁整页改未定。
- 若门禁在 CI 上恒红，先核对传入的 `--files` 是不是任务自己那行的清单（§2 第 4 点），不要回头放宽登记表。
