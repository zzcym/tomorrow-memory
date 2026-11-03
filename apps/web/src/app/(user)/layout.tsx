import { Header } from '@/components/header';
import { MobileNav } from '@/components/mobile-nav';
import { FooterNote } from '@/components/home/footer-note';

/**
 * 用户区外壳（架构 §5.5 / UI §3.1.2 + §3.1.3 + §3.10.1）。
 *
 * 两处按 §10.2 T-12 行的定案改动：
 * ① **不再挂 `UserShell`** —— 它的单词本侧栏与"左上角浮动胶囊"是 §8.3-C 要求 DOM 归零的
 *    `[data-testid=wordbook-sidebar]` 项；`/wordbook` 已作为第 3 项主入口进 `lib/nav.ts` 的
 *    `PRIMARY_NAV`（`NAV_ITEMS` 预置），一级出口从"侧栏"换成"底 tab + 顶栏项"。
 * ② 根容器 `min-h-[100dvh]`（§2.4-① 明禁 `100vh`）；`<main id="main">` 是顶栏跳过链接的目标（§7.1）。
 *    §3.10.1:1129 要求的「内容容器统一 `padding-bottom: calc(var(--tab-h)+安全区+8px)`」由**本布局的
 *    `FooterNote`** 单点承担（`components/home/footer-note.tsx` 上挂 `pb-safe-bottom` = preset 的
 *    `calc(var(--tab-h) + env(safe-area-inset-bottom) + var(--sp-4))`），所以 `<main>` 不再重复加，
 *    否则全站每个页面底部会多出一份 72px 空白。键盘弹起时底栏另由 `components/mobile-nav.tsx` 的
 *    `visualViewport` 收起（§2.4-②，判据②「100dvh 不遮输入框」）。
 *
 * 页脚（ICP 合规）留在布局层：它是全站布局元素，按 §3.1.1 不计入首页可交互元素，
 * 因此首页主体 `[data-testid=home-root]` 未查询态仍是 3 个。
 *
 * 管理后台 `/admin` 用独立布局，不在此组内。
 */
export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg text-ink">
      <Header />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <FooterNote />
      <MobileNav />
    </div>
  );
}
