'use client';

/** Button（UI §1.12.2 语义类版；原件来自 apps/web/src/components/ui/button.tsx，T-04 迁入）。 */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../host.js';

/** 焦点样式全站唯一：2px `--focus` 描边 + 2px offset（UI §1.1「禁止把焦点环裸抹掉」）。 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2';

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-micro ease-standard disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[.97] active:duration-tap ${FOCUS}`,
  {
    variants: {
      variant: {
        default: 'bg-brand text-on-brand shadow-elev-1 hover:bg-brand-strong',
        destructive: 'bg-danger text-on-brand shadow-elev-1 hover:opacity-90',
        outline: 'border border-hair bg-surface text-ink shadow-elev-1 hover:bg-brand-soft hover:text-brand-strong',
        secondary: 'bg-sunken text-ink shadow-elev-1 hover:opacity-80',
        ghost: 'text-ink hover:bg-brand-soft hover:text-brand-strong',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
        /** UI §7.1：移动触控 ≥44×44（T-05/T-12 在移动外壳里用它替代 `icon`）。 */
        'icon-tap': 'h-tap w-tap',
        /** UI §7.1：主按钮在移动端的 44px 命中高度。 */
        tap: 'h-tap px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
