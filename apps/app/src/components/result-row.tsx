/**
 * 查词结果的**视图投影 + 精简结果行渲染**（T-17；UI §3.1.4 修②、§3.2；R-07③、R-09④、R-10②⑤、R-14④）。
 *
 * 为什么投影和渲染放在同一个文件（而不是塞进 `LookupScreen`）：
 *  - 词详情页（`WordDetailScreen`）与查词页共用的串只有这几条 —— 方向判定、首义拼装、
 *    最近查询条目映射、`#/word/{word}?from=` 入口。写两份就会在批次4 出口分叉。
 *  - 本文件**零请求**：输入永远是 `@tm/shared` 的 `LookupResponse`（由 `data/queries/lookup.ts` 取来），
 *    输出是视图形状（§5.2「`data/` 是唯一发请求的地方」）。
 *
 * Chrome84 红线（架构 §5.1 / `vite.config.ts` 的 `tm-app:dist-guard`）：不用
 * `Array.prototype.at` / `Object.hasOwn` / `structuredClone` / `requestIdleCallback`，
 * 遍历一律 `for…of` + 索引，键表用普通对象字面量。
 */

import * as React from 'react';
import {
  ARIA,
  LOOKUP_COPY,
  RECENT_GLOSS_MAX_LENGTH,
  RELATIVE_TIME_COPY,
  STUDY_COPY,
  WORD_MAX_LENGTH,
  WORDBOOK_COPY,
  detectLanguage,
  formatYearMonthDay,
  type LookupDirectionValue,
  type LookupEn2ZhFallback,
  type LookupEn2ZhSuccess,
  type LookupResponse,
  type LookupZh2EnResponse,
  type RecentSearchItemDto,
} from '@tm/shared';
import { LookupResultBar, type UiHost } from '@tm/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWord,
  removeWord,
  wordbookKeys,
  wordbookQueryOptions,
} from '../data/queries/wordbook.js';
import { WORDBOOK_APP_COPY } from './wordbook-toolbar.js';
import { hasCredential } from '../data/rest-fetcher.js';
// FU24②：`/login` 的字面量单点在 `lib/auth-store.ts`（`LOGIN_ROUTE`），本文件不再自持第二份。
import { LOGIN_ROUTE } from '../lib/auth-store.js';
import { navigate } from '../router.js';

/* ═════════════════ 入口与方向（R-07② / R-19②） ═════════════════ */

/** 词详情页的四来源（UI §3.4 路由行；决定「按来源返回」，R-09③）。 */
export const DETAIL_SOURCES = ['home', 'study', 'wordbook', 'chat'] as const;
export type DetailSource = (typeof DETAIL_SOURCES)[number];

const isDetailSource = (value: string | undefined): value is DetailSource =>
  !!value && (DETAIL_SOURCES as readonly string[]).indexOf(value) >= 0;

/** 读 `?from=`（缺省 `home`：小组件直达与外部分享链都从查词页进来）。 */
export function detailSourceOf(query: Record<string, string> | undefined): DetailSource {
  const raw = query ? query.from : undefined;
  return isDetailSource(raw) ? raw : 'home';
}

/** App 的详情入口 = hash 路径（`navigate()` 会补 `#`，`parseHash` 再拆回 `path` + `query`）。 */
export function detailHref(word: string, source: DetailSource = 'home'): string {
  return `/word/${encodeURIComponent(word.slice(0, WORD_MAX_LENGTH))}?from=${source}`;
}

/**
 * 未手动改方向时按输入内容判定（R-07②「不需要先选方向」）：
 * 纯中文 → `zh2en`、纯英文 → `en2zh`，只有中英混输（`mixed`）才留给服务端判方向。
 * 语言判定取 `@tm/shared` 的 `detectLanguage`（§8.2-17：两端不得再定义第二份 CJK 正则）。
 *
 * 这里**刻意不把英文也留成 `auto`**，是 R-10③「点最近条目复用缓存、0 次多余请求」的键对齐点：
 * 查询键是 `lookupKeys.one(word, direction)`，而最近条目的 `direction` 存的是**实际生效方向**
 * （`toLookupView` 里英译中恒为 `en2zh`）。若请求侧发 `auto`，点条目时按条目的 `en2zh` 组装键
 * 就必然 miss → 再发一次同样的请求。两侧都先过 `resolveDirection` ⇒ 键与条目永远一致。
 */
export function resolveDirection(
  query: string,
  override: LookupDirectionValue = 'auto',
): LookupDirectionValue {
  if (override !== 'auto') return override;
  const lang = detectLanguage(query);
  if (lang === 'zh') return 'zh2en';
  if (lang === 'en') return 'en2zh';
  return 'auto';
}

/* ═════════════════ 视图投影（纯函数，可单测） ═════════════════ */

export interface LookupRowView {
  word: string;
  phonetic: string;
  gloss: string;
}

export interface LookupView {
  /** `en` = 单条精简结果条；`zh` = 中译英条目列表；`empty` = 没查到；`idle` = 未查询。 */
  kind: 'idle' | 'en' | 'zh' | 'empty';
  word: string;
  phonetic: string;
  /** 英译中：词性分组首义拼成的一行（§3.2 行2「≤2 行」由 `LookupResultBar` 自己截断）。 */
  gloss: string;
  rows: LookupRowView[];
  /** 有词头无释义（R-09④：禁空白卡）。 */
  partial: boolean;
  /** 服务端实际使用的方向（方向文字链据此给下一档）。 */
  applied: LookupDirectionValue;
}

/** 中译英在查词页只出前 N 行精简条目（§3.1.1 已查询态 ≤8 个可交互元素）。 */
export const ZH_ROWS_MAX = 3;

export const IDLE_VIEW: LookupView = {
  kind: 'idle',
  word: '',
  phonetic: '',
  gloss: '',
  rows: [],
  partial: false,
  applied: 'auto',
};

/**
 * 旧四元联合的判别（两个英译中分支都**没有** `sourceLang`，故只能按字段窄化）。
 * `shared` 只导出四个分支的类型、没有"英译中两分支的并集"类型 ⇒ 本地声明一个（不改 `packages/**`）。
 */
type EnBranch = LookupEn2ZhSuccess | LookupEn2ZhFallback;
const isZh2En = (r: LookupResponse): r is LookupZh2EnResponse =>
  'sourceLang' in r && r.sourceLang === 'zh';
const isEnBranch = (r: LookupResponse): r is EnBranch => 'word' in r;
const isNotFound = (r: EnBranch): boolean => 'notFound' in r && r.notFound === true;

/** `.tsx` 里泛型箭头函数要带约束位（`<T extends unknown>`），否则被当成 JSX 标签。 */
const firstOf = <T extends unknown>(list: readonly T[] | undefined): T | undefined =>
  list && list.length > 0 ? list[0] : undefined;

/** `[pos] 首义 · [pos] 首义`（§3.2 行2 的唯一拼法）。 */
export function firstMeaningOf(groups: ReadonlyArray<{ pos: string; meanings: string[] }>): string {
  const parts: string[] = [];
  for (const group of groups) {
    const head = (firstOf(group.meanings) ?? '').trim();
    if (!head) continue;
    const pos = group.pos.trim();
    parts.push(pos ? `[${pos}] ${head}` : head);
  }
  return parts.join(' · ');
}

/** 服务端回落到在线 API 时 `groups` 可能为空，只剩 `translation` 首行。 */
const translationHead = (text: string | undefined): string => {
  if (!text) return '';
  const lines = text.split('\n');
  for (const line of lines) {
    const value = line.trim();
    if (value) return value;
  }
  return '';
};

/**
 * `LookupResponse` → 精简结果视图。
 * `mixed`（中英混输，服务端只回 `error`）按「没找到」处理：界面不得出现内部名词（§6.2）。
 */
export function toLookupView(
  result: LookupResponse | null | undefined,
  applied: LookupDirectionValue,
): LookupView {
  if (!result) return { ...IDLE_VIEW, applied };

  if (isZh2En(result)) {
    const rows: LookupRowView[] = [];
    for (const entry of result.results.slice(0, ZH_ROWS_MAX)) {
      const definition = (entry.definition ?? '').trim();
      const pos = (entry.pos ?? '').trim();
      rows.push({
        word: entry.word,
        phonetic: entry.phonetic ?? '',
        gloss: definition ? (pos ? `[${pos}] ${definition}` : definition) : LOOKUP_COPY.noGloss,
      });
    }
    return {
      kind: rows.length > 0 ? 'zh' : 'empty',
      word: result.query,
      phonetic: '',
      gloss: '',
      rows,
      partial: false,
      applied: 'zh2en',
    };
  }

  if (!isEnBranch(result)) return { ...IDLE_VIEW, applied: 'auto', kind: 'empty' };

  const gloss = firstMeaningOf(result.groups ?? []);
  const notFound = isNotFound(result);
  return {
    kind: notFound ? 'empty' : 'en',
    word: result.word ?? '',
    phonetic: result.phonetic ?? '',
    gloss,
    rows: [],
    partial: !notFound && gloss === '' && (result.translation ?? '') === '',
    applied: 'en2zh',
  };
}

/** 结果条首义 → 最近查询面板的 `gloss`（R-10②：与结果条同源，≤`RECENT_GLOSS_MAX_LENGTH`）。 */
export function resultGloss(result: LookupResponse | null | undefined): string {
  if (!result || !isEnBranch(result)) return '';
  const raw = firstMeaningOf(result.groups ?? []) || translationHead(result.translation);
  return raw.slice(0, RECENT_GLOSS_MAX_LENGTH);
}

/**
 * 查到才记一条（R-10②）：`word` 用**服务端回显的词头**（大小写与用户输入可能不同），
 * `direction` 用实际生效方向（去重键 `word|direction` 在 `useRecentSearches` 里，R-10⑤）。
 */
export function toRecentItem(
  result: LookupResponse | null | undefined,
  applied: LookupDirectionValue,
): Omit<RecentSearchItemDto, 'at'> | null {
  const view = toLookupView(result, applied);
  if (view.kind === 'empty' || view.word === '') return null;
  const firstRow = firstOf(view.rows);
  return {
    word: view.word.slice(0, WORD_MAX_LENGTH),
    direction: view.applied,
    gloss:
      view.kind === 'zh'
        ? (firstRow ? firstRow.gloss : '').slice(0, RECENT_GLOSS_MAX_LENGTH)
        : resultGloss(result).slice(0, RECENT_GLOSS_MAX_LENGTH),
  };
}

/* ═════════════════ 相对时间（UI §3.3：刚刚 / N 分钟前 / N 小时前 / 昨天 / M 月 D 日） ═════════════════ */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const startOfDay = (time: number): number => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** `now` 由宿主传（组件与投影层不读时钟，档位切换归调用方，见 `RELATIVE_TIME_COPY` 的注释）。 */
export function recentTimeLabel(at: number, now: number = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const delta = Math.max(0, now - at);
  if (delta < MINUTE_MS) return RELATIVE_TIME_COPY.justNow;
  if (delta < HOUR_MS) return RELATIVE_TIME_COPY.minutesAgo(Math.floor(delta / MINUTE_MS));
  if (delta < DAY_MS) return RELATIVE_TIME_COPY.hoursAgo(Math.floor(delta / HOUR_MS));
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 1) return RELATIVE_TIME_COPY.yesterday;
  const past = new Date(at);
  const today = new Date(now);
  return past.getFullYear() === today.getFullYear()
    ? RELATIVE_TIME_COPY.monthDay(past.getMonth() + 1, past.getDate())
    : formatYearMonthDay(past.getFullYear(), past.getMonth() + 1, past.getDate());
}

/* ═════════════════ `file://` 下的原生链接兜底（判据②「查看详情」进详情） ═════════════════ */

/**
 * `@tm/ui` 的「查看详情」/`ReviewCta` 渲染的是真 `<a href="/word/…">`，其 `onClick` 里做
 * `host.navigate(href)` 但**没有 `preventDefault()`**（`packages/ui/src/patterns/LookupResultBar.tsx`）。
 * Web 端有 History 无所谓，App 的 `file:///android_asset/index.html` 会把根相对路径解析成
 * `file:///word/…` → 整页跳走。`packages/**` 是禁区（§10.2 T-05 行：签名冻结），
 * 故宿主侧在结果区挂一个捕获层：只 `preventDefault()`，**不** `stopPropagation()`，
 * 让组件自己的 `onClick` 继续跑 `host.navigate`。已登记进报告「契约偏差」。
 */
export function preventRawHrefNavigation(event: React.SyntheticEvent): void {
  const target = event.target as HTMLElement | null;
  const anchor = target && 'closest' in target ? target.closest('a[href]') : null;
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('/')) event.preventDefault();
}

/* ═════════════════ 渲染件 ═════════════════ */

/** 行内「换个方向查」文字链（§3.1.2 E 行3；结果条自带方向链时不用这件）。 */
export function DirectionLink({
  applied,
  onSwitchDirection,
  testid = 'lookup-direction-link',
  className = 'mt-2 block w-full text-center text-xs text-ink-muted underline decoration-transparent underline-offset-2 hover:text-ink hover:decoration-current focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
}: {
  applied: LookupDirectionValue;
  onSwitchDirection: () => void;
  testid?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSwitchDirection}
      aria-label={applied === 'zh2en' ? ARIA.directionEn2Zh : ARIA.directionZh2En}
      data-testid={testid}
      className={className}
    >
      {LOOKUP_COPY.directionSwitch}
    </button>
  );
}

export interface ZhResultListProps {
  rows: LookupRowView[];
  /** 点行 = 进详情页；缺省交给 `LookupResultBar` 的 `host.navigate(detailHref)`。 */
  onOpen?: (href: string) => void;
  /** 返回来源（`?from=`），详情页据此按来源返回（R-09③）。 */
  source?: DetailSource;
  /**
   * 行内喇叭（**第 2 轮补**：UI §3.2 末段写死"中→英每条 = 词 + 首义 + 喇叭"，
   * `LookupResultBar` 的 `onSpeak` 缺省即不渲染喇叭 ⇒ 第 1 轮这件组件漏了这一个 prop，
   * 中译英结果页 0 个喇叭 = R-14④ 不成立。改动为**纯新增可选 prop**，逐字登记在
   * `.delivery/04-dev-report-T-17.md` §1）。
   */
  onSpeak?: (word: string) => void;
  /** 发音不可用（R-14⑥）：喇叭保持可点，点击给行内提示。 */
  ttsUnavailable?: boolean;
  onSpeakUnavailable?: () => void;
  testid?: string;
}

/**
 * 中→英结果 = 条目列表（§3.2 末段：每条 词 + 首义 + 喇叭，行高 ≥52px，`layout='row'`）。
 * 行内不再出第二颗「查看详情」以外的动作（§3.1.1 聚合规则②）。
 */
export function ZhResultList({
  rows,
  onOpen,
  source = 'home',
  onSpeak,
  ttsUnavailable = false,
  onSpeakUnavailable,
  testid = 'lookup-result-rows',
}: ZhResultListProps): React.JSX.Element {
  return (
    <ul
      className="divide-y divide-hair overflow-hidden rounded-xl border border-hair bg-surface"
      data-testid={testid}
    >
      {rows.map((row) => (
        <li key={`${row.word}|${row.gloss}`}>
          <LookupResultBar
            layout="row"
            word={row.word}
            phonetic={row.phonetic}
            gloss={row.gloss}
            detailHref={detailHref(row.word, source)}
            detailAriaLabel={ARIA.fullMeaning(row.word)}
            onOpen={onOpen}
            onSpeak={onSpeak}
            speakLabel={(word: string): string => ARIA.speak(word)}
            speakingLabel={ARIA.speaking}
            ttsUnavailable={ttsUnavailable}
            ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
            onSpeakUnavailable={onSpeakUnavailable}
            ariaLive="off"
            testid="lookup-result-row"
          />
        </li>
      ))}
    </ul>
  );
}

/* ═════════════════ 收藏（R-16①②：星标才入库；未登录点星标 → 走登录并保留待收藏词） ═════════════════ */

/** 登录后要补做的那颗星（`?intent=favorite&word=` 的同一条信息，登录页跳转丢失时兜底）。 */
export const PENDING_FAVORITE_KEY = 'tm:pending-favorite';

/** 未登录点星标的去向：把词带进登录页（R-16②「不报错、保留待收藏词」）。落点字面量单点 = `LOGIN_ROUTE`（FU24②）。 */
export function loginHrefForFavorite(word: string): string {
  return `${LOGIN_ROUTE}?intent=favorite&word=${encodeURIComponent(word.slice(0, WORD_MAX_LENGTH))}`;
}

interface KvLike {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** 记一笔「登录后要收藏的词」；`@tm/ui` 的 `host.kv` 与 App 的 Bridge 落盘同源。 */
export function rememberPendingFavorite(kv: KvLike, word: string): void {
  try {
    kv.set(PENDING_FAVORITE_KEY, word.slice(0, WORD_MAX_LENGTH));
  } catch {
    /* kv 被 WebView 关掉（§5.6）时静默：URL 上仍带着 `?word=` */
  }
}

export function takePendingFavorite(kv: KvLike): string {
  try {
    const raw = kv.get(PENDING_FAVORITE_KEY);
    if (!raw) return '';
    kv.set(PENDING_FAVORITE_KEY, '');
    return raw;
  } catch {
    return '';
  }
}

export interface WordbookFavorite {
  word: string;
  signedIn: boolean;
  /** 词本里已有（服务端列表 ∪ 本地乐观标记）。 */
  inWordbook: boolean;
  /** 点星标（查词页/详情页共用）：未登录走登录，已收藏给二次确认。 */
  toggle: () => void;
  /** 取消收藏的确认框状态（`ConfirmSheet` 由各屏渲染）。 */
  confirmOpen: boolean;
  closeConfirm: () => void;
  /** 确认后真正移除（离线优先写队列；没落账就只给失败反馈，星标不落）。 */
  unfavorite: () => void;
}

/**
 * 一颗星标的全部语义，两个屏共用（`LookupScreen` 结果条、`WordDetailScreen` 操作区）。
 * 写路径 = `data/queries/wordbook.ts` 的 `addWord`/`removeWord`（离线优先入队，R-20①⑤），
 * 本 hook 只做乐观标记 + 让服务端列表失效。
 *
 * 但**只在真落账之后**才做乐观标记（A-46 #98）：`offline-queue.saveState` 现在写盘失败即抛
 * `QueueWriteError`，两处写点都 `try/catch` 住 → 失败走同一条可读反馈（词本页 §3.6.5 末行
 * 那条定稿串，形态照 `WordbookScreen.removeRow`），既不抛未捕获异常，也不发"已放进单词本 /
 * 已移除"这种兑现不了的承诺（§6.6 人话原则）。
 */
export function useWordbookFavorite(
  word: string,
  host: UiHost,
  onLogin?: (word: string) => void,
): WordbookFavorite {
  const queryClient = useQueryClient();
  const [flags, setFlags] = React.useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const key = word.trim().toLowerCase();
  const signedIn = hasCredential();

  const list = useQuery({
    ...wordbookQueryOptions(),
    enabled: signedIn && key.length > 0,
    retry: 0,
  });

  const serverHas = React.useMemo(() => {
    if (!signedIn || key === '') return false;
    const entries = list.data ?? [];
    for (const entry of entries) {
      if (entry.word.toLowerCase() === key) return true;
    }
    return false;
  }, [key, list.data, signedIn]);

  const inWordbook = key === '' ? false : Boolean(key in flags ? flags[key] : serverHas);

  const mark = React.useCallback(
    (value: boolean): void => {
      if (key === '') return;
      setFlags((prev) => ({ ...prev, [key]: value }));
    },
    [key],
  );

  const drop = React.useCallback(
    (target: string): boolean => {
      try {
        removeWord(target);
      } catch {
        // A-46 #98 / §3.6.5 末行：入队没落账（`offline-queue.saveState` 抛 `QueueWriteError`）时
        // **不谎报移除** —— 星标保持原状、不发成功承诺，反馈复用词本页那一条定稿串（形态照
        // `WordbookScreen.removeRow`，禁"云端/本地"字样，§6.6）。
        host.toast(WORDBOOK_APP_COPY.deleteNotQueued, { tone: 'error', durationMs: 6000 });
        return false;
      }
      queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
      return true;
    },
    [host, queryClient],
  );

  const unfavorite = React.useCallback((): void => {
    setConfirmOpen(false);
    if (!word) return;
    // 写失败 ⇒ 不再 `mark(false)`：星标留在"已收藏"，与服务端事实一致（R-16①）。
    if (!drop(word)) return;
    mark(false);
  }, [drop, mark, word]);

  const toggle = React.useCallback((): void => {
    if (!word) return;
    if (!hasCredential()) {
      rememberPendingFavorite(host.kv, word);
      if (onLogin) onLogin(word);
      else navigate(loginHrefForFavorite(word));
      return;
    }
    if (inWordbook) {
      setConfirmOpen(true);
      return;
    }
    try {
      addWord(word);
    } catch {
      // 同上：这条没进队列，于是星标不落、`已放进单词本` 不发（A-46 #98）。
      // T-03r2b / PM-fix6：加星侧改引 `WORDBOOK_COPY.favoriteNotSaved` —— 收藏**没有自动补传**，
      // 不能再吃删除侧那条"联网后会自动删掉"（对收藏是反话）。
      host.toast(WORDBOOK_COPY.favoriteNotSaved, { tone: 'error', durationMs: 6000 });
      return;
    }
    mark(true);
    queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
    host.toast(LOOKUP_COPY.favoriteToast.body, {
      tone: 'success',
      action: {
        label: LOOKUP_COPY.favoriteToast.action,
        onClick: (): void => {
          // 撤销这次收藏：同样只在真落账后才把星标落回未收藏。
          if (drop(word)) mark(false);
        },
      },
    });
  }, [drop, host, inWordbook, mark, onLogin, queryClient, word]);

  return {
    word,
    signedIn,
    inWordbook,
    toggle,
    confirmOpen,
    closeConfirm: React.useCallback(() => setConfirmOpen(false), []),
    unfavorite,
  };
}

