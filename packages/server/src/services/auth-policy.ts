/**
 * 认证策略（REST 与 tRPC 共用）
 *
 * - 开发后门码：默认不存在。仅当 NODE_ENV !== 'production' 且显式设置
 *   AUTH_DEV_MASTER_CODE 环境变量时生效（生产环境该变量一律无效）。
 * - 登录失败锁定：同一手机号连续失败 5 次锁定 10 分钟（内存实现，重启清零）。
 */

import { checkRateLimit } from '../middleware/rate-limit.js';

const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

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
  return checkRateLimit(`login:${ip}`, 10, 60_000).ok;
}

/** 发送验证码 IP 限流：6 次/小时（防短信轰炸） */
export function checkSendCodeIpLimit(ip: string): boolean {
  return checkRateLimit(`sendcode:${ip}`, 6, 3600_000).ok;
}
