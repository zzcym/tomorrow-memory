'use client';

/**
 * 背词页的**牌组级**状态（§10.2 T-15 行 ✏️`app/(user)/study/page.tsx` 的拆分件）。
 *
 * 抽出来只为一条硬预算：`study/page.tsx` 283 → ≤120 行，页面留"接线"，
 * 四组非卡面状态（未登录 / 取词失败 / 取词中 / 队列为空）收在这里。
 * 纪律与页面一致：全部文案 import 自 `@tm/shared`，本文件不写一个中文字面量、不发请求。
 *
 * 空队列三档的措辞与动作数不同（`STUDY_COPY.emptyQueue`）：
 * `review` 有主+次两颗按钮、`new`/`selfTest` 只有一颗 cta —— 差异画在这里，页面只传回调。
 */

import * as React from 'react';
import { AUTH_COPY, NEW_WORD_BATCH_DEFAULT, STUDY_COPY, VERBS } from '@tm/shared';
import { EmptyState, SkeletonBlock } from '@tm/ui';
import { requestLogin } from '@/lib/auth';
import { NEW_BATCH, type StudyMode } from '@/lib/api/review';

const SHELL = 'mx-auto flex w-full max-w-read flex-col gap-4';

/** 未登录：整页引导，卡面与四档评分一个节点都不渲染（R-23①）。 */
export function StudySignedOut(): React.JSX.Element {
  return (
    <EmptyState
      size="lg"
      title={AUTH_COPY.wall.title}
      hint={AUTH_COPY.wall.subtitle}
      primary={{ label: AUTH_COPY.wall.primary, onClick: () => requestLogin({ mode: 'sign-in', returnTo: '/study' }) }}
      link={{ label: AUTH_COPY.wall.link, onClick: () => requestLogin({ mode: 'register', returnTo: '/study' }) }}
      testid="study-signed-out"
    />
  );
}

/** 取词中：卡 + 评分条两处同形骨架，禁整页转圈（§3.11.3）。 */
export function StudyLoading({ switcher }: { switcher?: React.ReactNode }): React.JSX.Element {
  return (
    <div className={SHELL} data-testid="study-loading">
      {switcher}
      <SkeletonBlock variant="flashcard" />
      <SkeletonBlock variant="rating-bar" />
    </div>
  );
}

/** 取词失败：主按钮重试、次按钮去查词（R-14③）。 */
export function StudyFetchFail({
  switcher,
  onRetry,
  onLookup,
}: {
  switcher?: React.ReactNode;
  onRetry: () => void;
  onLookup: () => void;
}): React.JSX.Element {
  return (
    <div className={SHELL}>
      {switcher}
      <EmptyState
        size="lg"
        title={STUDY_COPY.fetchFail.title}
        hint={STUDY_COPY.fetchFail.subtitle}
        primary={{ label: STUDY_COPY.fetchFail.retry, onClick: onRetry }}
        secondary={{ label: STUDY_COPY.fetchFail.goLookup, onClick: onLookup }}
        testid="study-fetch-fail"
      />
    </div>
  );
}

export interface StudyEmptyQueueProps {
  mode: StudyMode;
  switcher?: React.ReactNode;
  /** `review` 档的主按钮切到 `?mode=new`（取数量由服务端的每日目标夹）。 */
  onStudyNew: () => void;
  onLookup: () => void;
}

/** 评分提交失败：行内一句人话 + 就地重试（R-11⑤，禁 toast 一闪而过）。 */
export function StudyRateFail({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <p role="alert" data-testid="study-rate-fail" className="text-sm text-danger">
      {STUDY_COPY.ratingSaveFail}
      <button type="button" onClick={onRetry} className="ml-2 underline focus-visible:outline-2 focus-visible:outline-focus">
        {VERBS.retry}
      </button>
    </p>
  );
}

/** 队列空态三档（R-12③ / §3.5.6）：文案与动作数逐档取自 `STUDY_COPY.emptyQueue`。 */
export function StudyEmptyQueue({ mode, switcher, onStudyNew, onLookup }: StudyEmptyQueueProps): React.JSX.Element {
  const copy = STUDY_COPY.emptyQueue[mode];
  const batch = NEW_BATCH || NEW_WORD_BATCH_DEFAULT;
  return (
    <div className={SHELL}>
      {switcher}
      <EmptyState
        size="lg"
        tone={mode === 'review' ? 'success' : 'default'}
        title={copy.title}
        hint={copy.subtitle}
        primary={
          mode === 'review'
            ? { label: (copy as { primary: (n: number) => string }).primary(batch), onClick: onStudyNew }
            : { label: (copy as { cta: string }).cta, onClick: onLookup }
        }
        secondary={
          mode === 'review'
            ? { label: (copy as { secondary: string }).secondary, onClick: onLookup }
            : undefined
        }
        testid={`study-empty-${mode}`}
      />
    </div>
  );
}
