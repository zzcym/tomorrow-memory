'use client';

/**
 * 背词三模式切换（UI §3.5.1 / R-12①）。
 *
 * 命名与取值唯一真源 = `@tm/shared` 的 `MODE_LABELS` + `QUEUE_MODES`（本文件不出现第二份模式名）。
 * `?mode=` 的读写在页面里（`studyModeFromParam` / `studyHref`），本组件只管渲染与回调 ——
 * 三段控件本身没有任何 IO，可以脱开路由单测。
 */

import * as React from 'react';
import { MODE_LABELS } from '@tm/shared';
import { STUDY_MODES, HOST_STUDY_COPY, type StudyMode } from '@/lib/api/review';

const CLS = {
  group: 'flex min-h-tap items-center gap-1 rounded-lg bg-sunken p-1',
  item:
    'inline-flex min-h-tap flex-1 items-center justify-center gap-1 rounded-md px-3 text-sm ' +
    'transition-colors duration-micro ease-standard ' +
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
  on: 'bg-surface text-ink font-medium shadow-elev-1',
  off: 'text-ink-muted hover:text-ink',
  dot: 'h-2 w-2 shrink-0 rounded-full bg-danger',
} as const;

export interface QueueSwitchProps {
  mode: StudyMode;
  onChange: (mode: StudyMode) => void;
  /** 今日待背数：只在「今日复习」那一档挂红点，`0` 时节点不存在（R-18① 同口径）。 */
  due?: number;
  disabled?: boolean;
  className?: string;
}

export function QueueSwitch({
  mode,
  onChange,
  due = 0,
  disabled = false,
  className,
}: QueueSwitchProps): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={HOST_STUDY_COPY.modeGroup}
      className={[CLS.group, className ?? ''].join(' ').trim()}
    >
      {STUDY_MODES.map((value) => {
        const selected = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={[CLS.item, selected ? CLS.on : CLS.off].join(' ')}
          >
            {MODE_LABELS[value]}
            {value === 'review' && due > 0 ? (
              <span data-testid="queue-switch-due" className={CLS.dot} aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
