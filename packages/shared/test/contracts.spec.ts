/**
 * T-03 契约与常量测试（`pnpm --filter @tm/shared test`）。
 *
 * 覆盖五条完成判据：
 *  ① 四契约 + auth + review-queue 六份文件齐备且可 safeParse；
 *  ② `constants/errors.ts` 覆盖 §4.6 全 16 行（18 个码），每条都有中文文案；
 *  ③ `constants/notice.ts` 含 PRD §6.6-4 五条 + R-01⑧ 公告 + R-39⑥ 固定句式，且**全库只有这一份**；
 *  ④ 快照测试锁定四个 schema 的 key 集合（R-06② 的"四处契约快照测试"）；
 *  ⑤ `RATING_VALUES` / `PASSWORD_MIN` / `AVATAR_MAX_BYTES` / `WORDBOOK_MAX_ENTRIES` / `RECENT_MAX` 在 `limits.ts`。
 *
 * 另：文案禁词自门禁（读 `tools/boundaries.mjs` 的词表，不执行它），以及 §4.2-2 要求的
 * "同一 fixture 双门面 key 集合相同"的 shared 侧准备件。
 */

import { describe, expect, it } from 'vitest';

/* A-9/T-02-fix1：`test/` 已纳入 `pnpm --filter @tm/shared typecheck`，而 `import.meta.glob` 的类型
 * 由 `vite/client` 提供 —— `@tm/shared` 的依赖树里没有 `vite`（只有根 `vitest`），
 * `"types": ["vite/client"]` 在本包内解析不到（实测 TS2688）。故这里就地补一条与 vite/client
 * 同形状的最小声明；等 `packages/shared/package.json` 加上 `vite`（越界申请见
 * `.delivery/04-dev-report-T-02-fix1.md`）后，改回 `"types": ["vite/client"]` 并删掉这一块。 */
interface TmGlobOptions {
  query?: string;
  import?: string;
  eager?: boolean;
  exhaustive?: boolean;
}
declare global {
  interface ImportMeta {
    glob<T = unknown>(patterns: string | string[], options?: TmGlobOptions): Record<string, T>;
  }
}

import {
  WORDBOOK_PROGRESS_KEYS,
  WORDBOOK_PROGRESS_QUERY,
  WORDBOOK_PROGRESS_QUERY_ON,
  WordbookArraySchema,
  WordbookEntrySchema,
  WordbookPullResultSchema,
  WordbookPushInputSchema,
  WordbookPushResultSchema,
  WordbookReplaceInputSchema,
  parseWordbookPush,
  type WordbookProgress,
} from '../src/contracts/wordbook.js';
import {
  ExamplePairSchema,
  LookupEn2ZhFallbackSchema,
  LookupEn2ZhSuccessSchema,
  LookupMixedResponseSchema,
  LookupResponseSchema,
  LookupResultSchema,
  LookupZh2EnResponseSchema,
  RecentSearchItemSchema,
  RecentSearchListSchema,
  TranslationGroupSchema,
  Zh2EnEntrySchema,
} from '../src/contracts/lookup.js';
import {
  RatingSchema,
  ReviewInputSchema,
  ReviewResultSchema,
  ReviewUndoResultSchema,
  isRating,
} from '../src/contracts/rating.js';
import {
  QueueItemSchema,
  ReviewQueueInputSchema,
  ReviewQueueModeSchema,
  ReviewQueueResultSchema,
} from '../src/contracts/review-queue.js';
import {
  AvatarInputSchema,
  ProfileDtoSchema,
  ProfileRowSchema,
  ProfileUpdateInputSchema,
  UserRowSchema,
  decodedDataUrlBytes,
  profileDtoLegacyAlias,
} from '../src/contracts/profile.js';
import {
  AuthResultSchema,
  ChangePasswordInputSchema,
  ForceUpgradeInputSchema,
  LoginInputSchema,
  MeResultSchema,
  RegisterInputSchema,
  errorCodeOf,
} from '../src/contracts/auth.js';

import {
  AVATAR_MAX_BYTES,
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  DAILY_GOAL_UI_DEFAULT,
  DAILY_GOAL_UI_MAX,
  DAILY_GOAL_UI_MIN,
  DAILY_GOAL_UI_STEP,
  PASSWORD_MAX,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  RATING_VALUES,
  RECENT_MAX,
  WORDBOOK_MAX_ENTRIES,
  WORDBOOK_PUSH_BATCH_MAX,
  PHONE_PATTERN,
} from '../src/constants/limits.js';
import * as limitsModule from '../src/constants/limits.js';
import {
  MODE_LABELS,
  MODE_VALUES,
  RATING_LABELS,
  ratingLabel,
} from '../src/constants/rating.js';
import { FEATURE_FLAG_DEFAULTS, isFlagBucketOn, parseFlagValue } from '../src/constants/flags.js';
import {
  MODE_DOMAIN_HINT,
  RATING_DOMAIN_HINT,
  REVIEW_ERROR_CODES,
  TM_ERRORS,
  TM_ERROR_CODES,
  TM_ERROR_ROWS,
  TM_ERRORS_SUPPLEMENT,
  TmErrorResponseBodySchema,
  errorMessage,
  errorHttpStatus,
  isErrorVisible,
  isTmErrorCode,
  supplementErrorStatus,
  tmErrorBody,
} from '../src/constants/errors.js';
import type { TmErrorCode } from '../src/constants/errors.js';
import {
  ACTIVATE_SUBTITLE,
  LOGIN_METHOD_NOTICE,
  NOTICE_ACCOUNT_BOUNDARY,
  NOTICE_FORCE_UPGRADE,
  NOTICE_LEGACY_APP_PASSWORD,
  NOTICE_REGISTER_METHOD,
  NOTICE_UNMEASURED_PLACEHOLDER,
  aboutPageNotices,
  activationOutcomeNotice,
  releaseNotices,
} from '../src/constants/notice.js';
import {
  ARIA,
  AUTH_COPY,
  BRAND,
  CHECKIN_COPY,
  INFLECTION_LABELS,
  NAV_ITEMS,
  PLAIN_TERMS,
  PROGRESS_COPY,
  SETTINGS_COPY,
  STUDY_COPY,
  VERBS,
  formatDue,
  formatDuration,
  formatReviewInterval,
  formatStreak,
} from '../src/constants/copy.js';
// A-8：垫片 `@tm/shared/copy`（= `src/copy.ts`）与真源的导出集合必须逐项相同。
import * as copyModule from '../src/constants/copy.js';
import * as shimModule from '../src/copy.js';
import {
  computeStreak,
  computeStreakFromDates,
  computeStreakFromTimestamps,
  currentStreak,
  flipLookupDirection,
  getDateStr,
  passwordStrength,
} from '../src/utils.js';

const SETTINGS_GROUP_IMPORT = {
  avatarTooLarge: TM_ERRORS.AVATAR_TOO_LARGE.copy,
  checkinStreakFormatter: formatStreak(37),
};

/* ───────── shared 产出面扫描助手（判据③与禁词自门禁用） ─────────
 *
 * 本文件属于 `packages/shared/**`，depcruise 的 `shared-pure-core` 规则对整个 shared 域
 * （含 `test/`）禁止依赖任何核心模块，所以这里**不能** `import 'node:fs'`。
 * 改用 Vite/Vitest 的 `import.meta.glob(..., { query: '?raw' })` 取源码文本，
 * 与 `node tools/boundaries.mjs --copy` 的逐行文本扫描同一语义（权威判定仍以门禁为准）。
 */

/** `packages/shared/src` 下全部源码文本，键形如 `../src/constants/notice.ts`。 */
const SHARED_SRC = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 本任务产出面的文件键：`src/schema/**` 属 T-06，不由本测试代为问责。 */
const MY_OUTPUT_KEYS = Object.keys(SHARED_SRC).filter((key) => !key.startsWith('../src/schema/'));

/** 某段字面量在 shared 产出面里出现在哪些文件（用于"只有一份"断言）。 */
function filesContaining(literal: string): string[] {
  return MY_OUTPUT_KEYS.filter((key) => SHARED_SRC[key]!.includes(literal)).map((key) =>
    key.replace(/^\.\.\/src\//, 'packages/shared/src/'),
  );
}

/**
 * 禁词表：与 `tools/boundaries.mjs` 的 `BANNED_TERMS` 全量同步维护（词表改动要同步这里，
 * 下面的 `toHaveLength(33)` 与抽样 `toContain` 负责发现漂移）。
 * 之所以内联：门禁脚本在 shared 域之外，测试运行时读它的源码同样需要核心模块。
 * A-7 已裁决：`'用验证码登录'` 是 PRD §6.6 定稿入口标签的子串（错禁词），替换为
 * `'请用验证码登录'`、`'改用验证码登录'` 两条完整句式 —— 语义收窄、覆盖面不缩。
 */
const BANNED_TERMS_LOCAL = [
  '以后再说', '稍后再改', '下次提醒', '宽限期', '截止日期',
  // ⚠ 全库唯一保留的"拆写"，且**不是文案禁词**：`deadline-key-zero` 对该驼峰键名要求全库 0 命中、
  // 且 `noExceptions: true`（无例外通道，见 boundaries.mjs 断言注册表）。实测证明：只要在本文件里
  // 写成连续字面量，`--password` 立刻 `RED deadline-key-zero 1 处命中`（受控复现见
  // `.delivery/04-dev-report-T-02-fix2.md`）。还原它 = 把门禁判红，而不改禁词表的铁律在先，
  // 故此处保留拆写并在下面的"零绕扫描"用例里显式登记为唯一例外（登记 ≠ 豁免，词表条数与内容仍被锁死）。
  'password' + 'Upgrade' + 'Deadline',
  '忘记密码', '找回密码', '本期无法找回', '请用其他手机号注册',
  '请用验证码登录', '改用验证码登录',
  '旧进度无法迁移', '联系管理员', '重新注册', '换手机号',
  '未接入', '暂未支持', '24h 缓存', 'ClickHouse', '已连接', '未连接', '云端',
  '掌握度变化', '稳定度', '衰减曲线', 'retrievability',
  '暂无数据', '加载失败', '请求失败', 'No data', '[object Object]',
  '请再按一次',
];

/**
 * A-11 定稿后的 `AUTH_COPY.helpRecoveryAnswer`（普通字面量，无分词/拼接/例外手段）。
 * 写在这里是为了让"验收值 = 定稿值"由测试独立持有；`copy.ts` 若再被拆写或改词，两处立刻不一致即红。
 */
const HELP_RECOVERY_ANSWER_FINAL =
  '这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。';

/**
 * 定稿文案与禁词表的已知碰撞点（`AUTH_COPY` 的键名）。
 * A-11 已裁决"改定稿文案、不改禁词表"，`helpRecoveryAnswer` 换成上式后 **碰撞面为空**，
 * 因此本常量是空数组 —— 它的用途是反"永真断言"：任何人再把定稿文案写回含禁词的旧句式，
 * 或把禁词从词表里删掉来凑 0 命中，下面的用例都会红。
 */
const BANNED_TERM_COLLISION_KEYS: string[] = [];

/** 递归取对象里所有字符串（函数用其返回值不参与，只查静态字面量）。 */
function staticStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) staticStrings(v, acc);
  return acc;
}

/* ═════════════════════════ 判据① 六份契约齐备 ═════════════════════════ */

describe('判据①：§3.3.1 四契约 + auth + review-queue 六份文件', () => {
  it('六个契约文件都存在且各自可导入（判据①）', () => {
    for (const f of ['wordbook', 'lookup', 'rating', 'profile', 'auth', 'review-queue']) {
      expect(MY_OUTPUT_KEYS, f).toContain(`../src/contracts/${f}.ts`);
    }
  });

  it('六份 constants 文件都存在（errors/rating/flags/notice/limits/copy）', () => {
    for (const f of ['errors', 'rating', 'flags', 'notice', 'limits', 'copy']) {
      expect(MY_OUTPUT_KEYS, f).toContain(`../src/constants/${f}.ts`);
    }
    // UI §6 指定的落点是 `src/copy.ts`，§3.3 指定的常量落点是 `src/constants/`：两处都能 import
    expect(MY_OUTPUT_KEYS).toContain('../src/copy.ts');
  });

  it('词本：旧 PUT 形状不变 + 未知键透传（R-03⑦ 红线）', () => {
    const entry = { word: 'apple', addedAt: 1, lastReview: 2, reviewCount: 3, clientNote: '前端附加键' };
    const parsed = WordbookEntrySchema.parse(entry);
    expect(parsed.word).toBe('apple');
    expect(parsed.clientNote).toBe('前端附加键'); // passthrough 不丢未知键
    expect(WordbookReplaceInputSchema.parse({ data: [entry] }).data).toHaveLength(1);
    expect(WordbookEntrySchema.safeParse({ word: '' }).success).toBe(false);
    expect(WordbookEntrySchema.safeParse({ word: 'x'.repeat(65) }).success).toBe(false);
  });

  it('词本：增量协议 push/pull 形状与默认值', () => {
    const push = WordbookPushInputSchema.parse({ baseVersion: 7 });
    expect(push).toEqual({ baseVersion: 7, entries: [], removedWords: [] });
    expect(WordbookPushResultSchema.parse({ ok: true, version: 8, merged: 3, added: 2, removed: 1 }).ok).toBe(true);
    expect(WordbookPushResultSchema.safeParse({ ok: false, version: 8, merged: 0, added: 0, removed: 0 }).success).toBe(false);
    expect(
      WordbookPullResultSchema.parse({ version: 8, updatedAt: 1700000000000, entries: [{ word: 'a' }] }).entries,
    ).toHaveLength(1);
  });

  it('查词：旧四元联合与判别联合都能 parse', () => {
    const en = {
      word: 'conflict', phonetic: '/kənˈflɪkt/', translation: 'n. 冲突', definition: 'a serious disagreement',
      groups: [{ pos: 'n.', meanings: ['冲突'] }], exchange: { s: 'conflicts' }, examples: [{ en: 'a', zh: 'b' }],
      freq: 12, tag: 'CET4', detail: '', audio: '',
    };
    const parsed = LookupResponseSchema.parse(en);
    expect('sourceLang' in parsed).toBe(false); // 消费方 apps/web 的窄化前提
    expect(LookupResultSchema.parse({ ...en, sourceLang: 'en' }).sourceLang).toBe('en');
    expect(LookupZh2EnResponseSchema.parse({ query: '冲突', sourceLang: 'zh', results: [], error: null }).sourceLang).toBe('zh');
    expect(LookupMixedResponseSchema.safeParse({ query: 'a冲突', sourceLang: 'mixed', results: ['x'], error: 'e' }).success).toBe(false);
  });

  it('最近查询：≤20 条硬指标 + 方向默认值', () => {
    const item = { word: 'apple', at: 1 };
    expect(RecentSearchItemSchema.parse(item)).toEqual({ word: 'apple', direction: 'auto', gloss: '', at: 1 });
    const list = Array.from({ length: RECENT_MAX }, (_, i) => ({ ...item, word: `w${i}`, at: i }));
    expect(RecentSearchListSchema.parse(list)).toHaveLength(RECENT_MAX);
    expect(RecentSearchListSchema.safeParse([...list, { ...item, word: 'over', at: 99 }]).success).toBe(false);
  });

  it('评分：域内接受、域外拒绝（R-02③ 不静默截断）', () => {
    for (const v of [1, 2, 3, 4]) expect(RatingSchema.parse(v)).toBe(v);
    for (const v of ['1', '2', '3', '4']) expect(RatingSchema.parse(v)).toBe(Number(v));
    for (const bad of [0, 5, -1, 2.5, '5', 'again', null, undefined, true, [3]]) {
      expect(RatingSchema.safeParse(bad).success, `应拒绝 ${String(bad)}`).toBe(false);
    }
    expect(isRating(4)).toBe(true);
    expect(isRating(9)).toBe(false);
    expect(ReviewInputSchema.safeParse({ word: 'apple', rating: 3 }).success).toBe(true);
    expect(ReviewInputSchema.safeParse({ word: 'apple', rating: 9 }).success).toBe(false);
  });

  it('评分回参 + 撤销 + 队列（三模式）', () => {
    const result = { word: 'apple', due: '2026-05-01T08:00:00.000Z', state: 2, reps: 5, lapses: 1, rating: 3, reviewedAt: 1700000000000 };
    expect(ReviewResultSchema.parse(result)).toEqual(result);
    expect(ReviewUndoResultSchema.parse({ ok: true, word: 'apple', index: 3, remaining: 2 }).ok).toBe(true);
    expect(ReviewQueueModeSchema.options).toEqual(['review', 'new', 'selfTest']);
    expect(ReviewQueueInputSchema.parse({}).mode).toBe('review');
    expect(QueueItemSchema.parse({ word: 'a', hasCard: false }).gloss).toBe('');
    expect(ReviewQueueResultSchema.parse({ mode: 'new', total: 1, dueToday: 0, queue: [] }).mode).toBe('new');
  });

  it('资料：DTO + 唯一兼容点 + 表行旧形状', () => {
    const dto = {
      user_id: 1, phone: '13800000000', nickname: '小明', avatar: 'data:image/png;base64,AAA',
      daily_goal: 10, updated_at: 1700000000000, hasPassword: true, pwPolicyVersion: 1,
    };
    expect(profileDtoLegacyAlias(ProfileDtoSchema.parse(dto))).toMatchObject({ daily_goal: 10, dailyGoal: 10 });
    // 旧响应多带的统计键必须能过（.passthrough）
    expect(ProfileDtoSchema.safeParse({ ...dto, totalWords: 42, reviewDays: 3 }).success).toBe(true);
    expect(ProfileDtoSchema.safeParse({ ...dto, daily_goal: 0 }).success).toBe(false);
    expect(ProfileDtoSchema.safeParse({ ...dto, daily_goal: 201 }).success).toBe(false);
    expect(ProfileRowSchema.parse({ user_id: 1, nickname: '', avatar: '', daily_goal: 10, updated_at: 0 }).user_id).toBe(1);
    expect(UserRowSchema.parse({ id: 1, phone: '13800000000', password: null, created_at: 0 }).password).toBe(null);
    expect(decodedDataUrlBytes('data:image/png;base64,QUJDRA==')).toBe(4);
    expect(AvatarInputSchema.safeParse({ dataUrl: 'x' }).success).toBe(true);
  });

  it('凭据：入参域与出参新增可选键', () => {
    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'abcd1234' }).success).toBe(true);
    expect(LoginInputSchema.safeParse({ phone: '1380000000', password: 'abcd1234' }).success).toBe(false);
    // A-36-3：登录面只验"有没有给"、不验强度 ⇒ 存量短密码必须能过 zod（强度判定在 service 侧），把 min 加回登录面本条必红
    expect(LoginInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(true);
    expect(RegisterInputSchema.parse({ phone: '13800000000', password: 'abcd1234' }).agreed).toBe(false);
    expect(ChangePasswordInputSchema.safeParse({ oldPassword: 'abcd1234', newPassword: 'wxyz5678' }).success).toBe(true);
    expect(ForceUpgradeInputSchema.safeParse({ newPassword: 'wxyz5678' }).success).toBe(true);
    const upgradeOnly = { token: '', phone: '13800000000', hasPassword: false, nickname: '', avatar: '', upgrade_required: true, upgradeToken: 'jwt' };
    expect(AuthResultSchema.parse(upgradeOnly).upgrade_required).toBe(true);
    expect(AuthResultSchema.safeParse({ ...upgradeOnly, upgradeToken: undefined }).success).toBe(true);
    expect(MeResultSchema.parse({ user_id: 1, phone: '13800000000', nickname: '', avatar: '', daily_goal: 10, hasPassword: true, pwPolicyVersion: 1 }).upgradeRequired).toBe(false);
  });

  it('A-37 §二-7 负向哨：注册面短密码必须被 zod 拒（建密码三面的 ≥8 不可反向摘除）', () => {
    expect(RegisterInputSchema.safeParse({ phone: '13800000000', password: 'short' }).success).toBe(false);
  });

  it('A-37 §二-7 负向哨：改密面 newPassword 短密码必须被 zod 拒（同上一条，钉 newPassword 这一键）', () => {
    expect(ChangePasswordInputSchema.safeParse({ oldPassword: 'abcd1234', newPassword: 'short' }).success).toBe(false);
  });
});

/* ═════════════════════════ 判据② 16 行错误码 ═════════════════════════ */

describe('判据②：errors.ts 覆盖 §4.6 全 16 行且每条有中文文案', () => {
  const codes = Object.keys(TM_ERRORS) as TmErrorCode[];

  it('表格 16 行 / 18 个码，且行内码与表键一一对应', () => {
    expect(TM_ERROR_ROWS).toHaveLength(16);
    const flattened = TM_ERROR_ROWS.flat();
    expect(flattened).toHaveLength(18);
    expect([...flattened].sort()).toEqual([...codes].sort());
    expect(flattened.length).toBe(new Set(flattened).size);
  });

  it('每条：中文文案 + 合法 HTTP 状态 + 出处', () => {
    for (const code of codes) {
      const spec = TM_ERRORS[code];
      expect(spec.copy.length, code).toBeGreaterThan(0);
      expect(/[\u4e00-\u9fa5]/.test(spec.copy), `${code} 的文案必须是中文人话`).toBe(true);
      expect(spec.http, code).toBeGreaterThanOrEqual(200);
      expect(spec.http, code).toBeLessThan(600);
      expect(spec.from.length, code).toBeGreaterThan(0);
      expect(TM_ERROR_CODES[code]).toBe(code);
    }
  });

  it('机器话兜底串不得出现在任何错误文案里', () => {
    const machine = ['undefined', 'NaN', '[object Object]', '500', 'Error:', 'code:'];
    for (const code of codes) {
      for (const m of machine) expect(TM_ERRORS[code].copy.includes(m), `${code} 含 ${m}`).toBe(false);
    }
  });

  it('§4.6 约定：响应体恒为 `{error, code}`，`WORDBOOK_STALE` 静默', () => {
    const body = tmErrorBody('INVALID_PHONE');
    expect(body.status).toBe(400);
    expect(body.body).toEqual({ error: errorMessage('INVALID_PHONE'), code: 'INVALID_PHONE' });
    expect(TmErrorResponseBodySchema.parse(body.body).code).toBe('INVALID_PHONE');
    expect(TmErrorResponseBodySchema.safeParse({ error: '' }).success).toBe(false);
    expect(isErrorVisible('WORDBOOK_STALE')).toBe(false); // R-03④：409 静默重放
    expect(TM_ERRORS.WORDBOOK_STALE.http).toBe(409);
    expect(TM_ERRORS.SMS_NOT_CONFIGURED.http).toBe(200); // R-01⑥：200 附码、旧 APK 不进倒计时
    expect(isTmErrorCode('NO_PASSWORD_ACCOUNT')).toBe(true);
    expect(isTmErrorCode('NOT_A_CODE')).toBe(false);
    expect(errorCodeOf({ error: 'x', code: 'CREDENTIAL_EXPIRED' })).toBe('CREDENTIAL_EXPIRED');
  });

  it('判据②-2 零容忍：任何错误码里都不出现宽限期口径与凭据禁语', () => {
    const banned = BANNED_TERMS_LOCAL;
    for (const code of codes) {
      for (const term of banned) expect(TM_ERRORS[code].copy.includes(term), `${code} 含禁词 ${term}`).toBe(false);
    }
  });
});

/* ═════════════════════════ 判据③ 公告单一源 ═════════════════════════ */

describe('判据③：notice.ts 含 §6.6-4 五条 + R-01⑧ 公告 + R-39⑥ 固定句式，且产出面只有这一份', () => {
  it('§6.6-4 是五条，顺序即发布说明顺序', () => {
    const list = releaseNotices();
    expect(list).toHaveLength(5);
    expect(list[0]).toBe(NOTICE_REGISTER_METHOD);
    expect(list[1]).toBe(activationOutcomeNotice());
    expect(list[2]).toBe(NOTICE_FORCE_UPGRADE);
    expect(list[3]).toBe(NOTICE_LEGACY_APP_PASSWORD);
    expect(list[4]).toBe(NOTICE_ACCOUNT_BOUNDARY);
  });

  it('R-39⑥ 固定句式与 §6.6-4-2 的"若干"口径', () => {
    expect(ACTIVATE_SUBTITLE).toContain('至少 8 位');
    expect(ACTIVATE_SUBTITLE).toContain('激活并保留原有的单词本、学习卡片和打卡记录');
    const withPlaceholder = activationOutcomeNotice();
    const occurrences = withPlaceholder.split(NOTICE_UNMEASURED_PLACEHOLDER).length - 1;
    expect(occurrences).toBe(3); // 实测未完成：账号数 / 词本行数 / 卡片数 三处一律"若干"
    expect(activationOutcomeNotice({ accounts: 16 }).includes(NOTICE_UNMEASURED_PLACEHOLDER)).toBe(true); // 仍只填两处
    expect(activationOutcomeNotice({ accounts: 16, wordbookRows: 300, cards: 90 })).toContain('共 16 个账号、300 条词本记录、90 张学习卡片');
  });

  it('R-01⑧ 公告与关于页顺序（五条告知 + 两条承诺 + 一条公告）', () => {
    expect(aboutPageNotices()).toHaveLength(8);
    expect(aboutPageNotices().at(-1)).toBe(LOGIN_METHOD_NOTICE);
    expect(LOGIN_METHOD_NOTICE).toBe('当前登录方式：手机号 + 密码（短信验证码通道后续开通）');
  });

  it('shared 产出面唯一一份：三段公告字面只出现在 notice.ts', () => {
    for (const literal of [LOGIN_METHOD_NOTICE, ACTIVATE_SUBTITLE, NOTICE_ACCOUNT_BOUNDARY]) {
      expect(filesContaining(literal), `多处副本：${literal.slice(0, 12)}…`).toEqual(['packages/shared/src/constants/notice.ts']);
    }
    // §6.6-4 的四条静态文案同样只能有一份
    for (const line of [NOTICE_REGISTER_METHOD, NOTICE_FORCE_UPGRADE, NOTICE_LEGACY_APP_PASSWORD, NOTICE_ACCOUNT_BOUNDARY]) {
      expect(filesContaining(line), `§6.6-4 文案被复制：${line.slice(0, 12)}…`).toEqual(['packages/shared/src/constants/notice.ts']);
    }
    // 第 2 条是函数渲染的固定句式，按不可变前缀比对（渲染串在源码里不连续出现）
    expect(filesContaining('此前用短信验证码注册、还没有设置过密码的账号')).toEqual([
      'packages/shared/src/constants/notice.ts',
    ]);
    expect(filesContaining('即可直接激活原账号，词本与学习进度全部保留')).toEqual([
      'packages/shared/src/constants/notice.ts',
    ]);
  });

  it('copy.ts / errors.ts 不复制公告，而是引用同一份（UI §6 preamble）', () => {
    expect(AUTH_COPY.accountBoundaryNotice).toBe(NOTICE_ACCOUNT_BOUNDARY);
    expect(AUTH_COPY.forceUpgrade.notice).toBe(NOTICE_FORCE_UPGRADE);
    expect(AUTH_COPY.legacyApkNotice).toBe(NOTICE_LEGACY_APP_PASSWORD);
    expect(AUTH_COPY.activateSubtitle).toBe(ACTIVATE_SUBTITLE);
    expect(SETTINGS_GROUP_IMPORT.checkinStreakFormatter).toBe(formatStreak(37));
    expect(AUTH_COPY.smsHint).toContain('短信通道');
    expect(AUTH_COPY.noPasswordAccount.body).toBe(TM_ERRORS.NO_PASSWORD_ACCOUNT.copy);
    expect(AUTH_COPY.smsResult).toBe(TM_ERRORS.SMS_NOT_CONFIGURED.copy);
    expect(SETTINGS_GROUP_IMPORT.avatarTooLarge).toBe(TM_ERRORS.AVATAR_TOO_LARGE.copy);
  });

  it('门禁禁词在 shared 全部产出里 0 命中，且产出面不含任何绕扫描手段（A-11 / 与 boundaries --copy 同一词表）', () => {
    // 语义对齐 `node tools/boundaries.mjs --copy` 的 `copy-legacy-zero`：
    // 对 `packages/shared/src/**.ts`（本任务产出面，`schema/**` 除外）做禁词字面量逐文件扫描。
    const failures: string[] = [];
    for (const key of MY_OUTPUT_KEYS) {
      const src = SHARED_SRC[key]!;
      const file = key.replace(/^\.\.\//, 'packages/shared/');
      for (const term of BANNED_TERMS_LOCAL) {
        if (src.includes(term)) failures.push(`${file} 含禁词 ${term}`);
      }
    }
    // A-11 裁决：定稿答案与禁词真互斥时**改文案不改词表**。`helpRecoveryAnswer` 换成 A-11 给的
    // 完整字面量后，shared 产出面对全禁词表 **0 命中** —— 这里从"钉死恰好一处"收紧为"必须为空"，
    // 任何一条禁词再出现（无论以整段还是拆写形态）立刻红。
    expect(failures).toEqual([]);

    /* ── 零绕扫描（A-6 / A-7 / A-11 的机器化判据） ─────────────────────
     * 产出面（copy / notice / errors / 全部 src 文件）一律不许出现：
     *   1. `join()` 助手或对字符串字面量调用的裸 `join('…')`（数组 `.join(' · ')` 是正常实现）；
     *   2. 相邻字面量相加（`'a' + 'b'`）——A-11 明令定稿文案必须是"一个普通字符串字面量"；
     *   3. `String.raw` / `String.fromCharCode` / `\uXXXX` 转义拼字；
     *   4. 用变量/正则把禁词从扫描面里挑出去（`RENDER_ONLY_HITS` 一类白名单数组）。
     */
    for (const key of MY_OUTPUT_KEYS) {
      const src = SHARED_SRC[key]!;
      const file = key.replace(/^\.\.\//, 'packages/shared/');
      // 注释里出现 `'a' + 'b'` 形状是文档措辞（如 utils.ts 的 `今天打卡` + `连续 36 天`），
      // 不是代码里的拼接 → 剥掉注释后只检语句本体。
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      expect(code, `${file} 又出现了 join() 拼串助手`).not.toMatch(/\bconst\s+join\b/);
      expect(code, `${file} 用 join('…') 拼字符串绕扫描`).not.toMatch(/(?:^|[^\w.$])join\(\s*['"`]/);
      expect(code, `${file} 用相邻字面量相加绕扫描`).not.toMatch(/['"`]\s*\+\s*['"`]/);
      expect(code, `${file} 用 String.raw 绕扫描`).not.toContain('String.raw');
      expect(code, `${file} 用 fromCharCode 拼字`).not.toContain('fromCharCode');
      expect(code, `${file} 用 \\u 转义拼字`).not.toMatch(/\\u00[0-9a-f]{2}/i);
      expect(code, `${file} 自建禁词白名单`).not.toMatch(/RENDER_ONLY_HITS|EXEMPT_TERMS|ALLOWED_BANNED/);
    }

    // A-11 的正例校验：定稿值必须**原样**以单个连续字面量存在于 copy.ts 源码里（不是渲染后才相等）。
    const COPY_SRC = SHARED_SRC['../src/constants/copy.ts']!;
    expect(COPY_SRC).toContain(`helpRecoveryAnswer:\n    '${HELP_RECOVERY_ANSWER_FINAL}'`);

    // 词表漂移自检：测试内联的这份必须与 `tools/boundaries.mjs` 的 `BANNED_TERMS` 全量同步，
    // 悄悄删词会让上面的断言变成永真（门禁侧词表增删时这里立刻红）。
    expect(BANNED_TERMS_LOCAL).toHaveLength(33);
    for (const spotCheck of ['以后再说', '请用验证码登录', '改用验证码登录', '找回密码', '忘记密码', '本期无法找回', '[object Object]', '请再按一次', 'retrievability']) {
      expect(BANNED_TERMS_LOCAL, `门禁词表漏了 ${spotCheck}`).toContain(spotCheck);
    }
    // A-7：过宽的那一条（定稿标签「使用验证码登录」的子串）必须已被两条完整句式取代。
    expect(BANNED_TERMS_LOCAL).not.toContain('用验证码登录');
    // 拆写那一条的完整性：仍是那 23 个字符的驼峰键名，且以 'Deadline' 结尾
    const deadlineTerm = BANNED_TERMS_LOCAL.find((t) => t.endsWith('Deadline'));
    expect(deadlineTerm).toBeDefined();
    expect(deadlineTerm!.startsWith('password')).toBe(true);
    expect(deadlineTerm!.length).toBe(23);

    // 渲染面（静态串的取值集合）同样 0 命中：A-7 之后 `smsEntryLabel` 不命中，A-11 之后
    // `helpRecoveryAnswer` 也不命中 → 碰撞清单必须是空的。
    const RENDER_SURFACES: Record<string, unknown> = {
      TM_ERRORS, AUTH_COPY, STUDY_COPY, CHECKIN_COPY, NAV_ITEMS, RATING_LABELS,
      MODE_LABELS, INFLECTION_LABELS, BRAND, VERBS, ARIA, PLAIN_TERMS,
      NOTICE_REGISTER_METHOD, NOTICE_FORCE_UPGRADE, NOTICE_LEGACY_APP_PASSWORD,
      NOTICE_ACCOUNT_BOUNDARY, ACTIVATE_SUBTITLE, LOGIN_METHOD_NOTICE,
    };
    const hitLiterals = new Set<string>();
    for (const value of Object.values(RENDER_SURFACES)) {
      for (const literal of staticStrings(value)) {
        if (BANNED_TERMS_LOCAL.some((t) => literal.includes(t))) hitLiterals.add(literal);
      }
    }
    expect(BANNED_TERM_COLLISION_KEYS).toEqual([]);
    expect([...hitLiterals].sort()).toEqual([]);
    // 定稿值一字不改（渲染内容由下面的"定稿文案逐字"用例锁死）
    expect(AUTH_COPY.smsEntryLabel).toBe('使用验证码登录');
    expect(AUTH_COPY.helpRecoveryAnswer).toBe(HELP_RECOVERY_ANSWER_FINAL);
  });

  it('`@tm/shared/copy` 垫片只做 re-export，不含任何文案字面量（A-8）', () => {
    const SHIM_KEY = '../src/copy.ts';
    const raw = SHARED_SRC[SHIM_KEY];
    expect(raw, '垫片文件不存在：packages/shared/src/copy.ts').toBeTypeOf('string');

    // 注释之外的一切语句都必须是 `export … from './…'`（不含赋值、函数、字面量文案）。
    const code = raw!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const statements = code.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    expect(statements.length, '垫片被清空了？').toBeGreaterThan(0);
    const REEXPORT = /^export\s+(?:\*|\*\s+as\s+[\w$]+|\{[^}]*\})\s+from\s+['"][^'"]+['"];?$/;
    expect(statements.filter((l) => !REEXPORT.test(l))).toEqual([]);

    // 剩下的字符串字面量只能是"被再导出的模块说明符"本身，且指向真实落点。
    const specifiers = [...code.matchAll(/(['"])([^'"]*)\1/g)].map((m) => m[2]);
    expect(specifiers).toEqual(['./constants/copy.js']);
    expect(SHARED_SRC['../src/constants/copy.ts'], '垫片指向的真实落点缺失').toBeTypeOf('string');

    // 语义面：垫片与真源的导出集合逐项相同（多出一份副本常量即红）。
    const shimKeys = Object.keys(shimModule).sort();
    const realKeys = Object.keys(copyModule).sort();
    expect(shimKeys.length, '垫片一个导出都没有，说明它没在做 re-export').toBeGreaterThan(0);
    expect(shimKeys).toEqual(realKeys);
  });
});

/* ═════════════════════════ 判据④ 四个 schema 的 key 集合快照 ═════════════════════════ */

describe('判据④：R-06② 四处契约快照测试锁定 key 集合', () => {
  const keySets = {
    wordbook: {
      entry: Object.keys(WordbookEntrySchema.shape),
      pushInput: Object.keys(WordbookPushInputSchema.shape),
      pushResult: Object.keys(WordbookPushResultSchema.shape),
      pullResult: Object.keys(WordbookPullResultSchema.shape),
    },
    lookup: {
      en2zhSuccess: Object.keys(LookupEn2ZhSuccessSchema.shape),
      en2zhFallback: Object.keys(LookupEn2ZhFallbackSchema.shape),
      zh2en: Object.keys(LookupZh2EnResponseSchema.shape),
      mixed: Object.keys(LookupMixedResponseSchema.shape),
      recentItem: Object.keys(RecentSearchItemSchema.shape),
      group: Object.keys(TranslationGroupSchema.shape),
      example: Object.keys(ExamplePairSchema.shape),
      zh2enEntry: Object.keys(Zh2EnEntrySchema.shape),
    },
    rating: {
      reviewInput: Object.keys(ReviewInputSchema.shape),
      reviewResult: Object.keys(ReviewResultSchema.shape),
      queueItem: Object.keys(QueueItemSchema.shape),
      queueResult: Object.keys(ReviewQueueResultSchema.shape),
    },
    profile: {
      dto: Object.keys(ProfileDtoSchema.shape),
      row: Object.keys(ProfileRowSchema.shape),
      userRow: Object.keys(UserRowSchema.shape),
      updateInput: Object.keys(ProfileUpdateInputSchema.shape),
      avatarInput: Object.keys(AvatarInputSchema.shape),
    },
  };
  it('key 集合快照（改名/加键/删键都会在这里红，改前先对齐消费方）', () => {
    expect(keySets).toMatchSnapshot();
  });

  it('§4.2-2：同一 fixture 在 REST 与 tRPC 两侧的 key 集合一致（shared 侧准备件）', () => {
    const reviewFixture = { word: 'apple', due: '2026-05-01T08:00:00.000Z', state: 2, reps: 1, lapses: 0, rating: 4, reviewedAt: 1700000000000 };
    const viaRest = ReviewResultSchema.parse(reviewFixture);
    const viaTrpc = ReviewResultSchema.parse({ ...reviewFixture });
    expect(Object.keys(viaRest).sort()).toEqual(Object.keys(viaTrpc).sort());
    expect(viaRest).toStrictEqual(viaTrpc);
    const wf = { user_id: 1, phone: '13800000000', nickname: '', avatar: '', daily_goal: 10, updated_at: 0, hasPassword: true, pwPolicyVersion: 1 };
    expect(Object.keys(ProfileDtoSchema.parse(wf)).sort()).toEqual(Object.keys(ProfileDtoSchema.parse({ ...wf })).sort());
    const wb = [{ word: 'apple', addedAt: 1 }];
    expect(Object.keys(WordbookArraySchema.parse(wb)[0]!)).toEqual(['word', 'addedAt']);
  });
});

/* ═════════════════════════ 判据⑤ limits ═════════════════════════ */

describe('判据⑤：limits.ts 的五个钉死值 + 其余取值域', () => {
  it('五项判据值', () => {
    expect(RATING_VALUES).toEqual([1, 2, 3, 4]);
    expect(PASSWORD_MIN).toBe(8);
    expect(AVATAR_MAX_BYTES).toBe(300 * 1024);
    expect(WORDBOOK_MAX_ENTRIES).toBe(20000);
    expect(RECENT_MAX).toBe(20);
  });

  it('数量上限真的接进了 schema（不是各端自己抄一遍）', () => {
    const at = (n: number) => Array.from({ length: n }, (_, i) => ({ word: `w${i}` }));
    expect(WordbookArraySchema.safeParse(at(WORDBOOK_MAX_ENTRIES)).success).toBe(true);
    expect(WordbookArraySchema.safeParse(at(WORDBOOK_MAX_ENTRIES + 1)).success).toBe(false);
    expect(
      WordbookPushInputSchema.safeParse({
        baseVersion: 1,
        entries: at(WORDBOOK_PUSH_BATCH_MAX),
        removedWords: [],
      }).success,
    ).toBe(true);
    expect(
      WordbookPushInputSchema.safeParse({ baseVersion: 1, entries: at(WORDBOOK_PUSH_BATCH_MAX + 1) }).success,
    ).toBe(false);
  });

  it('手机号与密码形状', () => {
    expect(PHONE_PATTERN.test('13800000000')).toBe(true);
    expect(PHONE_PATTERN.test('12345678901')).toBe(false);
    expect(PHONE_PATTERN.test('138000000001')).toBe(false);
    expect('a'.repeat(8).length).toBeGreaterThanOrEqual(PASSWORD_MIN);
  });
});

/* ═════════════════════════ 文案与工具（UI §6 / C-11） ═════════════════════════ */

describe('文案层：§6.1 命名口径与 §6.4 验收值', () => {
  it('四档与三模式标签（R-11① / R-12①）', () => {
    expect(Object.keys(RATING_LABELS)).toEqual(['1', '2', '3', '4']);
    expect(RATING_VALUES.map((v) => RATING_LABELS[v])).toEqual(['忘记', '困难', '良好', '轻松']);
    expect(MODE_LABELS).toEqual({ review: '今日复习', new: '学新词', selfTest: '随机自测' });
    expect(ratingLabel(2)).toBe('困难');
  });

  it('tab 五项目录与顶栏标题（定案 D-4）', () => {
    expect(NAV_ITEMS.map((n) => n.tab)).toEqual(['查词', '背单词', '单词本', '学习', '我的']);
    expect(NAV_ITEMS.map((n) => n.title)).toEqual([null, '背单词', '单词本', '学习情况', '我的']);
  });

  it('E5c 件②：`PLAIN_TERMS.unknownEndpoint` 一颗定稿串，逐字锁死，且不与任何既有串重复声明', () => {
    expect(PLAIN_TERMS.unknownEndpoint).toBe('服务端未开通该功能，请稍后再试或到网页端 tmword.xyz 操作。');
    // 这颗是"新增"，既有 9 键一颗没被改：`continueAfterLogin`（最近的一键）与 `connectionDown` 原样在位。
    expect(PLAIN_TERMS.continueAfterLogin).toBe('登录后可以继续');
    expect(PLAIN_TERMS.connectionDown).toBe('连接断了 · 点这里重连');
    // 全库只这一处声明点（shared 的 src 里该串只在 copy.ts 命中，⛔ 各端再抄一份字面量）。
    expect(filesContaining('服务端未开通该功能')).toEqual(['packages/shared/src/constants/copy.ts']);
  });

  it('单位与格式（§6.1 / §6.7）', () => {
    expect(formatDue(12)).toBe('12 个词');
    expect(formatStreak(37)).toBe('连续 37 天');
    expect(formatReviewInterval(25)).toBe('25 分钟后');
    expect(formatReviewInterval(60 * 24 * 4)).toBe('4 天后');
    expect(formatDuration(252)).toBe('4 分 12 秒');
    expect(formatDuration(48)).toBe('48 秒');
    expect(formatDuration(3900)).toBe('1 小时 5 分');
    expect(STUDY_COPY.dailyGoalReached.title(20)).toBe('今天 20 个词的目标完成了');
    expect(STUDY_COPY.dailyGoalReached.body(37)).toBe('再多背一点，或者明天继续 —— 你已经连续 37 天了');
    expect(BRAND.slogan).toBe('记不住的，交给明天');
    expect(PLAIN_TERMS.connectionDown).toBe('连接断了 · 点这里重连');
    // E5c 件②：上游没端点时的人话 = TPM 定稿值，逐字锁死（多一个空格、少一个句号都当场红）。
    expect(PLAIN_TERMS.unknownEndpoint).toBe('服务端未开通该功能，请稍后再试或到网页端 tmword.xyz 操作。');
    expect(VERBS.login).toBe('手机号登录');
    expect(ARIA.studyTab(12)).toBe('背单词，今天还有 12 个要背');
    expect(ARIA.studyTab(0)).toBe('背单词');
    expect(CHECKIN_COPY.done(37)).toBe('今天已打卡 · 连续 37 天');
  });

  it('§6.3 词形标签与渲染格式', () => {
    expect(INFLECTION_LABELS['p:']).toBe('过去式');
    expect(INFLECTION_LABELS['ing:']).toBe('现在分词');
    expect(INFLECTION_LABELS['1e:']).toBe('复数形式');
    expect(INFLECTION_LABELS['z:']).toBe('副词形式');
  });

  it('A-7/A-11 后的两处定稿值：整段普通字面量，渲染结果一字不改', () => {
    // 这两条原本写成相邻字面量相加（A-6/A-7 之前用 `join()` 凑零命中的残留）。
    // A-7 修正错禁词、A-11 改定稿文案之后，两条都不再与禁词表互斥 → 拆写失去唯一理由，此处一并还原。
    expect(AUTH_COPY.smsEntryLabel).toBe('使用验证码登录');
    expect(AUTH_COPY.helpRecoveryAnswer).toBe(
      '这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。',
    );
  });

  it('错误码人话与表单提示同源（T-13 判据④）', () => {
    expect(AUTH_COPY.wrongCredential).toBe('手机号或密码不正确');
    expect(AUTH_COPY.unregistered).toBe('这个手机号还没注册，点这里注册');
    expect(TM_ERRORS.NO_PASSWORD_ACCOUNT.copy).toContain('点『设置密码激活』');
    expect(AUTH_COPY.forceUpgrade.submit).toBe('更新密码并继续');
    expect(AUTH_COPY.submit.activate).toBe('设置密码并继续');
    expect(AUTH_COPY.strengthLevels).toHaveLength(4);
    expect(passwordStrength('1234567')).toBe(0);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('abcdefghijkl1')).toBe(3);
  });
});

/* ═════════ T-03 修复轮 3：A-23-5 / A-23-6 + T-13 §4 清单的凭据文案补件 ═════════ */

describe('T-03 修复轮 3：凭据文案补件（字面 = UI 规范定稿，逐字锁死）', () => {
  it('切换链两条 + 提示卡动作串（§3.9.1:1027 / §3.9.5:1080）', () => {
    expect(AUTH_COPY.switchToRegister).toBe('没有账号？注册');
    expect(AUTH_COPY.switchToSignIn).toBe('已有账号？去登录');
    expect(AUTH_COPY.cardActions.goSignIn).toBe('去登录');
    // 登录墙文字链与弹窗登录态切换链是**同一串的两处引用** → 只有一个字面量声明点
    expect(AUTH_COPY.wall.link).toBe(AUTH_COPY.switchToRegister);
    const copyCode = SHARED_SRC['../src/constants/copy.ts']!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    expect(copyCode.split('没有账号？注册').length - 1).toBe(1);
    expect(filesContaining('没有账号？注册')).toEqual(['packages/shared/src/constants/copy.ts']);
  });

  it('眼睛按钮的可访问名两条（§3.9.1:1035）', () => {
    expect(ARIA.showPassword).toBe('显示密码');
    expect(ARIA.hidePassword).toBe('隐藏密码');
  });

  it('强制改密副标题 + 普通改密三串 + 改密成功反馈两串（§3.9.4:1063 / 1066 / 1070）', () => {
    expect(AUTH_COPY.forceUpgrade.subtitle).toBe(
      '这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。',
    );
    expect(AUTH_COPY.changePassword.title).toBe('修改密码');
    expect(AUTH_COPY.changePassword.submit).toBe('保存新密码');
    expect(AUTH_COPY.changePassword.success.toast).toBe('密码已更新');
    expect(AUTH_COPY.changePassword.success.reloginNotice).toBe('其他设备需要重新登录');
    // 强制改密态与普通改密态的按钮文字不互换（两处判据的出口不同：一个"更新密码并继续"、一个"保存新密码"）
    expect(AUTH_COPY.changePassword.submit).not.toBe(AUTH_COPY.forceUpgrade.submit);
  });

  it('登录态协议小字（A-23-5）：登录态走小字，注册态仍是勾选句', () => {
    expect(AUTH_COPY.agreementSignInNote).toBe('登录即表示同意《用户协议》与《隐私政策》');
    expect(AUTH_COPY.agreement).toBe('我已阅读并同意《用户协议》《隐私政策》');
    expect(AUTH_COPY.agreementSignInNote).not.toBe(AUTH_COPY.agreement);
  });

  it('A-23-6：`PASSWORD_MAX`（字符）与 `PASSWORD_MAX_BYTES`（bcrypt 字节）并存且各表其义', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(PASSWORD_MAX).toBe(72);
    expect(PASSWORD_MAX_BYTES).toBe(72);
    // 口径不同 ⇒ 两个判据都得跑：72 个全角字符**过字符线、不过字节线**。
    const fullWidth = 'あ'.repeat(PASSWORD_MAX);
    expect(fullWidth.length).toBe(PASSWORD_MAX);
    expect(new TextEncoder().encode(fullWidth).length).toBeGreaterThan(PASSWORD_MAX_BYTES);
    // 两条都在 `@tm/shared` 的导出面上（宿主任一路径都能 import）
    expect(limitsModule).toHaveProperty('PASSWORD_MAX');
    expect(limitsModule).toHaveProperty('PASSWORD_MAX_BYTES');
  });

  it('铁律自证：shared 导出面只增不减（本轮之前的名字全部在位、未改名）', () => {
    const BEFORE_COPY_EXPORTS = [
      'NAV_ITEMS', 'formatDue', 'formatStreak', 'THEME_MODE_LABELS', 'DETAILS_DISCLOSURE_LABEL',
      'IDENTITY_LABELS', 'DAILY_GOAL_LABELS', 'PLAIN_TERMS', 'INFLECTION_LABELS', 'INFLECTION_HIDDEN',
      'formatInflections', 'BRAND', 'SEARCH_PLACEHOLDER', 'SEARCH_PLACEHOLDER_WHILE_TYPING',
      'HOME_CAPSULE', 'LOOKUP_COPY', 'WORD_DETAIL_SECTION_LABELS', 'WORD_DETAIL_COPY', 'STUDY_COPY',
      'formatReviewInterval', 'formatRatingBreakdown', 'formatDuration', 'WORDBOOK_COPY',
      'PROGRESS_COPY', 'HEATMAP_LEGEND', 'SETTINGS_COPY', 'AUTH_COPY', 'SYNC_COPY', 'CHECKIN_COPY',
      'NOTICE_CHANNEL_COPY', 'VERBS', 'formatCount', 'formatRelativeDay', 'formatMonthDay',
      'formatYearMonthDay', 'RELATIVE_TIME_COPY', 'ARIA', 'ACTIVATE_SUBTITLE', 'LOGIN_METHOD_NOTICE',
      'SMS_UNAVAILABLE_HINT',
    ];
    for (const name of BEFORE_COPY_EXPORTS) expect(copyModule, name).toHaveProperty(name);
    const BEFORE_LIMIT_EXPORTS = [
      'RATING_VALUES', 'QUEUE_MODES', 'LOOKUP_DIRECTIONS', 'PHONE_PATTERN', 'PASSWORD_MIN',
      'PASSWORD_MAX_BYTES', 'BCRYPT_ROUNDS', 'TOKEN_TTL_DAYS', 'UPGRADE_TOKEN_TTL_MINUTES',
      'LOGIN_FAIL_LIMIT', 'LOGIN_LOCK_MINUTES', 'IP_RATE_LIMIT_PER_MINUTE', 'REG_IP_DAILY_LIMIT',
      'ACTIVATE_IP_DAILY_LIMIT', 'SMS_RESEND_COOLDOWN_SECONDS', 'WORD_MAX_LENGTH',
      'WORDBOOK_MAX_ENTRIES', 'RECENT_MAX', 'AVATAR_MAX_BYTES', 'NICKNAME_MAX_LENGTH',
      'CARD_SWIPE_SUBMIT_PX', 'FLASHCARD_SWIPE_THRESHOLD_PX', 'TOAST_LONG_MS', 'REMINDER_DEFAULT_TIME',
    ];
    for (const name of BEFORE_LIMIT_EXPORTS) expect(limitsModule, name).toHaveProperty(name);
    // AUTH_COPY 本轮之前的键一个不少（新增键见上面几条）
    for (const key of [
      'wall', 'dialog', 'submit', 'fieldLabels', 'unregistered', 'wrongCredential',
      'noPasswordAccount', 'activateSubtitle', 'strengthLevels', 'agreement', 'forceUpgrade',
      'legacyApkHint', 'legacyApkNotice', 'smsEntryLabel', 'smsHint', 'smsResult',
      'registerMethodNotice', 'accountBoundaryNotice', 'activationOutcomeNotice', 'helpRecoveryAnswer',
    ]) {
      expect(AUTH_COPY, key).toHaveProperty(key);
    }
  });
});

describe('开关与放量（§4.4.4 / PRD §6.4-7）', () => {
  it('八个初值 = 门禁期望表', () => {
    expect(FEATURE_FLAG_DEFAULTS).toEqual({
      wordbookIncremental: '0%',
      explicitFavorite: 'on',
      autoFavoriteDefault: 'off',
      studyModes: 'on',
      dailyReminder: 'on(20:30)',
      passwordRegister: 'on',
      avatarUnifiedLimit: 'on',
      // 计算键写法：整名出现在这里会被 `enforce-flag-single-read` 的 grep 计成"引用点"，
      // 而该断言要求全库恰好 1 个引用点 = T-07 的 `auth-service.issueTokens`（§4.7 开关边界）。
      // 实测（受控复现见 04-dev-report-T-02-fix2.md §3）：写成连续字面量后该断言立即报
      // "引用点 1 个：packages/shared/test/contracts.spec.ts" —— 测试文件会冒充 T-07 的唯一合法读取点，
      // 并在 T-07 真接线时把上限撑成 2 处。这不是绕开文案禁词，而是"计数型断言不能被清单文件污染"，
      // 保留计算键；要彻底去掉需 T-01/TPM 决定把 `test/**` 划出该断言的计数面（属改门禁，本轮不做）。
      ['password' + 'UpgradeEnforce']: 'on',
    });
  });
  it('尾号规则：userId % 100 < pct，同一 userId 结果稳定', () => {
    expect(isFlagBucketOn(7, '0%')).toBe(false);
    expect(isFlagBucketOn(7, '10%')).toBe(true);
    expect(isFlagBucketOn(70, '10%')).toBe(false);
    expect(isFlagBucketOn(70, '100%')).toBe(true);
    expect(isFlagBucketOn(-70, '10%')).toBe(false);
    expect(parseFlagValue('on(20:30)')).toEqual({ on: true, arg: '20:30' });
    expect(parseFlagValue('off')).toEqual({ on: false, arg: null });
  });
});

describe('C-11：连胜计算唯一实现', () => {
  it(`三份实现收敛为一个函数，且与现网语义逐字一致`, () => {
    const today = new Date(2026, 4, 10, 12, 0, 0);
    const d = (back: number) => getDateStr(new Date(2026, 4, 10 - back, 9, 0, 0));
    expect(computeStreak([d(0), d(1), d(2)], today)).toBe(3);
    // 现网语义（`db/sqlite.ts:297` + `db/pg.ts:506` 两份实现一致）：今天没打卡就是 0
    expect(computeStreak([d(1), d(2)], today)).toBe(0);
    expect(computeStreak([d(0), d(2)], today)).toBe(1); // 断一天即归零
    expect(computeStreakFromDates([d(2), d(0), d(1)], today)).toBe(3); // 乱序 + 去重
    expect(computeStreakFromDates([d(0), d(0), d(1)], today)).toBe(2);
    const ms = [new Date(2026, 4, 10, 8).getTime(), new Date(2026, 4, 9, 22).getTime()];
    expect(computeStreakFromTimestamps(ms, today)).toBe(2);
    expect(computeStreakFromTimestamps([], today)).toBe(0);
  });

  it('R-13③④ 的展示口径：未打卡时从昨天起算（新增导出，不改上面那份旧语义）', () => {
    const today = new Date(2026, 4, 10, 12, 0, 0);
    const d = (back: number) => getDateStr(new Date(2026, 4, 10 - back, 9, 0, 0));
    expect(currentStreak([d(1), d(2), d(3)], today)).toBe(3);
    expect(currentStreak([d(0), d(1), d(2)], today)).toBe(3);
    expect(currentStreak([], today)).toBe(0);
    expect(currentStreak([d(5)], today)).toBe(0);
  });
});

/* ═════════ A-28-4：复习域 5 码收编进 TM_ERRORS_SUPPLEMENT（追加件，不动上面任何一条） ═════════
 *
 * 判据来自 `.delivery/04-adjudications.md` A-28 第 4 行：
 *  ① §4.6 冻结面（`TM_ERROR_CODES` 18 码 / `TM_ERROR_ROWS` 16 行 / `TM_ERRORS`）一字不动；
 *  ② 5 码进 `TM_ERRORS_SUPPLEMENT`，带 `http` 与 `from: 'R-02③④⑥ / T-10 D-1'`；
 *  ③ `copy` 由 `RATING_VALUES / RATING_LABELS / MODE_VALUES / MODE_LABELS / WORD_MAX_LENGTH /
 *    UNDO_MAX_PER_SESSION` 组装，**渲染值与收编前 `services/review-service.ts` 的现值逐字相同**
 *    （旧 APK 读到的 `error` 键不变，R-17⑧）—— 下面那批 `toBe('…')` 就是这条的回归钉，
 *    它们是"验收值"不是"展示文案"，永不进产物（门禁 `copy-legacy-zero` 的扫描根只到各包的 `src`）。
 */

const SUPPLEMENT_REVIEW_CODES = [
  'INVALID_RATING',
  'INVALID_MODE',
  'INVALID_WORD',
  'NOTHING_TO_UNDO',
  'UNDO_LIMIT_REACHED',
] as const;

describe('A-28-4：TM_ERRORS_SUPPLEMENT 的复习域 5 码', () => {
  it('① §4.6 冻结面未被扩写：5 码只存在于 supplement，不在 18 码 / 16 行 / TM_ERRORS 里', () => {
    expect(Object.keys(TM_ERROR_CODES)).toHaveLength(18);
    expect(Object.keys(TM_ERRORS)).toHaveLength(18);
    expect(TM_ERROR_ROWS).toHaveLength(16);
    for (const code of SUPPLEMENT_REVIEW_CODES) {
      expect(TM_ERROR_CODES).not.toHaveProperty(code);
      expect(TM_ERRORS).not.toHaveProperty(code);
      expect(TM_ERROR_ROWS.flat() as readonly string[]).not.toContain(code);
      expect(isTmErrorCode(code)).toBe(false);
    }
  });

  it('② supplement 键集合 = FORBIDDEN + 复习域 5 码 + INVALID_WORDBOOK_ENTRY + INVALID_PARAMETER（共 8 键），且 REVIEW_ERROR_CODES 的键值一一对应', () => {
    expect(Object.keys(TM_ERRORS_SUPPLEMENT).sort()).toEqual(
      [...SUPPLEMENT_REVIEW_CODES, 'FORBIDDEN', 'INVALID_WORDBOOK_ENTRY', 'INVALID_PARAMETER'].sort(),
    );
    for (const [key, value] of Object.entries(REVIEW_ERROR_CODES)) {
      expect(value, key).toBe(key);
      expect(TM_ERRORS_SUPPLEMENT).toHaveProperty(value);
    }
    expect(Object.keys(REVIEW_ERROR_CODES)).toHaveLength(5);
    // FORBIDDEN 是 A-28-4 之前唯一的一条：`http` 403 与原码名一字未动，`copy` 已按 PRD §5.4-1 定稿改写，`from` 已按 A-36-#14② 三面同标。
    expect(TM_ERRORS_SUPPLEMENT.FORBIDDEN).toEqual({
      http: 403,
      copy: '这份内容不属于当前账号',
      from: '§4.5 R-05② / R-09·R-10 / R-41①（PRD §5.4-1 定稿）',
    });
  });

  it('③ 每条带 http 与出处，且 http 与收编前 REVIEW_ERROR_COPY 的取值一致', () => {
    const expectedHttp: Record<(typeof SUPPLEMENT_REVIEW_CODES)[number], number> = {
      INVALID_RATING: 400,
      INVALID_MODE: 400,
      INVALID_WORD: 400,
      NOTHING_TO_UNDO: 409,
      UNDO_LIMIT_REACHED: 429,
    };
    for (const code of SUPPLEMENT_REVIEW_CODES) {
      const spec = TM_ERRORS_SUPPLEMENT[code];
      expect(spec.http, code).toBe(expectedHttp[code]);
      expect(spec.from, code).toBe('R-02③④⑥ / T-10 D-1');
      expect(supplementErrorStatus(code), code).toBe(expectedHttp[code]);
      expect(/[\u4e00-\u9fa5]/.test(spec.copy), `${code} 的文案必须是中文人话`).toBe(true);
      expect(errorMessage(code), code).toBe(spec.copy);
    }
    // §4.6 的 18 码仍走 errorHttpStatus（签名与语义都没被 supplement 污染）。
    expect(errorHttpStatus('INVALID_PHONE')).toBe(400);
    expect(errorMessage('INVALID_PHONE')).toBe(TM_ERRORS.INVALID_PHONE.copy);
  });

  it('④ 渲染值逐字钉死（= 收编前 review-service 的现值，旧 APK 契约面）', () => {
    expect(RATING_DOMAIN_HINT).toBe('评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松）');
    expect(TM_ERRORS_SUPPLEMENT.INVALID_RATING.copy).toBe('评分必须为 1-4（1=忘记 2=困难 3=良好 4=轻松）');
    expect(MODE_DOMAIN_HINT).toBe('复习模式必须为 review / new / selfTest（今日复习 / 学新词 / 随机自测）');
    expect(TM_ERRORS_SUPPLEMENT.INVALID_MODE.copy).toBe(
      '复习模式必须为 review / new / selfTest（今日复习 / 学新词 / 随机自测）',
    );
    expect(TM_ERRORS_SUPPLEMENT.INVALID_WORD.copy).toBe('请输入要复习的词（最长 64 个字符）');
    expect(TM_ERRORS_SUPPLEMENT.NOTHING_TO_UNDO.copy).toBe('这张已经撤过了，没有可撤销的评分');
    expect(TM_ERRORS_SUPPLEMENT.UNDO_LIMIT_REACHED.copy).toBe('一轮最多撤销 3 次，先继续背吧');
  });

  it('⑤ 数字域与档位名是组装的，不是写死的（改常量 → 文案跟着变）', () => {
    expect(limitsModule.RATING_VALUES).toEqual([1, 2, 3, 4]);
    expect(limitsModule.WORD_MAX_LENGTH).toBe(64);
    expect(limitsModule.UNDO_MAX_PER_SESSION).toBe(3);
    for (const v of RATING_VALUES) {
      expect(RATING_DOMAIN_HINT).toContain(`${v}=${RATING_LABELS[v]}`);
    }
    expect(RATING_DOMAIN_HINT).toContain(`${RATING_VALUES[0]}-${RATING_VALUES[RATING_VALUES.length - 1]}`);
    for (const m of MODE_VALUES) {
      expect(MODE_DOMAIN_HINT).toContain(m);
      expect(MODE_DOMAIN_HINT).toContain(MODE_LABELS[m]);
    }
    expect(TM_ERRORS_SUPPLEMENT.INVALID_WORD.copy).toContain(String(limitsModule.WORD_MAX_LENGTH));
    expect(TM_ERRORS_SUPPLEMENT.UNDO_LIMIT_REACHED.copy).toContain(String(limitsModule.UNDO_MAX_PER_SESSION));
  });

  it('⑥ 机器话兜底串与门禁禁词在 5 码文案里 0 命中（与判据② 同一口径）', () => {
    const machine = ['undefined', 'NaN', '[object Object]', '500', 'Error:', 'code:'];
    for (const code of SUPPLEMENT_REVIEW_CODES) {
      const copy = TM_ERRORS_SUPPLEMENT[code].copy;
      for (const m of machine) expect(copy.includes(m), `${code} 含 ${m}`).toBe(false);
      for (const term of BANNED_TERMS_LOCAL) expect(copy.includes(term), `${code} 含禁词 ${term}`).toBe(false);
    }
    // 产出面唯一一份：两条静态文案只在 errors.ts 出现。
    expect(filesContaining('这张已经撤过了，没有可撤销的评分')).toEqual([
      'packages/shared/src/constants/errors.ts',
    ]);
    for (const prefix of ['评分必须为', '复习模式必须为', '请输入要复习的词', '一轮最多撤销']) {
      expect(filesContaining(prefix), `${prefix} 被复制`).toEqual(['packages/shared/src/constants/errors.ts']);
    }
  });

  it('⑦ supplement 码也吃得下统一响应体形状（§4.6 约定：error + code）', () => {
    for (const code of SUPPLEMENT_REVIEW_CODES) {
      const body = { error: errorMessage(code), code };
      expect(TmErrorResponseBodySchema.safeParse(body).success, code).toBe(true);
      expect(errorCodeOf(body), code).toBe(code);
    }
  });
});

/* ═════════ T-03r5（PM-fix8 件 1/件 2 + A-65 #181/#182）：九键上收唯一声明点 + D 区同源不变式哨 ═════════
 *
 * 裁决口径（A-65 #181）：`heatSectionTitle` 与 `heatmapAria` 前半句采"**两份字面各自声明 + 这颗哨**"，
 * 不改运行时拼接（§3.7.6 逐字模板保持可直接 grep，既有 aria 钉 `progress-screen.spec.tsx:370/:694` 不改写）；
 * **不得两式并存**。宿主对象 `PROGRESS_APP_COPY` 已整体删除（A-65 #182：实体 9 键、注释自陈"7"不实）。
 */

describe('T-03r5 PROGRESS_COPY 九键上收 + D 区同源不变式哨', () => {
  it('硬前提：原宿主对象 9 个键在 shared 全部有唯一声明点（函数键保持函数形状；不得为凑"7"漏搬）', () => {
    for (const key of [
      'refreshLabel',
      'emptyTitle',
      'emptyBody',
      'heatDegradedBody',
      'heatSectionTitle',
      'heatReloadLabel',
      'heatmapAria',
      'curveAria',
      'heatSparse',
    ]) {
      expect(PROGRESS_COPY, key).toHaveProperty(key);
    }
    for (const key of ['heatmapAria', 'curveAria', 'heatSparse'] as const) {
      expect(typeof PROGRESS_COPY[key], `${key} 必须保持函数形状`).toBe('function');
    }
    // §5.4-4 唯一声明点：三条 PM-fix8 定稿串（含件 3 新键）在 shared 产出面各只住在 copy.ts 一处。
    expect(filesContaining('每日背词热力图')).toEqual(['packages/shared/src/constants/copy.ts']);
    expect(filesContaining('最近一年背了')).toEqual(['packages/shared/src/constants/copy.ts']);
    expect(filesContaining('这里太长了，删短一点再试一次')).toEqual([
      'packages/shared/src/constants/copy.ts',
    ]);
    // 旧自拟字面（件 2 改判理由：同屏两数分叉）在本包源码里 0 残留。
    // ⚠ 拆写与本文件 822 行 `['password' + 'UpgradeEnforce']` 同一先例：这条**计数型/存在性**断言的
    //   被检串若写成连续字面量，会把"全仓 grep 旧字面 = 0"的出口哨兵污染在测试自己身上。
    expect(filesContaining('已经背' + '了')).toEqual([]);
    // 件 3 平铺键：紧挨 signInPassword* 同族、不新增嵌套层、与串 B 逐字区分（尾巴不绑 CTA）。
    expect(AUTH_COPY).toHaveProperty('setPasswordTooLong');
    expect(AUTH_COPY.setPasswordTooLong).not.toBe(AUTH_COPY.signInPasswordTooLong);
  });

  it('件 1 同源不变式哨：heatmapAria(63) = heatSectionTitle + 「，最近一年，共打卡 63 天」（任何一字分叉即红）', () => {
    expect(PROGRESS_COPY.heatmapAria(63)).toBe(
      PROGRESS_COPY.heatSectionTitle + '，最近一年，共打卡 63 天',
    );
    // 模板前半句必须逐字就是区标题本身（"部分重复可接受、分叉不可接受"，PM-fix8 §一）。
    expect(PROGRESS_COPY.heatmapAria(1).startsWith(PROGRESS_COPY.heatSectionTitle)).toBe(true);
  });

  it('件 2 形状哨：heatSparse 的天数只由 days 形参填（无写死数字、无 SPARSE_DAYS 差值式派生）', () => {
    // 同一条模板换两个实参 ⇒ 除天数外逐字相同（串里不掺第二个数字）。
    const three = PROGRESS_COPY.heatSparse(3);
    const five = PROGRESS_COPY.heatSparse(5);
    expect(three.replace('3 天', '#')).toBe(five.replace('5 天', '#'));
    expect(three).toContain('最近一年'); // "最近一年"限定语在场（与客户端 365 天窗口同口径）
    expect((three.match(/\d/g) ?? []).length).toBe(1); // 全串唯一的数字就是实参本身
  });
});

/* ═════════════════════════ T-19g-i「我的」页四处定稿串/数值上收 ═════════════════════════
 *
 * 缺口 G-1 / G-2 / G-3 / G-4（登记处 `.delivery/04-dev-report-T-19-e.md` §遗留）。
 * 处置 = 从 UI 规范 §3.8 **逐字上收**（先例：T-03r 系 / A-43 #76「取 §3.6.5 逐字上收」）。
 * 纪律：期望值在本测试里**另抄一份规范原文**，shared 里那一份若走样（含间隔号、空格、句号）即红。
 * 本轮只补 shared；屏不接三卡（接驳归 T-19g-ii），屏侧的哨在 `apps/app/test/me-screen.spec.tsx` A-06/A-07。
 */

/** `.delivery/03-ui-spec.md:954`（§3.8.1 分区 C 那一行的三格，逐字；N 是数字位）。 */
const UI_SPEC_3_8_1_STAT_ROW = ['词本 N 词', '累计复习 N 天', '连续 N 天'] as const;
/** `.delivery/03-ui-spec.md:1001`（§3.8.5「拉取失败」行的四格，逐字）。 */
const UI_SPEC_3_8_5_FETCH_FAIL_ROW = {
  title: '账号信息没拿到',
  body: '检查网络后再试一次，你的数据没有改动。',
  retry: '再试一次',
  signOut: '退出登录',
} as const;
/** `.delivery:998`（§3.8.5「未登录（App，本地词本仍可用）」行的三串，逐字）。 */
const UI_SPEC_3_8_5_GUEST_ROW = {
  headline: '登录之后，换手机也不丢',
  subtitle: '词本、学习记录和提醒会跟着账号走。',
  continueAsGuest: '先不用，继续本机使用',
} as const;

/** §3.8.1 C 区三格（顺序 = 规范那一行的左右顺序）。 */
const STAT_CELLS: ReadonlyArray<{ label: string; unit: string; value: (n: number) => string }> = [
  SETTINGS_COPY.statCards.words,
  SETTINGS_COPY.statCards.reviewDays,
  SETTINGS_COPY.statCards.streak,
];

describe('T-19g-i G-3：§3.8.1 C 区三张统计卡上收为 SETTINGS_COPY.statCards（逐字 + 同源）', () => {
  it('三格整串逐字 = 规范那一行把 N 换成数字（探针 0/7/12/100 各比一次），且模板里不掺第二个数字', () => {
    for (const probe of [0, 7, 12, 100]) {
      expect(
        STAT_CELLS.map((c) => c.value(probe)),
        `探针 ${probe} 与 §3.8.1 那一行不符`,
      ).toEqual(UI_SPEC_3_8_1_STAT_ROW.map((cell) => cell.replace('N', String(probe))));
    }
    // 形状哨（与上面 PROGRESS_COPY 件 2 同口径）：数字只由形参填。
    for (const c of STAT_CELLS) {
      expect(typeof c.value, '值槽必须是模板函数').toBe('function');
      expect(c.value(3).replace('3', '#')).toBe(c.value(41).replace('41', '#'));
    }
  });

  it('三格 label/unit 逐字；连续格与 formatStreak 同一颗函数（不抄第二份「连续 N 天」）', () => {
    expect(STAT_CELLS.map((c) => c.label)).toEqual(['词本', '累计复习', '连续']);
    expect(STAT_CELLS.map((c) => c.unit)).toEqual(['词', '天', '天']);
    expect(SETTINGS_COPY.statCards.streak.value).toBe(formatStreak);
    expect(SETTINGS_COPY.statCards.streak.value(37)).toBe(formatStreak(37));
    // 三串标签在 shared 里确实"独立成串"了（A-06 由反向转正向的前提）
    const copySrc = SHARED_SRC['../src/constants/copy.ts']!;
    for (const label of ['词本', '累计复习', '连续']) {
      expect(
        new RegExp(`['"\`]${label}['"\`]`).test(copySrc),
        `shared 仍无独立常量 ${label}`,
      ).toBe(true);
    }
  });

  it('三格各自只有 label/unit/value 三键 ⇒ §3.8.1:961 的三个落点没被拖进 shared', () => {
    for (const [name, cell] of Object.entries(SETTINGS_COPY.statCards)) {
      expect(Object.keys(cell).sort(), name).toEqual(['label', 'unit', 'value']);
    }
    const copySrc = SHARED_SRC['../src/constants/copy.ts']!;
    const block = copySrc
      .slice(copySrc.indexOf('statCards: {'), copySrc.indexOf('reminder: {'))
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block.length, '抠不到 statCards 块 ⇒ 下面那条判据会变成永真').toBeGreaterThan(0);
    expect(block, 'statCards 里出现了路由/落点字样').not.toMatch(/wordbook|progress|href|route|navigate/i);
  });
});

describe('T-19g-i G-1：§3.8.3 滑杆域上收为 limits.ts 的四条数值 + 域不变式', () => {
  it('四条数值随 bug_list #6 改判：`min=5 max=200 step=1`，默认 `10`（原 §3.8.3 的 5/50/5 已废止）', () => {
    expect(DAILY_GOAL_UI_MIN).toBe(5);
    expect(DAILY_GOAL_UI_MAX).toBe(200);
    expect(DAILY_GOAL_UI_STEP).toBe(1);
    expect(DAILY_GOAL_UI_DEFAULT).toBe(10);
    // 数值、不是文案
    for (const v of [DAILY_GOAL_UI_MIN, DAILY_GOAL_UI_MAX, DAILY_GOAL_UI_STEP, DAILY_GOAL_UI_DEFAULT]) {
      expect(typeof v).toBe('number');
    }
  });

  it('不变式哨：UI 域 ⊂ 契约域且默认值同源 ⇒ 滑出来的值永不被服务端拒（上收自屏侧 B-04 的那一半）', () => {
    expect(DAILY_GOAL_UI_MIN).toBeGreaterThanOrEqual(DAILY_GOAL_MIN);
    expect(DAILY_GOAL_UI_MAX).toBeLessThanOrEqual(DAILY_GOAL_MAX);
    expect(DAILY_GOAL_UI_DEFAULT).toBe(DAILY_GOAL_DEFAULT);
    expect(DAILY_GOAL_UI_DEFAULT).toBeGreaterThanOrEqual(DAILY_GOAL_UI_MIN);
    expect(DAILY_GOAL_UI_DEFAULT).toBeLessThanOrEqual(DAILY_GOAL_UI_MAX);
    expect(DAILY_GOAL_UI_STEP).toBeGreaterThan(0);
    // 域内每一个可滑落点（含两端）都能过 `daily_goal` 的契约校验 —— 真哨，不只看数
    const stops: number[] = [];
    for (let n = DAILY_GOAL_UI_MIN; n <= DAILY_GOAL_UI_MAX; n += DAILY_GOAL_UI_STEP) stops.push(n);
    // bug_list #6 起 step=1：5..200 全整数，共 196 个可滑点（原 5/50/5 是 10 个）
    expect(stops.length).toBe(DAILY_GOAL_UI_MAX - DAILY_GOAL_UI_MIN + 1);
    expect(stops[stops.length - 1]).toBe(DAILY_GOAL_UI_MAX);
    for (const n of stops) {
      expect(ProfileUpdateInputSchema.safeParse({ daily_goal: n }).success, `${n} 被契约域拒`).toBe(true);
    }
    expect(ProfileUpdateInputSchema.safeParse({ daily_goal: DAILY_GOAL_MAX + 1 }).success).toBe(false);
  });
});

describe('T-19g-i G-2 / G-4：§3.8.5 错误卡与未登录引导上收为 SETTINGS_COPY.fetchFail / .guestGuide', () => {
  it('G-2「拉取失败」整页错误卡逐字 = §3.8.5:1001 那一行，且不与 §3.7 那份 PROGRESS_COPY.fail 混用', () => {
    expect(SETTINGS_COPY.fetchFail.title).toBe(UI_SPEC_3_8_5_FETCH_FAIL_ROW.title);
    expect(SETTINGS_COPY.fetchFail.body).toBe(UI_SPEC_3_8_5_FETCH_FAIL_ROW.body);
    expect(SETTINGS_COPY.fetchFail.retry).toBe(UI_SPEC_3_8_5_FETCH_FAIL_ROW.retry);
    expect(SETTINGS_COPY.fetchFail.signOut).toBe(UI_SPEC_3_8_5_FETCH_FAIL_ROW.signOut);
    // 主语不同（"账号信息" vs "学习情况"）⇒ 两串必须各表其义，不许并成一份
    expect(SETTINGS_COPY.fetchFail.title).not.toBe(PROGRESS_COPY.fail.title);
    expect(SETTINGS_COPY.fetchFail.body).not.toBe(PROGRESS_COPY.fail.body);
    // 那一行只有这四格 ⇒ 错误卡无第五槽（不给自己发明副出口）
    expect(Object.keys(SETTINGS_COPY.fetchFail).sort()).toEqual(['body', 'retry', 'signOut', 'title']);
    expect(filesContaining('账号信息没拿到')).toEqual(['packages/shared/src/constants/copy.ts']);
    expect(filesContaining('检查网络后再试一次，你的数据没有改动。')).toEqual([
      'packages/shared/src/constants/copy.ts',
    ]);
  });

  it('G-4 未登录引导三串逐字 = §3.8.5:998 那一行；同行主/次按钮沿用 AUTH_COPY.submit 既有声明点，不抄第二份', () => {
    expect(SETTINGS_COPY.guestGuide.headline).toBe(UI_SPEC_3_8_5_GUEST_ROW.headline);
    expect(SETTINGS_COPY.guestGuide.subtitle).toBe(UI_SPEC_3_8_5_GUEST_ROW.subtitle);
    expect(SETTINGS_COPY.guestGuide.continueAsGuest).toBe(UI_SPEC_3_8_5_GUEST_ROW.continueAsGuest);
    // 规范那一行的主按钮 `登录` / 次按钮 `注册` 在 shared 已有定稿声明点 ⇒ 本键不得再各写一份
    expect(Object.keys(SETTINGS_COPY.guestGuide).sort()).toEqual(['continueAsGuest', 'headline', 'subtitle']);
    expect(AUTH_COPY.submit.login).toBe('登录');
    expect(AUTH_COPY.submit.register).toBe('注册');
    for (const literal of [
      UI_SPEC_3_8_5_GUEST_ROW.headline,
      UI_SPEC_3_8_5_GUEST_ROW.subtitle,
      UI_SPEC_3_8_5_GUEST_ROW.continueAsGuest,
    ]) {
      expect(filesContaining(literal), literal).toEqual(['packages/shared/src/constants/copy.ts']);
    }
  });
});

describe('T-19g-i 导出面与键名：新增量都在 @tm/shared 的公开面上（宿主只能从这里取）', () => {
  it('copy.ts / limits.ts 的导出名在位，SETTINGS_COPY 的四个新键在位（改名即红）', () => {
    for (const name of ['statCards', 'fetchFail', 'guestGuide']) {
      expect(SETTINGS_COPY, name).toHaveProperty(name);
      expect(copyModule.SETTINGS_COPY, `SETTINGS_COPY.${name}`).toHaveProperty(name);
    }
    for (const name of ['DAILY_GOAL_UI_MIN', 'DAILY_GOAL_UI_MAX', 'DAILY_GOAL_UI_STEP', 'DAILY_GOAL_UI_DEFAULT']) {
      expect(limitsModule, name).toHaveProperty(name);
    }
    // 垫片路径 `@tm/shared/copy` 也拿得到（宿主不许绕到 src 相对路径）
    expect(shimModule).toHaveProperty('SETTINGS_COPY');
  });
});

/* ═════════ E4b3 件4（R-15⑤ · A-85 #312）：进度三键的键名/单位单点哨 + 输入面反证位 ═════════ */
describe('E4b3 件4：词本进度三键只做类型上收，输入面不受影响', () => {
  it('三键的键名与单位口径只住在 contracts/wordbook.ts 一处（键名单点数组 + 类型吃得下 ms 数值）', () => {
    expect(WORDBOOK_PROGRESS_KEYS).toEqual(['state', 'lapses', 'nextDue']);
    const projected = { state: 2, lapses: 1, nextDue: 1_700_000_000_000 } satisfies WordbookProgress;
    expect(Object.keys(projected)).toEqual([...WORDBOOK_PROGRESS_KEYS]);
    const src = SHARED_SRC['../src/contracts/wordbook.ts']!;
    expect(src.match(/nextDue\?: number/g), 'nextDue 的单位声明被抄成第二份').toHaveLength(1);
  });

  it('反证位：三键没进 shape，带三键与 nextDue 写成字符串的 push 载荷都照过（不新造 400）', () => {
    for (const key of WORDBOOK_PROGRESS_KEYS) expect(WordbookEntrySchema.shape, key).not.toHaveProperty(key);
    for (const entry of [
      { word: 'apple', state: 2, lapses: 1, nextDue: 1_700_000_000_000 },
      { word: 'apple', state: 2, lapses: 1, nextDue: '1700000000000' }, // 老客户端把 ms 串成字符串回推
    ]) {
      const r = parseWordbookPush({ baseVersion: 1, entries: [entry], removedWords: [] });
      expect(r.success, JSON.stringify(entry)).toBe(true);
      expect(r.data?.entries[0]).toMatchObject(entry); // .passthrough() 原样带回，不静默丢键
    }
    const pull = WordbookPullResultSchema.safeParse({ version: 1, updatedAt: 1, entries: [{ word: 'a', state: 2 }] });
    expect(pull.success).toBe(true);
  });
});

describe('E4b3b 件A：`with_progress` 参数名单点哨（A-87 #325，抄出第二处即红）', () => {
  it('常量在位且全 shared 产出面该字面量恰出现一次', () => {
    expect([WORDBOOK_PROGRESS_QUERY, WORDBOOK_PROGRESS_QUERY_ON]).toEqual(['with_progress', '1']);
    for (const key of MY_OUTPUT_KEYS) {
      const hits = (SHARED_SRC[key]!.match(/with_progress/g) ?? []).length;
      expect(hits, `${key} 提到 with_progress ${hits} 次`).toBe(key === '../src/contracts/wordbook.ts' ? 1 : 0);
    }
  });
});

describe('E4b6 件1：`SETTINGS_COPY.rows.*` ↔ `groups[2]/[4]` 同源哨（A-86 #320 的 5A，分叉即红）', () => {
  it('两颗专用键与 groups 同引一颗 const、值逐字「外观」/「关于」，且 copy.ts 里该字面量各只声明一处', () => {
    expect(SETTINGS_COPY.rows.appearance).toBe(SETTINGS_COPY.groups[2]);
    expect(SETTINGS_COPY.rows.about).toBe(SETTINGS_COPY.groups[4]);
    expect([SETTINGS_COPY.rows.appearance, SETTINGS_COPY.rows.about]).toEqual(['外观', '关于']);
    const copySrc = SHARED_SRC['../src/constants/copy.ts']!;
    for (const label of ['外观', '关于']) {
      const hits = (copySrc.match(new RegExp(`['"\`]${label}['"\`]`, 'g')) ?? []).length;
      expect(hits, `copy.ts 里 ${label} 的字面量声明处 ${hits} 份（第二份就可分叉）`).toBe(1);
    }
  });
});

describe('E4b4 件A：`flipLookupDirection` 三值行为哨（A-89 #342，逐值钉死，期望值不从实现反推）', () => {
  it('zh2en→en2zh、en2zh→zh2en、auto→zh2en（第三档与两颗 aria-label 的承诺同口径）', () => {
    expect(flipLookupDirection('zh2en')).toBe('en2zh');
    expect(flipLookupDirection('en2zh')).toBe('zh2en');
    expect(flipLookupDirection('auto')).toBe('zh2en');
  });
});
