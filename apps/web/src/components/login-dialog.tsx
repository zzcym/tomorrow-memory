'use client';

/**
 * 登录 / 注册弹窗的**薄壳**（T-16 / R-23①④⑤ / R-39⑤⑥⑨ / R-01⑤⑥；判据③④⑤⑨）。
 *
 * 改动前这里是 148 行的自带表单：默认落在验证码态、成功后弹"验证码已发送"+ 起 60 秒倒计时、
 * `toast.error(err.message)` 直吐服务端原串、占位符写"密码（至少 4 位）"、没有协议勾选 ——
 * 五条都违规定稿。现在**一个控件都不自己画**：
 *  - 视觉与判定全部在 `@tm/ui` 的 `AuthFormShell`（T-13 交付，签名冻结，本件只填参数）；
 *  - 文案零字面量：标题/副标题/切换链/提示卡动作全部来自 `AUTH_COPY`，错误串来自 `TM_ERRORS`；
 *  - 传输只打 `auth.login` / `auth.register`（注册与激活同一个 service 出口，R-39①）；
 *  - 出参只有一个落库口 `applyAuthResult()`（`lib/auth.ts`），命中强制改密时**不写 `tm_token`**（R-40④）。
 *
 * 三条判据的落点：
 *  - **判据⑤**（默认密码态、焦点在密码框）：`mode` 初值 `'sign-in'` + `autoFocus="password"`；
 *    登录态**不出现协议勾选框**（A-23-5 定稿，合规诉求由本件底部那句 `AUTH_COPY.agreementSignInNote` 满足），
 *    勾选框只属注册态 ⇒ 注册态可交互元素 = 5，登录态 = 4，都不破 §8.3-D 的上限；
 *  - **判据④**（登录成功后回到原页 + 续作待收藏）：`returnTo` / `pendingAction` 由 `LoginWall` 或
 *    `requestLogin()` 在开门前登记，本件在成功后单点消费（`takeReturnTo()` / `takePendingAction()`）；
 *  - **判据⑨**（未勾协议不得提交）：由 `AuthFormShell` 的 `primaryBlockedByAgreement` 禁用主按钮，
 *    本件只负责把服务端回码 `AGREEMENT_REQUIRED` 一并显示（防御式，正常路径走不到）。
 *
 * R-01⑥ 的验证码入口：**本件不调 `auth.sendCode`、不启倒计时、不弹"已发送"**——
 * 点击后的即时反馈由 `SmsCodeEntry` 就地显示 `AUTH_COPY.smsResult`（= `SMS_NOT_CONFIGURED` 人话）承担。
 *
 * 弹窗实例全站唯一、由 `components/header.tsx` 持有开合状态（T-12 名下文件，不改）。
 * 那颗按钮只广播 `new Event(LOGIN_OPEN_EVENT)` 且不带 detail，所以本件自己监听同名事件读 detail：
 * `mode==='register'` 时直接落在注册态（R-23① 的"没有账号？注册"入口），不带 detail 时按默认登录态。
 */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AUTH_COPY, LOOKUP_COPY, PASSWORD_MIN, type AuthResultDto } from '@tm/shared';
import {
  AuthFormShell,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  useHost,
  type AuthFormMode,
  type AuthFormValues,
} from '@tm/ui';
import { trpc } from '@/lib/trpc';
import {
  LOGIN_OPEN_EVENT,
  applyAuthResult,
  type LoginOpenDetail,
  peekReturnTo,
  rememberReturnTo,
  takePendingAction,
  takeReturnTo,
} from '@/lib/auth';
import {
  ABOUT_PATH,
  SECURITY_PATH,
  UPGRADE_PATH,
  humanMessageOf,
  isWrongCredential,
  loginInput,
  registerInput,
  tmCodeOf,
} from '@/lib/api/auth';

export interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 兼容既有调用点（`header.tsx` 不传；页面想在登录后做本地收尾时传）。 */
  onLoggedIn?: () => void;
}

export function LoginDialog({ open, onOpenChange, onLoggedIn }: LoginDialogProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const utils = trpc.useUtils();
  /** 告知走 `useHost().toast` 而不是这里既有的 sonner 直调：与 App 端 `host.toast` 同一条通道、同一个全站告知位（UI §3.11.1）。 */
  const host = useHost();

  /** I-09②：本次**登录**输入的密码短于 `PASSWORD_MIN` 才置真；只在本机内存里活一次提交，⛔ 落存储/日志。 */
  const shortSignInPassword = React.useRef(false);

  const [mode, setMode] = React.useState<AuthFormMode>('sign-in');
  const [activate, setActivate] = React.useState(false);
  const [phoneSeed, setPhoneSeed] = React.useState('');
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [serverMessage, setServerMessage] = React.useState<string | undefined>(undefined);
  const [showUnregisteredHint, setShowUnregisteredHint] = React.useState(false);

  /** 清掉上一次的失败痕迹：切换态、重新开门、提交前各调一次（§3.9.5 不留残影）。 */
  const resetError = (): void => {
    setErrorCode(null);
    setServerMessage(undefined);
    setShowUnregisteredHint(false);
  };

  /** 监听开弹窗的事件：detail 决定落地态与预填手机号（弹窗唯一实例的"入参"）。 */
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpenRequest = (event: Event): void => {
      const detail = (event as CustomEvent<LoginOpenDetail>).detail;
      setMode(detail?.mode === 'register' ? 'register' : 'sign-in');
      setActivate(false);
      setPhoneSeed(detail?.phone ?? '');
      resetError();
    };
    window.addEventListener(LOGIN_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(LOGIN_OPEN_EVENT, onOpenRequest);
  }, []);

  /** 待收藏词的续作出口（判据④）：声明在 `onAuthed` 之前，成功后直接复用。 */
  const addFavorite = trpc.wordbook.add.useMutation();

  /** 登录/注册/激活三条出口共用的成功口径（判据④⑦ 的分支点）。 */
  const onAuthed = React.useCallback(
    (data: AuthResultDto): void => {
      const outcome = applyAuthResult(data);
      if (outcome === 'upgrade') {
        // R-40④：没有正常 token，只有 upgrade token ⇒ 进改密页；回跳目标已有就不覆盖（给改密页接手）
        onOpenChange(false);
        if (!peekReturnTo()) rememberReturnTo(pathname);
        router.replace(UPGRADE_PATH);
        return;
      }
      onOpenChange(false);
      // I-09②：登录**已经成功**之后才给这一条（短密码照样登得进来，R-40④ 的提交口径一字未动），
      // 落点与 App 端同位 = 全站告知位，串与入口标签同引 shared 单点。
      if (shortSignInPassword.current) {
        host.toast(AUTH_COPY.signInShortPasswordNotice, {
          action: { label: AUTH_COPY.changePassword.title, onClick: () => router.push(SECURITY_PATH) },
        });
      }
      onLoggedIn?.();
      void utils.invalidate();

      const action = takePendingAction();
      if (action?.kind === 'favorite') {
        addFavorite.mutate(
          { word: action.word },
          { onSuccess: () => toast.success(LOOKUP_COPY.favoriteToast.body) },
        );
      }
      // `checkin` 一支不在这里续作：登录后页面自己会重绘出打卡入口（判据④ 只点名收藏）

      const returnTo = takeReturnTo();
      if (returnTo && returnTo !== pathname) router.replace(returnTo);
    },
    [addFavorite, host, onLoggedIn, onOpenChange, pathname, router, utils],
  );

  const onAuthError = React.useCallback((error: unknown): void => {
    setErrorCode(tmCodeOf(error) ?? null);
    setServerMessage(humanMessageOf(error));
    // 服务端对"密码错/未注册"故意不给 §4.6 码（防枚举），故这一支单独判（R-23④）
    setShowUnregisteredHint(isWrongCredential(error));
  }, []);

  const login = trpc.auth.login.useMutation({ onSuccess: onAuthed, onError: onAuthError });
  /** 注册与激活打同一个出口（R-39①：`registerOrActivate()` 单点裁决），本件不分叉。 */
  const register = trpc.auth.register.useMutation({ onSuccess: onAuthed, onError: onAuthError });

  const pending = login.isPending || register.isPending;

  const submit = (values: AuthFormValues): void => {
    resetError();
    if (mode === 'register') {
      shortSignInPassword.current = false;
      register.mutate(registerInput(values.phone, values.password, values.confirmPassword, values.agreed));
      return;
    }
    shortSignInPassword.current = values.password.trim().length < PASSWORD_MIN;
    login.mutate(loginInput(values.phone, values.password));
  };

  const title =
    mode === 'register'
      ? activate
        ? AUTH_COPY.dialog.activate
        : AUTH_COPY.dialog.register
      : AUTH_COPY.dialog.login;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetError();
        onOpenChange(next);
      }}
    >
      <DialogContent data-testid="login-dialog" className="sm:max-w-md">
        {/* 可见标题在 `AuthFormShell` 内（`data-slot="auth-title"`）；这里这颗同名标题只给 Radix 的可访问名，不占视觉与计数 */}
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{AUTH_COPY.wall.subtitle}</DialogDescription>
        <AuthFormShell
          testid="login-dialog-form"
          onSubmit={submit}
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            if (next === 'sign-in') setActivate(false);
            resetError();
          }}
          activate={activate}
          onActivateChange={setActivate}
          pending={pending}
          errorCode={errorCode}
          serverMessage={serverMessage}
          showUnregisteredHint={showUnregisteredHint}
          onUnregisteredHintClick={resetError}
          switchToRegisterLabel={AUTH_COPY.switchToRegister}
          switchToSignInLabel={AUTH_COPY.switchToSignIn}
          alreadyRegisteredActionLabel={AUTH_COPY.cardActions.goSignIn}
          signInSubtitle={AUTH_COPY.wall.subtitle}
          defaultPhone={phoneSeed}
          autoFocus="password"
          passwordLabel={AUTH_COPY.fieldLabels.password}
          confirmPasswordLabel={AUTH_COPY.fieldLabels.confirmPassword}
          onOpenTerms={() => router.push(ABOUT_PATH)}
          onOpenPrivacy={() => router.push(ABOUT_PATH)}
        />
        {mode === 'sign-in' ? (
          <p data-testid="login-agreement-note" className="text-xs leading-relaxed text-ink-muted">
            {AUTH_COPY.agreementSignInNote}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default LoginDialog;
