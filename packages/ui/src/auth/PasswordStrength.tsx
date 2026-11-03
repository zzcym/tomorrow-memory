'use client';

/**
 * `PasswordStrength`（UI §3.9.2 强度条；判据⑥ = 分级与阈值全部来自 `@tm/shared`，本件零本地判据）。
 *
 * - 分级唯一计算 = `passwordStrength()`（`packages/shared/src/utils.ts`，与放行判据同源）；
 * - 四档标签唯一源 = `AUTH_COPY.strengthLevels`（长度即段数，索引与分级一一对应）；
 * - `<8 位` 的提示逐字 = `strengthLevels[0]`，与 `TM_ERRORS.WEAK_PASSWORD.copy` 同一句（shared 已锁）；
 * - 放行判据（`PASSWORD_MIN` / `PASSWORD_MAX_BYTES`）在表单侧用，本件**不做放行**（shared 的函数注释即此约束）。
 *
 * 形状（§3.9.2）：4 段等宽 4px 高条 + `gap-1` + 右侧 12px 文字；`role="status"` `aria-live="polite"`，
 * 段条本体 `aria-hidden`。不显示百分比、不显示 crack-time、不显示仪表图。
 */
import * as React from 'react';
import { AUTH_COPY, passwordStrength } from '@tm/shared';
import { cn } from '../host.js';

export type PasswordStrengthLevel = 0 | 1 | 2 | 3;

export interface PasswordStrengthProps {
  /** 当前输入框的原值（未去空格；分级函数自己判）。 */
  value: string;
  /** 只画条不画右侧文字（宿主自己排版标签时用）。 */
  hideLabel?: boolean;
  id?: string;
  className?: string;
  testid?: string;
}

/** 段数 = 标签数组长度（shared 唯一源），最大档 = 段数 - 1 = `passwordStrength()` 的返回上界。 */
const SEGMENTS = AUTH_COPY.strengthLevels.length;
const MAX_LEVEL = SEGMENTS - 1;

/** §3.9.2 的"2–3 段"区间按等比取整：1→1 段、2→3 段、3→满段；0 档全 `--hair`。 */
const FILLED_SEGMENTS: Record<PasswordStrengthLevel, number> = {
  0: 0,
  1: Math.round((1 / MAX_LEVEL) * SEGMENTS),
  2: Math.round((2 / MAX_LEVEL) * SEGMENTS),
  3: SEGMENTS,
};

const FILL_CLASS: Record<PasswordStrengthLevel, string> = {
  0: 'bg-hair',
  1: 'bg-warning',
  2: 'bg-success',
  3: 'bg-success',
};

export function PasswordStrength({
  value,
  hideLabel = false,
  id,
  className,
  testid,
}: PasswordStrengthProps): React.JSX.Element {
  const level = passwordStrength(value) as PasswordStrengthLevel;
  const label = AUTH_COPY.strengthLevels[level] ?? '';
  const filled = FILLED_SEGMENTS[level];

  return (
    <span
      id={id}
      data-testid={testid ?? 'password-strength'}
      data-level={level}
      data-filled={filled}
      role="status"
      aria-live="polite"
      className={cn('mt-1 flex items-center gap-2', className)}
    >
      <span aria-hidden="true" className="flex h-1 flex-1 gap-1">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={cn('h-1 flex-1 rounded-full transition-colors duration-micro ease-standard', index < filled ? FILL_CLASS[level] : 'bg-hair')}
          />
        ))}
      </span>
      {!hideLabel ? (
        <span className={cn('shrink-0 text-xs leading-none', level === 0 ? 'text-danger' : 'text-ink-muted')}>{label}</span>
      ) : null}
    </span>
  );
}

export default PasswordStrength;
