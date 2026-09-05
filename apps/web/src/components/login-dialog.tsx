'use client';

/**
 * 登录 / 注册弹窗（验证码或密码）
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { setToken, setUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LoginDialog({
  open,
  onOpenChange,
  onLoggedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoggedIn?: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [mode, setMode] = React.useState<'code' | 'password'>('code');
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [cooldown, setCooldown] = React.useState(0);

  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setToken(data.token);
      setUser({ phone: data.phone, nickname: data.nickname, avatar: data.avatar, hasPassword: data.hasPassword });
      toast.success('登录成功');
      onOpenChange(false);
      onLoggedIn?.();
      void utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendCode = trpc.auth.sendCode.useMutation({
    onSuccess: () => {
      // 开发环境提示查看后端控制台；绝不向终端用户展示任何后门码
      const devHint = process.env.NODE_ENV !== 'production' ? '（开发模式：验证码见后端控制台）' : '';
      toast.success(`验证码已发送${devHint}`);
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) clearInterval(timer);
          return c - 1;
        });
      }, 1000);
      cooldownTimerRef.current = timer;
    },
    onError: (err) => toast.error(err.message),
  });

  // 卸载时清理倒计时，避免弹窗关闭后仍 setState
  const cooldownTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    login.mutate({ phone, code: mode === 'code' ? code : undefined, password: mode === 'password' ? password : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>登录 / 注册</DialogTitle>
          <DialogDescription>使用手机号登录，未注册将自动创建账号</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">手机号</Label>
            <Input
              id="phone"
              placeholder="请输入手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          {mode === 'code' ? (
            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <div className="flex gap-2">
                <Input
                  id="code"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={cooldown > 0 || sendCode.isPending}
                  onClick={() => sendCode.mutate({ phone })}
                >
                  {cooldown > 0 ? `${cooldown}s` : sendCode.isPending ? '发送中…' : '发送验证码'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="密码（至少 4 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <Button
            type="button"
            variant="link"
            className="px-0 text-xs"
            onClick={() => setMode((m) => (m === 'code' ? 'password' : 'code'))}
          >
            {mode === 'code' ? '使用密码登录' : '使用验证码登录'}
          </Button>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? '登录中…' : '登录'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
