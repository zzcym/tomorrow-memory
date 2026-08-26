/**
 * Qdrant 向量数据库客户端（REST，直接 fetch，不引入额外 SDK）
 */

export interface QdrantPoint {
  id: number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface QdrantSearchHit {
  id: number;
  score: number;
  payload?: Record<string, unknown>;
}

export interface QdrantClientOptions {
  url: string;
  /** 集合不存在时是否自动创建（默认 true） */
  autoCreate?: boolean;
}

export class QdrantClient {
  private readonly base: string;

  constructor(private readonly options: QdrantClientOptions) {
    this.base = options.url.replace(/\/+$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const resp = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Qdrant ${method} ${path} 失败: ${resp.status} ${text.slice(0, 300)}`);
    }
    return (await resp.json()) as T;
  }

  /** 确保 collection 存在（不存在则创建） */
  async ensureCollection(name: string, dim: number): Promise<void> {
    try {
      await this.request<{ result: boolean }>('GET', `/collections/${name}`);
      return;
    } catch {
      // 不存在 → 创建
    }
    await this.request('PUT', `/collections/${name}`, {
      vectors: { size: dim, distance: 'Cosine' },
    });
  }

  /** 批量写入 points（自动分块，单次上限 256） */
  async upsert(name: string, points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;
    for (let i = 0; i < points.length; i += 256) {
      const chunk = points.slice(i, i + 256);
      await this.request('PUT', `/collections/${name}/points`, {
        points: chunk.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload ?? {} })),
      });
    }
  }

  /** 向量搜索 */
  async search(name: string, vector: number[], limit: number): Promise<QdrantSearchHit[]> {
    const data = await this.request<{ result: QdrantSearchHit[] }>('POST', `/collections/${name}/points/search`, {
      vector,
      limit,
      with_payload: true,
    });
    return data.result ?? [];
  }

  /** 查询集合点数（用于断点续传校验） */
  async count(name: string): Promise<number> {
    try {
      const data = await this.request<{ result: { count: number } }>('POST', `/collections/${name}/points/count`, {
        exact: true,
      });
      return data.result?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /** 删除整个集合（重建索引用） */
  async deleteCollection(name: string): Promise<void> {
    await this.request('DELETE', `/collections/${name}`);
  }
}
