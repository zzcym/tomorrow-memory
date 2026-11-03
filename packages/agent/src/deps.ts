/**
 * Agent 依赖注入接口
 *
 * agent 包不反向依赖 server 包；server 启动时把这些能力实现注入进来。
 * 所有方法均与 server 的 db 接口对齐（TutorCacheDB / FsrsDB / WordbookDB / LookupService）。
 */

import type {
  AnalysisPeriod,
  AnalyticsDataset,
  CefrLevel,
  FsrsCardRow,
  TutorCacheRow,
  WordbookEntry,
} from '@tm/shared';
import type { LookupResponse } from './types.js';

/**
 * 分析周期。**唯一声明点** = `@tm/shared` 的 `types.ts:204`（两侧值域逐字相同 ⇒ 零语义漂移）。
 * 本模块只转发，`index.ts` 的再导出面一字不动，消费点无感。
 */
export type { AnalysisPeriod };

/** 学情分析端口（server 的 AnalystService 实现；ClickHouse 优先，DB 降级） */
export interface AnalystPort {
  analyze(userId: number, period: AnalysisPeriod): Promise<AnalyticsDataset>;
}

export interface TutorCachePort {
  get(word: string, level: CefrLevel): Promise<TutorCacheRow | null>;
  set(word: string, level: CefrLevel, contentJson: string, now: number): Promise<void>;
}

export interface FsrsCardPort {
  getCardsByUser(userId: number): Promise<FsrsCardRow[]>;
  getCard(userId: number, word: string): Promise<FsrsCardRow | null>;
  upsertCard(
    userId: number,
    word: string,
    fsrsDataJson: string,
    lastReview: number | null,
    now: number,
  ): Promise<void>;
}

export interface WordbookPort {
  getData(userId: number): Promise<WordbookEntry[]>;
}

export interface LookupPort {
  lookup(word: string, direction: 'auto' | 'en2zh' | 'zh2en'): Promise<LookupResponse | null>;
}

export interface AgentDeps {
  tutorCache: TutorCachePort;
  fsrsCards: FsrsCardPort;
  wordbook: WordbookPort;
  lookup?: LookupPort;
  /** 学情分析端口（Phase 5，report 意图使用） */
  analystPort?: AnalystPort;
  /** 用户 CEFR 水平（缺省 B1） */
  getCefrLevel?: (userId: number) => Promise<CefrLevel | undefined>;
}
