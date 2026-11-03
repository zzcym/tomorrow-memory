/**
 * 账号事件落库审计（S17 / R-39⑤b / R-40④ / PRD §8.3-E 第 3 项）
 *
 * 表 `account_audit_log` 由 T-06 的 M3 提供，本文件只是它的**唯一调用方**，负责：
 *  - 动作名常量（`account_registered` / `account_activated` / `register_rejected` / `password_changed` / `password_upgraded`）；
 *  - 手机号只留后 4 位（`maskPhoneTail`）；
 *  - **绝不含明文密码或其 hash**（DB 层 `assertNoCredentialLeak` 是硬拦，本层负责不把凭据传进去）；
 *  - 写失败 = 抛出，不静默跳过（§4.5："激活成功但查不到记录"会破坏 §6.4-4 的对账判据）。
 *
 * ⚠ 契约偏差 C-1（已在报告登记，待 TPM 裁决）：表没有"错误码"列，
 * 而 §8.3-E 第 3 项要求记录"成功或失败**与错误码**"。本层把它编进 `result`：
 * `ok` / `fail:<TM_ERROR_CODE>`（ outcome 仍是 ok/fail 两值，前缀判定不受影响）。
 * 需求：请 T-06 在 M7 给 `account_audit_log` 加一列可空 `detail TEXT`，届时改回 `result='fail'` + `detail=<code>`。
 */

import type { TmErrorCode } from '@tm/shared';
import type { AppDB } from '../db/types.js';
import { maskPhoneTail } from './password-policy.js';

export const AUDIT_ACTIONS = {
  /** 新建账号成功（§8.3-E 第 3 项的"新建号"事件）。 */
  accountRegistered: 'account_registered',
  /** R-39⑤b 激活认领（动作名由 PRD 固定，不得改）。 */
  accountActivated: 'account_activated',
  /** 命中"已设有密码"的注册请求（§8.3-D 第 6 项的冒领主例必须可回溯）。 */
  registerRejected: 'register_rejected',
  /** 主动改密（R-40② 的 `PUT /api/password` / `auth.changePassword`）。 */
  passwordChanged: 'password_changed',
  /** R-40④ 强制改密成功（动作名由 PRD 固定）。 */
  passwordUpgraded: 'password_upgraded',
  /** 空密码账号被拿去走密码校验分支（R-01③(c)：不签发 token，也要能查到是谁）。 */
  loginNoPasswordAccount: 'login_no_password_account',
  /**
   * 登出（A-32-4：会话语义）：服务端**不推进 `password_changed_at`**、不碰 `password` 列，
   * 只落这一条留痕 —— 全量 token 失效仍由改密（R-40③）触发。
   * PRD 只固定了 `account_activated` / `password_upgraded` 两个动作名，
   * 本行是 §4.7 "登出型操作"的落点，不改变那两条的字面。
   */
  accountLogout: 'account_logout',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditMeta {
  ip?: string | null;
  ua?: string | null;
}

export interface AccountAuditService {
  /**
   * 追加一条。`code` 提供时落 `fail:<code>`，否则落 `ok`。
   * 返回落库行 id；抛错即调用方事务边界之外（写失败不静默）。
   */
  record(input: {
    userId: number;
    phone?: string | null;
    action: AuditAction | string;
    ok: boolean;
    code?: TmErrorCode;
    meta?: AuditMeta;
    now?: number;
  }): Promise<number>;
  /** 按 user_id 回溯（§8.3-E 第 3 项的检索面）。 */
  listByUser(userId: number, limit?: number): Promise<Awaited<ReturnType<AppDB['audit']['listByUser']>>>;
}

export function createAccountAudit(db: AppDB): AccountAuditService {
  return {
    async record(input) {
      const now = input.now ?? Date.now();
      return db.audit.append(
        {
          userId: input.userId,
          phoneMasked: input.phone ? maskPhoneTail(input.phone) : null,
          action: input.action,
          result: input.ok ? 'ok' : `fail:${input.code ?? 'UNKNOWN'}`,
          ip: input.meta?.ip ?? null,
          ua: input.meta?.ua ?? null,
          now,
        },
        // 明文提示串**不传**：本层的 entry 里根本没有凭据字段，传 hint 只会让拒写判断误伤 UA
      );
    },
    async listByUser(userId, limit) {
      return db.audit.listByUser(userId, limit);
    },
  };
}

/** `fail:<CODE>` → `<CODE>`；`ok` → null。给 T-21 的对账脚本与测试用。 */
export function auditErrorCodeOf(result: string): string | null {
  if (!result.startsWith('fail:')) return null;
  return result.slice('fail:'.length);
}

/** 结果仍是"成功/失败"两值口径（§8.3-E 第 3 项）。 */
export function auditFailed(result: string): boolean {
  return result === 'fail' || result.startsWith('fail:');
}
