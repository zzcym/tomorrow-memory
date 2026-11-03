'use client';

/**
 * `UpgradeGate`（T-16 / R-40④；判据⑦）。挂在**根 layout** 的唯一一层拦截（`app/layout.tsx` 对
 * 本任务的例外授权只有"1 个 import + 1 个包裹标签"，本文件就是那个标签背后的全部逻辑）。
 *
 * ## 硬约束：只读一位标志位，绝不做网络请求
 * §10.2 T-16 行的风险栏写死了缓解方案：这一层包在全站最外面，**任何一次网络往返都可能变成全站白屏**。
 * 所以本组件的输入只有一个：`localStorage` 的 `tm_upgrade_required` 一位（`lib/auth.ts` 写、
 * `useUpgradeRequired()` 读）。谁去置它？只有两条路：
 *  1. 登录响应 `upgrade_required && token === ''` → `login-dialog.tsx` 调 `applyAuthResult()`；
 *  2. 任一业务调用回 403 `PASSWORD_UPGRADE_REQUIRED` → `providers.tsx` 的凭据单点。
 * 两者都发生在"用户本来就在做的事"里，门禁层自己不发一个请求。
 *
 * ## 白屏风险的三重兜底
 *  1. **服务端与水合帧恒渲染 children**（server snapshot = `false`）⇒ 未命中门禁的访问者看到的
 *     DOM 与没有这一层时逐字相同（e2e 的"零副作用"用例钉的就是这条，判据⑦ 之外的硬要求）；
 *  2. 外层 `UpgradeGateBoundary`：本组件自身任何一次抛错都只是"这一层不拦"，绝不把 children 一起带走；
 *  3. 命中门禁时不透出业务内容也不空白：给骨架 + `router.replace('/upgrade-password')`，
 *     改密页自己只有"改密 / 退出"两个出口（判据⑦）。
 *
 * 同文件另出口 `UpgradeEntryNotice`：R-23⑦ 末句要求的"业务入口显示'请先修改密码'+ 改密按钮"，
 * 落点在止血阀 off（人已进门、仍待改密）的那一条软告知路径上，供页面 owner 采用。
 */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SETTINGS_COPY, TM_ERRORS } from '@tm/shared';
import { SkeletonBlock } from '@tm/ui';
import { useUpgradeAdvisory, useUpgradeRequired } from '@/lib/use-auth';
import { UPGRADE_PATH } from '@/lib/api/auth';

/** 门禁层抛错时的兜底：把 children 原样交出去（宁可少拦一层，不可全站白屏）。 */
class UpgradeGateBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** 不吞：命中这条路径说明门禁层自己有缺陷，留给控制台与 §8.3 走查（不弹窗、不替用户决定）。 */
  override componentDidCatch(error: unknown): void {
    if (typeof console !== 'undefined') console.warn('[upgrade-gate] fail-open', error);
  }

  /**
   * 出错后交回的是**未经本层包裹的 children**（`fallback`）而不是 `children` 本身：
   * 后者还是那颗抛错的 `UpgradeGateInner`，原样重渲染等于第二次抛错、直接冒到根，
   * 那样"这一层不拦"就成了空话（判据⑦ 的白屏风险正条）。
   */
  override render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function UpgradeGateInner({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const gated = useUpgradeRequired();
  /**
   * 当前路径必须**反应式**读（F-25 / A-68 #193）：原先这里是渲染期直读
   * `window.location.pathname` —— `router.replace(UPGRADE_PATH)` 换页后本组件没有任何依赖变化
   * ⇒ 不再重算 ⇒ `onUpgradePage` 永远是 `false`，门禁换页之后一直返回下面那颗 blocking 骨架，
   * 判据⑦ 的主路径停在骨架屏（用户看到 URL 已经变了，页面却永远不出内容）。
   * 改为 `usePathname()`，与同仓另外四颗同类组件（`header.tsx:19`、`login-dialog.tsx:32`、
   * `login-wall.tsx:26`、`mobile-nav.tsx:16`）同一范式；服务端快照即当前路由，不引入水合差异。
   */
  const onUpgradePage = usePathname() === UPGRADE_PATH;

  /**
   * 依赖里的 `onUpgradePage` 变成反应式后，换页那一跳会重跑本 effect —— 但下一行就是出口：
   * 落到 `UPGRADE_PATH` 之后 `onUpgradePage` 为真 ⇒ 直接 return，**不会**再 replace 第二次
   * （A-68 #193 要求的那颗哨在 e2e 侧：`upgrade.spec.ts` 数**指向本路径的 RSC 软导航请求**至多 1 次）。
   */
  React.useEffect(() => {
    if (!gated || onUpgradePage) return;
    router.replace(UPGRADE_PATH);
  }, [gated, onUpgradePage, router]);

  if (!gated || onUpgradePage) return <>{children}</>;

  return (
    <div data-testid="upgrade-gate-blocking">
      <SkeletonBlock variant="card" />
      <SkeletonBlock variant="text" rows={2} className="mt-3" />
    </div>
  );
}

/** 根 layout 用的包裹标签（`app/layout.tsx` 里只出现 `<UpgradeGate>` 一处）。 */
export function UpgradeGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <UpgradeGateBoundary fallback={children}>
      <UpgradeGateInner>{children}</UpgradeGateInner>
    </UpgradeGateBoundary>
  );
}

/**
 * R-23⑦ 末句：门禁状态下业务入口显示"请先修改密码"+ 改密按钮。
 * 正文 = `TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy`（§4.6 唯一真源），动作 = `SETTINGS_COPY.upgradeTodo.cta`，
 * 本件零请求：点击只是把用户送去改密页（正常凭据仍在，改密页用 `auth.me` 读 `upgradeRequired`）。
 */
export function UpgradeEntryNotice({ className }: { className?: string }): React.JSX.Element | null {
  const router = useRouter();
  const advisory = useUpgradeAdvisory();
  if (!advisory) return null;
  return (
    <div
      data-testid="upgrade-entry-notice"
      role="status"
      className={className ?? 'flex min-h-tap items-center justify-between gap-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-ink'}
    >
      <span>{TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy}</span>
      <button
        type="button"
        data-testid="upgrade-entry-cta"
        onClick={() => router.push(UPGRADE_PATH)}
        className="inline-flex min-h-tap items-center rounded-md px-2 text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        {SETTINGS_COPY.upgradeTodo.cta}
      </button>
    </div>
  );
}

/** 强制改密页的唯一路径（真源在 `lib/api/auth.ts`，这里再出口一次给页面 owner 用）。 */
export { UPGRADE_PATH };

export default UpgradeGate;
