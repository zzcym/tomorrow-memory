'use client';

/**
 * 全局错误边界：运行时异常不再落到 Next.js 默认错误页
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    // 错误详情仅进控制台，不向用户暴露内部信息
    console.error('[PageError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-bold">页面出了点问题</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        发生了意外错误，请重试。若持续出现请联系开发者。
      </p>
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
