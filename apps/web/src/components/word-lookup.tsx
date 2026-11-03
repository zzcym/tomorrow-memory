'use client';

/**
 * 单词详情（ISR 预渲染页的客户端部分）
 * - 静态释义（tRPC lookupStatic）
 * - 加入单词本
 *
 * ⚠ **T-12 未退役本文件的原因**（A-29 第 2 条的"保留 + 移交"路径，已登记进
 * `04-dev-report-T-12.md`）：`page.tsx` 是服务端组件（`generateStaticParams` 200 词 + `revalidate`），
 * 取数与收藏动作必须在客户端边界里，而 `@tm/ui/patterns` 按 §3.5 `ui-no-io` 是**零网络 props 驱动**，
 * 无法承接 `trpc.dictionary.lookupStatic.useQuery` + `wordbook.add.useMutation` 这一层。
 * T-15 在本页做整页重写时按下面两块缺口换成 `WordDetailCard`：
 * ① `WordDetailCard` 无 `translation`（顶层一行中译释义）槽位，且其 `isEmpty` 判定不看 `translation`
 *    → `groups` 为空、只有 `translation` 的词会误落空态（`contracts/lookup.ts:54` `translation` 是必填串）；
 * ② 频率徽章「柯林斯 N」在 `@tm/shared` 无常量（`WORD_DETAIL_SECTION_LABELS` 未收录）。
 * 本文件已去掉全部组件体内中文字面量（A-8/A-23）并改走 `useHost().toast/speak`（§3.11.1）。
 */

import * as React from 'react';
import { BookmarkPlus, Volume2 } from 'lucide-react';
import { ARIA, LOOKUP_COPY, VERBS } from '@tm/shared';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';
import { Button } from '@tm/ui';
import { Badge } from '@tm/ui';
import { Card, CardContent } from '@tm/ui';
import { Skeleton } from '@tm/ui';
import { useHost } from '@tm/ui';

/* ── 宿主注入串（A-8/A-23：组件体内零中文字面量；缺失常量已登记进 T-12 报告的 shared 需求清单） ── */
/** `@tm/shared` 缺"该词已在词本里"的人话常量（`WORDBOOK_COPY` 只有移出侧）。 */
const TM_ALREADY_ADDED = '该单词已在单词本中';
/** §6.4 词详情页频率徽章前缀：shared `WORD_DETAIL_SECTION_LABELS` 未收录柯林斯档位。 */
const collinsBadge = (freq: number): string => `柯林斯 ${freq}`;

export function WordLookup({ word }: { word: string }): React.JSX.Element {
  const authed = useAuthed();
  const host = useHost();
  const utils = trpc.useUtils();
  const lookup = trpc.dictionary.lookupStatic.useQuery({ word, direction: 'en2zh' });
  const addWord = trpc.wordbook.add.useMutation({
    onSuccess: (data) => {
      if (data.added) {
        host.toast(`${LOOKUP_COPY.favoriteToast.body}：${word}`, 'success');
      } else {
        host.toast(TM_ALREADY_ADDED, 'info');
      }
      void utils.wordbook.list.invalidate();
      void utils.review.today.invalidate();
    },
    onError: () => host.toast(LOOKUP_COPY.networkFail, 'error'),
  });

  const result = lookup.data;
  // 类型窄化：中译英结果含 sourceLang 字段
  const zhResult = result && 'sourceLang' in result ? result : null;
  const enResult = result && !('sourceLang' in result) ? result : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="animate-fade-in-up">
        <CardContent className="pt-6">
          {lookup.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : result === null ? (
            <p className="text-muted-foreground">
              {LOOKUP_COPY.notFound.title} · {LOOKUP_COPY.notFound.subtitle}
            </p>
          ) : zhResult ? (
            <div>
              <h2 className="text-2xl font-bold">{zhResult.query}</h2>
              {zhResult.results.map((r, i) => (
                <p key={i} className="mt-1 text-sm">
                  {r.word} [{r.pos}] {r.definition}
                </p>
              ))}
            </div>
          ) : enResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold">{enResult.word}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={ARIA.speak(enResult.word)}
                  onClick={() => host.speak(enResult.word, 'us')}
                >
                  <Volume2 className="h-5 w-5" />
                </Button>
                {enResult.phonetic && <span className="text-muted-foreground">/ {enResult.phonetic} /</span>}
                {'freq' in enResult && enResult.freq > 0 && <Badge variant="outline">{collinsBadge(enResult.freq)}</Badge>}
              </div>
              {enResult.translation && <p className="text-lg text-muted-foreground">{enResult.translation}</p>}
              <div className="space-y-1.5">
                {enResult.groups.map((g, i) => (
                  <p key={i} className="text-sm">
                    {g.pos && <span className="italic text-primary">[{g.pos}] </span>}
                    {g.meanings.join('；')}
                  </p>
                ))}
              </div>
              {enResult.examples.length > 0 && (
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  {enResult.examples.slice(0, 2).map((ex, i) => (
                    <p key={i} className="text-sm">
                      {ex.en}
                      {ex.zh && <span className="ml-1 text-xs text-muted-foreground">{ex.zh}</span>}
                    </p>
                  ))}
                </div>
              )}
              {authed && (
                <Button size="sm" onClick={() => addWord.mutate({ word: enResult.word })}>
                  <BookmarkPlus className="mr-1 h-4 w-4" />
                  {VERBS.addToOneWordbook}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
