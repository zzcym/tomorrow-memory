/**
 * App 强制改密全屏（`#/upgrade-password`，T-19c / A-44 #84 的 T-19 拆分；PRD R-40④、UI §3.9.4）。
 *
 * R-40④ 是硬门禁：策略生效前设的弱密码，登录后**只拿到一次性 upgrade token**（正常 token 恒为空），
 * 不改密就哪儿也去不了。所以这一屏的**全部**存在理由就是把"不可关闭、不可跳过"落到 App 端：
 *
 *  1. **判据③ 全屏 + 无 tab**：本屏**不渲染**任何壳件，壳由 `main.tsx:53` 的 `Shell()` 按
 *     `routeFor(path).kind === 'gate'` 选 `shell/GateLayout`（无底部 tab、无返回箭头、无关闭 X、
 *     `data-locked="1"`）。路由行 `router.tsx:60` 已登记 `kind: 'gate'` ⇒ **A-44 #86：本屏对
 *     `router.tsx` / `main.tsx` 零 diff**，挂载由 TPM 串行收口。
 *  2. **判据③ 物理返回不退出**：返回语义的唯一实现是 `router.handleSystemBack()`，它对
 *     `GATE_UPGRADE_PATH` 返回 `'stay'`（**不 `back()`、不含 `exit` ⇒ 原生不做任何动作**）。
 *     本屏只做它做不到的那一半 —— **告知用户"这一下被拦住了"**：`installRouterGlobals()` 已把
 *     冻结钩子 `window.onAndroidBack` 装上，本屏在挂载期间把它**装饰**一层（调用原函数、
 *     原样返回它的返回值，解绑时按"仍然是我装饰的那一份"才还原 —— 与 `shell/BackKeyBridge.tsx:24`
 *     同型、顺序无关），命中 `'stay'` 就把 `blockedBackSignal` 自增，共用件
 *     `ForcePasswordUpgradeForm` 据此 shake 一次并把焦点送回"当前密码"（§3.9.4 末段）。
 *     浏览器 / 真机上没有该钩子时（未装路由的 dev 环境）不装饰，页内 `Esc`/`←` 已由共用件拦下。
 *  3. **两个出口，且只有两个**：主按钮 `更新密码并继续` 与其下居中的 `退出登录`。两颗串的**唯一写者**
 *     是 `@tm/shared` 的 `AUTH_COPY.forceUpgrade`（`submit` / `secondary`；主按钮文案由共用件内部直接
 *     引 `AUTH_COPY.forceUpgrade.submit`，本屏没有传它的 prop，也就没有抄第二份的可能）。
 *     本屏**不新增任何中文字面量**（spec 的源码哨兵：剥注释后 CJK 0 命中），也不给任何
 *     "以后再说 / 稍后再改 / 下次提醒 / 宽限期"式第三出口（§3.9.4 全站 0 处 + PRD §8.3-D 第 20 项）。
 *  4. **提交 = `data/queries/auth.ts` 的 `forceUpgradeMutationOptions()`（全仓唯一份）**，
 *     成功链按 R-40④ 走 `auth-store.afterPasswordChanged(facts)` 这**一个**函数：
 *     落正常 30 天 token + 作废一次性 upgrade token + 广播一次都在它里面（判据② 的单点镜像）。
 *     ⇒ 本屏 **0 命中** `writeToken` / `saveSessionToken` / `clearUpgradeToken` / `clearCredential` /
 *     `localStorage` / `AndroidBridge`（哨兵机检）；唯一读到的凭据是 `currentUpgradeToken()`
 *     （**只读**，交给 mutation 当 Header，值不落第二处），因为 `token-bridge.ts:4` 写明"五张屏
 *     永远不直接 import `native/bridge.js`、要问就只问它"。
 *     回跳目标 = `takePendingAction()` 的 `open` 路径（用户第 1 步想去的那页），没有就回首页。
 *  5. **成功告知（§3.9.4 / R-40③）由宿主挂**：toast `AUTH_COPY.changePassword.success.toast`（一闪）
 *     + `result` 槽常驻 `TOAST_LONG_MS`（shared 唯一值 = 6 秒）的
 *     `AUTH_COPY.changePassword.success.reloginNotice`，到点才离开本页 —— 常驻时长不抄第二份。
 *  6. **失败面**：`errorCode` / `serverMessage` / `pending` 三个 props 接回共用件，
 *     落点（哪格显示哪句）由 `ChangePasswordForm` 按 §3.9.5 裁决；服务端回了码就显示服务端原因，
 *     契约外的失败（网络断 / 超时）由既有单点 `apiErrorMessage()` 成人话 ⇒ §3.9.5 的"不得静默"。
 *     本屏 0 命中 `=== 401`、0 命中 `handleAuthError(`，成不了第二份状态码处理。
 *
 * 谁都不该停在页上（与 Web `app/upgrade-password/page.tsx` 判据⑦ 反向那一支同口径）：
 *  - 既无一次性凭据也无正常凭据（游客直访）→ 回 `/login`；
 *  - 已握正常 token（= 止血阀 `passwordUpgradeEnforce=off` 的软告知面，应用可用）→ 放行回首页，
 *    那条面上的改密出口按 §5.3 属「我的 → 安全」（T-19d 的 `SecurityScreen` + 普通改密 mutation），
 *    **不在本屏另起一条串**（已登记为上报项）。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`，不用逻辑赋值 `||=`/`??=`（Chrome 85 起才有）。
 */

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ARIA, AUTH_COPY, TOAST_LONG_MS, type AuthResultDto } from '@tm/shared';
import {
  ForcePasswordUpgradeForm,
  NoticeBar,
  useHost,
  type PasswordChangeValues,
} from '@tm/ui';
import { forceUpgradeMutationOptions } from '../data/queries/auth.js';
import { apiErrorMessage, isApiError } from '../data/rest-fetcher.js';
import {
  LOGIN_ROUTE,
  afterPasswordChanged,
  signOut,
  takePendingAction,
  useAuthSnapshot,
} from '../lib/auth-store.js';
import { currentUpgradeToken } from '../lib/token-bridge.js';

/* 改密成功后没有待续作动作时的落点：hash 路由首页（与 `router.tsx` 的根路由、`LoginScreen` 同值）。 */
const HOME_ROUTE = '/';

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

export default function UpgradePasswordScreen(): React.JSX.Element | null {
  const host = useHost();
  const queryClient = useQueryClient();
  const auth = useAuthSnapshot();

  /** R-40④ 硬门禁 = **只**握一次性凭据（`auth-store` 的派生位，本屏不自算第二份判定）。 */
  const hardGate = auth.upgradeSessionOnly;

  const [failure, setFailure] = React.useState<ScreenFailure>(NO_FAILURE);
  const [blockedBackSignal, setBlockedBackSignal] = React.useState(0);
  const [done, setDone] = React.useState(false);
  /** 成功后的"第 1 步想去的那页"，在成功那一轮算好，6 秒后照着走。 */
  const returnToRef = React.useRef<string>(HOME_ROUTE);
  /** 已经发起过"离开本页"（两颗出口之一）⇒ 派生态变化不得再触发第二次跳转。 */
  const leavingRef = React.useRef(false);

  const upgradeMutation = useMutation(forceUpgradeMutationOptions());
  const pending = upgradeMutation.isPending;

  /** 离开本页的唯一两种方式：清掉上一会话的查询缓存再走 hash 路由（与 `LoginScreen.leaveTo` 同形）。 */
  const leaveTo = React.useCallback(
    (target: string): void => {
      leavingRef.current = true;
      queryClient.clear();
      host.navigate(target);
    },
    [host, queryClient],
  );

  /* 判据③：物理返回被拦下时给一次可见反馈（不做任何跳转、不改返回值，见文件头第 2 条）。 */
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const previous = window.onAndroidBack;
    if (typeof previous !== 'function') return;
    const decorated = (): string => {
      const action = previous();
      if (action === 'stay') setBlockedBackSignal((n) => n + 1);
      return action;
    };
    window.onAndroidBack = decorated;
    return () => {
      // 只还原"仍然挂着我这一层"的那一份：与 `BackKeyBridge` 的装卸顺序无关。
      if (window.onAndroidBack === decorated) window.onAndroidBack = previous;
    };
  }, []);

  /* 不该在这一页的人：等状态确定后换出去，本页不放"你也可以不走"的第三选项，也不留任何文案。
     `leavingRef` 让"已经在出口路上"的这一次派生变化不再补第二跳（退出登录清完凭据会立刻重算快照）。 */
  React.useEffect(() => {
    if (hardGate || done || leavingRef.current) return;
    host.navigate(auth.hasToken ? HOME_ROUTE : LOGIN_ROUTE);
  }, [auth.hasToken, done, hardGate, host]);

  /* §3.9.4「成功」+ R-40③：信息条常驻 `TOAST_LONG_MS` 后才回原页（时长只有 shared 那一份）。 */
  React.useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => leaveTo(returnToRef.current), TOAST_LONG_MS);
    return () => clearTimeout(timer);
  }, [done, leaveTo]);

  const settleUpgrade = (facts: AuthResultDto): void => {
    // 换钥匙的**唯一**动作：正常 token 落点 + 一次性凭据作废 + 广播，全在 auth-store 里。
    afterPasswordChanged(facts);
    const action = takePendingAction();
    returnToRef.current = action && action.kind === 'open' ? action.path : HOME_ROUTE;
    setDone(true);
    host.toast(AUTH_COPY.changePassword.success.toast, 'success');
  };

  const submitValues = async (values: PasswordChangeValues): Promise<void> => {
    if (pending || done) return;
    setFailure(NO_FAILURE);
    try {
      const facts = await upgradeMutation.mutateAsync({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
        upgradeToken: currentUpgradeToken(),
      });
      settleUpgrade(facts);
    } catch (error) {
      setFailure(failureOf(error));
    }
  };

  /* 唯一副出口（A-32-4 会话语义：与 Web 同形态 = 只清本机凭据后回登录，账号与进度都在服务端）。 */
  const handleSignOut = (): void => {
    if (done) return;
    setFailure(NO_FAILURE);
    leaveTo(signOut());
  };

  const result = done ? (
    <NoticeBar layout="bar" tone="success" role="status" testid="upgrade-result-notice">
      {AUTH_COPY.changePassword.success.reloginNotice}
    </NoticeBar>
  ) : undefined;

  // 不该在这一页的人：上面那条 effect 正在把他换出去，这一帧不给任何表单、也不给任何自造文案
  // （Web 侧同一支给骨架 `upgrade-password-bounce`；App 侧不写新串 ⇒ 空帧，最多一帧）。
  if (!hardGate && !done) return null;

  return (
    <div className="w-full" data-testid="upgrade-password-screen">
      <ForcePasswordUpgradeForm
        testid="force-upgrade"
        title={AUTH_COPY.forceUpgrade.title}
        subtitle={AUTH_COPY.forceUpgrade.subtitle}
        notice={AUTH_COPY.forceUpgrade.notice}
        signOutLabel={AUTH_COPY.forceUpgrade.secondary}
        showPasswordLabel={ARIA.showPassword}
        hidePasswordLabel={ARIA.hidePassword}
        pending={pending}
        errorCode={failure.code}
        serverMessage={failure.message === '' ? undefined : failure.message}
        blockedBackSignal={blockedBackSignal}
        result={result}
        onSubmit={(values) => {
          void submitValues(values);
        }}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
