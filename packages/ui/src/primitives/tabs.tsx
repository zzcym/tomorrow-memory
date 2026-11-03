'use client';

/** Tabs（§10.2 T-04 清单新增件，apps/web 无原件；UI §3.5.1 segmented、§7.9「颜色不是唯一通道」）。 */
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../host.js';

const Tabs = TabsPrimitive.Root;

/** 槽 = `--surface-sunken`（UI §1.1 用途列），高 ≥ `--tap`。 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex min-h-tap w-full items-center gap-1 rounded-full bg-sunken p-1 text-ink-muted',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/** 选中态：`bg-surface` + `font-semibold` + `aria-current`（字重与 ARIA 一起用，不靠颜色）。 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    aria-current={undefined}
    className={cn(
      'inline-flex min-h-8 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors duration-micro ease-standard focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:font-semibold data-[state=active]:text-brand-strong',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-3 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
