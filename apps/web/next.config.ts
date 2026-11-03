import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 让 Next.js 直接编译 workspace 内的 TS 源码包（T-04：`@tm/ui` 不产出 dist，primitives 是 .tsx 源码）
  transpilePackages: ['@tm/shared', '@tm/ui'],
  reactStrictMode: true,
  // 架构 §3.3 规定源码包内部用 `./x.js` 说明符（T-05 的 `export * from './patterns/index.js'` 亦同）；
  // tsc 在 moduleResolution=Bundler 下能解析，webpack 默认不能 → 显式给 extensionAlias，
  // 否则 `next build` 在 packages/ui/src/index.ts 处报 Module not found。Turbopack 原生支持，无需此项。
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.tsx', '.ts', '.js'], '.mjs': ['.mts', '.mjs'] };
    return config;
  },
  // Phase 6：standalone 输出（Docker 精简镜像）；本地 Windows 构建因 symlink 权限受限，
  // 通过 NEXT_OUTPUT=standalone 显式启用，普通构建（.next + next start）用于本地/服务器裸跑
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  async rewrites() {
    // 开发环境：把 /api 和 /trpc、/ws 代理到 Hono 后端（:3001）
    // 生产环境由 Caddy 统一转发，此配置仅开发/本地用；可用 API_TARGET 覆盖目标
    const target = process.env.API_TARGET ?? 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
      { source: '/trpc/:path*', destination: `${target}/trpc/:path*` },
      { source: '/ws', destination: `${target}/ws` },
    ];
  },
};

export default nextConfig;
