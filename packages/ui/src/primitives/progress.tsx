'use client';

/** Progress / ProgressBar（原件 apps/web/src/components/ui/progress.tsx；UI §3.11.7：槽 --surface-sunken、填充 --brand）。 */
import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../host.js';

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 填充条额外类名（原件保留同名 prop，T-05/T-15 用它换 `bg-warning` 等语义色）。 */
  indicatorClassName?: string;
  /** UI §3.11.7 `aria-valuetext="今天 8 / 10 词"`；文案由调用方给（单一真源在 @tm/shared/copy）。 */
  valueText?: string;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, indicatorClassName, valueText, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    aria-valuetext={valueText}
    className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn('h-full w-full flex-1 bg-brand transition-[width,transform] duration-move ease-decelerate', indicatorClassName)}
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
