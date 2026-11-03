/**
 * A-101 (c) 夹具（红向·混合）：同一个扫描面里**既有负例面命中、又有运行面命中**。
 *
 * 这个文件本身在 `test/**` ⇒ 它那颗 `passwordUpgradeDeadline` 计入 NOTE；
 * 同目录的 `packages/shared/src/real-violation.ts` 那颗在运行面 ⇒ 必须红。
 * 于是这条用例证明的是：新增的"负例面不判红"分支不会把整条判据变成惰性。
 */

const BANNED = ['passwordUpgradeDeadline', '以后再说', '宽限期'];

export const count = (t: string) => BANNED.filter((b) => t.includes(b)).length;
