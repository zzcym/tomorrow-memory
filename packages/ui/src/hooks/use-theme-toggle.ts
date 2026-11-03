'use client';

/**
 * 主题切换（UI §5.3-3 / 架构 §3.4）。
 *
 * 职责边界（D-3 / R-22 ①）：**只负责"切换 + 落盘"，不负责首帧**。
 * 首帧由宿主的内联同步脚本决定（Web：`apps/web/src/app/layout.tsx` 的 `<head>`；
 * App：`apps/app/index.html`，T-14），因为 effect 里改类必然晚于首帧 → 必闪白。
 * 偏好键两端同名（见下方 `THEME_STORAGE_KEY` 的唯一声明），值域 `light|dark|system`（默认 `system`）。
 */
import * as React from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

/** 唯一偏好键（UI §5.3-4：Web/App 同名，禁止第二份）。 */
export const THEME_STORAGE_KEY = 'tm:theme';

const isThemeMode = (v: string | null): v is ThemeMode => v === 'light' || v === 'dark' || v === 'system';

export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 唯一的"落地"函数：改 `<html>` 的 class + `color-scheme`，不重载页面（UI §5.3-3）。
 * 与首帧内联脚本判定逻辑逐行相同 —— 两边都必须走 `dark || (system && prefers-dark)`。
 */
export function applyTheme(mode: ThemeMode): boolean {
  if (typeof document === 'undefined') return false;
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* WebView 禁用 DOMStorage 时（§5.6）只丢持久化，当次切换仍然生效 */
  }
  return dark;
}

export interface UseThemeToggle {
  theme: ThemeMode;
  /** 当前**实际生效**档位（`system` 时跟随媒体查询）。 */
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  /** 兼容存量两处调用点（`apps/web` 顶栏）：light ↔ dark 直接翻转，跳过 system。 */
  toggle: () => void;
}

export function useThemeToggle(): UseThemeToggle {
  const [theme, setThemeState] = React.useState<ThemeMode>(() => readStoredTheme());
  const [systemDark, setSystemDark] = React.useState<boolean>(() => systemPrefersDark());

  /** `system` 档要跟随系统变化（UI §5.3-4）。 */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    setSystemDark(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  /** 首帧脚本可能已经加了 `.dark`，这里只做一次同步，不产生"先白后暗"的额外帧。 */
  React.useEffect(() => {
    const actual = document.documentElement.classList.contains('dark');
    if (actual !== isDark) applyTheme(theme);
  }, [isDark, theme]);

  const setTheme = React.useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
  }, []);

  const toggle = React.useCallback(() => {
    setThemeState((prev) => {
      const effective = prev === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : prev;
      const next: ThemeMode = effective === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, isDark, setTheme, toggle };
}

/** 旧 `useTheme()` 的兼容名（`apps/web` 顶栏在 T-12 之前仍以 `{ theme, toggle }` 解构）。 */
export const useTheme = useThemeToggle;
