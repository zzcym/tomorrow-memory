/**
 * tRPC Client 配置（React Query 集成）
 */

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@tm/server';

export const trpc = createTRPCReact<AppRouter>();

/** 后端地址（开发环境走 Next rewrites 代理 /trpc；可用 NEXT_PUBLIC_API_URL 覆盖） */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
