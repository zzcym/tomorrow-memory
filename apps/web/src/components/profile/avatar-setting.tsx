'use client';

/**
 * 「我的」B 区 = 账号头（§10.2 T-15 行 🆕`components/profile/avatar-setting.tsx` / UI §3.8.1 B + §3.8.4）。
 *
 * 这一件是 R-04 的正脸，三处现网缺陷一起收：
 * - **删掉「头像图片 URL」输入框与「保存头像」按钮**（§3.8.4 点名缺陷：要求用户提供图片 URL）。
 *   改后头像区**没有任何文本框**。
 * - 上限不再自带一份私有的 1.5MB/512px：走 `compressAvatar()`，边长 `AVATAR_MAX_SIDE_PX`、
 *   体积按**解码后字节**判 `AVATAR_MAX_BYTES`，超限直接给 `SETTINGS_COPY.avatar.tooLarge` 那句人话。
 * - 整颗头像 = 一个按钮（`aria-label=换头像`），20px 相机角标 `aria-hidden` 且**不单独可点**
 *   （避免两个热区）；右键/长按的菜单只有 `换头像` / `移除头像` 两项。
 *
 * 上传成功后 5 秒内三处一致（R-04④）由 `useAvatarUpload` 的会话镜像 + `profile.get` 失效重取负责，
 * 本组件不碰缓存。
 */

import * as React from 'react';
import { Camera } from 'lucide-react';
import { ARIA, IDENTITY_LABELS, SETTINGS_COPY, VERBS } from '@tm/shared';
import { Avatar, AvatarFallback, AvatarImage, useHost } from '@tm/ui';
import { compressAvatar, PROFILE_COPY, useAvatarUpload } from '@/lib/api/profile';

const MENU_ITEM =
  'flex min-h-tap w-full items-center rounded-md px-3 text-sm text-ink ' +
  'hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-focus';

export interface AvatarSettingProps {
  avatar: string;
  nickname: string;
  /** 脱敏手机号（`138****8000`，页面用 `useProfileOverview().phone` 给）。 */
  phone: string;
}

export function AvatarSetting({ avatar, nickname, phone }: AvatarSettingProps): React.JSX.Element {
  const host = useHost();
  const file = React.useRef<HTMLInputElement>(null);
  const [menu, setMenu] = React.useState(false);
  const { upload, remove, busy } = useAvatarUpload((message, tone) => host.toast(message, tone ?? 'info'));
  const initial = (nickname || phone || '?').slice(0, 1).toUpperCase();

  const pick = (): void => {
    setMenu(false);
    file.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    setMenu(false);
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    const outcome = await compressAvatar(chosen);
    if (!outcome.ok || !outcome.dataUrl) {
      host.toast(outcome.message ?? PROFILE_COPY.avatarBadFormat, 'error');
      return;
    }
    upload(outcome.dataUrl);
  };

  return (
    <section
      aria-label={ARIA.profileLink}
      data-testid="profile-account"
      className="flex items-center gap-3 pb-4 pt-4"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label={SETTINGS_COPY.avatar.change}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-busy={busy}
          data-testid="profile-avatar-button"
          className="relative rounded-full focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <Avatar className="h-14 w-14 lg:h-16 lg:w-16">
            <AvatarImage src={avatar || undefined} alt={IDENTITY_LABELS.avatar} />
            <AvatarFallback className="bg-gradient-to-br from-brand-soft to-brand text-on-brand">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-hair bg-surface text-ink-muted"
          >
            <Camera className="h-3 w-3" />
          </span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e)} />

        {menu ? (
          <div
            role="menu"
            aria-label={IDENTITY_LABELS.avatar}
            data-testid="profile-avatar-menu"
            className="absolute left-0 top-full z-pop mt-1 w-40 rounded-lg border border-hair bg-surface p-1 shadow-elev-2"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenu(false);
            }}
          >
            <button type="button" role="menuitem" onClick={pick} className={MENU_ITEM}>
              {SETTINGS_COPY.avatar.change}
            </button>
            {avatar ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  remove();
                }}
                className={MENU_ITEM}
              >
                {VERBS.remove}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-ink">{nickname || phone}</p>
        {nickname && phone ? <p className="text-xs text-ink-muted">{phone}</p> : null}
      </div>
    </section>
  );
}
