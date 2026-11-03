/**
 * A-101 (b) 夹具（绿向）：`dark:` 与 `!important` 的**非样式形状**写法一律不计红，但必须被报出来。
 *
 * 这张文件故意把两种禁字写成"取证的字面量"而不是类名/声明：
 *  - `dark:` 出现在 TS 对象键与标签表里（值前面是空格或引号）—— 出现 5 次，仍须绿；
 *  - `!important` 出现在正则探针与测试串里 —— 出现 3 次，仍须绿。
 * 反证在 `violations/gate-truth-real/`：真变体 >3、真声明 >1 都必须红。
 */

const NEXT_THEME: Record<string, string> = {
  light: 'dark',
  dark: 'system',
  system: 'dark',
};

const THEME_MODE_LABELS = { light: '浅色', dark: '深色', system: '跟随系统' };

const INLINE_LABELS: Record<string, string> = { dark: '深色', light: '浅色' };

/** 反向哨：拿禁字本身当探针正则，不是往样式里写权限。 */
const IMPORTANT_PROBE = /primary-rate|!important/;
const NOT_IMPORTANT = '本包不写 `!important`，长串一律 truncate/line-clamp';
export const ASSERT_SHAPE = (s: string) => !/!important/.test(s);

export function NoiseProbe({ mode }: { mode: string }): string {
  return [NEXT_THEME[mode], THEME_MODE_LABELS[mode], INLINE_LABELS[mode], IMPORTANT_PROBE.source, NOT_IMPORTANT, ASSERT_SHAPE(mode)].join('|');
}
