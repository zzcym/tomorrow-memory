/**
 * 界面静态文案的**唯一真源**（UI §6.4 定稿文案总表的落地件）。
 *
 * 规则（UI §6 preamble / §8.2-14）：
 *  1. 两端组件与 App **只能 import 本文件与 `constants/errors.ts`**，不得自带任何字面量；
 *  2. 表内文案即验收值，**一字不改**（含间隔号 `·`、破折号 `——`、书名号 `『』《》`、空格）；
 *  3. 对外告知与公告（PRD §6.6-4 / R-01⑧ / R-39⑥）**不在这里重复**，一律 `import` 自
 *     `constants/notice.ts`；错误码人话一律 `import` 自 `constants/errors.ts`；
 *  4. 带变量的格子写成函数（如 `capsule.due(12)`），模板串本身仍是验收值。
 *
 * 出处标记：`§6.4-品牌` / `§6.4-查询` / `§6.4-背词` / `§6.4-词本` / `§6.4-学情` /
 * `§6.4-设置` / `§6.4-登录` / `§6.4-同步` / `§6.4-打卡` / `§6.4-通知` / `§6.5` / `§6.8` / `§6.3` / `§6.2`。
 */

import { MODE_LABELS, RATING_LABELS } from './rating.js';
import { AVATAR_MAX_BYTES, RECENT_MAX, WORDBOOK_BATCH_MAX } from './limits.js';
import { TM_ERRORS } from './errors.js';
import {
  ACTIVATE_SUBTITLE,
  LOGIN_METHOD_NOTICE,
  NOTICE_ACCOUNT_BOUNDARY,
  NOTICE_FORCE_UPGRADE,
  NOTICE_LEGACY_APP_PASSWORD,
  NOTICE_REGISTER_METHOD,
  SMS_UNAVAILABLE_HINT,
  SYNC_PROMISE,
  DATA_OWNERSHIP_NOTE,
  activationOutcomeNotice,
} from './notice.js';

export { ACTIVATE_SUBTITLE, LOGIN_METHOD_NOTICE, SMS_UNAVAILABLE_HINT };

/**
 * `没有账号？注册` 的**唯一声明点**：§6.4-登录表「登录墙」行与 §3.9.1「次级文字链」登录态那一格
 * 是同一串的两处引用（PRD R-23① / R-39⑨ 同一条）。`AUTH_COPY.wall.link` 与
 * `AUTH_COPY.switchToRegister` 都引本常量，避免同一串在本文件里出现第二份字面量。
 * T-03r（A-43 #76 · `01-prd-fix4.md` §5 步骤 4）追加第三处引用 = `WORDBOOK_COPY.emptySignedOut.link`
 * （§3.6.5-3 / 842 行定稿串与本串逐字相同）；⚠ `const` 无提升，声明必须位于 `WORDBOOK_COPY` 之前，
 * 故整块上移至此处，**声明点仍唯一**（原 §6.4-登录 处只留指路注释）。
 */
const SWITCH_TO_REGISTER_LABEL = '没有账号？注册';

/* ═════════════════ §6.1 命名口径（术语字典） ═════════════════ */

/** 底部 tab（定案 D-4 / §3.10.1）：标签两字版，顶栏标题全称版。 */
export const NAV_ITEMS = [
  { tab: '查词', title: null, icon: 'Search', href: '/', hash: '#/' },
  { tab: '背单词', title: '背单词', icon: 'Layers', href: '/study', hash: '#/study' },
  { tab: '单词本', title: '单词本', icon: 'BookOpen', href: '/wordbook', hash: '#/wordbook' },
  { tab: '学习', title: '学习情况', icon: 'TrendingUp', href: '/report', hash: '#/progress' },
  { tab: '我的', title: '我的', icon: 'User', href: '/profile', hash: '#/me' },
] as const;

/**
 * 「更多」抽屉的两项标签（§3.10.3:1148-1149 顺序锁死：`和 AI 聊聊` → `测一测词汇量` → 外观 → 退出）。
 * A-30-7 追加件：这两串此前只在 `apps/web/src/lib/nav.ts` 的 `MORE_NAV` 里由宿主自带字面量，
 * shared 缺常量 ⇒ 批次4 起改成本常量为唯一真源。**宿主注入的旧用法继续合法**（A-8 / A-23），本轮不动各页面。
 */
export const MORE_NAV_LABELS = {
  chat: '和 AI 聊聊',
  assess: '测一测词汇量',
} as const;

/** 今日待背单位（`N 个词`：数字与"个"之间不空格，"词"前不空格）。 */
export const formatDue = (n: number): string => `${n} 个词`;
/** 连签单位。 */
export const formatStreak = (n: number): string => `连续 ${n} 天`;

/** 主题三态（D-3，唯一开关 `light|dark|system`）。 */
export type ThemeMode = 'light' | 'dark' | 'system';
export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

/** 技术细节折叠区（R-25 ④，`DetailsDisclosure` 的标签）。 */
export const DETAILS_DISCLOSURE_LABEL = '详细信息';

/** 头像/昵称字段名（本产品无 username）。 */
export const IDENTITY_LABELS = { avatar: '头像', nickname: '昵称' } as const;
/** 每日目标（§3.8.3）。 */
export const DAILY_GOAL_LABELS = { label: '每日目标', unit: '词' } as const;

/* ═════════════════ §6.2 内部术语 → 人话（右列 = 唯一合法表述） ═════════════════ */

export const PLAIN_TERMS = {
  /** 需要时间口径时唯一写法：`数据截至 今天 09:20`。 */
  dataAsOf: (when: string): string => `数据截至 ${when}`,
  /** 区块必须解释时的唯一说法（否则整块不渲染）。 */
  featureNotLive: '这个功能还没上线',
  /** 正常态不显示任何连接状态，只有断了才出现这一句。 */
  connectionDown: '连接断了 · 点这里重连',
  /** §6.2 第 7 行内部指标的替代词。 */
  retention: '记住程度',
  nextRecall: (interval: string): string => `下次再见：${interval}`,
  /** §6.2 第 8 行内部指标的替代。 */
  needsReview: '还要不要复习',
  reviewPlanTitle: '复习安排',
  /** 算法相关：不出现内部名词，最多这一句。 */
  schedulingNote: '我们会根据你答的情况安排下一次',
  /** 未登录场景（不出现 userId / token / 401 / 500）。 */
  continueAfterLogin: '登录后可以继续',
  /**
   * E5c（注册用户屏幕显示 `404 Not Found` 的缺陷本体）：上游服务端**没有这颗端点**
   * （404 / 405，或响应体根本不是合法 JSON —— 裸文本、网关的 HTML 错误页）时的人话唯一份。
   * ⛔ 各端不得把上游原文当成人话糊上屏，也不得在本串之后再拼第二句。
   * 消费点 = `apps/app/src/data/rest-fetcher.ts` 的 `apiErrorMessage()` 单点
   * 与 `LoginScreen.tsx` 的 `failureOf()`；判定单点 = `rest-fetcher` 的 `isMissingEndpoint()`。
   * ⚠ 值 = TPM 定稿，逐字锁定（`contracts.spec` 的"定稿文案逐字"面），改一个字即红。
   */
  unknownEndpoint: '服务端未开通该功能，请稍后再试或到网页端 tmword.xyz 操作。',
} as const;

/* ═════════════════ §6.3 词形变化中文标签 `INFLECTION_LABELS` ═════════════════ */

/** 原始缩写 → 定稿标签。未知缩写整条不渲染并 `logMeta('inflection_unknown')`。 */
export const INFLECTION_LABELS: Record<string, string> = {
  'p:': '过去式',
  'd:': '过去分词',
  'f:': '现在分词',
  'ing:': '现在分词',
  '1e:': '复数形式',
  '2e:': '复数形式',
  '3e:': '复数形式',
  'R:': '比较级',
  'T:': '最高级',
  's:': '第三人称单数',
  'z:': '副词形式',
};

/** `2e:`（次复数）不展示；`R:`/`T:` 与 `s:`/`z:` 的展示顺序。 */
export const INFLECTION_HIDDEN = ['2e:'] as const;

/** 渲染格式：`过去式 hugged · 过去分词 hugged`。 */
export function formatInflections(entries: ReadonlyArray<{ tag: string; form: string }>): string {
  return entries
    .filter((e) => !e.tag.startsWith('2e:'))
    .map((e) => `${INFLECTION_LABELS[e.tag] ?? ''} ${e.form}`.trim())
    .filter((s) => s.length > 0)
    .join(' · ');
}

/* ═════════════════ §6.4-品牌：品牌与首页（R-22 ③） ═════════════════ */

export const BRAND = {
  name: '明日记忆',
  domain: 'tmword.xyz',
  /** 首页 slogan（`<h1>`，22px/700）。 */
  slogan: '记不住的，交给明天',
  footerLine1: '© 2026 明日记忆 · 赣ICP备2026013161号-1',
  footerLine2: '明天再记，也不算晚。',
} as const;

export const SEARCH_PLACEHOLDER = '查一个单词';
/** 输入中（非空）**无 placeholder**，且不清空用户已输入内容。 */
export const SEARCH_PLACEHOLDER_WHILE_TYPING = null;

/** 首页胶囊三态。 */
export const HOME_CAPSULE = {
  /** bug #1：优先显示"还没学的词"，其次才是有多少要复习。 */
  toLearn: (n: number): string => `还有 ${n} 个词没学`,
  due: (n: number): string => `今天还有 ${n} 个词要背`,
  cleared: '今天的词背完了',
  signedOut: (n: number): string => `登录后可同步，本机已背 ${n} 词`,
} as const;

/* ═════════════════ §6.4-查询：查询与结果（§3.2） ═════════════════ */

export const LOOKUP_COPY = {
  /** 搜索中（≥300ms 才显示）：无文字，只有骨架。 */
  searching: null,
  /** bug #3：查词命中即自动入库的那条提示（与手动加星区分，且同样可撤销）。 */
  autoAdded: '已自动放进单词本',
  notFound: {
    title: '没找到这个词',
    subtitle: '检查一下拼写，或者换个词形试试',
  },
  networkFail: '查询失败了 · 再试一次',
  resultActions: {
    detail: '查看详情',
    favorite: '收藏',
    favorited: '已收藏',
  },
  favoriteToast: {
    body: '已放进单词本',
    action: '撤销',
  },
  unfavoriteConfirm: {
    title: '从单词本移除？',
    body: (word: string): string => `${word} 会从单词本移除，复习记录一并删除。`,
    confirm: '移除',
    cancel: '取消',
  },
  /** 最近查询空态：不渲染面板（不是空态提示串）。 */
  recentEmptyRendersNothing: true,
  recent: {
    title: '最近查询',
    clear: '清空',
    clearConfirmTitle: '清空最近查询？',
    clearConfirmBody: '只清这一台设备上的记录。',
    /** 面板容量 = `RECENT_MAX`（§4.4.3）。 */
    max: RECENT_MAX,
    /** §3.2 状态表「聚焦且无历史」：面板仍浮出，默认值即验收串（20 由 `RECENT_MAX` 供给）。 */
    emptyOnFocus: (max: number = RECENT_MAX): string => `查过的词会出现在这里，最多记 ${max} 个`,
  },
  /** §3.3：最近查询首义缺失不得留空白（R-10②）。 */
  noGloss: '（无释义）',
  /** §3.3 行「kv 读取异常」：面板显示一行，不空白。 */
  readFail: '暂时读不到查词记录',
  /** §3.2.4 行「有词头无释义」（部分成功，R-09④）。 */
  partialNoGloss: '暂时没查到中文解释 · 查看详情',
  /**
   * §3.1.2 E 行 3 的方向链文字串（`03-ui-spec.md:590`）。
   * A-30-7 追加件：此前由 `apps/web/src/components/home/result-section.tsx` 以模块级常量宿主注入
   * （`LookupResultBar` 的 `directionLabel` props 一栏本来就标"宿主注入"）；旧用法继续合法（A-8 / A-23）。
   */
  directionSwitch: '不是这个？换个查询方向',
} as const;

/* ═════════════════ §6.4-查询：词详情页（§3.4，两端同一分区顺序） ═════════════════ */

/** 四个区块的小标题与 `<section aria-label>` **同源同一串**（§3.4 分区顺序表 3/4/5/7 区）。 */
export const WORD_DETAIL_SECTION_LABELS = {
  meaning: '释义',
  inflection: '词形变化',
  example: '例句',
  mnemonic: 'AI 记法',
  /**
   * 柯林斯频率徽章的前缀（词详情页区块 1 的频率档标注）。
   * A-30-7 追加件：此前由 `apps/web/src/components/word-lookup.tsx` 的模块级 `collinsBadge()` 自带字面量，
   * 登记处 = `04-dev-report-T-12.md` §5.1-2 / §4.2（"shared 缺常量"清单）。
   * ⚠ 定稿面欠账：`03-ui-spec.md` 全篇 `柯林斯` **0 命中**（实测），§6.4/§6.8 未收录该串与其渲染格式
   *   ⇒ 请 PM 在 v1.5 一并定稿；本常量按 A-30-7 清单逐字落，渲染形如 `柯林斯 5` 的整串
   *   由下面的 `WORD_DETAIL_COPY.frequencyCollins()` 从本键组装，⛔ 各端不得再抄第二份。
   */
  collins: '柯林斯',
} as const;

/** 详情页折叠行与吸底操作（§3.4 分区表 5/6/8 区）。 */
export const WORD_DETAIL_COPY = {
  /** 区块 5：例句 >3 条时折叠（尾随的 `›` 是图标，不写进文案串）。 */
  moreExamples: (n: number): string => `还有 ${n} 句`,
  /** 区块 6：英文释义（默认收起）。 */
  enDefinition: '英文释义',
  /** 区块 7：AI 记法收起一行（§3.4.2 定稿；展开态标题用 `WORD_DETAIL_SECTION_LABELS.mnemonic`）。 */
  mnemonicCollapsed: 'AI 记法 · 词根 / 口诀 · 点击查看',
  /** 区块 8：次按钮（一页只有一颗主色实心按钮 = 收藏）。 */
  studyThisWord: '立即背这个词',
  /**
   * 区块 1：柯林斯频率徽章整串（A-30-7 追加件）。
   * 前缀取 `WORD_DETAIL_SECTION_LABELS.collins`，**不在此重复 `柯林斯` 字面量**；
   * 与改动前 `word-lookup.tsx` 的 `collinsBadge()` 渲染串逐字同形（`柯林斯 5`，数字与词之间一个空格）。
   */
  frequencyCollins: (freq: number): string => `${WORD_DETAIL_SECTION_LABELS.collins} ${freq}`,
} as const;

/* ═════════════════ §6.4-背词：背单词（§3.5） ═════════════════ */

export const STUDY_COPY = {
  cardFaceHint: '点击卡片看释义',
  progress: (index: number, total: number): string => `第 ${index} 张，共 ${total} 张`,
  /** §3.5 卡顶一行：`今天 3/12`（可视文本与 progressbar 的 `aria-valuetext` 同一串）。 */
  todayCounter: (done: number, total: number): string => `今天 ${done}/${total}`,
  /** §3.5.4 评分条下方的两档提示：触屏版与桌面版（`md+` 且 `pointer: fine`）。 */
  ratingHintTouch: '点卡片翻面 · 左滑忘记 右滑轻松',
  ratingHintKeyboard: '空格 翻面 · ← 忘记 · → 轻松',
  ratingButtons: RATING_LABELS,
  modeLabels: MODE_LABELS,
  undo: {
    button: '撤销',
    toast: (index: number): string => `已撤销，回到第 ${index} 张`,
  },
  noGloss: {
    title: '这个词暂无释义',
    retry: '重试',
    skip: '今天先跳过',
  },
  aiMnemonicFail: 'AI 记法生成失败 · 重试',
  /** 行内提示（禁止任何"再按一次"式措辞）。 */
  ratingSaveFail: '评分没保存 · 再试一次',
  ttsUnavailable: '点这里安装/切换系统英文语音',
  emptyQueue: {
    review: {
      title: '今天的复习清空了',
      subtitle: '明天会再来一批，或者现在多学几个新词',
      primary: (batch: number): string => `学 ${batch} 个新词`,
      secondary: '去查词',
    },
    new: {
      title: '词本里的词都在背了',
      subtitle: '去查几个新词加进来，就能开新一轮',
      cta: '去查词',
    },
    selfTest: {
      title: '词还不够，先攒几个',
      subtitle: '自测要从你的单词本里抽词，至少要有 5 个',
      cta: '去查词',
    },
  },
  fetchFail: {
    title: '今天没能取到词单',
    subtitle: '可能是网络的事，再试一次',
    retry: '重试',
    goLookup: '去查词',
  },
  dailyGoalReached: {
    title: (goal: number): string => `今天 ${goal} 个词的目标完成了`,
    body: (streak: number): string => `再多背一点，或者明天继续 —— 你已经连续 ${streak} 天了`,
    again: '再背一批',
    stop: '今天就到这',
  },
  summary: {
    round: '本轮结束',
    cards: (n: number): string => `${n} 张`,
    durationPrefix: '用时',
    again: '再背一批',
    home: '回首页',
  },
  /** 离线背词（App）。 */
  offlineStudy: '现在没有网络，背词进度会先记在手机上，联网后自动同步',
} as const;

/** 四档按钮下方的下次间隔：≤60 分钟显示分钟，其余显示天。 */
export function formatReviewInterval(minutes: number): string {
  return minutes <= 60 ? `${minutes} 分钟后` : `${Math.round(minutes / (60 * 24))} 天后`;
}

/** 完成页四档计数：`忘记 2 · 困难 1 · 良好 6 · 轻松 3`（间隔号前后各一个半角空格）。 */
export function formatRatingBreakdown(counts: Partial<Record<1 | 2 | 3 | 4, number>>): string {
  return ([1, 2, 3, 4] as const)
    .map((v) => `${RATING_LABELS[v]} ${counts[v] ?? 0}`)
    .join(' · ');
}

/** 时长：`4 分 12 秒` / 不足 1 分钟 `48 秒` / ≥1 小时 `1 小时 5 分`。 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} 秒`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分 ${sec} 秒`;
}

/* ═════════════════ §6.4-词本：单词本（§3.6） ═════════════════ */

export const WORDBOOK_COPY = {
  emptySignedOut: {
    title: '登录后才能看到你的单词本',
    subtitle: '同一个手机号，词本和进度都会跟着走',
    cta: '手机号登录',
    /** §3.6.5-3（842）与登录墙/`AUTH_COPY.switchToRegister` 同一串 ⇒ 引唯一声明点，不重打字面量。 */
    link: SWITCH_TO_REGISTER_LABEL,
  },
  emptyLoggedIn: {
    title: '单词本还是空的',
    subtitle: '查到想记的词，点一下星标就存到这里',
    cta: '去查词',
  },
  filteredEmpty: {
    title: '这里没有符合条件的词',
    subtitle: '换个筛选，或者清空搜索看看',
    cta: '清空筛选和搜索',
  },
  /** §3.6.5-6（845）列表拉取失败：形状 = 标题 + 副行 + 主按钮（重试）+ 次按钮（去查词）。 */
  pullFail: {
    title: '没能取到你的单词本',
    subtitle: '再试一次，或者先回首页查词',
    retry: '重试',
    lookup: '去查词',
  },
  /** §3.6.3 行 2：首义缺失时不得空行（与最近查询的 `（无释义）` 是两处不同口径）。 */
  noGloss: '（暂无释义）',
  batch: {
    selected: (n: number): string => `已选 ${n} 个`,
    addToToday: '加入今日',
    remove: '移出单词本',
    clearSelection: '取消选择',
    max: WORDBOOK_BATCH_MAX,
  },
  sortMenu: {
    recent: '最近加入',
    alphabetical: '按字母',
    dueFirst: '复习到期在前',
  },
  swipeDelete: {
    confirm: '移出单词本',
    undoToast: (word: string): string => `已移出 ${word} · 撤销`,
  },
  /** 同步徽章替代任何"已同步/未同步"式内部名词（§6.2 第 6 行）。 */
  syncBadge: {
    synced: (hhmm: string): string => `已同步 · ${hhmm}`,
    /* bug #7：原来只写「待同步 N」，用户不知道在等什么。改成一句人话（N 个词还没传上去）。 */
  pending: (n: number): string => `还有 ${n} 个词待上传`,
    offlineSilent: null,
    replayFail: '还没同步 · 联网后会自动补上',
    retry: '重试',
  },
  /**
   * §3.6.2 行「该词已在词本里」的 toast 正文（A-30-7 追加件）。
   * 此前由 `apps/web/src/components/word-lookup.tsx` 的模块级 `TM_ALREADY_ADDED` 宿主注入
   * （登记处 = `04-dev-report-T-12.md` §5.1：`WORDBOOK_COPY` 只有"移出"侧、缺"已存在"态）。
   * ⚠ 与收藏成功的 `LOOKUP_COPY.favoriteToast.body`（`已放进单词本`）是**两个不同状态**，不得合并成一条。
   */
  alreadyAdded: '该单词已在单词本中',
  /** §3.6.5 第 7 行（`03-ui-spec.md:846`）删除写失败（离线）· A-48 #114 缺 key 补齐，T-03r2b 起宿主只转发（App 的 `WORDBOOK_APP_COPY` 与本屏 `COPY` 均引本串）。⚠ "联网后会自动删掉"是**删除侧独有**的补传承诺，不外借。 */
  deleteNotQueued: '这条先记在手机上了，联网后会自动删掉',
  /** §3.6.5 第 5 行（`03-ui-spec.md:844`）释义批量补齐中·起手一次性小字 · A-48 #114 缺 key 补齐；Web 宿主以 `HOST_COPY.fillingGlosses` 转发本串（同名键位保留给既有消费点）。 */
  glossPending: '正在补齐释义…',
  /** §3.6.5 第 5 行（`03-ui-spec.md:844`）释义批量补齐中·超 5s 改口态 · A-48 #114 缺 key 补齐；Web 宿主 `HOST_COPY.glossStalled` 转发本串。 */
  glossStalled: '有些词的释义还没补上',
  /** §3.6.5 第 8 行（`03-ui-spec.md:847`）加星写失败（离线）· PM-fix6 定稿 / A-52 #135 戳表。⚠ 收藏侧**没有自动补传**，本串不得含任何"会自动…"式承诺。消费点 = App `result-row.tsx` 的 `addWord` catch；取消收藏（`drop`）仍引 `deleteNotQueued`，两条不可互换（PM 反向哨②）。 */
  favoriteNotSaved: '这条没能记下，再点一次试试',
} as const;

/* ───────── A-43 #80（F-5）· T-03r：四档筛选/排序字面串上收（两端唯一真源） ─────────
 * 此前 `apps/app/src/components/wordbook-toolbar.tsx` 的 `WORDBOOK_APP_COPY` 与
 * `apps/web/src/lib/api/wordbook.ts` 的 `HOST_COPY` **各手抄了一份**下面这四档 + 四档的串
 * （两端注释自陈「字面串与该表逐字一致」= 靠人肉维持的一致，迟早漂移）。
 * 本块是这批串的**唯一声明点**：取值域数组（= `?sort=` / `?filter=` 的 URL 契约键序）与定稿档名
 * 一并上收，两端组件改为 import；**组件本体留在 app 侧**，不动 `packages/ui`（#80 原话）。
 * ⚠ 与 `WORDBOOK_COPY.sortMenu`（3 档旧口径）不是一回事：那三条的**改串**归 §2 表 B、本轮不动；
 *   本块只消除"两端各存一份四档字面串"的重复声明。
 */

/** UI §3.6.3 表 826 行 + §3.6.1 口径 789 行的排序取值域（数组序 = 菜单显示序）。 */
export const WORDBOOK_SORTS = ['recent', 'alphabetical', 'longestIdle', 'mostForgotten'] as const;
export type WordbookSort = (typeof WORDBOOK_SORTS)[number];

/** UI §3.6 区 C 的筛选取值域（数组序 = 胶囊显示序）。 */
export const WORDBOOK_FILTERS = ['all', 'new', 'learning', 'mastered'] as const;
export type WordbookFilter = (typeof WORDBOOK_FILTERS)[number];

/** 排序四档定稿名（§3.6.3 表 826 行逐字：`字母`/`最新加入`/`最久没碰`/`最常忘`）。 */
export const WORDBOOK_SORT_LABELS = {
  alphabetical: '字母',
  recent: '最新加入',
  longestIdle: '最久没碰',
  mostForgotten: '最常忘',
} as const;

/** 筛选四档定稿名（§3.6 区 C 逐字：`全部`/`新词`/`在背`/`已掌握`）。 */
export const WORDBOOK_FILTER_LABELS = {
  all: '全部',
  new: '新词',
  learning: '在背',
  mastered: '已掌握',
} as const;

/* ═════════════════ §6.4-学情：学习情况（§3.7） ═════════════════ */

export const PROGRESS_COPY = {
  loading: '正在整理学习记录…',
  fail: {
    title: '学习情况没拿到',
    body: '网络或服务器刚好在忙，你的记录没有丢。',
    retry: '再试一次',
  },
  heatmapUnavailable: '热力图暂时打不开',
  offline: '离线中 · 显示的是上次到手机上的记录',
  cards: {
    weekAdded: '本周新增',
    todayDue: '今日待复习',
    streak: '连续天数',
  },
  curve: {
    title: '新增单词',
    subtitle: '最近 30 天',
    ariaLabel: '最近 30 天新增单词曲线',
  },
  heatmapModes: {
    daily: '每日',
    weekly: '每周',
    cumulative: '累计',
  },
  tooFewData: '背够 3 天就有曲线了',
  signedOut: {
    title: '登录后能看到你的进步',
    subtitle: '词本和进度会自动同步过来',
    cta: '手机号登录',
  },
  /** 热力图单格（§6.8）。 */
  heatCell: (date: string, count: number): string => `${date}，背了 ${count} 个词`,
  heatCellEmpty: (date: string): string => `${date}，没有学习`,

  /* ── 以下九键 = 原宿主对象 `apps/app/src/components/progress-data.ts` 的
   *    `PROGRESS_APP_COPY`（T-18c 建），PM-fix8 §四 定"整体上收本命名空间、宿主对象整体删除"；
   *    A-65 #182 坐实实体是 9 键（注释自陈"7 串"不实），逐键搬齐、无一与上面既有键同名或等价 ⇒ 零合并。
   *    取值纪律不变：一律 UI 规范的逐字中文，模板里的数字由宿主从接口结果填。 ── */

  /** §3.7.2 逐字：刷新按钮的 `sr-only` 文本（图标 20px，无可见文字）。 */
  refreshLabel: '刷新学习情况',
  /** §3.7.4「已登录、0 词 0 复习」行逐字：标题。 */
  emptyTitle: '还没有背过词',
  /** §3.7.4 同行逐字：副标题。 */
  emptyBody: '背完第一轮，这里就有内容了。',
  /** §3.7.4「局部：热力图失败但卡片成功」行逐字：副标题（主语就是"其他数字"，不能换）。 */
  heatDegradedBody: '其他数字不受影响。',
  /**
   * §3.7.1 行 D 的 `sr-only` 区标题 = **PM-fix8 件 1 定稿**（原样采纳 T-18c 自拟值）。
   * 同源纪律（PM-fix8 §一 / A-65 #181）：与下面 `heatmapAria` 模板前半句**逐字同串**，
   * 两份字面各自声明、**不做运行时拼接**（§3.7.6 逐字模板保持可直接 grep），
   * 一致性由不变式哨 `PROGRESS_COPY.heatmapAria(63) === PROGRESS_COPY.heatSectionTitle + '，最近一年，共打卡 63 天'`
   * 钉在 `packages/shared/test/contracts.spec.ts`。
   */
  heatSectionTitle: '每日背词热力图',
  /** §3.7.4 同行逐字：文字按钮（`EmptyState`/`Button` 的 link 档，不是主按钮）。 */
  heatReloadLabel: '重新加载热力图',
  /** §3.7.6 逐字模板：`每日背词热力图，最近一年，共打卡 63 天`；实参 = `profile.get` 的 `reviewDays`（服务端全量口径）。 */
  heatmapAria: (days: number): string => `每日背词热力图，最近一年，共打卡 ${days} 天`,
  /** §3.7.6 逐字模板的后半句，前半句用 `ARIA.curveContainer`（本文件下方已有）。 */
  curveAria: (from: number, to: number, last: number): string =>
    `从 ${from} 词增长到 ${to} 词，最近一天新增 ${last} 词`,
  /**
   * §3.7.4「热力图数据不足（有记录但不足一周）」行 = **PM-fix8 件 2 定稿**。
   * 实参**只能是**客户端 365 天窗口内有记录的天数（`ProgressScreen.tsx` 的 `activeDays`），
   * 不得改填服务端全量 `reviewDays`、不得写死数字、不得由 `SPARSE_DAYS` 派生"还差 N 天"
   * （反向哨件 2 第 1/2 条：串自带"最近一年"就是为了与同区 aria 的全量口径不再相撞）。
   */
  heatSparse: (days: number): string => `最近一年背了 ${days} 天，再多背几天就能看出一周的习惯`,
} as const;

/** §1.2.1 ②：色阶之外的**文本通道**（缺任一处即 §8 视觉验收不通过）——`少 → 多` + 数值区间。
 * 区间上下界由宿主从数据算，模板在此（`–` 与单位 `词` 沿用 `0–12 词` 口径，非 §6.4 钉死串）。 */
export const HEATMAP_LEGEND = {
  left: '少',
  arrow: '→',
  right: '多',
  range: (min: number, max: number): string => `${min}–${max} 词`,
} as const;

/* ═════════════════ §6.4-设置：我的 / 设置（§3.8） ═════════════════ */

/**
 * F 区两行标题的单点声明（A-86 #320 的 5A：用户本人 2026-09-22/23 拍的文案七问之一）：下面 `groups` 的第 2/4 格
 * 与 `rows.appearance` / `rows.about` 同引这两颗 const ⇒ 全仓 0 第二份『外观』/『关于』字面量，F 区不再按下标借位。
 */
const ROW_APPEARANCE = '外观';
const ROW_ABOUT = '关于';

export const SETTINGS_COPY = {
  groups: ['学习', '提醒', ROW_APPEARANCE, '账号', ROW_ABOUT, '帮助'],
  /** F 区「外观」「关于」两行的**专用键**（A-86 #320 的 5A）：值逐字 = `groups` 第 2/4 格，同一颗 const 单点声明。 */
  rows: { appearance: ROW_APPEARANCE, about: ROW_ABOUT },
  dailyGoal: {
    label: DAILY_GOAL_LABELS.label,
    value: (n: number): string => `${n} 词`,
    dirtyMark: '●',
    save: '保存',
    savedToast: (n: number): string => `每日目标已更新为 ${n} 词`,
    leaveConfirm: {
      title: '每日目标还没保存',
      body: '离开后这次的修改会丢失。',
      stay: '留在本页',
      discard: '放弃修改',
    },
    sliderAria: (n: number): string => `每日目标，当前 ${n} 词`,
    sliderValueText: (n: number): string => `${n} 词`,
    /* bug #2：滑杆上限可自己改 —— 这几串是那个小编辑器的全部对外文案。 */
    maxButton: (n: number): string => `上限 ${n} 词`,
    maxLabel: '每日目标上限',
    maxConfirm: '确定',
    maxCancel: '取消',
  },
  /* bug #5：账号头（头像上传 + 昵称编辑）。原先这两个动作没实现，屏里也没有任何串。 */
  account: {
    changeAvatar: '更换头像',
    nicknameLabel: '昵称',
    /** bug #12-2：昵称看起来像纯文本，用户不知道能点。加一个可见的「修改」提示。 */
    edit: '修改',
    save: '保存',
    cancel: '取消',
    avatarUpdated: '头像已更新',
    nicknameUpdated: '昵称已更新',
    pickImage: '请选择图片文件',
    decodeFail: '这张图读不出来，换一张试试',
  },
  /**
   * §3.8.1 分区 C「三张统计卡」（缺口 G-3 · T-19g-i 从 UI 规范逐字上收）。
   * 规范那一行原文（`交付记录 03-ui-spec.md:954`）：
   *   `词本 N 词` / `累计复习 N 天` / `连续 N 天`；数字可点进明细（R-19 ② 口径）
   * 三格各配 `label`（`StatCard` 的 `label` 槽）+ `unit`（其 `unit` 槽）+ `value(n)`
   * （**整格人话** = 把原文那一行的 N 换成数字，供 `valueText`/`aria-label` 与单行形态用）。
   * 同源纪律：`streak.value` 直接引本文件既有的 `formatStreak`（§6.1 那一份整串模板
   * `连续 ${n} 天`），**不再抄第二份** `连续 N 天`。
   * ⚠ 三个落点（`词本`→单词本 tab、`累计复习`→学习情况、`连续`→热力图滚到今天，见 §3.8.1:961）
   * **不进 shared** —— 那是 App 路由表的事，shared 不知道路由。
   */
  statCards: {
    words: { label: '词本', unit: '词', value: (n: number): string => `词本 ${n} 词` },
    reviewDays: { label: '累计复习', unit: '天', value: (n: number): string => `累计复习 ${n} 天` },
    streak: { label: '连续', unit: '天', value: formatStreak },
  },
  reminder: {
    label: '每日提醒',
    subtitle: '默认 20:30，一天一次',
    timeLabel: '提醒时间',
  },
  notificationOff: '通知未开启 · 点这里去系统设置',
  avatar: {
    change: '换头像',
    first: '取个头像',
    /** 大小上限的唯一人话（= 错误码 `AVATAR_TOO_LARGE`，不另写一份）。 */
    tooLarge: TM_ERRORS.AVATAR_TOO_LARGE.copy,
    maxBytes: AVATAR_MAX_BYTES,
  },
  signOut: {
    title: '要退出吗？',
    body: '手机上的词本会保留，下次登录还能接着用。',
    confirm: '退出登录',
    cancel: '取消',
  },
  /** 强制改密待办行（R-40④/⑤）。 */
  upgradeTodo: {
    entry: '需要先更新密码才能继续使用',
    cta: '去更新',
  },
  /**
   * §3.8.5「拉取失败」整页错误卡（缺口 G-2 · T-19g-i 从 UI 规范逐字上收）。
   * 规范那一行原文（`交付记录 03-ui-spec.md:1001`）：
   *   拉取失败 | 整页降级为一个错误卡（不显示半真半假的 0） |
   *   `账号信息没拿到` / `检查网络后再试一次，你的数据没有改动。` / 主按钮`再试一次`；
   *   次按钮`退出登录`仅在已登录态出现
   * 与 §3.7 那份 `PROGRESS_COPY.fail` **不是一个状态**（主语分别是"账号信息"与"学习情况"），
   * 故此处独立成键，不借用、不合并。
   * ⚠ `retry`（`再试一次`）与 `signOut`（`退出登录`）两串在本文件另有既有字面量
   * （`PROGRESS_COPY.fail.retry` / `VERBS.retryInline`；`SETTINGS_COPY.signOut.confirm` /
   * `AUTH_COPY.forceUpgrade.secondary` / `VERBS.signOut`）—— 同串多份是本文件收编前的现状，
   * 本轮按简报口径"逐字上收为 `SETTINGS_COPY.fetchFail.*`"照写，未改写既有键；
   * 是否收敛为单一声明点（照 `SWITCH_TO_REGISTER_LABEL` 的先例）请 TPM 裁定。
   */
  fetchFail: {
    title: '账号信息没拿到',
    body: '检查网络后再试一次，你的数据没有改动。',
    retry: '再试一次',
    signOut: '退出登录',
  },
  /**
   * §3.8.5「未登录（App，本地词本仍可用）」引导条（缺口 G-4 · T-19g-i 从 UI 规范逐字上收）。
   * 规范那一行原文（`交付记录 03-ui-spec.md:998`，文案列逐字）：
   *   `登录之后，换手机也不丢` / 副`词本、学习记录和提醒会跟着账号走。` /
   *   主按钮`登录`、次按钮`注册`、下方文字`先不用，继续本机使用`
   * 只上收**shared 缺的那三串**：同行的主按钮 `登录` 与次按钮 `注册` 已有既有定稿声明点
   * （本文件 `AUTH_COPY.submit.login` / `.register`），此处不抄第二份。
   * ⚠ 同表「未登录（Web `/profile`）」那一行写"同上三条"⇒ 这两区共用本三串。
   */
  guestGuide: {
    headline: '登录之后，换手机也不丢',
    subtitle: '词本、学习记录和提醒会跟着账号走。',
    continueAsGuest: '先不用，继续本机使用',
  },
  deleteAccount: '注销账号',
  about: {
    syncPromise: SYNC_PROMISE,
    dataOwnership: DATA_OWNERSHIP_NOTE,
    loginMethodNotice: LOGIN_METHOD_NOTICE,
  },
} as const;

/* ═════════════════ §6.4-登录：登录墙与登录弹窗（§3.9 / R-23） ═════════════════ */

/* `没有账号？注册` 的唯一声明点 = 本文件顶部的 `SWITCH_TO_REGISTER_LABEL`（为 `WORDBOOK_COPY`
 * 的引用而上移；`const` 无提升，声明须先于 `WORDBOOK_COPY` 求值）。此处不再重复声明。 */

export const AUTH_COPY = {
  wall: {
    title: '登录后开始背单词',
    subtitle: '手机上的词本会自动同步，换设备也能接着背',
    primary: '手机号登录',
    link: SWITCH_TO_REGISTER_LABEL,
  },
  /**
   * 登录态 → 注册态的次级文字链（§3.9.1:1027 登录态那一格，与 `wall.link` 同串、同一声明点）。
   * T-13 §4-1：Web 弹窗与 App 登录页共用，宿主不得自带字面串。
   */
  switchToRegister: SWITCH_TO_REGISTER_LABEL,
  /** 注册态 → 登录态的次级文字链（§3.9.1:1027 注册态那一格，逐字）。 */
  switchToSignIn: '已有账号？去登录',
  /**
   * 提示卡（§3.9.3 / §3.9.5）上的动作标签。落点由 `@tm/ui/auth/NoticeBar` 的 `action.label` 消费，
   * 提示卡正文走 `TM_ERRORS`（`PHONE_ALREADY_REGISTERED` / `NO_PASSWORD_ACCOUNT`），此处只补动作串。
   */
  cardActions: {
    /** §3.9.5:1080 `PHONE_ALREADY_REGISTERED` 行的「+ `去登录`（手机号保留）」。 */
    goSignIn: '去登录',
  },
  dialog: {
    login: '手机号登录',
    register: '注册新账号',
    activate: '设置密码，激活原账号',
  },
  submit: {
    login: '登录',
    register: '注册',
    activate: '设置密码并继续',
  },
  fieldLabels: {
    phone: '手机号',
    password: '密码',
    confirmPassword: '确认密码',
  },
  unregistered: '这个手机号还没注册，点这里注册',
  wrongCredential: '手机号或密码不正确',
  /** §3.9.7 · **PM-fix7 定稿**（12 字、0 数字、0 强度概念）· 消费点：`@tm/ui/auth/AuthFormShell` 登录态 `passwordError`（本地拦截：点过`登录`后密码为空/纯空格）。 */
  signInPasswordMissing: '这里还空着，填一下再点登录',
  /** §3.9.7 · **PM-fix7 定稿**（14 字、0 数字、无"上限/长度/字节"字样）· 消费点：`@tm/ui/auth/AuthFormShell` 登录态 `passwordError`（本地拦截：超 `PASSWORD_MAX_BYTES`），换掉原先借用的 `TM_ERRORS.WEAK_PASSWORD.copy`。 */
  signInPasswordTooLong: '这里太长了，删短一点再点登录',
  /**
   * §5.4-7 · **PM-fix8 件 3 定稿**（14 字、0 数字、0 字段名、0 强度话术；尾巴不绑 CTA 才能同覆盖
   * 注册 `设置密码并激活` / 普通改密 `保存新密码` / 强制改密 `更新密码并继续` 三副建密码按钮）。
   * 消费点：`AuthFormShell` 注册态/激活态与 `ChangePasswordForm`（含强制改密）的**本地**超字节上限拦截
   * （`PASSWORD_MAX_BYTES`，不发请求）；建密码面出现强度话术合法（R-40④ 只管验密码面），
   * 但"过长"不得再说成"至少 8 位"（A-64 #179 / F-23）。**不得**外溢到登录态（那是 `signInPassword*` 两条）。
   */
  setPasswordTooLong: '这里太长了，删短一点再试一次',
  noPasswordAccount: {
    cardTitle: '这个手机号还没设置过密码',
    /** 逐字复用 `errors.ts` 的 `NO_PASSWORD_ACCOUNT`，此处不另写一份。 */
    body: TM_ERRORS.NO_PASSWORD_ACCOUNT.copy,
    action: '设置密码激活',
  },
  /** 激活态副标题 = R-39⑥ 固定句式（`notice.ts` 单一源）。 */
  activateSubtitle: ACTIVATE_SUBTITLE,
  /** 强度条四档（§3.9.2）。 */
  strengthLevels: [
    '密码至少 8 位',
    '建议更长一点，或混用字母和数字',
    '可以了',
    '很稳',
  ],
  agreement: '我已阅读并同意《用户协议》《隐私政策》',
  /**
   * **登录态**底部小字（A-23-5 定稿：登录态不加勾选框，合规诉求由本句文案满足；勾选框只属注册态，
   * 即上面那份 `agreement`，二者不可混用）。同一条决定了「注册态可交互元素 = 5」的计数判据不被破坏。
   * ⚠ 字面取自 `04-adjudications.md` A-23-5 的引号原文；UI §6.4-登录表尚无该行，
   *   文档同步待 PM（与 A-11 同一处理方式：开发不改交付文档）。
   */
  agreementSignInNote: '登录即表示同意《用户协议》与《隐私政策》',
  forceUpgrade: {
    title: '为了账号安全，请设置新密码（至少 8 位）',
    /** §3.9.4:1063 副标题一句（规范标「逐字」；§6.4 总表未收录该行，见 T-03 修复轮 3 报告）。 */
    subtitle: '这个密码是策略更新前设的，换成 8 位以上的密码就能继续用，原来的词本和进度都不变。',
    submit: '更新密码并继续',
    secondary: '退出登录',
    fieldLabels: {
      current: '当前密码',
      next: '新密码',
      confirm: '确认新密码',
    },
    /** 页面级告知 = §6.6-4 第 3 条（`notice.ts` 单一源）。 */
    notice: NOTICE_FORCE_UPGRADE,
  },
  /**
   * 普通改密（§3.9.4:1070：`SecurityScreen` / `(user)/profile/security/page.tsx` **复用强制改密同一套表单组件**，
   * 差异只有"有返回、标题与按钮文字不同、无退出登录出口"这三处**文案**）。
   * 成功反馈两串 = §3.9.4:1066 / R-40③④：toast 一闪 + 常驻 6 秒信息条（时长见 `limits.ts` 的 `TOAST_LONG_MS`）。
   * R-40③ 的 `CREDENTIAL_EXPIRED`（"密码已修改，请重新登录"）是**旧 token 被打回时**的错误码文案，
   * 与本处的成功告知是两回事，同源在 `errors.ts`，此处不复制。
   */
  changePassword: {
    title: '修改密码',
    submit: '保存新密码',
    success: {
      toast: '密码已更新',
      reloginNotice: '其他设备需要重新登录',
    },
  },
  /**
   * I-09② 唯一声明点：**登录成功之后**给存量短密码用户的那一条告知（配套改密入口）。
   * 落点 = 两端宿主层的全站告知位（`apps/web/src/components/login-dialog.tsx` 与
   * `apps/app/src/screens/LoginScreen.tsx` 各一处 `host.toast`，判据 = 本次输入的密码
   * 短于 `limits.ts` 的 `PASSWORD_MIN`），⛔ 两端各自打字面量、⛔ 塞进 `AuthFormShell` 的字段错误槽。
   * 与 A-36-3 不冲突：那条裁的是**验密码面**（提交前的建密码话术与提交拦截），本串在登录已经成功
   * 之后才出现，不参与任何判定、不改提交口径（R-40④「短密码必须能提交」一字未动）。
   * 动作标签复用上面的 `changePassword.title`（与落地页标题同源），此处不新增第二颗串。
   */
  signInShortPasswordNotice: '这个密码比较短，建议改成至少 8 位',
  /** 旧 APK 兜底一句（行内；公告版见 `notice.ts` 第 4 条）。 */
  legacyApkHint: '请在网页端 tmword.xyz 修改密码后重新登录',
  legacyApkNotice: NOTICE_LEGACY_APP_PASSWORD,
  /** 验证码入口小字（§3.9.1 底部小字，§6.4-登录表验收字面）。 */
  smsEntryLabel: '使用验证码登录',
  /** 入口旁**常驻** 12px 说明（R-01⑥ 单一源）。 */
  smsHint: SMS_UNAVAILABLE_HINT,
  /** 通道未开通的即时反馈（= 错误码 `SMS_NOT_CONFIGURED`，不另写）。 */
  smsResult: TM_ERRORS.SMS_NOT_CONFIGURED.copy,
  registerMethodNotice: NOTICE_REGISTER_METHOD,
  accountBoundaryNotice: NOTICE_ACCOUNT_BOUNDARY,
  activationOutcomeNotice: activationOutcomeNotice(),
  /**
   * 帮助页口令问题的唯一答案（R-23④ / §6.4 登录表）。
   * 定稿文本由 A-11 裁决给出（`04-adjudications.md` A-11）：原 R-23④ 句式与凭据禁词表互斥，
   * 故改的是**定稿文案**而不是词表。整段以普通字面量书写，无分词/拼接/例外手段；
   * 语义保持"没设过密码的老账号点『注册』设密码即激活原账号、词本与进度全保留；已设过密码的本期内无法自助取回"。
   * PRD §6.6-4 与 UI §6 表格的同步由 TPM 另派 PM 处理（交付文档不由开发改）。
   */
  helpRecoveryAnswer:
    '这个手机号还没设置过密码？在登录弹窗点『注册』设一个密码即可激活原账号，词本和学习进度全部保留。已经设过密码的，本期只能等后续版本的找回方式。',
} as const;

/* ═════════════════ §6.4-同步：同步、离线与连接（§3.11） ═════════════════ */

export const SYNC_COPY = {
  synced: (hhmm: string): string => `已同步 · ${hhmm}`,
  pending: (n: number): string => `待同步 ${n}`,
  /** 离线且无队列：不显示任何文案。 */
  offlineQuiet: null,
  replayFail: '还没同步 · 联网后会自动补上',
  retry: '重试',
  /** 词本冲突（409 静默重放）：用户只看到同步成功。 */
  conflictIsSilent: true,
  streamDown: PLAIN_TERMS.connectionDown,
  reconnecting: '正在重新连接…',
  serverBusy: '服务器刚才没响应，再试一次',
} as const;

/* ═════════════════ §6.4-打卡：三处入口文案一致（R-13 ③④⑤） ═════════════════ */

export const CHECKIN_COPY = {
  notDone: {
    cta: '今天打卡',
    streak: (n: number): string => `连续 ${n} 天`,
    /**
     * UI §3.8.1 分区 D（`交付记录 03-ui-spec.md:955`）未打卡那一支的**整行**文案，逐字：
     *   一行：`今天已打卡 · 连续 12 天`（未打卡时`今天还没打卡`）+ 右侧按钮`去背单词`
     * 与同一格已打卡那一支同源同形（那是 `CHECKIN_COPY.done(n)`，不另写一份）。
     * 按钮那颗串在 `VERBS.goStudy`（`去背单词`），也不在本键里重复。
     */
    headline: '今天还没打卡',
  },
  done: (n: number): string => `今天已打卡 · 连续 ${n} 天`,
  /** 提交中：按钮内 spinner 常驻，文字保持 `今天打卡` 不变。 */
  pendingText: '今天打卡',
  fail: '打卡没成功 · 再试一次',
} as const;

/* ═════════════════ §6.4-通知：通知与桌面小组件（R-21 ③⑥） ═════════════════ */

export const NOTICE_CHANNEL_COPY = {
  reminderTitle: (n: number): string => `今天还有 ${n} 个词要背`,
  reminderBody: '点开就能开始，大概 3 分钟',
  widget: {
    dueToday: (n: number): string => `今日待背 ${n}`,
    progress: (done: number, goal: number): string => `已背 ${done} / ${goal}`,
    signedOut: '登录后可见今日词单',
    staleData: '数据是昨天的',
  },
  updateAvailable: '有新版本，点这里更新',
} as const;

/* ═════════════════ §6.5 通用动词与按钮词典（同一动作全站同名） ═════════════════ */

export const VERBS = {
  /** 提交查询：放大镜图标 + `sr-only`「查询」，首页禁止独立文字按钮。 */
  query: '查询',
  login: '手机号登录',
  retry: '重试',
  retryInline: '再试一次',
  remove: '移除',
  clear: '清空',
  /** §6.5 通用撤销动作名（背词撤销、词本左滑撤销、收藏撤销共用这一份）。 */
  undo: '撤销',
  signOut: '退出登录',
  deleteAccount: '注销账号',
  cancel: '取消',
  stay: '留在本页',
  speak: '发音',
  favorite: '收藏',
  favorited: '已收藏',
  /** 「加入单词本」仅在明确说明处用一次。 */
  addToOneWordbook: '加入单词本',
  goLookup: '去查词',
  goStudy: '去背单词',
} as const;

/* ═════════════════ §6.7 数字与时间规范 ═════════════════ */

/** 千分位不加；≥100 → `99+`（§3.10.2）。 */
export function formatCount(n: number): string {
  return n >= 100 ? '99+' : String(n);
}

/** 日期：`今天 09:20` / `昨天` / `3 月 7 日` / 跨年才带年份。 */
export function formatRelativeDay(dayLabel: '今天' | '昨天' | '明天', hhmm: string): string {
  return `${dayLabel} ${hhmm}`;
}
export function formatMonthDay(month: number, day: number): string {
  return `${month} 月 ${day} 日`;
}
export function formatYearMonthDay(year: number, month: number, day: number): string {
  return `${year} 年 ${month} 月 ${day} 日`;
}

/**
 * §3.3 相对时间五档的**文案桶**（`刚刚 / N 分钟前 / N 小时前 / 昨天 / M 月 D 日`）。
 * 阈值判定与取数**不在这里**：组件被禁止读时钟（`patterns` 判据①），所以"now 从哪来、
 * 何时切下一档"由宿主或 `@tm/ui/patterns/format.ts` 决定，本处只锁模板 = 验收值。
 * 第 5 档复用 `formatMonthDay`（§6.7 的空格口径是全站唯一写法，§3.3 表内的 `M月D日` 是简写）。
 */
export const RELATIVE_TIME_COPY = {
  justNow: '刚刚',
  minutesAgo: (n: number): string => `${n} 分钟前`,
  hoursAgo: (n: number): string => `${n} 小时前`,
  yesterday: '昨天',
  monthDay: formatMonthDay,
} as const;

/* ═════════════════ §6.8 屏幕阅读器与图标标签定稿 ═════════════════ */

export const ARIA = {
  skipLink: '跳到主要内容',
  /** §3.1.6：搜索框的 `sr-only` 字段名（禁止只靠 placeholder 表达字段含义）。 */
  searchField: '查单词',
  studyTab: (due: number): string => (due > 0 ? `背单词，今天还有 ${due} 个要背` : '背单词'),
  moreDrawer: '更多',
  /**
   * 顶栏与底部 tab 容器的 `aria-label`（§3.1.5:572 / §3.10.4:1177 / §6.8:1718；
   * §3.10.4 的 `≥1024px 时 nav[aria-label="主导航"] 数量 = 0` 判据直接吃这一串）。
   * A-30-7 追加件：此前由 `header.tsx:138` 与 `mobile-nav.tsx:140` **各注入一份**同一字面量（宿主注入仍合法）。
   */
  primaryNav: '主导航',
  /**
   * 顶栏主题切换按钮的 `sr-only` 名（A-30-7 清单逐字）。
   * ⚠ 契约偏差待 PM 定稿：A-30-7 写的是间隔号 `切换深色·浅色`，而现网宿主注入的是斜杠
   *   `切换深色/浅色`（`header.tsx:139`）。本轮按裁决清单逐字落，**不改各页面**，
   *   两者取哪一个由 TPM/PM 拍板后在批次4 一次性收敛（`THEME_MODE_LABELS` 只有三档模式名，无此标签）。
   */
  themeToggle: '切换深色·浅色',
  /**
   * 顶栏「我的」入口链接的 `aria-label`（A-30-7 清单逐字）。
   * ⚠ 同值第三处：`NAV_ITEMS[4]` 的 `tab` 与 `title` 已是 `我的`（§6.1 命名口径），本条是**可访问名**用途，
   *   语义不同（一个是可见标签、一个是链接的可访问名），故不合并；PM 定稿 §6.8 后由 T-03 收敛为单一导出。
   */
  profileLink: '我的',
  back: '返回上一级',
  speak: (word: string): string => `朗读 ${word}`,
  /** §3.2 无障碍：喇叭播放中替换 `speak` 的整串。 */
  speaking: '正在播放',
  /** §3.2 无障碍：结果条词链 = `查看 {word} 的完整释义`；方向链两档动态。 */
  fullMeaning: (word: string): string => `查看 ${word} 的完整释义`,
  directionEn2Zh: '改用英译中查询',
  directionZh2En: '改用中译英查询',
  favorite: (word: string): string => `收藏 ${word}`,
  unfavorite: (word: string): string => `取消收藏 ${word}`,
  /** §3.6.7：词本行链与删除按钮的可访问名。 */
  wordbookRow: (word: string): string => `查看 ${word} 的详情`,
  removeFromWordbook: (word: string): string => `从单词本删除 ${word}`,
  /** §3.7.3：热力图格阵的键盘出口（同数据纯文本 `<table>`）。 */
  browseHeatmap: '浏览热力图',
  /** 评分四档：`{良好}，下次 4 天后`。 */
  rating: (rating: 1 | 2 | 3 | 4, interval: string): string =>
    `${RATING_LABELS[rating]}，下次 ${interval}`,
  undoRating: '撤销上一条评分',
  todayProgress: (done: number, goal: number): string => `今日进度，已完成 ${done} / ${goal}`,
  curveContainer: PROGRESS_COPY.curve.ariaLabel,
  /**
   * 密码框右侧 `Eye`/`EyeOff` 切换按钮的可访问名（§3.9.1:1035 逐字，配 `aria-pressed`）。
   * 为什么进 `ARIA` 而不是留在组件里：这颗眼睛由 `AuthFormShell` 导出的 `PasswordField` 渲染，
   * 被 `AuthFormShell` / `ChangePasswordForm` / `ForcePasswordUpgradeForm` 三件复用、Web 与 App 两端挂载，
   * 而 `packages/ui` 判据④ 要求 src/auth 去注释后**0 处中文字面量** → 串只能在 shared。
   * ⚠ §6.8 总表未收录这两条（规范里它们只出现在 §3.9.1 的属性示例），建议 PM 一并补进 §6.8。
   */
  showPassword: '显示密码',
  hidePassword: '隐藏密码',
  toastRole: 'status',
  errorRole: 'alert',
  skeletonAriaHidden: true,
} as const;
