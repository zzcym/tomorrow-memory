/**
 * App 词详情页（`#/word/{word}?from=home|study|wordbook|chat`，secondary）—— T-17。
 * UI §3.4 全节（分区顺序 1–8 锁死）/ §3.4.1 词形变化 / §3.4.2 AI 记法两态 / §3.4.3 交互态；
 * PRD R-09①③④⑥、R-14③④⑤、R-16①②、R-10③（复用查词页缓存）、R-19④、R-23①（未登录可读）。
 *
 * 本页只做四件事，其余全部交给 `@tm/ui/patterns/WordDetailCard`（禁覆写组件）：
 *  1. **取数**：只经 `data/queries/lookup.ts` 的 `lookupQueryOptions`，键与查词页**同一条**
 *     （`lookupKeys.one(word, resolveDirection(word))`）⇒ 从首页点「查看详情」进来 0 次多余请求（R-10③）。
 *  2. **按来源返回**（R-09③，判据②的另一半）：`?from=` → 目标路径的唯一映射在 `sourceBackTarget()`，
 *     未识别的一律回查词 tab（`home`），小组件直达与分享链也走这一条。
 *  3. **词形变化中文标签**（§3.4.1 / R-14⑤）：服务端 `exchange` 的键已被 `parseExchange`（`@tm/shared/utils.ts:134`）
 *     改成 `past/plural/…` 这种英文语义名，而 `WordDetailCard` 认的是 `INFLECTION_LABELS` 的 `p:/s:/…`
 *     —— 中间必须有一张表，否则**整块静默不渲染**。表在本文件 `EXCHANGE_TO_LABEL_TAG`，
 *     已作为"双端共用一张表"的需求登记进报告（架构上它属于 `@tm/shared`，owner T-03）。
 *  4. **AI 记法区**（判据④）：状态机在 `components/ai-mnemonic-bar.tsx`（默认收起、展开才请求、
 *     失败给降级文案 + 重试、未登录不发明 401），本页只把它接进卡片的区块 7。
 *
 * 未登录（判据⑥ / R-23①）：本页**可读**，不做任何门禁；只有两个动作会走登录
 * （星标 = `useWordbookFavorite` 内部 `#/login?intent=favorite`；`立即背这个词` = `#/login?intent=study`）。
 *
 * 判据⑤（375×667 / 412×915 无横向滚动）的落地口径：本文件**不写任何固定像素宽度、不写 `w-[…]` 任意值、
 * 不写 `whitespace-nowrap`**；长词头/长释义一律靠 `min-w-0` + `break-words` 收缩（`test/detail-screen.spec.tsx`
 * 有源码级与内联样式级哨兵，真机 `getBoundingClientRect` 量测留给 T-23 的 CDP 用例）。
 *
 * Chrome84 红线：不用 `structuredClone` / `Object.hasOwn` / `Array.prototype.at` / `requestIdleCallback`；
 * 遍历用 `for…of` + 索引，键表用普通对象字面量。
 */

import * as React from 'react';
import {
  ARIA,
  BRAND,
  INFLECTION_LABELS,
  LOOKUP_COPY,
  STUDY_COPY,
  VERBS,
  WORD_DETAIL_COPY,
  WORD_DETAIL_SECTION_LABELS,
  type ExamplePair,
  type LookupEn2ZhFallback,
  type LookupEn2ZhSuccess,
  type LookupResponse,
  type TranslationGroup,
} from '@tm/shared';
import {
  ConfirmSheet,
  WordDetailCard,
  useHost,
} from '@tm/ui';
import { useQuery } from '@tanstack/react-query';
import { lookupQueryOptions } from '../data/queries/lookup.js';
import { hasCredential } from '../data/rest-fetcher.js';
import { useMnemonicBar } from '../components/ai-mnemonic-bar.js';
// FU24②：登录落点引 `lib/auth-store.ts` 的 `LOGIN_ROUTE` 单点（原 `ai-mnemonic-bar` 的第二份字面量已上收）。
import { LOGIN_ROUTE } from '../lib/auth-store.js';
import {
  detailSourceOf,
  preventRawHrefNavigation,
  resolveDirection,
  useWordbookFavorite,
  type DetailSource,
} from '../components/result-row.js';
import { back, canGoBack, navigate, useLocation } from '../router.js';

/* ═════════════════ 按来源返回（R-09③） ═════════════════ */

/**
 * `from` → 返回目标。**只有这一张表**（App 无对话页，`chat` 回查词 tab；`wordbook` 的滚动恢复
 * 归 T-18 的 `WordbookScreen` 自己接 `?scroll=`，见报告「给 T-18 的交接」）。
 */
export const SOURCE_BACK_TARGET: Readonly<Record<DetailSource, string>> = {
  home: '/',
  study: '/study',
  wordbook: '/wordbook',
  chat: '/',
};

export function sourceBackTarget(source: DetailSource): string {
  return SOURCE_BACK_TARGET[source] ?? '/';
}

/** 详情页取词：`?from=` 缺省按 `home`（分享链与小组件直达都从查词页来）。 */
export function detailWordOf(params: Record<string, string>): string {
  const raw = params.word ?? '';
  return raw.trim();
}

/* ═════════════════ 词形变化：服务端语义名 → `INFLECTION_LABELS` 的缩写键 ═════════════════ */

/**
 * `parseExchange()` 出来的键是 `past/pastParticiple/present/third/plural/comparative/superlative/base`；
 * `WordDetailCard.visibleInflections()` 只认 `INFLECTION_LABELS`（`p:`/`d:`/`f:`/`s:`/`1e:`/`R:`/`T:`…），
 * 未命中即整条不渲染（这是 §3.4.1「绝对禁止原始缩写上屏」的实现方式）。
 *
 * `base`（原形）**故意不映射**：`INFLECTION_LABELS` 没有 `0:` 这一档，
 * 而 §3.4.1 的映射表里写着 `0 原形` ⇒ 这是 shared 的缺口，不是本页的分支（已登记报告「待拍板」）。
 */
export const EXCHANGE_TO_LABEL_TAG: Readonly<Record<string, string>> = {
  past: 'p:',
  pastParticiple: 'd:',
  present: 'ing:',
  third: 's:',
  plural: '1e:',
  comparative: 'R:',
  superlative: 'T:',
};

export interface DetailParts {
  phonetic: string;
  groups: TranslationGroup[];
  examples: ExamplePair[];
  inflections: ReadonlyArray<{ tag: string; form: string }>;
  enDefinition: string;
  freqLabel: string | undefined;
  audio: string;
}

const isEnBranch = (r: LookupResponse): r is LookupEn2ZhSuccess | LookupEn2ZhFallback =>
  'word' in r;

/** 服务端 `exchange` 的形状是 `Record<string,string>`，但契约允许漂移 ⇒ 逐键窄化。 */
function inflectionsOf(exchange: Record<string, string> | undefined): Array<{ tag: string; form: string }> {
  const out: Array<{ tag: string; form: string }> = [];
  if (!exchange) return out;
  const keys = Object.keys(exchange);
  for (const key of keys) {
    // 漂移兜底：服务端万一回带**原始缩写**（`p:`/`d:`…）也直接当标签用，
    // 因为 `INFLECTION_LABELS` 认的就是这一档；两套键都能出中文，绝不上屏原始缩写。
    const tag = EXCHANGE_TO_LABEL_TAG[key] ?? (INFLECTION_LABELS[key] !== undefined ? key : undefined);
    const form = (exchange[key] ?? '').trim();
    if (!tag || form === '') continue;
    out.push({ tag, form });
  }
  return out;
}

/** 频率档：`freq` 是柯林斯 1–5，0 = 无数据 ⇒ 不给 Badge（§3.4 区块 2 的"词频标签"是有值才出现）。 */
function freqLabelOf(freq: number | undefined): string | undefined {
  if (typeof freq !== 'number' || !Number.isFinite(freq) || freq <= 0) return undefined;
  return WORD_DETAIL_COPY.frequencyCollins(Math.round(freq));
}

/**
 * `LookupResponse` → 详情页分区数据。
 * 中译英/混合两种回带**没有词头明细**（它们的结果是候选列表），故返回 `null` = 走空态卡（R-09④：
 * 界面不出现 `undefined`、不出现空白卡）。
 */
export function toDetailParts(result: LookupResponse | null | undefined): DetailParts | null {
  if (!result || !isEnBranch(result)) return null;
  if ('notFound' in result && result.notFound === true) return null;
  const groups = Array.isArray(result.groups) ? result.groups : [];
  const definitionText = 'definition' in result ? (result.definition ?? '') : '';
  const fallbackMeaningless =
    groups.length === 0 &&
    (result.translation ?? '').trim() === '' &&
    definitionText.trim() === '';
  if (fallbackMeaningless) return null;
  return {
    phonetic: result.phonetic ?? '',
    groups,
    examples: Array.isArray(result.examples) ? result.examples : [],
    inflections: inflectionsOf(result.exchange),
    enDefinition: definitionText,
    freqLabel: freqLabelOf('freq' in result ? result.freq : undefined),
    audio: 'audio' in result ? (result.audio ?? '') : '',
  };
}

/* ═════════════════ 页面 ═════════════════ */

export function WordDetailScreen(): React.JSX.Element {
  const host = useHost();
  const loc = useLocation();
  const word = detailWordOf(loc.params);
  const source = detailSourceOf(loc.query);
  const signedIn = hasCredential();

  /** 与查词页同键（英文词头恒为 `en2zh`）⇒ 命中 `staleTime` 内的缓存 = 0 次多余请求（R-10③）。 */
  const direction = React.useMemo(() => resolveDirection(word), [word]);
  const query = useQuery({
    ...lookupQueryOptions(word, direction),
    enabled: word.length > 0,
    retry: 0,
  });

  const parts = React.useMemo(() => toDetailParts(query.data), [query.data]);

  /* AI 记法要登录（`/api/tutor` 是 `auth: true`）⇒ 未登录时"再试一次"的去向就是登录页；
   * 登录页只认 `intent=favorite|study`（T-19），这里不带 intent 参数，登录后回到本页仍能展开。 */
  const goToLogin = React.useCallback((): void => {
    navigate(LOGIN_ROUTE);
  }, []);
  const mnemonic = useMnemonicBar(word, goToLogin);

  /* 页面标题（§3.4.3 末条）：`{word} · 明日记忆`，`BRAND.name` 是唯一品牌串来源，不写第二份。 */
  React.useEffect(() => {
    if (typeof document === 'undefined' || word === '') return;
    const previous = document.title;
    document.title = `${word} · ${BRAND.name}`;
    return () => {
      document.title = previous;
    };
  }, [word]);

  const speak = React.useCallback(
    (value: string): void => {
      host.speak(value, 'us');
    },
    [host],
  );

  /* 星标 = 与查词页**同一个** hook（两颗星的语义必须一模一样：未登录走登录并保留待收藏词、
   * 已收藏给二次确认、写入走离线优先队列）。 */
  const favorite = useWordbookFavorite(word, host);

  const goBack = React.useCallback((): void => {
    if (canGoBack()) {
      back();
      return;
    }
    navigate(sourceBackTarget(source));
  }, [source]);

  /**
   * 「立即背这个词」：未登录先登录（§3.4.3 未登录行）；已登录把词带给背词页。
   * `?focus=` 是**新增查询键**、不是新路由（`router.tsx` 零 diff），消费方归 T-18：
   * 需求已写在报告「路由注册需求」一节 —— T-18 若暂不接这个键，动作退化为"打开背词 tab"，不报错。
   */
  const goStudy = React.useCallback((): void => {
    if (!signedIn) {
      navigate(`${LOGIN_ROUTE}?intent=study&word=${encodeURIComponent(word)}`);
      return;
    }
    navigate(`/study?focus=${encodeURIComponent(word)}`);
  }, [signedIn, word]);

  const loading = word !== '' && query.isPending;
  const failed = query.isError;
  const view = parts;

  return (
    <div
      className="flex min-h-dvh w-full flex-col bg-bg text-ink"
      data-testid="detail-screen"
      onClickCapture={preventRawHrefNavigation}
    >
      {/* 区块 1 顶栏：`‹ 返回`（热区 ≥44px）+ 页面 `sr-only` h1（移动可见标题是词头本身，
      shared 无「词详情」常量 ⇒ 不硬造第二份文案，见报告「待拍板」）。 */}
      <header className="flex items-center gap-2 px-4 pb-1 pt-3" data-testid="detail-header">
        <button
          type="button"
          onClick={goBack}
          aria-label={ARIA.back}
          className="min-h-tap min-w-tap shrink-0 rounded-lg px-2 text-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
          data-testid="detail-back"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1 className="sr-only">{word === '' ? BRAND.name : `${word} · ${BRAND.name}`}</h1>
      </header>

      <main className="mx-auto w-full max-w-read flex-1 px-4 pb-safe-bottom" data-testid="detail-body">
        <WordDetailCard
          word={word}
          phonetic={view?.phonetic ?? ''}
          groups={view?.groups ?? []}
          examples={view?.examples ?? []}
          examplesCollapseLabel={WORD_DETAIL_COPY.moreExamples}
          inflections={view?.inflections ?? []}
          enDefinition={view?.enDefinition ?? ''}
          enDefinitionLabel={WORD_DETAIL_COPY.enDefinition}
          freqLabel={view?.freqLabel}
          meaningLabel={WORD_DETAIL_SECTION_LABELS.meaning}
          inflectionLabel={WORD_DETAIL_SECTION_LABELS.inflection}
          exampleLabel={WORD_DETAIL_SECTION_LABELS.example}
          mnemonicLabel={mnemonic.label}
          mnemonicState={mnemonic.state}
          mnemonic={mnemonic.content}
          mnemonicCollapsedLabel={mnemonic.collapsedLabel}
          mnemonicFailLabel={mnemonic.failLabel}
          onMnemonicToggle={mnemonic.onToggle}
          onMnemonicRetry={mnemonic.onRetry}
          onSpeak={speak}
          speakLabel={(value: string) => ARIA.speak(value)}
          ttsUnavailableHint={STUDY_COPY.ttsUnavailable}
          inWordbook={favorite.signedIn ? favorite.inWordbook : undefined}
          onToggleFavorite={favorite.toggle}
          onStudy={goStudy}
          studyLabel={WORD_DETAIL_COPY.studyThisWord}
          backLabel={ARIA.back}
          onBack={goBack}
          loading={loading}
          emptyTitle={failed ? LOOKUP_COPY.networkFail : LOOKUP_COPY.notFound.title}
          emptyHint={LOOKUP_COPY.notFound.subtitle}
          onRetry={() => void query.refetch()}
          retryLabel={VERBS.retry}
          secondaryAction={{ label: VERBS.goStudy, onClick: () => navigate('/study') }}
          testid="detail-card"
        />
      </main>

      <ConfirmSheet
        open={favorite.confirmOpen}
        onOpenChange={favorite.closeConfirm}
        title={LOOKUP_COPY.unfavoriteConfirm.title}
        description={LOOKUP_COPY.unfavoriteConfirm.body(word)}
        confirmText={LOOKUP_COPY.unfavoriteConfirm.confirm}
        cancelText={LOOKUP_COPY.unfavoriteConfirm.cancel}
        tone="danger"
        onConfirm={favorite.unfavorite}
      />
    </div>
  );
}

/* ═════════════════ 类型别名（区块 7 的形状就是 hook 的返回值，不再声明第二份） ═════════════════ */

/** `React.lazy` 取的就是这个 default 导出（`router.tsx` 的 `RouteLoader` 签名，禁改）。 */
export default WordDetailScreen;
