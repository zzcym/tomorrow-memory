/**
 * 全局共享类型定义
 */

/** 单词本中的单个单词条目（前端 script.js 使用的数据结构，保持向后兼容） */
export interface WordbookEntry {
  word: string;
  /** 加入时间戳（ms） */
  addedAt?: number;
  /** 最近复习时间戳（ms） */
  lastReview?: number;
  /** 复习次数 */
  reviewCount?: number;
  /** 扩展字段：前端可能附加其它信息 */
  [key: string]: unknown;
}

/** 用户行（users 表） */
export interface UserRow {
  id: number;
  phone: string;
  password: string | null;
  created_at: number;
}

/** 个人主页行（profiles 表） */
export interface ProfileRow {
  user_id: number;
  nickname: string;
  avatar: string;
  daily_goal: number;
  updated_at: number;
}

/** 管理后台用户列表行 */
export interface AdminUserRow {
  id: number;
  phone: string;
  created_at: number;
  word_count: number;
  last_active: number | null;
  nickname: string | null;
  avatar: string | null;
}

/** 查词结果——英译中（/api/lookup 响应的一部分，保持兼容） */
export interface LookupEn2ZhResult {
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  groups: TranslationGroup[];
  exchange: Record<string, string>;
  examples: ExamplePair[];
  freq: number;
  tag: string;
  detail: string;
  audio: string;
}

/** 释义分组：pos = 词性，meanings = 释义列表 */
export interface TranslationGroup {
  pos: string;
  meanings: string[];
}

/** 双语例句对 */
export interface ExamplePair {
  en: string;
  zh: string;
}

/** 查词结果——中译英候选（/api/lookup 响应的一部分） */
export interface LookupZh2EnResult {
  query: string;
  sourceLang: 'zh' | 'en' | 'mixed';
  results: Zh2EnEntry[];
  error: string | null;
}

/** 中译英候选词条 */
export interface Zh2EnEntry {
  word: string;
  pos: string;
  definition: string;
  examples: ExamplePair[];
  synonyms: string[];
  phonetic: string;
}

/** CEFR 语言水平 */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Tutor 教学内容（LLM structured output 的四类内容） */
export interface TutorContent {
  /** 记忆口诀 */
  mnemonic: string;
  /** 词根词缀拆解 */
  wordRoot: string;
  /** 场景例句（3 个） */
  sceneExamples: SceneExample[];
  /** 易混淆词辨析 */
  confusable: string;
}

export interface SceneExample {
  en: string;
  zh: string;
  scene: string;
}

/** FSRS 复习卡片（fsrs_cards 表行） */
export interface FsrsCardRow {
  id: number;
  user_id: number;
  word: string;
  /** ts-fsrs Card 参数序列化（JSON） */
  fsrs_data: string;
  /** 上次复习时间（ms） */
  last_review: number | null;
  /** 创建时间（ms） */
  created_at: number;
  updated_at: number;
}

/** Tutor 教学缓存（tutor_cache 表行） */
export interface TutorCacheRow {
  id: number;
  word: string;
  level: CefrLevel;
  content: string;
  created_at: number;
}

/** 会话消息行（chat_messages 表） */
export interface ChatMessageRow {
  id: number;
  user_id: number;
  thread_id: string;
  role: string;
  content: string;
  created_at: number;
}

/** 测评缓存行（assessment_cache 表） */
export interface AssessmentCacheRow {
  id: number;
  word: string;
  qtype: string;
  question: string;
  created_at: number;
}

/** Agent 意图类型 */
export type AgentIntent = 'lookup' | 'learn' | 'review' | 'assess' | 'report';

/** 查词方向 */
export type LookupDirection = 'auto' | 'en2zh' | 'zh2en';

/** 英译中命中（stardict 完整结果，/api/lookup 响应格式） */
export interface LookupEn2ZhSuccess {
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  groups: TranslationGroup[];
  exchange: Record<string, string>;
  examples: ExamplePair[];
  freq: number;
  tag: string;
  detail: string;
  audio: string;
}

/** 英译中 fallback（在线 API 兜底结果） */
export interface LookupEn2ZhFallback {
  word: string;
  phonetic: string;
  translation: string;
  groups: TranslationGroup[];
  exchange: Record<string, string>;
  examples: ExamplePair[];
  notFound: boolean;
}

/** 中译英响应 */
export interface LookupZh2EnResponse {
  query: string;
  sourceLang: 'zh';
  results: Zh2EnEntry[];
  error: string | null;
}

/** 混合语言响应 */
export interface LookupMixedResponse {
  query: string;
  sourceLang: 'mixed';
  results: [];
  error: string;
}

/** 查词统一响应 */
export type LookupResponse = LookupEn2ZhSuccess | LookupEn2ZhFallback | LookupZh2EnResponse | LookupMixedResponse;
