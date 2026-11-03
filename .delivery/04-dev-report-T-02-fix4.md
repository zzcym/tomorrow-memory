# T-02 门禁修复轮 4 · 开发报告（还两处工具欠账：`--dist` 落地 + `ownership.json` 补登记）

- Owner：T-02（`tools/boundaries.mjs` / `tools/ownership.json` / `tools/fixtures/selftest/**`）
- 本轮唯一依据：`.delivery/04-adjudications.md` **A-24**（两项全做），旁证 A-19（`materialize` 已由同事修好，本轮**一字未动**）、A-12/A-10（例外通道与"不许加例外"口径）、A-24-2 引用的 §10.2 T-05/T-14 可写清单；对照物 `.delivery/04-dev-report-T-14.md` 里 T-14 自建的构建期插件 `tm-app:dist-guard`。
- 范围：只做 **W-1 / W-2**。**未重构 `tools/boundaries.mjs` 的任何既有检查**（既有 19 条断言的 `run` 函数体、词表、阈值、扫描面一字未动）；**未放宽任何规则**、未降级为 warn、未新增任何例外；`tools/exceptions.json` **本轮没有被打开过**（mtime `09-19 17:14`，早于本轮全部改动）。
- 触碰文件（严格在授权白名单内）：
  - `tools/boundaries.mjs`（1554 → 1920 行，净增 366 行）
  - `tools/ownership.json`（64 → 69 条，**只做插入**）
  - `tools/fixtures/selftest/**` 新增 6 个产物 fixture（脏 3 + 净 3，见 §1.5）
  - 本报告 `.delivery/04-dev-report-T-02-fix4.md`
- **未执行任何 git 写操作**（无 commit/push/stash/checkout/reset/clean）；工作区他人的未提交改动一律未清理、未还原。
- **`packages/**`、`apps/**` 一个字未动**（两个并行 agent 在改 ui 与 shared）。mtime 佐证：`apps/app/vite.config.ts` 停在 `17:22`（T-14 的产物）、`.dependency-cruiser.cjs` 停在 `17:30`（A-19 的 `materialize` 修复），本轮结束仍在原时间戳。

## 0. 结论速览

| 项 | 裁决 | 状态 | 一句话 |
|---|---|---|---|
| W-1 | A-24-1 | ✅ 完成 | `--dist` 从"从来没实现、落进 help"变成注册表第 **20** 条断言 `dist-artifact-portability`：扫目录下全部 `*.js/*.mjs/*.cjs/*.css/*.html/*.htm`，判据①（`/` 开头资源路径）+判据②（Chrome84 之后的 API）逐条打印 `文件:行/偏移 + 命中串`，红则退出码 1；红/绿 fixture 已进 `--self-test`，`--list` 19→20 |
| W-1 口径 | A-24-1「谁也不许更松」 | ✅ 机械可核对 | `tm-app:dist-guard` 的 **10 条正则逐字符抄录**进 `--dist` 清单，覆盖面只朝更严方向加宽（①也扫 js、②也扫 html/css），另加 1 条 dist-guard 没有的"引号包住根路径资源串"；`--self-test` 有一条**现读 `apps/app/vite.config.ts`** 的比对，dist-guard ⊄ `--dist` 即 FAIL，所以"更松"无法靠改注释蒙过去 |
| W-2 ① | A-24-2 | ✅ 已在册（核对后**不重复登记**） | `packages/ui/src/patterns/format.ts → owner=T-05` 这条**上一轮就已落盘**（表内唯一一条，reason 直指 §10.2 T-05 可写清单偏差 D-3）。本轮实测：`TM_TASK=T-14` 碰它 → 红；`TM_TASK=T-05` 碰它 → 绿。故未新增条目（新增就是重复条目，最具体匹配会二义） |
| W-2 ② | A-24-2 | ✅ 完成 | `apps/app/**` 现状缺口 **13 个文件**（改动前 13/13 全部 `no-entry`）→ 5 条新条目、`owner=T-14`；格式与既有条目完全同构（`path`/`owner`/`reason`，无 `readers` 时按默认） |
| 既有条目 / cursor | 铁律 | ✅ 未动 | `ownership.json` 其余 64 条与 `$comment`/`source`/`tasks`/`unowned_but_guarded` 四段一字未改；`tools/exceptions.json` 的 `gate_cursor: T-02` 未被触碰（文件本轮未打开） |

冒烟（全部真跑，原样输出见 §3）：`--self-test` **100/100 退出码 0**（本轮前 94/94，+6 全来自 W-1）；`--dist apps/app/dist` **全绿**；脏产物 fixture **21 处命中红，退出码 1**；`--list` **20 条**；`--all` **18/20、2 条红 = 与本轮无关的 2 条既有红**（未新增红）；`--check-ownership` 13 个新登记文件 **无越界**；`pnpm depcruise` **✔ 309 modules / 736 dependencies，退出码 0**。

---

## 1. W-1（A-24-1）：`--dist` 产物门禁落地

### 1.1 判据清单与口径来源（`tools/boundaries.mjs` 第 258-329 行）

`--dist` 的检查**不是新写一套**，而是把 `apps/app/vite.config.ts` 里 T-14 自建的 `tm-app:dist-guard` 的清单逐字符搬过来（正则字面量原文照抄，§1.4 的自检按 `.source` 字符串机械比对，改一个字就红）：

| 判据 | dist-guard 条目（`vite.config.ts` 行号） | `--dist` 条目（`boundaries.mjs` 行号） | 正则 `.source` 是否同源 |
|---|---|---|---|
| ① 无 `/` 开头资源路径 | `ROOT_RELATIVE_ASSET_REFS[0]` `src="/…" 属性`（L130） | `DIST_ASSET_RULES[0]`（L272） | 是 `/(?:src\|href)\s*=\s*["']\//g` |
| ① | `ROOT_RELATIVE_ASSET_REFS[1]` `url(/…)`（L131） | `DIST_ASSET_RULES[1]`（L273） | 是 |
| ① | `ROOT_RELATIVE_ASSET_REFS[2]` `import "/…" / from "/…"`（L132） | `DIST_ASSET_RULES[2]`（L274） | 是 |
| ① | —（dist-guard 无此条） | `DIST_ASSET_RULES[3]` `"/…css" 根路径资源串`（L275） | **增量，只朝更严** |
| ② 无 Chrome84 之后的 API | `BANNED_APIS[0]` `structuredClone`（L58） | `DIST_BANNED_APIS[0]`（L279） | 是 |
| ② | `BANNED_APIS[1]` `Object.hasOwn`（L59） | `DIST_BANNED_APIS[1]`（L280） | 是 |
| ② | `BANNED_APIS[2]` `requestIdleCallback`（L60） | `DIST_BANNED_APIS[2]`（L281） | 是 |
| ② `.at` 归因 | `ANY_AT_CALL`/`ARRAY_PROTO_AT`/`AT_FEATURE_GUARD`/`OWN_AT_METHOD`/`IDENT_CHAR`（L65-70） | 同名 5 个常量（L284-288） | 是（逐字符） |
| ② `.at` 反永真自检 | `AT_RULE_SELF_TEST` 7 行（L106-114） | `AT_RULE_SELF_TEST` 7 行（L317-325） | 同表同序 |

`Array.prototype.at`（Chrome 92）也走"归因"两条放行：`this.at(…)` + 同文件自有 `at(i){}` 方法 → 放行；`Array.prototype.at` + 同文件有 `"at" in Array.prototype` 特性探测 → 放行；其余一律红。放行条件与 dist-guard 完全一致（不是加例外名单，是同类不同物）。

### 1.2 「谁也不许更松」如何做到可机械核对

1. **覆盖面加宽**：dist-guard 的 `closeBundle()` 把判据① 只施加到 `/\.(html|css)$/`（L156）、判据② 只施加到 `/\.(js|mjs)$/`（L168）。`--dist` 对**全部产物文件同时跑两组检查**（`scanDistFile`，L369-395）。
2. **多一条正则**：`DIST_ASSET_RULES[3]` 抓引号包住的根路径资源串（`"/assets/x.css"` 这类被 JS/CSS 动态注入的路径，dist-guard 三条都不覆盖）。它的扩展名白名单刻意收窄（js/mjs/css/html/json/svg/png/jpg/jpeg/webp/gif/ico/woff/woff2/ttf/map），**SPA 路由串 `"/study"` 不算资源、不误伤** —— 真 bundle 上实测 0 命中（§3.2）。
3. **反向咬人的自检**（`distGuardParity()`，L1676-1728）：`--self-test` 现读 `apps/app/vite.config.ts`，逐行抠 `BANNED_APIS`/`ROOT_RELATIVE_ASSET_REFS` 的数组条目与 4 个 `.at` 常量，要求 **dist-guard 每一条正则的 `.source` 都在 `--dist` 清单里**。三种情况一律 FAIL：对照文件读不到（dist-guard 被删/改名）、有条目抠不出来（改名/换写法）、抠到的正则不在 `--dist` 清单里（更松）。增量条数在 detail 里显式报出来，不藏。
4. **命中格式也有反永真断言**（`distHitShapeCheck()`，L1731-1746）：重跑脏 fixture，要求判红 + 每一处命中都带 `file/line/offset/text` 四要素 + term 里必须有 `structuredClone`，防止"红了但打不出位置"这种没法修的红。

### 1.3 行为与退出码

- `node tools/boundaries.mjs --dist <dir>[,<dir>… | 多次 --dist]`：递归扫目录，`DIST_EXT = /\.(js|mjs|cjs|css|html|htm)$/i`，只跳 `node_modules`/`.git`（**故意不用** `DEFAULT_SKIP`，否则 `dist/` 自己被摘掉，L328-329）。
- 全绿 → `OK dist-artifact-portability …` + 退出码 0；有命中 → `RED …（判据① N / 判据② M）` + 「命中清单（文件:行/偏移 + 命中串）」逐条打印（上限 40 条）+ 退出码 1；`--json` 支持。
- **目录不存在 = 前置缺失，不是绿**：显式 `--dist` 指定却不存在的目录，打印 RED 并给**退出码 2**（用法/前置缺失档），提示"先跑 `pnpm --filter @tm/app build`"。这是本轮补的一个窄口子：初版按 cursor 分级（`T-02 < enforce_from=T-14`）会把它报成"green（待 build）"，等于冒烟命令在产物缺失时假绿。注册表里的断言（`--all`）仍保留按游标分级的行为，两者不冲突。
- 命中定位用 `lineOffsets` + 二分（`positionOf`，L335-349），470KB 单行 bundle（真产物 `assets/index-BVHI6t_J.js`）不退化。

### 1.4 注册表与 CLI 接线

- 第 20 条断言（L892-898）：`id: dist-artifact-portability`、`enforce_from: T-14`、`noExceptions: true`（**不留例外通道**，与 A-24-1"等效证明已经做过、欠账要还"的语义一致：产物不可移植不能靠白名单放行）、`roots: ['apps/app/dist']`。
- `ACCEPTED_FLAGS` 加 `--dist`；`opts.distDirs`；缺目录时给用法+帮助并退出码 2；`HELP` 增 `--dist DIR` 段；`--all` 的 `MODES['--all']` 由 `ASSERTIONS.map(a=>a.id)` 自动含新条目。
- 一处**用法断裂的微修**（不属于判定变更）：`--check-ownership` 原来强制要 `--task`，而 §10.2/本轮冒烟命令的字面写法是 `TM_TASK=T-14 node tools/boundaries.mjs --check-ownership …`，照抄会拿到退出码 2。现补一行 `if (!opts.task && process.env.TM_TASK) opts.task = process.env.TM_TASK.trim()`（L1393）。**刻意不回落 `gate_cursor`** —— 那是门禁游标不是当前任务，拿它当任务号会把没设任务号的调用误判成 T-02；所以任务号真正缺失时仍退出码 2。HELP 里 `--check-ownership` 一行同步写成"配 `--task T-XX` 或 env `TM_TASK`"。

### 1.5 fixture（`tools/fixtures/selftest/**`，沿用"fixture 路径镜像真实路径"的既有约定）

脏：`violations/dist-artifacts/apps/app/dist/`
- `index.html`：`src="/assets/broken.js"`、`href="/assets/broken.css"`、内联 `url(/assets/bg-missing.png)`、`import('/assets/lazy-broken.js')`
- `assets/broken.js`：`structuredClone(`、`Object.hasOwn(`、`requestIdleCallback`、`[1,2,3].at(-1)`、`Array.prototype.at.call(`、`'/assets/extra-root-relative.css'`
- `assets/broken.css`：3 处根路径 `url(...)` + 1 条相对路径对照行（证明不误伤）

净：`clean/apps/app/dist/`
- `index.html`：全部 `./assets/…`
- `assets/app-clean.js`：`class{at(i){…} m(){return this.at(i)}}` 的放行组合、`"at" in Array.prototype` 特性探测后的 `Array.prototype.at.call`、`hasOwnProperty.call`，以及 SPA 路由串 `'/study'` 等（证明第 4 条增量正则不误伤）
- `assets/app-clean.css`：只有相对 `url()`

注册用例 2 条（L1485-1486）：`dist-artifact-portability` @T-14 脏 → 期望 red、clean → 期望 green；加上覆盖清点行与 §1.2 的 3 条 A-24-1 定向行，`--self-test` 从 94/94 变 **100/100**。

---

## 2. W-2（A-24-2）：`tools/ownership.json` 补两条归属

### 2.1 `packages/ui/src/patterns/format.ts → owner=T-05`：核对后确认**已在册，未重复登记**

表内该路径**唯一一条**（`node -e` 计数：`patterns/format.ts` 匹配条目 = 1），reason 已写明"§10.2 T-05 可写清单原文只列 14 个 `.tsx` + README.md + 测试，未列本文件（T-05 报告 §8 偏差 D-3）；TPM 裁决补登记归 T-05"。本轮行为实测（§3.5）：

- `TM_TASK=T-14` 碰 `format.ts` → **红**（由 T-05 独占）
- `TM_TASK=T-05` 碰 `format.ts` → **绿**（无越界）

若再插一条就成了重复条目，`matchOwnership` 按"最具体优先"排序时会出现二义，且两条 reason 会互相打脸，所以**只做核对与取证，不做写入**。

### 2.2 `apps/app/**` 现状缺口 → `owner=T-14`：5 条新条目覆盖 13 个无主文件

改动前的缺口用纯函数 `matchOwnership` 实测（不写文件、不改表，把本轮新增的 5 条从内存里剔掉后逐文件比对）：

```
apps/app/index.html               | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/postcss.config.js        | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/tailwind.config.ts       | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/vite.config.ts           | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/src/main.tsx             | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/src/native/bridge.ts     | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/src/native/launch-focus.ts | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/src/native/speak.ts      | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/src/styles/app.css       | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/test/offline-queue.spec.ts | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/test/rest-fetcher.spec.ts  | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/test/router.spec.tsx       | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
apps/app/test/startup.spec.ts       | 加条目前命中 0 | 加条目后命中 1 -> owner T-14
no-entry(改前): 13 / 13
```

（`no-entry` 在 `--check-ownership` 里是 NOTE、不阻断 —— 正因如此这个缺口一直是"静默无主"，任何任务碰这些文件都不会被咬。补登记后它们才真正有人守。）

新增的 5 条（插在既有 `apps/app/src/screens/**` 之后、`apps/web/src/app/layout.tsx` 之前，字段与既有条目同构）：

| `path` | `owner` | reason 锚点 |
|---|---|---|
| `apps/app/{index.html,vite.config.ts,postcss.config.js,tailwind.config.ts}` | T-14 | A-24-2 + §10.2 T-14 可写清单的构建配置四件；`base:'./'` 与 `dist-guard` 都在 `vite.config.ts`，改它等于改产物门禁 |
| `apps/app/src/main.tsx` | T-14 | A-24-2 + §10.2（入口挂载/`file://` 启动序） |
| `apps/app/src/native/**` | T-14 | §10.2 T-14 🆕 `{bridge.ts,speak.ts,launch-focus.ts}`；并注明 T-20 只按 `window.__app/__router` 契约只读消费，要改得向 TPM 申请 |
| `apps/app/src/styles/app.css` | T-14 | §10.2 T-14 🆕 样式入口（与 `--colors` 判据相关，红点归属要能落到具体任务，见 §4） |
| `apps/app/test/{rest-fetcher,offline-queue,startup,router}.spec.{ts,tsx}` | T-14 | §10.2 T-14 测试清单 + A-15/A-22(b) 的"测试与实现同 owner" |

既有 6 个 `apps/app` 条目（`package.json`/`tsconfig.json`/`src/router.tsx`/`src/host.tsx`/`src/shell/**`/`src/data/**`/`src/screens/**`）一字未改 —— 特别是 `src/screens/**` 的 `owner=T-14,T-17,T-18,T-19` 保持原样，本轮没有任何一条把既有条目的 owner 列表改写或收窄。

---

## 3. 冒烟真实输出（末次快照，逐条真跑；未做任何修饰）

### 3.1 `node tools/boundaries.mjs --self-test`

```
OK   覆盖 dist-artifact-portability — 红用例 1 / 绿用例 1（各需 ≥1）
...
OK   dist-artifact-portability @T-14 violations/dist-artifacts 期望 red — 实际 red：3 个产物文件中 21 处命中（判据① 13 / 判据② 8）：tools/fixtures/selftest/violations/dist-artifacts/apps/app/dist/assets/broken.css:1/47[url(/…) ] | …broken.css:3/106[url(/…) ] | …broken.css:6/165[url(/…) ]
OK   dist-artifact-portability @T-14 clean 期望 green — 实际 green：3 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）
...
OK   A-24-1 --dist 清单 ⊇ tm-app:dist-guard 清单（现读 vite.config.ts 逐条比对，谁也不许更松） — dist-guard 的 10 条正则全部在册（⊆ --dist 清单）；--dist 另有 1 条增量（只严不松）：["'`]\/[\w.@-][\w./@-]*\.(?:js|mjs|css|html|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map)\b〔"/…css" 根路径资源串〕
OK   A-24-1 .at 判据的反"永真"自检（与 dist-guard 的 AT_RULE_SELF_TEST 同表，红绿两侧都得有） — 7/7 判对
OK   A-24-1 脏产物 fixture 判红且命中含「文件:行/偏移 + 命中串」四要素 — 21 处命中四要素齐备，样例：apps/app/dist/assets/broken.css:1/47（第 1 行第 48 列）[判据① url(/…) ] …
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (309 modules, 736 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）

boundaries --self-test：100/100 通过
exit=0
```

本轮前是 94/94；+6 = 新断言的覆盖清点行 1 + 红/绿用例 2 + §1.2 的 A-24-1 定向行 3。既有 94 条**一条没少、一条判定没变**（含 A-19 那 3 行 `materialize` 用例，仍 OK）。完整输出：`tmp-logs/t02fix4-final-selftest.log`。

### 3.2 `node tools/boundaries.mjs --dist apps/app/dist`（已交付产物，必须绿）

```
$ node tools/boundaries.mjs --dist apps/app/dist
产物门禁 boundaries.mjs --dist —— apps/app/dist（1 个目录在册，cursor=T-02）
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）

产物门禁：全绿
exit=0
```

扫到的 4 个产物：`index.html`(3087B) / `assets/index-BVHI6t_J.js`(469953B) / `assets/index-BZqPT64y.css`(32950B) / `assets/ScreenFallback-BN5jUGvy.js`(462B)。绿是**真绿**：bundle 里 4 处 `.at(` 的 receiver 全是 `this` 且同文件有自家 `at(i){}`，`Array.prototype.at` 出现处带 `"at"in Array.prototype` 探测；第 4 条增量正则在 bundle 上 0 命中（SPA 路由串没被误伤）。从 `apps/app` 目录内跑 `node ../../tools/boundaries.mjs --dist dist` 同样全绿（cwd 回落可用）。

### 3.3 脏产物 fixture 必须红（W-1 判据①②的完整取证）

```
$ node tools/boundaries.mjs --dist tools/fixtures/selftest/violations/dist-artifacts/apps/app/dist
RED  dist-artifact-portability  3 个产物文件中 21 处命中（判据① 13 / 判据② 8）：…

命中清单（文件:行/偏移 + 命中串）：
      …/apps/app/dist/assets/broken.js:5/326（第 5 行第 13 列）[判据② structuredClone] "不是永真"。 var clone = structuredClone({ ok: true }); var has = Object.hasOwn(clone, 'ok'); …
      …/apps/app/dist/assets/broken.js:6/367（第 6 行第 11 列）[判据② Object.hasOwn] true }); var has = Object.hasOwn(clone, 'ok'); if ('at' in window) requestIdle…
      …/apps/app/dist/assets/broken.js:7/415（第 7 行第 21 列）[判据② requestIdleCallback] if ('at' in window) requestIdleCallback(function () {}); var last = [1, 2, 3].at(-1); …
      …/apps/app/dist/assets/broken.js:8/472（第 8 行第 21 列）[判据② .at(（receiver=计算表达式/字面量，无自家 at 方法）] var last = [1, 2, 3].at(-1); var first = Array.prototype.at.call(['a', 'b'], 0); …
      …/apps/app/dist/assets/broken.js:9/493（第 9 行第 13 列）[判据② Array.prototype.at（Array.prototype.at，无 "at" in Array.prototype 特性探测）] …
      …/apps/app/dist/assets/broken.js:10/545（第 10 行第 13 列）[判据① "/…css" 根路径资源串] '], 0); var sheet = '/assets/extra-root-relative.css'; export function broken() …
      …/apps/app/dist/index.html:12/448（第 12 行第 39 列）[判据① src="/…" 属性] module" crossorigin src="/assets/broken.js"></script> …
      …/apps/app/dist/index.html:16/595（第 16 行第 21 列）[判据① url(/…) ] background: url(/assets/bg-missing.png); } </style> …
      …/apps/app/dist/index.html:23/708（第 23 行第 7 列）[判据① import "/…" / from "/…"] <script> import('/assets/lazy-broken.js').then(function () {}); </script> …
      （共 21 条，其余 12 条同格式）

产物门禁：21 处命中 → 退出码 1
exit=1
```

判据② 8 处（`structuredClone` / `Object.hasOwn` / `requestIdleCallback`×2 / `.at`×2 / `Array.prototype.at`×2）、判据① 13 处（`src/href="/"` ×2、`url(/…)` ×5、`import('/…')` ×1、根路径资源串 ×5）。全量清单：`tmp-logs/t02fix4-final-dist.log`。
同一 fixture 的"干净对照组"独立跑：`--dist tools/fixtures/selftest/clean/apps/app/dist` → **全绿 exit=0**，证明上一条不是永真。

### 3.4 前置条件与用法的边界（同样真跑）

```
$ node tools/boundaries.mjs --dist apps/app/does-not-exist
RED  dist-artifact-portability  产物目录不存在：E:\CC\tomorrow-memory\apps\app\does-not-exist（待 T-14 build）

RED：--dist 指定的产物目录不存在（前置缺失，退出码 2）：…
     先跑 pnpm --filter @tm/app build 再来跑这条冒烟命令。
exit=2

$ node tools/boundaries.mjs --dist
--dist 需要跟一个产物目录：node tools/boundaries.mjs --dist apps/app/dist
（+ 用法与帮助）
exit=2
```

### 3.5 `--list` / `--check-ownership`

```
$ node tools/boundaries.mjs --list | tail -3
route-string-preserved       enforce_from=T-08   旧接口路径字符串不得被删除/改名（§6.5-1：routes/*.ts 的既有路径清单比对）
dist-artifact-portability    enforce_from=T-14   产物可移植性：dist 内无 / 开头资源路径 + 无 Chrome84 之后的 API（§10.2 T-14 判据①② / A-24-1）

共 20 条断言（§3.5 的 7 条 depcruise 规则由 .dependency-cruiser.cjs 落地）
```

```
$ TM_TASK=T-14 node tools/boundaries.mjs --check-ownership --files <本轮登记的 13 个文件，逗号分隔>
--check-ownership task=T-14 触碰 13 个文件 → 无越界
exit=0

$ TM_TASK=T-14 … --files <13 个新条目文件 + 既有 4 个已登记文件（共 17）>
--check-ownership task=T-14 触碰 17 个文件 → 无越界
exit=0

# 反证 1：T-17 碰 apps/app/src/native/bridge.ts（新 owner=T-14）→ 必须红
RED  apps/app/src/native/bridge.ts 由 T-14 独占（当前任务 T-17）— A-24-2：§10.2 T-14 可写清单 🆕apps/app/src/native/{bridge.ts,speak.ts,launch-focus.ts} 此前无条目 → 归 T-14。T-20 只按 window.__app/__router 契约与 Java 侧对齐（只读消费），要改本目录得向 TPM 申请
--check-ownership task=T-17 触碰 1 个文件 → 1 处越界
exit=1

# 反证 2：T-14 碰 packages/ui/src/patterns/format.ts（owner=T-05）→ 必须红
RED  packages/ui/src/patterns/format.ts 由 T-05 独占（当前任务 T-14）— §10.2 T-05 可写清单原文只列 14 个 .tsx + README.md + 测试，未列本文件（T-05 报告 §8 偏差 D-3）；TPM 裁决补登记归 T-05。文案桶已落 @tm/shared（RELATIVE_TIME_COPY / PROGRESS_COPY），本文件只做组件侧格式化，不得自带第二份字面量
--check-ownership task=T-14 触碰 1 个文件 → 1 处越界
exit=1

# 反证 3：T-05 碰 format.ts → 必须绿（证明反证 2 不是永真）
--check-ownership task=T-05 触碰 1 个文件 → 无越界
exit=0
```

补登记**只把"静默无主"变成"有主可咬"**，红数变化只发生在"别的任务碰这 13 个文件"这一种情况上；T-14 自己碰自己交付的文件仍然绿（exit=0）。这与 A-25 的方向一致（补登记会**减少**而不是增加 `TM_TASK=T-10` 那 30 条红的来源面 —— 那 30 条由 TPM 自己在批次3 前对齐 §10.2/§10.3，本轮不越权扩写别的清单）。

### 3.6 `pnpm depcruise`

```
$ pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (309 modules, 736 dependencies cruised)

exit=0
```

新 fixture 不会污染它：配置里 `exclude` 同时覆盖 `(^|/)(dist|…)/` 与 `^tools/fixtures/`，`tools/fixtures/selftest/{clean,violations}/…\/dist\/…` 一律不在图上；A-19 的 `materialize` 修复（`.dependency-cruiser.cjs`，mtime 17:30）**未被本轮改动，也未被改回去**。

### 3.7 完整链（TPM 给的字面命令）

`--self-test && --dist apps/app/dist && --list && --all && --check-ownership && depcruise` 的串跑：链在 `--all`（exit 1，见 §4）处停住，链前 3 段与链后 3 段分别单独真跑取证（`tmp-logs/t02fix4-chain.log`、`tmp-logs/t02fix4-final-*.log`）。`node --check tools/boundaries.mjs` → `SYNTAX_OK`。

---

## 4. `--all`：没有因本轮新增的红

```
$ node tools/boundaries.mjs --all
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
...
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
...
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）

18/20 条通过，2 条红
exit=1
```

- 分母 19→20 是本轮 W-1 注册的第 20 条；分子 17→18，**红集合完全相同**：`colors-no-hardcode`、`css-important-budget`（开工前的实测基线见 `.delivery/04-dev-report-gate-fix-A19.md` 末段 `94/94` 那次同批红）。
- 两条红的 5 个锚点全在 `packages/ui/**` 与 `apps/app/src/styles/app.css`（`--colors --verbose` 实测）：

```
RED  colors-no-hardcode         2 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：apps/app/src/styles/app.css:5 | packages/ui/src/patterns/GrowthLine.tsx:8
      apps/app/src/styles/app.css:5  * 扫 `apps/**`，hex / `rgb()` / `hsl()` 命中即红），只做两件事：
      packages/ui/src/patterns/GrowthLine.tsx:8  * 不引 `recharts`、零新依赖、零 `#RRGGBB`/`rgba()`（§8.2-1 与 §3.5 `ui-no-io`）。
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:89 | packages/ui/test/patterns.spec.tsx:691 | packages/ui/test/patterns.spec.tsx:695
```

  两条都是**别的任务在制品的代码/测试**（`apps/app` 由 T-14 交付、`packages/ui` 正被并行 agent 改），`tools/**` 锚点 0 处，本轮**没有**把任何红转绿、没有新增红，更没加例外（`exceptions.json` 未被打开）。
- 新断言自身在 `--all` 下绿，且其 `roots` 只有 `apps/app/dist`（无其它断言扫该目录，`DEFAULT_SKIP` 反而把 `dist` 从其它断言的扫描面里摘掉），因此对既有断言的命中数影响为 0。

---

## 5. 已知限制与给下一棒的提示

1. **`--dist` 的绿依赖产物存在**。CI 里若未先 build，注册表条目按游标分级（cursor<T-14 → green 待 build），显式 `--dist DIR` 则给前置红（exit 2）。批次3（T-17/T-18）照抄 §10.2 冒烟命令时，正确顺序是 `pnpm --filter @tm/app build` → `node tools/boundaries.mjs --dist apps/app/dist`。
2. **`apps/app/public/**`（若将来出现）落在两套检查的中间地带**：`--dist` 扫产物目录会看到被拷贝出来的文件，但 dist-guard 的 `closeBundle` 同样看得到，两边口径一致；真正没有判据的是 `src` 侧直引 `public` 资源写成 `/xxx` 的情况——构建期会由 `--dist` 兜住（产物里出现根路径即红），不需要新规则。**本轮按 A-24 范围没有扩写这条**，留作观察。
3. **两套清单要同源演进**：`--self-test` 的 `distGuardParity` 会在 dist-guard 侧改名/删条目/换写法时判 FAIL，但**新写一条只存在于 `--dist`、不存在于构建插件**的判据是不被拦的（那属于"更严"，方向安全）。若将来 T-14 侧扩了判据而 `--dist` 没跟，FAIL 会指向具体那条正则的 `.source`，改法就是把正则原文抄进 `DIST_ASSET_RULES`/`DIST_BANNED_APIS`。理想终态是把清单抽成单一源文件，但那要动 `apps/app/vite.config.ts`，本轮授权范围之外。
4. **prettier 报 `tools/boundaries.mjs` 未格式化 = 仓库既有漂移**，不是本轮引入：该文件与仓库内多份 `.mjs` 都跟当前 prettier 配置不一致（`pnpm format:check` 的差异跨越本轮未触碰的旧代码段）。CI 的步骤是 `pnpm lint` / `pnpm -r typecheck` / 冒烟（还是 `echo "smoke placeholder"` 的 TODO）/ `pnpm --filter @tm/web build` / 两条 docker build（`.github/workflows/ci.yml`），**不含 `format:check`**，而 eslint 的 `ignores` 里有 `**/dist/**` 与 `**/*.js`，故不阻塞。刻意没顺手格式化 —— 那会把"既有检查一字未动"这条可核对性弄丢。
5. **`--files` 的清单是单个逗号分隔参数**（`--files a,b,c`），不给引号时 shell 会把它拆成多个位置参数并触发"未知参数"退出码 2；本轮正例按逗号写法取证的。
6. 归属表新增 5 条只做"补登记"，字段只用 `path`/`owner`/`reason` 三项（与既有条目同构）；**没写 `readers`**（`tools/boundaries.mjs` 不消费该字段，它是表内的文档性说明），也没加 `per_file`/`zeroDiffFor`/`predecessorAllowedDiff` 之类的放行口子，§10.4 的跨批次交接语义不变。
7. **`colors-no-hardcode` 的 2 处命中都是"注释里自指规则"踩到的**（`app.css:5` 写了 `rgb()`/`hsl()`、`GrowthLine.tsx:8` 写了 `#RRGGBB`/`rgba()`）。这两处都是"说明文字里写了被禁的写法名"，改法应由各自 owner 换措辞（门禁不豁免注释，是刻意的：注释里的 hex 也会被复制进代码），**本轮既没动它们的文件、也没给它们登记例外**。如果 TPM 认为"注释里提规则名"该被普遍放过，那是判据层面的事（要改 `--colors` 的扫描面），得走裁决，不该由门禁 owner 单方面放宽。
8. **`--dist` 与 `--all` 目前都不在任何 CI 步骤里**（`.github/workflows/ci.yml` 只 build `@tm/web`，不 build `@tm/app`，也没有 boundaries/depcruise 步骤）。本轮授权范围只有 `tools/**`，没动 `.github/**`。建议批次3 开工前由 TPM 决定把 `pnpm --filter @tm/app build && node tools/boundaries.mjs --dist apps/app/dist` 接进 CI —— 否则产物门禁只靠人跑。
