# 技术设计：Tomorrow Memory（AI 记忆管理 · Web + Android App）

> 版本：~~v1.0（架构师定稿，对应 `01-prd.md` PRD v1.3 最终版）~~ → ~~**v1.0-fix1（架构师文档轮，对应 `01-prd.md` PRD v1.4：27 条 P0 = R-01~R-24 + R-39 + R-40 + R-41。本轮只改文档、不改代码；改动全部就地保留可追溯痕迹，清单见 `.delivery/02-tech-design-fix1.md`）**~~ → **v1.0-fix2（架构师第二轮文档轮，对应 `01-prd.md` PRD v1.5；依 A-33-1 常设通道由架构师实写、TPM 出裁决号；本轮仍然**零代码改动**，`packages/**`/`apps/**`/`tools/**` 一行未动；六项改动 = A-35-1⑤ / A-35-4 / A-35-5 / A-35-6 / A-35-9 / A-33-8，全部就地追加或就地更正并保留 `~~原文~~` + 裁决号戳，清单见 `.delivery/02-tech-design-fix2.md`）** → **v1.0-fix3（架构师第三轮文档轮 = A-36 裁决落地轮；依 A-33-1 常设通道由架构师实写、TPM 出裁决号；仍然**零代码改动**；七项改动 = A-36-1 / A-36-2 / A-36-4 / A-36-5+A-36-11 / A-36-7+A-36-8 / A-36-2+E3′（F-7、新增 F-10）/ A-36-13+F2 §b，清单见 `.delivery/02-tech-design-fix3.md`）**
> 输入：`01-prd.md`（~~v1.3，26 条 P0：R-01~R-24 + R-39 + R-40~~ → ~~**v1.4，27 条 P0（新增 R-41）**~~ → **【fix2】v1.5，27 条 P0 不变 + `R-42` 入 P1 backlog**）、`00-tech-audit.md`、`00-user-review.md`、`07-feedback-log.md`、`04-adjudications.md`（~~**A-24-1 / A-28 / A-30 / A-32 全套 + A-33**~~ → ~~**【fix2】A-24-1 / A-28 / A-30 / A-32 / A-33 / A-34 / A-35 全套**~~ → **【fix3】A-24-1 / A-28 / A-30 / A-32 / A-33 / A-34 / A-35 / A-36 全套**）、`04-dev-report-T-11.md`（**P-5 / P-9**）、**【fix2 新增输入】`01-prd-fix2.md` §0 三处定稿与 §2 交回 TPM 的四项、A-34-1、A-35-1⑤ / A-35-4 / A-35-5 / A-35-6 / A-35-9、A-33-8**、**【fix3 新增输入】`04-adjudications.md` A-36 全节、`04-dev-report-E3-prime.md`（基线再生与新 sha `5d89760c…`、四组差异）、`04-dev-report-F2.md` §4-§5（`baseline-regenerate:A-36-E3` 通道 + owner 短路缺口）、`04-dev-report-T-07.md`（DEFECT-3/4 回环修）**
> 门禁自查：第 1 / 2 / 10 节为硬性必存项；第 10 节为下游并行开发的唯一排班表。
> **引用约定（重要，避免下游误读）**：形如 `§3.4`、`§10.3` 的裸章节号一律指**本文档**；凡来自 PRD 的编号一律带 `PRD` 前缀 —— 特别注意 `PRD §8.2` / `PRD §8.3-A~D`（走查判据）、`PRD §6.4-2`（12 步清单）、`PRD §6.6-4`（对外告知四条）与本文档自有的 §8（关键取舍）/ §9（风险）/ §6.4（清单实现点）**不是同一套编号**。任务号 `T-xx`（批次与归属）与批次1 的落地顺序冲突时，以 §10 为准。

## 目录

1. [技术选型汇总](#1-技术选型汇总)
2. [重构后目标目录树](#2-重构后目标目录树)
3. [共享底座设计](#3-共享底座设计)
4. [后端设计](#4-后端设计)
5. [App React 化方案](#5-app-react-化方案)
6. [数据与兼容性](#6-数据与兼容性)
7. [Web 前端设计](#7-web-前端设计)
8. [关键取舍与理由](#8-关键取舍与理由)
9. [风险清单](#9-风险清单)
10. [任务拆分与文件边界](#10-任务拆分与文件边界门禁硬要求)
11. [给 PM 的阻塞反馈](#11-给-pm-的阻塞反馈)

---

## 1. 技术选型汇总

> 选型总原则（角色卡 + 审计 §4/§5）：**能复用现有栈就不换框架；能不动数据就不动数据；每项选该场景生态最成熟、AI 生成质量最高的方案。** 本期是"有生产库的存量系统重构"，不是绿地开发，因此**变更半径**本身就是选型权重。

| # | 议题 | 选什么 | 为什么 | 备选与其代价（否决理由） |
|---|---|---|---|---|
| S1 | 仓库形态 | 维持 pnpm workspace（`pnpm@11.24.0`），把新包 **`packages/ui`、`apps/app`** 加进 `pnpm-workspace.yaml`（现为 `packages/*` + `apps/*`，天然覆盖） | 零迁移成本；`@tm/*` 已被 `tsconfig.base.json` paths 锁住，组件包与 App 一旦入库即可被双端 import | 迁 Turborepo/Nx 做任务图：本期只有 4 个可构建包，缓存收益 < 配置与心智成本；且 CI 只需串行 `pnpm -r`。否决 |
| S2 | 后端 Web 框架 | **Hono 4 + @hono/node-server（现状）保留**，REST 路由与 tRPC 挂载点都在 Hono 内 | 已在跑、bodyLimit/cors/ws 中间件齐全（`app.ts`）；R-01/R-03 只需"接口只加不改"，换框架会触碰 PRD §6.2 全部红线接口 | 换 Nest/Fastify 重写：改动面覆盖 PRD §6.2 的 9 个不可改形接口，等于自造本期最大风险。否决 |
| S3 | 双协议收敛方式 | **保留 tRPC v11（Web）+ REST（App/旧 APK）两套对外形状，内部一律收敛到 `packages/server/src/services/*` 单一实现（薄封装）** | PRD §6.2 明确禁止下线 `/trpc/*` 与 REST 任一侧；审计 §5 把"抽 service、双端薄封装"列为低风险可动项 | 单协议化（全 tRPC 或全 REST）：旧 APK 多版本共存且离线，任一侧下线直接违反 R-03 ①"旧 PUT 保留 ≥1 个大版本"。否决 |
| S4 | 运行时契约 | **zod v3（server 已依赖）落到 `packages/shared/src/contracts/*`**，TS 类型用 `z.infer` 单向派生；四份契约（`WordbookEntry`/`LookupResult`/`RatingInput`/`ProfileDTO`）为 R-06 验收对象 | 一份真相同时服务运行时校验（R-39/R-40 入参、R-02 rating 1-4 域）与编译期类型；审计 D-07 指出现有 `shared` 只有类型无运行时 | OpenAPI/JSON Schema + codegen：多一层构建产物与漂移窗口；`ts-fsrs` 状态已是二进制序列化，再加 codegen 会让 parity 定位变复杂。否决 |
| S5 | DB 访问层 | **保留 `db/sqlite.ts` + `db/pg.ts` 两套手写实现 + `DbInterface`（`db/types.ts`），新增 `tools/ddl-parity.mjs` 做双驱动门禁**（借鉴 `mobile-agenda/tests/ddl-parity.mjs` 的"同一 fixtures 两侧逐字段比对"） | R-39 ⑤b / R-40 ④ 的硬验收就是"SQLite 与 PG 双驱动逐字段一致"；抽公共 SQL 生成器要同时改写 1094 行生产代码，属本期不该碰的高危面 | 引 Drizzle/Kysely 统一方言：收益（少一份 parity 负担）真实，但需重写两张表族的全部 SQL 并在生产库回归，风险不对称。→ 列为 P2 技术债（§11 F-3） |
| S6 | 迁移方式 | **手写迁移脚本目录 `packages/server/src/db/migrations/NNN-<name>.ts`，每个 `up()` 必附 `down()` 或显式声明 `noDownReason`；本期全部是 `ADD COLUMN ... DEFAULT`** | PRD §6.4-7 三原则（只加不删 / 带默认值 / up 配 down）可被脚本静态检查强制；避免引入迁移框架后自动生成 `DROP`/改列 | Prisma Migrate / node-pg-migrate：Prisma 无法管 SQLite+PG 双驱动并存的现状，且会尝试接管 schema 生成客户端 —— 与 S5 冲突。否决 |
| S7 | Web 前端 | **Next 15 App Router + React 19 + Tailwind 3.4 + shadcn（现状）保留** | `apps/web` 3.9k 行、8 条路由 + 5 个业务组件已在跑；词详情页 `/word/[word]` 需要保留服务端渲染余地（R-36 P2 真 SSG）；R-07~R-23 全是页面内改造，不需要换栈 | 全站改 Vite SPA：丢 SSR/SEO 与已装的 `@trpc/react-query` 服务端能力，重写成本无收益。否决 |
| S8 | App 前端形态 | **Vite + React 19 SPA，新增 workspace 包 `apps/app`**，产物 `apps/app/dist/**` 由 `mobile-memory/build-apk.sh` 拷进 `mobile-memory/assets/`，仍以 `file:///android_asset/index.html` 载入 | D3 定案"重写为 React 并复用网页组件"；`base:'./'` 即可满足 `file://` 相对路径；原生 `MainActivity`/`AndroidBridge` 基本不动（审计 §4.3） | ① 手写 JS 继续维护：B-01/B-04 与双端漂移无解，PRD 已否决；② Capacitor + Gradle：引入整条新构建链且无应用商店分发需求，收益只有插件生态（本期只需通知/小组件，原生 200 行 Java 足够）；③ React Native：`packages/ui` 的 Tailwind DOM 组件全不可复用，与 D3 相反。否决 |
| S9 | App 数据通道 | **App 走 REST（`fetch` + TanStack Query v5 自定义 fetcher），不接 tRPC client**；Web 走 tRPC + Query | PRD §6.2 红线接口 REST 侧本来就必须保活，App 复用同形状最省；`file://` origin 下 tRPC `httpSubscriptionLink`(SSE) 与 WS 鉴权更难兜底（R-05 ③ 只对 Web 强制）；Query 抽象掉协议差异，`packages/ui` 仍与数据无关 | App 也上 tRPC client：省一层 REST 类型手写，但要为 `file://` 造 CORS/凭据兜底并把旧 APK 兼容面扩大一倍。否决（保留 `@tm/shared` schema 供两侧共用，不损失类型） |
| S10 | 共享 UI 包形态 | **`packages/ui` 为"源码型"组件包**（`exports` 直指 `./src/*.tsx`，不预编译 CSS/JS），两端各自把 `packages/ui/src/**/*.{ts,tsx}` 纳入 `content`/转译 | Next 与 Vite 对 npm 包的编译管线不同，预编译要维护两套产物与 sideEffects 声明；源码直出让 Tailwind 类名在两端都被本地扫描器捕获，根治 A-09"两处真相" | tsup 预编译 + 独立 `ui.css`：需 build 顺序、版本漂移与 CSS 覆盖顺序问题（且 Vite 侧 `file://` 下额外一个相对路径资产）。否决 |
| S11 | 设计 token | **单一源 `packages/ui/src/styles/tokens.css`（CSS 变量，`--brand-*`/`--surface-*`/`--state-*`）+ `packages/ui/src/tailwind-preset.ts`（Tailwind preset，色值一律 `hsl(var(--x))`）**；明暗只切 `<html data-theme\|class="dark">`，内联在 `index.html`/`app/layout.tsx` 的**同步首帧脚本**决定主题，杜绝 FOUC（修 A-09） | R-22 要求"明暗两套、不做自定义主题"，两端只有 token 一处真相才能守住；Tailwind preset 是 Next/Vite 双宿主唯一无摩擦的共用方式 | 只发一份编译好的 CSS：Vite 侧要引 CSS 资产（`file://` 相对路径风险），且 dark mode 切换必然重刷样式 → FOUC。否决 |
| S12 | 鉴权与凭据 | **保留 JWT HS256 + 30 天 TTL，claims 只加 `iat` 不改 `{id}`**；吊销用 `users.password_changed_at` 比较（`middleware/auth.ts`）；强制改密用**独立 upgrade token（TTL ≤30 分钟、仅 `auth.forceChangePassword`  audience 可用）**；token 载体仍为 localStorage / `AndroidBridge.saveToken` | R-40 ③④ 定案 + PRD §6.3 只加不删；`password_changed_at DEFAULT 0` 保证上线零掉线（R-40 ⑤ 方案 A） | ① 会话表白名单（方案 B）：上线瞬间旧 APK 与 Web 在线设备同刻掉线，直接违反 PRD §6.4-6 (b)，PRD 明确不采用；② **httpOnly Cookie：`file://` WebView 源为 `null`，Cookie 不落地 → App 直接失去登录态**（审计 §4.4），且要引入 CSRF 面。→ Cookie 化留给 R-38 专项 |
| S13 | FSRS 调度 | **`ts-fsrs` 锁 5.0.x（`overrides`/`resolutions` 双重钉版本），评分走 `services/review-service.ts` 唯一实现；撤销用新增快照表 `review_snapshots`，不改 `fsrs_cards.data` 格式** | 审计 §6 把 ts-fsrs 版本列为红线；R-11 撤销若用"重放调度"实现会造成 state 不可逆漂移，快照表是只加不删的最小方案 | 升 ts-fsrs / 自研调度：前者需 state 兼容性专项（§3.2 不做项），后者直接破坏存量 `data` 语义。否决 |
| S14 | 测试 | **Vitest**（`packages/{shared,ui,server}`、`apps/app` 单测与契约快照）+ **自研 `tools/ddl-parity.mjs`**（S5）+ **`node --test` 风格的真实集成测试（起 Hono app + 临时 SQLite 文件 / docker PG）** + **Playwright**（Web 走查 + App 走 `chrome-devtools` CDP attach WebView，移植 `mobile-agenda/tests/gui-cdp.mjs` 思路） | R-24 ① 要求 CI 不再出现 `echo "smoke placeholder"`；Vitest 与 Next/Vite 同生态，AI 生成用例质量最高；R-01/02/03/39/40 的验收判据全是"可调接口断言字段"，集成测试最贴合 | 只用 node:test：缺 snapshot/ui 能力；Jest：与 ESM + workspace 摩擦大。否决 |
| S15 | 静态断言（架构守卫） | **`dependency-cruiser`（`.dependency-cruiser.cjs`）承担 R-02 ①"评分路径不得 import agent/LLM"与"UI 包不发请求"两条硬约束**，接入 CI | 依赖图断言是唯一可判真假且零运行时成本的手段；比 ESLint 自定义规则可靠（能穿透 re-export/动态 import） | ESLint `no-restricted-imports`：只按 import 字符串匹配，被 `index.ts` 再导出即失效。否决（保留为辅助） |
| S16 | 运行时开关 | **`services/feature-flags.ts`：DB 表 `feature_flags(key TEXT PK, value, updated_at)`（SQLite/PG 同构）+ 进程内 30 秒 TTL 缓存；改值走 `POST /api/admin/flags`（复用 `adminPassword`）** | PRD §6.4-5 判据"改开关不需重新发版、≤60 秒生效"。环境变量做不到 ≤60 秒（要重启），Redis 在 C-13 迁库前不作为强依赖 | 只放 env/config.ts：改一次要重启，回退手段不成立 → 清单步 8 直接阻断；环境变量仅保留为**初值种子**（`FEATURE_FLAGS_JSON`）与 DB 不可用时的兜底 |
| S17 | 审计日志（R-39 ⑤b / R-40 ④） | **新建表 `account_audit_log(id, user_id, phone_masked, action, result, ip, ua, created_at)`**，`db/*` 双驱动同 DDL，写失败不吞（抛错并计入响应失败） | PRD 明确"只写 console.log 或进程内不落盘判为不通过"，且 PRD §6.4-4 的保留对账要求"集合每缩小一人须能查到对应 `account_activated`"—— 只有落库表才能被 SQL 核对 | 复用 ClickHouse `services/clickhouse.ts`：可观测性存储、非强一致、本地/CI 环境常缺，无法作为验收判据的检索源。否决 |
| S18 | 备份与发布前检查 | **`scripts/release/preflight.mjs`（清单 12 步的机器可执行部分：账号体检 SQL、DDL parity、快照 `VACUUM INTO`/`pg_dump -Fc`、恢复演练、开关初值 grep、旧口径文案 grep）+ `services/backup.ts` 补 SQLite 分支** | 审计 D-04：生产 SQLite 无备份 = 本期最高单点风险；PRD §6.4-2 要求"命令/产物、通过判据"，人工执行不可复现 | 依赖手工运维习惯：D-04/D-06 已证明现状就是手工且缺位。否决 |
| S19 | 包/语言版本约束 | TypeScript 5.6 严格模式（现状）；**App 侧 `tsconfig` 与 Vite `build.target: ['es2020','chrome84']`**；ESLint 9 flat config（现状 `eslint.config.js`） | Android System WebView 版本参差（小米/原生 84~120 共存），ES2020 + Chrome84 是"覆盖绝大多数且不需 polyfill 层"的下界 | 保持 `esnext`：老 WebView 白屏，且这类故障只在真机出现、CI 测不到。否决 |
| S20 | 不引入的东西（负面清单） | 不引入：Redux/Jotai 等状态库（Query + React state 足够）、对象存储 SDK（Q4 定案本期不迁）、Redis 新增强依赖（C-13 留后续）、Gradle、任何代码生成器、微服务拆分、monorepo 工具链 | 角色卡约束"能简单就不复杂，一个人一天能改明白" | — |

**出口对照**：R-01/R-39/R-40 → S12/S16/S17/S18；R-02 → S3/S13/S15；R-03 → S3/S4/S6/S16；R-04 → S4（ProfileDTO）；R-05 → S2（Hono WS/`onRequest`）+ S7（providers）；R-06/R-22 → S10/S11；R-07~R-16/R-23 → S7/S11；R-17~R-21 → S8/S9/S19；R-24 → S14/S16/S18。

## 2. 重构后目标目录树

> 图例：🆕 新建 ｜ ✏️ 由现有文件拆分/改写 ｜ 🗑️ 删除 ｜ ⛔ 该目录"禁止出现的东西"（并行开发的边界护栏，由 `.dependency-cruiser.cjs` + `tools/boundaries.mjs` 在 CI 强制）

```
tomorrow-memory/
├── pnpm-workspace.yaml                        ✏️ 仅本次允许 +packages/ui +apps/app 两行（归属 T-01）
├── tsconfig.base.json                         ✏️ +paths: @tm/ui, @tm/app；React 版本单一化（归属 T-01）
├── package.json                               ✏️ +workspace 脚本 test/ddl-parity/depcruise（归属 T-01）
├── .dependency-cruiser.cjs                    🆕 边界与 R-02/R-06 静态断言（归属 T-02）
├── eslint.config.js                            ✏️ + no-restricted-imports 辅助规则（归属 T-01）
├── docker-compose.dev.yml / .prod.yml          ⛔ 本期不改（避免动生产编排）
├── Caddyfile                                   ✏️ 仅 CORS 白名单段（归属 T-20，与原生壳同一 owner）
│
├── tools/                                     🆕 仓库级门禁脚本（无业务逻辑）
│   ├── ddl-parity.mjs                         🆕 sqlite↔pg 同 DDL/同结果对账（借鉴 mobile-agenda/tests/ddl-parity.mjs）
│   ├── boundaries.mjs                         🆕 grep 型门禁：旧口径文案 0 命中、passwordUpgradeDeadline 0 命中、开关默认值、token 目标产物扫描
│   ├── ownership.json                         🆕 §10.3 归属表的落地件（`boundaries.mjs --check-ownership` 消费）
│   ├── exceptions.json                        🆕 depcruise/boundaries 白名单（只登记既有历史违规，不放宽规则本身）
│   └── fixtures/schema-fixtures.json          🆕 parity 与双驱动测试共用固定数据集
│
├── web-static/                                🆕 APK 直链下载页 + `version.json`（静态托管，随 `apk-publish` job 发布；归属 T-22）
│
├── scripts/
│   └── release/                               🆕 R-24 发布前 12 步清单的机器可执行部分
│       ├── preflight.mjs                      🆕 步骤 2/4/5/6/6b/7/8 的编排入口（`pnpm release:preflight`）
│       ├── account-audit.mjs                  🆕 步 4：线上库六项计数 N/M/K/P/Q + 五类保留计数
│       ├── reconcile.mjs                      🆕 PRD §6.4-4 五项对账（≥20 真实账号）→ 报告 JSON 归档
│       └── restore-drill.mjs                  🆕 步 6/6b/7：快照恢复到临时实例 + 迁移演练 + 旧镜像冒烟
│
├── packages/
│   ├── shared/                                ✏️ 从"只有类型"升级为"运行时契约 + 常量"（无 IO、无框架）
│   │   └── src/
│   │       ├── index.ts                       ✏️ 唯一 re-export 出口（归属 T-03，其余任务只新增文件不改此文件以外）
│   │       ├── contracts/                     🆕 zod 契约（§3.3）：wordbook.ts / lookup.ts / rating.ts / profile.ts / auth.ts / review-queue.ts
│   │       ├── constants/                     🆕 rating.ts（四档 1-4 语义与文案 key）、errors.ts（全量错误码 ↔ 人话文案）、fsrs.ts
│   │       ├── schema/                        🆕 DDL 的 TS 单一描述源（列/类型/默认值），供 ddl-parity.mjs 与两驱动建表引用
│   │       ├── types.ts ✏️ / utils.ts ✏️     保留；类型改由 contracts 派生，禁止再手写重复 interface
│   │       └── ⛔ 禁止：zod 之外的运行时依赖、任何 fetch/trpc/fs/process.env、React 组件、向后兼容以外改名的旧类型
│   │
│   ├── ui/                                    🆕 R-06/R-22 展示型组件包（源码直出，见 §3）
│   │   └── src/
│   │       ├── styles/tokens.css              🆕 设计 token 单一源（明暗两套 CSS 变量）
│   │       ├── tailwind-preset.ts             🆕 唯一 Tailwind preset（色/间距/圆角/字号）
│   │       ├── primitives/                    🆕 button/card/input/dialog/avatar/badge/separator/skeleton/progress/tabs/switch/label/scroll-area（自 apps/web/src/components/ui/* 迁入，T-04 后 web 侧删除原件）
│   │       ├── patterns/                      🆕 LookupResultBar / RecentSearchPanel / WordDetailCard / Flashcard / RatingBar(四档+撤销) / WordbookList / Heatmap / GrowthLine / StatCard / SearchBar / EmptyState / ConfirmSheet
│   │       ├── auth/                          🆕 AuthFormShell（登录/注册/激活三合一两态表单，R-39 ⑨）+ ForcePasswordUpgrade 表单 + PasswordStrength + AgreementCheckbox + 公告条 NoticeBar
│   │       ├── hooks/                         🆕 useRecentSearches(本地存储) / useThemeToggle / useSpeak（Web Speech / App HTMLAudio 注入实现）
│   │       └── ⛔ 禁止：fetch/XMLHttpRequest/@trpc/react-query/axios；禁止 import @tm/server、@tm/agent、localStorage 之外的宿主假设（storage 通过 props 注入的 `kv` 适配器）；禁止硬编码品牌色字面量（必须走 token 变量）
│   │
│   ├── server/                                ✏️ 后端唯一实现处
│   │   └── src/
│   │       ├── app.ts                         ✏️ 仅中间件挂载与路由装配（归属 T-07；CORS 收紧亦由 T-07 在此文件落地）
│   │       ├── config.ts                      ✏️ +FEATURE_FLAGS_JSON、+upgrade token TTL、+sms.enabled=false 显式位
│   │       ├── middleware/
│   │       │   ├── auth.ts                    ✏️ R-40 ③ 吊销判定 + ④ upgrade token 门禁（audience 白名单）
│   │       │   ├── rate-limit.ts              ✏️ 错误码 TOO_MANY_REQUESTS 收敛（C-08）
│   │       │   └── password-gate.ts           🆕 强制改密期间的"除改密/登出外一律 403"策略表（REST + tRPC 共用同一份 allowlist）
│   │       ├── db/
│   │       │   ├── types.ts ✏️ / index.ts ✏️  DbInterface + 驱动工厂；新增方法一律先加 interface 再加两实现
│   │       │   ├── sqlite.ts ✏️ / pg.ts ✏️    仅允许"同签名同步扩展"；DDL 改从 `@tm/shared/schema` 生成，杜绝两写漂移
│   │       │   ├── migrations/                🆕 001-credentials-columns.ts / 002-review-snapshots.ts / 003-account-audit-log.ts / 004-wordbook-sync-columns.ts / 005-feature-flags.ts
│   │       │   └── ⛔ 禁止：DROP/RENAME/ALTER COLUMN 类型、UPDATE 回填 pw_policy_version、迁移内出现无 down 声明
│   │       ├── services/                      🆕 唯一业务实现层（REST 与 tRPC 都只是它的薄封装）
│   │       │   ├── auth-service.ts            🆕 R-01/R-39/R-40 登录·注册·激活·改密·token 签发（三出口唯一裁决点）
│   │       │   ├── password-policy.ts         🆕 R-40 ① 强度校验（≥8 位 / ≤72 字节，两端共用同一实现 + 由 shared 暴露给前端）
│   │       │   ├── review-service.ts          🆕 R-02/R-11/R-12：queue(mode)/reviewCard/undo —— ⛔ 本目录内 review 相关文件禁止 import @tm/agent
│   │       │   ├── wordbook-service.ts        🆕 R-03/R-15/R-16：整数组与增量两模式 + 开关裁决 + 乐观锁 409
│   │       │   ├── profile-service.ts         🆕 R-04：ProfileDTO 唯一装配点（daily_goal/dailyGoal 兼容映射）
│   │       │   ├── lookup-service.ts          ✏️ 现 services/lookup.ts 收口，R-09 详情所需字段
│   │       │   ├── search-history-service.ts  🆕 本机/R-26 云端的读接口（本期仅本机，服务端留形状）
│   │       │   ├── feature-flags.ts           🆕 S16 开关读取（尾号放量裁决 `isFlagOnForUser`）
│   │       │   ├── account-audit.ts           🆕 S17 落库审计（account_activated / password_upgraded）
│   │       │   └── backup.ts                  ✏️ 补 SQLite VACUUM INTO 分支（S18）
│   │       ├── routes/                        ✏️ REST 侧全部改薄封装（形状不变），路径与响应键名逐字保留
│   │       │   ├── auth.ts ✏️ +POST /api/register、+upgrade_required 分支（归属 T-07）
│   │       │   ├── wordbook.ts ✏️ +POST /api/wordbook/push、+GET /api/wordbook/pull（归属 T-09）
│   │       │   ├── review.ts ✏️ +GET /api/review/today 不变、+POST /api/review/undo、+GET /api/review/queue（归属 T-10）
│   │       │   ├── checkin.ts ✏️ 抽 service（归属 T-10）/ profile.ts ✏️ / avatar.ts 🆕 POST /api/avatar（归属 T-11）
│   │       │   ├── lookup.ts ✏️ / tutor.ts ✏️ / chat.ts ✏️ 仅鉴权与 DTO 收口（归属 T-11）
│   │       │   ├── version.ts 🆕 GET /api/version（归属 T-07，R-17 ⑨ 的版本提示数据源）
│   │       │   ├── admin-flags.ts 🆕 POST/GET /api/admin/flags（归属 T-07，仅开关读写）
│   │       │   └── admin.ts ✏️ 既有端点不动，只补 `flags` 入口的 re-export（归属 T-07）
│   │       ├── trpc/
│   │       │   ├── router.ts                  🗑️ 拆分后删除（610 行 → routers/*，见 §4.1）
│   │       │   ├── init.ts ✏️                createContext 增加 password-gate 判定（归属 T-07）
│   │       │   └── routers/                   🆕 dictionary/wordbook/review/checkin/profile/auth/agent/assessment/chat/analyst 十个域各一文件 + index.ts 组装 appRouter（归属见 §4.1）
│   │       └── ⛔ packages/server 内禁止：新增第二份同域实现（service 唯一）、直接 SQL 字符串散落在 routes/routers、import @tm/ui
│   │
│   └── agent/                                 ✏️ 仅 R-05 的 checkpoint key 改动（threaded.ts）
│       └── ⛔ 禁止被 review/wordbook/profile/auth 任何路径 import（S15 断言）；本期不升级 LangGraph
│
├── apps/
│   ├── web/                                   ✏️ Next 15 保留（§7）
│   │   └── src/
│   │       ├── app/upgrade-password/page.tsx  🆕 R-40 ④ 强制改密页（**刻意放在 `(user)` 组外**：不套登录墙与底部导航，只保留"改密 / 退出"两个出口；拦截层 `components/upgrade-gate.tsx` 挂在根 `layout.tsx`）
│   │       ├── app/(user)/
│   │       │   ├── page.tsx                   ✏️ R-07 收敛为 ≤5 可交互元素
│   │       │   ├── word/[word]/page.tsx       ✏️ R-09 一等公民（四来源进入、按来源返回）
│   │       │   ├── study/page.tsx             ✏️ R-11/R-12/R-13/R-14
│   │       │   ├── wordbook/page.tsx          🆕 R-15 一级页
│   │       │   ├── profile/page.tsx           ✏️ R-13 打卡常驻 / R-04 头像
│   │       │   ├── profile/security/page.tsx  🆕 R-40 改密 + 账号安全入口
│   │       │   ├── report/page.tsx            ✏️ 移动重排为 P1（本期只改 token）
│   │       │   ├── about/page.tsx             🆕 R-01 ⑧ 公告（未登录可读）
│   │       │   ├── chat/ assess/ layout.tsx   ✏️
│   │       │   └── ⛔ 禁止：在 page 内直接写 fetch('/api/...')（必须走 lib/api/* 或 tRPC）
│   │       ├── components/
│   │       │   ├── login-dialog.tsx           ✏️→ 变薄壳，主体迁 @tm/ui/auth
│   │       │   ├── header.tsx / mobile-nav.tsx 🆕 R-08 底部 5 tab + 更多抽屉
│   │       │   ├── word-lookup.tsx            🗑️（拆为 ui/patterns + web 容器）
│   │       │   ├── wordbook-sidebar.tsx       ✏️ 改为 ui/patterns/WordbookList 的 ≥1280px 外壳
│   │       │   ├── providers.tsx              ✏️ R-05 ③ SSE link 带 token
│   │       │   ├── ui/                        🗑️ 12 个文件全部迁往 @tm/ui（T-04 完成后删除）
│   │       │   └── charts/                    ✏️ Heatmap/GrowthLine 迁 ui/patterns，web 留 recharts 适配壳
│   │       ├── lib/ api/ ✏️ + trpc.ts ✏️ + use-auth.ts ✏️（R-23 登录态闪烁拆除）
│   │       └── app/globals.css                ✏️ 只保留 @import tokens + 宿主级覆盖（归属 T-04，其余任务不改）
│   │
│   └── app/                                   🆕 Vite + React 19 SPA（workspace 成员，R-17~R-21）
│       ├── index.html                         🆕 内联首帧主题脚本 + <base> 相对化
│       ├── vite.config.ts                     🆕 base:'./', build.target:['es2020','chrome84'], 单 chunk + 手动分包
│       └── src/
│           ├── main.tsx / router.tsx          🆕 hash 路由（`createHashRouter`，见 §5.1 原因）
│           ├── data/                          🆕 rest-fetcher.ts / queries/*.ts / mutation 封装 / offline-queue.ts
│           │   └── ⛔ 禁止：出现 JSX、直接 import 组件、绕过 rest-fetcher 的 fetch
│           ├── shell/                         🆕 TabBarShell / BackKeyBridge（R-18 返回语义）
│           ├── screens/                       🆕 Lookup / WordDetail / Study / Completion / Wordbook / Progress / Me / Login / UpgradePassword / About
│           ├── native/                        🆕 bridge.ts（AndroidBridge 探测与内存兜底）/ speak.ts / launch-focus.ts
│           └── ⛔ 禁止：Service Worker 注册、httpOnly/Cookie 假设、绝对路径资源、import @tm/server 或 @trpc/*
│
└── mobile-memory/                             ✏️ 仅作为 Android 原生壳 + 构建脚本（不入库 workspace，见 §5.6）
    ├── assets/                                ✏️ 变为 apps/app 的构建产物落点（原 index.html/app.js/api.js/style.css 迁往 legacy 分支，main 上删除）
    ├── src/com/tomorrow/memory/               ✏️ MainActivity.java（+WebView 设置）、AndroidBridge 内联类（+3 方法）、🆕 ReminderScheduler.java / ReminderReceiver.java / BootReceiver.java / WidgetUpdateReceiver.java
    ├── res/                                   ✏️ xml/search_widget（小组件改今日待背数）、🆕 drawable/ic_stat_* 、xml/file_paths（若需）
    ├── keystore-cert.sha256                   🆕 签名证书 SHA-256 指纹基线（非机密，CI 比对用；keystore 本体仍严禁入库，RK-13）
    ├── AndroidManifest.xml                    ✏️ +POST_NOTIFICATIONS / RECEIVE_BOOT_COMPLETED / SCHEDULE_EXACT_ALARM；allowBackup 评估见 R-33（本期改 false 需 P1，先登记）
    ├── build-apk.sh                            ✏️ +前置 `pnpm --filter @tm/app build` + 拷贝 dist→assets（**必须先从 .gitignore 反向纳入版本控制**，D-01）
    └── ⛔ 禁止：把 React 源码写在 assets/ 里（产物目录）、在 main 上双维护手写 app.js（Q6 定案：legacy 分支保留）
```

**顶层边界规则（三句话）**：① **`packages/ui` 只渲染，不请求**；② **`packages/server/src/services/*` 只有一个实现，REST 与 tRPC 是它的两个门面**；③ **`apps/app` 与 `apps/web` 互不 import**，共用内容只能来自 `packages/ui` + `packages/shared`。

## 3. 共享底座设计（R-06 / R-22）

### 3.1 `packages/ui` 的包形态

**结论：TypeScript 源码直出（source package），不编译产物。**

```jsonc
// packages/ui/package.json
{
  "name": "@tm/ui", "version": "0.0.0", "private": true, "type": "module",
  "exports": {
    ".":              "./src/index.ts",
    "./styles/*":     "./src/styles/*",
    "./tailwind-preset": "./src/tailwind-preset.ts",
    "./patterns/*":   "./src/patterns/*",
    "./auth/*":       "./src/auth/*",
    "./hooks/*":      "./src/hooks/*"
  },
  "peerDependencies": { "react": "19.0.0", "react-dom": "19.0.0" },
  "dependencies": { "@tm/shared": "workspace:*", "clsx": "^2.1.1", "tailwind-merge": "^2.5.4", "class-variance-authority": "^0.7.0" }
}
```

- **React 版本单一化**：`react` / `react-dom` 只在根 `package.json` 声明一次版本（`19.0.0`），`apps/web` 与 `apps/app` 用 `"react": "^19.0.0"` 且 `pnpm.overrides` 强制收敛，杜绝审计 §4.2 点出的 peerDependency 漂移。
- **`'use client'` 一律加在每个文件首行**：Next 侧需要，Vite 侧无害 —— 这是双宿主共用组件成本最低的一条统一约定。
- **宿主能力全部注入，包内零宿主假设**（这是"ui 包不发请求"的落点）：

```ts
// packages/ui/src/host.ts —— 组件只依赖这个接口，宿主各自实现
export interface UiHost {
  kv: { get(k: string): string | null; set(k: string, v: string): void };  // web: localStorage；app: localStorage + Bridge 双写
  speak(text: string, accent?: 'uk' | 'us'): void;                          // web: SpeechSynthesis；app: HTMLAudio(audio url)
  navigate(to: string): void;                                               // web: next/router；app: hash router
  toast(msg: string, tone?: 'info'|'error'|'success'): void;                // web: sonner；app: 自绘 banner（无 SW/无 next 依赖）
}
```

  由 `UiHostProvider`（context）提供；组件内部 `useHost()` 取值。**任何 `fetch` / `@trpc/*` / `next/*` import 都被 `.dependency-cruiser.cjs` 规则 `ui-no-io` 判红**（见 §3.5）。
- **数据靠 props**：所有 pattern 组件签名形如 `{ data, loading, error, onXxx }`，不含 Query hook。Query 只出现在 `apps/web/src/lib/api/*` 与 `apps/app/src/data/*`。

### 3.2 Tailwind 在 Next / Vite 双宿主的共用方式

| 项 | Web（Next 15 + Tailwind 3.4） | App（Vite + Tailwind 3.4） |
|---|---|---|
| 配置 | `apps/web/tailwind.config.ts`：`presets: [require('@tm/ui/tailwind-preset')]`，`content: ['./src/**/*.{ts,tsx}', './node_modules/@tm/ui/src/**/*.{ts,tsx}']` | `apps/app/tailwind.config.ts`：同一 preset，`content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}']` |
| CSS 入口 | `apps/web/src/app/globals.css`：`@import '@tm/ui/styles/tokens.css';` + `@tailwind base/components/utilities` + 宿主级覆盖 | `apps/app/src/styles/app.css`：同结构，**但样式文件全部走 Vite 相对 import**（`file://` 下由 `base:'./'` 保证同目录可达） |
| darkMode | preset 内 `darkMode: ['class']`，两宿主一致；App 侧 dark 由 `<html class="dark">` 驱动（P1 打开，P0 只建通道） | 同 |
| 源码包被扫描 | Next 15 默认不转译 node_modules；因为 `@tm/ui` 是 **workspace 软链**，Next 会转译。若解析异常，兜底用 `experimental.turbo.packages: ['@tm/ui']`（webpack 模式则 `transpilePackages: ['@tm/ui']`） | Vite 天然按源码处理；须在 `vite.config.ts` 的 `optimizeDeps.exclude` 与 `server.fs.allow` 显式放行 `packages/ui` |

**关键约定**：`packages/ui` 里**不写任何自定义 Tailwind 插件、不发 CSS 文件**（`tokens.css` 例外，它是变量而非规则）。组件只用 preset 暴露的语义类（`bg-surface`/`text-ink`/`border-hair`/`bg-brand-soft`），**禁止裸 hex / 禁止 `text-gray-500` 这类调色板直取**（`tools/boundaries.mjs` 正则门禁，对应 R-22 ③"grep 无硬编码 brand 色"）。

### 3.3 `packages/shared` 的 zod 契约组织

```
packages/shared/src/
├── contracts/
│   ├── wordbook.ts      ← R-03/R-15/R-16 词本条目与同步协议载荷
│   ├── lookup.ts        ← R-09/R-10 查词结果 + 最近查询
│   ├── rating.ts        ← R-02/R-11/R-12 四档评分、队列、撤销
│   ├── profile.ts       ← R-04 资料 DTO
│   ├── auth.ts          ← R-01/R-39/R-40 登录/注册/激活/改密入出参与错误码
│   └── errors.ts(在 constants/) ← 错误码 → 人话文案唯一表
├── schema/tables.ts     ← DDL 单一描述源（列名/类型/默认值），双驱动与 parity 脚本共用
└── index.ts             ← 唯一出口：export * from './contracts/*.js' 等
```

规则：① **`types.ts` 里的旧 interface 逐步改为 `z.infer` 派生**，但**不得删除或改名任何已导出的类型名**（`@tm/server`、`apps/web` 都在 import，改名会打穿并行任务）；② 契约文件只做**校验与形状**，不做业务默认值（默认值在 `constants/`）；③ zod 版本锁 `^3.23`（server 现依赖），**不升 zod 4**（避免与 tRPC v11 的 peer 冲突）。

#### 3.3.1 四个契约草案（R-06 ②"四处契约快照测试锁定"的对象）

```ts
// contracts/wordbook.ts —— 红线：现有字段名与语义不变（R-03 ⑦），只允许 .passthrough()
export const WordbookEntrySchema = z.object({
  word: z.string().min(1).max(64),
  addedAt: z.number().int().nonnegative().optional(),
  lastReview: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
}).passthrough();                      // ← "前端可能附加其它信息" 的现有行为，旧客户端未知键不报错
export type WordbookEntry = z.infer<typeof WordbookEntrySchema>;

// 整数组旧 PUT 载荷（/api/wordbook PUT 形状不变）
export const WordbookArraySchema = z.array(WordbookEntrySchema).max(5000);
// 增量协议（新，见 §4.4）：entries 为 upsert 集合，removedWords 为删除集合
export const WordbookPushInput = z.object({
  baseVersion: z.number().int().nonnegative(),
  entries: z.array(WordbookEntrySchema).max(500).default([]),
  removedWords: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export const WordbookPushResult = z.object({
  ok: z.literal(true), version: z.number().int(),
  merged: z.number().int(), added: z.number().int(), removed: z.number().int(),
});
export const WordbookPullResult = z.object({
  version: z.number().int(), updatedAt: z.number().int(),
  entries: z.array(WordbookEntrySchema),
});

// contracts/lookup.ts —— 判别联合，替代现 4 个平行 interface 的"手写重复"
export const TranslationGroupSchema = z.object({ pos: z.string(), meanings: z.array(z.string()) });
export const ExamplePairSchema = z.object({ en: z.string(), zh: z.string() });
export const LookupEn2ZhSuccessSchema = z.object({
  word: z.string(), phonetic: z.string(), translation: z.string(), definition: z.string(),
  groups: z.array(TranslationGroupSchema), exchange: z.record(z.string()),
  examples: z.array(ExamplePairSchema), freq: z.number(), tag: z.string(),
  detail: z.string(), audio: z.string(),
});
export const LookupResultSchema = z.discriminatedUnion('sourceLang', [
  LookupEn2ZhSuccessSchema.extend({ sourceLang: z.literal('en') }),   // 新增可选键：不改旧形状
  z.object({ query: z.string(), sourceLang: z.literal('zh'), results: z.array(Zh2EnEntrySchema), error: z.string().nullable() }),
  z.object({ query: z.string(), sourceLang: z.literal('mixed'), results: z.array(z.never()), error: z.string() }),
]);
// 最近查询（R-10，本期本机存储；形状与 R-26 云端同步预对齐）
export const RecentSearchItemSchema = z.object({
  word: z.string().min(1).max(64), direction: z.enum(['auto','en2zh','zh2en']).default('auto'),
  gloss: z.string().max(120).default(''),   // 首义，面板显示用
  at: z.number().int().nonnegative(),
});
export const RecentSearchListSchema = z.array(RecentSearchItemSchema).max(20);  // ≤20 条硬指标

// contracts/rating.ts —— R-02 ③"入参域 1-4，越界 4xx 而非静默截断"
export const RATING_VALUES = [1, 2, 3, 4] as const;
export const RatingSchema = z.enum(RATING_VALUES.map(String) as [string,...string[]])
  .transform(v => Number(v) as 1|2|3|4)
  .pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]));
export const ReviewInputSchema = z.object({ word: z.string().min(1).max(64), rating: RatingSchema });
export const ReviewResultSchema = z.object({          // 双端逐字段相等的判据载体（R-02 ②）
  word: z.string(), due: z.string(), state: z.number().int(),
  reps: z.number().int().nonnegative(), lapses: z.number().int().nonnegative(),
  rating: RatingSchema, reviewedAt: z.number().int(),
});
export const ReviewQueueMode = z.enum(['review','new','selfTest']);   // R-12 三模式
export const QueueItemSchema = z.object({ word: z.string(), hasCard: z.boolean(), gloss: z.string().default('') });

// contracts/profile.ts —— R-04 ③ tRPC 与 REST 同一 DTO + daily_goal/dailyGoal 兼容映射
export const ProfileDtoSchema = z.object({
  user_id: z.number().int(), phone: z.string(), nickname: z.string(),
  avatar: z.string(),                       // base64 或 URL 均允许（Q4：本期不迁对象存储）
  daily_goal: z.number().int().min(1).max(200),
  updated_at: z.number().int(),
  hasPassword: z.boolean(), pwPolicyVersion: z.number().int(),   // 新增可选布尔/数值（只加不改名）
}).passthrough();
export type ProfileDto = z.infer<typeof ProfileDtoSchema>;
export const profileDtoLegacyAlias = (p: ProfileDto) => ({ ...p, dailyGoal: p.daily_goal }); // 唯一兼容点
export const AvatarInputSchema = z.object({ dataUrl: z.string() });  // 上限由服务端 AVATAR_MAX_BYTES 单值（R-04 ①，见 §4.5）
```

另附 `contracts/auth.ts`（`LoginInput/RegisterInput/ChangePasswordInput/ForceUpgradeInput` + 出参 `{token,phone,hasPassword,nickname,avatar,activated?,upgrade_required?,upgradeToken?}`），字段口径与 §4.6 错误码表一一对应。

> **【fix3 · A-36-4 追加：这个文件的"放不放文案"必须分两口径说，不得再写成一句绝对的话】**
> - **§4.6 的响应码文案（`{error, code}` 那一份人话）不放 `contracts/auth.ts`** —— 它由 `packages/shared/src/constants/errors.ts` 单点提供，`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面是 §4.6 冻结面、一字不动（A-8 / A-35-2 的 md5 钉子必须仍绿）。
> - **但入参校验的展示串必须是 `contracts/auth.ts` 里的具名常量**，且**码串（如 `INVALID_PHONE`）严禁充当 zod message** —— 码的位置不变：服务端走 `tmAuthError('INVALID_PHONE')` → `errors.ts:80` 的 `copy`（正例现状 = `services/password-policy.ts:121`）。**机制原因（不是风格偏好）**：tRPC v11.18 的 **input 解析失败会把 `cause.message` 原样抬给客户端** —— `node_modules/.pnpm/@trpc+server@11.18.0_typescript@5.9.3/node_modules/@trpc/server/dist/initTRPC-BRf4imah.mjs:44-46` 只做 `new TRPCError({ code: 'BAD_REQUEST', cause })`、**不传 message** ⇒ `TRPCError` 默认取 `cause.message`，而 `ZodError` 的 message 就是 issues 序列化串；前端 `apps/web/src/components/login-dialog.tsx:50` 与 `:67`（正是 `auth.login`/`auth.sendCode` 两个入口）逐字是 `onError: (err) => toast.error(err.message)` ⇒ **码串会真的弹给用户**。
> - **单一真相不破**：正则继续只有 `packages/shared/src/constants/limits.ts:23` 的 `PHONE_PATTERN` 一份，message 只是**展示参数**（`phoneSchema(message)` 工厂 / 两个具名常量），**严禁**在任何域内复制正则或复制第二份判定；这两串常量落在 `contracts/auth.ts`（**非 §4.6 冻结面**），已实测到位：`packages/shared/src/contracts/auth.ts:24/:26` + 工厂 `:33`。两条串**不得合并成一句**（登录/发码语境不同，合并仍会打穿基线指纹 —— A-36-4①）。
> - **疫苗（端到端，不许只测 schema）**：经 tRPC **客户端**发一次非法手机号，断言拿到的 message **不含任何全大写码串**、且逐字等于还原后的人话；再把 message 换回码串，该用例必红（A-36-4④）。
> - **一处遗留口径矛盾（本轮只读复核的事实）**：`contracts/auth.ts` 头部注释原先的绝对写法（"本文件不放文案"）与本条新口径矛盾；**该注释已随 A-36-4① 由 T-07 微轮就地补了同一条例外**（现状见 `packages/shared/src/contracts/auth.ts:3-12`，含"`TM_ERRORS`/`TM_ERROR_CODES`/`TM_ERROR_ROWS` 三个面一字不动"）。**若 TPM 仍认为该头部注释需要再收一行**（把"不放文案"改成"不放 §4.6 响应码文案"这种精确式），**归批次4 的 T-03 轮带走**（`contracts/auth.ts` 的 shared 写权在 T-03 名下）；架构师本轮**未碰 `packages/**` 一行**。

#### 3.3.2 给 procedure 挂 `output` parser 的四条硬要求【fix2 新增 · 依 A-34-1 / A-35-1⑤】

> **为什么这一小节必须存在（批次4 的坑，每个挂 parser 的人都会踩）**：A-34-1 的立论是"挂了 `output` parser，客户端就推出真实类型而不是 `unknown`"。这句话**只对闭合对象成立**。T-11 按该口径把 `profile.get` 挂上 `ProfileGetOutputSchema = ProfileDtoSchema.extend({...})` 之后，`pnpm --filter @tm/web typecheck` **仍是同一个 `unknown` 错**：`ProfileDtoSchema` 本身是 `.passthrough()`（`packages/shared/src/contracts/profile.ts:45-57`），`extend` 出来的出参 schema 因此带 `{[k: string]: unknown}` 索引签名，而**属性访问时索引签名压过声明键** ⇒ `inferRouterOutputs<AppRouter>['profile']['get']['dailyGoal']` 依然是 `unknown`（TPM 双面探针实测 = A-35-1#1；结论已落在 `packages/server/src/trpc/routers/profile.ts:36-58` 的注释里）。所以"挂不挂"之外，**怎么挂**必须写成硬要求。

**四条硬要求（凡给 `@tm/server` 的 tRPC procedure 挂 `output` 都适用，不分批次）**：

1. **必须是闭合对象**。`output` 只能是默认 `unknownKeys='strip'` 的 `z.object({...})`；**禁止** `.passthrough()`，也**禁止** `.extend()` 一个带 passthrough 的 schema（`extend` 会把索引签名一起继承下来 ⇒ 等于没挂）。可机检判据：`output` schema 的 `_def.unknownKeys !== 'passthrough'`，或断言 `Object.keys(schema.shape)` 覆盖 `z.output<...>` 的全部声明键（与下面第 3 条的用例配套）。
2. **复用字段 schema 实例，不复制第二份形状**。写法固定为 `z.object({ ...DtoSchema.shape, ...本门面新增键 })`（`.shape` 给的就是同一批字段 schema 实例）。**禁止**把 DTO 的字段声明抄一遍 —— A-34-1① 的"不新造第二份真相"在这一条上不变，闭合化只是把外层容器从 `extend` 换成 `z.object`。仓内正例：`packages/server/src/trpc/routers/profile.ts:60-68`（8 个契约键全部来自 `ProfileDtoSchema.shape`，只把服务端已在发的 5 个统计/别名键补成显式类型面）。
3. **必须配一条"键集合钉"用例**，把"未声明键被静默 strip"钉成红。断言 = **真实服务端装配输出的 key 集合 ⊆ 闭合 schema 的声明键集合**（默认产品态要求全等），且**新增键未声明即红**；`PROFILE_DTO_LEGACY_ALIAS=off` 那一态另钉一条（少发别名键是产品行为，不是漏声明）。疫苗 = 临时给装配点加一个未声明键 → 该用例必红 → 删除。**理由**：passthrough → 闭合这一改会把"未知键静默存活"换成"未知键静默丢弃"，不配这支钉就是本期最恨的那一类假绿（A-19 / A-28-2）。已落地样板：`packages/server/test/integration/profile-output-parser.spec.ts:256-312`（`describe('A-35-1② 键集合钉…')` 四支：真实输出与声明键全等 / 声明键不从第三方形状派生 / legacy alias 关闭态同一支钉仍成立 / 三门面实际返回键集合都 ⊆ 声明键且过 parser 后不增键）。
4. **REST 侧的 passthrough 一律不动**。`WordbookEntrySchema` / `ProfileDtoSchema` / `WordbookGetResultSchema` 这些 `.passthrough()` 是**旧客户端未知键存活**的载体，也是 **T-06 事务内 RMW（读-改-写）不丢未知键**的既有语义来源（仓内已把它写成契约：`packages/shared/src/contracts/wordbook.ts:4` 与 `:29`、`packages/shared/src/schema/tables.ts:470`、`packages/server/src/db/migrations/006-entry-updated-at-doc.ts:7`）。闭合化**只发生在 tRPC 出参装配面**这一层；谁顺手把 shared 契约改成闭合，那是行为变更，会打穿 R-03 ⑦ / R-24 ⑧ 的兼容红线。

**配套口径（与 §10.2、§11 F-7 是同一条链）**：
- 第一批 = **`profile.get`**（shared 已有 `ProfileDtoSchema`，且已有双侧 `safeParse` 用例 `packages/server/test/integration/profile-dto.spec.ts:184/188-196`）⇒ 已按本节四条落地；前端 `apps/web/src/app/(user)/profile/page.tsx:92` 相应改读 canonical 键 `daily_goal`（A-35-1③）。
- **`dailyGoal` 在出参 schema 里只能是 `optional`**：`PROFILE_DTO_LEGACY_ALIAS=off` 时两门面同时停发该键（现存绿用例断言 `hasOwnProperty(viaTrpc,'dailyGoal') === false`），声明成必填就是 A-34-1② 要防的"会误杀的 parser"；前端要读的是 `daily_goal`。
- **没有 DTO 的过程本轮仍不补**（`output` 的前提是 shared 里已有一份被两侧共用的契约）；要补就先回 `packages/shared/src/contracts/**` 定契约（owner = **T-03**），并在 §10.4 登记一次跨批次交接 —— **禁止**在 router 里就地发明形状。
- 基线侧：`trpc-shape.baseline.json` 的 `output: null → <闭合 Schema>` 属**只增**（A-34-1③ / A-35-1④），出口 E3 按此核对；除此之外既有 procedure 的出参形状变化仍是缺陷。
  - **【fix3 · A-36-2 就地补齐本条的核对口径（E3′ 已按此追认并再生基线，新 sha `5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`）——"只增"在中间件轴上有配套的第三条**：`.output()` 在 tRPC v11.18 必然把 `outputValidatorMiddleware` push 进 `_def.middlewares` ⇒ **每挂一个 output parser，允许该 procedure 的 `nMiddlewares` +1，且新增项的名称必须逐字是 `outputValidatorMiddleware`**（`_type` = `output`，插在既有中间件序列里）。**其余任何 `nMiddlewares` 变化（含中间件的数量、顺序、`_type`、名称）仍落在 A-28-1 的字面禁区内 = 缺陷**；名称对不上即红。本条与 §10.2 T-11 判据⑨ 同为一处落点（`profile.get` 的 2→3 就是它唯一已登记的实例）。**下游不得把这一条读成"`nMiddlewares` 已放开"** —— 放开的额度精确到"每挂一个 parser 一个 `outputValidatorMiddleware`"，挂 parser 之外的任何手滑仍红。
  - **【fix3 · A-36-5 时序更正（原文保留）**：本条原先写"出口 E3 按此核对"，那句的隐含前提是"基线尚未再生"。该前提自 **E3′** 起不再成立：批次3 的**唯一一次**再生已由 E3′ 执行完毕（差异恰好四组，`auth.login`/`auth.sendCode` 逐字节 0 行 ⇒ A-36-#3/#4 的回环修已被可观测证据证明修对），四轴例外清单见 §10.2 批次4 通用约束段与 §11 F-7。批次4 的核对对象因此从"改前 vs 改后"变成"**改后 vs `5d89760c…` 这一份新基线**"，额度口径见同一段第 ⑤ 条。


### 3.4 设计 token 单一源与"明暗切换不 FOUC"

**token 分层**（`packages/ui/src/styles/tokens.css`）：

```css
:root {
  /* 语义层：组件只用这一层 */
  --surface: 0 0% 100%; --surface-sunken: 220 14% 97%; --ink: 222 47% 12%; --ink-muted: 220 9% 46%;
  --hair: 220 13% 91%; --brand: 262 83% 58%; --brand-soft: 262 83% 96%; --state-danger: 0 72% 45%;
  --state-success: 142 60% 38%; --focus-ring: 262 83% 58%;
  /* 尺度层：两端共用，禁止宿主覆写 */
  --radius-lg: 14px; --tap: 44px; --search-h: 50px; /* R-07 全宽 48-52px 输入框 */
}
.dark { /* R-22 ①②⑥：本期两端都要出暗套（App 侧同一份 token，无第二处真相）；R-29(P1) 只补 `res/values-night/*` 的原生标题栏配色 */
  --surface: 222 30% 8%; --surface-sunken: 222 24% 11%; --ink: 220 20% 96%; --ink-muted: 220 10% 65%;
  --hair: 220 14% 20%; --brand: 262 90% 70%; --brand-soft: 262 40% 20%;
}
```

- `tailwind-preset.ts` 把上述变量映射成语义色（`colors: { surface: 'hsl(var(--surface))', ... }`），**组件里只出现语义类**。
- **不 FOUC 的三处固定实现**（修 A-09 首屏闪白）：
  1. **Web**：`apps/web/src/app/layout.tsx` 的 `<head>` 内放**内联同步脚本**（`dangerouslySetInnerHTML`，非 `next-themes` 的 effect 路径），在首帧 CSS 之前读 `localStorage.theme` 或 `matchMedia('(prefers-color-scheme: dark)')` 并给 `<html>` 加 `class="dark"`；同时 `<html suppressHydrationWarning>`。原 `components/theme-provider.tsx`（40 行，`useEffect` 切类 → 必然闪白）**删除**，其 `useThemeToggle()` 迁到 `packages/ui/src/hooks/use-theme-toggle.ts`（只负责"切换 + 落盘"，不负责首帧）。
  2. **App**：`apps/app/index.html` 同样内联脚本；因 `file://` 无 SSR，首帧靠内联脚本 + `tokens.css` 内联进 `<style>`（Vite 用 `vite-plugin-inline-css` 或 `?inline` import，避免二次网络请求导致 FOUC 与离线样式缺失）。
  3. **共同**：CSS 变量在 `:root` 上就有值，**任何组件不允许依赖 JS 计算出的颜色**；主题切换只改类名不改 DOM 结构（避免 React 重挂载导致的白帧）。
- R-22 ①"不做自定义主题"→ 底座**不提供 theme 选择器 UI**，只提供 `light|dark|system` 三值开关（Web 顶栏 + App 设置页各一处）。

### 3.5 边界的机器强制（`.dependency-cruiser.cjs` 规则清单）

| 规则 ID | 断言 | 对应验收 |
|---|---|---|
| `ui-no-io` | `packages/ui/**` 不得依赖 `fetch`/`axios`/`@trpc/*`/`@tm/server`/`next/navigation` | R-06 ②"ui 包不发请求"、审计 §4.2 |
| `review-no-agent` | 从 `packages/server/src/services/review-service.ts`、`trpc/routers/review.ts`、`routes/review.ts` 出发的**可达闭包**内不得出现 `@tm/agent`、`@tm/agent/tools/llm-router`、`services/analyst.ts` | **R-02 ①"评分路径不得 import agent/LLM"（静态断言手段，详见 §4.3）** |
| `shared-pure` | `packages/shared/**` 不得依赖 `fs`/`http`/`process.env`/React | §3.3 |
| `app-web-isolated` | `apps/app/**` 与 `apps/web/**` 互不可达 | 顶层边界规则 ③ |
| `fsrs-version-lock` | `packages/server/src/services/fsrs.ts` 之外不得出现 `ts-fsrs` 的 import；版本区间由根 `package.json` 的 `pnpm.overrides` + `tools/boundaries.mjs` grep 共同断言 | 审计 §6 红线（S13） |
| `thin-facade` | `packages/server/src/{routes,trpc/routers}/**` 不得直达 `db/**`（白名单仅 `routes/admin.ts`），即"门面层不写 SQL" | §4.2 收敛规则 1（R-02 ② / R-03 ⑦ / C-02/C-03 的结构性防复发） |
| `no-legacy-app-js` | `mobile-memory/assets/**` 在 main 上只允许出现构建产物，不得被任何 `apps/**` import | R-20 ⑦（Q6：手写版只活在 `legacy/handwritten-app` 分支） |

## 4. 后端设计（R-01~R-05、R-39、R-40、R-24 后端面）

### 4.1 tRPC router 按域拆分（纯代码搬迁，签名不变 —— 审计 §5 的"可动"项）

现状：`packages/server/src/trpc/router.ts` **610 行 / 10 个 `router({...})` 域**（`dictionary` `wordbook` `review` `checkin` `profile` `auth` `agent` `assessment` `chat` `analyst`）。拆分后：

| 新文件 | 迁入的现有 procedure（逐条对号） | 依赖的 service | 归属任务 |
|---|---|---|---|
| `trpc/routers/index.ts` 🆕 | `appRouter = router({ dictionary, wordbook, review, checkin, profile, auth, agent, assessment, chat, analyst })` —— **键名顺序与现文件一致**，防客户端过程名漂移 | — | **T-08**（建与删的唯一 owner） |
| `trpc/routers/dictionary.ts` 🆕 | `dictionary.lookup`(:48-113，含 `tutorContent`) | `lookup-service` | **T-11** |
| `trpc/routers/wordbook.ts` 🆕 | `wordbook.*`(:114-169) + 🆕 `wordbook.push` / `wordbook.pull` / `wordbook.add` / `wordbook.remove` | `wordbook-service` | **T-09** |
| `trpc/routers/review.ts` 🆕 | `review.reviewCard`(:170-213) + 🆕 `review.queue` / `review.undo` | `review-service` | **T-10** |
| `trpc/routers/checkin.ts` 🆕 | `checkin.*`(:214-236) | `checkin-service`（现 `routes/checkin.ts` 抽出） | **T-10** |
| `trpc/routers/profile.ts` 🆕 | `profile.get/update`(:237-285，avatar 上限改读 `AVATAR_MAX_BYTES`) | `profile-service` | **T-11** |
| `trpc/routers/auth.ts` 🆕 | `auth.sendCode/login/changePassword/logout`(:286-376) + 🆕 `auth.register` / `auth.activate`（同一 service 同一函数，R-39 ①） / `auth.forceChangePassword` / `auth.me` | `auth-service` | **T-07** |
| `trpc/routers/agent.ts` 🆕 | `agent.*`(:377-399) | 现依赖 `@tm/agent`（**保持原样，不并入 review 链**） | **T-08**（本期不再改） |
| `trpc/routers/assessment.ts` 🆕 | `assessment.*`(:400-541) | 现内联逻辑**原样搬迁**；`assessment_cache` 缺 `user_id` 属 C-07（P1 R-28），~~本期不动 → 见 §11 F-5~~ **【P-9 更正（本行原文保留以便追溯）】** PRD v1.4 已把该缺陷由 P1 提为本期 **P0 `R-41`**（用户 F-5 决策"本期顺手修"），"本期不动"这句话自 v1.4 起失效 → 落点 = §10.2 批次4 **T-25**（并见 §6.1 新增的 M7 行、§11 F-5 的更正条） | **T-08**（建与删；~~本期不再改~~ → **R-41 的缓存键改造由 T-25 在批次4 改 `assessment.ts` + `assessment-parts.ts` 两个文件**，幅度与禁改面登记在 §10.4 第 8 行） |
| `trpc/routers/chat.ts` 🆕 | `chat.history`(:542-551) | R-05 ①②（`{userId}:{threadId}` 兼容读） | **T-11** |
| `trpc/routers/analyst.ts` 🆕 | `analyst.*`(:552-610) | `services/analyst.ts` | **T-08**（本期不再改） |
| `trpc/router.ts` | **🗑️ 删除**（T-08 的最后一个 commit 里删，避免半途有双份 `appRouter`） | — | **T-08** |
| `trpc/init.ts` ✏️ | `createContext` 增加：解出 `payload.aud`、`pw_policy_version` → 注入 `ctx.passwordGate`；SSE/WS 鉴权从 header 取 Bearer（R-05 ③） | `middleware/auth.ts` 共用同一 `verifyToken()` | **T-07** |

> **搬迁纪律**：每个域文件只做 `procedure` 声明 + zod 校验（改从 `@tm/shared/contracts` import）+ 一行 service 调用。**禁止在搬迁 commit 内夹带行为变更**（行为变更放独立任务，便于 PRD §6.4-3 分层回滚定位）。

### 4.2 REST ↔ tRPC 双实现收敛（消除 C-02/C-03/C-04/C-09）与旧 APK 兼容

```
             ┌─ apps/web ──→ /trpc/*  ─→ trpc/routers/<domain>.ts ─┐
  客户端 ────┤                                                     ├─→ services/<domain>-service.ts （唯一实现）
             └─ App/旧APK ─→ /api/*   ─→ routes/<domain>.ts (薄封装)┘        ↓
                                                                       db/sqlite.ts | db/pg.ts
```

**收敛规则（写成 code review 门禁）**：
1. `routes/*.ts` 与 `trpc/routers/*.ts` **只允许出现**：路径/过程声明、zod 入参 parse、service 调用、响应组装。**不得出现 SQL、`db.` 直调（除只读拼接的 admin）、`bcrypt.`、`jwt.`、`fetch(`**（`tools/boundaries.mjs` grep 判红）。
2. **响应形状以 REST 侧现状为基准冻结**（旧 APK 依赖），新增字段一律"可选 + 只加不改名"（PRD §6.1-3、PRD §6.2）。契约测试：同一 fixture 分别打 REST 与 tRPC，断言 `ReviewResultSchema`/`ProfileDtoSchema`/`WordbookArraySchema` 的 `safeParse` 双侧通过且 key 集合相同（R-04 ③ 快照测试）。**【fix2 · A-35-1⑤ 追加】本条的"双侧 key 集合相同"在 tRPC 侧还有一条实现前提：给 procedure 挂的 `output` parser 必须是闭合对象（`z.object({...})` 复用 `DtoSchema.shape`，禁 passthrough / 禁 extend 一个 passthrough），并带一支"键集合钉"用例；四条硬要求全文见 §3.3.2，正例 = `profile.get`。REST 侧的 `.passthrough()` 不在闭合化范围内（本条第 2 款的兼容性由它承担）。**
3. **旧 APK 兼容矩阵（本期不许改形）**：`PUT /api/wordbook`、`GET /api/wordbook`、`POST /api/review`、`GET /api/review/today`、`POST /api/login`、`POST /api/send-code`、`GET /api/profile`、`GET /api/me`、`GET /api/lookup`、`POST /api/lookup`、`GET /api/chat/history`、`/ws`、`/trpc/*` —— 每个接口在 `packages/server/test/contract/legacy-apk.spec.ts` 里有一条"响应 key + 类型"快照用例，改形即 CI 红。
4. **已知的两处现存分叉本期必须消失**：`review`（REST 与 tRPC 算法不同，C-02）、`profile.avatar` 上限（500 vs 200_000，C-04 → 统一为常量 `AVATAR_MAX_BYTES = 300 * 1024`，与 `app.ts` 的 `bodyLimit` 一起上调到 512KB 以留编码余量，解 C-18）。
5. **`auth` 三出口只有一个裁决点**：`auth-service.registerOrActivate()`（新建 / 激活 / 拒绝）被 REST 与 tRPC 同调，R-39 ① 的"6 例同码同文案"由单测直接对同一函数打两门面。

### 4.3 R-02 ①"评分路径不得 import agent/LLM"的静态断言手段（可判真假）

三层，任一层红即 CI 失败：

1. **结构层（主）**：`dependency-cruiser` 自定义规则 `review-no-agent`，写法为**从入口做可达性检查**（`--reachable` + `from: { path: 'packages/server/src/(services/review-service|trpc/routers/review|routes/review)\\.ts$' } to: { path: '(packages/agent|services/analyst|services/dict-sources)' }`），命令：`pnpm depcruise --config .dependency-cruiser.cjs packages apps --no-progress`。可达性而非 import 首段字符串 → 穿透 `index.ts` 再导出（这是 ESLint 方案做不到的，S15）。
2. **包边界层**：`@tm/agent` 只允许被 `packages/server/src/trpc/routers/{agent,chat,assessment}.ts`、`routes/agent.ts`、`services/{analyst,lookup,tutor}.ts` import（白名单制，新增 import 需改配置 = 强制评审）。
3. **运行时层（回归兜底）**：集成测试 `test/review-no-llm.spec.ts` 在跑评分用例前把 `globalThis.fetch` 与 LLM router 的 `chat()` 替换为 `throw new Error('LLM called in review path')`，然后四档各打一次 `POST /api/review`（R-02 ⑤ 的 P95<300ms 断言也在此文件，本机 SQLite 跑）。

**同时满足 R-02 其余判据**：`ReviewInputSchema`（rating 1-4，越界 → 400 `INVALID_RATING` 而非 `Math.min/max` 截断）；`review.undo` 写 `review_snapshots` 前置快照（`{user_id, word, prev_data, prev_due, reps_before, at}`），撤销 = 用快照整体回写一次 + 删快照行（**不改 `fsrs_cards.data` 的序列化格式**，S13）；R-02 ④"只在真实复习写卡"→ 队列 `mode` 决定：`selfTest`/`new` 顺序模式**不调度**（`review-service` 内 `if (mode !== 'review') return { scheduled: false }`），前端也需相应改造（R-12）。

### 4.4 R-03 词本增量同步协议

#### 4.4.1 协议形状（新增接口，旧接口零改动）

```
POST /api/wordbook/push      ~~tRPC wordbook.push~~ **REST 端点（同上，A-36-8 同口径）**      body: WordbookPushInput
  { baseVersion: 128,
    entries:      [ { word, addedAt?, lastReview?, reviewCount?, updatedAt } ],   // upsert 集合
    removedWords: [ "abandon" ] }                                                  // 删除集合（词名即键）
  → 200 { ok:true, version:131, added:1, merged:1, removed:1 }        （WordbookPushResult）
  → 409 { error:"VERSION_CONFLICT", code:"WORDBOOK_STALE", version:131,
          server: { updatedAt, entries:[...] }, pruned:true }          （仅当墓碑已被压缩，必须重放全量）
  → 4xx { code: 见 §4.6 }（条目超限/词名非法 → 不写库、不半写）

GET  /api/wordbook/pull      ~~tRPC wordbook.pull~~ **REST 端点（本期唯一门面，见下条）**      ?since=128（可选）
  ~~→ 200 增量：{ version:131, updatedAt, changed:[...], removed:["abandon"] }~~   【A-35-4 就地打戳：**本分支本期不做**，降级为"下一期（R-03 放量后再做）"。原文保留，不删。】
  → 200 全量：{ version:131, updatedAt, entries:[...] }   ~~（since 太旧 / 缺省）~~   【A-35-4 更正：本期**无条件恒回全量**（`since` 完全不参与判定），"太旧/缺省"这一档与上一行同属下一期。原文保留。】
```

- **对外形状红线**：`GET /api/wordbook` 仍返回 `{ data: WordbookEntry[] }`，`PUT /api/wordbook` 仍收 `{ data: [...] }` 且响应仍 `{ok:true}`（R-03 ①⑦）。旧 APK 永远只用这两个，**服务端内部把 `PUT` 转成"与 pull 到的最新全量做字段级 merge 后再落库"而非整表覆盖** —— 这正是 R-03 ②"并发用例双端都在"的修复点：现状 `routes/wordbook.ts:38` 的 `saveData(userId, entries, now)` 无条件覆盖就是丢词根因。
- **只加不删**：`wordbooks` 新增 `sync_version INTEGER NOT NULL DEFAULT 0` 与 `tombstones TEXT NOT NULL DEFAULT '[]'`（JSON 词名→删除时间戳）。**`data` 仍是 `WordbookEntry[]` 整数组**；条目新增可选键 `updatedAt`（PRD §6.1-3 允许"只允许新增可选键"）。

**【fix2 · A-35-4】本期显式契约（写死，替代上面被打戳的增量分支）**：

- **本期 `pull` 恒回全量快照**：`GET /api/wordbook/pull` 的响应**只有一种形状** = `WordbookPullResult`（`{version, updatedAt, entries:[…]}`，`packages/shared/src/contracts/wordbook.ts:68-73`），`?since=` 接受但**完全不参与判定**，任何取值都拿到同一份全量。仓内实证（本轮只读取得）：`packages/server/src/routes/wordbook.ts:84-88` —— 注释原文即"`?since=` 是 §4.4.1 给增量分支留的位置；`WordbookPullResultSchema` 只定义了全量形状，所以本期恒回全量（客户端 diff 即可），since 暂不参与判定 —— 见报告偏差 D-3"，实现 = `svc.snapshot(userId)`（`packages/server/src/services/wordbook-service.ts:342-345`，内部就是 `read()` 的全量 + 当前 `version`）。**契约侧**（A-35-4）：本期不存在"增量响应形状"，因此也不存在"增量 vs 全量"的二义性；客户端要差分就自己 diff 两份全量。
- **命名口径（PM 已在 PRD §6.2 第 3 项定稿，A-35-3 追认，此处记为唯一口径）**：请求侧 `since` = **游标**（"我上次看到的版本之后变了什么"），响应侧 `version` = **状态**（"我现在这一份是第几版"）。两者不是同一事物的两个名字，**本期两个键名都不改**（`version` 已被 `WordbookPullResultSchema` 与两门面共用，改名即破坏"只加不改"红线）。此句同时是部署说明里对运维/客户端的唯一解释，下游不得各自另写一套。
- **push 侧的 409 与墓碑压缩不在降级范围内**（诚实起见写清，避免"整节都以下一期为准"的误读）：`baseVersion` 不匹配 → 409 `WORDBOOK_STALE` + 服务端最新 `version` + 全量、以及 `pruned:true` 这一支**本期已实现**（仓内实证：CAS 写点 `packages/server/src/db/sqlite.ts:377`、载荷 `packages/server/src/services/wordbook-service.ts:67`、`:409`（`isPruned(baseVersion, fresh.tombstones)`）、`:590-598`，并已有绿用例钉住：`packages/server/test/contract/legacy-apk.spec.ts:910-955`）。**只有"pull 侧按 `since` 返回增量"这一件事本期不做。** **【fix3 · A-36-7 就地追认，本条一字未删**：TPM 已确认架构师的字面精确化成立 —— 降级只作用于 pull 的增量分支，**不存在**"把 push 409 推到下一期"的意思（那是**撤实现**，必须另出裁决才能做）。任何下游把本条读成"push 侧也等下一期"并据此删码，一律按 A-28-1 之外的越权改动处理。】
- **【fix3 · A-36-8 门面标注就地更正（保留原文戳）】本节的 `pull`/`push` 两行顶行原先把 tRPC 侧标成 `wordbook.pull` / `wordbook.push`，那是文档写错，不是范围**。`~~tRPC wordbook.pull~~` / `~~tRPC wordbook.push~~` 已就地划掉，正确标注 = **REST 两端点**（`POST /api/wordbook/push`、`GET /api/wordbook/pull`，实现在 `packages/server/src/routes/wordbook.ts`）。**显式写死一句：本期不新增 `wordbook.push` / `wordbook.pull` 两个 procedure** —— 仓内理由已在 `packages/server/src/trpc/routers/wordbook.ts:17-19` 写明（`trpc-shape` 基线含 caller 清单，加过程即改形），TPM 追认为由（A-36-8：为"文档写错"去动 caller 清单 = 开第三个未登记的基线例外面，且与本行 §10.2 T-09 的范围冲突）。**归口与例外**：文档标注由本轮（架构师 fix3）改掉，**代码零改动**；批次4 的 T-09 若真要做 procedure 门面，走 §10.2 批次4 通用约束段第 ③ 条 —— **先申报基线例外再动手**（A-36-5 的时序），不得出口时打包塞给 E 轮。
- **下一期（R-03 放量后再做，不占本期名额）**：`since` 参与判定 + `changed`/`removed` 增量载荷 + §4.4.2「压缩窗口」行的"客户端 `since` 落在已压缩区间 → 只能 409/全量重放"。前置条件：① 增量响应形状要先进 `packages/shared/src/contracts/wordbook.ts`（新增可选形状，仍受"只加不改名"约束）；② 墓碑 30 天压缩已在线上有真实数据；③ 旧 APK 兼容矩阵（§4.2 规则 3）不因新键崩。R-03 的灰度口径本来就是"旧 `PUT` 兼容一个大版本 + userId 尾号放量"，把增量放在放量之后才谈得上。
- **两处本期事实登记**（不改文档之外的任何东西，供 T-09 批次4 接线时一并收口）：① 本节顶行把 `pull` 标成 "tRPC `wordbook.pull`"，但仓内**本期不存在** `wordbook.pull` / `wordbook.push` 两个 procedure —— `packages/server/src/trpc/routers/wordbook.ts:17-19` 的理由是"`trpc-shape` 基线含 caller 清单，新增过程即改形"，增量协议的客户端消费面本期走 REST 两个端点；② `packages/shared/src/contracts/wordbook.ts:67` 的注释把查询键写成了 `?version=`，与上面定稿的"请求侧 `since`"不一致（属 shared 注释文本，本轮架构师不改代码，已写进 `.delivery/02-tech-design-fix2.md` 交回 TPM/T-09）。**【fix3 状态更新，原文保留：本行 ① 已由上一条（A-36-8）就地收口 —— 文档侧改标完成，代码侧本期不开这两个 procedure；② 已由 A-36-9 派给 T-03 第 2 微轮（一行注释、零行为变更），架构师本轮未碰 `packages/**`】**


#### 4.4.2 版本语义与合并规则（写死，不留"待定"）

| 规则 | 内容 |
|---|---|
| 版本单调 | `sync_version` 只在**实际改变集合**时 +1（幂等重放不 ++）；由 service 在事务内 `old+1`，不由客户端提供 |
| 字段级合并（同词并发） | 目标词已存在 → `addedAt` 取**较早值**、`lastReview` 取**较晚值**、`reviewCount` 取 **max**（R-03 ③"后写不覆盖前一次评分/复习次数"）、其余键按 `updatedAt` 较新者胜出 |
| 墓碑 | 删除记 `word → deletedAt`；`entries` 中 `updatedAt <= deletedAt` 的项**不再复活**；`updatedAt > deletedAt` 视为"用户重新收藏"→ 清墓碑并保留（R-16 显式收藏语义要求重加可用） |
| 压缩窗口 | 墓碑保留 30 天；客户端 `since` 落在已压缩区间 → 只能 409/全量重放，避免增量语义漂移 **【fix2 · A-35-4 就地限定：本行的两件事要分开看 —— 服务端侧的"30 天压缩 + `pruned` 判定"本期已实现并参与 push 的 409（取证见 §4.4.1 末段）；客户端侧"用 `since` 命中已压缩区间"这一句本期无从发生，因为 pull 恒回全量、`since` 不参与判定 ⇒ 该句与增量分支一同降级为下一期，原文不删】** |
| 幂等 | 同一 `(userId, baseVersion, 条目集合)` 重放：第二次 `added=0/merged=0/removed=0`，`version` 不变 → R-03 ④"客户端能重放成功且用户看不到报错" |
| 大小上限 | `entries ≤ 500/次`、`removedWords ≤ 500/次`、总量沿用现 20000 上限（错误码 `WORDBOOK_TOO_LARGE`，提示为人话） |

#### 4.4.3 双写兼容（开关关闭 / 混合客户端）与"读旧写新"

- **落库只有一条路径**：所有写（`PUT` 整数组、`push` 增量）最终都进 `wordbook-service.apply(userId, ops)` → 写同一 `data` 数组 + 同步 `sync_version++`。**不存在"增量表"与"整数组表"两份真相**，因此任意一侧写入天然对另一侧可见 → R-03 ② 并发用例通过的最短路径。
- 开关 `wordbookIncremental=off`（或未命中放量尾号）时：该用户的 `push/pull` **仍接受**（旧新 App 混用不给 4xx），但服务端退化为"整数组覆盖语义"（等价旧 `PUT`），并 `warn` 级日志埋点；`GET /api/wordbook` 行为完全不变（PRD §6.4-5-3 的"开关关闭后行为定义"）。
- **开关关闭前已按增量写入的词不丢**：因为数据本来就在同一 `data` 数组；墓碑在 off 态下**不参与读**（读时只滤掉 `deletedAt` 晚于条目 `updatedAt` 的项，off 态退化为不过滤，避免"关掉开关反而看不见词"）。

#### 4.4.4 按 userId 尾号放量的运行时开关落地点

| 层 | 落地点 | 说明 |
|---|---|---|
| 存储 | 表 `feature_flags(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`，迁移 `migrations/005-feature-flags.ts` | SQLite / PG 同 DDL（parity 覆盖） |
| 读取 | `services/feature-flags.ts`：`getFlag(key)` → 进程内 Map + **30 秒 TTL**；DB 读失败回退 `config.featureFlagsSeed`（env `FEATURE_FLAGS_JSON`）并 `error` 日志 | 判据"≤60 秒生效"取 **TTL 30s + 管理接口写后失效**，最坏 60s |
| 裁决 | **唯一**入口 `isWordbookIncrementalOn(userId)`：`const bucket = Math.abs(userId) % 100; return bucket < pct(key)`（value 存 `"0"`/`"10"`/`"50"`/`"100"`） | 尾号规则写死为 `userId % 100 < pct`，**不引入哈希**（哈希会让"同一人两次请求不同结果"无法解释） |
| 调用点 | **只在 `wordbook-service.apply/pull` 内部各一处**（REST 与 tRPC 都经 service）→ 单一裁决点，杜绝门面分叉 | |
| 改值 | `POST /api/admin/flags`（`adminAuth`）body `{key,value}`；`GET /api/admin/flags` 读当前值与 `updated_at` | 清单步 8 的"运行时可改"判据落点；只改开关不碰其它 admin 端点 |
| 埋点 | 每次命中/未命中打 `logMeta('wordbook_sync_mode',{userId:tail,on,pct})`（现有 telemetry） | R-03 ⑥ 抽样比对的取数来源 |
| 其余开关 | `passwordRegister` / `passwordUpgradeEnforce` / `explicitFavorite` / `studyModes` / `dailyReminder` / `avatarUnifiedLimit` 同表同机制；**默认值集中在 `shared/src/constants/flags.ts` 且 `tools/boundaries.mjs` 断言与 PRD §6.4-7 一致** | `passwordUpgradeEnforce` 默认 `on`；**其管辖范围严格限于"拦不拦"**（§4.7） |

### 4.5 R-04 / R-05 / R-24 后端面（要点）

- **R-04**：`profile-service.getDto()` 为唯一装配点（含 `hasPassword`、`pwPolicyVersion`）；`POST /api/avatar` 🆕 接收 `dataUrl`（≤300KB base64）→ 直接写 `profiles.avatar`（**本期不落文件、不迁对象存储**，Q4 定案），超限 → 4xx `AVATAR_TOO_LARGE`"图片太大，请换一张 300KB 以内的"；`app.ts` `bodyLimit` 200KB → 512KB（全局），词本 `PUT` 单独放宽到 8MB（`wordbooks` 数组可能很大，现状已被隐式限制造成 C-18 类问题）。
- **R-05**：checkpoint key 改 `${userId}:${threadId}`（`packages/agent/src/threaded.ts`）；`chat.history` / `GET /api/chat/history` 读时**先查新 key、未命中回退裸 `threadId` 且校验 `chat_messages.user_id` 归属**（兼容读，不迁移）；跨用户 → 403 `FORBIDDEN`；WS 首帧鉴权（`{type:'auth',token}`，3 秒未鉴权即 close），保留 72 小时兼容窗口接受旧 `?token=`（PRD §6.4-6 (b)），窗口结束由 `config.wsLegacyQueryAuthGrace=false` 关闭；Web `providers.tsx` 的 `httpSubscriptionLink` 加 `Authorization` 头。
- **R-24 后端面**：`services/backup.ts` 补 SQLite 分支 `VACUUM INTO`（§6.5）、`scripts/release/*.mjs`（§2）、`ci.yml` 用真实测试替换 `echo "smoke placeholder"`。

### 4.6 错误码 ↔ 人话文案（`packages/shared/src/constants/errors.ts`，两端共用）

| code | HTTP | 文案（唯一真相） | 出处 |
|---|---|---|---|
| `INVALID_PHONE` | 400 | 请输入正确的 11 位手机号 | R-39 ③ |
| `WEAK_PASSWORD` | 400 | 密码至少 8 位 | R-39 ③ / R-40 ① |
| `PASSWORD_MISMATCH` | 400 | 两次输入的密码不一致 | R-39 ③ |
| `AGREEMENT_REQUIRED` | 400 | 请先阅读并同意《用户协议》《隐私政策》 | R-39 ③ |
| `PHONE_ALREADY_REGISTERED` | 409 | 这个手机号已经注册过，请直接登录 | R-39 ③④ |
| `NO_PASSWORD_ACCOUNT` | 401 | 该手机号此前用验证码注册、还没设置过密码 —— 点"设置密码激活"… | R-01 ③④（**仅登录分支**） |
| `OLD_PASSWORD_REQUIRED` / `OLD_PASSWORD_INCORRECT` | 400 / 401 | 请输入当前密码 / 当前密码不正确（后者计入失败锁） | R-40 ② |
| `PASSWORD_SAME_AS_OLD` | 400 | 新密码不能和当前密码相同 | R-40 ① |
| `CREDENTIAL_EXPIRED` | 401 | 密码已修改，请重新登录 | R-40 ③ |
| `PASSWORD_UPGRADE_REQUIRED` | 403 | 为了账号安全，请先设置新密码 | R-40 ④ |
| `SMS_NOT_CONFIGURED` | 200(附码) | 短信通道暂未开通，请使用密码登录 | R-01 ⑥（旧 APK 收到不崩、不进倒计时） |
| `TOO_MANY_REQUESTS` | 429 | 操作过于频繁，请稍后再试 | R-01 ① / R-39 K-1 配额 |
| `TEMP_LOCKED` | 429 | 失败次数过多，请 10 分钟后再试 | `services/auth-policy.ts`（语义不回退） |
| `WORDBOOK_STALE` | 409 | （静默重放，不打扰用户） | R-03 ④ |
| `WORDBOOK_TOO_LARGE` / `AVATAR_TOO_LARGE` | 400 | 单词数量超出上限 / 图片太大，请换一张 300KB 以内的 | R-03 / R-04 |
| `REGISTER_CLOSED` | 403 | 暂时无法注册，请稍后再试 | `passwordRegister=off`（不指向验证码） |

**统一约定**：错误响应体恒为 `{ error: <人话>, code: <上表键> }`（`error` 保留旧客户端可读性，`code` 是新增可选键 —— 旧 APK 忽略即可）；**任何 P0 路径都不得返回 500 或裸 `{error:'请求失败'}`**（`tools/boundaries.mjs` + 契约测试断言）。

**【fix2 · A-35-9】"双门面错误码逐字相同"这条判据的适用范围（就地补限定，依据 = A-33-6 与 A-35-9）**：**仅限两侧真到达同一 service 出口的码**。事实是两面的**入参门禁载体不对称**：`rating` 在 tRPC 侧走 `RatingLiteralSchema`（`packages/server/src/trpc/routers/review.ts:20`；定义 `packages/shared/src/contracts/rating.ts:15-20`），越界值在 **zod 层**就被拦、根本到不了 service ⇒ tRPC 侧只能给出协议码 `BAD_REQUEST`；REST 侧的门禁是 service 的 `normalizeRating`，给得出 `INVALID_RATING`。把 tRPC 侧换成 preprocess 版 `RatingSchema`（`rating.ts:30-33`）确实能让两侧同码，但那会**改 input shape**，同时撞 A-28-1"形状只增不改"与 A-28-5"入参域不对称保留现状"，所以**不换**。据此，该支的判据 = **断 `httpStatus` 等值（400 ↔ 400）+ 钉住两侧各自的码 + 两侧零写入**，并在用例注释里写明"载体不对称是显式契约"（A-28-5 原口径）—— T-10r3 实际交付的这一支（`packages/server/test/integration/review-parity.spec.ts:280-309`）即为正解。**"码逐字相同"那一半**由真到同一 service 的码承担（同文件 `:569-680` 那组 describe：`:570` 重复撤销 409 `NOTHING_TO_UNDO`、`:605` 非法词形 400 `INVALID_WORD` 两支两侧逐字相同）。落点见 §10.2 T-10 判据③。

### 4.7 R-40 凭据加固：实现位置与最小吊销方案

| 条款 | 实现落点（文件:职责） |
|---|---|
| ① 强度 ≥8 / ≤72 字节 | `services/password-policy.ts`：`assertPasswordStrength(pw)`（**唯一函数**，REST/tRPC/两端表单同源 —— 前端从 `@tm/shared/constants` import 同一规则的镜像常量）。新密码 === 旧密码 → `PASSWORD_SAME_AS_OLD` |
| ② 改密必验旧 | `auth-service.changePassword({oldPassword,newPassword,confirmPassword})`：`bcrypt.compare` → 不匹配走 `auth-policy.recordFailure()`（5 次/10 分钟锁语义不变）；`password` 为空 → 直接 `NO_PASSWORD_ACCOUNT`（**改密口不得成为空密码账号的第二后门**，R-40 ②） |
| ③ token 可吊销（最小方案） | 列 `users.password_changed_at INTEGER NOT NULL DEFAULT 0`（迁移 `001`）；签发时 `jwt.sign({id, iat}, …)`（`iat` 由 jsonwebtoken 自动带上，claims 只加不改）；校验点 **`middleware/auth.ts:verifyToken()` 一处**（REST 中间件、`trpc/init.ts`、WS 首帧、upgrade 判定全部复用）：`payload.iat < user.password_changed_at → 401 CREDENTIAL_EXPIRED`。为免每请求查库：`password_changed_at` 进 **进程内 60 秒 Map 缓存**（key=userId，改密时主动失效）。**明确不采用会话表白名单（方案 B）** —— 上线瞬间旧 APK 与 Web 同刻掉线，违反 PRD §6.4-6 (b)；`DEFAULT 0` ⇒ 上线时刻零掉线（R-40 ⑤ 方案 A） |
| ④ 强制改密硬门禁 | **签发侧**：`auth-service.issueTokens(user, kind)` —— `kind='normal'` 要求 `password` 非空 && `pw_policy_version>=1`；命中 `0` 时登录返回 `{ token:'', upgrade_required:true, upgradeToken }`，`upgradeToken` = `jwt.sign({id, aud:'pw-upgrade'}, {expiresIn:'30m'})`。**校验侧**：`middleware/password-gate.ts` 的 `PASSWORD_GATE_ALLOWLIST = ['auth.forceChangePassword','POST /api/password/force','auth.logout','GET /api/me','auth.me']`，`verifyToken()` 之后由 `passwordGate` 中间件（REST）与 `trpc/init.ts` 的 `middleware`（tRPC）对 `aud==='pw-upgrade'` 或非 allowlist 请求返回 403 `PASSWORD_UPGRADE_REQUIRED`。upgrade token **不得**换取正常 token，只有 `forceChangePassword` 成功路径签发 `{token}` |
| ⑤⑦ 回滚面 | 两列均 `ADD COLUMN ... DEFAULT 0`，**迁移内禁止任何 `UPDATE users SET pw_policy_version`**（`preflight` 静态扫迁移文本）；**回滚禁 `DROP COLUMN`**（`deploy.yml` 无 DB 步骤，`restore-drill.mjs` 步 7 实测旧镜像读新 schema 不报错） |
| ⑥⑨ 文案与 grep 门禁 | `tools/boundaries.mjs` 断言源码/文案中 `passwordUpgradeDeadline`、`以后再说`、`稍后再改`、`下次提醒`、`宽限期`、`截止日期`、`用验证码登录`（登录引导语境）、`本期无法找回`、`请用其他手机号注册`、`旧进度无法迁移`、`联系管理员` **命中数 = 0**（两端 + App，对应 R-39 ⑥ / R-40 ⑨ / PRD §8.3-D） |
| 开关边界（防越权接线） | `passwordUpgradeEnforce` **只出现在 `auth-service.issueTokens` 的"是否发正常 token"这一个判断点**；`password-policy.ts` 的强度校验、`changePassword` 的验旧、`verifyToken` 的吊销判定、`auth-service` 激活分支的"仅 `password` 为空可写"四处**代码内不得读该 flag**（`tools/boundaries.mjs` 用 grep `passwordUpgradeEnforce` 的引用点数量 = 1 强制，PRD §6.4-5-5 边界）—— **【A-32-5 追加口径指针，本句原文一字未改】**"引用点数量 = 1"的扫描面口径**只在 §6.5-5 的追加条里定义**（只数 `packages/server/src/**` 的非注释运行时读点，豁免 `test/**` 与 `src/scripts/**`），断言实装在 `--password` 模式（不是 `--flags`），由 T-02 在批次3 出口轮 E1 落地并带疫苗；本表与 §10.2 T-07 判据④ 三处引用同一口径，不得各写一套 |
| `file://` WebView 的现实 | **不用 httpOnly Cookie**（S12）：token 载体 Web = `localStorage`、App = `AndroidBridge.saveToken/readToken` + 内存。因此吊销只能靠 **服务端 401 + 客户端"收到 401 即清凭据并跳登录"** 的组合；App 侧 `rest-fetcher.ts` 对 401 单点处理（清 Bridge + 广播登出），Web 侧 `use-auth.ts` 同。**upgrade token 同样走这两个载体，绝不落 Cookie**，且退出 App 时不落磁盘（仅内存 + Bridge 的 `saveTempToken`，见 §5.6） |
| 审计日志 | `services/account-audit.ts` → 表 `account_audit_log`；动作 `account_activated` / `password_upgraded`，字段 `user_id, phone_masked(后4位), action, result, ip, ua, created_at`；**不含明文密码或其 hash**；写失败 → 事务回滚并 5xx 之前先返回可读 4xx（避免"激活成功但查不到记录"破坏 PRD §6.4-4 判据 ①） |
| K-1 配额 | `services/auth-policy.ts` 新增两个分桶：`reg_ip_daily:<ip>:<yyyy-mm-dd>` ≤5、`activate_ip_daily:<ip>:<yyyy-mm-dd>` ≤20（现进程内 Map 保留语义，Redis 迁移属后续）；命中 → `TOO_MANY_REQUESTS` |

## 5. App React 化方案（R-17~R-21）

### 5.1 承载形态与三条硬约束

| 约束 | 落地做法 | 判据出处 |
|---|---|---|
| **Vite SPA + `base:'./'`** | `apps/app/vite.config.ts`：`base:'./'` + `build.target:['es2020','chrome84']` + `build.modulePreload:{polyfill:false}` + **`experimental.renderBuiltUrl:(filename)=>({relative:true})`**（把 chunk 引用全部改成相对路径，`file://` 下唯一可靠的写法）。**分包策略定案：入口 `index.js` 静态引入 shell + 5 个 tab；二级页（词详情/学习情况/关于/改密）用 `React.lazy` 动态 chunk**（`renderBuiltUrl` 保证动态 import 也是相对路径，真机 2 台实测通过即判据）；首屏 JS 预算 ≤ 250KB gzip，在 CDP 用例里断言 | R-17 ①⑥ |
| **`file:///android_asset/`** | ① 一切资源相对路径（含字体/图标，禁外链 CDN，离线必须可用）；② **路由用 hash 路由**（`createHashRouter`，`#/study`）—— `file://` 无 History API 语义（路径改变会破坏 `android_asset` 解析），pushState 方案直接否决；③ 无 Service Worker（审计 §4.4），离线能力全部在 `apps/app/src/data/offline-queue.ts`（内存 + `AndroidBridge`/localStorage 落盘）；④ 首帧主题与 `tokens.css` 内联进 `index.html`（§3.4） | R-17 ① |
| **WebView 目标 ES2020 / Chrome 84+** | `tsconfig.app.json`：`target:'ES2020'`、`lib:['ES2020','DOM','DOM.Iterable']`；`vite build.target:['es2020','chrome84']`；构建期校验：`tools/boundaries.mjs` 扫 `dist/**` 是否出现 `?.`/`??=` 之外的高版本语法与 `structuredClone`/`Array.prototype.at`/`Object.hasOwn`/`requestIdleCallback`（Chrome85+ 才有）等 API → 命中即构建失败；运行时兜底：`index.html` 首帧检测 `typeof window.ResizeObserver==='undefined'` → 渲染"请升级 WebView/浏览器"提示页（R-17 ⑦"不满足时给出可读提示页"） | R-17 ⑦、S19 |
| **workspace 化** | R-17 ② 要求 `mobile-memory` 纳入 workspace。做法：**React 源码放 `apps/app`（自动被 `apps/*` 纳入 workspace），`mobile-memory/` 只留原生壳与构建脚本，不入 workspace**（它的 `package.json` 是 `type:commonjs` 只为 Node 单测，加进 workspace 反而干扰 `pnpm -r build`）。`build-apk.sh` 第一步 `pnpm --filter @tm/app build`，第二步 `cp -r apps/app/dist/* mobile-memory/assets/` | R-17 ②③ |

### 5.2 数据层：走 REST，不走 tRPC

**裁决（S9）**：App 走 **REST + TanStack Query v5 自定义 fetcher**。理由：① PRD §6.2 的 9 个红线接口本来就在 REST 侧，旧 APK 也用它，复用同形状可少一份契约；② `file://` origin 下 tRPC 的 SSE `httpSubscriptionLink` 与 WS 鉴权兜底更难（R-05 ③④ 只对 Web 强制）；③ App 本期不需要流式（AI 记法用 `GET /api/tutor` 一次性返回，聊天窗明确不做）。
**代价明示**：App 侧要手写一份 REST 类型映射 —— 由 `@tm/shared/contracts` 消除（同一 zod schema 在两端 `safeParse` 响应，服务端形状漂移会在 App 测试里立刻暴露，反而比 tRPC 的类型直连更可测）。

**分层（"ui 包不发请求、数据由宿主注入"在 App 侧的落点）**

```
apps/app/src/data/           ← 唯一发请求的地方（rest-fetcher + queries/*）
   rest-fetcher.ts           BASE='https://tmword.xyz'；token 由 native/bridge.ts 提供；
                             401 CREDENTIAL_EXPIRED → 清凭据 + 广播登出；403 PASSWORD_UPGRADE_REQUIRED → 跳 #/upgrade-password
   queries/{lookup,wordbook,review,profile,checkin,analyst}.ts   QueryOptions 工厂，返回 @tm/shared 推断类型
   offline-queue.ts           R-20：收藏/删除写失败入队（localStorage + Bridge 持久化），回前台/冷启动补传
        ↓ props / hooks                        ↑ UiHost 实现
apps/app/src/screens/*       ← 只做编排（useQuery + <X /> from '@tm/ui/patterns'）
apps/app/src/host.tsx        ← 实现 UiHost {kv,speak,navigate,toast}，用 UiHostProvider 注入（§3.1）
@tm/ui/patterns/*            ← 纯展示，零请求（CI 规则 ui-no-io）
```

同一批 `@tm/ui` 组件在 Web 侧由 `apps/web/src/lib/host.tsx` 注入（`speak` 用 SpeechSynthesis、`kv` 用 localStorage、`toast` 用 sonner）→ **两端同一套视觉，只有宿主适配层不同**。

### 5.3 现有 7 页 → 新结构逐页迁移映射表

| # | 现状（`mobile-memory/assets/index.html` + `app.js` 1015 行） | 新落点 | 迁移动作 | 数据来源 | 归属任务 |
|---|---|---|---|---|---|
| 1 | `page-home`（`index.html:32`，搜索框 + 结果 + 菜单区） | `screens/LookupScreen.tsx` | `app.js` 的查词/渲染逻辑删除，改 `@tm/ui/patterns/SearchBar` + `LookupResultBar` + `RecentSearchPanel`；修"搜索框 `top:29%→0` 跳位与 130px 占位"（R-19 ④，判据见 PRD §8.3-B 搜索框项）→ 固定位置 + 结果下方淡入 | `POST /api/lookup`、`GET /api/tutor` | **T-17** |
| 2 | `page-review`（`:49`，背词 + 完成态） | `screens/StudyScreen.tsx` + `screens/CompletionScreen.tsx` | 复用 `@tm/ui/patterns/Flashcard` + `RatingBar`（四档 + 撤销），新增三模式切换（R-12）与完成页（R-13） | `GET /api/review/queue`、`POST /api/review`、`POST /api/review/undo`、`POST /api/checkin` | **T-18** |
| 3 | `page-wordbook`（`:54`，列表 + 左滑删除） | `screens/WordbookScreen.tsx` | 复用 `@tm/ui/patterns/WordbookList`（Web/App 同一列表组件），补搜索/4 排序/4 预置筛选/行内释义+喇叭/显式删除+撤销 | `GET /api/wordbook`、`POST /api/wordbook/push` | **T-18** |
| 4 | `page-me`（`:59`，统计 + 每日目标 + 设置） | `screens/MeScreen.tsx` | 复用 `@tm/ui/patterns/StatCard`；每日目标改"滑杆 + 保存按钮 + toast"（R-19 ②）；设置区（自动收藏/提醒时间/主题切换/退出） | `GET /api/profile`、`PUT /api/profile`、`POST /api/avatar`、`checkin` | **T-19** |
| 5 | `page-security`（`:64`，改密入口） | `screens/SecurityScreen.tsx` | 改密表单换 `@tm/ui/auth` 的 `ChangePasswordForm`（旧密码 + ≥8 位 + 强度条 + 错误码族） | `PUT /api/password`（带 `oldPassword`） | **T-19** |
| 6 | `page-password`（`:69`，"旧 APK 弱密码改密"页） | **🆕 `screens/UpgradePasswordScreen.tsx`**（R-40 ④ 强制改密页，不可关闭/物理返回不退出） | 新建；与 5 复用同一表单组件但**渲染在 `GateLayout` 之外**（tab 栏隐藏） | `POST /api/password/force` | **T-19** |
| 7 | `page-about`（`:74`，同步承诺 + 版本） | `screens/AboutScreen.tsx` | 保留"同账号同数据、换机不丢"承诺（PRD §8.3-B-12）+ 新增"当前登录方式：手机号 + 密码（短信验证码通道后续开通）"公告（R-01 ⑧，与 Web `/about` 同文案常量）+ "有新版本"入口（R-17 ⑨） | `GET /api/version` | **T-19** |
| — | 无（登录散落在菜单里） | 🆕 `screens/LoginScreen.tsx` | 复用 `@tm/ui/auth/AuthFormShell`（登录/注册/激活**两态一壳**，R-39 ⑨，可交互元素 ≤5） | `POST /api/login`、`POST /api/register` | **T-19** |
| — | 无（词详情不存在） | 🆕 `screens/WordDetailScreen.tsx`（R-09/R-14） | `@tm/ui/patterns/WordDetailCard`（四来源进入、按来源返回） | 同 Web | **T-17** |
| — | 无（学习情况不存在，只有热力图嵌在别处） | 🆕 `screens/ProgressScreen.tsx`（tab4） | `StatCard×3` + `GrowthLine` + `Heatmap`（三模式 + 点选信息条） | `analyst`/`GET /api/analyst`、`profile.get` | **T-18** |

> 本列与 §10.2 一致（工程壳 = T-14 交付 `router.tsx`/`shell`/`data`，页面由 T-17/T-18/T-19 三个批次4 任务并行填入）；若两处冲突以 **§10** 为准。

### 5.4 App 独有、必须保留的行为 → 落在哪个组件（PRD §8.3-B 的 6 项 App 侧专属）

| 行为（现状在手写版里可用） | 新落点 | 实现要点 / 验收 |
|---|---|---|
| ① **左滑删除词条目** | `@tm/ui/patterns/WordbookList` 的 `onSwipeDelete` prop（组件内用 pointer events 自实现，不引第三方手势库） | R-19 ③ / PRD §8.3-B-4；`apps/app/src/screens/WordbookScreen.tsx` 传入 `push({removedWords})` + 撤销 toast（5 秒窗口） |
| ② **点条目即发音的可发现性**（现为"点条目=发音"，R-09 改为"点条目=详情 + 行内喇叭"） | `WordbookList` 行内 `SpeakButton`（`host.speak`）+ 行体 `onOpenDetail`；喇叭与"详情"两个 affordance 都在首屏可见 | PRD §8.3-B-3；App 侧 `host.speak` 用 `<audio>`（`LookupResult.audio` URL）而非 `SpeechSynthesis`（WebView 无 TTS 保证） |
| ③ **底部 tab「背单词」待背数红点** | `apps/app/src/shell/TabBarShell.tsx`（App 专属，不入 ui 包：Web 是顶栏语义不同），数据来自 `review.queue` 的 `dueCount`，词本空或 0 时消失 | R-18 ① / PRD §8.3-B-5 |
| ④ **热力图三模式（每日/每周/累计）+ 点格子出信息条** | `@tm/ui/patterns/Heatmap`（从 `apps/web/src/components/charts/heatmap-chart.tsx` 抽出，改为 props 驱动） | PRD §8.3-B-9/10、R-19 ①；Web 与 App 同组件（Web 的完整四图页保留 P1 重排） |
| ⑤ **达到每日目标时询问"继续/结束"** | `@tm/ui/patterns/Flashcard` 的 `onGoalReached` 回调 + `ConfirmSheet` | PRD §8.3-B-8；判据在 `StudyScreen`（`reviewedToday >= daily_goal`） |
| ⑥ **小组件点按直达查词并聚焦弹键盘** | `apps/app/src/native/launch-focus.ts` 冷启动读 `AndroidBridge.consumeLaunchFocus()` → 导航 `#/` + `SearchBar.focus()` | R-20 ③、R-21 ⑥；`SearchBar` 暴露 `focus()`（ui 包内 `autoFocusRef`） |

### 5.5 离线与同步链（R-20）

`apps/app/src/data/startup.ts`：冷启动 / `visibilitychange` 恢复时按固定四步顺序执行，**每步 try/catch 隔离，前一步失败不阻断后续**（R-20 ④ 错误注入用例）：

```
1) flushOfflineQueue()   → POST /api/wordbook/push（失败 → 保留队列，静默重试 ≤3 次）
2) pullWordbook()        → GET /api/wordbook/pull?since=<localVersion>（409/401 各自分支，401 走清凭据）
3) refreshDueCount()     → GET /api/review/queue（红点数 + 通知 N 的本地镜像）
4) checkAppVersion()     → GET /api/version（有新版本 → 一次性提示，可关闭且 24h 内不再提示；离线不提示不阻塞）
```
UI 在 1/2 成功后显示"已同步 · HH:MM"（人话，**不出现"云端/本地"徽章**，R-19 ⑤）。

### 5.6 原生侧改动清单（`mobile-memory/`）

| 文件 | 改动 | 对应需求 |
|---|---|---|
| `src/com/tomorrow/memory/MainActivity.java` | ① `WebSettings`：`setJavaScriptEnabled(true)` 保留，`setAllowFileAccess(true)`（`file:///android_asset` 必需），`setDomStorageEnabled(true)`（**localStorage 依赖，缺了 App 直接无登录态**），`setCacheMode(LOAD_DEFAULT)`；② 新增 `onNewIntent` 处理小组件 `ACTION_LOOKUP_FOCUS` → `bridge.setLaunchFocus("lookup")`（沿用现有 `consumeLaunchFocus` 形状）；③ `onResume` 里 `webView.evaluateJavascript("__app.onForeground()")` 驱动 §5.5 第 2-4 步；④ 通知点击 `Intent` 带 `open=#/study` → 载入后 `evaluateJavascript` 导航（R-21 ④"点通知直达背词页"）；⑤ `onPageFinished` 保留，**`onBackPressed` 改为先问 JS**：`evaluateJavascript("__router.canGoBack()")` → 有历史则 `goBack()`，否则按 R-18 ④ 的规则（二级页→上一级；tab→切查词；已在查词→二次确认退出对话框，不静默杀进程） | R-17 ①、R-18 ④、R-20 ③、R-21 ④ |
| `MainActivity.Bridge`（`AndroidBridge`，内联类） | 保留 `saveToken/readToken/consumeLaunchFocus`（**旧 APK 也依赖同名字节码，签名不变**）；新增 `saveTempToken(String)`/`readTempToken()`（upgrade token，仅 `SharedPreferences` 且 `MODE_PRIVATE`，改密成功即 `clearTempToken()`）、`setLaunchFocus(String)`、`getAppVersion()`、`clearToken()`（401 单点登出用） | R-40 ④（§4.7 `file://` 行）、R-17 ⑨ |
| 🆕 `ReminderScheduler.java` + `ReminderReceiver.java` + `BootReceiver.java` | `AlarmManager.setAndAllowWhileIdle(RTC_WAKE_DAILY)`（API 26~30 用 `setInexactRepeating` + 开机重排；API 31+ 优先 `setExactAndAllowWhileIdle` 并在 `SCHEDULE_EXACT_ALARM` 未授予时退化为 inexact + 提示）；通知文案固定"今天还有 N 个词要背"，`N==0` 不发；提醒时间默认 20:30，可整体关闭（关后 24h 内不送达 = 取消 alarm 而非忽略）；进程被杀仍可送达（R-21 ⑤，小米需自启动白名单 → 「我的」页给一段人话引导 + 跳转设置页） | R-21 ①②③⑤⑦ |
| `SearchWidget.java` + `res/xml/search_widget.xml` + 布局 | 小组件从"只有搜索框"升级为 **今日待背数 + 进度条 + 查词入口**；数据在 `AppWidgetManager` 侧走 `RemoteViews.setTextViewText`，由 `WidgetUpdateWorker`（`WorkManager`？→ **不引入新依赖**，用 `AlarmReceiver` 顺带 `updateAppWidget` + 打开时拉取）刷新；未登录/无数据显示"登录后可见今日词单"；点按 `PendingIntent` = `MainActivity` + `ACTION_LOOKUP_FOCUS` | R-21 ⑥、R-20 ③ |
| `AndroidManifest.xml` | `+<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`、`+RECEIVE_BOOT_COMPLETED`、`+SCHEDULE_EXACT_ALARM`（`android:maxSdkVersion` 不设）；`+<receiver android:name=".BootReceiver">`；`versionCode 1→2`、`versionName 1.0.0→2.0.0`（与新 APK 直链版本号 = tag 一致，R-17 ⑧）；`allowBackup="true"` **本期不改**（改动属 R-33 ③ P1，改了会影响存量用户覆盖安装的数据，登记在 §9 风险） | R-21、R-17 ⑧ |
| `build-apk.sh` | ① **先 `git add -f mobile-memory/build-apk.sh mobile-memory/scripts/assemble_apk.py`**（D-01，被 gitignore 排除是本期阻断项）；② 前置 `pnpm --filter @tm/app build` + 拷贝 `dist` → `assets/`；③ `JDK/SDK/BT` 路径改 `${ANDROID_SDK_ROOT}` 等环境变量，缺失即 `exit 1` 并打印可读提示（B-08）；④ keystore 口令 `${APK_KEYSTORE_PASS}` 从 CI secret 注入，**删除脚本内明文口令字面量 与 `keytool` 自动生成兜底**（本地开发用仓库外 keystore，CI 用 secret；无 secret 即构建失败而不是悄悄自签）；⑤ 产物名 `tmword-${GIT_TAG}.apk` 并输出 sha256 供下载页 | R-17 ③④⑧、R-24 ② |
| CORS 白名单 | `packages/server/src/app.ts` 的 `cors({origin:[...]})` 由 `config.corsOrigin` 提供，生产值：`https://tmword.xyz, https://www.tmword.xyz, null`（`null` = `file://` 的 WebView origin，**必须显式列出否则 R-17 ⑤ 直接失败**；`null` 只能配 `credentials:false`，本期 token 走 Header 不带 cookie → 可接受）；`Caddyfile` 同步收紧（现 `*`，C-16） | R-17 ⑤ |
| legacy 分支 | 新建分支 **`legacy/handwritten-app`**（R-20 ⑦"分支名由架构师定"）：保存 `mobile-memory/assets/{index.html,app.js,api.js,style.css}` 现状 + `app.js:994` 的 `renderRecent()` **最小 hotfix**（清单步 1，发布窗口**之前**完成并出 hotfix APK，`versionCode 2 / versionName 1.0.1`，同一 keystore 才能覆盖安装）；main 上这四个文件删除，由构建产物取代 | R-20 ⑦、Q6、PRD §6.4-2 步 1 |

## 6. 数据与兼容性（R-24 的数据库面 · PRD §6.1/PRD §6.4 全部红线的实现点）

### 6.1 schema 变更清单（**全部只加不删；加列一律带默认值；无任何 `UPDATE` 回填**）

| # | 迁移文件 | 变更 | 服务的需求 | 旧镜像可读？ | 回滚动作 |
|---|---|---|---|---|---|
| M1 | `db/migrations/001-credentials-columns.ts` | `ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0`<br>`ALTER TABLE users ADD COLUMN pw_policy_version INTEGER NOT NULL DEFAULT 0` | R-40 ③④ | ✅ 旧镜像不 SELECT 这两列即可（`SELECT *` 也无害，`UserRow` 是多余键容忍的 interface） | **无（禁止 `DROP COLUMN`）**；`down()` 声明 `noDownReason='R-40/PRD §6.1-1 只加不删'` |
| M2 | `002-review-snapshots.ts` | `CREATE TABLE review_snapshots(id, user_id, word, prev_data TEXT, prev_due INTEGER, reps_before INTEGER, created_at INTEGER)` + `INDEX(user_id, word, created_at)` | R-11 撤销 | ✅ 新表 | `down(): DROP TABLE` 安全（无存量数据；**仅本地/预发允许，生产不回滚该表**） |
| M3 | `003-account-audit-log.ts` | `CREATE TABLE account_audit_log(id, user_id, phone_masked, action, result, ip, ua, created_at)` + `INDEX(user_id, action, created_at)` | R-39 ⑤b / R-40 ④ 审计（S17） | ✅ 新表 | `down(): DROP TABLE`（同上，生产禁执行） |
| M4 | `004-wordbook-sync-columns.ts` | `ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0`<br>`ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'` | R-03 增量协议 | ✅（`DEFAULT` 使旧行的 `sync_version=0` 天然表示"未参与增量"，service 读 0 时按全量首同步处理） | **无**；`wordbooks.data` 形状一字未动 |
| M5 | `005-feature-flags.ts` | `CREATE TABLE feature_flags(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)` + 种子 6 行（PRD §6.4-7 默认值） | R-03 ⑤、R-39 ⑩、R-40 ④、R-16、R-12、R-21 开关 | ✅ 新表 | `down(): DROP TABLE`（会失去运行时开关 → 发布窗口内禁止） |
| M6 | `006-entry-updated-at-doc.ts` | **无 DDL**：`wordbooks.data` 条目内新增可选键 `updatedAt`（PRD §6.1-3 允许的"新增可选键"）；迁移文件只做**文档 + 校验函数注册**（`scripts/migrate.ts` 里跑一次 dry-parse） | R-03 ③ | ✅ 旧客户端 `WordbookEntry` 有 `[key:string]:unknown`，未知键自动容忍 | 无 |
| **M7** | `007-assessment-cache-user-id.ts` 🆕（**P-9 新增：R-41 本期落地，见 §10.2 T-25**） | `ALTER TABLE assessment_cache ADD COLUMN user_id INTEGER DEFAULT NULL`（**两驱动同形**，`DEFAULT NULL` 带字面量 `DEFAULT` 关键字以过 `assertMigrationDiscipline` 的 `addColumnWithoutDefault` 检查）<br>**不加新唯一索引、不动既有 `UNIQUE (word, qtype)`** —— 理由见下方"M7 的键设计说明" | **R-41 全条**（②③④） | ✅ 旧镜像不读该列即可；写侧 `ON CONFLICT (word,qtype) DO UPDATE` 的冲突靶一字未动 → 旧镜像的出题/评分路径行为不变 | **无**；`down()` 声明 `noDownReason='R-41④ / PRD §6.1-1 只加不删：禁止 DROP COLUMN，回滚只回镜像'` |
| — | **本期明确不做** | 不动 `users.id/phone`（含 pg `VARCHAR(11)` vs sqlite `TEXT` 语义差）、不动 `fsrs_cards.data` 格式与 ts-fsrs 版本、不动 `profiles.avatar` 历史值（Q4）、不动 `chat_messages` 旧裸 threadId 行、~~不动 `assessment_cache`（P1 R-28）~~ **【P-9 更正：自 PRD v1.4 起 `assessment_cache` 补 `user_id` 是本期 P0 `R-41`，不再是 P1 —— 见本表 M7 行与 §10.2 T-25；此处"不做"仅保留"不删列、不改历史行、不动 `UNIQUE (word,qtype)`、不迁对象存储"**）、不加 `search_history` 表（P1 R-26）、不动 `admin` 相关表 | PRD §6.1 红线 1-9 | — | — |

**M7 的键设计说明（R-41 ②③ 在本期约束下唯一可行的形态，架构师定稿，别再各猜一遍）**：
1. **`UNIQUE (word, qtype)` 是表内约束，不是命名索引** → sqlite 侧由 `sqlite_autoindex_assessment_cache_1` 实现，**只能重建表才能去掉**，而重建 = 搬/改历史行 = 直接违反 R-41 ④ 与 §6.1"只加不删"；PG 侧 `DROP CONSTRAINT` 既不在迁移语句白名单内（`migrations/index.ts:89-94`），又会让两驱动 schema 永久分叉（`ddl-parity` A 段恒红）。**所以本期不能靠"给每个用户一行"来实现隔离**。
2. 隔离因此落在**读侧属主过滤**上：`user_id` = "该行当前由谁生成/认领"。写侧仍走既有 `ON CONFLICT (word,qtype) DO UPDATE`（今日行为，不是回填也不是清理），并写入 `user_id = <会话凭据>`；读侧 `WHERE word=? AND qtype=? AND user_id = <会话凭据>` —— **`user_id IS NULL` 与"属主不是当前用户"一律判为未命中，拒读、不猜属主**（= R-41 ③ 选的 **(b) 读路径直接跳过**；③(a) 的"公共题池"本期不采用，因为 `(a)` 要求"永不用于评分回写"却在同一行上做不到）。
3. **代价必须写明**：同一 `(word,qtype)` 上两人互挤同一行 → 缓存命中率下降（并发测评同一词时每人每次重生成一次 LLM 题），本期**不省这笔钱**（这是"不删旧行、不动索引"换来的），登记为 RK-14（§9）与 T-25 回归风险列。
4. **`generate` 未命中 → 正常出题（不报错）；`submit` 未命中（题面被他人认领过 / 无主旧行）→ 403 + `FORBIDDEN`**（PRD §5.3 与 R-41 ① 允许"403 或空结果"），与 §10.2 T-11 行"任何不确定的旧 key 一律 403 而非 500"同口径；码取 `@tm/shared` 的 `TM_ERRORS_SUPPLEMENT.FORBIDDEN`（A-28-4：不许在域内建第二份码表）。

**迁移执行框架改动**：`scripts/migrate.ts` ✏️ 增加 ① 迁移清单表 `_migrations(name, applied_at)`（新表，M0）；② **静态自检**：加载每个迁移模块，断言 `typeof down === 'function' || noDownReason 非空`，断言脚本正文不含 `DROP COLUMN|DROP TABLE users|RENAME|ALTER COLUMN|UPDATE users SET pw_policy_version`（正则命中即 exit 1）；③ 双驱动跑同一份 `shared/src/schema` 描述，缺列即报错。**这是 PRD §6.4-7 "三原则"从口号变门禁的唯一落点。**

### 6.2 sqlite ↔ pg 双驱动 parity 保障（借鉴 `mobile-agenda/tests/ddl-parity.mjs`）

`mobile-agenda/tests/ddl-parity.mjs` 的做法是"**同一份 fixtures，两侧各跑一遍，逐字段比对**"，本期原样移植并把"两侧"换成"两个驱动"：

```
tools/ddl-parity.mjs                     ← 命令：pnpm ddl-parity
 1. 读 packages/shared/src/schema/tables.ts（列名/类型/可空/默认值 的单一描述源）
 2. 建两个临时库：SQLite(内存/临时文件) + PG(读 DATABASE_URL_TEST，无则 skip 并打 CI 警告 —— 但 CI 必须起，见下)
 3. A 段：DDL 对账 —— 两库 information_schema/PRAGMA table_info 逐列比对：列集合、归一化类型（TEXT↔varchar 用映射表）、NOT NULL、默认值、索引集合；差异 > 0 → exit 1
 4. B 段：行为对账 —— 同一 fixtures（含 1 个空密码账号、1 个 pw_policy_version=0 账号、含中文与超长词、含 NULL/空串的 password）分别跑
       createUser / activateUser / changePassword / wordbooks.getData·apply(增量+整数组) / review.apply / snapshot-undo
    输出规范化 JSON（时间戳归一到固定值、id 序列归一为序号），两侧字符串级 diff
 5. C 段：长度语义对账 —— phone 11 位边界、password 72 字节边界、data 数组 20000 上限 在两库的行为一致（都接受 / 都拒绝）
```

**parity 的三个已知漂移点与处置**：

| 漂移 | 现状 | 本期处置 |
|---|---|---|
| `phone TEXT` vs `VARCHAR(11)` | sqlite 不限长、pg 截断到 11 | **不改列**（PRD §6.1-1 禁"放宽或收紧"）；改在 `db/types.ts` 层加 `assertPhone()`（`/^1[3-9]\d{9}$/`，R-39 ②），两驱动同一入口 → 溢出问题在 service 层就消失 |
| `data JSON`(sqlite) vs `JSONB`(pg) | JSONB 会重排 key、丢重复键；整数组顺序可能变 | **`GET /api/wordbook` 的数组顺序按 `addedAt` 稳定排序**（两驱动都排，消除"顺序变了"的伪 diff）；对账脚本用 PRD §8.3 的词表集合比对；`json_array_length`(sqlite) vs `jsonb_array_length`(pg) 在 `account-audit.mjs` 里分别写死（PRD §6.4-2 步 4 已要求） |
| 时间戳与自增 | sqlite `INTEGER` ms vs pg `BIGINT`；自增序列行为差异 | 统一 `now = Date.now()` 由 service 传入，**禁止两实现各用 `CURRENT_TIMESTAMP`**；对账前归一 |

**双驱动集成测试矩阵**（Vitest project：`sqlite` / `pg` 各一次，CI matrix 或两个 setup file）：

```
packages/server/test/
├── contract/legacy-apk.spec.ts        旧 APK 接口形状快照（§4.2-3）
├── contract/dto-parity.spec.ts        同 fixture 打 REST 与 tRPC → key 集合全等（R-04 ③）
├── integration/auth-register.spec.ts  R-39 ①②③④⑤⑤b⑦⑧（6 错误码 × 2 协议 = 12 例；激活 4 例；冒领 3 例；profile 插入抛错的事务故障注入 1 例）
├── integration/auth-hardening.spec.ts R-40 ①②③④⑤（含 upgrade token 只能打改密接口、上线零掉线）
├── integration/wordbook-concurrency.spec.ts R-03 ②③④⑤⑥（两 client 并发加词 → 双方都在；409 重放成功且用户无报错；开关 off 态回退旧行为）
├── integration/review-parity.spec.ts  R-02 ①②③④⑤ + R-11 撤销 + R-12 三模式不写卡
└── integration/chat-isolation.spec.ts R-05 ①②（旧裸 threadId 仍可被属主读；跨用户 403）
```
每个文件都跑两遍（sqlite / pg），**断言项包含"两侧结果 JSON 全等"**，直接支撑 §3.1 DoD ① 的"双驱动各跑一遍结果一致"。

### 6.3 SQLite `VACUUM INTO` 备份挂在发布流程的哪一步

```
services/backup.ts ✏️
  createBackup({driver, target}) 
    ├ sqlite: await db.exec(`VACUUM INTO '${safePath}'`)  // 原子一致性快照，WAL 也能拿到一致视图
    └ pg    : 子进程 pg_dump -Fc -f <path>
  校验：size>0 + sha256 写入 <path>.sha256 + 记入 backups/manifest.json（保留 10 份 / 30 天）
  ⛔ 备份路径必须来自 config.backupDir，禁止参数注入路径（现 app.ts 已强调 publicDir 与 dataDir 分离）
```

| 挂载点 | 时机 | 失败行为 |
|---|---|---|
| **`scripts/release/preflight.mjs` 步 5** | 人工执行发布前检查清单时（`pnpm release:preflight --step 5`）→ 产出 `backups/pre-release-<tag>.db(.dump)` + 校验和 | 阻断（清单步 5 判据：文件存在、size>0、校验和写入部署产物） |
| **preflight 步 6 / 6b** | `restore-drill.mjs` 把步 5 产物恢复到**临时实例**（sqlite → 临时文件；pg → 临时库），跑对账 + 四类账号登录演练 | 阻断（"备份存在 ≠ 备份可用"） |
| **`.github/workflows/deploy.yml` 的 `pre-deploy: snapshot` job** 🆕 | **在 `docker compose pull/up` 之前**，且 `run: pnpm release:snapshot`（调 `backup.ts`），产物用 actions/upload-artifact 归档 30 天；job 失败 → `needs:` 链断，deploy 不执行 | 阻断（R-24 ③"备份失败 → 发布被拒"）。这是"生产 SQLite 无备份"（D-04）的根治点 |
| 部署后 `post-deploy: verify` job 🆕 | 再打一次快照 + `reconcile.mjs`（PRD §6.4-4 五项 + N/M/K/P/Q 与每人五类计数）→ 报告归档 | 不阻断部署，但**是 PRD §6.4-6 回滚判据的触发数据源**（diff≠0 即人工回滚） |
| 日常 `backup-cron`（deploy.yml 新增 `schedule: 0 4 * * *` workflow 🆕） | 每日快照 + 保留策略 | 失败 → 通知（现有 telemetry 无告警通道 → 本期只在 CI 日志与 `backups/manifest.json` 里可见，登记为风险 RK-08） |

### 6.4 R-24「发布前检查清单」逐条在设计上的实现点（12 步 → 谁负责把它变成可执行）

| 步 | PRD 要求（摘） | 设计实现点（文件） | 归属任务 |
|---|---|---|---|
| 1 | 旧手写 APK hotfix 已发且稳定 | `legacy/handwritten-app` 分支 + `app.js:994` 的 `renderRecent()` 修复 + 同 keystore 的 `versionCode 2` hotfix APK（§5.6 末行） | **T-20** |
| 2 | CI 真实测试全绿、无 `echo "smoke placeholder"` | `.github/workflows/ci.yml` ✏️：`pnpm -r typecheck && pnpm -r lint && pnpm depcruise && pnpm ddl-parity && pnpm -r test`（起 PG service container）；`deploy.yml` `needs: ci` | **T-22**（脚本由 T-02/T-21 交付） |
| 3 | 登录/注册/激活/加固在生产镜像实测 | `scripts/release/preflight.mjs --step 3` 用一次性测试手机号打真实 HTTP（`--base-url` 指向预发）；复用 PRD §6.2 的红线接口清单与 §4.2-3 快照用例，**脚本形态 = 集成测试的 e2e 变体** | **T-21**（被测接口 = T-07） |
| 4 | 线上库账号体检 N/M/K/P/Q + 前后行数快照 | `scripts/release/account-audit.mjs`（六项 SQL 双驱动方言各一份，输出 JSON 报告 + 库名 + 执行时间；缺数字即 exit 1） | **T-21**（SQL 口径 = T-06 的 schema 源） |
| 5 | 快照 + 校验和 | `services/backup.ts` + `VACUUM INTO` / `pg_dump -Fc`（§6.3） | **T-21** |
| 6 / 6b | 恢复演练 + 对账基线 / 凭据迁移与强制改密四类账号演练 | `scripts/release/restore-drill.mjs`（临时实例）+ `reconcile.mjs`；6b 的四类账号 = 短密码 / 强密码(手工置 1) / 空密码 / 刚激活，断言 ①-⑧ 逐条 | **T-21**（6b 的被验逻辑 = T-07；列的 DDL = T-06） |
| 7 | 回滚演练真做一次 | `restore-drill.mjs --rollback`：旧镜像 tag 连新 schema 库跑冒烟，断言 R-24 ⑧ (a)(b)(c)(d) 四条 + 新列旧镜像不报错 + 无 `DROP COLUMN` | **T-21** |
| 8 | 运行时开关初值确认 | `services/feature-flags.ts` 种子 + `shared/src/constants/flags.ts` 默认值 + `tools/boundaries.mjs` 断言 `passwordUpgradeDeadline` 全文 0 命中、`passwordUpgradeEnforce` 初值 `on`；改值生效实测（`POST /api/admin/flags` 后 60 秒内读回） | **T-07**（开关与接口）/ **T-02**（grep 门禁） |
| 9 | APK 产物与分发就位 | `ci.yml` 的 `apk` job（`build-apk.sh` 参数化 + secret）+ `GET /api/version` 静态 JSON + 官网下载页；旧 APK 真机两例（PRD §8.3-D 21/22）为人工签字项 | **T-20**（产物与真机）/ **T-22**（job 与直链）/ **T-07**（`/api/version`） |
| 10 | 走查与 UAT 门禁（PRD §8.2 八项 + PRD §8.3 A/B/C/D） | Playwright：PRD §8.3-A（375px 导航）/ PRD §8.3-C（首页 DOM ≤5 断言，选择器见 §7.1）；App 走 `mobile-agenda/tests/gui-cdp.mjs` 移植的 CDP 用例（PRD §8.3-B 12 项） | **T-23**（用例固化）/ **T-24**（执行与归档） |
| 11 | 对外告知定稿（PRD §6.6-4 四条） | 文案单一源 `packages/shared/src/constants/notice.ts`（R-01 ⑧ 公告 + PRD §6.6-4 四条 + 版本记录）→ Web `/about`、App `AboutScreen`、发布说明三处 import 同一常量；`boundaries.mjs` 禁止第二份副本 | **T-03**（单一源）/ **T-16**（Web `/about`）/ **T-19**（App 关于页） |
| 12 | （PRD §6.4-2 表内第 11 步之后即 L1→L5 的顺序） | L1..L5 的独立性：后端镜像、Web 镜像、APK 直链 **三者可单独回退**（APK 只是撤直链，不动镜像）；`deploy.yml` 拆 `web` / `server` / `apk-publish` 三个 job 与三个产物 | **T-22** |

### 6.5 兼容性自检（每次 PR 的 checklist，写进 `.delivery` 的 QA 用例索引）

1. 任何新接口都**不替换**旧接口（`git diff` 里 `routes/*.ts` 的既有路径字符串不得被删除或改名 —— `boundaries.mjs` 用路由清单比对）。
2. 任何响应新增键必须**可选**，且 `legacy-apk.spec.ts` 快照只增不减。
3. 迁移 diff 里不得出现 `DROP|RENAME|ALTER COLUMN|UPDATE users SET pw_policy_version`。
4. `users.password` 的写入点只允许 3 处：`createUser`(注册新建，非空 hash)、`activateUser`（**仅** `password IS NULL OR trim(password)=''` 条件）、`changePassword`/`forceChangePassword`（必验旧）。`boundaries.mjs` 按 "SET password" 的调用点数量 = 3 强制。
5. `feature_flags` 的读取点：`passwordUpgradeEnforce` 恰好 1 处、`passwordRegister` 恰好 1 处（新建分支）、`wordbookIncremental` 恰好 2 处（apply/pull）。
   - **"恰好 1 处"的口径（A-32-5 追加登记，本条与 §10.2 T-07 判据④ 同步）**：只数 **`packages/server/src/**` 的非注释运行时读点**，豁免 `test/**` 与 `src/scripts/**`（测试夹具与"反向声明注释"不是读点）。此前文档只写"引用点=1"而未定义扫描面，导致 13 个命中里 11 个是夹具与注释 —— 属幻影门禁，实装由 **T-02** 在批次3 出口轮 E1 落地，且必须带 A-32-5 要求的"疫苗"（临时在 `src/**` 运行处加一次读 → 门禁必须红 → 删除）。**这不同于 A-27**（那是注释内容问题，本条是扫描口径问题）。

## 7. Web 前端设计（R-07~R-16、R-22、R-23）

**现状锚点**：`apps/web/src/app/(user)/page.tsx` **367 行 / 12 个 `useState` + 内联 SSE 流式**（查词、方向、历史、AI、词本判断混在一个组件里）→ 本节的首要动作是**拆**，其次才是改。
**数据流统一约定**：页面 `page.tsx` 只做"取参 + 渲染容器"；数据一律走 `apps/web/src/lib/api/*.ts`（TanStack Query + tRPC 封装），组件一律来自 `@tm/ui`；**禁止在 page 内 `fetch`**（`boundaries.mjs`）。宿主能力经 `lib/host.tsx` 注入（§5.2 对称）。

### 7.1 逐项设计

| 需求 | 组件与文件 | 状态 | 数据流 | 关键实现点（判据可测） |
|---|---|---|---|---|
| **R-07 首页收敛** | 🆕 `app/(user)/page.tsx`（目标 ≤80 行）+ 🆕 `components/home/search-section.tsx`（容器）+ `@tm/ui/patterns/SearchBar`、`LookupResultBar`、`ReviewCta`（今日 N 词胶囊）+ 🆕 `components/home/decor-layer.tsx`（渐变 + ≥20s 呼吸动效，`@media (prefers-reduced-motion)` 关闭）+ 🆕 `components/home/footer-note.tsx`（备案 + 一句话） | `word`、`direction`(仅结果条内文字切换后落 `searchParams`)、`result`（Query cache） | `dictionary.lookup`（tRPC）流式 → `useLookupStream()`；结果只渲染**精简条**，完整信息进详情页 | DOM 断言（Playwright）：`[data-testid=home-root]` 下可交互元素 ≤5 —— `SearchBar` 输入框、框内提交、`ReviewCta`、结果条喇叭、结果条"查看详情/收藏"。**"查词"按钮删除**、方向按钮 `=0`、"输入单词开始查询"灰卡 `=0`、侧栏/胶囊 `=0`、AI 卡 `=0`（= PRD §8.3-C） |
| **R-08 移动导航** | ✏️ `components/header.tsx`（现 `nav` 是 `hidden md:flex`，:61 → `<768px` 完全无导航 = A-01）+ 🆕 `components/mobile-nav.tsx`（底部 5 tab + 右上"更多"抽屉）+ ✏️ `app/(user)/layout.tsx`（同时挂载，靠 `md:hidden` / `hidden md:flex` 二选一） | 无（`usePathname` 派生 current） | 静态 `NAV_ITEMS`（🆕 `lib/nav.ts`，Web 与 App 共用同一份 href 常量） | 5 tab = 查词/背词/单词本/学习情况/我的；抽屉含 `/chat`、`/assess`、主题、退出；当前项 `aria-current="page"`；`safe-area-inset-bottom`；键盘弹出用 `100dvh` 不遮输入框；任意一级页 ≤2 跳到二级页（PRD §8.3-A） |
| **R-09 词详情页** | ✏️ `app/(user)/word/[word]/page.tsx` + `@tm/ui/patterns/WordDetailCard`（释义分组 / 例句折叠 / **中文词形变化标签**（`exchange` 映射为"过去式/比较级…"人话）/ **AI 记法区默认收起为一行** / 喇叭 / 收藏 / "立即背这个词"） | `from`（`useSearchParams().get('from')`：`home｜study｜wordbook｜chat`） | `dictionary.lookup` + `GET /api/tutor`（tRPC 同义）+ `wordbook.add/remove` | 四来源进入、**按来源返回**（返回按钮 href 由 `from` 决定）；未登录可读（R-23 ①）；AI 失败态："AI 记法暂时没生成，稍后再试"+ 重试，**不留空白卡**（R-14 ②） |
| **R-10 最近查询面板** | `@tm/ui/patterns/RecentSearchPanel` + `@tm/ui/hooks/use-recent-searches`（`kv` 注入，key `tm:recent:v1`） | `focused`（本地，不入库）；条目 ≤20、带首义、可清空（二次确认 `ConfirmSheet`） | 纯本机（R-26 云端同步为 P1） | **只在搜索框聚焦时从框下方浮出，未聚焦不占布局**（DOM 高度 0）；替换现状常驻 chips（`page.tsx:43 loadHistory` 的 localStorage 读写迁进 hook）；清空后 `kv` 立即落盘 |
| **R-11+R-12 四档评分 / 撤销 / 三模式** | ✏️ `app/(user)/study/page.tsx`（283 行 → ≤120 行）+ 🆕 `components/study/queue-switch.tsx`（三模式）+ 🆕 `components/study/session-summary.tsx`（完成页）+ `@tm/ui/patterns/Flashcard`、`RatingBar` | `mode`（`searchParams.mode=review｜new｜selfTest`，默认 review）、`queue`（Query）、`lastReview`（撤销栈，最多 1 层） | `review.queue(mode)` → `review.reviewCard` → `review.undo`（均 tRPC，**同一 service**，R-02 ①） | 四档语义与 App 完全一致（`RATING_VALUES` 与文案来自 `@tm/shared/constants`，不许本地各写一套）；撤销按钮仅在有 `lastReview` 时出现；**`new`/`selfTest` 模式不 `mutate reviewCard`**（现状"只要登录就 mutate"消除，R-02 ④）；队列为空时给"去学新词/回首页"两个出口，**不做死路** |
| **R-13 完成页 + 打卡常驻** | 🆕 `components/study/session-summary.tsx` + ✏️ `profile/page.tsx`（现 `study/page.tsx:256-278` 的"轮末才弹打卡"删除） | `session` 统计（本地累加） | `checkin.today` / `checkin.doCheckin` | "今天已打卡 · 连续 N 天"在**完成页与「我的」两处常驻可点**（非弹窗）；连续天数计算走 `@tm/shared/utils`（C-11 单一实现） |
| **R-15 词本一级页** | 🆕 `app/(user)/wordbook/page.tsx` + ✏️ `components/wordbook-sidebar.tsx`（187 行 → 只留"≥1280px 可收起外壳"，列表本体换成 `@tm/ui/patterns/WordbookList`） | `filter`/`sort`/`q`（写进 `searchParams`，可分享） | `wordbook.list`（内部经 §4.4 增量；开关 off 时自动旧语义） | **首页彻底不显示侧栏/胶囊**（§4.1-7）；行内显示首义 + 喇叭；点行进 `/word/[word]?from=wordbook`；4 排序（加入时间/复习次数/字母/待复习优先）+ 4 预置筛选（全部/今日待背/已掌握/未学）；显式删除 + 撤销 |
| **R-16 显式收藏** | ✏️ `page.tsx` 删除"查询即入库"逻辑（现状 `:100-116`、`:317-327` 查询成功后自动 `wordbook.add`）+ `LookupResultBar` 的星标 + 🆕 `components/favorite-button.tsx` | `inWordbook`（Query 派生） | `wordbook.add` / `wordbook.remove`（或 push 的 `entries/removedWords`） | 只有点星标才写库；未登录点星标 → 打开登录弹窗并**保留待收藏的词**（R-23 ①）；`explicitFavorite` 开关 off 时回到旧自动灌入（一键回退）；R-39 ⑧ 注册/激活成功即自动完成"待收藏"动作 |
| **R-23 登录墙与登录态闪烁** | ✏️ `lib/use-auth.ts`（改为 `status:'idle'｜'authed'｜'guest'` 三态 + `hydrated` 布尔）+ ✏️ `components/login-dialog.tsx`（→ 薄壳，主体 `@tm/ui/auth/AuthFormShell`）+ 🆕 `components/auth-gate.tsx`（包住 `study/assess/report/chat/wordbook` 五处） | 全局 auth context（已有 `providers.tsx`，本期只加 `status`） | `auth.me`（tRPC）+ `GET /api/me` | **登录态未确定前渲染骨架屏**，DOM 中不得出现"请先登录后…"中间态（Playwright 断言，R-23 ②）；未登录页给可读引导 + "手机号登录"主按钮 + "没有账号？注册"文字链（R-39 ⑨）；弹窗默认密码模式且默认焦点在密码框；`NO_PASSWORD_ACCOUNT` → 显示 R-01 ④ 固定文案 + 可点"设置密码激活"按钮；**"忘记密码/找回密码"两端 grep = 0**（R-23 ④）；`CREDENTIAL_EXPIRED` → 清凭据 + 跳登录 + "密码已修改，请重新登录" |
| **R-40 强制改密拦截**（Web 侧） | 🆕 `app/upgrade-password/page.tsx`（**放在 `(user)` 组外**，不受登录墙/导航影响）+ 🆕 `components/upgrade-gate.tsx`（在 `app/layout.tsx` 层包住 `(user)`，命中 `upgrade_required` 直接 `router.replace('/upgrade-password')`） | `upgradeToken`（localStorage 独立键 `tm:upgrade-token`，**不覆盖** `tm:token`） | `auth.forceChangePassword`（tRPC）/ `POST /api/password/force`（REST） | 该页**不可关闭、不可跳过、无返回出口**（拦截 `beforeunload` + 隐藏导航 + 返回键在 App 侧同样拦，Web 侧移除返回链接），只有"改密 / 退出登录"两个出口（PRD §8.3-D-15）；成功后写正常 token、清 upgradeToken、`router.back()` 回原页；失败留在该页并保留已输入手机号；**全站 0 处"以后再说"** |
| **R-22 品牌视觉** | §3.4 全部；✏️ `app/globals.css`（只保留 `@import '@tm/ui/styles/tokens.css'` + `@tailwind` + 宿主级少量覆盖）、✏️ `tailwind.config.ts`（`presets:[uiPreset]` + content 纳入 ui）、✏️ `app/layout.tsx`（首帧主题内联脚本、删 `theme-provider.tsx`） | `light｜dark｜system` | 无 | grep 无硬编码 brand 色；暗色切换不闪白（录屏 3 帧断言 + Playwright `color-scheme` 计算值） |

### 7.2 现有文件的删除 / 拆分清单

| 现有文件 | 动作 | 去向 |
|---|---|---|
| `components/ui/*`（12 个） | 🗑️ 删除（迁走后） | → `packages/ui/src/primitives/*`（T-04） |
| `components/flashcard.tsx`(130) | 🗑️ 删除（重写为 props 版） | → `packages/ui/src/patterns/Flashcard.tsx` |
| `components/charts/heatmap-chart.tsx`、`growth-line-chart.tsx` | ✂️ 拆分 | 展示层 → `@tm/ui/patterns/{Heatmap,GrowthLine}`（recharts 作为 ui 的 dependency）；`forgetting-bar-chart`/`review-line-chart` 留 Web（完整报告是 Web 专属，§4.4） |
| `components/word-lookup.tsx`(116) | 🗑️ 删除 | 拆为 `@tm/ui/patterns/SearchBar` + `LookupResultBar` + `apps/web/src/lib/api/lookup-stream.ts` |
| `components/wordbook-sidebar.tsx`(187) | ✂️ 拆分 | 列表本体 → `@tm/ui/patterns/WordbookList`；本文件瘦身为 ≥1280px 外壳（≤60 行） |
| `components/theme-provider.tsx`(40) | 🗑️ **删除** | → `app/layout.tsx` 内联脚本 + `@tm/ui/hooks/use-theme-toggle`（这是 FOUC 修复的一部分） |
| `components/login-dialog.tsx`(148) | ✏️ 变薄壳 | 表单本体 → `@tm/ui/auth/AuthFormShell`（R-39 ⑨ 三态） |
| `app/(user)/page.tsx`(367) | ✂️ 拆分（目标 ≤80 行） | → `components/home/{search-section,result-section,decor-layer,footer-note}.tsx` + `lib/api/lookup-stream.ts` + `lib/hooks/use-lookup.ts` |
| `app/(user)/study/page.tsx`(283) | ✂️ 拆分（≤120 行） | → `components/study/{queue-switch,card-view,session-summary}.tsx` + `lib/api/review.ts` |
| `app/(user)/profile/page.tsx`(313) | ✂️ 拆分 | → `components/profile/{checkin-card,stat-cards,goal-setting,avatar-setting,settings-list}.tsx`；删除"头像 URL 输入框"（§4.4，改文件选择） |
| 🆕 新建页面 | `app/(user)/wordbook/page.tsx`、`app/(user)/profile/security/page.tsx`、`app/(user)/about/page.tsx`、`app/upgrade-password/page.tsx`、`components/mobile-nav.tsx`、`components/auth-gate.tsx`、`components/upgrade-gate.tsx`、`lib/nav.ts`、`lib/host.tsx`、`lib/api/*` | — |
| ⛔ 本期不动 | `app/admin/*`、`app/(user)/chat/page.tsx` 的聊天逻辑（只加 R-05 鉴权头与 token 位置）、~~`app/(user)/assess/page.tsx`（P1 R-28）~~ **【P-9 更正：PRD v1.4 起该缺陷是 P0 `R-41`，本行"不动"不再成立 —— 本文件由 §10.2 批次4 `T-25` 有限改动：只加"submit 未命中 `FORBIDDEN` → 重新出题"这一条分支，页面结构/文案/其余 373 行不动，落点见 §6.1 M7 与本表下方说明**、`app/(user)/report/page.tsx` 的四图结构（P1 R-27 移动重排，本期只换 token） | — |

> **`/chat` 与 `/assess` 的导航归属**：两者从顶栏降级进"更多"抽屉（§4.2），**页面文件不删**；`NAV_ITEMS` 单一源避免两端各自硬编码菜单。

## 8. 关键取舍与理由

| # | 张力 | 选了什么 | 放弃了什么 / 付的代价 | 为什么值得 |
|---|---|---|---|---|
| **TR-1** | **一次性大版本上线（Q2 定案）vs 审计 §4.4/§5 明确建议的"先止血再渐进 React 化、避免一次性大爆炸"** | **接受一次性**，但把"分批降险"换成**四件替代品**：L1..L5 分层部署（同窗口内分钟级间隔）+ 运行时开关（6 个，全部 ≤60 秒生效）+ 12 步清单机器化（`preflight.mjs`）+ 回滚真演练（`restore-drill.mjs`）。**镜像层保持独立**：后端、Web、APK 三份产物可各自回退（APK 只撤直链） | 放弃了"跨批次真实观察 1-2 周"这一最便宜的风险手段。残余风险：`wordbooks` 增量与凭据门禁**同时**首次面对真实用户；L5 放量成为唯一能观察的维度 | 用户已拍板；且审计担心的"大爆炸"本质是**回退能力缺失**，而 D-04（无备份）/ D-06（回滚不动库）/ D-01（构建脚本不在库）三处缺陷使现状连"能不能回退"都不成立 —— 因此本期真正的对冲不是分批，**而是把回退能力本身建起来**（§6.3/§6.4/T-21/T-22）。分层部署给了"部分回退"，这是不分批方案下唯一可得的东西 |
| **TR-2** | **Q9' 强制改密硬门禁（不发正常 token）vs 旧 APK / 旧 Web 的可用性（PRD §6.2 回滚底线）** | **按凭据判定、不按客户端版本判定**（R-40 ⑩）：`pw_policy_version=0` 一律只发 upgrade token。为兼容买三重对冲：① `passwordUpgradeEnforce` **唯一止血阀**（off = 仍弹页但发正常 token，≤60 秒生效，**不得跨 72 小时**）；② **L1 与 L3 紧邻部署、中间不隔夜**（PRD §6.4-3 尾巴的硬约束，写进 `deploy.yml` 的 `needs` 链，不给隔夜的机会）；③ upgrade token TTL ≤30 分钟，不放大暴露面 | 放弃了"服务端按 UA/版本放行旧客户端"这条看似更平滑的路（产品已明令禁止：那等于把硬门禁改成软提示）。代价是真实存在的一段暴露窗口：`Q` 个存量账号在旧 Web/旧 APK 上会**短时进不去**，只能看到"请在网页端修改密码后重新登录" | 若按客户端版本放行，Q9 定案的"全部加固"直接落空（旧客户端成为永久弱口令通道，而旧客户端**永远无法强制升级**，因为无应用商店）。选择"按凭据判定 + 开关兜底"，把不可消除的损害压到**一个分钟级窗口 + 一次可 60 秒撤除的状态**，并强制清单步 9/11 用真机旧 APK 实测 + 公告前置 |
| **TR-3** | **token 吊销的实现强度：会话表白名单（方案 B，能立即踢掉已泄露 token）vs `password_changed_at` 比较（方案 A）** | **方案 A**（一列 + `iat` 比较 + 60 秒 Map 缓存） | 明知代价：**改密前已泄露的 token 最长 30 天内仍有效**，本期不做管理员强制踢下线（PRD 已要求"如实记录，不做粉饰"） | 方案 B 上线瞬间会让 Web 与旧 APK 在线设备同刻掉线，直接违反 PRD §6.4-6 (b)"回滚/上线不得登出在线设备"；而本期真正的攻击面（4 位弱口令）由 `min(8)` + 强制改密收敛，吊销只是补充。→ 登记 RK-06，并把 R-38（Cookie 化 + 必要时会话表）留在下一版本 |
| **TR-4** | **`db/sqlite.ts` + `db/pg.ts` 两份手写实现（573+521 行，重复且易漂移）vs 引入 ORM/查询构建器统一** | **保留两份 + 用 `shared/src/schema` 做 DDL 单一源 + `tools/ddl-parity.mjs` 做逐字段对账 + 双驱动测试矩阵** | 放弃了"根治重复代码"的整洁感；parity 脚本本身是要长期维护的资产 | 生产库真值在 SQLite（`data.db`），任何 ORM 接管两张核心表 + `fsrs_cards.data` 序列化的改写，都是"为消灭 1000 行重复代码而冒丢用户词本"的不对称赌注；而本期 DoD 恰恰要求**双驱动结果一致**，parity 脚本把这个验收变成可自动重跑的机器判据（比 ORM 更贴合需求）。ORM 化列为 P2 技术债（§11 F-3） |
| **TR-5** | **词本"增量同步"与"整数组旧 PUT"两套语义并存（Q5 定案接受这份包袱）** | **两套 API、一套落库路径**（§4.4.3：所有写最终都进 `wordbook-service.apply()` → 同一 `data` 数组 + `sync_version++`） | 放弃了"引入 `wordbook_items` 关系表"的规范化方案（那样增量才是天然语义）。代价：JSON 数组上的字段级 merge + 墓碑表，`data` 单行可能到 MB 级，读放大 | 规范化表需要"双写→回填→切读→弃旧列"四步，而 PRD §6.4-7 把本期唯一的破坏性变更名额给了 R-40（不许有第 2 处）；且 `wordbooks.data` 整数组形状本身是 PRD §6.1-3 红线。单落库路径让"开关关闭态回退"与"新旧客户端混写"都不可能出现两份真相 —— 这正是 R-03 要修的丢词根因 |
| **TR-6** | **App 复用 `packages/ui`（源码直出）vs App 独立写一套样式** | **源码直出 + `UiHost` 注入**，`packages/ui` 零请求、零宿主假设 | 代价真实：Next 要配 `transpilePackages`/`turbo.packages`；Tailwind 要在两个宿主各自把 ui 源码纳入 `content`；React 版本必须钉死。首屏体积受"打进 APK 的全部组件"影响（靠 `React.lazy` + 250KB 预算约束） | 独立一套样式 = 把 A-09"两处真相"的病复制到第三处，且 R-19 ③ 的 12 项功能一致性与 PRD §8.2-2"同账号两端并排比对"将无法用组件级复用保证；本期 26 条 P0 里 R-06/R-09/R-10/R-11/R-14/R-15/R-22 都明文要求"同一套组件" |
| **TR-7** | **App 走 REST（自己写类型映射）vs 走 tRPC（类型直连、少一层代码）** | **REST + `@tm/shared` zod 双端校验** | 多写一份 REST queries 层（约 300 行），失去 tRPC 的端到端类型推导 | `file://` 源为 `null`：CORS/凭据/SSE/WS 四类兜底都要为 tRPC 重做一遍，而旧 APK 本来就用 REST，接口不可能下线（PRD §6.2）。用 zod 在两端 `safeParse` 响应，把"类型直连"换成"运行时契约直连"，对本期的**可测性**反而更强（形状漂移在 App 测试里就红） |
| **TR-8** | **注册/激活本期不验手机号所有权（Q1 短信未接）** | 接受（R-39 ⑪ 定案），用 K-1 配额（同 IP 日注册 ≤5 / 激活 ≤20）+ `passwordRegister` 止血阀兜住 | 放弃了"注册口收紧"。真实残余风险：**任何人知道一个空密码账号的手机号即可激活并接管它**（历史只有验证码能注册，验证码从未真正送达 → 现实中这些号几乎没被使用过，PM 与用户已知情选择） | 不注册就没有新用户进门（`createUser` 现状只在验证码分支，`router.ts:345`），整期 P0 的产品价值归零。→ 登记 RK-05，并在 §11 F-1 建议短信通道到位后立刻补"注册需验证号主" |
| **TR-9** | **`packages/server` 内先抽 service，还是先拆 tRPC router** | **先拆 router（纯搬迁，零行为变更，T-08）→ 再按域抽 service 并挂到各自门面（T-07 认证、T-09 词本、T-10 复习/打卡、T-11 查词/我的/WS）** | 放弃了"一步到位"的爽快感，多一次文件搬运的 diff | 610 行 router 一次性重写 + 行为变更会同时污染所有域的回归面；分层后"搬迁 commit"与"改为 commit"可用 `git log` 与 PRD §6.4-3 的分层验证分别定位，这是分层部署能真正生效的前提 |
| **TR-10** | **保留 tRPC + REST 双门面（不"收敛成一个协议"）** | 保留双门面，靠"service 唯一 + 契约快照 + `dto-parity.spec.ts`"保证不漂移 | 放弃了架构上的洁癖（同一业务两个入口）。维护成本：每个新接口要在两处登记 | PRD §6.2 明令两个协议都是红线（`/trpc/*` 与 REST `auth/*` 都在），旧 APK 多版本共存且离线。真正的病灶不是"两个门面"，而是"两份实现"—— 后者已被消除，前者由快照测试锁住 |

## 9. 风险清单（技术风险 → 缓解 → **触发即回滚的判据**）

> "回滚动作"统一按 PRD §6.4-6 分级：**先降级开关，再回滚镜像，永不回滚数据库**。下表"即时判据"列 = 该风险被认定发生的最小可观测信号，命中即执行对应动作（无需二次评审）。

| # | 风险 | 来源 | 概率/影响 | 缓解（设计内建） | **即时判据 → 动作** |
|---|---|---|---|---|---|
| RK-01 | **词本增量 merge 出错，导致用户"词本空了"或互相覆盖** | R-03、TR-5、`data` JSON 上的字段级合并 + 墓碑 | 中 / **极高**（丢数据不可逆） | 单一落库路径（§4.4.3）；事务 + `BEGIN IMMEDIATE`/`FOR UPDATE`；409 静默重放；L5 逐档放量；`wordbookIncremental` 初值 `0%`；离线队列只增不删（本地保留直到服务端 200 确认） | 任一：①`reconcile.mjs` 五项 diff≠0；②抽样 ≥20 用户"整数组 vs 增量"diff≠0（R-03 ⑥）；③工单/日志出现"词本空了"；④`wordbook` 写失败率>2% → **立刻 `wordbookIncremental` 关回上一档（≤60s）**，L5 归零后只回滚代码不回滚库 |
| RK-02 | **强制改密门禁误伤**（`pw_policy_version=1` 或刚激活的账号被拦） | R-40 ④、§4.7 签发判定 | 中 / 高（等于把人关在门外） | 判定条件唯一且极窄（`password` 非空 **且** `pw_policy_version=0`）；激活分支强制写 `1`；清单步 6b 用**四类账号**逐一演练；`auth-hardening.spec.ts` 双驱动覆盖 | 出现"不该被拦的账号被拦进改密页"（PRD §6.4-6 已列为回滚判据） → **`passwordUpgradeEnforce=off`（第一顺位，≤60s，不回滚镜像）**，72 小时内修复回到 `on`；若 off 仍进不去 → 说明是登录主路径坏了，升级为回滚镜像 |
| RK-03 | **L1→L3 隔夜部署**，旧 Web 用户改密/登录拿到不可读错误（PRD §6.4-7 暴露面） | TR-2 | 中 / 中 | `deploy.yml` 把 `server` 与 `web` 两个 job 用 `needs` 串成不可分割序列（web 失败即自动回滚 server 的**部署顺序**不允许）；部署说明写死"分钟级间隔" | 窗口内旧 Web 出现 5xx 或 `OLD_PASSWORD_REQUIRED` 投诉 → **`passwordUpgradeEnforce=off`** + 立即补 L3；禁止用"发临时放行逻辑"解决（违反 Q9/Q9'） |
| RK-04 | **`file://` WebView 上 React 产物白屏**（chunk 绝对路径 / DOM Storage 关闭 / 老 WebView 语法） | R-17、审计 §4.4 | 中 / 高（新 App 全量不可用） | `base:'./'` + `renderBuiltUrl` 相对化；`setDomStorageEnabled(true)` 列入 §5.6 必改项；`target:['es2020','chrome84']` + `boundaries.mjs` API 扫描；首帧能力检测提示页；**legacy 手写版分支 = 唯一回退路径** | 清单步 9 的 2 台真机（原生 + 小米）任一台白屏/崩溃 → **撤 APK 直链**（不动 Web/后端镜像），走 legacy hotfix APK 兜底，修完再推 |
| RK-05 | **注册/激活口被批量灌水或冒领**（无手机号所有权验证） | TR-8、K-1 | 中 / 高（数据被他人接管） | K-1 双配额（注册 5/日、激活 20/日 per IP）；`passwordRegister` 止血阀；激活只命中 `password IS NULL OR trim=''`；冒领三例进 CI；每次激活写 `account_audit_log`（可事后按 `user_id` 检索） | ①审计日志出现单 IP 短周期大量 `account_activated`；②`users` 行数增长异常（对账脚本第 ⑥ 项）；③任一"集合缩小却无对应审计记录" → **`passwordRegister=off`**（激活分支不受关，Q8' 不破），并出公告；出现"数据丢失/冒领"实据 → 触发 PRD §6.4-6 回滚判据 |
| RK-06 | **已泄露 token 在 30 天内仍可用**（方案 A 的已知代价） | TR-3、R-40 ⑤ | 低-中 / 中 | `min(8)` + 强制改密使存量弱口令快速消失（真正的攻击面）；改密即吊销该账号旧 token；R-38 登记为下一版本专项 | 出现真实利用报告 → 临时动作：对该 `user_id` 执行改密（等效吊销）+ 个案处理；**不为个别案例引入会话表**（会破坏 RK-02 的稳定性） |
| RK-07 | **`/api/wordbook` 单行 JSON 体积增长**（墓碑 + `updatedAt` + 词数上升），`bodyLimit` 与 PG `JSONB` 写放大 | §4.5、TR-5 | 中 / 中 | 全局 `bodyLimit` 512KB + 词本路由单独 8MB；条目 `word ≤ 64` 与总量 20000 上限；`pull?since` 增量减少下行体积 | 词本读写 P95 > 1.5s 或 413 出现 → `wordbookIncremental` 关回（旧 `PUT` 语义更省字节）+ 把 `updatedAt` 改存 `wordbooks.updated_at` 侧表（下一版本预案，不临时塞进本期） |
| RK-08 | **每日备份无告警通道**（`backup-cron` 失败静默） | §6.3、D-04 | 中 / 中 | `backups/manifest.json` + CI artifact；`preflight` 每次强制读最近一次成功备份的时间并打印 | 发布前发现最近成功备份 > 24h → **阻断发布**（步 5 判据）；上线后发现 → 排 24 小时内修，期间不得再次放量 |
| RK-09 | **CI 里 PG 起不来 / 双驱动测试被跳过，DoD ① 变成纸面** | §6.2、S14 | 中 / 高（DoD 不成立） | `ci.yml` 用 `services.postgres` + `DATABASE_URL_TEST`；**"skip pg" 视为 fail**（不允许 `it.skipIf` 静默通过，`boundaries.mjs` 断言 PG 用例执行数 > 0） | PG job 红 → 阻断 deploy（R-24 ①）；禁止用"只跑 SQLite"绿了上线 |
| RK-10 | **ts-fsrs / React / Tailwind / zod 依赖漂移**（`pnpm-lock` 被动升级，`fsrs_cards.data` 语义变化） | S13、审计 §6 红线 | 低 / **极高** | 根 `pnpm.overrides` 钉 `ts-fsrs@5.0.x`、`react@19.0.0`；lockfile 提交；`boundaries.mjs` 版本断言 + `contract/legacy-apk.spec.ts` 的 `due/state` 快照 | 快照 diff 或版本命中非钉值 → **CI 红，禁止合并**；若已上线后发现调度漂移 → 立即回滚镜像（数据未变，`data` 仍为旧格式，可安全回退） |
| RK-11 | **并行开发互相踩文件**（4~6 个 dev agent 同批） | §10 的核心动机 | 高（若无约束）/ 中 | §10 的批次分层 + 文件边界不重叠 + 共享冲突点单一归属；越界即 `boundaries.mjs --check-ownership` 失败 | 出现同文件冲突 → 停该批任务、按 §10.3 归属表裁决，不允许多人改同一文件后"手工合并" |
| RK-12 | **旧 APK 在 `SMS_NOT_CONFIGURED` / `WORDBOOK_STALE` 等新码上行为异常** | R-01 ⑥、§4.6 | 低 / 中 | 新码一律"保留原响应形状 + 附加 `code` 可选键"；`legacy-apk.spec.ts` 快照；清单步 9 真机旧 APK 实测 3 个新码分支 | 旧 APK 崩溃/进入倒计时/白屏 → 服务端改为静默兼容（去掉新增键，只保留 `error` 人话），不回滚整站 |
| RK-13 | **签名 keystore 丢失或被重建 → 存量用户永远无法覆盖安装**（无应用商店，只能卸装重装 = 丢本机数据） | §5.6 `build-apk.sh`、审计 D-01、PRD §6.4-2 步 9 | 低 / **极高且不可逆** | `keystore.jks` **只存 CI secret 与仓库外双备份，严禁重建**；`build-apk.sh` 无 `${APK_KEYSTORE_PASS}`/无 keystore 即 `exit 1`，**绝不 `keytool` 自签兜底**；仓库提交**签名证书指纹基线** `mobile-memory/keystore-cert.sha256`（非机密）；T-22 的 APK job 每次构建后比对 | 产物证书指纹 ≠ 基线（`apksigner verify --print-certs` 的 SHA-256 不匹配）→ **禁止发布与挂直链**（CI 红即阻断 deploy），人工找回原 keystore 后才可继续；已在外的错签名包 → 立即撤直链 + 公告"覆盖安装会失败，请勿升级" |
| **RK-14** | **测评缓存命中率下降（R-41 的既定代价）**：`UNIQUE (word,qtype)` 不许动 → 同一词的题面行在用户之间互挤，并发测评同一词时每人每次都要重生成一次 LLM 题（§6.1 M7 键设计说明第 3 条） | R-41 ②③④、审计 C-07 | 中 / 低（只多花 LLM 调用与几秒等待，不丢数据） | ① 本期**不省这笔钱**是刻意选择：换来"不删行、不动索引、旧镜像不报错、不占第二个破坏性变更名额"；② `generate` 未命中走规则降级（不依赖 LLM 成功）；③ 按用户的 `assess-gen` 速率限制（现 10 次/分钟）不放宽，防"重生成风暴" | LLM 调用量或测评失败率异常（`assess` 事件计数环比翻倍以上、或 `submit` 的 403 占比 > 5%）→ 下一版本按 §6.1 的"新列双写 → 回填 → 切读 → 弃旧列"四步把唯一键改成 `(user_id, word, qtype)`（**本期禁止执行其中任何一步**）；本期不做任何清理或回填 |

## 10. 任务拆分与文件边界（门禁硬要求）

> **本节是下游开发 agent 的唯一排班表。** 三条铁律：
> ① **同批次任务的可写文件集合两两不相交**（交集为空才允许并行；已逐条自检，见 §10.3 归属表）；
> ② 每个"共享冲突点"**只归属唯一一个任务**，其他任务需要改动时**只能提需求给该 owner，不许直接编辑**（`tools/boundaries.mjs --check-ownership` 用 §10.3 生成的 `ownership.json` 校验 PR 触碰面）；
> ③ 跨批次依赖只能**向前**（批次 N 依赖批次 <N），禁止同批次互相 import 新建文件（除 §10.3 显式登记的"契约消费"，消费的是已冻结的接口而非实现）；**同批次不相交是硬判据，跨批次的同文件相交只允许 §10.4 逐条登记的"时序交接"**，交接的改动幅度越界即按 RK-11 处置。
> 冒烟命令均为真实可执行（Windows/Git-Bash，仓库根目录），命令所需脚本由该任务自身交付。

### 10.1 批次分层图

```
批次1 底座（5 个任务 · 全并行 · 出口=「契约冻结 + 能装能编能校验」）
  T-01 仓库与构建基线 ─┬─ T-02 架构门禁与静态断言
                       ├─ T-03 @tm/shared 运行时契约
                       ├─ T-04 @tm/ui 底座 + 设计 token + Web 样式入口
                       └─ T-06 数据库层与迁移框架（DDL 单一源 + 双驱动）
        │
        ▼   门禁：pnpm -r typecheck && pnpm ddl-parity && pnpm depcruise 全绿
批次2 结构与收敛（4 个任务 · 全并行 · 只做"搬迁/骨架"，零行为变更）
  T-05 @tm/ui patterns（展示层）      T-08 tRPC router 按域拆分（删 router.ts）
  T-13 @tm/ui/auth 表单族             T-14 apps/app Vite 工程 + 数据层 + 原生桥 + 导航壳
        │
        ▼   门禁：双端 build 通过 + legacy-apk 快照 = 拆分前后逐字相同
批次3 域功能（6 个任务 · 全并行 · 后端为 L1、App 壳为 L4 前置）
  T-07 凭据域后端(R-01/39/40+app.ts) T-09 词本域后端(R-03/15/16) T-10 复习域后端(R-02/11/12/13)
  T-11 profile/lookup/chat 后端(R-04/05/09) T-12 Web 外壳与查词(R-07/08/10/22) T-20 Android 原生壳与 APK 构建链(R-17/18④/21/20③⑦)
        │
        ▼   门禁：pnpm -r test（双驱动）+ 契约快照 + depcruise
批次4 页面与护栏（原 6 个任务 · 全并行 → 【P-9 更正：7 个任务，新增 T-25】）
  T-15 Web 学习与词本(R-09/11/12/13/15/16) T-16 Web 登录墙与凭据交互(R-23/39⑨/40④)
  T-17 App 查词+词详情(R-19/09/10)         T-18 App 背词+词本+学情(R-11/12/13/14/15/19)
  T-19 App 我的+账号+强制改密页(R-01/04/39/40) T-21 发布护栏脚本(R-24 备份/对账/演练/开关/R-41⑦ 只读计数)
  T-25 assessment_cache 补 user_id + 读路径属主过滤(R-41 全条 = §6.1 M7)【P-9 新增】
        │
        ▼
批次5 收口（3 个任务 · **串行**，其余全部完成才开始）
  T-22 CI/CD 接真实测试与 APK 产物（.github/workflows/*）
    → T-23 端到端走查用例固化（PRD §8.2/PRD §8.3 A-D）
      → T-24 预发演练：执行 PRD §6.4-2 全 12 步并归档报告（发布窗口的入场券）
```

- **必须串行的只有批次5**（T-22→T-23→T-24），其余批次内部**全部可并行**。
- **关键路径**：`T-01 → T-03 → T-06 → T-07 → T-16/T-19 → T-22 → T-24`（凭据域是本期唯一破坏性变更，且两端门禁 UI 都依赖它）。
- **【P-9 新增】T-25 不在关键路径上，但有两条硬时序**：① 必须**晚于** T-06 的 `db/**` 微轮（A-32-1(b)/A-32-6）交回，否则与 T-06 同时声明 `db/**` 写权；② 必须**早于** T-21 的判据⑧ 与 T-24 的步 6b/步 7（二者要读 `user_id` 列）。它与同批次任务的"允许新建/修改"集合两两不相交，自检结论见 §10.3 末尾。
- **R-20⑦ 旧 APK hotfix 与 T-20 的 `legacy/handwritten-app` 分支属于发布窗口之前**，不占批次号（写在 T-20 里，可在批次1 期间并行开工）。

### 10.2 任务清单

#### 批次 1

| ID | 标题 | 覆盖 R | 允许新建/修改（精确） | **不得触碰** | 前置 | 冒烟验证命令 | 完成判据 | 回归风险 |
|---|---|---|---|---|---|---|---|---|
| **T-01** | 仓库与构建基线：workspace、tsconfig、lint/format、新包脚手架 | R-06, R-17②, R-24① | 🆕`packages/ui/package.json`、🆕`packages/ui/tsconfig.json`、🆕`apps/app/package.json`、🆕`apps/app/tsconfig.json`、🆕`vitest.workspace.ts`、🆕`.npmrc`、✏️`package.json`(根)、✏️`pnpm-workspace.yaml`、✏️`tsconfig.base.json`、✏️`eslint.config.js`、✏️`.gitignore`（**把被忽略的原生构建脚本重新纳入版本控制：`build-apk.sh` 与 `scripts/` 两个 mobile-memory 内条目**，D-01） | `packages/*/src/**`、`apps/*/src/**`、`.github/**` | — | `pnpm install && pnpm -r typecheck && pnpm -w exec eslint . --max-warnings=0` | ① `pnpm -r typecheck` 绿；② `pnpm -r build` 在只有空 `src/index.ts` 时也绿；③ `pnpm ls -r --depth -1` 显示 `@tm/{shared,ui,server,agent}` + `@tm/{web,app}` 6 包；④ `git ls-files mobile-memory/build-apk.sh` 非空；⑤ 根 `package.json` 有 `test/ddl-parity/depcruise/release:preflight` 四个脚本位（指向尚不存在的脚本是允许的，T-02/21 补实现） | 低：只动配置。风险在 lockfile 变动 → **必须与 `pnpm-lock.yaml` 一起提交**，且 `react/ts-fsrs/zod` 版本用 `pnpm.overrides` 钉死（RK-10） |
| **T-02** | 架构门禁与静态断言脚本（depcruise + boundaries + parity 骨架） | R-02①, R-06②, R-22③, R-24①, R-39⑥, R-40⑨ | 🆕`.dependency-cruiser.cjs`、🆕`tools/boundaries.mjs`、🆕`tools/ddl-parity.mjs`、🆕`tools/fixtures/schema-fixtures.json`、🆕`tools/ownership.json`（§10.3 归属表落地件） | `packages/**`、`apps/**`（**只读校验，不改任何被测代码**） | T-01 | `pnpm depcruise && node tools/boundaries.mjs --self-test && node tools/ddl-parity.mjs --help` | ① §3.5 的**全部** depcruise 规则（本表定稿时 7 条）各有 1 个"故意违规 fixture 被红"的用例；② `boundaries.mjs` 覆盖：旧口径文案 0 命中、`passwordUpgradeDeadline` 0 命中、`passwordUpgradeEnforce` 引用点=1、`SET password` 写入点=3、迁移禁词（DROP/RENAME/ALTER COLUMN/回填 UPDATE）；③ `ddl-parity.mjs` 在 `--help` 下能列出 A/B/C 三段并声明"待 T-06 提供 schema 源"；④ 两脚本退出码非 0 时能阻断（用 fixture 证明）；⑤ **【批次3 出口轮 E1 追加，A-24-1 / A-30-4 / A-32-5 —— 本行的既有判据一字不改】** 把三条"文档指了不存在的门禁"补成真实入口，且必须是**同一套检查的入口，不许另写更松的一套**：(a) `--dist`（A-24-1：T-14/T-17/T-18 的官方冒烟命令一直指着它）；(b) `--web`（A-30-4：扫 `apps/web/src/app/(user)/page.tsx` + `components/home/**` + `lib/api/**` 的传输面 `fetch(` / `XMLHttpRequest` / `localStorage` 越界）；(c) `enforce-flag-single-read` 的扫描口径改为"只数 `packages/server/src/**` 非注释运行读点，豁免 `test/**` 与 `src/scripts/**`"，并**带疫苗**（临时在 `src/**` 运行处加一次 `flags.isOn('passwordUpgradeEnforce')` → 断言该门禁必红 → 删除；无疫苗即视为未修）。三条各自在 `--self-test` 里有 fixture 用例；同时按 A-28-2 拆掉"`--self-test` 依赖仓库里某个缺陷还留着"的两条探针 | 低：脚本自身缺陷只会误报。规则过严会卡住批次2 → 提供 `// depcruise-disable-next-line` 白名单文件（`tools/exceptions.json`）而不是放宽规则 |
| **T-03** | `@tm/shared` 运行时契约与常量（四 schema + 错误码 + 文案单一源） | R-06②, R-02③, R-04③, R-39②③, R-40①, R-01⑤⑥⑧ | 🆕`packages/shared/src/contracts/{wordbook,lookup,rating,profile,auth,review-queue}.ts`、🆕`packages/shared/src/constants/{errors,rating,flags,notice,limits}.ts`、✏️`packages/shared/src/index.ts`、✏️`packages/shared/src/types.ts`（改为 `z.infer` 派生，**不删不改名任何已导出类型**）、✏️`packages/shared/src/utils.ts`（连胜计算 C-11 单一实现）、🆕`packages/shared/test/contracts.spec.ts` | `packages/shared/src/schema/**`（T-06）、其他包 | T-01 | `pnpm --filter @tm/shared test && pnpm --filter @tm/shared typecheck` | ① §3.3.1 四契约齐备 + `auth`/`review-queue` 两份；② `errors.ts` 覆盖 §4.6 全 16 个码且**每条有中文文案**；③ `notice.ts` 含 PRD §6.6-4 四条 + R-01⑧ 公告 + R-39⑥ 固定句式，且**只有这一份**；④ 快照测试锁定四个 schema 的 key 集合；⑤ `RATING_VALUES=[1,2,3,4]`、`PASSWORD_MIN=8`、`AVATAR_MAX_BYTES=300*1024`、`WORDBOOK_MAX_ENTRIES=20000`、`RECENT_MAX=20` 全部在 `limits.ts` | 中：`types.ts` 是 server/web 的既有依赖 → **只允许"新增导出"**。若某 interface 形状被改，`apps/web` 与 `@tm/server` 会立刻 typecheck 红（这是好事，说明消费方被发现） |
| **T-04** | `@tm/ui` 底座：设计 token / Tailwind preset / primitives / UiHost / 不 FOUC | R-06, R-22, R-07（视觉基线） | 🆕`packages/ui/src/styles/tokens.css`、🆕`packages/ui/src/tailwind-preset.ts`、🆕`packages/ui/src/primitives/{button,card,input,label,badge,separator,skeleton,progress,dialog,avatar,tabs,switch,scroll-area}.tsx`、🆕`packages/ui/src/host.tsx`、🆕`packages/ui/src/hooks/{use-theme-toggle,use-speak,use-recent-searches}.ts`、🆕`packages/ui/src/index.ts`、🆕`packages/ui/test/ui.spec.tsx`、✏️`apps/web/src/app/globals.css`、✏️`apps/web/tailwind.config.ts`、✏️`apps/web/src/app/layout.tsx`（首帧主题内联脚本）、✏️`apps/web/next.config.ts`（`transpilePackages:['@tm/ui']`）、🆕`apps/web/src/lib/host.tsx` | 🗑️`apps/web/src/components/ui/*`（**本任务内删除并把 12 个原件迁入 primitives**）、🗑️`apps/web/src/components/theme-provider.tsx`（删除；**所有 import 点在 T-12/T-15/T-16 里改，本任务只保留一处最小改引：globals 与 layout**）、`apps/web/src/app/(user)/**`（**唯一例外：§10.4 第 1 行登记的 6 个现有页面的 `import` 行，本任务只允许改 import 行**）、`packages/shared/**` | T-01, T-03 | `pnpm --filter @tm/ui typecheck && pnpm --filter @tm/web build && node tools/boundaries.mjs --tokens` | ① `globals.css` 内不含任何十六进制品牌色（grep 0 命中）；② `--tokens` 检查：`tokens.css` 是 `--brand/--surface/--ink/--hair` 唯一定义处；③ Web `build` 绿且 `components/ui/*` 已删；④ 暗色不闪白：Playwright 单测 `expect(html).toHaveClass('dark')` 在 **首次导航**即成立（`page.addInitScript` 不得介入） | **中高**：删 `components/ui/*` + `theme-provider.tsx` 会让 `apps/web` 现有 6 个页面的 import 断链 → **本任务必须同时把这 6 个文件的 import 路径改为 `@tm/ui`**（只改 import 行，不改逻辑），否则 `pnpm --filter @tm/web build` 不可能绿 |
| **T-06** | 数据库层与迁移框架：DDL 单一源 + M1-M6 + 双驱动新读写 | R-40③④, R-03, R-39⑤b⑦, R-11, R-24④ | 🆕`packages/shared/src/schema/tables.ts`、🆕`packages/server/src/db/migrations/{000-migrations-table,001-credentials-columns,002-review-snapshots,003-account-audit-log,004-wordbook-sync-columns,005-feature-flags,006-entry-updated-at-doc}.ts`（M6 无 DDL，只做条目可选键的文档与 dry-parse 校验，§6.1）、✏️`packages/server/src/db/{types,index,sqlite,pg}.ts`、✏️`packages/server/src/scripts/migrate.ts`、🆕`packages/server/test/db/migrations.spec.ts` | `packages/server/src/{routes,trpc,services,middleware}/**`、`tools/**`、`packages/shared/src/{contracts,constants}/**` | T-01, T-02 | `pnpm --filter @tm/server migrate && pnpm ddl-parity && pnpm --filter @tm/server test -- db` | ① `ddl-parity` A 段差异=0（列集合/归一类型/NOT NULL/默认值/索引）；② M1/M4 只有 `ADD COLUMN ... DEFAULT`，**`grep -c "UPDATE users SET pw_policy_version" = 0`**；③ 每个迁移有 `down()` 或 `noDownReason`（脚本断言）；④ 新 DB 方法齐：`users.findByPhone/setPassword/activateIfEmpty(条件写)/touchPasswordChanged`、`wordbooks.getData/applyEntries/getSyncState/applySync`、`snapshots.{save,take,remove}`、`audit.append/listByUser`、`flags.{get,set,list}`；⑤ 在**已存在的 `data.db` 副本**上跑一次迁移，断言存量 `password` hash 逐行全等（PRD §6.4-2 步 6b①） | **高**：动的是生产数据落点。红线：不得改既有列类型/名、不得动 `fsrs_cards.data`、不得在迁移里读写业务数据。风险缓解 = 全部改动是"加表/加列/加方法"，且 `sqlite.ts`/`pg.ts` 的**既有方法体一字不改**（新逻辑只加新私有 helper），diff 可审 |

#### 批次 2

| ID | 标题 | 覆盖 R | 允许新建/修改（精确） | **不得触碰** | 前置 | 冒烟命令 | 完成判据 | 回归风险 |
|---|---|---|---|---|---|---|---|---|
| **T-05** | `@tm/ui` patterns：查词/结果/详情/最近查询/卡/四档评分/词本列表/图表 | R-06②, R-09, R-10, R-11, R-14, R-15, R-19①, R-22 | 🆕`packages/ui/src/patterns/{SearchBar,LookupResultBar,ReviewCta,RecentSearchPanel,WordDetailCard,Flashcard,RatingBar,WordbookList,StatCard,GrowthLine,Heatmap,EmptyState,ConfirmSheet,SkeletonBlock}.tsx`、🆕`packages/ui/src/patterns/README.md`（props 契约，给 T-12/15/17/18 的接口文件）、🆕`packages/ui/test/patterns.spec.tsx` | `packages/ui/src/{primitives,styles,host.tsx,index.ts}`（**只追加 export 行到 index 需 T-04 owner 同意 → 改为：本任务自行在 `packages/ui/src/patterns/index.ts` 建二级出口，T-04 的 index 已预留 `export * from './patterns/index.js'`**）、`apps/**` | T-04 | `pnpm --filter @tm/ui test && pnpm --filter @tm/ui typecheck && pnpm depcruise` | ① 14 个组件全部 props 驱动，`depcruise` 的 `ui-no-io` 绿；② `RatingBar` 四档 + 撤销位 + `RATING_VALUES` 来自 `@tm/shared`（无本地字面量）；③ `WordbookList` 含左滑删除（pointer events 自实现，零新依赖）+ 行内喇叭 + 显式删除回调；④ `Heatmap` 三模式 + 点选信息条（PRD §8.3-B-9/10）；⑤ `SearchBar` 暴露 `focus()`（R-20③/R-21⑥）；⑥ 375×667 与 412×915 两档无横向滚动（vitest+jsdom 快照 + 一条 Playwright 尺寸用例） | 中：组件 props 定稿后 T-12/15/17/18 全依赖它 → **`README.md` 即接口契约，批次2 出口后不得再改签名**（改需回本文档登记） |
| **T-08** | tRPC `router.ts` 按域拆分（纯搬迁，零行为变更） | R-02①（结构前提）, R-24 | 🆕`packages/server/src/trpc/routers/{index,dictionary,wordbook,review,checkin,profile,agent,assessment,chat,analyst}.ts`、🗑️`packages/server/src/trpc/router.ts`、🆕`packages/server/test/trpc-shape.spec.ts` | `packages/server/src/{routes,services,middleware,db}/**`、`trpc/init.ts`（T-07 owner）、`app.ts`（T-07 owner） | T-01, T-03 | `pnpm --filter @tm/server typecheck && pnpm --filter @tm/server test -- trpc-shape && pnpm depcruise` | ① 拆分**前后** `appRouter.createCallerFactory` 输出的 `router.unstable_getProcedureList()` 完全一致（path 列表 + input/output 形状快照），证明零签名漂移；② 每个域文件 ≤120 行；③ `trpc/router.ts` 已删除且 `app.ts` 的 import 改指 `./trpc/routers/index.js`（**这一行改动由 T-07 在批次3 执行？否 → 例外登记：本任务允许且仅允许修改 `app.ts` 中 `import { appRouter }` 的那 1 行**）；④ `depcruise` 的 `review-no-agent` 在 `trpc/routers/review.ts` 上**必须为绿**：批次1 若因现状即红而经 `tools/exceptions.json` 放行，**本任务合入时同 commit 删除该例外条目**（例外须带 `expires_after: T-08`，T-02 的脚本断言"过期例外仍存在即红"）；现状即红的成因记入 §11 F-4 | 中：搬迁中手滑会改变行为 → 用 ① 的过程清单快照做强门禁；旧 `router.ts` 必须**同 commit 删除**，避免双份 `appRouter` |
| **T-13** | `@tm/ui/auth` 表单族：登录/注册/激活两态一壳 + 强制改密 + 强度条 | R-01⑤, R-39⑨, R-40①④, R-23④⑤ | 🆕`packages/ui/src/auth/{AuthFormShell,PasswordStrength,AgreementCheckbox,ForcePasswordUpgradeForm,ChangePasswordForm,SmsCodeEntry,NoticeBar}.tsx`、🆕`packages/ui/test/auth.spec.tsx`、🆕`packages/ui/src/auth/index.ts` | `packages/ui/src/{primitives,patterns,styles}/**`（只消费）、`apps/**` | T-04, T-05(README), T-03 | `pnpm --filter @tm/ui test -- auth && pnpm --filter @tm/ui typecheck` | ① `AuthFormShell` 两态（登录/注册含激活副标题），**注册态可交互元素 = 5**（手机号/密码/确认/协议/主按钮）+ 底部小字 1 处（R-39⑨、PRD §8.3-D-8）；② 主按钮唯一；切换态保留手机号与勾选、**清空两个密码框**；③ 验证码入口是 12px 文字非按钮，旁附"短信通道暂未开通，验证码可能收不到"；④ 错误文案全部 `import` 自 `@tm/shared/constants/errors`；⑤ `ForcePasswordUpgradeForm` **无关闭按钮、无"以后再说"**；⑥ 强度校验复用 `PASSWORD_MIN/PASSWORD_MAX` 常量 | 中：批次4 的 T-16/T-19 直接嵌它；文案改动必须走 `notice.ts`/`errors.ts`（T-03），不许在组件里写字面量 |
| **T-14** | `apps/app` Vite 工程 + REST 数据层 + 原生桥 + 导航壳（无业务页） | R-17①⑥⑦, R-18①③④, R-20①②④⑤, R-33(WebView 目标) | 🆕`apps/app/{vite.config.ts,index.html,postcss.config.js,tailwind.config.ts}`、🆕`apps/app/src/{main.tsx,router.tsx,host.tsx}`、🆕`apps/app/src/data/{rest-fetcher.ts,offline-queue.ts,startup.ts,queries/{lookup,wordbook,review,profile,checkin,analyst}.ts}`、🆕`apps/app/src/native/{bridge.ts,speak.ts,launch-focus.ts}`、🆕`apps/app/src/shell/{TabBarShell.tsx,GateLayout.tsx,BackKeyBridge.tsx}`、🆕`apps/app/src/styles/app.css`、🆕`apps/app/test/{rest-fetcher,offline-queue}.spec.ts` | `mobile-memory/**`（T-20）、`apps/web/**`、`packages/**`（只 import） | T-01, T-03, T-05 | `pnpm --filter @tm/app build && pnpm --filter @tm/app test && node tools/boundaries.mjs --dist apps/app/dist` | ① `dist/index.html` 内**不含任何以 `/` 开头的资源路径**（脚本扫描，`file://` 前提）；② `--dist` 检查产物不含 Chrome84 之后的 API 调用（`structuredClone`/`Object.hasOwn`/`Array.prototype.at`/`requestIdleCallback`）—— **A-24-1 更正**：`--dist` 模式**从未被实现过**（`--list` 里没有它），出口轮由 **T-02** 补成"对同一套检查的调用入口"（不许另写更松的一套，见本表 T-02 判据⑤）；T-14 当期用构建期 `tm-app:dist-guard` 插件 + 独立 grep 做的等效证明**已追认成立**，批次4 的 T-17/T-18 照抄本命令前须确认 T-02 已落地，否则沿用等效证据并在报告里写明（A-24-1 补充登记：本单元原先在此处误插了一个裸竖线字符 U+007C，会提前关闭表格单元；已就地更正为分号，原文"…照抄本命令前须确认 T-02 已落地，否则沿用等效证据并在报告里写明"一字未删）；③ hash 路由 5 tab 可达，`window.__router.canGoBack()` 与 `window.__app.onForeground()` 两个 JS 入口存在（T-20 的 Java 依赖）；④ `rest-fetcher` 对 401`CREDENTIAL_EXPIRED`/403`PASSWORD_UPGRADE_REQUIRED` 的单点处理有测试；⑤ 离线队列写失败入队、恢复后按序补传（模拟 3 次重试）；⑥ `GET /api/version` 提示可关闭且 24h 不再提示（R-17⑨） | 中：`file://` 问题只在真机暴露 → 真机冒烟在 T-20；本任务出口只保证"产物形态正确 + 逻辑有测试" |

#### 批次 3

| ID | 标题 | 覆盖 R | 允许新建/修改（精确） | **不得触碰** | 前置 | 冒烟命令 | 完成判据 | 回归风险 |
|---|---|---|---|---|---|---|---|---|
| **T-07** | 凭据域后端：登录/注册/激活/改密/强制改密门禁/开关/**全局装配** | R-01①③④⑤⑥⑦⑧⑨⑩, R-39 全条, R-40 全条 | 🆕`packages/server/src/services/{auth-service,password-policy,feature-flags,account-audit}.ts`、🆕`packages/server/src/middleware/password-gate.ts`、✏️`packages/server/src/middleware/auth.ts`、✏️`packages/server/src/trpc/init.ts`、✏️`packages/server/src/trpc/routers/auth.ts`、✏️`packages/server/src/routes/auth.ts`、✏️`packages/server/src/services/auth-policy.ts`、🆕`packages/server/src/routes/version.ts`、🆕`packages/server/src/routes/admin-flags.ts`、✏️`packages/server/src/{app.ts,config.ts}`、✏️`packages/server/src/routes/admin.ts`、🆕`packages/server/test/integration/{auth-register,auth-hardening}.spec.ts`、🆕`packages/server/test/contract/legacy-apk.spec.ts` | `db/**`（T-06）、`packages/shared/**`（T-03/T-06）、`routes/{wordbook,review,profile,chat}.ts`、`trpc/routers/{wordbook,review,profile,chat}.ts`、`packages/agent/**` | T-06, T-08, T-03 | `pnpm --filter @tm/server test -- auth-register auth-hardening legacy-apk && pnpm depcruise && node tools/boundaries.mjs ~~--flags~~ **`--flags --password`**（A-32-5 更正：`enforce-flag-single-read` 挂在 `--password` 下，`--flags` 只有 `flag-defaults-match-prd`，原命令指不到它） | ① `auth-register`/`auth-hardening` 两文件在 **sqlite 与 pg 各跑一遍全绿**，覆盖 PRD §8.3-D 的 1-17 项中后端侧全部；② `registerOrActivate()` 三出口唯一（`PHONE_ALREADY_REGISTERED` 时**三表逐字段快照不变**）；③ 激活：单条 `UPDATE`、三表行数相等、`activated:true` + 正常 token、**不落强制改密页**、`account_audit_log` +1；④ `pw_policy_version=0` 登录 → 响应无正常 token、upgrade token 打业务接口 403；`passwordUpgradeEnforce=off` → 发正常 token 且 ①-⑤ 强度/验旧/吊销**不变**（~~`--flags` 断言引用点=1~~ → **A-32-5 更正后的口径**：由 `node tools/boundaries.mjs --password` 的 `enforce-flag-single-read` 断言，口径 = **只数 `packages/server/src/**` 的非注释运行时读点**，豁免 `test/**` 与 `src/scripts/**`；扫描面口径的实装与疫苗归 T-02 出口轮 E1，见本表 T-02 判据⑤ 与 §6.5-5）；⑤ 上线零掉线：`password_changed_at=0` 的旧 token 仍可用（用例 14）；⑥ `legacy-apk.spec.ts` 覆盖 9 个红线接口 + `SMS_NOT_CONFIGURED`/`OLD_PASSWORD_REQUIRED` 响应形状；⑦ `app.ts` 装配后 ~~`pnpm --filter @tm/server dev`~~ **`pnpm db:migrate && pnpm --filter @tm/server dev`**（**A-32-1(a) 更正**：未迁移库上 `/api/login`、`/api/register` 整片 500 是本期唯一破坏性变更的落地路径，起服命令必须自带迁移前置；代码侧的 fail-fast 自检归 T-06，见 A-32-1(b) 与 §10.4 第 9 行）+ `curl localhost:PORT/api/version` 200，**并另附一条 `curl -X POST /api/login` 与 `/api/register` 在"未迁移新库"上不再 500 的取证** | **高（本期唯一破坏性变更的实施者）**：误发正常 token / 误写 `password` / 误伤已设密码账号 = 直接触发 PRD §6.4-6 回滚判据。风险对冲：判定条件写死为极窄两处 + 双驱动用例 + 步 6b 四类账号演练（T-21/T-24 复跑） |
| **T-09** | 词本域后端：增量协议 + 字段级 merge + 409 重放 + 开关双模 + 显式收藏 | R-03 全条, R-15 后端面, R-16 后端面, R-24⑦ | 🆕`packages/server/src/services/wordbook-service.ts`、🆕`packages/server/src/services/wordbook-merge.ts`（纯函数，merge/墓碑单测靶子）、✏️`packages/server/src/routes/wordbook.ts`、✏️`packages/server/src/trpc/routers/wordbook.ts`、🆕`packages/server/test/integration/wordbook-concurrency.spec.ts`、🆕`packages/server/test/unit/wordbook-merge.spec.ts` | `packages/server/src/app.ts`、`middleware/**`、`db/**`、`services/{auth-service,review-service}.ts` | T-06, T-07（`feature-flags`）, T-08 | `pnpm --filter @tm/server test -- wordbook && pnpm depcruise` | ① R-03② 并发用例（两 client 各加不同词 → 双方都在）；② R-03③ 同词并发后 `reviewCount=max`、`lastReview` 取晚、`addedAt` 取早；③ 409 `WORDBOOK_STALE` 携带服务端最新 `version`+全量，客户端重放路径有测试且**幂等**（重放后 `version` 不变）；④ 开关 off 态：同一用户全部读写回到整数组语义、不报错、不丢词（PRD §6.4-5-3）；⑤ 开关 on/off 切换 ≤60 秒生效（用 `flags.set` + 手动快进 TTL 的测试钩子）；⑥ `PUT /api/wordbook` 响应仍 `{ok:true}`（`legacy-apk` 快照不改）；⑦ `explicitFavorite` off 时保留旧的自动灌入路径；⑧ **抽样比对脚本可用**：`node scripts/release/reconcile.mjs --mode diff-sample --n 20`（供 L5 每档 R-03⑥ 判定） | **高**：丢用户词 = 不可逆。红线：`wordbooks.data` 形状一字不动；`GET /api/wordbook` 顺序按 `addedAt` 稳定排序（§6.2 漂移表）；所有写走事务；`wordbookIncremental` 默认 `0%` |
| **T-10** | 复习域后端：评分唯一实现 + 三模式队列 + 撤销快照 + 打卡 | R-02 全条, R-11, R-12, R-13 后端面 | 🆕`packages/server/src/services/{review-service,queue-service,checkin-service}.ts`、✏️`packages/server/src/routes/{review,checkin}.ts`、✏️`packages/server/src/trpc/routers/{review,checkin}.ts`、🆕`packages/server/test/integration/review-parity.spec.ts`、🆕`packages/server/test/review-no-llm.spec.ts`、🆕`packages/server/src/services/fsrs.ts`（ts-fsrs 唯一入口，`import from 'ts-fsrs'` 只允许出现在此文件） | `packages/agent/**`（**本任务的评审点：不得 import**）、`app.ts`、`db/**`、`services/{auth-service,wordbook-service}.ts` | T-06, T-08, T-03 | `pnpm --filter @tm/server test -- review-parity review-no-llm && pnpm depcruise` | ① `depcruise review-no-agent` 绿且 fixture 违规能红（R-02①）；② `review-no-llm.spec.ts` 把 LLM/fetch 替换为 throw 后四档评分仍 200（运行时兜底）；③ R-02② 双端同 `(user,word,rating)` 的 `due/state/reps` 逐字段相等（同一 fixture 打 REST 与 tRPC）**+ 双门面错误码等值（A-33-6 N-2 的缺口，本轮由 `review-parity.spec.ts:569-680` 承担）**：~~同一非法 rating / 同一张重复撤销的卡，经 REST 与经 tRPC 拿到的 `code` 与 `httpStatus` 必须逐字相同~~ **【fix2 · A-35-9 就地补限定：本条"码逐字相同"只适用于「**两侧真到达同一 service 出口**」的码。`rating` 越界不属于此类 —— tRPC 侧门禁是 `RatingLiteralSchema`（`trpc/routers/review.ts:20`，定义 `packages/shared/src/contracts/rating.ts:15-20`），越界值在 zod 层就被拦、到不了 service ⇒ tRPC 侧只能是协议码 `BAD_REQUEST`；换成 preprocess 版 `RatingSchema` 会改 input shape，同撞 A-28-1"只增不改"与 A-28-5"入参域不对称保留现状"，故不换。该支按 T-10r3 的替代取证即为正解：**断 `httpStatus` 等值（400↔400）+ 钉住两侧各自的码 + 两侧零写入**，用例注释写明"载体不对称是显式契约"（实证 `review-parity.spec.ts:280-309`）。承担"码逐字相同"的是另外三支真到同一 service 的码：`NOTHING_TO_UNDO`+409（`:570`）、非法词形 `INVALID_WORD`+400（`:605`）等；完整口径见 §4.6 末段】**；④ rating 越界 → 400 `INVALID_RATING`（非截断）；⑤ `mode=new/selfTest` **不写 FSRS 卡**（断言 `fsrs_cards` 行数不变）；⑥ `review.undo` 一次后 `data`/`due`/`reps` 回到快照值，**`fsrs_cards.data` 序列化格式与 ts-fsrs 版本未变**；⑦ P95<300ms（本机 sqlite，100 次采样，进程内断言）；⑧ `POST /api/review`、`GET /api/review/today` 响应形状不变 | **中高**：FSRS 语义错 = 排期被写坏且会长期传染。缓解 = `services/fsrs.ts` 单点 + 版本钉 + `review_snapshots` 只加表不改 `data` |
| **T-11** | profile / 头像 / 查词 / 会话鉴权后端 | R-04 全条, R-05 全条, R-09 数据面, R-10 数据面(P1 预留) | 🆕`packages/server/src/services/{profile-service,avatar-service,search-history-service}.ts`、🆕`packages/server/src/routes/avatar.ts`、✏️`packages/server/src/routes/{profile,lookup,tutor}.ts`、✏️`packages/server/src/trpc/routers/{dictionary,profile}.ts`、✏️`packages/server/src/services/{lookup,tutor}.ts`、✏️`packages/server/src/routes/{chat}.ts`、✏️`packages/agent/src/threaded.ts`、🆕`packages/server/test/integration/{chat-isolation,profile-dto}.spec.ts` | `app.ts`（T-07）、`middleware/**`（T-07）、`db/**`、`services/{auth,wordbook,review}-service.ts`、`packages/agent/src/{nodes,tools}/**`（只 `threaded.ts` 可改） | T-06, T-07（`password-gate` 与 `verifyToken`）, T-08 | `pnpm --filter @tm/server test -- chat-isolation profile-dto && pnpm --filter @tm/agent typecheck` | ① `profile.get`(tRPC) 与 `GET /api/profile`(REST) 的 key 集合全等且 `ProfileDtoSchema.safeParse` 双侧通过（R-04③）；② `daily_goal`/`dailyGoal` 只有一份真值 + 兼容映射（`profileDtoLegacyAlias`）；③ 200×200/≤300KB JPEG 两侧均 2xx，超限双侧同一人话错误（R-04①②）；④ checkpoint key `{userId}:{threadId}`，**旧裸 threadId 行仍可被属主读**（用例覆盖读历史/续聊/中断恢复三条）；⑤ 用户 B token 请求 A 的 threadId → 403；⑥ WS 首帧鉴权 + 旧 `?token=` 在 72h 窗口内仍连（config 位）；⑦ 无 token WS 仍拒（不回退）；⑧ **【fix3 · A-36-1 追加登记 —— `profile.update` 入参的第三条例外，措辞按本句为唯一口径**（A-33-1 通道就地打戳）**：`profile.update` 入参除 `nickname` 键不变外，`dailyGoal` 与 `daily_goal` 两键共用同一对 `DAILY_GOAL_MIN/MAX`**（`packages/shared/src/constants/limits.ts:107-108` 实测 = 1／200），**别名键接受域由 100 扩至 200 属单一真相对齐、非放宽** —— 把别名键改回字面量 100 才是在同一个入参对象的两把尺子之间造第二份真相，且会连带打红 `packages/server/test/integration/profile-output-parser.spec.ts:364/:381` 与 `profile-dto.spec.ts:287`；canonical 键 `daily_goal` 与 REST 门面早已按 200 通过绿用例。A-30-2 的"两键一字不变"这一**字面**口径自本句起被限定（`~~两键一字不变~~` → 除 `nickname` 外，两键共用同一对常量；戳号 **A-36-1**，E3′ 已按此追认为第三条例外）；⑨ **【fix3 · A-36-2 追加核对判据 —— 本任务名下 `profile.get` 的 `nMiddlewares` 由 2 变 3 已是登记过的例外，不是缺陷**：`.output()` 在 tRPC v11.18 必然把 `outputValidatorMiddleware` push 进 `_def.middlewares` ⇒ **每挂一个 output parser 允许 `nMiddlewares` +1，且新增项的名称必须逐字是 `outputValidatorMiddleware`**（`_type` 为 `output`）。其余任何中间件**数量／顺序／名称**变化仍属 A-28-1 禁区；E3′ 实测该轴新增项 = `#1{name:outputValidatorMiddleware,_type:output}` ⇒ 对得上即绿、对不上即红。完整口径见 §3.3.2 末行（同一裁决号的规范落点），戳号 **A-36-2**】 | 中：`threaded.ts` 改动影响 LangGraph 恢复语义 → 用"兼容读"而非迁移，任何不确定的旧 key 一律 403 而非 500 |
| **T-12** | Web 外壳与极简查词首页（含移动导航、主题、装饰层） | R-07, R-08, R-10, R-22, R-23②（外壳层） | ✏️`apps/web/src/app/(user)/page.tsx`（367→≤80 行）、✏️`apps/web/src/app/(user)/layout.tsx`、🆕`apps/web/src/components/home/{search-section,result-section,decor-layer,footer-note}.tsx`、🆕`apps/web/src/components/mobile-nav.tsx`、✏️`apps/web/src/components/header.tsx`、🆕`apps/web/src/lib/{nav.ts,hooks/use-lookup.ts,api/lookup-stream.ts}`、🗑️`apps/web/src/components/word-lookup.tsx`、🆕`apps/web/e2e/home.spec.ts` | `packages/**`、`apps/web/src/app/layout.tsx`（T-04）、`apps/web/src/components/{login-dialog,providers,wordbook-sidebar,flashcard}.tsx`、`app/(user)/{study,wordbook,profile,report,chat,assess}/**` | T-04, T-05, T-03 | `pnpm --filter @tm/web build && pnpm --filter @tm/web exec playwright test e2e/home.spec.ts` | ① `[data-testid=home-root]` 可交互元素 ≤5（PRD §8.3-C 五项各 =0：方向按钮/历史 chips/大灰卡/侧栏胶囊/AI 卡）；② 375px：底部 5 tab 可点、"更多"抽屉含 chat/assess、当前项 `aria-current`、`100dvh` 不遮输入框（PRD §8.3-A）；③ 最近查询仅聚焦时出现（未聚焦 DOM 高度 0）、≤20 条、可清空二次确认；④ 结果条精简：词+音标+喇叭+词性首义 ≤2 行+星标+"查看详情"；⑤ 首页无 `fetch(`（`boundaries --web`）—— **A-30-4 更正**：`--web` 模式**尚未实现**（`tools/boundaries.mjs` 的 MODES 里没有它，与 A-24-1 的 `--dist` 同类幻影），出口轮由 **T-02** 补（见本表 T-02 判据⑤）；当前等效证据 = `node tools/boundaries.mjs --ui-io` 全绿 + 首页传输面具名断言（`components/home/**` 与 `page.tsx` 里 `fetch(`/`XMLHttpRequest` 命中 = 0，由 T-12 在报告里逐字贴出），等效成立**已接受**，欠账仍要还 | 低-中：纯前端结构，不碰库。风险在删 `word-lookup.tsx` 的隐性依赖 → `build` 绿即证明无悬空 import |
| **T-20** | Android 原生壳、通知/AlarmManager、小组件、构建链与 CORS 白名单、legacy hotfix | R-17②③④⑤⑧⑨⑩, R-18④, R-20③⑦, R-21 全条 | ✏️`mobile-memory/src/com/tomorrow/memory/MainActivity.java`（含内联 `Bridge` 类）、🆕`mobile-memory/src/com/tomorrow/memory/{ReminderScheduler,ReminderReceiver,BootReceiver,WidgetUpdateReceiver}.java`、✏️`mobile-memory/src/com/tomorrow/memory/SearchWidget.java`、✏️`mobile-memory/AndroidManifest.xml`、✏️`mobile-memory/res/**`（`xml/search_widget.xml`、布局、`drawable/ic_stat_*`）、✏️`mobile-memory/build-apk.sh`、✏️`mobile-memory/scripts/assemble_apk.py`、🆕`mobile-memory/scripts/version-manifest.mjs`、🆕`mobile-memory/keystore-cert.sha256`（**签名证书 SHA-256 指纹基线，非机密，供 CI 比对**，RK-13）、✏️`Caddyfile`（CORS 段）、🆕`mobile-memory/tests/gui-cdp.mjs`（移植 `mobile-agenda/tests/gui-cdp.mjs`）；分支 `legacy/handwritten-app`（`mobile-memory/assets/app.js` 仅 `:994` 一处修复） | `apps/app/src/**`（只消费其 `dist`）、`packages/**`、`apps/**` | T-01, T-14 | `bash mobile-memory/build-apk.sh && "$JAVA_HOME/bin/java" -jar "$BT/lib/apksigner.jar" verify mobile-memory/tmword-dev.apk && adb -s <serial> shell dumpsys package com.tomorrow.memory \| grep versionName` | ① 干净克隆一条命令产出**已签名可安装** APK，无人工步骤、无仓库外文件（R-17③）；② 脚本内**无** `E:/android-build` 与明文口令字面量（grep 0 命中，B-08）；③ ~~`setDomStorageEnabled(true)` 在 diff 中可见~~ **【fix2 · A-33-8 就地更正判据措辞（上一轮派给架构师、fix1 未做的那件）**：原措辞字面不成立 —— `setDomStorageEnabled(true)` **自 HEAD 起就在** `mobile-memory/src/com/tomorrow/memory/MainActivity.java:30`（本轮只读取证：`grep -rn "setDomStorageEnabled" mobile-memory` 在**源码侧唯一命中** = `MainActivity.java:30`，其余命中都在构建脚本的机检里 = `mobile-memory/build-apk.sh:189-194` 的 `check_dom_storage()`，由 `:217` 与 `:236` 两处调用）—— 所以"在 diff 中可见"今天**必然为假**，它当初想表达的是"这行别被漏掉"。新措辞 = **"`setDomStorageEnabled(true)` 在源码与 APK 产物中生效，且有构建期机检（缺失即 fail）"**（T-20 已按此加了 `check_dom_storage()`，方向正确、无需返工）。**证据口径三条，缺一即判据未闭合**：① `grep -n setDomStorageEnabled mobile-memory/src/com/tomorrow/memory/MainActivity.java` 的**行号**；② **干净克隆**一条命令构建成功；③ **机检疫苗** = 临时删掉那一行 → 构建必红 → 恢复并确认恢复后仍绿。**严禁**为了让 diff"看得见"去无意义重排/复写那一行 —— 那是制造假改动（A-33-8 明文禁止）】；④ 真机 2 台（原生 + 小米）冷启动无 `ReferenceError`、完成"查词→背词→同步"（R-17⑤⑩）；⑤ 通知：到点可达（进程被杀）、文案"今天还有 N 个词要背"、N=0 不发、点按直达 `#/study`、关开关 24h 内不送达（R-21②③④⑤⑦）；⑥ 小组件显示今日待背数与进度条，点按进查词并聚焦弹键盘（R-20③/R-21⑥）；⑦ 旧手写 hotfix APK（同 keystore）可覆盖安装并修好崩溃（清单步 1）；⑧ CORS：`file://`（`Origin: null`）请求 `https://tmword.xyz` 成功（R-17⑤）；⑨ **签名指纹比对**：`apksigner verify --print-certs` 的 SHA-256 == `mobile-memory/keystore-cert.sha256` 基线，不一致即脚本 exit 1（RK-13） | **高（不可自动化的部分最多）**：签名 keystore 若丢失/变更 → 无法覆盖安装（必须沿用现 `keystore.jks`，**RK-13**：CI secret 保存原件 + 仓库外双备份，**严禁重建**，脚本无 secret 即失败而不是自签）；`POST_NOTIFICATIONS`/`SCHEDULE_EXACT_ALARM` 在小米需白名单引导 |

#### 批次 4

| ID | 标题 | 覆盖 R | 允许新建/修改（精确） | **不得触碰** | 前置 | 冒烟命令 | 完成判据 | 回归风险 |
|---|---|---|---|---|---|---|---|---|
| **T-15** | Web 学习闭环与词本/我的页 | R-09, R-11, R-12, R-13, R-14, R-15, R-16, R-04 前端面 | ✏️`apps/web/src/app/(user)/study/page.tsx`（283→≤120）、✏️`app/(user)/word/[word]/page.tsx`、🆕`app/(user)/wordbook/page.tsx`、✏️`app/(user)/profile/page.tsx`（313→≤100）、🆕`app/(user)/profile/security/page.tsx`、🆕`apps/web/src/components/{study/{queue-switch,card-view,session-summary}.tsx,wordbook-sidebar.tsx(瘦身),profile/{checkin-card,stat-cards,goal-setting,avatar-setting,settings-list}.tsx,favorite-button.tsx}`、🗑️`apps/web/src/components/flashcard.tsx`（拆为 `components/study/card-view.tsx` + `@tm/ui/patterns/Flashcard`）、🆕`apps/web/src/lib/api/{review,wordbook,profile}.ts`、🆕`apps/web/e2e/{study,wordbook,profile}.spec.ts` | `packages/**`、`app/(user)/page.tsx`（T-12）、**`app/(user)/layout.tsx`（T-12 唯一 owner：词本一级入口由 T-15 往 `lib/nav.ts` 的 `NAV_ITEMS` 提需求，T-12 在批次3 内已预留 `/wordbook` 项）**、`components/{mobile-nav,header,login-dialog,providers}.tsx`（T-12/T-16）、`app/layout.tsx`（T-04）、`app/(user)/{chat,assess,report}/**` | T-05, T-07, T-09, T-10, T-11, T-12 | `pnpm --filter @tm/web build && pnpm --filter @tm/web exec playwright test e2e/study.spec.ts e2e/wordbook.spec.ts` | ① 四档评分与撤销、三模式切换（`?mode=`），**`new/selfTest` 不发 `reviewCard`**（网络层断言 0 请求）；② 完成页 + "今天已打卡·连续 N 天"常驻可点（非弹窗）；③ 词详情页四来源进入、按 `?from=` 返回；④ `/wordbook` 搜索+4 排序+4 筛选+行内释义与喇叭+删除撤销；⑤ 星标才入库（自动灌入代码已删）；⑥ `globals` 无硬编码色；⑦ 无内部术语徽章（R-25 范围内本期 P0 页面 0 命中） | 中：页面多、状态杂。风险 = 与 T-16 同时改 `(user)/layout.tsx` → **该文件已归 T-12 唯一所有**，T-15/T-16 均不得改 |
| **T-16** | Web 登录墙拆除与凭据交互（弹窗三态、强制改密拦截、401 单点） | R-23 全条, R-39⑧⑨, R-40③④⑥前端面, R-01⑤⑥⑧ | ✏️`apps/web/src/lib/use-auth.ts`、✏️`apps/web/src/lib/auth.ts`、✏️`apps/web/src/lib/trpc.ts`、✏️`apps/web/src/components/providers.tsx`、✏️`apps/web/src/components/login-dialog.tsx`（变薄壳）、🆕`apps/web/src/components/{auth-gate.tsx,upgrade-gate.tsx,login-wall.tsx}`、🆕`apps/web/src/app/upgrade-password/page.tsx`、🆕`apps/web/src/app/(user)/about/page.tsx`、🆕`apps/web/e2e/{auth-wall,upgrade}.spec.ts`、🆕`apps/web/src/lib/api/auth.ts` | `app/(user)/layout.tsx`（T-12）、`app/layout.tsx`（T-04，**除本任务需在根 layout 挂 `<UpgradeGate>`：例外登记为"仅允许新增 1 个 import + 1 个包裹标签"**）、`packages/ui/**`、`app/(user)/{study,wordbook,profile}/**` | T-13, T-07, T-12 | `pnpm --filter @tm/web exec playwright test e2e/auth-wall.spec.ts e2e/upgrade.spec.ts && node tools/boundaries.mjs --copy` | ① 已登录进 5 个页面时 DOM 无"请先登录后…"中间态（骨架屏 → 内容）；② 弹窗默认密码模式 + 默认焦点在密码框（`document.activeElement` 断言）；③ 未登录进 `/wordbook` 显示可读引导 + "手机号登录"主按钮 + "没有账号？注册"文字链；④ 登录成功后回跳原页并完成"待收藏"动作（R-16②/R-39⑧）；⑤ `NO_PASSWORD_ACCOUNT` → 固定文案 + 可点"设置密码激活"→ 切注册态并保留手机号；⑥ 401 `CREDENTIAL_EXPIRED` → 清 localStorage + 跳登录 + 提示；⑦ `upgrade_required` → `/upgrade-password` 不可关闭、只有"改密/退出"两出口，成功后回原页；⑧ grep 0 命中：`忘记密码`、`找回密码`、`以后再说`、`用验证码登录`（引导语境）、`重新注册`、`换手机号`；⑨ 协议勾选未选时主按钮禁用且给 `AGREEMENT_REQUIRED` | 中高：拦截层跨全站（`upgrade-gate` 包在根 layout）→ 写错会让全站白屏。缓解：`upgrade-gate` 只读 `localStorage` 标志位、不做网络请求；e2e 有"未命中门禁时零副作用"用例 |
| **T-17** | App 查词 + 词详情页（含最近查询回归、跳位修复） | R-19①④, R-07(App 侧), R-09, R-10, R-14, R-16(App) | 🆕`apps/app/src/screens/{LookupScreen,WordDetailScreen}.tsx`、🆕`apps/app/src/components/{result-row,ai-mnemonic-bar}.tsx`、🆕`apps/app/test/{lookup-screen,detail-screen}.spec.tsx` | `apps/app/src/{router.tsx,data/**,shell/**,host.tsx}`（T-14，只消费）、`apps/web/**`、`packages/**` | T-05, T-14, T-09, T-11 | `pnpm --filter @tm/app build && pnpm --filter @tm/app test -- lookup` | ① 搜索框固定位置（结果出现后 `top` 不变、无 130px 占位）；② 结果收为精简条 + "查看详情"；③ 最近查询面板恢复（现状完全不显示）；④ 词详情页 AI 记法区默认收起、失败给降级文案与重试；⑤ 375×667 / 412×915 无横向滚动；⑥ 未登录可查可读，点收藏走 T-19 登录 | 低-中 |
| **T-18** | App 背词（三模式/四档/撤销/完成页）+ 词本 + 学习情况页 | R-11, R-12, R-13, R-14, R-15, R-19①②③④, R-21 数据面 | 🆕`apps/app/src/screens/{StudyScreen,CompletionScreen,WordbookScreen,ProgressScreen}.tsx`、🆕`apps/app/src/components/{goal-ask-sheet,due-badge-data}.tsx` | `apps/app/src/{router.tsx,shell/**,data/**}`（T-14）、`screens/{Lookup,WordDetail,Me,Security,About,Login,UpgradePassword}.tsx`（T-17/T-19） | T-05, T-10, T-14, T-17（router 已注册全部路由） | `pnpm --filter @tm/app build && pnpm --filter @tm/app test -- study wordbook progress && node tools/boundaries.mjs --app-copy` | ① PRD §8.3-B 的 12 项中 App 侧 10 项逐条通过（左滑删除、四档、完成页文案、目标达成询问、热力图三模式与点选信息条、菜单红点等）；② 队列为空时给"学新词/回首页"两出口（现状死路消除）；③ `new/selfTest` 不写卡（网络断言）；④ 词本搜索/4 排序/4 筛选/显式删除撤销/行内喇叭；⑤ 学习情况页 3 张数字卡 + 增长曲线 + 热力图，**不重置任何存量 `daily_goal`**；⑥ 无内部术语徽章 | 中：与 Web 的评分语义一致性靠 `@tm/shared` 常量保证；若 T-05 组件被 App 侧覆写会破坏 PRD §8.2-2 双端比对 → 禁止覆写，只允许 props |
| **T-19** | App 我的 / 账号（登录·注册·激活·改密·强制改密页）/ 关于 | R-01⑤⑥⑧, R-39⑧⑨, R-40①②④App 面, R-04, R-13, R-17⑨, R-19② | 🆕`apps/app/src/screens/{MeScreen,SecurityScreen,AboutScreen,LoginScreen,UpgradePasswordScreen}.tsx`、🆕`apps/app/src/lib/{auth-store,token-bridge}.ts`、🆕`apps/app/test/account.spec.tsx` | `apps/app/src/{router.tsx,data/rest-fetcher.ts,shell/**}`（T-14）、`screens/{Lookup,WordDetail,Study,Wordbook,Progress}.tsx`（T-17/T-18） | T-13, T-07, T-14, T-18（路由） | `pnpm --filter @tm/app build && pnpm --filter @tm/app test -- account` | ① 登录/注册/激活复用 `@tm/ui/auth/AuthFormShell`，**不另写一套表单**；② 注册/激活成功即 `AndroidBridge.saveToken`（R-39⑧），无二次登录；③ 命中 `upgrade_required` → `UpgradePasswordScreen` 全屏、tab 栏隐藏、物理返回键不退出（与 T-20 的 `canGoBack()` 协同，返回 false）；④ 改密走 `oldPassword` + ≥8 位；⑤ 每日目标"滑杆 + 保存 + toast"（取消静默保存）；⑥ 关于页含同步承诺 + "当前登录方式"公告（文案来自 `notice.ts`）；⑦ App 内"有新版本"提示可关闭且 24h 不再提示；⑧ 401 单点清凭据并跳登录（走 T-14 的 `rest-fetcher`） | 中高：App 是唯一 `file://` 现场，token 生命周期与返回键语义交叉点集中在此 |
| **T-21** | 发布护栏脚本：账号体检 / 备份 / 恢复演练 / 对账 / 开关初值 | R-24②③④⑥⑦⑧, R-03⑥, R-39⑤b 对账, R-40⑤, R-41⑦（只读计数面）, §6.4 全套 | 🆕`scripts/release/{preflight.mjs,account-audit.mjs,reconcile.mjs,restore-drill.mjs,lib.mjs}`、✏️`packages/server/src/services/backup.ts`、🆕`packages/server/test/release/backup.spec.ts`、🆕`backups/manifest.json`（运行时产物，仓库放 `.gitkeep` + schema 说明 🆕`scripts/release/README.md`） | `.github/workflows/**`（T-22）、`packages/server/src/{routes,trpc,services}/**`（~~只 import `backup.ts`/`feature-flags.ts`~~ → **【A-32-7 更正 + 追认扩权】** 除这两个文件外，**追加授权 import `services/wordbook-service.js` 导出的 `reconcileFor`**（该方法的契约注释 `wordbook-service.ts:148-161` 已把 T-21 写成唯一消费方，属只读投影、不落库）。授权理由：发布脚本跑在**服务端进程语义**内（同进程直调 service 即可拿到两模型投影），**不需要也不允许新增 HTTP 端点** —— 加端点必然要改 `app.ts` 的装配，而 `app.ts` 是 T-07 独占文件（§10.3 / §10.2 T-07 行），为一条只读对账路径去二次触碰 T-07 排他面不可接受。三个文件（`backup.ts`/`feature-flags.ts`/`wordbook-service.ts` 的 `reconcileFor`）之外，`routes/**`、`trpc/**` 及其余 `services/**` 仍一律不得 import、不得修改）、`db/**`（**只读**：可查 `assessment_cache.user_id` 计数（判据⑧），**不得写任何 DDL/DML**，M7 的建列归 §6.1 + §10.2 T-25） | T-06, T-07, T-09, **T-25（R-41 列存在是本任务判据⑧ 的前提）** | `node scripts/release/preflight.mjs --dry-run --driver sqlite --fixture tools/fixtures/schema-fixtures.json` | ① 步 4 输出 **N/M/K/P/Q + 五类保留计数** 六项，双驱动各一遍，缺任一项 exit 1；② 步 5 产出 `backups/pre-release-<tag>.db`（`VACUUM INTO`）或 `.dump`，size>0 + `sha256` 写入 manifest；③ 步 6 能把该快照恢复到临时实例并读出用户与词本；④ 步 6b 在临时实例跑两条 `ADD COLUMN` 后**断言未执行任何回填**、hash 逐行未变、四类账号行为符合 PRD §6.4-2 步 6b①-⑧；⑤ 步 7 `--rollback` 用旧镜像 tag 连新 schema 冒烟，输出 (a)(b)(c)(d) 四条结论；⑥ 步 8 读回开关初值并断言与 PRD §6.4-7 一致 + 实测改值 ≤60 秒生效；⑦ L5 每档 `--mode diff-sample --n 20` 可执行；⑧ **【P-9 新增，R-41⑦】测评缓存旧行残留只读计数**：`account-audit.mjs`（或 `reconcile.mjs --mode assessment-orphan`）输出 `SELECT COUNT(*) FROM assessment_cache WHERE user_id IS NULL`，**sqlite 与 pg 各一遍**，随 N/M/K/P/Q 一并写进发布报告。判据硬约束：该计数**只观测、不处置** —— 脚本内不得出现任何 `UPDATE assessment_cache`/`DELETE`/回填逻辑（PRD R-41④ 与本文档 §6.1 M7 的"无回填"同源），计数是下一期清理窗口的输入而不是本期的动作项；缺这一项输出即 exit 1 | 中：脚本碰的是**生产库路径** → 全程只读 + 只写 `backups/`；`--dry-run` 与 `--fixture` 为默认，指向线上库必须显式 `--i-know-this-is-prod`；判据⑧ 新增了一次对 `assessment_cache` 的全表 `COUNT`，生产库行数大时走只读从库或加 `LIMIT` 采样，**不得**为此加索引（加索引 = 破坏性变更，归下一期） |
| **T-25** 🆕 | **`assessment_cache` 补 `user_id`：读路径属主过滤（M7，R-41 全条）** —— **【P-9 新增行，非既有条目更正】** PRD v1.4 把审计 C-07 由 P1 R-28 提为**第 27 条 P0 `R-41`**，但本文档 §10.2 原表 `R-41` **零命中**、§4.1/§6.1 还写着"本期不再改 / 不动 `assessment_cache`" → "有需求无排班"。本行即该 DoD 的排班落点；与之冲突的两处原文按"只加不删"就地打戳（见 §4.1 `trpc/routers/assessment.ts` 行、§6.1「本期明确不做」行） | **R-41 全条①~⑦**；与 **R-05②** 隔离语义联动（同一"属主不确定即拒读、403 而非 500"口径，与 §10.2 T-11 行、`chat-isolation.spec.ts` 同形）；R-24④（"每个迁移成对或只加不删、加列带默认值、本期禁止原地改删"）；R-24①（CI 里要跑 R-41 的双驱动 × 入口一致性用例）；R-24⑧(a)（旧镜像不读该列也不报错）；R-40（**不占用**本期唯一破坏性变更名额 —— 本任务是纯 `ADD COLUMN`） | **DDL 侧**：🆕`packages/server/src/db/migrations/007-assessment-cache-user-id.ts`（**唯一一条语句** = `ALTER TABLE assessment_cache ADD COLUMN user_id INTEGER DEFAULT NULL`，sqlite/pg 各一份；无 `CREATE INDEX`、无 `UPDATE`、无 `DROP`，`down` 省略并写 `noDownReason`"禁 DROP COLUMN"）、✏️`packages/shared/src/schema/tables.ts`（`assessmentCache.columns` :333-344 追加 `user_id`；并为 `columnDdl()` :116-138 **只追加**"显式 DEFAULT 字面量"能力 —— 见判据⑤；M1-M6 已有描述与生成结果一字不动）、✏️`packages/server/src/db/{types,sqlite,pg}.ts`（`AssessmentDB.get/set` 签名加 `userId`；建表面 `sqlite.ts:112`/`pg.ts:146` 的 `CREATE TABLE assessment_cache` 同步补该列；读点 `sqlite.ts:659-674`/`pg.ts:692` 加属主过滤；写点 `sqlite.ts:676-684`/`pg.ts:709` 的 `INSERT` 与 `ON CONFLICT (word,qtype) DO UPDATE SET … , user_id = excluded.user_id` 带上属主）、✏️`packages/server/src/db/migrations/index.ts` + ✏️`packages/server/src/scripts/migrate.ts`（`ALL_MIGRATIONS` :57 与 import :42-48 追加 m007，顺序追加不改既有条目）。**读路径**：✏️`packages/server/src/trpc/routers/{assessment,assessment-parts}.ts`（把 `ctx` 的 userId 传进缓存读写；**input/output 的 zod 形状一字不改**）。**前端**：✏️`apps/web/src/app/(user)/assess/page.tsx` —— **仅限**"submit 返回 `FORBIDDEN` → 触发一次重新出题"这一条分支，**不新增任何文案**（文案仍归 T-03 的 `notice.ts`/`errors.ts`）。**测试**：🆕`packages/server/test/integration/assessment-isolation.spec.ts`（双驱动，命名与 `chat-isolation.spec.ts` 对齐）、✏️`packages/server/test/db/migrations.spec.ts`（**只追加** 007 的判据用例） | `packages/server/src/app.ts` 与 `middleware/**`、`services/{auth-service,password-policy,feature-flags,account-audit}.ts`（**T-07 独占**）；`services/{wordbook-service,wordbook-merge}.ts`、`routes/wordbook.ts`、`trpc/routers/wordbook.ts`（**T-09 独占**）；`services/{review-service,queue-service,checkin-service,fsrs}.ts` 与 review/checkin 两侧入口（**T-10 独占**）；`services/{profile-service,avatar-service,search-history-service}.ts`、`routes/{profile,chat}.ts`、**`trpc/routers/chat.ts`**（**T-11 独占**）；`packages/shared/src/{contracts,constants}/**`（T-03 —— `FORBIDDEN` 只**只读消费** `TM_ERRORS_SUPPLEMENT`，缺码即走回环，不许自行加码）；`tools/**`、`vitest.workspace.ts`（T-02/T-01）；`scripts/release/**`（T-21）；`packages/agent/**`；`mobile-memory/**`、`apps/app/**`（App 侧本期无测评入口，R-41 不在 App 落地，见判据⑧）；`packages/server/src/db/migrations/00[0-6]*.ts`（**已落地迁移文件一字不改**）；`db/**` 中除 `AssessmentDB` 三个方法以外的任何读写点 | **T-06**（含 A-32-1(b)/A-32-6 的 `db/**` 微轮收口 —— 本任务开始前 `db/**` 与 `packages/shared/src/schema/**` 的归属必须已交回，见 §10.4 第 9 行）、**T-08**（router 已按域拆分，本任务才只碰两个 assessment 文件）、**T-03**（`FORBIDDEN`/错误码常量就位）。**排期方向：必须早于 T-21 判据⑧ 与 T-24 的步 6b/步 7**。**落点 = 批次4 而非批次3 的理由**：批次3 已在施工、且 T-06 的 db 微轮尚未交回，同批次两 agent 会同时声明 `db/**`（违反 §10 硬约束"同批次可写集合两两不相交"）；也**不折进 T-06 或 T-07** —— T-06 的范围是"DDL 单一源 + 迁移框架"、T-07 的范围是凭据域，把跨 DDL/服务/路由/前端四层的 R-41 塞进任一既有行都会破坏其"精确文件清单"的可校验性 | `pnpm db:migrate && pnpm --filter @tm/server test -- assessment-isolation migrations && pnpm ddl-parity && pnpm --filter @tm/server typecheck`；pg 侧按 A-18-3 同形：`DATABASE_URL_TEST=… pnpm --filter @tm/server test -- assessment-isolation`（本机无实例时显式 SKIP 并把原因留在输出，CI（T-22）必须真跑）；旧库演练：`cp data.db tmp/m7-drill.db && DB_DRIVER=sqlite SQLITE_PATH=./tmp/m7-drill.db pnpm --filter @tm/server migrate`（**不得**直接打仓库根 `data.db`，安全阀会拒） | ① **本期硬约束一（PRD R-41①/④ 的机器化）：`M1-M6 只加不删`** —— `test/db/migrations.spec.ts` 断言已落地的 000-006 六个模块的语句数组**逐字节不变**（把六条迁移的语句序列化成稳定快照比对），且 `assertMigrationDiscipline()` 对全量迁移仍 0 违规；仓内 grep 证据：本期迁移目录内 `DROP COLUMN`/`DROP TABLE`/`ALTER COLUMN`/`RENAME` **0 命中**。② **本期硬约束二：迁移不得执行任何回填** —— 007 的语句数组长度 = 1、且 `BUSINESS_TABLES_IN_STATEMENT`（`migrations/index.ts:101`）对 007 必须 0 命中（即语句里不存在指向 `assessment_cache` 的 `SELECT/UPDATE/INSERT/DELETE`）；用例断言"迁移前后 `COUNT(*)`、`SUM(id)`、既有 4 列逐行 hash 完全一致"，`user_id IS NULL` 的行数 = 迁移前行数（**新列全表为 NULL 是预期结果，不是缺陷**）。③ **旧行 `user_id` 为 NULL 时必须拒读而非猜属主** —— 任何 `user_id IS NULL` 的行对**所有**用户都读不到（`get` 返回 null），**禁止**"NULL 视为公共池/视为首个访问者"的任何捷径；与 §10.2 T-11 行"任何不确定的旧 key 一律 403 而非 500"同口径，报告里须并列引用这条。④ **他人属主同样拒读 + `userId` 只取会话凭据** —— 用户 A 读不到 B 的行（双用户 × 双驱动 4 组用例）；且 **`input` 里任何 `userId`/`ownerId` 字段一律被忽略、不得改变命中结果**（PRD R-41② 与 R-24① 的"客户端传入 `userId` 被忽略"用例，属主只来自 `ctx` 的凭据）；`set` 的 `DO UPDATE` 会把行属主改写成当前写入者（这是"缓存挤占"语义的一部分，与 §6.1「M7 键设计说明」第 2、3 点一致，代价登记 RK-14）。⑤ **`DEFAULT NULL` 字面量必须真的出现在语句里** —— 现状 `columnDdl()`（`tables.ts:131`）在 `default` 为 `null/undefined` 时会**丢掉整个 DEFAULT 子句**，而 `addColumnWithoutDefault()`（`migrations/index.ts:107-113`）见到无 DEFAULT 的 `ADD COLUMN` 即判违规 → 本任务必须先给 schema 源补"显式默认值字面量"的表达方式，再用**一条用例**证明 M1/M4（现有带 DEFAULT 的加列）生成的语句**一字未变**；不做这一步的话 007 会被自家白名单打死。⑥ **双驱动对等 + 两条建库路径一致** —— `pnpm ddl-parity`（A/B/C 三段）全绿；全新库的 `CREATE TABLE` 与旧库 `ALTER` 后反读的 `user_id` 列类型/可空性一致（pg `BIGINT` vs sqlite `INTEGER` 沿用 `created_at` 的既有 `pgType` 写法，不许新发明一套）；`migrate --status` 在两边都只列 007 为待执行。⑦ **错误语义**：`generate` 未命中缓存 → 正常出题并写缓存（对用户无感，不得报错）；`submit` 未命中（题面被他人挤占或旧行被拒读）→ **403 `FORBIDDEN`（来自 `TM_ERRORS_SUPPLEMENT`），不是 500**，且响应经 A-30-1 的 `errorFormatter` 带得出该 code；前端 `(user)/assess/page.tsx` 命中该 code 时回到"重新出题"，不出现新文案。⑧ **不做 REST 门面 / 不做 App 侧**：本任务**不新增任何 HTTP 路由** —— 取证 = `grep -in "assess" packages/server/src/app.ts packages/server/src/routes/*.ts` 现状与本任务后**均为 0 命中**（事实：现状就不存在测评 REST 入口，故 R-41② 的"REST 与 tRPC 双入口"在本期**退化为 tRPC 单入口 + 单一 service 读路径**，该事实需 PM 在 PRD 侧更正，见 `.delivery/02-tech-design-fix1.md`）；App 侧本期无测评页，R-41 不在 `apps/app/**` 落地。⑨ **trpc 形状只增不改 + 基线覆盖自证**：按 A-28-1 在批次3 出口轮再生成 baseline 后，`assessment.*` 的 path 列表与 input 形状不变；**output 侧因 `(no-parser)` 无覆盖**（§11 F-7），故本任务额外用 `ProfileDtoSchema.safeParse` 同形的**出参等值用例**自证 `assessment` 三个 procedure 的返回结构未变（补 F-7 的盲区）。⑩ **回滚前提**：旧镜像（不读 `user_id`）连新 schema 库仍能出题与判分 —— 由 T-21 步 7 `--rollback` 复跑，本任务出口先给一条"手工构造不含该列的 SELECT 仍可执行"的用例 | **中**：① 缓存命中率下降（同一 `(word,qtype)` 两人互挤一行，并发测评时每人每次重生成一次 LLM 题）—— 已登记 **RK-14**（§9），本期**不省这笔钱**，判据与下一期四步键迁移写在 §6.1「M7 键设计说明」；② 碰 `db/**` 与 `schema/**` 的签名变更会牵连 T-09/T-10/T-11 的既有测试 → 前置写死为"T-06 微轮交回之后"，且 `AssessmentDB` 是本期唯一被改签名的 DB 接口；③ `UNIQUE (word,qtype)` 一字未动 = 本期做不到"每用户一行"，若 QA 或 PM 要求真隔离，那是**下一期**的四步迁移（建表→双写→切读→删旧），本期禁止以"顺手"名义重建该表 |

#### 批次 4 通用约束（fix3 新增段 · 依 A-36-5 / A-36-11）

> **这一段不是任务行、不改排班**：A-36-11 明确"给号落判据，但不新增任务行、不替 TPM 排班"，判据由**批次4 各域任务在自己的行内认领**（谁碰 router 谁挂），T-08 只额外认领它名下那三个 router（`routers/index.ts`、`agent.ts`、`analyst.ts`）。本段与 §3.3.2 的四条硬要求是同一把尺子，这里只补"批次4 怎么落地、什么时候能开工"。

- **① 闭合 `.output()` 是硬判据，不是建议**：凡 `@tm/shared` **已有 DTO** 且**已有双侧 `safeParse` 用例**的 procedure，**必须挂闭合对象 `.output()`**（`z.object({ ...DtoSchema.shape, … })`，`unknownKeys='strip'`）。**禁止 passthrough、禁止 `.extend()` 一个带 passthrough 的 schema** —— 依据 **A-35-1①**（passthrough 的索引签名压过声明键 ⇒ `inferRouterOutputs` 仍 `unknown`，挂了等于没挂）；四条硬要求全文与可机检写法见 §3.3.2。**没有 DTO 的过程不在此列**：先回 `packages/shared/src/contracts/**` 定契约（owner **T-03**，§10.4 登记一次交接），**禁止**在 router 里发明形状（A-34-1⑤：禁止客户端 `as number` 之类 cast 糊 `unknown`）。
- **② 每挂一条，带一条"真实服务端输出过 schema"用例**（依据 **A-34-1②**）：断言的是**服务端实际返回值**过 schema，不是构造出来的样本；配套"键集合钉"用例 + 疫苗按 §3.3.2 第 3 条执行。样板 = `packages/server/test/integration/profile-output-parser.spec.ts`（`A-34-1② 判据一/二` 两组 describe + `A-35-1② 键集合钉` 四支，E3′ 报告 §6.2 记这 19 支**再生后实跑全绿**）。
- **③ 基线例外必须"动手前"申报，不得出口时打包塞给 E 轮**（依据 **A-36-5**）。共同教训写在 A-36 一-5：把 tRPC 门面从内联 schema 换成 shared 契约 schema 这类"看着最纯"的重构**必然**打穿 A-28-1，因为**错误 message 串与 checks 数值都在快照面上**（E3 的四个 DEFECT 里 #1/#3/#4 三条都是这一类）。申报的最小格式 = 哪条 procedure、哪一轴（`type`/`meta`/`nMiddlewares`/`input`/`output`/`inputProbes`/`outputProbes`）、凭什么算"只增"。已获批的三个轴例外只有：`nMiddlewares` +1 且新增项名为 `outputValidatorMiddleware`（**A-36-2**，口径在 §3.3.2 末行）、`output: null → 闭合 Schema`（**A-34-1③ / A-35-1④**）、`profile.update` 入参别名键共用 `DAILY_GOAL_MIN/MAX`（**A-36-1**，§10.2 T-11 判据⑧）。**caller 清单加 procedure**（如 §4.4.1 的 `wordbook.push`/`wordbook.pull`）不在既有例外里，要做得单独申报（**A-36-8**）。
- **④ 开工前置（硬时序）**：批次4 **任何 router 改动必须在 E3′ 再生后的基线之上开工**，登记值 = `packages/server/test/trpc-shape.baseline.json` 的 sha256 **`5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`**（旧值 `9cc6b319…` 自本段起作废，但按零删除规则留在 `04-dev-report-E3-prime.md` §1.2/§4.2 里可查）。理由写在 **A-36-5**：不在新基线上开工，批次4 每个域任务都会撞同一个基线红。**开工前自查一行命令**：`sha256sum packages/server/test/trpc-shape.baseline.json` 与上面的值逐字相同即开工；不等就是**停下报告**，不是自己再生。
- **⑤ 再生额度**：批次4 只允许**出口轮一次**基线再生，**不是每任务一次**（**A-36-11 末句**）。任务级判据一律写成"与**再生后的新基线**形状一致"，而不是"与上一轮我改前的形状一致"。通道与门禁命令口径见 §10.4 第 10 行（`--task E3` + `baseline-regenerate:A-36-E3` 的先例；批次4 须**另立裁决号**，不得复用 A-36-E3，那是 E3′ 的一次性授权）。

#### 批次 5（串行收口）

| ID | 标题 | 覆盖 R | 允许新建/修改（精确） | **不得触碰** | 前置 | 冒烟命令 | 完成判据 | 回归风险 |
|---|---|---|---|---|---|---|---|---|
| **T-22** | CI/CD 接真实测试、双驱动 PG 服务、APK 产物与独立镜像回退 | R-24①②, R-17③⑧, PRD §6.4-3 分层独立性 | ✏️`.github/workflows/ci.yml`、✏️`.github/workflows/deploy.yml`、🆕`.github/workflows/backup-cron.yml`、🆕`.github/actions/*`（如需）、🆕`web-static/`（下载页 + `version.json`，见备注） | 所有业务代码 | T-02, T-20, T-21, 批次3/4 全部 | `act -j ci --secret-file .secrets.local --dir .` 或 `pnpm -r typecheck && pnpm -r test && pnpm -r lint && pnpm depcruise && pnpm ddl-parity`（与 CI 步骤逐字一致） | ① `ci.yml` 中**不再出现** `echo "smoke placeholder"`（grep 0 命中）；② CI 步骤 = typecheck / lint / depcruise / ddl-parity / vitest(sqlite) / vitest(pg) / web build / app build / apk，任一失败 → `deploy` 不触发；③ `deploy.yml` 拆 `snapshot → server → web → apk-publish` 四个 job，`snapshot` 失败即断链，`web` 依赖 `server`（L1→L3 不可隔夜，TR-2）；④ APK 产物带 sha256 并挂直链，`version.json` 版本号 = git tag；⑤ keystore 从 secret 注入，无 secret → 构建失败而非自签 | 中：CI 绿 ≠ 线上好，但 CI 假绿会直接放走破坏性变更 → 禁 `continue-on-error`、禁 PG skip |
| **T-23** | 端到端走查用例固化（PRD §8.2 八项 + PRD §8.3 A/B/C/D） | R-24, R-34(P1 范围内先建 Web 侧), §8 全部机器可判项 | 🆕`e2e/web/{nav-375,home-minimal,study-four-level,wordbook-favorite,login-wall,upgrade-gate,theme-fouc}.spec.ts`、🆕`e2e/app-cdp/{startup-sync,wordbook-swipe,heatmap-modes,reminder,widget-focus}.spec.mjs`、🆕`e2e/README.md`（用例 ↔ 判据编号映射表）、🆕`e2e/grep-copy.spec.mjs`（PRD §8.3-D 全站 0 命中断言） | 业务代码（**只写测试，不改实现**；发现缺陷回 Phase 6 回环） | T-12, T-15, T-16, T-17, T-18, T-19, T-20, T-22 | `pnpm exec playwright test --project=web && node e2e/grep-copy.spec.mjs` | ① 每个 PRD §8.3 清单项 ≥1 条用例，`e2e/README.md` 里"判据编号 → 用例文件:行号"全覆盖（可让测试工程师不读代码即写用例）；② 双驱动用例在 CI 跑两遍；③ grep 类断言命中数=0 且**故意注入一处旧文案能红**（自证有效）；④ 录屏式断言（FOUC、搜索框跳位）有可判真假的替代测量（首帧 `getComputedStyle` / `boundingClientRect.top` 采样） | 低：只新增测试。风险 = 用例写得"永真" → ③ 的注入自证是硬性交付物 |
| **T-24** | 预发演练与发布清单执行（唯一允许连线上库的任务；**产出 = 发布报告**） | R-24⑤⑥⑧, R-03⑤⑥, 全部 L1-L5 | 不改代码；🆕`.delivery/release-report-<date>.md`（12 步逐项证据：命令/产物路径/六个线上实测数字/Q 的下降曲线/回滚演练结论） | 任何 `src/**`（发现缺陷 → 回 Phase 6 缺陷回环，不在本任务内修） | T-21, T-22, T-23 | `node scripts/release/preflight.mjs --full --i-know-this-is-prod && node scripts/release/restore-drill.mjs --rollback --tag <prev>` | ① PRD §6.4-2 十二步逐项"通过判据成立"且**任一项不成立即判定阻断发布并写明是哪一项**；② 步 4 的 N/M/K/P/Q 来自线上生产库并标注库名与执行时间；③ 步 6b 四类账号 + 步 7 (a)(b)(c)(d) 有实测记录；④ 步 9 含 2 台真机 + 旧 APK 两例（PRD §8.3-D 21/22）截图；⑤ 步 11 三份文案一致且无截止日；⑥ 回滚触发判据清单打印在报告首页（供窗口内值守） | **极高（这是"能不能上线"的裁决）**：唯一一处不可逆动作在此发生 —— 因此本任务**必须在临时实例演练完成后**才允许连线上，且演练失败即判定不发布 |

### 10.3 共享冲突点归属表（每个文件**只有一个 owner**，其余任务只读）

| 共享冲突点 | 唯一归属 | 其他任务的消费方式 |
|---|---|---|
| 根 `package.json`（脚本、`pnpm.overrides` 钉版本） | **T-01** | 只调用 `pnpm <script>`；需新脚本 → 提给 T-01 |
| `pnpm-workspace.yaml` | **T-01** | 只读（`packages/*`、`apps/*` 已覆盖本期全部新包，理论上无需再改） |
| `tsconfig.base.json`（含 `@tm/ui` paths） | **T-01** | 只 extend；包内私有配置归各包（`packages/ui/tsconfig.json`=T-01 建、后续 T-04/T-05 可改自己包的那一份 —— **例外登记：`packages/ui/tsconfig.json` 归属 T-04**，`apps/app/tsconfig.json` 归属 T-14） |
| `eslint.config.js` / `.gitignore` | **T-01** | 只读；`.gitignore` 的 APK 构建产物忽略项由 T-01 一次配齐（含 `apps/app/dist`、`mobile-memory/build`、`backups/*.db`） |
| `.github/workflows/*` | **T-22** | T-20/T-21 只交付可被 CI 调用的**本地可执行脚本**，不写 workflow |
| `packages/shared/src/index.ts` | **T-03** | 只 `import`；新增契约文件由 T-03 统一 re-export（T-06 的 `schema/**` 通过 `@tm/shared/schema` 二级路径消费，**不经 index.ts** → 消除两任务抢改同一出口） |
| `packages/shared/src/contracts/**`、`constants/**` | **T-03** | 只读；文案错误码改动一律回到 T-03（避免两端各写一套） |
| `packages/shared/src/schema/**`（DDL 单一源） | **T-06** | 只读（T-02 的 parity 脚本、T-21 的审计脚本消费它）—— **【P-9 追加】批次4 `T-25` 是本表唯一的例外需求方：R-41/M7 要往 `assessmentCache.columns` 追加一列并给 `columnDdl()` 补"显式 DEFAULT 字面量"能力。已登记为跨批次时序交接（§10.4 第 9 行），前提是 T-06 的 db 微轮（A-32-1(b)/A-32-6）已合入并交回；交接之外的任何列/表描述仍归 T-06** |
| `apps/web/src/app/globals.css` | **T-04** | T-12/T-15/T-16 一律不改（样式需求走 token） |
| `apps/web/src/app/layout.tsx`（根 layout） | **T-04** | **唯一例外**：T-16 允许新增 `UpgradeGate` 的 import + 包裹标签各 1 行（表中已登记） |
| `apps/web/src/app/(user)/layout.tsx` | **T-12** | 该文件唯一一次改动发生在 T-12（同时挂 `header.tsx` 与 `mobile-nav.tsx`，`md:hidden` / `hidden md:flex` 二选一）；T-15 词本一级入口通过 `lib/nav.ts` 的 `NAV_ITEMS`（T-12 建，批次3 内已预留 `/wordbook` 项）消费，**不动 layout**；T-16 的登录墙/门禁分别落在 `app/layout.tsx` 例外项与各页面自己的 auth-gate 包裹，**不动 layout** |
| `packages/ui/src/index.ts` | **T-04** | T-05/T-13 通过二级出口 `patterns/index.ts`、`auth/index.ts`（T-04 预置 `export * from './patterns/index.js'` 与 `'./auth/index.js'`）→ **无人抢改根出口** |
| `packages/server/src/trpc/router.ts` → `trpc/routers/**` 的拆分 | **T-08**（建与删；~~且本期不再改 assessment/analyst~~ → **P-9 更正**：`agent.ts`+`analyst.ts` 仍本期不再改，但 **`assessment.ts` + `assessment-parts.ts` 由批次4 `T-25` 为 R-41 再改一次**，登记为跨批次时序交接 §10.4 第 8 行） | T-07/T-09/T-10/T-11 各自只改**自己域的那一个文件**（`routers/auth.ts`=T-07、`wordbook.ts`=T-09、`review.ts`+`checkin.ts`=T-10、`dictionary.ts`+`profile.ts`=T-11、`agent.ts`+`analyst.ts`=T-08、`chat.ts`=T-11；**`assessment.ts`+`assessment-parts.ts`=T-08 建、T-25 改**）；`routers/index.ts`=T-08 独占。**T-25 的改动幅度封顶**：只把 `ctx` 的 userId 传进缓存读写，**procedure 的 input/output zod 形状一字不改**（A-28-1 的"只增不改"审计与 §11 F-7 的出参盲区据此仍成立） |
| `packages/server/src/app.ts`（全局中间件与新路由装配） | **T-07** | T-09/T-10/T-11 交付 `routes/<domain>.ts` 的**导出函数名与入参签名**（在 §2 目录树中已冻结），由 T-07 在批次3 内统一 `.route()` 挂载。**并行安全机制**：T-09/T-10/T-11 各自用 `packages/server/test/<domain>-standalone.spec.ts` 直接 `new Hono().route('/', createXRouter(...))` 自测，不依赖 `app.ts`；`app.ts` 的 fan-in 在批次3 末由 T-07 收口。**另一处已登记例外**：T-08（批次2）删旧 `router.ts` 时只允许改 `import { appRouter }` 的 1 行 → 见 §10.4 第 7 行 |
| `packages/server/src/config.ts`（env 与 flag 种子） | **T-07** | 其他后端任务把域内常量放自己的 service 顶部，不进 config |
| `packages/server/src/middleware/{auth,password-gate}.ts` | **T-07** | 只消费 `verifyToken()` / `passwordGate`；T-11 的 WS/`trpc/init.ts` 亦由 T-07 提供 |
| `packages/server/src/db/**` + `migrations/**` | **T-06** | T-07/T-09/T-10/T-11 只调 `AppDB` 接口方法；需要新读写方法 → 提给 T-06（§6.1/§10.2 T-06 完成判据④已把本期所需方法一次列全，避免追加排队）。**唯一被登记的后续改动人 = 批次4 `T-25`**（R-41/M7：新增 `007-*.ts`、给 `AssessmentDB.get/set` 加 `userId`、建表语句补列、`ALL_MIGRATIONS` 追加注册）—— 这是**时序交接而非并发冲突**，幅度封顶见 §10.4 第 9 行；除此以外的 `db/**` 文件与方法 T-25 零 diff |
| `mobile-memory/**`（Java / Manifest / res / 构建脚本） + `Caddyfile` | **T-20** | T-14 只提供 `dist` 与两个 JS 入口名（`__router.canGoBack` / `__app.onForeground`，已在 §5.6 冻结） |
| `apps/app/src/{router.tsx,shell/**,data/**,host.tsx}` | **T-14** | T-17/T-18/T-19 只新增 `screens/*` 与 `components/*`；路由表与查询键命名由 T-14 预置（本期全部路由已在 §5.3 列明） |
| `services/backup.ts` 与 `scripts/release/**` | **T-21** | T-22 只在 workflow 里调用 `pnpm release:snapshot` |

**归属表自检结论（门禁 §4）**：~~以上 24 个任务~~ **【P-9 更正：`T-25` 新增后为 25 个任务；原句其余内容一字未改】**的"允许新建/修改"集合按文件路径两两比对，**同批次内两两交集为空**（批次1：T-01/02/03/04/06；批次2：T-05/08/13/14；批次3：T-07/09/10/11/12/20；~~批次4：T-15/16/17/18/19/21~~ → **批次4：T-15/16/17/18/19/21/25**，其中 T-25 与同批次的 T-15/T-16 在 `apps/web/**` 上零交集（T-25 只碰 `app/(user)/assess/page.tsx` 的一条分支，该文件既不在 T-15 也不在 T-12/T-16 的可写清单里，原先是"本期不动"），与 T-21 的交集靠"T-25 是 T-21 判据⑧ 的前置"消化）—— 这是**并行开发的硬判据**，任何同批次两个任务认领同一文件即不合格。~~跨批次之间客观存在 7 处~~ **【P-9 更正：T-25 落地后为 9 处】**"必须先落一次、后续再整页重写/独占"的**时序交接**，已全部登记在 §10.4；它们不是并发冲突（后一个任务开工时前一个已合入 main），但必须按登记的**改动幅度**执行，不得当作"这个文件谁都能碰"。两处不可避免的 fan-in（`app.ts`、根 layout 的 `UpgradeGate` 包裹）已登记为"单 owner + 显式例外"，不存在"两个任务改同一个文件"的隐性冲突。

### 10.4 跨批次同文件交接（唯一允许的时序重叠）

> 判定方法：把每个文件按"批次"切开看 —— **同批次不相交**即满足并行安全；**跨批次相交**必须在下表逐条登记改动幅度，未登记的相交一律视为边界错误，退回本表修正而非现场手工合并。

| 文件 | 先动（批次/任务 + 允许的改动幅度） | 后动（批次/任务 + 允许的改动幅度） | 为什么无法避免 | 越界判据 |
|---|---|---|---|---|
| `apps/web/src/app/(user)/*.tsx` 中 **6 个现有页面**的 `import` 行 | 批次1 **T-04**：**只改 `import` 语句**（`@/components/ui/*`、`@/components/theme-provider` → `@tm/ui`），否则 `pnpm --filter @tm/web build` 不可能绿 | 批次3/4 **T-12（page.tsx）/ T-15（study、word/[word]、profile）**：整页重写，自由改任何行 | `packages/ui` 落地那天这 6 个页面必须同时可编译；而整页重写属于各自 P0 需求范围，不能提前做 | T-04 的 diff 中这 6 个文件**只允许出现 `+`/`-` 的 import 行**；`tools/boundaries.mjs --check-ownership` 对 T-04 的 commit 断言"非 import 行零变更" |
| `apps/web/src/app/layout.tsx`（根 layout） | 批次1 **T-04**：首帧主题内联脚本 + `<html suppressHydrationWarning>` + 字体 | 批次4 **T-16**：**仅新增 1 个 import + 1 个包裹标签**（`<UpgradeGate>`），已在 §10.3 登记为唯一例外 | 两端都不 FOUC 与全站门禁拦截都挂在根节点 | T-16 对该文件的 diff 行数 ≤4 行；超出即拆为新组件文件 |
| `apps/web/src/app/(user)/layout.tsx` | 批次3 **T-12**：一次改完（挂 `header` + `mobile-nav`，`NAV_ITEMS` 预留 `/wordbook`） | 批次4 **T-15 / T-16**：**只读** | 词本一级入口在 T-12 建表时就已可预判 | T-15/T-16 对该文件零 diff |
| `packages/ui/src/index.ts` | 批次1 **T-04**：建根出口，预置 `export * from './patterns/index.js'`、`'./auth/index.js'` | 批次2 **T-05 / T-13**：只改自己那一个二级出口文件 | 根出口若被两个后续任务追加 export 即成抢改点 | 后续任务对 `index.ts` 零 diff（`--check-ownership` 断言） |
| `apps/app/src/router.tsx` + `shell/**` | 批次2 **T-14**：建路由表（§5.3 的 12 条路由全部预注册为懒加载占位） | 批次4 **T-17 / T-18 / T-19**：**只新增** `screens/*`，把懒加载指向真组件；不改路由名与查询键 | App 三张 screen 任务并行，路由表必须先生效一次 | 三个 screen 任务对 `router.tsx` 零 diff |
| `mobile-memory/assets/**`（`index.html`/`app.js`/`api.js`/`style.css`） | 批次3 **T-20** 之前的 **PRD §6.4-2 步 1 hotfix**（在 `legacy/handwritten-app` 分支上改 `app.js:994`，另出 `versionCode 2` APK） | 批次3 **T-20**：main 上删 4 个源文件、由构建产物取代 | 回退路径与替换动作碰同一批路径，但**分支不同**（legacy vs main） | 两条线不得交叉 cherry-pick；`no-legacy-app-js` 规则保证 main 上只出现产物 |
| `packages/server/src/app.ts` | 批次2 **T-08**：仅改 `import { appRouter }` 的那 **1 行**（`./trpc/router.js` → `./trpc/routers/index.js`），已在 T-08 判据 ③ 登记为例外 | 批次3 **T-07**：此后**独占**（含 CORS 收紧与 `.route()` 装配） | T-08 删旧 `router.ts` 后 `app.ts` 必须仍可编译；而路由装配点归凭据域任务 | T-08 对该文件 1 行 diff；批次2 之后其它任务对 `app.ts` 零 diff |
| 8. `packages/server/src/trpc/routers/{assessment,assessment-parts}.ts` + `apps/web/src/app/(user)/assess/page.tsx` **【P-9 新增交接，R-41】** | 批次2 **T-08**（建两个 router 文件，纯搬迁，零行为变更）；`assess/page.tsx` 原登记为"本期不动"（§7.2 的 ⛔ 行已就地打戳） | 批次4 **T-25**：`routers/*` 两文件**只**把 `ctx.userId` 传进缓存读写（procedure 的 `input`/`output` zod 形状一字不改）；`assess/page.tsx` **只**新增"submit 未命中 `FORBIDDEN` → 重新出题"一条分支（≤8 行 diff，不新增文案、不动其余渲染） | R-41 是 PRD v1.4 才提为 P0 的第 27 条，落点必然在 T-08 之后；而测评域此前没有任何任务认领，不新增交接就只能把 R-41 塞进 T-08（破坏"纯搬迁"判据）或 T-07（放大凭据域的排他面） | `tools/ownership.json` 新增 `{"path":"packages/server/src/trpc/routers/assessment*.ts","owner":"T-08","predecessorAllowedDiff":...}` 与 `{"path":"apps/web/src/app/(user)/assess/page.tsx","owner":"T-25","maxDiffLines":8}`；`--check-ownership` 断言 T-25 对 `assess/page.tsx` 的 diff 不含新文案字符串字面量（文案仍归 T-03） |
| 9. `packages/server/src/db/**` + `db/migrations/**` + `src/scripts/migrate.ts` + `packages/shared/src/schema/tables.ts` **【P-9 新增交接，R-41/M7】** | 批次1/3 **T-06**（DDL 单一源 + 迁移框架 + A-32-1(b)/A-32-6 的 db 微轮 + A-28-2 自测探针删除）—— **本行成立的前提是 T-06 已合入 main 并把归属交回** | 批次4 **T-25**：🆕`007-assessment-cache-user-id.ts`、`tables.ts` 的 `assessmentCache.columns` 追加 `user_id` 与 `columnDdl()` 的"显式 DEFAULT 字面量"能力（**只加不删**）、`AssessmentDB.get/set` 签名加 `userId`、`sqlite.ts:112`/`pg.ts:146` 建表补列、`migrations/index.ts` + `scripts/migrate.ts:57` 追加注册 m007 | 迁移与 schema 源的写权本期集中在 T-06，这是 §10.3 的既有约束；R-41 必然要动同一批文件，故只能登记为"先后"而非"并行" | ① 000-006 六个迁移文件 T-25 零 diff；② `tables.ts` 的 diff 只允许出现在 `assessmentCache` 描述块与 `columnDdl()` 的**新增可选参数**上，且有专用例证明 M1-M6 生成语句逐字节不变；③ `db/**` 中除 `AssessmentDB` 三处方法（接口 + sqlite 实现 + pg 实现）外零 diff；④ 007 语句数组长度 = 1 且 `assertMigrationDiscipline()` 0 违规（回填即红）；⑤ `tools/ownership.json` 为上述四点各写一条断言，`--check-ownership` 在 CI 上按 commit 作者任务号校验。**【fix2 · A-35-5 就地补时序句（走 (b) 案；(a) 案"007 随批次3 先落"已被 A-33-2 的文件不相交硬判据否决）**】PRD v1.5 §6.4-2 **步 5c**（先迁移再起服）与其下游的**三次演练**（步 6b 三条 `ADD COLUMN` 的未回填/旧镜像可读演练、步 7 旧镜像回滚演练、**PRD §8.3-D 第 24 项**）**必须排在 `T-25`（007）合入之后**执行：`T-06` 微轮交回 `db/**` < `T-25` < `T-21` 判据⑧ < `T-24` 步 6b（A-33-2 的硬门禁），批次4 若 `T-25` 未合，`T-21` 判据⑧ 一律 **`exit 1` 而非降级跳过**（缺列就是缺列）。发布窗口内不得为了让演练"可跑"而提前插迁移 —— 那正是 A-33-2 否决 (a) 案的理由。 |

| 10. `packages/server/test/trpc-shape.baseline.json`（tRPC 形状快照基线 · **出口轮专用，不属于任何域任务**）**【fix3 新增交接行，依 A-36-13 + `04-dev-report-F2.md` §4-§5】** | 批次3 出口轮 **E3′**：**唯一一次再生已完成**（`TRPC_SHAPE_UPDATE=1` 全流程只出现 1 次），新基线 sha256 = `5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`，登记在 `04-dev-report-E3-prime.md` §4.2/§4.3（复跑不带 env 仍绿 ⇒ 未二次写盘）。**该文件本体一字节未由任何人手改**：`trpc-shape.spec.ts` 属禁区，改它不是"再生基线" | 批次4 **出口轮**（**不是**批次4 的任何一个域任务）：允许的**第二次也是最后一次**再生额度，且必须**另立裁决号**登记新的 `baseline-regenerate:<新裁决号>` 条目 —— **不得复用 `A-36-E3`**（那是 E3′ 的一次性授权，`tools/ownership.json` 的该条目 `note` 已写明）。任务级判据一律写成"与新基线形状一致"（§10.2 批次4 通用约束段第 ④⑤ 条） | 基线是**跨域共享的只读产物**：22（现 29）条 procedure 的形状全在里面，任何单个域任务单独再生都会把别的域尚未申报的形状变化一起"洗成合法"。故唯一安全的形态是"域任务只报差异、出口轮一次性再生"。F2 已把这条通道做成机检（新 kind，而不是给 `bounded-edit` 放宽 cap）—— 理由写在 F2 §4-A：**再生的窄性在"只准改哪几个文件"，不在"改了多少行"**，行数 cap 要么误红要么等于无上限授权 | **口径两条（照此跑才判绿）**：① 出口轮的 ownership 自证必须 `node tools/boundaries.mjs --check-ownership **--task E3** --diff-file <agent 自证 scoped patch>`，走动作通道 `baseline-regenerate:A-36-E3`（F2 §4-D 的四步：改前 `cp` 快照 → `TRPC_SHAPE_UPDATE=1` → `diff -u` 产 scoped patch → 判据），**不收 HEAD diff**（基线在 git 里是未跟踪件，HEAD 相对 diff 根本产不出它的账；同一口径由 A-36-13 追认："agent 自证 scoped patch，不收 HEAD diff"，E1c 已实装）。F2 §5 的三条红向对照已实测：换 `--task T-11` 红、混入清单外文件红、只点名不给 `--diff-file` 红。② **已知缺口（本轮不修，登记为批次5）**：以 **owner `T-08` 名义**查同一份文件会被 `checkOwnership` 的 **owner 短路**（`tools/boundaries.mjs:1572` 的 `if (owners.includes(opts.task)) continue;`）**绕过通道**、无 patch 也判绿 —— 这是**既有语义**，修它 = 改既有判据（F2 无权、架构师本轮也不动 `tools/**`）。F2 §9-拍板#1 已把它写成操作口径："基线再生的出口判据命令用 `--task E3`"，并建议另裁"生成物条目对 owner 也须走通道"。**归属**：该条建议记 **批次5**（与 A-36-10 的 `--copy` 扩面、A-36-16 的全仓格式化轮同批，须带疫苗：以 `--task T-08` 无 patch 查基线 → 修前绿、修后必红）。**本轮 E3′ 未自称 T-08**（其报告 §5 明写未走该号 ⇒ 未绕过通道） |

**交接的落地约束**：① 后动任务的**前置依赖列**（§10.2）已把对应先动任务列为前置，PM 排期不得解耦；② 每个交接点在 `tools/ownership.json` 里有对应 `{"path":..., "owner":..., "predecessorAllowedDiff":...}` 条目，`--check-ownership` 在 CI 上按 commit 作者任务号校验；③ 表中"零 diff"判据若被违反，处置是**退回该任务并修正归属表**，不是允许双方手工合并（RK-11 的即时判据）；④ **【P-9 新增】T-25 名下的新建文件 owner 一次登记清楚，避免后续任务抢认领**：🆕`packages/server/src/db/migrations/007-assessment-cache-user-id.ts`、🆕`packages/server/test/integration/assessment-isolation.spec.ts` = **T-25 独占**；`007` 一旦合入即转入"只读"（与 000-006 同规则，任何后续任务要改它 = 新登记一行交接，禁止就地追加语句）；`tools/ownership.json` 里这两条 `owner` 字段由 T-02 在出口轮按本表写入（T-25 自己不改 `tools/**`，见其"不得触碰"列）。⑤ **本表的行号 8、9 是 P-9 追加时显式编的号**，正文里"§10.4 第 8 行 / 第 9 行"的引用以该编号为准（前 7 行按表格顺序即第 1-7 行）。**【fix3 追加（原文保留）：行号 10 是本轮依 A-36-13 + `04-dev-report-F2.md` §4-§5 新增交接行时显式编的号，正文与报告里"§10.4 第 10 行"的引用以该编号为准；⑤ 那句"行号 8、9 由 P-9 编"一字未改】**

## 11. 给 PM 的阻塞反馈

**结论：对本期 ~~26 条 P0（R-01~R-24 + R-39 + R-40）~~ 【P-9 更正：PRD v1.4 后为 `27 条 P0（R-01~R-24 + R-39 + R-40 + R-41）`，本轮已把 R-41 补进 §10.2 排班（`T-25`）与 §6.1（`M7`），结论不变】无"技术不可行"阻塞项，全部按原验收判据进入开发，不降级、不裁剪、不延期。** 批次1（T-01/02/03/04/06）可在本文档定稿当日开工。

以下 ~~6 条~~ 【P-9 更正：F-5 就地更正 + 新增 F-7/F-8/F-9 → 共 **9 条**】【fix3 · A-36-4 末句登记 F-10（下一期欠账，**不占本期 27 条 P0**）+ 就地更新 F-7 → 共 **10 条**，F-1~F-10】是**需要 PM 拍板或知情的反馈项**（F-x），都不是"做不出来"，而是"设计选择了代价更小的一侧，代价要由产品承担并被记录"。每条给出理由 + 更优替代 + 替代的前提。

| # | 反馈 | 关联 | 架构师的判断 | 更优替代方案（需要 PM 决策的前提） |
|---|---|---|---|---|
| **F-1** | **注册/激活不验证手机号所有权**：任何人知道一个空密码账号的手机号，即可"激活认领"并接管它 | R-39 ⑤b（Q8' 定案）、TR-8、RK-05 | 现状**只能这么做**：短信通道未接，而 `createUser` 只存在于验证码分支（`trpc/router.ts:345`），不放开密码注册就没有新用户进门。设计已加三重限制：激活只命中 `password IS NULL OR trim=''`、K-1 配额（同 IP 注册 ≤5/日、激活 ≤20/日）、每次激活写 `account_audit_log` 可事后检索 | **短信通道一旦接入（R-26/R-30 的 P1 或下一版本专项）**，立刻补一条"注册/激活须验证码确认号主"，并把 `account_audit_log` 的 `account_activated` 记录做一次回溯清查。**建议 PM 同时收紧注册口**（灰度邀请码或对 F-1 单列公告），这是本期最大的残余风险，Q 类账号数量取决于 PRD §6.4-2 步 4 的线上实测 |
| **F-2** | **CSP 与首帧主题脚本相互锁死**：`Caddyfile` 现为 `script-src 'self' 'unsafe-inline' 'unsafe-eval'`（D-03），而 R-22 的"暗色不闪白"要求 `<head>` 内**同步内联脚本**（本文 §3.4） | R-22 ①②、D-03/B-03、S11、T-04、T-14 | 本期**不许在同一个发布窗口收紧 CSP**。现有 `'unsafe-inline'` 恰好让内联首帧脚本可用；若同期改 nonce/hash，Web 与 App 两处都要返工，且旧 WebView 对 nonce 支持不稳 | 把"CSP 去 `unsafe-eval`、清内联 JS"列为**下一版本独立专项**（审计 T4.2 已如此归类）。若 PM 坚持本期做：需先给 §3.4 的两处内联脚本改 `<script type="module" src>` + Next `next/script` 策略，判据 ④"首次导航即 `class="dark"`"会因异步加载而**不再可满足** → 等于牺牲 R-22 的一条硬判据，需明确取舍 |
| **F-3** | **`db/sqlite.ts` + `db/pg.ts` 两份手写驱动（1094 行）本期保留**，只做 DDL 单一源 + `ddl-parity.mjs` 对账（S5/TR-4） | R-39 ⑤b、R-40 ④、R-24 ④⑧ | 生产真值在 SQLite，引入 ORM 接管两张核心表 + `fsrs_cards.data` 序列化，是"为消灭重复代码而冒丢用户词本"的不对称赌注；本期 DoD 要的是"双驱动结果一致"，parity 脚本比 ORM 更贴合且可机器重跑 | 若 PM 接受把上线时间推后一个迭代：可做 Drizzle/Kysely 统一（预计额外 1~2 周 + 一次全量数据回归）。**架构师不建议**：DoD 已被 parity 脚本满足，ORM 属整洁性收益 |
| **F-4** | **`review-no-agent` 依赖规则在拆分前很可能现状即红**：`trpc/router.ts` 的 review 域现与 agent/LLM 逻辑同文件，depcruise（T-02，批次1）会先于 T-08（批次2）落地 | R-02 ①、本文 §3.5、§4.1 | 这是**既存缺陷被新门禁照出来**，不是新代码引入的问题。批次1 期间 CI 允许经 `tools/exceptions.json` 白名单放行该规则，T-08 合入后必须摘除白名单（T-08 完成判据含此条） | 无需替代方案。**需要 PM/测试预先知情**：批次1 的 `pnpm depcruise` 红灯不应被判定为"新缺陷"而回退任务；例外条目须带 `expires_after: T-08` |
| **F-5** | ~~**`assessment_cache` 缺 `user_id`（C-07）本期不修** → 跨用户题面与评分缓存互串的风险仍在~~ **【P-9 就地更正：本行的"本期不修"自 PRD v1.4 起失效 —— PM 已把该缺陷由 P1 R-28 提为第 27 条 P0 `R-41`，故它不再是"反馈项"而是本期必做项。架构师一侧的落点已补齐：§6.1 的 `M7` 迁移行 + §9 的 `RK-14` + §10.2 批次4 的 `T-25`（并在 §4.1/§6.1/§7.2/§10.3/§10.4 就地打戳）。原行右三列的论证保留如下，供追溯当时为什么不修，以及"修到什么程度"的边界】** | 审计 C-07 / ~~P1 R-28~~ → **P0 R-41 全条①~⑦**、§6.1 M7、§10.2 T-25、RK-14 | ~~该表与列的修补属 P1 范围，且要改缓存键（有失效风险）。本期 P0 无一条指向它，塞进本期会违反 PRD §6.4-7"唯一破坏性变更名额给 R-40"~~ → 更正后的判断：**"改缓存键"这件事本期不做**（`UNIQUE (word,qtype)` 是表级约束，SQLite 只能重建表才能删、PG 删约束落在迁移白名单之外，两驱动的删法还会分叉 → 见 §6.1「M7 的键设计说明」第 1 点），本期落地的是 **R-41③(b) 读路径属主过滤**：`user_id` 只加不删、全表初始 NULL、读侧对 NULL 与他人属主一律拒读、submit 未命中给 403 而非 500。这样做的代价是同一 `(word,qtype)` 上两人互挤一行 → 缓存命中率下降（**RK-14**），本期不省这笔钱。R-41 不占用 R-40 的破坏性变更名额（纯 `ADD COLUMN`，旧镜像不读该列仍跑） | 真隔离（每人一行）= **下一期**的四步键迁移（建新表带 `UNIQUE(user,word,qtype)` → 双写 → 切读 → 删旧表），本期禁止以"顺手"名义重建该表。**需要 PM 拍板的只剩两件**：① `RK-14` 的 LLM 成本上升是否接受（不接受就只有走上一句的下一期方案，本期即维持"读侧拒挤 + 偶发重生成"）；② ~~本期 release notes 是否仍要写"测评结果可能与他人混用"（**已不成立，应删**），改为写"测评题面缓存按属主隔离，旧库残留的无主题面一律不再复用（可能表现为重复出题一次）"~~ **【fix2 · A-35-6 就地更正：旧句式已升格为 PRD 禁词，本行不得再出现它，也不得作为取词来源】** release notes 的措辞**唯一口径 = PRD §6.6-4 第 6 条**，定稿句为：**"测评题面缓存按属主隔离；旧库残留的无主题面一律不再复用（可能表现为重复出题一次）。"** 禁词清单**见 PRD §6.6-4 第 6 条**（本行**不再复述其字面**，以免下游再次从技术设计取到旧句；上面 `~~…~~` 里那一处是 A-33-1 常设通道要求的"保留原文"痕迹，不构成可取词的正文）。**取词纪律**：写 `08-release-notes.md` 的人**只能从 PRD §6.6-4 取词，不得从本行取词**；配套机检 = 该文件门禁按 PRD §6.6-4 第 6 条的旧串清单 grep，命中即 `exit 1`（owner：**T-21 / T-24**，依 A-35-6）。事实层面也已不成立：R-41③ 定案为 (b) 读路径属主过滤，无主题行一律不复用、跨主行一律过滤（§10.2 T-25 判据③④、§6.1「M7 键设计说明」）。 |
| **F-6** | **备份与恢复有流程无告警**：每日 `backup-cron` 失败静默（D-04），本期用 `backups/manifest.json` + 发布前 `preflight` 强制读回最近成功时间，**但没有失败推送通道** | R-24 ③④、§6.3、RK-08 | 设计选择是"发布窗口内绝对阻断"（步 5 判据），上线后的日常告警缺一个外部通道（webhook/短信/邮件均无） | 请 PM 给一个**只出站的告警目标**（一个 webhook URL 或一封邮件即可）：接入量约 20 行、无兼容风险，若本期可加则纳入 T-21；不可加则维持"每次发布前人工读回"，并接受 RK-08 的"上线后 24 小时内修"承诺 |
| **F-7** 🆕 | ~~**`trpc-shape.baseline.json` 的"只增不改"审计在出参侧是零覆盖**~~ **【fix3 · A-36-2 + A-36-5 就地限定（原文保留）：这句自 E3′ 起只对「未挂 `output` parser 的过程」成立 —— `profile.*` 的出参面已经"从盲变可见"，基线也已换新（sha `5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`，旧值 `9cc6b319…` 作废），详见本行末的 fix3 更新段】**（P-5，本轮登记为**本期已知限制**）：`profile.get`/`profile.update`/`profile.stats`（以及测评等其余多数 procedure）在基线里记的是 `output: null` + `outputProbes[].probe = "(no-parser)"`（实证：`packages/server/test/trpc-shape.baseline.json:7060-7074`），即 **A-28-1 / A-30-2 的基线比对只钉住了 path 列表与入参形状，出参结构的变化它看不见** —— `profile.get` 从旧形状长成一个 13 键的 `ProfileDto`，基线**不会红** **【fix2 就地补范围与取证：① 该行号区间的完整写法是 `trpc-shape.baseline.json:7060-7083`（`profile.get` 条目，`"output": null` 在 `:7065`），本轮复核 `:7060-7074` 指向的是同一对象；② 基线里 22 条 procedure 的 `output` 轴**今天仍全部为 `null`**，因为出口 **E3 尚未再生基线**（A-35-14 排在 A-35-1① 之后）⇒ 本行说的"零覆盖"指的是**基线文件**的覆盖，不是实现的覆盖；③ 代码侧 `profile.get` 已挂闭合 `output` parser（`trpc/routers/profile.ts:60-68` + `:126`），故本行的适用范围已缩小为"**除 profile 系之外**的 procedure"】** | P-5（`04-dev-report-T-11.md` §9）、A-28-1、A-30-2、R-05②、R-04、T-08 判据①、T-25 判据⑨ | 根因：现状 procedure 普遍不写 `output` parser，tRPC 的 `unstable_getProcedureList()` 因此拿不到出参 schema，探针只能记 `(no-parser)`。~~**本期不动实现**（给几十个 procedure 补 output parser 是一次跨域签名变更，会把 T-08 的"纯搬迁零行为变更"变成"改行为"）~~ **【fix2 · A-34-1/A-35-1⑤ 就地更正：这句自 A-34-1 起失效，见本节末"更正后的口径"与 §3.3.2】**。**替代证据已成立**：出参等值性由 **`ProfileDtoSchema.safeParse` 的双侧用例**保证（T-11 报告 §2 判据①，`packages/server/test/integration/profile-dto.spec.ts:184/188-196` —— 服务端返回与客户端解析同一 zod 契约，两侧都过才算通过），测评域按 T-25 判据⑨ 补同形用例。故"出参看不见"不构成 DoD 缺口，但**构成审计口径缺口**：凡引用"baseline 只增不改"作为出参证明的地方，一律改引上述 safeParse 用例（profile 系另有 `profile-output-parser.spec.ts` 的键集合钉 + 咬合用例，`A-34-1② 判据一/二` 两组 describe）。 | ~~**给 procedure 补 `output` parser 属下一期**（届时 baseline 才有真正的出参面）~~ **【fix2 · A-34-1/A-35-1⑤：这句同样已被推翻一半】** → **更正后的口径（本节唯一有效口径）**：**凡 `@tm/shared` 已有 DTO 且已有双侧 `safeParse` 用例的过程，必须挂闭合 `output` parser**；**第一批 = `profile.get`**（已落地，见 §3.3.2 与判据链）；**没有 DTO 的过程先回 shared 定契约**（owner T-03）再挂，**禁止**在 router 里就地发明形状；**禁止**用客户端 `as number` / 局部 cast 把 `unknown` 糊过去（A-34-1⑤）。**"本期普遍不补 parser"不再是本期事实**，也不得被下游读成永久规则（PM 已在 PRD §8.3-0 定稿②写下同一条限制说明）。PM 侧登记仍保留两件：① 验收/审计口径那句"trpc 形状基线不覆盖出参，出参一致性另有 DTO 用例"（v1.5 已写）；② 基线再生归出口 **E3**（A-35-14），**架构师本轮未动基线**。 **【fix3 · A-36-2 + A-36-5 + E3′ 结果就地更新（上面两件登记的第二件已被本轮事实取代，原文保留）：① 基线**已再生**，由批次3 收口硬门禁 **E3′** 花掉批次3 唯一一次额度，新基线 sha256 = `5d89760c07f2dd05b5e34ab2411b9580d52fe1bbd582593c2329a5b80f4e1f72`（旧值 `9cc6b3191dc34f5cc314568ab6db9018a7098c8ece91d27f57a7c360e5048dd7` 自本行起仅作历史参照，见 `04-dev-report-E3-prime.md` §1.2/§4.2）；② `profile.get` 的出参轴**已从盲变可见** —— 基线该轴由 `output: null` 变为一把闭合 `ProfileGetOutputSchema`（13 键、`unknownKeys='strip'`），探针轴同步从 `(no-parser)` 变为有真实 schema 指纹，`nMiddlewares` 2→3 的新增项逐字 = `outputValidatorMiddleware`（**A-36-2** 的例外，不是新缺陷）；`profile.update` 三键差异含 **A-36-1** 的别名键域例外；`auth.login`/`auth.sendCode` 两过程**逐字节 0 行** ⇒ A-36-#3/#4 的回环修有可观测证据；③ 因此"**基线不覆盖出参**"这句**只对未挂 parser 的过程成立**（其余多数 procedure 至今 `output: null` + `(no-parser)`），凡引用这句的地方都要限定到这个子集，不得再当成全表面事实；④ "未声明键也能出现在响应里"这类下游依赖**不再由基线覆盖**，它的保护 = `packages/server/test/integration/profile-output-parser.spec.ts` 的 **A-35-1② 键集合钉四支**（E3′ 报告 §8 已按要求显式复述，再生后实跑全绿）—— QA 不得把"基线看不见"读成"没人守"；⑤ 本行新基线的核对口径与批次4 的额度/时序见 §3.3.2 末行与 §10.2「批次4 通用约束」段。】 |
| **F-8** 🆕 | **PRD §6.4-2 的部署步骤清单缺一步"部署/起服前先 `pnpm db:migrate`"**（A-32-1(a) 的文档侧后果）：§6.4-2 现列 12 步，步 6/6b/7 覆盖了新列的取数与演练，但**没有任何一步显式要求在新库上先执行迁移再启服务**。事实是未迁移库上 `/api/login`、`/api/register` 整片 500（R-40 两列 + 本期新增的 `account_audit_log` 都缺），这是本期唯一破坏性变更的落地路径 | A-32-1(a)、R-40 ⑤、R-41 ①、§10.2 T-07 判据⑦（本轮已就地更正为 `pnpm db:migrate && pnpm --filter @tm/server dev`）、T-06 的 fail-fast（A-32-1(b)）、T-21 的 `preflight` | **文档侧已补齐，代码侧不需要新增东西**：本文档的 T-07 判据⑦ 自带迁移前置；T-06 提供"未迁移即启动失败并打印缺失迁移名"的 fail-fast（**属主 T-06，不在本轮改动范围**）；T-21 的 `preflight --step 3` 在预发实测前会先读 schema 版本。三条叠加后，"忘跑迁移"会被机器挡住 —— 但**PRD 的清单是运维与人读的那一份**，缺这一步就是发布窗口里的真实操作风险 | **请 PM 在 PRD §6.4-2 里补一步**（建议插在现"步 5 快照"之后、"步 6 恢复演练"之前，因为恢复出来的库也要迁移才可用，且步 6b 的新列取数本身就依赖迁移）：`⑥ 在预发/生产库副本上执行 pnpm db:migrate 并用 migrate --status 确认 000~006（+M7 的 007）全部已应用，再启服务`。同时建议把 §6.4-2 步 6b 的"两条 `ADD COLUMN`"扩成**三条**（M1/M4 + 007 的 `assessment_cache.user_id`），否则 R-41 的新列不在演练覆盖里 —— 这一点已在 §10.2 T-21 判据⑧ 与 T-25 判据②③⑩ 侧兜住，但**PRD 清单缺一项会让人误以为已演练** |
| **F-9** 🆕 | **PRD 有两处假设"测评有 REST 与 tRPC 两个入口"，仓内事实是没有 REST 入口**：① **R-41②** 要求"两个入口都要过滤"；② **R-24①** 要求 CI 跑"R-41 的隔离用例…**双驱动 × REST/tRPC 四遍一致**"。事实是 `grep -in "assess" packages/server/src/app.ts packages/server/src/routes/*.ts` = **0 命中**，测评只有 `trpc/routers/assessment.ts` + `assessment-parts.ts` 两个文件与单一 DB 读路径 | R-41 ②、R-24 ①、§10.2 T-25 判据⑧、本文 §4.1 | R-41② 在本期**退化为"tRPC 单入口 + 单一读点过滤"**，R-24① 的"四遍"实际是**双驱动 × tRPC 两遍**（外加 REST 侧 0 命中的取证），不是漏做，是**没有第二个入口可漏**。T-25 判据⑧ 把该事实固化成一条取证（现状与本任务后均 0 命中），防止 QA 按"REST 侧未验"判缺陷、也防止有人为凑判据顺手加一个 REST 门面（加门面必然改 `app.ts` = T-07 独占，直接违反排班） | **请 PM 把 PRD R-41② 与 R-24① 同批更正**：R-41② 改为"缓存读写的属主过滤覆盖测评的**全部实际入口**（本期 = tRPC `assessment.*` 三个 procedure + `AssessmentDB.get/set`），并附入口清单取证；若未来新增 REST 门面则同步纳入"；R-24① 的"REST/tRPC 四遍一致"改为"**实际入口** × 双驱动一致"。若 PM 确实要求本期就有 REST 门面，那是**新增范围**，需回 §10.2 排班并让 T-07 让出 `app.ts` 的一次装配位，不能塞进 T-25 |
| **F-10** 🆕 | **zod **input** 校验失败在 tRPC 门面上今天仍然是"把 issues 序列化成 message"，本期只还原了人话串、没有收敛门面**：A-36-#4 的修法做到的是"两条 message 回到与基线改动前逐字相同的人话、码串不再充当 message"，但**机制本身没变** —— tRPC v11.18 对 input parser 抛错只 `new TRPCError({ code:'BAD_REQUEST', cause })`、不传 message（`node_modules/.pnpm/@trpc+server@11.18.0_typescript@5.9.3/node_modules/@trpc/server/dist/initTRPC-BRf4imah.mjs:44-46`），于是 `TRPCError.message` 取 `cause.message` = `ZodError` 的 issues 序列化串；前端 `apps/web/src/components/login-dialog.tsx:50/:67` 是 `toast.error(err.message)`，**弹给用户的就是那一坨**。本期把 message 换成人话后它"看起来对"，但同一 schema 一旦有多个 issue、或字段名/路径变化，用户看到的仍是 JSON 结构而不是 §4.6 那套 `{error, code}` 文案 | **A-36-4 末句（TPM 明记"另记一条下一期欠账，不进本期 27 条"）**、§3.3.1 的 A-36-4 口径块、§4.6（`{error, code}` 契约）、A-30-1（**output/服务端**侧的 `errorFormatter` 已做，缺的是 **input 解析失败**这一条路径）、T-07（`trpc/init.ts` owner）、T-16（前端消费方） | **诚实登记，不粉饰**：本期**不改**。理由三条：① 这不是本期引入的（改动前就如此，A-36-#4 的定性是"码串充当文案 = bug"，人话已还原，故不构成缺陷回环的未修项）；② 正经修法要给 `trpc/init.ts` 的 `errorFormatter` 加一条"input 解析失败 ⇒ 统一映射成 §4.6 的人话体 `{error, code}`"的分支，那是**跨全域门面的错误体形状变更**，会同时打穿 `trpc-shape` 的探针指纹面（A-28-1）与 legacy-apk 契约快照（R-03①⑦），必须配自己的基线例外申报与再生额度，不能搭批次4 的顺风车；③ 本期剩余额度只有批次4 出口轮那**一次**（§10.2 批次4 通用约束段第 ⑤ 条）。**对下游的可操作口径**：谁在本期给任何 procedure 新增 zod input 约束，**必须**同时给它一个"人话 message 具名常量"（照 `contracts/auth.ts` 的 `phoneSchema(message)` 形态），不许把码串、也不许让默认 issue 串成为唯一出口 | **下一期专项（建议随 §4.6 门面收敛一起做）**：把 tRPC 面的 input 校验失败统一映射为 `{error, code}` 人话体，使 REST 与 tRPC 两扇门在"校验失败"这一支也逐字等值（现在只有服务端主动抛的码等值，A-35-9 的限定与此同源）。**前置**：① 先申报 `trpc-shape` 探针面的基线例外（这是 message 轴的成批变化，正是 A-36-5 说的"动手前申报"）；② 与 A-36-10 的禁词 grep 扩面、A-36-16 的全仓格式化轮同批排在批次5 之后，避免 diff 对账失效；③ 疫苗 = 一支"给同一字段造两个 issue，用户面 message 仍是一句人话且不含 JSON 结构字符"的用例。**需要 PM 拍板**：F-10 是否列为下一期 P0（架构师建议列 P1 起步，因为它只影响"多个 issue 同时命中"这一低频路径，本期已还原的两条串是真机可见路径） |

**PM 侧必须提供、否则相应清单项无法关闭的依赖**（这些不是设计缺陷，是排期输入）：

1. **PRD §6.4-2 步 4 的 N/M/K/P/Q 与前后行数快照必须在真实生产库上实测**。本地 `data.db` 的"23 账号 / 16 空密码"已被 PRD §9-3 判定为 smoke-test 造数，**禁止**出现在公告、清单报告或验收材料里（`account-audit.mjs` 会打印库名与执行时间以供复核）。P0 公告的具体人数在 T-21 交付前只能写"若干"。
2. **步 9 的 2 台真机（原生 Android + 小米）与"旧 APK 两个用例"是人工签字项**，无法自动化：需要设备 + 已安装的旧版 APK + 一个可登录的弱口令测试账号。R-17 ⑤/R-20 ⑦ 的通过判定以此为准。
3. **PRD §8.2 / §8.3-A~D 走查判据需人肉跑通一遍**（尤其 R-34 的无障碍项虽为 P1，走查清单本身在 P0 页面上就要能人工执行）；T-12/T-15/T-16/T-18/T-19 各自交付 e2e 用例，但视觉与文案手感以走查为准。
4. **发布窗口内不得出现的两件事**：重建 `keystore.jks`（必须复用 CI secret 里那份现存签名密钥，否则存量用户无法覆盖安装 → 已登记 RK-13，并要求 PM/运维确认"仓库外双备份"的存放位置与访问人）、任何指向"忘记密码/找回密码/以后再说"的界面文案（全站 grep 判据，见 T-16）。
5. **一次真实回滚演练的时间盒**：PRD §6.4-2 步 7 要求"旧镜像连新 schema 库"真跑一次，需要预发环境一个可支配的 2 小时窗口（`restore-drill.mjs --rollback`，T-21）。
6. **【P-9 新增】R-41 在 PRD 的验收清单侧还没有可勾项**：它是第 27 条 P0，但 PRD §8.2 走查八项与 §8.3-A~D 是**按 v1.3 的 26 条写的**，没有一条指向"两账号交叉测评同一词互不看到对方题面 / 旧库无主题面不被复用"。设计侧的判据已完整（本文 §10.2 T-25 判据②③④⑦⑩ + §6.1 M7），缺的是**人工/走查侧那一条**。架构师建议加在 **§8.3-D**（纯后端语义、两个测试账号即可机器判，不必占 §8.2 的 UI 走查位），并同步在 §6.4-2 步 6b 把"两条 `ADD COLUMN`"改为"三条"（见 F-8）。**PM 若同意，请回 PRD 补这两处；若认为不该由 UAT 判，请明确写一句"R-41 以 T-25 的集成用例为唯一验收证据"**，否则 Phase 7 会出现"P0 条目无验收项"的形式缺陷。**【fix2 就地更新：本条已被 PM 关闭 —— PRD v1.5 已按建议把验收项加在 §8.3-D（**第 24 项**），并把步 6b 扩为三条 `ADD COLUMN`；对应时序约束记在 §10.4 第 9 行的 A-35-5 戳里（三次演练 + 第 24 项必须排在 T-25 合入之后）】**

**若 PM 对上述任一条不认可，唯一需要架构师返工的是 ~~F-2（CSP）与 F-5（把 R-28 提前）~~ 【P-9 更正：F-5 已在本轮由"是否提前"变为"已排班落地"，故返工点只剩 **F-2（CSP）**；新增的 F-7/F-8/F-9 都不需要架构师返工，它们要的是 PM 在 PRD 侧的一次措辞更正（F-9 的入口清单、F-8 的 §6.4-2 补一步、F-7 的审计口径注明"基线不含出参"）**【fix3 · A-36-2 / A-36-4 就地限定（原文保留）：这句里的"基线不含出参"自 E3′ 起只对**未挂 `output` parser 的过程**成立（`profile.*` 已可见、新基线 sha `5d89760c…`），PM 在 PRD 侧沿用那句时必须带这个限定；另 F-10 是本轮新登记的第 10 条，属**下一期**门面收敛，不需要架构师本期返工，也不需要 PM 改任何判据，只要它别在下一轮被读成"本期已收敛"】**；新增的 F-10 同样只要 PM 知情（它要的是下一期立项，见该行末列）**，若 PM 反向要求本期就做"真隔离键迁移 / ~~补 output parser~~ / 加 REST 门面"三件事中的任意一件，则回本文档重排 §6.1 与 §10.2**】 —— 前两者都会改变本文 §3.4 / §6.1 的条款；其余各项的替代方案均已写清且不影响 §10 的任务边界。**【fix2 · A-34-1/A-35-1⑤ 就地更正：上面这句里"补 output parser"已从"PM 反向要求才做"变成"本期口径已定且 `profile.get` 已落地"，故三件事中只剩"真隔离键迁移"与"加 REST 门面"两件仍属需 PM 反向要求才重排的范围；见 §3.3.2 与 F-7 的更正条】**
