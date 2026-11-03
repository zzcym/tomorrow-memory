'use client';

/**
 * 全局 Provider：React Query + tRPC（**凭据域错误的唯一执行点**，T-16 / 判据⑥⑦）
 *  - subscription（SSE 流式查词）→ httpSubscriptionLink
 *  - 其它（query/mutation）→ httpBatchLink
 *
 * ## 为什么"401 单点"落在 QueryCache / MutationCache，而不是自定义 link
 * tRPC v11 的公共出口里没有 `errorLink`（`@trpc/client@11.18` 的 index 只导出
 * `loggerLink / retryLink / splitLink / http*Link`），自己写一个 `observable` 链要把
 * `@trpc/server/observable` 拖进浏览器包里，而 React Query 本来就有**两个全局错误钩子**
 * （query 与 mutation 各一），两处共用下面这一个 `handleCredentialError`：
 *  - `CREDENTIAL_EXPIRED`（R-40③）→ 清本地凭据 + 提示"密码已修改，请重新登录" + 请求打开登录弹窗；
 *  - `PASSWORD_UPGRADE_REQUIRED`（R-40④）→ 置门禁标志位 + 进 `/upgrade-password`。
 * 判据⑥/⑦ 的"单点"含义是**全站只有这一处会因 401/403 动凭据与路由**，页面与组件一律不各自 `catch`。
 * 因此 13 处 `useAuthed()` 调用点、`login-dialog` 的 `onError` 都不需要改一行 —— 偏差登记见报告 §4。
 *
 * ## 三条不会误伤的保护
 *  1. **只认 §4.6 的码**（`lib/api/auth.ts` 查 `TM_ERRORS.clientAction`），不看 HTTP 状态也不看 message；
 *     登录密码错、`NO_PASSWORD_ACCOUNT` 都是 401，它们属于弹窗内的分支，清凭据就是把用户踢出登录流程；
 *  2. `retry` 仍按原配置（1 次），但 `clearCredential()` 之后同一个查询不会再带旧 token 重试成功，
 *     故不会来回打接口；
 *  3. 一次网络抖动可能连回多条同码错误 → `ARM` 冷却窗内只处理第一条（toast 不刷屏、路由不打转）。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpSubscriptionLink, loggerLink, splitLink } from '@trpc/client';
import { toast } from 'sonner';
import { TM_ERRORS } from '@tm/shared';
import { trpc, trpcUrl } from '@/lib/trpc';
import {
  clearCredential,
  enterUpgradeSession,
  getToken,
  getUpgradeToken,
  isUpgradePending,
  requestLogin,
} from '@/lib/auth';
import { bearerFor, isCredentialExpired, isUpgradeRequiredError, UPGRADE_PATH } from '@/lib/api/auth';

/** 同码错误的冷却窗：只压重复 toast / 重复跳转，不影响业务错误的正常提示。 */
const CREDENTIAL_ARM_MS = 1500;
let lastCredentialHandledAt = 0;
let lastUpgradeHandledAt = 0;

/**
 * 凭据域错误的单点处理（判据⑥⑦）。
 * 返回 `true` = 本条已由这里接管（调用方不必再提示第二次）。
 */
export function handleCredentialError(error: unknown, navigate?: (to: string) => void): boolean {
  if (typeof window === 'undefined') return false;

  if (isCredentialExpired(error)) {
    const now = Date.now();
    if (now - lastCredentialHandledAt < CREDENTIAL_ARM_MS) return true;
    lastCredentialHandledAt = now;
    clearCredential();
    toast.error(TM_ERRORS.CREDENTIAL_EXPIRED.copy);
    requestLogin();
    return true;
  }

  if (isUpgradeRequiredError(error)) {
    const now = Date.now();
    if (now - lastUpgradeHandledAt < CREDENTIAL_ARM_MS) return true;
    lastUpgradeHandledAt = now;
    // 服务端只在待升级会话上回这个码；标志位是 `upgrade-gate` 唯一读的那一位，不新造语义
    enterUpgradeSession(getUpgradeToken() ?? undefined);
    if (window.location.pathname !== UPGRADE_PATH) {
      if (navigate) navigate(UPGRADE_PATH);
      else window.location.replace(UPGRADE_PATH);
    }
    return true;
  }

  return false;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const go = (to: string): void => router.replace(to);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
        queryCache: new QueryCache({
          // 查询侧：401/403 只可能来自"凭据已不可用"，一律进这一个函数（判据⑥）
          onError: (error) => handleCredentialError(error, go),
        }),
        mutationCache: new MutationCache({
          // 变更侧同一点。登录/注册那两条的失败**不会**被这里接管：
          // `NO_PASSWORD_ACCOUNT` 的 `clientAction` 是 `switch-to-register`、密码错根本不带 §4.6 码，
          // 两者都返回 `false`，弹窗继续就地显示自己的提示（判据④⑤⑨ 的落点在 `login-dialog.tsx`）。
          onError: (error) => handleCredentialError(error, go),
        }),
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({ enabled: () => false }),
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({ url: trpcUrl() }),
          false: httpBatchLink({
            url: trpcUrl(),
            headers() {
              const token = bearerFor({
                normal: getToken(),
                upgrade: getUpgradeToken(),
                gated: isUpgradePending(),
              });
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
          }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
