# 04-dev-report-E4b6 · 5A 专用键替掉三处位置借键 ＋ 6A 页脚穿透整页降级（改判轮）

任务号 **E4b6** ｜ 通道 `bounded-edit:A-88-E4b6` ｜ 派单：TPM（A-86 #320 裁 5A＋6A 合并成一轮；A-88 #335 排 `batch4_pending` 首位）
任务书：`%TEMP%\e4b6\BRIEF-E4b6.md`（15.6 KB）｜ scratch：`%TEMP%\e4b6\work\`
开工时刻（§5-1 基线快照的 `-newermt` 锚点）：**2026-09-23 02:20:04**
本轮结论一句话：**七条出口判据全绿**（结果见 §5）、**两证全 OK**（§6）、**翻了 F-03 与 L-03 拉取失败半支两颗钉**（§3）、件1 的三处借键一次换完且 0 第二份字面量（§1）。

## §0 落点表（文件:行号 = 改后盘面）

| # | 文件 | 改后行号 | 本轮做了什么 | 额度(增+删) | 实耗 |
| --- | --- | --- | --- | --- | --- |
| 1 | `packages/shared/src/constants/copy.ts` | `:522-527` 两颗模块级 const、`:530` `groups`、`:531-532` `rows` | 件1：开 `SETTINGS_COPY.rows.appearance`/`.about` 专用键（单点声明，`groups` 与 `rows` 同引） | 12 | **+10/-1 = 11** |
| 2 | `apps/app/src/screens/MeScreen.tsx` | `:253-258` 注释、`:259`/`:261` 换源、`:458-462` `showFooter`、`:754` 页脚门、`:758` 注释尾句 | 件1：两处位置借键改引专用键＋过期注释按新事实改写；件2：`<footer>` 从 `showSettingsSections` 摘到 `showFooter` | 22 | **+14/-8 = 22（贴顶，见 §8-D1）** |
| 3 | `apps/app/src/screens/AboutScreen.tsx` | `:44-45` | 件1：第三处借键 `groups[4]` → `rows.about` | 8 | +2/-2 = 4 |
| 4 | `apps/app/test/me-screen.spec.tsx` | `:79-93` 新翻面账段、`:779-780`（A-07 正向清单换源）、`:1214-1253`（F-03）、`:1583`/`:1585`（J-01 换源）、`:1962`+`:1979-1989`（L-03 失败半支） | 件2：翻 F-03 与 L-03 拉取失败半支；件1：J-01 两颗串源换到 `rows.*`（字面量期望值一字未放宽）；文件头补 E4b6 翻面账 | 90 | **+45/-14 = 59** |
| 5 | `apps/app/test/about-screen.spec.tsx` | `:15-16` B 组口径、`:271`/`:275` B-01 期望源、`:277-278` 另加一颗字面量正向哨 | 件1：B-01 期望源 `groups[4]` → `rows.about` | 14 | +7/-3 = 10 |
| 6 | `packages/shared/test/contracts.spec.ts` | `:1245-1256`（文件末新增一颗 describe） | **件1 的同源哨（任务书 #6 的"可选"项，本轮做了）**：`rows.* ↔ groups[2]/[4]` 不分叉 ＋ `copy.ts` 里 `'外观'`/`'关于'` 各只声明一处 | 16 | +13/-0 = 13 |

`--files` 清单 = 上表 6 颗（**patch 里 6 个文件段，一颗不多一颗不少 ⇒ F-52 未触发**）。

## §1 件1（A-86 #320 的 5A）：专用键落地 ＋ 三处借键一次换完

### 1-1 `packages/shared/src/constants/copy.ts` 改后盘面原文（`:520-533`）

```ts
/* ═════════════════ §6.4-设置：我的 / 设置（§3.8） ═════════════════ */

/**
 * F 区两行标题的单点声明（A-86 #320 的 5A：用户本人 2026-09-22/23 拍的文案七问之一）：下面 `groups` 的第 2/4 格
 * 与 `rows.appearance` / `rows.about` 同引这两颗 const ⇒ 全仓 0 第二份『外观』/『关于』字面量，F 区不再按下标借位。
 */
const ROW_APPEARANCE = '外观';
const ROW_ABOUT = '关于';

export const SETTINGS_COPY = {
  groups: ['学习', '提醒', ROW_APPEARANCE, '账号', ROW_ABOUT, '帮助'],
  /** F 区「外观」「关于」两行的**专用键**（A-86 #320 的 5A）：值逐字 = `groups` 第 2/4 格，同一颗 const 单点声明。 */
  rows: { appearance: ROW_APPEARANCE, about: ROW_ABOUT },
  dailyGoal: {
```

- `groups` 六格**本体与顺序未动**（`['学习', 提醒, 外观, 账号, 关于, 帮助']`，仍是 §3.8.6 F 区分组标签的真相源、Web 关于页同源）；变的只是第 2/4 格改成引上面两颗 const。
- ⛔「不许出现第二份 `'外观'`/`'关于'` 字面量」的机检：`packages/shared/test/contracts.spec.ts` 新同源哨逐颗数 `copy.ts` 源码里带引号的 `'外观'`/`'关于'` 字面量，**各恰 1 处**（`:526`/`:527`）；注释里的『外观』/「外观」不计（括号体不构成字面量）。
- `apps/web/src/app/(user)/about/page.tsx:27` 仍引 `SETTINGS_COPY.groups[4]` —— **本轮 0 diff**（红线 4），值逐字不变 ⇒ 它不受影响。

### 1-2 `apps/app/src/screens/MeScreen.tsx` 两处借键（改后 `:253-261`）

```ts
/**
 * 三行的行标题各取盘上唯一一份：`外观`/`关于` = shared 的 F 区**专用键** `SETTINGS_COPY.rows.appearance` /
 * `.about`（A-86 #320 的 5A：两串在 `copy.ts` 单点声明，`groups` 第 2/4 格与 `rows` 同引一颗 const ⇒ 屏侧
 * 0 位置借键、0 第二份字面量，与 `AboutScreen.tsx` 的「关于」页 H1 同源）；`修改密码` = `AUTH_COPY.changePassword.title`，
 * 即落点 `/security` 那一屏自己的标题（`SecurityScreen.tsx:146`）⇒ 行标签与落地页 H1 同一常量；三串走样由 J-01 钉红。
 */
const APPEARANCE_TITLE = SETTINGS_COPY.rows.appearance;
const PASSWORD_TITLE = AUTH_COPY.changePassword.title;
const ABOUT_TITLE = SETTINGS_COPY.rows.about;
```

过期两句的去向：「shared **没有 F 区专属键**」与「同一下标同源／下标即顺序」当场删除，按新事实改写；`修改密码 = AUTH_COPY.changePassword.title` 那颗同源口径**原样保留**（含 `SecurityScreen.tsx:146` 锚与 J-01 责任句）。

### 1-3 `apps/app/src/screens/AboutScreen.tsx` 第三处借键（改后 `:44-45`）

```ts
/** `SETTINGS_COPY.rows.about`：shared 的「关于」**专用键**（A-86 #320 的 5A）= 全仓那一串的单点声明，与 `groups[4]` 同一颗 const。 */
const ABOUT_GROUP_LABEL = SETTINGS_COPY.rows.about;
```

三处借键（`MeScreen.tsx:259`、`:261`、`AboutScreen.tsx:45`）**一次换完，全仓屏侧 0 第四处**：`grep -rn "SETTINGS_COPY.groups\[" apps packages` 现只剩 `apps/web` 那一颗（本轮范围外、红线 4 不许动）⇒ 见 §7-N2。

### 1-4 J-01 与 B-01 的换源（期望值一个没放宽）

- `me-screen.spec.tsx:1583/1585`：两颗串的**源**从 `groups[2]`/`groups[4]` 换成 `rows.appearance`/`rows.about`，**右侧字面量期望值 `'外观'` / `'关于'` 逐字未动**（A-86 #320 明令）。
- `me-screen.spec.tsx:779-780`（A-07 正向清单）：这两颗是任务书 §1 表未点名、但**换源后必然跟着红的**既有钉 —— 它正向钉「屏必须引用 `SETTINGS_COPY.groups[2]`/`[4]`」，屏换成专用键后旧串不在屏源码里 ⇒ 不改它就假红。已同步换成 `rows.appearance`/`rows.about`，并就地补一行注释记来源。**申报为验收面比预计宽**（§8-D2）。
- `about-screen.spec.tsx:275`：B-01 期望源换成 `rows.about`；因两键同值会让旧钉失分辨力，另在 `:277-278` 补一颗字面量正向哨 `expect(SETTINGS_COPY.rows.about).toBe('关于')`（**收紧方向，非放松**，§8-D3）。

## §2 件2（A-86 #320 的 6A，改判轮）：页脚穿透 `:1002` 整页降级支

### 2-1 新增的门（`MeScreen.tsx:456-462` 改后原文）

```ts
  const showSettingsSections = !signedIn || showGoal;

  /**
   * H 区页脚的门（用户 2026-09-22/23 裁 6A，A-86 #320）：备案号是企业法定公示、与数据态无关 ⇒
   * `:1002` 整页降级支**保留页脚**（F-03/L-03 于本轮翻面）；在途支仍不画页脚（6A 没裁 loading 面，M-06 钉着）。
   */
  const showFooter = showSettingsSections || fetchFailed;
```

`fetchFailed` 就是 `:403` 那颗既有 `signedIn && profile.isError`（未改）。三态真值表：访客 → `showSettingsSections` 真 → 画；已登录且档案到手 → 真 → 画；**已登录且拉失败 → `fetchFailed` 真 → 画（本轮新行为）**；已登录在途 → 两颗门全假 → **不画**（M-06 口径）。

### 2-2 `<footer>` 换门（改后 `:754-763`）

```tsx
      {showFooter ? (
        /* H 区（§3.8.1:959 + §3.1 的 App 侧口径"页脚收进「我的」底部"）：两串逐字来自 shared BRAND，
           备案号是占位串（F-32 已记发布前法务项），屏内不许改写成"看起来像真号"的东西、也不加外链。
           访客常驻 = TPM 裁定（备案号是企业法定公示、与登录态无关），**非 §3.8.5 推导**；
           「已登录但档案没到手」的 :1002 整页降级支也画 = 用户 2026-09-22/23 裁 6A（A-86 #320，F-36 已裁）。 */
        <footer className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
          <p>{BRAND.footerLine1}</p>
          <p className="mt-1">{BRAND.footerLine2}</p>
        </footer>
      ) : null}
```

范围收窄（任务书 §2 件2 的"别顺手扩大"）：
1. **`:700` 那颗 `showSettingsSections` 门一字未动** ⇒ F 区三行在降级支仍然不画（F-03 的 `settingRows()` 0 命中仍绿）。
2. DOM 面 0 改动：没加 `data-testid`/`id`、没改 `className` 语义（红线 5）；屏内 0 备案号自造、0 外链（`BRAND` 两串原样，`all('a[href]')` 0 命中的 L-02 仍绿）。
3. Chrome 84 红线：新增行只用 `||`，0 新内核 API（红线 8）。

## §3 翻了哪两颗钉（改判留痕，逐颗贴改前/改后原文）

出处统一为：**用户本人 2026-09-22/23 裁 6A（A-86 #320）** —— 备案号是企业法定公示、与数据态无关，而 §3.8.5 `:1002` 那句"整页降级为一个错误卡"管的是**内容区**，不构成把法定公示的页脚一起抹掉的理由。两颗都是**改判**，各自在原处写了账，无一颗静默改绿。

### 3-1 钉 1：`apps/app/test/me-screen.spec.tsx` 的 **F-03**（现 `:1214`）

改前（原文，`orig/me-screen.spec.tsx` 快照 `:1197`/`:1209-1215`/`:1221`/`:1226`）：
```tsx
  it('F-03 拉取失败：整页降级为一个错误卡（:1001 四串逐字正向钉），C/D/E/F/G 与 H 页脚全不画（T-19g-v 翻面）', async () => {
    ...
    expect(texts).toEqual([
      '我的', '账号信息没拿到', '检查网络后再试一次，你的数据没有改动。', '再试一次', '退出登录',
    ]);
    ...
    // "不显示半真半假的 0"：C 卡 / D 行 / 同步行 / E 滑杆 / F 列表 / G 触发 / H 页脚一颗不剩
    expect(all('footer')).toHaveLength(0); // F-36 待裁前的口径：错误卡支不画页脚（显式钉，翻口径会翻这颗）
    expect(all('[data-testid=sync-badge]')).toHaveLength(0);
```
改后（盘面）：
```tsx
  it('F-03 拉取失败：整页降级为一个错误卡（:1001 四串逐字正向钉），C/D/E/F/G 全不画、H 页脚保留（T-19g-v 立卡；E4b6 件2 翻页脚半，6A）', async () => {
    ...
    expect(texts).toEqual([
      '我的', '账号信息没拿到', '检查网络后再试一次，你的数据没有改动。', '再试一次', '退出登录',
      '© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', // :959 页脚第一串（6A 起降级支也画；字面量，不反推 shared）
      '明天再记，也不算晚。', // :959 页脚第二串
    ]);
    ...
    // "不显示半真半假的 0"：C 卡 / D 行 / 同步行 / E 滑杆 / F 列表 / G 触发一颗不剩（H 页脚自 6A 起保留）
    expect(all('footer')).toHaveLength(1); // E4b6 件2 翻面（6A）：旧钉 0 颗是 F-36 待裁前的口径，本页脚含备案号
    expect(all('[data-testid=sync-badge]')).toHaveLength(0);
```
账目要点：整表钉尾部两串是**字面量**（A-74 #231 口径，不从 `BRAND` 反推）、备案号在前（DOM 顺序）；`sync-badge` 那颗 0 命中**保持 0**（页脚不是同步行 ⇒ 运维信息没被带进降级面）；`statCardsAll()`/`buttonByLabel(VERBS.goStudy)`/`goalSection()`/`settingRows()`/`dailyGoal.save` 五颗反查 0 命中一颗没撤。用例标题与它上面那段注释里的旧事实（"H 页脚全不画"）同步改成新事实并注 6A 出处。

### 3-2 钉 2：`apps/app/test/me-screen.spec.tsx` 的 **L-03 拉取失败半支**（现 `:1962`/`:1979-1989`）

改前（`:1936` 标题、`:1949-1957`）：
```tsx
  it('L-03 降级面与禁词：访客态页脚常驻（恰 1 颗、备案号在前），拉取失败态整页不画（:1001），已登录态全树禁词 0 命中（R-25① / :962）', ...
    /* 拉取失败那半：T-19g-v 起 F-03 已翻为错误卡整表钉，这颗仍只钉页脚面 —— 错误卡支**不画页脚** …… */
    expect(all('footer')).toHaveLength(0);
```
改后：
```tsx
  it('L-03 降级面与禁词：访客态与拉取失败态页脚都常驻（各恰 1 颗、备案号在前），已登录态全树禁词 0 命中（R-25① / :962；E4b6 件2 翻失败半）', ...
    /* 拉取失败那半（E4b6 件2 翻面：用户 2026-09-22/23 裁 6A，A-86 #320，F-36 已裁）：旧钉
       `toHaveLength(0)` 是裁定前照 `:1001` 逐字"整页降级为一个错误卡"做的口径；备案号是企业法定公示、
       与数据态无关 ⇒ 本支**保留页脚**，翻为恰 1 颗 + 两串逐字、备案号在前（形状照上面的访客半支）。
       在途半支仍不画页脚，由 M-06 钉住（6A 只裁了拉取失败这一支，没裁 loading 面）。 */
    const failedFooters = all('footer');
    expect(failedFooters).toHaveLength(1);
    expect(
      Array.from(failedFooters[0]!.querySelectorAll('p')).map((el) => String(el.textContent ?? '').trim()),
    ).toEqual(['© 2026 明日记忆 · 冀ICP备2024XXXXXX号-1', '明天再记，也不算晚。']);
```
照 `:1943-1946` 访客半支的既有形状写：`toHaveLength(0)` → **恰 1 颗** ＋ 两颗 `<p>` **逐字、备案号在前**（字面量）。访客半支与已登录半支的既有断言未动。

### 3-3 文件头翻面账（`me-screen.spec.tsx:79-93`）

紧接原 E4b2 那段账（`:77`）之后补了一段 **E4b6 件1／件2 的判据翻面账**：件1 写明"不是翻面、三颗钉跟着换源但期望值未放宽"；件2 写明"改了 F-03 与 L-03 两颗、为什么、翻面形状、范围收窄的三条（`:694` 门未动／`sync-badge` 仍 0／在途支仍不画）"，并逐条点名上面 **T-19g-iv 的"L-03 拉取失败半支不动"、T-19g-v 与 E4b2 的"F-03 …H 页脚反查 0 命中／整表钉未动"** 这几句自本轮起过期、以新段为准（历史账原文照留 —— 那是账，不是现状）。

### 3-4 M-06 原样绿 = 没改多的证据

`it('M-06 在途不出卡（isPending 支）…')`（现 `:2164`）整段**未动一个字节**：它在途那刻仍钉 `visibleTexts() === ['我的']` 与 `all('footer') === 0`。本轮跑测它绿 ⇒ 门做成了 `showSettingsSections || fetchFailed` 而**不是**无条件常驻（若做成常驻，这颗必红）。

## §4 额度对账（§1 表额度 vs 实耗，patch = 自证 scoped）

| 文件 | 额度 | 实耗（增+删） | 余量 |
| --- | --- | --- | --- |
| `packages/shared/src/constants/copy.ts` | 12 | **+10/-1 = 11** | 1 |
| `apps/app/src/screens/MeScreen.tsx` | 22 | **+14/-8 = 22** | **0（贴顶）** |
| `apps/app/src/screens/AboutScreen.tsx` | 8 | +2/-2 = 4 | 4 |
| `apps/app/test/me-screen.spec.tsx` | 90 | +45/-14 = 59 | 31 |
| `apps/app/test/about-screen.spec.tsx` | 14 | +7/-3 = 10 | 4 |
| `packages/shared/test/contracts.spec.ts` | 16 | +13/-0 = 13 | 3 |
| 合计 | 162 | **119** | 43 |

`tools/ownership.json` **一字未动**（红线 7）；它在 §5-1 基线里、收口 `sha256sum -c` 复算 OK（§6）。

## §5 出口判据实测（基线 = TPM 今日亲跑值；七条全部亲跑，日志在 `%TEMP%\e4b6\work\x*.log`）

| # | 命令 | 今日基线 | 实测（日志原文行） | exit |
| --- | --- | --- | --- | --- |
| 1 | `pnpm --filter @tm/app test` | 02:01:23：18 files / 469 passed / 0 failed | `Test Files  18 passed (18)` ＋ `Tests  469 passed (469)`（`x1-app-test.log`；其中 `me-screen.spec.tsx (67 tests)`、`about-screen.spec.tsx (20 tests)` 两颗逐文件行都在） | **0** |
| 2 | `pnpm --filter @tm/shared test` | 02:01:04：66 passed | `Tests  67 passed (67)` —— **66 → 67**，唯一新增 = 本轮 #6 的同源哨（任务书 §4-2 明令"加同源哨则 67，申报"⇒ 已申报，见 §8-D3） | **0** |
| 3 | `pnpm --filter @tm/server test` | 02:01:01：21 files / 446 passed / 1 skipped | `Test Files  21 passed (21)` ＋ `Tests  446 passed \| 1 skipped (447)` ⇒ **一字不动**（server 0 diff，见 §6-2 的 mtime 反查） | **0** |
| 4 | `pnpm --filter @tm/app typecheck` / `@tm/web typecheck` / `@tm/server typecheck` | 三张 exit 0 | `app-typecheck exit=0` / `web-typecheck exit=0` / `server-typecheck exit=0`（三张各跑 `tsc --noEmit` 族，日志 `x4a/x4b/x4c`） | **0 ×3** |
| 5 | `pnpm --filter @tm/app build` | 02:17：exit 0、22 个产物 | `[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API` ＋ `✓ built in 3.03s` ⇒ **仍 22 颗，0 新 chunk** | **0** |
| 6 | `node tools/boundaries.mjs --check-ownership --task E4b6 --files "<6 颗>" --diff-file e4b6-scoped.patch` | — | `--check-ownership task=E4b6 触碰 6 个在册文件（清单 6 项 + patch 6 项） → 无越界`（`PATCH 6 个文件的 diff 参与判定`） | **0** |
| 7 | `node tools/boundaries.mjs --self-test` | 02:14：157/157 | `boundaries --self-test：157/157 通过` | **0** |

出口 6 的 NOTE 行（额度看数字，标签是 `actions[0]` 旧动作号 = F-43 第二形态）：
```
NOTE packages/shared/src/constants/copy.ts：走动作通道 bounded-edit:A-74-235（按实际 diff 判定：+10/-1 行）
NOTE apps/app/src/screens/MeScreen.tsx：走动作通道 bounded-edit:A-82-E4b2（按实际 diff 判定：+14/-8 行）
NOTE apps/app/src/screens/AboutScreen.tsx：走动作通道 bounded-edit:A-88-E4b6（按实际 diff 判定：+2/-2 行）
NOTE apps/app/test/me-screen.spec.tsx：走动作通道 bounded-edit:A-88-E4b6（按实际 diff 判定：+45/-14 行）
NOTE apps/app/test/about-screen.spec.tsx：走动作通道 bounded-edit:A-88-E4b6（按实际 diff 判定：+7/-3 行）
NOTE packages/shared/test/contracts.spec.ts：走动作通道 bounded-edit:A-74-235（按实际 diff 判定：+13/-0 行）
```
（跑法照任务书铁律：`@tm/app` 只用 `pnpm --filter @tm/app test`（包内裸跑会丢 jsdom）；每条命令 `> 日志 2>&1` 后 `echo exit=$?`，日志一律 UTF-8 文件；全套出口命令**跑了 1 轮**，另在改钉过程中用 `pnpm exec vitest run --root . --project @tm/app <file>` 单文件复跑过一次做定位。）

## §6 两证（脚本落 `%TEMP%\e4b6\work\`，`git status --porcelain` 不算证据）

1. **sha256 基线 15 颗**（开工 **02:20:04** 取，`sha256-baseline.txt`）：真库三颗 `data.db`(`6595517661cc…`)/`data.db-shm`/`data.db-wal` ＋ `packages/server/data.db` 0 字节占位（`e3b0c44298fc…`）＋ 禁改哨所在文件（`legacy-apk.spec.ts`、`wordbook-concurrency.spec.ts`，另把同域只读消费颗 `wordbook-trpc-add.spec.ts` 一并取进）＋ `router.tsx`、`main.tsx` ＋ `tools/ownership.json` ＋ `tools/boundaries.mjs` ＋ `.delivery/{01-prd,02-tech-design,03-ui-spec,04-adjudications}`。
   收口复跑（**跑完全部测试与 build 之后**）：`sha256sum -c "$W/sha256-baseline.txt"` ⇒ **exit 0，15/15 全 OK**（`x8-sha256-verify.log` 十五行逐行 `: OK`）。
   真库三颗的字节数与 mtime 另量一遍未变：`253952 / 09-18 04:05`、`32768 / 09-17 00:53`、`424392 / 09-18 04:09`、占位 `0 / 09-17 00:10` ⇒ **全程只读成立（内容级 ＋ mtime 级）**。
2. **mtime 反查**：`find apps packages tools -newermt "2026-09-23 02:20:04" -type f` ⇒ **命中 29 行**（`x9-newermt.log`），拆开是：
   - **§0 表里我真正改过的 6 颗**（一字不多）：`apps/app/src/screens/{MeScreen.tsx,AboutScreen.tsx}`、`apps/app/test/{me-screen.spec.tsx,about-screen.spec.tsx}`、`packages/shared/src/constants/copy.ts`、`packages/shared/test/contracts.spec.ts`；
   - **gitignored 缓存副产物 23 颗**（出口 5 的 build 与出口 4 的 typecheck 所生，逐颗点名登记）：`apps/app/dist/**` 共 **22 颗**（= dist-guard 数的那 22 个产物，`git check-ignore -v` 坐实 `.gitignore:82  apps/app/dist/`）＋ `apps/web/tsconfig.tsbuildinfo` 1 颗（`git check-ignore -v` 坐实 `.gitignore:62  *.tsbuildinfo`）；
   - **0 命中面**：`packages/server/**` 一颗不在（server 全套只读跑）、`apps/web/**` 除那颗 tsbuildinfo 外 0 颗 ⇒ **红线 4「`apps/web` 面 0 diff」成立**、三颗禁改哨与 `router.tsx`/`main.tsx`/`ownership.json` 均未被触碰（同时有 §6-1 的 sha256 OK 双证）。
   - 根目录面另扫：`find . -maxdepth 1 -newermt "…02:20:04" -type f` ⇒ **0 命中**；`find packages/server -maxdepth 1 -newermt "…"` ⇒ **0 命中** ⇒ 真库三颗与 `packages/server/data.db` 占位 mtime 未变（红线 1）。
   - 本轮唯一写在仓库内的新文件是 `.delivery/04-dev-report-E4b6.md`（报告本身，任务书 §5-2 已预告它在命中清单外，此处点名）。
3. **scoped patch**：`e4b6-scoped.patch`（生成器 `make-scoped-patch.sh`）= 改前快照 `work/orig/*` → 现盘，`git diff --no-index` 后把 `diff --git`/`---`/`+++` 三行改写成仓库相对路径；**6 个文件段、不收 HEAD diff**。闸门读到的幅度就是 §4 那六行 NOTE。

**两证结论：只读面（真库三颗＋占位库＋三颗哨所在文件＋router/main＋ownership.json＋主文档）内容级与 mtime 级双绿；写面恰好等于 §0 的 6 颗 ＋ gitignored 产物。**


## §7 没做的东西（不沉默清单）

- **N1｜MeScreen 里另外 5 处旧口径注释没改**（额度 22 已贴顶，物理上放不下）：`:96-97`（文件头 4「`外观`/`关于` = groups 的第 2/4 格」）、`:160-161`（文件头 H 区段"该支…**不画 H 页脚**（F-36 待裁…）"）、`:400-401`（`fetchFailed` 的文档注释"H 页脚也不画（F-36 待裁…）"）、`:447-453`（`showSettingsSections` 的账里"页脚只摘登录门，`:1001` 降级支仍不出页脚"）、`:479-480`（错误卡分支上方那段"也不画 H 页脚（F-36 待裁…）" —— 因本轮在 `:458-461` 插了 `showFooter` 的文档注释，它已下移到 **`:485-486`**）。这五处**文字与现行为相反**（页脚现在画），代码与测试都是新事实，只有注释是旧的 ⇒ 请 TPM 决定是否单开一轮（估 12-16 行）。任务书 §2 件2 只点名 C-5 那一颗（`:752`，现 `:758`），已按命改。
- **N2｜`apps/web/src/app/(user)/about/page.tsx:27` 的第四处 `groups[4]` 借键没换** —— 红线 4 规定 `apps/web` 面 0 diff，本轮纯 App/shared。任务书 §2 件1 说"三处借键一次换完、不留第四处"，**盘面上确实还有这第四处**（Web 关于页 H1），它不在本轮可写面 ⇒ 登记待裁（若要换，Web 侧 typecheck 出口＋B 组同值钉都要重跑）。
- **N3｜`ui-spec` 的 `:1002` 那一行原文没同步改**（"整页降级为一个错误卡"仍在 `.delivery/03-ui-spec.md:1002`）—— 三份主文档在只读基线里（§6-1），本轮不许动；6A 的裁定文字目前只落在代码注释、测试账和本报告里。
- **N4｜没加 `data-testid`、没动 `router.tsx`/`main.tsx`、没跑 `@tm/web` 测试**（只跑它的 typecheck 出口，按红线 4）。
- **N5｜共享同源哨（#6）做了**，不是"没做的东西"，列在此处只因为它让 `@tm/shared test` 从 66 → **67**（任务书 §4-2 允许"加同源哨则 67，申报"）。

## §8 偏差与登记

- **D1｜`MeScreen.tsx` 实耗 22 = 额度上限，零余量。** 未撞破（闸门 `total > cap` 才判越界），但**任何追加都会越界** ⇒ N1 那五处过期注释因此没改（不是漏，是额度）。
- **D2｜验收面比任务书 §1 表预计宽一颗（已在测试里被实测命中并修）：** `me-screen.spec.tsx:762-763` 的 **A-07 正向清单**明文要求屏源码必须含 `SETTINGS_COPY.groups[2]`/`groups[4]` 两串 —— 件1 换源后它必红。已在同一颗文件的额度内换成 `rows.*`（+3/-2 行含注释），条数不变。这正是 E4b3/E4b2 两轮的事故根因，先跑了 scoped 单文件复跑坐实（`work/app-targeted-1.log`：87 passed / exit 0）再进出口命令。
- **D3｜两处"收紧方向"的自主加钉，任务书没点名：** ①`contracts.spec.ts` 的同源哨用了 §1 表 #6 的**可选**额度（+13，`@tm/shared` 66 → 67）；②`about-screen.spec.tsx:277-278` 补了一颗 `'关于'` 字面量正向哨（换源后旧钉会失分辨力）。两者都只可能让钉更红、不可能放绿。
- **D4｜新写的两句里把旧行号 `:1001` 写成了 `:1002`：** 任务书 C-4 说代码注释里的 `:959`/`:1001` 是同一行的旧引用、"不去动它们"。我**没动任何既有引用**（`:400`、`:479`、`F-03` 标题里的 `:1001` 全部原样），只在**本轮新写/重写的句子**里用了今日实测行号 `:1002`（`MeScreen.tsx:460`、`:758` 尾句、`me-screen.spec.tsx` 的 L-03 账里"照 `:1001` 逐字…那口径"是转述旧口径、故保留 `:1001`）。**同一屏里 `:1001`/`:1002` 并存**是这种"旧引用不动"纪律的必然形状，登记以免下轮误判成漂移。
- **D5｜翻钉不减条数：** `me-screen.spec.tsx` 仍 **67** 颗 `it`、`about-screen.spec.tsx` 仍 **20** 颗 —— 本轮 0 新增/0 删除用例，只改期望值与标题。
- **D6｜基线颗数：任务书写"15 颗"，字面枚举只有 13-14 颗**（§3.2 的"三颗哨"在盘上是**两个文件**里的三处行位 `legacy-apk:498` / `wordbook-concurrency:82-84`+`:891`+`:1189`，E4b3b 当时用的是 12 项）。我按**超集**取了 15 颗（额外取 `wordbook-trpc-add.spec.ts`、`tools/boundaries.mjs`、`.delivery/04-adjudications.md` 三颗同属只读面），只多不少 ⇒ 覆盖任务书点名的每一颗。
- **D7｜曾标"假说"的一条已实测收口：** 出口 5 的"仍 22 个产物"写报告骨架时只是推定（本轮 0 新模块、0 新依赖，`showFooter` 与 `rows.*` 都是同文件内常量），终态实测为 `[dist-guard] 判据①②通过：22 个产物文件`（§5-5）⇒ **该假说已由盘面证据升格为实测，不再是假说**。本轮报告里现已无未收口的假说。
- **D9｜`@tm/app test` 条数恰等于基线 469（不是 ≥469 的"多了几条"）：** 翻钉都是改期望值与标题，用例条数一颗没增没删（`me-screen.spec.tsx` 仍 67、`about-screen.spec.tsx` 仍 20）；唯一的条数变化在 shared（66 → 67，§8-D3）。
- **D8｜未使用 `test.skip`/`test.fail`/`.only`/`waitForTimeout`、未放松任何断言凑绿、未改 `tools/ownership.json`、未做任何 git 写操作**（只用了只读的 `git diff --no-index`）。A-08 那颗自禁项扫描（`me-screen.spec.tsx` 源码级）本轮仍绿 = 机检坐实，不是自述。
