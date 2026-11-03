/**
 * A-101 夹具（红向）：真违犯就长在代码里，且故意与噪音同形。
 *
 * 这张文件是"剥注释 / 负例面 / 台账引用"三条口径的反证：
 *  - `passwordUpgradeDeadline` 出现在 `src/**` 的运行面 ⇒ `deadline-key-zero` 必须红；
 *  - 禁词 `以后再说` 是**字符串字面量**（不是注释）⇒ `copy-legacy-zero` 必须红；
 *  - 同一行既有真色值 `#22c55e` 又有台账引用 `A-52 #135` ⇒ `colors-no-hardcode` 必须红
 *    （"排除台账引用"绝不允许把同一行的真色值一起洗掉）。
 */

export const DEADLINE_KEY = 'passwordUpgradeDeadline';

export const LEGACY_COPY = '以后再说';

export const BRAND_HEX = '#22c55e';

/** 同一个**代码行**里既有台账引用又有真色值：只许排除前者，不许顺手洗掉后者。 */
export const BOTH_ON_ONE_LINE = '口径见 A-52 #135，落地色值 #22c55e';

export const SHADOW = 'rgba(0, 0, 0, 0.45)';
