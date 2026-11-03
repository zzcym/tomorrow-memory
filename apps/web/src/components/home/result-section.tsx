'use client';

/**
 * 首页「精简结果条」（UI §3.1.2 E / §3.2；判据④：词 + 音标 + 喇叭 + 词性首义 ≤2 行 + 星标 + 查看详情）。
 *
 * 本文件是首页唯一的"查询后"渲染分支，三件事在这里落地：
 * ① 完整释义 / 例句 / 词形变化 / AI 记法**全部不渲染** —— 它们属于词详情页（T-15 / `00-user-review.md` §3.1）；
 * ② 「换个查询方向」从三颗常驻按钮降级为结果条底部**一颗文字链**（§3.1.2 E 行3），DOM 里不再有
 *    `[data-testid=home-direction-buttons]`；
 * ③ 星标收藏是**用户主动动作** —— 原首页"查到即自动加词本"的静默写入已删除。
 *
 * 传输仍只有 `@/lib/trpc`（判据⑤：首页无裸 `fetch(`）。
 */

import * as React from 'react';
import { ARIA, LOOKUP_COPY, STUDY_COPY, VERBS } from '@tm/shared';
import {
  ConfirmSheet,
  EmptyState,
  LookupResultBar,
  SkeletonBlock,
  useHost,
  type UiHost,
} from '@tm/ui';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';
import type { HomeLookupView, LookupRowView } from '@/lib/api/lookup-stream';

/** 未登录点星标 → 广播给顶栏（`components/header.tsx`）打开登录弹窗。T-16 复用同一事件名。 */
export const OPEN_LOGIN_EVENT = 'tm-open-login';

/**
 * §3.1.2 E 行3 定稿串（`03-ui-spec.md:590`）。shared `copy.ts` 未收录 → 宿主注入（`LOOKUP_RESULT_BAR`
 * 的 props 表里 `directionLabel` 一栏本来就标"宿主注入"），已作为需求登记给 TPM 补进 §6.4。
 */
const DIRECTION_LINK = '不是这个？换个查询方向';

const detailHref = (word: string): string => `/word/${encodeURIComponent(word)}?from=home`;

/** 喇叭：首页只朗读英文词头（中译英行的 `word` 同样是英文）。 */
const speakRow = (host: UiHost) => (row: LookupRowView | HomeLookupView): ((word: string) => void) => (
  spoken: string
): void => {
  host.speak(spoken || row.word, 'us');
};

export interface ResultSectionProps {
  queried: string;
  view: HomeLookupView;
  busy: boolean;
  failed: boolean;
  onRetry: () => void;
  onSwitchDirection: () => void;
}

export function ResultSection({
  queried,
  view,
  busy,
  failed,
  onRetry,
  onSwitchDirection,
}: ResultSectionProps): React.JSX.Element | null {
  const host = useHost();
  const speak = React.useMemo(() => speakRow(host), [host]);
  const signedIn = useAuthed();
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const invalidate = React.useCallback((): void => {
    void utils.wordbook.list.invalidate();
    void utils.review.today.invalidate();
  }, [utils]);

  const wordbook = trpc.wordbook.list.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
  });

  const removeWord = trpc.wordbook.remove.useMutation({
    onSuccess: () => invalidate(),
    onError: () => host.toast(LOOKUP_COPY.networkFail, 'error'),
  });
  const addWord = trpc.wordbook.add.useMutation({
    onSuccess: (data, variables) => {
      invalidate();
      if (!data.added) return;
      host.toast(LOOKUP_COPY.favoriteToast.body, {
        tone: 'success',
        action: {
          label: LOOKUP_COPY.favoriteToast.action,
          onClick: () => removeWord.mutate({ word: variables.word }),
        },
      });
    },
    onError: () => host.toast(LOOKUP_COPY.networkFail, 'error'),
  });

  const word = view.kind === 'en' || view.kind === 'zh' ? view.word : '';
  const inWordbook = React.useMemo(() => {
    if (!signedIn || word === '') return false;
    const lower = word.toLowerCase();
    return (wordbook.data ?? []).some((entry) => entry.word.toLowerCase() === lower);
  }, [signedIn, word, wordbook.data]);

  const toggleFavorite = (): void => {
    if (!signedIn) {
      window.dispatchEvent(new Event(OPEN_LOGIN_EVENT));
      return;
    }
    if (inWordbook) {
      setConfirmOpen(true);
      return;
    }
    addWord.mutate({ word });
  };

  if (queried === '') return null;

  if (failed) {
    return (
      <div className="mt-3" data-testid="home-result-error">
        <EmptyState
          size="sm"
          title={LOOKUP_COPY.networkFail}
          hint={PLAIN_RETRY_HINT}
          primary={{ label: VERBS.retryInline, onClick: onRetry }}
          testid="home-result-error"
        />
      </div>
    );
  }

  if (view.kind === 'idle') {
    return busy ? (
      <div className="mt-3" data-testid="home-result-skeleton">
        <SkeletonBlock variant="result-bar" testid="home-result-skeleton" />
      </div>
    ) : null;
  }

  if (view.kind === 'empty') {
    return (
      <div className="mt-3" data-testid="home-result-empty">
        <EmptyState
          size="sm"
          title={LOOKUP_COPY.notFound.title}
          hint={LOOKUP_COPY.notFound.subtitle}
          testid="home-result-empty"
        />
        <DirectionLink applied={view.applied} onSwitchDirection={onSwitchDirection} />
      </div>
    );
  }

  if (view.kind === 'zh') {
    return (
      <div className="mt-3" data-testid="home-result">
        <ul className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hair">
          {view.rows.map((row) => (
            <li key={`${row.word}|${row.gloss}`} className="border-b border-hair last:border-b-0">
              <LookupResultBar
                layout="row"
                word={row.word}
                phonetic={row.phonetic}
                gloss={row.gloss}
                detailHref={detailHref(row.word)}
                detailAriaLabel={ARIA.fullMeaning(row.word)}
                onSpeak={speak(row)}
                speakLabel={ARIA.speak}
                speakingLabel={ARIA.speaking}
                ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
                ariaLive="off"
                testid="home-result-row"
              />
            </li>
          ))}
        </ul>
        <DirectionLink applied={view.applied} onSwitchDirection={onSwitchDirection} />
      </div>
    );
  }

  return (
    <div className="mt-3" data-testid="home-result">
      <LookupResultBar
        layout="card"
        word={view.word}
        phonetic={view.phonetic}
        gloss={view.gloss}
        detailHref={detailHref(view.word)}
        detailAriaLabel={ARIA.fullMeaning(view.word)}
        inWordbook={inWordbook}
        onToggleFavorite={toggleFavorite}
        favoriteLabel={ARIA.favorite(view.word)}
        favoritedLabel={ARIA.unfavorite(view.word)}
        onSpeak={speak(view)}
        speakLabel={ARIA.speak}
        speakingLabel={ARIA.speaking}
        ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
        partial={view.partial}
        partialHint={LOOKUP_COPY.partialNoGloss}
        onDirectionChange={onSwitchDirection}
        directionLabel={DIRECTION_LINK}
        directionAriaLabel={view.applied === 'zh2en' ? ARIA.directionEn2Zh : ARIA.directionZh2En}
        testid="home-result-bar"
      />

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={LOOKUP_COPY.unfavoriteConfirm.title}
        description={LOOKUP_COPY.unfavoriteConfirm.body(word)}
        confirmText={LOOKUP_COPY.unfavoriteConfirm.confirm}
        cancelText={LOOKUP_COPY.unfavoriteConfirm.cancel}
        tone="danger"
        onConfirm={() => {
          removeWord.mutate({ word });
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}

/* ───────────────────────── 内部小件 ───────────────────────── */

/** 失败态的辅助行：`@tm/shared` 无"检查网络"人话常量，用 `PLAIN_TERMS` 已有的两条拼不出来 → 先取 `notFound.subtitle`。 */
const PLAIN_RETRY_HINT = LOOKUP_COPY.notFound.subtitle;

function DirectionLink({
  applied,
  onSwitchDirection,
}: {
  applied: HomeLookupView['applied'];
  onSwitchDirection: () => void;
}): React.JSX.Element {
  return (
    <p className="mt-2 text-center">
      <button
        type="button"
        onClick={onSwitchDirection}
        aria-label={applied === 'zh2en' ? ARIA.directionEn2Zh : ARIA.directionZh2En}
        className="text-xs text-ink-muted underline decoration-hair underline-offset-2 hover:text-brand"
      >
        {DIRECTION_LINK}
      </button>
    </p>
  );
}
