# Phase 2 - 任务 5：Scheduler Agent（FSRS-5.0 算法）

## 做了什么

1. **ts-fsrs 集成** `tools/fsrs.ts`
   - `cardFromJson` / `cardToJson`：与 server 端 fsrs_cards.fsrs_data 的 JSON 格式完全兼容（Date ↔ ISO 字符串）
   - `createDefaultCard`：新卡 S=1、D=5（任务约定，与 init-fsrs.ts 一致）
   - `retrievability`：**任务核心公式 R(t) = exp(-t / S)**；另保留 `retrievabilityPowerLaw`（ts-fsrs 原生幂律）供对齐
   - `buildTodayQueue`：R < 0.9 的单词按 R 从低到高排序
   - `applyRating`：测评评分 1-4 → ts-fsrs `repeat` → 更新 stability/difficulty/due

2. **Scheduler 节点** `nodes/scheduler.ts`
   - review：从 fsrs_cards 读取卡片 → 生成今日复习队列（含回忆概率、到期数统计）
   - assess：评分 → FSRS 更新 → 持久化（含复习前后 S/D 变化、下次复习日期）

3. **API**：`GET /api/review/today`（队列）、`POST /api/review`（评分更新）

## 验证（SQLite 实测）

- [x] `init-fsrs` 初始化卡片：S=1、D=5、state=New
- [x] assess 评分 Good 后：S 1→3.17、D 5→5.28、reps 0→1、state New→Learning、last_review 落库
- [x] review 队列：R ≥ 0.9 全部排除，队列为空时正确提示
- [x] `/api/review/today`、`/api/review` 接口测试通过

## 说明

- 任务公式 exp(-t/S) 与 ts-fsrs 幂律 forgetting_curve 在 S 较大时接近；代码注释保留两种实现，默认按任务要求用指数式。
- 阈值 R < 0.9 通过 `REVIEW_THRESHOLD` 常量配置。
