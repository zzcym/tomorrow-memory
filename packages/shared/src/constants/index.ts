/**
 * `@tm/shared/constants` 出口。
 * 注意：`errors.ts` 与 `copy.ts` 是 UI §8.2-14 点名的两条专项 import 路径
 * （`@tm/shared/constants/errors`、`@tm/shared/constants/copy`），本 barrel 只是聚合便利。
 */
export * from './limits.js';
export * from './rating.js';
export * from './flags.js';
export * from './errors.js';
export * from './notice.js';
export * from './copy.js';
