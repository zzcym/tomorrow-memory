/**
 * `packages/agent/src/tools/fsrs.ts` 的纯函数真测（E4c-ii 件②）。
 *
 * 零网络 / 零 LLM / 零 DB / 零 Qdrant：只碰 ts-fsrs 的纯计算。
 * - ts-fsrs 4.7.1 的 `dist/index.mjs` 里 `Math.random` 0 命中（本文件已实测核对），
 *   `enable_fuzz` 默认关 ⇒ `fsrs().repeat()` 对同一 (card, now) 是确定函数。
 * 不依赖真实时钟：`retrievability` / `retrievabilityPowerLaw` / `buildTodayQueue` /
 * `applyRating` / `createDefaultCard` 的默认参数都是 `new Date()` ⇒ **每处调用都显式传 `now`**。
 */

import { describe, expect, it } from 'vitest';
import {
  applyRating,
  buildTodayQueue,
  cardFromJson,
  cardToJson,
  createDefaultCard,
  retrievability,
  retrievabilityPowerLaw,
  REVIEW_THRESHOLD,
} from '../src/tools/fsrs.js';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

/** 已复习过的老卡（state=2 Review，S=5，last_review = NOW）。 */
const MATURE_JSON = JSON.stringify({
  due: '2026-03-05T12:00:00.000Z',
  stability: 5,
  difficulty: 6.25,
  elapsed_days: 3,
  scheduled_days: 5,
  reps: 4,
  lapses: 1,
  state: 2,
  last_review: '2026-03-01T12:00:00.000Z',
});

describe('fsrs 卡片序列化往返', () => {
  it('钉住 createDefaultCard(now)：新卡 S=1 / D=5 / state=0 / due=now / last_review=null', () => {
    expect(JSON.parse(cardToJson(createDefaultCard(NOW)))).toEqual({
      due: '2026-03-01T12:00:00.000Z',
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
  });

  it('钉住 cardToJson(cardFromJson(json)) 对两种卡都是恒等（server fsrs_data 落库口径）', () => {
    expect(cardToJson(cardFromJson(MATURE_JSON))).toBe(MATURE_JSON);
    const fresh = cardToJson(createDefaultCard(NOW));
    expect(cardToJson(cardFromJson(fresh))).toBe(fresh);
  });

  it('钉住 last_review 缺省为 null 的卡在反序列化后仍是 null（不被 createEmptyCard 的当前时间污染）', () => {
    const noLast = JSON.stringify({ ...JSON.parse(MATURE_JSON), last_review: null });
    expect(JSON.parse(cardToJson(cardFromJson(noLast))).last_review).toBeNull();
  });
});

describe('fsrs.retrievability — 指数式 R(t)=exp(-t/S) 与时间夹取', () => {
  const card = cardFromJson(MATURE_JSON);

  it('钉住 now === last_review ⇒ R=1，+1 天 ⇒ exp(-1/5)', () => {
    expect(retrievability(card, NOW)).toBe(1);
    expect(retrievability(card, at(1))).toBeCloseTo(Math.exp(-1 / 5), 12);
    expect(retrievability(card, at(5))).toBeCloseTo(Math.exp(-1), 12);
  });

  it('钉住 now 早于 last_review 时 elapsed 夹到 0 ⇒ R=1（不出现 R>1）', () => {
    expect(retrievability(card, at(-100))).toBe(1);
  });

  it('钉住 last_review 为 null 时回落用 due 作基准（本卡 due = NOW+4d ⇒ at(5) 只算 1 天）', () => {
    const c = cardFromJson(JSON.stringify({ ...JSON.parse(MATURE_JSON), last_review: null }));
    expect(retrievability(c, at(4))).toBe(1);
    expect(retrievability(c, at(5))).toBeCloseTo(Math.exp(-1 / 5), 12);
  });
});

describe('fsrs.retrievabilityPowerLaw — 与 ts-fsrs DECAY=-0.5 / FACTOR=19/81 同式', () => {
  const card = cardFromJson(MATURE_JSON);

  it('钉住 (1 + t·(19/81)/S)^-0.5：t=0 ⇒ 1，t=1 ⇒ 0.977337546…', () => {
    expect(retrievabilityPowerLaw(card, NOW)).toBe(1);
    expect(retrievabilityPowerLaw(card, at(1))).toBeCloseTo(0.977337546216906, 12);
  });

  it('钉住 t=5、S=5 时幂律恰为 0.9 = REVIEW_THRESHOLD（指数式此处只有 0.3679）', () => {
    expect(retrievabilityPowerLaw(card, at(5))).toBeCloseTo(0.9, 12);
    expect(REVIEW_THRESHOLD).toBe(0.9);
    expect(retrievability(card, at(5))).toBeCloseTo(0.367879441171442, 12);
  });
});

describe('fsrs.buildTodayQueue — 入队条件与排序', () => {
  const stale = JSON.stringify({
    ...JSON.parse(MATURE_JSON),
    state: 3,
    last_review: '2026-01-01T12:00:00.000Z',
    due: '2026-01-06T12:00:00.000Z',
  });
  const mid = JSON.stringify({
    ...JSON.parse(MATURE_JSON),
    state: 3,
    last_review: '2026-02-25T12:00:00.000Z',
    due: '2026-03-02T12:00:00.000Z',
  });

  it('钉住 R<0.9 才入队、按 R 升序，且 New(state=0) 卡无条件入队', () => {
    const list = buildTodayQueue(
      [
        { word: 'newcard', cardJson: cardToJson(createDefaultCard(NOW)) },
        { word: 'fresh', cardJson: MATURE_JSON },
        { word: 'stale', cardJson: stale },
        { word: 'mid', cardJson: mid },
      ],
      NOW,
    );
    // 'fresh' 的 last_review === now ⇒ R=1 ≥ 0.9，被排除；
    // 'newcard' state=0 恒入队，尽管它此刻 R=1 ⇒ 排序落在最后。
    const freshJson = cardToJson(createDefaultCard(NOW));
    expect(list.map((i) => i.word)).toEqual(['stale', 'mid', 'newcard']);
    expect(list.map((i) => i.elapsedDays)).toEqual([59, 4, 0]);
    // 升序口径：R 单调不减（最该复习的排最前）。
    const r = list.map((i) => i.retrievability);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
    expect(r.at(-1)).toBe(1);
    expect(list.at(-1)?.cardJson).toBe(freshJson);
  });
});

describe('fsrs.applyRating — ts-fsrs 5.0 更新结果（确定性钉值）', () => {
  it('钉住老卡 Good(3)：S 不变、D 递减、due=now+6d、reps+1、state=2', () => {
    const next = cardToJson(applyRating(cardFromJson(MATURE_JSON), 3, NOW));
    expect(JSON.parse(next)).toEqual({
      due: '2026-03-07T12:00:00.000Z',
      stability: 5,
      difficulty: 6.23608271,
      elapsed_days: 0,
      scheduled_days: 6,
      reps: 5,
      lapses: 1,
      state: 2,
      last_review: '2026-03-01T12:00:00.000Z',
    });
    expect(next).toBe(cardToJson(applyRating(cardFromJson(MATURE_JSON), 3, NOW)));
  });

  it('钉住 New 卡被评分后 init 参数覆写默认 S/D（Good(3) ⇒ S=3.173、D≈5.2824、state=1 学习步）', () => {
    const card = createDefaultCard(NOW);
    expect(card.stability).toBe(1);
    const good = applyRating(card, 3, NOW);
    expect(JSON.parse(cardToJson(good))).toEqual({
      due: '2026-03-01T12:10:00.000Z',
      stability: 3.173,
      difficulty: 5.28243442,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      last_review: '2026-03-01T12:00:00.000Z',
    });
    // 回归防护：createDefaultCard 的 S=1/D=5 只是占位，首次评分即被 init_stability/init_difficulty 覆写。
    expect(applyRating(card, 4, NOW).stability).toBe(15.69105);
    expect(applyRating(card, 1, NOW).lapses).toBe(0);
  });
});
