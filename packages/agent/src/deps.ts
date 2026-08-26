/**
 * Agent 依赖注入接口
 *
 * agent 包不反向依赖 server 包；server 启动时把这些能力实现注入进来。
 * 所有方法均与 server 的 db 接口对齐（TutorCacheDB / FsrsDB / WordbookDB / LookupService）。
 */

import type { CefrLevel, FsrsCardRow, TutorCacheRow, WordbookEntry } from '@tm/shared';
import type { LookupResponse } from './types.js';

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
  /** 用户 CEFR 水平（缺省 B1） */
  getCefrLevel?: (userId: number) => Promise<CefrLevel | undefined>;
}
