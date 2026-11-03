/**
 * App 背词页（`#/study`，tab2）—— T-18a。UI §3.5.1~§3.5.6；PRD R-11①~⑥ / R-12①~⑥ / R-13①②（页面侧）。
 *
 * 本页只接线，不发请求（§5.2「`data/` 是唯一发请求处」）：取队 `data/queries/review.ts`、
 * 补释义 `data/queries/lookup.ts`、成员判定与词本量 `data/queries/wordbook.ts`、待背数与连续天数
 * `components/due-badge-data.tsx`；卡体与四档一律 `@tm/ui/patterns/{Flashcard,RatingBar}`（禁覆写组件）。
 *
 * 五件页面本体负责的事：
 *  1. **`?mode=` 是唯一真源**（§3.5.1 / R-12①）：三档标签取 `MODE_LABELS`、取值域取 `QUEUE_MODES`，
 *     换档 = 换地址 = 本轮重来。词本为空时 `学新词` **可见不可点**（`aria-disabled` + 下方一行
 *     `先去查几个词，再回来学新词`，R-12⑤）。
 *  2. **`new` / `selfTest` 一条评分请求都不发**（R-12②④）：判据面是数据层的 `canRate(mode)`，
 *     本文件在调用它之前还有一道同名守卫 ⇒ R-12④「随机自测走完不改变任何卡的 `due`」在客户端
 *     这一侧可机检为"0 条 `POST /api/review`"（真库快照那一半归 T-09/T-11）。
 *  3. **牌组按轮冻结**：评分/撤销后的重取会换掉 `queue.data` 引用，牌组若跟着换，指针就会串到
 *     别的词上（复习档还会把刚评掉的词从队列里删掉 ⇒ 看起来"跳过了两张"）。所以只在
 *     `mode` 变化或"再背一批"换 `token` 时才采纳新队列。Web 的
 *     `apps/web/src/app/(user)/study/page.tsx:58-61` 那个 effect 依赖里有 `deck.total`，
 *     重取即重置指针，本页刻意不跟（见报告"与 Web 的偏差"）。
 *  4. **失败回滚 + 可点重试**（R-11⑤ / §3.5.4 末行 / §3.5.5 撤销失败行）：评分失败把指针、本轮计数、
 *     撤销窗口一起退回提交前，再 toast + `重试`；`重试` 走的是同一个 `rate()`，因为计数已经回滚，
 *     补发不会双计。撤销失败只 toast + `重试`，指针不动（不停留成"已评分"假象）。
 *  5. **走完最后一张 = 落完成页**（R-13②）：`navigate('/study/done?…')` 带走本轮数字，
 *     本页**不**把指针归 0、**不**再产生任何评分记录（完成页那一侧由
 *     `test/completion-screen.spec.tsx` 用"0 条评分请求"钉住）。
 *
 * 队列出参的 `gloss` 服务端恒为空串（`queue-service.ts:13`：批量释义属 T-11）⇒ 客户端预取补位（I-05）：
 * 队列装配后与指针前进时，对第 i、i+1 张里 `gloss === ''` 的词经 `lookupQueryOptions` 发
 * `GET /api/lookup`（React Query 缓存去重 ⇒ 同词零重发），首次翻面即出释义；
 * 预取没查到才落 `noGloss` + `重试`/`今天先跳过`，`重试` 拿到空串不再静默，给可辨识反馈。
 * 而 `重试`（用户显式动作）先撤该词缓存再取 ⇒ 必发 1 条真请求（I-05 修复回环：空译文不能被 `staleTime` 锁死）。
 * 仍不做服务端批量补拉（R-15⑧，那是 T-11）。跳过不写 FSRS、不计入本轮统计，只落 `host.kv` 台账（R-14④）。
 *
 * Chrome84 红线（§5.1 / `vite.config.ts` 的 `tm-app:dist-guard`）：本文件不用
 * `structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`；
 * 取末位一律 `arr[arr.length - 1]`。
 */

import * as React from 'react';
import {
  ARIA,
  AUTH_COPY,
  LOOKUP_COPY,
  MODE_LABELS,
  NEW_WORD_BATCH_DEFAULT,
  QUEUE_MODES,
  RATING_VALUES,
  STUDY_COPY,
  TOAST_UNDO_MS,
  UNDO_MAX_PER_SESSION,
  VERBS,
  formatReviewInterval,
  ratingLabel,
  type QueueItemDto,
  type QueueMode,
  type RatingValue,
} from '@tm/shared';
import {
  ConfirmSheet,
  EmptyState,
  Flashcard,
  RatingBar,
  SkeletonBlock,
  useHost,
  type UiHost,
} from '@tm/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { checkinKeys } from '../data/queries/checkin.js';
import { lookupQueryOptions } from '../data/queries/lookup.js';
import {
  canRate,
  rateWord,
  reviewKeys,
  reviewQueueQueryOptions,
  undoRating,
} from '../data/queries/review.js';
import { wordbookQueryOptions } from '../data/queries/wordbook.js';
import { hasCredential, isApiError } from '../data/rest-fetcher.js';
import {
  detailHref,
  resolveDirection,
  resultGloss,
  useWordbookFavorite,
} from '../components/result-row.js';
import { GoalAskSheet, shouldAskGoal } from '../components/goal-ask-sheet.js';
// FU24②：登录落点引 `lib/auth-store.ts` 的 `LOGIN_ROUTE` 单点（原 `result-row` 的第二份字面量已上收）。
import { LOGIN_ROUTE, REGISTER_ROUTE } from '../lib/auth-store.js';
import { useDueBadge } from '../components/due-badge-data.js';
import { navigate, useLocation } from '../router.js';

/* ═════════════════ 宿主注入串（`@tm/shared` 缺常量 ⇒ A-8 老办法，报告 U-2 清单逐条登记） ═════════════════
 * 每一串都逐字取自 `03-ui-spec.md`（行号注在各串上），shared 里 grep 0 命中 ⇒ 只能宿主给。
 * 补齐后整块删除，页面与组件不动（Web 侧同口径先例：`apps/web/src/lib/api/review.ts:90` 的 `HOST_STUDY_COPY`）。
 */
const APP_STUDY_COPY = {
  /** §3.5.1：segmented 的组名。 */
  modeGroup: '背词模式',
  /** §3.5.2:703：卡正面的小字（仅触屏）。 */
  cardFaceHint: '点一下看释义',
  /** §3.5.5:745：无释义块的第二行。 */
  noGlossHint: '不评分也不影响后面的词，改天再补',
  /** §3.5.3:715：背面行内出口 `查这个词 ›`（`›` 由 `Flashcard` 自己补，不写进串里）。 */
  detailLink: '查这个词',
  /** §3.5.5:739：评分后 5 秒条的左半串。 */
  ratedToast: (label: string): string => `已记下：${label}`,
  /** §3.5.5:740：撤销失败整串。 */
  undoFail: '撤销没成功，进度还是刚才那条 · 再试一次',
  /** §3.5.1:693 / R-12⑤：`学新词` 禁用时的说明行。 */
  wordbookEmptyNew: '先去查几个词，再回来学新词',
  /** §3.5.1:694：三模式说明里唯一有定稿串的那一档。 */
  selfTestNotice: '随机自测不会改动你的复习计划',
  /** §3.5.5 跳过的行内反馈（与 Web `HOST_STUDY_COPY.skipped` 同串）。 */
  skipped: '这个词今天跳过了',
} as const;

/** R-14④「跳过要记日志」的落点：App 无日志通道，`host.kv` 台账是唯一可用面（只做统计，不进 x/y/z/w）。 */
export const SKIPPED_KEY = 'tm.study.skipped';
/** §3.5.1「说明只在该模式第一次进入时显示」的已读台账。 */
export const NOTICE_KEY = 'tm.study.modeNotice';
/** §3.5.6 加载行「≥300ms」才出骨架（与 `LOOKUP_SKELETON_DELAY_MS` 同口径，首帧不闪）。 */
const SKELETON_DELAY_MS = 300;
/** 完成页地址（`router.tsx` 第 53 行的 `/study/done`；路由名与查询键不许动）。 */
export const COMPLETION_PATH = '/study/done';

/* ═════════════════ 纯函数（用例直接吃，不经过渲染） ═════════════════ */

/** `?mode=` 缺省与非法值一律回落 `review`（通知直达与分享链不许白屏）。 */
export function studyModeOf(raw: string | undefined): QueueMode {
  return (QUEUE_MODES as readonly string[]).indexOf(raw ?? '') >= 0
    ? (raw as QueueMode)
    : 'review';
}

/** 三档的可分享地址（App 侧即 `#/study?mode=`）。 */
export function studyHref(mode: QueueMode): string {
  return mode === 'review' ? '/study' : `/study?mode=${mode}`;
}

export interface StudyCard {
  word: string;
  /** 卡背首义；空串 = 服务端没给 ⇒ 由本页预取补位（I-05），查不到才走 `noGloss` 态。 */
  gloss: string;
  /** `false` = 词本里没有这张卡（首学）。 */
  hasCard: boolean;
}

/** 队列条目 → 牌组：按词去重（`new` 档的 `words` 来自词本 ∪ 卡表，同名可能两现）。 */
export function toStudyDeck(queue: readonly QueueItemDto[] | undefined): StudyCard[] {
  const seen = new Set<string>();
  const deck: StudyCard[] = [];
  for (const item of queue ?? []) {
    if (seen.has(item.word)) continue;
    seen.add(item.word);
    deck.push({ word: item.word, gloss: item.gloss, hasCard: item.hasCard });
  }
  return deck;
}

/**
 * `due` 是 ISO 串（`contracts/rating.ts:46`），这里只换算成 `formatReviewInterval` 要的分钟。
 * 解析不出来 ⇒ `null` ⇒ 该档不显示间隔，**绝不编一个数**（§8.2-12「渲染结果不得出现 NaN」同口径）。
 */
export function minutesUntil(due: string, from: number): number | null {
  const at = Date.parse(due);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((at - from) / 60_000));
}

/** 学新词单批量（R-12②「单次取数量 ≤ 每日目标」，服务端还会再夹一次）。 */
export function newBatchSize(dailyGoal: number): number {
  if (!(dailyGoal > 0)) return NEW_WORD_BATCH_DEFAULT;
  return Math.min(NEW_WORD_BATCH_DEFAULT, dailyGoal);
}

export interface RoundSummary {
  mode: QueueMode;
  cards: number;
  counts: Partial<Record<RatingValue, number>>;
  seconds: number;
}

/**
 * 本轮结果 → 完成页地址（`r{档}` 的键由 `RATING_VALUES` 派生，不写 `[1,2,3,4]` 字面量）。
 * 对端是 `CompletionScreen.parseSummaryQuery()`，`test/study-screen.spec.tsx` 做整串回读断言
 * （两半是同一份契约，换了一边就红）。
 */
export function completionHref(summary: RoundSummary): string {
  const parts: string[] = [`mode=${encodeURIComponent(summary.mode)}`];
  parts.push(`cards=${String(clamped(summary.cards))}`);
  for (const value of RATING_VALUES) {
    parts.push(`r${String(value)}=${String(clamped(summary.counts[value] ?? 0))}`);
  }
  parts.push(`sec=${String(clamped(summary.seconds))}`);
  return `${COMPLETION_PATH}?${parts.join('&')}`;
}

const clamped = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** kv 台账的最小面（就是 `UiHost['kv']`，写成类型别名便于用例注入假 kv）。 */
type KvPair = UiHost['kv'];

const readStringList = (kv: KvPair, key: string): string[] => {
  const raw = kv.get(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
};

/** 读跳过台账（R-14④）：坏值当空，绝不抛。 */
export function readSkipped(kv: KvPair): string[] {
  return readStringList(kv, SKIPPED_KEY);
}

/** 写一条跳过台账：同一个词在同一天只记一次（`trim + lower` 归一，与服务端词键同口径）。 */
export function pushSkipped(kv: KvPair, word: string): void {
  const key = word.trim().toLowerCase();
  if (key === '') return;
  const list = readSkipped(kv);
  if (list.indexOf(key) >= 0) return;
  kv.set(SKIPPED_KEY, JSON.stringify([...list, key]));
}

/** 该模式的说明是否已经显示过（§3.5.1「只在该模式第一次进入时显示」，台账跨轮生效）。 */
export function hasSeenNotice(kv: KvPair, mode: QueueMode): boolean {
  return readStringList(kv, NOTICE_KEY).indexOf(mode) >= 0;
}

export function markNoticeSeen(kv: KvPair, mode: QueueMode): void {
  const list = readStringList(kv, NOTICE_KEY);
  if (list.indexOf(mode) >= 0) return;
  kv.set(NOTICE_KEY, JSON.stringify([...list, mode]));
}

/**
 * 撤销窗口的唯一判定（R-11③④）：
 *  - 只在真实复习档有得撤（R-12②）；
 *  - 必须已经走到那张之后（`index > anchor` = 判据③ 的"队列指针回退 1"有得可退）；
 *  - 还剩次数（次数上限的唯一真相是 `UNDO_MAX_PER_SESSION`）；
 *  - **再走满 `UNDO_MAX_PER_SESSION` 张后消失**（§3.5.5「生命周期：…或再评满 3 张后自动消失」）。
 */
export function undoAvailable(
  mode: QueueMode,
  last: { word: string; anchor: number } | null,
  index: number,
  remaining: number,
): boolean {
  if (last === null || !canRate(mode)) return false;
  if (!(remaining > 0)) return false;
  if (index <= last.anchor) return false;
  return index - last.anchor <= UNDO_MAX_PER_SESSION;
}

/** §3.5.6 离线行：`navigator.onLine` 为假，或队列因网络类错误失败（这两种都该出顶部一条提示）。 */
export function isNetworkFailure(error: unknown): boolean {
  return isApiError(error) && (error.code === 'NETWORK' || error.code === 'TIMEOUT');
}

/** 本轮牌组的身份：`mode` + `token`（`token` 变化 = 用户点了「再背一批」）。 */
interface Round {
  mode: QueueMode;
  token: number;
  cards: StudyCard[];
}

/** 撤销指针：`word` = 可撤销的那张，`anchor` = 评分时所在的牌组下标。 */
interface LastRated {
  word: string;
  anchor: number;
  rating: RatingValue;
}

/* ═════════════════ 页面 ═════════════════ */

export function StudyScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const loc = useLocation();
  const mode = studyModeOf(loc.query.mode);
  const signedIn = hasCredential();

  /* ───────── 取数（全经 data/queries，本页零 fetch） ───────── */

  const queue = useQuery({
    ...reviewQueueQueryOptions(mode),
    enabled: signedIn,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  /** 词本量 = R-12⑤ 的禁用判据；与卡背星标共用 `wordbookKeys.list()`，不多打一次请求。 */
  const wordbook = useQuery({
    ...wordbookQueryOptions(),
    enabled: signedIn,
    retry: 0,
  });
  const wordbookEmpty =
    signedIn &&
    !wordbook.isPending &&
    !wordbook.isError &&
    (wordbook.data?.length ?? 0) === 0;
  /** 队列出参的 `dueToday` 是最热的那个数，交给取数面当唯一源（R-13⑥）。 */
  const badge = useDueBadge(queue.data?.dueToday);

  /* ───────── 牌组冻结（文件头第 3 条）：渲染期内纠正状态，不闪帧 ───────── */

  const [token, setToken] = React.useState(0);
  const [round, setRound] = React.useState<Round | null>(null);
  const needAdopt = round === null || round.mode !== mode || round.token !== token;
  const data = queue.data;
  /**
   * 换档瞬间新档的数据**还没到**（`data === undefined`）⇒ 不能退回旧牌组：
   * 旧 `round` 的 `mode` 与新 `mode` 不等 ⇒ `needAdopt` 恒真 ⇒ 下面那句渲染期 `setRound`
   * 每帧把同一个旧对象塞回去、永不收敛，React 直接抛 "Too many re-renders" 崩屏
   * （真机路径：今日复习背到一半点「学新词」/ 队列空态点「学 10 个新词」）。
   * 此时当"本轮还没开始"看：`view = null` ⇒ 走 §3.5.6 加载行或 `study-idle`（切档器始终在，不是死路）。
   */
  const adopted: Round | null =
    data === undefined ? null : { mode, token, cards: toStudyDeck(data.queue) };
  const view: Round | null = needAdopt ? adopted : round;
  if (needAdopt && adopted !== null) setRound(adopted);
  const cards = view === null ? [] : view.cards;
  const total = cards.length;

  /* ───────── 本轮状态 ───────── */

  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [rated, setRated] = React.useState(0);
  const [counts, setCounts] = React.useState<Partial<Record<RatingValue, number>>>({});
  const [last, setLast] = React.useState<LastRated | null>(null);
  const [undoLeft, setUndoLeft] = React.useState(0);
  const [submitting, setSubmitting] = React.useState<RatingValue | null>(null);
  const [intervals, setIntervals] = React.useState<Partial<Record<RatingValue, string>>>({});
  const [glosses, setGlosses] = React.useState<Record<string, string>>({});
  const [goalAsk, setGoalAsk] = React.useState(false);
  const [notice, setNotice] = React.useState<QueueMode | null>(null);
  const [slow, setSlow] = React.useState(false);

  const startedAt = React.useRef(Date.now());
  const askedRef = React.useRef(false);
  /** 指针与撤销次数的"当下值"：toast 的动作按钮是延迟执行的回调，读闭包里的 state 会拿到旧值。 */
  const indexRef = React.useRef(0);
  indexRef.current = index;
  const undoLeftRef = React.useRef(0);
  undoLeftRef.current = undoLeft;

  /* 换档 / 再背一批 = 本轮重来：指针、计数、撤销窗口与计时一起复位。 */
  const roundKey = view === null ? '' : `${view.mode}#${String(view.token)}`;
  const roundRef = React.useRef('');
  React.useEffect(() => {
    if (roundRef.current === roundKey) return;
    roundRef.current = roundKey;
    setIndex(0);
    setFlipped(false);
    setRated(0);
    setCounts({});
    setLast(null);
    setUndoLeft(0);
    setIntervals({});
    setGoalAsk(false);
    askedRef.current = false;
    startedAt.current = Date.now();
  }, [roundKey]);

  /* §3.5.1：模式说明只在该模式**第一次**进入时出现一行（台账在 `host.kv`，跨轮生效）。 */
  React.useEffect(() => {
    if (mode !== 'selfTest' || hasSeenNotice(host.kv, mode)) {
      setNotice(null);
      return;
    }
    setNotice(mode);
    markNoticeSeen(host.kv, mode);
  }, [host, mode]);

  const loading = signedIn && view === null && queue.isPending;

  /* §3.5.6 加载行：≥300ms 才出骨架。 */
  React.useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const networkIssue = offline || isNetworkFailure(queue.error);

  const card = cards[index];
  const favorite = useWordbookFavorite(card === undefined ? '' : card.word, host);

  const goLookup = React.useCallback((): void => host.navigate('/'), [host]);
  const setMode = React.useCallback(
    (next: QueueMode): void => {
      if (next === mode) return;
      navigate(studyHref(next));
    },
    [mode],
  );

  /* ───────── 本轮结果 → 完成页（R-13①②） ───────── */

  const elapsed = (): number => Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));

  const finish = React.useCallback(
    (summary: Omit<RoundSummary, 'mode'>): void => {
      /* 撤掉本轮的队列缓存：`再背一批` 回来时必须拿到新的一批，而不是刚评过的词。 */
      void queryClient.removeQueries({ queryKey: reviewKeys.queue(mode) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      navigate(
        completionHref({ mode, cards: summary.cards, counts: summary.counts, seconds: summary.seconds }),
      );
    },
    [mode, queryClient],
  );

  /* ───────── 撤销（R-11③④⑤） ───────── */

  const runUndo = React.useCallback(
    (target: LastRated): void => {
      if (!canRate(mode)) return;
      if (indexRef.current <= target.anchor) return;
      if (!(undoLeftRef.current > 0)) return;
      undoRating(target.word)
        .then((result) => {
          undoLeftRef.current = result.remaining;
          setUndoLeft(result.remaining);
          setLast(null);
          setRated((n) => Math.max(0, n - 1));
          setCounts((prev) => ({ ...prev, [target.rating]: Math.max(0, (prev[target.rating] ?? 1) - 1) }));
          setIndex(target.anchor);
          setFlipped(false);
          host.toast(STUDY_COPY.undo.toast(target.anchor + 1), { tone: 'info' });
          void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
          void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
        })
        .catch(() => {
          host.toast(APP_STUDY_COPY.undoFail, {
            tone: 'error',
            action: { label: VERBS.retry, onClick: () => runUndo(target) },
          });
        });
    },
    [host, mode, queryClient],
  );

  const undoTarget = last !== null && undoAvailable(mode, last, index, undoLeft) ? last : null;
  const undoProp =
    undoTarget === null
      ? undefined
      : {
          remaining: undoLeft,
          onUndo: (): void => runUndo(undoTarget),
          label: STUDY_COPY.undo.button,
          ariaLabel: ARIA.undoRating,
        };

  /* ───────── 评分（R-11①② / R-12②④） ───────── */

  const rate = React.useCallback(
    (rating: RatingValue): void => {
      const current = cards[indexRef.current];
      if (current === undefined || submitting !== null) return;
      const word = current.word;
      const anchor = indexRef.current;
      const review = canRate(mode);
      const nextRated = rated + 1;
      const nextCounts: Partial<Record<RatingValue, number>> = {
        ...counts,
        [rating]: (counts[rating] ?? 0) + 1,
      };
      const target: LastRated = { word, anchor, rating };

      setLast(target);
      setRated(nextRated);
      setCounts(nextCounts);
      if (review) setUndoLeft((n) => Math.min(UNDO_MAX_PER_SESSION, n + 1));

      /* 乐观前进（§3.5.4「不锁 UI」）；走到最后一张就落完成页，绝不回到第 1 张（R-13②）。 */
      setFlipped(false);
      if (anchor + 1 < total) setIndex(anchor + 1);
      else finish({ cards: nextRated, counts: nextCounts, seconds: elapsed() });

      if (!review) return;

      setSubmitting(rating);
      rateWord(word, rating, mode)
        .then((result) => {
          const minutes = minutesUntil(result.due, result.reviewedAt);
          if (minutes !== null) {
            setIntervals((prev) => ({ ...prev, [result.rating]: formatReviewInterval(minutes) }));
          }
          void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
          void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
          host.toast(APP_STUDY_COPY.ratedToast(ratingLabel(rating)), {
            tone: 'info',
            durationMs: TOAST_UNDO_MS,
            action: { label: STUDY_COPY.undo.button, onClick: () => runUndo(target) },
          });
        })
        .catch(() => {
          /* 回滚到提交前那一张：指针、本轮计数、档位计数、撤销窗口一起退回 ⇒ `重试` 不会双计。 */
          setIndex(anchor);
          setFlipped(false);
          setRated(rated);
          setCounts(counts);
          setLast(null);
          setUndoLeft((n) => Math.max(0, n - 1));
          host.toast(STUDY_COPY.ratingSaveFail, {
            tone: 'error',
            action: { label: VERBS.retry, onClick: () => rate(rating) },
          });
        })
        .finally(() => setSubmitting(null));
    },
    [cards, counts, finish, host, mode, rated, runUndo, submitting, total, queryClient],
  );

  /* ───────── 无释义：预取补位（I-05）/ 按需查这一个词 / 今天先跳过（R-14④） ───────── */

  /**
   * I-05 预取：队列装配后与指针前进时，对第 i、i+1 张里 `gloss === ''` 的词发
   * `GET /api/lookup`（复用 `lookupQueryOptions`，React Query 缓存 + staleTime 5 分钟去重 ⇒
   * 同词零重发）。窗口 2 张 ⇒ 每前进一张至多多 1 条请求，
   * 整轮上限 = 去重后的词数，实测远低于路由 30/分钟限流（`routes/lookup.ts:16`，阈值不动）。
   * 查到 ⇒ 并入 `glosses`（首次翻面即出释义）；查不到/失败 ⇒ 不动状态，留给既有 `noGloss` + `重试`。
   */
  React.useEffect(() => {
    for (const ahead of [cards[index], cards[index + 1]]) {
      if (ahead === undefined || ahead.gloss !== '') continue;
      const word = ahead.word;
      queryClient
        .fetchQuery(lookupQueryOptions(word, resolveDirection(word)))
        .then((result) => {
          const gloss = resultGloss(result);
          if (gloss === '') return;
          setGlosses((prev) => (prev[word] === gloss ? prev : { ...prev, [word]: gloss }));
        })
        .catch(() => {
          /* 预取失败静默：恢复面是既有 `重试`（那一支有人话反馈）。 */
        });
    }
  }, [cards, index, queryClient]);

  const retryGloss = React.useCallback((): void => {
    const current = cards[indexRef.current];
    if (current === undefined) return;
    const word = current.word;
    const options = lookupQueryOptions(word, resolveDirection(word));
    /* I-05 修复回环：上游超时被服务端吞成"成功但空译文"（`services/youdao.ts:67-69`，F-74 另案）⇒
     * 客户端拿到 success + 空串，这条结果照样进缓存并按 `staleTime`（5 分钟，`queries/lookup.ts:28` 既有口径）
     * 驻留；用户显式点「重试」若直接 `fetchQuery` 会命中新鲜缓存 ⇒ 0 网络、只回 toast，瞬时故障下重试永远无效。
     * 重试是用户动作 ⇒ 先撤该词的缓存项，保证这一次**必发 1 条真请求**。
     * 只此一处：预取路径（上面的 effect）与全局 `QueryClient` 默认 `staleTime` 都不动 ⇒ 预取去重语义不变。 */
    queryClient.removeQueries({ queryKey: options.queryKey });
    queryClient
      .fetchQuery(options)
      .then((result) => {
        const gloss = resultGloss(result);
        if (gloss === '') {
          /* I-05：上游真查不到不再静默 return——卡面保持既有 `noGloss` + `重试` 态，
           * 并给一条可辨识反馈（串取 `STUDY_COPY.noGloss.title`，与网络失败那条区分开）。 */
          host.toast(STUDY_COPY.noGloss.title, {
            tone: 'error',
            action: { label: VERBS.retry, onClick: () => retryGloss() },
          });
          return;
        }
        setGlosses((prev) => ({ ...prev, [word]: gloss }));
      })
      .catch(() => {
        host.toast(STUDY_COPY.fetchFail.subtitle, {
          tone: 'error',
          action: { label: VERBS.retry, onClick: () => retryGloss() },
        });
      });
  }, [cards, host, queryClient]);

  /** 跳过：不发评分请求、不写卡、**不计入本轮张数与档位计数**（R-14④），只记一条台账。 */
  const skipWord = React.useCallback((): void => {
    const current = cards[indexRef.current];
    if (current === undefined) return;
    pushSkipped(host.kv, current.word);
    host.toast(APP_STUDY_COPY.skipped, { tone: 'info' });
    const anchor = indexRef.current;
    setFlipped(false);
    if (anchor + 1 < total) setIndex(anchor + 1);
    else finish({ cards: rated, counts, seconds: elapsed() });
  }, [cards, counts, finish, host, rated, total]);

  /* ───────── 达到每日目标 → 二选一询问（§3.5.5 末段 / §8.3-B-8；本轮至少评过一张才问） ───────── */

  React.useEffect(() => {
    if (!canRate(mode) || rated === 0 || goalAsk) return;
    if (!shouldAskGoal(badge.doneToday, badge.dailyGoal, askedRef.current)) return;
    askedRef.current = true;
    setGoalAsk(true);
  }, [badge.dailyGoal, badge.doneToday, goalAsk, mode, rated]);

  const takeAnotherBatch = React.useCallback((): void => {
    setGoalAsk(false);
    setToken((n) => n + 1);
  }, []);

  const stopForToday = React.useCallback((): void => {
    setGoalAsk(false);
    finish({ cards: rated, counts, seconds: elapsed() });
  }, [counts, finish, rated]);

  /* ───────── 渲染 ───────── */

  /**
   * 缺陷 F-2 的最小修复（R-11① / UI §3.5.4:733「触屏改显示 `点卡片翻面 · 左滑忘记 右滑轻松`」）：
   * `RatingBar` 的两条提示语是**二选一**渲染的（`hintKeyboard ? 键盘串 : hint 触屏串`），
   * 原先两串一起传 ⇒ App 永远只渲染桌面键盘串（`hidden md:inline`），触屏用户两条都看不到，
   * 且违背"触屏不显示键盘提示"。按指针类型只给该给的那一条。
   */
  const touch = coarsePointer();
  const switcher = <QueueSwitch mode={mode} onChange={setMode} newDisabled={wordbookEmpty} />;
  /**
   * 缺陷 F-1 的最小修复（R-12⑤ / UI §3.5.1:693「并在**下方一行**」）：这一行属 segmented，
   * 原先只随卡面状态渲染 ⇒ 队列空 / 加载 / 取队失败三态下「学新词」已被 `aria-disabled` 禁用，
   * 旁边却没有那句解释（半个死路）。提到 `switcher` 之后，四种已登录状态都跟着走。
   */
  const newDisabledHint = wordbookEmpty ? (
    <p
      className="mx-auto w-full max-w-read px-4 pt-2 text-xs text-warning"
      data-testid="study-new-disabled"
    >
      {APP_STUDY_COPY.wordbookEmptyNew}
    </p>
  ) : null;
  const banner = networkIssue ? (
    <p
      className="mx-auto w-full max-w-read px-4 pt-2 text-xs text-ink-muted"
      data-testid="study-offline-banner"
    >
      {STUDY_COPY.offlineStudy}
    </p>
  ) : null;
  const batch = newBatchSize(badge.dailyGoal);

  if (!signedIn) {
    return (
      <Screen testid="study-signed-out">
        {switcher}
        <EmptyState
          size="lg"
          icon={<CheckGlyph tone="muted" />}
          title={AUTH_COPY.wall.title}
          hint={AUTH_COPY.wall.subtitle}
          primary={{
            label: AUTH_COPY.wall.primary,
            onClick: () => navigate(`${LOGIN_ROUTE}?from=study`),
          }}
          link={{
            label: AUTH_COPY.wall.link,
            onClick: () => navigate(`${REGISTER_ROUTE}?from=study`),
          }}
          testid="study-signed-out"
        />
      </Screen>
    );
  }

  if (view === null) {
    if (queue.isError) {
      return (
        <Screen testid="study-fetch-fail">
          {switcher}
          {newDisabledHint}
          {banner}
          <EmptyState
            size="lg"
            icon={<WarnGlyph />}
            title={STUDY_COPY.fetchFail.title}
            hint={STUDY_COPY.fetchFail.subtitle}
            primary={{ label: STUDY_COPY.fetchFail.retry, onClick: () => void queue.refetch() }}
            secondary={{ label: STUDY_COPY.fetchFail.goLookup, onClick: goLookup }}
            testid="study-fetch-fail"
          />
        </Screen>
      );
    }
    if (loading) {
      return (
        <Screen testid="study-loading">
          {switcher}
          {newDisabledHint}
          {banner}
          {slow ? <QueueSkeleton /> : null}
        </Screen>
      );
    }
    return (
      <Screen testid="study-idle">
        {switcher}
        {newDisabledHint}
        {banner}
      </Screen>
    );
  }

  if (card === undefined) {
    return (
      <Screen testid="study-empty">
        {switcher}
        {newDisabledHint}
        {banner}
        <EmptyQueue mode={mode} batch={batch} onStudyNew={() => setMode('new')} onLookup={goLookup} />
      </Screen>
    );
  }

  const gloss = card.gloss === '' ? (glosses[card.word] ?? '') : card.gloss;
  const noGloss = gloss === '';

  return (
    <Screen testid="study-card">
      {switcher}
      {newDisabledHint}
      {notice === 'selfTest' ? (
        <p
          className="mx-auto w-full max-w-read px-4 pt-2 text-xs text-ink-muted"
          data-testid="study-mode-notice"
        >
          {APP_STUDY_COPY.selfTestNotice}
        </p>
      ) : null}
      {banner}

      <section
        aria-live="polite"
        aria-busy={submitting !== null}
        id="study-body"
        className="w-full flex-1 px-4 pt-3"
        data-testid="study-body"
      >
        <div className="mx-auto w-full max-w-read">
          <Flashcard
            word={card.word}
            side={flipped ? 'back' : 'front'}
            onFlip={() => setFlipped((value) => !value)}
            groups={noGloss ? [] : [{ pos: '', meanings: [gloss] }]}
            index={index + 1}
            total={total}
            progressValueText={badge.dailyGoal > 0 ? STUDY_COPY.todayCounter(badge.doneToday, badge.dailyGoal) : undefined}
            progressDone={badge.dailyGoal > 0 ? badge.doneToday : undefined}
            progressTotal={badge.dailyGoal > 0 ? badge.dailyGoal : undefined}
            noGloss={noGloss}
            noGlossHint={APP_STUDY_COPY.noGlossHint}
            onRetryGloss={retryGloss}
            onSkip={skipWord}
            onOpenDetail={() => host.navigate(detailHref(card.word, 'study'))}
            detailLabel={APP_STUDY_COPY.detailLink}
            inWordbook={favorite.signedIn ? favorite.inWordbook : undefined}
            onToggleFavorite={favorite.toggle}
            favoriteLabel={VERBS.favorite}
            favoritedLabel={VERBS.favorited}
            onSpeak={(word) => host.speak(word, 'us')}
            speakLabel={(word) => ARIA.speak(word)}
            ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
            undo={undoProp}
            swipeSubmit
            onSwipeRating={rate}
            hint={touch ? APP_STUDY_COPY.cardFaceHint : undefined}
            testid="study-card"
          />
          <RatingBar
            onSelect={rate}
            intervals={intervals}
            disabled={submitting !== null}
            pending={submitting}
            sticky
            hint={touch ? STUDY_COPY.ratingHintTouch : undefined}
            hintKeyboard={touch ? undefined : STUDY_COPY.ratingHintKeyboard}
            testid="study-rating"
          />
        </div>
      </section>

      <GoalAskSheet
        open={goalAsk}
        onOpenChange={setGoalAsk}
        goal={badge.dailyGoal}
        streak={badge.streak}
        onAgain={takeAnotherBatch}
        onStop={stopForToday}
      />

      <ConfirmSheet
        open={favorite.confirmOpen}
        onOpenChange={favorite.closeConfirm}
        title={LOOKUP_COPY.unfavoriteConfirm.title}
        description={LOOKUP_COPY.unfavoriteConfirm.body(card.word)}
        confirmText={LOOKUP_COPY.unfavoriteConfirm.confirm}
        cancelText={LOOKUP_COPY.unfavoriteConfirm.cancel}
        tone="danger"
        onConfirm={favorite.unfavorite}
        testid="study-unfavorite-confirm"
      />
    </Screen>
  );
}

/* ═════════════════ 页面外框（tab2：壳的 `<main id="main">` 由 `shell/TabBarShell` 给，本页不再放 `<main>`） ═════════════════ */

function Screen({
  children,
  testid,
}: {
  children: React.ReactNode;
  testid: string;
}): React.JSX.Element {
  return (
    <div
      className="flex min-h-dvh w-full flex-col bg-bg text-ink"
      data-testid="study-screen"
      data-state={testid}
    >
      {children}
    </div>
  );
}

/* ═════════════════ 三模式 segmented（§3.5.1 / R-12①⑤ / §3.5.7 的 `role="tablist"`） ═════════════════ */

export interface QueueSwitchProps {
  mode: QueueMode;
  onChange: (mode: QueueMode) => void;
  /** 词本为空 ⇒ `学新词` 可见不可点（R-12⑤）。 */
  newDisabled?: boolean;
  disabled?: boolean;
  testid?: string;
}

export function QueueSwitch({
  mode,
  onChange,
  newDisabled = false,
  disabled = false,
  testid = 'study-modes',
}: QueueSwitchProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={APP_STUDY_COPY.modeGroup}
      className="mx-auto mt-3 flex w-full max-w-read items-center gap-1 rounded-full bg-sunken p-1"
      data-testid={testid}
    >
      {QUEUE_MODES.map((value) => {
        const selected = value === mode;
        const blocked = disabled || (value === 'new' && newDisabled);
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={blocked || undefined}
            aria-controls="study-body"
            data-mode-item={value}
            onClick={() => {
              if (blocked) return;
              onChange(value);
            }}
            className={[
              'inline-flex min-h-tap flex-1 items-center justify-center rounded-full px-2 text-sm',
              'transition-colors duration-micro ease-standard',
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
              selected ? 'bg-surface font-semibold text-ink shadow-elev-1' : 'text-ink-muted',
            ].join(' ')}
          >
            {MODE_LABELS[value]}
          </button>
        );
      })}
    </div>
  );
}

/* ═════════════════ 队列空（§3.5.6 前三行；R-12③⑥ 的"不是死路"） ═════════════════ */

export interface EmptyQueueProps {
  mode: QueueMode;
  /** `学 {batch} 个新词` 的 batch（R-12②：≤ 每日目标）。 */
  batch: number;
  onStudyNew: () => void;
  onLookup: () => void;
}

export function EmptyQueue({ mode, batch, onStudyNew, onLookup }: EmptyQueueProps): React.JSX.Element {
  if (mode === 'review') {
    /* R-12③：两颗按钮都可点（`学 10 个新词` / `去查词`），不出现"队列空空如也"式死路。 */
    return (
      <EmptyState
        size="lg"
        tone="success"
        icon={<CheckGlyph tone="success" />}
        title={STUDY_COPY.emptyQueue.review.title}
        hint={STUDY_COPY.emptyQueue.review.subtitle}
        primary={{ label: STUDY_COPY.emptyQueue.review.primary(batch), onClick: onStudyNew }}
        secondary={{ label: STUDY_COPY.emptyQueue.review.secondary, onClick: onLookup }}
        testid="study-empty-review"
      />
    );
  }
  const copy = mode === 'new' ? STUDY_COPY.emptyQueue.new : STUDY_COPY.emptyQueue.selfTest;
  return (
    <EmptyState
      size="lg"
      icon={<CheckGlyph tone="muted" />}
      title={copy.title}
      hint={copy.subtitle}
      primary={{ label: copy.cta, onClick: onLookup }}
      testid={`study-empty-${mode}`}
    />
  );
}

/** §3.5.6 加载行：卡位骨架 + 评分条骨架，**无文字**。 */
export function QueueSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto mt-4 w-full max-w-read px-4" data-testid="study-skeleton">
      <SkeletonBlock variant="flashcard" testid="study-card-skeleton" />
      <SkeletonBlock variant="rating-bar" className="mt-3" testid="study-rating-skeleton" />
    </div>
  );
}

/* ═════════════════ 小图标（内联 SVG，不引 lucide） ═════════════════ */

function CheckGlyph({ tone }: { tone: 'success' | 'muted' }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-10 w-10 ${tone === 'success' ? 'text-success' : 'text-ink-muted'}`}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5 5.5-5.5" />
    </svg>
  );
}

function WarnGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10 text-warning"
    >
      <path d="M12 4.5 21 19H3l9-14.5Z" />
      <path d="M12 10v4" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

/**
 * 触屏判定（§3.5.2 的正面小字与 §3.5.4 的提示语只属触屏档）。
 * WebView 恒为 `coarse`；`matchMedia` 缺失时按触屏处理（App 是触屏产品，宁可多一行小字不可漏）。
 */
export function coarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  const matchMedia = window.matchMedia;
  if (typeof matchMedia !== 'function') return true;
  try {
    return matchMedia.call(window, '(pointer: coarse)').matches;
  } catch {
    return true;
  }
}

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default StudyScreen;
