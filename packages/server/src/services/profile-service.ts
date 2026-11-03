/**
 * 资料装配（R-04③）——**ProfileDto 的唯一装配点**（§4.5 写死："profile-service.getDto() 为唯一装配点"）。
 *
 * 现状缺陷（本文件收口）：tRPC `profile.get` 发 `dailyGoal`、`GET /api/profile` 发 `daily_goal`，
 * 两侧键集合不同 ⇒ 前端各写一套取值兜底（R-04③"返回同一 DTO"不成立）。
 * 收口后两门面调用**同一个** `getProfileDto()`：键集合逐字相同、都能过 `ProfileDtoSchema.safeParse`。
 *
 * 真值只有一份：`profiles.daily_goal`（列名一字不动，R-04⑤）。
 * `dailyGoal` 是**读侧兼容别名**，由 `@tm/shared` 的 `profileDtoLegacyAlias()` 生成（全库唯一生成点），
 * 写侧两个键都归一到 `daily_goal` 再落库（`updateProfile`）⇒ 库内不存在第二份真值。
 *
 * 兼容别名开关（判据② 的"开关"）：`PROFILE_DTO_LEGACY_ALIAS=off` 时两门面同时不再输出 `dailyGoal`。
 * 域内常量按 §10.3 的口径留在本 service 顶部，不进 `config.ts`（T-07 独占）。
 *
 * 旧 `GET /api/profile` 的六个键（nickname/avatar/daily_goal/totalWords/reviewDays/reviewDates）
 * 一个不动，只做**纯增键**（§6.2 红线接口"只加不改形"）。
 */

import {
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NICKNAME_MAX_LENGTH,
  ProfileDtoSchema,
  decodedDataUrlBytes,
  profileDtoLegacyAlias,
  type ProfileDto,
} from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { AvatarError, assertAvatarValue } from './avatar-service.js';

/** 兼容别名开关（唯一读取点；`off` = 两门面同时停发 `dailyGoal`）。 */
const LEGACY_ALIAS_ENV = 'PROFILE_DTO_LEGACY_ALIAS';

export function legacyAliasEnabled(): boolean {
  const raw = (process.env[LEGACY_ALIAS_ENV] ?? '').trim().toLowerCase();
  return raw !== 'off' && raw !== '0' && raw !== 'false';
}

/** 统一 DTO 的**键集合**（判据① 的断言靶子：两门面都必须恰好输出这些键）。 */
export const PROFILE_DTO_KEYS = [
  'user_id',
  'phone',
  'nickname',
  'avatar',
  'daily_goal',
  'updated_at',
  'hasPassword',
  'pwPolicyVersion',
  'totalWords',
  'reviewDays',
  'reviewDates',
  'streak',
] as const;

/** 旧响应里必须仍在的键（§6.2 红线：`GET /api/profile` 不改形，只加）。 */
export const PROFILE_LEGACY_KEYS = [
  'nickname',
  'avatar',
  'daily_goal',
  'totalWords',
  'reviewDays',
  'reviewDates',
] as const;

export type ProfileDtoView = ProfileDto & {
  totalWords: number;
  reviewDays: number;
  reviewDates: string[];
  streak: number;
} & Partial<{ dailyGoal: number }>;

export class ProfileError extends Error {
  /** §4.6 的码；资料域的"昵称过长 / 每日目标越界"在冻结表与 supplement 里**都没有对应码**
   *  → 不带 `code` 键（A-28-4：不许自建域内码表），文案沿用现网人话。已记入报告待裁决。 */
  readonly tmCode?: string;
  readonly http: number;

  constructor(message: string, http = 400, code?: string) {
    super(message);
    this.name = 'ProfileError';
    this.tmCode = code;
    this.http = http;
  }
}

/** 领域错误 → 响应体（§4.6 统一约定：`error` 人话，`code` 是新增可选键）。 */
export function profileErrorBody(err: ProfileError): { status: number; body: Record<string, string> } {
  const body: Record<string, string> = { error: err.message };
  if (err.tmCode) body.code = err.tmCode;
  return { status: err.http, body };
}

/** tRPC 侧同一错误的载体名（两侧都"拒"，只是 tRPC 走 TRPCError 的码名，与 A-28-5 的口径一致）。 */
export function profileErrorTrpcCode(err: ProfileError): 'BAD_REQUEST' | 'FORBIDDEN' {
  return err.http === 403 ? 'FORBIDDEN' : 'BAD_REQUEST';
}

/** `daily_goal` / `dailyGoal` 归一：真值只有一个来源键，别名只在校验前归一，不并存两份。 */
export function normalizeDailyGoal(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < DAILY_GOAL_MIN || n > DAILY_GOAL_MAX) {
    throw new ProfileError(`每日目标需为 ${DAILY_GOAL_MIN}-${DAILY_GOAL_MAX} 之间的整数`);
  }
  return n;
}

/** 昵称校验（沿用现网 400 人话"昵称过长"，上限取 shared 的 `NICKNAME_MAX_LENGTH`）。 */
export function normalizeNickname(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string' || raw.length > NICKNAME_MAX_LENGTH) {
    throw new ProfileError('昵称过长');
  }
  return raw;
}

/* ───────────────────── 读：唯一装配点 ───────────────────── */

export interface GetProfileDtoOptions {
  /** 覆盖兼容别名开关（测试用；缺省读 env） */
  legacyAlias?: boolean;
}

/**
 * R-04③：**两条门面唯一可调用的装配函数**。
 * 真值 = `profiles.daily_goal`；`dailyGoal` 只由 `profileDtoLegacyAlias()` 派生一份。
 */
export async function getProfileDto(
  db: AppDB,
  userId: number,
  opts: GetProfileDtoOptions = {},
): Promise<ProfileDtoView> {
  const profile = await db.profiles.ensure(userId);
  const [user, credentials, words, reviewDates, streak] = await Promise.all([
    db.users.findById(userId),
    db.users.findCredentialsById(userId),
    db.wordbooks.getData(userId),
    db.checkins.getDates(userId),
    db.checkins.getStreak(userId),
  ]);

  const base: ProfileDto & { totalWords: number; reviewDays: number; reviewDates: string[]; streak: number } = {
    user_id: profile.user_id,
    // 手机号只到这里、不再往外扩散新键：`ProfileDtoSchema` 要求 phone（R-04③ 的 DTO 形状）
    phone: user?.phone ?? credentials?.phone ?? '',
    nickname: profile.nickname,
    avatar: profile.avatar,
    daily_goal: profile.daily_goal || DAILY_GOAL_DEFAULT,
    updated_at: profile.updated_at,
    hasPassword: (credentials?.password ?? '').trim() !== '',
    pwPolicyVersion: credentials?.pw_policy_version ?? 0,
    totalWords: words.length,
    reviewDays: reviewDates.length,
    reviewDates,
    streak,
  };

  const withAlias = (opts.legacyAlias ?? legacyAliasEnabled()) ? profileDtoLegacyAlias(base) : base;
  const parsed = ProfileDtoSchema.safeParse(withAlias);
  if (!parsed.success) {
    // 存量脏数据（例如旧行 `daily_goal=0`）不得变成 500：按契约的默认值兜一次再输出
    const repaired = {
      ...base,
      daily_goal:
        base.daily_goal >= DAILY_GOAL_MIN && base.daily_goal <= DAILY_GOAL_MAX ? base.daily_goal : DAILY_GOAL_DEFAULT,
      nickname: base.nickname.slice(0, NICKNAME_MAX_LENGTH),
      phone: base.phone,
    };
    const repairedView = (opts.legacyAlias ?? legacyAliasEnabled()) ? profileDtoLegacyAlias(repaired) : repaired;
    if (!ProfileDtoSchema.safeParse(repairedView).success) {
      // 仍然不过 ⇒ 装配点自己写坏了，抛错让 CI 抓到（不是"降级成一个不像 DTO 的形状"）
      throw new ProfileError('资料数据异常，请稍后重试', 500);
    }
    return repairedView as ProfileDtoView;
  }
  return withAlias as ProfileDtoView;
}

/* ───────────────────── 写：唯一落库点 ───────────────────── */

export interface UpdateProfileInput {
  nickname?: unknown;
  avatar?: unknown;
  daily_goal?: unknown;
  dailyGoal?: unknown;
}

export interface UpdateProfileOptions {
  /** 头像上限模式：'unified'（开关 on，默认）或 'legacy'（开关 off，回退到各面旧字符上限） */
  avatarMode?: 'unified' | 'legacy';
  /** legacy 模式下这一面的旧字符上限（REST 200_000 / tRPC 500） */
  legacyAvatarMaxChars?: number;
  facade?: 'rest' | 'trpc' | 'avatar-api';
  now?: number;
}

/**
 * 写资料：三个键各只有一份真值落库（`daily_goal`）。
 * 同时收到 `daily_goal` 与 `dailyGoal` 时以 **`daily_goal` 为准**（别名只读不写，不产生第二份真值）。
 * @throws ProfileError | AvatarError
 */
export async function updateProfile(
  db: AppDB,
  userId: number,
  raw: UpdateProfileInput,
  opts: UpdateProfileOptions = {},
): Promise<{ ok: true; daily_goal: number }> {
  const nickname = normalizeNickname(raw.nickname);

  let avatar: string | undefined;
  if (raw.avatar !== undefined) {
    try {
      avatar = assertAvatarValue(raw.avatar, {
        mode: opts.avatarMode === 'legacy' ? 'legacy' : 'unified',
        legacyMaxChars: opts.legacyAvatarMaxChars,
        facade: opts.facade ?? 'rest',
      });
    } catch (err) {
      if (err instanceof AvatarError) throw err;
      throw err;
    }
  }

  const goalRaw = raw.daily_goal !== undefined ? raw.daily_goal : raw.dailyGoal;
  const daily_goal = normalizeDailyGoal(goalRaw);

  if (nickname === undefined && avatar === undefined && daily_goal === undefined) {
    // 空 patch：不落库、不推进 updated_at（幂等，重复提交无副作用）
    return { ok: true, daily_goal: await currentDailyGoal(db, userId) };
  }

  await db.profiles.update(userId, { nickname, avatar, daily_goal }, opts.now ?? Date.now());
  return {
    ok: true,
    daily_goal: daily_goal ?? (await currentDailyGoal(db, userId)),
  };
}

/** 读回当前真值（`daily_goal` 列；0/NULL 这类脏值按 shared 的默认值口径回一）。 */
async function currentDailyGoal(db: AppDB, userId: number): Promise<number> {
  const row = await db.profiles.ensure(userId);
  return row.daily_goal || DAILY_GOAL_DEFAULT;
}

/* ───────────────────── POST /api/avatar 的落库路径 ───────────────────── */

/**
 * 头像上传（R-04①②⑥）：校验后**直接写 `profiles.avatar`**——
 * 本期不落文件、不迁对象存储（Q4 定案），也不回填任何历史 base64。
 * @throws AvatarError
 */
export async function saveAvatar(
  db: AppDB,
  userId: number,
  dataUrl: unknown,
  opts: { now?: number; mode?: 'unified' | 'legacy'; legacyMaxChars?: number } = {},
): Promise<{ ok: true; avatar: string; bytes: number | null }> {
  const value = assertAvatarValue(dataUrl, {
    mode: opts.mode === 'legacy' ? 'legacy' : 'unified',
    legacyMaxChars: opts.legacyMaxChars,
    facade: 'avatar-api',
  });
  await db.profiles.update(userId, { avatar: value }, opts.now ?? Date.now());
  // 回给客户端的字节数必须与**判定用的那一个数**同源（shared 的 `decodedDataUrlBytes`）。
  // 旧写法在这里又手算了一遍 `(length*3)/4`：它把 `data:image/*;base64,` 前缀一起算了进去、
  // 也不减 padding ⇒ 报出去的值比 300KB 那条线的实际判定值偏大，属于"同一规则抄第三份"。
  const bytes = value ? decodedDataUrlBytes(value) : 0;
  return { ok: true, avatar: value, bytes: bytes || null };
}
