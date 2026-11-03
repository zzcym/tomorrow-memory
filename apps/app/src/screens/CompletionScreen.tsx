/**
 * App 背词完成页（`#/study/done`，二级页）—— T-18a。UI §3.5.6 完成页版式 / §3.5.7 完成页无障碍；
 * PRD R-13①（本轮 N 张 + 四档明细 + 用时 + 打卡入口 + 再背一批/回首页）、R-13②（不自动回到第 1 张、
 * 不产生新评分记录）、R-13⑤（打卡失败可点重试，不静默、不假成功）、R-13⑥（与「我的」页 / tab 红点同源）。
 *
 * 三条页面级承诺：
 *  1. **本页 0 条评分请求**（R-13②）：没有任何 `rateWord` / `POST /api/review` 的调用点，
 *     连"再背一批"也只是换地址。用例在网络层数到 0 条即为判据② 的机检面（走完最后一张不产生新评分记录）。
 *  2. **数字只从地址里读，且读不出来就当 0**（§8.2-12「渲染结果不得出现 NaN」）：
 *     `parseSummaryQuery()` 是唯一入口，缺键/非数字/负数/小数全部收敛成非负整数；
 *     对端 `StudyScreen.completionHref()` 有往返一致断言，两半改一边就红。
 *  3. **打卡区常驻可点**（R-13①③⑤）：不是弹窗、不是一闪的 toast；已打卡时整块仍可点但**不再发请求**
 *     （幂等由服务端保证，客户端不多打），失败时行内 `打卡没成功 · 再试一次` + 可点 `重试`。
 *
 * 分层：本页零 fetch —— 打卡状态与提交走 `data/queries/checkin.ts`，待背数/连续天数走
 * `components/due-badge-data.tsx`（与 tab 红点、我的页同一份取数面，R-13⑥ 由构造保证）。
 * 文案全部 import 自 `@tm/shared`（`STUDY_COPY.summary` / `CHECKIN_COPY` / `RATING_LABELS` / `VERBS`）。
 *
 * Chrome84 红线（§5.1）：本文件不用 `structuredClone` / `Object.hasOwn` / `Array.prototype.at`
 * / `requestIdleCallback`。
 */

import * as React from 'react';
import {
  AUTH_COPY,
  CHECKIN_COPY,
  RATING_LABELS,
  RATING_VALUES,
  STUDY_COPY,
  VERBS,
  formatDuration,
  type QueueMode,
  type RatingValue,
} from '@tm/shared';
import { useHost } from '@tm/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { checkinKeys, checkinStatusQueryOptions, submitCheckin } from '../data/queries/checkin.js';
import { reviewKeys } from '../data/queries/review.js';
import { hasCredential } from '../data/rest-fetcher.js';
// FU24②：登录落点引 `lib/auth-store.ts` 的 `LOGIN_ROUTE` 单点（原 `result-row` 的第二份字面量已上收）。
import { LOGIN_ROUTE } from '../lib/auth-store.js';
import { checkedInOf, useDueBadge } from '../components/due-badge-data.js';
import { navigate, useLocation } from '../router.js';
import { studyHref, studyModeOf, COMPLETION_PATH } from './StudyScreen.js';

/** 四档数字的语义色：按 `RATING_VALUES` 的**数组序**映射（与 `RatingBar` 的档位配色同一顺序）。 */
const COUNT_TONES = ['text-danger', 'text-warning', 'text-brand', 'text-success'] as const;

/* ═════════════════ 本轮结果（地址是唯一入口，R-13①） ═════════════════ */

export interface SummaryView {
  mode: QueueMode;
  cards: number;
  counts: Partial<Record<RatingValue, number>>;
  seconds: number;
}

const nonNegativeInt = (raw: string | undefined): number => {
  if (raw === undefined) return 0;
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
};

/**
 * `#/study/done?mode=&cards=&r1=&r2=&r3=&r4=&sec=` → 视图（`StudyScreen.completionHref()` 的对端）。
 * 写在这里而不是"顺手读 `loc.query`"：完成页不许在渲染期现编数字（编出来的就是假数字），
 * 一切缺失都收敛成 0，且**永不出现 `NaN`**。
 */
export function parseSummaryQuery(query: Record<string, string | undefined>): SummaryView {
  const counts: Partial<Record<RatingValue, number>> = {};
  for (const value of RATING_VALUES) {
    const amount = nonNegativeInt(query[`r${String(value)}`]);
    if (amount > 0) counts[value] = amount;
  }
  return {
    mode: studyModeOf(query.mode),
    cards: nonNegativeInt(query.cards),
    counts,
    seconds: nonNegativeInt(query.sec),
  };
}

/** 明细行的四档（`RATING_VALUES` 循环，不写 `[1,2,3,4]` 字面量；计数为 0 的档也照常列出）。 */
export function summaryRows(
  counts: Partial<Record<RatingValue, number>>,
): Array<{ rating: RatingValue; label: string; amount: number; tone: string }> {
  return RATING_VALUES.map((rating, position) => ({
    rating,
    label: RATING_LABELS[rating],
    amount: counts[rating] ?? 0,
    tone: COUNT_TONES[position % COUNT_TONES.length] ?? '',
  }));
}

/* ═════════════════ 页面 ═════════════════ */

export function CompletionScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const loc = useLocation();
  const summary = React.useMemo(() => parseSummaryQuery(loc.query), [loc.query]);
  const signedIn = hasCredential();

  /* 待背数 / 连续天数：与 tab 红点、我的页共用同一取数面（R-13⑥）。本页不渲染待背数，
   * 但**必须**经它把数字推给 store —— 于是从完成页回 tab 时红点不会闪回旧值。 */
  const badge = useDueBadge();
  const status = useQuery({
    ...checkinStatusQueryOptions(),
    enabled: signedIn,
    retry: 0,
  });
  /** 服务端 REST 的实际键是 `checkedIn`（`data/queries/checkin.ts` 只认 `checkedToday`）⇒ 用 `raw` 兜底。 */
  const checkedIn = signedIn && (checkedInOf(status.data) || badge.checkedIn);

  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const checkIn = React.useCallback((): void => {
    if (!signedIn || checkedIn || pending) return;
    setPending(true);
    setFailed(false);
    submitCheckin()
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: checkinKeys.all });
        void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      })
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  }, [checkedIn, pending, queryClient, signedIn]);

  const goStudy = React.useCallback(
    (): void => navigate(studyHref(summary.mode)),
    [summary.mode],
  );
  const goHome = React.useCallback((): void => host.navigate('/'), [host]);

  return (
    <div
      className="flex min-h-dvh w-full flex-col bg-bg text-ink"
      data-testid="completion-screen"
      data-path={COMPLETION_PATH}
    >
      <div className="mx-auto flex w-full max-w-read flex-1 flex-col items-center gap-4 px-4 pb-safe-bottom pt-8 text-center">
        <h1 className="text-h1 font-bold tracking-tight text-ink max-md:text-h1-xs">
          {STUDY_COPY.summary.round}
        </h1>

        {/* §3.5.6：`12 张` = 唯一允许 34px 的地方（`text-display` 是 32px，无 34px 令牌 ⇒ 用任意值）。 */}
        <p className="text-[34px] font-extrabold leading-[1.15] tracking-[-0.4px] text-ink tnum" data-testid="completion-cards">
          {STUDY_COPY.summary.cards(summary.cards)}
        </p>

        {/* §3.5.7：数字区用 `<dl>`（`dt` 标签 / `dd` 数字），读屏逐项念；间隔号是 `aria-hidden` 装饰。 */}
        <dl
          className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-sm text-ink-muted"
          data-testid="completion-breakdown"
        >
          {summaryRows(summary.counts).map((row, position) => (
            <React.Fragment key={String(row.rating)}>
              {position > 0 ? (
                <span aria-hidden="true" className="text-ink-muted">
                  ·
                </span>
              ) : null}
              <div className="flex items-baseline gap-1">
                <dt className="text-ink-muted">{row.label}</dt>
                <dd className={`tnum font-medium ${row.tone}`}>{String(row.amount)}</dd>
              </div>
            </React.Fragment>
          ))}
        </dl>

        <p className="text-sm text-ink-muted" data-testid="completion-duration">
          {`${STUDY_COPY.summary.durationPrefix} ${formatDuration(summary.seconds)}`}
        </p>

        <CheckinArea
          signedIn={signedIn}
          checkedIn={checkedIn}
          pending={pending}
          failed={failed}
          streak={badge.streak}
          onCheckIn={checkIn}
          onLogin={() => navigate(`${LOGIN_ROUTE}?from=study`)}
        />

        <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={goStudy}
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand transition-[transform,background-color] duration-tap ease-standard hover:bg-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 sm:flex-none sm:px-6"
            data-testid="completion-again"
          >
            {STUDY_COPY.summary.again}
          </button>
          <button
            type="button"
            onClick={goHome}
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-lg border border-hair bg-surface px-4 text-sm text-ink transition-colors duration-tap ease-standard hover:bg-brand-soft hover:text-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 sm:flex-none sm:px-6"
            data-testid="completion-home"
          >
            {STUDY_COPY.summary.home}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════ 打卡区（§3.5.6「常驻可点，非弹窗」/ R-13①③⑤） ═════════════════ */

export interface CheckinAreaProps {
  signedIn: boolean;
  checkedIn: boolean;
  pending: boolean;
  failed: boolean;
  streak: number;
  onCheckIn: () => void;
  onLogin: () => void;
}

export function CheckinArea({
  signedIn,
  checkedIn,
  pending,
  failed,
  streak,
  onCheckIn,
  onLogin,
}: CheckinAreaProps): React.JSX.Element {
  if (!signedIn) {
    return (
      <div
        className="w-full rounded-lg bg-sunken p-4 text-center"
        data-testid="completion-checkin-signed-out"
      >
        <p className="text-sm text-ink-muted">{AUTH_COPY.wall.subtitle}</p>
        <button
          type="button"
          onClick={onLogin}
          className="mt-2 inline-flex min-h-tap items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          {AUTH_COPY.wall.primary}
        </button>
      </div>
    );
  }

  if (checkedIn) {
    return (
      <button
        type="button"
        aria-pressed
        onClick={onCheckIn}
        className="inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-lg bg-success-soft p-4 text-sm font-medium text-success active:scale-[.99] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        data-testid="completion-checkin-done"
      >
        {CHECKIN_COPY.done(streak)}
        <span aria-hidden="true">✓</span>
      </button>
    );
  }

  return (
    <div
      className="flex w-full flex-col items-center gap-2 rounded-lg bg-sunken p-4"
      data-testid="completion-checkin-area"
    >
      <button
        type="button"
        aria-pressed={false}
        disabled={pending}
        onClick={onCheckIn}
        className="inline-flex min-h-tap w-full max-w-list items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand transition-[transform,background-color] duration-tap ease-standard hover:bg-brand-strong active:scale-[.97] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:opacity-60"
        data-testid="completion-checkin"
      >
        {pending ? <Spinner /> : null}
        {/* §3.5.6 / R-13⑤：提交中文字不变（`pendingText` 与 `notDone.cta` 同串），失败后才换串。 */}
        {CHECKIN_COPY.pendingText}
      </button>
      <p className="text-xs text-ink-muted tnum" data-testid="completion-streak">
        {CHECKIN_COPY.notDone.streak(streak)}
      </p>
      {failed ? (
        <p className="flex items-center gap-2 text-xs text-danger" data-testid="completion-checkin-fail">
          {CHECKIN_COPY.fail}
          <button
            type="button"
            onClick={onCheckIn}
            className="inline-flex min-h-tap items-center rounded-md px-2 font-medium text-danger underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            data-testid="completion-checkin-retry"
          >
            {VERBS.retry}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function Spinner(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-brand/40 border-t-on-brand"
      data-testid="completion-checkin-spinner"
    />
  );
}

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default CompletionScreen;
