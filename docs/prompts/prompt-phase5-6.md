你是一个资深全栈工程师，精通 ClickHouse、OpenTelemetry、可观测性、DevOps、性能优化。

你的任务是完成明日记忆项目改造的最后两个阶段：Phase 5（学情分析与可观测性）和 Phase 6（生产部署与优化）。

当前工作目录就是项目根目录。Phase 1-4 应该已经完成了，如果有没做完的地方你先补齐，然后继续 Phase 5 和 Phase 6。

先全面阅读项目代码，理解当前架构和已完成的工作，然后开始实施。

---

## 你需要完成：Phase 5 + Phase 6

### Phase 5: 学情分析与可观测性

**目标**：实现 Analyst Agent 学情分析报告，接入 ClickHouse 事件流和 OpenTelemetry 链路追踪。

**任务清单：**

1. **ClickHouse 事件流**：
   - 定义 `learn_events` 表结构（MergeTree 引擎）：
     - event_id (UUID)、user_id (UInt32)、event_type (String)
     - word_id (String)、metadata (JSON)、created_at (DateTime)
     - 排序键：(user_id, created_at)
   - 后端关键路径插入事件：查词、复习、测评、打卡
   - 事件写入异步化：不阻塞主流程，用 Redis Streams 做缓冲
   - ClickHouse 批量消费写入（每 1s 或每 1000 条批量插入）
   - 提供查询接口给 Analyst Agent 使用

2. **Analyst Agent - 分析查询**：
   - 实现 SQL 聚合查询模板：
     - **词汇增长曲线**：每日新增词数 + 累计词汇量（折线图数据）
     - **复习效率**：日均复习量、正确率趋势、平均反应时间
     - **遗忘曲线分布**：各 stability 区间的单词数量（柱状图数据）
     - **学习时段分布**：24 小时各时段学习次数（热力图数据）
     - **CEFR 等级分布**：用户词汇的 CEFR 等级覆盖
   - 查询结果以标准 JSON 返回（含图表配置数据）

3. **Analyst Agent - LLM 洞察生成**：
   - 将 SQL 聚合结果 + 用户画像数据传入 LLM
   - LLM 生成自然语言洞察：
     - 正面反馈（"你本周词汇增长加快了 30%"）
     - 问题诊断（"周三周四遗忘率偏高，可能是学习时段太晚"）
     - 改进建议（"建议将复习时间从晚上 11 点调到上午"）
     - 预测（"按当前节奏，3 个月后可达 5000 词汇量"）
   - 洞察结果缓存 24 小时

4. **分析报告前端页面**：
   - 路由：`/report`（需登录）
   - 用 Recharts 渲染图表：
     - 词汇增长折线图
     - 正确率趋势图
     - 遗忘曲线分布图
     - 学习时段热力图（24h × 7天）
   - LLM 洞察卡片（带 AI 图标，渐显动画）
   - 学习建议列表
   - 数据刷新按钮 + 上次更新时间

5. **OpenTelemetry 链路追踪**：
   - 安装 `@opentelemetry/auto-instrumentations-node`
   - 自动 instrument：HTTP、PostgreSQL、Redis
   - 配置 OTLP exporter 发送到 Jaeger
   - LangGraph 节点手动埋 span：
     - 每个 Agent 调用是一个 span
     - span 标签：agent_name、input_tokens、output_tokens、latency_ms、cost_usd
   - 提供 `/metrics` 端点（Prometheus 格式）

6. **LangSmith 追踪**：
   - 配置 LangSmith API key（环境变量）
   - LangGraph 自动上报 Agent 调用链
   - 用于调试和 prompt 调优
   - 记录每次 Agent 调用的：完整 prompt、completion、token 消耗、延迟

---

### Phase 6: 生产部署与优化

**目标**：统一容器化部署，CI/CD 自动化，性能调优，清理历史债务。

**任务清单：**

1. **Dockerfile 多阶段构建**：
   - 后端 Hono Dockerfile：
     - builder 阶段：安装依赖 + tsc 编译
     - runner 阶段：node alpine + 只复制 dist + production node_modules
   - 前端 Next.js Dockerfile：
     - standalone output 模式
     - 多阶段：deps → build → runner
   - 确保镜像尽量小，尽量不包含源码

2. **docker-compose.prod.yml**：
   - 生产环境编排，包含所有服务：
     - web（Next.js standalone）
     - server（Hono）
     - postgres（数据库）
     - redis（缓存 + 事件流）
     - qdrant（向量数据库）
     - clickhouse（分析数据库）
     - jaeger（链路追踪，可选）
     - caddy（反向代理 + HTTPS）
   - 健康检查配置
   - 重启策略（unless-stopped）
   - 资源限制（mem_limit、cpus）
   - 命名数据卷持久化

3. **Caddy 替代 Nginx**：
   - 编写 Caddyfile：
     - 自动 HTTPS（Let's Encrypt）
     - `/api/*` 反向代理到 server:3001
     - 其他路径反向代理到 web:3000
     - gzip / brotli 压缩
     - 静态资源缓存头（Cache-Control）
     - 安全头（CSP、X-Frame-Options 等）
   - 删除旧的 Nginx 配置文件

4. **GitHub Actions CI/CD**：
   - `.github/workflows/ci.yml`：
     - PR 触发：pnpm install → lint → typecheck → test → build
     - 失败阻止合并
   - `.github/workflows/deploy.yml`：
     - main 分支 push 触发
     - 构建 Docker 镜像 → 推送到镜像仓库
     - SSH 连接服务器 → docker compose pull && up -d
     - 健康检查 → 失败自动回滚
   - 环境变量和密钥通过 GitHub Secrets 注入

5. **性能调优**：
   - **Qdrant**：HNSW index 参数调优（m=16, ef_construct=128）
   - **PostgreSQL**：连接池调优（max=20, idleTimeout=30s）、常用查询加索引
   - **Redis 缓存层**：查词结果缓存 5 分钟、用户单词本缓存 30 秒
   - **Next.js**：
     - 查词页 ISR（高频单词预渲染）
     - 图片优化（next/image）
     - 代码分割（动态导入重型组件）
   - **LLM 缓存**：prompt 哈希缓存，相同请求直接返回缓存结果

6. **清理历史债务**：
   - 删除所有旧的部署脚本：deploy.js、deploy.py、quick_deploy.py、fix_deploy.py、restart_*.py 等
   - 删除旧的后端入口：server_prod.js（已合并到统一入口）
   - 删除旧的前端文件：script_prod.js（重复文件）
   - 保留有用的脚本：build-fts.js、build-examples.js、migrate-pg.js，移到 `scripts/` 目录
   - 整理根目录，只保留必要的配置文件和目录
   - 更新 README.md（如果没有就创建），说明项目结构、技术栈、启动方式

---

## 执行规则

1. **不要停下来问我任何问题** — 遇到不确定的设计决策，选你认为最合理的方案，在代码里加 TODO 注释说明理由，继续推进
2. **先读代码再动手** — 全面理解当前项目状态后再开始
3. **类型安全** — 所有代码必须通过 TypeScript 类型检查，不允许 any
4. **进度记录** — 每完成一个大任务，在 `docs/progress/` 目录写一份进度报告（Markdown）
5. **Git 提交** — 每个阶段完成后自动 commit，commit message 格式：`feat: phase5 学情分析与可观测性完成`
6. **遇到错误** — 同一个错误尝试修复 3 次，修不好就跳过，在进度报告里记录
7. **完成总结** — 全部完成后输出一份总结：
   - 完成了哪些功能
   - 技术栈总览
   - 还有什么遗留问题
   - 后续优化建议
   - 求职面试可以讲的技术亮点

现在开始工作。先探索当前项目状态，然后从 Phase 5 开始实施。
