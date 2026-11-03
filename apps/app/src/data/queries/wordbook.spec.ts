/**
 * A-40 #49（T-14b 判据①②）：词本**读侧**容错。
 *
 * 缺陷原文（`04-adjudications.md` A-40 第 49 行）：65 字符的词在 `WordbookEntrySchema` /
 * `WordbookArraySchema`（裸数组与 `{data:[…]}` 两种形）/ `WordbookPullResultSchema` 上四条
 * `safeParse` 全 false ⇒ 一本里只要有一个旧的 65-100 字符词，整页 `BAD_RESPONSE`；
 * `pull` 还会在全量解析失败后静默 fall-through 成"只有 version 的半形"。
 * 本文件钉的是**修复后**的三条判据：
 *  ① 逐条分流：超长词/形状不合的词**保留并正常展示**，不拖垮整批；
 *  ② `pull` 的半形要么退回全量重取、要么显式报错，**绝不静默返回空**；
 *  ③ 反永真：整批真的不是数组时仍判 `BAD_RESPONSE`（容错不是"什么都收"）。
 *
 * 这里**不放宽契约**（`WordbookEntrySchema` 的 64 字上限是写侧口径，owner T-03）：
 * 超长词走的正是 `safeParse` 失败后的分流分支，所以 `report.salvaged` 必须 > 0。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORD_MAX_LENGTH, WORDBOOK_MAX_ENTRIES, type WordbookEntryDto } from '@tm/shared';
import { isApiError } from '../rest-fetcher.js';
import { TOKEN_KEY } from '../../native/bridge.js';
import {
  lastWordbookListRead,
  pullWordbook,
  readPullPayload,
  readWordbookList,
  wordbookQueryOptions,
} from './wordbook.js';

/** 旧的 `PUT` 面放行到 100 个字符（R-03⑦ 兼容矩阵），所以读侧可能遇到 65…100。 */
const LONG_WORD = 'u'.repeat(WORD_MAX_LENGTH + 1); // 65：契约不收的最小反例
const LEGACY_MAX_WORD = 'v'.repeat(100); // 100：旧写侧上限，读侧同样得吃
const CLEAN_WORD = 'serendipity';

interface FetchCall {
  url: string;
}

let calls: FetchCall[] = [];

/** 按顺序回带响应；用尽后重复最后一个（多数用例只需要一份载荷）。 */
function stubFetch(...bodies: Array<{ status?: number; body: unknown }>): void {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input) });
      void init;
      const entry = bodies[Math.min(i, bodies.length - 1)] ?? { body: null };
      i += 1;
      return new Response(JSON.stringify(entry.body), {
        status: entry.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

const snapshot = (...entries: unknown[]): { data: unknown[] } => ({ data: entries });

async function runListQuery(): Promise<WordbookEntryDto[]> {
  const options = wordbookQueryOptions();
  const queryFn = options.queryFn;
  expect(queryFn).toBeTypeOf('function');
  return (await queryFn?.({ queryKey: options.queryKey } as never)) as WordbookEntryDto[];
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, 't-14b-token');
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('A-40 #49① 整批逐条分流：一个超长词不得拖垮整页', () => {
  it('前置事实：65 字符词在契约上仍然判 false（读侧容错不等于放宽契约）', () => {
    expect(LONG_WORD.length).toBe(65);
    expect(readWordbookList(snapshot({ word: CLEAN_WORD })).report.salvaged).toBe(0);
  });

  it('`{data:[…]}` 快照里含一个 65 字符词条 ⇒ 解析成功，两条都在，超长词原样保留', () => {
    const { entries, report } = readWordbookList(
      snapshot({ word: CLEAN_WORD, addedAt: 1_700_000_000_000 }, { word: LONG_WORD, addedAt: 1 }),
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.word)).toEqual([CLEAN_WORD, LONG_WORD]);
    expect(entries[1]!.word.length).toBeGreaterThan(WORD_MAX_LENGTH);
    expect(report).toEqual({ salvaged: 1, dropped: 0, total: 2 });
  });

  it('裸数组快照与 100 字符（旧写侧上限）的词同样收', () => {
    const { entries, report } = readWordbookList([
      { word: LEGACY_MAX_WORD },
      { word: CLEAN_WORD, reviewCount: 3 },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.word).toBe(LEGACY_MAX_WORD);
    expect(report.salvaged).toBe(1);
  });

  it('形状不合但有词面（数值字段坏掉 / 带未知键）⇒ 保留展示，坏字段按缺省处理', () => {
    const { entries, report } = readWordbookList(
      snapshot({
        word: LONG_WORD,
        addedAt: 'not-a-timestamp',
        reviewCount: -2,
        legacyFlag: { star: true },
      }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.word).toBe(LONG_WORD);
    expect(entries[0]!.addedAt).toBeUndefined();
    expect(entries[0]!.reviewCount).toBeUndefined();
    // R-03⑦ 红线：未知键不得被静默丢弃
    expect(entries[0]!.legacyFlag).toEqual({ star: true });
    expect(report.salvaged).toBe(1);
  });

  it('取不出词面的那一条才被丢，其余照常，且计数可见（不静默）', () => {
    // `{word:'   '}` 在契约上是合法的（`min(1)` 不看空白）⇒ 读侧无权改判，只有非对象才丢。
    const { entries, report } = readWordbookList(
      snapshot({ word: CLEAN_WORD }, { word: '   ' }, null, 7),
    );
    expect(entries.map((e) => e.word)).toEqual([CLEAN_WORD, '   ']);
    expect(report).toEqual({ salvaged: 0, dropped: 2, total: 4 });
    expect(lastWordbookListRead()).toEqual(report);
  });

  it('空白词面 + 超长词并存：超长走 salvaged、空白走契约合法分支，两条都上屏', () => {
    const { entries, report } = readWordbookList(
      snapshot({ word: '   ' }, { word: LONG_WORD }, 'not-an-object'),
    );
    expect(entries.map((e) => e.word)).toEqual(['   ', LONG_WORD]);
    expect(report).toEqual({ salvaged: 1, dropped: 1, total: 3 });
  });

  it('经真实出口（`wordbookQueryOptions().queryFn` + fetch）：含超长词的快照解析成功而不是整页报错', async () => {
    stubFetch({
      body: snapshot({ word: CLEAN_WORD, addedAt: 1 }, { word: LONG_WORD, addedAt: 2 }),
    });
    const entries = await runListQuery();
    expect(entries).toHaveLength(2);
    expect(entries[1]!.word).toBe(LONG_WORD);
    expect(lastWordbookListRead().salvaged).toBe(1);
    expect(calls[0]!.url).toContain('/api/wordbook');
  });

  it('判据③ 反永真：响应连数组都不是 ⇒ 仍判 BAD_RESPONSE（容错≠什么都收）', async () => {
    stubFetch({ body: { message: '不是词本载荷' } });
    await expect(runListQuery()).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === 'BAD_RESPONSE',
    );
  });

  it(`条数越出 WORDBOOK_MAX_ENTRIES（${WORDBOOK_MAX_ENTRIES}）⇒ 整批显式报错，不截断后静默`, async () => {
    const tooMany = new Array(WORDBOOK_MAX_ENTRIES + 1).fill({ word: CLEAN_WORD });
    expect(() => readWordbookList({ data: tooMany })).toThrowError();
    try {
      readWordbookList({ data: tooMany });
    } catch (error) {
      expect(isApiError(error) && error.code).toBe('BAD_RESPONSE');
    }
  });
});

describe('A-40 #49② pull：半形不得静默返回空', () => {
  it('前置事实：全量快照里有一个 65 字符词时，严格契约仍然不收 ⇒ 分流后照旧拿到 entries', () => {
    const read = readPullPayload({
      version: 9,
      updatedAt: 10,
      entries: [{ word: CLEAN_WORD }, { word: LONG_WORD }],
    });
    expect(read.kind).toBe('full');
    expect(read.shape?.entries?.map((e) => e.word)).toEqual([CLEAN_WORD, LONG_WORD]);
    expect(read.shape?.version).toBe(9);
  });

  it('增量形状 `{version,updatedAt,changed,removed}`：超长词与删除词都保留', () => {
    const read = readPullPayload({
      version: 12,
      updatedAt: 13,
      changed: [{ word: LONG_WORD }, { word: CLEAN_WORD }],
      removed: [LEGACY_MAX_WORD, '', 42],
    });
    expect(read.kind).toBe('incremental');
    expect(read.shape?.changed?.map((e) => e.word)).toEqual([LONG_WORD, CLEAN_WORD]);
    expect(read.shape?.removed).toEqual([LEGACY_MAX_WORD]);
  });

  it('只有 `{version,updatedAt}` 的半形 + 带 since ⇒ 退回全量重取一次并交出 entries', async () => {
    stubFetch({ body: { version: 21, updatedAt: 22 } }, {
      body: { version: 21, updatedAt: 22, entries: [{ word: CLEAN_WORD }, { word: LONG_WORD }] },
    });
    const shape = await pullWordbook(20);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain('since=20');
    expect(calls[1]!.url).not.toContain('since=');
    expect(shape.version).toBe(21);
    expect(shape.entries?.map((e) => e.word)).toEqual([CLEAN_WORD, LONG_WORD]);
  });

  it('半形到底（两次都认不出来）⇒ 显式抛 BAD_RESPONSE，绝不返回"无数据也无错误"', async () => {
    stubFetch({ body: { version: 21, updatedAt: 22 } });
    await expect(pullWordbook(20)).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === 'BAD_RESPONSE',
    );
    expect(calls).toHaveLength(2);
  });

  it('不带 since（本来就是全量请求）拿到半形 ⇒ 一次即报错，不再重复打', async () => {
    stubFetch({ body: { version: 21, updatedAt: 22 } });
    await expect(pullWordbook()).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === 'BAD_RESPONSE',
    );
    expect(calls).toHaveLength(1);
  });

  it('非对象/缺 version 的载荷 ⇒ 认不出来，且 pull 走同样的报错口径', async () => {
    expect(readPullPayload(null).kind).toBe('unknown');
    expect(readPullPayload('pull').kind).toBe('unknown');
    expect(readPullPayload({ updatedAt: 1 }).kind).toBe('unknown');
    stubFetch({ body: 'pull' });
    await expect(pullWordbook()).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.code === 'BAD_RESPONSE',
    );
  });
});
