/**
 * 个人主页路由（REST 门面）
 *
 * - GET /api/profile  → `services/profile-service.getProfileDto()`（与 tRPC `profile.get` **同一个函数**）
 * - PUT /api/profile  → `services/profile-service.updateProfile()`
 *
 * §4.2 收敛规则：本文件只做"路径声明 + 取数 + 转调 service + 响应组装"，不写判定逻辑。
 *
 * 形状约束（§6.2 红线接口）：`GET /api/profile` 的旧六个键一字不动，本期**只加** DTO 的其余键；
 * `PUT /api/profile` 仍返回 `{ ok: true }`。头像上限与 tRPC 侧统一（R-04①②，见 avatar-service）。
 */

import { Hono } from 'hono';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import type { FeatureFlags } from '../services/feature-flags.js';
import { AvatarError, avatarErrorBody } from '../services/avatar-service.js';
import { ProfileError, getProfileDto, profileErrorBody, updateProfile } from '../services/profile-service.js';

/** 改动前 REST 侧的旧字符上限（`avatarUnifiedLimit=off` 时回退用，R-04 开关语义）。 */
const LEGACY_REST_AVATAR_MAX_CHARS = 200_000;

function failureOf(err: unknown): { status: number; body: Record<string, string> } | null {
  if (err instanceof ProfileError) return profileErrorBody(err);
  if (err instanceof AvatarError) return avatarErrorBody(err);
  return null;
}

export function createProfileRouter(db: AppDB, flags?: FeatureFlags): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.get('/api/profile', auth, async (c) => {
    const userId = c.get('userId');
    return c.json(await getProfileDto(db, userId));
  });

  r.put('/api/profile', auth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = c.get('userId');
    const unified = flags ? await flags.isOn('avatarUnifiedLimit') : true;
    try {
      await updateProfile(db, userId, body, {
        avatarMode: unified ? 'unified' : 'legacy',
        legacyAvatarMaxChars: LEGACY_REST_AVATAR_MAX_CHARS,
        facade: 'rest',
        now: Date.now(),
      });
      return c.json({ ok: true });
    } catch (err) {
      const failure = failureOf(err);
      if (failure) return c.json(failure.body, failure.status as 400);
      throw err;
    }
  });

  return r;
}
