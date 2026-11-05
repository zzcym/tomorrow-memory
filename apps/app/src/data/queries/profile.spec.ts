/**
 * `PUT /api/profile` 的响应形状（bug #12-1 的回归钉）。
 *
 * 现场：服务端这条路径回 `{ ok: true }`（`routes/profile.ts` 的 PUT 分支），客户端却按
 * `ProfileDto` 解析 ⇒ 每次都 `BAD_RESPONSE`，用户看到「服务器刚才没响应，再试一次」，
 * 而服务端其实已经写成功了。每日目标保存与昵称保存都栽在这。
 *
 * 这里只钉一件事：`{ok:true}` 必须被当成成功；读侧的新数据由 `profileQueryOptions()` 重取。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProfile } from './profile.js';

const TOKEN_KEY = 'tm.token';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('updateProfile', () => {
  it('服务端回 {ok:true} ⇒ 正常 resolve（不再被当成 服务器没响应）', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateProfile({ nickname: '小明' })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/api/profile');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ nickname: '小明' });
  });

  it('服务端回错误信封 ⇒ 抛出人话，而不是静默成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: '昵称太长', code: 'INVALID_NICKNAME' }), { status: 400 }),
      ),
    );

    await expect(updateProfile({ nickname: 'x'.repeat(40) })).rejects.toMatchObject({
      message: '昵称太长',
    });
  });
});
