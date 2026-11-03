# T-27 开发报告（批次4D · 小轮）—— 单词本「未登录访问」引导卡长出第三颗动作

- 任务代号：**T-27**（A-48 #113 定案修法落地；T-14d 报告 §L-2（`04-dev-report-T-14-d.md:125,148-151`）独立复现同一根因）
- 范围：两端 wordbook 未登录引导卡（App 屏 + Web 页）各删掉整个 `secondary` 属性块，只留 `primary` + `link` 两颗；`wordbook-screen.spec.tsx` 的 C-25 钉牢「恰有两颗、第二颗是注册」。
- 结论：**出口命令 2/2 全绿**（`@tm/app` typecheck ✅ + test 13 files / 268 tests ✅；`@tm/web` typecheck ✅）。C-25 由红转绿，无一条红由本次改动引入，无并发红需要点名。
- 探针用量：**19 / 25**（其中读 `.delivery` 主文档 2 次，均为定点 `Read offset/limit` 与 `grep`，未通读）。

---

## 1. 交付物清单

| # | 文件 | 现行数 | 改前行数 | Δ | 性质 |
|---|---|---|---|---|---|
| 1 | `apps/app/src/screens/WordbookScreen.tsx` | 657 | 657 | 0（四处 hunk 相加） | 修复：删 `secondary` + `link` 换源 + 注释/导入对齐 |
| 2 | `apps/web/src/app/(user)/wordbook/page.tsx` | 287 | 289 | −2 | 修复：对称删 `secondary` + `link` 换源 + 注释/导入对齐 |
| 3 | `apps/app/test/wordbook-screen.spec.tsx` | 1182 | 1166 | +16 | C-25 钉死「动作数 = 2、第二颗 = 注册」 |

行数口径 = `awk 'END{print NR}'`（三文件均以 `\n` 结尾）。文件未被 git 跟踪（整个重构树都是 `??`），故上表「改前」按各 hunk 的行数增减反推，非 `git diff`。

**本次改动只影响一处渲染结果：未登录引导卡少了一颗 `<button>`。** 0 新增文案（渲染串零变化，两颗保留动作的文字仍是 `WORDBOOK_COPY.emptySignedOut.{cta,link}`）、0 个 `data-testid`、0 处与修复无关的 DOM/样式改动；新增的中文全部在 `/* */` 注释里（源码注释，不上屏）。

### 1.1 两文件改动逐字并列（对称性比对）

#### Hunk A —— 未登录引导卡本体（核心修法）

App `apps/app/src/screens/WordbookScreen.tsx`（改前 514–519 → 改后 515–519）：

```tsx
/* ── 改前 ── */
          primary={{ label: WORDBOOK_COPY.emptySignedOut.cta, onClick: () => goLogin('sign-in') }}
          secondary={{
            label: WORDBOOK_COPY.emptySignedOut.link,
            onClick: () => host.navigate('/'),
          }}
          link={{ label: AUTH_COPY.wall.link, onClick: () => goLogin('register') }}

/* ── 改后 ── */
          primary={{ label: WORDBOOK_COPY.emptySignedOut.cta, onClick: () => goLogin('sign-in') }}
          link={{
            label: WORDBOOK_COPY.emptySignedOut.link,
            onClick: () => goLogin('register'),
          }}
```

Web `apps/web/src/app/(user)/wordbook/page.tsx`（改前 176–187 → 改后 178–185）：

```tsx
/* ── 改前 ── */
          primary={{
            label: WORDBOOK_COPY.emptySignedOut.cta,
            onClick: () => requestLogin({ mode: 'sign-in', returnTo: '/wordbook' }),
          }}
          secondary={{
            label: WORDBOOK_COPY.emptySignedOut.link,
            onClick: () => host.navigate('/'),
          }}
          link={{
            label: AUTH_COPY.wall.link,
            onClick: () => requestLogin({ mode: 'register', returnTo: '/wordbook' }),
          }}

/* ── 改后 ── */
          primary={{
            label: WORDBOOK_COPY.emptySignedOut.cta,
            onClick: () => requestLogin({ mode: 'sign-in', returnTo: '/wordbook' }),
          }}
          link={{
            label: WORDBOOK_COPY.emptySignedOut.link,
            onClick: () => requestLogin({ mode: 'register', returnTo: '/wordbook' }),
          }}
```

对称性核对（三处逐格一致）：

| 槽位 | App | Web | 一致 |
|---|---|---|---|
| 被删的属性名 | `secondary`（含整块 4 行） | `secondary`（含整块 4 行） | ✅ |
| `primary.label` | `WORDBOOK_COPY.emptySignedOut.cta` | 同 | ✅（未动） |
| `primary.onClick` | `goLogin('sign-in')` | `requestLogin({ mode: 'sign-in', returnTo: '/wordbook' })` | ✅ 各自既有登录通道，语义同为「登录 + 回到词本」 |
| `link.label` | `WORDBOOK_COPY.emptySignedOut.link`（**由 `AUTH_COPY.wall.link` 换源**） | `WORDBOOK_COPY.emptySignedOut.link`（同） | ✅ |
| `link.onClick` | `goLogin('register')` | `requestLogin({ mode: 'register', returnTo: '/wordbook' })` | ✅ 未动，仍是注册 |
| 「回首页」那颗 | 整块删除（不改文字、不挪位置） | 整块删除 | ✅ |

#### Hunk B —— 卡上方注释（把「恰两颗」写进现场，防再长出）

```tsx
/* App 改前（507） */
        {/* §3.6.5 行 3「未登录访问」：列表区骨架 + 引导卡并存。 */}
/* App 改后（507–508） */
        {/* §3.6.5 行 3「未登录访问」：列表区骨架 + 引导卡并存。
            引导卡**恰两颗**动作（T-27 / A-48 #113：规范只给主按钮 + 文字链，第三颗「回首页」不在表内）。 */}

/* Web 改前（172 处，无此注释） */
/* Web 改后（172–173） */
        {/* §3.6.5 行 3「未登录访问」：引导卡**恰两颗**动作（T-27 / A-48 #113：规范只给主按钮 + 文字链，
            第三颗「回首页」不在表内）—— 与 App `WordbookScreen.tsx` 对称。 */}
```

#### Hunk C —— `@tm/shared` 导入（`AUTH_COPY` 换源后在本文件 0 引用 ⇒ 收掉）

```ts
/* App 改前 42–51 */                                   /* App 改后 42–50 */
import {                                                  import {
  ARIA,                                                   ARIA,
  AUTH_COPY,     ← 删                                     NAV_ITEMS,
  NAV_ITEMS,                                              TOAST_UNDO_MS,
  ...                                                     ...

/* Web 改前 22 */                                       /* Web 改后 22 */
import { ARIA, VERBS, WORDBOOK_COPY, AUTH_COPY } from '@tm/shared';
import { ARIA, VERBS, WORDBOOK_COPY } from '@tm/shared';
```

依据：删掉 `secondary` 并把 `link.label` 换源后，`AUTH_COPY` 在两个文件里都是 **0 处运行时引用**（App 仅存注释提及、Web 连注释都不提），留着就是一句死导入。`host` 在两个文件里都仍有其它用处（App：`openDetail`/错误卡 `secondary`/空词本 `primary`；Web：错误卡 `secondary`/空词本 `primary`），故 `useHost()` 未动。

#### Hunk D —— App 文件头判断段（原文指向已失效的取源）

```tsx
/* 改前 31 */
 *    但「主按钮 `手机号登录` + 文字链 `没有账号？注册`」两件都照 §3.6.5 落（后者取 `AUTH_COPY.wall.link`）。
/* 改后 31–32 */
 *    但「主按钮 `手机号登录` + 文字链 `没有账号？注册`」两件都照 §3.6.5 落（后者取
 *    `WORDBOOK_COPY.emptySignedOut.link`，与 `AUTH_COPY.wall.link` 同一声明点；T-27 起本卡只有这两颗）。
```

Web 文件头无对应失准句子（`:15` 只列 `WORDBOOK_COPY`/`ARIA`/`VERBS` 与 `HOST_WORDBOOK_COPY`），未动。

---

## 2. §3.6.5-3 四要素对账表

规范原文（`03-ui-spec.md:842`，只读该行）：

> | 未登录访问 | 可读引导页（R-23 ①），列表区显示骨架 + 引导卡 | 标题 `登录后才能看到你的单词本`；副行 `同一个手机号，词本和进度都会跟着走`；主按钮 `手机号登录` + 文字链 `没有账号？注册` | — |

即：**视觉 2 件（骨架 + 卡）+ 文案 4 要素，动作只有 2 颗**。

| # | 规范给的 | 屏上渲染的（改后，两端逐字同） | 用例钉的 |
|---|---|---|---|
| 1 | 列表区骨架 | App：`SkeletonBlock variant="list-rows" rows={8}` → `[data-testid=wordbook-signed-out-skeleton]` 与卡并存；Web：未登录分支只渲引导卡，行骨架在 `data.pending` 分支（**既有两端差异**，登记为 L-27-2，本次未动） | `expect(q('[data-testid=wordbook-signed-out-skeleton]')).not.toBeNull()`（既有） |
| 2 | 标题 `登录后才能看到你的单词本` | `WORDBOOK_COPY.emptySignedOut.title`（`packages/shared/src/constants/copy.ts:338` 值 = 规范串，逐字） | `toContain(WORDBOOK_COPY.emptySignedOut.title)`（既有） |
| 3 | 副行 `同一个手机号，词本和进度都会跟着走` | `WORDBOOK_COPY.emptySignedOut.subtitle`（`copy.ts:339`，逐字） | `toContain(WORDBOOK_COPY.emptySignedOut.subtitle)`（既有） |
| 4 | 主按钮 `手机号登录` | `primary = { label: WORDBOOK_COPY.emptySignedOut.cta /* '手机号登录' */, onClick: goLogin('sign-in') }` / `requestLogin({mode:'sign-in'})` | ① `clickableByText(cta)?.tagName === 'BUTTON'`；② `actions[0].textContent === '手机号登录'`；③ 点后 `hash === '#/login?mode=sign-in&from=wordbook'` |
| 5 | 文字链 `没有账号？注册` | `link = { label: WORDBOOK_COPY.emptySignedOut.link /* = SWITCH_TO_REGISTER_LABEL */, onClick: goLogin('register') }` / `requestLogin({mode:'register', returnTo:'/wordbook'})` | ① `actions[1].textContent === '没有账号？注册'`；② `register === actions[1]`（**DOM 序第二颗就是它**）；③ 点后 `hash === '#/login?mode=register&from=wordbook'`；④ `buttonsByText('没有账号？注册')` 长度 = 1；⑤ 全卡不存在 `a[href="#/"]` |
| — | **（规范没有第三颗）** | `secondary` 整块删除，改后卡上可点元素 = `[手机号登录, 没有账号？注册]` | **`expect(actions).toHaveLength(2)`** —— 数量钉子，再长出第三颗（无论叫什么）即红 |

「规范给 4 要素 / 屏上曾渲染 3 颗 / 用例只点了 2 颗名字」这个缺口就是 A-48 #113 本体：`secondary` 与 `link` 的 label 取自同一声明点、行为不同，用例用 `clickableByText`（首个 DOM 命中）拿到的其实是 `secondary`，于是 `host.navigate('/')` 把 hash 写成 `#/`。

---

## 3. C-25 前后

### 3.1 用例侧改动（`apps/app/test/wordbook-screen.spec.tsx:979-1017`）

新增的全部是**钉子**，未改任何既有期望值方向（`#/login?mode=register&from=wordbook` 一字未动）：

- `q('[data-testid=wordbook-signed-out]')` 由「存在性」升级为持有节点 `card`，动作集合从 **card 作用域**取（不受 `PageHeader`/`SyncBadge` 干扰）；
- `expect(actions).toHaveLength(2)` + `actions.map(textContent)` 逐格 `[cta, link]` —— 顺序与数量同时钉，防「再长出第三颗」与「两颗对调」；
- `expect(buttonsByText('没有账号？注册')).toHaveLength(1)` —— 容器级同名去重钉子（本次红的确切形态：修复前这一句就是 2）；
- `expect(register).toBe(actions[1] ?? null)` —— 断言「用户看到的那颗注册链 = 第二颗」，即修复前 DOM 序在前的冒牌货不存在；
- `expect(container.querySelector('a[href="#/"]')).toBeNull()` —— 「回首页」那颗不许改个名字回来。

### 3.2 红（改前）

出口命令预算 2 次全部用于**改后自证**，故未再跑一次「改前」；下面的红输出引自 A-48 #113 定案与 T-14d 报告实录（`04-dev-report-T-14-d.md:125`、`:148-151`），并给出与本仓代码路径一致的复推：

```text
× §3.6.5 空 / 加载 / 错误 > C-25 未登录：0 词本请求，骨架 + 引导卡并存；主按钮 `手机号登录`、文字链 `没有账号？注册`
  AssertionError: expected '#/' to be '#/login?mode=register&from=wordbook'
```

复推链路（可判真假，不依赖重跑）：`EmptyState` 先渲 `primary`+`secondary`（`packages/ui/src/patterns/EmptyState.tsx:130-137`）再渲 `link`（`:138-166`）⇒ `container.querySelectorAll('button, a')` 里第 1 个 textContent 命中 `'没有账号？注册'` 的是 `secondary` ⇒ `clickableByText()` 取首个 ⇒ 它的 `onClick` 是 `() => host.navigate('/')`，测试 host 的 `navigate` 直连 `router.navigate`（spec `:195`）⇒ `window.location.hash === '#/'`。

### 3.3 绿（改后，实测）

- 断言 3.1 全部为真：卡上 `button, a` = 2 个，依次为 `手机号登录` / `没有账号？注册`；两颗的 `onClick` 分别是 `goLogin('sign-in')` / `goLogin('register')`。
- 实测摘要：`✓ @tm/app test/wordbook-screen.spec.tsx (35 tests) 6988ms` —— 35/35 通过，C-25 在其中（vitest 只把 >300ms 的用例逐条列进 stdout，C-25 未进慢清单，故无单独一行；无 skip、无 only）。

---

## 4. 「未新增真相源」自证

命令（原文）：

```bash
grep -rn "没有账号？注册" packages/shared/src apps --include=*.ts*
```

命中清单（本次改后实测）：

| 文件:行 | 性质 | 是否真相源 |
|---|---|---|
| `packages/shared/src/constants/copy.ts:34` | 注释（唯一声明点的说明段） | 否（注释） |
| `packages/shared/src/constants/copy.ts:41` | `const SWITCH_TO_REGISTER_LABEL = '没有账号？注册';` | ✅ **唯一声明点** |
| `packages/shared/src/constants/copy.ts:529` | 注释（`AUTH_COPY` 侧的再声明禁令） | 否（注释） |
| `apps/app/src/screens/WordbookScreen.tsx:31` | 文件头注释（Hunk D 改后的取值说明） | 否（注释） |
| `apps/app/src/screens/WordbookScreen.tsx:648` | `goLogin` 的既有注释 | 否（注释） |
| `apps/app/test/wordbook-screen.spec.tsx:979` | C-25 标题串 | 否（用例标题） |
| `apps/app/test/wordbook-screen.spec.tsx:991` | 我新增的根因注释 | 否（注释） |
| `apps/app/test/wordbook-screen.spec.tsx:1000` | `expect(buttonsByText('没有账号？注册')).toHaveLength(1)` | 否（断言，按定稿值断 = 同源） |
| `apps/app/test/wordbook-screen.spec.tsx:1007` | `const register = clickableByText('没有账号？注册');` | 否（断言取元素） |
| `apps/web/e2e/auth-wall.spec.ts:187` | 既有用例标题（**未动**，另 agent 名下） | 否（e2e 串） |
| `apps/web/e2e/auth-wall.spec.ts:201` | 既有 `wall.getByText(...)`（**未动**） | 否（e2e 串） |
| `apps/web/src/components/auth-gate.tsx:10` | 既有注释（**未动**） | 否（注释） |
| `apps/web/src/components/login-dialog.tsx:28` | 既有注释（**未动**） | 否（注释） |
| `apps/web/src/components/login-wall.tsx:9` | 既有注释（**未动**） | 否（注释） |

**代码级字面量仍只有 `copy.ts:41` 一处**：本次没有把 `'没有账号？注册'` 打字面量进任何 `apps/**/src/**` 生产码（App/Web 两端渲染侧都改成引 `WORDBOOK_COPY.emptySignedOut.link`，该键在 `copy.ts:342` 就是 `SWITCH_TO_REGISTER_LABEL` 本身 ⇒ 换源不换值、不产生第二份真相）。`packages/shared/test/contracts.spec.ts:724-733` 那条「唯一声明点」守卫的口径只扫 `packages/shared/src/**`（`filesContaining()` 遍历 `SHARED_SRC`，见同文件 `:186-190`），我在 `apps/**` 加的注释与用例串进不去它的视野；且本次 0 处 `packages/**` 改动 ⇒ 该套件与基线同状态（未跑，出口命令预算已用满）。

**渲染侧收敛**：改前 App 未登录卡引用了 **两个常量键**（`WORDBOOK_COPY.emptySignedOut.link` + `AUTH_COPY.wall.link`）来渲同一串字，改后同一屏只剩 **一个**（`WORDBOOK_COPY.emptySignedOut.link`），`AUTH_COPY.wall.link` 的唯一消费者回到 `login-wall.tsx` / 登录墙自己那两处 —— 真相源数量减少，未增加。

---

## 5. 出口命令原文与摘要

命令 1（`@tm/app`）：

```bash
pnpm --filter @tm/app typecheck && pnpm --filter @tm/app test
```

```text
$ tsc -p tsconfig.json --noEmit          # 无输出 = 通过
 ✓  @tm/app  test/lookup-screen.spec.tsx     (21 tests) 4685ms
 ✓  @tm/app  test/wordbook-screen.spec.tsx   (35 tests) 6988ms
 ✓  @tm/app  test/detail-screen.spec.tsx     (32 tests) 8347ms
 ✓  @tm/app  test/study-screen.spec.tsx      (33 tests) 9863ms
 ✓  @tm/app  test/progress-screen.spec.tsx   (26 tests) 10644ms
 …（其余 8 个文件同绿）
 Test Files  13 passed (13)
      Tests  268 passed (268)
   Duration  14.47s
```

命令 2（`@tm/web`）：

```bash
pnpm --filter @tm/web typecheck
```

```text
$ tsc --noEmit      # 无输出 = 通过
```

对照基线：题面给的基线是 `@tm/app` 242 passed / 12+ 文件。实测 **268 passed / 13 files，0 failed / 0 skipped**，只增不减（并发中 `progress-screen.spec.tsx` 26 条、`study-screen.spec.tsx` 33 条等均绿，**无需点名的非我名下红**）。总数差 (+26 tests / +1 file) 来自批次4D 其它 agent 的同时施工，不是本任务新增用例（我只改了一条 C-25）。

预算使用：出口命令 **2 / 2**；未跑 `@tm/web`/`@tm/shared` 测试、未跑 lint、未跑 e2e（预算与禁区）。

---

## 6. 上报未修（需要 TPM 定，本 agent 未动）

1. **`apps/web/e2e/auth-wall.spec.ts:187 / :201` 的 2 元素 strict-mode 风险 —— 判定：本次不需要联动改。**
   理由（只读核实，未改 `apps/web/e2e/**`）：那两句的作用域是 `const wall = page.locator('[data-testid=login-wall]')` 子树，词本卡的三颗在墙外，`wall.getByText` 从来匹配不到它们；我删掉重复链是在**全局**上少了一颗同名节点，只让 `page.getByText(...)`（无墙作用域）那类写法更安全，不会让 ③ 的期望变红（既有的 `wall.getByText(...)` 计数不依赖卡片）。⇒ **请转给 e2e owner 一句**：若后续把 `/wordbook` 接上 `<AuthGate>`（见下条 2），墙上与卡上会各有一颗 `没有账号？注册`，届时 `page.getByText('没有账号？注册')` 这类**未限定作用域**的写法需要补 `.first()` 或改用 `getByRole('button', { name: ... })`；卡内两颗不受影响。
2. **同文件 ②/③ 两条用例互相矛盾（与本任务无关，登记给 e2e owner）**：`:155-165`（②组）对 `/study /wordbook /report /chat /assess` 断 `[data-testid=login-wall]` 计数 = 0，而 `:187-207`（③）对 `/wordbook` 断计数 = 1 且标题为 `登录后开始背单词`（`AUTH_COPY.wall.title`）。现状是 `AuthGate`/`LoginWall` 在 `apps/web/src/app/**` **0 处被采用**（`grep -rn "AuthGate\|LoginWall" apps/web/src/app/(user)/layout.tsx` 无命中，全站仅 `auth-gate.tsx` 自述与 `login-dialog.tsx:18` 注释提及）⇒ ③ 今天必红（墙渲染不出来），②今天必绿。词本页要的是 §3.6.5-3 那一套定稿串（`登录后才能看到你的单词本`），两条用例里只有 ③ 的**存在性**方向对、**文案**方向不对。谁来收敛需要 TPM 定（不是我能单方决定的）。
3. **遗留项 L-1（既有偏差，非本次引入）**：`@tm/app` 词本页文件头 `:28-32` 自陈「§3.6.5 定稿串与 `WORDBOOK_COPY` 是同一场景两套措辞，取 shared 那一套，差异登记为 L-1 待 PM 收敛」；spec `:16-17` 同一口径。核对后可知**四要素里的标题/副行/主按钮三格 shared 与规范其实逐字相同**（`copy.ts:338-340` vs `03-ui-spec.md:842`），故 L-1 对 §3.6.5-3 这一行已经名不副实 —— 建议由文案 owner（`packages/**` 归他人）把那句「两套措辞」的注释收窄到真正有差异的行（如拉取失败行），本 agent 名下不改 `packages/**`。
4. **未跑清单（交给 T-23 真机走查）**：本次没做视觉/排版确认。删掉 `secondary` 后 App/Web 两颗动作在 `EmptyState` 里的排布（`flex-col sm:flex-row`，改后 `primary` 独占按钮行、`link` 单独一行）需两端并排走查一眼，尤其 App 小屏 320px 下不再有三颗堆叠的空间占用。

---

## 7. 遗留清单（本任务范围内主动放弃的）

| # | 项 | 为什么不顺手做 |
|---|---|---|
| L-27-1 | 两端 `wordbook-load-fail` / `wordbook-empty` 卡也带跳首页的动作（App `:535` `secondary`=去查词、`:611` `primary`=去查词；Web `:200` / `:215` 同一对） | 那两行的 §3.6.5 规范**明确给**了次按钮 `去查词`（`:845`「按钮 `重试`（主）、`去查词`（次）」）与主按钮 `去查词`（`:840`），不是野生长出来的动作，删了才是改规范 |
| L-27-2 | Web 词本未登录分支没有 App 那样的 `wordbook-signed-out-skeleton` 并存 | §3.6.5 行 1 的「骨架 + 引导卡并存」在 Web 侧由 `data.pending` 分支承担，属 T-15/E2 走查项，本任务只碰动作颗数 |
| L-27-3 | `apps/web` 无「未登录卡恰两颗」的单元/契约用例 | 新增 Web 侧用例要在 `apps/web/test/**` 起新文件（且需要 host/mock 装配），出口命令预算只够 typecheck；已把风险登记在第 6 节 1，若 TPM 要，我可以在下一轮补一条 `@tm/web` 用例 |
| L-27-4 | `apps/web/e2e/**` 全目录未触碰（硬约束），`wordbook.spec.ts:59` 的 `wordbook-signed-out` 可见性断言依旧成立（testid 与两颗动作都在） | — |
