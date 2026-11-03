/**
 * `packages/agent/src/nodes/orchestrator.ts` 两颗纯 helper 的真测（E4c-ii 件②）。
 *
 * 只覆盖 `heuristicIntent` / `hasClearIntent`（无 LLM、无依赖注入的纯函数降级路径）。
 * ⛔ 不测 `makeOrchestratorNode`：`:118` 的 `interrupt()` 在编译图外会抛，
 * `:129-142` 还可能把中断信号原样重抛 ⇒ 那是图运行时行为，不是这颗 helper 的语义。
 * 零网络 / 零 LLM 调用 / 零 DB / 零 Qdrant；两颗 helper 内部无 `new Date()`，不碰真实时钟。
 */

import { describe, expect, it } from 'vitest';
import { hasClearIntent, heuristicIntent } from '../src/nodes/orchestrator.js';

describe('orchestrator.heuristicIntent — 意图分支与优先级', () => {
  it('钉住 assess 支要"关键词 + 拉丁词"同时成立，且从 `<数字>分` 抽 rating', () => {
    expect(heuristicIntent('考我 apple 我答 3 分')).toEqual({
      intent: 'assess',
      word: 'apple',
      rating: 3,
    });
    // `分` 前的空格可有可无（\s* 允许零宽）。
    expect(heuristicIntent('考我 apple 我答5分').rating).toBe(5);
  });

  it('钉住 assess 支的隐藏门槛：无拉丁词时整支跳过，一路掉到默认 lookup', () => {
    // '考我' / '测评' 都命中 assess 关键词，但 extractWord 拿不到词 ⇒ 不进 assess。
    expect(heuristicIntent('考我 3 分')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('测评')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('测验单词')).toEqual({ intent: 'lookup' });
  });

  it('钉住 review 优先于 report（两词都在时按源码书写顺序取胜）', () => {
    expect(heuristicIntent('复习分析')).toEqual({ intent: 'review', word: undefined });
    expect(heuristicIntent('分析复习')).toEqual({ intent: 'review', word: undefined });
    expect(heuristicIntent('学习 abc 分析')).toEqual({ intent: 'report', word: 'abc' });
  });

  it('钉住 rating 只在 assess 支被抽取：review 支里的 "3 分" 被丢弃', () => {
    expect(heuristicIntent('复习 review 3 分')).toEqual({ intent: 'review', word: 'review' });
  });

  it('钉住 lookup 支：查/翻译/意思 类关键词带词走 lookup', () => {
    expect(heuristicIntent('查 abandon')).toEqual({ intent: 'lookup', word: 'abandon' });
    expect(heuristicIntent('abandon 是什么意思')).toEqual({ intent: 'lookup', word: 'abandon' });
  });

  it('钉住 learn 支关键词与"整句即单词"的兜底', () => {
    expect(heuristicIntent('教我 zzz')).toEqual({ intent: 'learn', word: 'zzz' });
    expect(heuristicIntent('记忆')).toEqual({ intent: 'learn', word: undefined });
    // 无关键词时：纯单词输入 ⇒ text.trim() === word ⇒ learn（大小写归一后才相等）。
    expect(heuristicIntent('Hello')).toEqual({ intent: 'learn', word: 'hello' });
    expect(heuristicIntent('HELLO')).toEqual({ intent: 'learn', word: 'hello' });
    // 句子里嵌单词：命中 extractWord 但整句不等于该词 ⇒ 走最后的默认支（有词 → learn）。
    expect(heuristicIntent('i 想 learn')).toEqual({ intent: 'learn', word: 'learn' });
  });

  it('钉住默认支尾：无词且无关键词 ⇒ lookup（含空串）', () => {
    expect(heuristicIntent('')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('  ')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('review please')).toEqual({ intent: 'learn', word: 'review' });
  });
});

describe('orchestrator 词元正则 `[a-zA-Z][a-zA-Z\'-]{1,63}` 的边界', () => {
  it('钉住单字母词不落 word（最短 2 字符）', () => {
    expect(heuristicIntent('x')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('a')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('ab')).toEqual({ intent: 'learn', word: 'ab' });
  });

  it('钉住首字母后必须是字母/连字符/撇号：数字截断词元', () => {
    expect(heuristicIntent('B1')).toEqual({ intent: 'lookup' });
    expect(heuristicIntent('bb12')).toEqual({ intent: 'learn', word: 'bb' });
    expect(heuristicIntent('90 分')).toEqual({ intent: 'lookup' });
  });

  it('钉住连字符/撇号属词元、空白与标点截断，且取第一个匹配并小写化', () => {
    expect(heuristicIntent("help me with don't")).toEqual({ intent: 'learn', word: 'help' });
    expect(heuristicIntent('abc-def')).toEqual({ intent: 'learn', word: 'abc-def' });
    expect(heuristicIntent('hello,')).toEqual({ intent: 'learn', word: 'hello' });
    expect(heuristicIntent('a-')).toEqual({ intent: 'learn', word: 'a-' });
  });
});

describe('orchestrator.hasClearIntent — 关键词表（不含裸单词）', () => {
  it('钉住裸拉丁词不算明确意图（交 interrupt/LLM 那条路，本文件不测）', () => {
    expect(hasClearIntent('abandon')).toBe(false);
    expect(hasClearIntent('today is fine')).toBe(false);
    expect(hasClearIntent('')).toBe(false);
  });

  it('钉住关键词命中', () => {
    for (const text of ['复习', '考我', '分析', '教', '意思', '打分', '进度', '我要学习']) {
      expect(hasClearIntent(text)).toBe(true);
    }
  });

  it('钉住 hasClearIntent 与 heuristicIntent 的口径差：关键词命中 ≠ 意图分支命中', () => {
    // '测评'/'打分' 在关键词表里，但因缺拉丁词，启发式最终仍落到 lookup。
    expect(hasClearIntent('打分')).toBe(true);
    expect(heuristicIntent('打分')).toEqual({ intent: 'lookup' });
  });
});
