/**
 * 数据库抽象层接口定义
 *
 * 四个业务域接口：UserDB / WordbookDB / ProfileDB / CheckinDB，
 * 外加 FSRS 卡片与 Tutor 缓存（Phase 2 使用）。
 * AppDB 聚合所有域并持有 createUser（跨表事务）。
 *
 * 实现：PostgreSQL（db/pg.ts）与 SQLite（db/sqlite.ts），通过 DB_DRIVER 切换。
 *
 * T-06 追加（§10.2 判据④，本期所需方法一次列全，下游任务不再追加排队）：
 *   `users`   findCredentialsByPhone / findCredentialsById / createWithPassword /
 *             setPassword / activateIfEmpty / touchPasswordChanged
 *   `wordbooks` getData(存量) / applyEntries / getSyncState / applySync
 *   `snapshots` save / take / remove          —— R-11 撤销
 *   `audit`     append / listByUser           —— R-39⑤b 审计
 *   `flags`     get / set / list              —— §4.4.4 运行时开关
 * **既有方法体一字未改**（§10.2 T-06 行的风险缓解口径）；新逻辑只加新方法与新私有 helper。
 *
 * T-06 微轮（A-32）追加两件事，同样**只加不删不改**：
 *   A-32-1(b) 启动自检：`assertCredentialColumnsForBoot()` + 两驱动 `init()` 各调一次，
 *             缺 M1 两列即 fail-fast 并打印 `pnpm db:migrate`（见本文件末尾一节）。
 *   A-32-6   事务内 RMW：`wordbooks.applyMutate()`（`WordbookCurrent` / `WordbookPatch` /
 *             `planWordbookMutate()` 是两驱动共用的决策，SQL 之外没有第二份口径）。
 */

import { PHONE_PATTERN, safeJsonParse } from '@tm/shared';
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

/**
 * §6.2 漂移 1 的收口点：`users.phone` 在 sqlite 是 TEXT（不限长）、在 pg 是 VARCHAR(11)（会截断）。
 * 本期**不改列**（PRD §6.1-1 禁止放宽或收紧），改在两驱动的**同一入口**做断言，
 * 让"12 位手机号在 pg 侧被静默截断"这类溢出在进入 SQL 之前就消失。
 * @throws Error `INVALID_PHONE` 语义由 service 层翻译成 §4.6 的错误码
 */
export function assertPhone(phone: string): string {
  if (typeof phone !== 'string' || !PHONE_PATTERN.test(phone)) {
    throw new Error(`INVALID_PHONE: 手机号必须是 11 位 ${PHONE_PATTERN.source}`);
  }
  return phone;
}

/** 密码哈希列的写入前断言：空串不得被当成"已设密码"（R-39④ 的判空口径 `password IS NULL OR trim=''`）。 */
export function assertPasswordHash(hash: string): string {
  if (typeof hash !== 'string' || hash.trim() === '') {
    throw new Error('INVALID_PASSWORD_HASH: 不得写入空密码');
  }
  return hash;
}


/**
 * `users` 的**凭据视图**行（M1 两列 + 存量 `password`）。
 *
 * 为什么不直接扩 `UserRow`：`UserRow` 是 `@tm/shared` 里 zod 推导出来的响应侧类型（T-03 所有），
 * 把凭据列塞进去等于让任何 `findByPhone` 的返回值都自带密码哈希 → 泄漏面扩大。
 * 因此判据④里的"findByPhone"在 DB 层的落点是这两个**新方法**，既有 `findByPhone` 一字未改。
 */
export interface UserCredentialRow {
  id: number;
  phone: string;
  /** 存量列：NULL 或空串 = 从未设过密码（R-39④ 判空口径见 `EMPTY_PASSWORD_SQL`） */
  password: string | null;
  created_at: number;
  /** M1（R-40③）：0 = 上线前老账号，旧 token 全部仍可用（零掉线） */
  password_changed_at: number;
  /** M1（R-40④）：0 = 策略生效前签发的哈希，需强制改密；未做任何回填 */
  pw_policy_version: number;
}

/**
 * "空密码账号"的 SQL 片段（两驱动同一口径）。
 * 写成一个常量而不是各驱动各抄一遍，避免 §6.2 漂移表再添一行。
 */
export const EMPTY_PASSWORD_SQL = "(password IS NULL OR trim(password) = '')";

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

  /* ── T-06 新增（R-40③④ / R-39③④⑤b）：以下方法与上面既有方法并存，既有方法体未改 ── */

  /** 凭据视图读取（登录 / 改密 / 激活前置检查用）。命中前先在 DB 层收口 `assertPhone`。 */
  findCredentialsByPhone(phone: string): Promise<UserCredentialRow | null>;
  /** 凭据视图读取（token 签发点、审计回填用） */
  findCredentialsById(id: number): Promise<UserCredentialRow | null>;
  /**
   * 手机号 + 密码注册（R-39③）：users/wordbooks/profiles 三表事务，与 `createUser` 同形状。
   * `policyVersion` 由调用方（T-07 的策略常量）提供，DB 层不自行定义策略版本。
   */
  createWithPassword(
    phone: string,
    passwordHash: string,
    policyVersion: number,
    now: number,
  ): Promise<number>;
  /**
   * 改密（R-40②）：写 `password` + `password_changed_at = now` + `pw_policy_version = policyVersion`。
   * "必须验旧密码"是 service 的前置条件，DB 不越权判断。
   */
  setPassword(
    userId: number,
    passwordHash: string,
    policyVersion: number,
    now: number,
  ): Promise<void>;
  /**
   * 激活条件写（R-39⑤b）：**单条** `UPDATE ... WHERE id = ? AND (password IS NULL OR trim(password)='')`。
   * 两个并发请求只有一个 `changes === 1` 拿到 true —— 不靠读后写，因此无 TOCTOU。
   * @returns true = 本次认领成功；false = 已被其它请求写入或本来就有密码
   */
  activateIfEmpty(
    userId: number,
    passwordHash: string,
    policyVersion: number,
    now: number,
  ): Promise<boolean>;
  /**
   * 只推进 `password_changed_at`（R-40③：让旧 token 失效的登出型操作）。
   * **不碰 `password` 列**，因此不计入 §6.5-4 的三类写入点。
   */
  touchPasswordChanged(userId: number, now: number): Promise<void>;
}

/** `wordbooks` 的同步状态行（M4 两列 + 存量列）。 */
export interface WordbookSyncStateRow {
  user_id: number;
  /** 0 = 从未参与增量同步（service 按"全量首同步"处理） */
  sync_version: number;
  updated_at: number;
  /** JSON：词名 → deletedAt（墓碑）。物理类型 TEXT，两侧一致。 */
  tombstones: string;
}

/** `applySync` 的结果：失败时 `version` 仍是服务端当前版本（409 载荷要带它）。 */
export interface ApplySyncResult {
  ok: boolean;
  version: number;
  /** `stale` = baseVersion 已过期（CAS 未命中）；`missing` = 该行不存在 */
  reason?: 'stale' | 'missing';
}

/* ═══════════════ A-32-6：`wordbooks` 事务内 read-modify-write（T-09 报告 A-b）═══════════════ */

/**
 * `applyMutate` 的回调在**同一事务内、已持写锁后**读到的当前行。
 * 两驱动由同一个 `wordbookCurrentOf()` 归一 ⇒ 回调看到的形状与驱动无关。
 */
export interface WordbookCurrent {
  /** 该用户是否已有 `wordbooks` 行（`createUser` 会建，缺行是异常态；回调可决定直接写 `'[]'` 建回来） */
  exists: boolean;
  /**
   * `wordbooks.data` 的**原文**（列值为 NULL/缺列时按 `'[]'`，与 `getSyncState` 同口径）；行不存在 = `null`。
   * 要"未知键一字不动"（§6.1 M6 / 丢用户词不可逆）就基于它做合并，并把结果作为 `WordbookPatch.data` 的
   * **字符串分支**原样写回，不要先投影成 `WordbookEntry` 再序列化。
   */
  dataJson: string | null;
  /** `dataJson` 的解析结果（`safeJsonParse(原文, [])`）；行不存在 = `null` */
  entries: WordbookEntry[] | null;
  /** 当前 `sync_version`；行不存在 = 0 */
  sync_version: number;
  /** 墓碑列原文（JSON：词名 → deletedAt）；行不存在或列缺值 = `'[]'` */
  tombstones: string;
  /** 当前 `updated_at`；行不存在 = `null` */
  updated_at: number | null;
}

/** `applyMutate` 回调的产出（要写什么 + 要给调用方带回什么）。 */
export interface WordbookPatch<T = void> {
  /**
   * 新的 `data` 列，两种写法：
   *  - `WordbookEntry[]` → 由 `planWordbookMutate()` 做 `JSON.stringify` 后落库；
   *  - `string` → **逐字落库**（不重新序列化）。从 `current.dataJson` 起合并时走这一支，
   *    才能保证条目里的未知键原样保留。
   */
  data: WordbookEntry[] | string;
  /** 新的 `tombstones` 原文；**省略 = 本次不碰墓碑列**（与 `applyEntries` 的整数组覆盖语义一致） */
  tombstones?: string;
  /** 原样交给调用方的值（例如"本次真正改动了什么""要回给客户端的投影"） */
  value?: T;
}

/** `planWordbookMutate()` 的产出：两驱动共用的"写什么/是否真的变了/新版本号"。 */
export interface WordbookMutationPlan<T = void> {
  /** 要落库的 `data` 列内容（已序列化） */
  dataJson: string;
  /** 要落库的 `tombstones` 列内容（`WordbookPatch.tombstones` 省略时 = 当前值，即"不碰"） */
  tombstones: string;
  /** 载荷与当前行逐字相同 ⇒ `false` ⇒ 不写、`sync_version` 不 ++（§4.4.2 幂等重放） */
  changed: boolean;
  /** 写入后的 `sync_version`（未写 = 原值） */
  version: number;
  /** 需要建 FSRS 卡的条目（`data` 是字符串分支时按原文解析，与 `applyEntries` 同一动作） */
  entries: WordbookEntry[];
  /** 回调给的 `value` 原样透传 */
  value: T | undefined;
}

/** `applyMutate` 的结果。 */
export interface WordbookMutateResult<T = void> {
  /** 回调 `value` 的原样透传（没给就是 `undefined`） */
  value: T | undefined;
  /** 写入后的 `sync_version`；未写 = 原值 */
  version: number;
  /** 本次是否真的写了行 */
  wrote: boolean;
}

/** 单词本域 */
export interface WordbookDB {
  getData(userId: number): Promise<WordbookEntry[]>;
  saveData(userId: number, data: WordbookEntry[], now: number): Promise<void>;
  countAll(): Promise<number>;
  /** 所有用户及其单词列表（用于 FSRS 卡片初始化迁移） */
  getAllWordbooks(): Promise<Array<{ userId: number; data: WordbookEntry[] }>>;

  /* ── T-06 新增（§4.4.3 单一落库路径 / R-03①④） ── */

  /** 读同步状态（含 `tombstones` 原文与 `sync_version`）；行不存在返回 null。 */
  getSyncState(userId: number): Promise<WordbookSyncStateRow | null>;
  /**
   * **单一落库路径**（§4.4.3）：整数组覆盖 + `sync_version` 单调推进，一次事务完成。
   * 集合实际未变（序列化后逐字相等）→ 不 ++（§4.4.2 幂等重放）。
   * 与 `saveData` 一样为新词补建 FSRS 卡（New 状态，与存量行为一字不差）。
   * @returns 写入后的 `sync_version`
   */
  applyEntries(userId: number, data: WordbookEntry[], now: number): Promise<number>;
  /**
   * 乐观 CAS 写（R-03①：`baseVersion` 不匹配即 `stale`，由 service 翻成 409 `WORDBOOK_STALE`）。
   * 版本只在本次集合与旧集合不同时 +1。
   */
  applySync(
    userId: number,
    data: WordbookEntry[],
    tombstonesJson: string,
    baseVersion: number,
    now: number,
  ): Promise<ApplySyncResult>;

  /**
   * **事务内 read-modify-write**（A-32-6 / T-09 报告 A-b）：一次事务里
   * 读当前行（sqlite `BEGIN IMMEDIATE`；pg `SELECT … FOR UPDATE` 行锁）→ 回调投影 → 写回 → 返回结果。
   *
   * 存在的原因：`applySync` 要客户端给 `baseVersion`、`applyEntries` 不碰墓碑列，
   * 于是 service 层只能"读投影 → merge → CAS 覆写"并自己重试 16 轮，
   * 极端并发下那一轮**不写墓碑**（T-09 报告 §6-5 的残余风险）。本方法把读与写收进同一个事务，
   * 调用方不再需要 CAS 循环。
   *
   * 语义（两驱动逐条相同，实现共用 `wordbookCurrentOf()` + `planWordbookMutate()`，只差 SQL）：
   *  - 回调**必须是同步纯函数**：不得 `await`、不得做 IO；它拿到的是已经持锁后的当前行。
   *  - `WordbookPatch.data` 给字符串 ⇒ 该串**逐字落库**（未知键原样保留的唯一正确用法）；
   *    给数组 ⇒ `JSON.stringify` 后落库。`wordbooks.data` 的 JSON 形状本方法一字不动、不校验、不排序。
   *  - `WordbookPatch.tombstones` 省略 ⇒ 本次不碰墓碑列；给了 ⇒ 整列覆盖。
   *  - 写回内容与当前行**逐字相同** ⇒ 不写、`sync_version` 不 ++（幂等重放，§4.4.2）。
   *  - 回调抛错 / 写抛错 ⇒ 整个事务回滚，库里那一串保持改动前的字节。
   *  - 与 `applyEntries` 一样为新词补建 FSRS 卡（同事务内，`ON CONFLICT DO NOTHING`）。
   *  - 幂等要求由**调用方**负责：回调要写成"同一份输入重复执行结果相同"，
   *    因为 pg 侧行锁等待与 sqlite 侧 `SQLITE_BUSY` 重试都可能让同一请求跑到两次回调。
   */
  applyMutate<T = void>(
    userId: number,
    mutate: (current: WordbookCurrent) => WordbookPatch<T>,
    now: number,
  ): Promise<WordbookMutateResult<T>>;
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
  /**
   * M7 / R-41（T-25）：**属主过滤读**。只返回 `user_id = userId` 的行；`user_id IS NULL`（改造前的
   * 无主题面）与属主是他人的行一律读不到 ⇒ `null`。禁止任何"NULL 视为公共池/视为首个访问者"的捷径
   * （PRD R-41③ 定案 (b)），口径同 §10.2 T-11 行"属主不确定即拒读、403 而非 500"。
   * ⚠ 上面两行无属主的 `get`/`set` 是 §10.4 第 9 行 block-append「0 既有行变更」下删不掉的遗留面
   * （要删 = 改既有行 = 越界）；`test/integration/assessment-isolation.spec.ts` 钉住"全仓 0 调用点"。
   */
  getOwned(word: string, qtype: string, userId: number): Promise<AssessmentCacheRow | null>;
  /** M7 / R-41（T-25）：**带属主的写入**。`ON CONFLICT (word,qtype) DO UPDATE` 把 `user_id` 改写成当前写入者（缓存挤占语义，代价登记 RK-14）。 */
  setOwned(word: string, qtype: string, userId: number, questionJson: string, now: number): Promise<void>;
}

/** 学情洞察缓存域（Phase 5 使用，洞察结果 24h 缓存） */
export interface AnalystCacheDB {
  get(userId: number, period: string): Promise<AnalystCacheRow | null>;
  set(userId: number, period: string, contentJson: string, now: number): Promise<void>;
}

/* ══════════════════ 以下三个域为 T-06 新增（§6.1 M2/M3/M5） ══════════════════ */

/** `review_snapshots` 行（M2，R-11 撤销）。`prev_data` 是 ts-fsrs 卡片的**序列化原文**，DB 层不解析。 */
export interface ReviewSnapshotRow {
  id: number;
  user_id: number;
  word: string;
  /** 复习前的 fsrs_data 原文（4.7.1 序列化格式，A-2 钉死版本，DB 层一字不动地存回去） */
  prev_data: string;
  prev_due: number | null;
  reps_before: number;
  created_at: number;
}

/** 复习撤销快照域（R-11） */
export interface ReviewSnapshotDB {
  /** 存一条快照，返回 id */
  save(
    userId: number,
    word: string,
    prevData: string,
    prevDue: number | null,
    repsBefore: number,
    now: number,
  ): Promise<number>;
  /**
   * 取出 `(user_id, word)` 最近一条快照并**同事务删除**（"撤销即消费"，防重复回滚）。
   * @returns 无快照时 null
   */
  take(userId: number, word: string): Promise<ReviewSnapshotRow | null>;
  /** 按 id 删除（过期清理 / 用户主动放弃撤销机会） */
  remove(id: number): Promise<void>;
}

/**
 * `account_audit_log` 的动作枚举（§4.5 R-39⑤b）。
 * 类型上仍兼容 `string`（本期只落地这两个值，后续任务加动作不需改 DB 层）。
 */
export type AccountAuditAction = 'account_activated' | 'password_upgraded' | string;

/** 审计动作结果：只有这两种取值（§4.5：失败也要落一行，否则"激活失败"无从对账）。 */
export type AccountAuditResult = 'ok' | 'fail' | string;

/** `audit.append()` 入参（驼峰；落库为 snake_case 列）。 */
export interface AccountAuditInput {
  userId: number;
  /** 手机号后 4 位；**不得**传完整手机号，更不得传密码或其 hash */
  phoneMasked?: string | null;
  action: AccountAuditAction;
  result: AccountAuditResult;
  ip?: string | null;
  ua?: string | null;
  now: number;
}

/** `account_audit_log` 行（M3）。 */
export interface AccountAuditRow {
  id: number;
  user_id: number;
  phone_masked: string | null;
  action: string;
  result: string;
  ip: string | null;
  ua: string | null;
  created_at: number;
}

/** 账号事件审计域（R-39⑤b / R-40④对账取数来源） */
export interface AccountAuditDB {
  /**
   * 追加一行。写入前经 `assertNoCredentialLeak` 硬拦：
   * 任一字段含 bcrypt 指纹（`$2a$/$2b$/$2y$`）或包含用户刚输入的明文密码 → 抛错，不落库。
   * `plaintextHint` 只用于**拒写判断**，本身绝不入库（service 在改密失败分支传它）。
   * 失败抛错而非静默跳过 —— §4.5 要求"写失败 → 事务回滚"，否则步 4 的对账数就对不上。
   */
  append(entry: AccountAuditInput, plaintextHint?: string): Promise<number>;
  /** 某用户最近 N 条（倒序） */
  listByUser(userId: number, limit?: number): Promise<AccountAuditRow[]>;
}

/** `feature_flags` 行（M5，§4.4.4）。 */
export interface FeatureFlagRow {
  key: string;
  /** 原样存的字符串：`'on' | 'off' | '0'~'100'`；语义解释在 `@tm/shared/constants/flags` 的 `parseFlagValue` */
  value: string;
  updated_at: number;
}

/** 运行时开关域（§4.4.4：表即真相，进程内 30s TTL 缓存在 `services/feature-flags.ts`） */
export interface FeatureFlagDB {
  /** 单键读取；未落库返回 null（调用方回退 env 种子） */
  get(key: string): Promise<FeatureFlagRow | null>;
  /** 管理后台改值（`POST /api/admin/flags`）：upsert，返回后的 `updated_at` 即 `now` */
  set(key: string, value: string, now: number): Promise<void>;
  /** 全量读（`GET /api/admin/flags`、发布步 8 读回初值断言用），按 key 升序 */
  list(): Promise<FeatureFlagRow[]>;
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
  /** T-06/M2：复习撤销（R-11） */
  snapshots: ReviewSnapshotDB;
  /** T-06/M3：账号事件审计（R-39⑤b） */
  audit: AccountAuditDB;
  /** T-06/M5：运行时开关（§4.4.4） */
  flags: FeatureFlagDB;
  /** 创建用户 + 默认 wordbook + 默认 profile（事务） */
  createUser(phone: string, now: number): Promise<number>;
  /** 初始化表结构 */
  init(): Promise<void>;
  /** 关闭连接 */
  close(): Promise<void>;
}

/**
 * 审计行写入前的凭据泄漏硬拦（§4.5 红线：`account_audit_log` 不含明文密码或其 hash）。
 * 放在 `types.ts` 而不是两个驱动里各写一遍，保证两驱动同一口径。
 * @throws Error 命中即抛（调用方 `audit.append` 会因此不落库）
 */
export function assertNoCredentialLeak(entry: AccountAuditInput, plaintext?: string): AccountAuditInput {
  const values: Array<[string, string | null | undefined]> = [
    ['phone_masked', entry.phoneMasked],
    ['action', entry.action],
    ['result', entry.result],
    ['ip', entry.ip],
    ['ua', entry.ua],
  ];
  for (const [field, value] of values) {
    if (typeof value !== 'string' || value === '') continue;
    if (/^\$2[aby]\$\d{2}\$/.test(value) || /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(value)) {
      throw new Error(`AUDIT_CREDENTIAL_LEAK: ${field} 疑似 bcrypt 哈希，拒绝落库`);
    }
    if (plaintext !== undefined && plaintext.length >= 6 && value.includes(plaintext)) {
      throw new Error(`AUDIT_CREDENTIAL_LEAK: ${field} 含明文密码，拒绝落库`);
    }
  }
  return entry;
}

/* ══════════════════ A-32-6：两驱动共用的 RMW 决策（SQL 之外只有一份口径）══════════════════ */

/**
 * 库内 `wordbooks` 一行 → `WordbookCurrent`。
 * sqlite（better-sqlite3 同步行）与 pg（`QueryResult.rows[0]`）的列名一致，
 * 故这里收一个宽松的记录；缺行 = `exists:false`。放在 `types.ts` 而不是各驱动写一遍，
 * 与 `assertNoCredentialLeak` 同理：保证两驱动同一口径。
 */
export function wordbookCurrentOf(row: Record<string, unknown> | undefined | null): WordbookCurrent {
  if (row === undefined || row === null) {
    return { exists: false, dataJson: null, entries: null, sync_version: 0, tombstones: '[]', updated_at: null };
  }
  const dataJson = row.data === null || row.data === undefined ? '[]' : String(row.data);
  return {
    exists: true,
    dataJson,
    entries: safeJsonParse<WordbookEntry[]>(dataJson, []),
    sync_version: Number(row.sync_version ?? 0),
    tombstones: row.tombstones === null || row.tombstones === undefined ? '[]' : String(row.tombstones),
    updated_at: row.updated_at === null || row.updated_at === undefined ? null : Number(row.updated_at),
  };
}

/**
 * `applyMutate` 的决策部分：回调产出 → 要写什么 / 是否真的变了 / 新版本号。
 * **纯函数**，两驱动都调它 ⇒ "逐字相同就不 ++"这条幂等规则不会在某一侧漂移。
 * @throws Error 回调返回了非对象（例如忘了 `return`）—— 静默当成"写空数组"等于删光用户的词，必须抛
 */
export function planWordbookMutate<T>(current: WordbookCurrent, patch: WordbookPatch<T>): WordbookMutationPlan<T> {
  if (patch === null || patch === undefined || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error(
      'wordbooks.applyMutate: 回调必须返回 { data, tombstones?, value? } 对象，不能返回 undefined/非对象（丢用户词 = 不可逆）',
    );
  }
  if (patch.data === null || patch.data === undefined) {
    throw new Error('wordbooks.applyMutate: 回调返回的 data 不得为 null/undefined（要清空请显式给 []）');
  }
  const dataJson = typeof patch.data === 'string' ? patch.data : JSON.stringify(patch.data);
  const tombstones = patch.tombstones === undefined ? current.tombstones : patch.tombstones;
  const changed = (current.dataJson ?? '[]') !== dataJson || current.tombstones !== tombstones;
  return {
    dataJson,
    tombstones,
    changed,
    version: current.sync_version + (changed ? 1 : 0),
    entries: typeof patch.data === 'string' ? safeJsonParse<WordbookEntry[]>(patch.data, []) : patch.data,
    value: patch.value,
  };
}

/* ═════════════ A-32-1(b)：启动自检 —— 凭据两列存在性（发布安全级）═════════════ */

/**
 * M1（迁移 `001-credentials-columns`）添加的两列。
 * 旧 `DDL` 数组里的 `users` 只有四列，而两侧 `init()` **只 exec 旧 DDL + 补两条上古列，不经过
 * `_migrations` 注册表** ⇒ 未跑过 `pnpm db:migrate` 的库（**含全新空库**）上这两列不存在，
 * `CREDENTIAL_SELECT`（`db/sqlite.ts:131`）一打就 `no such column: password_changed_at`
 * （现场栈顶 `db/sqlite.ts:197`），`/api/login` 与 `/api/register` 整片 500。
 * 见 T-07 报告 §8-1 与 A-32-1。
 */
export const CREDENTIAL_COLUMNS = ['password_changed_at', 'pw_policy_version'] as const;

/** 修复动作：根 `package.json` 的 `db:migrate` = `pnpm --filter @tm/server migrate`。 */
export const MIGRATE_COMMAND = 'pnpm db:migrate';

/**
 * 缺列时的人话消息：**两驱动逐字同一条**（同判据、同文案），且带可执行动作。
 * 不许退化成一堆 per-request 500 `{"error":"服务器内部错误"}`（PRD §4.6 的 P0 路径红线）。
 */
export const credentialColumnsMissingMessage = (missing: readonly string[]): string =>
  `数据库还没迁移：表 users 缺少凭据列 ${missing.join(' 与 ')}（这两列由迁移 001-credentials-columns 添加，旧建表 DDL 里没有它们）。` +
  `服务因此拒绝启动 —— 在这种库上起服，登录和注册会整片返回 500。` +
  `请先执行 ${MIGRATE_COMMAND}（幂等，可重复执行；用 SQLITE_PATH / DATABASE_URL 指到同一个库），再重新起服。`;

/** 显式豁免开关：留给"知道自己在未迁移库上动手"的引导脚本；服务进程永远不该设它。 */
export const ALLOW_UNMIGRATED_ENV = 'TM_DB_ALLOW_UNMIGRATED';

/** 迁移引导入口：它们的顺序就是"先 `init()` 建基线表 → 再跑 000…006"。 */
const MIGRATION_BOOTSTRAP_ENTRY =
  /(?:^|[/\\])src[/\\]scripts[/\\](?:migrate|ddl-parity-runner)\.[cm]?[jt]s$/;

/** 判定豁免时可以注入的进程上下文（用例要在测试进程里也能验到"不豁免"的那一支，故不直接读全局）。 */
export interface BootProcessContext {
  /** 入口脚本路径（`process.argv[1]`） */
  entry?: string;
  /** 进程环境（`process.env`） */
  env?: Record<string, string | undefined>;
  /** 预先算好的豁免原因（`undefined` = 现场再算；`null` = 明确不豁免） */
  exemption?: string | null;
}

/**
 * 这个进程是否**允许**在缺列的库上继续 `init()`；返回豁免原因，`null` = 不豁免（缺列即抛）。
 * 三条豁免的共同点 = "调用方紧接着就要 migrate"，都不是"运维可以不管"：
 *  ① 显式 `TM_DB_ALLOW_UNMIGRATED=1`（发布/演练脚本的逃生门）；
 *  ② 迁移引导入口 `src/scripts/migrate.ts`、`src/scripts/ddl-parity-runner.ts` ——
 *     若在它们这里 fail-fast，等于**要人执行的那条 `pnpm db:migrate` 自己都跑不动**（A-32-1 的修法就自相矛盾了）；
 *  ③ 测试进程（`VITEST` / `JEST_WORKER_ID`）：用例自己 cp 临时库、`init()` 之后显式 migrate
 *     （T-07 报告 §8-1「为什么用例没暴露它」写明的就是这条路径；并行期不许把别人的用例打红）。
 * 服务入口 `src/index.ts`（= `pnpm --filter @tm/server dev` / `start` / 生产容器）**不在**豁免名单里。
 */
export function migrationBootstrapExemption(ctx: BootProcessContext = {}): string | null {
  const env = ctx.env ?? process.env;
  if (env[ALLOW_UNMIGRATED_ENV] === '1') return `${ALLOW_UNMIGRATED_ENV}=1`;
  const entry = (ctx.entry ?? process.argv[1] ?? '').replace(/^file:\/\//, '').replace(/\\/g, '/');
  if (MIGRATION_BOOTSTRAP_ENTRY.test(entry)) return `迁移引导入口 ${entry}`;
  if (env.VITEST || env.JEST_WORKER_ID) return '测试进程（用例自行 init 后显式 migrate）';
  return null;
}

/**
 * 两驱动 `init()` 的收敛点：`missing` 由**各驱动自己的 introspection** 算出（sqlite 用
 * `PRAGMA table_info`、pg 用 `information_schema.columns`），判据、豁免与消息由这里统一裁定
 * —— 这就是简报要求的"两侧对称：同一判据、同一条消息"。
 * @throws Error 缺列且不豁免时抛 `credentialColumnsMissingMessage()`（启动即失败，不是 per-request 500）
 */
export function assertCredentialColumnsForBoot(
  missing: readonly string[],
  ctx: BootProcessContext = {},
): void {
  if (missing.length === 0) return;
  const exemption = ctx.exemption === undefined ? migrationBootstrapExemption(ctx) : ctx.exemption;
  if (exemption !== null) return;
  throw new Error(credentialColumnsMissingMessage(missing));
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