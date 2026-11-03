# 04-dev-report-T-19g-v · App「我的」屏 §3.8.5 最后两格接线（B 区访客引导条 + 拉取失败整页错误卡）

- 开工时刻（本机实测）：`2026-09-21 19:42:47`（`date` 原样输出）
- 收尾时刻：见 §4 各日志文件 mtime（scratch：`C:/Users/曹怡明/AppData/Local/Temp/t19gv/`）
- 可改三文件：`apps/app/src/screens/MeScreen.tsx`、`apps/app/test/me-screen.spec.tsx`、本报告。其余全部禁动 —— 两证自见 §4-④。

## §0 盘面复核（与简报不符处的逐条更正）

1. **简报 §A 与 §C-3 自相矛盾（F-03）**：§A 写"K-02 与 F-03 本轮故意不动"，§C-3 又"允许把 F-03 的失败半支翻成错误卡四串"。**以 §C-3 为准**执行（更晚、更细、且与 C-2 交付直接冲突的那颗只能翻）。
2. **K-02 的失败半支被简报的因果写反了（更正 TPM，§G 授权）**：简报说"K-02 不动"。盘面事实：K-02 失败半（原 `:1612`）钉的是 `buttonByLabel(VERBS.signOut)).toBeNull()`，而 `:1001` 的次按钮 `SETTINGS_COPY.fetchFail.signOut` 与 `VERBS.signOut` **同串**（`退出登录`），且 §B 规范逐字"次按钮`退出登录`**仅在已登录态出现**"⇒ 本支必现。**"K-02 不动"与规范原文不可兼得**，按规范原文做：K-02 访客半一字未动，失败半翻为"全树恰一颗『退出登录』、且它住在 `data-testid=me-fetch-fail` 卡里（G 区触发钮不画）+ 确认层关闭时仍不占 DOM + 凭据仍在"。翻面账已写进用例注释与本报告 §2。
3. **简报 §A-2 说"J-05 重点看"，盘面 J-05 实际在 `:1533-1572`**（行号相符），但简报称 `GUEST_VISIBLE_TEXTS` 在 `:1107-1115` —— 盘面确为 `:1107-1115`，无误。
4. **`注册` 按钮落点的因果**：简报称"`LoginScreen.tsx:83` 的 `mode` 是内部 state、没有 URL 驱动的注册态入口"—— 盘面复核**属实**（`grep query|useLocation|location` 在 LoginScreen 0 命中，mode 只有 `React.useState`）。另登记一处旁证分叉：**`StudyScreen.tsx:618/622` 已经在往 `/login?mode=register…` 导航**，而登录屏根本不读 query ⇒ App 侧"带 mode 的登录导航"今天就有两颗既成死参（非本轮引入、非本轮修，登记待裁）。
5. **跑测命令的一条假信号（§E 更正）**：`pnpm --filter @tm/app exec vitest run test/me-screen.spec.tsx` **并不安全** —— `apps/app` 的 `test` 脚本实为 `vitest run --root ../.. --project @tm/app`，在包内裸 exec 丢 workspace project ⇒ 65 颗全红 `localStorage is not defined`（run1 日志为证）。本轮改用仓库根 `pnpm exec vitest run --root . --project @tm/app apps/app/test/me-screen.spec.tsx`（run2/run3），全量仍跑 `pnpm --filter @tm/app test`（run4）。
6. **shared 盘面复核**：`guestGuide :608-612`、`fetchFail :593-598`、`AUTH_COPY.submit :653`（`login:'登录' / register:'注册'`，`activate` 在同格第三键）、`signOut :568-573` —— 与简报逐字一致；`copy.ts:585-586` 明写 `SETTINGS_COPY.fetchFail` 与 §3.7 那份**不是一个状态、不借用不合并**，本轮照办（并为此给 A-07 新列 `STUDY_COPY` 禁借，见 §2）。
7. **UI 规范盘面**：§3.8.5 表在 `.delivery/03-ui-spec.md:996-1004`（`:998` 未登录 App / `:999` Web / `:1000` 骨架 / `:1001` 拉取失败），触控红线在 §3.8.6 `:1013`（"行 ≥56px、按钮 ≥44×44"）。与简报一致；表内还有 `:1002-1004` 三行（通知被拒/提醒 N=0/强改密待办），均非本轮。

## §1 三件事实现与裁定

### C-1 · B 区访客引导条（`:998`）
- 触发门 `!signedIn && !guestGuideHidden`，渲染在 h1 之后、账号头/列表之前的 **B 区原位**（`{account ? … : null}` 的兄弟支，层级顺序未动）。
- 五串全 import：`SETTINGS_COPY.guestGuide.{headline,subtitle,continueAsGuest}` + `AUTH_COPY.submit.login/.register`（shared `:604-605` 纪律，0 第二副本）；屏内 0 自造串、0 拼接（A-01 CJK 0 命中仍绿）。
- 按钮语义（TPM 裁定已照抄进屏内注释）：`登录`/`注册` 都 `navigate(LOGIN_ROUTE)`（import 自 `auth-store.ts:48` 的既有常量，屏不新增路由字面量、E4 总账零增量）；已知降级 = `注册` 落登录屏默认 sign-in 态 —— **登记 §3**。
- `先不用，继续本机使用` = 纯 `React.useState` 收起（`guestGuideHidden`），0 持久化、0 存储键（M-02  spy `Storage.prototype.setItem` 0 次 + `localStorage.length===0` + 卸装重挂载引导条回来）。
- 几何：三颗钮 `min-h-tap`（≥44）、两主钮所在行 `h-14`（56px，`:1013`）；无 `:has()`/顶层 await/新语法（A-04 绿）；渲染文字禁词面 `云端/本地/已连接/未连接` 0 命中（M-01 显式扫；"本机"按定稿原样，未改一字）。

### C-2 · `:1001` 拉取失败整页错误卡
- 门：`fetchFailed = signedIn && profile.isError`（query 配置一字未动，`retry: 1` 用尽才判错 —— M-04 钉 `getCalls()===2` 时才出卡；M-06 钉在途不出卡）。
- 整页降级：命中支时 B/C/D/E/F/G 各门（`account`/`showGoal` 族）天然全假，H 受 `showSettingsSections` 门 ⇒ 只画 h1 + 错误卡；本轮另把 `showUpgradeHint` 补了 `&& !fetchFailed`（软告知行虽只依赖凭据，也不让降级页长出第二块内容 —— 逐字"整页降级为**一个**错误卡"）。
- 装配 = `@tm/ui` `EmptyState`（照 `StudyScreen.tsx:630-648` 先例，`size="lg"`），四槽一律 `SETTINGS_COPY.fetchFail.*`，**未借 `STUDY_COPY`**（新立禁借哨，A-07）；`icon` 槽不传（`:1001` 未逐字定图标，不发明、不抄 StudyScreen 的局部 `WarnGlyph` 副本）。
- 主按钮 onClick = `void profile.refetch()`；次按钮 = 打开 G 区既有那颗 `ConfirmSheet` —— 为此把 `ConfirmSheet` 从 `showGoal` 块**上提为常驻**（关闭时 Radix 不挂 content，K-01"不占 DOM"钉仍绿），全屏仍只一套退出确认，0 新增第二套。
- 假 0 面：M-04/F-03 钉错误卡支 `buttons()` 恰 2、无统计卡/无 D 行/无滑杆/无同步行。

### C-3 · 测试钉
- 新增 M 组 6 颗（M-01 整表+几何+禁词 / M-02 收起+不持久化 / M-03 两颗导航+降级钉死 / M-04 再试一次=refetch / M-05 次按钮=既有 ConfirmSheet / M-06 在途不出卡）。
- `GUEST_VISIBLE_TEXTS` 增补 `:998` 五串**字面量**（不用 groups[i] 位借）；L-03 拉取失败半支的"不画页脚"按 F-36 裁定前口径**保留为显式断言**（详见 §2 对照与 §3 登记）。

## §2 新旧断言对照（不许变松的自证）

改动过的既有钉共 7 颗 + 新增 6 颗；**没有一颗只删不加**，每处翻面都同时落了更强的正向钉：

| 钉 | 旧断言（摘要） | 新断言（摘要） | 松紧判定 |
|---|---|---|---|
| `GUEST_VISIBLE_TEXTS`（常量，F-01/G-03/H-04/L-03 共用） | 7 串整表 | 12 串整表（增 `:998` 五串，字面量、含 DOM 顺序钉） | 更紧 |
| H-04 | 整表=7 串 + `includes('登录')===false` + `not.toContain(headline)` | 整表=12 串 + `img` 0 颗 + 脱敏手机号不上屏 + headline 槽逐字钉 | 接线轮必然面；"B 区头不渲染"两判据保留 |
| F-03 | 整表 `[顶栏标题]` + `signOut.title` 不在 + `账号信息` 不在 | 整表 = h1 + `:1001` 四串逐字 + 四槽 shared 逐字钉 + 卡/行/滑杆/列表/页脚/同步行/保存钮 **7 路反查 0 命中** | 空表钉→整表钉，覆盖面只增不减 |
| K-02 访客半 | 不动 | 不动 | — |
| K-02 失败半 | `退出登录` 钮 `toBeNull()` + 层 null + 凭据在 | 全树**恰一颗** `countButtonsLabeled===1` + 它 `closest('[data-testid=me-fetch-fail]')` 非空 + 层 null + 凭据在 | 串撞车下的最紧等价钉（G 区触发钮不画的判据由"住在卡里"承担） |
| A-05 `<button` 计数 | 5 | 8（引导条三颗） | 交付必然面，留翻面账注释 |
| A-07 | 禁借含 `fetchFail`/`guestGuide`；`AUTH_COPY` 计 2 | 两颗移出禁借转**正向清单**（9 槽 + `EmptyState`）；`AUTH_COPY` 计 4 且 `submit.(login|register)` 计 2；**新增** `STUDY_COPY` 禁借 | 净更紧 |
| A-03 | `fetch(` 包含扫 | 扫前摘 `.refetch(`（react-query 重取出口，非裸 fetch），**并正向钉 refetch 恰 1 颗** | 不放松：裸 fetch 仍 0，多一颗 refetch 即红 |

未动清单（自证）：A-01/02/04/06/08、B 全组、C 全组、D 全组、E 全组、F-01/02/04、G-01~04、H-01~03、I-01~04、J-01~05、K-01/03~06、L-01/02 —— 一字未改（L-03 只改注释文案，断言代码零改动，其"失败半不动"在盘面事实下本就被 F-03 的翻面覆盖）。
运行核对：`463 = 基线 457 + 新增 6`，`0 failed`（§4-① 原文）。

## §3 差异与登记项（全部照现状实现 + 登记，未越权修）

1. **`注册` 按钮已知降级**：落点 = `#/login` 默认 sign-in 态（路由表无第二颗 gate、登录屏无 URL 驱动注册态）。M-03 已把降级钉死（含 `not.toContain('register')` 反向哨），待 TPM/用户裁"登录屏读 `?mode=` 或路由表加 `/register`"。旁证分叉：`StudyScreen.tsx:618/622` 早已在发 `?mode=…` 死参（非本轮引入）。
2. **F-36（随单带给 PM）**：`:1001` "整页降级为一个错误卡"要不要让 H 页脚（备案号+品牌句）穿透？**本轮照逐字口径不穿透**，并把"不画页脚"钉成 F-03/L-03 的显式断言 ⇒ 将来裁定翻面时会翻这两颗钉留痕。TPM 的"页脚应穿透"倾向**未采信为事实**（口径纪律 §G），故不做。
3. **`:998` 后半句"C/D/E 保留但数字用本地值"未实现**（§D-7 禁做）：访客态 C/D/E 仍整段不画、不画假 0 —— 与规范那一格**存在字面差异**，登记待裁（本地词数有源 `useWordbookMeta`？本轮未调研接线面）。
4. **`:1000` 首屏骨架未做**（§D-7 禁做）：在途支现状 = 只剩 h1 空页（M-06 已把"在途不出卡"钉住，等于把骨架缺口钉成可回归事实）。
5. G-03 注释里"§3.8.5 本地值缺口见报告"那一老缺口 = 本 §3-3 同一条，继续挂账。
6. 软告知行（upgradeTodo）在错误卡支被 `!fetchFailed` 一并收进降级面：`:1001` 未逐字点名此行，属"整页降级为一个错误卡"的字面推导，注释已标判定理由；若 PM 认为该行该穿透（它同样与档案无关），翻一颗门即可。

## §4 出口原始输出（日志留存：`C:/Users/曹怡明/AppData/Local/Temp/t19gv/`，run1~run6 + verify）

**① 全量测试** `pnpm --filter @tm/app test`（run4-w-full.log，末行汇总原文）：

```
 Test Files  18 passed (18)
      Tests  463 passed (463)
   Duration  17.15s (transform 5.13s, setup 0ms, collect 24.04s, tests 65.09s, environment 13.75s, prepare 2.62s)
```

基线 457 → 463（+6 颗 M 组新钉），0 红。me-screen 单文件（run3-me-screen.log）：`Tests 65 passed (65)`（59+6）。
（run1 为 §0-5 假信号证据：包内裸 `vitest run` ⇒ `Tests 65 failed (65)`，报错面 `localStorage is not defined`。）
**报告落盘后复跑同令（run7-w-full-final.log）：`Test Files 18 passed (18)` / `Tests 463 passed (463)`** —— 终态以 run7 为准。

**② typecheck** `pnpm --filter @tm/app typecheck`（run5，脚本名以 `apps/app/package.json` 为准：`tsc -p tsconfig.json --noEmit`）：

```
$ tsc -p tsconfig.json --noEmit
exit=0（无任何诊断行）
```

**③ build** `pnpm --filter @tm/app build`（run6-build.log，节选）：

```
✓ built in 9.21s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：22 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```

`find apps/app/dist -type f | wc -l` = `22`（护栏数不变）。

**④ 禁动面两证**（A-77 #261 口径，sha256 快照 + find 反查）：

- 开工快照 270 颗文件（`packages/shared|packages/ui|apps/web|packages/server` 全量非构建文件 + `router.tsx`/`main.tsx`/`LoginScreen.tsx`/`ownership.json`/两颗 `data.db`），收尾 `sha256sum -c` 复算（verify-sha256.txt）：

```
$ sha256sum -c before-sha256.txt → 270/270 行 ": OK"（末行样例：tools/ownership.json: OK），exit=0
```

- `find . -newermt '2026-09-21 19:42:47'`（排除 node_modules/.git/dist，newer-than-start-final.txt 全文，报告落盘后复跑）：

```
./.delivery/04-dev-report-T-19g-v.md
./apps/app/src/screens/MeScreen.tsx
./apps/app/test/me-screen.spec.tsx
—— 写入清单 = §D-1 三文件，零越界
```

**⑤ 真库收尾复测**（与开工基线三项全等）：

```
253952 2026-09-18 04:05:38.198449400 +0800     ← data.db（size / mtime；sha256 前 12 = 6595517661cc）
0      2026-09-17 00:10:53.374159200 +0800     ← packages/server/data.db（占位；sha 前 12 = e3b0c44298fc，空串常量）
```

## §5 未完成项（本轮范围外，均已登记）

1. `:998` 后半句"访客态 C/D/E 数字用本地值"—— 未做（§D-7），现状整段不画；
2. `:1000` 首屏骨架 —— 未做（§D-7），在途支 = 只有 h1（M-06 钉住"不出卡"下限）；
3. `注册` 按钮 URL 驱动注册态入口（`router.tsx`/`LoginScreen` 两颗禁动件）—— 待裁；
4. F-36 页脚是否穿透 `:1001` 降级支 —— 待 PM/用户裁定，本轮照逐字不穿透并显式钉死；
5. `SettingRow` 上收 `@tm/ui/patterns`（G-6 老缺口）—— 不在本轮；
6. `fetchFail.retry/signOut` 与既有同串的收敛（copy.ts:587-591 抛给 TPM 那一问）—— 仍待裁，shared 本轮零 diff。
