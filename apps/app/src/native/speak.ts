/**
 * App 侧发音（架构 §5.4②）：WebView 不保证有 TTS，所以走 `<audio>`（`LookupResult.audio` 的 URL），
 * 只有拿不到音频 URL 时才退回 `speechSynthesis`（部分 ROM 有）。
 *
 * `UiHost.speak(text, accent)` 的签名是两端共用的，因此约定：**传入绝对 URL 即播音频，
 * 传入单词即尝试 TTS**。给 T-05 的需求见报告（`patterns` 的喇叭按钮需要能把 audio URL 传进来）。
 */

let player: HTMLAudioElement | null = null;

const ABSOLUTE_URL = /^(https?:|blob:|data:|file:)/i;

export function isAudioSource(value: string): boolean {
  return ABSOLUTE_URL.test(value.trim());
}

export function playAudio(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  try {
    if (!player) {
      player = new Audio();
      player.preload = 'none';
    }
    player.pause();
    player.src = url;
    const played = player.play();
    if (played && typeof played.catch === 'function') played.catch(() => undefined);
  } catch {
    /* WebView 拒绝自动播放：静默（UI §3.6 的喇叭不弹错误 toast） */
  }
}

function speakByTts(word: string, accent?: 'uk' | 'us'): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = accent === 'us' ? 'en-US' : accent === 'uk' ? 'en-GB' : 'en';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    /* 无 TTS 引擎：静默 */
  }
}

export function speak(text: string, accent?: 'uk' | 'us'): void {
  const value = (text ?? '').trim();
  if (!value) return;
  if (isAudioSource(value)) playAudio(value);
  else speakByTts(value, accent);
}
