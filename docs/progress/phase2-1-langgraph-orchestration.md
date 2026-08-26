# Phase 2 - 任务 1：LangGraph 编排框架

## 做了什么

1. **Agent 状态** `packages/agent/src/state.ts`
   - `AgentStateAnnotation = Annotation.Root({...})`：userId / input / intent / word / cefrLevel / recentWords / lookupResult / tutorContent / reviewQueue / reviewFeedback / llmSupplement / response / error
   - 派生 `AgentState` / `AgentStateUpdate` 类型

2. **编排图** `packages/agent/src/graph.ts`
   - `StateGraph`：START → orchestrator → 条件路由（按 intent）→ lexicon / tutor / scheduler / report → END
   - 路由表：lookup→lexicon、learn→tutor、review→scheduler、assess→scheduler、report→report
   - `runAgent(deps, router, input)` 便捷入口

3. **Orchestrator 节点** `nodes/orchestrator.ts`
   - LLM structured output 意图识别（zod schema：intent + word + rating）
   - **无 LLM Key 时降级启发式规则**（关键词匹配），保证离线可运行
   - 加载用户上下文：CEFR 水平 + 最近 10 个词（供 Tutor/Report 注入）

4. **依赖注入** `deps.ts`
   - `AgentDeps` 接口（tutorCache / fsrsCards / wordbook / lookup / getCefrLevel）
   - agent 包不反向依赖 server，由 server 启动时注入实现

## 遇到的问题

- LangGraph 0.2.x 的 `Annotation` API 与旧版 `StateGraph({channels})` 不同，使用 `Annotation.Root` 写法。
- `BaseChatModel`/`BaseMessage` 从 `@langchain/core` 的导出路径与旧文档不同（chat_models / messages），按实际包版本修正。
- ts-fsrs 的 `IPreview` 类型索引 `Rating` 枚举（含 Manual）无法直接数字索引，用 `as unknown as Record<number, ...>` 转接。

## 验证

- [x] 集成测试 5/5：lookup/learn/review/assess/report 五种意图全部正确路由并产生响应
- [x] `tsc --noEmit` + ESLint 通过
