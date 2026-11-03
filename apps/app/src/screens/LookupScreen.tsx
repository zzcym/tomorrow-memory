/**
 * App 查词页（`#/`，tab1）—— T-17。UI §3.1.4 修①②③ / §3.2 / §3.3；PRD R-07①②③④、R-09④、R-10 全条、
 * R-14④（喇叭走 `host.speak`）、R-16①②（星标才入库、未登录走登录）、R-19①④、R-20③（小组件直达聚焦）。
 *
 * 三件事是本页存在的理由（其余一律交给 `@tm/ui/patterns`，禁覆写组件：§10.2 T-18 行 + patterns/README 末段）：
 *  1. **修① 搜索框不跳位**（判据①）：slogan / 搜索框 / 结果区是**三段固定顺序**，结果只在下面淡入。
 *     现网 `mobile-memory` 的 `top:29%→0` 跳位来自"查询后把搜索区往上重排"，本页没有任何重排分支；
 *     底部留白用 §2.4 的 `pb-safe-bottom`（挂在 `shell/TabBarShell` 的 `<main>` 上），
 *     故 `padding-bottom:130px` 死占位在这里既没写、也不允许写（`test/lookup-screen.spec.tsx` 有源码级哨兵）。
 *  2. **修② 结果收为精简条**（判据②）：英译中 = 一颗 `LookupResultBar`（词 + 音标 + 喇叭 + 首义 +
 *     查看详情/星标），中译英 = `ZhResultList`（≤`ZH_ROWS_MAX` 条行式）。完整释义/例句/词形/AI 记法
 *     **一律不在本页**，走「查看详情」进 `WordDetailScreen`。
 *  3. **修③ 最近查询面板恢复**（判据③）：`SearchBar` 的 `children` 插槽挂 `RecentSearchPanel`，
 *     聚焦才 `open=true`（未展开时组件整棵子树不渲染 = 不占布局，§3.3），数据来自
 *     `useRecentSearches()`（`host.kv`，未登录完全可用 R-10⑦），点条目**复用缓存不再发请求**（R-10③）。
 *
 * 分层：本页**零 fetch**（§5.2「`data/` 是唯一发请求处」）——查询只经 `data/queries/lookup.ts`，
 * 收藏只经 `data/queries/wordbook.ts`（离线优先入队，R-20①⑤），两者都由 `components/result-row.tsx`
 * 已封装的投影函数与 hook 消费。
 *
 * Chrome84 红线（§5.1 / `vite.config.ts` 的 `tm-app:dist-guard`）：本文件不用
 * `structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`。
 */

import * as React from 'react';
import {
  ARIA,
  LOOKUP_COPY,
  SEARCH_PLACEHOLDER,
  STUDY_COPY,
  VERBS,
  WORD_MAX_LENGTH,
  flipLookupDirection,
  parseRecentSearchList,
  type LookupDirectionValue,
  type RecentSearchItemDto,
} from '@tm/shared';
import {
  ConfirmSheet,
  EmptyState,
  LookupResultBar,
  RecentSearchPanel,
  RECENT_SEARCHES_KEY,
  ReviewCta,
  SearchBar,
  SkeletonBlock,
  useHost,
  useRecentSearches,
  type SearchBarHandle,
} from '@tm/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lookupKeys, lookupQueryOptions } from '../data/queries/lookup.js';
import { addWord, wordbookKeys, wordbookQueryOptions } from '../data/queries/wordbook.js';
import { hasCredential } from '../data/rest-fetcher.js';
import { takeSearchFocusRequest } from '../native/launch-focus.js';
import { useSyncStatus } from '../shell/TabBarShell.js';
import {
  DirectionLink,
  IDLE_VIEW,
  ZhResultList,
  detailHref,
  preventRawHrefNavigation,
  recentTimeLabel,
  resolveDirection,
  toLookupView,
  toRecentItem,
  useWordbookFavorite,
  type DetailSource,
  type LookupView,
} from '../components/result-row.js';

const PANEL_ID = 'tm-lookup-recent-panel';
/** 焦点从输入框移到面板条目时的宽限期（与 Web `home/search-section.tsx` 同口径，避免"点不到"）。 */
const BLUR_GRACE_MS = 180;
/** §3.1.5：查询中首帧 <300ms **不显示任何东西**（防闪），≥300ms 才出条状骨架。 */
const SKELETON_DELAY_MS = 300;
/** 本页进详情的来源（§3.4 路由行 `from=home`；其余三档由背词页/词本页/对话页各自给）。 */
const SOURCE: DetailSource = 'home';

/* ═════════════════ 提交状态机（纯函数，可单测） ═════════════════ */

/** 一次提交要同时改的三样东西（放在一起，避免"改了 `queried` 忘了改方向"的半个状态）。 */
export interface PendingQuery {
  text: string;
  /** 本次实际生效方向（写查询键与最近条目都用它）。 */
  applied: LookupDirectionValue;
  /** 用户手动选过方向时的固定值；`auto` = 按输入内容判定。 */
  override: LookupDirectionValue;
}

/**
 * 提交时把方向**钉死**，而不是每次渲染重算：
 *  - 「换个查询方向」是显式覆盖，若不钉住，同一串文本会被 `resolveDirection` 算回同一档 ⇒ 点了没反应；
 *  - 换了文本就回到自动判定（R-07②「不需要先选方向」，界面上也没有方向按钮）。
 */
export function planSubmit(
  text: string,
  current: PendingQuery | null,
  forcedOverride?: LookupDirectionValue,
): PendingQuery {
  const value = text.trim().slice(0, WORD_MAX_LENGTH);
  if (value === '') return { text: '', applied: 'auto', override: 'auto' };
  const keepOverride = current !== null && current.text === value;
  const override =
    forcedOverride !== undefined ? forcedOverride : keepOverride ? current.override : 'auto';
  return { text: value, applied: resolveDirection(value, override), override };
}

/* ═════════════════ 页面 ═════════════════ */

export function LookupScreen(): React.JSX.Element {
  const host = useHost();
  const queryClient = useQueryClient();
  const recent = useRecentSearches();
  const pushRecent = recent.push;
  const barRef = React.useRef<SearchBarHandle>(null);
  const graceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushedRef = React.useRef('');

  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState<PendingQuery | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [slow, setSlow] = React.useState(false);

  const queried = pending === null ? '' : pending.text;
  const direction: LookupDirectionValue = pending === null ? 'auto' : pending.applied;
  const signedIn = hasCredential();
  const { dueCount } = useSyncStatus();

  const query = useQuery({
    ...lookupQueryOptions(queried, direction),
    enabled: queried.length > 0,
    retry: 0,
  });

  const view: LookupView = React.useMemo(
    () =>
      query.data === undefined
        ? { ...IDLE_VIEW, applied: direction }
        : toLookupView(query.data, direction),
    [direction, query.data],
  );

  const busy = queried !== '' && query.isPending;

  /* §3.1.5 的 300ms 门槛：不到 300ms 就回来的查询不闪骨架。 */
  React.useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy, queried]);

  /* 查到才记一条（R-10②）；同签名只记一次，避免 `push` → 新 `items` → `push` 换身份再跑一遍 effect。 */
  React.useEffect(() => {
    if (!query.isSuccess || queried === '') return;
    const item = toRecentItem(query.data, view.applied);
    if (item === null) return;
    const signature = `${queried}|${item.word}|${item.direction}`;
    if (pushedRef.current === signature) return;
    pushedRef.current = signature;
    pushRecent(item);
  }, [pushRecent, query.data, query.isSuccess, queried, view.applied]);

  /* 小组件直达（R-20③ / §3.1.4 修③）：本页挂载后消费一次性令牌，聚焦即展开面板。 */
  React.useEffect(() => {
    if (!takeSearchFocusRequest()) return;
    barRef.current?.focus();
    setFocused(true);
  }, []);

  React.useEffect(
    () => () => {
      if (graceRef.current !== null) clearTimeout(graceRef.current);
    },
    [],
  );

  const run = React.useCallback((value: string): void => {
    setText(value);
    setPending((current) => planSubmit(value, current));
  }, []);

  const openPanel = (): void => {
    if (graceRef.current !== null) clearTimeout(graceRef.current);
    setFocused(true);
  };
  const schedulePanelClose = (): void => {
    if (graceRef.current !== null) clearTimeout(graceRef.current);
    graceRef.current = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
  };

  /**
   * R-10③「点条目 = 复用缓存结果，不再发请求」：查询键 `lookupKeys.one(word, direction)` 与条目里
   * 存的"当初生效方向"同源（`result-row.resolveDirection` 的注释写了为什么两侧必须同一个函数），
   * 于是把状态摆回去就命中 `staleTime` 内的缓存；`getQueryData` 只是显式读一次、不发请求。
   */
  const pickRecent = (item: RecentSearchItemDto): void => {
    const value = item.word.trim();
    if (value === '') return;
    const applied: LookupDirectionValue =
      item.direction === 'auto' ? resolveDirection(value) : item.direction;
    setText(value);
    setPending({ text: value, applied, override: applied });
    void queryClient.getQueryData(lookupKeys.one(value, applied));
    setFocused(false);
    barRef.current?.getInput()?.blur();
  };

  /**
   * 目标档 = 生效方向的反向，单点在 `@tm/shared` 的 `flipLookupDirection`（A-89 #342），
   * 与 `DirectionLink` 的 `aria-label` 同口径。
   */
  const switchDirection = (): void => {
    if (pending === null) return;
    const next: LookupDirectionValue = flipLookupDirection(pending.applied);
    setPending(planSubmit(pending.text, pending, next));
  };

  /* bug_list #3：查到词就自动进单词本，不再要求用户先点星标。
     - 只在「已登录 + 英译中且命中」时做；
     - 同一会话里同一个词只处理一次（`autoAddedRef`）；
     - 词本列表已加载（`isSuccess`）时才判断"是否已在词本"，避免重复入队；
     - 入队失败静默：星标仍显示未收藏，用户可以手动点，不额外弹错。 */
  const wordbook = useQuery({
    ...wordbookQueryOptions(),
    enabled: signedIn,
    retry: 0,
  });
  const autoAddedRef = React.useRef('');
  React.useEffect(() => {
    if (!signedIn || !wordbook.isSuccess || view.kind !== 'en') return;
    const lower = view.word.trim().toLowerCase();
    if (lower === '' || autoAddedRef.current === lower) return;
    autoAddedRef.current = lower;
    for (const entry of wordbook.data ?? []) {
      if (entry.word.toLowerCase() === lower) return; // 已在词本：不重复入队
    }
    try {
      addWord(view.word);
      void queryClient.invalidateQueries({ queryKey: wordbookKeys.all });
    } catch {
      /* 入队失败不打扰用户 */
    }
  }, [signedIn, view.kind, view.word, wordbook.data, wordbook.isSuccess, queryClient]);

  const speak = React.useCallback(
    (word: string): void => {
      host.speak(word, 'us');
    },
    [host],
  );

  const openDetail = React.useCallback((href: string): void => host.navigate(href), [host]);

  /* 未登录点星标 = 由 hook 带着这个词去 `#/login?intent=favorite`（判据⑥ / R-16②），本页不写登录页。 */
  const favorite = useWordbookFavorite(
    view.kind === 'en' || view.kind === 'zh' ? view.word : '',
    host,
  );

  /* §3.3「kv 读取异常 → 面板显示一行，不空白」：组件见到 `storageErrorHint` 会**吞掉整个列表**
   * （`RecentSearchPanel.tsx` 的三元顺序），故宿主侧只在"列表为空且原始值读不出合法列表"时传，
   * 两个语义都保住。与 Web `home/search-section.tsx` 同一处理，已登记给 T-05 的组件缺陷清单。 */
  const storageBroken = React.useMemo(() => {
    if (recent.items.length > 0) return false;
    const raw = host.kv.get(RECENT_SEARCHES_KEY);
    if (raw === null || raw === '') return false;
    try {
      return !parseRecentSearchList(JSON.parse(raw) as unknown).success;
    } catch {
      return true;
    }
  }, [host, recent.items.length]);

  return (
    <div
      className="flex min-h-dvh w-full flex-col bg-bg text-ink"
      data-testid="lookup-screen"
      onClickCapture={preventRawHrefNavigation}
    >
      {/* bug_list #8：删掉 slogan（"记不住的，交给明天"）。原先 hero 与 spacer 两段是为了把
          搜索框垫到视口上三分之一，slogan 一撤这两段就只剩空白 ⇒ 一并去掉，搜索框直接落在顶部
          （外层 `main` 的 `pt-safe-top` 已经留好状态栏呼吸位，bug_list #4 同源）。 */}

      {/* 修①：搜索框固定在滚动容器顶部（`sticky top-0`），不再 `top:29%→0` 跳位。 */}
      <div
        className="sticky top-0 z-sticky bg-bg/95 px-4 pb-2 pt-2 backdrop-blur"
        data-testid="lookup-search-dock"
      >
        <div className="relative mx-auto w-full max-w-read">
          <SearchBar
            ref={barRef}
            id="tm-lookup-search"
            testid="lookup-search"
            label={ARIA.searchField}
            size="hero"
            value={text}
            onChange={setText}
            onSubmit={run}
            onClear={() => run('')}
            placeholder={text === '' ? SEARCH_PLACEHOLDER : ''}
            busy={busy}
            panelOpen={focused}
            panelId={PANEL_ID}
            onFocus={openPanel}
            onBlur={schedulePanelClose}
            containerClassName="z-pop"
            onKeyDown={(event) => {
              if (event.key === 'Enter') setFocused(false);
            }}
          >
            <RecentSearchPanel
              id={PANEL_ID}
              testid="lookup-recent-panel"
              open={focused}
              items={recent.items}
              onSelect={pickRecent}
              onRequestClear={() => setClearOpen(true)}
              onDismiss={() => setFocused(false)}
              title={LOOKUP_COPY.recent.title}
              clearLabel={LOOKUP_COPY.recent.clear}
              timeLabel={recentTimeLabel}
              noGlossLabel={LOOKUP_COPY.noGloss}
              emptyHint={LOOKUP_COPY.recent.emptyOnFocus(recent.max)}
              storageErrorHint={storageBroken ? LOOKUP_COPY.readFail : undefined}
              maxHeightPx={320}
            />
          </SearchBar>
        </div>
      </div>

      {/* C 胶囊：与 Web 同一组件、同一文案（§3.1.4），挂在框**之下**，不参与搜索框定位。 */}
      <div className="flex justify-center px-4 pt-3" data-testid="lookup-cta-row">
        <ReviewCta
          due={dueCount ?? 0}
          href="/study"
          signedIn={signedIn}
          loading={dueCount === null}
          onNavigate={openDetail}
          testid="lookup-review-cta"
        />
      </div>

      {/* E 结果区：`aria-live` 容器**常驻**（内容换、容器不换，读屏才播得出来），淡入发生在内层。 */}
      <section
        aria-live="polite"
        aria-busy={busy}
        className="w-full px-4 pt-4"
        data-testid="lookup-result-region"
      >
        <div key={queried === '' ? 'idle' : queried} className="animate-fade-in-up">
          <ResultArea
            queried={queried}
            busy={busy}
            slow={slow}
            failed={query.isError}
            view={view}
            favorite={favorite}
            onRetry={() => void query.refetch()}
            onSwitchDirection={switchDirection}
            onSpeak={speak}
            onOpenDetail={openDetail}
          />
        </div>
      </section>

      <ConfirmSheet
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={LOOKUP_COPY.recent.clearConfirmTitle}
        description={LOOKUP_COPY.recent.clearConfirmBody}
        confirmText={LOOKUP_COPY.recent.clear}
        cancelText={VERBS.cancel}
        tone="danger"
        testid="lookup-clear-confirm"
        onConfirm={() => {
          recent.clear();
          setClearOpen(false);
        }}
      />

      <ConfirmSheet
        open={favorite.confirmOpen}
        onOpenChange={favorite.closeConfirm}
        title={LOOKUP_COPY.unfavoriteConfirm.title}
        description={LOOKUP_COPY.unfavoriteConfirm.body(view.word)}
        confirmText={LOOKUP_COPY.unfavoriteConfirm.confirm}
        cancelText={LOOKUP_COPY.unfavoriteConfirm.cancel}
        tone="danger"
        onConfirm={favorite.unfavorite}
      />
    </div>
  );
}

/* ═════════════════ 结果区（判据②：查询后的四种形态，一态一 testid） ═════════════════ */

export interface ResultAreaProps {
  queried: string;
  busy: boolean;
  slow: boolean;
  failed: boolean;
  view: LookupView;
  favorite: ReturnType<typeof useWordbookFavorite>;
  onRetry: () => void;
  onSwitchDirection: () => void;
  onSpeak: (word: string) => void;
  onOpenDetail: (href: string) => void;
}

export function ResultArea({
  queried,
  busy,
  slow,
  failed,
  view,
  favorite,
  onRetry,
  onSwitchDirection,
  onSpeak,
  onOpenDetail,
}: ResultAreaProps): React.JSX.Element | null {
  /* 未查询：什么都不放（§3.1.5 默认态「不放任何占位卡、不放灰底提示块」，slogan 就是视觉重心）。 */
  if (queried === '') return null;

  /* 失败：`重试` 必须是**按钮**（§3.1.5 末行「禁只有文字"重试"的死路」）。 */
  if (failed) {
    return (
      <div data-testid="lookup-result-error">
        <EmptyState
          size="sm"
          title={LOOKUP_COPY.networkFail}
          hint={LOOKUP_COPY.notFound.subtitle}
          primary={{ label: VERBS.retry, onClick: onRetry }}
          testid="lookup-result-error"
        />
        <DirectionLink applied={view.applied} onSwitchDirection={onSwitchDirection} />
      </div>
    );
  }

  /* 加载中：条状骨架，**禁整页转圈、禁"加载中…"文字**。 */
  if (busy || view.kind === 'idle') {
    if (!busy) return null;
    return slow ? (
      <div data-testid="lookup-result-skeleton">
        <SkeletonBlock variant="result-bar" testid="lookup-result-skeleton" />
      </div>
    ) : null;
  }

  if (view.kind === 'empty') {
    return (
      <div data-testid="lookup-result-empty">
        <EmptyState
          size="sm"
          title={LOOKUP_COPY.notFound.title}
          hint={LOOKUP_COPY.notFound.subtitle}
          testid="lookup-result-empty"
        />
        <DirectionLink applied={view.applied} onSwitchDirection={onSwitchDirection} />
      </div>
    );
  }

  if (view.kind === 'zh') {
    return (
      <div data-testid="lookup-result">
        <ZhResultList
          rows={view.rows}
          source="home"
          onOpen={onOpenDetail}
          onSpeak={onSpeak}
          testid="lookup-result-rows"
        />
        <DirectionLink applied={view.applied} onSwitchDirection={onSwitchDirection} />
      </div>
    );
  }

  return (
    <div data-testid="lookup-result">
      <LookupResultBar
        layout="card"
        word={view.word}
        phonetic={view.phonetic}
        gloss={view.gloss}
        detailHref={detailHref(view.word, SOURCE)}
        detailAriaLabel={ARIA.fullMeaning(view.word)}
        onOpen={onOpenDetail}
        inWordbook={favorite.signedIn ? favorite.inWordbook : undefined}
        onToggleFavorite={favorite.toggle}
        favoriteLabel={ARIA.favorite(view.word)}
        favoritedLabel={ARIA.unfavorite(view.word)}
        onSpeak={onSpeak}
        speakLabel={(word: string) => ARIA.speak(word)}
        speakingLabel={ARIA.speaking}
        ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
        partial={view.partial}
        partialHint={LOOKUP_COPY.partialNoGloss}
        onDirectionChange={onSwitchDirection}
        directionLabel={LOOKUP_COPY.directionSwitch}
        directionAriaLabel={view.applied === 'zh2en' ? ARIA.directionEn2Zh : ARIA.directionZh2En}
        testid="lookup-result-bar"
      />
    </div>
  );
}

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default LookupScreen;
