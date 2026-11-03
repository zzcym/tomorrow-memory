# 04-dev-report — T-28 把登录墙接到 Web 受保护页（批次4 / F-20 / A-52 #138）

## ① 逐页清单

| 页 | 接线 | 墙 | 游客证据 | 已登录证据 | 态未定证据 |
|---|---|---|---|---|---|
| `/study` | ✅ `page.tsx:30` `<AuthGate>` 包 Suspense+StudyInner | 默认 LoginWall | 新用例①b：`auth-gate[data-auth-status=guest]` 可见 + `login-wall` 计数 1 + 三句墙文案（现读 shared） | 用例① 六页循环（wall/骨架归零 + 逐帧 0 禁词）+ 用例⑧ | 用例①/①b 每页 `auth-gate-skeleton` 与 `idle` 计数归零（水合后不留存） |
| `/report` | ✅ 拆 `ReportInner`，默认导出套 `<AuthGate>`；删死分支"请先登录…"行 | 默认 | ①b（`/report` 轮） | ① | ①/①b |
| `/chat` | ✅ 拆 `ChatInner` 套 `<AuthGate>`；删"请先登录…"行（WS 效应的 `!authed` 早退保留=断连防线） | 默认 | ①b | ① | ①/①b |
| `/assess` | ✅ 拆 `AssessInner` 套 `<AuthGate>`；删"请先登录…"行 + 其唯一依赖 `useAuthed` | 默认 | ①b | ① | ①/①b |
| `/profile` | ✅ 拆 `ProfileInner` 套 `<AuthGate>` | 默认（`profile-signed-out` 数据层兜底保留，读同一 `AUTH_COPY.wall.*`） | ①b | ① | ①/①b |
| `/wordbook` | ✅ `<AuthGate wall={引导卡}>`；卡=原 `:172-188` 那套 EmptyState **原样抽成** `WordbookSignedOutGuide` 组件（一字未改，含 `testid=wordbook-signed-out`），同时留作数据层兜底 | 传入引导卡（§3.6.5 行3 例外，**未**换 LoginWall） | 既有用例③（角色/可及名判）+ `wordbook.spec.ts:59` 仍绿 | ① | ① |
| `/word`、`/about` | ❌ 不套（未登录可读面，简报红线；`about/page.tsx:5` 未动） | — | — | — | — |

aria/键盘：`①b` 末段在 `/study` 游客态真实 `Tab` 走焦（≤40 跳，不 `focus()` 抄近路）到墙上原生 `<button>`（`document.activeElement` 判等）后 `Enter` 打开弹窗并断言 `data-mode=sign-in`；两档视口均绿。

## ② e2e 期望翻转（逐字，产品与期望同轮动）

文件 `apps/web/e2e/auth-wall.spec.ts` 用例①。改前（把"产品未接线"当期望）：
```
const MECHANISM_PAGES = ['/study', '/wordbook'];
const NOT_ADOPTED = ['/report', '/chat', '/assess'];
...
expect(offenders.map(([path]) => path).sort(), '吐出"请先登录后…"的页面必须恰好是尚未套 <AuthGate> 的那三页（X-1）…').toEqual([...NOT_ADOPTED].sort());
```
改后（六页同一把尺 + 新增游客必见墙用例①b）：
```
const GATED_PAGES = ['/study', '/wordbook', '/report', '/chat', '/assess', '/profile'];
...
expect(await hits(page), `${path} 全程不许出现任何一条禁词（判据①，T-28 起六页同一把尺）`).toEqual([]);
```
X-1 记账/annotations 豁免通道整体删除；同时 `report/chat/assess` 三页源码里写死的"请先登录后…"三行随接线删除（无假绿窗口：同一轮内完成）。本期没有"判断不该接"的页——六页全接。

## ③ 文案取源（0 新串自证）

页面新增渲染文案 = 0 条：`LoginWall`（默认墙）四串走 `AUTH_COPY.wall.{title,subtitle,primary,link}`（组件内既有 import）；`/wordbook` 引导卡四串走 `WORDBOOK_COPY.emptySignedOut.*`；e2e 期望值经 `sharedCopyPattern()` 现读 `packages/shared/src/constants/copy.ts`。`grep 请先登录后 apps/web/src/app` 渲染串 0 命中（仅组件注释与本报告引用）。

## ④ 出口命令（逐字跑过）

1. `pnpm --filter @tm/web typecheck` → `tsc --noEmit`，**EXIT=0**（0 错误）。
2. `pnpm --filter @tm/web build` → EXIT=0（A-50 #126 自查：改码后重建 `.next`，计入出口命令）。
3. `npx playwright test auth-wall` → **23 passed / 3 failed**，EXIT=0（tail 管道码）。
4. 原样重跑一次以判闪：同样 **23/3**，红点逐字一致 ⇒ 系统性而非 flake。

**未全绿，如实上报**：3 红全在 `chromium-375x667` 的登录弹窗内部（⑧ 点 `auth-switch` 元素永不确定位、⑨ `auth-submit` outside of viewport、⑨b 点协议 checkbox 超时），全部发生在 `/` 首页弹窗、不触及任何 T-28 接线页；1280 档同三测全绿。T-29 此刻在改 `packages/ui/src/auth/AuthFormShell.tsx`（mtime 09-21 02:26，我的 build 会吸入其半程态）——症状（375 档弹窗溢出/持续动画）与该文件职权面吻合。判据页（①①b③）两档 13+13 全绿。

## ⑤ data.db 指纹（跑前 = 跑后）

- 跑前：`253952 B / mtime 2026-09-18 04:05:38.198 / sha256 6595517661cc…87d`；`packages/server/data.db` 0 B（09-17）未动。
- 跑后：三项逐字节相同（certutil 因并发进程独占报 sharing-violation，改 `FileShare.ReadWrite` 只读散列，未 acquire 写锁）。

## ⑥ 上报未修

1. **[上报 TPM] auth-wall 375 档三红（⑧⑨⑨b）**：属弹窗布局/动画面（T-13/T-29 名下 `AuthFormShell`），非 T-28 接线引入；出口命令 4 次用尽，未再烧预算做隔离复跑。
2. `AuthGate` 疑点（未改）：guest 分支外层 div 不带 `className` 透传（props 里的 `className` 只作用于 idle 壳），长页面避免跳动时对墙无效——疑点记录，采信面不受影响。
3. `useAuthStatus` 无跨标签页重挂问题未发现；`LoginWall` 无疑点。
4. `probe 计数 ≈16 ≤25`。禁改面（packages/ui、shared、server、app、两组件、scripts、tools）零触碰；未做 git 写操作。
