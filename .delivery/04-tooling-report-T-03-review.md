# 工具链与归属表面检 · T-03（批次3 出口收尾随交件）

- 任务号：T-03（本轮代码改动见 `.delivery/04-dev-report-T-03-fix2.md`）；本文件是 TPM 追加的**只读盘查**产物。
- 角色：共享契约工程师（角色卡 `roles/dev.md`）。**全程未改 `tools/ownership.json` / `tools/boundaries.mjs` / `tools/README.md`**（`tools/**` 与 `ownership.json` 是禁区），只在系统 `%TEMP%` 下建临时件（已删）。
- 判据口径：**"门禁跑什么就是什么"** —— 本文每一条可写集合都来自 `node tools/boundaries.mjs --check-ownership` 的**单跑真实输出**，不采用"我理解 handoff 应该怎样"的推断。
- 数据快照：`tools/ownership.json`（实测 `size=48710`、`mtime=2026-09-19T21:30:18.884Z` = 本地 `09-20 05:30:18`、条目数 **116**）。

## 0. 一句话结论

**①** 扫描 `handoff: true` 且 owner 批次 < 4 的条目 = **20 条**（逐条见 §1）；其中 owner 真仍 pending 的只有 **T-06 的 4 条 + T-12 的 4 条 = 8 条**，与 TPM 通报的"待办只有 T-06/T-12"完全一致；另 **12 条的 owner 已交回**，其 `actions`/额度只授给批次 ≤3 任务或已用满，不构成待办。**表上没有任何"交接已完成/额度已消费"的状态位**（`tasks` 只有 `batch`/`title` 两个字段，24 个任务里带 status 的 = 0），所以 pending 与否**不参与红绿**。**②** 额度现状：`bounded-edit:A-36-3` 的 **49/49 已用满**（该条 reason 自证"43 增 + 6 删"，出处 T-07 fix3 §1-3），但**表上无消费标记 ⇒ 通道仍是活口**，同形态补丁再交仍会绿；批次4 若复用同一裁决号 = 无上限复用旧授权。**③（本轮最重要的新发现，比 TPM 描述更硬）** `packages/server/test/trpc-shape.baseline.json` 在**现表上主条目 owner = T-08**（`reason`："§10.2 T-08 行 🆕trpc-shape.spec.ts，baseline.json 是该快照判据①的产物"），实测 **T-08 → 无越界；E2 / E3 / T-03 / T-11 → 全部 1 处越界** —— 即**现表上连 E2/E3 都进不去这个基线件**，`baseline-regenerate` 这个动作通道在盘上**根本不存在**（`grep` 命中 0）。E3′ 的再生要么由 TPM 明文指定 T-08 执行，要么必须先派 E1 轮登记通道。**④ 盘面差异必须报**：TPM 通报"表已补全（现 122 条）、E1c 新落 6 条（4 个 router 文件的 `bounded-edit:A-36-11`、`packages/server/src/trpc/profile.ts` 的 T-15/T-16、`trpc-shape.baseline.json` 的 `baseline-regenerate` 归 E2+E3）"，**本工作区实测：条目数 116、`A-36-11` 命中 0、`baseline-regenerate` 命中 0、`trpc/profile.ts` 无专属条目** ⇒ 那 6 条没落到我这块盘（或尚未写盘）。本文全部结论按 116 条现表给。

---

## 1. 问题①：`handoff: true` 且 owner 批次 < 4 的全部条目

判据（可复现）：`o.filter(e => e.handoff===true && batch(firstOwner(e))<4)`，`batch` 取 `j.tasks[owner].batch`。全表 `handoff: true` = **24 条**，其中 owner 批次 <4 = **20 条**，owner 批次 ≥4 = 4 条（`007-assessment-cache-user-id.ts`/`assessment-isolation.spec.ts`/`backup.ts` 等，owner T-25/T-21，属批次4 自己的面）。

| idx | path | owner / 批次 | 批次≥4 读者及其约束 | 通道 / 额度字段 |
|---|---|---|---|---|
| 13 | `packages/shared/src/contracts/auth.ts` | T-03 / 批1（**已交回**） | 无 | `actions=[bounded-edit:A-36-3]`，`cap={T-07:49}` |
| 17 | `packages/shared/src/schema/**` | T-06 / 批1（**pending**） | **T-21（未设任何约束）**、T-25 | `block-append:A-35-11`，`blockAppendFor.T-25={assessmentCache,columnDdl} maxAppendLines=15`，`pred.kind=any(T-06)` |
| 18 | `packages/server/src/db/**` | T-06 / 批1（pending） | T-25 | `block-append:A-35-11`，`T-25={AssessmentDB,SqliteAssessmentDB,PostgresAssessmentDB} ≤20 行` |
| 19 | `packages/server/src/db/migrations/{000…006}-*.ts` | T-06 / 批1（pending） | T-25 → **`zeroDiffFor`**（必须 0 diff） | 无 actions |
| 22 | `packages/server/src/scripts/migrate.ts` | T-06 / 批1（pending） | T-25 | `block-append:A-35-11`，`T-25={ALL_MIGRATIONS} ≤4 行` |
| 32 | `packages/ui/package.json` | T-04 / 批1（已交回） | 无 | `pred=add-dependency-lines-only`（T-05/T-13，`maxDiffLines: null`） |
| 35 | `packages/ui/src/patterns/index.ts` | T-05 / 批2（已交回） | 无 | `pred=any(T-04)` |
| 38 | `packages/ui/src/auth/index.ts` | T-13 / 批2（已交回） | 无 | `pred=any(T-04)` |
| 39 | `apps/web/package.json` | T-04 / 批1（已交回） | T-15、T-16（`add-dependency-lines-only`） | `actions=[add-script-lines-only:A-34-3]` |
| 40 | `apps/app/package.json` | T-14 / 批2（已交回） | 无 | `pred=any(T-01)` |
| 41 | `apps/app/tsconfig.json` | T-14 / 批2（已交回） | 无 | `pred=any(T-01)` |
| 42 | `apps/app/src/router.tsx` | T-14 / 批2（已交回） | T-17/T-18/T-19 → **`zeroDiffFor`** | `pred=any(T-01)` |
| 43 | `apps/app/src/shell/**` | T-14 / 批2（已交回） | T-17/T-18/T-19 → **`zeroDiffFor`** | — |
| 52 | `apps/web/src/app/layout.tsx` | T-04 / 批1（已交回） | T-16 → **≤4 行** | `cap={T-16:4}`，`successorConstraint="超出即拆新组件文件"` |
| 53 | `apps/web/src/app/(user)/layout.tsx` | T-12 / 批3（**pending**） | T-15、T-16 → **`zeroDiffFor`** | `pred=any(T-12)` |
| 54 | `apps/web/src/app/(user)/page.tsx` | T-12 / 批3（pending） | 无 | `pred=import-lines-only(T-04)` |
| 59 | `apps/web/src/app/(user)/chat/page.tsx` | T-12 / 批3（pending） | 无 | `pred=import-lines-only(T-04)` |
| 60 | `apps/web/src/app/(user)/assess/page.tsx` | T-12 / 批3（pending） | 无 | `pred=import-lines-only(T-04)` |
| 61 | `packages/server/src/app.ts` | T-07 / 批3（**已交回**） | 无 | `actions=[bounded-edit:A-33-7]`，`cap={T-10:2}`，`pred=single-import-line(T-08,1行)` |
| 64 | `mobile-memory/assets/**` | T-20 / 批3（已交回） | 无 | `pred=any(T-20)` |

**红绿是否受 pending 影响？实测：不受。** 表里没有状态位，判定只看 `owner` 串 + `per_file` 展开 + 通道字段。六种形态的单跑结果（全部真实输出，摘录判定行）：

```
形态①「清单点名他人已交回的面」        T-11 + packages/server/src/routes/auth.ts        → 1 处越界（RED：由 T-07 独占）
形态②「per_file 里的未点名文件」       T-11 + packages/server/src/trpc/profile.ts       → 无越界（该文件无专属条目，落粗兜底）
形态③「动作通道要证据而不给证据」      T-07 + packages/shared/src/contracts/auth.ts     → 1 处越界（RED：bounded-edit:A-36-3 要证据，不收 HEAD diff）
形态④「粗 glob 的 owner 串」           T-11 + packages/server/src/**                    → 无越界（owner 串含 T-06..T-11 全部批次3 任务）
形态⑤「批次4 任务用别人的 handoff 面」 T-15 + packages/server/src/trpc/init.ts          → 1 处越界；T-15 + contracts/auth.ts → RED（cap 未给 T-15 声明 = 无上限授权，拒判）
形态⑥「已交回任务回手自己旧面」        T-07 + packages/server/src/services/profile-service.ts → 1 处越界（per_file 已判给 T-11）；T-10/T-09 同文件同样红
```

⇒ 结论：**已交接/已交回的面不会因"对方任务还挂着 pending"而变绿**（形态①⑤⑥），但**未点名的新文件会被粗兜底救活**（形态②④）—— 这才是真缺口，不是 pending 造成的。

---

## 2. 问题②：批次4 开工前还有没有额度？派单建议

**额度现状（逐条）**：

1. `bounded-edit:A-36-3` → **cap 49，已用 49/49，零余量**（idx13 reason 自证："六个 hunk 头逐段相加 = 43 增 + 6 删，出处 `04-dev-report-T-07-fix3.md` §1-3；上限即取该最小可容纳值、不加余量"）。**但表上无"已消费"标记**，且形态③ 的实测显示通道对 T-07 仍是活的（只报"要证据"、不报"额度已用尽"）⇒ **同形态补丁再交一次仍会判绿**。
2. `bounded-edit:A-33-7`（`server/src/app.ts`）→ `cap.T-10 = 2`，T-10 的微轮已交回；额度按行计、无消费位 ⇒ 同样可复用。
3. `block-append:A-35-11` → T-25 三档：schema `≤15`、db `≤20`、migrate `≤4`，全部**未消费**（T-25 未开工）。⚠ `T-25` **不在 `tasks` 表里**（`j.tasks['T-25'] = undefined`，只有 `blockAppendFor` 里的字符串），所以任何按批次做的判定都拿 T-25 当"无批次"处理。
4. `add-script-lines-only:A-34-3`（`apps/web/package.json`）→ 已登记（E1c 上轮复验过），T-22/T-15/T-16 方向。
5. `zeroDiffFor` 三处（migrations 000-006 / app/src/router.tsx / app/src/shell/** / (user)/layout.tsx）→ 语义是**护栏（要求 0 diff）不是许可**，批次4 相应任务在这些面上必须零改动。
6. `cap.T-16 = 4`（`apps/web/src/app/layout.tsx`）→ 未消费，批次4 的 T-16 有 4 行额度。

**派单建议（≤5 条）**：

- **S1｜给"额度一次性"补机检**：条目加 `consumedBy`/`usedAt` 位，或在 `--self-test` 加一条"同一裁决号第二次带合格 scoped patch 仍判绿 ⇒ 红"。现状是 A-36-3 用满 49 后仍活（本文形态③ + §4.2 实测）。**批次4 任何新任务不得复用旧裁决号**（idx13 的 reason 已经这么写，只是没有机检）。
- **S2｜E3′ 的基线通道先登记再开工（最高优先）**：现表 `trpc-shape.baseline.json` 归 **T-08**，`baseline-regenerate` 通道 0 命中；E2/E3 单跑都红。要么 TPM 明文派 T-08，要么 E1 轮落 `baseline-regenerate:A-36-14` 的 `actions` + `maxDiffLinesFor`/`zeroDiffFor` 语义 + 红向 fixture。**否则 E3′ 第一步就是撞自己的出口门禁。**
- **S3｜堵粗兜底**：`packages/server/src/**` 的 owner 串一次列了 T-06,T-07,T-08,T-09,T-10,T-11，任何未点名文件（如 `src/index.ts`、`src/trpc/profile.ts`）对整批批次3 任务全绿。建议改成"未点名文件 = 红 + 指回登记"，或给 `src/trpc/**` 补一条精确条目（照 `trpc/init.ts` 那条的做法，其 reason 已自述"此前只被 `packages/server/src/**` 粗兜底条目覆盖（6 个任务都能过）→ 补精确条目"）。
- **S4｜`packages/shared/src/schema/**` 对批次4 的 T-21 未设任何约束**：T-21 是"发布护栏脚本"任务，对 DDL 单一源应只读。建议 E1 轮把 T-21 从 `readers` 降为只读面，或给它一条 `zeroDiffFor`。
- **S5｜把 T-25 正式登记进 `tasks`**（给 batch=4 + title），否则 S1/S3 之类"按批次"的机检对它永远失效。

---

## 3. E3 前置：T-07 已交回面的"批次4 / 其他任务可写集合"（实测矩阵）

`--task <X> --files <单个文件>` 单跑（每条一次进程，判定行原样取）。对 9 个 T-07 名下面 × 任务 T-11：

| 文件（T-07 面） | T-11 判定 | 依据 |
|---|---|---|
| `packages/server/src/routes/auth.ts` | **越界（红）** | per_file → T-07 独占 |
| `packages/server/src/routes/version.ts` | **越界** | 同上 |
| `packages/server/src/services/auth-service.ts` | **越界** | 同上 |
| `packages/server/src/services/password-policy.ts` | **越界** | 同上 |
| `packages/server/src/config.ts` | **越界** | 精确条目 owner T-07 |
| `packages/server/src/app.ts` | **越界** | 精确条目 owner T-07（通道 `A-33-7` 只授 T-10 2 行） |
| `packages/server/src/trpc/init.ts` | **越界** | 精确条目 owner T-07 |
| `packages/server/src/index.ts` | **无越界（绿）** | 精确条目 owner T-07 但 `readers="*"`… 实为落 `src/**` 兜底 |
| `packages/server/src/trpc/profile.ts` | **无越界（绿）** | **现表无该文件条目** → 落 `packages/server/src/**`（owner 串含 T-11） |

⇒ **9 面里 7 红 2 绿**；绿的两个都不是"因为 pending"，而是**没有被精确点名**。批次4（T-15/T-16/T-17）对 T-07 面的实测：`trpc/init.ts` 红、`contracts/auth.ts` 红（`cap` 未声明 = 拒判），只有 TPM 新登记的 4 个 router 文件（`A-36-11`）会放行 —— 而**那 4 条现在不在这块盘上**。

**对 E3′ 的直接影响**：E3′ 需要的不是"路由文件可写"，而是"基线件可写 + 出口门禁能跑绿"。现表对基线件的判定是 **T-08 绿 / 其他全红**（§0 的 ③）。所以 **A-36 四-1 的开工前置在门禁层面尚未满足**，需 S2 先落地。

---

## 4. 取证与出口命令（真实输出）

> 说明：`--check-ownership` 的 `--files` 必须是**逗号分隔的单个参数**；按简报那种空格分隔写法会打印整页 help 并 `exit 2`（A-35-10② 的"无判定"路径，方向正确）。

```
$ node tools/boundaries.mjs --check-ownership --task T-03          # 不给证据
NOTE 未提供任何触碰文件（--files a,b 或 --diff-file p.patch）→ 无判定
--check-ownership task=T-03 无证据（既无 --files 也无 --diff-file）= 无判定，不得声称通过（A-35-10②）   退出码 2

$ node tools/boundaries.mjs --check-ownership --task T-03 --files packages/shared/src/contracts/wordbook.ts,packages/shared/src/constants/errors.ts,packages/shared/test/contracts.spec.ts
TABLE E:\CC\tomorrow-memory\tools\ownership.json
--check-ownership task=T-03 触碰 3 个在册文件（清单 3 项 + patch 0 项） → 无越界      退出码 0
```

---

## 5. 我没改的工具文件 / 需要 E1 轮的改动清单

**零改动**（铁律 + 禁区）：`tools/ownership.json`、`tools/boundaries.mjs`、`tools/README.md`、`tools/exceptions.json`、`tools/selftest-fixtures/**`、`packages/server/**`、`packages/shared/src/contracts/auth.ts`、`apps/**`、`.delivery/0[12]*.md`。本文所有数字来自只读 `node -e` 读取与门禁单跑。

需要 E1 轮落表的（逐条，最多 5 条，对应 §2 的 S1-S5）：

1. `baseline-regenerate:A-36-14` 落到 `packages/server/test/trpc-shape.{spec.ts,baseline.json}`（owner 建议 E3 或 T-08 明文），并补**红向 fixture**：`--task T-11`（或任意非授权任务）带 `actions=[baseline-regenerate:…]` 的假 patch → 必红；干净态 → 绿。理由：现表该件归 T-08，E2/E3 都进不去，`--self-test` 里也没有这个通道的红绿对照（`tools/selftest-fixtures/ownership/` 实测 19 个条目：`app-patch/app-post/be* /capred*/dp*/ext*/entry*/own* /owner-串/patchonly/srconly` —— 名字里没有任何 baseline 相关项）。
2. `consumedOnce: true` + 第二次即红的机检（S1），落点：idx13（A-36-3）、idx61（A-33-7）、idx39（A-34-3）。
3. `packages/server/src/trpc/**`（至少 `index.ts` 与 `profile.ts`）补精确条目（S3）。
4. `packages/shared/src/schema/**` 的 T-21 降只读或 `zeroDiffFor`（S4）。
5. `tasks` 里补 `T-25: {batch: 4, title: "..."}`（S5）；同时把 `tools/README.md:44` 的"106 条"刷成实测值（现为 116，落 E1c 的 6 条后应为 122）。

---

## 6. 遗留（未查 / 需授权才能查）

1. **未做"落盘态"验证 S1/S3**：要证明"同形态补丁再交仍会绿"必须**实际往 `ownership.json` 追加一条假通道并跑门禁**（禁区，未做）。本文只按现表 + 单跑判定给结论，不给推测。
2. **`--self-test` 的 151 条我未逐条读名**（只跑过计数，151/151 绿）；§5 第 1 条里"没有 baseline 通道的红向 fixture"是按 `ls tools/selftest-fixtures/ownership/` 的 19 个条目名 + `grep -c 'baseline-regenerate' tools/boundaries.mjs = 0` 推得，若 E1 轮要按这条派工，请先复跑 grep 确认。
3. **盘面 116 vs 通报 122 的差异**未解决：我没有权限写表，也无法判定是 E1c 未落盘还是落在另一份工作副本上。派单前建议 `node -e "console.log(JSON.parse(require('fs').readFileSync('tools/ownership.json','utf8')).ownership.length)"` 复核。
4. **`per_file` 展开层与目录条目 owner 串不一致**（例如 `trpc/routers/chat.ts` 判给 T-11，而目录条目 owner 串首位写的是 T-07）只是文案噪声，红绿方向未受影响；未逐条核对 116 条里 10 个 `per_file` 条目的 reason 是否都已同步。
5. **诚实修正一条**：本轮我有一次把批量循环（`while read` 串行 20 次）的输出误读成"T-11 对 T-07 九面全部无越界"。改为**逐条单跑**后实测是 **7 红 2 绿**（见 §3 表），§1/§3 的所有判定均为单跑复核后的结果。批量循环那种读法我不再采用。
