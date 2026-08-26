# Phase 1 - 任务 4/5：Docker Compose 开发环境 + 环境变量管理

## 任务 4：docker-compose.dev.yml

四个服务（数据卷持久化、健康检查）：

| 服务 | 镜像 | 端口 | 用途 |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | 用户数据主库 |
| redis | redis:7-alpine | 6379 | 缓存（Phase 3+） |
| qdrant | qdrant/qdrant:v1.12.4 | 6333 REST / 6334 gRPC | 向量数据库（Phase 2） |
| clickhouse | clickhouse/clickhouse-server:24.8-alpine | 8123 HTTP / 9000 native | 学习行为分析（Phase 5+） |

- 凭据通过 `.env` 注入（`${POSTGRES_DB:-默认值}` 语法）
- 命名卷 `tm_pg_data` / `tm_redis_data` / `tm_qdrant_data` / `tm_clickhouse_data`
- 根 package.json 提供 `pnpm docker:up` / `docker:down`

**注意**：本机未安装 Docker，compose 文件无法实测；语法已按 docker compose v2 规范编写，README 会注明。

## 任务 5：环境变量管理

**提取的硬编码密钥**（原散落在 server.js / server_prod.js 中）：

| 变量 | 原硬编码值 | 说明 |
|---|---|---|
| JWT_SECRET | `crypto.randomBytes(32)`（每次重启失效） | 必填，无值时拒绝启动 |
| YOUDAO_APP_KEY / YOUDAO_SECRET | 硬编码 | 有道翻译 |
| ADMIN_PASSWORD | `admin888` | 管理后台 |
| DATABASE_URL | 硬编码默认连接 | PostgreSQL |
| DEEPSEEK_API_KEY / EMBEDDING_API_KEY 等 | 无 | Phase 2 预留 |

- `.env.example` 完整模板 + 注释；`.env` 从模板复制（默认值保持旧行为）
- `packages/server/src/config.ts`：`loadConfig()` 集中解析全部环境变量（类型化、默认值）
- dotenv 在 config.ts 顶部加载

## 遇到的问题

- Windows 下 `.env` 通过 `Copy-Item` 复制后终端显示乱码（控制台编码问题，文件本身 UTF-8 正常）。
- Docker 不可用：进度记录遗留项，需在有 Docker 的机器上 `docker compose -f docker-compose.dev.yml up -d` 验证。

## 验证

- [x] compose 文件与环境变量文件就绪
- [ ] 实际 `docker compose up`（本机无 Docker，遗留）
