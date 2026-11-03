// A-30-4 / --web 的红向 fixture（只加不减的那一词）：lib/api 里自己落本地存储。
export function rememberDirection(word: string, dir: string) {
  localStorage.setItem(`tm-dir-${word}`, dir);
}
