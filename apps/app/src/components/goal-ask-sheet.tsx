/**
 * 「达到每日目标」询问卡（UI §3.5.5 末段 / §8.3-B-8；数据面 R-13①）。
 *
 * 三条硬约束，都落在这里而不是页面里：
 *  1. **不可点遮罩关闭**（`dismissible=false` + `showClose=false`）：必须二选一，
 *     现网那个"稍后"按钮 = 断签病灶，PRD R-13 的整条动机就是它，所以这里**没有第三种出口**；
 *  2. 文案唯一源 = `STUDY_COPY.dailyGoalReached`（标题 `今天 {goal} 个词的目标完成了`、
 *     正文带 `连续 {streak} 天了`、两颗按钮 `再背一批` / `今天就到这`），本文件零中文字面量；
 *  3. 主按钮 = `再背一批`（`ConfirmSheet` 的 confirm 位是主色实心那颗，§3.5.5 同口径）。
 *
 * 触发判定导出成纯函数 `shouldAskGoal()`：一轮里只在**首次**达标时问一次，
 * 目标未定（`goal<=0`，取数还在飞）时不许抢跑。
 *
 * Chrome84 红线（§5.1）：本文件不用 `structuredClone` / `Object.hasOwn` / `Array.prototype.at`
 * / `requestIdleCallback`。
 */

import * as React from 'react';
import { STUDY_COPY } from '@tm/shared';
import { ConfirmSheet } from '@tm/ui';

export interface GoalAskSheetProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  goal: number;
  streak: number;
  /** 主按钮 `再背一批`：本轮继续（关掉询问 + 重取一批词）。 */
  onAgain: () => void;
  /** 次按钮 `今天就到这`：去完成页，不打卡、不弹窗、不断签。 */
  onStop: () => void;
  testid?: string;
}

/**
 * 达标判定（§8.3-B-8）：
 *  - `goal<=0` = 每日目标还没取到 → 不弹（拿 0 当分母会立刻"达标"，那是假达标）；
 *  - `done<=0` = 今天一张都没背 → 不弹；
 *  - `asked` = 本轮已经问过 → 不再问第二次（同一轮只问一次，§3.5.5 的"一次"）。
 */
export function shouldAskGoal(done: number, goal: number, asked = false): boolean {
  if (asked) return false;
  if (!(goal > 0) || !(done > 0)) return false;
  return done >= goal;
}

export function GoalAskSheet({
  open,
  onOpenChange,
  goal,
  streak,
  onAgain,
  onStop,
  testid = 'goal-ask-sheet',
}: GoalAskSheetProps): React.JSX.Element {
  return (
    <ConfirmSheet
      open={open}
      onOpenChange={onOpenChange}
      title={STUDY_COPY.dailyGoalReached.title(goal)}
      description={STUDY_COPY.dailyGoalReached.body(streak)}
      confirmText={STUDY_COPY.dailyGoalReached.again}
      cancelText={STUDY_COPY.dailyGoalReached.stop}
      dismissible={false}
      showClose={false}
      variant="sheet"
      testid={testid}
      onConfirm={onAgain}
      onCancel={onStop}
    />
  );
}

/** 只用到一处，但它是"二选一"的判据点：给用例做源码级哨兵（不许出现第三种关闭路径）。 */
export const GOAL_ASK_DISMISSIBLE = false;
