# 04-dev-report-E4b7 · 弹层高度上限上收成一颗 token（A-86 #319 的 4C 落地件）

通道：`bounded-edit:A-91-E4b7`　派单人：TPM　执行：E4b7 开发 agent
开工时刻：**2026-09-23 04:08:38**（`date` 原样输出）　收工时刻：**2026-09-23 04:22:09**（收工复验 `sha256sum -c` 那次命令里 `date` 的原样输出）
scratch：`C:\Users\曹怡明\AppData\Local\Temp\e4b7\work\`

---

## §0 落点表（文件:行号 = 改后盘面 + 额度 vs 实耗）

| # | 文件 | 额度(增+删) | 闸门实耗（NOTE 原文数字） | 改后落点行号 | 做了什么 |
| --- | --- | --- | --- | --- | --- |
| 1 | `packages/ui/src/styles/tokens.css` | 8 | **+6 / -0 = 6** | `:42` 兜底声明；`:58` 注释、`:59` `@supports (height: 100dvh) {`、`:60` `:root { --dialog-max-h: 100dvh; }`、`:61` `}` | 件A |
| 2 | `packages/ui/src/tailwind-preset.ts` | 6 | **+3 / -0 = 3** | `:185-186` 注释两行、`:187` `maxHeight: { dialog: 'var(--dialog-max-h)' },` | 件B |
| 3 | `packages/ui/src/primitives/dialog.tsx` | 12 | **+5 / -3 = 8** | `:29-32` 注释（原 `:29-30` 两行 → 四行）、`:76` 类串（原 `:74`，因注释净增 2 行而下移） | 件C |
| 4 | `apps/app/src/styles/app.css` | 10 | **+7 / -2 = 9**（见 §8 偏差 D-2：原始 diff 为 +6/-2，闸门按 F-45 每段边界 +1 幻影） | `:7` 计数改 4 条、`:10` ③ 句号改顿号、`:11` 新增 ④ 行；`:33-34` 注释、`:35` `:root { --dialog-max-h: calc(100vh - var(--sp-6) * 2); }` | 件D |
| 5 | `packages/ui/test/ui.spec.tsx` | 24 | **+23 / -0 = 23** | `:702` 空行、`:703` `describe(...)`、`:704` `it(...)`、`:705-723` 断言体、`:724` 收尾 `});` | 件E |

`wc -l` 收工值：tokens.css **100**（基线 94，+6）· tailwind-preset.ts **289**（286，+3）· dialog.tsx **147**（146，+1）· app.css **35**（30，+5）· ui.spec.tsx **724**（701，+23）。
五颗全部在额度内；`entries` 现值 161 未动（我没碰 `tools/ownership.json`，见 §7 两证的 sha OK）。

---

## §1 件A —— `packages/ui/src/styles/tokens.css`

兜底落在**第一个** `:root` 块内（`:42`，紧跟尺度层 `:41` 的 `--tap/…/--field-h` 之后），`@supports` 覆写块落在原 `:55` 的 `}` 之后、原 `:57` 深色套注释之前。改后盘面原文：

```css
  --tap: 44px; --search-h: 50px; --tab-h: 56px; --topbar-h: 56px; --field-h: 48px;
  --dialog-max-h: 92vh;            /* 兜底：Chrome 84 不认 dvh（UI §3.11.2） */
```
```css
/* 常青内核走真实视口高；与替换前 `max-h-dvh` 逐字同值（Web 计算值不变的那一半）。 */
@supports (height: 100dvh) {
  :root { --dialog-max-h: 100dvh; }
}
```

纪律遵守：`:3-4` 那段（讲的是宿主 ≤10 行）一字未动；`.dark` 里没加这颗（它是尺度不是颜色）。
`@supports` 内的 `:root` 是**缩进**写法且在源顺序上晚于第一个块，`blockOf(TOKENS, /^:root\s*\{/m)`（`ui.spec.tsx:130/:239`）仍只认 `:8` 那一块 ⇒ 兜底值 `92vh` 进了 `LIGHT`，`:346` 那颗"无悬空 var"既有哨不翻红。

## §2 件B —— `packages/ui/src/tailwind-preset.ts`

放在 `maxWidth`/`minWidth` 同族处（`minWidth` 块之后、`width` 之前）：

```ts
      /* UI §3.11.2 / §1.12.3 第 4 条：弹层高度上限收成一颗 token（老内核吃兜底 92vh，
         常青内核吃 @supports 里的 100dvh，App 宿主另覆写为每侧留距 24px）。 */
      maxHeight: { dialog: 'var(--dialog-max-h)' },
```
值逐字 `'var(--dialog-max-h)'`。此文件此前 0 个 `maxHeight` 键（基线核对：`grep -n maxHeight` 本轮前仅命中我新加的 `:187`）。

## §3 件C —— `packages/ui/src/primitives/dialog.tsx`

`:76`（原 `:74`）**一颗工具类换一颗工具类**，同位置同层级、0 堆叠：

- 旧：`… grid max-h-dvh w-[min(92vw,440px)] …`
- 新：`… grid max-h-dialog w-[min(92vw,440px)] …`

该行其余 21 颗工具类、`showClose`/`closeLabel` 契约、`DialogPrimitive.Portal/Overlay/Content` 的 DOM 结构与元素顺序、`data-*`/`className` 语义**一字未动**（未加任何 `data-testid`/`id`）。

`:29-32` 的过期注释按新事实改写（旧句写的是"件 1 用 `max-h-dvh` + …"，那颗类本轮已不存在）：

```
 * 因一：面板内容真高于视口时缺滚动路径 ⇒ 件 1 用「弹层高度上限 + `overflow-y-auto
 * overscroll-contain`」补上（保留，与动效无关）。那颗上限本轮收成 token
 * `--dialog-max-h`（UI §3.11.2 的 4C）：常青内核解析为满格真实视口高（与替换前的旧写法
 * 逐字同值），Chrome 84 走 `@supports` 之外的兜底值，App 宿主再覆写为每侧留距 24px。
```

⚠ 一处刻意写法（供 TPM 按盘面复核）：注释里**不出现** `max-h-dvh`、也不出现 `max-h-dialog` 字面串，只出现 `--dialog-max-h`（无冒号）。理由：件E(d) 钉的是"`dialog.tsx` 里 `max-h-dvh` 命中 0、`max-h-dialog` 命中 1"，若注释里留字面串就会把 (d) 变成需要额外排除注释的口径；`--dialog-max-h` 不带冒号也不落进 (a)(b) 的 `--dialog-max-h\s*:` 计数面。

## §4 件D —— `apps/app/src/styles/app.css`

文件头计数更正（`:7`）+ ③ 行末改顿号（`:10`）+ 新增 ④ 行（`:11`）：
```
 *  2. 挂 UI §1.12.3 为 `apps/app` 开的白名单覆写（下面的 4 条声明即全部，超出即返工）：
…
 *     ③ `--tab-h` 刘海机覆写（§1.12.3 第 2 条 / UI §2.4 括注 56→64px）、
 *     ④ `--dialog-max-h` 弹层上下留距各 24px（§1.12.3 第 4 条 / UI §3.11.2 的 4C）。
```
文件末尾第 4 条白名单（`:33-35`）：
```css
/* ④ 白名单：App 侧弹层上下留距各 24px（UI §1.12.3 第 4 条 / §3.11.2 的 4C）。
   读尺度 token 组合出一颗组件级上限，不是覆写 `--sp-*` 尺度层本身。 */
:root { --dialog-max-h: calc(100vh - var(--sp-6) * 2); }
```
机制核对：`@import '@tm/ui/styles/tokens.css';` 在 `:13`，本条在 `:35` ⇒ 源顺序晚于 token 源，同 specificity（都是 `:root`）后来者胜。**未加 `!important`、未加选择器权重**。全文件（去注释后）**0 处 `dvh`**，只有 `100vh` —— 由件E(b) 的哨替你钉住（§7 纪律 7 的 App 源文件红线）。

禁走路径复核：没碰 `ConfirmSheet.tsx`（sha OK，见 §7）、没给 `DialogContent` 传 className、没用 `@supports` 真假分支去分"App 留距 / Web 不变"。件D 是宿主级覆写，与内核支持度无关 ⇒ 新内核设备上修复不消失。

## §5 件E —— `packages/ui/test/ui.spec.tsx`

`:701` 之后**纯追加**（既有 701 行、167 颗一字未改，含 `:232` 的 `>40`、`:310` 的 `≤10`、`:346` 的无悬空 var），1 颗 `describe` / 1 颗 `it`，4 条断言组：

| 断言 | 钉什么 | 落点 |
| --- | --- | --- |
| (a) | `stripComments(TOKENS)` 里 `--dialog-max-h:` 命中 **恰 2**；`blockOf(@supports (height: 100dvh))` 内命中 **恰 1**（⇒ 块外兜底恰 1）；且 `LIGHT['dialog-max-h'] === '92vh'`（逼兜底落进第一个 `:root`） | `:706-712` |
| (b) | `apps/app/src/styles/app.css` 去注释后含 `--dialog-max-h:` 的行 **恰 1**；该行含 `calc(100vh - var(--sp-6) * 2)`；全文件 `not.toContain('dvh')` | `:713-717` |
| (c) | `preset.theme.extend.maxHeight.dialog` **===** `'var(--dialog-max-h)'` | `:718-719` |
| (d) | `dialog.tsx` 全文 `max-h-dvh` 命中 **0**、`max-h-dialog` 命中 **1** | `:720-722` |

取源工具**全部复用本文件既有机制**（按 §3④ 更正）：`REPO_ROOT` / `UI_SRC` / `stripComments` / `blockOf` / `TOKENS` / `LIGHT` / `read` / `path.join`；App 宿主路径在断言内现取 `path.join(REPO_ROOT, 'apps/app/src/styles/app.css')`。零新依赖、无 `import.meta.url`。
反凑绿三条：未碰产品 DOM；**没有** `getComputedStyle`；无 `waitForTimeout`、无截图对比、无 `test.fail/skip`、无"或等于"式放宽。

断言命中数原始输出（本轮真跑）：
```
$ grep -n "dialog-max-h\|max-h-dialog\|@supports (height" packages/ui/src/styles/tokens.css packages/ui/src/tailwind-preset.ts packages/ui/src/primitives/dialog.tsx apps/app/src/styles/app.css
tokens.css:42:  --dialog-max-h: 92vh;            /* 兜底：Chrome 84 不认 dvh（UI §3.11.2） */
tokens.css:59:@supports (height: 100dvh) {
tokens.css:60:  :root { --dialog-max-h: 100dvh; }
tailwind-preset.ts:187:      maxHeight: { dialog: 'var(--dialog-max-h)' },
dialog.tsx:31: * `--dialog-max-h`（UI §3.11.2 的 4C）：常青内核解析为满格真实视口高（与替换前的旧写法
dialog.tsx:76:        '… grid max-h-dialog w-[min(92vw,440px)] …'
app.css:11: *     ④ `--dialog-max-h` 弹层上下留距各 24px（§1.12.3 第 4 条 / UI §3.11.2 的 4C）。
app.css:35::root { --dialog-max-h: calc(100vh - var(--sp-6) * 2); }
```
⇒ `dialog.tsx` 里 `max-h-dvh` = 0 命中、`max-h-dialog` = 1 命中（`:76`）；`--dialog-max-h` 在 `:31` 是注释引用（无冒号），不入声明计数。

---

## §6 出口命令逐条原始输出（两套全跑完）

### 6.1 测试（第一套，04:15:01 起）

```
$ pnpm --filter @tm/ui test          EXIT=0
 ✓  @tm/ui  test/ui.spec.tsx (39 tests) 69ms
 ✓  @tm/ui  test/patterns.spec.tsx (51 tests) 592ms
 ✓  @tm/ui  test/auth.spec.tsx (78 tests) 829ms
 Test Files  3 passed (3)
      Tests  168 passed (168)        ← 基线 167 → 168，只增不减（件E +1）

$ pnpm --filter @tm/app test         EXIT=0
 Test Files  18 passed (18)
      Tests  470 passed (470)        ← 与基线逐字相同，0 翻

$ pnpm --filter @tm/shared test      EXIT=0
 Test Files  1 passed (1)
      Tests  68 passed (68)

$ pnpm --filter @tm/web test         EXIT=0
 Test Files  1 passed (1)
      Tests  16 passed (16)          ← 0 翻
```
（`ui.spec.tsx` 输出里那段 `Error: Not implemented: navigation (except hash changes)` 是 jsdom 对 `<a href>` 的 stderr 噪声，本轮前即在，`patterns.spec.tsx` 51 颗全绿。）

### 6.2 typecheck / build / 门禁

```
$ pnpm --filter @tm/app typecheck      EXIT=0    （tsc -p tsconfig.json --noEmit，0 错）
$ pnpm --filter @tm/web typecheck      EXIT=0    （tsc --noEmit，0 错）
$ pnpm --filter @tm/server typecheck   EXIT=0    （0 错）

$ pnpm --filter @tm/app build          EXIT=0
 ✓ built in 8.80s
 [plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API

$ node tools/boundaries.mjs --self-test          EXIT=0
 boundaries --self-test：157/157 通过

$ node tools/boundaries.mjs --check-ownership --task E4b7 \
    --files packages/ui/src/styles/tokens.css,packages/ui/src/tailwind-preset.ts,\
packages/ui/src/primitives/dialog.tsx,apps/app/src/styles/app.css,packages/ui/test/ui.spec.tsx \
    --diff-file "$W/e4b7-scoped.patch"                                                 EXIT=0
TABLE E:\CC\tomorrow-memory\tools\ownership.json
PATCH 5 个文件的 diff 参与判定
NOTE packages/ui/src/styles/tokens.css：走动作通道 bounded-edit:A-91-E4b7（按实际 diff 判定：+6/-0 行）
NOTE packages/ui/src/tailwind-preset.ts：走动作通道 bounded-edit:A-91-E4b7（按实际 diff 判定：+3/-0 行）
NOTE packages/ui/src/primitives/dialog.tsx：走动作通道 bounded-edit:A-91-E4b7（按实际 diff 判定：+5/-3 行）
NOTE apps/app/src/styles/app.css：走动作通道 bounded-edit:A-91-E4b7（按实际 diff 判定：+7/-2 行）
NOTE packages/ui/test/ui.spec.tsx：走动作通道 bounded-edit:A-91-E4b7（按实际 diff 判定：+23/-0 行）

--check-ownership task=E4b7 触碰 5 个在册文件（清单 5 项 + patch 5 项） → 无越界
```
NOTE 行的通道名标签按 F-43 第二形态统一打 `bounded-edit:A-91-E4b7`（各条目 `actions[]` 首条），卡额度的是 `maxDiffLinesFor["E4b7"]` —— 逐颗按 §0 的额度表核对，5 颗全部在上限内，最紧的是 app.css 9/10 与 ui.spec 23/24。scoped patch：`work/e4b7-scoped.patch`，116 行、5 个 `diff --git` 段，由 `work/before/` 快照与收工盘面 `diff -u --label a/… --label b/…` 拼成，**只含本轮增量**（不收 HEAD 相对 diff）。

### 6.3 本轮专属证据：产物层（`pnpm --filter @tm/app build` 之后）

开工基线（**我亲跑，04:11 前后，改盘前**，产物是 TPM 03:28:31 重建那颗）：
```
$ grep -o "max-height:[^;}]*" apps/app/dist/assets/*.css | sort | uniq -c
      1 max-height:100dvh
      1 max-height:none
$ grep -o "@supports[^{]*" apps/app/dist/assets/*.css | sort | uniq -c
（0 命中）
```
⇒ 与简报 §5 的 TPM 基线逐字一致，"App 真机今天压根没有高度上限"这条定性在本机拿到独立复证：唯一那条 `max-height:100dvh` 在 Chrome 84 上整条被丢，产物里没有第二条上限。

收工（本轮重建后）：
```
$ grep -o "max-height:[^;}]*" apps/app/dist/assets/*.css | sed 's/^.*css://' | sort | uniq -c
      1 max-height:none
      1 max-height:var(--dialog-max-h)
$ grep -o "@supports[^{]*" apps/app/dist/assets/*.css | sed 's/^.*css://' | sort | uniq -c
      1 @supports (height: 100dvh)
$ grep -o -- "--dialog-max-h:[^;}]*" apps/app/dist/assets/*.css | sed 's/^.*css://' | sort | uniq -c
      1 --dialog-max-h: 100dvh
      1 --dialog-max-h: 92vh
      1 --dialog-max-h: calc(100vh - var(--sp-6) * 2)
$ grep -o "\.max-h-dialog[^}]*}" apps/app/dist/assets/*.css | sed 's/^.*css://' | sort | uniq -c
      1 .max-h-dialog{max-height:var(--dialog-max-h)}
$ grep -o "@supports (height: 100dvh){[^}]*}}" apps/app/dist/assets/*.css | sed 's/^.*css://'
@supports (height: 100dvh){:root{--dialog-max-h: 100dvh}}
```
三条同时成立：① 非 dvh 的兜底 `92vh` 在册；② `100dvh` **确在** `@supports (height: 100dvh)` 块内（第四行原样证明）；③ App 宿主的 `calc(100vh - var(--sp-6) * 2)` 在册且晚于 token 源（同 `:root`、后来者胜）。
`max-height:none` 仍恰 1 处（`RecentSearchPanel.tsx:122` 的 `<ul>`），未受影响。旧类串 `max-h-dvh` 编译出的那条规则已从产物消失，被 `max-h-dialog` → `max-height:var(--dialog-max-h)` 取代 = **修复确实进了产物**，不是只改了源码。

`apps/web/**` 本轮未 build、不参与产物判定（按简报口径）。

---

## §7 两证

### 7.1 sha256 快照面

`work/sha256-baseline.txt`（12 颗）在**开工第一件事**写入，收工 `sha256sum -c` **EXIT=0、12/12 全 OK**：
```
data.db: OK            data.db-shm: OK        data.db-wal: OK
packages/server/data.db: OK
tools/boundaries.mjs: OK            tools/ownership.json: OK
.delivery/01-prd.md: OK   .delivery/02-tech-design.md: OK
.delivery/03-ui-spec.md: OK        .delivery/04-adjudications.md: OK
packages/ui/src/patterns/ConfirmSheet.tsx: OK
apps/web/src/app/globals.css: OK
```
真库**三颗**（本体 + `-shm` + `-wal`）逐颗 OK ⇒ 全程只读、未 checkpoint、未改 mtime（`pnpm --filter @tm/app test` 与 server 无关的三套测试均未打开真库写面）。四份主文档 + `tools/ownership.json` + `boundaries.mjs` 逐字不变。禁读面：`.delivery/01/02/03/04-*.md` 与 `status.json` **一个字符都没读**（只 `ls -l` 看过往 `00-raw-requirement.md` 等条目的**元信息**与 `.delivery` 目录清单，取的是文件名与 mtime，未取内容）。

### 7.2 文件窗口（`find . -newermt '2026-09-23 04:08:38'`）

仓库根面（`-maxdepth 1`）：
```
./.delivery
./.git
```
⇒ **仓库根的文件 0 命中**（这两条都是目录项，非根文件）；`./.git` 是我跑只读 `git status/diff` 时的 `index.lock` 创建-删除留下的目录 mtime（`.git/index` 自身 mtime 仍是 2026-09-19 11:35:58，未动），见 §8 偏差 D-3。

全树（`node_modules`/`.git` prune、`.turbo` 过滤）逐颗分类：
- **我名下 5 颗（唯一写盘面）**：`packages/ui/src/styles/tokens.css`、`packages/ui/src/tailwind-preset.ts`、`packages/ui/src/primitives/dialog.tsx`、`apps/app/src/styles/app.css`、`packages/ui/test/ui.spec.tsx`（外加它们的父目录项 `packages/ui/src`、`packages/ui/src/primitives`、`packages/ui/src/styles`、`packages/ui/test`、`apps/app/src/styles`）。
- **gitignored 产物噪声（本轮必跑 build/typecheck 的直接结果）**：`apps/app/dist` + `apps/app/dist/assets` + 22 个产物文件（`index-T4SUTEM1.css` 与 20 个 js + `apps/app/dist/index.html`）、`apps/web/tsconfig.tsbuildinfo`。
- **非我写入的外部噪声**：`.delivery` 目录项与 `.delivery/status.json` —— mtime `2026-09-23 04:09:25.004274100`，即我开工后 47 秒、**在我第一次改盘（04:12 之后）之前**，由 TPM/编排侧写入；我全程未读未写这颗（见 §8 偏差 D-1）。
- 我自己的 scratch（`C:\Users\…\Temp\e4b7\work\`）在盘外，不进本窗口；报告落点是简报点名的唯一 `.delivery/` 可写颗。

⇒ 除我名下 5 颗与上述三类已登记噪声外，**无任何第四类命中**；`packages/ui/src/patterns/**`、`apps/web/**`（`tsbuildinfo` 除外）、`packages/shared/**`、`tools/**`、`apps/app/src/screens/**`、`apps/app/src/{router,main}.tsx` **0 命中**。

---

## §8 申报

**D-1 · `.delivery/status.json` 的 mtime 落进我的窗口**
不是我所写（该颗在禁读清单里，我未 `Read`/`grep`/`Edit` 过它）。mtime 04:09:25 早于我本轮第一次编辑动作。文件窗口里如实列出，未做解释性遮掩。**未自行处理**。

**D-2 · 闸门 NOTE 的 app.css 计数比我的原始 diff 多 1 行**
`diff -u work/before/apps/app/src/styles/app.css apps/app/src/styles/app.css` 实测 **+6 / -2 = 8**；闸门 NOTE 报 **+7 / -2 = 9**。这颗文件有两个 hunk（文件头 1 处、文件尾 1 处），按 A-90 #347 / F-45 的"每段边界 +1 幻影（末段除外）"口径，9 = 8 + 1 与盘面自洽。**我没有为此把自己的额度加 1，也没有去碰闸门面**（闸门面归 E4c）。两颗仍在 `maxDiffLinesFor["E4b7"]` 之内。

**D-3 · 只读 git 的副作用**
为自证 `apps/web/**` 未动，我跑了 `git diff --stat HEAD -- apps/web packages/shared tools .delivery` 与 `git status --porcelain`（纯只读）。`git` 刷新了 `.git` **目录**的 mtime（`.git/index` 本体 mtime 未变）。无任何 git 写操作（commit/push/stash/checkout/restore/reset/clean 全未执行）。

**D-4 · "apps/web 本轮 0 diff" 在这颗仓上的证明口径**
本仓 HEAD 相对工作区是**大面积未提交**状态（`git status --porcelain` 里 `apps/web/**` 有 41 项 M/D、`packages/ui/` 整个是 `??` 未跟踪 —— 这是 TPM 侧在途重构的存量，不是我造的）。⇒ HEAD 相对 diff **不能**当"本轮 0 diff"的证据面。我按 §6 两证自证：① `apps/web/src/app/globals.css` 开工/收工 sha256 逐字一致（OK）；② 文件窗口里 `apps/web/**` 唯一命中是 `tsconfig.tsbuildinfo`（gitignored、由出口要求的 `@tm/web typecheck` 生成）；③ `@tm/web test` 16 颗一颗没翻。

**D-5 · 简报 §3② 三条口径的达成情况：全部成立，无放宽**
(i) 常青内核 Web 的 `--dialog-max-h` = `100dvh`，与替换前那条 `max-h-dvh` 计算值逐字同值（源码 + 产物双证，见 §6.3）；(ii) `apps/web/**` 本轮 0 diff（口径见 D-4）；(iii) `@tm/web` 16 / `@tm/app` 470 一颗未翻。**未修改任何 Web 数值。**

**D-6 · 我没改任何 TPM 未点名的既有哨**
`ui.spec.tsx` 既有 701 行**纯追加、0 行变更**（闸门 NOTE `+23/-0` 即此证明）。`:232` 的 `>40`、`:310` 的 `≤10`、`:346` 的无悬空 var、`:239-242` 的"块内无重复声明"、`:337-343` 的颜色项形态，全部原样。

**D-7 · 一处需要 TPM 复核的取舍（不是偏差，是刻意）**
件C 的注释里我**没有**写出 `max-h-dvh` / `max-h-dialog` 两个字面串（写作「弹层高度上限」+「与替换前的旧写法逐字同值」），目的是让件E(d) 是干净的全文计数、不依赖注释排除。若 TPM 要注释里点名旧类串，则 (d) 的口径要同时改成"去注释后计数"，两颗必须成对改。

**未完项：无。** 简报 §5 的 11 条出口命令全部真跑完（第一套 4 条 test + 3 条 typecheck + build + self-test + check-ownership 共 10 条，加本轮专属的产物 grep），未取得非零退出码。

---

## §9 一句话结论

`--dialog-max-h` 已成两端唯一高度上限口径：老内核（App 地板 Chrome 84）吃兜底 `92vh`、常青内核吃 `@supports` 内的 `100dvh`（Web 计算值逐字不变），App 宿主第 4 条白名单把它覆写成 `calc(100vh - var(--sp-6) * 2)` ⇒ 每侧留距 24px（375×667 档上限 619px），缺陷修进了产物（`@supports` 与三条 `--dialog-max-h` 值均可 grep 命中），5 颗 8+8+12+10+24 额度内落地、出口 168/470/68/16/0 错/22 产物/157 自测/ownership exit 0、两证全绿。
