/**
 * dictionaryapi.dev 客户端（免费英英词典 fallback）
 */

import type { ExamplePair } from '@tm/shared';

export interface DictionaryApiResult {
  phonetic: string;
  exchange: Record<string, string>;
  examples: ExamplePair[];
}

export interface DictionaryApiClient {
  query(word: string): Promise<DictionaryApiResult>;
}

export function createDictionaryApiClient(): DictionaryApiClient {
  const cache = new Map<string, DictionaryApiResult>();

  return {
    async query(word: string): Promise<DictionaryApiResult> {
      const cacheKey = 'dict_' + word;
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      try {
        const resp = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) throw new Error('not found');
        const data = (await resp.json()) as Array<{
          phonetic?: string;
          phonetics?: Array<{ text?: string }>;
          meanings?: Array<{ definitions?: Array<{ example?: string }> }>;
        }>;
        const entry = data[0];
        if (!entry) throw new Error('empty');
        const result: DictionaryApiResult = {
          phonetic: entry.phonetic ?? '',
          exchange: {},
          examples: [],
        };
        if (entry.phonetics && entry.phonetics[0]?.text) {
          result.phonetic = entry.phonetics[0].text;
        }
        if (entry.meanings) {
          for (const m of entry.meanings) {
            if (m.definitions) {
              for (const d of m.definitions) {
                if (d.example) result.examples.push({ en: d.example, zh: '' });
              }
            }
          }
        }
        cache.set(cacheKey, result);
        return result;
      } catch {
        return { phonetic: '', exchange: {}, examples: [] };
      }
    },
  };
}
