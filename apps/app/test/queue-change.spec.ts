/**
 * 队列变更广播（bug #4/#6/#7 的修复点）。
 *
 * 断链原状：`addWord`/`removeWord` 只写本地队列，而补传只在冷启动/回前台跑
 * ⇒ 查词自动入库的词永远到不了服务端（自测/新词/统计全空），tab 上的待同步点也不消。
 * 修复：入队即广播，`data/startup.ts` 订阅后刷新待同步数并做一次防抖补传。
 * 这里钉的是**广播本身**（入队一次 = 通知一次，退订后不再通知）。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { enqueueRemove, enqueueUpsert, subscribeQueueChange } from '../src/data/offline-queue.js';

beforeEach(() => {
  localStorage.clear();
});

describe('queue change broadcast', () => {
  it('入队 / 删除各广播一次；退订后不再收到', () => {
    let seen = 0;
    const off = subscribeQueueChange(() => {
      seen += 1;
    });

    enqueueUpsert('abandon');
    expect(seen).toBe(1);

    enqueueRemove('abandon');
    expect(seen).toBe(2);

    off();
    enqueueUpsert('serendipity');
    expect(seen).toBe(2);
  });
});
