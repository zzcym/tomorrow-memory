你是一个资深全栈架构师，精通 TypeScript、Node.js、React、LangGraph、LLM 应用开发。

你的任务是将这个英语单词学习项目（明日记忆 / Tomorrow Memory）从原生 JS + Express 的单体架构，改造成 Multi-Agent 架构的 AI 学习应用。

当前工作目录就是项目根目录。先全面阅读现有代码，理解项目结构和功能，然后开始实施。

---

## 你需要完成：Phase 1 + Phase 2

### Phase 1: 基础设施搭建

**目标**：将现有的纯 JS 单体项目改造成 TypeScript monorepo，建立 Docker Compose 开发环境，实现数据库抽象层。

**任务清单：**

1. **项目初始化**：
   - 创建 pnpm workspace monorepo 结构
   - 四个包：`packages/agent`（Agent 逻辑）、`packages/server`（后端服务）、`packages/shared`（共享类型工具）、`apps/web`（前端，先空着 Phase 3 再做）
   - 配置 `tsconfig.base.json`（strict mode、paths alias）
   - 配置 ESLint + Prettier
   - 根目录 `pnpm-workspace.yaml`

2. **数据库抽象层**：
   - 提取现有 server.js 和 server_prod.js 的重复数据库逻辑
   - 在 `packages/server/src/db/` 下定义统一接口：UserDB、WordbookDB、ProfileDB、CheckinDB
   - 提供 PostgreSQL 和 SQLite 两种实现
   - 通过环境变量 `DB_DRIVER=pg|sqlite` 切换
   - 接口必须有完整的 TypeScript 类型定义，不允许 any

3. **Express → Hono 迁移**：
   - 将所有 Express 路由迁移到 Hono
   - 迁移顺序：静态文件 → 认证中间件 → 查词 API → 单词本 API → 打卡 API → 个人主页 API → 管理 API
   - 保持所有 API 的请求/响应格式完全不变（前端不感知）
   - JWT 认证、bcryptjs 密码哈希等逻辑保留

4. **Docker Compose 开发环境**：
   - 编写 `docker-compose.dev.yml`
   - 包含四个服务：PostgreSQL 16、Redis 7、Qdrant（向量数据库）、ClickHouse
   - 数据卷挂载到本地持久化
   - 端口不要冲突（PG 5432、Redis 6379、Qdrant 6333、ClickHouse 8123/9000）

5. **环境变量管理**：
   - 将所有硬编码的密钥提取出来：JWT_SECRET、DATABASE_URL、DEEPSEEK_API_KEY、有道翻译 API Key 等
   - 创建 `.env.example` 模板
   - 创建 `.env` 文件（从 .env.example 复制，填上默认值）
   - Docker Compose 通过 env_file 注入

6. **数据库迁移**：
   - 新增 `fsrs_cards` 表（存储 FSRS 复习参数）
   - 新增 `tutor_cache` 表（缓存 LLM 生成的教学内容）
   - 写迁移脚本，能把现有单词本数据迁移到新表
   - 为每个已有单词初始化 FSRS 默认参数

---

### Phase 2: 核心 Agent 实现

**目标**：实现 LangGraph 编排框架和三个核心 Agent（Lexicon / Tutor / Scheduler）。

**任务清单：**

1. **LangGraph 编排框架**：
   - 安装 `@langchain/langgraph` 和相关 langchain 依赖
   - 定义 `AgentState` 状态类型（shared state）
   - 实现 Orchestrator Agent：用 LLM function calling 做意图识别
   - 意图分类：lookup（查词）、learn（教学）、review（复习）、assess（测评）、report（分析）
   - 用 StateGraph 定义图：orchestrator 节点 → 条件路由 → 各专业 Agent 节点
   - 代码结构：`packages/agent/src/graph.ts`、`state.ts`、`nodes/`、`tools/`

2. **Lexicon Agent - 向量索引构建**：
   - 读取现有 `stardict.db` 词典数据
   - 用 embedding 模型生成向量（text-embedding-3-small 或同等模型）
   - 批量写入 Qdrant 的 `dictionary` collection
   - 同样处理 `examples.db` 例句，写入 `examples` collection
   - 构建脚本支持断点续传（记录已处理 ID）
   - 注意控制 API 调用成本，用 batch 方式

3. **Lexicon Agent - 查询逻辑**：
   - 实现查词 pipeline：embedding 生成 → Qdrant hybrid search → Stardict 精确查询（fallback）→ 结果合并 → LLM 补充
   - LLM 补充内容：词源解析、记忆提示、同义词辨析
   - SSE 流式返回：先返回静态内容（毫秒级），再逐步追加 LLM 内容
   - 保留现有有道 API 和 dictionaryapi.dev 作为 fallback

4. **Tutor Agent - 教学内容生成**：
   - 用 LLM structured output（JSON schema 约束）生成四类内容
   - 四类内容：记忆口诀（mnemonic）、词根词缀拆解（wordRoot）、场景例句（sceneExamples，3个）、易混淆词辨析（confusable）
   - prompt 中注入：单词、用户 CEFR 水平、最近学习的 10 个词
   - 实现 PostgreSQL 缓存：`tutor_cache(word, level, content)`，相同单词+相同水平直接命中
   - 缓存命中率预期 85%+

5. **Scheduler Agent - FSRS-5.0 算法**：
   - 安装 `ts-fsrs` npm 包
   - 实现 FSRS 复习调度：计算每个单词的 retrievability（回忆概率）
   - 核心公式：R(t) = exp(-t / S)
   - 生成今日复习队列：R < 0.9 的单词按 R 从低到高排序
   - 实现复习结果更新逻辑：测评评分 → FSRS Rating → 更新 stability/difficulty
   - 将现有单词本数据初始化为 FSRS cards（默认 S=1, D=5）

6. **LLM 路由层**：
   - 在 `packages/agent/src/tools/llm-router.ts` 实现统一调用接口
   - 支持 DeepSeek（主要）+ 其他模型的 fallback 链
   - 按场景路由：教学类用强模型，分类/简单任务用快模型
   - 实现 token 计数和成本统计
   - 结果缓存：相同输入不重复调用 LLM

---

## 执行规则

1. **不要停下来问我任何问题** — 遇到不确定的设计决策，选你认为最合理的方案，在代码里加 TODO 注释说明理由，继续推进
2. **先读代码再动手** — 全面理解现有项目结构后再开始改，不要瞎改
3. **保持向后兼容** — 现有 API 的请求响应格式不变，现有功能不能用着用着坏了
4. **类型安全** — 所有代码必须通过 TypeScript 类型检查（`tsc --noEmit`），不允许 any
5. **进度记录** — 每完成一个大任务，在 `docs/progress/` 目录写一份进度报告（Markdown 格式），说明做了什么、遇到什么问题、怎么解决的
6. **Git 提交** — 每个阶段完成后自动 commit，commit message 格式：`feat: phase1 基础设施搭建完成`
7. **遇到错误** — 同一个错误尝试修复 3 次，修不好就跳过，在进度报告里记录下来，不要死循环
8. **完成总结** — 全部完成后输出一份总结：完成了哪些任务、还有什么遗留问题、下一步建议

现在开始工作。先全面探索项目结构，然后从 Phase 1 开始实施。
