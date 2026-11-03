/**
 * M7 `007-assessment-cache-user-id` —— R-41 / M7 的**唯一**落库面（T-25，批次 4A）
 *
 * 两个驱动上**各只有一条语句**，且逐字同形：
 *   ALTER TABLE assessment_cache ADD COLUMN user_id INTEGER DEFAULT NULL
 *
 * 为什么是 `DEFAULT NULL` 而不是不带默认值（判据⑤）：
 *   PRD §6.1-1「加列一律带默认值」在 `migrations/index.ts` 里由 `addColumnWithoutDefault()`
 *   机器化执行 —— 无 DEFAULT 子句的 `ADD COLUMN` 直接记 violation。而 schema 源的
 *   `default: null` 在 `columnDdl()` 里恰好**不写** DEFAULT 子句（`defaultLiteral` 只吃
 *   string|number），故走 T-25 追加的 `opts.explicitDefaultNull` 分支，把 `DEFAULT NULL`
 *   字面量真写出来。列清单仍来自 `packages/shared/src/schema/tables.ts`（本文件不抄 SQL）。
 *
 * 零回填（判据②）：本文件只有 1 条语句，无 UPDATE / INSERT / 子查询，
 *   存量行由 DDL 本身落到 `user_id IS NULL`；行哈希（4 列 + COUNT + SUM(id)）迁移前后一字不变。
 *   `NULL` = 改造前无主题面 ⇒ 读路径一律跳过（PRD R-41③ 定案 (b)：不当公共池、不猜属主）。
 *
 * 不动的东西：`assessment_cache` 的 `UNIQUE (word, qtype)` 一字未动 ⇒ 本期是**读路径属主过滤**，
 *   不是每用户一行的真隔离（真隔离 = 下一阶段 R-42 四步键迁移，代价已登记 RK-14）。
 *   也不加索引：按 (word,qtype) 定位仍走原唯一索引，`user_id` 只是过滤条件，本期无按属主扫描的读路径。
 *
 * `down` 省略：本列不允许删（见下方 `noDownReason` 与文件头注释），
 *   回滚 = 回镜像（旧读路径不 SELECT 这一列即可），不回滚库（PRD §6.4-2 步 7）。
 */

import { columnDdl } from '@tm/shared/schema';
import { schemaTable, type Migration } from './index.js';

/**
 * `columnDdl()` 的第四个形参类型是 `{ ifNotExists?: boolean }`，那行签名在 §10.4 第 9 行
 * block-append 的「0 既有行变更」硬条件下删不掉，所以新增键只能在调用侧做一次**窄化转换**
 * （运行时 `columnDdl` 用 `(opts as { explicitDefaultNull?: boolean })` 取）。
 * 不传该键的 M1-M6 走原路径，生成的语句一字未变（`test/db/migrations.spec.ts` 有字节快照例钉住）。
 */
const explicitDefaultNull = { explicitDefaultNull: true } as unknown as { ifNotExists?: boolean };

export const migration: Migration = {
  name: '007-assessment-cache-user-id',
  title: 'assessment_cache 追加属主列 user_id（1 条 ADD COLUMN，零回填、零索引变更）',
  statements: (driver) => [columnDdl(driver, schemaTable('assessment_cache'), 'user_id', explicitDefaultNull)],
  noDownReason:
    'R-41 / PRD §6.1-1「只加不删」：user_id 是属主列，删它等于把 R-41 的隔离证据链抹掉，' +
    '本期不允许任何形式的删列动作，因此没有可逆形态。' +
    '旧镜像不 SELECT 这一列即可正常工作（新列对旧查询不可见）→ 回滚只需回镜像，不回滚库（PRD §6.4-2 步 7）。',
};

export default migration;
