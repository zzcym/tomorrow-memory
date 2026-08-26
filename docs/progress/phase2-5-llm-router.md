# Phase 2 - 任务 6：LLM 路由层

## 做了什么

`packages/agent/src/tools/llm-router.ts`

1. **统一调用接口** `LlmRouter`
   - `invoke(messages, role, cacheKey?)`：文本生成
   - `createStructured(role, zodSchema)`：JSON schema 约束的结构化输出（意图识别/教学内容）
   - `stats()`：累计调用次数、input/output tokens、估算成本（USD）
   - `hasLlm`：是否配置了 API Key

2. **场景路由**（按 role）
   - `strong`（教学/分析）→ `deepseek-reasoner`
   - `fast` / `classify`（查词补充/意图分类）→ `deepseek-chat`
   - 温度/最大 token 按场景区分

3. **Fallback 链**
   - DeepSeek 主 → 调用失败且配置了 `OPENAI_API_KEY`（可选 env）→ 备用 OpenAI 兼容端点重试

4. **Token 计数与成本统计**
   - 字符近似法（CJK 1 字符/token、其他 4 字符/token），不引入 tiktoken 重依赖
   - DeepSeek 参考价常量估算成本

5. **结果缓存**
   - `Map<cacheKey, Promise<result>>`：相同输入（消息+role）不重复调用
   - 词汇补充等场景显式传 cacheKey 复用

## 设计说明

- 无 Key 时 `hasLlm=false`，Orchestrator 降级启发式、Tutor 降级规则、Lexicon 跳过补充——整个系统离线可跑，配 Key 即增强。
- 成本统计挂在路由层，server 的 `/api/agent` 响应中携带 `stats`，便于观测。

## 验证

- [x] 无 Key 降级模式全链路测试通过（集成测试 5/5 + Agent API 7/7）
- [ ] 真实 DeepSeek 调用 + fallback + 缓存命中（需 DEEPSEEK_API_KEY，`.env` 已预留配置位）
