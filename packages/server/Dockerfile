# ===== 后端 Hono Dockerfile（多阶段构建） =====
# builder：安装依赖 + tsc 编译；runner：node alpine + 仅生产依赖 + tsx 运行 TS 入口
# TODO: 生产优化——可用 esbuild/tsup 打包单文件，仅保留 better-sqlite3 等原生模块

FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache python3 make g++ && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

# ---- deps：仅安装依赖（利用缓存层） ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY packages/server/package.json packages/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @tm/server...

# ---- builder：编译 ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
RUN pnpm --filter @tm/server build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# 复制编译产物与生产依赖
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/agent ./packages/agent
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/package.json ./package.json

EXPOSE 3001
CMD ["pnpm", "--filter", "@tm/server", "start"]
