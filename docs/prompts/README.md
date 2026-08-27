# DSH Web UI 执行指南

## 启动 DSH Web

```powershell
cd E:\DSH\deepseek-harness
pnpm dsh web
```

然后浏览器打开 `http://127.0.0.1:3080`

## 执行步骤

### 1. 设置全自动权限（重要！）

在聊天输入框里输入：

```
/permissionPresets danger-full-access
```

回车执行。确认切换成功后再继续。

> 不切换的话，Agent 每次执行命令都会弹窗让你确认，就不是无人值守了。

### 2. 设置工作目录

确保当前会话的工作目录是 `E:\CC\tomorrow-memory`。如果不是，可以新建会话时指定，或者用 `/workspace` 命令切换。

### 3. 复制粘贴 prompt

从 `docs/prompts/` 目录下选择对应的 prompt 文件，全部内容复制粘贴到聊天框，发送。

### 4. 走人

Agent 会自动工作，不需要你管。回来后看结果。

## 执行顺序

推荐分三次执行：

| 批次 | 阶段组合 | Prompt 文件 | 预计耗时 |
|---|---|---|---|
| 第一批 | Phase 1 + Phase 2 | `prompt-phase1-2.md` | 4-6 小时 |
| 第二批 | Phase 3 + Phase 4 | `prompt-phase3-4.md` | 3-5 小时 |
| 第三批 | Phase 5 + Phase 6 | `prompt-phase5-6.md` | 2-3 小时 |

每批完成后，你做一次验收：
1. 看 `docs/progress/` 里的阶段报告
2. `git diff` 看看改了什么
3. 跑一下 `pnpm typecheck` 看看类型检查过没过
4. 有问题就让 Agent 修，没问题就进入下一批

## 注意事项

1. **不要关掉浏览器标签页** — Web 模式下会话在服务端运行，关浏览器不影响，但你看不到实时进度
2. **模型选择** — 建议用 `deepseek-v4-pro` 做代码任务，质量比 flash 高很多
3. **长任务建议开着侧边栏看进度** — 可以看到 Agent 在调用什么工具
4. **如果卡住了** — 直接发消息问它 "现在进展到哪了？"，或者用 `/compact` 压缩一下上下文继续
5. **Git 操作** — Agent 会自动 commit，但如果 push 到远程需要你自己来（或配置 SSH key）
