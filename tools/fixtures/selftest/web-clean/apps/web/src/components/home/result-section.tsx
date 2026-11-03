// --web 的绿向 fixture（A-30-4）：components/home/** 只许 tRPC 出口，本地存储与裸 HTTP 出口均为 0。
import React from 'react';
import { trpc } from '@/lib/trpc';

export function ResultSection({ word }: { word: string }) {
  const wordbook = trpc.wordbook.list.useQuery(undefined, { staleTime: 60_000, retry: false });
  return <section data-word={word} data-count={String(wordbook.data?.length ?? 0)} />;
}
