// --web 的绿向 fixture（A-30-4）：lib/api/** 是纯投影层，方向判定不碰任何浏览器出口。
export function directionOf(query: string, lang: 'en' | 'zh'): 'en-to-zh' | 'zh-to-en' {
  return /[一-龥]/.test(query) && lang === 'en' ? 'zh-to-en' : 'en-to-zh';
}
