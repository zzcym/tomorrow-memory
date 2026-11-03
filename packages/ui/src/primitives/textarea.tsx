'use client';

/** Textarea（原件 apps/web/src/components/ui/textarea.tsx；不在 §10.2 的 13 个清单内，但属"12 个原件迁入"必做项）。 */
import * as React from 'react';
import { cn } from '../host.js';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-12 w-full rounded-md border border-hair bg-surface px-3 py-2 text-body text-ink shadow-elev-0 transition-colors duration-micro ease-standard placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
