/**
 * 打卡（R-13 的数据面）。`GET /api/checkin/status` / `POST /api/checkin` 是现网接口，
 * 返回 key 集合本期不加不改（§6.5-1）。本期**没有** `@tm/shared` 的 checkin 契约（见报告
 * "给 TPM/T-03 的需求"），所以这里只做"用到的两个键"的最小读取，其余原样带走给页面。
 * "今天已打卡 · 连续 N 天"的文案来自 `CHECKIN_COPY`，数据层不写第二份。
 */

import { queryOptions } from '@tanstack/react-query';
import { CHECKIN_COPY } from '@tm/shared';
import { apiGet, apiPost } from '../rest-fetcher.js';

export interface CheckinStatusDto {
  checkedToday: boolean;
  streak: number;
  /** 服务端原样字段（REST 与 tRPC 的 snake/camel 分叉由 T-07/T-10 收敛，客户端只做兜底）。 */
  raw: Record<string, unknown>;
}

export const checkinKeys = {
  all: ['checkin'] as const,
  status: () => [...checkinKeys.all, 'status'] as const,
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const numberOr = (source: Record<string, unknown>, ...keys: string[]): number => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
};

const booleanOr = (source: Record<string, unknown>, ...keys: string[]): boolean => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return false;
};

export function normalizeCheckinStatus(raw: unknown): CheckinStatusDto {
  const record = asRecord(raw);
  return {
    checkedToday: booleanOr(record, 'checkedToday', 'checked_in_today'),
    streak: numberOr(record, 'streak', 'streakDays', 'streak_days'),
    raw: record,
  };
}

export function checkinStatusQueryOptions() {
  return queryOptions<CheckinStatusDto>({
    queryKey: checkinKeys.status(),
    staleTime: 20 * 1000,
    queryFn: () => apiGet('/api/checkin/status', { auth: true }, normalizeCheckinStatus),
  });
}

/** 打卡按钮的三态文案（未打卡 / 已打卡 / 提交中）全部来自 `CHECKIN_COPY`。 */
export function checkinLabel(status: CheckinStatusDto | undefined): string {
  if (!status) return CHECKIN_COPY.notDone.cta;
  return status.checkedToday ? CHECKIN_COPY.done(status.streak) : CHECKIN_COPY.notDone.cta;
}

export function submitCheckin() {
  return apiPost('/api/checkin', {}, { auth: true });
}
