# 明日记忆 Multi-Agent 改造计划书

> 版本 v1.0 | 2026-08-26 | 按优先级分阶段实施

---

## 目录

1. [改造路线图总览](#1-改造路线图总览)
2. [Phase 1: 基础设施搭建](#phase-1-基础设施搭建)
3. [Phase 2: 核心 Agent 实现](#phase-2-核心-agent-实现)
4. [Phase 3: 前端重构](#phase-3-前端重构)
5. [Phase 4: 高级特性](#phase-4-高级特性)
6. [Phase 5: 学情分析与可观测性](#phase-5-学情分析与可观测性)
7. [Phase 6: 生产部署与优化](#phase-6-生产部署与优化)
8. [里程碑与验收标准](#8-里程碑与验收标准)

---

## 1. 改造路线图总览

改造分为 6 个阶段，按优先级从高到低排列。P0 阶段是 MVP 交付，P1 是体验升级，P2 是锦上添花。每个阶段可独立交付和演示，不依赖后续阶段。

| 阶段 | 优先级 | 核心交付 | 预计工时 | 依赖 |
|---|---|---|---|---|
| Phase 1: 基础设施 | P0 | TypeScript 化 + Docker Compose + 数据库抽象层 | 1-2 周 | 无 |
| Phase 2: 核心 Agent | P0 | LangGraph 编排 + Lexicon + Tutor + Scheduler | 2-3 周 | Phase 1 |
| Phase 3: 前端重构 | P1 | Next.js 前端 + SSE 流式 + tRPC | 2 周 | Phase 2 |
| Phase 4: 高级特性 | P1 | Assessment Agent + WebSocket 对话 | 1-2 周 | Phase 3 |
| Phase 5: 分析与监控 | P2 | Analyst Agent + ClickHouse + OpenTelemetry | 1-2 周 | Phase 2 |
| Phase 6: 部署优化 | P2 | Caddy + CI/CD + 性能调优 | 1 周 | Phase 5 |

---

## Phase 1: 基础设施搭建

**优先级**：P0 | **预计工时**：1-2 周 | **依赖**：无

### 目标

将现有的纯 JS 单体项目改造成 TypeScript 项目，建立 Docker Compose 开发环境，实现数据库抽象层，为后续 Agent 开发打好基础。

### 任务清单

#### 1.1 项目初始化（S）

创建 monorepo 结构（pnpm workspace），分 `packages/agent`、`packages/server`、`packages/shared`、`apps/web` 四个包。配置 tsconfig.json（paths alias、strict mode）。配置 ESLint + Prettier。

**目录结构：**
```
tomorrow-memory/
├── packages/
│   ├── agent/          # Agent 逻辑（LangGraph）
│   ├── server/         # 后端服务（Hono）
│   └── shared/         # 共享类型、工具
├── apps/
│   └── web/            # Next.js 前端
├── docs/               # 文档
├── docker-compose.dev.yml
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

#### 1.2 数据库抽象层（M）

将 server.js 和 server_prod.js 的重复逻辑提取到 `packages/server/src/db` 下，定义统一接口：`createUser()`、`getWordbook()`、`saveWordbook()` 等。提供 PostgreSQL 和 SQLite 两种实现，通过环境变量 `DB_DRIVER=pg|sqlite` 切换。

**接口定义示例：**
```typescript
// packages/server/src/db/types.ts
export interface UserDB {
  createUser(phone: string, password?: string): Promise<User>;
  getUserByPhone(phone: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
}

export interface WordbookDB {
  getWordbook(userId: number): Promise<WordbookItem[]>;
  saveWordbook(userId: number, data: WordbookItem[]): Promise<void>;
}
```

#### 1.3 Express → Hono 迁移（M）

将 Express 路由逐个迁移到 Hono。Hono 基于 Web 标准 API，类型安全更好，且兼容 Express 的中间件模式。迁移顺序：静态文件 → 认证中间件 → 查词 API → 单词本 API → 打卡 API → 管理 API。

#### 1.4 Docker Compose 环境（M）

编写 `docker-compose.dev.yml`，包含：PostgreSQL 16、Redis 7、Qdrant、ClickHouse。一键 `docker compose up -d` 启动所有依赖。数据卷挂载到本地目录持久化。

```yaml
# docker-compose.dev.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: tomorrow_memory
      POSTGRES_USER: tm_user
      POSTGRES_PASSWORD: tm_pass_2024
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes:
      - qdrant_data:/qdrant/storage

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports: ["8123:8123", "9000:9000"]
    volumes:
      - clickhouse_data:/var/lib/clickhouse

volumes:
  pg_data:
  qdrant_data:
  clickhouse_data:
```

#### 1.5 环境变量管理（S）

将所有硬编码密钥（JWT_SECRET、DATABASE_URL、API Key）提取到 `.env` 文件。创建 `.env.example` 模板。Docker Compose 通过 `env_file` 注入。

#### 1.6 数据迁移脚本（S）

基于现有 `migrate-pg.js`，新增 `fsrs_cards` 表和 `tutor_cache` 表的建表语句。将现有单词本数据迁移到新表结构，为每个单词初始化 FSRS 默认参数。

```sql
-- fsrs_cards 表
CREATE TABLE IF NOT EXISTS fsrs_cards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  word TEXT NOT NULL,
  stability FLOAT NOT NULL DEFAULT 1.0,
  difficulty FLOAT NOT NULL DEFAULT 5.0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review TIMESTAMP,
  next_review TIMESTAMP,
  state INTEGER NOT NULL DEFAULT 0, -- 0=new, 1=learning, 2=review, 3=relearning
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, word)
);

-- tutor_cache 表
CREATE TABLE IF NOT EXISTS tutor_cache (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  level VARCHAR(10) NOT NULL DEFAULT 'B1', -- CEFR level
  content JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(word, level)
);
```

### 技术亮点

**类型安全的数据库层**：使用 Repository 模式，让每个数据库操作都有完整的 TypeScript 类型推断。面试时可以展示"从 JS 迁移到 TS 的渐进式改造经验"。

### 验收标准

- `pnpm dev` 启动后端，所有原有 API 正常工作
- `docker compose up -d` 一键启动 PostgreSQL + Redis + Qdrant + ClickHouse
- 无 `any` 类型，ESLint 零警告
- 原有功能回归测试通过（查词、登录、背词、打卡）

---

## Phase 2: 核心 Agent 实现

**优先级**：P0 | **预计工时**：2-3 周 | **依赖**：Phase 1

### 目标

实现 LangGraph 编排框架和三个核心 Agent（Lexicon / Tutor / Scheduler），让查词、教学、复习三个核心环节具备 AI 能力。

### 任务清单

#### 2.1 LangGraph 编排框架搭建（L）

安装 `@langchain/langgraph`，定义 StateGraph 状态对象 schema。实现 Orchestrator Agent 的意图识别逻辑：使用 LLM function calling 分类用户意图。定义图节点和边：`orchestrator → {lexicon, tutor, assessment, scheduler}`，条件路由基于意图分类结果。

**核心代码结构：**
```
packages/agent/src/
  ├── graph.ts          # StateGraph 定义
  ├── state.ts          # 共享状态类型
  ├── nodes/
  │   ├── orchestrator.ts
  │   ├── lexicon.ts
  │   ├── tutor.ts
  │   ├── assessment.ts
  │   └── scheduler.ts
  └── tools/
      ├── llm-router.ts  # LiteLLM 多模型路由
      ├── vector-search.ts # Qdrant 检索
      └── fsrs.ts         # FSRS 算法
```

**LangGraph 图定义示例：**
```typescript
import { StateGraph } from "@langchain/langgraph";
import { AgentState, agentStateChannels } from "./state.js";
import { orchestratorNode } from "./nodes/orchestrator.js";
import { lexiconNode } from "./nodes/lexicon.js";
import { tutorNode } from "./nodes/tutor.js";
import { schedulerNode } from "./nodes/scheduler.js";

function routeIntent(state: AgentState): "lexicon" | "tutor" | "scheduler" | "assessment" | "analyst" | "__end__" {
  switch (state.intent) {
    case "lookup": return "lexicon";
    case "learn": return "tutor";
    case "review": return "scheduler";
    case "assess": return "assessment";
    case "report": return "analyst";
    default: return "__end__";
  }
}

const graph = new StateGraph<AgentState>(agentStateChannels)
  .addNode("orchestrator", orchestratorNode)
  .addNode("lexicon", lexiconNode)
  .addNode("tutor", tutorNode)
  .addNode("scheduler", schedulerNode)
  .addEdge("__start__", "orchestrator")
  .addConditionalEdges("orchestrator", routeIntent, {
    lexicon: "lexicon",
    tutor: "tutor",
    scheduler: "scheduler",
    __end__: "__end__",
  })
  .addEdge("lexicon", "__end__")
  .addEdge("tutor", "__end__")
  .addEdge("scheduler", "__end__");

export const agentGraph = graph.compile();
```

#### 2.2 Lexicon Agent: 向量索引构建（L）

读取现有 `stardict.db` 的 40 万词条，用 `text-embedding-3-small` 生成向量，批量写入 Qdrant collection `dictionary`。同时将 `examples.db` 的例句向量化写入 `examples` collection。构建脚本支持断点续传（记录已处理 ID）。

预计 embedding 调用量：40 万次 × $0.02/百万 token ≈ $2。使用 batch API 降低成本。

**Qdrant collection 定义：**
```typescript
// dictionary collection
{
  collection: "dictionary",
  vectors: { size: 1536, distance: "Cosine" },
  sparse_vectors: { name: "bm25" },  // 混合检索
  payload_schema: {
    word: "keyword",
    phonetic: "keyword",
    translation: "text",
    collins: "integer",
    tag: "keyword"
  }
}
```

#### 2.3 Lexicon Agent: 查询逻辑（M）

实现查词 pipeline：embedding 生成 → Qdrant hybrid search（dense + sparse）→ Stardict 精确查询 → 结果合并 → LLM 补充词源和记忆提示 → SSE 流式返回。保留现有有道 API 和 dictionaryapi.dev 作为外部 fallback。

#### 2.4 Tutor Agent: 教学内容生成（M）

实现 LLM structured output 调用：定义 JSON schema（mnemonic, wordRoot, sceneExamples, confusable），编写 prompt template（注入单词、用户 CEFR 等级、最近学习历史），调用 GPT-4o，解析并校验返回结果。实现 PostgreSQL 缓存层：`tutor_cache(word, level, content, created_at)`。

**Tutor schema 示例：**
```typescript
const tutorSchema = {
  type: "object",
  properties: {
    mnemonic: {
      type: "string",
      description: "一句话记忆口诀，用中文，用联想/谐音/场景帮助记忆"
    },
    wordRoot: {
      type: "string",
      description: "词根词缀拆解，用连字符分隔，说明每个部分的含义"
    },
    sceneExamples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          en: { type: "string" },
          zh: { type: "string" }
        },
        required: ["en", "zh"]
      },
      description: "3个不同场景的双语例句，难度匹配用户水平"
    },
    confusable: {
      type: "string",
      description: "易混淆词辨析，如果没有则为空字符串"
    }
  },
  required: ["mnemonic", "wordRoot", "sceneExamples", "confusable"]
};
```

#### 2.5 Scheduler Agent: FSRS-5.0 实现（L）

用 TypeScript 实现 FSRS-5.0 算法核心：可提取性计算 `R(t) = exp(-t/S)`、稳定性更新、难度更新、下次复习时间计算。实现每日队列生成逻辑。将现有单词本数据初始化为 FSRS cards（默认参数 S=1, D=5）。

参考实现：使用 npm 包 `ts-fsrs`。

**FSRS 使用示例：**
```typescript
import { fsrs, generatorParameters, Rating } from 'ts-fsrs';

const params = generatorParameters({ enable_fuzz: true });
const f = fsrs(params);

// 复习一个单词
const card = await db.getCard(wordId);
const now = new Date();
const result = f.repeat(card, now);

// 根据测评评分选择
const rating = mapQuizResultToRating(quizResult); // 1-5
const next = result[rating];

// 更新卡片
card.scheduled_days = next.scheduled_days;
card.reps = card.reps + 1;
card.stability = next.stability;
card.difficulty = next.difficulty;
card.last_review = now;
await db.updateCard(card);
```

#### 2.6 LLM 路由层（M）

实现 `llm-router.ts`：封装 OpenAI / Anthropic / DeepSeek 的统一调用接口。配置 `model_router.json`，按场景（teaching / assessment / analysis / lookup）路由到不同模型。支持 fallback 链（GPT-4o → DeepSeek → 本地模型）。实现 token 计数和成本统计。

### 技术亮点

**三项核心技术展示**：LangGraph 状态图编排（面试可画图讲解 Agent 协作流程）| RAG 混合检索（Qdrant dense+sparse，比纯语义检索准确率提升 15-20%）| FSRS 科学复习算法（有论文背书，比 Anki SM-2 准确率提升 31%，是硬核算法亮点）

### 验收标准

- 查词 API 返回 AI 生成的记忆提示内容（流式）
- 加入单词本后，Tutor Agent 异步生成教学缓存内容
- FSRS 算法正确计算复习间隔（用测试用例验证）
- LangGraph 图可可视化（LangSmith 追踪）
- LLM 调用有缓存，相同输入不重复调用

---

## Phase 3: 前端重构

**优先级**：P1 | **预计工时**：2 周 | **依赖**：Phase 2

### 目标

将原生 HTML/CSS/JS 前端重构为 Next.js App Router 应用，接入 tRPC 端到端类型安全 API，实现 SSE 流式输出和交互式 Flashcard 组件。

### 任务清单

#### 3.1 Next.js 项目搭建（M）

在 `apps/web` 下创建 Next.js 15 项目（App Router + TypeScript + Tailwind CSS）。配置路径别名。创建基础布局组件（Header / Sidebar / Main）。引入 shadcn/ui 组件库（基于 Radix UI + Tailwind，提供可定制的组件）。

#### 3.2 tRPC 集成（M）

定义 tRPC router：`dictionary.lookup`、`wordbook.list/add/remove`、`review.today`、`checkin.status/create`、`profile.get/update`。前端通过 `useQuery` / `useMutation` 调用，自动获得类型推断。WebSocket 传输用于实时通信。

#### 3.3 查词页面重构（M）

搜索框 + 结果区。结果区分两部分：静态部分（音标、释义、例句，毫秒级显示）和 AI 部分（记忆提示、词源，流式显示，1-3 秒渐进呈现）。实现 SSE 消费逻辑：`EventSource` 监听，逐 token 渲染 AI 内容。单词加入单词本按钮。

#### 3.4 Flashcard 组件重构（M）

React Flashcard 组件：正面显示单词和音标，点击翻转到背面显示释义、例句、AI 记忆口诀。支持手势滑动切换（左滑不会、右滚动已掌握）。键盘快捷键（空格翻转、左右切换）。进度条显示今日完成情况。卡片完成后触发 Scheduler 更新。

#### 3.5 单词本与个人页迁移（M）

单词本侧边栏：搜索、删除、撤销。个人主页：头像、昵称、统计卡、热力图（React 版，用 react-calendar-heatmap 或自实现）。设置页：每日目标、密码修改。

### 技术亮点

**端到端类型安全**：tRPC 让前端调用 API 时自动获得后端返回类型，无需手动定义 TypeScript interface。面试时可以演示"改后端返回类型 → 前端立刻类型报错"的体验，展示 DX（开发者体验）意识。

### 验收标准

- 查词结果流式显示 AI 内容（打字机效果）
- Flashcard 组件支持手势滑动和键盘操作
- tRPC API 调用全链路类型安全（无 `as any`）
- 页面 LCP < 1.5s（Lighthouse 审计）
- 原有功能全部迁移，无回归

---

## Phase 4: 高级特性

**优先级**：P1 | **预计工时**：1-2 周 | **依赖**：Phase 3

### 目标

实现 Assessment Agent 和 WebSocket 实时对话交互，让系统具备主动测试和多轮对话能力。

### 任务清单

#### 4.1 Assessment Agent: 题目生成（L）

定义题型 schema（选择题、填空题、拼写题、听写题）。LLM prompt 根据单词列表 + 用户水平生成题目。JSON schema 约束输出格式。题目缓存策略：同一单词同一题型 24 小时内不重新生成。

#### 4.2 Assessment Agent: 评分逻辑（M）

前端提交答案 → 后端对比 → 评分（0-5）→ 更新 FSRS 卡片参数 → 返回正确答案 + 解析。拼写题支持大小写不敏感和常见拼写变体容错。听写题需要 TTS（使用浏览器 Web Speech API 或 Azure TTS）。

#### 4.3 测评前端组件（L）

选择题：四个选项卡片，点击后高亮正确/错误，显示解析。填空题：输入框 + 提交按钮，支持 hint。拼写题：听音频 + 拼写输入，实时字符匹配反馈。进度跟踪：完成 X/Y 题，正确率实时更新。

#### 4.4 WebSocket 实时对话（L）

对话界面：消息列表 + 输入框。用户消息 → WebSocket → Orchestrator Agent → 路由到对应 Agent → 流式返回。消息气泡逐字渲染。会话历史存储在 PostgreSQL `chat_sessions` 表，支持上下文连续对话（最多 20 轮）。

#### 4.5 Human-in-the-loop 集成（M）

LangGraph checkpoint + interrupt 机制：当 Assessment Agent 生成的题目不确定时，暂停图执行等待用户确认。用户可在对话中纠正 Agent 的理解（如"这个词我已经很熟了，不需要测"），Agent 更新用户画像。

### 技术亮点

**三个面试加分项**：WebSocket 双向实时通信（比单向 HTTP 更有技术含量）| LangGraph human-in-the-loop（展示 Agent 可控性和用户反馈闭环）| 自适应测评（LLM 生成 + FSRS 联动，展示 AI + 算法结合能力）

### 验收标准

- 测评流程完整：选题 → 答题 → 评分 → FSRS 更新
- 至少 3 种题型可交互
- 对话界面支持多轮对话和流式输出
- 测评结果正确影响后续复习间隔

---

## Phase 5: 学情分析与可观测性

**优先级**：P2 | **预计工时**：1-2 周 | **依赖**：Phase 2

### 目标

实现 Analyst Agent 学情分析报告，接入 ClickHouse 事件流和 OpenTelemetry 链路追踪，让系统具备数据驱动能力和可观测性。

### 任务清单

#### 5.1 ClickHouse 事件流（M）

定义 `learn_events` 表结构：event_id, user_id, event_type(lookup/review/quiz/checkin), word_id, metadata(JSON), created_at。在后端关键路径插入事件写入（异步，不阻塞主流程）。Redis Streams 做缓冲，ClickHouse 批量消费写入。

```sql
CREATE TABLE learn_events (
  event_id UUID DEFAULT generateUUIDv4(),
  user_id UInt32,
  event_type String,
  word_id String,
  metadata JSON,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, created_at);
```

#### 5.2 Analyst Agent: 分析查询（L）

实现 SQL 聚合查询模板：词汇增长曲线（每日累计词数）、复习效率（日均复习量 + 正确率趋势）、遗忘曲线（各 stability 区间分布）、学习时段分布（24 小时热力图）。查询结果以 JSON 返回图表数据。

#### 5.3 Analyst Agent: LLM 洞察生成（M）

将 SQL 聚合结果 + 用户画像传入 Claude 3.5，生成自然语言洞察："你的词汇增长速度在过去 30 天加快了 40%，但遗忘率在周三和周四明显升高——可能是这两天学习时段太晚导致记忆巩固不足。建议将复习时间提前到上午。"

#### 5.4 分析报告前端（M）

用 Recharts 渲染：词汇增长折线图、正确率趋势图、遗忘曲线分布图、学习时段热力图。LLM 洞察文本卡片。推荐建议列表。

#### 5.5 OpenTelemetry 集成（M）

安装 `@opentelemetry/auto-instrumentations-node`，自动 instrument HTTP / pg / redis。配置 OTLP exporter 发送到 Jaeger（Docker 容器）。在 LangGraph 节点添加 span：每个 Agent 调用是一个 span，记录 input/output/latency/token_cost。

#### 5.6 LangSmith 追踪（S）

配置 LangSmith API key，LangGraph 自动上报 Agent 调用链。在 LangSmith UI 可查看每次请求的完整 Agent 调用路径、token 消耗、prompt 和 completion 内容。用于 prompt 调优和成本分析。

### 技术亮点

**数据驱动 + 可观测性**：ClickHouse 列式存储 + OpenTelemetry 分布式追踪 + LangSmith Agent 追踪，三者组合展示了"从用户行为分析到系统性能监控到 AI 效果评估"的全链路可观测性。面试中这是中高级工程师的标志能力。

### 验收标准

- 学情报告页展示至少 4 个图表 + LLM 自然语言洞察
- Jaeger 可查看单次请求的完整 Agent 调用链路
- LangSmith 可查看 Agent prompt 和 completion
- ClickHouse 事件写入延迟 < 2s（异步批量）

---

## Phase 6: 生产部署与优化

**优先级**：P2 | **预计工时**：1 周 | **依赖**：Phase 5

### 目标

统一容器化部署，CI/CD 自动化，性能调优，替换 Nginx 为 Caddy，清理历史遗留脚本。

### 任务清单

#### 6.1 Dockerfile 编写（S）

多阶段构建：builder 阶段安装依赖 + 编译 TS → runner 阶段仅复制 dist + node_modules。前端 Next.js 独立 Dockerfile（standalone output）。后端 Hono Dockerfile。

#### 6.2 docker-compose.prod.yml（S）

生产编排：web（Next.js）+ server（Hono）+ pg + redis + qdrant + clickhouse + caddy。数据卷命名。健康检查。重启策略。资源限制。

#### 6.3 Caddy 替代 Nginx（S）

Caddyfile 配置自动 HTTPS（Let's Encrypt）。反向代理到 Next.js (3000) 和 Hono (3001)。gzip 压缩。静态资源缓存头。

```caddyfile
tmenglish.top {
  encode gzip
  handle /api/* {
    reverse_proxy hono:3001
  }
  handle {
    reverse_proxy web:3000
  }
}
```

#### 6.4 GitHub Actions CI/CD（M）

PR 触发：lint + typecheck + test + build。main 分支 push：构建 Docker 镜像 → push 到 Registry → SSH 连接服务器 → docker compose pull && up -d。环境变量通过 GitHub Secrets 注入。

#### 6.5 性能调优（M）

Qdrant 查询优化：HNSW index 参数调优（m=16, ef_construct=128）。PostgreSQL 连接池调优（max=20, idle=30s）。Next.js ISR 静态化查词页（高频单词）。Redis 缓存层（查词结果 5 分钟 TTL）。

#### 6.6 清理历史脚本（S）

删除所有 deploy*.py、fix_deploy.py、quick_deploy.py、restart_*.py 等重复脚本。保留 build-fts.js、build-examples.js 作为数据构建脚本移到 `scripts/` 目录。删除 server_prod.js（已合并到统一入口）。

### 技术亮点

**工程化展示**：多阶段 Docker 构建 + GitHub Actions CI/CD + Caddy 自动 HTTPS + 资源限制 + 健康检查，这套组合展示了"从开发到部署的完整工程化能力"。清理历史脚本则展示了"技术债管理意识"。

### 验收标准

- `docker compose -f docker-compose.prod.yml up -d` 一键启动全部服务
- PR 合并后自动部署，无需手动操作
- `tmenglish.top` 自动 HTTPS，页面正常加载
- 清理后项目根目录无冗余脚本，结构清晰

---

## 8. 里程碑与验收标准

### 关键里程碑

| 里程碑 | 完成阶段 | 可演示内容 | 面试讲解点 |
|---|---|---|---|
| **M1: AI 查词上线** | Phase 1 + 2.1-2.3 | 输入单词，流式返回 AI 记忆提示 | RAG 混合检索 + LangGraph 编排 + SSE 流式 |
| **M2: 智能背词闭环** | Phase 2.4-2.6 | AI 教学内容 + FSRS 复习调度 | LLM structured output + FSRS 算法 + 多模型路由 |
| **M3: 全新前端** | Phase 3 | Next.js 界面 + 流式交互 + Flashcard | React Server Components + tRPC 类型安全 |
| **M4: 自适应测评** | Phase 4 | AI 出题 + 答题 + 评分 + 对话交互 | WebSocket + LangGraph HITL + AI+算法结合 |
| **M5: 数据驱动** | Phase 5 | 学情报告 + 链路追踪 | ClickHouse + OpenTelemetry + LangSmith |
| **M6: 生产就绪** | Phase 6 | 一键部署 + CI/CD | Docker + Caddy + GitHub Actions |

### 技术亮点与面试讲解映射

| 技术点 | 所在阶段 | 面试可讲什么 |
|---|---|---|
| LangGraph 多 Agent 编排 | Phase 2 | 为什么选 LangGraph 而非 AutoGen/CrewAI（显式状态图 vs 对话式）；StateGraph 设计；条件路由和循环控制；checkpoint 持久化 |
| RAG 混合检索 | Phase 2 | Qdrant dense+sparse 混合检索原理；为什么不用纯语义检索（精确匹配问题）；embedding 模型选型；索引构建 pipeline |
| FSRS-5.0 算法 | Phase 2 | 遗忘曲线公式 R=exp(-t/S)；与 Anki SM-2 对比（31% 准确率提升）；参数含义（stability/difficulty/retrievability）；TypeScript 实现 |
| SSE 流式输出 | Phase 3 | EventSource API；分段传输（先静态后 AI）；前端逐 token 渲染；与 WebSocket 的选型对比 |
| tRPC 端到端类型安全 | Phase 3 | 无需代码生成即可获得类型推断；开发体验 vs REST+OpenAPI；与 GraphQL 对比 |
| WebSocket + LangGraph HITL | Phase 4 | 双向实时通信；Agent 可中断恢复；用户反馈闭环设计 |
| 多模型路由 | Phase 2 | 按场景路由（教学用 GPT-4o，测评用 DeepSeek）；成本优化策略；fallback 链；缓存层 |
| ClickHouse 事件分析 | Phase 5 | 列式存储 vs 行式存储；学习事件流设计；Redis Streams 缓冲 + 批量写入 |
| OpenTelemetry 追踪 | Phase 5 | 分布式追踪原理；自动 instrument vs 手动 span；Agent 调用链可视化 |
| Docker + CI/CD | Phase 6 | 多阶段构建优化；compose 编排；GitHub Actions pipeline；自动 HTTPS |

---

## 实施建议

**先走通再优化**：Phase 1-2 的 M1/M2 里程碑是 MVP，优先完成这两个里程碑，确保查词和背词闭环可演示。M3-M6 是增量优化，每个阶段完成后都可独立展示，不阻塞求职进度。

**数据先行**：Phase 2.2 的向量索引构建是耗时的前置工作（40 万条 embedding），建议最先启动，可以后台运行不阻塞其他开发。

**面试节奏**：完成 M2 后就具备了核心展示能力（AI 查词 + FSRS 背词），可以先开始面试。后续阶段在面试过程中持续推进，每次面试后根据反馈调整优先级。
