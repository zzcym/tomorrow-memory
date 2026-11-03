/**
 * 公告与对外告知文案的**全库唯一一份**（完成判据③）。
 * 三处渠道（发布说明 / 群内公告 / 「关于」页 + 登录弹窗底部 `NoticeBar`）**必须 import 本文件**，
 * 不得出现第二份副本 —— `tools/boundaries.mjs` 与 T-16/T-19 的判据都按"单一源"检查。
 *
 * 出处逐条：
 *  - `PRD §6.6-4`：对外告知义务（v1.4 由四条扩为**五条**，见 `RELEASE_NOTICES`）
 *  - `R-01⑧`：登录方式公告（关于页 + 登录弹窗底部各一处，未登录可读，两端一致）
 *  - `R-01⑧b / §6.6-4-5`：安全边界告知（同一处展示、同一份文案）
 *  - `R-39⑥`：注册/激活态副标题固定句式
 *  - `R-40⑩`：旧客户端可读提示
 *  - PRD §6.4-2 步 11：三处文案一致 + 版本记录
 */

/**
 * §6.6-2 第二条硬约束：**线上实测完成前，N/M/K 三处一律写"若干"**，
 * 不得填入任何本地 smoke-test 库数字（写"16 个"即为违反 §6.6-2）。
 */
export const NOTICE_UNMEASURED_PLACEHOLDER = '若干';

export interface ActivationCounts {
  accounts?: number | string;
  wordbookRows?: number | string;
  cards?: number | string;
}

const countText = (v: number | string | undefined): string =>
  v === undefined || v === null || v === '' ? NOTICE_UNMEASURED_PLACEHOLDER : String(v);

/**
 * §6.6-4 第 2 条 —— **固定句式，一字不改**（含间隔号与书名号）。
 * 判据：实测未完成时三处数字均为"若干"；§6.6 禁词表中的任一旧口径承诺式表述出现在本文件即阻断发布
 * （`node tools/boundaries.mjs --copy` 逐行扫描，含注释）。
 */
export function activationOutcomeNotice(counts: ActivationCounts = {}): string {
  return `此前用短信验证码注册、还没有设置过密码的账号（线上实测共 ${countText(
    counts.accounts,
  )} 个账号、${countText(counts.wordbookRows)} 条词本记录、${countText(
    counts.cards,
  )} 张学习卡片），现在用同一个手机号点『注册』并设置一个至少 8 位的密码，即可直接激活原账号，词本与学习进度全部保留。`;
}

/** §6.6-4 第 1 条。 */
export const NOTICE_REGISTER_METHOD = '本期起注册方式 = 手机号 + 密码，密码至少 8 位。';

/** §6.6-4 第 3 条（**不得出现任何期限类表述**，Q9' 定案：改密要求不设时间窗口）。 */
export const NOTICE_FORCE_UPGRADE =
  '下次登录需要先修改密码：除本期新设密码的账号外，此前设置过密码的账号首次登录会被要求先改密码（至少 8 位），改密前停留在改密页，改完自动回到原页面。';

/** §6.6-4 第 4 条（= §6.2-2 / R-40⑩）。 */
export const NOTICE_LEGACY_APP_PASSWORD =
  '旧版本 App 的"修改密码"入口本期不可用；被要求改密的旧 App 用户请到网页端 tmword.xyz 修改后重新登录。';

/** §6.6-4 第 5 条 / R-01⑧b —— 安全边界告知（**禁止内部术语**，判据在 §8.3-E 第 4 项）。 */
export const NOTICE_ACCOUNT_BOUNDARY =
  '只要知道这个手机号，任何人都可以用它注册或设置密码来拥有这个账号，所以请把手机号当作密码一样保密。';

/** R-39⑥ —— 注册/激活态副标题**固定句式**（激活认领态逐字复用同一句，不新增第三态）。 */
export const ACTIVATE_SUBTITLE =
  '同一个手机号：设一个至少 8 位的密码即可激活并保留原有的单词本、学习卡片和打卡记录';

/** R-01⑧ —— 登录方式公告（关于页 + 登录弹窗 `NoticeBar` 同一份，未登录可读，两端一致）。 */
export const LOGIN_METHOD_NOTICE = '当前登录方式：手机号 + 密码（短信验证码通道后续开通）';

/** R-01⑥ —— 验证码入口旁**常驻** 12px 说明（不给收不到的承诺之外的任何措辞）。 */
export const SMS_UNAVAILABLE_HINT = '短信通道暂未开通，验证码可能收不到';

/** §8.3-B-12 + UI §3.8.6 —— 关于页的同步承诺一句（R-03/R-20 把它升级为真承诺）。 */
export const SYNC_PROMISE = '同账号同数据、换机不丢';
/** UI §3.8.6「关于」行的同步承诺一句。 */
export const DATA_OWNERSHIP_NOTE = '你的词本和学习记录只属于你，可以随时导出或删除';

/**
 * §6.6-4 的五条对外告知（顺序即发布说明与「关于」页的呈现顺序）。
 * 第 2 条由 `activationOutcomeNotice()` 渲染，因此这里给**函数引用 + 已渲染版**两种形态，
 * 避免三处渠道各自拼串（数字实测完成后只需改调用处的 `counts`）。
 */
export function releaseNotices(counts: ActivationCounts = {}): readonly string[] {
  return [
    NOTICE_REGISTER_METHOD,
    activationOutcomeNotice(counts),
    NOTICE_FORCE_UPGRADE,
    NOTICE_LEGACY_APP_PASSWORD,
    NOTICE_ACCOUNT_BOUNDARY,
  ] as const;
}

/** 「关于」页固定顺序：五条告知 + 两条承诺 + 一条公告（三处渠道 import 同一数组）。 */
export function aboutPageNotices(counts: ActivationCounts = {}): readonly string[] {
  return [...releaseNotices(counts), SYNC_PROMISE, DATA_OWNERSHIP_NOTE, LOGIN_METHOD_NOTICE] as const;
}

/* ───────── 版本记录（PRD §6.4-2 步 11 要求三份文案同源、可追溯到口径版本） ───────── */

/**
 * 文案口径版本：任何一条 §6.6-4 / R-01⑧ / R-39⑥ 的字句变动都要同时提升本值，
 * 并同步发布说明（清单步 11 的"三份文案一致"按本值比对）。
 */
export const NOTICE_REVISION = 'v1.4-r1';

/** 口径变更历史（对外不展示，供发布报告与 QA 对账引用；旧表述以"旧口径三条"整体指代，不逐字复述）。 */
export const NOTICE_REVISION_HISTORY = [
  {
    revision: 'v1.4-r1',
    change: '按第 5 轮 F-1 定案补第 5 条安全边界告知；§6.6-4 由四条扩为五条',
    from: 'PRD §6.6-4 / R-01⑧b',
  },
  {
    revision: 'v1.3-r1',
    change: "Q8' 定案：旧口径三条整体作废，改为『设密码即激活』",
    from: 'PRD §6.6-1 / R-39⑤b⑥',
  },
  {
    revision: 'v1.3-r2',
    change: "Q9' 定案：强制改密不设时间窗口，告知文案不写任何期限或剩余天数",
    from: 'PRD §5.2b / R-40④',
  },
] as const;
