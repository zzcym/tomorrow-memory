<#
.SYNOPSIS
    按阶段执行明日记忆 Multi-Agent 改造任务
.DESCRIPTION
    使用 deepseek harness headless 模式自动执行指定阶段的改造任务
    设置 DSH_PERMISSION_MODE=danger-full-access 实现全自动无需确认
.PARAMETER Phase
    要执行的阶段：phase1, phase2, phase3, phase4, phase5, phase6
.PARAMETER ProjectDir
    项目目录，默认为脚本所在目录的上级
.PARAMETER DshDir
    deepseek-harness 目录
.PARAMETER TimeoutHours
    超时时间（小时），默认 2 小时
.EXAMPLE
    .\run-phase.ps1 -Phase phase1
.EXAMPLE
    .\run-phase.ps1 -Phase phase2 -TimeoutHours 3
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("phase1","phase2","phase3","phase4","phase5","phase6")]
    [string]$Phase,

    [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),

    [string]$DshDir = "E:\DSH\deepseek-harness",

    [int]$TimeoutHours = 2
)

$ErrorActionPreference = "Stop"

# 阶段描述映射
$phaseInfo = @{
    "phase1" = @{
        Name = "Phase 1: 基础设施搭建"
        Tasks = @"
### 你需要完成的任务清单：

1. **项目初始化**：创建 monorepo 结构（pnpm workspace），分 packages/agent、packages/server、packages/shared、apps/web 四个包。配置 tsconfig.json（strict mode、paths alias）。配置 ESLint + Prettier。

2. **数据库抽象层**：将现有的 server.js 和 server_prod.js 的重复逻辑提取到 packages/server/src/db 下。定义统一的 UserDB、WordbookDB、ProfileDB、CheckinDB 接口。提供 PostgreSQL 和 SQLite 两种实现，通过环境变量 DB_DRIVER=pg|sqlite 切换。

3. **Express → Hono 迁移**：将 Express 路由逐个迁移到 Hono。迁移顺序：静态文件 → 认证中间件 → 查词 API → 单词本 API → 打卡 API → 管理 API。保持所有 API 的响应格式不变。

4. **Docker Compose 环境**：编写 docker-compose.dev.yml，包含 PostgreSQL 16、Redis 7、Qdrant、ClickHouse 四个服务。数据卷挂载到本地目录持久化。

5. **环境变量管理**：将所有硬编码密钥（JWT_SECRET、DATABASE_URL、API Key）提取到 .env 文件。创建 .env.example 模板。

6. **数据迁移脚本**：新增 fsrs_cards 表和 tutor_cache 表的建表语句。将现有单词本数据迁移到新表结构，为每个单词初始化 FSRS 默认参数。

### 执行规则：

1. 先全面阅读现有项目代码，理解每个模块的功能
2. 按照任务清单逐项实施，不要跳步
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的设计决策，选择最合理的方案并加 TODO 注释说明，不要停下来问
5. 所有代码必须通过 TypeScript 类型检查（tsc --noEmit）
6. 保持 git 提交规范，每个大任务完成后 commit
7. 最后输出阶段完成总结
"@
    }
    "phase2" = @{
        Name = "Phase 2: 核心 Agent 实现"
        Tasks = @"
### 你需要完成的任务清单：

1. **LangGraph 编排框架搭建**：安装 @langchain/langgraph 和相关依赖。定义 StateGraph 状态对象 schema（AgentState）。实现 Orchestrator Agent 的意图识别逻辑（使用 LLM function calling 分类用户意图：lookup/learn/review/assess/report）。定义图节点和条件路由边。创建 packages/agent/src/ 目录结构。

2. **Lexicon Agent: 向量索引构建**：读取现有 stardict.db 的词条，用 text-embedding-3-small 生成向量，批量写入 Qdrant collection dictionary。同时将 examples.db 的例句向量化写入 examples collection。构建脚本支持断点续传。注意控制 API 调用成本。

3. **Lexicon Agent: 查询逻辑**：实现查词 pipeline：embedding 生成 → Qdrant hybrid search → Stardict 精确查询（fallback）→ 结果合并 → LLM 补充词源和记忆提示 → SSE 流式返回。保留现有有道 API 和 dictionaryapi.dev 作为外部 fallback。

4. **Tutor Agent: 教学内容生成**：实现 LLM structured output 调用。定义 JSON schema（mnemonic, wordRoot, sceneExamples, confusable）。编写 prompt template（注入单词、用户 CEFR 等级、最近学习历史）。实现 PostgreSQL 缓存层：tutor_cache(word, level, content, created_at)，命中率预期 85%+。

5. **Scheduler Agent: FSRS-5.0 实现**：使用 ts-fsrs npm 包实现 FSRS-5.0 算法。实现每日队列生成逻辑（计算 retrievability，按 R 从低到高排序）。将现有单词本数据初始化为 FSRS cards（默认参数 S=1, D=5）。实现复习结果更新卡片参数的逻辑。

6. **LLM 路由层**：实现统一的 LLM 调用接口，封装 OpenAI / DeepSeek 的调用。配置按场景路由（teaching 用 GPT-4o，assessment 用 DeepSeek 等）。支持 fallback 链。实现 token 计数和成本统计。

### 执行规则：

1. 先阅读 docs/requirements.md 和 docs/plan.md 了解完整背景
2. 按照任务清单逐项实施
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的地方，选择最合理的方案并加注释说明，不要停下来问
5. 所有代码通过 TypeScript 类型检查
6. 阶段完成后自动 git commit，message 为 "feat: $Phase 核心功能完成"
7. 最后输出阶段完成总结
"@
    }
    "phase3" = @{
        Name = "Phase 3: 前端重构"
        Tasks = @"
### 你需要完成的任务清单：

1. **Next.js 项目搭建**：在 apps/web 下创建 Next.js 15 项目（App Router + TypeScript + Tailwind CSS）。配置路径别名。创建基础布局组件（Header / Sidebar / Main）。引入 shadcn/ui 组件库。

2. **tRPC 集成**：定义 tRPC router：dictionary.lookup、wordbook.list/add/remove、review.today、checkin.status/create、profile.get/update。前端通过 useQuery/useMutation 调用。

3. **查词页面重构**：搜索框 + 结果区。结果区分两部分：静态部分（音标、释义、例句，毫秒级显示）和 AI 部分（记忆提示、词源，流式显示）。实现 SSE 消费逻辑（EventSource）。单词加入单词本按钮。

4. **Flashcard 组件重构**：React Flashcard 组件，支持点击翻转、手势滑动切换（左滑不会、右滚动已掌握）、键盘快捷键。进度条显示今日完成情况。卡片完成后触发 Scheduler 更新。

5. **单词本与个人页迁移**：单词本侧边栏（搜索、删除、撤销）。个人主页（头像、昵称、统计卡、热力图）。设置页（每日目标、密码修改）。

### 执行规则：

1. 先阅读 docs/requirements.md 和 docs/plan.md 了解完整背景
2. 按照任务清单逐项实施
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的地方，选择最合理的方案并加注释说明，不要停下来问
5. 保持 UI 风格与原项目一致但更现代化
6. 阶段完成后自动 git commit
7. 最后输出阶段完成总结
"@
    }
    "phase4" = @{
        Name = "Phase 4: 高级特性"
        Tasks = @"
### 你需要完成的任务清单：

1. **Assessment Agent: 题目生成**：定义题型 schema（选择题、填空题、拼写题）。LLM 根据单词列表 + 用户水平生成题目。JSON schema 约束输出格式。实现题目缓存策略。

2. **Assessment Agent: 评分逻辑**：前端提交答案 → 后端对比 → 评分（0-5 分映射 FSRS Rating）→ 更新 FSRS 卡片参数 → 返回正确答案 + 解析。

3. **测评前端组件**：选择题（四选项卡片）、填空题（输入框 + hint）、拼写题（Web Speech API 朗读 + 输入）。进度跟踪：完成 X/Y 题，正确率实时更新。

4. **WebSocket 实时对话**：后端 WebSocket 服务。前端对话界面（消息列表 + 输入框）。Orchestrator Agent 识别意图并路由。流式输出逐字渲染。会话历史存储（最多 20 轮）。

5. **Human-in-the-loop 集成**：LangGraph checkpoint + interrupt 机制。当 Agent 不确定时暂停执行等待用户输入。用户可在对话中纠正 Agent 理解。

### 执行规则：

1. 先阅读 docs/requirements.md 和 docs/plan.md 了解完整背景
2. 按照任务清单逐项实施
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的地方，选择最合理的方案并加注释说明，不要停下来问
5. 阶段完成后自动 git commit
6. 最后输出阶段完成总结
"@
    }
    "phase5" = @{
        Name = "Phase 5: 学情分析与可观测性"
        Tasks = @"
### 你需要完成的任务清单：

1. **ClickHouse 事件流**：定义 learn_events 表结构。在后端关键路径插入事件写入（异步，不阻塞主流程）。Redis Streams 做缓冲，ClickHouse 批量消费写入。

2. **Analyst Agent: 分析查询**：实现 SQL 聚合查询模板：词汇增长曲线、复习效率、遗忘曲线分布、学习时段分布。查询结果以 JSON 返回图表数据。

3. **Analyst Agent: LLM 洞察生成**：将 SQL 聚合结果 + 用户画像传入 LLM，生成自然语言洞察和学习建议。

4. **分析报告前端**：用 Recharts 渲染：词汇增长折线图、正确率趋势图、遗忘曲线分布图、学习时段热力图。LLM 洞察文本卡片。

5. **OpenTelemetry 集成**：安装 @opentelemetry/auto-instrumentations-node，自动 instrument HTTP / pg / redis。配置 OTLP exporter 发送到 Jaeger。在 LangGraph 节点添加 span。

6. **LangSmith 追踪**：配置 LangSmith，LangGraph 自动上报 Agent 调用链。

### 执行规则：

1. 先阅读 docs/requirements.md 和 docs/plan.md 了解完整背景
2. 按照任务清单逐项实施
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的地方，选择最合理的方案并加注释说明，不要停下来问
5. 阶段完成后自动 git commit
6. 最后输出阶段完成总结
"@
    }
    "phase6" = @{
        Name = "Phase 6: 生产部署与优化"
        Tasks = @"
### 你需要完成的任务清单：

1. **Dockerfile 编写**：多阶段构建。前端 Next.js 独立 Dockerfile（standalone output）。后端 Hono Dockerfile。

2. **docker-compose.prod.yml**：生产编排：web + server + pg + redis + qdrant + clickhouse + caddy。健康检查、重启策略、资源限制。

3. **Caddy 替代 Nginx**：Caddyfile 配置自动 HTTPS。反向代理、gzip 压缩、静态资源缓存头。

4. **GitHub Actions CI/CD**：PR 触发 lint + typecheck + test + build。main 分支 push：构建 Docker 镜像 → push → SSH 部署。

5. **性能调优**：Qdrant HNSW index 调优。PostgreSQL 连接池调优。Next.js ISR 静态化。Redis 缓存层。

6. **清理历史脚本**：删除所有重复的 deploy 脚本。保留数据构建脚本移到 scripts/ 目录。删除 server_prod.js。

### 执行规则：

1. 先阅读 docs/requirements.md 和 docs/plan.md 了解完整背景
2. 按照任务清单逐项实施
3. 每完成一个任务，写一条进度记录到 docs/progress/ 目录
4. 遇到不确定的地方，选择最合理的方案并加注释说明，不要停下来问
5. 阶段完成后自动 git commit
6. 最后输出阶段完成总结
"@
    }
}

$info = $phaseInfo[$Phase]

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  明日记忆 Multi-Agent 改造 - $($info.Name)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "项目目录: $ProjectDir"
Write-Host "DSH 目录:  $DshDir"
Write-Host "超时时间: $TimeoutHours 小时"
Write-Host ""

# 验证项目目录
if (-not (Test-Path $ProjectDir)) {
    Write-Error "项目目录不存在: $ProjectDir"
    exit 1
}

# 验证 DSH 目录
if (-not (Test-Path $DshDir)) {
    Write-Error "DSH 目录不存在: $DshDir"
    exit 1
}

# 创建进度目录
$progressDir = Join-Path $ProjectDir "docs\progress"
if (-not (Test-Path $progressDir)) {
    New-Item -ItemType Directory -Path $progressDir -Force | Out-Null
}

# 设置全自动权限模式
$env:DSH_PERMISSION_MODE = "danger-full-access"
Write-Host "[配置] 权限模式: danger-full-access (全自动)" -ForegroundColor Green

# 构造任务指令
$task = @"
你是一个资深全栈工程师，请在项目 $ProjectDir 中实施 $($info.Name)。

$($info.Tasks)

项目根目录：$ProjectDir
需求文档：docs/requirements.md
计划书：docs/plan.md

开始工作。
"@

# 写入任务文件方便调试
$taskFile = Join-Path $progressDir "$Phase-task.txt"
$task | Out-File -FilePath $taskFile -Encoding UTF8
Write-Host "[配置] 任务文件: $taskFile" -ForegroundColor Gray

Write-Host ""
Write-Host "开始执行 DSH headless agent..." -ForegroundColor Yellow
Write-Host "（这可能需要很长时间，请耐心等待）" -ForegroundColor Yellow
Write-Host ""

# 执行 DSH
$startTime = Get-Date
$timeout = [TimeSpan]::FromHours($TimeoutHours)

try {
    Push-Location $DshDir
    
    $process = Start-Process -FilePath "pnpm" -ArgumentList "dsh", "--profile", "headless", $task `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $progressDir "$Phase-output.log") `
        -RedirectStandardError (Join-Path $progressDir "$Phase-error.log")
    
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    if ($process.ExitCode -eq 0) {
        Write-Host "  执行完成！耗时: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Green
    } else {
        Write-Host "  执行结束（退出码: $($process.ExitCode)）" -ForegroundColor Yellow
        Write-Host "  耗时: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor Yellow
    }
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "输出日志: $(Join-Path $progressDir "$Phase-output.log")"
    Write-Host "错误日志: $(Join-Path $progressDir "$Phase-error.log")"
    
} catch {
    Write-Error "执行失败: $_"
    exit 1
} finally {
    Pop-Location
}
