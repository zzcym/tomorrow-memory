/**
 * A-101 (b) 夹具（红向）：`dark:` 的**真变体**恰好 4 处 >3 ⇒ `dark-variant-budget` 必须红。
 *
 * 下面还故意混了 3 处对象键写法的 `dark:`（绿向文件 `comment-noise/apps/app/src/shape-noise.tsx`
 * 的同一种形状）。红的是变体那 4 处：detail 里变体数与键位数分别报，不许混成一个数。
 * 全部用非颜色工具名，避免和「零硬编码颜色」「tailwind 调色板」两条判据串味。
 */

const NEXT_THEME: Record<string, string> = {
  light: 'dark',
  dark: 'system',
  system: 'dark',
};

export function RealDark({ mode }: { mode: string }): string {
  const v1 = 'dark:opacity-80';
  const v2 = 'dark:shadow-none';
  const v3 = 'dark:line-clamp-2';
  const v4 = 'translate-y-1 dark:translate-y-0';
  return [v1, v2, v3, v4, NEXT_THEME[mode]].join(' ');
}
