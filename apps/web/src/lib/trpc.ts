/**
 * tRPC Client 配置（React Query 集成）+ **凭据域错误的单点读法**（T-16 / R-40③④⑥）。
 *
 * 本文件只做三件事：挂 React Query 的 `createTRPCReact`、给传输地址一个出口、
 * 给"服务端错误 → §4.6 码 / 客户端动作"的判定一个**类型入口**。
 * 真正的处理（清凭据、跳登录、进强制改密页）只有一个执行点，在
 * `components/providers.tsx` 的 `QueryCache/MutationCache` 错误回调里 —— 判据⑥ 说的"401 单点"
 * 就是那一个点，页面与组件一律不各自 `catch` 401。
 */

import { createTRPCReact } from '@trpc/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '@tm/server';

export const trpc = createTRPCReact<AppRouter>();

/** 服务端任何一次调用失败后客户端拿到的错误形状（`error.data.code` 由 A-30-1 的 errorFormatter 提升）。 */
export type TrpcError = TRPCClientErrorLike<AppRouter>;

/** 后端地址（开发环境走 Next rewrites 代理 /trpc；可用 NEXT_PUBLIC_API_URL 覆盖） */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * 浏览器侧走 rewrites（`/trpc` → `:3001/trpc`），服务端渲染侧走绝对地址：
 * 两条都在这一个函数里，`providers.tsx` 不再各自拼串。
 */
export function trpcUrl(): string {
  if (typeof window !== 'undefined') return '/trpc';
  return `${API_URL}/trpc`;
}
