import type { Config } from 'tailwindcss';
import tmUiPreset from '@tm/ui/tailwind-preset';

/**
 * T-14（架构 §3.2 右列）：与 Web 共用同一 preset，宿主只提供 `content`。
 * `../../packages/ui/src/**` 必须在列 —— `@tm/ui` 是源码直出包，不扫它就没有任何语义类被产出。
 */
export default {
  presets: [tmUiPreset as Config],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
