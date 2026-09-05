'use client';

/**
 * 单词详情（ISR 预渲染页的客户端部分）
 * - 静态释义（tRPC lookupStatic）
 * - 加入单词本
 */

import * as React from 'react';
import { BookmarkPlus, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function WordLookup({ word }: { word: string }): React.JSX.Element {
  const authed = useAuthed();
  const utils = trpc.useUtils();
  const lookup = trpc.dictionary.lookupStatic.useQuery({ word, direction: 'en2zh' });
  const addWord = trpc.wordbook.add.useMutation({
    onSuccess: (data) => {
      if (data.added) {
        toast.success(`已加入单词本：${word}`);
      } else {
        toast.info('该单词已在单词本中');
      }
      void utils.wordbook.list.invalidate();
      void utils.review.today.invalidate();
    },
    onError: (err) => toast.error(err.message),
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
            <p className="text-muted-foreground">未找到该词条，请稍后重试或回到首页搜索。</p>
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
                  aria-label="发音"
                  onClick={() => {
                    try {
                      const u = new SpeechSynthesisUtterance(enResult.word);
                      u.lang = 'en-US';
                      window.speechSynthesis.speak(u);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <Volume2 className="h-5 w-5" />
                </Button>
                {enResult.phonetic && <span className="text-muted-foreground">/ {enResult.phonetic} /</span>}
                {'freq' in enResult && enResult.freq > 0 && <Badge variant="outline">柯林斯 {enResult.freq}</Badge>}
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
                  加入单词本
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
