'use client';

/**
 * Flashcard 卡片组件
 * - 正面：单词 + 音标 + 发音按钮
 * - 背面：释义 + 例句 + AI 记忆口诀 + 词根拆解
 * - 点击翻转（3D 动画）
 * - 手势滑动：左滑 = 不会（Again），右滑 = 已掌握（Good）
 */

import * as React from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FlashcardData {
  word: string;
  phonetic?: string;
  /** 释义行（词性分组） */
  groups?: Array<{ pos: string; meanings: string[] }>;
  examples?: Array<{ en: string; zh: string }>;
  /** AI 记忆口诀 */
  mnemonic?: string;
  /** 词根拆解 */
  wordRoot?: string;
}

export function Flashcard({
  data,
  flipped,
  onFlip,
  onSwipe,
}: {
  data: FlashcardData;
  flipped: boolean;
  onFlip: () => void;
  /** direction: 'left'（不会）| 'right'（已掌握） */
  onSwipe: (direction: 'left' | 'right') => void;
}): React.JSX.Element {
  const dragStart = React.useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent): void => {
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent): void => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // 判定为滑动手势（水平位移 > 60px 且大于垂直位移）
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipe(dx < 0 ? 'left' : 'right');
      return;
    }
    // 否则视为点击 → 翻转
    onFlip();
  };

  const speak = (): void => {
    try {
      const u = new SpeechSynthesisUtterance(data.word);
      u.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="perspective-1000 w-full max-w-md cursor-pointer select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div
        className={cn(
          'preserve-3d relative h-80 w-full transition-transform duration-500',
          flipped && 'rotate-y-180',
        )}
      >
        {/* 正面 */}
        <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card shadow-lg">
          <h2 className="text-5xl font-bold">{data.word}</h2>
          {data.phonetic && <p className="text-muted-foreground">/ {data.phonetic} /</p>}
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); speak(); }} aria-label="发音">
            <Volume2 className="h-6 w-6" />
          </Button>
          <p className="absolute bottom-4 text-xs text-muted-foreground">点击或滑动卡片</p>
        </div>
        {/* 背面 */}
        <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-center gap-3 overflow-y-auto rounded-2xl border bg-card p-6 shadow-lg">
          {data.groups && data.groups.length > 0 ? (
            data.groups.map((g, i) => (
              <div key={i} className="text-sm">
                {g.pos && <span className="italic text-primary">[{g.pos}] </span>}
                {g.meanings.join('；')}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">（暂无释义）</p>
          )}
          {data.examples && data.examples.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-2 text-sm">
              <p>{data.examples[0]?.en}</p>
              {data.examples[0]?.zh && <p className="text-xs text-muted-foreground">{data.examples[0].zh}</p>}
            </div>
          )}
          {data.mnemonic && (
            <div className="text-sm">
              <span className="font-semibold text-primary">🧠 口诀：</span>
              {data.mnemonic}
            </div>
          )}
          {data.wordRoot && (
            <div className="text-sm">
              <span className="font-semibold text-primary">🔠 词根：</span>
              {data.wordRoot}
            </div>
          )}
          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
            左滑不会 · 右滑已掌握
          </p>
        </div>
      </div>
    </div>
  );
}
