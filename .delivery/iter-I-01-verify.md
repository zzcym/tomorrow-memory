# 迭代 I-01 独立验证报告（2026-09-28 13:21 实测时钟 · 验证者复跑，⛔ 未采信开发数字）

## 结论：通过（附 1 条账面误差 + 1 条登记风险，均不判红）

## 做完标准逐条（stock Chromium / playwright 1.63 绝对路径；脚本 E:\e5b\i01v-verify.cjs / i01v-tabbar.cjs，产物输出 E:\e5b\i01v-out.jsonl）
| 判据 | 结果 | 实测 |
| ①未聚焦 42–62% | 通过 | App file:///…dist/index.html：50.51%(980×1700)/55.78%(390×844)；Web 127.0.0.1:3100/：47.51%/56.84% |
| ②聚焦 0–22% 且 120–420ms | 通过 | App 5.51%/10.78%，Web 9.51%/18.84%；spacer transitionDuration 计算值=0.24s；点击→稳定 299/318/302/303ms |
| ③dock 同实例+sticky+spec 未改 | 通过 | 浏览器内 `window.__dock===现查` = true；className 含 `sticky top-0`；lookup-screen.spec.tsx 盘面 :271-287 逐读原样（含两条断言），mtime 09-23 03:14、sha256 4be19ded…（apps/app 未被 git 跟踪，git diff 恒空，故用 mtime+sha+读行自证） |
| ④结果区/面板/TabBar/≤5 | 通过 | tab-bar 5 按钮聚焦前后 trial-click 全通过；最近面板 124–237px 在视口内；实查 happy → lookup-result 出现（top≈196–199px）；home-root 可交互=3（input+提交钮+CTA），spacer aria-hidden 无新增 |
| ⑤网页版 `/` 同判据 | 通过 | 数字见①②；next start 用现成 .next（BUILD_ID 13:23 新于源码 13:09），验证毕已关停 3100 |

## 命令复跑尾行（全部亲跑）
- `@tm/app test` → Test Files 18 / Tests 484 passed (484)，15.54s（13:15）
- `@tm/ui test` → Tests **168 passed (168)** —— 开发自报 164，账面误差（产品全绿，仅报告数字不实）
- `@tm/web test` → 16 passed；`playwright test home+home-redline`（受影响子集，全量 118 未重跑）→ 16 passed (6.3s)
- `boundaries --all` → "21/21 条通过，全绿"；`--dist` → 1/1，首屏 JS gzip **184062 B ≤ 256000**
- dist 时效：dist 13:06:01 新于 LookupScreen 13:05:43，未重建；assets sha 前缀 js=e8865c82 / css=23bff67c

## 边界-不许动 复点
- 以 09-27 部署 tar（E:\e5b\tm-deploy-20260927.tar.gz）解出基线逐文件 diff：改动 = 两端 spacer（aria-hidden，⛔ 新 testid/id）+ `hasQuery` prop + page.tsx 去 `justify-center`，此外 0 行；今日盘面 08:00 后被改的产品文件仅这 3 个。
- tokens.css mtime 09-23、服务端 0 文件今改、全仓 grep 无 `test.skip/test.fail` 新增（仅存 server 旧 `it.skipIf`，非本轮）。

## 新增反证（键盘弹起，只登记不判红）
视口高临时收 55% 复量聚焦中心：App 10.01%/19.61%（仍 ≤22）；Web 980 档 17.28% OK，**Web 390×464 = 34.27% 出 0–22 档**（上滑量 vh 无关、页头偏移固定所致）。判据本按无软键盘口径定，真机窄屏键盘态聚焦框偏低属风险，留 TPM 定夺。

## 未尽事项
全量 web e2e 118 未重跑（子集 16/16 + 配置注释口径）；开发自报 ui 数 164≠168 待其订正；真机键盘态未测（仅视口模拟）。
