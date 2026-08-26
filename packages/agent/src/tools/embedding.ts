/**
 * Embedding 客户端
 *
 * - 首选 OpenAI 兼容 embedding API（EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL）
 * - 无 Key 时降级为本地确定性哈希向量（256 维），保证开发/离线可用；
 *   生产环境应配置真实 embedding 服务（text-embedding-3-small 或同类）
 */

import { OpenAIEmbeddings } from '@langchain/openai';

export interface EmbeddingClient {
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** OpenAI 兼容 embedding */
export class OpenAiEmbeddingClient implements EmbeddingClient {
  private readonly client: OpenAIEmbeddings;
  readonly dim: number;

  constructor(opts: { apiKey: string; baseUrl: string; model: string }) {
    this.dim = opts.model.includes('3-small') ? 1536 : 1536;
    this.client = new OpenAIEmbeddings({
      apiKey: opts.apiKey,
      model: opts.model,
      configuration: { baseURL: opts.baseUrl },
      // 批量大小与超时（控制成本与稳定性）
      batchSize: 64,
      maxRetries: 2,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const vectors = await this.client.embedDocuments(texts);
    return vectors.map((v) => Array.from(v));
  }
}

/**
 * 本地确定性哈希 embedding（降级方案）
 * 对每个 token 做字符哈希，叠加到 256 维向量，归一化。
 * 不适用于语义检索，仅用于开发联调与流程验证。
 */
export class LocalHashEmbedding implements EmbeddingClient {
  readonly dim = 256;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashVector(t));
  }

  private hashVector(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    const tokens = text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
    for (const tok of tokens) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % this.dim;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function createEmbeddingClient(config: EmbeddingConfig): EmbeddingClient {
  if (config.apiKey) {
    return new OpenAiEmbeddingClient(config);
  }
  // TODO: 生产环境请配置 EMBEDDING_API_KEY；当前降级为本地哈希向量
  console.warn('[EMBEDDING] 未配置 EMBEDDING_API_KEY，降级使用本地哈希向量（仅供开发）');
  return new LocalHashEmbedding();
}
