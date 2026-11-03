# 明日记忆 · 重构前技术审计报告

> 审计员产出，供架构师 / PM 直接引用。方法：**只读调研**（Read/Grep/git），未改动任何业务代码。
> 基线：工作树 clean，`TEST-REPORT.md` 标注"已修"的项经 `git log`/`git grep` 复核**确已提交**，本审计针对当前 `HEAD` 现状。
> 线上现状：`tmword.xyz` 承载真实用户数据 —— 任何破坏性改动 / 数据迁移 / 接口下线均为高风险，本文对红线单列（第 6 节）。

---

## 1. 执行摘要（Top findings，按 风险 × 收益 排序）

| # | 结论 | 严重度 | 证据 | 为何排前 |
|---|------|--------|------|---------|
| S1 | **生产验证码登录实际不可用**：`sendSMS` 是占位桩，只 `console.log` 并 `return true`，无任何短信商接入 | P0 | `packages/server/src/services/sms.ts:54-60` | 影响真实用户能否登录；重构若默认"验证码可登录"将全线失效 |
| S2 | **同一"评分"动作存在两条分叉服务路径**：REST `/api/review` 跑完整 LLM 编排，tRPC `reviewCard` 直接 `applyRating`，FSRS 结果与成本都不一致（web 走 tRPC、app 走 REST） | P0 | `packages/server/src/routes/review.ts:60` ↔ `packages/server/src/trpc/router.ts:193` | 双端学习数据同源却算出不同调度，是重构必须先定夺的契约点 |
| S3 | **单词本写模型三端冲突**：app 离线整数组 `PUT` 覆盖，web 增量 tRPC `add/remove` 读-改-写且无并发锁 → 跨设备后写覆盖丢词 | P0 | `packages/server/src/routes/wordbook.ts:18-39`、`router.ts:126-155`、`mobile-memory/assets/api.js:161-200` | 直接威胁用户数据完整性，属数据红线 |
| S4 | **Web 头像上传必失败**：tRPC `profile.update` 限 `avatar.max(500)`，REST 侧却允许 `200_000`；web 走 tRPC 传 base64 必 500 | P1 | `packages/server/src/trpc/router.ts:259` ↔ `routes/profile.ts:40` | 高频可见 bug，React 化前须统一 |
| S5 | **移动端 init 中途抛 ReferenceError**：`renderRecent()` 全项目未定义，中断冷启动 wordbook 同步 / visibilitychange 监听 / 小组件聚焦 | P1 | `mobile-memory/assets/app.js:994`（`grep renderRecent` 仅此一处，无定义） | 静默破坏移动端启动路径，重构前是活雷 |
| S6 | **Web 移动端无导航**：header 6 个导航 `hidden md:flex` 无小屏兜底菜单 → 手机浏览器进不去 study/assess/report/chat/profile | P1 | `apps/web/src/components/header.tsx:61` | 响应式硬缺陷，与"移动 React 化"目标直接冲突 |
| S7 | **APK 构建链未纳入版本控制**：`.gitignore` 通配 `*.sh/*.py` 吞掉 `build-apk.sh`、`assemble_apk.py` → 新克隆无法复现打包 | P1 | `.gitignore`（`git ls-files` 确认未跟踪）、`mobile-memory/build-apk.sh` | 影响可交付性/可复现性 |
| S8 | **HITL checkpoint 未按用户隔离**：`threaded.invoke(threadId)` 用全局裸 threadId 做 MemorySaver key，未加 userId 前缀 → 跨用户中断态串扰 | P1 | `packages/server/src/routes/chat.ts:128`、`packages/agent/src/threaded.ts:64,72` | 安全/隔离问题，改动小收益高 |
| S9 | **SSE 订阅链路不带鉴权**：tRPC `httpSubscriptionLink` 未挂 `Authorization`，仅 `httpBatchLink` 挂；chat WS 把 token 放 URL query | P1 | `apps/web/src/components/providers.tsx:35`、`apps/web/src/app/(user)/chat/page.tsx:79` | token 进日志/Referer + 流式无鉴权 |
| S10 | **CI 未跑真实测试**：`ci.yml` Test 步骤是 `echo "smoke placeholder"`，`mobile-memory/tests/*.mjs`、vitest 均未接入 → 重构回归无护栏 | P1 | `.github/workflows/ci.yml`（Test step） | 重构期最大的隐性风险：改坏了 CI 不拦 |

> 补充：以下已复核为"已修/已加固"，本次不作为缺陷，但重构须保持不回退：JWT_SECRET 启动强校验（`index.ts:40-51`）、静态根目录禁指向仓库根（`config.ts:113-117`）、万能码仅非生产+显式配置（`router.ts:336-337`）、pg int8 归一化（`db/index.ts:28`）、WS 无 token 拒绝（`chat.ts:99-101`）。

---

## 2. 问题清单（分域）

格式：`编号 | 严重度 | 证据(文件:行) | 现状与后果 | 建议方向`

### A. 前端 Web（`apps/web`）

| 编号 | 级别 | 证据 | 现状与后果 | 建议方向 |
|------|------|------|-----------|---------|
| A-01 | P1 | `components/header.tsx:61` | 主导航 `hidden md:flex`，<md 无任何替代入口 → 手机浏览器无法到达 5 个二级页 | 加移动汉堡菜单或底部 Tab；与移动 React 化共用一套导航 |
| A-02 | P1 | `app/(user)/study/page.tsx:133-137` | `advance()` 只要 `authed` 就 `reviewCard.mutate`，**无视 ordered/random 模式**也写 FSRS；且 web 仅发 rating 1/3，app 发 1-4 | 仅 FSRS 模式评分；统一 1-4 语义；模式判定入参 |
| A-03 | P1 | `app/(user)/study/page.tsx:92-128` | 释义预取用裸 `fetch('/api/lookup')` **逐条串行**（for+await），绕过 tRPC/React Query → N 次串行往返 | 改 `trpc.dictionaries` 批量/并发 + React Query 缓存 |
| A-04 | P1 | `app/(user)/chat/page.tsx:79,83-85` | WS token 进 URL query（日志/Referer 泄漏）；`onclose` 无自动重连，断线即停 | 首帧鉴权帧携带 token；指数退避重连 |
| A-05 | P1 | `components/providers.tsx:33-42` | `splitLink` 中 `httpSubscriptionLink`（SSE）未附 `Authorization`，仅 batch link 附 → 流式请求不带身份 | subscription link 也加 headers/auth |
| A-06 | P2 | `app/(user)/admin/page.tsx:35,61`、`profile/page.tsx`、`study/page.tsx:100` | 多处混用裸 REST；admin 另存 `tm_admin_token` 本地态；本地 `AdminStats/AdminUser` 重复定义；`handleFetchError` 有死码 `void t;` | 统一到 tRPC + shared 类型 |
| A-07 | P2 | `app/(user)/word/[word]/page.tsx:35` + `generateStaticParams` | 硬编码 200 词 SSG + `revalidate=3600`，但页面渲染实时拉取 `<WordLookup>` → ISR 形同虚设（PERF-01 残留） | 要么真 SSG 缓存内容，要么去掉静态化 |
| A-08 | P2 | `components/flashcard.tsx`、`word-lookup.tsx`、`app/(user)/page.tsx`、`assess/page.tsx` | `speak()` 复制 4 份；en 结果渲染在首页与 word-lookup 重复 | 抽 `useSpeak` hook + `<EnResultView>` 共享组件（React 化后沉到 `packages/ui`） |
| A-09 | P2 | `app/globals.css` + `tailwind.config.ts` | `brand-*` 色阶定义但**未用**，真实主题走 shadcn `primary` hsl var → 两处真相；`flip-in` keyframe 未用而 flashcard 用裸 CSS；无 spacing/shadow/motion token；theme-provider 在 `useEffect` 切 dark → FOUC | 收敛为单一设计 token 源；暗色用 `suppressHydrationWarning`+内联脚本 |
| A-10 | P2 | `lib/auth.ts:5` | token 存 `localStorage`（`tm_token`），XSS 可窃；靠 `tm-auth-changed`+`storage` 事件跨标签同步 | 迁移 httpOnly Cookie，或缩短 TTL + 收紧 CSP |
| A-11 | P2 | `components/wordbook-sidebar.tsx:94` | 侧栏 `hidden lg:flex`，user-shell 浮动展开按钮在 <lg 点了面板也不出现 | <lg 改抽屉/全屏面板 |

### B. 移动端 App（`mobile-memory`，WebView + 手写 JS）

| 编号 | 级别 | 证据 | 现状与后果 | 建议方向 |
|------|------|------|-----------|---------|
| B-01 | P0/P1 | `assets/app.js:994`（全项目 `renderRecent` 仅此前向引用、无定义） | `init()` 调未定义函数抛 ReferenceError，**中断其后所有步骤**：冷启动 wordbook 同步、`visibilitychange` 监听（MainActivity `onResume` 派发的事件无人接）、小组件聚焦 | 删除或实现 `renderRecent`；`init` 每步 try/catch 隔离，避免一处崩全局 |
| B-02 | P1 | `assets/api.js:161-200` | 离线以本地 `wbCache` 为准 + 序号队列 + **整数组 `PUT` 合并**，与 web 增量 tRPC 语义互斥（见 C-03）→ 跨端互相覆盖 | 移动改增量同步协议（带 updated_at/version 的 upsert/delete op） |
| B-03 | P1 | `assets/app.js:180,389,456` | 内联 `onclick="doLookup('${...}')"`、`style="url('${pf.avatar}')"` 未转义 → 属性/CSS 注入 XSS 面 | 事件委托绑定；`CSS.escape`/URL 白名单；禁 `unsafe-inline`（配合 D-03） |
| B-04 | P1 | `assets/app.js:24,39,47`（`pageStack/goto/goBack`）、通篇 `innerHTML` 全量重绘、全局可变 `RV/curPage/wbMode` | 无框架、手写栈路由，状态漂移/内存泄漏风险，可维护性差 | 本次重构核心目标：React 化并与 web 共用组件 |
| B-05 | P2 | `mobile-memory/docs/TEST-REPORT.md`（缺 assess/report/chat/AI-streaming） | 功能集与 web 不对齐，双端体验割裂 | React 化时以 web 页面为对齐基线补齐 |
| B-06 | P2 | `assets/index.html`（`user-scalable=no`、`?v=1101`）、`AndroidManifest.xml`（`allowBackup="true"`、仅 LAUNCHER） | 缩放禁用伤无障碍；手动 cache-bust 易漏；token 可随系统备份外泄；无深链 | 允许缩放、内容哈希命名、`allowBackup=false` 或备份排除 prefs |
| B-07 | P2 | `src/com/tomorrow/memory/MainActivity.java`（`file://` origin、`addJavascriptInterface`、`onPageFinished` 重注 token） | 桥接可行但安全面取决于 JS 注入；file:// 下 Cookie/CORS 受限 | React 化保留 Bridge，评估 `WebMessageListener` 替代 |
| B-08 | P2 | `build-apk.sh`（头部仍写"明日日程"、keystore 口令明文硬编码、绝对 `E:/android-build` 路径） | 复制粘贴残留 + 硬编码密钥 + 不可移植路径 | 口令入环境变量/CI secret；路径参数化；与 D-01 一并入库 |

### C. 后端（`packages/server`、`agent`、`shared`）

| 编号 | 级别 | 证据 | 现状与后果 | 建议方向 |
|------|------|------|-----------|---------|
| C-01 | P0 | `services/sms.ts:54-60`（TODO `:52-53`） | 无真实短信商，`return true` + 非生产才打印 → **生产验证码登录拿不到码**，仅剩密码登录/开发万能码 | 接入阿里云/腾讯云/云片；上线前明确登录主路径 |
| C-02 | P0 | `routes/review.ts:60`（`runAgent(...'测评 ${word} ${rating} 分')`）↔ `trpc/router.ts:193`（直接 `applyRating`） | 同一"评分"两实现：REST 触发 LLM 编排（慢/贵/含随机），tRPC 纯计算 → 双端 FSRS 调度不一致 + 无谓 token 成本 | 抽出唯一 `review` service；REST 变薄封装，评分不得进 LLM 环 |
| C-03 | P0 | `routes/wordbook.ts:18-39`（整数组替换，上限 20000）、`trpc/router.ts:126-155`（add/remove 读-改-写全量无锁） | 无并发控制 + 两种写入模型 → 竞态丢词、跨端覆盖 | 收敛为增量 upsert/delete + 乐观锁/updated_at 比较 |
| C-04 | P1 | `trpc/router.ts:259` `avatar: z.string().max(500)` ↔ `routes/profile.ts:40` `> 200_000`（注释自称"与 tRPC 对齐"实为矛盾） | Web（tRPC）上传任何 base64 头像必 413/500；REST（app）可 200K | 统一上限；根治：头像走对象存储存 URL，库里不存 base64 |
| C-05 | P1 | `trpc/router.ts:277` `password.min(4)` 无旧密码校验；`router.ts:352`、`routes/auth.ts:102` `expiresIn:'30d'` 无吊销 | 弱口令 + 改密不验旧 + 旧 token 30 天不失效且无法撤销（改密/登出后仍可用） | min(8) + oldPassword + token 版本 claims/黑名单 |
| C-06 | P1 | `routes/chat.ts:128`、`agent/threaded.ts:64,72`（`thread_id: threadId`） | MemorySaver checkpoint 按裸 threadId 全局 key，未加 userId → 猜中/复用他人 threadId 可读写其 HITL 中断态 | `thread_id = \`${userId}:${threadId}\`` |
| C-07 | P1 | `trpc/router.ts:499` `assessment.get(word, type)`（DDL 亦无 user_id） | assessment_cache 无用户维度（ASSESS-01 未修）→ 跨用户题目/评分缓存互串 | 缓存键加 user_id，表加列+索引 |
| C-08 | P1 | `trpc/router.ts:296` `throw new Error('请 60 秒后再试')` | 冷却分支抛裸 Error → tRPC 归 500，前端拿到通用错误而非限流提示（其余分支已用 TRPCError） | 改 `TRPCError({code:'TOO_MANY_REQUESTS'})` |
| C-09 | P2 | `routes/auth.ts` ↔ `router.ts` `auth` 域 | send-code/login/me/密码**两套实现**，限流键、错误码、发码失败是否消费 code 语义不一致 | 抽公共 auth service，两端仅做协议适配 |
| C-10 | P2 | `db/pg.ts:494-498`（仅 `CREATE IF NOT EXISTS`）↔ `db/sqlite.ts:513-525`（有 `ALTER ADD COLUMN` 自愈） | PG 无列迁移 → schema drift；两驱动 DDL 各自硬编码（`:34-109`）易漂移 | 统一迁移框架（drizzle/knex-migrate）+ 声明式 schema |
| C-11 | P2 | `db/pg.ts:506-521`（本地 `computeStreakFromRows`） | PG 连胜用本地实现而非 `shared.computeStreak` → 与 sqlite 结果漂移（REL 类） | 复用 shared 纯函数 |
| C-12 | P2 | `db/sqlite.ts:182-210`、`db/pg.ts:166-191` | `saveData` 对**每条**单词本项都 upsert 一张 FSRS 卡（O(n) 写放大，每 add 触发全量） | 只写 diff；批量事务 |
| C-13 | P2 | `middleware/rate-limit.ts:46`、`services/auth-policy.ts`、`services/sms.ts` codeStore | 限流桶/验证码/失败锁均进程内存：重启丢、多实例不共享、按 IP 键无上限保留至 24h（潜在增长） | 迁 Redis（已有依赖） |
| C-14 | P2 | `routes/lookup.ts:37-39` | 读 `c.get('userId')` 但 `/api/lookup` 未挂 auth 中间件 → 事件 `user_id` 恒 0（web study 直连该口） | 挂可选鉴权中间件，登录用户回填真实 id |
| C-15 | P2 | `services/analyst.ts:120,186` | `analyze()` 先 `getCardsByUser`，`fromDbState` 内又查一次 → 全量扫两遍；dataset 每次重算仅 insights 缓存 | 传参复用；dataset 缓存 |
| C-16 | P2 | `config.ts:83`（硬编码 pg 连接串默认值）、`:106` `corsOrigin='*'` | 默认值含真实凭据形态；生产 CORS 全放 | 生产禁默认、CORS 显式白名单 |
| C-17 | P2 | `app.ts:94-95`（`/metrics` 公开） | 指标端点无鉴权（SEC-07 残留） | 加 auth 或仅内网/Caddy 屏蔽 |
| C-18 | P2 | `app.ts:75`（bodyLimit 200KB）、`onError` 通用 500 | 头像 base64 上限 200K 与 profile REST 200_000 字符（≈266KB base64）临界冲突；错误吞细节 | 统一请求体上限策略；错误分级 |

### D. 工程化与交付（CI/CD、构建、静态资源、契约）

| 编号 | 级别 | 证据 | 现状与后果 | 建议方向 |
|------|------|------|-----------|---------|
| D-01 | P1 | `.gitignore`（通配 `*.py`/`*.sh`）、`git ls-files`（`mobile-memory/build-apk.sh`、`scripts/assemble_apk.py`、`mobile-agenda/*`、`docs/tools/md2pdf.py` 未跟踪） | APK 构建链与工具脚本**不在仓库** → 新克隆无法复现打包（大 DB/zip 正确未跟踪） | 精准反向忽略（`!mobile-memory/**/build-apk.sh` 等）并入版本 |
| D-02 | P1 | `.github/workflows/ci.yml`（Test = `echo "smoke placeholder"`） | 已有 `mobile-memory/tests/*.mjs`、vitest 未接入 → 重构无回归护栏 | `pnpm -r test`；类型/lint/单测/e2e 分级门禁 |
| D-03 | P2 | `Caddyfile`（`script-src 'self' 'unsafe-inline' 'unsafe-eval'`） | CSP 弱化，且**锁死** B-03 内联 JS 无法收口（内联 onclick 依赖 unsafe-inline） | 去 unsafe-eval；改 nonce/hash；先清内联 JS |
| D-04 | P2 | `services/backup.ts`（仅 `pg_dump` 自定义格式，无 SQLite 分支） | 若生产用 SQLite 则**无备份**；即便 pg 也依赖作业被调度 | 补 SQLite `VACUUM INTO`；备份纳入部署校验 |
| D-05 | P2 | `app.ts:153`（`/admin`→`public/admin.html`）、`public/script.js` | 并存三套前端面：Next `/admin` + 旧 `admin.html` + legacy 站点脚本 → 行为分叉、攻击面翻倍 | 删 legacy，只保留 Next 实现 |
| D-06 | P2 | `deploy.yml`（GHCR build/push → SSH → `/metrics` healthcheck → 镜像 tag 回滚） | 回滚只回代码镜像，**不回滚数据库**（见第 6 节红线） | 迁移需向后兼容；部署前强制快照 |
| D-07 | P2 | `packages/shared/src/types.ts:1` 索引签名 `[key:string]:unknown`；types 为 TS-only，`mobile-memory` 纯 JS 不导入 | "三端共用契约"名不副实：web 部分类型本地重复（A-06），app 完全无类型约束 | 契约下沉为 JSON Schema/zod，三端 code-gen 或运行时校验 |

---

## 3. 双端功能与接口对照表（页面 × web/app × 接口 × 差异）

| 功能/页面 | Web（Next + tRPC） | App（WebView 手写 JS + REST） | 使用的后端接口 | 差异 / 风险 |
|-----------|--------------------|-------------------------------|----------------|-------------|
| 首页 / 查词 | `(user)/page.tsx` + `word-lookup.tsx` | `index.html` 首页 + `doLookup()` | tRPC `dictionary.lookup`(SSE) / `POST /api/lookup` | web 走 tRPC 流式、app 走 REST；`speak()` 各写各的（A-08） |
| 学习 / 复习 | `(user)/study/page.tsx`（1/3 评分，串行预取） | `renderReview()`（1-4 评分） | web: tRPC `review.today`/`reviewCard`；app: `GET /api/review/today`、`POST /api/review` | **A-02 语义不一致 + C-02 双实现分叉**；app today 还顺带写库（`review.ts:22-43`） |
| 测评 | `(user)/assess/page.tsx` | **缺失** | tRPC `assessment.*`（`router.ts:443/499`） | app 无此页（B-05）；缓存无 user_id（C-07） |
| 报告 / 洞察 | `(user)/report/page.tsx` | **缺失** | tRPC `analyst.*` | app 无（B-05）；analyst 全量重扫（C-15） |
| AI 对话 | `(user)/chat/page.tsx`（WS） | **缺失** | `GET /ws?token=&threadId=`、`GET /api/chat/history` | token 进 URL（A-04）；threadId 未按用户隔离（C-06） |
| 单词本 | `wordbook-sidebar.tsx`（增量 add/remove） | `renderWordbook()` + 离线整数组同步 | web: tRPC `wordbook.*`；app: `GET/PUT /api/wordbook` | **C-03/B-02 整数组覆盖 vs 增量** |
| 我的 / 资料 | `(user)/profile/page.tsx`（heatmap 自建） | `renderMe()`（heatmap 自建） | web: tRPC `profile.get/update/changePassword`；app: `GET/PUT /api/profile` | **两套返回形状（camel vs snake+daily_goal，profile.ts:19-25）**；头像上限不一致（C-04）；heatmap 逻辑三端重复 |
| 签到 / 打卡 | 首页内联 + tRPC `checkin.*` | 冷启动徽标（因 B-01 未触发） | tRPC / REST checkin | 连胜算法双实现（C-11）；移动徽标因 renderRecent 崩溃断链（B-01） |
| 登录 / 注册 | `(auth)` + tRPC `auth.sendCode/login/me` | `login` UI + REST `/api/auth/*` | 两套并行（C-09） | **C-01 短信桩 → 生产验证码不可用**；限流键/错误码不一致 |
| 管理后台 | `(user)/admin/page.tsx`（Next） | 无 | `REST /api/admin/*`；另存 `tm_admin_token` | 与旧 `public/admin.html`（D-05）并存；类型重复（A-06） |

---

## 4. React 化可行性评估（移动 → React，复用 web 组件）

**结论：可行，但顺序敏感。** 必须"先定契约/建组件包 → 再迁移移动壳 → 后改打包链"，否则双端会各自漂移。当前移动 app 无框架、手写路由/状态/`innerHTML`（B-04），web 已是 Next 15 + React 19 + shadcn，具备复用基础；主要风险集中在**双宿主形态差异**与 **`file://` WebView 约束**。

### 4.1 共享组件包放在哪
- 现状：`packages/shared` 仅放 TS 类型（D-07），无 UI。
- 建议新建 **`packages/ui`**（展示型、无数据获取、纯 props）：把 `flashcard`、`en-result` 渲染、`heatmap`、`markdown`、`speak`(改 hook)、设计 token 沉淀进去。
- 配套 **`packages/config`（或 `packages/theme`）** 收敛 Tailwind 预设 + CSS 变量，根治 A-09 的"两处真相"。
- `packages/shared` 升级为运行时契约（zod/JSON Schema），双端 import 同一 schema（解决 D-07）。

### 4.2 双宿主（Next.js + Vite-SPA）共享同一组件包
- **数据与 UI 分离**：`packages/ui` 组件不直接调 tRPC/REST；由各自宿主注入 —— web 用 `@trpc/react-query`，app 用 REST/或 tRPC REST 适配。以 **TanStack Query** 为统一数据层，`link`/`fetcher` 按 host 切换。
- **Next 边界**：交互组件加 `'use client'`；Server Component 仅做外壳。Vite 是纯 CSR，天然无 RSC 约束 —— 组件保持 client-only 即双端可用。
- **Tailwind**：`packages/ui` 导出组件源码（不预编译 CSS），两端 `content: ['./packages/ui/src/**/*.{ts,tsx}']` 纳入，避免样式被 tree-shake 丢失。
- **风险**：React 19（web） vs app 端 React 版本需对齐；peerDependency 漂移。→ 用 workspace 固定单一 React 版本。

### 4.3 APK 构建链改动
- 现状无 Gradle：`aapt2 → javac → d8 → zipalign → apksigner`，手工把静态资源塞进 `assets/`（且脚本被 gitignore，D-01）。
- React 化后 app = **Vite 生产构建产物**（`index.html`+`assets/*`），仍以 `file:///android_asset/index.html` 载入，`MainActivity` + `AndroidBridge`（saveToken/readToken/consumeLaunchFocus）基本可**不动**。
- 必改项：
  1. `build-apk.sh` 增加前置 `pnpm --filter app build`（Vite），再把 `dist/*` 拷进 `android_asset`；
  2. Vite 配 **`base: './'`**，产物相对路径，规避 `file://` 绝对路径解析失败；
  3. `target` 降到 WebView 支持的 ES（Android System WebView 版本参差）；
  4. 网络从 `file://`→`https://tmword.xyz`：跨源，需 **CORS 白名单**（收紧 C-16 `'*'`）+ token 注入（沿用 Bridge 读 SharedPreferences 再注 memory，B-07）。
- 依赖：D-01 必须先把构建链纳入版本控制，否则 React 化无法 CI 打包。

### 4.4 `file://` WebView 特有风险与兜底
- **CORS / Cookie**：`file://` 源为 `null`，`httpOnly` Cookie（若采纳 A-10）在 WebView 可能不落 → token 仍需 Bridge/内存管理，不能盲信 Cookie 方案。
- **Service Worker**：`file://` 不支持 → 离线能力靠 app 自身缓存（现 `wbCache`/`lookupCache`），别依赖 SW。
- **首屏体积**：React+Next 组件全量进 APK assets 会显著增大，需 code-splitting + 资源压缩。
- **字体/图标 CORS**：本地 assets 引用需 `file://` 可达，外链字体在离线 WebView 失效。
- **兜底/渐进策略**：
  1. 保留现手写 JS app 于独立分支作为回退；
  2. **先止血**（修 B-01 renderRecent、补 A-01/移动导航、统一头像 C-04）再谈整包重写；
  3. **渐进 React 化**：先迁 1 个高频页（study）进 WebView 混合路由，双端联调通过后再逐页替换（wordbook→profile→补 assess/report/chat），避免一次性大爆炸。

---

## 5. 后端重构边界建议（有生产数据前提下：可动 / 不可动）

**总原则：新增能力走新实现，老接口只加不改；破坏性变更须双写 + 回填 + 灰度。**

### 可动（低风险，无状态/纯结构）
- `trpc/router.ts`（610 行、9 域）按域**拆分文件** —— 纯代码搬迁，接口签名不变。
- 收敛错误语义：C-08 冷却改 `TOO_MANY_REQUESTS`；补 auth 错误码。
- 抽 `review`/`wordbook`/`profile` 的**唯一 service 实现**，让 REST（`routes/*`）与 tRPC（`router.ts`）都成为薄封装 —— **保留旧路由与旧响应形状**，内部转调（消除 C-02/03/04/09 分叉，不改对外契约）。
- 加列 / 加索引 / 加缓存键维度（如 assessment_cache 加 user_id，C-07）—— 向后兼容式扩展。
- rate-limit、codeStore、失败锁迁 Redis（C-13）—— 对外行为不变。
- 修 threadId 命名空间（C-06）、事件 user_id（C-14）、连胜统一 shared（C-11）—— 语义修正，接口不变。

### 不可轻动（碰生产数据 / 跨端契约，需专项评审 + 迁移方案）
- **数据模型字段**：`users.id/phone`、`fsrs_cards.data`（ts-fsrs 5.0 序列化格式）、`wordbooks.data`（整数组 JSON 形状）、`chat_messages(user_id,thread_id)` —— 改形状即数据迁移。
- **对外接口**：`/api/wordbook`(app 唯一同步口)、`/api/review`(app)、`/trpc/*`(web)、`/ws`(chat)、REST `auth`(app)、`/api/lookup`(双端) —— 任一变更须双端同步发版。
- **JWT claims 形状** `{id:user.id}`：旧 token TTL 30 天仍有效，改 payload/校验逻辑会让在线用户掉线 → 只能加字段、不能删/改名。
- **ts-fsrs 版本**：升 5.x → 其它版会改变 `state` 语义，属红线（第 6 节）。

### 建议节奏
先做"薄封装收敛 + 语义修正"（不动契约/不动库）拿到一致性收益；再评估"增量同步协议"这类需要**双端 + 数据迁移**的动作，单列灰度计划。

---

## 6. 数据与兼容性红线（禁止破坏项 + 备份/回滚点）

### 红线：不可破坏的表 / 字段
- `users(id INTEGER PK, phone UNIQUE, password, created_at)` —— 注意 pg `phone VARCHAR(11)`（`db/pg.ts:34` 段 DDL）与 sqlite `TEXT` 的长度语义差异，勿放宽/收紧导致老账号登录异常。
- `profiles(user_id, nickname, avatar, daily_goal)` —— `avatar` 当前存 base64（大字段），改存 URL 需迁移历史值。
- `wordbooks(user_id UNIQUE, data JSON, updated_at)` —— `data` 是 `WordbookEntry[]` 整数组，形状即契约（C-03/D-07）。
- `fsrs_cards(user_id, word, data, due)` —— `data` 为 **ts-fsrs 5.0** 序列化的调度状态，**版本锁死红线**：升级 ts-fsrs 前必须做 state 兼容性验证。
- `chat_messages(user_id, thread_id, role, content, created_at)` —— 历史读取按 `(user_id,thread_id)`（`pg.ts:372-373`），改 threadId 命名（C-06）须**同时兼容旧裸 threadId 行**。
- `tutor_cache(word,...)`、`assessment_cache(word,type,question)` —— 后者补 user_id 时旧行归属需处置（C-07）。
- 外键：`PRAGMA foreign_keys=ON`（`sqlite.ts:509` 已修），`checkin_logs/tutor_cache/assessment_cache` 无 FK（`sqlite.ts:34-109`），删用户需应用级级联，勿依赖 DB 级联。

### 红线：不可下线/改形的接口
`/api/wordbook` `PUT`、`/api/review`、`/api/review/today`、`/trpc/*`、`/ws`、REST `auth/*`、`/api/lookup`、`/api/profile`、`/api/chat/history`。改任一前须确认 web 与已发布 APK（多版本共存、离线）都能兼容。

### 备份 / 回滚点（上线检查单）
1. **变更前快照**：pg → `pg_dump`（自定义格式，`services/backup.ts`）；sqlite → `VACUUM INTO`（当前**缺**，D-04，须先补）。备份成功才算可发布。
2. **迁移脚本双写 + down**：加列/加索引向前兼容；破坏性变更走"新列双写 → 回填 → 切读 → 弃旧列"，禁止原地改删。
3. **回滚边界（关键红线）**：`deploy.yml` 只按镜像 tag 回滚**代码**，**不自动回滚数据库**（D-06）。故所有迁移必须"代码可回滚、数据不丢"——即 schema 变更不得让旧镜像写坏新数据。
4. **灰度**：接口的双端切换按用户/比例灰度，保留旧路径一个大版本。
5. **ts-fsrs / JWT** 变更单独立项，附在线用户不掉线验证。

---

## 7. 给架构师的输入（任务拆分 + 依赖顺序）

> 依赖硬规则：**契约冻结先于组件复用；组件包先于移动 React 化；构建链入库先于 CI 打包。**

**Phase 0 · 止血（1-3 天，低风险，先于一切重构）**
- T0.1 短信接入或明确"生产仅密码登录"并文档化（C-01）。
- T0.2 修 `renderRecent` + `init()` 步骤隔离（B-01）。
- T0.3 统一头像上限 + 规划对象存储 URL（C-04，先修可用性）。
- T0.4 Web 移动端导航兜底（A-01）+ 修 SSE/订阅鉴权与 WS token 位置（A-04/A-05）。
- T0.5 `.gitignore` 反向纳入 `build-apk.sh`/`assemble_apk.py`（D-01）、CI 接真实测试（D-02）。

**Phase 1 · 后端契约收敛（依赖 P0）——不动对外形状**
- T1.1 抽 `review` service，消除 REST/tRPC 分叉（C-02、A-02 语义、1-4 评分统一）。
- T1.2 单词本**增量同步协议**设计 + 乐观锁（C-03/B-02），跨端灰度。
- T1.3 `profile`/`auth` service 收敛，REST/tRPC 双端薄封装（C-09、两套返回形状对齐）。
- T1.4 安全/隔离快修：threadId 命名空间（C-06）、assessment_cache user_id（C-07）、限流迁 Redis（C-13）、错误码（C-08）。
- **出口标准**：双端调同一 service、契约冻结、回归测试进 CI。

**Phase 2 · 组件包与设计系统（依赖 P1 契约）**
- T2.1 建 `packages/ui` + `packages/theme`，抽 `useSpeak`/`EnResultView`/`heatmap`/`markdown`（A-08、A-09、三端重复）。
- T2.2 `packages/shared` 升级运行时 schema，三端 code-gen（D-07）。

**Phase 3 · 移动 React 化（依赖 P1+P2，见第 4 节）**
- T3.1 Vite SPA 壳 + Bridge 保留 + `base:'./'` + CORS 收紧。
- T3.2 渐进迁页（study→wordbook→profile→补 assess/report/chat），保留手写 app 回退分支。
- T3.3 改造 APK 链纳入 Vite build（B-08/D-01）。

**Phase 4 · 后端可维护性与交付清理（可与 P2/P3 并行）**
- T4.1 `router.ts` 拆域文件；pg 迁移框架 + 列迁移（C-10/C-11/C-12）。
- T4.2 安全加固：JWT 吊销 + 密码强度（C-05）、CSP 去 unsafe-eval 并先清内联 JS（D-03/B-03）、`/metrics` 加护（C-17）、config 默认凭据/CORS（C-16）。
- T4.3 删 legacy（`admin.html`/`script.js`，D-05）、补 SQLite 备份（D-04）、事件 user_id（C-14）、analyst 复扫（C-15）。
- T4.4 无障碍/响应式收尾：user-scalable、sidebar 抽屉、FOUC（A-09/A-11/B-06）。

**关键路径**：`P0 → P1（契约冻结）→ P2（组件包）→ P3（移动 React）`；`P4` 并行但 **CSP 清理须早于**（否则 B-03 内联 JS 无法收口）。数据类动作一律遵循第 6 节红线：快照 → 双写迁移 → 灰度 → 只回滚代码不回滚库。

---
*审计基于当前 HEAD 只读调研，未修改任何业务代码。所有行号为撰写时快照，重构前请以最新代码二次核验。*
