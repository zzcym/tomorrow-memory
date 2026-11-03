192 .delivery/04-dev-report-E4-a.md

# 04-dev-report — E4a（批次4 出口轮·账务子任务：归属表回填 + 门禁脚本顺序缺陷修复）

任务号：AR-2（出口轮维护线） · 子任务：E4a 件1～件4 · 日期：2026-07-27（工作区时钟）
改动面（白名单内）：`tools/ownership.json`（1038 → **1171 行**）、`tools/boundaries.mjs`（3003 → **3206 行**）。
未动：`.delivery/` 主文档（仅按授权读文件头注与 tools/ 双件）、`tools/fixtures/depcruise/**`（T-02 的）、`data.db`、git 提交面（零 commit / 零 push）。
本报告自身行数 = 第一行 `wc -l` 原样输出的数字（192）。

---

## ① 件1～件3 落点 + 改后行号

### 件1 · 机械枚举无条目文件并逐件登记
- 枚举法：以 `--check-ownership --task T-02 --files <盘上清单>` 的 **no-entry 原样输出**做机器差集（基线 67 行，含 21 行「HEAD 在册、工作区已删」死文件；盘上真件 46 件）。
- 逐件读**文件头注块**取任务号（brief 指定权威来源），批3/4 新件 15 件全部有自署任务号 → 逐件建精确条目；批1 存量件（package.json/tsconfig/Dockerfile/旧脚本等）头注无任务号可引 → **保留 no-entry、列待 TPM**（见⑦），不硬编 owner。
- 落点（改后 ownership.json 行号）：
  - `tasks` 名册 +9 号：行 32–40（T-25 / T-18a / T-18b / T-18c / T-19a / T-19b / T-26a / T-26b / E2，各带批次+标题+裁决出处）；
  - 新增 17 条精确条目：行 1042–1160（清单见④表），**刻意追加在数组末尾**——用于证明新比较器判定与书写顺序无关（件3）；
  - 每条 reason 均含文件头原话引文 + 行号锚。

### 件2 · per_file 语义收口 + 批4 新 owner 落位
- `packages/server/src/routes/**`（行 586–605）：per_file 字典补 `"packages/server/src/routes/analyst.ts": "T-26a"`（行 605），盘上 14 个 routes 文件至此**全部有精确字典位**，兜底逗号串不再吃到任何实际文件。
- `packages/server/src/trpc/routers/{...}.ts` 条目（行 266–267）：owner 串 `'T-07,T-09,T-10,T-10,T-11,T-11,T-08,T-08,T-08,T-11'` → 去重 `'T-07,T-08,T-09,T-10,T-11'`（判定集合不变的集合化改写；重复位是按假想"按序映射"硬凑的产物，真实语义下无意义——依据见②）。reason 内已写明该结论（行 268）。
- `apps/app/src/screens/**`（行 435 起）：字典值按头注收精——Study/Completion→T-18a、Wordbook→T-18b、Progress→T-18c、Login→T-19b、Lookup/WordDetail→T-17；Me/Security/UpgradePassword/About 四件**盘上未建**，维持计划归属 T-19 不预填。
- `apps/app/src/lib/{auth-store,token-bridge}.ts`（行 981）：owner T-19 → **T-19a**（两文件头注各自署 T-19a，引文见④）。
- readers 字段按码面实证保持文档性（如 lib 条目 readers [T-17,T-18] 不动）。

### 件3 · boundaries.mjs 入口匹配顺序缺陷修复 + 账面自检
- `ownershipEntryHits`（行 1065）：导出命中判定（rootOnly → per_file 精确键 → glob），命中与排序解耦。
- `ownershipSpecificity`（行 1087）+ 重写 `matchOwnership`（行 1098–1110）：四级定序——**无通配精确条目恒赢** → 首个通配符前字面量前缀更长者优先 → 通配符更少者优先 → 路径字典序收尾。旧实现 `b.path.length - a.path.length` 的两处结构性错误（模式串长度≠具体度；等长并列落到 V8 稳定排序 = JSON 书写顺序决定判决）被根除。
- owner 名册校验（行 1583–1612 + 1720）：条目 owner 逗号各项 + per_file 全部值必须存在于 `table.tasks`；违例进 `tableErrors` → `rejections` → **整轮拒判 exit 2**。`'*'` owner 自此结构性不可能（名册无 `*` 号）；注入的最小沙盒表（无 tasks 字段）跳过该校验，但**仓库默认表缺 tasks 同样拒判**，无逃逸通道。
- HELP 同步（行 1821–1830）：`--check-ownership` 与 `--self-test` 两段补 E4a 说明。
- 钉死用例组 `ownershipE4aCases()`（行 2890–3040）+ selfTest「3b) E4a」接线（行 3047–3053）：①a 花括号长度翻转、①b 等长并列顺序翻转（两枚均带 oldWinner() 改前复刻做对照）、② no-entry 报告且不阻断、③ per_file 精确字典语义、④ 疫苗两枚（owner=T-404 不存在号 / owner='*'，各自必须拒判 exit 2）、⑤ 真表 0 账面缺陷 + T-02 自有文件 pass、⑥ 真表整体 reverse 后全部精确条目+per_file 键赢家恒定。全部跑在 `os.tmpdir()/tm-e4a-own-*` 沙盒 fixture，**零真实文件触达**，结束 `fs.rmSync` 清理。

---

## ② per_file 语义实测结论（一句话 + 实验）

**一句话**：`per_file` 是「精确相对路径 → owner」的**字典**（键优先于条目自身 glob 被命中，见 boundaries.mjs 行 1065–1069 的 `entry.per_file[rel]` 分支）；条目 `owner` 的逗号串**不是**与文件按序对应的映射，只是「glob 命中但不在字典里」的文件的**兜底 owner 集合（任一即过）**——`ownersOf(entry, rel)` 码面即此语义。

实验（已固化进 `--self-test` 用例③，行 2959–2970 附近）：fixture 表 `lib/**` owner=`T-01,T-02` + per_file=`{lib/a.ts: T-02}`——
- `--task T-02 --files lib/a.ts` → pass；`--task T-01 --files lib/a.ts` → **violations=1**（字典值精确单号，不是兜底集合）；
- 字典外文件 `lib/z.ts`：`--task T-01` 与 `--task T-02` 均 pass（兜底任一即过）；
- 若逗号串是按序映射，则 `lib/a.ts` 只对串位 1 的 T-01 开放——实测正相反，**按序映射假说不成立**，故 routers 条目的重复位（T-10,T-10 / T-11,T-11,T-11 / T-08,T-08,T-08）是按假想映射硬凑的账面噪声，E4a 按真实语义去重（集合不变，判定不变，⑥ 赢家恒定实证）。

---

## ③ 顺序缺陷 · 改前/改后对照实验

两枚疫苗场景，改前判决用 `oldWinner()`（boundaries.mjs 行 ~2908，逐字复刻旧比较器 `b.path.length - a.path.length`）在同一 fixture 上现算，写进 self-test 断言：

| 场景 | fixture | 改前（长度序） | 改后（具体度序） |
|---|---|---|---|
| ①a 长度≠具体度 | 精确条目 `pkg/deep/a.ts`（12 字符） vs 花括号条目 `pkg/deep/{a.ts,z.ts}`（19 字符），花括号**先写** | 赢家=花括号条目（19>12，精确被压） | 赢家=`pkg/deep/a.ts`（exact 层恒赢） |
| ①b 等长并列 | `aa/b.ts`（7 字符） vs `aa/*.ts`（7 字符） | 两串等长 → 决胜落到**数组位置=JSON 书写顺序**；同表 reverse 后赢家从 `aa/b.ts` 翻成 `aa/*.ts` | 精确层恒赢 → 恒为 `aa/b.ts`；reverse 后不变 |

整表级复现（同表乱序 → 判决恒定）：
- 真表（更新后）整体 `ownership.reverse()`：对**全部 349 个既有被管文件 + 新登 17 件**逐一重跑 matchOwnership，赢家/owner **翻转 0 处**（self-test 用例⑥ 已把「全部精确路径条目 + 全部 per_file 键」钉成永久断言）；
- 真表 rotate(17) 冒烟：同样 0 翻转；
- 新旧比较器对 349 个既有文件全量对照：**0 处既有判定被改变**（修复对存量非回归——旧表恰好未被长度序咬到，缺陷是结构性的、潜伏的）。

---

## ④ 件4 · 一致性证据表（逐件：旧判定 → 新判定 · owner 依据）

A 组 · 件1 新登记（旧判定均为 **no-entry**，15+2 件）：

| 路径 | 旧判定 | 新判定 | owner 依据（文件头注原话 / 裁决号） |
|---|---|---|---|
| apps/app/src/data/queries/auth.ts | no-entry | 精确条目 · T-19b | 头注「登录域数据层（T-19b / A-50 #129 授权面）」；readers [T-19c,T-19d]（行 1042） |
| apps/app/src/data/queries/analyst.ts | no-entry | 精确条目 · T-18c,T-26b ⚠️ | 头注「学习情况（R-19①…）tab4」正文自署 T-18c 与 T-26b 两任；双记账号待 TPM 收敛（A-47 #106，行 1049） |
| apps/app/src/components/progress-data.ts | no-entry | 精确条目 · T-18c,T-26b ⚠️ | 头注「**纯投影层**…—— T-18c」+「T-26b 只改了这里的**取数形状与注释**」⇒ 两任皆实际动过，如实双记（行 1056） |
| apps/app/src/components/wordbook-toolbar.tsx | no-entry | 精确条目 · T-18b | 头注「词本工具条的两件控件（T-18b；UI §3.6.3 区 C/D + §3.6.7）」（行 1063） |
| apps/app/test/study-screen.spec.tsx | no-entry | 精确条目 · T-18a | 头注「T-18a 判据自证（App 背词屏）」（行 1070） |
| apps/app/test/completion-screen.spec.tsx | no-entry | 精确条目 · T-18a | 头注「T-18a 判据自证（App 背词完成页）」（行 1077） |
| apps/app/test/wordbook-screen.spec.tsx | no-entry | 精确条目 · T-18b | 头注「T-18b 判据自证（App 单词本一级页 #/wordbook）」（行 1084） |
| apps/app/test/progress-screen.spec.tsx | no-entry | 精确条目 · T-18c | 头注「T-18c 判据自证（App 轻学情页 #/progress）」（行 1091） |
| apps/app/test/login-screen.spec.tsx | no-entry | 精确条目 · T-19b | 头注「T-19b 判据自证（App 登录屏 #/login）」（行 1098） |
| apps/app/test/auth-store.spec.ts | no-entry | 精确条目 · T-19a | 头注「T-19a 的地基用例（§10.2 T-19 行的判据②与判据⑧…）」（行 1105） |
| packages/server/test/integration/analyst-rest.spec.ts | no-entry | 精确条目 · T-26a | 头注「T-26a · 学情分析 REST 门面…（A-47 #106 / #107，R-19 轻学情页 P0）」（行 1112） |
| packages/server/test/integration/profile-output-parser.spec.ts | no-entry | 精确条目 · T-11 | 头注「T-11 微轮 fix2 · **A-34-1②**：profile.get 挂上 output parser…」（行 1119） |
| packages/server/test/release/manifest.spec.ts | no-entry | 精确条目 · T-21 | 头注「T-21c-iii · N-4（A-47 #105）+ U-4（A-45 #91）…manifest 台账面」（行 1126） |
| apps/web/e2e/helpers.ts | no-entry | 精确条目 · T-15 | 头注「T-15 第 2 轮 B 的共用打桩层（e2e）」；readers [T-16,T-23]（行 1133） |
| apps/web/e2e/home-redline.spec.ts | no-entry | 精确条目 · T-15 | 头注「T-15 判据面 ③：首页极简红线（R-07① / UI §8.3-C）不破」（行 1140） |
| apps/web/test/home-shell.spec.tsx | no-entry | 精确条目 · T-12 | 头注「T-12 首页外壳自门禁（vitest + jsdom）」；readers [T-15]（行 1147） |
| apps/web/playwright.config.ts | no-entry | 精确条目 · E2,T-22,T-23 | 头注「A-30-6（批次3 出口轮 E2 建，T-22/T-23 接手维护）——全仓唯一的 Playwright 装配点」；E2 入 tasks 名册循 E1a/E1c/E3′ 伪任务号先例（行 40 / 1154） |

B 组 · 件2 收精（旧判定=兜底串/粗 glob 覆盖，改后=字典精确位）：

| 路径 | 旧判定 | 新判定 | owner 依据 |
|---|---|---|---|
| packages/server/src/routes/analyst.ts | routes/** 兜底串（不含新号）| per_file 字典位 · **T-26a** | 头注「学情分析 REST 门面（A-47 #106 / #107 · T-26a · R-19 轻学情页 P0）」（行 605） |
| apps/app/src/screens/StudyScreen.tsx | screens/** 兜底 T-14,T-17,T-18,T-19 | 字典位 · **T-18a** | 头注「App 背词页（#/study，tab2）—— T-18a」 |
| apps/app/src/screens/CompletionScreen.tsx | 同上 | 字典位 · **T-18a** | 头注「App 背词完成页（#/study/done…）—— T-18a」 |
| apps/app/src/screens/WordbookScreen.tsx | 同上 | 字典位 · **T-18b** | 头注「App 单词本一级页（#/wordbook，tab3）—— T-18b」 |
| apps/app/src/screens/ProgressScreen.tsx | 同上 | 字典位 · **T-18c** | 头注「App 学习情况页（/progress，tab4）—— T-18c」 |
| apps/app/src/screens/LoginScreen.tsx | 同上 | 字典位 · **T-19b** | 头注「App 登录屏（#/login，T-19b / A-44 #84 的 T-19 拆分…）」 |
| apps/app/src/lib/auth-store.ts | 条目 owner=T-19（粗） | 花括号条目 owner=**T-19a**（精确级） | 头注「登录态的**单一真值源**（T-19a / 架构 §3.1…）」（行 981） |
| apps/app/src/lib/token-bridge.ts | 同上 | 同上 · **T-19a** | 头注「native/bridge.ts 的**薄封装**（T-19a / 架构 §5.6…）」 |

C 组 · 判断不了归属、保留原状（不硬凑，列待 TPM）：

| 路径 | 判定（不变） | 保留理由 |
|---|---|---|
| packages/server/src/services/analyst.ts | services/** 粗兜底串覆盖（账面 pass） | 头注**无任务号自署**（仅「Phase 5」+功能描述）；A-47 域与 T-26a 相邻但头注不足证——该条目 reason 已挂 ⚠️ RK-11 待 TPM（行 676） |
| packages/server/src/scripts/entry-guard.ts | packages/server/src/** 兜底覆盖 | 头注只署裁决号「A-18-1」未署任务号（批次1 收口轮件，建表前存量） |
| packages/server/src/scripts/ddl-parity-runner.ts | 同上 | 头注只署「A-18-4」未署任务号，同上 |
| Me/Security/UpgradePassword/About 四屏 | screens/** 字典位 = T-19（计划归属） | 盘上未建，不预填子轮号；建轮按各自头注再收精（条目 reason 已写明） |

**合计**：no-entry 67 → 52 行（raw，含 21 行「HEAD 在册/盘上已删」死文件；盘上口径 46 → 31，**Y=31 ≠ 0，如实报**）；新登记精确条目 **17** 条；字典/条目收精 **8** 件（routes 1 + screens 5 + lib 花括号条目 2 文件）；tasks 名册 +9 号。

---

## ⑤ 两条出口命令 · 尾行原文 + 退出码（本人原样复跑粘贴）

命令 2 · `node tools/boundaries.mjs --self-test` → **EXIT=0**，尾行原文：

```
ddl-parity.mjs --self-test 通过 — ddl-parity --self-test：26/26 通过（SKIP 0）
boundaries --self-test：157/157 通过
```

命令 1 · `node tools/boundaries.mjs --check-ownership --task T-02 --files <盘上清单 373 项>` → **EXIT=1**，尾行原文：

```
--check-ownership task=T-02 触碰 329 个在册文件（清单 373 项 + patch 0 项） → 325 处越界
```

命令 1 判读口径（防误读）：
- 本任务无授权动作面，故按 brief 指引用 `--check-ownership` 的 **no-entry 输出**做机器枚举；`--task` 必须给一个名在册的号（缺号会被判「未知任务」拒判而非产出 no-entry 清单），T-02 即门禁脚本自身的号，纯探针选择。
- 329 触碰 − 4 自有 = **325 处越界**：全部是「其余任务的在册文件被 T-02 探针声明触碰」的**预期假阳性**，逐条均为「由 X 独占」型；**REJECT 行数=0**（owner 名册校验全表无账面缺陷），no-entry 打印 **52** 行（与④合计一致）。
- T-02 自有 4 文件 pass 由 self-test 用例⑤ 单独钉死（真表 + `--task T-02 --files tools/boundaries.mjs …` → 0 违规），故命令 1 的 exit 1 不构成对 tools/ 双件自身的否定判定。
- 出口命令用量交代：正式两条如上。另有一条**改前基线探针**（同命令 1 改表前跑，得 no-entry 67，即④表「旧判定」栏的原始出处）——超编第 3 条，理由在此；另有两次 `--self-test` 失败为调试期产物、非判决（一次 HELP 模板串被反引号截断致 exit 2、一次 fixture 拼写 `aa/*ts` 令 ①b 等长疫苗失效 156/157），均已修复后原样复跑取上列尾行。

---

## ⑥ data.db

全程未以任何方式读写根目录 `data.db`（只读真库；探针命令未触达、fixture 全在 os.tmpdir()、`git status` 亦无该文件条目）。

---

## ⑦ 保留 no-entry 的存量 31 件与理由（待 TPM 裁）

全部为**归属表建立前就存在的存量件**，不在 §10.2 任何任务行、头注亦无任务号可引；按纪律保留 no-entry（报告性、不阻断），不硬编 owner：

出口命令 1 的 no-entry 清单（52 行）中，21 行是「HEAD 在册、工作区已删」的死文件（删文件不需要条目），**盘上残余 31 件**逐件如下（与命令 1 输出原样一致）：

1. apps/web/Dockerfile
2. apps/web/next-env.d.ts
3. apps/web/postcss.config.js
4. apps/web/public/.gitkeep
5. apps/web/public/robots.txt
6. apps/web/src/app/admin/layout.tsx
7. apps/web/src/app/admin/page.tsx
8. apps/web/src/app/error.tsx
9. apps/web/src/app/not-found.tsx
10. apps/web/src/components/markdown.tsx
11. apps/web/src/components/user-shell.tsx
12. apps/web/src/index.ts
13. apps/web/src/lib/utils.ts
14. apps/web/tsconfig.json
15. packages/agent/package.json
16. packages/agent/tsconfig.json
17. packages/server/Dockerfile
18. packages/server/package.json
19. packages/server/tsconfig.json
20. packages/shared/package.json
21. packages/shared/tsconfig.json
22. scripts/build-examples.js
23. scripts/build-fts.js
24. scripts/build-zh2en.js
25. scripts/dsh-tunnel.bat
26. scripts/migrate-pg.js
27. scripts/prod-create-user.cjs
28. scripts/prod-user.sql
29. scripts/run-all.ps1
30. scripts/run-phase.ps1
31. scripts/test-fts-cjk.js

（清单口径：探针清单为托管面 apps/packages/scripts/tools 的盘上文件，排除 node_modules/dist/coverage/test-results 等生成物；把生成目录一并扫入会另见 apps/web/test-results/.last-run.json 之类运行产物，不归入账。）

理由分型：
1. **包根/构建配置**（#1–3、#14–21：package.json/tsconfig/Dockerfile/postcss/next-env）：跨任务公共面，归谁独占都是错——建议 TPM 走「公共设施 + 变更走 bounded-edit」通道另裁；
2. **apps/web 旧组件与路由零散件**（#4–13：admin/*、error/not-found、markdown、user-shell、index.ts、lib/utils、public 两件）：表前遗留，§10.2 无行、头注无任务号可引；
3. **scripts/ 旧工具脚本**（#22–31，含 .bat/.ps1/.sql/.cjs）：表前运维手写件，非任何开发任务交付物；
4. 另有两类**账面已覆盖但判不准**的遗留（不算 no-entry，同列待 TPM）：services/** 9 件存量（RK-11，条目 reason 已挂 ⚠️，行 676）；packages/server/src/scripts/{entry-guard,ddl-parity-runner}.ts（头注只署 A-18-x 无任务号，兜底覆盖）；以及④C 组 analyst.ts（services）与 progress-data.ts / data/queries/analyst.ts 的 **T-18c,T-26b 双记账号待收敛**。

31 件全部**保留 no-entry**（报告性、不阻断），未塞进任何 `**` 兜底条目、未写 `'*'` owner——为清零硬编 owner 违反本轮纪律。

（`unowned_but_guarded` 注记于两次出口命令**之后**才补写，checkOwnership 不读该字段，判决不受影响；该注记中分类枚举与本节以逐件清单为准。）
