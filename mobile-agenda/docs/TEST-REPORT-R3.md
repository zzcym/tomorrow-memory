# 明日日程 v2 · 独立测试报告 R3(第三轮回归验证)

> 测试人:独立测试工程师 · 日期:2026-09-07(第三轮)
> 方式:静态全量复审(assets/app.js 1107 行、core.js、mock-bridge.js、style.css 主题段、src/com/tomorrow/agenda/*.java、AndroidManifest.xml)+ 单测运行 + node 行为验证 + DEV-TEST-NOTES 二/三轮记录与截图抽查(4 张)
> 输入基线:docs/TEST-REPORT.md(R1,B1-B27)、docs/TEST-REPORT-R2.md(N1-N6)、docs/DEV-TEST-NOTES.md
> 本轮未修改任何代码;行号以当前工作区文件为准。构建产物核验:build/classes 与 classes.dex、明日日程.apk(09-07 03:20)均新于全部源码修改时间(最晚 Occ.java 03:18),javap 确认 Occ.class 含 contOcc、AlarmReceiver.notify 含 openRc 参数——**发布的 APK 确实包含本轮修复**。

---

## 一、总结论:**通过(可发布,维持 R2 结论)**

- R2 的 6 个 P2(N1-N6)中 **5 个确认修复(N2/N3/N4/N5/N6),1 个部分修复(N1)**:会话令牌已挂上但三个回调只做真值判断、未做代次比对,N1 描述的"取消后快速重开被迟到回调劫持"场景依旧成立(详见 §二 N1、§三 R3-A)。
- 重点交互面复查**未发现 P0/P1**:cont 占位排序正确、被 Scheduler 正确跳过(不产生重复提醒)、小组件与明日汇总呈现合理、voiceSession 与 60s 录音上限的组合无死锁/无泄漏计时器。
- 新发现 2 个 P2 代码问题(R3-A 语音令牌不比对、R3-B 多天事件恰在午夜结束→延续日全丢)+ 1 个 P2·需真机观察(R3-C 深链冷启动时序)+ 1 项证据问题(R3-D r3 截图与最终代码不符)。均为 P2,不阻塞发布。
- 单测 **63/63 通过**(R2 为 56);layoutColumns 已移入 core.js 并补测(R1 缺口 #10 闭合);semesterStart 缺省回落仍无锚定测试(R1 缺口 #1,第三轮未补)。
- B1-B27 闭环:**23 项完全修复、2 项维持"部分修复"且被接受为偏离(B15、B16)、1 项有意决策(B18)、0 项未修复**。N1-N6 中仅 N1 未完全闭环。
- R1 §七"需真机清单"(13 项)仍全部待真机覆盖,发布后首次真机回归建议优先:深链(含冷启动)、麦克风三路径、小组件三尺寸、课表导入全链路。

---

## 二、N1-N6 核对表

> 状态:✅ 已修复 / 🟡 部分修复。

| # | 状态 | 依据(文件:行号)与核验说明 |
|---|---|---|
| N1 | 🟡 **部分修复** | 令牌已建立:app.js:628 `let voiceSession = 0`、632 `openVoiceOverlay` 记 `S.voice.session = ++voiceSession`、640 `closeVoiceOverlay` 清 0。但三个回调的守卫(app.js:685、701、711)都是 `if (!S.voice.session) return;`——**只判断"是否有会话",没有比对令牌代次**(注释写"已取消或已重开",实际"已重开"检不出来)。复现场景:取消(session=0)→ 1 秒内重开(session=2)→ 上一轮迟到 onVoiceResult/onError/onVoiceState('listening') 到达 → session=2 为真值 → 放行:旧文本直接关浮层弹确认卡,或 orb 置"listening"而识别器已停(点击被 690 行策略吞掉,浮层假死)。与 R2 的"浮层 hidden 守卫"在该场景下行为等价,**声称的目标场景未被修复**。修法需原生回传请求代次(startVoice 带 token、回调原样带回),或重开后首次 startVoice 前丢弃一切回调。详见 §三 R3-A。取消后**不重开**的场景(true 值判断)可正确丢弃 ✅ |
| N2 | ✅ 已修复 | AlarmReceiver.java:53 `start.length() >= 10 ? start.substring(0, 10) : null` → openDay 只含日期;MainActivity.java:78 `day.matches("\\d{4}-\\d{2}-\\d{2}")` 整串匹配可命中;app.js:1101-1105 onDeepLink 切到对应日。提醒仅对 timed 事件触发(Scheduler.java:56 跳过 allDay),start 恒为 "YYYY-MM-DD HH:mm",substring 恒有效。⚠️ 冷启动时序风险见 §三 R3-C(非本轮引入,随 N2 修复合活) |
| N3 | ✅ 已修复 | Java 侧:Occ.java:66-76 end 日 > start 日且非 00:00 结束 → 逐延续日 `contOcc`;110-125 contOcc(allDay=true、cont=true、start=当日 00:00、无 end、不带 remindMinutes)。JS 侧:core.js:56-59 crossDayEnds、70-78 展开层生成、124-132 contOcc。视图层已移除 crossDayChipsFor 改用展开结果:app.js:250(注释)、262-266(跨天起始日→crossDay chips、延续日 cont→allDay chips)、432-444/448(周视图同)。消费端同步:WidgetUpdater.java:53、AlarmReceiver.java:76。node 实测:09-07 20:00→09-09 08:00 在 09-08/09-09 各产出 1 条 allDay+cont,单独查一天可见,与单测 144-156 一致;两侧规则一致 |
| N4 | ✅ 已修复 | AlarmReceiver.java:54 `("open" + eventId + start).hashCode()` 作为 openRc,142-146 notify 用其创建 PendingIntent(FLAG_UPDATE_CURRENT\|IMMUTABLE)→ 不同事件/发生的 extras 不再互相覆盖;digest=99(100 行)、test=991(70 行)与提醒 rc 天然区隔(getActivity 域)。通知 id 同毫秒覆盖(R1 低风险备注)维持原状,可接受 |
| N5 | ✅ 已修复(引入 R3-B) | core.js:58 `end.slice(0,10) > start.slice(0,10) && !end.endsWith(' 00:00')`;Occ.java:70 同规则。node 实测:"23:00–次日 00:00" 不再判跨天,起始日按 timed 20:00–00:00 渲染 ✅。**副作用**:多天事件(如周三 20:00 → 周六 00:00)因 `endsWith(" 00:00")` 一票否决,中间延续日全部丢失(见 §三 R3-B,node 实测 09-10/09-11 均为空) |
| N6 | ✅ 已修复 | app.js:119-125 matchMedia('(prefers-color-scheme: dark)') change → theme==='auto' 时 applyTheme();applyTheme→B().applyUiTheme(MainActivity.java:460-484 读当前 uiMode 刷状态栏);CSS 自动翻转由 style.css:163-165(`@media (prefers-color-scheme: dark) html[data-theme="auto"]`)声明式完成;AndroidManifest.xml:29 configChanges 含 uiMode(不重建),WebView 收到 onConfigurationChanged 后媒体查询会重估。旧 WebView 无 addEventListener 时 try/catch 静默降级(等同 R2 行为),可接受 |

### 重点交互面复查(任务指定项)

1. **occurrences 排序 × cont 占位 × 全天条**:排序规则 allDay 在前、其余按 start 字符串序(core.js:134-143;Occ.java:97-107,TreeMap key 含 index 无去重风险)。cont 占位 start="当日 00:00" 恒排当天最前;node 实测跨天起始日只产 1 条 timed occ(进 crossDay chip,app.js:264、277 文案含起止时刻),延续日只产 1 条 cont(进 allDay chip,273 行"(跨天,进行中)"),**同日同事件无重复 chip**;周视图 434/448 行过滤口径一致,不进 24h 轴。全天条渲染正常。
2. **cont 是否误导 Scheduler 重复提醒**:不会。Scheduler.java:56 `o.optBoolean("allDay")` 直接 continue,cont 恒 allDay=true;且 JS/Java contOcc 均不含 remindMinutes(双保险)。跨天事件仅起始日按 timed 排一次提醒,延续日零提醒 ✅。60 天视界内 cont 占位数量 = 跨天天数,量级无问题。
3. **WidgetUpdater / digest 对 cont 的呈现**:WidgetUpdater.java:40-45 allDay→Long.MAX_VALUE → cont 恒判"未结束",2×2"下一条"显示"全天+标题+地点";列表行 99-100 显示"全天"。digest(AlarmReceiver.java:85-97)cont 计入"共 n 项"并显示"📌 全天 · 标题 · 地点"。口径:日视图 chip 标"(跨天,进行中)"而小组件/汇总标"全天",文案不一致但语义可接受,记打磨项不计缺陷。
4. **voiceSession × 60s 录音上限**:recCapTimer 仅在 onVoiceState('recording') 启动(app.js:687-696),入口有 session 守卫(取消后迟到的 'recording' 不会启计时器);closeVoiceOverlay/onVoiceResult/onVoiceError 三处 clearRecCap(630、637、700、710),60s 到点先复查 `S.voice.state==='recording'` 再 stopVoice;JS 单线程下取消与清计时器无竞态。**组合漏洞**:若用户在录音中取消后 1 秒内重开浮层,N1 的不比对问题同样适用——迟到的 'recording' 状态会把新会话 orb 置为"录音中"但录音器已被 cancelVoice 释放,60s 计时器空转,用户点击 orb → stopVoice → 原生"没有录音"('unavailable')→ 文字兜底,可恢复但体验差(并入 R3-A 计)。

---

## 三、新发现(本轮新增)

> 2 个 P2 代码问题 + 1 个 P2·需真机观察 + 1 项证据问题。无 P0/P1。

**R3-A [P2] N1 修复不完整:会话令牌只做真值判断,未做代次比对(见 §二 N1)**
- 位置:assets/app.js:685、701、711。
- 影响:N1 原始场景(取消 → 快速重开 → 迟到回调劫持新会话)依旧成立;开发记录"取消/重开后迟到回调一律丢弃"与实现不符。严重度与 R2 N1 持平(P2 边界场景),不阻塞发布。
- 建议:startVoice/cancelVoice 由 JS 下发 `S.voice.session`,原生回调原样带回,JS 比对一致才处理;补一条 mock 层的"迟到回调"用例。

**R3-B [P2] N5 修复的副作用:多天事件恰在午夜 00:00 结束,全部延续日丢失**
- 位置:assets/core.js:58 与 src/com/tomorrow/agenda/Occ.java:70(`!end.endsWith(' 00:00')` 对整个事件一票否决,而非只剔除最后一个 0 分钟延续日)。
- 复现(node 实测):新建"09-09 20:00 → 09-12 00:00"(跨 3 晚,如露营最后一晚到午夜)→ 09-09 显示 timed 20:00–00:00 块,**09-10、09-11 两天视图/小组件/明日汇总均无任何显示**,事件凭空消失。 datetime-local 可自然选出 end=00:00,路径可达;两侧实现一致(不产生 JS/Java 分叉)。
- 建议:延续日生成为 (start, endDay) 全量 + endDay 仅当 end 时刻 > "00:00";即 `endDay > startDay` 时先按天生成,最后一天按时刻决定去留。补单测:多天+午夜结束。

**R3-C [P2·观察,需真机] 通知深链冷启动时序竞态(N2 修复合活后暴露)**
- 位置:src/com/tomorrow/agenda/MainActivity.java:72、76-82(onResume 即 sendToJs)vs 58 行 loadUrl 异步加载。
- 推演:点击通知新建 Activity → onResume 时 WebView 页面很可能尚未加载完成 → `window.onDeepLink` 未定义 → `window.onDeepLink && ...`(79 行)静默 no-op 且 80 行已 removeExtra → 深链丢失。应用存活于后台时(WebView 已加载)可正常跳转。静态无法定论,列入真机清单;若真机复现,建议改为 WebViewClient.onPageFinished 后分发,或 JS 侧 ready 后主动拉取 pending openDay。
- 注:该时序结构 R2 已存在(当时深链因 N2 从不触发),非本轮代码新引入,随 N2 修复成为现实路径。

**R3-D [证据] r3 截图与最终代码不符,"跨天 chip 带时刻"无有效证据**
- gui-test-screenshots/r3_crossday_wed_bar.png 实际 chip 文案为"露营(跨天)(至 9月11日)"(R2 时代旧格式,无时刻);当前代码 app.js:277 会输出"露营(20:00 至 9月11日 08:00)"。DEV-TEST-NOTES 第三轮声称的文案与截图不一致,说明**截图摄于 chip 文案改动之前的构建**。另外该截图"今天"高亮在 9月9日(真实今天为 9月7日),说明摄于改签系统日期的环境(测试手段可接受,但应记录)。
- 该截图仍能佐证 N3/N5 的核心行为(周三:全天条含跨天 chip、24h 轴内 0 块);但"周四/周五 (跨天,进行中)""周六隐藏""12h 刻度"仅有 DOM 断言、无截图,可接受但证据等级低。建议开发用当前构建重拍 r3 证据。

---

## 四、单测结论

`node tests/core.test.mjs` → **63 通过 0 失败**(R1 42 → R2 56 → R3 63,新增 7 条断言:跨天展开 4 条 tests/core.test.mjs:150-156、layoutColumns 3 条 158-165)。

| 项 | 状态 |
|---|---|
| layoutColumns 移入 core.js 并导出(core.js:145-173、250) | ✅ R1 缺口 #10 闭合;用例覆盖 2 列、5 事件封顶 3 列、不相邻各占整行。R1 建议的"相邻 s==clusterEnd 不分列"与跨簇后列号重置仍无用例 |
| 跨天延续展开用例(144-156) | ✅ 覆盖起始日 timed+延续日全天+午夜结束排除+单日查询;**恰好漏掉 R3-B 的"多天+午夜结束"形态**(建议补) |
| semesterStart 缺省回落 mondayOf(今天) | ❌ R1 缺口 #1 三轮仍未补(可用相对断言规避漂移) |
| 其余 R1/R2 已记缺口(weeks 负数/[1,99] 越界 clamp、fmtTime 23:59、minutesOf NaN 传播) | ❌ 维持未补,P3 级 |

结论:新增用例质量合格(断言到字段级、含反例),覆盖了本轮修复的主路径;但 R3-B 正落在"改了没人看着"的边界上,再次印证边界形态需要显式用例锚定。

---

## 五、DEV-TEST-NOTES 二/三轮回归记录与截图核查

- 第二轮记录(docs/DEV-TEST-NOTES.md:43-46)已补齐,抽查 3 张全部相符:周翻页 r2_week_paging_week2.png(9月14-20、顶栏"第 2 教学周 · 共 2 项"联动、高数/英语落位正确)✅;撤销 r2_undo_toast.png(toast"已保存 1 项,提醒已设置 ✓"含"撤销"钮)✅;确认卡单条删除 r2_confirm_row_delete.png(标题行右侧垃圾桶钮可见)✅。12h 刻度为 DOM 断言无截图(声明属实,接受)。
- 第三轮记录(同文件:48-59):r3_crossday_wed_bar.png 与声称文案不符(见 R3-D);周四/周五/周六为 DOM 断言无截图。
- 构建一致性:明日日程.apk / classes.dex(03:20)新于全部源码(≤03:19),javap 确认新方法签名在产物中 ✅(R2 曾缺失的"证据可核对性"本轮已改善,唯 r3 截图倒退)。
- 真机清单(R1 §七 13 项)仍全部待验,新增 R3-C 深链冷启动一项。

---

## 六、B1-B27 闭环速览(R3 复核后)

| 状态 | 数量 | 明细 |
|---|---|---|
| 完全修复 | 23 | B1-B4、B6-B14、B19-B26、B27(B5 经 N3 补齐原生侧、B17 经 N2 修复生效,本轮升为完全修复) |
| 部分修复(接受的偏离) | 2 | B15(缺首课日期换算显示/冲突标黄/可编辑文本兜底)、B16(缺 LLM/视觉/转写一键体检)——R1/R2 已记,属 PRD 打磨项,不阻塞 |
| 有意的决策 | 1 | B18(4×4"今日全览"替代 4×3"今明两天") |
| 未修复 | 0 | — |

## 七、最终裁定

**可发布。** 判据:全部 P0/P1(B1-B7)在 R2 已确认修复且本轮无回归;N2-N6 修复有效;新发现的 R3-A/R3-B/R3-C 均为 P2(边界场景、可恢复、不破坏主链路),与 R2 放行 N1-N6 时采用的标准一致。附带条件:
1. 下轮修复 R3-A(原生回传代次)与 R3-B(午夜结束多天事件),各约几行改动 + 补 2 条单测;
2. 用当前构建重拍 r3 截图(R3-D),真机回归优先覆盖深链(冷/热启动)、麦克风三路径、小组件三尺寸;
3. B15/B16 作为已接受偏离随 v2.1 排期。

## 八、统计速览

| 类别 | 数量 | 明细 |
|---|---|---|
| R2 问题已修复 | 5 | N2、N3、N4、N5、N6 |
| R2 问题部分修复 | 1 | N1(令牌不比对代次=R3-A) |
| 新发现 P0 / P1 | 0 / 0 | — |
| 新发现 P2 | 2+1 | R3-A 语音令牌、R3-B 午夜结束多天事件延续丢失、R3-C 深链冷启动竞态(需真机) |
| 证据问题 | 1 | R3-D r3 截图为旧构建、文案不符 |
| 单测 | 63/63 | 新增 7 条断言;semesterStart 缺省仍未锚定 |
| 闭环 | B1-B27:23✅+2 接受偏离+1 决策;N1-N6:5✅+1🟡 | — |
