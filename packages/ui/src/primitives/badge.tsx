'use client';

/** Badge（原件 apps/web/src/components/ui/badge.tsx；UI §3.11.4 尺寸与状态色）。 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../host.js';

/**
 * UI §3.11.4：`brand/neutral/success/warning/danger` 是本规范的五个语义变体。
 * `default/secondary/destructive/outline` 是同一批 token 的**旧名**（`default`≡`brand`、
 * `secondary`≡`neutral`、`destructive`≡`danger`），只为让 T-12/T-15/T-16 之前的存量页面
 * 不改调用点即可编译；不引入任何新颜色值。旧名在批次3/4 整页重写时删除。
 */
const badgeVariants = cva(
  'inline-flex h-4 items-center justify-center gap-1 rounded-full border px-2 text-2xs leading-none font-medium tnum transition-colors duration-micro ease-standard',
  {
    variants: {
      variant: {
        brand: 'border-transparent bg-brand-soft text-brand-strong',
        neutral: 'border-transparent bg-sunken text-ink-muted',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        outline: 'border-hair bg-surface text-ink',
        default: 'border-transparent bg-brand-soft text-brand-strong',
        secondary: 'border-transparent bg-sunken text-ink-muted',
        destructive: 'border-transparent bg-danger-soft text-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
