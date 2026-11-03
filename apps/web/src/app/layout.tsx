import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { UpgradeGate } from '@/components/upgrade-gate';
import { WebUiHostProvider } from '@/lib/host';
import './globals.css';

export const metadata: Metadata = {
  title: '明日记忆 · AI 单词学习',
  description: '基于 Multi-Agent 与 FSRS 间隔重复的英语单词学习应用',
};

/**
 * UI §2.4：`viewport-fit=cover` + `maximum-scale=5`（禁 `user-scalable=no` / `maximum-scale=1`）。
 * §2.4 另要求两条带 `media` 的 `<meta name="theme-color">`（浅/深各一条，值即 §1.3 的 `--bg`），
 * 与 §1.12.4"hex 只允许出现在 tokens.css / tailwind-preset.ts / colors.xml 三个文件"直接冲突，
 * 且 Next 的 `Viewport.themeColor` 不支持 `media` 字段 → 本批次**不写 themeColor**，
 * 冲突与两种可选解法已登记在 `04-dev-report-T-04.md` 的"待裁决"一节，交 T-22/T-23 收口。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

/**
 * 首帧主题（UI §5.3-1 / 架构 §3.4）：**同步内联**脚本，读偏好键 → 决定 `.dark` 与 `color-scheme`。
 * 判据与 `@tm/ui` 的 `applyTheme()` 逐行相同（`dark || (system && prefers-dark)`）；
 * 之所以在宿主里再留一份字符串，是因为它必须在 React 水合之前跑完（客户端模块常量在 SSR
 * 阶段取不到、也拿不到 `localStorage`），这正是"闪一下白"的根因所在。
 * 根 `<html>` 的 `suppressHydrationWarning` 只覆盖这一处预期差异（§5.3-1 末句）。
 */
const THEME_INIT_SCRIPT =
  "(function(){try{var k='tm:theme';var m=localStorage.getItem(k);m=(m==='light'||m==='dark')?m:'system';" +
  "var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();";

/**
 * 根布局：仅骨架（首帧主题脚本 / Providers / UiHost / Toast）
 * 用户界面 → (user)/layout.tsx（Header + 单词本侧边栏）
 * 管理后台 → admin/layout.tsx（独立简洁布局）
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <Providers>
          <UpgradeGate>
            <WebUiHostProvider>{children}</WebUiHostProvider>
            <Toaster position="top-center" richColors />
          </UpgradeGate>
        </Providers>
      </body>
    </html>
  );
}
