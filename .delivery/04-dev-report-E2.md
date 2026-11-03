# 开发报告 — 批次3 出口轮 E2（测试基建工程师）

- 轮次：**出口轮 E2**。交付面 = A-30-5（`vitest.workspace.ts` 缺 `@tm/web`）+ A-30-6（`apps/web/playwright.config.ts` 不存在）+ RK-10/`@tm/app` 登记两项。
- 铁律遵守：**零 git 写操作**（本轮只跑过 `git status`/`git diff` 只读命令）；未触碰 `test/contract/trpc-shape.baseline.json`（E3）；未触碰 `tools/**`、`.gitignore`（E1）、`packages/server/src/trpc/**`、`routers/review.ts`、`services/review-service.ts`（T-07/T-10）、`.delivery/01-prd.md`（PM）。
- 本报告按 A-32-9 口径附**盘面数字对账表**（§5）。

---

## 0. 改前盘面事实（TPM 简报 → 我逐条实测复核）

| 简报陈述 | 我的实测命令 | 实测结果 | 一致性 |
|---|---|---|---|
| `vitest.workspace.ts` 只有 5 个 project，无 `@tm/web` | `Read vitest.workspace.ts` | `@tm/shared` / `@tm/ui` / `@tm/server` / `@tm/agent` / `@tm/app` 共 5 条，确无 `@tm/web` | ✅ |
| `apps/web/test/home-shell.spec.tsx` 已在盘、20184B、从未被跑 | `ls -la apps/web/test` | `home-shell.spec.tsx` **20184 B**（mtime 09-19 21:31） | ✅ 字节数逐字吻合 |
| `apps/web/e2e/home.spec.ts` 5885B 在盘 | `ls -la apps/web/e2e` | `home.spec.ts` **5885 B** | ✅ |
| `apps/web/playwright.config.ts` 不存在 | `ls -la apps/web` | 该目录下**无** `playwright.config.ts`（只有 `next.config.ts`/`tailwind.config.ts`/`tsconfig.json`/`postcss.config.js`） | ✅ |
| 根 `test` = `vitest run`；`apps/web` 无 `test` 脚本 | `node -e require(...)/package.json` | 根 `scripts.test = "vitest run"`；`@tm/web` scripts 只有 `dev/build/start/typecheck/lint`，**无 `test`** | ✅ |
| `@playwright/test` 是否装了需实测 | `ls apps/web/node_modules/.bin \| grep -i play`；`ls node_modules/.bin`；`grep -n playwright package.json` | `apps/web/node_modules/.bin/playwright*` **存在**，`apps/web/node_modules/@playwright/test/` **存在**，`apps/web/package.json` devDep `"@playwright/test": "^1.63.0"`；**根 `node_modules/.bin` 无 playwright**、根 `package.json` grep `playwright` = **0 命中**；`apps/app/package.json` grep `playwright` = **0 命中** | ✅ 已装（仅 apps/web 一处） |
| Playwright 浏览器内核 | `ls ~/AppData/Local/ms-playwright` | **`(no ms-playwright cache)`** → 本机无内核，真跑 e2e 不可能（→ A-29 第 3 条收口） | — |

### 0-改前关键取证：`@tm/web` 这条 project 根本不存在（静默不跑的机器证据）

```
$ npx vitest run --project @tm/web
 DEPRECATED  The workspace file is deprecated and will be removed in the next major.
             Please, use the `test.projects` field in the root config file instead.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Error: No projects matched the filter "@tm/web".
    at Vitest._setServer (file:///E:/CC/tomorrow-memory/node_modules/.pnpm/vitest@3.2.7_.../vitest/dist/chunks/cli-api.DVe0nWUx.js:9346:22)
```

→ 这正是 A-30-5 说的"静默不跑"：`pnpm test`（= `vitest run`，不带 `--project`）会**正常退出 0**，但 5 个 project 的 `root` 里没有一个覆盖 `apps/web/`，所以 `home-shell.spec.tsx` 的**全部用例（实测收集到 16 条，见 §5-3）一条都不进收集**。

> ⚠ **请先读 §6-7**：本轮实测发现一个比 A-30-5 更上位的盘面事实 —— 全仓 24 个测试文件与 `vitest.workspace.ts` 本身**都是 git 未跟踪状态**（`HEAD` 里 0 个 spec）。它决定"A-30-5 修完"这句话今天在 CI 里仍然不成立。本轮按 A-33-10 口径**未做任何 git 写操作**，只做登记并提请 TPM。

（下接 §1）

---

## 1. 交付①：`vitest.workspace.ts` 补 `@tm/web` project（A-30-5）+ `apps/web` 的 `test` 脚本

**改动文件（2 个，均在本轮授权面内）**
- `vitest.workspace.ts`：新增第 6 条 project `@tm/web` + 文件头注释追加 A-30-5 段。
- `apps/web/package.json`：`scripts` 新增 `"test": "vitest run --root ../.. --project @tm/web"`（与其余四包逐字同构，含 `--root ../..`），并加一条 `//test` 说明键（`@tm/ui` 已有同类先例）。

**沿用 @tm/app 那条的写法**（TPM 简报要求）：`environment:'jsdom'` + `server.deps.inline:['@tm/ui','@tm/shared']` + `include: SPEC_INCLUDE`（共用发现口径，未新造）+ `root: projectRoot('./apps/web')`（绝对路径，A-18-2）。

**两处必要的 project 级补充**（不属于放宽，属"让已盘上的用例能被编译/解析"）：

| 补充 | 为什么必须 |
|---|---|
| `resolve.alias: { '@': projectRoot('./apps/web/src') }` | `apps/web/test/home-shell.spec.tsx:110-114` 以 `@/app/(user)/page`、`@/components/**` 引源码。`@/*` 只写在 `apps/web/tsconfig.json` 的 `paths` 里，而 **Vite/vitest 不读 tsconfig paths**（Next 自己才消费它）→ 不配别名则收集阶段就 `Failed to resolve import`。`@tm/app` 那 4 个 spec 只用相对路径 + `@tm/shared`，所以它不需要别名，这是两包的真实差异，不是我另起一套。 |
| `esbuild: { jsx: 'automatic' }` | 实测第一次跑：**8 failed / 8 passed（16）**，8 条红全同因 `ReferenceError: React is not defined`，栈顶 `src/components/home/decor-layer.tsx:12`。根因：`apps/web/tsconfig.json:13` 是 Next 约定的 `"jsx": "preserve"`（`packages/ui/tsconfig.json:4` 与 `apps/app/tsconfig.json:7` 都是 `react-jsx`），esbuild 遇 `preserve` 编成 `React.createElement` 且不注入 import。这里把**测试运行时的编译方式**对齐到 Next 实际语义（SWC 走自动运行时），**未动 `apps/web/src/**` 一行、未删/未放宽任何断言**。 |

改后单跑该工程（`--project @tm/web`）：

```
$ pnpm --filter @tm/web test
$ vitest run --root ../.. --project @tm/web
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.7 E:/CC/tomorrow-memory

 ✓  @tm/web  test/home-shell.spec.tsx (16 tests) 470ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  01:12:08
   Duration  3.14s (transform 392ms, setup 0ms, collect 1.39s, tests 470ms, environment 495ms, prepare 165ms)
```

→ **`home-shell.spec.tsx` 从"从未被跑"变为 16/16 绿。** 收集到的正是 §10.2 T-12 判据①②③④⑤ 的 jsdom 侧用例。

## 2. 交付②：强制疫苗（A-30-5 的"没有疫苗 = 未修"条款）

疫苗文件 = `apps/web/test/vaccine-e2-discovery.spec.ts`（一条 `expect(1).toBe(2)`，无条件红，文件名含 `vaccine-e2` 便于 grep）。

### 2-步骤 1：放入必红用例 → 跑根命令 `pnpm test` → **它被看见并报红**

```
$ pnpm test          # 根 scripts.test = vitest run（不带 --project）
EXIT=1

 ❯  @tm/web  test/vaccine-e2-discovery.spec.ts (1 test | 1 failed) 18ms
   × E2 疫苗 @tm-web-discovery > 本条必须红：证明根 pnpm test 能发现 apps/web/test/** 16ms
     → expected 1 to be 2 // Object.is equality
 ✓  @tm/web  test/home-shell.spec.tsx (16 tests) 838ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo

 FAIL   @tm/web  test/vaccine-e2-discovery.spec.ts > E2 疫苗 @tm-web-discovery > 本条必须红：证明根 pnpm test 能发现 apps/web/test/**
AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

- 2
+ 1

 ❯ test/vaccine-e2-discovery.spec.ts:11:15

 Test Files  2 failed | 22 passed (24)
      Tests  2 failed | 587 passed (589)
   Start at  01:12:38
   Duration  18.73s
```

**判读**：`@tm/web` 前缀出现在收集行与 FAIL 行 ⇒ 根命令确实走进了 `apps/web/test/**`；`EXIT=1` ⇒ 红会打断门禁，不是"打印后被吞掉"。另一条红 `trpc-shape` 基线 = **A-28-1 已知留红，owner 是出口轮 E3（基线再生）**，本轮按简报明令**未碰** `test/contract/trpc-shape.baseline.json`，也未跑 `TRPC_SHAPE_UPDATE=1`。

### 2-步骤 2：删除疫苗 → 再跑根命令 → 恢复正常

```
$ rm apps/web/test/vaccine-e2-discovery.spec.ts
$ ls apps/web/test/
home-shell.spec.tsx
--- vaccine file removed ---

$ pnpm test
EXIT=1
(no vaccine lines — expected)

 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）

 Test Files  1 failed | 22 passed (23)
      Tests  1 failed | 587 passed (588)
   Start at  01:13:11
   Duration  18.35s
```

**算术对账（疫苗有效性的第二重证明）**：文件数 `24 → 23`、用例数 `589 → 588`，差值恰为 1 个文件 / 1 条用例 = 被删的疫苗；`grep vaccine` 在第二次输出里 **0 命中**。剩余唯一红 = `trpc-shape`（E3 名下，非本轮引入，也非本轮可修）。

> 口径说明：A-30-5 要求的是"根 `pnpm test` 能看到 apps/web 并报红"，两步均已达成。"恢复正常"**不等于 exit 0**，因为 A-28-1 的基线红按计划留到 E3；这一点如实保留，未做任何粉饰。

## 3. 交付③：`apps/web/playwright.config.ts` 建一次（A-30-6）

新建 `apps/web/playwright.config.ts`（3046 B），逐条对准 A-30-6 的字面要求：

| A-30-6 要求项 | 落地 |
|---|---|
| `testDir:'./e2e'` | `testDir: './e2e'` + `testMatch: /.*\.spec\.ts/`（双保险：默认收集吞 Vitest 文件那个坑就是这条来解的） |
| `webServer` 用 `next start -p 3100` | `command: 'pnpm exec next start -p 3100'`，`cwd: __dirname`（= apps/web），`url: 'http://127.0.0.1:3100'` 做就绪探针，`timeout: 120_000`，`stderr: 'pipe'` |
| 处理 `reuseExistingServer` | `reuseExistingServer: !process.env.CI` —— 本地已有 3100 在服务就直接复用（不打断开发者手跑的实例），CI 必须自起自弃 |
| projects 两档 viewport | `chromium-375x667`（`deviceScaleFactor:2` + `isMobile` + `hasTouch`，R-38/R-40 移动主战场）/ `chromium-1280x900`（`md:` 断点桌面档） |
| 批次4 不再各造一套 | 文件头显式写了禁止段落点名 T-15/T-16：新增 `e2e/{study,wordbook,profile,auth-wall,upgrade}.spec.ts` 一律落进 `apps/web/e2e/`，被两个 project 自动收集；要新档位就在本文件 `projects` 里追加。**配置里没有任何 TODO / 占位 / 待填字段** |
| 端口为什么不是 3000 | `apps/web/package.json` 的 `dev`/`start` 都占 3000；e2e 用 3100 才不与 `pnpm dev:web` 抢端口。`use.baseURL` 同步指到 3100，所以 `e2e/home.spec.ts` 里的 `page.goto('/')` 原样可用，**该文件一行未改** |

顺带补齐的 CI 侧默认值（属基线不属放宽）：`forbidOnly: !!process.env.CI`、`retries: CI?2:0`、`reporter: CI?github+dot:list`、`trace:'on-first-retry'`、`screenshot:'only-on-failure'`、`video:'retain-on-failure'`、`expect.timeout:10_000`。

## 4. 交付④：跑通性证据

### 4-1 `playwright test --list` —— 成功，且 Vitest 文件不再被吃

```
$ pnpm --filter @tm/web exec playwright test --list
Listing tests:
  [chromium-375x667] › home.spec.ts:27:7 › T-12 首页与移动导航 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零
  [chromium-375x667] › home.spec.ts:46:7 › T-12 首页与移动导航 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框
  [chromium-375x667] › home.spec.ts:67:7 › T-12 首页与移动导航 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认
  [chromium-375x667] › home.spec.ts:87:7 › T-12 首页与移动导航 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句
  [chromium-375x667] › home.spec.ts:103:7 › T-12 首页与移动导航 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截）
  [chromium-1280x900] › home.spec.ts:27:7 › T-12 首页与移动导航 › ① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零
  [chromium-1280x900] › home.spec.ts:46:7 › T-12 首页与移动导航 › ② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框
  [chromium-1280x900] › home.spec.ts:67:7 › T-12 首页与移动导航 › ③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认
  [chromium-1280x900] › home.spec.ts:87:7 › T-12 首页与移动导航 › ④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句
  [chromium-1280x900] › home.spec.ts:103:7 › T-12 首页与移动导航 › ⑤ 首页无裸 fetch（构建产物 + 运行时拦截）
Total: 10 tests in 1 file
```

关键点：**`1 file`**。`test/home-shell.spec.tsx` 没有进收集 ⇒ T-12 §1.7 记录的那条 `Vitest cannot be imported in a CommonJS module` 假红由此关闭。5 条用例 × 2 档 viewport = 10。

### 4-2 真跑 e2e —— **本机无浏览器内核，按 A-29 第 3 条收口**

```
$ ls ~/AppData/Local/ms-playwright
(no ms-playwright cache)
```

⇒ **e2e 一条都没有真实执行过。本报告不含任何 e2e 运行结果，也没有伪造任何"跑过"的输出。** A-29 收口三件逐件交代：
1. 配置文件在盘 = 达成（§3）
2. `--list` 成功 = 达成，10 tests in 1 file（§4-1）
3. `pnpm --filter @tm/web build` 绿 = **未达成**，原因不在本轮，见 §4-3

**待 T-23 在 CI 内跑通**：`pnpm --filter @tm/web build && pnpm --filter @tm/web exec playwright test`（CI 需 `playwright install chromium`）。

### 4-3 `pnpm --filter @tm/web build` —— 红，且红点 100% 不在本轮改动面

```
$ pnpm --filter @tm/web build
EXIT=1
   Next.js 15.5.24
   Creating an optimized production build ...
 ✓ Compiled successfully in 5.4s
   Linting and checking validity of types ...
Failed to compile.

./src/app/(user)/profile/page.tsx:92:20
Type error: Argument of type 'unknown' is not assignable to parameter of type 'SetStateAction<number>'.

  90 |     if (profile.data) {
  91 |       setNickname(profile.data.nickname);
> 92 |       setDailyGoal(profile.data.dailyGoal);
     |                    ^
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @tm/web@3.0.0 build: `next build`
Exit status 1
```

**归因（三条独立证据）**：
1. 全量 `pnpm --filter @tm/web typecheck` = **恰好 1 条错误**，就是上面这条（`error TS2345`，exit 2）。而 `tsc --noEmit` 的范围**包含**我新建的 `playwright.config.ts`（`apps/web/tsconfig.json` 的 `include: ["**/*.ts"]` 覆盖根目录）⇒ **我的新文件贡献 0 条错误**。
2. `git diff --stat` 该文件 = `6 insertions(+), 6 deletions(-)`，且 `git diff` 只有**一个 hunk**（默认上下文 `@@ -15,12 +15,12 @@`，起始行 15、长度 12 → 覆盖第 15~26 行，正是 `import` 区，表头就是 `import { CalendarDays, Camera, Flame, LogOut, Save, Target, BookMarked } from 'lucide-react'`）。**第 92 行及其上下文一字未动** ⇒ 这条红不是"刚有人改了这行"，而是**上游类型推断变了**。
3. 时间线与既往登记同源：`packages/server/src/trpc/routers/profile.ts` 是 **`??` 未跟踪新文件、mtime 09-19 22:43**（T-11 拆分产物）；而 T-12 报告在 21:39 那轮 build 里就记录过**同一条** `profile/page.tsx:92`，并给出同一诊断（原话："**`ProfileDto.dailyGoal` 在 web 侧被推成 `unknown`，像是 `@tm/shared` DTO 导出形状未到位**"），且把它**点名归 T-15**（T-12 报告 §1.2 与"已知限制"第 1 条）。
   ⇒ 结论：这是 **T-12 出口就已知、已登记给批次4 T-15 的存量阻塞**。A-33 那轮之后 `packages/server` 的 5 条已被修到 0（server typecheck 现在 0 错），只剩这一条，不是我引入。

**本轮没有顺手修它**（铁律：并行 agent 名下跑红的东西注明即可）。给 TPM 的判断材料：A-29 的收口口径把"build 绿"当 e2e 豁免的前置之一，而该前置当前被 T-11 的 `profile.get` 出参形状 + T-15 未开工共同卡住。两条出路：
- (a) 维持现状，把 §4-3 正式钉给批次4 T-15（= T-12 已有的登记，零额外成本）；
- (b) 授权一个微轮给 `routers/profile.ts` 的 `get` 加显式 `output` parser —— 但这**会打穿 A-33 待观察 F-7**（"本期补 output parser 会把纯搬迁变成改行为"）**并改变基线形状**（那是 E3 的账）。

我**没有**擅自选 (b)，因为 (b) 需要裁决而不是一轮工时。**需要 TPM 拍板。**

### 4-4 我这两处改动自身的静态门禁（防"修基建反而弄脏别的门禁"）

```
$ npx eslint vitest.workspace.ts apps/web/playwright.config.ts --max-warnings=0
ESLINT_EXIT=0

$ npx prettier --check vitest.workspace.ts apps/web/playwright.config.ts apps/web/package.json
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

## 5. 盘面数字对账表（A-32-9 口径：简报数字 vs 实测数字，逐条归因）

| # | 项 | 简报/上游数字 | 本轮实测 | 归因 |
|---|---|---|---|---|
| 1 | workspace project 数 | 5（无 `@tm/web`） | 改前 5（已核实）/ 改后 **6** | 交付①。"改前=5"的机器证据 = §0 末尾 `No projects matched the filter "@tm/web"` |
| 2 | `home-shell.spec.tsx` 体积 | 20184 B | **20184 B** | 逐字吻合 |
| 3 | 该文件用例数 | 简报口径"20 个" | **收集到 16 条 / 7 个 describe 块**（映射到 §10.2 的 5 条判据） | 简报的 20 来自 `grep -c "it(\|test("`，会把注释与 helper 行算进来；vitest 真实收集 16。**未放宽任何断言**：判据① 4 条、判据② 5 条（移动导航结构 3 + 更多抽屉 1 + 键盘让位 1）、判据③ 4 条、判据④ 2 条、判据⑤ 1 条 = 16 |
| 4 | `e2e/home.spec.ts` | 5885 B / 5 条 | **5885 B / 5 条 test** | 逐字吻合 |
| 5 | e2e 可收集数 | T-12 §1.7 记 5 条 | **10 条**（5 × 2 viewport） | 差异 = A-30-6 要求的两档 viewport 落地了；T-12 那轮没有配置文件，只有默认单 project |
| 6 | `@playwright/test` 安装态 | 要求实测 | `apps/web` 有（声明 `^1.63.0`，实装 **1.63.0**）；根 `node_modules/.bin` **无**；根 `package.json` grep `playwright` **0 命中**；`apps/app` **0 命中** | §6-1 登记（RK-10，T-23） |
| 7 | Playwright 浏览器内核 | — | `~/AppData/Local/ms-playwright` **不存在** | 环境缺件 → A-29 第 3 条收口，非缺陷 |
| 8 | 根 `pnpm test` 总盘 | 简报只给了"web 从没被跑" | 改后（疫苗已删）= **23 files / 588 tests：587 passed + 1 failed** | 唯一红 = `trpc-shape` 基线（A-28-1，**E3 名下**） |
| 9 | 分项目分解 | — | `server` 14/326、`ui` 3/140、`app` 4/56、`shared` 1/50、**`web` 1/16（原为 0/0）**、**`agent` 0/0** | `web` 16 条全绿；`agent` 见 §6-2 |
| 10 | `@tm/server` | A-32 = 286 passed/1 failed/1 skipped（12 files）；A-33 = 320 passed/1 failed | **326 tests / 1 failed**（= 325 passed，14 files） | 两轮之间 +6 条 = T-07 第六轮（N-1 errorFormatter 疫苗）与 T-10 第三轮（N-2 双门面等值）新落的用例；**与本轮无关**（我的改动是 project 级新增，`SPEC_INCLUDE`/其它 5 条 root 一字未改） |
| 11 | 疫苗前后差值 | 要求两步输出 | 文件 `24→23`、用例 `589→588`，第二次 `grep vaccine` **0 命中** | 差值恰为疫苗本身，无夹带 |
| 12 | `@tm/app` 发现是否为 0 | 简报怀疑为 0 | **不是 0：4 files / 56 tests 全绿** | vitest 按**文件系统**发现，与 git 跟踪态无关；见 §6-3 |
| 13 | `@tm/agent` | 简报未提 | **0 files / 0 tests**（按包跑 exit 1） | `packages/agent` 无任何 spec；本轮只登记，见 §6-2 |
| 14 | `--filter @tm/web typecheck` | T-12 记 6 条错 | **1 条**（`profile/page.tsx:92`） | server 那 5 条已由 T-07/T-11 修到 0；剩余 1 条 = T-12 已钉给 T-15 的存量，见 §4-3 |

## 6. 登记（本轮**不改代码**）

### 6-1 RK-10：两端 playwright 未与钉版本面同源（T-23 名下）
- `pnpm-workspace.yaml` 的 `overrides`（RK-10/S13 的唯一真相面）实读 = `react` / `react-dom` / `@types/react` / `@types/react-dom` / `ts-fsrs` / `zod` 六项，**无 playwright**。
- `apps/web/package.json` 写的是 **caret** `"@playwright/test": "^1.63.0"`；`pnpm-lock.yaml:1818/6344` 当前解析 `@playwright/test@1.63.0`，并带 `playwright@1.63.0` / `playwright-core@1.63.0`；`next@15.5.24` 的 peer 里也挂了 `(@playwright/test@1.63.0)`。
- `apps/app`（移动端壳）**完全没有 playwright**。
- ⇒ 今天"仓内只有一个 playwright 版本"是**巧合而非钉死**：caret + 无 override，下次 `pnpm install` 允许解析到 1.64+。修法（进 overrides 或改定点）属 RK-10 / T-23，**本轮一行未动**（简报明令"只登记不修"）。

### 6-2 `@tm/agent` project 在 workspace 里但**一个用例都没有**
```
$ pnpm --filter @tm/agent test
No test files found, exiting with code 1
projects: @tm/agent
include: test/**/*.spec.{ts,tsx}, src/**/*.spec.{ts,tsx}
Exit status 1
```
- 全盘 `find` 证实 `packages/agent/` 下**无任何 `*.spec.ts(x)`**。
- **两口径不对称（这是真正的坑）**：根 `pnpm test` 跑全 workspace 时，agent 的 0 发现**不报错、也不出现在汇总里**（after 日志 grep `no test files` = 0 命中，总盘仍报 23 files/588 tests）；而按包 `pnpm --filter @tm/agent test` **exit 1**。→ CI 若按包并行跑，agent 恒红；若只跑根命令，agent 恒"静默 0"。**两种都不等于"测过了"**，且后者正是 A-30-5 给 `@tm/web` 定性的同一种病。
- 本轮**未动**：给 agent 补用例属 agent 域功能任务而非测试基建，简报未授权。请 TPM 钉给 `packages/agent/src/**` 的责任任务（`tools/ownership.json:570`）。

### 6-3 `@tm/app`：发现面**不为 0**（回答简报第 5 条）
```
$ pnpm --filter @tm/app test
 ✓  @tm/app  test/rest-fetcher.spec.ts (18 tests) 20ms
 ✓  @tm/app  test/startup.spec.ts (16 tests) 27ms
 ✓  @tm/app  test/offline-queue.spec.ts (12 tests) 323ms
 ✓  @tm/app  test/router.spec.tsx (10 tests) 1269ms

 Test Files  4 passed (4)
      Tests  56 passed (56)
```
- 结论：**4 文件 / 56 用例全部被发现且全绿**。`apps/app` 内容多为 `??` 未跟踪，但 vitest 的发现是**文件系统级**、与 git 跟踪态无关 ⇒ 简报那一问的答案是"否，不为 0"。
- 真正的问题在另一头：**未跟踪 ⇒ CI 从 HEAD 拉不到**（与 A-33-10 的 `build-apk.sh` 同一类账，Phase 8 由 TPM 统一入库）。`git status --porcelain` 本轮实测共 **160 条**，其中 `apps/app` 大面积 `??`。这条并入 §11 给 TPM。

### 6-4 `.gitignore` 缺 Playwright 产物忽略项（E1 名下，本轮未碰）
- `grep -n "playwright\|test-results\|playwright-report" .gitignore` → **(none)**。
- 配置一旦真跑（T-23/CI），`apps/web/test-results/`、`apps/web/playwright-report/`、trace 与 video 会立刻污染 `git status`。`.gitignore` 归 T-01/E1（A-33-9 已点名 E1 改 `.gitignore`），**我没有动它一行**，请 E1 顺带补：`test-results/`、`playwright-report/`、`blob-report/`、`playwright/.cache/`。

### 6-5 `search-section` 的 `act()` 警告（A-30-9 已记，归 T-22）
`pnpm --filter @tm/web test` 输出里仍存在：`An update to SearchSection inside a test was not wrapped in act(...)`（该用例本身 `✓` 通过，不影响结论）。A-30-9 已钉给 T-22，本轮按铁律未动。

### 6-6 vitest 3 的 workspace 文件弃用告警（登记，非本轮范围）
每次 vitest 运行都打印：`DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the test.projects field in the root config file instead.` 当前 vitest 锁 `^3.2.7`（实装 3.2.7），本文件仍是唯一装配点。**迁移到 `test.projects` 是 T-01 名下的一次独立改动**，本轮刻意不做（它会把 6 个 project 的写法整体重写，与本出口轮的"最小面修复 A-30-5"是两个目标，混做会让疫苗证据失去可比性）。

### 6-7 【**本轮最重要的发现，比 A-30-5 本身更严重**】全仓 **24/24 个测试文件 + `vitest.workspace.ts` + `tools/boundaries.mjs` 全部是 `??` 未跟踪**

```
$ git ls-tree -r HEAD --name-only | grep -c "spec\.ts"
0

$ git ls-files "*spec.ts" "*spec.tsx" | wc -l
0

$ for f in vitest.workspace.ts package.json pnpm-workspace.yaml apps/web/package.json tools/boundaries.mjs; do
    git ls-files --error-unmatch "$f" >/dev/null 2>&1 && echo "TRACKED  $f" || echo "UNTRACKED $f"; done
UNTRACKED  vitest.workspace.ts
TRACKED    package.json
TRACKED    pnpm-workspace.yaml
TRACKED    apps/web/package.json
UNTRACKED  tools/boundaries.mjs
```

逐个点名（`find` 出 24 个 spec，逐条 `git ls-files --error-unmatch`）：**24 个全部 UNTRACKED**
- `packages/server/test/**` 10 个（含 `trpc-shape.spec.ts` 与 `test/contract/`）
- `packages/ui/test/**` 3 个、`packages/shared/test/contracts.spec.ts` 1 个
- `apps/app/test/**` 4 个、`apps/web/test/home-shell.spec.tsx` 1 个、`apps/web/e2e/home.spec.ts` 1 个
- `HEAD` 的根目录树里**根本没有** `vitest.workspace.ts`、`tools/`、`.delivery/` 这三项。

**后果（这条决定了 A-30-5 的修法在 CI 里今天仍然不成立）**：A-30-5 治的是"装配文件里少一条 project ⇒ 静默不跑"。但真实盘面是**整个装配文件和全部用例都只活在工作区**。CI 从 HEAD 干净克隆后：`vitest.workspace.ts` 不存在 → 根 `pnpm test`（= `vitest run`）退回 vitest 的默认发现口径，仓内一个 `*.spec.*` 都找不到 → **`No test files found`**（agent 那一跑已经把这条路径的行为实测出来了，见 §6-2）。也就是说：**588 条用例对 CI 的实际贡献目前是 0，而"批次3 已交付 588 条用例"这句话在工作区里是真的。**

这与 A-33-10 是**同一类病、但量级大两个数量级**（A-33-10 只点了 `build-apk.sh` 与 `assemble_apk.py` 两个文件）。按 A-33-10 的既定口径，commit 由 **TPM 在 Phase 8 向用户确认后一次性做**，任何 agent（含出口轮）不得自行 `git add`——**所以我没有碰它，只是把它抬到登记表第一条**。建议 TPM 的处置：
1. 批次3/4/5 内所有"测试已跑通 / 门禁已生效"的结论，一律显式附 **"前提：`vitest.workspace.ts` + `tools/**` + 全部 `test/**` 入库"**（照抄 A-33-10① 的做法）。
2. 让 T-21 的 `preflight.mjs` 除 A-33-10② 那两条之外，**再加一条只读检查**：`git ls-files --error-unmatch vitest.workspace.ts tools/boundaries.mjs` + `git ls-files "*spec.ts*" | wc -l` 为 0 即标红。
3. T-22 接 CI 时，CI 的**第一条**判据应是"克隆后 `pnpm test` 收集到的文件数 > 0 且等于工作区口径 23"，否则整个 Phase 5 的证据链都是悬空的。

## 7. 越界申请（机检已跑，红着，等 TPM/E1 处置）

`--check-ownership` 按 `tools/ownership.json` 判我**一处越界**（A-30-5 的 owner 列写的是"T-01，出口轮 E2"，但归属表没跟上）：

```
$ node tools/boundaries.mjs --check-ownership --task T-01 --files "vitest.workspace.ts,apps/web/package.json,apps/web/playwright.config.ts"
NOTE apps/web/playwright.config.ts：归属表无条目（no-entry，不阻断）
RED  apps/web/package.json 由 T-04 独占（当前任务 T-01）— A-4：T-04 建基线；T-12/T-15/T-16 只允许新增 dependency 行

--check-ownership task=T-01 触碰 3 个文件 → 1 处越界
EXIT=1
```

- `vitest.workspace.ts` → **无 RED**（T-01 独占，正是本轮交付面）。
- `apps/web/package.json` → RED：`ownership.json:302-312` 的 `predecessorAllowedDiff.kind` 只有 `"add-dependency-lines-only"`（applies_to T-12/T-15/T-16），**没有任何通道允许 T-01/E2 新增 `scripts` 行**。
- 我的处置：**保留改动 + 保留这条红**，不为了门禁变绿去改 `tools/ownership.json`（那是 E1 名下，且 A-33-4 正在给这套通道加 `bounded-edit:<裁决号>`）。这条 = A-30-10 那条欠账的**又一个实例**（"按清单而非按裁决判定"）。请 TPM 用 A-30-10 的通道把 `add-script-lines-only` 之类动作登记进 `apps/web/package.json` 条目，或由 E1 在 `--task` 里加 `E2` 身份。

## 8. 完成清单

| 简报交付项 | 状态 | 落点 | 判据证据 |
|---|---|---|---|
| ① `vitest.workspace.ts` 补 `@tm/web` + `apps/web` 的 `test` 脚本 | **done** | `vitest.workspace.ts`、`apps/web/package.json` | §1（改前 exit-1 取证 + 改后 16/16 绿） |
| ② 强制疫苗（两步输出） | **done** | `apps/web/test/vaccine-e2-discovery.spec.ts`（已删除） | §2 两步真实输出 + §5-11 算术对账 |
| ③ `apps/web/playwright.config.ts` 建一次 | **done** | `apps/web/playwright.config.ts` | §3 需求逐条对照表 + §4-1 |
| ④ 跑通性证据 | **部分（按 A-29 收口）** | `--list` 达成；build 被他人存量红卡住 | §4-1 / §4-2 / §4-3 |
| ⑤ `@tm/app` 发现情况登记 | **done** | 报告 §6-3（零代码改动） | `4 passed (4) / 56 passed (56)` ⇒ **不为 0** |
| 禁区：`trpc-shape.baseline.json` / `TRPC_SHAPE_UPDATE=1` | **未碰** | — | 全程未执行该 env；§2 两步输出里基线红原样保留 |
| 禁区：`tools/**`、`.gitignore`、`trpc/init.ts`、`routers/review.ts`、`services/review-service.ts`、`01-prd.md` | **未碰** | — | §4/§6 的处置方式都是"登记" |
| 铁律：零 git 写操作 | **遵守** | — | 本轮只跑过 `git status --porcelain` / `git diff --stat` / `git diff -U2`（全为只读） |

## 9. 自检与冒烟（命令清单，输出见对应小节）

| 命令 | 结果 | 出处 |
|---|---|---|
| `npx vitest run --project @tm/web`（改前） | `Startup Error: No projects matched the filter "@tm/web".` | §0 |
| `pnpm --filter @tm/web test`（改后） | `Test Files 1 passed (1)` / `Tests 16 passed (16)` | §1 |
| `pnpm test` + 疫苗 | `EXIT=1`，`@tm/web test/vaccine-e2-discovery.spec.ts` 报红，`2 failed \| 22 passed (24)`、`2 failed \| 587 passed (589)` | §2 步骤 1 |
| `pnpm test` − 疫苗 | `EXIT=1`（仅剩基线红），`1 failed \| 22 passed (23)`、`1 failed \| 587 passed (588)` | §2 步骤 2 |
| `pnpm --filter @tm/web exec playwright test --list` | `Total: 10 tests in 1 file` | §4-1 |
| `pnpm --filter @tm/web build` | **红**：`profile/page.tsx:92` TS2345（他人存量） | §4-3 |
| `pnpm --filter @tm/web typecheck` | **红**：同 1 条 TS2345（exit 2），我的新文件 0 错 | §4-3 |
| `npx eslint <我改的文件> --max-warnings=0` | exit 0 | §4-4 |
| `npx prettier --check <我改的文件>` | `All matched files use Prettier code style!` | §4-4 |
| `pnpm --filter @tm/app test` | `4 passed (4)` / `56 passed (56)` | §6-3 |
| `pnpm --filter @tm/agent test` | `No test files found, exiting with code 1` | §6-2 |
| `node tools/boundaries.mjs --check-ownership --task T-01 --files …` | 1 处越界（`apps/web/package.json`），红着未处置 | §7 |

## 10. 契约偏差

无。本轮不涉及任何 API / tRPC 形状 / shared 导出：`vitest.workspace.ts` 与 `playwright.config.ts` 都在测试装配面，`apps/web/package.json` 只多了一条 `scripts.test` 与一条 `//test` 说明键，**零依赖变更**（`dependencies`/`devDependencies` 一字未动，所以 T-12 的 `add-dependency-lines-only` 语义也没被我破坏）。

## 11. 已知限制与 TODO（诚实列出）

1. **【最高】本轮的修好状态目前只在工作区成立**（§6-7）：全仓 24 个 spec + `vitest.workspace.ts` + `tools/boundaries.mjs` 都是 `??` 未跟踪，`HEAD` 里 0 个 spec ⇒ 干净克隆后 CI 一条用例都收不到。**A-30-5 的"修完"在 CI 里要以"这些文件入库"为前提才成立。** 按 A-33-10 的口径，commit 归 TPM 在 Phase 8 统一做，**我没有 `git add` 任何东西**。
2. **e2e 从未真跑**（本机无 chromium 内核）⇒ §10.2 T-12 判据②的"100dvh 不遮输入框"、判据④的"释义行数 ≤2"这两类**像素/布局**结论目前只有 jsdom 侧的结构等价证据，**真机口径仍空**。待 T-23 在 CI 跑通（§4-2）。
3. **`pnpm --filter @tm/web build` 未绿**，卡在 §4-3 那条 TS2345（T-12 → T-15 存量）。它同时是 A-29 收口三件里的第 3 件，所以本轮只能算"两件达成 + 一件因他人红未达成"。
4. **`@tm/agent` 恒 0 发现**（§6-2）：出口轮没修，因为补用例不是基建活。如果批次3 出口把它当"T-07/T-08 agent 域已测"的证据，那是**假绿**。
5. **playwright 配置未在真实浏览器上验证过**：`--list` 只证明"配置可被解析 + 用例可被收集"，不证明 `webServer` 真能把 `next start -p 3100` 拉起来（那需要内核 + 绿 build）。T-23 首次真跑请优先验这一点。
6. **`reuseExistingServer` 的语义边界**：本地复用的判定只看 `http://127.0.0.1:3100` 是否可连。若 3100 上跑的是**旧构建**（例如改了 `src/**` 忘了重跑 build），复用会拿陈旧产物 → 假绿。T-23 在 CI 里不受影响（CI 恒自建）。
7. **本轮我新增的未跟踪文件只有 1 个**：`apps/web/playwright.config.ts`（疫苗文件已按要求删除，`apps/web/test/` 现仅 `home-shell.spec.tsx`）。`git status --porcelain` 全盘 160 条，绝大多数是他人改动。

## 12. 给测试的提示（Phase 5 输入）

- **重点测**：`apps/web` 现在有两条**互不吞并**的测试通道 —— vitest 走 `test/**` + `src/**`（根 `pnpm test` 或 `pnpm --filter @tm/web test`），Playwright 只走 `e2e/**`（`pnpm --filter @tm/web exec playwright test`）。任何新 `apps/web` 测试文件放错目录就会静默不跑，这是本轮 A-30-5 的原病。
- **回归哨兵**：若要再次确认 `@tm/web` 工程没被人删回去，最省力的机检 = `npx vitest run --project @tm/web` 是否还收集到 ≥16 条（改前它是 Startup Error）。
- **我没测到的路径**：`webServer` 拉起链路（无内核）；Next 服务端渲染的真实水合差异（jsdom 侧 `home-shell.spec.tsx` 用的是 `createRoot` 客户端渲染，不是 SSR/水合）；`next start` 与 3100 端口占用冲突时的行为。
- **给 E3 的提醒**：本轮**没有**跑过 `TRPC_SHAPE_UPDATE=1`，`test/contract/trpc-shape.baseline.json` 的 mtime 与内容仍是我接手时的状态；§2 两步输出里那条基线红（受影响 procedure = `auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo`）可以当作你再生前的**当前漂移面快照**。另：A-30-2 的"唯一登记例外"要核对的是 `profile.update`（`avatar` 去 `max(500)` + 新增 `daily_goal`），而上面这份清单里**含 `profile.update`、不含 `profile.get`** —— 与 §4-3 那条 `profile.get` 出参推断红是两件事，别并成一条处置。
