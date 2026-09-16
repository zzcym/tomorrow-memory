# 明日记忆安卓 App · 测试报告 v1.0

> 测试日期:2026-09-16/17(含独立测试 agent 两轮:首验+复验放行) · 测试对象:`mobile-memory/明日记忆.apk`(versionCode 1)
> 方式:白盒(Node 单测直打本地服务端)+ 黑盒 GUI(浏览器 400×860,本地 SQLite 服务端 + 万能码全链路)+ 静态审查
> 联调环境:本地 Hono server(SQLite,`AUTH_DEV_MASTER_CODE=12345`),生产 `https://tmword.xyz` 做了线上冒烟

## 一、结论:**可交付(附真机验收清单)**

浏览器黑盒全流程 + 白盒 19 项 + 服务端数据双查全部通过;测试过程中发现并修复 7 个缺陷(见 §四)。
桌面小组件、Enter 键行为、系统返回键属于浏览器无法完全覆盖项,列入真机验收清单(§六)。

## 二、黑盒 GUI 全流程(截图证据 gui-test-screenshots/)

| # | 测试点 | 结果 | 证据 |
|---|---|---|---|
| T1 | 首页布局:白底、底部唯一圆角搜索框、右上角汉堡、空态 hero | ✅ | t1_home_blank.png |
| T1 | 查词 abandon:单词/释义黑色加粗、词性分组、例句、词形变化、"已加入单词本" toast、自动入本(wbCache+队列) | ✅ | t1_lookup_result.png |
| T1 | 最近查询列表 + 清空 | ✅ | t1_lookup_result.png 下方 |
| T2 | 汉堡菜单四项(背单词/单词本/我的/关于),未登录点受保护项跳登录 | ✅ | t2_drawer_menu.png |
| T3 | 登录:手机号校验、发送验证码 60s 倒计时、万能码登录、JWT 入 localStorage+SharedPreferences 双写、"欢迎回来" | ✅ | t3_me_logged_in.png |
| T4 | 单词本:云端列表、共 N 个、点击发音、删除(乐观更新+队列同步) | ✅ | t4_wordbook.png |
| T5 | 背词卡片:正面(单词+音标+提示)→翻面(词性分组+例句+词形变化)→四档评分(红/橙/绿实底/蓝)→进度条→结算页 | ✅ | t5_card_front/back_ratings/review_done.png |
| T6 | 刷新(模拟杀进程):token/最近查词/单词本缓存全部保留 | ✅ | DOM 断言(见测试记录) |
| T7 | 拼写错误词 → "词典里没有"空态;中→英(苹果)→ 专用结果页,点击英文词进完整释义 | ✅ | t7_zh2en.png |
| T7 | 队列空 → 结算页"今天 的队列空空如也" | ✅ | t5_review_empty_or_card.png |

## 三、白盒单测(tests/api.test.mjs,24/24,含两个竞态回归)

覆盖:登录 JWT 形状、token 入库、查词返回、离线回落缓存、最近查词置顶去重/清空、
**单词本离线队列三态**(断网本地加词队列保留 2 条 → 恢复网络合并上云 → 服务端双查确认 apple/banana 真实入库;
remove 后服务端删除;clear 后服务端清空)、**401 处理**(伪 token → 抛"登录已过期"→ on401 回调 → 本地 token 清空)、
review/today 契约形状、rating=5 服务端 400 拒绝。

## 四、本轮发现并修复的缺陷

1. [P1] Enter 键不触发查询(原 keydown 监听在移动 WebView 键盘事件下不可靠)→ 改 form submit 统一路径(index.html/app.js)
2. [P1] 中→英查词返回结构与英→中完全不同,渲染空白 → 新增 renderZh2En 专用渲染(app.js)
3. [P2] 拼写错误词被第三方接口返回垃圾数据(translation="10:21")→ 无 CJK 且无词性分组时判未收录(app.js)
4. [P2] 背词卡背面单词头重复渲染 → renderLookup 增加 noHead 参数(app.js)
5. [P2] 登录后菜单 label 不刷新 → refreshReviewBadge 同步刷新 meLabel(app.js)
6. [P3] 背景图选图回调丢失(沿袭自 mobile-agenda 的同类回归)→ 恢复 onImagePicked——本轮为明日记忆,无背景功能,已在评审中排除
7. [P3] api.js NETWORK 错误吞掉原始 cause → 附 cause 便于诊断(api.js)

> 注:第 6 条在评审中确认为误报(明日记忆无背景图功能),保留记录供测试 agent 复核。

## 五、非功能项

- **可靠性**:请求 12s 超时;401 全局登出;断网查词回落缓存;单词本"本地权威+队列"模型保证断网不丢;评分失败显式重试(按钮恢复可点,防双击 disabled)
- **可服务性**:限流(429)/5xx/404 均映射为用户文案;空态三处(队列空/单词本空/未收录);离线提示
- **性能**:APK 42KB;WebView 本地 assets 冷启快;查词有 loading 条+占位文案;lookup 结果本地缓存(最近词离线可查)
- **安全**:仅 HTTPS(生产 BASE 固定;测试覆盖走显式注入);权限最小化(仅 INTERNET);token 存本机 localStorage+SharedPreferences,无日志输出;JS 桥仅 3 个最小方法;manifest 无 cleartext 放行(targetSdk 34 默认禁);小组件无敏感数据
- **白盒补充**:api.js 队列合并逻辑(拉远端→合并→整体 PUT→清队列)与 remove/clear 语义经服务端双查验证

## 六、真机验收清单(需真机,发布前勾选)

1. Enter/键盘"搜索"键触发查词(form submit 标准行为,IAB 工具无法模拟)
2. 桌面添加「明日记忆·查词」小组件 → 点击拉起 App 且搜索框自动聚焦弹键盘
3. 杀进程重开:登录态保持(SharedPreferences 回灌链路)
4. 真实手机号验证码登录(生产短信通道)
5. 与网页版 tmword.xyz 互通:网页查的词 App 单词本能看到,反之亦然
6. 系统返回键:菜单开→关菜单;背词页→回首页;其余→退出

## 七、测试 agent 复验结果(2026-09-17)

- 首轮独立测试:有条件放行(B1 wbSync 竞态丢词 P1 / B3 良好按钮颜色 P2 / B2 返回键缺失 P2)→ 全部修复:
  - B1+R1:单词本队列改 **seq 序号模型**,PUT 后只清 seq ≤ 快照末尾的条目;新增两个竞态回归测试(窗口期加词不丢 / 同词翻转删除生效),白盒 **24/24**
  - B3:良好按钮改浅绿实底 #E6F4EA + 深绿字,与设计文档一致
  - B2:onBackPressed → window.onAndroidBack() 三态(关菜单 → 回首页 → 退出)
- 独立测试终验:**放行交付**(详见 docs/TEST-REPORT-AGENT.md)

## 八、遗留(不影响交付)

- AI 教学内容(lookup 的 AI 补充段)未在 App 首页展示(需求"例句什么的你看着办",当前静态词典结果已满足;AI 段接口为 SSE 流式,v2 可加)
- 头像/打卡页未做(登录后数据在,入口后补)
- zh2en 的 synonyms 样式复用例句灰字(可用)


## 九、v1.1 增补:头像/昵称/热力图(2026-09-17)

新增:我的页头像(系统文件选择 → canvas 压缩 512px JPEG → PUT profile,回显圆形)、昵称编辑(≤30 字)、统计行(词数/复习天数/每日目标)、52 周打卡热力图(与网页版同口径 reviewDates);背词完成自动打卡(热力图数据源,幂等)。
服务端:头像长度限制 500 → 200_000 字符(存量 bug:网页版 base64 头像也被 500 拦截,一并修复)。
MainActivity:onShowFileChooser + onActivityResult(WebView 文件选择,真机头像上传必需)。

验证:昵称更新(API→服务端→UI 显示"小明");头像 10.8KB dataURL 上云回读并显示;热力图 362 格渲染;自动打卡写入 checkin_logs。真机项:系统文件选择器拉起、选图后头像即时更新。
