# 明日记忆 · Tomorrow Memory

基于 **Multi-Agent + FSRS 间隔重复** 的 AI 英语单词学习应用。
从原生 JS + Express 单体重构为 **TypeScript monorepo + LangGraph 多 Agent 架构 + tRPC + Next.js**。

## 技术栈总览

| 层 | 技术 |
|---|---|
| 前端 | Next.js 15（App Router）、React 19、Tailwind CSS、shadcn/ui、Recharts、tRPC Client + React Query |
| 后端 | Hono、@hono/node-server、tRPC v11、@hono/node-ws（WebSocket）、ioredis |
| AI | LangGraph（StateGraph 编排）、LangChain（DeepSeek 兼容 OpenAI）、ts-fsrs 5.0、zod structured output |
| 数据库 | PostgreSQL 16 / SQLite（better-sqlite3，可切换）、ClickHouse（学情事件）、Qdrant（向量检索，可选） |
| 可观测性 | OpenTelemetry（auto-instrumentations + OTLP → Jaeger）、Prometheus /metrics、LangSmith |
| 部署 | Docker Compose 生产编排、Caddy（自动 HTTPS）、GitHub Actions CI/CD |

## 项目结构

```
packages/
  shared/     # 共享类型与工具（@tm/shared）
  agent/      # LangGraph 多 Agent：orchestrator / lexicon / tutor / scheduler / analyst / assessment / HITL
  server/     # Hono 后端：REST + tRPC + WebSocket + ClickHouse 事件流 + OTel + /metrics
apps/
  web/        # Next.js 15 前端（查词/背单词/测评/分析/AI 对话/个人主页/管理）
scripts/      # 词典构建脚本（build-fts / build-examples / migrate-pg 等）
docs/progress/ # 各阶段进度报告
```

## 快速开始（开发）

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env          # Windows: copy .env.example .env

# 3. 启动后端（SQLite 模式，无需 Docker；词典自动加载 stardict.db）
DB_DRIVER=sqlite JWT_SECRET=dev pnpm --filter @tm/server start   # http://localhost:3001

# 4. 启动前端
pnpm --filter @tm/web dev                                        # http://localhost:3000
```

验证码登录开发万能码：`12345`（正式验证码打印在后端控制台）。

### 完整基础设施（Docker）

```bash
docker compose -f docker-compose.dev.yml up -d   # PG16 / Redis7 / Qdrant / ClickHouse
DB_DRIVER=pg pnpm db:migrate                     # 迁移旧数据 + 初始化 FSRS 卡片
pnpm build:index                                 # 构建 Qdrant 向量索引（可选）
```

### 可选能力（配置 .env 后启用）

- **LLM**：`DEEPSEEK_API_KEY` → AI 教学内容 / 测评题目 / 学情洞察 / 对话回复（未配置时自动降级规则模式）
- **追踪**：`OTEL_ENABLED=true` + Jaeger；`LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY`
- **事件分析**：ClickHouse（未接入时学情分析降级为 DB 统计）

## 生产部署

```bash
docker compose -f docker-compose.prod.yml up -d
# Caddy 自动 HTTPS；/api /trpc /ws → server:3001，其余 → web:3000
```

CI/CD：`.github/workflows/`（ci.yml PR 检查；deploy.yml main 推送自动构建部署 + 健康检查回滚）。

## Agent 架构

```
用户输入 → Orchestrator（意图识别 + HITL interrupt）
          ├─ lookup → Lexicon Agent（静态查词 + LLM 补充）
          ├─ learn  → Tutor Agent（口诀/词根/例句/易混词，tutor_cache 缓存）
          ├─ review/assess → Scheduler Agent（FSRS-5.0 调度与评分）
          ├─ report → Analyst Agent（ClickHouse 聚合 + LLM 洞察，24h 缓存）
          └─ 测评 → Assessment Agent（三种题型 + FSRS 难度自适应）
```

## 关键脚本

```bash
pnpm -r typecheck   # 全包类型检查（strict，禁止 any）
pnpm lint           # ESLint
pnpm db:migrate     # 数据迁移（旧 SQLite → 当前驱动）+ FSRS 初始化
pnpm build:index    # Qdrant 向量索引构建（断点续传）
pnpm --filter @tm/server exec tsx src/scripts/test-trpc.ts   # tRPC 端到端测试
pnpm --filter @tm/server exec tsx src/scripts/test-ws.ts     # WebSocket + HITL 测试
```
