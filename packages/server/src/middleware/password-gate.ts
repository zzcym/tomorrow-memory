/**
 * 强制改密门禁的策略表（R-40④ / §4.7）
 *
 * 命中 `pw_policy_version = 0` 的账号登录后只拿到 upgrade token，
 * 而 **upgrade token 能打哪些接口**由本文件的 allowlist 唯一裁决 ——
 * REST 与 tRPC 共用同一份，避免两套口径（审计 C-09）。
 *
 * 清单逐字取自 §4.7：`['auth.forceChangePassword','POST /api/password/force','auth.logout','GET /api/me','auth.me']`，
 * 含义就是"改密前只允许访问 ① 强制改密页本身 与 ② 退出登录"（`/api/me` 与 `auth.me` 是改密页要读
 * 手机号/是否已设密码的只读自身端点）。**其余任何业务接口一律 403 `PASSWORD_UPGRADE_REQUIRED`**。
 *
 *  fail-closed 设计：本清单是"白名单"，新增端点默认**不**在清单内，
 * 因此忘了登记只会让待升级账号打不通该端点（正确行为），不会变成"绕过门禁"。
 */

import { TM_ERRORS } from '@tm/shared';

/** R-40④ 允许清单（tRPC 过程路径）。 */
export const TRPC_UPGRADE_ALLOWLIST = [
  'auth.forceChangePassword',
  'auth.logout',
  'auth.me',
] as const;

/** R-40④ 允许清单（`METHOD /path` 形式的 REST 路径）。 */
export const REST_UPGRADE_ALLOWLIST = [
  'POST /api/password/force',
  'POST /api/logout',
  'GET /api/me',
] as const;

export const PASSWORD_UPGRADE_TARGETS = {
  trpc: TRPC_UPGRADE_ALLOWLIST,
  rest: REST_UPGRADE_ALLOWLIST,
} as const;

export type UpgradeTargetGroup = keyof typeof PASSWORD_UPGRADE_TARGETS;

/** 精确匹配：只有逐字等于清单里的某一项才放行（不做前缀/通配，防"多放行"）。 */
export function isTargetAllowedUnderGate(target: string, list: readonly string[]): boolean {
  return list.includes(target);
}

/** 403 响应的三件套（REST 与 tRPC 共用同一份文案源，`@tm/shared` 是唯一真相）。 */
export const PASSWORD_GATE_ERROR = {
  code: 'PASSWORD_UPGRADE_REQUIRED' as const,
  status: TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.http,
  message: TM_ERRORS.PASSWORD_UPGRADE_REQUIRED.copy,
};

/** 给独立装配的路由用（T-09/T-10/T-11 若不复用 `auth()` 可自行判断同一件事）。 */
export function createPasswordGate(group: UpgradeTargetGroup): (target: string) => boolean {
  const list = PASSWORD_UPGRADE_TARGETS[group];
  return (target: string): boolean => isTargetAllowedUnderGate(target, list);
}
