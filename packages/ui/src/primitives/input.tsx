'use client';

/** Input（原件 apps/web/src/components/ui/input.tsx；UI §1.7 搜索框外高走 `--search-h`，本件是普通字段）。 */
import * as React from 'react';
import { cn } from '../host.js';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-hair bg-surface px-3 py-1 text-body text-ink shadow-elev-0 transition-colors duration-micro ease-standard file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
