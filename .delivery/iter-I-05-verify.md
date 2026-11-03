# 迭代 I-05 验证报告（2026-09-28 18:06–18:19 实测时钟，独立探针）

## 结论：通过（附 1 条待拍板）

| 判据 | 结果 | 实测数字 + 取证 |
|---|---|---|
| 1 首翻 5/5 零重试 | 绿 | stock Chromium 1.63.0 + 自写探针 `E:\e5b\i05v\i05v-probe.cjs`（dist 快照、本机 route mock、60ms 假延迟）：首翻命中 5/5、重试按钮 0 次、翻面前预取已发 2 条（`probe-report.json`、`probe-firstflip-card1/5.png`） |
| 2 只 GET/同词 0 重发/不破 30/min | 绿 | 全程 /api/lookup 6 条全 GET、同词重发 0、任意 60s 窗口峰值 6/30；非 GET 写请求 0（仅既有 POST /api/review 评分）；`lookup.ts:16` 30/60s 亲读未动 |
| 3 真空手回落既有态 | 绿 | `nothere` 词：卡面「这个词暂无释义」+ 重试/今天先跳过两出口在（`probe-nogloss-toast.png`）；点重试出 error toast「这个词暂无释义」+「重试」动作，非静默非空白 |
| 4 必红反证 | 绿 | 亲自在预取 effect 首行插 `if (true as boolean) return;` 重建 dist 红跑（`i05v-red.cjs`）= 0/5、noGloss 5/5、lookup 0 条；还原后 sha256=`9263b97c187661…93362` 与改前逐字一致（`sha-pre/post-red.txt`），复点 study spec 35/35 绿 |
| 5 套件+闸口 | 绿 | 亲测 `@tm/app test` 18 files/486 绿、`@tm/ui test` 3/169 绿（跑前确认无 next build）、`boundaries.mjs --all` 21/21；StudyScreen data-testid 7 颗均为既有 study-*，0 新增 |

## (c) S-26 重写审查：改断言成立，非弱化凑绿
改前契约（留痕 `04-dev-report-T-18-a.md:119/:153`）="翻面必落 noGloss→重试发 1 条 lookup 出释义"，该行为被 I-05 工单目标本身取代。新 S-26（spec:1096-1158）断言严格更强：首翻必须含释义串且禁现「暂无」、重试钮必须不存在、预取请求序列逐字核、缓存去重计数、真空手仍出两出口、重试 toast 串+tone+action、跳过台账/不计分/完成页 URL 全保留。唯一删除项「重试必发 1 条」即行为变化本身，(d) 单列。

## (d) 未尽事项实测（主会话疑点，待拍板）
亲测：空结果词首次预取 1 条 → 窗口内（t≈30s、t≈2s 各）连点重试 2 次 = **0 新增请求**仅 toast；过 staleTime 5min 后（t=315s）重试恢复发 1 条 GET（`i05v-long.cjs`、`probe-long-report.json`、staleTime 常量在 `lookup.ts:28` 既有口径）。判定：对"上游瞬时故障被 youdao 吞成空"这一支，「重试才显示」以变体形式残留（≤5min 内重试点不动）；对永久查不到词无影响。不违判据 3 字面，**不判红**。最小修法（待 TPM 拍板另开工单）：`retryGloss` 内 fetchQuery 前加一行 `queryClient.removeQueries(lookupQueryOptions(word, dir))` ⇒ 重试恢复"必发 1 条"，预取去重不受影响；同步翻转 spec:1145 计数期望。

## 越界核查（mtime+sha 两证实测）
queue-service.ts 6224B/`98dfdb5f3137`/09-19、routes/lookup.ts 2170B/`1c3c09576d1c`/09-05、youdao.ts 2559B/`48de6ac53d83`/09-05、Flashcard.tsx 17297B/`8ea97d9fc443`/09-19（四颗均早于本轮，未碰）；decor-layer.tsx 1405B/`40045500ef98` ✓、search-section.tsx `63fb90cc0c9e` ✓；根 data.db 与 packages/server/data.db 仅 stat 未开库（mtime 09-18/09-17）。声称落点两文件尺寸/sha/mtime 与盘面逐一相符。

## 主流程回归
翻面→评分→前进→末张落完成页链路浏览器全程无错；selfTest 档缓存命中跨档 0 重发；评分/跳过/toast 正常。
