# T-19d —— App 账号安全屏（普通改密面 `#/security`）

任务号 T-19d。派发依据：A-69 #199。**本报告由 TPM 代记**：原轮次在 150 回合上限处中断
（最后一次写盘 = `test/security-screen.spec.tsx` 12:17:41，即 A-09 自扫口径修正那一次编辑，
之后无动作、无报告），产物已全部落盘但**未自带出口命令复跑与报告**。
下列三条出口命令、行数账、真库指纹**全部由 TPM 本人于 2026-09-21 12:15~12:22 亲跑**，
数字取自原始输出逐字粘贴（A-62 #171 / A-65 #175），非转述。

---

## ① 交付清单（3 文件改 / 2 文件新建，全部在 `apps/app`）

| 文件 | 性质 | `wc -l` 原始行 |
| --- | --- | --- |
| `apps/app/src/screens/SecurityScreen.tsx` | 🆕新建 | `171 apps/app/src/screens/SecurityScreen.tsx` |
| `apps/app/test/security-screen.spec.tsx` | 🆕新建 | `996 apps/app/test/security-screen.spec.tsx` |
| `apps/app/src/data/queries/auth.ts` | ✏️追加 | `189 apps/app/src/data/queries/auth.ts` |
| `apps/app/test/login-screen.spec.tsx` | ✏️peer 哨兵改判 | `666 apps/app/test/login-screen.spec.tsx` |

原始命令与输出：

```
$ wc -l apps/app/src/screens/SecurityScreen.tsx apps/app/test/security-screen.spec.tsx apps/app/src/data/queries/auth.ts apps/app/test/login-screen.spec.tsx
  171 apps/app/src/screens/SecurityScreen.tsx
  996 apps/app/test/security-screen.spec.tsx
  189 apps/app/src/data/queries/auth.ts
  666 apps/app/test/login-screen.spec.tsx
 2022 total
```

屏侧只加 5 件事（`:67-171`）：门禁判定只认 `auth-store` 派生位、复用 `@tm/ui/ChangePasswordForm`
**只传 props**、提交走全仓唯一一份 `changePasswordMutationOptions()`、成功链 = 常驻 6 秒后 `signOut()` 回
`/login`（R-40③）、失败面把 `errorCode`/`serverMessage` 原样接回共用件。
`ChangePasswordForm.tsx:144-149`（F-23 / A-64 #179 修复点）**未被触碰** —— 派发时的禁令守住。

数据层新增（`auth.ts:167-189`）：`changePasswordMutationOptions()` 一份，入参过
`ChangePasswordInputSchema`、响应过 `OkResultSchema`，端点 `PUT /api/password`
（server `routes/auth.ts:104`）。强制改密那一份（`:155 '/api/password/force'`）原样在场，两面互不吞并。

---

## ② peer 哨兵改判交底（`login-screen.spec.tsx:368-390`，A-61 #169 三件套逐件）

这一节是代码内互引（`login-screen.spec.tsx:377-378` 指名要求本节存在）的落点，逐句交底：

1. **反向改判**：原哨 `expect(queries).not.toMatch(/ChangePasswordInputSchema|'\/api\/password'/)`
   的前提出自 T-19b 文件头"改密面的 mutation 由需要它的那一轮再加"。**需要它的那一轮 = T-19d 已到**，
   旧命题失效，翻为正面钉：`changePasswordMutationOptions` 恰 1 份、`'\/api\/password'`（带闭合引号，
   不被 `/api/password/force` 顶掉）恰 1 处、`parseWith(ChangePasswordInputSchema)` 恰 1 次。
2. **拦截断言没有变少**：本用例的 `not.toMatch` 由 2 条变 3 条 —— 原 `fetch(|localStorage` 一条未动；
   被翻掉的那条替换成"假想第三面不得预写"（`ResetPassword|ForgotPassword|recover|'/api/password/(reset|forgot|recovery)'`）；
   正面计数由 7 条增到 11 条。**净效果是门槛提高，不是放松。**
3. **明示声明**：即本节。同轮在 `security-screen.spec.tsx` A-06（`:461-474`）与 I 组反向哨（`:942-996`）
   独立钉了一遍同样的计数，两处不互相背书。

---

## ③ 用例账（43 条 / 9 组，与 spec 文件头 A~I 分组说明一一对应）

| 组 | 内容 | 条数 |
| --- | --- | --- |
| A · 源码哨兵 | 复用共用件零自造表单、话术零自造、凭据写面不扩、屏内 0 状态码分支、Chrome84 红线、端点唯一份、禁词静态面、0 硬门禁借用、本 spec 自扫 | 9 |
| B · 渲染面 | 三格字段 + 两颗出口 + 串逐字等于 `AUTH_COPY.changePassword.*` + 0 原生 `required` | 5 |
| C · 出口一（客户端） | `oldPassword` 必填 / 新密码 < `PASSWORD_MIN` ⇒ 0 请求（同形于 `apps/web/e2e/profile.spec.ts:74-89`） | 4 |
| D · 成功链（R-40③） | 恰一次 `PUT /api/password` → 6 秒重登话术常驻 → 清凭据回 `/login`；新密码不落存储、响应混进 token 也不采纳 | 5 |
| E · 出口二（服务端） | 客户端长度已合规仍被 `WEAK_PASSWORD` 拒 ⇒ 恰 1 请求 + 字段级可见原因（同形于 `profile.spec.ts:130-142`） | 3 |
| F · 失败面 | §3.9.5 逐码落点（`OLD_PASSWORD_INCORRECT`/`PASSWORD_SAME_AS_OLD`/`TEMP_LOCKED`）+ 契约外给人话 + 401·403 只走 `rest-fetcher` 单点 | 6 |
| G · 门禁判定 | 游客 → `/login`；只握一次性凭据 → `/upgrade-password`；换出后不重复跳、空帧不自造文案 | 3 |
| H · 返回语义 | 二级页判 `go-back` 而**不是** `stay`；有历史退一层、无历史回父页 `/me`；不占有 T-20 冻结钩子 | 4 |
| I · 工厂直调 + 不外溢 | `changePasswordMutationOptions()` 直调 + 五厂计数 + 端点集合不外溢 | 4 |

合计 43 条。与全量数字对得上：基线 16 files / 355 tests → 现 17 files / 398 tests（**+1 文件、+43 条**）。

`stay` / `window.onAndroidBack` 在本屏与 `UpgradePasswordScreen` 的关系上被钉成**反向哨**
（A-08 `:489-505`），符合派发时"不许照抄 stay"的要求；`router.tsx:70` 注释另立了一条
"`/security` 不在硬门禁表里"的说明，`router.tsx` 本体**未被本修改动**（A-44 #86）。

---

## ④ 出口命令原始尾行（TPM 亲跑）

```
$ pnpm --filter @tm/app typecheck
$ tsc -p tsconfig.json --noEmit            # 无输出，exit 0

$ pnpm --filter @tm/app test
 Test Files  17 passed (17)
      Tests  398 passed (398)
   Start at  12:18:34
   Duration  18.14s

$ pnpm --filter @tm/app build
✓ built in 7.50s
[plugin tm-app:dist-guard] [dist-guard] 判据①②通过：13 个产物文件，无绝对路径资源、无 Chrome84 之后的 API
```

跑测口径：一律 `pnpm --filter @tm/app test`（仓根）；未用裸 `npx vitest run`（丢 jsdom 会造 104 条 localStorage 假红）。
中断前那一版（12:15:11 我跑的那次）曾报 1 条红：A-09 自扫把用例标题里的说明句也当成调用位命中
（`spec 命中 waitForTimeout`）。**根因**（TPM 脚本复量坐实，A-63 #175）：**naive 的"剥字符串字面量"对抗不了正则字面量** ——
`:371` 的 `expect(screenRaw).not.toMatch(/from '@tm\/ui\/[a-z]/)` 里有**一颗**撇号，
逐行统计"剥注释后 `'` 计数为奇数"的代码行，全文件唯一命中就是它；从这一行起引号配对整体错位，
其后所有字符串都不再被剥，于是残留在扫描结果里的恰是 A-09 自己的用例标题。
该轮原注释把它归给"中文标题里的引号"，**归因有误**（TPM 初判"扫描器自身的正则含引号"同样不完整，均已改口）。
**修法**（该轮自己 12:17:41 落的最后一版）：改扫**调用位**（`\b(?:test|it)\.(?:skip|fail|only)\s*\(`、
`describe\.(?:skip|only)\s*\(`、`waitForTimeout\s*\(`），并另钉
`vi.advanceTimersByTimeAsync` 恰 2 处、`vi.useFakeTimers()` 恰 1 处 —— 拦截面没有变窄：
被剥掉的"词面扫描"换成"调用位扫描"，跳过型注解一旦以调用形式出现必然带 `(`。此判断由 TPM 复核，
翻正后的 12:18:34 全量为绿。

---

## ⑤ 真库只读三指纹（报告时点复量）

```
$ stat -c '%s %y' data.db packages/server/data.db
253952 2026-09-18 04:05:38.198449400 +0800
0      2026-09-17 00:10:53.374159200 +0800
$ sha256sum data.db | cut -c1-12
6595517661cc          # packages/server/data.db = e3b0c44298fc
```

与既有基线三项全等 ⇒ 本轮（含中断前的 154 次工具调用）**未写真库、未改 mtime**。
12:19:36 时点 `find packages apps -newermt '2026-09-21 11:50'` 的命中集合里，`apps/app` 侧只有
上表四文件 + `packages/ui/src/primitives/dialog.tsx`（那是 T-16r5 名下）与 `apps/web/e2e/auth-wall.spec.ts`
（T-16r5b 名下）⇒ **T-19d 未越界到 `packages/ui`、`apps/web`、`packages/shared`、`router.tsx`/`main.tsx`**。

---

## ⑥ 遗留（交回 TPM 调度，不记在本轮名下）

1. **挂载未接线**：`router.tsx:57` 仍是 `SCREEN_PLACEHOLDER`，本屏在真机上还进不去。
   按 A-44 #86 / A-50 #130 归 **TPM 串行收口**（与 `/me`、`/me/about`、`/login`、`/upgrade-password` 五行一次做完）。
2. **止血阀 `off` 的软告知位**：本屏已把"人已进门但仍该改密"那条软告知的**落点页**做出来了（文件头 `:6-7`），
   但"在 `#/me` 里那一行告知 + 点进来"的入口属 T-19e 范围 ⇒ 未闭合，不是本轮缺陷。
3. **A-09 自扫口径**：调用位扫描不覆盖"以别的写法绕过"（如解构 `const {skip} = it`）。
   TPM 判断：本期以"报告级 `grep -c` 原始输出"为最终防线（A-62 #171），不追加更重的自扫；
   E4 出口轮复核。
4. 报告本应由该轮自写；本节即为代记，后续若该轮被重启续做，须自行覆写并保留 §② 的交底义务。
