// A-30-8 / A-28-4 动作通道 fixture：三个冻结集合 + 一个只许追加的 supplement 位。
// 行号是刻意排出来的，红/绿 patch 按行号写死（改这个文件要同步改 patches）。
export const TM_ERROR_CODES = {
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

export const TM_ERROR_ROWS = [
  { code: 'NOT_FOUND', http: 404, message: '没找到' },
] as const;

export const TM_ERRORS = {
  NOT_FOUND: { http: 404, message: '没找到' },
} as const;

/** 追加位：新错误码只许进这里（A-28-4「第二张错误码表不存在」）。 */
export const TM_ERRORS_SUPPLEMENT = {
  FORBIDDEN: { http: 403, message: '被拦下' },
} as const;
