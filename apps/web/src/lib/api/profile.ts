/**
 * 「我的」与账号域的**传输与视图投影**层（§10.2 T-15 行 🆕`lib/api/profile.ts`）。
 *
 * 传输唯一走 `@/lib/trpc`（`web-home-transport` 对 `lib/api/**` 禁 `fetch(` / `localStorage`）。
 * 这里集中三件本来会散落到四个组件里的事：
 * 1. **键名口径**：`profile.get` 同时带 `daily_goal`（canonical）与 `dailyGoal`（唯一别名，
 *    生成点 = `@tm/shared` 的 `profileDtoLegacyAlias`）。本文件只读 canonical 键，
 *    页面拿到的视图里只有一个 `dailyGoal` 数字，不会再出现"读哪一个"的分歧（R-04③）。
 * 2. **头像上限**：`AVATAR_MAX_SIDE_PX`(200) 与 `AVATAR_MAX_BYTES`(300KB) 只从 `@tm/shared` 取，
 *    像素缩放与体积判定同处一次（R-04①⑥；现网那份 1.5MB/512px 的私有上限随本次重写删除）。
 * 3. **打卡口径**：完成页、「我的」常驻区、tab 红点三处读的是**同一个** `checkin.status`
 *    查询（R-13⑥ 同一时刻相等）。
 */

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_SIDE_PX,
  AUTH_COPY,
  CHECKIN_COPY,
  DAILY_GOAL_LABELS,
  SETTINGS_COPY,
  VERBS,
  WORDBOOK_COPY,
  decodedDataUrlBytes,
  getDateStr,
  maskPhone,
} from '@tm/shared';
import { trpc } from '@/lib/trpc';
import { clearToken, clearUser, getUser, setUser, type StoredUser } from '@/lib/auth';
import { useAuthed } from '@/lib/use-auth';

/* ───────── 宿主注入串 ─────────
 * UI §3.8.4 逐字给出头像三条错误人话，`@tm/shared` 现在只有第一条
 * （`SETTINGS_COPY.avatar.tooLarge` = `TM_ERRORS.AVATAR_TOO_LARGE.copy`）。
 * 后两条按 §3.8.4 原文由宿主给，并已进 T-15 报告的「shared 缺常量」清单（U-4）；
 * 补齐后本块整体删除，页面不动。
 */
const HOST_PROFILE_COPY = {
  avatarBadFormat: '这张图片打不开，换一张试试',
  avatarUploadFail: '头像没传上去，你的账号其他内容不受影响',
  avatarUploaded: '头像已更新',
  pageHeading: '我的',
  sectionStats: '学习情况',
  statWords: '词本',
  statReviewDays: '累计复习',
  statStreak: '连续',
  unitWords: '词',
  unitDays: '天',
  goStudy: VERBS.goStudy,
  nicknameRow: '昵称',
  nicknameSave: SETTINGS_COPY.dailyGoal.save,
  nicknameSaved: '昵称已更新',
  historyRow: '我的查询历史',
  reminderRow: SETTINGS_COPY.reminder.label,
  appearanceRow: '外观',
  securityRow: AUTH_COPY.changePassword.title,
  aboutRow: '关于',
  autoFavoriteRow: '查词后自动收藏',
  autoFavoriteHint: '打开后每次查到新词都会直接进单词本',
  unitSuffix: DAILY_GOAL_LABELS.unit,
  goalMin: 5,
  goalMax: 50,
  goalStep: 5,
  /**
   * §3.8.5「拉取失败」错误卡两串。shared 现在只有 §3.7 那份 `PROGRESS_COPY.fail`
   * （主语是"学习情况"），「我的」页的主语是"账号信息"，两者不是一个状态，不复用。
   */
  loadFailTitle: '账号信息没拿到',
  loadFailBody: '检查网络后再试一次，你的数据没有改动。',
} as const;

/** 分区 F 的同步状态一句（§3.8.1 末行：全站只出现一次的人话）。 */
const SYNC_TEXT = WORDBOOK_COPY.syncBadge;

/* ───────── 概览（分区 B/C/D） ───────── */

export interface ProfileOverview {
  signedIn: boolean;
  pending: boolean;
  failed: boolean;
  local: StoredUser | null;
  nickname: string;
  /** 脱敏手机号（§3.8.1 分区 B：`138****8000`）。 */
  phone: string;
  avatar: string;
  /** canonical `daily_goal`。 */
  dailyGoal: number;
  totalWords: number;
  reviewDays: number;
  streak: number;
  checkedIn: boolean;
  doneToday: number;
  dueToday: number;
  reviewDates: readonly string[];
  /** R-40：`pw_policy_version` 为 0 ⇒ 「修改密码」行挂待办点。 */
  needsPasswordUpgrade: boolean;
  retry: () => void;
}

export function useProfileOverview(): ProfileOverview {
  const signedIn = useAuthed();
  const [local, setLocal] = React.useState<StoredUser | null>(null);
  React.useEffect(() => setLocal(getUser()), [signedIn]);

  const profile = trpc.profile.get.useQuery(undefined, { enabled: signedIn, refetchOnWindowFocus: false });
  const checkin = trpc.checkin.status.useQuery(undefined, { enabled: signedIn, refetchOnWindowFocus: false });
  const data = profile.data;

  return {
    signedIn,
    pending: signedIn && profile.fetchStatus === 'fetching' && !data,
    failed: signedIn && profile.isError,
    local,
    nickname: data?.nickname ?? local?.nickname ?? '',
    phone: maskPhone(data?.phone ?? local?.phone ?? ''),
    avatar: data?.avatar ?? local?.avatar ?? '',
    dailyGoal: data?.daily_goal ?? 0,
    totalWords: data?.totalWords ?? 0,
    reviewDays: data?.reviewDays ?? 0,
    streak: data?.streak ?? checkin.data?.streak ?? 0,
    checkedIn: checkin.data?.checkedIn ?? false,
    doneToday: checkin.data?.doneToday ?? 0,
    dueToday: checkin.data?.dueToday ?? 0,
    reviewDates: data?.reviewDates ?? [],
    needsPasswordUpgrade: data ? data.pwPolicyVersion === 0 : false,
    retry: () => void profile.refetch(),
  };
}

/* ───────── 每日目标：滑杆 + 明确保存（§3.8.3 / R-19②） ───────── */

export interface DailyGoalEditor {
  value: number;
  dirty: boolean;
  saving: boolean;
  change: (next: number) => void;
  /** 返回 `false` 表示没保存成功，调用方据此决定要不要留在本页。 */
  save: (onSaved?: () => void) => boolean;
  failed: boolean;
  clearFailure: () => void;
}

export function useDailyGoal(
  serverValue: number,
  toast: (message: string, tone?: 'info' | 'success' | 'error') => void,
): DailyGoalEditor {
  const utils = trpc.useUtils();
  const [value, setValue] = React.useState(serverValue);
  const [saved, setSaved] = React.useState(serverValue);
  const [failed, setFailed] = React.useState(false);

  // 服务端值到手（首屏 / 别的页面改过）才跟进，避免用户正在拖时被覆盖。
  React.useEffect(() => {
    if (serverValue > 0 && serverValue !== saved) {
      setSaved(serverValue);
      setValue(serverValue);
    }
  }, [serverValue, saved]);

  const update = trpc.profile.update.useMutation({
    onSuccess: (data) => {
      setSaved(data.daily_goal);
      setValue(data.daily_goal);
      setFailed(false);
      toast(SETTINGS_COPY.dailyGoal.savedToast(data.daily_goal), 'success');
      void utils.profile.get.invalidate();
      void utils.checkin.status.invalidate();
    },
    onError: () => setFailed(true),
  });

  return {
    value,
    dirty: value !== saved,
    saving: update.isPending,
    change: setValue,
    failed,
    clearFailure: () => setFailed(false),
    save: (onSaved) => {
      if (value === saved) return true;
      update.mutate({ daily_goal: value }, { onSuccess: () => onSaved?.() });
      return true;
    },
  };
}

/* ───────── 打卡常驻区（判据② / R-13③④⑤） ───────── */

export interface CheckinCard {
  checkedIn: boolean;
  streak: number;
  /** 今天已背数（判据② 的「今天已打卡·连续 N 天」与进度条同源，R-13⑥）。 */
  doneToday: number;
  /** 每日目标（同一份 `checkin.status`，不再开第二个查询）。 */
  dailyGoal: number;
  pending: boolean;
  failed: boolean;
  checkIn: () => void;
  retry: () => void;
}

export function useCheckin(): CheckinCard {
  const utils = trpc.useUtils();
  const status = trpc.checkin.status.useQuery(undefined, { refetchOnWindowFocus: false });
  const create = trpc.checkin.create.useMutation({
    onSuccess: () => {
      void utils.checkin.status.invalidate();
      void utils.profile.get.invalidate();
    },
  });
  const checkIn = React.useCallback(() => {
    if (status.data?.checkedIn) return;
    create.mutate();
  }, [create, status.data]);

  return {
    checkedIn: status.data?.checkedIn ?? false,
    streak: status.data?.streak ?? 0,
    doneToday: status.data?.doneToday ?? 0,
    dailyGoal: status.data?.dailyGoal ?? 0,
    pending: create.isPending,
    failed: create.isError,
    checkIn,
    retry: checkIn,
  };
}

export const CHECKIN_TEXT = CHECKIN_COPY;

/* ───────── 头像：只能从相册选（§3.8.4 / R-04） ───────── */

export interface AvatarOutcome {
  ok: boolean;
  /** 直接可上 toast 的人话；`null` = 成功。 */
  message: string | null;
  dataUrl?: string;
}

/**
 * 选图 → 居中裁方 → 缩到 `AVATAR_MAX_SIDE_PX` → 压 JPEG → 体积按**解码后字节**判 `AVATAR_MAX_BYTES`。
 * 超限不再降质量硬塞，直接给人话错误（R-04② 要求的是那句 300KB 的话，不是一个更小的图）。
 */
export async function compressAvatar(file: File): Promise<AvatarOutcome> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, message: HOST_PROFILE_COPY.avatarBadFormat };
  }
  const dataUrl = await readFile(file);
  if (!dataUrl) return { ok: false, message: HOST_PROFILE_COPY.avatarBadFormat };

  const square = await drawSquare(dataUrl).catch(() => null);
  if (!square) return { ok: false, message: HOST_PROFILE_COPY.avatarBadFormat };
  if (decodedDataUrlBytes(square) > AVATAR_MAX_BYTES) {
    return { ok: false, message: SETTINGS_COPY.avatar.tooLarge };
  }
  return { ok: true, message: null, dataUrl: square };
}

function readFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function drawSquare(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_MAX_SIDE_PX;
      canvas.height = AVATAR_MAX_SIDE_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_MAX_SIDE_PX,
        AVATAR_MAX_SIDE_PX,
      );
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('image'));
    img.src = dataUrl;
  });
}

/**
 * 上传头像 + 5 秒内三处一致（R-04④）：写成功后同时更新
 * `profile` 查询缓存与 `getUser()/setUser()` 的会话镜像，顶栏不用等重渲染周期就跟上。
 */
export function useAvatarUpload(toast: (message: string, tone?: 'info' | 'success' | 'error') => void): {
  upload: (dataUrl: string) => void;
  remove: () => void;
  busy: boolean;
} {
  const utils = trpc.useUtils();
  // `profile.update` 的回包只有 `{ok, daily_goal}`（`profile-service.ts:229-238`），
  // 所以会话镜像写的是**提交的那一份**，而不是回读。
  const mirror = (avatar: string): void => {
    const session = getUser();
    if (session) setUser({ ...session, avatar });
  };
  const update = trpc.profile.update.useMutation({
    onSuccess: (_data, variables) => {
      mirror(variables.avatar ?? '');
      void utils.profile.get.invalidate();
      toast(HOST_PROFILE_COPY.avatarUploaded, 'success');
    },
    onError: () => toast(HOST_PROFILE_COPY.avatarUploadFail, 'error'),
  });
  return {
    busy: update.isPending,
    upload: (dataUrl) => update.mutate({ avatar: dataUrl }),
    remove: () => update.mutate({ avatar: '' }),
  };
}

/* ───────── 昵称（§3.8.1 F 区唯一可写的资料行） ───────── */

export interface NicknameEditor {
  saving: boolean;
  /** 空串被服务端 `NicknameSchema` 拒；这里先夹一次，不给用户发一个必败的请求。 */
  commit: (next: string) => void;
  failed: boolean;
  clearFailure: () => void;
}

/**
 * 与 `useDailyGoal` 分开的**独立** mutation：现网两处共用一个 `profile.update`，
 * 改昵称会把还没保存的每日目标一起带上去（反之亦然）。拆开后各自的 `variables` 只含自己那一个键。
 */
export function useNickname(toast: (message: string, tone?: 'info' | 'success' | 'error') => void): NicknameEditor {
  const utils = trpc.useUtils();
  const [failed, setFailed] = React.useState(false);
  const update = trpc.profile.update.useMutation({
    onSuccess: (_data, variables) => {
      setFailed(false);
      // `profile.update` 的回包只有 `{ok, daily_goal}`，故镜像**提交的那一份**而非回读。
      const session = getUser();
      const next = variables.nickname?.trim();
      if (session && next) setUser({ ...session, nickname: next });
      toast(PROFILE_COPY.nicknameSaved, 'success');
      void utils.profile.get.invalidate();
    },
    onError: () => setFailed(true),
  });
  return {
    saving: update.isPending,
    failed,
    clearFailure: () => setFailed(false),
    commit: (next) => {
      const trimmed = next.trim();
      if (!trimmed) {
        setFailed(true);
        return;
      }
      update.mutate({ nickname: trimmed });
    },
  };
}

/* ───────── 退出登录（分区 G，必须二次确认） ───────── */

export function useSignOut(router: { push: (href: string) => void; refresh?: () => void }): () => void {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    clearToken();
    clearUser();
    // 清掉上一账号的缓存，避免换号登录闪现旧数据。
    queryClient.clear();
    router.push('/');
    router.refresh?.();
  }, [queryClient, router]);
}

/** `已同步 · 20:31`（§3.8.1 末行：全站只出现一次的人话同步状态）。 */
export function syncLabel(at: number | undefined, now = Date.now()): string {
  if (!at) return SYNC_TEXT.replayFail;
  if (getDateStr(new Date(at)) !== getDateStr(new Date(now))) return SYNC_TEXT.replayFail;
  const d = new Date(at);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return SYNC_TEXT.synced(hhmm);
}

export const PROFILE_COPY = HOST_PROFILE_COPY;

/* ───────── 热力图格阵（分区 C 的「累计复习」落点数据源） ───────── */

export interface HeatCell {
  date: string;
  count: number;
}

/** 近 N 周格阵：`reviewDates` 是 `profile.get` 给的 `YYYY-MM-DD` 串（可重复，一天多次复习）。 */
export function buildHeatCells(reviewDates: readonly string[], weekCount = 53): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const date of reviewDates) counts.set(date, (counts.get(date) ?? 0) + 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (weekCount - 1) * 7 * 24 * 60 * 60 * 1000);
  start.setDate(start.getDate() - start.getDay());
  const weeks: HeatCell[][] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const week: HeatCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(start.getTime() + (w * 7 + d) * 24 * 60 * 60 * 1000);
      const key = getDateStr(day);
      week.push({ date: key, count: counts.get(key) ?? 0 });
    }
    weeks.push(week);
  }
  return weeks;
}
