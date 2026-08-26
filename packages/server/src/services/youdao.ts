/**
 * 有道翻译 API 客户端（v3 签名）
 * 与 server.js 行为一致，保留内存缓存。
 */

import crypto from 'node:crypto';
import type { TranslationGroup } from '@tm/shared';
import { parseTranslation } from '@tm/shared';
import type { AppConfig } from '../config.js';

export interface YoudaoResult {
  translation: string;
  phonetic: string;
  groups: TranslationGroup[];
}

function truncate(q: string): string {
  return q.length <= 20 ? q : q.substring(0, 10) + q.length + q.substring(q.length - 10);
}

export interface YoudaoClient {
  queryEn2Zh(word: string): Promise<YoudaoResult>;
  queryZh2En(word: string): Promise<YoudaoResult>;
}

export function createYoudaoClient(config: AppConfig): YoudaoClient {
  const cache = new Map<string, YoudaoResult>();

  async function request(q: string, from: string, to: string, cacheKey: string): Promise<YoudaoResult> {
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    try {
      const salt = String(Date.now());
      const curtime = String(Math.floor(Date.now() / 1000));
      const input = config.youdaoAppKey + truncate(q) + salt + curtime + config.youdaoSecret;
      const sign = crypto.createHash('sha256').update(input).digest('hex');
      const resp = await fetch('https://openapi.youdao.com/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          q,
          appKey: config.youdaoAppKey,
          salt,
          sign,
          curtime,
          signType: 'v3',
          from,
          to,
          ...(from === 'EN' ? { dicts: 'ec' } : {}),
        }),
      });
      const data = (await resp.json()) as {
        translation?: string[];
        basic?: { phonetic?: string; explains?: string[] };
      };
      const result: YoudaoResult = {
        translation: data.translation ? data.translation[0] ?? '' : '',
        phonetic: data.basic?.phonetic ?? '',
        groups: [],
      };
      if (data.basic?.explains) {
        result.groups = parseTranslation(data.basic.explains.join('\n'));
      }
      cache.set(cacheKey, result);
      return result;
    } catch {
      return { translation: '', phonetic: '', groups: [] };
    }
  }

  return {
    queryEn2Zh(word: string): Promise<YoudaoResult> {
      return request(word, 'EN', 'zh-CHS', 'yd_' + word);
    },
    queryZh2En(word: string): Promise<YoudaoResult> {
      return request(word, 'zh-CHS', 'EN', 'yd_zh2en_' + word);
    },
  };
}
