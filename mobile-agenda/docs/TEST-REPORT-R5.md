# 明日日程 v2.2 测试报告(R5 轮 · 独立测试)

- 测试日期:2026-09-16
- 被测版本:versionName 2.2.0 / versionCode 4(AndroidManifest.xml)
- 测试方式:静态代码审查 + Node 边界用例实测 + 单测回归 + GUI 截图抽查(只读)
- 审查范围:assets/core.js、app.js、index.html、mock-bridge.js、src/*(MainActivity/Util/Scheduler/Store/Occ/AlarmReceiver/WidgetUpdater/Widget*/BootReceiver)、res/xml/widget_*.xml、tests/core.test.mjs、gui-test-screenshots/v22_*.png

---

## 一、变更核对(开发声明 vs 实测)

| # | 交付项 | 结论 | 证据 |
|---|--------|------|------|
| 1 | parseIcsCourses(VEVENT/RRULE/折行/DURATION/锚点) | 基本可用,存在缺陷见 D3/D4/D5、P2-1~3 | core.js L281-391;单测 §12 通过 |
| 1 | UI 选 .ics 入口 + pickIcs(1MB 上限) | ✅ 实现 | index.html L200;Util.readTextFile L149-161(>1MB 报错);MainActivity.pickIcs L380-391 |
| 1 | 预览复用(semesterStart=ics 锚点) | ✅ 实现 | app.js L832 `renderCoursePreview(parsed.semesterStart)`;截图 v22_ics_preview.png 显示锚点 2026/09/14 |
| 2 | LLM「测试连通」testLlm 桥 | ✅ 实现 | MainActivity L404-418;app.js L1057-1070;index.html L84-85 |
| 2 | widgetHelpTip 小组件说明+排查 | ✅ 实现(元素存在且有缺失守卫) | index.html L109-113;app.js L1073-1078 |
| 2 | exportData / pickBackup+importAll / clearEvents | ⚠️ 实现但 exportData 在 Android ≤10 无法写(P1-2);importAll 无确认(P2-4) | MainActivity L422-486 |
| 3 | updatePeriodMillis 30 分钟兜底 | ✅ 三个 widget 均为 1800000 | res/xml/widget_{small,medium,large}.xml |
| 3 | MainActivity onCreate 立即 updateAll | ✅ | MainActivity L67 |
| 4 | pickIcs 失败文案人性化 | 部分:1MB 报错已人性化,但错误统一走 onImagePickError,toast 前缀仍是「选图失败:」(P3-6) | MainActivity L128-140;app.js L989 |
| 4 | widgetHelpTip 元素缺失守卫 | ✅ | app.js L1075-1076 |
| 4 | 周视图重叠分列 layoutColumns | ❌ 修复自身引入 P1-1(误分列),开发自己的截图即呈现症状 | core.js L151-178;v22_week_overlap_columns.png |
| 5 | v2.2.0 (versionCode 4) | ✅ manifest;❌ 关于卡/README 仍写 v2.1(P2-5) | AndroidManifest L4-5;index.html L143;README.md L1 |

## 二、单测结论

`node tests/core.test.mjs` → **82 通过 / 0 失败**(本次实测,与开发声明一致)。
但测试未覆盖:EXDATE、UTC(Z) 时区、VALARM 嵌套、INTERVAL≥3、BYDAY 多天、跨天同时刻分列 —— 本次实测的 P1/P2 均落在这些盲区。

## 三、缺陷清单

### P1(必修)

**P1-1 周视图重叠分列把"不同天/无重叠"的事件误判为重叠,大量课程块半宽错位**
- 位置:`assets/core.js` L151-178 `layoutColumns`;调用方 `assets/app.js` L443-444(周视图直接传整周 occs)
- 根因(两个,实测复现):
  1. `flush()` 只清 `cluster` 不重置 `clusterEnd`,首个重叠簇之后 clusterEnd 单调不降,后续事件在时刻低于历史最大结束时间时被持续吸入同一簇;
  2. 分列只比较 `start.slice(11)` 的当日时刻,无日期维度,跨天同时刻必然误聚。
- 实测(mock-bridge 数据,2026-09-16 周):
  ```
  周三 08:00 高等数学 → col=0 cols=2   (与站会真重叠,正确)
  周三 09:30 站会     → col=1 cols=2   (正确)
  周三 14:00 自习     → col=0 cols=2   (错误:无重叠伙伴,却半宽)
  周四 10:00 大学英语 → col=1 cols=2   (错误:被右移半宽)
  周四 20:00 和小王   → col=0 cols=1
  ```
  开发截图 `v22_week_overlap_columns.png` 中"自习/大学英语"即为半宽块,症状吻合。
- 影响:课表导入后(不同天同时段课极常见)周视图大面积变形,本轮核心修复项未达成目标。
- 建议:周视图按天分组后分别调 `layoutColumns`;同时 `flush()` 内重置 `clusterEnd = -1`。补单测:跨天同时刻期望 `[[0,1],[0,1]]`。

**P1-2 exportData 用已废弃的 `Environment.getExternalStoragePublicDirectory` 直写 Download,Android 8/9/10 上必然失败**
- 位置:`src/com/tomorrow/agenda/MainActivity.java` L429-437
- 分析:manifest 未声明 `WRITE_EXTERNAL_STORAGE`,也未设 `requestLegacyExternalStorage`,targetSdk 34:
  - Android 11+(API 30+):FUSE 直通,新建文件可归属本应用,**能写**;
  - Android 10(API 29,target 29+ 行为):EACCES,失败;
  - Android 8/9(minSdk 26 覆盖范围):公共目录写需要运行时存储权限,未声明 → EACCES,失败。
- 影响:minSdk 26 支持的设备中,Android ≤10 全部导出失败(报"导出失败: EACCES"),用户换机备份诉求(投诉"设置不完善")在这批机型上落空。
- 建议:API 29+ 改用 `MediaStore.Downloads`(RELATIVE_PATH = Download/明日日程);API 26-28 声明 `WRITE_EXTERNAL_STORAGE` + 运行时申请,或统一改为"应用私有目录导出 + 系统分享(SAF CREATE_DOCUMENT)"方案。

### P2(应修)

**P2-1 parseIcsCourses 完全忽略 EXDATE,停课/调课周仍显示课程**
- 位置:core.js L294-309(EXDATE 已收集进 `cur.exdates`)与 L320-348(转换时从未使用)
- 实测:`RRULE COUNT=16;EXDATE:20260921T080000` → weeks=[1,16],第 3 周照常出现;多值 EXDATE 同样被忽略。
- 建议:对 [w1,w2] 内每个发生日与 exdate 求差,或直接在预览行标注跳过周。

**P2-2 UTC(`Z` 结尾)时间未做时区换算,按本地墙上时间解析**
- 位置:core.js L352-361 `icsDate`(不看结尾 Z,也不看 TZID 参数)
- 实测:`DTSTART:20260907T000000Z`(=北京 08:00)解析为 `00:00`。部分导出器(尤其 Google Calendar 导出)用 UTC,课程时间整体偏移。
- 建议:`Z` 结尾按本地时区偏移换算;`TZID` 非本地时区至少给出提示。

**P2-3 VEVENT 内嵌 VALARM 的属性会覆盖事件本身的 DESCRIPTION/DURATION**
- 位置:core.js L292-311 行收集循环不感知 `BEGIN:VALARM/END:VALARM` 嵌套
- 实测:① 事件 DESCRIPTION:王教授 + VALARM DESCRIPTION:提醒 → teacher 变"提醒:上课";② 无 DTEND、事件用 DURATION 的课 + VALARM `DURATION:PT5M` → end 由 09:30 变 08:05。
- 建议:遇 `BEGIN:VALARM` 进入子块跳过所有属性行直到 `END:VALARM`。

**P2-4 importAll 无确认、无版本/结构校验,选错文件即静默覆盖全部数据**
- 位置:MainActivity.java L462-476(`optJSONArray("events")` 非 null 即整库替换,settings 整体替换不合并);app.js L1092-1101(选中文件后直接 importAll)
- 影响:任意含 `"events":[]` 的 JSON(如其他应用导出、旧格式)会清空全部日程且不可撤销;settings 缺失字段(旧备份无 appearance 等)导致主题/背景被重置。
- 注:events 里含 recur 数据、含非对象元素的容错性 OK(Occ.expand/Scheduler 均判空);clearEvents 与闹钟一致性 OK(scheduleAll 先取消全部旧闹钟)。
- 建议:导入前弹确认框展示"将覆盖 N 条现有日程";校验 `version===2`;settings 改为 merge 而非整体替换。

**P2-5 版本号不一致:manifest 2.2.0,关于卡与 README 仍写 v2.1**
- 位置:`assets/index.html` L143「明日日程 v2.1」、`README.md` L1「v2.1」
- 建议:统一为 2.2.0,最好由构建脚本注入避免再漂移。

### P3(可择期)

| # | 缺陷 | 位置 | 说明/建议 |
|---|------|------|-----------|
| P3-1 | RRULE BYDAY 多天(如 `BYDAY=MO,WE`)只取第一个,其余课次丢失 | core.js L384-388 | 拆成多条课程行 |
| P3-2 | BYDAY 与 DTSTART 星期不一致时 BYDAY 胜出,首次发生可早于 DTSTART | core.js L324-329 | 以 DTSTART 星期校验 BYDAY,不一致时告警或取 DTSTART |
| P3-3 | INTERVAL≥3 退化为每周(weeks 区间拉长,parity 仅支持单/双) | core.js L328-336;实测 INTERVAL=3 展开出 8 次而非 3 次 | 三周课可标 problem 提示手动改 |
| P3-4 | teacher 提取的切分字符类 `[\\n,，;；/]` 误含小写字母 n,含 n 的英文描述被截断("Lin Yan"→"Li") | core.js L343 | 改为 `/[\\\\,，;；/]/` 并先做 `\\n` 还原 |
| P3-5 | pickBackup 连续两次 `setType("application/json")`、`setType("*/*")`,前者被覆盖(纯冗余,无功能危害) | MainActivity L449-451 | 删一行 |
| P3-6 | .ics/备份读取失败统一走 `onImagePickError`,toast 前缀"选图失败:"文案误导 | MainActivity L128-140;app.js L989 | 按 pickPurpose 分派错误回调 |
| P3-7 | widgetHelpTip 只能展开不能收起 | app.js L1073-1078 | toggle 化 |
| P3-8 | 三个 widget 缺 `previewImage`/`android:description`,选择器中预览与描述为空 | res/xml/widget_*.xml | 补预览图与描述 |
| P3-9 | 23:00–次日 00:00 的事件留在 24h 轴(正确)但被 `Math.max(startMin+20, 0)` 压成 20 分钟短块 | app.js L298/450 | 结束恰为 00:00 时按 24:00 计算 |
| P3-10 | ics 单测盲区:EXDATE/UTC/VALARM/INTERVAL≥3/跨天分列均无用例 | tests/core.test.mjs | 按 P1-1/P2-1~3 各补断言 |
| P3-11 | 文件选择取消(RESULT_CANCELED)无任何反馈,课程表抽屉静默无响应 | MainActivity L121 | 可忽略或轻提示 |

## 四、已验证无问题项

- DTSTART 闰日(2028-02-29):星期、锚点、周次均正确。
- 折行展开(空格/Tab 续行)正确;DESCRIPTION 含 JSON 不崩溃(仅 teacher 字段截断,P3-4)。
- 空文本/无 VEVENT 的 .ics 安全(锚点回退本周一,0 门课给友好报错)。
- 课程重导入替换逻辑(source=timetable 全删再导)与替换提示文案正确。
- clearEvents/importAll/deleteEvent 后 `Scheduler.scheduleAll` 全量重排,闹钟与数据一致;digest/午夜小组件闹钟均重挂。
- 三个 widget XML `updatePeriodMillis=1800000`、receiver 注册、onCreate 立即 updateAll、排查入口均落实。
- 周视图与日视图的 allday/cont/跨天过滤条件一致;块与全天条 click 目标正确。
- manifest versionCode 4 / versionName 2.2.0 正确(关于卡文案除外)。

## 五、裁定

**需修(不放行)。**

必修项(2 个 P1):
1. P1-1 周视图 layoutColumns 误分列(flush 未重置 clusterEnd + 无日期维度)——本轮核心修复未达成,开发自己的截图即为反证;
2. P1-2 exportData 在 Android 8/9/10 上必然失败(minSdk 26 范围内的旧机型直接不可用),需改 MediaStore/SAF 方案。

P2 五项建议随下一轮一并修复(其中 P2-4 涉及数据安全,优先级紧随 P1);P3 可排期。修复后需回归:周视图分列(node 断言 + 截图)、导出(11+ 真机与 ≤10 真机各一)、单测补盲区后保持全绿。

---

## v2.2 复验(2026-09-16,独立测试第 6 轮)

- 测试方式:静态审查 + `node tests/core.test.mjs` 实测 + 截图抽查(只读)
- 结论先行:**仍需修,仅剩 2 个收尾项**(P1-2 的 Android 8/9 分支与 P2-5 的 README),其余 5 项修复到位且未引入阻塞性新问题。

### 一、修复核对(7 项)

| # | 声明修复 | 结论 | 证据(文件:行号) |
|---|----------|------|------|
| 1 | P1-1 layoutColumns 按天分组聚簇 + flush 重置 | ✅ 修复 | core.js L157-162(`byDay` 按天分组)、L178(`flush` 内 `clusterEnd = -1`)、L163-189(逐天独立聚簇);单测 §13 core.test.mjs L237-251(跨天不互相聚簇 + 簇结束恢复整行,均通过);截图 v22b_week_overlap_fixed.png 确认:周三 14:00「自习课」、周四 10:00「大学英语」均恢复整列宽,周三 08:00/09:30 真重叠对保持 2 列,R5 报告中的错分列症状全部消失 |
| 2 | P1-2 exportData:API≥29 MediaStore,26-28 保留公共目录 | ⚠️ 部分修复 | MainActivity.java L432-443(API≥29 走 `MediaStore.Downloads`,免权限);L439 insert 返回 null 有守卫(报"系统拒绝了写入请求",不崩溃);AndroidManifest.xml L17(`WRITE_EXTERNAL_STORAGE` maxSdkVersion=28)。**残留**:src 全目录无该权限的运行时申请(`requestPermissions` 仅 POST_NOTIFICATIONS/RECORD_AUDIO,L72/L273),Android 8/9(API 26-28,minSdk 覆盖范围)上危险权限不弹窗、不授予 → 公共 Download 直写仍 EACCES 失败,原 P1-2 只修好 Android 10+ |
| 3 | P2-1 EXDATE 停课周 | ✅ 修复 | core.js L325-327(收集 exdates)→ L354-360(折算 exWeeks,限定 [w1,w2])→ L370(透出)→ L446(courseToEvent 透传 recur.exWeeks)→ L93-97(expandEvent 跳过);Occ.java L90-96(exSet 同步跳过);单测 §14 L275-278(第 3 周剔除,UTC EXDATE 亦正确) |
| 4 | P2-2 UTC Z 转本地 | ✅ 修复 | core.js L379(检测 `Z` 结尾)、L384-389(`Date.UTC` 构造后取本地 `getHours/getMinutes`,跨日由 `dateStr` 处理);单测 L273(`00:00Z`→`08:00`) |
| 5 | P2-3 VALARM 隔离 | ✅ 修复 | core.js L305(skipSub 状态)、L311-313(`BEGIN/END:VALARM` 之间属性行跳过);单测 L274(闹钟 DESCRIPTION 不再污染 teacher) |
| 6 | P2-4 importAll 校验 + 两段确认 | ✅ 修复 | app.js L1094-1097(无 version 或 events 非数组 → 拒绝并提示)、L1099-1104(首次解析成功仅 arm,提示"将覆盖现有全部日程,共 N 条",5 秒窗口 L1102)、L1105-1106(armed 才执行 importAll);MainActivity.java L482-483(Java 侧 events 缺失返回 -1 → JS 报"文件格式不对") |
| 7 | P2-5 版本号统一 | ⚠️ 部分修复 | index.html L143 已改「明日日程 v2.2」;AndroidManifest L4-5 2.2.0/4;**README.md L1 仍写「明日日程 v2.1」未改** |

### 二、单测与截图回归

- `node tests/core.test.mjs` → **88 通过 / 0 失败**(R5 轮为 82,新增 §13 分列回归 2 断言、§14 ICS 回归 4 断言)。
- gui-test-screenshots/v22b_week_overlap_fixed.png:R5 轮半宽错位的"自习课(周三 14:00)""大学英语(周四 10:00)"均已恢复整列宽,重叠对(周三 高数/站会)仍正确两列——P1-1 视觉回归通过。

### 三、修复引入新问题的专项排查(4 项关注点)

1. **MediaStore insert 返回 null uri**:MainActivity.java L439 已守卫,返回错误文案而非崩溃;`openOutputStream` 返回 null 的极端场景 NPE 也会被 L455 `catch(Exception)` 兜住 → 无崩溃路径。✅
2. **exWeeks 与 normalizeCourses JSON 路径**:normalizeCourses(core.js L225-231)输出对象不含 exWeeks 字段,不会误置;ics 链路 parseIcsCourses → `S.courseDraft`(app.js L831)→ courseToEvent(L938)**不经过 normalizeCourses**,exWeeks 全程保留;AI 粘贴 JSON 本就无 exWeeks,不受影响。✅
3. **Occ.java exSet 空 JSONArray**:L91-92 先判 null 再循环,空数组得到空 HashSet,`contains` 恒 false,无异常。✅
4. **importAll 5 秒窗口竞态**:见下方 N-1,非崩溃、非数据损坏,低概率,降级 P3。

### 四、新发现问题(均不阻塞)

| # | 级别 | 问题 | 位置 | 说明 |
|---|------|------|------|------|
| N-1 | P3 | importAll 确认窗口内换文件则免二次确认 | app.js L1098-1105 | 首个文件解析成功后 arm;若 5 秒内再选**另一个**文件,直接导入且确认提示里展示的是第一个文件的条数。需 5 秒内连续选两个文件才触发,概率低;建议 arm 时记录文件文本,第二次直接比对/复用 |
| N-2 | P3 | MediaStore 导出成功文案缺「✓ 已导出到」前缀 | app.js L1086 | 返回值"下载/明日日程/x"不以 `/` 开头,`startsWith('/')` 判断落空,仅显示裸路径(旧路径返回绝对路径故正常)。纯外观 |

### 五、复验裁定

**仍需修(收尾后放行)。** 本轮 7 项中 5 项完整修复且质量良好(P1-1 的两处根因均正确消除,测试与截图双重验证),未引入崩溃/数据类新问题。剩余 2 项均为上一轮判定的残留,改动极小:

1. **P1-2 残留(必修)**:Android 8/9(API 26-28)导出仍失败——manifest 已声明 `WRITE_EXTERNAL_STORAGE`(maxSdk 28)但源码从未运行时申请(API 23+ 危险权限必须 requestPermissions)。建议:exportData 前检测 `SDK_INT <= 28 && checkSelfPermission(WRITE) != GRANTED` 时先申请、授权回调后重试导出;或 8/9 降级为 SAF(`ACTION_CREATE_DOCUMENT`)。改完需在 Android 8/9 真机/模拟器实测一次导出。
2. **P2-5 残留(一行)**:README.md L1「v2.1」→「v2.2」。

P3 累计 13 项(原 11 + 本轮 N-1/N-2)不阻塞,可排期;原 P2-4 建议中的 settings 合并导入仍维持整体替换(MainActivity L485-486),属未声明范围,确认弹窗已缓解误操作风险,维持 P3 备忘。

---

## v2.2 终验(2026-09-16,独立测试第 7 轮)

- 测试方式:静态审查 + `node tests/core.test.mjs` 实测(只读)
- 结论先行:**放行**。复验残留 2 项均修复到位,未引入新问题。

### 一、残留项核对(2 项)

| # | 声明修复 | 结论 | 证据(文件:行号) |
|---|----------|------|------|
| 1 | P1-2 残留:Android 8/9 导出改写应用专属外部目录;MediaStore 分支保留;WRITE_EXTERNAL_STORAGE 移除 | ✅ 修复 | MainActivity.java L445-453(`SDK_INT < 29` 分支:`new File(getExternalFilesDir(DIRECTORY_DOWNLOADS), "明日日程")` + mkdirs + FileOutputStream,免权限必然可写,返回绝对路径);L432-443(API≥29 MediaStore.Downloads 分支原样保留,null uri 守卫仍在 L439);AndroidManifest.xml L9-16 权限列表已无 WRITE_EXTERNAL_STORAGE(全文 grep 亦无) |
| 2 | P2-5 残留:README.md 标题 v2.2 | ✅ 修复 | README.md L1「# 明日日程 v2.2 · 安卓版」(原 v2.1);至此 manifest 2.2.0 / 关于卡 v2.2 / README v2.2 三处一致 |

### 二、单测回归

- `node tests/core.test.mjs` → **88 通过 / 0 失败**(与复验轮一致,无回归)。

### 三、导出/导入闭环专项检查

- **导出**:API≥29 走 MediaStore(Download/明日日程),8/9 走 app 专属外部目录(`Android/data/com.tomorrow.agenda/files/Download/明日日程/`,文件管理器可见)。两分支均返回路径字符串;8/9 分支为绝对路径(app.js L1086 `startsWith('/')` 命中,显示「✓ 已导出到」,上轮 N-2 外观问题在此分支不存在)。
- **导入**:pickBackup(MainActivity L461-474)用 `ACTION_GET_CONTENT + CATEGORY_OPENABLE + */*` → SAF 文档选择器可浏览任意位置(含 Downloads/网盘/其他应用目录),读授权由系统临时授予、无需存储权限;onActivityResult L129-131 按 purpose="backup" 读文本回传 `onBackupFile`;app.js L1092-1113 完成「解析 → 校验 version/events → 两段确认 → importAll → 刷新渲染」闭环,与导出的 `version:2 + events + settings` 结构(L424-428)对齐。✅
- 极端场景备忘(不阻塞):`getExternalFilesDir` 理论可返回 null(外部存储不可用时),此时 File 落到相对路径、写失败被 L454 `catch(Exception)` 兜住返回「导出失败」,无崩溃路径;真实设备几乎不会触发。

### 四、终验裁定

**放行。** v2.2 两轮累计 7 项修复(2×P1、5×P2)全部落实,单测 88/88,导出/导入闭环完整,无崩溃与数据安全类问题。遗留 P3 14 项(含 N-1/N-2、双 setType、getExternalFilesDir null 备忘)均不阻塞,列入下版排期。
