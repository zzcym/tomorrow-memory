# T-02 门禁修复轮 2（收尾轮）· 开发报告

- Owner：T-02（`tools/boundaries.mjs` / `tools/exceptions.json` / `packages/shared` 契约与常量）
- 本轮唯一依据：`.delivery/04-adjudications.md` 的 **A-11**、**A-12**（及上一轮 `.delivery/04-dev-report-T-02-fix1.md` §7-①/§7-⑤/§8 的待裁决点）
- 范围：只做 **G-1 / G-2** 两件事。**未重写任何既有脚本**（`route-string-preserved` 只做"接例外通道"这一处定向改动）；**未改 `BANNED_TERMS` 词表的一个字**；**未删任何断言、未把任何规则降级为 warn、未放宽任何匹配**。
- 触碰文件（严格在授权白名单内）：`tools/boundaries.mjs`、`tools/exceptions.json`、`packages/shared/src/constants/copy.ts`、`packages/shared/test/contracts.spec.ts`。`notice.ts` / `errors.ts` 核对后**确认无需改动**（见 §1.4）。
- **未执行任何 git 写操作**；工作区里他人的未提交改动一律未清理、未还原。`packages/ui/**`、`apps/web/**`、`packages/server/src/db/**` 一个字未动。

## 0. 结论速览

| 项 | 裁决 | 状态 | 一句话 |
|---|---|---|---|
| G-1 | A-11 | ✅ 完成 | `helpRecoveryAnswer` 换成 A-11 定稿的**单个普通字符串字面量**，实测对 33 条禁词 **0 命中**；`--copy` 的 `packages/shared/**` 产出面清零（连 `TM_TASK=T-99` 强行让全部例外过期时也是 0） |
| G-1 连带 | A-11 | ✅ 完成 | `contracts.spec.ts` 的断言从"钉死恰好一处碰撞"**收紧**为"碰撞必须为空 + 产出面零绕扫描手段"（新增 7 类机器化判据） |
| G-1 清点 | A-6/A-7/A-11 | ✅ 已全库清点 | `join()` 类手法：产出面 **0 处**；`contracts.spec.ts` 内 2 处**相邻字面量拆写已还原**，另 2 处**证实还原即判红**故保留并给出复现证据（§3） |
| G-2 | A-12 | ✅ 完成 | `route-string-preserved` 接上 `exceptions.json` 同一套例外结构（assertion × file × term），命中清单**先真跑后登记**，存量 2 条 → 已登记未过期；`TM_TASK=T-99` 时照旧红并触发 `exceptions-expired` |

门禁红数：`--all` 从 **14/19（5 条红）** 变为 **18/19（1 条红）**。差额 4 条的来源可逐条追溯：`route-string-preserved`（本轮 G-2 登记）1 条、`copy-legacy-zero` 的 shared 半边（G-1 改文案）0→只剩 ui 半边、`css-important-budget` / `focus-ring-not-hidden` / `colors-no-hardcode` 由 **T-04 自己改代码**转绿（非本轮登记，见 §5）。词表条数（33）、各阈值、扫描面**均未变动**，`--self-test` 仍 **91/91** 兜底证明门禁没被削弱。

> **交付前复测：最后那 1 条红也被 T-04 自己改代码清掉，`--copy` / `--all` / `--self-test` / `@tm/shared test` 现已全绿（19/19，EXIT=0），无残留红点。** 真实输出见 §5.1。

---

## 1. G-1（A-11）：`helpRecoveryAnswer` 换成定稿文案，禁词表一个字不动

### 1.1 改了什么

文件：`packages/shared/src/constants/copy.ts`（`AUTH_COPY` 段，原第 458-465 行）

```ts
helpRecoveryAnswer:
  '这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。',
```

- **书写形态**：单个普通字符串字面量，键的下一行直接跟 `'…'`，再下一行就是 `,\n}` —— 无分词、无 `+` 拼接、无模板串、无 `join()`、无例外登记。脚本实测：`RENDERED` 长度 71 字符，字面量后紧跟 `",\n}"`。
- **语义未变**：① 没设过密码的老账号 → 点『注册』设密码即激活原账号、词本与进度全保留；② 已设过密码的 → 本期无法自助找回。A-11 给的定稿句式把"无法自助找回"改写成"只能等后续版本的找回方式"，去掉了与禁词 `'找回密码'` 连续重叠的那四个字，出路语义未增未减。
- **注释重写**：删掉上一轮那段"此处与禁词互斥、待 TPM 复核、注释本身也不许复述那四个字"的指代式说明，改为直接引 A-11 的裁决出处与语义口径（冲突已消解，不再需要回避措辞）。

### 1.2 对 `BANNED_TERMS` 全表的实测（不是目测）

用脚本 import `tools/boundaries.mjs` 的 `BANNED_TERMS` 真值，对渲染后的字符串常量逐条 `includes`：

```
RENDERED="这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。"
len=71
BANNED_TERMS 条数=33
BANNED_HITS=[] count=0
REVIEW_HITS=[]
下一行之后紧跟的字符=",\n}"
```

即：33/33 条禁词 **0 命中**，连"只报不红"的 4 条人工复核词也不命中。

### 1.3 测试断言的同步（方向是**收紧**，不是放松）

文件：`packages/shared/test/contracts.spec.ts`

| 位置 | 改前 | 改后 |
|---|---|---|
| `BANNED_TERM_COLLISION_KEYS` | `['helpRecoveryAnswer']`（钉死"有且仅有一处碰撞"） | `[]`（碰撞面必须为空） |
| 禁词扫描用例标题与判据 | `expect(failures).toEqual(['packages/shared/src/constants/copy.ts 含禁词 找回密码'])` | `expect(failures).toEqual([])` —— 任何一条禁词以任何形态再现都立刻红 |
| 渲染面 | `hitLiterals` 必须等于碰撞清单（1 条） | `expect([...hitLiterals].sort()).toEqual([])` |
| `helpRecoveryAnswer` 值 | `toContain('找回密码')` | `toBe(HELP_RECOVERY_ANSWER_FINAL)` + 一条"源码里必须以连续单字面量原样存在"的 `toContain` 正例校验 |
| 词表抽样 | 7 条 spotCheck | 9 条（补 `'忘记密码'`、`'本期无法找回'`）；`toHaveLength(33)` 未动 |
| 零绕扫描 | 只查 `const join` 与裸 `join('…')`（仅 copy.ts 一个文件） | **遍历 shared 全部产出文件**，7 类判据：`const join` / 裸 `join('…')` / 相邻字面量相加 / `String.raw` / `fromCharCode` / `\u00xx` 转义拼字 / 自建禁词白名单数组（`RENDER_ONLY_HITS` 一类）。检剥注释后的语句本体，避免把文档里的 `` `今天打卡` + `连续 36 天` `` 误判成拼接 |

`pnpm --filter @tm/shared test` → **37/37 通过**（用例总数不变；把上一轮"承认这是红的"换成"要求它为 0"）。

### 1.4 `notice.ts` / `errors.ts` 的同源核对（结论：无需改动）

- 全库 grep `helpRecoveryAnswer` 的引用点：只有 `copy.ts` 的定义 + `contracts.spec.ts` 的断言 + `.delivery/**` 文档。`packages/ui/**`、`apps/web/**` **没有任何消费者引用它**（grep 实证），所以不存在"改了文案要同步改调用方"的情况。
- `notice.ts:36-40`（`activationOutcomeNotice`）、`notice.ts:48`、`errors.ts:104`（`NO_PASSWORD_ACCOUNT`）讲的是同一件业务事实（设密码即激活原账号、词本与进度保留），但**都不是这条文案的副本**，是各自独立的定稿条目，本来就禁词 0 命中 → 按 UI §6 preamble"单一源、不得复制"的规则，**不并入、不改写**。
- `src/copy.ts` 垫片（A-8）仍只做 re-export，`contracts.spec.ts` 那条专项断言继续守住。

---

## 2. G-2（A-12）：`route-string-preserved` 接上例外通道

### 2.1 先真跑，拿到真实命中清单（登记之前）

`node tools/boundaries.mjs --routes --json`（`cursor=T-02`，此时白名单里**还没有**任何 route 条目 → 这就是裸命中面）：

```
RED  route-string-preserved     旧接口路径消失：/api/auth/login, /api/auth/register；锚点 packages/server/src/routes/auth.ts:54 | packages/server/src/routes/auth.ts:26（例外豁免 0 处）
      packages/server/src/routes/auth.ts:54  /api/auth/login 已从 routes/** 消失（锚点 …现存最近实现 /api/login
      packages/server/src/routes/auth.ts:26  /api/auth/register 已从 routes/** 消失（锚点 …现存最近实现 /api/se
```

两个锚点行的真实内容（`sed -n '26p;54p' packages/server/src/routes/auth.ts` 复核）：

- `:26` → `r.post('/api/send-code', async (c) => {`
- `:54` → `r.post('/api/login', async (c) => {`

### 2.2 脚本侧改了什么（`tools/boundaries.mjs`，只动这一处）

1. `required` 清单**原样保留 8 条**（不删路径、不改 `src.includes(p)` 的匹配口径、`enforce_from: 'T-08'` 不提前放行、不降 warn）。
2. 新增一个模块级纯函数 `routeAnchorFor(missingPath, files, scopeRoot)`：把"某条路径消失了"这种原本 `hits: []` 的聚合结论，落成**可被 exceptions.json 按规则 × 文件登记的真实命中行**。锚点选取规则（全部只在 `packages/server/src/routes/**` 真实存在的文件与行里量）：
   - 路径里除 `api` 外的任一分段与模块文件名相同 → 只在该模块内找（`/api/auth/*` → `auth.ts`）；
   - 行 = 池内"与消失路径共有分段最多"的 `/api/...` 字面量所在行（并列取最先出现者）→ login 命中 `:54`（与 `/api/login` 同名末段），register 因全池无共有分段而退到最先出现的 `:26`；
   - 池内没有任何路径字面量时退回该池首个文件的第 1 行（仍是真实文件，可被逐文件例外登记）。
3. 命中走 `filterExceptionHits('route-string-preserved', hits, ctx)` —— 与其它断言**同一个**函数、同一份 `exceptions.json`、同一套"过期例外仍存在即红"。绿态 `hits: exempted`、红态 `hits: kept`，因此过期时会带上 `expiredException` 标记并被 `exceptions-expired` 规则咬住。

### 2.3 登记了什么（`tools/exceptions.json`，新增 2 条，总数 27 → 29）

| id | assertion | file | term | owner | expires_after |
|---|---|---|---|---|---|
| `legacy-auth-route-login-compat` | `route-string-preserved` | `^packages/server/src/routes/auth\.ts$` | `/api/auth/login` | T-07 | **T-12** |
| `legacy-auth-route-register-compat` | `route-string-preserved` | `^packages/server/src/routes/auth\.ts$` | `/api/auth/register` | T-07 | **T-12** |

- 粒度 = **assertion × file × term**，比 A-10 要求的"规则 × 文件"还细一档（`exceptions.json` 的 `filterExceptionHits` 支持可选 `term`，实测有效，见 §2.4 第三条）。
- `expires_after` 取 A-10 表第 3 行（"路由字面量 → T-12 / T-15 / T-16"）里**最早**的那个值 **T-12**，即"不宽于裁决的最严取法"；两条同值。
- `owner=T-07` 不是猜的：`tools/ownership.json` 的 `per_file` 明记 `packages/server/src/routes/auth.ts → T-07`（§10.3）。真正的清零动作是 T-08 的旧接口兼容层，已在 `reason` 里写明。
- 每条带 `reason`（含"该路径在本仓库从未存在过"的事实与实注册路径清单）+ `evidence`（指向 §2.1 的实测命令与命中行）。
- 未新增任何目录级通配；`exceptions.json` 的 `$changelog` 追加了本轮说明。

### 2.4 三条方向性实测（证明是"接线"不是"改弱"）

```
$ node tools/boundaries.mjs --routes
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）
1/1 条通过，全绿

$ TM_TASK=T-99 node tools/boundaries.mjs --routes           ← 同一份命中，只是让例外过期
RED  route-string-preserved     旧接口路径消失：/api/auth/login, /api/auth/register；锚点 …auth.ts:54(例外 legacy-auth-route-login-compat 已过期) | …auth.ts:26(例外 legacy-auth-route-register-compat 已过期)（例外豁免 0 处）
RED  exceptions-expired         有命中落在 expires_after 已过期的例外范围内：packages/server/src/routes/auth.ts:54[legacy-auth-route-login-compat] packages/server/src/routes/auth.ts:26[legacy-auth-route-register-compat]
0/2 条通过，2 条红
```

第三条：拿一个**只注册了 `/api/login`** 的合成 routes 目录跑 `--routes --root`，让 8 条清单里 8 条都消失，验证白名单**不会顺手把同文件的其它路径也放过**：

```
status=red
detail=旧接口路径消失：/api/review/today, /api/wordbook, /api/profile, /api/checkin, /api/lookup, /api/chat；锚点 packages/server/src/routes/auth.ts:2 …（例外豁免 2 处）
  kept-hit  term=/api/review/today @ packages/server/src/routes/auth.ts:2
  kept-hit  term=/api/wordbook     @ …   （共 6 条 kept）
```

→ 只有登记了 `term` 的那 2 条被豁免，其余 6 条照旧红。（该实验在系统临时目录里跑，未在仓库内留下任何文件。）

---

## 3. "绕扫描"手法的全库清点结果（`join(` / 相邻字面量 / `String.raw` / 变量拼禁词）

扫描面：`apps/{web,app}/src`、`packages/{shared,ui,server,agent}`（含 `test/`）、`tools/`、`scripts/`、`mobile-memory/`；排除 `node_modules`、`dist`、`.next`、`build`。

| # | 位置 | 形态 | 判定 | 本轮动作 |
|---|---|---|---|---|
| 1 | `packages/shared/src/constants/copy.ts`（原 `join()` 助手 + 2 处调用） | `join('…','…')` 拼文案 | A-6/A-7 已删；本轮复核产出面 `const join` / 裸 `join('…')` **0 处** | 已在 fix1 删除；本轮把"零绕扫描"升级为遍历全部 shared 产出文件的 7 类断言（§1.3） |
| 2 | `packages/shared/test/contracts.spec.ts:647`（改前行号） | `expect(...).toBe('使' + '用' + '验证码登录')` | **可还原**。A-7 之后定稿标签不再命中任何禁词，拆写早已失去唯一理由 | ✅ **已还原**为连续字面量 |
| 3 | `packages/shared/test/contracts.spec.ts:649`（改前行号） | `'本期还没有找回' + '密码的方式。…'` | **可还原**。A-11 新文案禁词 0 命中 | ✅ **已还原**为连续字面量（且新增"源码里必须原样连续存在"的正例校验） |
| 4 | `packages/shared/test/contracts.spec.ts:192` | `'password' + 'Upgrade' + 'Deadline'`（禁词表条目） | **不可还原**（还原即判红，见下方实测）。且它不是界面文案禁词，是被硬零门禁的**已作废键名**；测试持有词表就必须能写出这个词 | ⛔ 保留，注释里写明理由与复现口径 |
| 5 | `packages/shared/test/contracts.spec.ts:713` | `['password' + 'UpgradeEnforce']: 'on'`（计算键） | **不可安全还原**（还原后被计成唯一读取点，见下方实测） | ⛔ 保留，注释里写明理由与复现口径 |
| 6 | `packages/server/test/db/migrations.spec.ts:411` `const join = (f) => … .join('|')` | 名字撞了 `join` | **不是绕扫描**：把 `users` 指纹字段拼成比对串的正常测试助手，参数是模板串不是禁词片段，所在面也不被任何文案禁词断言扫描（`copy-legacy-zero` 的 roots 不含 `packages/server/test`） | 未动（也不在我的可写白名单内） |
| 7 | `apps/web/src/app/(user)/assess/page.tsx:279` `String.fromCharCode(65 + i)` | `fromCharCode` | **不是绕扫描**：选项标号 A/B/C/D 的正常渲染逻辑 | 未动（T-04/T-12 面） |
| 8 | `packages/shared/src/utils.ts:58`、`packages/server/src/db/types.ts:109`、`apps/web/src/app/layout.tsx:13`、`packages/server/test/db/migrations.spec.ts:452` | 注释里的 `` `A` + `B` `` | 文档措辞，非代码拼接 | 未动；`contracts.spec.ts` 的判据按"剥注释后的语句本体"检，因此不误伤也不放过 |
| 9 | 自建禁词白名单 / 正则豁免数组（`RENDER_ONLY_HITS`、`EXEMPT_TERMS`、`ALLOWED_BANNED`、`bannedTerms()` 式过滤） | 挑出禁词再豁免 | **全库 0 处**（上一轮已删的 `RENDER_ONLY_HITS` 未回潮），并已被本轮新增的第 7 类断言盯住 | — |

### #4 / #5 "还原即红"的受控复现（不是推断）

在没有例外通道的断言面上放一个连续字面量，用 `--root` 指向系统临时目录里的一次性探针跑：

```
$ node tools/boundaries.mjs --password --root <临时探针目录>
RED  deadline-key-zero          1 处命中：packages/shared/test/probe.ts:1
OK   enforce-flag-single-read   引用点 1 个：packages/shared/test/probe.ts:2
2/3 条通过，1 条红
```

- **#4**：`deadline-key-zero` 是 `noExceptions: true` 的硬零断言，扫描根含 `packages`，写成连续字面量 → 立即红。要还原只能"把 `test/**` 从扫描面摘掉"或"给它开例外"，两者都是**反向改门禁**，本轮铁律禁止 → 保留拆写。
- **#5**：`enforce-flag-single-read` 是**计数型**断言（全库恰好 1 个引用点 = T-07 的 `auth-service.issueTokens`）。连续字面量会让它当场报"引用点 1 个：packages/shared/test/contracts.spec.ts" —— 测试文件**冒充**唯一合法读取点，等 T-07 真接线时又撑成 2 处变红。保留计算键。
- 两条彻底清掉的正解（写进 §6 待裁决）：由 T-01/TPM 决定"清单文件（词表/期望表）是否划出计数面"，或把门禁词表的单一源改成可被 shared 侧读取的形态。

---

## 4. 冒烟真实输出（原样粘贴，末次快照）

```
$ pnpm --filter @tm/shared test
 RUN  v3.2.7 E:/CC/tomorrow-memory/packages/shared
 ✓ test/contracts.spec.ts (37 tests) 91ms
 Test Files  1 passed (1)
      Tests  37 passed (37)
EXIT=0

$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit
EXIT=0

$ node tools/boundaries.mjs --copy
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
RED  copy-legacy-zero           1 处命中：packages/ui/src/hooks/use-recent-searches.ts:5；需人工复核词命中 94 处（不判红，UI §8.2-9 明示由走查确认）
0/1 条通过，1 条红
EXIT=1

$ node tools/boundaries.mjs --all
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
RED  copy-legacy-zero           1 处命中：packages/ui/src/hooks/use-recent-searches.ts:5；需人工复核词命中 94 处（不判红，UI §8.2-9 明示由走查确认）
OK   deadline-key-zero          0 命中
OK   enforce-flag-single-read   引用点 0 个 —— 待 T-07 接线（上限=1 已生效）
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   migration-forbidden        0 命中（扫描 16 个文件；例外豁免 0 处）
OK   migration-down-declared    8 个迁移全部声明 down() 或 noDownReason
OK   tokens-single-source       4 处定义全部在 tokens.css
OK   globals-css-no-brand-hex   0 命中（扫描 apps/web/src；例外豁免 0 处）
OK   colors-no-hardcode         白名单内 8 处，其余 0 命中；例外豁免 60 处
OK   colors-purple-retired      白名单内 0 处，其余 0 命中；例外豁免 2 处
OK   colors-tailwind-palette    0 命中（扫描 apps, packages；例外豁免 11 处）
OK   css-important-budget       !important 1 处（预算 1，且合规）
OK   focus-ring-not-hidden      0 命中（扫描 apps, packages；例外豁免 0 处）
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）
18/19 条通过，1 条红
EXIT=1

$ node tools/boundaries.mjs --self-test（末 4 行 + 本轮相关行原样）
OK   覆盖 route-string-preserved — 红用例 1 / 绿用例 1（各需 ≥1）
OK   route-string-preserved @T-08 violations/route-deleted 期望 red — 实际 red：旧接口路径消失：/api/auth/register, /api/review/today, /api/wordbook, /api/profile, /api/checkin, /api/lookup, /api/chat；锚点 packages/server/src/routes/auth.ts:1 …（例外豁免 0 处）
OK   route-string-preserved @T-08 clean 期望 green — 实际 green：旧路径清单 8 条全部在册
OK   exceptions.json 结构合法（每条都有 owner + expires_after=T-NN）
OK   例外过期机制：cursor≥expires_after 时同一违规重新计红 — 例外 legacy-review-routes-import-agent：cursor=T-10 时 15 红；cursor=T-02 时 0 红
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (246 modules, 478 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）
boundaries --self-test：91/91 通过
EXIT=0

$ pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs
✔ no dependency violations found (246 modules, 478 dependencies cruised)
EXIT=0
```

**判据逐条对照**：

| 判据 | 结果 |
|---|---|
| `--copy` 的 shared 产出面 0 命中 | ✅ `packages/shared/**` 命中数 = 0；连 `TM_TASK=T-99`（全部例外强行过期）实测也是 `其中 packages/shared/** = 0`（同一命令下 68 处命中分布在 24 个文件里，无一在 shared） |
| 且不含任何绕扫描手段 | ✅ 产出面 7 类判据全绿（§3 表 #1/#9），且被 `contracts.spec.ts` 钉成回归判据 |
| `--all` 的 `route-string-preserved` 从"恒红"变为"已登记例外（未过期）" | ✅ `OK … 全部在已登记例外内（未过期，例外豁免 2 处）`；`--self-test` 的红/绿两个方向仍分别 red/green |
| `--self-test` 仍全绿 | ✅ **91/91**（上一轮同为 91/91，用例数未增减 —— 说明本轮既没靠删用例凑绿，也没削弱探测器） |

---

## 5. 仍未清零的红（1 条，不在本轮范围）

`copy-legacy-zero` — `packages/ui/src/hooks/use-recent-searches.ts:5`（注释里的 `云端` 命中禁词）。
责任 **T-04**，文件不在我的可写白名单内（`packages/ui/**` 此刻另有 agent 在改），**未登记、未动、未替它修**。上一轮报告 §7-② 已记录同一处，口径不变。

与上一轮对比后**已消失**的红，来源逐一说明（没有一条是放宽规则造成的）：

| 上一轮红点 | 现在 | 归因 |
|---|---|---|
| `copy-legacy-zero`（shared 半边 `copy.ts:465`） | 已清 | **本轮 G-1（A-11 改文案）** |
| `route-string-preserved` | 已登记例外 | **本轮 G-2（A-12 接线）** |
| `css-important-budget`（tokens.css 3 + spec 4） | `OK !important 1 处（预算 1，且合规）` | **T-04 自己改的代码**，本轮未登记 |
| `focus-ring-not-hidden`（`packages/ui/src/primitives/button.tsx:9` 等 3 处） | `OK 0 命中` | **T-04 自己改的代码**，本轮未登记 |
| `colors-no-hardcode`（`packages/ui/test/ui.spec.tsx:141`） | `OK`（白名单内 8 处，另 60 处按 fix1 的存量登记豁免） | 上半 **T-04 自己改的代码** |
| `pnpm -r typecheck`（`packages/server/src/scripts/migrate.ts` TS1109、`apps/web` 透传的 TS2344） | `EXIT=0`，6 包全 Done | **T-06 自己改的代码**，与本轮无关，仅如实记录 |

### 5.1 收尾复测（本报告写完后又跑了一遍，原样粘贴）

上面 §4 的 `--all` 输出是**我改完时的真实快照**（当时 `EXIT=1`，唯一红点即本节那条 `packages/ui/**`）。本轮临交付前复跑，那一条已被 **T-04 自己改代码**清掉（该文件不在我的可写白名单，我一个字未动、也未登记），门禁转为全绿：

```
$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 67 处）；需人工复核词命中 94 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
EXIT=0

$ node tools/boundaries.mjs --all
OK   route-string-preserved     消失 2 条：/api/auth/login, /api/auth/register —— 全部在已登记例外内（未过期，例外豁免 2 处）
19/19 条通过，全绿
EXIT=0

$ node tools/boundaries.mjs --self-test
boundaries --self-test：91/91 通过
EXIT=0

$ pnpm --filter @tm/shared test
Test Files  1 passed (1)
      Tests  37 passed (37)
EXIT=0
```

**即：本轮结束时 `--copy` / `--all` / `--self-test` / `@tm/shared test` 全绿，无残留红点。** 转绿是别人改代码的结果，不是本轮放宽规则的结果——`--self-test` 仍 **91/91**（用例数与上一轮相同，未删未减）就是这一点的证据。禁词表 33 条、各阈值、扫描面自始至终未动。

---

## 6. 待裁决 / 给下一棒的提示

1. **`expires_after` 与 owner 的张力（本轮唯一一处需要 TPM 复核的取值判断）**：A-10 表第 3 行把"路由字面量"的命中面写成 `apps/web` 既有页面、到期 `T-12 / T-15 / T-16`；而 `route-string-preserved` 实测命中在 `packages/server/src/routes/auth.ts`（§10.3 归 T-07），真正能清掉它的是 T-08 的旧接口兼容层。本轮按指示取该行的**最早值 T-12**（不宽于裁决），owner 取实测文件归属 T-07，并把它记在两条 `reason` 里。若 TPM 认为应当指向 T-08，只需改这两条的 `expires_after`（规则与命中面无需再动）。
2. **`/api/auth/*` 两条路径在本仓库从未存在**（首轮 T-02 报告第 5 条 → fix1 §7-⑤ → A-12 的同一事实）。例外只把"红"变成"到期会咬人的登记"，**没有**把清单改成现状 18 条。要么 T-08 落兼容层让这两条真实存在，要么由 TPM 裁决换清单（换清单要同时改 `tools/fixtures/selftest/violations/route-deleted` 与 `clean` 两处 fixture，属规则变更，本轮不做）。
3. **`contracts.spec.ts` 剩余 2 处计算键/拆写**（§3 #4/#5）：需要 T-01/TPM 决定"清单型文件是否划出计数面/硬零面"才能彻底去掉；本轮按"不反向改门禁"的铁律保留，并留下受控复现证据。
4. `routeAnchorFor` 的锚点是**展示与登记用的落点**，不是判定依据（判定仍是 `src.includes(p)`）。T-08 落兼容层后，若 `/api/auth/login` 出现在 `routes/auth.ts` 之外的新文件（例如 `routes/auth-compat.ts`），命中自然消失、两条例外会变 stale，由脚本按既有语义提示删除即可。
5. 批次 1 出口口径（A-5 / §10.1：`pnpm -r typecheck && pnpm ddl-parity && pnpm depcruise`）实测：typecheck **EXIT=0**（6 包全 Done）、`ddl-parity --self-test` 26/26（SKIP 0）、`pnpm depcruise` **EXIT=0**。
