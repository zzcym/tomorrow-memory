/**
 * App「我的」屏（`#/me`，E 区与软告知行 = T-19e / A-61 #209②、#210 派工；B/C/D 三区接驳 =
 * T-19g-ii / A-78 派工；F/G/H 三区接驳 = T-19g-iii 派工；PRD R-18②、R-19②、R-20⑤、R-25①，
 * UI §3.8.1 分区表 :952-955、:957-959、:961-962 + §3.8.2 :972-973 + §3.8.3 全条 +
 * §6.4-5-5 止血阀的软告知入口行）。
 *
 * 形状完全以盘面上既有真源为准，缺定稿串的槽位一律**不渲染、不自造**：
 *
 *  0. **B 区账号头（§3.8.1:953，T-19g-ii）**
 *     - 56px 圆形头像（`Avatar h-14 w-14`，缺图回落品牌底 + 昵称首字）+ 昵称（`text-base font-semibold`）
 *       + 脱敏手机号（`maskPhone()`，`text-xs text-ink-muted`），`pt-4 pb-4`、`gap-3`。
 *     - 数据 = **复用屏内唯一那颗 `profile` query**（契约 `ProfileDto` 的 `nickname / phone / avatar`），
 *       B 区零新查询。头像是**非交互元素**：§3.8.4「点头像从相册选图 + 上传」链未交付，
 *       这里不挂任何点击语义（登记见交付报告）。访客态 B 区自 **T-19g-v** 起替换为 §3.8.5 `:998`
 *       的登录引导条（三串 = `SETTINGS_COPY.guestGuide.*`，两颗按钮 = `AUTH_COPY.submit.login/.register`，
 *       shared `:604-605` 明令按钮串此处不抄第二份），见文末"未登录"段。
 *
 *  0b. **C 区三张统计卡（§3.8.1:954，R-19② 前半句，T-19g-ii）**
 *     - 三格串 = `SETTINGS_COPY.statCards.{words,reviewDays,streak}`（`copy.ts:550-554`，逐字），
 *       `grid-cols-3 gap-3`、卡高 `84px`、`mt-1`。组件复用 `@tm/ui` `StatCard`：
 *       **有 `onClick` 时整卡就是一个 `<button>`**（右侧 `›` 为 `aria-hidden` 装饰），
 *       "数字可点进明细"= 整卡 onClick，卡内不再嵌控件；读屏全串走 `valueText`（`词本 N 词` 那一整行）。
 *     - 数字源各取盘上唯一一份，屏内 0 自算第二份：`词本 / 累计复习` = `profileProgressOf(profile.data)`
 *       （`components/progress-data.ts:135`，与 `ProgressScreen.tsx:145` 同一形状）；
 *       `连续` = `useDueBadge().streak`（`components/due-badge-data.tsx:93`，其文件头点名
 *       "红点/完成页/**我的页**共用的那一份数字"）。
 *     - **F-29 真修（R-19② 的"三格常驻"）**：三格**按各自的源**降级，不再共用一颗门 ⇒
 *       `checkin/status` 挂掉只带走连续格，`词本 N 词`/`累计复习` 两格照常在场；反过来档案没到手时
 *       也只有那两格不画。缺源的那一格整格不画（不出假 0），三种全缺才整段不画。
 *     - 三个落点（§3.8.1:961）故意不进 shared ⇒ 屏侧常量登记：`词本`→`/wordbook`、
 *       `累计复习`→`/progress`、`连续`→`/progress`。**"热力图滚到今天"需要 `ProgressScreen`
 *       配合读查询参数（跨主文件），本轮未接**，登记待接线。`tone` 一律 `default`
 *       （§3.8.2 未逐字指定哪颗用哪个 tone，取派单裁定）。
 *
 *  0c. **D 区打卡常驻行（§3.8.1:955 + :962，R-19②/R-20⑤，T-19g-ii）**
 *     - 整行两串都是定稿原文：已打卡 `CHECKIN_COPY.done(n)` = `今天已打卡 · 连续 ${n} 天`，
 *       未打卡 `CHECKIN_COPY.notDone.headline` = `今天还没打卡`（屏内 0 拼接）；
 *       右侧按钮 `VERBS.goStudy` = `去背单词` → `/study`。`mt-3 p-3 rounded-lg bg-brand-soft`、
 *       行高 `56px`（`h-14`）、常驻不随滚动隐藏（页内普通流，天然满足）。
 *     - 打卡数字与 C 区同源（`useDueBadge()`）。屏内另订阅**同一查询键**
 *       `checkinStatusQueryOptions()`（react-query 同键共享缓存 ⇒ 0 次额外请求），只为判
 *       "`checkin/status` 到手没有"：**F-29 真修后按格取源分别降级**（`showCheckinData` 只 gate
 *       连续格与 D 区整行，档案源的两格不受牵连），没到手/拉失败时那两格/那一行**不渲染**，
 *       不画半截、不显示「连续 0 天」假 0（`useDueBadge` 不暴露失败面，故加这一路只读订阅）。
 *     - 同步状态行 = 既有组件 `SyncBadge`（`shell/TabBarShell.tsx`，`text-xs`）放 D 区下方一处
 *       （§3.8.1:962 与其文档注释"由批次4 在 WordbookScreen / MeScreen 各放一处"）；
 *       三态文案走 `data/startup.syncLabel()` 唯一实现（`SYNC_COPY` 那颗；`WORDBOOK_COPY.syncBadge`
 *       同形重复屏内 0 引，不放大 E4 的账）。禁词 `云端/本地/已连接/未连接` 屏内 0 处（:962、R-20⑤、R-25①）。
 *
 *  1. **每日目标 = 滑杆 + 明确保存 + toast（R-19② 后半句 / §3.8.3）**
 *     - 读写都走 `data/queries/profile.ts` 这一条既有单点（`profileQueryOptions()` 读、
 *       `updateProfile({ daily_goal })` 写 ⇒ `GET/PUT /api/profile`）：屏内 0 端点字面量、
 *       0 `fetch`、0 存储 API，**不新开第二条通路**（`daily_goal` 的 camel 别名映射仍在
 *       `@tm/shared` 的 `profileDtoLegacyAlias()` 那唯一一处，屏只读 snake 的 `daily_goal`）。
 *     - `取消 / 未提交` ⇒ **静默不保存**：值只有点「保存」才发请求（§3.8.3 明令禁 `onBlur` 静默保存、
 *       禁"自动保存"字样、禁离开页面替用户偷偷提交）；未弄脏时保存钮 `disabled` + `aria-disabled`，
 *       不发请求、不弹 toast、不假装成功。
 *     - 成功后：toast `SETTINGS_COPY.dailyGoal.savedToast(n)`（逐字 = §6 总表那条
 *       `每日目标已更新为 20 词`）+ 失效 `profileKeys.all` 重取；失败走既有单点
 *       `apiErrorMessage()` 的人话（0 新串、0 洗成成功）。写成功不弹"已保存"第二次、也不自激轮询。
 *     - "半途不写第二遍"：`isPending` 是渲染态、`disabled` 要等一次 commit 才落到 DOM，
 *       同一帧连点两下仍会走进第二次 `onSave` ⇒ 另立一枚 `savingRef` 只拦这一种情形（`finally` 释放）。
 *     - 滑杆参数 `5 / 50 / 5`（§3.8.3 定稿域）自 T-19g-ii 起 import 自 `@tm/shared` 的
 *       `DAILY_GOAL_UI_MIN/MAX/STEP`（`limits.ts:119-121`），屏内不再留第二份字面值；
 *       `GOAL_SLIDER` 导出保留，用例 B-04 继续钉"滑杆域 ⊂ 契约域"（T-19e 当年的 G-1 已由
 *       T-19g-i 上收闭合）。
 *     - §3.8.3 末句"dirty 时离开本页 → ConfirmSheet"不归本屏：离开动作发生在外层壳
 *       （`shell/TabBarShell` / `main.tsx`，A-44 #86 禁本轮触碰），串已在 shared
 *       （`SETTINGS_COPY.dailyGoal.leaveConfirm`），接线归 TPM 收口。
 *
 *  2. **止血阀 `passwordUpgradeEnforce=off` 的软告知入口那一行（A-61 #209② 点名归 T-19e）**
 *     - 读法照盘面既有形状：`@tm/shared/constants/flags.ts:7` 明令"代码内不得读该 flag"（唯一读点
 *       在服务端 `auth-service.issueTokens`）⇒ 客户端能读的只有 `auth-store` 的**派生位**，
 *       即"人已进门（`hasToken`）**且**仍被标为该改密（`upgradeRequired`）"＝`signIn()` 里那枚内存软告知位
 *       （`auth-store.ts:82` `advisoryUpgrade`，注释逐字写着"止血阀 passwordUpgradeEnforce=off 时"）。
 *       屏内 0 自算第二份判定、0 读 `pwPolicyVersion`、0 读 flag。
 *     - 文案两个槽都是定稿串：入口正文 `SETTINGS_COPY.upgradeTodo.entry`、动作 `SETTINGS_COPY.upgradeTodo.cta`
 *       （`copy.ts:559-562`；Web 同页同一槽的既有读法见 `apps/web/src/components/profile/settings-list.tsx:137`）。
 *     - 点击 = 已交付的 `#/security`（`SecurityScreen.tsx`，T-19d；**本轮不重做改密页**，只挂这一行入口）。
 *       跳转走 `router.js` 的 `navigate()`。`#/security` 在 `router.tsx:57` 登记（`kind:'secondary'`）。
 *
 *  3. **三张统计卡（§3.8.1 C 区）= 已在 T-19g-ii 接驳**（见上文 0b）。T-19e 当年"屏侧不渲染"的理由
 *     （三格标签在 `@tm/shared` 无常量）已由 T-19g-i 的定稿串上收闭合，屏侧只从
 *     `SETTINGS_COPY.statCards` 取串，不自造。
 *
 *  4. **F 区设置列表（§3.8.1:957，T-19g-iii）= 只渲染有源、有落点的三行**
 *     - `:957` 那串的顺序是 `自动收藏 · 每日提醒时间 · 外观 · 我的查询历史 · 修改密码 · 关于`（六行）。
 *       本轮**落其中三行，相对次序不变**：`外观` → `修改密码` → `关于`。
 *     - **另外三行一律不渲染**，因为盘面上没有数据源（不是"没做"，是"做了就是假的"）：
 *       `自动收藏` 只有 `packages/shared/src/constants/flags.ts` 那颗 `autoFavoriteDefault`，而该文件头
 *       明令"代码内不得读该 flag"（唯一读点在服务端），屏侧 0 数据源、`ProfileDto` 0 契约字段；
 *       `每日提醒时间` 只有文案串（`SETTINGS_COPY.reminder.*`，`copy.ts:555-559`），`reminderTime` /
 *       `reminder_time` / `alarm` 全仓 **0 命中** ⇒ R-21 的原生调度未交付，挂上去就是点了没反应的设置；
 *       `我的查询历史` 串与页都 0 命中，`router.tsx:43-55` 的 11 条名册里也没有落点。
 *       三串在屏源码剥注释后 **0 命中**，由用例 J-04 反向钉死（把"没做"钉成可回归的事实）。
 *     - 三行的行标题各取盘上唯一一份：`外观`/`关于` = `SETTINGS_COPY.rows.appearance` / `.about`（F 区专用键）
 *       （A-86 #320 选项 5A：两串在 `copy.ts` 单点声明，`groups` 的第 2/4 格与 `rows` 同引同一颗 const；
 *       `AboutScreen.tsx:45` 的「关于」页 H1 也已换到同一颗 `rows.about` ⇒ 两处同源）；`修改密码` =
 *       `AUTH_COPY.changePassword.title`，也就是落点 `/security` 那一屏自己的标题
 *       （`SecurityScreen.tsx:146`）⇒ 行标签与落地页 H1 同一常量，永不漂移。屏内 0 中文字面量（A-01）。
 *     - `外观` 行的交互形状**不发明**：与 Web 同页对位件同形（`apps/web/src/components/profile/settings-list.tsx`
 *       :63 的 `NEXT_THEME` 循环表 + :130 `setTheme(NEXT_THEME[theme])` + :131 `trailing='value'` 显示当前档），
 *       档位人话 = shared `THEME_MODE_LABELS`。持久化与 `<html>` 类名单点 = `@tm/ui` 的 `useThemeToggle()`
 *       （其内部 `applyTheme()` 只写 `THEME_STORAGE_KEY='tm:theme'` 那一个键）⇒ **屏内 0 新键名、
 *       0 裸存储 API**（`localStorage`/`setItem`/`getItem` 与 `'tm:theme'` 字面量在本文件 0 处，A-02/A-05 已钉）。
 *     - 行组件：`:972` 标的 `@tm/ui/patterns/SettingRow.tsx` **盘面不存在**（`patterns/` 15 件里没有它，
 *       全仓只在两处注释里被提到），而 `packages/ui` 本轮禁改 ⇒ 照本屏 `upgradeTodo` 行的既有形状
 *       在屏内自建局部 `SettingRow`（props 取 `:972` 里有源的那几槽：`title` / `hint?` /
 *       `trailing?: 'chevron'|'value'` / `onClick`；`icon`/`badge`/`switch` 三槽本轮无源不实现）。
 *       ⇒ **G-6（SettingRow 未落 ui pattern）仍未闭**，本轮以屏内局部件绕过，缺口在交付报告复述。
 *     - 几何 = `:957` 逐字：`mt-4` + 行高 `min-h-[56px]` + 行间 `--hair` 1px；"末行不描边"靠
 *       `ul` 上的 `divide-y divide-hair` 结构性成立（不是靠 `last:` 覆写），与 Web 同形。
 *
 *  5. **G 区退出登录（§3.8.1:958 + §3.8.2:973，T-19g-iii）**
 *     - `mt-6 mb-2`、居中、`text-danger text-sm` 的**单独一行文字按钮**，不混进 F 列表（DOM 上不在 `ul` 内，
 *       由用例 K-01 钉"列表里恰三颗且不含退出登录"）；触发钮动作名 = `VERBS.signOut`（Web G 区同一颗，
 *       `settings-list.tsx:170`）。
 *     - 点击**必过二次确认**：确认层 = 既有 `@tm/ui` `ConfirmSheet`（`:973` 点名件，本轮未改它一根手指），
 *       四槽逐字 = `SETTINGS_COPY.signOut.{title,body,confirm,cancel}`（`copy.ts:568-573`），`tone='danger'`。
 *     - 确认后的动作 = `auth-store.signOut()`（**全仓唯一清凭据函数**，其文件头第 3 条纪律），
 *       它返回登录页路由；跳转照本仓既有形状 `leaveTo(signOut())`（`UpgradePasswordScreen.tsx:175`；
 *       `SecurityScreen.tsx:112` 那支多一层 `setTimeout(…, TOAST_LONG_MS)` 是给"改密成功后常驻 6 秒"用的，
 *       与"点退出即走"不是同一个状态，本轮不借）。`leaveTo` = 清查询缓存 + hash 路由，与
 *       `LoginScreen` / `SecurityScreen` / `UpgradePasswordScreen` 同一形状。
 *       屏内 0 自碰 token 存储、0 `clearStoredSession` 直调。
 *     - **访客态不渲染这颗**（没有可退出的会话；其访客语义是 PM 待裁项 F-34，本轮维持现状）：G 区的门单用
 *       `showGoal`，**不再**与 F/H 两区同门——F/H 的访客可见性自 T-19g-iv 起按 §3.8.5 `:998` 拆门（见文末"未登录"段）。
 *
 *  6. **H 区页脚（§3.8.1:959 + §3.1 口径 `:466`，T-19g-iii）**
 *     - 两串逐字 = `BRAND.footerLine1`（`© 2026 明日记忆 · 赣ICP备2026013161号-1`）与
 *       `BRAND.footerLine2`（`明天再记，也不算晚。`），顺序照 `:959` 那串的书写顺序（备案号在前、态度话在后）。
 *     - §3.1 的 App 侧口径是"页脚收进「我的」底部（App 首页不放页脚）"⇒ **本区就是 App 侧唯一落点**；
 *       `packages/ui` 里没有现成的 `FooterNote` 组件（全仓唯一实现是 Web 的
 *       `apps/web/src/components/home/footer-note.tsx`），本轮在屏内用两行 `text-xs` 落地，
 *       "组件未上收为 ui pattern"这一句复述进交付报告。
 *     - 备案号是**真号** `赣ICP备2026013161号-1`（主办单位：曹怡明，个人主体）：用户本人 2026-09-26 提供，A-98 #415 ⇒ `F-32` 闭；
 *       屏内仍 0 备案号自造、0 外链（历史成因保留：不许抄 §3.1 图示那份与 shared 不同源的过期串，现在也不许抄）。
 *       Web 侧 `footer-note.tsx:5-6` 走的是另一条口径（"合规字段不许回退成模板"，它渲染裸备案号 + 工信部外链），
 *       与 App 侧"两行裸文本、0 外链"并存 ⇒ 次序与外链两面差继续挂着（D5 / #421② 未裁），本轮不动。
 *     - R-25①：本页不出现任何"数据/同步/缓存"式运维信息，唯一例外仍是 D 区下方那颗人话
 *       `已同步 · 20:31`（`SyncBadge`）；禁词 `云端`/`本地`/`已连接`/`未连接` 屏内 0 处（I-04 全树扫）。
 *
 * 未登录（§3.8.5 第一行 `:998`）：`/me` 是 tab，**不 redirect**（访客留在本页）；B/C/D 三区的数据面
 * 全是 `auth: true` 的接口，访客无源 ⇒ 一律不渲染（尤其 **不许显示 0**：访客态"累计复习/连续"
 * 没有本地真源，画 0 就是半真半假的数，:1001 精神的推广口径按 TPM 裁定执行；`:998` 后半句
 * "C/D/E 保留但数字用本地值"**未随本轮交付**，登记差异）。T-19g-v 起接上 `:998` 的 B 区引导条：
 * 三串 = `SETTINGS_COPY.guestGuide.{headline,subtitle,continueAsGuest}`，主/次按钮 =
 * `AUTH_COPY.submit.login/.register`（不抄第二份，shared `:604-605` 纪律）。两颗按钮各落各的 gate：「登录」
 * `navigate(LOGIN_ROUTE)`、「注册」`navigate(REGISTER_ROUTE)` —— `/register` 与 `/login` 是路由表的两颗 gate、共指 `LoginScreen`，那颗屏的 `mode` 由路由 path 派生 ⇒ 落 `/register` 即注册态，不靠查询参数。
 * 「先不用，继续本机使用」= 只用组件内 `React.useState` 收起本条，**不持久化、0 存储键**（A-02/A-05）；
 * 收起后 F「外观」「关于」与 H 页脚照常可见可点。
 * 访客态的可见面：顶栏标题 + B 区引导条（未收起时）+ F 区「外观」「关于」两行 + H 区页脚两串。
 * `:998` 只点名访客隐藏 F 中「我的查询历史」「修改密码」两行 ⇒ 本屏有源三行里访客只藏「修改密码」一行；
 * 页脚对访客常驻 = TPM 裁定（备案号是个人主办单位的法定公示、与登录态无关），非 §3.8.5 推导。G 区访客仍不画（F-34 待裁）。
 * 「已登录但档案拉取失败」（`:1001`）自 T-19g-v 起整页降级为一个错误卡：
 * `SETTINGS_COPY.fetchFail.{title,body,retry,signOut}` 四槽 + `@tm/ui` `EmptyState` 装配（形状照
 * `StudyScreen.tsx:630-648` 先例，串一律 `SETTINGS_COPY.*`、**不借 `STUDY_COPY.fetchFail`**）；
 * 主按钮 = `void profile.refetch()`，次按钮「退出登录」复用 G 区既有 `ConfirmSheet` 链（不新增第二套
 * 确认层）。在途（`isPending`）不出这张卡（loading 支不在本轮）；该支不画 C/D/E/F/G，但 **H 页脚照画**
 * （F-36 已裁 = A-86 #320 选项 6A：备案号是个人主办单位的法定公示、穿透 `:1001` 整页降级支；门已拆成 `:457` 的
 * `showSettingsSections` 与 `:463` 的 `showFooter` 两颗，E4b6 落地）。首屏骨架（`:1000` 第三行）不在本轮。
 *
 * Chrome84 红线（§5.1 / `tm-app:dist-guard`）：本文件不用 `structuredClone` / `Object.hasOwn` /
 * `Array.prototype.at` / `requestIdleCallback`，不用逻辑赋值 `||=` / `??=` / `&&=`（Chrome 85 起才有）。
 * `packages/ui/src/primitives/` 里**没有** `slider.tsx`（§3.8.2 表列了它但未交付，缺口由 T-15 在
 * `apps/web` 侧同样登记过）⇒ 这里与 Web 同形，用原生 `input[type=range]` + 语义 token 类。
 */

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AUTH_COPY,
  BRAND,
  CHECKIN_COPY,
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_UI_MAX,
  DAILY_GOAL_UI_MIN,
  DAILY_GOAL_UI_PRESETS,
  DAILY_GOAL_UI_STEP,
  NAV_ITEMS,
  SETTINGS_COPY,
  THEME_MODE_LABELS,
  VERBS,
  type ThemeMode,
  maskPhone,
} from '@tm/shared';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  ConfirmSheet,
  EmptyState,
  StatCard,
  useHost,
  useThemeToggle,
} from '@tm/ui';
import { useDueBadge } from '../components/due-badge-data.js';
import { profileProgressOf } from '../components/progress-data.js';
import { checkinStatusQueryOptions } from '../data/queries/checkin.js';
import { profileKeys, profileQueryOptions, updateProfile } from '../data/queries/profile.js';
import { apiErrorMessage } from '../data/rest-fetcher.js';
import { LOGIN_ROUTE, REGISTER_ROUTE, signOut, useAuthSnapshot } from '../lib/auth-store.js';
import { navigate } from '../router.js';
import { SyncBadge } from '../shell/TabBarShell.js';

/* ═════════════════ 常量（都指回真源，屏内 0 中文产品字面量） ═════════════════ */

/** 顶栏/页面标题 = tab 栏同一份 `NAV_ITEMS[].title`（R-18⑤ 逐 tab 口径；`#/me` 那条即 `我的`），不另写字面量。 */
const PAGE_TITLE = NAV_ITEMS.find((item) => item.hash === '#/me')?.title ?? '';

/**
 * 软告知入口的落点 = T-19d 已交付的普通改密页。`auth-store.ts:48-50` 的先例（对 `router.tsx` 零 diff
 * 就写同值常量，A-44 #86）：本屏也不改路由表，故这里同样写常量而非 import 路由表。
 */
const SECURITY_ROUTE = '/security';

/**
 * F 区「关于」行的落点 = T-19f 已交付的关于页（`router.tsx:52`，`kind:'secondary'`）。
 * 同 `SECURITY_ROUTE` 的先例（A-44 #86：屏对 `router.tsx` 零 diff 就写同值常量），
 * 屏侧路由字面量因此多这一颗 —— 已进交付报告的 E4 路由字面量总账。
 */
const ABOUT_ROUTE = '/me/about';

/**
 * C 区三卡的落点（§3.8.1:961：`词本`→单词本 tab、`累计复习`→学习情况、`连续`→学习情况；
 * "热力图滚到今天"跨主文件未接，见文件头 0b）。同 `SECURITY_ROUTE` 的先例（A-44 #86：
 * 对 `router.tsx` 零 diff 就写同值常量），路径名册见 `router.tsx:44-50`。
 */
const WORDBOOK_ROUTE = '/wordbook';
const PROGRESS_ROUTE = '/progress';

/** D 区右侧按钮 `去背单词` 的落点 = 背单词 tab（`#/study`）。 */
const STUDY_ROUTE = '/study';

/**
 * 滑杆域自 T-19g-ii 起唯一源 = shared `limits.ts`（屏内 0 第二副本）。导出供用例钉"⊂ 契约域"。
 * bug_list #6：不再是 `step=5 / max=50`，而是 `step=1 / max=200` —— 连续可调，且不再人为封顶。
 */
export const GOAL_SLIDER = {
  min: DAILY_GOAL_UI_MIN,
  max: DAILY_GOAL_UI_MAX,
  step: DAILY_GOAL_UI_STEP,
} as const;

/** 刻度：两端 + 三个常用档，均匀铺开（值与位置近似对齐，只做视觉参照）。 */
const SLIDER_TICKS: readonly number[] = [GOAL_SLIDER.min, 50, 100, 150, GOAL_SLIDER.max];

const clampToSlider = (n: number): number => {
  if (!(n >= GOAL_SLIDER.min)) return GOAL_SLIDER.min;
  if (!(n <= GOAL_SLIDER.max)) return GOAL_SLIDER.max;
  return n;
};

/* ═════════════════ F 区（§3.8.1:957）：三行的行标签与行件 ═════════════════ */

/**
 * 三行的行标题各取盘上唯一一份：`外观`/`关于` = shared 的 F 区**专用键** `SETTINGS_COPY.rows.appearance` /
 * `.about`（A-86 #320 的 5A：两串在 `copy.ts` 单点声明，`groups` 第 2/4 格与 `rows` 同引同一颗 const ⇒ 屏侧
 * 0 位置借键、0 第二份字面量，与 `AboutScreen.tsx` 的「关于」页 H1 同源）；`修改密码` = `AUTH_COPY.changePassword.title`，
 * 即落点 `/security` 那一屏自己的标题（`SecurityScreen.tsx:146`）⇒ 行标签与落地页 H1 同一常量；三串走样由 J-01 钉红。
 */
const APPEARANCE_TITLE = SETTINGS_COPY.rows.appearance;
const PASSWORD_TITLE = AUTH_COPY.changePassword.title;
const ABOUT_TITLE = SETTINGS_COPY.rows.about;

/**
 * 外观行的三档循环表：与 Web 同页对位件**同一张表**
 * （`apps/web/src/components/profile/settings-list.tsx:63` 的 `NEXT_THEME`，映射逐字相同），
 * 同一条判据的两端实现同形；`light → dark → system → light` 里没有第四档。
 */
const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };

/** F 区的行几何（`:957` 逐字：行高 `min-h-[56px]`；行间 1px 走 ul 的 `divide-y divide-hair` ⇒ 末行天然不描边）。 */
const ROW_CLASS =
  'flex min-h-[56px] w-full items-center gap-3 px-1 text-left text-sm text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-focus focus-visible:rounded-md';

interface SettingRowProps {
  title: string;
  /** `:972` 的 `hint?` 槽：本轮三行都不传（软告知整行已在下文独立交付，不在此重复画第二份）。 */
  hint?: string;
  /** `:972` 的 `trailing` 三档里本轮只用得上两档：`chevron`（可点、无右值）与 `value`（当前档人话）。 */
  trailing?: 'chevron' | 'value';
  /** `trailing='value'` 时上屏的右对齐人话（外观行 = `THEME_MODE_LABELS` 那一格）。 */
  trailingValue?: string;
  onClick: () => void;
}

/**
 * 屏内局部行件：`:972` 点名的 `@tm/ui/patterns/SettingRow.tsx` **盘面不存在**（缺口 G-6 未闭），
 * 而 `packages/ui` 本轮禁改 ⇒ 照本屏既有行（`upgradeTodo` 那一行）的形状在这里画一份，
 * 并保住 `:972` 的槽位命名，将来上收时按同一签名搬走。`icon`/`badge`/`switch` 三槽本轮无源不实现。
 */
function SettingRow({
  title,
  hint,
  trailing = 'chevron',
  trailingValue,
  onClick,
}: SettingRowProps): React.JSX.Element {
  return (
    <li>
      <button type="button" onClick={onClick} className={ROW_CLASS}>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {hint ? <span className="block truncate text-xs text-ink-muted">{hint}</span> : null}
        </span>
        {trailing === 'value' ? (
          <span className="shrink-0 text-right text-sm text-ink-muted">{trailingValue}</span>
        ) : (
          /* 右侧装饰箭头：与 `@tm/ui` `StatCard` 同一颗 `›`（本包不引 lucide，见 package.json 的零依赖声明）。 */
          <span aria-hidden="true" className="shrink-0 text-ink-muted">
            ›
          </span>
        )}
      </button>
    </li>
  );
}

/* ═════════════════ 页面 ═════════════════ */

export default function MeScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const auth = useAuthSnapshot();

  /** 登录判定读 `auth-store` 的派生位（与 `SecurityScreen.tsx:73` 同一份），屏内不碰存储 API、不自算第二份。 */
  const signedIn = auth.hasToken;

  /* R-24⑥ 同口径：首屏失败自动静默重试一次后才降级（降级面 = B/C/D/E 整段不渲染，见文件头"未登录"段）。 */
  const profile = useQuery({ ...profileQueryOptions(), enabled: signedIn, retry: 1 });

  /** 红点/完成页/本页共用的那一份数字（`due-badge-data.tsx:93`，屏内 0 自算第二份）：C 区 `连续` 与 D 区整行都取这里。 */
  const badge = useDueBadge();

  /**
   * **同一查询键**的只读订阅（react-query 同键共享缓存 ⇒ 0 次额外请求）：`useDueBadge` 不暴露
   * "失败面"，这里只取 `data` 判 `checkin/status` 到手没有 ⇒ 没到手不画 C/D（不显示「连续 0 天」假 0）。
   * `retry: 0` 与 `useDueBadge` 内部那颗对齐，避免同键两观察者重试次数不一致。
   */
  const checkin = useQuery({ ...checkinStatusQueryOptions(), enabled: signedIn, retry: 0 });

  /** 词本数 / 累计复习天的唯一投影（`progress-data.ts:135`，`ProgressScreen.tsx:145` 同一形状）。 */
  const profileView = React.useMemo(() => profileProgressOf(profile.data), [profile.data]);

  /** 服务端那一刻的目标值（契约键 `daily_goal`，别名映射不在这屏做第二份）。 */
  const serverGoal = profile.data ? profile.data.daily_goal : DAILY_GOAL_DEFAULT;

  /**
   * 滑杆的**未提交草稿**：`null` = 用户没动过（此时值直接跟服务端）。
   * 只有点「保存」才会把草稿写出去 ⇒ 取消、切走、`onBlur` 一律静默（不发请求、不写、不 toast）。
   */
  const [draft, setDraft] = React.useState<number | null>(null);
  const goal = clampToSlider(draft ?? serverGoal);
  const dirty = draft !== null && draft !== serverGoal;

  /* 写侧的唯一点：既有 `updateProfile()`（`PUT /api/profile`，入参形状由 shared 的 `ProfileUpdateInputSchema` 在服务端裁决）。 */
  const saveMutation = useMutation({
    mutationFn: (next: number) => updateProfile({ daily_goal: next }),
  });

  /**
   * 「在飞」的同帧守门：`disabled` 要等一次重渲染才落到 DOM，同一帧连点两下（WebView 上的双击/两次触摸）
   * 仍会走到第二遍 `onSave`。`isPending` 是渲染态、拦不住这一帧，故另立一枚 ref 只拦「半途写第二遍」。
   */
  const savingRef = React.useRef(false);

  /* 保存成功后重取到的值与草稿一致 ⇒ 清掉草稿，让滑杆回到"跟服务端同一个数"。 */
  React.useEffect(() => {
    if (draft !== null && draft === serverGoal) setDraft(null);
  }, [draft, serverGoal]);

  const onSave = async (): Promise<void> => {
    // `disabled` 只是视觉面，这里再守一次：没弄脏 / 在飞 ⇒ 一个请求都不发（静默，不 toast）。
    if (!dirty || savingRef.current || saveMutation.isPending) return;
    const next = goal;
    savingRef.current = true;
    try {
      await saveMutation.mutateAsync(next);
      host.toast(SETTINGS_COPY.dailyGoal.savedToast(next), 'success');
      void queryClient.invalidateQueries({ queryKey: profileKeys.all });
    } catch (error) {
      // 失败不洗成成功：草稿留着（用户可以直接再点一次保存 = §3.8.3 的"重试"），人话来自既有单点。
      host.toast(apiErrorMessage(error), 'error');
    } finally {
      savingRef.current = false;
    }
  };

  /**
   * §3.8.3 的 E 区与 §3.8.1 的 B 区共用这道门：拉取失败或还没到手就不画半截滑杆/半截账号头
   * （拉取失败支自 T-19g-v 起改画 `:1001` 的整页错误卡，见 `fetchFailed`；在途支仍空页等骨架，不在本轮）。
   * `account` 是 `profile.data` 的收窄别名（TS 需要，不是第二份状态）。
   */
  const account = signedIn ? profile.data : undefined;
  const showGoal = account !== undefined;

  /**
   * `:1001`「拉取失败」整页降级门（T-19g-v）：已登录 **且** `profile` 判失败（`retry: 1` 已设、不改，
   * 静默重试一次判到错才走到这里；**在途 `isPending` 不出卡**，loading 支/骨架不在本轮）。命中即整页
   * 只画错误卡：B 头 / E / F / G 各门（`account`/`showGoal` 一族）天然全假，C/D 两区由
   * `showCheckinData` 里同一条 `!fetchFailed` 一并收进降级面（F-29 拆门后仍守住"整页只一颗卡"），但 H 页脚照画
   * （F-36 已裁 = A-86 #320 选项 6A：备案号穿透整页降级，放行点是 `:463` 的 `showFooter`）。
   */
  const fetchFailed = signedIn && profile.isError;

  /**
   * F-29 真修的降级门（原 `:392` 那颗 `showCheckinRow = showGoal && checkin.data !== undefined`
   * 把 C 区三格与 D 区整行绑在同一颗门上 ⇒ `词本 N 词` 会因为 `checkin/status` 挂掉一起消失，
   * 而那颗数来自 `profileProgressOf(profile.data)`、与打卡无关）。今天按**格**取源分别降级：
   *  - 档案源两格（`词本` / `累计复习`）只看 `showGoal`（= `profile` 到手，与 `showGoal` 管的 B/E 同源）；
   *  - 打卡源两格（C 区连续格 + D 区整行）只看 `checkin` 那一颗同键只读订阅是否到手。
   * `!fetchFailed` 是 `:1001` 整页降级面的下限（与 `showUpgradeHint` 同一族）：命中错误卡支时
   * 全页只画那一颗卡，C/D 不因打卡先回来而多长出第二块内容。
   */
  const showCheckinData = !fetchFailed && checkin.data !== undefined;
  /** C 区容器门：两源任一到手就画这一行网格（三种数字全缺才整段不画）。 */
  const showStatGrid = showGoal || showCheckinData;

  /**
   * 止血阀 `passwordUpgradeEnforce=off` 的软告知位（§6.4-5-5 / A-61 #209②）：
   * `hasToken` 且 `upgradeRequired` ⇒ 只可能是 `auth-store` 那枚内存软告知位（临时凭据那一支
   * 由 `upgradeSessionOnly` 单独表达，`deriveFromStorage()` 里两者互斥）。
   * `:1001` 起另加 `!fetchFailed`：整页降级支只画错误卡（软告知行虽只依赖凭据、不依赖档案，
   * 也一并收进降级面，不让降级页长出第二块内容）。
   */
  const showUpgradeHint = auth.hasToken && auth.upgradeRequired && !fetchFailed;

  /**
   * F 区外观行的当前档与人话：单点 = `@tm/ui` 的 `useThemeToggle()`（与 Web 同页对位件同一个 hook）。
   * 它的 `setTheme(mode)` 内部就是 `applyTheme(mode)` ⇒ 改 `<html>` 类名单 + 只写 `THEME_STORAGE_KEY`
   * 那一个键；屏因此 0 新键名、0 裸存储 API（A-02/A-05 钉）。
   */
  const { theme, setTheme } = useThemeToggle();

  /** G 区二次确认层：只有开/关两态，确认动作只有 `onSignOutConfirmed` 一条路（§3.8.6 必过二次确认）。 */
  const [signOutOpen, setSignOutOpen] = React.useState(false);

  /**
   * `:998` B 区访客引导条的"先不用，继续本机使用"收起位（T-19g-v）：**只用组件内 `React.useState`**，
   * 不持久化、0 存储键（A-02/A-05）——重新进本页引导条照常回来（本轮没有"已读"这件事）。
   */
  const [guestGuideHidden, setGuestGuideHidden] = React.useState(false);

  /**
   * F/H 两区的渲染门（T-19g-iv：拆掉原 `showSettings = showGoal` 那一颗共用的登录门，按 §3.8.5 `:998` 的口径）：
   * - 访客（`!signedIn`）⇒ **渲染**：`:998` 只点名访客隐藏 F 中「我的查询历史」「修改密码」两行；
   *   本屏 F 只有有源三行（:957 的「自动收藏」「每日提醒时间」「我的查询历史」因无数据源故意未渲染，J-04 反向钉），
   *   故访客态实际只隐藏「修改密码」单行，「外观」「关于」两行与 H 区页脚必须看得见。
   * - 已登录但档案没到手（在途 / 拉取失败）⇒ 本门为假（F 区不渲染）：跟 `:1001` 的整页降级口径；
   *   拉取失败支的 H 页脚改由 `:463` 单独放行（F-36 已裁 6A，A-86 #320），在途支仍不画页脚（M-06 钉着）。
   * ⚠ 页脚对访客常驻 = **TPM 裁定**（备案号是个人主办单位的法定公示、与登录态无关），**非 §3.8.5 推导**；
   *   上一版注释里"门把静态的「关于」与页脚挡在登录后面是规范没逐字写的判断、登记待裁"那一缺陷已由本门拆掉。
   * ⚠ 简报口径"页脚无条件渲染"与"拉取失败支 F-03/L-03 既有整表空钉不翻转"的不可兼得已由 A-86 #320
   *   选项 6A 裁定（F-36 闭）：备案号穿透 `:1001` 降级支 ⇒ 页脚另立 `:463` `showFooter`，与登录门分离。
   * G 区（退出登录）不走本门、单用 `showGoal`：访客没有可退出的会话，其语义为 PM 待裁项 F-34，本轮维持现状。
   */
  const showSettingsSections = !signedIn || showGoal;

  /**
   * H 区页脚的门（用户 2026-09-22/23 裁 6A，A-86 #320）：备案号是个人主办单位的法定公示、与数据态无关 ⇒
   * `:1002` 整页降级支**保留页脚**（F-03/L-03 于本轮翻面）；在途支仍不画（6A 没裁 loading 面，M-06 钉着）。
   */
  const showFooter = showSettingsSections || fetchFailed;

  /** 离开本页：先清掉上一会话的查询缓存（词本/查词都可能已属别人），再走 hash 路由 —— 与既有三屏同形。 */
  const leaveTo = (target: string): void => {
    queryClient.clear();
    navigate(target);
  };

  /**
   * G 区确认链的终点：清凭据**只**经 `auth-store.signOut()`（全仓唯一清法，它顺手把内存软告知位也归零），
   * 它返回登录页路由 ⇒ 跳转仍由本屏做（`signOut()` 的注释逐字："调用方负责 `navigate(signOut())`"）。
   * 屏内 0 自碰 token 存储、0 直调 `clearStoredSession`、0 第二份 401 处理。
   */
  const onSignOutConfirmed = (): void => {
    setSignOutOpen(false);
    leaveTo(signOut());
  };

  return (
    <div className="mx-auto w-full max-w-read px-4 pb-10 pt-4" data-testid="me-screen">
      <h1 className="text-lg font-semibold leading-none text-ink">{PAGE_TITLE}</h1>

      {fetchFailed ? (
        /* §3.8.5:1001「整页降级为一个错误卡」：本支不画 C/D/E/F/G（各门天然全假），但 H 页脚照画 ——
         * F-36 已由 A-86 #320 裁定选项 6A（备案号是个人主办单位的法定公示、穿透整页降级支），放行点 = `:463` `showFooter`。
           装配照 StudyScreen.tsx:630-648 的 EmptyState 先例；四槽一律 SETTINGS_COPY.fetchFail.*，
           不借 STUDY_COPY.fetchFail（主语不同：账号信息 vs 学习情况，copy.ts:585-586 已裁定两键不合并）。
           次按钮「退出登录」在本支必现（:1001"仅在已登录态出现"，本支门就是 signedIn）；
           它不新增第二套确认层，开的是 G 区那颗既有 ConfirmSheet。 */
        <div className="mt-4 rounded-xl border border-hair bg-surface">
          <EmptyState
            size="lg"
            title={SETTINGS_COPY.fetchFail.title}
            hint={SETTINGS_COPY.fetchFail.body}
            primary={{
              label: SETTINGS_COPY.fetchFail.retry,
              onClick: (): void => {
                void profile.refetch();
              },
            }}
            secondary={{
              label: SETTINGS_COPY.fetchFail.signOut,
              onClick: (): void => setSignOutOpen(true),
            }}
            testid="me-fetch-fail"
          />
        </div>
      ) : null}

      {!signedIn && !guestGuideHidden ? (
        /* §3.8.5:998 B 区访客引导条（就放在 B 区账号头的位置上，不新增第二颗标题、不改页面层级）：
           三串 = SETTINGS_COPY.guestGuide.*，主/次按钮 = AUTH_COPY.submit.login/.register
           （shared :604-605 纪律：这两串按钮已有既有定稿声明点，此处不抄第二份）。屏内 0 自造串、0 拼接。
           两颗按钮各落各的 gate：「登录」navigate(LOGIN_ROUTE)、「注册」navigate(REGISTER_ROUTE)；
           /register 与 /login 共指 LoginScreen（该屏 mode 由路由 path 派生），?mode= 死参已清。
           「先不用，继续本机使用」只翻组件内 useState（不持久化、0 存储键）。几何：按钮 min-h-tap（≥44px），
           钮所在行 h-14（56px，:1013）。 */
        <div className="rounded-xl border border-hair bg-surface p-4">
          <p className="text-base font-semibold text-ink">{SETTINGS_COPY.guestGuide.headline}</p>
          <p className="mt-1 text-xs text-ink-muted">{SETTINGS_COPY.guestGuide.subtitle}</p>
          <div className="mt-3 flex h-14 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(LOGIN_ROUTE)}
              className={
                'min-h-tap flex-1 rounded-lg bg-brand px-3 text-sm font-medium text-on-brand ' +
                'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
              }
            >
              {AUTH_COPY.submit.login}
            </button>
            <button
              type="button"
              onClick={() => navigate(REGISTER_ROUTE)}
              className={
                'min-h-tap flex-1 rounded-lg border border-hair bg-surface px-3 text-sm font-medium text-brand-strong ' +
                'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
              }
            >
              {AUTH_COPY.submit.register}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setGuestGuideHidden(true)}
            className={
              'mt-1 inline-flex min-h-tap w-full items-center justify-center rounded-md px-2 text-sm text-ink-muted ' +
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
            }
          >
            {SETTINGS_COPY.guestGuide.continueAsGuest}
          </button>
        </div>
      ) : null}

      {account ? (
        <div className="flex items-center gap-3 pb-4 pt-4">
          {/* §3.8.1:953 的 56px 圆形头像；非交互（§3.8.4 相册选图链未接线）。缺图回落 = 品牌底 + 昵称首字。 */}
          <Avatar className="h-14 w-14">
            {account.avatar ? <AvatarImage src={account.avatar} alt="" /> : null}
            <AvatarFallback>{account.nickname.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{account.nickname}</p>
            <p className="text-xs text-ink-muted">{maskPhone(account.phone)}</p>
          </div>
        </div>
      ) : null}

      {showStatGrid ? (
        <div className="mt-1 grid grid-cols-3 gap-3">
          {showGoal ? (
            <StatCard
              label={SETTINGS_COPY.statCards.words.label}
              unit={SETTINGS_COPY.statCards.words.unit}
              value={profileView.totalWords}
              valueText={SETTINGS_COPY.statCards.words.value(profileView.totalWords)}
              onClick={() => navigate(WORDBOOK_ROUTE)}
              testid="stat-words"
              className="h-[84px]"
            />
          ) : null}
          {showGoal ? (
            <StatCard
              label={SETTINGS_COPY.statCards.reviewDays.label}
              unit={SETTINGS_COPY.statCards.reviewDays.unit}
              value={profileView.reviewDays}
              valueText={SETTINGS_COPY.statCards.reviewDays.value(profileView.reviewDays)}
              onClick={() => navigate(PROGRESS_ROUTE)}
              testid="stat-review-days"
              className="h-[84px]"
            />
          ) : null}
          {showCheckinData ? (
            <StatCard
              label={SETTINGS_COPY.statCards.streak.label}
              unit={SETTINGS_COPY.statCards.streak.unit}
              value={badge.streak}
              valueText={SETTINGS_COPY.statCards.streak.value(badge.streak)}
              onClick={() => navigate(PROGRESS_ROUTE)}
              testid="stat-streak"
              className="h-[84px]"
            />
          ) : null}
        </div>
      ) : null}

      {/* D 区整行（F-29 后只看它自己的源 `showCheckinData`，不再与档案源那两格共用门）。 */}
      {showCheckinData ? (
        <div className="mt-3">
          {/* §3.8.1:955 常驻行：`mt-3 p-3 rounded-lg bg-brand-soft`、高 56px（h-14）。整行两串都是定稿原文，屏内 0 拼接。 */}
          <div className="flex h-14 items-center gap-2 rounded-lg bg-brand-soft p-3">
            <p className="min-w-0 flex-1 truncate text-sm text-ink">
              {badge.checkedIn ? CHECKIN_COPY.done(badge.streak) : CHECKIN_COPY.notDone.headline}
            </p>
            <button
              type="button"
              onClick={() => navigate(STUDY_ROUTE)}
              className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              {VERBS.goStudy}
            </button>
          </div>
          {/* §3.8.1:962：同步状态只在 D 区下方以 text-xs 出现一次（三态唯一实现 = `startup.syncLabel()`，组件文档注释点名归批次4 放置）。 */}
          <SyncBadge className="mt-1 block" />
        </div>
      ) : null}

      {showUpgradeHint ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-hair bg-surface p-4">
          <p className="min-w-0 flex-1 text-sm text-ink">{SETTINGS_COPY.upgradeTodo.entry}</p>
          <button
            type="button"
            onClick={() => navigate(SECURITY_ROUTE)}
            className="shrink-0 rounded-lg border border-hair px-3 py-1 text-sm text-brand-strong focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            {SETTINGS_COPY.upgradeTodo.cta}
          </button>
        </div>
      ) : null}

      {showGoal ? (
        <section className="mt-4 rounded-xl border border-hair bg-surface p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-ink">{SETTINGS_COPY.dailyGoal.label}</h2>
            {dirty ? (
              <span aria-hidden="true" className="text-xs leading-none text-warning">
                {SETTINGS_COPY.dailyGoal.dirtyMark}
              </span>
            ) : null}
            <span className="ml-auto text-sm text-ink-muted tnum">
              {SETTINGS_COPY.dailyGoal.value(goal)}
            </span>
          </div>

          {/* bug_list #6：滑杆改成 step=1 的连续可调，再补一排快捷档位 —— 
              单手拖动只出 1 词的粒度，要「10 / 20 / 50 / 100」时点一下就到位。 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {DAILY_GOAL_UI_PRESETS.map((preset) => {
              const active = goal === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-label={SETTINGS_COPY.dailyGoal.value(preset)}
                  aria-pressed={active}
                  onClick={() => setDraft(preset)}
                  className={
                    'min-h-tap rounded-lg border px-3 text-sm tnum focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ' +
                    (active
                      ? 'border-brand bg-brand-soft text-brand-strong'
                      : 'border-hair bg-surface text-ink')
                  }
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <input
            type="range"
            min={GOAL_SLIDER.min}
            max={GOAL_SLIDER.max}
            step={GOAL_SLIDER.step}
            value={goal}
            aria-label={SETTINGS_COPY.dailyGoal.sliderAria(goal)}
            aria-valuetext={SETTINGS_COPY.dailyGoal.sliderValueText(goal)}
            onChange={(event) => setDraft(Number(event.currentTarget.value))}
            className="mt-3 h-11 w-full cursor-pointer accent-brand"
          />

          <div className="flex justify-between text-xs text-ink-muted">
            {SLIDER_TICKS.map((tick) => (
              <span key={tick} className="tnum">
                {SETTINGS_COPY.dailyGoal.value(tick)}
              </span>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void onSave();
              }}
              disabled={!dirty || saveMutation.isPending}
              aria-disabled={!dirty || saveMutation.isPending}
              className={
                'min-h-tap inline-flex items-center rounded-lg px-4 text-sm font-medium ' +
                'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ' +
                (dirty
                  ? 'bg-brand text-on-brand'
                  : 'border border-hair bg-surface text-ink-muted')
              }
            >
              {SETTINGS_COPY.dailyGoal.save}
            </button>
          </div>
        </section>
      ) : null}

      {showSettingsSections ? (
        /* F 区（§3.8.1:957）：只落有源、有落点的三行，相对次序仍按 :957 那串排（外观 → 修改密码 → 关于）。
           `divide-y divide-hair` 让"行间 1px、末行不描边"结构性成立（不靠 last: 覆写）。
           按行取门（§3.8.5 :998）：「修改密码」只在档案到手时画 ⇒ 访客态 0 命中该行、也没有指向 /security 的入口；
           「外观」「关于」是静态行，与登录态无关，访客照样看得见。 */
        <ul
          role="list"
          className="mt-4 divide-y divide-hair rounded-xl border border-hair bg-surface px-3"
        >
          <SettingRow
            title={APPEARANCE_TITLE}
            trailing="value"
            trailingValue={THEME_MODE_LABELS[theme]}
            onClick={() => setTheme(NEXT_THEME[theme])}
          />
          {showGoal ? (
            <SettingRow title={PASSWORD_TITLE} onClick={() => navigate(SECURITY_ROUTE)} />
          ) : null}
          <SettingRow title={ABOUT_TITLE} onClick={() => navigate(ABOUT_ROUTE)} />
        </ul>
      ) : null}

      {showGoal ? (
        /* G 区（§3.8.1:958）：单独一行危险色文字按钮，`mt-6 mb-2` 居中，不混进上面的 F 列表。 */
        <div className="mt-6 mb-2 flex justify-center">
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className={
              'inline-flex min-h-tap items-center rounded-md px-4 text-sm text-danger ' +
              'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
            }
          >
            {VERBS.signOut}
          </button>
        </div>
      ) : null}

      {/* §3.8.2:973：退出登录必过 ConfirmSheet（既有件，本轮未改 `packages/ui`），四槽逐字 = SETTINGS_COPY.signOut.*。
          T-19g-v 起从 G 区的 `showGoal` 块里挪出来常驻（关闭时 Radix 不挂 content，K-01"确认层关闭时不占 DOM"仍成立）：
          `:1001` 错误卡支的次按钮「退出登录」开的就是这同一颗 —— 全屏只此一套退出确认，不新增第二套。 */}
      <ConfirmSheet
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title={SETTINGS_COPY.signOut.title}
        description={SETTINGS_COPY.signOut.body}
        confirmText={SETTINGS_COPY.signOut.confirm}
        cancelText={SETTINGS_COPY.signOut.cancel}
        tone="danger"
        onConfirm={onSignOutConfirmed}
        onCancel={() => setSignOutOpen(false)}
        testid="me-signout"
      />

      {showFooter ? (
        /* H 区（§3.8.1:959 + §3.1 的 App 侧口径"页脚收进「我的」底部"）：两串逐字来自 shared BRAND，
           备案号是真号 `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），屏内 0 自造号、也不加外链。
           访客常驻 = TPM 裁定（备案号是个人主办单位的法定公示、与登录态无关），**非 §3.8.5 推导**；
           「已登录但档案没到手」的 :1002 整页降级支也画 = 用户 2026-09-22/23 裁 6A（A-86 #320，F-36 已裁）。 */
        <footer className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
          <p>{BRAND.footerLine1}</p>
          <p className="mt-1">{BRAND.footerLine2}</p>
        </footer>
      ) : null}
    </div>
  );
}
