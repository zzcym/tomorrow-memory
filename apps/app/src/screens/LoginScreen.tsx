/**
 * App 登录/注册屏（`#/login` 与 `#/register` 两条 gate 共指本屏，T-19b / A-44 #84 的 T-19 拆分；PRD R-01⑤⑥、R-39、R-40④、R-23⑤）。
 * 形态对齐 `apps/web/src/components/login-dialog.tsx`（T-16 薄壳）与 `WordbookScreen`（宿主拿法）：
 * 屏只做四件事，其余全部交回组件与数据层——
 *
 *  1. **判据①：复用 `@tm/ui` 的 `AuthFormShell`，一个控件都不自己画**。
 *     手机号 / 密码 / 确认密码 / 协议勾选 / 主按钮五件、字段校验与 §3.9.5 的逐码落点全在壳内
 *     （签名冻结，本件只填参数）；屏内自写 `<input` 数量 = 0（spec 的源码哨兵机检）。
 *  2. **判据⑨：未勾协议不得提交**——注册态主按钮由壳的 `primaryBlockedByAgreement` 禁用
 *     （`aria-disabled` + 灰态），点提交给 `role=alert` 的可读原因
 *     （`TM_ERRORS.AGREEMENT_REQUIRED.copy`，勾选件 = 壳内 `AgreementCheckbox`），不是静默失败；
 *     登录态**不出现勾选框**（A-23-5 定稿），合规告知由本件底部那句
 *     `AUTH_COPY.agreementSignInNote` 满足（与 Web 弹窗同一落点、同一声明点）。
 *  3. **零新文案**：屏内中文零字面量（哨兵机检：剥注释后按 CJK 扫描 0 命中）。
 *     校验与错误话术全部 import 自 `@tm/shared`——`AUTH_COPY.*`（标题/切换链/副标题/入口小字/
 *     登录态告知）、`TM_ERRORS`（经壳与 `apiErrorMessage()` 落地）、手机号/密码判定
 *     （经契约 schema 落进 `data/queries/auth.ts`，屏内不复制正则）。
 *  4. **凭据唯一走 `auth-store` 既有路径**（判据②⑧）：成功 = `signIn(facts)`
 *     （token 落点、身份回显、广播全在它里面；屏内不碰 `localStorage` / `AndroidBridge`，
 *     哨兵机检）；进门后 `takePendingAction()` 续作未登录被打断的跳转（R-16②/R-39⑧）。
 *     R-40④ 强制改密的**入口判定在这一屏**：服务端回 `PASSWORD_UPGRADE_REQUIRED`（403 错误码）
 *     或 200 空 token + `upgrade_required`（`signIn()` 回 `'upgrade-required'`）⇒
 *     `host.navigate(UPGRADE_PASSWORD_ROUTE)`，两种形态都不写正常 token、不进应用；
 *     目标屏由 T-19c 交付，本屏只保证跳过去。
 *
 * 失败面（判据：屏内 0 命中 `=== 401`、0 命中 `handleAuthError(`）：
 *  - 三个 mutation 在数据层一律 `handleAuthError: false`（登录前没有"当前凭据"可清，
 *    输错密码不得触发单点登出）；
 *  - 契约内错误码 → 透传给壳，由 §3.9.5 的逐码落点显示 `TM_ERRORS[code].copy`；
 *    契约外（无码 401 的防枚举人话、网络断、超时）→ `apiErrorMessage()` 既有取串助手，
 *    屏内不写第二份判定与第二份话术。
 *  - E5c（上游没这颗路由 → 屏幕曾显示 `404 Not Found`）：命中"端点不存在"（404 / 405，
 *    或响应体不是合法 JSON）时 message 取 `PLAIN_TERMS.unknownEndpoint` 那一颗定稿串；
 *    判定仍不在屏上写状态码（`isMissingEndpoint()` 在数据层），`ScreenFailure.code` 取既有值。
 *
 * 防重复提交：`pending` 透传给壳（主按钮 `disabled` + 表单 `aria-busy` + 字段区
 * `pointer-events-none`，§3.9.6），屏内提交入口再挡一道。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`。
 */

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AUTH_COPY, PASSWORD_MIN, PLAIN_TERMS, type AuthResultDto } from '@tm/shared';
import {
  AuthFormShell,
  useHost,
  type AuthFormMode,
  type AuthFormValues,
} from '@tm/ui';
import {
  loginMutationOptions,
  registerMutationOptions,
  sendCodeMutationOptions,
} from '../data/queries/auth.js';
import { apiErrorMessage, isApiError, isMissingEndpoint } from '../data/rest-fetcher.js';
import {
  REGISTER_ROUTE,
  UPGRADE_PASSWORD_ROUTE,
  signIn,
  takePendingAction,
  useAuthSnapshot,
} from '../lib/auth-store.js';
import { useLocation } from '../router.js';

/* 登录成功且无待续作动作时的落点：hash 路由首页（与 `router.tsx` 的根路由同值）。 */
const HOME_ROUTE = '/';

/* I-09② 那条告知的改密入口落点：`router.tsx:52` 登记的 `/security`（`SecurityScreen`，T-19d 交付）。
   本仓没有跨屏的路径单点（`MeScreen.tsx:214` 那行入口也是屏内一颗），此处与之同形，不在 JSX 里打裸串。 */
const SECURITY_ROUTE = '/security';

/* 一次失败的可见痕迹：码（交给壳按 §3.9.5 落点显示）+ 人话（既有单点 `apiErrorMessage()`）。 */
interface ScreenFailure {
  code: string | null;
  message: string;
}

const NO_FAILURE: ScreenFailure = { code: null, message: '' };

const failureOf = (error: unknown): ScreenFailure => {
  const code = isApiError(error) ? String(error.code) : null;
  // E5c 件③：上游把这颗端点当"不存在"（404 / 405，或响应体根本不是合法 JSON）时，屏上那句
  // 取 `@tm/shared` 定稿的 `PLAIN_TERMS.unknownEndpoint`（⛔ 显示 `404 Not Found` 这种上游原文）。
  // 判定与取串都在单点（`rest-fetcher.isMissingEndpoint()` / `apiErrorMessage()`），屏内不拼第二句、
  // 不自写状态码分支；`code` 仍是既有那几颗（⛔ 新增第七颗 ScreenFailureCode）。
  const message = isMissingEndpoint(error) ? PLAIN_TERMS.unknownEndpoint : apiErrorMessage(error);
  return { code, message };
};

export default function LoginScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const auth = useAuthSnapshot();
  const loc = useLocation();

  // mode 初值由当前路由派生：`/register` ⇒ 注册态；其余（含 `/login` 与任何回落）⇒ 登录态。
  // 不在挂载后再加 effect 同步：`AppRoutes` 以 `key={def.path}` 挂载路由页，两颗 gate 的 path 不同
  // ⇒ 换路由必重挂本屏、初值必按新路由重算（屏内切换钮 `changeMode` 的本地态照旧）。
  const [mode, setMode] = React.useState<AuthFormMode>(() =>
    loc.path === REGISTER_ROUTE ? 'register' : 'sign-in',
  );
  const [activate, setActivate] = React.useState(false);
  const [failure, setFailure] = React.useState<ScreenFailure>(NO_FAILURE);

  const loginMutation = useMutation(loginMutationOptions());
  const registerMutation = useMutation(registerMutationOptions());
  const sendCodeMutation = useMutation(sendCodeMutationOptions());

  // send-code 不挡主提交：验证码入口与密码登录互不排队（R-01⑤⑥）。
  const pending = loginMutation.isPending || registerMutation.isPending;

  // 离开本屏前清掉上一个账号的查询缓存（词本/查词都可能已属别人；凭据本身归 auth-store 管）。
  const leaveTo = (target: string): void => {
    queryClient.clear();
    host.navigate(target);
  };

  const gotoUpgrade = (): void => {
    leaveTo(UPGRADE_PASSWORD_ROUTE);
  };

  // R-40④ 入口判定的服务端回码支：403 `PASSWORD_UPGRADE_REQUIRED`——不写 token、不进应用。
  const isUpgradeRequired = (error: unknown): boolean =>
    isApiError(error) && error.code === 'PASSWORD_UPGRADE_REQUIRED';

  // 成功面唯一出口：auth-store 的 signIn()（判据②）。它的返回值就是"进没进门"的裁决。
  // `shortPassword` = I-09②：本次登录输入的密码短于 `PASSWORD_MIN` ⇒ **登录已经成功之后**才给那一条告知
  // + 改密入口，落点 = 全站告知位 Toast（与 Web 弹窗同一处、同一条串，`AUTH_COPY` 单点）；
  // 它不参与提交判定，R-40④「短密码必须能提交」的口径一字未动。
  const settleSession = (facts: AuthResultDto, shortPassword: boolean): void => {
    const outcome = signIn(facts);
    if (outcome === 'upgrade-required') {
      gotoUpgrade();
      return;
    }
    if (shortPassword) {
      host.toast(AUTH_COPY.signInShortPasswordNotice, {
        action: { label: AUTH_COPY.changePassword.title, onClick: () => host.navigate(SECURITY_ROUTE) },
      });
    }
    const action = takePendingAction();
    if (action && action.kind === 'open') {
      leaveTo(action.path);
      return;
    }
    leaveTo(HOME_ROUTE);
  };

  const submitValues = async (values: AuthFormValues): Promise<void> => {
    if (pending) return;
    setFailure(NO_FAILURE);
    try {
      const facts =
        mode === 'register'
          ? await registerMutation.mutateAsync({
              phone: values.phone,
              password: values.password,
              confirmPassword: values.confirmPassword,
              agreed: values.agreed,
            })
          : await loginMutation.mutateAsync({ phone: values.phone, password: values.password });
      settleSession(facts, mode === 'sign-in' && values.password.trim().length < PASSWORD_MIN);
    } catch (error) {
      if (isUpgradeRequired(error)) {
        gotoUpgrade();
        return;
      }
      setFailure(failureOf(error));
    }
  };

  const requestSmsCode = (phone: string): void => {
    sendCodeMutation.mutate(
      { phone },
      {
        // 200 附码（通道未接）走 SmsCodeEntry 的就地反馈；只有真失败（如 429）才值得打扰用户，
        // 话术仍取 apiErrorMessage() 单点，屏内不拼第二句。
        onError: (error) => {
          host.toast(apiErrorMessage(error));
        },
      },
    );
  };

  const changeMode = (next: AuthFormMode): void => {
    setMode(next);
    setActivate(next === 'register' ? activate : false);
    setFailure(NO_FAILURE);
  };

  const changeActivate = (next: boolean): void => {
    setActivate(next);
    setFailure(NO_FAILURE);
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10 pt-6" data-testid="login-screen">
      <AuthFormShell
        testid="login-screen-form"
        mode={mode}
        onModeChange={changeMode}
        activate={activate}
        onActivateChange={changeActivate}
        onSubmit={(values) => {
          void submitValues(values);
        }}
        pending={pending}
        errorCode={failure.code}
        serverMessage={failure.message === '' ? undefined : failure.message}
        onSmsEntryClick={requestSmsCode}
        defaultPhone={auth.phone}
        autoFocus="phone"
        signInSubtitle={AUTH_COPY.wall.subtitle}
        switchToRegisterLabel={AUTH_COPY.switchToRegister}
        switchToSignInLabel={AUTH_COPY.switchToSignIn}
        alreadyRegisteredActionLabel={AUTH_COPY.cardActions.goSignIn}
      />
      {mode === 'sign-in' ? (
        <p data-testid="login-agreement-note" className="mt-3 text-xs leading-relaxed text-ink-muted">
          {AUTH_COPY.agreementSignInNote}
        </p>
      ) : null}
    </div>
  );
}
