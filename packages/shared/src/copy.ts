/**
 * 任务书与部分调用点用的是 `@tm/shared/copy` 这个短路径；
 * 真实落点按 UI §6 preamble 在 `constants/copy.ts`（与 `constants/errors.ts` 并列的文案单一源）。
 * 本文件只做再导出，**不含任何文案字面量**，以免出现第二份副本。
 */
export * from './constants/copy.js';
