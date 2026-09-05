'use client';

/**
 * 后台管理页
 * - 管理员登录（401 → 回登录态；网络/服务错误独立提示）
 * - 统计面板：总用户数 / 今日新增 / 人均单词数
 * - 用户列表（分页）
 */

import * as React from 'react';
import { ShieldCheck, Users, UserPlus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AdminStats {
  totalUsers: number;
  usersToday: number;
  totalWords: number;
  avgWords: number;
}

interface AdminUser {
  id: number;
  phone: string;
  created_at: number;
  word_count: number;
  last_active: number | null;
  nickname: string | null;
  avatar: string | null;
}

const ADMIN_TOKEN_KEY = 'tm_admin_token';

export default function AdminPage(): React.JSX.Element {
  const [token, setToken] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState('');
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loadingPage, setLoadingPage] = React.useState(false);
  const pageSize = 20;

  React.useEffect(() => {
    setToken(localStorage.getItem(ADMIN_TOKEN_KEY));
  }, []);

  /** 统一处理后台接口失败：401 清 token 回登录，其余 toast 提示 */
  const handleFetchError = (t: string, status: number): void => {
    if (status === 401) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setToken(null);
      toast.error('管理员登录已过期，请重新登录');
    } else {
      toast.error(`加载失败（${status}），请稍后重试`);
    }
    void t;
  };

  const fetchStats = React.useCallback(async (t: string): Promise<void> => {
    try {
      const r = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) setStats((await r.json()) as AdminStats);
      else handleFetchError(t, r.status);
    } catch {
      toast.error('网络错误，无法加载统计');
    }
  }, []);

  const fetchUsers = React.useCallback(
    async (t: string, p: number): Promise<void> => {
      try {
        const r = await fetch(`/api/admin/users?page=${p}&pageSize=${pageSize}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (r.ok) {
          const j = (await r.json()) as { total: number; users: AdminUser[] };
          setUsers(j.users);
          setTotal(j.total);
          setPage(p);
        } else {
          handleFetchError(t, r.status);
        }
      } catch {
        toast.error('网络错误，无法加载用户列表');
      }
    },
    [pageSize],
  );

  React.useEffect(() => {
    if (!token) return;
    void fetchStats(token);
    void fetchUsers(token, 1);
  }, [token, fetchStats, fetchUsers]);

  const login = async (): Promise<void> => {
    setLoggingIn(true);
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        const j = (await r.json()) as { token: string };
        localStorage.setItem(ADMIN_TOKEN_KEY, j.token);
        setToken(j.token);
        toast.success('管理员登录成功');
      } else if (r.status === 429) {
        toast.error('尝试过于频繁，请稍后再试');
      } else if (r.status === 401) {
        toast.error('密码错误');
      } else {
        toast.error(`登录失败（${r.status}），请稍后重试`);
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setLoggingIn(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-sm py-24">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              管理员登录
            </CardTitle>
            <CardDescription>请输入管理密码以查看后台数据</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="管理密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void login()}
            />
            <Button className="w-full" onClick={() => void login()} disabled={loggingIn || !password}>
              {loggingIn ? '登录中…' : '登录'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">后台管理</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
            setToken(null);
          }}
        >
          退出管理
        </Button>
      </div>

      {/* 统计面板 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{stats?.totalUsers ?? '-'}</span>
            <span className="text-xs text-muted-foreground">总用户数</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <UserPlus className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{stats?.usersToday ?? '-'}</span>
            <span className="text-xs text-muted-foreground">今日新增</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{stats?.totalWords ?? '-'}</span>
            <span className="text-xs text-muted-foreground">单词本总数</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{stats?.avgWords ?? '-'}</span>
            <span className="text-xs text-muted-foreground">人均单词数</span>
          </CardContent>
        </Card>
      </div>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">用户列表</CardTitle>
          <CardDescription>共 {total} 位用户</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">#{u.id}</Badge>
                  <div>
                    <p className="text-sm font-medium">{u.nickname || '未设置昵称'}</p>
                    <p className="text-xs text-muted-foreground">{u.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{u.word_count} 词</span>
                  <span>{new Date(u.created_at).toLocaleDateString()}</span>
                  {u.last_active && <span>最近活跃 {new Date(u.last_active).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1 || loadingPage} onClick={() => { setLoadingPage(true); void fetchUsers(token, page - 1).finally(() => setLoadingPage(false)); }}>
              上一页
            </Button>
            <span className="text-xs text-muted-foreground">第 {page} 页</span>
            <Button variant="outline" size="sm" disabled={page * pageSize >= total || loadingPage} onClick={() => { setLoadingPage(true); void fetchUsers(token, page + 1).finally(() => setLoadingPage(false)); }}>
              下一页
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="h-8" />
    </div>
  );
}
