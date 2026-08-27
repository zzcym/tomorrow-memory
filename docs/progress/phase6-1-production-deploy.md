# Phase 6 - 生产部署与优化

## 做了什么

### 1. Dockerfile 多阶段构建
- **后端** `packages/server/Dockerfile`：deps（仅安装依赖，利用缓存层）→ builder（`pnpm --filter @tm/server build`）→ runner（node:22-alpine + 编译产物 + 生产 node_modules）
  - TODO：后续可用 esbuild/tsup 打包单文件，仅保留 better-sqlite3 等原生模块进一步减体积
- **前端** `apps/web/Dockerfile`：`output: 'standalone'`，deps → build → runner（standalone server.js + static + public）

### 2. 生产编排 docker-compose.prod.yml
- 全部服务：web / server / postgres / redis / qdrant / clickhouse / **jaeger（observability profile，可选）** / **caddy**
- 健康检查（wget 探活 + depends_on condition）+ `restart: unless-stopped` + `mem_limit` / `cpus` 资源限制
- 命名数据卷持久化（pg/redis/qdrant/clickhouse/jaeger/caddy）

### 3. Caddyfile（替代 Nginx）
- 自动 HTTPS（Let's Encrypt，`{$SITE_ADDRESS}` 注入域名）
- `/api/*` `/trpc/*` `/ws` `/metrics` → `server:3001`；其余 → `web:3000`
- 安全头：CSP / X-Frame-Options / HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy
- 压缩（zstd/gzip）+ 静态资源缓存头（`/_next/static` 一年 immutable）
- 删除旧的 `tmenglish.conf`（Nginx 配置）

### 4. GitHub Actions
- `.github/workflows/ci.yml`：PR/推送触发 pnpm install → lint → typecheck → 冒烟 → web build → 两个镜像 docker build 验证
- `.github/workflows/deploy.yml`：main 推送 → GHCR 构建推送（sha + latest 双 tag）→ SSH 服务器 `docker compose pull && up -d` → /metrics 健康检查 → 失败回滚

### 5. 性能调优
- **Qdrant HNSW**：`qdrant-config.yaml` m=16、ef_construct=128 + int8 标量量化（生产挂载）
- **PostgreSQL**：连接池 max=20（`PG_POOL_MAX` 可配）、idleTimeout=30s、connectionTimeout=5s
- **Redis 缓存层** `services/cache.ts`：查词结果缓存 **5 分钟**、用户单词本缓存 **30 秒**（写操作失效）；`CacheService.getOrSet` 无 Redis 自动跳过
- **Next.js**：`/word/[word]` ISR 高频词预渲染（200 常用词 generateStaticParams + revalidate=3600）；Recharts 图表 `next/dynamic` 代码分割；standalone 输出
- **LLM 缓存**：llm-router 已有 prompt 哈希缓存（`role|messages` 为 key），重复请求直接命中

### 6. 清理历史债务
- 删除 28 个旧部署/调试脚本（deploy.js/py、quick_deploy.py、fix_deploy.py、restart_*.py、verify_*.py、debug_*.py、setup_nginx.py、apply_nginx_conf.py、pull_prod.py、recover_db.py、download_dict.py、check_data.js、_check_sessions.py 等）
- 删除旧后端入口 `server_prod.js`、重复前端 `script_prod.js`、重复 `requirements.html`、Nginx 配置、PM2 配置、旧截图
- 保留并移入 `scripts/`：build-fts.js / build-examples.js / build-zh2en.js / migrate-pg.js / test-fts-cjk.js
- 根目录仅保留配置文件 + 数据文件 + 包目录；旧前端（index.html/script.js/style.css）保留不维护
- 新增 `README.md`（技术栈、结构、启动、部署、Agent 架构）

## 遇到的问题
- standalone 模式下 rewrites 指向 localhost:3001 不适用于容器：改为 `API_TARGET` 环境变量（compose 设 `http://server:3001`）
- 无 Docker 环境：所有 Docker/Caddy/CI 配置按最佳实践编写但未实测（进度记录遗留项）

## 验证
- [x] 全量回归：tRPC 16/16、analyst 5/5、旧 API 18/18、/metrics 200
- [x] tsc 全包通过、lint 干净
- [ ] Docker 镜像构建 / compose 编排 / Caddy HTTPS / CI 流水线（需 Docker + GitHub 环境，遗留）
