# 明日日程 v2 · 独立测试报告 R4(第四轮 · 最终验证)

> 测试人:独立测试工程师 · 日期:2026-09-07(第四轮)
> 方式:静态全量复审(assets/app.js、core.js、mock-bridge.js、src/com/tomorrow/agenda/*.java、AndroidManifest.xml、tests/core.test.mjs)+ node 行为实测 + 单测运行 + r4 截图逐像素核查 + APK dex 字符串核验。本轮未修改任何代码。
> 输入基线:TEST-REPORT-R3.md(R3-A/B/C/D)、DEV-TEST-NOTES.md 第四轮记录。
> 构建一致性:全部源码 ≤ 03:48:41(MainActivity.java)< build/classes 03:48:57 < 明日日程.apk 03:49:00 < r4 截图 03:50:52;dex 中确认含 voiceToken/pendingDeepLink/onPageFinished 字符串——**发布的 APK 确实包含第四轮修复(连同本轮引入的缺陷,见 V1)**。

---

## 一、总结论:**暂缓发布(不满足"零遗留")**

- R3 四项:R3-A **修复成立**、R3-B **核心逻辑成立**(但视图层引入 V2 回归)、R3-C **机制实现正确但引入 V1 回归(深链全路径失效)**、R3-D **部分完成**(周二延续日 chip 仍无截图证据)。
- 新发现:**1 个 P1(V1,深链格式失配,已修复过的 N2 被再次破坏)+ 1 个 P2(V2,午夜结束单日事件从 24h 轴退回全天条)+ 1 项证据缺口(V3,P3 级)**。
- 语音 token 链路的清理/空串/竞态专项检查、cont×Scheduler、removeExtra 时序:**均通过**,未发现其他新问题。
- 单测 **64/64 通过**(R3 为 63);但 V1/V2 均落在单测未覆盖的层(Java 格式契约、视图层真值判断),再次印证"边界形态需要显式用例锚定"。

---

## 二、R3 四项核对表

| # | 状态 | 依据(文件:行号)与核验说明 |
|---|---|---|
| R3-A | ✅ **修复成立** | JS:app.js:649 `S.voice.token='v'+Date.now()`(每次点击说话新生成)、655 `B().startVoice(preferCloud, S.voice.token)`、639 closeVoiceOverlay 置 token=null;三个回调守卫 app.js:685/701/711 `if (!token \|\| token !== S.voice.token) return;`(首参 token 比对)。原生:MainActivity.java:303-304 startVoice 存 voiceToken、:509 volatile 字段、:511-514/:516-520/:522-527 三个回调全部回带 voiceToken(result/error 后清空 :519/:526)。mock-bridge.js:74-80 同构回带 ✅。node 复核"取消→1s 内重开→迟到回调"场景:迟到回调 token 为空串或旧 token,均被守卫丢弃 ✅ |
| R3-B | ✅ **修复成立**(副作用见 V2) | core.js:56-64 crossDayEnds 返回延续日列表:`last = end.endsWith(' 00:00') ? addDays(ed,-1) : ed`,恰在 00:00 结束=占满前一天;Occ.java:68-77 同规则。node 实测:09-07 20:00→09-12 00:00 产出延续日 09-08/09-09/09-10/09-11(09-12 无)✅;23:30→次日 00:00 无延续日 ✅。周视图全天条同步:app.js:434(全天含 cont + 跨天 timed 进周全天条)、448(不进 24h 轴)✅。单测 tests/core.test.mjs:144-159 覆盖多天到午夜(mid2)与一晚到午夜(mid)|
| R3-C | ⚠ **机制正确,但引入 V1 回归** | MainActivity.java:58-64 WebViewClient.onPageFinished → pageReady=true + dispatchPendingDeepLink;:83-84 pageReady/pendingDeepLink 字段;:87-96 maybeDispatchDeepLink(页面未就绪→缓存 pendingDeepLink,就绪→直接派发);:98-103 派发前先清 pendingDeepLink(防 onPageFinished 重复触发双派发)。时序推演:冷启动 onCreate→onResume(缓存)→onPageFinished(派发)✅;热启动 pageReady 已 true→直接派发 ✅;removeExtra 在缓存/派发分流前执行、恰好一次 ✅;Manifest launchMode=standard→点通知必建新实例,onCreate/onResume 必走,getIntent 携带 extras ✅。**但 :89 校验正则改为 `\\d{4}\\d{2}\\d{2}`(无连字符),与 AlarmReceiver.java:53 发出的 `substring(0,10)`="2026-09-07"(带连字符)失配→校验恒失败→深链全路径(冷/热)静默丢弃**,详见 §三 V1 |
| R3-D | 🟡 **部分完成** | r4_crossday_new_chip_text.png(03:50:52,晚于 APK 03:49:00,取自最终构建):9月7日全天条清晰显示"通宵项目上线(20:00 至 9月9日 00:00)"新文案,24h 轴内无跨天块 ✅(R3-D 主诉求闭合)。r4_midnight_end_check.png(400×300 双联截图):两侧均为**9月9日·周三**视图(周条 9 深色圈选、7 为今日描边),全天条区域为空 → 仅佐证"周三(无)";**周二"(跨天,进行中)"chip 无任何截图证据**(仅 DOM 断言 + 单测),见 V3。旧 r3 截图未清理(无碍)|

---

## 三、新发现(本轮新增)

**V1 [P1·回归] 深链 openDay 格式失配:通知点击跳转当天功能全路径失效(R3-C 修复引入)**
- 位置:src/com/tomorrow/agenda/MainActivity.java:89 `!day.matches("\\d{4}\\d{2}\\d{2}")`(8 位数字,无连字符)vs src/com/tomorrow/agenda/AlarmReceiver.java:53 `start.substring(0, 10)` = "2026-09-07"(带连字符)。
- 推演+实测:"2026-09-07" 不匹配 `^\d{4}\d{2}\d{2}$`(node 验证)→ maybeDispatchDeepLink 提前 return → removeExtra 都不执行,深链永不派发;冷启动缓存机制(R3-C)随之空转。**R3 已验证生效的 N2 修复被本轮改动回退**;发布 APK 的 dex 中已确认含该无连字符正则字面量。
- 对照:R3 报告 §二 N2 明确记录当时代码为 `day.matches("\\d{4}-\\d{2}-\\d{2}")` 可命中;MainActivity.java 修改时间 03:48:41 落在本轮修复窗口内。mobile-agenda/ 未纳入 git,无法比对提交,以 R3 记录为基线。
- 定级 P1 的理由:核心闭环(点提醒通知→落到当天)完全且静默失效,属"已修复并验证过的缺陷再次破坏"。
- 修复建议(一行):恢复 `\\d{4}-\\d{2}-\\d{2}`;补 1 条 Java 侧格式契约断言或在 DEV-TEST-NOTES 记录两端格式契约,真机/模拟器点一次通知验证。

**V2 [P2·回归] N5 行为退化:23:00→次日 00:00 的单晚事件从 24h 轴退回全天条(R3-B 修复引入)**
- 位置:assets/core.js:62-63——该形态返回**空数组 []**(JS 真值)而非 null;assets/app.js:264-265 以 `Core.crossDayEnds(...)` 真值判断分流 → 该事件进 crossDay chip(全天条),24h 轴为空。node 实测:goesToAlldayChip=1、goesTo24hAxis=0。
- 影响:chip 文案仍含完整时刻"(23:00 至 9月8日 00:00)",信息不丢失但分区错误;R3 曾实测该形态"按 timed 渲染于轴内 ✅",本轮回退。datetime-local 与 LLM 解析均可自然产出该形态,路径可达。周视图同形态(app.js:434/448 按原始日期串比较)在 R2/R3 即进全天条,非本轮新引入,但与 R3-B 新语义("恰在 00:00 结束=占满前一天")相悖,应一并修。
- 修复建议(一行级):core.js 在 `days.length===0` 时返回 null(或 app.js 过滤改为 `.length`),周视图过滤改用 crossDayEnds 口径;补 1 条"单晚到午夜→起始日 timed"视图分区断言。Java 侧无此问题(无视图层真值判断),小组件/提醒不受影响。

**V3 [P3·证据] 周二延续日 chip 仍无截图证据**
- r4_midnight_end_check.png 两联均为周三视图,DEV-TEST-NOTES.md:71 声称的"周二'(跨天,进行)'"仅有 DOM 断言;底层展开逻辑有单测锚定(tests:155-156),风险低。建议随 V1/V2 修复后的 GUI 回归补拍周二视图。

---

## 四、任务指定专项检查结论

1. **voiceToken 清理**:stopVoice(MainActivity.java:328-368)所有出口均经 voiceResultToJs/voiceErrorToJs(两者清空 token);stopVoiceCancel:370-373 与 cancelVoice:376-384 均汇入 cancelVoiceInternal(:387 清空);onDestroy:719-734 未清 voiceToken,但随 Activity 实例销毁,且 speech.destroy() 后无回调,可接受(不计问题)。stopVoice 为同步阻塞桥调用,期间 JS 线程被占,不存在"转写中插入取消"的交错 ✅
2. **token 空串处理**:原生清空后回传 "" → JS 守卫 `!token` 恒丢弃(app.js:685/701/711);S.voice.token 只取 'v'+Date.now() 或 null,永不为 '' → 不存在空==空误匹配 ✅。残留理论竞态:复用的 SpeechRecognizer 实例在重开监听后投递旧结果——框架在 startListening 时丢弃旧会话,窗口极窄,不计缺陷
3. **跨天延续 × Scheduler**:Scheduler.java:56 `optBoolean("allDay")` 跳过,cont 恒 allDay=true 且不带 remindMinutes(core.js:130-137、Occ.java:111-126 双保险)→ 延续日零提醒、起始日照排一次 ✅;新"占满前一天"语义下末日(endDay-1)为 cont 占位,无重复提醒 ✅
4. **deep link removeExtra 时序**:MainActivity.java:90 在分流前移除→每实例至多消费一次,重复 onResume 不重放;dispatchPendingDeepLink(:98-103)先清后发→onPageFinished 多次触发不双派发;校验失败时提前 return 不 removeExtra(仅残留 extra,无行为影响)✅

## 五、单测

`node tests/core.test.mjs` → **64 通过 0 失败**(R3 63 → 64)。新增覆盖"两天到午夜延续 09-08、09-09 当天无"(tests:148、155-156)。未覆盖:深链格式契约(Java)、crossDayEnds 空列表/视图分区(即 V1/V2 所在层);semesterStart 缺省回落仍未锚定(R1 缺口 #1,四轮未补,P3)。

## 六、最终裁定

**暂缓发布。** R3-A/R3-B 核心逻辑修复成立,但本轮修复自身引入 V1(P1,深链全路径失效)与 V2(P2,单晚午夜事件分区错误),"零遗留"不成立。两项均为一行级修复:
1. 修复 V1、V2(各约 1 行)+ 补 2 条断言(格式契约、午夜单日视图分区);
2. 第五轮快速回归:静态复核两处 diff + node 全量 + 补拍周二延续日截图(V3),无需全量重测;
3. 通过后即可发布;R1 §七真机清单(含深链冷/热启动实测)仍为发布后首批事项。

## 七、统计速览

| 类别 | 数量 | 明细 |
|---|---|---|
| R3 修复核对 | 2✅ / 1⚠ / 1🟡 | R3-A ✅、R3-B ✅(含 V2 副作用)、R3-C ⚠(机制✅+V1 回归)、R3-D 🟡 |
| 新发现 P0 / P1 / P2 | 0 / **1** / **1** | V1 深链格式失配(P1·回归)、V2 午夜单日事件分区(P2·回归) |
| 证据缺口 | 1 | V3 周二 cont chip 无截图(P3) |
| 单测 | 64/64 | — |
| 裁定 | 暂缓发布 | V1/V2 修复 + R5 快速回归后放行 |

---

## 第五轮放行验证(2026-09-07 · 独立测试工程师)

> 方式:静态核对两处修复 diff + 端到端格式契约推演 + `node tests/core.test.mjs` 全量 + 抽查 r5 截图 2 张(Read 逐像素)。

### 一、V1/V2 修复核对

| 项 | 状态 | 核对依据 |
|---|---|---|
| V1(P1 深链正则) | ✅ **修复成立** | MainActivity.java:89 已恢复 `!day.matches("\\d{4}-\\d{2}-\\d{2}")`(带连字符)。与发出端格式契约核对:AlarmReceiver.java:53 `start.substring(0, 10)`;Occ.java 展开的 start 恒为 `YYYY-MM-DD HH:mm`(非重复,DT_RE 约束,Occ.java:141-145)或 `day + " " + hh:mm`(重复,dayStr 用 `%04d-%02d-%02d` 零填充,Occ.java:12-14/118/136)→ 截取前 10 位均为 `YYYY-MM-DD`,与正则匹配;汇总通知 openDay=null(AlarmReceiver.java:70/100)不带 extra,不受影响。**两端契约成立,深链路径恢复。** |
| V2(P2 午夜单晚分区) | 🟡 **部分修复(遗留周视图,见下)** | core.js:63 `return days.length ? days : null` —— 空列表返回 null ✅;node 复核 23:00→00:00 返回 null、跨天事件仍正确产出延续日 ✅。app.js:264(crossDay 过滤)与 :265(timed 过滤)真值判断对 null 正确(null=假值,单晚午夜事件留在 24h 轴)✅;core.js:77 `if (contDays)` null 安全 ✅;Java 侧 Occ.java:67-77 同规则(`last = endsWith(" 00:00") ? endDay-1 : endDay`,单晚循环为空无 cont),小组件/明日汇总不受影响 ✅。单测 tests/core.test.mjs:155 已补"跨午夜 1 小时内结束不算跨天"断言 ✅ |

**遗留问题 R5-1 [P2·收窄] 周视图全天条口径未同步(R4 §三 V2 修复建议的后半句未执行)**
- 位置:assets/app.js:434 与 :448 仍用 `o.end.slice(0, 10) > o.day` 原始日期串比较,未按 R4:41-42 的明确要求("应一并修""周视图过滤改用 crossDayEnds 口径")改用 `Core.crossDayEnds`。
- 后果:23:00→次日 00:00 单晚事件在**周视图**仍被判跨天 → 434 行进周全天条(chip 标"(跨天) 标题")、448 行 `continue` 从周 24h 网格消失;日视图已修复,两视图口径不一致,与"恰在 00:00 结束=占满前一天"语义相悖。多天事件(含午夜结束)在周视图表现正常,仅此单晚形态受影响。
- 定级:维持 P2 但范围收窄(仅周视图、仅"恰好结束于午夜"形态);R2/R3 即存在,非本批修复新引入。
- 修复(约 1 行):434/448 的跨天条件改为 `!o.allDay && Core.crossDayEnds(o.start, o.end)`(cont 由 `o.allDay` 覆盖)。

### 二、单测

`node tests/core.test.mjs` → **65 通过 0 失败**(R4 64 → 65,与开发声称一致;新增 tests:155)。R4 要求的 2 条断言:午夜单日视图分区已补(:155);Java 格式契约断言未落地,按 R4:37 的替代方案以 DEV-TEST-NOTES 第五轮记录契约说明,可接受。

### 三、r5 截图抽查(2 张)

| 截图 | 断言 | 核查结果 |
|---|---|---|
| r5_midnight_in_axis_tuesday.png | 夜班值守(23:00→00:00)留在轴内、全天条无它 | 🟡 **基本相符(证据不完整)**:9月8日周二视图,头部"周二·2项",全天条未渲染(佐证"全天条无它"),轴内仅见 10:00–11:40 大学英语块;**23:00 块位于截图折叠区以下,画面不可见**,"留在轴内"依赖 DOM 断言(monAxisBlocks=4)+ "2 项且无全天条"的间接印证。与断言不矛盾,可接受但证据等级低 |
| r5_wed_continuation_bar.png | 周三全天条"运动会筹备(跨天,进行中)" | ✅ **完全相符**:9月9日周三视图(9 圈选、7 今日描边),全天条显示"运动会筹备(跨天,进行中)"chip,24h 轴内 0 块,头部"周三·1项"。cont chip 渲染路径(app.js:273)首次获得可视证据,V3 视为基本闭合(事件/日期不同、路径相同) |

### 四、最终裁定:**暂缓放行(仅剩 1 项,修后即放行)**

"零遗留"不成立:R5-1(周视图口径,P2 收窄)是 R4 已明确要求随 V2 一并修复的内容,开发未执行且未在第五轮笔记中提及。其余全部通过:V1 修复成立且两端格式契约匹配、V2 核心层与日视图修复成立、单测 65/65、无新引入缺陷(null 传播路径 core.js:77 / app.js:264/265 / Occ.java 均核查安全)。放行条件:
1. app.js:434/448 跨天条件改用 `Core.crossDayEnds` 口径(约 1 行);
2. 补 1 张周视图回归截图(含一条 23:00→00:00 事件:应出现在周网格、不出现在周全天条);
3. 满足后本轮即判定"放行发布",无需再走全量回归;R4 §六第 3 条真机清单事项不变。

## 放行签字(第六轮复核,2026-09-07)

R4 放行条件 1/2 逐项复核:

**R5-1 修复核对:✅ 成立**
- app.js:434 `wChips` 过滤与 :448 周网格 `continue` 均已改用 `Core.crossDayEnds(o.start, o.end)` 口径(与 :264/:265 日视图一致,全文共 4 处,与开发声称相符)。
- 旧口径 `o.end.slice(0, 10) > o.day` 全文检索 **0 处**,无其它遗漏;app.js:277 的 `o.end.slice(0, 10)` 仅用于跨天 chip 文案的 `fmtDateCN` 格式化,非过滤比较,不算残留。
- 夜班值守(23:00→00:00)按"恰在 00:00 结束=占满前一天"语义留在周网格,运动会筹备(周二22:00→周四08:00)进全天条,两视图口径一致。

**单测:✅ 65/65** —— `node tests/core.test.mjs` → 65 通过,0 失败,与开发声称一致。

**截图核对(r6_week_bar_final.png,9月7日–9月13日周视图):✅ 相符**
- 全天条共 4 个 chip:买生日礼物、运动会筹备 ×3,其中一条带"(跨天)"前缀 —— 与预期完全一致。
- 夜班值守**不在**全天条;周网格周一 23:00 行可见其红色时段块(位于网格底缘、随 23:00→00:00 跨午夜自然贴边),确认留在周 24h 网格。

### 最终裁定:**放行发布** ✅

R4 两项放行条件均已满足且无新引入缺陷;R5-1 闭合,零遗留。R4 §六第 3 条真机清单事项(发布前人工过一遍)维持不变,不影响本轮签字。

## v2.1 变更验证(第七轮 · 独立测试,2026-09-07)

验证范围:周/日头部减负改版、课程表导入改粘贴制(推荐提示词 + JSON/行格式解析)、视觉模型链路删除。方法:通读 assets/index.html、app.js、core.js、style.css、mock-bridge.js 与 src/…/MainActivity.java、Util.java;残留引用全局搜索;node 边界实验;`node tests/core.test.mjs`;v21 截图 4 张抽查。

### 一、变更核对

| 变更点 | 核查结果 |
|---|---|
| 周视图:独立翻页行删除,‹ › 移入星期表头两侧(`.weekgrid-head`,style.css:791-803,nav 宽=--wg-gutter) | ✅ 实现;日期区间/教学周数并入顶栏(renderTopbar 周分支,app.js:199-212:「9月7日 – 9月13日 / 第 1 教学周 · 共 6 项」) |
| "今天"按钮收进顶栏、日/周通用(index.html:17;app.js:363) | ✅ 显隐正确:日模式 day===today 隐藏(renderTopbar:198 与 renderDayView:259 双写但一致);周模式 mondayOf(view.day)===mondayOf(today) 隐藏(:211);点击归今天并重渲染 |
| 日视图:day-head 行删除,‹ › 移入周条两侧(index.html:44-48) | ✅ 截图 v21_day_header_trimmed.png 正常(顶栏「9月7日 周一 / 4 项日程」) |
| 导入抽屉改粘贴制:内置可复制提示词(readonly textarea + 复制按钮 execCommand→clipboard 兜底)+ 粘贴框(index.html:174-192,app.js:805-839) | ✅ 实现;AI_PROMPT 与 HTML 内置文本当前一致(双份维护,见 V7-8) |
| parsePastedCourses:优先 JSON(indexOf('{')/lastIndexOf('}') 截取,容忍围栏/前后废话)+ 兜底 parseCourseLines(app.js:842-852) | ✅ 基本成立;边界见 V7-5 |
| core.js 新增 parseCourseLines(:233-277) | ✅ 实现并入测;鲁棒性缺口见 V7-4 |
| 删除:设置页视觉模型卡、MainActivity.analyzeImage/coursePrompt、Util.vision、mock analyzeImage | ✅ 已删净:全局搜索 vision/analyzeImage/coursePrompt/coursePickBtn/courseLoading/whDate/backTodayW/dhDate 在 assets/src/tests **0 命中**;mock-bridge 无痕迹;Util.java 无 vision、import 全部在用;Manifest 无多余权限、versionName 已升 2.1.0 |

### 二、发现的问题

| 编号 | 严重度 | 位置 | 问题与建议 |
|---|---|---|---|
| V7-1 | **P1(回归)** | app.js(缺失回调)/ MainActivity.java:119-133 | **背景图"选择图片"断链**:`bgPickBtn → B().pickImage('bg')`(app.js:968)→ 原生选图、`Util.savePickedImage` 存盘后回调 `window.onImagePicked(path, purpose)`,但 **app.js 已无任何 `window.onImagePicked`/`onImagePickError` 定义**(本轮删除课程表选图链路时被一并删除,该回调原先同时服务 'bg' 与 'course' 两个 purpose);bgPath 从此无写入路径(仅 bgClearBtn 清空),选完图无任何反应、无 toast 无报错,ACCEPTANCE 诉求 4 的功能静默失效。浏览器 GUI 测试测不出(mock 的回调同样无人接)。修:app.js 补 `window.onImagePicked = (path, purpose) => { if (purpose === 'bg') { saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { bgPath: path }) }); showToast('背景已更新 ✓'); } }` 及 onImagePickError 提示 |
| V7-2 | **P1(真机;疑非本轮引入)** | app.js:654、687 ↔ MainActivity.java:283 | **stopVoice 桥参数不匹配**:JS 两处 `B().stopVoice(S.voice.token)`(1 参),Java `public void stopVoice()`(0 参)。Chromium Java Bridge 按方法名+参数个数匹配重载、个数不符时调用不会发生(官方文档:Java 方法参数个数固定),后果是真机"录音中→点圆圈结束 / 60s 自动结束"静默无效:录音不停、无 onVoiceResult/onVoiceError,浮层卡死在"识别中…",麦克风被占至取消。mock-bridge.js:79 `stopVoice: (token)=>…` 掩盖了它(浏览器测试全绿)。R3/R4 报告未覆盖此签名比对,疑自 token 机制引入起即坏。修:Java 改 `stopVoice(String token)`(顺带校验 token)或 JS 改调 `B().stopVoice()`;**需真机复测录音停止→转写全链路** |
| V7-3 | P2 | style.css(缺规则)/ app.js:389-397 | **周视图表头 `.wg-day` 无任何样式**:renderWeekView 生成 `.wg-day`(内含两个 span、带 today class),但 style.css 只有 `.wg-days` 容器规则(805),无单元格规则(对照日视图 .ws-day:662-697 有完整样式)。后果见 v21_week_header_trimmed.png:星期与日期内联挤成一团(「周四10周五11周六12周日13」)、无今天高亮、触控目标过小。本轮重构表头引入。修:补 `.wg-day { display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px 0; }` + `.wg-day.today .num{color:var(--primary)}`(参照 .ws-day) |
| V7-4 | P2 | core.js:242、247 | **parseCourseLines 不识别"点"字时间与部分分隔符**(node 实验证实):「周四 8点-9点40 中国近代史纲要」→ ok:false;时间分隔只认 `[-–~至]`,em-dash「—」与全角「～」失败(「周三 08:00—09:40 线性代数」解析失败)。全角冒号✓、「至」✓、无教室✓、课名含数字✓(大学英语B2)、单字星期✓、单/双周✓。AI/手写输入格式不可控,建议 tm 正则扩展:`[:：]`→含"点"分支(如 `(\d{1,2})\s*点?(\d{2})?`)、分隔符类补 `—～`;失败行已有明确错误提示,不丢数据,故 P2 而非 P1 |
| V7-5 | P3 | app.js:842-852 | parsePastedCourses JSON 提取边界(node 实验):① 前置废话含 `{`(如「结果如下{完}」)时 indexOf 命中废话、JSON.parse 失败 → 整体落行解析全失败;② `{"courses":[]}`、合法 JSON 无 courses 字段、裸数组 → 均落行解析 → 统一报"没有解析出课程"(行为可接受,提示已引导用户,但不精确)。建议:parse 失败后逐个 `{` 尝试配平截取,或 courses 为空/缺失时给出针对性文案 |
| V7-6 | P3 | MainActivity.java:30、459-461 | 删除残留:`import java.util.regex.Matcher` 与 `firstNonEmpty()` 已无使用者(疑 analyzeImage/coursePrompt 遗物),编译无碍,建议清除 |
| V7-7 | P3 | index.html:123 | "关于"卡仍写「明日日程 v2.0」,Manifest 已 2.1.0,建议同步 |
| V7-8 | P3 | index.html:179-181 ↔ app.js:805-807 | 推荐提示词双份维护(HTML textarea 与 JS AI_PROMPT 手工同步);建议 HTML 留空、统一由 openCourseSheet 填充 |

### 三、对齐与契约专项核查(无问题)

- **周网格对齐**:gutter 对称——表头两侧 nav 各 44px(--wg-gutter)、.weekgrid padding-left/right 各 44px(style.css:826、1376),7 列区与 .wg-days 等宽;`.wg-hour` left/right=gutter 恰好覆盖列区;`.wg-now` 内联 calc 用 `(100% - 2*gutter)` 与列区一致(绝对定位百分比含 padding,口径正确),截图红线落在周一列内。表头 grid column-gap:2px 与列间 1px border 造成 ≤2px 累计漂移,可忽略。
- **顶栏信息**:日模式「9月7日 周一 / N 项日程」、周模式「日期区间 / 第 N 教学周 · 共 N 项」(学期锚点取自课表事件),无信息丢失亦无冗余;26px 大标题在 backToday 可见的非当前周更可能触顶换行(tb-title 无 nowrap/ellipsis),真机可再观察,不计问题。
- **桥契约**:删除方法后 Bridge 其余 19 个 @JavascriptInterface 与 JS 调用面一一对应(除 V7-2 的参数个数问题);onActivityResult/pickImage/readImageBase64 保留服务背景图用途,但 JS 侧断链见 V7-1。
- **单测**:`node tests/core.test.mjs` → **71 通过 0 失败**(上轮 65 → 71,新增 parseCourseLines 等用例,tests/core.test.mjs:171 起)。

### 四、v21 截图抽查(4 张)

| 截图 | 断言 | 核查结果 |
|---|---|---|
| v21_day_header_trimmed.png | 日视图顶栏合并、day-head 行删除 | ✅ 相符:顶栏「9月7日 周一 / 4 项日程」,周条两侧 ‹ ›,今天(7)圈选,无独立翻页行 |
| v21_week_header_trimmed.png | 周视图顶栏区间+教学周、‹ › 入表头 | 🟡 布局达成(「9月7日 – 9月13日 / 第 1 教学周 · 共 6 项」,红线在周一列)但**表头单元格拥挤无高亮**,即 V7-3 |
| v21_course_paste_sheet.png | 导入抽屉:提示词 + 复制按钮 + 粘贴框 | ✅ 相符:两步引导清晰,提示词只读可复制,粘贴框带格式示例 |
| v21_course_preview_from_json.png | JSON 粘贴 → 核对列表 | ✅ 相符:3 门课解析正确(含周次/单双周/教室/教师),学期锚点预填 2026/09/07,替换提示正确 |

### 五、裁定:**需修(2×P1,修后复验即可放行)**

本轮两项用户反馈改版本身实现质量良好(顶栏合并、粘贴导入主路径、视觉链路删净、单测 71/71),但:
1. **V7-1** 是本轮删除动作直接引入的静默回归(背景图选择完全失效),必须修复;
2. **V7-2** 使云端语音转写在真机上不可用(浏览器测试盲区),须改签名并真机复测;
3. V7-3(周表头样式)为本轮改版的外观缺陷,随同修复。
修复后仅需:补 1 张"选背景图→生效"截图 + 1 张真机(或桥一致化后的)录音停止→转写链路验证 + 1 张周表头(含今天高亮)截图,即可放行,无需全量回归。

## v2.1 放行复验(第八轮 · 独立测试,2026-09-07)

> 方式:对第七轮 7 项修复逐条静态核对(文件:行号)+ 空token/ellipsis/样式一致性专项推演 + `node tests/core.test.mjs` + 截图 2 张 Read 逐像素核查(含 PowerShell 像素采样定色)+ node 边界复核。本轮未修改任何代码。

### 一、7 项修复核对表

| # | 状态 | 依据(文件:行号)与核验说明 |
|---|---|---|
| 1 V7-1(P1) | ✅ **修复成立** | app.js:971-984:bgPickBtn→`pickImage('bg')`(:972)、`window.onImagePicked`(:974-978,写入 bgPath + closeSheet + toast「背景已更换」)、`window.onImagePickError`(:979)。原生契约闭合:MainActivity.java:125-126 成功回带 `(path, purpose)`、:128/:363 失败走 onImagePickError。JS 以单参接收、忽略 purpose(课程选图链路已删,现仅 'bg' 一个发起方,与"仅 bg 用途"声称等价)|
| 2 V7-2(P1) | ✅ **修复成立** | MainActivity.java:283 `public void stopVoice(String token)`,与 app.js:655/:688 两处 `B().stopVoice(S.voice.token)`(1 参)按名+参数个数匹配;stopVoiceCancel/firstNonEmpty 全文检索 **0 命中**(mock 侧残留见 N8-1)。空 token 专项:Java 体 :283-323 **全程未解引用 token**(仅作桥个数匹配,:281 注释已言明),null/'' 无 NPE 路径;JS 仅在 recording 态可触发 stopVoice(:653-656、:685-690),此时 token 恒为 :643 的 'v'+Date.now(),空 token 场景不可达;即便到达,三个回调守卫(:679/:695/:705)仍按会话丢弃 ✅ |
| 3 V7-3(P2) | ✅ **修复成立** | style.css:817-839:.wg-day 纵向 flex + gap2 + padding 4px 0;:825-830 星期 11px/500/text-3、:832-837 日期 15px/600/tabular-nums、:839 `.today` 数字主色。与 .ws-day(665-700)一致性:字号/字重/颜色/今日高亮口径完全对齐;差异仅 padding 4vs6、gap 2vs3、无 :active 按压反馈(见备注③)。padding 纯纵向,**无横向漂移**,不影响 R4 已验证的网格对齐 ✅ |
| 4 V7-4(P2) | ✅ **修复成立** | core.js:242 时间正则 `(\d{1,2})\s*[:：点]\s*(\d{2})?…[-–—~～至]…`("点"字、全/半角冒号、—/~～/至;结束分钟组 `[:：点]?` 可选),:258 清洗正则同步;:247/:259 周次分隔补 `—～`。新增 2 条单测:tests:183-184(8点-9点40→08:00/09:40)、:185-186(14:00～15:40 + 1—8周→[1,8])✅。node 复核「周六 8点30-10点05 物理」→08:30/10:05 ✓;「2点半」的"半"仍不支持(遗留缺口、失败行有明确提示,非本轮引入,不计新问题)|
| 5 V7-5(P3) | ✅ **修复成立** | app.js:846 `t.indexOf('{"courses"')` 优先定位、:847 回落 `indexOf('{')`。node 复核「结果如下{完} {"courses":[…]}」:旧口径命中 x=7(废话花括号)、新口径命中 x=11(JSON 本体),normalizeCourses 解析成功 ✅。边界:pretty-printed `{ "courses"`(花括号后有空白)不命中 key、回落旧口径,不劣化,可接受 |
| 6 V7-7(P3) | ✅ **修复成立** | index.html:123「明日日程 v2.1 · 数据全部保存在本机」✅(Manifest versionName 2.1.0,第七轮已核)|
| 7 新增周顶栏 | ✅ **实现成立** | app.js:199-213 周分支:标题 `第 N 教学周`(学期锚点取课表事件 semesterStart,:204-208;无锚点回落 `${fmtDateCN(mon)} 那一周` :205)、副题 `共 N 项`(:211);日期区间改由 .wg-day 表头展示(app.js:390-397 双行:周X+日期)。style.css:345-357 `.tb-title` 24px + `white-space:nowrap` + `overflow:hidden` + `text-overflow:ellipsis` + `min-width:0`(flex 截断三件套齐备)✅ |

### 二、修复引入风险专项核查(重点)

1. **stopVoice(String token) 空 token**:无风险,论证见上表第 2 项。备注①:原生未校验 token **值**(仅参数个数),语义上"对齐"实为"个数对齐",当前单会话模型安全;若未来支持多会话需补值校验,不计缺陷。
2. **tb-title ellipsis 对日视图**:日标题 `${fmtDateCN(day)} 周X` 最长形态(如「12月31日 周日」)≈154px,常规屏宽(≥360px 减按钮区)不触发截断;ellipsis 仅为兜底,无信息丢失路径。周标题「第 N 教学周」更短 ✅。
3. **wg-day 与 ws-day 一致性**:主视觉口径(字体/字号/颜色/今日主色)一致;`.wg-day` 为 button(app.js:393-396,点击切日视图)但无 `:active` 按压反馈,与 .ws-day:active(676)不一致——极小交互差异,见备注③。
4. **桥契约面**:stopVoice 1↔1 参后,JS 调用面与 Java @JavascriptInterface/mock-bridge 三方一致(唯一残留 mock 死代码见 N8-1);onImagePicked 双参发送/单参接收为合法 JS 宽容形态 ✅。

### 三、单测

`node tests/core.test.mjs` → **73 通过 0 失败**(与开发声称一致;第七轮 71 → 73,新增 tests:183-186 两条,V7-4 全覆盖)。

### 四、截图抽查(2 张)

| 截图 | 断言 | 核查结果 |
|---|---|---|
| v21_week_header_final.png | 周顶栏新格式 + 表头样式 | ✅ **完全相符**:顶栏「第 2 教学周 / 共 2 项」,‹ › 入表头,周一14–周日20(区间由表头展示),单元格两行居中(V7-3 修复可视确认),「今天」按钮可见(mon 9/14≠mondayOf(9/7) 正确)、视图周内无 today 高亮(今天 9/7 不在 14–20,正确),2 个课程块与"共 2 项"一致。PowerShell 像素采样:表头区 0 个高亮色像素,与代码语义自洽(初读"19 绿色"系缩放误读,已排除)|
| v21_bg_applied.png | 选背景图→生效(V7-1 回归证据) | 🟡 **链路证据有效,但摄于中间版本**:背景已应用(着色区自网格区起)、toast「背景已更换」、事件块白底+光晕(body.has-bg)——onImagePicked 链路可视确认 ✅;**但顶栏仍是旧版格式**("9月14日 – 9月20日" 26px 无 nowrap 换行两行 + 副题合并式),即摄于第 7 项落地前、V7-1 修复后的中间构建(两图 mtime 同为 06:36:58 系同步复制,非拍摄时刻)。所验证的回调链路不被第 3/7 项触及,证据可接受;建议随真机回归补拍最终版顶栏状态(见 N8-2)|

### 五、新发现(均不阻塞)

| 编号 | 严重度 | 位置 | 问题与建议 |
|---|---|---|---|
| N8-1 | P3·残留 | MainActivity.java:30、mock-bridge.js:80 | V7-6 只完成一半:`firstNonEmpty()` 已删,但 `import java.util.regex.Matcher` 仍无使用者;mock-bridge 的 `stopVoiceCancel: () => {}` 与已删的 Java 方法不同步(死代码,浏览器无碍)。建议一并清除 |
| N8-2 | P3·证据 | v21_bg_applied.png | 中间版本截图(顶栏旧格式+标题换行),与最终构建不符;链路本身有效,建议补拍。另:第七轮放行条件要求的"周表头(含今天高亮)"未获可视证据(v21_week_header_final 视图周不含今天),.wg-day.today 仅有 CSS+DOM 支撑;真机回归时顺带补拍即可 |

备注(不计问题):① stopVoice 未校验 token 值(见专项 1);② parseCourseLines "2点半"的"半"不支持(遗留);③ .wg-day 无 :active 按压反馈(交互一致性,可选)。

### 六、最终裁定:**放行发布** ✅

第七轮 7 项(2×P1、2×P2、4×P3 中的 3 项,另 1 项 P3=N8-1 收窄)全部核对成立;73/73 单测;无 P1/P2 新问题,新发现仅 2 项 P3(N8-1 清理项、N8-2 证据补拍)。V7-2 的**真机**录音停止→转写全链路复测及 R4 §六第 3 条真机清单(深链冷/热启动、相册选图等)列为**发布前人工必做事项**,与 R4 末轮签字口径一致,不影响本轮代码层放行。
