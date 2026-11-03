# 迭代 I-09 · 开发报告（**TPM 依盘面重建** · 实测 09-30 00:14–00:26）

> ⚠ 本报告**不是**开发 agent 自写：`i09-dev` 撞 150 回合硬上限，崩于写报告之前（盘面最后动作 = 00:09 `shot-web-short6-toast.png` / 00:14 `webdev2.log`）。下列每一条都是 TPM 本人从盘面重建：源码亲读 + `E:\e5b\i09\dev\` 证据 + 自己复跑闸，⛔ 采信任何口头申报（口径同 A-84「agent 崩在收尾、按盘面认定」）。

**改动面（sha256 前 12 / mtime，00:24 我复点）**
1. `mobile-memory/assets/app.js` 45081 B `276a12954df9` @09-29 23:38:02 —— `:951` label 与 `:962` `p1.length < 8` 由 4→8；旧 bundle 无 import 通道，注释自证那颗 8 是手抄 `PASSWORD_MIN`。
2. `packages/shared/src/constants/copy.ts` 49104 B `80c29f90bd42` @23:35:43 —— `:756 signInShortPasswordNotice`，全仓唯一声明点（字面"8"属文案，同 :705/:719 既有定稿串惯例；判据仍只经 `limits.ts` 的 `PASSWORD_MIN`）。
3. `apps/web/src/components/login-dialog.tsx` 10308 B `90c8bd3700c9` @23:57:42 —— `:81` 内存态 ref（⛔ 落存储/日志）、`:171` 判据、`:128-132` **成功之后**告知 + 改密入口；`:118-124` `upgrade` 支早退 ⇒ 不重复告知。
4. `apps/app/src/screens/LoginScreen.tsx` 10922 B `fe8ea45b801e` @23:57:47 —— `:164` 同一判据，`outcome === 'upgrade-required'` 早退之后才 toast。
5. `packages/server/src/trpc/routers/profile.ts` 10524 B `d90a88406cd9` @23:38:11 —— **只加注释**（`:176`），`:180` 那颗 `min(4)` 冻结形状一字未动。
边界：`packages/ui/src/auth/AuthFormShell.tsx` 31143 B `22a2af577c0c` @09-21 03:38:35 = 改前值 ⇒ 提交拦截口径未被碰。

**行为证据（开发自采，`E:\e5b\i09\dev\`，stock Chromium）**
- `result-main.json` @23:53:08：web `short6` 告知 **1** 条 → 入口 `http://127.0.0.1:3299/profile/security`；web `long8` **0**；app `short6` **1** → `#/security`；app `long8` **0**；两端串逐字相同 `这个密码比较短，建议改成至少 8 位` + 按钮「修改密码」；`short6` 两跑 `loggedIn:true`（登录面提交口径一字未改）。
- `result-red.json` @23:57:32（把判据临时改 `<4`）：四跑全 **0** 且 `short6` `waitedInVain:true` ⇒ 必红反证成立。
- `result-restored.json` @23:58:19：回到 1/0/1/0；`restored-fingerprints.txt` 两颗 sha 与当前盘面**逐字相同** ⇒ 反证态没有留在盘上。
- 只写面：sqlite 全程 `E:\e5b\i09\dev\scratch.db`；非 GET 只有 `POST /trpc/auth.login` 与 `POST /api/login`（本机回环）。

**闸**
- 开发三轮（23:33 / 23:38 / 00:03 起）ui **169**、app/web/boundaries exit 0，`baseline-diff.txt` 0 B。
- TPM 亲跑（00:14:39–00:15:31，`E:\e5b\i09\tpm\`）：ui / app 488 / web 16 / server 446 passed + 1 skip / boundaries **21/21**，exit 全 0；`packages/server/test/trpc-shape.baseline.json` 433052 B `cf16176f3270` @09-21 21:40:33，与开发快照 `trpc-shape.baseline.snapshot.json` **同 sha** ⇒ 隐含"schema 差异 0 行"。
- 真库只读面三颗复点（00:22）：`data.db` 253952/`6595517661cc` @09-18 04:05:38、`-shm` 32768/`2bceb8907276`、`-wal` 424392/`88ed3fe2b2ce`、占位库 0/`e3b0c44298fc` ⇒ 一字未动。

**账面更正一颗（我自己 00:14 那次 ui = 165，不是 169）**
差在 `packages/ui/test/ui.spec.tsx:622` 的 4 条 `it.each` —— 它取 `apps/web/.next/server/app/{index,study,profile,report}.html`，而开发 00:08 起 `next dev`（:3299）把 22:29 那份构建产物换成了 dev 态目录 ⇒ 四颗 html 不在盘上，整块 `skipIf` 静默跳过。我 00:19:43–00:20:24 重跑 `pnpm --filter @tm/web build`（exit 0），00:20:50 ui = **169/169**。定性：环境态、非回归；但本地 `.next` 新 BUILD_ID `h4lUeBQoAMaPZrna4xgQw` 与线上 `WGcxWIDIU7mGWu5v5CWPZ`（A-116 #619）**不同代**，账面与后续部署 ⛔ 混用。

**未做 / 欠件（如实）**
- ⛔ 重出「明日记忆.apk」（工单明令留给出口拍板）⇒ 存量 `mobile-memory/明日记忆.apk` 58691 B @09-18 装机面**仍是旧「至少 4 位」**。
- 开发自写报告缺（崩）；独立验证另见 `.delivery/iter-I-09-verify.md`。
- 新告知的实际可达人群取决于生产库 `pw_policy_version` 分布与 `passwordUpgradeEnforce` 现值 ⇒ **未实测，待 Phase 7 向用户本人索取只读访问**。
