# T-02 门禁修复轮 1 · 开发报告（gate-fix round 1）

- Owner：T-02（`tools/boundaries.mjs` / `tools/exceptions.json` / `packages/shared` 契约与常量 / 各包 tsconfig）
- 输入依据：`.delivery/04-adjudications.md` 的 **A-6 / A-7 / A-8 / A-9 / A-10**（唯一权威）
- 本轮范围：只做 T-a ~ T-e 五件事，未重写任何既有脚本，未放宽任何规则
- 运行环境快照：`git branch = main`，`gate_cursor = T-02`；六条冒烟命令各跑过 ≥1 次，粘贴的是末次快照（§6 内有说明），工作区在被 T-04 / T-06 并行写入，故红数会浮动
- **未执行任何 git 写操作**；工作区里他人的未提交改动一律未清理、未还原

## 0. 结论速览

| 项 | 裁决 | 状态 | 一句话 |
|---|---|---|---|
| T-a | A-7 | ✅ 完成 | 错禁词 `'用验证码登录'` 换成 `'请用验证码登录'` + `'改用验证码登录'`，词表 32→33 条，其它一个字未动；`--self-test` 仍 91/91 |
| T-b | A-6 + A-7 | ✅ 完成，⚠ 结果留红 | `join()` 助手与其注释整体删除，两处还原为普通字面量，渲染**逐字节不变**；`helpRecoveryAnswer` 因此命中 `找回密码` → A-6 的前提不成立，见 §7-① |
| T-c | A-8 | ✅ 完成 | 新增断言：`@tm/shared/copy` 垫片只做 re-export、零文案字面量；shared 测试 36→37 全绿 |
| T-d | A-9 | ✅ 完成（shared/server/agent 三包一致），⚠ `pnpm -r` 仍红但不在本包 | `pnpm --filter @tm/shared typecheck` EXIT=0；shared / ui / agent / app 四包全绿，`-r` 的红只剩 T-06 在建的 `packages/server/src/scripts/migrate.ts`（语法错误）与由它透传的 `apps/web`，见 §7-③ |
| T-e | A-10 | ✅ 完成 | 27 条例外，全部带 `reason` + `expires_after` + 实测 `evidence`；三条目录级通配按"规则 × 文件"拆开；depcruise 0 违规故无 depcruise 登记 |

`--all` 的红数逐次对齐（同一份规则、两个 cursor）：把全部例外强行过期时 **11 条红 / 20 条规则**，本轮登记后粘贴快照为 **4 条红 / 19 条规则**（落笔后 T-04 又交了新文件 → 末次复核 5 条，多出的 1 条属"新引入不登记"，见 §7 补充）。7 条差额按来源拆开看，没有一条来自放宽规则：

| 转绿来源 | 规则 | 条数 |
|---|---|---|
| **A-10 存量例外登记**（本报告 T-e） | `colors-no-hardcode`、`colors-purple-retired`、`colors-tailwind-palette`、`exceptions-expired` | 4 |
| cursor 语义（与登记无关）：`enforce-flag-single-read` / `password-write-points` 在 T-99 口径下按"T-07 之后必须清零"判红，T-02 口径下按"待接线"放行 | `enforce-flag-single-read`、`password-write-points` | 2 |
| **T-06 本轮真的改了代码**（迁移里的 `DROP COLUMN` 被自行清掉，非登记） | `migration-forbidden` | 1 |

词表 33 条、各阈值与扫描面均未扩大；`--self-test` 91/91 兜底证明探测器本身没有被削弱。

> 分母 20 vs 19 的差别：`exceptions-expired` 这条规则只在判红时才打印行（不红就不出现在清单里），不是被删掉的规则。

---

## 1. T-a（A-7）：修正错禁词，不放宽规则

文件：`tools/boundaries.mjs`（本轮对该文件的**唯一**改动）

`BANNED_TERMS`（R-39 ⑥ / PRD §8.3-D 凭据禁语段）删除一条、新增两条完整句式：

```js
// 删：'用验证码登录',
// 增：'请用验证码登录', '改用验证码登录',
'忘记密码', '找回密码', '本期无法找回', '请用其他手机号注册',
'请用验证码登录', '改用验证码登录',
'旧进度无法迁移', '联系管理员', '重新注册', '换手机号',
```

核对结果（脚本实测，非人工目测）：

- 词表条目数 **32 → 33**，除这一增一删外**没有任何一条被改动或删除**；
- `'用验证码登录'` 作为独立条目已不存在（`terms.includes('用验证码登录') === false`），因此 UI §6.4 定稿标签 `使用验证码登录` 不再被子串误命中；
- UI §3.9.1 / PRD R-23 ④ 真正点名的两句句式（`未设置密码，请用验证码登录`、`改用验证码登录`）仍在禁用面内，**覆盖语义未缩**；
- `node tools/boundaries.mjs --self-test` → **91/91 通过**（含反套套断言与 6 条 depcruise 红绿对照）。self-test 未依赖被删词条，说明这次改动是"修正错禁词"，不是"关掉探测器"。

## 2. T-b（A-6 + A-7）：删掉拼接，还原整段字面量

文件：`packages/shared/src/constants/copy.ts`

1. 删除 `join()` 助手本体（原第 38 行）**及其注释块**（原第 33-37 行）。全文复查：`join(` 的调用点只有原来那两处，均已还原；文件中残留的 `.join(' · ')`（第 119、251 行）是 `Array.prototype.join`，与本条无关，未动。
2. `smsEntryLabel` 还原为普通字面量：`smsEntryLabel: '使用验证码登录',`（实测渲染值与 UI §6.4 表格第 1027 行一致）。
3. `helpRecoveryAnswer` 还原为整段字面量。**渲染逐字节不变的机器证明**：把 UI §6.4 找回口令表格（`.delivery/03-ui-spec.md:1536`）的反引号字面量与还原后 `copy.ts` 里 `helpRecoveryAnswer` 的字符串常量做全等比较 → `byte-identical: true`。措辞一字未改。
4. 在该条目上方留了一段说明注释，指出这里存在 PRD 内部的互斥（R-23 ④ 规定的固定答案 ↔ §8.3-D 的零命中判据），并把复核指向本报告。**注释里不复述那四个字**——第一版注释直接引用了禁词本身，被同一套扫描判红（一次 `--copy` 从 1 处命中变成 7 处），已改写为不触词的指代表述。这是本轮唯一一处因门禁自身反馈而做的自我修正。

## 3. T-c（A-8）：契约测试断言垫片"只 re-export、零文案"

文件：`packages/shared/test/contracts.spec.ts`（3 处编辑）

新增 `it('\`@tm/shared/copy\` 垫片只做 re-export，不含任何文案字面量（A-8）')`，判据四层：

1. **源码文本层**：复用文件里已有的 `import.meta.glob('../src/**/*.{ts,tsx}', { query:'?raw', import:'default', eager:true })` 取 `../src/copy.ts` 原文（**不 import `node:fs`**，depcruise 的 shared 纯净面允许它，见 `pnpm depcruise` 0 违规），剥掉注释后按行 split，要求**每一行**都匹配 `^export (\*|\* as X|\{…\}) from '…';?$`，多余语句 = 0；
2. **引用面**：垫片里出现的模块说明符集合必须恰等于 `['./constants/copy.js']`（不许再顺手 re-export 别处、也不许复制粘贴文案）；
3. **落点存在**：`../src/constants/copy.ts` 原文必须在场；
4. **运行时等价**：`Object.keys(shimModule)` 与 `Object.keys(copyModule)` 排序后全等，且导出数 > 0（防止"清空即通过"的反向套套断言）。

同一文件里的配套修正（都是 T-a/T-b 的必然连带，不是夹带新规则）：

- `BANNED_TERMS_LOCAL` 与 `boundaries.mjs` 同步为 33 条，并断言 `expect(BANNED_TERMS_LOCAL).not.toContain('用验证码登录')`、抽查含两条新句式；
- 断言 `COPY_SRC` 中不再存在 `const join` 与任何 `join('…')` 直调（把 A-6/A-7"不得再用拼接绕扫描"钉成可执行判据）；
- 原 `RENDER_ONLY_HITS`（靠拼接换来的"零命中"名单）删除，替换为 `BANNED_TERM_COLLISION_KEYS = ['helpRecoveryAnswer']`，并在常量注释里写明：**本常量不豁免门禁，`--copy` 现在就是红的**；
- 禁词测试的失败集合从"空"改为钉死为恰好这一条：`expect(failures).toEqual(['packages/shared/src/constants/copy.ts 含禁词 找回密码'])`，命中数一多一少都会红（防止将来悄悄再拼接绕过，也防止把这条当免死金牌扩大到别的词）。

`pnpm --filter @tm/shared test` → **37/37 通过**（原 36 个 + 本条）。

## 4. T-d（A-9）：`test/` 纳入 typecheck，三包一致

改动（`git diff` 原样，未碰 `packages/ui/tsconfig.json` 与 `apps/app/tsconfig.json`）：

| 文件 | 改动 |
|---|---|
| `packages/shared/tsconfig.json` | `include: ["src"]` → `["src","test"]`；`rootDir: "src"` → `"."`；新增 `compilerOptions.types: ["vitest/globals"]` |
| `packages/server/tsconfig.json` | `include: ["src","../shared/src"]` → `["src","test","../shared/src"]` |
| `packages/agent/tsconfig.json` | `include: ["src","../shared/src"]` → `["src","test","../shared/src"]` |

口径说明：

- `packages/ui/tsconfig.json` 与 `apps/app/tsconfig.json` **本来就含 `test`**（各自 owner 已写），本轮未触碰；`packages/server` / `packages/agent` 目前还没有 test 目录（`vitest.workspace.ts` 已按 `packages/*/test` 注册），加进 `include` 是为 T-06/T-11 落 spec 时不再出现同类红，属零成本的一致性动作。
- 未使用任何禁用手段：没有 `skipLibCheck`、没有 `// @ts-ignore`、没有把文件从 `include` 里剔除。
- `rootDir` 必须从 `src` 放宽到 `.`：否则 `include` 一含 `test` 就 `error TS6059: File '…/test/contracts.spec.ts' is not under 'rootDir'`（即使 `--noEmit` 也照报）。
- `import.meta.glob` 的类型：`types: ["vite/client"]` 在 `@tm/shared` 里**不可解析**（`@ts-expect-error` 与 `@ts-ignore` 都属禁用手段，且实测直接 `error TS2688: Cannot find type definition file for 'vite/client'` —— 仓库根与 `packages/shared/node_modules` 都没链 `vite`，只有 `vitest`；`vitest/importMeta.d.ts` 存在但不带 `glob`）。改用在 spec 文件内部 `declare global { interface ImportMeta { glob… } }` 补最小签名（`types: ["vitest/globals"]` 是可解析的），并在该块注释里写明"给 `@tm/shared` 加 `vite` devDependency 后请整块删除"，正式需求走 §9 越界申请，不改别人的 package.json。
- 副作用（必须报告）：`rootDir: "."` 使 `pnpm --filter @tm/shared build` 的产物布局从 `dist/**` 漂移为 `dist/src/**` + `dist/test/**`（实测 `dist/src/index.js` 生成于本轮构建，旧的扁平 `dist/index.js` 仍在原地未清）。**无消费方受影响**：`packages/shared/package.json` 的 `main`/`types`/`exports` 三处都直接指向 `./src/**`，workspace 内一律走源码解析，`pnpm depcruise` 0 违规、`@tm/app`/`@tm/web` 的 typecheck 也不报 shared 解析失败。彻底收口需要新增 `packages/shared/tsconfig.build.json` 并把 `build` 脚本指过去 = 改 `packages/shared/package.json`，属 T-01 owner，见 §9。

## 5. T-e（A-10）：存量红按"规则 × 文件"登记

文件：`tools/exceptions.json`（27 条；5 条既有 + 22 条本轮新增）

**先实测、后登记**：写任何一条之前，先用 `TM_TASK=T-99`（让全部例外强制过期，暴露每一条裸红）跑 `node tools/boundaries.mjs --all --json`、`--copy --json` 与 `pnpm depcruise`，拿到真实命中清单；下面的数字全是这样量出来的，没有一个是猜的文件名。

1. **删除三条目录级通配**：`legacy-web-colors`（`^apps/web/src/`）、`legacy-web-colors-report-charts`、`legacy-web-copy`（`^(apps/web/src|packages/server/src)/`）——A-10 明令"不许用一条通配把整个 apps/web 放过"。
2. **拆成逐文件条目**，`rule` / `owner` / `expires_after` 与被拆条目**逐项相同**（即：只收窄命中面，不新增任何豁免）：
   - `copy-legacy-zero` × `apps/web`：`assess/page.tsx`(2 处) `chat/page.tsx`(1) `report/page.tsx`(3) `admin/page.tsx`(1) `components/wordbook-sidebar.tsx`(2) → T-12/T-16、wordbook 取 T-15/T-15（比原通配的 T-16 更早咬人）；
   - `colors-no-hardcode` × `apps/web`：`tailwind.config.ts`(30 处) → T-04；4 个 `components/charts/*.tsx`(6 处) → T-12/T-16；
   - `colors-purple-retired` × `apps/web`：`globals.css`(4) 与 `tailwind.config.ts`(2) → T-04；2 个 charts(2) → T-12/T-16；
   - `colors-tailwind-palette` × `apps/web`：`assess`(6) / `chat`(1) / `report`(4) 三条独立条目 → T-12/T-16；
   - `focus-ring-not-hidden` × 5 个 `apps/web/src/components/ui/{badge,button,dialog,input,textarea}.tsx` 逐文件条目 → T-16。
3. **A-10 表第 1 行**：mobile-memory 的 5 处 `copy-legacy-zero`（`api.js:71`、`app.js:260/385/848`、`index.html:78`）按文件拆 3 条，全部 T-20。
4. **A-10 表未覆盖、但拆分后被暴露的半边**：`packages/server/src` 的文案红。裁决表只写了"apps/web 既有页面"，服务端旧口径（实测 **9 个文件 / 37 处**）从没被裁决过。本轮**没有新给它登记**，只是把原 `legacy-web-copy` 通配的 server 半边按原 rule/owner/expires_after 原样保留为 `legacy-server-copy-residual`，避免"拆通配"这个动作本身把一批从未被裁决过的文件当场判红。该条仍是目录级，已在 `reason` 里显式标为**待 TPM 复核**（真实清零人按 §10.2 应是 T-07/T-08/T-10/T-11）。
5. **既有的 5 条一字未改**：`legacy-review-routes-import-agent`(depcruise/T-10)、`legacy-mobile-memory`(T-20)、`legacy-server-copy-agent-errors`(T-11)、`legacy-migration-forbidden-words`(T-06)、`legacy-prod-password-scripts`(T-21)。
6. **depcruise 侧本轮 0 条新登记**：`pnpm depcruise` 实测 `no dependency violations found`，无红可登记；`--self-test` 里"真仓库 + 全部故意违规 fixture、cursor=T-02 仍退出码 0"这条也是绿的。
7. **`route-string-preserved` 未登记**（登记不了）：该断言在 `boundaries.mjs` 里**不调用 `filterExceptionHits`**、且 `hits: []`，即脚本没有给它开例外通道；它要断言存在的 `/api/auth/{login,register}` 两条路径只在 `tools/fixtures/selftest/**` 与文档里出现，**真实源码中从未存在**（首轮 T-02 报告第 5 条已记，本轮复核仍成立）→ 留红 + 升级，见 §7-⑤。
8. 每条都带 `expires_after=T-XX` 与 `owner`，`--all` 在 cursor=T-02 下正常吃这份白名单；`exceptions-expired` 规则（有命中落在已过期例外范围内即红）在 T-99 口径下如期报红 8 处，证明到期会自动咬人。

---

## 6. 冒烟真实输出（原样粘贴，未做修饰）

六条命令本轮都真跑过；因工作区被 T-04 / T-06 并发写入，同一命令前后跑过不止一次，**下面粘贴的是末次快照的原样输出**（`--copy`/`--all` 因此同口径）。`EXIT=` 为该命令自身的退出码（经重定向捕获，不受管道影响）。

```
$ pnpm --filter @tm/shared test
 RUN  v3.2.7 E:/CC/tomorrow-memory/packages/shared
 ✓ test/contracts.spec.ts (37 tests) 94ms
 Test Files  1 passed (1)
      Tests  37 passed (37)
EXIT=0

$ pnpm --filter @tm/shared typecheck
$ tsc -p tsconfig.json --noEmit
EXIT=0

$ node tools/boundaries.mjs --copy
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
RED  copy-legacy-zero           2 处命中：packages/ui/src/hooks/use-recent-searches.ts:5 | packages/shared/src/constants/copy.ts:465；需人工复核词命中 93 处（不判红，UI §8.2-9 明示由走查确认）
0/1 条通过，1 条红
EXIT=1

$ node tools/boundaries.mjs --all
静态断言门禁 boundaries.mjs —— cursor=T-02，扫描根=仓库根
RED  copy-legacy-zero           2 处命中：packages/ui/src/hooks/use-recent-searches.ts:5 | packages/shared/src/constants/copy.ts:465；需人工复核词命中 93 处（不判红，UI §8.2-9 明示由走查确认）
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
RED  css-important-budget       !important 出现 3 处 >1：packages/ui/src/styles/tokens.css:80 | packages/ui/src/styles/tokens.css:82 | packages/ui/src/styles/tokens.css:89
RED  focus-ring-not-hidden      1 处命中：packages/ui/src/primitives/button.tsx:9
OK   dark-variant-budget        dark: 2 处（预算 3）
OK   ui-no-io-globals           0 命中（扫描 packages/ui/src；例外豁免 0 处）
OK   shared-pure-env            0 命中（扫描 packages/shared/src；例外豁免 0 处）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等
OK   version-pin-overrides      6 个钉死项全部为精确版本，且无 pnpm.overrides 回潮
RED  route-string-preserved     旧接口路径消失：/api/auth/login, /api/auth/register
15/19 条通过，4 条红
EXIT=1

$ pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs
✔ no dependency violations found (255 modules, 459 dependencies cruised)
EXIT=0

$ pnpm -r typecheck
Scope: 6 of 7 workspace projects
packages/shared typecheck$ tsc -p tsconfig.json --noEmit
packages/shared typecheck: Done
packages/agent typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck$ tsc -p tsconfig.json --noEmit
packages/ui typecheck: Done
packages/agent typecheck: Done
apps/app typecheck$ tsc -p tsconfig.json --noEmit
packages/server typecheck$ tsc -p tsconfig.json --noEmit
apps/app typecheck: Done
packages/server typecheck: src/scripts/migrate.ts(435,50): error TS1109: Expression expected.
packages/server typecheck: src/scripts/migrate.ts(435,130): error TS1109: Expression expected.
packages/server typecheck: Failed
E:\CC\tomorrow-memory\packages\server:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/server@2.0.0 typecheck: `tsc -p tsconfig.json --noEmit`
Exit status 2
（递归在第一个失败包停下，apps/web 未被跑到 → 补跑单包见下）
EXIT=2
```

> 本轮早先的同一份输出里，`packages/ui` 曾是 14× `error TS2307: Cannot find module './host.js'`（T-04 的 `host.tsx` 尚未落盘）；末次快照里 T-04 已补上该文件、`packages/ui` 转 Done。**这不是本轮改的**（`packages/ui/tsconfig.json` 与 `packages/ui/src/**` 我一个字未动），只是并发工作推进的结果。

`pnpm -r` 停下后逐包补跑，用于区分"谁的"红：

```
$ pnpm --filter @tm/server typecheck  →  EXIT=2
src/scripts/migrate.ts(434,50): error TS1109: Expression expected.
src/scripts/migrate.ts(434,130): error TS1109: Expression expected.
（两次相隔 30 秒的复跑报错行号从 435 漂到 434 —— T-06 正在保存该文件）
$ pnpm --filter @tm/web typecheck     →  EXIT=2
../../packages/server/src/db/index.ts(117,25): error TS2344: Type 'T' does not satisfy the constraint 'QueryResultRow'.
（web 的 tsconfig paths 把 @tm/server 指到 packages/server/src/index.ts → 服务端在建代码的报错直接透传进 web）

$ pnpm --filter @tm/agent typecheck   →  $ tsc -p tsconfig.json --noEmit            EXIT=0
$ pnpm --filter @tm/app  typecheck    →  $ tsc -p tsconfig.json --noEmit            EXIT=0

$ node tools/boundaries.mjs --self-test（辅助核验 T-a 未削弱探测能力）
…
OK   depcruise .（真仓库 + 全部故意违规 fixture 在场，cursor=T-02）→ 退出码仍为 0 — exit=0 ✔ no dependency violations found (255 modules, 459 dependencies cruised)
OK   ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）
boundaries --self-test：91/91 通过
EXIT=0
```

对照口径（登记前后，同一份规则、`TM_TASK=T-99` 让例外全部过期 vs `cursor=T-02`）：

```
$ TM_TASK=T-99 node tools/boundaries.mjs --all     →  9/20 条通过，11 条红
    copy-legacy-zero        69 处 / 25 个文件（apps/web 9、mobile-memory 5、packages/agent 16、packages/server 37、packages/shared 1、packages/ui 1）
    colors-no-hardcode      55 处 / 9 个文件
    colors-tailwind-palette 11 处、colors-purple-retired 2 处
    + migration-forbidden 6 / css-important-budget 3 / focus-ring 1 / route-string-preserved / exceptions-expired 8 …
$ node tools/boundaries.mjs --all（cursor=T-02）  →  15/19 条通过，4 条红
```

**验收对照**：
- ✅ `join()` 绕道已消失（源码无 `const join`、无字符串实参 `join(` 调用，`contracts.spec.ts` 已把这条钉成断言）；
- ❌ "`--copy` shared 面 0 命中"**未达成，且在 A-6 原文口径下不可能达成** —— 不是实现没做完，而是 A-6 的事实前提不成立。详见 §7-①；
- ✅ `--all` 的存量红全部变成"已登记、未过期的例外"（`colors-*` 三条从红转 OK 即豁免生效的直接证据）；
- ✅ 红数只因登记而下降：`--all` 里靠登记转绿的恰是 `colors-no-hardcode` / `colors-purple-retired` / `colors-tailwind-palette`（+ 不再触发的 `exceptions-expired`），没有一条规则的词表/阈值/扫描面被放宽（词表只按 T-a 一改，`--self-test` 91/91 守住）；其余差额来自 cursor 语义与 T-06 的真实代码修复，见 §0 的来源分解表。

> 上面的 `TM_TASK=T-99` 对照是在本轮中途抓的快照（当时 `migration-forbidden` 还是 6 处、人工复核词 90 处），末次 `--all` 快照为 4 条红 / 人工复核 93 处；T-04 与 T-06 正在并行写文件，两个快照的差异都不是本轮的规则改动。

---

## 7. 未清零的红（4 条 + 1 条 typecheck；随并发工作在 4~5 条浮动）

登记口径：**只登记 A-10 表覆盖的存量红；新引入的红一律留红。** ①②④⑤ 是末次 `--all` 的 4 条红，③ 是 `pnpm -r typecheck` 的红；五条**全部不在 A-10 的三行存量表内**，因此按指令未登记、未降规则、原样留红。

① `copy-legacy-zero` — `packages/shared/src/constants/copy.ts:465`（**待 TPM 裁决，本轮最重要的一条**）

```
'本期还没有找回密码的方式。如果这个手机号以前从没设置过密码，可以直接在登录弹窗里点『注册』为它设置一个密码来激活原账号；如果已经设过密码，本期暂时无法自助找回。'
```

- **A-6 的前提是错的。** A-6 写："渲染为「本期还没有找**回密码**的方式」——**并不含禁词「找回密码」**"。它把这句话按"找 / 回密码"切了；而扫描是连续子串匹配，`还没有找回密码的方式` 里 `找回密码` 四字**连续存在**。上面已用脚本把 UI §6.4:1536 的定稿字面量与还原后的常量做全等比较（`byte-identical: true`），命中就是定稿本身命中的。
- 这不是 T-03 拼接的副作用，也不是本轮改坏的：只要 `helpRecoveryAnswer` 以定稿形态存在于**被扫描的源码**里，PRD 内部两条条款就互斥——
  - PRD `01-prd.md:196`（R-23 ④）："答案文字固定为『本期还没有**找回密码**的方式……』"（强制写入源码）；
  - PRD `01-prd.md:542` / `:553` / `:724`（§6.4-2b 步 12 / §8.3-D）："**两端源码** + 三份对外文案中 `忘记密码`、`找回密码` … **命中数 = 0**，grep 命中 >0 → 阻断发布"；
  - UI `03-ui-spec.md:1536`（定稿字面量）与 `:1591` / `:1850`（第 11 条判据 = 0，"同脚本词表"）同样互斥。
- 本轮选择：**服从 T-b 的字面指令**（还原整段、措辞一字不改、词表除 T-a 外不动一个字），把红留着，并在 `contracts.spec.ts` 里把"恰好这一条、且只有这一条"钉死（多一条少一条都红），注释里显式声明**该常量不豁免门禁**。三条可选解法请 TPM 选一条：
  - (a) 给 `copy-legacy-zero` 加"渲染面 vs 源码面"两级判据（定稿答案属 UI §6.4 白名单文案，源码零命中改判"可见文案零命中"）；
  - (b) 由 PM 改 PRD R-23 ④ 的固定答案措辞（去掉 `找回密码` 四字，例如"本期还没有**自助取回**的方式"），同步改 UI §6.4:1536 与快照；
  - (c) 维持现状，把这一处红作为"已知例外"登记 `expires_after=T-22`（发布前收口）—— 但这是**登记**不是放宽，且要写清它不来自 A-10 表，需新裁决。
  本轮**未**擅自选任何一条，也未用拼接绕过（那正是 A-6 要撤销的行为）。

② `copy-legacy-zero` — `packages/ui/src/hooks/use-recent-searches.ts:5`
T-04 本轮新建文件，注释里的 `云端` 二字命中。非存量 → 未登记。责任：T-04（同文件措辞换成 `host.kv` 表述即可，属 owner 白名单内）。

③ `pnpm -r typecheck` 红 — 只剩 T-06 在建的 `packages/server`
末次快照：`shared / ui / agent / apps-app` 四包全部 `Done`，红点是 `packages/server/src/scripts/migrate.ts(434~435,50|130): error TS1109: Expression expected.`（T-06 正在保存该文件，报错行号在两次复跑间从 435 漂到 434），以及 `apps/web` 因 tsconfig `paths` 把 `@tm/server` 指向 `packages/server/src/index.ts` 而透传到的 `../../packages/server/src/db/index.ts(117,25): error TS2344`。
**与 A-9 无关**：三条判据可自查——(1) `@tm/shared` 带着 `include:["src","test"]` 单跑 EXIT=0；(2) `packages/server` / `packages/agent` 都还没有 test 目录，报错路径没有一条来自 `test/` 或 `../shared/src`；(3) 报错类型是语法/泛型约束/接口实现，不是 `import.meta.glob` 一类的测试文件类型缺失。本轮未使用 `skipLibCheck` / `@ts-ignore` / 剔除 include 文件这三种禁用手段。未登记（typecheck 不是白名单的消费面，也不该被例外吃掉）。
（本轮早先 `packages/ui` 的 14× `TS2307 ./host.js` 与 `packages/server/src/db/{pg,sqlite}.ts` 的 `TS2739/TS2420/TS2740` 已分别被 T-04、T-06 自己推进掉，见上方引用块。）

④ `css-important-budget` — `packages/ui/src/styles/tokens.css:80,82,89`（3 处 > 预算 1）与 `focus-ring-not-hidden` — `packages/ui/src/primitives/button.tsx:9`
T-04 本轮新建的 `packages/ui/**`。注意：`focus-ring` 的存量面是 `apps/web/src/components/ui/*.tsx`（已按 A-10 逐文件登记），而 `packages/ui/src/primitives/*` 是**新代码**，不在 A-10 表内 → 未登记，留红给 T-04。
（同类的 `migration-forbidden` 本轮中途也曾红 2~6 处，是 T-06 新写的 `001/004` 迁移里的 `DROP COLUMN`；真正的红线本就不该被任何例外吃掉——`legacy-migration-forbidden-words` 只覆盖 CREATE/索引类误报面。**末次快照 T-06 已自行改代码清掉，现为 `OK 0 命中（扫描 16 个文件）`**，非登记所致。）

⑤ `route-string-preserved` — `旧接口路径消失：/api/auth/login, /api/auth/register`
**结构性问题，不是"漏登记"，本轮登记不了也不该登记**。事实核对（`tools/boundaries.mjs:629-647`，roots = `packages/server/src/routes`，required 共 8 条）：8 条里 6 条（`/api/review/today`、`/api/wordbook`、`/api/profile`、`/api/checkin`、`/api/lookup`、`/api/chat*`）实测在册，缺的正是 `/api/auth/login` 与 `/api/auth/register` —— 这两条路径**在本仓库从未存在过**：`routes/auth.ts` 实注册的是 `/api/send-code`、`/api/login`、`/api/me`、`/api/password`，无 register 端点（首轮 T-02 报告 `04-dev-report-T-02.md` 第 5 条已登记该 finding 并交仲裁，本轮复核仍成立）。
该断言有两处脚本缺陷，都属"重写已有脚本"，超出本轮 5 件事的范围，**未动**：

1. `enforce_from: 'T-08'` 声明了，但它的 `run()` 从不读 `ctx.curAssertionEnforceFrom`，于是"批次 2 才生效"的规则在 cursor=T-02 就判红（对比 `password-write-points` 在 `:362` 就正确做了未到生效期放行的处理）；
2. 它 `return { status:'red', hits: [] }` —— 即使给它接上 `filterExceptionHits` 也没有可豁免的命中行，所以白名单在结构上对它无效。任何 agent 都无法（也不应）用 `exceptions.json` 让它变绿。

两条出路请 TPM 定：把 required 换成 §6.5-1 的"真实现状快照 18 条"（首轮报告已给出清单），或把该断言的生效点真正接到 T-08（旧接口兼容层）后再由 owner 修脚本。

补充说明（快照漂移）：本轮期间 `--all` 的红数随 T-04 / T-06 实时写文件在 **4~7 条之间浮动**：`colors-no-hardcode` 一度因 `apps/web/src/app/layout.tsx` 新写的注释里的 hex 而红、`migration-forbidden` 从 6 → 2 → 0 → 现 0。**这些差异都不是本轮的规则改动，也没有一条为它们登记例外**（新引入的红不登记）。报告落笔后（T-04 交出 `packages/ui/test/ui.spec.tsx` 与 `packages/ui/src/styles/tokens.css` 增量）末次复核为 **14/19，5 条红**，多出的那 1 条与新增命中如下，责任全在 T-04，口径不变（未登记）：

```
RED  copy-legacy-zero           2 处命中：packages/ui/src/hooks/use-recent-searches.ts:5 | packages/shared/src/constants/copy.ts:465
RED  colors-no-hardcode         1 处命中（tokens.css/tailwind-preset.ts/colors.xml 之外）：packages/ui/test/ui.spec.tsx:141
RED  css-important-budget       !important 出现 7 处 >1：packages/ui/src/styles/tokens.css:80,82,89 | packages/ui/test/ui.spec.tsx:13,180,182 …(+1)
RED  focus-ring-not-hidden      3 处命中：packages/ui/src/primitives/button.tsx:9 | packages/ui/test/ui.spec.tsx:13,174
RED  route-string-preserved     旧接口路径消失：/api/auth/login, /api/auth/register
14/19 条通过，5 条红
```

批次 1 出口的权威口径（A-5 / §10.1：`pnpm -r typecheck && pnpm ddl-parity && pnpm depcruise`）不受影响：`pnpm depcruise` 仍 `EXIT=0`（255 modules / 459 dependencies，0 违规），`ddl-parity --self-test` 26/26。

## 8. 待裁决 / 待指派点（汇总）

| # | 事项 | 需要谁 | 建议 |
|---|---|---|---|
| 1 | **A-6 前提事实错误**：定稿答案与 §8.3-D 零命中判据互斥（§7-①） | TPM → PM 签字 | 三选一 (a)/(b)/(c)；在此之前批次 1 出口不能要求 `--copy` shared 面 0 命中 |
| 2 | `legacy-server-copy-residual` 仍是 `^packages/server/src/` 目录级，且 owner/expires 不在 A-10 表内 | TPM | 按 §10.2 改为逐文件（9 个文件 37 处），owner 给 T-07/T-08/T-10/T-11 |
| 3 | `apps/web` 的 assess / chat / report / admin 四个页面在 §10.2 批次 3-4 的认领空隙里（三条文案红的 owner 悬空） | TPM | 明确指派；否则 T-16 到期时这些条目会自动咬成无人负责的红 |
| 4 | charts 色值按裁决表第 2 行应归 T-04，但 T-04 改不到这些文件（§10.4 只允许它改 6 个页面的 import 行），本轮按拆分前口径给了 T-12/T-16 | TPM | 确认 owner；若坚持 T-04，只需把两条 `expires_after` 改回 T-04（已在 reason 里写明改法） |
| 5 | `route-string-preserved` 无例外通道且判据指向不存在的路径（§7-⑤） | TPM → T-08 | 改判据或指派兼容层任务 |
| 6 | `packages/shared` 的 `dist` 布局漂移（§4 最后一条） | T-01 owner | 加 `tsconfig.build.json` 并把 `build` 指过去 |
| 7 | 需要 `@tm/shared` 加 `vite` devDependency，以撤掉 spec 里的 `ImportMeta.glob` 临时签名 | T-01 owner | 加依赖后删除 `contracts.spec.ts` 顶部的 `declare global` 块 |

## 9. 越界申请（本轮**没有动手**、只在此提需求的文件）

1. **`apps/web/tsconfig.json`（T-04 owner）— A-9 一致性要求**：无需新增 `test` 条目，因为它的 `include` 已是 `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"]`，`**/*.ts` 天然覆盖未来落在 `apps/web/**` 下的任何 spec。请 T-04 在写第一份 web 侧 spec 时**保持该 glob 不被收窄**，并按需补 `types`（`vitest/globals`；Next 侧 `next-env.d.ts` 已在 include 内），不要用 `skipLibCheck`/`@ts-ignore` 处理 spec 报错。当前该包 typecheck 红完全来自 `packages/ui` 缺 `./host.js`（§7-③），非 tsconfig 问题。
2. **`apps/app/tsconfig.json`**：`include` 已含 `test`，本轮未触碰。Vite 侧 spec 若报 `import.meta.env` 缺类型，由 T-05 owner 加 `"types": ["vite/client"]`（该包链得到 `vite`，与 shared 不同）。
3. **`packages/ui/tsconfig.json`**：`include` 已含 `test`，但其 `"types": []` 会让后续 vitest 全局写法（`describe`/`it` 不带 import）无类型。`packages/ui/test/` 目前是空目录，尚未成为红。请在 T-04 落第一份 ui spec 时改为 `["vitest/globals"]`（同样禁止用 `skipLibCheck`/`@ts-ignore` 绕过）。
4. **`packages/shared/package.json`**（T-01）：见 §9-6/§8-7 两项。
5. `tools/boundaries.mjs` 只改了 `BANNED_TERMS` 一处（T-a）；`route-string-preserved` 缺例外通道属**脚本结构问题**，本轮按"不重写已有脚本"的约束未动。
