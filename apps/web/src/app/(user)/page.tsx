'use client';

/**
 * 首页 = 三态极简（`00-user-review.md` §3.1 / PRD R-07 / UI §3.1.1）。
 *
 * `[data-testid=home-root]` 子树里**只有五样**：搜索框（含聚焦才出现的最近查询）、
 * 「今天还有 N 个词要背」胶囊、查询后的精简结果条、装饰层（`pointer-events:none`）、
 * 以及承载它们的这一列。未查询态可交互元素 = 输入框 + 框内提交 + 胶囊 = **3**（§3.1.1）。
 *
 * 被删掉的四样去了哪里（§8.3-C 要求 DOM 归零）：
 * 方向三按钮 → 结果条底部一颗文字链；常驻历史 chips → 聚焦面板；
 * "输入单词开始查询…"大灰卡 → slogan 承担视觉重心；AI 教学长卡 → 词详情页「AI 记法」（T-15）；
 * 单词本侧栏/浮动胶囊 → `(user)/layout.tsx` 不再挂 `UserShell`，`/wordbook` 进主导航。
 */

import * as React from 'react';
import { ReviewCta } from '@tm/ui';
import { DecorLayer } from '@/components/home/decor-layer';
import { SearchSection } from '@/components/home/search-section';
import { ResultSection } from '@/components/home/result-section';
import { useDueCount, useLookup } from '@/lib/hooks/use-lookup';

/** §3.1.2：C/D/E 同列同宽 = 搜索框 560px（`max-w-read` 比它宽，会让胶囊"斜挂"）。 */
const COLUMN = 'mx-auto flex w-full max-w-[560px] flex-col px-4 md:px-6';

export default function HomePage(): React.JSX.Element {
  const { text, setText, queried, view, busy, failed, run, retry, switchDirection, recent } = useLookup();
  const { due, loading, signedIn } = useDueCount();

  return (
    <div data-testid="home-root" className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <DecorLayer />
      {/* I-01 配套：去掉 `justify-center` —— 「未聚焦居中」改由 `SearchSection` 内可折叠 spacer 承担
          （与 App 同一手法；居中容器会把聚焦上滑的位移吸收一半，收不到 0–22% 档）。 */}
      <div className={`${COLUMN} flex-1 gap-0 pt-10 pb-16`}>
        <SearchSection text={text} onText={setText} onRun={run} busy={busy} recent={recent} hasQuery={queried !== ''} />
        <ReviewCta due={due} href="/study" signedIn={signedIn} loading={loading} className="mt-3" testid="home-review-cta" />
        <ResultSection
          queried={queried}
          view={view}
          busy={busy}
          failed={failed}
          onRetry={retry}
          onSwitchDirection={switchDirection}
        />
      </div>
    </div>
  );
}
