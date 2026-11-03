import { FLAG_DEFAULTS } from '@tm/shared';

/** 定义/种子的唯一出口（§6.4-2 步 8）。读取点受 §4.7 约束，不在业务代码里散读。 */
export const definitions = { ...FLAG_DEFAULTS };
export const seedRows = Object.entries(definitions).map(([key, value]) => ({ key, value }));
