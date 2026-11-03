/**
 * `@tm/shared` 的唯一出口（§3.3：`index.ts` = `export * from './contracts/*.js'` 等）。
 *
 * 分层（同包也有子路径，组件按 UI §8.2-14 只 import 文案/错误那两条）：
 *  - `contracts/*`  zod 运行时契约（形状 + 校验）
 *  - `constants/*`  取值域与默认值（limits / rating 标签 / flags / errors / notice / copy）
 *  - `types`        纯类型（旧 interface 名一个不动，已派生的走 `z.infer`）
 *  - `utils`        无副作用工具（连胜计算 C-11 的唯一实现等）
 *  - `schema`       由 T-06 提供，经 `@tm/shared/schema` 子路径消费，不在此再导出
 *
 * 名字冲突纪律：一个名字**只有一个声明点**。取值集合（`RATING_VALUES` / `QUEUE_MODES` /
 * `LOOKUP_DIRECTIONS`）在 `constants/limits.ts`，契约文件只派生 schema 不重复常量。
 */

export * from './types.js';
export * from './utils.js';

/* ───────── 运行时契约（§3.3.1 四契约 + auth + review-queue） ───────── */
export * from './contracts/wordbook.js';
export * from './contracts/lookup.js';
export * from './contracts/rating.js';
export * from './contracts/review-queue.js';
export * from './contracts/profile.js';
export * from './contracts/auth.js';

/* ───────── 常量与文案单一源 ───────── */
export * from './constants/limits.js';
export * from './constants/rating.js';
export * from './constants/flags.js';
export * from './constants/errors.js';
export * from './constants/notice.js';
export * from './constants/copy.js';
