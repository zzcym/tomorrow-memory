'use client';

/**
 * 普通改密页 `/profile/security`（§10.2 T-15 行 🆕`app/(user)/profile/security/page.tsx` / UI §3.9.4:1072）。
 *
 * §3.9.4 末行钉死：**与强制改密复用同一个表单组件**，差异只有三处文案 + 一个返回动作
 * （有返回、标题 `修改密码`、按钮 `保存新密码`、**没有** `退出登录` 出口）。
 * 所以这里只 import `@tm/ui/auth/ChangePasswordForm`，不重画任何字段、强度条与错误行
 * （那些在 T-13 名下，重复一份就是 §8.2-2 的"两份形态"红）。
 *
 * 四条口径：
 * 1. 传输只走 `trpc.auth.changePassword`（`packages/server` 的 `ChangePasswordInputSchema`
 *    要求 `oldPassword` 必填、`newPassword` ≥8 位 ⇒ R-40②）；
 *    现网 `profile/page.tsx` 那份 `profile.changePassword` + 「至少 4 位」占位符是 R-40 的旧口，
 *    已随本次瘦身从「我的」页删掉（A-30-3：改密只有 `auth.changePassword` 一条路）。
 * 2. 错误一律以**码**交给表单自己翻译（`tmCodeOf(err)` → `TM_ERRORS`），页面不自带人话串；
 * 3. 成功 = toast `密码已更新`（一闪）+ **常驻 6 秒**信息条 `其他设备需要重新登录`（R-40③，
 *    时长取 `TOAST_LONG_MS`，与 §3.9.4:1066 同一份常量）；
 * 4. 两串全部 import 自 `@tm/shared`，本文件零中文字面量。
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ARIA, AUTH_COPY, TOAST_LONG_MS, VERBS } from '@tm/shared';
import { ChangePasswordForm, useHost } from '@tm/ui';
import { trpc, type TrpcError } from '@/lib/trpc';
import { tmCodeOf } from '@/lib/api/auth';
import { useSignOut } from '@/lib/api/profile';

/** 信息条的倒计时自己数（`TOAST_LONG_MS` 是唯一时长源，页面不写 6000 这个数）。 */
const NOTICE_MS = TOAST_LONG_MS;

export default function ProfileSecurityPage(): React.JSX.Element {
  const host = useHost();
  const router = useRouter();
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const signOut = useSignOut(router);

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setErrorCode(null);
      setDone(true);
      host.toast(AUTH_COPY.changePassword.success.toast, 'success');
    },
    onError: (error: TrpcError) => {
      setDone(false);
      setErrorCode(tmCodeOf(error) ?? null);
    },
  });

  React.useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <div className="mx-auto flex w-full max-w-read flex-col gap-3 py-2" data-testid="profile-security">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label={ARIA.back}
        data-testid="security-back"
        className="inline-flex min-h-tap w-fit items-center gap-1 rounded-md px-1 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true">‹</span>
        {ARIA.back}
      </button>

      <ChangePasswordForm
        title={AUTH_COPY.changePassword.title}
        submitLabel={AUTH_COPY.changePassword.submit}
        fieldLabels={AUTH_COPY.forceUpgrade.fieldLabels}
        pending={change.isPending}
        errorCode={errorCode}
        autoFocus
        onSubmit={({ oldPassword, newPassword, confirmPassword }) =>
          change.mutate({ oldPassword, newPassword, confirmPassword })
        }
        result={
          done ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="security-relogin-notice"
              className="rounded-lg border border-hair bg-sunken px-3 py-2 text-sm text-ink"
            >
              {AUTH_COPY.changePassword.success.reloginNotice}
            </p>
          ) : undefined
        }
        testid="security-form"
      />

      {/* R-40③：旧 token 已随改密失效 ⇒ 常驻告知之外留一条**主动**收尾出口（不是强制页那颗，
          强制页的退出口由 `upgrade-gate` 那侧给；这里只在成功之后出现）。 */}
      {done ? (
        <button
          type="button"
          onClick={signOut}
          data-testid="security-signout"
          className="inline-flex min-h-tap items-center justify-center rounded-md px-3 text-sm text-danger focus-visible:outline-2 focus-visible:outline-focus"
        >
          {VERBS.signOut}
        </button>
      ) : null}
    </div>
  );
}
