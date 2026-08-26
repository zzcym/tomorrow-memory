# Phase 1 - 任务 2：数据库抽象层

## 做了什么

1. **统一接口** `packages/server/src/db/types.ts`
   - 四个业务域接口：`UserDB` / `WordbookDB` / `ProfileDB` / `CheckinDB`
   - Phase 2 预置：`FsrsDB`（复习卡片）、`TutorCacheDB`（教学缓存）
   - `AppDB` 聚合接口：六个域 + `createUser`（跨表事务）+ `init`（建表）+ `close`
   - 全部使用 `@tm/shared` 中的类型，**零 any**

2. **PostgreSQL 实现** `db/pg.ts`（`PostgresAppDB`）
   - pg Pool 连接，`$1` 占位符
   - 建表 DDL：users / wordbooks / profiles / checkin_logs / **fsrs_cards** / **tutor_cache**（含索引）
   - `createUser` 用事务（BEGIN/COMMIT/ROLLBACK）
   - 管理统计 SQL 保持与旧版一致的语义（json_array_length 计算单词数）

3. **SQLite 实现** `db/sqlite.ts`（`SqliteAppDB`）
   - better-sqlite3（同步内核），对外暴露 async 接口与 PG 对齐
   - 同一套 DDL（SQLite 方言：INTEGER PRIMARY KEY AUTOINCREMENT、`?` 占位符、`excluded.` 语法）
   - `createUser` 用 better-sqlite3 事务
   - 打卡连续天数复用 shared 的 `computeStreak`

4. **工厂** `db/index.ts`
   - `createAppDB()`：读 `DB_DRIVER` 环境变量，`pg` → PostgresAppDB，`sqlite` → SqliteAppDB
   - 进程内单例缓存（reuse）

## 设计决策

- **接口按业务方法而非裸 SQL 设计**：路由层只依赖接口，不感知底层驱动，后续换库零改动。
- **SQLite 的 WAL 设置**保留旧 server_prod.js 的参数（wal_autocheckpoint=100、synchronous=NORMAL）。
- **迁移脚本**（migrate.ts / init-fsrs.ts）走 AppDB 接口，保证两种驱动行为一致。

## 遇到的问题

- PG 与 SQLite 的 SQL 方言差异（占位符、UPSERT 语法）：两个实现各自写 SQL，不共用 SQL 模板，避免运行时转换的坑。
- better-sqlite3 类型：使用 `@types/better-sqlite3`；行对象用明确的归一化函数（normalizeUser 等）转为强类型，避免 any。

## 验证

- [x] 接口 + 双实现代码完成
- [x] `tsc --noEmit` 全部通过
- [x] 冒烟测试（SQLite 驱动）18/18 通过：登录/单词本/打卡/主页/管理/查词/鉴权全部正常
