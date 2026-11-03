# 迭代 I-06 开发记录（dev-fix，2026-09-28 18:42 实测时钟）

## 改动摘要（仅 1 文件，未顺手重构）
| 文件 | 改了什么 |
|---|---|
| `packages/ui/src/patterns/Heatmap.tsx:240-241` | 新增单点列距 `const colPitchPx = cellPx + gapPx`（格子与标签同源口径） |
| `packages/ui/src/patterns/Heatmap.tsx:299-317` | 月份标签行**移进 `.heatmap-scroll` 滚动容器内**（置于格阵上方），外层 `flex flex-1` 包裹删除，改 `flex w-max`，span 宽 = `colPitchPx`；`role=status` 信息条仍在容器外（`:422-432` 未动） |

## 做完标准自验（取证面 = **真实装配路径**：`pnpm -F @tm/app build` 的 dist + stock Chromium(playwright@1.63.0) 路由拦截 mock `/api/{analyst,profile,checkin/status,review/queue}`，走真实 `ProgressScreen`，390×844，53 周合成数据；脚本/截图/JSON 在 `E:\e5b\i06\`）
| 判据 | 实测 |
|---|---|
| 1 横滚最左/中/最右逐列 Δx | scrollLeft=0/217/434 三档：maxAbsDiff = **0px / 0px / 0px**，>1px 列数 0/54（`result-final-green.json`，截图 judge1-left/mid/right.png） |
| 2 自动滚到"今天"后仍对齐 | `:207-211` 效果经 mode 切换触发（每周→每日）：scrollLeft=434=scrollMax，todayVisible=true，maxAbsDiff=**0px**（judge2b-autoscroll.png）。注：首帧 loading→loaded 时该 effect 因 deps（mode/weeks/grid.length）不变而不重跑 ⇒ scrollLeft 停 0 —— **既有行为，本单未动、未扩范围**；卡片"滚到今天"由宿主 P-08 路径负责 |
| 3 标签归属 | 54 列逐列核对：月份变化处必出标签且=首格月份、连续同月不重复 ⇒ violations=**0**；标签覆盖 **12** 个月（≥11） |
| 4 必红反证 | 还原"标签在容器外"后重建重测：最左 0px（该档本就对齐）、**中档 maxAbsDiff=217px、右档 434px，54/54 列 >1px ⇒ 判据 1 红**（`result-reverted-red.json`）。恢复后 `sha256(Heatmap.tsx)=dbf6afc3…953e6063` 与改后终值**逐字一致**，重跑转绿 |
| 5 套件 | `@tm/ui test` 169/169 绿；`@tm/app test` 488/488 绿；`node tools/boundaries.mjs --all` 21/21 绿；`@tm/app build` dist-guard 过；`apps/web/.next` 未触碰（跑测前确认 17:16 后无写入、无人在 build） |

## 断言冲突处理（工单第 6 条要求点名）
- `packages/ui/test/patterns.spec.tsx:476`（status-outside-scroller 口径）：`expect(container.querySelector('.heatmap-scroll')?.contains(status)).toBe(false);`
- App 侧同口径镜像：`apps/app/test/progress-screen.spec.tsx:544`。
- **处理 = 不改断言也不改实现，两者不冲突**：该断言的主语是 `role="status"` 点选信息条（§3.7.6 明确它必须在滚动区外），而本单移进容器的是 `aria-hidden` 月份标签行；信息条保持在 `:422-432` 容器外原样未动，两条断言实测继续绿 ⇒ 无需 TPM 拍板。

## 边界自查
`--heat-*` token、UTC/周一起始日期口径（`:87`）、`apps/web` 两文件、`ProgressScreen` 数据装配：零改动；无 git 写操作；未新增 testid/id/DOM 语义；未触碰任何 data.db。

## 未尽事项（如实）
- 判据 2 的"首帧自动滚到今天"在 loading 竞态下 deps 不重跑（现状即如此，非本次引入）；若要修属另一单。
- 反证跑覆盖的截图已被终态绿跑同名覆盖，红档数字留存于 `result-reverted-red.json`。
