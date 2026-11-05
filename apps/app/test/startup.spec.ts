/**
 * T-14 判据⑥（R-17 ⑨ / 架构 §5.5 第 4 步）：`GET /api/version` 的更新提示
 *  - 可关闭；关闭后 24 小时内对**同一版本**不再提示（时长取 `VERSION_PROMPT_SUPPRESS_HOURS`，不写死）；
 *  - 离线 / 404 / 形状不符 → 静默，不提示也不阻塞进入首页；
 *  - 展示文案 = `NOTICE_CHANNEL_COPY.updateAvailable`（全库唯一一份，本文件不写字面串）。
 * 顺带把 §5.5 的"四步固定顺序 + 每步隔离"（R-20④）钉住，T-17~T-19 只消费这些导出。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_CHANNEL_COPY, SYNC_COPY, VERSION_PROMPT_SUPPRESS_HOURS } from '@tm/shared';
import {
  STARTUP_STEPS,
  VERSION_PROMPT_KEY,
  checkAppVersion,
  dismissVersionPrompt,
  formatClock,
  getPendingVersionPrompt,
  isNewerVersion,
  normalizeVersionInfo,
  resetVersionPrompt,
  runStartup,
  shouldRunSyncChain,
  shouldShowVersionPrompt,
  syncLabel,
} from '../src/data/startup.js';
import { writeToken } from '../src/native/bridge.js';

const HOUR = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;
const CURRENT = '2.0.0';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function stubVersionFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(status, body)),
  );
}

beforeEach(() => {
  localStorage.clear();
  resetVersionPrompt();
  localStorage.setItem('tm.appVersion', CURRENT);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('判据⑥-1 提示的产生', () => {
  it('远端比本机新 → 出一条带下载直链的提示，文案是 shared 的唯一定稿', async () => {
    stubVersionFetch({ latest: '2.1.0', url: 'https://tmword.xyz/tmword-2.1.0.apk' });

    const prompt = await checkAppVersion(T0);

    expect(prompt).not.toBeNull();
    expect(prompt?.latest).toBe('2.1.0');
    expect(prompt?.label).toBe(NOTICE_CHANNEL_COPY.updateAvailable);
    expect(getPendingVersionPrompt()).toBe(prompt);
  });

  it('已经最新 / 更旧 → 不提示', async () => {
    stubVersionFetch({ latest: CURRENT, url: 'https://tmword.xyz/a.apk' });
    expect(await checkAppVersion(T0)).toBeNull();
    stubVersionFetch({ latest: '1.9.0', url: 'https://tmword.xyz/a.apk' });
    expect(await checkAppVersion(T0 + HOUR)).toBeNull();
  });

  it('没给下载地址 / 形状完全不认识 → 不提示（不误报"有新版本"）', async () => {
    stubVersionFetch({ latest: '2.1.0' });
    expect(await checkAppVersion(T0)).toBeNull();
    expect(normalizeVersionInfo({ data: { versionName: '2.1.0', apkUrl: 'x' } })).toEqual({
      latest: '2.1.0',
      url: 'x',
    });
  });

  it('离线（fetch 抛错）与 500 都静默返回 null，不抛给启动链', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await checkAppVersion(T0)).toBeNull();
    stubVersionFetch({ error: 'boom' }, 500);
    expect(await checkAppVersion(T0 + HOUR)).toBeNull();
  });

  it('与登录态无关：没凭据也照样检查（版本提示不是账号功能）', async () => {
    expect(shouldRunSyncChain()).toBe(false);
    stubVersionFetch({ latest: '2.1.0', url: 'https://tmword.xyz/a.apk' });
    expect(await checkAppVersion(T0)).not.toBeNull();
    writeToken('t-1');
    expect(shouldRunSyncChain()).toBe(true);
  });
});

describe('判据⑥-2 可关闭且 24h 不再提示', () => {
  it('关闭 → 提示立刻消失；窗口内再检查也不出，超窗后同一版本重新提示', async () => {
    stubVersionFetch({ latest: '2.1.0', url: 'https://tmword.xyz/a.apk' });
    expect(await checkAppVersion(T0)).not.toBeNull();

    dismissVersionPrompt('2.1.0', T0);

    expect(getPendingVersionPrompt()).toBeNull();
    expect(JSON.parse(localStorage.getItem(VERSION_PROMPT_KEY) ?? '{}')).toEqual({
      version: '2.1.0',
      at: T0,
    });
    expect(await checkAppVersion(T0 + (VERSION_PROMPT_SUPPRESS_HOURS - 1) * HOUR)).toBeNull();
    const after = await checkAppVersion(T0 + (VERSION_PROMPT_SUPPRESS_HOURS + 1) * HOUR);
    expect(after?.latest).toBe('2.1.0');
  });

  it('关闭只压制"那一个版本"：官方再发新号就该重新提示', () => {
    expect(shouldShowVersionPrompt(CURRENT, '2.1.0', null, T0)).toBe(true);
    expect(shouldShowVersionPrompt(CURRENT, '2.1.0', { version: '2.1.0', at: T0 }, T0 + HOUR)).toBe(
      false,
    );
    expect(
      shouldShowVersionPrompt(CURRENT, '2.2.0', { version: '2.1.0', at: T0 }, T0 + HOUR),
    ).toBe(true);
  });

  it('窗口边界按小时常量算（常量被改口径时这里会红，由 TPM 裁决）', () => {
    const record = { version: '2.1.0', at: T0 };
    const limit = VERSION_PROMPT_SUPPRESS_HOURS * HOUR;
    expect(shouldShowVersionPrompt(CURRENT, '2.1.0', record, T0 + limit - 1)).toBe(false);
    expect(shouldShowVersionPrompt(CURRENT, '2.1.0', record, T0 + limit)).toBe(true);
  });

  it('抑制记录被写坏时按"没关过"处理（不会因为脏数据把提示永久吃掉）', () => {
    localStorage.setItem(VERSION_PROMPT_KEY, '{oops');
    stubVersionFetch({ latest: '2.1.0', url: 'https://tmword.xyz/a.apk' });
    return checkAppVersion(T0).then((p) => expect(p?.latest).toBe('2.1.0'));
  });
});

describe('判据⑥-3 版本号比较', () => {
  it('只比点分数字段，带 v 前缀与位数不齐都归一', () => {
    expect(isNewerVersion('v2.1', '2.0.9')).toBe(true);
    expect(isNewerVersion('2.0.9', '2.1')).toBe(false);
    expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false);
    expect(isNewerVersion('10.0', '9.9')).toBe(true);
  });
});

describe('§5.5 启动链：固定顺序 + 每步隔离（R-20①④）', () => {
  it('顺序就是"补传 → 拉词本 → 待背数 → 版本"', () => {
    expect(STARTUP_STEPS).toEqual(['flush', 'pull', 'dueCount', 'version']);
  });

  it('第 1 步 reject，后三步照跑（错误注入）', async () => {
    const calls: string[] = [];
    const results = await runStartup({
      deps: {
        flush: async () => {
          calls.push('flush');
          throw new Error('boom');
        },
        pull: async () => {
          calls.push('pull');
          return { version: 3 };
        },
        dueCount: async () => {
          calls.push('dueCount');
          // bug #1：该步现在返回 {dueToday, newAvailable} 两个数（首页胶囊优先显示没学的）
          return { dueToday: 7, newAvailable: 0 };
        },
        version: async () => {
          calls.push('version');
          return null;
        },
        now: () => T0,
      },
    });

    expect(calls).toEqual(STARTUP_STEPS);
    expect(results.map((r) => r.ok)).toEqual([false, true, true, true]);
    expect(results[0]?.error).toBeTruthy();
  });

  it('第 2 步之后失败也不影响后续，且 pull 拿到的 since = 本机已同步版本', async () => {
    let seenSince: number | null = null;
    const results = await runStartup({
      deps: {
        flush: async () => 'ok',
        pull: async (since) => {
          seenSince = since;
          throw new Error('401-ish');
        },
        dueCount: async () => {
          throw new Error('down');
        },
        version: async () => null,
        now: () => T0,
      },
    });
    expect(seenSince).toBe(0);
    expect(results.map((r) => r.ok)).toEqual([true, false, false, true]);
  });

  it('skip 掉的步骤不执行（未登录时 1-3 步不发业务请求）', async () => {
    let called = 0;
    const results = await runStartup({
      skip: ['flush', 'pull', 'dueCount'],
      deps: {
        flush: async () => {
          called += 1;
          return null;
        },
        pull: async () => {
          called += 1;
          return null;
        },
        dueCount: async () => {
          called += 1;
          return { dueToday: 0, newAvailable: 0 };
        },
        version: async () => {
          called += 1;
          return null;
        },
        now: () => T0,
      },
    });
    expect(called).toBe(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe('R-20⑤ 的同步文案三态（口径唯一源 SYNC_COPY）', () => {
  it('待同步 N > 还没同步 > 已同步 · HH:MM > 什么都不显示', () => {
    expect(syncLabel({ syncedAt: T0, pending: 3, failed: false, dueCount: null, newCount: null })).toBe(
      SYNC_COPY.pending(3),
    );
    expect(syncLabel({ syncedAt: T0, pending: 0, failed: true, dueCount: null, newCount: null })).toBe(
      SYNC_COPY.replayFail,
    );
    const clock = formatClock(T0, T0 + 1000);
    expect(syncLabel({ syncedAt: T0, pending: 0, failed: false, dueCount: null, newCount: null })).toBe(
      SYNC_COPY.synced(String(clock)),
    );
    expect(syncLabel({ syncedAt: 0, pending: 0, failed: false, dueCount: null, newCount: null })).toBe(
      SYNC_COPY.offlineQuiet,
    );
    expect(syncLabel({ syncedAt: 0, pending: 0, failed: false, dueCount: null, newCount: null })).toBeNull();
  });

  it('未来时间与 0 都算"没同步过"（时钟回拨不给用户看假承诺）', () => {
    expect(formatClock(T0 + 10 * HOUR, T0)).toBeNull();
    expect(formatClock(0, T0)).toBeNull();
    expect(formatClock(T0, T0 + 60 * 1000)).toMatch(/^\d{2}:\d{2}$/);
  });
});
