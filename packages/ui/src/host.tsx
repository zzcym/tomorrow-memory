'use client';

/**
 * UiHost（架构 §3.1）：ui 包对宿主能力的**唯一**依赖面。
 * 包内零宿主假设 —— 不 import `next/*`、不 import `@trpc/*`、不 `fetch`（§3.5 `ui-no-io`）。
 * Web 侧实现见 `apps/web/src/lib/host.tsx`（T-12 起使用），App 侧实现见 `apps/app/src/host.tsx`（T-14）。
 */

import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 语义类合并（§1.12.2 的语义类 + className 覆写）。放在本文件是为了不新增 §10.2 清单外的文件。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type ToastTone = 'info' | 'error' | 'success';

/** UI §3.11.1：Toast 的右侧动作按钮（撤销即 `label: '撤销'` 的 action）。 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
  /** 覆盖 §3.11.1 默认时长（普通 3000 / 带撤销 5000 / 错误 6000）。 */
  durationMs?: number;
}

export interface UiHost {
  /** web: localStorage；app: localStorage + Bridge 双写。清空一份列表 = set(key, '[]')。 */
  kv: {
    get(k: string): string | null;
    set(k: string, v: string): void;
  };
  /** web: SpeechSynthesis；app: HTMLAudio(audio url)。 */
  speak(text: string, accent?: 'uk' | 'us'): void;
  /** web: next/router；app: hash router。 */
  navigate(to: string): void;
  /** web: sonner（`from 'sonner'` 只允许出现在 lib/host.tsx，UI §3.11.1）；app: 自绘 banner。 */
  toast(message: string, options?: ToastOptions | ToastTone): void;
}

/**
 * 兜底宿主：未挂 `UiHostProvider` 时也不抛错（Storybook / 单测 / SSR 预渲染）。
 * 只做"当前环境有就用、没有就静默"，不做任何网络请求。
 */
export const fallbackHost: UiHost = {
  kv: {
    get(k) {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage?.setItem(k, v);
      } catch {
        /* 隐私模式 / WebView 禁用 DOMStorage 时容量为 0，见 §5.6；调用方自行决定降级文案 */
      }
    },
  },
  speak(text, accent) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = accent === 'us' ? 'en-US' : accent === 'uk' ? 'en-GB' : 'en';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  },
  navigate(to) {
    if (typeof window === 'undefined') return;
    window.location.assign(to);
  },
  toast() {
    /* 无 Provider 时不弹任何东西：Toast 的呈现属宿主（§3.11.1） */
  },
};

const UiHostContext = React.createContext<UiHost>(fallbackHost);

export function UiHostProvider({
  host,
  children,
}: {
  host: UiHost;
  children: React.ReactNode;
}): React.JSX.Element {
  const value = React.useMemo<UiHost>(
    () => ({
      ...fallbackHost,
      ...host,
      kv: { ...fallbackHost.kv, ...host.kv },
    }),
    [host],
  );
  return <UiHostContext.Provider value={value}>{children}</UiHostContext.Provider>;
}

export function useHost(): UiHost {
  return React.useContext(UiHostContext);
}

/** 组件内 `host.toast(msg, 'error')` 与 `host.toast(msg, { tone, action })` 两种写法都收（§3.1 / §3.11.1）。 */
export function normalizeToastOptions(options?: ToastOptions | ToastTone): ToastOptions {
  if (!options) return {};
  if (typeof options === 'string') return { tone: options };
  return options;
}

/** UI §3.11.1 时长表：普通 3000ms / 带撤销 5000ms / 错误 6000ms。 */
export function toastDurationMs(opts: ToastOptions): number {
  if (opts.durationMs != null) return opts.durationMs;
  if (opts.tone === 'error') return 6000;
  if (opts.action) return 5000;
  return 3000;
}
