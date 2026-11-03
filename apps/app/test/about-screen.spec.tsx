/**
 * T-19f 判据自证（App「关于」屏 `#/me/about`）—— `apps/app/test/about-screen.spec.tsx`。
 *
 * 宿主形态照 `upgrade-screen.spec.tsx`（T-19c）：`createRoot` + `act` 直渲，但**外面套真实的
 * `shell/TabBarShell`** —— 因为「有新版本时可关公告 24 小时」这一档的既有件（`VersionBanner`）
 * 就挂在这个壳上（`/me/about` 是 `kind:'secondary'` → `main.tsx:62` 套 `TabBarShell`），
 * 本屏不重写它、只在自己的 spec 里把屏放进真实壳下验证它的两态。屏不发请求、不读登录态，
 * 故不套 `QueryClientProvider`；网络只 stub `global.fetch`（`data/rest-fetcher.ts` 的唯一出口，
 * 供 `checkAppVersion` 取 `/api/version`）。全文件用 fake timers 推 `Date.now`（关闭记录的 `at`
 * 与再检查的 `now` 都要确定性）。
 *
 * 分组：
 *  - A 组：源码哨兵（屏内 0 中文产品字面量、0 `:has(`、0 裸 `localStorage`/`setItem`、
 *    0 网络/凭据写点、不 import 桥/router、Chrome84 四禁、`data-testid` 恰 1 且只在根上）；
 *  - B 组：公开屏内容逐字同源（标题 = `SETTINGS_COPY.rows.about`，E4b6 件1 起从 `groups[4]` 换成
 *    A-86 #320 的 5A 专用键，值逐字 = `groups[4]` = `'关于'`；同步承诺两句 = `SYNC_PROMISE` +
 *    `DATA_OWNERSHIP_NOTE`；登录方式公告 = `LOGIN_METHOD_NOTICE`（内含"密码 / 验证码"两态取值）；
 *    版本行 = `NOTICE_REVISION`）；
 *  - C 组：访客态 vs 已登录态一致（读数只读：屏对任何登录态渲染同一公告，且 0 出现"请登录"式自造话术）；
 *  - D 组：R-17⑨ 关闭 24 小时（关掉之后 24h 内不再出现 / 过期后重新出现，可控时钟，测的是壳的既有件）；
 *  - H 组：反向哨 —— 三态渲染树的可见文本对 §8.3-D / §6.2 数据存放禁词与"请登录"族 0 命中。
 */
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiHostProvider, type UiHost } from '@tm/ui';
import {
  DATA_OWNERSHIP_NOTE,
  LOGIN_METHOD_NOTICE,
  NOTICE_CHANNEL_COPY,
  NOTICE_REVISION,
  SETTINGS_COPY,
  SYNC_PROMISE,
  VERBS,
  VERSION_PROMPT_SUPPRESS_HOURS,
} from '@tm/shared';
import AboutScreen from '../src/screens/AboutScreen.js';
import { TabBarShell } from '../src/shell/TabBarShell.js';
import { resetAuthHandling } from '../src/data/rest-fetcher.js';
import {
  VERSION_PROMPT_KEY,
  checkAppVersion,
  dismissVersionPrompt,
  getPendingVersionPrompt,
  resetVersionPrompt,
} from '../src/data/startup.js';
import { refreshFromStorage, signIn } from '../src/lib/auth-store.js';
import { commitLocation, installRouterGlobals, resetRouterForTest } from '../src/router.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ═════════════════ 常量夹具 ═════════════════ */

const ABOUT_PATH = '/me/about';
const HOUR = 60 * 60 * 1000;
const T0 = 1_800_000_000_000; // 固定基准时刻（可控时钟用），与真实时间无关
const SUPPRESS_MS = VERSION_PROMPT_SUPPRESS_HOURS * HOUR;
const LATEST = '9.9.9'; // 相对 `currentAppVersion()` 的 '0.0.0' 恒为"更新"

const PHONE = '13800000001';

let container: HTMLDivElement;
let root: Root;
let mounted = false;
const navigateCalls: string[] = [];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** 只 stub `/api/version`（`checkAppVersion` 的唯一网络面）；本屏自己 0 请求。 */
function stubFetch(): void {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes('/api/version')) return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' } as unknown as Response;
    return jsonResponse({ latest: LATEST, url: 'https://tmword.xyz/app.apk' });
  });
  vi.stubGlobal('fetch', fn);
}

const host: UiHost = {
  kv: {
    get: (key: string) => localStorage.getItem(key),
    set: (key: string, value: string) => localStorage.setItem(key, value),
  },
  speak: () => {},
  navigate: (to: string) => {
    navigateCalls.push(to);
  },
  toast: () => {},
};

/** 真实壳：`/me/about` 线上形态 = `TabBarShell`（顶部版本横幅 + 内容 + 底部 tab）。 */
function mountScreen(): void {
  resetRouterForTest(ABOUT_PATH);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  act(() => {
    root.render(
      <UiHostProvider host={host}>
        <TabBarShell>
          <AboutScreen />
        </TabBarShell>
      </UiHostProvider>,
    );
  });
}

async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function unmount(): void {
  if (!mounted) return;
  mounted = false;
  act(() => root.unmount());
  container.remove();
}

function q<T extends Element>(selector: string): T | null {
  return container.querySelector<T>(selector);
}

function byTestId<T extends HTMLElement>(testid: string): T | null {
  return q<T>(`[data-testid=${testid}]`);
}

function screenRoot(): HTMLElement {
  return byTestId<HTMLElement>('about-screen')!;
}

/** 只在本屏子树里取文本（不含壳的 tab / 版本横幅），用于承诺与公告的逐字核对。 */
function visibleTexts(scope: Element = screenRoot()): string[] {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.nodeValue ?? '').trim();
    if (text) texts.push(text);
    node = walker.nextNode();
  }
  return texts;
}

function joinedText(scope: Element = screenRoot()): string {
  return visibleTexts(scope).join('\n');
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

/* 源码哨兵：先剥注释再扫（文件头大量"不写 xxx / 不许 xxx"的注释会提到禁词本身）。 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const readSrc = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screenCode = (): string => stripComments(readSrc('../src/screens/AboutScreen.tsx'));

/** §8.3-D 数据存放禁词 + R-19⑤ 内部术语 + "请登录"式自造话术：出现在任何用户可见串即本条不通过。 */
const FORBIDDEN_TERMS: readonly string[] = [
  '云端',
  '本地',
  '缓存',
  '未接入',
  'token',
  '数据源',
  '接口',
  'HTTP',
  '参数',
  '请登录',
  '请先登录',
  '登录后继续',
  '未设置密码，请用验证码登录',
  '联系管理员',
  '重新注册',
  '换手机号',
  '以后再说',
  '稍后再改',
  '下次提醒',
  '宽限期',
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  navigateCalls.length = 0;
  localStorage.clear();
  resetVersionPrompt();
  refreshFromStorage();
  resetAuthHandling();
  installRouterGlobals();
  commitLocation(ABOUT_PATH, false);
  stubFetch();
  // 版本横幅的"更新"按钮走 openExternal → window.open，jsdom 下给个 no-op 桩（本文件不点它）。
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ═════════════════ A 组 · 源码哨兵 ═════════════════ */

describe('A 组 · 源码哨兵（0 新串 / 0 网络 / 0 凭据写 / Chrome84）', () => {
  it('A-01 屏内 0 中文产品字面量：剥注释后 CJK 命中 = 0', () => {
    expect(screenCode().match(/[一-龥]/g) ?? []).toEqual([]);
  });

  it('A-02 屏内 0 :has(、0 裸 localStorage/setItem/getItem、0 test.fail、0 required', () => {
    const code = screenCode();
    for (const forbidden of [':has(', 'localStorage', 'setItem', 'getItem', 'test.fail', 'it.fail']) {
      expect(code, `屏内出现 ${forbidden}`).not.toContain(forbidden);
    }
    expect(code).not.toMatch(/\brequired\b/);
  });

  it('A-03 屏不新增网络请求、不写凭据槽、不直接 import 存储桥', () => {
    const code = screenCode();
    for (const forbidden of ['fetch(', 'apiGet', 'apiPost', 'useMutation', 'writeToken', 'saveSessionToken', 'signIn(', 'signOut(']) {
      expect(code, `屏内出现 ${forbidden}`).not.toContain(forbidden);
    }
    // 约束：屏若要问登录态只经 auth-store/token-bridge —— 本屏根本不读（公开可读），故也不 import 桥。
    expect(code).not.toContain('native/bridge');
  });

  it('A-04 Chrome84 四禁 / §5.1 新特性：0 命中', () => {
    const code = screenCode();
    for (const forbidden of ['structuredClone', 'Object.hasOwn', '.at(', '??=', '||=', '&&=', 'requestIdleCallback']) {
      expect(code, `屏内出现 ${forbidden}`).not.toContain(forbidden);
    }
    expect(code).not.toMatch(/^\s*await\s/m); // 顶层 await
  });

  it('A-05 `data-testid` 恰 1 且在根上；不 import router（挂载归 TPM，A-44 #86）', () => {
    const code = screenCode();
    expect(code.match(/data-testid=/g)?.length ?? 0).toBe(1);
    expect(code).toContain('data-testid="about-screen"');
    expect(code).not.toContain("from '../router.js'");
    expect(code).not.toContain('navigate(');
  });

  it('A-06 屏不重写版本横幅：不 import startup 的版本提示 store、不引 updateAvailable', () => {
    const code = screenCode();
    for (const forbidden of ['data/startup', 'VersionPrompt', 'updateAvailable', 'dismissVersionPrompt']) {
      expect(code, `屏内出现 ${forbidden}（版本档应由壳的 VersionBanner 单点承载）`).not.toContain(forbidden);
    }
  });
});

/* ═════════════════ B 组 · 公开屏内容逐字同源 ═════════════════ */

describe('B 组 · 公开屏内容（访客态，逐字取 shared 定稿串）', () => {
  it('B-01 挂在真实 TabBarShell 下渲染，标题逐字 = SETTINGS_COPY.rows.about（E4b6 件1：5A 专用键，值逐字「关于」）', () => {
    mountScreen();
    expect(screenRoot()).not.toBeNull();
    const h1 = q('h1');
    expect(h1?.textContent).toBe(SETTINGS_COPY.rows.about);
    /* 同值 ⇒ 只比 `rows.about` 会失分辨力（屏改回借 `groups[4]` 也照样绿）：这里另钉一颗字面量正向哨，
       专用键自身漂了即红（A-86 #320 的 5A「不许改字」口径，与 me-screen 的 J-01 同一形状）。 */
    expect(SETTINGS_COPY.rows.about, 'shared 的「关于」专用键漂了').toBe('关于');
  });

  it('B-02 同步承诺两句逐字 = SYNC_PROMISE / DATA_OWNERSHIP_NOTE，顺序正确', () => {
    mountScreen();
    const rows = Array.from(screenRoot().querySelectorAll('ol[role=list] > li')).map((li) =>
      String(li.textContent ?? '').trim(),
    );
    expect(rows).toEqual([SYNC_PROMISE, DATA_OWNERSHIP_NOTE]);
  });

  it('B-03 登录方式公告逐字 = LOGIN_METHOD_NOTICE，且该定稿串同时承载"密码 / 验证码"两态取值', () => {
    mountScreen();
    const notice = q('[role=status]');
    expect(notice).not.toBeNull();
    expect(String(notice?.textContent ?? '').trim()).toBe(LOGIN_METHOD_NOTICE);
    // 判据"两态"：定稿串本身既报了当前（手机号 + 密码），又报了验证码通道口径（后续开通）。
    expect(LOGIN_METHOD_NOTICE).toContain('手机号 + 密码');
    expect(LOGIN_METHOD_NOTICE).toContain('验证码');
  });

  it('B-04 版本行逐字 = NOTICE_REVISION（本屏唯一的 <p>）', () => {
    mountScreen();
    const paragraphs = Array.from(screenRoot().querySelectorAll('p'));
    expect(paragraphs.length).toBe(1);
    expect(String(paragraphs[0]?.textContent ?? '').trim()).toBe(NOTICE_REVISION);
  });

  it('B-05 访客态：屏体 0 出现"请登录"式自造话术、0 数据存放禁词', () => {
    mountScreen();
    const text = joinedText();
    expect(getAuthSnapshotStatus()).toBe('signed-out');
    for (const term of FORBIDDEN_TERMS) {
      expect(text, `访客态出现禁词 ${term}`).not.toContain(term);
    }
  });
});

/* 只在测试侧读快照，用于确认默认（未播种）即访客态。 */
function getAuthSnapshotStatus(): string {
  // auth-store 未导出裸 status getter，用 refreshFromStorage() 的返回值读派生位（只读）。
  return refreshFromStorage().status;
}

/* ═════════════════ C 组 · 访客 vs 已登录一致（读数只读） ═════════════════ */

describe('C 组 · 访客态 vs 已登录态（屏对登录态不敏感、公告同源）', () => {
  it('C-01 已登录态渲染同一份登录方式公告，逐字不变、仍无"请登录"', () => {
    // 用 auth-store 的**唯一写点** `signIn()` 播种已登录会话（与 T-19c 同口径；屏自身 0 写凭据）。
    signIn({ token: 'tk-19f-seed', phone: PHONE });
    mountScreen();
    expect(getAuthSnapshotStatus()).toBe('signed-in');
    const notice = q('[role=status]');
    expect(String(notice?.textContent ?? '').trim()).toBe(LOGIN_METHOD_NOTICE);
    const text = joinedText();
    for (const term of ['请登录', '请先登录', '登录后可见']) {
      expect(text, `已登录态出现 ${term}`).not.toContain(term);
    }
  });

  it('C-02 访客态与已登录态公告节点完全一致（同串、同 role、同条数 = 1）', () => {
    mountScreen();
    const guest = q('[role=status]')?.textContent;
    const guestCount = container.querySelectorAll('[data-testid=about-screen] [role=status]').length;
    unmount();
    signIn({ token: 'tk-19f-seed-2', phone: PHONE });
    mountScreen();
    const signedIn = q('[role=status]')?.textContent;
    const signedInCount = container.querySelectorAll('[data-testid=about-screen] [role=status]').length;
    expect(guestCount).toBe(1);
    expect(signedInCount).toBe(1);
    expect(String(guest ?? '').trim()).toBe(String(signedIn ?? '').trim());
  });
});

/* ═════════════════ D 组 · 关闭 24 小时公告（复用壳的 VersionBanner，可控时钟） ═════════════════ */

describe('D 组 · R-17⑨「有新版本时可关公告 24 小时」（屏挂在真实壳下验证既有件）', () => {
  it('D-01 有新版本 → 关于页出现版本横幅，文案逐字 = updateAvailable，关闭钮 aria = VERBS.cancel', async () => {
    mountScreen();
    await act(async () => {
      await checkAppVersion(T0);
    });
    await settle();
    const banner = byTestId('version-banner');
    expect(banner).not.toBeNull();
    expect(String(banner?.textContent ?? '')).toContain(NOTICE_CHANNEL_COPY.updateAvailable);
    const dismiss = byTestId<HTMLElement>('version-banner-dismiss');
    expect(dismiss).not.toBeNull();
    expect(dismiss?.getAttribute('aria-label')).toBe(VERBS.cancel);
  });

  it('D-02 关掉 → 立即消失，且落盘抑制记录；24h 窗口内再检查仍不出现', async () => {
    mountScreen();
    await act(async () => {
      await checkAppVersion(T0);
    });
    await settle();
    expect(byTestId('version-banner')).not.toBeNull();

    const dismiss = byTestId<HTMLElement>('version-banner-dismiss')!;
    await click(dismiss);
    await settle();
    expect(byTestId('version-banner')).toBeNull();
    // 关闭走 `dismissVersionPrompt` → 经 `kvSet` 落 VERSION_PROMPT_KEY（带 at 时间戳 = 既有"带过期时间的键"形状）。
    expect(JSON.parse(localStorage.getItem(VERSION_PROMPT_KEY) ?? '{}')).toEqual({ version: LATEST, at: T0 });

    // 关掉之后 24h 内不再出现：窗口内再次触发前台检查（同一版本）也不出。
    await act(async () => {
      await checkAppVersion(T0 + SUPPRESS_MS - 1);
    });
    await settle();
    expect(getPendingVersionPrompt()).toBeNull();
    expect(byTestId('version-banner')).toBeNull();
  });

  it('D-03 过期后重新出现：跨过 24h 窗口再检查，同一版本重新提示', async () => {
    mountScreen();
    await act(async () => {
      await checkAppVersion(T0);
    });
    await click(byTestId<HTMLElement>('version-banner-dismiss')!);
    await settle();
    expect(byTestId('version-banner')).toBeNull();

    await act(async () => {
      await checkAppVersion(T0 + SUPPRESS_MS + 1);
    });
    await settle();
    expect(getPendingVersionPrompt()?.latest).toBe(LATEST);
    expect(byTestId('version-banner')).not.toBeNull();
    expect(String(byTestId('version-banner')?.textContent ?? '')).toContain(NOTICE_CHANNEL_COPY.updateAvailable);
  });

  it('D-04 关闭只压制"那一个版本"：抑制记录按版本键（既有件语义，钉住不误伤别的版本）', async () => {
    mountScreen();
    await act(async () => {
      await checkAppVersion(T0);
    });
    await click(byTestId<HTMLElement>('version-banner-dismiss')!);
    await settle();
    const record = JSON.parse(localStorage.getItem(VERSION_PROMPT_KEY) ?? '{}') as { version: string; at: number };
    expect(record.version).toBe(LATEST);
    expect(record.at).toBe(T0);
  });
});

/* ═════════════════ H 组 · 反向哨（可见文本禁词 0 命中） ═════════════════ */

describe('H 组 · 反向哨（整页可见文本对 §8.3-D / §6.2 禁词 0 命中）', () => {
  it('H-01 初始帧：本屏子树整棵可见文本 0 命中禁词族', () => {
    mountScreen();
    const text = joinedText();
    for (const term of FORBIDDEN_TERMS) {
      expect(text, `初始帧命中禁词 ${term}`).not.toContain(term);
    }
  });

  it('H-02 带版本横幅帧：连壳的版本横幅一起扫，仍 0 命中数据存放禁词', async () => {
    mountScreen();
    await act(async () => {
      await checkAppVersion(T0);
    });
    await settle();
    const whole = joinedText(container);
    for (const term of ['云端', '本地', '缓存', '未接入', '数据源', 'token']) {
      expect(whole, `带横幅帧命中 ${term}`).not.toContain(term);
    }
  });

  it('H-03 结构性：本屏子树内可交互元素 = 0（动作全归壳与既有件，屏不自画按钮/输入）', () => {
    mountScreen();
    const interactive = screenRoot().querySelectorAll('button, input, select, textarea, a[href]');
    expect(interactive.length).toBe(0);
  });
});
