/**
 * 查词主服务：组合离线词典 + 在线 API，复刻 server.js /api/lookup 的完整逻辑与响应格式。
 *
 * 响应格式（与旧版完全一致，前端不感知）：
 *  - zh2en:  { query, sourceLang: 'zh', results: Zh2EnEntry[], error: string|null }
 *  - en2zh 命中: { word, phonetic, translation, definition, groups, exchange, examples, freq, tag, detail, audio }
 *  - en2zh 未命中: { word, phonetic, translation, groups, exchange, examples, notFound }
 *  - auto mixed: { query, sourceLang: 'mixed', results: [], error: string }
 */

import type {
  ExamplePair,
  LookupDirection,
  LookupEn2ZhFallback,
  LookupEn2ZhSuccess,
  LookupResponse,
  LookupZh2EnResponse,
  Zh2EnEntry,
} from '@tm/shared';
import { detectLanguage, parseExchange, parseTranslation } from '@tm/shared';
import type { DictionaryApiClient } from './dictionaryapi.js';
import type { DictSources, StardictRow } from './dict-sources.js';
import type { YoudaoClient } from './youdao.js';

export interface LookupMixedResponse {
  query: string;
  sourceLang: 'mixed';
  results: [];
  error: string;
}

export type {
  LookupDirection,
  LookupEn2ZhSuccess,
  LookupEn2ZhFallback,
  LookupZh2EnResponse,
  LookupResponse,
};

export interface LookupService {
  lookup(word: string, direction: LookupDirection): Promise<LookupResponse | null>;
}

export class DefaultLookupService implements LookupService {
  constructor(
    private readonly sources: DictSources,
    private readonly youdao: YoudaoClient,
    private readonly dictApi: DictionaryApiClient,
  ) {}

  /**
   * @returns null 表示参数非法（word 为空 / direction 非法），由路由层返回 400
   */
  async lookup(word: string, direction: LookupDirection): Promise<LookupResponse | null> {
    const trimmed = word.trim();
    if (!trimmed) return null;

    let dir = direction;
    if (!['auto', 'en2zh', 'zh2en'].includes(dir)) return null;

    if (dir === 'auto') {
      const lang = detectLanguage(trimmed);
      if (lang === 'mixed') {
        return {
          query: trimmed,
          sourceLang: 'mixed',
          results: [],
          error: '检测到中英混合输入，请输入纯中文或纯英文',
        };
      }
      dir = lang === 'zh' ? 'zh2en' : 'en2zh';
    }

    if (dir === 'zh2en') {
      return this.lookupZh2En(trimmed);
    }

    return this.lookupEn2Zh(trimmed);
  }

  private async lookupZh2En(word: string): Promise<LookupZh2EnResponse> {
    // 1. 本地中英词典（最快）
    const ecResults = this.sources.queryEcDict(word);
    if (ecResults && ecResults.length > 0) {
      return { query: word, sourceLang: 'zh', results: ecResults, error: null };
    }

    // 2. stardict.db 反向搜索（离线，覆盖 340 万词）
    const dictResults = this.sources.queryStardictZh2En(word);
    if (dictResults.length > 0) {
      return { query: word, sourceLang: 'zh', results: dictResults, error: null };
    }

    // 3. 有道 API（可能被限频）
    const youdaoResult = await this.youdao.queryZh2En(word);
    if (youdaoResult.translation || youdaoResult.groups.length > 0) {
      const results: Zh2EnEntry[] =
        youdaoResult.groups.length > 0
          ? youdaoResult.groups.map((g) => ({
              word: g.meanings.join(', '),
              pos: g.pos,
              definition: word,
              examples: [],
              synonyms: [],
              phonetic: youdaoResult.phonetic || '',
            }))
          : [
              {
                word: youdaoResult.translation,
                pos: '',
                definition: word,
                examples: [],
                synonyms: [],
                phonetic: youdaoResult.phonetic || '',
              },
            ];
      return { query: word, sourceLang: 'zh', results, error: null };
    }

    return { query: word, sourceLang: 'zh', results: [], error: '未找到该词汇的翻译' };
  }

  private async lookupEn2Zh(word: string): Promise<LookupEn2ZhSuccess | LookupEn2ZhFallback> {
    const row = this.sources.lookupStardict(word);
    const examples = this.sources.queryExamples(word);

    if (!row) {
      const [youdaoResult, dictResult] = await Promise.all([
        this.youdao.queryEn2Zh(word),
        this.dictApi.query(word),
      ]);
      const combinedExamples = examples.length > 0 ? examples : dictResult.examples;
      return {
        word,
        phonetic: dictResult.phonetic || youdaoResult.phonetic || '',
        translation: youdaoResult.translation || '',
        groups: youdaoResult.groups || [],
        exchange: dictResult.exchange || {},
        examples: combinedExamples,
        notFound: !youdaoResult.translation && combinedExamples.length === 0,
      };
    }

    return this.formatStardictHit(row, examples);
  }

  private formatStardictHit(row: StardictRow, examples: ExamplePair[]): LookupEn2ZhSuccess {
    const groups = parseTranslation(row.translation);
    const exchange = parseExchange(row.exchange);
    const freq = row.collins ?? 0;

    return {
      word: row.word,
      phonetic: (row.phonetic ?? '').replace(/^'|'$/g, ''),
      translation: row.translation ?? '',
      definition: row.definition ?? '',
      groups,
      exchange,
      examples,
      freq,
      tag: row.tag ?? '',
      detail: row.detail ?? '',
      audio: row.audio ?? '',
    };
  }
}
