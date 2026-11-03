'use client';

/**
 * 发音（R-09 ④ / R-19 ① / UI §3.2 喇叭按钮）。
 * 包内不碰网络、不判断宿主：一律走 `useHost().speak`（架构 §3.1）。
 * `speaking` 只用于按钮的"正在进行"态（UI §1.0 目标感受：品牌色只出现在可交互/进行中的地方）。
 */
import * as React from 'react';
import { useHost } from '../host.js';

export interface UseSpeak {
  speak: (text: string, accent?: 'uk' | 'us') => void;
  speaking: boolean;
  /** 结果条 / 词详情页在同一组件树里可能挂两个喇叭，停止全部。 */
  stop: () => void;
}

/** 发音结束守卫：SpeechSynthesis 无回调时也不要把按钮永久点在"进行中"。 */
const MAX_SPEAK_MS = 6000;

export function useSpeak(): UseSpeak {
  const host = useHost();
  const [speaking, setSpeaking] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = React.useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = null;
    setSpeaking(false);
  }, []);

  React.useEffect(() => clear, [clear]);

  const speak = React.useCallback(
    (text: string, accent?: 'uk' | 'us') => {
      const word = text.trim();
      if (!word) return;
      setSpeaking(true);
      host.speak(word, accent);
      if (timer.current != null) clearTimeout(timer.current);
      timer.current = setTimeout(clear, MAX_SPEAK_MS);
    },
    [clear, host],
  );

  return { speak, speaking, stop: clear };
}
