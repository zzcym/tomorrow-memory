'use client';

/**
 * 登录态 hook：初始值固定为 false，挂载后同步 localStorage 并监听变化
 *
 * 不能在渲染期直接读 localStorage（typeof window / getToken()）：
 * SSR 渲染 null、客户端渲染 token，会造成 React hydration mismatch
 *（整树重渲染 + Next.js DevTools 报 Issue）。
 * 跨标签页通过自定义事件 + storage 事件同步登出/登录。
 */

import * as React from 'react';
import { getToken } from './auth';

export function useAuthed(): boolean {
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    const sync = (): void => setAuthed(!!getToken());
    sync();
    window.addEventListener('tm-auth-changed', sync);
    // 兼容其他标签页直接改 localStorage 的场景
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('tm-auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return authed;
}
