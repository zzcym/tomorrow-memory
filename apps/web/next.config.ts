import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 让 Next.js 直接编译 workspace 内的 TS 源码包（@tm/shared / @tm/server 仅取类型）
  transpilePackages: ['@tm/shared', '@tm/server'],
  reactStrictMode: true,
  async rewrites() {
    // 开发环境：把 /api 和 /trpc、/ws 代理到 Hono 后端（:3001）
    // 生产环境由反向代理（nginx）统一转发，此配置仅开发用
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/trpc/:path*',
        destination: 'http://localhost:3001/trpc/:path*',
      },
      {
        source: '/ws',
        destination: 'http://localhost:3001/ws',
      },
    ];
  },
};

export default nextConfig;
