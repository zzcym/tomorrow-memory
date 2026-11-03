'use client';

/**
 * 强制改密页（T-16 / R-40③④；判据⑤⑦；UI §3.9.4「逐字」那一格）。
 *
 * 挂在 `(user)` 组**外面**：这一页没有顶栏、没有底 tab、没有侧栏，因此也没有任何"顺手走出去"的
 * 第三条路 —— 页面上只有两个出口（`ForcePasswordUpgradeForm` 写死的两颗：`更新密码并继续` 与
 * 其下居中的 `退出登录`）。物理返回由本件的 `popstate` 守卫拦下（拦一次就把历史重新压回去并让
 * 表单 shake 一次，§3.9.4 末段"不退出、不后退"）。
 *
 * ## 谁会被放到这一页上
 *  - **硬门禁**（`passwordUpgradeEnforce=on`）：登录响应 `token:''` + `upgradeToken` →
 *    `applyAuthResult()` 只写 `tm_upgrade_token` / `tm_upgrade_required` 两把键，`tm_token` 保持为空，
 *    根 layout 的 `<UpgradeGate>` 据标志位把人换到本页（R-40④：带着待升级会话在应用里做事这条路
 *    前端自己就不存在）。提交打 `auth.forceChangePassword`（只认 `aud='pw-upgrade'`）。
 *  - **止血阀 off**（PRD §6.4-5-5 / R-23⑦ 末句）：登录已给出正常 token、只是标了 `upgrade_required`，
 *    应用可用，业务入口显示"请先修改密码"+ `去更新`（`components/upgrade-gate.tsx` 的
 *    `UpgradeEntryNotice`），那颗按钮落点也是本页 —— 但此时提交打 `auth.changePassword`（普通改密，
 *    改完旧 token 全量失效，R-40③）。
 *  - **谁都不该来的人**（既无门禁位也无待办位）：直接访问 URL 的正常用户 → 立即 `replace` 回
 *    原始目标页（或首页），本页不拦他。判据⑦ 的反向用例钉的就是这条。
 *
 * ## 成功之后
 * `TOAST_LONG_MS`（shared 唯一值，= 6 秒）内常驻一条 `其他设备需要重新登录`（R-40③），
 * 到点自动 `replace` 回 `takeReturnTo()`（判据⑦"改完自动回到原页面"）。
 *
 * ⚠ 已知上游缺陷（不是本件能修的）：服务端 `auth.forceChangePassword` 与 `auth.changePassword`
 * 的入参把 `oldPassword` 也过 `PasswordSchema`（`min(PASSWORD_MIN=8)`），而本门禁的目标人群正是
 * **"密码不足 8 位"的存量账号** —— 他们在 zod 层就被挡住，永远提交不上来。偏差与复现步骤见
 * `04-dev-report-T-16.md` §4（属 T-05/T-11 名下 `packages/server/**`，本任务不可写）。
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ARIA, AUTH_COPY, TOAST_LONG_MS, type AuthResultDto } from '@tm/shared';
import { ForcePasswordUpgradeForm, NoticeBar, SkeletonBlock, type PasswordChangeValues } from '@tm/ui';
import { trpc } from '@/lib/trpc';
import {
  applyAuthResult,
  clearCredential,
  clearUpgradeSession,
  getUpgradeToken,
  peekReturnTo,
  requestLogin,
  takeReturnTo,
} from '@/lib/auth';
import { forceUpgradeInput, humanMessageOf, tmCodeOf } from '@/lib/api/auth';
import { useAuthStatus, useUpgradeAdvisory, useUpgradeRequired } from '@/lib/use-auth';

export default function UpgradePasswordPage(): React.JSX.Element {
  const router = useRouter();
  const status = useAuthStatus();
  const gated = useUpgradeRequired();
  const advisory = useUpgradeAdvisory();
  const hydrated = status !== 'idle';
  /** 硬门禁 = 门禁位置起（此时库里没有正常 token）；否则只有止血阀 off 的软待办。 */
  const hardGate = gated;
  const applies = gated || advisory;

  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [serverMessage, setServerMessage] = React.useState<string | undefined>(undefined);
  const [blockedBackSignal, setBlockedBackSignal] = React.useState(0);
  const [done, setDone] = React.useState(false);

  const resetError = (): void => {
    setErrorCode(null);
    setServerMessage(undefined);
  };

  /* 不该在这一页：等登录态确定（水合完成）后再判定，否则水合首帧的 `false` 会把该拦的人放走 */
  React.useEffect(() => {
    if (!hydrated || applies || done) return;
    router.replace(peekReturnTo() ?? '/');
  }, [applies, done, hydrated, router]);

  /* §3.9.4 末段：物理返回不退出、不后退 —— 重新压一层历史并让表单 shake 一次 */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !hardGate || done) return;
    const trap = (): void => window.history.pushState(null, '', window.location.href);
    trap();
    const onPopState = (): void => {
      trap();
      setBlockedBackSignal((n) => n + 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [done, hardGate]);

  /* 成功告知常驻 `TOAST_LONG_MS` 后回原页（判据⑦ + R-40③） */
  React.useEffect(() => {
    if (!done) return;
    const to = takeReturnTo();
    const timer = setTimeout(() => router.replace(to ?? '/'), TOAST_LONG_MS);
    return () => clearTimeout(timer);
  }, [done, router]);

  const finish = React.useCallback((): void => {
    // 改密成功 = 门禁解除：两把 upgrade 键与软待办位一起清（`tm_token` 由出参重写）
    clearUpgradeSession();
    resetError();
    setDone(true);
  }, []);

  const force = trpc.auth.forceChangePassword.useMutation({
    onSuccess: (data: AuthResultDto) => {
      applyAuthResult(data);
      finish();
    },
    onError: (error) => {
      setErrorCode(tmCodeOf(error) ?? null);
      setServerMessage(humanMessageOf(error));
    },
  });

  const normal = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      // R-40③：普通改密会打回旧 token ⇒ 本机也回到未登录，重新登录是唯一的继续方式
      clearCredential();
      toast.success(AUTH_COPY.changePassword.success.toast);
      finish();
    },
    onError: (error) => {
      setErrorCode(tmCodeOf(error) ?? null);
      setServerMessage(humanMessageOf(error));
    },
  });

  const submit = (values: PasswordChangeValues): void => {
    if (done) return;
    resetError();
    if (hardGate) {
      // D-1：冻结契约 `ForceUpgradeInputSchema` 没有 `oldPassword`，服务端在边界上 extend 补了必填键
      force.mutate({ ...forceUpgradeInput(values, getUpgradeToken()), oldPassword: values.oldPassword });
      return;
    }
    normal.mutate({
      oldPassword: values.oldPassword,
      newPassword: values.newPassword,
      confirmPassword: values.confirmPassword,
    });
  };

  const signOut = (): void => {
    resetError();
    // 退出登录只清本机凭据（A-32-4 会话语义），账号与进度都在服务端；下次登录仍可再走这条路
    clearCredential();
    clearUpgradeSession();
    requestLogin({ mode: 'sign-in' });
    router.replace('/');
  };

  if (!applies && !done) {
    // 不该在这一页的人（无门禁位、无待办位）：上面那条 effect 正在把他换回原页，这里只给骨架，不出任何文案
    return (
      <main data-testid="upgrade-password-bounce" className="mx-auto w-full max-w-auth px-4 py-6">
        <SkeletonBlock variant="card" />
        <SkeletonBlock variant="text" rows={2} className="mt-3" />
      </main>
    );
  }

  return (
    <main
      id="main"
      data-testid="upgrade-password-page"
      data-hard-gate={hardGate ? 'true' : 'false'}
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-4"
    >
      <ForcePasswordUpgradeForm
        testid="upgrade-password-form"
        title={AUTH_COPY.forceUpgrade.title}
        subtitle={AUTH_COPY.forceUpgrade.subtitle}
        notice={AUTH_COPY.forceUpgrade.notice}
        signOutLabel={AUTH_COPY.forceUpgrade.secondary}
        showPasswordLabel={ARIA.showPassword}
        hidePasswordLabel={ARIA.hidePassword}
        pending={force.isPending || normal.isPending}
        errorCode={errorCode}
        serverMessage={serverMessage}
        blockedBackSignal={blockedBackSignal}
        onSubmit={submit}
        onSignOut={signOut}
        result={
          done ? (
            <NoticeBar layout="bar" tone="success" role="status" testid="upgrade-success-notice">
              {AUTH_COPY.changePassword.success.reloginNotice}
            </NoticeBar>
          ) : undefined
        }
      />
    </main>
  );
}
