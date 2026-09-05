# ===== 前端 Next.js Dockerfile（多阶段，standalone 输出） =====

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY packages/server/package.json packages/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @tm/web...

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# next.config.ts 仅在 NEXT_OUTPUT=standalone 时启用 standalone 输出，缺失会导致 runner 阶段 COPY 失败
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter @tm/web build

# ---- runner（standalone） ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone 输出（含精简 node_modules 与 server.js）
COPY --from=builder /app/apps/web/.next/standalone ./
# 静态资源
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# public 目录（robots.txt 等；已在仓库中保证存在）
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
