# 明日日程 v2 · 独立测试报告

> 测试人:独立测试工程师 · 日期:2026-09-07
> 方式:黑盒(浏览器 mock 环境)× 静态审查(assets/*.js 与 src/*.java 全量)+ 单测运行 + 截图抽查
> 输入基线:docs/PRD.md(v2)、docs/DESIGN-SPEC.md、docs/DEV-TEST-NOTES.md(开发已修复的 5 个缺陷不在本报告重复)

---

## 一、结论:**需修复后发布**

- 静态审查发现 **1 个 P0**:课程表导入在真机上必然失败(浏览器 mock 环境掩盖了桥返回格式不一致),直接击穿需求 3 的主链路。
- 另有 6 个 P1(语音权限拒绝挂起、语音取消后状态泄漏、周视图无法翻周、跨天事件不进全天条、确认卡无删除/撤销、视觉模型错误被吞),均属"主流程明显出错"级别。
- 单测 42/42 通过;但覆盖集中在 core.js 纯函数,归一化/展开的非法输入分支与 JS↔Java 展开一致性无交叉验证。
- 开发自测的 9 个测试点与截图证据核对相符(抽查 6 张,见 §六);三个遗留观察 O1-O4 的裁定见 §五。

---

## 二、需求验收矩阵

| # | 需求 | 结论 | 依据与理由 |
|---|---|---|---|
| 1 | 语音:无死胡同、无解析按钮、底部说话键 | **部分通过** | ✅ 三级决策树已建:系统识别不可用→`onVoiceError('unavailable')`→文字兜底(MainActivity.java:257-264);云端转写链路、文字兜底、错误计数(app.js:641-651)均在;说话键居中凸起 ✅;语音链路自动解析无"解析"按钮 ✅(文字兜底 sheet 的"解析添加"属打字路径必要提交键,不算违规)。❌ 麦克风权限拒绝后无回调,浮层卡死"正在听"(B2);取消语音不停止系统识别(B3);系统识别失败只 toast,无 PRD §6 要求的"没听清+点此打字",也无"语音识别方式"状态行/重置入口(B14);云端录音无 60s 上限(B13)。 |
| 2 | 时间轴 0-24(可 12h)、日/周右上切换、切换按钮在底部 | **部分通过** | ✅ 0-24 轴、红线 30s 刷新、空档点击预填、周条、底部导航(日程/🎤/设置)均实现;t1/t9 截图相符。❌ 周视图没有任何翻周控件,‹/› 只存在于日视图头部,且周标题/教学周数固定取"今天所在周"(B4);跨天事件(周一20:00–周二08:00)不进全天条、次日部分丢失,PRD §1.4 该验收项失败(B5);重叠分列无 3 列上限(B21);12h 下左侧刻度不重绘(O1→B8);日视图标题无"第 x 教学周"(PRD §1.1.7,仅周视图有且受 B4 影响)。 |
| 3 | 课表截图导入(⋮ 图标菜单 → AI → 解析入库) | **部分通过(mock 通,真机断)** | ✅ 入口 ⋮ icon-only 菜单 ✅;选图→视觉模型→归一化→预览可编辑/勾选→学期起始日默认本周一→重导替换(source:"timetable" 全删再写)✅;t5 证据相符。❌ **P0 B1**:原生 `analyzeImage` 返回 `{"raw":"<模型输出>"}`,JS 直接把外层对象喂给 `normalizeCourses`,真机上永远走"没有认出课程"分支;❌ 原生 `{"error":...}` 未判别,B7;无"非法 JSON 自动重试 1 次"(PRD §3.4);预览无首课日期/冲突标黄/"将替换 n 条"提示(PRD §3.1.2/3.1.3,B15);PRD §4 的 periodStart/periodEnd+timeSlots 契约未实现(改为 prompt 让 AI 直接输出时间,契约偏离但自洽,记 P2 观察项)。 |
| 4 | 日/夜两套色调、自定义背景图、默认白 | **通过** | ✅ 默认白底日间(theme:'day' 默认);日/夜/跟随系统三档,夜间 #0E1211 深 token 独立;t6 夜间截图可读性良好;has-bg 双层遮罩(14% 白纱/35% 黑纱 + 面板 blur + 事件块近实心底)与 DESIGN-SPEC §7 一致;背景图复制进私有目录并降采样 ≤1600px(Util.savePickedImage)。⚠️ P2:背景图文件被清理后不清 bgPath 设置(PRD §5.2,归入 B23)。 |
| 5 | 桌面小组件多种尺寸,提示今日日程 | **部分通过(需真机)** | ✅ 2×2/4×2/4×4 三种并列注册;空态文案"今天没有安排(,点按添加)"✅;点击打开 app ✅;深浅色跟随系统(values-night)✅;刷新时机 ①事件增删改(桥内 scheduleAll→updateAll)③00:05 ④开机 ⑤onUpdate ✅。❌ 4×4 是"今日全览",PRD 要求 4×3"今明两天"含明日区与分区点击(B18);提醒触发后不刷新小组件(PRD §7②,B12);只排全天事件的日程,2×2 显示"今天日程已结束"(B10)。 |

---

## 三、缺陷清单

> 严重度:P0=主流程坏 / P1=明显功能错 / P2=打磨。行号以当前工作区文件为准。

### P0

**B1 [P0] assets/app.js:746 + src/com/tomorrow/agenda/MainActivity.java:232 — 真机课程表导入 100% 失败**
- 复现:真机 ⋮→导入课程表→选图 → 视觉模型成功返回 → 界面仍报"没有从截图里认出课程"。
- 根因:原生返回 `{"raw":"<模型 content 字符串>"}`(MainActivity.java:232),JS `Core.normalizeCourses(content)` 只认 `{courses:[...]}` 或数组(core.js:120-123),`{raw:...}` 直接返回 `[]`。mock-bridge.js:85-91 返回的是裸 courses 对象,所以 GUI 测试 T5 通过——桥 mock 保真度缺口。
- 附带:原生返回 `{"error":"请先配置视觉模型..."}` 时同样落到"没认出课程"(见 B7)。
- 建议修法:JS 侧 `const payload = content.error ? {error:content.error} : (typeof content.raw === 'string' ? safeJsonParse(content.raw) : content);` 再喂 normalizeCourses;或原生直接返回模型 JSON 已解析的对象。修后必须脱离 mock 用真桥(或让 mock 返回 `{"raw":...}`)回归一次。

### P1

**B2 [P1] MainActivity.java:75-81, 246-252 — RECORD_AUDIO 拒绝后语音浮层永久卡在"正在听"**
- 复现:首次点说话键 → 系统权限框 → 点"拒绝" → 无任何回调,浮层停在"● 正在听,请说话…",只能手动取消;再次进入仍重复。违反 PRD §2.2 第 1 条(拒绝→直接开文字兜底)。
- 建议修法:`onRequestPermissionsResult` 的 deny 分支 `sendToJs("window.onVoiceError(... '权限未开…','unavailable')")`,复用 JS 文字兜底。

**B3 [P1] assets/app.js:583-586 + MainActivity.java:317-332,433-481 — 取消语音不停掉系统识别,状态泄漏**
- 复现:点说话键(系统识别 listening 态)→ 点"取消"浮层关闭 → 这时对手机说话 → 识别结果回来后确认卡突然自动弹出(或稍后超时 toast),麦克风被 recognizer 持续占用。
- 根因:`stopVoiceCancel` 只处理 MediaRecorder;SpeechRecognizer 没有 stopListening/销毁路径;JS `onVoiceResult` 还会主动 doParse。
- 建议修法:桥加 `cancelVoice()` 统一停 recognizer + recorder;voCancel 无条件调用;`onVoiceResult` 回调时校验浮层是否被用户取消(加代次 token)。

**B4 [P1] assets/index.html:60-65 + assets/app.js:170-179, 342-344 — 周视图无法翻周,周标题/教学周数固定为"今天所在周"**
- 复现:切到周视图 → 无任何 ‹/›/滑动可切上一周/下一周(‹/› 只在日视图头部;swipe 只绑在 timelineScroll);在日视图翻到下周再切回周视图,网格正确但顶栏仍显示"9月7日 那一周/第 1 教学周"(renderTopbar 用 `mondayOf(Core.todayStr())`,网格用 `mondayOf(S.view.day)`)。违反 PRD §0"‹ › 日期翻页(日/周视图内切上一天/上一周)"。
- 建议修法:周视图头部加 ‹/›(±7 天);renderTopbar 周分支改用 `mondayOf(S.view.day)`;顺带处理 `backToday` 在周模式的可见性。

**B5 [P1] assets/app.js:277-298 + assets/core.js:92-98 — 跨天事件不进全天条,PRD §1.4 验收项失败**
- 复现:新建"周一 20:00 至周二 08:00"事件 → 周一视图:块画在轴内 20:00 处、仅 24px 高,且 21:00 起被标为 `past` 灰显(endMin=480 < now);周二视图:完全不显示。PRD §1.4 明确要求"出现在顶部全天条且不在轴内"。
- 建议修法:occ 展开时若 end 日 > start 日(或跨午夜),在视图层转 allDay 呈现并标"跨天/跨午夜"(core.js 与 Occ.java 同步补齐,end 日 > start 日时在各目标日生成全天 occ)。

**B6 [P1] assets/app.js:684-721 — 语音确认卡无单条删除、保存后无 5 秒撤销**
- 复现:语音解析出 3 条 → 只能整卡"放弃",不能删其中 1 条;保存后 toast 无"撤销"。PRD §2.1.3 与 §2.3 验收("G 保存 3 条 / W 点撤销 / T 3 条被删除,闹钟同步取消")直接失败。
- 建议修法:确认卡每条加 × 删除(S.pending splice + 重渲染);保存 toast 加撤销动作(记录 addEvents 返回的新 id 列表,撤销即逐条 deleteEvent,闹钟随 scheduleAll 同步取消)。

**B7 [P1] assets/app.js:741-760 — 视觉模型的错误被吞,显示误导文案**
- 复现:未配置视觉模型/Key 错误/模型不支持图像 → 全部显示"没有从截图里认出课程。请确认拍的是课程表…",用户会反复换截图。PRD §3.3 要求明确提示"当前模型不支持看图,请在设置→视觉模型中配置"。
- 建议修法:analyzeCourse 先判 `content.error` 原样展示,再走归一化;归一化为 0 条才提示"没认出课程"。

### P2

**B8 [P2] assets/app.js:201-212, 863-868 — 12h 切换后左侧小时刻度不重绘(O1 根因)**
- `renderHours` 以 `childElementCount===24` 缓存,fmtSeg 切换只调 renderTimeline,刻度停留在 24h 数字,与事件块"上午8:00"不一致(t9 截图可见)。修:去掉早退或记录 lastFormat 强制重建;同时验证 52px gutter 对"凌晨12"这类长标签的宽度。

**B9 [P2] assets/core.js:130 — normalizeCourses 把"缺 end"规范成 "00:00"**
- `normHm('')` 返回 '00:00',而非空串。后果:该课程块显示"08:00 – 00:00"、只画 20 分钟高(min 端点反超),通知正文出现"08:00 - 00:00"。修:end 缺失时保持 `''`,布局层默认 +60 分钟(现有逻辑即可接管)。

**B10 [P2] src/com/tomorrow/agenda/WidgetUpdater.java:49-55,63-66,91-92 — 全天事件在"下一条"与"进行中"判定错误**
- 全天事件 end 缺失,按 start 当天 00:00 判定,00:00 之后永远 `end<now`。只排全天事件的日程:2×2 显示"今天日程已结束";列表行全天不标"进行中"倒也无妨,但"下一条"应为全天事件时同样漏选。修:end 为空且 allDay → 视为全天进行中。

**B11 [P2] assets/app.js:541-542 + MainActivity.java:163-174 — 编辑时清空"结束时间"不生效**
- JS 仅在 end 非空时才放进 patch,桥按 key 合并且不删键 → 旧 end 永远残留。修:JS 无条件传 end(空串),Java 对 end=="" 执行 `e.remove("end")`(remindedMap 已清,重排无副作用)。

**B12 [P2] src/com/tomorrow/agenda/AlarmReceiver.java:38-61 — 提醒触发后不刷新小组件(PRD §7②)**
- handleReminder 发完通知只写 remindedMap;2×2 的"下一条/进行中"在提醒时刻不更新。修:handleReminder 末尾 `WidgetUpdater.updateAll(ctx)`。

**B13 [P2] src/com/tomorrow/agenda/MainActivity.java:269-315 + Util.java:89 — 云端录音无 60s 上限,超时不自动落文字兜底**
- PRD §2.2/§6:录音上限 60s、转写 60s 未返回提示并自动进文字兜底。实现无计时器,readTimeout=90s,超时只 toast"转写失败"。修:JS 侧 60s 计时自动 stopVoice + 降级;native 读超时给稳定错误码。

**B14 [P2] assets/app.js:641-651 + MainActivity.java:459-470 — 系统识别失败仅 toast,缺"点此打字";无"语音识别方式"状态行/重置入口**
- PRD §6 step3 要求「没听清,再试一次」+「点此打字」;§6 末尾要求设置页显示当前生效链路并可重置标记。实现 toast 后用户需自行重按;voicePreferCloud 一旦置位无 UI 可清。修:onVoiceError 提供双按钮(重试/打字);设置页加状态行+重置。

**B15 [P2] MainActivity.java:216-241 + assets/app.js:762-820 — 课表导入缺重试/首课日期/冲突标黄/替换条数提示**
- PRD §3.4"非法 JSON 自动带错误重试 1 次"、§3.1.2"显示换算后的首次上课日期、冲突标黄"、§3.1.3 确认页明示"将替换现有课表事件 n 条"均未实现。

**B16 [P2] assets/index.html:70-124 + app.js:879-929 — 设置页缺"学期起始日"配置项(PRD §0/§3.3)与 LLM/视觉/转写"一键体检"(PRD §9.4)**
- 学期起始日只能在导入预览里改,导入后发现选错无入口(PRD 明确要求设置页可改);测试通知≠连通体检。

**B17 [P2] src/com/tomorrow/agenda/AlarmReceiver.java:133-136 — 通知点击只开首页,无深链(PRD §9.5)**
- 修:pi 附 extras(day/eventId),WebView 加载后按 extra 定位。

**B18 [P2] src/com/tomorrow/agenda/WidgetUpdater.java:21-29 + AndroidManifest.xml:42-63 — 小组件规格与 PRD §7 不一致**
- 第三尺寸实为 4×4"今日全览 8 条",PRD 是 4×3"今明两天"(明日区+分区点击);4×2 只显示 3 行(PRD ≤6 行+"还有 n 件")。需求 5 字面("多种尺寸,提示今日日程")满足,规格细节偏离,建议与用户确认后二选一。

**B19 [P2] src/com/tomorrow/agenda/Scheduler.java:52,69-80 — isReminded 每次调用整体读盘+JSON 解析,scheduleAll 呈 O(事件数×occ 数)**
- 每次 onResume/保存设置都全量重排;60 天视界 + 数十事件时启动/回前台可能肉眼可见卡顿(低端机)。修:循环外读一次 events 传入;或 remindedMap 建索引。

**B20 [P2] assets/app.js:407-412 — 周视图全天块画在 0:00 网格内,互相重叠且与 0 点事件重叠(O3 关联)**
- 多条全天事件全在同一 top:0、高 20px,彼此覆盖;也不符合 PRD"全天不进 24h 轴"。修:周视图顶部加全天条(复用日视图 allday-bar)。

**B21 [P2] assets/app.js:215-242 — 重叠分列无"最多 3 列,第 4 个叠层"策略(PRD §1.2)**
- 列数无上限,一格 5+ 事件时每列过窄只剩竖条。修:cols>3 时归并为 3 列 + 右侧叠层。

**B22 [P2] assets/app.js:483-494 — 编辑全天事件会被强制转成 00:00 的 timed 事件;23:30-00:30 跨午夜事件未按 PRD §1.3 处理**
- 修:编辑 allDay 事件保持 allDay(隐藏开始/结束时间或提供"全天"开关);跨午夜随 B5 一并处理。

**B23 [P2] 临时文件与状态清理**
- Util.java:137:每次选图生成 `pick_<ts>.jpg`,课程导入反复选图后永久堆积(建议导入完成/失败后删除);
- MainActivity.java:500-505:MediaRecorder prepare/start 失败分支未 `r.release()`;
- app.js:104-127:背景图文件失效时不清 bgPath(违反 PRD §5.2"回退纯色并清除设置项")。

**B24 [P2] assets/app.js:152-158 — 在设置页点顶栏"日/周"无反应**
- viewSeg 只改 mode + renderTimeline,不把 `view-timeline` 置为 active;用户点开关看似失灵。修:切 mode 时同时切 page。

**B25 [P2] MainActivity.java:360-365 — "测试一条通知"实发的是"明日汇总"**
- 复用 digest 分支且忽略 `test` extra;明天无日程时用户看到"明天暂无日程安排,好好休息"会困惑测试是否成功。修:kind="digest" 且 test=true 时发固定测试文案并不重排 digest。

**B26 [P2] 权限与系统配置的次生问题**
- POST_NOTIFICATIONS 被拒后无任何应用内提示(顶栏警告条只管精确闹钟),提醒会静默丢失(MainActivity.java:61-64);
- configChanges 未含 `uiMode`(AndroidManifest.xml:29):系统深浅色切换会重建 Activity,浮层/输入/半填表单全部丢失(WebView 重载回日视图)。

**B27 [P2] assets/index.html:242 — mock-bridge.js 打包进正式 APK**
- 桥注入正常时静默失效,但一旦真桥注入时序异常,mock 会顶替真桥返回种子数据(与 B1 同类保真度风险)。修:构建期剔除或以 `?mock=1` 显式开启。

### 低风险备注(不单列缺陷)
- Scheduler.java:116:`PendingIntent` requestCode 用字符串 hashCode,理论上可碰撞导致个别提醒丢失(事件量大时概率约 n²/2³³,可忽略;如要稳妥改自增序号表)。
- Scheduler.java:57-58:新增事件距开始不足 lead 分钟时静默无提醒(可改为立即补一条)。
- AlarmReceiver.java:147:通知 id `(int)System.currentTimeMillis()%1_000_000`,同毫秒两条会互相覆盖(概率极低)。
- build-apk.sh:keystore 密码明文入库(agenda123),个人项目可接受,转正式发布前更换。

---

## 四、单测覆盖缺口(node tests/core.test.mjs,42/42 通过)

现有覆盖:日期工具、一次性展开、周重复+单双周+第 17 周越界、宽容归一化(5 类输入)、courseToEvent、空数据。**未覆盖**:

1. `expandEvent` semesterStart 缺省时回落 `mondayOf(今天)` 的行为(无测试锚定,JS/Java 双侧一致性靠人肉);
2. weeks 非法形态:降序 [8,3](现产出 0 条)、单元素 [5]、越界 [1,99] 的 clamp 40、负数、非数组;
3. weekday 越界/缺失(0、8、undefined → JS 侧 NaN|0=0 会展开到 semesterStart 前一天,Java 侧默认 1,行为分歧无测试);
4. 跨年/跨月展开(semesterStart=2026-12-28,第 2 周 → 2027-01-04);
5. normalizeCourses:weeks 降序 → null 的分支;PRD §4 契约字段 dayOfWeek/periodStart/periodEnd/timeSlots(实现仅支持 time 直给,period 换算整条链路无实现也无测试,先立测试防回归);
6. 缺 end 课程的展开结果(会暴露 B9);
7. courseToEvent 无 weeks → 默认 [1,25];
8. fmtTime 更多边界(12:00 中午已测;00:00、18:00、23:59、非法串回退)与 hhmmOf 钳制(负值、>1440)、minutesOf 非法输入的 NaN 传播;
9. occurrences 同刻度多条的排序稳定性;
10. **layoutColumns 重叠分列完全不可测**(app.js 内部函数未导出)——建议导出进 core 或单测副本,补 2 列/3 列/跨簇/相邻不分列(s==clusterEnd)用例。

---

## 五、DEV-TEST-NOTES 遗留观察 O1-O4 裁定

| # | 观察 | 裁定 |
|---|---|---|
| O1 | 12h 下日视图左侧刻度仍是 01/02… | **是缺陷(P2,B8)**。根因已定位:`renderHours` 的 `childElementCount===24` 缓存使 fmtSeg 切换不重建刻度;修复时注意 12h 标签("凌晨12")在 52px gutter 内的宽度。事件时间已是 12h,同屏两种格式属一致性错误,不是纯打磨。 |
| O2 | 周视图迷你块标题 400px 下截断 | **不是缺陷**。PRD §1.1.5 明确此取舍("块内只画颜色块+事件名前 3 字"),t4 截图与预期一致;详情卡已兜底。可选优化:块内主动截 3 字+省略,视觉比随机截断更整齐。 |
| O3 | 周视图滚动定位 07:00,全天块在顶部需滚回看 | **部分是缺陷**。滚动定位本身可接受(与日视图同策略,07:00 是合理工作时段锚点);但暴露出周视图把全天块画进 0:00 网格(B20):既与 0 点事件重叠、多条全天互相覆盖,又违背 PRD"全天不进 24h 轴"。建议周视图加独立全天条,而非改滚动位置。 |
| O4 | 真机部分无法在浏览器覆盖 | **属实,接受**。已在本报告 §七列"需真机"清单;且本次静态审查证明该风险真实存在——B1(桥返回格式)、B2(权限回调)恰是 mock 环境测不到、真机必现的类型,建议下轮 GUI 测试用真桥录制/回放而非规则 mock。 |

### 截图抽查核对(6/14 张)

- t1_day_view_initial:顶栏/周条/全天条/0-24 刻度/红线/底部导航与开发结论一致 ✅
- t4_week_view_fixed:修复后 7 列对齐、教学周标尺显示 ✅(mini 块截断=O2,全天块不可见=O3 属实)
- t5_course_import_done:替换 toast + 新课 Monday 08:00 出现 ✅(仅证明 mock 链路,B1 未被此证据覆盖)
- t6_night_theme:夜间配色可读、事件块夜 token 正确 ✅
- t7_voice_parsed_confirm:确认卡可编辑、时间预填 2026/09/08 20:00 ✅(无单条删除/撤销=B6 可见)
- t9_12h_format:事件块 12h ✅、左侧刻度仍 24h 数字(=O1/B8 直接证据)✅

---

## 六、core.js ↔ Occ.java 展开规则比对结果

逐项核对 weekday 语义(1=周一…7=周日,`dowOf` 周日=7)、parity(odd 跳偶/ even 跳奇)、weeks 越界 clamp [1,40] + 缺省 [1,25]、semesterStart 缺省=本周一、全天排序(allDay 前,start 字符串序)、recur start 缺省 00:00、end 空跳过:**两份实现语义一致,未发现会产出不同日期/条数的分叉**。仅两处非语义性差异:① weekday 缺失时 JS(NaN→0)与 Java(默认 1)落点不同,但现有数据源(归一化)保证 1-7,不可达;② end 非 DT 格式时 Java 丢弃、JS 透传(仅影响畸形数据)。上列 B9 是 JS 侧归一化在写入前就引入的脏数据,与 Occ.java 无关。

---

## 七、需真机验证清单(全部标注"需真机")

1. **课表导入全链路(B1 修复后)**:真实视觉模型返回 → 预览 → 导入(需真机/真实 API)
2. 麦克风权限:首次授权/永久拒绝/系统"仅本次"三种路径下语音链路(B2/B3 回归)(需真机)
3. 系统 SpeechRecognizer:各 ROM 可用性、ERROR_NO_MATCH/TIMEOUT 行为、"连续 2 次失败→自动走云端"(需真机)
4. 云端转写:MediaRecorder 真机录音(m4a)、上传 multipart、60s 大录音、转写失败降级(B13)(需真机)
5. 相册选图:各文件管理器 ACTION_GET_CONTENT、HEIF/旋转 EXIF 截图(需真机)
6. 小组件:三种尺寸实际渲染、values-night 跟随系统、点击拉起 app、00:05 跨天刷新(B10/B12/B18)(需真机)
7. 通知:Android 13+ POST_NOTIFICATIONS 授权前后、heads-up 显示、点击深链(B17/B26)(需真机)
8. 精确闹钟:Android 12/13+/14 的 SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM 实际授权路径与警告条(需真机)
9. BOOT 开机恢复闹钟与小组件(需真机)
10. WebView localStorage 持久性(voicePreferCloud/voiceFailCount/背景缓存跨进程存活)(需真机)
11. 杀进程重开后夜间主题/背景图保留(PRD §5.3)(需真机)
12. 系统深浅色切换时 Activity 重建表现(B26)(需真机)
13. 低端机上 onResume scheduleAll 耗时(B19)(需真机)
