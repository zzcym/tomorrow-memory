/**
 * 首页查词的**传输与视图投影**层（T-12）。
 *
 * 为什么单独一个文件：首页不写 `fetch(`（判据⑤ / `boundaries` 的 `ui-no-io` 同口径），
 * 传输唯一走 `@/lib/trpc`（React Query 缓存 = R-10③「点最近条目不再发一次重复请求」的实现点），
 * 本文件只做**纯函数**：方向判定、结果裁剪为"精简结果条"、最近查询条目映射。零 IO、可单测。
 *
 * 原 `dictionary.lookup` 的 SSE 流式分片里 `ai-*` 三类**首页不再消费**：
 * AI 教学内容按 `00-user-review.md` §3.1 搬进词详情页的「AI 记法」区（T-15 / R-09 ⑥），
 * 因此首页用一次性 `lookupStatic`，页面长度不再被流式文本撑开。
 */

import type {
  LookupDirectionValue,
  LookupEn2ZhSuccess,
  LookupResponse,
  LookupZh2EnResponse,
  RecentSearchItemDto,
} from '@tm/shared';
import { RECENT_GLOSS_MAX_LENGTH, WORD_MAX_LENGTH } from '@tm/shared';

/** 中日韩字符判定：命中即视为"用户想中译英"（定案：默认自动，不给三颗方向按钮）。 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/;

/**
 * 中译英在首页只给"精简结果条"的候选行。
 * 每行是一颗「查看详情」链接（§3.1.1 聚合规则②），3 行 + 搜索框 2 + 胶囊 1 + 方向链 1 = 7，
 * 卡在 §3.1.1「已查询态 ≤8」之内；其余候选去词详情页看（R-08 ③）。
 */
const ZH_ROWS_MAX = 3;

/** 用户没有手动改过方向时按输入内容自动判定（'auto' 交给服务端同源判定）。 */
export function resolveDirection(query: string, override: LookupDirectionValue): LookupDirectionValue {
  if (override !== 'auto') return override;
  return CJK.test(query) ? 'zh2en' : 'auto';
}

export interface LookupRowView {
  word: string;
  phonetic: string;
  gloss: string;
}

export interface HomeLookupView {
  /** `en` = 单条精简结果条；`zh` = 中译英条目列表（≤5）；`empty` = 没找到；`idle` = 未查询。 */
  kind: 'idle' | 'en' | 'zh' | 'empty';
  word: string;
  phonetic: string;
  /** 英译中：词性分组首义拼成的一行（`LookupResultBar` 自己按 2 行截断）。 */
  gloss: string;
  rows: LookupRowView[];
  /** 有词头但无中文释义（R-09 ④：禁空白）。 */
  partial: boolean;
  /** 服务端判定实际使用的方向（"换个查询方向"文字链据此给下一档）。 */
  applied: LookupDirectionValue;
}

const firstMeaningOf = (groups: ReadonlyArray<{ pos: string; meanings: string[] }>): string =>
  groups
    .map((g) => {
      const head = (g.meanings[0] ?? '').trim();
      if (!head) return '';
      const pos = g.pos.trim();
      return pos ? `[${pos}] ${head}` : head;
    })
    .filter(Boolean)
    .join(' · ');

/** 旧 `LookupResponse` 四元联合的窄化：两个英译中分支都**没有** `sourceLang`。 */
const isZh2En = (r: LookupResponse): r is LookupZh2EnResponse =>
  'sourceLang' in r && r.sourceLang === 'zh';
const isEnHit = (r: LookupResponse): r is LookupEn2ZhSuccess => 'word' in r;
const notFound = (r: LookupResponse): boolean => 'notFound' in r && r.notFound === true;

export function toHomeLookupView(result: LookupResponse | null | undefined, applied: LookupDirectionValue): HomeLookupView {
  if (!result) return { kind: 'idle', word: '', phonetic: '', gloss: '', rows: [], partial: false, applied };

  if (isZh2En(result)) {
    const rows = result.results.slice(0, ZH_ROWS_MAX).map((e) => ({
      word: e.word,
      phonetic: e.phonetic,
      gloss: e.pos ? `[${e.pos}] ${e.definition}` : e.definition,
    }));
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

  if (!isEnHit(result)) {
    // `mixed` 分支（中英混输）服务端只回 error：首页按"没找到"处理，不显示任何内部名词。
    return { kind: 'empty', word: '', phonetic: '', gloss: '', rows: [], partial: false, applied: 'auto' };
  }

  const gloss = firstMeaningOf(result.groups ?? []);
  return {
    kind: notFound(result) ? 'empty' : 'en',
    word: result.word,
    phonetic: result.phonetic ?? '',
    gloss,
    rows: [],
    partial: !notFound(result) && gloss === '' && (result.translation ?? '') === '',
    applied: 'en2zh',
  };
}

/** 结果条首义：优先词性分组，退化到 `translation` 首行（最近查询面板与 R-10② 同源）。 */
export function resultGloss(result: LookupResponse | null | undefined): string {
  if (!result || !isEnHit(result)) return '';
  const view = toHomeLookupView(result, 'auto');
  const raw = view.gloss !== '' ? view.gloss : (result.translation ?? '').split('\n')[0] ?? '';
  return raw.slice(0, RECENT_GLOSS_MAX_LENGTH);
}

export function toRecentItem(result: LookupResponse | null | undefined, applied: LookupDirectionValue): Omit<RecentSearchItemDto, 'at'> | null {
  if (!result) return null;
  const view = toHomeLookupView(result, applied);
  if (view.kind === 'empty' || view.word === '') return null;
  return {
    word: view.word.slice(0, WORD_MAX_LENGTH),
    direction: view.applied,
    gloss: view.kind === 'zh' ? view.rows[0]?.gloss ?? '' : view.gloss,
  };
}
