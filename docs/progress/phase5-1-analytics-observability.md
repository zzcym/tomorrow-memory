# Phase 5 - 学情分析与可观测性

## 做了什么

### 1. ClickHouse 事件流
- **learn_events 表**（MergeTree，排序键 `(user_id, created_at)`）：event_id UUID / user_id UInt32 / event_type / word_id / metadata JSON / created_at DateTime
- **ClickHouse 客户端** `services/clickhouse.ts`：HTTP 原生 fetch（无 SDK 依赖）、`FORMAT JSONEachRow` 查询、NDJSON 批量插入、建表幂等、连接失败静默降级
- **Redis Streams 缓冲** `services/redis.ts` + `services/events.ts`：业务路径 `events.record()` 异步 XADD（不阻塞主流程）→ 后台消费者每 **1s** 或积累 **1000 条** XREADGROUP → ClickHouse 批量插入 → XACK；**无 Redis 降级内存队列、无 ClickHouse 丢弃计数**
- **关键路径埋点**：查词（REST /api/lookup，含 direction/hit）、复习（review.reviewCard，含 rating/stability）、测评（assessment.submit，含 score/qtype）、打卡（checkin.create）、添加单词（wordbook.add）

### 2. Analyst Agent - SQL 聚合
- `services/analyst.ts` 五类聚合模板（ClickHouse 优先 → DB 降级）：
  - 词汇增长曲线（每日新增 + 累计）
  - 复习效率（日均复习量 / 正确率（assess 事件 score）/ 平均稳定性）
  - 遗忘曲线分布（stability 分桶：0-1 / 1-2 / 2-4 / 4-8 / 8-16 / 16+）
  - 学习时段分布（24h × 7d）
  - CEFR 等级分布（stardict collins 星级 → CEFR 启发式映射）
- `packages/agent/src/tools/analyst.ts` + `nodes/analyst.ts`：SQL 聚合结果 + 用户画像 → LLM structured output 生成四类洞察（positive/warning/suggestion/prediction）；**无 LLM 时规则降级**
- **洞察缓存 24h**：`analyst_cache` 表（user_id + period 复合键），tRPC `analyst.report` 命中直接返回
- 图编排：report 意图 → analyst 节点（替换旧 report 节点）

### 3. 分析报告前端 `/report`
- Recharts 渲染：词汇增长折线图、复习量柱状图、遗忘曲线分布、学习时段热力图（24h×7d）、CEFR 分布
- LLM 洞察卡片（AI 图标 + 渐显动画 + 类型徽章：正面/诊断/建议/预测）
- 数据来源标识（ClickHouse / DB 降级）、刷新按钮（重新生成洞察）+ 上次更新时间、期间切换（7d/30d/90d/all）
- **代码分割**：Recharts 图表组件全部 `next/dynamic` 动态导入

### 4. OpenTelemetry
- `telemetry/tracing.ts`：`@opentelemetry/sdk-node` + `auto-instrumentations-node`（HTTP / PG / ioredis / DNS），OTLP HTTP exporter → Jaeger；`OTEL_ENABLED=false` 时 no-op
- **LangGraph 手动 span**（llm-router）：每次 LLM 调用 `llm.{model}` span，标签 `agent_name / input_tokens / output_tokens / latency_ms / cost_usd`（含流式 invokeStream）
- **/metrics 端点**（Prometheus 文本格式）：http_requests_total（method/path/status）、http_request_duration_seconds 直方图、agent 调用/成本指标预留
- **LangSmith**：`LANGSMITH_TRACING=true + LANGSMITH_API_KEY` 环境变量即启用（LangGraph 自动上报调用链），`.env.example` 已配置

## 遇到的问题
- **旧 report 节点不可达**：analyst 取代 report 后 LangGraph `UNREACHABLE_NODE` 校验失败，从图中移除 report 节点
- **OTel 自动 instrument 配置**：`instrumentation-fetch` 不存在于 auto-instrumentations-node 配置表，移除
- **ClickHouse/Redis 本机不可用**：降级路径实测（analyst 走 db-fallback、事件内存队列），生产需 `docker compose up`

## 验证
- [x] `analyst.report` 5/5：数据/洞察/来源/缓存命中
- [x] /metrics 返回 Prometheus 格式
- [x] 全量回归：tRPC 16/16、WS 3/3、旧 API 18/18
- [x] /report 页面 200、tsc 全包通过、lint 干净
- [ ] ClickHouse/Redis/Jaeger 端到端（需 Docker 环境，遗留）
