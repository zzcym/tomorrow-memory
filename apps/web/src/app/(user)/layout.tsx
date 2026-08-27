import Link from 'next/link';
import { Header } from '@/components/header';
import { UserShell } from '@/components/user-shell';

/**
 * 用户界面布局：顶部导航 + 可收起/可换位置的单词本侧边栏（UserShell 管理）+ 主内容区
 * 页脚展示 ICP 备案号（《互联网信息服务管理办法》合规要求）
 * （管理后台在 /admin 使用独立布局，不在此布局内）
 */
export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <UserShell>{children}</UserShell>
      {/* 备案信息页脚 */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <Link
          href="https://beian.miit.gov.cn"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          赣ICP备2026013161号-1
        </Link>
      </footer>
    </div>
  );
}
