import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/header';
import { WordbookSidebar } from '@/components/wordbook-sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: '明日记忆 · AI 单词学习',
  description: '基于 Multi-Agent 与 FSRS 间隔重复的英语单词学习应用',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <ThemeProvider>
            <div className="flex min-h-screen flex-col">
              <Header />
              <div className="flex flex-1">
                <WordbookSidebar />
                <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8">{children}</main>
              </div>
            </div>
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
