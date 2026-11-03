# 迭代 I-05 开发记录（2026-09-28 17:44–18:05 实测时钟）

## 改动摘要（只动 2 个文件，未碰 queue-service/Flashcard/lookup 路由/youdao）
| 文件 | 改了什么 |
| `apps/app/src/screens/StudyScreen.tsx` | :27-31 头注释改口径；:140 StudyCard.gloss 注释；:526-550 新增预取 effect（装配后/指针前进时对第 i、i+1 张 `gloss===''` 词 `queryClient.fetchQuery(lookupQueryOptions)`，查到并入 `glosses`，空/失败不动状态）；:551-570 `retryGloss` 空串分支不再静默：保持既有 noGloss 态 + `host.toast(STUDY_COPY.noGloss.title,{tone:'error',action:重试})` |
| `apps/app/test/study-screen.spec.tsx` | 夹具按词回释义/可控空结果/可控延迟（:151-153、:177、:205-221、:242）；S-26 重写为新契约（:1095）；新增 I-05 组（:1177）：5 张首翻 5/5、零重试、lookup 恰 5 条、同词两现只发一次 |

## 做完标准自验
1. **判据 1（5/5 零重试）**：vitest `I-05 预取` 用例（假 /api/lookup 延迟 20ms）首翻命中 5/5；浏览器实测（stock Chromium 1.63.0 + `pnpm -F @tm/app build` 的 dist，假 /api 全程本机不出网，80ms 延迟）= **5/5，重试按钮出现 0 次**，取证 `E:\e5b\i05\i05-browser-report.json`、`i05-firstflip-card1/5.png`。
2. **判据 2（请求计数/限流）**：浏览器全程 `/api/lookup` **6 条、全 GET、同词 0 重发**（5 张复习 + 1 空结果词；翻面前已发 2 条=预取；bravo 跨档缓存命中 0 网络）；60s 窗口峰值 6/30，余量 24。vitest 5 张轮恰 5 条。未启服务端实例（量测面是客户端请求行为，真库三颗与有道配额零触碰）。
3. **判据 3（真空手回落）**：`nohit` 词首翻=既有「这个词暂无释义 + 重试/今天先跳过」态；点重试 ⇒ toast-layer 出「这个词暂无释义」+「重试」动作（`i05-nogloss-toast.png`），卡面不再空白无反馈。
4. **判据 4（必红反证）**：effect 首行插 `return;` 关预取 ⇒ vitest I-05/S-26 3 红（首翻无释义、重试钮出现）；浏览器红跑（`i05-red.cjs`）= **0/5，noGloss 5/5，lookup 0 条**；恢复后复点 5/5 回绿。恢复后 sha256=改前逐字一致：`StudyScreen.tsx 9263b97c1876615e5d9b3dcf43ba24254c9c8f4385246f1c23bb56529c293362`（`E:\e5b\i05\sha-green.txt`/`sha-final.txt`）。
5. **判据 5（套件）**：`@tm/app test` 18 files/486 全绿；`@tm/ui test` 3 files/169 全绿（跑前确认无 `next build` 在飞，`.next` 终态未由本轮改写）；`node tools/boundaries.mjs --all` 21/21 全绿；0 新增 testid/id。

## 波及其他功能的自查
预取仅对 `gloss===''` 卡触发，存量队列出参含释义的路径 0 请求（其余 34 条 S 组用例不动全绿）；`重试` 网络语义由"必发 1 条"变为"缓存命中 0 条"，属工单目标本身；Web 侧、评分/撤销/跳过路径无涉。

## 未尽事项
- 上游真查不到时该空结果会在 React Query 缓存里驻留 5 分钟（staleTime 既有口径），期间 `重试` 命中缓存直接回 toast 而非重查——如 TPM 认为需要"重试强制重查"另开工单。
- 服务端批量释义（T-11）未动，预取窗口外的词仍靠翻到再补，属范围外。

## 修复回环（第二轮）（2026-09-28 18:21–18:32 实测时钟）

- **改了什么（1 行 + 注释）**：`apps/app/src/screens/StudyScreen.tsx:552-584` 的 `retryGloss` 在 `:556` 取 `options = lookupQueryOptions(word, resolveDirection(word))`、`:562` 加 `queryClient.removeQueries({ queryKey: options.queryKey })`，`:564` 仍 `fetchQuery(options)` ⇒ 用户显式「重试」必发 1 条真请求（`:557-561` 注因由）；口径同步 `:31` 头注释、`:531` 预取注释删掉「`重试` 命中缓存 0 请求」。未动预取 effect（`:535-550`）、未动全局 `QueryClient` 默认 `staleTime`、未动 `packages/server/src/services/youdao.ts:67-69` 与超时值（F-74 另案）。测试面：夹具 `apps/app/test/study-screen.spec.tsx:152-154、:216-222` 新增「瞬时空手」，S-26 `:1148-1163` 把「重试 0 重发」翻转为「必 +1 条」并加核 method/word（非删断言），新组 `:1241-1320` 两例。
1. **判据 1（空译文 ⇒ 重试必发真请求）**：浏览器实测 stock Chromium 1.63.0 + `pnpm -F @tm/app build` 的 dist 快照 `E:\e5b\i05b\dist-green`、本机 `page.route` 假 `/api`（0 出网）：瞬时空手词 `flaky` 首条回空 ⇒ 卡面「这个词暂无释义」+「重试」；点「重试」⇒ `/api/lookup` **6→7（+1 条真请求）**，mock 第二次给真释义 ⇒ 卡面立即出 `flaky 的释义`、「暂无」串消失（`i05b-report-green.json`、`green-flaky-nogloss.png`/`green-flaky-after-retry.png`）。改前同脚本同流程实测 6→6=**0 条**。永久空手词重试同样 +1 条且既有 toast 回落不变（`green-nogloss-toast.png`）。
2. **判据 2（预取去重不回归）**：连续 5 张首翻 **5/5**、卡面「重试」按钮出现 **0 次**、5 张轮 `/api/lookup` **恰 5 条**（翻面前已发 2 条=预取窗口）⇒ 与改前口径逐字相同、增量 0；全程 9 条 = 红跑 7 条 + 2 次显式「重试」各 1 条 ⇒ 加号只落在用户动作上；9 条全 GET、非 GET 异常 0、任意 60s 窗口峰值 9/30、同词预取重发 0。vitest：3 词预取恰 3 条 + 2 次重试 = 5 条（`判据 2` 绿）。
3. **判据 3（必红反证）**：把 `:562` 那一行注释掉重建 `E:\e5b\i05b\dist-red` 跑同一脚本 ⇒ 重试网络增量回落 **0 条**、卡面不出释义（`i05b-report-red.json`）；恢复后 `StudyScreen.tsx` sha256=`cb24c4443994c6883231524cb2fba556b0e83332d7ef4df4961454b09d1ed363`，与本轮改后终值逐字一致（`E:\e5b\i05b\sha-final-1.txt`，`spec=abd54b4e…391d`）。
4. **判据 4（套件+闸口，18:30–18:31）**：`@tm/app test` 18 files/**488** 全绿（上轮 486 + 本轮 2 例）；`@tm/ui test` 3 files/**169** 全绿（跑前 `Get-CimInstance Win32_Process` 亲查：仅 `next dev -p 3005`/`next start -p 3100·3210` 常驻，**无 `next build` 在飞**，`.next` 未被本轮改写）；`node tools/boundaries.mjs --all` **21/21** 全绿；`StudyScreen.tsx` `data-testid` 仍 7 颗、0 新增。
- **边界**：git 0 写操作（只跑过 `git status` 只读）；根 `data.db` 三颗与 `packages/server/data.db` 0 触碰（连开库探针都没跑）；向 tmword.xyz 0 请求（假 `/api` 全本机 mock，`/api/lookup` 只 GET）。取证与临时脚本全在 `E:\e5b\i05b\`，仓库内 0 残留。
- **未尽事项**：① 连点「重试」每次各发 1 条（无冷却/去抖），瞬时故障下高频点击会线性吃 30/min 限流额度（`routes/lookup.ts:16`）——是否加「同词 1 次/分钟」节流待 TPM 拍板；② 上游超时被吞成 success+空译文的根因仍在 `youdao.ts:67-69`，本轮只让客户端的重试有效，服务端语义归 F-74；③ 空结果被 `removeQueries` 撤掉后当轮不再享 5min 缓存，词真查不到时每点一次即一条请求（与②同时收口更划算）。
