/**
 * 资料契约（§3.3.1 草案 + R-04①②③）。
 *
 * R-04③：**tRPC 与 REST 返回同一个 DTO** —— 本文件的 `ProfileDtoSchema` 就是那个 DTO，
 * 两条门面必须都能被它 `safeParse` 通过且 key 集合相同（§4.2-2 的契约测试判据）。
 *
 * 兼容点（唯一一处）：`profileDtoLegacyAlias()` 把 snake_case 的 `daily_goal` 复制一份 camel 的
 * `dailyGoal`，**不改名、不删除旧键**；新代码只读 `daily_goal`。
 *
 * 注意：`types.ts` 已导出的 `ProfileRow`（表行，5 个键）与草案的 `ProfileDto`（8 个键）形状不同，
 * 这里分成两个 schema，避免"改形即打穿消费方"（§3.3 规则①）。
 */

import { z } from 'zod';
import {
  AVATAR_MAX_BYTES,
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NICKNAME_MAX_LENGTH,
  PHONE_PATTERN,
} from '../constants/limits.js';

/** `profiles` 表行（旧形状，键名与列名一一对应，不得增删）。 */
export const ProfileRowSchema = z.object({
  user_id: z.number().int(),
  nickname: z.string(),
  avatar: z.string(),
  daily_goal: z.number().int(),
  updated_at: z.number().int(),
});

/** `users` 表行（旧形状；`password` 可为 null = 验证码注册的存量账号）。 */
export const UserRowSchema = z.object({
  id: z.number().int(),
  phone: z.string().regex(PHONE_PATTERN),
  password: z.string().nullable(),
  created_at: z.number().int(),
});

/** 头像 / base64 数据（Q4：本期不迁对象存储，base64 与 URL 都允许）。 */
const AvatarValueSchema = z.string();

/** 统一资料 DTO（草案形状，`.passthrough()` 容许旧响应多带的统计键）。 */
export const ProfileDtoSchema = z
  .object({
    user_id: z.number().int(),
    phone: z.string().regex(PHONE_PATTERN),
    nickname: z.string().max(NICKNAME_MAX_LENGTH),
    avatar: AvatarValueSchema,
    daily_goal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX),
    updated_at: z.number().int(),
    /** R-39/R-40 新增键（只加不改名）。 */
    hasPassword: z.boolean(),
    pwPolicyVersion: z.number().int(),
  })
  .passthrough();
export type ProfileDto = z.infer<typeof ProfileDtoSchema>;

/** 兼容映射：唯一一处 `dailyGoal` 别名的生成点。 */
export const profileDtoLegacyAlias = (p: ProfileDto): ProfileDto & { dailyGoal: number } => ({
  ...p,
  dailyGoal: p.daily_goal,
});

/** 旧 `GET /api/profile` 响应（统计三件套；形状冻结，新代码改读 `/api/me` + tRPC `profile.get`）。 */
export const ProfileSummarySchema = z
  .object({
    nickname: z.string(),
    avatar: AvatarValueSchema,
    daily_goal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).default(DAILY_GOAL_DEFAULT),
    totalWords: z.number().int().nonnegative(),
    reviewDays: z.number().int().nonnegative(),
    reviewDates: z.array(z.number().int().nonnegative()),
  })
  .passthrough();
export type ProfileSummaryDto = z.infer<typeof ProfileSummarySchema>;

/** 改资料入参（全部可选，未传即不改）。 */
export const ProfileUpdateInputSchema = z.object({
  nickname: z.string().max(NICKNAME_MAX_LENGTH).optional(),
  avatar: AvatarValueSchema.optional(),
  daily_goal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  /** 旧客户端可能发 camel；出现即等价于 `daily_goal`（两者都缺才报错由服务端裁决）。 */
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
});
export type ProfileUpdateInputDto = z.infer<typeof ProfileUpdateInputSchema>;

/** 头像上传入参（R-04①②：上限由服务端按 `AVATAR_MAX_BYTES` 单点判定，本处只保证形状）。 */
export const AvatarInputSchema = z.object({
  dataUrl: AvatarValueSchema,
  /** 可选：前端预压缩后的原始字节数，服务端仍以解码后的真实大小为准。 */
  declaredBytes: z.number().int().nonnegative().max(AVATAR_MAX_BYTES).optional(),
});
export type AvatarInputDto = z.infer<typeof AvatarInputSchema>;

/** 头像 base64 的解码字节数（**唯一实现**，两端与服务端共用；R-04① 的 300KB 判定入口）。 */
export function decodedDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

export function parseProfileDto(value: unknown) {
  return ProfileDtoSchema.safeParse(value);
}
