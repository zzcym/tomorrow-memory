'use client';

/**
 * 单词本侧边栏
 * - 单词列表 + 搜索
 * - 每个单词显示：单词、释义（来自查词缓存）、上次复习时间
 * - 删除（支持撤销）
 * - 清空全部（带确认）
 * - 同步状态指示（本地/云端）
 */

import * as React from 'react';
import { BookMarked, Cloud, HardDrive, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WordbookEntry } from '@tm/shared';

export function WordbookSidebar(): React.JSX.Element | null {
  const [search, setSearch] = React.useState('');
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [pendingRemove, setPendingRemove] = React.useState<string | null>(null);

  const authed = !!getToken();
  const { data: entries, isLoading } = trpc.wordbook.list.useQuery(undefined, { enabled: authed });
  const utils = trpc.useUtils();
  const add = trpc.wordbook.add.useMutation();
  const remove = trpc.wordbook.remove.useMutation({
    onSuccess: () => {
      if (pendingRemove) {
        toast('已删除，可撤销', {
          action: {
            label: '撤销',
            onClick: () => {
              if (pendingRemove) add.mutate({ word: pendingRemove });
            },
          },
        });
        setPendingRemove(null);
      }
      void utils.wordbook.list.invalidate();
      void utils.review.today.invalidate();
    },
  });
  const clearAll = trpc.wordbook.clear.useMutation({
    onSuccess: () => {
      toast.success('单词本已清空');
      setConfirmClear(false);
      void utils.wordbook.list.invalidate();
      void utils.review.today.invalidate();
    },
  });

  if (!authed) return null;

  const filtered = (entries ?? []).filter((e: WordbookEntry) =>
    e.word.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/30 lg:flex">
      <div className="flex items-center gap-2 p-4">
        <BookMarked className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">单词本（{entries?.length ?? 0}）</span>
        <Badge variant="outline" className="ml-auto gap-1 text-[10px]">
          {navigator.onLine ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
          {navigator.onLine ? '云端' : '本地'}
        </Badge>
      </div>
      <div className="px-4 pb-2">
        <Input
          placeholder="搜索单词…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">加载中…</p>
          ) : filtered.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {entries?.length ? '没有匹配的单词' : '单词本为空，去查词页添加单词吧'}
            </p>
          ) : (
            filtered.map((e: WordbookEntry) => (
              <div
                key={e.word}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.word}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.lastReview ? `上次复习 ${formatTime(e.lastReview)}` : '未复习'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => {
                    setPendingRemove(e.word);
                    remove.mutate({ word: e.word });
                  }}
                  aria-label={`删除 ${e.word}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3">
        <Button variant="outline" size="sm" className="w-full text-xs text-destructive" onClick={() => setConfirmClear(true)}>
          清空全部
        </Button>
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认清空单词本？</DialogTitle>
            <DialogDescription>将删除全部 {entries?.length ?? 0} 个单词及复习记录，此操作不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => clearAll.mutate()}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export { Undo2 };
