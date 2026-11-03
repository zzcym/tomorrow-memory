/**
 * `packages/agent/src/tools/assessment.ts` 的纯函数真测（E4c-ii 件②）。
 *
 * 零网络 / 零 LLM 调用 / 零 DB / 零 Qdrant：只 import 被测模块本身，
 * `generateQuestion`（唯一会碰 LlmRouter 的入口）不在本文件覆盖范围内。
 * 不依赖真实时钟：模块内无 `new Date()` 调用路径，故无 `now` 需要显式传入。
 */

import { describe, expect, it } from 'vitest';
import {
  AssessmentQuestionSchema,
  fallbackQuestion,
  gradeAnswer,
  pickQuestionType,
  scoreToFsrsRating,
  type AssessmentQuestion,
  type AssessmentScore,
} from '../src/tools/assessment.js';

const choice: AssessmentQuestion = {
  type: 'choice',
  word: 'abandon',
  prompt: 'pick one',
  options: ['a0', 'b1', 'c2', 'd3'],
  answerIndex: 2,
  explanation: 'x',
};
const fill: AssessmentQuestion = {
  type: 'fill',
  word: 'abandon',
  sentence: 'The x ___.',
  answer: 'quit',
  hint: 'q',
  explanation: 'x',
};
const spelling: AssessmentQuestion = {
  type: 'spelling',
  word: 'abandon',
  definition: 'give up',
  answer: 'abandon',
  explanation: 'x',
};

describe('assessment.gradeAnswer — 对/错 × 犹豫/修改 → 1-5 档', () => {
  it('钉住：choice 命中 answerIndex 且无信号 ⇒ 5（Perfect）', () => {
    // correctAnswer 取 options[answerIndex]，不是 userAnswer 本身。
    expect(gradeAnswer(choice, 2)).toEqual({ score: 5, correct: true, correctAnswer: 'c2' });
  });

  it('钉住：else-if 顺序 ⇒ hesitated 优先于 modified（两信号同时给只降一档到 4）', () => {
    expect(gradeAnswer(choice, 2, { hesitated: true })).toEqual({
      score: 4,
      correct: true,
      correctAnswer: 'c2',
    });
    expect(gradeAnswer(choice, 2, { modified: true })).toEqual({
      score: 3,
      correct: true,
      correctAnswer: 'c2',
    });
    // 回归防护：若哪天把两个分支调序，这一条会先红。
    expect(gradeAnswer(choice, 2, { hesitated: true, modified: true }).score).toBe(4);
  });

  it('钉住：错答 ⇒ modified 才给 2（Lapse），否则 1（Blackout）', () => {
    expect(gradeAnswer(choice, 0)).toEqual({ score: 1, correct: false, correctAnswer: 'c2' });
    expect(gradeAnswer(choice, 0, { modified: true })).toEqual({
      score: 2,
      correct: false,
      correctAnswer: 'c2',
    });
    // 错答时 hesitated 不参与分档（源码里 else 支只看 modified）。
    expect(gradeAnswer(choice, 0, { hesitated: true }).score).toBe(1);
  });

  it('钉住：choice 只认 number 下标，字符串 "2" 判错', () => {
    expect(gradeAnswer(choice, '2')).toEqual({ score: 1, correct: false, correctAnswer: 'c2' });
  });

  it('钉住：fill / spelling 走 trim + toLowerCase 文本比对', () => {
    expect(gradeAnswer(fill, '  QUIT ')).toEqual({ score: 5, correct: true, correctAnswer: 'quit' });
    expect(gradeAnswer(fill, 'nope')).toEqual({ score: 1, correct: false, correctAnswer: 'quit' });
    expect(gradeAnswer(fill, 'nope', { modified: true })).toEqual({
      score: 2,
      correct: false,
      correctAnswer: 'quit',
    });
    // 非字符串作答（下标）对文本题型一律判错 —— 与 choice 支的对称约定。
    expect(gradeAnswer(fill, 3).correct).toBe(false);
    expect(gradeAnswer(spelling, 'Abandon  ').correct).toBe(true);
  });
});

describe('assessment.scoreToFsrsRating — 1-5 档 → Rating 1-4', () => {
  it('钉住完整映射表（含 1 与 2 都落到 Again=1 的合流）', () => {
    const scores: AssessmentScore[] = [1, 2, 3, 4, 5];
    expect(scores.map(scoreToFsrsRating)).toEqual([1, 1, 2, 3, 4]);
  });
});

describe('assessment.pickQuestionType — difficulty → 题型（只钉确定支）', () => {
  it('钉住 d < 4 恒为 choice', () => {
    expect(pickQuestionType(0)).toBe('choice');
    expect(pickQuestionType(3.99)).toBe('choice');
  });

  it('钉住 4 <= d <= 7 内的 5.5 分界：5.49 choice / 5.5 fill / 7 仍是 fill', () => {
    expect(pickQuestionType(4)).toBe('choice');
    expect(pickQuestionType(5.49)).toBe('choice');
    expect(pickQuestionType(5.5)).toBe('fill');
    expect(pickQuestionType(6)).toBe('fill');
    // d === 7 属 `d <= 7` 的中段，不是随机段 —— 边界若写成 `< 7` 就会掉进 Math.random 支。
    expect(pickQuestionType(7)).toBe('fill');
  });
  // d > 7 走 `Math.random() < 0.5` ⇒ 不可钉，本文件刻意不覆盖（A-94 零随机口径）。
});

describe('assessment.fallbackQuestion — 规则降级题', () => {
  it('钉住三种题型都能构造出通过 AssessmentQuestionSchema 的题', () => {
    for (const type of ['choice', 'fill', 'spelling'] as const) {
      const q = fallbackQuestion('abandon', type);
      expect(AssessmentQuestionSchema.safeParse(q).success).toBe(true);
      expect(q.word).toBe('abandon');
    }
  });

  it('钉住 choice 的 options 恒为 4 且正确答案在 index 0，definition 缺省时回落为 word 本身', () => {
    const q = fallbackQuestion('abandon', 'choice');
    if (q.type !== 'choice') throw new Error('fallback choice 题型漂移');
    expect(q.options).toHaveLength(4);
    expect(q.answerIndex).toBe(0);
    expect(q.options[0]).toBe('abandon');
    const withDef = fallbackQuestion('abandon', 'choice', { definition: 'give up' });
    if (withDef.type !== 'choice') throw new Error('fallback choice 题型漂移');
    expect(withDef.options[0]).toBe('give up');
  });

  it('钉住 fill 的 hint 取 definition 前 2 字符、spelling 的 answer 即原词且 phonetic 透传', () => {
    const f = fallbackQuestion('abandon', 'fill', { definition: 'give up' });
    if (f.type !== 'fill') throw new Error('fallback fill 题型漂移');
    expect(f.answer).toBe('give up');
    expect(f.hint).toBe('gi');
    const s = fallbackQuestion('abandon', 'spelling', { phonetic: '/a/' });
    if (s.type !== 'spelling') throw new Error('fallback spelling 题型漂移');
    expect(s.answer).toBe('abandon');
    expect(s.phonetic).toBe('/a/');
  });
});

describe('assessment.AssessmentQuestionSchema — discriminated union 校验面', () => {
  it('钉住三种合法题都通过', () => {
    for (const q of [choice, fill, spelling]) {
      expect(AssessmentQuestionSchema.safeParse(q).success).toBe(true);
    }
  });

  it('钉住 choice 的 options 长度必须恰好 4（3 与 5 都拒）', () => {
    expect(AssessmentQuestionSchema.safeParse({ ...choice, options: ['a', 'b', 'c'] }).success).toBe(
      false,
    );
    expect(
      AssessmentQuestionSchema.safeParse({ ...choice, options: ['a', 'b', 'c', 'd', 'e'] }).success,
    ).toBe(false);
  });

  it('钉住 answerIndex 越界（4）与未知 type 都拒', () => {
    expect(AssessmentQuestionSchema.safeParse({ ...choice, answerIndex: 4 }).success).toBe(false);
    expect(AssessmentQuestionSchema.safeParse({ ...choice, type: 'match' }).success).toBe(false);
  });

  it('钉住 fill 缺 answer / hint 时拒（必填字段不因降级而放宽）', () => {
    expect(
      AssessmentQuestionSchema.safeParse({ type: 'fill', word: 'w', sentence: 's' }).success,
    ).toBe(false);
  });
});
