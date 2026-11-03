'use client';

/**
 * 「我的」E 区 = 每日目标（§10.2 T-15 行 🆕`components/profile/goal-setting.tsx` / UI §3.8.3）。
 *
 * 替换现网那条缺陷：`profile/page.tsx` 原来是一个 `type=number` 输入框 + 「保存」，
 * 且旁边的昵称/密码共用同一个 `profile.update` mutation（改一处会带着另一处一起脏）。
 * 现在按 §3.8.3 做成**滑杆 + 明确保存**，并且：
 * - `onBlur` 静默保存 = 禁（R-19②），值只有点「保存」才写；
 * - `disabled` 当且仅当值未变化（不降饱和度、不加"自动保存"字样）；
 * - dirty 时标题右侧出现 4px `●`（`--warning`）；
 * - dirty 未保存就离开本页 → `ConfirmSheet`（`留在本页` 主钮 + `放弃修改` 危险文字钮）。
 *
 * `packages/ui/src/primitives/` 里**没有** `slider.tsx`（§3.8.2 表列了它，实际未交付），
 * 而 `packages/**` 本轮禁改 ⇒ 这里用原生 `input[type=range]` + 语义 token 类实现同形控件，
 * `aria-valuetext` 走 `SETTINGS_COPY.dailyGoal.sliderValueText`。已进 T-15 报告的上游缺口清单。
 */

import * as React from 'react';
import { SETTINGS_COPY, VERBS } from '@tm/shared';
import { ConfirmSheet } from '@tm/ui';
import { PROFILE_COPY, type DailyGoalEditor } from '@/lib/api/profile';

const TICK = 'flex justify-between text-xs text-ink-muted';

export interface GoalSettingProps {
  goal: DailyGoalEditor;
  /** 页面在用户带着未保存的修改离开时置真（本组件只画 `ConfirmSheet`，不猜何时离开）。 */
  leaveConfirmOpen: boolean;
  onStay: () => void;
  onDiscardAndLeave: () => void;
}

export function GoalSetting({ goal, leaveConfirmOpen, onStay, onDiscardAndLeave }: GoalSettingProps): React.JSX.Element {
  const { value, dirty, saving, change, save, failed } = goal;
  const id = 'profile-daily-goal';
  return (
    <section
      aria-labelledby={id}
      data-testid="profile-goal"
      className="mt-4 rounded-xl border border-hair bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {SETTINGS_COPY.dailyGoal.label}
        </label>
        {dirty ? (
          <span aria-hidden="true" data-testid="profile-goal-dirty" className="text-xs text-warning">
            {SETTINGS_COPY.dailyGoal.dirtyMark}
          </span>
        ) : null}
        <span className="ml-auto tnum text-sm text-ink-muted">{SETTINGS_COPY.dailyGoal.value(value)}</span>
      </div>

      <input
        id={id}
        type="range"
        min={PROFILE_COPY.goalMin}
        max={PROFILE_COPY.goalMax}
        step={PROFILE_COPY.goalStep}
        value={value}
        aria-valuetext={SETTINGS_COPY.dailyGoal.sliderValueText(value)}
        aria-label={SETTINGS_COPY.dailyGoal.sliderAria(value)}
        onChange={(e) => change(Number(e.target.value))}
        className="mt-3 h-11 w-full cursor-pointer accent-brand"
        data-testid="profile-goal-slider"
      />
      <div className={TICK}>
        <span>{SETTINGS_COPY.dailyGoal.value(PROFILE_COPY.goalMin)}</span>
        <span>{SETTINGS_COPY.dailyGoal.value(PROFILE_COPY.goalMax)}</span>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => save()}
          disabled={!dirty || saving}
          aria-disabled={!dirty || saving}
          data-testid="profile-goal-save"
          className={
            'inline-flex min-h-tap items-center gap-1 rounded-lg px-4 text-sm font-medium ' +
            'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ' +
            (dirty ? 'bg-brand text-on-brand' : 'border border-hair bg-surface text-ink-muted')
          }
        >
          {SETTINGS_COPY.dailyGoal.save}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {SETTINGS_COPY.dailyGoal.label} · {VERBS.retryInline}
        </p>
      ) : null}

      <ConfirmSheet
        open={leaveConfirmOpen}
        onOpenChange={(open) => (open ? undefined : onStay())}
        title={SETTINGS_COPY.dailyGoal.leaveConfirm.title}
        description={SETTINGS_COPY.dailyGoal.leaveConfirm.body}
        confirmText={SETTINGS_COPY.dailyGoal.leaveConfirm.stay}
        cancelText={SETTINGS_COPY.dailyGoal.leaveConfirm.discard}
        tone="danger"
        onConfirm={onStay}
        onCancel={onDiscardAndLeave}
        testid="profile-goal-leave"
      />
    </section>
  );
}
