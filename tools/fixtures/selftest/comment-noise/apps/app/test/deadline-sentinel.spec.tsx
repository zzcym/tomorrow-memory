/**
 * A-101 (c) 夹具（绿向）：测试面的反例哨 —— 把作废的键名写进禁词清单，是为了证明哨兵还活着。
 *
 * 这类命中不是违犯：`deadline-key-zero` 的判据语义是「`src/**` 与配置文件不许有这个键」，
 * `test/**` 与 `scripts/release/**` 的负例夹具计入 NOTE 不判红（TPM 裁定，非规范推导）。
 * 反证：`violations/gate-truth-real/packages/shared/src/real-violation.ts` 里同一个键必须红。
 */

const BANNED_ON_SCREEN = [
  '以后再说',
  '稍后再改',
  '下次提醒',
  '宽限期',
  'passwordUpgradeDeadline',
];

export const sentinel = (text: string) => BANNED_ON_SCREEN.filter((t) => text.includes(t));
