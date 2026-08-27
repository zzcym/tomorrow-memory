/**
 * 学情事件采集器（Phase 5）
 *
 * 流程：业务关键路径 → events.record()（异步、不阻塞）
 *      → Redis Streams（learn_events_stream）缓冲
 *      → 后台消费者每 1s 或积累 1000 条 → ClickHouse 批量插入 → XACK
 *
 * 降级：
 *  - 无 Redis：内存队列缓冲 + 定时 flush
 *  - 无 ClickHouse：事件记录日志后丢弃（不阻塞主流程）
 */

import { randomUUID } from 'node:crypto';
import type { ClickHouseClient } from './clickhouse.js';
import type { RedisService } from './redis.js';

export type LearnEventType = 'lookup' | 'review' | 'assess' | 'checkin' | 'word_added';

export interface LearnEvent {
  user_id: number;
  event_type: LearnEventType;
  word_id: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface EventCollectorOptions {
  /** 批量消费间隔（ms），默认 1000 */
  flushIntervalMs?: number;
  /** 批量上限，默认 1000 */
  batchSize?: number;
}

const STREAM = 'learn_events_stream';
const GROUP = 'learn_events_consumer';

export class EventCollector {
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  /** 内存降级队列 */
  private memoryQueue: LearnEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private dropped = 0;

  constructor(
    private readonly clickhouse: ClickHouseClient,
    private readonly redis: RedisService,
    options: EventCollectorOptions = {},
  ) {
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 1000;
  }

  /** 启动消费者（幂等） */
  async start(): Promise<void> {
    if (this.redis.isAvailable) {
      await this.redis.xgroupCreate(STREAM, GROUP);
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
    console.log(`[EVENTS] 采集器启动（间隔 ${this.flushIntervalMs}ms，批量 ${this.batchSize}）`);
  }

  /**
   * 记录事件（异步、不阻塞主流程；失败静默）
   */
  record(event: Omit<LearnEvent, 'created_at'>): void {
    const full: LearnEvent = { ...event, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
    try {
      const xid = this.redis.xadd(STREAM, {
        event_id: randomUUID(),
        user_id: String(event.user_id),
        event_type: event.event_type,
        word_id: event.word_id ?? '',
        metadata: JSON.stringify(event.metadata ?? {}),
        created_at: full.created_at!,
      });
      // Redis 不可用时同步降级内存队列
      void xid.then((id) => {
        if (id === null && !this.redis.isAvailable) {
          this.memoryQueue.push(full);
          if (this.memoryQueue.length >= this.batchSize) void this.flush();
        }
      });
    } catch {
      this.memoryQueue.push(full);
      if (this.memoryQueue.length >= this.batchSize) void this.flush();
    }
  }

  /** 批量消费：Redis Streams 或内存队列 → ClickHouse */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      // 1. Redis Streams 消费
      if (this.redis.isAvailable && this.clickhouse.isHealthy) {
        const messages = await this.redis.xreadgroup(STREAM, GROUP, 'worker-1', this.batchSize);
        if (messages.length > 0) {
          await this.insertToClickHouse(
            messages.map((m) => ({
              event_id: m.fields['event_id'] ?? randomUUID(),
              user_id: Number(m.fields['user_id'] ?? 0),
              event_type: m.fields['event_type'] ?? '',
              word_id: m.fields['word_id'] ?? '',
              metadata: m.fields['metadata'] ?? '{}',
              created_at: m.fields['created_at'] ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
            })),
          );
          await this.redis.xack(STREAM, GROUP, ...messages.map((m) => m.id));
        }
      }
      // 2. 内存队列（无 Redis 时的降级路径）
      if (this.memoryQueue.length > 0) {
        const batch = this.memoryQueue.splice(0, this.batchSize);
        if (this.clickhouse.isHealthy) {
          await this.insertToClickHouse(
            batch.map((e) => ({
              event_id: randomUUID(),
              user_id: e.user_id,
              event_type: e.event_type,
              word_id: e.word_id ?? '',
              metadata: JSON.stringify(e.metadata ?? {}),
              created_at: e.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
            })),
          );
        } else {
          // 无 ClickHouse：丢弃并计数（开发环境）
          this.dropped += batch.length;
          if (this.dropped % 100 < batch.length) {
            console.warn(`[EVENTS] ClickHouse 不可用，已丢弃 ${this.dropped} 条事件`);
          }
        }
      }
    } catch (err) {
      console.warn('[EVENTS] 批量消费失败:', (err as Error).message);
    } finally {
      this.flushing = false;
    }
  }

  private async insertToClickHouse(
    rows: Array<{
      event_id: string;
      user_id: number;
      event_type: string;
      word_id: string;
      metadata: string;
      created_at: string;
    }>,
  ): Promise<void> {
    await this.clickhouse.insert('learn_events', rows);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}
