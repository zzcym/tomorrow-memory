/**
 * 数值与正则的唯一真相（§3.3 规则②："契约文件只做校验与形状，默认值在 constants/"）。
 * 出处：R-39②/R-40①（密码）、R-03（词本）、R-04（头像）、R-10（最近查询）、
 *       R-11/R-12（评分与模式）、R-21（提醒）、§4.4.2（增量协议）、§4.7（吊销与配额）。
 * 本文件是 T-03 完成判据⑤ 的落点：RATING_VALUES / PASSWORD_MIN / AVATAR_MAX_BYTES /
 * WORDBOOK_MAX_ENTRIES / RECENT_MAX 五项必须在此，任何端不得再写第二份。
 */

/** R-02③ / R-11①：四档评分入参域，越界 4xx 而非静默截断。`contracts/rating.ts` 由本常量派生 schema。 */
export const RATING_VALUES = [1, 2, 3, 4] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

/** R-12①：三模式取值（命名口径见 UI §6.1，标签在 `constants/rating.ts`）。 */
export const QUEUE_MODES = ['review', 'new', 'selfTest'] as const;
export type QueueMode = (typeof QUEUE_MODES)[number];

/** R-10①②：查词方向。 */
export const LOOKUP_DIRECTIONS = ['auto', 'en2zh', 'zh2en'] as const;
export type LookupDirectionValue = (typeof LOOKUP_DIRECTIONS)[number];

/* ───────── 凭据（R-39② / R-40①② / §6.3） ───────── */

/** R-39②：手机号 11 位，不放宽。`INVALID_PHONE` 只按本式判定（格式化空格在提交前去掉）。 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/;
/** R-39② / R-40①：min(4)→min(8)。前后端同一规则（`assertPasswordStrength` 的镜像常量）。 */
export const PASSWORD_MIN = 8;
/**
 * A-23-6：**字符数**上限（计数单位 = `String.prototype.length`，即 UTF-16 码元）。
 * 用途 = UI 侧判据：强度条/表单的"太长了"提示按本值放行，与下一条**并存且各表其义**。
 * 数值出处：`contracts/auth.ts` 的 `PasswordSchema.max(PASSWORD_MAX_BYTES)` 里 zod 实际按**字符**
 * 计，执行的就是"≤72 个字符"这一条；本常量只是把已在生效的字符上限提到 `limits.ts` 命名，
 * 不新增任何约束（R-39② 只写了「≥8 位且 ≤72 字节」，未单列独立字符上限 → 口径待 PM 追认一句）。
 */
export const PASSWORD_MAX = 72;
/**
 * R-39②：去首尾空格后 ≤72 字节（bcrypt 上限）。
 * A-23-6：本值是**服务端 bcrypt 的 UTF-8 字节边界**（`TextEncoder`/`utf8Bytes` 口径），不是字符数；
 * 表单侧的字符上限看 `PASSWORD_MAX`。谁也不许拿字节数去当字符数用（全角密码 72 字符 = 216 字节）。
 */
export const PASSWORD_MAX_BYTES = 72;
/** R-39②：bcrypt cost 固定 10，注册/激活/改密三处同一个值。 */
export const BCRYPT_ROUNDS = 10;
/** R-01① / R-39⑧：正常 token TTL 30 天。 */
export const TOKEN_TTL_DAYS = 30;
/** R-40④：upgrade token TTL ≤30 分钟，且只能用于改密接口。 */
export const UPGRADE_TOKEN_TTL_MINUTES = 30;
/** R-40③：`password_changed_at` 的进程内缓存 TTL（避免每请求查库）。 */
export const REVOCATION_CACHE_TTL_SECONDS = 60;
/** R-05④：WS 旧 `?token=` 的兼容窗口（PRD §6.4-6 (b)）。 */
export const WS_LEGACY_QUERY_AUTH_GRACE_HOURS = 72;
/** R-05：WS 首帧鉴权超时。 */
export const WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS = 3;

/* ───────── 失败锁与配额（services/auth-policy.ts 语义不回退 + K-1） ───────── */

/** 同手机号连续失败 5 次临时锁 10 分钟（R-01①）。 */
export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_LOCK_MINUTES = 10;
/** R-01①：IP 限流沿用现值 10 次/分钟。 */
export const IP_RATE_LIMIT_PER_MINUTE = 10;
/** K-1：同 IP 每日新建账号 ≤5、同 IP 每日激活 ≤20，两桶互不占用。 */
export const REG_IP_DAILY_LIMIT = 5;
export const ACTIVATE_IP_DAILY_LIMIT = 20;
/** R-01⑥ / §3.9.5：验证码 60 秒二次请求判定（本期通道未接，倒计时逻辑保留但永不触发）。 */
export const SMS_RESEND_COOLDOWN_SECONDS = 60;

/* ───────── 词本（R-03 / §4.4） ───────── */

/** R-03⑦ 红线：条目字段名与语义不变；词名上限沿用契约草案 64（服务端现值 100 只放宽不收紧，见报告偏差）。 */
export const WORD_MAX_LENGTH = 64;
/** §4.4.2"总量沿用现 20000 上限" + 完成判据⑤（现网 `routes/wordbook.ts:22` 即 20000）。 */
export const WORDBOOK_MAX_ENTRIES = 20000;
/** §4.4.2：单次 push 的 entries / removedWords 上限。 */
export const WORDBOOK_PUSH_BATCH_MAX = 500;
/** §4.4.2：墓碑保留 30 天，超窗即 409 全量重放。 */
export const WORDBOOK_TOMBSTONE_RETENTION_DAYS = 30;
/** §4.4.4：flag 读取的进程内 TTL 30 秒（判据"≤60 秒生效"）。 */
export const FLAG_TTL_SECONDS = 30;
export const FLAG_EFFECTIVE_MAX_SECONDS = 60;

/* ───────── 查词与最近查询（R-09 / R-10） ───────── */

/** R-10②：最近查询 ≤20 条（硬指标，完成判据⑤）。 */
export const RECENT_MAX = 20;
/** R-10②：面板显示用的首义长度上限。 */
export const RECENT_GLOSS_MAX_LENGTH = 120;
/** §3.11.3：搜索骨架屏 ≥300ms 才出现（避免闪一下）。 */
export const LOOKUP_SKELETON_DELAY_MS = 300;
/** R-15③：词本搜索 100 词内 ≤300ms 出结果（防抖上界）。 */
export const WORDBOOK_SEARCH_DEBOUNCE_MS = 200;
/** R-15⑧：一次批量补释义，网络请求数 ≤3。 */
export const WORDBOOK_BATCH_MAX = 100;

/* ───────── 头像与 profile（R-04 / §4.5，Q4：本期不落对象存储） ───────── */

/** R-04①②：两端统一 300KB（现 500 vs 200_000 的矛盾在此终结）。完成判据⑤。 */
export const AVATAR_MAX_BYTES = 300 * 1024;
/** R-04①：200×200 上限（超出即前端先缩）。 */
export const AVATAR_MAX_SIDE_PX = 200;
/** §4.5：`app.ts` 全局 bodyLimit 200KB → 512KB。 */
export const HTTP_BODY_LIMIT_BYTES = 512 * 1024;
/** §4.5：词本 `PUT` 单独放宽到 8MB（C-18 病灶）。 */
export const WORDBOOK_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
/** R-39⑦：新建账号的每日目标默认值（列默认值，双端读取一致）。 */
export const DAILY_GOAL_DEFAULT = 10;
/** R-04：`daily_goal` 定义域。 */
export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 200;
/**
 * UI §3.8.3 逐字（`.delivery/03-ui-spec.md:979`「参数：`min=5 max=50 step=5`，默认 `10`」）：
 * 每日目标**滑杆**的取值域（缺口 G-1 · T-19g-i 上收）。数值，不是文案。
 * 与上面三条的关系 = **UI 域 ⊂ 契约域**：契约域（`DAILY_GOAL_MIN`/`MAX`）是服务端接受的入参域，
 * UI 域是滑杆能滑出来的域。四条不变式钉在 `packages/shared/test/contracts.spec.ts`
 * （`UI_MIN ≥ MIN && UI_MAX ≤ MAX && UI_DEFAULT === DAILY_GOAL_DEFAULT && UI_STEP > 0`），
 * 作用是**在源头**保证滑出来的值永远不会被服务端拒（屏侧的 B-04 那颗钉的是同一件事的另一半）。
 * 上收前这两组数只有两处私有副本：App `apps/app/src/screens/MeScreen.tsx` 的 `GOAL_SLIDER`
 * 与 Web `apps/web/src/lib/api/profile.ts` 的 `goalMin/goalMax/goalStep`（两侧改 import 归后续轮）。
 */
export const DAILY_GOAL_UI_MIN = 5;
export const DAILY_GOAL_UI_MAX = 50;
export const DAILY_GOAL_UI_STEP = 5;
/** §3.8.3 同行的"默认 `10`"：与 `DAILY_GOAL_DEFAULT` 必须同值（不变式钉的第三条）。 */
export const DAILY_GOAL_UI_DEFAULT = 10;
/** R-04 / 现网 `routes/profile.ts:34`：昵称长度上限（REST 与 tRPC 同一值）。 */
export const NICKNAME_MAX_LENGTH = 30;

/* ───────── 背词（R-11 / R-12 / R-13） ───────── */

/** R-11②：滑动提交阈值 60px。
 * ⚠ **已被 `FLASHCARD_SWIPE_THRESHOLD_PX` 取代**（A 级裁决：UI §3.5.4 的 64px 为准）。
 * 本常量按"只增不删"纪律保留（`@tm/shared` 的既有导出面，server/web/ui 是消费方），
 * 待 T-05 把 `Flashcard` 的 import 换到新常量后，由 TPM 决定何时撤除。
 * @deprecated 改用 `FLASHCARD_SWIPE_THRESHOLD_PX`。
 */
export const CARD_SWIPE_SUBMIT_PX = 60;
/** R-11② / UI §3.5.4（唯一数值真相）：闪卡横滑 ≥64px 且松手才提交评分。
 * 位移 ≥24px 只出胶囊、纵向 >12px 判为滚动 —— 那两个阈值属组件几何，见 §3.5.4 同段。
 * T-05 的 `packages/ui/src/patterns/Flashcard.tsx` 必须 import 本常量（不得再写字面量）。 */
export const FLASHCARD_SWIPE_THRESHOLD_PX = 64;
/** R-11④：同一轮内连续撤销 ≤3 次。 */
export const UNDO_MAX_PER_SESSION = 3;
/** R-12②：学新词单次取数 ≤ 每日目标。 */
export const NEW_WORD_BATCH_DEFAULT = 10;
/** §6.4（随机自测）：词本至少 5 词才可开始。 */
export const SELF_TEST_MIN_WORDS = 5;
/** R-13 / §3.11.1：收藏与撤销 toast 5 秒。 */
export const TOAST_UNDO_MS = 5000;
/** R-40③：改密成功后"其他设备需要重新登录"信息条常驻 6 秒。 */
export const TOAST_LONG_MS = 6000;
/** R-17⑨：App 内更新提示关闭后 24 小时内不再提示。 */
export const VERSION_PROMPT_SUPPRESS_HOURS = 24;
/** R-21②：每日提醒默认时间。 */
export const REMINDER_DEFAULT_TIME = '20:30';
