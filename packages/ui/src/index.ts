/**
 * `@tm/ui` 根出口（架构 §3.1 / §10.3：本文件 T-04 之后归 T-04 独占，
 * T-05/T-13 只改各自的二级出口 `patterns/index.ts`、`auth/index.ts`，无人抢改根出口）。
 *
 * 分层：
 *  - `styles/tokens.css`  变量层（唯一颜色真源，宿主 `@import`）
 *  - `tailwind-preset`    映射层（语义类）
 *  - `primitives/*`       基元（§10.2 T-04 清单的 13 个 + 原件里的 textarea）
 *  - `host.tsx`           UiHost（宿主能力注入面，§3.1）
 *  - `hooks/*`            主题切换 / 发音 / 最近查询
 *  - `patterns/*`、`auth/*`  批次2 的 T-05 / T-13（下面两行即 §10.4 第 4 行要求的预留出口）
 */

/* ── 宿主注入面（架构 §3.1） ── */
export * from './host.js';

/* ── 基元 ── */
export * from './primitives/button.js';
export * from './primitives/card.js';
export * from './primitives/input.js';
export * from './primitives/textarea.js';
export * from './primitives/label.js';
export * from './primitives/badge.js';
export * from './primitives/separator.js';
export * from './primitives/skeleton.js';
export * from './primitives/progress.js';
export * from './primitives/dialog.js';
export * from './primitives/avatar.js';
export * from './primitives/tabs.js';
export * from './primitives/switch.js';
export * from './primitives/scroll-area.js';

/* ── hooks ── */
export * from './hooks/use-theme-toggle.js';
export * from './hooks/use-speak.js';
export * from './hooks/use-recent-searches.js';

/* ── 批次2 预留（T-05 patterns / T-13 auth；占位文件由各任务覆写） ── */
export * from './patterns/index.js';
export * from './auth/index.js';
