'use client';

/**
 * 背单词页（§10.2 T-15 行 ✏️`app/(user)/study/page.tsx`，283 → 本文件 ≤120 行）。
 *
 * 收口的四处现网缺陷（判据①②⑤）：卡面不再自绘（`components/flashcard.tsx` 已 🗑️，卡体走
 * `study/card-view.tsx` → `@tm/ui/patterns/{Flashcard,RatingBar}`）；三模式 `?mode=` 以地址为唯一
 * 真源、`new|selfTest` 的评分与撤销在 `useReviewSession()` 首行即返回 ⇒ 网络层 0 条 `reviewCard`
 * （判据①）；走完最后一张不再 `setIndex(0)` 回首张而是落**常驻完成页** `SessionSummary`（R-13②）；
 * 达每日目标不再弹打卡 `Dialog`，打卡是完成页里常驻可点的一行（判据②）。
 *
 * 页面只做接线：取数在 `lib/api/*`，四组牌组级状态在 `study/deck-states.tsx`，
 * 文案全部 import 自 `@tm/shared`（页面与组件零中文字面量）。
 */

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { STUDY_COPY, type RatingValue } from '@tm/shared';
import { useHost } from '@tm/ui';
import { AuthGate } from '@/components/auth-gate';
import { CardView } from '@/components/study/card-view';
import { QueueSwitch } from '@/components/study/queue-switch';
import { SessionSummary } from '@/components/study/session-summary';
import { StudyEmptyQueue, StudyFetchFail, StudyLoading, StudyRateFail, StudySignedOut } from '@/components/study/deck-states';
import { useFavorite } from '@/components/favorite-button';
import { HOST_STUDY_COPY, studyHref, studyModeFromParam, useReviewSession, useStudyDeck, wordHref, type LastRated, type StudyMode } from '@/lib/api/review';
import { useCheckin } from '@/lib/api/profile';

export default function StudyPage(): React.JSX.Element {
  // T-28 / R-23②：页面主体套 `<AuthGate>` —— 游客 = 默认 `<LoginWall>`，idle = 骨架，authed = 原内容。
  // 牌组数据层的 `StudySignedOut` 分支留在 `StudyInner` 内（token 在但服务端判未登录的兜底），不重写。
  return (
    <AuthGate>
      {/* Next 15：`useSearchParams()` 要求页面自带 Suspense 边界（`(user)/layout.tsx` 归 T-12，不动它）。 */}
      <React.Suspense fallback={null}><StudyInner /></React.Suspense>
    </AuthGate>
  );
}

function StudyInner(): React.JSX.Element {
  const host = useHost();
  const router = useRouter();
  /** `?mode=` 是唯一真源：换地址 = 换牌组 = 本轮重新开始（可分享、可回退）。 */
  const mode = studyModeFromParam(useSearchParams().get('mode'));
  const deck = useStudyDeck(mode);
  const session = useReviewSession();
  const checkin = useCheckin();
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const [cards, setCards] = React.useState(0);
  const [counts, setCounts] = React.useState<Partial<Record<RatingValue, number>>>({});
  const startedAt = React.useRef(Date.now());
  const card = deck.cards[index];
  const total = deck.cards.length;
  const goal = deck.dailyGoal || checkin.dailyGoal;
  const last = session.lastRated as LastRated | null;
  /** 钩子无条件调用：无卡位时传空串，那一支的星标按钮根本没渲染（判据⑤ 只走这一条路）。 */
  const favorite = useFavorite(card?.word ?? '');
  const goLookup = (): void => host.navigate('/');
  const setMode = (next: StudyMode): void => router.replace(studyHref(next));
  const switcher = <QueueSwitch mode={mode} onChange={setMode} due={deck.dueToday} disabled={deck.pending} />;

  // 换模式 / 换牌组 = 本轮重来：指针、计数、撤销窗口与计时一起复位。
  React.useEffect(() => {
    setIndex(0); setFlipped(false); setClosed(false); setCards(0); setCounts({});
    startedAt.current = Date.now(); session.reset();
  }, [mode, deck.total]);

  const goNext = (): void => {
    setFlipped(false);
    if (index + 1 < total) setIndex(index + 1);
    else setClosed(true);
  };
  const rate = (rating: RatingValue): void => {
    if (!card) return;
    session.rate(mode, card.word, rating, index);
    setCards((n) => n + 1);
    setCounts((prev) => ({ ...prev, [rating]: (prev[rating] ?? 0) + 1 }));
    goNext();
  };
  /** 撤销窗口只在"已走到下一张"后挂出（R-11④）；撤满 `UNDO_MAX_PER_SESSION` 次自然消失。 */
  const undo = last && session.undoLeft > 0 && index > last.anchor ? {
    remaining: session.undoLeft,
    onUndo: () => session.undoLast(mode, last, (i) => {
      setClosed(false);
      setIndex(Math.max(0, i - 1));
      setFlipped(false);
      host.toast(STUDY_COPY.undo.toast(i), { tone: 'info' });
    }),
  } : null;
  /** 失败重发只补发同一档那一次：不推进指针、不重复计数（R-11⑤ 不许停留成"已评分"假象）。 */
  const retryRating = (): void => {
    session.clearRateFailure();
    if (last) session.rate(mode, last.word, last.rating, last.anchor);
  };

  if (!deck.signedIn) return <StudySignedOut />;
  if (deck.failed) return <StudyFetchFail switcher={switcher} onRetry={deck.retry} onLookup={goLookup} />;
  if (deck.pending) return <StudyLoading switcher={switcher} />;
  if (closed) {
    return <SessionSummary cards={cards} counts={counts} seconds={Math.round((Date.now() - startedAt.current) / 1000)}
      goal={goal} doneToday={checkin.doneToday} checkedIn={checkin.checkedIn} streak={checkin.streak}
      checkinPending={checkin.pending} checkinFailed={checkin.failed}
      onAgain={deck.retry} onCheckIn={checkin.checkIn} onHome={goLookup} />;
  }
  if (!card) return <StudyEmptyQueue mode={mode} switcher={switcher} onStudyNew={() => setMode('new')} onLookup={goLookup} />;

  return (
    <div className="mx-auto flex w-full max-w-read flex-col gap-4">
      {switcher}
      <CardView card={card} index={index} total={total} done={checkin.doneToday} goal={goal}
        flipped={flipped} onFlip={() => setFlipped((f) => !f)} onRate={rate} intervals={session.intervals}
        submitting={session.submitting} undo={undo} loading={session.submitting !== null}
        onSkip={() => { host.toast(HOST_STUDY_COPY.skipped, { tone: 'info' }); goNext(); }}
        onRetryGloss={deck.retry} onOpenDetail={() => host.navigate(wordHref(card.word, 'study'))}
        inBook={favorite.inBook} onToggleFavorite={favorite.toggle} />
      {session.rateFailed ? <StudyRateFail onRetry={retryRating} /> : null}
    </div>
  );
}
