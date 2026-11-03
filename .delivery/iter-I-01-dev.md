# 迭代 I-01 开发记录（2026-09-28 13:12 实测时钟）

## 改动摘要
| 文件 | 改了什么 |
| --- | --- |
| apps/app/src/screens/LookupScreen.tsx | hero 与 dock 之间加可折叠 spacer：未聚焦且无查询时 `h-[45vh]`，`focused \|\| queried!==''` 时收 `h-0`；`transition-[height] duration-move ease-standard`（240ms，preset 既有档，⛔ 魔法毫秒、⛔ 改 preset）。dock 节点/sticky 一字未动 |
| apps/web/src/components/home/search-section.tsx | 同一手法：slogan 与框之间 spacer `h-[38vh]↔h-0`；新增可选 prop `hasQuery`（=App 的 queried 同判据，防 Enter 后回落） |
| apps/web/src/app/(user)/page.tsx | 工单外必要配套（一处）：列容器去 `justify-center` —— 居中容器会把位移吸收一半，收不到 ≤22% 档；并传 `hasQuery={queried!==''}` |

## 做完标准自验（stock Chromium 1.63，脚本 E:\e5b\i01-position.cjs / i01-clickability.cjs；工单引用的 firstframe-20260927.cjs 盘上不存在，按同要点新写）
| 判据 | 实测 |
| --- | --- |
| ①未聚焦居中 42–62% | App dist file://：50.51%(980×1700) / 55.78%(390×844) ✅ |
| ②聚焦 0–22% 且时长 120–420ms | App：5.51% / 10.78%；spacer transition-duration 计算值=0.24s，点击到稳定 281–310ms ✅ |
| ③dock 同一实例+sticky 仍绿 | 浏览器内身份比对 dockSameNode=true、class 含 sticky top-0；lookup-screen.spec 271–287 未改，484/484 绿 ✅ |
| ④结果区/面板/TabBar 不变 | fixed TabBar 与 CTA 恒在视口底、elementFromPoint 可点=true；最近面板 124–237px 在视口内；首页可交互元素无新增（spacer aria-hidden） ✅ |
| ⑤网页版 `/`（next start 3100 生产产物） | 未聚焦 47.51% / 56.84%；聚焦 9.51% / 18.84%；0.24s ✅ |

## 必红反证（真跑）
App：临时把 spacer 恒 `h-0`（删"撑开"）→ 判据①实测 5.51%/10.78%，出带即红（13:05）；Web 同法 → 9.51%/18.84% 判据⑤红（13:09）。还原后两文件 sha256 与绿态逐字一致（dd3bc3…/920a32…/88ba91…），复量回绿。

## 跑了哪些命令（尾行）
- `pnpm --filter @tm/app build` ✓ dist-guard 过；`test` → 18 files / 484 passed ×2（基线未减）
- `pnpm --filter @tm/ui test` → 3 files / 164 passed；`@tm/web test` → 16 passed；`@tm/web typecheck` 净
- web `next build` ✓；`playwright test`（全量 e2e）→ 118 passed (49.6s)
- `node tools/boundaries.mjs --all` → 21/21 全绿；`--dist` → 1/1 绿，首屏 JS gzip 184,062 B ≤ 256,000

## 未尽事项与风险
- 真实手机上键盘弹起会缩视口，聚焦态中心百分比会略变（判据按无软键盘的 stock Chromium 口径实测）。
- 反证红态期间发现 `next build` 与在跑 dev server 共用 `.next` 会出脏态（测量瞬时值失真），已以重启+清 `.next` 排除，非产品问题。
- Web `hasQuery` 为新增可选 prop（默认 undefined），⛔ 改测试即绿；App 侧 Enter 后面板关、框不回落（queried 钉住），符合判据①"未聚焦**且无输入**"口径。
