/**
 * 单词详情页（Phase 6：ISR 高频词预渲染）
 *
 * - generateStaticParams 预渲染高频词（静态生成）
 * - revalidate=3600：每小时增量再验证（ISR）
 * - 长尾词首次访问时按需生成
 */

import type { Metadata } from 'next';
import { WordLookup } from '@/components/word-lookup';

// 高频词表（前 200 常用词，stardict 均有词条）
const HIGH_FREQ_WORDS = [
  'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it', 'that', 'for', 'they', 'with',
  'as', 'not', 'on', 'she', 'at', 'by', 'this', 'we', 'you', 'do', 'but', 'from', 'or', 'which',
  'one', 'would', 'all', 'will', 'there', 'say', 'who', 'make', 'when', 'can', 'more', 'if',
  'no', 'man', 'out', 'other', 'so', 'what', 'time', 'up', 'go', 'about', 'than', 'into',
  'could', 'state', 'only', 'new', 'year', 'some', 'take', 'come', 'these', 'know', 'see',
  'use', 'get', 'like', 'then', 'first', 'any', 'work', 'now', 'may', 'such', 'give', 'over',
  'think', 'most', 'even', 'find', 'day', 'also', 'after', 'way', 'many', 'must', 'look',
  'before', 'great', 'back', 'through', 'long', 'where', 'much', 'should', 'well', 'people',
  'down', 'own', 'just', 'because', 'good', 'each', 'those', 'feel', 'seem', 'how', 'high',
  'too', 'place', 'little', 'world', 'very', 'still', 'nation', 'hand', 'old', 'life', 'tell',
  'write', 'become', 'here', 'show', 'house', 'both', 'between', 'need', 'mean', 'call',
  'develop', 'under', 'last', 'right', 'move', 'thing', 'general', 'school', 'never', 'same',
  'another', 'begin', 'while', 'number', 'part', 'turn', 'real', 'leave', 'might', 'want',
  'point', 'form', 'off', 'child', 'few', 'small', 'since', 'against', 'ask', 'late', 'home',
  'interest', 'large', 'person', 'end', 'open', 'public', 'follow', 'during', 'present',
  'without', 'again', 'hold', 'govern', 'around', 'possible', 'head', 'consider', 'word',
  'program', 'problem', 'however', 'lead', 'system', 'set', 'order', 'eye', 'plan', 'run',
  'keep', 'face', 'fact', 'group', 'play', 'stand', 'increase', 'early', 'course', 'change',
  'help', 'line',
];

export const revalidate = 3600; // ISR：1 小时增量再验证

export function generateStaticParams(): Array<{ word: string }> {
  return HIGH_FREQ_WORDS.map((word) => ({ word }));
}

export async function generateMetadata({ params }: { params: Promise<{ word: string }> }): Promise<Metadata> {
  const { word } = await params;
  return { title: `${word} - 明日记忆` };
}

export default async function WordPage({ params }: { params: Promise<{ word: string }> }): Promise<React.JSX.Element> {
  const { word } = await params;
  return <WordLookup word={word} />;
}
