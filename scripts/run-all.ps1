<#
.SYNOPSIS
    一次性执行完整的明日记忆 Multi-Agent 改造任务
.DESCRIPTION
    使用 deepseek harness headless 模式自动执行全部改造任务
    不推荐使用，任务太大容易跑偏，建议用 run-phase.ps1 分阶段执行
.PARAMETER ProjectDir
    项目目录
.PARAMETER DshDir
    deepseek-harness 目录
.EXAMPLE
    .\run-all.ps1
#>

param(
    [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
    [string]$DshDir = "E:\DSH\deepseek-harness"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Red
Write-Host "  警告：一次性执行整个改造任务" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "不建议使用此脚本，因为："
Write-Host "  1. 任务太大，Agent 容易跑偏"
Write-Host "  2. 中间出错很难排查"
Write-Host "  3. 无法在关键节点验收"
Write-Host ""
Write-Host "推荐使用 run-phase.ps1 分阶段执行"
Write-Host ""

$confirm = Read-Host "确认要继续吗？(yes/no)"
if ($confirm -ne "yes") {
    Write-Host "已取消"
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  明日记忆 Multi-Agent 改造 - 全部阶段" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置全自动权限模式
$env:DSH_PERMISSION_MODE = "danger-full-access"
Write-Host "[配置] 权限模式: danger-full-access (全自动)" -ForegroundColor Green

# 读取需求文档
$reqFile = Join-Path $ProjectDir "docs\requirements.md"
$planFile = Join-Path $ProjectDir "docs\plan.md"
$reqContent = Get-Content $reqFile -Raw -Encoding UTF8
$planContent = Get-Content $planFile -Raw -Encoding UTF8

# 构造任务指令
$task = @"
你是一个资深全栈架构师，请将项目 $ProjectDir 改造成 Multi-Agent 架构的 AI 英语学习应用。

你需要完整阅读并理解以下两份文档，然后按优先级逐步实施：

## 需求文档
$reqContent

## 计划书
$planContent

## 执行规则

1. 严格按照计划书中的 Phase 顺序执行，从 Phase 1 开始
2. 每完成一个 Phase，写一份完成报告到 docs/progress/ 目录
3. 遇到不确定的设计决策，选择最合理的方案并加 TODO 注释说明，不要停下来问
4. 所有代码必须通过 TypeScript 类型检查
5. 保持 git 提交规范，每个 Phase 完成后 commit
6. 如果遇到错误，尝试修复 3 次，修不好就跳过并在报告中记录
7. 全部完成后输出总总结

项目根目录：$ProjectDir

开始工作。
"@

Write-Host ""
Write-Host "开始执行 DSH headless agent..." -ForegroundColor Yellow
Write-Host "（预计耗时 4-8 小时，请耐心等待）" -ForegroundColor Yellow
Write-Host ""

try {
    Push-Location $DshDir
    
    & pnpm dsh --profile headless $task
    
} catch {
    Write-Error "执行失败: $_"
    exit 1
} finally {
    Pop-Location
}
