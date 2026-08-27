# 明日记忆 Multi-Agent 改造需求文档

> 版本 v2.0 | 2026-08-26

---

## 目录

1. [项目背景与现状分析](#1-项目背景与现状分析)
2. [现有项目诊断与改进建议](#2-现有项目诊断与改进建议)
3. [Multi-Agent 架构设计](#3-multi-agent-架构设计)
4. [技术选型](#4-技术选型)
5. [功能需求详情](#5-功能需求详情)
6. [非功能需求](#6-非功能需求)

---

## 1. 项目背景与现状分析

### 1.1 当前项目概述

**明日记忆**（Tomorrow Memory）是一个面向英语学习者的查词与背单词 Web 应用，已部署上线运行于 `tmenglish.top`。项目以帮助用户"查词 - 收藏 - 背诵 - 打卡"为核心闭环，覆盖英译中、中译英、间隔复习、每日打卡等基础功能。

**当前技术栈：**

| 层级 | 技术 | 说明 |
|---|---|---|
| 前端 | 原生 HTML / CSS / JS | 无框架，无构建工具，无 TypeScript |
| 后端 | Express.js | 单体架构，server.js 约 800 行 |
| 数据库 | SQLite + PostgreSQL | 两套后端入口，代码重复 |
| 认证 | JWT + bcryptjs | 手机号验证码 + 密码登录 |
| 部署 | PM2 + Nginx + Docker Compose | SSH 远程部署脚本 |
| 词典 | Stardict + ECDICT + FTS5 | 离线词典 + 有道 API |

**当前核心功能：**
- 查词：英译中、中译英、自动检测方向
- 背词：Flashcard 卡片，顺序 / 随机 / 间隔三种模式
- 单词本：localStorage + 服务端同步
- 打卡：每日目标、连续打卡天数
- 个人主页：统计、热力图、设置
- 后台管理：用户统计、列表分页

### 1.2 改造动机

**P0 - 求职技术展示**：当前项目技术栈较为基础（原生 JS + 单体 Express），缺乏能体现工程深度和技术广度的亮点。改造成 Multi-Agent 架构后，可展示 LLM 应用工程、分布式系统设计、实时通信、向量检索等多项能力。

**P1 - 产品体验升级**：当前的查词和背词体验是静态的——词典释义固定、复习算法简单（仅按 lastReviewTime 排序）、无个性化内容。引入 LLM 和 Multi-Agent 后，每个用户可以获得个性化的学习体验：AI 生成的记忆口诀、上下文例句、自适应测评、智能复习调度。

**P2 - 架构可扩展性**：单体 server.js 已经接近 800 行，继续添加功能会导致维护成本线性增长。Agent 架构天然支持模块化扩展，新功能只需新增 Agent 而无需修改现有逻辑。

---

## 2. 现有项目诊断与改进建议

### 2.1 架构层面问题

| 问题 | 现状 | 改进方案 |
|---|---|---|
| 双后端入口代码重复 | server.js（PG）和 server_prod.js（SQLite）大量逻辑相同，维护时需同步修改两处 | 统一为单一入口 + 数据库抽象层，通过环境变量切换数据库驱动 |
| 单体 server.js 膨胀 | 所有路由、中间件、业务逻辑、数据库操作混在 800 行文件中 | 按领域拆分模块：auth / dictionary / wordbook / review / admin，每个模块独立路由文件 |
| 无 TypeScript | 纯 JavaScript，无类型约束，重构和扩展时容易引入隐性 bug | 全栈 TypeScript，后端 tsx 运行，前端 Next.js 自带 TS 支持 |
| 无测试 | 项目无任何测试文件，无 CI/CD | 引入 Vitest 单元测试 + Supertest 集成测试，GitHub Actions CI |

### 2.2 功能层面问题

| 问题 | 现状 | 改进方案 |
|---|---|---|
| 复习算法过于简单 | 间隔模式仅按 lastReviewTime 升序排列，非真正的间隔重复算法 | 引入 FSRS（Free Spaced Repetition Scheduler）算法，基于遗忘曲线动态调度 |
| 词典释义固定无个性化 | 查词结果来自 Stardict 静态数据库，释义、例句固定不变 | LLM Agent 动态生成记忆口诀、词源解析、场景例句 |
| 无测评/检验环节 | 背词仅靠翻看卡片，无主动回忆测试 | Assessment Agent 生成多种题型（选词填空、释义选择、拼写测试） |
| 无学情分析 | 仅有单词数、打卡天数等粗粒度统计 | Analyst Agent 分析词汇覆盖面、遗忘曲线、学习效率，生成可视化报告 |
| 无实时交互 | 所有操作靠 HTTP 请求 - 响应，无流式输出 | WebSocket + SSE 流式输出 LLM 回复，实时更新复习状态 |

### 2.3 工程层面问题

| 问题 | 现状 | 改进方案 |
|---|---|---|
| 前端无构建体系 | 直接引用 script.js，无打包、无 Tree-shaking、无代码分割 | Next.js App Router，RSC + 客户端组件，自动代码分割 |
| 敏感信息硬编码 | JWT_SECRET、数据库密码、有道 API Key 散落代码中 | 统一环境变量管理，.env + Docker secrets |
| 部署脚本过多且重复 | deploy.js、deploy.py、quick_deploy.py、fix_deploy.py 等 10+ 个部署脚本功能重叠 | 统一 Docker Compose + CI/CD pipeline，一条命令部署 |
| 无日志收集 | console.log 输出到 PM2 日志，无结构化、无检索 | Pino 结构化日志 + OpenTelemetry 链路追踪 |

---

## 3. Multi-Agent 架构设计

### 3.1 整体架构

改造后的系统采用 **Orchestrator 模式**的 Multi-Agent 架构：一个编排智能体（Orchestrator）统一接收用户请求，根据意图分发给专业智能体（Agent）处理，各 Agent 之间通过共享状态和事件总线协作。

**架构图：**

```
                    ┌──────────────────────────────────┐
                    │         用户界面 (Next.js)         │
                    │   WebSocket │ SSE │ REST │ tRPC    │
                    └──────────────┬───────────────────┘
                                   │
                          ┌────────┴────────┐
                          │  API Gateway     │
                          │  (Hono + tRPC)   │
                          └────────┬────────┘
                                   │
                    ┌──────────────┴───────────────────┐
                    │       Orchestrator Agent          │
                    │  (LangGraph StateGraph)           │
                    │  - 意图识别  - 任务分发            │
                    │  - 结果聚合  - 上下文管理          │
                    └───┬────┬────┬────┬────┬──────────┘
                        │    │    │    │    │
            ┌───────────┘    │    │    │    └──────────────┐
            ▼                ▼    │    ▼                    ▼
  ┌─────────────────┐ ┌──────────┐ │ ┌──────────┐  ┌──────────────┐
  │  Lexicon Agent  │ │ Tutor    │ │ │Assess    │  │ Analyst      │
  │  词典智能体      │ │ Agent    │ │ │ Agent    │  │ Agent        │
  │                 │ │ 教学智能体│ │ │ 测评智能体│  │ 学情分析智能体│
  │ - RAG 语义检索  │ │ - 口诀生成│ │ │ - 题目生成│  │ - 遗忘曲线   │
  │ - 词源解析      │ │ - 场景例句│ │ │ - 自适应  │  │ - 覆盖分析   │
  │ - 多源聚合      │ │ - 记忆策略│ │ │ - 掌握评估│  │ - 效率报告   │
  └───────┬─────────┘ └────┬─────┘ │ └────┬─────┘  └──────┬───────┘
          │                │       │      │               │
          ▼                ▼       │      ▼               ▼
  ┌──────────────┐  ┌──────────┐  │  ┌──────────┐  ┌──────────────┐
  │  Qdrant      │  │  LLM     │  │  │ FSRS     │  │  ClickHouse  │
  │  Vector DB   │  │  Router  │  │  │ Engine   │  │  Analytics   │
  │              │  │          │  │  │          │  │              │
  │  词典向量索引 │  │ GPT-4o   │  │  │ 复习调度  │  │ 学习事件流   │
  │  例句向量索引 │  │ Claude   │  │  │ 难度估计  │  │ 行为分析     │
  │  语义搜索    │  │ DeepSeek │  │  │ 遗忘预测  │  │ 可视化数据   │
  └──────────────┘  └──────────┘  │  └──────────┘  └──────────────┘
                                  │
                          ┌───────┴────────┐
                          │ Scheduler Agent │
                          │ 调度智能体       │
                          │ - 复习队列管理   │
                          │ - 优先级排序     │
                          │ - 打卡联动       │
                          └────────────────┘
```

### 3.2 Agent 角色定义

系统共 6 个 Agent，每个 Agent 有明确的单一职责（Single Responsibility），通过 LangGraph 的 StateGraph 编排，Agent 间通过共享 State 对象传递上下文。

#### Orchestrator Agent（编排智能体）
- **优先级**：P0
- **职责**：接收用户请求，识别意图（查词 / 学习 / 测评 / 查看报告），分发给对应 Agent，聚合多 Agent 结果返回给用户
- **输入**：用户消息 + 会话历史 + 用户画像
- **输出**：意图分类 + Agent 调用链 + 聚合结果
- **实现**：LangGraph StateGraph，节点为各 Agent，边为条件路由。使用 function calling 做意图识别

#### Lexicon Agent（词典智能体）
- **优先级**：P0
- **职责**：智能查词，融合多数据源（离线词典 + 向量语义检索 + LLM 补充），返回结构化词义
- **输入**：查询词 + 方向（英→中 / 中→英 / 自动）
- **输出**：音标、词性分组释义、例句、词源、同义词、记忆提示
- **实现**：RAG pipeline，先用 Qdrant 语义检索召回相关词条，再由 LLM 整合补充。保留现有 Stardict/ECDICT 作为 fallback

#### Tutor Agent（教学智能体）
- **优先级**：P0
- **职责**：为每个单词生成个性化记忆内容——记忆口诀、词根词缀拆解、场景化例句、易混淆词辨析
- **输入**：单词 + 用户当前水平 + 历史记忆内容
- **输出**：记忆口诀、词根拆解、3 个场景例句、辨析笔记
- **实现**：LLM with structured output（JSON schema 约束），prompt 中注入用户学习历史以实现个性化。结果缓存到 PostgreSQL，避免重复生成

#### Assessment Agent（测评智能体）
- **优先级**：P1
- **职责**：根据用户当前复习的单词，动态生成多种题型的测试题，评估掌握程度，反馈给 Scheduler 调整复习间隔
- **输入**：待测单词列表 + 用户历史正确率 + 题型偏好
- **输出**：题目集合（选词填空、释义选择、拼写测试、听写）+ 评分结果 + 掌握度更新
- **实现**：LLM 生成题目 + 前端交互组件渲染。评分结果通过 FSRS stability/difficulty 参数影响复习调度

#### Scheduler Agent（调度智能体）
- **优先级**：P0
- **职责**：管理复习队列，基于 FSRS 算法计算每个单词的最佳复习时间，生成每日学习计划，联动打卡系统
- **输入**：用户全部单词的 FSRS 参数（stability, difficulty, retrievability）+ 当前时间
- **输出**：今日待复习列表（按优先级排序）+ 新词推荐 + 预计完成时间
- **实现**：FSRS-5.0 算法（TypeScript 实现），无需 LLM，纯算法调度。复习结果反馈给 Assessment Agent 评估掌握度，再更新 FSRS 参数

#### Analyst Agent（学情分析智能体）
- **优先级**：P2
- **职责**：分析用户学习数据（词汇量增长曲线、遗忘率、学习时段偏好、薄弱词群），生成可视化报告和学习建议
- **输入**：用户学习事件流 + 复习记录 + 测评成绩
- **输出**：学习报告 JSON（含图表数据 + LLM 总结 + 建议）
- **实现**：ClickHouse 存储事件流 + SQL 聚合查询 + LLM 生成自然语言洞察。前端用 Recharts 渲染可视化

### 3.3 Agent 通信与状态管理

**共享状态（Shared State）**：

LangGraph 的 StateGraph 维护一个跨 Agent 共享的状态对象，每个 Agent 读取需要的字段并写入自己的输出：

```typescript
{
  // 输入区
  userMessage: string,
  userId: number,
  sessionHistory: Message[],

  // Orchestrator 输出
  intent: "lookup" | "learn" | "assess" | "report",
  agentCalls: string[],

  // Lexicon Agent 输出
  lookupResult: {
    word: string,
    phonetic: string,
    groups: { pos: string, meanings: string[] }[],
    examples: string[],
    etymology: string,
    synonyms: string[]
  },

  // Tutor Agent 输出
  tutorContent: {
    mnemonic: string,
    wordRoot: string,
    sceneExamples: { en: string, zh: string }[],
    confusable: string
  },

  // Assessment Agent 输出
  quiz: {
    questions: Question[],
    results: Result[]
  },

  // Scheduler Agent 输出
  schedule: {
    todayReview: number[],
    newWords: number[],
    estimatedMinutes: number
  },

  // Analyst Agent 输出
  report: {
    charts: ChartData[],
    insights: string[],
    recommendations: string[]
  }
}
```

**事件驱动**：

异步事件（如学习完成、打卡成功）通过 Redis Streams 发布/订阅，解耦 Agent 间的异步通信：

```typescript
// 用户完成一次测评
await redis.xadd("events:assessment_completed", "*", 
  "userId", userId, "wordId", wordId, 
  "correct", isCorrect, "stability", newStability
);

// Analyst Agent 消费事件
await consumer.run({ stream: "events:assessment_completed" }, 
  async (msg) => { /* 写入 ClickHouse */ }
);
```

**LangGraph 选型理由**：相比 AutoGen 和 CrewAI，LangGraph 提供了显式的状态图（StateGraph）抽象，可以精确控制 Agent 的调用顺序、条件分支和循环。这对于学习场景中的"查词 → 教学 → 测评 → 调度"闭环至关重要——需要根据测评结果动态决定是否调整复习间隔，这是纯对话式 Agent 框架难以表达的。同时 LangGraph 原生支持 checkpoint（持久化会话状态），用户可以中断后继续。

---

## 4. 技术选型

### 4.1 整体技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 前端框架 | **Next.js 15 (App Router)** | React Server Components 减少客户端 JS 体积，内置路由、SSR、ISR。用 tRPC 做端到端类型安全 API |
| 后端框架 | **Hono** | 超轻量 Web 框架，基于 Web 标准 API，可在 Node.js / Bun / Cloudflare Workers 上运行。比 Express 快 4 倍，类型安全 |
| 语言 | **TypeScript 5.5+** | 全栈类型安全。tRPC 实现 API 层零代码生成的类型推断——前端调用后端 API 时自动获得返回类型 |
| Multi-Agent 框架 | **LangGraph.js** | LangChain 的图式 Agent 编排框架。支持条件路由、循环、checkpoint、human-in-the-loop、流式输出 |
| LLM 路由 | **LiteLLM / OpenRouter** | 统一 LLM 调用层，支持 GPT-4o / Claude 3.5 / DeepSeek V3 等多模型按场景路由：教学用 GPT-4o，测评用 DeepSeek（成本低），分析用 Claude |
| 向量数据库 | **Qdrant** | Rust 实现，内存占用低，支持稀疏+稠密混合检索（Hybrid Search）。用于词典语义检索和例句召回 |
| 关系数据库 | **PostgreSQL 16** | 保留现有 PostgreSQL，新增 `tutor_cache` 表缓存 LLM 生成结果，`fsrs_cards` 表存储复习参数 |
| 分析数据库 | **ClickHouse** | 列式存储，适合学习事件流的高频写入和聚合查询。存 `learn_events` 表，支撑学情分析 |
| 消息队列 | **Redis Streams** | 轻量事件流，无需额外中间件。用于 Agent 间异步通信和实时推送 |
| 实时通信 | **WebSocket (ws) + SSE** | WebSocket 用于双向交互（测评、对话），SSE 用于 LLM 流式输出（打字机效果） |
| 复习算法 | **FSRS-5.0** | 开源的间隔重复调度器，比 Anki 的 SM-2 算法准确率提升 31%。TypeScript 实现集成到 Scheduler Agent |
| 可观测性 | **OpenTelemetry + LangSmith** | OTel 收集 HTTP / DB / Redis 链路，LangSmith 追踪 Agent 调用链、token 消耗、prompt 效果 |
| 部署 | **Docker Compose + Caddy** | 统一容器编排，Caddy 替代 Nginx（自动 HTTPS，配置极简）。GitHub Actions CI/CD |

### 4.2 技术选型对比

#### Multi-Agent 框架对比

| 维度 | LangGraph | AutoGen | CrewAI |
|---|---|---|---|
| 编排模式 | 显式状态图，精确控制流程 | 对话式，Agent 间对话协作 | 角色扮演式，任务委派 |
| 状态管理 | 内置 checkpoint，支持持久化和恢复 | 无内置持久化 | 无内置持久化 |
| 条件路由 | 原生支持，边可以有条件 | 通过对话隐式实现 | 通过任务链实现 |
| 流式输出 | 原生支持 token 级流式 | 有限支持 | 不支持 |
| JS/TS 生态 | LangGraph.js 官方维护 | 仅 Python | 仅 Python |
| Human-in-the-loop | 原生支持中断 + 恢复 | 需要自行实现 | 不支持 |

**结论**：选 LangGraph.js。核心原因是显式状态图 + JS/TS 原生支持 + 流式输出，三者对学习场景的"查词 → 教学 → 测评 → 调度"闭环和实时交互体验至关重要。

#### 向量数据库对比

| 维度 | Qdrant | Pinecone | Milvus | pgvector |
|---|---|---|---|---|
| 部署方式 | 自托管 / SaaS | 仅 SaaS | 自托管 | PG 插件 |
| 性能 | 快（Rust） | 快 | 快（Go） | 中等 |
| 混合检索 | 原生支持 | 支持 | 支持 | 不支持 |
| 运维成本 | 低（单容器） | 零（SaaS） | 高（集群） | 零（PG 内） |
| 求职展示 | 好（Rust 性能话题） | 一般 | 好但过重 | 偏简单 |

**结论**：选 Qdrant。自托管展示运维能力，Rust 实现有性能话题，Hybrid Search 是技术亮点。词典数据量约 40 万条，Qdrant 单节点轻松覆盖。

### 4.3 LLM 调用策略

| 场景 | 模型 | 原因 | 预计成本/次 |
|---|---|---|---|
| 教学口诀生成 | GPT-4o | 创意性和中文表达能力强 | ~0.03 元 |
| 测评题目生成 | DeepSeek V3 | 结构化输出稳定，成本低 | ~0.005 元 |
| 意图识别 | DeepSeek V3 | 分类任务，无需强模型 | ~0.001 元 |
| 学情分析总结 | Claude 3.5 Sonnet | 长文本理解和洞察生成能力突出 | ~0.02 元 |
| 词源 / 辨析 | GPT-4o | 语言学知识准确度高 | ~0.02 元 |

通过 LiteLLM 统一路由，根据 `model_router` 配置自动选择模型。结果缓存到 PostgreSQL `tutor_cache` 表，相同单词+相同用户水平的查询直接命中缓存，大幅降低 API 成本。

---

## 5. 功能需求详情

### 5.1 智能查词（Lexicon Agent）

**优先级**：P0

**业务逻辑**：

用户输入查询词后，Lexicon Agent 执行三级检索策略：第一级，查询 Qdrant 向量数据库，通过语义相似度召回最相关的词典条目和例句；第二级，调用 LLM 补充词源解析、记忆提示等动态内容；第三级，若 LLM 不可用则回退到现有 Stardict/ECDICT 静态词典。查询结果通过 SSE 流式返回，先显示静态词典内容（毫秒级），再逐步追加 LLM 生成内容（1-3 秒）。

与现有实现的差异：当前查词仅返回静态数据库内容。改造后，每次查词都会附带 AI 生成的个性化记忆提示（如"hello 来源于德语 hallo，与 holiness（神圣）同源"），且例句会根据用户当前学习水平动态生成——初学者看到简单句，进阶者看到 TOEFL/GRE 难度的例句。

**API 设计**：

```
GET /api/lookup?word=hello&direction=auto
Accept: text/event-stream

// SSE 流式响应
data: {"type":"phonetic","data":"/həˈloʊ/"}
data: {"type":"translation","data":{"groups":[{"pos":"int.","meanings":["你好","喂"]}]}}
data: {"type":"examples","data":[...]}
data: {"type":"ai_mnemonic","data":"hello 来源于古英语 hāl..." }
data: {"type":"done"}
```

**数据流**：

```
用户输入 → Embedding (text-embedding-3-small)
         → Qdrant 语义检索 (top-5)
         → Stardict 精确查询 (fallback)
         → LLM 补充 (GPT-4o, structured output)
         → 结果合并 + 缓存写入
         → SSE 流式返回
```

### 5.2 AI 辅助记忆（Tutor Agent）

**优先级**：P0

**业务逻辑**：

当用户将单词加入单词本时，Tutor Agent 异步为该单词生成四类记忆内容：词根词缀拆解（如 "un-precedent-ed" → un(否定) + precedent(先例) + ed(形容词)）、记忆口诀（一句话帮助记忆，如 "precedent：总统有先例可循"）、场景例句（3 个不同场景的双语例句，难度匹配用户水平）、易混淆词辨析（如 precedent vs. president）。生成结果缓存到 PostgreSQL，后续访问直接读缓存。

LLM 调用使用 structured output（JSON schema 约束），确保返回格式一致，前端可安全解析。prompt 中注入用户当前 CEFR 等级和最近学习的 10 个单词，使生成内容与用户学习进度衔接。

**缓存策略**：

```typescript
// 缓存 key: word + user_level
// 缓存表: tutor_cache (word, level, content, created_at)
// 命中率预期: 85%+ （同一单词同一水平的内容可复用）

async function getTutorContent(word, userLevel) {
  const cached = await pg.getTutorCache(word, userLevel);
  if (cached) return cached;
  
  const content = await llm.generate({
    model: "gpt-4o",
    schema: tutorSchema,
    prompt: buildPrompt(word, userLevel)
  });
  
  await pg.saveTutorCache(word, userLevel, content);
  return content;
}
```

### 5.3 自适应测评（Assessment Agent）

**优先级**：P1

**业务逻辑**：

测评流程分为四个阶段：选题 → 答题 → 评分 → 反馈。选题阶段从用户今日待复习单词中选取 5-10 个，根据每个单词的 FSRS difficulty 参数决定题型——低难度单词出简单题型（释义选择），高难度单词出复杂题型（选词填空、拼写测试）。答题阶段前端展示交互式题目组件，用户作答后提交。评分阶段对比答案，记录正确/错误。反馈阶段将评分结果转化为 FSRS 评分（0-5 分），更新该单词的 stability 和 difficulty 参数，直接影响下次复习时间。

题型清单：释义选择（四选一）、选词填空（给定句子，从选项中选词填空）、拼写测试（听音频拼写单词）、语境应用（给场景，选最合适单词）。前两种由 LLM 生成，后两种结合 TTS 和 LLM。

**评分 → FSRS 映射**：

| 测评结果 | FSRS 评分 | 对复习间隔的影响 |
|---|---|---|
| 完全正确，快速作答 | 5 (Perfect) | 间隔 × 2.5 |
| 正确但犹豫 | 4 (Good) | 间隔 × 1.8 |
| 正确，但有修改 | 3 (Hard) | 间隔 × 1.2 |
| 错误，但看过答案后记得 | 2 (Lapse) | 间隔重置为 1 天 |
| 完全不会 | 1 (Blackout) | 间隔重置为当天 |

### 5.4 间隔复习调度（Scheduler Agent）

**优先级**：P0

**业务逻辑**：

Scheduler Agent 是纯算法组件，不调用 LLM。核心是 FSRS-5.0 算法的 TypeScript 实现。每个单词在数据库中维护四个参数：stability（记忆稳定性，值越大遗忘越慢）、difficulty（难度，值越大越难记）、retrievability（当前可提取性，即回忆概率，随时间衰减）、last_review（上次复习时间）。Scheduler 每日运行，遍历用户全部单词，计算每个单词的当前 retrievability，按 retrievability 从低到高排序生成今日复习队列，并结合 difficulty 控制每日新词量（难度高的日子少学新词）。

与现有实现的差异：当前"间隔模式"仅按 lastReviewTime 升序排列，等于"最久没看的先复习"。FSRS 基于认知科学模型，考虑了单词本身的难度和用户的记忆表现，能预测遗忘曲线，在最佳记忆窗口进行复习。

**FSRS 核心公式**：

```
// 可提取性（回忆概率），随时间衰减
R(t) = exp(-t / S)

// t: 自上次复习经过的时间（天）
// S: stability（稳定性），值越大遗忘越慢

// 稳定性更新（复习后）
S' = S * (1 + a * (1 - R) * (-b * D + c))

// D: difficulty, R: 当前可提取性, a/b/c: FSRS 参数

// 每日复习队列生成
todayReview = words
  .map(w => ({ ...w, R: retrievability(w, now) }))
  .filter(w => w.R < 0.9)  // 回忆概率低于 90% 需要复习
  .sort((a, b) => a.R - b.R);
```

### 5.5 学情分析报告（Analyst Agent）

**优先级**：P2

**业务逻辑**：

Analyst Agent 周期性（每日凌晨）和按需（用户查看报告页）分析用户学习数据。数据源是 ClickHouse 中的 `learn_events` 表，记录了用户每次查词、复习、测评的详细事件。Agent 执行三类分析：描述性分析（词汇量增长曲线、每日学习时长、正确率趋势）、诊断性分析（遗忘率最高的词群、学习时段效率对比、薄弱 CEFR 等级）、预测性分析（按当前节奏预计掌握 5000 词的日期、达到 GRE 水平的时间预估）。分析结果以 JSON 返回，包含图表数据和 LLM 生成的自然语言洞察。前端用 Recharts 渲染可视化图表。

**分析维度**：

| 维度 | 指标 | 数据源 |
|---|---|---|
| 词汇增长 | 每日新增词数、累计词汇量、词汇增长率 | wordbooks 表 + learn_events |
| 复习效率 | 日均复习量、正确率、平均反应时间 | learn_events (type=review) |
| 遗忘曲线 | 各 stability 区间的单词数、遗忘率 | fsrs_cards 表 |
| 学习节奏 | 学习时段分布、连续打卡天数、中断分析 | checkin_logs + learn_events |
| 词汇覆盖 | CEFR 等级分布、词频覆盖面、词性分布 | wordbooks + stardict |

### 5.6 实时对话交互

**优先级**：P1

**业务逻辑**：

用户可通过对话界面与系统交互，Orchestrator Agent 识别用户意图后路由到对应 Agent。例如用户输入"帮我分析一下 abandon 这个词"，Orchestrator 识别为"查词 + 教学意图"，并行调用 Lexicon Agent 和 Tutor Agent，聚合结果流式返回。用户输入"今天该复习什么"，Orchestrator 路由到 Scheduler Agent。用户输入"测一下我"，Orchestrator 路由到 Assessment Agent 开始测评。

对话界面通过 WebSocket 双向通信，LLM 输出通过 SSE 流式推送实现打字机效果。会话历史存储在 PostgreSQL `chat_sessions` 表，支持上下文连续对话（最多保留最近 20 轮）。

---

## 6. 非功能需求

### 6.1 性能

| 指标 | 目标 |
|---|---|
| 查词响应（静态部分） | < 100ms |
| LLM 流式首 token | < 800ms |
| FSRS 队列计算（5000 词） | < 50ms |
| 向量检索 | < 30ms |
| WebSocket 消息延迟 | < 100ms |
| 页面 LCP | < 1.5s |

### 6.2 可用性与降级

- LLM 不可用时，查词回退到 Stardict 静态词典，Tutor 内容缺失但不影响基础查词和复习
- Qdrant 不可用时，回退到 PostgreSQL LIKE 模糊查询
- ClickHouse 不可用时，分析功能暂不可用，但不影响学习功能
- Redis 不可用时，异步事件降级为数据库轮询
- WebSocket 断线自动重连（指数退避），重连后恢复会话

### 6.3 安全

- 所有 API 密钥通过环境变量注入，不硬编码
- JWT 认证保留现有方案，新增 refresh token 机制
- LLM 输出经结构化 schema 校验后再使用，防止 prompt injection
- 用户输入经过 sanitize 后传入 LLM prompt
- CORS 白名单限制，生产环境仅允许 tmenglish.top

---

## 求职技术亮点汇总

1. **LangGraph 多 Agent 编排** — 状态图 + 条件路由 + checkpoint
2. **RAG 混合检索** — Qdrant dense+sparse 混合检索
3. **FSRS-5.0 科学复习算法** — 比传统 SM-2 算法准确率提升 31%
4. **SSE + WebSocket 实时通信** — 流式输出 + 双向对话
5. **多模型路由** — GPT-4o / Claude / DeepSeek 按场景路由 + 缓存层
6. **tRPC 端到端类型安全** — 无代码生成的类型推断
7. **ClickHouse + OpenTelemetry 全链路可观测性**
8. **事件驱动架构** — Redis Streams 异步解耦
9. **Docker + Caddy + GitHub Actions CI/CD**
10. **全栈 TypeScript + Monorepo**
