'use client';

/** Switch（§10.2 T-04 清单新增件，apps/web 无原件；UI §3.8.6）。
 *  视觉高 24px，44px 命中区由外层设置行（§3.8.2 `SettingRow`，T-05）给出 —— UI §7.1。 */
import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../host.js';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-hair bg-sunken transition-colors duration-micro ease-standard focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand',
      className,
    )}
    {...props}
  >
    {/* 滑块两态都保持"圆 + 高对比"，深色下 --on-brand 是深绿（UI §1.3） */}
    <SwitchPrimitive.Thumb
      className="pointer-events-none block h-5 w-5 rounded-full bg-surface shadow-elev-1 transition-transform duration-move ease-decelerate data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-brand data-[state=unchecked]:translate-x-0"
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
