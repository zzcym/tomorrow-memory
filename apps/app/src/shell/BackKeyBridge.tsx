/**
 * 返回键桥（R-18 ④ / §5.6 ⑤）。
 *
 * 职责只有一件事：**把两个 JS 入口挂到 `window` 上**，并把每次返回动作的判定结果
 * 交给调用方（用于诊断与单测断言）。语义判断全在 `router.handleSystemBack()` 的单一实现里：
 *  - `window.__router.canGoBack()` → boolean（**冻结名**，T-20 的 Java `evaluateJavascript` 调它）
 *  - `window.onAndroidBack()` → string（旧手写版同名钩子；返回值含 `exit` 时原生才动）
 *
 * 不渲染任何 DOM。
 */

import * as React from 'react';
import { installRouterGlobals, type SystemBackAction } from '../router.js';

export interface BackKeyBridgeProps {
  /** 每次原生问返回键时回调一次判定结果（单测 / 诊断用；不做用户可见呈现）。 */
  onBackAction?: (action: SystemBackAction) => void;
}

export function BackKeyBridge({ onBackAction }: BackKeyBridgeProps): React.JSX.Element | null {
  React.useEffect(() => {
    installRouterGlobals();
    if (!onBackAction || typeof window === 'undefined') return;
    const previous = window.onAndroidBack;
    window.onAndroidBack = (): string => {
      const value = typeof previous === 'function' ? previous() : 'confirm-exit';
      onBackAction(value as SystemBackAction);
      return value;
    };
    return () => {
      if (typeof previous === 'function') window.onAndroidBack = previous;
    };
  }, [onBackAction]);

  return null;
}
