/**
 * A-101 (c) 夹具（绿向）：发布护栏的反例夹具。
 *
 * `scripts/release/**` 的职责就是构造"库里复活了作废键"的假数据来证明护栏会拦 ——
 * 这些命中是**证据**，不是违犯；计入 NOTE 报出来即可。
 */

export const CHECK_ITEM = '步 8 ④/`passwordUpgradeDeadline` 不存在（v1.3 连同 14 天宽限期一并作废）';

export const counterExampleRows = (goodRows) => [
  ...goodRows,
  { key: 'passwordUpgradeDeadline', value: '2026-10-01', source: 'db' },
];
