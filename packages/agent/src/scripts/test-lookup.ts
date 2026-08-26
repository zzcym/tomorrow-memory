/**
 * 查词 pipeline 测试脚本：embedding 生成 → Qdrant search
 *
 * 用法：pnpm --filter @tm/agent test-query -- <word>
 * 依赖：Qdrant 已启动且 dictionary collection 已构建（pnpm build:index）
 */

import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createEmbeddingClient } from '../tools/embedding.js';
import { QdrantClient } from '../tools/qdrant.js';

/** monorepo 根目录（scripts → src → agent → packages → 根） */
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
loadDotenv({ path: path.join(ROOT, '.env') });

async function main(): Promise<void> {
  const word = process.argv[2] ?? 'serendipity';
  const embedding = createEmbeddingClient({
    apiKey: process.env.EMBEDDING_API_KEY ?? '',
    baseUrl: process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com',
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  });
  const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });

  console.log(`查询: ${word}（向量维度 ${embedding.dim}）`);
  const [vector] = await embedding.embed([word]);
  if (!vector) throw new Error('embedding 返回空');

  const hits = await qdrant.search('dictionary', vector, 5);
  console.log('\nTop 5 结果:');
  for (const h of hits) {
    console.log(`  [${h.score.toFixed(4)}] ${String(h.payload?.word ?? '')}  ${String(h.payload?.definition ?? '').slice(0, 60)}`);
  }

  const exHits = await qdrant.search('examples', vector, 3);
  console.log('\n例句 Top 3:');
  for (const h of exHits) {
    console.log(`  [${h.score.toFixed(4)}] ${String(h.payload?.en ?? '').slice(0, 80)}`);
  }
}

main().catch((err) => {
  console.error('查询失败:', err);
  process.exit(1);
});
