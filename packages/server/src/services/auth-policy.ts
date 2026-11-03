/**
 * 认证策略（REST 与 tRPC 共用）
 *
 * - 开发后门码：默认不存在。仅当 NODE_ENV !== 'production' 且显式设置
 *   AUTH_DEV_MASTER_CODE 环境变量时生效（生产环境该变量一律无效）。R-01⑨ 的回归断言点。
 * - 登录失败锁定：同一手机号连续失败 5 次锁定 10 分钟（内存实现，重启清零）。
 *   阈值取自 `@tm/shared/constants/limits`，不再落本地字面量。
 * - K-1 配额（R-39③ / §8.3-E 第 2 项）：同 IP **每日**新建账号 ≤5、每日激活 ≤20，
 *   两个桶分别计数、互不占用；另有同 IP 每分钟 10 次的凭据端点总闸（第 11 次即 429）。
 *   Redis 迁移属 §7 后续接入项（审计 C-13），本期保留进程内 Map 语义。
 */

import {
  ACTIVATE_IP_DAILY_LIMIT,
  IP_RATE_LIMIT_PER_MINUTE,
  LOGIN_FAIL_LIMIT,
  LOGIN_LOCK_MINUTES,
  REG_IP_DAILY_LIMIT,
} from '@tm/shared';
import { checkRateLimit } from '../middleware/rate-limit.js';

const MAX_FAILURES = LOGIN_FAIL_LIMIT;
const LOCK_MS = LOGIN_LOCK_MINUTES * 60 * 1000;
const DAY_MS = 86_400_000;

const failures = new Map<string, { count: number; lockedUntil: number }>();

export function isMasterCode(code: string): boolean {
  const master = process.env.AUTH_DEV_MASTER_CODE ?? '';
  return (
    master.length > 0 && process.env.NODE_ENV !== 'production' && code === master
  );
}

/** 登录失败计数；返回 true 表示当前已锁定（应拒绝尝试） */
export function registerLoginFailure(phone: string): boolean {
  const rec = failures.get(phone) ?? { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= MAX_FAILURES) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  failures.set(phone, rec);
  return rec.lockedUntil > Date.now();
}

/** §4.7 里给 auth-service 用的名字（同一个函数，不另写第二份计数） */
export const recordFailure = registerLoginFailure;

export function isLoginLocked(phone: string): boolean {
  const rec = failures.get(phone);
  if (!rec) return false;
  if (rec.lockedUntil > Date.now()) return true;
  if (rec.lockedUntil !== 0) failures.delete(phone);
  return false;
}

export function clearLoginFailures(phone: string): void {
  failures.delete(phone);
}

/** 登录接口 IP 限流：10 次/分钟（含成功与失败，防爆破/防刷） */
export function checkLoginIpLimit(ip: string): boolean {
  return checkRateLimit(`login:${ip}`, IP_RATE_LIMIT_PER_MINUTE, 60_000).ok;
}

/** 发送验证码 IP 限流：6 次/小时（防短信轰炸） */
export function checkSendCodeIpLimit(ip: string): boolean {
  return checkRateLimit(`sendcode:${ip}`, 6, 3600_000).ok;
}

/* ─────────────────────── K-1：注册 / 激活的 IP 侧配额 ─────────────────────── */

/** 同 IP 每分钟 10 次的凭据端点总闸（登录 / 注册 / 激活共用一个桶，§8.3-E 第 2 项的"第 11 次"） */
export function checkCredentialEndpointLimit(ip: string): boolean {
  return checkRateLimit(`credential:${ip}`, IP_RATE_LIMIT_PER_MINUTE, 60_000).ok;
}

const dayKey = (): string => new Date().toISOString().slice(0, 10);

/** 同 IP 每日新建账号 ≤5（`passwordRegister=off` 时该配额仍需生效，但激活不受开关影响） */
export function checkRegisterDailyLimit(ip: string): boolean {
  return checkRateLimit(`reg_ip_daily:${ip}:${dayKey()}`, REG_IP_DAILY_LIMIT, DAY_MS).ok;
}

/**
 * 同 IP 每日激活 ≤20。
 * ⚠ 与上一个桶**互不占用**（R-39③）；且激活桶不受 `passwordRegister` 开关影响（§6.4-5-4 / R-39⑤b）。
 */
export function checkActivateDailyLimit(ip: string): boolean {
  return checkRateLimit(`activate_ip_daily:${ip}:${dayKey()}`, ACTIVATE_IP_DAILY_LIMIT, DAY_MS).ok;
}

/** 测试钩子：清空全部进程内计数，避免用例互相污染（不改任何生产语义） */
export function __resetAuthPolicyStateForTest(): void {
  failures.clear();
}
