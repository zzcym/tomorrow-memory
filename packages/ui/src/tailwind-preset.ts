/**
 * `@tm/ui` Tailwind preset（UI §1.12.2 / 架构 §3.2）—— 双宿主唯一映射层。
 *
 * 约定（架构 §3.2）：
 * - 本包不写任何自定义 Tailwind 插件，也不发规则型 CSS。
 * - 变量真源在 `styles/tokens.css`，本文件只做 `hsl(var(--x))` 映射；hex/rgb()/hsl() 字面量
 *   只允许出现在 UI §1.12.4 点名的三个文件里（本文件是其一，但刻意一个都不写）。
 * - 宿主配置：`presets: [tmUiPreset]` + 自己的 `content`。
 */

import type { Config } from 'tailwindcss';

/**
 * token 名 → 颜色表达式的**唯一**映射方式（UI §1.12.2）。
 * 导出给 `test/ui.spec.tsx` 反推映射层的形状，使测试不必在本文件之外再抄一份
 * CSS 函数名（那会成为 `colors-no-hardcode` 门禁的字面量命中面）。
 */
export const tokenColor = (v: string): string => `hsl(var(${v}))`;

const h = tokenColor;

const preset: Partial<Config> = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        /* ── 语义层：组件只用这一层（UI §1.1 / §1.2.1） ── */
        bg: h('--bg'),
        surface: h('--surface'),
        sunken: h('--surface-sunken'),
        ink: { DEFAULT: h('--ink'), muted: h('--ink-muted') },
        hair: h('--hair'),
        brand: {
          DEFAULT: h('--brand'),
          strong: h('--brand-strong'),
          soft: h('--brand-soft'),
          /* 品牌 ramp（UI §1.2 绿色套）：仅装饰渐变与图表用，组件不得直接取级（UI §1.12.1 注） */
          50: h('--brand-50'),
          100: h('--brand-100'),
          200: h('--brand-200'),
          300: h('--brand-300'),
          400: h('--brand-400'),
          500: h('--brand-500'),
          600: h('--brand-600'),
          700: h('--brand-700'),
          800: h('--brand-800'),
          900: h('--brand-900'),
          950: h('--brand-950'),
        },
        'on-brand': h('--on-brand'),
        focus: h('--focus'),
        success: { DEFAULT: h('--success'), soft: h('--success-soft'), 'soft-strong': h('--success-soft-strong') },
        warning: { DEFAULT: h('--warning'), soft: h('--warning-soft') },
        danger: { DEFAULT: h('--danger'), soft: h('--danger-soft') },
        chart: {
          1: h('--chart-1'),
          2: h('--chart-2'),
          3: h('--chart-3'),
          4: h('--chart-4'),
          5: h('--chart-5'),
          danger: h('--chart-danger'),
          grid: h('--chart-grid'),
          axis: h('--chart-axis'),
        },
        heat: {
          1: h('--heat-1'),
          2: h('--heat-2'),
          3: h('--heat-3'),
          4: h('--heat-4'),
          empty: 'var(--heat-empty)',
          future: 'var(--heat-future)',
        },
        decor: { a: h('--decor-a'), b: h('--decor-b'), c: h('--decor-c') },

        /* ── 过渡别名（不新增任何颜色值，全部指向同一批 token） ──
           存量 Next 页面在 T-12/T-15/T-16 整页重写前仍写 shadcn 旧类名；本块保证"换 token
           不换渲染结果"（R-22 的"零硬编码"判据不受影响：这里只有 var() 引用）。
           批次3/4 收口后整块删除 —— 见 04-dev-report-T-04「遗留项 L-2」。 */
        border: h('--hair'),
        input: h('--hair'),
        ring: h('--focus'),
        background: h('--bg'),
        foreground: h('--ink'),
        card: { DEFAULT: h('--surface'), foreground: h('--ink') },
        popover: { DEFAULT: h('--surface'), foreground: h('--ink') },
        primary: { DEFAULT: h('--brand'), foreground: h('--on-brand') },
        secondary: { DEFAULT: h('--surface-sunken'), foreground: h('--ink') },
        destructive: { DEFAULT: h('--danger'), foreground: h('--on-brand') },
        muted: { DEFAULT: h('--surface-sunken'), foreground: h('--ink-muted') },
        accent: { DEFAULT: h('--brand-soft'), foreground: h('--ink') },
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        latin: ['var(--font-latin)'],
        mono: ['var(--font-mono)'],
      },

      /* UI §1.5：`-xs` 后缀键 = 移动档（§2.1 的 xs 断点 <768px 落地值），
         组件书写方式 `text-h1 max-md:text-h1-xs`（preset 无插件，无法自动按断点切换值）。 */
      fontSize: {
        display: ['32px', { lineHeight: '1.15', letterSpacing: '-0.4px' }],
        'display-xs': ['28px', { lineHeight: '1.15', letterSpacing: '-0.4px' }],
        h1: ['22px', { lineHeight: '1.3', letterSpacing: '-0.2px' }],
        'h1-xs': ['20px', { lineHeight: '1.3', letterSpacing: '-0.2px' }],
        h2: ['18px', { lineHeight: '1.4' }],
        'h2-xs': ['17px', { lineHeight: '1.4' }],
        h3: ['16px', { lineHeight: '1.4' }],
        'h3-xs': ['15.5px', { lineHeight: '1.4' }],
        body: ['15px', { lineHeight: '1.6' }],
        '2xs': ['11px', { lineHeight: '1.45' }],
        /* 默认档覆写为同一份值（避免 text-sm 落到 Tailwind 的 14px） */
        xs: ['12px', { lineHeight: '1.55' }],
        sm: ['13px', { lineHeight: '1.6' }],
        base: ['15px', { lineHeight: '1.6' }],
        lg: ['17px', { lineHeight: '1.4' }],
        xl: ['20px', { lineHeight: '1.3', letterSpacing: '-0.2px' }],
        '2xl': ['24px', { lineHeight: '1.25' }],
        '3xl': ['30px', { lineHeight: '1.2' }],
        '4xl': ['36px', { lineHeight: '1.15' }],
      },

      /* UI §1.7：刻度内间距改为引用变量（数值与 Tailwind 默认等值 → 存量视觉零变化）。
         1.5/2.5/3.5 等半步档保留 Tailwind 默认，供 T-12/T-15 整页重写前不断链。 */
      spacing: {
        0: '0px',
        1: 'var(--sp-1)',
        2: 'var(--sp-2)',
        3: 'var(--sp-3)',
        4: 'var(--sp-4)',
        5: 'var(--sp-5)',
        6: 'var(--sp-6)',
        8: 'var(--sp-8)',
        10: 'var(--sp-10)',
        12: 'var(--sp-12)',
        16: 'var(--sp-16)',
      },

      borderRadius: {
        none: '0px',
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-xl)',
        '3xl': 'var(--r-xl)',
        full: 'var(--r-full)',
      },

      /* UI §1.9：`elev-*`（禁 shadow-md 等原生投影类；深色下 --elev-1 本身就是 none） */
      boxShadow: {
        'elev-0': 'none',
        'elev-1': 'var(--elev-1)',
        'elev-2': 'var(--elev-2)',
        'elev-brand': 'var(--elev-brand)',
      },

      /* UI §1.10：层级（禁任意值写法） */
      zIndex: {
        base: '0',
        sticky: '10',
        dock: '30',
        mask: '40',
        drawer: '50',
        dialog: '60',
        pop: '70',
        toast: '80',
        busy: '90',
      },

      /* UI §2.2 居中列（`--max-w-page` 在 UI §1.12.3 宿主覆写白名单内） */
      maxWidth: {
        auth: 'var(--max-w-auth)',
        read: 'var(--max-w-read)',
        list: 'var(--max-w-list)',
        wide: 'var(--max-wide)',
        page: 'var(--max-w-page)',
      },
      minWidth: {
        tap: 'var(--tap)',
        auth: 'var(--max-w-auth)',
      },
      /* UI §3.11.2 / §1.12.3 第 4 条：弹层高度上限收成一颗 token（老内核吃兜底 92vh，
         常青内核吃 @supports 里的 100dvh，App 宿主另覆写为每侧留距 24px）。 */
      maxHeight: { dialog: 'var(--dialog-max-h)' },
      width: { tap: 'var(--tap)', sidebar: '320px' },

      /* UI §1.7-③ / §2.4：列表底部安全留白 = tab + 安全区 + 16px（替代现网 130px 死占位） */
      padding: { 'safe-bottom': 'calc(var(--tab-h) + env(safe-area-inset-bottom) + var(--sp-4))' },
      margin: { 'safe-bottom': 'calc(var(--tab-h) + env(safe-area-inset-bottom))' },

      /* UI §1.10/§2.4 尺度层 */
      height: {
        tap: 'var(--tap)',
        search: 'var(--search-h)',
        tab: 'var(--tab-h)',
        topbar: 'var(--topbar-h)',
        field: 'var(--field-h)',
      },
      minHeight: { tap: 'var(--tap)', field: 'var(--field-h)', search: 'var(--search-h)', 'tap-stack': 'calc(var(--tap) * 2)' },

      /* UI §1.11：时长/缓动只允许表中这些（禁表外数值与任意值写法） */
      transitionDuration: {
        tap: 'var(--dur-tap)',
        micro: 'var(--dur-micro)',
        enter: 'var(--dur-enter)',
        exit: 'var(--dur-exit)',
        move: 'var(--dur-move)',
        sheet: 'var(--dur-sheet)',
        spin: 'var(--dur-spin)',
        skeleton: 'var(--dur-skeleton)',
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        instant: 'var(--dur-instant)',
      },
      animationDuration: {
        tap: 'var(--dur-tap)',
        micro: 'var(--dur-micro)',
        enter: 'var(--dur-enter)',
        exit: 'var(--dur-exit)',
        move: 'var(--dur-move)',
        sheet: 'var(--dur-sheet)',
        spin: 'var(--dur-spin)',
        skeleton: 'var(--dur-skeleton)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        decelerate: 'var(--ease-decelerate)',
        accelerate: 'var(--ease-accelerate)',
      },

      /* UI §1.11：`flip-in`（3D 翻面）不在此注册 = 删除；globals.css 的
         .perspective-1000/.preserve-3d/.backface-hidden/.rotate-y-180 四类一并删除，
         卡背切换改为"内容直接替换 + --dur-micro 淡入"。`shimmer` 周期改读 --dur-skeleton(1.4s)。 */
      keyframes: {
        breath: {
          from: { transform: 'translate3d(0, 0, 0)', opacity: '1' },
          to: { transform: 'translate3d(24px, -16px, 0)', opacity: '0.9' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        /* 对话框专用入场（T-13r / F-24 正交化）：`DialogContent` 用 Tailwind
           `translate-x-[-50%] translate-y-[-50%]` 居中，v3.4 编译成
           `transform: translate(var(--tw-translate-x), var(--tw-translate-y)) …`；动画关键帧
           整体覆写 `transform` 且 `fill-mode: both` 持久填充 ⇒ 通用 `fade-in-up`（端点写死
           `translateY(8px)`→`translateY(0)`，不含居中量）会把居中永久推掉。
           此关键帧在**两个端点都带上居中量**——经由 Tailwind 自己的 `--tw-translate-x/y`
           变量转写（对默认 DialogContent 即 -50%/-50%，端点计算值与工具类逐字同值），
           8px 位移只叠加在 y 上（UI §3.11.2「上移 8px 淡入」）。
           ⚠ 端点**不得写死** `translate(-50%, -50%)`：`more-menu.tsx` 用 className 覆写成
           `translate-x-0 translate-y-0` 做右上下拉，写死会让动画结束后仍持久持有 -50% 位移，
           打碎该覆写面（与本文件旁三位历史备选被否的同一条理由）。走变量则覆写面天然成立。
           Chrome 84 红线（App 侧 content 会扫进本文件）：只用 `translate()` + `calc()` +
           `var()` 的百分比/长度组合，不引入 dvh/svh/lvh、嵌套 min()/clamp()。 */
        'dialog-in': {
          '0%': { opacity: '0', transform: 'translate(var(--tw-translate-x), calc(var(--tw-translate-y) + 8px))' },
          '100%': { opacity: '1', transform: 'translate(var(--tw-translate-x), var(--tw-translate-y))' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        breath: 'breath var(--dur-breath) ease-in-out infinite alternate',
        shimmer: 'shimmer var(--dur-skeleton) linear infinite',
        'fade-in-up': 'fade-in-up var(--dur-enter) var(--ease-standard) both',
        'fade-in': 'fade-in var(--dur-micro) var(--ease-standard) both',
        'dialog-in': 'dialog-in var(--dur-enter) var(--ease-standard) both',
        'sheet-in': 'fade-in-up var(--dur-sheet) var(--ease-standard) both',
        spinner: 'spin var(--dur-spin) linear infinite',
      },
    },
  },
};

export default preset;
