import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 让 Next.js 直接编译 workspace 内的 TS 源码包（仅类型/工具引用）
  transpilePackages: ['@tm/shared'],
  reactStrictMode: true,
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
