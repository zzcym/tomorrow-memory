/**
 * 背词域的**传输与视图投影**层（§10.2 T-15 行 🆕`lib/api/review.ts`）。
 *
 * 两条纪律：
 * 1. 传输唯一走 `@/lib/trpc` —— `boundaries` 的 `web-home-transport` 把 `lib/api/**` 与首页
 *    同表扫描，禁 `fetch(` / `XMLHttpRequest` / `localStorage`（与 `--ui-io` 共用词表）。
 *    本文件因此只出现 `trpc.*.useQuery/useMutation`，其余导出全是**纯函数**，可单测。
 * 2. 判据① 的实现点在 `useReviewSession()` 里：`mode = new | selfTest` 两条路径**根本不进入**
 *    `review.reviewCard` / `review.undo` 这两个过程（`rate()` / `undoLast()` 在函数首行即返回），
 *    所以 e2e 能在网络层数到 0 条评分请求 —— 这正是 R-12④「随机自测走完不改变任何卡的
 *    `due`/`state`」的客户端那一半（数据库快照那一半归 T-09/T-11 的用例）。
 *
 * 卡面释义取自 `review.queue` 出参的 `QueueItem.gloss`（`contracts/review-queue.ts:24`
 * 「面板/卡面首义，缺失即空串」）。服务端当前恒给空串（`queue-service.ts:13` 注明批量释义属
 * T-11），故缺失时走 `Flashcard` 的 `noGloss` + 重试/跳过态（R-14④），**不回退成逐词拉取**
 * （R-15⑧ 明禁"每词间隔 2.1 秒逐个补拉"）。
 */

import * as React from 'react';
import {
  NEW_WORD_BATCH_DEFAULT,
  QUEUE_MODES,
  STUDY_COPY,
  UNDO_MAX_PER_SESSION,
  formatReviewInterval,
  formatStreak,
  type QueueMode,
  type QueueItemDto,
  type RatingValue,
} from '@tm/shared';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';

/* ───────── 三模式与 `?mode=` 口径（§3.5.1 / R-12①） ───────── */

/** 三模式的唯一取值源 = `@tm/shared` 的 `QUEUE_MODES`（本文件不再声明第二份）。 */
export const STUDY_MODES = QUEUE_MODES;
export type StudyMode = QueueMode;

export function isStudyMode(raw: string | null | undefined): raw is StudyMode {
  return raw != null && (STUDY_MODES as readonly string[]).includes(raw);
}

/** `?mode=` 缺省与非法值一律回落 `review`（分享链接不许白屏）。 */
export function studyModeFromParam(raw: string | null): StudyMode {
  return isStudyMode(raw) ? raw : 'review';
}

/** 可分享的背词地址（`?mode=` 是三种模式的唯一寻址形式）。 */
export function studyHref(mode: StudyMode): string {
  return mode === 'review' ? '/study' : `/study?mode=${mode}`;
}

/** 学新词单次取数上限（R-12②「单次取数量 ≤ 每日目标」由服务端再夹一次）。 */
export const NEW_BATCH = NEW_WORD_BATCH_DEFAULT;

/* ───────── 详情页 `?from=`（判据③ / R-09③） ─────────
 * 四个来源 = 首页结果条、词本行、背词卡背面、聊天引用；返回目标由这一个表决定，
 * 页面与组件都不各自拼 `?from=`（同一动作全站同名，§6.5 口径）。
 */
export const WORD_FROMS = ['home', 'wordbook', 'study', 'chat'] as const;
export type WordFrom = (typeof WORD_FROMS)[number];

const FROM_TARGET: Record<WordFrom, string> = {
  home: '/',
  wordbook: '/wordbook',
  study: '/study',
  chat: '/chat',
};

export function isWordFrom(raw: string | null | undefined): raw is WordFrom {
  return raw != null && (WORD_FROMS as readonly string[]).includes(raw);
}

/** 词详情地址；`from` 缺省按 `home`（分享链接只带词、不带来源时回首页，不白屏）。 */
export function wordHref(word: string, from: WordFrom = 'home'): string {
  return `/word/${encodeURIComponent(word)}?from=${from}`;
}

/** 「返回」落点：未知/缺失来源一律首页（R-09③ 的四来源穷举）。 */
export function backHrefFor(from: string | null | undefined): string {
  return isWordFrom(from) ? FROM_TARGET[from] : FROM_TARGET.home;
}

/* ───────── 宿主注入串 ─────────
 * `@tm/shared` 的 `STUDY_COPY` 覆盖了卡面与空态，但三段控件的可访问名、进度条读数与
 * 「本轮已背」这几串没有（A-8 老办法：宿主给，报告里进「shared 缺常量」清单 U-2）。
 * 补齐后本块整体删除，组件不动。
 */
export const HOST_STUDY_COPY = {
  modeGroup: '背词模式',
  detailLink: (word: string): string => `查看 ${word} 的完整释义`,
  cardProgress: (done: number, goal: number): string => `今天已背 ${done} / ${goal}`,
  undoRemaining: (left: number): string => `撤销上一条评分，本轮还能撤 ${left} 次`,
  skipped: '这个词今天跳过了',
  keyboardHint: STUDY_COPY.ratingHintKeyboard,
  touchHint: STUDY_COPY.ratingHintTouch,
} as const;

/* ───────── 牌组投影 ───────── */

export interface StudyCardView {
  word: string;
  /** 卡背首义；空串 = 服务端没给（走 `noGloss` 态，不逐词补拉）。 */
  gloss: string;
  /** `false` = 词本里没有这张卡（首学）。 */
  hasCard: boolean;
}

export function toStudyDeck(queue: readonly QueueItemDto[] | undefined): StudyCardView[] {
  const seen = new Set<string>();
  const deck: StudyCardView[] = [];
  for (const item of queue ?? []) {
    if (seen.has(item.word)) continue;
    seen.add(item.word);
    deck.push({ word: item.word, gloss: item.gloss, hasCard: item.hasCard });
  }
  return deck;
}

/* ───────── 取数（`review.queue`） ───────── */

export interface StudyDeck {
  mode: StudyMode;
  cards: StudyCardView[];
  /** 词本总量（`total`）。 */
  total: number;
  /** 今日待背（tab 红点同源，R-18①）。 */
  dueToday: number;
  dailyGoal: number;
  /** 本轮可取的批大小 = 队列实际长度（服务端已按每日目标夹过）。 */
  batch: number;
  signedIn: boolean;
  pending: boolean;
  failed: boolean;
  retry: () => void;
}

export function useStudyDeck(mode: StudyMode): StudyDeck {
  const signedIn = useAuthed();
  const query = trpc.review.queue.useQuery(
    { mode },
    // 后台重取会换掉数组引用 → 重建牌组、丢掉当前指针，所以关掉（现网同名注释）。
    { enabled: signedIn, refetchOnWindowFocus: false },
  );
  const data = query.data;
  return {
    mode,
    cards: toStudyDeck(data?.queue),
    total: data?.total ?? 0,
    dueToday: data?.dueToday ?? 0,
    dailyGoal: data?.dailyGoal ?? 0,
    batch: data?.queue.length ?? 0,
    signedIn,
    pending: signedIn && query.fetchStatus === 'fetching' && (data?.queue.length ?? 0) === 0,
    failed: signedIn && query.isError,
    retry: () => void query.refetch(),
  };
}

/* ───────── 评分 / 撤销（判据① 的守门处） ───────── */

/** 撤销指针：`word` = 可撤销的那张，`anchor` = 评分发生时所在的下标。 */
export interface LastRated {
  word: string;
  anchor: number;
  rating: RatingValue;
}

/**
 * `due` 是 ISO 串（`contracts/rating.ts:46` 注明由 ts-fsrs 序列化决定），
 * 换算成分钟只用于 `formatReviewInterval`；解析失败返回 `null` ⇒ 该档不显示间隔，
 * **绝不编一个数**（§8.2-12 的"渲染结果里不得出现 NaN"同口径）。
 */
function minutesUntil(due: string, from: number): number | null {
  const at = Date.parse(due);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((at - from) / 60_000));
}

export interface ReviewSession {
  /** 四档按钮下的小字：只装**真实回包**给过的档位，其余留空（无预览过程可问）。 */
  intervals: Partial<Record<RatingValue, string>>;
  /** 正在提交的那一档（按钮转灰）。 */
  submitting: RatingValue | null;
  lastRated: LastRated | null;
  undoLeft: number;
  /** 评分 + 前进；`mode !== 'review'` 时只前进、**不发任何请求**。 */
  rate: (mode: StudyMode, word: string, rating: RatingValue, index: number) => void;
  /** 撤销上一条并退回该卡；同样只在 `review` 档生效。 */
  undoLast: (mode: StudyMode, target: LastRated, onUndone: (index: number) => void) => void;
  /** 提交失败的行内提示（R-11⑤：不停留成"已评分"假象）。 */
  rateFailed: boolean;
  clearRateFailure: () => void;
  /** 只在会话内推进/回退的复位（不发请求）。 */
  reset: () => void;
}

export function useReviewSession(): ReviewSession {
  const utils = trpc.useUtils();
  const [intervals, setIntervals] = React.useState<Partial<Record<RatingValue, string>>>({});
  const [submitting, setSubmitting] = React.useState<RatingValue | null>(null);
  const [lastRated, setLastRated] = React.useState<LastRated | null>(null);
  const [undoLeft, setUndoLeft] = React.useState(0);
  const [rateFailed, setRateFailed] = React.useState(false);

  const rate = trpc.review.reviewCard.useMutation({
    onSuccess: (result) => {
      const minutes = minutesUntil(result.due, result.reviewedAt);
      if (minutes !== null) {
        setIntervals((prev) => ({ ...prev, [result.rating]: formatReviewInterval(minutes) }));
      }
      setUndoLeft((prev) => Math.min(UNDO_MAX_PER_SESSION, prev + 1));
    },
    onError: () => setRateFailed(true),
    onSettled: () => setSubmitting(null),
  });

  const undo = trpc.review.undo.useMutation();

  return React.useMemo<ReviewSession>(
    () => ({
      intervals,
      submitting,
      lastRated,
      undoLeft,
      rateFailed,
      clearRateFailure: () => setRateFailed(false),
      reset: () => {
        setLastRated(null);
        setUndoLeft(0);
        setIntervals({});
        setRateFailed(false);
      },
      rate: (mode, word, rating, index) => {
        setLastRated({ word, anchor: index, rating });
        if (mode !== 'review') return;
        setSubmitting(rating);
        setRateFailed(false);
        rate.mutate({ word, rating });
      },
      undoLast: (mode, target, onUndone) => {
        if (mode !== 'review') return;
        undo.mutate(
          { word: target.word },
          {
            onSuccess: (data) => {
              setUndoLeft(data.remaining);
              setLastRated(null);
              onUndone(data.index);
              void utils.review.queue.invalidate();
            },
            onError: () => setRateFailed(true),
          },
        );
      },
    }),
    [intervals, submitting, lastRated, undoLeft, rateFailed, rate, undo, utils],
  );
}

/* ───────── 收藏 ─────────
 * 星标才入库（判据⑤ / R-16①）的读写面在 `@/lib/api/wordbook` 的 `useWordbookMembership()`：
 * 卡面、详情页、词本行三处共用同一个成员判定，本文件不再开第二份。
 */
