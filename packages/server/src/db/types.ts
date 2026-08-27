/**
 * 数据库抽象层接口定义
 *
 * 四个业务域接口：UserDB / WordbookDB / ProfileDB / CheckinDB，
 * 外加 FSRS 卡片与 Tutor 缓存（Phase 2 使用）。
 * AppDB 聚合所有域并持有 createUser（跨表事务）。
 *
 * 实现：PostgreSQL（db/pg.ts）与 SQLite（db/sqlite.ts），通过 DB_DRIVER 切换。
 */

import type {
  AdminUserRow,
  AnalystCacheRow,
  AssessmentCacheRow,
  CefrLevel,
  ChatMessageRow,
  FsrsCardRow,
  ProfileRow,
  TutorCacheRow,
  UserRow,
  WordbookEntry,
} from '@tm/shared';

/** 用户域 */
export interface UserDB {
  findByPhone(phone: string): Promise<UserRow | null>;
  findById(id: number): Promise<UserRow | null>;
  updatePassword(userId: number, hash: string): Promise<void>;
  countAll(): Promise<number>;
  /** 统计某时间点之后注册的用户数 */
  countCreatedSince(ts: number): Promise<number>;
  /** 管理后台用户分页列表（含脱敏前原始手机号，调用方负责脱敏） */
  listAdminUsers(page: number, pageSize: number): Promise<AdminUserRow[]>;
}

/** 单词本域 */
export interface WordbookDB {
  getData(userId: number): Promise<WordbookEntry[]>;
  saveData(userId: number, data: WordbookEntry[], now: number): Promise<void>;
  countAll(): Promise<number>;
  /** 所有用户及其单词列表（用于 FSRS 卡片初始化迁移） */
  getAllWordbooks(): Promise<Array<{ userId: number; data: WordbookEntry[] }>>;
}

/** 个人主页域 */
export interface ProfileDB {
  get(userId: number): Promise<ProfileRow | null>;
  /** 不存在则创建默认记录，返回记录 */
  ensure(userId: number): Promise<ProfileRow>;
  update(
    userId: number,
    patch: { nickname?: string; avatar?: string; daily_goal?: number },
    now: number,
  ): Promise<void>;
}

/** 打卡域 */
export interface CheckinDB {
  isCheckedIn(userId: number, date: string): Promise<boolean>;
  /** 幂等打卡（已存在则忽略） */
  checkin(userId: number, date: string, now: number): Promise<void>;
  /** 打卡日期列表（升序） */
  getDates(userId: number): Promise<string[]>;
  /** 连续打卡天数 */
  getStreak(userId: number): Promise<number>;
}

/** FSRS 复习卡片域（Phase 2 使用） */
export interface FsrsDB {
  getCard(userId: number, word: string): Promise<FsrsCardRow | null>;
  getCardsByUser(userId: number): Promise<FsrsCardRow[]>;
  upsertCard(
    userId: number,
    word: string,
    fsrsDataJson: string,
    lastReview: number | null,
    now: number,
  ): Promise<void>;
  deleteCard(userId: number, word: string): Promise<void>;
}

/** Tutor 教学缓存域（Phase 2 使用） */
export interface TutorCacheDB {
  get(word: string, level: CefrLevel): Promise<TutorCacheRow | null>;
  set(word: string, level: CefrLevel, contentJson: string, now: number): Promise<void>;
}

/** 实时对话历史域（Phase 4 使用，最多保留 20 轮） */
export interface ChatDB {
  addMessage(
    userId: number,
    threadId: string,
    role: string,
    content: string,
    now: number,
  ): Promise<void>;
  /** 最近 N 条消息（升序） */
  getRecentMessages(userId: number, threadId: string, limit: number): Promise<ChatMessageRow[]>;
}

/** 测评题目缓存域（Phase 4 使用，同一单词同一题型 24h 内不重复生成） */
export interface AssessmentDB {
  get(word: string, qtype: string): Promise<AssessmentCacheRow | null>;
  set(word: string, qtype: string, questionJson: string, now: number): Promise<void>;
}

/** 学情洞察缓存域（Phase 5 使用，洞察结果 24h 缓存） */
export interface AnalystCacheDB {
  get(userId: number, period: string): Promise<AnalystCacheRow | null>;
  set(userId: number, period: string, contentJson: string, now: number): Promise<void>;
}

/** 聚合数据库对象：所有域 + 跨表事务 + 生命周期 */
export interface AppDB {
  users: UserDB;
  wordbooks: WordbookDB;
  profiles: ProfileDB;
  checkins: CheckinDB;
  fsrs: FsrsDB;
  tutorCache: TutorCacheDB;
  chat: ChatDB;
  assessment: AssessmentDB;
  analystCache: AnalystCacheDB;
  /** 创建用户 + 默认 wordbook + 默认 profile（事务） */
  createUser(phone: string, now: number): Promise<number>;
  /** 初始化表结构 */
  init(): Promise<void>;
  /** 关闭连接 */
  close(): Promise<void>;
}

export type {
  UserRow,
  ProfileRow,
  WordbookEntry,
  FsrsCardRow,
  TutorCacheRow,
  AdminUserRow,
  ChatMessageRow,
  AssessmentCacheRow,
  AnalystCacheRow,
} from '@tm/shared';
