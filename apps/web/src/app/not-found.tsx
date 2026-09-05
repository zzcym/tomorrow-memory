import Link from 'next/link';

/**
 * 全局 404 页
 */
export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-bold">页面不存在</h2>
      <p className="text-sm text-muted-foreground">你访问的页面不存在或已被移动。</p>
      <Link href="/" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
        回到查词首页
      </Link>
    </div>
  );
}
