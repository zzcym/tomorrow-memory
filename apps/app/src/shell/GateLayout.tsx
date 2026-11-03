/**
 * 门禁页布局（UI §3.9.4 / R-40 ④）：登录页与**强制改密页**共用的全屏壳。
 *
 * 与 `TabBarShell` 的差别就是"少了什么"：**无底部 tab、无返回箭头、无关闭 X、也不给任何"延后再处理"的第三选项**
 * （R-40 ④ 写死改密前只允许该页 + 退出登录；判据 = `node tools/boundaries.mjs --password` 的
 * 零容忍扫描，本文件不复述那个作废口径的词）。
 * 物理返回键在 `handleSystemBack()` 里对 `/upgrade-password` 返回 `stay`，原生不做任何动作。
 *
 * 页面本体（表单）归批次4：`/login` 与 `/upgrade-password` 由 T-19 用 `@tm/ui/auth` 的
 * `AuthFormShell` / `ChangePasswordForm` 填充（§10.4 交接）。
 */

import * as React from 'react';
import { GATE_UPGRADE_PATH, useLocation } from '../router.js';

export interface GateLayoutProps {
  children: React.ReactNode;
  /** 顶部一行（例如手机号回显）；**不放**返回按钮。 */
  header?: React.ReactNode;
  /** 默认按当前路由判定：`/upgrade-password` → 不可退出（`dismissible = false`）。 */
  dismissible?: boolean;
}

/** 强制改密页：禁止任何"离开本页"的入口（退出登录在该页内是一个动作，不是关闭）。 */
export const isUpgradeGatePath = (path: string): boolean => path === GATE_UPGRADE_PATH;

export function GateLayout({
  children,
  header,
  dismissible,
}: GateLayoutProps): React.JSX.Element {
  const loc = useLocation();
  const locked = dismissible === false || isUpgradeGatePath(loc.path);
  return (
    <div
      className="flex min-h-dvh flex-col bg-bg text-ink"
      data-testid="gate-layout"
      data-locked={locked ? '1' : '0'}
    >
      <div className="mx-auto w-full max-w-auth px-4 pb-8 pt-10">
        {header ? <div className="mb-4">{header}</div> : null}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
