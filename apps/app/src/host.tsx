/**
 * `UiHost` 的 **App 侧实现**（架构 §3.1 / §5.2）：`@tm/ui` 包对宿主能力的唯一依赖面在这里落地。
 *
 *  - `kv`     localStorage + `AndroidBridge` 双写（§3.1，WebView 禁 DOMStorage 时降级为内存 Map）
 *  - `speak`  `<audio>` 播 `LookupResult.audio`；无绝对 URL 时才退回 TTS（§5.4②、WebView 无 TTS 保证）
 *  - `navigate` hash 路由（`file://` 无 History API）
 *  - `toast`  **自绘 banner**（App 侧不引 sonner），时长表沿用 `toastDurationMs`（UI §3.11.1）
 *
 * 本文件不含业务页面，也不含任何字面用户可见文案：文案与时长常量全部 import 自 `@tm/shared` / `@tm/ui`。
 */

import * as React from 'react';
import { normalizeToastOptions, toastDurationMs, UiHostProvider, useHost } from '@tm/ui';
import type { ToastOptions, ToastTone, UiHost } from '@tm/ui';
import { ARIA } from '@tm/shared';
import { bridge, kvGet, kvSet } from './native/bridge.js';
import { speak as speakNative } from './native/speak.js';
import { navigate } from './router.js';

/* ═════════════════ Toast store（自绘 banner 的唯一状态源） ═════════════════ */

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
  actionLabel?: string;
  action?: () => void;
}

let toastSeq = 0;
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();

function notifyToasts(): void {
  for (const listener of Array.from(toastListeners)) {
    try {
      listener();
    } catch {
      /* 订阅方抛错不影响其他订阅方 */
    }
  }
}

export function getToasts(): ToastItem[] {
  return toasts;
}

export function subscribeToasts(listener: () => void): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export function pushToast(message: string, options?: ToastOptions | ToastTone): ToastItem {
  const opts = normalizeToastOptions(options);
  const item: ToastItem = {
    id: (toastSeq += 1),
    message,
    tone: opts.tone ?? 'info',
    durationMs: toastDurationMs(opts),
    actionLabel: opts.action?.label,
    action: opts.action?.onClick,
  };
  /** 同一屏最多两条（UI §3.11.1），新的在后。 */
  toasts = [...toasts.slice(-1), item];
  notifyToasts();
  const timer = setTimeout(() => dismissToast(item.id), item.durationMs);
  if (typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }
  return item;
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  notifyToasts();
}

export function clearToastsForTest(): void {
  toasts = [];
  notifyToasts();
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'border-hair',
  success: 'border-success',
  error: 'border-danger',
};

/** 挂在应用根部的 toast 层：`role=status`（`ARIA.toastRole`），不抢焦点、可点击动作按钮。 */
export function ToastLayer(): React.JSX.Element | null {
  const items = React.useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (items.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 px-4 pb-safe-bottom"
      role={ARIA.toastRole}
      data-testid="toast-layer"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm text-ink shadow-elev-2 ${TONE_CLASS[item.tone]}`}
          data-tone={item.tone}
        >
          <span className="min-w-0 flex-1 break-words">{item.message}</span>
          {item.action ? (
            <button
              type="button"
              className="min-h-tap shrink-0 text-sm font-medium text-brand underline"
              onClick={() => {
                item.action?.();
                dismissToast(item.id);
              }}
            >
              {item.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ═════════════════ UiHost 实现 ═════════════════ */

/** 把 `UiHost` 的四项能力实现在 App 上；单独导出便于单测直接断言行为。 */
export const appHost: UiHost = {
  kv: {
    get: (k: string) => kvGet(k),
    set: (k: string, v: string) => kvSet(k, v),
  },
  speak: (text: string, accent?: 'uk' | 'us') => speakNative(text, accent),
  navigate: (to: string) => navigate(to),
  toast: (message: string, options?: ToastOptions | ToastTone) => {
    pushToast(message, options);
  },
};

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <UiHostProvider host={appHost}>{children}</UiHostProvider>
  );
}

/** 供非组件代码（数据层、启动链）拿 host 的同一份实现，避免第二套 toast。 */
export const hostRef = { current: appHost };

export function useAppHost(): UiHost {
  return useHost();
}

/** WebView 里 DOMStorage 可能被关（§5.6）：桥与 kv 是否可用的诊断位。 */
export function bridgeAvailable(): boolean {
  return bridge() !== null;
}

export type { ToastOptions, ToastTone, UiHost };
