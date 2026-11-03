'use client';

/**
 * Web 宿主的 `UiHost` 实现（架构 §3.1 / UI §3.11.1）。
 *
 * 这里是全站**唯一**允许 `from 'sonner'` 的地方（§3.11.1 末行）：`packages/ui` 只经
 * `useHost().toast(...)` 触发提示，不直接依赖 sonner，也不发任何请求（§3.5 `ui-no-io`）。
 * App 侧对应实现由 T-14 落在 `apps/app/src/host.tsx`。
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { fallbackHost, normalizeToastOptions, toastDurationMs, UiHostProvider, type UiHost } from '@tm/ui';

export function useWebUiHost(): UiHost {
  const router = useRouter();

  return React.useMemo<UiHost>(
    () => ({
      // localStorage 读写与 WebView 兜底同源（§5.6 禁用 DOMStorage 时静默降级）
      kv: fallbackHost.kv,

      speak(text, accent) {
        fallbackHost.speak(text, accent);
      },

      navigate(to) {
        if (/^https?:\/\//i.test(to) || to.startsWith('//')) {
          if (typeof window !== 'undefined') window.location.assign(to);
          return;
        }
        router.push(to);
      },

      toast(message, options) {
        const opts = normalizeToastOptions(options);
        const data: ExternalToast = { duration: toastDurationMs(opts) };
        if (opts.action) {
          const { label, onClick } = opts.action;
          data.action = { label, onClick: () => onClick() };
        }
        if (opts.tone === 'success') {
          sonnerToast.success(message, data);
          return;
        }
        if (opts.tone === 'error') {
          sonnerToast.error(message, data);
          return;
        }
        sonnerToast(message, data);
      },
    }),
    [router],
  );
}

/** 根布局用的 Provider（`layout.tsx` 只包一层，不改任何页面逻辑）。 */
export function WebUiHostProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const host = useWebUiHost();
  return <UiHostProvider host={host}>{children}</UiHostProvider>;
}
