/**
 * 词详情页「AI 记法」区（T-17；UI §3.4.2 五态、R-09①⑥、R-14③）。
 *
 * 三条硬要求怎么落的：
 *  1. **默认收起**：`expanded` 初值 `false` ⇒ 交给 `WordDetailCard.mnemonicState='collapsed'`
 *     的那一行（`WORD_DETAIL_COPY.mnemonicCollapsedLabel`），界面只有「点击查看」。
 *  2. **展开才请求**：`useQuery` 的 `enabled` 同时要求 `expanded` ⇒ 收起态 0 请求；
 *     查询键是 `lookupKeys.tutor(word)`（`data/queries/lookup.ts` 单点，staleTime 30 分钟），
 *     与背词卡背面同一份缓存 ⇒ 再展开不再发请求（R-14③「复用缓存内容」）。
 *  3. **失败降级 + 重试**：错误态出 `STUDY_COPY.aiMnemonicFail` + 「再试一次」（`WordDetailCard` 的
 *     `failed` 分支内建），**静态释义区不受影响**（本文件只产出 `mnemonicState` 与一个节点，
 *     不碰卡内其他区块）；未登录时不发必然 401 的请求，直接给 `PLAIN_TERMS.continueAfterLogin`
 *     一行，「再试一次」改为去登录页（R-16② 的同类语义）。
 *
 * 分层：请求只经 `data/queries/lookup.ts`（§5.2 / 架构 L584「`apps/app/src/data/` 是唯一发请求的地方」），
 * 本文件只做状态机与内容渲染。
 */

import * as React from 'react';
import {
  PLAIN_TERMS,
  STUDY_COPY,
  WORD_DETAIL_COPY,
  WORD_DETAIL_SECTION_LABELS,
  type TutorContent,
} from '@tm/shared';
import type { MnemonicState } from '@tm/ui';
import { useQuery } from '@tanstack/react-query';
import { tutorQueryOptions } from '../data/queries/lookup.js';
import { hasCredential } from '../data/rest-fetcher.js';
// FU24②：`/login` 的字面量单点在 `lib/auth-store.ts`（`LOGIN_ROUTE`），本文件不再自持第二份。
import { LOGIN_ROUTE } from '../lib/auth-store.js';

/**
 * `/api/tutor` 的实际回带是信封 `{ word, level, content, cached }`（`packages/server/src/routes/tutor.ts:34`），
 * 而 `data/queries/lookup.ts` 的 `parse` 直接对裸 `TutorContentSchema` 收形 ⇒ 目前必然判为
 * `BAD_RESPONSE`。信封在此处**再收一次形**，两种形状都吃：T-14 那行 `parse` 修好后本文件零改动。
 * 已登记进报告「契约偏差 D-1」。
 */
function asTutorContent(value: unknown): TutorContent | null {
  const box =
    value && typeof value === 'object' && 'content' in value
      ? (value as { content: unknown }).content
      : value;
  if (!box || typeof box !== 'object') return null;
  const record = box as Record<string, unknown>;
  const text = (key: string): string => {
    const item = record[key];
    return typeof item === 'string' ? item.trim() : '';
  };
  const scenes: TutorContent['sceneExamples'] = [];
  const raw = record.sceneExamples;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const en = typeof row.en === 'string' ? row.en : '';
      const zh = typeof row.zh === 'string' ? row.zh : '';
      const scene = typeof row.scene === 'string' ? row.scene : '';
      if (en || zh) scenes.push({ en, zh, scene });
    }
  }
  const content: TutorContent = {
    mnemonic: text('mnemonic'),
    wordRoot: text('wordRoot'),
    sceneExamples: scenes,
    confusable: text('confusable'),
  };
  if (!content.mnemonic && !content.wordRoot && scenes.length === 0 && !content.confusable) {
    return null;
  }
  return content;
}

export interface MnemonicBar {
  /** 直接喂给 `WordDetailCard.mnemonicState`。 */
  state: MnemonicState;
  /** `mnemonicState === 'content'` 时卡内渲染的节点。 */
  content: React.ReactNode;
  /** 收起一行的整串（§3.4.2 定稿）。 */
  collapsedLabel: string;
  /** 展开态的小标题（`AI 记法`，与 `<section aria-label>` 同源）。 */
  label: string;
  /** 失败态的那一行（未登录时换成 `登录后可以继续`，仍是「一行文案 + 动作」）。 */
  failLabel: string;
  onToggle: () => void;
  onRetry: () => void;
}

/**
 * @param word 详情页当前词头（为空时整块不显示）。
 * @param onRetryNavigate 未登录时「再试一次」的去向（默认 `#/login`）。
 */
export function useMnemonicBar(word: string, onRetryNavigate?: () => void): MnemonicBar {
  const value = word.trim();
  const [expanded, setExpanded] = React.useState(false);
  const signedIn = hasCredential();

  React.useEffect(() => {
    setExpanded(false);
  }, [value]);

  const query = useQuery({
    ...tutorQueryOptions(value),
    enabled: value.length > 0 && expanded && signedIn,
    retry: 0,
  });

  const content = asTutorContent(query.data);
  /** 缓存里已有一次空结果（`data === null`）⇒ 收起态也不出现这一块（R-14③）。 */
  const knownEmpty = query.isSuccess && content === null;

  let state: MnemonicState = 'collapsed';
  if (value.length === 0 || knownEmpty) state = 'absent';
  else if (expanded) {
    if (!signedIn || query.isError) state = 'failed';
    else if (query.isPending) state = 'loading';
    else state = content ? 'content' : 'absent';
  }

  const navigateToLogin = React.useCallback(() => {
    if (onRetryNavigate) onRetryNavigate();
    else if (typeof window !== 'undefined') window.location.hash = `#${LOGIN_ROUTE}`;
  }, [onRetryNavigate]);

  const onToggle = React.useCallback((): void => setExpanded(true), []);
  const onRetry = React.useCallback((): void => {
    setExpanded(true);
    if (!signedIn) {
      navigateToLogin();
      return;
    }
    void query.refetch();
  }, [navigateToLogin, query, signedIn]);

  return {
    state,
    content: content ? <AiMnemonicContent content={content} /> : null,
    collapsedLabel: WORD_DETAIL_COPY.mnemonicCollapsed,
    label: WORD_DETAIL_SECTION_LABELS.mnemonic,
    failLabel: signedIn ? STUDY_COPY.aiMnemonicFail : PLAIN_TERMS.continueAfterLogin,
    onToggle,
    onRetry,
  };
}

/**
 * 展开态内容：口诀 / 词根 / 场景例句 / 易混，四类按 `TutorContentSchema` 的字段顺序渲染，
 * 空字段整段不渲染（§3.4.2「无内容 → 整块不显示」的最细粒度版本）。
 * 英文行带 `lang="en"`（§8.1-22 / §7.5：`file://` 下 TalkBack 靠它切英文引擎）。
 */
export function AiMnemonicContent({
  content,
}: {
  content: TutorContent;
}): React.JSX.Element {
  const scenes = content.sceneExamples ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="ai-mnemonic-content">
      {content.mnemonic ? (
        <p className="text-sm leading-relaxed text-ink" data-testid="ai-mnemonic-line">
          {content.mnemonic}
        </p>
      ) : null}
      {content.wordRoot ? (
        <p className="text-sm leading-relaxed text-ink" data-testid="ai-mnemonic-root">
          {content.wordRoot}
        </p>
      ) : null}
      {scenes.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {scenes.map((row, index) => (
            <li key={`scene-${String(index)}`}>
              <p lang="en" className="font-latin text-sm leading-relaxed text-ink">
                {row.en}
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">{row.zh}</p>
              {row.scene ? (
                <p className="text-xs leading-relaxed text-ink-muted">{row.scene}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {content.confusable ? (
        <p className="text-sm leading-relaxed text-ink-muted">{content.confusable}</p>
      ) : null}
    </div>
  );
}
