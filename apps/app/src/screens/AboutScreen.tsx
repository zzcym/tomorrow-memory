/**
 * App「关于」屏（`#/me/about`，T-19f / 批次 4；PRD R-01⑧、R-03/R-20、§8.3-B 第 12 项，UI §3.8.6）。
 *
 * 这张屏是**纯公开的只读信息页**，未登录也必须可读（§8.3-B 第 12 项 + R-01⑧ "未登录可读，两端一致"），
 * 因此它不判登录态、不发任何请求、不读写任何凭据槽，也不新增一条存储通路。屏内三块，串全部逐字引自
 * `@tm/shared` 的 `notice.ts` / `copy.ts`（**单一真源**，本屏不写一条中文产品字面量，也不拼出自拟句）：
 *
 *  1. **同步承诺**（用户可见的"数据怎么同步 / 存在哪"的说法）：
 *     `SYNC_PROMISE`（UI §8.3-B 第 12 项点名的"同账号同数据、换机不丢"）与
 *     `DATA_OWNERSHIP_NOTE`（UI §3.8.6「关于」行的同步承诺一句）。
 *     ⚠ §8.3-D / R-19⑤ 对"数据存在哪里"有硬口径（禁出现 `云端`/`本地`/`缓存` 一类内部术语），
 *     这两条定稿串**已经处理过这一点** ⇒ 本屏只**引用**，不改写、不补任何一句自造的存放说明。
 *  2. **当前登录方式公告**（现在这台是验证码登录还是密码登录）：
 *     `LOGIN_METHOD_NOTICE`，经 `@tm/ui` 的 `NoticeBar`（`layout='bar'`，其文件头写明这一形态就是
 *     R-01⑧ 的固定公告一句）呈现，与登录弹窗底部那颗 `NoticeBar` **同源同串**。
 *     这一串本身即"两态"的定稿取值：正文说当前 = 手机号 + 密码，括注说验证码通道后续开通
 *     （Q1 定案：本期验证码入口仍在但不给送达承诺）。App 侧的登录态真值源（`auth-store` 快照 /
 *     `token-bridge`）**不带"登录方式"这一维度**，也没有任何"验证码登录"的第二态定稿串
 *     ⇒ 本屏按定稿单一串渲染，**不伪造** per-device 的验证码态（详见交付报告"上报未修"）。
 *  3. **有新版本时可关公告 24 小时**：这一档**不在本屏重写**。`/me/about` 是 `kind: 'secondary'`，
 *     由 `main.tsx:62` 套 `shell/TabBarShell`，而该壳的顶部**已渲染** `VersionBanner`
 *     （`TabBarShell.tsx:79`，R-17⑨）：它订阅 `data/startup.ts` 的版本提示 store、
 *     文案取 `NOTICE_CHANNEL_COPY.updateAvailable`、关闭走 `dismissVersionPrompt()`（→ 写
 *     `native/bridge.ts` 的 `kvSet`，抑制判据在 `shouldShowVersionPrompt()`）。
 *     本屏若再画一条版本行，同一 store 会在同一页渲出**两条**横幅（顶部壳 + 屏内）= 重复。
 *     ⇒ 遵循"0 重写"与"不新开裸存储通路"：屏体**不复制**版本横幅，"关掉之后 24 小时不再出现 /
 *     过期后重新出现"两态在 spec 里**把本屏挂在真实 `TabBarShell` 下**验证（测的是既有件的行为）。
 *
 * 出口纪律：屏只回一块静态 DOM，可交互件 0 颗（收藏/更新/关闭这些动作都归壳与既有件）；
 * 不新增网络请求（约束：登录方式读数只读，且本屏根本不读）；不写凭据槽；无 `:has(`（Chrome 84 红线）；
 * `data-testid` 只挂本屏**根**一颗（照 T-19c `:189`），公告与承诺用 `role` 与文本在 spec 里定位。
 */

import * as React from 'react';
import {
  DATA_OWNERSHIP_NOTE,
  LOGIN_METHOD_NOTICE,
  NOTICE_REVISION,
  SETTINGS_COPY,
  SYNC_PROMISE,
} from '@tm/shared';
import { NoticeBar } from '@tm/ui';

/** `SETTINGS_COPY.rows.about`：shared 的「关于」**专用键**（A-86 #320 的 5A）= 全仓那一串的单点声明，与 `groups[4]` 同一颗 const。 */
const ABOUT_GROUP_LABEL = SETTINGS_COPY.rows.about;

/** 「关于」屏体的同步承诺两句：顺序即 UI 定稿顺序（换机不丢 → 数据归属）。 */
const SYNC_ROWS: readonly string[] = [SYNC_PROMISE, DATA_OWNERSHIP_NOTE];

export default function AboutScreen(): React.JSX.Element {
  return (
    <div
      className="w-full px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6"
      data-testid="about-screen"
    >
      <h1 className="text-h1 font-bold leading-tight text-ink">{ABOUT_GROUP_LABEL}</h1>
      <p className="mt-1 text-xs text-ink-muted">{NOTICE_REVISION}</p>

      <ol role="list" className="mt-6 space-y-2">
        {SYNC_ROWS.map((row) => (
          <li key={row} className="text-body leading-relaxed text-ink">
            {row}
          </li>
        ))}
      </ol>

      {/* R-01⑧ 当前登录方式公告：与登录弹窗底部那颗 NoticeBar 同一份串、同一形态，未登录可读。 */}
      <div className="mt-4">
        <NoticeBar layout="bar" tone="info" role="status">
          {LOGIN_METHOD_NOTICE}
        </NoticeBar>
      </div>
    </div>
  );
}
