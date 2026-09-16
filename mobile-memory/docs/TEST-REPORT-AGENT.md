# 明日记忆 v1.0 · 独立测试报告(发布前验证)

> 测试人:独立测试 agent · 日期:2026-09-17 · 对象:`mobile-memory/明日记忆.apk`(versionCode 1,42,307 字节,v1+v2/v3 已签名)
> 环境:本地 Hono server(SQLite,万能码 12345,127.0.0.1:3001)+ 线上 https://tmword.xyz
> 方式:白盒复跑 + 静态代码审查(app.js/api.js/MainActivity/SearchWidget/Manifest)+ 线上冒烟 + 截图抽查 + 竞态脚本实证
> 与开发自测报告(docs/TEST-REPORT.md)的关系:独立复核,不重复其通过项,聚焦找开发未发现的问题

## 一、裁定:**有条件放行(需修 2 项后可交付)**

- **必修(阻塞放行)**:B1 单词本同步竞态丢数据、B3 评分主按钮文字不可读。均为小改动(合计 <10 行),修后需回归 B1 并发用例 + 重拍 t5 截图。
- **强烈建议同批修**:B2 系统返回键(开发报告已列为真机验收项,但代码无任何实现,真机必挂;建议修复而非降级预期)。
- 其余 P2/P3 不阻塞 v1.0,列入 v1.1。

## 二、验证结果总览

| 项 | 结果 |
|---|---|
| 白盒 tests/api.test.mjs | **19/19 通过**(本地 3001 实跑,含离线回落、队列三态、401、契约形状、服务端双查) |
| 线上冒烟 tmword.xyz | `/api/lookup?word=hello` 200 结构完整;`苹果` zh2en 200;`zzqqxx123` 返回 200+无 CJK 空分组(客户端启发式可正确判未收录) |
| APK | 42KB,含 dex/manifest/assets,META-INF 签名 + APK Signing Block(v1+v2/v3),targetSdk 34 |
| 截图抽查(t1/t5/t7) | 排版主体符合(见 §六),发现 B3 对比度缺陷 |
| 静态审查 | 发现 1×P1、3×P2、7×P3(见 §四) |

## 三、验收标准(需求 §5)逐条判定

| # | 验收项 | 判定 | 依据 | 真机项? |
|---|---|---|---|---|
| 1 | 安装→登录→查词加粗→自动进本→服务端可见 | **通过**(模拟环境) | 白盒双查 + t1 截图加粗/词性/例句/词形齐全;自动入本 wbLocalAdd+队列已验 | 安装与真实验证码登录必须真机 |
| 2 | 背词一轮,评分后 FSRS 进度变化(服务端可查) | **基本通过** | t5 全流程截图;POST /api/review 契约+rating=5 服务端 400 已验;"进度变化服务端可查"建议真机跑一轮后到网页版目检 | 建议(可与 1 合并) |
| 3 | 杀进程重开:登录态/最近查词仍在 | **可信,待真机确认** | token 双写链路(SharedPreferences 回灌 onPageFinished)代码成立;浏览器刷新 DOM 断言通过 | 必须(浏览器刷新≠杀进程) |
| 4 | 小组件点击→直接可输入 | **链路成立,待真机确认** | PendingIntent(NEW_TASK\|SINGLE_TOP,IMMUTABLE)+ focus extra + consumeLaunchFocus 时序(onCreate 存→init 消费)正确 | 必须(键盘是否弹出、已打开场景见 B7) |
| 5 | 断网提示/离线可看/恢复 | **通过**(模拟) | 白盒离线回落缓存+队列断网保留/恢复合并;UI 有"当前离线,展示的是缓存结果"文案 | 建议真机飞行模式抽验一次 |

## 四、缺陷清单(按严重度)

### P1(1 项)

- **B1 单词本 wbSync 并发窗口静默丢数据** — `assets/api.js:167-179`
  - 竞态:sync A 在 `await req('PUT')` 网络窗口期间,用户查词触发 `wbLocalAdd('dog')`(或删除),A 完成后 `wbSetQueue([])` 清空整条队列(dog 的 op 被抹)且 `wbSaveCache(merged)` 用不含 dog 的服务端合并结果覆盖本地缓存 → **dog 从单词本消失且永不上云**;删除场景则表现为"删掉的词复活"。
  - **已脚本实证**(见 §七):PUT 窗口内加词 dog → 同步完成后缓存与队列均无 dog。
  - 触发条件:两次查词间隔 ~0.8-1.5s(sync 防抖 800ms 后 GET+PUT 期间),连点最近查词/快速连查即可复现。
  - 与开发报告"本地权威副本+队列防丢"承诺直接冲突;白盒未覆盖并发路径。
  - **建议**:PUT 成功后只清已处理前缀 `wbSetQueue(wbQueue().slice(q.length))`(队列操作均为尾部追加,q 必为前缀);并补 `if (wbQueue().length) setTimeout(() => API.wbSync().catch(()=>{}), 1000)` 自愈。

### P2(3 项)

- **B2 系统返回键完全未处理** — `src/com/tomorrow/memory/MainActivity.java`(无 onBackPressed/onKeyDown)
  - 返回键任何状态下都直接退出 App。需求 §3.5"系统返回键/手势正确"、设计 §1"菜单开→关菜单;背词页→回首页;其余→退出"均未实现。开发报告 §六.6 将其列为"真机验收",但静态审查确认代码无任何机制,**该项真机必挂**。
  - **建议**:重写 onBackPressed:menuPop 可见→closeMenu;curPage!=='home'→evaluateJavascript("goto('home')");否则 super。
- **B3 评分主按钮"良好"文字不可读** — `assets/app.js:432` + `assets/style.css:190`
  - 按钮内联 `style="color:#188038"`(绿字)覆盖了 `.primary-rate` 的 `color:#fff`,而实底是 `--primary:#0f6b5c`(深青)→ 绿字压深青底,对比度约 1.4:1,t5 截图中"良好"几乎看不见。这是背词核心交互的主推按钮。且设计 §3 规格为"浅绿底 #E6F4EA + 绿字",实现偏离。
  - **建议**:删掉内联 color,或按设计改 `.primary-rate{background:#E6F4EA;color:#188038}`。
- **B4 lookupCache 无上限增长,违反"最近 200 条"** — `assets/api.js:84-98`
  - 每个查过的词(含背词预取)永久写一条 `tm.cardCache:<word>`,无淘汰。需求 §3.5 明确"最近 200 条"。长期使用触达 localStorage 5MB 配额后 `setItem` 静默失败:新词不再缓存(离线兜底失效),且同模式下 recent/队列写入也可能被波及(队列写失败=重启丢同步)。
  - **建议**:写入时维护 key 索引或给条目加 ts,超 200 条淘汰最旧。

### P3(7 项,v1.1 处理)

- **B5 doLookup 并发无序号保护** — `assets/app.js:93-150`:快速连查两次,先发出的请求后返回会覆盖后发出请求的结果(展示词≠输入框词),loading 条被先完成的 finally 提前关闭。建议请求序号或 AbortController。
- **B6 失败重试按钮自 XSS 面** — `assets/app.js:145`:`onclick="doLookup('${esc(word)...}')"` 中 esc 的 `&#39;` 经 HTML 属性解码还原为 `'` 可闭合 JS 字符串(注入 `');code//`);因 word 仅来自用户自身输入,属自 XSS,风险低;含 `\` 时重试按钮语法失效。建议与全文件风格统一改 addEventListener。
- **B7 小组件在 App 已前台时聚焦失效** — `SearchWidget.java:19` 用 SINGLE_TOP 但 MainActivity 无 onNewIntent,launchFocus 不更新 → 已打开时点小组件无聚焦(冷启动路径正常)。建议补 onNewIntent。
- **B8 zh→英 查询不进最近查词** — `app.js:104-108` renderZh2En 分支提前 return 无 recentAdd,与 §3.1"最近查词本地留存"不完全一致(t1 截图中的"苹果"是修复 #2 之前的旧证据)。
- **B9 toast 位置与设计不符** — `style.css:210` 顶部浮出,设计 §4 要求"底部居中浮出"。
- **B10 背词页保留汉堡菜单** — 设计 §1"背词页是独立页(无汉堡)",实现复用全局顶栏(返回箭头已有,功能无损)。
- **B11 发布残留测试钩子 + 小项** — `index.html` `window.__API_BASE__ = localStorage.getItem("tm.base")` 建议发布版移除;`AndroidManifest allowBackup="true"` 与"JWT 只存本机"表述略冲突(低风险);token 30 天无续期(到期 401 自动登出引导重登,可接受,需产品知晓)。

### 非缺陷备忘

- `flipCard` 失败重试路径会重复 bindRates,靠 `RV.submitting` 守卫兜住双 POST,无害;`RV.backRendered` 为死变量。
- `renderCardFace` 每次整体重建 DOM,rvRatings 无状态残留;评分按钮点击时 `currentCard()` 实时取值,与当前卡一致,未发现错卡路径。
- `MainActivity` onPageFinished 用 `JSONObject.quote` 回灌 token:JSON 转义与 JS 字符串字面量兼容,JWT 字符集下安全;仅当 localStorage 无 token 时写入,登出链路(bridge.saveToken(''))一致,无回灌复活已登出状态的问题。
- SearchWidget PendingIntent:requestCode 1001 唯一、FLAG_UPDATE_CURRENT|IMMUTABLE 正确;receiver exported=false 符合现行官方模式;深浅色有 values-night 适配;resizeMode=horizontal 合理。
- Manifest 无 usesCleartextTraffic(targetSdk 34 默认禁),权限仅 INTERNET,MainActivity exported=true 为 launcher 必需。

## 五、白盒与冒烟明细

- 白盒 19/19:`node tests/api.test.mjs`(需 3001 在跑,实跑确认)。注意:未覆盖 wbSync 并发(B1 即漏网)、未覆盖 App 层(浏览器 DOM 逻辑)。
- 线上冒烟(未登录):`https://tmword.xyz/api/lookup?word=hello` → 200,groups/examples/exchange 齐全;`苹果`(zh2en)→ 200 结构与 renderZh2En 匹配;`zzqqxx123` → 200 且 `{"translation":"zzqqxx123","groups":[]}`,客户端无 CJK+空分组启发式正确落"未收录"空态。生产可服务。

## 六、截图抽查(3 张)

| 截图 | 判定 |
|---|---|
| t1_lookup_result | 符合:单词 28px 级黑粗、音标灰、词性 chip+首义加粗、例句英粗中灰、词形变化折叠、"已加入单词本" toast、底部圆角搜索框、右上汉堡、最近查询+清空。⚠ 截图中 `restraunt(10:21)`、`苹果` 最近项与当前代码行为不符(为修复 #3/#2 前拍摄),**建议发布前重拍以免误导验收** |
| t5_card_back_ratings | 结构符合:背面居中头+分组+例句+词形+四色按钮一行。⚠ 即 B3:"良好"绿字压深青底几乎不可读(设计要求浅绿底) |
| t7_zh2en | 符合:中文大标题加粗、"中文→英文"副标、英文词加粗+词性 chip+音标+提示文案(本地服务端仅回 1 条结果,线上返回多条,渲染取前 6 无碍) |

## 七、B1 实证记录

模拟 PUT 耗时 300ms,在窗口内 `wbLocalAdd('dog')`,同步完成后:
`本地缓存 = [cat]`,`待同步队列 = []` → dog 同时从缓存与队列消失,后续同步永远不会带上它(除非用户重查)。

## 八、真机验收清单(放行前逐项勾选,合并开发报告 §六)

1. 安装 APK 覆盖安装成功、冷启可进首页
2. 登录:真实手机号验证码(生产短信)+ 密码两条路;杀进程重开登录态保持(SharedPreferences 回灌)
3. 查词:Enter/键盘"搜索"键触发;结果加粗排版;自动入本并与网页版 tmword.xyz 互通(双查)
4. 背词:完整走完一轮队列,评分后到网页版确认 FSRS 进度变化;确认"良好"按钮文字可读(B3 修复后)
5. 小组件:添加→点击拉起 App→搜索框聚焦弹键盘;App 已打开时再点一次(观察 B7 是否可接受)
6. 系统返回键:菜单开→关菜单 / 背词页→回首页 / 首页→退出(B2 若不修,此项验收为"返回即退出",需产品确认接受)
7. 断网:飞行模式查词→提示+缓存可看;恢复→自动同步(队列合并)

## 复验(2026-09-16,对必修项 B1/B3/B2 的修复验证)

### 裁定:**放行交付**(1 项新发现 P2 列入 v1.1,不阻塞)

### 逐项核对

- **B1 已修(主路径成立)** — `assets/api.js:179` `wbSetQueue(wbQueue().slice(q.length))` 只清提交快照前缀 + `assets/api.js:181-184` 队列非空自愈重同步(`wbSyncing=false` 与递归调用之间无 await,无重入窗口;残留 op 由递归补同步)。白盒新增 5b 竞态回归:PUT 挂住→窗口期加 durian→放行→断言 durian 上云且队列清空,通过。原 §七 复现脚本场景(窗口期任意加词丢数据)已消除。
- **B3 已修** — `assets/app.js:432` 内联 `style="color:#D93025"` 已删;`assets/style.css:239`(文件末行)`.rv-rate.primary-rate { background:#E6F4EA; border-color:#188038; color:#188038 !important; }`,符合设计 §3"浅绿实底+深绿字"。无深色模式/其他规则冲突(style.css 无 media query,index.html 无注入;line 190 的 `color:#fff` 被同特异性后置+!important 正确压制)。对比度约 4.4:1,14px 粗体实际可读(WCAG AA 正常文本边缘,可接受)。t5 建议仍按 §八.4 重拍。
- **B2 已修** — `src/com/tomorrow/memory/MainActivity.java:56-64` onBackPressed → `main.post` + `evaluateJavascript("window.onAndroidBack ? String(window.onAndroidBack()) : 'exit'")`,回调结果含 'exit' 才 `finish()`,未误调 super,异步时序正确;`assets/app.js:539-543` 菜单开→closeMenu 返 'stay'、非首页→goto('home') 返 'stay'、首页→'exit',与设计 §1 一致。WebView 历史关系安全:goto() 纯 DOM class 切换、不用 hash,页面栈只有初始 file:/// 一条,覆写返回键不损失任何历史导航;JS 未就绪时 onAndroidBack 为 undefined→'exit' 是合理降级(onAndroidBack 内部抛异常时返回键被吞一次,可忽略)。

### 白盒复跑

- 本地 3001 实跑 `node tests/api.test.mjs` → **22/22 通过**(原 19 + 5b 节 3 条 B1 竞态回归断言)。

### 复查新发现(1 项缺陷 + 1 条备忘)

- **R1(P2,v1.1)slice 清队列的"队列必为快照前缀"假设在同词翻转下不成立** — `assets/api.js:134/141`:wbLocalAdd/wbLocalRemove 是"先 filter 掉同词旧 op 再尾部 push"。若 PUT 窗口内用户对**已有待同步 op 的同一个词**做反向操作(加完 1s 内删、或删完立刻重查触发自动加),队列长度不变,新 op 停在快照长度以内被 `slice(q.length)` 误清,随后 `wbSaveCache(旧 merged)` 回写缓存 → 该 op 永久丢失。**已脚本实证**:窗口内 `wbLocalRemove('fig')` → 队列空、缓存与服务端 fig 复活,删除被静默回滚。触发窗口极窄(需同词在 ~1s 内翻转;纯追加的加词/删词/清空均已实测安全)。建议:窗口内不 filter 既有 op,或 op 带序号、PUT 后按序号确认。
- 备忘(不计缺陷):clear 落在 PUT 窗口时 `wbSaveCache(merged)` 会瞬时回写已清词条缓存,但自愈递归在同一轮同步内纠正(实测最终态正确),UI 无缓存监听、无可见影响。

### 复验结论

B1/B3/B2 三项修复均落地、回归通过、未引入回归性新问题。R1 为 B1 的残余窄路径(较原缺陷触发面大幅收窄),降级 P2 随 v1.1 处理。§八 真机清单第 4(B3 可读性)、6(返回键)项仍需真机确认后方可关闭。
