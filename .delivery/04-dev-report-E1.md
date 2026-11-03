# 开发报告 · 批次 3 出口轮 E1（测试/门禁工具工程师 T-02）

- 任务书：`.delivery/04-adjudications.md` 的 **A-33 第一节 #4 / A-33 第三节 #9 / A-32-5 / A-30-4 / A-30-7 / A-30-8 / A-30-10 / A-28-2 / A-28-3 / A-24-1 / A-27 / A-19**
- 主战场：`tools/boundaries.mjs`、`.dependency-cruiser.cjs`、`tools/ownership.json`、`packages/shared/src/constants/**`、`.gitignore`
- 铁律遵守：**全程零 git 写操作**（只用 `git status` / `git diff` 只读取证）；未触碰并行 agent 名下文件；未在任何 `data.db` 上跑写操作
- 报告写法：按 A-31-3「报告优先级高于第 5 条判据」——**边做边追加证据**，不攒到最后

## 0. 开工前的盘面基线（真实输出，未做任何改动时）

| 命令 | 结果 |
|---|---|
| `node tools/boundaries.mjs --self-test` | **96/98 通过，2 红**：`例外过期机制：cursor≥expires_after 时同一违规重新计红 — exceptions.json 里没有 depcruise 条目可证明过期`；`A-19 前置：exceptions.json 里至少有一条 review-no-agent 例外 — 没有在用例外可测`（= A-28-2 的"活缺陷依赖"，T-10 合法修掉 review-no-agent 并删例外后必然假红） |
| `node tools/boundaries.mjs --all` | **17/20，3 红**：`enforce-flag-single-read`（13 引用点，A-32-5 我名下）、`colors-no-hardcode`（`apps/app/src/styles/app.css:5` = T-14 / `packages/ui/src/patterns/GrowthLine.tsx:8` = T-05，**非我名下、并行改动**）、`css-important-budget`（`packages/ui/src/styles/tokens.css:89` = T-04 + `packages/ui/test/patterns.spec.tsx:691,695` = T-05，**非我名下**） |
| `MODES` 表实况 | `--copy/--password/--migrations/--tokens/--colors/--ui-io/--shared-pure/--flags/--versions/--routes` 10 条，**无 `--web`**；`--dist` 不在 MODES 但 `ASSERTIONS` 里**已有** `dist-artifact-portability`（`:890-898`）+ `runDistGuard` + `distGuardParity` —— 简报的"`--dist` 是空壳"这一条**已被上一轮 T-02 fix 轮还掉**，见对账表 R-1 |

## 1. 交付清单第 1 条：`--web` 模式实装（A-30-4 / §10.2 T-12 判据⑤）

**做法**：不另写一套。把 `--ui-io` 原来内联的词表提出来分成三张，两条断言各自展开同一条 `zeroHit` 检查：

| 词表 | 内容 | 用在 |
|---|---|---|
| `IO_GLOBALS_TERMS`（共用核心，:242） | `(?<![\w$.])fetch\s*\(`、`XMLHttpRequest`、`axios` | `--ui-io` + `--web` 两侧 |
| `UI_IO_EXTRA_TERMS`（UI 专属） | `useQuery\(` | 只 `--ui-io` |
| `WEB_IO_EXTRA_TERMS`（web 专属） | `(?<![\w$.])localStorage` | 只 `--web` |

`--web` ⇒ 新断言 `web-home-transport`（:823），roots = `apps/web/src/app/(user)/page.tsx` + `apps/web/src/components/home` + `apps/web/src/lib/api`，`enforce_from: T-12`；`MODES['--web']` 已接（:1295）。

**为什么 `useQuery(` 不下放给 web**（简报没给这条，按实装修正并登记待裁决 D-1）：A-30-4 点名的三项是 `fetch(` / `XMLHttpRequest` / `localStorage`，不含 `useQuery(`；而 apps/web 的**唯一合法传输面**就是 `@/lib/trpc` 的 `trpc.x.y.useQuery(...)`（§10.2 T-12 判据⑤ 只禁"裸 fetch"）。把 `useQuery(` 并进共用核心的话，首页 `result-section.tsx:75` 那种被裁决判为合规的写法全部扫红，等于门禁要求 T-12 换成更松的写法。核心词表 ⊆ 两侧这条由 `--self-test` 的 `webTransportParity()` 机检（结构 + 逐词跑真代码 + 不对称三段），不靠注释自觉。

**真实输出（改完后）**：

```
$ node tools/boundaries.mjs --web --verbose
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

RED  web-home-transport         2 处命中：apps/web/src/components/home/result-section.tsx:12 | apps/web/src/lib/api/lookup-stream.ts:4
      apps/web/src/components/home/result-section.tsx:12  * 传输仍只有 `@/lib/trpc`（判据⑤：首页无裸 `fetch(`）。
      apps/web/src/lib/api/lookup-stream.ts:4  * 为什么单独一个文件：首页不写 `fetch(`（判据⑤ / `boundaries` 的 `ui-no-io` 同口径），

0/1 条通过，1 条红
EXIT=1

$ node tools/boundaries.mjs --ui-io
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
1/1 条通过，全绿
```

**这两条红我不消解、不加例外**（A-19「新暴露的红一个都不许偷偷加例外」）。两条都在**注释**里字面写了 `fetch(`：这正是 A-27 的同型案（被扫内容自己写了禁令词 ⇒ 改被扫的注释，不改扫描器）。文件归属 T-12，我改了会撞上我自己的 `--check-ownership`，所以按 A-27 交回 T-12：建议把 `首页无裸 fetch(` 改写为「首页无裸 HTTP 出口」（去掉紧跟左括号的 `fetch`）。已登记为待办，同时挂在 #26「内容债清偿轮 E3：… T-12 内容债」名下。**注**：这条红反过来证明 `--web` 不是空壳 —— 它在真仓库上确实咬到了东西，且咬的是 `--ui-io` 同样会咬的写法（同一条检查的证据）。

**fixture（红绿两侧，`--self-test` 第 2 段跑）**：
- `violations/web-fetch/`（`fetch(` 裸调用 → 红）、`violations/web-localstorage/`（`localStorage.setItem` → 红）
- `web-clean/`（三个被扫路径各一份，含 `trpc.wordbook.list.useQuery(` 的**合法**写法 → 必须绿；谁把 `useQuery(` 塞进核心，这条立刻转红）
- `violations/ui-usequery/`（`useQuery(` 在 packages/ui → 红，机检 UI 专属词确实带电）

## 2. 交付清单第 2 条：`--dist` 模式实装（A-24-1）

盘面实况与简报不同（对账表 R-1）：`--dist` **不是空壳** —— `dist-artifact-portability` 断言、`runDistGuard`、`resolveDistDirs`、`distHitShapeCheck`、`distGuardParity`、脏/净产物 fixture、HELP 条目全都在，是上一轮 T-02 fix 轮还掉的。剩两处真缺口，都补了：

1. `--dist` 不在 `MODES` ⇒ 裸 `--dist`（出口冒烟命令 `--web --dist` 的字面写法）退出码 2。现在 `MODES['--dist'] = ['dist-artifact-portability']`（:1297），参数解析里 `--dist` 分支移到 `MODES` 查表**之前**并带前瞻：下一个 token 不是 `--*` 就仍当 DIR（保住 T-14/T-17/T-18 冒烟命令 `--dist apps/app/dist` 的原样写法与"DIR 不存在 → 退出码 2"的前置缺失语义），否则走注册表在册目录。
2. `--dist DIR` 与其他模式同给时，DIR 分支早退把其余模式**吞掉**（`--web --dist apps/app/dist` 只查产物、不查首页 = 一次冒烟少查一条）。现在先跑同批其它模式再跑产物门禁，退出码合并（红 1 / 前置缺失 2）。

**真实输出**：

```
$ node tools/boundaries.mjs --dist
OK   dist-artifact-portability  4 个产物文件（js/css/html）：判据① 0 处以 / 开头的资源路径、判据② 0 处 Chrome84 之后的 API；与 tm-app:dist-guard 同口径且覆盖面更全（A-24-1）
1/1 条通过，全绿
EXIT=0

$ node tools/boundaries.mjs --web --dist
RED  web-home-transport         2 处命中：… （见上一条）
OK   dist-artifact-portability  4 个产物文件…
1/2 条通过，1 条红
EXIT=1

$ node tools/boundaries.mjs --dist apps/app/dist      （显式 DIR 写法未被破坏）
产物门禁 boundaries.mjs --dist —— apps/app/dist（1 个目录在册，cursor=T-02）
OK   dist-artifact-portability  4 个产物文件…
产物门禁：全绿
EXIT=0
```

`--dist` 与 `apps/app` 的 `tm-app:dist-guard` 同口径这条仍由既有的 `distGuardParity()` 机检（本轮实测：dist-guard 的 10 条正则全部在册，--dist 另有 1 条增量，只严不松）。

## 3. 交付清单第 3 条：`enforce-flag-single-read` 口径修正 + 强制疫苗（A-32-5）

**口径**：roots = `packages/server`（唯一允许读该开关的包；定义/种子处 `packages/shared/src/constants/flags.ts`、`feature-flags.ts`、`db/migrations/`、`config.ts` 由既有的 `ENFORCE_DEFINITION_FILES` 兜住）。命中先过定义表，再过新增的 `isRuntimeReadHit`：纯注释行（`NON_CODE_LINE`，与 `migration-forbidden` 同判据）+ `test/**` + `*.spec.*` + `packages/server/src/scripts/**` 一律不算读点。红绿分支不变（>1 红、=1 绿、=0 且 cursor<T-07 绿、=0 且 ≥T-07 红），detail 里把剔除了多少噪音报出来。

**真仓库读数对账（对账表 R-6）**：旧口径 13 处命中当 13 个"引用点"报 → 门禁指向不存在的入口；新口径同一批 13 处命中 = **1 个运行时读点 + 12 处噪音**（2 行反向声明注释：`src/routes/admin-flags.ts:11`、`src/services/password-policy.ts:11` ＋ 1 行取证脚本：`src/scripts/ddl-parity-runner.ts:216` ＋ 9 行测试夹具：`packages/server/test/integration/auth-hardening.spec.ts`）。唯一读点 = `packages/server/src/services/auth-service.ts:187`，与 §4.7「全库唯一读取点」的注释自述一致。

**fixture 一对（机械证明豁免名单不宽）**：
- `flag-noise/`（绿）：1 处 `src/**` 运行时读点 + 注释反向声明 + `packages/server/test/integration/*.spec.ts` 里的 2 处 + `src/scripts/` 里的 1 处 ⇒ 期望绿。
- `violations/enforce-two-reads-noise/`（红）：上面这批噪音**原样**再多一处真读点（`src/middleware/password-gate.ts`）⇒ 期望红。谁把 SKIP 名单放宽到 `src/**`，这条立刻转绿 ⇒ `--self-test` 红。

**强制疫苗（A-32-5 判据③；无疫苗即视为未修）——两步真实输出**：

```
$ cat > packages/server/src/services/e1-vaccine-tmp.ts <<'EOF'
// E1 疫苗（A-32-5 判据 / 交付清单第 3 条）：故意新增第二处运行时读点，跑完即删。
import type { FeatureFlags } from './feature-flags';

export async function e1Vaccine(flags: FeatureFlags): Promise<boolean> {
  return flags.isOn('passwordUpgradeEnforce');
}
EOF

$ node tools/boundaries.mjs --password --verbose
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根

OK   deadline-key-zero          0 命中
RED  enforce-flag-single-read   运行时读点 2 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"；口径 = 只数 packages/server/src/** 的非注释运行时读点，注释/测试/脚本 12 处噪音已按 A-32-5 剔除）：packages/server/src/services/auth-service.ts:187 | packages/server/src/services/e1-vaccine-tmp.ts:5
      packages/server/src/services/auth-service.ts:187  const enforce = await flags.isOn('passwordUpgradeEnforce');
      packages/server/src/services/e1-vaccine-tmp.ts:5  return flags.isOn('passwordUpgradeEnforce');
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
2/3 条通过，1 条红
EXIT_WITH_VACCINE=1

$ rm -f packages/server/src/services/e1-vaccine-tmp.ts
$ node tools/boundaries.mjs --password --verbose
OK   enforce-flag-single-read   运行时读点 1 个：packages/server/src/services/auth-service.ts:187（另有 12 处注释/测试/脚本命中，按 A-32-5 不计入读点）
      packages/server/src/services/auth-service.ts:187  const enforce = await flags.isOn('passwordUpgradeEnforce');
3/3 条通过，全绿
EXIT_AFTER_DELETE=0
无残留（ls packages/server/src/services/ | grep -i vaccine 为空）
```

疫苗**必红 → 删除 → 必绿**两步都拿到了，退出码 1 → 0。

## 4. 交付清单第 4 条：`--self-test` 探针去"活缺陷依赖"（A-28-2）

两条探针的真因（`tools/exceptions.json` 现存 28 条**全是 `engine=boundaries`，depcruise 条目 0 条** —— T-10 整改 `review-no-agent` 时合法删掉了最后一条，而探针的前置正是"那条例外还活着"）：

| 探针 | 旧写法 | 病 | 新写法 |
|---|---|---|---|
| `exceptionsStrictSample()` | 从 `tools/exceptions.json` 里 `.find(e => e.engine==='depcruise')` 挑样本，挑不到就 `ok:false` | 恒红：需要真仓库**恰好**存着一条 depcruise 例外；且它跑的是 `packages/server/src/routes/review.ts` —— 需要 T-10 的违规还留着才算测得到 | 改吃 fixture 自持台账；样本 = 台账里第一条能命中用例边表的例外；同一份 fixture 只换游标跑两次（在用判绿 / 过期判红） |
| `a19Vaccine()` | `a19RuleEntries()` 读 `tools/exceptions.json`，为空即 `ok:false`（"A-19 前置"） | 同上：疫苗的前置是别人的合规整改结果 | 读 `tools/fixtures/selftest/depcruise/review-no-agent-exception/_exceptions.json`（2 条 `expires_after` = T-10 / T-12，lenient/strict 游标仍由条目自己推出、不写死 T-NN） |

配套改动：`.dependency-cruiser.cjs` 的例外读取口改为 `process.env.TM_EXCEPTIONS_FILE ? path.resolve(...) : <仓库那份>`，`runDepcruiseCase` 发现 fixture 目录里有 `_exceptions.json` 就把该 env 指过去（随 `copyTree` 进临时目录）。**不是后门**：正式跑 `pnpm depcruise` / `boundaries --all` 不设该 env，读的还是 `tools/exceptions.json`；注入的是**用例的输入**。缺台账/样本为 0 仍然判红（红的是我自己的资产缺失，可修）。

**真实输出（`--self-test` 相关行，108/108 全过）**：

```
OK   例外过期机制：cursor≥expires_after 时同一违规重新计红 — 样本例外 legacy-review-routes-import-agent（owner=T-02，expires_after=T-10，边 E1=packages/server/src/routes/review.ts→packages/agent/src/graph.ts）：cursor=T-09 时 判绿（在用例外生效）；cursor=T-12 时 重新判红（过期即收回豁免）；台账 = tools/fixtures/selftest/depcruise/review-no-agent-exception/_exceptions.json（用例自持，与 tools/exceptions.json 当前有没有 depcruise 条目无关）
OK   A-19① 规则带在用例外时，未豁免的 to 仍判红（cursor=T-09） — 在用例外 2 条 / 期望红 E2,E3 / 实际红 2
OK   A-19② 已豁免的那一条 (from,to) 判绿（cursor=T-09） — 期望绿 E1 / 被误判红的绿边 无
OK   A-19③ 例外过期后仍违规 → 判红（cursor=T-12，同一 fixture 的同一批边） — 在用游标下绿、过期游标必须转红的边 E1 / 过期游标期望红 E1,E2,E3 / 实际红 3 / 仍漏 无
```

开工前这两条是 `--self-test` 仅有的 2 红（§0 基线 96/98），现在 `--self-test` **108/108**。行数 98 → 108 的来源：+6 条红/绿用例（web 3 条、enforce 口径 2 条、ui-usequery 1 条）、+1 条新断言的注册表覆盖检查（`web-home-transport` 也要红绿齐备）、+1 条 `webTransportParity()`，另 **+2 是 A-19 疫苗从前置失败只报 1 行、恢复为①②③三条独立用例**（净 +2）。

