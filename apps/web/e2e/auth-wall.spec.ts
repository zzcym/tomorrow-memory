import { expect, test, type Page } from '@playwright/test';
import { countOf, mockTrpc, sharedCopyPattern, sharedErrorCopy, trpcError } from './helpers';

/**
 * T-16「Web 登录墙拆除与凭据交互」——`§10.2` T-16 行的判据 ①②③④⑤⑥⑧⑨。
 * 判据⑦（强制改密门禁）与 §10.2 风险栏点名的"未命中门禁时 upgrade-gate 零副作用"在
 * 姊妹文件 `e2e/upgrade.spec.ts`。
 *
 * ## T-16r3（批次4D，本轮）改了三处装配错，判据方向一字未动
 *  1. **打桩层换成 `e2e/helpers.ts` 的 `mockTrpc` + `trpcError`**（与 `study.spec.ts` / `profile.spec.ts`
 *     同一把尺子）。本文件原来的私有 `err()` 少一位 tRPC v11 的**数字协议码** `error.code`
 *     ⇒ `isTRPCErrorResponse()` 判假 ⇒ `TRPCClientError.data` 为 `undefined` ⇒ 页面 `tmCodeOf()`
 *     只得 `undefined` ⇒ **"服务端码 → 页面翻译"那一面根本没被判到**（T-15r2c §U-1 已把同一件
 *     在 `helpers.ts` 修好，本轮把本文件接上去）。顺带得到 helpers 那层的**批量多过程**解包
 *     （`httpBatchLink` 会把同帧的两条查询并成一个 `/trpc/a,b?batch=1`，私有桩会把整批判失败）。
 *  2. **弹窗改"轮询广播"**：`page.goto()` 只等到 `load`，而 `header.tsx`/`login-dialog.tsx` 的监听器
 *     挂在水合之后 ⇒ 一次 `dispatchEvent` 有相当概率打水漂（这正是"红绿交替"的来源：同一份代码
 *     在 375 档绿、1280 档红）。现在 `openDialog()` 重复广播直到弹窗在场，事件名与 `detail`
 *     形状一字未改（仍是 `requestLogin()` 那一条线，`lib/auth.ts:47/:301`）。
 *  3. **T-28 把 X-1/P-5 的采用侧接完，"分页记账 + annotations 豁免"通道随即关闭**：
 *     `app/(user)/` 下 6 个受保护页全部套上 `<AuthGate>`（`study`/`report`/`chat`/`assess`/`profile`
 *     用默认 `LoginWall`，`/wordbook` 以 `wall=` 传 §3.6.5 行 3 的既有引导卡），原先写死在
 *     `report` / `chat` / `assess` 三页里的 `请先登录后…` 与**产品同一轮删除**（缺陷 F-20 的收口方式
 *     是"产品与期望同轮动"，不留假绿窗口）⇒ 判据① 现在对**全部六页**逐帧判 0 命中。
 *
 * ## 三条装配前提（读这套用例的关键）
 *  1. **跑法**：`pnpm --filter @tm/web exec playwright test e2e/auth-wall.spec.ts`。
 *     配置文件全仓只有一份 `apps/web/playwright.config.ts`（A-30-6 由 E2 占位、T-22/T-23 维护），
 *     本任务**不再造第二份**；两个 project（375×667 / 1280×900）会自动各跑一遍。
 *  2. **不需要真后端**：服务端交互全部由 `page.route` 挂在 `/trpc/` 前缀上接管（`next.config.ts`
 *     的 rewrites 会把 `/trpc` 转给 :3001，被拦在浏览器侧就打不出去），返回的是
 *     `@tm/server` 的 **tRPC v11 batch 线格式**（成功 `[{result:{data}}]`、失败
 *     `[{error:{message,data,code,json}}]`；`data.code` 就是 A-30-1 `errorFormatter` 提升上来的 §4.6 码，
 *     `data.httpStatus` 同处）。客户端读的正是那一个字段（`lib/api/auth.ts` 的 `tmCodeOf()`），
 *     用例因此不猜任何 message 串。
 *  3. **未打桩的过程**默认回 `NOT_FOUND` 而不是 `data:null`：T-12/T-15 名下的页面各自拉自己的
 *     查询，给 `null` 会让它们在自己的渲染里踩空（把页面 owner 的缺陷记到本任务账上），
 *     给错误只进 react-query 的 error 态；`NOT_FOUND` 不在 §4.6 两张表内 ⇒
 *     `credentialActionOf()` 必然 `undefined` ⇒ 不会误触发 `providers.tsx` 的凭据单点。
 *
 * ## 为什么弹窗用广播事件打开，而不是点顶栏那颗按钮
 * 登录弹窗全站唯一实例挂在 `components/header.tsx`（T-12 名下，本任务不改），它只监听事件名、
 * 不看 detail；`lib/auth.ts` 的 `requestLogin()` 做的事就是 `dispatchEvent(new CustomEvent(...))`。
 * 用例派发同一个事件 = 走 `requestLogin()` 那同一根线，不去断言别人文件里的按钮选择器。
 *
 * ## 禁词（判据⑧ 的运行时面）
 * 五个串按 §10.2 原文逐字查。第六个 `用验证码登录` **不逐字查**：PRD R-01⑤ / R-39⑨ 明令保留定稿
 * 标签 `使用验证码登录`（弹窗底部 12px 小字入口），而它含前者作子串 —— 这一条已由
 * `04-adjudications.md` **A-7** 裁为"改词表、不改定稿文案"，窄化为 `请用验证码登录` /
 * `改用验证码登录` 两句完整句式（`packages/shared/test/contracts.spec.ts:518` 钉着）。
 * 本用例按 A-7 的窄口径查那两句；全仓 grep 证据在 `04-dev-report-T-16.md` §3。
 */

/** `lib/auth.ts` 的七把键（键名是判据⑥⑦ 的断言对象，逐字取自该文件的私有常量）。 */
const KEYS = [
  'tm_token',
  'tm_user',
  'tm_upgrade_token',
  'tm_upgrade_required',
  'tm_upgrade_advisory',
  'tm_return_to',
  'tm_pending_action',
] as const;

/** 判据① 的归零对象 + 判据⑧ 的运行时面（同一趟 MutationObserver 记账，不跑两遍）。 */
const FORBIDDEN_IN_DOM = [
  '请先登录后',
  '忘记密码',
  '找回密码',
  '以后再说',
  '请用验证码登录',
  '改用验证码登录',
  '重新注册',
  '换手机号',
];

/** 成功项：`AuthResultSchema` 的五个必填键（可选键由调用方覆写）。 */
const ok = (data: Record<string, unknown> = {}) => ({
  result: {
    data: { token: 'tk-e2e', phone: '13800138000', hasPassword: true, nickname: '', avatar: '', ...data },
  },
});

/** 失败项：`data.code` = §4.6 码，`data.httpStatus` = A-30-1 提升的 HTTP 状态（两者都是客户端读点）。 */
const err = (message: string, code: string, httpStatus = 400) => trpcError(message, code, httpStatus);

/**
 * **无 §4.6 码**的失败项（判据⑥b 的对照组专用）：真服务端对"密码错/未注册"故意只回
 * `AUTH_COPY.wrongCredential` + 401（`auth-service.ts` 的 `wrongCredentialError()`，防账号枚举）。
 * 数字协议码 `code` 仍要给全 —— 少了它客户端连 `data.httpStatus` 都拿不到，
 * `isWrongCredential()`（`lib/api/auth.ts:111`：`httpStatus === 401 && 无 §4.6 码`）就永不成立。
 */
const bareError = (message: string, httpStatus: number) => {
  const body = { message, data: { httpStatus } };
  return { error: { ...body, code: httpStatus, json: { ...body } } };
};

/** 在应用自己的脚本之前铺 localStorage（每次导航都跑，覆盖 SSR → 水合那一帧）。 */
async function seedStorage(page: Page, values: Partial<Record<(typeof KEYS)[number], string>>): Promise<void> {
  const entries = Object.entries(values) as [string, string][];
  await page.addInitScript((pairs) => {
    for (const [key, value] of pairs) window.localStorage.setItem(key, value);
  }, entries);
}

/** 已登录会话（判据① 的前置；`hasPassword:true` = 不在门禁里的普通账号）。 */
const AUTHED: Partial<Record<(typeof KEYS)[number], string>> = {
  tm_token: 'tk-e2e',
  tm_user: JSON.stringify({ phone: '13800138000', nickname: '', avatar: '', hasPassword: true }),
};

/** 挂上"整段生命周期扫禁词"的观察器：判据① 的"中间态"三个字只有钉住每一帧才算可判真假。 */
async function watchForbiddenDom(page: Page): Promise<void> {
  await page.addInitScript((terms) => {
    const w = window as unknown as { __t16Hits: string[] };
    w.__t16Hits = [];
    const scan = (): void => {
      const text = document.body?.textContent ?? '';
      for (const term of terms) if (text.includes(term)) w.__t16Hits.push(term);
    };
    const start = (): void => {
      scan();
      new MutationObserver(scan).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }, FORBIDDEN_IN_DOM);
}

/** 每导航一次重新计一遍禁词命中（`addInitScript` 每次导航都跑 ⇒ `__t16Hits` 也重新归零）。 */
const hits = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __t16Hits?: string[] }).__t16Hits ?? []);

/**
 * 派发 `requestLogin()` 的那一个事件（顶栏那颗按钮的本质），并等到弹窗可见。
 *
 * ⚠ 事件**广播一次会打水漂**：`page.goto()` 只等到 `load`，而监听器（`header.tsx:43` 与
 * `login-dialog.tsx:100`）挂在 React 水合之后 ⇒ 早于水合的那次广播无人接收，而
 * `toBeVisible()` 的自动重试只等 DOM、不会重发事件。这就是本轮之前"同一份代码 375 档绿、
 * 1280 档红"的唯一来源 ⇒ 改成"重复广播直到弹窗在场"（事件名与 `detail` 形状一字未改）。
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

const storageSnapshot = (page: Page): Promise<Record<string, string | null>> =>
  page.evaluate((keys) => {
    const out: Record<string, string | null> = {};
    for (const key of keys) out[key] = window.localStorage.getItem(key);
    return out;
  }, [...KEYS]);

/** 手机号输入框里回填的**数字**（`formatPhoneForDisplay()` 会按 3-4-4 加空格，不能逐字比 value）。 */
const phoneDigits = (page: Page): Promise<string> =>
  page
    .locator('[data-testid=login-dialog-form] [data-testid=field-phone] input')
    .inputValue()
    .then((v) => v.replace(/\D/g, ''));

test.describe('T-16 登录墙与凭据交互', () => {
  /**
   * T-30（① 容量悬崖真修）：旧版在**一条用例**里顺序导航 6 页 ⇒ 实测 26.2s/30s 默认预算（87%），
   * 并发放大下单次 `page.goto` 可达秒级 ⇒ 一次翻页就把预算吃穿。拆成**每页一条用例**（1 导航/条），
   * 断言 1:1 原样搬移（见 04-dev-report-T-30.md §2 的对表），describe 逐字保留旧用例标题与
   * R-23② 标记 ⇒ 全名（外层 describe + 本层 + 叶）仍含判据出处。
   * 每叶各自重跑 `watchForbiddenDom` / `seedStorage(AUTHED)` / `mockTrpc` 前置：
   * 三者都是"每用例新 page 挂一次"的幂等装配（`addInitScript` 本来就是每次导航重新归零），
   * 跨页累加记账的旧口径在拆后不存在，观察器语义不变。
   *
   * T-28 采用侧已接线 ⇒ 原 `MECHANISM_PAGES`/`NOT_ADOPTED` 的分账结构与 X-1 豁免通道**删除**：
   * 6 页全部套 `<AuthGate>`（`/wordbook` 传的是 §3.6.5 行 3 引导卡，非 `LoginWall`），
   * **每一页**都逐帧判 0 命中。
   * 已登录态 `<AuthGate>` 放行 children 且**不包壳** ⇒ 墙 / idle 骨架两个计数归零是
   * "内容已接管、无中间态残留"的正证，与采用与否无关的老断言在接线后仍然是对的判法。
   */
  const GATED_PAGES = ['/study', '/wordbook', '/report', '/chat', '/assess', '/profile'];
  test.describe('① 已登录进 6 个受保护页（逐页一条）：DOM 全程不出现"请先登录后…"，骨架屏不留存（R-23②）', () => {
    for (const path of GATED_PAGES) {
      test(`① 已登录进 ${path}：DOM 全程不出现"请先登录后…"，骨架屏不留存（R-23②）`, async ({ page }) => {
        await watchForbiddenDom(page);
        await seedStorage(page, AUTHED);
        await mockTrpc(page, {});

        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-testid=login-wall]')).toHaveCount(0);
        await expect(page.locator('[data-testid=auth-gate-skeleton]')).toHaveCount(0);
        await expect(page.locator('[data-testid=auth-gate][data-auth-status="idle"]')).toHaveCount(0);
        expect(await hits(page), `${path} 全程不许出现任何一条禁词（判据①，T-28 起六页同一把尺）`).toEqual([]);
      });
    }
  });

  /** 三句墙文案期望值现读 `@tm/shared` 的 `AUTH_COPY.wall.*`（与用例③ 对 `emptySignedOut` 同一手法 ⇒ 页面自造口径必红）。 */
  const wallCopy = () => ({
    titleRe: sharedCopyPattern(/wall:\s*\{[^}]*?title:\s*'([^']+)'/, 'AUTH_COPY.wall.title'),
    subtitleRe: sharedCopyPattern(/wall:\s*\{[^}]*?subtitle:\s*'([^']+)'/, 'AUTH_COPY.wall.subtitle'),
    primaryRe: sharedCopyPattern(/wall:\s*\{[^}]*?primary:\s*'([^']+)'/, 'AUTH_COPY.wall.primary'),
  });

  /**
   * T-30（①b 容量悬崖真修）：旧版一条用例导航 6 次（5 个墙页循环 + 键盘面再进 `/study`）。
   * 拆为**每墙页一条**（1 导航）+ **键盘面独立一条**（1 导航），断言 1:1 原样搬移；
   * describe 逐字保留旧用例标题与 R-23①③④ 标记。游客态无 `seedStorage` 前置（与旧版同口径：
   * 未铺任何键 ⇒ AuthGate 判 guest）。
   */
  test.describe('①b T-28 采用面：游客进 5 个默认墙页必见 LoginWall、水合后无 idle 骨架残留；墙上主按钮 Tab 可达 + Enter 开弹窗（R-23①③④）', () => {
    for (const path of ['/study', '/report', '/chat', '/assess', '/profile']) {
      test(`①b 游客进 ${path}：必见 LoginWall、水合后无 idle 骨架残留、禁词 0 命中（R-23①③④）`, async ({ page }) => {
        await watchForbiddenDom(page);
        await mockTrpc(page, {});
        const { titleRe, subtitleRe, primaryRe } = wallCopy();

        await page.goto(path);
        const gate = page.locator('[data-testid=auth-gate][data-auth-status="guest"]');
        await expect(gate, `${path} 游客必见墙（这是 T-28 接线后的新期望，取代旧"计数 0"的缺陷背书）`).toBeVisible();
        await expect(gate.locator('[data-testid=login-wall]')).toHaveCount(1);
        await expect(gate.getByText(titleRe)).toBeVisible();
        await expect(gate.getByText(subtitleRe)).toBeVisible();
        // 判据③ 两出口：主按钮 + 文字链（`没有账号？注册` = `SWITCH_TO_REGISTER_LABEL` 同一声明点，见用例③ 注）
        await expect(gate.getByRole('button', { name: primaryRe })).toBeVisible();
        await expect(gate.getByRole('button', { name: '没有账号？注册' })).toBeVisible();
        // 态未定不留存：水合完成后 idle 骨架必须归零
        await expect(page.locator('[data-testid=auth-gate-skeleton]')).toHaveCount(0);
        await expect(page.locator('[data-testid=auth-gate][data-auth-status="idle"]')).toHaveCount(0);
        expect(await hits(page), `${path} 游客帧同样不许出现任何一条禁词（判据① 对游客也成立）`).toEqual([]);
      });
    }

    test('①b 键盘面：墙上主按钮 Tab 可达 + Enter 开弹窗（R-23①③④）', async ({ page }) => {
      await watchForbiddenDom(page);
      await mockTrpc(page, {});
      const { primaryRe } = wallCopy();

      // aria/键盘面：真实 Tab 走焦（不 focus() 抄近路）到墙上主按钮 —— `EmptyState` primary 槽是原生 <button>，
      // 且 `BUTTON` 类自带 `focus-visible:outline-2 focus-visible:outline-focus`（§7.1 焦点可见）。
      await page.goto('/study');
      const wall = page.locator('[data-testid=login-wall]');
      await expect(wall).toBeVisible();
      const primaryHandle = await wall.getByRole('button', { name: primaryRe }).elementHandle();
      expect(primaryHandle).not.toBeNull();
      let reached = false;
      for (let i = 0; i < 40 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate((el) => el === document.activeElement, primaryHandle);
      }
      expect(reached, '墙上的"手机号登录"主按钮必须能只靠 Tab 从文档开头走到（键盘不是二等公民）').toBe(true);
      await expect
        .poll(
          async () => {
            await page.keyboard.press('Enter');
            return (await page.locator('[data-testid=login-dialog]').count()) > 0;
          },
          { timeout: 20_000, intervals: [200, 400, 800, 1200] },
        )
        .toBe(true);
      await expect(page.locator('[data-testid=login-dialog-form]')).toHaveAttribute('data-mode', 'sign-in');
    });
  });

  test('② 弹窗默认密码模式 + 默认焦点在密码框（document.activeElement，R-01⑤）', async ({ page }) => {
    await mockTrpc(page, {});
    await page.goto('/');
    await openDialog(page);

    const form = page.locator('[data-testid=login-dialog-form]');
    await expect(form).toHaveAttribute('data-mode', 'sign-in');
    // 登录态没有确认密码框；可交互元素 = 手机号 / 密码 / 显示密码 / 主按钮 + 切换链（≤5，R-39⑨）
    await expect(form.locator('[data-testid=field-confirm]')).toHaveCount(0);
    await expect(form.locator('[data-testid=field-password] input')).toHaveCount(1);

    const focusOnPassword = await page.evaluate(() =>
      document.activeElement === document.querySelector('[data-testid=field-password] input'),
    );
    expect(focusOnPassword).toBe(true);
    // 登录态不给勾选框（A-23-5 定稿），合规诉求由底部那句 `AUTH_COPY.agreementSignInNote` 承担
    await expect(form.locator('[data-testid=agreement]')).toHaveCount(0);
    await expect(page.locator('[data-testid=login-agreement-note]')).toHaveCount(1);
  });

  test('③ 游客进 /wordbook：可读引导 + "手机号登录"主按钮 + "没有账号？注册"文字链（R-23①③）', async ({
    page,
  }) => {
    await watchForbiddenDom(page);
    await mockTrpc(page, {});
    await page.goto('/wordbook');

    /**
     * **本轮改的是落点，不是判据**。`/wordbook` 的采用侧（T-15 名下 `app/(user)/wordbook/page.tsx:169-188`）
     * 用的是 `EmptyState` + `WORDBOOK_COPY.emptySignedOut.*`，并没有套 T-16 的 `<LoginWall>`
     * （全站 `LoginWall` 采用数仍为 0 ⇒ 同一处 X-1）⇒ 原来那三行 `[data-testid=login-wall]`
     * 判的是"别人还没接线的那颗 testid"，与判据③ 要的"游客看得见什么"无关。
     * 这里按 role / 可及名 / 文本判，三句期望值**现读 `@tm/shared`**（页面自造口径必红）。
     * 那颗第二出口在产品里是 link 样式的 `<button>`（`EmptyState` 的 `link` 槽），A-41 #61 不许为
     * 测试改 DOM ⇒ 只按可及名判，不锁 tag。`.first()`：登录卡的"重复同文链"正由**并发轮**在删
     * （简报登记），本任务不追那条方向。
     */
    const main = page.locator('main');
    const wallTitle = sharedCopyPattern(/emptySignedOut:[^}]*?title:\s*'([^']+)'/, 'WORDBOOK_COPY.emptySignedOut.title');
    const wallSubtitle = sharedCopyPattern(/emptySignedOut:[^}]*?subtitle:\s*'([^']+)'/, 'WORDBOOK_COPY.emptySignedOut.subtitle');
    const wallCta = sharedCopyPattern(/emptySignedOut:[^}]*?cta:\s*'([^']+)'/, 'WORDBOOK_COPY.emptySignedOut.cta');
    await expect(main.getByText(wallTitle)).toBeVisible();
    await expect(main.getByText(wallSubtitle)).toBeVisible();
    // 「没有账号？注册」= `copy.ts:41` 的 `SWITCH_TO_REGISTER_LABEL`（与登录墙/弹窗切换链同一声明点）
    await expect(main.getByRole('button', { name: '没有账号？注册' }).first()).toBeVisible();

    const primary = main.getByRole('button', { name: wallCta }).first();
    await expect(primary).toBeVisible();
    // 墙上的主按钮就是"打开弹窗"这一个动作，不另起页面、不换路由
    // （点击也在水合竞态里 ⇒ 与 `openDialog()` 同法：重试到弹窗在场为止）
    await expect
      .poll(
        async () => {
          await primary.click();
          return (await page.locator('[data-testid=login-dialog]').count()) > 0;
        },
        { timeout: 20_000, intervals: [200, 400, 800, 1200] },
      )
      .toBe(true);
    await expect(page.locator('[data-testid=login-dialog-form]')).toHaveAttribute('data-mode', 'sign-in');
    expect(page.url()).toMatch(/\/wordbook/);
    expect(await hits(page)).toEqual([]);
  });

  test('④ 登录成功：写凭据 → 回跳原页 → 续作待收藏，两个一次性键随即腾空（R-16②/R-39⑧）', async ({ page }) => {
    const calls = await mockTrpc(page, {
      'auth.login': () => ok(),
      'wordbook.add': () => ({ result: { data: { ok: true } } }),
    });
    // 登记侧由墙面 `pendingAction` / 首页星标写入；本用例钉的是 T-16 名下的"执行侧"
    await seedStorage(page, {
      tm_return_to: '/wordbook',
      tm_pending_action: JSON.stringify({ kind: 'favorite', word: 'apple' }),
    });
    await page.goto('/');
    await openDialog(page);

    const form = page.locator('[data-testid=login-dialog-form]');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('strong-password-8');
    await form.locator('[data-testid=auth-submit]').click();

    await expect(page).toHaveURL(/\/wordbook/);
    await expect(page.locator('[data-testid=login-dialog]')).toHaveCount(0);
    const stored = await storageSnapshot(page);
    expect(stored.tm_token).toBe('tk-e2e');
    expect(JSON.parse(String(stored.tm_user)).phone).toBe('13800138000');
    expect(stored.tm_return_to).toBeNull();
    expect(stored.tm_pending_action).toBeNull();
    expect(countOf(calls, 'auth.login')).toBeGreaterThanOrEqual(1);
    expect(countOf(calls, 'wordbook.add')).toBeGreaterThanOrEqual(1);
  });

  test('⑤ NO_PASSWORD_ACCOUNT：固定文案 + 可点"设置密码激活"→ 切注册态并保留手机号（R-01④/R-39⑤b）', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, {
      'auth.login': () => err('该手机号还没设置过密码', 'NO_PASSWORD_ACCOUNT', 401),
    });
    await page.goto('/');
    await openDialog(page);

    const form = page.locator('[data-testid=login-dialog-form]');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('strong-password-8');
    await form.locator('[data-testid=auth-submit]').click();

    const card = page.locator('[data-testid=auth-notice-card]');
    await expect(card).toBeVisible();
    await expect(card.getByText('这个手机号还没设置过密码')).toBeVisible();
    // 正文 = `TM_ERRORS.NO_PASSWORD_ACCOUNT.copy`（组件里零复制），只钉"是人话、不是 500/请求失败"
    await expect(card.locator('[data-slot=notice-body]')).not.toHaveText(/请求失败|Internal|500/);

    await card.getByRole('button', { name: '设置密码激活' }).click();
    await expect(form).toHaveAttribute('data-mode', 'register');
    await expect(form).toHaveAttribute('data-activate', 'true');
    expect(await phoneDigits(page)).toBe('13800138000');
    await expect(form.locator('[data-testid=field-confirm]')).toHaveCount(1);
    // 这一支**不得**清凭据、不得跳页（对照判据⑥）：把人留在登录流程里才是 R-01④ 的出路
    await expect(page.locator('[data-testid=login-dialog]')).toBeVisible();
    expect(countOf(calls, 'auth.login')).toBe(1);
  });

  test('⑥ 401 CREDENTIAL_EXPIRED：清 localStorage + 进登录 + 一句人话提示（全站唯一处理点）', async ({ page }) => {
    await mockTrpc(
      page,
      {},
      () => err('服务端塞给旧客户端的那句', 'CREDENTIAL_EXPIRED', 401),
    );
    await seedStorage(page, AUTHED);
    await page.goto('/wordbook');

    await expect(page.locator('[data-testid=login-dialog]')).toBeVisible();
    const stored = await storageSnapshot(page);
    expect(stored.tm_token).toBeNull();
    expect(stored.tm_user).toBeNull();
    // 只清正常凭据，不顺手造门禁位（那是 403 那一支的动作，两支不得混）
    expect(stored.tm_upgrade_required).toBeNull();
    expect(stored.tm_upgrade_token).toBeNull();
    // 屏幕上那句必须是 `@tm/shared` 的定稿文案（`providers.tsx:60` 走的正是 `TM_ERRORS.copy`）。
    // ⚠ 定稿值是 `密码已修改，请重新登录`（`errors.ts:130`，R-40③ 的语义）—— 本用例原先硬编码的
    //    `登录状态已过期，请重新登录` 是**桩里的自造串**，页面永远不可能渲染它 ⇒ 期望值改为现读真源。
    await expect(page.getByText(sharedErrorCopy('CREDENTIAL_EXPIRED')).first()).toBeVisible();
  });

  test('⑥b 对照组：密码错（服务端故意不给 §4.6 码，防枚举）不清凭据，只给 R-23④ 的可点提示', async ({ page }) => {
    await mockTrpc(page, { 'auth.login': () => bareError('手机号或密码不正确', 401) });
    await page.goto('/');
    await openDialog(page);

    const form = page.locator('[data-testid=login-dialog-form]');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('wrong-password-1');
    await form.locator('[data-testid=auth-submit]').click();

    const hint = page.locator('[data-testid=auth-unregistered-hint]');
    await expect(hint).toBeVisible({ timeout: 20_000 });
    await expect(hint).toHaveText(sharedCopyPattern(/unregistered:\s*'([^']+)'/, 'AUTH_COPY.unregistered'));
    await expect(page.locator('[data-testid=login-dialog]')).toBeVisible();
    // 点提示 → 同弹窗切注册态、手机号保留（不新增页面、不改路由，R-39⑨）
    await hint.click();
    await expect(form).toHaveAttribute('data-mode', 'register');
    expect(await phoneDigits(page)).toBe('13800138000');
  });

  /**
   * 判据⑥ 的**变更侧**：`providers.tsx` 的 `QueryCache` 与 `MutationCache` 共用同一个
   * `handleCredentialError()`（`:106-113`），"全站唯一处理点"这句话今天只被查询侧判到（⑥ 走的
   * 是页面加载时的查询）。本用例补的是**另一扇门**：写操作（改密 mutation）回 401
   * `CREDENTIAL_EXPIRED` 时同样清凭据 + 进登录 + 给同一句人话，且**不出现第二个提示点**
   * （页面自己不得再 `catch` 一次 —— 那正是"单点"两个字的反面）。
   */
  test('⑥c 变更侧同一单点：改密 mutation 回 401 CREDENTIAL_EXPIRED 也清凭据 + 进登录（查询/变更两扇门同一点）', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, {
      'profile.get': () => ok({ nickname: 'e2e 用户', phone: '13800138000', avatar: '', daily_goal: 20 }),
      'checkin.status': () => ok({ checkedIn: false, doneToday: 0, dueToday: 0, streak: 0 }),
      'auth.changePassword': () => err('该凭据已不可用', 'CREDENTIAL_EXPIRED', 401),
    });
    await seedStorage(page, AUTHED);
    await page.goto('/profile/security');

    await page.locator('input[name=oldPassword]').fill('RightPass123');
    await page.locator('input[name=newPassword]').fill('abcdefgh');
    await page.locator('input[name=confirmPassword]').fill('abcdefgh');
    await page.getByTestId('password-submit').click();
    await expect.poll(() => countOf(calls, 'auth.changePassword'), { timeout: 20_000 }).toBe(1);

    // 同一单点的三个可观察结果：清正常凭据、把弹窗推上来、给那句定稿人话
    await expect(page.locator('[data-testid=login-dialog]')).toBeVisible({ timeout: 20_000 });
    const stored = await storageSnapshot(page);
    expect(stored.tm_token).toBeNull();
    expect(stored.tm_user).toBeNull();
    await expect(page.getByText(sharedErrorCopy('CREDENTIAL_EXPIRED')).first()).toBeVisible();
    // 单点=只此一处：门禁两位不得被这一支顺手置上（那是 403 那一支的动作）
    expect(stored.tm_upgrade_required).toBeNull();
    expect(stored.tm_upgrade_token).toBeNull();
  });

  test('⑦b 403 PASSWORD_UPGRADE_REQUIRED：由凭据单点置标志位并换到改密页（页面自己不管这一码）', async ({
    page,
  }) => {
    await mockTrpc(
      page,
      {},
      () => err('需要先更新密码才能继续使用', 'PASSWORD_UPGRADE_REQUIRED', 403),
    );
    await seedStorage(page, AUTHED);
    await page.goto('/wordbook');

    await expect(page).toHaveURL(/\/upgrade-password/, { timeout: 20_000 });
    const stored = await storageSnapshot(page);
    expect(stored.tm_upgrade_required).toBe('1');
    // 置位的同时不把人踢成游客（正常 token 由服务端策略决定，单点不自己清；清凭据是 401 那一支）
    expect(stored.tm_token).toBe('tk-e2e');
  });

  test('⑧ 关于页 + 弹窗两态 + 业务页：运行时 0 命中禁词（判据⑧ 的运行时面，全仓 grep 见报告 §3）', async ({
    page,
  }) => {
    await watchForbiddenDom(page);
    await mockTrpc(page, { 'auth.register': () => ok() });

    await page.goto('/about'); // 未登录可读（R-01⑧），服务端组件
    await expect(page.locator('[data-testid=about-page]')).toHaveCount(1);
    await expect(page.locator('[data-testid=about-rows-terms] li').first()).toBeVisible();

    await page.goto('/');
    await openDialog(page); // 登录态
    await page.locator('[data-testid=auth-switch]').click(); // → 注册态（含 12px 验证码小字入口）
    await expect(page.locator('[data-testid=login-dialog-form]')).toHaveAttribute('data-mode', 'register');
    await expect(page.locator('[data-testid=auth-footer]')).toBeVisible();

    await seedStorage(page, AUTHED);
    await page.goto('/study');
    await page.waitForLoadState('networkidle');
    expect(await hits(page)).toEqual([]);
  });

  test('⑨ 注册态未勾协议：主按钮禁用、点击一次请求都不发并给 AGREEMENT_REQUIRED 人话（R-39②⑨）', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, { 'auth.register': () => ok() });
    await page.goto('/');
    await openDialog(page, { mode: 'register' });

    const form = page.locator('[data-testid=login-dialog-form]');
    await expect(form).toHaveAttribute('data-mode', 'register');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('strong-password-8');
    await form.locator('[data-testid=field-confirm] input').fill('strong-password-8');

    const submit = form.locator('[data-testid=auth-submit]');
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await submit.click({ force: true });

    const agreementError = form.locator('[data-slot=agreement-error]');
    await expect(agreementError).toBeVisible();
    await expect(agreementError).toHaveText('请先阅读并同意《用户协议》《隐私政策》');
    expect(countOf(calls, 'auth.register')).toBe(0);

    // 勾上即解禁，且刚填的内容不重录（切换与禁用的代价不该转嫁给用户）
    await form.locator('[data-testid=agreement] [role=checkbox]').click();
    await expect(form.locator('[data-testid=agreement] [role=checkbox]')).toHaveAttribute('aria-checked', 'true');
    await expect(submit).not.toHaveAttribute('aria-disabled', 'true');
    await submit.click();
    await expect.poll(() => countOf(calls, 'auth.register'), { timeout: 20_000 }).toBe(1);
  });

  test('⑨b 服务端回 AGREEMENT_REQUIRED 时显示的是同一句人话，不出现"请求失败"式兜底', async ({ page }) => {
    await mockTrpc(page, {
      'auth.register': () => err('请先阅读并同意《用户协议》《隐私政策》', 'AGREEMENT_REQUIRED', 400),
    });
    await page.goto('/');
    await openDialog(page, { mode: 'register' });
    const form = page.locator('[data-testid=login-dialog-form]');
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('strong-password-8');
    await form.locator('[data-testid=field-confirm] input').fill('strong-password-8');
    await form.locator('[data-testid=agreement] [role=checkbox]').click();
    await form.locator('[data-testid=auth-submit]').click();

    // 同一句 `TM_ERRORS.AGREEMENT_REQUIRED.copy` 至少出现一次（`AuthFormShell` 目前会在勾选行下方与
    // 主按钮下方各渲染一次 —— 属 T-13 名下 `packages/ui`，本任务只消费不改，已登记报告 §6）
    await expect(form.getByText('请先阅读并同意《用户协议》《隐私政策》').first()).toBeVisible();
    await expect(form.getByText(/请求失败|500|Error/)).toHaveCount(0);
  });

  /**
   * T-16r5 新增的**正哨**（A-68 #192 明令："不许只靠点击成功间接证明"）：F-24 修的是容器，
   * 这一条判的就是那条几何契约本身 —— 注册态的协议勾选框与主按钮**整颗落在视口内、点得动**；
   * 内容高于视口时容器**必须能滚到底**（滚到底之后两颗控件仍在视口内）。
   *
   * 为什么必须单独一颗：⑧⑨⑨b 那三条只要求"点得到某个元素"，Playwright 的自动滚动一旦在
   * 新容器上生效，它们就会顺带转绿（这正是 F-24 此前的样子：容器没有滚动路径 ⇒
   * `element is outside of the viewport`）。本用例不猜，只量数：
   *  ① 容器自身的 `overflow-y` 必须是滚动路径（件 1 落点就在 `DialogContent` 这颗容器上）；
   *  ② 自然档位下容器的 `boundingBox()` 上下边都在视口内（"弹窗整体可见"这条几何契约）；
   *  ③ 把视口**压矮**到 400 高，让"内容高于视口"这一前提**被量出来**（`scrollHeight > clientHeight`）
   *     —— 实测注册态满格内容 632px：在 375×667 档它**并不**高于视口，前提要靠压矮视口制造，
   *     这是本轮对 A-68 #192 那句"内容高于视口"的如实更正（数字与结论见 T-16r5 报告 §② 件 1）；
   *  ④ 滚完之后 `scrollTop > 0` 且 `scrollTop + clientHeight >= scrollHeight - 1`（真到了底）、
   *     勾选框与主按钮的 `boundingBox()` 上下边都在视口内（可见的**几何**定义，不看 toBeVisible 的宽松判定）、
   *     最后真点一次：勾协议 → `aria-checked=true` → 主按钮可点 → `auth.register` 恰 1 次。
   * 两档都必须绿（不许只靠 1280 档绿间接证明）。
   *
   * 装配面：本条只新增 1 个 `test`、**0 行 import**、**零改动既有行**（A-50 #123 口径）。
   */
  test('⑨c F-24 正哨：注册态弹窗整颗在视口内；压矮视口后内容高于视口时可滚到底，滚到底后协议勾选框与主按钮在视口内且点得动', async ({ page }) => {
    const calls = await mockTrpc(page, { 'auth.register': () => ok() });
    await page.goto('/');
    await openDialog(page, { mode: 'register' });

    const form = page.locator('[data-testid=login-dialog-form]');
    await expect(form).toHaveAttribute('data-mode', 'register');
    // 三格填满 = 注册态最高的那一帧（协议勾选行与主按钮都在最下部，正是 375 档出界的那两个）
    await form.locator('[data-testid=field-phone] input').fill('13800138000');
    await form.locator('[data-testid=field-password] input').fill('strong-password-8');
    await form.locator('[data-testid=field-confirm] input').fill('strong-password-8');

    // 滚动容器 = `DialogContent` 自己（F-24 的修法就落在这颗容器上，不是内部某个 div）
    const dialog = page.locator('[data-testid=login-dialog]');
    const geometry = (): Promise<{
      scrollHeight: number;
      clientHeight: number;
      scrollTop: number;
      overflowY: string;
      top: number;
      bottom: number;
    }> =>
      dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
          overflowY: getComputedStyle(el).overflowY,
          top: box.top,
          bottom: box.bottom,
        };
      });

    const inViewport = async (what: string): Promise<void> => {
      const box = await dialog.boundingBox();
      const height = box?.height ?? 0;
      expect(box, `${what}：弹窗量不到包围盒`).not.toBeNull();
      expect(box!.y, `${what}：弹窗上边出界（top=${box!.y.toFixed(1)}）`).toBeGreaterThanOrEqual(-1);
      const viewportHeight = page.viewportSize()?.height ?? 0;
      expect(
        box!.y + height,
        `${what}：弹窗下边出界（bottom=${(box!.y + height).toFixed(1)} / 视口高 ${viewportHeight}）`,
      ).toBeLessThanOrEqual(viewportHeight + 1);
    };
    await inViewport('自然档位');

    // 件 1 的落点：容器自己要提供滚动路径
    const natural = await geometry();
    expect(['auto', 'scroll'], `overflow-y 实测 = ${natural.overflowY}`).toContain(natural.overflowY);

    // ③ 压矮视口 ⇒ 把"内容高于视口"这一前提量出来（而不是假设它成立）
    //    宽度沿用本档位（1280 档不降级成 375），只把高度压到 400
    const naturalSize = page.viewportSize();
    await page.setViewportSize({ width: naturalSize?.width ?? 375, height: 400 });
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const shrunk = await geometry();
    expect(shrunk.scrollHeight, `压矮后 scrollHeight=${shrunk.scrollHeight} / clientHeight=${shrunk.clientHeight}`).toBeGreaterThan(
      shrunk.clientHeight,
    );

    await dialog.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const after = await geometry();
    expect(after.scrollTop).toBeGreaterThan(0);
    expect(after.scrollTop + after.clientHeight).toBeGreaterThanOrEqual(after.scrollHeight - 1);
    await inViewport('压矮并滚到底之后');

    // 滚到底之后：两颗控件都在视口内（几何口径），并且真的点得动
    const checkbox = form.locator('[data-testid=agreement] [role=checkbox]');
    const submit = form.locator('[data-testid=auth-submit]');
    await expect(checkbox).toBeVisible();
    await expect(submit).toBeVisible();
    for (const [name, control] of [
      ['协议勾选框', checkbox],
      ['主按钮', submit],
    ] as const) {
      const box = await control.boundingBox();
      expect(box, `${name}：量不到包围盒`).not.toBeNull();
      expect(box!.y, `${name}：上边出界`).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height, `${name}：下边出界（bottom=${(box!.y + box!.height).toFixed(1)} / 视口高 ${viewportHeight}）`).toBeLessThanOrEqual(
        viewportHeight + 1,
      );
    }

    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(submit).not.toHaveAttribute('aria-disabled', 'true');
    await submit.click();
    await expect.poll(() => countOf(calls, 'auth.register'), { timeout: 20_000 }).toBe(1);
  });
});
