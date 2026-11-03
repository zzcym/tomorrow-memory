/**
 * App 账号安全屏（`#/security`，普通改密面；T-19d / A-44 #84 的 T-19 拆分；PRD R-40①②③、UI §3.9.4 末段）。
 *
 * 与强制改密全屏（`UpgradePasswordScreen`，T-19c）是**两个面、两个端点、两个工厂**：
 *  - 强制改密 = R-40④ 硬门禁（一次性 upgrade token，不可关闭、物理返回 `stay`）；
 *  - 本屏 = 已进门用户（握正常 token）的**自助改密**，也是止血阀 `passwordUpgradeEnforce=off`
 *    那条"人已进门但仍该改密"软告知面最终落到的改密页（R-23⑦ 末句 / §6.4-5-5）。
 *    它是一张**普通二级页**，返回语义 = "能正常返回上一屏"，**不含 `stay`、不装饰 `window.onAndroidBack`**
 *    （那一套只属强制改密页，见 `UpgradePasswordScreen.tsx:11-18`）。
 *
 * 本屏只做五件事，其余全部交回共用件与数据层：
 *  1. **门禁判定**：只有握正常 token 的人该停在这里。游客 → 去 `/login`；
 *     只握一次性凭据（R-40④ 硬门禁会话，不该从二级页进来）→ 去 `/upgrade-password`。判定取
 *     `auth-store` 的派生位（`hasToken` / `upgradeSessionOnly`），屏内不自算第二份、不碰存储 API。
 *  2. **复用 `@tm/ui` 的 `ChangePasswordForm`（只传 props，0 重写）**：三格字段、强度条、
 *     §3.9.5 的码→字段落点、`oldPassword` 必填与新密码 ≥`PASSWORD_MIN` 的客户端拦全在共用件里
 *     （其超长/过短两条不同出口 = A-64 #179 / F-23 修复点，本屏原样接住，不改这个文件）。
 *     本屏只补一张 `headerAction` 返回钮（页面 chrome，非表单控件），文案取 `ARIA.back`。
 *  3. **提交 = `data/queries/auth.ts` 的 `changePasswordMutationOptions()`（全仓唯一份，`PUT /api/password`）**：
 *     入参过 `ChangePasswordInputSchema`、响应过 `OkResultSchema`（`{ok:true}`，服务端**不回新 token**）。
 *  4. **成功链（R-40③ 的凭据语义）**：改密成功后旧 token 已在服务端失效 ⇒ 本屏**清凭据**（唯一清法
 *     `auth-store.signOut()`）并落到"重新登录"话术链 —— toast 一闪 `success.toast` + `result` 槽常驻
 *     `TOAST_LONG_MS`（shared 唯一值）的 `success.reloginNotice`，到点再回 `/login`。
 *     ⚠ 三条禁令都守住：不把新密码写进任何存储、不自动用新凭据签一个正常 token（响应里本就没有 token）、
 *     屏内 0 命中 `writeToken`/`saveSessionToken`/`localStorage`。
 *  5. **失败面不得静默**：`errorCode` / `serverMessage` / `pending` 接回共用件；落点（哪格显示哪句）由
 *     `ChangePasswordForm` 按 §3.9.5 裁决，屏不重算。契约外失败（网络断 / 超时）由既有单点
 *     `apiErrorMessage()` 成人话。屏内 0 命中 `=== 40`、0 命中 `handleAuthError(`，成不了第二份状态码处理。
 *
 * 文案单一源：屏内不新增任何中文产品字面量（spec 剥注释后 CJK 0 命中），
 * 标题 / 按钮 / 成功两串全部 `import` `@tm/shared` 的 `AUTH_COPY.changePassword.*`。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`，不用逻辑赋值 `||=`/`??=`（Chrome 85 起才有）。
 */

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ARIA, AUTH_COPY, TOAST_LONG_MS } from '@tm/shared';
import { ChangePasswordForm, NoticeBar, useHost, type PasswordChangeValues } from '@tm/ui';
import { changePasswordMutationOptions } from '../data/queries/auth.js';
import { apiErrorMessage, isApiError } from '../data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  signOut,
  useAuthSnapshot,
} from '../lib/auth-store.js';
import { back, canGoBack, navigate } from '../router.js';

/* §5.3 第 5 行：账号安全页的上一屏是「我的」（本页是它的二级页；无历史时回它，与 `WordDetailScreen` 同口径）。 */
const PARENT_ROUTE = '/me';

/* 一次失败的可见痕迹：码（交给共用件按 §3.9.5 落点显示）+ 人话（既有单点 `apiErrorMessage()`）。 */
interface ScreenFailure {
  code: string | null;
  message: string;
}

const NO_FAILURE: ScreenFailure = { code: null, message: '' };

const failureOf = (error: unknown): ScreenFailure => {
  const code = isApiError(error) ? String(error.code) : null;
  return { code, message: apiErrorMessage(error) };
};

export default function SecurityScreen(): React.JSX.Element | null {
  const host = useHost();
  const queryClient = useQueryClient();
  const auth = useAuthSnapshot();

  /** 唯一"该停在本页"的形态 = 握正常 token（`auth-store` 的派生位，本屏不自算第二份判定）。 */
  const eligible = auth.hasToken;

  const [failure, setFailure] = React.useState<ScreenFailure>(NO_FAILURE);
  const [done, setDone] = React.useState(false);
  /** 已经发起过"离开本页"（成功收尾 / 返回 / 换页之一）⇒ 派生态变化不得再触发第二次跳转。 */
  const leavingRef = React.useRef(false);

  const changeMutation = useMutation(changePasswordMutationOptions());
  const pending = changeMutation.isPending;

  /** 离开本页的唯一方式：清掉上一会话的查询缓存再走 hash 路由（与 `LoginScreen.leaveTo` / `UpgradePasswordScreen` 同形）。 */
  const leaveTo = React.useCallback(
    (target: string): void => {
      leavingRef.current = true;
      queryClient.clear();
      host.navigate(target);
    },
    [host, queryClient],
  );

  /* 返回语义 = 正常回上一屏（二级页）：有应用内历史就 `back()`，无则回父页；不涉及 `stay`、不装饰物理返回钩子。 */
  const goBack = React.useCallback((): void => {
    if (leavingRef.current) return;
    if (canGoBack()) {
      back();
      return;
    }
    navigate(PARENT_ROUTE);
  }, []);

  /* 不该在这一页的人：游客 → /login；只握一次性凭据（硬门禁会话）→ /upgrade-password。 */
  React.useEffect(() => {
    if (done || leavingRef.current || eligible) return;
    host.navigate(auth.upgradeSessionOnly ? UPGRADE_PASSWORD_ROUTE : LOGIN_ROUTE);
  }, [auth.upgradeSessionOnly, done, eligible, host]);

  /* R-40③：成功后常驻 6 秒"重新登录"信息条（时长只有 shared 那一份），到点清凭据并回登录。 */
  React.useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => leaveTo(signOut()), TOAST_LONG_MS);
    return () => clearTimeout(timer);
  }, [done, leaveTo]);

  const submitValues = async (values: PasswordChangeValues): Promise<void> => {
    if (pending || done) return;
    setFailure(NO_FAILURE);
    try {
      await changeMutation.mutateAsync({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      // 服务端按 R-40③ 让旧 token 随即失效，且不回新 token ⇒ 屏侧只做"告知 + 稍后清凭据回登录"。
      setDone(true);
      host.toast(AUTH_COPY.changePassword.success.toast, 'success');
    } catch (error) {
      setFailure(failureOf(error));
    }
  };

  const result = done ? (
    <NoticeBar layout="bar" tone="success" role="status" testid="security-result-notice">
      {AUTH_COPY.changePassword.success.reloginNotice}
    </NoticeBar>
  ) : undefined;

  // 不该在这一页的人：上面那条 effect 正把他换出去，这一帧不给表单、也不给任何自造文案（与 `UpgradePasswordScreen:186` 同口径的空帧）。
  if (!eligible && !done) return null;

  return (
    <div className="mx-auto w-full max-w-read px-4 pb-10 pt-4" data-testid="security-screen">
      <ChangePasswordForm
        testid="security-change-password"
        title={AUTH_COPY.changePassword.title}
        submitLabel={AUTH_COPY.changePassword.submit}
        showPasswordLabel={ARIA.showPassword}
        hidePasswordLabel={ARIA.hidePassword}
        autoFocus
        headerAction={
          <button
            type="button"
            onClick={goBack}
            aria-label={ARIA.back}
            className="min-h-tap min-w-tap shrink-0 rounded-lg px-2 text-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span aria-hidden="true">‹</span>
          </button>
        }
        pending={pending}
        errorCode={failure.code}
        serverMessage={failure.message === '' ? undefined : failure.message}
        result={result}
        onSubmit={(values) => {
          void submitValues(values);
        }}
      />
    </div>
  );
}
