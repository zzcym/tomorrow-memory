/**
 * 管理后台布局：独立简洁（无用户导航/侧边栏）
 * 与用户界面完全分离，仅通过 /admin 路径 + 管理员登录访问。
 */
export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* 简洁的管理顶部条 */}
      <div className="border-b bg-background">
        <div className="mx-auto flex h-12 max-w-6xl items-center px-4 text-sm font-semibold text-muted-foreground">
          <span className="text-primary">◇</span> 明日记忆 · 管理后台
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
