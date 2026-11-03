/**
 * 查词（R-09 / R-14 的数据面）。`GET /api/lookup` 是旧 APK 兼容矩阵成员（§4.2-3），形状不许动；
 * 出参一律经 `@tm/shared/contracts/lookup` 的 `safeParse` 收形（§5.2）。
 */

import { queryOptions } from '@tanstack/react-query';
import {
  TutorContentSchema,
  parseLookupResponse,
  type LookupDirectionValue,
  type LookupResponse,
  type TutorContent,
} from '@tm/shared';
import { apiGet, unwrapParse } from '../rest-fetcher.js';

export const lookupKeys = {
  all: ['lookup'] as const,
  one: (word: string, direction?: LookupDirectionValue) =>
    [...lookupKeys.all, word.trim().toLowerCase(), direction ?? 'auto'] as const,
  tutor: (word: string) => [...lookupKeys.all, 'tutor', word.trim().toLowerCase()] as const,
};

export function lookupQueryOptions(word: string, direction: LookupDirectionValue = 'auto') {
  const value = word.trim();
  return queryOptions({
    queryKey: lookupKeys.one(value, direction),
    enabled: value.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      apiGet<LookupResponse>(
        '/api/lookup',
        { query: { word: value, direction } },
        (raw) => unwrapParse(parseLookupResponse(raw)),
      ),
  });
}

/**
 * `/api/tutor` 的实际回带是**信封** `{word, level, content, cached}`
 * （出处 `packages/server/src/routes/tutor.ts`），而契约 `TutorContentSchema` 收的是
 * 信封里那层 `content`（A-40 #56① / 契约偏差 D-1）。A-40 裁决采"数据层 unwrap"：
 * 在这里剥信封再校 `content`，不动 `@tm/shared` 契约、不消耗基线额度。
 * 两种形状都吃（旧数据层与用例仍会直接回裸 `TutorContent`），都不合才判 `BAD_RESPONSE`。
 */
export function unwrapTutorPayload(raw: unknown): TutorContent | null {
  if (raw === null || raw === undefined) return null;
  const bare = TutorContentSchema.safeParse(raw);
  if (bare.success) return unwrapParse(bare);
  if (typeof raw === 'object' && typeof (raw as { content?: unknown }).content !== 'undefined') {
    const inner = TutorContentSchema.safeParse((raw as { content: unknown }).content);
    if (inner.success) return unwrapParse(inner);
  }
  return unwrapParse(TutorContentSchema.safeParse(raw));
}

/** AI 记法：本期一次性返回，不做流式（§5.2 第 ③ 条）。 */
export function tutorQueryOptions(word: string) {
  const value = word.trim();
  return queryOptions({
    queryKey: lookupKeys.tutor(value),
    enabled: value.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: () =>
      apiGet<TutorContent | null>(
        '/api/tutor',
        { query: { word: value }, auth: true },
        (raw) => unwrapTutorPayload(raw),
      ),
  });
}
