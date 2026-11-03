/**
 * `@tm/ui/patterns` 二级出口（§10.3：根出口 `packages/ui/src/index.ts` 已由 T-04 预留
 * `export * from './patterns/index.js'`，本文件由 T-05 独占，不动根出口）。
 *
 * 14 件展示型业务组件 + 它们的 props 类型。**接口契约见同目录 `README.md`**：
 * 批次2 出口后签名冻结，改签名需回架构 §10.2 登记。
 *
 * 分层纪律：本目录只渲染，不请求、不读时钟、不碰宿主 API（§3.5 `ui-no-io`）；
 * 导航/存储/发音/Toast 一律经 `../host.tsx` 的 `useHost()`；文案一律 import 自 `@tm/shared`。
 */

export * from './SearchBar.js';
export * from './LookupResultBar.js';
export * from './ReviewCta.js';
export * from './RecentSearchPanel.js';
export * from './WordDetailCard.js';
export * from './Flashcard.js';
export * from './RatingBar.js';
export * from './WordbookList.js';
export * from './StatCard.js';
export * from './GrowthLine.js';
export * from './Heatmap.js';
export * from './EmptyState.js';
export * from './ConfirmSheet.js';
export * from './SkeletonBlock.js';
