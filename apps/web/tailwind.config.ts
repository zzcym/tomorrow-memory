import type { Config } from 'tailwindcss';
import tmUiPreset from '@tm/ui/tailwind-preset';

/**
 * 宿主只做两件事：挂 `@tm/ui` preset（架构 §3.2）+ 声明 content。
 * 颜色/字号/间距/圆角/层级/动效全部来自 preset + `@tm/ui/styles/tokens.css`，
 * 这里再写一条 `theme.extend` 即视为越界（UI §1.12.3）。
 *
 * content 里同时给 workspace 直路径与 node_modules 软链路径：
 * pnpm 的 `@tm/ui` 是符号链接，部分 fast-glob 版本不跟随符号链接，两条都给可保证
 * primitives 里用到的语义类一定被扫描到（重复候选词 Tailwind 会去重，无体积代价）。
 */
const config: Config = {
  presets: [tmUiPreset],
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@tm/ui/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  plugins: [],
};

export default config;
