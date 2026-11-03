/**
 * T-14 判据⑤（架构 §5.5 第 1 步 / R-20 ①⑤⑥）：离线写队列
 *  - 写失败（无网 / 弱网）时入队，本地不丢；
 *  - 恢复后**按序**补传，模拟 3 次重试（`MAX_FLUSH_ATTEMPTS`）；
 *  - 补传期间用户又写 → 新一轮的 seq 更大，本轮不误清（R-20⑥）；
 *  - 409 `WORDBOOK_STALE` 采纳服务端快照后同批重放（§4.4.1）；
 *  - 覆盖安装时旧手写版的 `tm.wbQueue` 迁移进来（R-20⑦ 要救的"静默丢词"）。
 *
 * `send` 是注入的假传输，不发真实请求；`wait` 注入后不等真实退避时长。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORDBOOK_PUSH_BATCH_MAX,
  type WordbookPushInputDto,
  type WordbookPushResultDto,
} from '@tm/shared';
import {
  MAX_FLUSH_ATTEMPTS,
  RETRY_BACKOFF_MS,
  SYNC_STATE_KEY,
  QueueWriteError,
  flushOfflineQueue,
  isQueueWriteError,
  loadState,
  migrateLegacyQueue,
  pendingCount,
  enqueueRemove,
  enqueueUpsert,
  saveState,
  type PushTransport,
} from '../src/data/offline-queue.js';
import { ApiError, isApiError } from '../src/data/rest-fetcher.js';
import { addWord, removeWord } from '../src/data/queries/wordbook.js';

const pushResult = (version: number): WordbookPushResultDto => ({
  ok: true,
  version,
  added: 0,
  merged: 0,
  removed: 0,
});

const networkError = (): ApiError => new ApiError('NETWORK', '', 0);

const staleError = (version: number, words: string[]): ApiError =>
  new ApiError('WORDBOOK_STALE', '', 409, {
    code: 'WORDBOOK_STALE',
    version,
    server: { entries: words.map((word) => ({ word })) },
  });

/** 记录每一批收到的载荷与调用顺序（深拷贝一份，否则重放时的原地改版本会盖掉历史）。 */
function recorder(behaviour: (call: number, batch: WordbookPushInputDto) => Promise<unknown>) {
  const batches: WordbookPushInputDto[] = [];
  const send: PushTransport = async (batch) => {
    batches.push({
      baseVersion: batch.baseVersion,
      entries: batch.entries.map((e) => ({ ...e })),
      removedWords: [...batch.removedWords],
    });
    const result = await behaviour(batches.length, batch);
    return result as WordbookPushResultDto;
  };
  return { batches, send };
}

const neverWaits = async (ms: number, seen: number[]): Promise<void> => {
  seen.push(ms);
};

beforeEach(() => {
  localStorage.clear();
});

describe('判据⑤-1 入队', () => {
  it('收藏/删除只写本地队列，不发请求；条数与载荷都在 localStorage 的同一份状态里', () => {
    addWord('Apple');
    enqueueUpsert('banana', { reviewCount: 2 });
    removeWord('apple');

    const raw = localStorage.getItem(SYNC_STATE_KEY);
    expect(raw).toBeTruthy();
    const state = JSON.parse(raw ?? '{}');
    expect(state.pendingRemovals).toEqual(['apple']);
    expect(state.pendingUpserts.map((e: { word: string }) => e.word)).toEqual(['banana']);
    // 规范化：`Apple` → `apple`；删除把先前那条 apple 的 upsert 顶掉（同词翻转），banana 仍在队列里
    expect(pendingCount()).toBe(2);
  });

  it('同词翻转按最后一次操作算（先收藏后删除 = 删除；先删除后收藏 = 收藏）', () => {
    enqueueUpsert('cat');
    enqueueRemove('cat');
    expect(loadState().pendingUpserts).toHaveLength(0);
    expect(loadState().pendingRemovals).toEqual(['cat']);

    enqueueUpsert('cat');
    expect(loadState().pendingRemovals).toEqual([]);
    expect(loadState().pendingUpserts.map((e) => e.word)).toEqual(['cat']);
  });
});

describe('判据⑤-2 恢复后按序补传', () => {
  it('一次成功：entries 按入队顺序发出，队列清空，版本推进', async () => {
    ['one', 'two', 'three'].forEach((w) => enqueueUpsert(w));
    enqueueRemove('gone');
    const { batches, send } = recorder(async () => pushResult(7));
    const waits: number[] = [];

    const result = await flushOfflineQueue(send, { wait: (ms) => neverWaits(ms, waits), now: () => 1 });

    expect(result).toMatchObject({ ok: true, attempts: 1, sentEntries: 3, sentRemovals: 1, remaining: 0, version: 7 });
    expect(batches[0]?.entries.map((e) => e.word)).toEqual(['one', 'two', 'three']);
    expect(batches[0]?.removedWords).toEqual(['gone']);
    expect(pendingCount()).toBe(0);
    expect(loadState().baseVersion).toBe(7);
    expect(waits).toEqual([]);
  });

  it('前两次网络失败、第三次成功 → 恰好消耗 3 次请求并走完退避（模拟 3 次重试）', async () => {
    enqueueUpsert('apple');
    const { batches, send } = recorder(async (call) => {
      if (call < 3) throw networkError();
      return pushResult(1);
    });
    const waits: number[] = [];

    const result = await flushOfflineQueue(send, { wait: (ms) => neverWaits(ms, waits) });

    expect(batches).toHaveLength(MAX_FLUSH_ATTEMPTS);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.remaining).toBe(0);
    expect(waits).toEqual([RETRY_BACKOFF_MS[0], RETRY_BACKOFF_MS[1]]);
  });

  it('3 次都失败 → 整批留在队列里（绝不"丢了再拉服务端"），下次恢复再补', async () => {
    enqueueUpsert('apple');
    enqueueRemove('pear');
    const failing = recorder(async () => {
      throw networkError();
    });
    const waits: number[] = [];

    const first = await flushOfflineQueue(failing.send, { wait: (ms) => neverWaits(ms, waits) });

    expect(first.ok).toBe(false);
    expect(first.attempts).toBe(MAX_FLUSH_ATTEMPTS);
    expect(first.remaining).toBe(2);
    expect(first.sentEntries).toBe(0);
    expect(pendingCount()).toBe(2);
    expect(isApiError(first.error)).toBe(true);

    const succeeding = recorder(async () => pushResult(3));
    const second = await flushOfflineQueue(succeeding.send, { wait: (ms) => neverWaits(ms, waits) });

    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(0);
    expect(succeeding.batches[0]?.entries.map((e) => e.word)).toEqual(['apple']);
    expect(succeeding.batches[0]?.removedWords).toEqual(['pear']);
    expect(loadState().baseVersion).toBe(3);
  });

  it('超过单批上限就分批，且批次之间仍按原顺序（500 条一批）', async () => {
    const total = WORDBOOK_PUSH_BATCH_MAX + 2;
    for (let i = 0; i < total; i += 1) enqueueUpsert(`w${String(i).padStart(4, '0')}`);
    let version = 100;
    const { batches, send } = recorder(async () => pushResult((version += 1)));

    const result = await flushOfflineQueue(send, { wait: async () => undefined, now: () => 1 });

    expect(batches).toHaveLength(2);
    expect(batches[0]?.entries).toHaveLength(WORDBOOK_PUSH_BATCH_MAX);
    expect(batches[1]?.entries).toHaveLength(2);
    expect(batches[0]?.entries[0]?.word).toBe('w0000');
    expect(batches[1]?.entries[0]?.word).toBe('w0500');
    expect(batches[1]?.baseVersion).toBe(101); // 第二批带上第一批推进后的版本
    expect(result.ok).toBe(true);
    expect(result.sentEntries).toBe(total);
    expect(pendingCount()).toBe(0);
  });
});

describe('判据⑤-3 补传期间继续写（R-20⑥ 的"不误清"）', () => {
  it('请求在飞的时候用户又收藏一个词 → 新词留在队列里等下一轮，不被本轮的成功清掉', async () => {
    enqueueUpsert('first');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const send: PushTransport = async (_batch) => {
      calls += 1;
      if (calls === 1) {
        await gate;
        return pushResult(11);
      }
      return pushResult(12);
    };

    const running = flushOfflineQueue(send, { wait: async () => undefined, now: () => 1 });
    await Promise.resolve();
    enqueueUpsert('second');
    release();
    const result = await running;

    expect(calls).toBe(2);
    expect(result.sentEntries).toBe(2);
    expect(result.version).toBe(12);
    expect(pendingCount()).toBe(0);
    expect(loadState().baseVersion).toBe(12);
  });
});

describe('判据⑤-4 409 WORDBOOK_STALE → 采纳快照后同批重放（§4.4.1）', () => {
  it('服务端已收的词由快照判定，载荷按 §4.4.1 **同批重放**（幂等），但带上刚采纳的版本', async () => {
    enqueueUpsert('alpha');
    enqueueUpsert('beta');
    const { batches, send } = recorder(async (call) => {
      if (call === 1) throw staleError(50, ['alpha']);
      return pushResult(51);
    });

    const result = await flushOfflineQueue(send, { wait: async () => undefined, now: () => 1 });

    expect(batches).toHaveLength(2);
    expect(batches[0]?.entries.map((e) => e.word)).toEqual(['alpha', 'beta']);
    expect(batches[0]?.baseVersion).toBe(0);
    expect(batches[1]?.entries.map((e) => e.word)).toEqual(['alpha', 'beta']);
    expect(batches[1]?.baseVersion).toBe(50);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(0);
    expect(loadState().baseVersion).toBe(51);
  });

  it('连续 409 时不会把队列清成一空（版本每轮跟进，最终仍失败就整批留着）', async () => {
    enqueueUpsert('alpha');
    const { batches, send } = recorder(async () => {
      throw staleError(90, []);
    });

    const result = await flushOfflineQueue(send, { wait: async () => undefined, now: () => 1 });

    expect(batches).toHaveLength(MAX_FLUSH_ATTEMPTS);
    expect(batches.map((b) => b.baseVersion)).toEqual([0, 90, 90]);
    expect(result.ok).toBe(false);
    expect(pendingCount()).toBe(1);
  });
});

describe('判据⑤-5 旧手写版队列迁移（覆盖安装不丢词）', () => {
  it('tm.wbQueue 里的 add/remove/clear 搬进新状态，旧键清空', () => {
    localStorage.setItem(
      'tm.wbQueue',
      JSON.stringify([
        { op: 'add', word: 'Legacy', at: 5, seq: 1 },
        { op: 'remove', word: 'gone', at: 6, seq: 2 },
      ]),
    );
    localStorage.setItem('tm.wbCache', JSON.stringify([{ word: 'old1' }, { word: 'old2' }]));

    const moved = migrateLegacyQueue();

    expect(moved).toBe(2);
    expect(loadState().pendingUpserts.map((e) => e.word)).toEqual(['legacy']);
    expect(loadState().pendingRemovals).toEqual(['gone']);
    expect(localStorage.getItem('tm.wbQueue')).toBeNull();
    expect(localStorage.getItem('tm.wbSeq')).toBeNull();
  });

  it('迁移后的队列会被同一次补传带走（flush 入口即迁移，无需先跑别的）', async () => {
    localStorage.setItem('tm.wbQueue', JSON.stringify([{ op: 'add', word: 'legacyonly', at: 1 }]));
    const { batches, send } = recorder(async () => pushResult(1));

    const result = await flushOfflineQueue(send, { wait: async () => undefined, now: () => 1 });

    expect(batches[0]?.entries.map((e) => e.word)).toEqual(['legacyonly']);
    expect(result.ok).toBe(true);
  });

  it('状态被写坏（非法 JSON / 缺字段）时按空队列恢复，不抛', async () => {
    localStorage.setItem(SYNC_STATE_KEY, '{not json');
    expect(pendingCount()).toBe(0);
    const { send, batches } = recorder(async () => pushResult(1));
    const result = await flushOfflineQueue(send, { wait: async () => undefined });
    expect(result.ok).toBe(true);
    expect(batches).toHaveLength(0);
  });
});

/* ═════════════════ A-43 #77：写盘失败必须可被调用方感知 ═════════════════ */

describe('写盘失败（§3.6.5 末行「删除写失败」的可达性前提）', () => {
  it('localStorage 写抛错 → saveState / enqueueRemove 抛出而非静默成功，flush 也不回 ok:true', async () => {
    // 先正常塞一条待删词：既验证"写失败不谎报"，也让下面的 flush 真会跑一批。
    enqueueRemove('apple');
    const seeded = localStorage.getItem(SYNC_STATE_KEY);
    expect(seeded).toBeTruthy();
    let syncedCalls = 0;

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      // 1) 直接落盘：抛可读错误，不再吞成内存兜底后的"成功"。
      expect(() => saveState(loadState())).toThrow(QueueWriteError);
      // 2) 删除入队：抛 —— `WordbookScreen.removeRow` 的 catch 因此才是活分支（C-23）。
      expect(() => enqueueRemove('banana')).toThrow(QueueWriteError);
      expect(() => removeWord('cherry')).toThrow(QueueWriteError);
      expect(() => addWord('date')).toThrow(QueueWriteError);
      // 3) 内存兜底没被当成写成了：盘上仍是入队前那一份，没有半截记录。
      expect(localStorage.getItem(SYNC_STATE_KEY)).toBe(seeded);

      // 4) 网络侧成功但本地记不上账 → 不许报「已同步」（红点 / 顶栏文案不能骗人）。
      const { send } = recorder(async () => pushResult(7));
      const result = await flushOfflineQueue(send, {
        wait: async () => undefined,
        now: () => 7,
        onSynced: () => {
          syncedCalls += 1;
        },
      });
      expect(result.ok).toBe(false);
      expect(isQueueWriteError(result.error)).toBe(true);
      expect(syncedCalls).toBe(0);
    } finally {
      spy.mockRestore();
    }

    // 恢复写盘后队列还在原地（下次冷启动重推），没有凭空丢词。
    expect(loadState().pendingRemovals).toEqual(['apple']);
    expect(pendingCount()).toBe(1);
  });
});
