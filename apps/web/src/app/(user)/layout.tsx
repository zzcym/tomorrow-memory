import { Header } from '@/components/header';
import { UserShell } from '@/components/user-shell';

/**
 * 用户界面布局：顶部导航 + 可收起/可换位置的单词本侧边栏（UserShell 管理）+ 主内容区
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
    </div>
  );
}
