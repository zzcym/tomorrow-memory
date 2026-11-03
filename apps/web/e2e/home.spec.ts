import { expect, test } from '@playwright/test';

/**
 * T-12 首页外壳冒烟（判据 ①②③④ + §8.3-C 的 DOM 归零）。
 *
 * ⚠ 原头注写的"本机无 Playwright 内核 → 本文件尚未执行过"已作废：A-41 #45 装了 chromium、
 *    T-16r3（批次4D）把本文件**真跑**过两档视口（出口见 `04-dev-report-T-16-r3.md`）。
 *    跑法与其余 e2e 同一条：`pnpm --filter @tm/web exec playwright test e2e/home.spec.ts`
 *    （vitest 那份 `apps/web/test/home-shell.spec.tsx` 由根 `vitest.workspace.ts` 负责，两不相干）。
 *
 * 计数口径与 `03-ui-spec.md` §3.1.1 **完全一致**（聚合规则①②③，不放宽）：
 * `SearchBar` 输入框 + 框内提交 = 2、结果条「查看详情」+ 星标 = 1、喇叭 = 1。
 *
 * T-16r3（批次4D）修的是**本文件自己的三处装配错**（T-15r2c §U-5 登记，红因与实现无关）：
 *  ① `evaluate` 回调跑在**浏览器上下文**里，Node 侧的 `INTERACTIVE` / `aggregateCount()` 一律
 *    不可见 ⇒ `ReferenceError: INTERACTIVE is not defined`。现在选择器与聚合口径全部当
 *    **参数**传进去、回调体自包含 —— 与 `e2e/home-redline.spec.ts:47` 已验收的写法同一把尺子。
 *  ② 「最近查询」夹具原本一次写入 **24** 条：`@tm/shared` 的 `RecentSearchListSchema` 是
 *    `.max(RECENT_MAX=20)` ⇒ 超限**整批** `safeParse` 失败 ⇒ 面板 0 行 ⇒ 也就没有那颗「清空」。
 *    现在两条都钉：超限批次必须 0 行（硬指标由 schema 守），合法批次必须铺满 20 行。
 *  ③ 释义行的选择器 `[data-tm-result-gloss]` 在产品里**不存在**（`LookupResultBar` 零 `data-*`，
 *    而 A-41 #61 不许为测试往产品 DOM 加 `data-testid`）⇒ 改用它唯一的机器可辨身份：
 *    组件自带的高度钳制类 `line-clamp-*`（`packages/ui/src/patterns/LookupResultBar.tsx:195-199`）。
 */

/** §3.1.1 聚合口径要用到的三把选择器。**只在 Node 侧留字符串**，计数在浏览器上下文里算。 */
const INTERACTIVE = 'a[href],button,input,textarea,select,[role="button"],[tabindex]:not([tabindex="-1"])';
const SEARCH_SUBMIT = 'button[data-tm-search-submit]';
const RESULT_ACTIONS = '[data-tm-result-actions]';

/** 一次写进 `localStorage` 的最近查询条数（`> RECENT_MAX` 与 `= RECENT_MAX` 两种批次都要跑）。 */
const RECENT_BATCHES = { overCap: 24, atCap: 20 };

/** 组装一条合法的最近查询记录（字段逐字照 `RecentSearchItemSchema`：word/direction/gloss/at）。 */
function recentItem(i: number): { word: string; direction: string; gloss: string; at: number } {
  return { word: `word${i}`, direction: 'en2zh', gloss: 'g', at: Date.now() - i * 1000 };
}

/** 写最近查询到 `localStorage`（`RECENT_SEARCHES_KEY` 逐字取自 `@tm/ui/hooks/use-recent-searches.ts:13`）。 */
async function seedRecents(page: import('@playwright/test').Page, count: number): Promise<void> {
  await page.evaluate((items) => {
    window.localStorage.setItem('tm:recent-searches', JSON.stringify(items));
  }, Array.from({ length: count }, (_, i) => recentItem(i)));
}

test.describe('T-12 首页与移动导航', () => {
  test('① 未查询态 home-root 可交互元素 ≤5（实测 3）+ §8.3-C 五项 DOM 归零', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('[data-testid=home-root]');
    await expect(root).toHaveCount(1);
    const counted = await root.evaluate(
      (el, selectors) => {
        const nodes = Array.from(el.querySelectorAll(selectors.all));
        const searchInputs = nodes.filter((n) => n.matches('input')).length;
        const searchSubmit = nodes.filter((n) => n.matches(selectors.searchSubmit)).length;
        const barActions = nodes.filter((n) => n.matches(`${selectors.resultActions} *`)).length;
        const aggregated =
          nodes.length -
          Math.min(searchInputs, 1) -
          Math.min(searchSubmit, 1) -
          Math.max(barActions - 1, 0) +
          (searchInputs ? 1 : 0) +
          (searchSubmit ? 1 : 0);
        return { count: nodes.length, aggregated };
      },
      { all: INTERACTIVE, searchSubmit: SEARCH_SUBMIT, resultActions: RESULT_ACTIONS },
    );
    expect(counted.count).toBeLessThanOrEqual(5);
    expect(counted.aggregated).toBeLessThanOrEqual(5);
    for (const sel of [
      '[data-testid=home-direction-buttons]',
      '[data-testid=home-history-chips]',
      '[data-testid=home-empty-graycard]',
      '[data-testid=wordbook-sidebar]',
      '[data-testid=home-ai-card]',
    ]) {
      await expect(page.locator(sel)).toHaveCount(0);
    }
  });

  test('② 375px：底部 5 tab 可点 + 当前项 aria-current + 100dvh 不遮输入框', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const tabs = page.locator('[data-testid=mobile-nav] a');
    await expect(tabs).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) await expect(tabs.nth(i)).toBeVisible();
    await expect(page.locator('[data-testid=mobile-nav] a[href="/"]').first()).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-testid=mobile-nav] a[href="/wordbook"]')).toHaveCount(1);

    // 顶栏「更多」抽屉含 chat / assess
    await page.locator('header button[aria-label=更多]').first().click();
    const drawer = page.locator('[data-testid=more-menu]');
    await expect(drawer.locator('a[href="/chat"]')).toBeVisible();
    await expect(drawer.locator('a[href="/assess"]')).toBeVisible();

    // 聚焦输入框后底边不被底 tab 遮住（未弹键盘时的最小要求：输入框完整可见）
    const input = page.locator('[data-testid=home-search] input');
    await input.focus();
    await expect(input).toBeInViewport();
  });

  test('③ 最近查询仅在聚焦时出现（未聚焦 DOM 高度 0），≤20 条，清空需二次确认', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-testid=home-recent-panel]');
    await expect(panel).toHaveCount(0);
    // 超上限那一批：`RecentSearchListSchema.max(20)` 整批拒收 ⇒ 面板仍浮出，但一行都不给
    //（"≤20 条"这条硬指标是 schema 守的，页面拿不到第 21 条的机会）。
    await seedRecents(page, RECENT_BATCHES.overCap);
    await page.reload();
    await page.locator('[data-testid=home-search] input').focus();
    await expect(panel).toBeVisible();
    expect(await panel.locator('li').count()).toBe(0);

    // 合法批次（正好铺满上限）：这一次才真有行可数，也才有那颗「清空」。
    await seedRecents(page, RECENT_BATCHES.atCap);
    await page.reload();
    await page.locator('[data-testid=home-search] input').focus();
    await expect(panel).toBeVisible();
    const rows = await panel.locator('li').count();
    expect(rows).toBeLessThanOrEqual(20);
    expect(rows).toBe(RECENT_BATCHES.atCap);
    await panel.getByRole('button', { name: '清空' }).click();
    await expect(page.getByText('清空最近查询？')).toBeVisible();
    await page.getByRole('button', { name: '清空', exact: true }).last().click();
    await expect(panel).toHaveCount(0);
  });

  test('④ 结果条精简：词 + 音标 + 喇叭 + 词性首义 + 星标 + 查看详情，且无 AI 卡/例句', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid=home-search] input').fill('happy');
    await page.keyboard.press('Enter');
    const bar = page.locator('[data-testid=home-result-bar]');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: /查看 happy 的完整释义/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /朗读 happy/ })).toBeVisible();
    await expect(bar.getByRole('button', { name: /收藏 happy/ })).toBeVisible();
    // 释义行：`LookupResultBar` 那一 `<span>` 零 `data-*`（A-41 #61 不许为测试往产品 DOM 加 testid），
    // 它唯一的机器可辨身份就是组件自带的高度钳制类 `line-clamp-2 max-md:line-clamp-1`。
    // 行数在**浏览器上下文**里量（回调自包含，不引用 Node 侧变量 —— 同 §U-5 那一课）。
    const lines = await bar.locator('span[class*="line-clamp"]').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight));
    });
    expect(lines).toBeLessThanOrEqual(2);
  });

  test('⑤ 首页无裸 fetch（构建产物 + 运行时拦截）', async ({ page }) => {
    let called = 0;
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = (...args: Parameters<typeof fetch>) => {
        if (typeof args[0] === 'string' && !args[0].includes('/trpc')) called += 1;
        return original(...args);
      };
    });
    await page.goto('/');
    await page.locator('[data-testid=home-search] input').fill('apple');
    await page.keyboard.press('Enter');
    expect(called).toBe(0);
  });
});
