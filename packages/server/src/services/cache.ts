/**
 * 缓存服务（Phase 6 性能优化）
 *
 * - 基于 Redis 的 get/setex 封装，无 Redis 时静默跳过（直接执行回源逻辑）
 * - 查词结果缓存 5 分钟、用户单词本缓存 30 秒
 */

import type { RedisService } from './redis.js';

export class CacheService {
  constructor(private readonly redis: RedisService) {}

  get isAvailable(): boolean {
    return this.redis.isAvailable;
  }

  /** 读缓存（JSON） */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** 写缓存（JSON + TTL） */
  async setJson(key: string, ttlSeconds: number, value: unknown): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  /** 缓存包裹：命中直接返回，未命中执行回源并写入 */
  async getOrSet<T>(key: string, ttlSeconds: number, fallback: () => Promise<T>): Promise<T> {
    if (!this.redis.isAvailable) {
      return fallback();
    }
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;
    const value = await fallback();
    await this.setJson(key, ttlSeconds, value);
    return value;
  }

  /** 失效缓存 */
  async invalidate(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/** 缓存键约定 */
export const cacheKeys = {
  lookup: (word: string, direction: string): string => `cache:lookup:${direction}:${word.toLowerCase()}`,
  wordbook: (userId: number): string => `cache:wordbook:${userId}`,
};
