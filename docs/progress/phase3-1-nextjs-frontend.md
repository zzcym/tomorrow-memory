# Phase 3 - 前端重构：Next.js + tRPC + shadcn/ui

## 做了什么

### 1. Next.js 15 项目搭建（apps/web）
- App Router + TypeScript + Tailwind CSS v3（`tailwind.config.ts` 配置品牌紫色 + shadcn 语义色变量）
- 路径别名 `@/*` → `src/*`；workspace 包 `@tm/shared` / `@tm/agent` / `@tm/server` 类型桥接（transpilePackages + tsconfig paths）
- shadcn/ui 组件：button / card / input / label / badge / avatar / progress / dialog / separator / scroll-area / textarea / skeleton + sonner Toast
- 深色/浅色主题（class 策略 + localStorage，`theme-provider.tsx`）
- 全局布局：Header（导航/主题/登录/退出）、WordbookSidebar（单词本侧边栏）、Main
- 开发代理：`next.config.ts` rewrites 把 `/api`、`/trpc`、`/ws` 转发到 Hono 后端 :3001

### 2. tRPC 集成（全类型安全）
- **后端**：`@trpc/server` v11 + `@hono/trpc-server` 0.4.2 挂载 `/trpc/*`
  - `trpc/init.ts`：context（JWT 解析 userId）+ `protectedProcedure`
  - `trpc/router.ts`：dictionary.lookup（**SSE 流式 subscription**：先推 static，再流式推 ai-chunk）/ lookupStatic / wordbook.list·add·remove·clear / review.today·reviewCard / checkin.status·create / profile.get·update·changePassword / auth.sendCode·login·me / agent.chat / assessment.* / chat.history
- **前端**：`createTRPCReact<AppRouter>()` + React Query；splitLink 分发（subscription → httpSubscriptionLink/EventSource，其余 → httpBatchLink）
- **关键坑**：tRPC v11 subscription 走 EventSource（GET）+ 原始 input 序列化；batch 调用 subscription 会报错；跨包类型命名 TS2742 需关闭 web 的 declaration

### 3. 页面
- **查词首页** `/`：搜索框 + 方向选择（自动/英译中/中译英）、静态结果（音标/词性分组/例句/词形/柯林斯标注，毫秒级）与 AI 内容（记忆口诀/词根/词源/易混淆词，SSE 逐字流式）分屏、加入单词本（Toast + 撤销）、搜索历史（localStorage）
- **背单词** `/study`：3D 翻转 Flashcard（正面单词+音标+发音按钮，背面释义+例句+口诀+词根）、三种模式（顺序/随机/FSRS 间隔）、手势滑动（左=Again 右=Good）、键盘快捷键（空格翻转、←→评分）、顶部进度条（已复习/总数）、完成每日目标触发打卡弹窗
- **单词本侧边栏**：搜索、删除（可撤销）、清空（确认弹窗）、同步状态（云端/本地）
- **个人主页** `/profile`：头像/昵称/手机号、统计卡片（总词数/背诵天数/连续打卡）、GitHub 风格热力图（近 52 周）、设置（每日目标/改密/退出）
- **后台管理** `/admin`：管理员登录、统计面板（总用户/今日新增/人均单词）、用户列表分页

## 遇到的问题
- Tailwind `border-border` 报错：tailwind.config 缺语义色映射，补齐后需重启 dev server
- tRPC subscription 协议：PATCH/GET/batch 折腾一轮，最终确认 EventSource GET + 非 batch
- workspace 类型可命名性（TS2742）：web 关 declaration
- Next.js dev 首屏编译 20s+（首请求超时是正常现象）

## 验证
- [x] `tsc --noEmit` 全包通过、ESLint 零错误
- [x] 全部页面 200（/ /study /profile /admin /assess /chat）
- [x] tRPC 16/16（经 Next 代理）、旧 API 18/18、WS 3/3
- [x] Next.js SSR 渲染含中文内容正常
