# 迭代 I-03 验证报告（独立实测，时钟 2026-09-28 16:53:16–17:01:12）
## 结论：通过
取证：stock Chromium（playwright@1.63.0 stock，⛔ browser-use/Electron）+ 自写探针 `E:\e5b\i03v\vprobe.cjs`（latest.json/shots 留证）。
App 面 = 本人 `pnpm -F @tm/app build` 重建 dist（产物 hash 与开发版逐字同：index-DXdMRitQ.js / index-CTP3ZqTD.css）file:// 直载；Web 面 = 本人自起 `next dev -p 3312`（测毕已停，3312 仅本 agent 所有）。
## 做完标准逐条
| 判据 | 结果 | 实测 |
| ① 未聚焦中心 33±2pp 四组 | 绿 | App 980×1700 **33.01%** / 390×844 **32.98%**；Web **33.01%** / **33.04%**；spacer 实测 467.5/187.36/399.5/119.84px（=27.5/22.2/23.5/14.2vh） |
| ② 聚焦 ≤20% 且走 height+duration-move | 绿 | 5.51/10.78/9.51/18.84%；spacer computed transitionProperty=height、duration=**0.24s**，App dist CSS 为 `.duration-move{transition-duration:var(--dur-move)}`（--dur-move:.24s，⛔硬编码毫秒），聚焦 spacer 收 0px |
| ③ 截图目视 | 绿 | `E:\e5b\i03v\shots\*` 8 张：slogan↔框间隙 484.5/204.4/412.5/132.8px 无重叠；App 胶囊↔tab 栏重叠 0px（Web 无 tab 栏）；scrollWidth>clientWidth 四组两态全 false；390 档不挤、不与顶部 header 打架 |
| ④ 必红反证 | 绿 | 16:57:48 临时把 `search-section.tsx:97` 改回 `h-[38vh]` → 探针 --strict **EXIT=1 RED**（idle 47.51%/56.84% 出档，与 I-01 基线逐字吻合）；16:58:06 原样恢复复点 **GREEN EXIT=0**；恢复前后 sha256 一致 = `63fb90cc0c9ee1eda778c0ebf39cf60df4aee92f27af7906a3bbafcd17a1b2a3` |
| ⑤ 套件复跑 | 绿 | `@tm/app test` **484/484** @16:58:31；`@tm/ui test` **169/169** @17:00:33；`@tm/web test` **16/16** @17:00:38；`node tools/boundaries.mjs --all` **21/21** @16:58:36；⛔ 新增 testid / ⛔ 改 DOM（两文件仅 spacer className 变） |
## 账面误差如实记
首跑 `@tm/ui` 得 165：`ui.spec.tsx:618` 的 4 颗动态用例以 `apps/web/.next/server/app/*.html` 存在为条件，被本人 dev server 覆写 .next 所致（⛔ I-03 删测试：三颗 spec mtime 09-21/09-28 14:34/09-23，早于 I-03 窗口）；重建 .next 后回 169，测试文件零改动。开发自报 169 与工单口径均成立。
## 越界检查
`packages/ui/src/patterns/SearchBar.tsx` mtime 09-28 **14:45:56**（I-02 时刻，早于 I-03 窗口 16:32）、sha256 `9a88c2be…b95ccb`，`:196 absolute inset-0` 与 `:204 outline-offset-0` 原样在位；tokens 真身 = `packages/ui/src/styles/tokens.css`（工单写的 `packages/ui/src/tokens.css` 不存在），mtime **09-23 04:10:41**、sha256 `6c2b43a7…e16221`。两颗均未被本轮触碰。tab 栏/slogan 文案未动；⛔ git 写、⛔ 碰 data.db、对 tmword.xyz 0 请求。
## 主流程回归
首页查词 idle→focus→面板→tab 栏路径 8 组截图无异常；JS pageerror 0；lookup-screen DOM 身份/sticky 断言由 484 绿覆盖。
## 未尽事项
tmword.xyz 仍为 I-02 旧版（线上 `h-[38vh]`）、APK 为旧包 —— 生效需 TPM 拍部署/重出包；390 软键盘态沿用 I-01 在册风险未重测。
