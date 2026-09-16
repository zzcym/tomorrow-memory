# 开发自测记录(浏览器 GUI 实测 + 单测) · 2026-09-07

> 测试方式:assets/ 目录起本地 HTTP 服务,mock-bridge.js 模拟 AndroidBridge(真机中自动失效,
> 且 mock 的 analyzeImage 返回与真桥同构的 {"raw":...}),分辨率 400×860 模拟手机。
> 所有结论都有截图证据,存于 gui-test-screenshots/。

## 环境准备
- `python -m http.server 8642`(assets 目录)
- mock 桥:内存事件种子(今天 3 条+全天 1 条+2 门课)、解析规则、语音 1.2s 返回固定文本、课表识别返回 3 门课

## 测试点与结果(第一轮)

| # | 测试点 | 结果 | 证据 |
|---|---|---|---|
| T1 | 首屏日视图:顶栏日期/计数、日/周切换、⋮菜单、周条、0-24 刻度、当前时间红线、事件块、全天条、底部导航 | ✅ 通过 | t1_day_view_initial.png |
| T2 | 点击 18:00 空档 → 新建抽屉预填 2026-09-07T18:00 → 填标题/地点 → 保存 → toast"已添加" + 顶部计数 4→5 | ✅ 通过(修复后) | t2_create_event_saved_toast.png |
| T3 | 点击课程块 → 课程表日程详情(每周一 08:00-09:40/教室/教师/周次/删除整门课程) | ✅ 通过 | t3_course_event_detail.png |
| T4 | 周视图 | ❌→✅ 第一轮挂:JS 类名与 CSS 不一致(.wg-hlabel/.wg-hline 不存在)、列定位与 flex 冲突 → 修复后通过 | t4_week_view_BROKEN_before_fix.png / t4_week_view_fixed.png |
| T5 | ⋮菜单 → 导入课程表 → 选图 → 视觉识别 → 核对页(学期开始默认本周一/逐行可改/勾选) → 导入 → 替换旧课表 toast → 新课出现在周一 08:00 | ✅ 通过(菜单图标第一轮缺失已修) | t5_menu_icons_BROKEN_before_fix.png / t5_course_import_done.png |
| T6 | 外观抽屉:主题 日间/夜间/跟随系统、背景图 选择/恢复、24h/12h;夜间主题即时生效 | ✅ 通过 | t6_appearance_sheet.png / t6_night_theme.png |
| T7 | 底栏中间说话键 → 全屏语音浮层 → 点击开始 → mock 返回文本 → 自动解析 → 确认卡(可编辑) → 保存 → 明天 20:00 出现 | ✅ 通过 | t7_*.png |
| T8 | 设置页:大模型/视觉/语音转写/提醒规则 四组配置加载与展示 | ✅ 通过 | t8_settings_tab.png |
| T9 | 12h 制:事件块时间变"上午8:00 – 上午9:40" | ✅ 通过 | t9_12h_format.png |

## 第一轮发现并已修复的缺陷
1. [逻辑] core.js expandEvent 对 recur 事件(无 start 字段)被 `if(!e.start) return` 拦截 → 课程永不展开(单测捕获)
2. [逻辑] normalizeCourses 丢弃"缺名字但有时间"的行,改为标记 ok:false 保留给用户看(单测捕获)
3. [布局] 周视图整体错位:JS 生成的类名与 style.css 不一致 + 绝对定位与 flex 冲突
4. [交互] 时间轴空白点击的时间换算把滚动偏移算了两次,点 18:00 预填 23:45
5. [视觉] HTML 静态 data-icon 占位符从未填充,菜单/底栏无图标

## 第二轮:测试 agent 报告 R1(1×P0 + 6×P1 + 20×P2)后的修复与回归

修复:B1(桥返回解包 {"raw":...},mock 改为同构返回)、B2(权限拒绝回调文字兜底)、B3(cancelVoice 统一停系统识别+录音)、
B4(周视图 ‹ › 翻周 + 顶栏周数联动)、B5(跨天事件进全天条)、B6(确认卡单条删除 + 保存后 5 秒撤销)、B7(视觉错误原文展示)、
B8(12h 刻度重绘)、B9(缺 end 不伪造 00:00)、B10(小组件全天/缺 end 判定)、B11(编辑清空结束时间生效)、B12(提醒后刷小组件)、
B13(录音 60s 上限)、B14(错误给重试/打字双入口 + 设置页语音链路状态/重置)、B15(替换条数提示 + 非法 JSON 自动重试一次)、
B16(设置页学期起始日)、B19(Scheduler 索引化)、B20(周视图全天条)、B21(重叠封顶 3 列)、B22(全天事件编辑保持全天)、
B23(选图缓存只留 3 张/录音失败释放/背景失效清设置)、B24(设置页点日/周也能切回时间轴)、B25(测试通知固定文案)、
B26(uiMode 不重建 + 通知权限警告条)、B27(mock 在 file:// 沉默)。
B18 有意决策:4×4 用"今日全览"替代 PRD 的"今明两天"(用户原话只要"今日日程")。

GUI 回归证据(第二轮):
- 周翻页:‹ › 切到 9月14-20,顶栏"第 2 教学周 · 共 2 项"联动 → r2_week_paging_week2.png
- 确认卡单条删除按钮 → r2_confirm_row_delete.png;保存后 toast 带"撤销" → r2_undo_toast.png(撤销后事件块 5→4,数据断言)
- 12h 刻度重绘:hourLabels = ["凌晨12","1","2",…](DOM 断言)

## 第三轮:测试 agent 报告 R2(6 个新 P2:N1-N6)后的修复与回归

修复:N1(语音会话令牌 voiceSession,取消/重开后迟到回调一律丢弃)、N2(深链 openDay 只带日期)、
N3(跨天延续日在 Occ.java/core.js 展开层生成,小组件/晚间汇总同步)、N4(提醒通知 PendingIntent 按 eventId+start 唯一化)、
N5(恰在午夜 00:00 结束不算跨天)、N6(auto 主题监听系统深浅色切换实时响应)。
layoutColumns 移入 core.js 并补单测(2 列/3 列封顶/不重叠)。单测 63/63 通过。

GUI 回归证据(第三轮):
- 新建"周三 20:00 → 周五 08:00"跨天事件:
  - 周三:全天条"露营(跨天)(20:00 至 9月11日 08:00)",轴内 0 块(PRD:不进 24h 轴) → r3_crossday_wed_bar.png
  - 周四/周五:全天条"露营(跨天)(跨天,进行中)"(DOM 断言)
  - 周六:全天条隐藏(DOM 断言)

## 第四轮:测试 agent 报告 R3(4 项跟进)后的修复与回归

修复:R3-A(语音会话令牌真正贯通:startVoice(preferCloud, token) → 原生所有语音回调回带 token,
JS 比对 S.voice.token,取消/重开后迟到回调精确丢弃;mock 同构更新)、R3-B(恰在 00:00 结束的跨天事件
改为"占满前一天":延续日到 endDay-1 为止,修复多天事件延续日全丢;core.js 与 Occ.java 同步)、
R3-C(深链冷启动竞态:WebViewClient.onPageFinished 后再派发,未就绪先缓存 pendingDeepLink)、
R3-D(补拍新文案截图 r4_*.png 替换过时证据)。

GUI 回归证据(第四轮):
- 带 token 语音链路:mic → orb → 自动解析 → 确认卡 1 行(DOM 断言)
- 周一 20:00 → 周三 00:00 事件:周一全天条"通宵项目上线(20:00 至 9月9日 00:00)"、周二"(跨天,进行中)"、周三"(无)" → r4_crossday_new_chip_text.png / r4_midnight_end_check.png

## 第五轮:测试 agent 报告 R4(2 项回归)后的修复与回归

修复:V1(P1·深链正则丢失连字符 `\d{4}\d{2}\d{2}` → `\d{4}-\d{2}-\d{2}`,恢复 N2 修复)、
V2(P2·crossDayEnds 对 23:00→次日 00:00 返回真值空数组导致误入全天条 → 空数组改返回 null,事件留在 24h 轴)。
单测补 1 条断言(跨午夜 1 小时内结束不算跨天)。

GUI 回归证据(第五轮):
- 夜班值守(23:00→00:00):留在轴内(monAxisBlocks=4 含它),全天条无它(DOM 断言) → r5_midnight_in_axis_tuesday.png
- 运动会筹备(周二 22:00 → 周四 08:00):周三全天条"运动会筹备(跨天,进行中)" → r5_wed_continuation_bar.png

## 第六轮(v2.1 · 用户反馈驱动)

用户反馈:①周视图头部拥挤 → 删独立翻页行,‹ › 移入星期表头两侧,日期区间/教学周数并入顶栏,"今天"收进顶栏(日/周通用),日视图同步减负;②课程表导入取消 app 内图片识别 → 改为内置可复制提示词 + 粘贴 AI 输出(JSON 或行格式,新增 core.parseCourseLines),随之删除视觉模型配置/analyzeImage/Util.vision 全链路。

开发自测:单测 73/73(新增 parseCourseLines 6 条断言);GUI 验证头部布局、JSON 粘贴(带围栏容错)、行式粘贴、设置页精简、背景图链路、教学周顶栏。
测试 agent 两轮复验后放行(报告见 TEST-REPORT-R4.md「v2.1 变更验证 / v2.1 放行复验」);期间修复其发现的回归:
- P1 onImagePicked 回调被误删(背景图选完无反应)→ 恢复(仅 bg 用途)
- P1 stopVoice 桥签名参数个数不匹配(JS 传 1 参)→ Java 改 stopVoice(String token)
- P2 .wg-day 表头样式随旧块误删 → 恢复
- P2 parseCourseLines 支持「点」字时间与全角破折号/波浪线
- P3 parsePastedCourses 优先定位 {"courses"、版本号 v2.1、周顶栏改"第 N 教学周"、Matcher import 清理

## 单测
`node tests/core.test.mjs` → 73 通过 0 失败(日期工具/一次性展开/周重复+单双周/跨年/课程 JSON 宽容归一化/
文本行解析/缺 end/weeks 降序/weekday 越界/跨天延续含午夜结束/layoutColumns 分列/边界)

## 遗留观察(已全部由测试 agent 裁定)
- O1 12h 刻度 → 已修复(B8);O2 周视图迷你块截断 → 预期内不算缺陷;O3 周视图全天条 → 已实现(B20);
- O4 真机项 → 见 TEST-REPORT.md §七"需真机"清单(语音引擎各 ROM、录音上传、相册、小组件渲染、通知、精确闹钟、BOOT、深链)

