/**
 * Assessment Agent 工具：自适应测评题目生成与评分
 *
 * 题型：
 *  - choice（四选一）
 *  - fill（选词填空）
 *  - spelling（拼写题）
 *
 * 根据单词 FSRS difficulty 决定题型难度：
 *  - D < 4：简单（choice 为主）
 *  - 4 <= D <= 7：中等（choice + fill）
 *  - D > 7：困难（fill + spelling）
 *
 * 评分映射（任务 1-5 档 → ts-fsrs Rating 1-4）：
 *  - 5 Perfect  → 4 (Easy)
 *  - 4 Good     → 3 (Good)
 *  - 3 Hard     → 2 (Hard)
 *  - 2 Lapse    → 1 (Again)
 *  - 1 Blackout → 1 (Again)
 */

import { z } from 'zod';
import type { LlmRouter } from './llm-router.js';

/** 题目类型 */
export type AssessmentQuestionType = 'choice' | 'fill' | 'spelling';

/** 用户作答评分档位（任务定义 1-5） */
export type AssessmentScore = 1 | 2 | 3 | 4 | 5;

export const AssessmentQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    word: z.string(),
    prompt: z.string().describe('题干（英文句子或提示）'),
    options: z.array(z.string()).length(4).describe('四个选项'),
    answerIndex: z.number().int().min(0).max(3).describe('正确答案下标'),
    explanation: z.string().describe('答案解析（含中文）'),
  }),
  z.object({
    type: z.literal('fill'),
    word: z.string(),
    sentence: z.string().describe('含 ___ 空格的句子'),
    answer: z.string().describe('正确答案（单词原形或变形）'),
    hint: z.string().describe('提示（首字母或中文释义）'),
    explanation: z.string().describe('答案解析（含中文）'),
  }),
  z.object({
    type: z.literal('spelling'),
    word: z.string(),
    phonetic: z.string().optional().describe('音标'),
    definition: z.string().describe('中文释义'),
    answer: z.string().describe('正确拼写'),
    explanation: z.string().describe('讲解（词根/易错点）'),
  }),
]);

export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;

/** 按 FSRS difficulty 选题型 */
export function pickQuestionType(difficulty: number): AssessmentQuestionType {
  const d = difficulty;
  if (d < 4) return 'choice';
  if (d <= 7) return d < 5.5 ? 'choice' : 'fill';
  return Math.random() < 0.5 ? 'fill' : 'spelling';
}

/** 生成单道题（LLM structured output；无 LLM 时规则降级） */
export async function generateQuestion(
  router: LlmRouter,
  word: string,
  type: AssessmentQuestionType,
  extra: { definition?: string; phonetic?: string; cefrLevel?: string } = {},
): Promise<AssessmentQuestion> {
  const runnable = router.createStructured('strong', AssessmentQuestionSchema);
  if (runnable) {
    const result = await runnable.invoke([
      {
        role: 'system',
        content:
          '你是英语测评出题老师。为给定单词生成一道题目，输出 JSON。' +
          'type 必须是 ' + type + '。' +
          '难度适配用户 CEFR 水平 ' + (extra.cefrLevel ?? 'B1') + '。' +
          '题目应考察真实理解而非死记硬背。',
      },
      {
        role: 'user',
        content: `单词: ${word}\n释义: ${extra.definition ?? ''}\n音标: ${extra.phonetic ?? ''}`,
      },
    ]);
    const parsed = AssessmentQuestionSchema.safeParse(result);
    if (parsed.success) return parsed.data;
    throw new Error('Assessment structured output 解析失败: ' + JSON.stringify(parsed.error.issues));
  }
  return fallbackQuestion(word, type, extra);
}

/** 规则降级题目（无 LLM Key 时） */
export function fallbackQuestion(
  word: string,
  type: AssessmentQuestionType,
  extra: { definition?: string; phonetic?: string } = {},
): AssessmentQuestion {
  const def = extra.definition || word;
  if (type === 'choice') {
    return {
      type: 'choice',
      word,
      prompt: `选择 "${word}" 的正确释义：`,
      options: [def, '释义 A', '释义 B', '释义 C'],
      answerIndex: 0,
      explanation: `“${word}” 的释义是「${def}」。`,
    };
  }
  if (type === 'fill') {
    return {
      type: 'fill',
      word,
      sentence: `The word "${word}" means ___.`,
      answer: def,
      hint: def.slice(0, 2),
      explanation: `“${word}” 意为「${def}」。`,
    };
  }
  return {
    type: 'spelling',
    word,
    phonetic: extra.phonetic,
    definition: def,
    answer: word,
    explanation: `请正确拼写单词 ${word}。`,
  };
}

/** 校验用户答案，返回 1-5 分档（含犹豫/修改等信号） */
export function gradeAnswer(
  question: AssessmentQuestion,
  userAnswer: string | number,
  signals: { hesitated?: boolean; modified?: boolean } = {},
): { score: AssessmentScore; correct: boolean; correctAnswer: string } {
  let correct = false;
  let correctAnswer = '';

  if (question.type === 'choice') {
    correctAnswer = question.options[question.answerIndex] ?? '';
    correct = typeof userAnswer === 'number' && userAnswer === question.answerIndex;
  } else {
    correctAnswer = question.answer;
    correct =
      typeof userAnswer === 'string' &&
      userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
  }

  let score: AssessmentScore;
  if (correct) {
    if (signals.hesitated) score = 4; // 正确但犹豫 → Good
    else if (signals.modified) score = 3; // 正确但有修改 → Hard
    else score = 5; // 完全正确快速 → Perfect
  } else {
    score = signals.modified ? 2 : 1; // 看过答案后记得 → Lapse；完全不会 → Blackout
  }
  return { score, correct, correctAnswer };
}

/** 1-5 档 → ts-fsrs Rating（1=Again 2=Hard 3=Good 4=Easy） */
export function scoreToFsrsRating(score: AssessmentScore): 1 | 2 | 3 | 4 {
  switch (score) {
    case 5:
      return 4;
    case 4:
      return 3;
    case 3:
      return 2;
    case 2:
      return 1;
    case 1:
      return 1;
  }
}

export const SCORE_LABEL: Record<AssessmentScore, string> = {
  5: 'Perfect（完全正确）',
  4: 'Good（正确，稍有犹豫）',
  3: 'Hard（正确，有修改）',
  2: 'Lapse（看过答案后记得）',
  1: 'Blackout（完全不会）',
};
