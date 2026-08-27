/**
 * Redis 客户端（ioredis）
 * - 通用 KV 缓存（setex / get / del）
 * - Streams（XADD / XREADGROUP / XACK / XLEN）用于事件缓冲
 * - 连接失败静默降级（开发环境无 Redis 时可运行）
 */

import Redis from 'ioredis';

export class RedisService {
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly url: string) {}

  get isAvailable(): boolean {
    return this.available;
  }

  /** 连接 Redis（失败不抛错，降级为不可用） */
  async connect(): Promise<void> {
    if (!this.url) return;
    try {
      this.client = new Redis(this.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });
      // 必须监听 error，否则 ioredis 的 error 事件会变成 unhandled 异常导致进程崩溃
      this.client.on('error', (err: Error) => {
        if (this.available) {
          console.warn('[REDIS] 连接错误（降级为内存实现）:', err.message);
          this.available = false;
        }
      });
      this.client.on('ready', () => {
        this.available = true;
        console.log('[REDIS] 连接成功');
      });
      await this.client.connect();
      if (this.client.status !== 'ready') {
        // 连接失败（retryStrategy 已放弃）——标记不可用并清理
        this.available = false;
        console.warn('[REDIS] 不可用（降级为内存实现）');
        this.client = null;
        return;
      }
      this.available = true;
      console.log('[REDIS] 连接成功');
    } catch (err) {
      this.available = false;
      console.warn('[REDIS] 不可用（降级为内存实现）:', (err as Error).message);
      this.client = null;
    }
  }

  private get c(): Redis {
    if (!this.client) throw new Error('Redis 不可用');
    return this.client;
  }

  // ===== KV 缓存 =====
  async get(key: string): Promise<string | null> {
    if (!this.available) return null;
    try {
      return await this.c.get(key);
    } catch {
      return null;
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.c.setex(key, ttlSeconds, value);
    } catch {
      /* ignore */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.c.del(key);
    } catch {
      /* ignore */
    }
  }

  // ===== Streams（事件缓冲） =====
  /** XADD：追加事件到 stream */
  async xadd(stream: string, fields: Record<string, string>): Promise<string | null> {
    if (!this.available) return null;
    try {
      const args: Array<string | number> = ['MAXLEN', '~', '10000'];
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v);
      }
      return await this.c.xadd(stream, ...args);
    } catch {
      return null;
    }
  }

  /** XREADGROUP：读取一批待消费消息 */
  async xreadgroup(
    stream: string,
    group: string,
    consumer: string,
    count: number,
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    if (!this.available) return [];
    try {
      const res = await this.c.xreadgroup('GROUP', group, consumer, 'COUNT', count, 'STREAMS', stream, '>');
      if (!res || res.length === 0) return [];
      const typed = res as unknown as Array<[string, Array<[string, Array<string | number>]>]>;
      const messages = typed[0]?.[1] ?? [];
      return messages.map(([id, kv]: [string, Array<string | number>]) => {
        const fields: Record<string, string> = {};
        for (let i = 0; i < kv.length; i += 2) {
          fields[String(kv[i])] = String(kv[i + 1]);
        }
        return { id, fields };
      });
    } catch {
      return [];
    }
  }

  /** XACK：确认消费 */
  async xack(stream: string, group: string, ...ids: string[]): Promise<void> {
    if (!this.available || ids.length === 0) return;
    try {
      await this.c.xack(stream, group, ...ids);
    } catch {
      /* ignore */
    }
  }

  /** XGROUP CREATE（不存在则创建） */
  async xgroupCreate(stream: string, group: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.c.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP 表示已存在，忽略
      const msg = (err as Error).message;
      if (!msg.includes('BUSYGROUP')) {
        console.warn('[REDIS] xgroup 创建失败:', msg);
      }
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.client = null;
    }
  }
}
