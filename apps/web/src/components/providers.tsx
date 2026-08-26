'use client';

/**
 * 全局 Provider：React Query + tRPC
 * - subscription（SSE 流式查词）→ httpSubscriptionLink
 * - 其它（query/mutation）→ httpBatchLink
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpSubscriptionLink, loggerLink, splitLink } from '@trpc/client';
import { trpc, API_URL } from '@/lib/trpc';
import { getToken } from '@/lib/auth';

function getUrl(): string {
  if (typeof window !== 'undefined') return '/trpc'; // Next rewrites 代理到后端
  return `${API_URL}/trpc`;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({ enabled: () => false }),
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({ url: getUrl() }),
          false: httpBatchLink({
            url: getUrl(),
            headers() {
              const token = getToken();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
          }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
