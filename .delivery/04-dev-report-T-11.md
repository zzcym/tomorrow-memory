# T-11 开发报告 — profile / 头像 / 查词 / 会话鉴权后端（第四轮：报告专用轮）

任务：§10.2 批次 3 · **T-11**（覆盖 R-04 全条、R-05 全条、R-09 数据面、R-10 数据面 P1 预留）
角色：后端开发（第四轮 / 收口+报告轮）
时间：2026-09-19 23:41–23:55（本机 Windows / Node 20 / sqlite 驱动）
本轮依据：简报盘面（A-32 记录，我未重新发现）→ 取证 → 报告
裁决依据：A-30-1（tRPC errorFormatter）、A-30-2（`profile.update` 形状追认）、A-30-3（`changePassword` 收口）、A-32-9（盘面数字对账表）、A-18-3（pg 侧显式 SKIP）、A-28-4（域内不得自建码表）

---

## 0. 结论一句话

判据①②④⑤⑥⑦ **达成（sqlite 侧，两门面 + 真 WS 握手取证）**；判据③ **门面级达成、生产装配链路未达成**——`packages/server/src/app.ts:104-105` 的 `bodyLimit` 仍是 200KB（§4.5 要求 512KB），一张 200KB 的合规 JPEG 在中间件就被 413 挡掉，永远到不了我统一的 300KB 判定；同时 `createAvatarRouter` **在 `app.ts` 里根本没有挂载**，`createProfileRouter(db)` **没有注入 flags** ⇒ `avatarUnifiedLimit=off` 的一键回退在生产装配上不可达。三条都是 T-07 名下 `app.ts` 的一行改动，已作为 P-1 一次移交（连带约束见 P-6；含精确行号与复现法）。

**本轮（第四轮）零代码改动**：只跑命令、只读代码、只写本报告。可核对的文件 mtime 见文末「附：本轮红线自查」。

---

## 1. 交付清单

行数 = 本轮实测 `wc -l`；🆕 = 本任务新建，✏️ = 本任务修改（既有文件）。

| 文件（绝对路径省略前缀 `E:\CC\tomorrow-memory\`） | 行数 | 一句话职责 | 标记 |
|---|---:|---|---|
| `packages\server\src\services\profile-service.ts` | 270 | ProfileDto 的**唯一装配点** `getProfileDto()` + 唯一落库点 `updateProfile()`（判据①②）；`dailyGoal` 只由 shared 的 `profileDtoLegacyAlias()` 派生 | 🆕 |
| `packages\server\src\services\avatar-service.ts` | 259 | 头像判定**唯一入口** `assertAvatarValue()`（300KB 解码字节 + 200px 边长 + 形态），REST/tRPC/`/api/avatar` 三面共用；`sniffImageSize()` 手写 JPEG/PNG/GIF/WEBP 头解析（不引第三方） | 🆕 |
| `packages\server\src\services\search-history-service.ts` | 264 | R-09/R-10 数据面**留形状**（本期不建表）：属主只从已认证 userId 派生、跨属主一律 403、合并语义与 `packages\ui` 逐字同规则 | 🆕 |
| `packages\server\src\routes\avatar.ts` | 57 | `POST /api/avatar`：`AvatarInputSchema` 把形状、`saveAvatar` 落 `profiles.avatar`（Q4：不落文件、不迁对象存储） | 🆕 |
| `packages\server\src\routes\profile.ts` | 57 | REST 门面：`GET/PUT /api/profile` 只做"路径 + 取数 + 转调 service + 组装"，零判定逻辑 | ✏️ |
| `packages\server\src\routes\chat.ts` | 464 | 会话门面：checkpoint key 规则 `resolveThreadAccess()` 的唯一落点、`readThreadHistory()` 两门面共用、WS 首帧鉴权 + 72h 旧通道 + 合法关闭码 | ✏️ |
| `packages\server\src\trpc\routers\profile.ts` | 146 | tRPC `profile.get/update/changePassword`：与 REST 同一 service；A-30-3 的改密收口在此 | ✏️ |
| `packages\server\src\trpc\routers\dictionary.ts` | 73 | （在册但**未改**）`dictionary.lookup` SSE 面：服务端侧对 R-05③ 的依赖只有 `llmRateLimit` 读 `ctx.userId`，已成立 ⇒ 本轮零改动，见 §6-U-6 | ✏️（实际未动） |
| `packages\server\src\routes\lookup.ts` / `packages\server\src\services\lookup.ts` / `packages\server\src\routes\tutor.ts` | 52 / 166 / 38 | （在册但**未改**）查词与教学内容门面：本轮收口面不需要动它们；`services/tutor.ts` **在仓库里不存在**（tutor 逻辑在 `@tm/agent` 的 `runAgent`），已在 §6-U-5 如实登记 | ✏️（实际未动） |
| `packages\agent\src\threaded.ts` | 171 | checkpoint 命名空间与**兼容读**（`resolveKey`：新 key 优先 → 未命中回退裸 key 且要有归属裁决 → 判不了抛 `ThreadAccessError`=403，不猜、不 500） | ✏️ |
| `packages\server\test\integration\profile-dto.spec.ts` | 581 | 判据①②③ + A-30-1（线上门面）+ A-30-3（改密收口）+ pg 环境自证 = 23 例 | 🆕 |
| `packages\server\test\integration\chat-isolation.spec.ts` | 667 | 判据④⑤⑥⑦ + 键规则 + 判据⑤ 外延（最近查询隔离）+ pg 环境自证 = 25 例（1 skip：A-30-1 的 chat 侧线上形状，上游未落地） | 🆕 |

**未新增**：DB 方法、表、列、第三方依赖、`config.ts` 字段（`config.ts`/`app.ts`/`middleware/**` 全在 T-11 禁触面内）。资料域读到的 `hasPassword`/`pwPolicyVersion` 走的是 T-06 既有的 `db.users.findCredentialsById`（`db\sqlite.ts:203`、`db\pg.ts:210` 双驱动都在）；写走既有的 `db.profiles.update(userId, patch, now)`（`db\types.ts:191`、sqlite/pg 同一签名）。

---

## 2. 完成判据 ①~⑦ 逐条（状态 / 落点 / 可复核证据）

**统一口径**：三条门面都在**临时库**（`os.tmpdir()`）上取证，standalone 拼装（`new Hono().route('/', createProfileRouter(db, flags))` / `createCallerFactory(profile)(ctx)` / `serve()+createNodeWebSocket` 真握手），**不依赖 T-07 的 `app.ts`**——正因如此，装配链路的三处缺口是 §6 的未达成项，不影响本节判据本身的成立。

| 判据 | 状态 | 落点 | 可复核证据 |
|---|---|---|---|
| **①** `profile.get`(tRPC) 与 `GET /api/profile`(REST) 的 **key 集合全等**且 `ProfileDtoSchema.safeParse` **双侧通过**（R-04③） | ✅ 达成（sqlite） | `profile-service.ts:129-178 getProfileDto()`（两门面唯一可调用的装配函数）、`:41-54 PROFILE_DTO_KEYS`（12 键，判据断言的靶子）；`routes\profile.ts:32-35`、`trpc\routers\profile.ts:78` 各**一行转调**，无第二份组装 | 命令见 §4-3。用例 `profile-dto.spec.ts:184`「两侧 key 集合全等、取值全等，且都是 ProfileDtoSchema 的合法实例」：`:188` `expect(Object.keys(viaTrpc).sort()).toEqual(Object.keys(viaRest).sort())`、`:189` 连**取值**都 `toEqual`、`:191-192` 双侧 `safeParse(...).toBe(true)`、`:195-196` 键集合恰好 = `PROFILE_DTO_KEYS + dailyGoal`（防"两侧各自加键又恰好相等"）。旁证：`:201`「旧六个键一字未动」（`ProfileSummarySchema` 仍 parse 通过）= §6.2 红线只加不改形；`:209` hasPassword/pwPolicyVersion 两侧一致且不泄漏 `$2b$`；`:222` 两个用户各读各的 |
| **②** `daily_goal`/`dailyGoal` **只有一份真值** + `profileDtoLegacyAlias` 兼容映射 | ✅ 达成（sqlite） | 写侧 `profile-service.ts:225`（两键同时来时**以 `daily_goal` 为准**）+ `:100-107 normalizeDailyGoal`；读侧别名唯一生成点 `packages\shared\src\contracts\profile.ts:61-64`；真值列 = `profiles.daily_goal`（列名一字未动 = R-04⑤） | `profile-dto.spec.ts:233`「REST 写 daily_goal 与 tRPC 写 dailyGoal 落到同一列，读回两侧一致」——末段**直接查表**：`:250-254` `PRAGMA table_info(profiles)` == `['user_id','nickname','avatar','daily_goal','updated_at']` 且 `cols.filter(/daily/)` == `['daily_goal']`（库里不可能藏第二份真值）。`:257` 两键同时传以 `daily_goal` 为准；`:267` 开关 off ⇒ **两门面同时**停发 `dailyGoal` 且键集合仍全等；`:284` 越界两侧都 400/`BAD_REQUEST` 且**不改写存量值**（无静默截断）；`:292` 昵称超长两侧同拒 |
| **③** 200×200 / ≤300KB JPEG 两门面均 2xx、超限**同一条人话**（R-04①②） | ⚠️ **门面级达成、生产装配未达成**（见 §6-U-1/U-2/U-3、P-1/P-6） | 判定唯一入口 `avatar-service.ts:207-247 assertAvatarValue()`：字节线 `:225`（`AVATAR_MAX_BYTES`=300KB）、字符线 `:230`（与 `HTTP_BODY_LIMIT` 对齐的临界，C-18）、尺寸线 `:234-238`（200px）、形态线 `:240-245`；三面出口 `routes\profile.ts:42`、`trpc\routers\profile.ts:100`、`profile-service.ts:253-270 saveAvatar`；文案单点 `packages\shared\src\constants\errors.ts:168-172`（400 /「图片太大，请换一张 300KB 以内的」） | `profile-dto.spec.ts:308`「三个入口收同一张 200×200、200KB 的 JPEG 都是 2xx 且刷新后读回同一个值」（三面 = REST PUT / tRPC update / POST /api/avatar，`:313-318` 还断言响应 `bytes` **等于** shared 的 `decodedDataUrlBytes()`）。`:325`「超限（>300KB）三入口返回同一条人话 + 同一个码 + 同一个 http」，其中 tRPC 面 `:355` `expect(e.message).toBe(avatarTooLargeCopy)` 与 REST 的 `{error}` **逐字相同**；`:395` 边长 >200px 是同一条人话（不另造文案）；`:422` 开关 off 回退旧字符上限。**fixture 自证**：`:158-165` 先让产品代码把自己造的 JPEG 读成 200×200/`image/jpeg`，避免"测自己造的假象"。**装配缺口未跑真 HTTP 的原因**：`app.ts` 属 T-07 且起真服会写仓库库文件（简报硬约束禁止），故 §6-U-1 用静态行号 + 算术给结论并留复现法 |
| **④** checkpoint key `{userId}:{threadId}` + **裸 threadId 兼容读三条路径** | ✅ 达成（sqlite；checkpoint 面与驱动无关） | 规则一份：`routes\chat.ts:111-119 checkpointKeyOf/splitCheckpointKey` + `:132-147 resolveThreadAccess()`（REST/tRPC/WS **三入口都走这一处**）；兼容读的另一半在 `packages\agent\src\threaded.ts:117-132 resolveKey()`（新 key 未命中→裸 key→要有 `claimLegacyThread` 裁决，判不了抛 `ThreadAccessError`）；认领证据 = **既有**的按用户限定读法 `db\sqlite.ts:574 getRecentMessages`（`WHERE user_id = ? AND thread_id = ?`，未加列未加方法）；台账 `chat.ts:214 LEGACY_CLAIMS`（进程内，与 `MemorySaver` 同生命周期） | 命令见 §4-4（单跑）/ §4-2（跨包键规则的依赖方向核查）。用例三条路径各自取证：`:291`**读历史**（REST `GET /api/chat/history?threadId=legacy-t` → 200 + 自己的两行存量）；`:303`**续聊 + 中断恢复**（同一 WS 连接 `message`→`interrupt(legacy:true, checkpointKey 裸名)`→`resume`→`done` 续在同一份裸现场；`:331-332` 断言**裸 key 仍在、命名空间 key 一个都没被写出来** = 兼容读不迁移）；`:335`**新会话一律命名空间化**（同名 `shared-name` 两人各一份、`:353` 新写入绝不落裸 key） |
| **⑤** 用户 B 的 token 请求 A 的 threadId → **403**（REST / tRPC / WS 三路） | ✅ 达成（sqlite）；**线上门面的 `data.httpStatus` 形状仍 skip**（P-2） | `chat.ts:139` `foreign-owner` ⇒ `ThreadForbidden`；REST 出口 `:294`（403 + `{error,code}`，http 取自 `TM_ERRORS_SUPPLEMENT.FORBIDDEN`=403，`errors.ts:216`）；tRPC 出口 `trpc\routers\chat.ts:29-31`；WS 出口 `chat.ts:187-203 enforceThreadAccess()`（鉴权成功那一刻判一次 + 每条消息再判一次）+ 合法关闭码 `:81-83 wsCloseCodeOf()`⇒**4403** | `:362` REST「403 + 同一条人话 + FORBIDDEN」且 `:369` 显式断言 `not.toBe(500)`；`:372` tRPC「同一个判定 ⇒ FORBIDDEN 码 + 同一条人话（两门面全等）」；`:438` WS「A 认领过裸 threadId 之后 B 拿同一个名字连 ⇒ 403 关闭」+ `:460` **B 这次尝试没留下任何消息行**（没被当成新会话悄悄写进去）；`:463` WS 首帧通道「B 只完成鉴权、一个字没发也要被 403 关掉」；命名空间键的负例在纯函数面 `:275`（别人的键 ⇒ 403；形状判不了 ⇒ 403，不猜属主）。skip 的那一条见 §6-U-4 |
| **⑥** WS 首帧鉴权 + 旧 `?token=` 在 72h 窗口内仍连（config 位） | ✅ 达成（sqlite；窗口位实现为 env，见 P-3） | 首帧：`chat.ts:339-352`（`{type:'auth',token}` → `verifyToken` → `auth_ok{userId}`，upgrade token 也算无效凭据 ⇒ 拒）；超时位 `:316-320`（`WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS`=3，`shared\constants\limits.ts:52`）；旧通道 `:354-370`（窗口内放行且回 `auth_deprecated`）；窗口判定 `:154-158 legacyQueryAuthWindowOpen()`（`WS_LEGACY_AUTH_UNTIL` 硬截止优先，缺省 = 进程启动 + `WS_LEGACY_QUERY_AUTH_GRACE_HOURS`=72，`limits.ts:50`）；注入位 `:251 legacyQueryAuthOpen`（第五个可选参数，**前四个位置参数一字未动** ⇒ `app.ts` 无需跟改） | `:486`「首帧 ⇒ auth_ok，随后正常对话（**不带任何 query token**）」；`:497`「旧 `?token=` 在窗口内仍然可连，并收到迁移提示」；`:506`「窗口关掉 ⇒ 旧 `?token=` 一律拒（4401），首帧通道不受影响」（真起服 + 真握手，注入 `legacyQueryAuthOpen:()=>false`）；`:535`「首帧窗口（3s）内什么都不发 ⇒ 服务端主动关闭 4401」（本条实测 3004ms，是真等）；纯函数面 `:281` 钉住"72h 由 shared 常量决定，门面里不抄数字" |
| **⑦** 无 token 的 WS 仍拒、**不回退**成匿名会话 | ✅ 达成（sqlite） | `chat.ts:316-319`（到点 `rejectUnauthed`）、`:355-358`（旧通道缺 token 直接拒）、`:177-180`（error 帧 + 4401）；`threaded.ts:120` 未鉴权调用点保持裸 key ⇒ 不新增崩溃面，`:124-126` 无裁决函数时 fail-closed | `:544`「无 token 直接发消息 ⇒ 4401 关闭，**且这一条消息没有落库**」（`:552` 长度不变 + `:554` 裸 key 下不存在 checkpoint = 没有"匿名也能聊"的会话）；`:557`「假 token 同样拒（不因鉴权失败而降级）」；旁证 `profile-dto.spec.ts:454` REST 两门面未带 token 仍 401（收口没有把鉴权顺手放开） |

---

## 3. 给前端的接口契约（T-16 / T-17 / T-19 请按本节约定，不要另发明）

### 3-1 tRPC 错误体：`data.code` 现在是 **shared 的 `tm_code`**，不是 tRPC 协议码（A-30-1）

唯一转换点 `packages\server\src\trpc\init.ts:64-79` 的 `errorFormatter`（T-07 落地），规则：
`data.code = cause.tmCode ?? 原协议码`、`data.httpStatus = cause.httpStatus ?? §4.6 表里的 http`。
⇒ **前端分支只能按 `data.code` 是不是 §4.6 码来写，绝不能再把 `data.code` 当协议码用**；协议码（`BAD_REQUEST`/`FORBIDDEN`）此时已不在 `data.code` 里，需要它请读 HTTP 状态与 `data.httpStatus`。

**真实线上错误体**（§4-4 的 `profile-dto` 单跑里 stdout 原样打印，`[T-11 契约]` 那一行，未经任何修饰）：

```
[T-11 契约] tRPC 线上错误体 = {"error":{"message":"图片太大，请换一张 300KB 以内的","code":-32600,"data":{"code":"AVATAR_TOO_LARGE","httpStatus":400,"stack":"TRPCError: 图片太大，请换一张 300KB 以内的\n    at toTrpcError (E:\\CC\\tomorrow-memory\\packages\\server\\src\\trpc\\routers\\profile.ts:39:11)\n ... at resolveMiddleware (.../@trpc+server@11.18.0.../procedureBuilder.ts:576:22)\n ... (省略 6 帧同栈)\n ... at resolveResponse (.../http/resolveResponse.ts:413:31)","path":"update"}}}
```
（`message` 与 REST 的 `{error}` **逐字同一串**；HTTP 状态位实测 `res.status` = 400 = `TM_ERRORS.AVATAR_TOO_LARGE.http`，用例 `profile-dto.spec.ts:390`。`data.stack` 是 tRPC 在非 production 环境的默认行为，生产 `NODE_ENV=production` 会去掉——登记在 §7-O-2，本任务不改。）

### 3-2 哪些码从 REST 来、哪些从 tRPC 来、形状差在哪

| 场景 | REST 形状 | tRPC 形状 | 前端要注意 |
|---|---|---|---|
| 头像超限（R-04①②） | `400 {"error":"图片太大，请换一张 300KB 以内的","code":"AVATAR_TOO_LARGE"}`（`avatar-service.ts:53-58`） | `message` 同一条人话 + `data.code="AVATAR_TOO_LARGE"` + `data.httpStatus=400` | 文案两边**同一份** shared（`errors.ts:168-172`），谁都不许再写第二份字面量 |
| 跨用户会话（R-05②） | `403 {"error":"这份记录不属于当前账号","code":"FORBIDDEN"}`（`chat.ts:62-67,294`） | caller 层 `code='FORBIDDEN'` + 同一条 message；**线上 `data.code/httpStatus` 这一形状目前未成立**（P-2，出口轮解 skip 前别按它写分支） | `FORBIDDEN` 只在 `TM_ERRORS_SUPPLEMENT`（`errors.ts:216`，且标注「文案待 PM 定稿」⇒ P-7） |
| 资料入参非法（昵称超长 / 每日目标越界） | `400 {"error":"昵称过长"}` / `{"error":"每日目标需为 1-200 之间的整数"}`，**没有 `code` 键** | `BAD_REQUEST` + 同一串 message | 这两个错误在 §4.6 与 supplement 里**都没有对应码**，按 A-28-4 我没有自建码表；`code` 缺键是**契约事实**，前端按 message 显示即可（P-4 已提请 T-03 一次性收进 shared） |
| 凭据域（`profile.changePassword` 转发口） | — | `BAD_REQUEST` + 「请输入当前密码」+ `data.code="OLD_PASSWORD_REQUIRED"`（经 `cause`，A-30-1） | 见 §3-4：这条口已经**不能改密**了 |
| 大请求体（当前装配） | `413 {"error":"请求体过大"}` ← 由 `app.ts` 的 `bodyLimit` 中间件返回，**不是** tRPC 信封 | **tRPC 路径也会被它拦**（`app.use('*', ...)` 挂在 `/trpc/*` 之前）⇒ 客户端拿到的不是 tRPC 错误体 | 这是 P-1 的可观测症状，前端若看到 `413 "请求体过大"` 说明还没进门面 |

**两条门面的 DTO 完全同形**（判据①），前端只需要一份类型：13 键 = `user_id, phone, nickname, avatar, daily_goal, updated_at, hasPassword, pwPolicyVersion, totalWords, reviewDays, reviewDates, streak, dailyGoal`（`dailyGoal` 是只读别名，读它不如读 `daily_goal`；关掉 env 后两门面同时不再输出，见 §3-3）。`GET /api/profile` 的旧六键（`nickname/avatar/daily_goal/totalWords/reviewDays/reviewDates`）一字未动 ⇒ 旧客户端不会瞎。

### 3-3 头像上传：三个入口的入参 / 响应形状

| 入口 | 请求 | 成功响应 | 失败响应 |
|---|---|---|---|
| `POST /api/avatar` 🆕 | `{"dataUrl": string, "declaredBytes"?: number}`（`shared\contracts\profile.ts:90-94`；`declaredBytes` 只是客户端自报，**服务端一律以解码后的真实大小为准**） | `200 {"ok":true,"bytes": number\|null}`，`bytes` = `decodedDataUrlBytes()` 的**同一个数**（URL 形态 ⇒ `null`） | `400 {error,code:"AVATAR_TOO_LARGE"}`；入参形状不合 ⇒ `400 {"error":"头像数据格式不正确"}`（`routes\avatar.ts:35`，唯一出口 `AVATAR_BAD_FORMAT_COPY`） |
| `PUT /api/profile` | `{"nickname"?, "avatar"?, "daily_goal"?, "dailyGoal"?}` | `200 {"ok":true}` | 同上（同一函数、同一条人话） |
| tRPC `profile.update` | `z.object({nickname?, avatar: z.string().optional(), dailyGoal?, daily_goal?})`——**zod 里不再有 500 字符上限**（A-30-2 追认的登记例外，`trpc\routers\profile.ts:84-93`） | `{ok:true, daily_goal: number}` | 同 REST 的一条人话，见 §3-1 |

兼容与开关：`avatarUnifiedLimit=off` ⇒ 回退到**改动前各面自己的旧字符上限**（REST 200_000 / tRPC 500），不报错、不改存储语义（用例 `profile-dto.spec.ts:422`）。⚠ **该开关在生产装配上目前读不到**（P-5：`app.ts:197` 未注入 `flags`，缺省按 on 处理）。存量大 base64 头像**照常显示**（判据③ 的 `:406` 用例），本期不迁对象存储、不回填（Q4）。

### 3-4 A-30-3 之后：`profile.changePassword` 不再是改密出口

`trpc\routers\profile.ts:127-145` 现在只做转调（`ctx.auth.changePassword`，`oldPassword` 结构上无法传 ⇒ **必拒 `OLD_PASSWORD_REQUIRED`**）。改密唯一出口 = `auth.changePassword`（T-07）。
**下游义务（批次4）**：`apps\web\src\app\(user)\profile\page.tsx:75,286` 现在还在调 `profile.changePassword` ⇒ 会稳定收到「请输入当前密码」，必须切到 `auth.changePassword` 并补 `oldPassword` 字段（T-15 名下，简报已登记）。

### 3-5 会话接口形状（R-05 三面）

- REST `GET /api/chat/history?threadId=` → `{threadId, checkpointKey, legacy, messages:[{id,user_id,thread_id,role,content,created_at}]}`（`chat.ts:229-238`；`legacy:true` = 命中改造前的裸 key，诊断用）
- tRPC `chat.history` → `{threadId, messages}` **一字不变**（`trpc\routers\chat.ts:11-13`：刻意不加 `checkpointKey/legacy`，避免给 A-28-1 基线再添 diff）⇒ **只有 REST 面有诊断字段**，前端要看 `legacy` 请走 REST。
- WS：客户端 → 首帧 `{type:'auth',token}`，然后 `{type:'message'|'resume', text}`；服务端 → `auth_ok{userId}` / `auth_deprecated{warning}` / `chunk{text}` / `interrupt{question,checkpointKey,legacy}` / `done{...,checkpointKey,legacy}` / `error{error,code?}`。**关闭码只有 4401（未登录）与 4403（跨用户）两类**（`4000+HTTP`，见 §5-3）。

---

## 4. 冒烟真实输出（本轮 23:41–23:49 实跑，逐字粘贴）

### 4-1 `pnpm --filter @tm/agent typecheck` —— 绿

```
$ pnpm --filter @tm/agent typecheck
$ tsc -p tsconfig.json --noEmit
exit=0
```
（无任何诊断行；`threaded.ts` 的改动 `packages\agent` 侧自证通过。）

### 4-2 `pnpm depcruise` —— 绿

```
$ pnpm depcruise
$ depcruise . --config .dependency-cruiser.cjs

✔ no dependency violations found (357 modules, 986 dependencies cruised)
exit=0
```
- 计数（357 / 986）与 T-09 报告 §3 的字面一致 ⇒ 本任务对依赖图**零新增边**（`routes/chat.ts → @tm/agent`、`trpc/routers/chat.ts → routes/chat.ts` 是既有的门面层内部复用，方向合法，见 `chat.ts:29-31` 的说明）。
- `packages\agent\src\nodes|tools/**` 未被 T-11 触碰（只改了 `threaded.ts`），"agent 不得反向依赖 server" 这条由 depcruise 把门，仍绿。

### 4-3 `pnpm --filter @tm/server test` —— 286/1/1，唯一红 = `trpc-shape` 基线（A-28-1，**未跑 `TRPC_SHAPE_UPDATE=1`、未改基线**）

```
$ pnpm --filter @tm/server test
 ✓  @tm/server  test/unit/wordbook-merge.spec.ts (44 tests) 34ms
 ✓  @tm/server  test/db/migrations.spec.ts (25 tests) 109ms
 ✓  @tm/server  test/db/methods.spec.ts (25 tests) 111ms
 ✓  @tm/server  test/review-no-llm.spec.ts (16 tests) 116ms
 ✓  @tm/server  test/integration/profile-dto.spec.ts (23 tests) 250ms
 ✓  @tm/server  test/integration/wordbook-concurrency.spec.ts (34 tests) 430ms
 ✓  @tm/server  test/integration/review-parity.spec.ts (24 tests) 427ms
 ❯  @tm/server  test/trpc-shape.spec.ts (2 tests | 1 failed) 24ms
 ✓  @tm/server  test/contract/legacy-apk.spec.ts (25 tests) 2519ms
 ✓  @tm/server  test/integration/auth-register.spec.ts (21 tests) 2731ms
 ✓  @tm/server  test/integration/chat-isolation.spec.ts (25 tests | 1 skipped) 4882ms
 ✓  @tm/server  test/integration/auth-hardening.spec.ts (24 tests) 12186ms
⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   @tm/server  test/trpc-shape.spec.ts > T-08 判据①：tRPC appRouter 过程清单零签名漂移 > 与拆分前的基线逐字节一致（path 列表 + input/output 形状 + 探针指纹 + 调用面）
Error: appRouter 形状漂移：首个差异在第 3162 行
  现值:       "path": "auth.activate",
  基线:       "path": "auth.login",
  受影响 procedure: auth.activate, auth.changePassword, auth.forceChangePassword, auth.login, auth.logout, auth.register, auth.sendCode, profile.update, review.queue, review.undo
 ❯ test/trpc-shape.spec.ts:390:13
 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 286 passed | 1 skipped (288)
   Duration  14.74s (transform 1.73s, setup 0ms, collect 15.60s, tests 23.82s, environment 4ms, prepare 2.46s)
```
- **与我名下两件有关的两点**：(a) `profile-dto`/`chat-isolation` 都在 `✓` 那一批；(b) 受影响清单里 `profile.*` **只有 `profile.update`**（= A-30-2 已追认的登记例外），**`profile.changePassword` 与 `profile.get` 都不在其中** ⇒ A-30-3 的"签名一字不动"与 `chat.history` 的"输出形状不加键"确实对基线无感。
- 全库那 1 skipped = `chat-isolation` 里 A-30-1 的 chat 侧线上形状用例（§6-U-4），**不是** pg skip（pg 那两条是"打印 SKIP 原因"的实跑用例，见 §4-5/§4-6）。

### 4-4 `chat-isolation` 单跑（正确调用法）

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server chat-isolation --reporter=verbose
 ✓  @tm/server  …spec.ts > R-05① checkpoint key 规则（与 @tm/agent 的 threaded.ts 同一条） > checkpointKeyOf：鉴权后是 {userId}:{threadId}，未鉴权保持裸 key（不新增崩溃面） 1ms
 ✓  @tm/server  …spec.ts > R-05① … > splitCheckpointKey 能把两种形态都认回来 1ms
 ✓  @tm/server  …spec.ts > R-05① … > resolveThreadAccess：别人的命名空间键 ⇒ 403；判不了的形状 ⇒ 403（不猜属主） 1ms
 ✓  @tm/server  …spec.ts > R-05① … > legacyQueryAuthWindowOpen：窗口内 true、过点 false（72h 由 shared 常量决定，不抄数字） 0ms
 ✓  @tm/server  …spec.ts > 判据④ 裸 threadId 的旧现场仍可被属主读（读历史 / 续聊 / 中断恢复） > 读历史：A 用裸 threadId 读到自己的存量行，返回体带上命名空间后的 checkpointKey 10ms
 ✓  @tm/server  …spec.ts > 判据④ … > 续聊 + 中断恢复：A 的 WS 命中**裸 key**（兼容读 legacy=true），resume 续上同一份现场 599ms
 ✓  @tm/server  …spec.ts > 判据④ … > 新会话一律落在 {userId}:{threadId} 下，同名会话两人各一份（S8 回归点） 21ms
 ✓  @tm/server  …spec.ts > 判据⑤ B 的 token 请求 A 的 threadId ⇒ 403（不是 500、不是空返回） > REST：B 用 A 的命名空间键 ⇒ 403 + 同一条人话 + FORBIDDEN 3ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > tRPC 门面：同一个判定 ⇒ FORBIDDEN 码 + 同一条人话（两门面全等） 2ms
 ↓  @tm/server  …spec.ts > 判据⑤ … > A-30-1 待 T-07 落地，出口轮解 skip 复验：tRPC 错误体 data.code === shared 的 tm_code（跨用户 403 走 cause→data，且线上不是 500）
 ✓  @tm/server  …spec.ts > 判据⑤ … > WS：A 认领过裸 threadId 之后，B 拿同一个名字连 ⇒ 403 关闭（不是 200 空会话） 5ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > WS 首帧通道同样拦：B 只完成鉴权、一个字没发，也要被 403 关掉（判据⑤ 的更早出口） 4ms
 ✓  @tm/server  …spec.ts > 判据⑥ WS 首帧鉴权 + 旧 ?token= 窗口 > 首帧 {type:"auth",token} ⇒ auth_ok，随后正常对话（不带任何 query token） 532ms
 ✓  @tm/server  …spec.ts > 判据⑥ … > 旧 ?token= 在窗口内仍然可连，并收到迁移提示（auth_deprecated） 536ms
 ✓  @tm/server  …spec.ts > 判据⑥ … > 窗口关掉 ⇒ 旧 ?token= 一律拒（4401），首帧通道不受影响 5ms
 ✓  @tm/server  …spec.ts > 判据⑥ … > 首帧超时位存在（WS_AUTH_FIRST_FRAME_TIMEOUT_SECONDS 由 shared 决定，不在门面里抄数字） 0ms
 ✓  @tm/server  …spec.ts > 判据⑥ … > 首帧窗口（3s）内什么都不发 ⇒ 服务端主动关闭 4401 3004ms
 ✓  @tm/server  …spec.ts > 判据⑦ 完全没 token 的 WS ⇒ 拒绝，不回退成匿名会话 > 无 token 直接发消息 ⇒ 4401 关闭，且这一条消息没有落库 3ms
 ✓  @tm/server  …spec.ts > 判据⑦ … > 假 token 同样拒（不因鉴权失败而降级） 2ms
 ✓  @tm/server  …spec.ts > 判据⑤ 同口径外延：最近查询历史的属主隔离（R-09/R-10 数据面，本期留形状） > 属主只能由已认证 userId 派生；未登录/非法 id ⇒ null（不 403、不共享别人的分区） 0ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > 未登录读写都不落库、也不抛（R-10⑦），且读回的是空列表而不是别人的那份 1ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > 跨属主的批量上行 ⇒ 403 + shared 的同一条人话 + 同一个 http（与判据⑤ 逐字同口径） 0ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > 缺 ownerId 的批量上行同样 403（判不了归属就不动，宁可拒也不猜） 0ms
 ✓  @tm/server  …spec.ts > 判据⑤ … > 合并语义两端口径一致：同词同方向上移不产生第二条、跨方向各留一条、硬截到 RECENT_MAX 1ms
 ✓  @tm/server  …spec.ts > 环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里） > 未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg，报告已登记） 1ms
 Test Files  1 passed (1)
      Tests  24 passed | 1 skipped (25)
   Start at  23:48:43
   Duration  6.89s (transform 319ms, setup 0ms, collect 1.67s, tests 4.77s, environment 0ms, prepare 121ms)
```
（`↓` 那一条 = §6-U-4，skip 原因写在用例注释里，不是"断言写错"。）

### 4-5 `profile-dto` 单跑

```
$ pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server profile-dto --reporter=verbose
 ✓  判据① R-04③：profile.get(tRPC) 与 GET /api/profile(REST) 的键集合全等且双侧过契约 > 两侧 key 集合全等、取值全等，且都是 ProfileDtoSchema 的合法实例
 ✓  判据① … > 旧 GET /api/profile 的六个键一字未动（§6.2 红线接口只加不改形）
 ✓  判据① … > hasPassword / pwPolicyVersion 来自凭据视图，且两侧一致（R-04③ + R-40 只加键）
 ✓  判据① … > 两个用户各读各的（跨用户不串资料）
 ✓  判据② daily_goal / dailyGoal 只有一份真值 + 兼容映射开关 > REST 写 daily_goal 与 tRPC 写 dailyGoal 落到同一列，读回两侧一致
 ✓  判据② … > 两键同时传时以 daily_goal 为准（别名只读不写，不产生第二份真值）
 ✓  判据② … > 开关 off ⇒ 两门面同时停发 dailyGoal，且键集合仍然全等（别名是唯一生成点）
 ✓  判据② … > 越界目标被拒且不改写存量值（两门面都拒、无静默截断）
 ✓  判据② … > 昵称超长两侧同拒（上限来自 shared 的 NICKNAME_MAX_LENGTH）
 ✓  判据③ R-04①②：头像上限两门面统一，200×200/≤300KB 三入口全 2xx，超限同一条人话 > 三个入口收同一张 200×200、200KB 的 JPEG 都是 2xx 且刷新后读回同一个值
 ✓  判据③ … > 超限（>300KB）三入口返回同一条人话 + 同一个码 + 同一个 http
 ✓  判据③ … > A-30-1：线上 tRPC 错误体 data.code === shared 的 tm_code（cause→data 真的到了客户端）
 ✓  判据③ … > 边长 >200px 同样拒，且是同一条人话（不另造文案）
 ✓  判据③ … > R-04⑤⑥：Q4 决策不动存量 —— 库里已有的大 base64 仍原样读出、仍显示
 ✓  判据③ … > 清空头像（空串）两门面都放行，且读回空串
 ✓  判据③ … > avatarUnifiedLimit=off ⇒ 回退到改动前各面自己的旧字符上限（开关语义可回退）
 ✓  判据③ … > 403 与 500 的人话不在资料域出现（错误码/文案一律 import 自 shared，A-28-4）
 ✓  装配面自检（standalone，不等 T-07 的 app.ts） > 未带 token 时两个门面都 401（不因为收口而放开鉴权）
 ✓  装配面自检 … > POST /api/avatar 的入参形状由 shared 契约把门（缺 dataUrl → 400，不是 500）
 ✓  A-30-3 / R-40②：profile.changePassword 只是转发口，改密唯一出口在 auth 域 > 静态取证：routers/profile.ts 里已无 bcrypt 直调、无第二处写密码路径
 ✓  A-30-3 … > 转调一次且 oldPassword 传空串 ⇒ 唯一出口按 R-40② 拒 OLD_PASSWORD_REQUIRED（400，不是 500）
 ✓  A-30-3 … > ctx.auth 未装配 ⇒ 明确报错，绝不静默放行成"密码已改"
 ✓  环境自证：pg 侧可用性（本机无实例时显式 SKIP 并把原因留在输出里） > 未设 DATABASE_URL_TEST 时打印 SKIP 原因（CI 必须真跑 pg，报告已登记）
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Start at  23:49:02
   Duration  1.47s (transform 248ms, setup 0ms, collect 893ms, tests 152ms, environment 0ms, prepare 120ms)
```
该轮 stdout 里还打出（判据③ 的 A-30-1 用例，被 §3-1 引用）：
```
[T-11 契约] tRPC 线上错误体 = {"error":{"message":"图片太大，请换一张 300KB 以内的","code":-32600,"data":{"code":"AVATAR_TOO_LARGE","httpStatus":400,…}}}
```

### 4-6 `pnpm --filter @tm/server typecheck` —— **0 错**（与简报一致）

```
$ pnpm --filter @tm/server typecheck
$ tsc -p tsconfig.json --noEmit
exit=0
```

### 4-7 补一条与 T-11 直接相关的门禁（A-28-4 的"域内不建第二份码表"）

```
$ node tools/boundaries.mjs --copy
OK   copy-legacy-zero           0 命中（扫描 apps/web/src, apps/app/src, packages/ui/src, packages/shared/src, packages/server/src, packages/agent/src, mobile-memory；例外豁免 75 处）；需人工复核词命中 124 处（不判红，UI §8.2-9 明示由走查确认）
1/1 条通过，全绿
```

### 4-8 简报点名的那个坑（留字面给 Phase 5）

`pnpm --filter @tm/server test -- chat-isolation` **不过滤**：`--` 被原样透传给 `vitest run --root ../.. --project @tm/server -- chat-isolation`，等于跑全量。单跑必须用 §4-4/§4-5 的 `exec vitest run --root ../.. --project @tm/server <pattern>`。

---

## 5. §5「同一规则抄了两份」= C-04 失效模式：两处真缺陷的整改记录

简报点名要写清的一条。**这两处都不是"看起来不对"，是能构造出"同一件事在两处给出不同答案"的真实缺陷**，都属 PRD §3.3 里 C-04（头像上限 500 vs 200_000 → Web 永远失败）的同一失效模式：**一条规则被抄成第二份，两份各自演化**。

### 5-1 缺陷 D-T11-1：「300KB 那条线」的解码字节数被抄了两份（一处判定、一处上报，且两份不等价）

- **症状**：头像的**判定**用 `decodedDataUrlBytes()`（去掉 `data:...;base64,` 前缀、再减 padding），但 `saveAvatar()` **回给客户端的 `bytes`** 是就地手算的 `Math.floor(len*3/4)`——**它把前缀一起算了进去、也不减 padding** ⇒ 上报值系统性偏大（一张 200KB 的图会报成 ≈ 200KB + 前缀折算的 ~17B 与 padding 误差之外的偏移；偏大方向意味着"判定放行、上报却显示超限"，且 300KB 边界上的图会报出 > 300KB 的数）。这是同一规则被抄的**第三处**（第一处是 `avatar-service` 内部早先那份同口径实现，注释里却写着"复用它"= 没人看守的第二实现）。
- **改在哪（最小修）**：
  - `packages\server\src\services\avatar-service.ts:81-83` —— 删掉本文件自己那份 base64 字节算法，只留注释说明"复用 shared 的唯一实现"；使用点收敛为 `:174`（dataUrl 形态）与 `:184`（裸 base64 形态）。
  - `packages\server\src\services\profile-service.ts:265-268` —— `saveAvatar` 的 `bytes` 改为 `value ? decodedDataUrlBytes(value) : 0`，与判定同源；`:25` 增加该 import。
  - 全库唯一实现保留在 `packages\shared\src\contracts\profile.ts:97-103`（注释即"**唯一实现**，两端与服务端共用"）。
- **用什么证据钉住**（不是靠注释，靠断言）：
  - `packages\server\test\integration\profile-dto.spec.ts:316-318`：`POST /api/avatar` 成功后 `expect(uploaded.body.bytes).toBe(decodedDataUrlBytes(okAvatar))` ——**上报值必须等于判定用的那一个数**，谁再手算一遍就红。
  - 静态面（本轮实测）：`grep -rn "\* 3) / 4" packages/*/src --include=*.ts` → **仅 1 命中** = `packages\shared\src\contracts\profile.ts:102`；`grep -rn decodedDataUrlBytes` 的调用点全部指向该 import（`avatar-service.ts:24,174,184`、`profile-service.ts:25,268`）。

### 5-2 缺陷 D-T11-2：同一条人话「头像数据格式不正确」被抄了两份（REST 门面一份 + 判定层一份）

- **症状**：`routes\avatar.ts` 在"入参形状不合"分支里写了一个**字面量** `'头像数据格式不正确'`，而 `assertAvatarValue()` 的非法类型分支抛的是同一条字符串——两处逐字相同、各处独立。改一处忘另一处 ⇒ 同一个失败原因从两个入口报出两句话，判据③ 的"同一条人话"当场失效（C-04 的成因结构，只是长度换成了文案）。
- **改在哪（最小修）**：字面量收进 `packages\server\src\services\avatar-service.ts:32-38` 的 `AVATAR_BAD_FORMAT_COPY`（判定层与门面层共用的唯一出口）；`packages\server\src\routes\avatar.ts:21` 改为 import、`:35` 用常量。⚠ 这条文案在 `@tm/shared` 的 §4.6 表与 `TM_ERRORS_SUPPLEMENT` 里**没有对应码**，按 A-28-4 我**不自建码表**，先收在域内唯一出口并已提请 T-03 一次性收进 shared（P-4）。
- **用什么证据钉住**：
  - `profile-dto.spec.ts:465-473`「POST /api/avatar 的入参形状由 shared 契约把门（缺 dataUrl → 400，不是 500）」，末段 `expect(res.body.error).toBe(AVATAR_BAD_FORMAT_COPY)` —— 断言的是**那个常量**，不是字符串，字面量再抄一份就会漂出相等。
  - 静态面（本轮实测）：`grep -rn "头像数据格式不正确" packages/ --include=*.ts` → **仅 1 命中** = `packages\server\src\services\avatar-service.ts:38`（测试引用的是常量，所以不产生第二处字面量）。

### 5-3 顺带必须记的一条（同类但更硬）：判据⑤ 的 WS 面「403 从来没关成过」

不是"抄两份"，是**用错了值的定义域**，且它是 A-30 头部点名的那条真缺陷，不写就会在下轮被当成"已经好了"：

- **症状**：旧实现 `ws.close(403)`。WS 关闭码的定义域是 RFC 6455 §7.4.1 的 1000-1014 / 3000-4999，**三位数的 403 非法**；`ws@8` 在收发两端都校验（`Sender#close` 直接 `throw TypeError`）。后果：403 错误帧**发出去了**、`close` 抛进兜底 catch ⇒ **连接按"新会话"悄悄继续挂着** ⇒ 判据⑤ 的 WS 面看起来对、实际没拦。这正是 A-30 盘面里那条 `chat-isolation` 的红的真因。
- **改在哪**：`packages\server\src\routes\chat.ts:69-88` 新增 `wsCloseCodeOf(httpStatus) = 4000 + httpStatus`，出口全部改用它：4401（未登录，与历史行为逐字相同）、**4403**（跨用户）。HTTP 真值仍取自 shared，不新增码表。
- **证据**：`chat-isolation.spec.ts:438`、`:463` 各断言 `await c.closed() === 4000 + TM_ERRORS_SUPPLEMENT.FORBIDDEN.http`，并在其后 `:460`/`:479` 断言**这个用户的 threadId 下一条消息都没落库**（"没被当成新会话"的正面证据）。两条都在 §4-4 的绿色清单里（5ms / 4ms）。

### 5-4 同一模式的**残余**（本轮未修，登记在 §6-U-7 / P-8）

`LEGACY_REST_AVATAR_MAX_CHARS = 200_000` 现在仍在 `routes\avatar.ts:25` 与 `routes\profile.ts:21` **各定义一份**（同值、同语义，且都是"开关 off 时的旧上限"）。它不会立刻造成行为差异，但它是下一次跑偏的种子。收法是一处纯挪动（导出到 `profile-service`/`avatar-service`，两个门面 import），零行为变更——报告专用轮不动代码，留给下一轮或出口轮。

---

## 6. 未达成项 / 已知残余（如实列出，不粉饰）

| # | 项目 | 事实与依据 | 影响 |
|---|---|---|---|
| **U-1** | **判据③ 在生产装配上未达成：`app.ts` 的 `bodyLimit` 仍是 200KB** | `packages\server\src\app.ts:101-108` = `bodyLimit({ maxSize: 200*1024, onError: c.json({error:'请求体过大'},413) })`，挂在 `'*'` 且在 `/trpc/*` 与所有 API 之前。§4.5（架构师）写死"200KB → **512KB**（全局），词本 PUT 单独放宽 8MB"。算术：合法上限 300KB 解码 = **409_600** base64 正文 + 前缀 22 + JSON 包裹 ⇒ 请求体约 **410 KB**（我推导出的字符线就是 `avatar-service.ts:257 AVATAR_MAX_DATA_URL_CHARS = ceil(300*1024*4/3)+512 = 410_112`）≫ 204_800 ⇒ 中间件先 413，我的判定根本不会被执行。按 `204_800 - 40` 反推，**当前装配的实际可传图片 ≈ 150 KB**，R-04①「200×200、≤300KB 的 JPEG 返回 2xx」在 150KB~300KB 这一段**不成立**（C-18 换了个形态复现）。**未跑真 HTTP 的原因：`app.ts` 属 T-07，起真服会落到仓库内 sqlite 库文件——简报硬约束禁止，故此处给静态行号 + 算术，复现法见 §10-2。** | **高**：发布清单必须有一步"bodyLimit=512KB 且头像 300KB 真上传成功" |
| **U-2** | **`POST /api/avatar` 未挂载** | 全库 `grep -rn createAvatarRouter`：只有定义（`routes\avatar.ts:27`）、注释（`:12`）与**测试**引用（`profile-dto.spec.ts:49,105,457`），`app.ts` 里**零挂载**。⇒ §4.5 规划的 R-04 新接口在生产不可达；判据③ 的"第三入口"目前只在测试装配里成立 | 高（T-07 一行：`app.route('/', createAvatarRouter(db, flags))`） |
| **U-3** | **`createProfileRouter(db)` 未注入 flags ⇒ `avatarUnifiedLimit=off` 在生产不可达** | `app.ts:197`；`routes\profile.ts:40` 与 `routes\avatar.ts:38` 的 `flags ? await flags.isOn('avatarUnifiedLimit') : true` 在缺省时恒走 unified。这与 **A-32-2（D-1，`createWordbookRouter(db)` 未注入 deps）是同一形态**。我的判据③ 有 `off` 态用例（`profile-dto.spec.ts:422`），但那条用的是测试注入的 `flags` | 中高：PRD §6.4-5-6 承诺的"一键回退"目前是纸面能力 |
| **U-4** | **判据⑤ 的线上 tRPC 错误体形状未钉住（唯一 skip）** | `chat-isolation.spec.ts:416` `it.skip`。原因**不是断言写错，是上游未落地**（简报说 A-30-1 已完成——`errorFormatter` 本体确实完成，`init.ts:64-79` 在位，profile 面的线上取证已绿；差的是 supplement 码这一段）：`trpc\routers\chat.ts:31` 的 `cause` **不带 `httpStatus`**，而 `trpc\init.ts:69` 的兜底 `TM_ERRORS[tmCode].http` 只查 §4.6 冻结表，`FORBIDDEN` 只在 `TM_ERRORS_SUPPLEMENT` ⇒ `undefined.http` → `TypeError` → errorFormatter 自己把 403 变 500。第三轮临时解 skip 实测仍同一处栈（`at Object.errorFormatter (…/trpc/init.ts:69:92)`），本轮以静态取证复核（两处行号即上）⇒ **继续 skip，断言一字未放宽**。落地后**只需**把 `it.skip` 改回 `it` | 中：出口轮必须解 skip 复验（owner 是 T-07 的 `init.ts` 或 chat 门面加 `httpStatus`，二者都在我禁触面外） |
| **U-5** | 在册但未改的文件 | §10.2 T-11 允许面里的 `services/tutor.ts` **在仓库中不存在**（tutor 逻辑是 `@tm/agent` 的 `runAgent`，门面 `routes/tutor.ts` 只做转调）；`services/lookup.ts`、`routes/lookup.ts`、`routes/tutor.ts`、`trpc/routers/dictionary.ts` 经核查**本任务无需改动**（git status 亦显示未修改）。查词的 R-09 数据面收在 `search-history-service.ts` 的形状里，见 U-6 | 低（口径澄清） |
| **U-6** | **`search-history-service.ts` 生产零调用点** | `grep -rn "recordRecentSearch\|listRecentSearches\|pushRecentSearches" packages/server/src` → 只有本文件自身的定义，无门面/过程引用。这是 §10.2 判据写死的"本期仅本机、服务端**留形状**（P1 R-26 落库）"，**不是**遗漏；文件头 `:118-122` 明写"生产路径上这张表始终为空 ⇒ 不存在'看起来同步了、其实换设备就没了'的假承诺"。R-09 数据面与 R-05③（SSE 带 token）的服务端侧唯一依赖是 `trpc\init.ts:139` 的 `ctx.userId !== null` 分支（`app.ts` 的 createContext 已从 `Authorization` 头解出 userId ⇒ 已成立），故 `dictionary.ts` 未改 | 低（按设计）；R-26 接手时 store 是唯一要换的实现 |
| **U-7** | `LEGACY_REST_AVATAR_MAX_CHARS = 200_000` 两份（见 §5-4） | `routes\avatar.ts:25`、`routes\profile.ts:21` | 低（零行为差异，纯种子） |
| **U-8** | **pg 侧未跑**（A-18-3） | 见 §7 | — |
| **U-9** | 兼容别名开关是 **env** 不是 feature_flags | `profile-service.ts:32-38`（`PROFILE_DTO_LEGACY_ALIAS=off`）。§6.4-5 的运行时开关清单里没有这一项、PRD 对 R-04③ 也只要求"一份真值 + 兼容映射"⇒ 判据② 达成；这个 env 是**我自加的退出阀**（不读 `config.ts`/`feature_flags`，因两者归 T-07/T-06）⇒ 口径待裁（P-3） | 低 |
| **U-10** | 真 LLM 网关的 WS 端到端未测 | `chat-isolation.spec.ts:104-109` 用 `hasLlm:false` 的 stub 走编排启发式分支（正好能造出 HITL interrupt）。DeepSeek 真网关的"流式 + 中断 + 恢复"不在本文件，属 T-22/T-23 的 CI 冒烟或人工冒烟 | 低（判据④⑤⑥⑦ 不依赖 LLM 内容） |

---

## 7. pg 侧：本机无 PG → **显式 SKIP + "CI 必须真跑 pg"**（A-18-3）

两个测试文件各有一条**实跑**的环境自证用例（不是 `it.skip`），输出逐字：

```
stderr | test/integration/chat-isolation.spec.ts > 环境自证：pg 侧可用性 …
[SKIP] T-11 chat-isolation 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。 按 A-18-3 先例，sqlite 侧全绿 + pg 侧显式 SKIP；CI（T-22）必须真跑 pg。 本域对 pg 的依赖面 = `chat_messages.thread_id` 的裸 key 兼容读与 `{userId}:{threadId}` 命名空间键（PRD §6.1-5 要求双驱动行为一致），checkpoint 面是进程内 `MemorySaver`、与驱动无关。
```
```
stderr | test/integration/profile-dto.spec.ts > 环境自证：pg 侧可用性 …
[SKIP] T-11 profile-dto 的 pg 驱动用例未执行：本机无 PostgreSQL 实例、process.env.DATABASE_URL_TEST 未设置。 … 本域对 pg 的依赖面 = `profiles.{nickname,avatar,daily_goal,updated_at}` 的读写与 `users` 凭据视图（列名两侧一字不动是 R-04⑤ 判据），DDL 形状差异由 `pnpm ddl-parity` 的 A 段把门。
```

**T-11 在 pg 上的真实暴露面（请在 CI 里按这四条点名跑）**：
1. `profiles.update` 的两驱动**语义**（不是签名）差异：pg 是 `UPDATE profiles SET nickname = COALESCE($1,nickname), avatar = COALESCE($2,avatar), daily_goal = COALESCE($3,daily_goal)`（`db\pg.ts:476-480`）；sqlite 是 `SELECT` + 全列 `UPDATE`（`db\sqlite.ts:442-457`）。我核对了 sqlite 侧两条语句之间**没有 await**（better-sqlite3 同步）⇒ 单进程内不可被插入，无 lost-update；空串清空在两侧都不被 COALESCE/`!== undefined` 误判。**但这是推理不是实测** ⇒ pg 侧"只改 daily_goal 不得抹掉 nickname/avatar、`avatar=''` 清空成功"要在 CI 真跑一遍。
2. `users.findCredentialsById`（pg `:210`）在 pg 的 `VARCHAR(11)` phone 语义下返回的 `password`（可空）与 `pw_policy_version` 默认值 ⇒ 判据① 的 `hasPassword`/`pwPolicyVersion` 两个键。
3. `chat_messages` 的 `WHERE user_id = ? AND thread_id = ?` 在 pg 的 `thread_id` 长度/排序规则下，裸 key 与 `{id}:{name}` 两种形态都能原样存取（判据④ 的兼容读读的是**存量裸行**）。
4. R-41 与本域同规则（见 P-9）。

---

## 8. 盘面数字对账表（A-32-9：简报数字 vs 实测数字逐条归因；并行期防"把撞车当缺陷"）

| 项目 | 简报/A-32 数字（2026-09-19 深夜） | 本轮实测（23:41–23:49） | 归因 |
|---|---|---|---|
| `@tm/server test` | 286 passed / 1 failed / 1 skipped（12 文件） | **286 / 1 / 1（12 文件，288 例）** | **完全一致**，无漂移，无他人撞车。1 failed = `trpc-shape`；1 skipped = `chat-isolation:416`（§6-U-4），**不是** pg skip |
| `@tm/server typecheck` | 0 错 | **0 错**（exit=0） | 一致 |
| 唯一红 | `trpc-shape` 基线（A-28-1） | 同一处：`test\trpc-shape.spec.ts:390`，受影响 10 条 = `auth.*`(7) + `profile.update` + `review.queue/undo` | 一致。**我未跑 `TRPC_SHAPE_UPDATE=1`、未改基线**；`profile.*` 里只有 A-30-2 追认的 `profile.update` |
| `@tm/agent typecheck` | 未给数字 | 绿（exit=0） | 本轮新取（简报要求） |
| `pnpm depcruise` | 未给数字（T-09 报告里是 357/986） | **357 modules / 986 dependencies，0 违规** | 与 T-09 字面一致 ⇒ T-11 三处改动零新增依赖边（简报里我先前记的"984→986"是 T-09 自己那轮的差值，与本任务无关） |
| `chat-isolation` | 在绿批里 | **24 passed / 1 skipped（25）**，6.89s | 一致；简报"A-30 时期这条是红的"已翻绿（§5-3 的 4403 修法） |
| `profile-dto` | 在绿批里 | **23 passed（23）**，1.47s | 一致 |
| 已落盘文件行数（简报快照 → 实测） | profile-service **266** / avatar-service **251** / search-history **264** / routes-avatar **56** | **270 / 259 / 264 / 57** | 差值 = 简报快照之后、第三轮收口之前的 **§5 两处整改**：`profile-service.ts` +4（`:265-268` 同源 bytes 的 4 行注释与改写 + `:25` import）、`avatar-service.ts` +8（`:32-38` `AVATAR_BAD_FORMAT_COPY` 常量块、`:81-83` 删内联算法后留下的说明注释）、`routes\avatar.ts` +1（`:21` import）。**本轮（第四轮）零代码改动**，差值不是我造成的，也不是撞车 |
| 其余已落盘文件 | lookup 264？（简报未列）/ tutor 未列 | lookup-service **166**、routes/lookup **52**、routes/tutor **38**、routes/chat **464**、routers/profile **146**、routers/dictionary **73**、threaded **171**、chat-isolation **667**、profile-dto **581** | 简报只给了"存在性"没给行数的，本轮补齐；`services/tutor.ts` **不存在**（§6-U-5） |
| 批次盘面 | T-11 报告"仍未交" | 本报告即交付 | T-07 报告 23:36 / T-09 报告 23:35 / T-20 此刻在跑（任务表 #22-25 in progress/pending）⇒ 我只读它们的产物、未干涉 |

---

## 9. 待裁决点 / 移交清单（**要 TPM 拍板的排在前面**）

| # | 议题 | 我的建议 | owner |
|---|---|---|---|
| **P-1** | **`app.ts` 的三行装配缺口（U-1/U-2/U-3）是判据③ 与 §6.4-5-6 的阻断项**：`bodyLimit` 200KB→**512KB**（§4.5 原话）、`app.route('/', createAvatarRouter(db, flags))`、`createProfileRouter(db, { flags })`。三条都在 T-07 名下 `app.ts`，且与 A-32-2（D-1 词本注入）同一形态——建议**同一次改完**，出口轮再加一条真 HTTP 冒烟：300KB 图 PUT/POST 都 200、301KB 都拿同一条 400 | 请排 T-07 收口轮（第四轮已在跑，可能撞不上车 → 需要明确归口） | T-07（app.ts 唯一 owner） |
| **P-2** | **U-4 的 skip 何时解**：`init.ts:69` 的 http 兜底改走认 supplement 的 `errorHttpStatus()`，或 `trpc/routers/chat.ts:31` 的 `cause` 带上 `httpStatus`。两条都在我禁触面外。**只要不解 skip，判据⑤ 的"tRPC 线上错误体"就只证到 caller 层**（出口轮 E2 请一并核对：`auth-register` 与 `profile-dto` 的 A-30-1 用例绿 ≠ `chat` 面绿） | 请指定唯一修法（我倾向**门面带 `httpStatus`**，因为它与 profile/checkin 等门面已写的形状一致，`init.ts` 的兜底不动 = 零回归面） | T-07 / 出口轮 E2 |
| **P-3** | **§4.5 指定的窗口位与实际实现不一致**：设计写 `config.wsLegacyQueryAuthGrace=false`，我实现为 `process.env.WS_LEGACY_AUTH_UNTIL`（运维硬截止）+ 缺省进程启动 + `WS_LEGACY_QUERY_AUTH_GRACE_HOURS`(72)。原因：`config.ts` 归 T-07。要收编成 config 字段请给一句话授权（`config.ts` 归 T-07 改，我不动）；否则请在 §4.5 追认 env 名字，别让 T-16/T-20 去找一个不存在的 config 位 | 二选一，请裁决 | T-07 或文档（A-33 口径由 TPM 改） |
| **P-4** | **资料域两个错误没有 §4.6 码**（「昵称过长」「每日目标需为 1-200 之间的整数」），另有一条人话（「头像数据格式不正确」）也无码。按 A-28-4 我没自建码表，全部走"message 有人话、`code` 键缺省/域内单点常量"。请 T-03 出口轮做**一次纯追加**（同 A-28-4/A-30-7 的做法，不动 §4.6 冻结行），收完后我这两个文件各删一行 | 排批次 4 前置 | T-03（E1） |
| **P-5** | **A-30-2 的登记例外已生效**（`profile.update` 的 avatar 去 `max(500)` + 新增 `daily_goal`），出口轮再生基线时请**逐字按 A-30-2 的口径核对**：`nickname`/`dailyGoal` 两键一字未变（用例 `profile-dto.spec.ts:288-299` 从门面侧证；`trpc-shape` 的受影响清单里只有 `profile.update`）。**另外必须知道**：`trpc-shape.baseline.json` 对 profile 三个过程的 **output 一律记成 `null` + `outputProbes:"(no-parser)"`**（本轮实测 `node -e` 读出，见下）⇒ **`profile.get` 从旧形状长成 13 键 DTO 这件事，基线门完全看不见**。"只增不改"审计在**出参面**目前是空的，请决定是否补 output 探针（那是 T-08/T-02 名下的文件） | 请登记为出口轮待办 | T-08 / T-02 |
| **P-6** | 若采纳 P-1 把 `bodyLimit` 抬到 512KB：`/api/avatar` 与 `PUT /api/profile` 的最大请求体是 **410 KB**（`AVATAR_MAX_DATA_URL_CHARS`），512KB 刚好有余量；但词本整本覆写需要 §4.5 的另一半（PUT 单独 8MB），别在抬全局值时把那一步省掉 | 提醒 | T-07/T-09 |
| **P-7** | `FORBIDDEN` 的人话「这份记录不属于当前账号」在 `errors.ts:216` 标注**「文案待 PM 定稿」**，而它已被判据⑤ 三面（REST/tRPC/WS）与 R-09/R-10 外延共用。定稿只改 shared 一处即可，我的实现零字面量 | 请 PM 给一句话 | T-03/PM |
| **P-8** | §5-4 的 `200_000` 双份（纯挪动，零行为变更） | 下一轮顺手做，别单独排任务 | T-11 下一轮 |
| **P-9** | **R-41 在 §10.2 里没有主人**：PRD v1.4 把 F-5 提成 P0（27 条 DoD 之一），但技术设计 §10.2 全文 grep `R-41` **0 命中**，且 §5 的"本期明确不做"表（`02-tech-design.md:623`）仍写着"不动 `assessment_cache`（P1 R-28）"、`:397` 写着 `trpc/routers/assessment.ts` "**本期不再改**"。⇒ DoD 与排班表直接冲突，且这条与我的 R-05 是**同一条属主隔离规则**（我在 `search-history-service.ts:8-11` 显式引它为同口径）。请裁决 owner 与时点（我判断落点 = T-06 的 `ADD COLUMN user_id ... DEFAULT NULL` + 一处 service 收敛，"只加不改不删"） | **必须拍板**（否则 Phase 5 会判 R-41 无人交付） | TPM → 建议 T-06 微轮 |
| **P-10** | 移交（不改代码只登记）：`profile.changePassword` 的**前端调用点**仍在 `apps\web\src\app\(user)\profile\page.tsx:75,286`，A-30-3 后它会稳定收到「请输入当前密码」⇒ **T-15 必须切 `auth.changePassword` 并补 `oldPassword`**（§3-4）。这是裁决的预期效果，不是缺陷 | 已写进 §3-4 | T-15（批次 4） |
| **P-11（观察）** | 本轮未观察到他任务撞车；`chat-isolation`/`profile-dto` 的临时库都在 `os.tmpdir()/tm-t11-*`，`afterAll` 里 `fs.rmSync(force:true)`。T-09 报告 §3 记录过 Windows `EBUSY` 偶发红，本轮 4 次跑测**未复现** | 记录 | — |
| **P-12（观察）** | `data.stack` 出现在 tRPC 错误体里（本机 dev）。生产构建 `NODE_ENV=production` 由 tRPC 自身去掉；若 T-22 的镜像不显式设，请让 CI 断言一次错误体不含绝对路径 | 低优先 | T-22 |

---

## 10. 给 Phase 5 测试工程师的提示（复跑指引 + 我没覆盖到的路径）

1. **必用调用法**（§4-8）：单跑用 `pnpm --filter @tm/server exec vitest run --root ../.. --project @tm/server <pattern>`。
2. **P-1 的 30 秒真 HTTP 复现法**（我因禁触 `app.ts`/真库未跑，请 QA 跑并记为缺陷或缺陷关闭证据）：
   `pnpm db:migrate && SQLITE_PATH=<仓库外临时路径> pnpm --filter @tm/server dev` →
   `curl -X PUT localhost:PORT/api/profile -H "authorization: Bearer <token>" -H "content-type: application/json" -d @body.json`，其中 `body.json` = `{"avatar":"data:image/jpeg;base64,<200KB 图的 base64>"}`。
   **预期**：现状 `413 {"error":"请求体过大"}`；P-1 落地后 `200 {"ok":true}`；把图放大到 301KB 则 `400 {"error":"图片太大，请换一张 300KB 以内的","code":"AVATAR_TOO_LARGE"}`。**只要拿到 413 就说明 U-1 还没修**，别按"头像失败"另立缺陷（同一条根因）。
3. **重点测哪里**：(a) 头像三面（REST PUT / tRPC update / POST /api/avatar）的**同一条人话 + 同一个码 + 同一个 http** 在真装配下是否仍成立；(b) `PUT /api/profile` 的 `avatar:""` 清空 + 刷新后两侧一致（R-04④"5 秒内一致"的服务端半，前端半归 T-15）；(c) 存量 300_000 字符老 base64 头像**仍显示**（我只测了 `profiles.avatar` 直插，未测真实旧客户端渲染）；(d) WS 的 4403/4401 在**真浏览器 WebSocket**里是否被前端正确分支（我的用例是 Node `ws`）。
4. **我明确没测到的**：真 LLM 网关（§6-U-10）、`search-history` 的任何落库（本期无表，§6-U-6）、pg 全部（§7）、`app.ts` 生产装配链路（§6-U-1/2/3）、`avatarUnifiedLimit` 经 `feature_flags` 表 + 30s TTL 的**跨进程生效计时**（该能力属 T-07 的 `feature-flags`，我的开关用例是测试注入；§4.4.4 的 ≤60 秒判定请在词本那条用例旁对照复跑）。
5. **别把这三条当缺陷**（都是裁决的结果）：`profile.changePassword` 现在稳定失败（A-30-3）；`profile.update` 的 avatar 无字符上限（A-30-2）；`chat.history` 的 tRPC 出参没有 `checkpointKey/legacy`（`trpc\routers\chat.ts:11-13` 的基线避 diff 决定）。
6. **trpc-shape 基线**：唯一红且属 A-28-1 出口轮欠账。**不要**跑 `TRPC_SHAPE_UPDATE=1`。P-5 那条"基线看不见 output"请单独记，别与这条红合并。
7. `packages\server\test\trpc-shape.baseline.json` 与两个 `.db`（仓库根 `data.db` 253952 B / mtime 09-18 04:05、`packages\server\data.db` 0 B / mtime 09-17）本轮**只读未写**；所有测试落在 `os.tmpdir()` 并已清理。

---

## 附：本轮红线自查（可逐条复核）

| 红线 | 自查结果 |
|---|---|
| 任何 git 写操作 | **零**。本轮只跑过 `git status --porcelain -- <paths>`（只读，用于 §6-U-5 与 §1 的 🆕/✏️ 判定）与文件读取 |
| 可写面 | 只有 `.delivery\04-dev-report-T-11.md`。工作区他人未提交改动（T-07/T-09/T-20/T-12…）**未清理、未还原、未代修** |
| 代码改动 | **本轮零改动**。可核对：`services\profile-service.ts` mtime 23:13:05、`services\avatar-service.ts` 23:12:29、`routes\avatar.ts` 23:12:44、`routes\chat.ts` 22:15:14、`threaded.ts` 21:26:55、两个 spec 23:24:47 / 23:26:46，全部早于本轮首次取证（23:41:26） |
| `packages/**`、`apps/**`、`tools/**`、`*.db` | 未触碰未修改（测试用 `os.tmpdir()`） |
| 仓库根 `data.db` / `packages\server\data.db` 写操作或迁移 | **零**；只 `stat` 过 mtime/大小（§10 第 7 条）。未起真服正是为了不在它们上落任何写 |
| `TRPC_SHAPE_UPDATE=1` / 改基线 | **未跑、未改** |
| 放宽规则 / 删断言 / 加例外 / 改 `tools\ownership.json`、`tools\exceptions.json` | **零**。唯一 skip 是 §6-U-4，且它是第三轮就带着失败原文与原因的 skip，本轮以行号复核后**维持原状、断言未动** |
| 冒烟输出真实性 | §4 全部来自本轮 23:41:26–23:49:02 的真实 stdout/stderr；跑不出来的（真装配 413、pg）明确写"未跑通 + 原因 + 复现法"（§6-U-1、§7、§10-2） |
| 新建依赖 / 新建表 / 新建列 / 新建 DB 方法 | **零**（§1 末段：只用了 T-06 既有的 `findCredentialsById` 与 `profiles.update`；Q4/§6.1 的"不迁对象存储、不迁移裸 threadId 行、不加 `search_history` 表"三条全部遵守） |
