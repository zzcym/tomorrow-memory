/**
 * A-40 #56①（T-14b）：查词辅导内容 `/api/tutor` 的**信封收形**。
 *
 * 服务端实发 `{word, level, content, cached}`（`packages/server/src/routes/tutor.ts`），
 * 而契约 `TutorContentSchema` 收的是 `content` 那一层。裁决采"数据层 unwrap"：
 * 在 `lookup.ts` 里剥信封再校 `content`，**不动 `@tm/shared` 契约**（不消耗基线额度）。
 * 页面级判据（展开才发 1 次请求）由 `test/detail-screen.spec.tsx` 钉；本文件只钉 unwrap 本身，
 * 含一条反永真：两种形状都不合时**仍然**判 `BAD_RESPONSE`，不是"取不到就 null"。
 */

import { describe, expect, it } from 'vitest';
import type { TutorContent } from '@tm/shared';
import { isApiError } from '../rest-fetcher.js';
import { unwrapTutorPayload } from './lookup.js';

const CONTENT: TutorContent = {
  mnemonic: 'haps = 快乐：开心就 happy',
  wordRoot: 'hap（运气、机遇）',
  sceneExamples: [{ en: 'She looks happy.', zh: '她看起来很开心。', scene: '日常寒暄' }],
  confusable: 'happy 与 luck（运气）同根，别和 hippo 混。',
};

/** 服务端实发的信封形状（`routes/tutor.ts:34`）。 */
const ENVELOPE = { word: 'happy', level: 'B1', content: CONTENT, cached: false };

describe('A-40 #56① unwrapTutorPayload', () => {
  it('信封 → 交出 `content` 那一层，四类字段齐全', () => {
    expect(unwrapTutorPayload(ENVELOPE)).toEqual(CONTENT);
  });

  it('裸 `TutorContent` 仍然收（旧数据层与既有用例回的就是这一形）', () => {
    expect(unwrapTutorPayload(CONTENT)).toEqual(CONTENT);
  });

  it('null / undefined → null（不发请求时的空数据，不报错）', () => {
    expect(unwrapTutorPayload(null)).toBeNull();
    expect(unwrapTutorPayload(undefined)).toBeNull();
  });

  it('空内容但形状合（四类全空）→ 原样交出，由页面决定整块不显示', () => {
    const empty: TutorContent = { mnemonic: '', wordRoot: '', sceneExamples: [], confusable: '' };
    expect(unwrapTutorPayload(empty)).toEqual(empty);
    expect(unwrapTutorPayload({ word: 'happy', level: 'B1', content: empty, cached: true })).toEqual(
      empty,
    );
  });

  it('反永真：两种形状都不合（含信封里 `content` 为 null / 缺字段）⇒ 仍判 BAD_RESPONSE', () => {
    for (const raw of [
      { word: 'happy', level: 'B1', cached: false },
      { ...ENVELOPE, content: null },
      { ...ENVELOPE, content: { mnemonic: 1 } },
      { mnemonic: '只有口诀', wordRoot: 'r', confusable: 'c' },
      'tutor',
      42,
    ]) {
      let caught: unknown = null;
      try {
        unwrapTutorPayload(raw);
      } catch (error) {
        caught = error;
      }
      expect(isApiError(caught) && caught.code).toBe('BAD_RESPONSE');
    }
  });
});
