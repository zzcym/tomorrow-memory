/**
 * A-32-5 的红向 fixture：本目录与 ../enforce-two-reads 的差别是"这里同时存在大量噪音"
 * （注释 / test/** / src/scripts/**）。它证明口径收窄**没有**把真实的第二处运行时读点
 * 一起豁免掉 —— 谁要是把 SKIP 名单放宽到 src/**，本例立刻转绿、--self-test 就会红。
 */
declare function readFlag(k: string): string;
export function gate(next: () => void) {
  const on = readFlag('passwordUpgradeEnforce') === 'on';
  return on ? next() : undefined;
}
