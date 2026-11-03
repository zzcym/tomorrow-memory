# 01-prd-fix5 —— PM 第 6 轮文案定稿（PM-fix6，批次 4D）

> 范围：只做两件定稿（收藏侧写失败串 / 通用「入参非法」码）。本文件是裁决定稿件；`01-prd.md`、`03-ui-spec.md` 由 TPM 下一轮就地打戳，本轮一字未改。禁词复检依据：PRD §8.3-D 硬零禁词表 + R-19 ⑤（`01-prd.md:212`，App 不再出现"云端/本地/未接入"式内部术语）+ §5.4-1 判据③（`01-prd.md:516`，禁词 0 命中、不含内部术语）；字符上限口径按 §5.4-4（`01-prd.md:534-536`：本期用户可见面唯一上限是词名 ≤64，对 toast/错误文案不设长度门禁），两句定稿串均不触任何禁词、均在口径内。

## 一、收藏（加星）写失败定稿串 —— 采纳建议方向，原样定稿

**结论（唯一取值）**：`这条没能记下，再点一次试试`
**否决项（必须写明）**：`04-adjudications.md:595`（A-49 #120）建议的 `这条先记在手机上了，联网后会自动放进单词本` **不采纳** —— 收藏侧失败的事实是"这条没进队列"（`apps/app/src/components/result-row.tsx:512` 注释原文），**不存在联网后补传**，"会自动放进"是删除侧（§3.6.5-7 可重试列=自动补传，`03-ui-spec.md:846`）才有的承诺，搬到收藏侧即谎报，违反 §6.6 人话原则（同类判例：A-43 #77，`04-adjudications.md:518`"承诺失真=对用户说谎"）。

**理由**：与删除侧同族而诚实 —— 短句起手"这条"、只说已发生的事实（没记下）+ 给一个立刻可做的动作（再点一次）；星标未落（`result-row.tsx:513-514` catch 里 `mark` 不执行），"再点一次"与真实可重试性逐字一致；不含「云端/本地/缓存/未接入/token/数据源」及任何自动承诺。

**新增 §3.6.5 行（插在第 7 行 `03-ui-spec.md:846` 之后，作为第 8 行）**：

| 情形 | 视觉 | 定稿文案 | 可重试 |
|---|---|---|---|
| 加星写失败（离线） | 星标不落 + toast（形态同第 7 行，`tone: error`） | `这条没能记下，再点一次试试`（**不出现"云端/本地/缓存"**；**不得**写成任何"会自动…"式承诺） | 手动（再点星标）；**无自动补传** |

**落地位置**：🆕 `packages/shared/src/constants/copy.ts` → `WORDBOOK_COPY.favoriteNotSaved`（与 A-48 #114 上交shared 的 `deleteNotQueued`、`glossPending` 同轮同文件落地，即 T-03r2 合并批次，`04-adjudications.md:584/:595`）；✏️ `apps/app/src/components/result-row.tsx:513` 改引它；App 侧不留第二份字面（`wordbook-toolbar.tsx:71` 的宿主改 import 归 #114 已派范围）。

**反向哨**：① 不得覆盖/改写 §3.6.5-7 删除串及其行（含"自动补传"列）；② 不得用于取消收藏失败路径（`result-row.tsx:476-480` 的 `drop` 仍引 `deleteNotQueued`）；③ 不得覆盖 `syncBadge.replayFail`（A-48 #114 明文禁止，`startup.spec.ts:238` 钉链）；④ 失败分支不得顺带发出成功串 `已放进单词本`（`LOOKUP_COPY.favoriteToast`）或 `glossPending` 两串。

## 二、通用「入参非法」错误码 —— 定名 INVALID_PARAMETER，进 supplement

**结论（唯一取值）**：码名 `INVALID_PARAMETER`，`http: 400`，人话文案 **`这个页面有点问题，刷新后再试一次`**。
归属：**`TM_ERRORS_SUPPLEMENT` 纯追加**，**不进主表**——§4.6 三个冻结集合（`TM_ERRORS` / `TM_ERROR_CODES` / `TM_ERROR_ROWS`）一字不动是 A-8 硬约束，追加通道唯一（`packages/shared/src/constants/errors.ts:212-213/:234-238` 已有 `INVALID_WORDBOOK_ENTRY` 同型先例，`from` 标 `PM-fix6 / T-26a 缺码回环`）。

**理由**：① 命名与既有 `INVALID_RATING / INVALID_MODE / INVALID_WORD / INVALID_WORDBOOK_ENTRY`（errors.ts:217-238）同族同风格；② 服务端现状是临时借用 `WORDBOOK_TOO_LARGE` 文案（`packages/server/src/routes/analyst.ts:37-43` 自注），语义错位（词本超限 ≠ 参数非法），且该自注明言"复用现成码是过渡、禁止自创码"；③ 文案不点字段名（period→"页面"）、不含"参数/请求/HTTP/接口/数据源"等内部术语，"刷新后再试一次"对 Web 刷新与 App 下拉刷新/重进页面同时成立；未采 PM 备选"这个链接有点问题"，因 App 用户无"链接"心智。

**「缺码即走回环」口径（`02-tech-design.md:919` T-25 行）**：**原句不更正**——本条恰是该回环第一次完整跑通的判例（T-26a 不自造码→上报→PM 定稿→T-03 加码）。但在 PRD 打戳时同段**补一句**（不改原句）：借文案属**一次性过渡豁免**，`INVALID_PARAMETER` 登记生效后 `analyst.ts` 必须换引，该豁免不得被引用为"再借别的码"的先例；`errors.ts:231-232`"在拆码之前本条覆盖两种成因"的既有先例同理不外推。

**落地位置**：✏️ `packages/shared/src/constants/errors.ts` → `TM_ERRORS_SUPPLEMENT.INVALID_PARAMETER`；✏️ `packages/server/src/routes/analyst.ts` 两处 400 出口（:99 起 `periodOf` 判 NULL 的分支）改回 `INVALID_PARAMETER` + 该码文案；`contracts.spec.ts` 对 supplement 键集合的钉（errors.ts:191-192 注释所指）按只增同步。

**反向哨**：① 通用串不得回灌覆盖任何具体域 400 文案（`INVALID_WORDBOOK_ENTRY` 模板串、复习域三条 `INVALID_*` 模板串、§5.4-2 词名超限句）；② `WORDBOOK_TOO_LARGE` 本码的字面与词本超限真实出口不受影响，只断掉 analyst 侧引用；③ 不得因有"通用码"把 403 场景改判 400（`FORBIDDEN`＝§5.4-1 定稿"这份内容不属于当前账号"，一字不动）；④ 本码不进 §4.6 快照面、不触发基线重排。

## TPM 待办

1. **打戳**：`03-ui-spec.md` §3.6.5 表第 7 行后插入本文第一节新行；`01-prd.md` §5.4 追加两条定稿引用（新串 + `INVALID_PARAMETER`），并在 §4.6 口径处补"一次性过渡豁免"同段一句（第二节所引，不改原句）。
2. **派 T-03r2（合并批次，一次 shared 改动）**：`copy.ts` 两旧串 + `favoriteNotSaved` 新串 + `errors.ts` 追加 `INVALID_PARAMETER` + `result-row.tsx:513` 改引 + `contracts.spec.ts` 键集只增同步；同轮派服务端微轮把 `analyst.ts` 换引并改写 :37-43 自注。
3. **QA 哨兵入库**：全仓 grep `会自动放进` = 0、`参数`/`接口`/`HTTP` 出现在用户可见文案 = 0、`INVALID_PARAMETER` 在三个冻结集合 = 0；§8.3-D 禁词表对两句新串跑 0 命中断言。
