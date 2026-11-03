/**
 * tRPC 域：profile（个人资料）
 *
 * T-11 收口（R-04①②③）：
 *  - `get` 与 REST `GET /api/profile` 走**同一个装配函数** `getProfileDto()` ⇒ 键集合逐字相同、
 *    两侧都过 `ProfileDtoSchema.safeParse`（判据①）；
 *  - `update` 的 avatar 上限不再自己写 500 字符，与 REST 统一到 `AVATAR_MAX_BYTES` + 200px（判据③）；
 *  - `dailyGoal` 保留为**入参别名**（旧 tRPC 客户端继续可用），真值仍是 `daily_goal` 一份（判据②）。
 *
 * `changePassword` 按 A-30-3 收口：**签名一字不动、函数体转调 `ctx.auth` 的改密 service**，
 * 本文件的 `bcrypt` 直调与重复校验全部删除 ⇒ R-40② 的"改密唯一出口"才真正成立（见该过程的注释）。
 *
 * A-34-1（§11 F-7 从审计盲区升级为阻断门禁）：**只给 `get` 挂了 `output` parser**，
 * 入参一字未改、procedure 清单未变；`update` / `changePassword` 本轮仍不挂（口径见 A-34-1③④，
 * 它们没有"已有 DTO + 已有双侧 safeParse 用例"的出参契约）。
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NICKNAME_MAX_LENGTH,
  ProfileDtoSchema,
  type TmErrorCode,
} from '@tm/shared';
import type { FeatureFlags } from '../../services/feature-flags.js';
import { AvatarError, avatarErrorBody, avatarErrorTrpcCode } from '../../services/avatar-service.js';
import { ProfileError, getProfileDto, profileErrorTrpcCode, updateProfile } from '../../services/profile-service.js';
import { credentialErrorBody, tmErrorCause } from '../../services/password-policy.js';
import { protectedProcedure, router } from '../init.js';

/** 改动前 tRPC 侧的旧字符上限（`avatarUnifiedLimit=off` 时回退用）。 */
const LEGACY_TRPC_AVATAR_MAX_CHARS = 500;

/**
 * A-35-1①：**必须闭合，不能继承 passthrough**。
 * 上一版是 `ProfileDtoSchema.extend({...})`，而 `packages/shared/src/contracts/profile.ts` 的
 * `ProfileDtoSchema` 是 `.passthrough()` ⇒ extend 出来的出参 schema 带 `{[k:string]: unknown}`
 * 索引签名，**属性访问时索引签名压过声明键** ⇒ tRPC 客户端 `inferRouterOutputs` 拿到的每个键仍是
 * `unknown`（TPM 双面探针实测，A-35-1#1）。所以"挂了 output parser 就有类型"只对**闭合对象**成立。
 * 本 schema 因此改为 `z.object({ ...ProfileDtoSchema.shape, … })`：默认 `unknownKeys='strip'`，
 * 无索引签名，客户端类型面才真的通。
 * ⚠ 这只影响 **tRPC 出参装配面**：REST 侧 `ProfileDtoSchema` 的 passthrough **一字未动**
 *   （未知键存活是 T-06 事务 RMW 的既有语义）。代价是"闭合 ⇒ 未声明的键会被静默丢掉"，
 *   该风险由 `test/integration/profile-output-parser.spec.ts` 的**键集合钉**用例（A-35-1②）兜。
 *
 * 8 个契约键**复用 shared 的字段 schema 实例**（`.shape`，不抄第二份形状，A-34-1①"不新造真相"不变），
 * 这里只把 `getProfileDto()` 实际已在发、却被 passthrough 吞成 `unknown` 的 5 个键按服务端既有的
 * 装配形状（`profile-service.ts` 的 `ProfileDtoView`）补成显式类型面。
 *
 * 两个"必填/选填"的取舍不是风格问题，是被现存的绿用例钉住的：
 *  - `dailyGoal` **只能 optional**：`PROFILE_DTO_LEGACY_ALIAS=off` 时两门面同时停发该键
 *    （`profile-dto.spec.ts` 判据② 那条用例断言 `hasOwnProperty(viaTrpc,'dailyGoal') === false`），
 *    声明成必填就是 A-34-1② 要防的"会误杀的 parser"。前端要读的是 canonical 键 `daily_goal`
 *    （A-35-1③，`page.tsx:92` 本轮已改）。
 *  - 4 个统计键必填：`getProfileDto()` 无条件装配它们（`words.length` / `reviewDates.length` /
 *    `computeStreak()`），漏发就是装配点写坏了，该红。
 */
export const ProfileGetOutputSchema = z.object({
  ...ProfileDtoSchema.shape,
  /** 唯一别名键，只读派生自 `daily_goal`（生成点 = shared 的 `profileDtoLegacyAlias()`）。 */
  dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
  totalWords: z.number().int().nonnegative(),
  reviewDays: z.number().int().nonnegative(),
  reviewDates: z.array(z.string()),
  streak: z.number().int().nonnegative(),
});

/**
 * 领域错误 → `TRPCError`。
 *
 * ⚠ tRPC v11.18 的 `TRPCErrorOptions` 只有 `{code, message, cause}`（**没有** `data`；
 * 传 `data` 会被运行时丢掉，只在 tsc 里留一条 TS2353）。tRPC 自己发出的
 * `error.data = {code: 'BAD_REQUEST', httpStatus}` 是协议状态码，不是 shared 的 `tm_code`。
 * ⇒ 判据③ 要求"超限两侧返回同一条人话"落在 **`message` 与 REST 的 `{error}` 逐字相同**上，
 * shared 的 `tm_code` 经 `cause` 透传，由 `trpc/init.ts` 的**唯一** `errorFormatter`（A-30-1，T-07 已落地）
 * 提升为 `data.code`。钉住该形状的断言在 `profile-dto.spec.ts` / `chat-isolation.spec.ts` 各一条。
 */
function toTrpcError(err: unknown, facade: 'trpc'): never {
  if (err instanceof AvatarError) {
    const { body, status } = avatarErrorBody(err);
    throw new TRPCError({
      code: avatarErrorTrpcCode(err),
      message: body.error,
      cause: { tmCode: body.code, httpStatus: status, facade },
    });
  }
  if (err instanceof ProfileError) {
    throw new TRPCError({
      code: profileErrorTrpcCode(err),
      message: err.message,
      cause: { tmCode: err.tmCode, httpStatus: err.http, facade },
    });
  }
  throw err as never;
}

/** 凭据域错误（`auth-service` 抛的那批）→ `TRPCError`；非凭据错误原样抛出，绝不兜成 500。 */
function toAuthTrpcError(err: unknown): never {
  const mapped = credentialErrorBody(err);
  if (!mapped) throw err as never;
  const code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'TOO_MANY_REQUESTS' =
    mapped.status === 401
      ? 'UNAUTHORIZED'
      : mapped.status === 403
        ? 'FORBIDDEN'
        : mapped.status === 409
          ? 'CONFLICT'
          : mapped.status === 429
            ? 'TOO_MANY_REQUESTS'
            : 'BAD_REQUEST';
  throw new TRPCError({
    code,
    message: mapped.body.error,
    cause: mapped.body.code ? tmErrorCause(mapped.body.code as TmErrorCode) : null,
  });
}

export const profile = router({
  /**
   * R-04③：与 `GET /api/profile` 同一份 DTO、同一份键集合。
   * A-34-1①：挂 `output` parser ⇒ 客户端推出真实类型而非 `unknown`（F-7 的出参侧覆盖从 0 变成有值）。
   */
  get: protectedProcedure
    .output(ProfileGetOutputSchema)
    .query(async ({ ctx }) => getProfileDto(ctx.db, ctx.userId)),

  update: protectedProcedure
    .input(
      z.object({
        nickname: z.string().max(NICKNAME_MAX_LENGTH).optional(),
        // 真实上限（300KB 解码字节 + 200px 边长）在 `assertAvatarValue` 一处判。
        // 这里**不复制一份字符上限**：旧版写着 `max(500)` 就是 C-04"永远失败"的成因；
        // 而把 `AVATAR_MAX_DATA_URL_CHARS`（≈400K 字符）抄进 zod，会让 300~384KB 这一段
        // 被 zod 抢先拒掉，返回的就不是 shared 那条人话了（判据③ 要求三入口同一条）。
        // 请求体总大小由 `app.ts` 的全局 `bodyLimit`（`HTTP_BODY_LIMIT_BYTES`，T-07 装配）兜住。
        avatar: z.string().optional(),
        /** 旧键：保留（只加不改名），值为 `daily_goal` 的别名 */
        dailyGoal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
        /** 新键：与 REST / 库列同名 */
        daily_goal: z.number().int().min(DAILY_GOAL_MIN).max(DAILY_GOAL_MAX).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const flags = (ctx as { flags?: FeatureFlags }).flags;
      const unified = flags ? await flags.isOn('avatarUnifiedLimit') : true;
      try {
        return await updateProfile(
          ctx.db,
          ctx.userId,
          { nickname: input.nickname, avatar: input.avatar, daily_goal: input.daily_goal, dailyGoal: input.dailyGoal },
          {
            avatarMode: unified ? 'unified' : 'legacy',
            legacyAvatarMaxChars: LEGACY_TRPC_AVATAR_MAX_CHARS,
            facade: 'trpc',
            now: Date.now(),
          },
        );
      } catch (err) {
        return toTrpcError(err, 'trpc');
      }
    }),

  /**
   * ⚠ A-30-3：本过程是旧 router 搬迁留下的**重复改密入口**，R-40② 的改密唯一出口是
   * `auth.changePassword`（T-07）。签名与 input/output 形状**一字不动**（A-28-1 的"基线只增不改"），
   * 函数体改为转调 `ctx.auth` 的改密 service ⇒ 本文件不再有 `bcrypt` 直调、不再自己少校验一道
   * （旧实现连"验旧密码 / ≥8 位 / 写 `pw_policy_version` / 吊销旧 token / 审计"全都没做）。
   *
   * 冻结的 input 里只有一个 `password` 键、没有 `oldPassword` ⇒ 唯一出口按 R-40② 必拒
   * `OLD_PASSWORD_REQUIRED`（"请输入当前密码"）。**这就是裁决要的效果**：这条口不再能改密，
   * 改密只有 `auth.changePassword` 一条路。前端调用点 `apps/web/src/app/(user)/profile/page.tsx:75,286`
   * 归批次4 的 T-15（已在报告里登记下游影响）。
   *
   * I-09 追一句：下面 `.input` 里那颗 `min(4)` 是**冻结形状遗留、不可达**（任何入参都先被上面的
   * `OLD_PASSWORD_REQUIRED` 拒），不是本站的第二处密码门槛 —— 门槛单点仍是 `limits.ts` 的 `PASSWORD_MIN`。
   */
  changePassword: protectedProcedure
    .input(z.object({ password: z.string().min(4).max(72) }))
    .mutation(async ({ ctx, input }) => {
      const auth = ctx.auth;
      if (!auth) {
        // 与 `trpc/routers/auth.ts` 的 `svc()` **同一条字面量**（不新增文案；收进 shared 已记待裁决）
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '凭据服务未装配（app.ts 未注入 auth-service）' });
      }
      try {
        return await auth.changePassword(
          ctx.userId,
          // `oldPassword: ''` = "这条入口结构上不带旧密码" ⇒ service 在 `assertOldPasswordMatches` 处拒
          { oldPassword: '', newPassword: input.password, confirmPassword: input.password },
          { ip: ctx.clientIp },
        );
      } catch (err) {
        return toAuthTrpcError(err);
      }
    }),
});
