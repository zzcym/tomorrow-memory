# 04-dev-report-T-19-g-i — 「我的」页 4 处定稿串/数值从 UI 规范逐字上收进 `packages/shared`

任务号 T-19g-i。范围（简报锁死的四颗文件）：
`packages/shared/src/constants/copy.ts` · `packages/shared/src/constants/limits.ts` · `packages/shared/test/contracts.spec.ts` · `apps/app/test/me-screen.spec.tsx`（只动 A-06 / A-07 两颗哨）。
**屏内实现不在本轮**（`apps/app/src/**` 一字未动，三卡未接，接驳归 T-19g-ii）。

---

## ① 开工 / 收工三指纹（逐字相同）

量取命令（只读 `os.stat` + `sha256`，全程未打开任何 `.db` 的写句柄、0 DDL/DML、0 `--i-know-this-is-prod`）：

```
python -c "import hashlib,os,datetime; ... os.stat(p); hashlib.sha256(open(p,'rb').read()).hexdigest()[:12] ..."
```

| 时点 | `data.db` | `packages/server/data.db` |
|---|---|---|
| 开工 | `253952 / 6595517661cc / 2026-09-18 04:05:38` | `0 / e3b0c44298fc / 2026-09-17 00:10:53` |
| 收工（最后一次改 `contracts.spec.ts` 之后复测） | `253952 / 6595517661cc / 2026-09-18 04:05:38` | `0 / e3b0c44298fc / 2026-09-17 00:10:53` |

两行逐字相同。

尾注：`data.db-wal`（424392 / Sep 18 04:09）与 `data.db-shm`（32768 / Sep 17 00:53）本轮未被触碰（mtime 均为开工前）。

---

## ② 上收清单（含"取哪一行原文"）

取文口径：先读 `.delivery/03-ui-spec.md` §3.8（`:943-1014`）原文，再把串逐字搬进 shared；两份"上收没走样"的机检分别落在 **shared 测试**（`packages/shared/test/contracts.spec.ts` 新增 4 个 describe / 8 颗 it）与**屏侧反向哨**（`apps/app/test/me-screen.spec.tsx` A-06）。另跑了一次独立核对脚本（TEMP 下，未入库）确认 10 条字面量在 `copy.ts` 在场、四条数值与 §3.8.3 原文一致，结果见 ⑦。

### G-3 · §3.8.1 分区 C 三张统计卡 ⇒ `SETTINGS_COPY.statCards`

规范原文（`.delivery/03-ui-spec.md:954`，逐字）：

> `| C 三张统计卡 | `词本 N 词` / `累计复习 N 天` / `连续 N 天`；数字可点进明细（R-19 ② 口径） | `grid-cols-3 gap-3`，卡高 `84px`，`mt-1` |`

落点（`copy.ts:539-554`，并进既有 `SETTINGS_COPY`，未另起第二份 `SETTINGS_*` 常量；:539-549 是取文注释）：

```ts
statCards: {
  words: { label: '词本', unit: '词', value: (n: number): string => `词本 ${n} 词` },
  reviewDays: { label: '累计复习', unit: '天', value: (n: number): string => `累计复习 ${n} 天` },
  streak: { label: '连续', unit: '天', value: formatStreak },
},
```

- 形态 = 简报建议的 `{ words, reviewDays, streak }`，每格 `label`（喂 `@tm/ui/patterns/StatCard` 的 `label` 槽）+ `unit`（其 `unit` 槽）+ `value(n)`（**整格人话** = 那一行把 N 换成数字，供 `valueText`/`aria-label` 与单行形态）。
- **同源**：`streak.value` 直接就是 `copy.ts:67` 的 `formatStreak`（`连续 ${n} 天`），0 第二份模板；shared 钉 `expect(SETTINGS_COPY.statCards.streak.value).toBe(formatStreak)`（同一颗函数引用）。
- **落点未进 shared**：`:961` 那一行（`词本`→单词本 tab / `累计复习`→学习情况 / `连续`→热力图滚到今天）留给 App 路由表；机检 = 三格各自只有 `label/unit/value` 三键，且 `statCards` 块（剥注释后）0 命中 `wordbook|progress|href|route|navigate`。

### G-1 · §3.8.3 滑杆 UI 域 ⇒ `limits.ts` 四条数值

规范原文（`.delivery/03-ui-spec.md:979`，逐字，节选）：

> `- 参数：`min=5 max=50 step=5`，默认 `10`；`aria-valuetext="20 词"`；…`

落点（`packages/shared/src/constants/limits.ts:109-122`，紧挨既有 `DAILY_GOAL_DEFAULT/MIN/MAX`；:109-118 是取文注释）：

```ts
export const DAILY_GOAL_UI_MIN = 5;
export const DAILY_GOAL_UI_MAX = 50;
export const DAILY_GOAL_UI_STEP = 5;
export const DAILY_GOAL_UI_DEFAULT = 10;
```

不变式钉（`contracts.spec.ts` 新增 it「不变式哨：UI 域 ⊂ 契约域且默认值同源」）：
`DAILY_GOAL_UI_MIN >= DAILY_GOAL_MIN`、`DAILY_GOAL_UI_MAX <= DAILY_GOAL_MAX`、`DAILY_GOAL_UI_DEFAULT === DAILY_GOAL_DEFAULT`（外加 `STEP > 0` 与默认值落在 UI 域内），并**不止比数**：把 5..50 step 5 的 10 个可滑落点逐个喂 `ProfileUpdateInputSchema.safeParse({daily_goal:n})` 要求全 true（末点恰 = `DAILY_GOAL_UI_MAX`），再钉 `DAILY_GOAL_MAX+1` 为 false。⇒ "UI 滑出来的值被服务端拒"在 shared 源头判死。T-19e 屏侧的 B-04 那颗**原样保留**（它钉的是屏导出的 `GOAL_SLIDER`，与本轮 shared 这颗各守一头）。

### G-2 · §3.8.5「拉取失败」整页错误卡 ⇒ `SETTINGS_COPY.fetchFail`

规范原文（`.delivery/03-ui-spec.md:1001`，逐字）：

> `| 拉取失败 | 整页降级为一个错误卡（不显示半真半假的 0） | `账号信息没拿到` / `检查网络后再试一次，你的数据没有改动。` / 主按钮`再试一次`；次按钮`退出登录`仅在已登录态出现 |`

⇒ 这一行**逐字写着四格**（简报说"三串（标题/正文/次按钮）"，原文同行的主按钮也是逐字定稿）。四格全部上收，未自补一字：

```ts
fetchFail: {
  title: '账号信息没拿到',
  body: '检查网络后再试一次，你的数据没有改动。',
  retry: '再试一次',
  signOut: '退出登录',
},
```

钉：四值逐字 = 测试里另抄的规范行；键集合恰 `{body,retry,signOut,title}`（不给错误卡发明第五槽）；`title`/`body` 与 §3.7 的 `PROGRESS_COPY.fail.*` **不得相等**（主语不同，防并成一份）；`filesContaining` 两条新串在 shared 产出面只住 `copy.ts`。
⚠ 同串多份申报见 ⑥-1（`再试一次` / `退出登录` 在 `copy.ts` 另有既有声明点，本轮按简报口径照上收、未改写既有键）。

### G-4 · §3.8.5「未登录」引导三串 ⇒ `SETTINGS_COPY.guestGuide`

规范原文（`.delivery/03-ui-spec.md:998`，逐字）：

> `| 未登录（App，本地词本仍可用） | B 区替换为引导条；… | `登录之后，换手机也不丢` / 副`词本、学习记录和提醒会跟着账号走。` / 主按钮`登录`、次按钮`注册`、下方文字`先不用，继续本机使用` |`

⇒ 这一行写了五格，其中主按钮 `登录`、次按钮 `注册` **shared 已有定稿声明点**（`AUTH_COPY.submit.login` / `.register`，`copy.ts:654-655`）⇒ 依"不抄第二份"纪律**未重复声明**，只上缺的三串（正好 = 简报说的"三串"）：

```ts
guestGuide: {
  headline: '登录之后，换手机也不丢',
  subtitle: '词本、学习记录和提醒会跟着账号走。',
  continueAsGuest: '先不用，继续本机使用',
},
```

钉：三值逐字 = 测试里另抄的规范行；键集合恰三键；三条 `filesContaining` 各只住 `copy.ts`；同钉 `AUTH_COPY.submit.login === '登录'` / `.register === '注册'` 在位（防下轮以为要新造）。
无一条需要升级给 PM：**§3.8.5 这两行（含标点、间隔号、句号）逐字写着所有上收串**，0 自补。

### 简报"为什么这一轮"段点到的 `:962` / `:961` —— 核对结论：**不是缺口，本轮不动**

- `:962` `已同步 · 20:31` / `还没同步 · 联网后会自动补上` 在 shared 已有同源定稿：`WORDBOOK_COPY.syncBadge.synced(hhmm)` = `` `已同步 · ${hhmm}` ``、`.replayFail` = `'还没同步 · 联网后会自动补上'`（另有 `SYNC_COPY` 同形两份，属既有现状）。⇒ 无缺口、不新增键（新增就是抄第二份）。**待证**：`SYNC_COPY.synced/pending/replayFail` 与 `WORDBOOK_COPY.syncBadge.*` 两份是否该收敛为一份，不在本轮范围，登记在 ⑥-3 请 TPM 裁。
- `:961` 三个落点按简报硬边界**未进 shared**（机检见 G-3）。

---

## ③ 反向哨 A-06 / A-07：改前 → 改后（逐字）

先如实贴**改前**，再贴**改后**，并说明哪一半翻面、哪一半保留。

### A-06

**改前**（T-19e 原文，`me-screen.spec.tsx:465-475`）：

```tsx
  it('A-06 反向哨（宁缺勿造）：三卡的三个标签在 @tm/shared 确实不存在 ⇒ 屏 0 计数卡、0 StatCard', () => {
    const copy = sharedCopyCode();
    for (const label of ['词本', '累计复习', '连续']) {
      // 这三串在 shared 里从不"独立成串"（只出现在长句/模板内）⇒ 本屏没有可引的定稿常量
      expect(new RegExp(`["'\`]${label}["'\`]`).test(copy), `shared 竟已有独立常量 ${label}`).toBe(false);
    }
    const code = screenCode();
    for (const banned of ['StatCard', 'formatStreak', 'profileProgressOf', 'useDueBadge', 'Wordbook', 'Progress']) {
      expect(code, `屏内命中未落地区 ${banned}`).not.toContain(banned);
    }
  });
```

**判据改前** = ① shared 剥注释后 `词本`/`累计复习`/`连续` 三串**各自独立成串 = false**；② 屏剥注释后 0 命中 `StatCard`/`formatStreak`/`profileProgressOf`/`useDueBadge`/`Wordbook`/`Progress`。

**预告命中**：补齐 shared 后我先只改 shared、原样跑了一次该 spec，A-06 确实**先红**（T-19e 预告的接驳提示）：

```
FAIL  @tm/app  test/me-screen.spec.tsx > A 组 · 源码哨兵 … > A-06 反向哨（宁缺勿造）…
AssertionError: shared 竟已有独立常量 词本: expected true to be false // Object.is equality
 Test Files  1 failed | 17 passed (18)
      Tests  1 failed | 430 passed (431)
```

**改后**（`me-screen.spec.tsx:465-499`，收紧而不是删除）：

```tsx
  it('A-06 半正半反哨：三格已逐字上收到 @tm/shared（正向钉 = §3.8.1 原文照抄）⇒ 屏侧仍 0 计数卡、0 StatCard', () => {
    /* 改前判据原文照贴 + 翻面理由（注释块，运行时剥除） */
    const specRowCells = ['词本 N 词', '累计复习 N 天', '连续 N 天'];
    const { statCards } = SETTINGS_COPY;
    const cells = [statCards.words, statCards.reviewDays, statCards.streak];
    for (const probe of ['0', '12', '100']) {
      expect(cells.map((cell) => cell.value(Number(probe))), `探针 ${probe}：shared 的三格与 §3.8.1 那一行不符`)
        .toEqual(specRowCells.map((cell) => cell.replace('N', probe)));
    }
    expect(cells.map((cell) => cell.label)).toEqual(['词本', '累计复习', '连续']);
    expect(cells.map((cell) => cell.unit)).toEqual(['词', '天', '天']);
    for (const cell of Object.values(statCards)) expect(Object.keys(cell).sort()).toEqual(['label', 'unit', 'value']);
    const copy = sharedCopyCode();
    for (const label of ['词本', '累计复习', '连续']) {
      expect(new RegExp(`["'\`]${label}["'\`]`).test(copy), `shared 缺独立常量 ${label}`).toBe(true);
    }
    const code = screenCode();
    for (const banned of ['StatCard', 'formatStreak', 'profileProgressOf', 'useDueBadge', 'Wordbook', 'Progress']) {
      expect(code, `屏内命中未落地区 ${banned}`).not.toContain(banned);
    }
  });
```

**判据改后**（逐条对账）：
- **翻面的一半**：`sharedCopyCode()` 那条 `.toBe(false)` → `.toBe(true)`（语义从"shared 没有 ⇒ 屏不许有"变成"shared 必须有、屏还不许接"），并**新增正向钉**：`SETTINGS_COPY.statCards` 三格存在 + 三格整串（探针 0/12/100）逐字 = 测试里**照抄的 §3.8.1 那一行**、`label` = `词本/累计复习/连续`、`unit` = `词/天/天`、三格只有三键（落点没混进来）。⇒ "上收有没有走样"成为机检（改一个字、少一个空格即红）。
- **原样保留的一半**：`screenCode()` 那 6 个 banned token 一字未动 ⇒ 屏今天仍 0 `StatCard`/0 `formatStreak`/0 `profileProgressOf`/0 `useDueBadge`/0 `Wordbook`/0 `Progress`。它同时钉住"本轮没越界去改屏"，接驳时（T-19g-ii）随屏撤除。
- `formatStreak` 引用没有加进 spec 的 import（简报只准动 A-06/A-07 两颗 ⇒ 同源同一性 `expect(...value).toBe(formatStreak)` 落在 shared 测试那颗里，A-06 只做逐字渲染比对）。

### A-07

**改前** banned 清单（`me-screen.spec.tsx:479-490`）：`PROGRESS_COPY` / `AUTH_COPY` / `WORDBOOK_COPY` / `LOOKUP_COPY` / `CHECKIN_COPY` / `TM_ERRORS` / `NOTICE_` / `emptyTitle` / `signedOut` / `signOut(`；positive 清单 = 10 条（7 条 `SETTINGS_COPY.dailyGoal.*` + `upgradeTodo.entry` + `upgradeTodo.cta` + `NAV_ITEMS.find`），简报里说的"那 9 颗既有定稿槽"按实测是这 10 条引用位。

**改后**（`me-screen.spec.tsx:501-536`）：只在 banned 清单尾部**追加 3 条**，其余一字未动（positive 那 10 条、用例标题之外的语句全原样）：

```tsx
      // T-19g-i 新增的三组 shared 键：屏今天还没接（三卡 / §3.8.5 错误卡 / B 区引导条），
      // 引了就是"没有用例的渲染面"⇒ 一并进不借用清单，接驳轮（T-19g-ii）随屏一起撤。
      'statCards',
      'fetchFail',
      'guestGuide',
```

复核结论（实测，非推测）：`MeScreen.tsx` 剥注释后 `statCards` / `fetchFail` / `guestGuide` 各 0 命中（与既有 6 颗 banned token 同为 0），所以追加后 A-07 仍绿 ⇒ "屏不许引本轮新键"钉成立。用例标题尾部加了括号一句"（新键一并列入不借用清单）"。

---

## ④ 出口命令尾行（本轮我亲自跑的原样输出）

```
$ pnpm --filter @tm/shared test
 Test Files  1 passed (1)
      Tests  63 passed (63)
   Start at  13:52:12
   Duration  1.11s
```
基线 55 → **63**，净增 **8 颗**（4 个新 describe / 8 个 `it`），0 减、0 skip、0 `test.fail`。

```
$ pnpm --filter @tm/shared typecheck   →  shared typecheck exit=0   （13:52:12 那一轮之后）
$ pnpm --filter @tm/app typecheck      →  app typecheck exit=0      （13:52:23 那一轮）
```
（`tsc -p tsconfig.json --noEmit` 无输出；两条都另用 `>/dev/null 2>&1; echo exit=$?` 取退出码，避免管道尾码假绿。）

```
$ pnpm --filter @tm/app test
 Test Files  18 passed (18)
      Tests  431 passed (431)
   Start at  13:52:55
   Duration  15.17s
```
= 基线 **18 files / 431 passed**，颗数未减（本轮 A-06/A-07 是"改判据不增不减"，8 颗新钉全部落在 shared 侧）。

```
$ pnpm --filter @tm/ui test
 Test Files  3 passed (3)
      Tests  167 passed (167)
   Start at  13:48:29
   Duration  2.60s
```

旁证（不在出口清单里，我也跑了）：`node tools/boundaries.mjs --copy` → `RED copy-legacy-zero 10 处命中`，10 处全在 `apps/web/src/**` 与 `apps/app/src/**`（`wordbook/page.tsx:17`、`settings-list.tsx:16`、`result-row.tsx:480`、`data/queries/auth.ts:33`、`AboutScreen.tsx:11`、`LookupScreen.tsx:72` …），**`packages/shared` 命中 0**（`grep -c "packages/shared"` 对同一输出 = `0`）。该红是既有存量红、非本轮引入（本轮没碰那两侧任何文件）。

---

## ⑤ 越界申报 + 账面申报

**动过的文件（全部 4 颗，均在简报许可内；行数是实测，用 `wc -l` 改前/改后相减）**：
1. `packages/shared/src/constants/copy.ts` —— 862 → 912 行（**+50**）。`SETTINGS_COPY` 内新增 3 个键块：`statCards` :539-554、`fetchFail` :579-598、`guestGuide` :599-612；未新增第二份 `SETTINGS_*` 常量；未改任何既有键的值。
2. `packages/shared/src/constants/limits.ts` —— 138 → 153 行（**+15**）。新增 4 条 `DAILY_GOAL_UI_*`（:109-122）；既有 `DAILY_GOAL_DEFAULT/MIN/MAX` 一字未动。
3. `packages/shared/test/contracts.spec.ts` —— 1041 → 1203 行（**+162**）。① import 块补 `DAILY_GOAL_DEFAULT/MAX/MIN` + 4 条 `DAILY_GOAL_UI_*` + `SETTINGS_COPY`；② 文件尾 :1051-1203 追加 4 个 describe（:1082 / :1124 / :1155 / :1190）/ 8 颗 `it`（含一颗"抠不到源码块 ⇒ 判据会变永真"的自守钉）。既有 55 颗一行未改。
4. `apps/app/test/me-screen.spec.tsx` —— 884 → 913 行（**+29**）。**只动 A-06（:465-499，+24）与 A-07（:501-536，+5）两颗**，A-01…A-05、A-08 与 B/C/D/E/F 组一字未改；增量全在用例标题行、注释块与追加的 3 条不借用条目上。

**未触碰**（逐项自查）：`apps/app/src/**`（含 `MeScreen.tsx`、`router.tsx`、`main.tsx`、`data/**`）、`packages/ui/**`、`apps/web/**`、`packages/server/**`、`.delivery/01-prd.md` / `02-tech-design.md` / `03-ui-spec.md`（只读，0 字节改动）、`.delivery/04-adjudications.md`、`.delivery/status.json`、`tools/ownership.json`、`tools/boundaries.mjs`。git 全程只读（只跑了 `git status` / `git diff --stat`），0 `commit`/`push`/`stash`/`checkout`。0 `.db` 打开、0 DDL/DML。0 `test.skip`/`test.fail`/`waitForTimeout`。

**账面申报（请 TPM 记 E4）**：
- ① 我对 **T-19e 名下** `apps/app/test/me-screen.spec.tsx` 动了 `:465-499`（A-06 整颗，判据翻面 + 正向钉 + 保留屏侧）与 `:501-536`（A-07 标题行 + 不借用清单尾部追加 3 条）。理由 = 简报锁定的"必须同步的反向哨"，且这是 shared 补齐后**唯一**会红的两颗。
- ② `tools/ownership.json` 现状（本轮只读实测）：
  - `packages/shared/src/constants/**` = `{owner: "T-03", readers: "*", handoff: false}`、`packages/shared/test/**` = `{owner: "T-03", readers: "*", handoff: false}` ⇒ T-19g-i 写它们是**跨主改**（`readers:"*"` 只保证可读）。先例 = `packages/shared/src/contracts/auth.ts` 的 `actions: ["bounded-edit:A-36-3"]` + `maxDiffLinesFor: {T-07: 49}` 那条一次性窄授权。**建议**：为本轮登记同形窄条目（实测幅度：`copy.ts` +50 / `limits.ts` +15 / `contracts.spec.ts` +161，或 TPM 认为合适的更小上限）。
  - `apps/app/test/me-screen.spec.tsx` **在 `tools/ownership.json` 里查无条目**（`grep -n "me-screen"` = 无输出；同类屏 spec 里 `study/completion/wordbook/progress/login/auth-store` 都已有 owner 条目）⇒ 现为 `no-entry`，需 TPM 先按文件头/交付报告补登 owner = **T-19e**，再决定 T-19g-i 的跨主改通道（我未改 `ownership.json`，简报禁改）。
  - 本轮**未**需要动 `packages/ui/**`、`apps/web/**`、`apps/app/src/**` ⇒ 不需要任何跨主改通道。

---

## ⑥ 遗留 / 待裁定（凡"我推测"一律标"待证"）

1. **同串多份（`copy.ts` 内既有现状，本轮未收敛）· 待 TPM 裁**：`fetchFail.retry` = `再试一次` 与既有 `PROGRESS_COPY.fail.retry`（:445）、`VERBS.retryInline`（:802）同串；`fetchFail.signOut` = `退出登录` 与既有 `SETTINGS_COPY.signOut.confirm`（:571）、`AUTH_COPY.forceUpgrade.secondary`（:705）、`VERBS.signOut`（:807）同串。本轮按简报口径"逐字上收为 `SETTINGS_COPY.fetchFail.*`"照写，**未**改写既有键。若要收敛，仓库先例 = 文件顶部 `SWITCH_TO_REGISTER_LABEL` 那种"单一声明点 + 两处引用"。另：`CHECKIN_COPY.notDone.streak`（:773）自带一份 `` `连续 ${n} 天` `` 模板（早于本轮，与 `formatStreak` 同串不同声明点），是否并成一份同请裁定 —— **待证**：这是既有现状，不是本轮引入。
2. **简报"三串"与规范"四格"的一处口径差**：§3.8.5:1001 那一行逐字含**四格**（标题 / 正文 / 主按钮 / 次按钮），简报写"三串（标题/正文/次按钮）"。我按"逐字以 UI 规范为准 + 主按钮同属定稿"收了四格（`retry` 是多出的一格）。若 TPM 判`retry` 不该进 `fetchFail`，删该一键即可，其余三键与所有钉不受影响（shared 那颗 `Object.keys(...)` 恰四键的钉要同步改）。
3. **`:962` 的两份同形串 · 待证**：`WORDBOOK_COPY.syncBadge.{synced,replayFail}` 与 `SYNC_COPY.{synced,replayFail}` 看起来是同一批 §6.4 串的两次声明（本轮 grep 实测两者都在），收敛与否属既有账面，不在本轮四件内，未动。
4. **宿主侧第二份仍在（本轮禁改两侧）**：`apps/app/src/screens/MeScreen.tsx:84` 的 `GOAL_SLIDER = {min:5,max:50,step:5}`、`apps/web/src/lib/api/profile.ts:63-65` 的 `goalMin/goalMax/goalStep`、`apps/web/…/profile.ts:46-50` 的 `statWords/statReviewDays/statStreak/unitWords/unitDays`、`:70-71` 的 `loadFailTitle/loadFailBody` —— 现在 shared 有了同源定稿，四处 import 改写 + `HOST_PROFILE_COPY` 整块删除分别归 **T-19g-ii（屏接三卡）** 与 Web 收口轮。**待证**：Web 那块的注释自陈"补齐后本块整体删除，页面不动"，故删除动作需要一次 `apps/web` 授权轮，本轮没有。
5. **屏侧三卡未接**：A-06 屏侧那一半仍红着不许（今日 0 接），shared 已备好；T-19g-ii 接的时候同时撤 A-06 屏侧 banned 与 A-07 的 3 条新 banned 条目。
6. **§3.8.5「未登录 ⇒ C/D/E 保留但数字用本地值」的本地值口径**（词本数 / 复习天数 / 连续数在访客态取哪一份）仍无 shared/PRD 定稿可依 —— T-19e 已登记、本轮四件不含它 ⇒ **仍需 PM 先定**，否则三卡接上后访客态那一格会无源可取。
7. G-5（`@tm/ui` 无 `slider` primitive）、G-6（§3.8.1 B/D/F/G/H 区不在清单）沿用 T-19e 登记，本轮未动。

---

## ⑦ 独立核对脚本尾行（防"上收走样"的第二双眼；脚本与结果都在 `%TEMP%`，未入库）

```
== shared 字面量在场性 ==
statWordsTpl             in copy.ts = True
statReviewTpl            in copy.ts = True
streakTpl(formatStreak)  in copy.ts = True
fetchFailTitle           in copy.ts = True
fetchFailBody            in copy.ts = True
fetchFailRetry           in copy.ts = True
fetchFailSignOut         in copy.ts = True
guestHeadline            in copy.ts = True
guestSubtitle            in copy.ts = True
guestContinue            in copy.ts = True

== limits 数值 ==
DAILY_GOAL_UI_MIN = 5
DAILY_GOAL_UI_MAX = 50
DAILY_GOAL_UI_STEP = 5
DAILY_GOAL_UI_DEFAULT = 10
§3.8.3 原文参数串 min=5 max=50 step=5 默认 10 在场 = True
```

探针渲染值（`词本 0 词` / `词本 12 词` / `词本 100 词`、`累计复习 N 天`、`连续 N 天` 三格 × 三探针）与 §3.8.1:954 那一行逐字一致，共 9 条比对，全部由 A-06 与 shared 那颗 it 在跑（尾行见 ④）。
