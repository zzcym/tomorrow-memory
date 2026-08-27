import { Header } from '@/components/header';
import { WordbookSidebar } from '@/components/wordbook-sidebar';

/**
 * 用户界面布局：顶部导航 + 单词本侧边栏 + 主内容区
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
      <div className="flex flex-1">
        <WordbookSidebar />
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
