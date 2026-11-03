'use client';

/**
 * 显式收藏（判据⑤ / R-16）。
 *
 * 为什么单独一件：卡面（R-14）、词详情页（R-09①）、词本行（R-15②）三处都要同一颗星标，
 * 而"星标才入库 + 未登录先记待办 + 一次点击可撤销"这三条规则只要有一处写歪就是判据红。
 * 规则收在这里，三处只传 `word`。
 *
 * - **不自动灌入**：本文件没有任何"查中即写词本"的路径（现网那份自动收藏代码随本次重写删除，
 *   开关 `autoFavoriteDefault` 的默认值是 `off`，见 §10.2 T-15 判据⑤）。
 * - **未登录**：`requestLogin({pendingAction:{kind:'favorite',word}})` —— 弹窗由 T-16 的
 *   `login-dialog` 承接，续作点在它的登录成功回调里（R-16②）。
 * - **撤销**：`TOAST_UNDO_MS` 窗口内一次点击回到反状态（R-16③），失败给人话 + 可重试（R-16⑥）。
 */

import * as React from 'react';
import {
  ARIA,
  LOOKUP_COPY,
  TOAST_UNDO_MS,
  VERBS,
} from '@tm/shared';
import { useHost } from '@tm/ui';
import { requestLogin } from '@/lib/auth';
import { useWordbookMembership } from '@/lib/api/wordbook';

export interface FavoriteState {
  signedIn: boolean;
  inBook: boolean;
  busy: boolean;
  /** 点一下：登录态直接翻转成员关系并挂可撤销 toast；游客先把待办记进 `pendingAction`。 */
  toggle: () => void;
  /** 供外部（详情页的 `ConfirmSheet`）确认后再执行的那一支。 */
  commit: (wanted: boolean) => void;
}

export function useFavorite(word: string): FavoriteState {
  const host = useHost();
  const { signedIn, inBook, setWanted } = useWordbookMembership();
  const wanted = inBook(word);
  const [busy, setBusy] = React.useState(false);

  const commit = React.useCallback(
    (next: boolean) => {
      if (!signedIn) {
        requestLogin({ pendingAction: { kind: 'favorite', word }, returnTo: window.location.pathname });
        return;
      }
      setBusy(true);
      setWanted(word, next);
      host.toast(next ? `${LOOKUP_COPY.favoriteToast.body}：${word}` : `${word} · ${LOOKUP_COPY.unfavoriteConfirm.confirm}`, {
        tone: next ? 'success' : 'info',
        durationMs: TOAST_UNDO_MS,
        action: {
          label: LOOKUP_COPY.favoriteToast.action,
          onClick: () => setWanted(word, !next),
        },
      });
      setBusy(false);
    },
    [host, setWanted, signedIn, word],
  );

  return { signedIn, inBook: wanted, busy, toggle: () => commit(!wanted), commit };
}

const BUTTON =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
  'transition-[transform,background-color] duration-tap ease-standard active:scale-95 ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export interface FavoriteButtonProps {
  word: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}

/** 详情页区块 8 的主按钮（一页只有一颗主色实心 = 收藏，§3.4 分区表）。 */
export function FavoriteButton({
  word,
  variant = 'primary',
  className,
}: FavoriteButtonProps): React.JSX.Element {
  const { inBook, toggle } = useFavorite(word);
  const label = inBook ? VERBS.favorited : VERBS.favorite;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inBook}
      aria-label={inBook ? ARIA.unfavorite(word) : ARIA.favorite(word)}
      data-testid="favorite-button"
      className={[
        BUTTON,
        variant === 'primary' ? 'bg-brand text-on-brand hover:bg-brand-strong' : 'border border-hair bg-surface text-ink hover:bg-brand-soft',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span aria-hidden="true">{inBook ? '★' : '☆'}</span>
      {label}
    </button>
  );
}
