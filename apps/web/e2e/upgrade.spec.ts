import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import { countOf, mockTrpc, ok as trpcEnvelope, sharedErrorCopy, trpcError } from './helpers';

/**
 * T-16「强制改密硬门禁」——`§10.2` T-16 行的判据⑦（`upgrade_required` → `/upgrade-password`
 * 不可关闭、只有"改密 / 退出"两出口、成功后回原页，R-40④）+ 该表风险栏与 §10.2 明文要求的
 * 一条**"未命中门禁时 upgrade-gate 零副作用"**用例。
 *
 * ## 这一层的契约（用例钉的就是这四条）
 *  `components/upgrade-gate.tsx` 包在**根 layout**（`app/layout.tsx` 对本任务的例外授权只有
 *  "1 个 import + 1 个包裹标签"），全站最外面一层 ⇒ 它自己一次网络往返都可能变成全站白屏。
 *  所以它的输入**只有一个**：`localStorage` 的 `tm_upgrade_required` 一位。
 *  置位者只有两处（都在别的文件里）：`applyAuthResult()`（登录出参）与 `providers.tsx` 的凭据单点
 *  （403 回码）。门禁层自己不写、不读别的键、不发请求。
 *
 * ## T-16r5（批次 4，A-68 #193/#194）本文件改了四件事，判据方向一字未动
 *  1. **打桩层接上 `e2e/helpers.ts` 的 `mockTrpc` + `trpcError`**（与 `auth-wall.spec.ts` /
 *     `profile.spec.ts` 同一把尺子）。本文件原先自带私有 `mockTrpc`/`err()`，桩形
 *     `{error:{message,data}}` **缺 tRPC v11 的数字协议码 `error.code` 与 `json` 信封**
 *     ⇒ `isTRPCErrorResponse()` 判假 ⇒ `TRPCClientError.data` 为 `undefined` ⇒ 页面 `tmCodeOf()`
 *     只得 `undefined` ⇒ "服务端 §4.6 码 → 页面翻译"那一面**根本没被判到**。顺带得到 helpers 那层
 *     的批量多过程解包。**旧桩已删**（不留第二套装配）。
 *  2. **开弹窗改"轮询广播"**（R6）：一次性 `page.evaluate(dispatchEvent)` 正是
 *     `auth-wall.spec.ts:138-158` 已诊断并修掉的"早于水合的广播无人接收"竞态 ⇒ 同款 `openDialog()`。
 *  3. **零副作用两条改差分对照**（R4/R5，A-68 #194）：见那两条用例头部的口径注，
 *     装置 = 每个装配一个**全新 context** 冷加载同一棵 `/about`（同 context 连着导航量不稳，
 *     成因写在 `runAssembly` 的注释里）。**禁止**把 `review.today` 之类端点加进过滤条件
 *     （黑名单 = 把下一个新加的页级请求变成隐性放行）。
 *  4. **`upgrade-gate` 换页吞 children 的出口哨**（R7/R8 两条用例里，F-25 / A-68 #193）：
 *     `router.replace(UPGRADE_PATH)` 对改密页**至多 1 次**，由"带 `RSC: 1` 头且路径为改密页的
 *     那次 fetch"计数（先前试过的 `history.replaceState` 包装会把 Next 自己的同 URL 调用一起数，
 *     实测 2 与 4 ⇒ 产品正确时也假红，已在 `watchSoftNavigations` 注释里留数）。
 *
 * ## 为什么"零副作用"用 `/about` 来测（前提随 A-68 #194 更正）
 *  `app/(user)/about/page.tsx` 是本任务名下的**服务端组件**：不读 `localStorage`、不挂
 *  `<AuthGate>`、页面树里没有任何**客户端数据获取属于本任务**。但它**在 `(user)` 组内** ⇒
 *  `(user)/layout.tsx:36` 的 `<MobileNav>` 会在登录态发一次 `review.today`
 *  （`lib/hooks/use-lookup.ts:39`，`enabled: signedIn`）—— 那是**正确产品行为**，不是门禁层的账。
 *  所以判据不再是"整棵树 0 请求"，而是"门禁层的输入位怎么变，这棵树的请求集合/键写入都不动"。
 *
 * ## 线格式与跑法
 *  与姊妹文件 `e2e/auth-wall.spec.ts` 头注同口径：tRPC **v11** batch 线格式（无 transformer ⇒
 *  成功 `[{result:{data}}]`、失败 `[{error:{message,data,code,json}}]`，`data.code` 就是
 *  A-30-1 `errorFormatter` 提升上来的 §4.6 码）；跑法
 *  `pnpm --filter @tm/web exec playwright test e2e/upgrade.spec.ts`（配置全仓一份，A-30-6）。
 *  > 打戳更正（T-16r5）：本节原先写的是"**tRPC v10 batch**、`[{error:{message,data}}]`" ——
 *  > 那是**错前提**（A-68 #193 点名）：真服务端与客户端都是 v11.18，失败项必须带数字协议码
 *  > `code` 与 `json` 信封，否则客户端解不出 `data.code`。旧措辞连同旧桩一起在本轮删除。
 */

const KEYS = [
  'tm_token',
  'tm_user',
  'tm_upgrade_token',
  'tm_upgrade_required',
  'tm_upgrade_advisory',
  'tm_return_to',
  'tm_pending_action',
] as const;

type Seed = Partial<Record<(typeof KEYS)[number], string>>;

/** 成功项：`AuthResultSchema` 的五个必填键（可选键由调用方覆写），信封来自 `helpers`。 */
const ok = (data: Record<string, unknown> = {}) =>
  trpcEnvelope({ token: 'tk-e2e', phone: '13800138000', hasPassword: true, nickname: '', avatar: '', ...data });

/** 只包信封、不造数据 —— 给 `mockTrpc` 的通用兜底用（件 4 的装置里所有未点名过程都回它）。 */
const envelope = (data: unknown) => trpcEnvelope(data);

async function seedStorage(page: Page, values: Seed): Promise<void> {
  const entries = Object.entries(values) as [string, string][];
  await page.addInitScript((pairs) => {
    for (const [key, value] of pairs) window.localStorage.setItem(key, value);
  }, entries);
}

const storageSnapshot = (page: Page): Promise<Record<string, string | null>> =>
  page.evaluate((keys) => {
    const out: Record<string, string | null> = {};
    for (const key of keys) out[key] = window.localStorage.getItem(key);
    return out;
  }, [...KEYS]);

/**
 * 相对**本装配自己种下的值**算写入：只有值不同（含被清成 `null`）的键才算"被写过"。
 * 相等 = 门禁层对存储零动作；两装配的这份差异逐字相等 = A-68 #194 要的"键写入逐字相等"。
 */
function diffWrites(seed: Seed, snapshot: Record<string, string | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of KEYS) {
    const seeded = seed[key] ?? null;
    if (snapshot[key] !== seeded) out[key] = snapshot[key] ?? null;
  }
  return out;
}

/**
 * 记一次导航里打到的**所有**后端请求（`/trpc` 与 REST 两条面都算，**不做任何端点过滤/黑名单**）。
 * 返回**有序清单**而不是计数：件 4 的判据是"两装配逐字相等"，只留一个数字就没法比集合内容。
 * 每项归一化成 `方法 + 路径`（batch 的 `?input=` 里带时间无关的入参，路径才是"哪颗过程"的身份）。
 * 用 `page.on('request')` 而不是再挂一层 `page.route`：后挂的 route 会盖掉前一个（`mockTrpc`
 * 已经在手上），而 request 事件对 `fulfill` 掉的请求同样触发 ⇒ 清单不受打桩顺序影响。
 */
function watchBackendCalls(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!/\/trpc\//.test(url) && !/\/api\//.test(url)) return;
    seen.push(`${req.method()} ${decodeURIComponent(new URL(url).pathname)}`);
  });
  return () => seen;
}

/** 改密页路径（真源 `apps/web/src/lib/api/auth.ts:34`；e2e 侧不 import 源码常量，逐字取同值）。 */
const UPGRADE_PATH = '/upgrade-password';

/**
 * 出口哨（A-68 #193 / F-25）：`router.replace(UPGRADE_PATH)` 对改密页**至多 1 次**。
 *
 * 计数机制 = **数改密页那一条 RSC 软导航请求**，不是包 `history.replaceState`。
 * 后一条路我在本轮先试过、量出来的不是门禁层的账（数字记在这里，供报告 §② 件 2 引用）：
 * Next 自己也会对**同一个** URL 调 `history.replaceState`（提交后的 URL 归一化那一类内部动作），
 * 于是"命中门禁换一次页"被记成 **2 次**（期望 1）、"人已经站在改密页上"被记成 **4 次**（期望 0）
 * ⇒ 这颗哨会在**产品正确**的时候假红，是量具选错，不是行为有问题。
 * 真正的页内换导航在网络上只留一条指纹：带 `RSC: 1` 请求头、路径为该页的那次 fetch
 * （实测 `GET /upgrade-password?_rsc=<key>` **恰一条**；`page.goto()` 的文档请求不带这个头，
 * 页内 `<Link>` 的预取带这个头但路径是 `/profile`、`/study`、`/wordbook`、`/report` 那些，
 * 改密页不在其中 ⇒ 只有"主动换到改密页"这一件事会被计数）。
 * 返回全部软导航路径，便于红的时候直接看是谁在按。
 */
function watchSoftNavigations(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (req.headers().rsc !== '1') return;
    seen.push(decodeURIComponent(new URL(req.url()).pathname));
  });
  return () => seen;
}

/** 到改密页的那几次软导航（其余路径与门禁层无关，不参与判定）。 */
const upgradesTo = (paths: string[]): number => paths.filter((path) => path === UPGRADE_PATH).length;

/* ───────────────────── 件 4 的差分对照装置（A-68 #194） ───────────────────── */

/** 传给 `browser.newContext()` 的那几项：从当前 project 的已合并 `use` 原样取，档位不降级。 */
type ColdContextOptions = Pick<BrowserContextOptions, 'baseURL' | 'viewport' | 'deviceScaleFactor' | 'isMobile' | 'hasTouch'>;

const coldContextOptions = (testInfo: TestInfo): ColdContextOptions => {
  const { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  return { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch };
};

/** 一次冷装配读到的五个观测面。 */
interface Assembly {
  /** 整棵树打到的后端请求（有序清单，**不做任何端点过滤**）。 */
  calls: string[];
  /** 相对本装配自己种子的键写入差异。 */
  writes: Record<string, string | null>;
  /** 水合后仍原样在场的种子值。 */
  stored: Record<string, string | null>;
  /** children 的渲染文本（"门禁层零改 DOM"的证据面）。 */
  body: string;
  /** 门禁骨架出现的次数。 */
  blocking: number;
  /** 最终 URL。 */
  url: string;
}

/**
 * 一个装配 = 一个**全新 context**（等同新开一份浏览器实例：零 HTTP 缓存、零 React Query 残温）。
 *
 * 为什么不在同一张页面上连着 `goto()` 两次（本轮实测过的坑，写死在这里免得下轮再踩）：
 * 同 context 的第二次导航量到的清单是空的（实测装配 A = 两条 `review.today`、装配 B = `[]`），
 * 前一轮的缓存/残温会渗进后一次导航 ⇒ 差分**拿不到稳定对照**。新开 context 后两装配各自冷启动，
 * 实测同一棵 `/about` 的清单逐字相等且可重复 ⇒ 差分这才成立。
 *
 * 打桩表留空、但给一个**按过程名无关的通用兜底成功信封**：`mockTrpc` 默认对未列出的过程回
 * `NOT_FOUND`(404)，那会让 React Query 走重试，把"这一棵树一共发了几条请求"这种数出来的判据搅浑
 * （正是同 context 那两次量不稳的成因之一）。兜底不按过程名分支 ⇒ 它既不是白名单也不是黑名单，
 * 请求清单仍逐条如实记账。
 */
async function runAssembly(
  browser: Browser,
  options: ColdContextOptions,
  seed: Seed,
  landing: 'about' | 'upgrade' = 'about',
): Promise<Assembly> {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    const ledger = watchBackendCalls(page);
    await mockTrpc(page, {}, envelope);
    await seedStorage(page, seed);
    await page.goto('/about');
    if (landing === 'about') {
      await expect(page.locator('[data-testid=about-page]')).toHaveCount(1);
    } else {
      await expect(page).toHaveURL(/\/upgrade-password/, { timeout: 20_000 });
    }
    await page.waitForLoadState('networkidle');
    const stored = await storageSnapshot(page);
    const about = page.locator('[data-testid=about-page]');
    return {
      calls: ledger(),
      writes: diffWrites(seed, stored),
      stored,
      body: (await about.count()) > 0 ? await about.innerText() : '',
      blocking: await page.locator('[data-testid=upgrade-gate-blocking]').count(),
      url: page.url(),
    };
  } finally {
    await context.close();
  }
}

/**
 * 派发 `requestLogin()` 的那一个事件并等到弹窗可见（R6 的修法，与 `auth-wall.spec.ts:146-158` 同款）。
 *
 * ⚠ 事件**广播一次会打水漂**：`page.goto()` 只等到 `load`，而监听器（`header.tsx:43` 与
 * `login-dialog.tsx:100`）挂在 React 水合之后 ⇒ 早于水合的那次广播无人接收，而 `toBeVisible()`
 * 的自动重试只等 DOM、不会重发事件 —— 这正是 R6（`upgrade.spec.ts:140`）在两档之间游动的原因
 * （T-16r4 首跑 375 绿 / 1280 红，TPM 复跑反向，T-16r5 基线两档全绿 = 闪已实证三次）。
 * 事件名与 `detail` 形状一字未改（仍是 `requestLogin()` 那一条线，`lib/auth.ts:47/:301`）。
 */
async function openDialog(page: Page, detail?: Record<string, unknown>): Promise<void> {
  const dialog = page.locator('[data-testid=login-dialog]');
  await expect
    .poll(
      async () => {
        await page.evaluate((d) => window.dispatchEvent(new CustomEvent('tm-open-login', { detail: d ?? null })), detail ?? null);
        return (await dialog.count()) > 0;
      },
      { timeout: 20_000, intervals: [200, 400, 800, 1200] },
    )
    .toBe(true);
  await expect(dialog).toBeVisible();
}

/** 硬门禁会话：只有 upgrade token，没有正常 token（R-40④ 的"不进入应用、不签发正常 token"）。 */
const GATED: Seed = {
  tm_upgrade_required: '1',
  tm_upgrade_token: 'up-e2e',
  tm_return_to: '/wordbook',
};

const FIELDS = {
  old: '[data-auth-control=old-password]',
  next: '[data-auth-control=new-password]',
  confirm: '[data-auth-control=confirm-password]',
};

test.describe('T-16 强制改密门禁', () => {
  test('零副作用：未命中门禁时根 layout 的 <UpgradeGate> 不发请求、不写存储、不改 DOM', async ({ browser }, testInfo) => {
    /*──────────────────────────────────────────────────────────────────────────────────
     * 口径（A-68 #194）：守的是**门禁层自身**零请求/零写存储/零改 DOM，不是整棵 `/about` 树。
     * 机制 = **差分对照**：同一棵树、同一种导航（`goto('/about')`），唯一变化的是门禁层自己读的
     * 那三位输入（装配 A 全缺席 ⇒ 装配 B 全部存在但为假）。两装配各跑一个**全新 context**
     * （`runAssembly`，原因写在那颗装置的注释里：同 context 连开两次导航的清单不稳）。
     *   ⇒ 两装配的**后端请求清单**与**相对各自种子的键写入**必须逐字相等；
     *   ⇒ 再各自钉一次绝对值：键写入 = 空、DOM 文本相等、无 blocking 痕迹、URL 一字未变；
     *   ⇒ 另钉一条"这棵树确实自己发过请求"（否则"相等"可能只是空集 = 空集 的假绿）。
     * 为什么这样够：门禁层的输入读点是 `useUpgradeRequired()` = `useFlagSnapshot(isUpgradePending)`
     * （`lib/use-auth.ts:61-63`，`useSyncExternalStore` 纯本地读），构造上不發请求；
     * 而"整棵树 0 请求"这一句是**过期前提** —— `(user)/layout.tsx:36` 的 `<MobileNav>` →
     * `useDueCount()` → `review.today`（`enabled: signedIn`）在登录态必发一次，是正确产品行为。
     * 明确**不做**的事：不给任何端点开过滤条件（黑名单会把下一个新加的页级请求变成隐性放行）。
     *
     * 装配口径的如实说明（与简报字面的一处落差）：门禁挂在**根 layout**（`app/layout.tsx`），
     * 页面上没有任何开关能把"挂 `<UpgradeGate>` / 只挂它的 `fallback`"这两套装配在同一份产物里
     * 切来切去 —— 要做到就得给产品加测试专用开关，那是 R2 禁的 DOM/行为改动。所以对照变量选成
     * **门禁层自己的输入位**：输入位为假时渲染的就是 `fallback` 那一条分支本体，
     * 与"不挂门禁"在同一棵树上等价（`upgrade-gate.tsx:85` 两位都为假时 `return <>{children}</>`）。
     *
     * 残留缺口的补证（同轮内跑掉，A-63 #175）：差分只测"输入位变化"，测不出"无条件就发请求"。
     * 该缺口由三路关掉 —— ① 装配 A/B 各自的"清单非空且相等 + 键写入为空 + 无 blocking/无跳转"；
     * ② 正控（下面第 ⑤ 步）：同一棵树把输入位置真，必须立刻换页；
     * ③ `grep -E "trpc|fetch|useQuery|XMLHttpRequest" apps/web/src/components/upgrade-gate.tsx`
     *   = 0 命中（证据贴在 T-16r5 报告 §② 件 2/件 4），本文件据此不重复数别人的账。
     ────────────────────────────────────────────────────────────────────────────────*/
    const assemblyA: Seed = {
      tm_token: 'tk-e2e',
      tm_user: JSON.stringify({ phone: '13800138000', nickname: '', avatar: '', hasPassword: true }),
    };
    // 装配 B：A 的全部键一字不动，只把门禁层的三位输入**种成"存在但为假"**（'1' 才是真，见 lib/auth.ts:162/168）
    const assemblyB: Seed = { ...assemblyA, tm_upgrade_required: '0', tm_upgrade_advisory: '0', tm_upgrade_token: 'up-e2e-off' };
    const options = coldContextOptions(testInfo);

    const a = await runAssembly(browser, options, assemblyA);
    const b = await runAssembly(browser, options, assemblyB);

    // ① 差分：门禁层的输入位从"缺席"变到"存在但全为假" ⇒ 请求清单与键写入逐字相等
    expect(b.calls).toEqual(a.calls);
    expect(b.writes).toEqual(a.writes);
    // ② 对照有效：这棵树在登录态确实自发过页级请求 ⇒ 上面那句"相等"不是空集对空集
    expect(a.calls.length).toBeGreaterThan(0);
    // ③ 绝对值：两装配自己都不许有任何键被写入（门禁层只 `read`；七把键一位未动）
    expect(a.writes).toEqual({});
    expect(b.writes).toEqual({});
    // ④ DOM 与 URL：既不拦也不占位，children 原样在场、两装配渲染文本相等、谁都没换页
    expect(a.blocking).toBe(0);
    expect(b.blocking).toBe(0);
    expect(b.body).toBe(a.body);
    expect(a.body).not.toBe('');
    expect(a.url).toMatch(/\/about$/);
    expect(b.url).toMatch(/\/about$/);

    // ⑤ 正控（灵敏度自证，防"两装配恰好都测不到"变成假绿）：把同一位**置真**，
    //    同一棵树必须立刻表现出门禁层的动作 ⇒ 上面那组"相等"不是瞎的。
    const c = await runAssembly(browser, options, { ...assemblyB, tm_upgrade_required: '1' }, 'upgrade');
    expect(c.url).toMatch(/\/upgrade-password$/);
  });

  test('零副作用·止血阀 off：软待办位置起也不拦人、也不发请求（R-23⑦ 末句 / §6.4-5-5）', async ({ browser }, testInfo) => {
    // 口径与上一条同源（A-68 #194）：差分对象 = 软待办位本身。装配 A 置 '1'（止血阀 off、人已进门），
    // 装配 B 把它翻成 '0'。两装配各一个全新 context、同一棵树、同一种导航 ⇒
    // 请求清单与键写入逐字相等；且两装配都不许出现 blocking 骨架、都不许换页
    // ⇒ "软待办不拦人"仍在被测。
    const assemblyA: Seed = { tm_token: 'tk-e2e', tm_upgrade_advisory: '1' };
    const assemblyB: Seed = { tm_token: 'tk-e2e', tm_upgrade_advisory: '0' };
    const options = coldContextOptions(testInfo);

    const a = await runAssembly(browser, options, assemblyA);
    const b = await runAssembly(browser, options, assemblyB);

    // ① 差分：软待办位翻转不改变请求清单，也不改变键写入
    expect(b.calls).toEqual(a.calls);
    expect(b.writes).toEqual(a.writes);
    // ② 绝对值：软待办位由改密页/登出清，门禁层不动它
    expect(a.writes).toEqual({});
    expect(b.writes).toEqual({});
    expect(a.stored.tm_upgrade_advisory).toBe('1');
    expect(b.stored.tm_upgrade_advisory).toBe('0');
    // ③ 两装配都不拦人：无骨架、children 在场、URL 未变、渲染文本相等
    expect(a.blocking).toBe(0);
    expect(b.blocking).toBe(0);
    expect(a.body).not.toBe('');
    expect(b.body).toBe(a.body);
    expect(a.url).toMatch(/\/about$/);
    expect(b.url).toMatch(/\/about$/);
    // ④ 两把键不互相污染：门禁位从头到尾未被置起
    expect(a.stored.tm_upgrade_required).toBeNull();
    expect(b.stored.tm_upgrade_required).toBeNull();
  });

  test('⑦ 登录出参 upgrade_required + 空 token：只写两把 upgrade 键并落到改密页（R-40④）', async ({ page }) => {
    const calls = await mockTrpc(page, {
      'auth.login': () => ok({ token: '', upgrade_required: true, upgradeToken: 'up-e2e' }),
    });
    await page.goto('/');
    await openDialog(page);

    const form = page.locator('[data-testid=login-dialog-form]');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('weak-pass');
    await form.locator('[data-testid=auth-submit]').click();

    await expect(page).toHaveURL(/\/upgrade-password/);
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBe('1');
    expect(stored.tm_upgrade_token).toBe('up-e2e');
    // 硬门禁的核心红线：改密成功前正常 token 一把都不许签发（前端也不许替它补一把）
    expect(stored.tm_token).toBeNull();
    expect(countOf(calls, 'auth.login')).toBe(1);
  });

  test('⑦ 命中门禁进任意业务页：先出骨架再换到改密页，业务内容不透出（判据⑦ 前置）', async ({ page }) => {
    await mockTrpc(page, {});
    const softNavs = watchSoftNavigations(page);
    await seedStorage(page, GATED);
    await page.goto('/study');

    await expect(page).toHaveURL(/\/upgrade-password/);
    const page16 = page.locator('[data-testid=upgrade-password-page]');
    await expect(page16).toHaveCount(1);
    await expect(page16).toHaveAttribute('data-hard-gate', 'true');
    // 待升级会话进不了业务页：这一层拦的是"内容"，不是只提示一句
    await expect(page.locator('[data-testid=upgrade-gate-blocking]')).toHaveCount(0);
    // 出口哨（A-68 #193）：换页**恰一次** —— `usePathname()` 变反应式之后，
    // `onUpgradePage` 翻真会让 effect 重跑一次，这一条就是钉住"重跑不再补第二次 replace"。
    // 读数放在 networkidle 之后：晚到的那一次（若有）也必须被算进来。
    await page.waitForLoadState('networkidle');
    expect(upgradesTo(softNavs())).toBe(1);
  });

  /**
   * R8 的修法（A-68 #193 明令"只改期望，产品 DOM 一字不动"）：
   * 本用例原先选的是 `[data-testid=force-password-upgrade]` —— 这颗 testid **在 Web 端从未存在过**：
   * `apps/web/src/app/upgrade-password/page.tsx:171` 显式传了 `testid="upgrade-password-form"`，
   * 覆写掉 `packages/ui/src/auth/ForcePasswordUpgradeForm.tsx:130` 的默认值 `force-password-upgrade`。
   * 下面一律引真实存在的那颗（`upgrade-password-form`），其余判据（不可关闭 / 两出口 / 返回键被拦）不变。
   */
  test('⑦ 改密页不可关闭：无顶栏/无底 tab/无关闭钮，只有"改密 / 退出"两出口，返回键被拦下', async ({ page }) => {
    await mockTrpc(page, {});
    const softNavs = watchSoftNavigations(page);
    await seedStorage(page, GATED);
    await page.goto('/upgrade-password');

    const root = page.locator('[data-testid=upgrade-password-form]');
    await expect(root).toHaveAttribute('data-auth-hard-gate', 'true');
    // 三个"顺手走出去"的口子都不存在：整页布局在 `(user)` 组外（无顶栏、无底 tab），也不是弹层（无关闭键）
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('[data-testid=mobile-nav]')).toHaveCount(0);
    await expect(page.locator('[data-slot=dialog-close], button[aria-label=关闭]')).toHaveCount(0);
    await expect(page.locator('a[href]')).toHaveCount(0);

    // 出口恰好两颗：更新密码并继续 / 退出登录（两颗之外不再有点得走的按钮）
    await expect(page.locator('[data-testid=password-submit]')).toBeVisible();
    await expect(page.locator('[data-testid=force-sign-out]')).toBeVisible();
    await expect(root.locator('[data-auth-control=submit], [data-auth-secondary=sign-out]')).toHaveCount(2);

    // 出口哨的另一半（F-25 修完必须一起核的那条副作用）：人已经站在改密页上 ⇒ 门禁层**一次都不许**
    // 再软导航到本页（`onUpgradePage` 变反应式后靠这个 0 证明"改密页又被刷了一次"没发生）。
    // 读数放在这一帧：下面两下（Escape / goBack）是**本页自己的**返回键止血阀在动，
    // 浏览器历史导航也可能留下 RSC 请求，把它们混进这一颗哨里就会假红。
    await page.waitForLoadState('networkidle');
    expect(upgradesTo(softNavs())).toBe(0);

    await page.keyboard.press('Escape');
    expect(page.url()).toMatch(/\/upgrade-password/);
    await page.goBack();
    await expect(page.locator('[data-testid=upgrade-password-page]')).toBeVisible();
    expect(page.url()).toMatch(/\/upgrade-password/);
  });

  test('⑦ 退出登录：只清本机凭据并回首页重新登录（不做第三条出路）', async ({ page }) => {
    await mockTrpc(page, {});
    await seedStorage(page, GATED);
    await page.goto('/upgrade-password');
    await page.locator('[data-testid=force-sign-out]').click();

    await expect(page).toHaveURL(/\/$|\/upgrade-password/);
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBeNull();
    expect(stored.tm_upgrade_token).toBeNull();
    // 会话被清 = 门禁不再成立，刷新后不该再被拦在改密页
    await page.goto('/');
    await expect(page.locator('[data-testid=login-wall]')).toHaveCount(0);
  });

  test('⑦ 改密成功：清两把 upgrade 键、写正常 token、告知常驻后回原页（判据⑦ 末句 / R-40③）', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, { 'auth.forceChangePassword': () => ok({ token: 'tk-new' }) });
    await seedStorage(page, GATED);
    await page.goto('/upgrade-password');

    const form = page.locator('[data-testid=force-change-password]');
    await form.locator(FIELDS.old).fill('weak-pass');
    await form.locator(FIELDS.next).fill('strong-password-8');
    await form.locator(FIELDS.confirm).fill('strong-password-8');
    await form.locator('[data-testid=password-submit]').click();

    const notice = page.locator('[data-testid=upgrade-success-notice]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('其他设备需要重新登录');
    const stored = await storageSnapshot(page);
    expect(stored.tm_token).toBe('tk-new');
    expect(stored.tm_upgrade_required).toBeNull();
    expect(stored.tm_upgrade_token).toBeNull();
    expect(countOf(calls, 'auth.forceChangePassword')).toBe(1);

    // 回原页 = `tm_return_to`（判据④ 同源那把键），时限 TOAST_LONG_MS = 6 秒
    await expect(page).toHaveURL(/\/wordbook/, { timeout: 15_000 });
  });

  test('⑦ 反向用例：不该在这一页的人直接访问 URL → 只给骨架并换回原页，不拦他', async ({ page }) => {
    await mockTrpc(page, {});
    await seedStorage(page, { tm_token: 'tk-e2e', tm_return_to: '/wordbook' });
    await page.goto('/upgrade-password');

    await expect(page).toHaveURL(/\/wordbook/, { timeout: 15_000 });
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBeNull();
    expect(stored.tm_token).toBe('tk-e2e');
  });

  /**
   * R9 的第一支（A-68 #193）：新密码 5 位 ⇒ 被 `PASSWORD_MIN=8` 在**客户端**前置拦下，
   * `ChangePasswordForm` 的 `handleSubmit` 按构造不会调 `onSubmit` ⇒ 原先那句
   * `expect(calls).toContain('auth.forceChangePassword')` 期待的是**不可达**的一支。
   * 改法 = 照 `profile.spec.ts:74-89` 已建立的**新契约写法**：客户端拦下 + 端点调用次数 = 0
   * + 显示 `@tm/shared` 真源定稿串（不硬编码中文，见下一支）。
   * 强度话术出现在**建密码/改密面合法**（R-40④ 只管验密码面）：本页正是强制建密码面。
   */
  test('⑦ 改密失败·客户端前置拦截：新密码不足 `PASSWORD_MIN` 就地给人话，一次请求都不发', async ({ page }) => {
    const calls = await mockTrpc(page, {
      'auth.forceChangePassword': () => trpcError('密码强度不足', 'WEAK_PASSWORD', 400),
    });
    await seedStorage(page, GATED);
    await page.goto('/upgrade-password');

    const form = page.locator('[data-testid=force-change-password]');
    await form.locator(FIELDS.old).fill('weak-pass');
    await form.locator(FIELDS.next).fill('short');
    await form.locator(FIELDS.confirm).fill('short');
    await form.locator('[data-testid=password-submit]').click();

    const expected = sharedErrorCopy('WEAK_PASSWORD');
    await expect(form.getByRole('alert').filter({ hasText: expected })).toHaveCount(1);
    await expect(form.locator('input[name=newPassword]')).toHaveAttribute('aria-invalid', 'true');
    // 客户端拦下 = 0 请求（这条**是结论不是漏跑**：桩里那句 §4.6 码永远不该被打到）
    expect(countOf(calls, 'auth.forceChangePassword')).toBe(0);
    // 失败留在本页、不清任何键（不吞错也不越权放行）
    await expect(page.locator('[data-testid=upgrade-password-page]')).toBeVisible();
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBe('1');
    expect(stored.tm_upgrade_token).toBe('up-e2e');
    expect(stored.tm_token).toBeNull();
    expect(page.url()).toMatch(/\/upgrade-password/);
  });

  /**
   * R9 的第二支（A-68 #193："若要保留服务端回码那一支，另起一条用例、把密码填成合规长度"）：
   * 新密码 8 位 = 过客户端这一关（`profile.spec.ts:130-142` 的 `'abcdefgh'` 范式）⇒ 真的打出去，
   * 屏幕上那句话只能由 §4.6 码翻译而来。桩形用 `helpers.trpcError`（v11 数字协议码 + `json` 信封），
   * 期望串现读 `@tm/shared` 真源 ⇒ 页面自造文案必红、shared 改字面这一条跟着绿。
   */
  test('⑦ 改密失败·服务端回 `WEAK_PASSWORD`（客户端长度已合规）：显示 §4.6 人话、留在本页、不清任何键', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, {
      'auth.forceChangePassword': () => trpcError('密码强度不足', 'WEAK_PASSWORD', 400),
    });
    await seedStorage(page, GATED);
    await page.goto('/upgrade-password');

    const form = page.locator('[data-testid=force-change-password]');
    await form.locator(FIELDS.old).fill('weak-pass');
    await form.locator(FIELDS.next).fill('abcdefgh');
    await form.locator(FIELDS.confirm).fill('abcdefgh');
    await form.locator('[data-testid=password-submit]').click();

    const expected = sharedErrorCopy('WEAK_PASSWORD');
    await expect.poll(() => countOf(calls, 'auth.forceChangePassword'), { timeout: 8_000 }).toBe(1);
    await expect(form.getByRole('alert').filter({ hasText: expected })).toHaveCount(1);
    await expect(page.locator('[data-testid=upgrade-password-page]')).toBeVisible();
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBe('1');
    expect(stored.tm_token).toBeNull();
    expect(page.url()).toMatch(/\/upgrade-password/);
  });
});
