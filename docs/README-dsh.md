# 自动执行 DSH 任务脚本

> 用于将需求文档交给 deepseek harness 自动执行，无需人工确认

## 前置条件

1. deepseek-harness 已安装并能正常运行（位于 `E:\DSH\deepseek-harness`）
2. DEEPSEEK_API_KEY 已配置
3. pnpm 已安装（Node 22+）

## 使用方式

### 方式一：分阶段执行（推荐）

每个阶段独立执行，完成后你做一次验收。

```powershell
# 执行 Phase 1
.\run-phase.ps1 -Phase phase1

# 验收完了执行 Phase 2
.\run-phase.ps1 -Phase phase2

# ... 以此类推
```

### 方式二：一次性执行整个需求文档

```powershell
.\run-all.ps1
```

不推荐，因为任务太大会跑偏。

## 原理

设置环境变量 `DSH_PERMISSION_MODE=danger-full-access` 来关闭沙箱限制和审批确认：

- 沙箱模式：`danger-full-access` → 命令不会被沙箱拒绝
- 审批策略：自动设为 `never` → 不需要询问用户

这样 Agent 可以自由读写文件、执行命令，完全自动化运行。

## 注意事项

1. Agent 可能会在错误中循环，建议设置超时（脚本里有 2 小时超时）
2. 首次运行会比较慢，因为要安装依赖、构建向量索引等
3. 如果中断了，重新运行同一条命令即可，Agent 会从断点继续
4. 每个阶段完成后，务必检查 git diff 确认改动符合预期
