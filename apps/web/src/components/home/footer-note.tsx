/**
 * 首页页脚（UI §3.1.2 F / R-22 ③）：一句产品态度话 + 12px 备案信息。
 *
 * 态度话取自 `@tm/shared` 的 `BRAND.footerLine2`（唯一真源）。
 * 备案号与 `BRAND.footerLine1` 现在**同引真号** `赣ICP备2026013161号-1`（用户本人 2026-09-26 给，A-98 #415，F-32 已闭），
 * 但 Web 页脚只渲染**裸备案号**（不带 `© 2026 明日记忆 · ` 前缀，§3.1.2 的 Web 口径）⇒ 这里仍走本地 `ICP_NUMBER`；合规字段不许回退成模板。
 * 窄屏不吸底：底部留白 = tab 高 + 安全区（§3.1.3 末条 / §2.4）。
 */

import Link from 'next/link';
import { BRAND } from '@tm/shared';

const ICP_NUMBER = '赣ICP备2026013161号-1';
const ICP_HREF = 'https://beian.miit.gov.cn';

export function FooterNote(): React.JSX.Element {
  return (
    <footer className="relative z-base mx-auto w-full max-w-read px-4 pt-10 pb-safe-bottom text-center text-xs leading-relaxed text-ink-muted md:px-6">
      <p>{BRAND.footerLine2}</p>
      <p className="mt-1">
        <Link href={ICP_HREF} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
          {ICP_NUMBER}
        </Link>
      </p>
    </footer>
  );
}
