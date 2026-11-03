# 00 原始需求（用户原话逐字保留）

> 收集时间：2026-09-19 · 收集人：项目总编排（TPM）· 模式：**完整模式**（多端 + 含数据库）

## 一、用户原话

> 把明日记忆的app和网站重构加强一下，除了首页依旧要求简洁地只剩搜索框和一些必要的比如菜单和一些让画面看起来协调的东西，其他的都可以改动地更好。

## 二、澄清问答（AskUserQuestion，用户选择原文）

| 问题 | 用户回答 |
|---|---|
| 这次「重构加强」最想拿到什么？（多选） | 视觉+交互全面升级、移动端补齐功能、信息架构重组、代码结构重构、**把原有的一些不合理的地方进行改动增强**（用户自填补充项） |
| 后端 API（packages/server，tRPC）可以改吗？ | **前后端一起重构** |
| 移动端 App 的技术形态怎么处理？ | **重写为 React 并复用网页组件** |
| 上线与交付方式？ | **验证通过后直接部署上线** |

## 三、当前状态盘点（TPM 实测，供各角色参考）

- **仓库**：`E:\CC\tomorrow-memory`，pnpm monorepo，git 分支 main，工作区有大量未提交改动（含 docs/、mobile-agenda/、测试脚本）。
- **网站**（`apps/web`，Next.js 15 App Router + React 19 + Tailwind + shadcn/ui + tRPC，src 共约 3,871 行）：
  - 页面：`/`（查词首页，367 行）、`/study`（背单词 283）、`/assess`（测评 374）、`/report`（学情分析 211）、`/chat`（AI 对话 254）、`/profile`（我的 313）、`/word/[word]`、`/admin`（后台）。
  - 组件：`header`（顶部导航，桌面横排 6 项）、`user-shell`+`wordbook-sidebar`（可收起侧边单词本）、`flashcard`、`login-dialog`、`word-lookup`、`markdown`、`charts/*`（热力图/遗忘柱状/成长折线/复习折线，Recharts）。
  - 当前首页**并非极简**：搜索框 + 方向切换（自动/英译中/中译英）+ 历史词 chips + 静态释义卡 + AI 流式教学卡。用户明确要求首页收敛为「只有搜索框 + 菜单 + 让画面协调的元素」。
- **移动端 App**（`mobile-memory`，原生 Android WebView + 纯手写 JS/HTML/CSS，`assets/app.js` 1,015 行 + `api.js` 223 行 + `style.css` 约 18KB）：
  - 页面：首页（极简搜索框，已符合要求）、背单词、单词本、登录/我的、账号安全、修改密码、关于。
  - **缺失**：测评、学情分析、AI 对话、独立词详情页。
  - 构建：`build-apk.sh` + keystore 签名，产出 `明日记忆.apk`；Java 侧 `src/com/tomorrow/agenda/...`（注：明日记忆与明日日程两个 App 结构相似，`mobile-agenda` 为另一独立产品，**不在本次范围内**）。
- **后端**（`packages/server`，Hono + tRPC v11 + WebSocket，约 5,611 行 + `packages/agent` LangGraph 多 Agent）：
  - 路由：REST `routes/*`（auth/chat/lookup/review/wordbook/profile/checkin/agent/tutor/admin）+ `trpc/router.ts`（610 行单文件 router）。
  - 数据层：`db/sqlite.ts`（573 行）与 `db/pg.ts`（521 行）**双份手写并行实现**，需保持一致性（已有 `tests/ddl-parity.mjs` 类校验思路）。
  - 服务：dictionary/FSRS 调度（ts-fsrs 5.0）、ClickHouse 事件、Redis 缓存、SMS、有道/dictionaryapi 兜底、备份、OTel/Prometheus。
- **线上状态**：域名 tmword.xyz，Caddy 反代 + Docker Compose 生产编排 + GitHub Actions CI/CD（`deploy.yml` main 推送自动构建部署 + 健康检查回滚）。已有真实用户与数据（`data.db` 253KB，含 WAL）。**任何破坏性改动、数据迁移、接口下线都属高风险动作，必须在设计阶段标注并给出兼容/回滚策略。**
- **测试资产**：`TEST-REPORT.md`（根，21KB）、`mobile-memory/docs/TEST-REPORT.md`、`packages/server/src/scripts/smoke-test.ts`、`test-trpc.ts`、`test-ws.ts`、`mobile-agenda/tests/gui-cdp.mjs`（CDP 真实 GUI 跑测框架，可移植到 mobile-memory）。
- **已知项目经验（记忆）**：`mobile-agenda/tests/gui-cdp.mjs` 有若干坑（异常吞输出、弹层动画期截图、scrollIntoView、zIndex NaN），移植时注意。

## 四、用户明确的硬约束

1. **首页极简**：网站与 App 的首页都只保留搜索框 + 菜单等必要元素 + 视觉协调元素；其他功能入口可以移入菜单/二级页。
2. **其余页面都可大刀阔斧改动**，目标是"更好"。
3. 移动端与网页端**共用组件**（React 化，代码复用）。
4. 交付后**部署上线**。

## 五、待用户拍板的开放问题（交 PRD 阶段产出）

见 `01-prd.md` 开放问题章节；TPM 已列出候选：功能优先级、React 化后 APK 构建链、后端重构边界（tRPC router 拆分 / sqlite+pg 双实现收敛）、旧 WebView 资产是否保留过渡期。
