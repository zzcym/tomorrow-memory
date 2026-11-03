import type { ReactNode } from 'react';
import './globals.css';
import { AuthWall } from '@tm/ui/auth';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-surface text-ink">
        <AuthWall>{children}</AuthWall>
      </body>
    </html>
  );
}

