/**
 * 「关于」页（T-16 / 判据⑧；R-01⑧⑧b、R-39⑪ 末句、UI §3.8.6:1008、PRD §6.6-4）。
 *
 * 三条口径：
 *  1. **未登录可读**：本件是**服务端组件**，不读 `localStorage`、不发请求、不套 `<AuthGate>`，
 *     因此产物 HTML 里逐字含 §6.6-4 的五条告知与两条承诺（走查判据 §8.3-E 第 4 项"人话、无内部术语"
 *     也只看这里渲染的串）；
 *  2. **零字面量**（A-37 §五-24）：页面上每一条中文都来自 `@tm/shared`
 *     （`aboutPageNotices()` / `releaseNotices()` / `NOTICE_REVISION` / `AUTH_COPY.agreement`），
 *     分组切点也只是数组下标（§6.6-4 五条 = 协议侧，其后三条 = 数据与登录方式侧），不复制第二份文本；
 *     两个小节标题《用户协议》《隐私政策》从 `AUTH_COPY.agreement` 那句里**切出来**，
 *     与登录弹窗里那两枚书名号链接同源；
 *  3. **顺序即规范顺序**：`aboutPageNotices()` 的数组顺序就是页面呈现顺序（三处渠道同源，
 *     判据③"实测未完成时三处数字均为『若干』"由 `activationOutcomeNotice()` 的默认参保证）。
 *
 * 已知缺口（已登记 `04-dev-report-T-16.md` §5，不在本任务可写面内）：
 *  - shared 里**没有**《用户协议》《隐私政策》的**正文**常量，本页面能给出的只有 §6.6-4 的对外告知
 *    与两条承诺 ⇒ R-23⑤"协议正文至少为静态页可达"目前只能满足"静态页可达"这一半；
 *  - shared 也没有应用版本号常量（只有文案口径版本 `NOTICE_REVISION`）⇒ 版本行显示的是口径版本。
 */

import * as React from 'react';
import { AUTH_COPY, NOTICE_REVISION, SETTINGS_COPY, aboutPageNotices, releaseNotices } from '@tm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@tm/ui';

/** `SETTINGS_COPY.groups` 里「关于」那一格（数组是 §3.8.6 F 区分组标签的唯一源，下标即分组顺序）。 */
const ABOUT_GROUP_LABEL = SETTINGS_COPY.groups[4];

/**
 * 从 `AUTH_COPY.agreement`（`我已阅读并同意《用户协议》《隐私政策》`）里切出两个书名，不另写一份。
 * 不做 `as readonly [string, string]` 强转（TS2352：`match()` 无匹配时返回 `null`，
 * `?? []` 与二元组类型不重叠）—— 取两枚书名靠下标读，读不到就是空标题，不为此伪造第二份文本。
 */
const AGREEMENT_TITLES: readonly string[] = AUTH_COPY.agreement.match(/《[^》]*》/g) ?? [];

/** 协议侧（§6.6-4 五条）与数据/登录方式侧（其后三条）的切点：两条数组都出自同一个函数族。 */
const NOTICE_SPLIT = releaseNotices().length;
const NOTICES = aboutPageNotices();

export const metadata = { title: ABOUT_GROUP_LABEL };

/** 一组告知逐条渲染成有序列表（`role="list"` 由 `<ol>` 自带，UI §3.8.6）。 */
function NoticeList({ rows, testid }: { rows: readonly string[]; testid: string }): React.JSX.Element {
  return (
    <ol data-testid={testid} className="space-y-2">
      {rows.map((row) => (
        <li key={row} className="text-body leading-relaxed text-ink">
          {row}
        </li>
      ))}
    </ol>
  );
}

export default function AboutPage(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-readme px-4 py-6" data-testid="about-page">
      <h1 className="text-h1 font-bold leading-tight text-ink">{ABOUT_GROUP_LABEL}</h1>
      <p data-testid="about-revision" className="mt-1 text-xs text-ink-muted">
        {NOTICE_REVISION}
      </p>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{AGREEMENT_TITLES[0]}</CardTitle>
          </CardHeader>
          <CardContent>
            <NoticeList rows={NOTICES.slice(0, NOTICE_SPLIT)} testid="about-rows-terms" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{AGREEMENT_TITLES[1]}</CardTitle>
          </CardHeader>
          <CardContent>
            <NoticeList rows={NOTICES.slice(NOTICE_SPLIT)} testid="about-rows-privacy" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
