/**
 * 档案与账号（R-04 的数据面）。REST 与 tRPC 的 key 集合由 `ProfileDtoSchema` 钉住（R-04③）；
 * `daily_goal` / `dailyGoal` 的兼容映射在 `@tm/shared`（`profileDtoLegacyAlias`），这里不写第二份。
 */

import { queryOptions } from '@tanstack/react-query';
import {
  AVATAR_MAX_BYTES,
  MeResultSchema,
  OkResultSchema,
  ProfileDtoSchema,
  errorMessage,
  errorHttpStatus,
  type MeResultDto,
  type ProfileDto,
  type ProfileUpdateInputDto,
} from '@tm/shared';
import { ApiError, apiGet, apiPost, apiPut, parseWith } from '../rest-fetcher.js';

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  get: () => [...profileKeys.all, 'get'] as const,
};

export function profileQueryOptions() {
  return queryOptions<ProfileDto>({
    queryKey: profileKeys.get(),
    staleTime: 30 * 1000,
    queryFn: () => apiGet<ProfileDto>('/api/profile', { auth: true }, parseWith(ProfileDtoSchema)),
  });
}

/** 登录态自检（`GET /api/me`，旧 APK 兼容矩阵成员）。 */
export function meQueryOptions(enabled = false) {
  return queryOptions<MeResultDto>({
    queryKey: profileKeys.me(),
    staleTime: 60 * 1000,
    enabled,
    queryFn: () => apiGet<MeResultDto>('/api/me', { auth: true }, parseWith(MeResultSchema)),
  });
}

/**
 * 写资料（`PUT /api/profile`）。
 *
 * ⚠ 2026-11 修：服务端这条路径返回的是 `{ ok: true }`（见 `routes/profile.ts` 的 PUT 分支），
 * 不是 `ProfileDto`。原先这里按 `ProfileDtoSchema` 解析 ⇒ 每次都解析失败、被包成
 * `BAD_RESPONSE`，用户看到的是「服务器刚才没响应，再试一次」——每日目标保存与昵称保存
 * 因此一直是坏的（服务端其实已经写成功了，只是客户端把成功当成了失败）。
 * 读侧要新数据请走 `profileQueryOptions()` 重取，不在这条写路径上回传 DTO。
 */
export function updateProfile(patch: ProfileUpdateInputDto): Promise<{ ok: true }> {
  return apiPut<{ ok: true }>('/api/profile', patch, { auth: true }, parseWith(OkResultSchema));
}

/**
 * 头像上传。上限走 `AVATAR_MAX_BYTES`（R-04①②，两端同一常量），超了**不发请求**，
 * 由调用方显示 `TM_ERRORS.AVATAR_TOO_LARGE.copy`（文案仍是服务端那一份）。
 */
export function uploadAvatar(dataUrl: string, decodedBytes: number) {
  if (decodedBytes > AVATAR_MAX_BYTES) {
    // 本地就拦下，错误码与人话仍取自 @tm/shared（前端不另写一份文案）。
    return Promise.reject(
      new ApiError(
        'AVATAR_TOO_LARGE',
        errorMessage('AVATAR_TOO_LARGE'),
        errorHttpStatus('AVATAR_TOO_LARGE'),
      ),
    );
  }
  return apiPost<{ ok: true }>('/api/avatar', { dataUrl }, { auth: true }, parseWith(OkResultSchema));
}
