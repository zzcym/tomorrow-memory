# 技术设计文档修订说明 · fix2（架构师第二轮文档轮，本轮零代码）

- 对象：`.delivery/02-tech-design.md`（**只就地追加 / 就地更正**，被改内容一律保留 `~~原文~~` + 裁决号戳，**无一行删除**；本轮共 15 次编辑，全部集中在下列六项 + 头部版本戳）
- 触发输入：`01-prd.md` **v1.5**（27 条 P0 不变 + `R-42` 入 P1 backlog）、`01-prd-fix2.md` **§0 三处定稿**与 **§2 交回 TPM 的四项**、`04-adjudications.md` 的 **A-33-1（常设通道）/ A-33-8 / A-34-1 / A-35-1⑤ / A-35-3 / A-35-4 / A-35-5 / A-35-6 / A-35-9**
- 版本戳：本文档头部 `v1.0-fix1（PRD v1.4）` → 就地追加 `v1.0-fix2（PRD v1.5）`（原戳与 fix1 戳均保留，见 `:3`）；`:4` 的"输入"行同步打戳（v1.4/A-33 列表划掉、加 v1.5 + A-34/A-35 全套 + fix2 输入）
- 未动的东西：`packages/**`、`apps/**`、`mobile-memory/**`、`tools/**` **一行未改**（本轮只读，只用于取证）；`01-prd.md` / `01-prd-fix2.md` / `03-ui-spec.md` / `04-adjudications.md` **均未改**（裁决号由 TPM 出，文档由各自 owner 写）；`packages/server/test/trpc-shape.baseline.json` **未再生**（那是出口 E3 名下，A-35 第 14 项）；**未执行任何 git 写操作**

---

## 一、六项改动各自落在哪一节 + 依哪个裁决号

> 行号 = fix2 落地后的当前行号（原文因追加而下移；A-35-6 里 TPM 引用时的 `02-tech-design.md:947` 现对应 `:976`）。

| # | 裁决号 | 一句话改动 | 落点（现行号） |
|---|---|---|---|
| ① | **A-34-1 / A-35-1⑤** | passthrough 挂 `output` parser 等于没挂（索引签名压过声明键 ⇒ `inferRouterOutputs` 仍 `unknown`），必须写"怎么挂"的四条硬要求；并把 F-7 的"本期普遍不补 parser"更正为现行口径 | **新增 §3.3.2**（`:343-357`，插在 §3.3.1 之后）＋ §4.2 规则 2 追加实现前提指针（`:434`）＋ §11 **F-7** 就地更正（`:978`）＋ §11 末句"三件事"更正为两件（`:991`） |
| ② | **A-35-4** | `pull?since=` 增量分支本期不做：409/墓碑压缩就地打戳为下一期，"本期恒回全量快照"写成显式契约；`since`/`version` 命名口径记为唯一口径且本期两个键名都不改 | §4.4.1 代码块两行打戳（`:464`、`:465`）＋ 新增「**【fix2 · A-35-4】本期显式契约**」五条（`:471-477`）＋ §4.4.2「压缩窗口」行就地限定（`:487`） |
| ③ | **A-35-5** | 走 (b) 案：明写"§6.4-2 步 5c 与其下游三次演练 + §8.3-D 第 24 项必须排在 T-25 合入之后"，附 A-33-2 硬时序链与 `exit 1` 不降级 | §10.4 **第 9 行**末格就地追加（`:960`） |
| ④ | **A-35-6** | F-5 行的禁词旧句就地划掉，唯一口径改为指向 PRD §6.6-4 第 6 条 + 定稿新句；补"取词纪律"与 grep 门禁归属 | §11 **F-5** 末格（`:976`） |
| ⑤ | **A-35-9** | "双门面错误码逐字相同"就地补限定：**仅限两侧真到达同一 service 出口的码**；`rating` 一支改判据（`httpStatus` 等值 + 钉两侧各自码 + 零写入），并说明为何不换 preprocess 版 `RatingSchema` | §4.6 错误码表后新增限定段（`:538`）＋ §10.2 **T-10 判据③** 就地补同一限定（`:894`） |
| ⑥ | **A-33-8** | T-20 判据③"在 diff 中可见"字面必然为假 → 改措辞为"在源码与 APK 产物中生效，且有构建期机检（缺失即 fail）"，三条证据口径 + 严禁无意义重排 | §10.2 **T-20 判据③** 就地更正（`:897`） |

### 各项要点（避免下游只读表格漏掉关键约束）

**(1) §3.3.2 的四条硬要求**（`:347-352`，凡给 `@tm/server` 的 tRPC procedure 挂 `output` 都适用，不分批次）：
1. **必须闭合**——`unknownKeys='strip'` 的 `z.object({...})`；禁 `.passthrough()`，禁 `.extend()` 一个带 passthrough 的 schema（`extend` 会连索引签名一起继承 ⇒ 等于没挂）。
2. **复用 `.shape` 不抄第二份形状**——`z.object({ ...DtoSchema.shape, … })`；正例 = `packages/server/src/trpc/routers/profile.ts:60-68`（8 个契约键全来自 `ProfileDtoSchema.shape`），挂载点 `:125-127`。
3. **必须配"键集合钉"用例 + 疫苗**——真实输出 key 集合 ⊆ 声明键集合（默认态要求全等）、新增键未声明即红；样板 = `packages/server/test/integration/profile-output-parser.spec.ts:256-312`（四支）。理由：passthrough→闭合会把"未知键静默存活"换成"未知键静默丢弃"，不钉就是假绿（A-19 / A-28-2）。
4. **REST 侧 passthrough 一律不动**——未知键存活是 T-06 事务内 RMW 的既有语义（`contracts/wordbook.ts:4`/`:29` 已把它写成契约）。
配套口径也写进同一小节：第一批 = `profile.get`（已落地，`page.tsx:92` 改读 canonical `daily_goal` = A-35-1③）；**`dailyGoal` 只能是 `optional`**（`PROFILE_DTO_LEGACY_ALIAS=off` 时两门面同时停发）；**没有 DTO 的过程先回 shared 定契约**（owner T-03 + §10.4 登记交接），禁止在 router 里发明形状、禁止客户端 `as number` 糊 `unknown`；基线 `output: null → <Schema>` 属"只增"（A-34-1③ / A-35-1④），核对归 E3。
**F-7 的更正**：`~~本期不动实现~~` / `~~补 output parser 属下一期~~` 均已划掉，新口径 = "凡 shared 已有 DTO 且已有双侧 `safeParse` 用例的过程必须挂闭合 output parser"；同时补了范围修正——基线 22 条 procedure 的 `output` 轴**今天仍全为 `null`**（E3 未再生），所以 F-7 说的"零覆盖"是**基线文件**的覆盖、不是实现的覆盖，适用范围已缩小为"除 profile 系之外"。

**(2) §4.4.1 的本期契约**：`GET /api/wordbook/pull` 本期只有一种响应形状 = `WordbookPullResult`，`?since=` 接受但完全不参与判定。仓内实证 `packages/server/src/routes/wordbook.ts:84-88`（注释原文含"见报告偏差 D-3"）与 `wordbook-service.ts:342-345`。命名口径：请求侧 `since` = 游标、响应侧 `version` = 状态，本期两键名都不改（PRD §6.2 第 3 项定稿、A-35-3 追认）。
> ⚠ 这一项我按裁决字面**只降级了 pull 的增量分支**：push 侧 409 `WORDBOOK_STALE` + `pruned:true` 本期已实现并有绿用例钉住，故显式写了"不在降级范围内"一条（详见下方 §四-1，需 TPM 确认这个精确化）。

**(5) §4.6 / T-10 判据③ 的限定**：`review-parity.spec.ts:280-309`（越界 rating：tRPC 侧 zod 先拦 → 协议码 `BAD_REQUEST`，REST 侧 400 + `INVALID_RATING`）承担"等值 = httpStatus"；真到同一 service 的两支仍要求 code 逐字相同（同文件 `:569-680` 组，`:570` 重复撤销 409 `NOTHING_TO_UNDO`、`:605` 非法词形 400 `INVALID_WORD`）。

---

## 二、裁决依据一览

| 改动 | 依据 |
|---|---|
| §3.3.2 四条硬要求 + F-7 措辞更正 | **A-34-1**（挂 parser 的原始立论）被 **A-35-1** 实测修正：`objectOutputType<…, "passthrough">` + `inferRouterOutputs<AppRouter>['profile']['get']['dailyGoal'] → TS2322 unknown`（TPM 双面探针，临时文件已删，非本轮所跑）；**A-35-1①②③④⑤** 五子项各自对应我文档里的一条要求；A-28-1 / A-30-2（只增不改）、A-34-1⑤（禁客户端 cast） |
| §4.4.1 本期显式契约 + §4.4.2 限定 | **A-35-4**（"以现状为准"，理由 ①补实现要在出口前引入新破坏性形状面 ②D-3 已登记）、**A-35-3**（`since`/`version` 命名与 `INVALID_WORDBOOK_ENTRY` 一条码不拆）、PRD v1.5 §6.2 第 3 项 |
| §10.4 第 9 行时序句 | **A-35-5**（选 (b)）、**A-33-2**（(a) 案被文件不相交硬判据否决 + 硬时序链）、PRD v1.5 §6.4-2 步 5c/6b/7、§8.3-D 第 24 项 |
| F-5 措辞 | **A-35-6**（PM-1）+ PRD §6.6-4 第 6 条（禁词清单与定稿句所在）+ **A-33-3①**（RK-14 代价接受条件之一：release notes 不得出现旧写法） |
| §4.6 / T-10 判据③ 限定 | **A-35-9**（T-10r3 §2.5 认账改判据）+ **A-33-6**（N-2 原判据措辞）+ **A-28-1**、**A-28-5**（入参域不对称保留现状 ⇒ 不换 `RatingSchema`） |
| T-20 判据③ 措辞 | **A-33-8**（含"严禁为了让 diff 看得见去重排那一行"） |
| 通道本身 | **A-33-1**（由开发报告触发的 §10.2/§10.3/§10.4 口径变更 = 架构师实写、TPM 出裁决号；三条硬约束：零删除、`~~原文~~`+裁决号戳、本轮不碰代码） |

---

## 三、仓内取证（本轮只读，行号 = 本轮实读）

- **出参 parser**：`packages/shared/src/contracts/profile.ts:45-57`（`ProfileDtoSchema = z.object({…}).passthrough()`，另 `:76` 第二处 passthrough）；`packages/server/src/trpc/routers/profile.ts:36-58`（根因注释）、`:60-68`（闭合 `ProfileGetOutputSchema`）、`:125-127`（`.output(…)` 挂载点）；`packages/server/test/integration/profile-output-parser.spec.ts` 六组 describe（`:147` 判据一 / `:197` 判据二 / `:256-312` 键集合钉四支 / `:314-390` 形状只增不改 / `:392-419` tsc 类型面）；`packages/server/test/integration/profile-dto.spec.ts:183-196`（判据① key 集合全等 + 双侧 `safeParse`）；`apps/web/src/app/(user)/profile/page.tsx:92`（已读 `daily_goal`）。
- **基线出参面**：`packages/server/test/trpc-shape.baseline.json:7060-7083` 是 `profile.get` 条目，`"output": null` 在 `:7065`；本轮用脚本读全文件计数 = **22 条 procedure，22 条 `output` 为 `null`**（E3 未再生 ⇒ 基线的出参轴仍全盲）。
- **词本 pull 现状**：`packages/server/src/routes/wordbook.ts:84-88`（注释 + `svc.snapshot()`）、`packages/server/src/services/wordbook-service.ts:342-345`（`snapshot()` = 全量 + 当前 version）；`packages/shared/src/contracts/wordbook.ts:68-73`（`WordbookPullResultSchema` 只有全量形状）；CAS/409/pruned 已实现：`packages/server/src/db/sqlite.ts:377`、`wordbook-service.ts:67`、`:409`（`isPruned(baseVersion, fresh.tombstones)`）、`packages/server/test/contract/legacy-apk.spec.ts:909-956`；`packages/server/src/trpc/routers/wordbook.ts:17-19`（**本期不新增** `wordbook.push`/`wordbook.pull` 的理由）。
- **双门面码**：`packages/shared/src/contracts/rating.ts:15-20`（`RatingLiteralSchema`）、`:30-33`（preprocess `RatingSchema`）；`packages/server/src/trpc/routers/review.ts:18-21`（input 用 literal 版）；`packages/server/test/integration/review-parity.spec.ts:280-309`、`:569-680`（含 `:570`、`:605` 两支逐字等值）。
- **DOM storage**：`mobile-memory/src/com/tomorrow/memory/MainActivity.java:30`（源码侧唯一命中）；`mobile-memory/build-apk.sh:189-194`（`check_dom_storage()`，`:192` grep 源文件、`:193` fail 即中止），调用点 `:217`（dry-run）与 `:236`（正式构建）。
- **诚实标注（本轮未跑的）**：`pnpm --filter @tm/web typecheck`、`pnpm --filter @tm/server test`、`bash mobile-memory/build-apk.sh`（干净克隆）、机检疫苗 —— 均为**判据要求 dev 侧下一轮提交的证据**，本轮只引用 TPM/A-35-1#1 已实测的结论与只读取到的源码事实，没有代跑。

---

## 四、交回 TPM / PM / 用户（架构师一侧不改的东西）

1. **A-35-4 的降级范围需要精确化（我按字面只降级 pull）**：裁决原话含"§4.4.1 的 409/墓碑压缩就地打戳为下一期"，但实读显示 **push 侧的 409 `WORDBOOK_STALE` + `pruned:true` 本期已实现且已有绿用例**（取证见上节），真正没实现的只有"pull 按 `since` 返回增量"。我在 §4.4.1 里写了"push 侧不在降级范围内"一条，避免下游把整节读成下一期、进而**删掉现存能力**。**若 TPM 实际想让 push 409 也下一期，请另出裁决**（那是撤实现，不是文档降级）。
2. **§4.4.1 顶行的门面标注与仓内不符**：该行把 `pull` 标成 "tRPC `wordbook.pull`"，但本期**不存在** `wordbook.push` / `wordbook.pull` 两个 procedure（`trpc/routers/wordbook.ts:17-19` 的理由 = 基线含 caller 清单，加过程即改形，非该任务权限）。我没有改这一顶行的标注（改它等于给 T-09 之外的任务开范围），只在本节登记。**归 T-09 批次4** 接线时收口：要么把顶行改标"REST 两端点"，要么随 E3 一起申请基线再生。
3. **shared 注释与 PM 定稿冲突（一行文本）**：`packages/shared/src/contracts/wordbook.ts:67` 写的是 `GET /api/wordbook/pull?version=`，与定稿的"请求侧 `since`"不一致，同一行还提到不存在的 `wordbook.pull`。**属代码注释，本轮架构师零改动**，请派 **T-03 或 T-09** 微轮（一行注释、无行为变更）。
4. **F-5 的禁词残留只存在于 `~~…~~` 内**：A-33-1 的零删除规则要求保留原文，所以那一处旧串物理上还在文档里。我已在 F-5 格内明写"该处是保留痕迹、不构成可取词的正文"，并把禁词清单改为**指向 PRD §6.6-4 第 6 条**（不复述字面）。本轮复核全文：该旧串在 `02-tech-design.md` 内**仅剩 `:976` 删除线区段那一处**（本文件不复述、也不含该串；§4.4.1 另有一句讲的是新旧 App 交叉使用，与测评无关）。**需要 TPM 定 grep 门禁的扫描面**：A-35-6 说的是 `08-release-notes.md`（owner T-21/T-24，我已按此写进判据指针）；若还要扫 `.delivery/**` 自身，则与零删除规则直接冲突，需要显式裁决优先级（建议：`.delivery/**` 只扫非删除线区段，或干脆排除本目录）。
5. **E3 仍未再生基线 → 出参审计面仍盲**：`trpc-shape.baseline.json` 22/22 `output: null`，`profile.get` 的闭合 parser 在基线里不可见，A-34-1③/A-35-1④ 的"从盲变可见"核对尚未发生（任务 #26 仍 pending）。F-7 已写明"架构师本轮未动基线"，**请催 E3**，否则批次4 任何人给 procedure 挂 parser 都会撞同一个基线红。
6. **"凡 shared 已有 DTO 的过程挂闭合 parser"目前只有硬要求、没有 §10.2 的可勾判据行**：A-35-1⑤ 只让我更正措辞，我未自行给 §10.2 新增任务行（避免替 TPM 排班）。若要把这条变成批次4 某任务（建议 T-08 或 T-13）的验收判据，请出号，我再落一行。
7. **PRD 侧仍欠一条 F-8**（§6.4-2 缺"部署/起服前先 `pnpm db:migrate`"）与 **F-9**（R-41② 假设的测评 REST 入口不存在）——fix1 §三已交，PRD v1.5 只回收了第 24 项与步 6b 三条 `ADD COLUMN`，这两条我未重复登记，仅提醒仍开着。
8. **A-35-7 的 `03-ui-spec.md` §6.4 旧串** 属 UI 设计师名下，本轮我一行未动。
9. **文本安全自证**：本轮两份产物的新增文本**未引入**构建机绝对路径字面量与 keystore 口令明文（本文件按纪律**也不复述那两个字符串本身**）。技术设计里唯一相关的位置是 §10.2 T-20 判据②（`:897`），它是 fix1 之前就在的**否定式判据**（"脚本内**无**该路径与明文口令，grep 0 命中，B-08"），本轮按零删除规则原样保留、未复制其字面量到任何新位置。

---

## 五、需要 TPM 拍板的问题

1. §四-1（A-35-4 降级范围精确化）与 §四-4（禁词 grep 的扫描面是否含 `.delivery/**`）——**只有这两条会反过来改我本轮的写法**，其余六项均已按裁决落地。
2. §四-2 / §四-3 的两处"文档 vs 代码"不一致，是否随 T-09 批次4 一次收口（我倾向是：两处都在同一批文件里）。
3. §四-6 是否给"闭合 output parser"在 §10.2 增一条可勾判据（若不给，本条只能靠 §3.3.2 的规范约束 + `--check-ownership` 之外的 reviewer 肉眼）。

---

## 六、边界自证

- 改动文件 = `.delivery/02-tech-design.md`（就地 15 次编辑）＋ 本文件，**两者之外零写入**。
- **零删除**：所有被推翻的原文均以 `~~…~~` + 裁决号戳保留（头部版本戳、§4.4.1 增量分支、§4.4.2 压缩窗口、F-5 旧句、F-7 三处旧口径、T-10 判据③、T-20 判据③、§11 末句）。
- 表格完整性已校验：本轮编辑过的 6 个表格行单元数与表头分隔行一致（`:487`、`:894`、`:960`、`:976`、`:978`；`:897` 多出的一个 `|` 是 fix1 前就有的转义命令 `\| grep`，非新列）。
- 未重开任何已裁项：T-25 批次归属（A-33-2）、RK-14 代价（A-33-3）、CSP / ORM（F-2 / F-3）本轮一律沿用现状；无"新证据要求翻案"事项。
- 未执行任何 git 写操作；工作区既有的未提交改动（属其他角色）未清理、未还原。
