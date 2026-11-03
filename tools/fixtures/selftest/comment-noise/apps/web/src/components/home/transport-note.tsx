/**
 * A-101 (a) 夹具（绿向）：首页传输面的"禁令自述"。
 *
 * 这个文件在注释里点名 `fetch(` 与 localStorage（判据⑤ 的原文转述），代码面一个字都不碰：
 * 真实传输唯一走 `@/lib/trpc`。旧口径把这种反向声明算成越界命中（`web-home-transport` 的 7 处红
 * 全是这一类），A-101(a) 之后必须绿，且注释命中要在 detail 里报出来。
 */

/*
  为什么这里不写 fetch(：首页不许自己发请求，也不许自己读 localStorage。
  同理 XMLHttpRequest 与 axios 都不许在这里出现。
*/

// 反向声明：本文件 0 处裸 fetch(，0 处 localStorage 读写。
export const HOME_TRANSPORT_NOTE = '传输唯一走 @/lib/trpc';
