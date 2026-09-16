# 明日记忆 · 安卓版 📱

查词、单词本、FSRS 背单词。**与网页版 tmword.xyz 同账号同数据**,手机上查的词、背词进度实时保存在云端,换机登录即恢复。

**安装包:`明日记忆.apk`**(Android 8.0+,已签名,42KB)

## 功能

| 功能 | 说明 |
|---|---|
| 🔍 查词 | 首页底部圆角搜索框,结果直接展示:单词/释义黑色加粗、词性分组、例句、词形变化;支持中文→英文;查词自动加入单词本 |
| 📇 背单词 | FSRS 间隔重复:今日队列卡片式自测,四档评分(忘记/困难/良好/轻松),评分实时保存云端 |
| 📖 单词本 | 与网页版实时同步;断网也能加词(本地队列,恢复网络自动同步);点击发音 |
| 👤 账号 | 手机号+验证码/密码登录;token 持久化,杀进程不掉登录 |
| 🔲 小组件 | 桌面「明日记忆·查词」:一个搜索框,点按直达查词 |

## 上手

1. 安装 APK → 右上角 ☰ → 登录(手机号+验证码,或密码;与网页版同账号)
2. 首页搜一个单词 → 自动进单词本
3. ☰ → 背单词 → 清掉今日队列
4. 桌面长按空白 → 小组件 → 明日记忆

## 数据与隐私

- 所有用户数据存 tmword.xyz 服务端(PostgreSQL/SQLite),HTTPS;token 只存本机
- 未登录也可查词(限流内),登录后数据才能跨设备同步
- 卸载重装后登录即恢复全部数据

## 构建

```bash
node tests/api.test.mjs      # API 层白盒单测(需本地服务端)
bash build-apk.sh            # aapt2 → javac → d8 → 签名
```

联调:仓库根目录 `DB_DRIVER=sqlite JWT_SECRET=dev AUTH_DEV_MASTER_CODE=12345 CORS_ORIGIN='*' pnpm --filter @tm/server start`,浏览器测试时 `localStorage.setItem('tm.base','http://127.0.0.1:3001')`。

结构:`assets/`(WebView 前端:index/api/app)、`src/`(MainActivity 壳 + SearchWidget)、`docs/TEST-REPORT.md`(测试报告)。

## 诚实边界

- Enter 查词依赖 Android WebView 标准 form submit 行为(已按标准实现,真机验收清单见测试报告 §六)
- 查词依赖 tmword.xyz 可用;离线时最近查词走本地缓存
- AI 教学内容(App 内 AI 释义流)与打卡/头像页计划 v1.1
