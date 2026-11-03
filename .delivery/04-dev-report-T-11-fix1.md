# 04-dev-report-T-11-fix1 · T-11 第五轮（一处小修 + 解 skip）

**改了什么**
- `packages/server/src/trpc/routers/chat.ts:18`（新增 `import { supplementErrorStatus } from '@tm/shared'`）+ `:39-48`：`chat.history` 抛 `ThreadForbidden` 的 `cause` 由 `{tmCode, reason}` 补成 `{tmCode, httpStatus: supplementErrorStatus(err.code), facade:'trpc', reason}` —— 形状照 `routers/profile.ts:42,49` 的 `toTrpcError()`；状态取自 shared，本文件不出现 403 字面量；`reason` 是原有诊断键。procedure 名/签名/input/output 一字未动。
- `packages/server/test/integration/chat-isolation.spec.ts:413`：`it.skip` → `it`，三条断言一字未动（`status === TM_ERRORS_SUPPLEMENT.FORBIDDEN.http` / `message === errorMessage('FORBIDDEN')` / `data.code === 'FORBIDDEN'`，没放宽成"不是 200"）；`:399-412` 的 skip 理由改写成 P-2 闭环记录。
- 合规：`app.ts`/`config.ts`/`trpc/init.ts`/`middleware|db|routes|services/**`/`packages/{shared,agent}`/`tools/**`/`apps/**` 零改动；零 git 写操作；没碰仓库 `data.db`（用例自带 `os.tmpdir()`）；未跑 `TRPC_SHAPE_UPDATE=1`；未动 `tools/{ownership,exceptions}.json`。

**为什么**：`init.ts:69` 的 http 兜底只在 `cause.httpStatus` 非 number 时才查 §4.6 冻结表，而 `FORBIDDEN` 属 `TM_ERRORS_SUPPLEMENT` ⇒ 取到 `undefined.http` = TypeError ⇒ errorFormatter 自己把 403 翻成 500。带 `httpStatus` 即短路 = 简报的修法②，且落在 T-11 可写面（修法① 在 T-07 名下，未动）。

**冒烟（真实粘贴，本机 sqlite）** ① `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server chat-isolation`
```
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests) 4924ms
      Tests  25 passed (25)      ← 同一命令解 skip 前是 `24 passed | 1 skipped (25)`
```
② `--filter @tm/server typecheck` 与 `--filter @tm/agent typecheck` → 均只回 `$ tsc -p tsconfig.json --noEmit`（clean）；`pnpm exec eslint <两文件>` 无输出。③ `pnpm --filter @tm/server test`
```
 FAIL  @tm/server  test/trpc-shape.spec.ts … 受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword,
   auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo
 Test Files  1 failed | 13 passed (14)      Tests  1 failed | 320 passed (321)      ← A-28-1 已知红，未修、未再生基线；清单里没有 chat.history
```
④ 其余已知红/不修面（`enforce-flag-single-read` 13>1 / `--self-test` 2 探针 / `--colors` / `--check-ownership`）属 `tools/**` 门禁，不在上面这条命令里，本轮未跑未判；`auth-hardening` 一次通过（26 tests，无瞬时红，不需复跑）。

**新发现（只登记、不动手）** N-1 → T-07（`trpc/init.ts:69`）：supplement-盲本身仍在，我这次只是绕开——任何 `cause` 带 supplement `tmCode` 却不带 `httpStatus` 的抛出照旧变 500。最小复现（真跑）：`pnpm exec tsx -e "import('./packages/shared/src/index.ts').then((s)=>{…TM_ERRORS['FORBIDDEN'].http…})"` ⇒ `isTmErrorCode(FORBIDDEN) = false` / `-> THROWS: Cannot read properties of undefined (reading 'http')` / `supplementErrorStatus(FORBIDDEN) = 403`。建议一处改法（全用已导出符号）：`tmCode ? (isTmErrorCode(tmCode) ? TM_ERRORS[tmCode].http : tmCode in TM_ERRORS_SUPPLEMENT ? supplementErrorStatus(tmCode as TmErrorSupplementCode) : undefined) : undefined`；给 shared 加"两表通吃"的 `errorHttpStatus` 也可，但那是 §4.6 快照面，需裁决。
- N-2 → T-10（`trpc/routers/review.ts:25`）：`cause: err` 直传 `ReviewError`，而它的键是 `code`/`http`（`services/review-service.ts:41-49`）⇒ `cause.tmCode` 恒 undefined ⇒ 复习域 tRPC 的 `data.code` 停在协议码、补充码从没提升（不是 500，但"两门面同码"在复习域只证到 REST）。⚠ 若按 N-1 直觉改成 `cause:{tmCode: err.code}` 而漏 `httpStatus`，会立刻踩中 N-1 ⇒ 两条建议应一并处理。
**盘面数字对账（A-32-9，一行）**：上一轮口径 `@tm/server test` = 286 pass / 1 fail / 1 skip（12 文件 288 例）‖ 本轮实测 = 320 pass / 1 fail / **0 skip**（14 文件 321 例）——+2 文件 +33 例来自 T-07（`boot-check`/`auth-hardening`）与 T-06（`test/db/**`）在途新增，本轮净贡献 = 那条 skip 翻绿；唯一红仍是 `trpc-shape`（A-28-1，未修、未再生基线）。
