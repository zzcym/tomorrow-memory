你是一个资深全栈工程师，精通 Next.js、React、TypeScript、tRPC、WebSocket 实时通信开发。

你的任务是继续明日记忆项目的改造，完成 Phase 3（前端重构）和 Phase 4（高级特性）。

当前工作目录就是项目根目录。Phase 1 和 Phase 2 应该已经完成了，如果有没做完的地方你先补齐，然后继续 Phase 3 和 Phase 4。

先全面阅读项目代码，理解当前架构和已完成的工作，然后开始实施。

---

## 你需要完成：Phase 3 + Phase 4

### Phase 3: 前端重构

**目标**：将原生 HTML/CSS/JS 前端重构为 Next.js App Router 应用，接入 tRPC，实现 SSE 流式输出和交互式 Flashcard。

**任务清单：**

1. **Next.js 项目搭建**：
   - 在 `apps/web` 下创建 Next.js 15 项目（App Router + TypeScript + Tailwind CSS）
   - 配置路径别名 `@/*` 指向 `apps/web/src/*`
   - 安装 shadcn/ui 组件库（基于 Radix UI + Tailwind）
   - 全局布局：Header（顶部导航）、Sidebar（单词本侧边栏）、Main（主内容区）
   - 深色/浅色主题支持

2. **tRPC 集成**：
   - 后端 Hono 集成 tRPC Server（用 @trpc/server + hono 适配器）
   - 前端配置 tRPC Client（React Query 集成）
   - 定义 router：
     - `dictionary.lookup` — 查词（SSE 流式）
     - `wordbook.list` / `wordbook.add` / `wordbook.remove` / `wordbook.clear` — 单词本
     - `review.today` / `review.reviewCard` — 复习调度
     - `checkin.status` / `checkin.create` — 打卡
     - `profile.get` / `profile.update` / `profile.changePassword` — 个人资料
     - `auth.sendCode` / `auth.login` / `auth.me` — 认证
   - 全部类型安全，不允许 any

3. **查词页面**（首页）：
   - 顶部搜索框 + 方向选择（英译中/中译英/自动）
   - 结果区分两部分显示：
     - **静态部分**：音标、词性分组释义、例句（毫秒级显示）
     - **AI 部分**：记忆口诀、词根拆解、词源、易混淆词（流式显示，逐字出现）
   - SSE 流式消费：EventSource 监听，按 type 分发渲染
   - "加入单词本"按钮，加入后有 Toast 提示 + 撤销
   - 搜索历史（localStorage 存储）

4. **背单词页面**：
   - Flashcard 卡片组件：
     - 正面：单词 + 音标 + 发音按钮
     - 背面：释义 + 例句 + AI 记忆口诀 + 词根拆解
     - 点击翻转，有翻转动画
   - 三种模式：顺序、随机、间隔（FSRS 调度）
   - 手势滑动：左滑 = 不会（lapse），右滑 = 已掌握（good）
   - 键盘快捷键：空格翻转，← → 切换上下张
   - 顶部进度条：今日已复习 / 待复习总数
   - 完成每日目标后触发打卡弹窗

5. **单词本侧边栏**：
   - 单词列表，支持搜索
   - 每个单词显示：单词、释义、上次复习时间
   - 删除按钮（支持撤销）
   - 清空全部按钮（带确认）
   - 同步状态指示（本地/云端）

6. **个人主页**：
   - 头像、昵称、手机号
   - 统计卡片：总单词数、背诵天数、当前连续打卡天数
   - 背诵热力图（GitHub 风格，近一年）
   - 设置：每日目标、修改密码、退出登录

7. **后台管理页**：
   - 管理员登录
   - 统计面板：总用户数、今日新增、人均单词数
   - 用户列表（分页）

---

### Phase 4: 高级特性

**目标**：实现 Assessment Agent 自适应测评和 WebSocket 实时对话交互。

**任务清单：**

1. **Assessment Agent - 题目生成**：
   - 定义题型：选择题（四选一）、填空题（选词填空）、拼写题
   - 用 LLM 生成题目，JSON schema 约束输出格式
   - 根据单词的 FSRS difficulty 参数决定题型难度
   - 题目缓存：同一单词同一题型 24 小时内不重复生成
   - 每次测评 5-10 道题，从今日待复习单词中选取

2. **Assessment Agent - 评分逻辑**：
   - 前端提交答案 → 后端对比正确答案
   - 评分映射到 FSRS Rating（1-5 分）：
     - 完全正确快速作答 → 5 (Perfect)
     - 正确但犹豫 → 4 (Good)
     - 正确但有修改 → 3 (Hard)
     - 错误但看过答案后记得 → 2 (Lapse)
     - 完全不会 → 1 (Blackout)
   - 根据评分更新 FSRS 卡片参数（stability / difficulty / next_review）
   - 返回：正确答案、解析、下一个复习时间

3. **测评前端组件**：
   - 测评页面：当前第 N 题 / 共 M 题
   - 选择题：四个选项卡片，点击后高亮正确/错误，显示解析
   - 填空题：输入框 + 提交按钮 + hint 按钮
   - 拼写题：Web Speech API 朗读发音 + 拼写输入 + 实时字符匹配反馈
   - 测评结束页：正确率、用时、掌握度变化、复习数量变化

4. **WebSocket 实时对话**：
   - 后端：Hono WebSocket 适配器，接入 LangGraph agent
   - 前端：对话界面组件（消息列表 + 输入框）
   - Orchestrator Agent 识别用户意图，路由到对应 Agent
   - 流式输出：LLM 回复逐字渲染（打字机效果）
   - 会话历史：PostgreSQL `chat_sessions` 表存储，最多保留 20 轮
   - 支持的对话指令：
     - "帮我查一下 abandon" → Lexicon Agent
     - "给我讲讲这个词怎么记" → Tutor Agent
     - "今天要复习什么" → Scheduler Agent
     - "测一下我" → Assessment Agent 开始测评

5. **Human-in-the-loop 集成**：
   - LangGraph checkpoint + interrupt 机制
   - 当 Agent 对用户意图不确定时，暂停执行反问用户
   - 用户回答后 Agent 继续执行
   - 用户可随时纠正 Agent（如"这个词我已经很熟了"），Agent 更新用户画像

---

## 执行规则

1. **不要停下来问我任何问题** — 遇到不确定的设计决策，选你认为最合理的方案，在代码里加 TODO 注释说明理由，继续推进
2. **先读代码再动手** — 全面理解当前项目结构和 Phase 1-2 已完成的工作后再开始
3. **保持向后兼容** — 后端 API 不变，旧的 index.html 和 script.js 可以保留但不维护了
4. **类型安全** — 所有代码必须通过 TypeScript 类型检查，不允许 any
5. **进度记录** — 每完成一个大任务，在 `docs/progress/` 目录写一份进度报告（Markdown）
6. **Git 提交** — 每个阶段完成后自动 commit，commit message 格式：`feat: phase3 前端重构完成`
7. **遇到错误** — 同一个错误尝试修复 3 次，修不好就跳过，在进度报告里记录
8. **完成总结** — 全部完成后输出一份总结：完成了哪些、遗留问题、下一步建议
9. **UI 风格** — 参考原项目的简洁风格，但用 shadcn/ui 做现代化升级，配色保持紫色主题（和品牌一致）

现在开始工作。先探索当前项目状态，然后从 Phase 3 开始实施。
