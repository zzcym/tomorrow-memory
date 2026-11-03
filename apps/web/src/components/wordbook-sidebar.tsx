'use client';

/**
 * 单词本侧栏（§3.6.6 瘦身版：187 → 本文件）。
 *
 * 三处红线一起改：
 * ① 行渲染不再自造，换成 `@tm/ui/patterns/WordbookList` 的 `variant="sidebar"`（去行 3 元信息、行高 ≥52px），
 *    释义走同一份 `glossFallback`，不再出现空行（§3.6.2）；
 * ② 原「云端 / 本地」同步徽章整块删除 —— `navigator.onLine` 派生的连接态徽章属 R-25 内部术语，
 *    Web 端本期不做离线（判据⑦ / §8.2-9），`Cloud`/`HardDrive` 图标随之消失；
 * ③ 行内文案不再写中文字面量（A-8/A-23），全部取自 `@tm/shared` 与 `HOST_WORDBOOK_COPY`。
 *
 * 「清空全部」整块删除：§3.6 侧栏工具条只有「标题 + 收起」，破坏性动作只留在 `/wordbook` 页的
 * 批量选择里（T-18 双端同源件），侧栏不承担。
 *
 * 断点：`hidden xl:flex` = §3.6.8 的 ≥1280px 才存在侧栏，<1280px **DOM 里不渲染**（`display:none`
 * 的那份由 Tailwind 的 `hidden` 负责，配合 `user-shell` 的 `authed && !collapsed` 双重门）。
 *
 * props 保持 `{ onCollapse?, onMove? }` 全可选：`components/user-shell.tsx`（T-12 所有，本任务零 diff）
 * 就是按这两个可选回调调用的，签名不动它。
 */

import * as React from 'react';
import { ArrowLeftRight, BookMarked, PanelLeftClose } from 'lucide-react';
import { ARIA, WORDBOOK_COPY } from '@tm/shared';
import { WordbookList } from '@tm/ui';
import { useHost } from '@tm/ui';
import { HOST_WORDBOOK_COPY, useWordbookData, useWordbookDeletion } from '@/lib/api/wordbook';
import { wordHref } from '@/lib/api/review';

const ICON_BUTTON =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted ' +
  'transition-colors duration-micro hover:bg-brand-soft hover:text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

export function WordbookSidebar({
  onCollapse,
  onMove,
}: {
  onCollapse?: () => void;
  onMove?: () => void;
}): React.JSX.Element | null {
  const host = useHost();
  const { signedIn, rows, pending } = useWordbookData({ q: '', filter: 'all', sort: 'recent' });
  const { removeRow } = useWordbookDeletion(host.toast);

  if (!signedIn) return null;

  return (
    <aside
      aria-label={HOST_WORDBOOK_COPY.pageHeading}
      data-testid="wordbook-sidebar"
      className="hidden w-80 shrink-0 flex-col border-r border-hair bg-surface xl:flex"
    >
      <div className="flex min-h-tap items-center gap-2 px-4">
        <BookMarked aria-hidden="true" className="h-4 w-4 text-brand" />
        <span className="text-sm font-medium text-ink">
          {HOST_WORDBOOK_COPY.pageHeading}
          <span className="ml-1 tnum text-ink-muted">{rows.length}</span>
        </span>
        {onMove ? (
          <button
            type="button"
            aria-label={HOST_WORDBOOK_COPY.openPage}
            className={`${ICON_BUTTON} ml-auto`}
            onClick={onMove}
          >
            <ArrowLeftRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onCollapse ? (
          <button
            type="button"
            aria-label={HOST_WORDBOOK_COPY.collapseSidebar}
            className={`${ICON_BUTTON} ${onMove ? '' : 'ml-auto'}`}
            onClick={onCollapse}
          >
            <PanelLeftClose aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <WordbookList
        variant="sidebar"
        items={rows}
        loading={pending}
        hrefFor={wordHref}
        onDelete={(row) => removeRow(row.word)}
        rowAriaLabel={ARIA.wordbookRow}
        speakLabel={ARIA.speak}
        onSpeak={(word) => host.speak(word, 'us')}
        deleteAriaLabel={ARIA.removeFromWordbook}
        glossFallback={WORDBOOK_COPY.noGloss}
        testid="wordbook-sidebar-list"
      />
    </aside>
  );
}
