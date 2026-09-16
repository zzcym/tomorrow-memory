# 明日日程 v2 · 独立测试报告 R2(回归验证)

> 测试人:独立测试工程师 · 日期:2026-09-07(第二轮)
> 方式:静态全量复审(assets/app.js 1133 行、core.js、mock-bridge.js、index.html、style.css 关键段、src/com/tomorrow/agenda/*.java 全部 11 个文件、AndroidManifest.xml、build-apk.sh)+ 单测运行 + 对照 docs/TEST-REPORT.md(B1-B27)逐条核对
> 输入基线:docs/TEST-REPORT.md(R1)、docs/PRD.md、docs/DEV-TEST-NOTES.md
> 本轮未修改任何代码;行号以当前工作区文件为准。

---

## 一、总结论:**通过(可发布)**

- R1 全部 7 个 P0/P1(B1-B7)确认已修复;27 条缺陷中 **21 条已修复、4 条部分修复、0 条未修复、1 条有意决策(B18)**。
- 未发现新引入的 P0/P1。新发现 6 个 P2 级问题(N1-N6),其中最值得尽快跟进的是 **N2:提醒通知深链(B17)修复未实际生效**(管道已建但日期格式不匹配,永远不触发)和 **N1:语音代次 token 未被消费**(取消后快速重开浮层,上一轮迟到回调会劫持新会话)。两者均为小改动,不阻塞发布。
- 单测 56/56 通过,本轮新增 14 条有效覆盖了 R1 缺口的大部分;`layoutColumns` 导出与单测、semesterStart 缺省回落锚定两项仍未补(见 §四)。
- **GUI 回归证据缺失**:开发声称做了周翻页/撤销/12h 刻度/周全天条四项 GUI 回归,但 docs/DEV-TEST-NOTES.md 未更新(仍只有第一轮 T1-T9 记录),gui-test-screenshots/ 无新截图。本轮结论基于静态审查与单测,周翻页/撤销/周全天条的实际交互表现未经 GUI 证据佐证,建议开发补记(见 §五)。
- R1 的"需真机验证清单"(13 项)依然全部待真机覆盖,发布前建议至少过一遍:课表导入全链路、麦克风三种授权路径、小组件三尺寸渲染、通知深链(N2 修复后)。

---

## 二、B1-B27 修复核对表

> 状态:✅ 已修复 / 🟡 部分修复 / 🔵 有意的决策。❌ 标注缺失部分。

| # | R1 级别 | 状态 | 依据(文件:行号) |
|---|---|---|---|
| B1 | P0 | ✅ 已修复 | MainActivity.java:235-269 `analyzeImage` 返回 `{"raw": 已剥离围栏的纯JSON}`;app.js:856-886 先判 error(862)→ `JSON.parse(content.raw)`(869-871)再喂 normalizeCourses(873);mock-bridge.js:87-96 改为与真桥同构返回 `{"raw":...}`,R1 的 mock 保真度缺口已闭合 |
| B2 | P1 | ✅ 已修复 | MainActivity.java:84-96 deny 分支 `onVoiceError(...,'unavailable')`(90-94);app.js:736-739 unavailable → voiceFallback 文字兜底,浮层不再卡"正在听" |
| B3 | P1 | ✅ 已修复 | MainActivity.java:359-384 新增 `cancelVoice()`(stopListening + 释放录音器 + 删文件)、354-357 stopVoiceCancel;app.js:670-673 voCancel 无条件调用;onVoiceResult/onVoiceError 均有"浮层已隐藏则丢弃"守卫(app.js:712、728、738)。遗留边缘见 N1 |
| B4 | P1 | ✅ 已修复 | index.html:61-66 周视图头部 ‹/›/今天按钮;app.js:393-396 绑定 ±7 天;renderTopbar 周分支改用 `mondayOf(S.view.day)`(app.js:191);backTodayW 可见性 app.js:421 |
| B5 | P1 | 🟡 部分修复 | JS/UI 层:app.js:296-298 跨天 occ 转全天条(301-317)、crossDayChipsFor(app.js:272-283)覆盖延续日,PRD §1.4 两条验收(周一进全天条不在轴内 / 周二有 chip)在日视图均满足。❌ 原生侧未同步:Occ.java:52-97 仍只在 start 日产出 occ → 延续日在小组件(WidgetUpdater.java:53)与"明日汇总"(AlarmReceiver.java:74)中缺失,见 N3 |
| B6 | P1 | ✅ 已修复 | 确认卡单条删除:app.js:790(pe-del 按钮 + icons.js:66 trash 图标)、808-814 splice+重渲染;保存后 5 秒撤销:app.js:819-835(记录新增 id,撤销逐条 deleteEvent → scheduleAll 同步取消闹钟),符合 PRD §2.3 |
| B7 | P1 | ✅ 已修复 | app.js:861-865 先判 `content.error` 原样展示并提示"设置→视觉模型";归一化 0 条才提示"没认出课程"(875-879) |
| B8 | P2 | ✅ 已修复 | app.js:222-239 `hourFmtCache` 记录格式,fmt 切换强制重建刻度(226-227);12h 标签"凌晨12/中午12"(233-235);"凌晨12"约 40px < 52px gutter(style.css:78),宽度可容纳 |
| B9 | P2 | ✅ 已修复 | core.js:132-133 缺 end 保持 `''`;单测锚定(tests/core.test.mjs:109-112) |
| B10 | P2 | ✅ 已修复 | WidgetUpdater.java:39-45 `endTimeOf`:allDay→Long.MAX_VALUE、缺 end→开始+1h;小卡"下一条"含全天(57-61)、全天显示"全天"而非错误空态(77-78);只排全天的日程不再显示"今天日程已结束" |
| B11 | P2 | ✅ 已修复 | MainActivity.java:183-186 `end==""` → `e.remove("end")`;187-190 更新时清 remindedMap/remindedAt;app.js:618-626 JS 无条件传 end(空串)、remindMinutes 传 null(org.json `put(name,null)` 等价移除键 → 恢复跟随默认,两处语义闭环) |
| B12 | P2 | ✅ 已修复 | AlarmReceiver.java:60 handleReminder 末尾 `WidgetUpdater.updateAll(ctx)` |
| B13 | P2 | ✅ 已修复 | app.js:716-723 云端录音态 60s 计时自动 stopVoice;转写失败/超时走 onVoiceError → voiceFallback 文字兜底(不再是死路 toast) |
| B14 | P2 | ✅ 已修复 | app.js:736-747 onVoiceError → voiceFallback(错误信息 + 输入框 + "重试语音"/"解析添加"双入口,index.html:253-254);设置页"语音链路状态行 + 恢复系统语音优先"重置入口(app.js:1029-1034、1074-1078;index.html:103-104) |
| B15 | P2 | 🟡 部分修复 | ✅ 非法 JSON 自动重试 1 次(MainActivity.java:252-258,强化 prompt 再调一次);"将替换现有课程表的 n 条"提示(app.js:949-950、index.html:209);学期起始日可改。❌ PRD §3.1.2 的"换算后的首次上课日期"显示与"冲突标黄"仍未实现(app.js:887-924 预览行无此二者),PRD §3.4"仍失败展示可编辑文本兜底"未做(仅报错文案) |
| B16 | P2 | 🟡 部分修复 | ✅ 设置页新增"学期设置"卡片(index.html:113-118),与导入预览共用锚点(app.js:943-944、954、1027、1064-1066)。❌ PRD §9.4 的 LLM/视觉/转写"一键体检"仍缺,设置页只有"测试通知"(index.html:127-130) |
| B17 | P2 | 🟡 部分修复 | 深链管道已建:AlarmReceiver.java:140-144 通知附 openDay、MainActivity.java:76-82 maybeDispatchDeepLink、app.js:1128-1132 onDeepLink。❌ **实际不生效**:openDay 传入的是含时刻的 occStart"YYYY-MM-DD HH:mm"(AlarmReceiver.java:51-52),MainActivity.java:78 `day.matches("\\d{4}-\\d{2}-\\d{2}")` 整串匹配必失败 → onDeepLink 永不触发,详见 N2 |
| B18 | P2 | 🔵 有意的决策 | 维持 4×4"今日全览 8 条"(AndroidManifest.xml:57-63、res/xml/widget_large.xml targetCellHeight=4、WidgetUpdater.java:22),开发记为偏离 PRD §7 的决策;溢出行"还有 n 项…"(WidgetUpdater.java:117-123)已按 PRD 精神补上;4×2 仍 3 行+溢出行。2×2 副行现为"今日 n 项"计数,非 PRD 的"今天还有 n 件",属同一决策范围 |
| B19 | P2 | ✅ 已修复 | Scheduler.java:42-47 循环外建 `byId` HashMap 索引;isReminded 改为纯函数接收 JSONObject(77-82),不再每 occ 读盘;scheduleAll 整体 O(occ 数) |
| B20 | P2 | ✅ 已修复 | 周视图独立全天条:app.js:459-472(weekAllDay,含全天与跨天)、476 全天/跨天不进 24h 轴;index.html:68 |
| B21 | P2 | ✅ 已修复 | app.js:242-270 `MAX_COLS=3`,第 4+ 个重叠事件归并第 3 列叠层(255)、cols 上限 3(257),符合 PRD §1.2 |
| B22 | P2 | ✅ 已修复 | app.js:550 `isAllDayEdit`,562-568 全天编辑表单(无时间字段)、608/614/619-620 保存保持 allDay 并明确清 end;跨午夜事件经 B5 进全天条 |
| B23 | P2 | ✅ 已修复 | Util.java:142-147 选图缓存只保留最近 3 张;MainActivity.java:571-577 录音失败 `r.release()`;app.js:129-139 背景文件失效时回退纯色并清 bgPath(135-138) |
| B24 | P2 | ✅ 已修复 | app.js:174 viewSeg 点击 → `gotoPage('timeline')`,设置页切日/周正常跳回 |
| B25 | P2 | ✅ 已修复 | AlarmReceiver.java:27-29 test 分流、65-70 `test=true` 发固定"测试通知 ✓"文案且不重排汇总;MainActivity.java:412-417 附 test extra |
| B26 | P2 | ✅ 已修复 | 通知权限:canNotify 桥(MainActivity.java:428-435)+ 警告条双警告(app.js:1092-1102);AndroidManifest.xml:29 configChanges 已含 `uiMode`,深浅色切换不再重建 Activity |

小计:✅ 21 / 🟡 4(B5、B15、B16、B17)/ 🔵 1(B18)/ 未修复 0。

---

## 三、新发现问题列表(本轮新增/修复引入)

> 均为 P2 级,无 P0/P1。

**N1 [P2] 语音"代次 token"是死代码,取消后快速重开浮层会被迟到回调劫持**
- 位置:assets/app.js:656(voiceGen)、664-668(closeVoiceOverlay 里 voiceGen++ 但无任何消费点)、710-747(三个回调只查 `voiceOverlay` 是否 hidden)。
- 场景:用户点"取消"→ 1 秒内重开语音浮层 → 上一轮系统识别迟到的 onResults/onError/onVoiceState('listening') 到达 → 此时浮层可见,守卫放行:要么旧文本直接关浮层弹确认卡,要么 orb 被置为"listening"但识别器早已停止——此时点击 orb 被"listening/processing 忽略"策略(app.js:690)吞掉,浮层假死需再点取消。
- 建议:openVoiceOverlay 时记录 `voiceGen`,三个回调入口校验代次一致才处理;顺带给 listening 态加一个兜底看门狗(如 30s 无回调自动降级)。

**N2 [P2] 提醒通知深链实际从不触发(B17 的修复未生效)**
- 位置:src/com/tomorrow/agenda/AlarmReceiver.java:51-52(openDay=start,值为"YYYY-MM-DD HH:mm")vs MainActivity.java:78(`day.matches("\\d{4}-\\d{2}-\\d{2}")`,matches 是整串匹配,必 false)。
- 后果:点提醒通知仍只开首页,PRD §9.5 未达成;且 `removeExtra` 永远走不到。
- 建议:AlarmReceiver 传 `start.substring(0,10)`,或 MainActivity 改用 `day.substring(0,10)`/前缀匹配。一行改动。

**N3 [P2] 跨天事件在延续日不出现在小组件与"明日汇总"(B5 的原生侧欠账)**
- 位置:src/com/tomorrow/agenda/Occ.java:52-97(expand 只在 start 日产出 occ);WidgetUpdater.java:53;AlarmReceiver.java:74。
- 后果:周一 20:00–周二 08:00 的事件,周二的小组件(2×2/4×2/4×4)与周一晚的"明日汇总"都不含它;日视图却显示"(跨天进行中)",两处口径不一致。
- 建议:Occ.expand 对 end 日 > start 日的一次性事件,在 (start, end] 各延续日产出 allDay=true 的延续 occ(JS 侧同样补齐),排序仍按 allDay 在前。

**N4 [P2] 所有提醒通知共用 PendingIntent(requestCode=98),extras 相互覆盖**
- 位置:src/com/tomorrow/agenda/AlarmReceiver.java:143(`kind == 1 ? 99 : 98` + FLAG_UPDATE_CURRENT)。
- 后果:两条提醒通知同时在通知栏时,点旧通知打开的是最后一次 extras 的 openDay(N2 修复后才会显现);R1 低风险备注"通知 id 同毫秒覆盖"的同族问题。
- 建议:requestCode 用 `("open"+openDay).hashCode()` 或事件 id 派生。

**N5 [P2·观察] "23:00–次日 00:00"这类恰好结束于午夜的事件被误判为跨天**
- 位置:assets/app.js:297(crossDay 判定只比较日期 `end.slice(0,10) > o.day`,不比较时刻)。
- 后果:完全在当天内的事件被挪进全天条并标"至 9月8日",轴内消失。语义小偏差,建议 `ed > sd && end 时间 > "00:00"` 才算跨天。

**N6 [P2·观察] 主题"跟随系统"不再实时响应系统深浅色切换(B26 修复的副作用)**
- 位置:AndroidManifest.xml:29(configChanges 含 uiMode 后 Activity 不再重建,但无 onConfigurationChanged 转发;JS 侧也无监听)。
- 后果:app 停在前台时切系统深色,JS 主题与状态栏颜色保持旧值,需重进页面。影响小,可在后续版本给 WebView 转发 uiMode 变更。

---

## 四、单测结论

`node tests/core.test.mjs` → **56 通过 0 失败**(R1 为 42)。

新增 14 条(tests/core.test.mjs:107-142),与 R1 缺口对照:

| R1 缺口 | 状态 |
|---|---|
| 2. weeks 降序/单元素/非数组 → null | ✅ 已补(114-116、128-131);负数、[1,99] 越界 clamp 仍无直接用例 |
| 3. weekday 越界 → 回落周一 | ✅ 已补(118-120),且 core.js:72 已把 JS 缺省从"NaN→0"改为 1,与 Java 对齐(顺带修掉了 R1 §六的分叉①) |
| 4. 跨年展开 | ✅ 已补(122-123) |
| 5. normalizeCourses weeks 降序 → null | ✅ 已补;PRD §4 periodStart/periodEnd/timeSlots 契约仍无实现无测试(R1 已记为契约偏离观察,维持) |
| 6. 缺 end 课程展开 | ✅ 已补(109-112) |
| 7. courseToEvent 无 weeks → [1,25] | ✅ 已补(125-126) |
| 8. fmtTime/hhmmOf 边界 | 🟡 部分补(133-136);00:00/18:00/23:59、minutesOf NaN 传播仍无 |
| 9. 同刻度排序稳定 | ✅ 已补(138-142) |
| 1. semesterStart 缺省回落 mondayOf(今天) | ❌ 仍无锚定测试(可用相对断言规避"今天"漂移) |
| 10. layoutColumns 导出单测 | ❌ 未采纳:仍是 app.js 内部函数(242-270),2 列/3 列/跨簇/相邻不分列均不可测——R1 明确建议过,且本轮 B21 修复恰好落在这个盲区 |

结论:覆盖明显改善,但 B21(分列)与 semesterStart 缺省仍属"改了但没人看着"的代码,建议下轮补齐(导出 layoutColumns 或抽入 core.js)。

---

## 五、GUI 回归证据核查

- **docs/DEV-TEST-NOTES.md 未更新**:全文仍只有"第一轮"的 T1-T9 与遗留观察,没有第二轮回归(周翻页/撤销/12h 刻度/周全天条)的任何记录;gui-test-screenshots/ 目录也无新截图(仍为 R1 的 14 张 t1-t9)。
- 开发声称的四项 GUI 回归**没有可核对的书面的证据**。本轮对这四项的结论(✅)全部来自静态审查:周翻页控件与绑定(index.html:61-66 + app.js:393-396)、撤销链路(app.js:819-835 + 桥取消闹钟)、12h 刻度重建(app.js:226-227)、周全天条(app.js:459-476)。
- 建议:开发把第二轮回归补进 DEV-TEST-NOTES.md(测试点、操作步骤、截图编号),尤其撤销按钮 5 秒内点击、周视图 ‹/› 连续翻周与"今天"按钮显隐这两个有状态分支。
- 真机清单(R1 §七的 13 项)本轮无新证据,维持待验。

---

## 六、统计速览

| 类别 | 数量 | 明细 |
|---|---|---|
| R1 缺陷已修复 | 21 | B1-B4、B6-B14、B19-B26、B27 |
| R1 缺陷部分修复 | 4 | B5(原生侧未同步)、B15(缺首课日期/冲突标黄)、B16(缺一键体检)、B17(深链不生效=N2) |
| R1 缺陷未修复 | 0 | — |
| 有意的决策 | 1 | B18(4×4 全览替代 4×3 今明两天) |
| 新发现 P0 / P1 | 0 / 0 | — |
| 新发现 P2 | 6 | N1 代次 token 死代码、N2 深链格式错、N3 延续日汇总/小组件缺漏、N4 通知 PI extras 覆盖、N5 午夜结束误判跨天、N6 auto 主题不实时切换 |
| 单测 | 56/56 | 新增 14 条;layoutColumns 与 semesterStart 缺省两缺口仍在 |
