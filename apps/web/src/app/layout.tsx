import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: '明日记忆 · AI 单词学习',
  description: '基于 Multi-Agent 与 FSRS 间隔重复的英语单词学习应用',
};

/**
 * 根布局：仅骨架（Providers / 主题 / Toast）
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
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <ThemeProvider>{children}</ThemeProvider>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
