'use client';

/**
 * 顶部导航栏
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Moon, Sun, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/components/theme-provider';
import { LoginDialog } from '@/components/login-dialog';
import { clearToken, clearUser, getToken, getUser } from '@/lib/auth';

const NAV_ITEMS = [
  { href: '/', label: '查词' },
  { href: '/study', label: '背单词' },
  { href: '/assess', label: '测评' },
  { href: '/report', label: '分析' },
  { href: '/chat', label: 'AI 对话' },
  { href: '/profile', label: '我的' },
];

export function Header(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    setAuthed(!!getToken());
  }, [pathname]);

  const logout = (): void => {
    clearToken();
    clearUser();
    setAuthed(false);
    toast.success('已退出登录');
    router.push('/');
    router.refresh();
  };

  const user = getUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-primary">
          <Sparkles className="h-5 w-5" />
          <span>明日记忆</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                pathname === item.href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {authed ? (
            <div className="flex items-center gap-2">
              <Link href="/profile" className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.avatar || undefined} />
                  <AvatarFallback className="bg-primary/15 text-xs text-primary">
                    {(user?.nickname || user?.phone || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground hover:text-foreground">
                  {user?.nickname || user?.phone || '我的'}
                </span>
              </Link>
              <Button variant="outline" size="sm" onClick={logout}>
                退出
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setLoginOpen(true)}>
              <BookOpen className="mr-1 h-4 w-4" />
              登录
            </Button>
          )}
        </div>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onLoggedIn={() => setAuthed(true)} />
    </header>
  );
}
