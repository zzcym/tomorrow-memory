# 开发报告 · T-02 架构门禁与静态断言脚本（收尾棒）

> 角色：开发工程师（`references/roles/dev.md`）
> 任务行：`.delivery/02-tech-design.md` §10.2 批次1 **T-02**（判据①-④ + 冒烟命令为准）
> 上游输入：`01-prd.md`、`02-tech-design.md` §3.5/§6.2/§6.5/§10.3/§10.4、`04-adjudications.md`（A-1/A-2/A-4/A-5）
> 本次范围：**修 `.dependency-cruiser.cjs` 的 `includeOnly` 静默失效 → 真实跑通冒烟 → 出报告**。未重写任何已有交付物。
> 纪律遵守：**未执行任何 git 写操作**；只写 `tools/**` 与 `.dependency-cruiser.cjs`；`packages/**`、`apps/**`、根配置全程只读。

---

## 0. 结论（一句话）

任务行冒烟链 **`pnpm depcruise && node tools/boundaries.mjs --self-test && node tools/ddl-parity.mjs --help` 真实退出码 0**（§4 有完整输出）；
判据 **①②③④ 全部通过**。唯一的"未跑到"是本机 `better-sqlite3` 原生模块 ABI 不匹配（node 20 编译 vs node 22 运行），
导致 ddl-parity A 段"真库往返"这一层本机不可验（记 SKIP，不记绿），属环境缺陷，已列入越界申请给 T-01/T-22。

接手时的状态核对：前一条状态说"`includeOnly` 的修复还没做"，**实际盘上 `.dependency-cruiser.cjs`（mtime 12:33）已完成修复**
（`options` 里没有 `includeOnly`，只有注释里解释为什么不用它）。我按"不轻信"原则做了 A/B 复验（§2），确认该修复**既必要又充分**，因此本棒未再改这个文件。

---

## 1. 文件清单

| 文件 | T-02 归属 | 本棒动作 | 说明 |
|---|---|---|---|
| `.dependency-cruiser.cjs` | 🆕（交付物） | **只读复验，未改** | 前棒已摘除 `includeOnly`；§2 给出实测证据 |
| `tools/boundaries.mjs` | 🆕（交付物） | **修 1 个 bug** | `--self-test` 第 6b 用例把 `.mjs` 当可执行文件 spawn，Windows 下 `status=null` → 91 项里恒 1 红（见 §3-④/§5-改动说明） |
| `tools/ddl-parity.mjs` | 🆕（交付物） | **修 1 个 bug + 加 2 条自测断言 + 修 SKIP 计数** | ①`loadSchemaSource` 用 `import('E:/…')`，Windows 必抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME` → 改 `pathToFileURL().href`；②新增"A 段漂移 fixture 端到端 exit=1"两条用例；③`--self-test` 汇总行不再把 SKIP 算进"通过"分母 |
| `tools/fixtures/selftest/parity/schema-drift.mjs` | 🆕（本棒新增 fixture） | 新建 | 判据④用：一份**故意带漂移**的 schema 源（干净表 + 漂移表同框，防永真） |
| `tools/ownership.json` / `tools/exceptions.json` / `tools/fixtures/schema-fixtures.json` / `tools/fixtures/selftest/**` | 🆕（交付物） | 只读核对 | 未改动内容（`exceptions.json` 的增删需 TPM 仲裁，见 §7） |

未创建任何报告外的新文档；未新增 npm 依赖。

---

## 2. `includeOnly` 问题：修复确认与实测证据

### 2.1 结论

`options.includeOnly` 已从配置中摘除；替代方案是「`node_modules` 放 `doNotFollow` 而非 `exclude`」+「`to.path` 同时匹配
`node_modules/<pkg>/` 与裸包名两形态」。本棒用两组实测复验。

### 2.2 实测 A：真仓库的 npm 依赖边数量（同一份规则，只差 `includeOnly`）

```bash
# /tmp/dc-with-includeonly.cjs = require 真配置后追加 options.includeOnly={path:'^(packages|apps|tools|mobile-memory)/'}
node node_modules/dependency-cruiser/bin/dependency-cruiser.mjs . --config .dependency-cruiser.cjs          --output-type json
node node_modules/dependency-cruiser/bin/dependency-cruiser.mjs . --config $TMP/dc-with-includeonly.cjs --output-type json
```

| 配置 | modules | edges | **npm 边** |
|---|---|---|---|
| 当前盘上（无 `includeOnly`） | 217 | 363 | **83** |
| 重新加回 `includeOnly` | 120 | 109 | **0** |

npm 边样本（当前配置下可见）：`→ react [npm,import]`、`→ next/link [npm,import]`、`→ next/navigation [npm,import]` …
→ 一旦启用 `includeOnly`，**所有指向 npm 包的边被整条剪掉**，`ui-no-io` / `shared-pure` / `fsrs-version-lock` /
`thin-facade-pg-client` 这几条"禁某个 npm 包"的规则就成了**本任务定义的永真断言**（前棒的实测结论成立）。

### 2.3 实测 B：故意违规 fixture 在两种配置下的对照（同一命令，只换 `--config`）

```bash
cd tools/fixtures/selftest/depcruise/<fixture> && TM_TASK=T-99 \
  node <repo>/node_modules/dependency-cruiser/bin/dependency-cruiser.mjs . --config <cfg>
```

| fixture（故意违规） | 当前配置（无 includeOnly） | 加回 includeOnly |
|---|---|---|
| `ui-no-io-violation` | ✖ **1** dependency violations (1 errors). 3 modules, **1 dependencies** cruised | ✔ no violations found (2 modules, **0 dependencies** cruised) |
| `shared-pure-violation` | ✖ **2** dependency violations (2 errors). 4 modules, 2 dependencies cruised | ✔ no violations found (2 modules, 0 dependencies cruised) |
| `fsrs-version-lock-violation` | ✖ **1** dependency violations (1 errors). 2 modules, 1 dependencies cruised | ✔ no violations found (1 modules, 0 dependencies cruised) |
| `thin-facade-violation` | ✖ **1** dependency violations | ✖ 1 dependency violations（该 fixture 命中的是本地路径边，不经 npm 边，故不受影响） |

→ 修复有效且必要；`thin-facade` 一行同时证明 fixture 不是"怎么配都红"。

### 2.4 `boundaries.mjs` 的 spawn 修复（本棒改动）

`--self-test` 第 6b 项（"故意违规 fixture 留在真仓库里不得改变门禁结论"）直接 spawn `…/bin/dependency-cruiser.mjs`。
Windows 下 `spawnSync` 打 `.mjs` 会失败（实测 `error=EFTYPE`、`status=null`），而 `null !== 0` 又 `=== 0` 为假 → 该项**恒红**。
改成与其它用例同一个口径 `spawnSync(process.execPath, [DEPCRUISE_BIN, …])`。修前 `90/91 通过`，修后 `91/91 通过`。
（这是"修脚本自身的假红"，不是放宽规则：`inert.status === 0` 的判据一字未动。）

---

## 3. 完成判据①-④ 逐条核对

### 判据① §3.5 全部 depcruise 规则各有 1 个"故意违规 fixture 被红"用例 → **通过**

`--self-test` 对每条规则同时要求「故意违规必红（且退出码非 0）」+「干净 fixture 必绿（且 0 violations）」，缺用例本身即红。
真实输出（摘自 §4 的冒烟全量日志）：

```
OK   depcruise ui-no-io 故意违规 → 红 — exit=1 rules=ui-no-io
OK   depcruise ui-no-io 干净 fixture → 绿 — exit=0 violations=
OK   depcruise review-no-agent 故意违规 → 红 — exit=5 rules=review-no-agent
OK   depcruise review-no-agent 干净 fixture → 绿 — exit=0 violations=
OK   depcruise shared-pure 故意违规 → 红 — exit=2 rules=shared-pure
OK   depcruise shared-pure 干净 fixture → 绿 — exit=0 violations=
OK   depcruise app-web-isolated 故意违规 → 红 — exit=1 rules=app-web-isolated
OK   depcruise app-web-isolated 干净 fixture → 绿 — exit=0 violations=
OK   depcruise fsrs-version-lock 故意违规 → 红 — exit=1 rules=fsrs-version-lock
OK   depcruise fsrs-version-lock 干净 fixture → 绿 — exit=0 violations=
OK   depcruise thin-facade 故意违规 → 红 — exit=1 rules=thin-facade
OK   depcruise thin-facade 干净 fixture → 绿 — exit=0 violations=
OK   depcruise no-legacy-app-js 故意违规 → 红 — exit=1 rules=no-legacy-app-js
OK   depcruise no-legacy-app-js 干净 fixture → 绿 — exit=0 violations=
OK   depcruise review-no-agent 对故意违规 fixture 报红 — violations=5
OK   例外过期机制：cursor≥expires_after 时同一违规重新计红 — 例外 legacy-review-routes-import-agent：cursor=T-10 时 15 红；cursor=T-02 时 0 红
```

§3.5 的 7 条规则 → fixture 目录映射（`tools/fixtures/selftest/depcruise/<rule>-{violation,clean}/`）齐备，无缺项。
物理规则共 10 条 = 7 条 + 3 处必要拆分（`app-web-isolated-reverse`、`shared-pure-core`、`thin-facade-pg-client`），理由见 §6 契约偏差 1。

### 判据② `boundaries.mjs` 覆盖清单 → **通过**（5 个子项全覆盖，红/绿双用例）

| 判据②子项 | 断言 id | 红用例（fixture）实测 | 绿用例实测 |
|---|---|---|---|
| 旧口径文案 0 命中 | `copy-legacy-zero` | `violations/copy` → `2 处命中：apps/web/src/Settings.tsx:1 \| :2；需人工复核词命中 0 处` | `clean` → `0 命中` |
| `passwordUpgradeDeadline` 0 命中 | `deadline-key-zero` | `violations/deadline` → `1 处命中：…auth-service.ts:1` | `clean` → `0 命中` |
| `passwordUpgradeEnforce` 引用点=1 | `enforce-flag-single-read` | `@T-02 violations/enforce-two-reads` → `引用点 2 个 > 1`；`@T-07 violations/enforce-none-late` → `引用点 0 个 —— T-07 之后必须恰好 1 处` | `@T-07 clean` → `引用点 1 个：…auth-service.ts:15` |
| `SET password` 写入点=3 | `password-write-points` | `violations/password-rogue-write` → `出现第 4 类写入点`；`@T-07 violations/password-only-one-role` → `角色 {registration}=1 个 … 要求恰好 3 类` | `@T-07 clean` → `角色 {activation,password-change,registration}=3 个；命中 7 处` |
| 迁移禁词（DROP/RENAME/ALTER COLUMN/回填 UPDATE） | `migration-forbidden` | `violations/migration-drop` → `0004_drop_grace.ts:1[DROP COLUMN]`；`violations/migration-backfill` → `0005_backfill_policy.ts:1[回填 UPDATE users SET pw_policy_version]` | `clean` → `0 命中（扫描 2 个文件）` |
| （附带）迁移必须声明 `down()`/`noDownReason`（T-06 判据③） | `migration-down-declared` | `violations/migration-no-down` → `1 个迁移缺 down()/noDownReason` | `clean` → `2 个迁移全部声明` |

注册表共 **19 条断言**，`--self-test` 要求每条都有红+绿用例（§4 输出前 20 行"覆盖 …"）。
真仓库现状（**不属于判据，但如实登记**）：`node tools/boundaries.mjs --all` → `14/19 条通过，5 条红`（`copy-legacy-zero`、`colors-no-hardcode`、`colors-purple-retired`、`focus-ring-not-hidden`、`route-string-preserved`），
全部是存量代码命中，**我没有自行往 `tools/exceptions.json` 加条目**（理由见 §7 建议清单）。

### 判据③ `ddl-parity.mjs --help` 能列出 A/B/C 三段并声明"待 T-06 提供 schema 源" → **通过**

```
$ node tools/ddl-parity.mjs --help   (EXIT=0)
A 段 DDL 对账     断言：列集合、归一化类型（TEXT↔varchar 映射表）、NOT NULL、默认值、索引集合 …
B 段 行为对账     断言：同一 fixtures（含空密码账号、pw_policy_version=0 账号、中文与超长词、NULL/空串 password）…
C 段 长度语义对账 断言：phone 11 位边界、password 72 字节边界、data 数组 20000 上限在两库行为一致…
schema 源：约定路径 packages/shared/src/schema/tables.ts（§10.3 归属 T-06，本脚本只读）
     现状：**待 T-06 提供 schema 源** —— 不存在时本脚本给出可读错误并 exit 2，不静默通过。
```

### 判据④ 两脚本退出码非 0 时能阻断（用 fixture 证明）→ **通过**

**boundaries.mjs（真 CLI，非自测内部函数）：**

| 命令 | 关键输出 | 退出码 |
|---|---|---|
| `node tools/boundaries.mjs --password --root tools/fixtures/selftest/violations/enforce-two-reads` | `RED enforce-flag-single-read 引用点 2 个 > 1` → `2/3 条通过，1 条红` | **1** |
| `node tools/boundaries.mjs --migrations --root tools/fixtures/selftest/violations/migration-drop` | `RED migration-forbidden …[DROP COLUMN]` → `1/2 条通过，1 条红` | **1** |
| `node tools/boundaries.mjs --copy --root tools/fixtures/selftest/violations/copy --task T-99` | `RED copy-legacy-zero 2 处命中 …(例外 legacy-web-copy 已过期)` + `RED exceptions-expired` | **1** |
| `node tools/boundaries.mjs --check-ownership --task T-02 --files packages/shared/src/schema/tables.ts,tools/boundaries.mjs` | `RED …由 T-06 独占（当前任务 T-02）` → `1 处越界` | **1** |
| 绿对照 `node tools/boundaries.mjs --copy --password --migrations --root tools/fixtures/selftest/clean` | `6/6 条通过，全绿` | **0** |
| 绿对照 `node tools/boundaries.mjs --all --root tools/fixtures/selftest/clean` | `19/19 条通过，全绿` | **0** |

（`--copy --root …/violations/copy` 在默认 cursor=T-02 下**不红**：`exceptions.json` 的 `legacy-web-copy`（`^(apps/web/src\|packages/server/src)/`）
与 fixture 同名路径撞上 → 被白名单吃掉。加 `--task T-99` 让例外过期即红（上表第 3 行）。这是白名单语义，不是判定力缺失；
`--self-test` 内部用空例外上下文跑同一 fixture，实测为红。已登记进 §8 已知限制。）

**depcruise（判据①的副作用即证据）：** 7 条规则各自的故意违规 fixture 退出码分别为 1/5/2/1/1/1/1（上面表格里），全部非 0。

**ddl-parity.mjs：**

| 命令 | 关键输出 | 退出码 |
|---|---|---|
| `node tools/ddl-parity.mjs`（schema 源尚不存在，现状） | `✖ 缺 schema 源：packages/shared/src/schema/tables.ts … 本脚本刻意不猜、不建、不降级为绿` | **2** |
| `node tools/ddl-parity.mjs --self-test` | `OK 缺 schema 源 → exit 2 + missing-schema-source — {"sections":{},"exit":2,"reason":"missing-schema-source"}` | 0 |
| `node tools/ddl-parity.mjs --section A --schema tools/fixtures/selftest/parity/schema-drift.mjs` | 载入 2 张表后崩在 `better_sqlite3.node` ABI → `EXIT=2` | **2**（非 0，但**不是**判据想看的"对账真红"） |

→ **诚实说明**：A 段"检出真漂移 → exit 1"这一条端到端在本机**没跑到**（原生驱动 ABI 不匹配，见 §7 越界申请 2）。
判定力本身由两部分自证：`--self-test` 的 13 类 `A 段漂移样本`（`column-missing`/`type-mismatch`/`notnull-mismatch`/`default-mismatch`/`index-*`）逐条必须报对 + `clean_pair` 必须 0 差异；
端到端那两条新断言我已写进 `--self-test`，在能加载驱动的机器/CI 上会自动生效（驱动加载失败时打印 SKIP + ⚠，不记绿）。

---

## 4. 冒烟：命令与真实输出

```bash
$ pnpm depcruise && node tools/boundaries.mjs --self-test && node tools/ddl-parity.mjs --help
CHAIN_EXIT=0
```

第 1 段（`pnpm depcruise`，退出码 0）：

```
$ depcruise . --config .dependency-cruiser.cjs
✔ no dependency violations found (217 modules, 363 dependencies cruised)
```

第 2 段（`node tools/boundaries.mjs --self-test`，退出码 0，共 91 项全绿）——首尾与关键项：

```
OK   覆盖 copy-legacy-zero — 红用例 1 / 绿用例 1（各需 ≥1）
…（19 条断言 × 红/绿逐条 OK，全量见本仓 git 之外的控制台输出）…
OK   exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）
OK   depcruise ui-no-io 故意违规 → 红 — exit=1 rules=ui-no-io
…（7 条规则 × 红/绿共 14 项 OK，见判据①）…
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (217 modules, 363 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：22/24 通过（SKIP 2）

boundaries --self-test：91/91 通过
```

第 3 段：`node tools/ddl-parity.mjs --help` → 全文见判据③，退出码 0。

**补充（不在任务行冒烟链里，但报告如实登记）：** `node tools/ddl-parity.mjs --self-test` 单独跑：

```
⚠ SKIP：better-sqlite3 在当前 node(22.20.0) 下不可加载 —— A 段的"真库往返"这一层本机跑不到，只能在 CI 里跑。这不是通过，请在交付报告里如实登记。
⚠ SKIP：漂移 fixture 的 A 段端到端阻断在本机跑不到，退出码非 0 只由"缺 schema 源 → exit 2"这一条自证。这不是通过，请在交付报告里如实登记。
SKIP SQLite 往返自测（native 驱动不可加载：The module '\\?\…\better_sqlite3.node'）
SKIP A 段漂移 fixture 端到端（真库往返跑不到：The module '\\?\…\better_sqlite3.node'）
ddl-parity --self-test：22/24 通过（SKIP 2）        EXIT=0
```

（改前它会打印 `23/23 通过`，把"真库往返本机没跑到"洗成满分绿灯 —— 本棒把 SKIP 从分母里显式摘出来了。）

---

## 5. 完成清单（对照任务行"允许新建/修改"）

| 交付物 | 状态 | 备注 |
|---|---|---|
| `.dependency-cruiser.cjs`（§3.5 的 7 条规则） | done | 含例外白名单加载器（未过期例外生成 `__exc_<id>` 变体规则；过期自动失效重新计红） |
| `tools/boundaries.mjs`（19 条静态断言 + `--check-ownership` + `--self-test`） | done | 覆盖判据②全部子项 + §10.3/§10.4 归属表落地 |
| `tools/ddl-parity.mjs`（A/B/C 三段骨架 + 归一化表 + fixtures） | 部分（骨架按判据③done，A/B/C 真跑待 T-06） | 任务行本身只要求"parity 骨架"，且 §10.3 明示 schema 源归 T-06 |
| `tools/fixtures/schema-fixtures.json` | done | A 段漂移样本 13 类 + B/C 边界值（phone 10/11/12、password 72/73 字节、data 19999/20000/20001） |
| `tools/ownership.json`（§10.3 落地件） | done | 24 个任务 × 目录/文件粒度 + §10.4 改动幅度 |
| `tools/exceptions.json` | done（**未擅自扩充**） | 8 条历史例外，全部带 `owner` + `expires_after` |
| `tools/fixtures/selftest/parity/schema-drift.mjs` | 🆕 本棒新增 | 判据④ fixture |

---

## 6. 契约偏差（需 TPM 知悉/仲裁）

1. **`§3.5` 的 7 条规则 → 落地为 10 条物理规则。** 三处拆分都是 dependency-cruiser 18.3 的能力限制，不是放宽：
   - `app-web-isolated` 需双向断言，而 18.3 不支持 from/to 捕获组反向引用（实测 `^apps/$1/`、`^apps/\1/` 均不匹配）→ 拆成 `app-web-isolated` + `app-web-isolated-reverse`；
   - `thin-facade` 的"直达驱动/迁移目录"与"自带 SQL 客户端（pg）"两种 to 形态不能共存于一条 → 拆出 `thin-facade-pg-client`；
   - `shared-pure` 的 node 内建模块面拆出 `shared-pure-core`（`dependencyTypes:['core']`）。
2. **`ui-no-io` 的 `fetch`、`shared-pure` 的 `process.env` 不在 depcruise 里强制。** 全局调用不是 import 边，depcruise 看不见 →
   由 `tools/boundaries.mjs` 的 `ui-no-io-globals` / `shared-pure-env` 两条断言强制（同规则语义、同一份 exceptions.json），实测红/绿用例各 1。
3. **不使用 `options.includeOnly`；`node_modules` 从 `exclude` 挪到 `doNotFollow`。** 见 §2 的 A/B 实测：启用即 4 条 npm 规则变永真断言。
4. **`fsrs-version-lock` 的版本区间断言位置按 A-1 落地。** §3.5 字面写"由根 `package.json` 的 `pnpm.overrides` 断言"，A-1 已裁决 pnpm 11 忽略该字段 →
   `version-pin-overrides` 改为校验 `pnpm-workspace.yaml:overrides` 的精确版本，并把"根 package.json 重新出现 `pnpm.overrides`"本身判红（实测红/绿各 1 用例）。
5. **`route-string-preserved` 的 required 清单与真仓库不符（未改，交仲裁）。** 清单里的 `/api/auth/login`、`/api/auth/register`
   在现仓库**从未存在**（`packages/server/src/routes/auth.ts` 实注册的是 `/api/send-code`、`/api/login`、`/api/me`、`/api/password`，无 register 端点）→
   该断言在真仓库恒红（`--all` 输出可见）。它 `enforce_from: 'T-08'`，且未做"未到生效期不判红"的通用处理。
   建议修法（**给 T-08，由 TPM 仲裁后执行**）：required 换成 §6.5-1 的"真实现状快照 18 条"（`/api/login`、`/api/send-code`、`/api/me`、`/api/password`、
   `/api/wordbook`、`/api/profile`、`/api/checkin`、`/api/checkin/status`、`/api/review`、`/api/review/today`、`/api/lookup`、`/api/chat/history`、
   `/api/agent`、`/api/agent/stream`、`/api/tutor`、`/api/admin/login`、`/api/admin/users`、`/api/admin/stats`），并同步换掉 `violations/route-deleted`、`clean` 两处 fixture 的路径串；
   或在 `runAssertion` 里对 `enforce_from > cursor` 统一降级为 pending。**本棒未动**：换清单要同时改 fixture，属规则变更，不该由收尾棒单方面做。
6. **`--self-test` 的 SKIP 语义。** ddl-parity 汇总行从 `N/N 通过` 改为 `通过（SKIP k）`，避免"本机没跑到"被读成绿灯。

---

## 7. 越界申请

1. **根 `package.json` 缺 `boundaries` 脚本位**（T-01 独占，我不改）。
   现有：`depcruise`、`ddl-parity`、`test`、`release:preflight` 都在。缺 `node tools/boundaries.mjs` 的入口 → T-22 写 CI 时只能硬写 node 路径。
   申请补：`"boundaries": "node tools/boundaries.mjs"` 与（可选）`"gate": "pnpm depcruise && pnpm boundaries --all && pnpm ddl-parity"`。
2. **`better-sqlite3` 预编译 ABI 与本机 node 不匹配**（属 T-01 的依赖治理 + T-22 的 CI 前置）。
   实测报错原文：`NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 127`
   （node 22.20.0；`package.json:engines.node = ">=20"`）。影响面：ddl-parity A 段真库往返、`--self-test` 的 2 项 SKIP、以及 T-06 之后 `pnpm ddl-parity` 的本地可跑性。
   申请：`pnpm rebuild better-sqlite3`（或把 engines/CI 的 node 钉到 20/22 之一）。**我未动 `node_modules`、未动根配置。**
3. `pnpm test` 现为红 = A-5 已裁"符合预期，不算缺陷"，本棒未尝试掩盖（无 `--passWithNoTests`）。
4. **不建议本棒自行扩充 `tools/exceptions.json`**（虽然该文件归 T-02）：真仓库 `--all` 的 5 条存量红我逐条拟好了候选条目，等 TPM 点头再落，
   以免"收尾棒顺手放宽门禁"。候选（证据=§3-② 与 §4 输出）：

   | 建议 id | assertion | file | owner / expires_after | 理由 |
   |---|---|---|---|---|
   | `legacy-mobile-memory-copy` | `copy-legacy-zero` | `^mobile-memory/assets/` | T-20 / T-20 | 5 处命中全在手写版产物（`api.js:71`、`app.js:260/385/848`、`index.html:78`），Q6 定案 main 上由 `apps/app` 产物取代、T-20 删源文件 |
   | `legacy-web-colors` 扩围 | `colors-no-hardcode` | 现 `^apps/web/src/` → 建议 `^apps/web/` | T-12 / T-16 | 30 处命中里 6+ 处在 `apps/web/tailwind.config.ts`（当前例外范围外） |
   | `legacy-web-purple` | `colors-purple-retired` | `^apps/web/src/` | T-12 / T-16 | 8 处（`globals.css` 4 + 两个 charts 组件），T-04 迁 token / T-12 重写清零 |
   | `legacy-web-focus` | `focus-ring-not-hidden` | `^apps/web/src/components/ui/` | T-04 / T-04 | 5 处，正是 T-04 要删并迁入 `packages/ui/primitives` 的那 12 个文件 |

---

## 8. 遗留与对接点

**给 T-06（ddl-parity 的 schema 源）**

- 约定落点：`packages/shared/src/schema/tables.ts`（§10.3 归 T-06，我的脚本只读）。导出形状由 `loadSchemaSource` 强校验：
  `export const tables = [{ name, columns:[{name,type,notNull,default,primaryKey?}], indexes:[{name,columns[],unique}] }]`
  （也接受 `default`/`TABLES`/`SCHEMA` 导出名；缺 `name`/`columns` 会抛可读错误，不会静默通过）。
- **格式样例现成**：`tools/fixtures/selftest/parity/schema-drift.mjs`（干净表 + 漂移表各一张，可当"最小可载入源"参考）。
- 本机 node 22.20 实测可 `import()` 一个只含可擦除类型语法的 `.ts`（`OK import .ts under node 22.20.0`）；
  若 `tables.ts` 里用 `enum`/`namespace`/参数属性或要拉 `@tm/shared` 运行时，就得上 `tsx` 或改成 `.mjs`/`.json` 源 —— 这条会影响 `pnpm ddl-parity` 能否裸跑，请 T-06 在批次1 出口前确认。
- A 段的 DDL 生成器目前内嵌在 `ddl-parity.mjs`（`sqliteDdlFromDescriptor`，注释已标"若 T-06 提供生成器则本函数随之外移"）。
  T-06 若把建表语句改成从 shared 描述生成，请把同一个函数上移到 `@tm/shared/schema`，我这边只需替换一处 import。
- 待补前置：`DATABASE_URL_TEST`（未设时 A 段 PG 侧记 SKIP 并打 CI 警告；§6.4 T-22 必须在 CI 起真 PG，否则 A 段只验了一半）。
- B/C 段现在输出 `BLOCKED：packages/server/src/db/index.ts 未导出 AppDB（待 T-06）`（注：该文件已存在，措辞在 T-06 交付 `AppDB` 双驱动后要跟着改一次），
  fixtures 已按 §6.2 备好（空密码账号、`pw_policy_version=0`、超长词、NULL/空串 password、phone/password/data 三档边界）。
- **别忘了 §7 越界申请 2**：驱动 ABI 不修好，T-06 判据①"A 段差异=0"在本地跑不出来。

**给 T-08 / T-10（`review-no-agent` 例外摘除）**

- 例外条目：`tools/exceptions.json` → `legacy-review-routes-import-agent`（engine=depcruise，rule=`review-no-agent`，
  `from=packages/server/src/routes/review.ts`，`to=^(@tm/agent|packages/agent/|packages/server/src/services/analyst\.ts)`，owner=**T-10**，expires_after=**T-10**）。
  注意：**摘除时点在 T-10 而不是 T-08**（任务提示里写的是 T-08，以 exceptions.json 的登记为准；差异已在此如实标出）。
- 实测：该例外在 cursor=T-02 下豁免 **15 条**可达闭包违规（`routes/review.ts → @tm/agent`）；cursor=T-10 时同一份代码重新计 15 红。
- **T-08 的坑（必须知道）**：规则的 `from` 同时覆盖 `services/review-service.ts`、`trpc/routers/review.ts`、`routes/review.ts`，
  而例外的 `from` **只**登记了 `routes/review.ts`。T-08 把 `router.ts` 拆成 `trpc/routers/**` 时，若把 `runAgent` 的 import 搬进 `routers/review.ts`，
  例外立刻不再匹配 → **depcruise 当场红**。T-08 正确做法是只搬 `review` 域里不含 agent 的部分（§10.4 已登记"只允许改 `import { appRouter }` 的 1 行"），
  把评分链的 agent 依赖留给 T-10 消（T-10 判据：评分逻辑收进 `services/review-service.ts` 后删除本条目）。
- 摘除动作 = 从 `exceptions.json` 删该条目 + 跑 `pnpm depcruise`（必须仍 0 violations）+ 跑 `node tools/boundaries.mjs --self-test`
  （里面那条"例外过期机制…cursor=T-10 时 15 红"用例会因找不到 depcruise 条目而变红，届时**改该用例而不是放宽规则**）。

**给测试/QA（Phase 5）**

- 重点测：`--check-ownership` 的"改动幅度"分支（T-04 只改 import 行 / T-16 根 layout ≤4 行 / A-4 的 package.json 只加依赖行），
  以及 `exceptions.json` 的过期语义（任何 expires_after 已过的条目仍在 = 红）。
- 我没测到的路径：ddl-parity A 段的真库往返（本机 SKIP）、PG 侧 introspection（无 `DATABASE_URL_TEST`）、`--section B/C` 的真实对账（待 T-06）。
- 不要测 `pnpm test`：A-5 已裁红为预期。

---

## 9. 已知限制（诚实清单）

1. 本机 `better-sqlite3` ABI 不匹配 → ddl-parity A 段"真库往返"2 项 SKIP（CI 可验，见 §7-2）。
2. `--root <fixture>` 直接跑单条断言时，白名单会因 fixture 与真实文件同名而吃掉命中（`copy-legacy-zero` 案例）；
   正确用法是 `--task T-99`（例外过期）或走 `--self-test`（空例外上下文）。属用法坑，不是判定力坑。
3. `enforce_from` 只在个别断言里做了"未到生效期不判红"，无通用降级 → `route-string-preserved` 在真仓库假红（§6-5）。
4. 真仓库 `--all` 现状 14/19，5 条存量红未处理（§7-4 给了候选条目，等仲裁）。
5. depcruise 图里 `apps/**`、`packages/**` 的存量代码仍是迁移前形态（217 modules），批次1 各包落地后图会重画；
   规则本身按前缀匹配，不需要再改，但**新包目录名若偏离 §2 目录树就会绕过规则** —— T-22 建议在 CI 里加一条"目录树外新增顶层包即红"（不在本任务判据内）。
6. `ddl-parity --self-test` 的退出码语义：有 SKIP 时仍返回 0（只有真失败返回 1），靠汇总行的 `（SKIP k）` 与人读 ⚠ 提醒。要不要把 SKIP 也升级成阻断，请 TPM 定。
