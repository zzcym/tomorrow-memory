/**
 * 向量索引构建脚本（Lexicon Agent - 离线构建）
 *
 * 读取 stardict.db 词典与 examples.db 例句，embedding 后批量写入 Qdrant：
 *   - dictionary collection（词条）
 *   - examples collection（例句）
 *
 * 特性：
 *   - 断点续传：checkpoint 文件记录每个 collection 已处理的最大 id，中断后可续跑
 *   - 批量 embedding（batch=64），控制 API 成本
 *   - 无 EMBEDDING_API_KEY 时降级本地哈希向量（仅供开发联调，生产请配置）
 *
 * 用法：
 *   pnpm build:index -- --limit 20000            # 只建 dictionary，限 2 万条
 *   pnpm build:index -- --target examples        # 只建 examples
 *   pnpm build:index -- --reset                  # 清空 checkpoint 重建
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createEmbeddingClient } from '../tools/embedding.js';
import { QdrantClient } from '../tools/qdrant.js';

/** monorepo 根目录（scripts → src → agent → packages → 根） */
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
// pnpm --filter 运行时 cwd 是包目录，显式加载根目录 .env
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: path.join(ROOT, '.env') });

interface CliArgs {
  limit: number;
  target: 'dictionary' | 'examples' | 'all';
  reset: boolean;
  dataDir: string;
  qdrantUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: Number(process.env.INDEX_LIMIT ?? 20000),
    target: 'all',
    reset: false,
    dataDir: process.env.DATA_DIR || ROOT,
    qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:6333',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--limit') args.limit = Number(argv[++i]) || 20000;
    else if (a === '--target') {
      const t = argv[++i]!;
      if (t === 'dictionary' || t === 'examples') args.target = t;
    } else if (a === '--reset') args.reset = true;
  }
  return args;
}

const CHECKPOINT_FILE = '.vector-index-checkpoint.json';

function loadCheckpoint(dataDir: string): Record<string, number> {
  const p = path.join(dataDir, CHECKPOINT_FILE);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveCheckpoint(dataDir: string, cp: Record<string, number>): void {
  fs.writeFileSync(path.join(dataDir, CHECKPOINT_FILE), JSON.stringify(cp, null, 2));
}

async function buildDictionary(
  qdrant: QdrantClient,
  embedding: ReturnType<typeof createEmbeddingClient>,
  dictPath: string,
  limit: number,
  checkpoint: Record<string, number>,
): Promise<void> {
  if (!fs.existsSync(dictPath)) {
    console.error(`[DICT] 词典文件不存在: ${dictPath}`);
    return;
  }
  const db = new DatabaseSync(dictPath, { readOnly: true });
  const collection = 'dictionary';
  const lastId = checkpoint[collection] ?? 0;
  const batchSize = 1000;
  let processed = 0;
  let upserted = 0;

  console.log(`[DICT] 构建 ${collection}（limit=${limit}, 从 id>${lastId} 继续）`);
  await qdrant.ensureCollection(collection, embedding.dim);

  let cursor = lastId;
  while (processed < limit) {
    const rows = db
      .prepare(
        `SELECT id, word, phonetic, definition, translation, collins, bnc, tag
         FROM stardict WHERE id > ? ORDER BY id ASC LIMIT ?`,
      )
      .all(cursor, batchSize) as Array<{
      id: number;
      word: string;
      phonetic: string | null;
      definition: string | null;
      translation: string | null;
      collins: number | null;
      bnc: number | null;
      tag: string | null;
    }>;
    if (rows.length === 0) break;

    // 构建 embedding 文本：word + 释义摘要（控制 token 成本）
    const texts = rows.map((r) =>
      [r.word, r.definition, (r.translation ?? '').split('\n').slice(0, 4).join(' ')]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500),
    );
    const vectors = await embedding.embed(texts);

    const points = rows.map((r, i) => ({
      id: r.id,
      vector: vectors[i]!,
      payload: {
        word: r.word,
        phonetic: r.phonetic ?? '',
        definition: r.definition ?? '',
        translation: (r.translation ?? '').slice(0, 2000),
        collins: r.collins ?? 0,
        bnc: r.bnc ?? 0,
        tag: r.tag ?? '',
      },
    }));
    await qdrant.upsert(collection, points);

    cursor = rows[rows.length - 1]!.id;
    checkpoint[collection] = cursor;
    saveCheckpoint(process.env.DATA_DIR ?? ROOT, checkpoint);
    processed += rows.length;
    upserted += rows.length;
    console.log(`[DICT] 已处理 ${processed}/${limit}（id 至 ${cursor}）`);
    if (rows.length < batchSize) break;
  }

  db.close();
  console.log(`[DICT] 完成：本次写入 ${upserted} 条，collection 总计约 ${await qdrant.count(collection)} 条`);
}

async function buildExamples(
  qdrant: QdrantClient,
  embedding: ReturnType<typeof createEmbeddingClient>,
  examplesPath: string,
  limit: number,
  checkpoint: Record<string, number>,
): Promise<void> {
  if (!fs.existsSync(examplesPath)) {
    console.error(`[EX] 例句库不存在: ${examplesPath}`);
    return;
  }
  const db = new DatabaseSync(examplesPath, { readOnly: true });
  const collection = 'examples';
  const lastId = checkpoint[collection] ?? 0;
  const batchSize = 1000;
  let processed = 0;

  console.log(`[EX] 构建 ${collection}（limit=${limit}, 从 id>${lastId} 继续）`);
  await qdrant.ensureCollection(collection, embedding.dim);

  let cursor = lastId;
  while (processed < limit) {
    const rows = db
      .prepare('SELECT id, en, zh FROM pairs WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(cursor, batchSize) as Array<{ id: number; en: string; zh: string }>;
    if (rows.length === 0) break;

    const vectors = await embedding.embed(rows.map((r) => r.en.slice(0, 300)));
    const points = rows.map((r, i) => ({
      id: r.id,
      vector: vectors[i]!,
      payload: { en: r.en, zh: r.zh },
    }));
    await qdrant.upsert(collection, points);

    cursor = rows[rows.length - 1]!.id;
    checkpoint[collection] = cursor;
    saveCheckpoint(process.env.DATA_DIR ?? ROOT, checkpoint);
    processed += rows.length;
    console.log(`[EX] 已处理 ${processed}/${limit}（id 至 ${cursor}）`);
    if (rows.length < batchSize) break;
  }

  db.close();
  console.log(`[EX] 完成：本次写入 ${processed} 条，collection 总计约 ${await qdrant.count(collection)} 条`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const checkpoint = args.reset ? {} : loadCheckpoint(args.dataDir);

  console.log(`[INDEX] Qdrant=${args.qdrantUrl}, target=${args.target}, limit=${args.limit}, reset=${args.reset}`);
  const embedding = createEmbeddingClient({
    apiKey: process.env.EMBEDDING_API_KEY ?? '',
    baseUrl: process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com',
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  });
  const qdrant = new QdrantClient({ url: args.qdrantUrl });

  const dictPath = process.env.DICT_DB_PATH || path.join(args.dataDir, 'stardict.db');
  const examplesPath = process.env.EXAMPLES_DB_PATH || path.join(args.dataDir, 'examples.db');

  if (args.target === 'dictionary' || args.target === 'all') {
    await buildDictionary(qdrant, embedding, dictPath, args.limit, checkpoint);
  }
  if (args.target === 'examples' || args.target === 'all') {
    await buildExamples(qdrant, embedding, examplesPath, args.limit, checkpoint);
  }

  console.log('[INDEX] 全部完成');
}

main().catch((err) => {
  console.error('[INDEX] 构建失败:', err);
  process.exit(1);
});
