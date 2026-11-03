/**
 * §3.5 第 1 行对 packages/ui 比 apps/web 更严的那一词：React Query 的 useQuery( 在 UI 包里也禁
 * （UI 是设计系统，连数据获取层都不许有）。本 fixture 就是 `--self-test` 要求的红向用例。
 * 它同时是"UI 专属词没有漏进共用核心"的反证：apps/web 侧的合法写法见
 * tools/fixtures/selftest/web-clean/**（里面就有 trpc.x.y.useQuery(），
 * 谁把 useQuery( 并进 IO_GLOBALS_TERMS，那条绿用例就会立刻转红。
 */
import { useQuery } from '@tanstack/react-query';

export function useWordbook() {
  return useQuery({ queryKey: ['wordbook'], queryFn: () => [] });
}
