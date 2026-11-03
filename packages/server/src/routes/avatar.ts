/**
 * 头像上传路由（R-04①②⑥，§2 目录树的 `POST /api/avatar` 🆕）
 *
 * - POST /api/avatar   body `{ dataUrl }` → 校验后**直接写 `profiles.avatar`**
 *
 * Q4 定案：本期**不迁对象存储**——不落文件、不生成 URL、不回填历史 base64（PRD R-04⑥ / §3.2-B）。
 * 所以这条新接口与 `PUT /api/profile{avatar}`、tRPC `profile.update{avatar}` 走的是
 * **同一个校验函数 + 同一个落库列**，三个入口不会因为各自抄一份上限而再次跑偏（审计 C-04）。
 *
 * 错误：超限 → `AVATAR_TOO_LARGE`（400，`@tm/shared` 的同一条人话，判据③）。
 *
 * 装配（T-07 的 `app.ts`）：`app.route('/', createAvatarRouter(db, flags))`
 * —— 第二个入参可选，缺省按 `avatarUnifiedLimit=on`（统一上限）处理。
 */

import { Hono } from 'hono';
import { AvatarInputSchema } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { auth, type AuthEnv } from '../middleware/auth.js';
import type { FeatureFlags } from '../services/feature-flags.js';
import { AVATAR_BAD_FORMAT_COPY, AvatarError, avatarErrorBody } from '../services/avatar-service.js';
import { saveAvatar } from '../services/profile-service.js';

/** 改动前 REST 侧的旧字符上限（开关 off 时回退）。 */
const LEGACY_REST_AVATAR_MAX_CHARS = 200_000;

export function createAvatarRouter(db: AppDB, flags?: FeatureFlags): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>();

  r.post('/api/avatar', auth, async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const parsed = AvatarInputSchema.safeParse(raw);
    if (!parsed.success) {
      // 文案唯一出口在 `avatar-service`（此处曾另抄一份逐字相同的字面量 = 第二处真相）
      return c.json({ error: AVATAR_BAD_FORMAT_COPY }, 400);
    }
    const userId = c.get('userId');
    const unified = flags ? await flags.isOn('avatarUnifiedLimit') : true;
    try {
      const saved = await saveAvatar(db, userId, parsed.data.dataUrl, {
        now: Date.now(),
        mode: unified ? 'unified' : 'legacy',
        legacyMaxChars: LEGACY_REST_AVATAR_MAX_CHARS,
      });
      // declaredBytes 只是客户端自报，服务端一律以解码后的真实大小为准（R-04①）
      return c.json({ ok: true, bytes: saved.bytes });
    } catch (err) {
      if (err instanceof AvatarError) {
        const { status, body } = avatarErrorBody(err);
        return c.json(body, status as 400);
      }
      throw err;
    }
  });

  return r;
}
