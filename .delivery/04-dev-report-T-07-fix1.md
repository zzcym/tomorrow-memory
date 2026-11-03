# T-07 第五轮修复报告（装配收口 + 登出语义）— 已交付

> **结论一句话**：5 处里 2 处（P-1a / P-1b+P-1c）本轮新落在 `packages/server/src/app.ts` 装配点上，配 5 条真起服 + 真 HTTP 用例与 3 次疫苗撤回；另 3 处（A-32-2/3/4）第四轮已在盘，本轮逐项现场复核为真、未重做；全量 325 绿 / 1 红（唯一红 = A-28-1 已知 `trpc-shape` 基线，未再生），四道门禁与判据⑦ 隔离库起服全过；唯一没做到的是"413 响应体换成 shared 人话"，因为 `@tm/shared` 里**没有** 413 码且批次3 冻结了 shared —— 已按 A-28-4/A-30-7 通道登记为移交项 H-1，`app.ts:134-138` 留了可直接照抄的 TODO。
> 状态：**已交付**（本轮 00:34~00:52 实跑，含 00:51 补做 TODO 注释后的复跑，见 §6 末尾）。本文件在开工第一步建立，之后每完成一项即时追加取证。
> 任务来源：`.delivery/04-adjudications.md` **A-32-2 / A-32-3 / A-32-4** + `.delivery/04-dev-report-T-11.md` **§9 P-1a / P-1b / P-1c**。
> ⚠ **行号读法**：§0 与 §1~§3 里指向 `app.ts` 的行号是**接手时盘面**（第四轮之后、本轮改动之前），本轮对 `app.ts` 的插入使装配表整体后移；**现盘行号以 §4/§5 与 §9 为准**（§4 表已按 00:51 复跑后的盘面核对）。`legacy-apk.spec.ts` 的行号则已按现盘校正（+3 来自本轮 import 块新增的 3 个常量名）。

## 0. 已确认事实（开工前现场核对）

简报把 5 处都列给了第五轮，但**第 1/2/3 处第四轮已落盘并交在 `04-dev-report-T-07.md` §10**（该报告现 **822 行**，简报"509 行"是第三轮的盘面 —— 差异已进 §8 对账表）。本轮逐项**现场复核代码与用例是否真在盘上**，不重做、不重写。

| 项 | 现场核对（读文件 / grep，未跑测） | 判定 |
|---|---|---|
| 1 A-32-2 | `app.ts:201` = `app.route('/', createWordbookRouter(db, { flags, cache }))`，:197-200 是理由注释 | **已在盘，无需再改** |
| 2 A-32-3 | `routes/admin-flags.ts:58-59` = `guarded.use('/api/admin/flags', adminAuth)` + `'/api/admin/flags/*'`（不再是 `/api/admin/*`）；文件头 :9 与 :49-57 写明作用域理由 | **守卫已收窄** |
| 2 用例 | `test/contract/legacy-apk.spec.ts:799` describe「A-32-3 真起服 · 后台登录换 token 后读写 /api/admin/flags 全通」→ `:809` login → `:815` GET → `:827` POST 改值 → `:830` 读回；`:840` it 钉未登录 4 条 admin 路径全 401、普通用户 token 401、**错误口令**（`:888`）应答方必须是 `admin.ts` | **两条真起服用例都在**（简报点名的形状已满足） |
| 3 A-32-4 | `services/auth-service.ts:489-504` `logout()` 体内**只有** `findCredentialsById` + `safeAudit(accountLogout)` + `return {ok:true}`，无 `touchPasswordChanged`、无 `invalidateRevocationCache`；:476-488 是 PRD 依据注释块 | **已改为纯会话语义** |
| 3 用例 | `test/integration/auth-hardening.spec.ts:867-963` **D-13b 整组改写**（:888 describe「登出不吊销（会话语义 · A-32-4）」、:889 REST 断言凭据三列一字不动 + `account_logout` 恰 +1、:932 tRPC 同语义、:948 upgrade token 登出）；:870-886 注释写明改写理由与 PRD 依据；文件头 :18 同步 | **已改写，非删断言、非 skip** |
| 4 P-1a | `app.ts:101-108` 仍是 `maxSize: 200 * 1024`、`onError: (c) => c.json({ error: '请求体过大' }, 413)` | **未做 → 本轮** |
| 5 P-1b/c | `app.ts` 全文 grep `createAvatarRouter` = **0 命中**（连 import 都没有）；`app.ts:202` = `createProfileRouter(db)` | **未做 → 本轮** |

**给 P-1a 的两个现成常量（`packages/shared` 早已备好，无需改 shared）**：
`limits.ts:101 export const HTTP_BODY_LIMIT_BYTES = 512 * 1024;`、`:103 export const WORDBOOK_BODY_LIMIT_BYTES = 8 * 1024 * 1024;`（两者经 `shared/src/index.ts:27` 从 `@tm/shared` 出口）。
下游已按这两个常量写好假设：`services/avatar-service.ts:229-230`（"与 bodyLimit 对齐的临界问题 = C-18：`AVATAR_MAX_BYTES` 的 base64 形态恒 < `HTTP_BODY_LIMIT_BYTES`"）、`trpc/routers/profile.ts:88`（"请求体总大小由 `app.ts` 的全局 `bodyLimit`（`HTTP_BODY_LIMIT_BYTES`，**T-07 装配**）兜住"）⇒ 装配点漏这两行就是全库唯一没兑现该假设的地方。

**装配表证据（U-2 的现场）**：`routes/avatar.ts:12` 的注释把装配写法直接给了出来（`app.route('/', createAvatarRouter(db, flags))`），`:27` 签名 `createAvatarRouter(db: AppDB, flags?: FeatureFlags)`；`routes/profile.ts:29` 签名 `createProfileRouter(db: AppDB, flags?: FeatureFlags)`（第二个入参**是 flags 本身，不是 `{flags}` 包装** —— T-11 P-1 行写的是 `createProfileRouter(db, { flags })`，按实际签名落地为 `createProfileRouter(db, flags)`）。两处（`profile.ts:40`、`avatar.ts:38`）都是 `flags ? await flags.isOn('avatarUnifiedLimit') : true` ⇒ 不注入则 `avatarUnifiedLimit=off` 的回退分支在生产装配上永不执行。

## 1. A-32-2 `createWordbookRouter(db)` 注入 flags/cache

**第四轮已交付**（`04-dev-report-T-07.md` §10-1，含撤掉注入的疫苗实跑输出）。本轮现场复核见 §0 第 1 行：`app.ts` 的注入行在盘（现盘 `:251`，本轮在它前面插了 bodyLimit 那一块）、注释在盘、真起服用例在 `legacy-apk.spec.ts:903`。**未重复改动**。

## 2. A-32-3 admin 守卫挂载顺序收窄

**第四轮已交付**（`04-dev-report-T-07.md` §10-2，含"守卫写回通配 ⇒ 两条用例同时红"的疫苗实跑）。本轮复核见 §0 第 2 行：收窄在 `routes/admin-flags.ts:58-59`，简报点名的两条真起服用例都在盘（login→200→读写 flags 成功；未登录打 `/api/admin/flags`→401）。**未重复改动**。
简报对这一条的追加要求是"**必须**加一条真起服 + 真 HTTP 的用例 + 再钉一条不带 token→401" —— 两条逐字都在（`legacy-apk.spec.ts:800` 与 `:840`），且 `:840` 那条还钉了"错误口令的应答方必须是 `admin.ts`（拿到 `密码错误` 而不是 `未登录`）"，即挂载顺序本身被固化成断言。

## 3. A-32-4 登出语义：不再作废全量 token

**第四轮已交付**（`04-dev-report-T-07.md` §10-3，含 PRD 依据与 D-13b 改写理由）。本轮复核见 §0 第 3 行：`logout()` 体内已无 `touchPasswordChanged`/`invalidateRevocationCache`，`account_audit_log` 照记 `account_logout`；**D-13b 是整组改写而非删断言**（`auth-hardening.spec.ts:888-963` 共 3 条，全部实跑绿，见 §6 第 2 条的 `✓ D-13b` 两行原始输出）。

改写理由与 PRD 依据（第四轮已写入报告 §10-3 与用例注释 `:870-886`，本轮复核其成立）：R-40③ 的失效要求只挂在"**改密**"上，R-40 通篇是安全语义；登出是会话语义（R-39⑧ 把登出的动作面写在客户端 `AndroidBridge.saveToken('')`；§4.7 ④ 把 `auth.logout` 进白名单只是给不可关闭的改密页留一条退出出口）。原实现比 PRD 更严，且与判据⑤"上线零掉线"共用 `password_changed_at` 一根字段，把"凭据变更"与"某一次退出"混在一列。

## 4. P-1a bodyLimit 200KB → 512KB + 词本单独 8MB + 413 响应体

**本轮实现**（`packages/server/src/app.ts`，1 个文件；`routes/wordbook.ts` 在禁触面上，故分桶写在装配点）：

| 落点 | 改动 |
|---|---|
| `app.ts:46-55`（import） | 新增 `HTTP_BODY_LIMIT_BYTES` / `WORDBOOK_BODY_LIMIT_BYTES` / `TM_ERROR_CODES` / `tmErrorBody`，全部来自 `@tm/shared` |
| `app.ts:111-158` | `bodyLimit({ maxSize: 200 * 1024 })` → **两档**：全局 `HTTP_BODY_LIMIT_BYTES`(512KB，`:123`) + `PUT /api/wordbook` 单独 `WORDBOOK_BODY_LIMIT_BYTES`(8MB，`:142`)，由一条 `app.use('*')`（`:152-157`）按 `method+path` 分派 |
| `app.ts:139` / `:147-151` | 全局档保持现状 `{error:'请求体过大'}` 单键（见 §4-1 第 2 点，`:134-138` 是给 T-03 的 TODO 注释）；8MB 那一档的超限改为 `tmErrorBody(TM_ERROR_CODES.WORDBOOK_TOO_LARGE)` |

**魔法数字为什么消掉了才算修**：`services/avatar-service.ts:229-230` 与 `trpc/routers/profile.ts:88` 早就按"`app.ts` 用 `HTTP_BODY_LIMIT_BYTES` 兜住"写了注释假设，装配点曾是全库唯一没兑现的一方。§4.5 原话两半（512KB 全局 + 词本 PUT 8MB）**这次一起做了** —— T-11 的 P-6 正是提醒"别在抬全局值时把那一步省掉"，而 200KB→8MB 这一段词本覆写从"被 413 挡死"变成"能处理"，本身就是 RK-07 的缓解项。

### 4-1 「413 的响应体改成 shared 的人话」—— 一半能做到，另一半**被 shared 冻结挡住**（登记待裁决）

简报的问句"现在是不是 `{error:'请求体过大'}` 这种机器话"——**是**，且全库 grep 确认没有任何测试或前端引用过这个串（`grep -rn "请求体过大|413|bodyLimit" packages/{server/test,web/src,ui/src} mobile-memory/src` = **0 命中**），所以改它是安全的。分两条处理：

1. **词本那一档：已改成 shared 的人话。** 用 §4.6 冻结表里现成的那一行（`tmErrorBody()` = 服务端唯一出口），于是"整本覆写 >8MB"与"`wordbook-service.ts:603-609` 自己判出的超限"**同一条人话、同一个码、同一个 http(400)**，不存在第二份真相。
2. **全局那一档：`@tm/shared` 里根本没有对应码，本轮不新增字面文案。** 取证：`grep -rn "413\|REQUEST_TOO_LARGE\|PAYLOAD_TOO_LARGE\|BODY_TOO_LARGE" packages/shared/src/` = **0 命中**；`TM_ERRORS` 的 18 码里只有 `WORDBOOK_TOO_LARGE`/`AVATAR_TOO_LARGE` 两个"太大"码，且各自的 copy 都绑死在域内语义（把 `图片太大，请换一张 300KB 以内的` 用在"查词/改资料/登出"的超限请求上是**新缺陷**）。
   - 硬约束写死"**禁触 `packages/shared/**`**"，A-28-4 / A-30-7 又规定"批次3 期间需要新码 → 先 import 现成的，确实缺就写进报告'待裁决'，不许自建也不许自己改 shared"。⇒ 这一档**保持现状 `{error:'请求体过大'}` 单键**（我没有为它写任何新串），缺码已登记为 §9 移交项，走 T-03 的 supplement 纯追加通道（与 T-11 P-4 那两个无码人话同一批）。
   - **关键是这条已经不是用户会撞的路径**：头像 >300KB → 判定层的 `AVATAR_TOO_LARGE`（shared 人话，见用例②）；词本 >8MB → `WORDBOOK_TOO_LARGE`（shared 人话，见用例④）；200KB~8MB 的词本覆写 → 直接 200。剩下真正命中全局档的只有异常大 payload，那是防超大 JSON 存储滥用的闸，不属 §4.6 末段禁的 500/"请求失败"两类。

### 4-2 新增用例（5 条，真起服 + 真 HTTP；`test/contract/legacy-apk.spec.ts:982` 起的 `P-1` describe（文件 964 → 1166 行））

| # | 用例 | 钉的是什么 |
|---|---|---|
| ① | 解码后**正好 300KB** 的合法 JPEG，`PUT /api/profile` 与 `POST /api/avatar` 都 200 | 简报点名的那条"300KB JPEG 的合法请求不被 bodyLimit 抢先拒"。内含自证并**钉死实测值**：`Buffer.byteLength(body)` 断言 `> 200KB`、`< 512KB` 且 `=== 409_636 B` ⇒ 同一条请求在旧的 204_800 B 全局档下必然 413 |
| ② | 301KB → 两个入口都拿 `AVATAR_TOO_LARGE` + shared 那条人话 + http 400，且 `raw` **不含** `请求体过大` | **应答方必须是判定层而不是中间件**（这正是 T-11 §10-2 给 QA 的那 30 秒复现法的固化） |
| ③ | `PUT /api/wordbook` 覆写 12000 条（请求体 **864,010 B = 0.82 MB**，用例内 `toBe(864_010)` 钉死）→ 200 `{ok:true}`，`GET` 读回 12000 条 | §4.5 的另一半（词本 8MB）真落地，且确实落库；该字节数 `> HTTP_BODY_LIMIT_BYTES` 且 `< WORDBOOK_BODY_LIMIT_BYTES`，三条断言一起成立 |
| ④ | `PUT /api/wordbook` 大过 8MB → 400 `WORDBOOK_TOO_LARGE` shared 人话；`PUT /api/profile` 塞 600KB → **仍 413** | 8MB 档的人话 + 全局 512KB 档**没有被顺手抬掉**（两档各自成立，不是一刀切放开） |
| ⑤ | `avatarUnifiedLimit=off` 经真后台端点改值后，同一份 **250,036 B（`jpegDataUrlOf(187_500)`）** 请求体的 `PUT /api/profile` 从 200 翻成 400（**零等待**），再改回 `on` 又 200 | P-1c 的注入证明题：不注入 flags 时 `off` 分支**永远执行不到**（见疫苗 C） |

### 4-3 疫苗（三处逐个撤回，本轮 00:36~00:38 实跑，原始输出）

**A. 全局档改回 `200 * 1024`**（`sed 's/maxSize: HTTP_BODY_LIMIT_BYTES/maxSize: 200 * 1024/'`）⇒ 3 红：

```
   × P-1a 判据③ 的临界段：解码后正好 300KB 的合法 JPEG…都拿到 2xx  208ms
     → PUT /api/profile：{"error":"请求体过大"}: expected 413 to be 200 // Object.is equality
   × P-1a 应答方必须是判定层而不是 bodyLimit：301KB 两个入口都拿 §4.6 那条 shared 人话…  161ms
     → PUT /api/profile：{"error":"请求体过大"}: expected 413 to be 400 // Object.is equality
   × P-1c `avatarUnifiedLimit=off` 经真后台端点改值后…  109ms
     → 默认（开关 on）应走统一上限：{"error":"请求体过大"}: expected 413 to be 200 // Object.is equality
      Tests  3 failed | 2 passed | 28 skipped (33)
```

**这一轮的红法本身就是判据**：简报说的"R-04① 的 150~300KB 段被 413 挡在判定之前"，症状原文就是 `expected 413 to be 400` —— 用户拿不到 `AVATAR_TOO_LARGE` 那条人话，因为请求根本没进判定层。两条词本用例仍绿（它们走 8MB 那一档，与全局值无关）⇒ 反证两档是**分开的**，不是把全局值调大就顺手覆盖了词本。

**B. 撤掉头像挂载**（`createAvatarRouter(db, flags)` 那一行注释掉）⇒ 红在 404：

```
AssertionError: POST /api/avatar：404 Not Found: expected 404 to be 200 // Object.is equality
      Tests  1 failed | 32 skipped (33)
```

`404 Not Found` 就是 U-2"从未挂载"的机读签名（`/api/avatar` 不是被守卫挡、也不是被判定层拒，是**路由表上不存在**）。

**C. 撤掉资料门面的 flags 注入**（`createProfileRouter(db, flags)` → `createProfileRouter(db)`）⇒ 红：

```
     → off 态应回退到旧的 200_000 字符上限：{"ok":true}: expected 200 to be 400 // Object.is equality
      Tests  1 failed | 32 skipped (33)
```

后台真把那行开关改成 `off` 了（改值请求本身 200），资料门面却**照收不误** ⇒ §6.4-5-6 的"一键回退"按 T-11 的原话确实"是纸面能力"。三次撤回后 `src/app.ts` 均由本轮先前拍的备份原样还原（`grep -c` 逐项确认 1），备份文件已删。

## 5. P-1b/P-1c `createAvatarRouter` 挂载 + `createProfileRouter` 注入 flags

**本轮实现**（`app.ts:247-261`，2 行代码 + import + 理由注释；挂载行现为 `:260`/`:261`）：

```ts
-  app.route('/', createProfileRouter(db));
+  app.route('/', createProfileRouter(db, flags));
+  app.route('/', createAvatarRouter(db, flags));   // + import
```

- 与 T-11 P-1 行给的写法有一处**按实际签名纠正**：`routes/profile.ts:29` 的第二入参是 `flags?: FeatureFlags` **本身**，不是 P-1 行写的 `{ flags }` 包装（词本那一处才是 `deps` 对象）。按 `{ flags }` 写会当场 typecheck 红，故落地为 `createProfileRouter(db, flags)`。
- `routes/{profile,avatar}.ts` **一字未动**（两个文件都在简报的禁触面里），改的只有装配表。
- 取证与疫苗见 §4-2 用例①②⑤ 与 §4-3 疫苗 B/C。
- `depcruise` 无新边被禁：`app.ts → routes/avatar.ts` 与既有的 `app.ts → routes/profile.ts` 同层（§6 第 4 条绿）。

## 6. 冒烟取证

本轮 00:34~00:58 实跑（末次复跑见 ⑨），逐字粘贴。单跑一律用简报点名的正确调用法（`--` 透传不过滤那个坑本轮也复现了，见 §8 对账表第 5 行）。

**① `pnpm --filter @tm/server typecheck` —— 0 错**

```
$ tsc -p tsconfig.json --noEmit
```

（`tsc` 无输出即 0 错；改动后跑两次，均为 0。）

**② `pnpm --filter @tm/server test` —— 325 passed / 1 failed（14 文件）**

```
   ✓ 判据⑤ / D-13b 登出不吊销（会话语义 · A-32-4） · sqlite > REST 登出后同一枚 token 读写照旧、凭据三列一字不动，`account_audit_log` 恰 +1 条 `account_logout`  1276ms
   ✓ 判据⑤ / D-13b 登出不吊销（会话语义 · A-32-4） · sqlite > tRPC `auth.logout` 与 REST 同一语义（两门面都不吊销、都留痕）  1269ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo

 Test Files  1 failed | 13 passed (14)
      Tests  1 failed | 325 passed (326)
```

唯一红 = `trpc-shape` 基线（A-28-1 批次3 已知红）。**未跑 `TRPC_SHAPE_UPDATE=1`、未改基线文件**。
本轮 5 条新用例与 A-32-3/A-32-2/D-13b 各条都在绿的那 325 里。

**③ 新用例单跑（`-t "P-1"`，5/5 绿）** —— 本条输出为 **00:50:46 的末次复跑**（补 `app.ts:134-138` TODO 注释与两条字节钉死之后），原始输出：

```
 RUN  v3.2.7 E:/CC/tomorrow-memory/packages/server

 ✓ test/contract/legacy-apk.spec.ts (33 tests | 28 skipped) 849ms

 Test Files  1 passed (1)
      Tests  5 passed | 28 skipped (33)
```

用例名（现盘）：`P-1 真起服 · 装配收口：512KB/8MB 两档上限、POST /api/avatar 可达、avatarUnifiedLimit=off 真回退` > `P-1a 词本那一半（P-6 提醒的那步）：整本覆写 864,010 B（0.82MB）请求体从"被 413 挡死"变成 200 {ok:true}`。
（首轮 00:37 实跑时该用例标题写的是口算量级"≈0.9MB"，同一条 384ms 绿；两处实测字节数现已由断言钉死，见 §4-2 ①③。）

**④ `pnpm depcruise` —— 绿**

```
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (363 modules, 1025 dependencies cruised)
```

（新增的 `app.ts → routes/avatar.ts` 边与既有 `app.ts → routes/profile.ts` 同层，无越界。）

**⑤ `node tools/boundaries.mjs --flags --password` —— 3/4，唯一红是 A-32-5 的在册欠账**

```
OK   deadline-key-zero          0 命中
RED  enforce-flag-single-read   引用点 13 个 > 1（越权接线，§4.7 明示"代码内不得读该 flag"）：packages/server/src/routes/admin-flags.ts:11 | packages/server/src/scripts/ddl-parity-runner.ts:216 | packages/server/src/services/auth-service.ts:187 | packages/server/src/services/password-policy.ts:11 | packages/server/test/integration/auth-hardening.spec.ts:5 | packages/server/test/integration/auth-hardening.spec.ts:23 …(+7)
OK   password-write-points      角色 {activation,password-change} = 2 个；命中 6 处；例外豁免 0 处 —— 待 T-06/T-07 落库方法（越界写入已实时生效）
OK   flag-defaults-match-prd    8 个开关初值与 PRD §6.4-7 全等

3/4 条通过，1 条红
```

**13 个命中数与简报给的上轮值逐字相同 ⇒ 本轮零增长**（简报明令"不许为它改注释或测试凑绿"，本轮未碰）：我给 `app.ts` 加的是 `flags` **实例**的传递（`createProfileRouter(db, flags)`），不是任何开关**键名**的读取点，`enforce-flag-single-read` 数的是按名读点，故不受影响 —— 该条归出口轮 T-02（A-32-5 的 (b) 案口径：只数非注释运行读点、豁免 `test/**` 与 `src/scripts/**`）。

**⑥ `node tools/boundaries.mjs --copy` —— 绿**

```
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 76 处）；需人工复核词命中 126 处（不判红，UI §8.2-9 明示由走查确认）

1/1 条通过，全绿
```

**⑦ `node tools/boundaries.mjs --check-ownership --task T-07 --files …` —— 无越界**

```
--check-ownership task=T-07 触碰 2 个文件 → 无越界
```

（本轮只碰 `packages/server/src/app.ts` 与 `packages/server/test/contract/legacy-apk.spec.ts`，都在允许面内。）

**⑧ 未跑的门禁（如实登记，没跑就说没跑）**：`--self-test`（A-28-2 的 2 探针已知红，简报未要求）、`--check-ownership` 的全库口径（A-28-3 对 `tools/exceptions.json` 误判）、`--colors`（A-27/A-30-9 假阳）。

**⑨ 末次复跑（00:51~00:58）** —— 补做 `app.ts:134-138` 的 TODO 注释与两条字节钉死后，八件冒烟全部重跑，结论与上面逐条一致：typecheck `tsc` 无输出（0 错）、`pnpm --filter @tm/server test` = **325 passed / 1 failed（326 例 / 14 文件）**（唯一红仍是 A-28-1 `trpc-shape`，仍未再生基线）、`-t "P-1"` 5/5 绿、`pnpm depcruise` ✔ `363 modules, 1025 dependencies`、`--flags --password` 3/4（唯一红 `enforce-flag-single-read` **仍是 13>1**，命中清单逐条同前，未碰）、`--copy` 全绿（例外豁免仍 **76 处**、复核词 **126 处** ⇒ 我新加的 5 行中文注释没进扫描面）、`--check-ownership --task T-07 --files packages/server/src/app.ts,packages/server/test/contract/legacy-apk.spec.ts` → **无越界**、判据⑦ 按 §7 重做并通过。

## 7. 判据⑦ 新口径（A-32-1）：临时副本库 migrate + 起服 curl /api/version

**照 T-09 §4 的隔离做法**：`cp` 出副本 + `SQLITE_PATH` 指过去，**全程没在仓库根 `data.db` / `packages/server/data.db` 上做任何写或迁移**（前后指纹见下）。

⚠ **本节 00:55~00:58 重跑过一次，重跑才是正文**：首轮（00:39~00:41）我把临时库放在 `/tmp/t07r5/` 下，但 **Git Bash 的 `/tmp` = `C:\Users\曹怡明\AppData\Local\Temp`，而 node 里的 `/tmp/...` 按"当前盘根"解析 = `E:\tmp\...`** —— 两边不是同一个文件，首轮"迁移 + 起服"到底跑在真副本上还是跑在 node 顺手新建的空库上，从日志里分辨不出来（`本次应用 7 个迁移` 两种情况都成立）。判据⑦ 的价值恰恰是"**迁过迁移的库能起服**"，路径不可信就等于证据不可信，所以按 Windows 绝对路径 `E:/tmp/t07r5c/` 重做一遍，并用 `users` 行数把"确实是我的副本"这一点钉死。**给所有在 Windows 上跑的 agent：临时库路径一律写 `E:/...` 或先 `cygpath -w`，别用 `/tmp`。**（首轮结论方向没错，只是不可复核；本轮重跑后结论更硬。）

**第 0 步：动手前的仓库库指纹**

```
data.db                253952  2026-09-18 04:05:38.198449400 +0800
data.db-wal            424392  2026-09-18 04:09:16.857435000 +0800
data.db-shm             32768  2026-09-17 00:53:01.561551800 +0800
packages/server/data.db      0  2026-09-17 00:10:53.374159200 +0800
```

**第 1 步：`cp` 副本（含 `-wal`/`-shm`，保证复制点一致性）+ 动手前先读一遍副本内容**

```
E:/tmp/t07r5c/smoke.db      253952
E:/tmp/t07r5c/smoke.db-shm   32768
E:/tmp/t07r5c/smoke.db-wal  424392

（只读探测，`{readonly:true}`）
tables（迁移前）: analyst_cache,assessment_cache,chat_messages,checkin_logs,fsrs_cards,profiles,sqlite_sequence,tutor_cache,users,wordbooks
migrations table: no such table: migrations      ← 副本是**未迁移的存量库**，正是判据⑦ 要治的那种
users rows: 23                                  ← 有真数据，用于第 2 步反证"迁的就是这份副本"
```

**第 2 步：只迁副本** `DB_DRIVER=sqlite SQLITE_PATH=E:/tmp/t07r5c/smoke.db pnpm db:migrate`

```
> 004-wordbook-sync-columns wordbooks 追加增量协议列 sync_version / tombstones（data 列一字未动）
    · ALTER TABLE wordbooks ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0
    · ALTER TABLE wordbooks ADD COLUMN tombstones TEXT NOT NULL DEFAULT '[]'
> 005-feature-flags 新建 feature_flags 并种入 PRD §6.4-7 初值（8 个开关）
    · CREATE TABLE IF NOT EXISTS feature_flags ( key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL )
    · INSERT INTO feature_flags (key, value, updated_at) VALUES ('wordbookIncremental', '0%', 1789836982959) ON CONFLICT (key) DO NOTHING
    · INSERT INTO feature_flags (key, value, updated_at) VALUES ('explicitFavorite', 'on', 1789836982959) ON CONFLICT (key) DO NOTHING
    …（`autoFavoriteDefault` / `studyModes` / `dailyReminder='on(20:30)'` / `passwordRegister` / `avatarUnifiedLimit` / `passwordUpgradeEnforce` 共 8 条）
> 006-entry-updated-at-doc wordbooks.data 条目可选键 updatedAt：文档 + dry-parse 注册（无 DDL）
[Apply] 本次应用 7 个迁移：000-migrations-table, 001-credentials-columns, 002-review-snapshots, 003-account-audit-log, 004-wordbook-sync-columns, 005-feature-flags, 006-entry-updated-at-doc
[SchemaDiff] 0 处差异（真库反读 == packages/shared/src/schema/tables.ts）
=== 迁移完成 ===
```

**第 2b 步：反证"迁的确实是第 1 步那份副本"（这一条就是首轮做不到的那一步）**

```
users rows after migrate: 23            ← 空库新建会是 0；23 = 副本带来的真账号数据 ⇒ 路径两边一致了
tables now: _migrations,account_audit_log,analyst_cache,assessment_cache,chat_messages,checkin_logs,
            feature_flags,fsrs_cards,profiles,review_snapshots,sqlite_sequence,tutor_cache,users,wordbooks
_migrations(name|applied_at): 000-migrations-table … 006-entry-updated-at-doc（7 行，与 [Apply] 逐字同序）
feature_flags rows: 8
users cols: id,phone,created_at,password,password_changed_at,pw_policy_version
has password_changed_at: true           ← 001 生效；这正是 §8 第 2 行 `boot-check` 瞬时红的根因（库没迁）
```

顺带一条对 T-06 有用的旁证：**`no such column: password_changed_at` 不是代码缺陷，是"在未迁移的存量库上跑"** ⇒ 判据⑦ 的"起服前先 migrate"就是它的解法。

**第 3 步：真起服**（`DB_DRIVER=sqlite SQLITE_PATH=E:/tmp/t07r5c/smoke.db PORT=3062 node_modules/.bin/tsx packages/server/src/index.ts`）

```
[DB] SQLite initialized (driver=sqlite)
[WS] WebSocket 已启用（/ws）
Server running at http://localhost:3062
```

**第 4 步：真 HTTP（curl 打真进程，不是测试内的 app 实例）**

```
=== 0) 判据⑦ 本体 ===
GET /api/version -> HTTP 200
{"name":"tomorrow-memory","version":"2.0.0","latest":"2.0.0","url":""}

=== 1) A-32-3 的语义在真装配下仍成立 ===
GET /api/admin/flags（无 token）      -> HTTP 401  {"error":"未登录"}

=== 2) U-2 的挂载签名核对：401（已挂载、由 auth 拒）而不是 404（路由表上没有）===
POST /api/avatar（无 token，小 body）  -> HTTP 401  {"error":"未登录"}

=== 3) 全局档 512KB 仍在（请求体 600_036 B）===
PUT /api/profile（无 token）          -> HTTP 413  {"error":"请求体过大"}

=== 4) 旧装配会误杀的那一段：190_036 B 在旧 200KB 档下必吃 413，现在放行到下一层 ===
PUT /api/profile（无 token）          -> HTTP 401  {"error":"未登录"}   （expect NOT 413）

=== 5) 简报点名的那条：合法 300KB JPEG 的请求体，在真生产装配上不被 bodyLimit 抢先拒 ===
PUT /api/profile，body = 409_636 B（base64(307_200 B) + `data:image/jpeg;base64,` + `{"avatar":"…"}`）
                                      -> HTTP 401  {"error":"未登录"}   （expect NOT 413）
同形状 301KB（409_640 B）             -> HTTP 401  {"error":"未登录"}

=== 6) 8MB 那一档的人话（bodyLimit 先于 auth，所以无 token 也看得到响应体）===
PUT /api/wordbook，body = 9_000_011 B -> HTTP 400  {"error":"单词数量超出上限","code":"WORDBOOK_TOO_LARGE"}
```

第 4/5 两条与第 3 条一起，就是 P-1a 在**真生产装配**上的双向证据：闸门按新位置生效（600KB 仍 413），R-04① 的 150~300KB 段不再被抢先拒（409,636 B 一路走到 auth 层），且 8MB 档出去的是 §4.6 冻结表里那条 shared 人话而不是机器话。

**第 5 步：停进程 + 删临时库 + 复核仓库库未被动过**

```
netstat -ano | grep 3062  ->  LISTENING 42724（TaskStop 只收掉了 bash 管线，node 子进程仍在听）
taskkill //PID 42724 //F  ->  成功: 已终止 PID 为 42724 的进程
curl /api/version         ->  HTTP 000 / connection refused        （端口已关）

temp dir removed: ls: cannot access '/e/tmp/t07r5c': No such file or directory

=== AFTER: repo DB fingerprints ===
data.db                253952  2026-09-18 04:05:38.198449400 +0800
data.db-wal            424392  2026-09-18 04:09:16.857435000 +0800
data.db-shm             32768  2026-09-17 00:53:01.561551800 +0800
packages/server/data.db      0  2026-09-17 00:10:53.374159200 +0800
```

大小与 mtime **逐字节同第 0 步** ⇒ 仓库内两个库（含 `-wal`/`-shm`）本轮只读未写。
（附两条 Windows 现场：① 服务进程还活着时 `rm` 临时库会 `Device or resource busy`，必须先真杀进程再删；② 这次连"停后台任务"都不够 —— IDE 的 TaskStop 终止的是 bash 管线，**node 子进程会留下来继续占端口**，得 `netstat -ano | grep <port>` 找到 PID 再 `taskkill //PID <n> //F`。简报"跑完停进程"这步在 Windows 上不是可选项，且比想象的长一层。）

**判据⑦ 新口径（A-32-1(a) 的"部署/起服前先 `pnpm db:migrate`"）达成**：迁移后的**真副本**起服 → `/api/version` 200，且第 2b 步把"跑在哪份库上"钉成了可复核事实。A-32-1(b) 的启动自检本体归 T-06 第六轮，本轮实跑见证它的用例文件已在盘且单跑 12/12 绿（§8 第 2 行）。

## 8. 对账表（A-32-9）：简报数字 vs 实测

并行期唯一能防"把撞车当缺陷"的机制，逐条归因。

| # | 简报给的值 | 本轮实测 | 归因 |
|---|---|---|---|
| 1 | `test` = **286 passed / 1 红**（12 文件） | **325 passed / 1 红（326 例 / 14 文件）** | 差 40 例、差 2 文件，全部可指认：① 简报的 286 是 **A-32 盘面快照**（= 第四轮开工前），第四轮落地后 `legacy-apk` 从 25 例长到 28 例（A-32-2/A-32-3 的真起服用例）、`auth-hardening` 的 D-13b 由 1 例改写成 3 例；② **T-06 第六轮在并行加文件**：`test/db/boot-check.spec.ts`（12 例，A-32-1(b) 启动自检）与 `test/db/wordbook-rmw.spec.ts`（A-32-6 的事务内 RMW）都是新文件 ⇒ 12 文件变 14；③ 本轮我自己 +5 例（`P-1` describe）。**不是我把别人的红修成了绿**：我接手时的第一手实测是 319/2（见 #2），离开时 325/1，逐条对得上 |
| 2 | 简报未提 `test/db/boot-check.spec.ts` | 我**接手时**全量跑 = 319/2，第二条红正是 `boot-check.spec.ts:132` 的 `no such column: password_changed_at`；该文件**单跑 12/12 全绿**；我改完后再全量跑 = 325/1，它不红了 | **典型并行撞车**（A-32-9 要防的那种）。该文件属 T-06 名下、`src/db/**` 当时正在被改（`git status` 显示 `sqlite.ts/pg.ts/index.ts/types.ts` 均为 M、`test/db/` 为 ??）。我按红线**一个字节没碰 `db/**`**，只在单跑复验后判定为"别人在途的瞬时红"，未当成缺陷、未试图绕过 |
| 3 | 简报："`chat-isolation.spec.ts:416` 那条 skip（T-11 名下正在修）"，且盘面 `1 skipped` | **0 skipped**（326 例里无 skip） | T-11 的 U-4 已在并行期解掉（简报本身就写着"正在修"）。非本轮改动，本轮也未新增任何 skip |
| 4 | 报告 `04-dev-report-T-07.md` = **509 行** | **822 行** | 509 是第三轮交付长度；第四轮追加了 §10（A-32-2/3/4 三处交付 + 判据⑦ 重跑 + 冒烟），共 +313 行。⇒ 简报把 1/2/3 三处当"待办"发给了我，实际**已在盘**（见 §0 的逐行复核），本轮按 A-31-1"只补不完工"未重写 |
| 5 | 简报点名的 quirk：`test -- 名字` 的 `--` 原样透传、不过滤 | 复现规避成功：单跑一律走 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server <pattern> [-t …]` | 本轮 5 条疫苗/复跑全部用该形式（`-t "P-1"`、`-t "P-1c"`、`boot-check`） |
| 6 | `enforce-flag-single-read` **13 > 1** | **13 > 1**，命中清单逐条同前 | 零增长，且本轮未碰（简报禁止凑绿）。我给 `app.ts` 加的是 flags **实例**传递，不是按名读点 |
| 7 | 简报行号：`app.ts:196 createWordbookRouter(db)`、`routes/admin-flags.ts:51 use('/api/admin/*')`、`services/auth-service.ts:482` 推进 `password_changed_at`、`app.ts:200 admin.ts 后挂` | 现盘：`app.ts:201` 已注入、`admin-flags.ts:58-59` 已收窄、`auth-service.ts:489-504` 已不推进 | 简报的三处行号指向**第四轮之前**的盘面（与 #1/#4 同源）。`admin.ts` 的后挂位置（`app.ts:258`）确实未动 —— 第四轮选的修法是"收窄守卫"而不是"调顺序"，理由在其报告 §10-2 |
| 8 | 简报：全局 `bodyLimit` 现值 **204,800 B（200KB）** | 改前 `maxSize: 200 * 1024` = **204,800** ✓ 逐字一致 | 已替换为 `HTTP_BODY_LIMIT_BYTES` = 524,288 |
| 9 | 简报：合法 300KB 头像的 base64 请求体 **≈410KB** | 用例实测：`{avatar: <307_200 B 的 dataUrl>}` 的 JSON = **409_656 B**（断言 `>200KB && <512KB` 通过） | 与 T-11 §6-U-1 的算术（410_112 字符线）一致，量级吻合；差 104 B 是 `{"avatar":"…"}` 包裹与 `AVATAR_MAX_DATA_URL_CHARS` 的 +512 余量口径不同，不影响结论 |
| 10 | `--copy` 的"例外豁免"计数：本轮改动前 **75 处** → 改动后 **76 处** | 两次都**全绿**，`0 命中`、`需人工复核词 126 处` 两次相同 | **不是我加的**：`grep -n "app\.ts" tools/exceptions.json` = **0 命中**（28 条例外里没有一条指向 `app.ts`，故我对 app.ts 的改动不可能增加豁免计数）；且 `请求体过大` / `REQUEST_TOO_LARGE` 在 `tools/boundaries.mjs` 与 `tools/exceptions.json` 中均 0 命中，说明该串根本不在扫描面上。+1 来自 00:34~00:41 窗口内**其他人对某个被扫 src 文件的并发改动**。登记不修（禁触面外），Phase 5 若复核到此差异请按本行归因 |

## 9. 移交清单

| # | 议题 | 交给谁 | 说明 |
|---|---|---|---|
| H-1 | **`REQUEST_TOO_LARGE`（413）在 `@tm/shared` 里不存在** —— 全局 `bodyLimit` 那一档的响应体因此仍是 `{error:'请求体过大'}` 单键，无法"改成 shared 的人话" | **T-03**（出口轮 supplement 纯追加，同 A-28-4 / A-30-7 / T-11 P-4 那一批） | 追加建议形状：`TM_ERRORS_SUPPLEMENT.REQUEST_TOO_LARGE = { http: 413, copy: <人话>, from: '§4.5 / RK-07' }`。**我已把 `app.ts:133` 那一处留了明确的 TODO 注释**，shared 落地后把该行换成 `tmErrorBody(...)` 即可，装配点不需要再理解一遍语义。⚠ 不要为此改 `TM_ERRORS`/`TM_ERROR_ROWS`（§4.6 冻结面，A-8） |
| H-2 | `POST /api/avatar` 现在**真挂载了**（`app.ts:255`）：T-11 的 §6-U-2 结案，出口轮请把 `profile-dto.spec.ts` 里那三条"测试装配"用例与我的真装配用例并列核对 | **T-11 / 出口轮 E2** | 我的用例①② 已覆盖 `PUT /api/profile` 与 `POST /api/avatar` 两个入口的同人话同码同 http |
| H-3 | T-11 §6-U-1（判据③ 生产装配未达成）**结案**：`bodyLimit` 已 512KB，150~300KB 段不再被抢先拒；§10-2 给 QA 的"30 秒真 HTTP 复现法"预期值已从 `413` 变成 `200`，且我已把它固化成用例 | **T-11 / Phase 5** | 复现法可按原命令重跑，结论应为"U-1 已关闭"，别再按"头像失败"另立缺陷 |
| H-4 | `avatarUnifiedLimit=off` 的**跨进程 30 秒 TTL 计时**取证仍缺（我只证了"改值后本进程零等待翻面"，因为注入的就是那一份 flags） | **T-21**（发布 runbook 步 8 的预演）/ 出口轮 | T-11 §10-4 提的这条与我同源不同面：单进程侧我已钉死，双进程侧要在真部署形态下量 |
| H-5 | 简报第 1/2/3 项（A-32-2/3/4）**在第四轮已交付**，本轮为复核确认。若排班表仍把这三条挂在"T-07 第四轮"未结案，可以结案 | **TPM** | 盘面差异已按 A-32-9 记进 §8 第 1/4/7 行 |
| H-6 | `enforce-flag-single-read` 13>1、`--self-test` 2 探针、`--check-ownership` 对 `tools/exceptions.json` 的误判、`trpc-shape` 基线再生 | **T-02 / 出口轮 E1-E2**（A-32-5 / A-28-1 / A-28-2 / A-28-3） | 本轮一律未碰、未凑绿 |
| H-7 | 并行观察：`test/db/boot-check.spec.ts` 在全量并发跑时会因 T-06 正在改 `src/db/**` 出现瞬时红（单跑 12/12 绿） | **T-06**（第六轮，他自己名下） | 本轮未改 `db/**` 任何文件，仅登记现象供其对账 |

## 10. 本轮红线自查

| 红线 | 自查结果 |
|---|---|
| 任何 git 写操作（commit/push/stash/checkout/reset/clean/restore） | **零**。只跑过 `git status --porcelain -- <paths>`（只读，用于 §8 第 2 行判定 `db/**` 的归属）；工作区他人未提交改动未清理、未还原、未代修 |
| 仓库根 `data.db` / `packages/server/data.db` | **只读未写**：判据⑦ 的迁移与起服全程 `SQLITE_PATH=/tmp/t07r5/smoke.db`，前后指纹（size+mtime）逐字节相同（§7 第 5 步），临时目录已删 |
| 可写面 | 只写了 3 个文件：`packages/server/src/app.ts`、`packages/server/test/contract/legacy-apk.spec.ts`、`.delivery/04-dev-report-T-07-fix1.md`。`--check-ownership --task T-07` 判"无越界"（§6 ⑦） |
| 禁触面 | `packages/shared/**`（0 改）、`packages/server/src/db/**`（0 改，T-06 正在里面干活）、`routes/{wordbook,review,profile,chat,lookup,tutor,avatar}.ts`（0 改 —— 注意 P-1b/P-1c 的**修复点在 `app.ts` 的装配表**，`profile.ts`/`avatar.ts` 本体一字未动）、`trpc/routers/` 其它域、`services/` 其它文件、`tools/**`、`apps/**` 全部未碰 |
| 放宽规则 / 删断言 / 加例外 / 改归属登记表 | **零**。未改 `tools/exceptions.json`、未改 `.dependency-cruiser.cjs`、未改 `trpc-shape.baseline.json`、未跑 `TRPC_SHAPE_UPDATE=1`；新增 5 条用例全是**收紧**方向（含"全局档没有被顺手抬掉"的反向断言） |
| 新增第三方依赖 | **零**（`package.json` 未改；只用已有的 hono/better-sqlite3/vitest + `@tm/shared`） |
| 文案 / 错误码 | 一律 import `@tm/shared`：`HTTP_BODY_LIMIT_BYTES`、`WORDBOOK_BODY_LIMIT_BYTES`、`TM_ERROR_CODES.WORDBOOK_TOO_LARGE`、`tmErrorBody()`。本轮**未新写任何中文文案到生产代码**（`请求体过大` 是盘面既有串，未改未增；缺码登记为 H-1） |
| 简报要求的"真起服 + 真 HTTP"用例 | 已存在（第四轮，A-32-3 两条）+ 本轮新增 5 条同形状；无一条是编造输出，§6/§7 全部为原始粘贴 |
