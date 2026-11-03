/**
 * A-101 夹具（绿向）：这张文件里**只有注释在写禁令**，代码面一个字都不违犯。
 *
 * 覆盖四种"以前会把它判红"的形状：
 *  1. 块注释的**续行不带前导星号**（MeScreen 的注释体就是这种）；
 *  2. 行尾 `//` 注释里点名禁词；
 *  3. 字符串里的 `//`（URL）不许被当注释起点吃掉后半行；
 *  4. 代码里的台账引用 `A-52 #135` —— 3 位纯十进制号不是色值（`colors-no-hardcode` 的绿向）。
 *
 * 反证在 `violations/gate-truth-real/`：同一批形状写成**真代码**时必须红。
 */

/*
  下面这一段是块注释，注意行首没有星号 —— 旧口径的 NON_CODE_LINE 只认 `*` 开头的续行，
  于是这里点名的禁词「以后再说」「宽限期」「云端」会被算成运行时命中（A-32-5 的同族病）。
  连 passwordUpgradeDeadline 这个零容忍键也写在注释里，同样不许判红。
*/

// 行尾禁令的转述：这里不出现「以后再说」，也不出现"云端/本地"式内部术语。
export const FINAL_COPY = '明天再记，也不算晚。';

export const DOC_URL = 'https://tmword.example/docs/copy-policy';

export const PROVENANCE = 'PM-fix6 / T-26a 缺码回环（A-52 #135 / PRD §5.4-5）';

/** 反向声明注释：本文件不解释任何开关的业务语义，也不点名 passwordUpgradeEnforce。 */
export const LEDGER_REF = '口径见 A-86 #320，行为哨见 A-87 #325。';
