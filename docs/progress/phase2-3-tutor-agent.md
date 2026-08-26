# Phase 2 - 任务 4：Tutor Agent（教学内容生成 + 缓存）

## 做了什么

1. **Structured output 教学生成** `nodes/tutor.ts`
   - zod schema `TutorContentSchema`：mnemonic（记忆口诀）/ wordRoot（词根词缀拆解）/ sceneExamples（3 个场景例句）/ confusable（易混淆词辨析）
   - 通过 `router.createStructured('strong', schema)` 生成 JSON 约束输出，再用 `safeParse` 校验兜底
   - **prompt 注入**：单词、用户 CEFR 水平、最近学习的 10 个词（orchestrator 预加载）

2. **PostgreSQL/SQLite 缓存**（tutor_cache 表）
   - `(word, level)` 复合键：相同单词 + 相同水平直接命中（预期 85%+）
   - LLM 生成内容写入缓存；规则降级内容不写缓存（避免污染）
   - 缓存命中响应标注"（缓存命中）"

3. **无 LLM 降级**：`fallbackTutorContent()` 生成占位内容（带 TODO 注释），保证流程可用

4. **API 暴露**：`GET /api/tutor?word=&level=`（auth）

## 设计说明

- 教学用强模型（deepseek-reasoner）生成，质量优先于速度；意图分类用快模型（deepseek-chat）。
- 缓存层在 DB（tutor_cache 表），非内存——多实例共享，命中率更高。

## 验证

- [x] `/api/tutor` 接口测试通过（规则降级模式返回完整四类内容结构）
- [x] `/api/agent` learn 意图 → tutorContent 结构正确
- [ ] 真实 LLM 生成 + 缓存命中率实测（需 DEEPSEEK_API_KEY）
