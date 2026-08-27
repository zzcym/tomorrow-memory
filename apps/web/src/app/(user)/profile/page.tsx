'use client';

/**
 * 个人主页
 * - 头像、昵称、手机号
 * - 统计卡片：总单词数 / 背诵天数 / 连续打卡天数
 * - 背诵热力图（GitHub 风格，近一年）
 * - 设置：每日目标 / 修改密码 / 退出登录
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Camera, Flame, LogOut, Save, Target, BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { clearToken, clearUser, getUser, setUser } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 头像最大尺寸（base64，约 1.5MB） */
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

/** 生成近 52 周的热力图数据（按日期 → 复习次数） */
function buildHeatmap(reviewDates: string[]): { weeks: Array<Array<{ date: string; count: number }>> } {
  const counts = new Map<string, number>();
  for (const d of reviewDates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 51 * WEEK_MS);
  // 对齐到周日开始
  start.setDate(start.getDate() - start.getDay());
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  for (let w = 0; w < 53; w++) {
    const week: Array<{ date: string; count: number }> = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 24 * 60 * 60 * 1000);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      week.push({ date: key, count: counts.get(key) ?? 0 });
    }
    weeks.push(week);
  }
  return { weeks };
}

function heatColor(count: number): string {
  if (count === 0) return 'bg-muted/60';
  if (count < 2) return 'bg-primary/30';
  if (count < 4) return 'bg-primary/60';
  return 'bg-primary';
}

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter();
  const utils = trpc.useUtils();
  const user = getUser();
  const profile = trpc.profile.get.useQuery(undefined, { enabled: !!user });
  const me = trpc.auth.me.useQuery(undefined, { enabled: !!user });
  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success('已保存');
      void utils.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      toast.success('密码已更新');
      setNewPassword('');
    },
    onError: (err) => toast.error(err.message),
  });

  const [nickname, setNickname] = React.useState('');
  const [dailyGoal, setDailyGoal] = React.useState(10);
  const [newPassword, setNewPassword] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (profile.data) {
      setNickname(profile.data.nickname);
      setDailyGoal(profile.data.dailyGoal);
      setAvatar(profile.data.avatar);
    }
  }, [profile.data]);

  /** 上传头像：本地图片 → base64（压缩到 512px 内） */
  const uploadAvatar = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl.length > MAX_AVATAR_BYTES) {
          toast.error('图片过大，请选择更小的图片');
          return;
        }
        setAvatar(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  /** 保存头像并同步本地登录态（Header 立即显示） */
  const saveAvatar = (): void => {
    update.mutate(
      { avatar },
      {
        onSuccess: () => {
          if (user) {
            setUser({ ...user, avatar });
          }
          toast.success('头像已更新');
          void utils.profile.get.invalidate();
        },
      },
    );
  };

  if (!user) {
    return <p className="py-20 text-center text-muted-foreground">请先登录。</p>;
  }

  const data = profile.data;
  const heatmap = buildHeatmap(data?.reviewDates ?? []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 头部信息 + 头像设置 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatar || user.avatar || undefined} />
              <AvatarFallback className="bg-primary/15 text-primary">
                {(data?.nickname || user.phone || '?').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
              title="上传头像"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <h2 className="text-xl font-bold">{data?.nickname || '未设置昵称'}</h2>
            <p className="text-sm text-muted-foreground">{me.data?.phone ?? user.phone}</p>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="头像图片 URL（可选）"
                value={avatar.startsWith('data:') ? '' : avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" onClick={saveAvatar} disabled={avatar === (data?.avatar ?? '')}>
                保存头像
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <BookMarked className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{data?.totalWords ?? 0}</span>
            <span className="text-xs text-muted-foreground">总单词数</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{data?.reviewDays ?? 0}</span>
            <span className="text-xs text-muted-foreground">背诵天数</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6 text-center">
            <Flame className="h-5 w-5 text-primary" />
            <span className="text-3xl font-bold">{data?.streak ?? 0}</span>
            <span className="text-xs text-muted-foreground">连续打卡</span>
          </CardContent>
        </Card>
      </div>

      {/* 热力图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">背诵热力图（近一年）</CardTitle>
          <CardDescription>颜色越深代表当天复习的单词越多</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 overflow-x-auto">
            {heatmap.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.count} 词`}
                    className={`h-3 w-3 rounded-sm ${heatColor(day.count)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <div className="flex gap-2">
                <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} />
                <Button onClick={() => update.mutate({ nickname })}>保存</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">每日目标（单词数）</Label>
              <div className="flex gap-2">
                <Input
                  id="goal"
                  type="number"
                  min={1}
                  max={100}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                />
                <Button onClick={() => update.mutate({ dailyGoal })}>
                  <Target className="mr-1 h-4 w-4" />
                  保存
                </Button>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="password">修改密码</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type="password"
                placeholder="新密码（至少 4 位）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button disabled={newPassword.length < 4} onClick={() => changePassword.mutate({ password: newPassword })}>
                <Save className="mr-1 h-4 w-4" />
                修改
              </Button>
            </div>
          </div>
          <Separator />
          <Button
            variant="destructive"
            onClick={() => {
              clearToken();
              clearUser();
              toast.success('已退出登录');
              router.push('/');
              router.refresh();
            }}
          >
            <LogOut className="mr-1 h-4 w-4" />
            退出登录
          </Button>
        </CardContent>
      </Card>
      <div className="h-8" />
    </div>
  );
}
