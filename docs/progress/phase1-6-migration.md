# Phase 1 - 任务 6：数据库迁移（fsrs_cards / tutor_cache）

## 做了什么

1. **新增两张表**（两种驱动 DDL 一致，由 `db.init()` 幂等创建）：
   - `fsrs_cards`：`id / user_id / word / fsrs_data / last_review / created_at / updated_at`，`UNIQUE(user_id, word)`，索引 `idx_fsrs_cards_user`
   - `tutor_cache`：`id / word / level / content / created_at`，`UNIQUE(word, level)`，索引 `idx_tutor_cache_word`

2. **FSRS 初始化脚本** `src/scripts/init-fsrs.ts`
   - 遍历所有用户单词本，为每个单词（按小写去重）创建默认卡片：
     - `stability=1, difficulty=5, state=New(0)`（任务约定默认参数）
     - `fsrs_data` 为 JSON，结构与 ts-fsrs v4 `Card` 序列化格式兼容（Phase 2 直接用 `Card.fromJSON` 恢复）
   - **幂等**：已存在卡片跳过，可重复执行

3. **数据迁移脚本** `src/scripts/migrate.ts`
   - `DB_DRIVER=pg` 时：读取旧版 `data.db`（SQLite）的 users/wordbooks/profiles/checkin_logs，UPSERT 写入 PostgreSQL（兼容原 migrate-pg.js 语义，保留原 id）
   - 之后自动执行 FSRS 初始化
   - `DB_DRIVER=sqlite` 时：用户数据即当前库，直接初始化 FSRS

## 遇到的问题

- **原 migrate-pg.js 是按 id 插入用户**（保留外键关系），而 AppDB 的 `createUser` 是自增 id。迁移脚本在 PG 驱动下通过底层 pool 直接执行带 id 的 INSERT，SQLite 驱动下走 `createUser`。这是有意为之的差异，注释已说明。
- **SQLite 的 json_array_length**：PG 用 `json_array_length(data::json)`，SQLite 的 JSON1 函数在 better-sqlite3 中可用，但为稳妥，迁移与统计统一在 JS 侧解析（`safeJsonParse`）。

## 验证

- [x] `DB_DRIVER=sqlite` 实测：`pnpm db:init-fsrs` 成功创建 2 张卡片（S=1, D=5, state=0），fsrs_cards/tutor_cache 表正确建出
- [ ] `DB_DRIVER=pg` 端到端迁移实测：本机无 Docker/PG，待有 PG 环境执行 `pnpm db:migrate`（SQL 已按 PG 方言编写，逻辑与已验证的旧 migrate-pg.js 一致）
