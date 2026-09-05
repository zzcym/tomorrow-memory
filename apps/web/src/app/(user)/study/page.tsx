'use client';

/**
 * 背单词页面（Flashcard）
 * - 三种模式：顺序 / 随机 / 间隔（FSRS 调度）
 * - 手势滑动 + 键盘快捷键（空格翻转、← → 切换）
 * - 顶部进度条：今日已复习 / 待复习总数
 * - 完成每日目标后触发打卡弹窗
 */

import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Shuffle, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuthed } from '@/lib/use-auth';
import { Flashcard, type FlashcardData } from '@/components/flashcard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LookupEn2ZhFallback, LookupEn2ZhSuccess } from '@tm/shared';

type Mode = 'ordered' | 'random' | 'fsrs';

const MODES: Array<{ value: Mode; label: string; icon: typeof Shuffle }> = [
  { value: 'ordered', label: '顺序', icon: ArrowRight },
  { value: 'random', label: '随机', icon: Shuffle },
  { value: 'fsrs', label: '间隔', icon: RotateCcw },
];

interface StudyCard extends FlashcardData {
  loading?: boolean;
}

export default function StudyPage(): React.JSX.Element {
  const [mode, setMode] = React.useState<Mode>('fsrs');
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<string[]>([]);
  const [checkinOpen, setCheckinOpen] = React.useState(false);
  const [words, setWords] = React.useState<StudyCard[]>([]);

  const authed = useAuthed();
  const utils = trpc.useUtils();
  // refetchOnWindowFocus 关闭：后台重取返回新数组引用会重建牌组、丢失学习进度
  const wordbook = trpc.wordbook.list.useQuery(undefined, {
    enabled: authed,
    refetchOnWindowFocus: false,
  });
  const reviewToday = trpc.review.today.useQuery(undefined, {
    enabled: authed && mode === 'fsrs',
    refetchOnWindowFocus: false,
  });
  const checkinStatus = trpc.checkin.status.useQuery(undefined, { enabled: authed });
  const checkin = trpc.checkin.create.useMutation({
    onSuccess: (data) => {
      toast.success(`打卡成功！连续 ${data.streak} 天`);
      void utils.checkin.status.invalidate();
    },
    onError: () => toast.error('打卡失败，请稍后重试'),
  });
  const reviewCard = trpc.review.reviewCard.useMutation({
    // 评分丢失会让 FSRS 记忆状态与用户认知脱节，必须显式提示
    onError: () => toast.error('评分提交失败，请稍后重试'),
  });

  const dailyGoal = checkinStatus.data?.dailyGoal ?? 10;

  // 根据模式构建单词序列（依赖真实数据变化；refetch 已关，不会被窗口聚焦打断）
  React.useEffect(() => {
    if (!authed) return;
    let base: string[];
    if (mode === 'fsrs') {
      base = (reviewToday.data?.queue ?? []).map((q) => q.word);
    } else {
      base = (wordbook.data ?? []).map((e) => e.word);
      if (mode === 'random') base = [...base].sort(() => Math.random() - 0.5);
    }
    setWords(base.map((w) => ({ word: w, loading: true })));
    setIndex(0);
    setFlipped(false);
    setReviewed([]);
  }, [mode, authed, wordbook.data, reviewToday.data]);

  // 逐个加载释义（静态查词）：每次补齐最早的未加载项，加载完成后 words 变化触发下一轮
  const nextLoadingIndex = words.findIndex((w) => w.loading);
  React.useEffect(() => {
    if (nextLoadingIndex < 0) return;
    const target = words[nextLoadingIndex];
    if (!target) return;
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch(`/api/lookup?word=${encodeURIComponent(target.word)}&direction=en2zh`);
        const json = (await resp.json()) as LookupEn2ZhSuccess | LookupEn2ZhFallback | { error?: string };
        if (cancelled) return;
        setWords((prev) =>
          prev.map((w) => {
            if (w.word !== target.word || !w.loading) return w;
            if ('error' in json) return { ...w, loading: false };
            const hit = json as LookupEn2ZhSuccess | LookupEn2ZhFallback;
            return {
              ...w,
              loading: false,
              phonetic: 'phonetic' in hit ? hit.phonetic : undefined,
              groups: 'groups' in hit ? hit.groups : undefined,
              examples: 'examples' in hit ? hit.examples.slice(0, 1) : undefined,
            };
          }),
        );
      } catch {
        if (!cancelled) {
          setWords((prev) =>
            prev.map((w) => (w.word === target.word && w.loading ? { ...w, loading: false } : w)),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [words, nextLoadingIndex]);

  const current = words[index];

  const advanceRef = React.useRef<(rating?: 1 | 2 | 3 | 4) => void>(() => {});
  const advance = (rating?: 1 | 2 | 3 | 4): void => {
    if (!current) return;
    // 记录复习（FSRS 模式）
    if (rating && authed) {
      reviewCard.mutate({ word: current.word, rating });
    }
    setReviewed((prev) => (prev.includes(current.word) ? prev : [...prev, current.word]));
    setFlipped(false);
    if (index + 1 < words.length) {
      setIndex((i) => i + 1);
    } else {
      // 学完一轮
      if (reviewed.length + 1 >= dailyGoal && !checkinStatus.data?.checkedIn) {
        setCheckinOpen(true);
      } else {
        toast.success('本轮学习完成！');
      }
      setIndex(0);
    }
  };
  advanceRef.current = advance;

  const handleSwipe = (dir: 'left' | 'right'): void => {
    if (!current) return;
    // 左滑 = 不会（Again=1），右滑 = 已掌握（Good=3）
    advance(dir === 'left' ? 1 : 3);
  };

  // 键盘快捷键（ref 持有最新回调，避免每次渲染重挂监听）
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowLeft') {
        advanceRef.current(1);
      } else if (e.key === 'ArrowRight') {
        advanceRef.current(3);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!authed) {
    return <p className="py-20 text-center text-muted-foreground">请先登录后开始背单词。</p>;
  }

  const totalCount = mode === 'fsrs' ? (reviewToday.data?.dueToday ?? 0) : (wordbook.data?.length ?? 0);
  const progress = totalCount > 0 ? Math.min(100, (reviewed.length / totalCount) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
      {/* 模式选择 + 进度 */}
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {MODES.map((m) => (
              <Button
                key={m.value}
                size="sm"
                variant={mode === m.value ? 'default' : 'outline'}
                onClick={() => setMode(m.value)}
              >
                <m.icon className="mr-1 h-3.5 w-3.5" />
                {m.label}
              </Button>
            ))}
          </div>
          <Badge variant="secondary">
            已复习 {reviewed.length} / {totalCount}
          </Badge>
        </div>
        <Progress value={progress} />
      </div>

      {/* 卡片 */}
      {current ? (
        <div className="flex w-full flex-col items-center gap-4">
          <Flashcard
            key={current.word}
            data={current}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            onSwipe={handleSwipe}
          />
          {current.loading && <p className="text-xs text-muted-foreground">加载释义中…</p>}
          <div className="flex gap-3">
            <Button variant="destructive" onClick={() => handleSwipe('left')}>
              <X className="mr-1 h-4 w-4" />
              不会
            </Button>
            <Button variant="outline" onClick={() => setFlipped((f) => !f)}>
              翻转
            </Button>
            <Button onClick={() => handleSwipe('right')}>
              <Check className="mr-1 h-4 w-4" />
              已掌握
            </Button>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => { setIndex((i) => Math.max(0, i - 1)); setFlipped(false); }}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              上一张
            </Button>
            <span>{index + 1} / {words.length}</span>
            <Button variant="ghost" size="sm" disabled={index >= words.length - 1} onClick={() => { setIndex((i) => Math.min(words.length - 1, i + 1)); setFlipped(false); }}>
              下一张
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">空格翻转 · ← 不会 · → 已掌握</p>
        </div>
      ) : (
        <p className="py-20 text-center text-muted-foreground">
          {mode === 'fsrs'
            ? '今天没有到期需要复习的单词。可切换「顺序」或「随机」模式学习全部单词'
            : '单词本为空，先去查词页添加单词吧'}
        </p>
      )}

      {/* 每日目标完成 → 打卡弹窗 */}
      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>🎉 今日目标达成！</DialogTitle>
            <DialogDescription>
              已完成 {dailyGoal} 个单词的复习，打个卡记录今天的学习吧！
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCheckinOpen(false)}>
              稍后
            </Button>
            <Button
              onClick={() => {
                checkin.mutate();
                setCheckinOpen(false);
              }}
            >
              立即打卡
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="h-8" />
    </div>
  );
}
