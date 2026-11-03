/**
 * 深链与聚焦（R-20③ / R-21④ / R-21⑥）。
 *
 * Java 侧把意图写成字符串交给 `consumeLaunchFocus()`（取走即清空，名字与
 * `MainActivity.java:156` 一致）。已知取值两种形态都收：
 *  - `lookup`            —— 桌面小组件点按：直达查词 + 聚焦弹键盘（R-20③/R-21⑥）
 *  - `#/study`（hash）—— 通知点按（§5.6④ 的 `open=#/study`）
 */

import { bridge } from './bridge.js';

export type LaunchTarget = 'lookup' | 'study' | 'wordbook' | 'progress' | 'me' | '';

const TARGET_BY_PATH: Record<string, LaunchTarget> = {
  '': 'lookup',
  '/': 'lookup',
  lookup: 'lookup',
  home: 'lookup',
  study: 'study',
  wordbook: 'wordbook',
  progress: 'progress',
  me: 'me',
};

const PATH_BY_TARGET: Record<Exclude<LaunchTarget, ''>, string> = {
  lookup: '/',
  study: '/study',
  wordbook: '/wordbook',
  progress: '/progress',
  me: '/me',
};

let pending = '';

export function normalizeTarget(raw: string | null | undefined): LaunchTarget {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const stripped = value.replace(/^#/, '').replace(/^\//, '').split('?')[0] ?? '';
  return TARGET_BY_PATH[stripped] ?? TARGET_BY_PATH[`/${stripped}`] ?? '';
}

/** 原样保留的深链（指向二级页时用得上，例如 `#/word/abandon`）。 */
export function rawLaunchTarget(): string {
  return pending;
}

/** 取走即清空（与 Java 的 `launchFocus = ""` 同语义）。 */
export function consumeLaunchFocus(): LaunchTarget {
  const b = bridge();
  let fromNative = '';
  try {
    fromNative = b && b.consumeLaunchFocus ? String(b.consumeLaunchFocus() ?? '') : '';
  } catch {
    fromNative = '';
  }
  const value = fromNative || pending;
  pending = '';
  return normalizeTarget(value);
}

/** 无 Bridge（浏览器 dev / 单测）时由 `window.__app.openTarget()` 写入。 */
export function setLaunchFocus(target: string): void {
  const b = bridge();
  try {
    if (b && b.setLaunchFocus) {
      b.setLaunchFocus(target);
      return;
    }
  } catch {
    /* §5.6 的新方法在 T-20 之前可能不存在 */
  }
  pending = target;
}

export function targetToPath(target: LaunchTarget): string | null {
  if (!target) return null;
  return PATH_BY_TARGET[target];
}

/* ── 搜索框聚焦：R-20③ 的"弹键盘"必须等查词页挂载后做，这里留一次性令牌 ── */

let focusSearchOnce = false;

export function requestSearchFocus(): void {
  focusSearchOnce = true;
}

/** T-17 的 `LookupScreen` 挂载后调用一次（配合 `SearchBar.focus()`，§5.4⑥）。 */
export function takeSearchFocusRequest(): boolean {
  const value = focusSearchOnce;
  focusSearchOnce = false;
  return value;
}
