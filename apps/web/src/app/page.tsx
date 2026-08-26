'use client';

/**
 * 查词首页
 * - 搜索框 + 方向选择（自动/英译中/中译英）
 * - 静态部分：音标、词性分组释义、例句（毫秒级显示）
 * - AI 部分：记忆口诀/词根/词源/易混淆词（SSE 流式逐字）
 * - 加入单词本（Toast + 撤销）
 * - 搜索历史（localStorage）
 */

import * as React from 'react';
import { BookmarkPlus, History, Search, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { LookupResponse } from '@tm/shared';

const HISTORY_KEY = 'tm_search_history';
const DIRECTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'en2zh', label: '英译中' },
  { value: 'zh2en', label: '中译英' },
] as const;

type Direction = (typeof DIRECTIONS)[number]['value'];

interface LookupChunk {
  type: string;
  word?: string;
  result?: LookupResponse | null;
  text?: string;
  error?: string;
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export default function HomePage(): React.JSX.Element {
  const [word, setWord] = React.useState('');
  const [direction, setDirection] = React.useState<Direction>('auto');
  const [activeWord, setActiveWord] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);
  const [staticResult, setStaticResult] = React.useState<LookupResponse | null>(null);
  const [aiText, setAiText] = React.useState('');
  const [aiDone, setAiDone] = React.useState(false);

  React.useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const authed = !!getToken();
  const utils = trpc.useUtils();
  const addWord = trpc.wordbook.add.useMutation({
    onSuccess: (data) => {
      if (data.added) {
        toast('已加入单词本', {
          action: { label: '撤销', onClick: () => removeWord.mutate({ word: activeWord ?? '' }) },
        });
      } else {
        toast.info('该单词已在单词本中');
      }
      void utils.wordbook.list.invalidate();
      void utils.review.today.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeWord = trpc.wordbook.remove.useMutation();

  const inWordbook = React.useMemo(() => {
    const list = utils.wordbook.list.getData();
    return !!activeWord && (list ?? []).some((e) => e.word === activeWord);
  }, [activeWord, utils.wordbook.list]);

  // SSE 流式查词（tRPC subscription）
  trpc.dictionary.lookup.useSubscription(
    { word: activeWord ?? '', direction },
    {
      enabled: !!activeWord,
      onData: (chunk: LookupChunk) => {
        if (chunk.type === 'static') {
          setStaticResult(chunk.result ?? null);
        } else if (chunk.type === 'ai-start') {
          setAiText('');
          setAiDone(false);
        } else if (chunk.type === 'ai-chunk') {
          setAiText((prev) => prev + (chunk.text ?? ''));
        } else if (chunk.type === 'ai-done') {
          setAiDone(true);
        } else if (chunk.type === 'ai-error') {
          setAiDone(true);
        }
      },
    },
  );

  const search = (w: string): void => {
    const trimmed = w.trim();
    if (!trimmed) return;
    setActiveWord(trimmed);
    setStaticResult(null);
    setAiText('');
    setAiDone(false);
    // 记录历史
    const next = [trimmed, ...loadHistory().filter((h) => h !== trimmed)].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
  };

  const speak = (text: string): void => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* 浏览器不支持则忽略 */
    }
  };

  const isZh2En = staticResult !== null && 'sourceLang' in staticResult && staticResult.sourceLang === 'zh';
  const enHit = staticResult !== null && !('sourceLang' in staticResult);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 搜索区 */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9 text-base"
              placeholder="输入英文单词或中文，如 serendipity / 苹果"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search(word);
              }}
            />
          </div>
          <Button className="h-11" onClick={() => search(word)}>
            查词
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {DIRECTIONS.map((d) => (
            <Button
              key={d.value}
              variant={direction === d.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDirection(d.value)}
            >
              {d.label}
            </Button>
          ))}
          {history.length > 0 && (
            <div className="ml-auto flex items-center gap-1 overflow-hidden">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              {history.map((h) => (
                <button
                  key={h}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setWord(h);
                    search(h);
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!activeWord && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            输入单词开始查询。查词结果毫秒级返回，AI 教学内容流式加载。
          </CardContent>
        </Card>
      )}

      {activeWord && (
        <>
          {/* ===== 静态结果（毫秒级） ===== */}
          <Card className="animate-fade-in-up">
            <CardContent className="pt-6">
              {!staticResult ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : isZh2En ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold">{staticResult.query}</h2>
                    <Badge variant="secondary">中译英</Badge>
                  </div>
                  {staticResult.error && <p className="text-sm text-destructive">{staticResult.error}</p>}
                  <div className="space-y-1">
                    {staticResult.results.map((r, i) => (
                      <div key={i} className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium">{r.word}</span>
                        {r.pos && <span className="text-xs text-muted-foreground">[{r.pos}]</span>}
                        <span className="text-muted-foreground">{r.definition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : enHit ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold">{staticResult.word}</h2>
                    <Button variant="ghost" size="icon" onClick={() => speak(staticResult.word)} aria-label="发音">
                      <Volume2 className="h-5 w-5" />
                    </Button>
                    {staticResult.phonetic && (
                      <span className="text-muted-foreground">/ {staticResult.phonetic} /</span>
                    )}
                    {'freq' in staticResult && staticResult.freq > 0 && (
                      <Badge variant="outline">柯林斯 {staticResult.freq}</Badge>
                    )}
                    {'tag' in staticResult && staticResult.tag && <Badge variant="outline">{staticResult.tag}</Badge>}
                  </div>

                  {staticResult.translation && (
                    <p className="text-lg text-muted-foreground">{staticResult.translation}</p>
                  )}
                  {'definition' in staticResult && staticResult.definition && (
                    <p className="text-sm">{staticResult.definition}</p>
                  )}

                  <div className="space-y-1.5">
                    {staticResult.groups.map((g, i) => (
                      <div key={i} className="flex gap-2 text-sm">
                        {g.pos && <span className="shrink-0 italic text-primary">[{g.pos}]</span>}
                        <span>{g.meanings.join('；')}</span>
                      </div>
                    ))}
                  </div>

                  {staticResult.exchange && Object.keys(staticResult.exchange).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(staticResult.exchange).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-xs">
                          {k}: {String(v)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {staticResult.examples.length > 0 && (
                    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs font-semibold text-muted-foreground">例句</p>
                      {staticResult.examples.slice(0, 3).map((ex, i) => (
                        <div key={i} className="text-sm">
                          <p>{ex.en}</p>
                          {ex.zh && <p className="text-xs text-muted-foreground">{ex.zh}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {'notFound' in staticResult && staticResult.notFound && (
                    <p className="text-sm text-destructive">未找到该词的释义，已尝试在线词典。</p>
                  )}

                  {authed && (
                    <Button
                      size="sm"
                      variant={inWordbook ? 'outline' : 'default'}
                      disabled={inWordbook}
                      onClick={() => addWord.mutate({ word: staticResult.word })}
                    >
                      <BookmarkPlus className="mr-1 h-4 w-4" />
                      {inWordbook ? '已在单词本' : '加入单词本'}
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* ===== AI 内容（流式） ===== */}
          {(aiText || !aiDone) && (
            <Card className="animate-fade-in-up border-primary/30">
              <CardContent className="pt-6">
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-primary">AI 教学</Badge>
                  {!aiDone && <span className="text-xs text-muted-foreground">流式生成中…</span>}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {aiText}
                  {!aiDone && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />}
                </div>
              </CardContent>
            </Card>
          )}
          <Separator />
        </>
      )}
      <div className="h-8" />
    </div>
  );
}
