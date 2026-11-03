'use client';

/** Skeleton（原件 apps/web/src/components/ui/skeleton.tsx；UI §3.11.3：shimmer 周期 1.4s、色取 token）。 */
import * as React from 'react';
import { cn } from '../host.js';

/**
 * 骨架块必须与真实元素同形同位（UI §3.11.3），所以这里只给"底色 + 流光"，
 * 圆角/高度由调用方用语义类传入（`rounded-lg` / `h-14` 等）。
 * reduced-motion 下 `--dur-skeleton: 0s`（tokens.css）→ 流光自动静止。
 * `aria-busy` 容器与 `sr-only` 播报文案由使用方给（文案唯一真源在 `@tm/shared/copy`，UI §6）。
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-xs bg-sunken bg-gradient-to-r from-brand-soft/0 via-brand-soft to-brand-soft/0 bg-[length:200%_100%] animate-shimmer',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
