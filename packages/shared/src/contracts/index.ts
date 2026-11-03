/**
 * `@tm/shared/contracts` 出口（§4.1 搬迁纪律："procedure 声明 + zod 入参 parse"改从这里 import）。
 * 逐个显式再导出，不用 `export *`：这样任何一份契约的新键都要在这里过一次手，便于审阅。
 */
export * from './wordbook.js';
export * from './lookup.js';
export * from './rating.js';
export * from './review-queue.js';
export * from './profile.js';
export * from './auth.js';
