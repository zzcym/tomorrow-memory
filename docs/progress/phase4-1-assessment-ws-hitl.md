# Phase 4 - 高级特性：Assessment Agent + WebSocket 对话 + HITL

## 做了什么

### 1. Assessment Agent（题目生成 + 评分）
- `packages/agent/src/tools/assessment.ts`
  - 三种题型：choice（四选一）/ fill（选词填空）/ spelling（拼写题），zod discriminatedUnion 约束
  - **难度自适应**：按 FSRS difficulty 选题型（D<4 简单 → choice；4-7 中等 → choice/fill；>7 困难 → fill/spelling）
  - **题目缓存**：`assessment_cache` 表（word, qtype, question, created_at），同一单词同一题型 24h 内命中不重复生成
  - **评分映射**（任务 1-5 档 → ts-fsrs Rating 1-4）：Perfect(5)→Easy(4)、Good(4)→Good(3)、Hard(3)→Hard(2)、Lapse(2)→Again(1)、Blackout(1)→Again(1)；犹豫/修改信号影响档位
  - 提交评分 → FSRS 更新（S/D/due）→ 返回正确答案/解析/下一复习时间
- tRPC：`assessment.generate`（5-10 题，从今日待复习单词选取）/ `assessment.submit`
- 前端 `/assess`：进度（第 N/共 M 题）、选择题四选项高亮正确/错误 + 解析、填空题（input + hint）、拼写题（Web Speech 朗读 + 实时字符匹配）、结束页（正确率/用时/平均分/掌握度变化）

### 2. WebSocket 实时对话（Hono + LangGraph）
- 后端：`@hono/node-ws` 集成，`createNodeWebSocket` → `injectWebSocket(server)`，`GET /ws?token=&threadId=` 升级
- 消息协议：client `{type:'message'|'resume', text}` → server `{type:'chunk'|'done'|'interrupt'|'error'}`
- 对话走 **Threaded Agent**（`packages/agent/src/threaded.ts`）：MemorySaver checkpoint + thread_id，每个会话独立状态
- Orchestrator 意图识别 → 路由到 Lexicon/Tutor/Scheduler/Report；**打字机效果**（服务端 24 字符/24ms 分片 + 前端增量渲染）
- **会话历史**：`chat_messages` 表（user_id, thread_id, role, content），`GET /api/chat/history` + `chat.history` tRPC，最多保留 20 轮（查询 limit 40 条）

### 3. Human-in-the-loop（LangGraph interrupt + checkpoint）
- Orchestrator 节点：输入意图完全不明确（无关键词无单词）时 `interrupt(问题)` 暂停反问
- 前端收到 `interrupt` 显示确认气泡，用户回答后 `{type:'resume'}` → `graph.invoke(Command({resume}))` 继续执行
- 支持指令：查词 / 教学 / 复习 / 测评 / 分析；用户可随时纠正（如"这个词我已经很熟了"→ 走 assess 评分更新画像）
- **关键坑**：LangGraph 0.2.x 的 interrupt 通过抛出数组包裹的信号对象暂停；invoke 返回的 state **不含** `__interrupt__`（被 Annotation 过滤），需 `graph.getState(config).tasks[].interrupts` 读取中断问题

## 验证
- [x] WS 3/3：消息→done（含 chunk）、模糊输入→interrupt、resume→继续完成
- [x] assessment 生成（含 24h 缓存命中）与 submit（评分→FSRS 更新）实测通过
- [x] `/assess`、`/chat` 页面 200
- [x] tRPC 16/16 全量回归、旧 API 18/18 兼容
