/**
 * T-02 判据④的 fixture：一份**故意带漂移**的 schema 源，用来证明
 * `tools/ddl-parity.mjs` 的 A 段在真库往返上能红、且退出码非 0 能阻断。
 *
 * 用法（不要接进运行时）：
 *   node tools/ddl-parity.mjs --section A --schema tools/fixtures/selftest/parity/schema-drift.mjs
 * 期望：exit=1，`parity_drift_fixture` 上报 type-mismatch + notnull-mismatch，
 *      `parity_clean_fixture` 上报 0 差异（否则 A 段就是永真断言）。
 *
 * 两处漂移都是 sqlite 的真实语义差异，不是编造的输入：
 *   1) `payload` 声明成 blob：DDL 生成器把非 integer/json 一律落成 TEXT，往返回来就是 text
 *      → 与描述不符（T-06 若真用 blob，A 段必须把它揪出来）。
 *   2) `id` 是 INTEGER PRIMARY KEY 且声明 notNull：sqlite 的 rowid 别名在
 *      PRAGMA table_info 里 notnull=0 → 声明与落库不一致（§6.2 漂移表之外的已知坑）。
 */
export const tables = [
  {
    name: 'parity_clean_fixture',
    columns: [
      { name: 'id', type: 'integer', primaryKey: true },
      { name: 'note', type: 'text', notNull: true, default: 'ok' },
      { name: 'ts', type: 'bigint', notNull: true, default: 0 },
    ],
    indexes: [{ name: 'idx_parity_clean_fixture_note', columns: ['note'], unique: false }],
  },
  {
    name: 'parity_drift_fixture',
    columns: [
      { name: 'id', type: 'integer', primaryKey: true, notNull: true },
      { name: 'payload', type: 'blob', notNull: false },
    ],
    indexes: [],
  },
];

export default { tables };
