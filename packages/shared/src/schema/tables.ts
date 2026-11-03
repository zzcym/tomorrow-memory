/**
 * `packages/shared/src/schema/tables.ts` —— DDL 的**单一描述源**（§6.2 第 1 步，归属 T-06）
 *
 * 消费方（全部只读本文件，不得另写一份列清单）：
 *   1. `tools/ddl-parity.mjs` A 段 —— 按本描述建表 → 反读 → 逐列比对（列集合/归一类型/NOT NULL/默认值/索引）。
 *   2. `packages/server/src/db/migrations/**` —— M1/M4 的 `ADD COLUMN` 与 M2/M3/M5 的 `CREATE TABLE`
 *      都由本文件的 `columnDdl()` / `createTableDdl()` / `createIndexesDdl()` 现场生成，
 *      **不在迁移文件里再抄一遍 SQL**（抄了就会漂移）。
 *   3. `packages/server/src/db/migrations/index.ts` 的 `assertSchemaMatchesDescriptor()`
 *      —— 迁移跑完后反读真库，缺表/缺列即报错（§6.1 迁移框架改动第 ③ 条）。
 *   4. `scripts/release/account-audit.mjs`（T-21）—— 体检 SQL 的列名口径。
 *
 * 红线（PRD §6.1-1 / §6.4-2 步 6b / §10.2 T-06 回归风险）：
 *   - 既有列的**名字与类型一字不改**；`users` 的真实生产结构就是下面 4+2 列，`fsrs_cards` 的
 *     序列化名是 `fsrs_data` 列（架构 §6.1 M6 行写的 `fsrs_cards.data` 指的是 `wordbooks.data` 一族语义，
 *     本文件按**实际列名**登记，见报告「契约偏差」）。
 *   - `data` 列在**两个驱动里都是 TEXT**（`db/sqlite.ts:41` / `db/pg.ts:42`），不是 JSON/JSONB；
 *     故归一类型登记为 `text`（§6.2 漂移表第 2 条的 "JSON vs JSONB" 与实际代码不符，已按现状登记）。
 *
 * 本文件**不得有任何运行时 import**（`shared-pure` 规则 + `ddl-parity.mjs` 用原生 `import()` 直读 .ts）：
 * 只放数据与纯函数。开关键名/默认值由 `packages/server/src/db/migrations/005-feature-flags.ts`
 * 从 `@tm/shared/constants` 取，不在这里落第二份。
 */

/** 归一化逻辑类型（与 `tools/ddl-parity.mjs` 的 TYPE_MAP 值域一致）。 */
export type LogicalColumnType = 'integer' | 'text' | 'real';

export interface ColumnDescriptor {
  name: string;
  /** 归一化逻辑类型；两侧物理类型不同处用 `pgType` / `sqliteType` 覆盖。 */
  type: LogicalColumnType;
  notNull?: boolean;
  /** 列默认值（字面量；`null` = 无默认值。`DEFAULT NULL` 也登记为 null，两侧一致）。 */
  default?: string | number | null;
  primaryKey?: boolean;
  /** 自增主键：sqlite = INTEGER PRIMARY KEY AUTOINCREMENT，pg = SERIAL PRIMARY KEY。 */
  autoIncrement?: boolean;
  /** pg 物理类型覆盖（如 `VARCHAR(11)`、`BIGINT`），缺省由 LOGICAL_TO_PG 推导。 */
  pgType?: string;
  /** sqlite 物理类型覆盖，缺省由 LOGICAL_TO_SQLITE 推导。 */
  sqliteType?: string;
  comment?: string;
}

export interface IndexDescriptor {
  name?: string;
  columns: string[];
  unique?: boolean;
  comment?: string;
}

export interface TableDescriptor {
  name: string;
  /** 该表由哪个迁移引入；存量表为 `'存量'`。 */
  introducedBy: string;
  /** 表级外键（仅用于生成 DDL；`ddl-parity` A 段不比对约束）。 */
  /** 引用列叫 referencedColumn（不能叫 column：同字面量里两个同名键在 TS 下是硬错误）。 */
  foreignKeys?: Array<{ column: string; table: string; referencedColumn: string }>;
  /** 复合主键列（覆盖 `primaryKey` 单列写法；仅 A 段之外的 DDL 生成用）。 */
  primaryKeyColumns?: string[];
  columns: ColumnDescriptor[];
  indexes: IndexDescriptor[];
  comment?: string;
}

/* ───────────────────────── 类型与 DDL 生成（纯函数） ───────────────────────── */

const LOGICAL_TO_SQLITE: Record<LogicalColumnType, string> = {
  integer: 'INTEGER',
  text: 'TEXT',
  real: 'REAL',
};

const LOGICAL_TO_PG: Record<LogicalColumnType, string> = {
  integer: 'INTEGER',
  text: 'TEXT',
  real: 'DOUBLE PRECISION',
};

export const sqliteColumnType = (col: ColumnDescriptor): string =>
  col.sqliteType ?? LOGICAL_TO_SQLITE[col.type] ?? 'TEXT';

/**
 * pg 侧物理类型。时间戳列一律 `pgType: 'BIGINT'`（现状 `created_at BIGINT`，毫秒数存不进 int4），
 * 且**禁止** `TIMESTAMP`/`CURRENT_TIMESTAMP`（§6.2 漂移 3：时间戳由 service 传 `Date.now()`）。
 */
export const pgColumnType = (col: ColumnDescriptor): string =>
  col.pgType ?? LOGICAL_TO_PG[col.type] ?? 'TEXT';

/** 默认值字面量按驱动落地（字符串加引号，数字裸写，`null` 不写 DEFAULT 子句）。 */
const defaultLiteral = (value: string | number): string =>
  typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

const columnFragmentPg = (col: ColumnDescriptor): string => {
  if (col.autoIncrement) return `${col.name} SERIAL PRIMARY KEY`;
  const bits = [col.name, pgColumnType(col)];
  if (col.primaryKey) bits.push('PRIMARY KEY');
  if (col.notNull) bits.push('NOT NULL');
  if (col.default !== undefined && col.default !== null) bits.push(`DEFAULT ${defaultLiteral(col.default)}`);
  return bits.join(' ');
};

const columnFragmentSqlite = (col: ColumnDescriptor): string => {
  if (col.autoIncrement) return `${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
  const bits = [col.name, sqliteColumnType(col)];
  if (col.primaryKey) bits.push('PRIMARY KEY');
  if (col.notNull) bits.push('NOT NULL');
  if (col.default !== undefined && col.default !== null) bits.push(`DEFAULT ${defaultLiteral(col.default)}`);
  return bits.join(' ');
};

export const indexName = (table: TableDescriptor, index: IndexDescriptor): string =>
  index.name ?? `idx_${table.name}_${index.columns.join('_')}`;

/** 单列 `ADD COLUMN`（M1/M4 唯一允许的表变更形态：带 DEFAULT，不回填）。 */
export const columnDdl = (
  driver: 'sqlite' | 'pg',
  table: TableDescriptor,
  columnName: string,
  opts: { ifNotExists?: boolean } = {},
): string => {
  const col = table.columns.find((c) => c.name === columnName);
  if (!col) throw new Error(`schema 源里 ${table.name} 没有列 ${columnName}`);
  if (col.autoIncrement || col.primaryKey) {
    throw new Error(`${table.name}.${columnName} 是主键/自增列，不允许走 ADD COLUMN`);
  }
  // T-25 判据⑤（R-41/M7）：`default: null` 在下面的 fragment 里会**丢掉整个 DEFAULT 子句**，而
  // `addColumnWithoutDefault()`（migrations/index.ts）见到无 DEFAULT 的 `ADD COLUMN` 即判违规。
  // 解法 = 新增可选键 `opts.explicitDefaultNull`（**不改既有签名行**，满足 §10.4 第 9 行 block-append
  // 的「0 既有行变更」硬条件）。不传该键的 M1-M6 仍走原路径，生成的语句一字未变（有专用例钉住）。
  if ((opts as { explicitDefaultNull?: boolean }).explicitDefaultNull === true && col.default === null) {
    const nullFragment = `${col.name} ${driver === 'pg' ? pgColumnType(col) : sqliteColumnType(col)}${col.notNull ? ' NOT NULL' : ''} DEFAULT NULL`;
    return `ALTER TABLE ${table.name} ADD COLUMN${opts.ifNotExists && driver === 'pg' ? ' IF NOT EXISTS' : ''} ${nullFragment}`;
  }
  const fragment = [
    col.name,
    driver === 'pg' ? pgColumnType(col) : sqliteColumnType(col),
    col.notNull ? 'NOT NULL' : '',
    col.default !== undefined && col.default !== null ? `DEFAULT ${defaultLiteral(col.default)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  // sqlite 没有 `ADD COLUMN IF NOT EXISTS`，幂等由调用方的列存在性检查保证。
  const ifNotExists = opts.ifNotExists && driver === 'pg' ? ' IF NOT EXISTS' : '';
  return `ALTER TABLE ${table.name} ADD COLUMN${ifNotExists} ${fragment}`;
};

/** 加索引（幂等：两侧都支持 `IF NOT EXISTS`）。 */
export const createIndexesDdl = (driver: 'sqlite' | 'pg', table: TableDescriptor): string[] =>
  table.indexes.map((idx) => {
    const cols = idx.columns.join(', ');
    const name = indexName(table, idx);
    return `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${name} ON ${table.name} (${cols})`;
  });

/**
 * 建新表（M2/M3/M5 用；`IF NOT EXISTS` 两侧同形）。
 * 存量表**绝不**经此函数重建 —— 它们的真值 DDL 冻结在 `db/{sqlite,pg}.ts` 的 `const DDL` 里。
 */
export const createTableDdl = (driver: 'sqlite' | 'pg', table: TableDescriptor): string => {
  const frag = driver === 'pg' ? columnFragmentPg : columnFragmentSqlite;
  const parts = table.columns.map(frag);
  if (table.primaryKeyColumns && !table.columns.some((c) => c.primaryKey || c.autoIncrement)) {
    parts.push(`PRIMARY KEY (${table.primaryKeyColumns.join(', ')})`);
  }
  for (const fk of table.foreignKeys || []) {
    parts.push(`FOREIGN KEY (${fk.column}) REFERENCES ${fk.table}(${fk.referencedColumn})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${parts.join(',\n  ')}\n)`;
};

export const tableDdlFor = (driver: 'sqlite' | 'pg', table: TableDescriptor): string[] => [
  createTableDdl(driver, table),
  ...createIndexesDdl(driver, table),
];

export const findTable = (name: string): TableDescriptor | undefined =>
  tables.find((t) => t.name === name);

export const findColumn = (table: string, column: string): ColumnDescriptor | undefined =>
  findTable(table)?.columns.find((c) => c.name === column);

/* ─────────────────────────────── 表清单 ─────────────────────────────── */

/** 本文件登记的表数量（`migrations.spec.ts` 与 T-21 的自检用）。 */
export const SCHEMA_SOURCE_VERSION = 'T-06/1';

const users: TableDescriptor = {
  name: 'users',
  introducedBy: '存量（M1 追加两列）',
  comment:
    '生产真值：id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, ' +
    'password TEXT DEFAULT NULL。M1 只追加 password_changed_at / pw_policy_version 两列，不回填任何行。',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true, comment: '存量列，未改动' },
    { name: 'phone', type: 'text', notNull: true, pgType: 'VARCHAR(11)', comment: '存量列；TEXT↔VARCHAR(11) 的语义差由 db/types.ts 的 assertPhone() 收口（§6.2 漂移 1，本期不改列）' },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT', comment: '存量列，毫秒时间戳' },
    {
      name: 'password',
      type: 'text',
      default: null,
      comment: '存量列：bcrypt hash 或 NULL（验证码注册的老账号）。**本期不许改类型/不许回填**。',
    },
    {
      name: 'password_changed_at',
      type: 'integer',
      notNull: true,
      default: 0,
      pgType: 'BIGINT',
      comment: 'M1 新增（R-40③）：0 = 该账号自上线从未改过密码 ⇒ 旧 token 全部仍可用（上线零掉线）。',
    },
    {
      name: 'pw_policy_version',
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'M1 新增（R-40④）：DEFAULT 0 即"策略生效前签发的哈希、需强制改密"，**因此无需任何 UPDATE 回填**。',
    },
  ],
  indexes: [{ columns: ['phone'], unique: true, comment: '生产为 users_phone_key / sqlite_autoindex_users_1，比对按列集合+唯一性而非索引名' }],
};

const wordbooks: TableDescriptor = {
  name: 'wordbooks',
  introducedBy: '存量（M4 追加两列，M6 只加条目可选键）',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  comment:
    '`data` 仍是 WordbookEntry[] 整数组（R-03⑦ 红线，形状一字未动）；' +
    'M6 只允许条目内新增可选键 `updatedAt`，不新增列、不改 data 的列类型。',
  columns: [
    { name: 'user_id', type: 'integer', primaryKey: true },
    {
      name: 'data',
      type: 'text',
      notNull: true,
      default: '[]',
      comment: '两侧物理类型都是 TEXT（不是 JSON/JSONB，见文件头红线注）；pg 侧查询时按需 ::json 转换。',
    },
    { name: 'updated_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
    {
      name: 'sync_version',
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'M4 新增（R-03①）：0 = 从未参与增量同步，service 读 0 按"全量首同步"处理。',
    },
    {
      name: 'tombstones',
      type: 'text',
      notNull: true,
      default: '[]',
      comment: "M4 新增（R-03①）：JSON 词名→删除时间戳；默认 '[]'。",
    },
  ],
  indexes: [],
};

const profiles: TableDescriptor = {
  name: 'profiles',
  introducedBy: '存量',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  columns: [
    { name: 'user_id', type: 'integer', primaryKey: true },
    { name: 'nickname', type: 'text', default: '' },
    { name: 'avatar', type: 'text', default: '', comment: 'Q4：本期 base64/URL 混存，不迁对象存储、不动历史值' },
    { name: 'updated_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
    { name: 'daily_goal', type: 'integer', default: 10 },
  ],
  indexes: [],
};

const checkinLogs: TableDescriptor = {
  name: 'checkin_logs',
  introducedBy: '存量',
  primaryKeyColumns: ['user_id', 'date'],
  columns: [
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'date', type: 'text', notNull: true },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [],
};

const fsrsCards: TableDescriptor = {
  name: 'fsrs_cards',
  introducedBy: '存量（本期一字未动）',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  comment:
    '`fsrs_data` 是 ts-fsrs 4.7.1 的序列化结果（A-2：版本钉死 4.7.1）。' +
    '本期不改其格式、不改列名；撤销走 review_snapshots（R-11）。',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'word', type: 'text', notNull: true },
    { name: 'fsrs_data', type: 'text', notNull: true, comment: '**红线：不改序列化格式**' },
    { name: 'last_review', type: 'integer', default: null, pgType: 'BIGINT' },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
    { name: 'updated_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [
    { columns: ['user_id', 'word'], unique: true },
    { columns: ['user_id'], unique: false },
  ],
};

const tutorCache: TableDescriptor = {
  name: 'tutor_cache',
  introducedBy: '存量',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'word', type: 'text', notNull: true },
    { name: 'level', type: 'text', notNull: true },
    { name: 'content', type: 'text', notNull: true },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [
    { columns: ['word', 'level'], unique: true },
    { columns: ['word'], unique: false },
  ],
};

const chatMessages: TableDescriptor = {
  name: 'chat_messages',
  introducedBy: '存量',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  comment: 'R-05：checkpoint key 改 `{userId}:{threadId}`，但旧裸 threadId 行**不迁移**（兼容读）。',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'thread_id', type: 'text', notNull: true },
    { name: 'role', type: 'text', notNull: true },
    { name: 'content', type: 'text', notNull: true },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [
    { columns: ['thread_id', 'created_at'] },
    { columns: ['user_id', 'created_at'] },
  ],
};

const assessmentCache: TableDescriptor = {
  name: 'assessment_cache',
  introducedBy: '存量（R-41 由 T-07 走"只加列"另案，本任务不动）',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'word', type: 'text', notNull: true },
    { name: 'qtype', type: 'text', notNull: true },
    { name: 'question', type: 'text', notNull: true },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
    // M7 / R-41（T-25）：题面缓存行的**属主列**，由迁移 `007-assessment-cache-user-id` 以
    // `ADD COLUMN user_id INTEGER DEFAULT NULL` 添加（走上面 `opts.explicitDefaultNull` 才写得出 DEFAULT 字面量）。
    // 全表初值 NULL = 改造前的无主题面 → 读路径一律跳过（PRD R-41③ 定案 (b)：不当公共池、不猜属主）。
    // UNIQUE (word, qtype) 一字未动 ⇒ 本期是"读路径属主过滤"，不是每用户一行的真隔离（R-42 / RK-14）。
    { name: 'user_id', type: 'integer', default: null },
  ],
  indexes: [{ columns: ['word', 'qtype'], unique: true }],
};

const analystCache: TableDescriptor = {
  name: 'analyst_cache',
  introducedBy: '存量',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'period', type: 'text', notNull: true },
    { name: 'content', type: 'text', notNull: true },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [{ columns: ['user_id', 'period'], unique: true }],
};

/* ── 本期新增的三张表 + 迁移清单表 ── */

const migrations: TableDescriptor = {
  name: '_migrations',
  introducedBy: 'M0 (000-migrations-table)',
  comment: '迁移清单表（§6.1 迁移框架第 ① 条）。只记"哪个迁移什么时刻执行过"，不含业务数据。',
  columns: [
    { name: 'name', type: 'text', primaryKey: true, notNull: true },
    { name: 'applied_at', type: 'integer', notNull: true, pgType: 'BIGINT', comment: '毫秒时间戳，由脚本传入' },
  ],
  indexes: [],
};

const reviewSnapshots: TableDescriptor = {
  name: 'review_snapshots',
  introducedBy: 'M2 (002-review-snapshots)',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  comment:
    'R-11 撤销快照：撤销 = 用快照整体回写一次 fsrs_cards + 删快照行，' +
    '因此不需要改 fsrs_cards 的任何列或序列化格式。prev_data 为 NULL 表示"复习前该词没有卡"，' +
    '此时撤销 = 删卡。',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'word', type: 'text', notNull: true },
    { name: 'prev_data', type: 'text', default: null, comment: '复习前 fsrs_cards.fsrs_data 的原样字符串' },
    { name: 'prev_due', type: 'integer', default: null, pgType: 'BIGINT', comment: '复习前 due（ms，便于不解析 JSON 也能对账）' },
    { name: 'reps_before', type: 'integer', default: null },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [{ columns: ['user_id', 'word', 'created_at'] }],
};

const accountAuditLog: TableDescriptor = {
  name: 'account_audit_log',
  introducedBy: 'M3 (003-account-audit-log)',
  foreignKeys: [{ column: 'user_id', table: 'users', referencedColumn: 'id' }],
  comment:
    'R-39⑤b / R-40④ 审计落点（S17）：必须落库、可按 user_id 检索；' +
    '**不得含明文密码或其 hash**（db 层 append() 有硬校验）。',
  columns: [
    { name: 'id', type: 'integer', primaryKey: true, autoIncrement: true },
    { name: 'user_id', type: 'integer', notNull: true },
    { name: 'phone_masked', type: 'text', default: null, comment: '只留后 4 位' },
    { name: 'action', type: 'text', notNull: true, comment: 'account_activated / password_upgraded / …' },
    { name: 'result', type: 'text', notNull: true, comment: 'ok / failed（失败也要记，PRD §6.4-4）' },
    { name: 'ip', type: 'text', default: null },
    { name: 'ua', type: 'text', default: null, comment: 'User-Agent，可空' },
    { name: 'created_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [{ columns: ['user_id', 'action', 'created_at'] }],
};

const featureFlags: TableDescriptor = {
  name: 'feature_flags',
  introducedBy: 'M5 (005-feature-flags)',
  comment:
    '运行时开关（§4.4.4）。值形态见 shared/src/constants/flags.ts：`on` / `off` / `0%|10%|50%|100%` / `on(20:30)`。' +
    '种子行由 M5 从 FEATURE_FLAG_DEFAULTS 生成，本文件不重复默认值。',
  columns: [
    { name: 'key', type: 'text', primaryKey: true, notNull: true },
    { name: 'value', type: 'text', notNull: true },
    { name: 'updated_at', type: 'integer', notNull: true, pgType: 'BIGINT' },
  ],
  indexes: [],
};

/**
 * 唯一清单。顺序 = 逻辑依赖顺序（users/wordbooks 在前），迁移顺序见 `db/migrations/`。
 * `ddl-parity` A 段按 name 取列，不依赖数组顺序。
 */
export const tables: TableDescriptor[] = [
  users,
  wordbooks,
  profiles,
  checkinLogs,
  fsrsCards,
  tutorCache,
  chatMessages,
  assessmentCache,
  analystCache,
  migrations,
  reviewSnapshots,
  accountAuditLog,
  featureFlags,
];

/** M1 追加到 users 的列（迁移与 T-07 都从这里取，防抄漏）。 */
export const CREDENTIAL_COLUMNS = ['password_changed_at', 'pw_policy_version'] as const;
/** M4 追加到 wordbooks 的列。 */
export const WORDBOOK_SYNC_COLUMNS = ['sync_version', 'tombstones'] as const;
/** M2/M3/M5 + M0 新建的表名。 */
export const NEW_TABLES = ['_migrations', 'review_snapshots', 'account_audit_log', 'feature_flags'] as const;
/** 业务数据表：迁移里**不得读写**（静态自检的黑名单，见 migrations/index.ts）。 */
export const BUSINESS_TABLES = [
  'users',
  'wordbooks',
  'profiles',
  'checkin_logs',
  'fsrs_cards',
  'tutor_cache',
  'chat_messages',
  'assessment_cache',
  'analyst_cache',
] as const;

/** M6：`wordbooks.data` 条目内允许新增的可选键（无 DDL，只做文档与 dry-parse 校验）。 */
export const WORDBOOK_ENTRY_OPTIONAL_KEYS = ['updatedAt'] as const;
export const WORDBOOK_ENTRY_OPTIONAL_KEYS_NOTE =
  'R-03③ / PRD §6.1-3：wordbooks.data 仍是 WordbookEntry[] 整数组，字段名与语义不变，' +
  '只允许条目内新增可选键。本期为条目新增 updatedAt（ms，条目最后一次被实际改动的时间）。' +
  '旧客户端 WordbookEntrySchema 是 .passthrough()，未知键自动容忍 → 旧 APK/Web 不受影响。';

export const defaultSchemaSource = tables;
export default tables;
