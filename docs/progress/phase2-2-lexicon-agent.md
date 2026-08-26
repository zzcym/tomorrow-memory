# Phase 2 - 任务 2/3：Lexicon Agent（向量索引 + 查询）

## 做了什么

1. **Embedding 客户端** `tools/embedding.ts`
   - `OpenAiEmbeddingClient`：OpenAI 兼容 API（text-embedding-3-small 或同类），batchSize=64 控制成本
   - `LocalHashEmbedding`：无 API Key 时的确定性哈希向量降级（256 维，仅开发联调）
   - 工厂 `createEmbeddingClient()` 按配置切换

2. **Qdrant 客户端** `tools/qdrant.ts`
   - REST 直连（无额外 SDK）：ensureCollection（自动建集，Cosine）、upsert（自动分块 256）、search、count、deleteCollection

3. **向量索引构建脚本** `scripts/build-vector-index.ts`
   - 读 stardict.db → `dictionary` collection；examples.db → `examples` collection
   - **断点续传**：`.vector-index-checkpoint.json` 记录每个 collection 的最大已处理 id，中断可续跑
   - 批量 embedding + upsert，进度日志
   - 参数：`--limit N` / `--target dictionary|examples|all` / `--reset`，环境变量 `INDEX_LIMIT`
   - 词典字段：word/phonetic/definition/translation/collins/bnc/tag 全部入 payload

4. **查询 pipeline**（编排在 server 的 lookup 服务 + agent 的 lexicon 节点）
   - 精确查词（stardict，毫秒级）→ 未命中走在线 fallback（有道/dictionaryapi）→ LLM 补充（词源/记忆提示/同义词辨析）
   - 向量检索入口 `scripts/test-lookup.ts`：embedding → Qdrant search（词典 + 例句）
   - SSE 流式端点 `/api/agent/stream`：先推静态查词结果（`event: static`），再推编排结果（`event: done`）

## 遇到的问题

- `import.meta.dirname` 向上 4 级才是 monorepo 根（脚本位于 packages/agent/src/scripts），初次少算一级导致找不到词典文件。
- `.env` 中留空的值（`DATA_DIR=`）经 dotenv 解析为空字符串，`??` 不会兜底，需用 `||`。
- 本机无 Docker/Qdrant：脚本已可运行到 Qdrant 连接阶段（ECONNREFUSED 为预期），完整构建需 `docker compose -f docker-compose.dev.yml up -d qdrant` 后执行 `pnpm build:index`。

## 验证

- [x] 构建脚本路径/参数/降级逻辑正确（无 Qdrant 时错误信息清晰）
- [x] test-lookup 脚本就绪（依赖 Qdrant 实例，待 Docker 环境实测）
- [ ] 真实 embedding + Qdrant 端到端检索（遗留：需 Docker）
