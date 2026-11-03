// --web 的绿向 fixture（A-30-4）：首页传输唯一走 @/lib/trpc。
// 这里刻意写了 trpc.x.y.useQuery( —— 它在 --ui-io（packages/ui）是禁的，在 apps/web 是**唯一合法传输面**
// （§10.2 T-12 判据⑤ 只禁裸 fetch）。若有人把 useQuery( 并进共用核心词表 IO_GLOBALS_TERMS，本例会转红。
import React from 'react';
import { trpc } from '@/lib/trpc';

export default function Page() {
  const lookup = trpc.dictionary.lookup.useQuery(undefined, { enabled: false });
  return <div data-loading={String(lookup.isFetching)} />;
}
