/**
 * 全局共享类型定义
 *
 * §3.3 规则①：本文件里的旧 interface **逐步改为 `z.infer` 派生**，但
 * **不得删除或改名任何已导出的类型名**（`@tm/server`、`apps/web`、`@tm/agent` 都在 import）。
 * T-03 已派生的部分 = 四个契约覆盖的形状（词本 / 查词 / 评分 / 资料）+ 与它们同形的旧 interface；
 * 表行与分析数据集一类（`FsrsCardRow` / `*CacheRow` / `Analytics*`）留在本文件，
 * 等 T-06 的 `schema/**` 落地后再派生（列名是 T-06 的边界）。
 */

import type { ZodTypeAny } from 'zod';
import type {
  ProfileRowSchema,
  UserRowSchema,
} from './contracts/profile.js';
import type {
  LookupEn2ZhFallbackSchema,
  LookupEn2ZhSuccessSchema,
  LookupMixedResponseSchema,
  LookupResponseSchema,
  LookupZh2EnResponseSchema,
  SceneExampleSchema,
  TranslationGroupSchema,
  ExamplePairSchema,
  TutorContentSchema,
  Zh2EnEntrySchema,
  LookupDirectionSchema,
} from './contracts/lookup.js';
import type { WordbookEntryDto, WordbookEntrySchema } from './contracts/wordbook.js';

/**
 * `z.infer` 的等价写法，但只取类型：本文件保持**纯类型模块**，
 * 不把 zod 带进 `@tm/shared/types` 的运行时（旧客户端 bundle 里可以因此省掉整包校验器）。
 */
type Derived<T extends ZodTypeAny> = T['_output'];

/** 单词本中的单个单词条目（前端 script.js 使用的数据结构，保持向后兼容） */
export type WordbookEntry = Derived<typeof WordbookEntrySchema>;
/** 契约侧同名类型（同一个声明，re-export 便于 `@tm/shared/types` 单点取用）。 */
export type { WordbookEntryDto };

/** 用户行（users 表） */
export type UserRow = Derived<typeof UserRowSchema>;

/** 个人主页行（profiles 表） */
export type ProfileRow = Derived<typeof ProfileRowSchema>;

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
export type LookupEn2ZhResult = Derived<typeof LookupEn2ZhSuccessSchema>;

/** 释义分组：pos = 词性，meanings = 释义列表 */
export type TranslationGroup = Derived<typeof TranslationGroupSchema>;

/** 双语例句对 */
export type ExamplePair = Derived<typeof ExamplePairSchema>;

/** 查词结果——中译英候选（/api/lookup 响应的一部分） */
export interface LookupZh2EnResult {
  query: string;
  sourceLang: 'zh' | 'en' | 'mixed';
  results: Zh2EnEntry[];
  error: string | null;
}

/** 中译英候选词条 */
export type Zh2EnEntry = Derived<typeof Zh2EnEntrySchema>;

/** CEFR 语言水平 */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** Tutor 教学内容（LLM structured output 的四类内容） */
export type TutorContent = Derived<typeof TutorContentSchema>;

export type SceneExample = Derived<typeof SceneExampleSchema>;

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

/** 分析洞察缓存行（analyst_cache 表） */
export interface AnalystCacheRow {
  id: number;
  user_id: number;
  period: string;
  content: string;
  created_at: number;
}

/** Agent 意图类型 */
export type AgentIntent = 'lookup' | 'learn' | 'review' | 'assess' | 'report';

/** ===== 学情分析（Phase 5） ===== */

/** 词汇增长曲线数据点 */
export interface GrowthPoint {
  date: string;
  newWords: number;
  total: number;
}

/** 复习效率数据点 */
export interface ReviewEfficiencyPoint {
  date: string;
  reviewCount: number;
  /** 正确率（0-1），无数据时为 null */
  accuracy: number | null;
  /** 平均稳定性 */
  avgStability: number;
}

/** 遗忘曲线分布（stability 区间） */
export interface ForgettingBucket {
  range: string;
  count: number;
}

/** 学习时段分布（24h × 7d） */
export interface StudyHeatmapCell {
  hour: number;
  dow: number;
  count: number;
}

/** CEFR 等级分布 */
export interface CefrBucket {
  level: string;
  count: number;
}

/** 学情分析数据集（含图表配置数据） */
export interface AnalyticsDataset {
  period: string;
  generatedAt: number;
  growthCurve: GrowthPoint[];
  reviewEfficiency: ReviewEfficiencyPoint[];
  forgettingCurve: ForgettingBucket[];
  studyHeatmap: StudyHeatmapCell[];
  cefrDistribution: CefrBucket[];
  /** 数据来源：clickhouse | db-fallback */
  source: 'clickhouse' | 'db-fallback';
}

/** LLM 洞察 */
export interface AnalystInsight {
  type: 'positive' | 'warning' | 'suggestion' | 'prediction';
  text: string;
}

/**
 * 学情分析周期（本类型的**唯一声明点**）。
 * 真源原在 `packages/server/src/services/analyst.ts:21`（本轮**不改** `packages/server/**`，那里的同域
 * 声明与 REST 面 `routes/analyst.ts` 的 `PeriodQuerySchema` 保持原样）；上收 shared 只为消掉 App 侧的
 * 镜像声明 —— `apps/app/src/data/queries/analyst.ts` 里 T-26b 留的过渡件，下一轮 T-03r2b 换成 `import type`。
 */
export type AnalysisPeriod = '7d' | '30d' | '90d' | 'all';

/** 分析报告（图表 + 洞察 + 建议） */
export interface AnalysisReport {
  dataset: AnalyticsDataset;
  insights: AnalystInsight[];
  cached: boolean;
}

/** 查词方向 */
export type LookupDirection = Derived<typeof LookupDirectionSchema>;

/** 英译中命中（stardict 完整结果，/api/lookup 响应格式） */
export type LookupEn2ZhSuccess = Derived<typeof LookupEn2ZhSuccessSchema>;

/** 英译中 fallback（在线 API 兜底结果） */
export type LookupEn2ZhFallback = Derived<typeof LookupEn2ZhFallbackSchema>;

/** 中译英响应 */
export type LookupZh2EnResponse = Derived<typeof LookupZh2EnResponseSchema>;

/** 混合语言响应 */
export type LookupMixedResponse = Derived<typeof LookupMixedResponseSchema>;

/**
 * 查词统一响应（**旧形状**：英译中两个分支没有 `sourceLang`，消费方按 `'sourceLang' in r` 窄化）。
 * 新调用点要判别联合请用 `contracts/lookup.ts` 的 `LookupResultSchema`。
 */
export type LookupResponse = Derived<typeof LookupResponseSchema>;

/* ══════════════════════════════════════════════════════════════════
   以下为 T-03 **新增**导出（§3.3 规则①：只加不改名不删）
   评分 / 队列 / 资料 DTO —— 让 `@tm/shared` 单入口即可拿到契约派生类型。
   ══════════════════════════════════════════════════════════════════ */

/** 评分 / 队列 / 资料 / 凭据 DTO 的再导出（`RatingInput` = `1|2|3|4`，字符串形状由 `RatingSchema` 归一）。 */
export type { RatingInput, ReviewInputDto, ReviewResultDto } from './contracts/rating.js';
export type { QueueItemDto, ReviewQueueInputDto, ReviewQueueResultDto } from './contracts/review-queue.js';
export type { ProfileDto, ProfileSummaryDto, ProfileUpdateInputDto, AvatarInputDto } from './contracts/profile.js';
export type {
  LoginInputDto,
  RegisterInputDto,
  ChangePasswordInputDto,
  ForceUpgradeInputDto,
  AuthResultDto,
  MeResultDto,
} from './contracts/auth.js';
export type { RecentSearchItemDto } from './contracts/lookup.js';
export type { QueueMode, RatingValue } from './constants/limits.js';
