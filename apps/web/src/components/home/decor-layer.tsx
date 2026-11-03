/**
 * 首页装饰层（UI §3.1.2 B / R-22 ③）。
 *
 * 两层：低饱和品牌渐变底 + 一团顶部柔光斑（周期 = `--dur-breath` 24s，`animate-breath` 在
 * `prefers-reduced-motion: reduce` 下由 `tokens.css` 统一摘掉动画名，R-22 ④）。
 * I-04：原第三层「右下柔光斑」删除 —— 用户口述"搜索框下面一个莫名其妙的绿色圆圈"即此团
 * （深色模式下与未随 `.dark` 改写的 `--brand-50` 同值，取样差实测 104–141/255）。
 * I-07：顶部这团从 brand ramp 档（brand-100 级）换成 decor 专用档（`bg-decor-b`）——
 * `.dark` 只覆写了 `--decor-a/b/c`（`tokens.css:80`），`--brand-*` 在 `.dark` 里没有覆写（`:30` 只挂 `:root`），
 * 于是同一颗 token 深色下仍是浅绿 ⇒ 读成一个圆。浅色侧 `--decor-b` 与 `--brand-100` 逐字同值
 * （`163 36% 88%`，`tokens.css:28` vs `:30`）⇒ 浅色视觉零变化，深色自动降到与底色同族低对比。
 * ⛔ 为此给 `--brand-50/100` 补全局深色值（chip/badge/角标共用，波及面远超本单）。
 * 账面冲突（"两团柔光斑" = §3.1.2 B / R-22 ③）已登记，改判归 TPM（A-115），本文件不擅改规范口径。
 * 硬约束：`aria-hidden` + `pointer-events-none`（§3.1.1「否则算可交互元素，计数超」），
 * 且**零粒子 / 零 `<video autoplay>` / 零鼠标跟随**（R-22 ⑤）。
 * 颜色只取 token 语义类（`from-decor-a` / `bg-decor-b` 等），不写任何色值字面量（`boundaries --colors`）。
 */

export function DecorLayer(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-base overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-decor-a via-decor-b to-surface" />
      <div className="animate-breath absolute left-1/2 top-[14%] h-72 w-72 -translate-x-1/2 rounded-full bg-decor-b opacity-70 blur-3xl max-md:h-56 max-md:w-56" />
    </div>
  );
}
